# Conciseness Lens Result

## Verdict

Material conciseness issues remain. The patch largely improves authority separation, but two schema areas still introduce duplicate or weakly differentiated concept paths.

## Findings

### C-1 Duplicate singular/plural lifecycle mapping fields

Severity: material

Where: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md` §6 `lifecycle.prior_concept_mappings` and `lifecycle.prior_relation_mappings`

What: the lifecycle schema carries both singular and array forms for the same mapping relationship, for example `prior_concept_id` plus `prior_concept_ids`, and `current_relation_id` plus `current_relation_ids`. The contract later says the array fields are the authority for split/merge continuity and singular fields may exist only as compatibility or display projections.

Why: this creates multiple active paths for the same relationship. Preserved or renamed one-to-one mappings can be represented by one-item arrays, while split/merge require arrays. Keeping singular fields inside the required lifecycle shape risks divergence and violates ontology-level parsimony.

How to fix: remove singular ID fields from the canonical lifecycle schema, or move them explicitly to the legacy/compatibility section as optional derived projections. Validation should treat only the array fields as authoritative.

### C-2 Relation participation exception status is over-split

Severity: moderate

Where: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md` §7 `relation_participation_exceptions[].status`

What: `provisionally_isolated` and `boundary_isolated` both classify the same structural condition: a concept has no endpoint membership in `top_level_relations`. The useful distinction appears to live in `isolation_reason` and `isolation_pressure_ids`, not in the status enum itself.

Why: the patch does not define a different validation rule, consumer behavior, lifecycle transition, or dependency consequence for the two status values. Under the conciseness lens, this is a sub-classification without a demonstrated material difference.

How to fix: collapse the field to a single exception marker such as `isolated`, or remove `status` and rely on the reason plus pressure refs. If both statuses must remain, define their distinct validation and handoff consequences.

### C-3 Source snapshot refs may duplicate transition current refs

Severity: minor

Where: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md` §6 `lifecycle.source_snapshot_refs` and `lifecycle.source_snapshot_transition.current_snapshot_refs`

What: both fields appear to carry the current Seed source snapshot set. The contract does not state whether `source_snapshot_refs` is a derived summary, the full historical set, or the same current snapshot list repeated outside the transition object.

Why: if both are authoritative, they are duplicate source-of-truth paths for the same snapshot identity. If one is derived, that derivation should be explicit.

How to fix: define `source_snapshot_refs` as either the current canonical snapshot authority and make transition refs derived, or make `source_snapshot_transition.current_snapshot_refs` the authority and label `source_snapshot_refs` as a derived summary.

## Confirmed Parsimony Improvements

The patch correctly avoids several prior redundancy risks:

- `declared_handoff_questions` is the sole question text authority; supported, deferred, and unsupported buckets refer by `question_id`.
- Question status is encoded by bucket membership, without a repeated per-question `question_status`.
- `relation_participation_exceptions` is framed as an isolated-concept exception projection, not a second relation graph.
- `lower_level_detail_placements` is the demotion authority, with concept-level lower-detail fields limited to summaries or compatibility projections.
- README and `IMPLEMENTATION_MAP.html` now summarize the reconstruct contract by authority reference rather than restating field-level details.

## Boundary Notes

Reviewed within the declared boundary using the embedded materialized diff, role definition, review target profile, binding/interpretation metadata, and the software-engineering conciseness domain rules. Web research was denied and not used.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/conciseness_rules.md"
  source_version_or_snapshot_id: "version: 5; last_updated: 2026-05-28"
  anchor: "2. Removal Target Patterns; 3. Minimum Granularity Criteria"

### Domain Context Assumptions
[]