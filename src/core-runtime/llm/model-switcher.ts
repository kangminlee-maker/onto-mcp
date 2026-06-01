export type LlmAuthMode = "api_key" | "oauth" | "local";
export type LlmProviderName = "openai" | "anthropic" | "grok" | "lmstudio";

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
  provider: RuntimeLlmProvider;
  auth: LlmAuthMode;
  model_id?: string;
  base_url?: string;
  reasoning_effort?: string;
  service_tier?: string;
  api_key_env?: string;
}

export const DEFAULT_GROK_BASE_URL = "https://api.x.ai/v1";
export const DEFAULT_LMSTUDIO_BASE_URL = "http://localhost:1234/v1";

export function normalizeLlmModelSwitcher(
  config: LlmModelSwitcherConfig | undefined,
): NormalizedLlmSelection | null {
  if (!config || config.provider === undefined) return null;

  const provider = config.provider;
  const auth = config.auth ?? (provider === "lmstudio" ? "local" : "api_key");

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
      "service_tier is codex-only and requires auth=oauth with provider=openai.",
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
        ...common,
        ...(config.base_url ? { base_url: config.base_url } : {}),
      };
    case "anthropic":
      if (auth !== "api_key") {
        throw new Error("provider=anthropic requires auth=api_key.");
      }
      return {
        provider: "anthropic",
        ...common,
      };
    case "grok":
      if (auth !== "api_key") {
        throw new Error("provider=grok requires auth=api_key.");
      }
      return {
        provider: "grok",
        ...common,
        base_url: config.base_url ?? DEFAULT_GROK_BASE_URL,
      };
    case "lmstudio":
      return {
        provider: "lmstudio",
        ...common,
        base_url: config.base_url ?? DEFAULT_LMSTUDIO_BASE_URL,
      };
  }
}
