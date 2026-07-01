/**
 * reconstruct → {@link TreeViewModel} adapter.
 *
 * PURE function: maps a {@link ReconstructSessionStatus} (from
 * `getRunStatus(sessionRoot)` in `core-api/reconstruct-api`) into the
 * pipeline-agnostic {@link TreeViewModel} the `onto watch` HUD renders. No I/O,
 * no LLM calls, no clock reads — every output field is derived from the input
 * status. The view it produces carries no authority and is never persisted.
 *
 * Shape difference vs review: reconstruct exposes per-STAGE state + owner +
 * authority impact (no per-unit live signal, no rich run_control), plus domain
 * counts (countSummary + answerability). The HUD never sees that difference —
 * this adapter normalizes it into the same {@link TreeViewModel}.
 */
import type {
  ReconstructRunProgressProjection,
  ReconstructRunStageProjection,
  ReconstructSessionStatus,
} from "../../core-api/reconstruct-api.js";
import type {
  NodeState,
  TreeNode,
  TreePhase,
  TreeViewModel,
  WorkflowStatus,
} from "./tree-view-model.js";

/**
 * v1 grouping: a single "pipeline" phase holds every reconstruct stage as a
 * node, in canonical stage order (the projection already lists stages in
 * `RECONSTRUCT_STAGE_IDS` order). This keeps the adapter simple and mirrors the
 * design's "stages are the nodes" framing; finer maturation-stage grouping can
 * be layered on later without changing the node mapping.
 */
const PIPELINE_PHASE_ID = "pipeline";
const PIPELINE_PHASE_LABEL = "reconstruct pipeline";

/**
 * Map a reconstruct stage `state` to the shared {@link NodeState}. Reconstruct
 * stage states are a strict subset (`pending | completed | skipped | halted`) —
 * there is no per-stage `running` signal in the projection, so the in-flight
 * stage is surfaced at the phase/headline level (see {@link derivePhaseState}),
 * not on individual nodes.
 */
function stageStateToNodeState(
  state: ReconstructRunStageProjection["state"],
): NodeState {
  switch (state) {
    case "completed":
      return "completed";
    case "skipped":
      return "skipped";
    case "halted":
      return "halted";
    case "pending":
      return "pending";
  }
}

/** Human-ize a snake_case stageId for display, e.g. `ontology_seed` → `ontology seed`. */
function humanizeStageId(stageId: string): string {
  return stageId.replace(/_/g, " ");
}

function stageToNode(stage: ReconstructRunStageProjection): TreeNode {
  return {
    id: stage.stageId,
    label: humanizeStageId(stage.stageId),
    status: stageStateToNodeState(stage.state),
    // reconstruct nodes badge by stageId (kind) + carry the owner column.
    kind: stage.stageId,
    // owner is optional under exactOptionalPropertyTypes: omit when absent.
    ...(stage.owner ? { owner: stage.owner } : {}),
    // No per-stage live signal in the projection.
    signalAgeSec: null,
    // `reason` is the stage's terminal explanation (skip/halt rationale).
    failureMessage: stage.reason,
    // First authored artifact ref is the drill-down target.
    outputPath: stage.artifactRefs[0] ?? null,
  };
}

/**
 * Phase state for the single pipeline phase. A halted stage halts the phase;
 * otherwise a completed run completes the phase; otherwise it is running (the
 * pipeline is mid-flight regardless of which individual stages are still
 * pending).
 */
function derivePhaseState(
  stages: ReconstructRunStageProjection[],
  workflowStatus: WorkflowStatus,
): NodeState {
  if (stages.some((stage) => stage.state === "halted")) return "halted";
  if (workflowStatus === "completed") return "completed";
  return "running";
}

/**
 * Map record_stage + stage states to the shared {@link WorkflowStatus}.
 * reconstruct has no `failed` record_stage and no per-stage `running`; we treat
 * a halted stage as a halt (terminal-ish, surfaced for the operator) and a
 * completed record as completed. Everything else is an in-flight run.
 */
function deriveWorkflowStatus(
  status: ReconstructSessionStatus,
): WorkflowStatus {
  if (status.status === "completed") return "completed";
  // A graceful terminal (design §16.7) is terminal but not completed: surface it as `halted` so
  // the watch loop stops polling and the operator sees an honest stop, not a "session completed".
  if (status.status === "blocked" || status.status === "limited") return "halted";
  if (status.progress.stages.some((stage) => stage.state === "halted")) {
    return "halted";
  }
  return "running";
}

/** Flatten countSummary + answerabilitySummary into the footer label→value map. */
function deriveCounts(
  progress: ReconstructRunProgressProjection,
): Record<string, number | null> {
  const c = progress.countSummary;
  const a = progress.answerabilitySummary;
  return {
    observations: c.selectedObservationCount ?? c.sourceObservationCount,
    claims: c.semanticClaimCount,
    confirmed: c.confirmedClaimCount,
    deferredClaims: c.deferredClaimCount,
    CQ: c.competencyQuestionCount,
    passRate: c.passRate,
    // Answerability (maturation) summary — null until metrics are computed.
    declared: a ? a.declaredQuestionCount : null,
    supported: a ? a.supportedQuestionCount : null,
    deferred: a ? a.deferredQuestionCount : null,
    unsupported: a ? a.unsupportedQuestionCount : null,
  };
}

/** One-line narrator from the current stage + the most informative counts. */
function deriveNarrator(
  progress: ReconstructRunProgressProjection,
  workflowStatus: WorkflowStatus,
): string {
  const stage = humanizeStageId(progress.currentStageId);
  const a = progress.answerabilitySummary;
  const lead =
    workflowStatus === "completed"
      ? "reconstruct complete"
      : workflowStatus === "halted"
        ? `halted at ${stage}`
        : `reconstructing — ${stage}`;
  if (a) {
    return `${lead} · CQ ${a.declaredQuestionCount} · supported ${a.supportedQuestionCount} · deferred ${a.deferredQuestionCount} · unsupported ${a.unsupportedQuestionCount}`;
  }
  const claims = progress.countSummary.semanticClaimCount;
  return claims === null ? lead : `${lead} · ${claims} claims`;
}

/**
 * Pure projection: {@link ReconstructSessionStatus} → {@link TreeViewModel}.
 *
 * `sessionRoot` is threaded explicitly (the caller already knows it) so the view
 * model header is independent of how the status was fetched.
 */
export function reconstructStatusToTreeViewModel(
  status: ReconstructSessionStatus,
  sessionRoot: string,
): TreeViewModel {
  const { progress } = status;
  const workflowStatus = deriveWorkflowStatus(status);
  const nodes = progress.stages.map(stageToNode);
  const phase: TreePhase = {
    id: PIPELINE_PHASE_ID,
    label: PIPELINE_PHASE_LABEL,
    state: derivePhaseState(progress.stages, workflowStatus),
    nodes,
  };

  return {
    pipeline: "reconstruct",
    sessionId: status.sessionId,
    sessionRoot,
    status: workflowStatus,
    narrator: deriveNarrator(progress, workflowStatus),
    liveness: {
      state: progress.liveness.state,
      // The projection carries no per-signal timestamp for reconstruct.
      secondsSinceSignal: null,
      pollMs: progress.liveness.recommendedPollIntervalMs,
    },
    phases: [phase],
    summary: { counts: deriveCounts(progress) },
    // reconstruct status carries no rich run_control (unlike review): be
    // conservative — only a still-running session is cancellable; continue /
    // advance are display-only false until a control path exists (design §4,
    // later stage E).
    runControl: {
      cancellable: workflowStatus === "running",
      continuable: false,
      advanceable: false,
    },
  };
}
