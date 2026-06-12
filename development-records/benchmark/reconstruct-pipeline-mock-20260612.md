# Reconstruct Pipeline Benchmark (mock)

> Status: decision-grade (runs>=3 and fixtures>=2 and no quality-evidence rejection)
> Generated: 2026-06-12T11:44:43.691Z | Commit: 8c6671d17
> Fixtures: reconstruct-golden-target-v1, reconstruct-golden-target-v2 | Repetitions: 3
> comparison_conclusion: null (single-case record; lever comparisons arrive with Phase 2)

## Per-fixture metrics (mean ± stdev [min..max], n)

| metric | fixture | mean | stdev | min | max | n |
|---|---|---|---|---|---|---|
| duration_s | reconstruct-golden-target-v1 | 0.786 | 0.063 | 0.736 | 0.857 | 3 |
| duration_s | reconstruct-golden-target-v2 | 0.749 | 0.007 | 0.741 | 0.755 | 3 |
| total_llm_duration_ms | reconstruct-golden-target-v1 | 1.667 | 1.155 | 1 | 3 | 3 |
| total_llm_duration_ms | reconstruct-golden-target-v2 | 1.667 | 0.577 | 1 | 2 | 3 |
| total_llm_call_count | reconstruct-golden-target-v1 | 25 | 0 | 25 | 25 | 3 |
| total_llm_call_count | reconstruct-golden-target-v2 | 25 | 0 | 25 | 25 | 3 |
| total_prompt_chars | reconstruct-golden-target-v1 | 276321 | 0 | 276321 | 276321 | 3 |
| total_prompt_chars | reconstruct-golden-target-v2 | 273871 | 0 | 273871 | 273871 | 3 |
| total_output_chars | reconstruct-golden-target-v1 | 60579 | 0 | 60579 | 60579 | 3 |
| total_output_chars | reconstruct-golden-target-v2 | 60592 | 0 | 60592 | 60592 | 3 |

## Quality gate

| fixture | run | status | q1 recall | q2 support | q3 dropped |
|---|---|---|---|---|---|
| reconstruct-golden-target-v1 | 1 | passed | 1 | 1 | 0 |
| reconstruct-golden-target-v1 | 2 | passed | 1 | 1 | 0 |
| reconstruct-golden-target-v1 | 3 | passed | 1 | 1 | 0 |
| reconstruct-golden-target-v2 | 1 | not_applicable | - | - | - |
| reconstruct-golden-target-v2 | 2 | not_applicable | - | - | - |
| reconstruct-golden-target-v2 | 3 | not_applicable | - | - | - |

## Top units by mean LLM duration

| unit | mean duration_ms | mean prompt_chars | mean output_chars | mean calls |
|---|---|---|---|---|
| exploration_synthesis | 0.3 | 5482.5 | 131 | 1 |
| candidate_inventory | 0.3 | 16070 | 945 | 1 |
| competency_questions | 0.3 | 19529.5 | 30040 | 1 |
| source_purpose_candidates | 0.2 | 15980 | 2925 | 1 |
| ontology_seed | 0.2 | 41522.5 | 19063.5 | 1 |
| claim_realization | 0.2 | 8139.5 | 1654 | 1 |
| competency_question_assessment | 0.2 | 29412 | 1229 | 1 |
| observation_directive | 0 | 8691.5 | 178 | 1 |
| lens_judgment | 0 | 50076 | 2556 | 9 |
| source_frontier | 0 | 3108.5 | 98 | 1 |
| candidate_disposition | 0 | 11368 | 990 | 1 |
| seed_confirmation | 0 | 5027 | 480 | 1 |
| failure_classification | 0 | 15248 | 15 | 1 |
| revision_proposal | 0 | 2634 | 16 | 1 |
| stop_decision | 0 | 4842.5 | 119 | 1 |
| answer_support_ledger | 0 | 8315 | 24 | 1 |
| final_output | 0 | 29649.5 | 122 | 1 |
