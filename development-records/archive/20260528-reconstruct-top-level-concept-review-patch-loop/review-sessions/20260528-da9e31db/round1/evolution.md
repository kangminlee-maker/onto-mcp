## Lens: evolution

## Findings

### Medium — `boundary_notes` migration targets a field that the concept-centered Seed shape does not define

What: The legacy compatibility table maps retired `boundary_notes` to `top_level_concepts[].boundary_statement` or a derived final-output summary, but the Seed output shape defines `top_level_concepts[].boundary.included_summary`, `excluded_summary`, and `deferred_summary`; it does not define `boundary_statement`.

Why it matters for evolution: this is a schema/data-model migration fragility. A future concept-centered Seed implementation or migration validator could preserve most retired seats, then fail or silently invent a new boundary field when migrating `boundary_notes`. That weakens continuity for legacy artifacts and creates ambiguity about which boundary seat survives schema migration.

Evidence:
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:799` defines `boundary:` with included/excluded/deferred summaries.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:935` maps `boundary_notes` to `top_level_concepts[].boundary_statement`.
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:997` says runtime can validate every concept having a boundary statement, but the output shape does not name that field.

How to fix: either add `boundary_statement` to the concept-centered Seed shape as the canonical concise boundary field, or change the migration target to the existing `top_level_concepts[].boundary` object with an explicit rule for distributing or preserving legacy `boundary_notes` across `included_summary`, `excluded_summary`, and `deferred_summary`. Keep final-output summaries derived only.

## Positive Evolution Assessment

The patch otherwise materially improves change tolerance for the reconstruct Seed design. It adds obligation statuses before schema promotion, same-session versus lineage identity scope, split/merge lifecycle continuity, pressure status transitions, answerability membership semantics, source-authority preservation, material coverage events, retired-seat migration records, and implementation-order guidance.

README and `IMPLEMENTATION_MAP.html` are aligned at summary level with the expanded contract scope.

## Boundary Notes

Review was limited to the prompt-declared file set and explicit target diff/materialized input. No web research was used because the packet denies web access.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/extension_cases.md"
  source_version_or_snapshot_id: "version 8 / sha256 2733c8eeda9958f982cdb6f62e462656db1be1cc143f14531519c12b8cd9ac04"
  anchor: "Case SE-03: Schema or Data Model Change"
- source_doc: ".onto/domains/software-engineering/extension_cases.md"
  source_version_or_snapshot_id: "version 8 / sha256 2733c8eeda9958f982cdb6f62e462656db1be1cc143f14531519c12b8cd9ac04"
  anchor: "Case SE-07: Service or Feature Decommissioning"

### Domain Context Assumptions
[]