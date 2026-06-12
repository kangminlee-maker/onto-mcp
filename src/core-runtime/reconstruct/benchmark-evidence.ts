/**
 * Evidence grading for reconstruct pipeline benchmark records (design §5 M4).
 *
 * Single source for the structural evidence gates the harness must enforce
 * (INV-BENCH-1): performance evidence needs repetitions >= 3 and fixtures >= 2;
 * quality evidence is trusted only when at least one run was scored and no
 * run was rejected for missing measurement provenance. The harness consumes
 * this predicate; tests pin its semantics.
 */
export const BENCHMARK_PRELIMINARY_STATUS = "PRELIMINARY — not decision-grade";
export const BENCHMARK_DECISION_GRADE_STATUS = "decision-grade";

export interface BenchmarkEvidenceInput {
  repetitions: number;
  fixtureCount: number;
  scoredQualityRunCount: number;
  rejectedQualityRunCount: number;
}

export interface BenchmarkEvidenceGrade {
  status:
    | typeof BENCHMARK_DECISION_GRADE_STATUS
    | typeof BENCHMARK_PRELIMINARY_STATUS;
  performanceEvidenceMet: boolean;
  statusReason: string;
}

export function gradeBenchmarkEvidence(
  input: BenchmarkEvidenceInput,
): BenchmarkEvidenceGrade {
  const performanceEvidenceMet = input.repetitions >= 3 && input.fixtureCount >= 2;
  const decisionGrade = performanceEvidenceMet &&
    input.rejectedQualityRunCount === 0 &&
    input.scoredQualityRunCount > 0;
  const statusReason = decisionGrade
    ? "runs>=3 and fixtures>=2, scored quality evidence present, no quality-evidence rejection"
    : [
      ...(performanceEvidenceMet
        ? []
        : ["performance evidence below INV-BENCH-1 thresholds (runs>=3, fixtures>=2)"]),
      ...(input.rejectedQualityRunCount > 0
        ? [
          `quality evidence rejected on ${input.rejectedQualityRunCount} run(s) (missing telemetry source fields)`,
        ]
        : []),
      ...(input.scoredQualityRunCount === 0
        ? ["no scored quality evidence (every quality gate was not_applicable)"]
        : []),
    ].join("; ");
  return {
    status: decisionGrade
      ? BENCHMARK_DECISION_GRADE_STATUS
      : BENCHMARK_PRELIMINARY_STATUS,
    performanceEvidenceMet,
    statusReason,
  };
}
