import { describe, expect, it } from "vitest";
import {
  deriveReconstructTag,
  ingestReconstructReport,
  ingestReviewReport,
  reconstructRunRouteIdentity,
  reviewRunRouteIdentity,
  summarizeDerivedRoutes,
  type ReconstructBenchmarkReport,
  type ReviewBenchmarkReport,
} from "./effort-calibration-ingest.js";
import {
  witnessedReconstructRouteIdentity,
  type RouteIdentity,
} from "./route-identity.js";
import type { SemanticQualityGateResult } from "./review/semantic-quality-gate.js";
import type { ReconstructQualityGateResult } from "./reconstruct/semantic-quality-gate.js";

const reviewGate = (
  status: SemanticQualityGateResult["status"],
  checks: Array<"passed" | "failed">,
): SemanticQualityGateResult => ({
  status,
  fixture_id: "review-pipeline-target-v1",
  scope: "fixture_specific",
  fixture_target_anchor: "anchor",
  applicability: "real_model_only",
  checks: checks.map((s) => ({ check_id: "grounding" as const, status: s, evidence: [] })),
});

const reconGate = (
  status: ReconstructQualityGateResult["status"],
  metrics?: { recall: number; supportRate: number; authored: number; dropped: number },
): ReconstructQualityGateResult => ({
  status,
  fixture_id: "reconstruct-golden-target-v1",
  scope: "fixture_specific",
  realization: "live",
  source_field_rejections: [],
  q1: metrics
    ? { expected_count: 4, matched_count: 4, recall: metrics.recall, missing_concept_keys: [], matches: [] }
    : null,
  q2: metrics
    ? { population: 4, supported_count: 4, support_rate: metrics.supportRate, rows: [] }
    : null,
  q3: metrics
    ? {
        authored_question_count: metrics.authored,
        assessed_question_count: metrics.authored - metrics.dropped,
        dropped_question_count: metrics.dropped,
        dropped_question_ids: [],
        batch_count: null,
      }
    : null,
});

describe("ingestReviewReport", () => {
  const report: ReviewBenchmarkReport = {
    runs: [
      {
        case_id: "unit-sweep-base-medium",
        base_effort: "medium",
        semantic_quality_gate: reviewGate("passed", ["passed", "passed"]),
      },
      {
        case_id: "unit-sweep-lens-high",
        varied_unit_id: "lens",
        varied_effort: "high",
        base_effort: "medium",
        semantic_quality_gate: reviewGate("passed", ["passed", "passed"]),
      },
      // failed run at a point that ALSO has a completed run → kept as unjudged.
      {
        case_id: "unit-sweep-lens-high",
        varied_unit_id: "lens",
        varied_effort: "high",
        base_effort: "medium",
      },
      {
        case_id: "unit-sweep-teamlead-low",
        varied_unit_id: "teamlead",
        varied_effort: "low",
        base_effort: "medium",
        semantic_quality_gate: reviewGate("failed", ["passed", "failed"]),
      },
      // failed candidate run: no gate → unjudged, still attributed to its point.
      { case_id: "unit-sweep-lens-xhigh", varied_unit_id: "lens", varied_effort: "xhigh", base_effort: "medium" },
      // non-unit-sweep case sharing base_effort: must NOT be attributed as a baseline.
      {
        case_id: "all-high",
        base_effort: "medium",
        semantic_quality_gate: reviewGate("failed", ["failed", "failed"]),
      },
    ],
  };

  it("attributes the baseline run to every swept unit at base_effort", () => {
    const runs = ingestReviewReport(report);
    const lensBase = runs.find((r) => r.stage === "lens" && r.effort === "medium")!;
    const teamleadBase = runs.find((r) => r.stage === "teamlead" && r.effort === "medium")!;
    expect(lensBase.gate).toEqual({ passed: true, qualityScore: 1 });
    expect(teamleadBase.gate).toEqual({ passed: true, qualityScore: 1 });
    // Cost is deferred to P4b, so ingestion attributes no per-stage cost.
    expect(lensBase.cost).toBeUndefined();
    expect(teamleadBase.cost).toBeUndefined();
  });

  it("maps candidate runs and counts failures only at a completed point", () => {
    const runs = ingestReviewReport(report);
    expect(runs.find((r) => r.stage === "teamlead" && r.effort === "low")!.gate).toEqual({
      passed: false,
      qualityScore: 0.5,
    });
    // lens@high has a completed run, so the failed lens@high run is kept unjudged.
    const lensHigh = runs.filter((r) => r.stage === "lens" && r.effort === "high");
    expect(lensHigh).toHaveLength(2);
    expect(lensHigh.some((r) => r.gate.passed === true)).toBe(true);
    expect(lensHigh.some((r) => r.gate.passed === null)).toBe(true);
    // lens@xhigh is failed-only (no completed run) → excluded; failures alone
    // cannot stamp a point/route.
    expect(runs.filter((r) => r.stage === "lens" && r.effort === "xhigh")).toHaveLength(0);
  });

  it("does not treat a non-unit-sweep case as a baseline", () => {
    const runs = ingestReviewReport(report);
    // The all-units-high case shares base_effort=medium but its failing gate
    // must not contaminate the per-unit medium baseline (which passed).
    const lensMedium = runs.filter((r) => r.stage === "lens" && r.effort === "medium");
    expect(lensMedium).toHaveLength(1);
    expect(lensMedium[0]!.gate).toEqual({ passed: true, qualityScore: 1 });
  });

  it("throws when candidates exist but no unit-sweep baseline is present", () => {
    const candidateOnly: ReviewBenchmarkReport = {
      runs: [
        {
          case_id: "unit-sweep-lens-high",
          varied_unit_id: "lens",
          varied_effort: "high",
          base_effort: "medium",
          semantic_quality_gate: reviewGate("passed", ["passed"]),
        },
      ],
    };
    expect(() => ingestReviewReport(candidateOnly)).toThrow(/no unit-sweep baseline/);
  });
});

describe("deriveReconstructTag", () => {
  it("marks a judge-override report as judge stage at the override effort", () => {
    expect(
      deriveReconstructTag({ requested_judge_override: { effort: "high" }, runs: [] }),
    ).toEqual({ stage: "judge", effort: "high" });
  });

  it("uses the pinned author effort, falling back to telemetry applied_effort", () => {
    expect(deriveReconstructTag({ requested_effort: "medium", runs: [] })).toEqual({
      stage: "author",
      effort: "medium",
    });
    expect(
      deriveReconstructTag({
        requested_effort: null,
        runs: [{ quality_gate: reconGate("passed"), metadata: { applied_effort: "xhigh" } }],
      }),
    ).toEqual({ stage: "author", effort: "xhigh" });
  });

  it("returns null when no effort can be attributed", () => {
    expect(deriveReconstructTag({ runs: [{ quality_gate: reconGate("passed") }] })).toBeNull();
  });

  it("does not treat a judge-model-only override as an author-effort point", () => {
    // Only the judge MODEL was swapped (no judge effort) → not an effort point;
    // must not fall through to the pinned author effort.
    expect(
      deriveReconstructTag({
        requested_effort: "high",
        requested_judge_override: { effort: null, model: "gpt-5.5" },
        runs: [{ quality_gate: reconGate("passed"), metadata: { applied_effort: "high" } }],
      }),
    ).toBeNull();
  });
});

describe("ingestReconstructReport", () => {
  it("distills completed runs at the derived author point", () => {
    const report: ReconstructBenchmarkReport = {
      requested_effort: "high",
      runs: [
        {
          quality_gate: reconGate("passed", { recall: 1, supportRate: 1, authored: 4, dropped: 0 }),
          metadata: { applied_effort: "high" },
        },
      ],
    };
    expect(ingestReconstructReport(report)).toEqual([
      { stage: "author", effort: "high", gate: { passed: true, qualityScore: 1 } },
    ]);
  });

  it("distills a judge report when the judge ran at that effort", () => {
    const report: ReconstructBenchmarkReport = {
      requested_judge_override: { effort: "high" },
      runs: [
        {
          quality_gate: reconGate("failed", { recall: 0.5, supportRate: 0.5, authored: 4, dropped: 0 }),
          units: [{ step_id: "answer_support_judgment", effort: "high", llm_call_count: 1 }],
        },
      ],
    };
    const runs = ingestReconstructReport(report);
    expect(runs[0]!.stage).toBe("judge");
    expect(runs[0]!.effort).toBe("high");
    expect(runs[0]!.gate.passed).toBe(false);
    expect(runs[0]!.gate.qualityScore).toBeCloseTo((0.5 + 0.5 + 1) / 3);
  });

  it("excludes a judge run where the judge did not actually run at that effort", () => {
    const report: ReconstructBenchmarkReport = {
      requested_judge_override: { effort: "high" },
      runs: [
        // judge early-exited: no answer_support_judgment telemetry at high.
        { quality_gate: reconGate("passed", { recall: 1, supportRate: 1, authored: 4, dropped: 0 }), units: [] },
        // judge ran but at a different (inherited) effort → not a high sample.
        {
          quality_gate: reconGate("passed", { recall: 1, supportRate: 1, authored: 4, dropped: 0 }),
          units: [{ step_id: "answer_support_judgment", effort: "medium", llm_call_count: 1 }],
        },
      ],
    };
    expect(ingestReconstructReport(report)).toHaveLength(0);
  });

  it("emits failed runs as unjudged non-passing points for the author stage", () => {
    const report: ReconstructBenchmarkReport = {
      requested_effort: "low",
      runs: [
        {
          quality_gate: reconGate("passed", { recall: 1, supportRate: 1, authored: 4, dropped: 0 }),
          metadata: { applied_effort: "low" },
        },
      ],
      reconstruct_extension: { failed_runs: [{}, {}] },
    };
    const runs = ingestReconstructReport(report);
    expect(runs).toHaveLength(3);
    expect(runs.filter((r) => r.gate.passed === null)).toHaveLength(2);
    expect(runs.every((r) => r.stage === "author" && r.effort === "low")).toBe(true);
  });

  it("does not attribute failed runs when no completed run was retained", () => {
    // All attempts failed → no completed telemetry proves the route/effort, so
    // the failures are not turned into samples (would persist a phantom point).
    const report: ReconstructBenchmarkReport = {
      requested_effort: "high",
      runs: [],
      reconstruct_extension: { failed_runs: [{}, {}, {}] },
    };
    expect(ingestReconstructReport(report)).toHaveLength(0);
  });

  it("excludes an author run whose applied effort does not match the requested pin", () => {
    // The route ignored the pin / recovery de-escalated: requested high, applied
    // medium → not a high-effort sample, and there's no failed-run fallback here.
    const report: ReconstructBenchmarkReport = {
      requested_effort: "high",
      runs: [
        {
          quality_gate: reconGate("passed", { recall: 1, supportRate: 1, authored: 4, dropped: 0 }),
          metadata: { applied_effort: "medium" },
        },
      ],
    };
    expect(ingestReconstructReport(report)).toHaveLength(0);
  });

  it("honors an explicit tag over derivation", () => {
    const report: ReconstructBenchmarkReport = {
      requested_effort: "high",
      runs: [
        {
          quality_gate: reconGate("passed", { recall: 1, supportRate: 1, authored: 4, dropped: 0 }),
          units: [{ step_id: "answer_support_judgment", effort: "max", llm_call_count: 1 }],
        },
      ],
    };
    const runs = ingestReconstructReport(report, { stage: "judge", effort: "max" });
    expect(runs[0]!.stage).toBe("judge");
    expect(runs[0]!.effort).toBe("max");
  });

  it("throws when the report pins no effort and no tag is given", () => {
    expect(() =>
      ingestReconstructReport({ runs: [{ quality_gate: reconGate("passed") }] }),
    ).toThrow(/pins no effort/);
  });
});

describe("reconstructRunRouteIdentity", () => {
  const witnessed: RouteIdentity = witnessedReconstructRouteIdentity({
    provider: "anthropic",
    executionAdapter: "claude_code",
    declaredBillingMode: "subscription",
    effectiveBaseUrl: "claude-cli://oauth",
  });

  it("returns the harness-surfaced witnessed route_identity as-is", () => {
    const id = reconstructRunRouteIdentity({
      quality_gate: reconGate("passed"),
      metadata: { applied_effort: "high", route_identity: witnessed },
    });
    expect(id).toEqual(witnessed);
    expect(id?.execution_adapter).toBe("claude_code");
    expect(id?.route_completeness).toBe("complete");
  });

  it("degrades a legacy provider-only report to a provider_only identity", () => {
    const id = reconstructRunRouteIdentity({
      quality_gate: reconGate("passed"),
      metadata: { applied_effort: "high", provider_route: "anthropic" },
    });
    expect(id?.execution_adapter).toBeNull();
    expect(id?.model_provider).toBe("anthropic");
    expect(id?.route_completeness).toBe("provider_only");
    expect(id?.route_provenance).toBe("witnessed");
  });

  it("returns null when a run carries no route evidence", () => {
    expect(
      reconstructRunRouteIdentity({
        quality_gate: reconGate("passed"),
        metadata: { applied_effort: "high" },
      }),
    ).toBeNull();
    expect(reconstructRunRouteIdentity({ quality_gate: reconGate("passed") })).toBeNull();
  });
});

describe("reviewRunRouteIdentity", () => {
  it("derives a profile_derived identity from the rich runtime_route", () => {
    const id = reviewRunRouteIdentity({
      review_profile: {
        runtime_route: {
          execution_adapter: "claude_code",
          model_provider: "anthropic",
          billing_mode: "subscription",
          artifact_generation_realization: "real_model",
        },
      },
    });
    expect(id?.route_provenance).toBe("profile_derived");
    expect(id?.execution_adapter).toBe("claude_code");
    expect(id?.model_provider).toBe("anthropic");
    expect(id?.route_completeness).toBe("complete");
    expect(id?.realization).toBe("real_model");
  });

  it("degrades a legacy provider-only review report symmetrically with reconstruct", () => {
    // Only the legacy runtime_provider token is present (no model_provider) →
    // recover the brand and degrade to provider_only, not under_determined.
    const id = reviewRunRouteIdentity({
      review_profile: { runtime_route: { runtime_provider: "anthropic" } },
    });
    expect(id?.model_provider).toBe("anthropic");
    expect(id?.execution_adapter).toBeNull();
    expect(id?.route_completeness).toBe("provider_only");
    expect(id?.route_provenance).toBe("profile_derived");
  });

  it("returns null when a run carries no route projection", () => {
    expect(reviewRunRouteIdentity({})).toBeNull();
    expect(reviewRunRouteIdentity({ review_profile: {} })).toBeNull();
  });
});

describe("summarizeDerivedRoutes", () => {
  const sdk = witnessedReconstructRouteIdentity({
    provider: "anthropic",
    executionAdapter: "anthropic_sdk",
    declaredBillingMode: "per_token",
    effectiveBaseUrl: "https://api.anthropic.com",
  });
  const oauth = witnessedReconstructRouteIdentity({
    provider: "anthropic",
    executionAdapter: "claude_code",
    declaredBillingMode: "subscription",
    effectiveBaseUrl: "claude-cli://oauth",
  });
  const legacy = witnessedReconstructRouteIdentity({
    provider: "anthropic",
    executionAdapter: null,
    declaredBillingMode: null,
    effectiveBaseUrl: null,
  });

  it("dedups identities by routeToken and corroborates a provider-level hint", () => {
    const summary = summarizeDerivedRoutes([sdk, sdk, null], "anthropic");
    expect(summary.identities).toHaveLength(1);
    expect(summary.completeness).toBe("complete");
    expect(summary.hintCorroborated).toBe(true);
  });

  it("keeps distinct routes and takes the worst completeness", () => {
    const summary = summarizeDerivedRoutes([sdk, oauth, legacy], "anthropic");
    expect(summary.identities).toHaveLength(3);
    // sdk + oauth are complete but legacy is provider_only → worst wins.
    expect(summary.completeness).toBe("provider_only");
  });

  it("flags an uncorroborated declared hint without throwing", () => {
    const summary = summarizeDerivedRoutes([sdk], "openai");
    expect(summary.hintCorroborated).toBe(false);
    expect(summary.tokens).toEqual([expect.stringContaining("anthropic")]);
  });

  it("reports under_determined and no corroboration when no route evidence exists", () => {
    const summary = summarizeDerivedRoutes([null, null], "anthropic");
    expect(summary.identities).toHaveLength(0);
    expect(summary.completeness).toBe("under_determined");
    expect(summary.hintCorroborated).toBe(false);
  });
});
