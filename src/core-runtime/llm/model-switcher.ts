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

function defaultAuthForProvider(provider: LlmProviderName): LlmAuthMode {
  if (provider === "openai") return "oauth";
  if (provider === "lmstudio") return "local";
  return "api_key";
}

export function normalizeLlmModelSwitcher(
  config: LlmModelSwitcherConfig | undefined,
): NormalizedLlmSelection | null {
  if (!config || config.provider === undefined) return null;

  const provider = config.provider;
  const auth = config.auth ?? defaultAuthForProvider(provider);

  if (auth === "oauth" && provider !== "openai") {
    throw new Error(
      `auth=oauth is only supported with provider=openai; got provider=${provider}.`,
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
      "service_tier requires the external OAuth worker route with auth=oauth and provider=openai.",
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
      if (auth !== "api_key") {
        throw new Error("provider=anthropic requires auth=api_key.");
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
