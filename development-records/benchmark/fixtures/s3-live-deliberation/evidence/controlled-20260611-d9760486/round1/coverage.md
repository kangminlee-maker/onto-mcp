# coverage Review Result

session_id: 20260611-d9760486
lens_id: coverage
target: notification-batcher.ts

## Structural Inspection

- ME violation: N/A (single-file computational artifact; no ontology partition to check)
- CE violation: N/A
- definition explicitness: Checked. `PendingNotification` and the flush contract are explicitly documented (notification-batcher.ts:1-9, 26-29); the time source for `flush(now)` is NOT explicitly defined — carried into Finding 1.
- axis explicitness: Checked. The temporal axis is declared at input (`enqueuedAt`, notification-batcher.ts:8-9) but absent on the output/history side — carried into Finding 4.
- domain cross-reference validity: N/A (session_domain=none; no domain document within boundary)
- ghost sub-area check: Performed. Lifecycle termination (drain/dispose) and capacity/overflow are implied by the batching domain but absent — carried into Findings 2 and 3.
- rule-CQ linkage: N/A
- inference path validity: N/A

## Findings

### Finding 1 — No single time-source authority for window decisions

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:20,30-32"
claim: "Window-closure decisions mix two undeclared time authorities (internal Date.now() at enqueue vs caller-supplied now at flush) with no single time-source authority concept; severity: high; direction: designate one clock authority and route both window anchoring and window-closure comparison through it."
lens_id: coverage
upstream_evidence_required: false
```

**What**: `enqueue` anchors `windowStartedAt` with the internal wall clock `Date.now()` (notification-batcher.ts:20), while `flush(now)` decides window closure by comparing that anchor against a caller-supplied `now` (notification-batcher.ts:30-32). Neither the interface nor the doc comments (notification-batcher.ts:26-29) declares which clock `now` must come from or that it must be the same authority as `Date.now()`. The system therefore manages one time-dependent value (window age) across two parallel time sources with no single-origin (authority) designation — a dimensional deficit the coverage perspective flags directly (parallel-managed value without a single designated authority).

**Why**: Evidence-to-claim derivation: line 20 shows the window anchor is produced by `Date.now()` (authority A); line 32 shows the closure predicate `now - this.windowStartedAt < WINDOW_MS` consumes caller-supplied `now` (authority B) against that anchor. No declaration anywhere in the file binds B to A — that absence is the claim. Causal path to the starting cause within bounded evidence: (1) the contract lacks any clock-authority concept (no clock parameter on enqueue, no documented requirement on `now`'s source — absence across lines 18-32); (2) therefore `windowStartedAt` is anchored to the internal wall clock (line 20); (3) therefore the closure predicate (line 32) is a cross-clock subtraction whenever the caller's `now` comes from a different epoch or skewed source (test clock, monotonic clock, mocked scheduler time); (4) a cross-clock subtraction makes the window close never, early, or instantly, violating the declared correctness goal inside the bounded target. The request summary explicitly scopes time-source semantics into this review.

**How to fix**: Designate a single time authority. Smallest in-target fix: stop calling `Date.now()` in `enqueue` and instead anchor the window from the same caller-supplied time source — e.g. `enqueue(item, now)` or an injected `clock: () => number` used by both methods. Document on `flush` that `now` must come from that same authority.

### Finding 2 — Lifecycle termination segment missing (no drain/dispose path)

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:30-32,44-47"
claim: "The pending-notification lifecycle covers enqueue and window-gated flush but has no termination segment (drain/close/dispose); pending items are unreachable at shutdown or poller stop and are silently lost; severity: medium; direction: add a terminal drain operation that flushes regardless of window state."
lens_id: coverage
upstream_evidence_required: false
```

**What**: The class exposes exactly three operations: `enqueue` (notification-batcher.ts:19-24), window-gated `flush` (30-42), and `pendingUserCount` (45-47). The only path that removes items from `pending` is `flush`, and it is gated by `WINDOW_MS` (line 32) and by callers polling it (line 28). There is no end-of-life operation — no drain, close, or force-flush. The lifecycle of a stateful element does not cover its terminal segment.

**Why**: Evidence-to-claim derivation: the full exported surface (lines 5-48) contains no member other than the three listed; line 32 shows the single exit path is conditional on window age; line 28 shows that exit additionally depends on external polling. Causal path to the starting cause: (1) no terminal-lifecycle concept exists in the API (absence across the whole class body); (2) therefore every pending item's only exit is a future poll that satisfies the window predicate; (3) at process shutdown, poller failure, or batcher decommission, that future poll never happens; (4) pending notifications are silently dropped with no contract acknowledging it — a correctness and regression risk inside the declared review goal.

**How to fix**: Add a terminal operation, e.g. `drain(): Array<{ userId: string; digest: string }>` that emits digests for all pending items regardless of `WINDOW_MS` and resets state; document that callers must invoke it on shutdown.

### Finding 3 — No capacity or backpressure concept (unbounded pending growth)

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:21-23,32"
claim: "The pending store grows without bound — no max-size, overflow policy, or backpressure concept exists, while the only reducer (flush) is poll- and window-gated; severity: medium; direction: introduce a capacity bound with an explicit overflow policy."
lens_id: coverage
upstream_evidence_required: false
```

**What**: `enqueue` unconditionally appends to the per-user list (notification-batcher.ts:21-23) for any number of users and items. The only operation that shrinks `pending` is `flush`, which returns early unless the window has closed (line 32) and only runs when an external caller polls (line 28). The batching domain implies a capacity/overflow sub-area (bounded buffers, drop/force-flush policies); it is entirely absent here.

**Why**: Evidence-to-claim derivation: lines 21-23 show enqueue has no size check or rejection path; line 32 shows the sole reducer is conditional; nothing else in the file mentions a bound. Causal path to the starting cause: (1) no capacity concept exists in the contract or implementation (absence across lines 14-48); (2) therefore memory consumption is proportional to enqueue rate times the gap between successful polls; (3) a stalled or slow poller — already an unguarded dependency per Finding 2 — turns that into unbounded growth; (4) unbounded growth in a long-lived process is a regression and correctness risk within the declared review goal.

**How to fix**: Add a documented capacity bound (per user and/or total) with an explicit overflow policy — reject, drop-oldest, or force-flush on overflow — and surface overflow occurrences to the caller.

### Finding 4 — Temporal dimension declared at input but absent downstream (enqueuedAt unused; no post-flush evidence)

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:8-9,35,37-38"
claim: "enqueuedAt is a documented contract field but is never read; digests carry only bodies and flush leaves no record of what was delivered when, so past batch state cannot be reconstructed and the carry-over comment is unverifiable; severity: low; direction: either use and propagate the temporal field or remove it, and emit minimal flush evidence."
lens_id: coverage
upstream_evidence_required: false
```

**What**: The input contract declares a temporal dimension — `enqueuedAt: number`, documented as "Epoch ms when the notification entered the batch" (notification-batcher.ts:8-9) — but no code path reads it: digest construction maps only `i.body` (line 35), and nothing orders, ages, or reports items by it. After `flush`, `pending` is cleared (line 39) and no evidence of the delivered batch remains, so a past window's contents cannot be reconstructed. The reset comment (lines 37-38) asserts that late-enqueued notifications "are carried into the next window", but no recorded evidence exists by which that assertion could ever be verified.

**Why**: Evidence-to-claim derivation: lines 8-9 prove the field is part of the declared contract; line 35 is the only consumption point of `PendingNotification` fields and uses only `body`, proving non-use; lines 37-39 show state is destroyed at flush with nothing persisted, proving non-reconstructability. This is a dimensional deficit (declared temporality with no history/evidence counterpart) and bears on the declared verifiability goal. Kept surface-level per severity.

**How to fix**: Either remove `enqueuedAt` from the contract or use it (e.g. order digest lines by it, include timestamps in the digest, or expose flushed-batch metadata). At minimum, have `flush` return or report enough metadata (window start, item counts) that delivered batches are verifiable.

### Finding 5 — Observability dimension gap in the monitoring surface

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:28,44-47"
claim: "Monitoring covers only the user-count dimension (pendingUserCount); there is no pending-item count and no oldest-pending-age metric, so a stalled poll loop — the failure mode the poll-driven contract makes possible — is undetectable; severity: low; direction: add item-count and oldest-age metrics."
lens_id: coverage
upstream_evidence_required: false
```

**What**: The monitoring surface consists solely of `pendingUserCount` (notification-batcher.ts:44-47). Because flush is poll-driven (line 28), the system's characteristic failure mode is pending items aging indefinitely when polling stops (see Findings 2-3). The existing metric covers breadth (how many users) but not volume (how many items) or age (how stale), so concept distribution in the observability sub-area is skewed toward the one dimension that cannot detect the characteristic failure.

**Why**: Evidence-to-claim derivation: lines 44-47 show the metric returns only `this.pending.size` (user keys), and no other introspection member exists in the class body; line 28 establishes the poll dependency that makes age the operationally significant dimension. Kept surface-level per severity.

**How to fix**: Add `pendingItemCount()` and an oldest-age accessor (which would also give `enqueuedAt` a consumer, see Finding 4), so operators can alert on aging pending notifications.

## No-Issue Rationale

Not applicable — findings were raised. Within the coverage perspective, no further sub-area absences were identified beyond the five findings above; per-user grouping, window anchoring, and digest emission sub-areas are present in the bounded target.

### Domain Constraints Used
[]

### Domain Context Assumptions
- "session_domain=none: review executed without a domain document under the Domain-None Self-Contained Rule; no domain-specific rules were applied."
- "Assumed the batcher runs in a long-lived single-process JS/TS runtime where flush is invoked by an external poll loop, as stated by the flush doc comment (notification-batcher.ts:28)."
- "Assumed notification delivery is an operationally significant action for which silent loss is unacceptable, based on the artifact's stated purpose (notification-batcher.ts:1-4)."
