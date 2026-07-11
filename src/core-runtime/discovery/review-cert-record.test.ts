import { describe, expect, it } from "vitest";
import {
  isReviewCertCandidate,
  parseReviewCertRecord,
  REVIEW_CERT_ARMS,
  REVIEW_CERT_CONTRACT,
  REVIEW_CERT_CORE_CHECK_FLOOR,
  type ReviewCertRecord,
  type ReviewCertRun,
  reviewCertBindingViolations,
  validateReviewCertRecord,
} from "./review-cert-record.js";
import { SEMANTIC_QUALITY_GATE_CHECK_IDS } from "../review/semantic-quality-gate.js";

const FIXTURES = ["review-pipeline-target-v1", "retry-policy-target-v1"] as const;
const REPS = 3;
const UNITS_TOTAL = 25;

function fullChecks(failing: readonly string[] = []): ReviewCertRun["checks"] {
  return SEMANTIC_QUALITY_GATE_CHECK_IDS.map((check_id) => ({
    check_id,
    status: failing.includes(check_id) ? "failed" as const : "passed" as const,
  }));
}

function okRun(
  arm: (typeof REVIEW_CERT_ARMS)[number],
  fixtureId: string,
  rep: number,
  failing: readonly string[] = [],
): ReviewCertRun {
  return {
    arm,
    fixture_id: fixtureId,
    rep,
    completion: "ok",
    units_total: UNITS_TOTAL,
    units_completed: UNITS_TOTAL,
    checks: fullChecks(failing),
  };
}

/** All-pass 2-fixture × 3-rep × 2-arm record whose declared aggregates
 * recompute exactly. Tests mutate copies of this to hit each violation. */
function passingRecord(): ReviewCertRecord {
  const runs: ReviewCertRun[] = [];
  for (const arm of REVIEW_CERT_ARMS) {
    for (const fixtureId of FIXTURES) {
      for (let rep = 1; rep <= REPS; rep += 1) {
        runs.push(okRun(arm, fixtureId, rep));
      }
    }
  }
  return {
    record_contract: REVIEW_CERT_CONTRACT,
    created_at: "2026-07-11T00:00:00.000Z",
    provider: "openai",
    model: "gpt-5.6-sol",
    arm_model: {
      baseline: { provider: "openai", model: "gpt-5.5" },
      candidate: { provider: "openai", model: "gpt-5.6-sol" },
    },
    arm_dispatch: {
      baseline: { reasoning_effort: "medium" },
      candidate: { reasoning_effort: "high" },
    },
    declared_reps: REPS,
    fixtures: FIXTURES.map((fixture_id) => ({
      fixture_id,
      target_anchor: `src/${fixture_id}.ts`,
      content_sha256: "a".repeat(64),
    })),
    gate_pin: {
      check_universe: [...SEMANTIC_QUALITY_GATE_CHECK_IDS],
      issue_artifacts_provided: true,
    },
    run_controls: { salvage_enabled: false, resubmit_enabled: false },
    runs,
    declared_aggregates: {
      per_fixture_check: FIXTURES.flatMap((fixture_id) =>
        SEMANTIC_QUALITY_GATE_CHECK_IDS.map((check_id) => ({
          fixture_id,
          check_id,
          baseline_pass_rate: 1,
          candidate_pass_rate: 1,
        }))
      ),
      core_check_floor: REVIEW_CERT_CORE_CHECK_FLOOR,
      quality_pass: true,
    },
    reproduction: { command: "npx tsx scripts/review-cert-run.mts" },
  };
}

function clone(record: ReviewCertRecord): ReviewCertRecord {
  return structuredClone(record);
}

/** Recompute the declared per-fixture-check aggregates from the runs so a test
 * that mutates run outcomes stays aggregate-consistent (isolating the clause
 * under test from aggregate_mismatch noise). */
function redeclareAggregates(record: ReviewCertRecord): void {
  record.declared_aggregates.per_fixture_check = record.fixtures.flatMap(
    (fixture) =>
      SEMANTIC_QUALITY_GATE_CHECK_IDS.map((check_id) => {
        const rate = (arm: string): number => {
          const completed = record.runs.filter(
            (run) =>
              run.arm === arm && run.fixture_id === fixture.fixture_id &&
              run.completion === "ok",
          );
          const passed = completed.filter((run) =>
            run.checks.some(
              (check) => check.check_id === check_id && check.status === "passed",
            )
          ).length;
          return completed.length === 0 ? 0 : passed / completed.length;
        };
        return {
          fixture_id: fixture.fixture_id,
          check_id,
          baseline_pass_rate: rate("baseline"),
          candidate_pass_rate: rate("candidate"),
        };
      }),
  );
}

function codes(violations: { code: string }[]): string[] {
  return [...new Set(violations.map((violation) => violation.code))];
}

describe("review-cert record recompute", () => {
  it("recomputes a passing record to zero violations (non-vacuous fixture)", () => {
    const record = passingRecord();
    expect(record.runs.length).toBe(REVIEW_CERT_ARMS.length * FIXTURES.length * REPS);
    expect(validateReviewCertRecord(record)).toEqual([]);
  });

  it("rejects a below-floor declared_reps and fixture count", () => {
    const record = clone(passingRecord());
    record.declared_reps = 2;
    expect(codes(validateReviewCertRecord(record))).toContain("declared_reps_floor");

    const single = clone(passingRecord());
    single.fixtures = [single.fixtures[0]!];
    single.runs = single.runs.filter((run) => run.fixture_id === FIXTURES[0]);
    redeclareAggregates(single);
    expect(codes(validateReviewCertRecord(single))).toContain("fixture_floor");
  });

  it("rejects unpinned rescue channels (salvage/resubmit)", () => {
    const record = clone(passingRecord());
    record.run_controls.salvage_enabled = true;
    expect(codes(validateReviewCertRecord(record)))
      .toContain("rescue_channel_not_pinned");
  });

  it("rejects a shrunken check-universe pin and an artifacts-less gate", () => {
    const record = clone(passingRecord());
    record.gate_pin.check_universe = record.gate_pin.check_universe.slice(0, 7);
    expect(codes(validateReviewCertRecord(record)))
      .toContain("check_universe_mismatch");

    const noArtifacts = clone(passingRecord());
    noArtifacts.gate_pin.issue_artifacts_provided = false;
    expect(codes(validateReviewCertRecord(noArtifacts)))
      .toContain("check_universe_mismatch");
  });

  it("rejects a completed run that emitted a partial check universe", () => {
    const record = clone(passingRecord());
    record.runs[0]!.checks = record.runs[0]!.checks.slice(0, 11);
    redeclareAggregates(record);
    expect(codes(validateReviewCertRecord(record)))
      .toContain("check_emission_incomplete");
  });

  it("does not count not_run rows toward the rep floor (honest transport loss)", () => {
    const record = clone(passingRecord());
    const lost = record.runs.find(
      (run) => run.arm === "candidate" && run.fixture_id === FIXTURES[0],
    )!;
    lost.completion = "not_run";
    lost.units_completed = 3;
    lost.checks = [];
    redeclareAggregates(record);
    const found = validateReviewCertRecord(record);
    expect(codes(found)).toContain("rep_floor");
    expect(found.some((violation) => violation.subject_id === `candidate/${FIXTURES[0]}`))
      .toBe(true);
  });

  it("rejects a partial run claiming completion=ok", () => {
    const record = clone(passingRecord());
    record.runs[0]!.units_completed = UNITS_TOTAL - 1;
    expect(codes(validateReviewCertRecord(record))).toContain("units_incomplete");
  });

  it("rejects duplicate run coordinates and out-of-manifest fixtures", () => {
    const record = clone(passingRecord());
    record.runs.push({ ...record.runs[0]! });
    expect(codes(validateReviewCertRecord(record))).toContain("duplicate_row");

    const stray = clone(passingRecord());
    stray.runs.push(okRun("candidate", "unlisted-fixture", 9));
    expect(codes(validateReviewCertRecord(stray))).toContain("row_outside_manifest");
  });

  it("rejects a candidate rate below the baseline rate (metric_regression)", () => {
    const record = clone(passingRecord());
    // One candidate rep fails a non-core check on fixture 0 → rate 2/3 < 1.
    const target = record.runs.find(
      (run) => run.arm === "candidate" && run.fixture_id === FIXTURES[0] && run.rep === 1,
    )!;
    target.checks = fullChecks(["actionability"]);
    redeclareAggregates(record);
    const found = validateReviewCertRecord(record);
    expect(codes(found)).toContain("metric_regression");
    expect(codes(found)).not.toContain("core_check_floor");
  });

  it("enforces the absolute core-check floor even when the baseline is flaky", () => {
    const record = clone(passingRecord());
    // Baseline collapses on material_issue_recall (rate 0) — binary parity
    // would waive the check entirely; the absolute floor must still bite when
    // the candidate also drops below it (1/3 < 2/3).
    for (const run of record.runs) {
      if (run.arm === "baseline" && run.fixture_id === FIXTURES[0]) {
        run.checks = fullChecks(["material_issue_recall"]);
      }
    }
    const candidateRuns = record.runs.filter(
      (run) => run.arm === "candidate" && run.fixture_id === FIXTURES[0],
    );
    candidateRuns[0]!.checks = fullChecks(["material_issue_recall"]);
    candidateRuns[1]!.checks = fullChecks(["material_issue_recall"]);
    redeclareAggregates(record);
    record.declared_aggregates.quality_pass = false;
    const found = validateReviewCertRecord(record);
    expect(codes(found)).toContain("core_check_floor");
    // candidate 1/3 >= baseline 0 → no regression; the floor is what bites.
    expect(codes(found)).not.toContain("metric_regression");
  });

  it("rejects declared aggregates that do not recompute", () => {
    const record = clone(passingRecord());
    record.declared_aggregates.per_fixture_check[0]!.candidate_pass_rate = 0.5;
    expect(codes(validateReviewCertRecord(record))).toContain("aggregate_mismatch");

    const wrongVerdict = clone(passingRecord());
    wrongVerdict.declared_aggregates.quality_pass = false;
    expect(codes(validateReviewCertRecord(wrongVerdict)))
      .toContain("aggregate_mismatch");
  });

  it("rejects a candidate arm diverging from the certified identity", () => {
    const record = clone(passingRecord());
    record.arm_model.candidate = { provider: "openai", model: "gpt-5.6-terra" };
    expect(codes(validateReviewCertRecord(record))).toContain("arm_model_mismatch");
  });
});

describe("review-cert binding (G7)", () => {
  const SUPPORTED = new Set(["openai/gpt-5.5", "anthropic/claude-opus-4-8"]);
  const entryFor = (refs: string[]) => ({
    provider: "openai",
    model: "gpt-5.6-sol",
    roles: ["review"] as const,
    benchmark_evidence_refs: refs,
  });

  it("binds an entry to a passing record (existential: failing co-cite tolerated)", () => {
    const failing = clone(passingRecord());
    failing.run_controls.salvage_enabled = true;
    const evidence = new Map<string, unknown>([
      ["records/pass.json", passingRecord()],
      ["records/fail.json", failing],
    ]);
    expect(
      reviewCertBindingViolations({
        entry: entryFor(["records/pass.json", "records/fail.json"]),
        evidenceByRef: evidence,
        supportedModelKeys: SUPPORTED,
      }),
    ).toEqual([]);
  });

  it("rejects an entry with no review-cert record among its refs", () => {
    const violations = reviewCertBindingViolations({
      entry: entryFor(["records/other.json"]),
      evidenceByRef: new Map([["records/other.json", { some: "benchmark" }]]),
      supportedModelKeys: SUPPORTED,
    });
    expect(violations.length).toBe(1);
    expect(violations[0]!.message).toMatch(/cites no review-cert\/v1 record/);
  });

  it("rejects a record certifying a different model than the citing entry", () => {
    const other = clone(passingRecord());
    other.provider = "openai";
    other.model = "gpt-5.6-terra";
    other.arm_model.candidate = { provider: "openai", model: "gpt-5.6-terra" };
    const violations = reviewCertBindingViolations({
      entry: entryFor(["records/other-model.json"]),
      evidenceByRef: new Map([["records/other-model.json", other]]),
      supportedModelKeys: SUPPORTED,
    });
    expect(codes(violations)).toContain("aggregate_mismatch");
  });

  it("rejects a self-baseline and an unanchored baseline", () => {
    const selfBaseline = clone(passingRecord());
    selfBaseline.arm_model.baseline = { provider: "openai", model: "gpt-5.6-sol" };
    expect(
      codes(reviewCertBindingViolations({
        entry: entryFor(["records/self.json"]),
        evidenceByRef: new Map([["records/self.json", selfBaseline]]),
        supportedModelKeys: SUPPORTED,
      })),
    ).toContain("baseline_is_candidate");

    const unanchored = clone(passingRecord());
    unanchored.arm_model.baseline = { provider: "openai", model: "gpt-4o" };
    expect(
      codes(reviewCertBindingViolations({
        entry: entryFor(["records/unanchored.json"]),
        evidenceByRef: new Map([["records/unanchored.json", unanchored]]),
        supportedModelKeys: SUPPORTED,
      })),
    ).toContain("baseline_not_supported");
  });

  it("ignores entries that do not list the review role", () => {
    expect(
      reviewCertBindingViolations({
        entry: {
          provider: "openai",
          model: "gpt-5.5",
          benchmark_evidence_refs: ["records/none.json"],
        },
        evidenceByRef: new Map(),
        supportedModelKeys: SUPPORTED,
      }),
    ).toEqual([]);
  });
});

describe("review-cert parse", () => {
  it("identifies candidates by record_contract only", () => {
    expect(isReviewCertCandidate({ record_contract: REVIEW_CERT_CONTRACT }))
      .toBe(true);
    expect(isReviewCertCandidate({ record_contract: "synthesize-cert/v1" }))
      .toBe(false);
    expect(isReviewCertCandidate(null)).toBe(false);
  });

  it("reports schema violations without a record", () => {
    const { record, violations } = parseReviewCertRecord({
      record_contract: REVIEW_CERT_CONTRACT,
    });
    expect(record).toBeNull();
    expect(violations.length).toBeGreaterThan(0);
    expect(codes(violations)).toEqual(["schema_shape_invalid"]);
  });
});
