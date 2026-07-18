import { createHash } from "node:crypto";
import type { ReduceTraceCore } from "./comprehension-reduce-core.js";

// ─────────────────────────────────────────────────────────────────────────────
// comprehension-semantic-map-core — the coordinate-agnostic Layer-2 core the artifact semantic-map
// modules delegate to (multi-artifact design 20260718 §2 DD3, Option C; the L2 sibling of
// comprehension-reduce-core.ts). The core owns the ALGORITHM only: the two-sided boundary
// reconciliation (N1/N2), the recursive epoch contribution (N4), the fail-closed validators
// (N3/N5/N6), the over-context frontier partition (S3), the bottom-up accumulation walk (S2), and
// the seed projection (S4). Everything that carries artifact vocabulary — node keys, region
// cloning, seam filtering/ordering, boundary construction (field order), synthesis-input building
// and its source-safety guard, seed-object construction — is an adapter hook, so an artifact
// façade reproduces its pre-extraction bytes verbatim (G-SS).
//
// Layering: this module imports NO artifact module (adapter → core only; G1 import boundary).
// Error-message prefixes stay "comprehension-semantic-map" — the L2 subsystem is ONE concept
// spanning artifacts; per-node identities in messages come from adapter.nodeKey /
// adapter.boundaryPosLabel so spreadsheet bytes are unchanged and code messages are line-based.
// ─────────────────────────────────────────────────────────────────────────────

// ── anchor / verification vocabulary ─────────────────────────────────────────

export type SemanticAnchorStatus = "anchored" | "unanchored";

export type SemanticVerificationStatus =
  | "structural_location_only" //  anchored: a structural seam co-locates. CONTENT is NOT verified.
  | "unverified" //                unanchored, pre-adversarial (transient; illegal at seed).
  | "adversarial_confirmed" //     unanchored, survived independent adversarial re-verify.
  | "adversarial_refuted"; //      unanchored, refuted — excluded from seed boundaries + counted taint.

/** produced/unread/failed = the LLM read outcome (mirror LeafReadAttemptStatus); subsumed = below the
 *  accumulation frontier (§13.6) — a real skeleton node whose judgment its frontier ancestor absorbed. */
export type ReduceReadAttempt = "produced" | "unread" | "failed" | "subsumed";

/** Legal enum surfaces — the honesty validator is TOTAL over these (a value outside them is malformed
 *  and fails closed; review F2 / onto issue-001/007/009/014). */
const VALID_ANCHOR_STATUS = new Set<string>(["anchored", "unanchored"]);
const VALID_VERIFICATION = new Set<string>([
  "structural_location_only",
  "unverified",
  "adversarial_confirmed",
  "adversarial_refuted",
]);
/** Single literal source for the adversarial-verdict vocabulary (wiring design 20260702 §15.1): BOTH
 *  the exported verdict type and the runtime allowlist derive from this tuple, so the type and the
 *  Set cannot drift apart (a separate union + Set pair stays compile-green when only one is edited;
 *  R3 W1-01 / onto issue-001·003). Exported so the drift-guard test proves the same-source derivation. */
export const ADVERSARIAL_RESULTS = ["adversarial_confirmed", "adversarial_refuted"] as const;
export type SemanticBoundaryVerification = (typeof ADVERSARIAL_RESULTS)[number];
// SOURCE-level exact-type coupling (W1 code review F01/F02): these live in the MODULE (not a test)
// because check:ts-core EXCLUDES *.test.ts — a test-file type assertion is enforced by NO gate
// (proven by a deliberate-type-error probe). Erased at runtime. If the union is ever redefined away
// from the tuple, either line breaks the build.
type _VerificationCoversTuple = (typeof ADVERSARIAL_RESULTS)[number] extends SemanticBoundaryVerification ? true : never;
type _TupleCoversVerification = SemanticBoundaryVerification extends (typeof ADVERSARIAL_RESULTS)[number] ? true : never;
const _verdictExact: [_VerificationCoversTuple, _TupleCoversVerification] = [true, true];
void _verdictExact;
// ReadonlySet<union> (not Set<string>): a member added to the SET literal that is not in the tuple
// now fails the build too (the runtime .has() guard against JS-level bogus values is unchanged).
export const VALID_ADVERSARIAL_RESULT: ReadonlySet<SemanticBoundaryVerification> = new Set(ADVERSARIAL_RESULTS);

// ── generic node / boundary shapes ───────────────────────────────────────────

/** Minimum shape of an artifact's RAW (pre-classification) LLM boundary — the position field is
 *  artifact-owned (row/line) and reached via adapter.rawBoundaryPos. */
export interface RawSemanticBoundaryCoreShape {
  character_before: string;
  character_after: string;
}

/** Minimum shape of an artifact's classified semantic boundary. */
export interface SemanticBoundaryCoreShape extends RawSemanticBoundaryCoreShape {
  anchor_status: SemanticAnchorStatus;
  verification: SemanticVerificationStatus;
}

/** Deterministic two-sided reconciliation record for ONE structural seam (§13.3 / N1). */
export interface StructureBoundaryCoverageCore<W> {
  boundary_ref: W;
  status: "covered" | "missed_by_llm";
}

/** One Layer-2 node — parallel to a Layer-1 reduce node, keyed by the same node_ref. Holds the LLM
 *  judgment (provisional, non-authoritative) + deterministic classification + the recursive resume
 *  contribution. NEVER part of the Layer-1 ground (resume key exclusion, §4.1). */
export interface SemanticNodeCore<R, W, B extends SemanticBoundaryCoreShape> {
  node_ref: R; //                                   deterministic anchor (= trace key origin)
  layer1_ground_hash: string; //                    Layer-1 ground hash — recursion input
  subtree_epoch_contribution: string; //            reduceNodeEpochContribution(...) — resume-excluded
  authority: "non_authoritative";
  provisional: true;
  reduce_read_attempt: ReduceReadAttempt;
  semantic_summary: string; //                      LLM text (synthesizes children)
  semantic_boundaries: B[]; //                      LLM boundaries + deterministic classification
  structure_boundary_coverage: StructureBoundaryCoverageCore<W>[]; //  N1 two-sided seam census
  topology_child_keys: string[]; //                 ALL structural children (from trace) — deterministic
  consumed_child_judgment_keys: string[]; //        children actually synthesized (empty if subsumed)
  unanchored_unverified_count: number; //           N6 taint census (own + children, OR-monotone)
}

// ── semantic coordinate adapter (design DD3 — the L2 realization of the DD1 adapter idea) ─────────

/** The L2 coordinate adapter — an artifact's realization of node keys, region cloning, structural
 *  seams, and boundary construction. Every literal construction (field order) and every per-node
 *  identity string in a message flows through this surface, so the spreadsheet façade is
 *  byte-identical to the pre-extraction module and the code module gets line vocabulary. */
export interface SemanticCoordAdapter<
  N,
  R,
  W,
  RB extends RawSemanticBoundaryCoreShape,
  B extends SemanticBoundaryCoreShape,
> {
  nodeKey(r: R): string;
  cloneRegion(r: R): R;
  // Layer-1 node accessors (the accumulate walk validates nodesByKey against the trace).
  nodeRegion(n: N): R;
  nodeBoundaries(n: N): readonly W[];
  nodeGroundHash(n: N): string;
  /** The node's STRUCTURAL seams for reconcile: kind filter + canonical total-order sort
   *  (artifact-owned — spreadsheet: value_shape + 7-field witness order). */
  structuralSeams(boundaries: readonly W[]): W[];
  /** The seam's anchor position (spreadsheet: first_new_format_row; code: first_new_line). */
  seamAnchorPos(w: W): number;
  /** Declared-fields projection of a seam for the coverage record (never an aliasing spread). */
  cloneSeamRef(w: W): W;
  /** DD8: v1 = 1 for every adapter. */
  anchorTolerance: number;
  rawBoundaryPos(b: RB): number;
  /** Construct the classified boundary from the raw one (artifact field order preserved). */
  classifyRawBoundary(b: RB, anchored: boolean): B;
  boundaryPos(b: B): number;
  /** Message label for a boundary position — spreadsheet `row${row}`, code `line${line}`. */
  boundaryPosLabel(b: B): string;
}

const cmpStr = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

// ── N1/N2 two-sided reconciliation ───────────────────────────────────────────

/** Two-sided deterministic reconciliation (design §13.3 / N1 / N2 / codex-F3). For a node's LLM
 *  boundaries and its Layer-1 structural seams, assign each boundary anchored|unanchored and record a
 *  covered|missed_by_llm status for EVERY seam. Matching is a 1:1 assignment (a seam anchors at most
 *  one boundary), exact-pos first then nearest-within-tolerance, canonical-order tie-break — so dense
 *  seams cannot blanket-anchor every boundary (L2H-2) and the result is order-stable (codex-F3). */
export function reconcileBoundariesCore<N, R, W, RB extends RawSemanticBoundaryCoreShape, B extends SemanticBoundaryCoreShape>(
  adapter: SemanticCoordAdapter<N, R, W, RB, B>,
  raw: readonly RB[],
  nodeBoundaries: readonly W[],
): { boundaries: B[]; coverage: StructureBoundaryCoverageCore<W>[] } {
  const seams = adapter.structuralSeams(nodeBoundaries);
  const seamMatched = seams.map(() => false);
  const matchedSeamOf = new Map<number, number>(); // raw index -> seam index

  // Canonical LLM-boundary order (pos, then character tuple, then input index) so passes are stable.
  const order = raw
    .map((b, i) => ({ b, i }))
    .sort(
      (x, y) =>
        adapter.rawBoundaryPos(x.b) - adapter.rawBoundaryPos(y.b) ||
        cmpStr(x.b.character_before, y.b.character_before) ||
        cmpStr(x.b.character_after, y.b.character_after) ||
        x.i - y.i,
    );

  // Pass 1 — exact position (LLM pos === seam anchor pos). 1:1, canonical order.
  for (const { b, i } of order) {
    for (let si = 0; si < seams.length; si += 1) {
      const s = seams[si];
      if (!s || seamMatched[si]) continue;
      if (adapter.seamAnchorPos(s) === adapter.rawBoundaryPos(b)) {
        seamMatched[si] = true;
        matchedSeamOf.set(i, si);
        break;
      }
    }
  }
  // Pass 2 — nearest unmatched seam within tolerance; strict-less keeps the canonically-first seam on a
  // distance tie (seams are canonically sorted), so the outcome is order-stable.
  for (const { b, i } of order) {
    if (matchedSeamOf.has(i)) continue;
    let bestSi = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let si = 0; si < seams.length; si += 1) {
      const s = seams[si];
      if (!s || seamMatched[si]) continue;
      const dist = Math.abs(adapter.seamAnchorPos(s) - adapter.rawBoundaryPos(b));
      if (dist <= adapter.anchorTolerance && dist < bestDist) {
        bestDist = dist;
        bestSi = si;
      }
    }
    if (bestSi >= 0) {
      seamMatched[bestSi] = true;
      matchedSeamOf.set(i, bestSi);
    }
  }

  const boundaries: B[] = raw.map((b, i) => adapter.classifyRawBoundary(b, matchedSeamOf.has(i)));
  const coverage: StructureBoundaryCoverageCore<W>[] = seams.map((s, si) => ({
    boundary_ref: adapter.cloneSeamRef(s),
    status: seamMatched[si] ? "covered" : "missed_by_llm",
  }));
  return { boundaries, coverage };
}

// ── N4 recursive epoch contribution (allowlisted, non-circular) ──────────────

export const SEMANTIC_EPOCH_PREIMAGE_ALLOWLIST = [
  "layer1_ground_hash",
  "child_contributions",
  "reduce_reader_model_identity",
  "reduce_prompt_sha256",
  "reduce_schema_tool_version",
  "comprehension_version",
  "over_context_gate_config_sha256",
  "over_context_gate_logic_sha256",
] as const;

/** ⓐ'+ⓑ' recursive pre-image. child_contributions = children's subtree_epoch_contribution (recursive,
 *  deterministic). over_context_gate_logic_sha256 (L2R-2) folds the gate's LOGIC source, not just its
 *  config, so a predicate edit rotates the key tautologically. */
export interface SemanticEpochPreImage {
  layer1_ground_hash: string;
  child_contributions: string[];
  reduce_reader_model_identity: string;
  reduce_prompt_sha256: string;
  reduce_schema_tool_version: string;
  comprehension_version: string;
  over_context_gate_config_sha256: string;
  over_context_gate_logic_sha256: string;
}

const ALLOWLIST_SET = new Set<string>(SEMANTIC_EPOCH_PREIMAGE_ALLOWLIST);

/** Fail-closed ALLOWLIST guard (design §13.4 / N7 / C8). Unlike the sibling denylist
 *  (assertGatingKeyExcludesInEpochOutput, which must enumerate every forbidden LLM field), an
 *  allowlist rejects an UNKNOWN key by construction, so a newly-added LLM output cannot silently reach
 *  the gating key. Also rejects a NESTED object smuggling a field in (codex residual): every value must
 *  be a string, except child_contributions which must be a string[]. */
export function assertPreImageKeysAllowlisted(pre: Record<string, unknown>): void {
  for (const k of Object.keys(pre)) {
    if (!ALLOWLIST_SET.has(k)) {
      throw new Error(
        `comprehension-semantic-map: epoch pre-image has non-allowlisted key '${k}' (§13.4 allowlist — a non-deterministic/LLM field could gate its own reuse). Permitted: ${SEMANTIC_EPOCH_PREIMAGE_ALLOWLIST.join(", ")}.`,
      );
    }
  }
  for (const k of SEMANTIC_EPOCH_PREIMAGE_ALLOWLIST) {
    // OWN key only (review F3 / onto issue-002/005/006/…): `k in pre` accepts an INHERITED field, but
    // the canonical spread/stableJson hashes OWN keys only — so a prototype-backed pre-image would pass
    // validation while its required deterministic fields silently drop from the contribution key.
    if (!Object.hasOwn(pre, k)) {
      throw new Error(`comprehension-semantic-map: epoch pre-image missing OWN required key '${k}' (§13.4 — inherited keys are not hashed).`);
    }
    const v = pre[k];
    if (k === "child_contributions") {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
        throw new Error(
          "comprehension-semantic-map: child_contributions must be string[] (no nested objects — §13.4 nested-injection guard).",
        );
      }
    } else if (typeof v !== "string") {
      throw new Error(
        `comprehension-semantic-map: epoch pre-image field '${k}' must be a string (no nested objects — §13.4 nested-injection guard).`,
      );
    }
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The recursive per-node epoch contribution (= subtree_epoch_contribution). NON-CIRCULAR by
 *  construction (allowlist admits only deterministic fields). Folding child_contributions makes a
 *  parent re-derive on ANY descendant structural change EVEN WHEN the parent's own ground hash
 *  is byte-identical (e.g. a non-lowest child's limiting_witness change — the Layer-1 fold keeps
 *  only witnessCandidates[0], and parent edges are first/last only — so the parent ground is stable
 *  while a child's ground hash rotates; codex tsx probe confirmed cardinality > 0). child_contributions
 *  is sorted so SIBLING ORDER within a grouping does not perturb the key. NOTE (review F4): unlike the
 *  Layer-1 GROUND (which is fanin/grouping-INVARIANT), this contribution is TOPOLOGY-DEPENDENT by
 *  design — a node synthesizes ITS children, so a different fan-in gives genuinely different judgments,
 *  and the contribution correctly rotates with it (a fan-in change is a re-derive, caught via
 *  child_contributions, never silent). Production pins the topology with the deterministic over-context
 *  frontier, whose config + logic sha are folded into the pre-image. */
export function reduceNodeEpochContribution(pre: SemanticEpochPreImage): string {
  assertPreImageKeysAllowlisted(pre as unknown as Record<string, unknown>);
  const canonical = { ...pre, child_contributions: [...pre.child_contributions].sort() };
  return createHash("sha256").update(stableJson(canonical)).digest("hex");
}

// ── N3/N5/N6 fail-closed validators ──────────────────────────────────────────

/** N5 / codex-F1: child-judgment completeness, subsumed-aware. A `subsumed` node (below the
 *  accumulation frontier) has no synthesized judgment, so it MUST carry consumed=[]. An accumulating
 *  node's consumed_child_judgment_keys MUST equal the frontier-direct child set the caller computed.
 *  Symmetric with the Layer-1 contiguity validator. */
export function assertChildJudgmentCoverageCore<N, R, W, RB extends RawSemanticBoundaryCoreShape, B extends SemanticBoundaryCoreShape>(
  adapter: SemanticCoordAdapter<N, R, W, RB, B>,
  node: SemanticNodeCore<R, W, B>,
  expectedConsumedKeys: readonly string[],
): void {
  if (node.reduce_read_attempt === "subsumed") {
    if (node.consumed_child_judgment_keys.length > 0) {
      throw new Error(
        `comprehension-semantic-map: subsumed node ${adapter.nodeKey(node.node_ref)} must consume no child judgments, has ${node.consumed_child_judgment_keys.length} (§13.5 codex-F1).`,
      );
    }
    return;
  }
  // Reject duplicate consumed keys BEFORE the set comparison (review F8 / onto issue-004): a Set
  // collapses ["k1","k1"] to {k1}, so a node consuming the same child twice would falsely satisfy
  // coverage against {k1}. A node consumes each child at most once.
  if (new Set(node.consumed_child_judgment_keys).size !== node.consumed_child_judgment_keys.length) {
    throw new Error(
      `comprehension-semantic-map: duplicate consumed child-judgment key at ${adapter.nodeKey(node.node_ref)} (§13.5 N5 — each child is consumed once).`,
    );
  }
  const have = new Set(node.consumed_child_judgment_keys);
  const want = new Set(expectedConsumedKeys);
  const equal = have.size === want.size && [...want].every((k) => have.has(k));
  if (!equal) {
    throw new Error(
      `comprehension-semantic-map: child-judgment coverage mismatch at ${adapter.nodeKey(node.node_ref)} — consumed {${[...have].sort().join(",")}} != expected {${[...want].sort().join(",")}} (§13.5 N5 completeness).`,
    );
  }
}

/** N3 / L2H-5 / codex-F2: the fail-closed verification state machine. Legal (anchor_status,
 *  verification) combinations, plus the seed-projection rule. `seedBound` = these boundaries are about
 *  to flow to the seed authoring input. Throws on the first illegal state. */
export function assertSemanticBoundaryHonestyCore<N, R, W, RB extends RawSemanticBoundaryCoreShape, B extends SemanticBoundaryCoreShape>(
  adapter: SemanticCoordAdapter<N, R, W, RB, B>,
  node: SemanticNodeCore<R, W, B>,
  seedBound: boolean,
): void {
  const at = (b: B): string => `${adapter.nodeKey(node.node_ref)}@${adapter.boundaryPosLabel(b)}`;
  for (const b of node.semantic_boundaries) {
    // TOTAL over the enum surface (review F2 / onto issue-001/007/009/014): an anchor_status or
    // verification value OUTSIDE the known set is malformed and fails closed — otherwise a bogus
    // caller-injected verifier output (e.g. "bogus_status") would slip through the combo checks below.
    if (!VALID_ANCHOR_STATUS.has(b.anchor_status)) {
      throw new Error(`comprehension-semantic-map: ${at(b)} unknown anchor_status '${b.anchor_status}' (§13.5 fail-closed enum).`);
    }
    if (!VALID_VERIFICATION.has(b.verification)) {
      throw new Error(`comprehension-semantic-map: ${at(b)} unknown verification '${b.verification}' (§13.5 fail-closed enum).`);
    }
    if (b.anchor_status === "anchored" && b.verification !== "structural_location_only") {
      throw new Error(
        `comprehension-semantic-map: ${at(b)} anchored boundary must be 'structural_location_only' (anchored corroborates LOCATION only, never content; got '${b.verification}') — §13.5 codex-F2.`,
      );
    }
    if (b.anchor_status === "unanchored" && b.verification === "structural_location_only") {
      throw new Error(
        `comprehension-semantic-map: ${at(b)} unanchored boundary cannot be 'structural_location_only' (no seam corroborates it) — §13.5 codex-F2.`,
      );
    }
    if (seedBound && b.anchor_status === "unanchored" && b.verification === "unverified") {
      throw new Error(
        `comprehension-semantic-map: ${at(b)} seed-bound unanchored boundary must be adversarially processed before seed (N3 all-unanchored) — §13.5.`,
      );
    }
    if (seedBound && b.verification === "adversarial_refuted") {
      throw new Error(
        `comprehension-semantic-map: ${at(b)} adversarial_refuted boundary must be EXCLUDED from seed boundaries (recorded as a refuted disclosure + counted in taint), not carried — §13.5 codex-F2.`,
      );
    }
  }
}

/** This node's OWN unverified taint: unanchored boundaries not adversarially-confirmed (unverified or
 *  refuted) + a failed/unread read outcome. */
export function ownUnverifiedCountCore<R, W, B extends SemanticBoundaryCoreShape>(
  node: SemanticNodeCore<R, W, B>,
): number {
  const boundaryUnverified = node.semantic_boundaries.filter(
    (b) => b.anchor_status === "unanchored" && b.verification !== "adversarial_confirmed",
  ).length;
  const attemptUnverified = node.reduce_read_attempt === "failed" || node.reduce_read_attempt === "unread" ? 1 : 0;
  return boundaryUnverified + attemptUnverified;
}

/** The canonical taint census value a node SHOULD carry (own + children). Callers set
 *  unanchored_unverified_count from this; the validator enforces the fail-closed direction. */
export function computeUnanchoredUnverifiedCountCore<R, W, B extends SemanticBoundaryCoreShape>(
  node: SemanticNodeCore<R, W, B>,
  children: readonly SemanticNodeCore<R, W, B>[],
): number {
  return children.reduce((acc, c) => acc + c.unanchored_unverified_count, 0) + ownUnverifiedCountCore(node);
}

/** N6: taint monotone. A parent may never UNDERSTATE accumulated unverified taint (fail-closed,
 *  symmetric with the Layer-1 honesty fold). Over-reporting is allowed; understating throws. */
function assertSafeCount(label: string, n: number): void {
  // A non-finite / negative / non-integer count would defeat the monotone comparison (review F6: NaN <
  // x is false, so a NaN taint would pass silently). Require a safe non-negative integer.
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`comprehension-semantic-map: ${label} must be a non-negative safe integer, got ${n} (§13.5 N6 fail-closed).`);
  }
}

export function assertTaintCensusMonotoneCore<N, R, W, RB extends RawSemanticBoundaryCoreShape, B extends SemanticBoundaryCoreShape>(
  adapter: SemanticCoordAdapter<N, R, W, RB, B>,
  node: SemanticNodeCore<R, W, B>,
  children: readonly SemanticNodeCore<R, W, B>[],
): void {
  assertSafeCount(`taint count at ${adapter.nodeKey(node.node_ref)}`, node.unanchored_unverified_count);
  for (const c of children) assertSafeCount(`child taint count at ${adapter.nodeKey(c.node_ref)}`, c.unanchored_unverified_count);
  const expectedMin = computeUnanchoredUnverifiedCountCore(node, children);
  if (node.unanchored_unverified_count < expectedMin) {
    throw new Error(
      `comprehension-semantic-map: taint census understated at ${adapter.nodeKey(node.node_ref)} — ${node.unanchored_unverified_count} < ${expectedMin} (parent may not understate children + own unverified; §13.5 N6).`,
    );
  }
}

// ── over-context frontier partition (S3 · design §13.6) ──────────────────────────────────────────
//
// The reduce tree is partitioned into three deterministic ROLES by a single deterministic metric
// (subtree leaf count vs OVER_CONTEXT_BUDGET):
//  - ACCUMULATING (over-context, near the root): synthesizes its children's judgments.
//  - FRONTIER     (the largest subtree that fits one window): ONE flat read covers the whole subtree.
//  - SUBSUMED     (a descendant of a frontier): no independent judgment; its frontier ancestor's read
//                 covers it. It still gets a 1:1 placeholder node (reduce_read_attempt='subsumed').
// Leaf count is ANTI-MONOTONE up the tree (a parent's subtree ⊇ a child's), so "fits" is downward-
// closed: if a node fits, all its descendants fit — hence the frontier is the topmost fitting layer.

export type FrontierMode = "accumulating" | "frontier" | "subsumed";

/** Deterministic subtree LEAF count per node (the single over-context metric — NOT span or ground
 *  bytes; §13.6 codex-F5). Throws on a cyclic trace. */
export function computeSubtreeLeafCountsCore<R>(trace: ReduceTraceCore<R>): Map<string, number> {
  const counts = new Map<string, number>();
  const compute = (key: string, visiting: Set<string>): number => {
    const cached = counts.get(key);
    if (cached !== undefined) return cached;
    if (visiting.has(key)) throw new Error(`comprehension-semantic-map: cycle at ${key} while counting leaves (§13.6).`);
    const tnode = trace.nodes.get(key);
    if (!tnode) throw new Error(`comprehension-semantic-map: trace node missing for ${key} (leaf count).`);
    visiting.add(key);
    const n = tnode.child_keys.length === 0 ? 1 : tnode.child_keys.reduce((s, c) => s + compute(c, visiting), 0);
    visiting.delete(key);
    counts.set(key, n);
    return n;
  };
  for (const key of trace.nodes.keys()) compute(key, new Set());
  return counts;
}

/** Classify every REACHABLE node (from root) into its frontier role, top-down (§13.6). A leaf can never
 *  accumulate (no children), so it is a frontier (or subsumed under one). Deterministic. */
export function classifyFrontierCore<R>(trace: ReduceTraceCore<R>, overContextBudget: number): Map<string, FrontierMode> {
  // A leaf-count budget must be a real non-negative integer (review F4 / onto issue-001/005/007/…):
  // NaN/Infinity would silently collapse the frontier to the root instead of failing closed.
  if (!Number.isSafeInteger(overContextBudget) || overContextBudget < 0) {
    throw new Error(`comprehension-semantic-map: overContextBudget must be a non-negative safe integer (leaf count), got ${overContextBudget} (§13.6 fail-closed).`);
  }
  const leafCounts = computeSubtreeLeafCountsCore(trace);
  const mode = new Map<string, FrontierMode>();
  const shouldAccumulate = (key: string): boolean => {
    const tnode = trace.nodes.get(key);
    if (!tnode || tnode.child_keys.length === 0) return false; // a leaf never accumulates.
    const count = leafCounts.get(key); // every node was counted above; a miss is an impossible state.
    if (count === undefined) throw new Error(`comprehension-semantic-map: no leaf count for ${key} (impossible; §13.6).`);
    return count > overContextBudget;
  };
  const classify = (key: string, underFrontier: boolean): void => {
    const tnode = trace.nodes.get(key);
    if (!tnode) throw new Error(`comprehension-semantic-map: trace node missing for ${key} (classify).`);
    const m: FrontierMode = underFrontier ? "subsumed" : shouldAccumulate(key) ? "accumulating" : "frontier";
    mode.set(key, m);
    const childUnder = m !== "accumulating"; // frontier/subsumed → descendants subsumed.
    for (const c of tnode.child_keys) classify(c, childUnder);
  };
  classify(trace.root_key, false);
  return mode;
}

/** Fail-closed: the trace MUST be a rooted TREE (review F2 / onto issue-002/004). A DAG / diamond /
 *  duplicate child edge would double-count leaves, classify a shared node order-dependently, or let one
 *  semantic node be reused through multiple parents. Checks: every child key exists; no duplicate child
 *  edge within a node; every node has indegree ≤ 1; the root has indegree 0; every node is reachable
 *  from the root (no orphans; no cycle, since a cycle leaves a node either unreachable or indegree > 1). */
export function assertReduceTopologyIsTreeCore<R>(
  trace: ReduceTraceCore<R>,
  nodeKey: (r: R) => string,
): void {
  // The declared root MUST name a real node (round-2: a missing root_key could pass when the node count
  // coincidentally matched the empty reached set).
  if (!trace.nodes.has(trace.root_key)) {
    throw new Error(`comprehension-semantic-map: root_key '${trace.root_key}' is not in the trace (§13.6 tree).`);
  }
  const indegree = new Map<string, number>();
  for (const [key, tnode] of trace.nodes) {
    // Each map key MUST equal nodeKey(node_ref) (round-2: an alias key would let
    // consumed_child_judgment_keys diverge from the canonical child-summary keys).
    if (key !== nodeKey(tnode.node_ref)) {
      throw new Error(`comprehension-semantic-map: trace key '${key}' != reduceNodeKey(node_ref) '${nodeKey(tnode.node_ref)}' (§13.6 tree — keys must be canonical).`);
    }
    const seenChild = new Set<string>();
    for (const c of tnode.child_keys) {
      if (!trace.nodes.has(c)) throw new Error(`comprehension-semantic-map: child '${c}' of '${key}' is not in the trace (§13.6 tree).`);
      if (seenChild.has(c)) throw new Error(`comprehension-semantic-map: duplicate child edge '${c}' under '${key}' (§13.6 tree).`);
      seenChild.add(c);
      const d = (indegree.get(c) ?? 0) + 1;
      indegree.set(c, d);
      if (d > 1) throw new Error(`comprehension-semantic-map: node '${c}' has multiple parents — trace is a DAG, not a tree (§13.6).`);
    }
  }
  if ((indegree.get(trace.root_key) ?? 0) !== 0) {
    throw new Error(`comprehension-semantic-map: root '${trace.root_key}' has a parent (§13.6 tree).`);
  }
  const reached = new Set<string>();
  const stack = [trace.root_key];
  while (stack.length > 0) {
    const k = stack.pop();
    if (k === undefined || reached.has(k)) continue;
    reached.add(k);
    for (const c of trace.nodes.get(k)?.child_keys ?? []) stack.push(c);
  }
  if (reached.size !== trace.nodes.size) {
    throw new Error(`comprehension-semantic-map: ${trace.nodes.size - reached.size} trace node(s) unreachable from root '${trace.root_key}' (§13.6 tree).`);
  }
}

/** Fail-closed: a SUBSUMED node carries no judgment (its frontier ancestor absorbed it) and no taint
 *  (review onto issue-009: a subsumed node has no unverified judgment to count). */
export function assertSubsumedNodeEmptyCore<N, R, W, RB extends RawSemanticBoundaryCoreShape, B extends SemanticBoundaryCoreShape>(
  adapter: SemanticCoordAdapter<N, R, W, RB, B>,
  node: SemanticNodeCore<R, W, B>,
): void {
  if (node.reduce_read_attempt !== "subsumed") return;
  if (
    node.semantic_summary !== "" ||
    node.semantic_boundaries.length > 0 ||
    node.structure_boundary_coverage.length > 0 ||
    node.unanchored_unverified_count !== 0
  ) {
    throw new Error(`comprehension-semantic-map: subsumed node ${adapter.nodeKey(node.node_ref)} must carry no judgment or taint (§13.6 — its frontier ancestor's read covers it).`);
  }
}

// ── S2 accumulation engine (mock/real caller-injected · design §13.6 / §13.8) ─────────────────────

/** Minimum shape of an artifact's raw synthesis output (before deterministic classification). */
export interface SemanticSynthesisOutputCoreShape<RB extends RawSemanticBoundaryCoreShape> {
  semantic_summary: string;
  boundaries: RB[];
}

export interface AccumulateSemanticMapCoreOpts<
  R,
  RB extends RawSemanticBoundaryCoreShape,
  B extends SemanticBoundaryCoreShape,
  I,
  O extends SemanticSynthesisOutputCoreShape<RB>,
  VI,
> {
  synthesize: (input: I) => O;
  /** Verifies every unanchored boundary (N3). */
  verifyUnanchored: (input: VI) => SemanticBoundaryVerification;
  /** The ⓑ' pre-image fields common to the epoch (per-node layer1_ground_hash + child_contributions
   *  are filled in by the walk). */
  preImageBase: Omit<SemanticEpochPreImage, "layer1_ground_hash" | "child_contributions">;
  /** Over-context frontier gate (§13.6 / S3): a subtree with MORE than this many leaves is over-context
   *  → its nodes ACCUMULATE (synthesize from children); a subtree that fits is a FRONTIER (one flat
   *  read) and its descendants are SUBSUMED. tenet 2: accumulation is only valuable over-context. The
   *  budget VALUE must be folded (by the caller) into preImageBase.over_context_gate_config_sha256. */
  overContextBudget: number;
  /** When true, produced nodes are seed-bound: refuted boundaries are EXCLUDED from the seed boundary
   *  list (kept in the taint census + a refuted disclosure), and honesty is enforced for seed. */
  seedBound?: boolean;
  /** Artifact-owned single-source synthesis-input builder (W2 §3(a) / X2) — the SAME function the
   *  stage bridge uses, so the LLM-facing input cannot drift from the module-validated input. */
  buildSynthesisInput: (
    key: string,
    childSummaryByKey: ReadonlyMap<string, string>,
    modes: ReadonlyMap<string, FrontierMode>,
  ) => I;
  /** Artifact-owned source-safety guard on the synthesis input (exact own-key schema). */
  assertSynthesisInputBounded: (input: I) => void;
  /** Artifact-owned fail-closed guard on the caller-injected synthesize's OUTPUT (round-2). */
  assertSynthesisOutputBounded: (out: O) => void;
  /** Artifact-owned verify-input construction (region + boundary are pre-cloned by the walk). */
  makeVerifyInput: (region: R, boundary: B, summary: string) => VI;
}

/** Walk the trace bottom-up, producing one validated semantic node per skeleton node. Each node:
 *  synthesize (caller LLM) → reconcile (deterministic anchor/coverage) → verify EVERY unanchored
 *  boundary (N3) → recursive epoch contribution → taint census → assemble, with all three
 *  fail-closed validators enforced. Deterministic given a deterministic synthesize/verify (the mock). */
export function accumulateSemanticMapCore<
  N,
  R,
  W,
  RB extends RawSemanticBoundaryCoreShape,
  B extends SemanticBoundaryCoreShape,
  I,
  O extends SemanticSynthesisOutputCoreShape<RB>,
  VI,
>(
  adapter: SemanticCoordAdapter<N, R, W, RB, B>,
  trace: ReduceTraceCore<R>,
  nodesByKey: ReadonlyMap<string, N>,
  opts: AccumulateSemanticMapCoreOpts<R, RB, B, I, O, VI>,
): Map<string, SemanticNodeCore<R, W, B>> {
  const result = new Map<string, SemanticNodeCore<R, W, B>>();
  const seedBound = opts.seedBound ?? false;
  const visiting = new Set<string>(); // cycle detection (review F5 / onto issue-003).
  assertReduceTopologyIsTreeCore(trace, adapter.nodeKey); // reject DAG / diamond / duplicate edges before counting (review F2).
  const modes = classifyFrontierCore(trace, opts.overContextBudget); // S3 over-context partition (§13.6).
  // Round-4: validate the config sha is a string BEFORE the template fold (a non-string would coerce to
  // "[object Object]" and silently pass; the folded value is later allowlist-checked but by then the
  // original is lost).
  if (typeof opts.preImageBase.over_context_gate_config_sha256 !== "string") {
    throw new Error("comprehension-semantic-map: preImageBase.over_context_gate_config_sha256 must be a string (§13.4 fail-closed).");
  }
  // Round-3 F2: the RUNTIME owns the budget→epoch binding (do not trust the caller to fold the budget
  // into over_context_gate_config_sha256). A budget change reshapes the frontier partition and thus the
  // judgments, so fold the actual budget into the config sha here — a budget change always rotates the key.
  const preImageBase: Omit<SemanticEpochPreImage, "layer1_ground_hash" | "child_contributions"> = {
    ...opts.preImageBase,
    over_context_gate_config_sha256: createHash("sha256")
      .update(`${opts.preImageBase.over_context_gate_config_sha256}|over_context_budget=${opts.overContextBudget}`)
      .digest("hex"),
  };

  const visit = (key: string): SemanticNodeCore<R, W, B> => {
    const cached = result.get(key);
    if (cached) return cached;
    if (visiting.has(key)) {
      throw new Error(`comprehension-semantic-map: cycle in reduce topology at ${key} — a well-formed trace is a tree (§13.5 fail-closed; review F5).`);
    }
    const tnode = trace.nodes.get(key);
    const reduceNode = nodesByKey.get(key);
    if (!tnode || !reduceNode) {
      throw new Error(`comprehension-semantic-map: trace/node missing for key ${key} (accumulate walk).`);
    }
    // Round-3 F1: nodesByKey MUST agree with the validated trace — a caller could pass a mismatched
    // reduce node whose deterministic facts then feed synthesis/reconcile. The ground hash is the
    // node's full canonical identity (region + sorted clusters + canonical boundaries + honesty), and
    // the synthesis input is derived canonically, so a ground-equivalent node yields an identical
    // input. NOTE (round-4, deferred): a FULL structural re-derivation — proving each parent's ground
    // == merge(children's reduce nodes) — is not re-run here (it would re-execute the Layer-1 fold per
    // node). The module trusts the trace/nodesByKey to be produced by the Layer-1 trace fold (which
    // guarantees that by construction); production wiring provides it.
    if (adapter.nodeKey(adapter.nodeRegion(reduceNode)) !== key || adapter.nodeGroundHash(reduceNode) !== tnode.ground_hash) {
      throw new Error(`comprehension-semantic-map: nodesByKey['${key}'] disagrees with the trace node (region/ground mismatch) (§13.6 fail-closed).`);
    }
    const mode = modes.get(key);
    if (!mode) throw new Error(`comprehension-semantic-map: no frontier mode for ${key} (unreachable from root?).`);
    visiting.add(key);
    const children = tnode.child_keys.map(visit); // recurse ALWAYS — a subsumed subtree still gets 1:1 placeholder nodes.
    visiting.delete(key);

    // Children whose judgment this node CONSUMES = the non-subsumed direct children. For an accumulating
    // node that is all its children; for a frontier node that is none (children are subsumed).
    const consumedChildKeys = tnode.child_keys.filter((k) => modes.get(k) !== "subsumed");
    const consumedChildren = children.filter((c) => modes.get(adapter.nodeKey(c.node_ref)) !== "subsumed");

    // SUBSUMED: no judgment — a 1:1 placeholder (its frontier ancestor's flat read covers it). Its
    // epoch contribution STILL folds its children's contributions (review F1 / onto issue-003/006/011):
    // the epoch recursion is decoupled from judgment consumption, so a non-propagating descendant change
    // (that leaves this node's ground byte-identical) still rotates the key up to the frontier ancestor.
    if (mode === "subsumed") {
      const preImage: SemanticEpochPreImage = {
        ...preImageBase,
        layer1_ground_hash: tnode.ground_hash,
        child_contributions: children.map((c) => c.subtree_epoch_contribution),
      };
      const node: SemanticNodeCore<R, W, B> = {
        node_ref: adapter.cloneRegion(tnode.node_ref),
        layer1_ground_hash: tnode.ground_hash,
        subtree_epoch_contribution: reduceNodeEpochContribution(preImage),
        authority: "non_authoritative",
        provisional: true,
        reduce_read_attempt: "subsumed",
        semantic_summary: "",
        semantic_boundaries: [],
        structure_boundary_coverage: [],
        topology_child_keys: [...tnode.child_keys], // clone so the returned node does not alias the trace array (round-3 F3).
        consumed_child_judgment_keys: [],
        unanchored_unverified_count: 0,
      };
      assertSubsumedNodeEmptyCore(adapter, node);
      assertChildJudgmentCoverageCore(adapter, node, []);
      result.set(key, node);
      return node;
    }

    // FRONTIER = one flat read over the whole subtree (child_summaries omitted; children are subsumed).
    // ACCUMULATING = synthesize the (non-subsumed) children's judgments. Both are 'produced'.
    // W2 §3(a): the input is constructed through the SAME exported single-source builder the stage
    // bridge uses (node_ref cloned inside — review F3), so the LLM-facing input cannot drift from
    // the module-validated input by construction.
    const r = tnode.node_ref;
    const input = opts.buildSynthesisInput(
      key,
      new Map(consumedChildren.map((c) => [adapter.nodeKey(c.node_ref), c.semantic_summary])),
      modes,
    );
    opts.assertSynthesisInputBounded(input);
    const out = opts.synthesize(input);
    opts.assertSynthesisOutputBounded(out); // round-2: validate the caller's OUTPUT, not just the input.

    const { boundaries: classified, coverage } = reconcileBoundariesCore(adapter, out.boundaries, adapter.nodeBoundaries(reduceNode));
    // N3: verify EVERY unanchored boundary (structure is blind there). Anchored stay location-only.
    // The injected verifier's return is validated (review F2): a bogus status must fail closed here,
    // not slip into a seed-bound node.
    const verified: B[] = classified.map((b) => {
      if (b.anchor_status !== "unanchored") return b;
      // Clone node_ref + boundary for the verifier too (round-2: F3 only cloned the synthesize input;
      // the verifier could mutate the live trace node_ref and corrupt later child-summary keys).
      const v = opts.verifyUnanchored(opts.makeVerifyInput(adapter.cloneRegion(r), { ...b }, out.semantic_summary));
      if (!VALID_ADVERSARIAL_RESULT.has(v)) {
        throw new Error(`comprehension-semantic-map: verifyUnanchored returned invalid result '${v}' at ${key} — must be adversarial_confirmed | adversarial_refuted (§13.5 fail-closed).`);
      }
      return { ...b, verification: v };
    });
    const refutedCount = verified.filter((b) => b.verification === "adversarial_refuted").length;
    // Seed-bound: refuted boundaries are EXCLUDED from the seed boundary list (codex-F2) — counted in
    // taint below. Non-seed: kept for inspection (still counted in taint via ownUnverifiedCount).
    const keptBoundaries = seedBound ? verified.filter((b) => b.verification !== "adversarial_refuted") : verified;

    const preImage: SemanticEpochPreImage = {
      ...preImageBase,
      layer1_ground_hash: tnode.ground_hash,
      // EPOCH recursion is decoupled from judgment CONSUMPTION (review F1 / onto issue-003/006/011): a
      // frontier consumes no child SUMMARIES (flat read) but STILL folds ALL children's contributions,
      // so a non-propagating descendant change (parent ground byte-identical) rotates the frontier key —
      // matching the accumulating path (fail-safe: over-rotate, never stale-reuse).
      child_contributions: children.map((c) => c.subtree_epoch_contribution),
    };

    const node: SemanticNodeCore<R, W, B> = {
      node_ref: adapter.cloneRegion(r),
      layer1_ground_hash: tnode.ground_hash,
      subtree_epoch_contribution: reduceNodeEpochContribution(preImage),
      authority: "non_authoritative",
      provisional: true,
      reduce_read_attempt: "produced",
      semantic_summary: out.semantic_summary,
      semantic_boundaries: keptBoundaries,
      structure_boundary_coverage: coverage,
      topology_child_keys: [...tnode.child_keys], // clone so the returned node does not alias the trace array (round-3 F3).
      consumed_child_judgment_keys: consumedChildKeys, // [] for a frontier; all children for accumulating.
      unanchored_unverified_count: 0,
    };
    // Taint = CONSUMED children + own remaining unverified boundaries + any refuted removed for seed.
    node.unanchored_unverified_count =
      computeUnanchoredUnverifiedCountCore(node, consumedChildren) + (seedBound ? refutedCount : 0);

    // Fail-closed validators (§13.5). expectedConsumedKeys = the non-subsumed children.
    assertChildJudgmentCoverageCore(adapter, node, consumedChildKeys);
    assertSemanticBoundaryHonestyCore(adapter, node, seedBound);
    assertTaintCensusMonotoneCore(adapter, node, consumedChildren);

    result.set(key, node);
    return node;
  };

  visit(trace.root_key);
  // Reachability (review F5 / onto issue-003): every trace node MUST be reached from the root, else an
  // orphan node would be silently dropped from the accumulated map (a completeness violation).
  if (result.size !== trace.nodes.size) {
    throw new Error(
      `comprehension-semantic-map: ${trace.nodes.size - result.size} trace node(s) unreachable from root ${trace.root_key} — orphan nodes would be silently dropped (§13.5 fail-closed).`,
    );
  }
  return result;
}

// ── S4 seed projection (design §6 / §13.8) — the accumulated map → seed authoring input ───────────

export type SeedBoundaryDisposition = "structural_location_only" | "adversarial_confirmed";

/** The shared, artifact-independent seed-projection envelope (per-artifact node/disclosure types). */
export interface SemanticSeedProjectionCore<SN, RD> {
  authority: "non_authoritative";
  provisional: true;
  nodes: SN[];
  nodes_total: number; //                 AUTHORITATIVE — when nodes.length < nodes_total, the rest were bounded for size, not dropped.
  refuted_disclosure: RD[];
  refuted_disclosure_total: number; //    AUTHORITATIVE.
  unanchored_unverified_total: number; // taint census (the root's monotone count = the whole tree's).
}

export interface SeedProjectionCoreOpts {
  /** Display bound for the nodes list; the total is always authoritative. Default: no bound. */
  maxNodes?: number;
  /** Display bound for the refuted disclosure list; the total is always authoritative. */
  maxDisclosure?: number;
}

/** Artifact-owned seed-object construction (field order preserved for artifact-truth serialization). */
export interface SeedProjectionConstructors<R, B extends SemanticBoundaryCoreShape, SB, SN, RD> {
  makeSeedBoundary(b: B, disposition: SeedBoundaryDisposition): SB;
  makeRefutedDisclosure(region: R, b: B): RD;
  makeSeedNode(region: R, summary: string, boundaries: SB[]): SN;
}

/** Project the accumulated semantic map into a bounded, honest seed input (§6). Pure / deterministic.
 *  ★INPUT CONTRACT (S4 code review): the map MUST be accumulated with seedBound=FALSE — refuted
 *  boundaries are RETAINED in semantic_boundaries so this projection is the sole place that excludes
 *  them (into refuted_disclosure). A seedBound=true map would hide refuted from the disclosure. The
 *  taint census is DERIVED from what the projection actually sees (refuted boundaries + failed/unread
 *  regions) — self-consistent with the disclosure, never trusting the map's own
 *  unanchored_unverified_count (which a caller could set to NaN / non-monotone). */
export function projectSemanticMapToSeedCore<
  N,
  R,
  W,
  RB extends RawSemanticBoundaryCoreShape,
  B extends SemanticBoundaryCoreShape,
  SB,
  SN,
  RD,
>(
  adapter: SemanticCoordAdapter<N, R, W, RB, B>,
  constructors: SeedProjectionConstructors<R, B, SB, SN, RD>,
  map: ReadonlyMap<string, SemanticNodeCore<R, W, B>>,
  opts: SeedProjectionCoreOpts = {},
): SemanticSeedProjectionCore<SN, RD> {
  const checkBound = (name: string, v: number | undefined): void => {
    if (v !== undefined && (!Number.isSafeInteger(v) || v < 0)) {
      throw new Error(`comprehension-semantic-map: seed projection ${name} must be a non-negative safe integer or absent (fail-closed; -1/NaN would silently show nothing).`);
    }
  };
  checkBound("maxNodes", opts.maxNodes);
  checkBound("maxDisclosure", opts.maxDisclosure);

  const nodesAll: SN[] = [];
  const refuted: RD[] = [];
  let failedOrUnread = 0;
  // Deterministic CANONICAL order — by nodeKey(node_ref), NOT the caller's map key.
  const nodes = [...map.values()].sort((a, b) => cmpStr(adapter.nodeKey(a.node_ref), adapter.nodeKey(b.node_ref)));
  for (const node of nodes) {
    // Honesty precondition (fail-closed): legal (anchor_status, verification) states only. seedBound=false
    // (the map still carries refuted boundaries; THIS projection is what excludes them from seed).
    assertSemanticBoundaryHonestyCore(adapter, node, false);
    // The map key MUST be the canonical node key (else consumed/child keys diverge; S3 F4 class).
    const canonicalKey = adapter.nodeKey(node.node_ref);
    if (map.get(canonicalKey) !== node) {
      throw new Error(`comprehension-semantic-map: seed projection — a node is stored under a non-canonical map key (expected '${canonicalKey}') (§13.6 fail-closed).`);
    }
    if (node.reduce_read_attempt === "subsumed") {
      assertSubsumedNodeEmptyCore(adapter, node); // a subsumed node must carry no judgment/taint (fail-closed).
      continue; // no judgment (frontier ancestor covers it).
    }
    if (node.reduce_read_attempt === "failed" || node.reduce_read_attempt === "unread") {
      failedOrUnread += 1; // an unverified region (the read failed) — counted in taint, no seed node.
      continue;
    }
    const region = node.node_ref;
    const boundaries: SB[] = [];
    for (const b of node.semantic_boundaries) {
      if (b.anchor_status === "anchored") {
        boundaries.push(constructors.makeSeedBoundary(b, "structural_location_only"));
      } else if (b.verification === "adversarial_confirmed") {
        boundaries.push(constructors.makeSeedBoundary(b, "adversarial_confirmed"));
      } else if (b.verification === "adversarial_refuted") {
        refuted.push(constructors.makeRefutedDisclosure(region, b));
      } else {
        // unanchored + unverified: accumulate must have adversarially processed it before seed (N3).
        throw new Error(`comprehension-semantic-map: unverified unanchored boundary at ${adapter.nodeKey(region)}@${adapter.boundaryPosLabel(b)} reached seed projection — every unanchored boundary must be adversarially verified first (§13.5 N3 fail-closed).`);
      }
    }
    nodesAll.push(constructors.makeSeedNode(region, node.semantic_summary, boundaries));
  }
  // Taint DERIVED from what the projection sees (refuted boundaries + failed/unread regions) — self-
  // consistent with refuted_disclosure, never trusting the caller's count.
  const taint = refuted.length + failedOrUnread;
  return {
    authority: "non_authoritative",
    provisional: true,
    nodes: nodesAll.slice(0, opts.maxNodes ?? nodesAll.length),
    nodes_total: nodesAll.length,
    refuted_disclosure: refuted.slice(0, opts.maxDisclosure ?? refuted.length),
    refuted_disclosure_total: refuted.length,
    unanchored_unverified_total: taint,
  };
}
