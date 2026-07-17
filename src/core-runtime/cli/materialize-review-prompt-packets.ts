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
  ReviewEmbedBudgetWitness,
  ReviewExecutionPlan,
  ReviewLensPromptPacketSeat,
  ReviewSessionMetadata,
  ReviewTargetProfileArtifact,
  ReviewValueAlignmentCriteriaArtifact,
} from "../review/artifact-types.js";
import { reviewMaterialGoals } from "../target-material-kind.js";
import {
  fileExists,
  isoNow,
  readYamlDocument,
  writeYamlDocument,
  toRelativePath,
  truncateForEmbedding,
} from "../review/review-artifact-utils.js";
import { DEFAULT_MAX_EMBED_LINES } from "../review/review-prompt-budget.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";
import { writeAndThrowStructuredFailureRecord } from "../review/failure-records.js";
import { resolveInstallationPath } from "../discovery/installation-paths.js";
import { isOntoRoot } from "../discovery/onto-home.js";
import {
  ISSUE_ARTIFACT_IDS,
  issueArtifactConsumerId,
  issueStanceConsumerId,
} from "../review/issue-artifact-runtime.js";
import {
  renderBoundaryPolicySection as renderBoundaryPolicySectionBase,
  renderUnitBoundaryDetailsSection as renderUnitBoundaryDetailsSectionBase,
} from "../review/boundary-prompt-sections.js";

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

function requireSidecarOutputPath(
  seat: ReviewLensPromptPacketSeat,
): string {
  if (typeof seat.sidecar_output_path === "string" && seat.sidecar_output_path.length > 0) {
    return seat.sidecar_output_path;
  }
  throw new Error(
    `lens_output_format=sidecar requires sidecar_output_path for lens prompt packet seat: ${seat.lens_id}`,
  );
}

async function readOptionalText(targetPath: string): Promise<string> {
  if (!(await fileExists(targetPath))) {
    return "";
  }
  return fs.readFile(targetPath, "utf8");
}

export function renderBoundaryPolicySection(
  binding: InvocationBindingArtifact,
  projectRoot: string,
  options?: {
    tools?: "required" | "optional" | "denied";
    repoExplorationPolicy?: "allowed" | "denied";
    filesystemPolicy?: "read-only" | "denied";
    allowedOutputRefs?: string[];
  },
): string {
  return renderBoundaryPolicySectionBase(binding, projectRoot, options);
}

export function renderUnitBoundaryDetailsSection(args: {
  binding: InvocationBindingArtifact;
  projectRoot: string;
  unitId: string;
  outputPath: string;
  repoExplorationPolicy: "allowed" | "denied";
  allowedReadRefs: string[];
}): string {
  return renderUnitBoundaryDetailsSectionBase({
    context: args.binding,
    projectRoot: args.projectRoot,
    unitId: args.unitId,
    outputPath: args.outputPath,
    repoExplorationPolicy: args.repoExplorationPolicy,
    allowedReadRefs: args.allowedReadRefs,
  });
}

export function renderEmbeddedMaterializedInputSection(
  materializedInput: string,
): string {
  const lineCount =
    materializedInput.length === 0 ? 0 : materializedInput.split(/\r?\n/).length;
  return `## Embedded Materialized Input

<!-- onto:embedded-materialized-input:start lines=${lineCount} -->
${materializedInput}
<!-- onto:embedded-materialized-input:end -->`;
}

/**
 * Per-kind review obligations. `options.ontologicalObligations` gates the
 * aligned prose for code/database (design 20260716-review-ontological-primacy-
 * runtime-alignment-design.md §3-(a)/(B), flag `ontological_anchoring.
 * obligations`): the carrier clause stays, contract satisfiability becomes the
 * primary clause, and operational-path probing is subordinated to an evidence
 * channel for the declared contract. Default off → byte-identical prose.
 */
function materialKindReviewObligations(
  profile: ReviewTargetProfileArtifact,
  options?: { ontologicalObligations?: boolean },
): string[] {
  const ontologicalObligations = options?.ontologicalObligations === true;
  switch (profile.target_material_kind) {
    case "code": {
      // Shared carrier clause: single source so the flag-off byte-identity
      // guarantee cannot drift when the evidence-source wording is edited.
      const codeCarrierClause =
        "Treat declared types, exported API signatures, documented contracts, and observable runtime behavior as review evidence.";
      if (ontologicalObligations) {
        return [
          codeCarrierClause,
          "Check whether the implementation satisfies the contracts it declares: surface visible type/contract mismatches as logical-integrity failures of the declared concept.",
          "Probe edge-case inputs, error/null/undefined paths, and caller-facing failure modes as evidence channels for whether the declared contracts hold — not as a free-standing operational bug hunt.",
          "Classify a visible contract violation as material when it defeats the declared review goal inside the bounded target.",
        ];
      }
      return [
        codeCarrierClause,
        "Check visible type/runtime contract mismatches, edge-case input behavior, error/null/undefined paths, and caller-facing failure modes.",
        "Classify a visible correctness or runtime-contract failure as material when it can violate the declared review goal inside the bounded target.",
      ];
    }
    case "spreadsheet": {
      // The obligation prose stays in lockstep with the per-ref disposition projected into
      // review_goal (the SSOT): a goal is named only when its specific structure was
      // rendered. Three honest cases, so the lens is never told to audit absent formulas nor
      // told the data is unavailable when it was actually rendered:
      const spreadsheetGoals = reviewMaterialGoals("spreadsheet");
      const backed = profile.review_goal.filter((goal) =>
        spreadsheetGoals.includes(goal),
      );
      if (backed.length > 0) {
        // Project the prose from the BACKED goal SUBSET (not a single any-backed bit), so the
        // lens is told to audit only the structure the inventory actually rendered for this
        // target — a macro-only or validation-only workbook is never told to audit formulas
        // that review_goal and the render both show are absent. Emitted in stable catalog order.
        const GOAL_PROSE: Record<string, string> = {
          formula_integrity:
            "Treat formulas and their recalculation behavior as review evidence; check visible formula mismatches, stale derived values, and decision-impacting calculation errors.",
          cross_sheet_reference_integrity:
            "Treat cross-sheet references as review evidence; check broken, stale, or misaimed references across sheets.",
          named_range_hygiene:
            "Treat named ranges as review evidence; check missing, overlapping, or wrongly-scoped named ranges.",
          data_validation_coverage:
            "Treat data-validation rules (type, operator, bounds) as review evidence; check missing or inconsistent input guards.",
          access_and_protection_hygiene:
            "Treat sheet protection, hidden sheets, and macro presence as review evidence; check the access/protection posture and any macro-carried risk.",
          structural_risk_signals:
            "Treat the recorded structural risk signals, external links, and error cells as review evidence; check decision-impacting structural risks.",
        };
        return spreadsheetGoals
          .filter((goal) => backed.includes(goal))
          .map((goal) => GOAL_PROSE[goal] as string);
      }
      // No structural obligation is backed. Distinguish an inspected plain-data workbook
      // (read — e.g. a flat CSV — but with no formula/named-range/validation/protection
      // structure to audit) from one that could not be inspected at all.
      if (profile.material_profile.support_status === "supported") {
        return [
          "The target workbook(s) were structurally inspected but carry no formula, cross-sheet reference, named range, data validation, or protection structure to audit beyond the rendered columns/data.",
          "Treat the rendered structural inventory as the evidence; do not infer calculation logic the workbook does not contain.",
        ];
      }
      return [
        "The target workbook(s) could not be structurally inspected (unsupported format, unreadable, or empty); the materialized input carries only an unsupported note, not formula/reference structure.",
        "Treat only what the materialized input actually renders as evidence; do not assume formulas, cross-sheet references, or recalculated values are available, and preserve material uncertainty about the uninspected structure.",
      ];
    }
    case "document":
      return [
        "Treat declared purpose, audience, claims, evidence, structure, and unresolved ambiguity as review evidence.",
        "Check visible claim/evidence gaps, contradictory obligations, missing decision context, and reader-facing actionability failures.",
      ];
    case "database": {
      const databaseCarrierClause =
        "Treat schema, constraints, query behavior, relation cardinality, and data integrity assumptions as review evidence.";
      if (ontologicalObligations) {
        return [
          databaseCarrierClause,
          "Check whether the schema and constraints uphold the data contract they declare: surface visible key/constraint mismatches as integrity failures of the declared model.",
          "Probe unsafe query assumptions, migration risks, and integrity failure paths as evidence channels for whether the declared data contract holds.",
        ];
      }
      return [
        databaseCarrierClause,
        "Check visible key/constraint mismatches, unsafe query assumptions, migration risks, and integrity failures.",
      ];
    }
    case "mixed":
      return [
        "Treat each target member according to its material kind and also check cross-artifact handoffs.",
        "Check visible mismatch between code, documents, data, schemas, or operational contracts when the review goal depends on their alignment.",
      ];
    case "unknown":
      return [
        "Treat only evidence visible in the bounded target and profile as review evidence.",
        "Preserve material uncertainty when the material kind is too unclear to justify a stronger judgment.",
      ];
  }
}

export function renderReviewTargetProfileSummary(
  profile: ReviewTargetProfileArtifact | null,
  options?: { ontologicalObligations?: boolean },
): string {
  if (!profile) {
    return `## Review Target Profile Summary
- profile: unavailable
- consequence: use only the materialized input and explicit request summary as target authority.`;
  }
  const obligations = materialKindReviewObligations(profile, options);
  return `## Review Target Profile Summary
- target_material_kind: ${profile.target_material_kind}
- target_input_kind: ${profile.target_input_kind}
- target_scope_kind: ${profile.target_scope_kind}
- artifact_role_primary: ${profile.artifact_roles.primary}
- closure_level: ${profile.closure_level}
- review_goal: ${profile.review_goal.join(", ")}
- closure_obligation_policy: ${profile.closure_obligation_policy.join(", ")}
- material_support_status: ${profile.material_profile.support_status}
- material_detection_confidence: ${profile.material_profile.detection.confidence}
- material_detection_basis: ${profile.material_profile.detection.confidence_basis}
- material_kind_obligations:
${obligations.map((obligation) => `  - ${obligation}`).join("\n")}`;
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

export function renderLensSidecarOutputContract(args: {
  sessionDomain: string;
  humanOutputPath: string | null;
  projectRoot: string;
  /** design §3-(c) c-1 (`ontological_anchoring.judgment_anchor`): appends the
   * kind-neutral declared-purpose severity anchor. Default off → byte-identical. */
  judgmentAnchor?: boolean;
}): string {
  const isDomainless =
    args.sessionDomain.length === 0 ||
    args.sessionDomain === "none" ||
    args.sessionDomain === "@-";
  const judgmentAnchorSection =
    args.judgmentAnchor === true
      ? `

Severity judgment anchor:
- Judge \`severity_hint\` by how strongly the finding undermines trust in the reviewed result for its declared purpose.
- Weigh the confirmed review value-alignment criteria and the invocation interpretation as explicit sources of that declared purpose, alongside the review target profile's review goals.
- Anchor \`materiality_basis.affected_purpose\` to a declared purpose source — name the criterion, goal, or declared contract the finding affects — rather than a generic quality concern.
- Scope exclusion is not a severity decision: a real defect outside the declared purpose keeps its honest severity and is disqualified later through admission context, so do not demote it for scope reasons.`
      : "";
  return `## Runtime Sidecar Output Contract
Submit exactly one payload for \`submit_lens_findings\` through the constrained output channel. Do not write markdown or YAML yourself.

The runtime fills \`session_id\`, \`lens_id\`, \`candidate_id\`, and sidecar YAML serialization.
Submit only the semantic finding fields requested by the tool:
- \`target\`
- \`evidence_anchor\`
- \`claim\`
- \`what\`
- \`why\`
- \`how_to_fix\`
- \`upstream_evidence_required\`
- \`severity_hint\`
- \`materiality_basis\`
- \`causal_path\`

For \`severity_hint=blocker|high|medium\`, \`materiality_basis\` and \`causal_path\` must be evidence-backed objects.
For clear \`low|info\` surface findings, set \`materiality_basis: null\` and \`causal_path: null\`.
The runtime assigns causal step ids and maps them to finding-ledger cause refs.

Submit \`domain_constraints_used\` as ${
    isDomainless
      ? "`[]` unless a concrete domain document was actually used"
      : "a list of `{source_doc, source_version_or_snapshot_id, anchor}` objects for concrete domain rules used"
  }.
Submit \`domain_context_assumptions\` as a list of strings.
If there are no findings, submit \`findings: []\` and a concise \`no_findings_rationale\`.
${args.humanOutputPath ? `The runtime may render a human-readable projection at ${toRelativePath(args.humanOutputPath, args.projectRoot)}.` : "No human-readable lens markdown projection is requested for this session."}${judgmentAnchorSection}`;
}

// DEFAULT_MAX_EMBED_LINES is owned by review-prompt-budget.ts (the single
// conversion point), imported above and shared with the prepare-time budget
// resolution so the no-regression floor lives in one place.

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
    ...lensIds.map(issueStanceConsumerId),
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
      ...mappedLensIds.map(issueStanceConsumerId),
      "review-record",
    ];
  }
  if (lensIdsMappedToFile.length > 0) {
    return ["review-record"];
  }
  return [
    ...lensIds.map(consumerIdForLens),
    ...lensIds.map((lensId) => `deliberation:${lensId}`),
    ...lensIds.map(issueStanceConsumerId),
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

/**
 * Resolve the packet stage's effective embed budget from the three precedence
 * sources — explicit CLI override (the channel the settings knob arrives
 * through) wins, then the plan's prepare-time window-proportional value, then
 * DEFAULT — and record which branch supplied it. The returned witness is
 * persisted into the review context manifest (adaptive-effort design §4-4,
 * finding R2-4: the plan field alone cannot witness an override).
 */
export function resolveEffectiveEmbedBudget(
  cliMaxEmbedLines: number | undefined,
  planMaxEmbedLines: number | undefined,
  defaultMaxEmbedLines: number,
): ReviewEmbedBudgetWitness {
  if (cliMaxEmbedLines !== undefined) {
    return {
      max_embed_lines_effective: cliMaxEmbedLines,
      max_embed_lines_source: "cli",
    };
  }
  if (planMaxEmbedLines !== undefined) {
    return {
      max_embed_lines_effective: planMaxEmbedLines,
      max_embed_lines_source: "plan",
    };
  }
  return {
    max_embed_lines_effective: defaultMaxEmbedLines,
    max_embed_lines_source: "default",
  };
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
  embedBudget: ReviewEmbedBudgetWitness;
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
    settings_schema_version: "settings.json/v3",
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
    embed_budget: args.embedBudget,
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

  // Explicit CLI --max-embed-lines wins (an operator override). An invalid value
  // falls back (warned) so it does NOT mask the plan's window-proportional budget.
  // The plan's persisted max_embed_lines (Stage 1) is applied below, after the
  // plan is read; absent both → DEFAULT (no regression).
  let cliMaxEmbedLines: number | undefined;
  if (
    typeof values["max-embed-lines"] === "string" &&
    values["max-embed-lines"].length > 0
  ) {
    const parsed = Number.parseInt(values["max-embed-lines"], 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      cliMaxEmbedLines = parsed;
    } else {
      console.warn(
        `[onto] Invalid max-embed-lines value (${values["max-embed-lines"]}), using default ${DEFAULT_MAX_EMBED_LINES}.`,
      );
    }
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
  // Stage 1 embed-budget precedence: explicit CLI override wins; else the plan's
  // window-proportional max_embed_lines (persisted at prepare time); else DEFAULT
  // (model-unaware run — no regression).
  const planMaxEmbedLines =
    typeof executionPlan.max_embed_lines === "number" &&
    Number.isFinite(executionPlan.max_embed_lines) &&
    executionPlan.max_embed_lines >= 1
      ? executionPlan.max_embed_lines
      : undefined;
  const embedBudget = resolveEffectiveEmbedBudget(
    cliMaxEmbedLines,
    planMaxEmbedLines,
    DEFAULT_MAX_EMBED_LINES,
  );
  const maxEmbedLines = embedBudget.max_embed_lines_effective;
  const promptPacketsRoot =
    executionPlan.prompt_packets_root ?? path.join(sessionRoot, "prompt-packets");
  const materializedInputText = await readOptionalText(binding.materialized_input_path);
  const reviewTargetProfile =
    await readYamlDocument<ReviewTargetProfileArtifact>(
      binding.review_target_profile_path,
    );
  const lensPromptPacketSeats: ReviewLensPromptPacketSeat[] =
    executionPlan.lens_prompt_packet_seats ??
    binding.resolved_lens_set.map((lensId) => ({
      lens_id: lensId,
      packet_path: path.join(promptPacketsRoot, `${lensId}.prompt.md`),
      output_path: path.join(binding.round1_root, `${lensId}.md`),
    }));
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
    embedBudget,
  });
  const reviewContextManifestPath =
    executionPlan.review_context_manifest_path ??
    path.join(sessionRoot, "execution-preparation", "review-context-manifest.yaml");
  const packetRefs: ReviewContextManifestPacketRef[] = [];

  for (const seat of lensPromptPacketSeats) {
    const lensOutputFormat = executionPlan.lens_output_format ?? "sidecar";
    const lensDispatchOutputPath =
      lensOutputFormat === "sidecar" ? requireSidecarOutputPath(seat) : seat.output_path;
    const lensHumanOutputPath =
      lensOutputFormat === "sidecar" && executionPlan.write_lens_markdown === false
        ? null
        : seat.output_path;
    const lensAllowedOutputRefs = [
      lensDispatchOutputPath,
      ...(lensHumanOutputPath ? [lensHumanOutputPath] : []),
    ];
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
    const lensAllowedReadRefs = [
      binding.materialized_input_path,
      roleDefinitionPath,
      interpretationPath,
      bindingPath,
      binding.review_target_profile_path,
      reviewContextManifestPath,
      sessionMetadataPath,
      binding.target_snapshot_path,
      contextCandidateAssemblyPath,
      executionPlan.domain_binding_path ??
        path.join(sessionRoot, "execution-preparation", "domain-binding.yaml"),
      executionPlan.review_value_alignment_criteria_path ??
        path.join(
          sessionRoot,
          "execution-preparation",
          "review-value-alignment-criteria.yaml",
      ),
      ...allowedDomainFiles,
    ];
    const embeddedMaterializedInput =
      materializedInputText.trim().length > 0
        ? truncateForEmbedding(
            materializedInputText.trim(),
            maxEmbedLines,
            toRelativePath(binding.materialized_input_path, projectRoot),
          )
        : "(unavailable)";
    const lensPacketText = `# Review Lens Prompt Packet

session_id: ${executionPlan.session_id}
lens_id: ${seat.lens_id}
execution_realization: ${executionPlan.execution_realization}
host_runtime: ${executionPlan.host_runtime}
review_mode: ${executionPlan.review_mode}
session_domain: ${binding.resolved_session_domain}
output_path: ${toRelativePath(lensDispatchOutputPath, projectRoot)}
${lensHumanOutputPath ? `human_output_path: ${toRelativePath(lensHumanOutputPath, projectRoot)}` : "human_output_path: null"}
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

${renderEmbeddedMaterializedInputSection(embeddedMaterializedInput)}

${renderReviewTargetProfileSummary(reviewTargetProfile, {
  ontologicalObligations:
    executionPlan.ontological_anchoring?.obligations === true,
})}

## Optional Context Inputs
- session metadata: ${toRelativePath(sessionMetadataPath, projectRoot)}
- target snapshot: ${toRelativePath(binding.target_snapshot_path, projectRoot)}
- context candidate assembly: ${toRelativePath(contextCandidateAssemblyPath, projectRoot)}
- domain binding: ${toRelativePath(executionPlan.domain_binding_path ?? path.join(sessionRoot, "execution-preparation", "domain-binding.yaml"), projectRoot)}
- review value-alignment criteria: ${toRelativePath(executionPlan.review_value_alignment_criteria_path ?? path.join(sessionRoot, "execution-preparation", "review-value-alignment-criteria.yaml"), projectRoot)}
- consumer id: ${consumerId}
- allowed context source ids: ${allowedContextSourceIds.join(", ")}

${renderBoundaryPolicySection(binding, projectRoot, {
  allowedOutputRefs: lensAllowedOutputRefs,
  tools: lensOutputFormat === "sidecar" ? "required" : "denied",
})}

${renderBoundaryEnforcementSection(binding)}

${renderEffectiveBoundaryStateSection(binding, projectRoot)}

${renderUnitBoundaryDetailsSection({
  binding,
  projectRoot,
  unitId: seat.lens_id,
  outputPath: lensDispatchOutputPath,
  repoExplorationPolicy:
    binding.effective_boundary_state.repo_exploration.effective_policy,
  allowedReadRefs: lensAllowedReadRefs,
})}

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
- Apply the review target profile summary as bounded target-kind and review-goal context.
- Use only your lens-specific perspective.
- Perform structural inspection first when applicable.
- If you find an issue, state what, why, and how to fix it.
- For blocker/high/medium candidates, trace the evidence-backed causal path until the current bounded evidence reaches the starting cause; keep clear low/info findings surface-only.
- If you find no issue, state why it is correct.
- ${
      lensOutputFormat === "sidecar"
        ? `Submit your complete finding batch as the submit_lens_findings payload. The runtime writes the sidecar to ${toRelativePath(lensDispatchOutputPath, projectRoot)}.`
        : `Write your result to: ${toRelativePath(seat.output_path, projectRoot)}`
    }

${lensOutputFormat === "sidecar"
      ? renderLensSidecarOutputContract({
          sessionDomain: binding.resolved_session_domain,
          humanOutputPath: lensHumanOutputPath,
          projectRoot,
          judgmentAnchor:
            executionPlan.ontological_anchoring?.judgment_anchor === true,
        })
      : renderLensOutputSchemaGate(binding.resolved_session_domain)}

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
