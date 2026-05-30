# Semantics Lens Review

## Finding Summary

No material semantics issues found in the bounded diff.

The patch’s names and authority relationships are semantically consistent with the requested closure goals: the concept-centered Seed contract now distinguishes LLM-owned semantic judgment from runtime-owned deterministic validation, and the added field names generally match the meanings they are assigned.

## Semantic Verification

- Lifecycle transition authority is semantically centered on `concept_identity_events` and `relation_identity_events`. The lifecycle schema uses `prior_*_ids` and `current_*_ids` arrays, and the prose explicitly says these event arrays are the canonical lifecycle transition authority. I found no `prior_concept_mappings` or `prior_relation_mappings` Seed lifecycle authority in the reviewed material.
- Demotion semantics are coherent: demoted concepts keep prior concept identity in `concept_identity_events`, while the current lower-level representation is bridged through `concept_identity_events[].target_detail_ids` to `lower_level_detail_placements[].detail_id`. I found no competing `current_detail_ids` or alternate demotion bridge field.
- Answerability naming is meaningfully separated: `declared_handoff_questions` is the inventory, `supported_questions` / `deferred_questions` / `unsupported_questions` are status buckets, and `supported_actions[].supported_by_question_ids[]` is the sole canonical support edge from supported questions to actions. The contract also explicitly rejects a reverse action-readiness edge and a repeated `question_status` field.
- Source snapshot authority is semantically clear: `lifecycle.source_snapshot_refs` is current snapshot authority, while `source_snapshot_transition.prior_snapshot_refs` records only previous snapshot refs. The instruction not to repeat current refs inside `source_snapshot_transition` prevents a competing current authority.
- `relation_participation_exceptions.status` is collapsed to `isolated`, and connected participation is derived from endpoint membership in `top_level_relations`, which keeps relation participation semantics from becoming a second relation graph authority.
- `migration_records` is named as the transitional migration authority, with `migration_artifact_ref` only as an external detail ref when the record is too large. That preserves the Seed-level migration claim without making prose summaries authoritative.
- `source_authority_scope_changed` is semantically traceable because material coverage events include changed authority fields and either prior/current state refs or inline prior/current authority states.
- README and `IMPLEMENTATION_MAP.html` changes are concise authority-reference summaries. They do not introduce new field-level authority or conflicting terminology.

## Non-Blocking Note

One phrase in `.onto/processes/reconstruct/top-level-concept-discovery-contract.md` line 127 says cross-run continuation requires “prior/current ID mappings.” In context, lines 371-386 clarify that the actual authority is the prior/current ID arrays inside `concept_identity_events` and `relation_identity_events`, so I do not treat this as a material defect. If the team wants to remove even wording-level ambiguity, that phrase could be tightened to “prior/current ID arrays in `concept_identity_events` and `relation_identity_events`.”

## Evidence Boundary

Reviewed within the declared boundary only. Web research was denied and not used. I used the materialized diff, the role definition, the review target/profile metadata, and the software-engineering domain documents allowed for this lens.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version: 8; source_sha256: 9879135c1a5adf1045c7b8dd61738cd12caa3e8fa0305f1b4095e99649f9dc9c"
  anchor: "LLM-Native Engineering Terms"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version: 4"
  anchor: "Ownership Boundary Structure"

### Domain Context Assumptions
[]