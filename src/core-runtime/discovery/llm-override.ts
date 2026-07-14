import type { LlmModelSwitcherConfig } from "../llm/model-switcher.js";
import {
  PerCallLlmOverrideSchema,
  RECONSTRUCT_ACTOR_KEYS,
  REVIEW_EXECUTION_UNIT_IDS,
  type OntoSettings,
  type PerCallLlmOverride,
} from "./settings-chain.js";

/**
 * Per-call LLM override overlay (design v4 §2.2). A `PerCallLlmOverride` is an
 * ephemeral settings-`llm` edit applied to the resolved {@link OntoSettings}
 * for ONE review/reconstruct invocation, after which the existing pipeline runs
 * unchanged. These helpers are PURE and IMMUTABLE: they never mutate the input
 * settings, and an absent/empty override is the IDENTITY (returns the same
 * object reference), which is what makes the default-off path byte-identical.
 *
 * Per-block semantics:
 * - `override.provider` present → REPLACE: the block becomes `{...override}`.
 *   The switched-in provider's transport (base_url/api_key_env/service_tier/
 *   timeout_ms) resolves fresh from model-switcher defaults; the old provider's
 *   transport MUST NOT leak, so the previous block is dropped entirely. The
 *   override schema excludes transport/credential fields, so a plain copy is
 *   already transport-clean.
 * - `override.provider` absent → field-OVERLAY: `{...block, ...override}` — only
 *   the named fields (effort/model/service_tier/auth) win over the existing
 *   same-provider block.
 */

function isEmptyOverride(override: PerCallLlmOverride): boolean {
  return Object.keys(override).length === 0;
}

/**
 * Parse a per-call override serialized as a single `--llm-override <json>` CLI
 * arg back into a validated {@link PerCallLlmOverride}. The review pipeline
 * crosses a process/argv boundary, so the override is JSON-serialized by the API
 * seam and re-materialized (+ shape-revalidated via the canonical schema) at
 * each settings-resolution seam that must apply it. Absent/empty → undefined
 * (identity). Throws on malformed JSON or a shape violation (fail-loud).
 */
export function parsePerCallLlmOverrideArg(
  raw: string | undefined,
): PerCallLlmOverride | undefined {
  if (raw === undefined || raw.length === 0) return undefined;
  return PerCallLlmOverrideSchema.parse(JSON.parse(raw));
}

/** Core per-`llm`-block override (REPLACE vs field-OVERLAY). */
function applyLlmBlockOverride(
  block: LlmModelSwitcherConfig,
  override: PerCallLlmOverride,
): LlmModelSwitcherConfig {
  if (override.provider !== undefined) {
    // REPLACE (provider switch): drop the old block so no stale transport
    // (base_url/api_key_env/service_tier/timeout_ms) leaks into the new
    // provider. override carries only {provider, auth?, model?, effort?,
    // service_tier?}, so the copy is transport-clean by construction.
    return { ...override };
  }
  // OVERLAY (same provider): only the named fields win.
  return { ...block, ...override };
}

// ── review scope ──────────────────────────────────────────────────────────

const REVIEW_ACTOR_KEYS = ["teamlead", "lens", "synthesize"] as const;

/**
 * Apply a per-call override to the review dispatch seats of `settings`
 * (design v4 §2.2). Overlays every configured actor llm
 * (`review.execution.{teamlead,lens,synthesize}.llm`) and every configured unit
 * llm (`review.execution.units[id].llm`), plus the salvage transcription model.
 * Actors/units WITHOUT an explicit llm are left untouched (their inheritance is
 * unchanged). In REPLACE mode each unit's own llm is DROPPED so it inherits the
 * replaced actor rather than keeping a stale unit model.
 */
export function applyReviewLlmOverride(
  settings: OntoSettings,
  override: PerCallLlmOverride | undefined,
): OntoSettings {
  if (!override || isEmptyOverride(override)) return settings; // IDENTITY
  const execution = settings.review?.execution;
  if (!execution) return settings;

  const nextExecution = { ...execution };

  for (const actorKey of REVIEW_ACTOR_KEYS) {
    const actor = execution[actorKey];
    if (actor?.llm) {
      nextExecution[actorKey] = {
        ...actor,
        llm: applyLlmBlockOverride(actor.llm, override),
      };
    }
  }

  if (execution.units) {
    const nextUnits: NonNullable<typeof execution.units> = {};
    for (const unitId of REVIEW_EXECUTION_UNIT_IDS) {
      const unit = execution.units[unitId];
      if (!unit) continue;
      if (!unit.llm) {
        nextUnits[unitId] = unit;
        continue;
      }
      if (override.provider !== undefined) {
        // REPLACE: drop the unit's llm so it inherits the replaced actor
        // (no stale unit model on the old provider).
        const { llm: _dropped, ...rest } = unit;
        nextUnits[unitId] = rest;
      } else {
        nextUnits[unitId] = { ...unit, llm: { ...unit.llm, ...override } };
      }
    }
    nextExecution.units = nextUnits;
  }

  const transcription = execution.retry?.salvage?.transcription_llm;
  if (transcription) {
    nextExecution.retry = {
      ...execution.retry,
      salvage: {
        ...execution.retry?.salvage,
        transcription_llm: applySalvageTranscriptionOverride(
          transcription,
          override,
        ),
      },
    };
  }

  return {
    ...settings,
    review: { ...settings.review, execution: nextExecution },
  };
}

/**
 * Salvage transcription_llm has a RESTRICTED shape ({provider?: "anthropic" |
 * "openai"; model: string}) — it is a cheap-tier transcription model run by the
 * unit's OWN adapter, so only anthropic/openai are representable. Handle the
 * override defensively (v4 §9(a)): always safe to overlay the model; overlay the
 * provider only when the override provider is one salvage supports. A
 * grok/lmstudio override leaves salvage unchanged (salvage is opt-in /
 * default-off, so under-applying here can only fail closed, never dispatch an
 * unverified call). Never crashes on an incompatible provider.
 */
function applySalvageTranscriptionOverride(
  transcription: { provider?: "anthropic" | "openai" | undefined; model: string },
  override: PerCallLlmOverride,
): { provider?: "anthropic" | "openai" | undefined; model: string } {
  // A switch to a salvage-incompatible provider (grok/lmstudio) leaves salvage
  // ENTIRELY unchanged — the model would otherwise land on an anthropic/openai
  // route it does not belong to. Salvage is opt-in / default-off, so
  // under-applying here fails closed, never dispatches an unverified call.
  if (override.provider === "grok" || override.provider === "lmstudio") {
    return transcription;
  }
  const next = { ...transcription };
  if (override.model !== undefined) next.model = override.model;
  if (override.provider === "anthropic" || override.provider === "openai") {
    next.provider = override.provider;
  }
  return next;
}

// ── reconstruct scope ───────────────────────────────────────────────────────

/**
 * Apply a per-call override to the reconstruct dispatch seats of `settings`
 * (design v4 §2.2). Overlays the actor seats
 * (`reconstruct.execution.actors.{semantic_author,confirmation_provider,
 * semantic_map_synthesize}.llm`) with full REPLACE/OVERLAY semantics, and threads
 * the override EFFORT into the opt-in `dispatch_fallback.llm` (the faithful
 * replacement of the removed `llmEffort` pin).
 */
export function applyReconstructLlmOverride(
  settings: OntoSettings,
  override: PerCallLlmOverride | undefined,
): OntoSettings {
  if (!override || isEmptyOverride(override)) return settings; // IDENTITY
  const execution = settings.reconstruct?.execution;
  if (!execution) return settings;

  const nextExecution = { ...execution };

  if (execution.actors) {
    const nextActors = { ...execution.actors };
    for (const actorKey of RECONSTRUCT_ACTOR_KEYS) {
      const actor = execution.actors[actorKey];
      if (actor) {
        nextActors[actorKey] = {
          ...actor,
          llm: applyLlmBlockOverride(actor.llm, override),
        };
      }
    }
    nextExecution.actors = nextActors;
  }

  // dispatch_fallback.llm is a RESTRICTED, alternate-provider shape (requires
  // api_key_env; provider constrained to openai/anthropic; model is
  // provider-specific). It exists specifically to be a DIFFERENT provider than
  // the primary, so a per-call provider/model switch must NOT collapse it onto
  // the primary. Only the provider-agnostic EFFORT knob flows through — this is
  // exactly what the removed `llmEffort` pin used to apply here (v4 §6(a)).
  if (execution.dispatch_fallback?.enabled === true && override.effort !== undefined) {
    nextExecution.dispatch_fallback = {
      ...execution.dispatch_fallback,
      llm: { ...execution.dispatch_fallback.llm, effort: override.effort },
    };
  }

  return {
    ...settings,
    reconstruct: { ...settings.reconstruct, execution: nextExecution },
  };
}
