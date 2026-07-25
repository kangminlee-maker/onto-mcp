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
import {
  projectSemanticMapSynthesisOutput,
} from "../reconstruct/semantic-map-authoring.js";
import type { SynthesizeCertJudgementRow } from "./synthesize-cert-record.js";
import { synthesizeCertOutputSha256 } from "./synthesize-cert-loop.js";
import {
  assertClaimsGroundedInText,
  assertSynthesizeCertJudgeVerdicts,
  assertSynthesizeCertStructuralClaims,
  parseSynthesizeCertJudgeResponseText,
  parseSynthesizeCertStructuralClaimsResponseText,
  reconstructSynthesizeCertJudgeReplayInputs,
  SynthesizeCertClaimHonestyViolation,
  SynthesizeCertClaimParseFail,
  SYNTHESIZE_CERT_JUDGE_SYSTEM_PROMPT,
  SYNTHESIZE_CERT_STRUCTURAL_CLAIM_EXTRACTION_SYSTEM_PROMPT,
  verifyStructuralGrounding,
  type SynthesizeCertJudgeVerdicts,
  type SynthesizeCertStructuralClaims,
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

describe("verifyStructuralGrounding — R7 Group A fixture reproduction (core falsifiable gate)", () => {
  // Ten real cases from the R7 grounding-disagreement audit (candidate arm,
  // gpt-5.5 grounding=fail -> opus grounding=pass), reproduced VERBATIM
  // (packet facts + the arm's actual claims) from
  // development-records/benchmark/synthesize-cert/20260707-live/local/
  // r7-grounding-audit.md. Owner's manual packet-comparison classified 8 as
  // "gloss" (factually accurate, gpt-5.5 over-penalized interpretive
  // phrasing) and 2 as genuine "slip" (a fabricated fact) — cases 3 and 7
  // below. This is the core gate: if the deterministic verifier does not
  // reproduce that exact 8/2 split, the rule needs rework before anything
  // else in this cut is worth building.
  interface Case {
    label: string;
    packet: SemanticSynthesisInput;
    regionStart: number;
    regionEnd: number;
    claims: SynthesizeCertStructuralClaims;
    expectClean: boolean;
    expectedCode?: "fabricated_boundary_row" | "fabricated_transition_row";
  }

  const cases: Case[] = [
    {
      label: "case 1 (14336, no seam, uniform INT) — gloss",
      packet: packet({ clusters: ["INT"] }),
      regionStart: 1,
      regionEnd: 14336,
      claims: { cited_boundary_rows: [], cited_format_labels: ["INT"], cited_transitions: [] },
      expectClean: true,
    },
    {
      label: "case 2 (2049-4096, seam@3073 DEC->INT, r1) — gloss",
      packet: packet({ clusters: ["DEC", "INT"], seams: [{ row: 3073, prev_shape: "DEC", new_shape: "INT" }] }),
      regionStart: 2049,
      regionEnd: 4096,
      claims: {
        cited_boundary_rows: [3073],
        cited_format_labels: ["DEC", "INT"],
        cited_transitions: [{ at_row: 3073, from: "DEC", to: "INT" }],
      },
      expectClean: true,
    },
    {
      label: "case 3 (SAME packet as case 2, r3) — SLIP: cites fabricated boundary row 2072 (real seam is 3073)",
      packet: packet({ clusters: ["DEC", "INT"], seams: [{ row: 3073, prev_shape: "DEC", new_shape: "INT" }] }),
      regionStart: 2049,
      regionEnd: 4096,
      claims: {
        cited_boundary_rows: [2072, 3073], // "DEC ... through row 2072" — no seam supports 2072
        cited_format_labels: ["DEC", "INT"],
        cited_transitions: [{ at_row: 3073, from: "DEC", to: "INT" }],
      },
      expectClean: false,
      expectedCode: "fabricated_boundary_row",
    },
    {
      label: "case 4 (1-10240, seam@4099 DEC->INT) — gloss",
      packet: packet({ clusters: ["DEC", "INT"], seams: [{ row: 4099, prev_shape: "DEC", new_shape: "INT" }] }),
      regionStart: 1,
      regionEnd: 10240,
      claims: {
        cited_boundary_rows: [4099],
        cited_format_labels: ["DEC", "INT"],
        cited_transitions: [{ at_row: 4099, from: "DEC", to: "INT" }],
      },
      expectClean: true,
    },
    {
      label: "case 5 (1-16384, THREE seams, 4-region) — gloss (accurate multi-seam contrast)",
      packet: packet({
        clusters: ["DEC", "INT"],
        seams: [
          { row: 4099, prev_shape: "DEC", new_shape: "INT" },
          { row: 12327, prev_shape: "INT", new_shape: "DEC" },
          { row: 13392, prev_shape: "DEC", new_shape: "INT" },
        ],
      }),
      regionStart: 1,
      regionEnd: 16384,
      claims: {
        cited_boundary_rows: [4099, 12327, 13392],
        cited_format_labels: ["DEC", "INT"],
        cited_transitions: [
          { at_row: 4099, from: "DEC", to: "INT" },
          { at_row: 12327, from: "INT", to: "DEC" },
          { at_row: 13392, from: "DEC", to: "INT" },
        ],
      },
      expectClean: true,
    },
    {
      label: "case 6 (53249-79872, seams@75501/75978) — gloss",
      packet: packet({
        clusters: ["DEC", "INT"],
        seams: [
          { row: 75501, prev_shape: "INT", new_shape: "DEC" },
          { row: 75978, prev_shape: "DEC", new_shape: "INT" },
        ],
      }),
      regionStart: 53249,
      regionEnd: 79872,
      claims: {
        cited_boundary_rows: [75501, 75978],
        cited_format_labels: ["INT", "DEC"],
        cited_transitions: [
          { at_row: 75501, from: "INT", to: "DEC" },
          { at_row: 75978, from: "DEC", to: "INT" },
        ],
      },
      expectClean: true,
    },
    {
      // Owner correction (2026-07-07): case 7 IS a merge node with two
      // child_summaries whose keys encode the 20481-30720 / 30721-34816
      // split — the candidate's boundary at row 30721 faithfully reflects
      // that packet-supplied child content (child1: uniform INT; child2:
      // INT-then-DEC). The child-partition row is a grounded structural
      // fact, not a fabrication — this was gpt-5.5's ACTUAL miss and opus's
      // correct call (the owner's first manual pass missed the children).
      label: "case 7 (20481-34816, merge w/ child_summaries, seam@33938) — gloss: 30721 is grounded by the child-partition boundary",
      packet: packet({
        clusters: ["DEC", "INT"],
        seams: [{ row: 33938, prev_shape: "INT", new_shape: "DEC" }],
        children: [
          { key: "S#81:20481-30720", summary: "single INT value-shape, no seam" },
          { key: "S#81:30721-34816", summary: "INT-dominant then DEC-dominant, transition from whole-number to decimal shaped values" },
        ],
      }),
      regionStart: 20481,
      regionEnd: 34816,
      claims: {
        cited_boundary_rows: [30721, 33938], // 30721 is the child-key split (grounded), 33938 is the seam (grounded)
        cited_format_labels: ["INT", "DEC"],
        cited_transitions: [{ at_row: 33938, from: "INT", to: "DEC" }],
      },
      expectClean: true,
    },
    {
      label: "case 8 (1-1024, no seam, uniform INT) — gloss",
      packet: packet({ clusters: ["INT"] }),
      regionStart: 1,
      regionEnd: 1024,
      claims: { cited_boundary_rows: [], cited_format_labels: ["INT"], cited_transitions: [] },
      expectClean: true,
    },
    {
      label: "case 9 (1-1924, seam@1630 ISO_DATE->DEC, r2) — gloss",
      packet: packet({ clusters: ["DEC", "ISO_DATE"], seams: [{ row: 1630, prev_shape: "ISO_DATE", new_shape: "DEC" }] }),
      regionStart: 1,
      regionEnd: 1924,
      claims: {
        cited_boundary_rows: [1630],
        cited_format_labels: ["ISO_DATE", "DEC"],
        cited_transitions: [{ at_row: 1630, from: "ISO_DATE", to: "DEC" }],
      },
      expectClean: true,
    },
    {
      label: "case 10 (SAME packet as case 9, r3) — gloss",
      packet: packet({ clusters: ["DEC", "ISO_DATE"], seams: [{ row: 1630, prev_shape: "ISO_DATE", new_shape: "DEC" }] }),
      regionStart: 1,
      regionEnd: 1924,
      claims: {
        cited_boundary_rows: [1630],
        cited_format_labels: ["ISO_DATE", "DEC"],
        cited_transitions: [{ at_row: 1630, from: "ISO_DATE", to: "DEC" }],
      },
      expectClean: true,
    },
  ];

  it("reproduces the owner's CORRECTED 9 clean / 1 violation split exactly (case 7 flips to clean once child_summaries are honored)", () => {
    const clean = cases.filter((c) => c.expectClean);
    const violating = cases.filter((c) => !c.expectClean);
    expect(clean).toHaveLength(9); // non-vacuous — pins the fixture set itself
    expect(violating).toHaveLength(1);
    expect(violating[0]!.label).toMatch(/^case 3 /); // the ONLY genuine slip: no children, 2072 is a bare fabrication
  });

  for (const c of cases) {
    it(c.label, () => {
      const violations = verifyStructuralGrounding({
        packet: c.packet,
        regionStart: c.regionStart,
        regionEnd: c.regionEnd,
        claims: c.claims,
      });
      if (c.expectClean) {
        expect(violations).toEqual([]);
      } else {
        expect(violations.length).toBeGreaterThan(0);
        expect(violations.some((v) => v.code === c.expectedCode)).toBe(true);
      }
    });
  }

  it("does NOT flag completeness — omitting a real seam from claims is not a violation", () => {
    const p = packet({ clusters: ["DEC", "INT"], seams: [{ row: 50, prev_shape: "DEC", new_shape: "INT" }] });
    const violations = verifyStructuralGrounding({
      packet: p,
      regionStart: 1,
      regionEnd: 100,
      claims: { cited_boundary_rows: [], cited_format_labels: [], cited_transitions: [] }, // says nothing at all
    });
    expect(violations).toEqual([]);
  });

  // SGF revision (owner correction, post-live-extraction analysis): format
  // labels are NEVER checked by this verifier — natural-language summary
  // vocabulary ("integer") vs packet codes ("INT") is an LLM-semantic
  // residual, not a structural fact. These tests pin that NON-behavior.
  it("format labels are NEVER checked, even when they name something absent from format_clusters", () => {
    const p = packet({ clusters: ["INT"] });
    const violations = verifyStructuralGrounding({
      packet: p,
      regionStart: 1,
      regionEnd: 10,
      claims: { cited_boundary_rows: [], cited_format_labels: ["DEC"], cited_transitions: [] }, // DEC absent from clusters — irrelevant now
    });
    expect(violations).toEqual([]);
  });

  it("natural-language format vocabulary ('integer'/'decimal') never fabricates against packet codes ('INT'/'DEC')", () => {
    const p = packet({ clusters: ["INT", "DEC"], seams: [{ row: 50, prev_shape: "INT", new_shape: "DEC" }] });
    const violations = verifyStructuralGrounding({
      packet: p,
      regionStart: 1,
      regionEnd: 100,
      claims: {
        cited_boundary_rows: [50],
        cited_format_labels: ["integer", "decimal"], // natural language, not the packet's own "INT"/"DEC" codes
        cited_transitions: [{ at_row: 50, from: "integer", to: "decimal" }], // from/to text also unchecked
      },
    });
    expect(violations).toEqual([]);
  });

  it("fabricated_transition_row: a transition's at_row is checked, NOT its from/to labels (a swapped direction at a real seam row is clean)", () => {
    const p = packet({ clusters: ["INT", "DEC"], seams: [{ row: 100, prev_shape: "INT", new_shape: "DEC" }] });
    const violations = verifyStructuralGrounding({
      packet: p,
      regionStart: 1,
      regionEnd: 200,
      claims: {
        cited_boundary_rows: [100],
        cited_format_labels: ["INT", "DEC"],
        cited_transitions: [{ at_row: 100, from: "DEC", to: "INT" }], // swapped direction, but row 100 IS the seam row
      },
    });
    expect(violations).toEqual([]); // only at_row is checked, and 100 matches the seam exactly
  });

  it("fabricated_transition_row: a transition cited at a NON-seam row violates, even if that row is a valid BOUNDARY row", () => {
    const p = packet({
      clusters: ["INT", "DEC"],
      seams: [{ row: 100, prev_shape: "INT", new_shape: "DEC" }],
      children: [
        { key: "S#1:1-50", summary: "child 1" },
        { key: "S#1:51-200", summary: "child 2" },
      ],
    });
    const violations = verifyStructuralGrounding({
      packet: p,
      regionStart: 1,
      regionEnd: 200,
      claims: {
        cited_boundary_rows: [51], // valid: grounded by the child-partition start
        cited_format_labels: [],
        cited_transitions: [{ at_row: 51, from: "INT", to: "DEC" }], // NOT valid: 51 is a child boundary, not a seam row
      },
    });
    expect(violations).toEqual([
      { code: "fabricated_transition_row", message: expect.stringContaining("51") },
    ]);
  });

  it("region start/end are always valid boundary rows even on a no-seam packet", () => {
    const p = packet({ clusters: ["INT"] });
    const violations = verifyStructuralGrounding({
      packet: p,
      regionStart: 5,
      regionEnd: 50,
      claims: { cited_boundary_rows: [5, 50], cited_format_labels: [], cited_transitions: [] },
    });
    expect(violations).toEqual([]);
  });

  it("a child_summaries key's start/end row grounds a boundary citation (falsifiable contrast: WITH children clean, WITHOUT children the SAME row fabricates)", () => {
    const withChildren = packet({
      clusters: ["INT", "DEC"],
      children: [
        { key: "S#1:20481-30720", summary: "child 1" },
        { key: "S#1:30721-34816", summary: "child 2" },
      ],
    });
    const withoutChildren = packet({ clusters: ["INT", "DEC"] }); // same clusters, no children, no seam

    const cleanResult = verifyStructuralGrounding({
      packet: withChildren,
      regionStart: 20481,
      regionEnd: 34816,
      claims: { cited_boundary_rows: [30721], cited_format_labels: [], cited_transitions: [] },
    });
    expect(cleanResult).toEqual([]); // grounded by child2's start row

    const violatingResult = verifyStructuralGrounding({
      packet: withoutChildren,
      regionStart: 20481,
      regionEnd: 34816,
      claims: { cited_boundary_rows: [30721], cited_format_labels: [], cited_transitions: [] }, // SAME row, no child/seam to ground it
    });
    expect(violatingResult).toEqual([
      { code: "fabricated_boundary_row", message: expect.stringContaining("30721") },
    ]);
  });
});

describe("assertClaimsGroundedInText (extractor honesty guard — pure, no LLM)", () => {
  it("passes when every cited row/label appears verbatim in the summary text", () => {
    expect(() =>
      assertClaimsGroundedInText(
        {
          cited_boundary_rows: [3073],
          cited_format_labels: ["DEC", "INT"],
          cited_transitions: [{ at_row: 3073, from: "DEC", to: "INT" }],
        },
        "The region is DEC formatted, transitioning to INT at row 3073.",
      ),
    ).not.toThrow();
  });

  it("throws SynthesizeCertClaimHonestyViolation (fail-closed) when a cited boundary row does not appear in the text", () => {
    expect(() =>
      assertClaimsGroundedInText(
        { cited_boundary_rows: [2072], cited_format_labels: [], cited_transitions: [] },
        "The region transitions to INT at row 3073.",
      ),
    ).toThrow(SynthesizeCertClaimHonestyViolation);
  });

  it("throws (fail-closed) when a cited transition's at_row does not appear in the text", () => {
    expect(() =>
      assertClaimsGroundedInText(
        { cited_boundary_rows: [], cited_format_labels: [], cited_transitions: [{ at_row: 99, from: "INT", to: "DEC" }] },
        "No row numbers mentioned here at all.",
      ),
    ).toThrow(/row 99/);
  });

  it("throws (fail-closed) when a cited format label does not appear in the text", () => {
    expect(() =>
      assertClaimsGroundedInText(
        { cited_boundary_rows: [], cited_format_labels: ["ISO_DATE"], cited_transitions: [] },
        "The region holds only integers.",
      ),
    ).toThrow(/ISO_DATE/);
  });

  it("label matching is case-insensitive against the summary text", () => {
    expect(() =>
      assertClaimsGroundedInText(
        { cited_boundary_rows: [], cited_format_labels: ["int"], cited_transitions: [] },
        "The region holds INT values only.",
      ),
    ).not.toThrow();
  });
});

describe("SYNTHESIZE_CERT_STRUCTURAL_CLAIM_EXTRACTION_SYSTEM_PROMPT", () => {
  it("tells the extractor it is not a judge and scopes it to verbatim extraction", () => {
    expect(SYNTHESIZE_CERT_STRUCTURAL_CLAIM_EXTRACTION_SYSTEM_PROMPT).toMatch(/not a judge/i);
    expect(SYNTHESIZE_CERT_STRUCTURAL_CLAIM_EXTRACTION_SYSTEM_PROMPT).toMatch(/never infer/i);
    expect(SYNTHESIZE_CERT_STRUCTURAL_CLAIM_EXTRACTION_SYSTEM_PROMPT).toMatch(/cited_boundary_rows/);
    expect(SYNTHESIZE_CERT_STRUCTURAL_CLAIM_EXTRACTION_SYSTEM_PROMPT).toMatch(/cited_format_labels/);
    expect(SYNTHESIZE_CERT_STRUCTURAL_CLAIM_EXTRACTION_SYSTEM_PROMPT).toMatch(/cited_transitions/);
  });
});

describe("parseSynthesizeCertStructuralClaimsResponseText (pure — no LLM)", () => {
  it("parses bare JSON", () => {
    expect(
      parseSynthesizeCertStructuralClaimsResponseText(
        '{"cited_boundary_rows":[3073],"cited_format_labels":["DEC","INT"],"cited_transitions":[{"at_row":3073,"from":"DEC","to":"INT"}]}',
      ),
    ).toEqual({
      cited_boundary_rows: [3073],
      cited_format_labels: ["DEC", "INT"],
      cited_transitions: [{ at_row: 3073, from: "DEC", to: "INT" }],
    });
  });

  it("strips a markdown code fence around the JSON", () => {
    const fenced = '```json\n{"cited_boundary_rows":[],"cited_format_labels":["INT"],"cited_transitions":[]}\n```';
    expect(parseSynthesizeCertStructuralClaimsResponseText(fenced)).toEqual({
      cited_boundary_rows: [],
      cited_format_labels: ["INT"],
      cited_transitions: [],
    });
  });

  it("throws SynthesizeCertClaimParseFail (fail-closed) on malformed JSON", () => {
    expect(() => parseSynthesizeCertStructuralClaimsResponseText("not json at all")).toThrow(
      SynthesizeCertClaimParseFail,
    );
  });

  it("throws SynthesizeCertClaimParseFail on a non-object JSON value", () => {
    expect(() => parseSynthesizeCertStructuralClaimsResponseText("[]")).toThrow(SynthesizeCertClaimParseFail);
    expect(() => parseSynthesizeCertStructuralClaimsResponseText("null")).toThrow(SynthesizeCertClaimParseFail);
  });

  it("throws SynthesizeCertClaimParseFail on a partial or over-complete response", () => {
    expect(() =>
      parseSynthesizeCertStructuralClaimsResponseText('{"cited_boundary_rows":[]}'),
    ).toThrow(SynthesizeCertClaimParseFail);
    expect(() =>
      parseSynthesizeCertStructuralClaimsResponseText(
        '{"cited_boundary_rows":[],"cited_format_labels":[],"cited_transitions":[],"extra":1}',
      ),
    ).toThrow(SynthesizeCertClaimParseFail);
  });

  it("throws SynthesizeCertClaimParseFail on a malformed transition entry", () => {
    expect(() =>
      parseSynthesizeCertStructuralClaimsResponseText(
        '{"cited_boundary_rows":[],"cited_format_labels":[],"cited_transitions":[{"at_row":"not-a-number","from":"INT","to":"DEC"}]}',
      ),
    ).toThrow(SynthesizeCertClaimParseFail);
  });
});

describe("assertSynthesizeCertStructuralClaims", () => {
  it("accepts a well-formed claims object", () => {
    expect(() =>
      assertSynthesizeCertStructuralClaims({
        cited_boundary_rows: [1, 2],
        cited_format_labels: ["INT"],
        cited_transitions: [{ at_row: 1, from: "INT", to: "DEC" }],
      }),
    ).not.toThrow();
  });

  it("rejects a partial or over-complete claims object", () => {
    expect(() =>
      assertSynthesizeCertStructuralClaims({ cited_boundary_rows: [] } as never),
    ).toThrow(SynthesizeCertClaimParseFail);
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
