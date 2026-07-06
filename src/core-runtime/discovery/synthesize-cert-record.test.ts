/**
 * N10/N16 matrix for the synthesize-cert/v1 recompute (INV-MODEL-1 role-aware
 * design §8): every §6.4 row's failure axis is exercised by mutating ONE thing
 * on a known-passing record, and the passing record itself is the contrast
 * control. The mutations mirror exactly the axes the design names for N10.
 */
import { describe, expect, it } from "vitest";
import {
  isSynthesizeCertCandidate,
  parseSynthesizeCertRecord,
  synthesizeCertBindingViolations,
  SYNTHESIZE_CERT_ARMS,
  SYNTHESIZE_CERT_CONTRACT,
  validateSynthesizeCertRecord,
  type SynthesizeCertArm,
  type SynthesizeCertJudgementRow,
  type SynthesizeCertRecord,
  type SynthesizeCertStratum,
} from "./synthesize-cert-record.js";

const STRATA: SynthesizeCertStratum[] = [
  { seam: false, merge: false },
  { seam: false, merge: true },
  { seam: true, merge: false },
  { seam: true, merge: true },
];

interface FixtureSpec {
  fixtureId: string;
  strata: SynthesizeCertStratum[];
  inputsPerStratum: number;
}

/** Builds a record that passes every recompute check: fixture-1 possesses all
 * four strata (meeting the global per-stratum floor), fixture-2 possesses two
 * (meeting its own possessed-stratum floors), reps=3, 2 inputs per possessed
 * stratum (2 x 3 reps = 6 decisive >= 5 per stratum x arm), all rows decisive,
 * baseline/candidate all-pass, negative arm all-fail on both targeted metrics. */
function makePassingRecord(): SynthesizeCertRecord {
  const specs: FixtureSpec[] = [
    { fixtureId: "fx-1", strata: STRATA, inputsPerStratum: 2 },
    { fixtureId: "fx-2", strata: [STRATA[0]!, STRATA[1]!], inputsPerStratum: 2 },
  ];
  const declaredReps = 3;
  const manifest: SynthesizeCertRecord["input_manifest"] = [];
  for (const spec of specs) {
    for (const [stratumIndex, stratum] of spec.strata.entries()) {
      for (let i = 0; i < spec.inputsPerStratum; i += 1) {
        const inputId = `${spec.fixtureId}-s${stratumIndex}-i${i}`;
        manifest.push({
          fixture_id: spec.fixtureId,
          input_id: inputId,
          input_sha256: `sha-${inputId}`,
          stratum,
        });
      }
    }
  }
  const rows: SynthesizeCertJudgementRow[] = [];
  for (const entry of manifest) {
    for (const arm of SYNTHESIZE_CERT_ARMS) {
      for (let rep = 1; rep <= declaredReps; rep += 1) {
        const negative = arm === "negative_control";
        rows.push({
          row_id: `row-${entry.input_id}-${arm}-${rep}`,
          fixture_id: entry.fixture_id,
          input_id: entry.input_id,
          input_sha256: negative
            ? `${entry.input_sha256}-mutated`
            : entry.input_sha256,
          rep,
          arm,
          stratum: entry.stratum,
          candidate_output_status: "ok",
          judge_status: "ok",
          metrics: negative
            ? { grounding: "fail", boundary: "fail" }
            : { grounding: "pass", boundary: "pass" },
          ...(negative ? { source_input_id: entry.input_id } : {}),
        });
      }
    }
  }
  const perArmRowCount = manifest.length * declaredReps;
  const repsMatrix: SynthesizeCertRecord["declared_aggregates"]["reps_matrix"] =
    [];
  for (const spec of specs) {
    for (const arm of SYNTHESIZE_CERT_ARMS) {
      repsMatrix.push({
        fixture_id: spec.fixtureId,
        arm,
        distinct_reps: declaredReps,
      });
    }
  }
  return {
    record_contract: SYNTHESIZE_CERT_CONTRACT,
    created_at: "2026-07-06T00:00:00.000Z",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    declared_reps: declaredReps,
    arm_prompt_sha256: {
      baseline: "sha-prompt",
      candidate: "sha-prompt",
      negative_control: "sha-prompt",
    },
    negative_arm: {
      arm: "negative_control",
      mutation_kind: "label_shuffle",
      mutation_params: { seed: 7 },
      targeted_metrics: ["grounding", "boundary"],
    },
    input_manifest: manifest,
    judgement_rows: rows,
    declared_aggregates: {
      decisive_row_count: {
        baseline: perArmRowCount,
        candidate: perArmRowCount,
        negative_control: perArmRowCount,
      },
      metric_means: {
        baseline: { grounding: 1, boundary: 1 },
        candidate: { grounding: 1, boundary: 1 },
        negative_control: { grounding: 0, boundary: 0 },
      },
      judge_failure_rate: 0,
      reps_matrix: repsMatrix,
    },
    reproduction: {
      command: "npx tsx scripts/l2-real-llm-run.mts --bench synthesize-cert",
      source_paths: ["development-records/benchmark/fixtures/fx-1.xlsx"],
      limitations: "Synthetic test fixture — not a real bench capture.",
    },
  };
}

function clone(record: SynthesizeCertRecord): SynthesizeCertRecord {
  return structuredClone(record);
}

function codes(record: SynthesizeCertRecord): string[] {
  return validateSynthesizeCertRecord(record).map((item) => item.code);
}

describe("synthesize-cert/v1 recompute (G7 — design §6.4/§6.4a)", () => {
  it("passes a fully consistent record (contrast control, non-vacuous)", () => {
    const record = makePassingRecord();
    // Cardinality preconditions: the subject sets the checks range over are
    // non-empty, so a zero-violation verdict cannot be vacuous.
    expect(record.input_manifest.length).toBeGreaterThan(0);
    expect(record.judgement_rows.length).toBe(
      record.input_manifest.length * 3 * record.declared_reps,
    );
    expect(validateSynthesizeCertRecord(record)).toEqual([]);
  });

  it("parses only a self-identifying record (schema row)", () => {
    const record = makePassingRecord();
    expect(isSynthesizeCertCandidate(record)).toBe(true);
    const foreign = { ...clone(record), record_contract: "other/v1" };
    expect(isSynthesizeCertCandidate(foreign)).toBe(false);
    expect(parseSynthesizeCertRecord(foreign).record).toBeNull();
    expect(
      parseSynthesizeCertRecord(foreign).violations.map((v) => v.code),
    ).toContain("schema_shape_invalid");
  });

  it("N10: missing expected coordinate is a silent drop", () => {
    const record = makePassingRecord();
    record.judgement_rows = record.judgement_rows.slice(1);
    expect(codes(record)).toContain("expected_row_missing");
  });

  it("N10: duplicate coordinate is a violation", () => {
    const record = makePassingRecord();
    const first = record.judgement_rows[0]!;
    record.judgement_rows.push({ ...first, row_id: "row-duplicate" });
    expect(codes(record)).toContain("duplicate_row");
  });

  it("N10: manifest scope-shrink leaves orphan rows outside the universe", () => {
    const record = makePassingRecord();
    record.input_manifest = record.input_manifest.slice(1);
    // Keep declared aggregates consistent enough that the orphan check is the
    // signal under test.
    expect(codes(record)).toContain("row_outside_manifest");
  });

  it("N10: rep shortage under the per-(fixture x arm) floor", () => {
    const record = makePassingRecord();
    record.declared_reps = 2;
    record.judgement_rows = record.judgement_rows.filter((row) => row.rep <= 2);
    for (const cell of record.declared_aggregates.reps_matrix) {
      cell.distinct_reps = 2;
    }
    const perArm = record.input_manifest.length * 2;
    record.declared_aggregates.decisive_row_count = {
      baseline: perArm,
      candidate: perArm,
      negative_control: perArm,
    };
    const result = codes(record);
    expect(result).toContain("declared_reps_floor");
    expect(result).toContain("rep_floor");
  });

  it("N10: per-fixture possessed-stratum decisive shortage (judge failures eat the floor)", () => {
    const record = makePassingRecord();
    // Push two candidate-arm rows of fixture fx-1's (seam, merge) stratum below
    // decisiveness: 6 decisive -> 4 < 5.
    const targets = record.judgement_rows.filter((row) =>
      row.fixture_id === "fx-1" &&
      row.arm === "candidate" &&
      row.stratum.seam && row.stratum.merge
    ).slice(0, 2);
    expect(targets.length).toBe(2);
    for (const row of targets) {
      row.judge_status = "judge_error";
      row.metrics = { grounding: "not_judged", boundary: "not_judged" };
    }
    expect(codes(record)).toContain("stratum_coverage");
  });

  it("N10: token fixture-2 cannot dodge its own possessed-stratum floor (§6.4a)", () => {
    const record = makePassingRecord();
    // Reduce fixture-2 to a single token input: 1 input x 3 reps = 3 decisive < 5.
    const keptInput = "fx-2-s0-i0";
    record.input_manifest = record.input_manifest.filter((entry) =>
      entry.fixture_id !== "fx-2" || entry.input_id === keptInput
    );
    record.judgement_rows = record.judgement_rows.filter((row) =>
      row.fixture_id !== "fx-2" || row.input_id === keptInput
    );
    const violations = validateSynthesizeCertRecord(record);
    expect(violations.some((item) =>
      item.code === "stratum_coverage" && item.subject_id === "fx-2"
    )).toBe(true);
  });

  it("N10: a stratum floor-met in no fixture fails globally", () => {
    const record = makePassingRecord();
    // Remove fixture-1's (seam, merge) inputs entirely; no other fixture
    // possesses that stratum, so the global floor must fire (not silently N/A).
    const dropped = record.input_manifest.filter((entry) =>
      entry.stratum.seam && entry.stratum.merge
    ).map((entry) => entry.input_id);
    expect(dropped.length).toBeGreaterThan(0);
    record.input_manifest = record.input_manifest.filter((entry) =>
      !dropped.includes(entry.input_id)
    );
    record.judgement_rows = record.judgement_rows.filter((row) =>
      !dropped.includes(row.input_id)
    );
    expect(codes(record)).toContain("stratum_global_floor");
  });

  it("N10: targeted negative metric at 1.0 has no discrimination", () => {
    const record = makePassingRecord();
    for (const row of record.judgement_rows) {
      if (row.arm === "negative_control") {
        row.metrics = { ...row.metrics, grounding: "pass" };
      }
    }
    record.declared_aggregates.metric_means.negative_control.grounding = 1;
    expect(codes(record)).toContain("negative_metric_not_discriminating");
  });

  it("N10: negative arm must target every judged metric", () => {
    const record = makePassingRecord();
    record.negative_arm.targeted_metrics = ["grounding"];
    expect(codes(record)).toContain("negative_targets_incomplete");
  });

  it("N10: negative lineage must map 1:1 onto the fixture's manifest inputs", () => {
    const record = makePassingRecord();
    const negativeRow = record.judgement_rows.find((row) =>
      row.arm === "negative_control" && row.fixture_id === "fx-1"
    )!;
    negativeRow.source_input_id = "fx-2-s0-i0";
    expect(codes(record)).toContain("negative_lineage");
  });

  it("N10: differing arm prompt shas break the equal-prompt clause", () => {
    const record = makePassingRecord();
    record.arm_prompt_sha256.candidate = "sha-prompt-tuned";
    expect(codes(record)).toContain("prompt_sha_mismatch");
  });

  it("N10: baseline/candidate input sha must equal the manifest sha", () => {
    const record = makePassingRecord();
    const baselineRow = record.judgement_rows.find((row) => row.arm === "baseline")!;
    baselineRow.input_sha256 = "sha-doctored";
    expect(codes(record)).toContain("input_sha_mismatch");
  });

  it("N16: an unapplied negative mutation (sha equals original) is rejected", () => {
    const record = makePassingRecord();
    const negativeRow = record.judgement_rows.find((row) =>
      row.arm === "negative_control"
    )!;
    negativeRow.input_sha256 = `sha-${negativeRow.input_id}`;
    expect(codes(record)).toContain("negative_mutation_not_applied");
  });

  it("N10: declared aggregates must equal the row recompute", () => {
    const record = makePassingRecord();
    record.declared_aggregates.metric_means.candidate.grounding = 0.9;
    expect(codes(record)).toContain("aggregate_mismatch");
  });

  it("N10: non-ok output status on a certifying arm is a violation", () => {
    const record = makePassingRecord();
    const candidateRow = record.judgement_rows.find((row) =>
      row.arm === "candidate"
    )!;
    candidateRow.candidate_output_status = "parse_fail";
    expect(codes(record)).toContain("output_status_not_ok");
  });

  it("N10: candidate regression below baseline fails the tie-or-better clause", () => {
    const record = makePassingRecord();
    // Make every candidate row fail boundary: candidate mean 0 < baseline 1.
    for (const row of record.judgement_rows) {
      if (row.arm === "candidate") {
        row.metrics = { ...row.metrics, boundary: "fail" };
      }
    }
    record.declared_aggregates.metric_means.candidate.boundary = 0;
    expect(codes(record)).toContain("metric_regression");
  });

  it("flags decisive rows whose metric verdict was left not_judged", () => {
    const record = makePassingRecord();
    const row = record.judgement_rows.find((r) => r.arm === "baseline")!;
    row.metrics = { ...row.metrics, grounding: "not_judged" };
    const result = codes(record);
    expect(result).toContain("metric_not_judged_on_decisive");
  });
});

describe("G7 role<->record binding (onto 20260705-7e0e5263 issue-001/003/006)", () => {
  const entry = (refs: string[], roles?: string[]) => ({
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    roles,
    benchmark_evidence_refs: refs,
  });

  it("requires a synthesize-cert record for a semantic_map_synthesize entry", () => {
    const violations = synthesizeCertBindingViolations({
      entry: entry(["development-records/benchmark/generic.json"], [
        "semantic_map_synthesize",
      ]),
      evidenceByRef: new Map([[
        "development-records/benchmark/generic.json",
        { some: "generic benchmark" },
      ]]),
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.message).toContain(SYNTHESIZE_CERT_CONTRACT);
  });

  it("binds only when the passing record certifies the citing entry's (provider, model)", () => {
    const record = makePassingRecord();
    const foreign = { ...clone(record), model: "some-other-model" };
    const violations = synthesizeCertBindingViolations({
      entry: entry(["records/cert.json"], ["semantic_map_synthesize"]),
      evidenceByRef: new Map([["records/cert.json", foreign]]),
    });
    expect(violations.some((item) =>
      item.message.includes("not the citing entry")
    )).toBe(true);
  });

  it("accepts a passing, matching record and reports nothing", () => {
    const violations = synthesizeCertBindingViolations({
      entry: entry(["records/cert.json", "records/generic.json"], [
        "semantic_map_synthesize",
      ]),
      evidenceByRef: new Map<string, unknown>([
        ["records/cert.json", makePassingRecord()],
        ["records/generic.json", { note: "unrelated" }],
      ]),
    });
    expect(violations).toEqual([]);
  });

  it("surfaces the failing record's recompute violations instead of binding", () => {
    const record = makePassingRecord();
    record.arm_prompt_sha256.candidate = "sha-prompt-tuned";
    const violations = synthesizeCertBindingViolations({
      entry: entry(["records/cert.json"], ["semantic_map_synthesize"]),
      evidenceByRef: new Map([["records/cert.json", record]]),
    });
    expect(violations.map((item) => item.code)).toContain("prompt_sha_mismatch");
  });

  it("ignores entries without the semantic_map_synthesize role", () => {
    const violations = synthesizeCertBindingViolations({
      entry: entry(["records/anything.json"], ["author"]),
      evidenceByRef: new Map(),
    });
    expect(violations).toEqual([]);
  });
});

describe("expected-universe arm coverage (fixture sanity)", () => {
  it("covers every arm in the generated fixture (cardinality > 0 per arm)", () => {
    const record = makePassingRecord();
    for (const arm of SYNTHESIZE_CERT_ARMS) {
      const armRows = record.judgement_rows.filter((row) => row.arm === arm);
      expect(armRows.length).toBeGreaterThan(0);
    }
    const arms: SynthesizeCertArm[] = [...SYNTHESIZE_CERT_ARMS];
    expect(arms).toHaveLength(3);
  });
});
