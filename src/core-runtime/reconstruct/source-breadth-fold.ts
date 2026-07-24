/**
 * Deterministic recursive observation — projection-layer breadth fold (design 20260723).
 *
 * The source-observation-directive projects the PRE-SELECTION candidate catalog (every available
 * observation across ALL files) so the selecting LLM can pick ≤64. Per-file caps exist, but the product
 * over the FILE-COUNT axis is unbounded — a large corpus overflows the codex worker's input limit
 * (measured: 59 files → 1,349,907 bytes > ~1,048,576). This module folds the catalog projection down to
 * the FINEST detail rung that fits the byte budget, WITHOUT dropping any file: breadth is preserved by
 * demoting per-observation DETAIL, never by removing observations.
 *
 * PURE + TOTAL. This module owns only the fold DECISION (pick the finest fitting rung). The actual
 * projection at each rung and the byte measurement are INJECTED (projectAtLevel / measure) so the module
 * has zero coupling to run.ts internals (no circular import) and is trivially unit-testable. It mints and
 * mutates NO observations — the fold changes only the prompt VIEW, so every provenance/determinism
 * invariant (observation identity, evidence-ref location_mismatch, whole-file content_sha256, reuse/delta
 * hashes, source-safety authority, the zero-observation gate) is preserved by construction.
 *
 * It never throws for a content reason (mirrors projectCodeInventoryForPrompt's pure/total contract): when
 * no rung fits (extreme scale — the available-observation-id index itself exceeds budget, i.e. the
 * multi-repo axis), it returns the coarsest rung with `disclosure.over_budget = true`, and the caller's
 * always-on byte guard turns that into an honest fail-loud before dispatch.
 *
 * INERT until wired (PR-2 always-on guard; PR-3 opt-in `source_breadth_fold`). Nothing in the pipeline
 * calls this module yet.
 */

/**
 * Ordered detail ladder, finest → coarsest. Every rung projects ALL N observations (breadth invariant);
 * the rungs differ only in per-observation DETAIL. The wiring (PR-3) maps each level to
 * `observationPromptPayload` options:
 *   full               → today's directive projection (code inventory at the 40_000 default)
 *   inventory_skeleton → same, with a tighter codeInventoryCharBudget (hierarchy→imports→spans demotion)
 *   one_line           → includeStructuralData:false → {observation_id, target_material_kind, source_ref,
 *                        location, summary} — the always-present semantic anchor, no spans/imports/excerpt
 */
export type BreadthFoldLevel = "full" | "inventory_skeleton" | "one_line";

export const SOURCE_BREADTH_FOLD_LEVELS: readonly BreadthFoldLevel[] = [
  "full",
  "inventory_skeleton",
  "one_line",
];

/**
 * Byte budget for the source-observation-directive prompt payload. PRELIMINARY — set below codex's
 * effective stdin limit (measured rejection at 1,349,907 bytes; codex-internal ceiling ~1,048,576, no
 * literal in src). Pinned empirically against the installed codex CLI when the guard is wired (PR-2,
 * done-when DW-2c). Conservative so the guard only refuses payloads codex would also reject.
 */
export const SOURCE_OBSERVATION_DIRECTIVE_PROMPT_BYTE_BUDGET = 1_000_000;

/**
 * Per-observation code_structure_inventory ceiling (chars) for the inventory_skeleton rung. PRELIMINARY /
 * tunable — the ≤-budget GUARANTEE lives in the coarsest rung + the always-on guard, not this value.
 */
export const SOURCE_BREADTH_FOLD_SKELETON_INVENTORY_CHAR_BUDGET = 4_000;

export interface BreadthFoldDisclosure {
  /** The rung actually chosen (finest that fit; coarsest when nothing fit). */
  fold_level: BreadthFoldLevel;
  /** N — every catalog observation stays projected & selectable at every rung. */
  catalog_observation_count: number;
  /** Measured serialized payload size (bytes) at the chosen rung. */
  measured_prompt_bytes: number;
  prompt_byte_budget: number;
  /** Finer rungs tried and rejected before the chosen one (honesty; R2 disclosure). */
  finer_levels_over_budget: BreadthFoldLevel[];
  /** True iff even the coarsest rung exceeded budget (caller must fail-loud via the always-on guard). */
  over_budget: boolean;
}

export interface BreadthFoldProjection {
  level: BreadthFoldLevel;
  /** Value for userPayload.source_observations at the chosen rung. */
  projection: unknown[];
  disclosure: BreadthFoldDisclosure;
}

export interface FoldObservationsToBudgetArgs {
  /** Byte budget the measured payload must fit under (inclusive). */
  budget: number;
  /** N — carried into disclosure; the module does not recount. */
  catalogObservationCount: number;
  /** Deterministic projection of the catalog at a given rung (all N observations, demoted detail). */
  projectAtLevel: (level: BreadthFoldLevel) => unknown[];
  /** Deterministic byte measurement of the FULL dispatch payload built around `projection`. */
  measure: (projection: unknown[]) => number;
  /** Override the ladder (tests / future rungs). Defaults to SOURCE_BREADTH_FOLD_LEVELS. */
  levels?: readonly BreadthFoldLevel[];
}

/**
 * Select the finest rung whose measured payload ≤ budget. Deterministic pure function of its args:
 * same (budget, projectAtLevel, measure, levels) → same result. The ladder is evaluated finest → coarsest
 * and the first fitting rung wins; when none fit, the coarsest rung is returned with over_budget set.
 * Throws only on the programmer error of an empty ladder (not a content reason).
 */
export function foldObservationsToBudget(
  args: FoldObservationsToBudgetArgs,
): BreadthFoldProjection {
  const levels = args.levels ?? SOURCE_BREADTH_FOLD_LEVELS;
  if (levels.length === 0) {
    throw new Error("foldObservationsToBudget requires at least one fold level");
  }
  const triedOverBudget: BreadthFoldLevel[] = [];
  let coarsest: { level: BreadthFoldLevel; projection: unknown[]; measured: number } | null = null;
  for (const level of levels) {
    const projection = args.projectAtLevel(level);
    const measured = args.measure(projection);
    coarsest = { level, projection, measured };
    if (measured <= args.budget) {
      return {
        level,
        projection,
        disclosure: {
          fold_level: level,
          catalog_observation_count: args.catalogObservationCount,
          measured_prompt_bytes: measured,
          prompt_byte_budget: args.budget,
          finer_levels_over_budget: [...triedOverBudget],
          over_budget: false,
        },
      };
    }
    triedOverBudget.push(level);
  }
  // No rung fit. Return the coarsest attempt; the caller's always-on byte guard fails loud honestly.
  const chosen = coarsest as { level: BreadthFoldLevel; projection: unknown[]; measured: number };
  return {
    level: chosen.level,
    projection: chosen.projection,
    disclosure: {
      fold_level: chosen.level,
      catalog_observation_count: args.catalogObservationCount,
      measured_prompt_bytes: chosen.measured,
      prompt_byte_budget: args.budget,
      // Every rung finer than the coarsest overflowed (triedOverBudget holds all levels; drop the last).
      finer_levels_over_budget: triedOverBudget.slice(0, -1),
      over_budget: true,
    },
  };
}
