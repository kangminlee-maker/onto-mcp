## Conciseness Lens Review

### Verdict

Material conciseness issues remain. The patch closes the specific duplicate-authority risks called out in the request for concept/relation lifecycle identity, demotion lineage, answerability support edges, source snapshot authority, relation participation exceptions, and migration artifact refs. However, two new/remaining field-level redundancies create parallel paths for the same facts.

### Findings

#### C-1: `relation_axis` duplicates `relation_kind` as stored relation authority

Severity: material

What: `top_level_relations` stores both `relation_kind` and `relation_axis` in the minimum relation record, while the design-local relation kind table assigns exactly one axis to each kind. The validation text then requires kind-axis pairing.

Evidence:
- `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:426` defines the relation record.
- `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:430` adds `relation_kind`.
- `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:431` adds `relation_axis`.
- `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:450` to `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:460` maps every kind to a single axis.
- `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:465` to `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:466` says runtime may validate that `relation_axis` matches `relation_kind`.
- `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:846` to `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:848` repeats the same shape in Seed Output Shape.
- `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:1110` to `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:1111` adds validation for both allowed axis values and kind-axis pairing.

Why this is a conciseness issue: this is subordinate redeclaration already guaranteed by a superordinate field. If each `relation_kind` determines one `relation_axis`, storing both creates two authorities for the same classification and a drift path.

How to fix: make `relation_kind` the stored authority and derive `relation_axis` for display, grouping, or validation reports. Keep the kind-to-axis table as the derivation rule. If `relation_axis` must remain stored for query convenience, mark it explicitly as `derived_summary` or a non-authoritative projection, not part of the minimum relation authority.

#### C-2: `pressure_events.pressure_ids[]` overlaps with `current_pressure_id`

Severity: material

What: lifecycle `pressure_events` carries both a generic `pressure_ids: []` list and a `current_pressure_id`, while the event model does not define a distinct bulk-event meaning that would make the two fields different authorities.

Evidence:
- `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:322` to `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:329` defines `pressure_events` with `pressure_ids`, status transition fields, `current_pressure_id`, and `superseded_by_pressure_id`.
- `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:1075` to `.onto/review/20260528-d4633121/execution-preparation/materialized-input.md:1077` separately requires matching known pressure IDs, prior/new statuses, current pressure refs, and supersession refs.

Why this is a conciseness issue: the schema appears to encode the affected pressure through two paths: `pressure_ids[]` and `current_pressure_id`. Without an explicit distinction such as "bulk event over multiple pressures" versus "canonical current pressure after transition", this is a multiple-path expression of the same relationship.

How to fix: collapse to one canonical affected-pressure field. The smallest fix is to replace `pressure_ids: []` with `pressure_id:` for single-pressure transitions and keep `superseded_by_pressure_id` only for supersession. If multi-pressure events are intentionally supported, state that explicitly and remove `current_pressure_id`, or define when it differs from `pressure_ids[]`.

### Confirmed Non-Issues Within Conciseness Scope

The patch avoids several previously risky duplicate authorities:

- `concept_identity_events` and `relation_identity_events` are stated as the canonical lifecycle transition authority, with derived transition summaries prohibited as parallel Seed lifecycle authority.
- `prior_concept_mappings` and `prior_relation_mappings` do not appear in the inspected target input.
- `current_detail_ids` does not appear in the inspected target input.
- Concept demotion lineage is assigned to `concept_identity_events[].target_detail_ids`, and lower-level detail placement does not carry prior concept lineage.
- Answerability status is encoded by membership in supported/deferred/unsupported buckets, and `supported_actions[].supported_by_question_ids[]` is explicitly the sole canonical question-to-action support edge.
- `source_snapshot_refs` is the current source snapshot authority, while `source_snapshot_transition.prior_snapshot_refs` is limited to prior refs.
- `relation_participation_exceptions.status` is collapsed to `isolated`.

### Boundary Notes

Review used the materialized diff target, role definition, binding/interpretation/profile context, and the software-engineering conciseness domain rules. Web research was denied and not used. No other lens outputs were read.

### Domain Constraints Used

- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "sha256:a33057efbdd985231ca6cab690b5ae0b47ccca0f539e56df6e380159bc80c3e8"
  anchor: "Removal Target Patterns / Relationship Redundancy"
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "sha256:a33057efbdd985231ca6cab690b5ae0b47ccca0f539e56df6e380159bc80c3e8"
  anchor: "Minimum Granularity Criteria"

### Domain Context Assumptions

[]