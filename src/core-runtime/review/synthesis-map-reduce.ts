import fs from "node:fs/promises";
import path from "node:path";
import type {
  ReviewActionCandidate,
  ReviewExecutionPlan,
  ReviewFindingSeverity,
  ReviewResultClassificationSummary,
  ReviewResultIssueProjection,
  SharedPhenomenonSummaryEntry,
} from "./artifact-types.js";
import type {
  DeliberationResolutionArtifact,
  DeliberationResolutionIssue,
} from "./controlled-lens-deliberation.js";
import {
  dumpYamlDocument,
  isoFromTimestamp,
  readYamlDocument,
  toRelativePath,
  writeYamlDocument,
} from "./review-artifact-utils.js";
import {
  isAdmittedReviewMaterialIssue,
  isMaterialSeverity,
  REVIEW_SEVERITY_ORDER,
  readReviewResultClassification,
} from "./review-result-classification.js";

export interface ReviewSynthesisWorkItemsArtifact {
  schema_version: 1;
  session_id: string;
  created_at: string;
  source_artifact_refs: {
    finding_ledger: string;
    finding_relation_graph: string;
    issue_ledger: string;
    issue_stance_matrix: string;
    deliberation_plan: string;
    deliberation_resolution: string;
    problem_framing: string;
    review_target_profile: string;
  };
  material_issue_count: number;
  non_material_finding_count: number;
  work_items: ReviewSynthesisWorkItem[];
  non_material_findings: ReviewSynthesisNonMaterialFinding[];
  output_policy: {
    one_work_item_per_material_issue: true;
    non_material_findings_runtime_preserved: true;
    runtime_owns_ids_refs_severity_and_serialization: true;
    llm_owns_issue_explanation_only: true;
  };
}

export interface ReviewSynthesisWorkItem {
  work_item_id: string;
  issue_id: string;
  response_path: string;
  packet_path: string;
  severity: ReviewFindingSeverity;
  material: true;
  issue_statement: string;
  affected_purpose: string;
  failure_condition: string;
  impact: string;
  root_hypothesis: string;
  root_confidence: string;
  proposed_action: string;
  surface_finding_ids: string[];
  raised_by_lens_ids: string[];
  relation_refs: string[];
  related_issue_context: ReviewSynthesisRelatedIssueContext[];
  causal_path_summary: ReviewSynthesisCausalPathSummary[];
  stance_summary: ReviewSynthesisStanceSummary[];
  deliberation_resolution: ReviewSynthesisDeliberationSummary;
  problem_framing: ReviewSynthesisProblemFramingSummary | null;
  action_candidate_projection: ReviewActionCandidate[];
  boundary_note_candidates: string[];
  allowed_evidence_refs: string[];
  allowed_source_refs: string[];
}

export interface ReviewSynthesisRelatedIssueContext {
  dependency_id: string;
  dependency_kind: string;
  issue_ids: string[];
  relation_refs: string[];
  rationale: string;
}

export interface ReviewSynthesisCausalPathSummary {
  finding_id: string;
  lens_id: string;
  claim: string;
  lens_rationale_summary: string;
  causal_path: Record<string, unknown> | null;
  materiality_basis: Record<string, unknown> | null;
  evidence_refs: string[];
}

export interface ReviewSynthesisStanceSummary {
  lens_id: string;
  stance: string;
  root_hypothesis_position: string;
  severity_position: string;
  rationale: string;
  evidence_refs: string[];
}

export interface ReviewSynthesisDeliberationSummary {
  status: string;
  final_root_cause: string;
  final_claim: string;
  accepted_by_lens_ids: string[];
  remaining_disagreement_lens_ids: string[];
  reason: string;
  required_follow_up_evidence: string[];
}

export interface ReviewSynthesisProblemFramingSummary {
  problem_definition: string;
  issue_role: string;
  judgment_state: string;
  impact_kind: string;
  timing_class: string;
  closure_class: string;
  closure_obligation: string;
  domain_axes: Record<string, unknown>;
  rationale: string;
  related_surface_finding_ids: string[];
}

export interface ReviewSynthesisNonMaterialFinding {
  issue_id: string;
  severity: ReviewFindingSeverity;
  issue_statement: string;
  affected_purpose: string;
  failure_condition: string;
  impact: string;
  evidence_refs: string[];
  source_lens_ids: string[];
  action_candidates: ReviewActionCandidate[];
}

export interface IssueSynthesisResponseArtifact {
  schema_version: 1;
  session_id: string;
  work_item_id: string;
  issue_id: string;
  source_work_item_ref: string;
  conclusion: string;
  materiality_explanation: string;
  root_cause_explanation: string;
  causal_path_explanation: string;
  action_explanation: string;
  unresolved_disagreement_note: string | null;
  boundary_notes: string[];
  source_refs_used: string[];
}

export interface ReviewSynthesisLedgerArtifact {
  schema_version: 1;
  session_id: string;
  created_at: string;
  source_artifact_refs: {
    synthesis_work_items: string;
    issue_responses: string[];
    issue_ledger: string;
    problem_framing: string;
    deliberation_resolution: string;
  };
  participation: {
    material_issue_count: number;
    synthesized_issue_count: number;
    non_material_finding_count: number;
    run_status: "full" | "no_material_issues";
  };
  material_issues: ReviewSynthesisLedgerMaterialIssue[];
  non_material_findings: ReviewSynthesisNonMaterialFinding[];
  issue_dependencies: ReviewSynthesisRelatedIssueContext[];
  action_ordering: ReviewSynthesisActionOrdering[];
  boundary_notes: string[];
  shared_phenomenon_summary: SharedPhenomenonSummaryEntry[];
  final_review_result: string;
  validation: {
    missing_material_issue_ids: string[];
    duplicate_material_issue_ids: string[];
    unknown_response_issue_ids: string[];
    non_material_findings_preserved: boolean;
  };
}

export interface ReviewSynthesisLedgerMaterialIssue {
  issue_id: string;
  severity: ReviewFindingSeverity;
  issue_statement: string;
  affected_purpose: string;
  failure_condition: string;
  impact: string;
  root_hypothesis: string;
  deliberation_status: string;
  problem_framing: ReviewSynthesisProblemFramingSummary | null;
  related_surface_finding_ids: string[];
  source_lens_ids: string[];
  evidence_refs: string[];
  action_candidates: ReviewActionCandidate[];
  conclusion: string;
  materiality_explanation: string;
  root_cause_explanation: string;
  causal_path_explanation: string;
  action_explanation: string;
  unresolved_disagreement_note: string | null;
  boundary_notes: string[];
  source_refs_used: string[];
}

export interface ReviewSynthesisActionOrdering {
  issue_id: string;
  severity: ReviewFindingSeverity;
  action_candidates: ReviewActionCandidate[];
  rationale: string;
}

type UnknownRecord = Record<string, unknown>;

const SAFE_ARTIFACT_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const MAX_BOUNDARY_NOTES_PER_ISSUE = 3;
const MAX_LEDGER_BOUNDARY_NOTES = 3;
const SEVERITY_INDEX = new Map(
  REVIEW_SEVERITY_ORDER.map((severity, index) => [severity, index]),
);

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML mapping.`);
  }
  return value as UnknownRecord;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireStringOrNull(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireString(value, label);
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

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function requireSeverity(value: unknown, label: string): ReviewFindingSeverity {
  const text = requireString(value, label);
  if (!REVIEW_SEVERITY_ORDER.includes(text as ReviewFindingSeverity)) {
    throw new Error(
      `${label} has unsupported severity: ${text}. Allowed: ${REVIEW_SEVERITY_ORDER.join(", ")}`,
    );
  }
  return text as ReviewFindingSeverity;
}

function requireSafeArtifactSegment(value: string, label: string): string {
  if (!SAFE_ARTIFACT_SEGMENT_RE.test(value)) {
    throw new Error(`${label} must be a safe artifact segment: ${value}`);
  }
  return value;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function sortBySeverityAndId<T extends { severity: ReviewFindingSeverity; issue_id: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) => {
    const leftIndex = SEVERITY_INDEX.get(left.severity) ?? 999;
    const rightIndex = SEVERITY_INDEX.get(right.severity) ?? 999;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.issue_id.localeCompare(right.issue_id);
  });
}

function compactSentence(value: string, maxChars = 320): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 3).trimEnd()}...`;
}

function yamlStringListBlock(values: string[], indent = "    "): string {
  if (values.length === 0) return " []";
  return `\n${values.map((value) => `${indent}- ${value}`).join("\n")}`;
}

function yamlMissingLensListBlock(args: {
  expectedLensIds: string[];
  receivedLensIds: string[];
}): string {
  const received = new Set(args.receivedLensIds);
  const missing = args.expectedLensIds.filter((lensId) => !received.has(lensId));
  if (missing.length === 0) return " []";
  return `\n${missing
    .map((lensId) => `    - lens_id: ${lensId}\n      reason: missing`)
    .join("\n")}`;
}

function lensParticipationRunStatus(args: {
  expectedLensIds: string[];
  receivedLensIds: string[];
}): "full" | "degraded" | "insufficient" {
  if (
    args.expectedLensIds.length > 0 &&
    args.receivedLensIds.length === args.expectedLensIds.length
  ) {
    return "full";
  }
  if (
    args.receivedLensIds.length === 0 ||
    (args.receivedLensIds.length === 1 && args.receivedLensIds[0] === "axiology")
  ) {
    return "insufficient";
  }
  return "degraded";
}

function mapByStringId(
  rows: unknown,
  field: string,
  label: string,
): Map<string, UnknownRecord> {
  const map = new Map<string, UnknownRecord>();
  for (const [index, item] of requireArray(rows, label).entries()) {
    const record = requireRecord(item, `${label}[${index}]`);
    const id = requireString(record[field], `${label}[${index}].${field}`);
    if (map.has(id)) throw new Error(`${label}.${field} contains duplicate id: ${id}`);
    map.set(id, record);
  }
  return map;
}

function recordsByIssueId(
  artifact: UnknownRecord,
  rowsField: string,
  label: string,
): Map<string, UnknownRecord> {
  return mapByStringId(artifact[rowsField], "issue_id", `${label}.${rowsField}`);
}

export function synthesisRootPath(sessionRoot: string): string {
  return path.join(sessionRoot, "synthesis");
}

export function synthesisResponsesRootPath(sessionRoot: string): string {
  return path.join(synthesisRootPath(sessionRoot), "responses");
}

export function synthesisWorkItemsPath(sessionRoot: string): string {
  return path.join(sessionRoot, "synthesis-work-items.yaml");
}

export function synthesisLedgerPath(sessionRoot: string): string {
  return path.join(sessionRoot, "synthesis-ledger.yaml");
}

export function issueSynthesisResponsePath(args: {
  sessionRoot: string;
  issueId: string;
}): string {
  const issueId = requireSafeArtifactSegment(args.issueId, "issue_id");
  return path.join(synthesisResponsesRootPath(args.sessionRoot), `${issueId}.yaml`);
}

export function issueSynthesisPromptPacketPath(args: {
  promptPacketsRoot: string;
  issueId: string;
}): string {
  const issueId = requireSafeArtifactSegment(args.issueId, "issue_id");
  return path.join(args.promptPacketsRoot, "synthesis", `${issueId}.prompt.md`);
}

function issueDependenciesFor(
  issueLedger: UnknownRecord,
  issueId: string,
): ReviewSynthesisRelatedIssueContext[] {
  return requireArray(
    issueLedger.issue_dependencies,
    "issue-ledger.issue_dependencies",
  ).flatMap((item, index) => {
    const dependency = requireRecord(
      item,
      `issue-ledger.issue_dependencies[${index}]`,
    );
    const issueIds = requireStringArray(
      dependency.issue_ids,
      `issue-ledger.issue_dependencies[${index}].issue_ids`,
    );
    if (!issueIds.includes(issueId)) return [];
    return [{
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
    }];
  });
}

function causalPathSummariesFor(
  findingLedger: UnknownRecord,
  findingIds: string[],
): ReviewSynthesisCausalPathSummary[] {
  const findingIdSet = new Set(findingIds);
  return requireArray(findingLedger.findings, "finding-ledger.findings")
    .flatMap((item, index) => {
      const finding = requireRecord(item, `finding-ledger.findings[${index}]`);
      const findingId = requireString(
        finding.finding_id,
        `finding-ledger.findings[${index}].finding_id`,
      );
      if (!findingIdSet.has(findingId)) return [];
      return [{
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
        causal_path:
          finding.causal_path === null || finding.causal_path === undefined
            ? null
            : requireRecord(
                finding.causal_path,
                `finding-ledger.findings[${index}].causal_path`,
              ),
        materiality_basis:
          finding.materiality_basis === null || finding.materiality_basis === undefined
            ? null
            : requireRecord(
                finding.materiality_basis,
                `finding-ledger.findings[${index}].materiality_basis`,
              ),
        evidence_refs: requireStringArray(
          finding.evidence_refs,
          `finding-ledger.findings[${index}].evidence_refs`,
        ),
      }];
    });
}

function stanceSummariesFor(
  issueStanceMatrix: UnknownRecord,
  issueId: string,
): ReviewSynthesisStanceSummary[] {
  const issue = recordsByIssueId(
    issueStanceMatrix,
    "issues",
    "issue-stance-matrix",
  ).get(issueId);
  if (!issue) return [];
  return requireArray(
    issue.stances,
    `issue-stance-matrix.issues.${issueId}.stances`,
  ).map((item, index) => {
    const stance = requireRecord(
      item,
      `issue-stance-matrix.issues.${issueId}.stances[${index}]`,
    );
    return {
      lens_id: requireString(
        stance.lens_id,
        `issue-stance-matrix.issues.${issueId}.stances[${index}].lens_id`,
      ),
      stance: requireString(
        stance.stance,
        `issue-stance-matrix.issues.${issueId}.stances[${index}].stance`,
      ),
      root_hypothesis_position: requireString(
        stance.root_hypothesis_position,
        `issue-stance-matrix.issues.${issueId}.stances[${index}].root_hypothesis_position`,
      ),
      severity_position: requireString(
        stance.severity_position,
        `issue-stance-matrix.issues.${issueId}.stances[${index}].severity_position`,
      ),
      rationale: requireString(
        stance.rationale,
        `issue-stance-matrix.issues.${issueId}.stances[${index}].rationale`,
      ),
      evidence_refs: requireStringArray(
        stance.evidence_refs,
        `issue-stance-matrix.issues.${issueId}.stances[${index}].evidence_refs`,
      ),
    };
  });
}

function deliberationSummaryFor(
  resolutionByIssueId: ReadonlyMap<string, DeliberationResolutionIssue>,
  issueId: string,
): ReviewSynthesisDeliberationSummary {
  const resolution = resolutionByIssueId.get(issueId);
  if (!resolution) {
    throw new Error(`deliberation-resolution.yaml missing issue: ${issueId}`);
  }
  return {
    status: resolution.status,
    final_root_cause: resolution.final_root_cause,
    final_claim: resolution.final_claim,
    accepted_by_lens_ids: resolution.accepted_by_lens_ids,
    remaining_disagreement_lens_ids: resolution.remaining_disagreement_lens_ids,
    reason: resolution.reason,
    required_follow_up_evidence: resolution.required_follow_up_evidence,
  };
}

function problemFramingSummaryFor(
  problemFramingByIssueId: ReadonlyMap<string, UnknownRecord>,
  issueId: string,
): ReviewSynthesisProblemFramingSummary | null {
  const classification = problemFramingByIssueId.get(issueId);
  if (!classification) return null;
  return {
    problem_definition: requireString(
      classification.problem_definition,
      `problem-framing.classifications.${issueId}.problem_definition`,
    ),
    issue_role: requireString(
      classification.issue_role,
      `problem-framing.classifications.${issueId}.issue_role`,
    ),
    judgment_state: requireString(
      classification.judgment_state,
      `problem-framing.classifications.${issueId}.judgment_state`,
    ),
    impact_kind: requireString(
      classification.impact_kind,
      `problem-framing.classifications.${issueId}.impact_kind`,
    ),
    timing_class: requireString(
      classification.timing_class,
      `problem-framing.classifications.${issueId}.timing_class`,
    ),
    closure_class: requireString(
      classification.closure_class,
      `problem-framing.classifications.${issueId}.closure_class`,
    ),
    closure_obligation: requireString(
      classification.closure_obligation,
      `problem-framing.classifications.${issueId}.closure_obligation`,
    ),
    domain_axes: requireRecord(
      classification.domain_axes,
      `problem-framing.classifications.${issueId}.domain_axes`,
    ),
    rationale: requireString(
      classification.rationale,
      `problem-framing.classifications.${issueId}.rationale`,
    ),
    related_surface_finding_ids: requireStringArray(
      classification.related_surface_finding_ids,
      `problem-framing.classifications.${issueId}.related_surface_finding_ids`,
    ),
  };
}

function boundaryNoteCandidatesFor(
  projection: ReviewResultIssueProjection,
): string[] {
  if (projection.material) return [];
  const basis =
    projection.problem_definition ??
    projection.failure_condition ??
    projection.impact ??
    projection.rationale;
  return [`${projection.issue_id} evidence gap: ${compactSentence(basis)}`];
}

function allowedEvidenceRefsFor(args: {
  issue: UnknownRecord;
  causalSummaries: ReviewSynthesisCausalPathSummary[];
  stanceSummaries: ReviewSynthesisStanceSummary[];
  deliberationSummary: ReviewSynthesisDeliberationSummary;
  relatedIssueContext: ReviewSynthesisRelatedIssueContext[];
  executionPlan: ReviewExecutionPlan;
  projectRoot: string;
}): string[] {
  const refs = new Set<string>();
  for (const ref of requireStringArray(args.issue.evidence_refs, "issue.evidence_refs")) {
    refs.add(ref);
  }
  for (const findingId of requireStringArray(
    args.issue.surface_finding_ids,
    "issue.surface_finding_ids",
  )) {
    refs.add(`finding-ledger.yaml#${findingId}`);
  }
  for (const relationRef of requireStringArray(
    args.issue.relation_refs,
    "issue.relation_refs",
  )) {
    refs.add(relationRef);
    refs.add(`finding-relation-graph.yaml#${relationRef}`);
  }
  for (const summary of args.causalSummaries) {
    refs.add(`finding-ledger.yaml#${summary.finding_id}`);
    for (const ref of summary.evidence_refs) refs.add(ref);
    if (summary.causal_path) {
      for (const step of requireArray(
        summary.causal_path.steps,
        `finding-ledger.${summary.finding_id}.causal_path.steps`,
      )) {
        const stepRecord = requireRecord(
          step,
          `finding-ledger.${summary.finding_id}.causal_path.steps[]`,
        );
        refs.add(
          requireString(
            stepRecord.cause_id,
            `finding-ledger.${summary.finding_id}.causal_path.steps[].cause_id`,
          ),
        );
        for (const ref of requireStringArray(
          stepRecord.evidence_refs,
          `finding-ledger.${summary.finding_id}.causal_path.steps[].evidence_refs`,
        )) {
          refs.add(ref);
        }
      }
    }
  }
  for (const stance of args.stanceSummaries) {
    refs.add(`issue-stance-matrix.yaml#stances.${requireString(args.issue.issue_id, "issue.issue_id")}.${stance.lens_id}`);
    for (const ref of stance.evidence_refs) refs.add(ref);
  }
  for (const ref of args.deliberationSummary.required_follow_up_evidence) refs.add(ref);
  for (const dependency of args.relatedIssueContext) {
    refs.add(`issue-ledger.yaml#${dependency.dependency_id}`);
    for (const ref of dependency.relation_refs) refs.add(ref);
  }
  refs.add(toRelativePath(args.executionPlan.issue_ledger_path, args.projectRoot));
  refs.add(toRelativePath(args.executionPlan.problem_framing_path, args.projectRoot));
  return unique([...refs]);
}

function allowedSourceRefsFor(args: {
  issue: UnknownRecord;
  causalSummaries: ReviewSynthesisCausalPathSummary[];
  stanceSummaries: ReviewSynthesisStanceSummary[];
  relatedIssueContext: ReviewSynthesisRelatedIssueContext[];
}): string[] {
  const issueId = requireString(args.issue.issue_id, "issue.issue_id");
  const refs = new Set<string>();
  refs.add(`issue-ledger.yaml#${issueId}`);
  refs.add(`problem-framing.yaml#${issueId}`);
  refs.add(`deliberation-resolution.yaml#${issueId}`);
  for (const findingId of requireStringArray(
    args.issue.surface_finding_ids,
    "issue.surface_finding_ids",
  )) {
    refs.add(`finding-ledger.yaml#${findingId}`);
  }
  for (const relationRef of requireStringArray(
    args.issue.relation_refs,
    "issue.relation_refs",
  )) {
    refs.add(`finding-relation-graph.yaml#${relationRef}`);
  }
  for (const summary of args.causalSummaries) {
    refs.add(`finding-ledger.yaml#${summary.finding_id}`);
  }
  for (const stance of args.stanceSummaries) {
    refs.add(`issue-stance-matrix.yaml#stances.${issueId}.${stance.lens_id}`);
  }
  for (const dependency of args.relatedIssueContext) {
    refs.add(`issue-ledger.yaml#${dependency.dependency_id}`);
    for (const relationRef of dependency.relation_refs) {
      refs.add(`finding-relation-graph.yaml#${relationRef}`);
    }
  }
  return unique([...refs]);
}

function nonMaterialFindingFromProjection(
  projection: ReviewResultIssueProjection,
): ReviewSynthesisNonMaterialFinding {
  return {
    issue_id: projection.issue_id,
    severity: projection.severity,
    issue_statement:
      projection.issue_statement ??
      projection.problem_definition ??
      projection.failure_condition,
    affected_purpose: projection.affected_purpose,
    failure_condition: projection.failure_condition,
    impact: projection.impact,
    evidence_refs: projection.evidence_refs,
    source_lens_ids: projection.source_lens_ids,
    action_candidates: projection.action_candidates,
  };
}

export function buildReviewSynthesisWorkItemsArtifact(args: {
  projectRoot: string;
  executionPlan: ReviewExecutionPlan;
  findingLedger: UnknownRecord;
  relationGraph: UnknownRecord;
  issueLedger: UnknownRecord;
  issueStanceMatrix: UnknownRecord;
  deliberationPlan: UnknownRecord;
  deliberationResolution: DeliberationResolutionArtifact;
  problemFraming: UnknownRecord;
  classificationSummary: ReviewResultClassificationSummary;
  createdAt?: string;
}): ReviewSynthesisWorkItemsArtifact {
  const sessionId = requireString(args.issueLedger.session_id, "issue-ledger.session_id");
  if (sessionId !== args.executionPlan.session_id) {
    throw new Error(`issue-ledger session_id mismatch for synthesis: ${sessionId}`);
  }
  const issuesById = recordsByIssueId(args.issueLedger, "issues", "issue-ledger");
  const problemFramingByIssueId = recordsByIssueId(
    args.problemFraming,
    "classifications",
    "problem-framing",
  );
  const resolutionByIssueId = new Map(
    args.deliberationResolution.issues.map((issue) => [issue.issue_id, issue]),
  );
  const actionCandidatesByIssueId = new Map(
    args.classificationSummary.action_candidates.map((candidate) => [
      candidate.issue_id,
      candidate.candidates,
    ]),
  );

  const workItems = sortBySeverityAndId(args.classificationSummary.material_issues)
    .map((projection): ReviewSynthesisWorkItem => {
      const issue = issuesById.get(projection.issue_id);
      if (!issue) {
        throw new Error(`synthesis material issue missing issue-ledger row: ${projection.issue_id}`);
      }
      const severity = requireSeverity(
        issue.severity,
        `issue-ledger.issues.${projection.issue_id}.severity`,
      );
      if (!isMaterialSeverity(severity)) {
        throw new Error(
          `synthesis work item issue must be material, got ${projection.issue_id} severity=${severity}`,
        );
      }
      if (
        !isAdmittedReviewMaterialIssue(severity, {
          issue_role: projection.issue_role,
          judgment_state: projection.judgment_state,
          closure_class: projection.closure_class,
          closure_obligation: projection.closure_obligation,
        })
      ) {
        throw new Error(
          `synthesis work item issue failed material admission: ${projection.issue_id}`,
        );
      }
      const surfaceFindingIds = requireStringArray(
        issue.surface_finding_ids,
        `issue-ledger.issues.${projection.issue_id}.surface_finding_ids`,
      );
      const causalSummaries = causalPathSummariesFor(
        args.findingLedger,
        surfaceFindingIds,
      );
      const stanceSummaries = stanceSummariesFor(
        args.issueStanceMatrix,
        projection.issue_id,
      );
      const deliberationSummary = deliberationSummaryFor(
        resolutionByIssueId,
        projection.issue_id,
      );
      const relatedIssueContext = issueDependenciesFor(
        args.issueLedger,
        projection.issue_id,
      );
      const workItemId = `synthesis:${projection.issue_id}`;
      const responsePath = issueSynthesisResponsePath({
        sessionRoot: args.executionPlan.session_root,
        issueId: projection.issue_id,
      });
      return {
        work_item_id: workItemId,
        issue_id: projection.issue_id,
        response_path: responsePath,
        packet_path: issueSynthesisPromptPacketPath({
          promptPacketsRoot: args.executionPlan.prompt_packets_root,
          issueId: projection.issue_id,
        }),
        severity,
        material: true,
        issue_statement: requireString(
          issue.issue_statement,
          `issue-ledger.issues.${projection.issue_id}.issue_statement`,
        ),
        affected_purpose: requireString(
          issue.affected_purpose,
          `issue-ledger.issues.${projection.issue_id}.affected_purpose`,
        ),
        failure_condition: requireString(
          issue.failure_condition,
          `issue-ledger.issues.${projection.issue_id}.failure_condition`,
        ),
        impact: requireString(
          issue.impact,
          `issue-ledger.issues.${projection.issue_id}.impact`,
        ),
        root_hypothesis: requireString(
          issue.root_cause_hypothesis,
          `issue-ledger.issues.${projection.issue_id}.root_cause_hypothesis`,
        ),
        root_confidence: requireString(
          issue.root_confidence,
          `issue-ledger.issues.${projection.issue_id}.root_confidence`,
        ),
        proposed_action: requireString(
          issue.proposed_action,
          `issue-ledger.issues.${projection.issue_id}.proposed_action`,
        ),
        surface_finding_ids: surfaceFindingIds,
        raised_by_lens_ids: requireStringArray(
          issue.raised_by_lens_ids,
          `issue-ledger.issues.${projection.issue_id}.raised_by_lens_ids`,
        ),
        relation_refs: requireStringArray(
          issue.relation_refs,
          `issue-ledger.issues.${projection.issue_id}.relation_refs`,
        ),
        related_issue_context: relatedIssueContext,
        causal_path_summary: causalSummaries,
        stance_summary: stanceSummaries,
        deliberation_resolution: deliberationSummary,
        problem_framing: problemFramingSummaryFor(
          problemFramingByIssueId,
          projection.issue_id,
        ),
        action_candidate_projection:
          actionCandidatesByIssueId.get(projection.issue_id) ??
          projection.action_candidates,
        boundary_note_candidates: boundaryNoteCandidatesFor(projection),
        allowed_evidence_refs: allowedEvidenceRefsFor({
          issue,
          causalSummaries,
          stanceSummaries,
          deliberationSummary,
          relatedIssueContext,
          executionPlan: args.executionPlan,
          projectRoot: args.projectRoot,
        }),
        allowed_source_refs: allowedSourceRefsFor({
          issue,
          causalSummaries,
          stanceSummaries,
          relatedIssueContext,
        }),
      };
    });

  return {
    schema_version: 1,
    session_id: sessionId,
    created_at: args.createdAt ?? isoFromTimestamp(Date.now()),
    source_artifact_refs: {
      finding_ledger: toRelativePath(args.executionPlan.finding_ledger_path, args.projectRoot),
      finding_relation_graph: toRelativePath(
        args.executionPlan.finding_relation_graph_path,
        args.projectRoot,
      ),
      issue_ledger: toRelativePath(args.executionPlan.issue_ledger_path, args.projectRoot),
      issue_stance_matrix: toRelativePath(
        args.executionPlan.issue_stance_matrix_path,
        args.projectRoot,
      ),
      deliberation_plan: toRelativePath(
        args.executionPlan.deliberation_plan_path,
        args.projectRoot,
      ),
      deliberation_resolution: toRelativePath(
        path.join(args.executionPlan.session_root, "deliberation-resolution.yaml"),
        args.projectRoot,
      ),
      problem_framing: toRelativePath(
        args.executionPlan.problem_framing_path,
        args.projectRoot,
      ),
      review_target_profile: toRelativePath(
        args.executionPlan.review_target_profile_path,
        args.projectRoot,
      ),
    },
    material_issue_count: workItems.length,
    non_material_finding_count: args.classificationSummary.non_material_findings.length,
    work_items: workItems,
    non_material_findings: sortBySeverityAndId(
      args.classificationSummary.non_material_findings,
    ).map(nonMaterialFindingFromProjection),
    output_policy: {
      one_work_item_per_material_issue: true,
      non_material_findings_runtime_preserved: true,
      runtime_owns_ids_refs_severity_and_serialization: true,
      llm_owns_issue_explanation_only: true,
    },
  };
}

export function renderIssueSynthesisPrompt(args: {
  sessionId: string;
  projectRoot: string;
  workItem: ReviewSynthesisWorkItem;
  workItemsPath: string;
  boundaryContext?: string;
}): string {
  const outputRef = toRelativePath(args.workItem.response_path, args.projectRoot);
  return `# Issue-Scoped Review Synthesis Prompt

session_id: ${args.sessionId}
unit_id: ${args.workItem.work_item_id}
unit_kind: synthesize
issue_id: ${args.workItem.issue_id}
output_path: ${outputRef}

## Canonical Role
You are the issue-scoped synthesis worker for one material review issue.
You do not group findings, classify severity, decide materiality, or resolve deliberation.
Those decisions already belong to upstream runtime artifacts.

## Hard Output Contract
- Submit the response by calling \`submit_issue_synthesis_response\` exactly once when the executor provides runtime submit tools.
- Do not handwrite YAML, markdown fences, or commentary as the durable output.
- Runtime owns \`schema_version\`, \`session_id\`, \`work_item_id\`, \`issue_id\`, \`source_work_item_ref\`, and YAML serialization.
- Do not change issue id, severity, materiality, problem framing, closure, domain axes, source refs, or deliberation status.
- Use only \`allowed_source_refs\` for \`source_refs_used\`.
- Treat \`allowed_evidence_refs\` as semantic evidence context, not writable source refs.
- Keep \`boundary_notes\` to at most ${MAX_BOUNDARY_NOTES_PER_ISSUE} one-sentence notes.

## Runtime Work Item
\`\`\`yaml
${dumpYamlDocument(args.workItem)}
\`\`\`

## Source Work Items Ref
${toRelativePath(args.workItemsPath, args.projectRoot)}

## Task
Explain this material issue clearly and actionably.
Preserve the upstream issue truth:
- why this is material
- what root cause starts the causal chain
- how the causal path supports the issue
- what deliberation accepted, narrowed, or left unresolved
- what action is required and why

Do not introduce a new issue or a new source ref.

## Runtime-Written YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
work_item_id: "${args.workItem.work_item_id}"
issue_id: "${args.workItem.issue_id}"
source_work_item_ref: "synthesis-work-items.yaml#${args.workItem.work_item_id}"
conclusion: "plain conclusion for this issue"
materiality_explanation: "why this weakens the declared purpose"
root_cause_explanation: "why the root cause is the starting point of the problem"
causal_path_explanation: "how the causal path leads to the observed issue"
action_explanation: "what to do and what dependency/ordering matters"
unresolved_disagreement_note: null
boundary_notes: []
source_refs_used:
  - "one allowed_source_refs value actually used"
${args.boundaryContext ? `\n${args.boundaryContext.trim()}\n` : ""}`;
}

export function validateIssueSynthesisResponseObject(args: {
  parsed: unknown;
  sessionId: string;
  workItem: ReviewSynthesisWorkItem;
  sourceWorkItemsRef: string;
}): IssueSynthesisResponseArtifact {
  const artifact = requireRecord(args.parsed, "issue synthesis response");
  if (artifact.schema_version !== 1) {
    throw new Error("issue synthesis response schema_version must be 1.");
  }
  const sessionId = requireString(artifact.session_id, "issue synthesis response.session_id");
  if (sessionId !== args.sessionId) {
    throw new Error(`issue synthesis response session_id mismatch: ${sessionId}`);
  }
  const workItemId = requireString(
    artifact.work_item_id,
    "issue synthesis response.work_item_id",
  );
  if (workItemId !== args.workItem.work_item_id) {
    throw new Error(
      `issue synthesis response work_item_id mismatch: ${workItemId}`,
    );
  }
  const issueId = requireString(artifact.issue_id, "issue synthesis response.issue_id");
  if (issueId !== args.workItem.issue_id) {
    throw new Error(`issue synthesis response issue_id mismatch: ${issueId}`);
  }
  const sourceWorkItemRef = requireString(
    artifact.source_work_item_ref,
    "issue synthesis response.source_work_item_ref",
  );
  if (sourceWorkItemRef !== args.sourceWorkItemsRef) {
    throw new Error(
      `issue synthesis response source_work_item_ref must be ${args.sourceWorkItemsRef}, got ${sourceWorkItemRef}`,
    );
  }
  const boundaryNotes = requireStringArray(
    artifact.boundary_notes,
    "issue synthesis response.boundary_notes",
  );
  if (boundaryNotes.length > MAX_BOUNDARY_NOTES_PER_ISSUE) {
    throw new Error(
      `issue synthesis response boundary_notes must contain at most ${MAX_BOUNDARY_NOTES_PER_ISSUE} notes.`,
    );
  }
  const allowedRefs = new Set(args.workItem.allowed_source_refs);
  allowedRefs.add(args.sourceWorkItemsRef);
  const sourceRefsUsed = requireStringArray(
    artifact.source_refs_used,
    "issue synthesis response.source_refs_used",
  );
  if (args.workItem.allowed_source_refs.length === 0) {
    throw new Error(
      `issue synthesis response cannot be validated because work item ${args.workItem.work_item_id} has no allowed source refs.`,
    );
  }
  for (const ref of sourceRefsUsed) {
    if (!allowedRefs.has(ref)) {
      throw new Error(
        `issue synthesis response source_refs_used contains unsupported ref: ${ref}`,
      );
    }
  }
  if (!sourceRefsUsed.some((ref) => args.workItem.allowed_source_refs.includes(ref))) {
    throw new Error(
      "issue synthesis response.source_refs_used must include at least one allowed source ref.",
    );
  }
  return {
    schema_version: 1,
    session_id: sessionId,
    work_item_id: workItemId,
    issue_id: issueId,
    source_work_item_ref: sourceWorkItemRef,
    conclusion: requireString(artifact.conclusion, "issue synthesis response.conclusion"),
    materiality_explanation: requireString(
      artifact.materiality_explanation,
      "issue synthesis response.materiality_explanation",
    ),
    root_cause_explanation: requireString(
      artifact.root_cause_explanation,
      "issue synthesis response.root_cause_explanation",
    ),
    causal_path_explanation: requireString(
      artifact.causal_path_explanation,
      "issue synthesis response.causal_path_explanation",
    ),
    action_explanation: requireString(
      artifact.action_explanation,
      "issue synthesis response.action_explanation",
    ),
    unresolved_disagreement_note: requireStringOrNull(
      artifact.unresolved_disagreement_note,
      "issue synthesis response.unresolved_disagreement_note",
    ),
    boundary_notes: boundaryNotes,
    source_refs_used: sourceRefsUsed,
  };
}

export async function validateIssueSynthesisResponseOnDisk(args: {
  responsePath: string;
  sessionId: string;
  workItem: ReviewSynthesisWorkItem;
  sourceWorkItemsRef: string;
}): Promise<IssueSynthesisResponseArtifact> {
  return validateIssueSynthesisResponseObject({
    parsed: await readYamlDocument<Record<string, unknown>>(args.responsePath),
    sessionId: args.sessionId,
    workItem: args.workItem,
    sourceWorkItemsRef: args.sourceWorkItemsRef,
  });
}

function responseByIssueId(
  responses: IssueSynthesisResponseArtifact[],
): Map<string, IssueSynthesisResponseArtifact[]> {
  const map = new Map<string, IssueSynthesisResponseArtifact[]>();
  for (const response of responses) {
    map.set(response.issue_id, [...(map.get(response.issue_id) ?? []), response]);
  }
  return map;
}

function finalReviewResultFor(ledger: Omit<ReviewSynthesisLedgerArtifact, "final_review_result">): string {
  if (ledger.material_issues.length === 0) {
    return "No material issue was identified within the bounded review artifacts. Non-material findings are preserved for follow-up or watch decisions.";
  }
  const highest = ledger.material_issues[0]!;
  return [
    `${ledger.material_issues.length} material issue(s) require attention.`,
    `Highest-priority issue: ${highest.issue_id} (${highest.severity}) — ${highest.conclusion}`,
    highest.unresolved_disagreement_note
      ? `Unresolved disagreement remains: ${highest.unresolved_disagreement_note}`
      : "Controlled deliberation did not leave a blocking unresolved disagreement for the highest-priority issue.",
  ].join(" ");
}

export function buildReviewSynthesisLedger(args: {
  projectRoot: string;
  executionPlan: ReviewExecutionPlan;
  workItemsPath: string;
  workItems: ReviewSynthesisWorkItemsArtifact;
  responses: IssueSynthesisResponseArtifact[];
  createdAt?: string;
}): ReviewSynthesisLedgerArtifact {
  const responsesByIssueId = responseByIssueId(args.responses);
  const knownIssueIds = new Set(args.workItems.work_items.map((item) => item.issue_id));
  const missing = args.workItems.work_items
    .map((item) => item.issue_id)
    .filter((issueId) => !responsesByIssueId.has(issueId));
  const duplicates = [...responsesByIssueId.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([issueId]) => issueId);
  const unknown = [...responsesByIssueId.keys()].filter(
    (issueId) => !knownIssueIds.has(issueId),
  );
  if (missing.length > 0 || duplicates.length > 0 || unknown.length > 0) {
    throw new Error(
      `synthesis-ledger coverage failed. Missing=${missing.join(", ") || "(none)"}; duplicates=${duplicates.join(", ") || "(none)"}; unknown=${unknown.join(", ") || "(none)"}.`,
    );
  }

  const materialIssues = sortBySeverityAndId(
    args.workItems.work_items.map((workItem): ReviewSynthesisLedgerMaterialIssue => {
      const response = responsesByIssueId.get(workItem.issue_id)?.[0];
      if (!response) {
        throw new Error(`missing issue synthesis response: ${workItem.issue_id}`);
      }
      return {
        issue_id: workItem.issue_id,
        severity: workItem.severity,
        issue_statement: workItem.issue_statement,
        affected_purpose: workItem.affected_purpose,
        failure_condition: workItem.failure_condition,
        impact: workItem.impact,
        root_hypothesis: workItem.root_hypothesis,
        deliberation_status: workItem.deliberation_resolution.status,
        problem_framing: workItem.problem_framing,
        related_surface_finding_ids: workItem.surface_finding_ids,
        source_lens_ids: workItem.raised_by_lens_ids,
        evidence_refs: workItem.allowed_evidence_refs,
        action_candidates: workItem.action_candidate_projection,
        conclusion: response.conclusion,
        materiality_explanation: response.materiality_explanation,
        root_cause_explanation: response.root_cause_explanation,
        causal_path_explanation: response.causal_path_explanation,
        action_explanation: response.action_explanation,
        unresolved_disagreement_note: response.unresolved_disagreement_note,
        boundary_notes: response.boundary_notes,
        source_refs_used: response.source_refs_used,
      };
    }),
  );
  const issueDependenciesById = new Map<string, ReviewSynthesisRelatedIssueContext>();
  for (const workItem of args.workItems.work_items) {
    for (const dependency of workItem.related_issue_context) {
      issueDependenciesById.set(dependency.dependency_id, dependency);
    }
  }
  const boundaryNotes = unique(
    materialIssues.flatMap((issue) => issue.boundary_notes),
  ).slice(0, MAX_LEDGER_BOUNDARY_NOTES);
  const partialLedger = {
    schema_version: 1 as const,
    session_id: args.workItems.session_id,
    created_at: args.createdAt ?? isoFromTimestamp(Date.now()),
    source_artifact_refs: {
      synthesis_work_items: toRelativePath(args.workItemsPath, args.projectRoot),
      issue_responses: args.responses.map((response) =>
        toRelativePath(
          issueSynthesisResponsePath({
            sessionRoot: args.executionPlan.session_root,
            issueId: response.issue_id,
          }),
          args.projectRoot,
        ),
      ),
      issue_ledger: args.workItems.source_artifact_refs.issue_ledger,
      problem_framing: args.workItems.source_artifact_refs.problem_framing,
      deliberation_resolution:
        args.workItems.source_artifact_refs.deliberation_resolution,
    },
    participation: {
      material_issue_count: args.workItems.material_issue_count,
      synthesized_issue_count: materialIssues.length,
      non_material_finding_count: args.workItems.non_material_finding_count,
      run_status:
        args.workItems.material_issue_count === 0
          ? "no_material_issues" as const
          : "full" as const,
    },
    material_issues: materialIssues,
    non_material_findings: args.workItems.non_material_findings,
    issue_dependencies: [...issueDependenciesById.values()],
    action_ordering: materialIssues.map((issue) => ({
      issue_id: issue.issue_id,
      severity: issue.severity,
      action_candidates: issue.action_candidates,
      rationale: issue.action_explanation,
    })),
    boundary_notes: boundaryNotes,
    shared_phenomenon_summary: [],
    validation: {
      missing_material_issue_ids: [],
      duplicate_material_issue_ids: [],
      unknown_response_issue_ids: [],
      non_material_findings_preserved: true,
    },
  };
  return {
    ...partialLedger,
    final_review_result: finalReviewResultFor(partialLedger),
  };
}

export function renderSynthesisMarkdownFromLedger(
  ledger: ReviewSynthesisLedgerArtifact,
  participation?: {
    expectedLensIds?: string[];
    receivedLensIds?: string[];
  },
): string {
  const lensIds = unique(
    ledger.material_issues.flatMap((issue) => issue.source_lens_ids),
  );
  const expectedLensIds = participation?.expectedLensIds ?? lensIds;
  const receivedLensIds = participation?.receivedLensIds ?? lensIds;
  const runStatus = lensParticipationRunStatus({
    expectedLensIds,
    receivedLensIds,
  });
  const materialIssueLines = ledger.material_issues.length === 0
    ? "- none"
    : ledger.material_issues.map((issue) =>
        [
          `- ${issue.issue_id} (${issue.severity}): ${issue.conclusion}`,
          `  - root cause: ${issue.root_hypothesis}`,
          `  - materiality: ${issue.materiality_explanation}`,
          `  - action: ${issue.action_explanation}`,
          issue.unresolved_disagreement_note
            ? `  - unresolved disagreement: ${issue.unresolved_disagreement_note}`
            : null,
        ].filter((line): line is string => line !== null).join("\n"),
      ).join("\n");
  const nonMaterialLines = ledger.non_material_findings.length === 0
    ? "- none"
    : ledger.non_material_findings.map((finding) =>
        `- ${finding.issue_id} (${finding.severity}): ${finding.issue_statement}`,
      ).join("\n");
  const disagreementLines = ledger.material_issues
    .filter((issue) => issue.unresolved_disagreement_note)
    .map((issue) => `- ${issue.issue_id}: ${issue.unresolved_disagreement_note}`);
  const actionLines = ledger.action_ordering.length === 0
    ? "- none"
    : ledger.action_ordering.map((action) =>
        `- ${action.issue_id} (${action.severity}): ${action.action_candidates.join(", ") || "none"}`,
      ).join("\n");
  const boundaryLines = ledger.boundary_notes.length === 0
    ? "- none"
    : ledger.boundary_notes.map((note) => `- ${note}`).join("\n");
  const sharedPhenomenonLines = ledger.shared_phenomenon_summary.length === 0
    ? "- none"
    : ledger.shared_phenomenon_summary.map((entry) =>
        [
          `- target: ${entry.target}`,
          `  - evidence_anchor: ${entry.evidence_anchor}`,
          `  - participating_lens_ids: ${entry.participating_lens_ids.join(", ")}`,
          `  - claim_relation: ${entry.claim_relation}`,
        ].join("\n"),
      ).join("\n");

  return `---
deliberation_status: performed
participation:
  expected_lenses:${yamlStringListBlock(expectedLensIds)}
  received_lenses:${yamlStringListBlock(receivedLensIds)}
  missing_or_failed_lenses:${yamlMissingLensListBlock({
    expectedLensIds,
    receivedLensIds,
  })}
  run_status: ${runStatus}
  synthesis_run_status: ${ledger.participation.run_status}
---
# Synthesize

## Consensus
${materialIssueLines}

## Conditional Consensus
- See material issue entries whose problem framing or deliberation status is narrowed or unresolved.

## Disagreement
${disagreementLines.length > 0 ? disagreementLines.join("\n") : "- none"}

## Deliberation Decision
${ledger.material_issues.map((issue) => `- ${issue.issue_id}: ${issue.deliberation_status}`).join("\n") || "- none"}

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
${ledger.material_issues.length > 0
  ? ledger.material_issues.map((issue) => `- ${issue.issue_id}: ${issue.affected_purpose}`).join("\n")
  : "- bounded review did not identify a material purpose-weakening issue"}

## Final Review Result
${ledger.final_review_result}

## Boundary Notes
${boundaryLines}

## Immediate Actions Required
${actionLines}

## Recommendations
${nonMaterialLines}

## Unique Finding Tagging
${nonMaterialLines}

## Shared Phenomenon Summary
${sharedPhenomenonLines}
`;
}

export async function writeSynthesisMarkdownFromLedger(args: {
  ledger: ReviewSynthesisLedgerArtifact;
  outputPath: string;
  expectedLensIds?: string[];
  receivedLensIds?: string[];
}): Promise<void> {
  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  const participation = {
    ...(args.expectedLensIds !== undefined
      ? { expectedLensIds: args.expectedLensIds }
      : {}),
    ...(args.receivedLensIds !== undefined
      ? { receivedLensIds: args.receivedLensIds }
      : {}),
  };
  await fs.writeFile(
    args.outputPath,
    renderSynthesisMarkdownFromLedger(args.ledger, participation).trimEnd() + "\n",
    "utf8",
  );
}

export async function writeReviewSynthesisWorkItems(args: {
  projectRoot: string;
  executionPlan: ReviewExecutionPlan;
  findingLedger: UnknownRecord;
  relationGraph: UnknownRecord;
  issueLedger: UnknownRecord;
  issueStanceMatrix: UnknownRecord;
  deliberationPlan: UnknownRecord;
  deliberationResolution: DeliberationResolutionArtifact;
  problemFraming: UnknownRecord;
}): Promise<ReviewSynthesisWorkItemsArtifact> {
  const classificationSummary = await readReviewResultClassification(
    args.executionPlan.session_root,
  );
  const artifact = buildReviewSynthesisWorkItemsArtifact({
    ...args,
    classificationSummary,
  });
  await writeYamlDocument(synthesisWorkItemsPath(args.executionPlan.session_root), artifact);
  return artifact;
}

export async function writeReviewSynthesisLedger(args: {
  projectRoot: string;
  executionPlan: ReviewExecutionPlan;
  workItems: ReviewSynthesisWorkItemsArtifact;
  responses: IssueSynthesisResponseArtifact[];
}): Promise<ReviewSynthesisLedgerArtifact> {
  const workItemsRef = synthesisWorkItemsPath(args.executionPlan.session_root);
  const ledger = buildReviewSynthesisLedger({
    projectRoot: args.projectRoot,
    executionPlan: args.executionPlan,
    workItemsPath: workItemsRef,
    workItems: args.workItems,
    responses: args.responses,
  });
  await writeYamlDocument(synthesisLedgerPath(args.executionPlan.session_root), ledger);
  return ledger;
}
