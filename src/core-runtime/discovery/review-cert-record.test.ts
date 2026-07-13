import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  computeReviewCertAggregates,
  isReviewCertCandidate,
  parseReviewCertRecord,
  REVIEW_CERT_ARMS,
  REVIEW_CERT_CONTRACT,
  REVIEW_CERT_CORE_CHECKS,
  REVIEW_CERT_CORE_CHECK_FLOOR,
  type ReviewCertRecord,
  type ReviewCertRun,
  reviewCertBindingViolations,
  reviewCertQualityDisclosures,
  reviewCertResubmitDisclosure,
  validateReviewCertRecord,
} from "./review-cert-record.js";
import {
  CLEAN_TARGET_EXCLUDED_CHECK_IDS,
  SEMANTIC_QUALITY_GATE_CHECK_IDS,
} from "../review/semantic-quality-gate.js";
import { loadSupportedModelRegistry } from "./supported-models.js";

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
    resubmit_applied_unit_count: 0,
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
    run_controls: { salvage_enabled: false, resubmit_enabled: true },
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

  it("discloses a non-core regression without rejecting the record", () => {
    const record = clone(passingRecord());
    // False-positive restraint is useful evidence, but the main context
    // re-verifies surfaced issues before action, so it is not a hard gate.
    const target = record.runs.find(
      (run) => run.arm === "candidate" && run.fixture_id === FIXTURES[0] && run.rep === 1,
    )!;
    target.checks = fullChecks(["false_materiality_guard"]);
    redeclareAggregates(record);
    expect(validateReviewCertRecord(record)).toEqual([]);
    expect(record.declared_aggregates.quality_pass).toBe(true);
    expect(codes(reviewCertQualityDisclosures(record))).toEqual(["metric_regression"]);
  });

  it("requires every completed candidate run to preserve the recall spine", () => {
    const record = clone(passingRecord());
    expect(REVIEW_CERT_CORE_CHECKS).toEqual([
      "material_issue_recall",
      "artifact_material_issue_recall",
      "final_result_material_issue_recall",
      "grounding",
    ]);
    expect(REVIEW_CERT_CORE_CHECK_FLOOR).toBe(1);
    // Even a flaky baseline cannot waive one observed silent candidate miss.
    for (const run of record.runs) {
      if (run.arm === "baseline" && run.fixture_id === FIXTURES[0]) {
        run.checks = fullChecks(["artifact_material_issue_recall"]);
      }
    }
    const candidateRuns = record.runs.filter(
      (run) => run.arm === "candidate" && run.fixture_id === FIXTURES[0],
    );
    candidateRuns[0]!.checks = fullChecks(["artifact_material_issue_recall"]);
    redeclareAggregates(record);
    record.declared_aggregates.quality_pass = false;
    const found = validateReviewCertRecord(record);
    expect(codes(found)).toContain("core_check_floor");
    expect(reviewCertQualityDisclosures(record)).toEqual([]);
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

describe("reviewCertResubmitDisclosure", () => {
  it("separates ok-row usage from not_run firings, per arm, non-vacuously", () => {
    const record = clone(passingRecord());
    // candidate: one ok row used resubmit on 2 units; one not_run row fired 3.
    const candidateRows = record.runs.filter((run) => run.arm === "candidate");
    expect(candidateRows.length).toBeGreaterThan(0); // non-vacuous subject
    candidateRows[0]!.resubmit_applied_unit_count = 2;
    record.runs.push({
      arm: "candidate",
      fixture_id: candidateRows[0]!.fixture_id,
      rep: 99,
      completion: "not_run",
      units_total: 1, // harness placeholder — must NOT pollute the ok denominator
      units_completed: 0,
      resubmit_applied_unit_count: 3,
      checks: [],
    });
    const disclosures = reviewCertResubmitDisclosure(record);
    expect(disclosures.map((d) => d.subject_id).sort()).toEqual(["baseline", "candidate"]);
    const candidate = disclosures.find((d) => d.subject_id === "candidate")!;
    const okUnits = candidateRows.reduce((sum, run) => sum + run.units_total, 0);
    expect(candidate.message).toContain(`resubmit applied on 2/${okUnits} units`);
    expect(candidate.message).toContain("additionally fired 3 unit(s)");
    // zero usage is still a claim, not an omission
    const baseline = disclosures.find((d) => d.subject_id === "baseline")!;
    expect(baseline.message).toContain("resubmit applied on 0/");
    // NEVER part of the blocking recompute
    expect(validateReviewCertRecord(record).map((v) => v.code)).not.toContain("resubmit_usage");
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
    expect(violations[0]!.message).toMatch(/cites no review-cert\/v2 record/);
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

// ─────────────────────────────────────────────────────────────────────────────
// v3 §D2: per-fixture applicable_check_ids propagation. A clean-target fixture
// declares a reduced set (recall/grounding/actionability excluded); emission and
// aggregates must respect it. Existing fixtures declare none → full universe →
// the byte-identical recompute proven by the tests above.
// ─────────────────────────────────────────────────────────────────────────────
describe("review-cert per-fixture applicable set", () => {
  const CLEAN_TARGET = "clean-target-v1";
  const CLEAN_APPLICABLE = SEMANTIC_QUALITY_GATE_CHECK_IDS.filter(
    (id) => !CLEAN_TARGET_EXCLUDED_CHECK_IDS.has(id),
  );

  function checksFor(
    ids: readonly string[],
    failing: readonly string[] = [],
  ): ReviewCertRun["checks"] {
    return ids.map((check_id) => ({
      check_id: check_id as ReviewCertRun["checks"][number]["check_id"],
      status: failing.includes(check_id) ? ("failed" as const) : ("passed" as const),
    }));
  }

  function okRunWith(
    arm: (typeof REVIEW_CERT_ARMS)[number],
    fixtureId: string,
    rep: number,
    checkIds: readonly string[],
  ): ReviewCertRun {
    return {
      arm,
      fixture_id: fixtureId,
      rep,
      completion: "ok",
      units_total: 25,
      units_completed: 25,
      resubmit_applied_unit_count: 0,
      checks: checksFor(checkIds),
    };
  }

  /** review-pipeline (full 12, carries the core floor) + clean-target (reduced
   * 7, no core checks). All-pass; aggregates declared to match. */
  function mixedRecord(): ReviewCertRecord {
    const full = [...SEMANTIC_QUALITY_GATE_CHECK_IDS];
    const runs: ReviewCertRun[] = [];
    for (const arm of REVIEW_CERT_ARMS) {
      for (let rep = 1; rep <= 3; rep += 1) {
        runs.push(okRunWith(arm, "review-pipeline-target-v1", rep, full));
        runs.push(okRunWith(arm, CLEAN_TARGET, rep, CLEAN_APPLICABLE));
      }
    }
    return {
      record_contract: REVIEW_CERT_CONTRACT,
      created_at: "2026-07-13T00:00:00.000Z",
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
      declared_reps: 3,
      fixtures: [
        {
          fixture_id: "review-pipeline-target-v1",
          target_anchor: "src/target.ts",
          content_sha256: "a".repeat(64),
        },
        {
          fixture_id: CLEAN_TARGET,
          target_anchor: "src/clean-target.ts",
          content_sha256: "b".repeat(64),
          applicable_check_ids: CLEAN_APPLICABLE,
        },
      ],
      gate_pin: {
        check_universe: [...SEMANTIC_QUALITY_GATE_CHECK_IDS],
        issue_artifacts_provided: true,
      },
      run_controls: { salvage_enabled: false, resubmit_enabled: true },
      runs,
      declared_aggregates: {
        per_fixture_check: [
          ...full.map((check_id) => ({
            fixture_id: "review-pipeline-target-v1",
            check_id,
            baseline_pass_rate: 1,
            candidate_pass_rate: 1,
          })),
          ...CLEAN_APPLICABLE.map((check_id) => ({
            fixture_id: CLEAN_TARGET,
            check_id,
            baseline_pass_rate: 1,
            candidate_pass_rate: 1,
          })),
        ],
        core_check_floor: REVIEW_CERT_CORE_CHECK_FLOOR,
        quality_pass: true,
      },
      reproduction: { command: "npx tsx scripts/review-cert-run.mts" },
    };
  }

  it("recomputes a clean-target fixture (reduced applicable set) to zero violations", () => {
    expect(validateReviewCertRecord(mixedRecord())).toEqual([]);
  });

  it("does NOT vacuously fail the core floor on a clean-target's excluded recall checks", () => {
    // Negative control: were aggregates still iterating the full universe, the
    // clean-target's un-emitted recall/grounding checks would compute rate 0 <
    // floor and raise core_check_floor. Their exclusion is what keeps it clean.
    const codesFound = validateReviewCertRecord(mixedRecord()).map((v) => v.code);
    expect(codesFound).not.toContain("core_check_floor");
    const record = mixedRecord();
    const cleanRows = computeReviewCertAggregates(record.runs, record.fixtures)
      .per_fixture_check.filter((row) => row.fixture_id === CLEAN_TARGET)
      .map((row) => row.check_id);
    expect([...cleanRows].sort()).toEqual([...CLEAN_APPLICABLE].sort());
  });

  it("rejects a clean-target ok run that emits the full universe (superset of its applicable set)", () => {
    const record = structuredClone(mixedRecord());
    const cleanRun = record.runs.find((run) => run.fixture_id === CLEAN_TARGET)!;
    cleanRun.checks = checksFor([...SEMANTIC_QUALITY_GATE_CHECK_IDS]);
    expect(validateReviewCertRecord(record).map((v) => v.code)).toContain(
      "check_emission_incomplete",
    );
  });

  it("without applicable_check_ids, a reduced-emission run is check_emission_incomplete (field is load-bearing)", () => {
    const record = structuredClone(mixedRecord());
    const cleanFixture = record.fixtures.find(
      (fixture) => fixture.fixture_id === CLEAN_TARGET,
    )!;
    delete cleanFixture.applicable_check_ids;
    expect(validateReviewCertRecord(record).map((v) => v.code)).toContain(
      "check_emission_incomplete",
    );
  });

  // F1 (adversarial cross-verification 2026-07-13): applicable_check_ids must not
  // let a material-bearing fixture shrink its own core floor. Only a designated
  // clean-target fixture may reduce, and only to the exact legal reduction.

  it("rejects a MATERIAL-bearing fixture that declares a reduced applicable_check_ids (core-floor bypass)", () => {
    const record = structuredClone(mixedRecord());
    // The attack: review-pipeline (a material fixture) drops the recall spine.
    const materialFixture = record.fixtures.find(
      (fixture) => fixture.fixture_id === "review-pipeline-target-v1",
    )!;
    materialFixture.applicable_check_ids = CLEAN_APPLICABLE;
    // Emit only the reduced set on its runs so the emission check itself passes,
    // isolating the applicable_check_ids_invalid guard as the rejecter.
    for (const run of record.runs) {
      if (run.fixture_id === "review-pipeline-target-v1") {
        run.checks = checksFor(CLEAN_APPLICABLE);
      }
    }
    expect(validateReviewCertRecord(record).map((v) => v.code)).toContain(
      "applicable_check_ids_invalid",
    );
  });

  it("rejects a clean-target fixture whose applicable_check_ids is not the exact legal reduction", () => {
    const record = structuredClone(mixedRecord());
    const cleanFixture = record.fixtures.find(
      (fixture) => fixture.fixture_id === CLEAN_TARGET,
    )!;
    // A reduction that keeps one excluded check (actionability) is not the legal
    // clean-target set.
    cleanFixture.applicable_check_ids = [...CLEAN_APPLICABLE, "actionability"];
    expect(validateReviewCertRecord(record).map((v) => v.code)).toContain(
      "applicable_check_ids_invalid",
    );
  });

  // A-2 over-declaration symmetry: the declared aggregate set must equal the
  // COMPUTED set exactly — not just be a superset. A declared row for a check the
  // clean-target excludes (recall/grounding/actionability) has no completed run
  // to recompute against, so it is a spurious rate. Before A-2 the validator only
  // walked computed rows and silently ignored this declared-only excess.
  it("rejects an over-declared aggregate row referencing a non-applicable check", () => {
    const record = structuredClone(mixedRecord());
    // Sanity: the excess row targets a check that is genuinely excluded and thus
    // absent from the computed clean-target rows (non-vacuous negative control).
    expect(CLEAN_TARGET_EXCLUDED_CHECK_IDS.has("grounding")).toBe(true);
    record.declared_aggregates.per_fixture_check.push({
      fixture_id: CLEAN_TARGET,
      check_id: "grounding",
      baseline_pass_rate: 1,
      candidate_pass_rate: 1,
    });
    const violations = validateReviewCertRecord(record);
    // The ONLY defect is the over-declaration — isolate it precisely.
    expect(violations.map((v) => v.code)).toEqual(["aggregate_mismatch"]);
    expect(violations[0]!.subject_id).toBe(`${CLEAN_TARGET}/grounding`);
    expect(violations[0]!.message).toContain("over-declaration");
  });

  // "Exactly the computed set" is a multiset claim: a duplicate declared row for
  // an applicable pair (both keys present in computed) escapes the over-declaration
  // membership test, and the forward loop's last-wins Map would let a spurious rate
  // ride alongside the honest twin. The set-integrity guard rejects the repeat.
  it("rejects a duplicate declared aggregate row (same pair, divergent rate)", () => {
    const record = structuredClone(mixedRecord());
    const applicableRow = record.declared_aggregates.per_fixture_check.find(
      (row) => row.fixture_id === CLEAN_TARGET,
    )!;
    // Prepend a spurious twin with a wrong rate so the HONEST row stays last: the
    // forward last-wins Map then recomputes clean and stays silent, leaving the
    // set-integrity guard as the sole rejecter of the divergent duplicate.
    record.declared_aggregates.per_fixture_check.unshift({
      ...applicableRow,
      candidate_pass_rate: 0.5,
    });
    const violations = validateReviewCertRecord(record);
    expect(violations.map((v) => v.code)).toEqual(["aggregate_mismatch"]);
    expect(violations[0]!.subject_id).toBe(
      `${applicableRow.fixture_id}/${applicableRow.check_id}`,
    );
    expect(violations[0]!.message).toContain("more than once");
  });

  // A-2 not_run handling under a reduced applicable set: a transport-lost
  // clean-target run carries no checks and is not counted toward the rep floor —
  // identical to the full-universe path (the reduced set never reaches not_run
  // rows). Confirms the reduction does not corrupt not_run bookkeeping.
  it("handles a not_run row on a reduced-applicable-set fixture (rep_floor only, no check noise)", () => {
    const record = structuredClone(mixedRecord());
    const lost = record.runs.find(
      (run) => run.arm === "candidate" && run.fixture_id === CLEAN_TARGET,
    )!;
    lost.completion = "not_run";
    lost.units_completed = 3;
    lost.checks = [];
    // Two ok clean-target candidate runs remain (all-pass) → rates stay 1, so the
    // declared aggregates still recompute; only the rep floor is short.
    const violations = validateReviewCertRecord(record);
    expect(codes(violations)).toContain("rep_floor");
    expect(violations.some((v) => v.subject_id === `candidate/${CLEAN_TARGET}`))
      .toBe(true);
    // A not_run row carrying no checks must NOT trip emission or aggregate noise.
    expect(codes(violations)).not.toContain("check_emission_incomplete");
    expect(codes(violations)).not.toContain("aggregate_mismatch");
    expect(codes(violations)).not.toContain("core_check_floor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A-2 G7 binding regression on the REAL registry. The v3 applicable_check_ids
// field is additive-optional, so the two REGISTERED review-cert/v2 records (which
// declare none → full universe) must still bind their registry entries to zero
// violations after the validator hardening. This loads the actual
// `.onto/authority/supported-models.yaml` and the on-disk records, mirroring
// `assertReviewCertBinding` in check-supported-models.ts — a recompute regression
// from any future validator change fails HERE, in unit CI, not silently at G7.
// ─────────────────────────────────────────────────────────────────────────────
describe("review-cert binding — registered v2 records (real-registry regression)", () => {
  const REPO_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );

  it("binds every registered review-role entry to zero violations", () => {
    const registry = loadSupportedModelRegistry();
    const supportedModelKeys = new Set(
      registry.supported_models.map((entry) => `${entry.provider}/${entry.model}`),
    );
    const reviewEntries = registry.supported_models.filter((entry) =>
      entry.roles?.includes("review"),
    );
    // Non-vacuous: there ARE registered review entries whose binding this pins.
    expect(reviewEntries.length).toBeGreaterThan(0);
    for (const entry of reviewEntries) {
      const evidenceByRef = new Map<string, unknown>();
      for (const ref of entry.benchmark_evidence_refs) {
        try {
          evidenceByRef.set(
            ref,
            JSON.parse(readFileSync(path.join(REPO_ROOT, ref), "utf8")),
          );
        } catch {
          // Mirrors G7: an unreadable/non-JSON ref cannot serve as the cert
          // record; the tracked-file check polices ref existence separately.
        }
      }
      expect(
        reviewCertBindingViolations({ entry, evidenceByRef, supportedModelKeys }),
        `${entry.provider}/${entry.model} must bind to a passing review-cert record`,
      ).toEqual([]);
    }
  });
});
