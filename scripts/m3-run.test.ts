import { describe, it, expect, vi } from "vitest";
import { aggregate, stats, replayRun, verifySourceDigests, computeSourceDigests } from "./m3-run.ts";
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
    band,
  };
}

const CLINICAL = "clinical-lab-workflow";
const CLINICAL_SESSION = "20260610-5fbe917f";
const BASELINE_RUN_DIR = "development-records/benchmark/m3/20260716-baseline-evidence";

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

  it("threads judge_auth into the verdict when supplied (provenance)", () => {
    const a = aggregate("clinical-lab", "s1", [result("meets", 1, 0.85)], "oauth");
    expect(a.judge_auth).toBe("oauth");
    const b = aggregate("clinical-lab", "s1", [result("meets", 1, 0.85)]);
    expect(b.judge_auth).toBeUndefined(); // omitted, not fabricated
  });
});

describe("source-digest provenance (hermetic replay)", () => {
  it("computeSourceDigests returns a sha256 per scored source file", async () => {
    const d = await computeSourceDigests(CLINICAL, CLINICAL_SESSION);
    expect(Object.keys(d).sort()).toEqual(["finding_ledger", "ground_truth", "issue_ledger"]);
    for (const v of Object.values(d)) expect(v).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifySourceDigests passes when digests match on-disk content", async () => {
    const source_digests = await computeSourceDigests(CLINICAL, CLINICAL_SESSION);
    const capture = {
      schema_version: "m3-capture/3", fixture: CLINICAL, evidence_session: CLINICAL_SESSION,
      judge_model: "claude-opus-4-8", band_thresholds: {}, source_digests, runs: [],
    } as never;
    await expect(verifySourceDigests(capture)).resolves.toBeUndefined();
  });

  it("verifySourceDigests throws (fail loud) when a source file drifted since capture", async () => {
    const real = await computeSourceDigests(CLINICAL, CLINICAL_SESSION);
    const capture = {
      schema_version: "m3-capture/3", fixture: CLINICAL, evidence_session: CLINICAL_SESSION,
      judge_model: "x", band_thresholds: {},
      source_digests: { ...real, ground_truth: "0".repeat(64) }, runs: [],
    } as never;
    await expect(verifySourceDigests(capture)).rejects.toThrow(/ground_truth changed since capture/);
  });

  it("verifySourceDigests warns but does NOT throw for a pre-provenance capture (no digests)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const capture = {
      schema_version: "m3-capture/2", fixture: CLINICAL, evidence_session: CLINICAL_SESSION,
      judge_model: "x", band_thresholds: {}, runs: [],
    } as never;
    await expect(verifySourceDigests(capture)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("replayRun (end-to-end, no spend)", () => {
  it("re-scores the committed baseline captures deterministically", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let outputs;
    try {
      outputs = await replayRun(BASELINE_RUN_DIR);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
    expect(outputs).toHaveLength(3); // 3 fixture captures
    for (const o of outputs) {
      expect(o.per_run).toHaveLength(3); // K=3 judge runs each
      expect(typeof o.band_stable).toBe("boolean");
      expect(["below", "meets", "exceeds", "indeterminate"]).toContain(o.band);
    }
    // Determinism: replaying the same captured attributions yields identical verdicts.
    const again = await (async () => {
      const l = vi.spyOn(console, "log").mockImplementation(() => {});
      const w = vi.spyOn(console, "warn").mockImplementation(() => {});
      try { return await replayRun(BASELINE_RUN_DIR); } finally { l.mockRestore(); w.mockRestore(); }
    })();
    expect(again.map((o) => o.band)).toEqual(outputs.map((o) => o.band));
  });
});
