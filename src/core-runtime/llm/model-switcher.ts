export type LlmAuthMode = "api_key" | "oauth" | "local";
export type LlmProviderName = "openai" | "anthropic" | "grok" | "lmstudio";
export type LlmExecutionRoute = "external_oauth_worker" | "direct_model_call";
export type LlmExecutionAdapter =
  | "codex_cli"
  | "claude_code"
  | "openai_sdk"
  | "anthropic_sdk"
  | "openai_compatible_http";
export type LlmWireFormat = "native_sdk" | "openai_compatible";
export type LlmBillingMode = "subscription" | "per_token" | "local";

export interface LlmModelSwitcherConfig {
  provider?: LlmProviderName | undefined;
  auth?: LlmAuthMode | undefined;
  model?: string | undefined;
  base_url?: string | undefined;
  effort?: string | undefined;
  service_tier?: string | undefined;
  api_key_env?: string | undefined;
}

export type RuntimeLlmProvider =
  | "codex"
  | "openai"
  | "anthropic"
  | "grok"
  | "lmstudio";

export interface NormalizedLlmSelection {
  /** Legacy runtime/provider alias kept for existing dispatch and artifacts. */
  provider: RuntimeLlmProvider;
  model_provider: LlmProviderName;
  auth: LlmAuthMode;
  execution_route: LlmExecutionRoute;
  execution_adapter: LlmExecutionAdapter;
  billing_mode: LlmBillingMode;
  wire_format?: LlmWireFormat;
  model_id?: string;
  base_url?: string;
  reasoning_effort?: string;
  service_tier?: string;
  api_key_env?: string;
}

export function isExternalOauthWorkerSelection(
  selection: NormalizedLlmSelection | null | undefined,
): selection is NormalizedLlmSelection & {
  execution_route: "external_oauth_worker";
} {
  return selection?.execution_route === "external_oauth_worker";
}

export function isDirectModelCallSelection(
  selection: NormalizedLlmSelection | null | undefined,
): selection is NormalizedLlmSelection & {
  execution_route: "direct_model_call";
} {
  return selection?.execution_route === "direct_model_call";
}

export const DEFAULT_GROK_BASE_URL = "https://api.x.ai/v1";
export const DEFAULT_LMSTUDIO_BASE_URL = "http://localhost:1234/v1";

/**
 * The auth a block resolves to when it omits `auth`. Exported because callers
 * that reason about ROUTE IDENTITY (e.g. the per-call llmOverride overlay) must
 * compare the DEFAULTED auth, not the raw field — a block without `auth` still
 * dispatches on this route, so an override restating it is not a route change.
 *
 * METERED BILLING IS ONLY EVER CHOSEN EXPLICITLY. `per_token` starts charging on
 * the first call, so nothing may default into it: both providers that offer a
 * subscription route (openai → codex_cli, anthropic → claude_code) default to
 * that route, and `api_key` is reached only when the block SAYS SO — either by
 * `auth: "api_key"` or by naming the credential env (`api_key_env`) for the seat,
 * which is a written statement that this seat calls the paid API.
 *
 * Reading the `api_key_env` FIELD is not what INV-AUTH-1 forbids. That rule
 * ("auth is never inferred from key presence", see onboard/bootstrap-provider)
 * bars deriving auth from a secret being present in the environment; this reads
 * a configuration field the author typed. The distinction is the difference
 * between sniffing for a key and honoring a declaration.
 *
 * grok has no subscription route at all, so naming grok IS the explicit metered
 * choice (the schema rejects every other auth for it). lmstudio is local and
 * bills nothing.
 */
export function defaultAuthForProvider(
  provider: LlmProviderName,
  block?: { api_key_env?: string | undefined },
): LlmAuthMode {
  if (provider === "lmstudio") return "local";
  // grok has no subscription route; every other auth is rejected for it.
  if (provider === "grok") return "api_key";
  // Written as statements, not a ternary: the INV-AUTH-1 scanner
  // (check:spec-defaults) matches `return "<auth>";` lines, so a ternary would
  // hide the very defaults this guard exists to hold under review.
  if (block?.api_key_env) return "api_key";
  return "oauth";
}

export function normalizeLlmModelSwitcher(
  config: LlmModelSwitcherConfig | undefined,
): NormalizedLlmSelection | null {
  if (!config || config.provider === undefined) return null;

  const provider = config.provider;
  const auth = config.auth ?? defaultAuthForProvider(provider, config);

  if (auth === "oauth" && provider !== "openai" && provider !== "anthropic") {
    throw new Error(
      `auth=oauth is only supported with provider=openai or provider=anthropic; got provider=${provider}.`,
    );
  }
  if (auth === "local" && provider !== "lmstudio") {
    throw new Error(
      `auth=local is only supported with provider=lmstudio; got provider=${provider}.`,
    );
  }
  if (provider === "lmstudio" && auth !== "local") {
    throw new Error("provider=lmstudio requires auth=local.");
  }
  if (provider !== "lmstudio" && auth === "local") {
    throw new Error("auth=local currently requires provider=lmstudio.");
  }
  if (config.service_tier && !(provider === "openai" && auth === "oauth")) {
    throw new Error(
      `service_tier is only valid on the openai + auth=oauth (Codex) route; remove service_tier for provider=${provider} + auth=${auth}.`,
    );
  }

  const model_id = config.model;
  const common = {
    auth,
    ...(model_id ? { model_id } : {}),
    ...(config.effort ? { reasoning_effort: config.effort } : {}),
    ...(config.service_tier ? { service_tier: config.service_tier } : {}),
    ...(config.api_key_env ? { api_key_env: config.api_key_env } : {}),
  };

  switch (provider) {
    case "openai":
      return {
        provider: auth === "oauth" ? "codex" : "openai",
        model_provider: "openai",
        execution_route: auth === "oauth" ? "external_oauth_worker" : "direct_model_call",
        execution_adapter: auth === "oauth" ? "codex_cli" : "openai_sdk",
        billing_mode: auth === "oauth" ? "subscription" : "per_token",
        ...(auth === "api_key" ? { wire_format: "native_sdk" as const } : {}),
        ...common,
        ...(config.base_url ? { base_url: config.base_url } : {}),
      };
    case "anthropic":
      if (auth === "oauth") {
        // OAuth + anthropic resolves to the external OAuth worker route with
        // the Claude Code adapter (subscription billing). The brand lives in
        // execution_adapter, not the provider — provider stays "anthropic".
        return {
          provider: "anthropic",
          model_provider: "anthropic",
          execution_route: "external_oauth_worker",
          execution_adapter: "claude_code",
          billing_mode: "subscription",
          ...common,
        };
      }
      if (auth !== "api_key") {
        throw new Error("provider=anthropic requires auth=api_key or auth=oauth.");
      }
      return {
        provider: "anthropic",
        model_provider: "anthropic",
        execution_route: "direct_model_call",
        execution_adapter: "anthropic_sdk",
        billing_mode: "per_token",
        wire_format: "native_sdk",
        ...common,
      };
    case "grok":
      if (auth !== "api_key") {
        throw new Error("provider=grok requires auth=api_key.");
      }
      return {
        provider: "grok",
        model_provider: "grok",
        execution_route: "direct_model_call",
        execution_adapter: "openai_compatible_http",
        billing_mode: "per_token",
        wire_format: "openai_compatible",
        ...common,
        base_url: config.base_url ?? DEFAULT_GROK_BASE_URL,
      };
    case "lmstudio":
      return {
        provider: "lmstudio",
        model_provider: "lmstudio",
        execution_route: "direct_model_call",
        execution_adapter: "openai_compatible_http",
        billing_mode: "local",
        wire_format: "openai_compatible",
        ...common,
        base_url: config.base_url ?? DEFAULT_LMSTUDIO_BASE_URL,
      };
  }
}
