/**
 * review → {@link TreeViewModel} adapter.
 *
 * PURE function: maps a {@link ReviewStatus} (from `getReviewStatus(sessionRoot)`
 * in `core-api/review-api`) into the pipeline-agnostic {@link TreeViewModel} the
 * `onto watch` HUD renders. No I/O, no LLM calls, no clock reads — every output
 * field is derived from the input status. The view it produces carries no
 * authority and is never persisted.
 *
 * Shape difference vs reconstruct: review exposes per-UNIT live signal
 * (`unitProgress[]` — alias, kind, status, attempts, signal age, output) grouped
 * by `progressStepId` into the 12 progress steps, plus rich `runControl` and a
 * finding-severity footer. The HUD never sees that difference — this adapter
 * normalizes it into the same {@link TreeViewModel}.
 *
 * The structured progress facts the HUD shows above the unit tree (liveness,
 * narrator line, completed steps, finding severity counts + material titles) live
 * inside `llmPresentation.progress.input`, which `ReviewStatus` types as
 * `unknown` (it is the bounded LLM-presentation payload). We narrow that payload
 * with the {@link ProgressPresentationInput} structural view below — a read-only
 * subset of the source's progress-presentation shape — and fall back to safe
 * defaults when a field is absent.
 */
import type {
  CompactReviewResultClassificationSummary,
  ReviewResultClassificationProjection,
  ReviewRunControlProjection,
  ReviewRuntimeUnitProgressProjection,
  ReviewStatus,
} from "../../core-api/review-api.js";
import {
  REVIEW_PROGRESS_STEPS,
  type ReviewProgressStepId,
} from "../../core-api/review-progress.js";
import type {
  NodeState,
  SeverityCounts,
  TreeNode,
  TreePhase,
  TreeViewModel,
  WorkflowStatus,
} from "./tree-view-model.js";

/** Phase that collects units the projection has not bound to a progress step. */
const UNCATEGORIZED_PHASE_ID = "unassigned";
const UNCATEGORIZED_PHASE_LABEL = "unassigned units";

/** Canonical progress-step ids — used to reject non-step `completed_steps` keys. */
const VALID_PROGRESS_STEP_IDS = new Set<string>(
  REVIEW_PROGRESS_STEPS.map((step) => step.id),
);

/**
 * Structural view of the bounded progress-presentation payload carried by
 * `ReviewStatus.llmPresentation.progress.input` (typed `unknown` at the
 * boundary). Every field is optional — the adapter reads defensively and never
 * assumes the payload is present or complete.
 */
interface ProgressPresentationInput {
  progress?: {
    current_step?: number | null;
    total_steps?: number | null;
    completed_steps?: string[];
  };
  liveness?: {
    state?: string;
    seconds_since_last_observed_artifact?: number | null;
    poll_after_seconds?: number | null;
    summary?: string;
  };
  latest_update?: {
    summary?: string;
  };
  result_classification_summary?: ReviewResultClassificationProjection | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrow the `unknown` presentation payload to the read-only fields we use. */
function readProgressPresentationInput(
  status: ReviewStatus,
): ProgressPresentationInput {
  const input = status.llmPresentation?.progress?.input;
  return isRecord(input) ? (input as ProgressPresentationInput) : {};
}

/**
 * Map a runtime unit status to the shared {@link NodeState}. `retrying` and
 * `running_stale` are both still in-flight (the HUD surfaces the retry count /
 * stale signal age separately), so they collapse to `running`.
 */
function unitStatusToNodeState(
  unitStatus: ReviewRuntimeUnitProgressProjection["status"],
): NodeState {
  switch (unitStatus) {
    case "pending":
      return "pending";
    case "running":
    case "retrying":
    case "running_stale":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
  }
}

function unitToNode(unit: ReviewRuntimeUnitProgressProjection): TreeNode {
  return {
    id: unit.unitId,
    label: unit.publicAlias,
    status: unitStatusToNodeState(unit.status),
    kind: unit.unitKind,
    signalAgeSec: unit.secondsSinceLatestSignal,
    attempts: unit.attemptCount,
    failureMessage: unit.failureMessage,
    outputPath: drillDownPath(unit),
  };
}

/**
 * Drill-down target for a unit. A completed unit's authored output is the
 * authoritative artifact. For an active/failed unit that planned output may not
 * exist yet, so prefer the live running-log (the projection only sets
 * `runningLogRef` when that file is present) and fall back to the planned output.
 */
function drillDownPath(unit: ReviewRuntimeUnitProgressProjection): string | null {
  if (unit.status === "completed") {
    return unit.outputPath ?? unit.runningLogRef ?? null;
  }
  return unit.runningLogRef ?? unit.outputPath ?? null;
}

/**
 * State of the current (in-flight) progress step, given the workflow's own
 * status: a halted or failed run is terminal, and its current step is the
 * halt/failure locus — surface that rather than a misleading "running". A live
 * run's current step is running.
 */
function currentStepState(workflowStatus: WorkflowStatus): NodeState {
  if (workflowStatus === "failed") return "failed";
  if (workflowStatus === "halted") return "halted";
  return "running";
}

/**
 * Phase state from its nodes (+ the projection's completed step ids). A failed
 * node fails the phase; any in-flight node makes it running; a step listed in
 * `completed_steps` (or all nodes completed) completes it; a halted node halts
 * it. A step at the current step whose units exist but have not signalled yet
 * takes the workflow's current-step state — matching {@link emptyStepState}'s
 * current-step branch so the same current step reports the same state whether or
 * not it carries units. Otherwise it is pending.
 */
function derivePhaseState(
  nodes: TreeNode[],
  stepId: ReviewProgressStepId | null,
  completedStepIds: Set<string>,
  stepNumber: number | null,
  currentStep: number | null,
  workflowStatus: WorkflowStatus,
): NodeState {
  if (nodes.some((node) => node.status === "failed")) return "failed";
  if (nodes.some((node) => node.status === "running")) return "running";
  if (nodes.some((node) => node.status === "halted")) return "halted";
  if (stepId !== null && completedStepIds.has(stepId)) return "completed";
  if (nodes.length > 0 && nodes.every((node) => node.status === "completed")) {
    return "completed";
  }
  if (nodes.length > 0 && nodes.every((node) => node.status === "skipped")) {
    return "skipped";
  }
  if (stepNumber != null && currentStep != null && stepNumber === currentStep) {
    return currentStepState(workflowStatus);
  }
  return "pending";
}

/**
 * State for a progress step that has no bound units: completed when the workflow
 * itself completed, when the step is in `completed_steps`, or when it sits before
 * the current step; the workflow's current-step state at the current step (so a
 * halted/failed run points at its halt/failure locus, not a phantom "running");
 * otherwise pending. This keeps idle/completed steps visible so the HUD shows the
 * whole pipeline (not only the steps that happened to carry units).
 */
function emptyStepState(
  stepId: ReviewProgressStepId,
  stepNumber: number,
  completedStepIds: Set<string>,
  currentStep: number | null,
  workflowStatus: WorkflowStatus,
): NodeState {
  if (workflowStatus === "completed") return "completed";
  if (completedStepIds.has(stepId)) return "completed";
  if (currentStep != null) {
    if (stepNumber < currentStep) return "completed";
    if (stepNumber === currentStep) return currentStepState(workflowStatus);
  }
  return "pending";
}

/**
 * Emit a phase for EVERY progress step (in canonical order), attaching any units
 * bound to it, so completed/idle steps stay visible. Units the projection left
 * unbound (`progressStepId === null`) collect into a trailing uncategorized phase.
 */
function derivePhases(
  status: ReviewStatus,
  completedStepIds: Set<string>,
  currentStep: number | null,
  workflowStatus: WorkflowStatus,
): TreePhase[] {
  const byStep = new Map<ReviewProgressStepId | null, TreeNode[]>();
  for (const unit of status.unitProgress ?? []) {
    const key = unit.progressStepId;
    const bucket = byStep.get(key);
    if (bucket) bucket.push(unitToNode(unit));
    else byStep.set(key, [unitToNode(unit)]);
  }

  const phases: TreePhase[] = REVIEW_PROGRESS_STEPS.map((spec) => {
    const nodes = byStep.get(spec.id) ?? [];
    const state = nodes.length > 0
      ? derivePhaseState(nodes, spec.id, completedStepIds, spec.step, currentStep, workflowStatus)
      : emptyStepState(spec.id, spec.step, completedStepIds, currentStep, workflowStatus);
    return { id: spec.id, label: spec.label, state, nodes };
  });

  const unassigned = byStep.get(null);
  if (unassigned && unassigned.length > 0) {
    phases.push({
      id: UNCATEGORIZED_PHASE_ID,
      label: UNCATEGORIZED_PHASE_LABEL,
      state: derivePhaseState(unassigned, null, completedStepIds, null, currentStep, workflowStatus),
      nodes: unassigned,
    });
  }
  return phases;
}

/**
 * Map the review status union to the shared {@link WorkflowStatus}. A degraded
 * completion is still a completion; `halted_partial` is the operator-facing halt;
 * `prepared` / `unknown` are pre-run states the HUD shows as still-running (the
 * narrator/liveness convey the finer state).
 */
function deriveWorkflowStatus(status: ReviewStatus["status"]): WorkflowStatus {
  switch (status) {
    case "completed":
    case "completed_with_degradation":
      return "completed";
    case "halted_partial":
      return "halted";
    case "failed":
      return "failed";
    case "running":
    case "prepared":
    case "unknown":
      return "running";
  }
}

/**
 * Run control from the review projection. `cancellationAvailable` /
 * `continuationAvailable` are the authoritative flags; review has no per-round
 * advance, so `advanceable` is left undefined.
 */
function deriveRunControl(
  runControl: ReviewRunControlProjection | undefined,
): TreeViewModel["runControl"] {
  return {
    cancellable: runControl?.cancellationAvailable ?? false,
    continuable: runControl?.continuationAvailable ?? false,
  };
}

const EMPTY_SEVERITY_COUNTS: SeverityCounts = {
  blocker: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
};

/**
 * Footer findings: severity counts + material issue titles. Works for both the
 * full and compact result-classification projections — material titles come from
 * `material_issues[]` (full) or `material_issue_signals[]` (compact).
 */
function deriveFindings(
  summary: ReviewResultClassificationProjection | null | undefined,
): SeverityCounts & { material: string[] } {
  if (!summary) {
    return { ...EMPTY_SEVERITY_COUNTS, material: [] };
  }
  const counts: SeverityCounts = {
    blocker: summary.severity_counts.blocker,
    high: summary.severity_counts.high,
    medium: summary.severity_counts.medium,
    low: summary.severity_counts.low,
    info: summary.severity_counts.info,
  };
  return { ...counts, material: materialIssueTitles(summary) };
}

function isCompactSummary(
  summary: ReviewResultClassificationProjection,
): summary is CompactReviewResultClassificationSummary {
  return "material_issue_signals" in summary;
}

function materialIssueTitles(
  summary: ReviewResultClassificationProjection,
): string[] {
  if (isCompactSummary(summary)) {
    return summary.material_issue_signals.map((signal) =>
      titleLine(signal.issue_id, signal.signal),
    );
  }
  return summary.material_issues.map((issue) =>
    titleLine(
      issue.issue_id,
      issue.problem_definition ?? issue.issue_statement ?? issue.impact,
    ),
  );
}

function titleLine(issueId: string, text: string | undefined): string {
  const trimmed = (text ?? "").trim();
  return trimmed.length > 0 ? `${issueId}: ${trimmed}` : issueId;
}

/**
 * Narrator line: prefer the latest progress signal summary, fall back to the
 * liveness summary, then to the bare status. Mirrors the design's
 * `latest_update.summary / liveness.summary` rule.
 */
function deriveNarrator(
  input: ProgressPresentationInput,
  workflowStatus: WorkflowStatus,
): string {
  const latest = input.latest_update?.summary?.trim();
  if (latest) return latest;
  const liveness = input.liveness?.summary?.trim();
  if (liveness) return liveness;
  return `review ${workflowStatus}`;
}

/**
 * Pure projection: {@link ReviewStatus} → {@link TreeViewModel}.
 *
 * `sessionRoot` is threaded explicitly (the caller already knows it) so the view
 * model header is independent of how the status was fetched.
 */
export function reviewStatusToTreeViewModel(
  status: ReviewStatus,
  sessionRoot: string,
): TreeViewModel {
  const input = readProgressPresentationInput(status);
  const workflowStatus = deriveWorkflowStatus(status.status);
  // Consume only real progress-step ids: a prepared session fills
  // `completed_steps` with preparation-artifact keys (interpretation/binding/
  // execution_plan), a different vocabulary, which must not be matched against
  // (or mistaken for) progress-step ids during phase rollup.
  const completedStepIds = new Set(
    (input.progress?.completed_steps ?? []).filter((id) =>
      VALID_PROGRESS_STEP_IDS.has(id),
    ),
  );
  const phases = derivePhases(
    status,
    completedStepIds,
    input.progress?.current_step ?? null,
    workflowStatus,
  );

  return {
    pipeline: "review",
    sessionId: status.sessionId,
    sessionRoot,
    status: workflowStatus,
    narrator: deriveNarrator(input, workflowStatus),
    liveness: {
      state: input.liveness?.state ?? "unknown",
      secondsSinceSignal:
        input.liveness?.seconds_since_last_observed_artifact ?? null,
      pollMs:
        input.liveness?.poll_after_seconds == null
          ? null
          : input.liveness.poll_after_seconds * 1000,
    },
    phases,
    summary: { findings: deriveFindings(input.result_classification_summary) },
    runControl: deriveRunControl(status.runControl),
  };
}
