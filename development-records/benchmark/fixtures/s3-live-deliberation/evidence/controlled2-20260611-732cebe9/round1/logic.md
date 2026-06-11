# logic Review Result

session_id: 20260611-732cebe9
lens_id: logic
schema_version: 2
session_domain: none

## Structural Inspection

Claim unitization (doc-comment claims and code rules, per role §Claim unitization for prose targets):

- C1 (definition, notification-batcher.ts:2-3): the batcher "collects notifications per user and flushes them as one digest when the batch window closes".
- C2 (definition, notification-batcher.ts:8-9): `enqueuedAt` is the "Epoch ms when the notification entered the batch".
- C3 (rule sentence, notification-batcher.ts:18,20): "Starts the window on first enqueue"; the implementation realizes the start instant as `Date.now()`.
- C4 (rule sentence, notification-batcher.ts:27): `flush` "Flushes when the window has closed. Returns one digest per user."
- C5 (conditional rule, notification-batcher.ts:28): "an empty array means 'window still open'" — i.e., empty return ⇒ window open.
- C6 (code rule, notification-batcher.ts:31-32): closure predicate is `now - windowStartedAt >= WINDOW_MS` with caller-supplied `now`; `windowStartedAt === null` short-circuits to `[]`.
- C7 (rule sentence, notification-batcher.ts:37-38): "Notifications enqueued between the window close check and this reset are carried into the next window."
- C8 (code rule, notification-batcher.ts:34-36,39-40): the digest loop emits every entry currently in `pending` with no timestamp filter, then `pending.clear()` and `windowStartedAt = null` reset everything unconditionally.
- C9 (definition, notification-batcher.ts:44-46): `pendingUserCount` is "Number of users with pending notifications".

Consistency observations that pass within the boundary:

- Mutation atomicity invariant: `windowStartedAt !== null` ⟺ `pending.size >= 1`. Both mutation sites update the pair together (lines 20-23 set, lines 39-40 reset), so a closed window always yields at least one digest; C1 and C8 are jointly satisfiable. Verdict: pass.
- C9 ↔ implementation: `pending.size` counts exactly the users holding non-empty lists (lists are created non-empty at line 21-23 and only removed wholesale). Verdict: pass.
- Window-duration boundary: closure at exactly `windowStartedAt + WINDOW_MS` is consistent (`< WINDOW_MS` keeps open, complement closes); no off-by-one contradiction between C4 and C6. Verdict: pass.

Extra exploration citations (extra_exploration_citation_required=true): the verdict/output schema was confirmed from `/Users/kangmin/cowork/onto-mcp-claude/.onto/processes/review/lens-prompt-contract.md` §8.1-8.3 (referenced by the role's Verdict schema section); output formatting precedent confirmed from a prior logic seat artifact (`development-records/benchmark/fixtures/s3-live-deliberation/evidence/controlled-20260611-d9760486/round1/logic.md`). No other lens output of the current session was read.

## Findings

### Finding L1 — Closure predicate subtracts across two independent time authorities

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:20, notification-batcher.ts:30-32"
claim: "C3 binds the window-start instant to the ambient clock (Date.now()) while C6 evaluates closure against a caller-supplied now; the claim set {C3, C4, C5, C6} is satisfiable only under the undeclared necessary constraint that now is epoch ms from the same clock as Date.now(), so for permitted inputs (any number) C4 'flushes when the window has closed' and C5 'empty means still open' are jointly violated. severity: high; direction: time-source contract unsoundness."
lens_id: logic
```

- verdict: fail
- upstream_evidence_required: false
- conflict_pair: `notification-batcher.ts:20` (C3: `windowStartedAt = Date.now()`) ↔ `notification-batcher.ts:30-32` (C4+C6: closure computed from caller `now`)
- satisfiability_note: inter-claim. C3 places `windowStartedAt` on the ambient epoch-ms timeline at enqueue time; C6 compares it to a number whose timeline the caller chooses at flush time. The single subtraction `now - windowStartedAt` presumes one shared clock that no declared claim establishes.
- modality_note: mixed — modality classification error. "`now` comes from the same epoch-ms clock as `Date.now()`" must hold *necessarily* for C4/C5 to be true, but the declared surface (`now: number`, no time-base documentation) grants it only *possible* status. A necessary precondition is left optional.
- boundary_handoff_note: The missing meaning of the `now` parameter (which clock, which unit) is a semantics-owned naming/meaning gap. The contradiction survives disambiguation, however: even if `now` is documented as epoch ms, the API still splits time authority — enqueue consumes environment time, flush consumes injected time — so any caller that legitimately drives `now` from a non-ambient source (test clock, replay, skew-corrected clock) leaves the claim set unsatisfiable. Residual contradiction after ambiguity removal → logic primary per Logic ↔ Semantics tie-breaker.

**what** — `enqueue` samples `Date.now()` to start the window (line 20). `flush(now)` decides closure via `now - this.windowStartedAt < WINDOW_MS` (line 32) with `now` supplied by the caller. The parameterization of `now` is a time-injection seam, which is meaningful precisely when caller time may differ from ambient time — and that is exactly the condition under which the closure rule stops corresponding to "the window has closed".

**why** — Evidence-to-claim derivation: line 20 establishes the operand `windowStartedAt` lives on the `Date.now()` timeline (supports "binds the window-start instant to the ambient clock"). Lines 30-32 establish the other operand is caller-chosen (supports "evaluates closure against a caller-supplied now"). The untyped-beyond-`number`, undocumented parameter establishes that any numeric value is a permitted input (supports "violated for permitted inputs"): with a monotonic-clock `now` (magnitude ≪ epoch ms), `now - windowStartedAt` is permanently negative, flush returns `[]` forever, C4 is never satisfied while C5 keeps asserting the window is "still open"; with a `now` from a fast-skewed source, the window closes before 30s of real elapsed time, violating C1/C4's window semantics. Causal trace to starting cause (required for high severity): the root is the split of time authority across the two mutating entry points — ambient clock at `enqueue` (line 20) versus injected clock at `flush` (line 30) — with no claim anywhere in the bounded target declaring or enforcing the inter-clock identity the subtraction needs.

**how to fix** — Unify time authority over the window lifecycle. Option (a): make caller time the single authority — accept `now` at both entry points (`enqueue(item, now)`), or derive the window start from `item.enqueuedAt` (which also resolves L4). Option (b): make ambient time the single authority — drop the `now` parameter and call `Date.now()` inside `flush`; provide testability via an injected clock dependency instead of a parameter. Weakest acceptable fix: document on `flush` that `now` MUST be epoch ms from the same clock as `Date.now()` — this restates the constraint but leaves it unenforced; (a) or (b) removes the contradiction structurally.

### Finding L2 — Carry-over guarantee in the reset comment has no realizing mechanism and contradicts the clear

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:37-40, notification-batcher.ts:34-36"
claim: "C7 guarantees that notifications enqueued between the window-close check and the reset are carried into the next window, but C8 emits the entire pending map and clears it unconditionally within one synchronous call: under the literal reading the interval admits no enqueues (vacuous guarantee), and under the only reachable reading (items enqueued after the close instant but before the flush poll) such items are emitted in the current digest and destroyed, never carried over. C7 and C8 are not jointly satisfiable for any item present at flush time. severity: medium; direction: contract-vs-behavior contradiction."
lens_id: logic
```

- verdict: fail
- upstream_evidence_required: false
- conflict_pair: `notification-batcher.ts:37-38` (C7: carry-over obligation) ↔ `notification-batcher.ts:34-36,39` (C8: unfiltered emission then unconditional `clear()`)
- satisfiability_note: inter-claim. C7 asserts survival of late enqueues into the next window; C8 implements emit-all-then-clear-all in one synchronous body, leaving no state path on which an item could survive into the next window.
- modality_note: obligatory — C7 states an obligatory behavior ("are carried into the next window") whose obligated state is unreachable in the model. Modality error type: obligation quantified over an interval the synchronous execution model makes empty (vacuous obligation), which conceals that the guarantee is false under the reachable interpretation.
- boundary_handoff_note: The referent of "between the window close check and this reset" is ambiguous (intra-call statement interval vs wall-clock interval between window close and poll). The referent ambiguity belongs to semantics; since the contradiction persists under both disambiguations, logic retains primary ownership.

**what** — The comment at lines 37-38 documents loss-safety: late notifications survive into the next window. Read literally (between line 32's check and line 39's clear), single-threaded synchronous JS admits no interleaved `enqueue`, so the guarantee quantifies over an empty interval. Read as the reachable wall-clock interval — items enqueued after `windowStartedAt + WINDOW_MS` but before the poller calls `flush` — the behavior is the opposite of the claim: those items are in `pending`, the loop at lines 34-36 emits them into the *closing* digest (no `enqueuedAt` filter exists), and line 39 wipes the map. No item is ever carried into a next window.

**why** — Evidence-to-claim derivation: lines 34-36 show the digest loop iterates the whole map without consulting any timestamp (supports "emitted in the current digest"); line 39 shows unconditional `clear()` (supports "destroyed, never carried over"); lines 37-38 are the contradicted guarantee itself. Causal trace to starting cause (required for medium severity): nothing in the bounded target snapshots window membership at the close instant — line 32 gates only *when* emission happens, while *what* is emitted is taken wholesale from current state — so the promised carry-over has no mechanism that could implement it; the comment describes a design that was not built.

**how to fix** — Reconcile claim and behavior in one direction. (a) Implement the guarantee: filter the digest loop to items with `enqueuedAt < windowStartedAt + WINDOW_MS`, retain later items in `pending`, and re-seed `windowStartedAt` for the retained set — this also gives `enqueuedAt` its missing consumer (cf. L4). (b) Correct the comment to actual behavior: "all notifications pending at flush time, including any enqueued after the window closed, are emitted in this digest; nothing carries over."

### Finding L3 — "Empty means window still open" is false in the reachable no-window state

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:28, notification-batcher.ts:31"
claim: "C5 asserts the conditional rule 'empty array ⇒ window still open', but line 31 returns [] when windowStartedAt is null — a reachable state (never enqueued, or immediately after a flush) in which no window exists at all; the rule's antecedent holds while its consequent is false, so the documented return-value protocol is formally violated. severity: low; direction: contract-vs-behavior inconsistency in the return protocol."
lens_id: logic
```

- verdict: fail
- upstream_evidence_required: false
- conflict_pair: `notification-batcher.ts:28` (C5: empty ⇒ window open) ↔ `notification-batcher.ts:31` (code returns `[]` in the no-window state)
- satisfiability_note: inter-claim. C5 is a doc-level conditional over the return value; line 31 produces that return value in a state excluded by C5's consequent ("no window" ≠ "window still open").
- modality_note: necessary — C5 asserts a necessary implication the code does not maintain; the no-window state is a counterexample model.
- boundary_handoff_note: ""

**what** — `[]` is returned in two semantically distinct states: window open (line 32) and no window started (line 31). The documented protocol collapses both into "window still open", which is false in the second state; a polling caller cannot distinguish "still batching" from "idle" through the documented protocol. Surface-only per severity, per execution directives.

**why** — Evidence-to-claim derivation: line 28 is the documented rule (supports the "asserted conditional" half); line 31 returns `[]` exactly when `windowStartedAt === null`, i.e., when no window is open (supports the "reachable counterexample" half). Behaviorally benign for pure polling loops, but the stated protocol is formally false.

**how to fix** — Narrow the doc ("an empty array means nothing is ready to flush — window still open, or nothing pending"), or split the protocol (e.g., `null` for no-window vs `[]` for open-window) if callers must distinguish the states.

### Finding L4 — Two unreconciled recordings of the batch-entry instant: `enqueuedAt` is defined but never consulted

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:8-9, notification-batcher.ts:20"
claim: "C2 defines enqueuedAt as 'Epoch ms when the notification entered the batch', yet enqueue records the entry instant independently via Date.now() (C3) and the field is read nowhere in the target; the model therefore admits states where the first item's enqueuedAt and windowStartedAt — two recordings of the same instant — diverge with no reconciliation rule, making C2's definition false in permitted states. severity: low; direction: definitional inconsistency in time-source semantics."
lens_id: logic
```

- verdict: fail
- upstream_evidence_required: false
- conflict_pair: `notification-batcher.ts:8-9` (C2: `enqueuedAt` = batch-entry instant) ↔ `notification-batcher.ts:20` (C3: the same instant realized internally as `Date.now()`)
- satisfiability_note: inter-claim. The caller-supplied `enqueuedAt` of the first item and the internally sampled `windowStartedAt` both purport to denote the first-enqueue instant; no claim constrains them to agree.
- modality_note: necessary — same pattern as L1: "callers pass the actual current epoch ms as enqueuedAt" must be necessary for C2 to hold, but the declared contract makes it merely possible.
- boundary_handoff_note: The declared-but-never-read field as dead API surface is owned by coverage/structure; logic owns only the divergence of two definitions of one instant. Routed accordingly.

**what** — The interface obligates callers to supply `enqueuedAt` and defines it as the batch-entry time, but the class derives every time judgment (window start, closure) from other sources and never reads the field. The first item's `enqueuedAt` and `windowStartedAt` should denote the same instant yet are bound to different authorities. Surface-only per severity.

**why** — Evidence-to-claim derivation: lines 8-9 carry the definition (supports "defines the batch-entry instant"); line 20 captures the same instant from `Date.now()` while `item.enqueuedAt` is ignored, and the identifier appears nowhere else in the file (supports "never consulted"). Latent rather than active: no current behavior depends on the field, hence low severity.

**how to fix** — Choose one authority for the batch-entry instant: start the window from `item.enqueuedAt` (making the field load-bearing; aligns with L1 fix option (a)), or drop the field from the required interface if the batcher owns time. Document the chosen authority on the interface.

## No-Issue Rationale (remaining scope)

No further contradictions observed within the bounded target: the pending-map/window-flag pair is mutated atomically at both sites, so C1 ("one digest per user"), per-user collection, and C9 (`pendingUserCount`) are mutually consistent. This is a boundary-scoped pass observation, not a global satisfiability proof.

### Domain Constraints Used
[]

### Domain Context Assumptions
- "Single-threaded synchronous JavaScript execution model: no enqueue can interleave between statements within one flush() invocation."
- "flush(now) callers may pass any numeric value; the type number imposes no clock-base or unit restriction."
- "Callers interact with the batcher only through the exported API surface (enqueue, flush, pendingUserCount)."
