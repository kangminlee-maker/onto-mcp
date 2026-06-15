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

/**
 * The canonical realization-scoped effort rule for a benchmark report:
 * `requested_effort` is meaningful only for the live provider path; the mock
 * route never applies effort, so it is null for any non-live realization.
 * Centralized here so every report builder (normal run and record
 * reprojection) enforces the same invariant — a record can never encode an
 * effort the run did not apply.
 */
export function requestedEffortForRealization(
  realization: string,
  effort: string | null | undefined,
): string | null {
  return realization === "live" ? (effort ?? null) : null;
}

/**
 * Realization-scoped record of the opt-in answer-support judge override that
 * was REQUESTED for a benchmark run (symmetric to {@link
 * requestedEffortForRealization}). Live-only — the mock route never applies the
 * override — and null when neither lever was requested, so a record always
 * self-describes whether a judge override was in play (reproducibility). The
 * REALIZED judge model/effort remains recoverable from the answer_support_judgment
 * unit telemetry; this captures the operator's intent.
 */
export function requestedJudgeOverrideForRealization(
  realization: string,
  judgeEffort: string | null | undefined,
  judgeModel: string | null | undefined,
): { effort: string | null; model: string | null } | null {
  if (realization !== "live") return null;
  if (!judgeEffort && !judgeModel) return null;
  return { effort: judgeEffort ?? null, model: judgeModel ?? null };
}

export interface BenchmarkEvidenceInput {
  repetitions: number;
  /** Distinct requested fixture ids. */
  fixtureCount: number;
  scoredQualityRunCount: number;
  /** Distinct fixtures that contributed scored quality results. */
  scoredQualityFixtureCount: number;
  rejectedQualityRunCount: number;
  /** Runs that errored out before producing a record (e.g. unit timeout). */
  failedRunCount: number;
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
  const performanceEvidenceMet = input.repetitions >= 3 &&
    input.fixtureCount >= 2 &&
    input.failedRunCount === 0;
  const decisionGrade = performanceEvidenceMet &&
    input.rejectedQualityRunCount === 0 &&
    input.scoredQualityRunCount > 0 &&
    input.scoredQualityFixtureCount >= 2;
  const statusReason = decisionGrade
    ? "runs>=3 and >=2 distinct fixtures with scored quality evidence, no quality-evidence rejection"
    : [
      ...(input.repetitions >= 3 && input.fixtureCount >= 2
        ? []
        : ["performance evidence below INV-BENCH-1 thresholds (runs>=3, fixtures>=2)"]),
      ...(input.failedRunCount > 0
        ? [`${input.failedRunCount} run(s) failed before producing a record`]
        : []),
      ...(input.rejectedQualityRunCount > 0
        ? [
          `quality evidence rejected on ${input.rejectedQualityRunCount} run(s) (missing telemetry source fields)`,
        ]
        : []),
      ...(input.scoredQualityRunCount === 0
        ? ["no scored quality evidence (every quality gate was not_applicable)"]
        : []),
      ...(input.scoredQualityRunCount > 0 && input.scoredQualityFixtureCount < 2
        ? [
          `scored quality evidence covers ${input.scoredQualityFixtureCount} distinct fixture(s); INV-BENCH-1 needs >=2`,
        ]
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
