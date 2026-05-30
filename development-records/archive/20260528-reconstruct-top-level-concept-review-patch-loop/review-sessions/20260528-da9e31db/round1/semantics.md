# Semantics Lens Result

## Verdict

Material semantics issue remains.

The patch substantially closes the prior concept-centered Seed design gaps: it adds explicit answerability authority, lifecycle/provenance, retired-seat migration mapping, pressure statuses, source-authority scope, relation graph authority, and README / IMPLEMENTATION_MAP alignment. However, one semantic authority-name mismatch remains in the migration mapping for retired `boundary_notes`.

## Findings

### SEM-001 — `boundary_statement` is introduced as a target authority but is not defined in the concept-centered Seed shape

Severity: medium

What: The legacy compatibility table maps retired `boundary_notes` to `top_level_concepts[].boundary_statement` or a derived final-output summary, but the Seed output shape defines `top_level_concepts[].boundary` with `included_summary`, `excluded_summary`, and `deferred_summary`; it does not define `boundary_statement`.

Evidence:
- The Seed shape defines `boundary` as the concept boundary seat: `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:831`
- The retired-seat mapping names `top_level_concepts[].boundary_statement`: `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:988`
- The validation section also says runtime can validate every top-level concept having a boundary statement: `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:1065`

Why it matters semantically: `boundary_statement` reads like a distinct authority field, while the patch otherwise establishes authority-seat discipline: concept-centered fields are canonical and derived summaries must not become competing truth. In software-engineering terms, this creates a Source of Truth ambiguity for boundary meaning.

How to fix: Either define `top_level_concepts[].boundary_statement` explicitly in the Seed shape as the canonical boundary summary, or change the retired-seat mapping and validation language to target `top_level_concepts[].boundary` / `top_level_concepts[].boundary.{included_summary,excluded_summary,deferred_summary}`. If final output prose is allowed, keep it explicitly derived from that boundary object.

## Correctness Notes

No additional semantic issues found within the declared boundary.

The following requested concerns appear semantically addressed in the patch:
- Concept-centered lifecycle guidance is present for concepts, relations, details, pressures, answerability, material coverage, and convergence.
- Retired-seat migration mappings are explicit for lower-detail seats, relation summaries, open questions, deferred details, remaining pressures, and prior frontier refs.
- Concept/relation split and merge continuity uses array fields as authority.
- Pressure status transitions include prior/new status and supersession fields.
- Answerability status is encoded by list membership rather than a duplicate `question_status`.
- `source_authority_scope` preservation is named in material coverage checkpoint and lifecycle events.
- README and IMPLEMENTATION_MAP summarize the new concept-centered authority set consistently.

## Boundary And Evidence

No web research was used because the prompt packet denied web research. Review was limited to the materialized diff and explicitly listed domain documents.

### Domain Constraints Used

- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version: 8; last_updated: 2026-05-28"
  anchor: "Architecture Core Terms / Source of Truth"
- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version: 8; last_updated: 2026-05-28"
  anchor: "LLM-Native Engineering Terms / Runtime Boundary"
- source_doc: ".onto/domains/software-engineering/concepts.md"
  source_version_or_snapshot_id: "version: 8; last_updated: 2026-05-28"
  anchor: "LLM-Native Engineering Terms / Artifact Truth"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version: 4; last_updated: 2026-05-28"
  anchor: "Response Format Constraints"

### Domain Context Assumptions

[]