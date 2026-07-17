# Reconstruct Pipeline Benchmark (live)

> Status: PRELIMINARY — not decision-grade (performance evidence below INV-BENCH-1 thresholds (runs>=3, fixtures>=2); 1 run(s) failed before producing a record; scored quality evidence covers 1 distinct fixture(s); INV-BENCH-1 needs >=2)
> Generated: 2026-07-17T10:04:50.383Z | Commit: 2c40df63c (dirty tree)
> Fixtures: reconstruct-golden-target-v1, reconstruct-golden-target-v2 | Repetitions: 1 | Requested effort: (settings/none) | Unit timeout: 120000ms
> comparison_conclusion: null (single-case record; lever comparisons arrive with Phase 2)

## Per-fixture metrics (mean ± stdev [min..max], n)

| metric | fixture | mean | stdev | min | max | n |
|---|---|---|---|---|---|---|
| duration_s | reconstruct-golden-target-v1 | 819.746 | 0 | 819.746 | 819.746 | 1 |
| total_llm_duration_ms | reconstruct-golden-target-v1 | 818545 | 0 | 818545 | 818545 | 1 |
| total_llm_call_count | reconstruct-golden-target-v1 | 27 | 0 | 27 | 27 | 1 |
| total_prompt_chars | reconstruct-golden-target-v1 | 443956 | 0 | 443956 | 443956 | 1 |
| total_output_chars | reconstruct-golden-target-v1 | 138946 | 0 | 138946 | 138946 | 1 |

## Failed runs

Failure classes: other=1

| fixture | run | failure_class | duration_s | error |
|---|---|---|---|---|
| reconstruct-golden-target-v2 | 1 | other | 692.928 | questions[4].evidence_observation_ids must reference at least one observation id. |

## Quality gate

| fixture | run | status | q1 recall | q2 support | q3 dropped |
|---|---|---|---|---|---|
| reconstruct-golden-target-v1 | 1 | failed | 1 | 0.25 | 0 |

## Top units by mean LLM duration

| unit | mean duration_ms | mean prompt_chars | mean output_chars | mean calls |
|---|---|---|---|---|
| ontology_seed | 197058 | 63387 | 57679 | 1 |
| lens_judgment | 146686 | 52128 | 11016 | 9 |
| competency_questions | 55260 | 34342 | 14393 | 1 |
| final_output | 47779 | 52662 | 8816 | 1 |
| maturation_closure_frontier | 40649 | 10020 | 2779 | 1 |
| claim_realization | 35155 | 17927 | 7308 | 1 |
| competency_question_assessment | 33654 | 33764 | 7302 | 1 |
| maturation_question_frontier | 33456 | 13836 | 5203 | 1 |
| answer_support_ledger | 33150 | 22242 | 24 | 1 |
| source_purpose_candidates | 28672 | 18550 | 6451 | 1 |
| candidate_disposition | 27995 | 18259 | 4210 | 1 |
| revision_proposal | 26233 | 7785 | 2281 | 1 |
| seed_confirmation | 22119 | 14698 | 1888 | 1 |
| failure_classification | 21479 | 21988 | 2358 | 1 |
| candidate_inventory | 17043 | 22014 | 3543 | 1 |
| observation_directive | 16470 | 9327 | 839 | 1 |
| stop_decision | 16068 | 10461 | 1249 | 1 |
| exploration_synthesis | 10553 | 16080 | 1288 | 1 |
| source_frontier | 9066 | 4486 | 319 | 1 |
