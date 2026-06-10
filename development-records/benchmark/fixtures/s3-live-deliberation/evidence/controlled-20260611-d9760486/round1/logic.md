# logic Review Result

session_id: 20260611-d9760486
lens_id: logic
schema_version: 2
session_domain: none

## Structural Inspection

Claim unitization (prose/doc-comment claims plus code rules, per role §Claim unitization):

- C1 (definition, notification-batcher.ts:2-3): the batcher "collects notifications per user and flushes them as one digest when the batch window closes".
- C2 (definition, notification-batcher.ts:8-9): `enqueuedAt` is the "Epoch ms when the notification entered the batch".
- C3 (rule sentence, notification-batcher.ts:18,20): the window starts on first enqueue; implementation binds the start instant to `Date.now()`.
- C4 (rule sentence, notification-batcher.ts:27): `flush` "Flushes when the window has closed".
- C5 (conditional rule, notification-batcher.ts:28): "an empty array means 'window still open'".
- C6 (code rule, notification-batcher.ts:30-32): window-closed predicate is `now - windowStartedAt >= WINDOW_MS`, where `now` is caller-supplied and `windowStartedAt` was sampled from `Date.now()`.
- C7 (rule sentence, notification-batcher.ts:37-38): "Notifications enqueued between the window close check and this reset are carried into the next window."
- C8 (code rule, notification-batcher.ts:34-36,39-40): at flush, every entry currently in `pending` is emitted into the returned digests, then `pending.clear()` removes all entries and `windowStartedAt` resets to null.
- C9 (definition, notification-batcher.ts:44-46): `pendingUserCount` is the number of users with pending notifications.

Invariant check (pass observations within boundary):

- `windowStartedAt !== null` implies `pending.size >= 1` (lines 19-23 set both together; lines 39-40 reset both together), so a closed window always yields at least one digest — C1's "one digest per user" is internally consistent with C8. Verdict for this pair: pass.
- C9 matches `pending.size` exactly. Verdict: pass.

Findings against the remaining claim set follow. Severity for blocker/high/medium findings is traced to the starting cause inside the bounded target.

## Findings

### Finding L1 — Window-closure predicate mixes two time authorities

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:20, notification-batcher.ts:30-32"
claim: "The window-closed predicate compares a caller-supplied clock (`now`) against an internally sampled ambient clock (`Date.now()`); the rule set is jointly satisfiable only under an undeclared necessary condition that both values come from the same epoch-ms clock, so C4 ('flushes when the window has closed') is violated for permitted inputs. severity: high; direction: contract-vs-behavior unsoundness in time-source semantics."
lens_id: logic
```

- verdict: fail
- upstream_evidence_required: false
- conflict_pair: `notification-batcher.ts:20` (C3: `windowStartedAt = Date.now()`) ↔ `notification-batcher.ts:30-32` (C4+C6: `flush(now)` compares caller `now` to `windowStartedAt`)
- satisfiability_note: inter-claim. C3 fixes the window-start instant on the ambient `Date.now()` timeline at enqueue; C6 evaluates closure using a caller-supplied `now` at flush. The two claims interact through a single subtraction that presumes one shared clock.
- modality_note: mixed — modality classification error. For C4 to hold, "`now` is epoch ms from the same clock as `Date.now()`" must be a *necessary* constraint; the declared contract (type `number`, no doc on `flush`'s `now`) makes it merely *possible*. A necessary condition is treated as optional.
- boundary_handoff_note: The undocumented unit/clock-base of the `now` parameter is a naming/meaning gap owned by semantics. However, even after disambiguating `now` as epoch ms, the residual contradiction remains: the API injects time at flush (caller-controlled time) while enqueue binds window start to ambient time (environment-controlled time), so a caller that drives time externally (test clock, replayed clock, skewed clock) still cannot make C4 and C6 agree. Residual contradiction after disambiguation → logic primary, per Logic ↔ Semantics tie-breaker.

**what** — `enqueue` records the window start with `Date.now()` (line 20). `flush(now)` decides window closure with `now - this.windowStartedAt < WINDOW_MS` (line 32), where `now` is supplied by the caller. Nothing in the declared contract states that `now` must be wall-clock epoch ms from the same clock; the parameterized `now` reads as a time-injection seam, which only makes sense when caller time may differ from ambient time — exactly the case where the predicate breaks.

**why** — Evidence-to-claim derivation: line 20 directly establishes that `windowStartedAt` lives on the `Date.now()` epoch-ms timeline (supports "internally sampled ambient clock"). Lines 30-32 directly establish that closure is computed from caller-supplied `now` against that value (supports "caller-supplied clock compared against it"). The signature `flush(now: number)` with no time-base documentation establishes that any number is a permitted input (supports "violated for permitted inputs"): a caller passing a monotonic-clock value (small magnitude) makes `now - windowStartedAt` hugely negative, so flush returns `[]` forever and C4 ("flushes when the window has closed") is never satisfied; a caller passing a larger-epoch value flushes immediately, violating the 30s window rule. Starting cause (causal trace for high severity): the design splits time authority across the two mutating entry points — window start from the ambient clock at `enqueue` (line 20), window closure from injected time at `flush` (line 30) — so the closure rule's truth depends on an inter-clock identity that no claim in the target declares or enforces.

**how to fix** — Use one time authority for the whole window lifecycle. Either (a) thread the caller clock through both entry points (`enqueue(item, now)` or use `item.enqueuedAt` to start the window) so the caller-supplied clock is the single authority, or (b) drop the `now` parameter and use `Date.now()` inside `flush` so the ambient clock is the single authority. If (b), the time-injection seam for tests must be provided differently (injected clock dependency). At minimum, document on `flush` that `now` must be epoch ms from the same clock as `Date.now()` — but the single-authority fix removes the contradiction rather than restating the constraint.

### Finding L2 — Reset comment guarantees carry-over that the implementation contradicts

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:37-40, notification-batcher.ts:34-36"
claim: "The comment claims notifications enqueued between the window-close check and the reset are carried into the next window, but under synchronous execution that interval admits no enqueues (the claim is vacuous), and under the only materially reachable reading (enqueued after the window-close instant, before the flush poll) such items are emitted in the *current* digest and cleared, never carried over. The documented guarantee and the implemented behavior are not jointly satisfiable. severity: medium; direction: contract-vs-behavior contradiction."
lens_id: logic
```

- verdict: fail
- upstream_evidence_required: false
- conflict_pair: `notification-batcher.ts:37-38` (C7: carry-over guarantee) ↔ `notification-batcher.ts:34-36,39` (C8: digest loop emits all current entries, then `pending.clear()` removes everything)
- satisfiability_note: inter-claim. C7 asserts survival of in-interval enqueues into the next window; C8 implements unconditional emission-plus-clear of the entire map within one synchronous call, leaving no mechanism that could realize carry-over.
- modality_note: obligatory — C7 states an obligatory behavior (items *are* carried into the next window) with no implementing mechanism; the code makes the obligated state unreachable. Modality error type: an obligation asserted over an interval that the execution model makes empty (vacuous obligation), masking the false guarantee in the reachable interpretation.
- boundary_handoff_note: The referent of "between the window close check and this reset" is ambiguous (intra-call code interval vs wall-clock interval between window close and the poll). That referent ambiguity is semantics-owned; the contradiction under the reachable reading remains after disambiguation, so logic retains the primary finding.

**what** — The comment at lines 37-38 documents a loss-safety guarantee: notifications enqueued between the close check and the reset survive into the next window. In single-threaded synchronous JS, no enqueue can interleave between line 32 and line 39 within one `flush` call, so read literally the interval is empty. The reading with actual reachable behavior — items enqueued after the window-close *instant* (`windowStartedAt + WINDOW_MS`) but before the caller polls `flush` — behaves oppositely: those items sit in `pending`, are emitted in the closing digest by the loop at lines 34-36, and are wiped by `clear()` at line 39. Nothing is ever carried into the next window.

**why** — Evidence-to-claim derivation: lines 34-36 show the digest loop iterates the entire `pending` map with no timestamp filter (supports "emitted in the current digest" — note `enqueuedAt` is not consulted), and line 39 shows unconditional `clear()` (supports "never carried over"). Lines 37-38 are the carry-over assertion itself. Together they make C7 ∧ C8 unsatisfiable for any item present in the map at flush time. Starting cause (causal trace for medium severity): no code path snapshots window membership at the close instant — the close check (line 32) gates timing only, while content is taken wholesale at emission time — so the carry-over the comment promises has no mechanism that could implement it.

**how to fix** — Make the code and the claim agree. Either (a) implement the guarantee: filter the digest loop to items with `enqueuedAt < windowStartedAt + WINDOW_MS` and retain later items in `pending` (re-seeding `windowStartedAt` for the next window) — this also gives `enqueuedAt` its missing consumer (see L4); or (b) correct the comment to state actual behavior: "all pending notifications at flush time, including any enqueued after the window closed, are emitted in this digest; nothing carries over."

### Finding L3 — Empty-array sentinel rule is violated in the reachable no-window state

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:28, notification-batcher.ts:31"
claim: "The documented interpretation rule 'an empty array means window still open' is contradicted by the no-window state: when windowStartedAt is null (nothing enqueued, or just flushed), flush returns [] although no window exists, so the conditional rule 'empty ⇒ window still open' is false in a reachable state. severity: low; direction: contract-vs-behavior inconsistency in the return-value protocol."
lens_id: logic
```

- verdict: fail
- upstream_evidence_required: false
- conflict_pair: `notification-batcher.ts:28` (C5: empty array ⇒ window still open) ↔ `notification-batcher.ts:31` (code returns `[]` when `windowStartedAt === null`, i.e., when no window exists)
- satisfiability_note: inter-claim. C5 is a doc-level conditional rule over the return value; line 31 is a code rule producing the same return value in a state C5's consequent excludes.
- modality_note: necessary — C5 asserts a necessary implication (empty return ⇒ open window) that the code does not maintain; the no-window state makes the antecedent true and the consequent false.
- boundary_handoff_note: "" (the sentinel overload is a formal rule violation independent of naming ambiguity; kept surface-only per severity).

**what** — `flush` returns `[]` in two distinct states: "window open, not yet closed" (line 32) and "no window started at all" (line 31). The doc comment collapses both into "window still open", which is false in the second state. A polling caller cannot distinguish "still batching" from "idle" through the documented protocol.

**why** — Evidence-to-claim derivation: line 28 states the interpretation rule (supports the "documented rule" half of the claim); line 31 returns `[]` precisely when `windowStartedAt === null`, a state in which no window is open (supports the "reachable counterexample" half). Low severity, surface-only per execution directives: behaviorally benign for pure polling loops, but the stated protocol is formally false.

**how to fix** — Either narrow the doc ("an empty array means there is nothing ready to flush — the window is still open or no notifications are pending") or split the protocol (e.g., return `null` for no-window vs `[]` for window-open) if callers need to distinguish the states.

### Finding L4 — `enqueuedAt` defines the batch-entry instant, but the batcher records that instant from a different source and never reads the field

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:8-9, notification-batcher.ts:20"
claim: "C2 defines enqueuedAt as 'Epoch ms when the notification entered the batch', yet enqueue records the same event instant independently via Date.now() and never consults enqueuedAt anywhere; the definition holds only under the undeclared necessary condition that callers pass Date.now() at call time, so the model permits states in which the field's definition is false. severity: low; direction: definitional inconsistency in time-source semantics."
lens_id: logic
```

- verdict: fail
- upstream_evidence_required: false
- conflict_pair: `notification-batcher.ts:8-9` (C2: `enqueuedAt` = batch-entry instant) ↔ `notification-batcher.ts:20` (C3: batch-entry/window-start instant realized as `Date.now()`)
- satisfiability_note: inter-claim. Two recordings purport to denote the first-enqueue instant — the caller-supplied `enqueuedAt` of the first item and the internally sampled `windowStartedAt` — and the model permits them to diverge with no reconciliation rule.
- modality_note: necessary — same modality pattern as L1: "caller passes `Date.now()` as `enqueuedAt`" would need to be a necessary constraint for C2 to hold, but it is only possible under the declared contract.
- boundary_handoff_note: The field being declared-but-never-read is a dead-surface concern owned by conciseness/structure; logic owns only the divergence of two definitions of one instant. Routed accordingly.

**what** — The interface obligates every caller to provide `enqueuedAt` and defines it as the batch-entry time, but the class derives all time semantics (window start, closure) from other sources and never reads the field. The first item's `enqueuedAt` and `windowStartedAt` should denote the same instant yet are bound to different authorities.

**why** — Evidence-to-claim derivation: lines 8-9 carry the definition (supports "defines the batch-entry instant"); line 20 shows the same instant being captured from `Date.now()` while `item.enqueuedAt` is ignored — `enqueuedAt` appears nowhere else in the file (supports "recorded from a different source and never read"). Low severity, surface-only: no behavior currently depends on the field, so the divergence is latent rather than active.

**how to fix** — Pick one authority for the batch-entry instant: use `item.enqueuedAt` to start the window (making the field load-bearing and aligning with the L1 single-authority fix, option a), or remove the field from the required interface if the batcher is the time authority. Document the chosen authority on the interface.

## No-Issue Rationale (remaining scope)

Within the bounded target, no further contradictions were observed: the pending-map/window-flag pairing is updated atomically at both mutation sites, so the "one digest per user" claim, the per-user collection claim, and `pendingUserCount` are mutually consistent (pass; this is a boundary-scoped observation, not a global satisfiability proof).

### Domain Constraints Used
[]

### Domain Context Assumptions
- "Single-threaded synchronous JavaScript execution model: no enqueue can interleave between statements inside one flush() invocation."
- "flush(now) callers may pass any numeric value; the type system imposes no time-base restriction on the parameter."
- "Callers interact with the batcher only through the exported API (enqueue, flush, pendingUserCount)."
