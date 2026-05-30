## Conciseness Lens Result

### Findings

#### C1. Identity event schemas still define duplicate affected-ID paths

`lifecycle.concept_identity_events` includes both `concept_ids` and the transition authority arrays `prior_concept_ids` / `current_concept_ids` / `target_detail_ids`. Likewise, `relation_identity_events` includes both `relation_ids` and `prior_relation_ids` / `current_relation_ids`.

Why this matters: the contract later says lifecycle transition authority has a single shape through prior/current ID arrays, and derived summaries must not be stored as parallel Seed lifecycle authority. The generic `concept_ids` and `relation_ids` fields can only duplicate or partially summarize those arrays, so they create a second update path with no distinct conciseness value.

Fix: remove `concept_identity_events[].concept_ids` and `relation_identity_events[].relation_ids` from the lifecycle shape. For created, renamed, alias_changed, boundary_changed, split, merged, demoted, changed_direction, changed_kind, and removed events, encode affected identity only through the prior/current arrays and `target_detail_ids` where demotion applies.

Evidence: `.onto/review/20260528-03960a26/execution-preparation/materialized-input.md` lines 300-319, 373-383.

#### C2. `detail_placement_events[].prior_concept_ids` risks becoming an alternate demotion bridge

The lifecycle shape adds `detail_placement_events[].prior_concept_ids` while the contract states that `concept_identity_events[].target_detail_ids` is the demotion bridge from prior concept IDs to `lower_level_detail_placements[].detail_id`.

Why this matters: for demotion, `detail_placement_events[].detail_ids` plus `prior_concept_ids` can express the same prior-concept-to-detail transition through a second path. That matches the software-engineering conciseness removal target for multiple-path expression of the same relationship.

Fix: remove `detail_placement_events[].prior_concept_ids`, or explicitly narrow it so it cannot be used for demotion lineage. The compact default is to keep demotion lineage solely in `concept_identity_events` and let detail placement events reference only `detail_ids`, reason, evidence, and pressure refs.

Evidence: `.onto/review/20260528-03960a26/execution-preparation/materialized-input.md` lines 306, 328-334, 1084.

### Non-Issues Checked

The patch correctly avoids `prior_concept_mappings`, `prior_relation_mappings`, `current_detail_ids`, reverse action-readiness edges on supported questions, current snapshot refs inside `source_snapshot_transition`, and non-`isolated` relation participation statuses in the reviewed diff. The README and IMPLEMENTATION_MAP updates are summary references to the contract rather than competing authority definitions.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "version: 5"
  anchor: "2. Removal Target Patterns / Relationship Redundancy"
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "version: 5"
  anchor: "2. Removal Target Patterns / Definition Redundancy"

### Domain Context Assumptions
[]