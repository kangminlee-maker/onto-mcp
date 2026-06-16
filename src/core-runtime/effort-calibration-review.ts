/**
 * Review effort-calibration adapter (P2). Distills a review unit-sweep run's
 * whole-review semantic quality gate into the pipeline-agnostic gate signal the
 * sweep aggregator consumes.
 *
 * Review quality is review-WIDE and fixture-anchored: the unit-sweep varies one
 * LLM unit's effort over a fixed base effort and measures the whole-review
 * semantic quality gate, attributing the result to that unit. So the swept
 * review unit is the "stage", the "gate" is the gate's overall pass, and
 * "quality" is the fraction of the 12-check gate that passed (a continuous 0..1
 * "finding 양·질" proxy). Pure — no live LLM and no IO; aggregation and report
 * assembly live in `effort-calibration-sweep.ts`.
 */

import type { SemanticQualityGateResult } from "./review/semantic-quality-gate.js";
import type { RunGateSignal } from "./effort-calibration-sweep.js";

/** Distill the calibration gate signal from a full semantic-quality-gate result. */
export function reviewRunGateSignal(
  gate: SemanticQualityGateResult,
): RunGateSignal {
  const passed =
    gate.status === "not_applicable" ? null : gate.status === "passed";
  const total = gate.checks.length;
  const qualityScore = total
    ? gate.checks.filter((c) => c.status === "passed").length / total
    : null;
  return { passed, qualityScore };
}
