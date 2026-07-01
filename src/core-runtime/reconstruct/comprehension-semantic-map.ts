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

// ─────────────────────────────────────────────────────────────────────────────
// comprehension-semantic-map (Layer-2 · design 20260701-layer2-accumulated-semantic-channel §13) —
// the ACCUMULATED LLM semantic channel that rides ALONGSIDE the deterministic Layer-1 reduce skeleton
// (comprehension-reduce.ts) without touching its byte-stable ground. Each Layer-1 node gets one
// parallel semantic node; the LLM's judgment is provisional / non-authoritative and is EXCLUDED from
// the resume key (design §4). This module is the S1 DETERMINISTIC scaffolding — types + the two-sided
// boundary reconciliation + the recursive epoch contribution + the fail-closed validators. The LLM
// synthesis call itself (accumulateSemanticMap) is a later cut (S2, caller-injected callLlm).
//
// Honesty invariants ENFORCED here (not asserted in prose), each with a falsifiable negative control:
//  - N1/N2 (§13.3) reconcileBoundaries: a TWO-SIDED deterministic reconciliation over
//    (reduceNode value-shape seams, LLM boundaries). `anchored` corroborates a boundary's LOCATION
//    ONLY (verification='structural_location_only'); it NEVER verifies the LLM's character content. A
//    structural seam the LLM left uncovered is disclosed as `missed_by_llm` (NOT silently dropped;
//    NOT auto-flagged a lie — the owner-settled downweight rule, upstream §2.3). Matching is
//    exact-row-first then nearest-within-tolerance with a canonical tie-break (order-stable, codex-F3).
//  - N3/codex-F2 (§13.5) assertSemanticBoundaryHonesty: a fail-closed verification state machine —
//    anchored ⟺ structural_location_only; unanchored ∈ {unverified, adversarial_confirmed,
//    adversarial_refuted}; a seed-bound unanchored boundary MUST be adversarially processed and a
//    refuted boundary MUST NOT reach the seed boundary list.
//  - N4/§13.4 reduceNodeEpochContribution: the recursive resume contribution. NON-CIRCULAR by an
//    ALLOWLIST (assertPreImageKeysAllowlisted) — only deterministic fields may enter, so an LLM output
//    cannot gate its own reuse. This is its OWN concept with its OWN non-circular obligation, NOT an
//    extension of llmTouchFingerprint (whose type-level guarantee does not carry to a new function).
//  - N5/codex-F1 (§13.5) assertChildJudgmentCoverage: subsumed-aware child completeness.
//  - N6 (§13.5) assertTaintCensusMonotone: a parent may never understate accumulated unverified taint.
// ─────────────────────────────────────────────────────────────────────────────

// ── anchor / verification vocabulary ─────────────────────────────────────────

export type SemanticAnchorStatus = "anchored" | "unanchored";

export type SemanticVerificationStatus =
  | "structural_location_only" //  anchored: a value-shape seam co-locates. CONTENT is NOT verified.
  | "unverified" //                unanchored, pre-adversarial (transient; illegal at seed).
  | "adversarial_confirmed" //     unanchored, survived independent adversarial re-verify.
  | "adversarial_refuted"; //      unanchored, refuted — excluded from seed boundaries + counted taint.

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
export interface StructureBoundaryCoverage {
  boundary_ref: ComprehensionBoundaryWitness;
  status: "covered" | "missed_by_llm";
}

/** produced/unread/failed = the LLM read outcome (mirror LeafReadAttemptStatus); subsumed = below the
 *  accumulation frontier (§13.6) — a real skeleton node whose judgment its frontier ancestor absorbed. */
export type ReduceReadAttempt = "produced" | "unread" | "failed" | "subsumed";

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

// ── N1/N2 two-sided reconciliation ───────────────────────────────────────────

const VALUE_SHAPE = "value_shape" as const;

/** ±1: a value-shape seam spans last_prev_format_row / first_new_format_row (2 rows); ±1 covers that
 *  span without widening it (design §13.3). Exact-row match is preferred; tolerance is the fallback. */
export const ANCHOR_ROW_TOLERANCE = 1;

const cmpStr = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** Legal enum surfaces — the honesty validator is TOTAL over these (a value outside them is malformed
 *  and fails closed; review F2 / onto issue-001/007/009/014). */
const VALID_ANCHOR_STATUS = new Set<string>(["anchored", "unanchored"]);
const VALID_VERIFICATION = new Set<string>([
  "structural_location_only",
  "unverified",
  "adversarial_confirmed",
  "adversarial_refuted",
]);
const VALID_ADVERSARIAL_RESULT = new Set<string>(["adversarial_confirmed", "adversarial_refuted"]);

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

/** Two-sided deterministic reconciliation (design §13.3 / N1 / N2 / codex-F3). For a node's LLM
 *  boundaries and its Layer-1 value-shape seams, assign each boundary anchored|unanchored and record a
 *  covered|missed_by_llm status for EVERY seam. Matching is a 1:1 assignment (a seam anchors at most
 *  one boundary), exact-row first then nearest-within-tolerance, canonical-order tie-break — so dense
 *  seams cannot blanket-anchor every boundary (L2H-2) and the result is order-stable (codex-F3). */
export function reconcileBoundaries(
  raw: readonly RawSemanticBoundary[],
  reduceNode: Pick<ComprehensionReduceNode, "boundaries">,
): { boundaries: SemanticBoundary[]; coverage: StructureBoundaryCoverage[] } {
  const seams = reduceNode.boundaries.filter((b) => b.boundary_kind === VALUE_SHAPE).slice().sort(seamCmp);
  const seamMatched = seams.map(() => false);
  const matchedSeamOf = new Map<number, number>(); // raw index -> seam index

  // Canonical LLM-boundary order (row, then character tuple, then input index) so passes are stable.
  const order = raw
    .map((b, i) => ({ b, i }))
    .sort(
      (x, y) =>
        x.b.row - y.b.row ||
        cmpStr(x.b.character_before, y.b.character_before) ||
        cmpStr(x.b.character_after, y.b.character_after) ||
        x.i - y.i,
    );

  // Pass 1 — exact row (LLM row === seam.first_new_format_row). 1:1, canonical order.
  for (const { b, i } of order) {
    for (let si = 0; si < seams.length; si += 1) {
      const s = seams[si];
      if (!s || seamMatched[si]) continue;
      if (s.first_new_format_row === b.row) {
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
      const dist = Math.abs(s.first_new_format_row - b.row);
      if (dist <= ANCHOR_ROW_TOLERANCE && dist < bestDist) {
        bestDist = dist;
        bestSi = si;
      }
    }
    if (bestSi >= 0) {
      seamMatched[bestSi] = true;
      matchedSeamOf.set(i, bestSi);
    }
  }

  const boundaries: SemanticBoundary[] = raw.map((b, i) => {
    const anchored = matchedSeamOf.has(i);
    return {
      row: b.row,
      character_before: b.character_before,
      character_after: b.character_after,
      anchor_status: anchored ? "anchored" : "unanchored",
      verification: anchored ? "structural_location_only" : "unverified",
    };
  });
  const coverage: StructureBoundaryCoverage[] = seams.map((s, si) => ({
    boundary_ref: { ...s }, // clone so the returned coverage does not alias the reduce node's boundary (round-3 F3).
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
 *  parent re-derive on ANY descendant structural change EVEN WHEN the parent's own reduceNodeGroundHash
 *  is byte-identical (e.g. a non-lowest child's limiting_witness change — comprehension-reduce.ts keeps
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
 *  Symmetric with comprehension-reduce assertContiguousChildren. */
export function assertChildJudgmentCoverage(
  node: ComprehensionSemanticNode,
  expectedConsumedKeys: readonly SemanticNodeKey[],
): void {
  if (node.reduce_read_attempt === "subsumed") {
    if (node.consumed_child_judgment_keys.length > 0) {
      throw new Error(
        `comprehension-semantic-map: subsumed node ${reduceNodeKey(node.node_ref)} must consume no child judgments, has ${node.consumed_child_judgment_keys.length} (§13.5 codex-F1).`,
      );
    }
    return;
  }
  // Reject duplicate consumed keys BEFORE the set comparison (review F8 / onto issue-004): a Set
  // collapses ["k1","k1"] to {k1}, so a node consuming the same child twice would falsely satisfy
  // coverage against {k1}. A node consumes each child at most once.
  if (new Set(node.consumed_child_judgment_keys).size !== node.consumed_child_judgment_keys.length) {
    throw new Error(
      `comprehension-semantic-map: duplicate consumed child-judgment key at ${reduceNodeKey(node.node_ref)} (§13.5 N5 — each child is consumed once).`,
    );
  }
  const have = new Set(node.consumed_child_judgment_keys);
  const want = new Set(expectedConsumedKeys);
  const equal = have.size === want.size && [...want].every((k) => have.has(k));
  if (!equal) {
    throw new Error(
      `comprehension-semantic-map: child-judgment coverage mismatch at ${reduceNodeKey(node.node_ref)} — consumed {${[...have].sort().join(",")}} != expected {${[...want].sort().join(",")}} (§13.5 N5 completeness).`,
    );
  }
}

/** N3 / L2H-5 / codex-F2: the fail-closed verification state machine. Legal (anchor_status,
 *  verification) combinations, plus the seed-projection rule. `seedBound` = these boundaries are about
 *  to flow to the seed authoring input. Throws on the first illegal state. */
export function assertSemanticBoundaryHonesty(node: ComprehensionSemanticNode, seedBound: boolean): void {
  const at = (b: SemanticBoundary): string => `${reduceNodeKey(node.node_ref)}@row${b.row}`;
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
export function ownUnverifiedCount(node: ComprehensionSemanticNode): number {
  const boundaryUnverified = node.semantic_boundaries.filter(
    (b) => b.anchor_status === "unanchored" && b.verification !== "adversarial_confirmed",
  ).length;
  const attemptUnverified = node.reduce_read_attempt === "failed" || node.reduce_read_attempt === "unread" ? 1 : 0;
  return boundaryUnverified + attemptUnverified;
}

/** The canonical taint census value a node SHOULD carry (own + children). Callers set
 *  unanchored_unverified_count from this; the validator enforces the fail-closed direction. */
export function computeUnanchoredUnverifiedCount(
  node: ComprehensionSemanticNode,
  children: readonly ComprehensionSemanticNode[],
): number {
  return children.reduce((acc, c) => acc + c.unanchored_unverified_count, 0) + ownUnverifiedCount(node);
}

/** N6: taint monotone. A parent may never UNDERSTATE accumulated unverified taint (fail-closed,
 *  symmetric with assertHonestyFold). Over-reporting is allowed; understating throws. */
function assertSafeCount(label: string, n: number): void {
  // A non-finite / negative / non-integer count would defeat the monotone comparison (review F6: NaN <
  // x is false, so a NaN taint would pass silently). Require a safe non-negative integer.
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`comprehension-semantic-map: ${label} must be a non-negative safe integer, got ${n} (§13.5 N6 fail-closed).`);
  }
}

export function assertTaintCensusMonotone(
  node: ComprehensionSemanticNode,
  children: readonly ComprehensionSemanticNode[],
): void {
  assertSafeCount(`taint count at ${reduceNodeKey(node.node_ref)}`, node.unanchored_unverified_count);
  for (const c of children) assertSafeCount(`child taint count at ${reduceNodeKey(c.node_ref)}`, c.unanchored_unverified_count);
  const expectedMin = computeUnanchoredUnverifiedCount(node, children);
  if (node.unanchored_unverified_count < expectedMin) {
    throw new Error(
      `comprehension-semantic-map: taint census understated at ${reduceNodeKey(node.node_ref)} — ${node.unanchored_unverified_count} < ${expectedMin} (parent may not understate children + own unverified; §13.5 N6).`,
    );
  }
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

/** Caller-injected adversarial verifier for ONE unanchored boundary (N3: ALL unanchored are verified —
 *  it is the only check where structure is blind). An INDEPENDENT lens (distinct prompt/model in
 *  production). Returns confirmed | refuted. */
export type AdversarialVerifyFn = (input: {
  node_ref: ComprehensionReduceRegion;
  boundary: SemanticBoundary;
  summary: string;
}) => "adversarial_confirmed" | "adversarial_refuted";

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

/** Deterministic subtree LEAF count per node (the single over-context metric — NOT row-span or ground
 *  bytes; §13.6 codex-F5). Throws on a cyclic trace. */
export function computeSubtreeLeafCounts(trace: ReduceTopologyTrace): Map<SemanticNodeKey, number> {
  const counts = new Map<SemanticNodeKey, number>();
  const compute = (key: SemanticNodeKey, visiting: Set<SemanticNodeKey>): number => {
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
export function classifyFrontier(trace: ReduceTopologyTrace, overContextBudget: number): Map<SemanticNodeKey, FrontierMode> {
  // A leaf-count budget must be a real non-negative integer (review F4 / onto issue-001/005/007/…):
  // NaN/Infinity would silently collapse the frontier to the root instead of failing closed.
  if (!Number.isSafeInteger(overContextBudget) || overContextBudget < 0) {
    throw new Error(`comprehension-semantic-map: overContextBudget must be a non-negative safe integer (leaf count), got ${overContextBudget} (§13.6 fail-closed).`);
  }
  const leafCounts = computeSubtreeLeafCounts(trace);
  const mode = new Map<SemanticNodeKey, FrontierMode>();
  const shouldAccumulate = (key: SemanticNodeKey): boolean => {
    const tnode = trace.nodes.get(key);
    if (!tnode || tnode.child_keys.length === 0) return false; // a leaf never accumulates.
    const count = leafCounts.get(key); // every node was counted above; a miss is an impossible state.
    if (count === undefined) throw new Error(`comprehension-semantic-map: no leaf count for ${key} (impossible; §13.6).`);
    return count > overContextBudget;
  };
  const classify = (key: SemanticNodeKey, underFrontier: boolean): void => {
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
export function assertReduceTopologyIsTree(trace: ReduceTopologyTrace): void {
  // The declared root MUST name a real node (round-2: a missing root_key could pass when the node count
  // coincidentally matched the empty reached set).
  if (!trace.nodes.has(trace.root_key)) {
    throw new Error(`comprehension-semantic-map: root_key '${trace.root_key}' is not in the trace (§13.6 tree).`);
  }
  const indegree = new Map<SemanticNodeKey, number>();
  for (const [key, tnode] of trace.nodes) {
    // Each map key MUST equal reduceNodeKey(node_ref) (round-2: an alias key would let
    // consumed_child_judgment_keys diverge from the canonical child-summary keys).
    if (key !== reduceNodeKey(tnode.node_ref)) {
      throw new Error(`comprehension-semantic-map: trace key '${key}' != reduceNodeKey(node_ref) '${reduceNodeKey(tnode.node_ref)}' (§13.6 tree — keys must be canonical).`);
    }
    const seenChild = new Set<SemanticNodeKey>();
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
  const reached = new Set<SemanticNodeKey>();
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
export function assertSubsumedNodeEmpty(node: ComprehensionSemanticNode): void {
  if (node.reduce_read_attempt !== "subsumed") return;
  if (
    node.semantic_summary !== "" ||
    node.semantic_boundaries.length > 0 ||
    node.structure_boundary_coverage.length > 0 ||
    node.unanchored_unverified_count !== 0
  ) {
    throw new Error(`comprehension-semantic-map: subsumed node ${reduceNodeKey(node.node_ref)} must carry no judgment or taint (§13.6 — its frontier ancestor's read covers it).`);
  }
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

/** Walk the trace bottom-up, producing one validated ComprehensionSemanticNode per skeleton node. Each
 *  node: synthesize (caller LLM) → reconcileBoundaries (deterministic anchor/coverage) → verify EVERY
 *  unanchored boundary (N3) → recursive epoch contribution → taint census → assemble, with all three
 *  fail-closed validators enforced. Deterministic given a deterministic synthesize/verify (the mock). */
export function accumulateSemanticMap(
  trace: ReduceTopologyTrace,
  nodesByKey: ReadonlyMap<SemanticNodeKey, ComprehensionReduceNode>,
  opts: AccumulateSemanticMapOpts,
): Map<SemanticNodeKey, ComprehensionSemanticNode> {
  const result = new Map<SemanticNodeKey, ComprehensionSemanticNode>();
  const seedBound = opts.seedBound ?? false;
  const visiting = new Set<SemanticNodeKey>(); // cycle detection (review F5 / onto issue-003).
  assertReduceTopologyIsTree(trace); // reject DAG / diamond / duplicate edges before counting (review F2).
  const modes = classifyFrontier(trace, opts.overContextBudget); // S3 over-context partition (§13.6).
  // Round-3 F2: the RUNTIME owns the budget→epoch binding (do not trust the caller to fold the budget
  // into over_context_gate_config_sha256). A budget change reshapes the frontier partition and thus the
  // judgments, so fold the actual budget into the config sha here — a budget change always rotates the key.
  const preImageBase: Omit<SemanticEpochPreImage, "layer1_ground_hash" | "child_contributions"> = {
    ...opts.preImageBase,
    over_context_gate_config_sha256: createHash("sha256")
      .update(`${opts.preImageBase.over_context_gate_config_sha256}|over_context_budget=${opts.overContextBudget}`)
      .digest("hex"),
  };

  const visit = (key: SemanticNodeKey): ComprehensionSemanticNode => {
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
    // reduce node whose deterministic facts then feed synthesis/reconcile.
    if (reduceNodeKey(reduceNode.region) !== key || reduceNodeGroundHash(reduceNode) !== tnode.ground_hash) {
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
    const consumedChildren = children.filter((c) => modes.get(reduceNodeKey(c.node_ref)) !== "subsumed");

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
      const rr = tnode.node_ref;
      const node: ComprehensionSemanticNode = {
        node_ref: { sheet: rr.sheet, column_index: rr.column_index, row_start: rr.row_start, row_end: rr.row_end },
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
      assertSubsumedNodeEmpty(node);
      assertChildJudgmentCoverage(node, []);
      result.set(key, node);
      return node;
    }

    // FRONTIER = one flat read over the whole subtree (child_summaries omitted; children are subsumed).
    // ACCUMULATING = synthesize the (non-subsumed) children's judgments. Both are 'produced'.
    const isFrontier = mode === "frontier";
    const r = tnode.node_ref;
    const input: SemanticSynthesisInput = {
      // Clone the node_ref (review F3): the caller-injected synthesize gets a COPY, so it cannot mutate
      // the trace's node_ref and corrupt a later parent's child-summary keys.
      node_ref: { sheet: r.sheet, column_index: r.column_index, row_start: r.row_start, row_end: r.row_end },
      format_clusters: [...reduceNode.format_clusters],
      value_shape_seams: reduceNode.boundaries
        .filter((b) => b.boundary_kind === VALUE_SHAPE_KIND)
        .map((b) => ({ row: b.first_new_format_row, prev_shape: b.prev_shape, new_shape: b.new_shape })),
      child_summaries: isFrontier ? [] : consumedChildren.map((c) => ({ key: reduceNodeKey(c.node_ref), summary: c.semantic_summary })),
    };
    assertSynthesisInputBounded(input);
    const out = opts.synthesize(input);
    assertSynthesisOutputBounded(out); // round-2: validate the caller's OUTPUT, not just the input.

    const { boundaries: classified, coverage } = reconcileBoundaries(out.boundaries, reduceNode);
    // N3: verify EVERY unanchored boundary (structure is blind there). Anchored stay location-only.
    // The injected verifier's return is validated (review F2): a bogus status must fail closed here,
    // not slip into a seed-bound node.
    const verified: SemanticBoundary[] = classified.map((b) => {
      if (b.anchor_status !== "unanchored") return b;
      // Clone node_ref + boundary for the verifier too (round-2: F3 only cloned the synthesize input;
      // the verifier could mutate the live trace node_ref and corrupt later child-summary keys).
      const v = opts.verifyUnanchored({
        node_ref: { sheet: r.sheet, column_index: r.column_index, row_start: r.row_start, row_end: r.row_end },
        boundary: { ...b },
        summary: out.semantic_summary,
      });
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

    const node: ComprehensionSemanticNode = {
      node_ref: { sheet: r.sheet, column_index: r.column_index, row_start: r.row_start, row_end: r.row_end },
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
      computeUnanchoredUnverifiedCount(node, consumedChildren) + (seedBound ? refutedCount : 0);

    // Fail-closed validators (§13.5). expectedConsumedKeys = the non-subsumed children.
    assertChildJudgmentCoverage(node, consumedChildKeys);
    assertSemanticBoundaryHonesty(node, seedBound);
    assertTaintCensusMonotone(node, consumedChildren);

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
