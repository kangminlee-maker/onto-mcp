/**
 * Dispatch limit/transport circuit breaker — pure policy logic (no I/O, no
 * timers of its own, no LLM calls).
 *
 * 설계 B (development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md §4):
 * an unattended batch must not throw a retry storm at a dead rate limit and
 * lose items. The policy is injected into each batch dispatch loop (review
 * lens/stance fan-out, reconstruct semantic-map judgment loop — the repo has
 * no common dispatch surface, per the 2026-07-05 re-anchoring note in §8):
 *
 * 1. backoff first — a per-item failure counts toward the breaker only after
 *    the item's bounded backoff retries are exhausted. Providers surface 429s
 *    as opaque message strings (no Retry-After anywhere), so the schedule is
 *    a capped exponential.
 * 2. systemic detection — only consecutive FINAL item failures of a systemic
 *    class (rate_limit / auth / transport) across DISTINCT items count;
 *    threshold N via settings. A success resets the streak.
 * 3. poison item — an item that keeps failing while the streak stays below N
 *    is dead-lettered (complete-with-failure) and the batch continues.
 * 4. breaker trip — the loop halts the batch and persists the incomplete-item
 *    list (fallback provider swap is a deferred later cut).
 * 5. recovery re-dispatch targets exactly the persisted incomplete set.
 *
 * File I/O (persisting the artifact), timestamps, and halt mechanics stay in
 * the wiring; this module owns classification, the backoff schedule, the
 * breaker state machine, and the artifact projection.
 */

export type SystemicDispatchFailureClass = "rate_limit" | "auth" | "transport";

const RATE_LIMIT_PATTERNS = [
  "429",
  "rate limit",
  "rate_limit",
  "too many requests",
  "overloaded",
  "session limit",
  "usage limit",
  "quota",
  "retry-after",
  "retry_after",
];

const AUTH_PATTERNS = [
  "401",
  "403",
  "unauthorized",
  "forbidden",
  "invalid api key",
  "invalid x-api-key",
  "authentication",
  "not logged in",
];

// Mirrors the battle-tested transient list in run-review-prompt-execution's
// isTransientExecutorFailureMessage (different consumer: that list decides
// per-unit retry, this one decides breaker counting).
const TRANSPORT_PATTERNS = [
  "stream disconnected before completion",
  "connection reset by peer",
  "error sending request",
  "failed to connect to websocket",
  "transport channel closed",
  "http/request failed",
  "request failed after",
  "econnrefused",
  "econnreset",
  "etimedout",
  "socket hang up",
  "fetch failed",
];

/**
 * Classify a failure message into a systemic dispatch class, or null for
 * item-local failures (malformed output, validation rejection, …) that must
 * never trip the batch breaker. Message-based by necessity: both adapter
 * families flatten provider status into strings (재앵커링 노트 (4)).
 */
export function classifySystemicDispatchFailure(
  message: string | null | undefined,
): SystemicDispatchFailureClass | null {
  if (typeof message !== "string" || message.length === 0) return null;
  const normalized = message.toLowerCase();
  if (RATE_LIMIT_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "rate_limit";
  }
  if (AUTH_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "auth";
  }
  if (TRANSPORT_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "transport";
  }
  return null;
}

/** Capped exponential backoff (no jitter — deterministic for replay/tests).
 * attempt is 0-based: delay before retry #1 is initialMs. */
export function dispatchBackoffDelayMs(args: {
  attempt: number;
  initialMs: number;
  capMs: number;
}): number {
  const exponential = args.initialMs * 2 ** Math.max(0, args.attempt);
  const bounded = Math.min(args.capMs, exponential);
  return Number.isFinite(bounded) && bounded > 0 ? Math.floor(bounded) : args.capMs;
}

export interface DispatchBreakerPolicy {
  enabled: boolean;
  /** N: consecutive distinct-item systemic FINAL failures that trip the breaker. */
  systemic_threshold: number;
  /** Per-item total attempt cap (1 original + retries) for systemic-class failures. */
  per_item_max_attempts: number;
  backoff_initial_ms: number;
  backoff_cap_ms: number;
}

export interface DispatchDeadLetterEntry {
  item_id: string;
  failure_class: SystemicDispatchFailureClass | null;
  failure_message: string;
  attempt_count: number;
}

export interface DispatchBreakerTripState {
  failure_class: SystemicDispatchFailureClass;
  consecutive_item_count: number;
  threshold: number;
}

/**
 * Breaker state machine over one batch. The loop reports each item's FINAL
 * outcome (after its bounded retries); the machine answers "has this become
 * systemic?" and keeps the dead-letter/completion bookkeeping the wiring
 * persists.
 *
 * Poison-vs-systemic attribution rule: a systemic-class failure is held
 * PENDING until the batch proves the provider lane is alive (a later item
 * succeeds) — only then is it a poison item (reproduced on that item alone)
 * and dead-lettered. If the streak instead reaches the threshold, the batch
 * trips and the pending items stay in the INCOMPLETE set: they were victims
 * of the outage and must be re-dispatched on recovery (규칙 5), not
 * complete-with-failure. Item-local failures (null class) dead-letter
 * immediately and say nothing about the provider, so they neither extend nor
 * reset the systemic streak.
 */
export class DispatchBreakerState {
  readonly policy: DispatchBreakerPolicy;
  private pendingSystemic: DispatchDeadLetterEntry[] = [];
  private trip: DispatchBreakerTripState | null = null;
  private readonly completed: string[] = [];
  private readonly deadLetter: DispatchDeadLetterEntry[] = [];

  constructor(policy: DispatchBreakerPolicy) {
    this.policy = policy;
  }

  recordItemSuccess(itemId: string): void {
    this.completed.push(itemId);
    // The provider lane is alive: pending systemic failures were item-scoped
    // after all — poison, dead-lettered.
    for (const entry of this.pendingSystemic) this.deadLetter.push(entry);
    this.pendingSystemic = [];
  }

  /** Report an item's FINAL failure (per-item budget exhausted). Returns the
   * trip state when this failure crosses the systemic threshold. */
  recordItemFailure(entry: DispatchDeadLetterEntry): DispatchBreakerTripState | null {
    if (entry.failure_class === null) {
      // Item-local failure class: dead-letter, never breaker fuel.
      this.deadLetter.push(entry);
      return null;
    }
    if (
      !this.pendingSystemic.some((pending) => pending.item_id === entry.item_id)
    ) {
      this.pendingSystemic.push(entry);
    }
    if (
      this.policy.enabled &&
      this.pendingSystemic.length >= this.policy.systemic_threshold
    ) {
      this.trip = {
        failure_class: entry.failure_class,
        consecutive_item_count: this.pendingSystemic.length,
        threshold: this.policy.systemic_threshold,
      };
      return this.trip;
    }
    return null;
  }

  tripped(): DispatchBreakerTripState | null {
    return this.trip;
  }

  completedItemIds(): readonly string[] {
    return this.completed;
  }

  deadLetterEntries(): readonly DispatchDeadLetterEntry[] {
    return this.deadLetter;
  }

  /** Systemic failures not yet attributed (no success boundary reached, no
   * trip): conservative — they stay in the incomplete set at batch end so a
   * recovery run retries them instead of writing them off. */
  pendingSystemicEntries(): readonly DispatchDeadLetterEntry[] {
    return this.pendingSystemic;
  }
}

export class DispatchBreakerTrippedError extends Error {
  readonly trip: DispatchBreakerTripState;

  constructor(trip: DispatchBreakerTripState) {
    super(
      `dispatch breaker tripped: ${trip.failure_class} failed ${trip.consecutive_item_count} consecutive items (threshold ${trip.threshold}) — batch halted, incomplete items persisted for exact re-dispatch`,
    );
    this.name = "DispatchBreakerTrippedError";
    this.trip = trip;
  }
}

/**
 * Run one dispatch under the backoff-first rule (규칙 1): systemic-class
 * errors are retried with capped exponential backoff up to the per-item
 * attempt cap; item-local errors (null class) never retry here — the item's
 * own semantics own those. On exhaustion the LAST error is rethrown so the
 * caller can classify it and report the item's FINAL outcome to
 * {@link DispatchBreakerState}. `sleep` is injected so fixtures stay
 * deterministic and fast.
 */
export async function runWithDispatchBackoff<T>(args: {
  label: string;
  policy: Pick<
    DispatchBreakerPolicy,
    "per_item_max_attempts" | "backoff_initial_ms" | "backoff_cap_ms"
  >;
  dispatch: () => Promise<T>;
  sleep: (ms: number) => Promise<void>;
  /** Called after each failed attempt that will be retried (observability). */
  onRetry?: (info: {
    label: string;
    attempt: number;
    delayMs: number;
    failureClass: SystemicDispatchFailureClass;
    message: string;
  }) => void | Promise<void>;
}): Promise<T> {
  const maxAttempts = Math.max(1, args.policy.per_item_max_attempts);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await args.dispatch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failureClass = classifySystemicDispatchFailure(message);
      const retryable = failureClass !== null && attempt + 1 < maxAttempts;
      if (!retryable) throw error;
      const delayMs = dispatchBackoffDelayMs({
        attempt,
        initialMs: args.policy.backoff_initial_ms,
        capMs: args.policy.backoff_cap_ms,
      });
      await args.onRetry?.({
        label: args.label,
        attempt: attempt + 1,
        delayMs,
        failureClass,
        message,
      });
      await args.sleep(delayMs);
    }
  }
  // Unreachable: the loop always returns/throws on the final attempt.
  throw new Error(`runWithDispatchBackoff fell through for ${args.label}`);
}

export interface DispatchIncompleteArtifact {
  schema_version: "1";
  pipeline: string;
  batch_label: string;
  created_at: string;
  breaker: {
    tripped: boolean;
    failure_class: SystemicDispatchFailureClass | null;
    consecutive_item_count: number | null;
    threshold: number;
  };
  completed_item_ids: string[];
  dead_letter: DispatchDeadLetterEntry[];
  /** Exact recovery set (설계 B 규칙 5): planned − completed − dead-lettered. */
  incomplete_item_ids: string[];
}

/** Deterministic projection of a batch's end state — the wiring persists it
 * on breaker trip AND on normal completion (rule 6 observability), so a
 * recovery run always has the exact re-dispatch set. `createdAt` is supplied
 * by the caller (runtime owns timestamps). */
export function buildDispatchIncompleteArtifact(args: {
  pipeline: string;
  batchLabel: string;
  createdAt: string;
  plannedItemIds: readonly string[];
  state: DispatchBreakerState;
}): DispatchIncompleteArtifact {
  const completed = new Set(args.state.completedItemIds());
  const deadLettered = new Set(
    args.state.deadLetterEntries().map((entry) => entry.item_id),
  );
  const trip = args.state.tripped();
  return {
    schema_version: "1",
    pipeline: args.pipeline,
    batch_label: args.batchLabel,
    created_at: args.createdAt,
    breaker: {
      tripped: trip !== null,
      failure_class: trip?.failure_class ?? null,
      consecutive_item_count: trip?.consecutive_item_count ?? null,
      threshold: args.state.policy.systemic_threshold,
    },
    completed_item_ids: [...completed],
    dead_letter: [...args.state.deadLetterEntries()],
    incomplete_item_ids: args.plannedItemIds.filter(
      (itemId) => !completed.has(itemId) && !deadLettered.has(itemId),
    ),
  };
}
