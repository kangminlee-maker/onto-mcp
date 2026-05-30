# pragmatics

## Verdict

Material pragmatics issue remains.

The revised core contract mostly lets a real consumer answer the requested questions with one interpretation: answerability status is derived by list membership, pressure transitions have prior/new status fields, split/merge lifecycle array authority is explicit, `source_authority_scope` is preserved, and README plus `IMPLEMENTATION_MAP.html` summarize the new authority areas. However, the implementation checklist still creates an avoidable ambiguity for builders about which lifecycle event groups must be implemented.

## Findings

### P2 — Implementation path does not make the full lifecycle implementation target answerable

What: The lifecycle schema requires event groups for concept identity, relation identity, pressure, detail placement, answerability, material coverage, and convergence in `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:365` through `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:404`. The validation section also calls out pressure lifecycle events, answerability lifecycle refs, and material coverage source-authority lifecycle events at `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:986`, `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:995`, and `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1012`.

Why: The recommended implementation order only says to add lifecycle projections for “concept and relation identity, provenance, aliasing, split, merge, rename, demotion, and convergence changes” at `.onto/processes/reconstruct/top-level-concept-discovery-contract.md:1060`. A developer using that checklist as the practical execution path cannot uniquely answer whether pressure events, answerability events, detail placement events, and material coverage/source-authority events are part of the same implementation step or left for a later step. This weakens CQ-A-01/CQ-A-08 style self-contained agent execution and reviewability.

How to fix: Expand step 9 to name the complete lifecycle surface, for example: “Add lifecycle projections for concept identity, relation identity, frontier pressure status transitions, lower-level detail placement, answerability question/action changes, material coverage/source-authority changes, and convergence changes.” Alternatively, reference the lifecycle event groups in §6 as the complete implementation target.

## Confirmed Answerable Areas

- Concept/relation split and merge continuity is answerable because array authority is explicit and singular fields are compatibility/display projections only.
- Pressure prior/new status transition expectations are answerable through `pressure_events[].prior_status` and `new_status`.
- Answerability current status is answerable by membership in `supported_questions`, `deferred_questions`, or `unsupported_questions`; no competing `question_status` field remains.
- `source_authority_scope` preservation is answerable in the material coverage checkpoint and README/implementation map summaries.
- README and `IMPLEMENTATION_MAP.html` are broadly aligned with the contract’s authority areas.

## Boundary Notes

Review was limited to the prompt-declared materialized diff, the role definition, the software-engineering competency questions, the review target/context manifests, and direct inspection of the changed target files for line-level evidence. No web research or recursive reference expansion was used.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/competency_qs.md"
  source_version_or_snapshot_id: "version 8, last_updated 2026-05-28"
  anchor: "CQ-A-01 self-contained spec, CQ-A-08 prompt/context/schema reviewability"

### Domain Context Assumptions
[]