# Follow-up — actionability-matrix validator: cross-artifact validation binding

> Split off from PR #100 (`blocking_question_refs` wiring) per owner decision **"land wiring, split binding."** The reverse-link wiring is ultracode-certified `complete=true`; this note tracks the *broader, partly pre-existing* binding-integrity class that the same review surfaced.

## The class

`validateActionabilityMatrix` consumes several **validation artifacts** to bless the source artifacts it reads, but historically checked only their `validation_status === "valid"` — it did **not** verify each validation actually *corresponds to* the artifact being consumed (by comparing the validation's recorded source ref). A *valid* validation of artifact A can therefore bless a *stale/edited/mismatched* artifact B.

The codebase already uses recorded-ref binding elsewhere (e.g. `maturation-validation.ts` source-delta check ~`:3442`, continuation-decision check ~`:4193`), so the mechanism is established; the matrix validator just doesn't apply it to its inputs.

## Done in PR #100 (frontier artifact binding)

- **frontier-validation ↔ frontier artifact** (codex round-4 P2 #2): `frontierValidation.maturation_question_frontier_ref` must equal the supplied frontier ref (`maturationQuestionFrontierRef`, threaded from the writer = the path run.ts validated against). Mismatch → `conflicting_state`. Landed `4e2adc1`.

## Done in this follow-up (lineage chain bindings)

Implemented cohesively via one shared helper `validationLineageViolation(...)` in `validateActionabilityMatrix`, each gated on the consumed validation being present & valid (so the pre-frontier baseline matrix trips none):

1. **frontier-validation ↔ baseline-validation**: `frontierValidation.maturation_baseline_validation_ref === maturationBaselineValidationRef`.
2. **answer-claims-validation ↔ frontier-validation** (codex round-4 P2 #1): `answerClaimsValidation.maturation_question_frontier_validation_ref === maturationQuestionFrontierValidationRef`.
3. **expansion-validation ↔ answer-claims-validation**: `ontologyExpansionValidation.maturation_answer_claims_validation_ref === maturationAnswerClaimsValidationRef`.

Together these prove the consumed validations form a consistent lineage `baseline-validation ← frontier-validation ← answer-claims-validation ← expansion-validation`, all bound to the supplied refs — no new validator args needed (the matrix validator already holds all four validation refs). Test: a lineage break in any link → `conflicting_state`.

## Remaining residual (lower priority)

**Artifact-self binding for baseline / answer-claims / expansion** (mirror of the frontier-artifact binding above): `baselineValidation.maturation_baseline_ref`, `answerClaimsValidation.maturation_answer_claims_ref`, `expansionValidation.ontology_expansion_ref` each compared to the supplied source-artifact ref. Not done because:
- It needs three new artifact-ref args threaded through the validator + writer, and the **baseline-self binding fires on *every* matrix validation** (baseline + current), so it touches ~every matrix test — high churn for marginal value.
- The lineage chain above is already anchored to the frontier artifact (via the PR #100 frontier-self binding), so the validations are a verified chain; only the non-frontier *source artifacts'* identities remain unbound.
- Same tamper/stale-resistance character (unreachable in the real pipeline) — defense-in-depth, not a live-run defect.

If pursued, do all three artifact-self bindings in one pass with the same helper, and prefer gating the baseline-self check to current-matrix mode (post-frontier inputs present) to bound the test churn.

## Pointers

- Reverse-link wiring + frontier binding: `src/core-runtime/reconstruct/maturation-validation.ts` (`validateActionabilityMatrix`, `buildActionabilityMatrixArtifact`).
- Established binding pattern to mirror: same file ~`:3442`, ~`:4193`.
- Memory: `contract-runtime-gap-ledger` (this is a G-track / declared≠wired item).
