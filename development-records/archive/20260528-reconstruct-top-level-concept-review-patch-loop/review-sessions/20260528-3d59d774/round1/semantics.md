# Semantics Lens Review

## Verdict

No material semantic documentation/design-contract issue remains in the reviewed diff within the declared boundary.

The patch meaningfully aligns the reconstruct top-level concept discovery contract with the requested concept-centered Seed design. The key names now match their intended semantic roles: `FrontierPressure` is broader than the retired `TopLevelnessPressure`; `SeedAnswerability` is clearly bounded to Seed-stage questions/actions; `SeedLifecycle` covers identity, provenance, and cross-round continuity; `top_level_relations`, `lower_level_detail_placements`, `frontier_pressure_log`, `material_coverage_checkpoint`, `answerability_scope`, and `migration_records` are each named as authority seats rather than derived prose.

## Findings

No findings.

## Semantic Checks

- Retired `boundary_notes` now maps to `top_level_concepts[].boundary` with explicit included/excluded/deferred meaning, so the prior ambiguity between notes and structured boundary authority is resolved.
- `alias_changed` is semantically grounded as a concept identity event with prior/current alias arrays, preserving alias provenance without implying a concept rename.
- `source_authority_scope_changed` now has prior/current state refs or inline prior/current authority state, which gives the lifecycle event a traceable semantic before/after meaning.
- Concept and relation split/merge continuity is represented with array authorities, correctly preserving one-to-many and many-to-one semantics instead of overloading singular IDs.
- Pressure lifecycle terminology is now coherent: status values distinguish `open`, `resolved`, `deferred`, `superseded`, and `non_blocking`; transitions carry prior/new status.
- Answerability status is correctly encoded by list membership in `supported_questions`, `deferred_questions`, or `unsupported_questions`, avoiding a competing `question_status` field.
- Legacy compatibility terminology is semantically clear: prior fields are compatibility projections, while concept-centered fields are the authority.
- README and `IMPLEMENTATION_MAP.html` now summarize the same concept-centered authority areas as the contract, without introducing conflicting vocabulary.

## Boundary And Evidence Notes

This review used the materialized diff as the authoritative target input and did not inspect other lens outputs. Web research was denied by the prompt boundary and was not used. I did not verify runtime implementation behavior; this lens conclusion is limited to semantic correctness of the documentation/design-contract diff.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version 8, last_updated 2026-05-28"
  anchor: "LLM-Native Engineering Terms; Document Design Terms; Homonyms Requiring Attention; Interpretation Principles"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version 4, last_updated 2026-05-28"
  anchor: "Ownership Boundary Structure; Response Format Constraints; Output Sink Constraints"

### Domain Context Assumptions
[]