import { describe, expect, it } from "vitest";
import {
  claudeOauthWorkerEnv,
  claudeOauthWorkerStrippedEnvNames,
} from "./claude-oauth-worker-env.js";

describe("claudeOauthWorkerEnv", () => {
  const ambient: NodeJS.ProcessEnv = {
    ANTHROPIC_API_KEY: "sk-metered",
    ANTHROPIC_AUTH_TOKEN: "bearer-metered",
    CLAUDE_CODE_USE_BEDROCK: "1",
    CLAUDE_CODE_USE_VERTEX: "1",
    CLAUDE_CODE_USE_FOUNDRY: "1",
    CLAUDE_CODE_OAUTH_TOKEN: "oauth-token",
    PATH: "/usr/bin",
    HOME: "/Users/someone",
  };

  it("removes every credential that outranks the subscription session", () => {
    const env = claudeOauthWorkerEnv(ambient);
    for (const name of claudeOauthWorkerStrippedEnvNames()) {
      expect(env[name]).toBeUndefined();
    }
    // In `-p` an ambient API key is ALWAYS used when present, so leaving any of
    // these in place would make the route's declared subscription billing false.
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("keeps the OAuth token and unrelated variables", () => {
    const env = claudeOauthWorkerEnv(ambient);
    // CLAUDE_CODE_OAUTH_TOKEN is itself an OAuth credential — honoring it does
    // not turn a subscription route into a metered one.
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oauth-token");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/Users/someone");
  });

  it("removes the seat's own configured credential env when it has one", () => {
    const env = claudeOauthWorkerEnv(
      { ...ambient, CUSTOM_ANTHROPIC_KEY: "sk-custom" },
      { configuredApiKeyEnv: "CUSTOM_ANTHROPIC_KEY" },
    );
    expect(env.CUSTOM_ANTHROPIC_KEY).toBeUndefined();
    // An absent/blank configured name must not delete anything by accident.
    const untouched = claudeOauthWorkerEnv(
      { ...ambient, CUSTOM_ANTHROPIC_KEY: "sk-custom" },
      { configuredApiKeyEnv: "" },
    );
    expect(untouched.CUSTOM_ANTHROPIC_KEY).toBe("sk-custom");
  });

  it("is pure — the caller's environment object is not mutated", () => {
    const source: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: "sk-metered", PATH: "/usr/bin" };
    const env = claudeOauthWorkerEnv(source);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(source.ANTHROPIC_API_KEY).toBe("sk-metered");
  });
});
