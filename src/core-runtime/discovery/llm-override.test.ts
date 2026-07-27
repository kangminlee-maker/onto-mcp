import { describe, expect, it } from "vitest";
import type { OntoSettings, PerCallLlmOverride } from "./settings-chain.js";
import { OntoSettingsValidationError } from "./settings-chain.js";
import {
  applyReconstructLlmOverride,
  applyReconstructLlmOverrideWithReport,
  applyReviewLlmOverride,
  applyReviewLlmOverrideWithReport,
  assertLlmOverrideReachedSeats,
  parsePerCallLlmOverrideArg,
} from "./llm-override.js";
import { resolveReviewExecutionProfile } from "../review/review-execution-profile.js";
import { REVIEW_MOCK_REALIZATION_ENV } from "../review/test-fixtures/mock-realization.js";

// ── review overlay ──────────────────────────────────────────────────────────

function reviewSettingsWith(actorLlm: Record<string, unknown>): OntoSettings {
  return {
    schema_version: "settings.json/v3",
    review: {
      execution: {
        teamlead: { seat: "main", llm: { ...actorLlm } },
        lens: { seat: "worker", llm: { ...actorLlm } },
        synthesize: { seat: "worker", llm: { ...actorLlm } },
      },
    },
  } as unknown as OntoSettings;
}

const openAiOauthActor = {
  provider: "openai",
  auth: "oauth",
  model: "gpt-5.5",
  effort: "medium",
  service_tier: "fast",
} as const;

describe("applyReviewLlmOverride", () => {
  it("is the identity (same reference) when the override is absent or empty", () => {
    const settings = reviewSettingsWith(openAiOauthActor);
    expect(applyReviewLlmOverride(settings, undefined)).toBe(settings);
    expect(applyReviewLlmOverride(settings, {})).toBe(settings);
  });

  it("field-overlays (no provider) — merges effort/model onto the same provider", () => {
    const settings = reviewSettingsWith(openAiOauthActor);
    const result = applyReviewLlmOverride(settings, { effort: "high", model: "gpt-5.6" });
    const teamlead = result.review?.execution?.teamlead?.llm;
    expect(teamlead).toEqual({
      provider: "openai",
      auth: "oauth",
      model: "gpt-5.6", // overridden
      effort: "high", // overridden
      service_tier: "fast", // preserved
    });
    // Immutable: the source settings are untouched.
    expect(settings.review?.execution?.teamlead?.llm?.effort).toBe("medium");
    expect(settings.review?.execution?.teamlead?.llm?.model).toBe("gpt-5.5");
  });

  it("replaces (with provider) the actor block and drops transport/stale fields", () => {
    const settings = reviewSettingsWith({
      ...openAiOauthActor,
      api_key_env: "OPENAI_API_KEY",
    });
    const result = applyReviewLlmOverride(settings, {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    // The whole block is replaced — old api_key_env / service_tier / effort gone.
    expect(result.review?.execution?.lens?.llm).toEqual({
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
  });

  it("replace mode DROPS a unit llm (unit inherits the replaced actor)", () => {
    const settings = reviewSettingsWith(openAiOauthActor);
    (settings.review!.execution as { units?: unknown }).units = {
      lens: { llm: { provider: "openai", auth: "oauth", model: "gpt-5.5" }, max_tokens: 4096 },
    };
    const result = applyReviewLlmOverride(settings, {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    const lensUnit = result.review?.execution?.units?.lens;
    expect(lensUnit).toBeDefined();
    expect(lensUnit && "llm" in lensUnit).toBe(false); // llm dropped
    expect(lensUnit?.max_tokens).toBe(4096); // non-llm settings preserved
  });

  it("overlay mode field-overlays a unit llm too", () => {
    const settings = reviewSettingsWith(openAiOauthActor);
    (settings.review!.execution as { units?: unknown }).units = {
      lens: { llm: { provider: "openai", auth: "oauth", model: "gpt-5.5", effort: "low" } },
    };
    const result = applyReviewLlmOverride(settings, { effort: "high" });
    expect(result.review?.execution?.units?.lens?.llm).toEqual({
      provider: "openai",
      auth: "oauth",
      model: "gpt-5.5",
      effort: "high",
    });
  });

  it("overlays salvage transcription_llm for anthropic/openai and leaves it inert for grok", () => {
    const base = reviewSettingsWith(openAiOauthActor);
    (base.review!.execution as { retry?: unknown }).retry = {
      salvage: { enabled: true, transcription_llm: { provider: "anthropic", model: "claude-haiku" } },
    };
    // openai provider switch → salvage follows (both providers representable).
    const toOpenai = applyReviewLlmOverride(base, {
      provider: "openai",
      auth: "oauth",
      model: "gpt-5.5",
    });
    expect(toOpenai.review?.execution?.retry?.salvage?.transcription_llm).toEqual({
      provider: "openai",
      model: "gpt-5.5",
    });
    // grok switch → salvage cannot express grok, so the seat is left untouched.
    // That is INERT, not a mixed route: grok resolves to the direct-call route
    // and the runner only salvages on a claude_code/codex worker executor. It is
    // also what editing grok into settings would do — the overlay must not
    // invent a stricter contract than the settings path.
    const toGrok = applyReviewLlmOverride(base, {
      provider: "grok",
      auth: "api_key",
      model: "grok-4",
    });
    expect(toGrok.review?.execution?.retry?.salvage?.transcription_llm).toEqual({
      provider: "anthropic",
      model: "claude-haiku",
    });
  });
});

// ── reconstruct overlay ─────────────────────────────────────────────────────

function reconstructSettingsWith(args: {
  authorLlm: Record<string, unknown>;
  dispatchFallback?: boolean;
}): OntoSettings {
  return {
    schema_version: "settings.json/v3",
    reconstruct: {
      execution: {
        actors: {
          semantic_author: { llm: { ...args.authorLlm } },
          confirmation_provider: { llm: { ...args.authorLlm } },
        },
        ...(args.dispatchFallback
          ? {
              dispatch_fallback: {
                enabled: true,
                trigger: "rate_limit",
                max_fallback_passes: 1,
                per_dispatch_max_provider_attempts: 1,
                systemic_failure_threshold: 1,
                llm: {
                  provider: "anthropic",
                  auth: "api_key",
                  model: "claude-sonnet",
                  effort: "low",
                  api_key_env: "ANTHROPIC_API_KEY",
                },
              },
            }
          : {}),
      },
    },
  } as unknown as OntoSettings;
}

const openAiApiAuthor = {
  provider: "openai",
  auth: "api_key",
  model: "gpt-5.5",
  effort: "medium",
  api_key_env: "OPENAI_API_KEY",
} as const;

describe("applyReconstructLlmOverride — provider-scoped llm_runtime (PR #197 codex P2)", () => {
  // llm_runtime (openai Responses output headroom) is valid ONLY on the
  // openai + api_key route. It must not survive a route change, or reconstruct
  // applies openai-only headroom to the new route and fails before dispatch —
  // with no way for the caller to clear it through llmOverride.
  function authorWithRuntime(): OntoSettings {
    const settings = reconstructSettingsWith({
      authorLlm: { provider: "openai", auth: "api_key", model: "gpt-5.5", effort: "medium" },
    });
    (settings.reconstruct!.execution!.actors!.semantic_author as Record<string, unknown>)
      .llm_runtime = { openai_responses_output_headroom_tokens: 4096 };
    return settings;
  }

  it("drops llm_runtime when the override switches provider", () => {
    const switched = applyReconstructLlmOverride(authorWithRuntime(), {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    const author = switched.reconstruct?.execution?.actors?.semantic_author as
      | { llm_runtime?: unknown; llm?: { provider?: string } }
      | undefined;
    expect(author?.llm?.provider).toBe("anthropic");
    expect(author?.llm_runtime).toBeUndefined();
  });

  it("drops llm_runtime when the override switches auth (api_key → oauth)", () => {
    const switched = applyReconstructLlmOverride(authorWithRuntime(), { auth: "oauth" });
    const author = switched.reconstruct?.execution?.actors?.semantic_author as
      | { llm_runtime?: unknown }
      | undefined;
    expect(author?.llm_runtime).toBeUndefined();
  });

  it("keeps llm_runtime when the route is unchanged (effort-only override)", () => {
    const same = applyReconstructLlmOverride(authorWithRuntime(), { effort: "high" });
    const author = same.reconstruct?.execution?.actors?.semantic_author as
      | { llm_runtime?: { openai_responses_output_headroom_tokens?: number } }
      | undefined;
    expect(author?.llm_runtime?.openai_responses_output_headroom_tokens).toBe(4096);
  });

  it("keeps llm_runtime when the override RESTATES the same provider/auth (PR #199 codex P2)", () => {
    // Route identity must be compared by effective value, not field presence:
    // repeating provider/auth to change only the model keeps the same route, so
    // the still-valid Responses headroom must survive.
    const same = applyReconstructLlmOverride(authorWithRuntime(), {
      provider: "openai",
      auth: "api_key",
      model: "gpt-5.6",
    });
    const author = same.reconstruct?.execution?.actors?.semantic_author as
      | {
          llm_runtime?: { openai_responses_output_headroom_tokens?: number };
          llm?: { model?: string; api_key_env?: string };
        }
      | undefined;
    expect(author?.llm?.model).toBe("gpt-5.6");
    expect(author?.llm_runtime?.openai_responses_output_headroom_tokens).toBe(4096);
  });
});

describe("applyReconstructLlmOverride", () => {
  it("is the identity (same reference) when the override is absent or empty", () => {
    const settings = reconstructSettingsWith({ authorLlm: openAiApiAuthor });
    expect(applyReconstructLlmOverride(settings, undefined)).toBe(settings);
    expect(applyReconstructLlmOverride(settings, {})).toBe(settings);
  });

  it("field-overlays the actor effort without touching provider/model", () => {
    const settings = reconstructSettingsWith({ authorLlm: openAiApiAuthor });
    const result = applyReconstructLlmOverride(settings, { effort: "high" });
    expect(result.reconstruct?.execution?.actors?.semantic_author?.llm).toEqual({
      provider: "openai",
      auth: "api_key",
      model: "gpt-5.5",
      effort: "high",
      api_key_env: "OPENAI_API_KEY",
    });
    // Immutable source.
    expect(settings.reconstruct?.execution?.actors?.semantic_author?.llm?.effort).toBe("medium");
  });

  it("replaces the actor block and drops the old api_key_env (no credential leak)", () => {
    const settings = reconstructSettingsWith({ authorLlm: openAiApiAuthor });
    const result = applyReconstructLlmOverride(settings, {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    expect(result.reconstruct?.execution?.actors?.confirmation_provider?.llm).toEqual({
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
  });

  it("threads override effort into dispatch_fallback.llm but never switches its provider", () => {
    const settings = reconstructSettingsWith({ authorLlm: openAiApiAuthor, dispatchFallback: true });
    // effort overlay → fallback effort updated, provider/api_key_env preserved.
    const withEffort = applyReconstructLlmOverride(settings, { effort: "high" });
    expect(withEffort.reconstruct?.execution?.dispatch_fallback).toMatchObject({
      enabled: true,
      llm: {
        provider: "anthropic",
        auth: "api_key",
        model: "claude-sonnet",
        effort: "high", // overridden
        api_key_env: "ANTHROPIC_API_KEY", // preserved
      },
    });
    // A provider switch of the PRIMARY must NOT collapse the alternate fallback.
    const switched = applyReconstructLlmOverride(settings, {
      provider: "openai",
      auth: "api_key",
      model: "gpt-5.6",
    });
    expect(switched.reconstruct?.execution?.actors?.semantic_author?.llm?.provider).toBe("openai");
    expect(switched.reconstruct?.execution?.dispatch_fallback?.enabled === true &&
      switched.reconstruct.execution.dispatch_fallback.llm).toEqual({
      provider: "anthropic",
      auth: "api_key",
      model: "claude-sonnet",
      effort: "low",
      api_key_env: "ANTHROPIC_API_KEY",
    });
  });
});

// ── argv round-trip ─────────────────────────────────────────────────────────

describe("parsePerCallLlmOverrideArg", () => {
  it("returns undefined for absent/empty input", () => {
    expect(parsePerCallLlmOverrideArg(undefined)).toBeUndefined();
    expect(parsePerCallLlmOverrideArg("")).toBeUndefined();
  });

  it("parses + shape-validates the serialized override", () => {
    const override: PerCallLlmOverride = { provider: "anthropic", auth: "oauth", model: "claude-opus-4-8" };
    expect(parsePerCallLlmOverrideArg(JSON.stringify(override))).toEqual(override);
  });

  it("rejects an unknown key (strict schema)", () => {
    expect(() => parsePerCallLlmOverrideArg(JSON.stringify({ base_url: "http://x" }))).toThrow();
  });

  it("canonicalizes an EMPTY override to undefined (ultracode: {} must equal omission)", () => {
    // `{}` is schema-valid but semantically an omission. If it parsed to a truthy
    // `{}`, the overlay would be identity while `if (llmOverride)` gates still
    // fired — making `{}` observably different from omitting the field.
    expect(parsePerCallLlmOverrideArg("{}")).toBeUndefined();
    expect(parsePerCallLlmOverrideArg(undefined)).toBeUndefined();
  });
});

// ── behavior: overlay flips the resolved review execution profile ─────────────

describe("review overlay changes the resolved execution profile (design v4 §2.6)", () => {
  const hermeticEnv = { [REVIEW_MOCK_REALIZATION_ENV]: "1" } as NodeJS.ProcessEnv;
  const baseline = reviewSettingsWith(openAiOauthActor); // OpenAI OAuth → codex_cli

  it("default-off (no override) leaves the profile identical", () => {
    const withNoOverride = applyReviewLlmOverride(baseline, undefined);
    const a = resolveReviewExecutionProfile({
      explicitCodex: false,
      settings: baseline,
      codexAvailable: true,
      claudeAvailable: false,
      env: hermeticEnv,
    });
    const b = resolveReviewExecutionProfile({
      explicitCodex: false,
      settings: withNoOverride,
      codexAvailable: true,
      claudeAvailable: false,
      env: hermeticEnv,
    });
    expect(a.type).toBe("resolved");
    expect(b.type).toBe("resolved");
    if (a.type !== "resolved" || b.type !== "resolved") return;
    expect(b.profile.worker_executor).toBe("codex");
    expect(b.profile).toEqual(a.profile);
  });

  it("an anthropic-OAuth override flips the worker/adapter codex → claude_code", () => {
    const overlaid = applyReviewLlmOverride(baseline, {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    const before = resolveReviewExecutionProfile({
      explicitCodex: false,
      settings: baseline,
      codexAvailable: true,
      claudeAvailable: true,
      env: hermeticEnv,
    });
    const after = resolveReviewExecutionProfile({
      explicitCodex: false,
      settings: overlaid,
      codexAvailable: true,
      claudeAvailable: true,
      env: hermeticEnv,
    });
    expect(before.type).toBe("resolved");
    expect(after.type).toBe("resolved");
    if (before.type !== "resolved" || after.type !== "resolved") return;
    // Positive control: the baseline routes to the codex worker.
    expect(before.profile.worker_executor).toBe("codex");
    expect(before.profile.host).toBe("codex");
    // The override flips the whole review to the Anthropic OAuth (claude_code) route.
    expect(after.profile.worker_executor).toBe("claude_code");
    expect(after.profile.host).toBe("anthropic");
    expect(after.profile.provider).toBe("anthropic");
    expect(after.profile.model).toBe("claude-opus-4-8");
  });

  it("an auth switch drops the previous route's scoped fields (PR #197 codex P2)", () => {
    // openai OAuth seats carry service_tier=fast. Switching auth to api_key is a
    // ROUTE change; keeping service_tier would make normalizeLlmModelSwitcher
    // reject the otherwise valid api-key route (service_tier is oauth-only).
    const settings = reviewSettingsWith(openAiOauthActor); // has service_tier: "fast"
    const overlaid = applyReviewLlmOverride(settings, {
      auth: "api_key",
      model: "gpt-5.5",
    });
    const teamlead = overlaid.review?.execution?.teamlead?.llm;
    expect(teamlead?.auth).toBe("api_key");
    expect(teamlead?.provider).toBe("openai"); // provider identity preserved
    expect(teamlead?.service_tier).toBeUndefined(); // stale oauth-only field dropped
    // The merged block must now normalize instead of throwing.
    expect(() => resolveReviewExecutionProfile({
      explicitCodex: false,
      settings: overlaid,
      codexAvailable: true,
      claudeAvailable: true,
      env: hermeticEnv,
    })).not.toThrow();
  });

  it("an api_key→oauth switch drops api_key_env/base_url (PR #197 codex P2)", () => {
    const settings = reviewSettingsWith({
      provider: "openai",
      auth: "api_key",
      model: "gpt-5.5",
      api_key_env: "OPENAI_API_KEY",
      base_url: "https://api.openai.com/v1",
    });
    const overlaid = applyReviewLlmOverride(settings, { auth: "oauth" });
    const teamlead = overlaid.review?.execution?.teamlead?.llm;
    expect(teamlead?.auth).toBe("oauth");
    expect(teamlead?.api_key_env).toBeUndefined();
    expect(teamlead?.base_url).toBeUndefined();
  });

  it("does not reject a SAME-provider override on a grok project with salvage enabled (PR #200 codex P2)", () => {
    // A project already on grok that restates grok to change the model is not a
    // provider switch under the effective-route semantics — it must not be
    // rejected just because the named provider is one salvage cannot express.
    const settings = reviewSettingsWith({
      provider: "grok",
      auth: "api_key",
      model: "grok-4",
      api_key_env: "XAI_API_KEY",
    });
    (settings.review!.execution as Record<string, unknown>).retry = {
      salvage: { enabled: true, transcription_llm: { provider: "openai", model: "gpt-5-mini" } },
    };
    const overlaid = applyReviewLlmOverride(settings, {
      provider: "grok",
      auth: "api_key",
      model: "grok-4-fast",
    });
    expect(overlaid.review?.execution?.teamlead?.llm?.model).toBe("grok-4-fast");
    expect(overlaid.review?.execution?.teamlead?.llm?.api_key_env).toBe("XAI_API_KEY");
  });

  it("an auth switch cleans a UNIT's own route-scoped fields too (PR #199 codex P2)", () => {
    // The actor cleanup alone is not enough: a unit carrying its own oauth-only
    // service_tier would keep it through an api_key override and get rejected.
    const settings = reviewSettingsWith(openAiOauthActor);
    (settings.review!.execution as Record<string, unknown>).units = {
      lens: {
        llm: { provider: "openai", auth: "oauth", model: "gpt-5.5", service_tier: "fast" },
      },
    };
    const overlaid = applyReviewLlmOverride(settings, { auth: "api_key" });
    const lensUnitLlm = (overlaid.review?.execution?.units?.lens as { llm?: Record<string, unknown> })?.llm;
    expect(lensUnitLlm?.auth).toBe("api_key");
    expect(lensUnitLlm?.service_tier).toBeUndefined(); // cleaned, like the actor
  });

  it("restating the CURRENT provider/auth is not a route change — transport is preserved (PR #199 codex P2)", () => {
    // An override may repeat provider/auth just to change the model. Treating
    // provider PRESENCE as a route change would wipe still-valid transport.
    const settings = reviewSettingsWith({
      provider: "openai",
      auth: "api_key",
      model: "gpt-5.5",
      api_key_env: "OPENAI_API_KEY",
      base_url: "https://api.openai.com/v1",
    });
    const overlaid = applyReviewLlmOverride(settings, {
      provider: "openai",
      auth: "api_key",
      model: "gpt-5.6",
    });
    const teamlead = overlaid.review?.execution?.teamlead?.llm;
    expect(teamlead?.model).toBe("gpt-5.6"); // model overridden
    expect(teamlead?.api_key_env).toBe("OPENAI_API_KEY"); // same route → preserved
    expect(teamlead?.base_url).toBe("https://api.openai.com/v1");
  });

  it("restating a DEFAULTED auth is not a route change — transport survives (PR #199 codex P2)", () => {
    // A block that omits `auth` still dispatches on defaultAuthForProvider()
    // (anthropic → oauth, the subscription worker). An override restating that
    // effective auth must not be read as a switch, or it discards transport the
    // block still owns.
    const settings = reviewSettingsWith({
      provider: "anthropic",
      model: "claude-opus-4-8",
      // auth intentionally omitted → defaults to oauth (subscription worker)
    });
    const overlaid = applyReviewLlmOverride(settings, {
      auth: "oauth",
      model: "claude-fable-5",
    });
    const teamlead = overlaid.review?.execution?.teamlead?.llm;
    expect(teamlead?.model).toBe("claude-fable-5");
    expect(teamlead?.provider).toBe("anthropic"); // block preserved, not replaced
  });

  it("an auth switch keeps the credential env when the DESTINATION is the api route", () => {
    // Cleaning removes the fields scoped to the route being LEFT. api_key_env
    // belongs to the direct-call route, so switching INTO it must keep the env
    // the seat configured — dropping it would silently fall back to the default
    // variable name and fail loud on a custom one.
    const settings = reviewSettingsWith({
      provider: "anthropic",
      auth: "oauth", // explicit, so `auth: api_key` IS a route change here
      model: "claude-opus-4-8",
      api_key_env: "CUSTOM_ANTHROPIC_KEY",
    });
    const toApiKey = applyReviewLlmOverride(settings, { auth: "api_key" });
    expect(toApiKey.review?.execution?.teamlead?.llm?.api_key_env).toBe(
      "CUSTOM_ANTHROPIC_KEY",
    );

    // ...but an ENDPOINT never rides along. A base_url that lies dormant on the
    // worker route would otherwise be activated by a caller who only asked to
    // change auth, and the direct-call path forwards it into the SDK client —
    // sending the seat's real credential to a settings-chosen host.
    const dormantEndpoint = reviewSettingsWith({
      provider: "openai",
      auth: "oauth",
      model: "gpt-5.5",
      api_key_env: "CUSTOM_OPENAI_KEY",
      base_url: "https://dormant.invalid/v1",
    });
    const woken = applyReviewLlmOverride(dormantEndpoint, { auth: "api_key" });
    expect(woken.review?.execution?.teamlead?.llm?.base_url).toBeUndefined();
    expect(woken.review?.execution?.teamlead?.llm?.api_key_env).toBe(
      "CUSTOM_OPENAI_KEY",
    );
    // Negative control, the direction the cleaning exists for: switching TO the
    // OAuth worker route must NOT carry an api-key endpoint into it.
    const apiKeySettings = reviewSettingsWith({
      provider: "anthropic",
      auth: "api_key",
      model: "claude-opus-4-8",
      api_key_env: "CUSTOM_ANTHROPIC_KEY",
      base_url: "https://example.invalid/v1",
    });
    const toOauth = applyReviewLlmOverride(apiKeySettings, { auth: "oauth" });
    expect(toOauth.review?.execution?.teamlead?.llm?.api_key_env).toBeUndefined();
    expect(toOauth.review?.execution?.teamlead?.llm?.base_url).toBeUndefined();
  });

  it("judges a provider-less UNIT on its inherited route, not its partial block (ultracode)", () => {
    // A unit's llm is partial and merges over its actor. Restating the actor's
    // CURRENT provider is not a route change, so the unit must keep its own
    // calibrated fields instead of being dropped (which would lose its effort).
    const settings = reviewSettingsWith(openAiOauthActor); // openai/oauth actors
    (settings.review!.execution as Record<string, unknown>).units = {
      // provider omitted → inherits the openai actor
      deliberation_resolution: { llm: { model: "gpt-5.5", effort: "low" } },
    };
    const overlaid = applyReviewLlmOverride(settings, {
      provider: "openai", // restates the inherited provider — NOT a switch
      model: "gpt-5.6",
    });
    const unit = overlaid.review?.execution?.units?.deliberation_resolution as
      | { llm?: Record<string, unknown> }
      | undefined;
    expect(unit?.llm).toBeDefined(); // not dropped
    expect(unit?.llm?.model).toBe("gpt-5.6"); // override applied
    expect(unit?.llm?.effort).toBe("low"); // unit's own calibration preserved
    // Positive control: a REAL provider switch still drops the unit's llm.
    const switched = applyReviewLlmOverride(settings, {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    const switchedUnit = switched.review?.execution?.units?.deliberation_resolution as
      | { llm?: unknown }
      | undefined;
    expect(switchedUnit?.llm).toBeUndefined();
  });

  it("provider-switch drops a unit's own llm so it inherits the overridden actor (continuation fix, v4 §7)", () => {
    // The continuation fix re-applies the stamped override to the freshly
    // resolved project profile. Its correctness rests on this: a provider switch
    // must drop a unit's own (old-provider) llm so the unit inherits the
    // replaced actor — otherwise the unit reverts to the non-overlaid project
    // model while the actors are overridden (mixed route).
    const settings = reviewSettingsWith(openAiOauthActor);
    (settings.review!.execution as Record<string, unknown>).units = {
      lens: { llm: { provider: "openai", auth: "oauth", model: "gpt-5.5", effort: "low" } },
    };
    const overlaid = applyReviewLlmOverride(settings, {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    // The unit's stale openai llm is dropped (not retained on the old provider).
    const lensUnit = overlaid.review?.execution?.units?.lens as { llm?: unknown } | undefined;
    expect(lensUnit).toBeDefined();
    expect(lensUnit?.llm).toBeUndefined();
    const after = resolveReviewExecutionProfile({
      explicitCodex: false,
      settings: overlaid,
      codexAvailable: true,
      claudeAvailable: true,
      env: hermeticEnv,
    });
    expect(after.type).toBe("resolved");
    if (after.type !== "resolved") return;
    expect(after.profile.worker_executor).toBe("claude_code");
    expect(after.profile.provider).toBe("anthropic");
  });
});

// ── seat report + zero-reach fail-closed ────────────────────────────────────

describe("llmOverride seat report", () => {
  it("records the seats a REPLACE reached and the unit seats it dropped", () => {
    const settings = reviewSettingsWith(openAiOauthActor);
    (settings.review!.execution as Record<string, unknown>).units = {
      lens: { llm: { model: "gpt-5.5", effort: "medium" } },
      finding_ledger: { llm: { model: "gpt-5.5", effort: "low" } },
      issue_stance_matrix: { timeout_ms: 300000 }, // no llm — neither reached nor dropped
    };
    const { report } = applyReviewLlmOverrideWithReport(settings, {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    expect(report.reached).toEqual([
      "review.execution.teamlead.llm",
      "review.execution.lens.llm",
      "review.execution.synthesize.llm",
    ]);
    // The two llm-bearing units are dropped to inherit the replaced actor; the
    // llm-less unit is untouched, so it appears in neither list.
    expect([...report.dropped].sort()).toEqual([
      "review.execution.units.finding_ledger.llm",
      "review.execution.units.lens.llm",
    ]);
  });

  it("records every seat an OVERLAY reached and drops none (same route)", () => {
    const settings = reviewSettingsWith(openAiOauthActor);
    (settings.review!.execution as Record<string, unknown>).units = {
      lens: { llm: { model: "gpt-5.5", effort: "medium" } },
    };
    const { report } = applyReviewLlmOverrideWithReport(settings, { effort: "high" });
    expect(report.reached).toEqual([
      "review.execution.teamlead.llm",
      "review.execution.lens.llm",
      "review.execution.synthesize.llm",
      "review.execution.units.lens.llm",
    ]);
    expect(report.dropped).toEqual([]);
  });

  it("counts a salvage transcription only when the switched-in provider can express it", () => {
    const withSalvage = (): OntoSettings => {
      const settings = reviewSettingsWith(openAiOauthActor);
      (settings.review!.execution as Record<string, unknown>).retry = {
        salvage: {
          enabled: true,
          transcription_llm: { provider: "anthropic", model: "claude-haiku" },
        },
      };
      return settings;
    };
    const salvagePath = "review.execution.retry.salvage.transcription_llm";
    const applied = applyReviewLlmOverrideWithReport(withSalvage(), {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    // Salvage is RECOVERY-ONLY: reported, but never counted as a primary seat.
    expect(applied.report.recovery).toContain(salvagePath);
    expect(applied.report.reached).not.toContain(salvagePath);
    // grok/lmstudio cannot be expressed in the restricted salvage shape, so the
    // seat is left inert — it must not be counted as reached at all.
    const inert = applyReviewLlmOverrideWithReport(withSalvage(), {
      provider: "grok",
      model: "grok-4",
    });
    expect(inert.report.recovery).not.toContain(salvagePath);
    expect(inert.report.reached).not.toContain(salvagePath);
  });

  it("does not let a salvage-only reach satisfy the primary-seat guard", () => {
    // Regression: a chain with no actor/unit llm but a configured salvage
    // transcription used to produce reached=[salvage], pass the guard, and
    // resolve the REVIEW to codex/codex with no model pin while the caller had
    // asked for anthropic — the exact family collapse the guard exists to stop.
    const salvageOnly = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          teamlead: { seat: "main" },
          lens: { seat: "worker" },
          synthesize: { seat: "worker" },
          retry: {
            salvage: {
              enabled: true,
              transcription_llm: { provider: "anthropic", model: "claude-opus-4-8" },
            },
          },
        },
      },
    } as unknown as OntoSettings;
    const override = {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-fable-5",
    } as PerCallLlmOverride;
    const { report } = applyReviewLlmOverrideWithReport(salvageOnly, override);
    expect(report.reached).toEqual([]);
    expect(report.recovery).toEqual([
      "review.execution.retry.salvage.transcription_llm",
    ]);
    let thrown: unknown;
    try {
      assertLlmOverrideReachedSeats({ scope: "review", report, override });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OntoSettingsValidationError);
    // The error names the recovery seat, so the cause is diagnosable.
    expect((thrown as OntoSettingsValidationError).message).toContain("recovery-only");
    expect(
      (thrown as OntoSettingsValidationError).failureRecord.details,
    ).toMatchObject({
      recovery_only_seats: ["review.execution.retry.salvage.transcription_llm"],
    });
  });

  it("reaches nothing when the settings chain configures no review seat", () => {
    const noExecution = {
      schema_version: "settings.json/v3",
      review: { mode: "full" },
    } as unknown as OntoSettings;
    const noLlmBlocks = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          teamlead: { seat: "main" },
          lens: { seat: "worker" },
          synthesize: { seat: "worker" },
          units: { issue_stance_matrix: { timeout_ms: 300000 } },
        },
      },
    } as unknown as OntoSettings;
    const override: PerCallLlmOverride = {
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    } as PerCallLlmOverride;
    for (const settings of [noExecution, noLlmBlocks]) {
      const { settings: after, report } = applyReviewLlmOverrideWithReport(
        settings,
        override,
      );
      expect(report.reached).toEqual([]);
      // The overlay is a no-op on this input — which is exactly why the caller
      // cannot tell success from silence without the report.
      expect(after.review?.execution?.teamlead?.llm).toBeUndefined();
    }
  });

  it("records the reconstruct actor seats it reached, including the effort-only fallback", () => {
    const { report } = applyReconstructLlmOverrideWithReport(
      reconstructSettingsWith({ authorLlm: openAiApiAuthor, dispatchFallback: true }),
      { effort: "high" },
    );
    expect(report.reached).toEqual([
      "reconstruct.execution.actors.semantic_author.llm",
      "reconstruct.execution.actors.confirmation_provider.llm",
    ]);
    // dispatch_fallback runs only after a primary dispatch fails.
    expect(report.recovery).toEqual([
      "reconstruct.execution.dispatch_fallback.llm",
    ]);
    expect(report.dropped).toEqual([]);
  });

  it("reaches nothing when the chain configures no reconstruct actor", () => {
    const { report } = applyReconstructLlmOverrideWithReport(
      { schema_version: "settings.json/v3", review: { mode: "full" } } as unknown as OntoSettings,
      { effort: "high" },
    );
    expect(report.reached).toEqual([]);
  });
});

describe("assertLlmOverrideReachedSeats", () => {
  const override = { provider: "anthropic", model: "claude-opus-4-8" } as PerCallLlmOverride;

  it("fails loud when the override reached no seat", () => {
    for (const scope of ["review", "reconstruct"] as const) {
      let thrown: unknown;
      try {
        assertLlmOverrideReachedSeats({
          scope,
          report: { reached: [], recovery: [], dropped: [] },
          override,
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(OntoSettingsValidationError);
      const error = thrown as OntoSettingsValidationError;
      expect(error.failureRecord.reason_code).toBe("llm_override_reached_no_seat");
      // Actionable: names the settings paths that would give the override a seat.
      expect(error.message).toContain(`${scope}.execution.actors`);
      expect(error.failureRecord.details).toMatchObject({
        override_scope: scope,
        reached_seats: [],
      });
    }
  });

  it("is silent when at least one seat was reached", () => {
    expect(() =>
      assertLlmOverrideReachedSeats({
        scope: "review",
        report: { reached: ["review.execution.teamlead.llm"], recovery: [], dropped: [] },
        override,
      }),
    ).not.toThrow();
  });
});
