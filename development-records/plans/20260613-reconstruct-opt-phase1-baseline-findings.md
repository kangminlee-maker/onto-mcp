# Reconstruct Optimization — Phase 1 Baseline Findings

> Status: Phase 1 baseline outcome (live, medium effort). Input to Phase 2 lever sequencing.
> Date: 2026-06-13
> Design: [20260612-reconstruct-pipeline-optimization-design.md](20260612-reconstruct-pipeline-optimization-design.md) §5/§7
> Record: [../benchmark/reconstruct-pipeline-live-20260613.json](../benchmark/reconstruct-pipeline-live-20260613.json) (+ `.md`)
> Mock baseline (Phase 0): [../benchmark/reconstruct-pipeline-mock-20260612.json](../benchmark/reconstruct-pipeline-mock-20260612.json)

## 0. Headline

A live baseline at the repo's declared **medium** effort completes a full reconstruct run only
**~17% of the time (1 of 6 attempts)**. The other 5 runs die at a **validation gate**, not at a
timeout and not at malformed JSON. The existing retry/recovery mechanisms structurally do not cover
the failure mode that actually occurs. **Stability (validation-failure recovery) — not speed — is the
binding constraint**, which elevates lever **L1** (structured submit + validation-feedback retry)
from "first in sequence" to "prerequisite for a reliably green medium-effort run."

The Phase 1 gate (record committed; top bottleneck units identified) is met, and the evidence
reprioritizes the Phase 2 entry (see §6).

## 1. Run conditions (reproducible)

- Harness: `npm run benchmark:reconstruct:pipeline -- --realization live --runs 3 --effort medium`
  with `ONTO_LLM_TIMEOUT_MS=420000`.
- Provider route: codex (Codex OAuth / ChatGPT), model gpt-5.5, service_tier fast.
- Effort pinned to **medium** via the harness `--effort` flag so the record is reproducible
  independent of the runner's personal settings chain (see §4, finding H1).
- Unit timeout raised to **420s** because the default 120s cannot complete the heaviest units at
  medium (see §4, finding H2). The chosen timeout is recorded in the record metadata.
- Record generated on a clean tree at commit `cad2e07` (`working_tree_state: clean`).
- The run was deliberately stopped after the 6 attempts (3×2) completed; the failure pattern was
  already definitive. Status is correctly `PRELIMINARY` (5 failed runs + only 1 scored fixture).

## 2. Failure inventory (5 of 6 runs)

| fixture | run | died at | failure class | repair available? |
|---|---|---|---|---|
| v1 | 1 | `final_output` | provenance validation — missing "Artifact Truth" + "Claim Projection" sections | **none** |
| v1 | 2 | `ontology_seed` | semantic validation — `candidate_target_ref_invalid` (disposition target not a promotable seed family) | 1 repair attempt, **still invalid** |
| v1 | 3 | `final_output` | provenance validation (same as run 1) | **none** |
| v2 | 1 | `competency_questions` | coverage validation — modeling concern `ontology_representation_formalism` uncovered | **none** |
| v2 | 2 | `final_output` | provenance validation (same as run 1) | **none** |
| v2 | 3 | — | **completed** | — |

Failure tally: **3× final_output provenance, 1× ontology_seed semantic, 1× competency_questions coverage.**
This tally is the record's structured `reconstruct_extension.failed_run_failure_class_counts`
(`{final_output_provenance: 3, ontology_seed_validation: 1, competency_questions_validation: 1}`) —
derived from a typed per-run `failure_class`, not from re-parsing error strings. Every failure is a
deterministic-validator rejection of LLM-authored content that was *parseable* but *incomplete or
semantically invalid*. None were timeouts (at 420s) and none were malformed JSON.

## 3. Retry / salvage coverage — why it does not catch these

The runtime's recovery mechanisms **relevant to the observed failures** are the three below; this is a
scoped inventory grounded in the failure paths hit here, not an exhaustive catalogue of every runtime
recovery surface (the full per-unit recovery surface is L6's matrix to enumerate). The table maps each
against the observed failures.

| mechanism | where | covers | gap vs observed failures |
|---|---|---|---|
| **parse-repair retry** | `callJsonAuthor` (all LLM units, 1 retry) | malformed JSON only | 0 of 5 failures were malformed JSON |
| **timeout recovery** | 3 of ~16 units: `source_purpose_candidates`, `ontology_seed`, `competency_questions` (`run.ts:6196/6723/7171`) | provider timeout | 0 of 5 failures were timeouts at 420s. Also structurally weak: the minimal-kernel retry is bound by the **same** timeout (no extension) and only downgrades effort high→medium (`run.ts:6727-6729`), so a >120s unit dies on both primary and kernel at 120s. `lens_judgment`, `final_output`, and ~12 other units have **no** timeout recovery. |
| **validation-failure repair** | `ontology_seed` only — exactly **one** repair attempt then hard throw (`run.ts:10578-10617`, `assertRuntimeValidationValid`) | one ontology_seed re-author with validation context | `final_output` (`run.ts:12228` hard throw) and `competency_questions` have **no** validation repair. `ontology_seed`'s single attempt was insufficient (v1 run 2 re-authored and was **still invalid**). |

Net: the failures that occur (validation-gate rejections) are exactly the class with the **least**
recovery coverage — only 1 of the affected units (`ontology_seed`) has any validation-feedback retry,
and it is a single bounded attempt. This is precisely the surface design lever **L1** generalizes
(structured submit + bounded validation-feedback retry across units) and **L6** systematizes
(per-unit recovery matrix).

## 4. Hardcoded-default findings (validate L5b)

- **H1 — effort source is not reproducible.** The runner's personal `~/.onto/settings.json` set
  reconstruct actors to `effort: xhigh`, which overrides the repo's `.onto/settings.json` `medium`
  in the settings chain (user > project). An unpinned benchmark therefore measures whatever the
  runner's machine declares. Mitigated for the harness by an explicit `--effort` pin (this baseline
  used `--effort medium`); the harness injects no default effort (INV-CFG-1), so when `--effort` is
  omitted the settings chain governs and `applied_effort` is recorded from telemetry.
- **H2 — the 120s default unit timeout is too short for the heaviest medium-effort units.**
  `ontology_seed` took 169–216s and `candidate_disposition` took 347s at medium (§5). At the default
  120s, `ontology_seed` times out on both the primary call **and** its minimal-kernel recovery and
  the run dies (observed during verification before raising the timeout). The 420s used here is a
  measurement accommodation; making this a configurable, per-unit setting is L5b.
- **Cruel tradeoff (effort ⊥ stability).** `xhigh` produces more complete output (fewer validation
  gaps) but times out; `medium` completes within 420s but its output is incomplete enough to fail
  validation ~83% of the time. Effort tuning alone cannot resolve this — it needs L1's
  validation-feedback retry to converge a medium-effort draft to a valid artifact.

## 5. Per-unit bottleneck table (top units, the 1 completed run + corroboration)

From the single completed run **v2 r3** (medium, 420s; total wall-clock **1198s**; quality q1=1.0,
q2=0.75, q3=0 dropped):

| rank | unit | duration | calls | prompt chars | output chars | primary lever |
|---|---|---:|---:|---:|---:|---|
| 1 | `lens_judgment` | 347s | **9 (sequential)** | 53,406 | 15,830 | **L3** (round-internal parallelism) |
| 2 | `candidate_disposition` | 347s | 1 | 20,093 | 7,302 | (single slow call; high variance, near-timeout) |
| 3 | `ontology_seed` | 216s | 1 | 68,795 | 61,471 | **L4** (prompt projection — input; output is the seed) |
| 4 | `competency_questions` | 48s | 1 | 40,514 | 14,734 | L4 / L2a |
| 5 | `source_purpose_candidates` | 35s | 1 | 19,287 | 9,599 | L4 |

Corroboration — an earlier single completed v1 medium/420s run (not in the committed record; q1=0.75,
q2=0.25, total 545s): `ontology_seed` 169s, `lens_judgment` 121s (9 calls), `competency_questions`
41s. Same top-3 family, **very high run-to-run variance** in absolute durations (lens 121s vs 347s).

Reading:
- `lens_judgment` is 9 **sequential** calls — the clearest single speed win is **L3** parallelism
  (cut ~347s → ~max(call) ≈ 40–50s, on the order of −25% wall-clock for the run).
- `ontology_seed` is one inherently large call (huge prompt + ~61k-char seed output); **L4** trims the
  ~69k input but the seed output is the artifact itself, so its floor stays high.
- `candidate_disposition` swung to 347s (near the 420s timeout) — a latency-variance / fragility flag
  worth watching (a borderline timeout risk that L5b/L6 should account for).
- High variance confirms the design's insistence on n≥3 + stdev before any speed delta is decision-grade.

## 6. Phase 2 reprioritization (vs design §6/§7)

The design already ordered **L1 first**; the live evidence makes the *reason* concrete and sharpens it:

1. **L1 is now a prerequisite, not merely the first lever.** At medium effort, ~83% of runs fail at a
   validation gate with no recovery. Until L1 adds bounded validation-feedback retry (final_output,
   competency_questions, candidate_disposition, and generalizing ontology_seed's single attempt),
   the live pipeline cannot reliably produce the green runs that *every* later speed/quality
   measurement (L2–L6) depends on. L1's acceptance metric **S1/S2** should be measured against this
   ~17% live completion baseline.
2. **L6 (per-unit recovery matrix) rises in importance** and should be considered alongside L1 rather
   than late: the timeout-recovery gaps (3/16 units; same-timeout-bound kernel) and the
   validation-repair gaps are the same "unit has no/insufficient recovery" surface.
3. **L3 remains the top speed lever** once runs are green — `lens_judgment` sequential 9-call cost is
   the largest, clearest wall-clock win.
4. **Quality baseline is not yet establishable.** With 1 completed run, live q1/q2 cannot be given a
   stable mean/stdev. The mock gate scores 1.0/1.0 by construction; live scored q1=1.0/0.75 and
   q2=0.75/0.25 across the 2 completed runs — usable as a *non-regression floor reference* but too
   sparse to gate on. Re-establish the live quality baseline (n≥3 per fixture) **after** L1 makes
   medium-effort runs reliably complete. The golden-gate `expected_answer_status` may also need a
   calibration pass (live legitimately returns `partially_answerable`) — defer to that point.

## 7. Phase 1 gate status

- ✅ Baseline record committed (`reconstruct-pipeline-live-20260613.*`, PRELIMINARY and honestly so).
- ✅ Top bottleneck units identified: `lens_judgment` (sequential), `ontology_seed` (large single
  call), `candidate_disposition` (variable/near-timeout).
- ➕ New, higher-priority finding surfaced: medium-effort live runs fail ~83% at validation gates with
  no recovery → L1 prerequisite. Recorded here as the Phase 2 entry condition.

**Next:** enter Phase 2 with **L1** (generate-and-validate alignment + bounded validation-feedback
retry, per design §6 L1), measured against the ~17% live completion baseline; each lever PR gated by
`onto_review` core-axis material-issue-0 (design §7).
