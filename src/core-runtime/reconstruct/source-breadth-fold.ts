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
 * surface. What binds beyond that band is the per-row absolute-path text, NOT the id list (ids alone
 * reach ~31,049: design 20260723 §3.3 correction). Root-relative refs are the obvious next lever and are
 * deliberately NOT taken here: their apparent payoff is an artifact of the bench corpus's 99-char temp
 * root. Re-measured across root lengths, relativizing on top of the anchor rung buys ~1.48× at a 99-char
 * root but only ~1.11× at a realistic 30-char one, and the multi-repo axis it is pitched for shortens the
 * shared root further — the margin approaches zero exactly where it would have to pay.
 */
import { CODEX_PROMPT_INPUT_CHAR_LIMIT } from "../llm/llm-caller.js";

/**
 * Ordered detail ladder, finest → coarsest. Every rung projects ALL N observations (breadth invariant);
 * the rungs differ only in per-observation DETAIL. The wiring (PR-3) maps each level to
 * `observationPromptPayload` options:
 *   full               → today's directive projection (code inventory at the 40_000 default)
 *   inventory_skeleton → same, with a tighter codeInventoryCharBudget (hierarchy→imports→spans demotion)
 *   one_line           → includeStructuralData:false → {observation_id, target_material_kind, source_ref,
 *                        location, summary} — the always-present semantic anchor, no spans/imports/excerpt
 *   summary_anchor     → one_line − REDUNDANT `location` (PR-4b)
 *   anchor             → summary_anchor − `summary` (PR-4b): {observation_id, target_material_kind,
 *                        source_ref, non-redundant `location`} — navigation identity only, the last
 *                        rung before fail-loud
 *
 * Each tail rung's row is a STRICT KEY SUBSET of its parent's, same order, same values: one_line ⊇
 * summary_anchor ⊇ anchor, strict on every row that carries the dropped key. That is what makes the
 * ladder's non-increasing invariant (design DW-1f) STRUCTURAL rather than corpus-contingent — a rung
 * built by a parallel row-builder is smaller than its parent only on corpora with the right shape,
 * which is why the design's original directory-rollup rung was rejected. Measured on ONE basis (1 file
 * per directory, `coarse-rung-candidates.mts`): rollup 353.5 B/unit sits ABOVE the anchor rung's 157.3,
 * so it cannot serve as a floor beneath the tail; and its cost swings with directory clustering
 * (353.5 → 251.2 B/unit from 1 to 8 files/dir, a 29% corpus-dependent move) where every derived rung is
 * clustering-invariant (157.3 → 156.4, 0.6%). Rollup IS smaller than `one_line` (452.2) — it was never
 * non-monotone against the pre-PR-4b ladder, only against the rungs that now sit below it.
 *
 * Field ORDER within the tail is measured, not guessed. On the real corpus `location` is byte-identical
 * to `source_ref` on 100% of rows (whole-file observations) yet costs 142 B/row, while `summary` costs
 * 55 B/row and is the LM's actual selection signal — the value bench found `one_line` indistinguishable
 * from `full` at the noise floor while carrying only ref+summary semantics. So the redundant-and-
 * expensive field goes first and the informative-and-cheap field goes last.
 *
 * `location` is dropped ONLY WHERE IT IS REDUNDANT (`location === source_ref`). Under region
 * decomposition it is not: N regions of one file share a `source_ref` and are told apart solely by a
 * short `L<a>-<b>` / `§<heading>` token, so a blanket drop would leave siblings differing only in
 * `observation_id` — the breadth invariant intact in FORM (every id still selectable) and destroyed in
 * SUBSTANCE (nothing left to select BY), with no id-count test able to notice. The redundancy predicate
 * costs nothing where the drop paid (whole-file rows, where the token IS the path) and keeps the cheap
 * token exactly where it carries the only signal. Per row the key set is still a subset of `one_line`'s,
 * so DW-1f stays structural.
 *
 * What the tail buys therefore depends on corpus SHAPE, and both numbers are measured (probe
 * `region-corpus-reach.mts`, N=2,000): on a whole-file corpus 454.2 → 303.5 → 248.2 B/row, a 1.83× reach
 * gain; on a region-decomposed one (8 regions/file, the `MAX_PROJECTED_REGIONS_PER_FILE` cap) 330.9 →
 * 330.9 → 275.6, only 1.20× — `summary_anchor` is a NO-OP there because nothing is redundant to drop, so
 * the whole gain comes from `anchor`. The ladder stays non-increasing either way; it just stalls a rung.
 * Do not quote the whole-file figure for a decomposed run.
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

/**
 * Ladder for the observation-catalog-tool surface (design 20260726 §6, stage 3a). Same rungs, same
 * order, same projector — it just STARTS at `one_line` instead of `full`.
 *
 * The two finer rungs are absent by design rather than by budget: in tool mode the prompt's job is
 * navigation (pick ids), and the detail those rungs carry is what the pull layer fetches on demand.
 * Pinning the start makes this prompt MORE deterministic than today's, where the rung is chosen by
 * whatever the corpus happens to measure. The tail rungs stay reachable so an extreme corpus demotes
 * instead of dropping observations, and `over_budget` at `anchor` is the pre-dispatch fail-loud
 * (design §6: "최소 anchor조차 안 들어가면 워커 기동 전에 실패한다").
 */
export const OBSERVATION_CATALOG_TOOL_FOLD_LEVELS: readonly BreadthFoldLevel[] = [
  "one_line",
  "summary_anchor",
  "anchor",
];

/** The rungs BELOW `one_line`, which are derived from its rows rather than re-projected (PR-4b). */
export type BreadthFoldTailLevel = Extract<BreadthFoldLevel, "summary_anchor" | "anchor">;

/**
 * Keys each tail rung KEEPS unconditionally, as strict descending subsets of the `one_line` row.
 * Declared here (not at the call site) so the subset relation that makes DW-1f structural is stated
 * once, in the module that owns the ladder, and is directly assertable. `location` is absent from both
 * lists because it is CONDITIONALLY kept — see `locationIsRedundantWithSourceRef`.
 */
export const SOURCE_BREADTH_FOLD_TAIL_RUNG_KEYS: Readonly<
  Record<BreadthFoldTailLevel, readonly string[]>
> = {
  summary_anchor: ["observation_id", "target_material_kind", "source_ref", "summary"],
  anchor: ["observation_id", "target_material_kind", "source_ref"],
};

/**
 * True when a row's `location` carries nothing its `source_ref` does not already say — the whole-file
 * case (100% of the measured corpus), where `location` IS the path and costs 142 B/row to repeat. False
 * for a region row, where `location` is the short token that tells siblings of one file apart; dropping
 * it there would collapse them to id-only. A missing `location` counts as redundant: there is nothing
 * to keep.
 */
function locationIsRedundantWithSourceRef(row: Record<string, unknown>): boolean {
  if (!("location" in row)) return true;
  return row.location === row.source_ref;
}

/**
 * What a rung costs the reader, in one clause, for the R2 disclosure. Lives here because the ladder
 * owns which keys each rung drops: a disclosure written at a call site drifts from the ladder the
 * moment a rung changes, and a cross-family review caught exactly that — one message that said
 * "summaries were dropped" for BOTH tail rungs, when `summary_anchor` keeps `summary` and drops only
 * a `location` that repeated `source_ref`. Total over BreadthFoldLevel so a new rung fails the
 * exhaustiveness test rather than silently reporting the fallback.
 */
export function breadthFoldRungDetailLoss(level: BreadthFoldLevel): string {
  switch (level) {
    case "full":
      return "no detail was dropped";
    case "inventory_skeleton":
      return "per-observation code inventory was tightened to a skeleton";
    case "one_line":
      return "per-observation structural detail was dropped";
    case "summary_anchor":
      return "per-observation `location` was dropped where it merely repeated `source_ref`";
    case "anchor":
      return "per-observation summaries were dropped — the catalog carries navigation identity only";
  }
}

/**
 * The navigation fields the DISPATCHED rows actually carry, for the prompt policy that describes them.
 *
 * Derived from the rows, not from the rung: `projectBreadthFoldTailRung` keeps `location` on any row
 * where it is NOT redundant with `source_ref` — every region row — so a rung-keyed field list is false
 * for a region corpus at `summary_anchor`/`anchor` (cross-family review, fourth round, after a
 * rung-keyed version replaced a fixed one that was false at `anchor`). A list read off the rows cannot
 * disagree with the rows.
 *
 * Keys render in canonical navigation order; anything unexpected is appended rather than dropped, so a
 * new key shows up in the contract instead of vanishing from it.
 */
export function navigationRowFieldsFromRows(rows: readonly unknown[]): string {
  const CANONICAL_ORDER = [
    "observation_id",
    "target_material_kind",
    "source_ref",
    "location",
    "summary",
  ];
  const present = new Set<string>();
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    for (const key of Object.keys(row as Record<string, unknown>)) present.add(key);
  }
  const ordered = [
    ...CANONICAL_ORDER.filter((key) => present.has(key)),
    ...[...present].filter((key) => !CANONICAL_ORDER.includes(key)).sort(),
  ];
  return ordered.join(", ");
}

/**
 * The FULL R2 disclosure sentence for the answer-support navigation catalog, as a pure function of the
 * disclosure. Assembled here rather than at the emit site so the emitted text IS this function's
 * output: a call site that invoked `breadthFoldRungDetailLoss` and then wrote its own sentence
 * satisfied every "wired" check while still saying the wrong thing (cross-family review, third round).
 * The rung's cost comes from {@link breadthFoldRungDetailLoss}, so it can never disagree with the
 * ladder.
 */
export function answerSupportFoldDisclosureMessage(
  disclosure: BreadthFoldDisclosure,
): string {
  return (
    `Runtime folded the answer-support navigation catalog to '${disclosure.fold_level}' detail ` +
    `(${disclosure.catalog_observation_count} observations, ` +
    `${disclosure.measured_prompt_bytes}/${disclosure.prompt_byte_budget} bytes) so every ` +
    `consumption-approved observation stayed selectable; ` +
    `${breadthFoldRungDetailLoss(disclosure.fold_level)} ` +
    "(retained in full in source-observations)."
  );
}

/**
 * Project `one_line` rows down to a tail rung by DROPPING KEYS — never by rebuilding rows. Pure, total,
 * order-preserving, value-preserving: each result row carries a subset of its input row's keys, so it is
 * never larger than its input (the structural basis of the ladder's non-increasing invariant). Absent
 * keys are skipped rather than emitted as null, so a row that never carried `summary` projects
 * identically at both tail rungs instead of gaining a key on the way down. `location` survives on rows
 * where it is not redundant with `source_ref`, so region siblings stay distinguishable at every rung.
 */
export function projectBreadthFoldTailRung(
  oneLineRows: readonly unknown[],
  level: BreadthFoldTailLevel,
): unknown[] {
  const keep = new Set(SOURCE_BREADTH_FOLD_TAIL_RUNG_KEYS[level]);
  return oneLineRows.map((row) => {
    const record = row as Record<string, unknown>;
    const keepLocation = !locationIsRedundantWithSourceRef(record);
    // Filter the ROW's own entries rather than rebuilding from the keep-list: the result is literally a
    // key-filtered copy, so key ORDER is the parent's too and "same rows, subset of keys" needs no proof.
    return Object.fromEntries(
      Object.entries(record).filter(
        ([key]) => keep.has(key) || (key === "location" && keepLocation),
      ),
    );
  });
}

/**
 * The codex worker's stdin input ceiling: 1 MiB (2^20). Single-sourced from the codex adapter, which
 * owns the provider's contract and enforces it as the total-size backstop on every dispatch.
 *
 * UNIT CORRECTION (2026-07-26, measured): the provider counts CHARACTERS, not UTF-8 bytes — its raw
 * rejection payload is `{"max_chars":1048576,"actual_chars":1361154}`. The earlier note here recorded
 * the bench's observed count as bytes; for the ASCII source corpora measured so far the two coincide,
 * which is why the misattribution was invisible. Re-exported under the historical name because this
 * module's budget below is deliberately BYTE-counted (see there).
 */
export const CODEX_PROMPT_STDIN_BYTE_LIMIT = CODEX_PROMPT_INPUT_CHAR_LIMIT;

/**
 * Byte budget for a source-observation SELECTION prompt payload — shared by both count-scaling dispatch
 * surfaces (source-observation-directive AND source-admission-selection), which hit the same codex worker
 * stdin ceiling. Set a margin BELOW the ceiling because the measured payload (systemPrompt + userPrompt)
 * is not the whole dispatch: callCodexCli joins them with a "\n\n---\n\n" separator and codex adds its own
 * framing, so the guard must fire slightly before the raw ceiling. The margin (~8 KiB) keeps the guard
 * conservative, and the narrow over-refusal band (codex-accepts-but-guard-refuses) fails loud with a
 * deterministic budget error rather than a codex opaque exit.
 *
 * UNIT ASYMMETRY, measured (cross-family review, 2026-07-27): this budget counts UTF-8 BYTES while the
 * provider counts CHARACTERS, and UTF-8 bytes ≥ UTF-16 code units for every string. So on a multibyte-
 * heavy payload the guard can refuse something codex would accept — a reviewer constructed 2,661 anchor
 * rows with CJK paths measuring 1,040,549 bytes but only 614,796 characters. The direction is safe
 * (refuse-early, never admit-late) and ASCII corpora — every corpus measured so far — see byte == char,
 * which is why an earlier version of this note claimed the guard "only ever refuses payloads codex would
 * also reject". That claim is false for multibyte input; correcting the UNIT would change all three
 * surfaces that share this budget and is deliberately not done here. The generic error text says "split
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
  /**
   * Deterministic byte measurement of the FULL dispatch payload built around `projection`. A caller
   * whose payload DESCRIBES the rows (a policy block naming the fields they carry) derives that text
   * from `projection` here, so what is measured is what is dispatched.
   */
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
