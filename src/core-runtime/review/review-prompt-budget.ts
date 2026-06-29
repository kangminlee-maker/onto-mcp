/**
 * Stage 1 — window-proportional review prompt budget.
 *
 * The SINGLE (route, registry) → window → multiplier → budgets conversion point
 * for the review pipeline, mirroring reconstruct's
 * `deriveDocumentExcerptProjectionBudget` (reconstruct-api.ts:703-716). Two
 * consumers share the one multiplier:
 *   1. the embed line budget (`deriveReviewMaxEmbedLines`) — the TRUE binding cut
 *      applied to the packet embed, generic across material kinds; and
 *   2. the spreadsheet inventory prompt caps (`deriveWorkbookInventoryPromptCaps`
 *      in spreadsheet-structure-observer.ts) — sized in tandem so a larger embed
 *      budget has more structural detail to embed.
 *
 * No model literal ever reaches the tuning constants (INV-CFG-1): the only model
 * input is the registry-resolved context-window NUMBER. Any unresolved /
 * missing-window path returns undefined → multiplier 1 → DEFAULT budgets, so a
 * model-unaware or small-window run is byte-identical to today (no regression).
 *
 * The window/multiplier/ceiling constants are PRELIMINARY: the floor guarantees
 * no regression, but the "how much to grow" values are a live calibration
 * follow-up per INV-BENCH-1 (decided only with fixtures >= 2 x runs >= 3).
 */
import type {
  ResolvedReviewExecutionSettings,
  ReviewLlmRef,
} from "../discovery/settings-chain.js";
import { REVIEW_EXECUTION_UNIT_IDS } from "../discovery/settings-chain.js";
import type { SupportedModelRegistry } from "../discovery/supported-models.js";
import { reviewExecutionUnitActor } from "./review-execution-profile.js";

/**
 * Reference context window (tokens) that maps to multiplier 1 — the smallest
 * window that still earns the DEFAULT (unchanged) budget. A window at or below
 * this floors to multiplier 1. PRELIMINARY (INV-BENCH-1).
 */
export const BASELINE_WINDOW_TOKENS = 200_000;

/**
 * The fixed embed line budget applied to a packet embed when no window-scaled
 * value is resolved — the no-regression floor and the single source of this
 * value, shared by the prepare-time budget resolution and the packet stage's
 * fallback. (Unchanged from the historical packet-stage default of 300.)
 */
export const DEFAULT_MAX_EMBED_LINES = 300;

/**
 * Hard ceiling on the window multiplier, so an arbitrarily large window cannot
 * blow up the prompt budget without bound. PRELIMINARY (INV-BENCH-1).
 */
export const MAX_WINDOW_MULTIPLIER = 4;

/**
 * Convert a resolved context window (tokens) into a budget multiplier.
 * undefined (unresolved model / no registered window) → 1 (no regression).
 * Otherwise clamp(window / BASELINE_WINDOW_TOKENS, 1, MAX_WINDOW_MULTIPLIER) —
 * floored at 1 so a small-window model is never penalised below DEFAULT, and
 * ceilinged at MAX so a huge window cannot grow the budget without bound.
 */
export function reviewWindowMultiplier(
  contextWindowTokens: number | undefined,
): number {
  if (contextWindowTokens === undefined) return 1;
  return Math.min(
    Math.max(contextWindowTokens / BASELINE_WINDOW_TOKENS, 1),
    MAX_WINDOW_MULTIPLIER,
  );
}

/**
 * Window-proportional embed line budget — the true binding cut applied to the
 * packet embed (`truncateForEmbedding`). Floored at `defaultMaxEmbedLines` so
 * multiplier 1 returns the unchanged DEFAULT (no regression), and ceilinged at
 * `defaultMaxEmbedLines * MAX_WINDOW_MULTIPLIER`.
 */
export function deriveReviewMaxEmbedLines(
  multiplier: number,
  defaultMaxEmbedLines: number,
): number {
  return Math.min(
    Math.max(
      Math.round(defaultMaxEmbedLines * multiplier),
      defaultMaxEmbedLines,
    ),
    defaultMaxEmbedLines * MAX_WINDOW_MULTIPLIER,
  );
}

/** Merge an actor llm ref with an optional unit override (override wins per
 * field), the same shallow merge the execution-profile resolver uses. Returns
 * undefined only when both are absent. */
function mergeLensLlmRef(
  base: ReviewLlmRef | undefined,
  override: ReviewLlmRef | undefined,
): ReviewLlmRef | undefined {
  if (!base && !override) return undefined;
  return { ...(base ?? {}), ...(override ?? {}) };
}

/** Look up the registered context window (tokens) for a resolved lens llm ref.
 * The registry key is the MODEL provider + model id (e.g. openai/gpt-5.5), NOT
 * the runtime execution adapter (codex_cli / claude_code). An unresolved
 * provider or model, an unregistered pair, or an entry without a window all
 * yield undefined. */
function resolveLlmRefWindowTokens(
  llm: ReviewLlmRef | undefined,
  registry: SupportedModelRegistry,
): number | undefined {
  const provider = llm?.provider;
  const modelId = llm?.model;
  if (!provider || !modelId) return undefined;
  return registry.supported_models.find(
    (entry) => entry.provider === provider && entry.model === modelId,
  )?.context_window_tokens;
}

/**
 * Resolve the lens model's context window (tokens) for the review prompt budget.
 *
 * All lenses share the single "lens" actor model, so the common path resolves
 * that one representative (`execution.lens.llm`). When a lens-CLASS unit override
 * (a unit whose actor is "lens": lens / issue_stance_response /
 * deliberation_response) selects a different model, every such effective lens
 * model is resolved and the MINIMUM window is taken — the min can never overflow
 * any lens, so the budget stays safe for the smallest-window lens (the floor
 * keeps it conservative).
 *
 * Returns undefined when no lens model resolves to a registered window, so the
 * caller falls through to multiplier 1 → DEFAULT budgets (no regression). Never
 * throws.
 */
export function resolveReviewLensContextWindowTokens(
  execution: ResolvedReviewExecutionSettings,
  registry: SupportedModelRegistry,
): number | undefined {
  const lensActorLlm = execution.lens.llm;
  const windows: number[] = [];

  const baseWindow = resolveLlmRefWindowTokens(lensActorLlm, registry);
  if (baseWindow !== undefined) windows.push(baseWindow);

  for (const unitId of REVIEW_EXECUTION_UNIT_IDS) {
    if (reviewExecutionUnitActor(unitId) !== "lens") continue;
    const override = execution.units[unitId]?.llm;
    if (!override) continue;
    const effective = mergeLensLlmRef(lensActorLlm, override);
    const window = resolveLlmRefWindowTokens(effective, registry);
    if (window !== undefined) windows.push(window);
  }

  if (windows.length === 0) return undefined;
  return Math.min(...windows);
}
