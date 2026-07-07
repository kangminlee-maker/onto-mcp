/**
 * S4 judge tests (design v3 §7/§15.4): the mock judge is deterministic,
 * always verdicts BOTH metrics (decisive-row requirement), and discriminates
 * by CONTENT against the original packet — original-derived outputs pass,
 * mutation-derived outputs fail exactly the lever-targeted metrics (per-metric
 * mirror: no-seam negatives fail grounding only; a facts-inert seam offset
 * fails boundary only; spurious boundaries on a no-seam packet fail boundary).
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  reduceColumnLeavesWithTrace,
  type ComprehensionReduceNode,
} from "../reconstruct/comprehension-reduce.js";
import {
  classifyFrontier,
  type SemanticSynthesisInput,
} from "../reconstruct/comprehension-semantic-map.js";
import {
  assertSynthesizeCertJudgeVerdicts,
  type SynthesizeCertJudgeVerdicts,
} from "./synthesize-cert-judge.js";
import { applyInputCorruptionV1 } from "./synthesize-cert-mutation.js";
import { freezeSynthesizeCertPackets } from "./synthesize-cert-packet.js";
import {
  collectSynthesizeCertCandidates,
  sampleStratifiedManifest,
} from "./synthesize-cert-sampler.js";
import {
  createMockSynthesizeCertJudge,
  mockSynthesizeCertArmOutput,
} from "./test-fixtures/synthesize-cert-mock-realization.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const FIXTURE = sha("judge-fixture");
const SEED = "b4-judge-seed";

function packet(args: {
  clusters?: string[];
  seams?: { row: number; prev_shape: string; new_shape: string }[];
  children?: { key: string; summary: string }[];
}): SemanticSynthesisInput {
  return {
    node_ref: { sheet: "S", column_index: 1, row_start: 1, row_end: 60 },
    format_clusters: args.clusters ?? [],
    value_shape_seams: args.seams ?? [],
    child_summaries: args.children ?? [],
  };
}

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

describe("mock judge realization", () => {
  const judge = createMockSynthesizeCertJudge();

  it("passes both metrics for an original-derived output and is deterministic", async () => {
    const original = packet({
      clusters: ["date", "int"],
      seams: [{ row: 30, prev_shape: "int", new_shape: "date" }],
      children: [{ key: "S#1:1-30", summary: "ints" }],
    });
    const output = mockSynthesizeCertArmOutput(original);
    const a = await judge({ original_packet: original, arm_output: output });
    const b = await judge({ original_packet: original, arm_output: output });
    expect(a).toEqual({ grounding: "pass", boundary: "pass" });
    expect(b).toEqual(a);
    assertSynthesizeCertJudgeVerdicts(a); // both metrics always verdicted
  });

  it("fails BOTH metrics for a seam-stratum mutation (grounding + boundary levers live)", async () => {
    const original = packet({
      clusters: ["int"],
      seams: [{ row: 30, prev_shape: "int", new_shape: "date" }],
    });
    const { mutated } = applyInputCorruptionV1(original, { seed: SEED });
    const verdicts = await judge({
      original_packet: original,
      arm_output: mockSynthesizeCertArmOutput(mutated),
    });
    expect(verdicts).toEqual({ grounding: "fail", boundary: "fail" });
  });

  it("per-metric mirror: a no-seam mutation fails grounding only; a facts-inert seam offset fails boundary only", async () => {
    const noSeam = packet({ clusters: ["int", "text"] });
    const noSeamMutated = applyInputCorruptionV1(noSeam, { seed: SEED });
    expect(noSeamMutated.levers_applied).toEqual({ grounding: true, boundary: false });
    expect(
      await judge({
        original_packet: noSeam,
        arm_output: mockSynthesizeCertArmOutput(noSeamMutated.mutated),
      }),
    ).toEqual({ grounding: "fail", boundary: "pass" });

    const seamOnly = packet({ seams: [{ row: 30, prev_shape: "int", new_shape: "date" }] });
    const seamOnlyMutated = applyInputCorruptionV1(seamOnly, { seed: SEED });
    expect(seamOnlyMutated.levers_applied).toEqual({ grounding: false, boundary: true });
    expect(
      await judge({
        original_packet: seamOnly,
        arm_output: mockSynthesizeCertArmOutput(seamOnlyMutated.mutated),
      }),
    ).toEqual({ grounding: "pass", boundary: "fail" });
  });

  it("fails boundary on a spurious boundary over a no-seam packet", async () => {
    const original = packet({ clusters: ["int"] });
    const spurious = {
      ...mockSynthesizeCertArmOutput(original),
      boundaries: [{ row: 7, character_before: "int", character_after: "text" }],
    };
    expect(await judge({ original_packet: original, arm_output: spurious })).toEqual({
      grounding: "pass",
      boundary: "fail",
    });
  });

  it("discriminates real frozen packets end to end: originals pass, mutations fail a targeted metric", async () => {
    const leaves = [
      leaf(1, 10, "int"),
      leaf(11, 20, "int"),
      leaf(21, 30, "int"),
      leaf(31, 40, "text"),
      leaf(41, 50, "text"),
      leaf(51, 60, "text"),
    ];
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace(leaves, 2);
    const pipeline = { trace, nodesByKey, modes: classifyFrontier(trace, 2) };
    const candidates = collectSynthesizeCertCandidates({ ...pipeline, sheetIndex: 0 });
    const entries = sampleStratifiedManifest([{ fixture_id: FIXTURE, candidates }]).manifest;
    const { packets } = await freezeSynthesizeCertPackets({
      entries,
      resolvePipeline: () => pipeline,
      referenceSynthesize: async (input) => ({
        semantic_summary: `ref:${input.node_ref.row_start}-${input.node_ref.row_end}`,
        boundaries: [],
      }),
    });
    expect(packets.length).toBeGreaterThan(0); // non-vacuous subject set
    for (const frozen of packets) {
      const originalVerdicts = await judge({
        original_packet: frozen.packet,
        arm_output: mockSynthesizeCertArmOutput(frozen.packet),
      });
      expect(originalVerdicts).toEqual({ grounding: "pass", boundary: "pass" });
      const corrupted = applyInputCorruptionV1(frozen.packet, { seed: SEED });
      const negativeVerdicts = await judge({
        original_packet: frozen.packet,
        arm_output: mockSynthesizeCertArmOutput(corrupted.mutated),
      });
      expect(negativeVerdicts.grounding).toBe("fail"); // every real node carries clusters
      expect(negativeVerdicts.boundary).toBe(frozen.stratum.seam ? "fail" : "pass");
    }
  });
});

describe("assertSynthesizeCertJudgeVerdicts", () => {
  it("rejects out-of-enum and partial verdicts (fail-closed)", () => {
    expect(() =>
      assertSynthesizeCertJudgeVerdicts({ grounding: "pass", boundary: "maybe" } as never),
    ).toThrow(/boundary verdict/);
    expect(() =>
      assertSynthesizeCertJudgeVerdicts({ grounding: "pass" } as never),
    ).toThrow(/exactly \{grounding, boundary\}/);
    expect(() =>
      assertSynthesizeCertJudgeVerdicts({
        grounding: "pass",
        boundary: "fail",
        extra: 1,
      } as unknown as SynthesizeCertJudgeVerdicts),
    ).toThrow(/exactly \{grounding, boundary\}/);
    assertSynthesizeCertJudgeVerdicts({ grounding: "fail", boundary: "pass" }); // contrast
  });
});
