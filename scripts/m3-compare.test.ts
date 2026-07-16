import { describe, it, expect } from "vitest";
import { compareArms, renderComparison, type ArmReport } from "./m3-compare.ts";
import type { RunStats } from "./m3-run.ts";
import type { DefectSpectrumBand } from "./m3-defect-spectrum.ts";

function st(mean: number, min = mean, max = mean): RunStats {
  return { n: 8, mean, min, max, stdev: 0 };
}

/** One fixture entry in an arm report. `stable`/`reps` default to R=1 semantics. */
function fx(
  fixture: string,
  kind: "dominant" | "indeterminate" | "underpowered" | "instrument_broken",
  band: DefectSpectrumBand | null,
  recallMaterial: RunStats,
  precision: RunStats,
  opts: { reps?: number; stable?: boolean | null } = {},
) {
  return {
    fixture,
    verdict: { kind, band },
    review_reps: opts.reps ?? 1,
    intra_model_stable: opts.stable ?? null,
    recall_material: recallMaterial,
    recall_overall: recallMaterial,
    precision,
  };
}

function arm(label: string, review_reps: number, fixtures: ReturnType<typeof fx>[]): ArmReport {
  return { label, review_reps, fixtures };
}

describe("compareArms", () => {
  it("FALSIFIABLE: disjoint metric ranges → distinguishable with the higher arm as leader", () => {
    const sol = arm("sol", 3, [fx("logistics", "dominant", "exceeds", st(1.0), st(0.955, 0.95, 0.96))]);
    const g55 = arm("gpt-5.5", 3, [fx("logistics", "dominant", "meets", st(1.0), st(0.80, 0.79, 0.81))]);
    const cmp = compareArms([sol, g55]);
    const prec = cmp.fixtures[0]!.metrics.find((m) => m.metric === "precision")!;
    expect(prec.outcome).toBe("distinguishable");
    expect(prec.leader).toBe("sol");
    expect(prec.ranked.map((r) => r.label)).toEqual(["sol", "gpt-5.5"]); // ranked by mean desc
    // recall_material is identical [1,1] for both → ranges overlap → NOT distinguishable
    const rec = cmp.fixtures[0]!.metrics.find((m) => m.metric === "recall_material")!;
    expect(rec.outcome).toBe("overlapping");
  });

  it("FALSIFIABLE: overlapping ranges → indistinguishable (contrast with the disjoint case)", () => {
    const sol = arm("sol", 3, [fx("credit", "dominant", "exceeds", st(1.0), st(0.93, 0.90, 0.96))]);
    const g55 = arm("gpt-5.5", 3, [fx("credit", "dominant", "exceeds", st(1.0), st(0.91, 0.88, 0.94))]);
    const prec = compareArms([sol, g55]).fixtures[0]!.metrics.find((m) => m.metric === "precision")!;
    expect(prec.outcome).toBe("overlapping"); // 0.90–0.96 overlaps 0.88–0.94
    expect(prec.leader).toBeNull();
  });

  it("excludes an untrustworthy verdict (underpowered / instrument_broken) from the comparison — intra-model stability gate (§3-3)", () => {
    const sol = arm("sol", 1, [fx("clinical", "dominant", "below", st(0.857), st(0.917))]);
    const g55 = arm("gpt-5.5", 1, [fx("clinical", "instrument_broken", null, st(0), st(0))]);
    const rec = compareArms([sol, g55]).fixtures[0]!.metrics.find((m) => m.metric === "recall_material")!;
    expect(rec.excluded).toEqual([{ label: "gpt-5.5", reason: expect.stringContaining("instrument_broken") }]);
    expect(rec.outcome).toBe("insufficient"); // only sol remains → cannot compare
    expect(rec.ranked.map((r) => r.label)).toEqual(["sol"]);
  });

  it("FALSIFIABLE: excludes an intra-model-UNSTABLE cell at R≥2 (§3-3 stability gate)", () => {
    // Both dominant, but 5.5's clinical is intra-model UNSTABLE across its reviews →
    // not a stable measurement → excluded → only sol remains → insufficient.
    const sol = arm("sol", 2, [fx("clinical", "dominant", "below", st(0.857), st(0.917), { reps: 2, stable: true })]);
    const g55 = arm("gpt-5.5", 2, [fx("clinical", "dominant", "below", st(0.857), st(0.742), { reps: 2, stable: false })]);
    const prec = compareArms([sol, g55]).fixtures[0]!.metrics.find((m) => m.metric === "precision")!;
    expect(prec.excluded).toEqual([{ label: "gpt-5.5", reason: expect.stringContaining("intra-model UNSTABLE") }]);
    expect(prec.outcome).toBe("insufficient");
    // Contrast: both stable → compared normally (sol higher precision, disjoint)
    const g55stable = arm("gpt-5.5", 2, [fx("clinical", "dominant", "below", st(0.857), st(0.742), { reps: 2, stable: true })]);
    const prec2 = compareArms([sol, g55stable]).fixtures[0]!.metrics.find((m) => m.metric === "precision")!;
    expect(prec2.outcome).toBe("distinguishable");
    expect(prec2.leader).toBe("sol");
  });

  it("derives R (and directional) from per-fixture review_reps in the report, not just the arm flag", () => {
    const sol = arm("sol", 99 /* arm fallback ignored */, [fx("m", "dominant", "exceeds", st(1), st(0.96), { reps: 3, stable: true })]);
    const g55 = arm("gpt-5.5", 99, [fx("m", "dominant", "meets", st(1), st(0.80), { reps: 2, stable: true })]);
    const cmp = compareArms([sol, g55]);
    expect(cmp.review_reps).toBe(2); // min per-cell reps (2), not the arm flag (99)
    expect(cmp.directional).toBe(false); // both cells R>=2
  });

  it("marks the comparison DIRECTIONAL when R < 2 (review variance unestimated)", () => {
    const a = arm("sol", 1, [fx("logistics", "dominant", "exceeds", st(1.0), st(0.96))]); // per-cell reps=1
    const b = arm("gpt-5.5", 1, [fx("logistics", "dominant", "meets", st(1.0), st(0.80))]);
    const cmp = compareArms([a, b]);
    expect(cmp.review_reps).toBe(1);
    expect(cmp.directional).toBe(true);
    // Per-cell reps>=2 on both → not directional (per-fixture review_reps drives it).
    const a2 = arm("sol", 1, [fx("logistics", "dominant", "exceeds", st(1.0), st(0.96), { reps: 3, stable: true })]);
    const b2 = arm("gpt-5.5", 1, [fx("logistics", "dominant", "meets", st(1.0), st(0.80), { reps: 2, stable: true })]);
    expect(compareArms([a2, b2]).directional).toBe(false); // min(3,2)=2
    expect(compareArms([a2, b2]).review_reps).toBe(2); // min per-cell reps
  });

  it("compares only fixtures present in >=2 arms (a solo fixture is skipped)", () => {
    const sol = arm("sol", 2, [
      fx("logistics", "dominant", "exceeds", st(1.0), st(0.96)),
      fx("sol-only", "dominant", "meets", st(1.0), st(0.80)),
    ]);
    const g55 = arm("gpt-5.5", 2, [fx("logistics", "dominant", "meets", st(1.0), st(0.80))]);
    const cmp = compareArms([sol, g55]);
    expect(cmp.fixtures.map((f) => f.fixture)).toEqual(["logistics"]); // sol-only dropped
  });

  it("throws on fewer than two arms and on duplicate arm labels", () => {
    const a = arm("sol", 1, [fx("x", "dominant", "meets", st(1), st(0.9))]);
    expect(() => compareArms([a])).toThrow(/at least two arms/);
    expect(() => compareArms([a, arm("sol", 1, a.fixtures)])).toThrow(/labels must be unique/);
  });

  it("FALSIFIABLE boundary: touching ranges (share an endpoint) are NOT disjoint → overlapping", () => {
    // sol [0.80,0.90], g55 [0.90,0.95] share 0.90 → not distinguishable (pins the strict `>`).
    const sol = arm("sol", 3, [fx("m", "dominant", "meets", st(1.0), st(0.85, 0.80, 0.90))]);
    const g55 = arm("gpt-5.5", 3, [fx("m", "dominant", "exceeds", st(1.0), st(0.925, 0.90, 0.95))]);
    const prec = compareArms([sol, g55]).fixtures[0]!.metrics.find((m) => m.metric === "precision")!;
    expect(prec.outcome).toBe("overlapping");
  });
});

describe("renderComparison", () => {
  it("renders the directional caveat and a per-fixture per-metric line", () => {
    const sol = arm("sol", 1, [fx("logistics", "dominant", "exceeds", st(1.0), st(0.958))]);
    const g55 = arm("gpt-5.5", 1, [fx("logistics", "dominant", "meets", st(1.0), st(0.80))]);
    const text = renderComparison(compareArms([sol, g55]));
    expect(text).toContain("sol vs gpt-5.5");
    expect(text).toContain("DIRECTIONAL");
    expect(text).toContain("logistics");
    expect(text).toMatch(/precision.*sol.*higher/); // sol leads precision, ranges disjoint
  });
});
