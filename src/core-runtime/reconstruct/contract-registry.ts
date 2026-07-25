import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  isTargetMaterialKind,
  type TargetMaterialKind,
} from "../target-material-kind.js";

export interface ReconstructSourceProfileRecord {
  profile_id: string;
  target_material_kind: TargetMaterialKind;
  is_default_for_kind: boolean;
  definition_ref: string | null;
  definition_sha256: string;
  contract_status: string;
  runtime_implementation_status: string;
  schema_version: number;
  profile_version: number;
  migration_status: string;
  supersedes: string[];
  replaced_by: string[];
  split_from: string[];
  split_into: string[];
  merged_from: string[];
  merged_into: string[];
}

export interface ReconstructActiveContractRecord {
  contract_id: string;
  ref: string;
  role: string;
  schema_version: number;
  migration_status: string;
}

export interface ReconstructCandidateKindRecord {
  candidate_kind_id: string;
  canonical_projection_hint: string;
}

export interface ReconstructCandidateDispositionRecord {
  disposition_id: string;
  meaning: string;
}

export interface ReconstructCoverageAxisRecord {
  axis_id: string;
}

export interface ReconstructOntologyHandoffAxisRecord {
  axis_id: string;
}

export interface ReconstructReferenceStandardRecord {
  standard_ref_id: string;
  canonical_uri: string;
  version_or_snapshot_id: string;
  migration_status: string;
}

export interface ReconstructReferencePatternCatalogRecord {
  pattern_catalog_ref_id: string;
  canonical_uri_policy: string;
  version_or_snapshot_id: string;
  migration_status: string;
}

export interface ReconstructFacetRecord {
  facet_id: string;
}

export interface ReconstructModelingConcernRecord {
  concern_id: string;
  applicability_predicate_id?: string;
}

export interface ReconstructProofContractRecord {
  contract_ref_id: string;
}

export interface ReconstructReasoningOrFormalismProfileValues {
  representation_formalism_values: string[];
  vocabulary_system_values: string[];
  validation_formalism_values: string[];
  ontology_type_values: string[];
  alignment_posture_values: string[];
  owl_profile_values: string[];
}

export interface ReconstructArtifactAuthorityRecord {
  authority_ref: string;
  validation_ref: string | null;
  projection_policy?: string;
  registry_ref?: string;
  required_snapshot_fields_ref?: string;
  snapshot_match_rule?: string;
}

export interface ReconstructValidationGateRecord {
  gate_id: string;
  validation_artifact_ref: string;
  required_when: string;
}

export interface ReconstructPredicateExecutionContract {
  default_predicate_evaluator_id: string;
  allowed_predicate_evaluator_ids: string[];
  predicate_phase_values: string[];
  default_predicate_phase: string;
}

export interface ReconstructDomainCompetencyAdmissionPolicy {
  admission_policy_id: string;
  supported_runtime_admission_policy_ids: string[];
  required_priority_values: string[];
  metadata_priority_values: string[];
}

export interface ReconstructRequiredWhenPredicateRecord {
  predicate_id: string;
  gate_instance_scope?: string;
  usage_status?: string;
  reserved_for?: string;
  input_authority_refs: string[];
  truth_expression: string;
  unknown_projection: string;
  explanation_template: string;
  predicate_phase: string;
  predicate_evaluator_id: string;
  predicate_evaluator_version: number;
}

export interface ConditionalValidationObligation {
  obligation_id: string;
  activation_condition: string;
  input_authority_refs: string[];
}

export interface ReconstructValidatorRecord {
  validator_id: string;
  gate_ids: string[];
  validator_version: number;
  input_authority_refs: string[];
  output_ref: string;
  validation_obligations: string[];
  conditional_validation_obligations: ConditionalValidationObligation[];
}

export interface ReconstructContractRegistry {
  schema_version: number;
  registry_id: string;
  status: string;
  active_contract_refs: ReconstructActiveContractRecord[];
  source_profile_records: ReconstructSourceProfileRecord[];
  candidate_kind_registry: ReconstructCandidateKindRecord[];
  candidate_disposition_registry: ReconstructCandidateDispositionRecord[];
  coverage_axis_registry: ReconstructCoverageAxisRecord[];
  ontology_handoff_axis_registry: ReconstructOntologyHandoffAxisRecord[];
  reference_standard_registry: ReconstructReferenceStandardRecord[];
  reference_pattern_catalog_registry: ReconstructReferencePatternCatalogRecord[];
  reasoning_or_formalism_profile_values:
    ReconstructReasoningOrFormalismProfileValues;
  reasoning_or_formalism_facet_registry: ReconstructFacetRecord[];
  entity_identity_facet_registry: ReconstructFacetRecord[];
  instance_assertion_facet_registry: ReconstructFacetRecord[];
  terminology_facet_registry: ReconstructFacetRecord[];
  relation_type_facet_registry: ReconstructFacetRecord[];
  classification_facet_registry: ReconstructFacetRecord[];
  constraint_facet_registry: ReconstructFacetRecord[];
  modeling_concern_applicability_registry: ReconstructModelingConcernRecord[];
  query_access_contract_registry: ReconstructProofContractRecord[];
  visualization_contract_registry: ReconstructProofContractRecord[];
  graph_exploration_contract_registry: ReconstructProofContractRecord[];
  artifact_authorities: Record<string, ReconstructArtifactAuthorityRecord>;
  validation_gate_catalog: ReconstructValidationGateRecord[];
  predicate_execution_contract: ReconstructPredicateExecutionContract;
  domain_competency_admission_policy: ReconstructDomainCompetencyAdmissionPolicy;
  required_when_predicate_catalog: ReconstructRequiredWhenPredicateRecord[];
  validator_records: ReconstructValidatorRecord[];
  source_profile_migration_policy?: {
    migration_status_values?: string[];
  };
  version_policy?: {
    selected_source_profile_snapshot_required_fields?: string[];
    selected_source_profile_migration_status_values_ref?: string;
    contract_migration_status_values?: string[];
  };
}

const PROFILE_MIGRATION_FIELDS = [
  "supersedes",
  "replaced_by",
  "split_from",
  "split_into",
  "merged_from",
  "merged_into",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string or null`);
  }
  return value;
}

function requiredNumber(
  record: Record<string, unknown>,
  key: string,
  context: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${context}.${key} must be an integer`);
  }
  return value;
}

function requiredBoolean(
  record: Record<string, unknown>,
  key: string,
  context: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${context}.${key} must be a boolean`);
  }
  return value;
}

function optionalNumber(
  record: Record<string, unknown>,
  key: string,
  context: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${context}.${key} must be an integer when present`);
  }
  return value;
}

function stringArray(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${context}.${key} must be a string array`);
  }
  return [...value];
}

function optionalStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${key} must be a string array when present`);
  }
  return [...value];
}

function optionalPolicyString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string when present`);
  }
  return value;
}

function optionalPolicyStringArray(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${context}.${key} must be a string array when present`);
  }
  return [...value];
}

function parseSourceProfileRecord(
  value: unknown,
  index: number,
): ReconstructSourceProfileRecord {
  if (!isRecord(value)) {
    throw new Error(`source_profile_records[${index}] must be an object`);
  }
  const context = `source_profile_records[${index}]`;
  const targetMaterialKind = requiredString(value, "target_material_kind", context);
  if (!isTargetMaterialKind(targetMaterialKind)) {
    throw new Error(`${context}.target_material_kind is not a valid TargetMaterialKind`);
  }

  return {
    profile_id: requiredString(value, "profile_id", context),
    target_material_kind: targetMaterialKind,
    is_default_for_kind: requiredBoolean(value, "is_default_for_kind", context),
    definition_ref: optionalString(value, "definition_ref", context),
    definition_sha256: requiredString(value, "definition_sha256", context),
    contract_status: requiredString(value, "contract_status", context),
    runtime_implementation_status: requiredString(
      value,
      "runtime_implementation_status",
      context,
    ),
    schema_version: requiredNumber(value, "schema_version", context),
    profile_version: requiredNumber(value, "profile_version", context),
    migration_status: requiredString(value, "migration_status", context),
    supersedes: stringArray(value, "supersedes", context),
    replaced_by: stringArray(value, "replaced_by", context),
    split_from: stringArray(value, "split_from", context),
    split_into: stringArray(value, "split_into", context),
    merged_from: stringArray(value, "merged_from", context),
    merged_into: stringArray(value, "merged_into", context),
  };
}

function parseActiveContractRecord(
  value: unknown,
  index: number,
): ReconstructActiveContractRecord {
  if (!isRecord(value)) {
    throw new Error(`active_contract_refs[${index}] must be an object`);
  }
  const context = `active_contract_refs[${index}]`;
  return {
    contract_id: requiredString(value, "contract_id", context),
    ref: requiredString(value, "ref", context),
    role: requiredString(value, "role", context),
    schema_version: requiredNumber(value, "schema_version", context),
    migration_status: requiredString(value, "migration_status", context),
  };
}

function parseCandidateKindRecord(
  value: unknown,
  index: number,
): ReconstructCandidateKindRecord {
  if (!isRecord(value)) {
    throw new Error(`candidate_kind_registry[${index}] must be an object`);
  }
  const context = `candidate_kind_registry[${index}]`;
  return {
    candidate_kind_id: requiredString(value, "candidate_kind_id", context),
    canonical_projection_hint: requiredString(
      value,
      "canonical_projection_hint",
      context,
    ),
  };
}

function parseCandidateDispositionRecord(
  value: unknown,
  index: number,
): ReconstructCandidateDispositionRecord {
  if (!isRecord(value)) {
    throw new Error(`candidate_disposition_registry[${index}] must be an object`);
  }
  const context = `candidate_disposition_registry[${index}]`;
  return {
    disposition_id: requiredString(value, "disposition_id", context),
    meaning: requiredString(value, "meaning", context),
  };
}

function parseAxisRecord<T extends "coverage_axis_registry" | "ontology_handoff_axis_registry">(
  value: unknown,
  index: number,
  registryName: T,
): T extends "coverage_axis_registry"
  ? ReconstructCoverageAxisRecord
  : ReconstructOntologyHandoffAxisRecord {
  if (!isRecord(value)) {
    throw new Error(`${registryName}[${index}] must be an object`);
  }
  return {
    axis_id: requiredString(value, "axis_id", `${registryName}[${index}]`),
  } as T extends "coverage_axis_registry"
    ? ReconstructCoverageAxisRecord
    : ReconstructOntologyHandoffAxisRecord;
}

function parseReferenceStandardRecord(
  value: unknown,
  index: number,
): ReconstructReferenceStandardRecord {
  if (!isRecord(value)) {
    throw new Error(`reference_standard_registry[${index}] must be an object`);
  }
  return {
    standard_ref_id: requiredString(
      value,
      "standard_ref_id",
      `reference_standard_registry[${index}]`,
    ),
    canonical_uri: requiredString(
      value,
      "canonical_uri",
      `reference_standard_registry[${index}]`,
    ),
    version_or_snapshot_id: requiredString(
      value,
      "version_or_snapshot_id",
      `reference_standard_registry[${index}]`,
    ),
    migration_status: requiredString(
      value,
      "migration_status",
      `reference_standard_registry[${index}]`,
    ),
  };
}

function parseReferencePatternCatalogRecord(
  value: unknown,
  index: number,
): ReconstructReferencePatternCatalogRecord {
  if (!isRecord(value)) {
    throw new Error(`reference_pattern_catalog_registry[${index}] must be an object`);
  }
  return {
    pattern_catalog_ref_id: requiredString(
      value,
      "pattern_catalog_ref_id",
      `reference_pattern_catalog_registry[${index}]`,
    ),
    canonical_uri_policy: requiredString(
      value,
      "canonical_uri_policy",
      `reference_pattern_catalog_registry[${index}]`,
    ),
    version_or_snapshot_id: requiredString(
      value,
      "version_or_snapshot_id",
      `reference_pattern_catalog_registry[${index}]`,
    ),
    migration_status: requiredString(
      value,
      "migration_status",
      `reference_pattern_catalog_registry[${index}]`,
    ),
  };
}

function parseFacetRecord(
  value: unknown,
  index: number,
  registryName: string,
): ReconstructFacetRecord {
  if (!isRecord(value)) {
    throw new Error(`${registryName}[${index}] must be an object`);
  }
  return {
    facet_id: requiredString(value, "facet_id", `${registryName}[${index}]`),
  };
}

function parseModelingConcernRecord(
  value: unknown,
  index: number,
): ReconstructModelingConcernRecord {
  if (!isRecord(value)) {
    throw new Error(
      `modeling_concern_applicability_registry[${index}] must be an object`,
    );
  }
  const context = `modeling_concern_applicability_registry[${index}]`;
  const record: ReconstructModelingConcernRecord = {
    concern_id: requiredString(value, "concern_id", context),
  };
  const applicabilityPredicateId = optionalPolicyString(
    value,
    "applicability_predicate_id",
    context,
  );
  if (applicabilityPredicateId !== undefined) {
    record.applicability_predicate_id = applicabilityPredicateId;
  }
  return record;
}

function parseProofContractRecord(
  value: unknown,
  index: number,
  registryName: string,
): ReconstructProofContractRecord {
  if (!isRecord(value)) {
    throw new Error(`${registryName}[${index}] must be an object`);
  }
  return {
    contract_ref_id: requiredString(
      value,
      "contract_ref_id",
      `${registryName}[${index}]`,
    ),
  };
}

function parseArtifactAuthorityRecord(
  value: unknown,
  key: string,
): ReconstructArtifactAuthorityRecord {
  if (!isRecord(value)) {
    throw new Error(`artifact_authorities.${key} must be an object`);
  }
  const context = `artifact_authorities.${key}`;
  const record: ReconstructArtifactAuthorityRecord = {
    authority_ref: requiredString(value, "authority_ref", context),
    validation_ref: optionalString(value, "validation_ref", context),
  };
  const projectionPolicy = optionalPolicyString(value, "projection_policy", context);
  if (projectionPolicy !== undefined) record.projection_policy = projectionPolicy;
  const registryRef = optionalPolicyString(value, "registry_ref", context);
  if (registryRef !== undefined) record.registry_ref = registryRef;
  const requiredSnapshotFieldsRef = optionalPolicyString(
    value,
    "required_snapshot_fields_ref",
    context,
  );
  if (requiredSnapshotFieldsRef !== undefined) {
    record.required_snapshot_fields_ref = requiredSnapshotFieldsRef;
  }
  const snapshotMatchRule = optionalPolicyString(value, "snapshot_match_rule", context);
  if (snapshotMatchRule !== undefined) record.snapshot_match_rule = snapshotMatchRule;
  return record;
}

function parseArtifactAuthorities(
  value: unknown,
): Record<string, ReconstructArtifactAuthorityRecord> {
  if (!isRecord(value)) {
    throw new Error("artifact_authorities must be an object");
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, record]) => [
      key,
      parseArtifactAuthorityRecord(record, key),
    ]),
  );
}

function parseValidationGateRecord(
  value: unknown,
  index: number,
): ReconstructValidationGateRecord {
  if (!isRecord(value)) {
    throw new Error(`validation_gate_catalog[${index}] must be an object`);
  }
  const context = `validation_gate_catalog[${index}]`;
  return {
    gate_id: requiredString(value, "gate_id", context),
    validation_artifact_ref: requiredString(
      value,
      "validation_artifact_ref",
      context,
    ),
    required_when: requiredString(value, "required_when", context),
  };
}

function parsePredicateExecutionContract(
  value: unknown,
): ReconstructPredicateExecutionContract {
  if (!isRecord(value)) {
    throw new Error(
      "registry.ontology_handoff_facet_contract.predicate_execution_contract must be an object",
    );
  }
  const context = "ontology_handoff_facet_contract.predicate_execution_contract";
  return {
    default_predicate_evaluator_id: requiredString(
      value,
      "default_predicate_evaluator_id",
      context,
    ),
    allowed_predicate_evaluator_ids: stringArray(
      value,
      "allowed_predicate_evaluator_ids",
      context,
    ),
    predicate_phase_values: stringArray(value, "predicate_phase_values", context),
    default_predicate_phase: requiredString(
      value,
      "default_predicate_phase",
      context,
    ),
  };
}

function parseDomainCompetencyAdmissionPolicy(
  value: unknown,
): ReconstructDomainCompetencyAdmissionPolicy {
  if (!isRecord(value)) {
    throw new Error(
      "ontology_handoff_facet_contract.domain_competency_trace_contract.admitted_domain_competency_disposition_rule must be an object",
    );
  }
  const context =
    "ontology_handoff_facet_contract.domain_competency_trace_contract.admitted_domain_competency_disposition_rule";
  return {
    admission_policy_id: requiredString(value, "admission_policy_id", context),
    supported_runtime_admission_policy_ids: stringArray(
      value,
      "supported_runtime_admission_policy_ids",
      context,
    ),
    required_priority_values: stringArray(value, "required_priority_values", context),
    metadata_priority_values: stringArray(value, "metadata_priority_values", context),
  };
}

function parseRequiredWhenPredicateRecord(args: {
  value: unknown;
  index: number;
  predicateExecutionContract: ReconstructPredicateExecutionContract;
}): ReconstructRequiredWhenPredicateRecord {
  if (!isRecord(args.value)) {
    throw new Error(
      `required_when_predicate_catalog[${args.index}] must be an object`,
    );
  }
  const context = `required_when_predicate_catalog[${args.index}]`;
  const predicatePhase = optionalPolicyString(
    args.value,
    "predicate_phase",
    context,
  ) ?? args.predicateExecutionContract.default_predicate_phase;
  const predicateEvaluatorId = optionalPolicyString(
    args.value,
    "predicate_evaluator_id",
    context,
  ) ?? args.predicateExecutionContract.default_predicate_evaluator_id;
  const predicateEvaluatorVersion = optionalNumber(
    args.value,
    "predicate_evaluator_version",
    context,
  ) ?? 1;
  const record: ReconstructRequiredWhenPredicateRecord = {
    predicate_id: requiredString(args.value, "predicate_id", context),
    input_authority_refs: stringArray(args.value, "input_authority_refs", context),
    truth_expression: requiredString(args.value, "truth_expression", context),
    unknown_projection: requiredString(args.value, "unknown_projection", context),
    explanation_template: requiredString(
      args.value,
      "explanation_template",
      context,
    ),
    predicate_phase: predicatePhase,
    predicate_evaluator_id: predicateEvaluatorId,
    predicate_evaluator_version: predicateEvaluatorVersion,
  };
  const usageStatus = optionalPolicyString(args.value, "usage_status", context);
  if (usageStatus !== undefined) record.usage_status = usageStatus;
  const reservedFor = optionalPolicyString(args.value, "reserved_for", context);
  if (reservedFor !== undefined) record.reserved_for = reservedFor;
  const gateInstanceScope = optionalPolicyString(
    args.value,
    "gate_instance_scope",
    context,
  );
  if (gateInstanceScope !== undefined) {
    record.gate_instance_scope = gateInstanceScope;
  }
  return record;
}

function parseConditionalValidationObligation(
  value: unknown,
  context: string,
): ConditionalValidationObligation {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object`);
  }
  return {
    obligation_id: requiredString(value, "obligation_id", context),
    activation_condition: requiredString(value, "activation_condition", context),
    input_authority_refs: optionalStringArray(value, "input_authority_refs"),
  };
}

function parseValidatorRecord(
  value: unknown,
  index: number,
): ReconstructValidatorRecord {
  if (!isRecord(value)) {
    throw new Error(`validator_records[${index}] must be an object`);
  }
  const context = `validator_records[${index}]`;
  const conditionalObligationsRaw = value.conditional_validation_obligations;
  const conditionalObligations = conditionalObligationsRaw === undefined
    ? []
    : (Array.isArray(conditionalObligationsRaw)
      ? conditionalObligationsRaw
      : (() => {
        throw new Error(
          `${context}.conditional_validation_obligations must be an array when present`,
        );
      })()).map((entry, entryIndex) =>
        parseConditionalValidationObligation(
          entry,
          `${context}.conditional_validation_obligations[${entryIndex}]`,
        )
      );
  return {
    validator_id: requiredString(value, "validator_id", context),
    gate_ids: stringArray(value, "gate_ids", context),
    validator_version: requiredNumber(value, "validator_version", context),
    input_authority_refs: optionalStringArray(value, "input_authority_refs"),
    output_ref: requiredString(value, "output_ref", context),
    validation_obligations: optionalStringArray(value, "validation_obligations"),
    conditional_validation_obligations: conditionalObligations,
  };
}

function requiredArray(
  record: Record<string, unknown>,
  key: string,
  context: string,
): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${context}.${key} must be an array`);
  }
  return value;
}

async function sha256File(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function resolveRegistryRef(args: {
  projectRoot: string;
  ref: string;
}): string {
  return path.isAbsolute(args.ref)
    ? path.resolve(args.ref)
    : path.resolve(args.projectRoot, args.ref);
}

export function projectRootFromProfilesRoot(profilesRoot: string): string {
  return path.resolve(profilesRoot, "../../../..");
}

export async function loadReconstructContractRegistry(args: {
  registryPath: string;
}): Promise<ReconstructContractRegistry> {
  const parsed = parseYaml(await fs.readFile(args.registryPath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("reconstruct contract registry must be an object");
  }
  const ontologyHandoffFacetContract = parsed.ontology_handoff_facet_contract;
  if (!isRecord(ontologyHandoffFacetContract)) {
    throw new Error(
      "reconstruct contract registry must include ontology_handoff_facet_contract",
    );
  }
  const reasoningOrFormalismProfileContract =
    parsed.reasoning_or_formalism_profile_contract;
  if (!isRecord(reasoningOrFormalismProfileContract)) {
    throw new Error(
      "reconstruct contract registry must include reasoning_or_formalism_profile_contract",
    );
  }
  const predicateExecutionContract = parsePredicateExecutionContract(
    ontologyHandoffFacetContract.predicate_execution_contract,
  );
  const domainCompetencyTraceContract =
    ontologyHandoffFacetContract.domain_competency_trace_contract;
  if (!isRecord(domainCompetencyTraceContract)) {
    throw new Error(
      "reconstruct contract registry must include ontology_handoff_facet_contract.domain_competency_trace_contract",
    );
  }
  const sourceProfileRecords = parsed.source_profile_records;
  if (!Array.isArray(sourceProfileRecords)) {
    throw new Error("reconstruct contract registry must include source_profile_records");
  }

  const registry: ReconstructContractRegistry = {
    schema_version: requiredNumber(parsed, "schema_version", "registry"),
    registry_id: requiredString(parsed, "registry_id", "registry"),
    status: requiredString(parsed, "status", "registry"),
    active_contract_refs: requiredArray(parsed, "active_contract_refs", "registry")
      .map(parseActiveContractRecord),
    source_profile_records: sourceProfileRecords.map(parseSourceProfileRecord),
    candidate_kind_registry: requiredArray(
      parsed,
      "candidate_kind_registry",
      "registry",
    ).map(parseCandidateKindRecord),
    candidate_disposition_registry: requiredArray(
      parsed,
      "candidate_disposition_registry",
      "registry",
    ).map(parseCandidateDispositionRecord),
    coverage_axis_registry: requiredArray(
      parsed,
      "coverage_axis_registry",
      "registry",
    ).map((value, index) =>
      parseAxisRecord(value, index, "coverage_axis_registry")
    ),
    ontology_handoff_axis_registry: requiredArray(
      parsed,
      "ontology_handoff_axis_registry",
      "registry",
    ).map((value, index) =>
      parseAxisRecord(value, index, "ontology_handoff_axis_registry")
    ),
    reference_standard_registry: requiredArray(
      ontologyHandoffFacetContract,
      "reference_standard_registry",
      "ontology_handoff_facet_contract",
    ).map(parseReferenceStandardRecord),
	    reference_pattern_catalog_registry: requiredArray(
	      ontologyHandoffFacetContract,
	      "reference_pattern_catalog_registry",
	      "ontology_handoff_facet_contract",
	    ).map(parseReferencePatternCatalogRecord),
    reasoning_or_formalism_profile_values: {
      representation_formalism_values: stringArray(
        reasoningOrFormalismProfileContract,
        "representation_formalism_values",
        "reasoning_or_formalism_profile_contract",
      ),
      vocabulary_system_values: stringArray(
        reasoningOrFormalismProfileContract,
        "vocabulary_system_values",
        "reasoning_or_formalism_profile_contract",
      ),
      validation_formalism_values: stringArray(
        reasoningOrFormalismProfileContract,
        "validation_formalism_values",
        "reasoning_or_formalism_profile_contract",
      ),
      ontology_type_values: stringArray(
        reasoningOrFormalismProfileContract,
        "ontology_type_values",
        "reasoning_or_formalism_profile_contract",
      ),
      alignment_posture_values: stringArray(
        reasoningOrFormalismProfileContract,
        "alignment_posture_values",
        "reasoning_or_formalism_profile_contract",
      ),
      owl_profile_values: stringArray(
        reasoningOrFormalismProfileContract,
        "owl_profile_values",
        "reasoning_or_formalism_profile_contract",
      ),
    },
	    reasoning_or_formalism_facet_registry: requiredArray(
	      reasoningOrFormalismProfileContract,
	      "facet_registry",
      "reasoning_or_formalism_profile_contract",
    ).map((value, index) =>
      parseFacetRecord(value, index, "reasoning_or_formalism_profile_contract.facet_registry")
    ),
    entity_identity_facet_registry: requiredArray(
      ontologyHandoffFacetContract,
      "entity_identity_facet_registry",
      "ontology_handoff_facet_contract",
    ).map((value, index) =>
      parseFacetRecord(value, index, "entity_identity_facet_registry")
    ),
    instance_assertion_facet_registry: requiredArray(
      ontologyHandoffFacetContract,
      "instance_assertion_facet_registry",
      "ontology_handoff_facet_contract",
    ).map((value, index) =>
      parseFacetRecord(value, index, "instance_assertion_facet_registry")
    ),
    terminology_facet_registry: requiredArray(
      ontologyHandoffFacetContract,
      "terminology_facet_registry",
      "ontology_handoff_facet_contract",
    ).map((value, index) => parseFacetRecord(value, index, "terminology_facet_registry")),
    relation_type_facet_registry: requiredArray(
      ontologyHandoffFacetContract,
      "relation_type_facet_registry",
      "ontology_handoff_facet_contract",
    ).map((value, index) =>
      parseFacetRecord(value, index, "relation_type_facet_registry")
    ),
    classification_facet_registry: requiredArray(
      ontologyHandoffFacetContract,
      "classification_facet_registry",
      "ontology_handoff_facet_contract",
    ).map((value, index) =>
      parseFacetRecord(value, index, "classification_facet_registry")
    ),
    constraint_facet_registry: requiredArray(
      ontologyHandoffFacetContract,
      "constraint_facet_registry",
      "ontology_handoff_facet_contract",
    ).map((value, index) => parseFacetRecord(value, index, "constraint_facet_registry")),
    modeling_concern_applicability_registry: requiredArray(
      ontologyHandoffFacetContract,
      "modeling_concern_applicability_registry",
      "ontology_handoff_facet_contract",
    ).map(parseModelingConcernRecord),
    query_access_contract_registry: requiredArray(
      ontologyHandoffFacetContract,
      "query_access_contract_registry",
      "ontology_handoff_facet_contract",
    ).map((value, index) =>
      parseProofContractRecord(value, index, "query_access_contract_registry")
    ),
    visualization_contract_registry: requiredArray(
      ontologyHandoffFacetContract,
      "visualization_contract_registry",
      "ontology_handoff_facet_contract",
    ).map((value, index) =>
      parseProofContractRecord(value, index, "visualization_contract_registry")
    ),
    graph_exploration_contract_registry: requiredArray(
      ontologyHandoffFacetContract,
      "graph_exploration_contract_registry",
      "ontology_handoff_facet_contract",
    ).map((value, index) =>
      parseProofContractRecord(value, index, "graph_exploration_contract_registry")
    ),
    artifact_authorities: parseArtifactAuthorities(parsed.artifact_authorities),
    validation_gate_catalog: requiredArray(
      parsed,
      "validation_gate_catalog",
      "registry",
    ).map(parseValidationGateRecord),
    predicate_execution_contract: predicateExecutionContract,
    domain_competency_admission_policy: parseDomainCompetencyAdmissionPolicy(
      domainCompetencyTraceContract.admitted_domain_competency_disposition_rule,
    ),
    required_when_predicate_catalog: requiredArray(
      parsed,
      "required_when_predicate_catalog",
      "registry",
    ).map((value, index) =>
      parseRequiredWhenPredicateRecord({
        value,
        index,
        predicateExecutionContract,
      })
    ),
    validator_records: requiredArray(parsed, "validator_records", "registry")
      .map(parseValidatorRecord),
  };

  const sourceProfileMigrationPolicy = parsed.source_profile_migration_policy;
  if (isRecord(sourceProfileMigrationPolicy)) {
    const policy: NonNullable<
      ReconstructContractRegistry["source_profile_migration_policy"]
    > = {};
    const values = optionalPolicyStringArray(
      sourceProfileMigrationPolicy,
      "migration_status_values",
      "source_profile_migration_policy",
    );
    if (values !== undefined) policy.migration_status_values = values;
    registry.source_profile_migration_policy = policy;
  }

  const versionPolicy = parsed.version_policy;
  if (isRecord(versionPolicy)) {
    const policy: NonNullable<ReconstructContractRegistry["version_policy"]> = {};
    const requiredFields = optionalPolicyStringArray(
      versionPolicy,
      "selected_source_profile_snapshot_required_fields",
      "version_policy",
    );
    if (requiredFields !== undefined) {
      policy.selected_source_profile_snapshot_required_fields = requiredFields;
    }
    const migrationStatusValuesRef = optionalPolicyString(
      versionPolicy,
      "selected_source_profile_migration_status_values_ref",
      "version_policy",
    );
    if (migrationStatusValuesRef !== undefined) {
      policy.selected_source_profile_migration_status_values_ref =
        migrationStatusValuesRef;
    }
    const contractMigrationStatusValues = optionalPolicyStringArray(
      versionPolicy,
      "contract_migration_status_values",
      "version_policy",
    );
    if (contractMigrationStatusValues !== undefined) {
      policy.contract_migration_status_values = contractMigrationStatusValues;
    }
    registry.version_policy = policy;
  }

  validateReconstructContractRegistry(registry);
  return registry;
}

function assertUnique(values: string[], description: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${description}: ${value}`);
    }
    seen.add(value);
  }
}

export function validateReconstructContractRegistry(
  registry: ReconstructContractRegistry,
): void {
  assertUnique(
    registry.active_contract_refs.map((record) => record.contract_id),
    "active contract id",
  );
  assertUnique(
    registry.candidate_kind_registry.map((record) => record.candidate_kind_id),
    "candidate kind id",
  );
  assertUnique(
    registry.candidate_disposition_registry.map((record) => record.disposition_id),
    "candidate disposition id",
  );
  assertUnique(
    registry.coverage_axis_registry.map((record) => record.axis_id),
    "coverage axis id",
  );
  assertUnique(
    registry.ontology_handoff_axis_registry.map((record) => record.axis_id),
    "ontology handoff axis id",
  );
  assertUnique(
    registry.reference_standard_registry.map((record) => record.standard_ref_id),
    "reference standard id",
  );
  assertUnique(
    registry.reference_pattern_catalog_registry.map((record) =>
      record.pattern_catalog_ref_id
    ),
    "reference pattern catalog id",
  );
  assertUnique(
    Object.values(registry.artifact_authorities).map((record) => record.authority_ref),
    "artifact authority ref",
  );
  assertUnique(
    registry.validation_gate_catalog.map((record) => record.gate_id),
    "validation gate id",
  );
  assertUnique(
    registry.required_when_predicate_catalog.map((record) => record.predicate_id),
    "required-when predicate id",
  );
  assertUnique(
    registry.validator_records.map((record) => record.validator_id),
    "validator id",
  );

  for (const evaluatorId of registry.predicate_execution_contract
    .allowed_predicate_evaluator_ids) {
    if (typeof evaluatorId !== "string" || evaluatorId.trim().length === 0) {
      throw new Error("allowed predicate evaluator ids must be non-empty strings");
    }
  }
  const allowedEvaluatorIds = new Set(
    registry.predicate_execution_contract.allowed_predicate_evaluator_ids,
  );
  if (
    !allowedEvaluatorIds.has(
      registry.predicate_execution_contract.default_predicate_evaluator_id,
    )
  ) {
    throw new Error(
      "default predicate evaluator id must be listed in allowed_predicate_evaluator_ids",
    );
  }
  const allowedPredicatePhases = new Set(
    registry.predicate_execution_contract.predicate_phase_values,
  );
  if (
    !allowedPredicatePhases.has(
      registry.predicate_execution_contract.default_predicate_phase,
    )
  ) {
    throw new Error(
      "default predicate phase must be listed in predicate_phase_values",
    );
  }
  const admissionPolicy = registry.domain_competency_admission_policy;
  const supportedAdmissionPolicyIds = new Set(
    admissionPolicy.supported_runtime_admission_policy_ids,
  );
  if (!supportedAdmissionPolicyIds.has(admissionPolicy.admission_policy_id)) {
    throw new Error(
      `Domain competency admission policy ${admissionPolicy.admission_policy_id} must be listed in supported_runtime_admission_policy_ids`,
    );
  }
  const allowedPriorityValues = new Set(["P1", "P2", "P3"]);
  const seenPriorityValues = new Set<string>();
  for (const priority of [
    ...admissionPolicy.required_priority_values,
    ...admissionPolicy.metadata_priority_values,
  ]) {
    if (!allowedPriorityValues.has(priority)) {
      throw new Error(
        `Domain competency admission policy ${admissionPolicy.admission_policy_id} uses unsupported priority ${priority}`,
      );
    }
    if (seenPriorityValues.has(priority)) {
      throw new Error(
        `Domain competency admission policy ${admissionPolicy.admission_policy_id} repeats priority ${priority}`,
      );
    }
    seenPriorityValues.add(priority);
  }

  const artifactRefs = new Set(
    Object.values(registry.artifact_authorities).map((record) => record.authority_ref),
  );
  for (const [artifactId, artifact] of Object.entries(registry.artifact_authorities)) {
    if (artifact.validation_ref !== null && !artifactRefs.has(artifact.validation_ref)) {
      throw new Error(
        `artifact_authorities.${artifactId}.validation_ref references unknown artifact authority ${artifact.validation_ref}`,
      );
    }
  }

  const gateIds = new Set(registry.validation_gate_catalog.map((record) => record.gate_id));
  const predicateIds = new Set(
    registry.required_when_predicate_catalog.map((record) => record.predicate_id),
  );
  const activePredicateIds = new Set(
    registry.validation_gate_catalog.map((record) => record.required_when),
  );
  for (const predicate of registry.required_when_predicate_catalog) {
    if (predicate.usage_status === "reserved") {
      if (!predicate.reserved_for) {
        throw new Error(
          `Reserved required-when predicate ${predicate.predicate_id} must declare reserved_for`,
        );
      }
      if (activePredicateIds.has(predicate.predicate_id)) {
        throw new Error(
          `Reserved required-when predicate ${predicate.predicate_id} must not be used by an active validation gate`,
        );
      }
    } else if (predicate.reserved_for) {
      throw new Error(
        `Required-when predicate ${predicate.predicate_id} declares reserved_for without usage_status=reserved`,
      );
    }
    if (!allowedEvaluatorIds.has(predicate.predicate_evaluator_id)) {
      throw new Error(
        `Required-when predicate ${predicate.predicate_id} uses unknown evaluator ${predicate.predicate_evaluator_id}`,
      );
    }
    if (!allowedPredicatePhases.has(predicate.predicate_phase)) {
      throw new Error(
        `Required-when predicate ${predicate.predicate_id} uses unknown phase ${predicate.predicate_phase}`,
      );
    }
  }
  for (const gate of registry.validation_gate_catalog) {
    if (!artifactRefs.has(gate.validation_artifact_ref)) {
      throw new Error(
        `Validation gate ${gate.gate_id} references unknown validation artifact ${gate.validation_artifact_ref}`,
      );
    }
    if (!predicateIds.has(gate.required_when)) {
      throw new Error(
        `Validation gate ${gate.gate_id} references unknown required_when predicate ${gate.required_when}`,
      );
    }
  }
  for (const validator of registry.validator_records) {
    for (const gateId of validator.gate_ids) {
      if (!gateIds.has(gateId)) {
        throw new Error(
          `Validator ${validator.validator_id} references unknown gate ${gateId}`,
        );
      }
    }
    if (!artifactRefs.has(validator.output_ref)) {
      throw new Error(
        `Validator ${validator.validator_id} references unknown output artifact ${validator.output_ref}`,
      );
    }
  }

  const profileIds = new Set<string>();
  const defaultProfilesByKind = new Map<TargetMaterialKind, string[]>();
  const allowedSourceProfileMigrationStatuses = new Set(
    registry.source_profile_migration_policy?.migration_status_values ?? [],
  );
  for (const record of registry.source_profile_records) {
    if (profileIds.has(record.profile_id)) {
      throw new Error(`Duplicate source profile id: ${record.profile_id}`);
    }
    profileIds.add(record.profile_id);
    if (record.is_default_for_kind) {
      const existing = defaultProfilesByKind.get(record.target_material_kind) ?? [];
      existing.push(record.profile_id);
      defaultProfilesByKind.set(record.target_material_kind, existing);
    }
    if (
      allowedSourceProfileMigrationStatuses.size > 0 &&
      !allowedSourceProfileMigrationStatuses.has(record.migration_status)
    ) {
      throw new Error(
        `Source profile ${record.profile_id} uses unsupported migration_status ${record.migration_status}`,
      );
    }
    for (const field of PROFILE_MIGRATION_FIELDS) {
      for (const ref of record[field]) {
        if (!profileIds.has(ref)) {
          // Forward references are allowed in YAML order, so final closure is below.
          continue;
        }
      }
    }
  }

  for (const [targetMaterialKind, defaultProfileIds] of defaultProfilesByKind) {
    if (defaultProfileIds.length > 1) {
      throw new Error(
        `Multiple default source profiles for target material kind ${targetMaterialKind}: ${defaultProfileIds.join(", ")}`,
      );
    }
  }
  for (const targetMaterialKind of new Set(
    registry.source_profile_records.map((record) => record.target_material_kind),
  )) {
    if (!defaultProfilesByKind.has(targetMaterialKind)) {
      throw new Error(
        `No default source profile for target material kind ${targetMaterialKind}`,
      );
    }
  }

  for (const record of registry.source_profile_records) {
    for (const field of PROFILE_MIGRATION_FIELDS) {
      for (const ref of record[field]) {
        if (!profileIds.has(ref)) {
          throw new Error(
            `Source profile ${record.profile_id} ${field} references unknown profile ${ref}`,
          );
        }
      }
    }
  }

  const sourceProfileStatusRef =
    registry.version_policy?.selected_source_profile_migration_status_values_ref;
  if (
    sourceProfileStatusRef &&
    sourceProfileStatusRef !== "source_profile_migration_policy.migration_status_values"
  ) {
    throw new Error(
      "version_policy.selected_source_profile_migration_status_values_ref must point to source_profile_migration_policy.migration_status_values",
    );
  }
  const allowedContractMigrationStatuses = new Set(
    registry.version_policy?.contract_migration_status_values ?? [],
  );
  for (const record of registry.active_contract_refs) {
    if (
      allowedContractMigrationStatuses.size > 0 &&
      !allowedContractMigrationStatuses.has(record.migration_status)
    ) {
      throw new Error(
        `Active contract ${record.contract_id} uses unsupported migration_status ${record.migration_status}`,
      );
    }
  }
  for (const record of registry.reference_standard_registry) {
    if (
      allowedContractMigrationStatuses.size > 0 &&
      !allowedContractMigrationStatuses.has(record.migration_status)
    ) {
      throw new Error(
        `Reference standard ${record.standard_ref_id} uses unsupported migration_status ${record.migration_status}`,
      );
    }
  }
  for (const record of registry.reference_pattern_catalog_registry) {
    if (
      allowedContractMigrationStatuses.size > 0 &&
      !allowedContractMigrationStatuses.has(record.migration_status)
    ) {
      throw new Error(
        `Reference pattern catalog ${record.pattern_catalog_ref_id} uses unsupported migration_status ${record.migration_status}`,
      );
    }
  }
}

export async function validateSourceProfileDefinitionHashes(args: {
  projectRoot: string;
  registry: ReconstructContractRegistry;
}): Promise<void> {
  await Promise.all(
    args.registry.source_profile_records.map(async (record) => {
      if (record.definition_ref === null) {
        if (record.definition_sha256 !== "not_applicable") {
          throw new Error(
            `Source profile ${record.profile_id} without definition_ref must use definition_sha256=not_applicable`,
          );
        }
        return;
      }
      const resolved = resolveRegistryRef({
        projectRoot: args.projectRoot,
        ref: record.definition_ref,
      });
      const actual = await sha256File(resolved);
      if (actual !== record.definition_sha256) {
        throw new Error(
          `Source profile ${record.profile_id} hash mismatch: expected ${record.definition_sha256}, got ${actual}`,
        );
      }
    }),
  );
}

export function reconstructContractRegistryPathFromProfilesRoot(profilesRoot: string): string {
  return path.join(
    path.dirname(path.resolve(profilesRoot)),
    "reconstruct-contract-registry.yaml",
  );
}
