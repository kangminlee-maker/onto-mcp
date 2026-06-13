# Reconstruct Pipeline Benchmark (live)

> Status: PRELIMINARY — not decision-grade (5 run(s) failed before producing a record; scored quality evidence covers 1 distinct fixture(s); INV-BENCH-1 needs >=2)
> Generated: 2026-06-13T08:54:07.843Z | Commit: cad2e07a1 (clean tree)
> Re-derived (no re-execution) from a record originally generated 2026-06-13T06:23:22.303Z; commit/tree above are the original data provenance.
> Fixtures: reconstruct-golden-target-v1, reconstruct-golden-target-v2 | Repetitions: 3 | Requested effort: medium | Unit timeout: 420000ms
> comparison_conclusion: null (single-case record; lever comparisons arrive with Phase 2)

## Per-fixture metrics (mean ± stdev [min..max], n)

| metric | fixture | mean | stdev | min | max | n |
|---|---|---|---|---|---|---|
| duration_s | reconstruct-golden-target-v2 | 1198.535 | 0 | 1198.535 | 1198.535 | 1 |
| total_llm_duration_ms | reconstruct-golden-target-v2 | 1197390 | 0 | 1197390 | 1197390 | 1 |
| total_llm_call_count | reconstruct-golden-target-v2 | 26 | 0 | 26 | 26 | 1 |
| total_prompt_chars | reconstruct-golden-target-v2 | 438542 | 0 | 438542 | 438542 | 1 |
| total_output_chars | reconstruct-golden-target-v2 | 146378 | 0 | 146378 | 146378 | 1 |

## Failed runs

Failure classes: final_output_provenance=3, ontology_seed_validation=1, competency_questions_validation=1

| fixture | run | failure_class | duration_s | error |
|---|---|---|---|---|
| reconstruct-golden-target-v1 | 1 | final_output_provenance | 585.7 | final-output.md failed provenance validation: final output is missing provenance-bound section: Artifact Truth; final ou |
| reconstruct-golden-target-v1 | 2 | ontology_seed_validation | 689.759 | ontology-seed validation failed at /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/reconstruct-benchmark-reconstruct-go |
| reconstruct-golden-target-v1 | 3 | final_output_provenance | 637.978 | final-output.md failed provenance validation: final output is missing provenance-bound section: Artifact Truth; final ou |
| reconstruct-golden-target-v2 | 1 | competency_questions_validation | 895.517 | competency-questions validation failed at /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/reconstruct-benchmark-reconst |
| reconstruct-golden-target-v2 | 2 | final_output_provenance | 1126.436 | final-output.md failed provenance validation: final output is missing provenance-bound section: Artifact Truth; final ou |

## Quality gate

| fixture | run | status | q1 recall | q2 support | q3 dropped |
|---|---|---|---|---|---|
| reconstruct-golden-target-v2 | 3 | failed | 1 | 0.75 | 0 |

## Top units by mean LLM duration

| unit | mean duration_ms | mean prompt_chars | mean output_chars | mean calls |
|---|---|---|---|---|
| lens_judgment | 347124 | 53406 | 15830 | 9 |
| candidate_disposition | 346715 | 20093 | 7302 | 1 |
| ontology_seed | 216377 | 68795 | 61471 | 1 |
| competency_questions | 48083 | 40514 | 14734 | 1 |
| source_purpose_candidates | 35310 | 19287 | 9599 | 1 |
| claim_realization | 34781 | 21255 | 9813 | 1 |
| candidate_inventory | 28022 | 20755 | 6737 | 1 |
| final_output | 20371 | 49557 | 4632 | 1 |
| failure_classification | 19877 | 19562 | 1032 | 1 |
| competency_question_assessment | 18304 | 38692 | 4859 | 1 |
| seed_confirmation | 18100 | 18585 | 2522 | 1 |
| exploration_synthesis | 15265 | 21040 | 3123 | 1 |
| revision_proposal | 11132 | 3832 | 1193 | 1 |
| stop_decision | 10247 | 7368 | 884 | 1 |
| observation_directive | 8090 | 8048 | 981 | 1 |
| purpose_confirmation | 7711 | 12723 | 1198 | 1 |
| answer_support_ledger | 5962 | 8326 | 24 | 1 |
| source_frontier | 5919 | 6704 | 444 | 1 |
