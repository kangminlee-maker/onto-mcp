import { describe, expect, it } from "vitest";
import { parsePilotConfig, requiredRepsPerCell } from "./effort-bench-pilot-report.ts";

describe("requiredRepsPerCell — two-sample normal approximation", () => {
  it("floors at the registered minimum when variance is small", () => {
    // σ=0.05, Δ=0.15 → 2·0.0025·7.849/0.0225 ≈ 1.74 → ceil 2 → floored to 3.
    expect(requiredRepsPerCell(0.05, 0.15, 3)).toBe(3);
  });

  it("grows quadratically with σ/Δ", () => {
    // σ=0.15, Δ=0.15 → 2·7.849 ≈ 15.7 → 16.
    expect(requiredRepsPerCell(0.15, 0.15, 3)).toBe(16);
    // Halving Δ quadruples n.
    expect(requiredRepsPerCell(0.15, 0.075, 3)).toBe(63);
  });

  it("rejects invalid inputs", () => {
    expect(() => requiredRepsPerCell(-0.1, 0.15, 3)).toThrow(/invalid power inputs/);
    expect(() => requiredRepsPerCell(0.1, 0, 3)).toThrow(/invalid power inputs/);
  });
});

describe("parsePilotConfig — fail-loud validation", () => {
  const valid = {
    effort: "medium",
    registration: "reg.yaml",
    arm_settings_dir: "arms",
    score_capture_dirs: { full: "score-full" },
    cells: [{ zone: "full", fixture: "fx", sessions: ["s1"] }],
  };

  it("accepts a valid config", () => {
    expect(parsePilotConfig(valid).cells).toHaveLength(1);
  });

  it("rejects a cell whose zone has no capture dir", () => {
    expect(() =>
      parsePilotConfig({
        ...valid,
        cells: [{ zone: "partial", fixture: "fx", sessions: ["s1"] }],
      }),
    ).toThrow(/no score_capture_dirs entry/);
  });

  it("rejects empty sessions and missing fields", () => {
    expect(() =>
      parsePilotConfig({ ...valid, cells: [{ zone: "full", fixture: "fx", sessions: [] }] }),
    ).toThrow(/sessions/);
    expect(() => parsePilotConfig({ ...valid, effort: "" })).toThrow(/effort/);
  });
});
