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
  reduceColumnLeavesWithTrace,
  type ComprehensionReduceNode,
} from "../reconstruct/comprehension-reduce.js";
import { classifyFrontier } from "../reconstruct/comprehension-semantic-map.js";
import {
  freezeSynthesizeCertPackets,
  type SynthesizeCertAsyncSynthesisFn,
  type SynthesizeCertColumnPipeline,
} from "./synthesize-cert-packet.js";
import {
  collectSynthesizeCertCandidates,
  sampleStratifiedManifest,
  type SynthesizeCertSampledInput,
} from "./synthesize-cert-sampler.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const FIXTURE = sha("packet-fixture");

function leaf(rowStart: number, rowEnd: number, shape: string): ComprehensionReduceNode {
  return {
    region: { sheet: "S", column_index: 3, row_start: rowStart, row_end: rowEnd },
    format_clusters: [shape],
    boundaries: [],
    edge_first_shape: shape,
    edge_last_shape: shape,
    distinct_is_lower_bound: false,
    boundaries_are_lower_bound: false,
    segments_capped: false,
    limiting_witness: null,
  };
}

/** Same mini-pipeline as the S1 tests: 6 leaves, fanin 2, budget 2 → root and
 * M1234 accumulate (merge), M12/M34/M56 are frontier (leaf role). */
function buildPipeline(): SynthesizeCertColumnPipeline {
  const leaves = [
    leaf(1, 10, "int"),
    leaf(11, 20, "int"),
    leaf(21, 30, "int"),
    leaf(31, 40, "text"),
    leaf(41, 50, "text"),
    leaf(51, 60, "text"),
  ];
  const { trace, nodesByKey } = reduceColumnLeavesWithTrace(leaves, 2);
  return { trace, nodesByKey, modes: classifyFrontier(trace, 2) };
}

function sampledEntries(pipeline: SynthesizeCertColumnPipeline): SynthesizeCertSampledInput[] {
  const candidates = collectSynthesizeCertCandidates({
    trace: pipeline.trace,
    nodesByKey: pipeline.nodesByKey,
    modes: pipeline.modes,
    sheetIndex: 0,
  });
  return sampleStratifiedManifest([{ fixture_id: FIXTURE, candidates }]).manifest;
}

const mockRef =
  (tag: string): SynthesizeCertAsyncSynthesisFn =>
  async (input) => ({
    semantic_summary: `${tag}:${input.node_ref.row_start}-${input.node_ref.row_end}:c${input.child_summaries.length}`,
    boundaries: [],
  });

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
