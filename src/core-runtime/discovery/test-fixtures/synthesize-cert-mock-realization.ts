/**
 * B4 bench MOCK realizations (deletion boundary — design v3 §12, mock-realization
 * discipline): the deterministic arm synthesize + judge used by tests, the S8
 * mock E2E, and the orchestrator script's default (no `--go`) mode. Production
 * semantic paths never import this file (G1 test-fixtures import boundary).
 *
 * The mock is MECHANICALLY discriminating, not arm-aware: the arm synthesize
 * derives its output purely from the packet it is given, and the judge
 * re-derives the expected output from the ORIGINAL packet and compares — so a
 * baseline/candidate run (original packet) passes both metrics, while a
 * negative run (mutated packet) fails exactly the metrics whose facts the
 * mutation levers actually moved. The mock E2E's negative contrast is
 * therefore a real content comparison, not a label lookup.
 */
import {
  reduceColumnLeavesWithTrace,
  type ComprehensionReduceNode,
} from "../../reconstruct/comprehension-reduce.js";
import {
  classifyFrontier,
  type SemanticSynthesisInput,
  type SemanticSynthesisOutput,
} from "../../reconstruct/comprehension-semantic-map.js";
import type {
  SynthesizeCertJudgeFn,
} from "../synthesize-cert-judge.js";
import {
  freezeSynthesizeCertPackets,
  type FreezeSynthesizeCertPacketsResult,
  type SynthesizeCertAsyncSynthesisFn,
  type SynthesizeCertColumnPipeline,
} from "../synthesize-cert-packet.js";
import {
  collectSynthesizeCertCandidates,
  sampleStratifiedManifest,
  type SynthesizeCertSampledInput,
  type SynthesizeCertSampleResult,
} from "../synthesize-cert-sampler.js";

/** Deterministic mock "LLM" for ANY arm: output is a pure function of the
 * packet. Summary folds the grounding facts (clusters + child prose);
 * boundaries mirror the packet's seams with their shapes as the semantic
 * characterization. */
export function mockSynthesizeCertArmOutput(
  packet: SemanticSynthesisInput,
): SemanticSynthesisOutput {
  const clusters = [...packet.format_clusters].sort().join(",");
  const children = packet.child_summaries
    .map((c) => `${c.key}=${c.summary}`)
    .join("; ");
  return {
    semantic_summary: `mock-synth rows=${packet.node_ref.row_start}-${packet.node_ref.row_end} clusters=[${clusters}] children=[${children}]`,
    boundaries: packet.value_shape_seams.map((s) => ({
      row: s.row,
      character_before: s.prev_shape,
      character_after: s.new_shape,
    })),
  };
}

const canonicalBoundaries = (
  boundaries: SemanticSynthesisOutput["boundaries"],
): string =>
  JSON.stringify(
    boundaries
      .map((b) => ({ row: b.row, character_before: b.character_before, character_after: b.character_after }))
      .sort(
        (a, b) =>
          a.row - b.row ||
          a.character_before.localeCompare(b.character_before) ||
          a.character_after.localeCompare(b.character_after),
      ),
  );

/** Deterministic mock judge: regenerates the expected output from the ORIGINAL
 * packet (same generator as the mock arms) and compares per metric —
 * grounding on the summary content, boundary on the boundary set. */
export function createMockSynthesizeCertJudge(): SynthesizeCertJudgeFn {
  return async ({ original_packet, arm_output }) => {
    const expected = mockSynthesizeCertArmOutput(original_packet);
    return {
      grounding: arm_output.semantic_summary === expected.semantic_summary ? "pass" : "fail",
      boundary:
        canonicalBoundaries(arm_output.boundaries) === canonicalBoundaries(expected.boundaries)
          ? "pass"
          : "fail",
    };
  };
}

// ── shared deterministic test pipeline (fixture module, not a mock LLM) ───────

/** One hand-built reduce leaf with a uniform shape (no intra-leaf seams). */
export function synthesizeCertTestLeaf(
  rowStart: number,
  rowEnd: number,
  shape: string,
): ComprehensionReduceNode {
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

/** The canonical B4 test column: 6 leaves (rows 1-60, int→text junction at
 * 30/31), fanin 2, over-context budget 2 → root(1-60) and M1234(1-40)
 * accumulate (seam×merge), M34(21-40) is seam×leaf, M12/M56 are noseam×leaf. */
export function buildSynthesizeCertTestPipeline(): SynthesizeCertColumnPipeline {
  const leaves = [
    synthesizeCertTestLeaf(1, 10, "int"),
    synthesizeCertTestLeaf(11, 20, "int"),
    synthesizeCertTestLeaf(21, 30, "int"),
    synthesizeCertTestLeaf(31, 40, "text"),
    synthesizeCertTestLeaf(41, 50, "text"),
    synthesizeCertTestLeaf(51, 60, "text"),
  ];
  const { trace, nodesByKey } = reduceColumnLeavesWithTrace(leaves, 2);
  return { trace, nodesByKey, modes: classifyFrontier(trace, 2) };
}

/** Deterministic mock REFERENCE realization (child authoring): prose folds the
 * node range + consumed-child count, so bottom-up authoring is observable. */
export function mockReferenceSynthesize(tag = "ref"): SynthesizeCertAsyncSynthesisFn {
  return async (input) => ({
    semantic_summary: `${tag}:${input.node_ref.row_start}-${input.node_ref.row_end}:c${input.child_summaries.length}`,
    boundaries: [],
  });
}

/** collect → sample → freeze over the canonical test column, one fixture. */
export async function freezeSynthesizeCertTestPackets(
  fixtureId: string,
  opts?: { referenceTag?: string; sheetIndex?: number },
): Promise<{
  pipeline: SynthesizeCertColumnPipeline;
  entries: SynthesizeCertSampledInput[];
  sample: SynthesizeCertSampleResult;
  frozen: FreezeSynthesizeCertPacketsResult;
}> {
  const pipeline = buildSynthesizeCertTestPipeline();
  const candidates = collectSynthesizeCertCandidates({
    trace: pipeline.trace,
    nodesByKey: pipeline.nodesByKey,
    modes: pipeline.modes,
    sheetIndex: opts?.sheetIndex ?? 0,
  });
  const sample = sampleStratifiedManifest([{ fixture_id: fixtureId, candidates }]);
  const frozen = await freezeSynthesizeCertPackets({
    entries: sample.manifest,
    resolvePipeline: () => pipeline,
    referenceSynthesize: mockReferenceSynthesize(opts?.referenceTag),
  });
  return { pipeline, entries: sample.manifest, sample, frozen };
}
