/**
 * S6 capsule tests (design v3 §18/§15.6): assembly from a REAL mock run
 * lineage produces a schema-valid, source-safe capsule whose bindings
 * (manifest digest, per-input identity, per-row verdicts, negative lever
 * provenance) all cross-check; every integrity lie throws; the source-safety
 * guard rejects smuggled prose/sheet-name channels (negative contrast); the
 * obligation flags are structured and honest.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assembleSynthesizeCertCapsule,
  assertSynthesizeCertCapsuleSourceSafe,
  parseSynthesizeCertCapsule,
  synthesizeCertChildSummariesSha256,
  synthesizeCertManifestSha256,
  SYNTHESIZE_CERT_DEFAULT_LIMITATION_IDS,
  type AssembleSynthesizeCertCapsuleArgs,
} from "./synthesize-cert-capsule.js";
import { runSynthesizeCertLoop } from "./synthesize-cert-loop.js";
import type { SynthesizeCertRecord } from "./synthesize-cert-record.js";
import {
  createMockSynthesizeCertJudge,
  freezeSynthesizeCertTestPackets,
  mockSynthesizeCertArmOutput,
} from "./test-fixtures/synthesize-cert-mock-realization.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const FIXTURE = sha("capsule-fixture");
const SEED = "b4-capsule-seed";

async function mockRunLineage() {
  const { frozen, sample } = await freezeSynthesizeCertTestPackets(FIXTURE);
  const mockArm = async (packet: Parameters<typeof mockSynthesizeCertArmOutput>[0]) =>
    mockSynthesizeCertArmOutput(packet);
  const loop = await runSynthesizeCertLoop({
    packets: frozen.packets,
    declaredReps: 3,
    arms: { baseline: mockArm, candidate: mockArm, negative_control: mockArm },
    judge: createMockSynthesizeCertJudge(),
    mutationSeed: SEED,
  });
  const inputManifest: SynthesizeCertRecord["input_manifest"] = sample.manifest.map((e) => {
    const packet = frozen.packets.find((p) => p.input_id === e.input_id)!;
    return {
      fixture_id: e.fixture_id,
      input_id: e.input_id,
      input_sha256: packet.input_sha256,
      stratum: e.stratum,
    };
  });
  const args: AssembleSynthesizeCertCapsuleArgs = {
    recordRef: "development-records/benchmark/fixtures/synthesize-cert/mock-record.json",
    inputManifest,
    judgementRows: loop.rows,
    sampledEntries: sample.manifest,
    samplingProvenance: sample.provenance,
    samplerVersion: sample.sampler_version,
    perStratumK: sample.per_stratum_k,
    declaredReps: sample.declared_reps,
    manifestIdentitySha256: sample.manifest_identity_sha256,
    packets: frozen.packets,
    negativeMutations: loop.negative_mutations,
    productionContrast: { completed: false },
  };
  return { frozen, sample, loop, inputManifest, args };
}

describe("assembleSynthesizeCertCapsule", () => {
  it("assembles a schema-valid, source-safe capsule from the full mock lineage", async () => {
    const { frozen, loop, inputManifest, args } = await mockRunLineage();
    const capsule = assembleSynthesizeCertCapsule(args);
    expect(capsule.per_input.length).toBe(5); // non-vacuous subject set
    expect(capsule.per_row.length).toBe(45);
    expect(capsule.record_input_manifest_sha256).toBe(
      synthesizeCertManifestSha256(inputManifest),
    );
    expect(capsule.production_contrast).toEqual({ required: true, completed: false });
    expect(capsule.limitation_ids).toEqual([...SYNTHESIZE_CERT_DEFAULT_LIMITATION_IDS]);
    // Child prose is digest-only: merge inputs carry a sha, leaves null.
    const packetByInputId = new Map(frozen.packets.map((p) => [p.input_id, p]));
    for (const entry of capsule.per_input) {
      const packet = packetByInputId.get(entry.input_id)!;
      if (entry.stratum.merge) {
        expect(entry.child_summaries_sha256).toBe(synthesizeCertChildSummariesSha256(packet));
        expect(entry.child_summaries_sha256).toMatch(/^[0-9a-f]{64}$/);
      } else {
        expect(entry.child_summaries_sha256).toBeNull();
      }
    }
    // Negative rows carry per-metric lever provenance bound to the loop's record.
    const negativeRows = capsule.per_row.filter((r) => r.arm === "negative_control");
    expect(negativeRows.length).toBe(15);
    for (const row of negativeRows) {
      expect(row.negative_lever_applied).toEqual(
        loop.negative_mutations.get(row.input_id)!.levers_applied,
      );
    }
    for (const row of capsule.per_row.filter((r) => r.arm !== "negative_control")) {
      expect(row.negative_lever_applied).toBeUndefined();
    }
    // Round-trips through the parser; the raw JSON is source-safe.
    const raw = JSON.parse(JSON.stringify(capsule));
    expect(parseSynthesizeCertCapsule(raw).capsule).toEqual(capsule);
    assertSynthesizeCertCapsuleSourceSafe(raw);
  });

  it("is deterministic", async () => {
    const { args } = await mockRunLineage();
    expect(assembleSynthesizeCertCapsule(args)).toEqual(assembleSynthesizeCertCapsule(args));
  });

  it("throws on every broken lineage binding (integrity negatives)", async () => {
    const { args } = await mockRunLineage();
    // Missing frozen packet for a manifest input.
    expect(() =>
      assembleSynthesizeCertCapsule({ ...args, packets: args.packets.slice(1) }),
    ).toThrow(/no frozen packet/);
    // Missing sampled entry.
    expect(() =>
      assembleSynthesizeCertCapsule({ ...args, sampledEntries: args.sampledEntries.slice(1) }),
    ).toThrow(/no sampled entry/);
    // Manifest sha disagreeing with the frozen packet.
    const [first, ...rest] = args.inputManifest;
    expect(() =>
      assembleSynthesizeCertCapsule({
        ...args,
        inputManifest: [{ ...first!, input_sha256: sha("drift") }, ...rest],
      }),
    ).toThrow(/disagrees with its frozen packet/);
    // Missing mutation provenance for a negative row.
    expect(() =>
      assembleSynthesizeCertCapsule({ ...args, negativeMutations: new Map() }),
    ).toThrow(/no mutation provenance/);
    // Mutation sha disagreeing with the negative row.
    const lying = new Map(
      [...args.negativeMutations].map(([k, v]) => [
        k,
        { ...v, mutated_input_sha256: sha("lie") },
      ]),
    );
    expect(() =>
      assembleSynthesizeCertCapsule({ ...args, negativeMutations: lying }),
    ).toThrow(/disagrees with the recorded mutation/);
  });
});

describe("source-safety guard + schema (negative contrast)", () => {
  it("rejects smuggled prose and sheet-name channels at BOTH layers", async () => {
    const { args } = await mockRunLineage();
    const capsule = assembleSynthesizeCertCapsule(args);
    for (const smuggle of [
      { key: "summary", value: "총 결제금액 합계" },
      { key: "child_summaries", value: [{ key: "S#3:1-20", summary: "prose" }] },
      { key: "sheet", value: "결제및수익인식" },
      { key: "node_ref", value: { sheet: "S", column_index: 3, row_start: 1, row_end: 60 } },
    ]) {
      const raw = JSON.parse(JSON.stringify(capsule));
      raw.per_input[0][smuggle.key] = smuggle.value;
      expect(() => assertSynthesizeCertCapsuleSourceSafe(raw)).toThrow(/forbidden key/);
      expect(parseSynthesizeCertCapsule(raw).violations.length).toBeGreaterThan(0); // strict schema
    }
    // Contrast control: the clean capsule passes both layers.
    assertSynthesizeCertCapsuleSourceSafe(JSON.parse(JSON.stringify(capsule)));
  });

  it("rejects dishonest obligation and lever shapes", async () => {
    const { args } = await mockRunLineage();
    const capsule = assembleSynthesizeCertCapsule(args);
    const notRequired = JSON.parse(JSON.stringify(capsule));
    notRequired.production_contrast.required = false;
    expect(parseSynthesizeCertCapsule(notRequired).capsule).toBeNull();
    const wrongContract = JSON.parse(JSON.stringify(capsule));
    wrongContract.capsule_contract = "synthesize-cert-capsule/v0";
    expect(parseSynthesizeCertCapsule(wrongContract).capsule).toBeNull();
    const leverOnBaseline = JSON.parse(JSON.stringify(capsule));
    const baselineRow = leverOnBaseline.per_row.find(
      (r: { arm: string }) => r.arm === "baseline",
    );
    baselineRow.negative_lever_applied = { grounding: true, boundary: true };
    expect(parseSynthesizeCertCapsule(leverOnBaseline).capsule).toBeNull();
    const leverlessNegative = JSON.parse(JSON.stringify(capsule));
    const negativeRow = leverlessNegative.per_row.find(
      (r: { arm: string }) => r.arm === "negative_control",
    );
    delete negativeRow.negative_lever_applied;
    expect(parseSynthesizeCertCapsule(leverlessNegative).capsule).toBeNull();
  });
});
