# Reconstruct Pipeline Benchmark (mock)

> Status: PRELIMINARY — not decision-grade (performance evidence below INV-BENCH-1 thresholds (runs>=3, fixtures>=2); scored quality evidence covers 1 distinct fixture(s); INV-BENCH-1 needs >=2)
> Generated: 2026-06-15T11:09:24.365Z | Commit: c45304d28 (clean tree)
> Fixtures: reconstruct-golden-target-v1, reconstruct-golden-target-v2 | Repetitions: 1 | Requested effort: (settings/none) | Unit timeout: 120000ms
> comparison_conclusion: null (single-case record; lever comparisons arrive with Phase 2)

## Per-fixture metrics (mean ± stdev [min..max], n)

| metric | fixture | mean | stdev | min | max | n |
|---|---|---|---|---|---|---|
| duration_s | reconstruct-golden-target-v1 | 0.878 | 0 | 0.878 | 0.878 | 1 |
| duration_s | reconstruct-golden-target-v2 | 0.739 | 0 | 0.739 | 0.739 | 1 |
| total_llm_duration_ms | reconstruct-golden-target-v1 | 0 | 0 | 0 | 0 | 1 |
| total_llm_duration_ms | reconstruct-golden-target-v2 | 1 | 0 | 1 | 1 | 1 |
| total_llm_call_count | reconstruct-golden-target-v1 | 25 | 0 | 25 | 25 | 1 |
| total_llm_call_count | reconstruct-golden-target-v2 | 25 | 0 | 25 | 25 | 1 |
| total_prompt_chars | reconstruct-golden-target-v1 | 276587 | 0 | 276587 | 276587 | 1 |
| total_prompt_chars | reconstruct-golden-target-v2 | 274137 | 0 | 274137 | 274137 | 1 |
| total_output_chars | reconstruct-golden-target-v1 | 60579 | 0 | 60579 | 60579 | 1 |
| total_output_chars | reconstruct-golden-target-v2 | 60592 | 0 | 60592 | 60592 | 1 |

## Quality gate

| fixture | run | status | q1 recall | q2 support | q3 dropped |
|---|---|---|---|---|---|
| reconstruct-golden-target-v1 | 1 | passed | 1 | 1 | 0 |
| reconstruct-golden-target-v2 | 1 | not_applicable | - | - | - |

## Top units by mean LLM duration

| unit | mean duration_ms | mean prompt_chars | mean output_chars | mean calls |
|---|---|---|---|---|
| candidate_inventory | 0.5 | 16071 | 945 | 1 |
| observation_directive | 0 | 8693.5 | 178 | 1 |
| lens_judgment | 0 | 50076 | 2556 | 9 |
| exploration_synthesis | 0 | 5482.5 | 131 | 1 |
| source_frontier | 0 | 3108.5 | 98 | 1 |
| source_purpose_candidates | 0 | 15981 | 2925 | 1 |
| candidate_disposition | 0 | 11368 | 990 | 1 |
| ontology_seed | 0 | 41522.5 | 19063.5 | 1 |
| claim_realization | 0 | 8140.5 | 1654 | 1 |
| seed_confirmation | 0 | 5027 | 480 | 1 |
| competency_questions | 0 | 19556.5 | 30040 | 1 |
| competency_question_assessment | 0 | 29412 | 1229 | 1 |
| failure_classification | 0 | 15248 | 15 | 1 |
| revision_proposal | 0 | 2634 | 16 | 1 |
| stop_decision | 0 | 4842.5 | 119 | 1 |
| answer_support_ledger | 0 | 8315 | 24 | 1 |
| final_output | 0 | 29883.5 | 122 | 1 |
