# structure

## Scope

Reviewed the materialized diff for `.onto/processes/reconstruct/top-level-concept-discovery-contract.md`, `README.md`, and `IMPLEMENTATION_MAP.html` from the structure lens perspective: required links, orphan seats, missing structural relationships, and documentation alignment. Web research was denied by boundary and was not used.

## Findings

### structure-001 — `boundary_notes` maps to a non-existent authority field

Severity: medium

What: The legacy compatibility table maps retired `boundary_notes` to `top_level_concepts[].boundary_statement` or a derived final-output summary, but the Seed output shape does not define `top_level_concepts[].boundary_statement`. The current shape defines `top_level_concepts[].boundary.included_summary`, `excluded_summary`, and `deferred_summary` instead.

Evidence:
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:799` defines `boundary.included_summary`, `excluded_summary`, and `deferred_summary`.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:935` maps `boundary_notes` to `top_level_concepts[].boundary_statement`.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:997` also says runtime validates every concept having a boundary statement.

Why it matters structurally: The retired-seat migration path points to an authority seat that is not present in the declared artifact shape. That creates a dangling migration target and makes deterministic migration/validation ambiguous.

How to fix: Either add `boundary_statement` to `top_level_concepts[]` as a canonical or derived field, or change the migration and validation language to target the existing `top_level_concepts[].boundary` object. Prefer one authority path and keep final-output summaries explicitly derived.

### structure-002 — `aliases` is present in the Seed shape but lacks a lifecycle connection

Severity: medium

What: The Seed output shape adds `top_level_concepts[].aliases`, and the implementation path says concept lifecycle must cover aliasing, but the lifecycle schema has no alias-specific event type or prior/current alias fields.

Evidence:
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:795` defines `aliases: []`.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:345`-`.onto/processes/reconstruct/top-level-concept-discovery-contract.md:355` defines concept identity events with rename/split/merge/demotion/boundary changes, but no alias fields or alias event type.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1082` says lifecycle must cover aliasing.

Why it matters structurally: `aliases` becomes an orphan artifact property with no lifecycle/provenance seat. A future runtime could preserve concept IDs through renames while silently changing aliases without a traceable event.

How to fix: Add alias lifecycle coverage, for example `event_type: alias_added | alias_removed | alias_changed` plus `prior_aliases` and `current_aliases`, or state that alias changes are covered by `renamed` and add explicit alias fields to that event. Add the corresponding deterministic validation expectation if alias lifecycle is required before implementation closure.

## Structurally Correct Areas

The patch appears structurally complete for the prior material themes below within the reviewed boundary:

- Concept/relation split and merge continuity now has array-authority mapping fields and event logs.
- Pressure prior/new status transitions are connected through `pressure_events`, canonical statuses, and validation rules.
- Answerability status by list membership is explicit, and question/action references connect to validation rules.
- `source_authority_scope` is preserved in `material_coverage_checkpoint` and connected to material coverage lifecycle events.
- Material coverage source-authority changes have lifecycle event fields for changed authority fields and prior/current authority refs.
- `README.md` and `IMPLEMENTATION_MAP.html` now link the new reconstruct contract responsibilities at a high level and remain aligned with the contract direction.

## Boundary Notes

This review did not inspect implementation files or generated runtime schemas beyond the materialized diff and permitted context. Therefore, the findings are documentation/design-contract structural findings only, not claims about actual TypeScript runtime behavior.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/structure_spec.md"
  source_version_or_snapshot_id: "version: 6; sha256:defce85754cf60b644ab765ef6d11d231fad2544e5ce3e7a946bcaf53d5a427f"
  anchor: "Required Relationships"
- source_doc: ".onto/domains/software-engineering/structure_spec.md"
  source_version_or_snapshot_id: "version: 6; sha256:defce85754cf60b644ab765ef6d11d231fad2544e5ce3e7a946bcaf53d5a427f"
  anchor: "Golden Relationships / Documentation-Code alignment"
- source_doc: ".onto/domains/software-engineering/structure_spec.md"
  source_version_or_snapshot_id: "version: 6; sha256:defce85754cf60b644ab765ef6d11d231fad2544e5ce3e7a946bcaf53d5a427f"
  anchor: "LLM-Native System Structure / Provenance record"

### Domain Context Assumptions
[]