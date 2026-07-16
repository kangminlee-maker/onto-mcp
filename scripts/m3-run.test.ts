import { describe, it, expect, vi } from "vitest";
import {
  aggregate,
  classifyVerdict,
  stats,
  replayRun,
  verifySourceDigests,
  computeSourceDigests,
  VERDICT_POLICY,
  type VerdictPolicy,
} from "./m3-run.ts";
import type { DefectSpectrumResult, DefectSpectrumBand } from "./m3-defect-spectrum.ts";

/** One scored run. Only `band` and `attributed_issues` drive the verdict; the
 *  metric fields feed the distribution stats. */
function result(
  band: DefectSpectrumBand,
  recallMaterial: number,
  precision: number,
  attributedIssues = 11,
): DefectSpectrumResult {
  return {
    seeded_total: 10,
    seeded_material_total: 7,
    detected_defect_ids: [],
    detected_material_defect_ids: [],
    recall_overall: recallMaterial, // not exercised distinctly here
    recall_material: recallMaterial,
    surfaced_issues_total: 12,
    attributed_issues: attributedIssues,
    fabricated_issues: 12 - attributedIssues,
    precision,
    band,
  };
}

/** `count` runs in one band with plausible-but-inert metrics (verdict reads only
 *  band + attribution). */
function band(
  b: DefectSpectrumBand,
  count: number,
  opts: { precision?: number; recall?: number; attributed?: number } = {},
): DefectSpectrumResult[] {
  const recall = opts.recall ?? (b === "below" ? 0.857 : 1);
  const precision = opts.precision ?? (b === "exceeds" ? 0.95 : b === "meets" ? 0.83 : 0.7);
  return Array.from({ length: count }, () => result(b, recall, precision, opts.attributed ?? 11));
}

// Explicit policy (mirrors the module default) so the falsifiable tests do not
// silently depend on the shipped default value.
const POLICY: VerdictPolicy = { min_adequate_runs: 8, dominant_min_fraction: 0.85, significant_mode_fraction: 0.15 };

const CLINICAL = "clinical-lab-workflow";
const CLINICAL_SESSION = "20260610-5fbe917f";
const BASELINE_RUN_DIR = "development-records/benchmark/m3/20260716-baseline-evidence";

describe("stats", () => {
  it("computes n / min / max / mean / population stdev", () => {
    const s = stats([0.731, 0.808, 0.808]);
    expect(s.n).toBe(3);
    expect(s.min).toBe(0.731);
    expect(s.max).toBe(0.808);
    expect(s.mean).toBeCloseTo((0.731 + 0.808 + 0.808) / 3, 10);
    // population stdev (÷n), not sample (÷n-1)
    const mean = (0.731 + 0.808 + 0.808) / 3;
    const variance = ([0.731, 0.808, 0.808].reduce((a, b) => a + (b - mean) ** 2, 0)) / 3;
    expect(s.stdev).toBeCloseTo(Math.sqrt(variance), 10);
  });

  it("is defined for a single sample (stdev 0), unlike the sample stdev", () => {
    expect(stats([1])).toEqual({ n: 1, min: 1, max: 1, mean: 1, stdev: 0 });
  });

  it("throws on no samples", () => {
    expect(() => stats([])).toThrow(/no samples/);
  });
});

describe("classifyVerdict — distribution-based band (design §3-3)", () => {
  it("clean distribution → dominant, noise 0 (clinical-lab: stably 미달 at adequate K)", () => {
    const v = classifyVerdict(band("below", 10), POLICY);
    expect(v.kind).toBe("dominant");
    expect(v.band).toBe("below");
    expect(v.noise_rate).toBe(0);
    expect(v.band_frequencies).toEqual({ below: 10 });
  });

  it("rare judge miss → dominant band + noise rate, NOT indeterminate (credit-risk: 상회 13/14)", () => {
    // The exact case a small-K probe mislabeled 'unstable' (H3): dominantly 상회
    // with one ~7% off-band draw.
    const v = classifyVerdict([...band("exceeds", 13), ...band("below", 1)], POLICY);
    expect(v.kind).toBe("dominant");
    expect(v.band).toBe("exceeds");
    expect(v.noise_rate).toBeCloseTo(1 / 14, 10);
    expect(v.band_frequencies).toEqual({ exceeds: 13, below: 1 });
  });

  it("genuine straddle → indeterminate (manufacturing: precision straddles the 0.8 floor)", () => {
    // below and meets each command a significant share ⇒ two genuine modes.
    const v = classifyVerdict([...band("below", 8), ...band("meets", 6)], POLICY);
    expect(v.kind).toBe("indeterminate");
    expect(v.band).toBeNull();
    expect(v.noise_rate).toBeNull();
    expect(v.band_frequencies).toEqual({ below: 8, meets: 6 });
  });

  it("K below the adequacy floor → underpowered, NOT a confident band (H3 — small-K agreement is unreliable)", () => {
    // Identical to a would-be 'dominant below', but K=3 cannot separate rare noise
    // from a straddle, so the band is advisory only.
    const v = classifyVerdict(band("below", 3), POLICY);
    expect(v.kind).toBe("underpowered");
    expect(v.band).toBe("below"); // advisory most-frequent band
    expect(v.noise_rate).toBeNull();
  });

  it("zero attribution across ALL runs → instrument_broken, NOT a real 미달 (engagement gate, §11 item 3)", () => {
    // A collapsed/non-engaged judge attributes nothing → precision 0 → below every
    // run. That uniform 'below' is instrument failure, not a verdict.
    const v = classifyVerdict(band("below", 10, { precision: 0, attributed: 0 }), POLICY);
    expect(v.kind).toBe("instrument_broken");
    expect(v.band).toBeNull();
  });

  it("a real 미달 (low but non-zero attribution) is trusted, not swallowed by the engagement gate", () => {
    const v = classifyVerdict(band("below", 10, { precision: 0.6, attributed: 7 }), POLICY);
    expect(v.kind).toBe("dominant");
    expect(v.band).toBe("below");
  });

  it("a minority band AT/ABOVE the significance share is a genuine second mode → indeterminate (not noise)", () => {
    // exceeds 0.8 clears dominant_min, but below 0.2 ≥ significance(0.15) is a real
    // second mode — 0.2 of draws is not 'rare noise'.
    const v = classifyVerdict([...band("exceeds", 8), ...band("below", 2)], POLICY);
    expect(v.kind).toBe("indeterminate");
  });

  it("a minority band BELOW the significance share is rare noise → dominant + noise", () => {
    const v = classifyVerdict([...band("exceeds", 9), ...band("below", 1)], POLICY);
    expect(v.kind).toBe("dominant");
    expect(v.band).toBe("exceeds");
    expect(v.noise_rate).toBeCloseTo(0.1, 10);
  });

  it("FALSIFIABLE boundary: K == min_adequate_runs is ADEQUATE (dominant, not underpowered)", () => {
    // K=8 is both the adequacy floor AND the shipped DEFAULT_JUDGE_RUNS. The gate
    // is `K < min_adequate_runs`; a `<=` mutation would label every default
    // production run underpowered forever. K=8 clean must classify `dominant`.
    const v = classifyVerdict(band("below", 8), POLICY);
    expect(v.kind).toBe("dominant");
    expect(v.band).toBe("below");
    // Contrast: one fewer run (K=7) is underpowered — pins the boundary from below.
    expect(classifyVerdict(band("below", 7), POLICY).kind).toBe("underpowered");
  });

  it("FALSIFIABLE boundary: dominant_min share is inclusive (≥) — a lone mode at exactly 0.85 is dominant", () => {
    // exceeds 17/20 = 0.85 is the only significant mode (meets 0.10 + below 0.05
    // are sub-significant noise). topFraction == dominant_min ⇒ dominant; a `>`
    // mutation would drop this to indeterminate.
    const v = classifyVerdict([...band("exceeds", 17), ...band("meets", 2), ...band("below", 1)], POLICY);
    expect(v.kind).toBe("dominant");
    expect(v.band).toBe("exceeds");
    expect(v.noise_rate).toBeCloseTo(0.15, 10);
  });

  it("FALSIFIABLE boundary: significance share is inclusive (≥) — 0.15 counts as a mode", () => {
    // 3/20 = 0.15 == significant_mode_fraction → second mode → indeterminate.
    const atCut = classifyVerdict([...band("exceeds", 17), ...band("below", 3)], POLICY);
    expect(atCut.kind).toBe("indeterminate");
    // 2/20 = 0.10 < 0.15 → rare noise → dominant. Pins the `>=` (a `>` mutation
    // would make atCut dominant too, erasing the contrast).
    const belowCut = classifyVerdict([...band("exceeds", 18), ...band("below", 2)], POLICY);
    expect(belowCut.kind).toBe("dominant");
    expect(belowCut.band).toBe("exceeds");
  });

  it("dominant_min gates a single-mode winner that is too weak → indeterminate", () => {
    // exceeds 0.8 is the only significant mode (meets 0.1 + below 0.1 are noise),
    // but 0.8 < dominant_min(0.85) → not confident enough → indeterminate.
    const v = classifyVerdict(
      [...band("exceeds", 16), ...band("meets", 2), ...band("below", 2)],
      POLICY,
    );
    expect(v.band_frequencies).toEqual({ exceeds: 16, meets: 2, below: 2 });
    expect(v.kind).toBe("indeterminate");
  });

  it("the shipped VERDICT_POLICY default is the documented adequacy/dominance/significance triple", () => {
    expect(VERDICT_POLICY).toEqual({ min_adequate_runs: 8, dominant_min_fraction: 0.85, significant_mode_fraction: 0.15 });
  });

  it("throws on an empty run set — no vacuous instrument_broken from every([]) === true", () => {
    expect(() => classifyVerdict([], POLICY)).toThrow(/no judge runs/);
  });

  it("canary gate: a canary defect detected in ZERO runs → instrument_broken (design §11 item 3)", () => {
    // Adequate K, healthy attribution — would be a clean `dominant` — but the
    // canary defect appears in NO run's detected set ⇒ the instrument dropped a
    // known-detectable defect (collapsed/mis-projected judge), not a real miss.
    const runs = band("exceeds", 10).map((r) => ({ ...r, detected_defect_ids: ["OTHER"] }));
    expect(classifyVerdict(runs, POLICY, ["CANARY-1"]).kind).toBe("instrument_broken");
  });

  it("canary gate: a canary detected in ≥1 run passes (contrast — one detection clears it)", () => {
    const runs = band("exceeds", 10).map((r, i) => ({
      ...r,
      detected_defect_ids: i === 0 ? ["CANARY-1"] : ["OTHER"],
    }));
    expect(classifyVerdict(runs, POLICY, ["CANARY-1"]).kind).toBe("dominant");
  });

  it("canary gate: no canary configured ⇒ no-op (empty list never fires)", () => {
    const runs = band("exceeds", 10).map((r) => ({ ...r, detected_defect_ids: [] }));
    expect(classifyVerdict(runs, POLICY, []).kind).toBe("dominant");
  });
});

describe("aggregate", () => {
  it("wraps the verdict with the primary metric distributions", () => {
    const a = aggregate("credit-risk", "s1", [...band("exceeds", 13), ...band("below", 1)], POLICY);
    expect(a.verdict.kind).toBe("dominant");
    expect(a.verdict.band).toBe("exceeds");
    expect(a.judge_runs).toBe(14);
    // distribution is the primary output
    expect(a.precision.n).toBe(14);
    expect(a.recall_material.min).toBeLessThanOrEqual(a.recall_material.max);
  });

  it("throws on zero runs (no vacuous aggregate)", () => {
    expect(() => aggregate("x", "s", [], POLICY)).toThrow(/no judge runs/);
  });

  it("threads judge_auth into the verdict when supplied (provenance)", () => {
    const a = aggregate("clinical-lab", "s1", band("meets", 10), POLICY, "oauth");
    expect(a.judge_auth).toBe("oauth");
    const b = aggregate("clinical-lab", "s1", band("meets", 10), POLICY);
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
  it("re-scores the committed K=3 baseline as UNDERPOWERED (the disclosed inadequacy, design §3-3)", async () => {
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
      // K=3 < min_adequate_runs(8) — the refined methodology refuses a confident
      // band on the disclosed-untrustworthy baseline instead of the old false
      // "stable" (README Finding 3).
      expect(o.verdict.kind).toBe("underpowered");
      expect(o.judge_runs).toBe(3);
    }
    // Determinism: replaying the same captured attributions yields identical verdicts.
    const again = await (async () => {
      const l = vi.spyOn(console, "log").mockImplementation(() => {});
      const w = vi.spyOn(console, "warn").mockImplementation(() => {});
      try { return await replayRun(BASELINE_RUN_DIR); } finally { l.mockRestore(); w.mockRestore(); }
    })();
    expect(again.map((o) => o.verdict)).toEqual(outputs.map((o) => o.verdict));
  });
});
