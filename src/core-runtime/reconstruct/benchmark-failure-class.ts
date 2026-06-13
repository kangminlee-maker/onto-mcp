/**
 * Deterministic failure classification for reconstruct benchmark runs that
 * errored out before producing a record (optimization design §5 M4).
 *
 * The benchmark harness only receives an Error message from the run; this
 * module is the single, harness-owned rule that maps that message to a
 * structured failure class so report aggregates and audit claims are derived
 * from a typed field, not from re-parsing raw strings at read time. The raw
 * message is preserved alongside the class as evidence.
 */
export type BenchmarkRunFailureClass =
  | "timeout"
  | "final_output_provenance"
  | "ontology_seed_validation"
  | "competency_questions_validation"
  | "validation_other"
  | "other";

/** Classifies a benchmark run failure from its error message (most specific first). */
export function classifyBenchmarkRunFailure(
  errorMessage: string,
): BenchmarkRunFailureClass {
  if (/timed out|timeout/i.test(errorMessage)) return "timeout";
  if (/final-output\.md failed provenance validation/i.test(errorMessage)) {
    return "final_output_provenance";
  }
  if (/ontology-seed validation failed/i.test(errorMessage)) {
    return "ontology_seed_validation";
  }
  if (/competency-questions validation failed/i.test(errorMessage)) {
    return "competency_questions_validation";
  }
  if (/validation failed/i.test(errorMessage)) return "validation_other";
  return "other";
}

/** Aggregates failure classes into per-class counts for the benchmark report. */
export function benchmarkFailureClassCounts(
  failures: ReadonlyArray<{ failure_class: BenchmarkRunFailureClass }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const failure of failures) {
    counts[failure.failure_class] = (counts[failure.failure_class] ?? 0) + 1;
  }
  return counts;
}
