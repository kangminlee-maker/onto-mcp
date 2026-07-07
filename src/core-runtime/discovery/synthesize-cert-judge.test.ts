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
import type {
  SemanticSynthesisInput,
  SemanticSynthesisOutput,
} from "../reconstruct/comprehension-semantic-map.js";
import { projectSemanticMapSynthesisOutput } from "../reconstruct/run.js";
import type { SynthesizeCertJudgementRow } from "./synthesize-cert-record.js";
import { synthesizeCertOutputSha256 } from "./synthesize-cert-loop.js";
import {
  assertSynthesizeCertJudgeVerdicts,
  parseSynthesizeCertJudgeResponseText,
  reconstructSynthesizeCertJudgeReplayInputs,
  SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT,
  type SynthesizeCertJudgeVerdicts,
} from "./synthesize-cert-judge.js";
import { applyInputCorruptionV1 } from "./synthesize-cert-mutation.js";
import {
  createMockSynthesizeCertJudge,
  freezeSynthesizeCertTestPackets,
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
    const { frozen } = await freezeSynthesizeCertTestPackets(FIXTURE);
    const packets = frozen.packets;
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

describe("SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT", () => {
  it("scopes boundary judgement away from deterministic row-matching and covers both metrics", () => {
    expect(SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT).toMatch(/GROUNDING/);
    expect(SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT).toMatch(/BOUNDARY/);
    expect(SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT).toMatch(/outside your scope/i);
    expect(SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT).toMatch(/"grounding"/);
    expect(SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT).toMatch(/"boundary"/);
  });
});

describe("parseSynthesizeCertJudgeResponseText (pure — no LLM)", () => {
  it("parses bare JSON", () => {
    expect(parseSynthesizeCertJudgeResponseText('{"grounding":"pass","boundary":"fail"}')).toEqual({
      grounding: "pass",
      boundary: "fail",
    });
  });

  it("strips a markdown code fence around the JSON", () => {
    const fenced = '```json\n{"grounding":"fail","boundary":"pass"}\n```';
    expect(parseSynthesizeCertJudgeResponseText(fenced)).toEqual({
      grounding: "fail",
      boundary: "pass",
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseSynthesizeCertJudgeResponseText('  \n {"grounding":"pass","boundary":"pass"}\n ')).toEqual({
      grounding: "pass",
      boundary: "pass",
    });
  });

  it("throws (fail-closed) on malformed JSON", () => {
    expect(() => parseSynthesizeCertJudgeResponseText("not json at all")).toThrow(/not valid JSON/);
  });

  it("throws (fail-closed) on a non-object JSON value", () => {
    expect(() => parseSynthesizeCertJudgeResponseText('["pass", "fail"]')).toThrow(/must be a JSON object/);
    expect(() => parseSynthesizeCertJudgeResponseText("null")).toThrow(/must be a JSON object/);
  });

  it("throws (fail-closed) on an out-of-enum verdict", () => {
    expect(() =>
      parseSynthesizeCertJudgeResponseText('{"grounding":"maybe","boundary":"pass"}'),
    ).toThrow(/grounding verdict/);
  });

  it("throws (fail-closed) on a partial or over-complete response", () => {
    expect(() => parseSynthesizeCertJudgeResponseText('{"grounding":"pass"}')).toThrow(
      /exactly \{grounding, boundary\}/,
    );
    expect(() =>
      parseSynthesizeCertJudgeResponseText('{"grounding":"pass","boundary":"pass","extra":1}'),
    ).toThrow(/exactly \{grounding, boundary\}/);
  });
});

describe("reconstructSynthesizeCertJudgeReplayInputs (pure content-hash join — no LLM)", () => {
  const FIXTURE_ID = sha("replay-fixture");
  const original = packet({
    clusters: ["int", "date"],
    seams: [{ row: 10, prev_shape: "int", new_shape: "date" }],
  });
  const armOutput: SemanticSynthesisOutput = {
    semantic_summary: "a region of integers then dates",
    boundaries: [{ row: 10, character_before: "int", character_after: "date" }],
  };
  const outputSha = synthesizeCertOutputSha256(armOutput);
  const rawText = JSON.stringify({
    semantic_summary: armOutput.semantic_summary,
    boundaries: armOutput.boundaries,
  });

  const okRow: SynthesizeCertJudgementRow = {
    row_id: "in1.r1.baseline",
    fixture_id: FIXTURE_ID,
    input_id: "in1",
    input_sha256: sha("in1"),
    rep: 1,
    arm: "baseline",
    stratum: { seam: true, merge: false },
    candidate_output_status: "ok",
    judge_status: "ok",
    metrics: { grounding: "pass", boundary: "pass" },
    output_sha256: outputSha,
    attempts: 1,
  };
  const notRunRow: SynthesizeCertJudgementRow = {
    ...okRow,
    row_id: "in1.r2.baseline",
    rep: 2,
    candidate_output_status: "not_run",
    judge_status: "not_run",
    metrics: { grounding: "not_judged", boundary: "not_judged" },
  };

  const packetsByInputId = new Map([["in1", original]]);
  const join = (capturedCalls: { seq: number; role: string; text?: string | null }[], rows = [okRow]) =>
    reconstructSynthesizeCertJudgeReplayInputs({
      rows,
      originalPacketsByInputId: packetsByInputId,
      capturedCalls,
      projectArmOutput: projectSemanticMapSynthesisOutput,
      hashArmOutput: synthesizeCertOutputSha256,
    });

  it("matches an ok row to its captured call by content-hash identity", () => {
    const result = join([{ seq: 1, role: "baseline", text: rawText }]);
    expect(result.unmatched).toEqual([]);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.row).toBe(okRow);
    expect(result.matched[0]!.judgeInput).toEqual({ original_packet: original, arm_output: armOutput });
  });

  it("fence-strips a markdown-wrapped call before matching", () => {
    const fenced = `\`\`\`json\n${rawText}\n\`\`\``;
    const result = join([{ seq: 1, role: "baseline", text: fenced }]);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.judgeInput.arm_output).toEqual(armOutput);
  });

  it("negative: mutated/corrupted call text does not match — unmatched, not a false positive", () => {
    const corruptedText = JSON.stringify({
      semantic_summary: "a DIFFERENT reading entirely, not grounded the same way",
      boundaries: armOutput.boundaries,
    });
    const result = join([{ seq: 1, role: "baseline", text: corruptedText }]);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([okRow]);
  });

  it("ignores an unusable capture line (malformed JSON or no text) — unmatched, never a crash", () => {
    const result = join([
      { seq: 1, role: "baseline", text: "not json at all" },
      { seq: 2, role: "baseline" }, // failed call capture: no text field
    ]);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([okRow]);
  });

  it("does not cross-match a call from a DIFFERENT arm role, even with identical content", () => {
    const result = join([{ seq: 1, role: "candidate", text: rawText }]); // okRow.arm === "baseline"
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([okRow]);
  });

  it("skips non-ok rows entirely — no attempt, no unmatched flag", () => {
    const result = join([], [notRunRow]);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });

  it("picks the lowest-seq call deterministically on a content-identical sha collision", () => {
    const result = join([
      { seq: 5, role: "baseline", text: rawText },
      { seq: 2, role: "baseline", text: rawText },
    ]);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.judgeInput.arm_output).toEqual(armOutput);
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
