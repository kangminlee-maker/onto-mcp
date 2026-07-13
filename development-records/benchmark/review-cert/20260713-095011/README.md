# review-cert: gpt-5.6-sol@medium — PASSED, 2026-07-13

Passing record under the review-cert/v2 contract (resubmit-enabled measurement,
`scripts/review-cert-run.mts`). **Verdict: certification PASSED — gpt-5.6-sol is
registrable for the `review` role on this evidence.** This supersedes nothing:
the earlier `gpt-5.6-sol@high` attempt (`../20260711-140727`) FAILED on the
support axis (rep_floor, quota-cut). This is a fresh candidate at **medium**
effort — a distinct config — and it passes cleanly.

- Candidate: openai/gpt-5.6-sol @ **medium** (codex OAuth route)
- Baseline: openai/gpt-5.5 @ medium (contemporaneous arm, same harness;
  registry-anchored, currently the shipping review-seat model)
- Record: `review-cert-record.json` — `validateReviewCertRecord` → **0
  violations** (harness recompute + an independent revalidation pass)
- Support: all four arm×fixture keys at **3/3 completed reps**
- run_controls pin (v2): `{salvage_enabled:false, resubmit_enabled:true}`

## Quality (non-blocking disclosure + decisive spine)

`quality_pass=true`. All 24 fixture×check pass-rates are candidate ≥ baseline:

- 20 equal — including the decisive recall spine (`material_issue_recall`,
  `artifact_material_issue_recall`, `final_result_material_issue_recall`,
  `grounding`) at 1.0 on every fixture for both arms;
- **4 above baseline**: `false_materiality_guard` and
  `boundary_uncertainty_preservation`, on BOTH fixtures, baseline 0.667 →
  candidate **1.0**;
- 0 regressions.

The guard axis is the exact check that failed the sol@high candidate; at medium
effort sol exceeds baseline on it across both fixtures. Interpretation: lower
effort helped sol here — it over-flagged less and preserved boundary
uncertainty more consistently than the baseline.

## Witness (arm-level contract)

`capture/*.jsonl` are the PATH-shim argv logs. **declared == witnessed for both
arms**: baseline 130 worker dispatches (136 capture lines incl. probes), every
line `-m gpt-5.5` + `model_reasoning_effort="medium"`; candidate 216 worker
dispatches (223 lines), every line `-m gpt-5.6-sol` +
`model_reasoning_effort="medium"` — both via the codex shim. The witness
contract is arm-level: it proves which (provider, model, effort) served each
arm's dispatches.

## resubmit_usage disclosure (the v2 measurement objective)

- baseline: 3/138 units across 6 ok runs (2.2%); not_run runs fired 0 more.
- candidate: 2/186 units across 6 ok runs (1.1%); not_run runs fired 0 more.

Format-rejection healing is minimal on both arms — sol@medium leans on resubmit
even less than the baseline. The v1 dominant failure class (stance
`unsupported ref` rejection) barely surfaces at this config.

## Run history (honest provenance; per-run reports/logs retained locally under `runs/`, not committed for bulk)

- Single session (09:50 KST 2026-07-13, fresh `--out`), no interruption. Both
  arms ran on the codex OAuth route; codex quota held throughout (contrast the
  sol@high run, which was cut twice by ChatGPT usage limits).
- One not_run: `candidate/retry-policy-target-v1` r2 `completed_with_degradation`.
  A single deliberation participant (`deliberation:issue-002:semantics`) failed
  its two plain-retry attempts on an unsupported-evidence-ref class; the runtime
  fallback preserved the source stance and completed the pipeline (an
  "unavailable participant" completion), which the harness honestly classified
  not_run. r3 completed the same unit first-try; r4 filled the floor. The
  degradation did NOT recur — a probabilistic miss, not a systematic weakness.
  Note: resubmit did not fire on this deliberation unit even though the class is
  resubmit-eligible; whether the deliberation-response error channel reaches the
  resubmit classifier is an open follow-up (does not affect this record's
  verdict — the run completed 3/3 without it).
- No pre-unit hangs observed (the sol@high run's undiagnosed 10-minute hangs did
  not reproduce).
