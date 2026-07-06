/**
 * N10/N16 matrix for the synthesize-cert/v1 recompute (INV-MODEL-1 role-aware
 * design §8): every §6.4 row's failure axis is exercised by mutating ONE thing
 * on a known-passing record, and the passing record itself is the contrast
 * control. The mutations mirror exactly the axes the design names for N10.
 */
import { describe, expect, it } from "vitest";
import {
  computeSynthesizeCertAggregates,
  isSynthesizeCertCandidate,
  parseSynthesizeCertRecord,
  synthesizeCertBindingViolations,
  synthesizeCertManifestFloorViolations,
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
function makePassingRecord(declaredReps = 3): SynthesizeCertRecord {
  const specs: FixtureSpec[] = [
    { fixtureId: "fx-1", strata: STRATA, inputsPerStratum: 2 },
    { fixtureId: "fx-2", strata: [STRATA[0]!, STRATA[1]!], inputsPerStratum: 2 },
  ];
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
    arm_model: {
      baseline: { provider: "openai", model: "gpt-5.5" },
      candidate: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
      negative_control: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
      },
    },
    negative_arm: {
      arm: "negative_control",
      mutation_kind: "label_shuffle",
      mutation_params: { seed: 7 },
      targeted_metrics: ["grounding", "boundary"],
    },
    input_manifest: manifest,
    judgement_rows: rows,
    // Filled with the SAME shared helper the B4 harness must use (LOW-7); the
    // aggregate_mismatch test below proves the comparison is still live.
    declared_aggregates: computeSynthesizeCertAggregates({
      inputManifest: manifest,
      judgementRows: rows,
    }),
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

  it("decision-B: a targeted negative metric equal to baseline is not discriminating (relative threshold)", () => {
    const record = makePassingRecord();
    for (const row of record.judgement_rows) {
      if (row.arm === "negative_control") {
        row.metrics = { ...row.metrics, grounding: "pass" };
      }
    }
    record.declared_aggregates = computeSynthesizeCertAggregates({
      inputManifest: record.input_manifest,
      judgementRows: record.judgement_rows,
    });
    expect(codes(record)).toContain("negative_metric_not_discriminating");
  });

  it("decision-B: a negative mean < 1.0 but within delta of baseline still fails (would have passed the old absolute <1.0 rule)", () => {
    const record = makePassingRecord();
    // Make ~90% of the negative-arm grounding verdicts pass: mean ~0.92, which
    // clears the retired absolute rule (<1.0) but NOT baseline(1.0)-0.15=0.85.
    const negRows = record.judgement_rows.filter((row) =>
      row.arm === "negative_control"
    );
    const passCount = Math.ceil(negRows.length * 0.9);
    negRows.forEach((row, i) => {
      row.metrics = {
        ...row.metrics,
        grounding: i < passCount ? "pass" : "fail",
      };
    });
    record.declared_aggregates = computeSynthesizeCertAggregates({
      inputManifest: record.input_manifest,
      judgementRows: record.judgement_rows,
    });
    const negMean = passCount / negRows.length;
    expect(negMean).toBeGreaterThan(0.85);
    expect(negMean).toBeLessThan(1.0);
    expect(codes(record)).toContain("negative_metric_not_discriminating");
  });

  it("decision-A: selective exclusion (5 decisive of many) fails the decisiveness ratio even when the absolute floor is met", () => {
    // High rep count gives the exclusion room the absolute floor alone permits.
    const record = makePassingRecord(10);
    // One candidate cell: keep exactly 5 decisive (clears floor 5), mark the
    // other 15 as judge_error (non-decisive) — ratio 5/20 = 0.25 < 0.8.
    const cellRows = record.judgement_rows.filter((row) =>
      row.fixture_id === "fx-1" && row.arm === "candidate" &&
      !row.stratum.seam && !row.stratum.merge
    );
    expect(cellRows.length).toBe(20);
    cellRows.slice(5).forEach((row) => {
      row.judge_status = "judge_error";
      row.metrics = { grounding: "not_judged", boundary: "not_judged" };
    });
    record.declared_aggregates = computeSynthesizeCertAggregates({
      inputManifest: record.input_manifest,
      judgementRows: record.judgement_rows,
    });
    const result = codes(record);
    expect(result).toContain("decisiveness_ratio");
    // The absolute stratum floor is NOT the trigger — 5 decisive still meets it.
    expect(
      validateSynthesizeCertRecord(record).filter((v) =>
        v.code === "stratum_coverage" &&
        v.message.includes("candidate")
      ),
    ).toEqual([]);
  });

  it("N10: negative arm must target every judged metric", () => {
    const record = makePassingRecord();
    record.negative_arm.targeted_metrics = ["grounding"];
    expect(codes(record)).toContain("negative_targets_incomplete");
  });

  it("N10: negative lineage must be the row's OWN coordinate input (identity)", () => {
    const record = makePassingRecord();
    const negativeRow = record.judgement_rows.find((row) =>
      row.arm === "negative_control" && row.fixture_id === "fx-1"
    )!;
    negativeRow.source_input_id = "fx-2-s0-i0";
    expect(codes(record)).toContain("negative_lineage");
  });

  it("laxness-F1: PERMUTED lineage (swapped slots carrying unmutated originals) is rejected on both axes", () => {
    // Two negative rows of the same fixture+rep swap content: slot A carries
    // B's ORIGINAL sha citing source B, slot B carries A's citing A. The old
    // multiset-bijection lineage accepted this and the slot-anchored sha check
    // saw "different sha = mutated". Both axes must now fire.
    const record = makePassingRecord();
    const rowA = record.judgement_rows.find((row) =>
      row.arm === "negative_control" && row.input_id === "fx-1-s0-i0" && row.rep === 1
    )!;
    const rowB = record.judgement_rows.find((row) =>
      row.arm === "negative_control" && row.input_id === "fx-1-s0-i1" && row.rep === 1
    )!;
    rowA.input_sha256 = "sha-fx-1-s0-i1"; // B's unmutated original
    rowA.source_input_id = "fx-1-s0-i1";
    rowB.input_sha256 = "sha-fx-1-s0-i0"; // A's unmutated original
    rowB.source_input_id = "fx-1-s0-i0";
    const result = codes(record);
    expect(result).toContain("negative_lineage");
    expect(result).toContain("negative_mutation_not_applied");
  });

  it("N10: manifest with a single fixture fails the fixture floor", () => {
    const record = makePassingRecord();
    record.input_manifest = record.input_manifest.filter((entry) =>
      entry.fixture_id === "fx-1"
    );
    record.judgement_rows = record.judgement_rows.filter((row) =>
      row.fixture_id === "fx-1"
    );
    expect(codes(record)).toContain("fixture_floor");
  });

  it("N10: duplicate manifest input ids and intra-fixture duplicate content are both violations", () => {
    const record = makePassingRecord();
    record.input_manifest.push({ ...record.input_manifest[0]! });
    expect(codes(record)).toContain("duplicate_manifest_input");

    const contentDup = makePassingRecord();
    contentDup.input_manifest[1]!.input_sha256 =
      contentDup.input_manifest[0]!.input_sha256;
    expect(
      validateSynthesizeCertRecord(contentDup).filter((v) =>
        v.code === "duplicate_manifest_input"
      ).length,
    ).toBeGreaterThan(0);
  });

  it("N10: a row whose stratum disagrees with the manifest stratum is rejected", () => {
    const record = makePassingRecord();
    const row = record.judgement_rows.find((r) => r.arm === "baseline")!;
    row.stratum = { seam: !row.stratum.seam, merge: row.stratum.merge };
    expect(codes(record)).toContain("stratum_row_mismatch");
  });

  it("laxness-F6: a duplicated declared reps_matrix cell cannot hide behind last-wins", () => {
    const record = makePassingRecord();
    record.declared_aggregates.reps_matrix.unshift({
      fixture_id: "fx-1",
      arm: "baseline",
      distinct_reps: 999,
    });
    expect(codes(record)).toContain("aggregate_mismatch");
  });

  it("laxness-F7: declared_reps beyond the cap is rejected at the schema (gate DoS)", () => {
    const record = makePassingRecord();
    const hostile = { ...clone(record), declared_reps: 1_000_000_000 };
    const parsed = parseSynthesizeCertRecord(hostile);
    expect(parsed.record).toBeNull();
    expect(parsed.violations.map((v) => v.code)).toContain("schema_shape_invalid");
  });

  it("spec-F1/F8: tampered stddev or judge_status_counts fail the aggregate recompute", () => {
    const record = makePassingRecord();
    record.declared_aggregates.metric_stddev.candidate.grounding = 0.5;
    expect(codes(record)).toContain("aggregate_mismatch");

    const counts = makePassingRecord();
    counts.declared_aggregates.judge_status_counts.judge_error = 7;
    expect(codes(counts)).toContain("aggregate_mismatch");
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

  it("HIGH-1: a synthesize-plane loss (not_run) is honestly representable and passes while floors hold", () => {
    const record = makePassingRecord();
    // One coordinate in a 6-headroom cell lost its synthesize call entirely.
    const lostRow = record.judgement_rows.find((row) =>
      row.fixture_id === "fx-1" && row.arm === "candidate" &&
      row.stratum.seam && row.stratum.merge && row.rep === 1
    )!;
    lostRow.candidate_output_status = "not_run";
    lostRow.judge_status = "not_run";
    lostRow.metrics = { grounding: "not_judged", boundary: "not_judged" };
    record.declared_aggregates = computeSynthesizeCertAggregates({
      inputManifest: record.input_manifest,
      judgementRows: record.judgement_rows,
    });
    expect(validateSynthesizeCertRecord(record)).toEqual([]);
    // Contrast: the same loss recorded as parse_fail stays a violation
    // (§6.2-1 zero-tolerance is for FAILURES, not losses).
    lostRow.candidate_output_status = "parse_fail";
    expect(codes(record)).toContain("output_status_not_ok");
  });

  it("HIGH-2: arm_model.candidate must equal the certified (provider, model)", () => {
    const record = makePassingRecord();
    record.arm_model.candidate = { provider: "openai", model: "gpt-5.5" };
    expect(codes(record)).toContain("arm_model_mismatch");
  });

  it("LOW-8: whitespace inside ids is rejected at the schema (coordinate aliasing)", () => {
    const record = makePassingRecord();
    record.input_manifest[0]!.fixture_id = "fx 1";
    const parsed = parseSynthesizeCertRecord(record);
    expect(parsed.record).toBeNull();
    expect(parsed.violations.map((v) => v.code)).toContain("schema_shape_invalid");
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

describe("pre-spend manifest floor lint (MED-6)", () => {
  it("passes the shaped manifest and predicts unreachable floors before any spend", () => {
    const record = makePassingRecord();
    expect(synthesizeCertManifestFloorViolations({
      inputManifest: record.input_manifest,
      declaredReps: record.declared_reps,
    })).toEqual([]);
    // A token single-input stratum caps at 3 decisive rows (< floor 5): the
    // lint must predict the failure from the manifest alone.
    const tokenManifest = record.input_manifest.filter((entry) =>
      entry.fixture_id !== "fx-2" || entry.input_id === "fx-2-s0-i0"
    );
    const predicted = synthesizeCertManifestFloorViolations({
      inputManifest: tokenManifest,
      declaredReps: record.declared_reps,
    });
    expect(predicted.map((v) => v.code)).toContain("stratum_coverage");
    expect(synthesizeCertManifestFloorViolations({
      inputManifest: record.input_manifest,
      declaredReps: 2,
    }).map((v) => v.code)).toContain("declared_reps_floor");
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
