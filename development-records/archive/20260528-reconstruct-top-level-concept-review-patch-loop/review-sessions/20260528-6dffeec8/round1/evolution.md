## Evolution Lens Review

### Findings

- **Medium — Demotion lifecycle bridge still leaves two possible field names for the same transition edge.**  
  In `.onto/processes/reconstruct/top-level-concept-discovery-contract.md`, the lifecycle schema defines concept demotion continuity through `concept_identity_events[].target_detail_ids[]` at lines 338-345. Later, validation expectations allow demotion events to link prior concept IDs to lower-level detail placements through "`current_detail_ids` or `target_detail_ids`" at lines 1013-1015. Because `current_detail_ids` is not defined in the lifecycle schema, future schema migration or runtime validation can split the demotion bridge into two accepted names. That weakens change tolerance: old concept IDs demoted into lower-level details may not have one stable replay path across iterative rounds or cross-run migration.

  **Why it matters for evolution:** Case SE-03 treats identifier/schema changes as lifecycle and compatibility changes; old and new data must coexist safely during migration. The current wording mostly establishes that lifecycle truth, but this alternate undefined field reintroduces a compatibility fork exactly at a demotion transition.

  **Fix:** Make `target_detail_ids[]` the sole demotion bridge, or explicitly add `current_detail_ids[]` to the lifecycle schema and define its relationship to `target_detail_ids[]`. Recommended default: remove `current_detail_ids` from the validation expectation and say demotion validation requires `concept_identity_events[].target_detail_ids[]` to reference known `lower_level_detail_placements[].detail_id` values.

### Confirmed Correct From Evolution Perspective

- `concept_identity_events` and `relation_identity_events` are now the sole lifecycle transition authorities for concept/relation split, merge, one-to-one transition, and derived migration summaries. The contract explicitly rejects parallel Seed lifecycle authority at lines 417-424.
- `prior_concept_mappings` and `prior_relation_mappings` do not appear in the reviewed target files, so they no longer compete with identity event arrays within the inspected boundary.
- `lifecycle.source_snapshot_refs` is defined as current source snapshot authority, while `source_snapshot_transition.prior_snapshot_refs` carries prior snapshot refs only; current snapshot IDs are explicitly not repeated inside the transition object at lines 412-416.
- Answerability question inventory and status buckets are closed and deterministic: declared question IDs are unique, status bucket IDs are unique across supported/deferred/unsupported, and their union must exactly match the declared inventory at lines 181-188.
- `supported_actions[].supported_by_question_ids[]` is explicitly the canonical support edge from questions to actions, with no reverse action-readiness edge on supported questions at lines 196-200.
- `relation_participation_exceptions.status` is collapsed to `isolated`, and connected participation is derived only from endpoint membership in `top_level_relations` at lines 438-451.
- External migration artifact refs are preserved through `migration_records[].migration_artifact_ref`, while prose alone cannot claim migration compatibility at lines 955-958.
- README and `IMPLEMENTATION_MAP.html` now summarize the contract as the field-level authority for the concept-centered Seed surface without attempting to duplicate the detailed field contract.

### Boundary And Evidence Limits

- Web research was denied by the prompt packet, so no web sources were used despite the packet metadata saying web citation was required.
- I reviewed only the prompt-declared materialized diff, the role definition, the target contract sections, README/IMPLEMENTATION_MAP changed summaries, and the declared software-engineering domain extension cases.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/extension_cases.md"
  source_version_or_snapshot_id: "version 8, last_updated 2026-05-28"
  anchor: "Case SE-03: Schema or Data Model Change"

### Domain Context Assumptions
[]