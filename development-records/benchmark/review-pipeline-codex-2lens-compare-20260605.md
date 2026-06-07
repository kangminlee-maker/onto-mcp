---
as_of: 2026-06-05
status: completed
purpose: real Codex 2-lens review pipeline effort comparison
executor: codex
runs_per_case: 1
source_report: development-records/benchmark/review-pipeline-codex-2lens-compare-20260605.json
---

# Review Pipeline Codex 2-Lens Compare (2026-06-05)

## Scope

This benchmark runs the current checkout through the real Codex worker route
for two cases:

- `existing-low-effort`: current pipeline settings with actor effort `low`.
- `controlled-high-effort`: current controlled-IO pipeline settings with actor
  effort `xhigh`.

This is not a legacy checkout comparison. A true old-pipeline baseline still
requires running `existing-low-effort` on the legacy checkout and comparing that
report with the controlled checkout.

## Command

```bash
npm run benchmark:review:pipeline -- --runs 1 --executor-realization codex --case both --lens-id logic --lens-id structure --timeout-ms 1800000 --output development-records/benchmark/review-pipeline-codex-2lens-compare-20260605.json
```

## Case Summary

| Case | Completed | Command ms | Total unit ms | Packet bytes | Output bytes | Synth packet bytes | Synth output bytes | Final output bytes | Attempts | Failed units |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| existing-low-effort | 1/1 | 495400 | 552220 | 102143 | 32785 | 15876 | 6301 | 10229 | 12 | 0 |
| controlled-high-effort | 1/1 | 467669 | 520420 | 102614 | 28871 | 15965 | 6566 | 9605 | 12 | 0 |

## Delta

`controlled-high-effort` relative to `existing-low-effort`:

| Metric | Baseline | Candidate | Delta | Delta % |
|---|---:|---:|---:|---:|
| Completion rate | 1 | 1 | 0 | 0% |
| Avg command duration ms | 495400 | 467669 | -27731 | -5.6% |
| Avg total unit duration ms | 552220 | 520420 | -31800 | -5.76% |
| Avg total packet bytes | 102143 | 102614 | 471 | 0.46% |
| Avg total output bytes | 32785 | 28871 | -3914 | -11.94% |
| Avg max packet bytes | 18929 | 18979 | 50 | 0.26% |
| Avg synthesize packet bytes | 15876 | 15965 | 89 | 0.56% |
| Avg synthesize output bytes | 6301 | 6566 | 265 | 4.21% |
| Avg final output bytes | 10229 | 9605 | -624 | -6.1% |
| Avg total attempts | 12 | 12 | 0 | 0% |
| Avg failed units | 0 | 0 | 0 | n/a |

## Top Unit Durations

### existing-low-effort

| Unit | Kind | Duration ms | Packet bytes | Output bytes |
|---|---|---:|---:|---:|
| problem-framing | issue_artifact | 99593 | 4685 | 2527 |
| synthesize | synthesize | 66881 | 15876 | 6301 |
| controlled-deliberation | deliberation | 56480 | 11215 | 5337 |
| finding-ledger | issue_artifact | 46954 | 3281 | 2254 |
| logic | lens | 44332 | 18929 | 2016 |

### controlled-high-effort

| Unit | Kind | Duration ms | Packet bytes | Output bytes |
|---|---|---:|---:|---:|
| problem-framing | issue_artifact | 94674 | 4685 | 1719 |
| synthesize | synthesize | 77262 | 15965 | 6566 |
| controlled-deliberation | deliberation | 57526 | 11317 | 3978 |
| finding-ledger | issue_artifact | 47027 | 3281 | 2471 |
| deliberation-logic | deliberation | 42061 | 10455 | 3497 |

## Quality Proxy

| Case | record_status | issue_count | material_issue_count | highest_severity | action_candidate_count |
|---|---|---:|---:|---|---:|
| existing-low-effort | completed | 2 | 2 | medium | 2 |
| controlled-high-effort | completed | 1 | 1 | medium | 1 |

## Interpretation

- Stability was clean in both runs: `failed_unit_count = 0`,
  `failure_kind_counts.none = 12`, and total attempts stayed at 12.
- Candidate latency was lower in this single run by about 5.6% command duration
  and 5.76% total unit duration, but N=1 is not enough to claim speed
  superiority.
- Candidate output was smaller overall by 11.94%, while synthesize output was
  slightly larger. The reduction came from non-synthesize unit outputs.
- The dominant latency units were `problem-framing`, `synthesize`, and
  `controlled-deliberation`. These are the next best targets for IO and output
  contract tightening.
- Quality proxy diverged between cases, so this benchmark should not be used as
  a quality claim. It is a stability and IO/latency observation. A repeated
  benchmark with a fixed quality rubric is needed before choosing effort
  defaults.
