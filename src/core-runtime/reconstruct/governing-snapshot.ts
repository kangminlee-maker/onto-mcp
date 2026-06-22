import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructRunAdmittedDomainCompetencySnapshot,
  ReconstructRunCompetencyIdMigrationMapping,
  ReconstructPostSeedValidationViolation,
  ReconstructRunGoverningSnapshot,
  ReconstructRunSnapshotFamily,
  ReconstructSelectedSourceProfileRef,
} from "./artifact-types.js";
import {
  resolveRegistryRef,
  type ReconstructContractRegistry,
  type ReconstructDomainCompetencyAdmissionPolicy,
  type ReconstructValidatorRecord,
} from "./contract-registry.js";
import {
  isPathInsideRoot,
} from "../path-boundary.js";
import {
  assertReconstructDomainId,
} from "./domain-id.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function sha256File(filePath: string): Promise<string> {
  return sha256Text(await fs.readFile(filePath, "utf8"));
}

function projectRootFromRegistryPath(registryPath: string): string {
  return path.resolve(path.dirname(registryPath), "../../..");
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nestedArray(raw: unknown, keys: string[]): unknown[] {
  let cursor = raw;
  for (const key of keys) {
    if (!isRecord(cursor)) return [];
    cursor = cursor[key];
  }
  return arrayValue(cursor);
}

function nestedValue(raw: unknown, keys: string[]): unknown {
  let cursor = raw;
  for (const key of keys) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }
  return cursor ?? null;
}

function idValues(records: unknown[], key: string): string[] {
  return records
    .map((record) => isRecord(record) && typeof record[key] === "string"
      ? record[key]
      : null)
    .filter((value): value is string => value !== null)
    .sort();
}

function recordStringMap<T>(args: {
  records: T[];
  id: (record: T) => string;
  value: (record: T) => string;
}): Record<string, string> {
  return Object.fromEntries(
    [...args.records]
      .sort((left, right) => args.id(left).localeCompare(args.id(right)))
      .map((record) => [args.id(record), args.value(record)]),
  );
}

function selectedSnapshotId(record: unknown): string {
  return `registry-row-sha256:${sha256Text(stableJson(record))}`;
}

function selectedPatternCatalogCanonicalUri(patternCatalogRefId: string): string {
  return `urn:onto-mcp:reconstruct:pattern-catalog:${patternCatalogRefId}`;
}

function hasStringValueForEveryId(record: unknown, ids: string[]): boolean {
  if (!isRecord(record)) return false;
  return ids.every((id) => typeof record[id] === "string" && record[id].trim().length > 0);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function parseCompetencyQuestions(text: string): Array<{
  competency_id: string;
  priority: string;
  question: string;
  section_heading: string | null;
  inference_path: string;
  verification_criteria: string;
  source_anchor: string;
}> {
  const rows: Array<{
    competency_id: string;
    priority: string;
    question: string;
    section_heading: string | null;
    inference_path: string;
    verification_criteria: string;
    source_anchor: string;
  }> = [];
  const lines = text.split(/\r?\n/);
  let sectionHeading: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^##\s+(.+?)\s*$/.exec(lines[index] ?? "");
    if (heading?.[1]) {
      sectionHeading = heading[1].trim();
      continue;
    }
    const match =
      /^-\s+\*\*(CQ-[A-Z0-9]+(?:-[A-Z0-9]+)*)\*\*\s+\[(P[123])\]\s+(.+?)\s*$/
        .exec(lines[index] ?? "");
    if (!match?.[1] || !match[2] || !match[3]) continue;
    const detailLines: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] ?? "";
      if (/^- \*\*CQ-[A-Z0-9]+/.test(line) || /^##\s+/.test(line)) break;
      detailLines.push(line.trim());
    }
    const detailText = detailLines.join("\n");
    const inferencePath =
      /-\s+Inference path:\s*([\s\S]*?)(?:\n-\s+Verification criteria:|$)/
        .exec(detailText)?.[1]?.trim() ?? "";
    const verificationCriteria =
      /-\s+Verification criteria:\s*([\s\S]*?)$/.exec(detailText)?.[1]?.trim() ?? "";
    rows.push({
      competency_id: match[1],
      priority: match[2],
      question: match[3].trim(),
      section_heading: sectionHeading,
      inference_path: inferencePath,
      verification_criteria: verificationCriteria,
      source_anchor: `${sectionHeading ?? "competency_qs"}#${match[1]}`,
    });
  }
  return rows;
}

function domainQualifiedCompetencyId(domainId: string, competencyId: string): string {
  return `domain:${domainId}#${competencyId}`;
}

const COMPETENCY_PARSER_ID = "markdown-bold-cq-priority";
const COMPETENCY_PARSER_VERSION = "1";
const SUPPORTED_DOMAIN_COMPETENCY_ADMISSION_POLICY = {
  admission_policy_id: "required_p1_with_all_priorities_metadata",
  required_priority_values: ["P1"],
  metadata_priority_values: ["P2", "P3"],
} as const;

type DomainAuthoritySeat = ReconstructRunAdmittedDomainCompetencySnapshot["source_seat"];
type DomainCompetencyPriority = "P1" | "P2" | "P3";

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function uniqueDomainAuthorityRoots(args: {
  projectRoot: string;
  registryProjectRoot: string;
}): Array<{ seat: DomainAuthoritySeat; root: string }> {
  const candidates: Array<{ seat: DomainAuthoritySeat; root: string }> = [
    { seat: "project", root: path.join(path.resolve(args.projectRoot), ".onto", "domains") },
    { seat: "user", root: path.join(os.homedir(), ".onto", "domains") },
    {
      seat: "installation",
      root: path.join(path.resolve(args.registryProjectRoot), ".onto", "domains"),
    },
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const resolved = path.resolve(candidate.root);
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    return true;
  });
}

function isMissingDomainCompetencySource(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function realpathIfDomainCompetencySourceExists(args: {
  authorityRoot: string;
  sourcePath: string;
  label: string;
}): Promise<string | null> {
  let realAuthorityRoot: string;
  try {
    realAuthorityRoot = await fs.realpath(args.authorityRoot);
  } catch (error) {
    if (isMissingDomainCompetencySource(error)) return null;
    throw error;
  }
  let realSourcePath: string;
  try {
    realSourcePath = await fs.realpath(args.sourcePath);
  } catch (error) {
    if (isMissingDomainCompetencySource(error)) return null;
    throw error;
  }
  if (!isPathInsideRoot(realAuthorityRoot, realSourcePath)) {
    throw new Error(`${args.label} realpath escapes allowed root: ${realSourcePath}`);
  }
  return realSourcePath;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return stableJson([...left].sort()) === stableJson([...right].sort());
}

function assertSupportedDomainCompetencyAdmissionPolicy(
  policy: ReconstructDomainCompetencyAdmissionPolicy,
): void {
  if (
    policy.admission_policy_id !==
      SUPPORTED_DOMAIN_COMPETENCY_ADMISSION_POLICY.admission_policy_id
  ) {
    throw new Error(
      `unsupported admitted domain competency admission policy: ${policy.admission_policy_id}`,
    );
  }
  if (
    !policy.supported_runtime_admission_policy_ids.includes(policy.admission_policy_id)
  ) {
    throw new Error(
      `admitted domain competency admission policy ${policy.admission_policy_id} is not listed in supported_runtime_admission_policy_ids`,
    );
  }
  if (
    !sameStringSet(
      policy.required_priority_values,
      SUPPORTED_DOMAIN_COMPETENCY_ADMISSION_POLICY.required_priority_values,
    ) ||
    !sameStringSet(
      policy.metadata_priority_values,
      SUPPORTED_DOMAIN_COMPETENCY_ADMISSION_POLICY.metadata_priority_values,
    )
  ) {
    throw new Error(
      `admitted domain competency admission policy ${policy.admission_policy_id} does not match the runtime-supported priority contract`,
    );
  }
}

function canonicalDomainCompetencySourceRef(args: {
  projectRoot: string;
  domainId: string;
  sourcePath: string;
  sourceSeat: DomainAuthoritySeat;
}): string {
  if (args.sourceSeat === "project") {
    const relativeToProject = path.relative(
      path.resolve(args.projectRoot),
      path.resolve(args.sourcePath),
    );
    if (
      relativeToProject &&
      !relativeToProject.startsWith("..") &&
      !path.isAbsolute(relativeToProject)
    ) {
      return toPosixPath(relativeToProject);
    }
  }
  return `${args.sourceSeat}:domain:${args.domainId}/competency_qs.md`;
}

async function resolveDomainCompetencySource(args: {
  domainId: string;
  projectRoot: string;
  roots: Array<{ seat: DomainAuthoritySeat; root: string }>;
}): Promise<{
  sourceRef: string;
  sourcePath: string;
  sourceReadPath: string;
  sourceSeat: DomainAuthoritySeat;
  authorityResolutionOrder: string[];
}> {
  assertReconstructDomainId(args.domainId, "admitted domain id");
  const authorityResolutionOrder = args.roots.map((root) =>
    `${root.seat}:${path.resolve(root.root, args.domainId, "competency_qs.md")}`
  );
  for (const root of args.roots) {
    const authorityRoot = path.resolve(root.root);
    const sourcePath = path.resolve(authorityRoot, args.domainId, "competency_qs.md");
    if (!isPathInsideRoot(authorityRoot, sourcePath)) {
      throw new Error(
        `admitted domain ${args.domainId} resolves outside its authority root: ${sourcePath}`,
      );
    }
    const realSourcePath = await realpathIfDomainCompetencySourceExists({
      authorityRoot,
      sourcePath,
      label: `admitted domain ${args.domainId} competency source`,
    });
    if (!realSourcePath) continue;
    const stat = await fs.stat(realSourcePath);
    if (!stat.isFile()) continue;
      return {
        sourceRef: canonicalDomainCompetencySourceRef({
          projectRoot: args.projectRoot,
          domainId: args.domainId,
          sourcePath,
          sourceSeat: root.seat,
        }),
        sourcePath,
        sourceReadPath: realSourcePath,
        sourceSeat: root.seat,
        authorityResolutionOrder,
      };
  }
  throw new Error(
    `admitted domain ${args.domainId} has no competency_qs.md in authority order: ${authorityResolutionOrder.join(", ")}`,
  );
}

async function buildAdmittedDomainSnapshots(args: {
  projectRoot: string;
  registryProjectRoot: string;
  admissionPolicy: ReconstructDomainCompetencyAdmissionPolicy;
  domainIds?: string[];
}): Promise<ReconstructRunAdmittedDomainCompetencySnapshot[]> {
  assertSupportedDomainCompetencyAdmissionPolicy(args.admissionPolicy);
  const snapshots: ReconstructRunAdmittedDomainCompetencySnapshot[] = [];
  const domainRoots = uniqueDomainAuthorityRoots({
    projectRoot: args.projectRoot,
    registryProjectRoot: args.registryProjectRoot,
  });
  const domainIds = uniqueSorted(args.domainIds ?? []);
  for (const domainId of domainIds) {
    assertReconstructDomainId(domainId, "admitted domain id");
    const resolvedSource = await resolveDomainCompetencySource({
      domainId,
      projectRoot: args.projectRoot,
      roots: domainRoots,
    });
    const sourceRef = resolvedSource.sourceRef;
    const text = await fs.readFile(resolvedSource.sourceReadPath, "utf8");
    const sourceSha256 = sha256Text(text);
    const competencies = parseCompetencyQuestions(text);
    if (competencies.length === 0) {
      throw new Error(
        `admitted domain ${domainId} has no parseable competency questions in ${sourceRef}`,
      );
    }
    const admittedCompetencies = competencies;
    const requiredPriorityValues = new Set<DomainCompetencyPriority>(
      args.admissionPolicy.required_priority_values as DomainCompetencyPriority[],
    );
    const requiredCompetencies = admittedCompetencies.filter((record) =>
      requiredPriorityValues.has(record.priority as DomainCompetencyPriority)
    );
    const admittedCompetencyPriorities = Object.fromEntries(
      competencies.map((record) => [
        domainQualifiedCompetencyId(domainId, record.competency_id),
        record.priority,
      ]),
    );
    const migrationMappings: ReconstructRunCompetencyIdMigrationMapping[] =
      competencies.map((record) => ({
        competency_id: domainQualifiedCompetencyId(domainId, record.competency_id),
        source_version_or_snapshot_id: sourceSha256,
        migration_status: "current",
        supersedes: [],
        replaced_by: [],
        split_from: [],
        split_into: [],
        merged_from: [],
        merged_into: [],
      }));
    snapshots.push({
      source_ref: sourceRef,
      source_sha256: sourceSha256,
      source_seat: resolvedSource.sourceSeat,
      authority_resolution_order: resolvedSource.authorityResolutionOrder,
      domain_id: domainId,
      competency_parser_id: COMPETENCY_PARSER_ID,
      competency_parser_version: COMPETENCY_PARSER_VERSION,
      admission_policy: args.admissionPolicy.admission_policy_id,
      admitted_competencies: admittedCompetencies.map((record) => ({
        competency_id: record.competency_id,
        qualified_competency_id: domainQualifiedCompetencyId(
          domainId,
          record.competency_id,
        ),
        priority: record.priority,
        question: record.question,
        section_heading: record.section_heading,
        inference_path: record.inference_path,
        verification_criteria: record.verification_criteria,
        source_anchor: record.source_anchor,
      })),
      required_admitted_competency_ids: requiredCompetencies.map((record) =>
        domainQualifiedCompetencyId(domainId, record.competency_id)
      ),
      admitted_competency_priorities: admittedCompetencyPriorities,
      competency_id_migration_mappings: migrationMappings,
    });
  }
  return snapshots;
}

/**
 * The exact field allow-list embedded in the `validator_records` governing-snapshot
 * family (and therefore in the authored-artifact reuse hash). The loader preserves
 * additional fields on a parsed validator record (e.g. validation_obligations,
 * conditional_validation_obligations) so callers can read them, but those MUST NOT
 * enter the snapshot/reuse hash or every prior authored artifact would be forced to
 * re-author. This is an ALLOW-LIST, not a strip-list: any future parsed field is
 * excluded by default and must be consciously added here to enter the snapshot, so
 * the no-rotation guarantee holds for the whole field class, not just today's two.
 */
export function projectValidatorRecordSnapshotFields(
  validator: ReconstructValidatorRecord,
): Pick<
  ReconstructValidatorRecord,
  "validator_id" | "gate_ids" | "validator_version" | "input_authority_refs" | "output_ref"
> {
  return {
    validator_id: validator.validator_id,
    gate_ids: validator.gate_ids,
    validator_version: validator.validator_version,
    input_authority_refs: validator.input_authority_refs,
    output_ref: validator.output_ref,
  };
}

function snapshotFamily(args: {
  familyId: string;
  sourceRef: string | null;
  value: unknown;
  selectedIds: string[];
}): ReconstructRunSnapshotFamily {
  const items = Array.isArray(args.value) ? args.value : [];
  return {
    family_id: args.familyId,
    source_ref: args.sourceRef,
    sha256: sha256Text(stableJson(args.value)),
    item_count: items.length,
    selected_ids: [...args.selectedIds].sort(),
  };
}

export async function buildReconstructRunGoverningSnapshot(args: {
  projectRoot: string;
  registryPath: string;
  contractRegistry: ReconstructContractRegistry;
  selectedSourceProfiles: ReconstructSelectedSourceProfileRef[];
  lensIds: string[];
  admittedDomainIds?: string[];
}): Promise<ReconstructRunGoverningSnapshot> {
  const rawRegistryText = await fs.readFile(args.registryPath, "utf8");
  const rawRegistry = parseYaml(rawRegistryText) as unknown;
  const registryRef = args.registryPath;
  const registryProjectRoot = projectRootFromRegistryPath(args.registryPath);
  const admissionPolicy = args.contractRegistry.domain_competency_admission_policy;
  assertSupportedDomainCompetencyAdmissionPolicy(admissionPolicy);
  const activeContracts = await Promise.all(
    args.contractRegistry.active_contract_refs.map(async (contract) => ({
      contract_id: contract.contract_id,
      ref: contract.ref,
      sha256: await sha256File(resolveRegistryRef({
        projectRoot: registryProjectRoot,
        ref: contract.ref,
      })),
      role: contract.role,
      schema_version: contract.schema_version,
      migration_status: contract.migration_status,
    })),
  );
  const referenceStandards = nestedArray(
    rawRegistry,
    ["ontology_handoff_facet_contract", "reference_standard_registry"],
  );
  const referencePatternCatalogs = nestedArray(
    rawRegistry,
    ["ontology_handoff_facet_contract", "reference_pattern_catalog_registry"],
  );
  const lensRegistry = nestedValue(rawRegistry, ["reconstruct_lens_judgment_registry"]);
  const migrationPolicies = {
    source_profile_migration_policy: nestedValue(
      rawRegistry,
      ["source_profile_migration_policy"],
    ),
    version_policy: nestedValue(rawRegistry, ["version_policy"]),
  };
  const selectedSourceProfileIds = args.selectedSourceProfiles
    .map((profile) => profile.profile_id)
    .sort();
  const requestedDomainIds = uniqueSorted(args.admittedDomainIds ?? []);
  for (const domainId of requestedDomainIds) {
    assertReconstructDomainId(domainId, "admitted domain id");
  }
  const admittedDomainCompetencySnapshots = await buildAdmittedDomainSnapshots({
    projectRoot: args.projectRoot,
    registryProjectRoot,
    admissionPolicy,
    domainIds: requestedDomainIds,
  });
  const admittedCompetencyIds = uniqueSorted(
    admittedDomainCompetencySnapshots.flatMap((snapshot) => snapshot.required_admitted_competency_ids),
  );
  const admittedCompetencyPriorities = Object.assign(
    {},
    ...admittedDomainCompetencySnapshots.map((snapshot) =>
      snapshot.admitted_competency_priorities
    ),
  ) as Record<string, string>;
  const competencyIdMigrationMappings = admittedDomainCompetencySnapshots
    .flatMap((snapshot) => snapshot.competency_id_migration_mappings)
    .sort((left, right) => left.competency_id.localeCompare(right.competency_id));
  const selectedReferenceStandardIds = args.contractRegistry.reference_standard_registry
    .map((record) => record.standard_ref_id)
    .sort();
  const selectedPatternCatalogIds = args.contractRegistry.reference_pattern_catalog_registry
    .map((record) => record.pattern_catalog_ref_id)
    .sort();

  return {
    registry: {
      registry_id: args.contractRegistry.registry_id,
      registry_ref: registryRef,
      registry_sha256: sha256Text(rawRegistryText),
      schema_version: args.contractRegistry.schema_version,
      status: args.contractRegistry.status,
    },
    active_contracts: activeContracts.sort((left, right) =>
      left.contract_id.localeCompare(right.contract_id)
    ),
    selected_source_profiles: [...args.selectedSourceProfiles]
      .sort((left, right) => left.profile_id.localeCompare(right.profile_id)),
    validation_gate_catalog: args.contractRegistry.validation_gate_catalog
      .map((gate) => ({
        gate_id: gate.gate_id,
        validation_artifact_ref: gate.validation_artifact_ref,
        required_when: gate.required_when,
      }))
      .sort((left, right) => left.gate_id.localeCompare(right.gate_id)),
    validator_versions: args.contractRegistry.validator_records
      .map((validator) => ({
        validator_id: validator.validator_id,
        validator_version: validator.validator_version,
        gate_ids: [...validator.gate_ids].sort(),
        output_ref: validator.output_ref,
      }))
      .sort((left, right) => left.validator_id.localeCompare(right.validator_id)),
    snapshot_families: [
      snapshotFamily({
        familyId: "active_contract_refs",
        sourceRef: "reconstruct-contract-registry.yaml#active_contract_refs",
        value: args.contractRegistry.active_contract_refs,
        selectedIds: args.contractRegistry.active_contract_refs
          .map((contract) => contract.contract_id),
      }),
      snapshotFamily({
        familyId: "source_profile_records",
        sourceRef: "reconstruct-contract-registry.yaml#source_profile_records",
        value: args.contractRegistry.source_profile_records,
        selectedIds: selectedSourceProfileIds,
      }),
      snapshotFamily({
        familyId: "validation_gate_catalog",
        sourceRef: "reconstruct-contract-registry.yaml#validation_gate_catalog",
        value: args.contractRegistry.validation_gate_catalog,
        selectedIds: args.contractRegistry.validation_gate_catalog
          .map((gate) => gate.gate_id),
      }),
      snapshotFamily({
        familyId: "validator_records",
        sourceRef: "reconstruct-contract-registry.yaml#validator_records",
        // Allow-list projection: obligation fields the loader now preserves are
        // excluded so the family sha (and the reuse hash it feeds) stays byte-identical.
        value: args.contractRegistry.validator_records
          .map(projectValidatorRecordSnapshotFields),
        selectedIds: args.contractRegistry.validator_records
          .map((validator) => validator.validator_id),
      }),
      snapshotFamily({
        familyId: "reference_standard_registry",
        sourceRef:
          "reconstruct-contract-registry.yaml#ontology_handoff_facet_contract.reference_standard_registry",
        value: referenceStandards,
        selectedIds: idValues(referenceStandards, "standard_ref_id"),
      }),
      snapshotFamily({
        familyId: "reference_pattern_catalog_registry",
        sourceRef:
          "reconstruct-contract-registry.yaml#ontology_handoff_facet_contract.reference_pattern_catalog_registry",
        value: referencePatternCatalogs,
        selectedIds: idValues(referencePatternCatalogs, "pattern_catalog_ref_id"),
      }),
      snapshotFamily({
        familyId: "reconstruct_lens_judgment_registry",
        sourceRef: "reconstruct-contract-registry.yaml#reconstruct_lens_judgment_registry",
        value: lensRegistry,
        selectedIds: [...args.lensIds].sort(),
      }),
      snapshotFamily({
        familyId: "migration_policies",
        sourceRef:
          "reconstruct-contract-registry.yaml#source_profile_migration_policy+version_policy",
        value: migrationPolicies,
        selectedIds: [
          ...(args.contractRegistry.source_profile_migration_policy
            ?.migration_status_values ?? []),
          ...(args.contractRegistry.version_policy
            ?.contract_migration_status_values ?? []),
        ],
      }),
      snapshotFamily({
        familyId: "domain_competency_admission_policy",
        sourceRef:
          "reconstruct-contract-registry.yaml#ontology_handoff_facet_contract.domain_competency_trace_contract.admitted_domain_competency_disposition_rule",
        value: admissionPolicy,
        selectedIds: [admissionPolicy.admission_policy_id],
      }),
      snapshotFamily({
        familyId: "admitted_domain_competency_snapshots",
        sourceRef: "reconstruct-run-manifest.yaml#governing_snapshot.admitted_domain_competency_snapshots",
        value: admittedDomainCompetencySnapshots,
        selectedIds: admittedDomainCompetencySnapshots.map((snapshot) => snapshot.domain_id),
      }),
    ],
    selected_reference_standard_ids: selectedReferenceStandardIds,
    selected_reference_standard_version_or_snapshot_ids: recordStringMap({
      records: args.contractRegistry.reference_standard_registry,
      id: (record) => record.standard_ref_id,
      value: selectedSnapshotId,
    }),
    selected_pattern_catalog_ids: selectedPatternCatalogIds,
    selected_pattern_catalog_version_or_snapshot_ids: recordStringMap({
      records: args.contractRegistry.reference_pattern_catalog_registry,
      id: (record) => record.pattern_catalog_ref_id,
      value: selectedSnapshotId,
    }),
    selected_pattern_catalog_canonical_uris: recordStringMap({
      records: args.contractRegistry.reference_pattern_catalog_registry,
      id: (record) => record.pattern_catalog_ref_id,
      value: (record) => selectedPatternCatalogCanonicalUri(record.pattern_catalog_ref_id),
    }),
    requested_domain_ids: requestedDomainIds,
    admitted_domain_competency_refs: admittedDomainCompetencySnapshots.map((snapshot) =>
      `domain:${snapshot.domain_id}`
    ),
    admitted_domain_competency_source_refs: admittedDomainCompetencySnapshots.map((snapshot) =>
      snapshot.source_ref
    ),
    admitted_domain_competency_snapshots: admittedDomainCompetencySnapshots,
    required_admitted_competency_ids: admittedCompetencyIds,
    admitted_competency_priorities: admittedCompetencyPriorities,
    competency_id_migration_mappings: competencyIdMigrationMappings,
    lens_ids: [...args.lensIds].sort(),
    migration_status_values: {
      source_profile: [
        ...(args.contractRegistry.source_profile_migration_policy
          ?.migration_status_values ?? []),
      ].sort(),
      contract: [
        ...(args.contractRegistry.version_policy
          ?.contract_migration_status_values ?? []),
      ].sort(),
    },
  };
}

function violation(args: {
  code: ReconstructPostSeedValidationViolation["code"];
  message: string;
  subjectId: string;
}): ReconstructPostSeedValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId,
  };
}

function validateRecordedGoverningSnapshotShape(
  snapshot: ReconstructRunGoverningSnapshot,
): ReconstructPostSeedValidationViolation[] {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  if (!snapshot.registry?.registry_ref || !snapshot.registry.registry_sha256) {
    violations.push(violation({
      code: "manifest_snapshot_mismatch",
      message: "recorded governing snapshot registry ref and hash are required",
      subjectId: "governing_snapshot.registry",
    }));
  }
  for (const [index, profile] of snapshot.selected_source_profiles.entries()) {
    if (
      !profile.profile_id ||
      !profile.target_material_kind ||
      typeof profile.is_default_for_kind !== "boolean" ||
      !profile.migration_status
    ) {
      violations.push(violation({
        code: "manifest_snapshot_mismatch",
        message:
          "recorded selected source profile snapshot is missing required replay fields",
        subjectId: `governing_snapshot.selected_source_profiles[${index}]`,
      }));
    }
  }
  if (
    !Array.isArray(snapshot.selected_reference_standard_ids) ||
    snapshot.selected_reference_standard_ids.length === 0 ||
    !hasStringValueForEveryId(
      snapshot.selected_reference_standard_version_or_snapshot_ids,
      snapshot.selected_reference_standard_ids ?? [],
    )
  ) {
    violations.push(violation({
      code: "manifest_snapshot_mismatch",
      message:
        "recorded governing snapshot is missing selected reference standard ids or version snapshots",
      subjectId: "governing_snapshot.selected_reference_standard_ids",
    }));
  }
  if (
    !Array.isArray(snapshot.selected_pattern_catalog_ids) ||
    snapshot.selected_pattern_catalog_ids.length === 0 ||
    !hasStringValueForEveryId(
      snapshot.selected_pattern_catalog_version_or_snapshot_ids,
      snapshot.selected_pattern_catalog_ids ?? [],
    ) ||
    !hasStringValueForEveryId(
      snapshot.selected_pattern_catalog_canonical_uris,
      snapshot.selected_pattern_catalog_ids ?? [],
    )
  ) {
    violations.push(violation({
      code: "manifest_snapshot_mismatch",
      message:
        "recorded governing snapshot is missing selected pattern catalog ids, snapshots, or canonical URIs",
      subjectId: "governing_snapshot.selected_pattern_catalog_ids",
    }));
  }
  for (const [index, domainSnapshot] of snapshot.admitted_domain_competency_snapshots.entries()) {
    if (
      !domainSnapshot.source_ref ||
      !domainSnapshot.source_sha256 ||
      !domainSnapshot.source_seat ||
      !Array.isArray(domainSnapshot.authority_resolution_order) ||
      domainSnapshot.authority_resolution_order.length === 0 ||
      !domainSnapshot.domain_id ||
      !domainSnapshot.competency_parser_id ||
      !domainSnapshot.competency_parser_version ||
      !domainSnapshot.admission_policy ||
      domainSnapshot.admitted_competencies.length === 0 ||
      !Array.isArray(domainSnapshot.required_admitted_competency_ids)
    ) {
      violations.push(violation({
        code: "manifest_snapshot_mismatch",
        message:
          "recorded domain competency snapshot is missing source identity or admitted competency semantics",
        subjectId: `governing_snapshot.admitted_domain_competency_snapshots[${index}]`,
      }));
    }
  }
  if (!Array.isArray(snapshot.admitted_domain_competency_refs)) {
    violations.push(violation({
      code: "manifest_snapshot_mismatch",
      message:
        "recorded governing snapshot is missing admitted domain competency admission refs",
      subjectId: "governing_snapshot.admitted_domain_competency_refs",
    }));
  }
  if (!Array.isArray(snapshot.admitted_domain_competency_source_refs)) {
    violations.push(violation({
      code: "manifest_snapshot_mismatch",
      message:
        "recorded governing snapshot is missing admitted domain competency source refs",
      subjectId: "governing_snapshot.admitted_domain_competency_source_refs",
    }));
  }
  return violations;
}

export async function validateReconstructRunGoverningSnapshot(args: {
  projectRoot: string;
  registryPath: string;
  contractRegistry: ReconstructContractRegistry;
  selectedSourceProfiles: ReconstructSelectedSourceProfileRef[];
  lensIds: string[];
  admittedDomainIds: string[];
  snapshot: ReconstructRunGoverningSnapshot | null | undefined;
  validationMode?: "live_terminal" | "historical_replay";
}): Promise<ReconstructPostSeedValidationViolation[]> {
  if (!args.snapshot) {
    return [
      violation({
        code: "manifest_snapshot_missing",
        message: "reconstruct run manifest is missing governing_snapshot",
        subjectId: "governing_snapshot",
      }),
    ];
  }

  const expected = await buildReconstructRunGoverningSnapshot({
    ...args,
    admittedDomainIds: args.admittedDomainIds,
  });
  if (args.snapshot.registry.registry_sha256 !== expected.registry.registry_sha256) {
    if (args.validationMode === "historical_replay") {
      return validateRecordedGoverningSnapshotShape(args.snapshot);
    }
    return [
      violation({
        code: "manifest_snapshot_mismatch",
        message:
          "live reconstruct manifest governing_snapshot registry hash does not match active registry authority",
        subjectId: "governing_snapshot.registry.registry_sha256",
      }),
    ];
  }
  const violations: ReconstructPostSeedValidationViolation[] = [];
  const checks: Array<{ subject: string; actual: unknown; expected: unknown }> = [
    {
      subject: "governing_snapshot.registry",
      actual: args.snapshot.registry,
      expected: expected.registry,
    },
    {
      subject: "governing_snapshot.active_contracts",
      actual: args.snapshot.active_contracts,
      expected: expected.active_contracts,
    },
    {
      subject: "governing_snapshot.selected_source_profiles",
      actual: args.snapshot.selected_source_profiles,
      expected: expected.selected_source_profiles,
    },
    {
      subject: "governing_snapshot.validation_gate_catalog",
      actual: args.snapshot.validation_gate_catalog,
      expected: expected.validation_gate_catalog,
    },
    {
      subject: "governing_snapshot.validator_versions",
      actual: args.snapshot.validator_versions,
      expected: expected.validator_versions,
    },
    {
      subject: "governing_snapshot.snapshot_families",
      actual: args.snapshot.snapshot_families,
      expected: expected.snapshot_families,
    },
    {
      subject: "governing_snapshot.selected_reference_standard_ids",
      actual: args.snapshot.selected_reference_standard_ids,
      expected: expected.selected_reference_standard_ids,
    },
    {
      subject: "governing_snapshot.selected_reference_standard_version_or_snapshot_ids",
      actual: args.snapshot.selected_reference_standard_version_or_snapshot_ids,
      expected: expected.selected_reference_standard_version_or_snapshot_ids,
    },
    {
      subject: "governing_snapshot.selected_pattern_catalog_ids",
      actual: args.snapshot.selected_pattern_catalog_ids,
      expected: expected.selected_pattern_catalog_ids,
    },
    {
      subject: "governing_snapshot.selected_pattern_catalog_version_or_snapshot_ids",
      actual: args.snapshot.selected_pattern_catalog_version_or_snapshot_ids,
      expected: expected.selected_pattern_catalog_version_or_snapshot_ids,
    },
    {
      subject: "governing_snapshot.selected_pattern_catalog_canonical_uris",
      actual: args.snapshot.selected_pattern_catalog_canonical_uris,
      expected: expected.selected_pattern_catalog_canonical_uris,
    },
    {
      subject: "governing_snapshot.requested_domain_ids",
      actual: args.snapshot.requested_domain_ids,
      expected: expected.requested_domain_ids,
    },
    {
      subject: "governing_snapshot.admitted_domain_competency_refs",
      actual: args.snapshot.admitted_domain_competency_refs,
      expected: expected.admitted_domain_competency_refs,
    },
    {
      subject: "governing_snapshot.admitted_domain_competency_source_refs",
      actual: args.snapshot.admitted_domain_competency_source_refs,
      expected: expected.admitted_domain_competency_source_refs,
    },
    {
      subject: "governing_snapshot.admitted_domain_competency_snapshots",
      actual: args.snapshot.admitted_domain_competency_snapshots,
      expected: expected.admitted_domain_competency_snapshots,
    },
    {
      subject: "governing_snapshot.required_admitted_competency_ids",
      actual: args.snapshot.required_admitted_competency_ids,
      expected: expected.required_admitted_competency_ids,
    },
    {
      subject: "governing_snapshot.admitted_competency_priorities",
      actual: args.snapshot.admitted_competency_priorities,
      expected: expected.admitted_competency_priorities,
    },
    {
      subject: "governing_snapshot.competency_id_migration_mappings",
      actual: args.snapshot.competency_id_migration_mappings,
      expected: expected.competency_id_migration_mappings,
    },
    {
      subject: "governing_snapshot.lens_ids",
      actual: args.snapshot.lens_ids,
      expected: expected.lens_ids,
    },
    {
      subject: "governing_snapshot.migration_status_values",
      actual: args.snapshot.migration_status_values,
      expected: expected.migration_status_values,
    },
  ];

  for (const check of checks) {
    if (stableJson(check.actual) !== stableJson(check.expected)) {
      violations.push(violation({
        code: "manifest_snapshot_mismatch",
        message: `${check.subject} does not match the selected registry/runtime snapshot`,
        subjectId: check.subject,
      }));
    }
  }
  return violations;
}
