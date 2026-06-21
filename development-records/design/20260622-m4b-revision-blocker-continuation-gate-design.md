# M4b — Revision-blocker continuation gate (implementation design)

> Status: **implementation design, awaiting ultracode + onto cross-validation before build.**
> Parent: `20260619-reconstruct-conservation-structural-remediation-design.md` v4 §5 M4b (triple cross-validated). This note resolves the three **v4 re-validation (2026-06-20) corrections** that the parent left open, and pins the implementation to the existing M1 `candidate_limitation_refs` conservation pattern.
> Prereqs landed on main: M1 conservation (#97), blocking_question_refs (#100), lineage chain (#101), M2/M4a/M3a (#104), M3c (#106). M1's continuation-validator plumbing exists.

## 1. Problem

The public `actionable_ready` continuation claim can publish while **unresolved revision blockers** (`reject`/`defer` proposals) remain. The stop gate (`stopDecisionAllowedDecisions`, run.ts) already refuses `stop` while reject/defer remain, but the continuation builder/validator (`maturation-validation.ts`) carry **no `revisionProposal`**, so `decision_state = actionable_ready` leaks past the blocker. Reject/defer proposals are unresolved scope carried to the next maturation round; the public claim must not say "actionable_ready" while they remain.

## 2. v4 re-validation corrections this note resolves

1. **Source artifact**: the parent said the builder "derives from `revision-proposal-validation.yaml`". WRONG — per-proposal data (`target_type`, `action`, `target_id`) lives in **`revision-proposal.yaml`** (`proposals[]`); the `-validation.yaml` carries only `validation_status` / `action_counts` / `violations`. So: derive blockers from **`revision-proposal.yaml`**, **gated by `revision-proposal-validation.yaml` being valid** (consume both).
2. **State, not just status**: the builder must downgrade the **`decision_state`** itself (the state), not only a surface flag. `decision_state` IS the state; downgrade `actionable_ready → actionable_limited` when blockers remain.
3. **The new field is itself an unprotected hop**: `revision_blocker_limitation_refs` flows builder→validator→public claim. To not recreate the consumed-on-trust silent-defect, the **validator must derive the expected blocker set from the authority and assert the decision's field equals it** (conservation), not trust the builder's field. This mirrors M1's `candidate_limitation_refs` derive-and-assert exactly.

## 3. Anchor: this is the revision-proposal analog of an EXISTING, validated pattern

`candidate_limitation_refs` (M1) already does, at the continuation layer, precisely the shape M4b needs:
- **builder** (`buildMaturationContinuationDecisionArtifact`, maturation-validation.ts:4141-4166): reads `actionabilityMatrix.candidate_limitation_refs`; when non-empty, forces `actionable_limited` (never `actionable_ready`); folds them into `decision.limitation_refs`.
- **validator** (`validateMaturationContinuationDecision`, :4356-4383): rejects `actionable_ready` when candidate limitations remain (`conflicting_state`); requires every matrix candidate limitation present in `decision.limitation_refs` (`missing_required_ref`).

M4b adds the same two-sided treatment for revision blockers, sourced from `revision-proposal.yaml` instead of the matrix.

## 4. Design

### 4.1 One shared `isRevisionBlocker` predicate  *(xval: host in post-seed-validation.ts, NOT a new module)*
- Host `isRevisionBlocker(p) = action ∈ {reject, defer}` and `isRevisionDisclosed(p) = action !== reuse` in **`src/core-runtime/reconstruct/post-seed-validation.ts`** — the existing revision-proposal **concept owner** (`REVISION_ACTIONS` const, `validateRevisionProposal`). Export both.
- `run.ts` deletes its private copies (1509-1519, used by the stop gate at 1467 and the final-output disclosure at 9999-10002) and imports from post-seed-validation.ts (run.ts already imports from it). `maturation-validation.ts` imports `isRevisionBlocker` from post-seed-validation.ts too. One predicate, both gates (codex M-7).
- **xval correction**: the original "new module to avoid a cycle" rationale was BACKWARDS. The real edge is `run.ts → maturation-validation.ts` (run.ts:197) and `run.ts → post-seed-validation.ts` (run.ts:124); neither maturation-validation nor post-seed-validation imports run.ts, and they do not import each other. So `maturation-validation → post-seed-validation` is a fresh acyclic edge — no new module needed. Verify with `check:import-boundary`.

### 4.2 Artifact shape
- `ReconstructMaturationContinuationDecisionArtifact` += `revision_blocker_limitation_refs: string[]`.
- Blocker ref token: `revision-blocker:<proposal_id>` (stable, proposal-scoped, deterministic).

### 4.3 Builder (`buildMaturationContinuationDecisionArtifact`)
- New args: `revisionProposal: ReconstructRevisionProposalArtifact`, `revisionProposalValidation: ReconstructRevisionProposalValidationArtifact`.
- `const revisionBlockerRefs = revisionProposalValidation.validation_status === "valid" ? revisionProposal.proposals.filter(isRevisionBlocker).map(p => \`revision-blocker:${p.proposal_id}\`) : []`. (Invalid validation → the validator fail-louds via `prior_validation_invalid`; the builder contributes no blocker refs from an unvalidated set. The validator's derivation is gated identically — §4.4 — so builder and validator stay symmetric.)
- **xval HIGH (unconditional field+fold)**: compute `revisionBlockerRefs` ONCE, before the if/else chain. Set `decision.revision_blocker_limitation_refs = revisionBlockerRefs` and spread it into the `limitation_refs` Set **UNCONDITIONALLY**, alongside `candidateLimitationRefs`/`convergenceLimitationRefs` at the return (4211-4220). Do NOT gate the field/fold inside the new branch — `decision_state` selection is orthogonal to blockers, so an earlier branch (ask_user/blocked) can win while blockers exist; the validator's superset+conservation (§4.4) are unconditional, so a branch-gated fold would spuriously fail `missing_required_ref`/`conflicting_state` on those states. Only the `decision_state` downgrade is branch-gated. (This mirrors how `convergenceLimitationRefs` is recorded unconditionally at 4174-4176 despite an earlier branch being chosen.)
- **xval HIGH (state downgrade + zero-closed-rows halt)**: insert the blocker branch into the precedence so blockers force at most `actionable_limited` AND never trip the `actionable_limited requires ≥1 included_row_ref` validator invariant (4413-4421). Place after the existing `limitationRows` branches, before `hasCandidateLimitations`:
  - `else if (revisionBlockerRefs.length > 0 && closedRows.length === 0) → "blocked"` (mirrors the existing `limitationRows>0 && closedRows===0 → blocked` at 4158; an actionable_limited with no closed rows would halt the run at validation).
  - `else if (revisionBlockerRefs.length > 0) → "actionable_limited"`.
  - The earlier `ask_user` (unresolved authority) and `blocked` (frontierRows>0) branches still win — higher-priority states; the field/fold above still records the blockers on those paths.

### 4.4 Validator (`validateMaturationContinuationDecision`) — derive-and-assert
- New args: `revisionProposal`, `revisionProposalValidation` (+ optional refs).
- `prior_validation_invalid` when `revisionProposalValidation.validation_status !== "valid"` (added to the existing prior-validation loop).
- **xval (gate derivation on valid — symmetric with builder)**: `const expectedBlockerRefs = revisionProposalValidation.validation_status === "valid" ? revisionProposal.proposals.filter(isRevisionBlocker).map(...) : []`. The builder zeroes blockers on invalid validation (§4.3), so the validator MUST too, or the two diverge and stack a spurious `conflicting_state` on top of `prior_validation_invalid` on the invalid path. With both gated, the invalid path raises ONLY `prior_validation_invalid` (the real cause) and still halts. (M1's candidate_limitation_refs is symmetric because both sides read the matrix the same way; this restores that symmetry.)
- **Conservation**: assert `sameRefSet(decision.revision_blocker_limitation_refs, expectedBlockerRefs)` → `conflicting_state` on mismatch (the unprotected-hop fix — the field is recomputed, not trusted). Use `sameRefSet` (order/dup-insensitive, matching the candidate_limitation_refs comparison; revision-blocker tokens are unique per proposal_id).
- **Superset**: every `revision_blocker_limitation_ref` must be in `decision.limitation_refs` → `missing_required_ref` (mirrors candidate_limitation_refs).
- **Gate**: `decision_state === "actionable_ready" && expectedBlockerRefs.length > 0` → `conflicting_state` ("actionable_ready cannot be projected while unresolved revision blockers remain"). Gate on the **derived** set (authority), so a hand-edited decision that drops the field still fails. (On the invalid path `expectedBlockerRefs===[]` so this is vacuous — `prior_validation_invalid` already halts.)
- **onto finding-002 (validation↔proposal binding)**: gate on `validation_status==valid` is not enough — a valid `revision-proposal-validation.yaml` from one proposal set could be paired with a different `revision-proposal.yaml` under resume/manual substitution. The validator gains `revisionProposalRef?: string | null`; when `revisionProposalValidation.revision_proposal_ref` is non-null, assert `path.resolve(it) === path.resolve(revisionProposalRef)` → `conflicting_state` ("continuation decision must consume the revision-proposal validation that certifies the consumed revision-proposal"). Closes the validation-to-authority hop (same class as the #100/#101 cross-artifact binding). The validation artifact already carries `revision_proposal_ref` (post-seed-validation.ts writes `path.resolve(args.revisionProposalPath)`).

### 4.5 Plumbing  *(xval HIGH: BOTH path-writers — run.ts calls the writers, not the pure builder/validator)*
run.ts (12876, 12889) calls the PATH-writers, which read YAML and invoke the pure builder/validator internally. So both writers must gain the two paths + reads + parsed pass-through:
- **`writeMaturationContinuationDecisionArtifact`** (maturation-validation.ts:5974, the BUILDER-writer — the design originally omitted it): args += `revisionProposalPath`, `revisionProposalValidationPath`; read both in its `Promise.all` (5994-6016); pass parsed `revisionProposal` + `revisionProposalValidation` into `buildMaturationContinuationDecisionArtifact` (6017-6029).
- **`writeMaturationContinuationDecisionValidationArtifact`** (maturation-validation.ts:6034, the VALIDATOR-writer): same — args += the two paths; read both; pass into `validateMaturationContinuationDecision`.
- **`run.ts`**: pass `revisionProposalPath` + `revisionProposalValidationPath` (in scope at 11898/11910, before the continuation stage) at BOTH writer call sites (12876 builder-writer, 12889 validator-writer).
- **imports**: maturation-validation.ts gains `ReconstructRevisionProposalArtifact` + `ReconstructRevisionProposalValidationArtifact` type imports and `isRevisionBlocker` from post-seed-validation.ts.
- **registry** `validator_records.maturation-continuation-decision-validator`:
  - `input_authority_refs += revision-proposal.yaml, revision-proposal-validation.yaml`.
  - **onto finding-001/004/005 (3 lenses converged): `validation_obligations +=`** the new semantic duties so the registry SSOT declares what the validator now proves (the registry record carries BOTH what it consumes AND what it must prove; adding only inputs leaves the contract incomplete). Concise, reusing the existing verb_phrase style:
    - `validate_revision_blocker_limitation_refs_against_validated_revision_proposal` (derive-from-valid + conservation)
    - `require_revision_blocker_refs_in_continuation_limitation_refs` (superset)
    - `reject_actionable_ready_when_unresolved_revision_blockers_remain` (gate)
    - `bind_revision_proposal_validation_to_consumed_revision_proposal` (finding-002 binding)
  - xval: the loader does NOT enforce `input_authority_refs`/`validation_obligations` resolution (G track would), so these are declarative SSOT statements; the real declared==wired proof is the writer/validator unit test. Pre-existing `actionability-matrix.yaml` omission from this entry is separate out-of-scope drift — do not touch.

### 4.6 Concept economy
- 0 new modules (xval: predicates live in post-seed-validation.ts, the concept owner; run.ts's 2 private copies deleted — net −1 duplication).
- 1 new artifact field (`revision_blocker_limitation_refs`); reuses existing violation codes (`conflicting_state`, `missing_required_ref`, `prior_validation_invalid`); reuses `sameRefSet`; reuses the `actionable_limited`/`blocked` states.
- No new module, no new validator, no new gate, no new enum value.

## 5. Success criteria
- `actionable_ready` cannot be built while a `reject`/`defer` proposal remains **AND `revision-proposal-validation` is valid** (builder downgrade); and cannot be **validated/published in any case where unresolved blockers remain** — when `revision-proposal-validation` is invalid, `prior_validation_invalid` halts regardless (onto finding-003: the builder gate is correctly conditioned on valid authority; the public claim is protected on every path).
- `revision_blocker_limitation_refs` is conserved (validator recomputes from the authority and asserts equality — not trusted).
- ONE `isRevisionBlocker` predicate at the stop gate and the continuation gate.
- `extend`/`rename`/`split`/`reuse` do NOT block (only reject/defer).
- registry input authority declared, and **actually consumed** as proven by the writer/validator unit test (the loader does not gate input_authority_refs resolution).
- No regression to M1's `candidate_limitation_refs` equal-conservation (revision blockers go in their OWN field/channel, never the candidate channel — codex H-A).
- No NEW halt path: blockers + zero closed rows → `blocked`, not an invalid `actionable_limited`.

## 6. Boundary expansion (accepted, §5 parent)
- continuation-validator gains a new input authority (`revision-proposal[.validation].yaml`) and the decision gains one field. This is exactly the "real boundary expansion" the parent flagged and accepted. No expansion beyond this.

## 7. Test plan (duals)
- builder: reject/defer present (with closed rows) → `actionable_limited` (+ field populated + folded into limitation_refs); only reuse/extend/rename/split → unaffected (no blocker refs, `actionable_ready` allowed when otherwise clean).
- **builder (xval) — orthogonal branch**: reject/defer present WHILE an earlier branch wins (ask_user via unresolved authority, OR blocked via frontierRows>0) → `decision_state` stays the earlier state BUT `revision_blocker_limitation_refs` is still populated AND folded into `limitation_refs` (proves unconditional field/fold).
- **builder (xval) — zero closed rows**: reject/defer present + no closed rows + no material frontier/limitation rows → `blocked` (NOT an invalid actionable_limited); the resulting decision validates (no halt).
- validator: hand-edited `actionable_ready` + blocker present → `conflicting_state`; decision field ≠ derived set → `conflicting_state` (conservation); blocker ref dropped from `limitation_refs` → `missing_required_ref`; clean (no blockers) → valid.
- **validator (xval) — invalid validation**: invalid `revision-proposal-validation` + reject/defer present → ONLY `prior_validation_invalid` (NOT a stacked spurious `conflicting_state`, because the validator derivation is gated on valid too).
- **validator (onto-002) — validation↔proposal binding**: `revisionProposalValidation.revision_proposal_ref` non-null and ≠ consumed revision-proposal ref → `conflicting_state` (mismatched/stale validation pairing).
- **existing call-site ripple (xval)**: thread a shared empty-proposals `revisionProposal` + valid `revisionProposalValidation` fixture into ALL existing builder/validator/writer call sites in maturation-validation.test.ts (~16) — they gain required args.
- registry: loader parses the two new input authorities + the new obligations (string presence); actual consumption proven by the writer/validator test above.

## 8. Open questions — resolved by cross-validation
- Q1 (downgrade target): `actionable_limited` WHEN closed rows exist; `blocked` when zero closed rows (xval high #3 — avoids the `included_row_ref` halt). Both never `actionable_ready`.
- Q2 (source/timing): derive from `revision-proposal.yaml` proposals (per-proposal data lives there, not -validation); both builder and validator read the same persisted artifact, both gated on `revision-proposal-validation` valid; conservation asserts equality.
- Q3 (interactions): no M1/claim_scope coupling (own field/channel). The only interactions found were the zero-closed-rows halt (Q1, fixed) and the builder/validator symmetry on invalid validation (§4.4, fixed). prior_validation_invalid is an independent backstop.
- Q4 (token): `revision-blocker:<proposal_id>` — distinct prefix vs `maturation-final-requestion:`, candidate refs, ontology_expansion subject ids; proposal_id unique within the proposal set. No collision.

## 9. Cross-validation record
- **ultracode** `wf_ab7ff06d-6c5` (6 lenses → adversarial verify): 21 material → **14 confirmed** (3 high, ~6 medium, ~5 low). All folded into §4/§5/§7 above. Highs: unconditional field/fold (§4.3), builder path-writer omission (§4.5), actionable_limited+zero-closed-rows halt (§4.3). Key mediums: validator derive symmetry on invalid (§4.4), predicate home = post-seed-validation.ts not a new module (§4.1, cycle claim was backwards), existing call-site ripple (§7), registry declared==wired is test-proven not loader-gated (§4.5/§5).
- **onto self-review** `20260622-8bd84c18` (core-axis, 6 lenses, codex_cli OAuth gpt-5.5): 5 findings, all **medium**, 0 high/blocker. All adopted: finding-001/004/005 (coverage/semantics/structure converged) → add `validation_obligations` to the registry validator (§4.5) so the SSOT declares the new conservation/gate duties, not just the inputs; finding-002 (evolution) → validation↔proposal binding via `revision_proposal_ref` (§4.4); finding-003 (logic) → qualify the §5 "cannot be built" criterion to "valid validation + reject/defer" (invalid → prior_validation_invalid halts). No authority-mixing or M1-regression flagged — the own-channel design holds.
