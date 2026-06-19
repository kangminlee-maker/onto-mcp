/**
 * Loads a session's {@link TreeViewModel} by calling the same core-api read
 * projection the MCP read tools use, then routing it through the pipeline's
 * adapter. Read-only. The poll LOOP (interval, abort) lives in the Ink app; this
 * module is the single-shot fetch so it stays trivially testable.
 */
import { createOntoReviewCoreApi } from "../../core-api/review-api.js";
import { createOntoReconstructCoreApi } from "../../core-api/reconstruct-api.js";
import { reviewStatusToTreeViewModel } from "../view-model/review-adapter.js";
import { reconstructStatusToTreeViewModel } from "../view-model/reconstruct-adapter.js";
import type { TreeViewModel } from "../view-model/tree-view-model.js";
import type { SessionRef } from "./session-discovery.js";

export interface LoadTreeViewModelDeps {
  /** onto home for settings/registry resolution; defaults to the cwd discovery. */
  ontoHome?: string;
}

/** Single-shot read of the current TreeViewModel for a session. */
export async function loadTreeViewModel(
  ref: SessionRef,
  deps: LoadTreeViewModelDeps = {},
): Promise<TreeViewModel> {
  const options = deps.ontoHome ? { ontoHome: deps.ontoHome } : {};
  if (ref.pipeline === "review") {
    const api = createOntoReviewCoreApi(options);
    // Request the full projection: the standard projection compacts
    // unit_progress `outputPath`/`runningLogRef` with an ellipsis, and the TUI
    // does local file I/O (drill-down tail) on those paths — they must be
    // untruncated.
    const status = await api.getReviewStatus(ref.sessionRoot, { projectionLevel: "full" });
    return reviewStatusToTreeViewModel(status, ref.sessionRoot);
  }
  const api = createOntoReconstructCoreApi(options);
  const status = await api.getRunStatus(ref.sessionRoot);
  return reconstructStatusToTreeViewModel(status, ref.sessionRoot);
}
