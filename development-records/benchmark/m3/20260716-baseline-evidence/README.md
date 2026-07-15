# M3 defect-spectrum — P0 end-to-end DISCLOSURE run (2026-07-16)

> **DISCLOSURE run.** This is a P0 pipeline-validation run, NOT a model comparison
> and NOT a stable baseline. It scores ONE persisted evidence set per fixture
> (the 2026-06-11 ontology review runs) with the Opus 4.8 attribution judge.
> It changes no registration/authority. **Read the judge-variance finding below
> before citing any band.**

## What ran

`npx tsx scripts/m3-run.ts --judge-auth oauth` over the 3 ontology fixtures —
parse ground-truth + evidence issue/finding ledgers → Opus 4.8 judge attributes
each material issue to seeded defect(s) → score graded spectrum.
Judge model `claude-opus-4-8` (oauth/subscription route; `ANTHROPIC_API_KEY`
was unset). Band thresholds anchored to ground truth (도달 = full material recall;
상회 = that + precision ≥ 0.9; 미달 floor precision 0.8), never the scored
distribution.

## Result (this run)

| fixture | band | material recall | overall recall | precision (fabricated) |
|---|---|---|---|---|
| clinical-lab-workflow | 미달 | 6/7 = 0.857 | 8/10 | 11/12 = 0.917 (1) |
| credit-risk-taxonomy | 미달 | 7/8 = 0.875 | 8/10 | 10/11 = 0.909 (1) |
| manufacturing-bom | 미달 | 8/8 = 1.000 | 10/10 | 20/26 = 0.769 (6) |

The pipeline measures real conceptual detection, not vocabulary echo: the judge
attributed material issues to distinct seeded defects, surfaced genuine misses
(e.g. clinical-lab CLW-6 relation_inconsistency undetected) and genuine
fabrications (manufacturing-bom's 6 unattributed material issues gated its band
via the precision floor despite full recall).

## ⚠️ Key finding — the JUDGE instrument has band-flipping run-to-run variance

An N=1 probe of clinical-lab immediately before this run, on **identical input**,
scored **상회 (exceeds)**: material recall 7/7, 12/12 issues attributed, precision
1.000 — judge output ~17,274 tokens. This run scored **미달 (below)**: material
recall 6/7, 11/12 attributed, precision 0.917 — judge output ~401 tokens. Same
fixture, same evidence, same code; only a fresh judge dispatch differs.

- The scorer and capture→replay are **deterministic** (replaying this run's
  captured attributions reproduces these numbers byte-for-byte). The variance is
  **purely in the judge** (the LLM attribution), and it is large enough to **flip
  the band**.
- This empirically confirms design-review **H4** (run-to-run noise mistaken for a
  characteristic) — located on the measurement **instrument itself**, not only the
  reviewed model. The ~40× judge output-token swing (17,274 vs 401) points at
  uncontrolled adaptive-thinking / verbosity on the effort-unset claude route.

## Implication (next P0 step, not done here)

M3 verdicts are not trustworthy until the judge is stabilized:
1. Pin the judge's effort/output (constrain adaptive thinking; consider a
   structured-output schema) to shrink instrument variance.
2. Add the **intra-judge stability control** (design §3-3): dispatch the judge K
   times per fixture and refuse a band verdict unless the band is stable —
   applied to the judge, not only the reviewed model.

Until then, treat the single-run bands above as illustrative of the working
pipeline, not as measurements.

## Provenance
- capture/`<fixture>`.json — the judge attributions (replay authority).
- report.json — the scored spectrum.
- The contrasting 상회 probe was not committed (single N=1, superseded); its
  numbers are recorded above as the variance evidence.
