# coverage Lens Result

session_id: 20260611-bad3651a
lens_id: coverage
schema_version: 2
session_domain: none

## Structural Inspection

The target is a single well-formed TypeScript file (`notification-batcher.ts`, 48 lines) containing one exported interface (`PendingNotification`), one module constant (`WINDOW_MS`), and one exported class (`NotificationBatcher`) with two private fields and three public methods (`enqueue`, `flush`, `pendingUserCount`). Declarations parse cleanly; types are internally consistent; documented contracts exist at the class level (lines 1-4), field level (line 8), and method level (lines 18, 26-29, 37-38, 44). No structural defects block the review. Coverage inspection therefore proceeds against the declared contracts and the dimension checklist (time authority, lifecycle completeness, audit-record enforcement, single-authority designation).

## Findings

### Finding 1: COV-1 — No single time-source authority for window-closure arithmetic

```yaml
target: "NotificationBatcher window-closure time base (enqueue/flush pair)"
evidence_anchor: "notification-batcher.ts:20, notification-batcher.ts:30-32"
claim: "The window lifecycle is governed by two parallel, unreconciled time sources — an internal wall clock (Date.now() in enqueue) and a caller-injected `now` (flush) — and the system designates no single time authority nor declares any contract that the two share one time base; window closure can therefore fail in both directions (never closes, or closes immediately)."
lens_id: coverage
upstream_evidence_required: false
severity_hint: high
```

**What**: `enqueue` stamps `windowStartedAt` from `Date.now()` (line 20, epoch ms wall clock). `flush(now)` decides window closure by computing `now - this.windowStartedAt` (line 32) against a caller-supplied `now`. Nothing in the interface, the method doc (lines 26-29), or the parameter type declares that `now` must be epoch-ms wall-clock time drawn from the same clock as `Date.now()`. The time dimension is managed in two places with no single source of authority designated — a dimension deficit in an element that exists (the window) rather than a missing element.

**Why**: Evidence-to-claim derivation: line 20 shows the internal stamp authority (`Date.now()`); line 30 shows the type of the external authority is only `number` with no time-base semantics; line 32 shows the two authorities being subtracted in the closure predicate. The subtraction is only meaningful if both numbers are from the same time base — a precondition the bounded target nowhere states or enforces. A caller passing `performance.now()` (monotonic, starts near 0) makes `now - windowStartedAt` hugely negative, so the window never closes and notifications are never delivered; a caller passing seconds instead of ms, or a simulated test clock, breaks closure in either direction. The request summary explicitly scopes "time-source semantics", and the review-target-profile obligations classify a visible runtime-contract failure inside the bounded target as material against the `correctness` goal — this mismatch is fully visible within the file.

**How to fix**: Designate a single time authority. Either (a) inject time everywhere: have `enqueue` accept/derive `now` from the same injected clock the caller uses for `flush` (constructor-injected `clock: () => number`), or (b) own time internally: have `flush()` take no parameter and use `Date.now()` itself. If the injected-`now` polling API must stay, document the required time base on `flush(now)` ("epoch ms from the same clock as Date.now()") as a minimum stopgap — but contract-by-comment is weaker than removing the dual authority.

**Causal path** (bounded evidence to starting cause): closure predicate mixes two clocks (line 32) ← `windowStartedAt` is stamped from the internal wall clock (line 20) ← `flush` externalizes its time source as a bare `number` parameter with no time-base contract (line 30) ← starting cause: the design splits time authority across the API boundary (testability-style injection in `flush`, hard-coded `Date.now()` in `enqueue`) without designating which clock is canonical.

### Finding 2: COV-2 — Documented carry-over guarantee has no implementing mechanism

```yaml
target: "NotificationBatcher.flush reset semantics vs documented carry-over contract"
evidence_anchor: "notification-batcher.ts:37-39"
claim: "The comment declares that notifications enqueued between the window-close check and the reset 'are carried into the next window', but no mechanism implementing carry-over exists; the actual reset (`this.pending.clear()`) deletes the entire map, so any such notification would be silently dropped — the declared sub-behavior is absent from the system."
lens_id: coverage
upstream_evidence_required: false
severity_hint: medium
```

**What**: Lines 37-38 document a late-arrival preservation guarantee: items enqueued between the close check (line 32) and the reset are "carried into the next window". The implementation at line 39 is an unconditional `this.pending.clear()`, which removes every entry — including any hypothetical late arrival. The system contains no selective-removal, snapshot-then-diff, or re-queue mechanism that could realize the documented guarantee.

**Why**: Evidence-to-claim derivation: the comment (lines 37-38) is the declared contract; `clear()` (line 39) is the entire reset mechanism, and `Map.prototype.clear` removes all entries unconditionally — directly contradicting "carried into the next window" for any item present but not yet digested. In the current single-threaded synchronous runtime the check-to-reset interval inside one `flush` call cannot be interleaved by `enqueue`, so the harm is latent rather than active; but the review goals explicitly include contract-vs-behavior consistency and `regression_risk`: the comment invites a future async/concurrent refactor (e.g., awaiting a send inside the loop) to rely on a safety property that the mechanism does not provide, producing silent notification loss while documentation claims the opposite.

**How to fix**: Make behavior and contract converge. Either (a) implement the guarantee: snapshot the digested keys/items and delete only those (`for (const userId of digestedUserIds) this.pending.delete(userId)`), or replace the map with a fresh one after capturing a reference; or (b) retract the contract: rewrite the comment to state the true semantics ("the entire pending map is dropped at flush; flush must not be interleaved with enqueue").

**Causal path** (bounded evidence to starting cause): declared carry-over (lines 37-38) is contradicted by the reset (line 39) ← reset is implemented as a whole-map `clear()` rather than removal of only the flushed items ← starting cause: the reset mechanism was written at window granularity while the documented guarantee is written at item granularity; the item-granularity concept ("late-enqueued notification") has no representation in the code.

### Finding 3: COV-3 — Batch-entry time record (`enqueuedAt`) has no enforcement authority

```yaml
target: "PendingNotification.enqueuedAt entry-time record"
evidence_anchor: "notification-batcher.ts:8-9, notification-batcher.ts:19-24"
claim: "The field contract declares enqueuedAt as 'epoch ms when the notification entered the batch', but the method that owns batch entry (enqueue) neither stamps nor validates it; the entry-time record is caller-trusted, and entry time is managed in two parallel places (per-item enqueuedAt, per-window windowStartedAt via Date.now()) with no single authority designated."
lens_id: coverage
upstream_evidence_required: false
severity_hint: medium
```

**What**: Line 8 documents `enqueuedAt` as the moment the notification "entered the batch". Batch entry happens exclusively inside `enqueue` (lines 19-24), yet `enqueue` never writes or checks `item.enqueuedAt` — the value is whatever the caller chose to put there. Meanwhile the class records its own entry-adjacent timestamp (`windowStartedAt`, line 20) from `Date.now()`. The temporal audit dimension exists nominally on the data shape but lacks the enforcement mechanism, and two parallel time records coexist without a designated canonical source.

**Why**: Evidence-to-claim derivation: the field doc (line 8) asserts a fact about an event ("entered the batch") that only `enqueue` can witness; the `enqueue` body (lines 19-24) shows no assignment to or read of `enqueuedAt`, so the asserted fact is unenforced — divergence between recorded and actual entry time is unbounded and undetectable within the target. This matters under the `verifiability` review goal: any downstream consumer (ordering, age-based expiry, audit) that trusts the documented semantics builds on a record no component guarantees. Whether `enqueuedAt` is consumed elsewhere is outside the bounded target; this finding is confined to the in-target gap between the field's declared semantics and the entry-owning method's behavior. (Whether the field is unused dead weight is a separate perspective's scope and is not claimed here.)

**How to fix**: Assign stamping authority to the entry owner: have `enqueue` set `enqueuedAt` itself (from the single clock chosen in COV-1's fix), changing the input type to omit the field (`Omit<PendingNotification, "enqueuedAt">`); or, if callers must supply it, change the doc to "caller-asserted creation time" and stop claiming it records batch entry.

**Causal path** (bounded evidence to starting cause): entry-time record is caller-trusted (lines 19-24 never touch it) ← the field's semantics are declared on the interface (line 8) but the stamping responsibility was never assigned to the entry-owning method ← starting cause: the data shape and the behavior were specified independently; the contract names an event-derived value without designating which component has authority to derive it.

### Finding 4: COV-4 — Pending-item lifecycle lacks termination coverage outside the happy path

```yaml
target: "NotificationBatcher pending-item lifecycle and monitoring surface"
evidence_anchor: "notification-batcher.ts:14-48"
claim: "The pending-notification lifecycle covers entry (enqueue) and one exit (poll-driven flush) only; no expiry, size-bound, or overflow concept exists for the case where polling stops, and the monitoring surface (pendingUserCount) exposes user count only — item count and item age are unobservable, so unbounded accumulation is invisible."
lens_id: coverage
upstream_evidence_required: false
severity_hint: low
```

**What**: The only exit from `pending` is a caller-driven `flush` poll (lines 30-42). If polling stops or slows, items accumulate without bound; no max-age, max-size, or shedding concept is represented. The sole monitoring metric (lines 44-47) counts users, not items or oldest-item age, so the accumulation dimension that can actually grow without bound (items per user) has no observable.

**How to fix**: If the component is intended for long-lived use, add a bounded-resource concept (per-user item cap or max age) and extend the monitoring surface with `pendingItemCount()` and/or oldest `enqueuedAt` age. Kept surface-only per severity; no causal-path tracing claimed.

### Domain Constraints Used

[]

### Domain Context Assumptions

- "session_domain is none; no domain document was available or used (no domain document available within boundary)."
- "Assumed single-threaded synchronous JavaScript/TypeScript runtime semantics when judging that the check-to-reset interval inside one flush call cannot currently be interleaved by enqueue (COV-2 latency-of-harm assessment)."
- "Assumed the component is used via the documented polling pattern (callers repeatedly invoke flush), as stated in the flush doc comment."
- "Assumed no external wrapper outside the bounded target stamps or validates enqueuedAt before calling enqueue."
