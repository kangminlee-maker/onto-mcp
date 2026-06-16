/**
 * Review effort-calibration adapter (P2). Turns a review unit-sweep — one run
 * per (swept unit, candidate effort) — into the per-stage EffortSample series
 * the frontier classifier consumes, and assembles the per-model report.
 *
 * Review quality is review-WIDE and fixture-anchored: the unit-sweep varies one
 * LLM unit's effort over a fixed base effort and measures the whole-review
 * semantic quality gate, attributing the result to that unit. So here a "stage"
 * is the swept review unit, the "gate" is the gate's overall pass, and "quality"
 * is the fraction of the 12-check gate that passed (a continuous 0..1 "finding
 * 양·질" proxy). Pure — no live LLM and no IO; the sweep harness (scripts/)
 * supplies the runs and writes the report artifact.
 */

import type { SemanticQualityGateResult } from "./review/semantic-quality-gate.js";
import {
  classifyEffortCalibration,
  type EffortCalibrationReport,
  type EffortCostSummary,
  type EffortSample,
  type FrontierThresholds,
} from "./effort-frontier.js";

/** Calibration gate signal distilled from a full semantic-quality-gate result. */
export interface ReviewRunGateSignal {
  /** true=passed, false=failed, null=not_applicable (no ground truth → unjudged). */
  passed: boolean | null;
  /** Fraction (0..1) of gate checks that passed; null when no checks ran. */
  qualityScore: number | null;
}

/** One review-sweep run: the swept unit at a candidate effort, with its result. */
export interface ReviewSweepRun {
  /** The swept review unit id (becomes the frontier "stage"). */
  stage: string;
  /** The candidate effort applied to the swept unit for this run. */
  effort: string;
  /** Whole-review gate signal for the run. */
  gate: ReviewRunGateSignal;
  /** Swept unit's own cost telemetry for the run (optional; reporting only). */
  cost?: EffortCostSummary;
}

/** Distill the calibration gate signal from a full semantic-quality-gate result. */
export function reviewRunGateSignal(
  gate: SemanticQualityGateResult,
): ReviewRunGateSignal {
  const passed =
    gate.status === "not_applicable" ? null : gate.status === "passed";
  const total = gate.checks.length;
  const qualityScore = total
    ? gate.checks.filter((c) => c.status === "passed").length / total
    : null;
  return { passed, qualityScore };
}

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

const stdev = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

const meanCost = (
  costs: EffortCostSummary[],
): EffortCostSummary | undefined => {
  if (costs.length === 0) return undefined;
  const avg = (
    pick: (c: EffortCostSummary) => number | undefined,
  ): number | undefined => {
    const vals = costs
      .map(pick)
      .filter((v): v is number => typeof v === "number");
    return vals.length ? mean(vals) : undefined;
  };
  const promptChars = avg((c) => c.promptChars);
  const outputChars = avg((c) => c.outputChars);
  const providerTokens = avg((c) => c.providerTokens);
  const durationMs = avg((c) => c.durationMs);
  const out: EffortCostSummary = {};
  if (promptChars !== undefined) out.promptChars = promptChars;
  if (outputChars !== undefined) out.outputChars = outputChars;
  if (providerTokens !== undefined) out.providerTokens = providerTokens;
  if (durationMs !== undefined) out.durationMs = durationMs;
  return out;
};

/**
 * Aggregate review-sweep runs into per-stage EffortSample series, each ordered
 * ascending by `effortOrder` (efforts absent from the order are dropped — no
 * silent reordering). Stages are sorted by id for a deterministic report.
 *
 * not_applicable (unjudged) runs count as NON-passing in gatePassRate: an
 * effort can only clear the quorum if every run produced passing quality
 * evidence, so a bucket that mixes a pass with an unjudged/mock run is
 * downgraded rather than given a free pass (the denominator is the full run
 * count, matching `runs`). Quality is averaged over runs whose gate produced
 * checks.
 */
export function aggregateReviewSweep(
  runs: ReviewSweepRun[],
  effortOrder: string[],
): Array<{ stage: string; samples: EffortSample[] }> {
  const rank = new Map(effortOrder.map((e, i) => [e, i] as const));
  const byStage = new Map<string, Map<string, ReviewSweepRun[]>>();
  for (const r of runs) {
    if (!rank.has(r.effort)) continue; // effort not in canonical order → drop
    let byEffort = byStage.get(r.stage);
    if (!byEffort) {
      byEffort = new Map();
      byStage.set(r.stage, byEffort);
    }
    const list = byEffort.get(r.effort) ?? [];
    list.push(r);
    byEffort.set(r.effort, list);
  }

  const stages = [...byStage.entries()].map(([stage, byEffort]) => {
    const samples: EffortSample[] = [...byEffort.entries()].map(
      ([effort, group]) => {
        // Denominator is the full run count: unjudged (not_applicable) runs are
        // non-passing so missing scored evidence cannot overstate viability.
        const passedRuns = group.filter((r) => r.gate.passed === true).length;
        const gatePassRate = group.length ? passedRuns / group.length : 0;
        const qualities = group
          .map((r) => r.gate.qualityScore)
          .filter((q): q is number => typeof q === "number");
        const cost = meanCost(
          group
            .map((r) => r.cost)
            .filter((c): c is EffortCostSummary => c !== undefined),
        );
        return {
          effort,
          gatePassRate,
          quality: mean(qualities),
          qualityStdev: stdev(qualities),
          runs: group.length,
          ...(cost ? { cost } : {}),
        };
      },
    );
    samples.sort((a, b) => rank.get(a.effort)! - rank.get(b.effort)!);
    return { stage, samples };
  });

  stages.sort((a, b) => (a.stage < b.stage ? -1 : a.stage > b.stage ? 1 : 0));
  return stages;
}

/** Build the per-model review effort-calibration report from sweep runs (pure). */
export function buildReviewCalibrationReport(args: {
  provider: string;
  model: string;
  route: string;
  effortOrder: string[];
  thresholds: FrontierThresholds;
  runs: ReviewSweepRun[];
}): EffortCalibrationReport {
  return classifyEffortCalibration({
    pipeline: "review",
    provider: args.provider,
    model: args.model,
    route: args.route,
    thresholds: args.thresholds,
    stages: aggregateReviewSweep(args.runs, args.effortOrder),
  });
}
