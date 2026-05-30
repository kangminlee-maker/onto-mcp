## Dependency Lens Review

### Finding DEP-1 — Material

`answerability_scope` defines the question/action support edge in both directions, but validation only checks that each referenced ID exists. A supported question may list an `action_readiness_refs[]` action while that action omits the question from `supported_by_question_ids[]`, or an action may claim support from a question that does not list the action. This creates a non-hierarchical relation with two writable directions and no stated inverse-consistency rule.

Why this matters: the contract is otherwise careful to make relation authorities directional and derived projections explicit. Here, the question→action and action→question relation can diverge while still passing the listed deterministic checks, which weakens the answerability dependency graph and can create conflicting handoff readiness evidence.

Evidence:
- `.onto/review/20260528-e8c8b240/execution-preparation/materialized-input.md`, section `Seed Answerability Contract`: `supported_questions[].action_readiness_refs[]` and `supported_actions[].supported_by_question_ids[]` both encode the same support relation.
- `.onto/review/20260528-e8c8b240/execution-preparation/materialized-input.md`, section `Seed Answerability Contract`: validation requires refs to point to known IDs, but does not require reciprocal equivalence.
- `.onto/domains/software-engineering/dependency_rules.md`, section `Direction Rules / Dependency Direction Vocabulary`: contract dependencies need explicit ownership; the current edge has no single authority or inverse validation.

How to fix:
- Prefer one canonical direction, likely `supported_actions[].supported_by_question_ids[]`, and mark the other as a derived convenience projection; or
- Add deterministic validation that the two projections are exact inverses when both are present.

### Correct Dependency Structures Observed

No material dependency issue found for `relation_participation_exceptions`. The patch states it is only an exception/projection seat, not a second relation authority, and that connected participation derives from endpoint membership in `top_level_relations`.

No material dependency issue found for demotion continuity. The patch bridges prior concept IDs to `lower_level_detail_placements` through `current_detail_ids` / `target_detail_ids`, preserving direction from prior top-level identity to current lower-level detail authority.

No material dependency issue found for pressure lifecycle transitions. Pressure status values, supersession refs, and convergence dependency on non-open pressure states are directionally coherent.

No material dependency issue found for external migration artifact refs. `migration_records` remains the transitional authority and `migration_artifact_ref` is only a referenced expansion seat, not an authority replacement.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/dependency_rules.md"
  source_version_or_snapshot_id: "0c68f0ee55e4e7b90bdfaf2948708d402777cb92626e1429468cb75878324e4d"
  anchor: "Direction Rules / Dependency Direction Vocabulary"

### Domain Context Assumptions
[]