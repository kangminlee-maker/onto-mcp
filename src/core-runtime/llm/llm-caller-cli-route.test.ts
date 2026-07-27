import { describe, expect, it } from "vitest";
import { resolveLlmProviderConfig } from "./llm-caller.js";

/**
 * The executor child re-reads settings from DISK while its parent passes the
 * EFFECTIVE (per-call-overridden) route as CLI flags. So the bridge has to
 * resolve the route from what the CLI states, not from the on-disk block.
 */
describe("resolveLlmProviderConfig — CLI-stated route", () => {
  const anthropicOauthOnDisk = {
    llm: { provider: "anthropic", auth: "oauth", model: "claude-opus-4-8" },
  } as never;

  it("resolves the adapter from the CLI auth, not the on-disk block", () => {
    // Regression: `--auth` was parsed and dropped, so this returned
    // execution_adapter "claude_code" — callLlm dispatches on
    // (provider anthropic + adapter claude_code), so a caller who explicitly
    // asked for the metered API route ran on the subscription worker while the
    // baked actor profile recorded the API route.
    const out = resolveLlmProviderConfig({
      config: anthropicOauthOnDisk,
      cliOverrides: {
        provider: "anthropic",
        auth: "api_key",
        model: "claude-fable-5",
      },
    });
    expect(out.provider).toBe("anthropic");
    expect(out.model_id).toBe("claude-fable-5");
    expect(out.execution_adapter).toBe("anthropic_sdk");
  });

  it("inherits the provider when only auth is stated", () => {
    const out = resolveLlmProviderConfig({
      config: anthropicOauthOnDisk,
      cliOverrides: { auth: "api_key" },
    });
    expect(out.provider).toBe("anthropic");
    expect(out.execution_adapter).toBe("anthropic_sdk");
  });

  it("leaves the settings-derived route alone when the CLI states no route", () => {
    // Control: without provider/auth the CLI is only patching scalars, and the
    // on-disk route must still win — otherwise this test would pass for the
    // wrong reason above.
    const out = resolveLlmProviderConfig({
      config: anthropicOauthOnDisk,
      cliOverrides: { model: "claude-fable-5" },
    });
    expect(out.execution_adapter).toBe("claude_code");
    expect(out.model_id).toBe("claude-fable-5");
  });

  it("keeps the legacy codex dispatch key working", () => {
    // "codex" is a dispatch key, not a switcher provider; feeding it to the
    // normalizer would resolve nothing.
    const out = resolveLlmProviderConfig({
      config: { llm: { provider: "openai", auth: "oauth", model: "gpt-5.5" } } as never,
      cliOverrides: { provider: "codex", model: "gpt-5.5" },
    });
    expect(out.provider).toBe("codex");
    expect(out.execution_adapter).toBe("codex_cli");
  });

  it("does not carry a dormant endpoint or service_tier across a stated route", () => {
    const out = resolveLlmProviderConfig({
      config: {
        llm: {
          provider: "openai",
          auth: "oauth",
          model: "gpt-5.5",
          service_tier: "fast",
          base_url: "https://dormant.invalid/v1",
          api_key_env: "CUSTOM_OPENAI_KEY",
        },
      } as never,
      cliOverrides: { provider: "openai", auth: "api_key", model: "gpt-5.5" },
    });
    // service_tier is openai+oauth-only — inheriting it would make the
    // normalizer reject an otherwise valid route.
    expect(out.service_tier).toBeUndefined();
    // The endpoint must not be woken by an auth statement.
    expect(out.base_url).toBeUndefined();
    // The credential env IS what the destination direct-call route needs.
    expect(out.api_key_env).toBe("CUSTOM_OPENAI_KEY");
  });
});
