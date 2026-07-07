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
import type {
  SemanticSynthesisInput,
  SemanticSynthesisOutput,
} from "../../reconstruct/comprehension-semantic-map.js";
import type {
  SynthesizeCertJudgeFn,
} from "../synthesize-cert-judge.js";

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
