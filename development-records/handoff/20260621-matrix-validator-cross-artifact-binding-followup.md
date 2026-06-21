# Follow-up — actionability-matrix validator: cross-artifact validation binding

> Split off from PR #100 (`blocking_question_refs` wiring) per owner decision **"land wiring, split binding."** The reverse-link wiring is ultracode-certified `complete=true`; this note tracks the *broader, partly pre-existing* binding-integrity class that the same review surfaced.

## The class

`validateActionabilityMatrix` consumes several **validation artifacts** to bless the source artifacts it reads, but historically checked only their `validation_status === "valid"` — it did **not** verify each validation actually *corresponds to* the artifact being consumed (by comparing the validation's recorded source ref). A *valid* validation of artifact A can therefore bless a *stale/edited/mismatched* artifact B.

The codebase already uses recorded-ref binding elsewhere (e.g. `maturation-validation.ts` source-delta check ~`:3442`, continuation-decision check ~`:4193`), so the mechanism is established; the matrix validator just doesn't apply it to its inputs.

## Done in PR #100 (in scope)

- **frontier-validation ↔ frontier artifact** (codex round-4 P2 #2): `frontierValidation.maturation_question_frontier_ref` must equal the supplied frontier ref (`maturationQuestionFrontierRef`, threaded from the writer = the path run.ts validated against). Mismatch → `conflicting_state`. Landed `4e2adc1`.

## Deferred (this follow-up)

1. **answer-claims-validation ↔ frontier** (codex round-4 P2 #1): `maturationAnswerClaimsValidation.maturation_question_frontier_validation_ref` must equal the supplied `maturationQuestionFrontierValidationRef`. Otherwise claims validated against frontier A can drive L3/L4 upgrades under frontier B (the maturity-upgrade checks match claims by surface/dimension/purpose, not by the current frontier question).
2. **baseline-validation ↔ frontier-validation / matrix**: the frontier-validation records `maturation_baseline_validation_ref`; the matrix validator already takes `maturationBaselineValidationRef` but does not compare them.
3. **expansion-validation ↔ answer-claims**: `ontologyExpansionValidation` chain (expansion is authored from answer claims) — verify the recorded chain refs match the supplied ones.
4. Audit the remaining consumed validations for the same gap and bind them **cohesively** (one pass), rather than per-pair — the per-pair approach is what produced the round-by-round non-convergence on PR #100 (R1→R5, same root each round).

## Why deferred, not abandoned

- It is **largely pre-existing** (the matrix validator never bound any of these inputs) — broader than "wire the dead `blocking_question_refs` field," which was PR #100's stated, now-complete goal.
- In the **real pipeline these holes are unreachable**: run.ts threads consistent paths, and `assertRuntimeValidationValid` halts before any consumer advances — so they are **tamper/stale-resistance** gaps (defense-in-depth), not live-run defects. Same character as the M1 "rubber-stamp residual" accepted at merge.

## Suggested approach

Do the whole chain in one focused change: enumerate every validation artifact the matrix validator (and ideally each maturation validator) consumes, and for each add a recorded-ref binding check mirroring the frontier binding landed here. Add a small test per binding (validation recording a different ref → `conflicting_state`). Consider whether a shared helper (`assertValidationBinding(recordedRef, suppliedRef, code, subject)`) reduces the per-pair boilerplate and the drift risk.

## Pointers

- Reverse-link wiring + frontier binding: `src/core-runtime/reconstruct/maturation-validation.ts` (`validateActionabilityMatrix`, `buildActionabilityMatrixArtifact`).
- Established binding pattern to mirror: same file ~`:3442`, ~`:4193`.
- Memory: `contract-runtime-gap-ledger` (this is a G-track / declared≠wired item).
