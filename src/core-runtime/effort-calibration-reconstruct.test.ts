import { describe, expect, it } from "vitest";
import { reconstructRunGateSignal } from "./effort-calibration-reconstruct.js";
import { buildEffortCalibrationReport } from "./effort-calibration-sweep.js";
import type { ReconstructQualityGateResult } from "./reconstruct/semantic-quality-gate.js";

const gate = (
  status: ReconstructQualityGateResult["status"],
  metrics?: { recall: number; supportRate: number; authored: number; dropped: number },
): ReconstructQualityGateResult => ({
  status,
  fixture_id: "reconstruct-golden-target-v1",
  scope: "fixture_specific",
  realization: "live",
  source_field_rejections: [],
  q1: metrics
    ? {
        expected_count: 4,
        matched_count: Math.round(metrics.recall * 4),
        recall: metrics.recall,
        missing_concept_keys: [],
        matches: [],
      }
    : null,
  q2: metrics
    ? {
        population: 4,
        supported_count: Math.round(metrics.supportRate * 4),
        support_rate: metrics.supportRate,
        rows: [],
      }
    : null,
  q3: metrics
    ? {
        authored_question_count: metrics.authored,
        assessed_question_count: metrics.authored - metrics.dropped,
        dropped_question_count: metrics.dropped,
        dropped_question_ids: [],
        batch_count: null,
      }
    : null,
});

describe("reconstructRunGateSignal", () => {
  it("passes with a full-credit synthesized quality score", () => {
    expect(
      reconstructRunGateSignal(
        gate("passed", { recall: 1, supportRate: 1, authored: 4, dropped: 0 }),
      ),
    ).toEqual({ passed: true, qualityScore: 1 });
  });

  it("synthesizes quality from Q1 recall, Q2 support rate, and Q3 dropped-question health", () => {
    const sig = reconstructRunGateSignal(
      gate("failed", { recall: 0.5, supportRate: 0.75, authored: 4, dropped: 1 }),
    );
    expect(sig.passed).toBe(false);
    // recall 0.5, support 0.75, q3 health (4-1)/4=0.75 → mean.
    expect(sig.qualityScore).toBeCloseTo((0.5 + 0.75 + 0.75) / 3);
  });

  it("treats rejected and not_applicable as unjudged (no verdict, no quality)", () => {
    expect(reconstructRunGateSignal(gate("rejected"))).toEqual({
      passed: null,
      qualityScore: null,
    });
    expect(reconstructRunGateSignal(gate("not_applicable"))).toEqual({
      passed: null,
      qualityScore: null,
    });
  });

  it("treats a run with no authored questions as vacuously Q3-healthy", () => {
    expect(
      reconstructRunGateSignal(
        gate("passed", { recall: 1, supportRate: 1, authored: 0, dropped: 0 }),
      ),
    ).toEqual({ passed: true, qualityScore: 1 });
  });
});

describe("reconstruct calibration end-to-end", () => {
  it("feeds distilled signals into a per-stage {author, judge} report", () => {
    const ORDER = ["low", "medium", "high"];
    const sweep = (
      stage: string,
      effort: string,
      status: ReconstructQualityGateResult["status"],
      metrics?: Parameters<typeof gate>[1],
    ) => ({ stage, effort, gate: reconstructRunGateSignal(gate(status, metrics)) });
    const runs = [
      sweep("author", "low", "failed", {
        recall: 0.5,
        supportRate: 0.5,
        authored: 4,
        dropped: 0,
      }),
      sweep("author", "medium", "passed", {
        recall: 1,
        supportRate: 1,
        authored: 4,
        dropped: 0,
      }),
      sweep("judge", "low", "passed", {
        recall: 1,
        supportRate: 1,
        authored: 4,
        dropped: 0,
      }),
    ];
    const report = buildEffortCalibrationReport({
      pipeline: "reconstruct",
      provider: "anthropic",
      model: "claude-opus-4-8",
      route: "anthropic/claude-cli",
      effortOrder: ORDER,
      thresholds: { plateauThreshold: 0.05 },
      runs,
    });
    expect(report.pipeline).toBe("reconstruct");
    expect(report.stages.map((s) => s.stage)).toEqual(["author", "judge"]);
    const author = report.stages.find((s) => s.stage === "author")!;
    // author "low" failed the gate; first viable effort is "medium".
    expect(author.minViableEffort).toBe("medium");
  });
});
