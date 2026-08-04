# review-cert: claude-fable-5@medium — PASSED, 2026-07-12/13

First PASSING record under the review-cert/v2 contract (resubmit-enabled
measurement, `scripts/review-cert-run.mts`). **Verdict: certification PASSED —
fable-5 is registrable for the `review` role on this evidence.**

- Candidate: anthropic/claude-fable-5 @ medium (claude OAuth CLI route)
- Baseline: openai/gpt-5.5 @ medium (contemporaneous arm, same harness;
  registry-anchored, currently the shipping review-seat model)
- Record: `review-cert-record.json` — `validateReviewCertRecord` → **0
  violations** (harness recompute + an independent revalidation pass)
- Support: all four arm×fixture keys at **3/3 completed reps**
- run_controls pin (v2): `{salvage_enabled:false, resubmit_enabled:true}`
  verified in-record; progress rows carry the same stamp (resume mixing guard)

## Quality (non-blocking disclosure + decisive spine)

`quality_pass=true`. All 24 fixture×check pass-rates are candidate ≥ baseline:

- 22 equal — including the decisive recall spine (`material_issue_recall`,
  `artifact_material_issue_recall`, `final_result_material_issue_recall`,
  `grounding`) at 1.0 on every fixture for both arms;
- 2 above baseline: `review-pipeline-target-v1/false_materiality_guard` and
  `review-pipeline-target-v1/boundary_uncertainty_preservation`, baseline
  0.667 → candidate **1.0**;
- 0 regressions. (The guard axis is the one that failed the earlier sol
  candidate; fable-5 exceeds baseline there.)

## Witness (arm-level contract)

`capture/*.jsonl` are the PATH-shim argv logs. **declared == witnessed for both
arms**: baseline 239 worker dispatches (251 capture lines incl. probes), every
line `-m gpt-5.5` + `model_reasoning_effort="medium"` via the codex shim;
candidate 603 worker dispatches (625 lines), every line `--model claude-fable-5
--effort medium` via the claude shim (prompt/schema values logged as byte sizes,
never content). The witness contract is **arm-level**: it proves which
(provider, model, effort) served each arm's dispatches; it does not claim
per-unit routing granularity.

## resubmit_usage disclosure (the v2 measurement objective)

- baseline: 8/168 units across 6 ok runs (4.8%); not_run runs fired 0 more.
- candidate: 12/218 units across 6 ok runs (5.5%); not_run runs fired 6 more.

Interpretation: format-rejection healing is symmetric across arms — the
candidate does not lean on resubmit disproportionately (5.5% vs 4.8%). The v1
dominant failure class (stance `unsupported ref` rejection, which killed ~half
of v1 candidate attempts) is now absorbed inside units: quota-healthy candidate
attempts completed 6/6 with 12/12 checks, versus ~13% attempt survival in the
v1 run (20260712-101717). Every resubmit-applied unit completed with a
validator-passing artifact (e.g. `issue-stance:evolution` healed on its third
try in run r2).

## Run history (honest provenance; per-run reports/logs retained locally under `runs/`, not committed for bulk)

- Session 1 (21:58 KST 2026-07-12, fresh `--out`): baseline/review-pipeline
  attempts 3–7 fast-failed — the codex OAuth **refresh token was revoked**
  mid-run by account re-logins (401 `token_invalidated`, confirmed in codex CLI
  session logs; NOT a quota cut). Harness stopped, codex re-login, resumed.
- Session 2 (`--resume`, max-attempts 14): baseline both fixtures 3/3;
  candidate/review-pipeline 3/3 (first-try streak); candidate/retry r1 ok.
  r2 `completed_with_degradation`: the claude account **monthly spend limit**
  tripped during the synthesize stage — all 30 synthesis dispatches (10 issues
  × 3 attempts) died in ~5s with the CLI synthetic error "You've hit your
  monthly spend limit"; the runtime manufactured fallback completions (failed
  children preserved) and the harness honestly classified the run not_run.
  r3 ok after the limit lifted; r4–r14 wiped by a limit re-trip → REP FLOOR
  MISSED 2/3, partial record written with the single `rep_floor` violation.
- Session 3 (`--resume`, max-attempts 18): limit re-tripped mid-r15
  (`problem-framing`), wiped r16–18; second partial record.
- Session 4 (`--resume`, max-attempts 22): r19 ok → all keys 3/3, final record
  assembled, 0 violations.
- not_run composition: baseline 5 rows (all codex 401), candidate 16 rows (all
  claude spend limit) — **every not_run is environmental** (account auth or
  quota); zero candidate capability failures were observed in this run.
