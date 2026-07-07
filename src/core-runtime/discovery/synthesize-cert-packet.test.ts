/**
 * S2 packet-freeze tests (design v3 §4/§5/§15.2): reference child authoring is
 * bottom-up, memoized, and spend-honest; frozen packets reproduce byte-stably
 * under the same reference realization; the two-layer identity holds at packet
 * level (reference prose moves input_sha256 but never deterministic_facts_sha256,
 * and leaf packets are reference-independent); manifest↔pipeline binding and
 * malformed reference output fail closed.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  freezeSynthesizeCertPackets,
  parseSynthesizeCertFreezeCheckpoint,
  serializeSynthesizeCertFreezeCheckpoint,
  SYNTHESIZE_CERT_FREEZE_CHECKPOINT_CONTRACT,
  type SynthesizeCertColumnPipeline,
} from "./synthesize-cert-packet.js";
import {
  collectSynthesizeCertCandidates,
  sampleStratifiedManifest,
  type SynthesizeCertSampledInput,
} from "./synthesize-cert-sampler.js";
import {
  buildSynthesizeCertTestPipeline,
  mockReferenceSynthesize,
} from "./test-fixtures/synthesize-cert-mock-realization.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const FIXTURE = sha("packet-fixture");

const buildPipeline = buildSynthesizeCertTestPipeline;
const mockRef = mockReferenceSynthesize;

function sampledEntries(pipeline: SynthesizeCertColumnPipeline): SynthesizeCertSampledInput[] {
  const candidates = collectSynthesizeCertCandidates({
    trace: pipeline.trace,
    nodesByKey: pipeline.nodesByKey,
    modes: pipeline.modes,
    sheetIndex: 0,
  });
  return sampleStratifiedManifest([{ fixture_id: FIXTURE, candidates }]).manifest;
}

describe("freezeSynthesizeCertPackets", () => {
  it("freezes one packet per entry, authoring reference children bottom-up with memoization", async () => {
    const pipeline = buildPipeline();
    const entries = sampledEntries(pipeline);
    expect(entries.length).toBe(5); // non-vacuous subject set
    const result = await freezeSynthesizeCertPackets({
      entries,
      resolvePipeline: () => pipeline,
      referenceSynthesize: mockRef("ref"),
    });
    expect(result.packets.length).toBe(5);
    // Needed reference summaries: M12, M34, M1234, M56 — each authored ONCE
    // even though M1234's subtree is consumed by both sampled merge nodes.
    expect(result.reference_synthesize_calls).toBe(4);
    const byKey = new Map(result.packets.map((p) => [p.node_key, p]));
    const root = byKey.get("S#3:1-60")!;
    // Root's frozen children carry REAL bottom-up reference prose: M1234's
    // summary was itself authored from two child summaries (c2).
    expect(root.packet.child_summaries).toEqual([
      { key: "S#3:1-40", summary: "ref:1-40:c2" },
      { key: "S#3:41-60", summary: "ref:41-60:c0" },
    ]);
    const m1234 = byKey.get("S#3:1-40")!;
    expect(m1234.packet.child_summaries).toEqual([
      { key: "S#3:1-20", summary: "ref:1-20:c0" },
      { key: "S#3:21-40", summary: "ref:21-40:c0" },
    ]);
    // Leaf-role packets freeze with no children and correct identity split.
    for (const key of ["S#3:1-20", "S#3:21-40", "S#3:41-60"]) {
      expect(byKey.get(key)!.packet.child_summaries).toEqual([]);
    }
    for (const p of result.packets) {
      expect(p.input_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(p.deterministic_facts_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("reproduces byte-stably under the same reference realization", async () => {
    const pipeline = buildPipeline();
    const entries = sampledEntries(pipeline);
    const a = await freezeSynthesizeCertPackets({
      entries,
      resolvePipeline: () => pipeline,
      referenceSynthesize: mockRef("ref"),
    });
    const b = await freezeSynthesizeCertPackets({
      entries,
      resolvePipeline: () => pipeline,
      referenceSynthesize: mockRef("ref"),
    });
    expect(b).toEqual(a);
  });

  it("two-layer identity at packet level: reference prose moves input_sha256 only, and only for merge", async () => {
    const pipeline = buildPipeline();
    const entries = sampledEntries(pipeline);
    const refA = await freezeSynthesizeCertPackets({
      entries,
      resolvePipeline: () => pipeline,
      referenceSynthesize: mockRef("refA"),
    });
    const refB = await freezeSynthesizeCertPackets({
      entries,
      resolvePipeline: () => pipeline,
      referenceSynthesize: mockRef("refB"),
    });
    const shasA = new Map(refA.packets.map((p) => [p.node_key, p]));
    for (const p of refB.packets) {
      const other = shasA.get(p.node_key)!;
      expect(p.deterministic_facts_sha256).toBe(other.deterministic_facts_sha256);
      if (p.stratum.merge) {
        expect(p.input_sha256).not.toBe(other.input_sha256); // child prose is IN the packet identity
      } else {
        expect(p.input_sha256).toBe(other.input_sha256); // leaf packets are reference-independent
      }
    }
  });

  it("spends nothing when only leaf entries are frozen", async () => {
    const pipeline = buildPipeline();
    const entries = sampledEntries(pipeline).filter((e) => !e.stratum.merge);
    expect(entries.length).toBe(3);
    const result = await freezeSynthesizeCertPackets({
      entries,
      resolvePipeline: () => pipeline,
      referenceSynthesize: async () => {
        throw new Error("leaf freeze must not dispatch");
      },
    });
    expect(result.reference_synthesize_calls).toBe(0);
    expect(result.packets.length).toBe(3);
  });

  it("fails closed on a stale/tampered manifest, a flipped merge flag, and an unknown node", async () => {
    const pipeline = buildPipeline();
    const entries = sampledEntries(pipeline);
    const tampered = { ...entries[0]!, deterministic_facts_sha256: sha("lie") };
    await expect(
      freezeSynthesizeCertPackets({
        entries: [tampered],
        resolvePipeline: () => pipeline,
        referenceSynthesize: mockRef("ref"),
      }),
    ).rejects.toThrow(/deterministic facts recompute/);
    const leafEntry = entries.find((e) => !e.stratum.merge)!;
    const flipped = { ...leafEntry, stratum: { ...leafEntry.stratum, merge: true } };
    await expect(
      freezeSynthesizeCertPackets({
        entries: [flipped],
        resolvePipeline: () => pipeline,
        referenceSynthesize: mockRef("ref"),
      }),
    ).rejects.toThrow(/declares merge=true/);
    const unknown = { ...entries[0]!, node_key: "S#9:1-2" };
    await expect(
      freezeSynthesizeCertPackets({
        entries: [unknown],
        resolvePipeline: () => pipeline,
        referenceSynthesize: mockRef("ref"),
      }),
    ).rejects.toThrow(/absent from its resolved pipeline/);
  });

  it("rejects malformed reference output instead of freezing it", async () => {
    const pipeline = buildPipeline();
    const entries = sampledEntries(pipeline).filter((e) => e.stratum.merge);
    await expect(
      freezeSynthesizeCertPackets({
        entries,
        resolvePipeline: () => pipeline,
        referenceSynthesize: async (input) => ({
          semantic_summary: `ref:${input.node_ref.row_start}`,
          boundaries: [],
          raw_cells: ["1,234"],
        }) as never,
      }),
    ).rejects.toThrow(/unexpected field/);
  });
});

describe("synthesize-cert freeze checkpoint (--resume, owner decision D1)", () => {
  const MANIFEST_IDENTITY = sha("manifest-identity");

  async function frozenResult(): Promise<{
    frozen: Awaited<ReturnType<typeof freezeSynthesizeCertPackets>>;
    inputIds: string[];
  }> {
    const pipeline = buildPipeline();
    const entries = sampledEntries(pipeline);
    const frozen = await freezeSynthesizeCertPackets({
      entries,
      resolvePipeline: () => pipeline,
      referenceSynthesize: mockRef("ref"),
    });
    return { frozen, inputIds: entries.map((e) => e.input_id) };
  }

  it("round-trips: serialize → parse reproduces the exact frozen result", async () => {
    const { frozen, inputIds } = await frozenResult();
    expect(inputIds.length).toBe(5); // non-vacuous subject set
    const checkpoint = serializeSynthesizeCertFreezeCheckpoint(frozen, MANIFEST_IDENTITY);
    expect(checkpoint.checkpoint_contract).toBe(SYNTHESIZE_CERT_FREEZE_CHECKPOINT_CONTRACT);
    // Simulate the real path: JSON.stringify → disk → JSON.parse → re-verify.
    const roundTripped = JSON.parse(JSON.stringify(checkpoint));
    const parsed = parseSynthesizeCertFreezeCheckpoint(roundTripped, {
      expectedManifestIdentitySha256: MANIFEST_IDENTITY,
      expectedInputIds: inputIds,
    });
    expect(parsed).toEqual(frozen);
  });

  it("fails closed on a contract tag mismatch", async () => {
    const { frozen, inputIds } = await frozenResult();
    const checkpoint = serializeSynthesizeCertFreezeCheckpoint(frozen, MANIFEST_IDENTITY);
    const tampered = { ...checkpoint, checkpoint_contract: "some-other-contract/v1" };
    expect(() =>
      parseSynthesizeCertFreezeCheckpoint(tampered, {
        expectedManifestIdentitySha256: MANIFEST_IDENTITY,
        expectedInputIds: inputIds,
      }),
    ).toThrow(/carries contract/);
  });

  it("fails closed on a manifest identity mismatch", async () => {
    const { frozen, inputIds } = await frozenResult();
    const checkpoint = serializeSynthesizeCertFreezeCheckpoint(frozen, MANIFEST_IDENTITY);
    expect(() =>
      parseSynthesizeCertFreezeCheckpoint(checkpoint, {
        expectedManifestIdentitySha256: sha("a-different-manifest"),
        expectedInputIds: inputIds,
      }),
    ).toThrow(/manifest identity/);
  });

  it("fails closed when the checkpoint's input_id set has an EXTRA id beyond the expected manifest", async () => {
    const { frozen, inputIds } = await frozenResult();
    const checkpoint = serializeSynthesizeCertFreezeCheckpoint(frozen, MANIFEST_IDENTITY);
    expect(() =>
      parseSynthesizeCertFreezeCheckpoint(checkpoint, {
        expectedManifestIdentitySha256: MANIFEST_IDENTITY,
        expectedInputIds: inputIds.slice(1), // expected manifest is missing the first id
      }),
    ).toThrow(/input_id set disagrees/);
  });

  it("fails closed when the checkpoint's input_id set is MISSING an id the expected manifest requires", async () => {
    const { frozen, inputIds } = await frozenResult();
    const checkpoint = serializeSynthesizeCertFreezeCheckpoint(frozen, MANIFEST_IDENTITY);
    expect(() =>
      parseSynthesizeCertFreezeCheckpoint(checkpoint, {
        expectedManifestIdentitySha256: MANIFEST_IDENTITY,
        expectedInputIds: [...inputIds, "an-id-the-checkpoint-never-froze"],
      }),
    ).toThrow(/input_id set disagrees/);
  });

  it("fails closed on a tampered/corrupted packet whose input_sha256 no longer recomputes", async () => {
    const { frozen, inputIds } = await frozenResult();
    const checkpoint = serializeSynthesizeCertFreezeCheckpoint(frozen, MANIFEST_IDENTITY);
    const tampered = {
      ...checkpoint,
      packets: checkpoint.packets.map((p, i) =>
        i === 0 ? { ...p, packet: { ...p.packet, format_clusters: [...p.packet.format_clusters, "tampered"] } } : p,
      ),
    };
    expect(() =>
      parseSynthesizeCertFreezeCheckpoint(tampered, {
        expectedManifestIdentitySha256: MANIFEST_IDENTITY,
        expectedInputIds: inputIds,
      }),
    ).toThrow(/recomputes input_sha256/);
  });
});
