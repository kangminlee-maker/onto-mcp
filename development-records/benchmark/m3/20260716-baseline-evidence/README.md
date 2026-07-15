# M3 defect-spectrum — P0 instrument-characterization DISCLOSURE (2026-07-16)

> **DISCLOSURE.** A P0 pipeline-validation + judge-instrument characterization,
> NOT a model comparison and NOT a stable baseline. It scores ONE persisted
> evidence set per fixture (the 2026-06-11 ontology review runs) with the Opus
> 4.8 attribution judge. Changes no registration/authority. **The captured
> single-draw bands here are illustrative, NOT verdicts — see the stability
> finding.**

## What the pipeline does (works, verified)

parse ground-truth + evidence issue/finding ledgers → Opus 4.8 judge attributes
each material issue to seeded defect(s) → score graded spectrum (recall /
precision / severity / band, bands anchored to ground truth). The judge measures
real conceptual detection, not vocabulary echo (genuine misses and fabrications
drive the numbers). The scorer and capture→replay are **deterministic** (replay
reproduces byte-for-byte). `capture/<fixture>.json` = the judge attributions of
this single draw; `report.json` = its scored spectrum.

## Finding 1 — the judge instrument had band-flipping variance; effort-pinning fixes the gross swing

Effort-UNSET, an N=1 clinical-lab probe scored 상회 (material 7/7, ~17.3k judge
output tokens); a second identical-input dispatch scored 미달 (6/7, ~401 tokens).
A ~40× output-token swing = uncontrolled adaptive thinking. **Pinning
`reasoning_effort=low`** removed that swing: clinical-lab is then STABLE over K=4
(band below, material-recall / precision spread 0.000, ~401 tokens each).

Accuracy check on the disagreement: the stable low-effort answer (material 6/7)
is the CORRECT one — the review's issue-ledger raises no Specimen-lifecycle issue,
so CLW-5 is a genuine review miss; the thinking-heavy path's 7/7 over-attributed
a specimen-mentioning catalog issue to the lifecycle defect (refute-by-default
violation). Bounded effort is both stable AND more faithful. `effort=low` is the
validated default.

## Finding 2 — effort-pinning does NOT remove NEAR-THRESHOLD instability; a single judge run is not a verdict

At the pinned `effort=low`, the two larger fixtures still flip bands run-to-run
because their metric sits on a threshold (intra-judge stability probe, K=3):

| fixture | K=3 bands | driver | verdict |
|---|---|---|---|
| clinical-lab-workflow | below, below, below, below (K=4) | material 0.857 (stable) | **STABLE** |
| credit-risk-taxonomy | below / exceeds / exceeds | material recall 0.875↔1.000 around meet=1.0 (CRT-8 in/out) | **UNSTABLE** |
| manufacturing-bom | meets / meets / below | precision 0.731↔0.808 around floor=0.8 (5–7 fabrications) | **UNSTABLE** |

This empirically confirms design-review **H3** (near-threshold under-power) and
**H4** (run-to-run noise) TOGETHER: when recall/precision sits near a band cut, a
single attribution decision flips the band. A single judge dispatch therefore
cannot yield a trustworthy band.

## Conclusion → required methodology (next P0 step, not yet implemented)

M3's scoring path must be the **intra-judge stability control** (design §3-3), not
a single run:
1. dispatch the judge K times per fixture (effort=low);
2. if the band is stable across K → report it;
3. if unstable → report **indeterminate** with the metric range, never force a
   single-draw band.

The single-draw `report.json` in this dir is retained ONLY as the
instrument-characterization evidence above; do not read its bands as M3
measurements.

## Provenance
- Judge `claude-opus-4-8`, oauth/subscription route (`ANTHROPIC_API_KEY` unset).
- Band thresholds anchored to ground truth (도달 = full material recall; 상회 = that
  + precision ≥ 0.9; 미달 floor precision 0.8), never the scored distribution (F4).
- Stability-probe numbers above are from `scripts/m3-run.ts --repeat K --judge-effort low`.
