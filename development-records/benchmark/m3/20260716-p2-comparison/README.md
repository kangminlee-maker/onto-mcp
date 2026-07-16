# M3 P2 — first inter-model comparison (gpt-5.6-sol vs gpt-5.5, 2026-07-16)

> **DIRECTIONAL, not a confident ranking.** R=1 review per (arm, fixture): each
> metric range is the Opus-4.8 judge's K=8 spread only — review-generation
> variance is UNESTIMATED. A confident inter-model claim needs R≥2 reviews per
> cell + an intra-model-stability pass (design §3-3). This is the first real
> exercise of the full M3 pipeline end-to-end across 4 domains and 2 models;
> treat the directions as hypotheses to confirm at R≥2, not verdicts. Changes no
> registration/authority.

## Setup
- Arms: **gpt-5.6-sol@medium** vs **gpt-5.5@medium**, both via codex OAuth, every
  review seat pinned to the one model (clean per-arm `p2-eval-settings/*.json`
  generated from the committed base).
- 4 fixtures: clinical-lab, credit-risk, manufacturing-bom, logistics-fulfillment
  (the 4th, added this session for cross-domain power).
- Each arm: one full `onto review` per fixture → evidence committed → Opus 4.8
  attribution judge, K=8, refined distribution verdict + canary gate.
- Judge is cross-family to both arms (no self-judge bias). Band cuts anchored to
  ground truth, never the observed distribution.

## Result — precision separates the models; recall does not

| fixture | recall_material (sol / 5.5) | precision (sol / 5.5) | precision direction |
|---|---|---|---|
| clinical-lab | 0.893 / 0.857 | 0.875 [.857–.929] / 0.742 [.733–.800] | **sol higher** (disjoint) |
| credit-risk | 1.000 / 1.000 | 0.833 / **1.000** | 5.5 higher (disjoint) |
| logistics | 0.944 / 0.889 | 0.958 / **1.000** | 5.5 higher (disjoint) |
| manufacturing | 1.000 / 1.000 | 0.850 [.800–.867] / **1.000** | 5.5 higher (disjoint) |

- **recall_material**: indistinguishable on all 4 (both models detect nearly every
  seeded material defect; ranges overlap).
- **precision**: distinguishable on all 4 — **gpt-5.5 higher on 3** (credit,
  logistics, manufacturing; it fabricates fewer non-attributable material issues),
  **sol higher on 1** (clinical). Directionally, gpt-5.5 surfaces cleaner
  (higher-precision) material issues here, at no cost to recall.
- **Wall time** (model-characteristic side signal): gpt-5.5 ran faster on every
  fixture — logistics 758 vs 918s, clinical 750 vs 961s, credit 578 vs 875s,
  manufacturing 683 vs 1255s (mean ~692 vs ~1002s).

## The refined methodology behaved honestly on live data

- **sol** landed **INDETERMINATE** on clinical + logistics: its fresh reviews'
  material recall genuinely straddles the full-recall cut run-to-run (the judge
  detects 9/10 vs 10/10 across K draws — e.g. clinical CLW-7/8/10 attributed in
  only 2/8 runs), so the harness refused a confident band instead of forcing one.
- **gpt-5.5** landed **dominant/clean** (sd 0) on all 4 — its reviews are more
  stably attributable at K=8.
- That sol-vs-5.5 difference in verdict *kind* (indeterminate vs clean-dominant)
  is itself a model-characteristic signal the old small-K band-agreement gate
  could not have surfaced, and the comparison layer correctly still compares the
  metric distributions across it (recall overlaps regardless; precision separates).
- The **canary gate held** (LSC-1 / CLW-1 / CRT-1 / MBO-1 detected every run on
  both arms — instrument engaged, no instrument_broken).

## Provenance & reproduce
- Sol scores: `../20260716-p2-sol-arm/` · 5.5 scores: `../20260716-p2-gpt55-arm/`
  · comparison: `./` (this dir) + `../20260716-p2-comparison.json`.
- Evidence sessions (committed): sol {logistics b0f9e3b8, clinical db88504e, credit
  6faff1a1, manuf 05a4a3f3}; gpt-5.5 {logistics 9ee88c8b, clinical 4d4a75e9, credit
  ea9773ff, manuf 533b3a03}.
- Re-score (no review spend): `npx tsx scripts/m3-run.ts --replay <arm-dir>`.
- Re-compare: `npx tsx scripts/m3-compare.ts --arm gpt-5.6-sol:<sol>/report.json --arm gpt-5.5:<g55>/report.json --reps 1`.
- Judge `claude-opus-4-8`, effort=low, oauth. Verdict policy min_adequate_runs 8 ·
  dominant 0.85 · significant 0.15.

## Next (to make this a confident claim)
R≥2 reviews per (arm, fixture) + intra-model stability, so the ranges include
review-generation variance (design §3-3). At R=1 the precision separations above
are consistent and directionally clear, but not yet variance-controlled.
