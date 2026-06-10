# logic Lens Result

- session_id: 20260611-bad3651a
- lens_id: logic
- lens_output_schema_version: 2
- target: notification-batcher.ts (materialized input, single_text)

## Structural Inspection

Claim unitization of the target (rule sentences, conditional rules, definitions only; explanatory prose not unitized):

- C1 (definition, notification-batcher.ts:2-3): the batcher "collects notifications per user and flushes them as one digest when the batch window closes".
- C2 (definition, notification-batcher.ts:8-9): `enqueuedAt` is the "Epoch ms when the notification entered the batch".
- C3 (rule, notification-batcher.ts:12): the batch window length is 30,000 ms (`WINDOW_MS`).
- C4 (rule, notification-batcher.ts:18): enqueue "Starts the window on first enqueue".
- C5 (rule, notification-batcher.ts:27): flush "Flushes when the window has closed".
- C6 (definition, notification-batcher.ts:28): for flush callers, "an empty array means 'window still open'".
- C7 (rule, notification-batcher.ts:37-38): "Notifications enqueued between the window close check and this reset are carried into the next window."
- R1 (implementation rule, notification-batcher.ts:20): window start is bound to the process wall clock `Date.now()` at first enqueue.
- R2 (implementation rule, notification-batcher.ts:31): flush returns `[]` when `windowStartedAt === null`.
- R3 (implementation rule, notification-batcher.ts:32): window close is judged by `now - windowStartedAt >= WINDOW_MS` with caller-supplied `now`.
- R4 (implementation rule, notification-batcher.ts:34-36): the digest aggregates every entry currently in `pending`.
- R5 (implementation rule, notification-batcher.ts:39-40): flush reset unconditionally clears the whole `pending` map and nulls `windowStartedAt`.

State-invariant check: `windowStartedAt === null ⟺ pending.size === 0` holds across all declared transitions (initial state; enqueue sets both non-empty/non-null at notification-batcher.ts:20-23; flush either returns early without mutation or clears both at notification-batcher.ts:39-40). No intra-transition contradiction.

Consistent within boundary (verdict: pass for these claim pairs): C4 vs R1 (window starts on first enqueue — implemented exactly); the `pendingUserCount` doc vs implementation (notification-batcher.ts:44-47); per-user digest aggregation order (insertion-ordered Map iteration, no ordering claim declared to conflict with).

Contradictions found: three `fail` findings and one `insufficient evidence` finding below.

## Findings

### Finding 1: Split time authority between enqueue (Date.now) and flush (caller-supplied now) makes the close contract unsatisfiable over the declared input domain

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:20, notification-batcher.ts:27-28, notification-batcher.ts:30-32"
claim: >-
  The claim set {C5 "flushes when the window has closed", C6 "[] means window
  still open", R1 "window start sampled from internal Date.now()", R3 "window
  close judged against caller-supplied now"} is jointly satisfiable only under
  an undeclared necessary premise that the caller's now is sampled from the
  same clock as Date.now(); over the full declared input domain of flush(now:
  number) the set is not satisfiable.
lens_id: logic
verdict: fail
severity_hint: high
upstream_evidence_required: false
conflict_pair: "notification-batcher.ts:20 <-> notification-batcher.ts:30-32 (with doc claims notification-batcher.ts:27-28)"
satisfiability_note: >-
  inter-claim. R1 fixes the window-start time authority to the process wall
  clock at enqueue time, while R3 lets the close predicate compare that
  timestamp against an arbitrary caller-provided number; C5/C6 quantify over
  all allowed flush calls, so the contradiction arises in the interaction of
  the four claims, not inside any single one.
modality_note: >-
  mixed. C5 states an obligatory behavior (flush MUST emit digests once the
  window has closed), but the implementation makes it merely possible,
  conditional on an undeclared necessary precondition (same-clock now). The
  error type is necessary-precondition omission: a necessary condition is
  treated as implicitly given instead of being declared in the contract.
boundary_handoff_note: >-
  semantics also observes this phenomenon: the parameter name `now`
  underdetermines its clock source. However, after disambiguating `now` as
  "the caller's current epoch ms", the cross-authority comparison between an
  internally sampled clock and an externally supplied clock remains, so the
  residual contradiction is owned by logic per the Logic <-> Semantics
  tie-breaker.
```

**What:** `enqueue` records `windowStartedAt` from the internal wall clock `Date.now()` (notification-batcher.ts:20). `flush` decides whether the window has closed by comparing a caller-supplied `now` against that internal timestamp (notification-batcher.ts:30-32). The API therefore splits the time authority for one predicate across two clocks, and the contract never declares that they must be the same clock.

**Why:** Evidence-to-claim derivation: notification-batcher.ts:20 shows the window start is bound to `Date.now()` (supports the "internal authority" half of the claim). notification-batcher.ts:30 shows `now` is an unconstrained `number` parameter and notification-batcher.ts:32 shows the close predicate `now - this.windowStartedAt < WINDOW_MS` mixes both values (supports the "cross-clock comparison" half). notification-batcher.ts:27 ("Flushes when the window has closed") quantifies the obligation over all flush calls, and notification-batcher.ts:28 assigns `[]` the meaning "window still open" (supports the "contract violated under allowed inputs" half). Concretely: a caller whose `now` lags `Date.now()` (fake test timers starting at 0, a monotonic-derived timestamp, another machine's clock) makes the predicate false forever — flush returns `[]` ("window still open" per C6) indefinitely after the 30s window has factually elapsed; a caller whose `now` leads makes a just-opened window flush immediately. Both behaviors are reachable with declared-legal inputs and both contradict C5/C6.

**How to fix:** Unify the time authority. Either (a) parameterize enqueue on the same clock (`enqueue(item, now)`) so both sides of the predicate come from the caller's clock, (b) drop the `now` parameter and use `Date.now()` in flush, or (c) inject a single clock function at construction and use it in both methods. In all variants, declare the clock-source contract on the API doc.

**Materiality basis:**

```yaml
affected_purpose: "correctness and verifiability of the flush contract (declared review goals: correctness, verifiability)"
failure_condition: >-
  any flush caller whose now is not sampled from the same wall clock that
  enqueue used: deterministic-clock tests, monotonic-time-derived values,
  cross-process or skewed clock sources
impact: >-
  digests are never emitted for the affected window (perpetual [] read as
  "window still open") or are emitted before the window elapses; the 30s
  batching contract is silently broken and the documented [] meaning becomes
  permanently misleading
evidence_refs:
  - "notification-batcher.ts:20"
  - "notification-batcher.ts:27-28"
  - "notification-batcher.ts:30-32"
```

**Causal path:**

```yaml
root_cause_candidate: >-
  window-start and window-close use different time authorities (internal
  Date.now() vs caller-supplied now) with no declared same-clock precondition
root_cause_step_id: c1
steps:
  - cause_id: c1
    claim: >-
      Split time authority is introduced: window start is bound to the process
      wall clock at enqueue while the close check is parameterized on a caller
      clock value.
    relation_to_previous: null
    evidence_refs:
      - "notification-batcher.ts:20"
      - "notification-batcher.ts:30"
  - cause_id: c2
    claim: >-
      No same-clock precondition is declared on flush(now), so the allowed
      input domain includes clock values that diverge from the window-start
      authority.
    relation_to_previous: enables
    evidence_refs:
      - "notification-batcher.ts:26-30"
  - cause_id: c3
    claim: >-
      For a lagging caller clock the close predicate stays false after the
      documented 30s window has elapsed, so flush returns [] which the
      contract defines as "window still open" — the documented close
      obligation is violated.
    relation_to_previous: causes
    evidence_refs:
      - "notification-batcher.ts:27-28"
      - "notification-batcher.ts:31-32"
unresolved_beyond_evidence: >-
  whether any production caller currently supplies a non-Date.now() clock is
  outside the bounded single-file target
```

### Finding 2: Carry-over comment (C7) and unconditional pending.clear() (R5) are jointly unsatisfiable

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:37-38, notification-batcher.ts:39"
claim: >-
  C7 ("Notifications enqueued between the window close check and this reset
  are carried into the next window") and R5 (flush reset unconditionally
  clears the entire pending map) cannot both hold in any execution where such
  an enqueue occurs; the code guarantees the negation of the comment's
  guarantee.
lens_id: logic
verdict: fail
severity_hint: high
upstream_evidence_required: false
conflict_pair: "notification-batcher.ts:37-38 <-> notification-batcher.ts:39"
satisfiability_note: >-
  inter-claim. C7 is a declared preservation rule about the check-to-reset
  interval; R5 is the reset rule itself. The interaction: any notification
  present in pending at reset time that is not part of the produced digests is
  deleted by clear(), so "carried into the next window" is unsatisfiable
  whenever its antecedent is non-vacuous.
modality_note: >-
  necessary/necessary conflict. C7 asserts a guaranteed (necessary)
  preservation property; R5 makes the complementary property (pending becomes
  empty) necessary at the same program point. No modality-classification
  error — the two necessary claims directly contradict.
boundary_handoff_note: ""
```

**What:** The reset comment (notification-batcher.ts:37-38) promises that notifications enqueued between the window-close check (notification-batcher.ts:32) and the reset (notification-batcher.ts:39) survive into the next window. The reset executes `this.pending.clear()`, which removes every entry unconditionally — including any entry the comment promises to preserve.

**Why:** Evidence-to-claim derivation: notification-batcher.ts:37-38 states the preservation rule verbatim (supports the "C7 declares carry-over" half of the claim). notification-batcher.ts:39 shows `clear()` empties the whole map with no carve-out for post-check arrivals (supports the "code guarantees the negation" half). A notification enqueued in that interval is either already visible to the digest loop (notification-batcher.ts:34-36) and absorbed into the closing digest, or it is removed by `clear()` and silently lost; under no path does it reach the next window. In the current synchronous single-threaded realization the interval is empty, so C7 is vacuous and unverifiable as stated — and the moment any realization makes the interval real (async refactor, awaits inside flush, concurrent callers, re-entrancy), the code's actual behavior is silent notification loss, the exact failure the comment claims to exclude.

**How to fix:** Make the comment true or make it honest. To make it true: delete only the flushed entries (snapshot the keys/items included in the digest, then delete those specific entries) so post-check arrivals genuinely persist into the next window. To make it honest: rewrite the comment to state that the reset drops everything currently pending and that the implementation relies on synchronous execution to keep the check-to-reset interval empty.

**Materiality basis:**

```yaml
affected_purpose: "correctness (no silent notification loss) and regression_risk (declared review goals)"
failure_condition: >-
  any realization in which enqueue can interleave with flush between the
  close check and clear(): an async refactor of flush, concurrent callers,
  or re-entrant enqueue
impact: >-
  silent notification loss while the in-code documentation asserts the
  opposite guarantee; future maintainers relying on the documented invariant
  will ship the loss without noticing
evidence_refs:
  - "notification-batcher.ts:32"
  - "notification-batcher.ts:34-36"
  - "notification-batcher.ts:37-39"
```

**Causal path:**

```yaml
root_cause_candidate: >-
  the reset clears the whole pending map instead of removing only the entries
  that were flushed into the digest
root_cause_step_id: c1
steps:
  - cause_id: c1
    claim: >-
      Flush resets state by unconditionally clearing the entire pending map
      rather than deleting only the flushed entries.
    relation_to_previous: null
    evidence_refs:
      - "notification-batcher.ts:39"
  - cause_id: c2
    claim: >-
      Any notification present in pending at reset time but not part of the
      produced digests is discarded, never preserved.
    relation_to_previous: causes
    evidence_refs:
      - "notification-batcher.ts:34-36"
      - "notification-batcher.ts:39"
  - cause_id: c3
    claim: >-
      The comment's guarantee that check-to-reset enqueues are "carried into
      the next window" is unsatisfiable together with c2 whenever such an
      enqueue occurs; under the current synchronous realization the guarantee
      is vacuous and unverifiable as stated.
    relation_to_previous: causes
    evidence_refs:
      - "notification-batcher.ts:37-38"
unresolved_beyond_evidence: >-
  whether any concurrent or async caller exists today is outside the bounded
  single-file target
```

### Finding 3: The documented meaning of [] (C6) is contradicted by the no-window early return (R2)

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:28, notification-batcher.ts:31"
claim: >-
  C6 defines the output [] to mean "window still open", but R2 returns [] in
  the reachable state windowStartedAt === null, in which no window is open;
  the definition and the producing rule contradict in that state.
lens_id: logic
verdict: fail
severity_hint: medium
upstream_evidence_required: false
conflict_pair: "notification-batcher.ts:28 <-> notification-batcher.ts:31"
satisfiability_note: >-
  inter-claim (definition vs rule). C6 assigns a single meaning to the output
  value []; R2 produces the same output value from a state where that meaning
  is false. The contradiction needs both claims; neither is self-contradictory.
modality_note: >-
  modality-classification error of type possible-as-necessary: the doc asserts
  a necessary equivalence ([] iff window still open) where the implementation
  only supports a possible reading ([] may also mean "no window exists").
boundary_handoff_note: >-
  pragmatics may additionally assess whether real polling callers ever branch
  on the distinction; the formal definition-vs-rule contradiction is
  independent of that usage question and stays with logic.
```

**What:** flush documents exactly one meaning for an empty result: "window still open" (notification-batcher.ts:28). The first early return (notification-batcher.ts:31) yields `[]` when `windowStartedAt === null` — the initial state and the state after every successful flush — where no window is open at all.

**Why:** Evidence-to-claim derivation: notification-batcher.ts:28 supplies the definitional claim ([] ⇒ window still open). notification-batcher.ts:31 supplies the producing rule that emits [] in the null-window state, and notification-batcher.ts:16/notification-batcher.ts:40 show that state is reachable (initial value; reset after flush). Together they derive the contradiction: there is a reachable producing state in which the documented meaning of the output is false. The state invariant `windowStartedAt === null ⟺ pending.size === 0` (see Structural Inspection) makes the practical reading "nothing to deliver" coincide today, which is why severity is medium rather than high; but the declared definition is still false in the null state, and under Finding 1's clock-skew condition the misreading becomes persistent (callers see [] forever and conclude the window is still open while in fact it never closes).

**How to fix:** Either widen the documented meaning ("[] means there is nothing to flush yet: no window has started, or the window is still open") or make the states distinguishable in the signature (e.g. return `null` for "no window" vs `[]` for "window open"), and keep C6 consistent with whichever is chosen.

**Materiality basis:**

```yaml
affected_purpose: "verifiability of the caller-facing contract; correctness of caller-side state interpretation (declared review goals)"
failure_condition: >-
  a caller or monitor branches on the documented meaning of [] in the
  no-window state, or operates under Finding 1's clock-skew condition where
  the misleading reading persists indefinitely
impact: >-
  misclassification of batcher state by polling callers; tests written
  against the documented meaning validate the wrong semantics
evidence_refs:
  - "notification-batcher.ts:28"
  - "notification-batcher.ts:31"
  - "notification-batcher.ts:40"
```

**Causal path:**

```yaml
root_cause_candidate: >-
  flush conflates two distinct states ("no window started" and "window open,
  not yet closed") into a single output value while the doc defines only one
  meaning for it
root_cause_step_id: c1
steps:
  - cause_id: c1
    claim: >-
      Two early returns map the distinct states windowStartedAt === null and
      now - windowStartedAt < WINDOW_MS to the same output [].
    relation_to_previous: null
    evidence_refs:
      - "notification-batcher.ts:31"
      - "notification-batcher.ts:32"
  - cause_id: c2
    claim: >-
      The doc definition assigns [] the single meaning "window still open",
      which is false in the reachable no-window state — definition and
      producing rule contradict.
    relation_to_previous: causes
    evidence_refs:
      - "notification-batcher.ts:28"
      - "notification-batcher.ts:16"
      - "notification-batcher.ts:40"
unresolved_beyond_evidence: null
```

### Finding 4: Window-membership rule for post-close enqueues is not formalized; enqueuedAt (C2) participates in no rule

```yaml
target: notification-batcher.ts
evidence_anchor: "notification-batcher.ts:8-9, notification-batcher.ts:2-3, notification-batcher.ts:34-36"
claim: >-
  No declared claim formalizes which window a notification enqueued after
  windowStartedAt + WINDOW_MS but before the flush poll belongs to; the
  digest includes it in the closing window by flush-call timing, and the
  declared temporal field enqueuedAt is consumed by no rule, so no
  contradiction is derivable within the bounded target.
lens_id: logic
verdict: insufficient evidence
severity_hint: low
upstream_evidence_required: false
conflict_pair: "notification-batcher.ts:2-3 <-> notification-batcher.ts:34-36 (no formalized claim pair; candidate only)"
satisfiability_note: >-
  not a satisfiability verdict: the membership claim required for judgment is
  not formalized in the target, so neither fail nor pass can be derived.
modality_note: >-
  not applicable — no modality conflict derivable without a formalized
  membership claim.
boundary_handoff_note: >-
  coverage: enqueuedAt is a declared field with documented temporal meaning
  consumed by no rule (declared-but-unconsumed surface). semantics: the
  meaning of "the batch window" as a membership boundary (C1) is
  underdetermined. Both observations are surface-level here per low severity.
```

**What:** `enqueuedAt` is documented as the epoch time the notification entered the batch (notification-batcher.ts:8-9) but is never read by the batcher. Window membership in the digest is determined solely by what is in `pending` at flush-call time (notification-batcher.ts:34-36): a notification enqueued after the window factually closed (later than `windowStartedAt + WINDOW_MS`) but before the next poll is absorbed into the closing digest.

**Why:** Evidence-to-claim derivation: notification-batcher.ts:8-9 documents per-item batch-entry time (supports "declared temporal field"); a search of the class body shows no read of `enqueuedAt` (supports "consumed by no rule"); notification-batcher.ts:34-36 shows the digest is built from the full pending map regardless of item timing (supports "membership by flush-call timing"). The header (notification-batcher.ts:2-3) does not state which window a post-close enqueue belongs to, so the claim needed to derive a contradiction is not formalized — per this lens's verdict schema this is insufficient evidence, kept surface-only per low severity.

**How to fix:** Formalize the membership rule and align the field with it: either consume `enqueuedAt` (or compare against `windowStartedAt + WINDOW_MS`) to bound the closing digest and carry later items into the next window — which would also make Finding 2's comment true — or document the flush-time cutoff explicitly and remove `enqueuedAt` if it remains unconsumed.

## Rationale

Issues were found; the no-issue rationale clause does not apply. Pass-scope observations within the boundary are recorded in Structural Inspection (C4/R1 consistency, pendingUserCount consistency, state invariant).

### Domain Constraints Used

[]

### Domain Context Assumptions

- "Assumed a single-threaded synchronous JavaScript runtime for the current realization of flush, making the check-to-reset interval empty today (relevant to Finding 2's vacuity analysis)."
- "Assumed flush callers poll at arbitrary intervals, per the doc 'Callers poll this' (notification-batcher.ts:28), so the poll-lag interval after window close is reachable (relevant to Finding 4)."
- "Assumed the `now` parameter of flush is not guaranteed to be sampled from the same clock as Date.now(), since the declared type is an unconstrained number and no clock-source precondition is documented (relevant to Finding 1)."
