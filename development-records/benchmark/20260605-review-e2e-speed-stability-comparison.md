---
as_of: 2026-06-05
status: completed
purpose: current review E2E speed, stability, and semantic quality comparison
sources:
  current_mock_report: development-records/benchmark/20260605-review-pipeline-current-mock.json
  post_map_reduce_mock_report: development-records/benchmark/20260607-review-pipeline-post-map-reduce-mock.json
  codex_2lens_compare: development-records/benchmark/review-pipeline-codex-2lens-compare-20260605.json
  codex_2lens_semantic: development-records/benchmark/review-pipeline-codex-2lens-semantic-20260605.json
  codex_2lens_semantic_audit: development-records/benchmark/review-pipeline-codex-2lens-semantic-quality-20260605.md
  historical_full_e2e: development-records/benchmark/20260418-topology-smoke-full-e2e-results.md
  full_current_session_root: /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-real-e2e-vhEKDs/.onto/review/20260605-f44ff3b7
---

# Review E2E Speed and Stability Comparison - 2026-06-05

## Comparison Boundaries

The evidence has three different scopes:

| Scope | What it proves | What it must not be used for |
|---|---|---|
| Real Codex 2-lens benchmark | Same current checkout, same fixture, `existing-low-effort` vs `controlled-high-effort` | Legacy checkout comparison or full 6-lens latency |
| Current mock 6-lens benchmark | Runtime overhead, artifact shape, output contract stability, repeatability | Model quality or real LLM latency |
| Current real full MCP E2E | Product path completion through MCP review/result/status and full artifact retrieval | Direct speed comparison with old 4-lens light topology |

The April 18 historical result is a useful reference point, but it ran a
smaller light path: 4 lenses plus synthesize, Claude-host topology, no
issue-artifact chain, no controlled lens deliberation artifact path, and no
MCP-native result projection.

## Real Codex 2-Lens Comparison

Two current-checkout single-run Codex comparisons were already captured.
Both use the same 2-lens fixture (`logic`, `structure`) and compare low-effort
baseline with controlled high effort.

| Report | Baseline command ms | Controlled command ms | Speed delta | Output delta | Final output delta | Failed units |
|---|---:|---:|---:|---:|---:|---:|
| `review-pipeline-codex-2lens-compare-20260605.json` | 495400 | 467669 | -5.6% | -11.94% | -6.1% | 0 -> 0 |
| `review-pipeline-codex-2lens-semantic-20260605.json` | 590200 | 438657 | -25.68% | -35.47% | -25.35% | 0 -> 0 |

Observed result: controlled-high-effort was faster in both real Codex
single-run pairs despite higher effort. The likely practical cause is smaller
and more focused output, not lower runtime overhead. The run count is still too
small for a statistical speed claim.

Stability result: both cases completed in all real Codex 2-lens runs with
`failed_unit_count = 0`, no degraded lenses, and exactly one attempt per unit.

## Semantic Quality

The semantic audit for the 2-lens fixture scored both cases as a near tie:

| Criterion | existing-low-effort | controlled-high-effort |
|---|---:|---:|
| Weighted semantic score | 4.3 / 5 | 4.3 / 5 |

Both cases preserved the real material issue:

- `unstableFormat(value: unknown): string` returns raw `JSON.stringify(value)`.
- `JSON.stringify(undefined)` can return `undefined`.
- The declared return contract can therefore diverge from runtime behavior.

Tradeoff:

- Existing-low-effort preserved boundary uncertainty better.
- Controlled-high-effort was more focused, more actionable, and smaller.

Quality conclusion: no material issue recall regression was observed, but
controlled output still needs a compact `Boundary Notes` contract so evidence
gaps such as `lensId` usage and orphan-export uncertainty are preserved without
inflating the final output.

## Current Mock Harness Check

Latest deterministic mock benchmark after sidecar/causal/dependency gate wiring:

```bash
npm run benchmark:review:pipeline -- --runs 1 --executor-realization mock --case controlled-high-effort --lens-id logic --timeout-ms 120000 --output development-records/benchmark/20260605-review-pipeline-current-mock.json
```

Historical note: this command used the older mock executor flag. The current
benchmark harness uses `ONTO_LLM_MOCK=1` and omits `--executor-realization` for
mock runs.

| Case | Completed | Command ms | Packet bytes | Output bytes | Final bytes | Failed units | Semantic gate |
|---|---:|---:|---:|---:|---:|---:|---|
| controlled-high-effort | 1/1 | 968 | 111674 | 5896 | 3014 | 0 | not_applicable |

Interpretation:

- The mock run confirms harness stability, artifact collection, packet/output
  accounting, and current sidecar issue-artifact shape.
- `semantic_quality_gate` remains `not_applicable` for mock because mock output
  does not evaluate target semantics.
- The gate now receives issue artifacts in real runs and can check materiality
  shape, non-material preservation, causal relation coverage, endpoint-owned
  shared-cause refs, and dependency preservation.

## Post-Map-Reduce Mock Update

Fresh deterministic mock benchmark after synthesis map-reduce and terminal
digest hardening:

```bash
ONTO_LLM_MOCK=1 npm run benchmark:review:pipeline -- --runs 1 --case controlled-high-effort --lens-id logic --timeout-ms 120000 --output development-records/benchmark/20260607-review-pipeline-post-map-reduce-mock.json
```

| Case | Completed | Command ms | Packet bytes | Output bytes | Synthesize packet bytes | Final bytes | Failed units | Semantic gate |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| controlled-high-effort | 1/1 | 1414 | 73923 | 5237 | 1467 | 2705 | 0 | not_applicable |

Compared with the 2026-06-05 mock report, total packet bytes dropped 33.8% and
synthesize packet bytes dropped 91.7%. Mock wall-clock increased, so this result
should be read as I/O and contract-stability evidence, not as live model latency
evidence.

## Current Real Full MCP E2E

Current product-path full E2E session:

- Session root:
  `/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-real-e2e-vhEKDs/.onto/review/20260605-f44ff3b7`
- Route: `worker` / `codex`
- Review mode: `core-axis`
- Lens count: 6
- Unit count: 20
- Status: `completed`
- Failed units: 0
- Attempts: 20
- Observed dispatch width: 6
- Total duration: 842510 ms, about 14m 03s
- Packet bytes: 274006
- Output bytes: 91710
- Final output bytes: 17774

Important wall-clock shape:

- Lens round completed with 6-way dispatch; earliest start to latest lens
  completion was about 31s.
- The largest latency surface is the serial issue-artifact path and later
  `problem-framing`.
- Synthesize took about 140s.
- Controlled teamlead deliberation took about 100s after parallel per-lens
  deliberation responses.

The MCP public surface was verified after the path-boundary fix:

- Standard result projection stays bounded: no full final output text and no
  full review record embedded.
- Full result projection can retrieve `finalOutputText` and `reviewRecord`.
- Terminal status projection reports `activeUnits: []`.
- `unitProgress` remains available in compact/standard status payloads.

## Historical Reference

April 18 full E2E historical smoke:

| Historical topology | Scope | Wall-clock |
|---|---|---:|
| Topology 1 | 4 lenses + synthesize, light path | about 3m |
| Topology 2 | 4 lenses + synthesize, light path | about 4m |

Current full E2E is not faster in raw wall-clock because it does more work:
6 lenses, issue artifact generation, controlled lens deliberation, problem
framing, synthesis, MCP projection checks, and artifact truth preservation.

Historical stability was good for the smaller topology smoke, but the current
path has stronger product stability evidence: it exercises the productized
MCP-native path, bounded public/full projections, runtime progress projection,
and review record retrieval.

## Conclusion

For the comparable current-checkout real Codex 2-lens benchmark,
controlled-high-effort improved observed speed by 5.6% to 25.68% and reduced
total output bytes by 11.94% to 35.47%, with no stability regression.

For deterministic 6-lens mock E2E, controlled-high-effort is effectively flat
on runtime overhead and output size, with 100% completion.

For full product E2E, the new path is more stable and more controlled, but not
yet raw faster than the old light topology because the current path covers a
larger review contract.

Tuning update:

- Implemented compact final-output `Boundary Notes` projection in
  `render-review-final-output.ts`.
- The projection preserves substantive synthesize notes first, then falls back
  to non-material classification findings, then to compact boundary uncertainty
  observed in bounded lens outputs.
- Lens-output fallback reads are session-root bounded before content is read.
- Re-rendering the controlled 2-lens Codex session changed the deterministic
  semantic quality gate from failed to passed.

Remaining optimization targets:

1. Reduce or parallelize the serial issue-artifact path.
2. Tighten `problem-framing`, controlled teamlead deliberation, and synthesize
   packet/output contracts.
3. Repeat real Codex benchmark with more runs after the next tuning step.
