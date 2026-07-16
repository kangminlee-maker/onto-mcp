import { describe, expect, it } from "vitest";
import {
  buildEffortZoneCalibrationReport,
  gradedRunGateSignal,
  M3_BENCH_RUN_SCHEMA_VERSION,
  parseM3BenchRun,
  type M3BenchRun,
} from "./effort-calibration-graded.js";

const GATE = { recallCut: 1.0, precisionFloor: 0.8 };
const FRONTIER = { plateauThreshold: 0.05 };
const ORDER = ["medium", "high"];

const run = (
  zone: string,
  effort: string,
  fixture: string,
  rep: number,
  recall: number,
  precision = 0.9,
): M3BenchRun => ({
  schema_version: M3_BENCH_RUN_SCHEMA_VERSION,
  zone,
  effort,
  fixture,
  rep,
  metrics: { recall_material: recall, precision },
});

/** reps 1..3 of a cell at a fixed metric point (decision-grade-satisfying). */
const cell = (
  zone: string,
  effort: string,
  fixture: string,
  recall: number,
  precision = 0.9,
): M3BenchRun[] =>
  [1, 2, 3].map((rep) => run(zone, effort, fixture, rep, recall, precision));

describe("gradedRunGateSignal — viable gate is falsifiable (design §4-10)", () => {
  it("fails when material recall misses the cut", () => {
    const s = gradedRunGateSignal({ recall_material: 0.9, precision: 1.0 }, GATE);
    expect(s.passed).toBe(false);
  });

  it("fails when precision misses the floor even at full recall", () => {
    const s = gradedRunGateSignal({ recall_material: 1.0, precision: 0.7 }, GATE);
    expect(s.passed).toBe(false);
  });

  it("passes at the thresholds and reports recall as the quality scalar", () => {
    const s = gradedRunGateSignal({ recall_material: 1.0, precision: 0.8 }, GATE);
    expect(s.passed).toBe(true);
    expect(s.qualityScore).toBe(1.0);
  });

  it("rejects out-of-range metrics and thresholds", () => {
    expect(() =>
      gradedRunGateSignal({ recall_material: 1.2, precision: 0.9 }, GATE),
    ).toThrow(/recall_material/);
    expect(() =>
      gradedRunGateSignal({ recall_material: 0.9, precision: Number.NaN }, GATE),
    ).toThrow(/precision/);
    expect(() =>
      gradedRunGateSignal(
        { recall_material: 0.9, precision: 0.9 },
        { recallCut: -0.1, precisionFloor: 0.8 },
      ),
    ).toThrow(/recallCut/);
  });
});

describe("parseM3BenchRun — versioned ingest contract (R2-8), fail-loud", () => {
  const valid = {
    schema_version: M3_BENCH_RUN_SCHEMA_VERSION,
    zone: "partial",
    effort: "medium",
    fixture: "clinical-lab-workflow",
    rep: 1,
    metrics: { recall_material: 0.8, precision: 0.9 },
    judge_runs: 8,
  };

  it("round-trips a valid row", () => {
    const parsed = parseM3BenchRun(valid);
    expect(parsed.zone).toBe("partial");
    expect(parsed.judge_runs).toBe(8);
  });

  it("rejects a wrong or missing schema_version", () => {
    expect(() =>
      parseM3BenchRun({ ...valid, schema_version: "m3-bench-run/0" }),
    ).toThrow(/unsupported schema_version/);
    const { schema_version: _v, ...missing } = valid;
    expect(() => parseM3BenchRun(missing)).toThrow(/unsupported schema_version/);
  });

  it("rejects structural violations", () => {
    expect(() => parseM3BenchRun({ ...valid, zone: "" })).toThrow(/zone/);
    expect(() => parseM3BenchRun({ ...valid, rep: 0 })).toThrow(/rep/);
    expect(() => parseM3BenchRun({ ...valid, judge_runs: 0 })).toThrow(/judge_runs/);
    expect(() =>
      parseM3BenchRun({ ...valid, metrics: { recall_material: 2, precision: 0.9 } }),
    ).toThrow(/recall_material/);
    expect(() => parseM3BenchRun("not an object")).toThrow(/must be an object/);
  });
});

describe("buildEffortZoneCalibrationReport — per-(model, zone), whole-pipeline", () => {
  it("minViableEffort rises in the zone where the cheaper effort misses the bar", () => {
    const runs = [
      // full coverage: medium already clears the gate
      ...cell("full", "medium", "fx-a", 1.0),
      ...cell("full", "medium", "fx-b", 1.0),
      ...cell("full", "high", "fx-a", 1.0),
      ...cell("full", "high", "fx-b", 1.0),
      // partial coverage: medium misses recall, high clears it
      ...cell("partial", "medium", "fx-a", 0.7),
      ...cell("partial", "medium", "fx-b", 0.7),
      ...cell("partial", "high", "fx-a", 1.0),
      ...cell("partial", "high", "fx-b", 1.0),
    ];
    const report = buildEffortZoneCalibrationReport({
      provider: "openai",
      model: "gpt-5.6-sol",
      gateThresholds: GATE,
      frontierThresholds: FRONTIER,
      effortOrder: ORDER,
      runs,
    });
    expect(report.decision_grade).toBe(true);
    expect(report.preliminary_reasons).toEqual([]);
    const byZone = new Map(report.zones.map((z) => [z.zone, z]));
    expect(byZone.get("full")!.minViableEffort).toBe("medium");
    expect(byZone.get("partial")!.minViableEffort).toBe("high");
    expect(report.granularity).toBe("whole-pipeline");
    // zone projection carries no stage vocabulary
    expect("stage" in byZone.get("full")!).toBe(false);
    expect(byZone.get("full")!.fixtures).toEqual(["fx-a", "fx-b"]);
  });

  it("R<3 in any cell downgrades the report to PRELIMINARY with the cell named", () => {
    const runs = [
      ...cell("full", "medium", "fx-a", 1.0),
      // fx-b has only 2 reps — below the §4-3 bench gate
      run("full", "medium", "fx-b", 1, 1.0),
      run("full", "medium", "fx-b", 2, 1.0),
    ];
    const report = buildEffortZoneCalibrationReport({
      provider: "openai",
      model: "m",
      gateThresholds: GATE,
      frontierThresholds: FRONTIER,
      effortOrder: ORDER,
      runs,
    });
    expect(report.decision_grade).toBe(false);
    expect(report.preliminary_reasons.join("\n")).toMatch(
      /zone=full, effort=medium, fixture=fx-b.*reps=2 < 3/,
    );
  });

  it("fewer than 2 fixtures in a (zone, effort) bucket violates INV-BENCH-1", () => {
    const report = buildEffortZoneCalibrationReport({
      provider: "openai",
      model: "m",
      gateThresholds: GATE,
      frontierThresholds: FRONTIER,
      effortOrder: ORDER,
      runs: cell("full", "medium", "only-fixture", 1.0),
    });
    expect(report.decision_grade).toBe(false);
    expect(report.preliminary_reasons.join("\n")).toMatch(/fixtures=1 < 2 \(INV-BENCH-1\)/);
  });

  it("runs outside the effort order are dropped from both frontier and audit", () => {
    const runs = [
      ...cell("full", "medium", "fx-a", 1.0),
      ...cell("full", "medium", "fx-b", 1.0),
      // an unknown effort must not create cells or reasons
      run("full", "ultra", "fx-a", 1, 1.0),
    ];
    const report = buildEffortZoneCalibrationReport({
      provider: "openai",
      model: "m",
      gateThresholds: GATE,
      frontierThresholds: FRONTIER,
      effortOrder: ORDER,
      runs,
    });
    expect(report.decision_grade).toBe(true);
    expect(report.zones[0]!.curve.map((c) => c.effort)).toEqual(["medium"]);
  });

  it("a zone where no effort clears the gate reports null minViableEffort", () => {
    const runs = [
      ...cell("low", "medium", "fx-a", 0.5),
      ...cell("low", "medium", "fx-b", 0.5),
      ...cell("low", "high", "fx-a", 0.6),
      ...cell("low", "high", "fx-b", 0.6),
    ];
    const report = buildEffortZoneCalibrationReport({
      provider: "openai",
      model: "m",
      gateThresholds: GATE,
      frontierThresholds: FRONTIER,
      effortOrder: ORDER,
      runs,
    });
    const low = report.zones.find((z) => z.zone === "low")!;
    expect(low.minViableEffort).toBeNull();
    expect(low.rationale).toMatch(/never reaches passQuorum/);
  });
});
