# Pragmatics Lens Review

## Verdict

No material pragmatics issue found within the declared boundary.

From the user-actionability perspective, the patch now gives Seed consumers a practical path to answer: what handoff questions exist, which are supported/deferred/unsupported, which supported questions justify supported actions, what pressures block or qualify handoff, and which authority seats must be followed for lifecycle, relation, demotion, migration, material coverage, and convergence answers.

## Findings

No findings.

## Rationale

The answerability path is now explicit enough for practical use. `answerability_scope` declares the full handoff question inventory, separates supported/deferred/unsupported status buckets, requires exact coverage of declared question IDs, and makes `supported_actions[].supported_by_question_ids[]` the sole canonical support edge from questions to actions. This lets a principal or ontology author answer "what can I safely do from this Seed?" without reverse-edge ambiguity. Evidence: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md` lines 147-210 and 1031-1044.

Lifecycle questions are answerable through one practical route. The patch identifies `lifecycle.source_snapshot_refs` as current source snapshot authority, keeps prior refs under `source_snapshot_transition.prior_snapshot_refs`, and makes lifecycle mapping arrays authoritative for split/merge continuity and demotion bridges to lower-level detail IDs. Evidence: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md` lines 319-434 and 1020-1027.

Relation and pressure interpretation are also practically navigable. `top_level_relations` is the canonical relation authority, isolated relation participation has a single `status: isolated` projection, and pressure statuses are closed enough to answer whether a handoff is blocked, deferred, superseded, or non-blocking. Evidence: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md` lines 436-455 and 603-615.

Migration and documentation summaries do not create competing authority from the pragmatics lens. `migration_records` carries external artifact refs when detail is delegated, while README and IMPLEMENTATION_MAP point readers back to the top-level concept discovery contract as field-level authority instead of restating detailed rules. Evidence: `.onto/processes/reconstruct/top-level-concept-discovery-contract.md` lines 914-970; `README.md` lines 281-288.

## Boundary Notes

I reviewed only the declared target diff/materialized input plus the allowed role/domain/context files needed for this lens. I did not inspect other Round 1 lens outputs, did not use web research, and did not verify runtime implementation behavior beyond the documentation/design-contract diff.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/competency_qs.md"
  source_version_or_snapshot_id: "version 8; sha256 ad69bd914792e361584d5c39a3bf179567ec63ce6519da77da025f4584194565"
  anchor: "Applicability verdict protocol; CQ-S-03; CQ-D-04; CQ-I-01; CQ-T-02"

### Domain Context Assumptions
[]