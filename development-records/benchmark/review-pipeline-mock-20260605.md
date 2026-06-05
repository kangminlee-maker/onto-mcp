---
as_of: 2026-06-05
status: completed
purpose: review pipeline IO/latency benchmark harness smoke result
executor: mock
runs_per_case: 3
source_report: development-records/benchmark/review-pipeline-mock-20260605.json
---

# Review Pipeline Mock Benchmark (2026-06-05)

## Scope

This benchmark validates the review pipeline benchmark harness and captures a
deterministic runtime/IO baseline. It uses the mock executor, so it measures
runtime overhead, artifact shape, packet/output byte accounting, retry/failure
classification, and report aggregation. It does not measure model quality.

## Command

```bash
npm run benchmark:review:pipeline -- --runs 3 --executor-realization mock --output development-records/benchmark/review-pipeline-mock-20260605.json
```

## Case Summary

| Case | Runs | Completed | Completion | Avg command ms | Avg unit ms | Avg packet bytes | Avg output bytes | Avg synth packet bytes | Avg synth output bytes | Attempts | Failed units |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| existing-low-effort | 3 | 3 | 100% | 911.67 | 1247 | 240060 | 11105 | 19270 | 1388 | 20 | 0 |
| controlled-high-effort | 3 | 3 | 100% | 902.67 | 1233.33 | 241643 | 11147 | 19407 | 1391 | 20 | 0 |

## Delta

`controlled-high-effort` relative to `existing-low-effort`:

| Metric | Baseline | Candidate | Delta | Delta % |
|---|---:|---:|---:|---:|
| Completion rate | 1 | 1 | 0 | 0% |
| Avg command duration ms | 911.67 | 902.67 | -9 | -0.99% |
| Avg total unit duration ms | 1247 | 1233.33 | -13.67 | -1.1% |
| Avg total packet bytes | 240060 | 241643 | 1583 | 0.66% |
| Avg total output bytes | 11105 | 11147 | 42 | 0.38% |
| Avg max packet bytes | 20623 | 20697 | 74 | 0.36% |
| Avg synthesize packet bytes | 19270 | 19407 | 137 | 0.71% |
| Avg synthesize output bytes | 1388 | 1391 | 3 | 0.22% |
| Avg final output bytes | 3258 | 3258 | 0 | 0% |
| Avg total attempts | 20 | 20 | 0 | 0% |
| Avg failed units | 0 | 0 | 0 | n/a |

## Interpretation

- Both cases completed 3/3 runs with no failed units.
- Failure classification stayed clean: `failure_kind_counts.none = 60` for each case.
- Mock runtime variance dominates the small latency delta; the current result is a harness sanity check, not a performance claim.
- Packet/output byte collection is working and stable enough to compare future real-model runs.
- The JSON report now includes `unit_summaries` for each run so future benchmark analysis can identify unit-level bottlenecks without preserving temporary session directories.
- A true legacy-vs-controlled comparison should run `existing-low-effort` on a legacy checkout and `controlled-high-effort` on this controlled-IO checkout, then compare the JSON reports.

## Related Real Smoke

The corresponding real Codex smoke was run on a small lens subset:

```bash
npm run benchmark:review:pipeline -- --runs 1 --executor-realization codex --case controlled-high-effort --lens-id logic --lens-id structure --timeout-ms 900000 --output development-records/benchmark/review-pipeline-codex-controlled-20260605.json
```

See `development-records/benchmark/review-pipeline-codex-controlled-20260605.md`.
