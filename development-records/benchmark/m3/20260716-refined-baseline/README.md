# M3 defect-spectrum — refined-instrument AUTHORITATIVE baseline (2026-07-16)

> **AUTHORITATIVE.** The first M3 defect-spectrum measurement taken with the
> FIXED instrument (design §11/§12): location-signal projection + adequate K
> (=8) + distribution-based verdict + canary gate. Supersedes the P0
> characterization in `../20260716-baseline-evidence/` (which was an explicit
> instrument disclosure, NOT a baseline). Same three fixtures, same pinned
> 2026-06-11 evidence sessions, Opus 4.8 judge (effort=low, oauth/subscription).
> Still NOT a model comparison — one persisted review per fixture — but the
> scores here ARE trustworthy. Changes no registration/authority.

## Verdicts (K=8, all clean-dominant, zero run-to-run variance)

| fixture | material recall | precision | verdict | vs P0 char. |
|---|---|---|---|---|
| clinical-lab-workflow | 1.000 (sd 0) | 1.000 (sd 0) | **상회 (exceeds)** — clean | was "stably 미달" |
| credit-risk-taxonomy | 1.000 (sd 0) | 0.909 (sd 0) | **상회 (exceeds)** — clean | was "dominantly 상회 + ~7% noise" |
| manufacturing-bom | 1.000 (sd 0) | 0.808 (sd 0) | **도달 (meets)** — clean | was "genuinely INDETERMINATE (straddles 0.8)" |

At effort=low + the location projection the judge is fully deterministic here
(all 8 runs byte-identical), so the K=8 distribution is a point mass — clean
dominant, noise 0. The canary defect (CLW-1 / CRT-1 / MBO-1) is detected every
run (instrument engaged). `capture/*.json` are `m3-capture/4` (verdict_policy +
source_digests pinned); replay reproduces the report byte-for-byte.

## Why the bands moved — the location fix corrected a systematic FALSE-미달 (design §11 item 2)

The P0 characterization was itself a symptom of the instrument bug it disclosed:
the judge projection withheld each issue's location, so a strong review whose
*deliberated* issue statement was generic got refuted (refute-by-default) even
when a *surface finding* named the seeded defect exactly. Four attributions
changed once `where` (finding.target) + `evidence_refs` were supplied; every
change traces to a real finding whose target/claim genuinely names the
newly-attributed defect — a correction, not over-attribution:

- **clinical `issue-012` → CLW-5** (was unattributed). Its surface `finding-005`
  has target "clinical-lab-ontology.yaml: Specimen lifecycle" and claim "Specimen
  lifecycle stops at `analyzed` and does not cover retention, storage, disposal
  …" — a word-for-word match to CLW-5 (Specimen.lifecycle gap). The review *did*
  raise it; only the shared-root issue statement was generic. **This is the
  clean proof of the fix.** (Corrects the P0 README's claim that "the review
  raises no Specimen-lifecycle issue" — that was the bias, not a real miss.)
- **clinical `issue-009`: CLW-10 → CLW-2**. `finding-011` target
  "state_rules / Report.result_status synchronization" steered attribution from
  the medium Order-completed temporal gap (CLW-10) to the material
  Result.status↔Report.result_status authority conflict (CLW-2) it actually
  targets — a refinement to the more precise material defect.
- **manufacturing `issue-034` → MBO-10** (was unattributed; this is the
  below→meets driver). The statement explicitly names "effective_date 규칙이
  집행 불가능" via `finding-037` — the BomLine effectivity/effective_date binding
  gap that IS MBO-10. The softest of the four (indirect), but legitimate.
- **credit `issue-006`: +CRT-7**. Benign — CRT-7 already detected elsewhere; no
  band effect.

## Reproduce
- Re-score, no spend: `npx tsx scripts/m3-run.ts --replay development-records/benchmark/m3/20260716-refined-baseline`
  ⚠ never `--replay` the P0 `20260716-baseline-evidence/` dir directly — it
  rewrites that dir's committed report.json (which the P0 README cites).
- Re-run live (owner spend): `npx tsx scripts/m3-run.ts --judge-auth oauth --judge-runs 8`
  with the three `--fixture … --session …:…` pins used here.

## Provenance
- Judge `claude-opus-4-8`, effort=low, oauth/subscription (`ANTHROPIC_API_KEY` unset).
- Pinned evidence: clinical 20260611-f1a64fc4 · credit 20260611-5161a370 · manufacturing 20260611-ca3c674b.
- Band thresholds anchored to ground truth (도달 = full material recall; 상회 = that
  + precision ≥ 0.9; 미달 floor precision 0.8), never the scored distribution.
- Verdict policy: min_adequate_runs 8 · dominant_min_fraction 0.85 · significant_mode_fraction 0.15.
