# M3 P2 — R=2 variance-controlled comparison (gpt-5.6-sol vs gpt-5.5, 2026-07-16)

> **HEADLINE: no confident inter-model ranking is warranted at R=2.** With two
> reviews per (arm, fixture), the §3-3 intra-model-stability gate excludes EVERY
> fixture — because no domain is stable on both arms. The R=1 "directional"
> separation (gpt-5.5 higher precision on 3/4) did not survive variance control:
> it was a single-review-draw artifact, not a model property. This is the
> methodology working as designed, not a null result to bury. Changes no
> registration/authority.

## What R=2 added over R=1
R=1 pooled only the judge's K=8 spread within ONE review — it could not see
review-**generation** variance (the H3/A-4 variance source). R=2 pools two
independent reviews per cell (16 runs) and, crucially, checks whether the two
reviews land in the same band (intra-model stability, §3-3). They mostly do not.

## Per-cell intra-model stability (R=2)

| fixture | sol (per-review bands) | gpt-5.5 (per-review bands) | comparable? |
|---|---|---|---|
| logistics | UNSTABLE (exceeds / indeterminate) | STABLE (below / below) | no — sol unstable |
| clinical | UNSTABLE (below / indeterminate) | STABLE (below / below) | no — sol unstable |
| credit | UNSTABLE (meets / indeterminate) | UNSTABLE (indeterminate / exceeds) | no — both unstable |
| manufacturing | STABLE (meets / meets) | UNSTABLE (exceeds / indeterminate) | no — 5.5 unstable |

A cell is comparable only when BOTH arms are intra-model stable. **Zero cells
qualify.** `m3-compare` marks every metric `insufficient (<2 trustworthy arms)`
with the exclusion reason recorded — it never emits a ranking it cannot support.

## Why R=1 looked clear and R=2 does not
At R=1, sol landed indeterminate on 2/4 and gpt-5.5 clean-dominant on all 4, and
the single-review precision ranges were disjoint on 3/4 (gpt-5.5 higher). But a
single review's judge-K spread understates the true spread: adding a second review
widened the observed band mix enough that most cells straddle a cut across their
two reviews. The R=1 precision separation (e.g. credit 1.000 vs 0.833) does not
reproduce as a stable property — credit is intra-model UNSTABLE on both arms at
R=2. So the honest verdict is: **at this power (R=2, K=8), sol and gpt-5.5 are not
distinguishable on this fixture set** — and more reviews per cell (R≥3, or R
derived from the observed review-level SD) would be needed to separate them, if
they separate at all.

## What IS still observable (not gated by stability)
- **Recall**: both models detect nearly every seeded material defect on every
  fixture (recall_material means 0.86–1.00 both arms) — no recall gap, consistent
  with R=1.
- **Wall time** (does not depend on the stability gate): gpt-5.5 reviews ran
  379–758s across both reps (8 reviews); sol ran 770–1255s — **non-overlapping
  ranges**, gpt-5.5 faster on every one of the 8 fixture×rep reviews. This is a
  robust, reproduced model-characteristic signal.
- The **canary gate held** on all 16 arm×fixture reviews (LSC-1/CLW-1/CRT-1/MBO-1
  detected — instrument engaged throughout).

## Provenance & reproduce
- sol R=2: `../20260716-p2r2-sol-arm/` · gpt-5.5 R=2: `../20260716-p2r2-gpt55-arm/`
  · comparison: `./` + `../20260716-p2r2-comparison.json`.
- Evidence sessions (committed), rep-1 / rep-2 per fixture:
  - sol: logistics b0f9e3b8/422472ec · clinical db88504e/7f1c6ba1 · credit
    6faff1a1/fcd46f25 · manufacturing 05a4a3f3/dd3002c6
  - gpt-5.5: logistics 9ee88c8b/e3fc23c8 · clinical 4d4a75e9/49a71a98 · credit
    ea9773ff/acee24d9 · manufacturing 533b3a03/e5e2a98b
- Re-score (no review spend): `npx tsx scripts/m3-run.ts --replay <arm-dir>`
  (each fixture pools its two session captures to R=2).
- Re-compare: `npx tsx scripts/m3-compare.ts --arm gpt-5.6-sol:<sol>/report.json --arm gpt-5.5:<g55>/report.json`.

## Honesty notes
- One manufacturing rep-2 judge dispatch hit a transient claude API disconnect;
  the cell was re-scored in isolation and the report rebuilt from all 8 captures
  via deterministic `--replay` (no extra review spend).
- gpt-5.5 credit rep-2 was `completed_with_degradation` (zero dropped lenses,
  17-finding ledger intact) — it scores validly; its intra-model instability is
  a real review-variance signal, not the degradation.

## Next (if a confident ranking is still wanted)
R≥3 per cell, or R derived from the per-review-level SD observed here, until both
arms reach intra-model stability on a shared set of fixtures — only then can the
precision question R=1 raised be answered rather than asserted.
