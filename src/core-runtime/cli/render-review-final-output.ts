#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type {
  InvocationBindingArtifact,
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewResultClassificationSummary,
  ReviewResultIssueProjection,
  ReviewSessionMetadata,
  ReviewTerminalExecutionStatus,
} from "../review/artifact-types.js";
import type {
  ReviewSynthesisLedgerArtifact,
  ReviewSynthesisLensPositionSummary,
} from "../review/synthesis-map-reduce.js";
import {
  fileExists,
  readYamlDocument,
  toRelativePath,
} from "../review/review-artifact-utils.js";
import { readReviewResultClassification } from "../review/review-result-classification.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";
import { assertPathInsideRoot } from "../path-boundary.js";

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

/**
 * Terminal statuses only — final output renders a finished run, so a mid-run
 * `running` artifact must be rejected here rather than rendered as a result. The
 * type binding keeps this set from drifting out of the artifact vocabulary.
 */
const REVIEW_EXECUTION_STATUSES = new Set<ReviewTerminalExecutionStatus>([
  "completed",
  "completed_with_degradation",
  "halted_partial",
]);

const REVIEW_EXECUTION_REALIZATIONS = new Set(["worker", "direct-call"]);
const REVIEW_HOST_RUNTIMES = new Set([
  "codex",
  "anthropic",
  "openai",
  "grok",
  "lmstudio",
  "standalone",
]);
const REVIEW_MODES = new Set(["core-axis", "full"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireArtifactString(
  artifact: Record<string, unknown>,
  field: string,
  artifactPath: string,
): string {
  const value = artifact[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Malformed execution result artifact: ${artifactPath}: ${field} must be a non-empty string.`,
    );
  }
  return value;
}

function requireArtifactNumber(
  artifact: Record<string, unknown>,
  field: string,
  artifactPath: string,
): number {
  const value = artifact[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Malformed execution result artifact: ${artifactPath}: ${field} must be a non-negative number.`,
    );
  }
  return value;
}

function requireArtifactBoolean(
  artifact: Record<string, unknown>,
  field: string,
  artifactPath: string,
): boolean {
  const value = artifact[field];
  if (typeof value !== "boolean") {
    throw new Error(
      `Malformed execution result artifact: ${artifactPath}: ${field} must be a boolean.`,
    );
  }
  return value;
}

function requireArtifactStringArray(
  artifact: Record<string, unknown>,
  field: string,
  artifactPath: string,
): string[] {
  const value = artifact[field];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(
      `Malformed execution result artifact: ${artifactPath}: ${field} must be a string list.`,
    );
  }
  return value;
}

function requireArtifactEnum(
  artifact: Record<string, unknown>,
  field: string,
  allowedValues: ReadonlySet<string>,
  artifactPath: string,
): string {
  const value = requireArtifactString(artifact, field, artifactPath);
  if (!allowedValues.has(value)) {
    throw new Error(
      `Malformed execution result artifact: ${artifactPath}: ${field} has unsupported value ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function validateReviewRetryPolicy(
  value: unknown,
  artifactPath: string,
): void {
  if (!isRecord(value)) {
    throw new Error(
      `Malformed execution result artifact: ${artifactPath}: retry_policy must be a YAML mapping.`,
    );
  }
  for (const field of [
    "lens_max_retries",
    "issue_artifact_max_retries",
    "deliberation_max_retries",
    "synthesis_max_retries",
    "retry_initial_delay_ms",
  ]) {
    requireArtifactNumber(value, field, artifactPath);
  }
}

function validateReviewExecutionResultArtifact(
  value: unknown,
  artifactPath: string,
): ReviewExecutionResultArtifact {
  if (!isRecord(value)) {
    throw new Error(
      `Malformed execution result artifact: ${artifactPath}: root must be a YAML mapping.`,
    );
  }
  requireArtifactString(value, "session_id", artifactPath);
  requireArtifactString(value, "session_root", artifactPath);
  requireArtifactEnum(
    value,
    "execution_realization",
    REVIEW_EXECUTION_REALIZATIONS,
    artifactPath,
  );
  requireArtifactEnum(value, "host_runtime", REVIEW_HOST_RUNTIMES, artifactPath);
  requireArtifactEnum(value, "review_mode", REVIEW_MODES, artifactPath);
  requireArtifactEnum(
    value,
    "execution_status",
    REVIEW_EXECUTION_STATUSES,
    artifactPath,
  );
  requireArtifactString(value, "execution_started_at", artifactPath);
  requireArtifactString(value, "execution_completed_at", artifactPath);
  requireArtifactNumber(value, "total_duration_ms", artifactPath);
  requireArtifactNumber(value, "max_concurrent_lenses", artifactPath);
  if (value.observed_dispatch_width !== undefined) {
    requireArtifactNumber(value, "observed_dispatch_width", artifactPath);
  }
  validateReviewRetryPolicy(value.retry_policy, artifactPath);
  requireArtifactStringArray(value, "planned_lens_ids", artifactPath);
  requireArtifactStringArray(value, "participating_lens_ids", artifactPath);
  requireArtifactStringArray(value, "degraded_lens_ids", artifactPath);
  requireArtifactStringArray(value, "excluded_lens_ids", artifactPath);
  requireArtifactNumber(value, "executed_lens_count", artifactPath);
  requireArtifactBoolean(value, "synthesis_executed", artifactPath);
  requireArtifactString(value, "error_log_path", artifactPath);
  if (!Array.isArray(value.lens_execution_results)) {
    throw new Error(
      `Malformed execution result artifact: ${artifactPath}: lens_execution_results must be a list.`,
    );
  }
  if (value.synthesis_executed === true && !isRecord(value.synthesize_execution_result)) {
    throw new Error(
      `Malformed execution result artifact: ${artifactPath}: synthesize_execution_result must be present when synthesis_executed=true.`,
    );
  }
  return value as unknown as ReviewExecutionResultArtifact;
}

const EMPTY_BOUNDARY_NOTE_PATTERN =
  /^(?:[-*]\s*)?(?:none|n\/a|not applicable|no boundary notes|no boundary limitations|없음)[.!。]?\s*$/iu;

const BOUNDARY_EVIDENCE_PATTERN =
  /(evidence gap|insufficient\b.{0,120}\bevidence|cannot\b.{0,80}\b(?:determine|decide|classify|confirm)|outside\b.{0,80}\bboundary|boundary-authorized|scope limitation|caller|public api|external consumer|external reference)/iu;

const BOUNDARY_SPECIFIC_PATTERN =
  /(lensid|orphan|unused|dead field|export(?:ed)?|caller|public api|external consumer|external reference)/iu;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function stripMarkdownListMarker(value: string): string {
  return value.replace(/^\s*(?:[-*]|\d+[.)])\s+/u, "").trim();
}

function stripTrailingSentencePunctuation(value: string): string {
  return value.replace(/[.!。]+$/u, "").trim();
}

function compactSentence(value: string, maxChars = 280): string {
  const sentence = compactWhitespace(stripMarkdownListMarker(value));
  if (sentence.length <= maxChars) return sentence;
  return `${sentence.slice(0, maxChars - 3).trimEnd()}...`;
}

function sourceBoundaryNotesAreSubstantive(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return !trimmed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .every((line) => EMPTY_BOUNDARY_NOTE_PATTERN.test(line));
}

function boundedBulletLinesFromText(value: string): string[] {
  const lines = value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !EMPTY_BOUNDARY_NOTE_PATTERN.test(line));
  const bulletLines = lines
    .filter((line) => /^[-*]\s+\S/u.test(line))
    .map((line) => `- ${compactSentence(line)}`);
  if (bulletLines.length > 0) return bulletLines.slice(0, 3);

  const sentenceCandidates = compactWhitespace(value)
    .split(/(?<=[.!。])\s+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !EMPTY_BOUNDARY_NOTE_PATTERN.test(line));
  return sentenceCandidates
    .slice(0, 3)
    .map((line) => `- ${compactSentence(line)}`);
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }
  return unique;
}

function boundaryNoteFromProjection(
  projection: ReviewResultIssueProjection,
): string {
  const basis = [
    projection.problem_definition,
    projection.issue_statement,
    projection.failure_condition,
    projection.impact,
    projection.rationale,
  ].filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  return `- ${projection.issue_id} evidence gap: ${compactSentence(basis, 560)}`;
}

export function extractBoundaryEvidenceNotesFromLensText(args: {
  lensId: string;
  text: string;
}): string[] {
  const lines = args.text
    .split(/\r?\n/u)
    .map((line) => compactWhitespace(line))
    .filter((line) => line.length > 0);
  const candidates = lines.filter(
    (line) =>
      BOUNDARY_EVIDENCE_PATTERN.test(line) &&
      BOUNDARY_SPECIFIC_PATTERN.test(line),
  );
  return candidates.slice(0, 2).map((line) => {
    const compact = stripTrailingSentencePunctuation(compactSentence(line, 320));
    const lower = compact.toLowerCase();
    const needsCallerApi =
      !lower.includes("caller") &&
      !lower.includes("public api") &&
      (lower.includes("orphan") || lower.includes("export"));
    const suffix = needsCallerApi
      ? "; orphan/caller/API evidence is outside the current boundary"
      : "";
    return `- ${args.lensId} evidence gap: ${compact}${suffix}.`;
  });
}

async function deriveLensBoundaryEvidenceNotes(args: {
  projectRoot: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan | null;
  executionResult: ReviewExecutionResultArtifact | null;
}): Promise<string[]> {
  const seats = args.executionPlan?.lens_execution_seats ?? [];
  if (seats.length === 0) return [];
  const completedResultByLensId = new Map(
    (args.executionResult?.lens_execution_results ?? [])
      .filter((result) => result.status === "completed")
      .map((result) => [result.unit_id, result]),
  );
  const notes: string[] = [];
  for (const seat of seats) {
    const result = completedResultByLensId.get(seat.lens_id);
    if (args.executionResult && !result) continue;
    const rawOutputPath = result?.output_path ?? seat.output_path;
    const outputPathCandidates = path.isAbsolute(rawOutputPath)
      ? [path.resolve(rawOutputPath)]
      : [
          path.resolve(args.sessionRoot, rawOutputPath),
          path.resolve(args.projectRoot, rawOutputPath),
        ];
    let outputPath = outputPathCandidates[0];
    for (const candidate of outputPathCandidates) {
      if (await fileExists(candidate)) {
        outputPath = candidate;
        break;
      }
    }
    if (!outputPath) continue;
    try {
      await assertPathInsideRoot({
        root: args.sessionRoot,
        candidate: outputPath,
        label: `lens boundary note source ${seat.lens_id}`,
      });
      const text = await fs.readFile(outputPath, "utf8");
      notes.push(
        ...extractBoundaryEvidenceNotesFromLensText({
          lensId: seat.lens_id,
          text,
        }),
      );
    } catch {
      // Missing lens files are reported elsewhere; boundary-note projection is best effort.
    }
    if (notes.length >= 3) break;
  }
  return uniqueLines(notes).slice(0, 3);
}

export function renderBoundaryNotesForFinalOutput(args: {
  sourceBoundaryNotes: string;
  classificationSummary: ReviewResultClassificationSummary;
  lensBoundaryEvidenceNotes: string[];
}): string {
  const sourceLines = sourceBoundaryNotesAreSubstantive(args.sourceBoundaryNotes)
    ? boundedBulletLinesFromText(args.sourceBoundaryNotes)
    : [];
  const projectedLines = [
    ...args.classificationSummary.non_material_findings
      .slice(0, 3)
      .map(boundaryNoteFromProjection),
    ...args.lensBoundaryEvidenceNotes,
  ];
  const combinedLines = uniqueLines([...sourceLines, ...projectedLines]).slice(0, 3);
  return combinedLines.length > 0
    ? combinedLines.join("\n")
    : "- none";
}

function renderLensFindingsRefs(
  executionPlan: ReviewExecutionPlan | null,
  executionResult: ReviewExecutionResultArtifact | null,
  projectRoot: string,
): string {
  const seats = executionPlan?.lens_execution_seats;
  if (!seats || seats.length === 0) {
    return "- lens output references unavailable";
  }
  const resultByLensId = new Map(
    (executionResult?.lens_execution_results ?? []).map((result) => [
      result.unit_id,
      result,
    ]),
  );
  const degradedSet = new Set(executionResult?.degraded_lens_ids ?? []);
  return seats
    .map((seat) => {
      const result = resultByLensId.get(seat.lens_id);
      const outputPath =
        result?.output_path ?? seat.sidecar_output_path ?? seat.output_path;
      const relativePath = toRelativePath(outputPath, projectRoot);
      const marker = degradedSet.has(seat.lens_id) ? " (degraded)" : "";
      return `- ${seat.lens_id}: \`${relativePath}\`${marker}`;
    })
    .join("\n");
}

function renderTargetSummary(
  bindingArtifact: InvocationBindingArtifact,
  projectRoot: string,
): string {
  return bindingArtifact.resolved_target_scope.resolved_refs
    .map((resolvedRef) => `- \`${toRelativePath(resolvedRef, projectRoot)}\``)
    .join("\n");
}

function renderDomainSelectionNotes(
  bindingArtifact: InvocationBindingArtifact,
): string {
  const notes = bindingArtifact.binding_notes ?? [];
  return notes.length > 0
    ? notes.map((note) => `- ${note}`).join("\n")
    : "- none";
}

function renderConsensusHeading(
  participatingLensCount: number,
  plannedLensCount: number,
  reviewMode: string,
): string {
  if (reviewMode === "full") {
    return `### Consensus (${participatingLensCount}/${plannedLensCount})`;
  }
  if (reviewMode === "core-axis") {
    return `### Consensus (${participatingLensCount}/${plannedLensCount}, core-axis mode)`;
  }
  return `### Consensus (${participatingLensCount}/${plannedLensCount}, ${reviewMode} mode)`;
}

function renderSeverityCounts(
  summary: ReviewResultClassificationSummary,
): string {
  return [
    `blocker=${summary.severity_counts.blocker}`,
    `high=${summary.severity_counts.high}`,
    `medium=${summary.severity_counts.medium}`,
    `low=${summary.severity_counts.low}`,
    `info=${summary.severity_counts.info}`,
  ].join(", ");
}

function renderRefs(refs: string[]): string {
  return refs.length > 0 ? refs.map((ref) => `\`${ref}\``).join(", ") : "none";
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function requireLedgerStringArray(
  value: unknown,
  label: string,
): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be a string list.`);
  }
  return value;
}

function requireLedgerNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return value;
}

function requireLensPositionSummary(
  summary: unknown,
  issueId: string,
): ReviewSynthesisLensPositionSummary {
  const label = `synthesis-ledger.material_issues.${issueId}.lens_position_summary`;
  if (!isRecord(summary)) {
    throw new Error(`${label} must be a YAML mapping.`);
  }
  if (!isRecord(summary.stance_buckets)) {
    throw new Error(`${label}.stance_buckets must be a YAML mapping.`);
  }
  if (!isRecord(summary.resolution_acceptance)) {
    throw new Error(`${label}.resolution_acceptance must be a YAML mapping.`);
  }
  return {
    issue_stance_lens_count: requireLedgerNumber(
      summary.issue_stance_lens_count,
      `${label}.issue_stance_lens_count`,
    ),
    raised_by_lens_ids: requireLedgerStringArray(
      summary.raised_by_lens_ids,
      `${label}.raised_by_lens_ids`,
    ),
    stance_buckets: {
      support: requireLedgerStringArray(
        summary.stance_buckets.support,
        `${label}.stance_buckets.support`,
      ),
      narrow: requireLedgerStringArray(
        summary.stance_buckets.narrow,
        `${label}.stance_buckets.narrow`,
      ),
      oppose: requireLedgerStringArray(
        summary.stance_buckets.oppose,
        `${label}.stance_buckets.oppose`,
      ),
      alternative_root: requireLedgerStringArray(
        summary.stance_buckets.alternative_root,
        `${label}.stance_buckets.alternative_root`,
      ),
      surface_only: requireLedgerStringArray(
        summary.stance_buckets.surface_only,
        `${label}.stance_buckets.surface_only`,
      ),
      not_applicable: requireLedgerStringArray(
        summary.stance_buckets.not_applicable,
        `${label}.stance_buckets.not_applicable`,
      ),
      insufficient_evidence: requireLedgerStringArray(
        summary.stance_buckets.insufficient_evidence,
        `${label}.stance_buckets.insufficient_evidence`,
      ),
    },
    resolution_acceptance: {
      deliberation_participating_lens_ids: requireLedgerStringArray(
        summary.resolution_acceptance.deliberation_participating_lens_ids,
        `${label}.resolution_acceptance.deliberation_participating_lens_ids`,
      ),
      accepted_by_lens_ids: requireLedgerStringArray(
        summary.resolution_acceptance.accepted_by_lens_ids,
        `${label}.resolution_acceptance.accepted_by_lens_ids`,
      ),
      remaining_disagreement_lens_ids: requireLedgerStringArray(
        summary.resolution_acceptance.remaining_disagreement_lens_ids,
        `${label}.resolution_acceptance.remaining_disagreement_lens_ids`,
      ),
    },
  };
}

function renderLensPositionSummary(
  rawSummary: unknown,
  issueId: string,
): string[] {
  const summary = requireLensPositionSummary(rawSummary, issueId);
  const agreedOrNarrowed = [
    ...summary.stance_buckets.support,
    ...summary.stance_buckets.narrow,
  ];
  const disagreeing = [
    ...summary.stance_buckets.oppose,
    ...summary.stance_buckets.alternative_root,
    ...summary.stance_buckets.surface_only,
  ];
  const participantCount =
    summary.resolution_acceptance.deliberation_participating_lens_ids.length;
  return [
    `  - issue stance agreement: ${agreedOrNarrowed.length}/${summary.issue_stance_lens_count}`,
    `  - agreed or narrowed lenses: ${listOrNone(agreedOrNarrowed)}`,
    `  - issue stance disagreement: ${disagreeing.length}/${summary.issue_stance_lens_count}`,
    `  - disagreeing stance lenses: ${listOrNone(disagreeing)}`,
    `  - not applicable lenses: ${listOrNone(summary.stance_buckets.not_applicable)}`,
    `  - insufficient evidence lenses: ${listOrNone(summary.stance_buckets.insufficient_evidence)}`,
    `  - resolution accepted by: ${summary.resolution_acceptance.accepted_by_lens_ids.length}/${participantCount} deliberation participants`,
    `  - accepted lenses: ${listOrNone(summary.resolution_acceptance.accepted_by_lens_ids)}`,
    `  - remaining disagreement: ${summary.resolution_acceptance.remaining_disagreement_lens_ids.length}/${participantCount} deliberation participants`,
    `  - remaining disagreement lenses: ${listOrNone(summary.resolution_acceptance.remaining_disagreement_lens_ids)}`,
    `  - raised by lenses: ${listOrNone(summary.raised_by_lens_ids)}`,
  ];
}

function renderIssueProjection(
  projection: ReviewResultIssueProjection,
): string {
  const lines = [
    `- ${projection.issue_id} (${projection.severity})`,
    `  - affected purpose: ${projection.affected_purpose}`,
    `  - failure condition: ${projection.failure_condition}`,
    `  - impact: ${projection.impact}`,
    `  - evidence: ${renderRefs(projection.evidence_refs)}`,
    `  - source lenses: ${projection.source_lens_ids.join(", ") || "none"}`,
    `  - action candidates: ${projection.action_candidates.join(", ") || "none"}`,
  ];
  if (projection.problem_definition) {
    lines.push(`  - problem definition: ${projection.problem_definition}`);
  }
  if (projection.timing_class || projection.closure_class) {
    lines.push(
      `  - problem framing: ${[
        projection.issue_role,
        projection.timing_class,
        projection.closure_class,
        projection.closure_obligation,
        projection.judgment_state,
      ].filter((value): value is string => typeof value === "string").join(" / ")}`,
    );
  }
  if (projection.domain_threshold_used) {
    lines.push(`  - domain threshold: ${projection.domain_threshold_used}`);
  }
  return lines.join("\n");
}

function renderIssueProjectionList(
  projections: ReviewResultIssueProjection[],
): string {
  if (projections.length === 0) return "- none";
  return projections.map(renderIssueProjection).join("\n\n");
}

function renderActionCandidates(
  summary: ReviewResultClassificationSummary,
): string {
  if (summary.action_candidates.length === 0) return "- none";
  return summary.action_candidates
    .map((candidate) =>
      [
        `- ${candidate.issue_id}: ${candidate.candidates.join(", ") || "none"}`,
        `  - rationale: ${candidate.rationale}`,
        `  - derivation refs: ${renderRefs(candidate.derivation_refs)}`,
      ].join("\n"),
    )
    .join("\n");
}

function renderLedgerMaterialIssues(
  ledger: ReviewSynthesisLedgerArtifact | null,
): string {
  if (!ledger) return "";
  if (ledger.material_issues.length === 0) return "- none";
  return ledger.material_issues
    .map((issue) =>
      [
        `- ${issue.issue_id} (${issue.severity}): ${issue.conclusion}`,
        ...renderLensPositionSummary(issue.lens_position_summary, issue.issue_id),
        `  - issue statement: ${issue.issue_statement}`,
        `  - affected purpose: ${issue.affected_purpose}`,
        `  - failure condition: ${issue.failure_condition}`,
        `  - impact: ${issue.impact}`,
        `  - root hypothesis: ${issue.root_hypothesis}`,
        `  - evidence: ${renderRefs(issue.evidence_refs)}`,
        `  - source lenses: ${listOrNone(issue.source_lens_ids)}`,
        `  - action candidates: ${listOrNone(issue.action_candidates)}`,
        `  - materiality: ${issue.materiality_explanation}`,
        `  - root cause: ${issue.root_cause_explanation}`,
        `  - causal path: ${issue.causal_path_explanation}`,
        `  - action: ${issue.action_explanation}`,
        issue.unresolved_disagreement_note
          ? `  - unresolved disagreement: ${issue.unresolved_disagreement_note}`
          : null,
      ].filter((line): line is string => line !== null).join("\n"),
    )
    .join("\n\n");
}

function renderLedgerConditionalConsensus(
  ledger: ReviewSynthesisLedgerArtifact | null,
): string {
  if (!ledger) return "";
  const conditionalIssues = ledger.material_issues.filter(
    (issue) =>
      issue.unresolved_disagreement_note ||
      issue.deliberation_status !== "resolved",
  );
  if (conditionalIssues.length === 0) return "- none";
  return conditionalIssues
    .map((issue) =>
      [
        `- ${issue.issue_id} (${issue.deliberation_status}): ${issue.conclusion}`,
        issue.unresolved_disagreement_note
          ? `  - unresolved disagreement: ${issue.unresolved_disagreement_note}`
          : null,
      ].filter((line): line is string => line !== null).join("\n"),
    )
    .join("\n");
}

function renderLedgerActions(ledger: ReviewSynthesisLedgerArtifact | null): string {
  if (!ledger) return "";
  if (ledger.action_ordering.length === 0) return "- none";
  const issueById = new Map(
    ledger.material_issues.map((issue) => [issue.issue_id, issue]),
  );
  return ledger.action_ordering
    .map((action) => {
      const issue = issueById.get(action.issue_id);
      return [
        `- ${action.issue_id} (${action.severity})`,
        issue ? `  - issue: ${issue.conclusion}` : null,
        issue ? `  - target: ${issue.issue_statement}` : null,
        issue ? `  - failure condition: ${issue.failure_condition}` : null,
        `  - candidates: ${action.action_candidates.join(", ") || "none"}`,
        `  - rationale: ${action.rationale}`,
        issue ? `  - remediation: ${issue.action_explanation}` : null,
        issue
          ? "  - verification: verify the remediation against the failure condition with a focused check before closing"
          : null,
      ].filter((line): line is string => line !== null).join("\n");
    })
    .join("\n");
}

function renderLedgerBoundaryNotes(
  ledger: ReviewSynthesisLedgerArtifact | null,
): string {
  if (!ledger) return "";
  return ledger.boundary_notes.length > 0
    ? ledger.boundary_notes.map((note) => `- ${note}`).join("\n")
    : "- none";
}

function renderLedgerNonMaterialFindings(
  ledger: ReviewSynthesisLedgerArtifact | null,
): string {
  if (!ledger) return "";
  if (ledger.non_material_findings.length === 0) return "- none";
  return ledger.non_material_findings
    .map((finding) => `- ${finding.issue_id} (${finding.severity}): ${finding.issue_statement}`)
    .join("\n");
}

function renderLedgerDisagreement(
  ledger: ReviewSynthesisLedgerArtifact | null,
): string {
  if (!ledger) return "";
  const notes = ledger.material_issues
    .filter((issue) => issue.unresolved_disagreement_note)
    .map((issue) => `- ${issue.issue_id}: ${issue.unresolved_disagreement_note}`);
  return notes.length > 0 ? notes.join("\n") : "- none";
}

function renderLedgerAxiologyPerspectives(
  ledger: ReviewSynthesisLedgerArtifact | null,
): string {
  if (!ledger) return "";
  const axiologyLines = [
    ...ledger.material_issues
      .filter((issue) => issue.source_lens_ids.includes("axiology"))
      .map((issue) => `- ${issue.issue_id} (${issue.severity}): ${issue.conclusion}`),
    ...ledger.non_material_findings
      .filter((finding) => finding.source_lens_ids.includes("axiology"))
      .map((finding) => `- ${finding.issue_id} (${finding.severity}): ${finding.issue_statement}`),
  ];
  return axiologyLines.length > 0 ? axiologyLines.join("\n") : "- none";
}

function renderLedgerPurposeAlignment(
  ledger: ReviewSynthesisLedgerArtifact | null,
): string {
  if (!ledger) return "";
  if (ledger.material_issues.length === 0) {
    return "- bounded review did not identify a material purpose-weakening issue";
  }
  return ledger.material_issues
    .map((issue) => `- ${issue.issue_id}: ${issue.affected_purpose}`)
    .join("\n");
}

export async function runRenderReviewFinalOutputCli(
  argv: string[],
): Promise<number> {
  const { values } = parseArgs({
    options: {
      "project-root": { type: "string", default: "." },
      "session-root": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
    args: argv,
  });

  const projectRoot = path.resolve(requireString(values["project-root"], "project-root"));
  const sessionRoot = path.resolve(requireString(values["session-root"], "session-root"));

  const bindingPath = path.join(sessionRoot, "binding.yaml");
  const sessionMetadataPath = path.join(sessionRoot, "session-metadata.yaml");
  const synthesisPath = path.join(sessionRoot, "synthesis.md");
  const synthesisLedgerPath = path.join(sessionRoot, "synthesis-ledger.yaml");
  const deliberationPath = path.join(sessionRoot, "deliberation.md");
  const finalOutputPath = path.join(sessionRoot, "final-output.md");

  if (!(await fileExists(bindingPath))) {
    throw new Error(`Missing binding artifact: ${bindingPath}`);
  }
  if (!(await fileExists(sessionMetadataPath))) {
    throw new Error(`Missing session metadata artifact: ${sessionMetadataPath}`);
  }

  const bindingArtifact = await readYamlDocument<InvocationBindingArtifact>(bindingPath);
  const sessionMetadata = await readYamlDocument<ReviewSessionMetadata>(sessionMetadataPath);

  const executionResultPath =
    bindingArtifact.execution_result_path ??
    path.join(sessionRoot, "execution-result.yaml");
  if (!(await fileExists(executionResultPath))) {
    throw new Error(`Missing execution result artifact: ${executionResultPath}`);
  }
  const executionResult = validateReviewExecutionResultArtifact(
    await readYamlDocument<unknown>(executionResultPath),
    executionResultPath,
  );
  const executionPlanPath = path.join(sessionRoot, "execution-plan.yaml");
  const executionPlan = (await fileExists(executionPlanPath))
    ? await readYamlDocument<ReviewExecutionPlan>(executionPlanPath)
    : null;
  const synthesisExecuted = executionResult.synthesis_executed === true;
  if (synthesisExecuted && !(await fileExists(deliberationPath))) {
    throw new Error(`Missing controlled deliberation artifact: ${deliberationPath}`);
  }
  if (synthesisExecuted && !(await fileExists(synthesisLedgerPath))) {
    throw new Error(`Missing synthesis ledger artifact: ${synthesisLedgerPath}`);
  }
  if (synthesisExecuted && !(await fileExists(synthesisPath))) {
    throw new Error(`Missing synthesis projection artifact: ${synthesisPath}`);
  }
  const sourcePath = synthesisLedgerPath;
  const synthesisLedger = synthesisExecuted
    ? await readYamlDocument<ReviewSynthesisLedgerArtifact>(synthesisLedgerPath)
    : null;
  const sessionDate = (sessionMetadata.created_at ?? "").slice(0, 10);
  const participatingLensCount =
    executionResult.participating_lens_ids.length;
  const plannedLensCount =
    executionResult.planned_lens_ids.length;
  const degradedLensIds = executionResult.degraded_lens_ids;
  const haltReason = executionResult.halt_reason ?? null;
  const haltDetailLines = [
    executionResult?.halt_phase
      ? `- halt phase: ${executionResult.halt_phase}`
      : null,
    executionResult?.halt_unit_id
      ? `- halt unit: ${executionResult.halt_unit_id}`
      : null,
    executionResult?.halt_lens_id
      ? `- halt lens: ${executionResult.halt_lens_id}`
      : null,
  ].filter((line): line is string => line !== null);
  const executionStatus = executionResult.execution_status;
  const classificationSummary = await readReviewResultClassification(sessionRoot);
  const lensBoundaryEvidenceNotes = await deriveLensBoundaryEvidenceNotes({
    projectRoot,
    sessionRoot,
    executionPlan,
    executionResult,
  });

  const renderedBoundaryNotes = renderBoundaryNotesForFinalOutput({
    sourceBoundaryNotes: synthesisLedger
      ? renderLedgerBoundaryNotes(synthesisLedger)
      : "- synthesize output unavailable; inspect execution-result.yaml and issue artifacts",
    classificationSummary,
    lensBoundaryEvidenceNotes,
  });
  const degradationSummary =
    degradedLensIds.length > 0
      ? degradedLensIds.map((lensId) => `- degraded lens: ${lensId}`).join("\n")
      : "- none";
  const defaultConditionalConsensus =
    executionStatus === "completed"
      ? "- none"
      : [
          degradedLensIds.length > 0
            ? `- degraded lens count: ${degradedLensIds.length}`
            : null,
          haltReason ? `- halt reason: ${haltReason}` : null,
          ...haltDetailLines,
        ]
          .filter((line): line is string => line !== null)
          .join("\n") || "- none";
  const defaultPurposeAlignment =
    executionStatus === "completed"
      ? "- bounded review execution completed"
      : `- execution status: ${executionStatus}`;
  const fallbackImmediateActions = renderActionCandidates(classificationSummary);

  const finalOutputText = `---
session_id: ${bindingArtifact.session_id}
process: review
target: "${bindingArtifact.resolved_target_scope.resolved_refs
  .map((resolvedRef) => toRelativePath(resolvedRef, projectRoot))
  .join(" + ")}"
domain: ${bindingArtifact.resolved_session_domain}
date: ${sessionDate || "unknown"}
---

## 9-Lens Review Result

### Review Target
${renderTargetSummary(bindingArtifact, projectRoot)}

### Verification Context
- Domain: ${bindingArtifact.resolved_session_domain}
- Review mode: ${bindingArtifact.resolved_review_mode}
- Execution realization: ${bindingArtifact.resolved_execution_realization}
- Host runtime: ${bindingArtifact.resolved_host_runtime}
- Artifact generation realization: ${bindingArtifact.resolved_artifact_generation_realization}
- Semantic quality evidence: ${bindingArtifact.semantic_quality_evidence?.status ?? "not_recorded"} (${bindingArtifact.semantic_quality_evidence?.applicability ?? "n/a"})
- Finding ledger: \`${toRelativePath(bindingArtifact.finding_ledger_path, projectRoot)}\`
- Issue ledger: \`${toRelativePath(bindingArtifact.issue_ledger_path, projectRoot)}\`
- Problem framing: \`${toRelativePath(bindingArtifact.problem_framing_path, projectRoot)}\`
- Controlled deliberation: ${synthesisExecuted ? `\`${toRelativePath(deliberationPath, projectRoot)}\`` : "not performed"}
- Source artifact: ${synthesisExecuted ? `\`${toRelativePath(sourcePath, projectRoot)}\`` : "not produced"}
- Synthesis projection: ${synthesisExecuted ? `\`${toRelativePath(synthesisPath, projectRoot)}\`` : "not produced"}
- Execution status: ${executionStatus}

### Domain Selection
${renderDomainSelectionNotes(bindingArtifact)}

### Final Review Result
#### Review Basis
- Execution status: ${executionStatus}
- Deliberation status: ${executionResult?.deliberation_status ?? "unknown"}
- Participating lenses: ${participatingLensCount}/${plannedLensCount}
- Degraded lenses: ${degradedLensIds.join(", ") || "none"}
${executionStatus === "halted_partial" ? `- Halt reason: ${haltReason ?? "unknown"}\n${haltDetailLines.join("\n") || "- halt detail: unavailable"}` : "- Halt reason: none"}

#### Synthesis Summary
${synthesisLedger
  ? synthesisLedger.final_review_result
  : "- synthesize output unavailable; inspect execution-result.yaml and issue artifacts"}

#### Classification Summary
- Highest severity: ${classificationSummary.highest_severity ?? "none"}
- Severity counts: ${renderSeverityCounts(classificationSummary)}
- Finding count: ${classificationSummary.finding_count}
- Root-cause issue count: ${classificationSummary.issue_count}
- Material issue count: ${classificationSummary.material_issue_count}
- Non-material finding count: ${classificationSummary.non_material_finding_count}

#### Material Issues
${renderIssueProjectionList(classificationSummary.material_issues)}

#### Synthesized Material Issue Explanations
${synthesisLedger
  ? renderLedgerMaterialIssues(synthesisLedger)
  : "- synthesis ledger unavailable"}

#### Non-Material Findings
${renderIssueProjectionList(classificationSummary.non_material_findings)}

#### Action Candidates
${renderActionCandidates(classificationSummary)}

${renderConsensusHeading(
    participatingLensCount,
    plannedLensCount,
    bindingArtifact.resolved_review_mode,
  )}
${synthesisLedger
  ? renderLedgerMaterialIssues(synthesisLedger)
  : "- synthesize output unavailable"}

### Conditional Consensus
${synthesisLedger ? renderLedgerConditionalConsensus(synthesisLedger) : defaultConditionalConsensus}

### Disagreement
${synthesisLedger
  ? renderLedgerDisagreement(synthesisLedger)
  : degradationSummary}

### Axiology-Proposed Additional Perspectives
${synthesisLedger ? renderLedgerAxiologyPerspectives(synthesisLedger) : "- unavailable"}

### Purpose Alignment Verification
${synthesisLedger
  ? renderLedgerPurposeAlignment(synthesisLedger)
  : defaultPurposeAlignment}

### Boundary Notes
${renderedBoundaryNotes}

### Immediate Actions Required
${synthesisLedger
  ? renderLedgerActions(synthesisLedger)
  : fallbackImmediateActions}

### Recommendations
${synthesisLedger
  ? renderLedgerNonMaterialFindings(synthesisLedger)
  : "- inspect execution-result.yaml and error-log.md"}

### Unique Finding Tagging
${synthesisLedger
  ? renderLedgerNonMaterialFindings(synthesisLedger)
  : degradationSummary}

### Individual Lens Findings
${renderLensFindingsRefs(executionPlan, executionResult, projectRoot)}
`;

  await fs.writeFile(finalOutputPath, finalOutputText.trimEnd() + "\n", "utf8");
  console.log(finalOutputPath);
  return 0;
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  return runRenderReviewFinalOutputCli(process.argv.slice(2));
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
