#!/usr/bin/env node

import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type {
  InvocationBindingArtifact,
  InvocationInterpretationArtifact,
  ReviewContextManifestArtifact,
  ReviewContextManifestPacketRef,
  ReviewContextSource,
  ReviewDomainBindingArtifact,
  ReviewDomainDocumentBinding,
  ReviewExecutionPlan,
  ReviewLensPromptPacketSeat,
  ReviewSessionMetadata,
  ReviewValueAlignmentCriteriaArtifact,
} from "../review/artifact-types.js";
import {
  fileExists,
  isoNow,
  readYamlDocument,
  writeYamlDocument,
  toRelativePath,
  truncateForEmbedding,
} from "../review/review-artifact-utils.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";
import { writeAndThrowStructuredFailureRecord } from "../review/failure-records.js";
import { resolveInstallationPath } from "../discovery/installation-paths.js";
import { isOntoRoot } from "../discovery/onto-home.js";
import {
  ISSUE_ARTIFACT_IDS,
  issueArtifactConsumerId,
} from "../review/issue-artifact-runtime.js";

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

async function readOptionalText(targetPath: string): Promise<string> {
  if (!(await fileExists(targetPath))) {
    return "";
  }
  return fs.readFile(targetPath, "utf8");
}

function renderBoundaryPolicySection(
  binding: InvocationBindingArtifact,
  projectRoot: string,
  options?: { tools?: "required" | "optional" },
): string {
  const toolsLine =
    options?.tools !== undefined ? `\n- tools: ${options.tools}` : "";
  return `## Boundary Policy
- web research: ${binding.boundary_policy.web_research_policy}
- repo exploration: ${binding.boundary_policy.repo_exploration_policy}
- recursive reference expansion: ${binding.boundary_policy.recursive_reference_expansion_policy}
- filesystem allowed roots:
${binding.boundary_policy.filesystem_scope.allowed_roots
  .map((rootPath) => `  - ${toRelativePath(rootPath, projectRoot)}`)
  .join("\n")}
- source mutation: ${binding.boundary_policy.write_policy.source_mutation_policy}
- allowed output refs:
${binding.boundary_policy.write_policy.allowed_output_refs
  .map((outputPath) => `  - ${toRelativePath(outputPath, projectRoot)}`)
  .join("\n")}
- extra exploration citation required: ${
    binding.boundary_policy.provenance_policy.extra_exploration_citation_required
  }
- web source citation required: ${
    binding.boundary_policy.provenance_policy.web_source_citation_required
  }${toolsLine}`;
}

function renderBoundaryEnforcementSection(
  binding: InvocationBindingArtifact,
): string {
  return `## Boundary Enforcement Profile
- prompt: ${binding.boundary_enforcement_profile.prompt_boundary_enforcement}
- filesystem: ${binding.boundary_enforcement_profile.filesystem_boundary_enforcement}
- network: ${binding.boundary_enforcement_profile.network_boundary_enforcement}
- write: ${binding.boundary_enforcement_profile.write_boundary_enforcement}`;
}

function renderEffectiveBoundaryStateSection(
  binding: InvocationBindingArtifact,
  projectRoot: string,
): string {
  const state = binding.effective_boundary_state;
  return `## Effective Boundary State
- web research: requested=${state.web_research.requested_policy}, effective=${state.web_research.effective_policy}, guarantee=${state.web_research.guarantee_level}
- repo exploration: requested=${state.repo_exploration.requested_policy}, effective=${state.repo_exploration.effective_policy}, guarantee=${state.repo_exploration.guarantee_level}
- recursive reference expansion: requested=${state.recursive_reference_expansion.requested_policy}, effective=${state.recursive_reference_expansion.effective_policy}, guarantee=${state.recursive_reference_expansion.guarantee_level}
- source mutation: requested=${state.source_mutation.requested_policy}, effective=${state.source_mutation.effective_policy}, guarantee=${state.source_mutation.guarantee_level}
- filesystem effective allowed roots:
${state.filesystem_scope.effective_allowed_roots
  .map((rootPath) => `  - ${toRelativePath(rootPath, projectRoot)}`)
  .join("\n")}
- filesystem guarantee: ${state.filesystem_scope.guarantee_level}`;
}

export function renderLensOutputSchemaGate(sessionDomain: string): string {
  const isDomainless =
    sessionDomain.length === 0 ||
    sessionDomain === "none" ||
    sessionDomain === "@-";
  const constraintsExample = isDomainless
    ? "[]"
    : [
        '- source_doc: ".onto/domains/{domain}/{domain-file}.md"',
        '  source_version_or_snapshot_id: "{session snapshot or document version}"',
        '  anchor: "{section heading, rule id, or stable line anchor}"',
      ].join("\n");

  return `## Machine-Parsed Output Schema Gate
The review record assembler reads the two provenance sections below as YAML.
Allowed content for these sections is only valid YAML list content.

Use this exact shape:

\`\`\`markdown
### Domain Constraints Used
${constraintsExample}

### Domain Context Assumptions
[]
\`\`\`

Rules:
- For \`session_domain=none\`, \`session_domain=@-\`, or no domain document usage, write exactly \`[]\` under \`### Domain Constraints Used\`.
- For informal domain/context assumptions, write a YAML list of strings under \`### Domain Context Assumptions\`.
- Each \`Domain Constraints Used\` item must be an object with these required fields: \`source_doc\`, \`source_version_or_snapshot_id\`, \`anchor\`.
- These headings may be \`###\` or \`##\`, but their body must remain valid YAML list content.`;
}

const DEFAULT_MAX_EMBED_LINES = 300;

// Core role IDs derived from .onto/authority/core-lens-registry.yaml (single source of truth)
import { loadCoreLensRegistry } from "../discovery/lens-registry.js";
const CORE_ROLE_IDS = new Set(loadCoreLensRegistry().core_role_ids);

/**
 * Lens-to-domain file mapping. Each core lens reads one specific domain file.
 * axiology and synthesize have no domain document (by design).
 */
const LENS_DOMAIN_FILE_MAP: Record<string, string> = {
  logic: "logic_rules.md",
  structure: "structure_spec.md",
  dependency: "dependency_rules.md",
  semantics: "concepts.md",
  pragmatics: "competency_qs.md",
  evolution: "extension_cases.md",
  coverage: "domain_scope.md",
  conciseness: "conciseness_rules.md",
};

/**
 * Resolve domain directory per the Product Locality Principle §2.3:
 *
 * Resolution order (project-override rule):
 * 1. Project-level domain: {project}/.onto/domains/{domain}/
 * 2. User-level global domain: ~/.onto/domains/{domain}/
 * 3. Installation default: ontoHome/.onto/domains/{domain}/
 * 4. Dev-mode install root: projectRoot when it IS the onto installation (running from the onto repo itself)
 *
 * Directory-level all-or-nothing: the entire directory from one location is used.
 * Terminal failure: returns { dir: null, attempted: [...] } — caller formats the error.
 * Returns the resolved directory with the accumulated attempted paths for error surfacing.
 */
function resolveDomainDirectory(
  domain: string,
  projectRoot: string,
  ontoHome: string | undefined,
): { dir: string | null; attempted: string[] } {
  const attempted: string[] = [];

  // 1. Project-level domain (highest priority)
  const projectDomainPath = path.join(projectRoot, ".onto", "domains", domain);
  attempted.push(projectDomainPath);
  if (fsSync.existsSync(projectDomainPath)) return { dir: projectDomainPath, attempted };

  // 2. User-level global domain (~/.onto/domains/)
  const userDomainPath = path.join(os.homedir(), ".onto", "domains", domain);
  attempted.push(userDomainPath);
  if (fsSync.existsSync(userDomainPath)) return { dir: userDomainPath, attempted };

  // 3. Installation default (ontoHome/.onto/domains/)
  // Phase 7 (2026-04-21): resolveInstallationPath resolves canonical
  // .onto/domains/ only; top-level domains/ is not accepted.
  if (typeof ontoHome === "string" && ontoHome.length > 0) {
    try {
      const domainsRoot = resolveInstallationPath("domains", ontoHome);
      const homePath = path.join(domainsRoot, domain);
      attempted.push(homePath);
      if (fsSync.existsSync(homePath)) return { dir: homePath, attempted };
    } catch {
      // No domains directory under ontoHome at all — skip to dev-mode install root.
    }
  }

  // 4. Dev-mode install root: only when projectRoot is an onto installation itself
  // (e.g. running `onto` from a clone of the onto repo). Without this gate an
  // external project that happens to have a `domains/{X}/` directory at its
  // root would be falsely picked up as an installation bundle.
  if (isOntoRoot(projectRoot)) {
    try {
      const domainsRoot = resolveInstallationPath("domains", projectRoot);
      const devInstallPath = path.join(domainsRoot, domain);
      attempted.push(devInstallPath);
      if (fsSync.existsSync(devInstallPath)) return { dir: devInstallPath, attempted };
    } catch {
      // projectRoot has neither .onto/domains/ nor domains/ — terminal miss.
    }
  }

  return { dir: null, attempted };
}

/**
 * Scan a domain directory for all .md files, returning absolute paths.
 * Includes both standard files (8 mapped) and extension files (9th+).
 */
/**
 * Render the "Domain Document Refs" section for a lens prompt packet.
 * - Primary: the lens-specific mapped file (mandatory reading for this lens)
 * - Supplementary: other domain files (optional — agent decides whether to read)
 *
 * Domain documents cross-reference each other (e.g., logic_rules.md references
 * concepts.md definitions). Providing supplementary refs as file paths (not
 * embedded content) costs ~7 lines and gives the agent access to the full
 * domain context when needed.
 */
function renderDomainDocumentRefsSection(
  lensId: string,
  domainDir: string | null,
  allDomainFiles: string[],
  projectRoot: string,
): string {
  if (!domainDir || allDomainFiles.length === 0) return "";

  const mappedFileName = LENS_DOMAIN_FILE_MAP[lensId];
  const lines: string[] = ["", "## Domain Document Refs"];

  if (mappedFileName) {
    const primaryPath = path.join(domainDir, mappedFileName);
    if (fsSync.existsSync(primaryPath)) {
      lines.push(`- primary: ${toRelativePath(primaryPath, projectRoot)}`);
    }
  }

  const supplementary = allDomainFiles.filter(
    (filePath) => path.basename(filePath) !== mappedFileName,
  );
  if (supplementary.length > 0) {
    lines.push("- supplementary:");
    for (const filePath of supplementary) {
      lines.push(`  - ${toRelativePath(filePath, projectRoot)}`);
    }
  }

  return lines.join("\n");
}

function scanDomainFiles(domainDir: string): string[] {
  try {
    return fsSync.readdirSync(domainDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join(domainDir, name))
      .sort();
  } catch {
    return [];
  }
}

function consumerIdForLens(lensId: string): string {
  return `lens:${lensId}`;
}

function allReviewConsumers(lensIds: string[]): string[] {
  return [
    "teamlead",
    ...lensIds.map(consumerIdForLens),
    ...lensIds.map((lensId) => `deliberation:${lensId}`),
    ...ISSUE_ARTIFACT_IDS.map(issueArtifactConsumerId),
    "controlled-deliberation",
    "synthesize",
    "final-output",
    "review-record",
  ];
}

async function fileSha256(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function optionalFileSha256(filePath: string): Promise<string | null> {
  if (!(await fileExists(filePath))) return null;
  return fileSha256(filePath);
}

function requiredDomainFileNamesForLenses(lensIds: string[]): string[] {
  return [
    ...new Set(
      lensIds
        .map((lensId) => LENS_DOMAIN_FILE_MAP[lensId])
        .filter((fileName): fileName is string => typeof fileName === "string"),
    ),
  ].sort();
}

async function buildDomainDocumentBinding(args: {
  filePath: string;
  required: boolean;
  allowedConsumers: string[];
}): Promise<ReviewDomainDocumentBinding> {
  const exists = await fileExists(args.filePath);
  return {
    doc_id: path.basename(args.filePath, ".md"),
    path: args.filePath,
    required: args.required,
    status: exists ? "present" : "missing",
    sha256: exists ? await fileSha256(args.filePath) : null,
    allowed_consumers: args.allowedConsumers,
  };
}

function domainDocumentAllowedConsumers(
  fileName: string,
  lensIds: string[],
): string[] {
  if (fileName === "problem_framing_profile.md") {
    return [issueArtifactConsumerId("problem-framing"), "review-record"];
  }
  const lensIdsMappedToFile = Object.entries(LENS_DOMAIN_FILE_MAP)
    .filter(([, mappedFileName]) => mappedFileName === fileName)
    .map(([lensId]) => lensId);
  const mappedLensIds = lensIds.filter(
    (lensId) => LENS_DOMAIN_FILE_MAP[lensId] === fileName,
  );
  if (mappedLensIds.length > 0) {
    return [
      ...mappedLensIds.map(consumerIdForLens),
      ...mappedLensIds.map((lensId) => `deliberation:${lensId}`),
      "review-record",
    ];
  }
  if (lensIdsMappedToFile.length > 0) {
    return ["review-record"];
  }
  return [
    ...lensIds.map(consumerIdForLens),
    ...lensIds.map((lensId) => `deliberation:${lensId}`),
    "review-record",
  ];
}

function domainContextSourceKind(
  doc: ReviewDomainDocumentBinding,
): string {
  if (doc.doc_id === "problem_framing_profile") {
    return "domain_problem_framing_profile";
  }
  return doc.required ? "domain_required_doc" : "domain_optional_doc";
}

function domainFilesAllowedForConsumer(
  contextManifest: ReviewContextManifestArtifact,
  consumerId: string,
): string[] {
  return contextManifest.context_sources
    .filter(
      (source) =>
        source.context_source_id.startsWith("domain:") &&
        source.allowed_consumers.includes(consumerId),
    )
    .map((source) => source.source_ref);
}

function deriveContextAccessMatrix(
  contextSources: ReviewContextSource[],
): Record<string, string[]> {
  const matrix: Record<string, string[]> = {};
  for (const source of contextSources) {
    for (const consumerId of source.allowed_consumers) {
      matrix[consumerId] = [
        ...(matrix[consumerId] ?? []),
        source.context_source_id,
      ];
    }
  }
  return Object.fromEntries(
    Object.entries(matrix).map(([consumerId, sourceIds]) => [
      consumerId,
      [...new Set(sourceIds)].sort(),
    ]),
  );
}

function validateContextAccessMatrix(
  contextSources: ReviewContextSource[],
  matrix: Record<string, string[]>,
): void {
  const expected = deriveContextAccessMatrix(contextSources);
  const expectedText = JSON.stringify(expected);
  const actualText = JSON.stringify(matrix);
  if (actualText !== expectedText) {
    throw new Error(
      `review-context-manifest derived_context_access_matrix does not match context_sources[].allowed_consumers.`,
    );
  }
}

function makeValueAlignmentCriteria(args: {
  sessionId: string;
  interpretationPath: string;
  interpretation: InvocationInterpretationArtifact;
}): ReviewValueAlignmentCriteriaArtifact {
  const hasAmbiguity = args.interpretation.ambiguity_notes.length > 0;
  const userConfirmed =
    args.interpretation.value_alignment_confirmation?.status === "confirmed";
  const confirmationRequired = hasAmbiguity && !userConfirmed;
  const ambiguityResolved = !hasAmbiguity || userConfirmed;
  const dispatchDecision = confirmationRequired
    ? "block_for_confirmation"
    : "allow_dispatch";
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    dispatch_state: confirmationRequired ? "blocked" : "allow_dispatch",
    criteria: [
      {
        criterion_id: "user-request-intent",
        statement: args.interpretation.intent_summary,
        source_kind: "invocation_interpretation",
        source_ref: args.interpretationPath,
        authority_rank: 1,
        inference_owner: "main",
        confidence: confirmationRequired ? 0.7 : 1,
        confidence_basis: confirmationRequired
          ? "explicit invocation intent has ambiguity notes that require user confirmation"
          : userConfirmed
            ? "explicit invocation intent ambiguity confirmed by user"
            : "explicit invocation intent summary",
        confirmation_status: confirmationRequired ? "pending_confirmation" : "confirmed",
        ambiguity_status: ambiguityResolved ? "clear" : "ambiguous",
        conflict_status: "none",
        lifecycle_state: confirmationRequired ? "pending_confirmation" : "confirmed",
        lineage_ref: args.interpretationPath,
        dispatch_decision: dispatchDecision,
      },
    ],
  };
}

async function ensureValueAlignmentDispatchAllowed(args: {
  sessionRoot: string;
  valueAlignmentCriteriaPath: string;
  valueAlignmentCriteria: ReviewValueAlignmentCriteriaArtifact;
  interpretationPath: string;
  bindingPath: string;
}): Promise<void> {
  if (args.valueAlignmentCriteria.dispatch_state === "allow_dispatch") {
    return;
  }
  const blockingCriteria = args.valueAlignmentCriteria.criteria.filter(
    (criterion) => criterion.dispatch_decision !== "allow_dispatch",
  );
  await writeAndThrowStructuredFailureRecord({
    sessionRoot: args.sessionRoot,
    phase: "pre_manifest.value_alignment_gate",
    reasonCode: "review_value_alignment_dispatch_blocked",
    humanMessage:
      "Review value-alignment criteria require confirmation before lens dispatch.",
    requiredUserAction:
      "Confirm, revise, or narrow the review purpose/value criteria before starting dispatch.",
    retrySafety: "safe_after_input_change",
    artifactTrust: "pre_manifest_artifacts_trusted",
    dispatchState: "dispatch_blocked",
    artifactRefs: {
      interpretation: args.interpretationPath,
      binding: args.bindingPath,
      review_value_alignment_criteria: args.valueAlignmentCriteriaPath,
    },
    mcpErrorCode: "ONTO_REVIEW_VALUE_ALIGNMENT_BLOCKED",
    detailsKind: "value_alignment_gate",
    details: {
      dispatch_state: args.valueAlignmentCriteria.dispatch_state,
      blocking_criteria: blockingCriteria.map((criterion) => ({
        criterion_id: criterion.criterion_id,
        dispatch_decision: criterion.dispatch_decision,
        confirmation_status: criterion.confirmation_status,
        ambiguity_status: criterion.ambiguity_status,
        conflict_status: criterion.conflict_status,
        lifecycle_state: criterion.lifecycle_state,
      })),
    },
  });
}

async function writePreManifestContextArtifacts(args: {
  projectRoot: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  binding: InvocationBindingArtifact;
  interpretationPath: string;
  interpretation: InvocationInterpretationArtifact;
  sessionMetadataPath: string;
  contextCandidateAssemblyPath: string;
  lensIds: string[];
  isNoDomain: boolean;
  resolvedDomainDir: string | null;
  domainResolutionAttempts: string[];
  domainAllFiles: string[];
}): Promise<ReviewContextManifestArtifact> {
  const domainBindingPath =
    args.executionPlan.domain_binding_path ??
    path.join(args.sessionRoot, "execution-preparation", "domain-binding.yaml");
  const reviewValueAlignmentCriteriaPath =
    args.executionPlan.review_value_alignment_criteria_path ??
    path.join(
      args.sessionRoot,
      "execution-preparation",
      "review-value-alignment-criteria.yaml",
    );
  const actorConsumerBindingsPath =
    args.executionPlan.actor_consumer_bindings_path ??
    path.join(args.sessionRoot, "execution-preparation", "actor-consumer-bindings.yaml");
  const reviewTargetProfilePath = args.executionPlan.review_target_profile_path;
  const reviewContextManifestPath =
    args.executionPlan.review_context_manifest_path ??
    path.join(args.sessionRoot, "execution-preparation", "review-context-manifest.yaml");

  const requiredDomainFileNames = args.isNoDomain
    ? []
    : requiredDomainFileNamesForLenses(args.lensIds);
  const requiredDomainDocs = await Promise.all(
    requiredDomainFileNames.map((fileName) =>
      buildDomainDocumentBinding({
        filePath: path.join(args.resolvedDomainDir ?? "", fileName),
        required: true,
        allowedConsumers: domainDocumentAllowedConsumers(
          fileName,
          args.lensIds,
        ),
      }),
    ),
  );
  const missingRequiredDocs = requiredDomainDocs.filter(
    (doc) => doc.status === "missing",
  );
  if (missingRequiredDocs.length > 0) {
    const blockedDomainBinding: ReviewDomainBindingArtifact = {
      schema_version: "1",
      session_id: args.executionPlan.session_id,
      created_at: isoNow(),
      selected_domain: args.binding.resolved_session_domain,
      selection_mode: args.binding.domain_final_selection.selection_mode,
      domain_sentinel: false,
      domain_directory: args.resolvedDomainDir,
      attempted_directories: args.domainResolutionAttempts,
      validation_status: "blocked",
      required_docs: requiredDomainDocs,
      optional_docs: [],
    };
    await writeYamlDocument(domainBindingPath, blockedDomainBinding);
    await writeAndThrowStructuredFailureRecord({
      sessionRoot: args.sessionRoot,
      phase: "pre_manifest.domain_binding",
      reasonCode: "required_domain_docs_missing",
      humanMessage: `Required domain document(s) are missing for domain ${args.binding.resolved_session_domain}.`,
      requiredUserAction:
        "Add the missing required domain document(s), choose another domain, or run with domain=none.",
      retrySafety: "safe_after_input_change",
      artifactTrust: "pre_manifest_artifacts_trusted",
      dispatchState: "dispatch_blocked",
      artifactRefs: {
        binding: args.binding.binding_output_path,
        domain_binding: domainBindingPath,
      },
      mcpErrorCode: "ONTO_REVIEW_DOMAIN_BINDING_FAILED",
      detailsKind: "domain_binding",
      details: {
        selected_domain: args.binding.resolved_session_domain,
        missing_required_docs: missingRequiredDocs.map((doc) => doc.path),
      },
    });
  }

  const requiredPaths = new Set(requiredDomainDocs.map((doc) => doc.path));
  const optionalDomainDocs = await Promise.all(
    args.domainAllFiles
      .filter((filePath) => !requiredPaths.has(filePath))
      .map((filePath) =>
        buildDomainDocumentBinding({
          filePath,
          required: false,
          allowedConsumers: domainDocumentAllowedConsumers(
            path.basename(filePath),
            args.lensIds,
          ),
        }),
      ),
  );
  const domainBinding: ReviewDomainBindingArtifact = {
    schema_version: "1",
    session_id: args.executionPlan.session_id,
    created_at: isoNow(),
    selected_domain: args.binding.resolved_session_domain,
    selection_mode: args.binding.domain_final_selection.selection_mode,
    domain_sentinel: args.isNoDomain,
    domain_directory: args.resolvedDomainDir,
    attempted_directories: args.domainResolutionAttempts,
    validation_status: "valid",
    required_docs: requiredDomainDocs,
    optional_docs: optionalDomainDocs,
  };

  const valueAlignmentCriteria = makeValueAlignmentCriteria({
    sessionId: args.executionPlan.session_id,
    interpretationPath: args.interpretationPath,
    interpretation: args.interpretation,
  });
  await writeYamlDocument(domainBindingPath, domainBinding);
  await writeYamlDocument(reviewValueAlignmentCriteriaPath, valueAlignmentCriteria);
  await ensureValueAlignmentDispatchAllowed({
    sessionRoot: args.sessionRoot,
    valueAlignmentCriteriaPath: reviewValueAlignmentCriteriaPath,
    valueAlignmentCriteria,
    interpretationPath: args.interpretationPath,
    bindingPath: args.binding.binding_output_path,
  });

  const allConsumers = allReviewConsumers(args.lensIds);
  const contextSources: ReviewContextSource[] = [
    {
      context_source_id: "materialized-input",
      source_kind: "materialized_input",
      source_ref: args.binding.materialized_input_path,
      source_sha256: await optionalFileSha256(args.binding.materialized_input_path),
      required: true,
      sensitivity: "internal",
      allowed_consumers: allConsumers,
    },
    {
      context_source_id: "target-snapshot",
      source_kind: "target_snapshot",
      source_ref: args.binding.target_snapshot_path,
      source_sha256: await optionalFileSha256(args.binding.target_snapshot_path),
      required: true,
      sensitivity: "internal",
      allowed_consumers: allConsumers,
    },
    {
      context_source_id: "context-candidate-assembly",
      source_kind: "context_candidate_assembly",
      source_ref: args.contextCandidateAssemblyPath,
      source_sha256: await optionalFileSha256(args.contextCandidateAssemblyPath),
      required: true,
      sensitivity: "internal",
      allowed_consumers: allConsumers,
    },
    {
      context_source_id: "review-target-profile",
      source_kind: "review_target_profile",
      source_ref: reviewTargetProfilePath,
      source_sha256: await optionalFileSha256(reviewTargetProfilePath),
      required: true,
      sensitivity: "internal",
      allowed_consumers: allConsumers,
    },
    {
      context_source_id: "review-value-alignment-criteria",
      source_kind: "review_value_alignment_criteria",
      source_ref: reviewValueAlignmentCriteriaPath,
      source_sha256: await optionalFileSha256(reviewValueAlignmentCriteriaPath),
      required: true,
      sensitivity: "internal",
      allowed_consumers: allConsumers,
    },
    ...[...requiredDomainDocs, ...optionalDomainDocs]
      .filter((doc) => doc.status === "present")
      .map((doc): ReviewContextSource => ({
        context_source_id: `domain:${doc.doc_id}`,
        source_kind: domainContextSourceKind(doc),
        source_ref: doc.path,
        source_sha256: doc.sha256,
        required: doc.required,
        sensitivity: "internal",
        allowed_consumers: doc.allowed_consumers,
      })),
  ];
  const derivedContextAccessMatrix = deriveContextAccessMatrix(contextSources);
  validateContextAccessMatrix(contextSources, derivedContextAccessMatrix);

  const contextManifest: ReviewContextManifestArtifact = {
    schema_version: "1",
    producer: "onto-review-runtime",
    producer_version: "review-runtime-settings-domain-axiology-plan-20260523",
    settings_schema_version: "settings.json/v1",
    domain_registry_version: "domain-docs/v1",
    alignment_contract_version: "review-value-alignment-criteria/v1",
    lifecycle_state: "validated",
    session_id: args.executionPlan.session_id,
    target_refs: args.binding.resolved_target_scope.resolved_refs,
    domain_binding_ref: domainBindingPath,
    review_value_alignment_criteria_ref: reviewValueAlignmentCriteriaPath,
    actor_consumer_bindings_ref: actorConsumerBindingsPath,
    context_sources: contextSources,
    derived_context_access_matrix: derivedContextAccessMatrix,
    packet_refs: [],
    validation_results: [
      "domain_binding_valid",
      "review_value_alignment_dispatch_allowed",
      "review_target_profile_admitted",
      "context_access_matrix_valid",
    ],
    failure_record_refs: [],
  };

  await writeYamlDocument(reviewContextManifestPath, contextManifest);
  return contextManifest;
}

async function updateContextManifestPacketRefs(args: {
  contextManifest: ReviewContextManifestArtifact;
  contextManifestPath: string;
  packetRefs: ReviewContextManifestPacketRef[];
}): Promise<void> {
  const updated: ReviewContextManifestArtifact = {
    ...args.contextManifest,
    lifecycle_state: "dispatched",
    packet_refs: args.packetRefs,
    validation_results: [
      ...args.contextManifest.validation_results,
      "packet_refs_materialized",
    ],
  };
  await writeYamlDocument(args.contextManifestPath, updated);
}

/**
 * Resolve a role file inside `{baseDir}/.onto/roles/`.
 *
 * The function still
 * returns the canonical path when the file is missing so that the
 * downstream error message can surface the expected location.
 */
function resolveCanonicalRoleFile(baseDir: string, lensId: string): string {
  let rolesDir: string;
  try {
    rolesDir = resolveInstallationPath("roles", baseDir);
  } catch {
    rolesDir = path.resolve(baseDir, ".onto", "roles");
  }
  return path.resolve(rolesDir, `${lensId}.md`);
}

/**
 * Resolve role definition path per the Role/Domain policy:
 * - Core roles: ontoHome installation only. Project override forbidden.
 * - Custom roles: projectRoot, then ontoHome. Only `.onto/roles/` is
 *   consulted via the shared resolver.
 * - Terminal failure: caller throws after this returns a non-existent path.
 */
function resolveRoleDefinitionPath(
  lensId: string,
  projectRoot: string,
  ontoHome: string | undefined,
): string {
  if (CORE_ROLE_IDS.has(lensId)) {
    const baseDir = typeof ontoHome === "string" && ontoHome.length > 0
      ? ontoHome
      : projectRoot;
    return resolveCanonicalRoleFile(baseDir, lensId);
  }

  // Custom roles — project-side canonical seat first, then ontoHome.
  const projectCanonical = path.resolve(projectRoot, ".onto", "roles", `${lensId}.md`);
  if (fsSync.existsSync(projectCanonical)) return projectCanonical;

  if (typeof ontoHome === "string" && ontoHome.length > 0) {
    return resolveCanonicalRoleFile(ontoHome, lensId);
  }
  // No installation override and no project-side hit — return the canonical
  // shape so the downstream error message points users at the expected
  // location.
  return projectCanonical;
}

export async function runMaterializeReviewPromptPacketsCli(
  argv: string[],
): Promise<number> {
  const { values } = parseArgs({
    options: {
      "project-root": { type: "string", default: "." },
      "onto-home": { type: "string" },
      "session-root": { type: "string" },
      "max-embed-lines": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
    args: argv,
  });

  let maxEmbedLines =
    typeof values["max-embed-lines"] === "string" && values["max-embed-lines"].length > 0
      ? Number.parseInt(values["max-embed-lines"], 10)
      : DEFAULT_MAX_EMBED_LINES;
  if (!Number.isFinite(maxEmbedLines) || maxEmbedLines < 1) {
    console.warn(
      `[onto] Invalid max-embed-lines value (${values["max-embed-lines"]}), using default ${DEFAULT_MAX_EMBED_LINES}.`,
    );
    maxEmbedLines = DEFAULT_MAX_EMBED_LINES;
  }

  const projectRoot = path.resolve(requireString(values["project-root"], "project-root"));
  const sessionRoot = path.resolve(requireString(values["session-root"], "session-root"));

  const interpretationPath = path.join(sessionRoot, "interpretation.yaml");
  const bindingPath = path.join(sessionRoot, "binding.yaml");
  const sessionMetadataPath = path.join(sessionRoot, "session-metadata.yaml");
  const executionPlanPath = path.join(sessionRoot, "execution-plan.yaml");
  const contextCandidateAssemblyPath = path.join(
    sessionRoot,
    "execution-preparation",
    "context-candidate-assembly.yaml",
  );

  const interpretation = await readYamlDocument<InvocationInterpretationArtifact>(
    interpretationPath,
  );
  const binding = await readYamlDocument<InvocationBindingArtifact>(bindingPath);
  const sessionMetadata = await readYamlDocument<ReviewSessionMetadata>(
    sessionMetadataPath,
  );
  const executionPlan = await readYamlDocument<ReviewExecutionPlan>(executionPlanPath);
  const promptPacketsRoot =
    executionPlan.prompt_packets_root ?? path.join(sessionRoot, "prompt-packets");
  const materializedInputText = await readOptionalText(binding.materialized_input_path);
  const lensPromptPacketSeats: ReviewLensPromptPacketSeat[] =
    executionPlan.lens_prompt_packet_seats ??
    binding.resolved_lens_set.map((lensId) => ({
      lens_id: lensId,
      packet_path: path.join(promptPacketsRoot, `${lensId}.prompt.md`),
      output_path: path.join(binding.round1_root, `${lensId}.md`),
    }));
  const synthesizePromptPacketPath =
    executionPlan.synthesize_prompt_packet_path ??
    path.join(promptPacketsRoot, "synthesize.prompt.md");
  const lensIds = lensPromptPacketSeats.map((s) => s.lens_id);

  await fs.mkdir(promptPacketsRoot, { recursive: true });

  const ontoHome = typeof values["onto-home"] === "string" && values["onto-home"].length > 0
    ? path.resolve(values["onto-home"])
    : undefined;

  // Resolve domain directory once for all lenses (directory-level all-or-nothing)
  const sessionDomain = binding.resolved_session_domain;
  const isNoDomain = !sessionDomain || sessionDomain === "none" || sessionDomain === "@-";
  let resolvedDomainDir: string | null = null;
  let domainResolutionAttempts: string[] = [];
  let domainAllFiles: string[] = [];
  if (!isNoDomain) {
    const resolution = resolveDomainDirectory(sessionDomain, projectRoot, ontoHome);
    domainResolutionAttempts = resolution.attempted;
    resolvedDomainDir = resolution.dir;
    if (!resolvedDomainDir) {
      const searchedList = resolution.attempted.map((p) => `  - ${p}`).join("\n");
      await writeAndThrowStructuredFailureRecord({
        sessionRoot,
        phase: "pre_manifest.domain_binding",
        reasonCode: "domain_directory_not_found",
        humanMessage:
          `Domain directory not found for "${sessionDomain}". Searched ${resolution.attempted.length} location(s).`,
        requiredUserAction:
          "Create the domain directory, choose another domain, or run with domain=none.",
        retrySafety: "safe_after_input_change",
        artifactTrust: "pre_manifest_artifacts_trusted",
        dispatchState: "dispatch_blocked",
        artifactRefs: {
          binding: bindingPath,
          execution_plan: executionPlanPath,
          domain_binding:
            executionPlan.domain_binding_path ??
            path.join(sessionRoot, "execution-preparation", "domain-binding.yaml"),
        },
        mcpErrorCode: "ONTO_REVIEW_DOMAIN_BINDING_FAILED",
        detailsKind: "domain_binding",
        details: {
          selected_domain: sessionDomain,
          attempted_directories: resolution.attempted,
        },
      });
      throw new Error(searchedList);
    }
    domainAllFiles = scanDomainFiles(resolvedDomainDir);
  }

  if (domainAllFiles.length > 0 && await fileExists(contextCandidateAssemblyPath)) {
    const assembly = await readYamlDocument<Record<string, unknown>>(contextCandidateAssemblyPath);
    const existingRefs = Array.isArray(assembly?.domain_context_refs) ? assembly.domain_context_refs as string[] : [];
    const mergedRefs = [...new Set([...existingRefs, ...domainAllFiles])];
    if (mergedRefs.length > existingRefs.length) {
      (assembly as Record<string, unknown>).domain_context_refs = mergedRefs;
      await writeYamlDocument(contextCandidateAssemblyPath, assembly);
    }
  }

  const reviewContextManifest = await writePreManifestContextArtifacts({
    projectRoot,
    sessionRoot,
    executionPlan,
    binding,
    interpretationPath,
    interpretation,
    sessionMetadataPath,
    contextCandidateAssemblyPath,
    lensIds,
    isNoDomain,
    resolvedDomainDir,
    domainResolutionAttempts,
    domainAllFiles,
  });
  const reviewContextManifestPath =
    executionPlan.review_context_manifest_path ??
    path.join(sessionRoot, "execution-preparation", "review-context-manifest.yaml");
  const packetRefs: ReviewContextManifestPacketRef[] = [];

  for (const seat of lensPromptPacketSeats) {
    const consumerId = consumerIdForLens(seat.lens_id);
    const allowedContextSourceIds =
      reviewContextManifest.derived_context_access_matrix[consumerId] ?? [];
    const allowedDomainFiles = domainFilesAllowedForConsumer(
      reviewContextManifest,
      consumerId,
    );
    const roleDefinitionPath = resolveRoleDefinitionPath(seat.lens_id, projectRoot, ontoHome);
    const roleDefinitionText = await readOptionalText(roleDefinitionPath);
    if (roleDefinitionText.trim().length === 0) {
      throw new Error(
        `Role definition not found for ${seat.lens_id}. Searched: ${roleDefinitionPath}` +
        (ontoHome ? ` (ontoHome: ${ontoHome})` : ""),
      );
    }
    const lensPacketText = `# Review Lens Prompt Packet

session_id: ${executionPlan.session_id}
lens_id: ${seat.lens_id}
execution_realization: ${executionPlan.execution_realization}
host_runtime: ${executionPlan.host_runtime}
review_mode: ${executionPlan.review_mode}
session_domain: ${binding.resolved_session_domain}
output_path: ${toRelativePath(seat.output_path, projectRoot)}
request_summary: ${interpretation.intent_summary}

## Canonical Role
You are ${seat.lens_id}.
Execute as a ContextIsolatedReasoningUnit.
Do not read other lens outputs during Round 1.

## Role Definition Source
${toRelativePath(roleDefinitionPath, projectRoot)}

${roleDefinitionText.trim().length > 0 ? `${roleDefinitionText.trim()}\n` : ""}

## Authoritative Artifact Inputs
- materialized input: ${toRelativePath(binding.materialized_input_path, projectRoot)}
- role definition: ${toRelativePath(roleDefinitionPath, projectRoot)}
- interpretation: ${toRelativePath(interpretationPath, projectRoot)}
- binding: ${toRelativePath(bindingPath, projectRoot)}
- review target profile: ${toRelativePath(binding.review_target_profile_path, projectRoot)}
- review context manifest: ${toRelativePath(reviewContextManifestPath, projectRoot)}

## Embedded Materialized Input

${materializedInputText.trim().length > 0 ? truncateForEmbedding(materializedInputText.trim(), maxEmbedLines, toRelativePath(binding.materialized_input_path, projectRoot)) : "(unavailable)"}

## Optional Context Inputs
- session metadata: ${toRelativePath(sessionMetadataPath, projectRoot)}
- target snapshot: ${toRelativePath(binding.target_snapshot_path, projectRoot)}
- context candidate assembly: ${toRelativePath(contextCandidateAssemblyPath, projectRoot)}
- domain binding: ${toRelativePath(executionPlan.domain_binding_path ?? path.join(sessionRoot, "execution-preparation", "domain-binding.yaml"), projectRoot)}
- review value-alignment criteria: ${toRelativePath(executionPlan.review_value_alignment_criteria_path ?? path.join(sessionRoot, "execution-preparation", "review-value-alignment-criteria.yaml"), projectRoot)}
- consumer id: ${consumerId}
- allowed context source ids: ${allowedContextSourceIds.join(", ")}

${renderBoundaryPolicySection(binding, projectRoot)}

${renderBoundaryEnforcementSection(binding)}

${renderEffectiveBoundaryStateSection(binding, projectRoot)}

## Session Summary
- requested target: ${toRelativePath(sessionMetadata.requested_target, projectRoot)}
- target scope kind: ${binding.resolved_target_scope.kind}
- resolved target refs:
${binding.resolved_target_scope.resolved_refs
  .map((resolvedRef) => `  - ${toRelativePath(resolvedRef, projectRoot)}`)
  .join("\n")}
- review mode: ${binding.resolved_review_mode}
- lens set: ${binding.resolved_lens_set.join(", ")}

## Execution Directives
- Read the role definition and the materialized input first.
- Prefer the smallest sufficient set of files.
- Only read optional context inputs if the primary inputs are not enough.
- Do not recursively chase additional document links or reference chains found inside the target text.
- Use the materialized input as the authoritative target input.
- Use only your lens-specific perspective.
- Perform structural inspection first when applicable.
- If you find an issue, state what, why, and how to fix it.
- If you find no issue, state why it is correct.
- Write your result to: ${toRelativePath(seat.output_path, projectRoot)}

${renderLensOutputSchemaGate(binding.resolved_session_domain)}

${renderDomainDocumentRefsSection(seat.lens_id, resolvedDomainDir, allowedDomainFiles, projectRoot)}
`;

    await fs.writeFile(seat.packet_path, lensPacketText.trimEnd() + "\n", "utf8");
    packetRefs.push({
      consumer_id: consumerId,
      packet_ref: seat.packet_path,
      packet_sha256: await fileSha256(seat.packet_path),
      consumed_context_refs: allowedContextSourceIds,
      forbidden_context_refs: reviewContextManifest.context_sources
        .map((source) => source.context_source_id)
        .filter((sourceId) => !allowedContextSourceIds.includes(sourceId)),
    });
  }

  const synthesizeAllowedContextSourceIds =
    reviewContextManifest.derived_context_access_matrix.synthesize ?? [];
  const synthesizePacketText = `# Review Synthesize Prompt Packet

session_id: ${executionPlan.session_id}
execution_realization: ${executionPlan.execution_realization}
host_runtime: ${executionPlan.host_runtime}
review_mode: ${executionPlan.review_mode}
session_domain: ${binding.resolved_session_domain}
output_path: ${toRelativePath(executionPlan.synthesis_output_path, projectRoot)}
request_summary: ${interpretation.intent_summary}

## Canonical Role
You are synthesize.
You are not an independent review lens.
You must preserve lens evidence and must not invent new independent perspectives.

## Required Artifact Inputs
- materialized input: ${toRelativePath(binding.materialized_input_path, projectRoot)}
- interpretation: ${toRelativePath(interpretationPath, projectRoot)}
- binding: ${toRelativePath(bindingPath, projectRoot)}
- review target profile: ${toRelativePath(binding.review_target_profile_path, projectRoot)}
- review context manifest: ${toRelativePath(reviewContextManifestPath, projectRoot)}
- finding ledger: ${toRelativePath(executionPlan.finding_ledger_path, projectRoot)}
- finding relation graph: ${toRelativePath(executionPlan.finding_relation_graph_path, projectRoot)}
- issue ledger: ${toRelativePath(executionPlan.issue_ledger_path, projectRoot)}
- issue stance matrix: ${toRelativePath(executionPlan.issue_stance_matrix_path, projectRoot)}
- deliberation plan: ${toRelativePath(executionPlan.deliberation_plan_path, projectRoot)}
- controlled lens deliberation result: ${toRelativePath(executionPlan.deliberation_output_path, projectRoot)}
- problem framing: ${toRelativePath(executionPlan.problem_framing_path, projectRoot)}

## Optional Context Inputs
- session metadata: ${toRelativePath(sessionMetadataPath, projectRoot)}
- target snapshot: ${toRelativePath(binding.target_snapshot_path, projectRoot)}
- context candidate assembly: ${toRelativePath(contextCandidateAssemblyPath, projectRoot)}
- domain binding: ${toRelativePath(executionPlan.domain_binding_path ?? path.join(sessionRoot, "execution-preparation", "domain-binding.yaml"), projectRoot)}
- review value-alignment criteria: ${toRelativePath(executionPlan.review_value_alignment_criteria_path ?? path.join(sessionRoot, "execution-preparation", "review-value-alignment-criteria.yaml"), projectRoot)}
- consumer id: synthesize
- allowed context source ids: ${synthesizeAllowedContextSourceIds.join(", ")}

${renderBoundaryPolicySection(binding, projectRoot, { tools: "required" })}

${renderBoundaryEnforcementSection(binding)}

${renderEffectiveBoundaryStateSection(binding, projectRoot)}

## Participating Lens Outputs
${(executionPlan.lens_execution_seats ?? binding.resolved_lens_set.map((lensId) => ({
    lens_id: lensId,
    output_path: path.join(binding.round1_root, `${lensId}.md`),
  })))
  .map(
    (seat) =>
      `- ${seat.lens_id}: ${toRelativePath(seat.output_path, projectRoot)}`,
  )
  .join("\n")}

## Execution Directives
- Read the materialized input first, then all participating lens outputs.
- Read all issue-stance closure artifacts before writing final classification.
- Read the controlled lens deliberation result before classifying or rendering disagreements.
- Preserve issue IDs, root hypotheses, common spine values, and domain axes from the issue-stance closure artifacts.
- Prefer the smallest sufficient set of files.
- Only read optional context inputs if the materialized input and lens outputs are not enough.
- Do not recursively chase additional document links or reference chains found inside the target text or lens outputs.
- Preserve consensus, axiology-proposed additional perspectives, and overlooked premises.
- Do not invent New Perspectives yourself.
- You are not the deliberation actor. Controlled lens deliberation already ran before this step and wrote the authoritative deliberation result.
- You are not the problem-framing actor. problem-framing.yaml already classified issue role, judgment state, impact kind, timing, closure, and domain axes.
- Do not resolve disagreements that the controlled deliberation result preserved as unresolved.
- Do not override a controlled deliberation decision unless the result contradicts an explicit cited artifact; in that case preserve the contradiction in Disagreement instead of silently choosing a new answer.
- In Final Review Result, comprehensively explain what the principal should conclude from the full bounded artifact set: review target and boundary, issue/root-cause clusters, lens agreement and disagreement, controlled deliberation outcome, problem framing classification, closure/timing, and the practical next step. Ground this explanation in existing lens outputs and issue artifacts; do not introduce new independent findings.
- Start the output with YAML frontmatter using this exact field:
  - \`deliberation_status: performed\`
  - Use \`performed\` because controlled lens deliberation is a required pre-synthesize stage.
- Write your result to: ${toRelativePath(executionPlan.synthesis_output_path, projectRoot)}

## Required Output Sections
Use exactly these heading names in your output. The downstream renderer extracts sections by exact heading match. Do not add numbering prefixes, suffixes, or rename these headings.

\`\`\`
## Consensus
## Conditional Consensus
## Disagreement
## Deliberation Decision
## Axiology-Proposed Additional Perspectives
## Purpose Alignment Verification
## Final Review Result
## Immediate Actions Required
## Recommendations
## Unique Finding Tagging
\`\`\`

The Deliberation Decision section records, per contested point, the resolution produced by the controlled lens deliberation result. If that result preserved an unresolved disagreement, preserve it here with the reason.

## Tagging Completeness Rule
Every finding from the participating lens outputs must be accounted for in exactly one of these four classification sections: Consensus, Conditional Consensus, Disagreement, or Unique Finding Tagging. A finding may additionally appear in other sections (Recommendations, Immediate Actions, etc.), but it must have a primary classification in one of the four. If a finding is part of a cross-lens consensus, classify it under Consensus or Conditional Consensus. If it is unique to a single lens, classify it under Unique Finding Tagging.
`;

  await fs.writeFile(
    synthesizePromptPacketPath,
    synthesizePacketText.trimEnd() + "\n",
    "utf8",
  );
  packetRefs.push({
    consumer_id: "synthesize",
    packet_ref: synthesizePromptPacketPath,
    packet_sha256: await fileSha256(synthesizePromptPacketPath),
    consumed_context_refs: synthesizeAllowedContextSourceIds,
    forbidden_context_refs: reviewContextManifest.context_sources
      .map((source) => source.context_source_id)
      .filter((sourceId) => !synthesizeAllowedContextSourceIds.includes(sourceId)),
  });
  await updateContextManifestPacketRefs({
    contextManifest: reviewContextManifest,
    contextManifestPath: reviewContextManifestPath,
    packetRefs,
  });

  console.log(
    JSON.stringify(
        {
        prompt_packets_root: promptPacketsRoot,
        lens_prompt_packet_count: lensPromptPacketSeats.length,
        synthesize_prompt_packet_path: synthesizePromptPacketPath,
      },
      null,
      2,
    ),
  );
  return 0;
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  return runMaterializeReviewPromptPacketsCli(process.argv.slice(2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (exitCode) => process.exit(exitCode),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
