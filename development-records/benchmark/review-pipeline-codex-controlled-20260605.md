---
as_of: 2026-06-05
status: completed
purpose: controlled review pipeline real Codex smoke result
executor: codex
runs_per_case: 1
source_report: development-records/benchmark/review-pipeline-codex-controlled-20260605.json
---

# Review Pipeline Codex Controlled Smoke (2026-06-05)

## Scope

This benchmark validates the real Codex worker path for the controlled-IO
review pipeline on a small lens subset. It uses `controlled-high-effort` with
`logic` and `structure` only, so it is a real executor smoke test rather than a
full 6-lens benchmark.

## Command

```bash
npm run benchmark:review:pipeline -- --runs 1 --executor-realization codex --case controlled-high-effort --lens-id logic --lens-id structure --timeout-ms 900000 --output development-records/benchmark/review-pipeline-codex-controlled-20260605.json
```

## Result

| Case | Runs | Completed | Completion | Command ms | Total unit ms | Packet bytes | Output bytes | Synth packet bytes | Synth output bytes | Attempts | Failed units |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| controlled-high-effort | 1 | 1 | 100% | 601063 | 654518 | 102614 | 33990 | 15965 | 6217 | 12 | 0 |

## Quality Proxy

| Field | Value |
|---|---:|
| record_status | completed |
| issue_count | 2 |
| material_issue_count | 2 |
| non_material_finding_count | 0 |
| highest_severity | medium |
| action_candidate_count | 2 |

## Route

| Field | Value |
|---|---|
| execution_realization | worker |
| host_runtime | codex |
| worker_executor | codex |
| runtime_provider | codex |
| auth_mode | oauth |
| model | gpt-5.5 |
| effort | xhigh |
| service_tier | fast |

## Interpretation

- The previous profile-resolution failure is fixed: the run reached the real
  Codex worker route and completed end to end.
- Stability signal is clean for this smoke: `failure_kind_counts.none = 12` and
  `failed_unit_count = 0`.
- Runtime is still long for a 2-lens smoke: command duration was about 10
  minutes. This supports continuing with controlled IO and unit-level benchmark
  attribution before scaling to full real-model comparisons.
- This report was produced before `unit_summaries` was added to the harness, so
  it keeps aggregate timings only. Future reports will include per-unit
  duration/bytes/failure summaries.
