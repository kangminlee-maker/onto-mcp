# G(a) parked-obligation disposition — audited validators (slices 9–14)

**Purpose**: answer "are all these validators/obligations actually needed?" with evidence from the
G(a) enforcement audits. For each PARKED obligation, a suggested disposition — **WIRE** (real missing
check the validator *should* enforce per its contract/registry), **RE-ATTRIBUTE** (belongs to a
different owner — writer/pipeline/downstream), or **RETIRE/RENAME** (the name references a
non-existent field, the contract excludes the arm here, or it overlaps an already-recorded
obligation). **Final disposition is an owner decision** (touches the obligation registry / concept
SSOT, authority rank 1 & 5). This doc is the input to that decision, not the decision.

Scope: the 6 validators audited this session (recorded 9, parked 20 of their 29 obligations).
The other ~38 active obligations (slices 1–8 + the not-yet-audited Track-A queue) are not covered here.

## Headline finding
The parked set is dominated by **WIRE** (under-implemented contract), NOT over-declaration:
**~17 WIRE · ~3 RETIRE/RENAME · 0 clean RE-ATTRIBUTE** (run-control's writer-ish obligations are
contract-assigned to the *validation*, so they are WIRE-here, not re-attribute). So the validators
are mostly *needed but under-wired*, not bloat. The "too many (86% parked)" perception is real on the
surface, but the audit says the right fix is mostly "wire it (or accept as a documented limitation)",
with only a few genuine retire/rename candidates. Separately, **validator_id over-fragmentation** is
real: scout-pack (3 ids → 1 fn/artifact) and matrix (2 ids → 1 fn) — a structural consolidation
candidate independent of the obligation question.

## Disposition table

| validator | parked obligation | verdict from audit | suggested disposition |
|---|---|---|---|
| ontology-expansion | prevent_in_place_seed_authority_rewrite | basename-exact `=="ontology-seed.yaml"` misses anchored refs `ontology-seed.yaml#…` | **WIRE** — broaden seed-target match + bind |
| ontology-expansion | validate_expansion_evidence_refs_against_valid_answer_support_ledger_or_seed_authority | resolves against cited answer-claims' carried evidence (proxy), not the named ledger/seed authority | **WIRE** (resolve against named authority) or RENAME (proxy is upstream-validated) |
| run-control | validate_session_root_request_fingerprint_target_signature_runtime_version_and_idempotency_are_replayable | only session_root of 5 quantities validated; contract (design.md:2611-2614) assigns all 5 to the validation | **WIRE** — validate the 4 missing replay quantities |
| run-control | reject_conflicting_request_fingerprints_before_semantic_artifacts_are_consumed | trusts request_status enum; fingerprint comparison is in the writer | **WIRE** (validator recompute/verify) — contract assigns "fail loud before semantic artifacts" to the validation gate |
| run-control | validate_current_attempt_and_session_root_lock_ownership | active-attempt + lock presence + conflict-status checked; lock.owner_attempt_id NOT linked to current attempt | **WIRE** — add owner_attempt_id linkage |
| run-control | preserve_post_write_hash_observation_without_claiming_atomic_commit_when_writer_did_not_prove_atomic_rename | validator never reads commit_method | **WIRE** (validator-side commit_method check) — or RE-ATTRIBUTE if owner deems it purely writer truthful-marking |
| purpose-confirmation | require_revised_confirmation_to_preserve_source_conflict_or_trigger_purpose_discovery_rerun | rerun arm enforced; "preserve source conflict" arm never checked (source_conflict_policy unread) | **WIRE** — read source_conflict_policy |
| purpose-confirmation | validate_confirmation_status_against_source_purpose_candidate_status_and_validation_confirmation_required | only validation_status + confirmation_required read; contract 457-460 says confirmation_required is the SOLE gate authority — the candidate-status arm should NOT be read here; the confirmation_required arm is already recorded (require_confirmation_for_inferred_or_limitation_backed_purpose) | **RETIRE/RENAME** — drop the candidate-status arm; it's contract-excluded + already covered |
| competency-question-assessment | validate_answer_status_against_active_answerability_contract | structural per-status requirements ARE enforced (but unregistered); content-level answerability is content-blind (silent-defect #1) | **WIRE** (content-aware) — hard/known defect; OR RENAME to the structural check that IS enforced |
| competency-question-assessment | validate_answerability_trace_refs_close_against_seed_evidence_limitations_and_proofs | no answerability_trace_refs / limitation_refs / proof_refs FIELDS exist; only seed (already recorded) + evidence closed | **RETIRE/RENAME** — name references non-existent fields; the seed arm is already recorded; limitations/proofs are separate artifacts |
| failure-classification | classify_missing_or_failed_active_validation_artifact_as_required_gate_failure | validator does structural row checks only; registry declares input_authority_refs + dynamic_input_authority_rule binding the gate-validation consumption to THIS validator (codex PR #123) | **WIRE** (into this validator) |
| failure-classification | classify_missing_or_failed_promoted_maturation_validation_artifact_as_required_gate_failure | same — promoted-gate validations bound via conditional_input_authority_refs, not consumed | **WIRE** (into this validator) |
| failure-classification | derive_planned_gate_failure_inputs_from_registry_gate_catalogs_not_hand_maintained_lists | dynamic_input_authority_rule explicitly assigns catalog-driven derivation to this validator; not consumed | **WIRE** (into this validator) |
| failure-classification | validate_failure_trigger_against_active_runtime_validation_authorities | resolves failure.question_id/claim_id (subject, not trigger) against 2 of ~15 declared active authorities | **WIRE** — trigger check over the registry-declared active validation authorities |
| failure-classification | validate_failure_trigger_against_promoted_planned_validation_authorities | none of the promoted-planned authorities consumed | **WIRE** — trigger check over the registry conditional_input_authority_refs set |
| maturation-authority-response | preserve_unavailable_or_rejected_authority_as_blocked_or_limitation_state | unavailable/deferred only COUNTED; no preservation enforcement | **WIRE** (preservation check) — or RE-ATTRIBUTE to continuation/closure consumer |
| maturation-authority-response | reject_authority_response_that_claims_source_support_without_source_observation_refs | substring proxy `includes("source-observations")`; `"not-source-observations"` passes; no resolution | **WIRE** — resolve against source-observations.yaml |
| maturation-authority-response | validate_authority_identity_and_snapshot_refs_are_recorded | identity arm enforced; authority_snapshot_ref/version never checked | **WIRE** — add snapshot-ref recorded check |
| maturation-authority-response | validate_authority_response_refs_against_maturation_closure_frontier_authority_requests | resolves refs (unknown_id+kind) but registry omits maturation-closure-frontier.yaml input + no response↔frontier↔frontier-validation binding (#100-class) | **WIRE** — declare frontier input + cross-artifact bind |
| maturation-authority-response | validate_authority_response_status_and_scope | only "provided" status has a ref requirement; no scope check | **WIRE** (full status/scope) — or RENAME |

## Implications for "are they all needed?"
- **Validators**: mostly justified (artifact-authority model). The reducible part is **validator_id
  over-fragmentation** (scout-pack 3→1, matrix 2→1) — a registry-id consolidation, not a deletion of
  capability.
- **Obligations**: ~85% of the audited parked set are WIRE (genuine implementation debt the contract
  mandates), not bloat. **~3 are RETIRE/RENAME** (purpose-confirmation candidate-status arm;
  competency trace-refs non-existent-field arms; competency answer_status content arm is a known
  defect, not bloat). So the registry is *under-implemented*, not *over-declared* — with a small,
  clear retire/rename tail.
- **Recommendation**: finish the G(a) accounting (Track A) so every active obligation has a recorded
  or honestly-parked-with-reason status; THEN run an owner-decided disposition pass using this table +
  the rest. WIRE items become an implementation backlog; RETIRE/RENAME items shrink the registry;
  validator_id consolidation is a separate structural cleanup. Do not delete unilaterally — the
  obligation registry is authority rank 5 (feature contract) and the core-lexicon rank 1.
