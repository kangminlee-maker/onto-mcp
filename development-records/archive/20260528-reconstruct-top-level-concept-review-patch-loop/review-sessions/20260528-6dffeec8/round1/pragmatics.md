# Pragmatics Lens Review

## Verdict

One practical ambiguity remains in the current diff. The main answerability design is otherwise usable: the contract now gives a bounded question inventory, mutually exclusive question status buckets, canonical question-to-action support edges, current/prior source snapshot distinction, isolated relation participation exceptions, lifecycle identity-event authority, pressure statuses, and migration-reference rules in a way that a Seed consumer can follow.

## Findings

### P2 — Demotion bridge validation names an undeclared field, making the runtime question path ambiguous

What: The lifecycle schema defines demotion linkage through `concept_identity_events[].target_detail_ids[]`, but the validation expectation later says demotion events may link prior concept IDs to lower-level detail IDs through `current_detail_ids` or `target_detail_ids`.

Evidence:
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:338` defines `concept_identity_events`.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:342` defines `prior_concept_ids`.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:344` defines `target_detail_ids`.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1013` requires concept demotion events to link prior concept IDs to known lower-level detail IDs.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1015` allows `current_detail_ids` or `target_detail_ids`, but `current_detail_ids` is not declared in the lifecycle shape.

Why this matters pragmatically: A runtime validator or ontology author trying to answer “which lower-level detail currently represents this demoted prior concept?” now has two possible interpretations, one of which references a field that the Seed shape does not define. That makes the answer path non-unique.

How to fix: Use a single declared bridge. Prefer changing the validation expectation to require `concept_identity_events[event_type=demoted].prior_concept_ids[] -> target_detail_ids[] -> lower_level_detail_placements[].detail_id`. If `current_detail_ids` is intended, add it consistently to the lifecycle schema and Seed output shape, but that appears unnecessary.

## Confirmed Non-Issues Within Boundary

- `concept_identity_events` and `relation_identity_events` are stated as canonical lifecycle transition authority, with derived summaries forbidden as parallel Seed lifecycle authority.
- I did not find `prior_concept_mappings` or `prior_relation_mappings` introduced as Seed lifecycle authority in the reviewed diff.
- Answerability question IDs are governed by declared inventory uniqueness, status-bucket uniqueness, and exact union against declared handoff questions.
- `supported_actions[].supported_by_question_ids[]` is the sole canonical question-to-action support edge; the contract explicitly rejects reverse action-readiness edges on supported questions.
- `lifecycle.source_snapshot_refs` is current source snapshot authority, while `source_snapshot_transition.prior_snapshot_refs` carries prior refs only.
- `relation_participation_exceptions.status` is collapsed to `isolated`.
- External migration detail can be delegated through `migration_artifact_ref`, but migration compatibility cannot be claimed from prose alone.
- README and IMPLEMENTATION_MAP summaries correctly point back to `top-level-concept-discovery-contract.md` as field-level authority instead of restating competing rules.
- `source_authority_scope_changed`, split/merge continuity, pressure transitions, and answerability refs are traceable through lifecycle event arrays and validation expectations, subject to the demotion-field issue above.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/competency_qs.md"
  source_version_or_snapshot_id: "version 8 / last_updated 2026-05-28"
  anchor: "Applicability verdict protocol; CQ-T-02"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version 4 / last_updated 2026-05-28"
  anchor: "Response Format Constraints; Output Sink Constraints"

### Domain Context Assumptions
[]