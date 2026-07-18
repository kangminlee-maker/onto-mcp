import { createHash } from "node:crypto";
import {
  reduceNodeGroundHash,
  reduceNodeKey,
  type ComprehensionReduceNode,
  type ComprehensionReduceRegion,
  type ReduceTopologyTrace,
  type SemanticNodeKey,
} from "./comprehension-reduce.js";
import type { ComprehensionBoundaryWitness } from "./comprehension-artifact.js";
import {
  accumulateSemanticMapCore,
  assertChildJudgmentCoverageCore,
  assertReduceTopologyIsTreeCore,
  assertSemanticBoundaryHonestyCore,
  assertSubsumedNodeEmptyCore,
  assertTaintCensusMonotoneCore,
  classifyFrontierCore,
  computeSubtreeLeafCountsCore,
  computeUnanchoredUnverifiedCountCore,
  ownUnverifiedCountCore,
  projectSemanticMapToSeedCore,
  reconcileBoundariesCore,
  type FrontierMode,
  type ReduceReadAttempt,
  type SeedBoundaryDisposition,
  type SeedProjectionConstructors,
  type SemanticAnchorStatus,
  type SemanticBoundaryVerification,
  type SemanticCoordAdapter,
  type SemanticEpochPreImage,
  type SemanticVerificationStatus,
  type StructureBoundaryCoverageCore,
} from "./comprehension-semantic-map-core.js";

// ─────────────────────────────────────────────────────────────────────────────
// comprehension-semantic-map (Layer-2 · design 20260701-layer2-accumulated-semantic-channel §13) —
// the ACCUMULATED LLM semantic channel that rides ALONGSIDE the deterministic Layer-1 reduce skeleton
// (comprehension-reduce.ts) without touching its byte-stable ground. Each Layer-1 node gets one
// parallel semantic node; the LLM's judgment is provisional / non-authoritative and is EXCLUDED from
// the resume key (design §4). This module is the SPREADSHEET REALIZATION of the coordinate-agnostic
// L2 core (comprehension-semantic-map-core.ts — multi-artifact design 20260718 §2 DD3): the honesty
// invariants N1–N6, the frontier partition, the accumulation walk, and the seed projection live in
// the core; this façade owns the spreadsheet coordinate adapter (row vocabulary, witness order,
// literal field orders), the source-safe synthesis envelope, and the public spreadsheet types —
// byte-identical to the pre-extraction module (G-SS goldens).
//
// Honesty invariants ENFORCED by the core (not asserted in prose), each with a falsifiable negative
// control: N1/N2 two-sided reconcile, N3 verification state machine, N4 allowlisted non-circular
// epoch contribution, N5 subsumed-aware child coverage, N6 taint monotone (§13.3–§13.5).
// ─────────────────────────────────────────────────────────────────────────────

// ── anchor / verification vocabulary (core-owned; re-exported spreadsheet surface) ────────────────

export {
  ADVERSARIAL_RESULTS,
  SEMANTIC_EPOCH_PREIMAGE_ALLOWLIST,
  assertPreImageKeysAllowlisted,
  reduceNodeEpochContribution,
} from "./comprehension-semantic-map-core.js";
export type {
  FrontierMode,
  ReduceReadAttempt,
  SeedBoundaryDisposition,
  SemanticAnchorStatus,
  SemanticBoundaryVerification,
  SemanticEpochPreImage,
  SemanticVerificationStatus,
} from "./comprehension-semantic-map-core.js";

/** An LLM-proposed semantic boundary BEFORE deterministic classification (reconcile input). */
export interface RawSemanticBoundary {
  row: number;
  character_before: string;
  character_after: string;
}

/** A semantic boundary + its DETERMINISTIC anchor/verification. The character fields and row are the LLM's;
 *  anchor_status/verification are code-assigned (reconcileBoundaries + the adversarial stage), never
 *  LLM-authored (design §13.2). */
export interface SemanticBoundary extends RawSemanticBoundary {
  anchor_status: SemanticAnchorStatus;
  verification: SemanticVerificationStatus;
}

/** Deterministic two-sided reconciliation record for ONE value-shape structural seam (§13.3 / N1). */
export type StructureBoundaryCoverage = StructureBoundaryCoverageCore<ComprehensionBoundaryWitness>;

/** One Layer-2 node — parallel to a Layer-1 ComprehensionReduceNode, keyed by the same node_ref. Holds
 *  the LLM judgment (provisional, non-authoritative) + deterministic classification + the recursive
 *  resume contribution. NEVER part of reduceNodeGround (resume key exclusion, §4.1). */
export interface ComprehensionSemanticNode {
  node_ref: ComprehensionReduceRegion; //           deterministic anchor (= trace key origin)
  layer1_ground_hash: string; //                    reduceNodeGroundHash(node) — recursion input
  subtree_epoch_contribution: string; //            reduceNodeEpochContribution(...) — resume-excluded
  authority: "non_authoritative";
  provisional: true;
  reduce_read_attempt: ReduceReadAttempt;
  semantic_summary: string; //                      LLM text (synthesizes children)
  semantic_boundaries: SemanticBoundary[]; //       LLM boundaries + deterministic classification
  structure_boundary_coverage: StructureBoundaryCoverage[]; //  N1 two-sided seam census
  topology_child_keys: SemanticNodeKey[]; //        ALL structural children (from trace) — deterministic
  consumed_child_judgment_keys: SemanticNodeKey[]; //  children actually synthesized (empty if subsumed)
  unanchored_unverified_count: number; //           N6 taint census (own + children, OR-monotone)
}

// ── spreadsheet coordinate adapter (design DD3 — every row-vocabulary literal lives here) ─────────

const VALUE_SHAPE = "value_shape" as const;

/** ±1: a value-shape seam spans last_prev_format_row / first_new_format_row (2 rows); ±1 covers that
 *  span without widening it (design §13.3). Exact-row match is preferred; tolerance is the fallback. */
export const ANCHOR_ROW_TOLERANCE = 1;

const cmpStr = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** Canonical TOTAL order over value-shape seams (full witness tuple so equal-row seams from different
 *  provenance never tie by input order; review F7 — mirrors comprehension-reduce canonicalBoundaries). */
function seamCmp(a: ComprehensionBoundaryWitness, b: ComprehensionBoundaryWitness): number {
  return (
    cmpStr(a.sheet, b.sheet) ||
    a.column_index - b.column_index ||
    a.first_new_format_row - b.first_new_format_row ||
    a.last_prev_format_row - b.last_prev_format_row ||
    cmpStr(a.boundary_kind, b.boundary_kind) ||
    cmpStr(a.prev_shape, b.prev_shape) ||
    cmpStr(a.new_shape, b.new_shape)
  );
}

const SPREADSHEET_SEMANTIC_ADAPTER: SemanticCoordAdapter<
  ComprehensionReduceNode,
  ComprehensionReduceRegion,
  ComprehensionBoundaryWitness,
  RawSemanticBoundary,
  SemanticBoundary
> = {
  nodeKey: (r) => reduceNodeKey(r),
  cloneRegion: (r) => ({ sheet: r.sheet, column_index: r.column_index, row_start: r.row_start, row_end: r.row_end }),
  nodeRegion: (n) => n.region,
  nodeBoundaries: (n) => n.boundaries,
  nodeGroundHash: (n) => reduceNodeGroundHash(n),
  structuralSeams: (boundaries) => boundaries.filter((b) => b.boundary_kind === VALUE_SHAPE).slice().sort(seamCmp),
  seamAnchorPos: (w) => w.first_new_format_row,
  // Reconstruct from the DECLARED fields only (round-4): a bare spread would clone extra nested own
  // props by reference (aliasing the source boundary); the explicit projection drops them and clones.
  cloneSeamRef: (s) => ({
    sheet: s.sheet,
    column_index: s.column_index,
    boundary_kind: s.boundary_kind,
    prev_shape: s.prev_shape,
    new_shape: s.new_shape,
    last_prev_format_row: s.last_prev_format_row,
    first_new_format_row: s.first_new_format_row,
  }),
  anchorTolerance: ANCHOR_ROW_TOLERANCE,
  rawBoundaryPos: (b) => b.row,
  classifyRawBoundary: (b, anchored) => ({
    row: b.row,
    character_before: b.character_before,
    character_after: b.character_after,
    anchor_status: anchored ? "anchored" : "unanchored",
    verification: anchored ? "structural_location_only" : "unverified",
  }),
  boundaryPos: (b) => b.row,
  boundaryPosLabel: (b) => `row${b.row}`,
};

// ── N1/N2 two-sided reconciliation ───────────────────────────────────────────

/** Two-sided deterministic reconciliation (design §13.3 / N1 / N2 / codex-F3). For a node's LLM
 *  boundaries and its Layer-1 value-shape seams, assign each boundary anchored|unanchored and record a
 *  covered|missed_by_llm status for EVERY seam. Matching is a 1:1 assignment (a seam anchors at most
 *  one boundary), exact-row first then nearest-within-tolerance, canonical-order tie-break — so dense
 *  seams cannot blanket-anchor every boundary (L2H-2) and the result is order-stable (codex-F3). */
export function reconcileBoundaries(
  raw: readonly RawSemanticBoundary[],
  reduceNode: Pick<ComprehensionReduceNode, "boundaries">,
): { boundaries: SemanticBoundary[]; coverage: StructureBoundaryCoverage[] } {
  return reconcileBoundariesCore(SPREADSHEET_SEMANTIC_ADAPTER, raw, reduceNode.boundaries);
}

// ── N3/N5/N6 fail-closed validators (spreadsheet-typed façades over the core) ─────────────────────

/** N5 / codex-F1: child-judgment completeness, subsumed-aware (§13.5). */
export function assertChildJudgmentCoverage(
  node: ComprehensionSemanticNode,
  expectedConsumedKeys: readonly SemanticNodeKey[],
): void {
  assertChildJudgmentCoverageCore(SPREADSHEET_SEMANTIC_ADAPTER, node, expectedConsumedKeys);
}

/** N3 / L2H-5 / codex-F2: the fail-closed verification state machine (§13.5). */
export function assertSemanticBoundaryHonesty(node: ComprehensionSemanticNode, seedBound: boolean): void {
  assertSemanticBoundaryHonestyCore(SPREADSHEET_SEMANTIC_ADAPTER, node, seedBound);
}

/** This node's OWN unverified taint: unanchored boundaries not adversarially-confirmed (unverified or
 *  refuted) + a failed/unread read outcome. */
export function ownUnverifiedCount(node: ComprehensionSemanticNode): number {
  return ownUnverifiedCountCore(node);
}

/** The canonical taint census value a node SHOULD carry (own + children). Callers set
 *  unanchored_unverified_count from this; the validator enforces the fail-closed direction. */
export function computeUnanchoredUnverifiedCount(
  node: ComprehensionSemanticNode,
  children: readonly ComprehensionSemanticNode[],
): number {
  return computeUnanchoredUnverifiedCountCore(node, children);
}

/** N6: taint monotone. A parent may never UNDERSTATE accumulated unverified taint (fail-closed,
 *  symmetric with assertHonestyFold). Over-reporting is allowed; understating throws. */
export function assertTaintCensusMonotone(
  node: ComprehensionSemanticNode,
  children: readonly ComprehensionSemanticNode[],
): void {
  assertTaintCensusMonotoneCore(SPREADSHEET_SEMANTIC_ADAPTER, node, children);
}

// ── S2 accumulation engine (mock/real caller-injected · design §13.6 / §13.8) ─────────────────────
//
// accumulateSemanticMap walks the deterministic ReduceTopologyTrace BOTTOM-UP and, at each node,
// synthesizes the children's judgments + this node's Layer-1 facts into a semantic judgment, then
// classifies it deterministically. The LLM interaction is CALLER-INJECTED (SemanticSynthesisFn +
// AdversarialVerifyFn) — mock in tests, real authoring in production — mirroring the realization-
// agnostic leaf-reader. The over-context FRONTIER (S3, §13.6) partitions the tree: accumulating nodes
// (over-context) synthesize their children; a frontier node (largest fitting subtree) is one flat read;
// its descendants are subsumed placeholders. `overContextBudget` (leaf count) sets the boundary.

/** Bounded, SOURCE-SAFE input for the synthesis at one node (design §13.6 envelope): Layer-1
 *  deterministic facts + children's LLM summaries only. NO raw cell values / formatCodes / examples
 *  (leaf-reader.ts:26-32 discipline, extended to interior nodes). */
export interface SemanticSynthesisInput {
  node_ref: ComprehensionReduceRegion;
  format_clusters: string[];
  value_shape_seams: { row: number; prev_shape: string; new_shape: string }[];
  child_summaries: { key: SemanticNodeKey; summary: string }[];
}

/** The LLM's raw synthesis output at a node (before deterministic classification). */
export interface SemanticSynthesisOutput {
  semantic_summary: string;
  boundaries: RawSemanticBoundary[];
}

/** Caller-injected synthesis (mock in tests, real authoring in production). Realization-agnostic. */
export type SemanticSynthesisFn = (input: SemanticSynthesisInput) => SemanticSynthesisOutput;

/** Input to the adversarial verifier for ONE unanchored boundary — the named form of the former
 *  inline shape (type-identity preserving; W1 §15.1 names it for the author capability seat). */
export interface SemanticBoundaryVerifyInput {
  node_ref: ComprehensionReduceRegion;
  boundary: SemanticBoundary;
  summary: string;
}

/** Caller-injected adversarial verifier for ONE unanchored boundary (N3: ALL unanchored are verified —
 *  it is the only check where structure is blind). An INDEPENDENT lens (distinct prompt/model in
 *  production). Returns confirmed | refuted. */
export type AdversarialVerifyFn = (input: SemanticBoundaryVerifyInput) => SemanticBoundaryVerification;

export interface AccumulateSemanticMapOpts {
  synthesize: SemanticSynthesisFn;
  /** Verifies every unanchored boundary (N3). */
  verifyUnanchored: AdversarialVerifyFn;
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
}

const VALUE_SHAPE_KIND = "value_shape" as const;

// ── over-context frontier partition (S3 · design §13.6) — core-owned; spreadsheet-typed façades ───

/** Deterministic subtree LEAF count per node (the single over-context metric — NOT row-span or ground
 *  bytes; §13.6 codex-F5). Throws on a cyclic trace. */
export function computeSubtreeLeafCounts(trace: ReduceTopologyTrace): Map<SemanticNodeKey, number> {
  return computeSubtreeLeafCountsCore(trace);
}

/** Tautological over-context gate LOGIC digest (design §13.4 L2R-2 / ultracode audit F — mirrors
 *  leaf-reader structureLeafTriggerLogicSha256): hashes the SOURCE of the frontier predicate and its
 *  metric (the CORE functions after the DD3 extraction — the façade wrappers carry no logic), so
 *  editing either rotates every semantic-map fingerprint without a hand-bumped knob. */
export function semanticMapGateLogicSha256(): string {
  return createHash("sha256")
    .update(classifyFrontierCore.toString())
    .update(" ")
    .update(computeSubtreeLeafCountsCore.toString())
    .digest("hex");
}

/** Classify every REACHABLE node (from root) into its frontier role, top-down (§13.6). A leaf can never
 *  accumulate (no children), so it is a frontier (or subsumed under one). Deterministic. */
export function classifyFrontier(trace: ReduceTopologyTrace, overContextBudget: number): Map<SemanticNodeKey, FrontierMode> {
  return classifyFrontierCore(trace, overContextBudget);
}

/** Fail-closed: the trace MUST be a rooted TREE (review F2 / onto issue-002/004) — see the core. */
export function assertReduceTopologyIsTree(trace: ReduceTopologyTrace): void {
  assertReduceTopologyIsTreeCore(trace, reduceNodeKey);
}

/** Fail-closed: a SUBSUMED node carries no judgment (its frontier ancestor absorbed it) and no taint
 *  (review onto issue-009: a subsumed node has no unverified judgment to count). */
export function assertSubsumedNodeEmpty(node: ComprehensionSemanticNode): void {
  assertSubsumedNodeEmptyCore(SPREADSHEET_SEMANTIC_ADAPTER, node);
}

/** SOURCE-SAFETY guard (§13.6 / C6): the synthesis input must carry only bounded deterministic facts +
 *  child summary prose — never a raw cell value / formatCode / example. By construction the builder
 *  only pulls safe fields; this asserts the shape so an accidental enrichment fails closed. */
const SYNTHESIS_INPUT_KEYS = ["node_ref", "format_clusters", "value_shape_seams", "child_summaries"] as const;
const SEAM_KEYS = ["row", "prev_shape", "new_shape"] as const;
const CHILD_SUMMARY_KEYS = ["key", "summary"] as const;
const REGION_KEYS = ["sheet", "column_index", "row_start", "row_end"] as const;
const SYNTHESIS_OUTPUT_KEYS = ["semantic_summary", "boundaries"] as const;
const RAW_BOUNDARY_KEYS = ["row", "character_before", "character_after"] as const;

function assertExactKeys(label: string, obj: unknown, keys: readonly string[]): void {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error(`comprehension-semantic-map: ${label} must be a plain object (§13.6 source-safe envelope).`);
  }
  const own = Object.keys(obj as Record<string, unknown>);
  const want = new Set(keys);
  for (const k of own) {
    if (!want.has(k)) {
      throw new Error(`comprehension-semantic-map: ${label} has unexpected field '${k}' — only ${keys.join(", ")} allowed (§13.6 source-safe envelope; an extra field could smuggle a raw value into synthesis).`);
    }
  }
  for (const k of keys) {
    if (!Object.hasOwn(obj as Record<string, unknown>, k)) {
      throw new Error(`comprehension-semantic-map: ${label} missing required field '${k}' (§13.6).`);
    }
  }
}

/** SOURCE-SAFETY guard (§13.6 / C6 / review F1 / onto issue-012/016) — an EXACT own-key schema, not a
 *  partial type spot-check. The input may carry ONLY the bounded deterministic facts + child summary
 *  prose; an extra field on the input, a non-string format cluster, a seam with extra keys, or a raw
 *  child-summary value fails closed — so an accidental "enrichment" that smuggles a raw cell value /
 *  formatCode / example into the synthesis prompt cannot pass. */
export function assertSynthesisInputBounded(input: SemanticSynthesisInput): void {
  assertExactKeys("synthesis input", input, SYNTHESIS_INPUT_KEYS);
  assertExactKeys("synthesis input.node_ref", input.node_ref, REGION_KEYS);
  if (!Array.isArray(input.format_clusters) || input.format_clusters.some((c) => typeof c !== "string")) {
    throw new Error("comprehension-semantic-map: synthesis format_clusters must be string[] — no raw values (§13.6).");
  }
  if (!Array.isArray(input.value_shape_seams)) {
    throw new Error("comprehension-semantic-map: synthesis value_shape_seams must be an array (§13.6).");
  }
  for (const s of input.value_shape_seams) {
    assertExactKeys("synthesis seam", s, SEAM_KEYS);
    if (typeof s.row !== "number" || typeof s.prev_shape !== "string" || typeof s.new_shape !== "string") {
      throw new Error("comprehension-semantic-map: synthesis seam must be {row:number, prev_shape:string, new_shape:string} — no raw values (§13.6).");
    }
  }
  if (!Array.isArray(input.child_summaries)) {
    throw new Error("comprehension-semantic-map: synthesis child_summaries must be an array (§13.6).");
  }
  for (const c of input.child_summaries) {
    assertExactKeys("synthesis child summary", c, CHILD_SUMMARY_KEYS);
    if (typeof c.key !== "string" || typeof c.summary !== "string") {
      throw new Error("comprehension-semantic-map: synthesis child summary must be {key:string, summary:string} (§13.6 source-safe envelope).");
    }
  }
}

/** Fail-closed on the caller-injected synthesize's OUTPUT (round-2 review: the INPUT was validated but
 *  the OUTPUT was not, so a malformed boundary — a string row that coerces in Math.abs, an object
 *  character field — flowed through reconcile and anchored). Exact own-key schema; a boundary row must
 *  be a safe integer and its character fields strings. */
export function assertSynthesisOutputBounded(out: SemanticSynthesisOutput): void {
  assertExactKeys("synthesis output", out, SYNTHESIS_OUTPUT_KEYS);
  if (typeof out.semantic_summary !== "string") {
    throw new Error("comprehension-semantic-map: synthesis output semantic_summary must be a string (§13.5 fail-closed).");
  }
  if (!Array.isArray(out.boundaries)) {
    throw new Error("comprehension-semantic-map: synthesis output boundaries must be an array (§13.5 fail-closed).");
  }
  for (const b of out.boundaries) {
    assertExactKeys("synthesis output boundary", b, RAW_BOUNDARY_KEYS);
    if (!Number.isSafeInteger(b.row)) {
      throw new Error(`comprehension-semantic-map: synthesis output boundary row must be a safe integer, got ${JSON.stringify(b.row)} (§13.5 fail-closed).`);
    }
    if (typeof b.character_before !== "string" || typeof b.character_after !== "string") {
      throw new Error("comprehension-semantic-map: synthesis output boundary character fields must be strings (§13.5 fail-closed).");
    }
  }
}

/** Canonical value-shape seams for the synthesis input (round-4 / onto issue-001): the ground hash
 *  canonicalizes (sorts + dedups) format_clusters/boundaries, but the synthesis input consumed RAW
 *  order, so a ground-equivalent but raw-divergent reduce node could change the LLM input. Deriving the
 *  synthesis facts canonically makes the input a pure function of the ground identity. For a real
 *  reduceColumnLeavesWithTrace node (already canonical) this is a no-op. */
function canonicalValueShapeSeams(
  boundaries: readonly ComprehensionBoundaryWitness[],
): { row: number; prev_shape: string; new_shape: string }[] {
  const seen = new Set<string>();
  const out: { row: number; prev_shape: string; new_shape: string }[] = [];
  for (const b of boundaries) {
    if (b.boundary_kind !== VALUE_SHAPE_KIND) continue;
    const key = `${b.first_new_format_row}|${b.prev_shape}|${b.new_shape}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ row: b.first_new_format_row, prev_shape: b.prev_shape, new_shape: b.new_shape });
  }
  out.sort((x, y) => x.row - y.row || cmpStr(x.prev_shape, y.prev_shape) || cmpStr(x.new_shape, y.new_shape));
  return out;
}

/** SINGLE-SOURCE synthesis-input builder (W2 §3(a) / X2): the module's internal walk AND the stage
 *  bridge both construct the LLM-facing input through this function, so the input the LLM actually
 *  saw cannot drift from the input the module validates (the bridge additionally compares stableJson
 *  of both — §3(b)). Child summaries are MODULE-owned outputs (a produced child's semantic_summary),
 *  unbuildable from topology alone (X2: codex-F2 ≡ onto-004) — the caller supplies them via
 *  `childSummaryByKey` (available bottom-up). Fail-closed on an unknown/subsumed key or a missing
 *  consumed-child summary. The returned node_ref is a clone (review F3 — a caller-injected
 *  synthesize cannot mutate the trace). */
export function buildSynthesisInputForNode(
  trace: ReduceTopologyTrace,
  nodesByKey: ReadonlyMap<SemanticNodeKey, ComprehensionReduceNode>,
  modes: ReadonlyMap<SemanticNodeKey, FrontierMode>,
  key: SemanticNodeKey,
  childSummaryByKey: ReadonlyMap<SemanticNodeKey, string>,
): SemanticSynthesisInput {
  const tnode = trace.nodes.get(key);
  const reduceNode = nodesByKey.get(key);
  if (!tnode || !reduceNode) {
    throw new Error(`comprehension-semantic-map: trace/node missing for key ${key} (synthesis input).`);
  }
  const mode = modes.get(key);
  if (!mode) {
    throw new Error(`comprehension-semantic-map: no frontier mode for ${key} (synthesis input).`);
  }
  if (mode === "subsumed") {
    throw new Error(`comprehension-semantic-map: subsumed node ${key} takes no synthesis input (§13.6 — its frontier ancestor's read covers it).`);
  }
  const r = tnode.node_ref;
  const isFrontier = mode === "frontier";
  const consumedChildKeys = tnode.child_keys.filter((k) => modes.get(k) !== "subsumed");
  return {
    node_ref: { sheet: r.sheet, column_index: r.column_index, row_start: r.row_start, row_end: r.row_end },
    format_clusters: [...reduceNode.format_clusters].sort(), // canonical (round-4): input = fn(ground identity), not raw order.
    value_shape_seams: canonicalValueShapeSeams(reduceNode.boundaries),
    child_summaries: isFrontier
      ? []
      : consumedChildKeys.map((k) => {
          const summary = childSummaryByKey.get(k);
          if (summary === undefined) {
            throw new Error(`comprehension-semantic-map: missing consumed-child summary for ${k} (synthesis input — children must be produced bottom-up first).`);
          }
          return { key: k, summary };
        }),
  };
}

/** Walk the trace bottom-up, producing one validated ComprehensionSemanticNode per skeleton node. Each
 *  node: synthesize (caller LLM) → reconcileBoundaries (deterministic anchor/coverage) → verify EVERY
 *  unanchored boundary (N3) → recursive epoch contribution → taint census → assemble, with all three
 *  fail-closed validators enforced. Deterministic given a deterministic synthesize/verify (the mock).
 *  The walk itself is the coordinate-agnostic core (DD3); this façade binds the spreadsheet adapter +
 *  the single-source synthesis-input builder + the source-safe envelope guards. */
export function accumulateSemanticMap(
  trace: ReduceTopologyTrace,
  nodesByKey: ReadonlyMap<SemanticNodeKey, ComprehensionReduceNode>,
  opts: AccumulateSemanticMapOpts,
): Map<SemanticNodeKey, ComprehensionSemanticNode> {
  return accumulateSemanticMapCore(SPREADSHEET_SEMANTIC_ADAPTER, trace, nodesByKey, {
    synthesize: opts.synthesize,
    verifyUnanchored: opts.verifyUnanchored,
    preImageBase: opts.preImageBase,
    overContextBudget: opts.overContextBudget,
    ...(opts.seedBound !== undefined ? { seedBound: opts.seedBound } : {}),
    buildSynthesisInput: (key, childSummaryByKey, modes) =>
      buildSynthesisInputForNode(trace, nodesByKey, modes, key, childSummaryByKey),
    assertSynthesisInputBounded,
    assertSynthesisOutputBounded,
    makeVerifyInput: (node_ref, boundary, summary) => ({ node_ref, boundary, summary }),
  });
}

// ── S4 seed projection (design §6 / §13.8) — the accumulated map → seed authoring input ───────────
//
// The hierarchical semantic map is projected into a bounded, HONEST seed input. This is a PURE
// projection (LLM-0) applied to a map accumulated with seedBound=false (all boundaries present); the
// projection IS the seed-honesty layer. §6 honest projection rules:
//  - anchored boundary → disposition 'structural_location_only' — a value-shape seam co-locates, but
//    the LLM's CONTENT is NOT verified (N2); it flows as provisional, never as 'verified'/high-confidence.
//  - unanchored + adversarial_confirmed → 'adversarial_confirmed' — survived the independent recheck;
//    still provisional / user-gated.
//  - unanchored + adversarial_refuted → EXCLUDED from the seed boundaries; recorded in refuted_disclosure
//    and counted in the taint census (codex-F2 / §13.5).
//  - unanchored + unverified → THROWS: accumulate must adversarially process EVERY unanchored boundary
//    before seed (N3); an unverified one reaching projection is a fail-closed error.
//  - a subsumed node contributes no judgment (its frontier ancestor's flat read covers its subtree).
// Lists are display-bounded but carry AUTHORITATIVE totals — never a silent drop (run.ts:6469 pattern).
// This module builds the map→seed CONTRACT only; wiring it into the live reconstruct seed path (which
// preserves the existing flat leaf-read path, opt-in) is a later production cut (design §6, default-off).

export interface SemanticSeedBoundary {
  row: number;
  character_before: string;
  character_after: string;
  disposition: SeedBoundaryDisposition; // never "verified" — anchored corroborates LOCATION only (N2).
}

export interface SemanticSeedNode {
  node_ref: ComprehensionReduceRegion;
  semantic_summary: string;
  boundaries: SemanticSeedBoundary[];
}

/** An unanchored boundary the independent adversarial recheck REFUTED — disclosed (not silently
 *  dropped) and counted in the taint census, but excluded from the seed boundary set. */
export interface SemanticSeedRefutedDisclosure {
  node_ref: ComprehensionReduceRegion;
  row: number;
  character_before: string;
  character_after: string;
}

export interface SemanticSeedProjection {
  authority: "non_authoritative";
  provisional: true;
  nodes: SemanticSeedNode[];
  nodes_total: number; //                 AUTHORITATIVE — when nodes.length < nodes_total, the rest were bounded for size, not dropped.
  refuted_disclosure: SemanticSeedRefutedDisclosure[];
  refuted_disclosure_total: number; //    AUTHORITATIVE.
  unanchored_unverified_total: number; // taint census (the root's monotone count = the whole tree's).
}

export interface SeedProjectionOpts {
  /** Display bound for the nodes list; the total is always authoritative. Default: no bound. */
  maxNodes?: number;
  /** Display bound for the refuted disclosure list; the total is always authoritative. */
  maxDisclosure?: number;
}

const SPREADSHEET_SEED_CONSTRUCTORS: SeedProjectionConstructors<
  ComprehensionReduceRegion,
  SemanticBoundary,
  SemanticSeedBoundary,
  SemanticSeedNode,
  SemanticSeedRefutedDisclosure
> = {
  makeSeedBoundary: (b, disposition) => ({
    row: b.row,
    character_before: b.character_before,
    character_after: b.character_after,
    disposition,
  }),
  makeRefutedDisclosure: (region, b) => ({
    node_ref: { sheet: region.sheet, column_index: region.column_index, row_start: region.row_start, row_end: region.row_end },
    row: b.row,
    character_before: b.character_before,
    character_after: b.character_after,
  }),
  makeSeedNode: (region, summary, boundaries) => ({
    node_ref: { sheet: region.sheet, column_index: region.column_index, row_start: region.row_start, row_end: region.row_end },
    semantic_summary: summary,
    boundaries,
  }),
};

/** Project the accumulated semantic map into a bounded, honest seed input (§6). Pure / deterministic.
 *  ★INPUT CONTRACT (S4 code review): the map MUST be accumulated with seedBound=FALSE — refuted
 *  boundaries are RETAINED in semantic_boundaries so this projection is the sole place that excludes
 *  them (into refuted_disclosure). A seedBound=true map would hide refuted from the disclosure. The
 *  taint census is DERIVED from what the projection actually sees (refuted boundaries + failed/unread
 *  regions) — self-consistent with the disclosure, never trusting the map's own
 *  unanchored_unverified_count (which a caller could set to NaN / non-monotone). */
export function projectSemanticMapToSeed(
  map: ReadonlyMap<SemanticNodeKey, ComprehensionSemanticNode>,
  opts: SeedProjectionOpts = {},
): SemanticSeedProjection {
  return projectSemanticMapToSeedCore(SPREADSHEET_SEMANTIC_ADAPTER, SPREADSHEET_SEED_CONSTRUCTORS, map, opts);
}
