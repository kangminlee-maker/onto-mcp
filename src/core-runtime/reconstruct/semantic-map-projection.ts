/**
 * Semantic-map projection vocabulary — the names the stage, the author contract, and the run
 * orchestrator must agree on before any of them can talk about a projection.
 *
 * Which artifact kinds the stage can route (DD7), the per-kind prompt-render budgets whose values
 * fold into the code observation fingerprint (DD10), and the per-observation projection union
 * itself. Kept apart from both the stage that produces projections and the contract that consumes
 * them, so neither has to import the other.
 */
import type { CodeSemanticSeedProjection } from "./comprehension-semantic-map-code.js";
import type { SemanticSeedProjection } from "./comprehension-semantic-map.js";

/** The semantic-map artifact kinds the stage can route in Phase 1 (multi-artifact design DD7). */
export const SEMANTIC_MAP_ROUTABLE_KINDS = ["spreadsheet", "code"] as const;

export type SemanticMapArtifactKind = (typeof SEMANTIC_MAP_ROUTABLE_KINDS)[number];

/** ⚠️ PRELIMINARY prompt-render budget (chars) for one SPREADSHEET observation's semantic-map
 *  render. Changing it changes prompt-visible content — bump SEMANTIC_MAP_PROJECTION_CONTRACT_
 *  VERSION with it (X9). CODE renders use the per-kind constant below (DD10 — never this one). */
export const SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET = 4000;

/** DD10: CODE render budget — 40,000 chars ≈ 65 admitted nodes on the N=1 target (spreadsheet
 *  4,000 불변; the v1 shared budget admitted 4/109 nodes on the live N=1 — 기아).
 *  ⚠️ CORRECTED 2026-07-19 (§10 addendum 개정 v2.2): the pinned 12,000 realized the design's stated
 *  "40~60 nodes" intent from a per-node cost estimate of ~81 chars (relative-label savings only),
 *  but the no-spend ablation measured ~850 chars/node (region label + up to a 600-char summary +
 *  boundaries + JSON indentation), so 12,000 admitted only 12 nodes — below the reevaluation
 *  validity floor (admit ≥30). Empirical budget→admit curve (ablation): 24,000→30, 40,000→65,
 *  64,000→109(no truncation). Owner decision 2026-07-19: 40,000 (design's 40~60-node intent,
 *  faithfully realized). The value folds by VALUE into semanticMapCodeObservationFingerprint. */
export const CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET = 40_000;

/** Step 6 (DD9): the per-observation projection union — spreadsheet or code, discriminated by the
 *  node_ref shape (and, on artifact rows, by the sidecar's target_material_kind). */
export type SemanticMapAnyProjection = SemanticSeedProjection | CodeSemanticSeedProjection;
