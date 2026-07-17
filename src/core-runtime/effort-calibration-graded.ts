/**
 * Graded effort-calibration adapter + whole-pipeline zone calibration
 * (adaptive-effort design §4-10/§5-1; additive — the 12-check adapter in
 * `effort-calibration-review.ts` and its ingest path stay untouched).
 *
 * Three pieces, all pure:
 *   1. `gradedRunGateSignal` — distills M3 graded metrics (semantic-attribution
 *      seeded-defect recall/precision) into the pipeline-agnostic RunGateSignal
 *      the sweep aggregation consumes. The viable gate is the design's §4-10
 *      predicate: material recall ≥ the ground-truth-anchored cut AND precision
 *      ≥ the floor. Quality (the frontier's plateau scalar) = material recall;
 *      precision acts as a non-inferiority guard inside the gate, not as a
 *      second quality axis.
 *   2. `parseM3BenchRun` — the versioned ingest contract (finding R2-8): one
 *      row per REVIEW repetition of a benchmark cell, carrying
 *      {zone, effort, fixture, rep, metrics, cost}. The M3 harness emits these;
 *      nothing about the existing unit-sweep ingest changes.
 *   3. `buildEffortZoneCalibrationReport` — groups runs per (zone, effort),
 *      reuses `aggregateEffortSweep` + `classifyStageFrontier` (zone is passed
 *      through the aggregation's opaque grouping key and re-projected to
 *      zone-named output — an explicit projection, not a semantic overload),
 *      and stamps the report's decision grade: INV-BENCH-1 (fixtures ≥ 2) plus
 *      the bench-specific R<3 gate (design §4-3, finding R2-7 — m3-compare's
 *      R<2 "directional" label alone is NOT the benchmark's decision bar).
 *      Granularity is pinned to "whole-pipeline" (owner F2): every review seat
 *      runs one effort bundle, so no per-stage attribution is ever claimed.
 *
 * Gate thresholds are REQUIRED inputs (they come from the pre-registration
 * manifest, anchored to ground truth — never calibrated to the observed
 * distribution and never defaulted in code).
 */

import {
  classifyStageFrontier,
  type EffortCostSummary,
  type FrontierThresholds,
  type StageFrontier,
} from "./effort-frontier.js";
import {
  aggregateEffortSweep,
  type EffortSweepRun,
  type RunGateSignal,
} from "./effort-calibration-sweep.js";

// ── 1. graded gate signal ──

export interface GradedGateThresholds {
  /** Material-recall cut for the viable gate (ground-truth anchored). */
  recallCut: number;
  /** Precision floor (non-inferiority guard) for the viable gate. */
  precisionFloor: number;
}

export interface GradedMetrics {
  /** Seeded-defect material recall in [0,1] (M3 attribution judge, pooled). */
  recall_material: number;
  /** Precision in [0,1] — non-attributable surfaced material issues count against it. */
  precision: number;
}

const assertUnit = (value: number, label: string): void => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(
      `effort-calibration-graded: ${label} must be a number in [0,1], got ${JSON.stringify(value)}`,
    );
  }
};

/** Distill graded metrics into the sweep's gate signal (design §4-10). */
export function gradedRunGateSignal(
  metrics: GradedMetrics,
  thresholds: GradedGateThresholds,
): RunGateSignal {
  assertUnit(metrics.recall_material, "metrics.recall_material");
  assertUnit(metrics.precision, "metrics.precision");
  assertUnit(thresholds.recallCut, "thresholds.recallCut");
  assertUnit(thresholds.precisionFloor, "thresholds.precisionFloor");
  return {
    passed:
      metrics.recall_material >= thresholds.recallCut &&
      metrics.precision >= thresholds.precisionFloor,
    qualityScore: metrics.recall_material,
  };
}

// ── 2. versioned ingest contract (R2-8) ──

export const M3_BENCH_RUN_SCHEMA_VERSION = "m3-bench-run/1";

/** One review repetition of a benchmark cell, as the M3 harness emits it. */
export interface M3BenchRun {
  schema_version: typeof M3_BENCH_RUN_SCHEMA_VERSION;
  /** Coverage zone label (e.g. "full" | "partial" | "low"). */
  zone: string;
  /** Whole-pipeline effort bundle applied to every review seat. */
  effort: string;
  fixture: string;
  /** 1-based review repetition index within the (zone, effort, fixture) cell. */
  rep: number;
  metrics: GradedMetrics;
  /** Judge repetitions pooled into `metrics` (provenance; K in the design). */
  judge_runs?: number;
  cost?: EffortCostSummary;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const requireNonEmptyString = (v: unknown, label: string): string => {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(
      `effort-calibration-graded: ${label} must be a non-empty string, got ${JSON.stringify(v)}`,
    );
  }
  return v;
};

/** Parse + validate one ingest row. Fail-loud; never repairs. */
export function parseM3BenchRun(value: unknown): M3BenchRun {
  if (!isRecord(value)) {
    throw new Error(
      `effort-calibration-graded: bench run must be an object, got ${JSON.stringify(value)}`,
    );
  }
  if (value.schema_version !== M3_BENCH_RUN_SCHEMA_VERSION) {
    throw new Error(
      `effort-calibration-graded: unsupported schema_version ${JSON.stringify(value.schema_version)} (expected ${M3_BENCH_RUN_SCHEMA_VERSION})`,
    );
  }
  const zone = requireNonEmptyString(value.zone, "zone");
  const effort = requireNonEmptyString(value.effort, "effort");
  const fixture = requireNonEmptyString(value.fixture, "fixture");
  if (!Number.isInteger(value.rep) || (value.rep as number) < 1) {
    throw new Error(
      `effort-calibration-graded: rep must be a positive integer, got ${JSON.stringify(value.rep)}`,
    );
  }
  if (!isRecord(value.metrics)) {
    throw new Error("effort-calibration-graded: metrics must be an object");
  }
  const recall = value.metrics.recall_material as number;
  const precision = value.metrics.precision as number;
  assertUnit(recall, "metrics.recall_material");
  assertUnit(precision, "metrics.precision");
  if (
    value.judge_runs !== undefined &&
    (!Number.isInteger(value.judge_runs) || (value.judge_runs as number) < 1)
  ) {
    throw new Error(
      `effort-calibration-graded: judge_runs must be a positive integer when present, got ${JSON.stringify(value.judge_runs)}`,
    );
  }
  const run: M3BenchRun = {
    schema_version: M3_BENCH_RUN_SCHEMA_VERSION,
    zone,
    effort,
    fixture,
    rep: value.rep as number,
    metrics: { recall_material: recall, precision },
  };
  if (value.judge_runs !== undefined) run.judge_runs = value.judge_runs as number;
  if (value.cost !== undefined) {
    if (!isRecord(value.cost)) {
      throw new Error("effort-calibration-graded: cost must be an object when present");
    }
    run.cost = value.cost as EffortCostSummary;
  }
  return run;
}

// ── 3. zone calibration report ──

export const EFFORT_ZONE_CALIBRATION_SCHEMA_VERSION = "effort-zone-calibration/1";

/** StageFrontier re-projected to zone vocabulary (explicit projection). */
export interface ZoneFrontier extends Omit<StageFrontier, "stage"> {
  zone: string;
  /** Distinct fixtures that contributed runs to this zone. */
  fixtures: string[];
}

export interface EffortZoneCalibrationReport {
  schema_version: typeof EFFORT_ZONE_CALIBRATION_SCHEMA_VERSION;
  pipeline: "review";
  provider: string;
  model: string;
  /** Owner F2: effort applies as one whole-pipeline bundle — never per stage. */
  granularity: "whole-pipeline";
  gate_thresholds: GradedGateThresholds;
  frontier_thresholds: FrontierThresholds;
  effort_order: string[];
  /**
   * True only when every (zone, effort) bucket has fixtures ≥ 2 (INV-BENCH-1)
   * and every (zone, effort, fixture) cell has reps ≥ 3 (design §4-3 bench
   * gate). False ⇒ PRELIMINARY: frontiers are still reported for inspection
   * but must not be used as a decision basis.
   */
  decision_grade: boolean;
  preliminary_reasons: string[];
  zones: ZoneFrontier[];
}

const MIN_FIXTURES_PER_BUCKET = 2; // INV-BENCH-1
const MIN_REPS_PER_CELL = 3; // design §4-3 (R≥3; m3-compare's R<2 label is not this gate)

/** Build the per-(model, zone) whole-pipeline calibration report (pure). */
export function buildEffortZoneCalibrationReport(args: {
  provider: string;
  model: string;
  gateThresholds: GradedGateThresholds;
  frontierThresholds: FrontierThresholds;
  /** Ascending effort order (cheapest first); runs outside it are dropped by aggregation. */
  effortOrder: string[];
  runs: M3BenchRun[];
}): EffortZoneCalibrationReport {
  // Distill each run and hand the zone through the aggregation's opaque
  // grouping key; re-projected to `zone` below.
  const sweepRuns: EffortSweepRun[] = args.runs.map((r) => ({
    stage: r.zone,
    effort: r.effort,
    gate: gradedRunGateSignal(r.metrics, args.gateThresholds),
    ...(r.cost ? { cost: r.cost } : {}),
  }));
  const aggregated = aggregateEffortSweep(sweepRuns, args.effortOrder);

  // Decision-grade audit over the raw runs (the aggregation collapses
  // fixture/rep structure, so the gate is computed here, not from samples).
  const reasons: string[] = [];
  const buckets = new Map<string, Map<string, Map<string, number>>>(); // zone → effort → fixture → reps
  const rank = new Set(args.effortOrder);
  for (const r of args.runs) {
    if (!rank.has(r.effort)) continue; // matches aggregation's drop semantics
    const byEffort = buckets.get(r.zone) ?? new Map();
    buckets.set(r.zone, byEffort);
    const byFixture = byEffort.get(r.effort) ?? new Map();
    byEffort.set(r.effort, byFixture);
    byFixture.set(r.fixture, (byFixture.get(r.fixture) ?? 0) + 1);
  }
  const zoneFixtures = new Map<string, Set<string>>();
  for (const [zone, byEffort] of [...buckets.entries()].sort()) {
    const fixtures = zoneFixtures.get(zone) ?? new Set<string>();
    zoneFixtures.set(zone, fixtures);
    for (const [effort, byFixture] of [...byEffort.entries()].sort()) {
      for (const f of byFixture.keys()) fixtures.add(f);
      if (byFixture.size < MIN_FIXTURES_PER_BUCKET) {
        reasons.push(
          `(zone=${zone}, effort=${effort}): fixtures=${byFixture.size} < ${MIN_FIXTURES_PER_BUCKET} (INV-BENCH-1)`,
        );
      }
      for (const [fixture, reps] of [...byFixture.entries()].sort()) {
        if (reps < MIN_REPS_PER_CELL) {
          reasons.push(
            `(zone=${zone}, effort=${effort}, fixture=${fixture}): reps=${reps} < ${MIN_REPS_PER_CELL} (design §4-3 R gate)`,
          );
        }
      }
    }
  }

  const zones: ZoneFrontier[] = aggregated.map(({ stage: zone, samples }) => {
    const { stage: _stage, ...frontier } = classifyStageFrontier(
      zone,
      samples,
      args.frontierThresholds,
    );
    return {
      zone,
      fixtures: [...(zoneFixtures.get(zone) ?? [])].sort(),
      ...frontier,
    };
  });

  return {
    schema_version: EFFORT_ZONE_CALIBRATION_SCHEMA_VERSION,
    pipeline: "review",
    provider: args.provider,
    model: args.model,
    granularity: "whole-pipeline",
    gate_thresholds: args.gateThresholds,
    frontier_thresholds: args.frontierThresholds,
    effort_order: args.effortOrder,
    decision_grade: reasons.length === 0,
    preliminary_reasons: reasons,
    zones,
  };
}
