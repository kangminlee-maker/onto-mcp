# logic Review Result

### Structural Inspection

- Authoritative target input: embedded materialized input in `prompt-packets/logic.prompt.md` (kind: single_text, `notification-batcher.ts`, 48 lines). Line anchors below refer to `notification-batcher.ts`.
- Claim unitization (prose-claim rules applied to doc comments / inline comments; code is read as realized behavior per the review-target-profile material-kind obligations):
  - C1 (Rule sentence, header, lines 2-3): "collects notifications per user and flushes them as one digest when the batch window closes."
  - C2 (Rule sentence, line 18): "Adds a notification. Starts the window on first enqueue."
  - C3 (Rule sentence, line 27): "Flushes when the window has closed. Returns one digest per user."
  - C4 (Conditional rule, line 28): "an empty array means 'window still open'."
  - C5 (Conditional rule, lines 37-38): "Notifications enqueued between the window close check and this reset are carried into the next window."
  - C6 (Definition, line 8): `enqueuedAt` = "Epoch ms when the notification entered the batch."
  - C7 (Definition, line 44): `pendingUserCount` = "Number of users with pending notifications."
- Type-level inspection: no type/range conflicts. `windowStartedAt: number | null` is null-guarded (line 31) before arithmetic use (line 32); `pending.get(...) ?? []` (line 21) totalizes map access; `flush` return value matches its declared type. C7 is consistent with realized behavior (line 46).
- State-invariant inspection: `windowStartedAt === null ⇔ pending.size === 0` holds across all transitions (enqueue couples both at lines 20-23; flush clears both at lines 39-40; early-return paths mutate neither). This invariant supports co-satisfiability of the remaining claim set and is used as mitigation evidence in Finding L3.
- Round-1 isolation respected: no other lens outputs of session 20260611-24c15f0c were read.
- Extra exploration citations (extra_exploration_citation_required=true):
  - `/Users/kangmin/cowork/onto-mcp-claude/.onto/processes/review/lens-prompt-contract.md` §8.1-§8.3, §9.2-§9.3 — output-schema seat inherited by the role definition (read to satisfy the packet's required output format).
  - `/Users/kangmin/cowork/onto-mcp-claude/.onto/review/20260604-d9f8db82/round1/logic.md` — prior-session format reference only; no target-content influence.

---

## Lens: logic

**Overall verdict: fail (1 medium fail, 1 low fail, 1 insufficient-evidence item).**

Within the declared boundary, the type system and the state invariant are internally consistent, but the documented contract and the realized behavior are not co-satisfiable at two points: the carry-over claim for late enqueues (C5) asserts an outcome the code makes impossible, and the empty-array equivalence (C4) is over-universal. A third item — whether the window-close judgment is sound at all — cannot be adjudicated because the time base of `flush(now)` is an unstated premise.

---

### Finding L1 — Carry-over claim is contradicted by unconditional reset (fail, medium)

- **target:** `notification-batcher.ts` `flush()` reset block
- **evidence_anchor:** notification-batcher.ts:37-38 (claim C5) vs notification-batcher.ts:39-40 (realized reset)
- **claim:** The documented invariant "notifications enqueued between the window close check and this reset are carried into the next window" is logically incompatible with the realized reset semantics; the claim set {C5, behavior of lines 39-40} is unsatisfiable in every execution where C5's antecedent holds. Severity: medium.
- **lens_id:** logic
- **what:** C5 is a conditional claim: if a notification x is enqueued between the window-close check (line 32) and the reset (line 39), then x is carried into the next window. "Carried into the next window" requires x ∈ `pending` after `flush` returns. But line 39 executes `this.pending.clear()` unconditionally, removing every entry — including any such x — and no code path snapshots or re-enqueues entries. Depending on where x lands relative to the digest loop (lines 34-36), x is either included in the *current* digest or silently dropped; under no path is it carried.
- **why (evidence-to-claim derivation):** The unsatisfiability derives from claim structure alone: (i) C5's antecedent places x in `pending` at some point after line 32 and before line 39; (ii) line 39 (`pending.clear()`) removes all entries of `pending`, hence x; (iii) C5's consequent requires x to remain pending for the next window; (i)+(ii) entail ¬(iii). Reachability caveat: in single-threaded synchronous execution the body of `flush` has no interleaving point (no await/callback between lines 32 and 39), so the antecedent is unreachable in the current execution model — which makes C5 either a dead claim describing a mechanism that does not exist, or, in any model where the antecedent becomes reachable (reentrancy, a future `await` insertion, shared-state usage), a false safety claim. Either branch contradicts C5 as a documented invariant; the contradiction is independent of pragmatic interpretation, so this is a logic `fail`.
- **causal path (medium):** false carry-over claim (37-38) ← reset implemented as whole-map `clear()` + window nulling (39-40) ← digests are built from the *same live map* that is then cleared (34-36 vs 39), so no mechanism separates the "flushed set" from a "carry set" ← starting cause: reset-by-global-clear with no snapshot/swap step that could realize the documented carry-over.
- **how to fix:** Make exactly one of the two claims true. (a) Realize C5: swap before building — `const batch = this.pending; this.pending = new Map(); this.windowStartedAt = null;` then build digests from `batch`; late enqueues then land in the fresh map and genuinely carry over. (b) Correct the comment to state actual behavior: in-between enqueues are impossible in single-threaded synchronous use, and would be included in the current digest or dropped — not carried — if the execution model ever changes.
- `conflict_pair`: notification-batcher.ts:37-38 ↔ notification-batcher.ts:39
- `satisfiability_note`: inter-claim — the comment's conditional consequent interacts with the reset semantics of the same method body; jointly unsatisfiable whenever the antecedent holds, vacuously satisfiable only while the antecedent is unreachable.
- `modality_note`: mixed — C5 asserts the carry-over as a necessary/obligatory consequence ("are carried"), while the realized code renders that outcome impossible (¬possible). The defect is a modality error: necessity asserted for an unrealizable outcome.
- `boundary_handoff_note`: Whether callers can actually drive the check-to-reset interleaving (concurrency/usage model of the poll loop) is pragmatics scope; the formal claim-vs-mechanism contradiction stated here is independent of that question.
- `upstream_evidence_required`: false

---

### Finding L2 — Window-close judgment rests on an unstated time-base premise (insufficient evidence)

- **target:** `notification-batcher.ts` window timing rule (`enqueue`/`flush` pair)
- **evidence_anchor:** notification-batcher.ts:20 (`Date.now()` sets `windowStartedAt`) vs notification-batcher.ts:30-32 (caller-supplied `now` adjudicates closure); notification-batcher.ts:8-9 (the only documented time base, `enqueuedAt` "Epoch ms", is never read by any code path)
- **claim:** Whether C3 ("Flushes when the window has closed") and C4 are satisfiable cannot be adjudicated from the present claim set: the window's start is stamped from the internal clock (`Date.now()`, line 20) while its closure is judged against a caller-supplied `now` (line 32) whose unit, epoch, and clock are fixed by no claim in the target. Severity if confirmed: medium (it is the review request's declared focus).
- **lens_id:** logic
- **what:** One window timeline is governed by two time authorities. If the unstated premise "`now` ≡ epoch ms from the same clock as `Date.now()`" is added, the rule set is consistent. If a caller supplies a different base — e.g. a monotonic-relative value such as `performance.now()` — then `now - windowStartedAt` is a cross-base difference, the guard at line 32 can hold permanently, `flush` never emits, and C3 is violated while C4 reports "window still open" forever. Satisfiability therefore depends entirely on a premise that is not formalized anywhere in the target; the only time-unit documentation present (C6, lines 8-9) is attached to a field no logic consumes.
- **why (evidence-to-claim derivation):** Line 20 shows the start timestamp's authority (ambient `Date.now()`); line 30 shows `now: number` carries no doc comment and no constraint; line 32 shows the two values are subtracted directly, which is meaningful only under a shared-base premise; no unitized claim (C1-C7) states that premise. This is exactly the role's insufficient-evidence condition: the claim needed for the judgment is not formalized within the boundary.
- **causal path (medium candidate):** closure verdict soundness (line 32) ← cross-authority subtraction (line 20 internal vs line 30 injected) ← absent binding claim for `now` ← starting cause: time authority split across `enqueue` (ambient clock) and `flush` (injected clock) without a declared common base.
- **how to fix (directions; final action conditional on the intended caller contract):** unify the time authority — (i) drop the `now` parameter and compute `Date.now()` inside `flush`; or (ii) inject one clock used by both `enqueue` and `flush`; or (iii) keep the signature and add the explicit claim "`now` is epoch ms from the same clock as `Date.now()`" to the doc contract, converting the hidden premise into a checkable rule.
- `boundary_handoff_note`: If `now`'s intended meaning is disambiguated, no residual formal contradiction remains in this claim set — per the Logic ↔ Semantics tie-breaker, the primary owner of the underlying defect (undocumented meaning of the `now` parameter) routes to **semantics**; logic retains only the conditional-unsatisfiability observation above.
- `upstream_evidence_required`: true (no domain document and no caller-context claim available within boundary; the adjudicating premise must be supplied upstream)

---

### Finding L3 — "Empty array means window still open" is over-universal (fail, low)

- **target:** `notification-batcher.ts` `flush()` return-value contract
- **evidence_anchor:** notification-batcher.ts:28 (claim C4) vs notification-batcher.ts:31 (no-window guard returns `[]`)
- **claim:** C4 asserts `[] ⇒ window still open`, but `flush` also returns `[]` when `windowStartedAt === null` (line 31) — a reachable state (fresh instance, or immediately after any successful flush) in which no window exists, hence none is "still open". The implication is false in that state. Severity: low.
- **lens_id:** logic
- **what:** The realized behavior is the disjunction `[] ⇒ (window still open ∨ no window started)`, strictly weaker than the documented equivalence. A caller following C4 literally would conclude from `[]` that a digest is eventually coming, which is false in the no-window state until a new enqueue occurs.
- **why (evidence-to-claim derivation):** Line 31 returns `[]` under `windowStartedAt === null`; the structural-inspection invariant (`windowStartedAt === null ⇔ pending.size === 0`) confirms this state is exactly the no-window state, and lines 39-40 show it is re-entered after every flush — so the C4-violating state is reachable in normal operation, directly contradicting the universal reading of line 28. Mitigation (why low, surface-only): the same invariant means callers can distinguish the two `[]` cases via `pendingUserCount()` (line 46).
- **how to fix:** Weaken the doc claim to match behavior: "an empty array means the window is still open *or no window has started*"; or, if callers need the distinction in-band, return a discriminated result instead of overloading `[]`.
- `conflict_pair`: notification-batcher.ts:28 ↔ notification-batcher.ts:31
- `satisfiability_note`: inter-claim — the doc equivalence claim conflicts with the no-window guard's return value; both are claims about the same observable (`flush`'s `[]`).
- `modality_note`: necessary — C4 states a necessary equivalence for `[]`, while the realized rule is a disjunction; over-universal modality, not a guard error.
- `boundary_handoff_note`: ""
- `upstream_evidence_required`: false

---

### Notes on scope (rationale beyond the findings)

- No further contradictions observed in {C1, C2, C3, C6, C7}: per-user collection with a single global window is consistent with C1's singular "the batch window"; C7 matches line 46; the state invariant shows the remaining rule set is co-satisfiable within the boundary.
- C2's "first enqueue" realizes as "first enqueue of each window cycle" (line 20), not first-ever. This resolves by disambiguating "first"; per the Logic ↔ Semantics tie-breaker and lens reciprocity, that is semantics-owned and is not raised as a logic finding here.
- `enqueuedAt` (lines 8-9) is defined with a documented time base but never read; an unused definition forms no contradiction by itself (it contributes evidence to L2). Ownership of unused-surface defects routes to conciseness/coverage, not logic.
- Single-window-per-instance granularity (one `windowStartedAt` for all users) may or may not match product intent; that is a pragmatics/coverage question, outside formal-consistency scope.

### Domain Constraints Used
[]

### Domain Context Assumptions
- "session_domain=none; per §9.3 the lens ran without a domain document. Judgments requiring an external usage-context rule (the time base of flush(now)) were returned as insufficient evidence with upstream_evidence_required=true rather than asserted."
- "Core ECMAScript semantics were treated as review evidence per the review-target-profile material-kind obligations (declared types, documented contracts, observable runtime behavior): Map.prototype.clear() removes all entries, and a synchronous method body without await/callback has no interleaving point in single-threaded execution. Contested library timing semantics would instead have been routed to insufficient evidence."
- "Doc comments and inline comments were unitized as prose claims (Rule sentence / Conditional rule / Definition); code was read as realized behavior forming the opposing claim side in claim-vs-behavior findings, per the review request's contract-vs-behavior focus."
- "Round-1 isolation observed: no other lens outputs of session 20260611-24c15f0c were read."
