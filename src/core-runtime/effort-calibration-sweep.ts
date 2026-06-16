/**
 * Effort-calibration sweep aggregation — pipeline-agnostic.
 *
 * A sweep run is one (swept stage, candidate effort) trial whose result has been
 * distilled to a gate signal by a pipeline-specific adapter (review or
 * reconstruct). This module owns the part that does NOT depend on the pipeline:
 * grouping runs into per-stage per-effort buckets, aggregating each bucket into
 * the `EffortSample` series the frontier classifier consumes, and assembling the
 * per-model report. The pipeline adapters own only the gate-signal distillation
 * (their gate result types differ); the frontier classifier owns the decision.
 *
 * Pure — no live LLM and no IO. The sweep harness (scripts/) supplies the runs
 * and writes the report artifact.
 */

import {
  classifyEffortCalibration,
  type EffortCalibrationReport,
  type EffortCostSummary,
  type EffortSample,
  type FrontierThresholds,
} from "./effort-frontier.js";

/** Calibration gate signal distilled from a pipeline's quality-gate result. */
export interface RunGateSignal {
  /** true=passed, false=failed, null=no verdict produced (unjudged). */
  passed: boolean | null;
  /** Continuous 0..1 "finding 양·질" proxy; null when no verdict was produced. */
  qualityScore: number | null;
}

/** One sweep run: the swept stage at a candidate effort, with its gate signal. */
export interface EffortSweepRun {
  /** The swept stage id (becomes the frontier "stage"). */
  stage: string;
  /** The candidate effort applied for this run. */
  effort: string;
  /** Pipeline-distilled gate signal for the run. */
  gate: RunGateSignal;
  /** Swept stage's own cost telemetry for the run (optional; reporting only). */
  cost?: EffortCostSummary;
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
 * Aggregate sweep runs into per-stage EffortSample series, each ordered
 * ascending by `effortOrder` (efforts absent from the order are dropped — no
 * silent reordering). Stages are sorted by id for a deterministic report.
 *
 * Unjudged (passed === null) runs count as NON-passing in gatePassRate: an
 * effort can only clear the quorum if every run produced a passing verdict, so a
 * bucket that mixes a pass with an unjudged/mock run is downgraded rather than
 * given a free pass (the denominator is the full run count, matching `runs`).
 * Quality is averaged only over runs whose gate produced a score.
 */
export function aggregateEffortSweep(
  runs: EffortSweepRun[],
  effortOrder: string[],
): Array<{ stage: string; samples: EffortSample[] }> {
  const rank = new Map(effortOrder.map((e, i) => [e, i] as const));
  const byStage = new Map<string, Map<string, EffortSweepRun[]>>();
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
        // Denominator is the full run count: unjudged (passed === null) runs are
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

/** Build a per-model effort-calibration report from sweep runs (pure). */
export function buildEffortCalibrationReport(args: {
  /** "review" | "reconstruct". */
  pipeline: string;
  provider: string;
  model: string;
  route: string;
  effortOrder: string[];
  thresholds: FrontierThresholds;
  runs: EffortSweepRun[];
}): EffortCalibrationReport {
  return classifyEffortCalibration({
    pipeline: args.pipeline,
    provider: args.provider,
    model: args.model,
    route: args.route,
    thresholds: args.thresholds,
    stages: aggregateEffortSweep(args.runs, args.effortOrder),
  });
}
