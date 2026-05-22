/**
 * /defer command orchestration.
 *
 * Defers a non-terminal scope with a reason and a resume condition:
 * any non-terminal state → scope.deferred → deferred
 *
 * Rejected when the scope is already in a terminal state (closed, deferred,
 * rejected). Separated from close.ts so that deferral has its own runtime
 * surface (BL-061: executeDefer existed but was not reachable from the evolve runtime adapter).
 */

import { readEvents } from "../../scope-runtime/event-store.js";
import { reduce } from "../../scope-runtime/reducer.js";
import { appendScopeEvent } from "../../scope-runtime/event-pipeline.js";
import { wrapGateError } from "./error-messages.js";
import { refreshScopeMd } from "./shared.js";
import type { ScopePaths } from "../../scope-runtime/scope-manager.js";

// ─── Output ───

export interface DeferResult {
  success: true;
  nextState: "deferred";
  message: string;
}

export interface DeferFailure {
  success: false;
  reason: string;
}

export type DeferOutput = DeferResult | DeferFailure;

// ─── Main ───

export function executeDefer(
  paths: ScopePaths,
  reason: string,
  resumeCondition: string,
): DeferOutput {
  const events = readEvents(paths.events);
  const state = reduce(events);

  const terminalStates = ["closed", "deferred", "rejected"];
  if (terminalStates.includes(state.current_state)) {
    return {
      success: false,
      reason: `현재 상태가 ${state.current_state}입니다. 이미 종료된 scope는 보류할 수 없습니다.`,
    };
  }

  const result = appendScopeEvent(paths, {
    type: "scope.deferred",
    actor: "user",
    payload: { reason, resume_condition: resumeCondition },
  });

  if (!result.success) return { success: false, reason: wrapGateError(result.reason) };
  refreshScopeMd(paths, result.state);

  return {
    success: true,
    nextState: "deferred",
    message: "Scope가 보류되었습니다.",
  };
}
