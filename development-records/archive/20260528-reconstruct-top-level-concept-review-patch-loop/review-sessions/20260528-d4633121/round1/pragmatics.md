# Pragmatics Lens Review

## Verdict

No material pragmatics issue found within the declared boundary.

The current diff makes the Seed more answerable from a user/action perspective: it defines a closed `answerability_scope`, gives users explicit supported/deferred/unsupported question buckets, ties supported actions only through `supported_actions[].supported_by_question_ids[]`, and keeps lifecycle, pressure, source snapshot, demotion, and migration authority paths narrow enough that a consumer can determine which question or action is supported by which canonical artifact seat.

## Findings

No blocking findings.

## Pragmatics Assessment

The target design answers the core pragmatics question: a Seed consumer can determine what the Seed can answer, what it cannot answer yet, and which actions are justified by supported questions.

Evidence:
- `answerability_scope` declares the question inventory, support buckets, supported/unsupported actions, and handoff readiness refs in one discoverable location.
- The validation rules require the declared handoff question set to exactly match the union of supported, deferred, and unsupported question IDs, preventing ambiguous missing-question states.
- `supported_actions[].supported_by_question_ids[]` is explicitly the canonical question-to-action support edge, and the contract rejects a reverse competing action-readiness edge.
- Lifecycle transition authority is discoverable through `concept_identity_events` and `relation_identity_events`, with split/merge continuity represented through prior/current ID arrays.
- Demotion from prior concept identity to lower-level detail is answerable through `concept_identity_events[].target_detail_ids`, while `detail_placement_events` avoids carrying competing prior concept lineage.
- Current source snapshot authority is answerable through `lifecycle.source_snapshot_refs`; prior refs stay under `source_snapshot_transition.prior_snapshot_refs`.
- Pressure states and transitions are bounded by declared statuses and lifecycle events, so handoff/convergence questions can be answered without interpreting free-text pressure labels.
- README and `IMPLEMENTATION_MAP.html` now point readers back to `top-level-concept-discovery-contract.md` as field-level authority instead of restating a competing detailed schema.

## Boundary And Evidence Notes

Reviewed only the prompt-declared materialized diff and prompt-declared context. Web research was denied by the packet, so no web sources were used. I did not inspect other Round 1 lens outputs.

## Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/competency_qs.md"
  source_version_or_snapshot_id: "version: 8; source_sha256: ad69bd914792e361584d5c39a3bf179567ec63ce6519da77da025f4584194565"
  anchor: "Applicability verdict protocol; CQ-S structural understanding; CQ-T types and constraints"
- source_doc: ".onto/domains/software-engineering/prompt_interface.md"
  source_version_or_snapshot_id: "version: 4; source_sha256: 8b201dc3fb2be67d1eb7d22ba85f4476000c137ece501d5712bb261f07740f97"
  anchor: "Response Format Constraints; Authority artifact sink; Fail-Loud Interface Rule"

## Domain Context Assumptions
[]