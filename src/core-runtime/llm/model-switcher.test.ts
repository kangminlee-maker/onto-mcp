import { describe, it, expect } from "vitest";
import { normalizeLlmModelSwitcher } from "./model-switcher.js";

describe("normalizeLlmModelSwitcher — claude CLI worker provider", () => {
  it("provider=claude defaults to auth=oauth and resolves to runtime provider 'claude'", () => {
    const out = normalizeLlmModelSwitcher({ provider: "claude" });
    expect(out).not.toBeNull();
    expect(out!.provider).toBe("claude");
    expect(out!.auth).toBe("oauth");
  });

  it("provider=claude + auth=oauth resolves to runtime 'claude' (claude.ai subscription)", () => {
    const out = normalizeLlmModelSwitcher({ provider: "claude", auth: "oauth", model: "claude-opus-4-8" });
    expect(out!.provider).toBe("claude");
    expect(out!.auth).toBe("oauth");
    expect(out!.model_id).toBe("claude-opus-4-8");
  });

  it("provider=claude + auth=api_key also resolves to runtime 'claude' (CLI worker, ANTHROPIC_API_KEY)", () => {
    const out = normalizeLlmModelSwitcher({ provider: "claude", auth: "api_key" });
    expect(out!.provider).toBe("claude");
    expect(out!.auth).toBe("api_key");
  });

  it("provider=claude + auth=local is rejected (local is lmstudio-only)", () => {
    expect(() => normalizeLlmModelSwitcher({ provider: "claude", auth: "local" })).toThrow(/local/);
  });

  it("service_tier remains codex-only — rejected for provider=claude", () => {
    expect(() =>
      normalizeLlmModelSwitcher({ provider: "claude", auth: "oauth", service_tier: "flex" }),
    ).toThrow(/service_tier is codex-only/);
  });

  it("is distinct from provider=anthropic (SDK direct-call), which requires api_key", () => {
    const claude = normalizeLlmModelSwitcher({ provider: "claude" });
    const anthropic = normalizeLlmModelSwitcher({ provider: "anthropic", auth: "api_key" });
    expect(claude!.provider).toBe("claude");
    expect(anthropic!.provider).toBe("anthropic");
    expect(() => normalizeLlmModelSwitcher({ provider: "anthropic", auth: "oauth" })).toThrow();
  });
});

describe("normalizeLlmModelSwitcher — regression (existing providers unchanged)", () => {
  it("provider=openai + auth=oauth still resolves to codex", () => {
    expect(normalizeLlmModelSwitcher({ provider: "openai", auth: "oauth" })!.provider).toBe("codex");
  });

  it("provider=openai + auth=api_key resolves to openai", () => {
    expect(normalizeLlmModelSwitcher({ provider: "openai", auth: "api_key" })!.provider).toBe("openai");
  });

  it("provider=lmstudio defaults to local", () => {
    expect(normalizeLlmModelSwitcher({ provider: "lmstudio" })!.auth).toBe("local");
  });

  it("returns null when no provider configured", () => {
    expect(normalizeLlmModelSwitcher(undefined)).toBeNull();
    expect(normalizeLlmModelSwitcher({})).toBeNull();
  });
});
