import fs from "node:fs/promises";
import path from "node:path";
import type {
  ReviewExecutionPlan,
  ReviewIssueArtifactId,
  ReviewIssueArtifactPromptPacketSeat,
} from "./artifact-types.js";
import {
  fileExists,
  readYamlDocument,
  toRelativePath,
} from "./review-artifact-utils.js";

export const PRE_DELIBERATION_ISSUE_ARTIFACT_IDS = [
  "finding-ledger",
  "finding-relation-graph",
  "issue-ledger",
  "issue-stance-matrix",
  "deliberation-plan",
] as const satisfies ReviewIssueArtifactId[];

export const ISSUE_ARTIFACT_IDS = [
  ...PRE_DELIBERATION_ISSUE_ARTIFACT_IDS,
  "problem-framing",
] as const satisfies ReviewIssueArtifactId[];

const STANCE_VALUES = new Set([
  "support",
  "oppose",
  "narrow",
  "alternative_root",
  "surface_only",
  "not_applicable",
  "insufficient_evidence",
]);

const RELATION_VALUES = new Set([
  "same_root_candidate",
  "causes",
  "symptom_of",
  "enables",
  "duplicates",
  "conflicts_with",
  "independent",
]);

const CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);

const SEVERITY_VALUES = new Set(["low", "medium", "high", "critical"]);

const ROOT_HYPOTHESIS_POSITION_VALUES = new Set([
  "accepts",
  "narrows",
  "replaces",
  "rejects",
  "not_applicable",
  "insufficient_evidence",
]);

const SEVERITY_POSITION_VALUES = new Set([
  "keeps",
  "raises",
  "lowers",
  "not_applicable",
  "insufficient_evidence",
]);

const ISSUE_ROLE_VALUES = new Set([
  "root_cause",
  "symptom",
  "enabler",
  "conflicting_interpretation",
  "evidence_gap",
  "independent_issue",
]);

const JUDGMENT_STATE_VALUES = new Set([
  "observed",
  "inferred",
  "contested",
  "insufficient_evidence",
  "outside_boundary",
]);

const IMPACT_KIND_VALUES = new Set([
  "correctness",
  "consistency",
  "completeness",
  "safety_risk",
  "usability",
  "governance_value",
  "maintainability_evolvability",
]);

const TIMING_CLASS_VALUES = new Set([
  "current_blocker",
  "next_step_blocker",
  "planned_follow_up",
  "defer_watch",
]);

const CLOSURE_CLASS_VALUES = new Set([
  "fix_now",
  "carry_forward",
  "document_only",
  "needs_decision",
  "needs_evidence",
  "watch",
]);

const DOMAIN_PROFILE_STATUS_VALUES = new Set([
  "applied",
  "absent",
  "not_requested",
]);

export function requireIssueArtifactSeat(
  executionPlan: ReviewExecutionPlan,
  artifactId: ReviewIssueArtifactId,
): ReviewIssueArtifactPromptPacketSeat {
  const seat = executionPlan.issue_artifact_prompt_packet_seats.find(
    (candidate) => candidate.artifact_id === artifactId,
  );
  if (!seat) {
    throw new Error(`Missing issue artifact prompt seat: ${artifactId}`);
  }
  return seat;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML mapping.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a YAML list.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  return requireArray(value, label).map((item, index) =>
    requireString(item, `${label}[${index}]`),
  );
}

function requireAllowed(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): string {
  const text = requireString(value, label);
  if (!allowed.has(text)) {
    throw new Error(
      `${label} has unsupported value: ${text}. Allowed values: ${[
        ...allowed,
      ].join(", ")}`,
    );
  }
  return text;
}

function ensureUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} contains duplicate value: ${value}`);
    }
    seen.add(value);
  }
}

function ensureKnown(value: string, known: ReadonlySet<string>, label: string): void {
  if (!known.has(value)) {
    throw new Error(`${label} references unknown id: ${value}`);
  }
}

function relativeList(projectRoot: string, paths: string[]): string {
  if (paths.length === 0) return "- (none)";
  return paths.map((targetPath) => `- ${toRelativePath(targetPath, projectRoot)}`).join("\n");
}

export function renderIssueArtifactRefs(
  projectRoot: string,
  executionPlan: ReviewExecutionPlan,
  artifactIds: ReviewIssueArtifactId[],
): string {
  return artifactIds
    .map((artifactId) => {
      const seat = requireIssueArtifactSeat(executionPlan, artifactId);
      return `- ${artifactId}: ${toRelativePath(seat.output_path, projectRoot)}`;
    })
    .join("\n");
}

export async function resolveProblemFramingProfileRef(args: {
  projectRoot: string;
  executionPlan: ReviewExecutionPlan;
}): Promise<string | null> {
  const contextCandidateAssemblyPath = path.join(
    args.executionPlan.execution_preparation_root,
    "context-candidate-assembly.yaml",
  );
  if (!(await fileExists(contextCandidateAssemblyPath))) return null;
  const assembly = await readYamlDocument<Record<string, unknown>>(
    contextCandidateAssemblyPath,
  );
  const refs = Array.isArray(assembly.domain_context_refs)
    ? assembly.domain_context_refs
    : [];
  const profileRef = refs.find(
    (candidate): candidate is string =>
      typeof candidate === "string" &&
      path.basename(candidate) === "problem_framing_profile.md",
  );
  return profileRef ? toRelativePath(profileRef, args.projectRoot) : null;
}

export function buildIssueArtifactPrompt(args: {
  artifactId: ReviewIssueArtifactId;
  sessionId: string;
  projectRoot: string;
  outputPath: string;
  lensOutputPaths: string[];
  deliberationResponsePaths?: string[];
  deliberationOutputPath?: string;
  problemFramingProfileRef?: string | null;
  executionPlan: ReviewExecutionPlan;
}): string {
  const outputRef = toRelativePath(args.outputPath, args.projectRoot);
  const lensRefs = relativeList(args.projectRoot, args.lensOutputPaths);
  const deliberationResponseRefs = relativeList(
    args.projectRoot,
    args.deliberationResponsePaths ?? [],
  );
  const commonHeader = `# Issue-Stance Artifact Prompt

session_id: ${args.sessionId}
unit_id: ${args.artifactId}
unit_kind: issue_artifact
artifact_id: ${args.artifactId}
output_path: ${outputRef}

## Canonical Role
You are a review runtime artifact builder.
You are not an independent review lens.
You must derive the requested artifact from existing lens outputs and prior issue artifacts.

## Hard Output Contract
- Write YAML only.
- Do not use markdown fences.
- Do not include commentary before or after the YAML.
- Include \`schema_version: 1\`.
- Include \`session_id: "${args.sessionId}"\`.
- Quote every scalar string value with double quotes, or use a YAML block scalar for long text.
- Do not leave a colon-bearing text value unquoted.
- Preserve lens IDs, source refs, issue IDs, and finding IDs consistently.
- If evidence is insufficient, encode that explicitly in the YAML instead of inventing facts.
- Enum fields must use exactly one listed token. Do not append explanation text to enum values; put explanations in rationale fields.

## Lens Outputs
${lensRefs}
`;

  switch (args.artifactId) {
    case "finding-ledger":
      return `${commonHeader}
## Task
Build \`finding-ledger.yaml\` from every Round 1 lens output.
Register every finding or issue claim that can affect the final review.
Do not cluster findings here.

## Required YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
findings:
  - finding_id: finding-001
    lens_id: logic
    source_ref: round1/logic.md#finding-1
    target: "file or artifact"
    evidence_anchor: "stable evidence anchor"
    claim: "surface finding claim"
    proposed_action: "stated or inferred action"
    severity: medium
validation:
  unaddressable_findings: []
`;
    case "finding-relation-graph":
      return `${commonHeader}
## Prior Issue Artifacts
${renderIssueArtifactRefs(args.projectRoot, args.executionPlan, ["finding-ledger"])}

## Task
Build \`finding-relation-graph.yaml\`.
Relate findings by common root, causality, dependency, duplication, conflict, or independence.

Allowed relation values:
- same_root_candidate
- causes
- symptom_of
- enables
- duplicates
- conflicts_with
- independent

## Required YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
relations:
  - relation_id: rel-001
    from_finding_id: finding-001
    to_finding_id: finding-002
    relation: same_root_candidate
    root_hypothesis: "falsifiable common-root claim"
    rationale: "why this relation is supported"
    confidence: medium
singleton_findings:
  - finding_id: finding-009
    reason: "why no relation was accepted"
`;
    case "issue-ledger":
      return `${commonHeader}
## Prior Issue Artifacts
${renderIssueArtifactRefs(args.projectRoot, args.executionPlan, [
  "finding-ledger",
  "finding-relation-graph",
])}

## Task
Build \`issue-ledger.yaml\`.
Group surface findings into root-cause issue clusters.
Do not create an issue that has no supporting finding_id.

## Required YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
issues:
  - issue_id: issue-001
    root_cause_hypothesis: "falsifiable root-cause hypothesis"
    root_confidence: medium
    surface_finding_ids: [finding-001]
    relation_refs: [rel-001]
    raised_by_lens_ids: [logic]
    issue_statement: "root-level issue statement"
    proposed_action: "action framing from source findings, not a detailed fix"
    severity: medium
    singleton_reason: null
validation:
  unclustered_finding_ids: []
`;
    case "issue-stance-matrix":
      return `${commonHeader}
## Prior Issue Artifacts
${renderIssueArtifactRefs(args.projectRoot, args.executionPlan, [
  "finding-ledger",
  "finding-relation-graph",
  "issue-ledger",
])}

## Task
Build \`issue-stance-matrix.yaml\`.
Every participating lens must have one stance for every issue.

Allowed stance values:
- support
- oppose
- narrow
- alternative_root
- surface_only
- not_applicable
- insufficient_evidence

Allowed root_hypothesis_position values:
- accepts
- narrows
- replaces
- rejects
- not_applicable
- insufficient_evidence

Allowed severity_position values:
- keeps
- raises
- lowers
- not_applicable
- insufficient_evidence

## Required YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
issues:
  - issue_id: issue-001
    stances:
      - lens_id: logic
        stance: support
        rationale: "why this lens takes this stance"
        root_hypothesis_position: accepts
        severity_position: keeps
        evidence_refs: [round1/logic.md]
validation:
  missing_stances: []
`;
    case "deliberation-plan":
      return `${commonHeader}
## Prior Issue Artifacts
${renderIssueArtifactRefs(args.projectRoot, args.executionPlan, [
  "finding-ledger",
  "finding-relation-graph",
  "issue-ledger",
  "issue-stance-matrix",
])}

## Task
Build \`deliberation-plan.yaml\`.
Only material conflicts enter planned deliberation.
Compatible issue stances should be listed under skipped_issues with a reason.

## Required YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
planned_issues:
  - issue_id: issue-001
    order: 1
    material_conflict: true
    participating_lens_ids: [logic, structure]
    conflict_summary: "what incompatible claims must be deliberated"
    resolution_question: "the exact question deliberation must answer"
skipped_issues:
  - issue_id: issue-002
    reason: "no material conflict"
`;
    case "problem-framing":
      return `${commonHeader}
## Prior Issue Artifacts
${renderIssueArtifactRefs(args.projectRoot, args.executionPlan, [
  "finding-ledger",
  "finding-relation-graph",
  "issue-ledger",
  "issue-stance-matrix",
  "deliberation-plan",
])}

## Controlled Deliberation Result
- teamlead result: ${
  args.deliberationOutputPath
    ? toRelativePath(args.deliberationOutputPath, args.projectRoot)
    : "(missing)"
}

## Lens Deliberation Responses
${deliberationResponseRefs}

## Domain Problem Framing Profile
- profile: ${args.problemFramingProfileRef ?? "(absent)"}

## Task
Build \`problem-framing.yaml\`.
Classify each issue with the common spine and optional domain axes from the selected profile.
Do not change issue status or lens stance.
Do not propose detailed fixes.

Allowed common spine values:
- issue_role: root_cause, symptom, enabler, conflicting_interpretation, evidence_gap, independent_issue
- judgment_state: observed, inferred, contested, insufficient_evidence, outside_boundary
- impact_kind: correctness, consistency, completeness, safety_risk, usability, governance_value, maintainability_evolvability
- timing_class: current_blocker, next_step_blocker, planned_follow_up, defer_watch
- closure_class: fix_now, carry_forward, document_only, needs_decision, needs_evidence, watch

## Required YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
classification_context:
  common_spine_version: 1
  session_domain: "from binding"
  domain_profile_ref: "${args.problemFramingProfileRef ?? ""}"
  domain_profile_doc_type: "custom:problem_framing_profile"
  domain_profile_status: ${args.problemFramingProfileRef ? "applied" : "absent"}
classifications:
  - issue_id: issue-001
    problem_definition: "root-level problem definition"
    issue_role: root_cause
    judgment_state: inferred
    impact_kind: consistency
    timing_class: next_step_blocker
    closure_class: carry_forward
    domain_axes: {}
    rationale: "why this classification is appropriate"
    related_surface_finding_ids: [finding-001]
`;
  }
}

export async function writeIssueArtifactPromptPacket(args: {
  artifactId: ReviewIssueArtifactId;
  sessionId: string;
  projectRoot: string;
  executionPlan: ReviewExecutionPlan;
  lensOutputPaths: string[];
  deliberationResponsePaths?: string[];
  deliberationOutputPath?: string;
  problemFramingProfileRef?: string | null;
}): Promise<ReviewIssueArtifactPromptPacketSeat> {
  const seat = requireIssueArtifactSeat(args.executionPlan, args.artifactId);
  const packetText = buildIssueArtifactPrompt({
    artifactId: args.artifactId,
    sessionId: args.sessionId,
    projectRoot: args.projectRoot,
    outputPath: seat.output_path,
    lensOutputPaths: args.lensOutputPaths,
    ...(args.deliberationResponsePaths
      ? { deliberationResponsePaths: args.deliberationResponsePaths }
      : {}),
    ...(args.deliberationOutputPath
      ? { deliberationOutputPath: args.deliberationOutputPath }
      : {}),
    ...(args.problemFramingProfileRef !== undefined
      ? { problemFramingProfileRef: args.problemFramingProfileRef }
      : {}),
    executionPlan: args.executionPlan,
  });
  await fs.mkdir(path.dirname(seat.packet_path), { recursive: true });
  await fs.writeFile(seat.packet_path, `${packetText.trimEnd()}\n`, "utf8");
  return seat;
}

function validateEnvelope(args: {
  artifactId: ReviewIssueArtifactId;
  parsed: Record<string, unknown>;
  sessionId: string;
}): void {
  if (args.parsed.schema_version !== 1) {
    throw new Error(`${args.artifactId} must declare schema_version: 1`);
  }
  if (args.parsed.session_id !== args.sessionId) {
    throw new Error(`${args.artifactId} must declare session_id: ${args.sessionId}`);
  }
}

export function validateIssueArtifactObject(args: {
  artifactId: ReviewIssueArtifactId;
  parsed: Record<string, unknown>;
  sessionId: string;
  knownFindingIds?: ReadonlySet<string>;
  knownRelationIds?: ReadonlySet<string>;
  knownIssueIds?: ReadonlySet<string>;
  participatingLensIds?: string[];
}): void {
  validateEnvelope(args);

  switch (args.artifactId) {
    case "finding-ledger": {
      const findings = requireArray(args.parsed.findings, "finding-ledger.findings");
      const findingIds: string[] = [];
      for (const [index, item] of findings.entries()) {
        const finding = requireRecord(item, `finding-ledger.findings[${index}]`);
        findingIds.push(requireString(finding.finding_id, `finding-ledger.findings[${index}].finding_id`));
        requireString(finding.lens_id, `finding-ledger.findings[${index}].lens_id`);
        requireString(finding.source_ref, `finding-ledger.findings[${index}].source_ref`);
        requireString(finding.claim, `finding-ledger.findings[${index}].claim`);
        requireAllowed(finding.severity, SEVERITY_VALUES, `finding-ledger.findings[${index}].severity`);
      }
      ensureUnique(findingIds, "finding-ledger.finding_id");
      const validation = requireRecord(args.parsed.validation, "finding-ledger.validation");
      requireArray(validation.unaddressable_findings, "finding-ledger.validation.unaddressable_findings");
      return;
    }

    case "finding-relation-graph": {
      const knownFindingIds = args.knownFindingIds ?? new Set<string>();
      const relationIds: string[] = [];
      for (const [index, item] of requireArray(args.parsed.relations, "finding-relation-graph.relations").entries()) {
        const relation = requireRecord(item, `finding-relation-graph.relations[${index}]`);
        relationIds.push(requireString(relation.relation_id, `finding-relation-graph.relations[${index}].relation_id`));
        const from = requireString(relation.from_finding_id, `finding-relation-graph.relations[${index}].from_finding_id`);
        const to = requireString(relation.to_finding_id, `finding-relation-graph.relations[${index}].to_finding_id`);
        if (knownFindingIds.size > 0) {
          ensureKnown(from, knownFindingIds, `finding-relation-graph.relations[${index}].from_finding_id`);
          ensureKnown(to, knownFindingIds, `finding-relation-graph.relations[${index}].to_finding_id`);
        }
        requireAllowed(relation.relation, RELATION_VALUES, `finding-relation-graph.relations[${index}].relation`);
        if (relation.confidence !== undefined) {
          requireAllowed(relation.confidence, CONFIDENCE_VALUES, `finding-relation-graph.relations[${index}].confidence`);
        }
        requireString(relation.rationale, `finding-relation-graph.relations[${index}].rationale`);
      }
      ensureUnique(relationIds, "finding-relation-graph.relation_id");
      for (const [index, item] of requireArray(args.parsed.singleton_findings, "finding-relation-graph.singleton_findings").entries()) {
        const singleton = requireRecord(item, `finding-relation-graph.singleton_findings[${index}]`);
        const findingId = requireString(singleton.finding_id, `finding-relation-graph.singleton_findings[${index}].finding_id`);
        if (knownFindingIds.size > 0) {
          ensureKnown(findingId, knownFindingIds, `finding-relation-graph.singleton_findings[${index}].finding_id`);
        }
        requireString(singleton.reason, `finding-relation-graph.singleton_findings[${index}].reason`);
      }
      return;
    }

    case "issue-ledger": {
      const knownFindingIds = args.knownFindingIds ?? new Set<string>();
      const knownRelationIds = args.knownRelationIds ?? new Set<string>();
      const issueIds: string[] = [];
      for (const [index, item] of requireArray(args.parsed.issues, "issue-ledger.issues").entries()) {
        const issue = requireRecord(item, `issue-ledger.issues[${index}]`);
        issueIds.push(requireString(issue.issue_id, `issue-ledger.issues[${index}].issue_id`));
        requireString(issue.root_cause_hypothesis, `issue-ledger.issues[${index}].root_cause_hypothesis`);
        requireAllowed(issue.root_confidence, CONFIDENCE_VALUES, `issue-ledger.issues[${index}].root_confidence`);
        requireString(issue.issue_statement, `issue-ledger.issues[${index}].issue_statement`);
        requireAllowed(issue.severity, SEVERITY_VALUES, `issue-ledger.issues[${index}].severity`);
        const surfaceFindingIds = requireStringArray(issue.surface_finding_ids, `issue-ledger.issues[${index}].surface_finding_ids`);
        if (surfaceFindingIds.length === 0) {
          throw new Error(`issue-ledger.issues[${index}].surface_finding_ids must not be empty.`);
        }
        for (const findingId of surfaceFindingIds) {
          if (knownFindingIds.size > 0) {
            ensureKnown(findingId, knownFindingIds, `issue-ledger.issues[${index}].surface_finding_ids`);
          }
        }
        for (const relationId of requireStringArray(issue.relation_refs, `issue-ledger.issues[${index}].relation_refs`)) {
          if (knownRelationIds.size > 0) {
            ensureKnown(relationId, knownRelationIds, `issue-ledger.issues[${index}].relation_refs`);
          }
        }
        requireStringArray(issue.raised_by_lens_ids, `issue-ledger.issues[${index}].raised_by_lens_ids`);
      }
      ensureUnique(issueIds, "issue-ledger.issue_id");
      const validation = requireRecord(args.parsed.validation, "issue-ledger.validation");
      requireArray(validation.unclustered_finding_ids, "issue-ledger.validation.unclustered_finding_ids");
      return;
    }

    case "issue-stance-matrix": {
      const knownIssueIds = args.knownIssueIds ?? new Set<string>();
      const participatingLensIds = args.participatingLensIds ?? [];
      const matrixIssueIds: string[] = [];
      for (const [index, item] of requireArray(args.parsed.issues, "issue-stance-matrix.issues").entries()) {
        const issue = requireRecord(item, `issue-stance-matrix.issues[${index}]`);
        const issueId = requireString(issue.issue_id, `issue-stance-matrix.issues[${index}].issue_id`);
        matrixIssueIds.push(issueId);
        if (knownIssueIds.size > 0) {
          ensureKnown(issueId, knownIssueIds, `issue-stance-matrix.issues[${index}].issue_id`);
        }
        const stanceLensIds: string[] = [];
        for (const [stanceIndex, stanceItem] of requireArray(issue.stances, `issue-stance-matrix.issues[${index}].stances`).entries()) {
          const stance = requireRecord(stanceItem, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}]`);
          stanceLensIds.push(requireString(stance.lens_id, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].lens_id`));
          requireAllowed(stance.stance, STANCE_VALUES, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].stance`);
          requireString(stance.rationale, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].rationale`);
          requireAllowed(stance.root_hypothesis_position, ROOT_HYPOTHESIS_POSITION_VALUES, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].root_hypothesis_position`);
          requireAllowed(stance.severity_position, SEVERITY_POSITION_VALUES, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].severity_position`);
          requireArray(stance.evidence_refs, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].evidence_refs`);
        }
        ensureUnique(stanceLensIds, `issue-stance-matrix.issues[${index}].stances.lens_id`);
        for (const lensId of participatingLensIds) {
          if (!stanceLensIds.includes(lensId)) {
            throw new Error(`issue-stance-matrix missing stance for issue ${issueId} and lens ${lensId}`);
          }
        }
      }
      ensureUnique(matrixIssueIds, "issue-stance-matrix.issue_id");
      if (knownIssueIds.size > 0) {
        for (const issueId of knownIssueIds) {
          if (!matrixIssueIds.includes(issueId)) {
            throw new Error(`issue-stance-matrix missing issue: ${issueId}`);
          }
        }
      }
      const validation = requireRecord(args.parsed.validation, "issue-stance-matrix.validation");
      requireArray(validation.missing_stances, "issue-stance-matrix.validation.missing_stances");
      return;
    }

    case "deliberation-plan": {
      const knownIssueIds = args.knownIssueIds ?? new Set<string>();
      const covered = new Set<string>();
      for (const [index, item] of requireArray(args.parsed.planned_issues, "deliberation-plan.planned_issues").entries()) {
        const issue = requireRecord(item, `deliberation-plan.planned_issues[${index}]`);
        const issueId = requireString(issue.issue_id, `deliberation-plan.planned_issues[${index}].issue_id`);
        covered.add(issueId);
        if (knownIssueIds.size > 0) {
          ensureKnown(issueId, knownIssueIds, `deliberation-plan.planned_issues[${index}].issue_id`);
        }
        requireStringArray(issue.participating_lens_ids, `deliberation-plan.planned_issues[${index}].participating_lens_ids`);
        requireString(issue.conflict_summary, `deliberation-plan.planned_issues[${index}].conflict_summary`);
        requireString(issue.resolution_question, `deliberation-plan.planned_issues[${index}].resolution_question`);
      }
      for (const [index, item] of requireArray(args.parsed.skipped_issues, "deliberation-plan.skipped_issues").entries()) {
        const issue = requireRecord(item, `deliberation-plan.skipped_issues[${index}]`);
        const issueId = requireString(issue.issue_id, `deliberation-plan.skipped_issues[${index}].issue_id`);
        covered.add(issueId);
        if (knownIssueIds.size > 0) {
          ensureKnown(issueId, knownIssueIds, `deliberation-plan.skipped_issues[${index}].issue_id`);
        }
        requireString(issue.reason, `deliberation-plan.skipped_issues[${index}].reason`);
      }
      if (knownIssueIds.size > 0) {
        for (const issueId of knownIssueIds) {
          if (!covered.has(issueId)) {
            throw new Error(`deliberation-plan does not cover issue: ${issueId}`);
          }
        }
      }
      return;
    }

    case "problem-framing": {
      const knownIssueIds = args.knownIssueIds ?? new Set<string>();
      const classificationContext = requireRecord(args.parsed.classification_context, "problem-framing.classification_context");
      if (classificationContext.common_spine_version !== 1) {
        throw new Error("problem-framing.classification_context.common_spine_version must be 1.");
      }
      requireString(classificationContext.session_domain, "problem-framing.classification_context.session_domain");
      const profileRef = typeof classificationContext.domain_profile_ref === "string"
        ? classificationContext.domain_profile_ref
        : "";
      if (classificationContext.domain_profile_doc_type !== "custom:problem_framing_profile") {
        throw new Error("problem-framing.classification_context.domain_profile_doc_type must be custom:problem_framing_profile.");
      }
      const profileStatus = requireAllowed(
        classificationContext.domain_profile_status,
        DOMAIN_PROFILE_STATUS_VALUES,
        "problem-framing.classification_context.domain_profile_status",
      );
      if (profileRef.trim().length > 0 && profileStatus !== "applied") {
        throw new Error("problem-framing profile ref is present, so domain_profile_status must be applied.");
      }
      if (profileRef.trim().length === 0 && profileStatus === "applied") {
        throw new Error("problem-framing profile ref is absent, so domain_profile_status must not be applied.");
      }
      const classificationIssueIds: string[] = [];
      for (const [index, item] of requireArray(args.parsed.classifications, "problem-framing.classifications").entries()) {
        const classification = requireRecord(item, `problem-framing.classifications[${index}]`);
        const issueId = requireString(classification.issue_id, `problem-framing.classifications[${index}].issue_id`);
        classificationIssueIds.push(issueId);
        if (knownIssueIds.size > 0) {
          ensureKnown(issueId, knownIssueIds, `problem-framing.classifications[${index}].issue_id`);
        }
        requireString(classification.problem_definition, `problem-framing.classifications[${index}].problem_definition`);
        requireAllowed(classification.issue_role, ISSUE_ROLE_VALUES, `problem-framing.classifications[${index}].issue_role`);
        requireAllowed(classification.judgment_state, JUDGMENT_STATE_VALUES, `problem-framing.classifications[${index}].judgment_state`);
        requireAllowed(classification.impact_kind, IMPACT_KIND_VALUES, `problem-framing.classifications[${index}].impact_kind`);
        requireAllowed(classification.timing_class, TIMING_CLASS_VALUES, `problem-framing.classifications[${index}].timing_class`);
        requireAllowed(classification.closure_class, CLOSURE_CLASS_VALUES, `problem-framing.classifications[${index}].closure_class`);
        requireRecord(classification.domain_axes, `problem-framing.classifications[${index}].domain_axes`);
        requireString(classification.rationale, `problem-framing.classifications[${index}].rationale`);
        requireStringArray(classification.related_surface_finding_ids, `problem-framing.classifications[${index}].related_surface_finding_ids`);
      }
      ensureUnique(classificationIssueIds, "problem-framing.issue_id");
      if (knownIssueIds.size > 0) {
        for (const issueId of knownIssueIds) {
          if (!classificationIssueIds.includes(issueId)) {
            throw new Error(`problem-framing missing issue classification: ${issueId}`);
          }
        }
      }
      return;
    }
  }
}

async function readArtifact(
  executionPlan: ReviewExecutionPlan,
  artifactId: ReviewIssueArtifactId,
): Promise<Record<string, unknown>> {
  const seat = requireIssueArtifactSeat(executionPlan, artifactId);
  return readYamlDocument<Record<string, unknown>>(seat.output_path);
}

function findingIdsFrom(findingLedger: Record<string, unknown>): Set<string> {
  return new Set(
    requireArray(findingLedger.findings, "finding-ledger.findings").map((item, index) =>
      requireString(
        requireRecord(item, `finding-ledger.findings[${index}]`).finding_id,
        `finding-ledger.findings[${index}].finding_id`,
      ),
    ),
  );
}

function relationIdsFrom(relationGraph: Record<string, unknown>): Set<string> {
  return new Set(
    requireArray(relationGraph.relations, "finding-relation-graph.relations").map((item, index) =>
      requireString(
        requireRecord(item, `finding-relation-graph.relations[${index}]`).relation_id,
        `finding-relation-graph.relations[${index}].relation_id`,
      ),
    ),
  );
}

function issueIdsFrom(issueLedger: Record<string, unknown>): Set<string> {
  return new Set(
    requireArray(issueLedger.issues, "issue-ledger.issues").map((item, index) =>
      requireString(
        requireRecord(item, `issue-ledger.issues[${index}]`).issue_id,
        `issue-ledger.issues[${index}].issue_id`,
      ),
    ),
  );
}

export async function validateIssueArtifactOnDisk(args: {
  executionPlan: ReviewExecutionPlan;
  artifactId: ReviewIssueArtifactId;
  participatingLensIds: string[];
}): Promise<Record<string, unknown>> {
  const parsed = await readArtifact(args.executionPlan, args.artifactId);
  const findingLedger =
    args.artifactId === "finding-ledger"
      ? parsed
      : await readArtifact(args.executionPlan, "finding-ledger");
  const knownFindingIds = findingIdsFrom(findingLedger);
  const relationGraph = (() => {
    if (args.artifactId === "finding-ledger") return null;
    if (args.artifactId === "finding-relation-graph") return parsed;
    return undefined;
  })();
  const resolvedRelationGraph =
    relationGraph === undefined
      ? await readArtifact(args.executionPlan, "finding-relation-graph")
      : relationGraph;
  const knownRelationIds = relationGraph ? relationIdsFrom(relationGraph) : new Set<string>();
  const knownResolvedRelationIds = resolvedRelationGraph
    ? relationIdsFrom(resolvedRelationGraph)
    : knownRelationIds;
  const issueLedger = (() => {
    if (
      args.artifactId === "finding-ledger" ||
      args.artifactId === "finding-relation-graph"
    ) {
      return null;
    }
    if (args.artifactId === "issue-ledger") return parsed;
    return undefined;
  })();
  const resolvedIssueLedger =
    issueLedger === undefined
      ? await readArtifact(args.executionPlan, "issue-ledger")
      : issueLedger;
  const knownIssueIds = resolvedIssueLedger ? issueIdsFrom(resolvedIssueLedger) : new Set<string>();

  validateIssueArtifactObject({
    artifactId: args.artifactId,
    parsed,
    sessionId: args.executionPlan.session_id,
    knownFindingIds,
    knownRelationIds: knownResolvedRelationIds,
    knownIssueIds,
    participatingLensIds: args.participatingLensIds,
  });
  return parsed;
}

export async function renderIssueArtifactContext(args: {
  projectRoot: string;
  executionPlan: ReviewExecutionPlan;
  artifactIds?: readonly ReviewIssueArtifactId[];
}): Promise<string> {
  const artifactIds = args.artifactIds ?? PRE_DELIBERATION_ISSUE_ARTIFACT_IDS;
  const sections = [
    "Use the issue artifact content below as the root-cause issue frame.",
    "The file paths are provenance anchors; the YAML bodies are in-scope evidence.",
  ];
  for (const artifactId of artifactIds) {
    const seat = requireIssueArtifactSeat(args.executionPlan, artifactId);
    const content = await fs.readFile(seat.output_path, "utf8");
    sections.push(
      [
        `### ${artifactId}`,
        `path: ${toRelativePath(seat.output_path, args.projectRoot)}`,
        "",
        "```yaml",
        content.trim(),
        "```",
      ].join("\n"),
    );
  }
  return sections.join("\n\n");
}
