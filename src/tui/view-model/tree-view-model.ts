/**
 * Pipeline-agnostic view model rendered by the `onto watch` HUD.
 *
 * review and reconstruct expose progress in different shapes (review = per-UNIT
 * live signal; reconstruct = per-STAGE state + owner + domain counts). The
 * review/reconstruct adapters normalize both into this single shape, so the Ink
 * HUD never branches on pipeline. This is a pure derived VIEW — it carries no
 * authority and is never persisted.
 */

export type NodeState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "halted"
  | "skipped";

export type WorkflowStatus = "running" | "completed" | "halted" | "failed";

export interface SeverityCounts {
  blocker: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

/** One unit (review lens/unit) or stage (reconstruct) in the workflow tree. */
export interface TreeNode {
  /** Stable identity for selection/diffing (e.g. unitId or stageId). */
  id: string;
  /** Display label (e.g. `lens:axiology`, `ontology seed`). */
  label: string;
  status: NodeState;
  /** review unit kind / reconstruct owner-or-kind, free text for the badge. */
  kind: string;
  /** reconstruct only: runtime | host_llm | host_or_user. */
  owner?: string;
  /** Seconds since the latest live signal for this node, when known. */
  signalAgeSec?: number | null;
  /** Attempt count when the runtime retried this unit. */
  attempts?: number;
  /** Terminal failure message when the node failed. */
  failureMessage?: string | null;
  /** Authored-output ref for drill-down (running log / artifact). */
  outputPath?: string | null;
}

/** A pipeline phase (review progress step / reconstruct stage group). */
export interface TreePhase {
  id: string;
  label: string;
  state: NodeState;
  nodes: TreeNode[];
}

/**
 * Footer summary — exactly one of `findings` (review) or `counts` (reconstruct)
 * is populated. `counts` carries the reconstruct countSummary/answerability
 * fields as a flat label→value map for display.
 */
export interface TreeSummary {
  findings?: SeverityCounts & { material: string[] };
  counts?: Record<string, number | null>;
}

export interface TreeRunControl {
  cancellable: boolean;
  continuable: boolean;
  /** reconstruct/host-orchestration: advance to the next round. */
  advanceable?: boolean;
}

export interface TreeLiveness {
  /** Free-text liveness state from the projection (e.g. `running_recent_signal`). */
  state: string;
  secondsSinceSignal: number | null;
  /** Recommended poll interval (ms) from the projection, when provided. */
  pollMs: number | null;
}

export interface TreeViewModel {
  pipeline: "review" | "reconstruct";
  sessionId: string;
  sessionRoot: string;
  status: WorkflowStatus;
  /** Optional one-line route/intent context for the header. */
  headline?: string;
  /** Narrator line — latest_update.summary / derived from the projection. */
  narrator: string;
  liveness: TreeLiveness;
  phases: TreePhase[];
  summary: TreeSummary;
  runControl: TreeRunControl;
}

/** True when the workflow has reached a terminal state (stop polling). */
export function isTerminalStatus(status: WorkflowStatus): boolean {
  return status === "completed" || status === "failed";
}
