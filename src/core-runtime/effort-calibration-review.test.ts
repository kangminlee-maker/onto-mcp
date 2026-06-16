import { describe, expect, it } from "vitest";
import {
  aggregateReviewSweep,
  buildReviewCalibrationReport,
  reviewRunGateSignal,
  type ReviewSweepRun,
} from "./effort-calibration-review.js";
import type { SemanticQualityGateResult } from "./review/semantic-quality-gate.js";

const ORDER = ["low", "medium", "high", "xhigh", "max"];

const gate = (
  status: SemanticQualityGateResult["status"],
  checks: Array<"passed" | "failed">,
): SemanticQualityGateResult => ({
  status,
  fixture_id: "review-pipeline-target-v1",
  scope: "fixture_specific",
  fixture_target_anchor: "anchor",
  applicability: "real_model_only",
  checks: checks.map((s) => ({
    check_id: "grounding" as const,
    status: s,
    evidence: [],
  })),
});

const run = (
  stage: string,
  effort: string,
  passed: boolean | null,
  qualityScore: number | null,
  cost?: ReviewSweepRun["cost"],
): ReviewSweepRun => ({
  stage,
  effort,
  gate: { passed, qualityScore },
  ...(cost ? { cost } : {}),
});

describe("reviewRunGateSignal", () => {
  it("maps gate status and the check-pass fraction", () => {
    expect(
      reviewRunGateSignal(gate("passed", ["passed", "passed", "passed", "passed"])),
    ).toEqual({ passed: true, qualityScore: 1 });
    expect(
      reviewRunGateSignal(gate("failed", ["passed", "failed", "passed", "failed"])),
    ).toEqual({ passed: false, qualityScore: 0.5 });
    expect(reviewRunGateSignal(gate("not_applicable", []))).toEqual({
      passed: null,
      qualityScore: null,
    });
    // passed status with no checks → quality indeterminate.
    expect(reviewRunGateSignal(gate("passed", []))).toEqual({
      passed: true,
      qualityScore: null,
    });
  });
});

describe("aggregateReviewSweep", () => {
  it("groups by stage+effort, sorts stages and efforts, aggregates gate/quality/runs", () => {
    const runs = [
      run("lens", "low", true, 0.8),
      run("lens", "low", false, 0.6),
      run("lens", "high", true, 0.95),
      run("teamlead", "medium", true, 0.9),
    ];
    const stages = aggregateReviewSweep(runs, ORDER);
    expect(stages.map((s) => s.stage)).toEqual(["lens", "teamlead"]); // sorted by id
    const lens = stages[0]!;
    expect(lens.samples.map((s) => s.effort)).toEqual(["low", "high"]); // ascending
    const low = lens.samples[0]!;
    expect(low.runs).toBe(2);
    expect(low.gatePassRate).toBe(0.5); // 1 of 2 passed
    expect(low.quality).toBeCloseTo(0.7); // mean(0.8, 0.6)
    expect(low.qualityStdev).toBeCloseTo(0.1);
  });

  it("counts not_applicable runs as non-passing so missing evidence cannot overstate viability", () => {
    const runs = [
      run("lens", "low", null, null),
      run("lens", "low", true, 0.9),
      run("lens", "low", null, null),
    ];
    const lens = aggregateReviewSweep(runs, ORDER)[0]!;
    // 1 of 3 runs demonstrably passed → 1/3, NOT 1/1. Under the default
    // passQuorum=1 this effort is correctly not viable (missing scored evidence).
    expect(lens.samples[0]!.gatePassRate).toBeCloseTo(1 / 3);
    expect(lens.samples[0]!.runs).toBe(3);
  });

  it("drops efforts absent from the canonical order", () => {
    const runs = [run("lens", "low", true, 0.9), run("lens", "bogus", true, 0.99)];
    const lens = aggregateReviewSweep(runs, ORDER)[0]!;
    expect(lens.samples.map((s) => s.effort)).toEqual(["low"]);
  });

  it("averages cost across runs", () => {
    const runs = [
      run("lens", "low", true, 0.9, { providerTokens: 100, durationMs: 1000 }),
      run("lens", "low", true, 0.9, { providerTokens: 300, durationMs: 3000 }),
    ];
    const lens = aggregateReviewSweep(runs, ORDER)[0]!;
    expect(lens.samples[0]!.cost).toEqual({
      providerTokens: 200,
      durationMs: 2000,
    });
  });
});

describe("buildReviewCalibrationReport", () => {
  it("produces a review report with per-stage frontiers", () => {
    const runs = [
      run("lens", "low", true, 0.6),
      run("lens", "medium", true, 0.9),
      run("lens", "high", true, 0.91),
    ];
    const report = buildReviewCalibrationReport({
      provider: "anthropic",
      model: "claude-opus-4-8",
      route: "anthropic/claude-cli",
      effortOrder: ORDER,
      thresholds: { plateauThreshold: 0.05 },
      runs,
    });
    expect(report.pipeline).toBe("review");
    expect(report.thresholds.passQuorum).toBe(1);
    const lens = report.stages[0]!;
    expect(lens.stage).toBe("lens");
    expect(lens.minViableEffort).toBe("low");
    // low→medium gains +0.3 (real), medium→high +0.01 (plateau) → knee at medium.
    expect(lens.effectiveMaxEffort).toBe("medium");
  });
});
