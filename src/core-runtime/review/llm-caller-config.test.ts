import { describe, expect, it } from "vitest";
import { resolveLlmProviderConfig } from "../llm/llm-caller.js";

describe("resolveLlmProviderConfig", () => {
  it("lets CLI api_key_env override settings selection", () => {
    const resolved = resolveLlmProviderConfig({
      config: {
        llm: {
          provider: "openai",
          model_id: "gpt-5.5",
          api_key_env: "SETTINGS_OPENAI_API_KEY",
        },
      },
      cliOverrides: {
        provider: "openai",
        api_key_env: "LENS_OPENAI_API_KEY",
      },
    });

    expect(resolved.api_key_env).toBe("LENS_OPENAI_API_KEY");
  });
});
