## Findings

### Medium — `current_detail_ids` is referenced as a demotion bridge field but is not defined in the lifecycle shape

The patch defines demotion continuity in `concept_identity_events` through `target_detail_ids` and does not define `current_detail_ids` anywhere in the lifecycle schema. Later, validation expectations say demoted concept IDs must link to `lower_level_detail_placements[].detail_id` values through `current_detail_ids` or `target_detail_ids`.

From a semantics perspective, `current_detail_ids` reads like a synonym or alternate lifecycle authority for the same demotion bridge, but it is not introduced as a field, alias, compatibility projection, or retired-seat mapping. That weakens the otherwise clear claim that `concept_identity_events` is the canonical lifecycle transition authority with one stable shape.

Why it matters: readers and implementers may interpret `current_detail_ids` as an allowed public/schema field, creating a second name for the same demotion relation or a validator requirement that cannot be satisfied by the documented Seed shape.

How to fix: change the validation expectation to reference only `target_detail_ids`, or explicitly add `current_detail_ids` to `concept_identity_events` with a clear semantic distinction. The smaller fix is preferred: remove `current_detail_ids` from the validation bullet and keep `target_detail_ids` as the sole demotion bridge from prior concept IDs to lower-level detail IDs.

## Confirmed Correct From Semantics Lens

The reviewed patch materially improves semantic authority boundaries for the concept-centered Seed design:

- `concept_identity_events` and `relation_identity_events` are named as the canonical lifecycle transition authority, and split/merge continuity is represented through prior/current ID arrays rather than separate mapping fields.
- `prior_concept_mappings` and `prior_relation_mappings` do not appear in the Seed lifecycle authority.
- `supported_actions[].supported_by_question_ids[]` is the sole canonical question-to-action support edge, with no reverse support edge on supported questions.
- `lifecycle.source_snapshot_refs` is clearly named as current source snapshot authority, while `source_snapshot_transition.prior_snapshot_refs` is limited to prior refs.
- `relation_participation_exceptions.status` is collapsed to `isolated`, avoiding a competing connected-status vocabulary.
- `migration_records` is correctly framed as the transitional migration authority and may carry `migration_artifact_ref` for external detail.
- README and IMPLEMENTATION_MAP summaries stay high-level and point back to `top-level-concept-discovery-contract.md` as field-level authority, rather than duplicating field semantics.
- `source_authority_scope_changed` is semantically traceable through changed fields plus prior/current state refs or inline states.
- Pressure statuses and answerability references are consistently named as ID-based projections from canonical authority seats.

## Boundary Notes

No web research was used. Review stayed within the prompt-declared repository boundary and did not read other Round 1 lens outputs.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version 8"
  anchor: "Architecture Core Terms / Source of Truth"
- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version 8"
  anchor: "Change Management Terms / Migration"
- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version 8"
  anchor: "Data/State Management Terms / Snapshot"
- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version 8"
  anchor: "LLM-Native Engineering Terms / Artifact Truth and Provenance"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version 4"
  anchor: "Response Format Constraints"

### Domain Context Assumptions
[]