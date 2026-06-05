# Review Benchmark Records

This folder keeps benchmark records as historical execution evidence.

## Schema Notes

- `schema_version: 1` reports are pre-semantic-gate records. They preserve timing,
  packet/output size, completion, and artifact-shape observations from the run
  that generated them.
- `schema_version: 2` reports are produced by
  `scripts/review-pipeline-benchmark.ts` after the semantic quality gate was
  added. They include `semantic_quality_gate` per run and semantic pass/fail
  counts in `case_summaries`.
- `comparison_mode: same_checkout_profile_comparison` means both cases were run
  from the same checkout. In that mode, `existing-low-effort` is a baseline
  profile/effort case, not proof that an older implementation was executed.
- `schema_version: 2` case metadata uses `profile_role` instead of
  `intended_pipeline`; case ids such as `existing-low-effort` are historical
  labels for the benchmark question, not proof of a separate checkout.

Do not compare semantic quality from v1 JSON fields directly. Use v2 reports or
the paired human-readable semantic audit when semantic quality is part of the
benchmark question.
