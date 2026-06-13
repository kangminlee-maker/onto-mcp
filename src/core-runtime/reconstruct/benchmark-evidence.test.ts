import { describe, expect, it } from "vitest";
import {
  BENCHMARK_DECISION_GRADE_STATUS,
  BENCHMARK_PRELIMINARY_STATUS,
  gradeBenchmarkEvidence,
  requestedEffortForRealization,
} from "./benchmark-evidence.js";

describe("requested effort realization scoping", () => {
  it("keeps requested effort only for live realization", () => {
    expect(requestedEffortForRealization("live", "medium")).toBe("medium");
    expect(requestedEffortForRealization("live", undefined)).toBeNull();
    expect(requestedEffortForRealization("live", null)).toBeNull();
  });

  it("drops effort for non-live realizations (mock cannot apply it)", () => {
    // Guards the reproject path: a legacy mock record carrying effort must
    // normalize to null, not leak into requested_effort.
    expect(requestedEffortForRealization("mock", "medium")).toBeNull();
    expect(requestedEffortForRealization("mock", undefined)).toBeNull();
    expect(requestedEffortForRealization("evolve", "high")).toBeNull();
  });
});

describe("reconstruct benchmark evidence grading", () => {
  it("grades decision-grade only with full performance and scored quality evidence", () => {
    const grade = gradeBenchmarkEvidence({
      repetitions: 3,
      fixtureCount: 2,
      scoredQualityRunCount: 6,
      scoredQualityFixtureCount: 2,
      rejectedQualityRunCount: 0,
      failedRunCount: 0,
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
        scoredQualityFixtureCount: 2,
        rejectedQualityRunCount: 0,
        failedRunCount: 0,
      }).status,
    ).toBe(BENCHMARK_PRELIMINARY_STATUS);
    expect(
      gradeBenchmarkEvidence({
        repetitions: 3,
        fixtureCount: 1,
        scoredQualityRunCount: 3,
        scoredQualityFixtureCount: 1,
        rejectedQualityRunCount: 0,
        failedRunCount: 0,
      }).statusReason,
    ).toMatch(/below INV-BENCH-1 thresholds/);
  });

  it("downgrades to PRELIMINARY when every quality run is not_applicable", () => {
    const grade = gradeBenchmarkEvidence({
      repetitions: 3,
      fixtureCount: 2,
      scoredQualityRunCount: 0,
      scoredQualityFixtureCount: 0,
      rejectedQualityRunCount: 0,
      failedRunCount: 0,
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
      scoredQualityFixtureCount: 2,
      rejectedQualityRunCount: 1,
      failedRunCount: 0,
    });
    expect(grade.status).toBe(BENCHMARK_PRELIMINARY_STATUS);
    expect(grade.statusReason).toMatch(/quality evidence rejected on 1 run/);
  });

  it("stays PRELIMINARY when scored quality evidence covers fewer than two distinct fixtures", () => {
    const grade = gradeBenchmarkEvidence({
      repetitions: 3,
      fixtureCount: 2,
      scoredQualityRunCount: 3,
      scoredQualityFixtureCount: 1,
      rejectedQualityRunCount: 0,
      failedRunCount: 0,
    });
    expect(grade.status).toBe(BENCHMARK_PRELIMINARY_STATUS);
    expect(grade.statusReason)
      .toMatch(/covers 1 distinct fixture\(s\); INV-BENCH-1 needs >=2/);
  });

  it("downgrades to PRELIMINARY when any run failed before producing a record", () => {
    const grade = gradeBenchmarkEvidence({
      repetitions: 3,
      fixtureCount: 2,
      scoredQualityRunCount: 5,
      scoredQualityFixtureCount: 2,
      rejectedQualityRunCount: 0,
      failedRunCount: 1,
    });
    expect(grade.status).toBe(BENCHMARK_PRELIMINARY_STATUS);
    expect(grade.performanceEvidenceMet).toBe(false);
    expect(grade.statusReason).toMatch(/1 run\(s\) failed before producing a record/);
  });
});
