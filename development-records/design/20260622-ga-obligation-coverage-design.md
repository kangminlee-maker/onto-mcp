# G(a) — obligation-coverage dynamic proof (the ratchet), implementation design (v3)

> Status: **DESIGN v3 — TWO hard-slice rounds (round 1: ultracode 14 + onto 8; round 2 on v2: ultracode 14 [4 high, 12 new-defects] + onto 6). All folded. Owner decisions §8; implementation NOT started.**
> Parent track: reconstruct "governance parity" (G). Predecessors MERGED: loader obligation-preservation + G(b) (#108, G8), G(c) (#109, G9) — INV-SCHEMA-1.
> Branch (to create): off main `5d848ed`.
> Cross-validation: exploration `wf_fe9e9434-59c`; round-1 `wf_e20a58ed-1eb` + onto `20260622-b7ba27c7`; round-2 (this design) `wf_77fe7409-56d` + onto `20260622-744a695e`. Durable: `development-records/tracking/20260622-ga-obligation-coverage-xval-findings.json`.
> **v3 corrections (round-2, all code-verified)**: (A) the 5 conditional are NOT uniformly exempt — **1 of 5 (the answer-support-judge pair) is ALREADY live-enforced** (#57/#58); split by activation state; activation conditions are opaque (no machine evaluator) → hand-classified + self-tested. (B) **arithmetic off-by-one**: dual-attribution makes the recorded set **3 pairs** (2 obligation strings), so **269 parked**, not 270. (C) the ratchet's **base side needs `git show <mergeBase>:<file>` → loader** (the path-only loader + line-diff marker cannot read base content); and a **checked-in recorded-set artifact** is required so re-park is detectable. (D) C3's discriminator threads through the **wrapper** `writeActionabilityMatrixValidationArtifact`, not the fn call sites. (E) **`.github/workflows/invariants.yml` DOES exist** (the CI merge gate) — it is not an invariant *registry*; the guard's CI step goes there. (F) §1 "shrink" → "non-increase" (consistency). (G) the loader **drops** `planned_validator_records` → they are invisible/out-of-scope (not "report-only").

## 1. Why (the canonical declared≠wired closure)

A reconstruct stage declares a validation obligation in the registry but has no live enforcer — "declared, not wired", caught only by a review round. **G(a) closes the obligation class**: every ACTIVE declared `validation_obligation` must be either (i) **dynamically proven WIRED** (a recorded `asserted_obligation_ids` from real validator execution), or (ii) **explicitly parked in a checked-in backlog whose LEGACY set can only NON-INCREASE** (newly-declared-active obligations may enter pending; total burn-down is a deferred §8-Q5 policy) — so a NEW active obligation that is neither recorded nor parked is a build error, and the uncovered set is VISIBLE. **Honest scope**: the gate proves an active obligation is *not silently un-tracked* and (for recorded ids) *reached its enforcer block*; it does NOT prove the enforcer is semantically correct (§3 Layer-1 residual, §8-Q3).

## 2. Confirmed substrate (verified against main `5d848ed`)

- **Loader preserves obligations** (#108): `validation_obligations: string[]` + `conditional_validation_obligations[]` on `ReconstructValidatorRecord` (contract-registry.ts:146-147, parse 725-748). **The loader does NOT parse `planned_validator_records`** (interface exposes only `validator_records`) → the 8 planned validators (25 flat obligations) are **invisible to the gate and correctly out of scope** (not "report-only").
- **Expected ACTIVE surface = 272 DISTINCT `(validator_id, obligation_id)` pairs** = 267 flat + 5 conditional. **The 5 conditional ids are DISJOINT** from every flat list (verified 0 overlap) → the gate **UNIONs** flat ∪ conditional per validator.
- **The 5 conditional are NOT uniformly exempt** (round-2 HIGH). Activation conditions are **opaque free-form strings with NO machine evaluator** (the loader stores `activation_condition` as a plain string; the registry's predicate evaluators serve an unrelated family). So tier is **hand-classified**:
  - **1 is ALREADY live-enforced**: `require_convergent_source_evidence_claims_to_have_two_independent_judge_confirmed_supports` (maturation-answer-claims-validator), condition `answer_support_judge_runtime_is_implemented` — the judge runtime is wired (run.ts:12627-12647) and enforced (maturation-validation.ts:2726/2843-2876, "judge gate is active (R4)", #57/#58, test-driven). → it is **RECORDED-eligible**, NOT exempt.
  - **4 are genuinely dormant** (source_purpose_candidate_runtime_is_implemented ×3, purpose_confirmation_runtime_is_implemented ×1 — their enforcement strings are absent from src). → parked, tier `activation_gated_dormant`.
  - A self-test asserts the judge pair is enforced; the design does NOT claim "0/5 implemented".
- **Coverage key = `(validator_id, obligation_id)`**: 7 obligation strings recur across validators (the matrix string on baseline-actionability-matrix-validator :2568 + actionability-matrix-validator :2589; 2 source-scout strings ×3 validators; etc.). A global key would cross-cover.
- **4 active validators carry zero obligations** — vacuously covered; gate must not crash on `[]`.
- **M1 enforcers** (first-slice seeds): `validateMaturationBaseline` coverage block (maturation-validation.ts:868-903) → `validate_baseline_rows_cover_selected_purpose_frame_required_elements` (clean 1:1). `validateActionabilityMatrix` id/ref blocks (1278-1320) → `validate_matrix_row_ids_are_stable_and_baseline_row_refs_close` — **one fn serves TWO validators** via the wrapper `writeActionabilityMatrixValidationArtifact` (maturation-validation.ts:5259), invoked at run.ts:12365 (baseline mode) + :12724 (current mode). Mode is internally distinguishable (`postFrontierInputsPresent`, maturation-validation.ts:1188); both modes are test-driven (maturation-validation.test.ts baseline :512, current :1410).
- **Recorder placement**: the blocks are GUARDED — `if (selected)` (:872), `for (const row of matrix.rows)` (:1278). Recorder must sit at an **unconditional position before** the guard.
- **Hash safety**: the maturation-baseline + actionability-matrix validation artifacts are NOT in `authoredArtifactReuseMatch`'s five (run.ts:1167/1193/1199/1202/1206), and the registry side is hash-neutral via `projectValidatorRecordSnapshotFields` (#108). So `asserted_obligation_ids` **+ the matrix `validator_id`/mode stamp** rotate NO reuse hash — but the new stamp field must be checked against any existing artifact-shape/golden test (§7).
- **Harvest reality**: `maturation-validation.test.ts` has zero exports + writes nothing to disk → a pure-static G9 clone cannot read existing fixtures. The harvest is a **dedicated vitest test**.
- **INV/G4 reality**: `check-invariant-change-marker.ts` PROTECTED_TARGETS (35-80) does NOT include INVARIANTS.md → editing INVARIANTS.md to add an INV does NOT trigger G4 (the INV TEXT is human-gated by AGENTS §0-2). There is **no invariants *registry* file**; **`.github/workflows/invariants.yml` IS the CI merge gate** that runs G1-G9 + vitest — the new `check:obligation-coverage` step is added THERE (and to `check-invariant-drift.ts` GUARDS), and **the guard MUST run in CI** for the guarantee to hold (distinct from the INV-text gating).

## 3. Design — the Obligation-Coverage Ratchet (v3)

Keyed on `(validator_id, obligation_id)`. **Three checked-in/derived artifacts**:
- `obligation-coverage-ledger.yaml` — the pending backlog (checked in, gate-honesty-validated).
- `obligation-coverage-recorded.yaml` — the recorded set (checked in; the ratchet's base-diff source), **kept fresh** by the harvest test.
- `scripts/check-obligation-coverage.ts` — the static+ratchet guard; `obligation-coverage-harvest.test.ts` — the dynamic proof.

### Layer 1 — RECORDING (runtime, per-validator)
`assertObligation(acc, id)` (one helper module) at an **UNCONDITIONAL position before** each check-block's guard; emitted as `asserted_obligation_ids: string[]` on the validation artifact (off the reuse five). **Matrix dual-validator attribution**: thread a `validator_id`/mode stamp through the **wrapper** `writeActionabilityMatrixValidationArtifact` (maturation-validation.ts:5259) from its two call sites (run.ts:12365/12724) into the artifact, OR derive the mode inside `validateActionabilityMatrix` from `postFrontierInputsPresent` — so the recorded id attributes to the correct `(validator_id, obligation_id)` and BOTH matrix pairs are recorded. Records reached-control, NOT semantic correctness (§8-Q3 residual).

### Layer 2 — HARVEST (a dedicated vitest test that also keeps the recorded-set fresh)
`obligation-coverage-harvest.test.ts` imports `validate*`, builds the M1-trio inputs (both matrix modes), executes, and asserts the returned `asserted_obligation_ids` per `(validator_id, obligation_id)`. It is the dynamic flip-test (delete the call → reds). It ALSO asserts the checked-in `obligation-coverage-recorded.yaml` **equals** the freshly-harvested recorded-set — so the checked-in artifact (needed by the ratchet, below) **cannot go stale** (resolves §8-Q4: the recorded-set is checked-in AND freshness-guarded).

### Layer 3 — GATE + RATCHET (`scripts/check-obligation-coverage.ts`, INV-OBLIGATION-COVERAGE-1)
`evaluateObligationCoverage()` loads CURRENT expected active obligations via `loadReconstructContractRegistry` (flat ∪ conditional, tier-tagged; planned out-of-scope), the checked-in recorded-set, and the pending ledger. It fails CI on:
- **(a) completeness**: an ACTIVE `(validator_id, obligation_id)` NEITHER recorded NOR parked.
- **(b) ledger honesty**: every ledger row resolves to a CURRENT active registry obligation (`registry_claim_mismatch`), carries its tier, and is not also recorded.
- **(c) reverse-validation**: a recorded id with no current active obligation for its validator FAILS.
- **(d) the RATCHET (impure, git base-diff)**: produce `baseActiveKeys` and `baseRecordedSet` by **`git show <mergeBase(origin/main)>:<file>` → temp file → `loadReconstructContractRegistry` / parse** (the loader is path-only, so the base content is materialized to a temp path; the marker's line-diff cannot do this — this is a NEW base-parse step, named explicitly). Then: allowed pending additions = `currentActiveKeys − baseActiveKeys`; reject (i) a legacy pending entry growing the legacy set vs base; (ii) a `baseRecordedSet` id absent from the current recorded-set (a silent recorded→pending downgrade); (iii) re-parking a currently-recorded id. **Fail loud if base data is unavailable in CI.** → **legacy pending is monotone non-increasing**.

(a)-(c) are pure (G9-shaped); (d) is git-impure (check-invariant-change-marker-shaped). Registered as a GUARDS row (check-invariant-drift.ts) + a CI step in `.github/workflows/invariants.yml` **passing the PR base ref** (the ratchet needs it). Mapped to a NEW `INV-OBLIGATION-COVERAGE-1` (the INV TEXT is human-gated, AGENTS §0-2; the GUARD is a hard CI merge gate).

## 4. Concept economy

Net-new: 1 field (`asserted_obligation_ids`) + the matrix `validator_id`/mode stamp; 1 recorder helper; **2 checked-in artifact KINDs** (the pending ledger + the recorded-set, both gate-validated/fresh-guarded); 1 dynamic harness test; 1 static+ratchet guard (git-impure for the ratchet — NOT a pure G9 clone, named); 1 INV + 1 CI step. Zero new obligation concepts (wires the 272 declared), zero new failure codes. **Honest accounting**: the ratchet's git dependency + the base-parse + the recorded-set artifact are real machinery beyond a G9 clone.

## 5. Success criteria

- A new ACTIVE obligation (flat OR conditional) neither recorded nor parked **FAILS** the guard. Expected set = 267 ∪ 5 = 272 (a self-test proves the 5 conditional are in the set; the judge pair is RECORDED-tier, the 4 dormant exempt).
- Deleting the flagship `assertObligation` call **reds the harvest test** (dynamic proof).
- Keyed on `(validator_id, obligation_id)`: a test proves cross-validator non-cross-cover (7 dups) AND that the matrix obligation records to BOTH its validator pairs (3 recorded pairs total).
- **Recorded set = 3 pairs (2 obligation strings: baseline ×1 + matrix ×2 validators); parked = 269** (272 − 3). The judge pair is RECORDED if instrumented this slice, else parked with a justification (§8-Q6).
- Ledger honesty (row with no active obligation FAILS) + reverse-validation + the recorded-set freshness check.
- Ratchet: growing the LEGACY pending vs `origin/main`, a recorded→pending downgrade, or re-parking a recorded id FAILS; base-unavailable FAILS LOUD; newly-declared-active MAY enter pending (self-tested with a synthetic base).
- New fields rotate NO reuse hash (governing-snapshot.test + reuse-provenance tests byte-identical); no artifact-shape/golden test breaks from the new fields.

## 6. First slice (ONE PR — 3 recorded pairs, 269 parked, fully green)

1. `assertObligation(acc, id)` helper module.
2. `asserted_obligation_ids: string[]` on `ReconstructMaturationBaselineValidationArtifact` (artifact-types.ts:1960) + `ReconstructActionabilityMatrixValidationArtifact` (:2015) + a `validator_id`/mode stamp on the matrix artifact — off the reuse five.
3. `assertObligation` at the unconditional positions (before maturation-validation.ts:872 / before :1278); thread the matrix discriminator through `writeActionabilityMatrixValidationArtifact` (5259) from run.ts:12365/12724.
4. Seed `obligation-coverage-ledger.yaml` with the **269** other active pairs (the 4 dormant conditional tier `activation_gated_dormant`; the judge pair RECORDED-or-justified), `coverage_status: pending` + tier + base-provenance.
5. Seed `obligation-coverage-recorded.yaml` with the **3** recorded pairs.
6. `obligation-coverage-harvest.test.ts` (dynamic): runs the 2 validators in both matrix modes, asserts the 3 recorded pairs, asserts the checked-in recorded-set matches.
7. `scripts/check-obligation-coverage.ts`: pure `evaluateObligationCoverage()` (a-c) + the ratchet (d, with the `git show` base-parse) + self-test (synthetic base/registry/ledger/recorded). Red-line negative-input test for the recorded obligations.
8. `check:obligation-coverage` (package.json) + GUARDS row (check-invariant-drift.ts) + a CI step in `.github/workflows/invariants.yml` passing the base ref; `INV-OBLIGATION-COVERAGE-1` in INVARIANTS.md (human-gated).

Each LATER PR moves pairs `pending→recorded` (+ a §8-Q3 paired red-line test); the ratchet forbids legacy regression. (Note: the matrix mode-attribution is matrix-specific; the 3-validator shared-fn obligations [scout-pack family] need their own per-call-site stamp design when their slice arrives — §8-Q2.)

## 7. Test plan

- Static-guard self-test (pure, synthetic): union expected (incl. 5 conditional, judge RECORDED + 4 dormant); (validator_id, obligation_id) keying (cross-validator + matrix dual-attribution = 3 recorded); ledger honesty; reverse-validation; completeness; ratchet (legacy growth → RED, recorded→pending downgrade → RED, re-park → RED, base-unavailable → fail-loud, newly-declared-active → allowed) via a synthetic base.
- Harvest test (dynamic): 3 recorded pairs in both modes; flip-test; recorded-set freshness (checked-in == harvested).
- Red-line negative-input for the recorded obligations.
- Hash/shape safety: governing-snapshot.test + reuse-provenance + any matrix-artifact-shape test byte-identical.

## 8. Open questions — OWNER decisions

1. **INV identity + gating** → new `INV-OBLIGATION-COVERAGE-1`; its TEXT is human-gated (AGENTS §0-2; INVARIANTS.md not in PROTECTED_TARGETS), the GUARD is a hard CI gate. Decide: accept human-text-gating, OR add INVARIANTS.md to PROTECTED_TARGETS (extra scope). (There is no invariants *registry* file; `.github/workflows/invariants.yml` is the CI workflow.)
2. **Ratchet base-parse + 3-validator generalization** → confirm `baseActiveKeys`/`baseRecordedSet` via `git show <mergeBase>:<file>` → temp → loader (recommended); fail-loud on base-unavailable. And confirm the matrix mode-attribution pattern is matrix-specific (the scout-pack 3-validator-shared-fn obligations get their own stamp design in a later slice).
3. **Promotion rule (rubber-stamp policy)** → does every later `pending→recorded` REQUIRE a paired red-line negative-input test (recommended), or reached-control + a checked waiver? First slice uses red-line.
4. **Recorded-set artifact** → checked-in `obligation-coverage-recorded.yaml` + harvest freshness check (recommended, REQUIRED for the ratchet's re-park/downgrade detection). Confirm.
5. **Pending-wall permanence** → ratchet proves non-increase, not burn-down. Accept (visible backlog), or assign a burn-down target/owner?
6. **The judge conditional pair** → instrument it RECORDED this slice (recommended — it is live-enforced), or park it with an explicit justification? And: the 4 dormant conditionals' activation_condition has no machine evaluator — accept hand-classification (recommended), or build a predicate evaluator so a satisfied condition auto-flips exempt→required (larger scope)?
7. **id SSOT** → opaque obligation ids; a matched-pair rename passes reverse-validation while mis-binding. Generate a TS const from the YAML, or accept inline literals + reverse-validation (recommended for slice 1)?

## 9. Cross-validation record

- **Exploration** ultracode `wf_fe9e9434-59c`: recommended the Ratchet (9/10). Its map agent's "conditional overlay" claim was a factual error → caught in round 1.
- **Round 1** ultracode `wf_e20a58ed-1eb` (14 confirmed [7 high]) + onto `20260622-b7ba27c7` (8): conditional UNION, harvest-is-a-vitest-harness, matrix-attribution, recorder-placement, INV/G4, ratchet-honesty, ledger-honesty → folded into v2.
- **Round 2** (on v2) ultracode `wf_77fe7409-56d` (14 confirmed [4 high], **12 new-defects from the v2 corrections**) + onto `20260622-744a695e` (6): the live-enforced judge pair (HIGH), the off-by-one 3-recorded arithmetic (HIGH ×2 across both legs), the ratchet base-parse via `git show` (HIGH ×2), the re-park-needs-checked-in-recorded-set (HIGH), the C3-wrapper-wiring-layer, the invariants.yml wording + guard-CI-wiring, the §1 consistency, the planned-out-of-scope → all folded into v3. **No blocker in any round.** The core architecture (record/harvest/gate+ratchet + visible ledger) is stable across both rounds; round-2 refined mechanism details the v2 corrections under-specified. **Convergence signal**: round 1 = architectural/factual; round 2 = mechanism-precision; the remaining residual is implementation-detail the first-slice build (+ its own review) will surface — the most efficient next validator is the bounded first slice itself.
