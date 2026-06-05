import path from "node:path";
import type {
  ReviewActionCandidate,
  ReviewActionCandidateProjection,
  ReviewExecutionResultArtifact,
  ReviewFindingSeverity,
  ReviewResultClassificationSummary,
  ReviewResultIssueProjection,
} from "./artifact-types.js";
import {
  fileExists,
  readYamlDocument,
} from "./review-artifact-utils.js";

export const REVIEW_SEVERITY_ORDER: ReviewFindingSeverity[] = [
  "blocker",
  "high",
  "medium",
  "low",
  "info",
];

const REVIEW_SEVERITY_VALUES = new Set<ReviewFindingSeverity>(
  REVIEW_SEVERITY_ORDER,
);

const MATERIAL_SEVERITIES = new Set<ReviewFindingSeverity>([
  "blocker",
  "high",
  "medium",
]);

type UnknownRecord = Record<string, unknown>;

export function isReviewFindingSeverity(
  value: unknown,
): value is ReviewFindingSeverity {
  return typeof value === "string" && REVIEW_SEVERITY_VALUES.has(value as ReviewFindingSeverity);
}

export function normalizeReviewFindingSeverity(
  value: unknown,
): ReviewFindingSeverity {
  if (isReviewFindingSeverity(value)) return value;
  if (value === "critical") return "blocker";
  return "info";
}

export function isMaterialSeverity(severity: ReviewFindingSeverity): boolean {
  return MATERIAL_SEVERITIES.has(severity);
}

export function emptyReviewSeverityCounts(): Record<ReviewFindingSeverity, number> {
  return {
    blocker: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
}

function incrementSeverityCount(
  counts: Record<ReviewFindingSeverity, number>,
  severity: ReviewFindingSeverity,
): void {
  counts[severity] += 1;
}

function records(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is UnknownRecord =>
      item !== null && typeof item === "object" && !Array.isArray(item),
  );
}

function stringValue(value: unknown, defaultValue = ""): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : defaultValue;
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function readOptionalYaml<T>(filePath: string): Promise<T | null> {
  if (!(await fileExists(filePath))) return null;
  return readYamlDocument<T>(filePath);
}

function buildFindingEvidenceRefs(finding: UnknownRecord): string[] {
  const directRefs = stringArray(finding.evidence_refs);
  if (directRefs.length > 0) return unique(directRefs);

  const refs = [
    stringValue(finding.source_ref),
    stringValue(finding.evidence_anchor),
  ].filter((ref) => ref.length > 0);
  return unique(refs);
}

function defaultCandidatesForSeverity(
  severity: ReviewFindingSeverity,
): ReviewActionCandidate[] {
  switch (severity) {
    case "blocker":
      return ["fix_now"];
    case "high":
      return ["fix_before_release"];
    case "medium":
      return ["accept_risk", "follow_up"];
    case "low":
      return ["follow_up"];
    case "info":
      return ["needs_evidence"];
  }
}

function pushCandidate(
  candidates: ReviewActionCandidate[],
  candidate: ReviewActionCandidate,
): void {
  if (!candidates.includes(candidate)) candidates.push(candidate);
}

function deriveActionCandidates(args: {
  severity: ReviewFindingSeverity;
  classification: UnknownRecord | null;
  hasProblemFraming: boolean;
}): ReviewActionCandidate[] {
  const candidates: ReviewActionCandidate[] = [];
  const classification = args.classification;

  switch (classification?.timing_class) {
    case "current_blocker":
      pushCandidate(candidates, "fix_now");
      break;
    case "next_step_blocker":
      pushCandidate(candidates, "fix_before_release");
      break;
    case "planned_follow_up":
    case "defer_watch":
      pushCandidate(candidates, "follow_up");
      break;
  }

  switch (classification?.closure_class) {
    case "fix_now":
      pushCandidate(candidates, "fix_now");
      break;
    case "needs_decision":
      pushCandidate(candidates, "accept_risk");
      break;
    case "needs_evidence":
      pushCandidate(candidates, "needs_evidence");
      break;
    case "carry_forward":
    case "document_only":
    case "watch":
      pushCandidate(candidates, "follow_up");
      break;
  }

  switch (classification?.closure_obligation) {
    case "must_close_in_target":
      pushCandidate(candidates, "fix_now");
      break;
    case "must_close_before_next_stage":
      pushCandidate(candidates, "fix_before_release");
      break;
    case "may_close_during_next_stage":
    case "planned_later":
      pushCandidate(candidates, "follow_up");
      break;
    case "out_of_scope":
      pushCandidate(candidates, "out_of_scope");
      break;
  }

  switch (classification?.judgment_state) {
    case "insufficient_evidence":
      pushCandidate(candidates, "needs_evidence");
      break;
    case "outside_boundary":
      pushCandidate(candidates, "out_of_scope");
      break;
  }

  if (candidates.length > 0) return candidates;
  if (args.hasProblemFraming) return ["follow_up"];
  return defaultCandidatesForSeverity(args.severity);
}

function actionRationale(args: {
  classification: UnknownRecord | null;
  hasProblemFraming: boolean;
  severity: ReviewFindingSeverity;
  issueStatement: string;
}): string {
  const classificationRationale = stringValue(args.classification?.rationale);
  if (classificationRationale.length > 0) return classificationRationale;
  if (args.hasProblemFraming) {
    return "Problem framing is present but does not provide a more specific action rationale.";
  }
  if (args.issueStatement.length > 0) return args.issueStatement;
  return `Action candidates are derived from severity=${args.severity} because problem framing is unavailable.`;
}

function classificationMap(
  problemFraming: UnknownRecord | null,
): Map<string, UnknownRecord> {
  const map = new Map<string, UnknownRecord>();
  for (const classification of records(problemFraming?.classifications)) {
    const issueId = stringValue(classification.issue_id);
    if (issueId.length > 0) map.set(issueId, classification);
  }
  return map;
}

function findingMap(findings: UnknownRecord[]): Map<string, UnknownRecord> {
  const map = new Map<string, UnknownRecord>();
  for (const finding of findings) {
    const findingId = stringValue(finding.finding_id);
    if (findingId.length > 0) map.set(findingId, finding);
  }
  return map;
}

function evidenceRefsForIssue(
  issue: UnknownRecord,
  findingsById: Map<string, UnknownRecord>,
): string[] {
  const directRefs = stringArray(issue.evidence_refs);
  if (directRefs.length > 0) return unique(directRefs);

  const refs: string[] = [];
  for (const findingId of stringArray(issue.surface_finding_ids)) {
    const finding = findingsById.get(findingId);
    if (!finding) continue;
    refs.push(...buildFindingEvidenceRefs(finding));
  }
  return unique(refs);
}

function sourceLensIdsForIssue(
  issue: UnknownRecord,
  findingsById: Map<string, UnknownRecord>,
): string[] {
  const direct = stringArray(issue.raised_by_lens_ids);
  if (direct.length > 0) return unique(direct);
  const lensIds: string[] = [];
  for (const findingId of stringArray(issue.surface_finding_ids)) {
    const lensId = stringValue(findingsById.get(findingId)?.lens_id);
    if (lensId.length > 0) lensIds.push(lensId);
  }
  return unique(lensIds);
}

function severityCountsFor(recordsToCount: UnknownRecord[]): Record<ReviewFindingSeverity, number> {
  const counts = emptyReviewSeverityCounts();
  for (const record of recordsToCount) {
    incrementSeverityCount(counts, normalizeReviewFindingSeverity(record.severity));
  }
  return counts;
}

function highestSeverity(
  counts: Record<ReviewFindingSeverity, number>,
): ReviewFindingSeverity | null {
  return REVIEW_SEVERITY_ORDER.find((severity) => counts[severity] > 0) ?? null;
}

function sortBySeverityAndId(
  projections: ReviewResultIssueProjection[],
): ReviewResultIssueProjection[] {
  return [...projections].sort((left, right) => {
    const severityDelta =
      REVIEW_SEVERITY_ORDER.indexOf(left.severity) -
      REVIEW_SEVERITY_ORDER.indexOf(right.severity);
    if (severityDelta !== 0) return severityDelta;
    return left.issue_id.localeCompare(right.issue_id);
  });
}

function projectionFromIssue(args: {
  issue: UnknownRecord;
  findingsById: Map<string, UnknownRecord>;
  classification: UnknownRecord | null;
  hasProblemFraming: boolean;
}): ReviewResultIssueProjection {
  const severity = normalizeReviewFindingSeverity(args.issue.severity);
  const issueId = stringValue(args.issue.issue_id, "issue-unknown");
  const issueStatement = stringValue(args.issue.issue_statement);
  const affectedPurpose = stringValue(
    args.issue.affected_purpose,
    stringValue(args.classification?.problem_definition, "declared review purpose"),
  );
  const failureCondition = stringValue(
    args.issue.failure_condition,
    stringValue(args.issue.root_cause_hypothesis, issueStatement),
  );
  const impact = stringValue(
    args.issue.impact,
    stringValue(args.classification?.impact_kind, issueStatement),
  );
  const actionCandidates = deriveActionCandidates({
    severity,
    classification: args.classification,
    hasProblemFraming: args.hasProblemFraming,
  });
  const projection: ReviewResultIssueProjection = {
    issue_id: issueId,
    severity,
    material: isMaterialSeverity(severity),
    affected_purpose: affectedPurpose,
    failure_condition: failureCondition,
    impact,
    evidence_refs: evidenceRefsForIssue(args.issue, args.findingsById),
    source_lens_ids: sourceLensIdsForIssue(args.issue, args.findingsById),
    action_candidates: actionCandidates,
    rationale: actionRationale({
      classification: args.classification,
      hasProblemFraming: args.hasProblemFraming,
      severity,
      issueStatement,
    }),
  };

  const domainThresholdUsed = nullableStringValue(args.issue.domain_threshold_used);
  if (domainThresholdUsed !== null) projection.domain_threshold_used = domainThresholdUsed;
  const problemDefinition = stringValue(args.classification?.problem_definition);
  if (problemDefinition.length > 0) projection.problem_definition = problemDefinition;
  if (issueStatement.length > 0) projection.issue_statement = issueStatement;
  const timingClass = stringValue(args.classification?.timing_class);
  if (timingClass.length > 0) projection.timing_class = timingClass;
  const closureClass = stringValue(args.classification?.closure_class);
  if (closureClass.length > 0) projection.closure_class = closureClass;
  const closureObligation = stringValue(args.classification?.closure_obligation);
  if (closureObligation.length > 0) projection.closure_obligation = closureObligation;
  const judgmentState = stringValue(args.classification?.judgment_state);
  if (judgmentState.length > 0) projection.judgment_state = judgmentState;
  return projection;
}

function projectionFromFinding(finding: UnknownRecord): ReviewResultIssueProjection {
  const severity = normalizeReviewFindingSeverity(finding.severity);
  const findingId = stringValue(finding.finding_id, "finding-unknown");
  const claim = stringValue(finding.claim);
  const projection: ReviewResultIssueProjection = {
    issue_id: `finding:${findingId}`,
    severity,
    material: isMaterialSeverity(severity),
    affected_purpose: stringValue(finding.affected_purpose, "declared review purpose"),
    failure_condition: stringValue(finding.failure_condition, claim),
    impact: stringValue(
      finding.impact,
      claim.length > 0
        ? claim
        : "Finding has not yet been clustered into a root-cause issue.",
    ),
    evidence_refs: buildFindingEvidenceRefs(finding),
    source_lens_ids: stringValue(finding.lens_id).length > 0
      ? [stringValue(finding.lens_id)]
      : [],
    action_candidates: ["continue_review"],
    rationale: "Finding-level projection is available before root-cause issue classification.",
  };
  const domainThresholdUsed = nullableStringValue(finding.domain_threshold_used);
  if (domainThresholdUsed !== null) projection.domain_threshold_used = domainThresholdUsed;
  if (claim.length > 0) projection.issue_statement = claim;
  return projection;
}

function buildActionCandidateProjection(
  projection: ReviewResultIssueProjection,
  hasProblemFraming: boolean,
): ReviewActionCandidateProjection {
  const refs = projection.issue_id.startsWith("finding:")
    ? ["finding-ledger.yaml"]
    : [
        "issue-ledger.yaml",
        ...(hasProblemFraming ? ["problem-framing.yaml"] : []),
      ];
  return {
    issue_id: projection.issue_id,
    candidates: projection.action_candidates,
    derivation_refs: refs,
    rationale: projection.rationale,
  };
}

function runtimeHaltActionCandidate(
  executionResult: ReviewExecutionResultArtifact | null,
): ReviewActionCandidateProjection | null {
  if (executionResult?.execution_status !== "halted_partial") return null;
  return {
    issue_id: "runtime-halt",
    candidates: ["retry_execution", "continue_review"],
    derivation_refs: ["execution-result.yaml"],
    rationale: executionResult.halt_reason ?? "Review execution halted before completion.",
  };
}

export async function readReviewResultClassification(
  sessionRoot: string,
): Promise<ReviewResultClassificationSummary> {
  const findingLedger = await readOptionalYaml<UnknownRecord>(
    path.join(sessionRoot, "finding-ledger.yaml"),
  );
  const issueLedger = await readOptionalYaml<UnknownRecord>(
    path.join(sessionRoot, "issue-ledger.yaml"),
  );
  const problemFraming = await readOptionalYaml<UnknownRecord>(
    path.join(sessionRoot, "problem-framing.yaml"),
  );
  const executionResult = await readOptionalYaml<ReviewExecutionResultArtifact>(
    path.join(sessionRoot, "execution-result.yaml"),
  );

  const findings = records(findingLedger?.findings);
  const issues = records(issueLedger?.issues);
  const findingsById = findingMap(findings);
  const classificationsByIssueId = classificationMap(problemFraming);
  const hasProblemFraming = problemFraming !== null;
  const findingSeverityCounts = severityCountsFor(findings);
  const issueSeverityCounts = severityCountsFor(issues);
  const projectionSourceIsIssueLedger = issues.length > 0;
  const severityCounts = projectionSourceIsIssueLedger
    ? issueSeverityCounts
    : findingSeverityCounts;

  const projections = projectionSourceIsIssueLedger
    ? issues.map((issue) =>
        projectionFromIssue({
          issue,
          findingsById,
          classification: classificationsByIssueId.get(stringValue(issue.issue_id)) ?? null,
          hasProblemFraming,
        }),
      )
    : findings.map(projectionFromFinding);
  const sortedProjections = sortBySeverityAndId(projections);
  const materialIssues = sortedProjections.filter((projection) => projection.material);
  const nonMaterialFindings = sortedProjections.filter(
    (projection) => !projection.material,
  );
  const actionCandidates = sortedProjections.map((projection) =>
    buildActionCandidateProjection(projection, hasProblemFraming),
  );
  const haltActionCandidate = runtimeHaltActionCandidate(executionResult);
  if (haltActionCandidate) actionCandidates.push(haltActionCandidate);

  return {
    highest_severity: highestSeverity(severityCounts),
    finding_count: findings.length,
    issue_count: issues.length,
    finding_severity_counts: findingSeverityCounts,
    issue_severity_counts: issueSeverityCounts,
    severity_counts: severityCounts,
    material_issue_count: materialIssues.length,
    non_material_finding_count: nonMaterialFindings.length,
    material_issues: materialIssues,
    non_material_findings: nonMaterialFindings,
    action_candidates: actionCandidates,
  };
}
