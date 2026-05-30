## Evolution Lens Result

### Findings

#### Medium: Legacy migration coverage still omits several retired Seed seats

The patch now defines `migration_records` as the canonical transitional migration seat and says migration compatibility must not be claimed from prose alone. However, the explicit legacy compatibility section only names `entities`, `relations`, `actions`, `properties`, `rules`, and `claim_id` as legacy fields. The diff removes or supersedes other prior Seed seats and projections, including `included_lower_concepts`, `excluded_or_deferred_details`, `core_relations`, `open_questions`, `deferred_detail_candidates`, and `convergence.remaining_pressures`, but does not explicitly map them to the new authorities.

Why this matters from the evolution perspective: the design is a schema/data-model migration. Future runs, same-session continuation, or cross-run lineage consumers need to know how old Seed artifacts coexist with the new concept-centered shape. Without explicit compatibility mapping for the retired frontier/detail/relation/question seats, older artifacts can lose lifecycle continuity even though the new contract otherwise requires identity and pressure preservation.

Evidence:
- The old fields are removed or replaced in the Seed shape around `.onto/review/20260528-391bbc3f/execution-preparation/materialized-input.md:941`.
- The new legacy compatibility list only enumerates `entities`, `relations`, `actions`, `properties`, `rules`, and `claim_id` at `.onto/review/20260528-391bbc3f/execution-preparation/materialized-input.md:955`.
- `migration_records` requires source field, target authority field, mapping rule, compatibility status, obligation status, and dropped/deferred rationale at `.onto/review/20260528-391bbc3f/execution-preparation/materialized-input.md:981`.
- The implementation path repeats the same narrower legacy mapping list at `.onto/review/20260528-391bbc3f/execution-preparation/materialized-input.md:1142`.

How to fix:
- Extend the Legacy Compatibility section and implementation path with explicit mappings for the removed reconstruct-local seats:
  - `included_lower_concepts` -> `lower_level_detail_placements` plus derived concept boundary summaries
  - `excluded_or_deferred_details` -> `lower_level_detail_placements`
  - `core_relations` -> `top_level_relations`
  - `open_questions` -> `answerability_scope.deferred_questions` or `frontier_pressure_log`, depending on whether the question affects handoff answerability or convergence pressure
  - `deferred_detail_candidates` -> `lower_level_detail_placements`
  - `convergence.remaining_pressures` -> `frontier_pressure_log` plus `convergence.remaining_pressure_ids`
  - any prior `frontier_refs` shape -> `frontier_pressure_log`
- State that a transitional Seed exposing any of those old seats must carry `migration_records` before claiming migration compatibility.

### Positive Confirmations

The requested fixes are materially present for the main concept-centered target shape:

- Concept/relation split and merge lifecycle continuity now uses array authority for split/merge, with singular fields demoted to compatibility/display projections.
- Pressure lifecycle events now include `prior_status`, `new_status`, `current_pressure_id`, and supersession refs.
- Answerability status is represented by membership in `supported_questions`, `deferred_questions`, or `unsupported_questions`, with an explicit prohibition on a duplicate `question_status`.
- `answerability_events` now carry question/action refs and frontier pressure refs, and validation expects those refs to point to known answerability IDs.
- `source_authority_scope` is preserved inside `material_coverage_checkpoint`.
- Material coverage lifecycle events include `source_authority_scope_changed`, changed authority fields, and prior/current authority state refs.
- Pressure status validation covers `open`, `resolved`, `deferred`, `superseded`, and `non_blocking`, and blocks `converged_for_seed` while pressures remain `open`.
- README and IMPLEMENTATION_MAP are aligned with the expanded contract at the summary level.

### Residual Risk

No source mutation or runtime implementation was inspected beyond the supplied diff target. This review only verifies the documentation/design-contract patch within the declared boundary. Runtime validators, schema migration code, and generated Seed artifacts may still need separate verification.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/extension_cases.md"
  source_version_or_snapshot_id: "version 8, last_updated 2026-05-28"
  anchor: "Case SE-03: Schema or Data Model Change"

### Domain Context Assumptions
- "This patch is treated as a schema/data-model evolution because it changes Seed artifact authorities, identity fields, lifecycle events, and compatibility projections."