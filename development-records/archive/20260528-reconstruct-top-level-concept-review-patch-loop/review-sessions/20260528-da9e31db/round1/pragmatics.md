# Pragmatics Lens Result

## Verdict

Material pragmatics issues remain. The patch substantially improves answerability by adding explicit `answerability_scope`, question/action membership rules, lifecycle events, frontier pressure statuses, and README / IMPLEMENTATION_MAP alignment. However, two places still leave real consumers with ambiguous or potentially unanswerable paths.

## Findings

### finding-pragmatics-001: `boundary_notes` migration points to a non-existent concept field

Severity: material

What: The Seed output shape defines concept boundary as `top_level_concepts[].boundary.included_summary`, `excluded_summary`, and `deferred_summary`, but the legacy migration table maps `boundary_notes` to `top_level_concepts[].boundary_statement` or a derived final-output summary.

Evidence:
- `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:831` defines `boundary:` with summary subfields.
- `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:988` maps `boundary_notes` to `top_level_concepts[].boundary_statement`, which is not present in the target shape.

Why this matters pragmatically: A migration implementer cannot answer “where exactly do legacy boundary notes go?” with one interpretation. They could add a new `boundary_statement`, fold notes into the three boundary summaries, or treat them only as final-output text. That creates competing answers for the same retired-seat migration question.

How to fix: Choose one canonical target. Either add `boundary_statement` to the concept-centered Seed shape, or change the migration row to map `boundary_notes` into `top_level_concepts[].boundary.{included_summary, excluded_summary, deferred_summary}` with a deterministic split rule. If final-output text is allowed, mark it explicitly as derived only, not a migration authority.

### finding-pragmatics-002: source-authority lifecycle reconstruction is conditional when consumers need a stable before/after answer

Severity: material

What: The lifecycle schema includes `source_authority_scope_changed` events with `changed_authority_fields`, `prior_authority_state_ref`, and `current_authority_state_ref`, but validation only requires prior/current state refs “when available.”

Evidence:
- `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:351` through `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:358` define material coverage events and prior/current authority refs.
- `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:1097` through `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:1099` make prior/current state refs conditional.

Why this matters pragmatically: A consumer asking “what changed in `source_authority_scope`, from what state to what state?” may not be able to derive the answer if the refs are omitted. `changed_authority_fields` alone identifies the axis, but not the prior and current authority values. This weakens the requested preservation of source-authority lifecycle events.

How to fix: Require `prior_authority_state_ref` and `current_authority_state_ref` for `event_type: source_authority_scope_changed`, with a single explicit exception for initial material coverage creation. If inline state snapshots are preferred over refs, define that as an allowed equivalent.

## Correctness Notes

The prior answerability gaps are largely closed. The patch makes question status a list-membership fact rather than a duplicate status field, and supported questions/actions have deterministic reference checks. See `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:135` through `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:190`.

Pressure status transitions are now practically answerable: `frontier_pressure_log` is the pressure authority, valid statuses are enumerated, and lifecycle pressure events carry prior/new status fields. See `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:536` through `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:614`.

Concept/relation split and merge continuity is now answerable through array authority for prior/current IDs and explicit lifecycle mappings/events. See `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:273` through `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:383`.

README and IMPLEMENTATION_MAP are aligned at the summary level and correctly describe the concept-centered Seed shape as future target work rather than already implemented runtime behavior. See `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:1187` through `.onto/review/20260528-da9e31db/execution-preparation/materialized-input.md:1209`.

## Boundary And Evidence

I used only the prompt-declared materialized input, role definition, binding/profile metadata, and the software-engineering competency question domain document. Web research was denied by the packet and was not used.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/competency_qs.md"
  source_version_or_snapshot_id: "sha256:ad69bd914792e361584d5c39a3bf179567ec63ce6519da77da025f4584194565"
  anchor: "CQ-A-01, CQ-A-02, CQ-A-08, CQ-A-12"

### Domain Context Assumptions
[]