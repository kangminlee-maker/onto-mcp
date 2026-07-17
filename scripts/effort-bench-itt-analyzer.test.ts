import { describe, expect, it } from "vitest";
import {
  analyzePreregWithCI,
  type BenchReviewObservation,
} from "./effort-bench-itt-analyzer.ts";
import { parseEffortBenchPrereg, type EffortBenchPrereg } from "./effort-bench-prereg.ts";

// ── manifest builder (literal, not the committed template — this suite
// exercises the analyzer's own CI/cluster logic, not the template's numbers) ──

function baseManifestRaw(): Record<string, unknown> {
  return {
    schema_version: "effort-bench-prereg/1",
    estimand: "inline_budget_itt",
    gate: { recall_cut: 1.0, precision_floor: 0.8 },
    coverage_levels: ["full", "partial", "full-restored"],
    efforts: ["medium"],
    fixtures: ["fx-a", "fx-b"],
    // judge_runs=1 here because most synthetic worlds below use single-draw
    // reviews; the K-pin behavior itself is tested explicitly (K=8 manifests
    // reject 1-draw observations and vice versa).
    cluster: { min_reps_per_cell: 4, min_fixtures_per_level: 2, judge_runs: 1 },
    analysis: { ci: "cluster-bootstrap-by-review", multiplicity: "all-registered-contrasts-must-hold" },
    aggregation: "per_fixture_all",
    contrasts: [
      {
        id: "C1-full-vs-partial",
        metric: "recall_material",
        effort: "medium",
        baseline_zone: "full",
        treatment_zone: "partial",
        direction: "decrease",
        min_effect_recall_points: 0.25,
      },
    ],
    recovery: {
      baseline_zone: "full",
      restored_zone: "full-restored",
      effort: "medium",
      within_recall_points: 0.08,
    },
    fail_closed: true,
  };
}

const buildManifest = (mutate?: (m: Record<string, unknown>) => void): EffortBenchPrereg => {
  const raw = baseManifestRaw();
  mutate?.(raw);
  return parseEffortBenchPrereg(raw);
};

const obs = (
  zone: string,
  fixture: string,
  rep: number,
  draw_scores: number[],
  effort = "medium",
): BenchReviewObservation => ({ zone, effort, fixture, rep, draw_scores });

describe("analyzePreregWithCI — synthetic known effect", () => {
  // full ≈0.99, partial ≈0.59 (tight within-cell spread), R=4, 2 fixtures.
  // full-restored ≈ full (small deviation, well inside the 0.08 recovery band).
  const knownEffectObservations: BenchReviewObservation[] = [
    obs("full", "fx-a", 1, [0.98]),
    obs("full", "fx-a", 2, [1.0]),
    obs("full", "fx-a", 3, [0.99]),
    obs("full", "fx-a", 4, [1.0]),
    obs("full", "fx-b", 1, [1.0]),
    obs("full", "fx-b", 2, [0.97]),
    obs("full", "fx-b", 3, [1.0]),
    obs("full", "fx-b", 4, [0.98]),
    obs("partial", "fx-a", 1, [0.58]),
    obs("partial", "fx-a", 2, [0.6]),
    obs("partial", "fx-a", 3, [0.57]),
    obs("partial", "fx-a", 4, [0.61]),
    obs("partial", "fx-b", 1, [0.59]),
    obs("partial", "fx-b", 2, [0.61]),
    obs("partial", "fx-b", 3, [0.58]),
    obs("partial", "fx-b", 4, [0.6]),
    obs("full-restored", "fx-a", 1, [0.99]),
    obs("full-restored", "fx-a", 2, [0.97]),
    obs("full-restored", "fx-a", 3, [1.0]),
    obs("full-restored", "fx-a", 4, [0.98]),
    obs("full-restored", "fx-b", 1, [0.98]),
    obs("full-restored", "fx-b", 2, [1.0]),
    obs("full-restored", "fx-b", 3, [0.97]),
    obs("full-restored", "fx-b", 4, [0.99]),
  ];

  it("contrast met, CI brackets ~0.4, recovery met, all_met true", () => {
    const manifest = buildManifest();
    const report = analyzePreregWithCI(manifest, knownEffectObservations, {
      seed: 42,
      bootstrapIterations: 2000,
    });
    expect(report.ci_rule).toBe("cluster-bootstrap-by-review");
    const c = report.contrasts[0]!;
    expect(c.outcome).toBe("met");
    expect(c.underpowered).toEqual([]);
    expect(c.per_fixture).toHaveLength(2);
    for (const f of c.per_fixture) {
      expect(f.ci.lower).toBeLessThan(f.ci.upper); // nonzero width — the spread is real
      expect(f.point).toBeGreaterThan(0.35);
      expect(f.point).toBeLessThan(0.45);
      expect(f.met).toBe(true);
    }
    expect(report.recovery.outcome).toBe("met");
    expect(report.all_met).toBe(true);
  });

  it("determinism: same seed ⇒ deep-equal report; different seed ⇒ different CI bounds", () => {
    const manifest = buildManifest();
    const r1 = analyzePreregWithCI(manifest, knownEffectObservations, { seed: 123, bootstrapIterations: 1000 });
    const r2 = analyzePreregWithCI(manifest, knownEffectObservations, { seed: 123, bootstrapIterations: 1000 });
    expect(r1).toEqual(r2);
    const r3 = analyzePreregWithCI(manifest, knownEffectObservations, { seed: 456, bootstrapIterations: 1000 });
    // A single CI bound can coincidentally collide when the underlying data
    // has low value diversity (small quantized set of possible resample
    // means); compare the whole CI-bearing report so an incidental collision
    // on one field can't mask a real seed-dependence bug.
    expect(r3).not.toEqual(r1);
  });

  it("cell_dispersion reports n_reps/mean/sd per (zone,effort,fixture) cell; sd null when n<2", () => {
    const manifest = buildManifest();
    const single = [obs("full", "fx-a", 1, [0.98])];
    const report = analyzePreregWithCI(manifest, single, { seed: 1 });
    expect(report.cell_dispersion).toHaveLength(1);
    const cell = report.cell_dispersion[0]!;
    expect(cell).toMatchObject({ zone: "full", effort: "medium", fixture: "fx-a", n_reps: 1, mean: 0.98 });
    expect(cell.sd).toBeNull();

    const full = analyzePreregWithCI(manifest, knownEffectObservations, { seed: 1 });
    expect(full.cell_dispersion).toHaveLength(6); // 3 zones × 2 fixtures
    const fullFxA = full.cell_dispersion.find((d) => d.zone === "full" && d.fixture === "fx-a")!;
    expect(fullFxA.n_reps).toBe(4);
    expect(fullFxA.mean).toBeCloseTo(0.9925, 4);
    expect(fullFxA.sd).not.toBeNull();
  });
});

describe("analyzePreregWithCI — cluster-by-review vs naive pooled-by-draw (the load-bearing separation)", () => {
  // Each review's K=8 draws are IDENTICAL within the review (zero intra-review
  // variance) but review means differ strongly across reviews (all the true
  // uncertainty lives between reviews). A naive pool of all R×K draws treats
  // 32 values as independent when only 4 are — understating variance and
  // producing an artificially narrow CI. The module must resample REVIEWS.
  const K = 8;
  const repeatK = (v: number): number[] => new Array(K).fill(v);

  const fullFxAReviewMeans = [0.9, 0.95, 0.85, 1.0];
  const partialFxAReviewMeans = [0.5, 0.55, 0.45, 0.6];
  const fullFxBReviewMeans = [0.92, 0.97, 0.87, 0.99];
  const partialFxBReviewMeans = [0.52, 0.57, 0.47, 0.58];

  const clusterObservations: BenchReviewObservation[] = [
    ...fullFxAReviewMeans.map((v, i) => obs("full", "fx-a", i + 1, repeatK(v))),
    ...partialFxAReviewMeans.map((v, i) => obs("partial", "fx-a", i + 1, repeatK(v))),
    ...fullFxBReviewMeans.map((v, i) => obs("full", "fx-b", i + 1, repeatK(v))),
    ...partialFxBReviewMeans.map((v, i) => obs("partial", "fx-b", i + 1, repeatK(v))),
  ];

  // Naive pooled bootstrap comparator — resamples all R×K draws as one i.i.d.
  // pool. Deliberately NOT exported by the module: shipping this would be the
  // exact bug (R2-7) the module exists to prevent.
  function testMulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const meanOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const percentileOf = (sorted: number[], p: number): number => {
    const n = sorted.length;
    if (n === 1) return sorted[0]!;
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo]!;
    const frac = idx - lo;
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
  };
  const resampleOf = (xs: number[], rng: () => number): number[] => {
    const n = xs.length;
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = xs[Math.floor(rng() * n)]!;
    return out;
  };
  function pooledBootstrapWidth(baselineDraws: number[], treatmentDraws: number[], seed: number): number {
    const rng = testMulberry32(seed);
    const B = 3000;
    const effects = new Array<number>(B);
    for (let b = 0; b < B; b++) {
      const bs = resampleOf(baselineDraws, rng);
      const ts = resampleOf(treatmentDraws, rng);
      effects[b] = meanOf(bs) - meanOf(ts);
    }
    effects.sort((a, b) => a - b);
    return percentileOf(effects, 0.975) - percentileOf(effects, 0.025);
  }

  it("cluster-by-review CI is strictly wider than a naive pooled-by-draw CI", () => {
    const manifest = buildManifest((m) => {
      (m.cluster as Record<string, unknown>).judge_runs = K;
    });
    const report = analyzePreregWithCI(manifest, clusterObservations, { seed: 9, bootstrapIterations: 3000 });
    const c = report.contrasts[0]!;

    const fxA = c.per_fixture.find((f) => f.fixture === "fx-a")!;
    const clusterWidthA = fxA.ci.upper - fxA.ci.lower;
    const pooledWidthA = pooledBootstrapWidth(
      fullFxAReviewMeans.flatMap(repeatK),
      partialFxAReviewMeans.flatMap(repeatK),
      101,
    );
    expect(clusterWidthA).toBeGreaterThan(pooledWidthA);

    const fxB = c.per_fixture.find((f) => f.fixture === "fx-b")!;
    const clusterWidthB = fxB.ci.upper - fxB.ci.lower;
    const pooledWidthB = pooledBootstrapWidth(
      fullFxBReviewMeans.flatMap(repeatK),
      partialFxBReviewMeans.flatMap(repeatK),
      102,
    );
    expect(clusterWidthB).toBeGreaterThan(pooledWidthB);
  });
});

describe("analyzePreregWithCI — fail-closed power/completeness", () => {
  it("reps below min_reps_per_cell (R=3 < 4) → fixture listed underpowered, excluded, not_evaluable", () => {
    const manifest = buildManifest(); // min_reps_per_cell=4, min_fixtures_per_level=2
    const shortObservations: BenchReviewObservation[] = [
      obs("full", "fx-a", 1, [1.0]),
      obs("full", "fx-a", 2, [1.0]),
      obs("full", "fx-a", 3, [1.0]),
      obs("partial", "fx-a", 1, [0.5]),
      obs("partial", "fx-a", 2, [0.5]),
      obs("partial", "fx-a", 3, [0.5]),
      obs("partial", "fx-a", 4, [0.5]),
    ];
    const report = analyzePreregWithCI(manifest, shortObservations, { seed: 1 });
    const c = report.contrasts[0]!;
    expect(c.outcome).toBe("not_evaluable");
    expect(c.per_fixture).toEqual([]);
    // fx-a is underpowered (R=3 < 4) and registered fx-b has no cells at all —
    // both are attrition against the registered cohort.
    expect(c.underpowered.map((u) => u.fixture).sort()).toEqual(["fx-a", "fx-b"]);
    expect(c.underpowered[0]!.reason).toMatch(/fail-closed/);
    expect(c.reason).toMatch(/attrition/);
    expect(report.all_met).toBe(false);
  });

  it("fewer complete pairs than min_fixtures_per_level (missing fixture cell) → not_evaluable, never met", () => {
    const manifest = buildManifest();
    const onlyOneFixture: BenchReviewObservation[] = [
      obs("full", "fx-a", 1, [1.0]),
      obs("full", "fx-a", 2, [1.0]),
      obs("full", "fx-a", 3, [1.0]),
      obs("full", "fx-a", 4, [1.0]),
      obs("partial", "fx-a", 1, [0.5]),
      obs("partial", "fx-a", 2, [0.5]),
      obs("partial", "fx-a", 3, [0.5]),
      obs("partial", "fx-a", 4, [0.5]),
      // no fx-b cells at all → only 1 complete pair < min_fixtures_per_level=2
    ];
    const report = analyzePreregWithCI(manifest, onlyOneFixture, { seed: 1 });
    expect(report.contrasts[0]!.outcome).toBe("not_evaluable");
    expect(report.all_met).toBe(false);
  });
});

describe("analyzePreregWithCI — direction", () => {
  it("wrong-direction effect (treatment scores higher than baseline) → not_met", () => {
    const manifest = buildManifest();
    const reversed: BenchReviewObservation[] = [
      obs("full", "fx-a", 1, [0.5]),
      obs("full", "fx-a", 2, [0.52]),
      obs("full", "fx-a", 3, [0.48]),
      obs("full", "fx-a", 4, [0.5]),
      obs("full", "fx-b", 1, [0.5]),
      obs("full", "fx-b", 2, [0.51]),
      obs("full", "fx-b", 3, [0.49]),
      obs("full", "fx-b", 4, [0.5]),
      obs("partial", "fx-a", 1, [0.9]),
      obs("partial", "fx-a", 2, [0.92]),
      obs("partial", "fx-a", 3, [0.88]),
      obs("partial", "fx-a", 4, [0.9]),
      obs("partial", "fx-b", 1, [0.9]),
      obs("partial", "fx-b", 2, [0.91]),
      obs("partial", "fx-b", 3, [0.89]),
      obs("partial", "fx-b", 4, [0.9]),
    ];
    const report = analyzePreregWithCI(manifest, reversed, { seed: 7 });
    expect(report.contrasts[0]!.outcome).toBe("not_met");
    expect(report.contrasts[0]!.per_fixture.every((f) => !f.met)).toBe(true);
    expect(report.all_met).toBe(false);
  });
});

describe("analyzePreregWithCI — recovery equivalence", () => {
  const fullReviews = {
    "fx-a": [0.98, 1.0, 0.99, 1.0],
    "fx-b": [1.0, 0.97, 1.0, 0.98],
  };

  const buildRecoveryObservations = (restored: Record<"fx-a" | "fx-b", number[]>): BenchReviewObservation[] => [
    ...fullReviews["fx-a"].map((v, i) => obs("full", "fx-a", i + 1, [v])),
    ...fullReviews["fx-b"].map((v, i) => obs("full", "fx-b", i + 1, [v])),
    // partial cells present so the (unrelated) contrast stays evaluable, not the focus here
    obs("partial", "fx-a", 1, [0.6]),
    obs("partial", "fx-a", 2, [0.6]),
    obs("partial", "fx-a", 3, [0.6]),
    obs("partial", "fx-a", 4, [0.6]),
    obs("partial", "fx-b", 1, [0.6]),
    obs("partial", "fx-b", 2, [0.6]),
    obs("partial", "fx-b", 3, [0.6]),
    obs("partial", "fx-b", 4, [0.6]),
    ...restored["fx-a"].map((v, i) => obs("full-restored", "fx-a", i + 1, [v])),
    ...restored["fx-b"].map((v, i) => obs("full-restored", "fx-b", i + 1, [v])),
  ];

  it("CI entirely inside the ±0.08 band → recovery met", () => {
    const manifest = buildManifest();
    const observations = buildRecoveryObservations({
      "fx-a": [0.99, 0.97, 1.0, 0.98], // ≈ full fx-a, deviation ≈0
      "fx-b": [0.98, 1.0, 0.97, 0.99],
    });
    const report = analyzePreregWithCI(manifest, observations, { seed: 3, bootstrapIterations: 2000 });
    expect(report.recovery.outcome).toBe("met");
    for (const f of report.recovery.per_fixture) {
      expect(f.ci.lower).toBeGreaterThanOrEqual(-0.08);
      expect(f.ci.upper).toBeLessThanOrEqual(0.08);
    }
  });

  it("a CI that crosses the band edge → recovery not_met (equivalence requires the ENTIRE CI inside)", () => {
    const manifest = buildManifest();
    // Deviation centered near the 0.08 edge with enough spread that the CI
    // straddles it (upper bound exceeds 0.08 even though the point estimate
    // is close to the boundary) — not a clean miss, an edge-crossing one.
    const observations = buildRecoveryObservations({
      "fx-a": [0.85, 0.95, 0.8, 0.9], // mean ≈0.875, full fx-a mean ≈0.9925 → deviation ≈0.1175, wide spread
      "fx-b": [0.87, 0.97, 0.82, 0.92], // mean ≈0.895, full fx-b mean ≈0.9875 → deviation ≈0.0925, wide spread
    });
    const report = analyzePreregWithCI(manifest, observations, { seed: 5, bootstrapIterations: 2000 });
    expect(report.recovery.outcome).toBe("not_met");
    const straddles = report.recovery.per_fixture.some((f) => f.ci.lower < 0.08 && f.ci.upper > 0.08);
    expect(straddles).toBe(true);
    expect(report.all_met).toBe(false);
  });
});

describe("analyzePreregWithCI — validation", () => {
  it("rejects a duplicate (zone,effort,fixture,rep) row", () => {
    const manifest = buildManifest();
    const dup = [obs("full", "fx-a", 1, [1.0]), obs("full", "fx-a", 1, [0.9])];
    expect(() => analyzePreregWithCI(manifest, dup, { seed: 1 })).toThrow(/duplicate/);
  });

  it("rejects a draw score outside [0,1]", () => {
    const manifest = buildManifest();
    const bad = [obs("full", "fx-a", 1, [1.2])];
    expect(() => analyzePreregWithCI(manifest, bad, { seed: 1 })).toThrow(/\[0,1\]/);
  });

  it("rejects a non-positive-integer rep and an empty draw_scores array", () => {
    const manifest = buildManifest();
    expect(() =>
      analyzePreregWithCI(manifest, [obs("full", "fx-a", 0, [1.0])], { seed: 1 }),
    ).toThrow(/positive integer/);
    expect(() =>
      analyzePreregWithCI(manifest, [obs("full", "fx-a", 1, [])], { seed: 1 }),
    ).toThrow(/non-empty/);
  });

  it("rejects a manifest whose analysis.ci is not the registered rule this analyzer implements", () => {
    const manifest = buildManifest((m) => {
      (m.analysis as Record<string, unknown>).ci = "pooled-naive";
    });
    expect(() => analyzePreregWithCI(manifest, [obs("full", "fx-a", 1, [1.0])], { seed: 1 })).toThrow(
      /cluster-bootstrap-by-review/,
    );
  });

  it("rejects a manifest whose multiplicity rule is not the implemented conjunction (B5/C2)", () => {
    const manifest = buildManifest((m) => {
      (m.analysis as Record<string, unknown>).multiplicity = "bonferroni";
    });
    expect(() =>
      analyzePreregWithCI(manifest, [obs("full", "fx-a", 1, [1.0])], { seed: 1 }),
    ).toThrow(/all-registered-contrasts-must-hold/);
  });

  it("rejects observations whose K differs from the registered judge_runs (B3/C1)", () => {
    const k8 = buildManifest((m) => {
      (m.cluster as Record<string, unknown>).judge_runs = 8;
    });
    expect(() =>
      analyzePreregWithCI(k8, [obs("full", "fx-a", 1, [1.0])], { seed: 1 }),
    ).toThrow(/judge_runs=8/);
    const k1 = buildManifest();
    expect(() =>
      analyzePreregWithCI(k1, [obs("full", "fx-a", 1, [1.0, 0.9])], { seed: 1 }),
    ).toThrow(/judge_runs=1/);
  });

  it("rejects a degenerate bootstrap (iterations below the floor) and out-of-range alpha (B2)", () => {
    const manifest = buildManifest();
    expect(() =>
      analyzePreregWithCI(manifest, [obs("full", "fx-a", 1, [1.0])], { seed: 1, bootstrapIterations: 1 }),
    ).toThrow(/>= 1000/);
    expect(() =>
      analyzePreregWithCI(manifest, [obs("full", "fx-a", 1, [1.0])], { seed: 1, alpha: 0.9 }),
    ).toThrow(/alpha/);
  });

  it("rejects observations naming a fixture outside the registered cohort (B4)", () => {
    const manifest = buildManifest();
    expect(() =>
      analyzePreregWithCI(manifest, [obs("full", "fx-ghost", 1, [1.0])], { seed: 1 }),
    ).toThrow(/outside the registered cohort/);
  });
});

describe("analyzePreregWithCI — selective attrition of a registered fixture (B4)", () => {
  it("two strong surviving fixtures cannot certify a three-fixture registration", () => {
    // fx-c is registered but its data is gone. The survivors show a strong
    // effect and satisfy min_fixtures_per_level=2 — evaluating them anyway
    // would be the outcome-based selection R2-6 bans.
    const manifest = buildManifest((m) => {
      m.fixtures = ["fx-a", "fx-b", "fx-c"];
    });
    const observations: BenchReviewObservation[] = [];
    for (const fixture of ["fx-a", "fx-b"]) {
      for (let rep = 1; rep <= 4; rep++) {
        observations.push(obs("full", fixture, rep, [0.99]));
        observations.push(obs("partial", fixture, rep, [0.55]));
        observations.push(obs("full-restored", fixture, rep, [0.99]));
      }
    }
    const report = analyzePreregWithCI(manifest, observations, { seed: 11 });
    expect(report.contrasts[0]!.outcome).toBe("not_evaluable");
    expect(report.contrasts[0]!.reason).toMatch(/attrition/);
    expect(report.contrasts[0]!.underpowered.map((u) => u.fixture)).toContain("fx-c");
    expect(report.recovery.outcome).toBe("not_evaluable");
    expect(report.all_met).toBe(false);
  });
});
