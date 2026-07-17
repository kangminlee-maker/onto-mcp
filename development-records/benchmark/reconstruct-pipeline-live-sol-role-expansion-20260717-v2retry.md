# Reconstruct Pipeline Benchmark (live)

> Status: PRELIMINARY — not decision-grade (performance evidence below INV-BENCH-1 thresholds (runs>=3, fixtures>=2); scored quality evidence covers 1 distinct fixture(s); INV-BENCH-1 needs >=2)
> Generated: 2026-07-17T10:19:09.317Z | Commit: 2c40df63c (dirty tree)
> Fixtures: reconstruct-golden-target-v2 | Repetitions: 1 | Requested effort: (settings/none) | Unit timeout: 120000ms
> comparison_conclusion: null (single-case record; lever comparisons arrive with Phase 2)

## Per-fixture metrics (mean ± stdev [min..max], n)

| metric | fixture | mean | stdev | min | max | n |
|---|---|---|---|---|---|---|
| duration_s | reconstruct-golden-target-v2 | 752.523 | 0 | 752.523 | 752.523 | 1 |
| total_llm_duration_ms | reconstruct-golden-target-v2 | 751338 | 0 | 751338 | 751338 | 1 |
| total_llm_call_count | reconstruct-golden-target-v2 | 25 | 0 | 25 | 25 | 1 |
| total_prompt_chars | reconstruct-golden-target-v2 | 383992 | 0 | 383992 | 383992 | 1 |
| total_output_chars | reconstruct-golden-target-v2 | 120886 | 0 | 120886 | 120886 | 1 |

## Quality gate

| fixture | run | status | q1 recall | q2 support | q3 dropped |
|---|---|---|---|---|---|
| reconstruct-golden-target-v2 | 1 | failed | 0.75 | 0.25 | 0 |

## Top units by mean LLM duration

| unit | mean duration_ms | mean prompt_chars | mean output_chars | mean calls |
|---|---|---|---|---|
| ontology_seed | 194325 | 61601 | 51712 | 1 |
| lens_judgment | 183318 | 53271 | 13151 | 9 |
| competency_questions | 60146 | 27742 | 12708 | 1 |
| final_output | 41625 | 47454 | 6168 | 1 |
| source_purpose_candidates | 34784 | 19479 | 6791 | 1 |
| competency_question_assessment | 33979 | 28879 | 7370 | 1 |
| candidate_disposition | 28117 | 17839 | 3668 | 1 |
| claim_realization | 25494 | 14306 | 4839 | 1 |
| revision_proposal | 24592 | 6938 | 2242 | 1 |
| exploration_synthesis | 22852 | 18629 | 2857 | 1 |
| failure_classification | 20654 | 19972 | 2073 | 1 |
| seed_confirmation | 19712 | 10965 | 1607 | 1 |
| candidate_inventory | 18742 | 22996 | 3159 | 1 |
| stop_decision | 14388 | 10147 | 1602 | 1 |
| observation_directive | 10016 | 8040 | 660 | 1 |
| source_frontier | 9457 | 6605 | 255 | 1 |
| answer_support_ledger | 9137 | 9129 | 24 | 1 |
