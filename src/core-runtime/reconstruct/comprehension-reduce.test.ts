import { describe, expect, it } from "vitest";
import type {
  ColumnValueTiles,
  IntraTileNote,
  ValueTileSegment,
} from "../spreadsheet-structure-observer.js";
import {
  assertContiguousChildren,
  assertHonestyFold,
  buildColumnLeaves,
  mergeReduceNodes,
  reduceColumnLeaves,
  reduceNodeGroundHash,
  type ComprehensionReduceNode,
} from "./comprehension-reduce.js";

const SHEET = "누적";
const COL = 4;

// A same-column leaf node built directly (for merge/contiguity/seam/honesty tests).
function leaf(
  rowStart: number,
  rowEnd: number,
  clusters: string[],
  edgeFirst: string | null,
  edgeLast: string | null,
  opts: { column?: number; distinctLB?: boolean; capped?: boolean } = {},
): ComprehensionReduceNode {
  return {
    region: { sheet: SHEET, column_index: opts.column ?? COL, row_start: rowStart, row_end: rowEnd },
    format_clusters: [...clusters].sort(),
    boundaries: [],
    edge_first_shape: edgeFirst,
    edge_last_shape: edgeLast,
    distinct_is_lower_bound: opts.distinctLB ?? false,
    boundaries_are_lower_bound: opts.capped ?? false,
    segments_capped: opts.capped ?? false,
    limiting_witness: opts.distinctLB
      ? { sheet: SHEET, column_index: opts.column ?? COL, row: rowStart, reason: "distinct_count capped" }
      : null,
  };
}

const seg = (
  row_start: number,
  row_end: number,
  shape: string | null,
  distinctLB = false,
): ValueTileSegment => ({
  row_start,
  row_end,
  non_empty: shape ? 10 : 0,
  type_counts: {},
  shape_counts: shape ? { [shape]: 10 } : {},
  dominant_shape: shape,
  format_counts: {},
  dominant_format: null,
  distinct_count: 5,
  distinct_is_lower_bound: distinctLB,
});
const note = (prev: string, next: string, prevRow: number, newRow: number): IntraTileNote => ({
  boundary_kind: "value_shape",
  prev_shape: prev,
  new_shape: next,
  last_prev_format_row: prevRow,
  first_new_format_row: newRow,
});
const column = (segments: ValueTileSegment[], notes: IntraTileNote[] = [], capped = false): ColumnValueTiles => ({
  column_index: COL,
  segments,
  segments_capped: capped,
  intra_tile_notes: notes,
});

describe("comprehension-reduce — grouping-invariance (R8)", () => {
  // 6 contiguous segments: INT INT | DEC DEC | INT INT with value_shape boundaries at the two shifts.
  const fixtureColumn = column(
    [
      seg(1, 100, "INT"),
      seg(101, 200, "INT"),
      seg(201, 300, "DEC"),
      seg(301, 400, "DEC"),
      seg(401, 500, "INT"),
      seg(501, 600, "INT"),
    ],
    [note("INT", "DEC", 200, 201), note("DEC", "INT", 400, 401)],
  );

  it("byte-identical root ground across every canonical (contiguous) grouping", () => {
    const leaves = buildColumnLeaves(SHEET, fixtureColumn, { leafCount: 6 });
    expect(leaves).toHaveLength(6);
    const flat = reduceNodeGroundHash(reduceColumnLeaves(leaves)); // one flat k-ary merge
    const binary = reduceNodeGroundHash(reduceColumnLeaves(leaves, 2)); // deep binary tree
    const ternary = reduceNodeGroundHash(reduceColumnLeaves(leaves, 3));
    expect(binary).toBe(flat);
    expect(ternary).toBe(flat);
  });

  it("recovers the true clusters and boundaries (seams at the real shifts)", () => {
    const root = reduceColumnLeaves(buildColumnLeaves(SHEET, fixtureColumn, { leafCount: 6 }));
    expect(root.format_clusters).toEqual(["DEC", "INT"]);
    expect(root.region).toEqual({ sheet: SHEET, column_index: COL, row_start: 1, row_end: 600 });
    expect(root.edge_first_shape).toBe("INT");
    expect(root.edge_last_shape).toBe("INT");
    expect(root.boundaries.map((b) => b.first_new_format_row).sort((a, b) => a - b)).toEqual([201, 401]);
  });

  it("FALSIFIABILITY: dropping a boundary changes the ground hash (the check can fail)", () => {
    const root = reduceColumnLeaves(buildColumnLeaves(SHEET, fixtureColumn, { leafCount: 6 }));
    const correct = reduceNodeGroundHash(root);
    const mutated = { ...root, boundaries: root.boundaries.slice(1) };
    expect(reduceNodeGroundHash(mutated)).not.toBe(correct);
  });
});

describe("comprehension-reduce — contiguity validator (fail-closed, R8 blocker)", () => {
  it("accepts a contiguous partition (no violations)", () => {
    expect(assertContiguousChildren([leaf(1, 100, ["INT"], "INT", "INT"), leaf(101, 200, ["DEC"], "DEC", "DEC")]))
      .toEqual([]);
  });

  it("accepts a row GAP (no overlap) — a gap adds no seam", () => {
    const children = [leaf(1, 100, ["INT"], "INT", "INT"), leaf(201, 300, ["DEC"], "DEC", "DEC")];
    expect(assertContiguousChildren(children)).toEqual([]);
    const merged = mergeReduceNodes(children);
    expect(merged.boundaries).toHaveLength(0); // gap ⇒ NO seam, even though edges differ
  });

  it("REJECTS overlapping ranges (fail-closed)", () => {
    const v = assertContiguousChildren([leaf(1, 100, ["INT"], "INT", "INT"), leaf(50, 150, ["DEC"], "DEC", "DEC")]);
    expect(v.map((x) => x.code)).toContain("overlap_or_interleave");
    expect(() => mergeReduceNodes([leaf(1, 100, ["INT"], "INT", "INT"), leaf(50, 150, ["DEC"], "DEC", "DEC")]))
      .toThrow(/overlap\/interleave/);
  });

  it("REJECTS an interleaved (non-contiguous) partition — the R1 'cross' failure cannot happen", () => {
    // Simulate the harness 'cross' arm: two nodes whose row ranges interleave.
    const m02 = leaf(1, 300, ["INT", "DEC"], "INT", "DEC");
    const m13 = leaf(101, 400, ["DEC", "INT"], "DEC", "INT");
    expect(() => mergeReduceNodes([m02, m13])).toThrow();
  });

  it("REJECTS a mixed-column partition (per-column reduce)", () => {
    const v = assertContiguousChildren([leaf(1, 100, ["INT"], "INT", "INT"), leaf(101, 200, ["DEC"], "DEC", "DEC", { column: 9 })]);
    expect(v.map((x) => x.code)).toContain("mixed_region");
  });

  it("REJECTS an empty partition", () => {
    expect(assertContiguousChildren([]).map((x) => x.code)).toContain("empty");
    expect(() => mergeReduceNodes([])).toThrow();
  });
});

describe("comprehension-reduce — seam detection", () => {
  it("adds a seam at an adjacent junction with DIFFERING edges", () => {
    const merged = mergeReduceNodes([leaf(1, 100, ["INT"], "INT", "INT"), leaf(101, 200, ["DEC"], "DEC", "DEC")]);
    expect(merged.boundaries).toHaveLength(1);
    expect(merged.boundaries[0]).toMatchObject({ first_new_format_row: 101, prev_shape: "INT", new_shape: "DEC" });
  });

  it("adds NO seam at an adjacent junction with MATCHING edges", () => {
    const merged = mergeReduceNodes([leaf(1, 100, ["INT"], "INT", "INT"), leaf(101, 200, ["INT"], "INT", "INT")]);
    expect(merged.boundaries).toHaveLength(0);
  });
});

describe("comprehension-reduce — honesty fold (R9)", () => {
  it("ORs distinct_is_lower_bound / segments_capped up the tree", () => {
    const merged = mergeReduceNodes([
      leaf(1, 100, ["INT"], "INT", "INT"),
      leaf(101, 200, ["INT"], "INT", "INT", { distinctLB: true, capped: true }),
    ]);
    expect(merged.distinct_is_lower_bound).toBe(true);
    expect(merged.segments_capped).toBe(true);
    expect(merged.limiting_witness).toMatchObject({ row: 101 });
  });

  it("assertHonestyFold rejects a parent that UNDERSTATES a child's lower bound", () => {
    const children = [leaf(1, 100, ["INT"], "INT", "INT", { distinctLB: true })];
    const dishonest: ComprehensionReduceNode = { ...children[0], distinct_is_lower_bound: false, limiting_witness: null };
    expect(assertHonestyFold(dishonest, children).length).toBeGreaterThan(0);
  });
});

describe("comprehension-reduce — monoid identity & leaf construction", () => {
  it("reducing a single leaf returns it unchanged", () => {
    const l = leaf(1, 100, ["INT"], "INT", "INT");
    expect(reduceColumnLeaves([l])).toBe(l);
  });

  it("buildColumnLeaves projects segments deterministically (edges, clusters, capped)", () => {
    const leaves = buildColumnLeaves(SHEET, column([seg(1, 100, "INT"), seg(101, 200, "DEC", true)], [], true), { leafCount: 1 });
    expect(leaves).toHaveLength(1);
    expect(leaves[0].format_clusters).toEqual(["DEC", "INT"]);
    expect(leaves[0].edge_first_shape).toBe("INT");
    expect(leaves[0].edge_last_shape).toBe("DEC");
    expect(leaves[0].distinct_is_lower_bound).toBe(true);
    expect(leaves[0].segments_capped).toBe(true);
  });

  it("skips all-empty columns", () => {
    expect(buildColumnLeaves(SHEET, column([seg(1, 100, null), seg(101, 200, null)]))).toHaveLength(0);
  });
});
