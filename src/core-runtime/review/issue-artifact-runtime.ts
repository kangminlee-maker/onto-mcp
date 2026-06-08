import fs from "node:fs/promises";
import path from "node:path";
import type {
  ReviewExecutionPlan,
  ReviewFindingSeverity,
  ReviewIssueArtifactId,
  ReviewIssueArtifactPromptPacketSeat,
} from "./artifact-types.js";
import {
  dumpYamlDocument,
  fileExists,
  readYamlDocument,
  toRelativePath,
  writeYamlDocument,
} from "./review-artifact-utils.js";
import {
  isMaterialSeverity,
  REVIEW_SEVERITY_ORDER,
} from "./review-result-classification.js";
import { reviewProgressStepByIssueArtifact } from "./review-progress-contract.js";
import {
  renderBoundaryPolicySection,
  renderUnitBoundaryDetailsSection,
} from "./boundary-prompt-sections.js";
import { lensIdFromRound1ArtifactPath } from "./lens-sidecar-artifact.js";
import {
  PROBLEM_FRAMING_CLASSIFICATION_ARTIFACT_KEYS,
  PROBLEM_FRAMING_CLOSURE_CLASS_SET,
  PROBLEM_FRAMING_CLOSURE_OBLIGATION_SET,
  PROBLEM_FRAMING_IMPACT_KIND_SET,
  PROBLEM_FRAMING_ISSUE_ROLE_SET,
  PROBLEM_FRAMING_JUDGMENT_STATE_SET,
  PROBLEM_FRAMING_TIMING_CLASS_SET,
} from "./problem-framing-spine.js";

export interface IssueArtifactSpec {
  artifact_id: ReviewIssueArtifactId;
  file_name: string;
  prompt_packet_file_name: string;
  ref_key: string;
  phase: "pre_deliberation" | "post_deliberation";
  progress_step: number;
  progress_label: string;
}

export interface IssueArtifactFindingFact {
  lens_id: string;
  evidence_refs: ReadonlySet<string>;
}

interface IssueLedgerCompletionFinding {
  finding_id: string;
  lens_id: string;
  claim: string;
  lens_rationale_summary: string;
  proposed_action: string | null;
  affected_purpose: string;
  failure_condition: string;
  impact: string;
  evidence_refs: string[];
  severity: ReviewFindingSeverity;
  domain_threshold_used: string | null;
  root_cause_candidate: string | null;
}

interface IssueLedgerCompletionRelation {
  relation_id: string;
  relation: string;
  from_finding_id: string;
  to_finding_id: string;
  root_hypothesis: string | null;
  shared_cause_claim: string | null;
}

export interface IssueStanceResponseArtifact {
  schema_version: 1;
  session_id: string;
  lens_id: string;
  stances: Array<Record<string, unknown>>;
  validation: {
    missing_issues: string[];
  };
}

type StanceEvidenceRefsByIssueAndLens = ReadonlyMap<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
>;

export const ISSUE_ARTIFACT_REGISTRY = [
  {
    artifact_id: "finding-ledger",
    file_name: "finding-ledger.yaml",
    prompt_packet_file_name: "finding-ledger.prompt.md",
    ref_key: "finding_ledger",
    phase: "pre_deliberation",
    progress_step: reviewProgressStepByIssueArtifact("finding-ledger").step,
    progress_label: reviewProgressStepByIssueArtifact("finding-ledger").label,
  },
  {
    artifact_id: "finding-relation-graph",
    file_name: "finding-relation-graph.yaml",
    prompt_packet_file_name: "finding-relation-graph.prompt.md",
    ref_key: "finding_relation_graph",
    phase: "pre_deliberation",
    progress_step: reviewProgressStepByIssueArtifact("finding-relation-graph").step,
    progress_label: reviewProgressStepByIssueArtifact("finding-relation-graph").label,
  },
  {
    artifact_id: "issue-ledger",
    file_name: "issue-ledger.yaml",
    prompt_packet_file_name: "issue-ledger.prompt.md",
    ref_key: "issue_ledger",
    phase: "pre_deliberation",
    progress_step: reviewProgressStepByIssueArtifact("issue-ledger").step,
    progress_label: reviewProgressStepByIssueArtifact("issue-ledger").label,
  },
  {
    artifact_id: "issue-stance-matrix",
    file_name: "issue-stance-matrix.yaml",
    prompt_packet_file_name: "issue-stance-matrix.prompt.md",
    ref_key: "issue_stance_matrix",
    phase: "pre_deliberation",
    progress_step: reviewProgressStepByIssueArtifact("issue-stance-matrix").step,
    progress_label: reviewProgressStepByIssueArtifact("issue-stance-matrix").label,
  },
  {
    artifact_id: "deliberation-plan",
    file_name: "deliberation-plan.yaml",
    prompt_packet_file_name: "deliberation-plan.prompt.md",
    ref_key: "deliberation_plan",
    phase: "pre_deliberation",
    progress_step: reviewProgressStepByIssueArtifact("deliberation-plan").step,
    progress_label: reviewProgressStepByIssueArtifact("deliberation-plan").label,
  },
  {
    artifact_id: "problem-framing",
    file_name: "problem-framing.yaml",
    prompt_packet_file_name: "problem-framing.prompt.md",
    ref_key: "problem_framing",
    phase: "post_deliberation",
    progress_step: reviewProgressStepByIssueArtifact("problem-framing").step,
    progress_label: reviewProgressStepByIssueArtifact("problem-framing").label,
  },
] as const satisfies readonly IssueArtifactSpec[];

export const PRE_DELIBERATION_ISSUE_ARTIFACT_IDS =
  ISSUE_ARTIFACT_REGISTRY
    .filter((spec) => spec.phase === "pre_deliberation")
    .map((spec) => spec.artifact_id);

export const ISSUE_ARTIFACT_IDS = ISSUE_ARTIFACT_REGISTRY.map(
  (spec) => spec.artifact_id,
);

export function issueArtifactSpec(
  artifactId: ReviewIssueArtifactId,
): IssueArtifactSpec {
  const spec = ISSUE_ARTIFACT_REGISTRY.find(
    (candidate) => candidate.artifact_id === artifactId,
  );
  if (!spec) {
    throw new Error(`Unknown issue artifact id: ${artifactId}`);
  }
  return spec;
}

export function issueArtifactConsumerId(
  artifactId: ReviewIssueArtifactId,
): string {
  return `issue-artifact:${artifactId}`;
}

export function issueStanceConsumerId(lensId: string): string {
  return `issue-stance:${lensId}`;
}

export function issueStanceResponsePath(args: {
  executionPlan: ReviewExecutionPlan;
  lensId: string;
}): string {
  return path.join(
    args.executionPlan.session_root,
    "stance-responses",
    `${args.lensId}.yaml`,
  );
}

export function issueStancePromptPacketPath(args: {
  executionPlan: ReviewExecutionPlan;
  lensId: string;
}): string {
  return path.join(
    args.executionPlan.prompt_packets_root,
    "issue-stance",
    `${args.lensId}.prompt.md`,
  );
}

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
  "shared_cause_candidate",
  "causes",
  "symptom_of",
  "enables",
  "duplicates",
  "conflicts_with",
]);

const ISSUE_DEPENDENCY_KIND_VALUES = new Set([
  "shared_cause_candidate",
]);

const ISSUE_MERGE_RELATION_VALUES = new Set(["same_root_candidate"]);

const CAUSAL_STEP_RELATION_VALUES = new Set([
  "causes",
  "symptom_of",
  "enables",
]);

const CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);

const SEVERITY_VALUES = new Set(REVIEW_SEVERITY_ORDER);

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

const DELIBERATION_CONFLICT_TYPE_VALUES = new Set([
  "correctness_or_blocking_execution",
  "root_hypothesis",
  "domain_constraint",
  "purpose_value",
  "action_or_severity",
  "partial_overlap_or_cluster_scope",
  "evidence_gap",
  "stance_conflict",
]);

const DELIBERATION_SKIP_REASON_CODE_VALUES = new Set([
  "non_material_issue",
  "consistent_stances",
  "no_material_conflict",
  "outside_deliberation_scope",
  "insufficient_participation",
]);

const DELIBERATION_CONFLICT_STANCE_VALUES = new Set([
  "oppose",
  "narrow",
  "alternative_root",
  "surface_only",
  "insufficient_evidence",
]);

const DELIBERATION_CONFLICT_ROOT_POSITION_VALUES = new Set([
  "narrows",
  "replaces",
  "rejects",
  "insufficient_evidence",
]);

const DELIBERATION_CONFLICT_SEVERITY_POSITION_VALUES = new Set([
  "raises",
  "lowers",
  "insufficient_evidence",
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

function requireOnlyFields(
  record: Record<string, unknown>,
  label: string,
  allowedFields: readonly string[],
): void {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) {
      throw new Error(`${label} has unsupported field: ${field}`);
    }
  }
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

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function requireStringArray(value: unknown, label: string): string[] {
  return requireArray(value, label).map((item, index) =>
    requireString(item, `${label}[${index}]`),
  );
}

function requireOptionalStringOrNull(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  requireString(value, label);
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

function projectAbsoluteRef(projectRoot: string, ref: string | null | undefined): string | null {
  if (typeof ref !== "string" || ref.trim().length === 0) return null;
  return path.isAbsolute(ref) ? ref : path.resolve(projectRoot, ref);
}

function uniqueRefs(refs: Array<string | null | undefined>): string[] {
  return [
    ...new Set(refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0)),
  ];
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, label);
}

function optionalStringOrNull(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return requireString(value, label);
}

function optionalMaterialityBasisRecord(
  value: unknown,
  label: string,
): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const record = requireRecord(value, label);
  const evidenceRefs = requireStringArray(record.evidence_refs, `${label}.evidence_refs`);
  if (evidenceRefs.length === 0) {
    throw new Error(`${label}.evidence_refs must not be empty.`);
  }
  return {
    affected_purpose: requireString(record.affected_purpose, `${label}.affected_purpose`),
    failure_condition: requireString(record.failure_condition, `${label}.failure_condition`),
    impact: requireString(record.impact, `${label}.impact`),
    evidence_refs: evidenceRefs,
  };
}

function optionalCausalPathRecord(
  value: unknown,
  label: string,
): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const record = requireRecord(value, label);
  const steps = requireArray(record.steps, `${label}.steps`).map((item, index) =>
    causalPathStepRecord(item, `${label}.steps[${index}]`),
  );
  if (steps.length === 0) {
    throw new Error(`${label}.steps must not be empty.`);
  }
  const rootCauseStepId = requireString(
    record.root_cause_step_id,
    `${label}.root_cause_step_id`,
  );
  if (!steps.some((step) => step.cause_id === rootCauseStepId)) {
    throw new Error(`${label}.root_cause_step_id must reference one of steps[].cause_id.`);
  }
  return {
    root_cause_candidate: requireString(
      record.root_cause_candidate,
      `${label}.root_cause_candidate`,
    ),
    root_cause_step_id: rootCauseStepId,
    steps,
    unresolved_beyond_evidence: optionalStringOrNull(
      record.unresolved_beyond_evidence,
      `${label}.unresolved_beyond_evidence`,
    ),
  };
}

function causalPathStepRecord(value: unknown, label: string): Record<string, unknown> {
  const record = requireRecord(value, label);
  const causeId = requireString(record.cause_id, `${label}.cause_id`);
  const relationToPrevious = optionalStringOrNull(
    record.relation_to_previous,
    `${label}.relation_to_previous`,
  );
  if (
    relationToPrevious !== null &&
    !CAUSAL_STEP_RELATION_VALUES.has(relationToPrevious)
  ) {
    throw new Error(
      `${label}.relation_to_previous has unsupported value: ${relationToPrevious}`,
    );
  }
  const evidenceRefs = requireStringArray(record.evidence_refs, `${label}.evidence_refs`);
  if (evidenceRefs.length === 0) {
    throw new Error(`${label}.evidence_refs must not be empty.`);
  }
  return {
    cause_id: causeId,
    claim: requireString(record.claim, `${label}.claim`),
    relation_to_previous: relationToPrevious,
    evidence_refs: evidenceRefs,
  };
}

function validateSharedCauseForRelation(
  value: unknown,
  relation: string,
  label: string,
  args: {
    fromFindingId: string;
    toFindingId: string;
    knownCauseFindingIds: ReadonlyMap<string, string>;
  },
): void {
  if (relation !== "shared_cause_candidate") {
    if (value !== undefined && value !== null) {
      throw new Error(`${label} must be null unless relation=shared_cause_candidate.`);
    }
    return;
  }
  const sharedCause = requireRecord(value, label);
  requireString(sharedCause.cause_claim, `${label}.cause_claim`);
  const fromCauseRef = requireString(
    sharedCause.from_cause_ref,
    `${label}.from_cause_ref`,
  );
  const toCauseRef = requireString(sharedCause.to_cause_ref, `${label}.to_cause_ref`);
  ensureKnownCauseRef({
    causeRef: fromCauseRef,
    expectedFindingId: args.fromFindingId,
    knownCauseFindingIds: args.knownCauseFindingIds,
    label: `${label}.from_cause_ref`,
  });
  ensureKnownCauseRef({
    causeRef: toCauseRef,
    expectedFindingId: args.toFindingId,
    knownCauseFindingIds: args.knownCauseFindingIds,
    label: `${label}.to_cause_ref`,
  });
}

function ensureKnownCauseRef(args: {
  causeRef: string;
  expectedFindingId: string;
  knownCauseFindingIds: ReadonlyMap<string, string>;
  label: string;
}): void {
  if (args.knownCauseFindingIds.size === 0) {
    throw new Error(`${args.label} cannot be validated without finding-ledger causal_path cause refs.`);
  }
  const actualFindingId = args.knownCauseFindingIds.get(args.causeRef);
  if (!actualFindingId) {
    throw new Error(`${args.label} references unknown cause_id: ${args.causeRef}`);
  }
  if (actualFindingId !== args.expectedFindingId) {
    throw new Error(
      `${args.label} must belong to ${args.expectedFindingId}, got ${actualFindingId}.`,
    );
  }
}

function validateIssueMergeRelations(args: {
  issueLabel: string;
  surfaceFindingIds: string[];
  relationRefs: string[];
  knownRelationFacts: ReadonlyMap<
    string,
    { relation: string; from_finding_id: string; to_finding_id: string }
  >;
}): void {
  if (args.surfaceFindingIds.length <= 1) return;

  const findingSet = new Set(args.surfaceFindingIds);
  for (const [relationId, relationFact] of args.knownRelationFacts) {
    if (
      relationFact.relation === "shared_cause_candidate" &&
      findingSet.has(relationFact.from_finding_id) &&
      findingSet.has(relationFact.to_finding_id)
    ) {
      throw new Error(
        `issue-ledger must not merge findings connected only by shared_cause_candidate relation ${relationId}.`,
      );
    }
  }

  const parent = new Map(args.surfaceFindingIds.map((findingId) => [findingId, findingId]));
  const find = (findingId: string): string => {
    const parentId = parent.get(findingId);
    if (!parentId || parentId === findingId) return findingId;
    const root = find(parentId);
    parent.set(findingId, root);
    return root;
  };
  const union = (first: string, second: string): void => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent.set(secondRoot, firstRoot);
  };

  for (const relationId of args.relationRefs) {
    const relationFact = args.knownRelationFacts.get(relationId);
    if (!relationFact) continue;
    if (!ISSUE_MERGE_RELATION_VALUES.has(relationFact.relation)) continue;
    if (
      !findingSet.has(relationFact.from_finding_id) ||
      !findingSet.has(relationFact.to_finding_id)
    ) {
      continue;
    }
    union(relationFact.from_finding_id, relationFact.to_finding_id);
  }

  const firstFindingId = requireString(
    args.surfaceFindingIds[0],
    `${args.issueLabel}.surface_finding_ids[0]`,
  );
  const root = find(firstFindingId);
  const unsupportedFindingIds = args.surfaceFindingIds.filter(
    (findingId) => find(findingId) !== root,
  );
  if (unsupportedFindingIds.length > 0) {
    throw new Error(
      `${args.issueLabel}.surface_finding_ids must be connected by same_root_candidate relation_refs before they can be merged. Unsupported findings: ${unsupportedFindingIds.join(", ")}`,
    );
  }
}

function completionString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function completionStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string =>
        typeof item === "string" && item.trim().length > 0
      )
    : [];
}

function completionSeverity(value: unknown): ReviewFindingSeverity | null {
  return typeof value === "string" &&
      (SEVERITY_VALUES as ReadonlySet<string>).has(value)
    ? (value as ReviewFindingSeverity)
    : null;
}

function completionConfidence(value: unknown): string {
  return typeof value === "string" && CONFIDENCE_VALUES.has(value)
    ? value
    : "medium";
}

function severityRank(severity: ReviewFindingSeverity): number {
  const index = REVIEW_SEVERITY_ORDER.indexOf(severity);
  return index >= 0 ? index : REVIEW_SEVERITY_ORDER.length;
}

function mostSevere(
  first: ReviewFindingSeverity,
  second: ReviewFindingSeverity,
): ReviewFindingSeverity {
  return severityRank(first) <= severityRank(second) ? first : second;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  ];
}

function completionFindingsFrom(
  findingLedger: Record<string, unknown>,
): Map<string, IssueLedgerCompletionFinding> {
  const findings = new Map<string, IssueLedgerCompletionFinding>();
  for (const [index, item] of requireArray(
    findingLedger.findings,
    "finding-ledger.findings",
  ).entries()) {
    const finding = requireRecord(item, `finding-ledger.findings[${index}]`);
    const findingId = requireString(
      finding.finding_id,
      `finding-ledger.findings[${index}].finding_id`,
    );
    const sourceRef = requireString(
      finding.source_ref,
      `finding-ledger.findings[${index}].source_ref`,
    );
    const evidenceRefs = uniqueNonEmpty([
      ...requireStringArray(
        finding.evidence_refs,
        `finding-ledger.findings[${index}].evidence_refs`,
      ),
      sourceRef,
      optionalString(
        finding.evidence_anchor,
        `finding-ledger.findings[${index}].evidence_anchor`,
      ),
    ]);
    const causalPath = optionalCausalPathRecord(
      finding.causal_path,
      `finding-ledger.findings[${index}].causal_path`,
    );
    findings.set(findingId, {
      finding_id: findingId,
      lens_id: requireString(
        finding.lens_id,
        `finding-ledger.findings[${index}].lens_id`,
      ),
      claim: requireString(
        finding.claim,
        `finding-ledger.findings[${index}].claim`,
      ),
      lens_rationale_summary: requireString(
        finding.lens_rationale_summary,
        `finding-ledger.findings[${index}].lens_rationale_summary`,
      ),
      proposed_action: completionString(finding.proposed_action),
      affected_purpose: requireString(
        finding.affected_purpose,
        `finding-ledger.findings[${index}].affected_purpose`,
      ),
      failure_condition: requireString(
        finding.failure_condition,
        `finding-ledger.findings[${index}].failure_condition`,
      ),
      impact: requireString(
        finding.impact,
        `finding-ledger.findings[${index}].impact`,
      ),
      evidence_refs: evidenceRefs,
      severity: requireAllowed(
        finding.severity,
        SEVERITY_VALUES,
        `finding-ledger.findings[${index}].severity`,
      ) as ReviewFindingSeverity,
      domain_threshold_used: optionalStringOrNull(
        finding.domain_threshold_used,
        `finding-ledger.findings[${index}].domain_threshold_used`,
      ),
      root_cause_candidate: causalPath
        ? completionString(causalPath.root_cause_candidate)
        : null,
    });
  }
  return findings;
}

function completionRelationsFrom(
  relationGraph: Record<string, unknown>,
): IssueLedgerCompletionRelation[] {
  return requireArray(
    relationGraph.relations,
    "finding-relation-graph.relations",
  ).map((item, index) => {
    const relation = requireRecord(
      item,
      `finding-relation-graph.relations[${index}]`,
    );
    const sharedCause =
      relation.shared_cause &&
      typeof relation.shared_cause === "object" &&
      !Array.isArray(relation.shared_cause)
        ? (relation.shared_cause as Record<string, unknown>)
        : null;
    return {
      relation_id: requireString(
        relation.relation_id,
        `finding-relation-graph.relations[${index}].relation_id`,
      ),
      relation: requireAllowed(
        relation.relation,
        RELATION_VALUES,
        `finding-relation-graph.relations[${index}].relation`,
      ),
      from_finding_id: requireString(
        relation.from_finding_id,
        `finding-relation-graph.relations[${index}].from_finding_id`,
      ),
      to_finding_id: requireString(
        relation.to_finding_id,
        `finding-relation-graph.relations[${index}].to_finding_id`,
      ),
      root_hypothesis: completionString(relation.root_hypothesis),
      shared_cause_claim: sharedCause
        ? completionString(sharedCause.cause_claim)
        : null,
    };
  });
}

function relationGraphSingletonReasonsFrom(
  relationGraph: Record<string, unknown>,
): Map<string, string> {
  const reasons = new Map<string, string>();
  for (const [index, item] of requireArray(
    relationGraph.singleton_findings,
    "finding-relation-graph.singleton_findings",
  ).entries()) {
    const singleton = requireRecord(
      item,
      `finding-relation-graph.singleton_findings[${index}]`,
    );
    reasons.set(
      requireString(
        singleton.finding_id,
        `finding-relation-graph.singleton_findings[${index}].finding_id`,
      ),
      requireString(
        singleton.reason,
        `finding-relation-graph.singleton_findings[${index}].reason`,
      ),
    );
  }
  return reasons;
}

function connectedFindingComponents(args: {
  findingIds: string[];
  relations: IssueLedgerCompletionRelation[];
}): string[][] {
  const uniqueFindingIds = [...new Set(args.findingIds)];
  const parent = new Map(uniqueFindingIds.map((findingId) => [findingId, findingId]));
  const find = (findingId: string): string => {
    const parentId = parent.get(findingId);
    if (!parentId || parentId === findingId) return findingId;
    const root = find(parentId);
    parent.set(findingId, root);
    return root;
  };
  const union = (first: string, second: string): void => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent.set(secondRoot, firstRoot);
  };
  const findingSet = new Set(uniqueFindingIds);
  for (const relation of args.relations) {
    if (!ISSUE_MERGE_RELATION_VALUES.has(relation.relation)) continue;
    if (
      findingSet.has(relation.from_finding_id) &&
      findingSet.has(relation.to_finding_id)
    ) {
      union(relation.from_finding_id, relation.to_finding_id);
    }
  }
  const groups = new Map<string, string[]>();
  for (const findingId of uniqueFindingIds) {
    const root = find(findingId);
    groups.set(root, [...(groups.get(root) ?? []), findingId]);
  }
  return [...groups.values()].sort((a, b) =>
    a[0] && b[0] ? a[0].localeCompare(b[0]) : a.length - b.length,
  );
}

function sameRootRelationRefsForGroup(
  findingIds: string[],
  relations: IssueLedgerCompletionRelation[],
): string[] {
  const findingSet = new Set(findingIds);
  return relations
    .filter(
      (relation) =>
        ISSUE_MERGE_RELATION_VALUES.has(relation.relation) &&
        findingSet.has(relation.from_finding_id) &&
        findingSet.has(relation.to_finding_id),
    )
    .map((relation) => relation.relation_id);
}

function groupKey(findingIds: readonly string[]): string {
  return [...findingIds].sort().join("\u0000");
}

function exactRawIssuesByGroup(
  candidate: Record<string, unknown> | null,
  knownFindingIds: ReadonlySet<string>,
): Map<string, Record<string, unknown>> {
  const rawByGroup = new Map<string, Record<string, unknown>>();
  if (!candidate || !Array.isArray(candidate.issues)) return rawByGroup;
  for (const item of candidate.issues) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const issue = item as Record<string, unknown>;
    const surfaceFindingIds = completionStringArray(issue.surface_finding_ids)
      .filter((findingId) => knownFindingIds.has(findingId));
    if (surfaceFindingIds.length === 0) continue;
    const key = groupKey(surfaceFindingIds);
    if (!rawByGroup.has(key)) rawByGroup.set(key, issue);
  }
  return rawByGroup;
}

function candidateFindingIds(
  candidate: Record<string, unknown> | null,
  knownFindingIds: ReadonlySet<string>,
): string[] {
  if (!candidate || !Array.isArray(candidate.issues)) return [];
  const ids: string[] = [];
  for (const item of candidate.issues) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    ids.push(
      ...completionStringArray(
        (item as Record<string, unknown>).surface_finding_ids,
      ).filter((findingId) => knownFindingIds.has(findingId)),
    );
  }
  return [...new Set(ids)];
}

function highestFindingSeverity(
  findings: IssueLedgerCompletionFinding[],
): ReviewFindingSeverity {
  return findings.reduce<ReviewFindingSeverity>(
    (highest, finding) => mostSevere(highest, finding.severity),
    "info",
  );
}

function joinedOrPrimary(values: string[], fallback: string): string {
  if (values.length === 0) return fallback;
  if (values.length === 1) return values[0]!;
  return values.join(" / ");
}

function completedIssueRow(args: {
  issueId: string;
  findingIds: string[];
  findingsById: ReadonlyMap<string, IssueLedgerCompletionFinding>;
  relations: IssueLedgerCompletionRelation[];
  rawIssue?: Record<string, unknown> | undefined;
  singletonReasons: ReadonlyMap<string, string>;
}): Record<string, unknown> {
  const findings = args.findingIds
    .map((findingId) => args.findingsById.get(findingId))
    .filter((finding): finding is IssueLedgerCompletionFinding => Boolean(finding));
  const primary = findings.reduce<IssueLedgerCompletionFinding | null>(
    (selected, finding) =>
      !selected || severityRank(finding.severity) < severityRank(selected.severity)
        ? finding
        : selected,
    null,
  );
  if (!primary) {
    throw new Error("Cannot complete issue-ledger issue without known findings.");
  }
  const relationRefs = sameRootRelationRefsForGroup(args.findingIds, args.relations);
  const relationRootHypotheses = uniqueNonEmpty(
    args.relations
      .filter((relation) => relationRefs.includes(relation.relation_id))
      .map((relation) => relation.root_hypothesis),
  );
  const rootCauseHypothesis =
    completionString(args.rawIssue?.root_cause_hypothesis) ??
    joinedOrPrimary(
      relationRootHypotheses,
      primary.root_cause_candidate ?? primary.claim,
    );
  const rawSeverity = completionSeverity(args.rawIssue?.severity);
  const derivedSeverity = highestFindingSeverity(findings);
  const severity = rawSeverity
    ? mostSevere(rawSeverity, derivedSeverity)
    : derivedSeverity;
  const proposedActions = uniqueNonEmpty(
    findings.map((finding) => finding.proposed_action),
  );
  const evidenceRefs = uniqueNonEmpty(
    findings.flatMap((finding) => finding.evidence_refs),
  );
  const raisedByLensIds = uniqueNonEmpty(findings.map((finding) => finding.lens_id));
  const singletonReason =
    args.findingIds.length === 1
      ? completionString(args.rawIssue?.singleton_reason) ??
        args.singletonReasons.get(args.findingIds[0]!) ??
        "Runtime completion: finding is not connected to another issue by same_root_candidate relation refs."
      : null;

  return {
    issue_id: args.issueId,
    root_cause_hypothesis: rootCauseHypothesis,
    root_confidence: completionConfidence(args.rawIssue?.root_confidence),
    surface_finding_ids: args.findingIds,
    relation_refs: relationRefs,
    raised_by_lens_ids: raisedByLensIds,
    issue_statement:
      completionString(args.rawIssue?.issue_statement) ??
      (args.findingIds.length === 1
        ? primary.claim
        : `Shared-root issue across ${args.findingIds.join(", ")}: ${rootCauseHypothesis}`),
    proposed_action:
      completionString(args.rawIssue?.proposed_action) ??
      joinedOrPrimary(
        proposedActions,
        "Investigate and address the recorded finding at its root cause.",
      ),
    affected_purpose:
      completionString(args.rawIssue?.affected_purpose) ??
      joinedOrPrimary(
        uniqueNonEmpty(findings.map((finding) => finding.affected_purpose)),
        primary.affected_purpose,
      ),
    failure_condition:
      completionString(args.rawIssue?.failure_condition) ??
      joinedOrPrimary(
        uniqueNonEmpty(findings.map((finding) => finding.failure_condition)),
        primary.failure_condition,
      ),
    impact:
      completionString(args.rawIssue?.impact) ??
      joinedOrPrimary(
        uniqueNonEmpty(findings.map((finding) => finding.impact)),
        primary.impact,
      ),
    evidence_refs: evidenceRefs,
    severity,
    domain_threshold_used:
      completionString(args.rawIssue?.domain_threshold_used) ??
      (joinedOrPrimary(
        uniqueNonEmpty(findings.map((finding) => finding.domain_threshold_used)),
        "",
      ) || null),
    singleton_reason: singletonReason,
  };
}

function runtimeIssueDependencies(args: {
  issueRows: Record<string, unknown>[];
  relations: IssueLedgerCompletionRelation[];
}): Record<string, unknown>[] {
  const issueIdsByFindingId = new Map<string, string>();
  for (const issue of args.issueRows) {
    const issueId = completionString(issue.issue_id);
    if (!issueId) continue;
    for (const findingId of completionStringArray(issue.surface_finding_ids)) {
      issueIdsByFindingId.set(findingId, issueId);
    }
  }
  const grouped = new Map<
    string,
    { issue_ids: string[]; relation_refs: string[]; cause_claims: string[] }
  >();
  for (const relation of args.relations) {
    if (relation.relation !== "shared_cause_candidate") continue;
    const fromIssueId = issueIdsByFindingId.get(relation.from_finding_id);
    const toIssueId = issueIdsByFindingId.get(relation.to_finding_id);
    if (!fromIssueId || !toIssueId || fromIssueId === toIssueId) continue;
    const issueIds = [fromIssueId, toIssueId].sort();
    const key = issueIds.join("\u0000");
    const group =
      grouped.get(key) ??
      { issue_ids: issueIds, relation_refs: [], cause_claims: [] };
    group.relation_refs.push(relation.relation_id);
    if (relation.shared_cause_claim) {
      group.cause_claims.push(relation.shared_cause_claim);
    }
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group, index) => ({
    dependency_id: `dep-${String(index + 1).padStart(3, "0")}`,
    dependency_kind: "shared_cause_candidate",
    issue_ids: group.issue_ids,
    relation_refs: group.relation_refs,
    rationale:
      group.cause_claims.length > 0
        ? `Runtime projection: these distinct issues share preserved relation graph cause context (${group.cause_claims.join(" / ")}).`
        : `Runtime projection: these distinct issues share preserved relation graph cause context (${group.relation_refs.join(", ")}).`,
  }));
}

export function completeIssueLedgerArtifactObject(args: {
  sessionId: string;
  candidate?: Record<string, unknown> | null;
  findingLedger: Record<string, unknown>;
  relationGraph: Record<string, unknown>;
}): Record<string, unknown> {
  const findingsById = completionFindingsFrom(args.findingLedger);
  const knownFindingIds = new Set(findingsById.keys());
  const relations = completionRelationsFrom(args.relationGraph);
  const requiredFindingIds = relationGraphCoveredFindingIdsFrom(args.relationGraph);
  const includedFindingIds = [
    ...new Set([
      ...requiredFindingIds,
      ...candidateFindingIds(args.candidate ?? null, knownFindingIds),
    ]),
  ].filter((findingId) => knownFindingIds.has(findingId));
  if (includedFindingIds.length === 0) {
    return {
      schema_version: 1,
      session_id: args.sessionId,
      issues: [],
      issue_dependencies: [],
      validation: {
        unclustered_finding_ids: [...knownFindingIds],
      },
    };
  }
  const rawByGroup = exactRawIssuesByGroup(args.candidate ?? null, knownFindingIds);
  const singletonReasons = relationGraphSingletonReasonsFrom(args.relationGraph);
  const components = connectedFindingComponents({
    findingIds: includedFindingIds,
    relations,
  });
  const issueRows = components.map((findingIds, index) => {
    const issueId = `issue-${String(index + 1).padStart(3, "0")}`;
    return completedIssueRow({
      issueId,
      findingIds,
      findingsById,
      relations,
      rawIssue: rawByGroup.get(groupKey(findingIds)),
      singletonReasons,
    });
  });
  const assignedFindingIds = new Set(
    issueRows.flatMap((issue) => completionStringArray(issue.surface_finding_ids)),
  );
  return {
    schema_version: 1,
    session_id: args.sessionId,
    issues: issueRows,
    issue_dependencies: runtimeIssueDependencies({ issueRows, relations }),
    validation: {
      unclustered_finding_ids: [...knownFindingIds].filter(
        (findingId) => !assignedFindingIds.has(findingId),
      ),
    },
  };
}

function ensureExactStringSet(args: {
  actual: ReadonlySet<string>;
  expected: ReadonlySet<string>;
  label: string;
}): void {
  for (const value of args.expected) {
    if (!args.actual.has(value)) {
      throw new Error(`${args.label} is missing required value: ${value}`);
    }
  }
  for (const value of args.actual) {
    if (!args.expected.has(value)) {
      throw new Error(`${args.label} contains unsupported value: ${value}`);
    }
  }
}

export interface FindingRelationInputProjection {
  schema_version: 1;
  session_id: string;
  source_artifact_ref: string;
  finding_nodes: Array<Record<string, unknown>>;
  causal_analysis_finding_ids: string[];
  surface_only_finding_ids: string[];
  output_policy: {
    accepted_relation_only: true;
    singleton_required_for_unrelated_findings: true;
    coverage_scope: "causal_analysis_finding_ids";
  };
}

export function buildFindingRelationInputProjection(args: {
  projectRoot: string;
  findingLedgerPath: string;
  findingLedger: Record<string, unknown>;
}): FindingRelationInputProjection {
  const sessionId = requireString(
    args.findingLedger.session_id,
    "finding-ledger.session_id",
  );
  const causalAnalysisFindingIds: string[] = [];
  const surfaceOnlyFindingIds: string[] = [];
  const findingNodes = requireArray(
    args.findingLedger.findings,
    "finding-ledger.findings",
  ).flatMap((item, index) => {
    const finding = requireRecord(item, `finding-ledger.findings[${index}]`);
    const findingId = requireString(
      finding.finding_id,
      `finding-ledger.findings[${index}].finding_id`,
    );
    const severity = requireAllowed(
      finding.severity,
      SEVERITY_VALUES,
      `finding-ledger.findings[${index}].severity`,
    ) as ReviewFindingSeverity;
    const materialityBasis = optionalMaterialityBasisRecord(
      finding.materiality_basis,
      `finding-ledger.findings[${index}].materiality_basis`,
    );
    const causalPath = optionalCausalPathRecord(
      finding.causal_path,
      `finding-ledger.findings[${index}].causal_path`,
    );
    if (isMaterialSeverity(severity) && (!materialityBasis || !causalPath)) {
      throw new Error(
        `finding-ledger.findings[${index}] must include materiality_basis and causal_path for severity=${severity}.`,
      );
    }
    if (!isMaterialSeverity(severity)) {
      if (materialityBasis !== null || causalPath !== null) {
        throw new Error(
          `finding-ledger.findings[${index}].materiality_basis and causal_path must be null for severity=${severity}.`,
        );
      }
      surfaceOnlyFindingIds.push(findingId);
      return [];
    }
    const node: Record<string, unknown> = {
      finding_id: findingId,
      lens_id: requireString(
        finding.lens_id,
        `finding-ledger.findings[${index}].lens_id`,
      ),
      source_ref: requireString(
        finding.source_ref,
        `finding-ledger.findings[${index}].source_ref`,
      ),
      claim: requireString(
        finding.claim,
        `finding-ledger.findings[${index}].claim`,
      ),
      lens_rationale_summary: requireString(
        finding.lens_rationale_summary,
        `finding-ledger.findings[${index}].lens_rationale_summary`,
      ),
      affected_purpose: requireString(
        finding.affected_purpose,
        `finding-ledger.findings[${index}].affected_purpose`,
      ),
      failure_condition: requireString(
        finding.failure_condition,
        `finding-ledger.findings[${index}].failure_condition`,
      ),
      impact: requireString(
        finding.impact,
        `finding-ledger.findings[${index}].impact`,
      ),
      evidence_refs: requireStringArray(
        finding.evidence_refs,
        `finding-ledger.findings[${index}].evidence_refs`,
      ),
      severity,
      domain_threshold_used: optionalStringOrNull(
        finding.domain_threshold_used,
        `finding-ledger.findings[${index}].domain_threshold_used`,
      ),
    };
    for (const field of ["target", "evidence_anchor", "proposed_action"] as const) {
      const value = optionalString(
        finding[field],
        `finding-ledger.findings[${index}].${field}`,
      );
      if (value !== undefined) node[field] = value;
    }
    node.materiality_basis = materialityBasis;
    node.causal_path = causalPath;
    causalAnalysisFindingIds.push(findingId);
    return [node];
  });

  return {
    schema_version: 1,
    session_id: sessionId,
    source_artifact_ref: toRelativePath(args.findingLedgerPath, args.projectRoot),
    finding_nodes: findingNodes,
    causal_analysis_finding_ids: causalAnalysisFindingIds,
    surface_only_finding_ids: surfaceOnlyFindingIds,
    output_policy: {
      accepted_relation_only: true,
      singleton_required_for_unrelated_findings: true,
      coverage_scope: "causal_analysis_finding_ids",
    },
  };
}

export function renderFindingRelationInputProjectionSection(
  projection: FindingRelationInputProjection,
): string {
  return [
    "## Runtime Finding Relation Input Projection",
    "This projection is derived from `finding-ledger.yaml` and is the compact node list for this unit.",
    "Use this projection first. Read source refs only when a relation rationale needs additional local context that the projection cannot carry.",
    "Emit only semantically accepted relations. Runtime assigns relation ids and fills singleton coverage for `causal_analysis_finding_ids` entries not covered by accepted relations.",
    "`surface_only_finding_ids` are already recorded in the ledger and must not receive relation coverage.",
    "",
    "```yaml",
    dumpYamlDocument(projection),
    "```",
  ].join("\n");
}

export interface IssueStanceInputProjection {
  schema_version: 1;
  session_id: string;
  source_artifact_refs: {
    finding_ledger: string;
    finding_relation_graph: string;
    issue_ledger: string;
  };
  participating_lens_ids: string[];
  issues: Array<Record<string, unknown>>;
  finding_summaries: Array<Record<string, unknown>>;
  relation_summaries: Array<Record<string, unknown>>;
  singleton_findings: Array<Record<string, unknown>>;
  issue_dependencies: Array<Record<string, unknown>>;
  output_policy: {
    every_participating_lens_must_emit_stance: true;
    use_projection_first: true;
    read_round1_only_for_stance_rationale_gap: true;
  };
}

function sharedCauseProjection(
  value: unknown,
  label: string,
): Record<string, string> | null {
  if (value === undefined || value === null) return null;
  const sharedCause = requireRecord(value, label);
  return {
    cause_claim: requireString(sharedCause.cause_claim, `${label}.cause_claim`),
    from_cause_ref: requireString(
      sharedCause.from_cause_ref,
      `${label}.from_cause_ref`,
    ),
    to_cause_ref: requireString(
      sharedCause.to_cause_ref,
      `${label}.to_cause_ref`,
    ),
  };
}

export function buildIssueStanceInputProjection(args: {
  projectRoot: string;
  findingLedgerPath: string;
  findingRelationGraphPath: string;
  issueLedgerPath: string;
  findingLedger: Record<string, unknown>;
  relationGraph: Record<string, unknown>;
  issueLedger: Record<string, unknown>;
  lensOutputPaths: string[];
}): IssueStanceInputProjection {
  const sessionId = requireString(
    args.issueLedger.session_id,
    "issue-ledger.session_id",
  );
  const assignedIssueIdsByFindingId = new Map<string, string[]>();
  const issues = requireArray(args.issueLedger.issues, "issue-ledger.issues").map(
    (item, index) => {
      const issue = requireRecord(item, `issue-ledger.issues[${index}]`);
      const issueId = requireString(
        issue.issue_id,
        `issue-ledger.issues[${index}].issue_id`,
      );
      for (const findingId of requireStringArray(
        issue.surface_finding_ids,
        `issue-ledger.issues[${index}].surface_finding_ids`,
      )) {
        const issueIds = assignedIssueIdsByFindingId.get(findingId) ?? [];
        issueIds.push(issueId);
        assignedIssueIdsByFindingId.set(findingId, issueIds);
      }
      return {
        issue_id: issueId,
        root_cause_hypothesis: requireString(
          issue.root_cause_hypothesis,
          `issue-ledger.issues[${index}].root_cause_hypothesis`,
        ),
        root_confidence: requireAllowed(
          issue.root_confidence,
          CONFIDENCE_VALUES,
          `issue-ledger.issues[${index}].root_confidence`,
        ),
        surface_finding_ids: requireStringArray(
          issue.surface_finding_ids,
          `issue-ledger.issues[${index}].surface_finding_ids`,
        ),
        relation_refs: requireStringArray(
          issue.relation_refs,
          `issue-ledger.issues[${index}].relation_refs`,
        ),
        raised_by_lens_ids: requireStringArray(
          issue.raised_by_lens_ids,
          `issue-ledger.issues[${index}].raised_by_lens_ids`,
        ),
        issue_statement: requireString(
          issue.issue_statement,
          `issue-ledger.issues[${index}].issue_statement`,
        ),
        proposed_action: requireString(
          issue.proposed_action,
          `issue-ledger.issues[${index}].proposed_action`,
        ),
        affected_purpose: requireString(
          issue.affected_purpose,
          `issue-ledger.issues[${index}].affected_purpose`,
        ),
        failure_condition: requireString(
          issue.failure_condition,
          `issue-ledger.issues[${index}].failure_condition`,
        ),
        impact: requireString(
          issue.impact,
          `issue-ledger.issues[${index}].impact`,
        ),
        severity: requireAllowed(
          issue.severity,
          SEVERITY_VALUES,
          `issue-ledger.issues[${index}].severity`,
        ),
        evidence_refs: requireStringArray(
          issue.evidence_refs,
          `issue-ledger.issues[${index}].evidence_refs`,
        ),
        domain_threshold_used: optionalStringOrNull(
          issue.domain_threshold_used,
          `issue-ledger.issues[${index}].domain_threshold_used`,
        ),
        singleton_reason: optionalStringOrNull(
          issue.singleton_reason,
          `issue-ledger.issues[${index}].singleton_reason`,
        ),
      };
    },
  );
  const findingSummaries = requireArray(
    args.findingLedger.findings,
    "finding-ledger.findings",
  ).map((item, index) => {
    const finding = requireRecord(item, `finding-ledger.findings[${index}]`);
    const findingId = requireString(
      finding.finding_id,
      `finding-ledger.findings[${index}].finding_id`,
    );
    return {
      finding_id: findingId,
      lens_id: requireString(
        finding.lens_id,
        `finding-ledger.findings[${index}].lens_id`,
      ),
      assigned_issue_ids: assignedIssueIdsByFindingId.get(findingId) ?? [],
      claim: requireString(finding.claim, `finding-ledger.findings[${index}].claim`),
      lens_rationale_summary: requireString(
        finding.lens_rationale_summary,
        `finding-ledger.findings[${index}].lens_rationale_summary`,
      ),
      severity: requireAllowed(
        finding.severity,
        SEVERITY_VALUES,
        `finding-ledger.findings[${index}].severity`,
      ),
      affected_purpose: requireString(
        finding.affected_purpose,
        `finding-ledger.findings[${index}].affected_purpose`,
      ),
      failure_condition: requireString(
        finding.failure_condition,
        `finding-ledger.findings[${index}].failure_condition`,
      ),
      impact: requireString(
        finding.impact,
        `finding-ledger.findings[${index}].impact`,
      ),
      evidence_refs: requireStringArray(
        finding.evidence_refs,
        `finding-ledger.findings[${index}].evidence_refs`,
      ),
    };
  });
  const relationSummaries = requireArray(
    args.relationGraph.relations,
    "finding-relation-graph.relations",
  ).map((item, index) => {
    const relation = requireRecord(
      item,
      `finding-relation-graph.relations[${index}]`,
    );
    return {
      relation_id: requireString(
        relation.relation_id,
        `finding-relation-graph.relations[${index}].relation_id`,
      ),
      from_finding_id: requireString(
        relation.from_finding_id,
        `finding-relation-graph.relations[${index}].from_finding_id`,
      ),
      to_finding_id: requireString(
        relation.to_finding_id,
        `finding-relation-graph.relations[${index}].to_finding_id`,
      ),
      relation: requireAllowed(
        relation.relation,
        RELATION_VALUES,
        `finding-relation-graph.relations[${index}].relation`,
      ),
      root_hypothesis: optionalString(
        relation.root_hypothesis,
        `finding-relation-graph.relations[${index}].root_hypothesis`,
      ),
      shared_cause: sharedCauseProjection(
        relation.shared_cause,
        `finding-relation-graph.relations[${index}].shared_cause`,
      ),
      rationale: requireString(
        relation.rationale,
        `finding-relation-graph.relations[${index}].rationale`,
      ),
      confidence:
        relation.confidence === undefined
          ? undefined
          : requireAllowed(
              relation.confidence,
              CONFIDENCE_VALUES,
              `finding-relation-graph.relations[${index}].confidence`,
      ),
    };
  });
  const issueDependencies = requireArray(
    args.issueLedger.issue_dependencies,
    "issue-ledger.issue_dependencies",
  ).map((item, index) => {
    const dependency = requireRecord(
      item,
      `issue-ledger.issue_dependencies[${index}]`,
    );
    return {
      dependency_id: requireString(
        dependency.dependency_id,
        `issue-ledger.issue_dependencies[${index}].dependency_id`,
      ),
      dependency_kind: requireAllowed(
        dependency.dependency_kind,
        ISSUE_DEPENDENCY_KIND_VALUES,
        `issue-ledger.issue_dependencies[${index}].dependency_kind`,
      ),
      issue_ids: requireStringArray(
        dependency.issue_ids,
        `issue-ledger.issue_dependencies[${index}].issue_ids`,
      ),
      relation_refs: requireStringArray(
        dependency.relation_refs,
        `issue-ledger.issue_dependencies[${index}].relation_refs`,
      ),
      rationale: requireString(
        dependency.rationale,
        `issue-ledger.issue_dependencies[${index}].rationale`,
      ),
    };
  });
  const singletonFindings = requireArray(
    args.relationGraph.singleton_findings,
    "finding-relation-graph.singleton_findings",
  ).map((item, index) => {
    const singleton = requireRecord(
      item,
      `finding-relation-graph.singleton_findings[${index}]`,
    );
    return {
      finding_id: requireString(
        singleton.finding_id,
        `finding-relation-graph.singleton_findings[${index}].finding_id`,
      ),
      reason: requireString(
        singleton.reason,
        `finding-relation-graph.singleton_findings[${index}].reason`,
      ),
    };
  });

  return {
    schema_version: 1,
    session_id: sessionId,
    source_artifact_refs: {
      finding_ledger: toRelativePath(args.findingLedgerPath, args.projectRoot),
      finding_relation_graph: toRelativePath(
        args.findingRelationGraphPath,
        args.projectRoot,
      ),
      issue_ledger: toRelativePath(args.issueLedgerPath, args.projectRoot),
    },
    participating_lens_ids: [
      ...new Set(args.lensOutputPaths.map(lensIdFromRound1ArtifactPath)),
    ],
    issues,
    finding_summaries: findingSummaries,
    relation_summaries: relationSummaries,
    singleton_findings: singletonFindings,
    issue_dependencies: issueDependencies,
    output_policy: {
      every_participating_lens_must_emit_stance: true,
      use_projection_first: true,
      read_round1_only_for_stance_rationale_gap: true,
    },
  };
}

export function renderIssueStanceInputProjectionSection(
  projection: IssueStanceInputProjection,
): string {
  return [
    "## Runtime Issue Stance Input Projection",
    "This projection is derived from `finding-ledger.yaml`, `finding-relation-graph.yaml`, and `issue-ledger.yaml`.",
    "Use this projection first to write lens stances for each issue.",
    "Read Round 1 source refs only when a stance rationale needs lens-specific context that this projection cannot carry.",
    "",
    "```yaml",
    dumpYamlDocument(projection),
    "```",
  ].join("\n");
}

function issueStanceLensOutputPaths(args: {
  lensId: string;
  lensOutputPaths: string[];
}): string[] {
  const selected = args.lensOutputPaths.filter(
    (outputPath) => lensIdFromRound1ArtifactPath(outputPath) === args.lensId,
  );
  if (selected.length === 0) {
    throw new Error(
      `issue-stance:${args.lensId} has no matching Round 1 lens output ref.`,
    );
  }
  return selected;
}

export interface DeliberationPlanInputProjection {
  schema_version: 1;
  session_id: string;
  source_artifact_refs: {
    finding_relation_graph: string;
    issue_ledger: string;
    issue_stance_matrix: string;
  };
  issues: Array<Record<string, unknown>>;
  output_policy: {
    runtime_candidate_is_not_final: true;
    planned_issues_require_material_conflict: true;
    every_issue_must_be_planned_or_skipped_once: true;
    source_stance_refs_must_match_participants: true;
  };
}

export interface ProblemFramingInputProjection {
  schema_version: 1;
  session_id: string;
  source_artifact_refs: {
    issue_ledger: string;
    issue_stance_matrix: string;
    deliberation_plan: string;
    deliberation_resolution: string | null;
    review_target_profile: string;
    domain_profile: string | null;
  };
  classification_context: {
    common_spine_version: 1;
    session_domain: string;
    domain_profile_ref: string;
    domain_profile_doc_type: "custom:problem_framing_profile";
    domain_profile_status: "applied" | "absent" | "not_requested";
  };
  target_profile_summary: Record<string, unknown>;
  domain_axis_catalog: {
    profile_ref: string | null;
    axes: Array<Record<string, unknown>>;
    rules: string[];
  };
  issue_surface_finding_ids: Record<string, string[]>;
  issues: Array<Record<string, unknown>>;
  output_policy: {
    classify_every_issue_once: true;
    runtime_fills_classification_context: true;
    runtime_fills_related_surface_finding_ids: true;
    do_not_reopen_raw_lens_outputs_by_default: true;
  };
}

type ProblemFramingClassificationContext =
  ProblemFramingInputProjection["classification_context"];

function stanceAnchorRef(issueId: string, lensId: string): string {
  return `issue-stance-matrix.yaml#stances.${issueId}.${lensId}`;
}

function conflictSignalsForStance(stance: {
  lens_id: string;
  stance: string;
  root_hypothesis_position: string;
  severity_position: string;
}): string[] {
  const signals: string[] = [];
  if (DELIBERATION_CONFLICT_STANCE_VALUES.has(stance.stance)) {
    signals.push(`stance:${stance.lens_id}:${stance.stance}`);
  }
  if (
    DELIBERATION_CONFLICT_ROOT_POSITION_VALUES.has(
      stance.root_hypothesis_position,
    )
  ) {
    signals.push(
      `root_hypothesis:${stance.lens_id}:${stance.root_hypothesis_position}`,
    );
  }
  if (
    DELIBERATION_CONFLICT_SEVERITY_POSITION_VALUES.has(
      stance.severity_position,
    )
  ) {
    signals.push(`severity:${stance.lens_id}:${stance.severity_position}`);
  }
  return signals;
}

function conflictTypeHintsFromSignals(signals: readonly string[]): string[] {
  const hints = new Set<string>();
  for (const signal of signals) {
    if (signal.startsWith("root_hypothesis:")) hints.add("root_hypothesis");
    if (signal.startsWith("severity:")) hints.add("action_or_severity");
    if (signal.includes(":insufficient_evidence")) hints.add("evidence_gap");
    if (signal.startsWith("stance:")) hints.add("stance_conflict");
    if (signal.includes(":surface_only")) {
      hints.add("partial_overlap_or_cluster_scope");
    }
  }
  return [...hints];
}

export function buildDeliberationPlanInputProjection(args: {
  projectRoot: string;
  findingRelationGraphPath: string;
  issueLedgerPath: string;
  issueStanceMatrixPath: string;
  relationGraph: Record<string, unknown>;
  issueLedger: Record<string, unknown>;
  issueStanceMatrix: Record<string, unknown>;
}): DeliberationPlanInputProjection {
  const sessionId = requireString(
    args.issueLedger.session_id,
    "issue-ledger.session_id",
  );
  const dependenciesByIssueId = new Map<string, Record<string, unknown>[]>();
  for (const [index, item] of requireArray(
    args.issueLedger.issue_dependencies,
    "issue-ledger.issue_dependencies",
  ).entries()) {
    const dependency = requireRecord(
      item,
      `issue-ledger.issue_dependencies[${index}]`,
    );
    const dependencyRecord = {
      dependency_id: requireString(
        dependency.dependency_id,
        `issue-ledger.issue_dependencies[${index}].dependency_id`,
      ),
      dependency_kind: requireAllowed(
        dependency.dependency_kind,
        ISSUE_DEPENDENCY_KIND_VALUES,
        `issue-ledger.issue_dependencies[${index}].dependency_kind`,
      ),
      issue_ids: requireStringArray(
        dependency.issue_ids,
        `issue-ledger.issue_dependencies[${index}].issue_ids`,
      ),
      relation_refs: requireStringArray(
        dependency.relation_refs,
        `issue-ledger.issue_dependencies[${index}].relation_refs`,
      ),
      rationale: requireString(
        dependency.rationale,
        `issue-ledger.issue_dependencies[${index}].rationale`,
      ),
    };
    for (const issueId of dependencyRecord.issue_ids) {
      dependenciesByIssueId.set(issueId, [
        ...(dependenciesByIssueId.get(issueId) ?? []),
        dependencyRecord,
      ]);
    }
  }

  const stancesByIssueId = new Map<string, Array<Record<string, unknown>>>();
  for (const [index, item] of requireArray(
    args.issueStanceMatrix.issues,
    "issue-stance-matrix.issues",
  ).entries()) {
    const issue = requireRecord(item, `issue-stance-matrix.issues[${index}]`);
    const issueId = requireString(
      issue.issue_id,
      `issue-stance-matrix.issues[${index}].issue_id`,
    );
    const stances = requireArray(
      issue.stances,
      `issue-stance-matrix.issues[${index}].stances`,
    ).map((stanceItem, stanceIndex) => {
      const stance = requireRecord(
        stanceItem,
        `issue-stance-matrix.issues[${index}].stances[${stanceIndex}]`,
      );
      const lensId = requireString(
        stance.lens_id,
        `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].lens_id`,
      );
      const stanceValue = requireAllowed(
        stance.stance,
        STANCE_VALUES,
        `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].stance`,
      );
      const rootHypothesisPosition = requireAllowed(
        stance.root_hypothesis_position,
        ROOT_HYPOTHESIS_POSITION_VALUES,
        `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].root_hypothesis_position`,
      );
      const severityPosition = requireAllowed(
        stance.severity_position,
        SEVERITY_POSITION_VALUES,
        `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].severity_position`,
      );
      return {
        lens_id: lensId,
        stance: stanceValue,
        root_hypothesis_position: rootHypothesisPosition,
        severity_position: severityPosition,
        rationale: requireString(
          stance.rationale,
          `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].rationale`,
        ),
        evidence_refs: requireStringArray(
          stance.evidence_refs,
          `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].evidence_refs`,
        ),
        source_stance_ref: stanceAnchorRef(issueId, lensId),
      };
    });
    stancesByIssueId.set(issueId, stances);
  }

  const relationKindsById = new Map<string, string>();
  for (const [index, item] of requireArray(
    args.relationGraph.relations,
    "finding-relation-graph.relations",
  ).entries()) {
    const relation = requireRecord(
      item,
      `finding-relation-graph.relations[${index}]`,
    );
    relationKindsById.set(
      requireString(
        relation.relation_id,
        `finding-relation-graph.relations[${index}].relation_id`,
      ),
      requireAllowed(
        relation.relation,
        RELATION_VALUES,
        `finding-relation-graph.relations[${index}].relation`,
      ),
    );
  }

  const issues = requireArray(args.issueLedger.issues, "issue-ledger.issues").map(
    (item, index) => {
      const issue = requireRecord(item, `issue-ledger.issues[${index}]`);
      const issueId = requireString(
        issue.issue_id,
        `issue-ledger.issues[${index}].issue_id`,
      );
      const severity = requireAllowed(
        issue.severity,
        SEVERITY_VALUES,
        `issue-ledger.issues[${index}].severity`,
      ) as ReviewFindingSeverity;
      const stances = stancesByIssueId.get(issueId) ?? [];
      const stanceSignals: string[] = [];
      const signalLensIds = new Set<string>();
      const applicableStanceLensIds = new Set<string>();
      const applicableStanceValues = new Set<string>();
      for (const stance of stances) {
        const lensId = requireString(stance.lens_id, "stance.lens_id");
        const stanceValue = requireString(stance.stance, "stance.stance");
        if (stanceValue !== "not_applicable") {
          applicableStanceLensIds.add(lensId);
          applicableStanceValues.add(stanceValue);
        }
        const signals = conflictSignalsForStance({
          lens_id: lensId,
          stance: stanceValue,
          root_hypothesis_position: requireString(
            stance.root_hypothesis_position,
            "stance.root_hypothesis_position",
          ),
          severity_position: requireString(
            stance.severity_position,
            "stance.severity_position",
          ),
        });
        if (signals.length > 0) signalLensIds.add(lensId);
        stanceSignals.push(...signals);
      }
      if (applicableStanceValues.size > 1) {
        stanceSignals.push("stance:mixed_applicable_values");
        for (const lensId of applicableStanceLensIds) signalLensIds.add(lensId);
      }
      const raisedByLensIds = requireStringArray(
        issue.raised_by_lens_ids,
        `issue-ledger.issues[${index}].raised_by_lens_ids`,
      );
      const materialIssue = isMaterialSeverity(severity);
      const runtimeCandidate = materialIssue && stanceSignals.length > 0;
      const suggestedParticipantLensIds = runtimeCandidate
        ? [...new Set([...raisedByLensIds, ...signalLensIds])]
        : [];
      const relationRefs = requireStringArray(
        issue.relation_refs,
        `issue-ledger.issues[${index}].relation_refs`,
      );
      return {
        issue_id: issueId,
        severity,
        material_issue: materialIssue,
        issue_statement: requireString(
          issue.issue_statement,
          `issue-ledger.issues[${index}].issue_statement`,
        ),
        root_cause_hypothesis: requireString(
          issue.root_cause_hypothesis,
          `issue-ledger.issues[${index}].root_cause_hypothesis`,
        ),
        root_confidence: requireAllowed(
          issue.root_confidence,
          CONFIDENCE_VALUES,
          `issue-ledger.issues[${index}].root_confidence`,
        ),
        proposed_action: requireString(
          issue.proposed_action,
          `issue-ledger.issues[${index}].proposed_action`,
        ),
        affected_purpose: requireString(
          issue.affected_purpose,
          `issue-ledger.issues[${index}].affected_purpose`,
        ),
        failure_condition: requireString(
          issue.failure_condition,
          `issue-ledger.issues[${index}].failure_condition`,
        ),
        impact: requireString(issue.impact, `issue-ledger.issues[${index}].impact`),
        surface_finding_ids: requireStringArray(
          issue.surface_finding_ids,
          `issue-ledger.issues[${index}].surface_finding_ids`,
        ),
        raised_by_lens_ids: raisedByLensIds,
        relation_refs: relationRefs,
        relation_kinds: Object.fromEntries(
          relationRefs.map((relationId) => [
            relationId,
            relationKindsById.get(relationId) ?? "unknown",
          ]),
        ),
        issue_dependencies: dependenciesByIssueId.get(issueId) ?? [],
        stances,
        runtime_conflict_signals: stanceSignals,
        runtime_conflict_type_hints: conflictTypeHintsFromSignals(stanceSignals),
        runtime_deliberation_candidate: runtimeCandidate,
        suggested_participant_lens_ids: suggestedParticipantLensIds,
        suggested_source_stance_refs: suggestedParticipantLensIds.map((lensId) =>
          stanceAnchorRef(issueId, lensId),
        ),
        skip_candidate_reason_code: materialIssue
          ? stanceSignals.length === 0
            ? "consistent_stances"
            : null
          : "non_material_issue",
      };
    },
  );

  return {
    schema_version: 1,
    session_id: sessionId,
    source_artifact_refs: {
      finding_relation_graph: toRelativePath(
        args.findingRelationGraphPath,
        args.projectRoot,
      ),
      issue_ledger: toRelativePath(args.issueLedgerPath, args.projectRoot),
      issue_stance_matrix: toRelativePath(
        args.issueStanceMatrixPath,
        args.projectRoot,
      ),
    },
    issues,
    output_policy: {
      runtime_candidate_is_not_final: true,
      planned_issues_require_material_conflict: true,
      every_issue_must_be_planned_or_skipped_once: true,
      source_stance_refs_must_match_participants: true,
    },
  };
}

export function renderDeliberationPlanInputProjectionSection(
  projection: DeliberationPlanInputProjection,
): string {
  return [
    "## Runtime Deliberation Plan Input Projection",
    "This projection is derived from `issue-ledger.yaml`, `issue-stance-matrix.yaml`, and `finding-relation-graph.yaml`.",
    "Use this projection first. Runtime conflict signals are candidates, not final semantic decisions.",
    "Plan only material conflicts. Put every other issue in `skipped_issues` with a `reason_code`.",
    "",
    "```yaml",
    dumpYamlDocument(projection),
    "```",
  ].join("\n");
}

function targetProfileSummary(profile: Record<string, unknown>): Record<string, unknown> {
  const materialProfile =
    profile.material_profile && typeof profile.material_profile === "object"
      ? (profile.material_profile as Record<string, unknown>)
      : {};
  return {
    target_scope_kind: optionalString(profile.target_scope_kind, "review-target-profile.target_scope_kind"),
    materialized_input_kind: optionalString(
      profile.materialized_input_kind,
      "review-target-profile.materialized_input_kind",
    ),
    target_input_kind: optionalString(profile.target_input_kind, "review-target-profile.target_input_kind"),
    target_material_kind: optionalString(profile.target_material_kind, "review-target-profile.target_material_kind"),
    requested_target: optionalStringOrNull(profile.requested_target, "review-target-profile.requested_target"),
    review_intent_summary: optionalStringOrNull(profile.review_intent_summary, "review-target-profile.review_intent_summary"),
    artifact_roles: profile.artifact_roles ?? null,
    domain: requireString(profile.domain, "review-target-profile.domain"),
    closure_level: optionalString(profile.closure_level, "review-target-profile.closure_level"),
    review_goal: Array.isArray(profile.review_goal) ? profile.review_goal : [],
    closure_obligation_policy: Array.isArray(profile.closure_obligation_policy)
      ? profile.closure_obligation_policy
      : [],
    material_profile: {
      target_material_kind: materialProfile.target_material_kind ?? null,
      target_material_kind_candidates:
        materialProfile.target_material_kind_candidates ?? [],
      support_status: materialProfile.support_status ?? null,
      unsupported_reason: materialProfile.unsupported_reason ?? null,
    },
  };
}

function parseDomainAxisCatalog(args: {
  profileRef: string | null;
  profileText: string | null;
}): ProblemFramingInputProjection["domain_axis_catalog"] {
  if (!args.profileText) {
    return {
      profile_ref: args.profileRef,
      axes: [],
      rules: [],
    };
  }
  const axes: Array<Record<string, unknown>> = [];
  const rules: string[] = [];
  const lines = args.profileText.split(/\r?\n/);
  let current:
    | {
        axis_name: string;
        requirement: string | null;
        values: Array<Record<string, string>>;
      }
    | null = null;
  let inRules = false;
  const flush = () => {
    if (!current) return;
    if (current.values.length === 0) {
      throw new Error(`problem framing profile axis has no values: ${current.axis_name}`);
    }
    axes.push({
      axis_name: current.axis_name,
      requirement: current.requirement,
      values: current.values,
    });
  };
  for (const line of lines) {
    const topHeading = line.match(/^##\s+(.+?)\s*$/);
    if (topHeading) {
      flush();
      current = null;
      inRules = topHeading[1]?.trim() === "Rules";
      continue;
    }
    const heading = line.match(/^###\s+([A-Za-z0-9_]+)\s*$/);
    if (heading) {
      flush();
      inRules = false;
      current = {
        axis_name: heading[1] ?? "",
        requirement: null,
        values: [],
      };
      continue;
    }
    if (inRules) {
      const rule = line.match(/^\s*(?:\d+\.\s+|[-*]\s+)(.+?)\s*$/);
      if (rule) {
        rules.push(rule[1] ?? "");
      }
      continue;
    }
    if (!current) continue;
    const requirement = line.match(/^(Required|Optional)[^.]*\./);
    if (requirement && current.requirement === null) {
      current.requirement = line.trim();
      continue;
    }
    const valueRow = line.match(/^\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|$/);
    if (valueRow) {
      current.values.push({
        value: valueRow[1] ?? "",
        meaning: (valueRow[2] ?? "").trim(),
      });
    }
  }
  flush();
  if (args.profileRef && axes.length === 0) {
    throw new Error(`problem framing profile has no parsable domain axes: ${args.profileRef}`);
  }
  return {
    profile_ref: args.profileRef,
    axes,
    rules,
  };
}

function rowsByIssueId(
  artifact: Record<string, unknown>,
  rowsField: "issues" | "planned_issues" | "skipped_issues",
): Map<string, Record<string, unknown>> {
  const rows = new Map<string, Record<string, unknown>>();
  for (const [index, item] of requireArray(artifact[rowsField], `${rowsField}`).entries()) {
    const record = requireRecord(item, `${rowsField}[${index}]`);
    rows.set(requireString(record.issue_id, `${rowsField}[${index}].issue_id`), record);
  }
  return rows;
}

function problemFramingClassificationContext(args: {
  reviewTargetProfile: Record<string, unknown>;
  problemFramingProfileRef?: string | null;
}): ProblemFramingClassificationContext {
  const targetSummary = targetProfileSummary(args.reviewTargetProfile);
  const sessionDomain = requireString(
    targetSummary.domain,
    "review-target-profile.domain",
  );
  const profileRef = args.problemFramingProfileRef ?? null;
  return {
    common_spine_version: 1,
    session_domain: sessionDomain,
    domain_profile_ref: profileRef ?? "",
    domain_profile_doc_type: "custom:problem_framing_profile",
    domain_profile_status: profileRef
      ? "applied"
      : sessionDomain === "none"
        ? "not_requested"
        : "absent",
  };
}

function domainAxisValuesFromCatalog(
  catalog: ProblemFramingInputProjection["domain_axis_catalog"],
): Map<string, Set<string>> {
  const valuesByAxis = new Map<string, Set<string>>();
  for (const [axisIndex, item] of catalog.axes.entries()) {
    const axis = requireRecord(item, `problem-framing.domain_axis_catalog.axes[${axisIndex}]`);
    const axisName = requireString(
      axis.axis_name,
      `problem-framing.domain_axis_catalog.axes[${axisIndex}].axis_name`,
    );
    const values = new Set<string>();
    for (const [valueIndex, valueItem] of requireArray(
      axis.values,
      `problem-framing.domain_axis_catalog.axes[${axisIndex}].values`,
    ).entries()) {
      const valueRecord = requireRecord(
        valueItem,
        `problem-framing.domain_axis_catalog.axes[${axisIndex}].values[${valueIndex}]`,
      );
      values.add(
        requireString(
          valueRecord.value,
          `problem-framing.domain_axis_catalog.axes[${axisIndex}].values[${valueIndex}].value`,
        ),
      );
    }
    valuesByAxis.set(axisName, values);
  }
  return valuesByAxis;
}

export function buildProblemFramingInputProjection(args: {
  projectRoot: string;
  issueLedgerPath: string;
  issueStanceMatrixPath: string;
  deliberationPlanPath: string;
  deliberationResolutionPath?: string | null;
  reviewTargetProfilePath: string;
  problemFramingProfileRef?: string | null;
  issueLedger: Record<string, unknown>;
  issueStanceMatrix: Record<string, unknown>;
  deliberationPlan: Record<string, unknown>;
  deliberationResolution?: Record<string, unknown> | null;
  reviewTargetProfile: Record<string, unknown>;
  domainProfileText?: string | null;
}): ProblemFramingInputProjection {
  const sessionId = requireString(
    args.issueLedger.session_id,
    "issue-ledger.session_id",
  );
  const targetSummary = targetProfileSummary(args.reviewTargetProfile);
  const profileRef = args.problemFramingProfileRef ?? null;
  const classificationContext = problemFramingClassificationContext({
    reviewTargetProfile: args.reviewTargetProfile,
    problemFramingProfileRef: profileRef,
  });
  const stancesByIssueId = rowsByIssueId(args.issueStanceMatrix, "issues");
  const plannedByIssueId = rowsByIssueId(args.deliberationPlan, "planned_issues");
  const skippedByIssueId = rowsByIssueId(args.deliberationPlan, "skipped_issues");
  const resolutionByIssueId = args.deliberationResolution
    ? rowsByIssueId(args.deliberationResolution, "issues")
    : new Map<string, Record<string, unknown>>();
  const dependenciesByIssueId = new Map<string, Record<string, unknown>[]>();
  for (const [index, item] of requireArray(
    args.issueLedger.issue_dependencies,
    "issue-ledger.issue_dependencies",
  ).entries()) {
    const dependency = requireRecord(item, `issue-ledger.issue_dependencies[${index}]`);
    const issueIds = requireStringArray(
      dependency.issue_ids,
      `issue-ledger.issue_dependencies[${index}].issue_ids`,
    );
    const dependencySummary = {
      dependency_id: requireString(
        dependency.dependency_id,
        `issue-ledger.issue_dependencies[${index}].dependency_id`,
      ),
      dependency_kind: requireString(
        dependency.dependency_kind,
        `issue-ledger.issue_dependencies[${index}].dependency_kind`,
      ),
      issue_ids: issueIds,
      relation_refs: requireStringArray(
        dependency.relation_refs,
        `issue-ledger.issue_dependencies[${index}].relation_refs`,
      ),
      rationale: requireString(
        dependency.rationale,
        `issue-ledger.issue_dependencies[${index}].rationale`,
      ),
    };
    for (const issueId of issueIds) {
      dependenciesByIssueId.set(issueId, [
        ...(dependenciesByIssueId.get(issueId) ?? []),
        dependencySummary,
      ]);
    }
  }
  const issueSurfaceFindingIds: Record<string, string[]> = {};
  const issues = requireArray(args.issueLedger.issues, "issue-ledger.issues").map(
    (item, index) => {
      const issue = requireRecord(item, `issue-ledger.issues[${index}]`);
      const issueId = requireString(
        issue.issue_id,
        `issue-ledger.issues[${index}].issue_id`,
      );
      const surfaceFindingIds = requireStringArray(
        issue.surface_finding_ids,
        `issue-ledger.issues[${index}].surface_finding_ids`,
      );
      issueSurfaceFindingIds[issueId] = surfaceFindingIds;
      const stanceIssue = stancesByIssueId.get(issueId);
      const resolution = resolutionByIssueId.get(issueId) ?? null;
      return {
        issue_id: issueId,
        issue_statement: requireString(
          issue.issue_statement,
          `issue-ledger.issues[${index}].issue_statement`,
        ),
        root_cause_hypothesis: requireString(
          issue.root_cause_hypothesis,
          `issue-ledger.issues[${index}].root_cause_hypothesis`,
        ),
        root_confidence: requireString(
          issue.root_confidence,
          `issue-ledger.issues[${index}].root_confidence`,
        ),
        proposed_action: requireString(
          issue.proposed_action,
          `issue-ledger.issues[${index}].proposed_action`,
        ),
        affected_purpose: requireString(
          issue.affected_purpose,
          `issue-ledger.issues[${index}].affected_purpose`,
        ),
        failure_condition: requireString(
          issue.failure_condition,
          `issue-ledger.issues[${index}].failure_condition`,
        ),
        impact: requireString(issue.impact, `issue-ledger.issues[${index}].impact`),
        severity: requireString(
          issue.severity,
          `issue-ledger.issues[${index}].severity`,
        ),
        surface_finding_ids: surfaceFindingIds,
        raised_by_lens_ids: requireStringArray(
          issue.raised_by_lens_ids,
          `issue-ledger.issues[${index}].raised_by_lens_ids`,
        ),
        relation_refs: requireStringArray(
          issue.relation_refs,
          `issue-ledger.issues[${index}].relation_refs`,
        ),
        domain_threshold_used: optionalStringOrNull(
          issue.domain_threshold_used,
          `issue-ledger.issues[${index}].domain_threshold_used`,
        ),
        singleton_reason: optionalStringOrNull(
          issue.singleton_reason,
          `issue-ledger.issues[${index}].singleton_reason`,
        ),
        stances: stanceIssue ? stanceIssue.stances ?? [] : [],
        issue_dependencies: dependenciesByIssueId.get(issueId) ?? [],
        deliberation_plan_entry: plannedByIssueId.get(issueId) ?? skippedByIssueId.get(issueId) ?? null,
        deliberation_resolution: resolution,
      };
    },
  );
  return {
    schema_version: 1,
    session_id: sessionId,
    source_artifact_refs: {
      issue_ledger: toRelativePath(args.issueLedgerPath, args.projectRoot),
      issue_stance_matrix: toRelativePath(
        args.issueStanceMatrixPath,
        args.projectRoot,
      ),
      deliberation_plan: toRelativePath(args.deliberationPlanPath, args.projectRoot),
      deliberation_resolution: args.deliberationResolutionPath
        ? toRelativePath(args.deliberationResolutionPath, args.projectRoot)
        : null,
      review_target_profile: toRelativePath(
        args.reviewTargetProfilePath,
        args.projectRoot,
      ),
      domain_profile: profileRef,
    },
    classification_context: classificationContext,
    target_profile_summary: targetSummary,
    domain_axis_catalog: parseDomainAxisCatalog({
      profileRef,
      profileText: args.domainProfileText ?? null,
    }),
    issue_surface_finding_ids: issueSurfaceFindingIds,
    issues,
    output_policy: {
      classify_every_issue_once: true,
      runtime_fills_classification_context: true,
      runtime_fills_related_surface_finding_ids: true,
      do_not_reopen_raw_lens_outputs_by_default: true,
    },
  };
}

export function renderProblemFramingInputProjectionSection(
  projection: ProblemFramingInputProjection,
): string {
  return [
    "## Runtime Problem Framing Input Projection",
    "This projection is derived from issue-ledger, stance matrix, deliberation plan/resolution, review target profile, and the selected domain problem-framing profile.",
    "Use this projection first. Do not reopen raw Round 1 lens outputs or issue-scoped deliberation responses by default.",
    "Choose common-spine and domain-axis classification values; runtime owns classification_context and related_surface_finding_ids.",
    "",
    "```yaml",
    dumpYamlDocument(projection),
    "```",
    "",
    "## Runtime Problem Framing Submit Context",
    "The runtime submit tool uses this context to fill runtime-owned fields. Do not submit these fields yourself.",
    "",
    "```yaml",
    dumpYamlDocument({
      classification_context: projection.classification_context,
      issue_surface_finding_ids: projection.issue_surface_finding_ids,
    }),
    "```",
  ].join("\n");
}

function buildIssueLedgerDependencySubmitContext(
  relationGraph: Record<string, unknown>,
): Record<string, unknown> {
  const sharedCauseRelations = requireArray(
    relationGraph.relations,
    "finding-relation-graph.relations",
  ).flatMap((item, index) => {
    const relation = requireRecord(
      item,
      `finding-relation-graph.relations[${index}]`,
    );
    const relationKind = requireString(
      relation.relation,
      `finding-relation-graph.relations[${index}].relation`,
    );
    if (relationKind !== "shared_cause_candidate") return [];
    const sharedCause =
      relation.shared_cause &&
      typeof relation.shared_cause === "object" &&
      !Array.isArray(relation.shared_cause)
        ? (relation.shared_cause as Record<string, unknown>)
        : null;
    return [
      {
        relation_id: requireString(
          relation.relation_id,
          `finding-relation-graph.relations[${index}].relation_id`,
        ),
        from_finding_id: requireString(
          relation.from_finding_id,
          `finding-relation-graph.relations[${index}].from_finding_id`,
        ),
        to_finding_id: requireString(
          relation.to_finding_id,
          `finding-relation-graph.relations[${index}].to_finding_id`,
        ),
        cause_claim: sharedCause
          ? requireString(
              sharedCause.cause_claim,
              `finding-relation-graph.relations[${index}].shared_cause.cause_claim`,
            )
          : null,
      },
    ];
  });
  return {
    issue_dependency_policy: {
      runtime_fills_issue_dependencies: true,
      dependency_kind: "shared_cause_candidate",
      issue_ids_from_relation_endpoint_issue_assignment: true,
    },
    shared_cause_relations: sharedCauseRelations,
  };
}

function renderIssueLedgerDependencySubmitContextSection(
  context: Record<string, unknown>,
): string {
  return [
    "## Runtime Issue Ledger Submit Context",
    "The runtime uses this context to fill `issue_dependencies` from relation endpoints after the submitted `issues` assign findings to issue ids.",
    "Do not submit `issue_dependencies`; submit only `issues` and `validation`.",
    "",
    "```yaml",
    dumpYamlDocument(context),
    "```",
  ].join("\n");
}

export function buildIssueStanceResponsePrompt(args: {
  sessionId: string;
  projectRoot: string;
  executionPlan: ReviewExecutionPlan;
  lensId: string;
  outputPath: string;
  lensOutputPaths: string[];
  issueStanceInputProjection: string;
}): string {
  const outputRef = toRelativePath(args.outputPath, args.projectRoot);
  const requestedLensOutputPaths = issueStanceLensOutputPaths({
    lensId: args.lensId,
    lensOutputPaths: args.lensOutputPaths,
  });
  const lensRefs = relativeList(args.projectRoot, requestedLensOutputPaths);
  const readRefs = uniqueRefs([
    args.executionPlan.review_target_profile_path,
    args.executionPlan.finding_ledger_path,
    args.executionPlan.finding_relation_graph_path,
    args.executionPlan.issue_ledger_path,
    ...requestedLensOutputPaths,
  ]);
  return `# Issue Stance Response Prompt

session_id: ${args.sessionId}
unit_id: ${issueStanceConsumerId(args.lensId)}
unit_kind: issue_stance
consumer_id: ${issueStanceConsumerId(args.lensId)}
requested_lens_id: ${args.lensId}
output_path: ${outputRef}

## Canonical Role
You are the fresh stance worker for one review lens.
You are not the teamlead and you do not infer other lenses' stances.
Use the ${args.lensId} lens perspective to decide this lens's stance for each issue.

## Hard Output Contract
- Submit the response by calling \`submit_issue_stance_response\` exactly once when the executor provides runtime submit tools.
- Do not handwrite YAML, markdown fences, or commentary as the durable output.
- Runtime owns \`schema_version\`, \`session_id\`, \`lens_id\`, \`validation\`, and YAML serialization.
- Emit exactly one stance row for every issue in the projection.
- Enum fields must use exactly one listed token. Put explanations in \`rationale\`.

## Stance Values
- support
- oppose
- narrow
- alternative_root
- surface_only
- not_applicable
- insufficient_evidence

## Root Hypothesis Position Values
- accepts
- narrows
- replaces
- rejects
- not_applicable
- insufficient_evidence

## Severity Position Values
- keeps
- raises
- lowers
- not_applicable
- insufficient_evidence

## Lens Source Refs
${lensRefs}

${args.issueStanceInputProjection.trim()}

## Task
Build the semantic payload for \`${outputRef}\` for requested_lens_id=${args.lensId}.
Use the runtime issue stance input projection first.
Read Round 1 source refs only when the projection lacks enough lens-specific context to justify this lens's stance rationale.
Do not add stances for other lenses.

## Runtime-Written YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
lens_id: "${args.lensId}"
stances:
  - issue_id: issue-001
    stance: support
    rationale: "why this lens takes this stance"
    root_hypothesis_position: accepts
    severity_position: keeps
    evidence_refs: [issue-ledger.yaml#issue-001]
validation:
  missing_issues: []

${renderBoundaryPolicySection(args.executionPlan, args.projectRoot, {
  tools: "required",
  repoExplorationPolicy: "denied",
  allowedOutputRefs: [args.outputPath],
})}

${renderUnitBoundaryDetailsSection({
  context: args.executionPlan,
  projectRoot: args.projectRoot,
  unitId: issueStanceConsumerId(args.lensId),
  outputPath: args.outputPath,
  repoExplorationPolicy: "denied",
  allowedReadRefs: readRefs,
})}
`;
}

export function renderRuntimeIssueStanceMatrixPacket(args: {
  projectRoot: string;
  sessionId: string;
  outputPath: string;
  responsePaths: string[];
}): string {
  return [
    "# Runtime Issue Stance Matrix Aggregation",
    "",
    `session_id: ${args.sessionId}`,
    `output_path: ${toRelativePath(args.outputPath, args.projectRoot)}`,
    "",
    "This packet records that `issue-stance-matrix.yaml` is runtime-merged from per-lens stance responses.",
    "The runtime owns coverage validation and does not infer lens stances.",
    "",
    "## Stance Response Inputs",
    ...args.responsePaths.map(
      (responsePath) => `- ${toRelativePath(responsePath, args.projectRoot)}`,
    ),
  ].join("\n");
}

function issueArtifactOutputRef(
  executionPlan: ReviewExecutionPlan,
  artifactId: ReviewIssueArtifactId,
): string {
  return requireIssueArtifactSeat(executionPlan, artifactId).output_path;
}

function priorIssueArtifactIds(
  artifactId: ReviewIssueArtifactId,
): ReviewIssueArtifactId[] {
  switch (artifactId) {
    case "finding-ledger":
      return [];
    case "finding-relation-graph":
      return ["finding-ledger"];
    case "issue-ledger":
      return ["finding-ledger", "finding-relation-graph"];
    case "issue-stance-matrix":
      return ["finding-ledger", "finding-relation-graph", "issue-ledger"];
    case "deliberation-plan":
      return [
        "finding-ledger",
        "finding-relation-graph",
        "issue-ledger",
        "issue-stance-matrix",
      ];
    case "problem-framing":
      return [
        "issue-ledger",
        "issue-stance-matrix",
        "deliberation-plan",
      ];
  }
}

function issueArtifactLensOutputRefs(
  artifactId: ReviewIssueArtifactId,
  lensOutputPaths: string[],
): string[] {
  if (
    artifactId === "issue-ledger" ||
    artifactId === "deliberation-plan" ||
    artifactId === "problem-framing"
  ) {
    return [];
  }
  return lensOutputPaths;
}

export function issueArtifactAllowedReadRefs(args: {
  artifactId: ReviewIssueArtifactId;
  projectRoot: string;
  executionPlan: ReviewExecutionPlan;
  lensOutputPaths: string[];
  deliberationResponsePaths?: string[];
  deliberationOutputPath?: string;
  problemFramingProfileRef?: string | null;
}): string[] {
  const priorArtifactRefs = priorIssueArtifactIds(args.artifactId).map((artifactId) =>
    issueArtifactOutputRef(args.executionPlan, artifactId),
  );
  const lensOutputRefs = issueArtifactLensOutputRefs(
    args.artifactId,
    args.lensOutputPaths,
  );
  const problemFramingOnlyRefs =
    args.artifactId === "problem-framing"
      ? [
          args.deliberationOutputPath,
        ]
      : [];
  return uniqueRefs([
    args.executionPlan.review_target_profile_path,
    ...priorArtifactRefs,
    ...lensOutputRefs,
    ...problemFramingOnlyRefs,
  ]);
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
  findingRelationInputProjection?: string;
  issueLedgerDependencySubmitContext?: string;
  issueStanceInputProjection?: string;
  deliberationPlanInputProjection?: string;
  problemFramingInputProjection?: string;
}): string {
  const outputRef = toRelativePath(args.outputPath, args.projectRoot);
  const lensRefs = relativeList(
    args.projectRoot,
    issueArtifactLensOutputRefs(args.artifactId, args.lensOutputPaths),
  );
  const reviewTargetProfileRef = toRelativePath(
    args.executionPlan.review_target_profile_path,
    args.projectRoot,
  );
  const allowedReadRefs = issueArtifactAllowedReadRefs(args);
  const commonHeader = `# Issue-Stance Artifact Prompt

session_id: ${args.sessionId}
unit_id: ${args.artifactId}
unit_kind: issue_artifact
artifact_id: ${args.artifactId}
consumer_id: ${issueArtifactConsumerId(args.artifactId)}
output_path: ${outputRef}

## Canonical Role
You are a review runtime artifact builder.
You are not an independent review lens.
You must derive the requested artifact from existing lens finding sources and prior issue artifacts.

## Hard Output Contract
- Submit the artifact body by calling \`submit_issue_artifact\` exactly once when the executor provides runtime submit tools.
- Do not handwrite YAML, markdown fences, or commentary as the durable output.
- Runtime owns \`schema_version\`, \`session_id\`, and YAML serialization.
- Preserve lens IDs, source refs, issue IDs, and finding IDs consistently.
- If evidence is insufficient, encode that explicitly in the YAML instead of inventing facts.
- Enum fields must use exactly one listed token. Do not append explanation text to enum values; put explanations in rationale fields.

## Severity Contract
\`severity\` is the review result classification axis. It is an input to the canonical material issue predicate, not a standalone materiality decision.

Allowed severity values:
- blocker: the declared primary happy path cannot be achieved by any intended user, or the result appears trustworthy while breaking a core contract.
- high: a supported user group, environment, data condition, or execution path cannot achieve the declared purpose.
- medium: the happy path is possible, but trust, auditability, reproducibility, completeness, or decision quality is meaningfully weakened.
- low: an improvement opportunity that does not make the reviewed result unsafe for its declared purpose.
- info: an observation, question, or evidence gap that is not yet an issue.

Derived materiality candidate boundary:
- material-severity candidate: blocker, high, medium
- non-material finding: low, info
- final material issue admission is derived later by material-issue-contract.md

Every blocker/high/medium severity claim must cite concrete evidence and explain affected_purpose, failure_condition, and impact.
If evidence is insufficient, use severity: info and explain the evidence gap.

## Lens Finding Sources
${lensRefs}

## Review Target Profile
- profile: ${reviewTargetProfileRef}

${renderBoundaryPolicySection(args.executionPlan, args.projectRoot, {
  tools: "required",
  repoExplorationPolicy: "denied",
  allowedOutputRefs: [args.outputPath],
})}

${renderUnitBoundaryDetailsSection({
  context: args.executionPlan,
  projectRoot: args.projectRoot,
  unitId: issueArtifactConsumerId(args.artifactId),
  outputPath: args.outputPath,
  repoExplorationPolicy: "denied",
  allowedReadRefs,
})}
`;

  switch (args.artifactId) {
    case "finding-ledger":
      return `${commonHeader}
## Task
Build \`finding-ledger.yaml\` from every Round 1 lens output.
Register every finding or issue claim that can affect the final review.
Do not cluster findings here.
When lens sources are sidecar YAML files, preserve each candidate as a finding row instead of reparsing prose.
For blocker/high/medium findings, include both \`materiality_basis\` and \`causal_path\`.
For low/info findings, preserve the surface finding and set \`materiality_basis: null\` and \`causal_path: null\`.

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
    lens_rationale_summary: "why this lens considered the finding relevant to the review contract"
    proposed_action: "stated or inferred action"
    affected_purpose: "declared purpose or contract affected by this finding"
    failure_condition: "user group, environment, data condition, execution path, or boundary where trust fails"
    impact: "why this changes trust for the declared review purpose"
    evidence_refs: [round1/logic.md#finding-1]
    severity: medium
    domain_threshold_used: null
    materiality_basis:
      affected_purpose: "declared purpose or contract affected by this finding"
      failure_condition: "bounded condition where trust fails"
      impact: "why this changes trust for the declared review purpose"
      evidence_refs: [round1/logic.md#finding-1]
    causal_path:
      root_cause_candidate: "evidence-backed starting cause candidate"
      root_cause_step_id: finding-001.cause-002
      steps:
        - cause_id: finding-001.cause-001
          claim: "surface issue stated as a causal observation"
          relation_to_previous: null
          evidence_refs: [round1/logic.md#finding-1]
        - cause_id: finding-001.cause-002
          claim: "starting cause supported by available evidence"
          relation_to_previous: causes
          evidence_refs: [round1/logic.md#finding-1]
      unresolved_beyond_evidence: null
validation:
  unaddressable_findings: []
`;
    case "finding-relation-graph":
      return `${commonHeader}
## Prior Issue Artifacts
${renderIssueArtifactRefs(args.projectRoot, args.executionPlan, ["finding-ledger"])}

${args.findingRelationInputProjection?.trim() ?? ""}

## Task
Build \`finding-relation-graph.yaml\`.
Relate material-candidate findings by common root, shared cause, causality, dependency, duplication, or conflict.
Use the runtime finding relation input projection first.
Read Round 1 source refs only when the projection lacks enough local context to justify a relation rationale.
Do not copy every possible pair into the output. Emit accepted semantic relations only.
Submit only \`relations\` through \`submit_issue_artifact\`.
Do not submit \`relation_id\` or \`singleton_findings\`; runtime fills them.
Every \`causal_analysis_finding_ids\` entry that is not covered by an accepted relation will be listed under \`singleton_findings\` by runtime.
Do not add relation coverage for \`surface_only_finding_ids\`.

Allowed relation values:
- same_root_candidate
- shared_cause_candidate
- causes
- symptom_of
- enables
- duplicates
- conflicts_with

For relation=shared_cause_candidate, set \`shared_cause\` to {cause_claim, from_cause_ref, to_cause_ref}.
Use the stable \`causal_path.steps[].cause_id\` refs from the projection.
For every other relation value, set \`shared_cause: null\`.
Represent only accepted semantic relations. Runtime represents unrelated causal-analysis findings under \`singleton_findings\`.

## Required Submit Payload Shape
relations:
  - from_finding_id: finding-001
    to_finding_id: finding-002
    relation: same_root_candidate
    root_hypothesis: "falsifiable common-root claim"
    shared_cause: null
    rationale: "why this relation is supported"
    confidence: medium

## Runtime-Written YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
relations:
  - relation_id: rel-001
    from_finding_id: finding-001
    to_finding_id: finding-002
    relation: same_root_candidate
    root_hypothesis: "falsifiable common-root claim"
    shared_cause: null
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

${args.issueLedgerDependencySubmitContext?.trim() ?? ""}

## Task
Build \`issue-ledger.yaml\`.
Use only the prior issue artifacts and review target profile available in this unit.
Group surface findings into root-cause issue clusters.
Merge findings into one issue when the relation graph supports \`same_root_candidate\`.
Preserve \`shared_cause_candidate\` as dependency context by assigning each relation endpoint finding to an issue; runtime writes \`issue_dependencies\`.
Do not merge findings solely because they share an intermediate cause.
Do not create an issue that has no supporting finding_id.
Do not put \`shared_cause_candidate\` relations in an issue's \`relation_refs\`.
Every issue with multiple \`surface_finding_ids\` must include \`relation_refs\` that connect those findings through \`same_root_candidate\` relations.
Every issue's \`evidence_refs\` and \`raised_by_lens_ids\` must be projected from its assigned \`finding-ledger.yaml\` findings.
Submit only \`issues\` and \`validation\` through \`submit_issue_artifact\`; \`issue_dependencies\` is runtime-owned.

## Runtime-Written YAML Shape
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
    affected_purpose: "declared purpose or contract affected by this root-cause issue"
    failure_condition: "user group, environment, data condition, execution path, or boundary where trust fails"
    impact: "why this changes trust for the declared review purpose"
    evidence_refs: [round1/logic.md#finding-1]
    severity: medium
    domain_threshold_used: null
    singleton_reason: null
  - issue_id: issue-002
    root_cause_hypothesis: "different root-cause hypothesis that shares an intermediate cause"
    root_confidence: medium
    surface_finding_ids: [finding-002]
    relation_refs: []
    raised_by_lens_ids: [coverage]
    issue_statement: "second root-level issue statement"
    proposed_action: "action framing for the second root cause"
    affected_purpose: "declared purpose or contract affected by the second issue"
    failure_condition: "bounded condition where the second issue weakens trust"
    impact: "why this second issue changes trust for the declared review purpose"
    evidence_refs: [round1/coverage.md#finding-1]
    severity: medium
    domain_threshold_used: null
    singleton_reason: null
issue_dependencies:
  - dependency_id: dep-001
    dependency_kind: shared_cause_candidate
    issue_ids: [issue-001, issue-002]
    relation_refs: [rel-002]
    rationale: "why these distinct issues share a cause or solution dependency without sharing the same root"
validation:
  unclustered_finding_ids: []

## Submit Payload Shape
issues:
  - issue_id: issue-001
    root_cause_hypothesis: "falsifiable root-cause hypothesis"
    root_confidence: medium
    surface_finding_ids: [finding-001]
    relation_refs: [rel-001]
    raised_by_lens_ids: [logic]
    issue_statement: "root-level issue statement"
    proposed_action: "action framing from source findings, not a detailed fix"
    affected_purpose: "declared purpose or contract affected by this root-cause issue"
    failure_condition: "bounded condition where trust fails"
    impact: "why this changes trust for the declared review purpose"
    evidence_refs: [round1/logic.md#finding-1]
    severity: medium
    domain_threshold_used: null
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

${args.issueStanceInputProjection?.trim() ?? ""}

## Task
Build \`issue-stance-matrix.yaml\`.
Use the runtime issue stance input projection first.
Read Round 1 source refs only when the projection lacks enough lens-specific context to justify a stance rationale.
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

${args.deliberationPlanInputProjection?.trim() ?? ""}

## Task
Build \`deliberation-plan.yaml\`.
Use the runtime deliberation plan input projection first.
Runtime conflict signals are candidates; decide whether each candidate is a real material conflict.
Only material conflicts enter planned deliberation.
Every issue must appear exactly once: either in \`planned_issues\` or \`skipped_issues\`.
Do not use \`order\` or \`material_conflict\`; the current contract uses \`priority\`, \`conflict_type\`, and \`source_stance_refs\`.

Allowed conflict_type values:
- correctness_or_blocking_execution
- root_hypothesis
- domain_constraint
- purpose_value
- action_or_severity
- partial_overlap_or_cluster_scope
- evidence_gap
- stance_conflict

Allowed skipped reason_code values:
- non_material_issue
- consistent_stances
- no_material_conflict
- outside_deliberation_scope
- insufficient_participation

## Required YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
planned_issues:
  - issue_id: issue-001
    priority: 10
    conflict_type: root_hypothesis
    participating_lens_ids: [logic, structure]
    source_stance_refs:
      - issue-stance-matrix.yaml#stances.issue-001.logic
      - issue-stance-matrix.yaml#stances.issue-001.structure
    conflict_summary: "what conflicting claims must be deliberated"
    resolution_question: "the exact question deliberation must answer"
skipped_issues:
  - issue_id: issue-002
    reason_code: no_material_conflict
    reason: "no material conflict"
`;
    case "problem-framing":
      return `${commonHeader}
## Prior Issue Artifacts
${renderIssueArtifactRefs(args.projectRoot, args.executionPlan, [
  "issue-ledger",
  "issue-stance-matrix",
  "deliberation-plan",
])}

## Controlled Deliberation Result
- controlled deliberation resolution: ${
  args.deliberationOutputPath
    ? toRelativePath(args.deliberationOutputPath, args.projectRoot)
    : "(missing)"
}

${args.problemFramingInputProjection?.trim() ?? ""}

## Task
Build \`problem-framing.yaml\`.
Use the runtime problem framing input projection first.
Classify each issue with the common spine and optional domain axes from the selected profile.
Submit only \`classifications\` through \`submit_issue_artifact\`.
Do not submit \`classification_context\` or \`related_surface_finding_ids\`; runtime fills them from the projection.
Do not read raw Round 1 lens outputs, issue-scoped deliberation responses, or the raw domain profile by default.
Do not change issue status or lens stance.
Do not propose detailed fixes.

Allowed common spine values:
- issue_role: root_cause, symptom, enabler, conflicting_interpretation, evidence_gap, independent_issue
- judgment_state: observed, inferred, contested, insufficient_evidence, outside_boundary
- impact_kind: correctness, consistency, completeness, safety_risk, usability, governance_value, maintainability_evolvability
- timing_class: current_blocker, next_step_blocker, planned_follow_up, defer_watch
- closure_class: fix_now, carry_forward, document_only, needs_decision, needs_evidence, watch
- closure_obligation: must_close_in_target, must_close_before_next_stage, may_close_during_next_stage, planned_later, out_of_scope

## Runtime-Written YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
classification_context:
  common_spine_version: 1
  session_domain: "runtime-filled"
  domain_profile_ref: "runtime-filled"
  domain_profile_doc_type: "custom:problem_framing_profile"
  domain_profile_status: applied|absent|not_requested
classifications:
  - issue_id: issue-001
    problem_definition: "root-level problem definition"
    issue_role: root_cause
    judgment_state: inferred
    impact_kind: consistency
    timing_class: next_step_blocker
    closure_class: carry_forward
    closure_obligation: may_close_during_next_stage
    domain_axes: {}
    rationale: "why this classification is appropriate"
    related_surface_finding_ids: [runtime-filled]
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
  const findingRelationInputProjection =
    args.artifactId === "finding-relation-graph"
      ? renderFindingRelationInputProjectionSection(
          buildFindingRelationInputProjection({
            projectRoot: args.projectRoot,
            findingLedgerPath: args.executionPlan.finding_ledger_path,
            findingLedger: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.finding_ledger_path,
            ),
          }),
        )
      : undefined;
  const issueLedgerDependencySubmitContext =
    args.artifactId === "issue-ledger"
      ? renderIssueLedgerDependencySubmitContextSection(
          buildIssueLedgerDependencySubmitContext(
            await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.finding_relation_graph_path,
            ),
          ),
        )
      : undefined;
  const issueStanceInputProjection =
    args.artifactId === "issue-stance-matrix"
      ? renderIssueStanceInputProjectionSection(
          buildIssueStanceInputProjection({
            projectRoot: args.projectRoot,
            findingLedgerPath: args.executionPlan.finding_ledger_path,
            findingRelationGraphPath:
              args.executionPlan.finding_relation_graph_path,
            issueLedgerPath: args.executionPlan.issue_ledger_path,
            findingLedger: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.finding_ledger_path,
            ),
            relationGraph: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.finding_relation_graph_path,
            ),
            issueLedger: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.issue_ledger_path,
            ),
            lensOutputPaths: args.lensOutputPaths,
          }),
        )
      : undefined;
  const deliberationPlanInputProjection =
    args.artifactId === "deliberation-plan"
      ? renderDeliberationPlanInputProjectionSection(
          buildDeliberationPlanInputProjection({
            projectRoot: args.projectRoot,
            findingRelationGraphPath:
              args.executionPlan.finding_relation_graph_path,
            issueLedgerPath: args.executionPlan.issue_ledger_path,
            issueStanceMatrixPath: args.executionPlan.issue_stance_matrix_path,
            relationGraph: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.finding_relation_graph_path,
            ),
            issueLedger: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.issue_ledger_path,
            ),
            issueStanceMatrix: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.issue_stance_matrix_path,
            ),
          }),
        )
      : undefined;
  const problemFramingInputProjection =
    args.artifactId === "problem-framing"
      ? renderProblemFramingInputProjectionSection(
          buildProblemFramingInputProjection({
            projectRoot: args.projectRoot,
            issueLedgerPath: args.executionPlan.issue_ledger_path,
            issueStanceMatrixPath: args.executionPlan.issue_stance_matrix_path,
            deliberationPlanPath: args.executionPlan.deliberation_plan_path,
            ...(args.deliberationOutputPath
              ? { deliberationResolutionPath: args.deliberationOutputPath }
              : {}),
            reviewTargetProfilePath: args.executionPlan.review_target_profile_path,
            ...(args.problemFramingProfileRef !== undefined
              ? { problemFramingProfileRef: args.problemFramingProfileRef }
              : {}),
            issueLedger: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.issue_ledger_path,
            ),
            issueStanceMatrix: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.issue_stance_matrix_path,
            ),
            deliberationPlan: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.deliberation_plan_path,
            ),
            ...(args.deliberationOutputPath
              ? {
                  deliberationResolution: await readYamlDocument<
                    Record<string, unknown>
                  >(args.deliberationOutputPath),
                }
              : {}),
            reviewTargetProfile: await readYamlDocument<Record<string, unknown>>(
              args.executionPlan.review_target_profile_path,
            ),
            ...(args.problemFramingProfileRef
              ? {
                  domainProfileText: await fs.readFile(
                    projectAbsoluteRef(
                      args.projectRoot,
                      args.problemFramingProfileRef,
                    ) ?? args.problemFramingProfileRef,
                    "utf8",
                  ),
                }
              : {}),
          }),
        )
      : undefined;
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
    ...(findingRelationInputProjection !== undefined
      ? { findingRelationInputProjection }
      : {}),
    ...(issueLedgerDependencySubmitContext !== undefined
      ? { issueLedgerDependencySubmitContext }
      : {}),
    ...(issueStanceInputProjection !== undefined
      ? { issueStanceInputProjection }
      : {}),
    ...(deliberationPlanInputProjection !== undefined
      ? { deliberationPlanInputProjection }
      : {}),
    ...(problemFramingInputProjection !== undefined
      ? { problemFramingInputProjection }
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
  knownFindingFacts?: ReadonlyMap<string, IssueArtifactFindingFact>;
  coverageFindingIds?: ReadonlySet<string>;
  knownCauseFindingIds?: ReadonlyMap<string, string>;
  knownRelationIds?: ReadonlySet<string>;
  knownRelationKinds?: ReadonlyMap<string, string>;
  knownRelationFacts?: ReadonlyMap<
    string,
    { relation: string; from_finding_id: string; to_finding_id: string }
  >;
  requiredIssueFindingIds?: ReadonlySet<string>;
  knownIssueIds?: ReadonlySet<string>;
  knownIssueSeverities?: ReadonlyMap<string, ReviewFindingSeverity>;
  knownIssueRaisedLensIds?: ReadonlyMap<string, ReadonlySet<string>>;
  knownIssueSurfaceFindingIds?: ReadonlyMap<string, ReadonlySet<string>>;
  expectedProblemFramingContext?: ProblemFramingClassificationContext;
  knownDomainAxisValues?: ReadonlyMap<string, ReadonlySet<string>>;
  knownStanceEvidenceRefs?: StanceEvidenceRefsByIssueAndLens;
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
        requireString(finding.lens_rationale_summary, `finding-ledger.findings[${index}].lens_rationale_summary`);
        requireString(finding.affected_purpose, `finding-ledger.findings[${index}].affected_purpose`);
        requireString(finding.failure_condition, `finding-ledger.findings[${index}].failure_condition`);
        requireString(finding.impact, `finding-ledger.findings[${index}].impact`);
        const evidenceRefs = requireStringArray(
          finding.evidence_refs,
          `finding-ledger.findings[${index}].evidence_refs`,
        );
        const severity = requireAllowed(
          finding.severity,
          SEVERITY_VALUES,
          `finding-ledger.findings[${index}].severity`,
        ) as ReviewFindingSeverity;
        if (isMaterialSeverity(severity) && evidenceRefs.length === 0) {
          throw new Error(
            `finding-ledger.findings[${index}].evidence_refs must not be empty for severity=${severity}.`,
          );
        }
        const materialityBasis = optionalMaterialityBasisRecord(
          finding.materiality_basis,
          `finding-ledger.findings[${index}].materiality_basis`,
        );
        const causalPath = optionalCausalPathRecord(
          finding.causal_path,
          `finding-ledger.findings[${index}].causal_path`,
        );
        if (isMaterialSeverity(severity) && (!materialityBasis || !causalPath)) {
          throw new Error(
            `finding-ledger.findings[${index}] must include materiality_basis and causal_path for severity=${severity}.`,
          );
        }
        if (
          !isMaterialSeverity(severity) &&
          (materialityBasis !== null || causalPath !== null)
        ) {
          throw new Error(
            `finding-ledger.findings[${index}].materiality_basis and causal_path must be null for severity=${severity}.`,
          );
        }
        requireOptionalStringOrNull(
          finding.domain_threshold_used,
          `finding-ledger.findings[${index}].domain_threshold_used`,
        );
      }
      ensureUnique(findingIds, "finding-ledger.finding_id");
      causeFindingIdsFrom(args.parsed);
      const validation = requireRecord(args.parsed.validation, "finding-ledger.validation");
      requireArray(validation.unaddressable_findings, "finding-ledger.validation.unaddressable_findings");
      return;
    }

    case "finding-relation-graph": {
      const knownFindingIds = args.knownFindingIds ?? new Set<string>();
      const coverageFindingIds = args.coverageFindingIds ?? knownFindingIds;
      const hasExplicitCoverageScope = args.coverageFindingIds !== undefined;
      const knownCauseFindingIds = args.knownCauseFindingIds ?? new Map<string, string>();
      const relationIds: string[] = [];
      const relationCoveredFindingIds = new Set<string>();
      const singletonFindingIds = new Set<string>();
      for (const [index, item] of requireArray(args.parsed.relations, "finding-relation-graph.relations").entries()) {
        const relation = requireRecord(item, `finding-relation-graph.relations[${index}]`);
        relationIds.push(requireString(relation.relation_id, `finding-relation-graph.relations[${index}].relation_id`));
        const from = requireString(relation.from_finding_id, `finding-relation-graph.relations[${index}].from_finding_id`);
        const to = requireString(relation.to_finding_id, `finding-relation-graph.relations[${index}].to_finding_id`);
        if (from === to) {
          throw new Error(
            `finding-relation-graph.relations[${index}] must not relate a finding to itself.`,
          );
        }
        if (knownFindingIds.size > 0) {
          ensureKnown(from, knownFindingIds, `finding-relation-graph.relations[${index}].from_finding_id`);
          ensureKnown(to, knownFindingIds, `finding-relation-graph.relations[${index}].to_finding_id`);
        }
        if (hasExplicitCoverageScope) {
          ensureKnown(from, coverageFindingIds, `finding-relation-graph.relations[${index}].from_finding_id`);
          ensureKnown(to, coverageFindingIds, `finding-relation-graph.relations[${index}].to_finding_id`);
        }
        relationCoveredFindingIds.add(from);
        relationCoveredFindingIds.add(to);
        const relationValue = requireAllowed(relation.relation, RELATION_VALUES, `finding-relation-graph.relations[${index}].relation`);
        validateSharedCauseForRelation(
          relation.shared_cause,
          relationValue,
          `finding-relation-graph.relations[${index}].shared_cause`,
          {
            fromFindingId: from,
            toFindingId: to,
            knownCauseFindingIds,
          },
        );
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
        if (hasExplicitCoverageScope) {
          ensureKnown(findingId, coverageFindingIds, `finding-relation-graph.singleton_findings[${index}].finding_id`);
        }
        if (relationCoveredFindingIds.has(findingId)) {
          throw new Error(
            `finding-relation-graph.singleton_findings[${index}].finding_id must not also appear in an accepted relation: ${findingId}`,
          );
        }
        if (singletonFindingIds.has(findingId)) {
          throw new Error(
            `finding-relation-graph.singleton_findings contains duplicate finding_id: ${findingId}`,
          );
        }
        singletonFindingIds.add(findingId);
        requireString(singleton.reason, `finding-relation-graph.singleton_findings[${index}].reason`);
      }
      if (coverageFindingIds.size > 0 || hasExplicitCoverageScope) {
        for (const findingId of coverageFindingIds) {
          if (
            !relationCoveredFindingIds.has(findingId) &&
            !singletonFindingIds.has(findingId)
          ) {
            throw new Error(
              `finding-relation-graph missing relation or singleton coverage for finding: ${findingId}`,
            );
          }
        }
      }
      return;
    }

    case "issue-ledger": {
      const knownFindingIds = args.knownFindingIds ?? new Set<string>();
      const knownFindingFacts =
        args.knownFindingFacts ?? new Map<string, IssueArtifactFindingFact>();
      const requiredIssueFindingIds =
        args.requiredIssueFindingIds ?? new Set<string>();
      const knownRelationIds = args.knownRelationIds ?? new Set<string>();
      const knownRelationKinds = args.knownRelationKinds ?? new Map<string, string>();
      const knownRelationFacts = args.knownRelationFacts ?? new Map<
        string,
        { relation: string; from_finding_id: string; to_finding_id: string }
      >();
      const issueIds: string[] = [];
      const issueIdsSet = new Set<string>();
      const findingIssueIds = new Map<string, string>();
      for (const [index, item] of requireArray(args.parsed.issues, "issue-ledger.issues").entries()) {
        const issue = requireRecord(item, `issue-ledger.issues[${index}]`);
        const issueId = requireString(issue.issue_id, `issue-ledger.issues[${index}].issue_id`);
        issueIds.push(issueId);
        issueIdsSet.add(issueId);
        requireString(issue.root_cause_hypothesis, `issue-ledger.issues[${index}].root_cause_hypothesis`);
        requireAllowed(issue.root_confidence, CONFIDENCE_VALUES, `issue-ledger.issues[${index}].root_confidence`);
        requireString(issue.issue_statement, `issue-ledger.issues[${index}].issue_statement`);
        requireString(issue.affected_purpose, `issue-ledger.issues[${index}].affected_purpose`);
        requireString(issue.failure_condition, `issue-ledger.issues[${index}].failure_condition`);
        requireString(issue.impact, `issue-ledger.issues[${index}].impact`);
        const evidenceRefs = requireStringArray(
          issue.evidence_refs,
          `issue-ledger.issues[${index}].evidence_refs`,
        );
        const severity = requireAllowed(
          issue.severity,
          SEVERITY_VALUES,
          `issue-ledger.issues[${index}].severity`,
        ) as ReviewFindingSeverity;
        if (isMaterialSeverity(severity) && evidenceRefs.length === 0) {
          throw new Error(
            `issue-ledger.issues[${index}].evidence_refs must not be empty for severity=${severity}.`,
          );
        }
        requireOptionalStringOrNull(
          issue.domain_threshold_used,
          `issue-ledger.issues[${index}].domain_threshold_used`,
        );
        const surfaceFindingIds = requireStringArray(issue.surface_finding_ids, `issue-ledger.issues[${index}].surface_finding_ids`);
        if (surfaceFindingIds.length === 0) {
          throw new Error(`issue-ledger.issues[${index}].surface_finding_ids must not be empty.`);
        }
        const allowedEvidenceRefs = new Set<string>();
        const expectedLensIds = new Set<string>();
        for (const findingId of surfaceFindingIds) {
          if (knownFindingIds.size > 0) {
            ensureKnown(findingId, knownFindingIds, `issue-ledger.issues[${index}].surface_finding_ids`);
          }
          if (knownFindingFacts.size > 0) {
            const findingFact = knownFindingFacts.get(findingId);
            if (!findingFact) {
              throw new Error(
                `issue-ledger.issues[${index}].surface_finding_ids references finding without ledger provenance: ${findingId}`,
              );
            }
            expectedLensIds.add(findingFact.lens_id);
            for (const evidenceRef of findingFact.evidence_refs) {
              allowedEvidenceRefs.add(evidenceRef);
            }
          }
          const existingIssueId = findingIssueIds.get(findingId);
          if (existingIssueId) {
            throw new Error(
              `issue-ledger.issues[${index}].surface_finding_ids duplicates finding ${findingId} already assigned to ${existingIssueId}.`,
            );
          }
          findingIssueIds.set(findingId, issueId);
        }
        if (knownFindingFacts.size > 0) {
          for (const evidenceRef of evidenceRefs) {
            if (!allowedEvidenceRefs.has(evidenceRef)) {
              throw new Error(
                `issue-ledger.issues[${index}].evidence_refs must come from assigned finding-ledger refs: ${evidenceRef}`,
              );
            }
          }
        }
        const relationRefs = requireStringArray(
          issue.relation_refs,
          `issue-ledger.issues[${index}].relation_refs`,
        );
        for (const relationId of relationRefs) {
          if (knownRelationIds.size > 0) {
            ensureKnown(relationId, knownRelationIds, `issue-ledger.issues[${index}].relation_refs`);
          }
          if (knownRelationKinds.get(relationId) === "shared_cause_candidate") {
            throw new Error(
              `issue-ledger.issues[${index}].relation_refs must not reference shared_cause_candidate relation ${relationId}; record it in issue_dependencies instead.`,
            );
          }
        }
        validateIssueMergeRelations({
          issueLabel: `issue-ledger.issues[${index}]`,
          surfaceFindingIds,
          relationRefs,
          knownRelationFacts,
        });
        const raisedByLensIds = requireStringArray(issue.raised_by_lens_ids, `issue-ledger.issues[${index}].raised_by_lens_ids`);
        ensureUnique(
          raisedByLensIds,
          `issue-ledger.issues[${index}].raised_by_lens_ids`,
        );
        if (knownFindingFacts.size > 0) {
          ensureExactStringSet({
            actual: new Set(raisedByLensIds),
            expected: expectedLensIds,
            label: `issue-ledger.issues[${index}].raised_by_lens_ids`,
          });
        }
      }
      ensureUnique(issueIds, "issue-ledger.issue_id");
      for (const findingId of requiredIssueFindingIds) {
        if (knownFindingIds.size > 0) {
          ensureKnown(findingId, knownFindingIds, "issue-ledger.required_finding_ids");
        }
        if (!findingIssueIds.has(findingId)) {
          throw new Error(
            `issue-ledger must assign relation-graph covered finding to exactly one issue: ${findingId}.`,
          );
        }
      }
      const dependencyRelationRefs = new Set<string>();
      const dependencyIds: string[] = [];
      for (const [index, item] of requireArray(args.parsed.issue_dependencies, "issue-ledger.issue_dependencies").entries()) {
        const dependency = requireRecord(item, `issue-ledger.issue_dependencies[${index}]`);
        dependencyIds.push(requireString(dependency.dependency_id, `issue-ledger.issue_dependencies[${index}].dependency_id`));
        const dependencyKind = requireAllowed(
          dependency.dependency_kind,
          ISSUE_DEPENDENCY_KIND_VALUES,
          `issue-ledger.issue_dependencies[${index}].dependency_kind`,
        );
        const dependencyIssueIds = requireStringArray(
          dependency.issue_ids,
          `issue-ledger.issue_dependencies[${index}].issue_ids`,
        );
        if (dependencyIssueIds.length !== 2 || dependencyIssueIds[0] === dependencyIssueIds[1]) {
          throw new Error(`issue-ledger.issue_dependencies[${index}].issue_ids must contain exactly two distinct issue ids.`);
        }
        for (const issueId of dependencyIssueIds) {
          ensureKnown(issueId, issueIdsSet, `issue-ledger.issue_dependencies[${index}].issue_ids`);
        }
        const dependencyIssueIdSet = new Set(dependencyIssueIds);
        const relationRefs = requireStringArray(
          dependency.relation_refs,
          `issue-ledger.issue_dependencies[${index}].relation_refs`,
        );
        if (relationRefs.length === 0) {
          throw new Error(`issue-ledger.issue_dependencies[${index}].relation_refs must not be empty.`);
        }
        for (const relationId of relationRefs) {
          if (knownRelationIds.size > 0) {
            ensureKnown(relationId, knownRelationIds, `issue-ledger.issue_dependencies[${index}].relation_refs`);
          }
          const relationKind = knownRelationKinds.get(relationId);
          if (relationKind !== undefined && relationKind !== dependencyKind) {
            throw new Error(
              `issue-ledger.issue_dependencies[${index}].relation_refs references ${relationId} with relation=${relationKind}, expected ${dependencyKind}.`,
            );
          }
          const relationFact = knownRelationFacts.get(relationId);
          if (relationFact) {
            const fromIssueId = findingIssueIds.get(relationFact.from_finding_id);
            const toIssueId = findingIssueIds.get(relationFact.to_finding_id);
            if (
              fromIssueId &&
              toIssueId &&
              (!dependencyIssueIdSet.has(fromIssueId) || !dependencyIssueIdSet.has(toIssueId))
            ) {
              throw new Error(
                `issue-ledger.issue_dependencies[${index}].issue_ids must match relation ${relationId}'s issue endpoints.`,
              );
            }
          }
          dependencyRelationRefs.add(relationId);
        }
        requireString(dependency.rationale, `issue-ledger.issue_dependencies[${index}].rationale`);
      }
      ensureUnique(dependencyIds, "issue-ledger.issue_dependencies.dependency_id");
      for (const [relationId, relationFact] of knownRelationFacts) {
        if (relationFact.relation !== "shared_cause_candidate") continue;
        const fromIssueId = findingIssueIds.get(relationFact.from_finding_id);
        const toIssueId = findingIssueIds.get(relationFact.to_finding_id);
        if (!fromIssueId || !toIssueId) {
          throw new Error(
            `issue-ledger must assign both findings for shared_cause_candidate relation ${relationId} before preserving it as an issue dependency.`,
          );
        }
        if (fromIssueId === toIssueId) {
          throw new Error(
            `issue-ledger must not merge findings connected only by shared_cause_candidate relation ${relationId}.`,
          );
        }
        if (!dependencyRelationRefs.has(relationId)) {
          throw new Error(
            `issue-ledger.issue_dependencies must preserve shared_cause_candidate relation ${relationId}.`,
          );
        }
      }
      const validation = requireRecord(args.parsed.validation, "issue-ledger.validation");
      requireArray(validation.unclustered_finding_ids, "issue-ledger.validation.unclustered_finding_ids");
      return;
    }

    case "issue-stance-matrix": {
      const knownIssueIds = args.knownIssueIds ?? new Set<string>();
      const knownStanceEvidenceRefs =
        args.knownStanceEvidenceRefs ??
        new Map<string, ReadonlyMap<string, ReadonlySet<string>>>();
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
          const stanceLensId = requireString(stance.lens_id, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].lens_id`);
          stanceLensIds.push(stanceLensId);
          if (
            participatingLensIds.length > 0 &&
            !participatingLensIds.includes(stanceLensId)
          ) {
            throw new Error(
              `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].lens_id references non-participating lens: ${stanceLensId}`,
            );
          }
          requireAllowed(stance.stance, STANCE_VALUES, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].stance`);
          requireString(stance.rationale, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].rationale`);
          requireAllowed(stance.root_hypothesis_position, ROOT_HYPOTHESIS_POSITION_VALUES, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].root_hypothesis_position`);
          requireAllowed(stance.severity_position, SEVERITY_POSITION_VALUES, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].severity_position`);
          const evidenceRefs = requireStringArray(stance.evidence_refs, `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].evidence_refs`);
          const allowedEvidenceRefs = knownStanceEvidenceRefs
            .get(issueId)
            ?.get(stanceLensId);
          if (allowedEvidenceRefs) {
            for (const evidenceRef of evidenceRefs) {
              if (!allowedEvidenceRefs.has(evidenceRef)) {
                throw new Error(
                  `issue-stance-matrix.issues[${index}].stances[${stanceIndex}].evidence_refs references unsupported evidence for issue ${issueId} and lens ${stanceLensId}: ${evidenceRef}`,
                );
              }
            }
          }
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
      const knownIssueSeverities = args.knownIssueSeverities ?? new Map<string, ReviewFindingSeverity>();
      const knownIssueRaisedLensIds =
        args.knownIssueRaisedLensIds ?? new Map<string, ReadonlySet<string>>();
      const participatingLensIds = args.participatingLensIds ?? [];
      const covered = new Set<string>();
      const plannedIssueIds: string[] = [];
      for (const [index, item] of requireArray(args.parsed.planned_issues, "deliberation-plan.planned_issues").entries()) {
        const issue = requireRecord(item, `deliberation-plan.planned_issues[${index}]`);
        const issueId = requireString(issue.issue_id, `deliberation-plan.planned_issues[${index}].issue_id`);
        plannedIssueIds.push(issueId);
        covered.add(issueId);
        if (knownIssueIds.size > 0) {
          ensureKnown(issueId, knownIssueIds, `deliberation-plan.planned_issues[${index}].issue_id`);
        }
        const severity = knownIssueSeverities.get(issueId);
        if (severity !== undefined && !isMaterialSeverity(severity)) {
          throw new Error(
            `deliberation-plan.planned_issues[${index}].issue_id must reference a material-severity issue candidate, got severity=${severity}.`,
          );
        }
        requirePositiveInteger(issue.priority, `deliberation-plan.planned_issues[${index}].priority`);
        requireAllowed(issue.conflict_type, DELIBERATION_CONFLICT_TYPE_VALUES, `deliberation-plan.planned_issues[${index}].conflict_type`);
        const planLensIds = requireStringArray(issue.participating_lens_ids, `deliberation-plan.planned_issues[${index}].participating_lens_ids`);
        if (planLensIds.length === 0) {
          throw new Error(`deliberation-plan.planned_issues[${index}].participating_lens_ids must not be empty.`);
        }
        ensureUnique(planLensIds, `deliberation-plan.planned_issues[${index}].participating_lens_ids`);
        for (const lensId of planLensIds) {
          if (participatingLensIds.length > 0 && !participatingLensIds.includes(lensId)) {
            throw new Error(
              `deliberation-plan.planned_issues[${index}].participating_lens_ids references non-participating lens: ${lensId}`,
            );
          }
        }
        const raisedLensIds = knownIssueRaisedLensIds.get(issueId);
        if (
          raisedLensIds &&
          !planLensIds.some((lensId) => raisedLensIds.has(lensId))
        ) {
          throw new Error(
            `deliberation-plan.planned_issues[${index}].participating_lens_ids must include at least one lens that raised issue ${issueId}.`,
          );
        }
        const sourceStanceRefs = requireStringArray(issue.source_stance_refs, `deliberation-plan.planned_issues[${index}].source_stance_refs`);
        ensureUnique(sourceStanceRefs, `deliberation-plan.planned_issues[${index}].source_stance_refs`);
        ensureExactStringSet({
          actual: new Set(sourceStanceRefs),
          expected: new Set(planLensIds.map((lensId) => stanceAnchorRef(issueId, lensId))),
          label: `deliberation-plan.planned_issues[${index}].source_stance_refs`,
        });
        requireString(issue.conflict_summary, `deliberation-plan.planned_issues[${index}].conflict_summary`);
        requireString(issue.resolution_question, `deliberation-plan.planned_issues[${index}].resolution_question`);
      }
      ensureUnique(plannedIssueIds, "deliberation-plan.planned_issues.issue_id");
      const skippedIssueIds: string[] = [];
      for (const [index, item] of requireArray(args.parsed.skipped_issues, "deliberation-plan.skipped_issues").entries()) {
        const issue = requireRecord(item, `deliberation-plan.skipped_issues[${index}]`);
        const issueId = requireString(issue.issue_id, `deliberation-plan.skipped_issues[${index}].issue_id`);
        skippedIssueIds.push(issueId);
        if (covered.has(issueId)) {
          throw new Error(`deliberation-plan issue appears more than once: ${issueId}`);
        }
        covered.add(issueId);
        if (knownIssueIds.size > 0) {
          ensureKnown(issueId, knownIssueIds, `deliberation-plan.skipped_issues[${index}].issue_id`);
        }
        requireAllowed(issue.reason_code, DELIBERATION_SKIP_REASON_CODE_VALUES, `deliberation-plan.skipped_issues[${index}].reason_code`);
        requireString(issue.reason, `deliberation-plan.skipped_issues[${index}].reason`);
      }
      ensureUnique(skippedIssueIds, "deliberation-plan.skipped_issues.issue_id");
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
      const knownIssueSurfaceFindingIds =
        args.knownIssueSurfaceFindingIds ?? new Map<string, ReadonlySet<string>>();
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
      if (args.expectedProblemFramingContext) {
        const expected = args.expectedProblemFramingContext;
        const checks: Array<[string, unknown, unknown]> = [
          ["session_domain", classificationContext.session_domain, expected.session_domain],
          ["domain_profile_ref", profileRef, expected.domain_profile_ref],
          [
            "domain_profile_doc_type",
            classificationContext.domain_profile_doc_type,
            expected.domain_profile_doc_type,
          ],
          [
            "domain_profile_status",
            profileStatus,
            expected.domain_profile_status,
          ],
        ];
        for (const [field, actual, expectedValue] of checks) {
          if (actual !== expectedValue) {
            throw new Error(
              `problem-framing.classification_context.${field} must match source truth: expected ${String(expectedValue)}, got ${String(actual)}.`,
            );
          }
        }
      }
      const classificationIssueIds: string[] = [];
      for (const [index, item] of requireArray(args.parsed.classifications, "problem-framing.classifications").entries()) {
        const classification = requireRecord(item, `problem-framing.classifications[${index}]`);
        requireOnlyFields(
          classification,
          `problem-framing.classifications[${index}]`,
          PROBLEM_FRAMING_CLASSIFICATION_ARTIFACT_KEYS,
        );
        const issueId = requireString(classification.issue_id, `problem-framing.classifications[${index}].issue_id`);
        classificationIssueIds.push(issueId);
        if (knownIssueIds.size > 0) {
          ensureKnown(issueId, knownIssueIds, `problem-framing.classifications[${index}].issue_id`);
        }
        requireString(classification.problem_definition, `problem-framing.classifications[${index}].problem_definition`);
        requireAllowed(classification.issue_role, PROBLEM_FRAMING_ISSUE_ROLE_SET, `problem-framing.classifications[${index}].issue_role`);
        requireAllowed(classification.judgment_state, PROBLEM_FRAMING_JUDGMENT_STATE_SET, `problem-framing.classifications[${index}].judgment_state`);
        requireAllowed(classification.impact_kind, PROBLEM_FRAMING_IMPACT_KIND_SET, `problem-framing.classifications[${index}].impact_kind`);
        requireAllowed(classification.timing_class, PROBLEM_FRAMING_TIMING_CLASS_SET, `problem-framing.classifications[${index}].timing_class`);
        requireAllowed(classification.closure_class, PROBLEM_FRAMING_CLOSURE_CLASS_SET, `problem-framing.classifications[${index}].closure_class`);
        requireAllowed(classification.closure_obligation, PROBLEM_FRAMING_CLOSURE_OBLIGATION_SET, `problem-framing.classifications[${index}].closure_obligation`);
        const domainAxes = requireRecord(
          classification.domain_axes,
          `problem-framing.classifications[${index}].domain_axes`,
        );
        const domainAxisEntries = Object.entries(domainAxes);
        if (profileStatus !== "applied" && domainAxisEntries.length > 0) {
          throw new Error(
            `problem-framing.classifications[${index}].domain_axes must be empty when no domain profile is applied.`,
          );
        }
        if (args.knownDomainAxisValues) {
          for (const [axisName, axisValue] of domainAxisEntries) {
            const allowedValues = args.knownDomainAxisValues.get(axisName);
            if (!allowedValues) {
              throw new Error(
                `problem-framing.classifications[${index}].domain_axes references unknown profile axis: ${axisName}`,
              );
            }
            const axisValueText = requireString(
              axisValue,
              `problem-framing.classifications[${index}].domain_axes.${axisName}`,
            );
            if (!allowedValues.has(axisValueText)) {
              throw new Error(
                `problem-framing.classifications[${index}].domain_axes.${axisName} has unsupported profile value: ${axisValueText}`,
              );
            }
          }
        }
        requireString(classification.rationale, `problem-framing.classifications[${index}].rationale`);
        const relatedSurfaceFindingIds = requireStringArray(
          classification.related_surface_finding_ids,
          `problem-framing.classifications[${index}].related_surface_finding_ids`,
        );
        const expectedSurfaceFindingIds = knownIssueSurfaceFindingIds.get(issueId);
        if (expectedSurfaceFindingIds) {
          ensureExactStringSet({
            actual: new Set(relatedSurfaceFindingIds),
            expected: expectedSurfaceFindingIds,
            label: `problem-framing.classifications[${index}].related_surface_finding_ids`,
          });
        }
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

function findingFactsFrom(
  findingLedger: Record<string, unknown>,
): Map<string, IssueArtifactFindingFact> {
  const facts = new Map<string, IssueArtifactFindingFact>();
  for (const [index, item] of requireArray(
    findingLedger.findings,
    "finding-ledger.findings",
  ).entries()) {
    const finding = requireRecord(item, `finding-ledger.findings[${index}]`);
    const findingId = requireString(
      finding.finding_id,
      `finding-ledger.findings[${index}].finding_id`,
    );
    const evidenceRefs = new Set(
      requireStringArray(
        finding.evidence_refs,
        `finding-ledger.findings[${index}].evidence_refs`,
      ),
    );
    evidenceRefs.add(
      requireString(
        finding.source_ref,
        `finding-ledger.findings[${index}].source_ref`,
      ),
    );
    const evidenceAnchor = optionalString(
      finding.evidence_anchor,
      `finding-ledger.findings[${index}].evidence_anchor`,
    );
    if (evidenceAnchor) evidenceRefs.add(evidenceAnchor);
    facts.set(findingId, {
      lens_id: requireString(
        finding.lens_id,
        `finding-ledger.findings[${index}].lens_id`,
      ),
      evidence_refs: evidenceRefs,
    });
  }
  return facts;
}

function causalCoverageFindingIdsFrom(
  findingLedger: Record<string, unknown>,
): Set<string> {
  const causalFindingIds = new Set<string>();
  for (const [index, item] of requireArray(
    findingLedger.findings,
    "finding-ledger.findings",
  ).entries()) {
    const finding = requireRecord(item, `finding-ledger.findings[${index}]`);
    const materialityBasis = optionalMaterialityBasisRecord(
      finding.materiality_basis,
      `finding-ledger.findings[${index}].materiality_basis`,
    );
    const causalPath = optionalCausalPathRecord(
      finding.causal_path,
      `finding-ledger.findings[${index}].causal_path`,
    );
    if (materialityBasis && causalPath) {
      causalFindingIds.add(
        requireString(
          finding.finding_id,
          `finding-ledger.findings[${index}].finding_id`,
        ),
      );
    }
  }
  return causalFindingIds;
}

function causeFindingIdsFrom(findingLedger: Record<string, unknown>): Map<string, string> {
  const causeFindingIds = new Map<string, string>();
  for (const [index, item] of requireArray(
    findingLedger.findings,
    "finding-ledger.findings",
  ).entries()) {
    const finding = requireRecord(item, `finding-ledger.findings[${index}]`);
    const findingId = requireString(
      finding.finding_id,
      `finding-ledger.findings[${index}].finding_id`,
    );
    const causalPath = optionalCausalPathRecord(
      finding.causal_path,
      `finding-ledger.findings[${index}].causal_path`,
    );
    if (!causalPath) continue;
    const steps = requireArray(
      causalPath.steps,
      `finding-ledger.findings[${index}].causal_path.steps`,
    );
    for (const [stepIndex, stepItem] of steps.entries()) {
      const step = requireRecord(
        stepItem,
        `finding-ledger.findings[${index}].causal_path.steps[${stepIndex}]`,
      );
      const causeId = requireString(
        step.cause_id,
        `finding-ledger.findings[${index}].causal_path.steps[${stepIndex}].cause_id`,
      );
      const existingFindingId = causeFindingIds.get(causeId);
      if (existingFindingId) {
        throw new Error(`finding-ledger causal_path cause_id is duplicated: ${causeId}`);
      }
      causeFindingIds.set(causeId, findingId);
    }
  }
  return causeFindingIds;
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

function relationFactsFrom(
  relationGraph: Record<string, unknown>,
): Map<string, { relation: string; from_finding_id: string; to_finding_id: string }> {
  const facts = new Map<
    string,
    { relation: string; from_finding_id: string; to_finding_id: string }
  >();
  for (const [index, item] of requireArray(
    relationGraph.relations,
    "finding-relation-graph.relations",
  ).entries()) {
    const relation = requireRecord(
      item,
      `finding-relation-graph.relations[${index}]`,
    );
    const relationId = requireString(
      relation.relation_id,
      `finding-relation-graph.relations[${index}].relation_id`,
    );
    facts.set(relationId, {
      relation: requireAllowed(
        relation.relation,
        RELATION_VALUES,
        `finding-relation-graph.relations[${index}].relation`,
      ),
      from_finding_id: requireString(
        relation.from_finding_id,
        `finding-relation-graph.relations[${index}].from_finding_id`,
      ),
      to_finding_id: requireString(
        relation.to_finding_id,
        `finding-relation-graph.relations[${index}].to_finding_id`,
      ),
    });
  }
  return facts;
}

function relationGraphCoveredFindingIdsFrom(
  relationGraph: Record<string, unknown>,
): Set<string> {
  const covered = new Set<string>();
  for (const [index, item] of requireArray(
    relationGraph.relations,
    "finding-relation-graph.relations",
  ).entries()) {
    const relation = requireRecord(
      item,
      `finding-relation-graph.relations[${index}]`,
    );
    covered.add(requireString(
      relation.from_finding_id,
      `finding-relation-graph.relations[${index}].from_finding_id`,
    ));
    covered.add(requireString(
      relation.to_finding_id,
      `finding-relation-graph.relations[${index}].to_finding_id`,
    ));
  }
  for (const [index, item] of requireArray(
    relationGraph.singleton_findings,
    "finding-relation-graph.singleton_findings",
  ).entries()) {
    const singleton = requireRecord(
      item,
      `finding-relation-graph.singleton_findings[${index}]`,
    );
    covered.add(requireString(
      singleton.finding_id,
      `finding-relation-graph.singleton_findings[${index}].finding_id`,
    ));
  }
  return covered;
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

function issueSeveritiesFrom(
  issueLedger: Record<string, unknown>,
): Map<string, ReviewFindingSeverity> {
  const severities = new Map<string, ReviewFindingSeverity>();
  for (const [index, item] of requireArray(
    issueLedger.issues,
    "issue-ledger.issues",
  ).entries()) {
    const issue = requireRecord(item, `issue-ledger.issues[${index}]`);
    severities.set(
      requireString(issue.issue_id, `issue-ledger.issues[${index}].issue_id`),
      requireAllowed(
        issue.severity,
        SEVERITY_VALUES,
        `issue-ledger.issues[${index}].severity`,
      ) as ReviewFindingSeverity,
    );
  }
  return severities;
}

function issueRaisedLensIdsFrom(
  issueLedger: Record<string, unknown>,
): Map<string, Set<string>> {
  const raisedLensIds = new Map<string, Set<string>>();
  for (const [index, item] of requireArray(
    issueLedger.issues,
    "issue-ledger.issues",
  ).entries()) {
    const issue = requireRecord(item, `issue-ledger.issues[${index}]`);
    raisedLensIds.set(
      requireString(issue.issue_id, `issue-ledger.issues[${index}].issue_id`),
      new Set(
        requireStringArray(
          issue.raised_by_lens_ids,
          `issue-ledger.issues[${index}].raised_by_lens_ids`,
        ),
      ),
    );
  }
  return raisedLensIds;
}

function issueSurfaceFindingIdsFrom(
  issueLedger: Record<string, unknown>,
): Map<string, Set<string>> {
  const surfaceFindingIds = new Map<string, Set<string>>();
  for (const [index, item] of requireArray(
    issueLedger.issues,
    "issue-ledger.issues",
  ).entries()) {
    const issue = requireRecord(item, `issue-ledger.issues[${index}]`);
    surfaceFindingIds.set(
      requireString(issue.issue_id, `issue-ledger.issues[${index}].issue_id`),
      new Set(
        requireStringArray(
          issue.surface_finding_ids,
          `issue-ledger.issues[${index}].surface_finding_ids`,
        ),
      ),
    );
  }
  return surfaceFindingIds;
}

function addPathRefVariants(args: {
  refs: Set<string>;
  artifactPath: string;
  sessionRoot: string;
  projectRoot: string;
  anchor?: string;
}): void {
  const sessionRelative = toRelativePath(args.artifactPath, args.sessionRoot);
  const projectRelative = toRelativePath(args.artifactPath, args.projectRoot);
  args.refs.add(sessionRelative);
  args.refs.add(projectRelative);
  args.refs.add(path.basename(args.artifactPath));
  if (!args.anchor) return;
  args.refs.add(`${sessionRelative}#${args.anchor}`);
  args.refs.add(`${projectRelative}#${args.anchor}`);
  args.refs.add(`${path.basename(args.artifactPath)}#${args.anchor}`);
}

function lensRefVariantsByLens(
  executionPlan: ReviewExecutionPlan,
  projectRoot: string,
): Map<string, Set<string>> {
  const refsByLens = new Map<string, Set<string>>();
  for (const seat of executionPlan.lens_execution_seats) {
    const refs = refsByLens.get(seat.lens_id) ?? new Set<string>();
    addPathRefVariants({
      refs,
      artifactPath: seat.output_path,
      sessionRoot: executionPlan.session_root,
      projectRoot,
    });
    if (seat.sidecar_output_path) {
      addPathRefVariants({
        refs,
        artifactPath: seat.sidecar_output_path,
        sessionRoot: executionPlan.session_root,
        projectRoot,
      });
    }
    refsByLens.set(seat.lens_id, refs);
  }
  return refsByLens;
}

function stanceEvidenceRefsFrom(args: {
  executionPlan: ReviewExecutionPlan;
  projectRoot: string;
  issueLedger: Record<string, unknown>;
  relationGraph: Record<string, unknown>;
  findingFacts: ReadonlyMap<string, IssueArtifactFindingFact>;
  participatingLensIds: string[];
}): Map<string, Map<string, Set<string>>> {
  const lensRefsByLens = lensRefVariantsByLens(args.executionPlan, args.projectRoot);
  const issueIdsByFindingId = new Map<string, Set<string>>();
  for (const [index, item] of requireArray(
    args.issueLedger.issues,
    "issue-ledger.issues",
  ).entries()) {
    const issue = requireRecord(item, `issue-ledger.issues[${index}]`);
    const issueId = requireString(
      issue.issue_id,
      `issue-ledger.issues[${index}].issue_id`,
    );
    for (const findingId of requireStringArray(
      issue.surface_finding_ids,
      `issue-ledger.issues[${index}].surface_finding_ids`,
    )) {
      const issueIds = issueIdsByFindingId.get(findingId) ?? new Set<string>();
      issueIds.add(issueId);
      issueIdsByFindingId.set(findingId, issueIds);
    }
  }
  const lensFindingRefsByLens = new Map<string, Set<string>>();
  for (const findingFact of args.findingFacts.values()) {
    const refs = lensFindingRefsByLens.get(findingFact.lens_id) ?? new Set<string>();
    for (const evidenceRef of findingFact.evidence_refs) {
      refs.add(evidenceRef);
    }
    lensFindingRefsByLens.set(findingFact.lens_id, refs);
  }
  const relationRefsByIssueId = new Map<string, Set<string>>();
  for (const [index, item] of requireArray(
    args.relationGraph.relations,
    "finding-relation-graph.relations",
  ).entries()) {
    const relation = requireRecord(item, `finding-relation-graph.relations[${index}]`);
    const relationId = requireString(
      relation.relation_id,
      `finding-relation-graph.relations[${index}].relation_id`,
    );
    const endpointIssueIds = new Set([
      ...(issueIdsByFindingId.get(
        requireString(
          relation.from_finding_id,
          `finding-relation-graph.relations[${index}].from_finding_id`,
        ),
      ) ?? []),
      ...(issueIdsByFindingId.get(
        requireString(
          relation.to_finding_id,
          `finding-relation-graph.relations[${index}].to_finding_id`,
        ),
      ) ?? []),
    ]);
    for (const issueId of endpointIssueIds) {
      const refs = relationRefsByIssueId.get(issueId) ?? new Set<string>();
      refs.add(relationId);
      addPathRefVariants({
        refs,
        artifactPath: args.executionPlan.finding_relation_graph_path,
        sessionRoot: args.executionPlan.session_root,
        projectRoot: args.projectRoot,
        anchor: relationId,
      });
      relationRefsByIssueId.set(issueId, refs);
    }
  }
  const issueDependencyRelationRefsByIssueId = new Map<string, Set<string>>();
  for (const [index, item] of requireArray(
    args.issueLedger.issue_dependencies,
    "issue-ledger.issue_dependencies",
  ).entries()) {
    const dependency = requireRecord(
      item,
      `issue-ledger.issue_dependencies[${index}]`,
    );
    const dependencyId = requireString(
      dependency.dependency_id,
      `issue-ledger.issue_dependencies[${index}].dependency_id`,
    );
    const relationRefs = requireStringArray(
      dependency.relation_refs,
      `issue-ledger.issue_dependencies[${index}].relation_refs`,
    );
    for (const issueId of requireStringArray(
      dependency.issue_ids,
      `issue-ledger.issue_dependencies[${index}].issue_ids`,
    )) {
      const refs = issueDependencyRelationRefsByIssueId.get(issueId) ?? new Set<string>();
      addPathRefVariants({
        refs,
        artifactPath: args.executionPlan.issue_ledger_path,
        sessionRoot: args.executionPlan.session_root,
        projectRoot: args.projectRoot,
        anchor: dependencyId,
      });
      for (const relationRef of relationRefs) {
        refs.add(relationRef);
        addPathRefVariants({
          refs,
          artifactPath: args.executionPlan.finding_relation_graph_path,
          sessionRoot: args.executionPlan.session_root,
          projectRoot: args.projectRoot,
          anchor: relationRef,
        });
      }
      issueDependencyRelationRefsByIssueId.set(issueId, refs);
    }
  }
  const refsByIssueAndLens = new Map<string, Map<string, Set<string>>>();
  for (const [index, item] of requireArray(
    args.issueLedger.issues,
    "issue-ledger.issues",
  ).entries()) {
    const issue = requireRecord(item, `issue-ledger.issues[${index}]`);
    const issueId = requireString(
      issue.issue_id,
      `issue-ledger.issues[${index}].issue_id`,
    );
    const issueRefs = new Set<string>();
    addPathRefVariants({
      refs: issueRefs,
      artifactPath: args.executionPlan.issue_ledger_path,
      sessionRoot: args.executionPlan.session_root,
      projectRoot: args.projectRoot,
      anchor: issueId,
    });
    for (const evidenceRef of requireStringArray(
      issue.evidence_refs,
      `issue-ledger.issues[${index}].evidence_refs`,
    )) {
      issueRefs.add(evidenceRef);
    }
    for (const findingId of requireStringArray(
      issue.surface_finding_ids,
      `issue-ledger.issues[${index}].surface_finding_ids`,
    )) {
      addPathRefVariants({
        refs: issueRefs,
        artifactPath: args.executionPlan.finding_ledger_path,
        sessionRoot: args.executionPlan.session_root,
        projectRoot: args.projectRoot,
        anchor: findingId,
      });
      const findingFact = args.findingFacts.get(findingId);
      if (findingFact) {
        for (const evidenceRef of findingFact.evidence_refs) {
          issueRefs.add(evidenceRef);
        }
      }
    }
    for (const relationId of requireStringArray(
      issue.relation_refs,
      `issue-ledger.issues[${index}].relation_refs`,
    )) {
      addPathRefVariants({
        refs: issueRefs,
        artifactPath: args.executionPlan.finding_relation_graph_path,
        sessionRoot: args.executionPlan.session_root,
        projectRoot: args.projectRoot,
        anchor: relationId,
      });
      issueRefs.add(relationId);
    }
    for (const relationRef of issueDependencyRelationRefsByIssueId.get(issueId) ?? []) {
      issueRefs.add(relationRef);
    }
    for (const relationRef of relationRefsByIssueId.get(issueId) ?? []) {
      issueRefs.add(relationRef);
    }
    const lensRefs = new Map<string, Set<string>>();
    for (const lensId of args.participatingLensIds) {
      lensRefs.set(
        lensId,
        new Set([
          ...issueRefs,
          ...(lensRefsByLens.get(lensId) ?? []),
          ...(lensFindingRefsByLens.get(lensId) ?? []),
        ]),
      );
    }
    refsByIssueAndLens.set(issueId, lensRefs);
  }
  return refsByIssueAndLens;
}

export function validateIssueStanceResponseObject(args: {
  parsed: Record<string, unknown>;
  sessionId: string;
  lensId: string;
  participatingLensIds: string[];
  knownIssueIds: ReadonlySet<string>;
  knownStanceEvidenceRefs: StanceEvidenceRefsByIssueAndLens;
}): IssueStanceResponseArtifact {
  const schemaVersion = args.parsed.schema_version;
  if (schemaVersion !== 1) {
    throw new Error(`issue-stance response schema_version must be 1.`);
  }
  const sessionId = requireString(
    args.parsed.session_id,
    "issue-stance response session_id",
  );
  if (sessionId !== args.sessionId) {
    throw new Error(
      `issue-stance response session_id mismatch: expected ${args.sessionId}, got ${sessionId}`,
    );
  }
  const lensId = requireString(args.parsed.lens_id, "issue-stance response lens_id");
  if (lensId !== args.lensId) {
    throw new Error(
      `issue-stance response lens_id mismatch: expected ${args.lensId}, got ${lensId}`,
    );
  }
  if (!args.participatingLensIds.includes(lensId)) {
    throw new Error(`issue-stance response lens_id is not participating: ${lensId}`);
  }

  const stanceIssueIds: string[] = [];
  const stances = requireArray(
    args.parsed.stances,
    "issue-stance response stances",
  ).map((item, index) => {
    const stance = requireRecord(item, `issue-stance response stances[${index}]`);
    const issueId = requireString(
      stance.issue_id,
      `issue-stance response stances[${index}].issue_id`,
    );
    stanceIssueIds.push(issueId);
    ensureKnown(
      issueId,
      args.knownIssueIds,
      `issue-stance response stances[${index}].issue_id`,
    );
    requireAllowed(
      stance.stance,
      STANCE_VALUES,
      `issue-stance response stances[${index}].stance`,
    );
    requireString(
      stance.rationale,
      `issue-stance response stances[${index}].rationale`,
    );
    requireAllowed(
      stance.root_hypothesis_position,
      ROOT_HYPOTHESIS_POSITION_VALUES,
      `issue-stance response stances[${index}].root_hypothesis_position`,
    );
    requireAllowed(
      stance.severity_position,
      SEVERITY_POSITION_VALUES,
      `issue-stance response stances[${index}].severity_position`,
    );
    const evidenceRefs = requireStringArray(
      stance.evidence_refs,
      `issue-stance response stances[${index}].evidence_refs`,
    );
    const allowedEvidenceRefs = args.knownStanceEvidenceRefs.get(issueId)?.get(lensId);
    if (allowedEvidenceRefs) {
      for (const evidenceRef of evidenceRefs) {
        if (!allowedEvidenceRefs.has(evidenceRef)) {
          throw new Error(
            `issue-stance response for issue ${issueId} and lens ${lensId} references unsupported evidence: ${evidenceRef}`,
          );
        }
      }
    }
    return {
      issue_id: issueId,
      stance: requireString(
        stance.stance,
        `issue-stance response stances[${index}].stance`,
      ),
      rationale: requireString(
        stance.rationale,
        `issue-stance response stances[${index}].rationale`,
      ),
      root_hypothesis_position: requireString(
        stance.root_hypothesis_position,
        `issue-stance response stances[${index}].root_hypothesis_position`,
      ),
      severity_position: requireString(
        stance.severity_position,
        `issue-stance response stances[${index}].severity_position`,
      ),
      evidence_refs: evidenceRefs,
    };
  });
  ensureUnique(stanceIssueIds, "issue-stance response stances.issue_id");
  ensureExactStringSet({
    actual: new Set(stanceIssueIds),
    expected: args.knownIssueIds,
    label: "issue-stance response issue coverage",
  });
  const validation = requireRecord(
    args.parsed.validation,
    "issue-stance response validation",
  );
  const missingIssues = requireStringArray(
    validation.missing_issues,
    "issue-stance response validation.missing_issues",
  );
  if (missingIssues.length > 0) {
    throw new Error("issue-stance response validation.missing_issues must be empty.");
  }
  return {
    schema_version: 1,
    session_id: sessionId,
    lens_id: lensId,
    stances,
    validation: {
      missing_issues: missingIssues,
    },
  };
}

async function issueStanceValidationContext(args: {
  executionPlan: ReviewExecutionPlan;
  projectRoot: string;
  participatingLensIds: string[];
}): Promise<{
  findingLedger: Record<string, unknown>;
  relationGraph: Record<string, unknown>;
  issueLedger: Record<string, unknown>;
  knownIssueIds: Set<string>;
  knownStanceEvidenceRefs: Map<string, Map<string, Set<string>>>;
}> {
  const findingLedger = await readArtifact(args.executionPlan, "finding-ledger");
  validateIssueArtifactObject({
    artifactId: "finding-ledger",
    parsed: findingLedger,
    sessionId: args.executionPlan.session_id,
    participatingLensIds: args.participatingLensIds,
  });
  const relationGraph = await readArtifact(
    args.executionPlan,
    "finding-relation-graph",
  );
  validateIssueArtifactObject({
    artifactId: "finding-relation-graph",
    parsed: relationGraph,
    sessionId: args.executionPlan.session_id,
    knownFindingIds: findingIdsFrom(findingLedger),
    knownCauseFindingIds: causeFindingIdsFrom(findingLedger),
    coverageFindingIds: causalCoverageFindingIdsFrom(findingLedger),
    participatingLensIds: args.participatingLensIds,
  });
  const issueLedger = await readArtifact(args.executionPlan, "issue-ledger");
  const knownRelationFacts = relationFactsFrom(relationGraph);
  validateIssueArtifactObject({
    artifactId: "issue-ledger",
    parsed: issueLedger,
    sessionId: args.executionPlan.session_id,
    knownFindingIds: findingIdsFrom(findingLedger),
    knownFindingFacts: findingFactsFrom(findingLedger),
    knownRelationIds: relationIdsFrom(relationGraph),
    knownRelationKinds: new Map(
      Array.from(knownRelationFacts.entries()).map(([relationId, fact]) => [
        relationId,
        fact.relation,
      ]),
    ),
    knownRelationFacts,
    requiredIssueFindingIds: relationGraphCoveredFindingIdsFrom(relationGraph),
    participatingLensIds: args.participatingLensIds,
  });
  const knownIssueIds = issueIdsFrom(issueLedger);
  return {
    findingLedger,
    relationGraph,
    issueLedger,
    knownIssueIds,
    knownStanceEvidenceRefs: stanceEvidenceRefsFrom({
      executionPlan: args.executionPlan,
      projectRoot: args.projectRoot,
      issueLedger,
      relationGraph,
      findingFacts: findingFactsFrom(findingLedger),
      participatingLensIds: args.participatingLensIds,
    }),
  };
}

export async function validateIssueStanceResponseOnDisk(args: {
  executionPlan: ReviewExecutionPlan;
  projectRoot: string;
  responsePath: string;
  lensId: string;
  participatingLensIds: string[];
}): Promise<IssueStanceResponseArtifact> {
  const parsed = await readYamlDocument<Record<string, unknown>>(args.responsePath);
  const context = await issueStanceValidationContext({
    executionPlan: args.executionPlan,
    projectRoot: args.projectRoot,
    participatingLensIds: args.participatingLensIds,
  });
  return validateIssueStanceResponseObject({
    parsed,
    sessionId: args.executionPlan.session_id,
    lensId: args.lensId,
    participatingLensIds: args.participatingLensIds,
    knownIssueIds: context.knownIssueIds,
    knownStanceEvidenceRefs: context.knownStanceEvidenceRefs,
  });
}

export async function writeIssueStanceMatrixFromResponses(args: {
  executionPlan: ReviewExecutionPlan;
  projectRoot: string;
  responsePathsByLensId: ReadonlyMap<string, string>;
  participatingLensIds: string[];
  outputPath: string;
}): Promise<void> {
  const context = await issueStanceValidationContext({
    executionPlan: args.executionPlan,
    projectRoot: args.projectRoot,
    participatingLensIds: args.participatingLensIds,
  });
  const responses = new Map<string, IssueStanceResponseArtifact>();
  for (const lensId of args.participatingLensIds) {
    const responsePath = args.responsePathsByLensId.get(lensId);
    if (!responsePath) {
      throw new Error(`Missing issue stance response path for lens: ${lensId}`);
    }
    const parsed = await readYamlDocument<Record<string, unknown>>(responsePath);
    responses.set(
      lensId,
      validateIssueStanceResponseObject({
        parsed,
        sessionId: args.executionPlan.session_id,
        lensId,
        participatingLensIds: args.participatingLensIds,
        knownIssueIds: context.knownIssueIds,
        knownStanceEvidenceRefs: context.knownStanceEvidenceRefs,
      }),
    );
  }
  const issues = Array.from(context.knownIssueIds).map((issueId) => ({
    issue_id: issueId,
    stances: args.participatingLensIds.map((lensId) => {
      const response = responses.get(lensId);
      const stance = response?.stances.find(
        (candidate) => candidate.issue_id === issueId,
      );
      if (!stance) {
        throw new Error(`Missing stance for issue ${issueId} and lens ${lensId}.`);
      }
      return {
        lens_id: lensId,
        stance: stance.stance,
        rationale: stance.rationale,
        root_hypothesis_position: stance.root_hypothesis_position,
        severity_position: stance.severity_position,
        evidence_refs: stance.evidence_refs,
      };
    }),
  }));
  await writeYamlDocument(args.outputPath, {
    schema_version: 1,
    session_id: args.executionPlan.session_id,
    issues,
    validation: {
      missing_stances: [],
    },
  });
  await validateIssueArtifactOnDisk({
    executionPlan: args.executionPlan,
    projectRoot: args.projectRoot,
    artifactId: "issue-stance-matrix",
    participatingLensIds: args.participatingLensIds,
  });
}

export async function validateIssueArtifactOnDisk(args: {
  executionPlan: ReviewExecutionPlan;
  projectRoot: string;
  artifactId: ReviewIssueArtifactId;
  participatingLensIds: string[];
}): Promise<Record<string, unknown>> {
  const parsed = await readArtifact(args.executionPlan, args.artifactId);
  const findingLedger =
    args.artifactId === "finding-ledger"
      ? parsed
      : await readArtifact(args.executionPlan, "finding-ledger");
  if (args.artifactId !== "finding-ledger") {
    validateIssueArtifactObject({
      artifactId: "finding-ledger",
      parsed: findingLedger,
      sessionId: args.executionPlan.session_id,
      participatingLensIds: args.participatingLensIds,
    });
  }
  const knownFindingIds = findingIdsFrom(findingLedger);
  const knownFindingFacts = findingFactsFrom(findingLedger);
  const coverageFindingIds =
    args.artifactId === "finding-relation-graph"
      ? causalCoverageFindingIdsFrom(findingLedger)
      : null;
  const knownCauseFindingIds =
    args.artifactId === "finding-relation-graph"
      ? causeFindingIdsFrom(findingLedger)
      : undefined;
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
  const knownResolvedRelationFacts = resolvedRelationGraph
    ? relationFactsFrom(resolvedRelationGraph)
    : new Map<string, { relation: string; from_finding_id: string; to_finding_id: string }>();
  const requiredIssueFindingIds = resolvedRelationGraph
    ? relationGraphCoveredFindingIdsFrom(resolvedRelationGraph)
    : new Set<string>();
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
  const knownIssueSeverities = resolvedIssueLedger
    ? issueSeveritiesFrom(resolvedIssueLedger)
    : new Map<string, ReviewFindingSeverity>();
  const knownIssueRaisedLensIds = resolvedIssueLedger
    ? issueRaisedLensIdsFrom(resolvedIssueLedger)
    : new Map<string, Set<string>>();
  const knownIssueSurfaceFindingIds = resolvedIssueLedger
    ? issueSurfaceFindingIdsFrom(resolvedIssueLedger)
    : new Map<string, Set<string>>();
  let expectedProblemFramingContext:
    | ProblemFramingClassificationContext
    | undefined;
  let knownDomainAxisValues:
    | Map<string, Set<string>>
    | undefined;
  if (args.artifactId === "problem-framing") {
    const reviewTargetProfile = await readYamlDocument<Record<string, unknown>>(
      args.executionPlan.review_target_profile_path,
    );
    const profileRef = await resolveProblemFramingProfileRef({
      projectRoot: args.projectRoot,
      executionPlan: args.executionPlan,
    });
    expectedProblemFramingContext = problemFramingClassificationContext({
      reviewTargetProfile,
      problemFramingProfileRef: profileRef,
    });
    const profilePath = projectAbsoluteRef(args.projectRoot, profileRef);
    const profileText = profilePath
      ? await fs.readFile(profilePath, "utf8")
      : null;
    knownDomainAxisValues = domainAxisValuesFromCatalog(
      parseDomainAxisCatalog({
        profileRef,
        profileText,
      }),
    );
  }
  const knownStanceEvidenceRefs =
    resolvedIssueLedger && args.artifactId === "issue-stance-matrix"
      ? stanceEvidenceRefsFrom({
          executionPlan: args.executionPlan,
          projectRoot: args.projectRoot,
          issueLedger: resolvedIssueLedger,
          relationGraph: resolvedRelationGraph ?? { relations: [] },
          findingFacts: knownFindingFacts,
          participatingLensIds: args.participatingLensIds,
        })
      : new Map<string, Map<string, Set<string>>>();

  validateIssueArtifactObject({
    artifactId: args.artifactId,
    parsed,
    sessionId: args.executionPlan.session_id,
    knownFindingIds,
    knownFindingFacts,
    ...(coverageFindingIds !== null ? { coverageFindingIds } : {}),
    ...(knownCauseFindingIds !== undefined ? { knownCauseFindingIds } : {}),
    knownRelationIds: knownResolvedRelationIds,
    knownRelationKinds: new Map(
      Array.from(knownResolvedRelationFacts.entries()).map(([relationId, fact]) => [
        relationId,
        fact.relation,
      ]),
    ),
    knownRelationFacts: knownResolvedRelationFacts,
    requiredIssueFindingIds,
    knownIssueIds,
    knownIssueSeverities,
    knownIssueRaisedLensIds,
    knownIssueSurfaceFindingIds,
    ...(expectedProblemFramingContext !== undefined
      ? { expectedProblemFramingContext }
      : {}),
    ...(knownDomainAxisValues !== undefined ? { knownDomainAxisValues } : {}),
    knownStanceEvidenceRefs,
    participatingLensIds: args.participatingLensIds,
  });
  return parsed;
}

export async function completeIssueLedgerArtifactOnDisk(args: {
  executionPlan: ReviewExecutionPlan;
  projectRoot: string;
  participatingLensIds: string[];
  candidatePath?: string | undefined;
}): Promise<Record<string, unknown>> {
  const findingLedger = await readArtifact(args.executionPlan, "finding-ledger");
  validateIssueArtifactObject({
    artifactId: "finding-ledger",
    parsed: findingLedger,
    sessionId: args.executionPlan.session_id,
    participatingLensIds: args.participatingLensIds,
  });
  const relationGraph = await readArtifact(
    args.executionPlan,
    "finding-relation-graph",
  );
  validateIssueArtifactObject({
    artifactId: "finding-relation-graph",
    parsed: relationGraph,
    sessionId: args.executionPlan.session_id,
    knownFindingIds: findingIdsFrom(findingLedger),
    knownCauseFindingIds: causeFindingIdsFrom(findingLedger),
    coverageFindingIds: causalCoverageFindingIdsFrom(findingLedger),
    participatingLensIds: args.participatingLensIds,
  });
  const candidate =
    args.candidatePath && await fileExists(args.candidatePath)
      ? await readYamlDocument<Record<string, unknown>>(args.candidatePath)
      : null;
  const completed = completeIssueLedgerArtifactObject({
    sessionId: args.executionPlan.session_id,
    candidate,
    findingLedger,
    relationGraph,
  });
  await writeYamlDocument(args.executionPlan.issue_ledger_path, completed);
  validateIssueArtifactObject({
    artifactId: "issue-ledger",
    parsed: completed,
    sessionId: args.executionPlan.session_id,
    knownFindingIds: findingIdsFrom(findingLedger),
    knownFindingFacts: findingFactsFrom(findingLedger),
    knownRelationIds: relationIdsFrom(relationGraph),
    knownRelationKinds: new Map(
      Array.from(relationFactsFrom(relationGraph).entries()).map(
        ([relationId, fact]) => [relationId, fact.relation],
      ),
    ),
    knownRelationFacts: relationFactsFrom(relationGraph),
    requiredIssueFindingIds: relationGraphCoveredFindingIdsFrom(relationGraph),
    participatingLensIds: args.participatingLensIds,
  });
  return completed;
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
