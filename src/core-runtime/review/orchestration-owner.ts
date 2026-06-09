import type { ReviewOrchestrationOwner } from "../discovery/settings-chain.js";

/**
 * Capability-surface enforcement of the review orchestration owner (Phase 2,
 * Stage 1). A session is stamped at prepare with who drives its loop — onto
 * runtime (A, the MCP black box) or an external host (B, host-orchestration) —
 * and that stamp is immutable for the session's life. These pure guards make
 * the A/B split fail-closed: the wrong locus is rejected before it can dispatch,
 * so the two paths can never drive the same session (single dispatch ownership).
 *
 * The stamp is optional on older artifacts; absence resolves to `runtime` so
 * existing sessions keep the default A behavior.
 */
export function resolveOrchestrationOwner(
  owner: ReviewOrchestrationOwner | undefined,
): ReviewOrchestrationOwner {
  return owner ?? "runtime";
}

/**
 * Host (B) gate: the round/advance steps run only on a host-orchestrated
 * session. Reject a runtime session (the default A path).
 */
export function assertHostOrchestratedSession(
  owner: ReviewOrchestrationOwner | undefined,
): void {
  const resolved = resolveOrchestrationOwner(owner);
  if (resolved !== "host") {
    throw new Error(
      `review round/advance requires a host-orchestrated session (orchestration=host); this session is orchestration=${resolved}. Use onto_review for runtime-orchestrated sessions.`,
    );
  }
}

/**
 * Runtime (A) gate: onto only spawns review units for a runtime-orchestrated
 * session. Reject a host session — onto must not execute units the host owns;
 * the host drives it with onto_review_round / onto_review_advance.
 */
export function assertRuntimeOrchestratedSession(
  owner: ReviewOrchestrationOwner | undefined,
): void {
  const resolved = resolveOrchestrationOwner(owner);
  if (resolved !== "runtime") {
    throw new Error(
      `onto cannot execute review units for this session: it is orchestration=${resolved} (host-orchestrated). Drive it with onto_review_round / onto_review_advance, not onto_review.`,
    );
  }
}
