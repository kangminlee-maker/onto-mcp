import { describe, expect, it } from "vitest";
import {
  mergeReduceNodes,
  reduceColumnLeavesWithTrace,
  reduceNodeGroundHash,
  reduceColumnLeaves,
  reduceNodeKey,
  type ComprehensionReduceNode,
} from "./comprehension-reduce.js";
import type { ComprehensionBoundaryWitness } from "./comprehension-artifact.js";
import {
  ANCHOR_ROW_TOLERANCE,
  assertChildJudgmentCoverage,
  assertPreImageKeysAllowlisted,
  assertSemanticBoundaryHonesty,
  assertTaintCensusMonotone,
  computeUnanchoredUnverifiedCount,
  reconcileBoundaries,
  reduceNodeEpochContribution,
  type ComprehensionSemanticNode,
  type RawSemanticBoundary,
  type SemanticBoundary,
  type SemanticEpochPreImage,
} from "./comprehension-semantic-map.js";

const SHEET = "누적";
const COL = 4;

// ── builders ─────────────────────────────────────────────────────────────────

function leaf(
  rowStart: number,
  rowEnd: number,
  edgeFirst: string,
  edgeLast: string,
  opts: { distinctLB?: boolean; capped?: boolean; witnessRow?: number } = {},
): ComprehensionReduceNode {
  return {
    region: { sheet: SHEET, column_index: COL, row_start: rowStart, row_end: rowEnd },
    format_clusters: [...new Set([edgeFirst, edgeLast])].sort(),
    boundaries: [],
    edge_first_shape: edgeFirst,
    edge_last_shape: edgeLast,
    distinct_is_lower_bound: opts.distinctLB ?? false,
    boundaries_are_lower_bound: opts.capped ?? false,
    segments_capped: opts.capped ?? false,
    limiting_witness:
      opts.distinctLB || opts.capped
        ? { sheet: SHEET, column_index: COL, row: opts.witnessRow ?? rowStart, reason: "distinct_count capped" }
        : null,
  };
}

function witness(
  row: number,
  prev: string,
  next: string,
  kind: "value_shape" | "display_format" = "value_shape",
): ComprehensionBoundaryWitness {
  return {
    sheet: SHEET,
    column_index: COL,
    boundary_kind: kind,
    prev_shape: prev,
    new_shape: next,
    last_prev_format_row: row - 1,
    first_new_format_row: row,
  };
}

const raw = (row: number, before = "a", after = "b"): RawSemanticBoundary => ({
  row,
  character_before: before,
  character_after: after,
});

function semNode(over: Partial<ComprehensionSemanticNode> = {}): ComprehensionSemanticNode {
  return {
    node_ref: { sheet: SHEET, column_index: COL, row_start: 1, row_end: 100 },
    layer1_ground_hash: "gh",
    subtree_epoch_contribution: "sec",
    authority: "non_authoritative",
    provisional: true,
    reduce_read_attempt: "produced",
    semantic_summary: "s",
    semantic_boundaries: [],
    structure_boundary_coverage: [],
    topology_child_keys: [],
    consumed_child_judgment_keys: [],
    unanchored_unverified_count: 0,
    ...over,
  };
}

const bound = (
  anchor: SemanticBoundary["anchor_status"],
  verification: SemanticBoundary["verification"],
  row = 5,
): SemanticBoundary => ({ row, character_before: "x", character_after: "y", anchor_status: anchor, verification });

function preImage(over: Partial<SemanticEpochPreImage> = {}): SemanticEpochPreImage {
  return {
    layer1_ground_hash: "g0",
    child_contributions: [],
    reduce_reader_model_identity: "openai/gpt-5.5",
    reduce_prompt_sha256: "p0",
    reduce_schema_tool_version: "v1",
    comprehension_version: "c1",
    over_context_gate_config_sha256: "cfg0",
    over_context_gate_logic_sha256: "logic0",
    ...over,
  };
}

// ── ReduceTopologyTrace (§13.1 / N4 / codex-F4) ──────────────────────────────

describe("reduceColumnLeavesWithTrace", () => {
  const leaves = [
    leaf(1, 10, "int", "int"),
    leaf(11, 20, "text", "text"),
    leaf(21, 30, "int", "int"),
    leaf(31, 40, "text", "text"),
    leaf(41, 50, "int", "int"),
  ];

  it("root is byte-identical to reduceColumnLeaves (byte-parity, flat + deep)", () => {
    for (const fanin of [undefined, 2, 3]) {
      const plain = reduceColumnLeaves(leaves, fanin);
      const { root } = reduceColumnLeavesWithTrace(leaves, fanin);
      expect(reduceNodeGroundHash(root)).toBe(reduceNodeGroundHash(plain));
    }
  });

  it("root ground is grouping-invariant across fanin via the trace variant", () => {
    const flat = reduceColumnLeavesWithTrace(leaves).root;
    const bin = reduceColumnLeavesWithTrace(leaves, 2).root;
    const ter = reduceColumnLeavesWithTrace(leaves, 3).root;
    expect(reduceNodeGroundHash(bin)).toBe(reduceNodeGroundHash(flat));
    expect(reduceNodeGroundHash(ter)).toBe(reduceNodeGroundHash(flat));
  });

  it("trace registers EVERY node — all leaves + merge outputs (codex-F4 cardinality > 0)", () => {
    const { trace } = reduceColumnLeavesWithTrace(leaves, 2);
    for (const l of leaves) expect(trace.nodes.has(reduceNodeKey(l.region))).toBe(true);
    expect(trace.nodes.has(trace.root_key)).toBe(true);
    // 5 leaves + interior merges: strictly more nodes than leaves for a deep tree.
    expect(trace.nodes.size).toBeGreaterThan(leaves.length);
    // leaves carry no children; the root carries children.
    for (const l of leaves) expect(trace.nodes.get(reduceNodeKey(l.region))?.child_keys).toEqual([]);
    expect(trace.nodes.get(trace.root_key)?.child_keys.length).toBeGreaterThan(0);
  });

  it("single leaf → trace of exactly one node, root is that leaf", () => {
    const one = [leaf(1, 10, "int", "int")];
    const { root, trace } = reduceColumnLeavesWithTrace(one);
    expect(trace.nodes.size).toBe(1);
    expect(trace.root_key).toBe(reduceNodeKey(root.region));
    expect(trace.nodes.get(trace.root_key)?.child_keys).toEqual([]);
  });

  it("odd fan-in (pass-through) — every leaf still registered, no leaf dropped", () => {
    const { trace } = reduceColumnLeavesWithTrace(leaves, 2); // 5 leaves, fanin 2 → pass-through happens
    for (const l of leaves) expect(trace.nodes.has(reduceNodeKey(l.region))).toBe(true);
  });
});

// ── reconcileBoundaries (§13.3 / N1 / N2 / codex-F3) ─────────────────────────

describe("reconcileBoundaries (two-sided)", () => {
  it("matched seams → covered + anchored; verification is location-only (not content-verified)", () => {
    const node = { boundaries: [witness(11, "int", "text"), witness(21, "text", "int")] };
    const { boundaries, coverage } = reconcileBoundaries([raw(11), raw(21)], node);
    expect(boundaries.map((b) => b.anchor_status)).toEqual(["anchored", "anchored"]);
    expect(boundaries.every((b) => b.verification === "structural_location_only")).toBe(true);
    expect(coverage.every((c) => c.status === "covered")).toBe(true);
  });

  it("NEGATIVE CONTROL: seams present + zero LLM boundaries → missed_by_llm census non-empty (no silent uniform)", () => {
    const node = { boundaries: [witness(11, "int", "text"), witness(21, "text", "int")] };
    const { boundaries, coverage } = reconcileBoundaries([], node);
    expect(boundaries.length).toBe(0);
    const missed = coverage.filter((c) => c.status === "missed_by_llm");
    expect(missed.length).toBeGreaterThan(0); // cardinality > 0 — the disclosure exists
    expect(missed.length).toBe(2);
  });

  it("dense seams: one seam anchors at most ONE boundary (L2H-2)", () => {
    const node = { boundaries: [witness(11, "int", "text")] };
    const { boundaries } = reconcileBoundaries([raw(11, "a", "b"), raw(11, "c", "d")], node);
    const anchored = boundaries.filter((b) => b.anchor_status === "anchored");
    const unanchored = boundaries.filter((b) => b.anchor_status === "unanchored");
    expect(anchored.length).toBe(1);
    expect(unanchored.length).toBe(1);
  });

  it("order-stable (codex-F3): adjacent seams 11/12, boundary row 12 → matches seam 12, not greedy 11", () => {
    const node = { boundaries: [witness(11, "int", "text"), witness(12, "text", "int")] };
    const { boundaries, coverage } = reconcileBoundaries([raw(12)], node);
    expect(boundaries[0]?.anchor_status).toBe("anchored");
    const covered = coverage.find((c) => c.boundary_ref.first_new_format_row === 12);
    const missed = coverage.find((c) => c.boundary_ref.first_new_format_row === 11);
    expect(covered?.status).toBe("covered");
    expect(missed?.status).toBe("missed_by_llm");
  });

  it("display_format seams are noise — excluded from coverage; a boundary near one is unanchored (L2H-4)", () => {
    const node = { boundaries: [witness(11, "int", "int", "display_format")] };
    const { boundaries, coverage } = reconcileBoundaries([raw(11)], node);
    expect(coverage.length).toBe(0); // no value_shape seam
    expect(boundaries[0]?.anchor_status).toBe("unanchored");
  });

  it("tolerance fallback: boundary within ±1 of a seam anchors when no exact match", () => {
    expect(ANCHOR_ROW_TOLERANCE).toBe(1);
    const node = { boundaries: [witness(11, "int", "text")] };
    const { boundaries } = reconcileBoundaries([raw(12)], node); // 12 within ±1 of seam 11
    expect(boundaries[0]?.anchor_status).toBe("anchored");
    const far = reconcileBoundaries([raw(14)], node); // 14 outside ±1
    expect(far.boundaries[0]?.anchor_status).toBe("unanchored");
  });
});

// ── reduceNodeEpochContribution + allowlist (§13.4 / N4 / N7) ─────────────────

describe("reduceNodeEpochContribution", () => {
  it("deterministic; folds child_contributions; sibling order-invariant", () => {
    const base = reduceNodeEpochContribution(preImage({ child_contributions: ["a", "b"] }));
    expect(reduceNodeEpochContribution(preImage({ child_contributions: ["a", "b"] }))).toBe(base);
    expect(reduceNodeEpochContribution(preImage({ child_contributions: ["b", "a"] }))).toBe(base); // sorted
    expect(reduceNodeEpochContribution(preImage({ child_contributions: ["a", "c"] }))).not.toBe(base);
  });

  it("a child contribution change rotates the parent key even when layer1_ground_hash is unchanged (codex tsx probe)", () => {
    const stableGround = preImage({ layer1_ground_hash: "SAME", child_contributions: ["child-v1"] });
    const childChanged = preImage({ layer1_ground_hash: "SAME", child_contributions: ["child-v2"] });
    expect(reduceNodeEpochContribution(stableGround)).not.toBe(reduceNodeEpochContribution(childChanged));
  });

  it("layer1_ground_hash change rotates the key", () => {
    expect(reduceNodeEpochContribution(preImage({ layer1_ground_hash: "g1" }))).not.toBe(
      reduceNodeEpochContribution(preImage({ layer1_ground_hash: "g2" })),
    );
  });

  it("over_context_gate_logic_sha256 change rotates the key (L2R-2 logic sha folded)", () => {
    expect(reduceNodeEpochContribution(preImage({ over_context_gate_logic_sha256: "L1" }))).not.toBe(
      reduceNodeEpochContribution(preImage({ over_context_gate_logic_sha256: "L2" })),
    );
  });

  // ★ The load-bearing recursion necessity control (design §13.4 / §13.7, codex-F/N4). A NON-LOWEST
  // child's limiting_witness change leaves the PARENT ground byte-identical (mergeReduceNodes keeps only
  // witnessCandidates[0] = lowest row), yet the child's OWN ground hash rotates. Folding
  // child_contributions makes the parent re-derive; folding ONLY the parent ground hash would MISS it.
  it("recursion is NECESSARY: non-lowest child change → parent ground stable, parent contribution rotates (cardinality>0)", () => {
    const childA = leaf(1, 10, "int", "int", { distinctLB: true, witnessRow: 3 }); // lowest-row witness
    const childB1 = leaf(11, 20, "int", "int", { distinctLB: true, witnessRow: 15 });
    const childB2 = leaf(11, 20, "int", "int", { distinctLB: true, witnessRow: 18 }); // non-lowest witness moved
    const parent1 = mergeReduceNodes([childA, childB1]);
    const parent2 = mergeReduceNodes([childA, childB2]);

    // Precondition (cardinality>0): parent ground byte-identical, child ground DIFFERENT.
    expect(reduceNodeGroundHash(parent1)).toBe(reduceNodeGroundHash(parent2));
    expect(reduceNodeGroundHash(childB1)).not.toBe(reduceNodeGroundHash(childB2));

    const contribA = reduceNodeEpochContribution(preImage({ layer1_ground_hash: reduceNodeGroundHash(childA) }));
    const contribB1 = reduceNodeEpochContribution(preImage({ layer1_ground_hash: reduceNodeGroundHash(childB1) }));
    const contribB2 = reduceNodeEpochContribution(preImage({ layer1_ground_hash: reduceNodeGroundHash(childB2) }));
    const parentGround = reduceNodeGroundHash(parent1); // == parent2

    const parentContrib1 = reduceNodeEpochContribution(
      preImage({ layer1_ground_hash: parentGround, child_contributions: [contribA, contribB1] }),
    );
    const parentContrib2 = reduceNodeEpochContribution(
      preImage({ layer1_ground_hash: parentGround, child_contributions: [contribA, contribB2] }),
    );
    // Recursion CATCHES the change:
    expect(parentContrib1).not.toBe(parentContrib2);

    // MUTATION CONTROL: without child_contributions (parent ground only), the change is MISSED — proving
    // the recursion is load-bearing, not redundant.
    const groundOnly1 = reduceNodeEpochContribution(preImage({ layer1_ground_hash: parentGround, child_contributions: [] }));
    const groundOnly2 = reduceNodeEpochContribution(preImage({ layer1_ground_hash: parentGround, child_contributions: [] }));
    expect(groundOnly1).toBe(groundOnly2); // identical → would NOT trigger re-derivation
  });
});

describe("assertPreImageKeysAllowlisted (fail-closed allowlist)", () => {
  it("valid pre-image passes", () => {
    expect(() => assertPreImageKeysAllowlisted(preImage() as unknown as Record<string, unknown>)).not.toThrow();
  });

  it("NEGATIVE CONTROL: an extra (unknown) key throws — a new LLM field cannot silently gate reuse", () => {
    const bad = { ...preImage(), semantic_summary: "LLM output leaked in" };
    expect(() => assertPreImageKeysAllowlisted(bad as unknown as Record<string, unknown>)).toThrow(/non-allowlisted/);
  });

  it("NEGATIVE CONTROL: a missing required key throws", () => {
    const bad: Record<string, unknown> = { ...preImage() };
    delete bad.reduce_prompt_sha256;
    expect(() => assertPreImageKeysAllowlisted(bad)).toThrow(/missing required key/);
  });

  it("NEGATIVE CONTROL: a nested object smuggled into a string field throws (codex nested guard)", () => {
    const bad = { ...preImage(), reduce_prompt_sha256: { leaked: "obj" } };
    expect(() => assertPreImageKeysAllowlisted(bad as unknown as Record<string, unknown>)).toThrow(/must be a string/);
  });

  it("NEGATIVE CONTROL: child_contributions with a non-string element throws", () => {
    const bad = { ...preImage(), child_contributions: ["ok", { leaked: 1 }] };
    expect(() => assertPreImageKeysAllowlisted(bad as unknown as Record<string, unknown>)).toThrow(/string\[\]/);
  });
});

// ── assertChildJudgmentCoverage (§13.5 / N5 / codex-F1) ──────────────────────

describe("assertChildJudgmentCoverage (subsumed-aware)", () => {
  it("accumulating node: consumed == expected passes", () => {
    const node = semNode({ consumed_child_judgment_keys: ["k1", "k2"] });
    expect(() => assertChildJudgmentCoverage(node, ["k2", "k1"])).not.toThrow();
  });

  it("NEGATIVE CONTROL: a dropped child judgment throws", () => {
    const node = semNode({ consumed_child_judgment_keys: ["k1"] });
    expect(() => assertChildJudgmentCoverage(node, ["k1", "k2"])).toThrow(/coverage mismatch/);
  });

  it("subsumed node: consumed=[] passes (no judgment expected)", () => {
    const node = semNode({ reduce_read_attempt: "subsumed", consumed_child_judgment_keys: [] });
    expect(() => assertChildJudgmentCoverage(node, ["k1", "k2"])).not.toThrow();
  });

  it("NEGATIVE CONTROL: subsumed node that claims a consumed judgment throws (codex-F1)", () => {
    const node = semNode({ reduce_read_attempt: "subsumed", consumed_child_judgment_keys: ["k1"] });
    expect(() => assertChildJudgmentCoverage(node, [])).toThrow(/subsumed/);
  });
});

// ── assertSemanticBoundaryHonesty (§13.5 / N3 / codex-F2 state machine) ───────

describe("assertSemanticBoundaryHonesty (verification state machine)", () => {
  it("legal states pass", () => {
    const node = semNode({
      semantic_boundaries: [bound("anchored", "structural_location_only"), bound("unanchored", "adversarial_confirmed")],
    });
    expect(() => assertSemanticBoundaryHonesty(node, true)).not.toThrow();
  });

  it("NEGATIVE CONTROL: anchored + adversarial_* is illegal (anchored is never adversarially verified)", () => {
    const node = semNode({ semantic_boundaries: [bound("anchored", "adversarial_confirmed")] });
    expect(() => assertSemanticBoundaryHonesty(node, false)).toThrow(/anchored boundary must be/);
  });

  it("NEGATIVE CONTROL: unanchored + structural_location_only is illegal", () => {
    const node = semNode({ semantic_boundaries: [bound("unanchored", "structural_location_only")] });
    expect(() => assertSemanticBoundaryHonesty(node, false)).toThrow(/cannot be 'structural_location_only'/);
  });

  it("NEGATIVE CONTROL: a seed-bound unanchored boundary still 'unverified' throws (N3 all-unanchored)", () => {
    const node = semNode({ semantic_boundaries: [bound("unanchored", "unverified")] });
    expect(() => assertSemanticBoundaryHonesty(node, true)).toThrow(/must be adversarially processed/);
    // but pre-seed (not seed-bound) it is a legal transient state:
    expect(() => assertSemanticBoundaryHonesty(node, false)).not.toThrow();
  });

  it("NEGATIVE CONTROL: a refuted boundary carried into the seed boundary list throws (must be excluded)", () => {
    const node = semNode({ semantic_boundaries: [bound("unanchored", "adversarial_refuted")] });
    expect(() => assertSemanticBoundaryHonesty(node, true)).toThrow(/must be EXCLUDED from seed/);
  });
});

// ── assertTaintCensusMonotone (§13.5 / N6) ───────────────────────────────────

describe("taint census (monotone)", () => {
  it("computeUnanchoredUnverifiedCount = own + children", () => {
    const child = semNode({ unanchored_unverified_count: 3 });
    const node = semNode({
      semantic_boundaries: [bound("unanchored", "unverified"), bound("unanchored", "adversarial_refuted")],
    });
    // own = 2 unverified/refuted boundaries; children = 3 → 5
    expect(computeUnanchoredUnverifiedCount(node, [child])).toBe(5);
  });

  it("a confirmed unanchored boundary does NOT count as taint", () => {
    const node = semNode({ semantic_boundaries: [bound("unanchored", "adversarial_confirmed")] });
    expect(computeUnanchoredUnverifiedCount(node, [])).toBe(0);
  });

  it("a failed read counts as taint", () => {
    const node = semNode({ reduce_read_attempt: "failed" });
    expect(computeUnanchoredUnverifiedCount(node, [])).toBe(1);
  });

  it("parent >= expected passes (over-report allowed)", () => {
    const child = semNode({ unanchored_unverified_count: 2 });
    const node = semNode({ unanchored_unverified_count: 2 });
    expect(() => assertTaintCensusMonotone(node, [child])).not.toThrow();
  });

  it("NEGATIVE CONTROL: a parent understating children's taint throws", () => {
    const child = semNode({ unanchored_unverified_count: 4 });
    const node = semNode({ unanchored_unverified_count: 1 });
    expect(() => assertTaintCensusMonotone(node, [child])).toThrow(/understated/);
  });
});
