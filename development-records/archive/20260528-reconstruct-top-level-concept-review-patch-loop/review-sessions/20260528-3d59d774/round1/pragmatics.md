## Findings

### P2 — Answerability scope can be present but still not answer whether the Seed covered the intended handoff questions

The patch improves practical answerability by adding `answerability_scope`, grouped question status by membership, supported action refs, and deterministic reference validation. However, the contract still does not define the complete source of the questions that must appear in `answerability_scope`.

Why this matters: a Seed can technically carry valid `supported_questions`, `deferred_questions`, and `unsupported_questions` lists while omitting an important principal-facing handoff question. In that case, a user can answer "what questions are listed?" but cannot answer "were all required Seed-stage questions considered?" The ambiguity is visible in the convergence language: it says answerability scope must support the "declared handoff questions," but the patch does not define where that declared question set lives or how omission is detected.

Evidence:
- `.onto/review/20260528-3d59d774/execution-preparation/materialized-input.md` adds the `answerability_scope` shape and reference checks.
- The same patch states that `converged_for_seed` is readiness "within this answerability scope" and later says convergence requires support for "declared handoff questions," but no required inventory or completeness rule ties those two statements together.
- `.onto/domains/software-engineering/competency_qs.md` requires answerability review to distinguish applicable questions from missing artifacts; omission should not silently pass as non-applicability.

How to fix:
- Add a completeness rule to the Seed Answerability Contract: `answerability_scope` is the complete considered question/action inventory for the declared Seed handoff purpose.
- Define where required handoff questions come from, using existing seats if possible: declared purpose, minimum Seed consumers, allowed Seed-stage actions, and any domain competency questions selected for reconstruct handoff.
- Add deterministic validation that every declared handoff question appears exactly once across `supported_questions`, `deferred_questions`, or `unsupported_questions`.
- Require `handoff_readiness_statement` to cite the relevant question IDs, so users can trace readiness to the listed question statuses.

## Correctness Notes

The previously highlighted pragmatic risks appear mostly closed in the current diff:

- Question status is now unambiguous by list membership rather than a repeated `question_status` field.
- Supported questions must point to known concept/relation IDs, and supported actions must point back to known supported questions.
- Deferred questions can carry frontier pressure refs, which gives users a practical route from "not answerable yet" to "what must be explored next."
- README and `IMPLEMENTATION_MAP.html` both describe the future concept-centered Seed shape and include answerability, lifecycle/provenance, pressure status semantics, material source-authority boundaries, relation lifecycle continuity, and retired-seat compatibility.

## Boundary And Evidence

Review was limited to the prompt-declared file set and the materialized diff target. Web research was denied and not used. I did not read other round-one lens outputs.

### Domain Constraints Used
- source_doc: ".onto/domains/software-engineering/competency_qs.md"
  source_version_or_snapshot_id: "version: 8"
  anchor: "Applicability verdict protocol"

### Domain Context Assumptions
[]