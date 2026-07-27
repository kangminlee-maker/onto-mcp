import { describe, expect, it } from "vitest";
import { normalizeLlmModelSwitcher } from "./model-switcher.js";

describe("normalizeLlmModelSwitcher", () => {
  it("maps anthropic+oauth to the external OAuth worker / claude_code adapter", () => {
    expect(
      normalizeLlmModelSwitcher({
        provider: "anthropic",
        auth: "oauth",
        model: "claude-opus-4-8",
        effort: "high",
      }),
    ).toEqual({
      provider: "anthropic",
      model_provider: "anthropic",
      auth: "oauth",
      execution_route: "external_oauth_worker",
      execution_adapter: "claude_code",
      billing_mode: "subscription",
      model_id: "claude-opus-4-8",
      reasoning_effort: "high",
    });
  });

  it("does not invent wire_format for the anthropic oauth worker route", () => {
    const selection = normalizeLlmModelSwitcher({
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    expect(selection?.wire_format).toBeUndefined();
  });

  it("rejects service_tier on the anthropic oauth worker route", () => {
    expect(() =>
      normalizeLlmModelSwitcher({
        provider: "anthropic",
        auth: "oauth",
        model: "claude-opus-4-8",
        service_tier: "fast",
      }),
    ).toThrow("service_tier is only valid on the openai + auth=oauth");
  });

  it("keeps anthropic+api_key on the direct model-call / anthropic_sdk route", () => {
    expect(
      normalizeLlmModelSwitcher({
        provider: "anthropic",
        auth: "api_key",
        model: "claude-sonnet-4-6",
      }),
    ).toEqual({
      provider: "anthropic",
      model_provider: "anthropic",
      auth: "api_key",
      execution_route: "direct_model_call",
      execution_adapter: "anthropic_sdk",
      billing_mode: "per_token",
      wire_format: "native_sdk",
      model_id: "claude-sonnet-4-6",
    });
  });

  // An omitted auth must never select a metered route: per_token bills on the
  // first call, so it is the caller's choice to state, not a default's to make.
  it("defaults anthropic (no auth, no credential env) to the subscription worker route", () => {
    const selection = normalizeLlmModelSwitcher({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    expect(selection?.auth).toBe("oauth");
    expect(selection?.execution_route).toBe("external_oauth_worker");
    expect(selection?.execution_adapter).toBe("claude_code");
    expect(selection?.billing_mode).toBe("subscription");
  });

  it("defaults openai (no auth, no credential env) to the subscription worker route", () => {
    const selection = normalizeLlmModelSwitcher({ provider: "openai", model: "gpt-5.5" });
    expect(selection?.auth).toBe("oauth");
    expect(selection?.billing_mode).toBe("subscription");
  });

  it("reads a NAMED credential env as the seat stating the metered route", () => {
    // Naming `api_key_env` is a written declaration that this seat calls the
    // paid API — the same class of statement as `auth: "api_key"`, and distinct
    // from inferring auth from a key being present in the environment (which is
    // what INV-AUTH-1 forbids). Symmetric across both providers.
    for (const [provider, model, keyEnv, adapter] of [
      ["anthropic", "claude-sonnet-4-6", "ANTHROPIC_API_KEY", "anthropic_sdk"],
      ["openai", "gpt-5.5", "OPENAI_API_KEY", "openai_sdk"],
    ] as const) {
      const selection = normalizeLlmModelSwitcher({
        provider,
        model,
        api_key_env: keyEnv,
      });
      expect(selection?.auth).toBe("api_key");
      expect(selection?.execution_route).toBe("direct_model_call");
      expect(selection?.execution_adapter).toBe(adapter);
      expect(selection?.billing_mode).toBe("per_token");
    }
  });

  it("keeps the metered route reachable by stating auth explicitly", () => {
    const selection = normalizeLlmModelSwitcher({
      provider: "anthropic",
      auth: "api_key",
      model: "claude-sonnet-4-6",
    });
    expect(selection?.auth).toBe("api_key");
    expect(selection?.billing_mode).toBe("per_token");
  });

  it("keeps grok on api_key — it has no subscription route to default to", () => {
    const selection = normalizeLlmModelSwitcher({ provider: "grok", model: "grok-4" });
    expect(selection?.auth).toBe("api_key");
    expect(selection?.billing_mode).toBe("per_token");
  });

  it("keeps openai+oauth on the codex_cli worker route (regression)", () => {
    expect(
      normalizeLlmModelSwitcher({
        provider: "openai",
        auth: "oauth",
        model: "gpt-5.5",
      }),
    ).toMatchObject({
      provider: "codex",
      model_provider: "openai",
      execution_route: "external_oauth_worker",
      execution_adapter: "codex_cli",
      billing_mode: "subscription",
    });
  });

  it("rejects oauth for grok (only openai/anthropic allowed)", () => {
    expect(() =>
      normalizeLlmModelSwitcher({ provider: "grok", auth: "oauth" }),
    ).toThrow("auth=oauth is only supported with provider=openai or provider=anthropic");
  });
});
