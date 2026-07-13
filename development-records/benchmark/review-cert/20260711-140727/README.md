# review-cert: gpt-5.6-sol@high — FAILED (support axis), 2026-07-11/12

First live exercise of the review-cert/v1 contract (`scripts/review-cert-run.mts`).
**Verdict: certification FAILED — sol is NOT registrable for the `review` role on
this evidence.** The decisive failure is the incomplete retry fixture. A dated
policy correction below supersedes the original quality-axis interpretation.

- Candidate: openai/gpt-5.6-sol @ reasoning_effort=high (codex OAuth route)
- Baseline: openai/gpt-5.5 @ medium (contemporaneous arm, same harness)
- Record: `review-cert-record.json` — revised-policy interpretation:
  1. `rep_floor` — `candidate/retry-policy-target-v1` finished 1/3 (run cut by
     the provider usage limit; see below). Left incomplete deliberately: the
     record does not satisfy the support floor.
  2. Non-blocking quality disclosure —
     `review-pipeline-target-v1/false_materiality_guard`: candidate pass-rate
     1/3 < baseline 2/3. This lexical fixture signal does not establish a general
     over-flagging tendency and does not reject registration by itself.

## Policy correction — 2026-07-12

Owner clarified the loss asymmetry: surfaced false positives are re-verified by
the main context before action, while a silently missed issue removes that
review opportunity. The pre-registration `review-cert/v1` policy was therefore
corrected without a schema change:

- decisive recall spine: `material_issue_recall`,
  `artifact_material_issue_recall`, `final_result_material_issue_recall`, and
  `grounding`, each candidate pass-rate 1.0 over completed runs;
- all other candidate-vs-baseline regressions remain visible as R7 quality
  disclosures and do not block G7;
- this record's candidate recall spine is 1.0 on every observed fixture/check,
  but the retry fixture still fails structurally at 1/3 completed runs.

Run history (honest provenance; per-run reports/logs retained locally under
`runs/`, not committed for bulk):
- Session 1 (23:07 KST): baseline/review 3/3 done; cut by a ChatGPT usage limit
  mid `baseline/retry` (~260 dispatches) — every codex call then fast-failed
  with zero output bytes, classified `output_contract`.
- Session 2 (01:25 KST, `--resume`): baseline completed, candidate/review 3/3,
  candidate/retry 1/3; second usage-limit cut at ~02:40.
- Witness: `capture/*.jsonl` are the PATH-shim argv logs (arm-level witness;
  345 dispatches). Session-1 capture lines (318) were destroyed by a
  fresh-truncate bug in the first resume validation (fixed in 9e3db8b); the
  arm-level witness contract is satisfied by the session-2 lines, and the very
  first session-1 line (`-m gpt-5.5`, `model_reasoning_effort="medium"`) was
  verified live before the loss.
- candidate/retry also hit 3 pre-unit 10-minute hangs (timeout kills, cause
  not diagnosed) — an open harness/runtime observation, not a sol signal.
