import { createHash } from "node:crypto";
import type {
  ColumnValueTiles,
  IntraTileNote,
} from "../spreadsheet-structure-observer.js";
import type { ComprehensionBoundaryWitness } from "./comprehension-artifact.js";

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

function canonicalBoundaries(
  boundaries: ComprehensionBoundaryWitness[],
): ComprehensionBoundaryWitness[] {
  const seen = new Set<string>();
  const out: ComprehensionBoundaryWitness[] = [];
  for (const b of boundaries) {
    const k = `${b.sheet}|${b.column_index}|${b.boundary_kind}|${b.first_new_format_row}|${b.last_prev_format_row}|${b.prev_shape}|${b.new_shape}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(b);
  }
  out.sort(
    (a, b) =>
      a.first_new_format_row - b.first_new_format_row ||
      (a.boundary_kind < b.boundary_kind ? -1 : a.boundary_kind > b.boundary_kind ? 1 : 0) ||
      (a.prev_shape < b.prev_shape ? -1 : a.prev_shape > b.prev_shape ? 1 : 0) ||
      (a.new_shape < b.new_shape ? -1 : a.new_shape > b.new_shape ? 1 : 0),
  );
  return out;
}

/** The canonical GROUND of a node — the byte-stable subject a resume key hashes. Contains only
 *  deterministic structure (no prose, no LLM field), sorted/normalized so equal structure → equal bytes. */
export function reduceNodeGround(node: ComprehensionReduceNode): Record<string, unknown> {
  return {
    region: node.region,
    format_clusters: [...node.format_clusters].sort(),
    boundaries: canonicalBoundaries(node.boundaries),
    edge_first_shape: node.edge_first_shape,
    edge_last_shape: node.edge_last_shape,
    distinct_is_lower_bound: node.distinct_is_lower_bound,
    boundaries_are_lower_bound: node.boundaries_are_lower_bound,
    segments_capped: node.segments_capped,
    limiting_witness: node.limiting_witness,
  };
}

export function reduceNodeGroundHash(node: ComprehensionReduceNode): string {
  return createHash("sha256").update(JSON.stringify(reduceNodeGround(node))).digest("hex");
}

// ── canonical child-partition (contiguous only) + fail-closed validator ───────

function sortCanonical(children: ComprehensionReduceNode[]): ComprehensionReduceNode[] {
  return [...children].sort((a, b) => a.region.row_start - b.region.row_start);
}

export interface PartitionViolation {
  code:
    | "empty"
    | "mixed_region"
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
  const firstNode = children[0];
  if (!firstNode) return [{ code: "empty", message: "reduce requires ≥1 child" }];
  const first = firstNode.region;
  for (const c of children) {
    if (c.region.sheet !== first.sheet || c.region.column_index !== first.column_index) {
      return [
        {
          code: "mixed_region",
          message: `all children must share sheet+column_index (got ${c.region.sheet}#${c.region.column_index} vs ${first.sheet}#${first.column_index}) — per-column reduce`,
        },
      ];
    }
  }
  const sorted = sortCanonical(children);
  const violations: PartitionViolation[] = [];
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const an = sorted[i];
    const bn = sorted[i + 1];
    if (!an || !bn) continue;
    const a = an.region;
    const b = bn.region;
    // b must start strictly after a ends (gap allowed). b.row_start <= a.row_end ⇒ overlap/interleave.
    if (b.row_start <= a.row_end) {
      violations.push({
        code: "overlap_or_interleave",
        message: `children overlap/interleave: [${a.row_start},${a.row_end}] then [${b.row_start},${b.row_end}] — a non-contiguous partition silently drops seams (R8)`,
      });
    }
  }
  return violations;
}

/** Fail-closed honesty (R9 §5.4): a parent may never UNDERSTATE a child's lower bound. Returns []
 *  when the parent correctly ORs its children's flags. */
export function assertHonestyFold(
  parent: ComprehensionReduceNode,
  children: ComprehensionReduceNode[],
): PartitionViolation[] {
  const anyDistinctLB = children.some((c) => c.distinct_is_lower_bound);
  const anyBoundsLB = children.some((c) => c.boundaries_are_lower_bound);
  const anyCapped = children.some((c) => c.segments_capped);
  const bad: PartitionViolation[] = [];
  if (anyDistinctLB && !parent.distinct_is_lower_bound)
    bad.push({ code: "overlap_or_interleave", message: "parent dropped a child's distinct_is_lower_bound (R9)" });
  if (anyBoundsLB && !parent.boundaries_are_lower_bound)
    bad.push({ code: "overlap_or_interleave", message: "parent dropped a child's boundaries_are_lower_bound (R9)" });
  if (anyCapped && !parent.segments_capped)
    bad.push({ code: "overlap_or_interleave", message: "parent dropped a child's segments_capped (R9)" });
  return bad;
}

// ── the UNION monoid ──────────────────────────────────────────────────────────

/** Fold k contiguous same-column children into one parent node. Deterministic, associative &
 *  commutative on the GROUND (canonical sort + set-union + adjacency-gated seam + OR honesty), so any
 *  canonical grouping yields a byte-identical root ground (grouping-invariance, R8). Throws fail-closed
 *  on a non-contiguous / mixed-region partition. */
export function mergeReduceNodes(
  children: ComprehensionReduceNode[],
): ComprehensionReduceNode {
  const violations = assertContiguousChildren(children);
  if (violations.length > 0) {
    throw new Error(
      `comprehension-reduce: invalid child-partition — ${violations.map((v) => v.message).join("; ")}`,
    );
  }
  const sorted = sortCanonical(children);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) throw new Error("comprehension-reduce: empty partition after validation (unreachable)");

  const clusters = new Set<string>();
  const boundaries: ComprehensionBoundaryWitness[] = [];
  for (const c of sorted) {
    for (const f of c.format_clusters) clusters.add(f);
    for (const b of c.boundaries) boundaries.push(b);
  }
  // Seam: a NEW value-shape boundary at a child junction, ONLY when the two children are row-adjacent
  // AND their touching edge shapes differ. A gap ⇒ no seam (the contiguity validator already rejected
  // overlap/interleave, so only adjacency vs gap remains here).
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!a || !b) continue;
    const adjacent = a.region.row_end + 1 === b.region.row_start;
    if (
      adjacent &&
      a.edge_last_shape !== null &&
      b.edge_first_shape !== null &&
      a.edge_last_shape !== b.edge_first_shape
    ) {
      boundaries.push({
        sheet: a.region.sheet,
        column_index: a.region.column_index,
        boundary_kind: "value_shape",
        prev_shape: a.edge_last_shape,
        new_shape: b.edge_first_shape,
        last_prev_format_row: a.region.row_end,
        first_new_format_row: b.region.row_start,
      });
    }
  }

  // Honesty fold (R9): OR the lower-bound / capped flags; localize the limiting witness to the
  // lowest-row capped child.
  const distinctLB = sorted.some((c) => c.distinct_is_lower_bound);
  const boundsLB = sorted.some((c) => c.boundaries_are_lower_bound);
  const capped = sorted.some((c) => c.segments_capped);
  const witnessCandidates = sorted
    .map((c) => c.limiting_witness)
    .filter((w): w is NonNullable<ComprehensionReduceNode["limiting_witness"]> => w !== null)
    .sort((x, y) => x.row - y.row);

  const parent: ComprehensionReduceNode = {
    region: {
      sheet: first.region.sheet,
      column_index: first.region.column_index,
      row_start: first.region.row_start,
      row_end: last.region.row_end,
    },
    format_clusters: [...clusters].sort(),
    boundaries: canonicalBoundaries(boundaries),
    edge_first_shape: first.edge_first_shape,
    edge_last_shape: last.edge_last_shape,
    distinct_is_lower_bound: distinctLB,
    boundaries_are_lower_bound: boundsLB,
    segments_capped: capped,
    limiting_witness: witnessCandidates[0] ?? null,
  };

  // Redundant guard (structurally can't fail given the ORs above, but catches a future regression).
  const honesty = assertHonestyFold(parent, sorted);
  if (honesty.length > 0) {
    throw new Error(`comprehension-reduce: honesty fold violated — ${honesty.map((v) => v.message).join("; ")}`);
  }
  return parent;
}

/** Fold an ordered list of leaves into a single root. `fanin` controls tree shape: undefined / ≥ N →
 *  one flat k-ary merge; a small fanin (e.g. 3) builds a deeper hierarchical tree. The root GROUND is
 *  invariant to `fanin` (grouping-invariance). */
export function reduceColumnLeaves(
  leaves: ComprehensionReduceNode[],
  fanin?: number,
): ComprehensionReduceNode {
  const only = leaves[0];
  if (!only) throw new Error("comprehension-reduce: no leaves");
  if (leaves.length === 1) return only;
  const f = fanin && fanin >= 2 ? fanin : leaves.length;
  let level = sortCanonical(leaves);
  while (level.length > 1) {
    const next: ComprehensionReduceNode[] = [];
    for (let i = 0; i < level.length; i += f) {
      const group = level.slice(i, i + f);
      const single = group[0];
      if (group.length === 1 && single) {
        next.push(single);
        continue;
      }
      next.push(mergeReduceNodes(group));
    }
    level = next;
  }
  const root = level[0];
  if (!root) throw new Error("comprehension-reduce: empty tree (unreachable)");
  return root;
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
      edge_first_shape: b0.dominant_shape,
      edge_last_shape: bLast.dominant_shape,
      distinct_is_lower_bound: distinctLB,
      boundaries_are_lower_bound: capped,
      segments_capped: capped,
      limiting_witness: distinctLB
        ? { sheet, column_index: column.column_index, row: rowStart, reason: "distinct_count capped" }
        : null,
    });
  }
  return leaves;
}
