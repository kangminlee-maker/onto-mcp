# M3 defect-spectrum — P0 pipeline + judge-instrument characterization (2026-07-16)

> **DISCLOSURE.** A P0 pipeline validation + judge-instrument characterization,
> NOT a model comparison and NOT a trustworthy baseline. Scores ONE persisted
> evidence set per fixture (2026-06-11 ontology review runs) with the Opus 4.8
> attribution judge. Changes no registration/authority. `capture/<fixture>.json`
> (schema m3-capture/2) holds the K judge attribution sets; `report.json` the
> aggregate. **The band verdicts here are NOT trustworthy — see Finding 3.**

## Pipeline (works, verified)

parse ground-truth + evidence issue/finding ledgers → Opus 4.8 judge attributes
each material issue to seeded defect(s) → score graded spectrum. Measures real
conceptual detection, not vocabulary echo. Scorer + capture→replay are
**deterministic** (replay reproduces per-run scores + aggregate byte-for-byte).

## Finding 1 — effort-pinning removes the gross judge swing (and is more accurate)

Effort-UNSET, the judge flipped clinical-lab between 상회 (material 7/7, ~17.3k
output tokens) and 미달 (6/7, ~401 tokens) on identical input — a ~40× swing from
uncontrolled adaptive thinking. Pinning `reasoning_effort=low` removes it
(clinical-lab STABLE over K=4, spread 0.000). The stable low answer (6/7) is the
CORRECT one: the review's issue-ledger raises no Specimen-lifecycle issue, so
CLW-5 is a genuine review miss; the thinking-heavy path over-attributed it
(refute-by-default violation). `effort=low` is the validated default.

## Finding 2 — the band verdict is fragile near a threshold, and its character DIFFERS by fixture

Across 14 judge runs per fixture at effort=low:

| fixture | material recall | precision | band character |
|---|---|---|---|
| clinical-lab-workflow | 0.857 (stable) | 0.917 (stable) | **stably 미달** — review genuinely missed CLW-5 & CLW-6 |
| credit-risk-taxonomy | 1.000 in 13/14, 0.875 once | 0.909 (stable) | **dominantly 상회** with a rare (~7%) judge miss |
| manufacturing-bom | 1.000 (stable) | 0.731 / 0.769 / 0.808 (19/20/21 of 26) | **genuinely INDETERMINATE** — precision straddles the 0.8 floor |

## Finding 3 — small-K "band agreement" is an UNRELIABLE stability signal

Three K=3 batches on the same fixtures disagreed with each other:
- an early probe scored credit-risk below/exceeds/exceeds and manufacturing
  meets/meets/below (both "unstable");
- this run's K=3 scored credit-risk exceeds×3 and manufacturing below×3 (both
  "stable");
- credit-risk at K=8 was exceeds×8 (material 1.0 every run).

So K=3 produced a **false "unstable"** for credit-risk (it is dominantly 상회 with
rare noise) AND, in this run's report.json, a **false "stable"** for
manufacturing (whose precision genuinely straddles the 0.8 cut). **Band agreement
over a small K cannot distinguish rare judge noise from a genuine near-cut
straddle** — the exact H3 (near-threshold under-power) the design review flagged.

## Conclusion → next-iteration methodology (NOT yet implemented)

The K-run stability control must not gate on small-K band agreement. It should:
1. run an ADEQUATE K (≥ ~8; ideally derive from observed spread);
2. report the METRIC distribution (mean + range/CI) as the primary output, the
   band as ADVISORY;
3. mark a fixture **indeterminate** when the metric distribution genuinely spans
   a band cut (manufacturing), and report a **dominant band + noise rate** when a
   rare judge miss is the only excursion (credit-risk) — distinguishing the two,
   which small-K agreement cannot.

Treat the `report.json` bands in this dir as illustrative of the pipeline and the
instrument's behavior, NOT as M3 measurements.

## Provenance
- Judge `claude-opus-4-8`, effort=low, oauth/subscription route (`ANTHROPIC_API_KEY` unset).
- Band thresholds anchored to ground truth (도달 = full material recall; 상회 = that
  + precision ≥ 0.9; 미달 floor precision 0.8), never the scored distribution (F4).
