import { createHash } from "node:crypto";
import {
  reduceNodeKey,
  type ComprehensionReduceNode,
  type ComprehensionReduceRegion,
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

/** Canonical total order over value-shape seams (deterministic iteration + tie-break). */
function seamCmp(a: ComprehensionBoundaryWitness, b: ComprehensionBoundaryWitness): number {
  return (
    a.first_new_format_row - b.first_new_format_row ||
    a.last_prev_format_row - b.last_prev_format_row ||
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
    boundary_ref: s,
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
    if (!(k in pre)) {
      throw new Error(`comprehension-semantic-map: epoch pre-image missing required key '${k}' (§13.4).`);
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
 *  is sorted so sibling order does not perturb the key (grouping-invariance). */
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
export function assertTaintCensusMonotone(
  node: ComprehensionSemanticNode,
  children: readonly ComprehensionSemanticNode[],
): void {
  const expectedMin = computeUnanchoredUnverifiedCount(node, children);
  if (node.unanchored_unverified_count < expectedMin) {
    throw new Error(
      `comprehension-semantic-map: taint census understated at ${reduceNodeKey(node.node_ref)} — ${node.unanchored_unverified_count} < ${expectedMin} (parent may not understate children + own unverified; §13.5 N6).`,
    );
  }
}
