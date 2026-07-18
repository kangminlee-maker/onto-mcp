// ─────────────────────────────────────────────────────────────────────────────
// comprehension-reduce-core — the signal-agnostic UNION-monoid core the artifact reduce modules
// delegate to (multi-artifact design 20260718 §2 DD1/DD2, Option C). The core owns the ALGORITHM
// only: contiguity/honesty validation, the k-ary merge, the fan-in fold, and trace registration.
// Everything that carries artifact vocabulary is an adapter hook — coordinate access/construction,
// witness canonicalization, node construction (field order), ground hashing, node keys, and every
// violation/throw message — so an artifact façade reproduces its pre-extraction bytes verbatim.
//
// Layering: this module imports NO artifact module (adapter → core only; G1 import boundary).
// The monoid law and honesty fold are ENFORCED here exactly as in the original spreadsheet module
// (fail-closed reject of overlap/interleave/mixed-container partitions; OR honesty may never be
// understated by a parent). Witness canonical sort/dedup derive from ONE order tuple
// (`witnessOrderTuple`) so the sort key is a superset of the dedup key BY CONSTRUCTION — a split
// cmp/dedup pair could silently reintroduce the grouping-variant tie the R8 review closed
// (design 20260718 §DD1, 리뷰 inv-F1).
// ─────────────────────────────────────────────────────────────────────────────

export interface PartitionViolationCore {
  code: "empty" | "mixed_region" | "inverted_range" | "overlap_or_interleave";
  message: string;
}

export interface ReduceTraceNodeCore<R> {
  node_ref: R;
  ground_hash: string;
  child_keys: string[];
}

export interface ReduceTraceCore<R> {
  nodes: Map<string, ReduceTraceNodeCore<R>>;
  root_key: string;
}

/** Coordinate adapter — an artifact's realization of the 1-D contiguous span space plus its node
 *  representation. The core touches nodes/regions/witnesses ONLY through this surface, so the node
 *  objects stay artifact-typed end to end (no conversion round-trip; byte-preserving). */
export interface ReduceCoordAdapter<N, R, W> {
  /** Error-message prefix — e.g. "comprehension-reduce" (kept artifact-owned so extracted throws
   *  stay byte-identical to the pre-extraction module). */
  moduleTag: string;

  // node accessors
  region(n: N): R;
  clusters(n: N): readonly string[];
  boundaries(n: N): readonly W[];
  edgeFirstSignal(n: N): string | null;
  edgeLastSignal(n: N): string | null;
  distinctIsLowerBound(n: N): boolean;
  boundariesAreLowerBound(n: N): boolean;
  segmentsCapped(n: N): boolean;
  /** The node's limiting witness (opaque to the core) and its position for lowest-pos selection. */
  limitingWitness(n: N): unknown | null;
  limitingWitnessPos(w: unknown): number;

  // region accessors
  containerEquals(a: R, b: R): boolean;
  spanStart(r: R): number;
  spanEnd(r: R): number;
  nodeKey(r: R): string;
  cloneRegion(r: R): R;

  // witness canonicalization (sort ⊇ dedup by shared tuple — inv-F1)
  canonicalWitness(w: W): W;
  witnessOrderTuple(w: W): readonly (string | number)[];
  /** Seam witness at the junction of two row/pos-adjacent siblings whose touching edges differ. */
  makeSeamWitness(left: N, right: N): W;

  // construction / hashing (field order + serialization stay artifact-owned)
  makeParent(args: {
    first: N;
    last: N;
    clusters: string[];
    boundaries: W[];
    distinctLB: boolean;
    boundsLB: boolean;
    capped: boolean;
    limitingWitness: unknown | null;
  }): N;
  groundHash(n: N): string;

  // violation message vocabulary (artifact-owned strings)
  messages: {
    emptyChildren(): string;
    invertedRange(r: R): string;
    mixedRegion(c: R, first: R): string;
    overlap(a: R, b: R): string;
    honestyDropped(flag: "distinct" | "bounds" | "capped"): string;
  };
}

function sortCanonicalCore<N, R, W>(adapter: ReduceCoordAdapter<N, R, W>, children: N[]): N[] {
  return [...children].sort(
    (a, b) => adapter.spanStart(adapter.region(a)) - adapter.spanStart(adapter.region(b)),
  );
}

function tupleCmp(a: readonly (string | number)[], b: readonly (string | number)[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x - y;
    } else {
      const xs = String(x);
      const ys = String(y);
      if (xs !== ys) return xs < ys ? -1 : 1;
    }
  }
  return a.length - b.length;
}

/** Dedup (first occurrence in input order) + total-order sort, both derived from the SAME order
 *  tuple — the sort key equals the dedup key by construction, so equal-tuple ties cannot fall back
 *  to input order (grouping-variance; R8 / inv-F1). */
export function canonicalBoundariesCore<N, R, W>(
  adapter: ReduceCoordAdapter<N, R, W>,
  boundaries: readonly W[],
): W[] {
  const seen = new Set<string>();
  const out: W[] = [];
  for (const b of boundaries) {
    const key = adapter.witnessOrderTuple(b).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(adapter.canonicalWitness(b));
  }
  out.sort((a, b) => tupleCmp(adapter.witnessOrderTuple(a), adapter.witnessOrderTuple(b)));
  return out;
}

/** Fail-closed: children must share one container and be non-overlapping (a span gap is allowed).
 *  Returns [] when valid — same contract as the original assertContiguousChildren. */
export function assertContiguousChildrenCore<N, R, W>(
  adapter: ReduceCoordAdapter<N, R, W>,
  children: N[],
): PartitionViolationCore[] {
  const firstNode = children[0];
  if (!firstNode) return [{ code: "empty", message: adapter.messages.emptyChildren() }];
  const first = adapter.region(firstNode);
  for (const c of children) {
    const r = adapter.region(c);
    if (adapter.spanStart(r) > adapter.spanEnd(r)) {
      return [{ code: "inverted_range", message: adapter.messages.invertedRange(r) }];
    }
    if (!adapter.containerEquals(r, first)) {
      return [{ code: "mixed_region", message: adapter.messages.mixedRegion(r, first) }];
    }
  }
  const sorted = sortCanonicalCore(adapter, children);
  const violations: PartitionViolationCore[] = [];
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const an = sorted[i];
    const bn = sorted[i + 1];
    if (!an || !bn) continue;
    const a = adapter.region(an);
    const b = adapter.region(bn);
    if (adapter.spanStart(b) <= adapter.spanEnd(a)) {
      violations.push({ code: "overlap_or_interleave", message: adapter.messages.overlap(a, b) });
    }
  }
  return violations;
}

/** Fail-closed honesty (R9): a parent may never UNDERSTATE a child's lower bound. */
export function assertHonestyFoldCore<N, R, W>(
  adapter: ReduceCoordAdapter<N, R, W>,
  parent: N,
  children: N[],
): PartitionViolationCore[] {
  const anyDistinctLB = children.some((c) => adapter.distinctIsLowerBound(c));
  const anyBoundsLB = children.some((c) => adapter.boundariesAreLowerBound(c));
  const anyCapped = children.some((c) => adapter.segmentsCapped(c));
  const bad: PartitionViolationCore[] = [];
  if (anyDistinctLB && !adapter.distinctIsLowerBound(parent))
    bad.push({ code: "overlap_or_interleave", message: adapter.messages.honestyDropped("distinct") });
  if (anyBoundsLB && !adapter.boundariesAreLowerBound(parent))
    bad.push({ code: "overlap_or_interleave", message: adapter.messages.honestyDropped("bounds") });
  if (anyCapped && !adapter.segmentsCapped(parent))
    bad.push({ code: "overlap_or_interleave", message: adapter.messages.honestyDropped("capped") });
  return bad;
}

/** The UNION monoid: fold k contiguous same-container children into one parent. Deterministic,
 *  associative & commutative on the ground (canonical sort + set-union + adjacency-gated seam + OR
 *  honesty). Throws fail-closed on an invalid partition. Algorithm byte-equivalent to the original
 *  spreadsheet mergeReduceNodes (adapter reproduces literal construction + messages). */
export function mergeNodesCore<N, R, W>(adapter: ReduceCoordAdapter<N, R, W>, children: N[]): N {
  const violations = assertContiguousChildrenCore(adapter, children);
  if (violations.length > 0) {
    throw new Error(
      `${adapter.moduleTag}: invalid child-partition — ${violations.map((v) => v.message).join("; ")}`,
    );
  }
  const sorted = sortCanonicalCore(adapter, children);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) throw new Error(`${adapter.moduleTag}: empty partition after validation (unreachable)`);

  const clusters = new Set<string>();
  const boundaries: W[] = [];
  for (const c of sorted) {
    for (const f of adapter.clusters(c)) clusters.add(f);
    for (const b of adapter.boundaries(c)) boundaries.push(b);
  }
  // Seam: only at a pos-adjacent junction whose touching edge signals differ (gap ⇒ no seam).
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!a || !b) continue;
    const adjacent = adapter.spanEnd(adapter.region(a)) + 1 === adapter.spanStart(adapter.region(b));
    const edgeA = adapter.edgeLastSignal(a);
    const edgeB = adapter.edgeFirstSignal(b);
    if (adjacent && edgeA !== null && edgeB !== null && edgeA !== edgeB) {
      boundaries.push(adapter.makeSeamWitness(a, b));
    }
  }

  const distinctLB = sorted.some((c) => adapter.distinctIsLowerBound(c));
  const boundsLB = sorted.some((c) => adapter.boundariesAreLowerBound(c));
  const capped = sorted.some((c) => adapter.segmentsCapped(c));
  const witnessCandidates = sorted
    .map((c) => adapter.limitingWitness(c))
    .filter((w): w is NonNullable<unknown> => w !== null)
    .sort((x, y) => adapter.limitingWitnessPos(x) - adapter.limitingWitnessPos(y));

  const parent = adapter.makeParent({
    first,
    last,
    clusters: [...clusters].sort(),
    boundaries: canonicalBoundariesCore(adapter, boundaries),
    distinctLB,
    boundsLB,
    capped,
    limitingWitness: witnessCandidates[0] ?? null,
  });

  // Redundant guard (structurally can't fail given the ORs above; catches a future regression).
  const honesty = assertHonestyFoldCore(adapter, parent, sorted);
  if (honesty.length > 0) {
    throw new Error(`${adapter.moduleTag}: honesty fold violated — ${honesty.map((v) => v.message).join("; ")}`);
  }
  return parent;
}

/** Fold an ordered leaf list into a single root; `fanin` controls tree shape. Ground is
 *  grouping-invariant (monoid). Same contract as the original reduceColumnLeaves. */
export function foldLeavesCore<N, R, W>(
  adapter: ReduceCoordAdapter<N, R, W>,
  leaves: N[],
  fanin?: number,
): N {
  const only = leaves[0];
  if (!only) throw new Error(`${adapter.moduleTag}: no leaves`);
  if (leaves.length === 1) return only;
  const f = fanin && fanin >= 2 ? fanin : leaves.length;
  let level = sortCanonicalCore(adapter, leaves);
  while (level.length > 1) {
    const next: N[] = [];
    for (let i = 0; i < level.length; i += f) {
      const group = level.slice(i, i + f);
      const single = group[0];
      if (group.length === 1 && single) {
        next.push(single);
        continue;
      }
      next.push(mergeNodesCore(adapter, group));
    }
    level = next;
  }
  const root = level[0];
  if (!root) throw new Error(`${adapter.moduleTag}: empty tree (unreachable)`);
  return root;
}

/** Same fold, additionally recording the navigable trace + nodesByKey the Layer-2 channel walks.
 *  Registers every leaf first, then each merge output; a single-item group is a pass-through
 *  (identity, no new node). The register is fail-closed on a node-key collision (multi-artifact
 *  design 리뷰 inv-F3): a non-injective key space would let Map.set silently overwrite a real node
 *  — for valid same-container span partitions this guard is a no-op (proven by the pre-extraction
 *  goldens/suite staying green). */
export function foldLeavesWithTraceCore<N, R, W>(
  adapter: ReduceCoordAdapter<N, R, W>,
  leaves: N[],
  fanin?: number,
): { root: N; trace: ReduceTraceCore<R>; nodesByKey: Map<string, N> } {
  const only = leaves[0];
  if (!only) throw new Error(`${adapter.moduleTag}: no leaves`);
  const nodes = new Map<string, ReduceTraceNodeCore<R>>();
  const nodesByKey = new Map<string, N>();
  const register = (node: N, childKeys: string[]): string => {
    const r = adapter.region(node);
    const key = adapter.nodeKey(r);
    if (nodes.has(key)) {
      throw new Error(
        `${adapter.moduleTag}: trace key collision at ${key} — two distinct nodes share a node key (fail-closed; a silent last-wins overwrite would drop a real node from the trace)`,
      );
    }
    nodes.set(key, { node_ref: adapter.cloneRegion(r), ground_hash: adapter.groundHash(node), child_keys: childKeys });
    nodesByKey.set(key, node);
    return key;
  };
  for (const leaf of leaves) register(leaf, []);
  if (leaves.length === 1) {
    return { root: only, trace: { nodes, root_key: adapter.nodeKey(adapter.region(only)) }, nodesByKey };
  }
  const f = fanin && fanin >= 2 ? fanin : leaves.length;
  let level = sortCanonicalCore(adapter, leaves);
  while (level.length > 1) {
    const next: N[] = [];
    for (let i = 0; i < level.length; i += f) {
      const group = level.slice(i, i + f);
      const single = group[0];
      if (group.length === 1 && single) {
        next.push(single); // pass-through — already registered; identity, no new node.
        continue;
      }
      const parent = mergeNodesCore(adapter, group);
      register(parent, group.map((c) => adapter.nodeKey(adapter.region(c))));
      next.push(parent);
    }
    level = next;
  }
  const root = level[0];
  if (!root) throw new Error(`${adapter.moduleTag}: empty tree (unreachable)`);
  return { root, trace: { nodes, root_key: adapter.nodeKey(adapter.region(root)) }, nodesByKey };
}
