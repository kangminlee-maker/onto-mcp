import { createHash } from "node:crypto";
import type {
  CodeStructureInventory,
  CodeSymbolSpan,
} from "../code-structure-observer.js";
import {
  canonicalBoundariesCore,
  foldHierarchyWithTraceCore,
  mergeNodesCore,
  type HierarchyFoldNode,
  type ReduceCoordAdapter,
  type ReduceTraceCore,
} from "./comprehension-reduce-core.js";

// ─────────────────────────────────────────────────────────────────────────────
// comprehension-reduce-code — the CODE artifact's L1 reduce realization (multi-artifact design
// 20260718 §3 DD5/DD9; the code sibling of the spreadsheet façade in comprehension-reduce.ts).
// Consumes the deterministic code-structure-observer inventory and folds it through the SAME
// signal-agnostic monoid core the spreadsheet path uses — per-file, line-coordinate, kind-signal.
// LLM-free; ground is byte-stable and grouping-invariant (proven live by the N=1 probe P3 8/8 and
// the grouping-invariance test below through this product module).
//
// Coordinate vocabulary (DD9): region {file, line_start, line_end}; witness kind "symbol_kind";
// node key `${file}:${line_start}-${line_end}`. The spreadsheet vocabulary is untouched.
// ─────────────────────────────────────────────────────────────────────────────

export interface CodeReduceRegion {
  file: string;
  /** 1-based inclusive line range this node covers. */
  line_start: number;
  line_end: number;
}

export interface CodeBoundaryWitness {
  file: string;
  boundary_kind: "symbol_kind";
  prev_kind: string;
  new_kind: string;
  last_prev_line: number;
  first_new_line: number;
}

/** Same-schema code reduce node (leaf and merged parent — monoid fold). Pure deterministic
 *  projection of the structure inventory; NO LLM touch. */
export interface CodeReduceNode {
  region: CodeReduceRegion;
  /** Distinct kind tokens present under this node (sorted, unique). */
  kind_clusters: string[];
  boundaries: CodeBoundaryWitness[];
  edge_first_kind: string | null;
  edge_last_kind: string | null;
  distinct_is_lower_bound: boolean;
  boundaries_are_lower_bound: boolean;
  segments_capped: boolean;
  limiting_witness: { file: string; line: number; reason: string } | null;
}

export type CodeSemanticNodeKey = string;

export function codeReduceNodeKey(region: CodeReduceRegion): CodeSemanticNodeKey {
  return `${region.file}:${region.line_start}-${region.line_end}`;
}

function canonicalCodeWitness(w: CodeBoundaryWitness): CodeBoundaryWitness {
  return {
    file: w.file,
    boundary_kind: w.boundary_kind,
    prev_kind: w.prev_kind,
    new_kind: w.new_kind,
    last_prev_line: w.last_prev_line,
    first_new_line: w.first_new_line,
  };
}

/** Canonical GROUND (fixed field order; prose-free) — the byte-stable subject a resume key hashes. */
export function codeReduceNodeGround(node: CodeReduceNode): Record<string, unknown> {
  const r = node.region;
  const w = node.limiting_witness;
  return {
    region: { file: r.file, line_start: r.line_start, line_end: r.line_end },
    kind_clusters: [...node.kind_clusters].sort(),
    boundaries: canonicalBoundariesCore(CODE_REDUCE_ADAPTER, node.boundaries),
    edge_first_kind: node.edge_first_kind,
    edge_last_kind: node.edge_last_kind,
    distinct_is_lower_bound: node.distinct_is_lower_bound,
    boundaries_are_lower_bound: node.boundaries_are_lower_bound,
    segments_capped: node.segments_capped,
    limiting_witness: w ? { file: w.file, line: w.line, reason: w.reason } : null,
  };
}

export function codeReduceNodeGroundHash(node: CodeReduceNode): string {
  return createHash("sha256").update(JSON.stringify(codeReduceNodeGround(node))).digest("hex");
}

export const CODE_REDUCE_ADAPTER: ReduceCoordAdapter<CodeReduceNode, CodeReduceRegion, CodeBoundaryWitness> = {
  moduleTag: "comprehension-reduce-code",
  region: (n) => n.region,
  clusters: (n) => n.kind_clusters,
  boundaries: (n) => n.boundaries,
  edgeFirstSignal: (n) => n.edge_first_kind,
  edgeLastSignal: (n) => n.edge_last_kind,
  distinctIsLowerBound: (n) => n.distinct_is_lower_bound,
  boundariesAreLowerBound: (n) => n.boundaries_are_lower_bound,
  segmentsCapped: (n) => n.segments_capped,
  limitingWitness: (n) => n.limiting_witness,
  limitingWitnessPos: (w) => (w as NonNullable<CodeReduceNode["limiting_witness"]>).line,
  containerEquals: (a, b) => a.file === b.file,
  spanStart: (r) => r.line_start,
  spanEnd: (r) => r.line_end,
  nodeKey: (r) => codeReduceNodeKey(r),
  cloneRegion: (r) => ({ file: r.file, line_start: r.line_start, line_end: r.line_end }),
  canonicalWitness: canonicalCodeWitness,
  witnessOrderTuple: (w) => [
    w.file,
    w.first_new_line,
    w.last_prev_line,
    w.boundary_kind,
    w.prev_kind,
    w.new_kind,
  ],
  makeSeamWitness: (left, right) => ({
    file: left.region.file,
    boundary_kind: "symbol_kind",
    prev_kind: left.edge_last_kind as string,
    new_kind: right.edge_first_kind as string,
    last_prev_line: left.region.line_end,
    first_new_line: right.region.line_start,
  }),
  makeParent: ({ first, last, clusters, boundaries, distinctLB, boundsLB, capped, limitingWitness }) => ({
    region: { file: first.region.file, line_start: first.region.line_start, line_end: last.region.line_end },
    kind_clusters: clusters,
    boundaries,
    edge_first_kind: first.edge_first_kind,
    edge_last_kind: last.edge_last_kind,
    distinct_is_lower_bound: distinctLB,
    boundaries_are_lower_bound: boundsLB,
    segments_capped: capped,
    limiting_witness: (limitingWitness as CodeReduceNode["limiting_witness"]) ?? null,
  }),
  groundHash: (n) => codeReduceNodeGroundHash(n),
  messages: {
    emptyChildren: () => "reduce requires ≥1 child",
    invertedRange: (r) => `inverted range [${r.line_start},${r.line_end}] (line_start > line_end)`,
    mixedRegion: (c, first) =>
      `all children must share one file (got ${c.file} vs ${first.file}) — per-file reduce (cross-file = 1b set tier)`,
    overlap: (a, b) =>
      `children overlap/interleave: [${a.line_start},${a.line_end}] then [${b.line_start},${b.line_end}] — a non-contiguous partition silently drops seams (R8)`,
    honestyDropped: (flag) =>
      flag === "distinct"
        ? "parent dropped a child's distinct_is_lower_bound (R9)"
        : flag === "bounds"
          ? "parent dropped a child's boundaries_are_lower_bound (R9)"
          : "parent dropped a child's segments_capped (R9)",
  },
};

/** Leaf node from one inventory span (pure deterministic projection; honesty flags are false —
 *  the tree-sitter extractor is uncapped in v1, so nothing is a lower bound). */
export function codeLeafFromSpan(file: string, span: CodeSymbolSpan): CodeReduceNode {
  return {
    region: { file, line_start: span.line_start, line_end: span.line_end },
    kind_clusters: [span.kind],
    boundaries: [],
    edge_first_kind: span.kind,
    edge_last_kind: span.kind,
    distinct_is_lower_bound: false,
    boundaries_are_lower_bound: false,
    segments_capped: false,
    limiting_witness: null,
  };
}

export function mergeCodeReduceNodes(children: CodeReduceNode[]): CodeReduceNode {
  return mergeNodesCore(CODE_REDUCE_ADAPTER, children);
}

/** Fold a file's structure inventory through the AUTHORED hierarchy (AST span-tree) into the
 *  reduce root + navigable trace (design DD5 — the code analog of reduceColumnLeavesWithTrace).
 *  The hierarchy rows come from the observer: leaf rows (span-keyed), container rows (child_keys),
 *  and one file root. Resolution is container-first so a single item spanning the whole file
 *  cannot alias the file root. Fail-loud on any dangling key (a malformed inventory must not
 *  silently drop a subtree). */
export function foldCodeStructureInventory(
  file: string,
  inventory: CodeStructureInventory,
  fanin: number,
): { root: CodeReduceNode; trace: ReduceTraceCore<CodeReduceRegion>; nodesByKey: Map<CodeSemanticNodeKey, CodeReduceNode> } {
  const { spans, hierarchy, root_key } = inventory.symbol_tiles;
  if (spans.length === 0) {
    throw new Error(`comprehension-reduce-code: inventory for ${file} has no spans (empty file — caller must skip)`);
  }
  const leafBySpanKey = new Map<string, CodeSymbolSpan>();
  for (const span of spans) {
    leafBySpanKey.set(`${span.line_start}-${span.line_end}`, span);
  }
  const containerByKey = new Map<string, string[]>();
  let fileChildKeys: string[] | null = null;
  for (const row of hierarchy) {
    if (row.kind === "file") {
      fileChildKeys = row.child_keys;
      continue;
    }
    if (row.child_keys.length > 0) containerByKey.set(row.key, row.child_keys);
  }
  if (!fileChildKeys) {
    throw new Error(`comprehension-reduce-code: inventory for ${file} has no file root row (malformed)`);
  }
  const buildNode = (key: string, allowContainer: boolean): HierarchyFoldNode<CodeReduceNode> => {
    const containerChildren = allowContainer ? containerByKey.get(key) : undefined;
    if (containerChildren) {
      // v1 depth-2: container children are always leaves (allowContainer=false seals recursion).
      return { children: containerChildren.map((c) => buildNode(c, false)) };
    }
    const span = leafBySpanKey.get(key);
    if (!span) {
      throw new Error(`comprehension-reduce-code: hierarchy key '${key}' in ${file} resolves to no span (malformed inventory)`);
    }
    return { leaf: codeLeafFromSpan(file, span) };
  };
  const root: HierarchyFoldNode<CodeReduceNode> = {
    children: fileChildKeys.map((k) => buildNode(k, true)),
  };
  void root_key; // the trace derives its own root key from the fold (single-child pass-through safe).
  return foldHierarchyWithTraceCore(CODE_REDUCE_ADAPTER, root, fanin);
}
