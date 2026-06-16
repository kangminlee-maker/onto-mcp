/**
 * Reconstruct effort-calibration adapter (P3). Distills a reconstruct
 * golden-fixture quality-gate result into the pipeline-agnostic gate signal the
 * sweep aggregator consumes.
 *
 * Reconstruct quality is golden-fixture-anchored and pipeline-WIDE: a sweep run
 * pins one effort knob — the global semantic-author effort (the "author" stage)
 * or the answer-support judge effort (the "judge" stage) — and measures the
 * whole-run golden gate, attributing the result to that stage. The "gate" is the
 * golden gate's overall pass; "quality" is a continuous 0..1 "finding 양·질"
 * proxy synthesized from the gate's three optimization axes:
 *   - Q1 expected-concept recall (양·질 of the authored seed),
 *   - Q2 competency-question support rate, and
 *   - Q3 dropped-question health (fraction of authored questions still assessed;
 *     the runtime batches instead of dropping, so this is normally 1.0).
 * Each axis is a 0..1 health fraction; equal-weight mean keeps the score on the
 * same scale as the review adapter's check-pass fraction. The binary pass/fail
 * stays owned by `passed`; this score only feeds the frontier's plateau search.
 *
 * A run that produced no quality verdict — `rejected` (missing telemetry
 * provenance) or `not_applicable` (mock realization incompatible with the
 * fixture) — yields passed=null and qualityScore=null, mirroring review's
 * unjudged treatment: non-passing in the quorum and contributing no quality.
 *
 * Pure — no live LLM and no IO; aggregation and report assembly live in
 * `effort-calibration-sweep.ts`.
 */

import type { ReconstructQualityGateResult } from "./reconstruct/semantic-quality-gate.js";
import type { RunGateSignal } from "./effort-calibration-sweep.js";

/** Q3 as a 0..1 health fraction: share of authored questions still assessed. */
function q3Health(q3: NonNullable<ReconstructQualityGateResult["q3"]>): number {
  const authored = q3.authored_question_count;
  if (authored <= 0) return 1; // no questions to drop → vacuously healthy
  const kept = authored - q3.dropped_question_count;
  return Math.max(0, Math.min(1, kept / authored));
}

/** Distill the calibration gate signal from a reconstruct golden gate result. */
export function reconstructRunGateSignal(
  gate: ReconstructQualityGateResult,
): RunGateSignal {
  // passed/failed are the only quality verdicts; rejected/not_applicable mean no
  // verdict was produced (provenance reject or mock-incompatible fixture) → null.
  const passed =
    gate.status === "passed" ? true : gate.status === "failed" ? false : null;
  // q1/q2/q3 are populated together (passed/failed) or absent together
  // (rejected/not_applicable); a verdict without metrics leaves quality null.
  const qualityScore =
    gate.q1 && gate.q2 && gate.q3
      ? (gate.q1.recall + gate.q2.support_rate + q3Health(gate.q3)) / 3
      : null;
  return { passed, qualityScore };
}
