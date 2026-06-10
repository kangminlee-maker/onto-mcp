# semantics — Round 1 Lens Output

session_id: 20260611-bad3651a
lens_id: semantics
target: notification-batcher.ts

## Structural Inspection

Target is a single bounded code file (computational_artifact); ontology-graph checklist items are applied where adaptable, otherwise N/A.

- ME violation: N/A (no ontology graph)
- CE violation: N/A
- definition explicitness: **FAIL** — the `flush(now)` parameter's time source is undeclared; the meaning of `now` is not pinned to any clock (see F1)
- axis explicitness: N/A
- domain cross-reference validity: N/A (session_domain=none)
- ghost sub-area check: **FAIL** — `PendingNotification.enqueuedAt` is declared and documented but never consumed by any behavior (see F3)
- rule-CQ linkage: N/A
- inference path validity: N/A

## Findings

### F1 — Window-elapsed comparison mixes two undeclared time authorities (severity: high)

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:20,30-32"
claim: "The expression `now - this.windowStartedAt` subtracts an internally sourced Date.now() wall-clock value from a caller-supplied `now` whose time source is never declared; the name `now` does not mean 'same clock as windowStartedAt', so the window-duration semantics are not guaranteed by the contract."
lens_id: semantics
upstream_evidence_required: false
```

**What**: `enqueue()` captures the window start internally via `Date.now()` (line 20). `flush(now: number)` (line 30) compares that internal capture against a caller-supplied `now` (line 32). Neither the signature nor the doc comment (lines 26-29) states that `now` must be epoch milliseconds from the same wall clock. Two distinct time concepts — "internal wall-clock now" and "caller-supplied now" — share one name without a unifying contract.

**Why** (evidence-to-claim derivation): Line 20 (`this.windowStartedAt = Date.now()`) fixes the left operand's authority to the system wall clock. Line 32 (`now - this.windowStartedAt < WINDOW_MS`) directly supports the claim that the right operand is caller-controlled with no declared source: the parameter is a bare `number` and the only documented numeric time contract in the file (`enqueuedAt`, line 8: "Epoch ms") belongs to a *different*, unused field. A caller passing `performance.now()` (monotonic, origin ≈ process start) or an injected test clock performs a cross-clock subtraction, which is semantically meaningless.

**Causal path** (bounded evidence to starting cause):
1. Line 20: window start is bound to the `Date.now()` authority inside `enqueue()`.
2. Lines 30-32: window close is decided against an external `now` with no declared authority; the contract (lines 26-29) only documents the return-value meaning, not the parameter's time source.
3. Line 8: the file already establishes that callers supply their own epoch-ms timestamps (`enqueuedAt`), so a caller-side clock distinct from the batcher's internal clock is an in-contract scenario, not a hypothetical.
4. Consequence inside the bounded target: with a monotonic `now`, `now - windowStartedAt` is hugely negative → `flush` returns `[]` forever, which the doc defines as "window still open" → notifications are never delivered. With a skewed or mocked clock the window can also close instantly. The declared review goal (correctness) is violated by a contract gap, with the starting cause being the split time authority introduced at line 20 versus line 30.

**How to fix**: Establish a single time authority. Either (a) drop the parameter and use `Date.now()` inside `flush`, (b) make both sides caller-supplied (`enqueue(item, now)` or use `item.enqueuedAt` — see F3), or (c) inject a clock dependency used by both methods. In all cases, document the required time source of `now` (e.g., "epoch ms from the same clock that produced `enqueuedAt`").

### F2 — Reset comment asserts a carry-over contract the code does not implement (severity: medium)

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:37-39"
claim: "The comment states that notifications enqueued between the window-close check and the reset 'are carried into the next window', but `this.pending.clear()` unconditionally removes every entry; no carry-over behavior exists in the code."
lens_id: semantics
upstream_evidence_required: false
```

**What**: Lines 37-38 document a carry-over invariant for late-arriving notifications. Line 39 (`this.pending.clear()`) deletes the entire map. There is no snapshot of "the entries being digested" versus "entries that arrived after the check"; clear() cannot distinguish them.

**Why** (evidence-to-claim derivation): The comment's claim ("carried into the next window") requires that some entries survive the reset. Line 39 directly contradicts it: `Map.prototype.clear()` removes all entries present at call time. Additionally, the digest loop (line 34) iterates the same live map, so an entry present before the clear is digested in the *current* flush — the opposite of "carried into the next window".

**Causal path**:
1. Lines 37-38 declare the carry-over contract.
2. Line 39 removes all entries unconditionally — the contract has no implementing mechanism.
3. In the current synchronous, single-threaded execution of `flush()`, the described interleaving (enqueue between line 32 and line 39) cannot even occur, so the comment describes a scenario the code neither encounters nor handles as stated.
4. Consequence: a maintainer who later makes `flush` async or re-entrant will rely on the documented invariant and inherit silent notification loss; within the bounded target this is a contract-vs-behavior inconsistency against the declared review goals (correctness, maintainability, regression_risk). The starting cause is the comment encoding an intended-but-unbuilt behavior.

**How to fix**: Either implement the stated semantics (snapshot the keys/entries to digest, delete only those keys, leaving later arrivals in place) or rewrite the comment to state the actual behavior ("all entries pending at flush time are digested and cleared; nothing is carried over").

### F3 — `enqueuedAt` is a documented dead field; window start re-measures the same meaning from a different source (severity: medium)

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:8-9,20"
claim: "The meaning 'time the notification entered the batch' exists twice — as the caller-supplied `enqueuedAt` field and as the internal Date.now() capture in enqueue() — and the two are never unified: the batcher never reads `enqueuedAt`, so the interface advertises a timestamp contract with no behavioral meaning while the window anchors to a divergent second source."
lens_id: semantics
upstream_evidence_required: false
```

**What**: `PendingNotification.enqueuedAt` is documented as "Epoch ms when the notification entered the batch" (line 8) and is a required field (line 9). No method reads it. Instead, `enqueue()` independently re-measures entry time via `Date.now()` (line 20) to anchor the window. `windowStartedAt` is semantically "the first pending notification's batch-entry time" — a value derivable from `min(enqueuedAt)` of pending items — but is modeled as an independent input from a second clock. This is an un-unified synonym pair and a derived-value-vs-input mismatch.

**Why** (evidence-to-claim derivation): Lines 8-9 establish the field's declared meaning and obligatoriness — a required, documented field in an exported interface asserts behavioral relevance to any caller. A whole-file scan shows `enqueuedAt` is never referenced after declaration, which directly supports "no behavioral meaning". Line 20 supports the second half of the claim: the same semantic quantity is re-derived from `Date.now()` rather than from the field that names it.

**Causal path**:
1. Lines 8-9: the interface contract declares `enqueuedAt` as the batch-entry timestamp.
2. Line 20: `enqueue()` ignores `item.enqueuedAt` and re-measures entry time from its own clock — two authorities for one meaning.
3. When a caller backfills or replays notifications (`enqueuedAt` in the past — an in-contract use given the field's documentation), the window silently anchors to processing time instead of the declared entry time; the field's name and the system's behavior diverge.
4. Consequence within the bounded target: callers are misled into believing `enqueuedAt` drives windowing (correctness/verifiability impact), and the duplicate source enables drift between the two timestamps (regression_risk). The starting cause is modeling a derivable value (`windowStartedAt`) as an independent input while keeping its source field (`enqueuedAt`) inert.

**How to fix**: Pick one source of truth. Either derive the window anchor from pending items' `enqueuedAt` (e.g., window starts at the first item's `enqueuedAt`), or remove `enqueuedAt` from the interface (scope permitting) / explicitly document that it is payload-only metadata that does not affect windowing.

### F4 — "batch window" is ambiguous between global and per-user; doc reads per-user, behavior is global (severity: low)

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:1-3,16,20"
claim: "The class doc 'collects notifications per user and flushes them as one digest when the batch window closes' admits a per-user-window reading, but `windowStartedAt` is a single global anchor set by the first enqueue of any user, so a late user's effective window can be arbitrarily short."
lens_id: semantics
upstream_evidence_required: false
```

**What/Why/Fix** (surface-only per severity): The term "batch window" is not disambiguated between "one window per user's batch" and "one global window". The implementation is global (single `windowStartedAt`, line 16). A user whose first notification arrives at t=29.9s is flushed at t=30s. If global windowing is intended, state it in the class doc ("a single shared window across all users"); if per-user windowing is intended, the model needs per-user window anchors.

### F5 — Empty-array return value is a homonym: "window still open" vs "no window exists" (severity: low)

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:28,31-32"
claim: "The doc defines the empty array as meaning 'window still open', but `[]` is also returned when `windowStartedAt === null` (no window/nothing pending); one return value carries two undistinguished meanings."
lens_id: semantics
upstream_evidence_required: false
```

**What/Why/Fix** (surface-only per severity): Line 28 assigns `[]` one meaning; lines 31-32 produce it from two distinct states. Callers monitoring "window still open" cannot distinguish idle from batching. Fix by documenting both meanings, or exposing the distinction (e.g., via the existing `pendingUserCount()` as the disambiguator, documented as such).

## No-Issue Rationale

Not applicable — material findings exist. For completeness: `pendingUserCount()` (lines 44-47) is semantically accurate — the name, doc ("Number of users with pending notifications"), and behavior (`pending.size`, keyed by userId) agree.

### Domain Constraints Used
[]

### Domain Context Assumptions
- "Target runs on a standard single-threaded JavaScript runtime; no preemptive interleaving occurs inside a synchronous method body."
- "Callers are assumed to supply epoch-millisecond wall-clock timestamps where the contract documents 'Epoch ms' (PendingNotification.enqueuedAt)."
- "Polling-driven delivery is assumed intended: the batcher only flushes when callers invoke flush(), per the flush() doc comment."
