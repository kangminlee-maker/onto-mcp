/**
 * S7 tests (design v3 §9/§18/§15.7): the assembled record passes the REAL
 * shipped validator with ZERO violations over a floor-clean two-fixture mock
 * bench (and the validator demonstrably bites on tampering — no vacuous
 * green); the capsule binding gate binds a clean capsule and fails closed on
 * every §18 axis (missing capsule, digest drift, input/row tamper, unmet
 * obligation, smuggled prose).
 */
import { describe, expect, it } from "vitest";
import {
  assembleSynthesizeCertCapsule,
  validateSynthesizeCertCapsuleBinding,
  type AssembleSynthesizeCertCapsuleArgs,
} from "./synthesize-cert-capsule.js";
import {
  assembleSynthesizeCertRecord,
  buildSynthesizeCertInputManifest,
  type AssembleSynthesizeCertRecordArgs,
} from "./synthesize-cert-assemble.js";
import {
  validateSynthesizeCertRecord,
  type SynthesizeCertRecord,
} from "./synthesize-cert-record.js";
import { runSynthesizeCertMockBench } from "./test-fixtures/synthesize-cert-mock-realization.js";

const CANDIDATE = { provider: "anthropic", model: "claude-haiku-4-5-20251001" };
const BASELINE = { provider: "openai", model: "gpt-5.5" };
const PROMPT_SHA = "a".repeat(64);

async function assembledLineage() {
  const bench = await runSynthesizeCertMockBench();
  const recordArgs: AssembleSynthesizeCertRecordArgs = {
    createdAt: "2026-07-07T00:00:00.000Z",
    candidateModel: CANDIDATE,
    baselineModel: BASELINE,
    promptSha256: PROMPT_SHA,
    declaredReps: bench.sample.declared_reps,
    mutationSeed: bench.mutationSeed,
    entries: bench.sample.manifest,
    packets: bench.frozen.packets,
    judgementRows: bench.loop.rows,
    reproduction: {
      command: "npx tsx scripts/b4-cert-run.mts --mock",
      source_paths: ["development-records/benchmark/fixtures/synthesize-cert/"],
      limitations:
        "per-node synthesize capability only; production path, end-to-end authoring outside cert (capsule limitation_ids)",
    },
  };
  const record = assembleSynthesizeCertRecord(recordArgs);
  const capsuleArgs: AssembleSynthesizeCertCapsuleArgs = {
    recordRef: "mock-record.json",
    inputManifest: record.input_manifest,
    judgementRows: record.judgement_rows,
    sampledEntries: bench.sample.manifest,
    samplingProvenance: bench.sample.provenance,
    samplerVersion: bench.sample.sampler_version,
    perStratumK: bench.sample.per_stratum_k,
    declaredReps: bench.sample.declared_reps,
    manifestIdentitySha256: bench.sample.manifest_identity_sha256,
    packets: bench.frozen.packets,
    negativeMutations: bench.loop.negative_mutations,
    productionContrast: { completed: true, evidence_ref: "mock-contrast.json" },
  };
  const capsule = assembleSynthesizeCertCapsule(capsuleArgs);
  return { bench, record, recordArgs, capsule, capsuleArgs };
}

describe("assembleSynthesizeCertRecord", () => {
  it("produces a record the REAL validator recomputes to ZERO violations", async () => {
    const { bench, record } = await assembledLineage();
    // Non-vacuous universe: 2 fixtures × 4 strata, 26 inputs × 3 reps × 3 arms.
    expect(record.input_manifest.length).toBe(26);
    expect(record.judgement_rows.length).toBe(234);
    expect(bench.loop.aborted).toBeNull();
    expect(validateSynthesizeCertRecord(record)).toEqual([]);
  });

  it("the validator BITES on this record (no vacuous green): tampering trips it", async () => {
    const { record } = await assembledLineage();
    const droppedRow: SynthesizeCertRecord = {
      ...record,
      judgement_rows: record.judgement_rows.slice(1),
    };
    expect(
      validateSynthesizeCertRecord(droppedRow).some((v) => v.code === "expected_row_missing"),
    ).toBe(true);
    const inflatedMean: SynthesizeCertRecord = JSON.parse(JSON.stringify(record));
    inflatedMean.declared_aggregates.metric_means.negative_control.grounding = 1;
    expect(
      validateSynthesizeCertRecord(inflatedMean).some((v) => v.code === "aggregate_mismatch"),
    ).toBe(true);
  });

  it("is deterministic and lineage-honest", async () => {
    const { bench, recordArgs } = await assembledLineage();
    expect(assembleSynthesizeCertRecord(recordArgs)).toEqual(
      assembleSynthesizeCertRecord(recordArgs),
    );
    // Missing packet → the manifest builder refuses.
    expect(() =>
      buildSynthesizeCertInputManifest(bench.sample.manifest, bench.frozen.packets.slice(1)),
    ).toThrow(/no frozen packet/);
    // Schema-invalid assembly input fails loud (empty prompt sha).
    expect(() =>
      assembleSynthesizeCertRecord({ ...recordArgs, promptSha256: "" }),
    ).toThrow(/failed the contract schema/);
  });
});

describe("validateSynthesizeCertCapsuleBinding", () => {
  it("binds a clean capsule with zero violations (contrast control)", async () => {
    const { record, capsule } = await assembledLineage();
    const violations = validateSynthesizeCertCapsuleBinding({
      record,
      capsuleRaw: JSON.parse(JSON.stringify(capsule)),
    });
    expect(violations).toEqual([]);
  });

  it("fails closed when the capsule is absent or unparseable", async () => {
    const { record, capsule } = await assembledLineage();
    expect(
      validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: undefined }).map((v) => v.code),
    ).toEqual(["capsule_missing"]);
    const wrongContract = JSON.parse(JSON.stringify(capsule));
    wrongContract.capsule_contract = "synthesize-cert-capsule/v0";
    expect(
      validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: wrongContract }).some(
        (v) => v.code === "capsule_schema_invalid",
      ),
    ).toBe(true);
  });

  it("detects digest, input, and row drift between capsule and record", async () => {
    const { record, capsule } = await assembledLineage();
    const digestDrift = JSON.parse(JSON.stringify(capsule));
    digestDrift.record_input_manifest_sha256 = "b".repeat(64);
    expect(
      validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: digestDrift }).some(
        (v) => v.code === "capsule_digest_mismatch",
      ),
    ).toBe(true);

    const inputDrift = JSON.parse(JSON.stringify(capsule));
    inputDrift.per_input[0].input_sha256 = "c".repeat(64);
    expect(
      validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: inputDrift }).some(
        (v) => v.code === "capsule_input_mismatch",
      ),
    ).toBe(true);

    const rowDrift = JSON.parse(JSON.stringify(capsule));
    rowDrift.per_row[0].metrics.grounding = "fail";
    const rowViolations = validateSynthesizeCertCapsuleBinding({
      record,
      capsuleRaw: rowDrift,
    });
    expect(rowViolations.some((v) => v.code === "capsule_row_mismatch")).toBe(true);

    const missingRow = JSON.parse(JSON.stringify(capsule));
    missingRow.per_row = missingRow.per_row.slice(1);
    expect(
      validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: missingRow }).some(
        (v) => v.code === "capsule_row_mismatch",
      ),
    ).toBe(true);
  });

  it("fails closed on an unmet production-contrast obligation", async () => {
    const { record, capsuleArgs } = await assembledLineage();
    const incomplete = assembleSynthesizeCertCapsule({
      ...capsuleArgs,
      productionContrast: { completed: false },
    });
    const violations = validateSynthesizeCertCapsuleBinding({
      record,
      capsuleRaw: JSON.parse(JSON.stringify(incomplete)),
    });
    expect(violations.map((v) => v.code)).toEqual(["obligation_incomplete"]);
  });

  it("reports a smuggled prose channel as source-unsafe", async () => {
    const { record, capsule } = await assembledLineage();
    const smuggled = JSON.parse(JSON.stringify(capsule));
    smuggled.per_input[0].summary = "실 워크북 프로세";
    const violations = validateSynthesizeCertCapsuleBinding({ record, capsuleRaw: smuggled });
    expect(violations.some((v) => v.code === "capsule_source_unsafe")).toBe(true);
    expect(violations.some((v) => v.code === "capsule_schema_invalid")).toBe(true); // strict schema too
  });
});
