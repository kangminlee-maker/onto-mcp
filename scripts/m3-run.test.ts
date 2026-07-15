import { describe, it, expect } from "vitest";
import { aggregate, stats } from "./m3-run.ts";
import type { DefectSpectrumResult, DefectSpectrumBand } from "./m3-defect-spectrum.ts";

function result(band: DefectSpectrumBand, recallMaterial: number, precision: number): DefectSpectrumResult {
  return {
    seeded_total: 10,
    seeded_material_total: 7,
    detected_defect_ids: [],
    detected_material_defect_ids: [],
    recall_overall: recallMaterial, // not exercised distinctly here
    recall_material: recallMaterial,
    surfaced_issues_total: 12,
    attributed_issues: 11,
    fabricated_issues: 1,
    precision,
    severity_aligned_defect_ids: [],
    severity_alignment_rate: 1,
    band,
  };
}

describe("stats", () => {
  it("computes min / max / mean", () => {
    expect(stats([0.731, 0.808, 0.808])).toEqual({ min: 0.731, max: 0.808, mean: (0.731 + 0.808 + 0.808) / 3 });
    expect(stats([1])).toEqual({ min: 1, max: 1, mean: 1 });
  });
});

describe("aggregate", () => {
  it("reports the band when every judge run agrees (STABLE)", () => {
    const a = aggregate("clinical-lab", "s1", [
      result("below", 0.857, 0.917),
      result("below", 0.857, 0.917),
      result("below", 0.857, 0.917),
    ]);
    expect(a.band_stable).toBe(true);
    expect(a.band).toBe("below");
    expect(a.judge_runs).toBe(3);
    expect(a.recall_material.min).toBe(0.857);
    expect(a.recall_material.max).toBe(0.857);
    expect(a.recall_material.mean).toBeCloseTo(0.857, 10);
  });

  it("reports INDETERMINATE when runs disagree, never a single-draw band (design §3-3)", () => {
    const a = aggregate("credit-risk", "s1", [
      result("below", 0.875, 0.909),
      result("exceeds", 1.0, 0.909),
      result("exceeds", 1.0, 0.909),
    ]);
    expect(a.band_stable).toBe(false);
    expect(a.band).toBe("indeterminate");
    expect(a.bands_observed).toEqual(["below", "exceeds", "exceeds"]);
    // the metric range exposes the near-threshold oscillation that flipped the band
    expect(a.recall_material.min).toBe(0.875);
    expect(a.recall_material.max).toBe(1.0);
  });

  it("catches a precision-floor flip (meets/below) as indeterminate", () => {
    const a = aggregate("manufacturing-bom", "s1", [
      result("meets", 1.0, 0.808),
      result("meets", 1.0, 0.808),
      result("below", 1.0, 0.731),
    ]);
    expect(a.band).toBe("indeterminate");
    expect(a.precision).toEqual({ min: 0.731, max: 0.808, mean: (0.808 + 0.808 + 0.731) / 3 });
  });

  it("throws on zero runs (no vacuous aggregate)", () => {
    expect(() => aggregate("x", "s", [])).toThrow(/no judge runs/);
  });
});
