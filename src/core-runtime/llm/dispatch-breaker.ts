/**
 * Dispatch limit/transport circuit breaker — pure policy logic (no I/O, no
 * timers of its own, no LLM calls).
 *
 * 설계 B (development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md §4):
 * an unattended batch must not throw a retry storm at a dead rate limit and
 * lose items. The repo has no common dispatch surface (§8 재앵커링), so the
 * policy is injected per loop. Currently wired: the reconstruct semantic-map
 * judgment loop and the review lens/stance fan-out pools — both the flat
 * per-unit loops AND the nested-workers first-attempt batch (§4-1: a batch-window
 * SUCCESS is recorded skipped so a stale batch success never resets the streak,
 * while a batch-window FAILURE is classified like any failure; the
 * directly-observed flat retries drive the streak).
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
 * 5. recovery re-dispatch targets exactly the persisted incomplete set —
 *    today via the persisted artifact consumed by the recovery OPERATOR /
 *    fixture contract (F-B3); automatic stage-level resume from the artifact
 *    is a deferred later cut (§8).
 *
 * File I/O (persisting the artifact), timestamps, and halt mechanics stay in
 * the wiring; this module owns classification, the backoff schedule, the
 * breaker state machine, and the artifact projection.
 */

import path from "node:path";

/**
 * Breaker counting refinement of the shared pipeline ledger's OPEN
 * `failure_class` set (pipeline-execution-ledger.ts — parent concept):
 * `rate_limit`/`auth` refine the ledger's `provider_error`, `transport`
 * refines its `timeout`/`provider_error` family. The dead-letter artifact's
 * `failure_class` field deliberately mirrors that ledger field name.
 */
export type SystemicDispatchFailureClass = "rate_limit" | "auth" | "transport";

const RATE_LIMIT_PATTERNS = [
  "429",
  "rate limit",
  "limit reached",
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

/** Single source for the transient-transport message patterns shared with the
 * review runner's per-unit retry decision (isTransientExecutorFailureMessage)
 * — the two consumers differ only in their extras. */
export const TRANSIENT_TRANSPORT_MESSAGE_PATTERNS = [
  "stream disconnected before completion",
  "connection reset by peer",
  "error sending request",
  "failed to connect to websocket",
  "transport channel closed",
  "http/request failed",
  "request failed after",
] as const;

const TRANSPORT_PATTERNS = [
  ...TRANSIENT_TRANSPORT_MESSAGE_PATTERNS,
  "timed out",
  "timeout",
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

/**
 * Classify a dispatch ERROR: structured provider status first (the SDK
 * adapters rethrow the original error with `.status` preserved), message
 * substrings as the fallback for the CLI/worker adapters that flatten
 * everything into text.
 */
export function classifyDispatchError(
  error: unknown,
): SystemicDispatchFailureClass | null {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") {
    if (status === 429) return "rate_limit";
    if (status === 401 || status === 403) return "auth";
    if (status >= 500) return "transport";
  }
  return classifySystemicDispatchFailure(
    error instanceof Error ? error.message : String(error),
  );
}

/** Marker stamped by {@link runWithDispatchBackoff} on errors that came from
 * an actual provider dispatch. Item-level attribution MUST read the marker
 * (readDispatchFailureClass) instead of re-classifying arbitrary error text —
 * deterministic stage errors embed content-derived text (sheet names, row
 * ranges) that substring patterns would misread as systemic. */
const DISPATCH_FAILURE_CLASS = Symbol.for("onto.dispatch_failure_class");

function markDispatchFailureClass(
  error: unknown,
  failureClass: SystemicDispatchFailureClass | null,
): void {
  if (error !== null && typeof error === "object") {
    (error as Record<PropertyKey, unknown>)[DISPATCH_FAILURE_CLASS] = failureClass;
  }
}

/** Systemic class of a dispatch-marked error; null for unmarked errors
 * (deterministic/stage-local throws) and marked-but-item-local failures. */
export function readDispatchFailureClass(
  error: unknown,
): SystemicDispatchFailureClass | null {
  if (error === null || typeof error !== "object") return null;
  const failureClass = (error as Record<PropertyKey, unknown>)[DISPATCH_FAILURE_CLASS];
  return failureClass === "rate_limit" || failureClass === "auth" || failureClass === "transport"
    ? failureClass
    : null;
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
  /** Per-CALL total attempt cap (1 original + backoff retries) for
   * systemic-class failures. Breaker counting is per ITEM (observation);
   * backoff is per call. */
  per_call_max_attempts: number;
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

  /** Report a REAL dispatch success — the only event that proves the
   * provider lane is alive and may reclassify pending systemic failures as
   * poison. Items that made no successful provider call must use
   * {@link recordItemSkipped} instead. */
  recordItemSuccess(itemId: string): void {
    this.completed.push(itemId);
    // Attribution freezes at trip: a CONCURRENT pool (review lens/stance)
    // can deliver an in-flight success after the trip decision, and letting
    // it reclassify the pending outage victims as poison would dead-letter
    // them OUT of the incomplete recovery set (규칙 5 위반). The late unit
    // itself still counts as completed.
    if (this.trip !== null) return;
    // The provider lane is alive: pending systemic failures were item-scoped
    // after all — poison, dead-lettered.
    for (const entry of this.pendingSystemic) this.deadLetter.push(entry);
    this.pendingSystemic = [];
  }

  /** Report an item that owes no dispatch (structural skip, budget cap, all
   * subsumed): completed for recovery-set purposes, but it proves NOTHING
   * about the provider lane — the systemic streak and pending attribution
   * are untouched. Conflating this with success let one interleaved skip
   * reset an outage streak and write its victims off as poison. */
  recordItemSkipped(itemId: string): void {
    this.completed.push(itemId);
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
      // Post-trip in-flight systemic failures still join the pending set —
      // they are outage victims and belong to the incomplete recovery set.
      this.pendingSystemic.push(entry);
    }
    if (
      this.policy.enabled &&
      this.trip === null &&
      this.pendingSystemic.length >= this.policy.systemic_threshold
    ) {
      // The FIRST crossing is the trip authority; later records must not
      // rewrite its count (stable halt_reason/artifact for audit).
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
}

export class DispatchBreakerTrippedError extends Error {
  readonly trip: DispatchBreakerTripState;

  constructor(trip: DispatchBreakerTripState, incompleteArtifactPath?: string | null) {
    super(
      `dispatch breaker tripped: ${trip.failure_class} failed ${trip.consecutive_item_count} consecutive items (threshold ${trip.threshold}) — batch halted, incomplete items persisted for exact re-dispatch${
        incompleteArtifactPath ? ` (${incompleteArtifactPath})` : ""
      }`,
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
    "per_call_max_attempts" | "backoff_initial_ms" | "backoff_cap_ms"
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
  const maxAttempts = Math.max(1, args.policy.per_call_max_attempts);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await args.dispatch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failureClass = classifyDispatchError(error);
      markDispatchFailureClass(error, failureClass);
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

/** Session-root location of the dead-letter/incomplete artifact — part of the
 * F-B3 recovery contract (재디스패치 집합의 진실 위치), shared by every wired
 * pipeline (reconstruct semantic-map, review lens/stance). One batch trips at
 * most once per run (trip is terminal), so a fixed per-session path holds the
 * latest batch's end state; the `pipeline`/`batch_label` fields identify it. */
export function dispatchIncompleteArtifactPath(sessionRoot: string): string {
  return path.join(sessionRoot, "dispatch-incomplete.yaml");
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
