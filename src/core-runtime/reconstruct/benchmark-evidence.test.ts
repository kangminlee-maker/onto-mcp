import { describe, expect, it } from "vitest";
import {
  BENCHMARK_DECISION_GRADE_STATUS,
  BENCHMARK_PRELIMINARY_STATUS,
  gradeBenchmarkEvidence,
} from "./benchmark-evidence.js";

describe("reconstruct benchmark evidence grading", () => {
  it("grades decision-grade only with full performance and scored quality evidence", () => {
    const grade = gradeBenchmarkEvidence({
      repetitions: 3,
      fixtureCount: 2,
      scoredQualityRunCount: 3,
      rejectedQualityRunCount: 0,
    });
    expect(grade.status).toBe(BENCHMARK_DECISION_GRADE_STATUS);
    expect(grade.performanceEvidenceMet).toBe(true);
  });

  it("stays PRELIMINARY below INV-BENCH-1 thresholds", () => {
    expect(
      gradeBenchmarkEvidence({
        repetitions: 2,
        fixtureCount: 2,
        scoredQualityRunCount: 2,
        rejectedQualityRunCount: 0,
      }).status,
    ).toBe(BENCHMARK_PRELIMINARY_STATUS);
    expect(
      gradeBenchmarkEvidence({
        repetitions: 3,
        fixtureCount: 1,
        scoredQualityRunCount: 3,
        rejectedQualityRunCount: 0,
      }).statusReason,
    ).toMatch(/below INV-BENCH-1 thresholds/);
  });

  it("downgrades to PRELIMINARY when every quality run is not_applicable", () => {
    const grade = gradeBenchmarkEvidence({
      repetitions: 3,
      fixtureCount: 2,
      scoredQualityRunCount: 0,
      rejectedQualityRunCount: 0,
    });
    expect(grade.status).toBe(BENCHMARK_PRELIMINARY_STATUS);
    expect(grade.statusReason).toMatch(/no scored quality evidence/);
    expect(grade.performanceEvidenceMet).toBe(true);
  });

  it("downgrades to PRELIMINARY when any quality run is rejected", () => {
    const grade = gradeBenchmarkEvidence({
      repetitions: 3,
      fixtureCount: 2,
      scoredQualityRunCount: 2,
      rejectedQualityRunCount: 1,
    });
    expect(grade.status).toBe(BENCHMARK_PRELIMINARY_STATUS);
    expect(grade.statusReason).toMatch(/quality evidence rejected on 1 run/);
  });
});
