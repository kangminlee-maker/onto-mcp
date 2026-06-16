import { describe, expect, it } from "vitest";
import { reviewRunGateSignal } from "./effort-calibration-review.js";
import type { SemanticQualityGateResult } from "./review/semantic-quality-gate.js";

const gate = (
  status: SemanticQualityGateResult["status"],
  checks: Array<"passed" | "failed">,
): SemanticQualityGateResult => ({
  status,
  fixture_id: "review-pipeline-target-v1",
  scope: "fixture_specific",
  fixture_target_anchor: "anchor",
  applicability: "real_model_only",
  checks: checks.map((s) => ({
    check_id: "grounding" as const,
    status: s,
    evidence: [],
  })),
});

describe("reviewRunGateSignal", () => {
  it("maps gate status and the check-pass fraction", () => {
    expect(
      reviewRunGateSignal(gate("passed", ["passed", "passed", "passed", "passed"])),
    ).toEqual({ passed: true, qualityScore: 1 });
    expect(
      reviewRunGateSignal(gate("failed", ["passed", "failed", "passed", "failed"])),
    ).toEqual({ passed: false, qualityScore: 0.5 });
    expect(reviewRunGateSignal(gate("not_applicable", []))).toEqual({
      passed: null,
      qualityScore: null,
    });
    // passed status with no checks → quality indeterminate.
    expect(reviewRunGateSignal(gate("passed", []))).toEqual({
      passed: true,
      qualityScore: null,
    });
  });
});
