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
 * no rung fits (extreme scale — the NAVIGATION IDENTITY alone exceeds budget: ids plus the per-row
 * absolute-path text that survives every rung, the multi-repo axis), it returns the coarsest rung with
 * `disclosure.over_budget = true`, and the caller's always-on byte guard turns that into an honest
 * fail-loud before dispatch.
 *
 * WIRED on BOTH count-scaling dispatch surfaces, behind the one opt-in
 * `reconstruct.execution.source_breadth_fold` (absent/off = today's flat projection, byte-identical):
 * the source-observation-directive's candidate catalog (PR-3) and the admission-selection's
 * admitted-outline catalog (PR-4a). The budget constant additionally backs the always-on byte guard on
 * both (PR-2), which stays ungated so an over_budget fold still fails loud pre-dispatch. Measured over
 * the real Stage-2 corpus, admission binds FIRST (~1.36 KB/unit → overflow at ~750 admitted files, vs
 * the directive's ~0.49 KB/observation → ~2,000); folding admission moves its ceiling to ~4,200, and the
 * PR-4b tail rungs move the directive's from 2,007 to 3,445 — so the DIRECTIVE is now the first-binding
 * surface. Beyond that band the per-row absolute-path text dominates (relative-path projection is the
 * measured next lever, not collapsing ids: design 20260723 §3.3 correction).
 */

/**
 * Ordered detail ladder, finest → coarsest. Every rung projects ALL N observations (breadth invariant);
 * the rungs differ only in per-observation DETAIL. The wiring (PR-3) maps each level to
 * `observationPromptPayload` options:
 *   full               → today's directive projection (code inventory at the 40_000 default)
 *   inventory_skeleton → same, with a tighter codeInventoryCharBudget (hierarchy→imports→spans demotion)
 *   one_line           → includeStructuralData:false → {observation_id, target_material_kind, source_ref,
 *                        location, summary} — the always-present semantic anchor, no spans/imports/excerpt
 *   summary_anchor     → one_line − `location` (PR-4b)
 *   anchor             → summary_anchor − `summary` (PR-4b): {observation_id, target_material_kind,
 *                        source_ref} — navigation identity only, the last rung before fail-loud
 *
 * The tail rungs are STRICT KEY SUBSETS of `one_line`, each of the next: one_line ⊃ summary_anchor ⊃
 * anchor, same rows, same order, same values. That is what makes the ladder's non-increasing invariant
 * (design DW-1f) STRUCTURAL rather than corpus-contingent — a rung built by a parallel row-builder could
 * measure larger than its parent on some corpus, which is exactly why the design's original
 * directory-rollup rung was rejected (measured 353.5 B/unit vs 302 for the rung above it at one file per
 * directory: a floor that is not always a floor).
 *
 * Field ORDER within the tail is measured, not guessed. On the real corpus `location` is byte-identical
 * to `source_ref` on 100% of rows (whole-file observations; region decomposition is default-off) yet
 * costs 142 B/row, while `summary` costs 55 B/row and is the LM's actual selection signal — the value
 * bench found `one_line` matching `full` at the same-rung noise floor while carrying only ref+summary
 * semantics. So the redundant-and-expensive field goes first and the informative-and-cheap field goes
 * last. Under region decomposition `location` stops being redundant (it becomes a short `L<a>-<b>` token,
 * the only thing distinguishing siblings of one file) but also stops being expensive; dropping it at
 * `summary_anchor` costs region NAVIGATION granularity at that rung, which is acceptable because the
 * catalog is navigation-only (ids are what get selected; evidence refs are minted from the STORED
 * observations) and because the alternative in this band is a hard dispatch failure.
 */
export type BreadthFoldLevel =
  | "full"
  | "inventory_skeleton"
  | "one_line"
  | "summary_anchor"
  | "anchor";

export const SOURCE_BREADTH_FOLD_LEVELS: readonly BreadthFoldLevel[] = [
  "full",
  "inventory_skeleton",
  "one_line",
  "summary_anchor",
  "anchor",
];

/** The rungs BELOW `one_line`, which are derived from its rows rather than re-projected (PR-4b). */
export type BreadthFoldTailLevel = Extract<BreadthFoldLevel, "summary_anchor" | "anchor">;

/**
 * Keys each tail rung KEEPS, as strict descending subsets of the `one_line` row. Declared here (not at
 * the call site) so the subset relation that makes DW-1f structural is stated once, in the module that
 * owns the ladder, and is directly assertable.
 */
export const SOURCE_BREADTH_FOLD_TAIL_RUNG_KEYS: Readonly<
  Record<BreadthFoldTailLevel, readonly string[]>
> = {
  summary_anchor: ["observation_id", "target_material_kind", "source_ref", "summary"],
  anchor: ["observation_id", "target_material_kind", "source_ref"],
};

/**
 * Project `one_line` rows down to a tail rung by DROPPING KEYS — never by rebuilding rows. Pure, total,
 * order-preserving, value-preserving: the result is the same rows with a subset of their keys, so it is
 * smaller than its input on every corpus (the structural basis of the ladder's non-increasing invariant).
 * Absent keys are skipped rather than emitted as null, so a row that never carried `summary` projects
 * identically at both tail rungs instead of gaining a key on the way down.
 */
export function projectBreadthFoldTailRung(
  oneLineRows: readonly unknown[],
  level: BreadthFoldTailLevel,
): unknown[] {
  const keep = SOURCE_BREADTH_FOLD_TAIL_RUNG_KEYS[level];
  return oneLineRows.map((row) => {
    const record = row as Record<string, unknown>;
    return Object.fromEntries(keep.filter((key) => key in record).map((key) => [key, record[key]]));
  });
}

/**
 * The codex worker's stdin input ceiling, in UTF-8 bytes: 1 MiB (2^20). Established by the value bench,
 * which observed a real codex rejection at 1,349,907 bytes against this limit (no literal in src — it is
 * codex-CLI-internal). A live-CLI binary-search probe could confirm the exact boundary (design 20260723
 * DW-2c); deferred because the guard budget below sits safely under it either way.
 */
export const CODEX_PROMPT_STDIN_BYTE_LIMIT = 1_048_576;

/**
 * Byte budget for a source-observation SELECTION prompt payload — shared by both count-scaling dispatch
 * surfaces (source-observation-directive AND source-admission-selection), which hit the same codex worker
 * stdin ceiling. Set a margin BELOW the ceiling because the measured payload (systemPrompt + userPrompt)
 * is not the whole dispatch: callCodexCli joins them with a "\n\n---\n\n" separator and codex adds its own
 * framing, so the guard must fire slightly before the raw ceiling. The margin (~8 KiB) keeps the guard
 * conservative — it only ever refuses payloads codex would ALSO reject (so every currently-succeeding run
 * stays byte-identical), while the narrow over-refusal band (codex-accepts-but-guard-refuses) fails loud
 * with a deterministic budget error rather than a codex opaque exit. The generic error text says "split
 * or reduce the projection"; for the DIRECTIVE surface the operator's concrete remedy is to enable
 * source_breadth_fold (this module's fold), which the directive runs BEFORE the guard. Tightenable via
 * the DW-2c probe.
 */
export const SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET = CODEX_PROMPT_STDIN_BYTE_LIMIT - 8_192;

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
