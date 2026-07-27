import {
  defaultAuthForProvider,
  type LlmModelSwitcherConfig,
} from "../llm/model-switcher.js";
import { reviewExecutionUnitActor } from "../review/review-execution-profile.js";
import {
  OntoSettingsValidationError,
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
 * Which seats an overlay actually REACHED, and which it dropped — the evidence
 * that a per-call override took effect.
 *
 * The overlay edits `llm` blocks that EXIST; a seat resolving by inheritance has
 * no block to land on (settings resolution is a pure projection and populates no
 * seat defaults), so an override can be applied to zero seats. Without this
 * report that outcome is indistinguishable from success: the call returns the
 * input settings and the run proceeds on whatever the unconfigured path
 * resolves to — for a caller that pinned a provider to obtain a cross-family
 * review, a family collapse reported as success. {@link
 * assertLlmOverrideReachedSeats} turns that into a fail-loud.
 *
 * `reached` records the blocks the overlay APPLIED the override to, not the ones
 * whose value changed: an override restating a seat's current value still landed
 * there. Only a genuinely skipped seat is absent (a seat with no `llm` block, or
 * a salvage transcription the switched-in provider cannot express).
 */
export interface LlmOverrideSeatReport {
  /**
   * PRIMARY dispatch seats the overlay applied the override to — the seats this
   * run actually reviews/reconstructs with (review actors + units, reconstruct
   * actors). This is the set the fail-closed guard counts.
   */
  readonly reached: readonly string[];
  /**
   * RECOVERY-ONLY seats the overlay reached (salvage transcription, reconstruct
   * dispatch_fallback). Deliberately NOT counted by the guard: they dispatch
   * only when a primary call already failed, so an override that reaches one of
   * them and nothing else has still not touched the route this run will use —
   * counting them would let a salvage-configured chain pass the guard while the
   * review runs on the unconfigured default (measured: a salvage-only reach
   * resolved to codex/codex with no model pin while the caller asked for
   * anthropic).
   */
  readonly recovery: readonly string[];
  /**
   * Review unit seats whose own `llm` the overlay DROPPED on a provider switch,
   * so they inherit the replaced actor instead of keeping a model that belongs
   * to the old provider. Their per-unit tuning (e.g. effort) is dropped with it.
   */
  readonly dropped: readonly string[];
}

/** The settings paths a user edits to give a scope's seats an `llm` block. */
const OVERRIDE_TARGET_SETTINGS_PATHS = {
  review: "review.execution.actors.{teamlead,lens,synthesize}.llm",
  reconstruct: `reconstruct.execution.actors.{${RECONSTRUCT_ACTOR_KEYS.join(",")}}.llm`,
} as const;

/**
 * Fail loud when an override reached NO seat. Deterministically decidable (a
 * count over the resolved settings), so it belongs in the capability surface as
 * a hard gate rather than in a caveat: an override that lands nowhere makes a
 * successful call mean nothing, and every downstream signal — including the
 * override-scoped supported-model gate — passes vacuously over the empty seat
 * set. Scoped to override-bearing runs, so a run without an override keeps its
 * existing behavior byte-identical.
 */
export function assertLlmOverrideReachedSeats(args: {
  scope: "review" | "reconstruct";
  report: LlmOverrideSeatReport;
  override: PerCallLlmOverride;
}): void {
  if (args.report.reached.length > 0) return;
  const targetPaths = OVERRIDE_TARGET_SETTINGS_PATHS[args.scope];
  const recovery = [...args.report.recovery];
  throw new OntoSettingsValidationError({
    message: [
      `llmOverride reached no ${args.scope} dispatch seat: this settings chain configures no \`llm\` block for the ${args.scope} seats, so the overlay had nothing to apply and the run would dispatch on the unconfigured default route instead of the requested one.`,
      ...(recovery.length > 0
        ? [
            `It did reach ${recovery.length} recovery-only seat(s) [${recovery.join(", ")}], which dispatch only after a primary call fails — that is not the route this run would use.`,
          ]
        : []),
      `Configure ${targetPaths} in .onto/settings.json (project or user), then retry.`,
    ].join("\n"),
    reasonCode: "llm_override_reached_no_seat",
    details: {
      override_scope: args.scope,
      requested_override: { ...args.override },
      reached_seats: [],
      recovery_only_seats: recovery,
      required_settings_paths: targetPaths,
    },
  });
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
  return canonicalizePerCallLlmOverride(PerCallLlmOverrideSchema.parse(JSON.parse(raw)));
}

/**
 * An EMPTY override is semantically an OMISSION, so it is canonicalized to
 * undefined at every admission seam. Every downstream truthiness check must
 * agree: the overlay treats `{}` as identity, so a surviving truthy `{}` fires
 * the override-only gates over a report that is empty by construction — which
 * now means the zero-reach guard rejects a request that expressed no override at
 * all. Both admission paths (the `--llm-override` argv seam and the Core API
 * entry) canonicalize through this one function so they cannot diverge.
 */
export function canonicalizePerCallLlmOverride(
  override: PerCallLlmOverride | undefined,
): PerCallLlmOverride | undefined {
  if (override === undefined) return undefined;
  return isEmptyOverride(override) ? undefined : override;
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
  // still dispatches on `defaultAuthForProvider(provider, block)` (the
  // subscription worker route unless the block names a credential env; grok →
  // api_key, lmstudio → local). Comparing the raw undefined would read an
  // override that merely restates that effective auth as a switch and discard
  // the block's still-valid transport (api_key_env/base_url). The whole block is
  // passed because its `api_key_env` participates in that default.
  const blockAuth =
    block.auth ??
    (block.provider !== undefined
      ? defaultAuthForProvider(block.provider, block)
      : undefined);
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
    // fields must not survive. The three are NOT one class:
    // - `service_tier` is openai+oauth-only (normalizeLlmModelSwitcher rejects
    //   it on any other route), so it never survives. The override may re-state it.
    // - `base_url` NEVER survives an auth switch. An endpoint that lay dormant
    //   on a worker route would otherwise be ACTIVATED by a caller who only
    //   asked to change auth: the direct-call path forwards it as
    //   `--llm-base-url` into `new OpenAI({apiKey, baseURL})`, so the seat's
    //   real credential would be sent to a settings-chosen host. The override
    //   schema excludes endpoints precisely so a per-call input cannot pick one;
    //   waking a dormant one is the same capability by another door.
    // - `api_key_env` is kept ONLY when the destination is a direct-call route,
    //   where it is the credential NAME that route needs. Dropping it there
    //   would silently fall back to the default variable and fail loud on a
    //   custom one; keeping it when switching TO oauth would carry api-key
    //   transport into a worker route, which is what this cleaning exists for.
    const destinationAuth = override.auth ?? routeBasis.auth;
    const destinationIsDirectCall =
      destinationAuth === "api_key" || destinationAuth === "local";
    const {
      service_tier: _serviceTier,
      base_url: _baseUrl,
      ...withCredentialEnv
    } = block;
    if (destinationIsDirectCall) return { ...withCredentialEnv, ...override };
    const { api_key_env: _apiKeyEnv, ...routeAgnostic } = withCredentialEnv;
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
  return applyReviewLlmOverrideWithReport(settings, override).settings;
}

/**
 * {@link applyReviewLlmOverride} plus the {@link LlmOverrideSeatReport} of the
 * same application — one implementation, so the report cannot disagree with what
 * the overlay did. Call sites that must fail closed on a zero-seat override (or
 * disclose the seats it reached) use this; the settings-only wrapper keeps every
 * other caller unchanged.
 */
export function applyReviewLlmOverrideWithReport(
  settings: OntoSettings,
  override: PerCallLlmOverride | undefined,
): { settings: OntoSettings; report: LlmOverrideSeatReport } {
  const reached: string[] = [];
  const recovery: string[] = [];
  const dropped: string[] = [];
  const report: LlmOverrideSeatReport = { reached, recovery, dropped };
  if (!override || isEmptyOverride(override)) return { settings, report }; // IDENTITY
  const execution = settings.review?.execution;
  if (!execution) return { settings, report };

  const nextExecution = { ...execution };

  for (const actorKey of REVIEW_ACTOR_KEYS) {
    const actor = execution[actorKey];
    if (actor?.llm) {
      nextExecution[actorKey] = {
        ...actor,
        llm: applyLlmBlockOverride(actor.llm, override),
      };
      reached.push(`review.execution.${actorKey}.llm`);
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
        dropped.push(`review.execution.units.${unitId}.llm`);
      } else {
        // Units go through the SAME block rules as actors — a raw spread here
        // would keep the previous route's scoped fields (e.g. a unit's own
        // openai/oauth `service_tier` surviving an `auth: "api_key"` override),
        // so the unit route would be rejected even though the actor was cleaned.
        nextUnits[unitId] = {
          ...unit,
          llm: applyLlmBlockOverride(unit.llm, override, unitRouteBasis),
        };
        reached.push(`review.execution.units.${unitId}.llm`);
      }
    }
    nextExecution.units = nextUnits;
  }

  const transcription = execution.retry?.salvage?.transcription_llm;
  if (transcription) {
    const salvage = applySalvageTranscriptionOverride(transcription, override);
    nextExecution.retry = {
      ...execution.retry,
      salvage: {
        ...execution.retry?.salvage,
        transcription_llm: salvage.transcription_llm,
      },
    };
    if (salvage.applied) {
      recovery.push("review.execution.retry.salvage.transcription_llm");
    }
  }

  return {
    settings: {
      ...settings,
      review: { ...settings.review, execution: nextExecution },
    },
    report,
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
 *
 * `applied` reports which of the two happened, so the skipped (inert) case is
 * not counted as a seat the override reached.
 */
function applySalvageTranscriptionOverride(
  transcription: { provider?: "anthropic" | "openai" | undefined; model: string },
  override: PerCallLlmOverride,
): {
  transcription_llm: { provider?: "anthropic" | "openai" | undefined; model: string };
  applied: boolean;
} {
  // A switch to a salvage-incompatible provider (grok/lmstudio) leaves salvage
  // ENTIRELY unchanged — the model would otherwise land on an anthropic/openai
  // route it does not belong to. Salvage is opt-in / default-off, so
  // under-applying here fails closed, never dispatches an unverified call.
  if (override.provider === "grok" || override.provider === "lmstudio") {
    return { transcription_llm: transcription, applied: false };
  }
  const next = { ...transcription };
  if (override.model !== undefined) next.model = override.model;
  if (override.provider === "anthropic" || override.provider === "openai") {
    next.provider = override.provider;
  }
  return { transcription_llm: next, applied: true };
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
  return applyReconstructLlmOverrideWithReport(settings, override).settings;
}

/**
 * {@link applyReconstructLlmOverride} plus the {@link LlmOverrideSeatReport} of
 * the same application — the reconstruct twin of
 * {@link applyReviewLlmOverrideWithReport}, for the same fail-closed reason.
 */
export function applyReconstructLlmOverrideWithReport(
  settings: OntoSettings,
  override: PerCallLlmOverride | undefined,
): { settings: OntoSettings; report: LlmOverrideSeatReport } {
  const reached: string[] = [];
  const recovery: string[] = [];
  const dropped: string[] = [];
  const report: LlmOverrideSeatReport = { reached, recovery, dropped };
  if (!override || isEmptyOverride(override)) return { settings, report }; // IDENTITY
  const execution = settings.reconstruct?.execution;
  if (!execution) return { settings, report };

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
        reached.push(`reconstruct.execution.actors.${actorKey}.llm`);
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
    recovery.push("reconstruct.execution.dispatch_fallback.llm");
  }

  return {
    settings: {
      ...settings,
      reconstruct: { ...settings.reconstruct, execution: nextExecution },
    },
    report,
  };
}
