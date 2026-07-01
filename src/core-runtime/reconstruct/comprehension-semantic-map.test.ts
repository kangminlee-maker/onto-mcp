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
  accumulateSemanticMap,
  assertChildJudgmentCoverage,
  assertPreImageKeysAllowlisted,
  assertReduceTopologyIsTree,
  assertSemanticBoundaryHonesty,
  assertSubsumedNodeEmpty,
  assertSynthesisInputBounded,
  assertTaintCensusMonotone,
  classifyFrontier,
  computeSubtreeLeafCounts,
  computeUnanchoredUnverifiedCount,
  projectSemanticMapToSeed,
  reconcileBoundaries,
  reduceNodeEpochContribution,
  type AccumulateSemanticMapOpts,
  type ComprehensionSemanticNode,
  type RawSemanticBoundary,
  type SemanticBoundary,
  type SemanticEpochPreImage,
  type SemanticSynthesisFn,
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
    expect(() => assertPreImageKeysAllowlisted(bad)).toThrow(/missing OWN required key/);
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

// ── accumulateSemanticMap (S2 mock LLM E2E · §13.6/§13.8) ─────────────────────

describe("accumulateSemanticMap (mock LLM realization)", () => {
  const buildTree = () =>
    reduceColumnLeavesWithTrace(
      [
        leaf(1, 10, "int", "int"),
        leaf(11, 20, "text", "text"),
        leaf(21, 30, "int", "int"),
        leaf(31, 40, "text", "text"),
        leaf(41, 50, "int", "int"),
      ],
      2,
    );

  // MOCK synthesize: one anchored boundary per real value-shape seam + one deliberately unanchored
  // boundary at the region start (no seam there) so N3 (all-unanchored → adversarial) is exercised.
  const synthesize: SemanticSynthesisFn = (input) => {
    const boundaries: RawSemanticBoundary[] = input.value_shape_seams.map((s) => ({
      row: s.row,
      character_before: "seam-before",
      character_after: "seam-after",
    }));
    boundaries.push({ row: input.node_ref.row_start, character_before: "u0", character_after: "u1" });
    return {
      semantic_summary: `[${input.node_ref.row_start}-${input.node_ref.row_end}] clusters=${input.format_clusters.join("/")} kids=${input.child_summaries.length}`,
      boundaries,
    };
  };

  // MOCK verify: refute the deeper unanchored boundaries (row > 15) so taint appears + propagates.
  const opts = (seedBound: boolean): AccumulateSemanticMapOpts => ({
    synthesize,
    verifyUnanchored: ({ boundary }) => (boundary.row > 15 ? "adversarial_refuted" : "adversarial_confirmed"),
    preImageBase: {
      reduce_reader_model_identity: "mock/none",
      reduce_prompt_sha256: "p",
      reduce_schema_tool_version: "v1",
      comprehension_version: "c1",
      over_context_gate_config_sha256: "cfg",
      over_context_gate_logic_sha256: "logic",
    },
    overContextBudget: 0, // max accumulation: every internal node accumulates, leaves are frontier.
    seedBound,
  });

  it("produces one validated semantic node per skeleton node (all validators pass)", () => {
    const { trace, nodesByKey } = buildTree();
    const map = accumulateSemanticMap(trace, nodesByKey, opts(true));
    for (const key of trace.nodes.keys()) expect(map.has(key)).toBe(true);
    expect(map.size).toBe(trace.nodes.size);
    for (const node of map.values()) {
      expect(node.authority).toBe("non_authoritative");
      expect(node.consumed_child_judgment_keys).toEqual(node.topology_child_keys); // S2 accumulates all
    }
  });

  it("N3: every unanchored boundary is adversarially processed — no 'unverified' survives", () => {
    const { trace, nodesByKey } = buildTree();
    const map = accumulateSemanticMap(trace, nodesByKey, opts(false));
    for (const node of map.values()) {
      for (const b of node.semantic_boundaries) {
        if (b.anchor_status === "unanchored") expect(b.verification).not.toBe("unverified");
        if (b.anchor_status === "anchored") expect(b.verification).toBe("structural_location_only");
      }
    }
  });

  it("seed-bound: refuted boundaries are EXCLUDED from the seed boundary list but counted in taint", () => {
    const { trace, nodesByKey } = buildTree();
    const map = accumulateSemanticMap(trace, nodesByKey, opts(true));
    for (const node of map.values()) {
      expect(node.semantic_boundaries.every((b) => b.verification !== "adversarial_refuted")).toBe(true);
    }
    const root = map.get(trace.root_key);
    expect(root).toBeDefined();
    // some deep unanchored boundaries were refuted (rows 21/31/41 > 15) → taint > 0 at the root.
    expect(root!.unanchored_unverified_count).toBeGreaterThan(0);
  });

  it("non-seed: refuted boundaries are RETAINED for inspection", () => {
    const { trace, nodesByKey } = buildTree();
    const map = accumulateSemanticMap(trace, nodesByKey, opts(false));
    const anyRefuted = [...map.values()].some((n) =>
      n.semantic_boundaries.some((b) => b.verification === "adversarial_refuted"),
    );
    expect(anyRefuted).toBe(true);
  });

  it("taint census is monotone up the tree (root >= any child)", () => {
    const { trace, nodesByKey } = buildTree();
    const map = accumulateSemanticMap(trace, nodesByKey, opts(true));
    const root = map.get(trace.root_key)!;
    for (const childKey of trace.nodes.get(trace.root_key)!.child_keys) {
      expect(root.unanchored_unverified_count).toBeGreaterThanOrEqual(map.get(childKey)!.unanchored_unverified_count);
    }
  });

  it("recursive epoch contribution: changing one leaf's Layer-1 ground rotates the root contribution", () => {
    const base = buildTree();
    const baseRoot = accumulateSemanticMap(base.trace, base.nodesByKey, opts(true)).get(base.trace.root_key)!;
    // Rebuild with one leaf's shape changed (different ground) — root epoch contribution must differ.
    const changed = reduceColumnLeavesWithTrace(
      [
        leaf(1, 10, "int", "int"),
        leaf(11, 20, "text", "text"),
        leaf(21, 30, "num", "num"), // was "int"
        leaf(31, 40, "text", "text"),
        leaf(41, 50, "int", "int"),
      ],
      2,
    );
    const changedRoot = accumulateSemanticMap(changed.trace, changed.nodesByKey, opts(true)).get(changed.trace.root_key)!;
    expect(changedRoot.subtree_epoch_contribution).not.toBe(baseRoot.subtree_epoch_contribution);
  });

  it("source-safety: assertSynthesisInputBounded rejects a non-string summary (accidental raw value)", () => {
    expect(() =>
      assertSynthesisInputBounded({
        node_ref: { sheet: SHEET, column_index: COL, row_start: 1, row_end: 10 },
        format_clusters: ["int"],
        value_shape_seams: [],
        child_summaries: [{ key: "k", summary: 42 as unknown as string }],
      }),
    ).toThrow(/source-safe/);
  });
});

// ── adversarial fail-closed hardening (S1+S2 CODE cross-validation, codex + onto, F1–F8) ──────────
// These are the MALFORMED/adversarial inputs the original by-construction tests did NOT exercise — the
// exact gap the two-family code review surfaced (a test can encode the same wrong assumption as the
// code). Each asserts a guard now FAILS CLOSED where it previously failed open.

describe("adversarial fail-closed hardening", () => {
  const okInput = () => ({
    node_ref: { sheet: SHEET, column_index: COL, row_start: 1, row_end: 10 },
    format_clusters: ["int"] as string[],
    value_shape_seams: [] as { row: number; prev_shape: string; new_shape: string }[],
    child_summaries: [] as { key: string; summary: string }[],
  });

  it("F1: a raw object smuggled into format_clusters fails closed", () => {
    const bad = okInput();
    (bad.format_clusters as unknown[]).push({ raw_value: "alice@example.com" });
    expect(() => assertSynthesisInputBounded(bad)).toThrow(/format_clusters must be string/);
  });

  it("F1: an EXTRA field on the synthesis input fails closed", () => {
    const bad = { ...okInput(), examples: ["2026-07-01"] } as unknown;
    expect(() => assertSynthesisInputBounded(bad as never)).toThrow(/unexpected field 'examples'/);
  });

  it("F1: an extra key on a seam fails closed", () => {
    const bad = okInput();
    (bad.value_shape_seams as unknown[]).push({ row: 5, prev_shape: "a", new_shape: "b", raw: "x" });
    expect(() => assertSynthesisInputBounded(bad)).toThrow(/unexpected field 'raw'/);
  });

  it("F2: an unknown verification value fails closed (state machine is total)", () => {
    const node = semNode({ semantic_boundaries: [bound("unanchored", "bogus_status" as never)] });
    expect(() => assertSemanticBoundaryHonesty(node, false)).toThrow(/unknown verification/);
  });

  it("F2: an unknown anchor_status fails closed", () => {
    const node = semNode({ semantic_boundaries: [bound("sideways" as never, "unverified")] });
    expect(() => assertSemanticBoundaryHonesty(node, false)).toThrow(/unknown anchor_status/);
  });

  it("F2: accumulate rejects a bogus verifyUnanchored return", () => {
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace([leaf(1, 10, "int", "int")]);
    const opts: AccumulateSemanticMapOpts = {
      synthesize: () => ({ semantic_summary: "s", boundaries: [{ row: 1, character_before: "a", character_after: "b" }] }),
      verifyUnanchored: () => "bogus" as never,
      preImageBase: {
        reduce_reader_model_identity: "m",
        reduce_prompt_sha256: "p",
        reduce_schema_tool_version: "v",
        comprehension_version: "c",
        over_context_gate_config_sha256: "cfg",
        over_context_gate_logic_sha256: "logic",
      },
      overContextBudget: 0,
      seedBound: true,
    };
    expect(() => accumulateSemanticMap(trace, nodesByKey, opts)).toThrow(/verifyUnanchored returned invalid/);
  });

  it("F3: an inherited-only pre-image (Object.create) fails closed", () => {
    const proto = preImage();
    const inherited = Object.create(proto) as Record<string, unknown>; // no OWN keys
    expect(() => assertPreImageKeysAllowlisted(inherited)).toThrow(/missing OWN required key/);
  });

  it("F5: a cyclic trace fails closed (no stack overflow)", () => {
    const a = leaf(1, 10, "int", "int");
    const b = leaf(11, 20, "int", "int");
    const ka = reduceNodeKey(a.region);
    const kb = reduceNodeKey(b.region);
    const trace = {
      root_key: ka,
      nodes: new Map([
        [ka, { node_ref: a.region, ground_hash: reduceNodeGroundHash(a), child_keys: [kb] }],
        [kb, { node_ref: b.region, ground_hash: reduceNodeGroundHash(b), child_keys: [ka] }],
      ]),
    };
    const nodesByKey = new Map([
      [ka, a],
      [kb, b],
    ]);
    const opts: AccumulateSemanticMapOpts = {
      synthesize: () => ({ semantic_summary: "s", boundaries: [] }),
      verifyUnanchored: () => "adversarial_confirmed",
      preImageBase: {
        reduce_reader_model_identity: "m",
        reduce_prompt_sha256: "p",
        reduce_schema_tool_version: "v",
        comprehension_version: "c",
        over_context_gate_config_sha256: "cfg",
        over_context_gate_logic_sha256: "logic",
      },
      overContextBudget: 0,
    };
    expect(() => accumulateSemanticMap(trace, nodesByKey, opts)).toThrow(/parent|cycle|tree/); // topology validator catches the cycle first (root has a parent)
  });

  it("F5: an orphan trace node (unreachable from root) fails closed", () => {
    const a = leaf(1, 10, "int", "int");
    const orphan = leaf(11, 20, "int", "int");
    const ka = reduceNodeKey(a.region);
    const ko = reduceNodeKey(orphan.region);
    const trace = {
      root_key: ka,
      nodes: new Map([
        [ka, { node_ref: a.region, ground_hash: reduceNodeGroundHash(a), child_keys: [] }],
        [ko, { node_ref: orphan.region, ground_hash: reduceNodeGroundHash(orphan), child_keys: [] }],
      ]),
    };
    const nodesByKey = new Map([
      [ka, a],
      [ko, orphan],
    ]);
    const opts: AccumulateSemanticMapOpts = {
      synthesize: () => ({ semantic_summary: "s", boundaries: [] }),
      verifyUnanchored: () => "adversarial_confirmed",
      preImageBase: {
        reduce_reader_model_identity: "m",
        reduce_prompt_sha256: "p",
        reduce_schema_tool_version: "v",
        comprehension_version: "c",
        over_context_gate_config_sha256: "cfg",
        over_context_gate_logic_sha256: "logic",
      },
      overContextBudget: 0,
    };
    expect(() => accumulateSemanticMap(trace, nodesByKey, opts)).toThrow(/unreachable from root/);
  });

  it("F6: a NaN taint count fails closed", () => {
    const child = semNode({ unanchored_unverified_count: Number.NaN });
    const node = semNode({ unanchored_unverified_count: 0 });
    expect(() => assertTaintCensusMonotone(node, [child])).toThrow(/non-negative safe integer/);
  });

  it("F8: a duplicate consumed child-judgment key fails closed", () => {
    const node = semNode({ consumed_child_judgment_keys: ["k1", "k1"] });
    expect(() => assertChildJudgmentCoverage(node, ["k1"])).toThrow(/duplicate consumed/);
  });
});

// ── over-context frontier (S3 · §13.6) ────────────────────────────────────────
// Tree (5 leaves, fanin 2): ROOT(1-50, 5 leaves) → [P3(1-40, 4), L5(41-50, 1)];
// P3 → [P1(1-20, 2), P2(21-40, 2)]; P1 → [L1,L2]; P2 → [L3,L4]. 9 distinct nodes.

describe("over-context frontier", () => {
  const build = () =>
    reduceColumnLeavesWithTrace(
      [
        leaf(1, 10, "int", "int"),
        leaf(11, 20, "text", "text"),
        leaf(21, 30, "int", "int"),
        leaf(31, 40, "text", "text"),
        leaf(41, 50, "int", "int"),
      ],
      2,
    );

  const s3opts = (overContextBudget: number): AccumulateSemanticMapOpts => ({
    synthesize: (input) => ({ semantic_summary: `kids=${input.child_summaries.length}`, boundaries: [] }),
    verifyUnanchored: () => "adversarial_confirmed",
    preImageBase: {
      reduce_reader_model_identity: "m",
      reduce_prompt_sha256: "p",
      reduce_schema_tool_version: "v",
      comprehension_version: "c",
      over_context_gate_config_sha256: "cfg",
      over_context_gate_logic_sha256: "logic",
    },
    overContextBudget,
    seedBound: true,
  });

  const modeCounts = (m: Map<string, string>) => {
    const c: Record<string, number> = { accumulating: 0, frontier: 0, subsumed: 0 };
    for (const v of m.values()) c[v] = (c[v] ?? 0) + 1;
    return c;
  };

  it("computeSubtreeLeafCounts: root=5, leaves=1", () => {
    const { trace } = build();
    const counts = computeSubtreeLeafCounts(trace);
    expect(counts.get(trace.root_key)).toBe(5);
    for (const [key, tnode] of trace.nodes) {
      if (tnode.child_keys.length === 0) expect(counts.get(key)).toBe(1);
    }
  });

  it("classifyFrontier covers every reachable node (1:1)", () => {
    const { trace } = build();
    expect(classifyFrontier(trace, 2).size).toBe(trace.nodes.size);
  });

  it("budget ≥ total → root is the sole frontier, all descendants subsumed", () => {
    const { trace } = build();
    const m = classifyFrontier(trace, 100);
    expect(m.get(trace.root_key)).toBe("frontier");
    expect(modeCounts(m)).toEqual({ accumulating: 0, frontier: 1, subsumed: 8 });
  });

  it("budget 0 → every internal node accumulates, leaves are frontier, none subsumed", () => {
    const { trace } = build();
    const c = modeCounts(classifyFrontier(trace, 0));
    expect(c.subsumed).toBe(0);
    expect(c.accumulating).toBe(4); // ROOT, P3, P1, P2
    expect(c.frontier).toBe(5); // 5 leaves
  });

  it("mid budget (4) → root accumulates, 2 frontier (P3, L5), 6 subsumed", () => {
    const { trace } = build();
    const m = classifyFrontier(trace, 4);
    expect(m.get(trace.root_key)).toBe("accumulating");
    expect(modeCounts(m)).toEqual({ accumulating: 1, frontier: 2, subsumed: 6 });
  });

  it("budget monotonicity: higher budget ⇒ ≥ subsumed", () => {
    const { trace } = build();
    const s = (b: number) => modeCounts(classifyFrontier(trace, b)).subsumed;
    expect(s(0)).toBe(0);
    expect(s(4)).toBeGreaterThan(s(0));
    expect(s(100)).toBeGreaterThan(s(4));
  });

  it("accumulate (budget ≥ total): root produced+flat (consumed=[]), all descendants subsumed+empty; 1:1", () => {
    const { trace, nodesByKey } = build();
    const map = accumulateSemanticMap(trace, nodesByKey, s3opts(100));
    expect(map.size).toBe(trace.nodes.size); // 1:1 incl subsumed
    const root = map.get(trace.root_key)!;
    expect(root.reduce_read_attempt).toBe("produced");
    expect(root.consumed_child_judgment_keys).toEqual([]); // frontier consumes no child judgments
    for (const [key, node] of map) {
      if (key === trace.root_key) continue;
      expect(node.reduce_read_attempt).toBe("subsumed");
      expect(node.semantic_summary).toBe("");
      expect(node.semantic_boundaries).toEqual([]);
      expect(node.consumed_child_judgment_keys).toEqual([]);
    }
  });

  it("accumulate (mid budget): frontier flat-reads (kids=0), accumulating consumes non-subsumed children", () => {
    const { trace, nodesByKey } = build();
    const map = accumulateSemanticMap(trace, nodesByKey, s3opts(4));
    const root = map.get(trace.root_key)!;
    // ROOT accumulates its 2 children (P3 frontier + L5 frontier).
    expect(root.reduce_read_attempt).toBe("produced");
    expect(root.consumed_child_judgment_keys.length).toBe(2);
    expect(root.semantic_summary).toBe("kids=2");
    // Exactly 6 subsumed placeholders (P1,P2,L1..L4).
    const subsumed = [...map.values()].filter((n) => n.reduce_read_attempt === "subsumed");
    expect(subsumed.length).toBe(6);
    // Frontier nodes flat-read (kids=0).
    const frontierSummaries = [...map.values()].filter(
      (n) => n.reduce_read_attempt === "produced" && n.consumed_child_judgment_keys.length === 0,
    );
    expect(frontierSummaries.length).toBe(2); // P3, L5
    expect(frontierSummaries.every((n) => n.semantic_summary === "kids=0")).toBe(true);
  });

  it("NEGATIVE CONTROL: a subsumed node carrying a judgment fails closed", () => {
    const node = semNode({
      reduce_read_attempt: "subsumed",
      semantic_boundaries: [bound("unanchored", "unverified")],
    });
    expect(() => assertSubsumedNodeEmpty(node)).toThrow(/must carry no judgment/);
  });
});

// ── S3 code cross-validation fixes (codex + onto, F1–F5) ─────────────────────
// The adversarial inputs the 9 S3 tests missed — the design-sensitive frontier slice.

describe("S3 frontier hardening", () => {
  const s3opts = (overContextBudget: number): AccumulateSemanticMapOpts => ({
    synthesize: () => ({ semantic_summary: "s", boundaries: [] }),
    verifyUnanchored: () => "adversarial_confirmed",
    preImageBase: {
      reduce_reader_model_identity: "m",
      reduce_prompt_sha256: "p",
      reduce_schema_tool_version: "v",
      comprehension_version: "c",
      over_context_gate_config_sha256: "cfg",
      over_context_gate_logic_sha256: "logic",
    },
    overContextBudget,
    seedBound: true,
  });

  it("F1: a FRONTIER root's epoch contribution rotates on a non-propagating descendant change (was []-folded)", () => {
    const l1 = leaf(1, 10, "int", "int", { distinctLB: true, witnessRow: 3 }); // lowest witness → kept by parent
    const a = reduceColumnLeavesWithTrace([l1, leaf(11, 20, "int", "int", { distinctLB: true, witnessRow: 15 })]);
    const b = reduceColumnLeavesWithTrace([l1, leaf(11, 20, "int", "int", { distinctLB: true, witnessRow: 18 })]);
    // Precondition: root ground byte-identical (parent keeps L1's lowest witness), a leaf ground changed.
    expect(reduceNodeGroundHash(a.root)).toBe(reduceNodeGroundHash(b.root));
    // budget high → root is a FRONTIER. Its contribution MUST still rotate (folds child contributions).
    const rootA = accumulateSemanticMap(a.trace, a.nodesByKey, s3opts(100)).get(a.trace.root_key)!;
    const rootB = accumulateSemanticMap(b.trace, b.nodesByKey, s3opts(100)).get(b.trace.root_key)!;
    expect(rootA.reduce_read_attempt).toBe("produced");
    expect(rootA.consumed_child_judgment_keys).toEqual([]); // frontier consumes no summaries...
    expect(rootA.subtree_epoch_contribution).not.toBe(rootB.subtree_epoch_contribution); // ...but folds contributions
  });

  // canonical-key trace builder: every map key === reduceNodeKey(node_ref) (the round-2 invariant).
  type TN = { node_ref: ReturnType<typeof leaf>["region"]; ground_hash: string; child_keys: string[] };
  const kOf = (n: ReturnType<typeof leaf>) => reduceNodeKey(n.region);
  const tn = (n: ReturnType<typeof leaf>, kids: string[]): [string, TN] => [
    kOf(n),
    { node_ref: n.region, ground_hash: "h", child_keys: kids },
  ];

  it("F2: a DAG trace (shared child under two parents) fails closed", () => {
    const root = leaf(1, 50, "int", "int");
    const p1 = leaf(1, 20, "int", "int");
    const p2 = leaf(21, 40, "int", "int");
    const shared = leaf(41, 50, "int", "int");
    const trace = {
      root_key: kOf(root),
      nodes: new Map<string, TN>([tn(root, [kOf(p1), kOf(p2)]), tn(p1, [kOf(shared)]), tn(p2, [kOf(shared)]), tn(shared, [])]),
    };
    expect(() => assertReduceTopologyIsTree(trace)).toThrow(/multiple parents|DAG/);
  });

  it("F2: a duplicate child edge fails closed", () => {
    const root = leaf(1, 20, "int", "int");
    const a = leaf(1, 10, "int", "int");
    const trace = { root_key: kOf(root), nodes: new Map<string, TN>([tn(root, [kOf(a), kOf(a)]), tn(a, [])]) };
    expect(() => assertReduceTopologyIsTree(trace)).toThrow(/duplicate child edge/);
  });

  it("F2: a real tree passes topology validation", () => {
    const { trace } = reduceColumnLeavesWithTrace(
      [leaf(1, 10, "int", "int"), leaf(11, 20, "text", "text"), leaf(21, 30, "int", "int")],
      2,
    );
    expect(() => assertReduceTopologyIsTree(trace)).not.toThrow();
  });

  it("F3: a synthesize that mutates input.node_ref cannot corrupt the result keys", () => {
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace([leaf(1, 10, "int", "int"), leaf(11, 20, "int", "int")]);
    const mutating: SemanticSynthesisFn = (input) => {
      (input.node_ref as { row_start: number }).row_start = 999; // attempt to corrupt the trace
      return { semantic_summary: "s", boundaries: [] };
    };
    const map = accumulateSemanticMap(trace, nodesByKey, { ...s3opts(0), synthesize: mutating });
    // Every result key is the original (unmutated) node key.
    for (const key of map.keys()) expect(trace.nodes.has(key)).toBe(true);
    expect(map.size).toBe(trace.nodes.size);
  });

  it("F4: NaN / Infinity / negative budget fails closed", () => {
    const { trace } = reduceColumnLeavesWithTrace([leaf(1, 10, "int", "int"), leaf(11, 20, "int", "int")]);
    expect(() => classifyFrontier(trace, Number.NaN)).toThrow(/non-negative safe integer/);
    expect(() => classifyFrontier(trace, Number.POSITIVE_INFINITY)).toThrow(/non-negative safe integer/);
    expect(() => classifyFrontier(trace, -1)).toThrow(/non-negative safe integer/);
  });

  it("F5 (onto-009): a subsumed node with nonzero taint fails closed", () => {
    const node = semNode({ reduce_read_attempt: "subsumed", unanchored_unverified_count: 5 });
    expect(() => assertSubsumedNodeEmpty(node)).toThrow(/no judgment or taint/);
  });

  // ── round-2 (symmetric boundary hardening: verifier input, synthesize output, root/key invariants) ──

  it("R2: a verifyUnanchored that mutates node_ref cannot corrupt result keys (verifier input cloned)", () => {
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace([leaf(1, 10, "int", "int"), leaf(11, 20, "int", "int")]);
    const map = accumulateSemanticMap(trace, nodesByKey, {
      ...s3opts(0),
      synthesize: (input) => ({
        semantic_summary: "s",
        boundaries: [{ row: input.node_ref.row_start, character_before: "a", character_after: "b" }],
      }),
      verifyUnanchored: ({ node_ref }) => {
        (node_ref as { row_start: number }).row_start = 999; // mutate the (cloned) input — must not leak
        return "adversarial_confirmed";
      },
    });
    for (const key of map.keys()) expect(trace.nodes.has(key)).toBe(true);
  });

  it("R2: a malformed synthesize OUTPUT (non-integer row) fails closed", () => {
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace([leaf(1, 10, "int", "int"), leaf(11, 20, "int", "int")]);
    expect(() =>
      accumulateSemanticMap(trace, nodesByKey, {
        ...s3opts(0),
        synthesize: () => ({ semantic_summary: "s", boundaries: [{ row: "11" as unknown as number, character_before: "a", character_after: "b" }] }),
      }),
    ).toThrow(/row must be a safe integer/);
  });

  it("R2: a trace whose root_key is absent from nodes fails closed", () => {
    const a = leaf(1, 10, "int", "int");
    const trace = { root_key: "missing", nodes: new Map<string, TN>([tn(a, [])]) };
    expect(() => assertReduceTopologyIsTree(trace)).toThrow(/root_key 'missing' is not in the trace/);
  });

  it("R2: a non-canonical (alias) map key fails closed", () => {
    const a = leaf(1, 10, "int", "int");
    const trace = { root_key: "alias", nodes: new Map<string, TN>([["alias", { node_ref: a.region, ground_hash: "h", child_keys: [] }]]) };
    expect(() => assertReduceTopologyIsTree(trace)).toThrow(/keys must be canonical/);
  });

  // ── round-3 (data boundaries: nodesByKey consistency, budget→epoch binding, output immutability) ──

  it("R3-F1: a nodesByKey entry that disagrees with the trace node fails closed", () => {
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace([leaf(1, 10, "int", "int"), leaf(11, 20, "int", "int")]);
    const bad = new Map(nodesByKey);
    bad.set(trace.root_key, leaf(1, 10, "int", "int")); // wrong region/ground for the root key
    expect(() => accumulateSemanticMap(trace, bad, s3opts(0))).toThrow(/disagrees with the trace/);
  });

  it("R3-F2: the same trace under different budgets rotates the epoch contribution (budget bound at runtime)", () => {
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace(
      [leaf(1, 10, "int", "int"), leaf(11, 20, "text", "text"), leaf(21, 30, "int", "int")],
      2,
    );
    const r0 = accumulateSemanticMap(trace, nodesByKey, s3opts(0)).get(trace.root_key)!;
    const r100 = accumulateSemanticMap(trace, nodesByKey, s3opts(100)).get(trace.root_key)!;
    // same preImageBase config sha, different budget → different key (the runtime folds the budget).
    expect(r0.subtree_epoch_contribution).not.toBe(r100.subtree_epoch_contribution);
  });

  it("R3-F3: mutating a returned node cannot corrupt the trace (output node_ref/child_keys cloned)", () => {
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace([leaf(1, 10, "int", "int"), leaf(11, 20, "text", "text")]);
    const root = accumulateSemanticMap(trace, nodesByKey, s3opts(100)).get(trace.root_key)!;
    const beforeChildKeys = [...trace.nodes.get(trace.root_key)!.child_keys];
    (root.node_ref as { row_start: number }).row_start = -999;
    root.topology_child_keys.push("injected");
    expect(trace.nodes.get(trace.root_key)!.node_ref.row_start).not.toBe(-999);
    expect(trace.nodes.get(trace.root_key)!.child_keys).toEqual(beforeChildKeys);
  });

  // ── round-4 (canonical synthesis input, boundary_ref projection, config type) ──

  it("R4: the synthesis input format_clusters is canonical (sorted) regardless of raw order", () => {
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace([leaf(1, 10, "int", "int"), leaf(11, 20, "text", "text")]);
    let captured: string[] = [];
    accumulateSemanticMap(trace, nodesByKey, {
      ...s3opts(0),
      synthesize: (input) => {
        captured = input.format_clusters;
        return { semantic_summary: "s", boundaries: [] };
      },
    });
    expect(captured).toEqual([...captured].sort());
  });

  it("R4: coverage boundary_ref carries ONLY the declared keys (no aliased extra props)", () => {
    const seam = { ...witness(11, "int", "text"), extra: { nested: 1 } } as unknown as ComprehensionBoundaryWitness;
    const { coverage } = reconcileBoundaries([], { boundaries: [seam] });
    expect(Object.keys(coverage[0]!.boundary_ref).sort()).toEqual([
      "boundary_kind",
      "column_index",
      "first_new_format_row",
      "last_prev_format_row",
      "new_shape",
      "prev_shape",
      "sheet",
    ]);
  });

  it("R4: a non-string over_context_gate_config_sha256 fails closed", () => {
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace([leaf(1, 10, "int", "int"), leaf(11, 20, "int", "int")]);
    const base = s3opts(0);
    const bad: AccumulateSemanticMapOpts = {
      ...base,
      preImageBase: { ...base.preImageBase, over_context_gate_config_sha256: {} as unknown as string },
    };
    expect(() => accumulateSemanticMap(trace, nodesByKey, bad)).toThrow(/must be a string/);
  });
});

// ── projectSemanticMapToSeed (S4 seed projection · §6) ────────────────────────

describe("projectSemanticMapToSeed", () => {
  const region = (rs: number, re: number) => ({ sheet: SHEET, column_index: COL, row_start: rs, row_end: re });
  const nodeAt = (rs: number, re: number, over: Partial<ComprehensionSemanticNode> = {}) =>
    semNode({ node_ref: region(rs, re), ...over });
  const mapOf = (...nodes: ComprehensionSemanticNode[]) => {
    const m = new Map<string, ComprehensionSemanticNode>();
    for (const n of nodes) m.set(reduceNodeKey(n.node_ref), n);
    return m;
  };

  it("anchored → 'structural_location_only' (never verified); non_authoritative + provisional", () => {
    const proj = projectSemanticMapToSeed(mapOf(nodeAt(1, 10, { semantic_boundaries: [bound("anchored", "structural_location_only", 5)] })));
    expect(proj.authority).toBe("non_authoritative");
    expect(proj.provisional).toBe(true);
    expect(proj.nodes[0]?.boundaries[0]?.disposition).toBe("structural_location_only");
  });

  it("unanchored + adversarial_confirmed → 'adversarial_confirmed'", () => {
    const proj = projectSemanticMapToSeed(mapOf(nodeAt(1, 10, { semantic_boundaries: [bound("unanchored", "adversarial_confirmed", 5)] })));
    expect(proj.nodes[0]?.boundaries[0]?.disposition).toBe("adversarial_confirmed");
  });

  it("unanchored + refuted → EXCLUDED from seed boundaries, disclosed + counted in taint", () => {
    const proj = projectSemanticMapToSeed(
      mapOf(nodeAt(1, 10, { semantic_boundaries: [bound("unanchored", "adversarial_refuted", 5)], unanchored_unverified_count: 1 })),
    );
    expect(proj.nodes[0]?.boundaries.length).toBe(0);
    expect(proj.refuted_disclosure.length).toBe(1);
    expect(proj.refuted_disclosure_total).toBe(1);
    expect(proj.unanchored_unverified_total).toBe(1);
  });

  it("NEGATIVE CONTROL: an unverified unanchored boundary reaching projection fails closed", () => {
    expect(() =>
      projectSemanticMapToSeed(mapOf(nodeAt(1, 10, { semantic_boundaries: [bound("unanchored", "unverified", 5)], unanchored_unverified_count: 1 }))),
    ).toThrow(/unverified unanchored boundary.*reached seed projection/);
  });

  it("a subsumed node contributes no seed node", () => {
    const proj = projectSemanticMapToSeed(
      mapOf(
        nodeAt(1, 10, { semantic_boundaries: [bound("anchored", "structural_location_only", 5)] }),
        nodeAt(11, 20, { reduce_read_attempt: "subsumed", semantic_summary: "", semantic_boundaries: [] }),
      ),
    );
    expect(proj.nodes.length).toBe(1);
    expect(proj.nodes_total).toBe(1);
  });

  it("taint census = the root (max monotone) count", () => {
    const proj = projectSemanticMapToSeed(
      mapOf(nodeAt(1, 20, { unanchored_unverified_count: 5 }), nodeAt(1, 10, { unanchored_unverified_count: 2 })),
    );
    expect(proj.unanchored_unverified_total).toBe(5);
  });

  it("display bound: nodes_total / refuted_disclosure_total stay AUTHORITATIVE (no silent drop)", () => {
    const proj = projectSemanticMapToSeed(
      mapOf(
        nodeAt(1, 10, { semantic_boundaries: [bound("anchored", "structural_location_only", 5)] }),
        nodeAt(11, 20, { semantic_boundaries: [bound("anchored", "structural_location_only", 15)] }),
        nodeAt(21, 30, { semantic_boundaries: [bound("anchored", "structural_location_only", 25)] }),
      ),
      { maxNodes: 1 },
    );
    expect(proj.nodes.length).toBe(1);
    expect(proj.nodes_total).toBe(3); // authoritative — the other 2 were bounded for size, not dropped
  });
});
