import { describe, expect, it } from "vitest";
import {
  assembleReviewCertRecord,
  projectReviewCertWitness,
  type ReviewCertArmDeclaration,
  reviewCertWitnessGuardViolations,
} from "./review-cert-assemble.js";
import {
  REVIEW_CERT_ARMS,
  type ReviewCertRun,
  validateReviewCertRecord,
} from "./review-cert-record.js";
import { SEMANTIC_QUALITY_GATE_CHECK_IDS } from "../review/semantic-quality-gate.js";

function codexLine(model: string, effort?: string): unknown {
  return {
    argv: [
      "exec",
      "--skip-git-repo-check",
      "-m",
      model,
      ...(effort !== undefined ? ["-c", `model_reasoning_effort="${effort}"`] : []),
      "-c",
      'service_tier="fast"',
      "-",
    ],
  };
}

const DECLARED: Record<string, ReviewCertArmDeclaration> = {
  baseline: { provider: "openai", model: "gpt-5.5", reasoning_effort: "medium" },
  candidate: { provider: "openai", model: "gpt-5.6-sol", reasoning_effort: "high" },
};

function cleanCapture(): Record<
  (typeof REVIEW_CERT_ARMS)[number],
  readonly unknown[]
> {
  return {
    baseline: [codexLine("gpt-5.5", "medium"), codexLine("gpt-5.5", "medium")],
    candidate: [codexLine("gpt-5.6-sol", "high"), codexLine("gpt-5.6-sol", "high")],
  };
}

describe("projectReviewCertWitness", () => {
  it("projects a clean per-arm witness from shim argv lines", () => {
    const projection = projectReviewCertWitness(cleanCapture());
    expect(projection.violations).toEqual([]);
    expect(projection.witnessed).toEqual({
      baseline: { model: "gpt-5.5", reasoning_effort: "medium", invocation_count: 2 },
      candidate: { model: "gpt-5.6-sol", reasoning_effort: "high", invocation_count: 2 },
    });
  });

  it("fails loud on an empty arm, a model-less argv, and an in-arm mix", () => {
    const empty = projectReviewCertWitness({ ...cleanCapture(), candidate: [] });
    expect(empty.witnessed).toBeNull();
    expect(empty.violations.join("\n")).toMatch(/candidate: no captured/);

    const modelless = projectReviewCertWitness({
      ...cleanCapture(),
      baseline: [{ argv: ["exec", "-c", 'model_reasoning_effort="medium"'] }],
    });
    expect(modelless.witnessed).toBeNull();
    expect(modelless.violations.join("\n")).toMatch(/no -m\/--model/);

    const mixed = projectReviewCertWitness({
      ...cleanCapture(),
      candidate: [codexLine("gpt-5.6-sol", "high"), codexLine("gpt-5.6-sol", "low")],
    });
    expect(mixed.witnessed).toBeNull();
    expect(mixed.violations.join("\n")).toMatch(/inconsistent dispatch/);
  });
});

describe("reviewCertWitnessGuardViolations", () => {
  const witnessedClean = {
    baseline: { model: "gpt-5.5", reasoning_effort: "medium", invocation_count: 2 },
    candidate: { model: "gpt-5.6-sol", reasoning_effort: "high", invocation_count: 2 },
  };

  it("passes when the declaration matches the witness", () => {
    expect(
      reviewCertWitnessGuardViolations({
        declared: DECLARED as never,
        witnessed: witnessedClean,
      }),
    ).toEqual([]);
  });

  it("rejects model and effort divergence, and a knobless openai arm", () => {
    const wrongModel = reviewCertWitnessGuardViolations({
      declared: DECLARED as never,
      witnessed: {
        ...witnessedClean,
        candidate: { ...witnessedClean.candidate, model: "gpt-5.5" },
      },
    });
    expect(wrongModel.join("\n")).toMatch(/declared model=gpt-5.6-sol but the workers dispatched gpt-5.5/);

    const wrongEffort = reviewCertWitnessGuardViolations({
      declared: DECLARED as never,
      witnessed: {
        ...witnessedClean,
        candidate: { ...witnessedClean.candidate, reasoning_effort: "low" },
      },
    });
    expect(wrongEffort.join("\n")).toMatch(/declared reasoning_effort=high but witnessed low/);

    const knobless = reviewCertWitnessGuardViolations({
      declared: {
        ...DECLARED,
        candidate: { provider: "openai", model: "gpt-5.6-sol" },
      } as never,
      witnessed: {
        ...witnessedClean,
        candidate: { model: "gpt-5.6-sol", invocation_count: 2 },
      },
    });
    expect(knobless.join("\n")).toMatch(/witnessed NO reasoning_effort/);
  });
});

describe("assembleReviewCertRecord", () => {
  const FIXTURES = [
    {
      fixture_id: "review-pipeline-target-v1",
      target_anchor: "src/target.ts",
      content_sha256: "b".repeat(64),
    },
    {
      fixture_id: "retry-policy-target-v1",
      target_anchor: "src/retry.ts",
      content_sha256: "c".repeat(64),
    },
  ];

  function okRuns(): ReviewCertRun[] {
    const runs: ReviewCertRun[] = [];
    for (const arm of REVIEW_CERT_ARMS) {
      for (const fixture of FIXTURES) {
        for (let rep = 1; rep <= 3; rep += 1) {
          runs.push({
            arm,
            fixture_id: fixture.fixture_id,
            rep,
            completion: "ok",
            units_total: 25,
            units_completed: 25,
            checks: SEMANTIC_QUALITY_GATE_CHECK_IDS.map((check_id) => ({
              check_id,
              status: "passed" as const,
            })),
          });
        }
      }
    }
    return runs;
  }

  it("assembles a record that the validator recomputes to zero violations", () => {
    const { record, violations } = assembleReviewCertRecord({
      createdAt: "2026-07-11T00:00:00.000Z",
      declared: DECLARED as never,
      captureLinesByArm: cleanCapture(),
      declaredReps: 3,
      fixtures: FIXTURES,
      runs: okRuns(),
      runControls: { salvage_enabled: false, resubmit_enabled: false },
      issueArtifactsProvided: true,
      reproductionCommand: "npx tsx scripts/review-cert-run.mts --candidate-model gpt-5.6-sol",
    });
    expect(violations).toEqual([]);
    expect(record).not.toBeNull();
    expect(record!.arm_dispatch).toEqual({
      baseline: { reasoning_effort: "medium" },
      candidate: { reasoning_effort: "high" },
    });
    expect(record!.declared_aggregates.quality_pass).toBe(true);
    // The assembled record must survive the SAME recompute G7 runs (and the
    // subject is non-vacuous: 12 runs, 24 aggregate rows).
    expect(record!.runs.length).toBe(12);
    expect(record!.declared_aggregates.per_fixture_check.length).toBe(
      FIXTURES.length * SEMANTIC_QUALITY_GATE_CHECK_IDS.length,
    );
    expect(validateReviewCertRecord(record!)).toEqual([]);
  });

  it("refuses to assemble on a witness/guard violation (no record output)", () => {
    const { record, violations } = assembleReviewCertRecord({
      createdAt: "2026-07-11T00:00:00.000Z",
      declared: DECLARED as never,
      captureLinesByArm: { ...cleanCapture(), candidate: [] },
      declaredReps: 3,
      fixtures: FIXTURES,
      runs: okRuns(),
      runControls: { salvage_enabled: false, resubmit_enabled: false },
      issueArtifactsProvided: true,
      reproductionCommand: "cmd",
    });
    expect(record).toBeNull();
    expect(violations.length).toBeGreaterThan(0);
  });
});
