/**
 * S5 loop tests (design v3 §8/§15.5, R8): the expected universe outer-joins in
 * both directions (every coordinate exactly one row, failures included), the
 * two failure planes stay separated with honest classification, resume keeps
 * decisive rows without re-spend and overwrites failed coordinates with
 * attempts counted, soft-abort preserves the remainder as not_run rows, and a
 * leverless input fails BEFORE any dispatch.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SemanticSynthesisInput } from "../reconstruct/comprehension-semantic-map.js";
import {
  runSynthesizeCertLoop,
  synthesizeCertOutputSha256,
  SynthesizeCertJudgeTimeout,
  SynthesizeCertParseFail,
  SynthesizeCertStructuralFail,
} from "./synthesize-cert-loop.js";
import type { FrozenSynthesizeCertPacket } from "./synthesize-cert-packet.js";
import { SYNTHESIZE_CERT_ARMS } from "./synthesize-cert-record.js";
import {
  createMockSynthesizeCertJudge,
  freezeSynthesizeCertTestPackets,
  mockSynthesizeCertArmOutput,
} from "./test-fixtures/synthesize-cert-mock-realization.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const FIXTURE = sha("loop-fixture");
const SEED = "b4-loop-seed";

const mockArm = async (packet: SemanticSynthesisInput) => mockSynthesizeCertArmOutput(packet);
const mockArms = {
  baseline: mockArm,
  candidate: mockArm,
  negative_control: mockArm,
};

async function frozenPackets(): Promise<FrozenSynthesizeCertPacket[]> {
  const { frozen } = await freezeSynthesizeCertTestPackets(FIXTURE);
  return frozen.packets;
}

describe("runSynthesizeCertLoop", () => {
  it("covers the full universe with exactly one decisive row per coordinate (happy path)", async () => {
    const packets = await frozenPackets();
    expect(packets.length).toBe(5); // non-vacuous subject set
    const result = await runSynthesizeCertLoop({
      packets,
      declaredReps: 3,
      arms: mockArms,
      judge: createMockSynthesizeCertJudge(),
      mutationSeed: SEED,
    });
    expect(result.rows.length).toBe(45); // 5 × 3 reps × 3 arms
    expect(result.aborted).toBeNull();
    expect(result.synthesize_calls).toBe(45);
    expect(result.judge_calls).toBe(45);
    // Outer join, both directions.
    const coordinates = new Set(result.rows.map((r) => `${r.input_id} ${r.rep} ${r.arm}`));
    expect(coordinates.size).toBe(45);
    for (const p of packets) {
      for (let rep = 1; rep <= 3; rep += 1) {
        for (const arm of SYNTHESIZE_CERT_ARMS) {
          expect(coordinates.has(`${p.input_id} ${rep} ${arm}`)).toBe(true);
        }
      }
    }
    const packetByInputId = new Map(packets.map((p) => [p.input_id, p]));
    for (const row of result.rows) {
      expect(row.candidate_output_status).toBe("ok");
      expect(row.judge_status).toBe("ok");
      expect(row.attempts).toBe(1);
      expect(row.output_sha256).toMatch(/^[0-9a-f]{64}$/);
      const frozen = packetByInputId.get(row.input_id)!;
      if (row.arm === "negative_control") {
        expect(row.source_input_id).toBe(row.input_id);
        expect(row.input_sha256).not.toBe(frozen.input_sha256);
        expect(row.input_sha256).toBe(
          result.negative_mutations.get(row.input_id)!.mutated_input_sha256,
        );
        // The mock judge really discriminates: grounding fails everywhere,
        // boundary exactly on seam strata (§6 per-metric targeting).
        expect(row.metrics.grounding).toBe("fail");
        expect(row.metrics.boundary).toBe(frozen.stratum.seam ? "fail" : "pass");
      } else {
        expect(row.input_sha256).toBe(frozen.input_sha256);
        expect(row.source_input_id).toBeUndefined();
        expect(row.metrics).toEqual({ grounding: "pass", boundary: "pass" });
      }
    }
  });

  it("is deterministic", async () => {
    const packets = await frozenPackets();
    const run = () =>
      runSynthesizeCertLoop({
        packets,
        declaredReps: 3,
        arms: mockArms,
        judge: createMockSynthesizeCertJudge(),
        mutationSeed: SEED,
      });
    expect(await run()).toEqual(await run());
  });

  it("preserves synthesize-plane failures as honestly-classified rows (judge never runs)", async () => {
    const packets = await frozenPackets();
    const failing = packets[0]!.input_id;
    const result = await runSynthesizeCertLoop({
      packets,
      declaredReps: 3,
      arms: {
        ...mockArms,
        candidate: async (packet) => {
          if (packets[0]!.packet === packet) throw new Error("transport down");
          return mockSynthesizeCertArmOutput(packet);
        },
      },
      judge: createMockSynthesizeCertJudge(),
      mutationSeed: SEED,
    });
    const failed = result.rows.filter(
      (r) => r.input_id === failing && r.arm === "candidate",
    );
    expect(failed.length).toBe(3);
    for (const row of failed) {
      expect(row.candidate_output_status).toBe("not_run"); // untyped = transport loss
      expect(row.judge_status).toBe("not_run");
      expect(row.metrics).toEqual({ grounding: "not_judged", boundary: "not_judged" });
      expect(row.output_sha256).toBeUndefined();
    }
    expect(result.judge_calls).toBe(42); // 45 - 3 failed synthesize coordinates
    expect(result.rows.length).toBe(45); // failures are rows, never drops
  });

  it("classifies typed parse/structural failures and envelope violations", async () => {
    const packets = (await frozenPackets()).slice(0, 1);
    let call = 0;
    const result = await runSynthesizeCertLoop({
      packets,
      declaredReps: 3,
      arms: {
        // baseline rep1: parse fail; rep2: structural fail; rep3: envelope violation.
        baseline: async (packet) => {
          call += 1;
          if (call === 1) throw new SynthesizeCertParseFail("no JSON");
          if (call === 2) throw new SynthesizeCertStructuralFail("wrong shape");
          return { ...mockSynthesizeCertArmOutput(packet), raw_cells: ["1,234"] } as never;
        },
        candidate: mockArm,
        negative_control: mockArm,
      },
      judge: createMockSynthesizeCertJudge(),
      mutationSeed: SEED,
      maxConsecutiveFailures: 10,
    });
    const baselineRows = result.rows
      .filter((r) => r.arm === "baseline")
      .sort((a, b) => a.rep - b.rep);
    expect(baselineRows.map((r) => r.candidate_output_status)).toEqual([
      "parse_fail",
      "structural_fail",
      "structural_fail",
    ]);
  });

  it("preserves judge-plane failures with the output plane intact", async () => {
    const packets = (await frozenPackets()).slice(0, 1);
    let judgeCall = 0;
    const result = await runSynthesizeCertLoop({
      packets,
      declaredReps: 3,
      arms: mockArms,
      judge: async (input) => {
        judgeCall += 1;
        if (judgeCall === 1) throw new SynthesizeCertJudgeTimeout("deadline");
        if (judgeCall === 2) throw new Error("provider 500");
        if (judgeCall === 3) return { grounding: "maybe", boundary: "pass" } as never;
        return createMockSynthesizeCertJudge()(input);
      },
      mutationSeed: SEED,
      maxConsecutiveFailures: 10,
    });
    const first = result.rows.slice(0, 3);
    expect(first.map((r) => r.judge_status)).toEqual(["timeout", "judge_error", "judge_error"]);
    for (const row of first) {
      expect(row.candidate_output_status).toBe("ok");
      expect(row.output_sha256).toMatch(/^[0-9a-f]{64}$/); // output plane intact
      expect(row.metrics).toEqual({ grounding: "not_judged", boundary: "not_judged" });
    }
  });

  it("resumes: decisive priors are kept without re-spend, failed coordinates overwrite with attempts counted", async () => {
    const packets = await frozenPackets();
    const failingInput = packets[0]!.input_id;
    const firstRun = await runSynthesizeCertLoop({
      packets,
      declaredReps: 3,
      arms: {
        ...mockArms,
        candidate: async (packet) => {
          if (packets[0]!.packet === packet) throw new Error("transport down");
          return mockSynthesizeCertArmOutput(packet);
        },
      },
      judge: createMockSynthesizeCertJudge(),
      mutationSeed: SEED,
    });
    const secondRun = await runSynthesizeCertLoop({
      packets,
      declaredReps: 3,
      arms: mockArms,
      judge: createMockSynthesizeCertJudge(),
      mutationSeed: SEED,
      priorRows: firstRun.rows,
    });
    expect(secondRun.rows.length).toBe(45);
    expect(secondRun.synthesize_calls).toBe(3); // ONLY the failed coordinates re-ran
    const reRun = secondRun.rows.filter(
      (r) => r.input_id === failingInput && r.arm === "candidate",
    );
    for (const row of reRun) {
      expect(row.candidate_output_status).toBe("ok");
      expect(row.attempts).toBe(2); // overwrite counted
    }
    const kept = secondRun.rows.filter(
      (r) => !(r.input_id === failingInput && r.arm === "candidate"),
    );
    for (const row of kept) expect(row.attempts).toBe(1);
    await expect(
      runSynthesizeCertLoop({
        packets,
        declaredReps: 3,
        arms: mockArms,
        judge: createMockSynthesizeCertJudge(),
        mutationSeed: SEED,
        priorRows: [...firstRun.rows, firstRun.rows[0]!],
      }),
    ).rejects.toThrow(/more than once/);
  });

  it("soft-aborts after consecutive failures but still emits a row for every coordinate", async () => {
    const packets = await frozenPackets();
    const result = await runSynthesizeCertLoop({
      packets,
      declaredReps: 3,
      arms: {
        baseline: async () => {
          throw new Error("outage");
        },
        candidate: async () => {
          throw new Error("outage");
        },
        negative_control: async () => {
          throw new Error("outage");
        },
      },
      judge: createMockSynthesizeCertJudge(),
      mutationSeed: SEED,
      maxConsecutiveFailures: 4,
    });
    expect(result.aborted).not.toBeNull();
    expect(result.aborted!.reason).toContain("4 consecutive");
    expect(result.synthesize_calls).toBe(4); // nothing dispatched after the trip
    expect(result.rows.length).toBe(45); // remainder preserved as not_run rows
    const notRun = result.rows.filter((r) => r.candidate_output_status === "not_run");
    expect(notRun.length).toBe(45);
  });

  it("rejects a leverless input BEFORE any dispatch", async () => {
    const packets = await frozenPackets();
    const leverless: FrozenSynthesizeCertPacket = {
      ...packets[0]!,
      input_id: `${FIXTURE.slice(0, 8)}-s0-c9-r1_1`,
      node_key: "S#9:1-1",
      packet: {
        node_ref: { sheet: "S", column_index: 9, row_start: 1, row_end: 1 },
        format_clusters: [],
        value_shape_seams: [],
        child_summaries: [],
      },
    };
    let dispatched = 0;
    await expect(
      runSynthesizeCertLoop({
        packets: [...packets, leverless],
        declaredReps: 3,
        arms: {
          baseline: async (p) => {
            dispatched += 1;
            return mockSynthesizeCertArmOutput(p);
          },
          candidate: mockArm,
          negative_control: mockArm,
        },
        judge: createMockSynthesizeCertJudge(),
        mutationSeed: SEED,
      }),
    ).rejects.toThrow(/no applicable lever/);
    expect(dispatched).toBe(0); // pre-spend rejection
  });
});

describe("synthesizeCertOutputSha256", () => {
  it("is stable for identical content and sensitive to content changes", () => {
    const out = mockSynthesizeCertArmOutput({
      node_ref: { sheet: "S", column_index: 1, row_start: 1, row_end: 9 },
      format_clusters: ["int"],
      value_shape_seams: [{ row: 5, prev_shape: "int", new_shape: "text" }],
      child_summaries: [],
    });
    expect(synthesizeCertOutputSha256(out)).toBe(synthesizeCertOutputSha256({ ...out }));
    expect(
      synthesizeCertOutputSha256({ ...out, semantic_summary: `${out.semantic_summary}!` }),
    ).not.toBe(synthesizeCertOutputSha256(out));
  });
});
