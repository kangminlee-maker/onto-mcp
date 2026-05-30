## Pragmatics Review Result

No material pragmatics issue found within the declared boundary.

The current diff makes the Seed answerability path practically usable: `declared_handoff_questions` is the sole question-text inventory, while `supported_questions`, `deferred_questions`, and `unsupported_questions` classify by `question_id` only and are required to exactly cover that inventory. This gives a user one clear path from “what question exists?” to “is it answered, deferred, or unsupported?” without competing question text seats.

The reviewed contract also gives practical answer paths for the requested regression areas:

- `relation_participation_exceptions` is clearly an isolated-concept exception projection, not a second relation authority.
- Demotion is traceable from prior concept IDs into `lower_level_detail_placements` through lifecycle mappings/events.
- Pressure states and transitions are answerable through `frontier_pressure_log` and `pressure_events`, including `non_blocking`, `deferred`, `superseded`, and `open`.
- `source_authority_scope_changed` has enough prior/current state fields to answer what changed.
- Split/merge continuity is answerable through array authority for prior/current concept and relation IDs.
- External migration detail is answerable through `migration_records[].migration_artifact_ref`.
- README and `IMPLEMENTATION_MAP.html` now summarize the authority reference without becoming a competing field-level authority.

From the pragmatics lens, the updated design lets target users answer “what can this Seed support?”, “what remains deferred or unsupported?”, “what authority seat do I inspect?”, and “what references prove the answer?” with a single intended interpretation.

## Boundary Notes

No web research was used because the prompt packet denied web research. I did not inspect other Round 1 lens outputs.

## Evidence Used

- `.onto/review/20260528-e8c8b240/execution-preparation/materialized-input.md`
- `.onto/processes/reconstruct/top-level-concept-discovery-contract.md`
- `README.md`
- `IMPLEMENTATION_MAP.html`
- `.onto/domains/software-engineering/competency_qs.md`
- `.onto/domains/software-engineering/prompt_interface.md`

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/competency_qs.md"
  source_version_or_snapshot_id: "version: 8; source_sha256: ad69bd914792e361584d5c39a3bf179567ec63ce6519da77da025f4584194565"
  anchor: "Applicability verdict protocol"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version: 4; source_sha256: 8b201dc3fb2be67d1eb7d22ba85f4476000c137ece501d5712bb261f07740f97"
  anchor: "Response Format Constraints"

### Domain Context Assumptions
[]