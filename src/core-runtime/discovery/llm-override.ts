import {
  defaultAuthForProvider,
  type LlmModelSwitcherConfig,
} from "../llm/model-switcher.js";
import { reviewExecutionUnitActor } from "../review/review-execution-profile.js";
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
  const parsed = PerCallLlmOverrideSchema.parse(JSON.parse(raw));
  // An EMPTY override is semantically an omission. Canonicalize it to undefined
  // so every downstream truthiness check agrees: otherwise the overlay treats
  // `{}` as identity while a `if (llmOverride)` gate still fires, making `{}`
  // observably different from omission (breaking the default-off guarantee).
  return isEmptyOverride(parsed) ? undefined : parsed;
}

/**
 * Route identity of a block AFTER an override. Compared by EFFECTIVE value, not
 * by field presence: an override may legitimately restate the current
 * provider/auth just to change the model, and that is NOT a route change — so it
 * must keep the block's route-scoped transport (api_key_env/base_url/
 * service_tier) and any provider-scoped runtime settings.
 */
function effectiveRoute(
  block: LlmModelSwitcherConfig,
  override: PerCallLlmOverride,
): { providerChanged: boolean; authChanged: boolean } {
  // Compare the DEFAULTED auth, not the raw field: a block that omits `auth`
  // still dispatches on `defaultAuthForProvider(provider)` (anthropic/grok →
  // api_key, openai → oauth, lmstudio → local). Comparing the raw undefined
  // would read an override that merely restates that effective auth as a switch
  // and discard the block's still-valid transport (api_key_env/base_url).
  const blockAuth =
    block.auth ??
    (block.provider !== undefined ? defaultAuthForProvider(block.provider) : undefined);
  return {
    providerChanged: (override.provider ?? block.provider) !== block.provider,
    authChanged: (override.auth ?? blockAuth) !== blockAuth,
  };
}

/** Whether an override changes the block's ROUTE identity (provider or auth). */
function overrideChangesRoute(
  block: LlmModelSwitcherConfig,
  override: PerCallLlmOverride,
): boolean {
  const { providerChanged, authChanged } = effectiveRoute(block, override);
  return providerChanged || authChanged;
}

/**
 * Core per-`llm`-block override (REPLACE vs route-cleaned vs field-OVERLAY).
 *
 * `routeBasis` is the block whose ROUTE identity the decision is made on, which
 * is not always `block` itself: a review UNIT's llm is a PARTIAL block merged
 * over its default actor, so its route lives in the merged result. Judging a
 * provider-less unit on its own partial block would report a provider change for
 * every provider-bearing override (comparing against `undefined`). The override
 * is still APPLIED to `block` so the unit keeps its partial shape.
 */
function applyLlmBlockOverride(
  block: LlmModelSwitcherConfig,
  override: PerCallLlmOverride,
  routeBasis: LlmModelSwitcherConfig = block,
): LlmModelSwitcherConfig {
  const { providerChanged, authChanged } = effectiveRoute(routeBasis, override);
  if (providerChanged) {
    // REPLACE (provider switch): drop the old block so no stale transport
    // (base_url/api_key_env/service_tier/timeout_ms) leaks into the new
    // provider. override carries only {provider, auth?, model?, effort?,
    // service_tier?}, so the copy is transport-clean by construction.
    return { ...override };
  }
  if (authChanged) {
    // AUTH switch is ALSO a route switch (oauth ↔ api_key normalize to
    // different execution routes/adapters), so the previous route's scoped
    // fields must not survive: `service_tier` is openai+oauth-only (
    // normalizeLlmModelSwitcher rejects it on any other route) and
    // `api_key_env`/`base_url` belong to the direct-call routes. Keeping them
    // would turn an otherwise valid auth switch into a hard failure (or leak an
    // api-key endpoint into an OAuth route). The override may re-state
    // service_tier; base_url/api_key_env stay settings-owned by design.
    const {
      service_tier: _serviceTier,
      api_key_env: _apiKeyEnv,
      base_url: _baseUrl,
      ...routeAgnostic
    } = block;
    return { ...routeAgnostic, ...override };
  }
  // OVERLAY (same route — including an override that restates the current
  // provider/auth): only the named fields win; transport is preserved.
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
      // A unit's llm is a PARTIAL block that the runtime merges over its default
      // actor ({...actorLlm, ...unitLlm}), so the unit's real route is that
      // merge — judge the override against it, not against the partial block.
      const unitRouteBasis: LlmModelSwitcherConfig = {
        ...(execution[reviewExecutionUnitActor(unitId)]?.llm ?? {}),
        ...unit.llm,
      };
      if (effectiveRoute(unitRouteBasis, override).providerChanged) {
        // REPLACE: drop the unit's llm so it inherits the replaced actor
        // (no stale unit model on the old provider).
        const { llm: _dropped, ...rest } = unit;
        nextUnits[unitId] = rest;
      } else {
        // Units go through the SAME block rules as actors — a raw spread here
        // would keep the previous route's scoped fields (e.g. a unit's own
        // openai/oauth `service_tier` surviving an `auth: "api_key"` override),
        // so the unit route would be rejected even though the actor was cleaned.
        nextUnits[unitId] = {
          ...unit,
          llm: applyLlmBlockOverride(unit.llm, override, unitRouteBasis),
        };
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
 * unit's OWN adapter, so only anthropic/openai are representable. Overlay the
 * model always; overlay the provider only when salvage can express it.
 *
 * A grok/lmstudio override leaves the seat untouched, and that is INERT rather
 * than a mixed route: those providers resolve to the direct-call route, and the
 * runner only attempts salvage on a `claude_code`/`codex` worker executor (see
 * run-review-prompt-execution: `salvageAdapter === "claude_code" || "codex"`),
 * so salvage cannot dispatch there at all. This is also exactly what editing the
 * same provider into settings would do — the override is a settings overlay, so
 * it must not invent a stricter contract than the settings path has.
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
        const llm = applyLlmBlockOverride(actor.llm, override);
        // `llm_runtime` (openai Responses output headroom) is scoped to the
        // openai + api_key direct-call route, so it must NOT survive a route
        // change: reconstruct would apply openai-only headroom to the new route
        // and fail before dispatch, and the caller cannot clear it through
        // `llmOverride` (transport/runtime fields are settings-owned).
        nextActors[actorKey] = overrideChangesRoute(actor.llm, override)
          ? { llm }
          : { ...actor, llm };
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
