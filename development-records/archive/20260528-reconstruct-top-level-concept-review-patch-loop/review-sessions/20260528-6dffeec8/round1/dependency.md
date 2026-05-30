# Dependency Lens Review

## Findings

### DEP-1 — Demotion bridge validation names an undefined alternate edge

Severity: material  
Location: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1013`

The lifecycle schema defines concept demotion linkage through `concept_identity_events[].target_detail_ids[]` (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:338-345`), but the validation expectations later allow demotion events to link prior concept IDs to lower-level detail IDs through ``current_detail_ids` or `target_detail_ids`` (`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1013-1015`).

From the dependency lens, this creates an ambiguous directed authority edge:

- canonical schema edge: prior concept ID -> `target_detail_ids[]` -> `lower_level_detail_placements[].detail_id`
- validation edge: prior concept ID -> `current_detail_ids` or `target_detail_ids`

`current_detail_ids` is not defined in the lifecycle schema or output shape in the reviewed diff. Allowing it as an equivalent bridge introduces an implicit dependency path that is not anchored to a declared artifact seat. That weakens the intended single lifecycle transition authority and could let runtime validators accept a demotion bridge that downstream consumers cannot reliably find.

Fix: make the demotion bridge single-shaped. The lowest-risk fix is to change the validation expectation to require `target_detail_ids` only, and require each value to point to a known `lower_level_detail_placements[].detail_id`. If `current_detail_ids` is intended, it must be added consistently to the lifecycle schema, Seed output shape, migration rules, and examples; based on the rest of the patch, `target_detail_ids` appears to be the intended canonical field.

## Dependency Checks That Passed

No dependency-direction issue found for the main requested authority closures:

- `concept_identity_events` and `relation_identity_events` are stated as the canonical lifecycle transition authority, with split/merge continuity encoded through prior/current ID arrays.
- `prior_concept_mappings` and `prior_relation_mappings` do not appear in the reviewed diff.
- `supported_actions[].supported_by_question_ids[]` is correctly defined as the canonical question-to-action support edge, with reverse action-readiness edges explicitly prohibited.
- `lifecycle.source_snapshot_refs` is defined as the current source snapshot authority, while `source_snapshot_transition.prior_snapshot_refs` carries previous refs only.
- `relation_participation_exceptions.status` is collapsed to `isolated`; connected participation is derived from `top_level_relations` endpoint membership.
- Pressure status transitions, source-authority-scope change traceability, migration artifact refs, and answerability references are directionally aligned with their declared authority seats.

## Boundary Notes

Review was limited to the prompt packet, materialized diff input, required role/context artifacts, and the explicitly allowed software-engineering domain documents. Web research was denied and not used. I did not inspect other round-one lens outputs.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/dependency_rules.md"
  source_version_or_snapshot_id: "sha256:0c68f0ee55e4e7b90bdfaf2948708d402777cb92626e1429468cb75878324e4d"
  anchor: "Direction Rules / Dependency Direction Vocabulary"
- source_doc: ".onto/domains/software-engineering/dependency_rules.md"
  source_version_or_snapshot_id: "sha256:0c68f0ee55e4e7b90bdfaf2948708d402777cb92626e1429468cb75878324e4d"
  anchor: "Event Schema Contract Dependencies"

### Domain Context Assumptions
[]

### Extra Exploration Citations
- ".onto/processes/reconstruct/top-level-concept-discovery-contract.md:338"
- ".onto/processes/reconstruct/top-level-concept-discovery-contract.md:1013"
- ".onto/domains/software-engineering/dependency_rules.md"
- ".onto/domains/software-engineering/prompt_interface.md"

### Web Sources Used
[]