## Conciseness Lens Result

### Verdict

Material conciseness issue remains.

The patch generally improves ontology-level parsimony by making authority seats explicit: `top_level_relations` is canonical, `relation_participation` is only an exception/projection seat, `lower_level_detail_placements` replaces retired lower-detail seats, and lifecycle/event records distinguish current state from provenance. Those distinctions create real behavioral differences and are not merely prose expansion.

### Findings

#### C-1: Question text is defined twice inside `answerability_scope`

Severity: Material

Evidence:
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:150`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:154`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:162`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:167`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:783`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:787`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:795`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:800`

What:
`declared_handoff_questions[]` owns `question_id` and `question`, but `supported_questions[]`, `deferred_questions[]`, and `unsupported_questions[]` also carry `question`. The validation rules then say the grouped question IDs must exactly partition the declared inventory, and the contract says status is encoded by membership rather than a separate status field.

Why this is a conciseness issue:
This creates multiple paths for the same question definition: the declared inventory path and each status-bucket path. The status buckets add distinct classification facts, but repeating `question` in each bucket does not add a distinct ontology concept or authority. It risks drift where `q1` has one text in `declared_handoff_questions` and another in `supported_questions`.

How to fix:
Make `declared_handoff_questions[]` the sole authority for question text. In `supported_questions[]`, `deferred_questions[]`, and `unsupported_questions[]`, keep `question_id` plus status-specific fields only. If display text is needed, define it as a derived projection from `declared_handoff_questions[].question`.

### Non-Issues Checked

- `relation_participation` is not a duplicate relation authority because connected participation is derived from `top_level_relations`, while `relation_participation` is limited to isolation exceptions.
- `frontier_pressure_log` plus `pressure_events` is not redundant: one records current pressure state, the other records lifecycle transitions.
- `prior_*_mappings` plus `*_identity_events` is acceptable because the contract distinguishes cross-Seed transition projections from within-lifecycle provenance, and requires derivability or shared evidence refs.
- README and `IMPLEMENTATION_MAP.html` now provide authority-reference summaries rather than competing field-level contracts.

### Boundary Notes

No web research was used because the prompt packet denies web research. Review was limited to the authoritative materialized diff, role definition, software-engineering conciseness rules, review target profile, and direct line checks in files explicitly represented by the diff.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "version 5; last_updated 2026-05-28"
  anchor: "2. Removal Target Patterns / Relationship Redundancy"
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "version 5; last_updated 2026-05-28"
  anchor: "1. Allowed Redundancy / State Management"
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "version 5; last_updated 2026-05-28"
  anchor: "2. Removal Target Patterns / LLM-Native Context Noise"

### Domain Context Assumptions
[]