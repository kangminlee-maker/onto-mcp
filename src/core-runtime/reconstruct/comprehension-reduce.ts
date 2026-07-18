import { createHash } from "node:crypto";
import type {
  ColumnValueTiles,
  IntraTileNote,
} from "../spreadsheet-structure-observer.js";
import type { ComprehensionBoundaryWitness } from "./comprehension-artifact.js";
import {
  assertContiguousChildrenCore,
  assertHonestyFoldCore,
  canonicalBoundariesCore,
  foldLeavesCore,
  foldLeavesWithTraceCore,
  mergeNodesCore,
  type ReduceCoordAdapter,
} from "./comprehension-reduce-core.js";

// ─────────────────────────────────────────────────────────────────────────────
// comprehension-reduce (P1-C2-C · Layer-1 결정론 코어) — the same-schema UNION monoid that folds a
// column's value-signature leaves up a tree. This is the "reduce" the ComprehensionArtifact marks
// engine-not-yet (comprehension-artifact.ts:150). It is the RESUMABLE CORE: code owns the ground, LLM
// touches nothing here (design 20260701-reduce-merge-layer-boundary-design §2.1/§3/§4).
//
// Why deterministic (empirically): a real-LLM merge that AUTHORS the ground was grouping-variant
// (~33% drift, R8) — `scripts/reduce-proof-harness.mts` live 4/6; the code-owned union (this module's
// reference impl `mergeDeterministic`) was 6/6 byte-stable. So the ground is code; the LLM semantic
// map is a SEPARATE Layer-2 channel (a later cut) excluded from the resume key.
//
// SCOPE: per-column, row-window reduce (leaf = a contiguous block of a column's value tiles; merge =
// adjacent row-windows of the SAME column). Cross-column / cross-sheet aggregation is a separate
// concern (§5.6 relational seam). Signal = value-shape (dominant_shape); display-format is an
// analogous parallel channel deferred to keep this cut to what R1 de-risked.
//
// The monoid law is ENFORCED, not asserted in prose:
//  - canonical child-partition = CONTIGUOUS only. `assertContiguousChildren` fail-closed REJECTS an
//    overlapping/interleaved partition (the R8 blocker the cross-validation flagged: the seam rule is
//    only a seam-ADD gate, so a non-contiguous partition would silently drop a seam and emit a
//    seam-missing ground cached as canonical — design §4 / §8 F1). A row GAP is allowed (no seam).
//  - honesty fold (R9): is_lower_bound / segments_capped / boundaries_are_lower_bound = OR; a parent
//    may never understate a child's lower bound (`assertHonestyFold` fail-closed).
// ─────────────────────────────────────────────────────────────────────────────

/** Identity of one reduce node: a contiguous row range of a single column. */
export interface ComprehensionReduceRegion {
  sheet: string;
  column_index: number;
  /** 1-based inclusive sheet-row range this node covers. */
  row_start: number;
  row_end: number;
}

/** A same-schema reduce node (leaf and merged parent share this shape — monoid fold). Every field is
 *  a pure deterministic function of the value tiles; NO LLM touch. */
export interface ComprehensionReduceNode {
  region: ComprehensionReduceRegion;
  /** Distinct value-shape tokens present under this node (sorted, unique). */
  format_clusters: string[];
  /** Value-shape transition boundaries under this node (children's, plus adjacency-gated seams). */
  boundaries: ComprehensionBoundaryWitness[];
  /** Dominant value-shape at the node's first / last non-empty row (null when all-empty). Carried so a
   *  parent can decide a SEAM at a child junction without re-reading. */
  edge_first_shape: string | null;
  edge_last_shape: string | null;
  /** OR fold (R9): true if any covered segment's distinct count was capped. */
  distinct_is_lower_bound: boolean;
  /** OR fold (R9): true if segment retention was capped (boundaries may be incomplete). */
  boundaries_are_lower_bound: boolean;
  /** OR fold (design §2.1 capped): true if any covered region was honestly capped. */
  segments_capped: boolean;
  /** Localizes WHICH region drove a lower bound (R9 §5.4) — lowest-row capped region, or null. */
  limiting_witness: { sheet: string; column_index: number; row: number; reason: string } | null;
}

// ── canonical projection (resume-key subject; prose-free, byte-stable) ────────

/** Re-key a boundary witness into a FIXED field order so JSON.stringify is byte-stable regardless of
 *  how a producer happened to construct the object (nested-object canonicalization; review F2). */
function canonicalWitness(b: ComprehensionBoundaryWitness): ComprehensionBoundaryWitness {
  return {
    sheet: b.sheet,
    column_index: b.column_index,
    boundary_kind: b.boundary_kind,
    prev_shape: b.prev_shape,
    new_shape: b.new_shape,
    last_prev_format_row: b.last_prev_format_row,
    first_new_format_row: b.first_new_format_row,
  };
}

// Dedup + total-order sort both derive from SPREADSHEET_REDUCE_ADAPTER.witnessOrderTuple (the same
// 7 fields the pre-extraction dedup key held), so sort ⊇ dedup holds by construction (review
// R8-CANON-BOUND-SORT / F1-det; multi-artifact 리뷰 inv-F1) — byte-identical output to the
// pre-extraction implementation.
function canonicalBoundaries(
  boundaries: ComprehensionBoundaryWitness[],
): ComprehensionBoundaryWitness[] {
  return canonicalBoundariesCore(SPREADSHEET_REDUCE_ADAPTER, boundaries);
}

/** The canonical GROUND of a node — the byte-stable subject a resume key hashes. Contains only
 *  deterministic structure (no prose, no LLM field), sorted/normalized so equal structure → equal bytes. */
export function reduceNodeGround(node: ComprehensionReduceNode): Record<string, unknown> {
  // Every nested object is re-keyed into a FIXED field order (region, witnesses via canonicalBoundaries,
  // limiting_witness) so byte-stability does not silently rest on producers sharing one key-insertion
  // order (review F2).
  const r = node.region;
  const w = node.limiting_witness;
  return {
    region: { sheet: r.sheet, column_index: r.column_index, row_start: r.row_start, row_end: r.row_end },
    format_clusters: [...node.format_clusters].sort(),
    boundaries: canonicalBoundaries(node.boundaries),
    edge_first_shape: node.edge_first_shape,
    edge_last_shape: node.edge_last_shape,
    distinct_is_lower_bound: node.distinct_is_lower_bound,
    boundaries_are_lower_bound: node.boundaries_are_lower_bound,
    segments_capped: node.segments_capped,
    limiting_witness: w
      ? { sheet: w.sheet, column_index: w.column_index, row: w.row, reason: w.reason }
      : null,
  };
}

export function reduceNodeGroundHash(node: ComprehensionReduceNode): string {
  return createHash("sha256").update(JSON.stringify(reduceNodeGround(node))).digest("hex");
}

// ── coordinate adapter (multi-artifact design 20260718 §2 DD1/DD2) ────────────
// The signal-agnostic monoid/fold algorithm lives in comprehension-reduce-core.ts; this adapter is
// the spreadsheet realization — every literal construction, node-key format, witness tuple, and
// violation message is reproduced verbatim so the extraction is byte-invariant (G-SS).

const SPREADSHEET_REDUCE_ADAPTER: ReduceCoordAdapter<
  ComprehensionReduceNode,
  ComprehensionReduceRegion,
  ComprehensionBoundaryWitness
> = {
  moduleTag: "comprehension-reduce",
  region: (n) => n.region,
  clusters: (n) => n.format_clusters,
  boundaries: (n) => n.boundaries,
  edgeFirstSignal: (n) => n.edge_first_shape,
  edgeLastSignal: (n) => n.edge_last_shape,
  distinctIsLowerBound: (n) => n.distinct_is_lower_bound,
  boundariesAreLowerBound: (n) => n.boundaries_are_lower_bound,
  segmentsCapped: (n) => n.segments_capped,
  limitingWitness: (n) => n.limiting_witness,
  limitingWitnessPos: (w) => (w as NonNullable<ComprehensionReduceNode["limiting_witness"]>).row,
  containerEquals: (a, b) => a.sheet === b.sheet && a.column_index === b.column_index,
  spanStart: (r) => r.row_start,
  spanEnd: (r) => r.row_end,
  nodeKey: (r) => reduceNodeKey(r),
  cloneRegion: (r) => ({ sheet: r.sheet, column_index: r.column_index, row_start: r.row_start, row_end: r.row_end }),
  canonicalWitness: (w) => canonicalWitness(w),
  witnessOrderTuple: (w) => [
    w.sheet,
    w.column_index,
    w.first_new_format_row,
    w.last_prev_format_row,
    w.boundary_kind,
    w.prev_shape,
    w.new_shape,
  ],
  makeSeamWitness: (left, right) => ({
    sheet: left.region.sheet,
    column_index: left.region.column_index,
    boundary_kind: "value_shape",
    prev_shape: left.edge_last_shape as string,
    new_shape: right.edge_first_shape as string,
    last_prev_format_row: left.region.row_end,
    first_new_format_row: right.region.row_start,
  }),
  makeParent: ({ first, last, clusters, boundaries, distinctLB, boundsLB, capped, limitingWitness }) => ({
    region: {
      sheet: first.region.sheet,
      column_index: first.region.column_index,
      row_start: first.region.row_start,
      row_end: last.region.row_end,
    },
    format_clusters: clusters,
    boundaries,
    edge_first_shape: first.edge_first_shape,
    edge_last_shape: last.edge_last_shape,
    distinct_is_lower_bound: distinctLB,
    boundaries_are_lower_bound: boundsLB,
    segments_capped: capped,
    limiting_witness: (limitingWitness as ComprehensionReduceNode["limiting_witness"]) ?? null,
  }),
  groundHash: (n) => reduceNodeGroundHash(n),
  messages: {
    emptyChildren: () => "reduce requires ≥1 child",
    invertedRange: (r) => `inverted range [${r.row_start},${r.row_end}] (row_start > row_end)`,
    mixedRegion: (c, first) =>
      `all children must share sheet+column_index (got ${c.sheet}#${c.column_index} vs ${first.sheet}#${first.column_index}) — per-column reduce`,
    overlap: (a, b) =>
      `children overlap/interleave: [${a.row_start},${a.row_end}] then [${b.row_start},${b.row_end}] — a non-contiguous partition silently drops seams (R8)`,
    honestyDropped: (flag) =>
      flag === "distinct"
        ? "parent dropped a child's distinct_is_lower_bound (R9)"
        : flag === "bounds"
          ? "parent dropped a child's boundaries_are_lower_bound (R9)"
          : "parent dropped a child's segments_capped (R9)",
  },
};

// ── canonical child-partition (contiguous only) + fail-closed validator ───────

export interface PartitionViolation {
  code:
    | "empty"
    | "mixed_region"
    | "inverted_range"
    | "overlap_or_interleave";
  message: string;
}

/** Fail-closed: the canonical child-partition MUST be a single column and contiguous (no overlap /
 *  interleave; a row gap is allowed). Returns [] when valid. `mergeReduceNodes` throws on any
 *  violation — the invalid partition is made INVALID, not merely forbidden in prose (design §4/§8 F1,
 *  symmetric with the R9 honesty validator). */
export function assertContiguousChildren(
  children: ComprehensionReduceNode[],
): PartitionViolation[] {
  return assertContiguousChildrenCore(SPREADSHEET_REDUCE_ADAPTER, children);
}

/** Fail-closed honesty (R9 §5.4): a parent may never UNDERSTATE a child's lower bound. Returns []
 *  when the parent correctly ORs its children's flags. */
export function assertHonestyFold(
  parent: ComprehensionReduceNode,
  children: ComprehensionReduceNode[],
): PartitionViolation[] {
  return assertHonestyFoldCore(SPREADSHEET_REDUCE_ADAPTER, parent, children);
}

// ── the UNION monoid ──────────────────────────────────────────────────────────

/** Fold k contiguous same-column children into one parent node. Deterministic, associative &
 *  commutative on the GROUND (canonical sort + set-union + adjacency-gated seam + OR honesty), so any
 *  canonical grouping yields a byte-identical root ground (grouping-invariance, R8). Throws fail-closed
 *  on a non-contiguous / mixed-region partition. */
export function mergeReduceNodes(
  children: ComprehensionReduceNode[],
): ComprehensionReduceNode {
  return mergeNodesCore(SPREADSHEET_REDUCE_ADAPTER, children);
}

/** Fold an ordered list of leaves into a single root. `fanin` controls tree shape: undefined / ≥ N →
 *  one flat k-ary merge; a small fanin (e.g. 3) builds a deeper hierarchical tree. The root GROUND is
 *  invariant to `fanin` (grouping-invariance). */
export function reduceColumnLeaves(
  leaves: ComprehensionReduceNode[],
  fanin?: number,
): ComprehensionReduceNode {
  return foldLeavesCore(SPREADSHEET_REDUCE_ADAPTER, leaves, fanin);
}

// ── ReduceTopologyTrace (Layer-2 §13.1) — the ADDITIVE, non-ground tree the Layer-2 accumulated
// semantic channel attaches to. `reduceColumnLeaves` folds to a single root and DISCARDS interior
// nodes; the semantic channel needs a navigable node_ref → child_keys map to walk bottom-up and to
// compute the recursive epoch contribution. This trace is emitted ALONGSIDE the same fold, changing
// NO ground bytes (`reduceNodeGround`/`reduceColumnLeaves` outputs are byte-identical), so "Layer-1 is
// untouched" holds (design §13.1 / §2.1). It is LLM-free.

/** Deterministic identity of a reduce node = `${sheet}#${column_index}:${row_start}-${row_end}`. Same
 *  key space the Layer-2 semantic map uses (grep-findable; one node ⇒ one key). */
export type SemanticNodeKey = string;

export function reduceNodeKey(region: ComprehensionReduceRegion): SemanticNodeKey {
  return `${region.sheet}#${region.column_index}:${region.row_start}-${region.row_end}`;
}

export interface ReduceTopologyTraceNode {
  node_ref: ComprehensionReduceRegion;
  ground_hash: string;
  /** Direct structural children (empty for a leaf). A pass-through node is NOT a distinct node — the
   *  same node object flows up a level, so it appears once with its original child_keys. */
  child_keys: SemanticNodeKey[];
}

export interface ReduceTopologyTrace {
  nodes: Map<SemanticNodeKey, ReduceTopologyTraceNode>;
  root_key: SemanticNodeKey;
}

/** Same fold as `reduceColumnLeaves`, additionally recording a `ReduceTopologyTrace` and the actual
 *  `nodesByKey` (needed by the Layer-2 accumulation to reconcile each node's value-shape seams —
 *  §13.2). The returned `root` is BYTE-IDENTICAL to `reduceColumnLeaves(leaves, fanin)` (byte-parity,
 *  tested). The trace registers EVERY node — all leaves up front, then each merge output — so its node
 *  set equals the distinct skeleton nodes (design §13.1 codex-F4: registering only merge outputs would
 *  drop leaves and pass-through nodes). A row GROUP of size 1 is a pass-through (identity): the
 *  already-registered node flows up unchanged, so no new node is created. */
export function reduceColumnLeavesWithTrace(
  leaves: ComprehensionReduceNode[],
  fanin?: number,
): {
  root: ComprehensionReduceNode;
  trace: ReduceTopologyTrace;
  nodesByKey: Map<SemanticNodeKey, ComprehensionReduceNode>;
} {
  // Trace registration now carries the core's fail-closed node-key collision guard (multi-artifact
  // 리뷰 inv-F3): valid same-column span partitions never collide (goldens/suite prove the no-op),
  // but a future non-injective key space can no longer silently last-wins-overwrite a real node.
  return foldLeavesWithTraceCore(SPREADSHEET_REDUCE_ADAPTER, leaves, fanin);
}

// ── leaf construction from real value tiles (LLM-free) ────────────────────────

const VALUE_SHAPE = "value_shape" as const;

/** Build leaf nodes from one column's value tiles by grouping its NON-EMPTY segments into `leafCount`
 *  contiguous row-window blocks (default: one leaf per non-empty segment). Each leaf is a pure
 *  deterministic projection of the segments + intra-tile notes. */
export function buildColumnLeaves(
  sheet: string,
  column: ColumnValueTiles,
  opts?: { leafCount?: number },
): ComprehensionReduceNode[] {
  const nonEmpty = column.segments.filter((s) => s.dominant_shape !== null);
  if (nonEmpty.length === 0) return [];
  const valueNotes: IntraTileNote[] = (column.intra_tile_notes ?? []).filter(
    (n) => n.boundary_kind === VALUE_SHAPE,
  );
  const notesAsc = [...valueNotes].sort((a, b) => a.first_new_format_row - b.first_new_format_row);
  // The TRUE value-shape at a given row = the new_shape of the latest transition at/before it (or the
  // shape BEFORE the first transition; or the uniform dominant when there are no transitions). The
  // segment `dominant_shape` is a windowed MAJORITY — using it as the edge shape fabricates a false
  // seam when a transition straddles a segment window (review F3, blocker); this makes the edge shape
  // exact and tiling-independent.
  const shapeAtRow = (row: number, uniformFallback: string | null): string | null => {
    const firstNote = notesAsc[0];
    if (!firstNote) return uniformFallback;
    let shape: string = firstNote.prev_shape;
    for (const n of notesAsc) {
      if (n.first_new_format_row <= row) shape = n.new_shape;
      else break;
    }
    return shape;
  };
  const leafCount = Math.max(1, Math.min(opts?.leafCount ?? nonEmpty.length, nonEmpty.length));
  const per = Math.ceil(nonEmpty.length / leafCount);
  const leaves: ComprehensionReduceNode[] = [];
  for (let i = 0; i < nonEmpty.length; i += per) {
    const block = nonEmpty.slice(i, i + per);
    const b0 = block[0];
    const bLast = block[block.length - 1];
    if (!b0 || !bLast) continue;
    const rowStart = Math.min(...block.map((s) => s.row_start));
    const rowEnd = Math.max(...block.map((s) => s.row_end));
    const clusters = [...new Set(block.map((s) => s.dominant_shape as string))].sort();
    const capped = column.segments_capped;
    const distinctLB = block.some((s) => s.distinct_is_lower_bound);
    const boundaries: ComprehensionBoundaryWitness[] = valueNotes
      .filter((n) => n.first_new_format_row > rowStart && n.first_new_format_row <= rowEnd)
      .map((n) => ({
        sheet,
        column_index: column.column_index,
        boundary_kind: VALUE_SHAPE,
        prev_shape: n.prev_shape,
        new_shape: n.new_shape,
        last_prev_format_row: n.last_prev_format_row,
        first_new_format_row: n.first_new_format_row,
      }));
    leaves.push({
      region: { sheet, column_index: column.column_index, row_start: rowStart, row_end: rowEnd },
      format_clusters: clusters,
      boundaries,
      edge_first_shape: shapeAtRow(rowStart, b0.dominant_shape),
      edge_last_shape: shapeAtRow(rowEnd, bLast.dominant_shape),
      distinct_is_lower_bound: distinctLB,
      boundaries_are_lower_bound: capped,
      segments_capped: capped,
      // Localize the limiting witness for EITHER lower-bound axis (review F1: previously distinct-only).
      limiting_witness:
        distinctLB || capped
          ? {
              sheet,
              column_index: column.column_index,
              row: rowStart,
              reason: distinctLB ? "distinct_count capped" : "segments capped",
            }
          : null,
    });
  }
  return leaves;
}
