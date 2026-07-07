/**
 * S3 mutation tests (design v3 §6/§15.3): every stratum shape gets a REAL sha
 * change (no-seam included), a leverless input is rejected (negative contrast
 * for the lever guarantee), per-metric lever provenance is honest, the
 * transform is pure/deterministic/seed-sensitive, and mutated shas collide
 * with NO manifest original (the validator's N16 direction, proven upstream).
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertSynthesisInputBounded,
  type SemanticSynthesisInput,
} from "../reconstruct/comprehension-semantic-map.js";
import {
  applyInputCorruptionV1,
  buildInputCorruptionV1NegativeArm,
  INPUT_CORRUPTION_BOUNDARY_LEVER,
  INPUT_CORRUPTION_GROUNDING_LEVER,
  SYNTHESIZE_CERT_MUTATION_KIND,
} from "./synthesize-cert-mutation.js";
import { synthesizeCertInputSha256 } from "./synthesize-cert-sampler.js";
import { freezeSynthesizeCertTestPackets } from "./test-fixtures/synthesize-cert-mock-realization.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const FIXTURE = sha("mutation-fixture");
const SEED = "b4-negative-seed";

function packet(args: {
  clusters?: string[];
  seams?: { row: number; prev_shape: string; new_shape: string }[];
  children?: { key: string; summary: string }[];
  rowStart?: number;
  rowEnd?: number;
}): SemanticSynthesisInput {
  return {
    node_ref: { sheet: "S", column_index: 1, row_start: args.rowStart ?? 1, row_end: args.rowEnd ?? 60 },
    format_clusters: args.clusters ?? [],
    value_shape_seams: args.seams ?? [],
    child_summaries: args.children ?? [],
  };
}

async function frozenRealPackets() {
  const { frozen } = await freezeSynthesizeCertTestPackets(FIXTURE);
  return frozen;
}

describe("applyInputCorruptionV1", () => {
  it("changes the sha of EVERY real frozen packet across strata (no-seam included), colliding with no original", async () => {
    const { packets } = await frozenRealPackets();
    expect(packets.length).toBe(5); // non-vacuous: seam×merge ×2, seam×leaf, noseam×leaf ×2
    const originalShas = new Set(packets.map((p) => p.input_sha256));
    const strataSeen = new Set<string>();
    for (const frozen of packets) {
      const result = applyInputCorruptionV1(frozen.packet, { seed: SEED });
      expect(result.mutated_input_sha256).not.toBe(frozen.input_sha256);
      expect(originalShas.has(result.mutated_input_sha256)).toBe(false); // N16 direction
      expect(result.levers_applied.grounding).toBe(true);
      expect(result.levers_applied.boundary).toBe(frozen.stratum.seam);
      assertSynthesisInputBounded(result.mutated); // boundedness is transform-owned
      strataSeen.add(`seam=${frozen.stratum.seam}|merge=${frozen.stratum.merge}`);
    }
    expect(strataSeen.size).toBeGreaterThanOrEqual(3);
  });

  it("rejects a leverless input (no clusters, no children, no seams)", () => {
    expect(() => applyInputCorruptionV1(packet({}), { seed: SEED })).toThrow(
      /no applicable lever/,
    );
  });

  it("is pure, deterministic, and seed-sensitive", () => {
    const original = packet({
      clusters: ["int", "date"],
      seams: [{ row: 10, prev_shape: "int", new_shape: "date" }],
    });
    const snapshot = structuredClone(original);
    const a = applyInputCorruptionV1(original, { seed: SEED });
    const b = applyInputCorruptionV1(original, { seed: SEED });
    const other = applyInputCorruptionV1(original, { seed: "other-seed" });
    expect(original).toEqual(snapshot); // purity: the frozen packet is untouched
    expect(b).toEqual(a);
    expect(other.mutated_input_sha256).not.toBe(a.mutated_input_sha256);
    // Relabel really rewrote the cluster CONTENT (sorted-list change, not a permutation).
    expect(new Set(a.mutated.format_clusters).size).toBe(2);
    for (const cluster of a.mutated.format_clusters) {
      expect(original.format_clusters.includes(cluster)).toBe(false);
    }
  });

  it("offsets seam rows beyond the ±1 anchor tolerance when the node range permits", () => {
    const original = packet({
      clusters: ["int"],
      seams: [
        { row: 10, prev_shape: "int", new_shape: "date" },
        { row: 30, prev_shape: "date", new_shape: "int" },
      ],
    });
    const { mutated } = applyInputCorruptionV1(original, { seed: SEED });
    mutated.value_shape_seams.forEach((s, i) => {
      const originalRow = original.value_shape_seams[i]!.row;
      expect(Math.abs(s.row - originalRow)).toBeGreaterThanOrEqual(2);
      expect(s.row).toBeGreaterThan(mutated.node_ref.row_start);
      expect(s.row).toBeLessThanOrEqual(mutated.node_ref.row_end);
      expect(s.prev_shape).toBe(original.value_shape_seams[i]!.prev_shape);
    });
  });

  it("rotates distinct child prose between siblings, and falls back to a seed suffix when rotation is inert", () => {
    const distinct = packet({
      children: [
        { key: "S#1:1-10", summary: "integers ascending" },
        { key: "S#1:11-20", summary: "dates by month" },
      ],
    });
    const rotated = applyInputCorruptionV1(distinct, { seed: SEED });
    expect(rotated.mutated.child_summaries).toEqual([
      { key: "S#1:1-10", summary: "dates by month" },
      { key: "S#1:11-20", summary: "integers ascending" },
    ]);
    const identical = packet({
      children: [
        { key: "S#1:1-10", summary: "same prose" },
        { key: "S#1:11-20", summary: "same prose" },
      ],
    });
    const suffixed = applyInputCorruptionV1(identical, { seed: SEED });
    expect(
      suffixed.mutated.child_summaries.every((c) => c.summary.startsWith("same prose ~")),
    ).toBe(true);
    expect(suffixed.mutated_input_sha256).not.toBe(synthesizeCertInputSha256(identical));
  });

  it("mutates a boundary-only input (no clusters, no children) via the seam lever alone", () => {
    const seamOnly = packet({ seams: [{ row: 20, prev_shape: "int", new_shape: "text" }] });
    const result = applyInputCorruptionV1(seamOnly, { seed: SEED });
    expect(result.levers_applied).toEqual({ grounding: false, boundary: true });
    expect(result.mutated_input_sha256).not.toBe(synthesizeCertInputSha256(seamOnly));
  });

  it("rejects an empty seed", () => {
    expect(() => applyInputCorruptionV1(packet({ clusters: ["int"] }), { seed: "" })).toThrow(
      /seed/,
    );
  });
});

describe("buildInputCorruptionV1NegativeArm", () => {
  it("targets BOTH judged metrics and cites the implemented levers", () => {
    const block = buildInputCorruptionV1NegativeArm(SEED);
    expect(block.arm).toBe("negative_control");
    expect(block.mutation_kind).toBe(SYNTHESIZE_CERT_MUTATION_KIND);
    expect(block.targeted_metrics.sort()).toEqual(["boundary", "grounding"]);
    expect(block.mutation_params).toEqual({
      grounding_lever: INPUT_CORRUPTION_GROUNDING_LEVER,
      boundary_lever: INPUT_CORRUPTION_BOUNDARY_LEVER,
      seed: SEED,
    });
  });
});
