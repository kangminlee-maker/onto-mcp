import { describe, expect, it } from "vitest";
import {
  aggregateEffortSweep,
  buildEffortCalibrationReport,
  type EffortSweepRun,
} from "./effort-calibration-sweep.js";

const ORDER = ["low", "medium", "high", "xhigh", "max"];

const run = (
  stage: string,
  effort: string,
  passed: boolean | null,
  qualityScore: number | null,
  cost?: EffortSweepRun["cost"],
): EffortSweepRun => ({
  stage,
  effort,
  gate: { passed, qualityScore },
  ...(cost ? { cost } : {}),
});

describe("aggregateEffortSweep", () => {
  it("groups by stage+effort, sorts stages and efforts, aggregates gate/quality/runs", () => {
    const runs = [
      run("lens", "low", true, 0.8),
      run("lens", "low", false, 0.6),
      run("lens", "high", true, 0.95),
      run("teamlead", "medium", true, 0.9),
    ];
    const stages = aggregateEffortSweep(runs, ORDER);
    expect(stages.map((s) => s.stage)).toEqual(["lens", "teamlead"]); // sorted by id
    const lens = stages[0]!;
    expect(lens.samples.map((s) => s.effort)).toEqual(["low", "high"]); // ascending
    const low = lens.samples[0]!;
    expect(low.runs).toBe(2);
    expect(low.gatePassRate).toBe(0.5); // 1 of 2 passed
    expect(low.quality).toBeCloseTo(0.7); // mean(0.8, 0.6)
    expect(low.qualityStdev).toBeCloseTo(0.1);
  });

  it("counts unjudged (passed===null) runs as non-passing so missing evidence cannot overstate viability", () => {
    const runs = [
      run("author", "low", null, null),
      run("author", "low", true, 0.9),
      run("author", "low", null, null),
    ];
    const author = aggregateEffortSweep(runs, ORDER)[0]!;
    // 1 of 3 runs demonstrably passed → 1/3, NOT 1/1. Under the default
    // passQuorum=1 this effort is correctly not viable (missing scored evidence).
    expect(author.samples[0]!.gatePassRate).toBeCloseTo(1 / 3);
    expect(author.samples[0]!.runs).toBe(3);
  });

  it("drops efforts absent from the canonical order", () => {
    const runs = [run("lens", "low", true, 0.9), run("lens", "bogus", true, 0.99)];
    const lens = aggregateEffortSweep(runs, ORDER)[0]!;
    expect(lens.samples.map((s) => s.effort)).toEqual(["low"]);
  });

  it("averages cost across runs", () => {
    const runs = [
      run("lens", "low", true, 0.9, { providerTokens: 100, durationMs: 1000 }),
      run("lens", "low", true, 0.9, { providerTokens: 300, durationMs: 3000 }),
    ];
    const lens = aggregateEffortSweep(runs, ORDER)[0]!;
    expect(lens.samples[0]!.cost).toEqual({
      providerTokens: 200,
      durationMs: 2000,
    });
  });
});

describe("buildEffortCalibrationReport", () => {
  it("produces a report stamped with the pipeline and per-stage frontiers", () => {
    const runs = [
      run("author", "low", true, 0.6),
      run("author", "medium", true, 0.9),
      run("author", "high", true, 0.91),
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
    expect(report.thresholds.passQuorum).toBe(1); // default resolved into the record
    const author = report.stages[0]!;
    expect(author.stage).toBe("author");
    expect(author.minViableEffort).toBe("low");
    // low→medium gains +0.3 (real), medium→high +0.01 (plateau) → knee at medium.
    expect(author.effectiveMaxEffort).toBe("medium");
  });
});
