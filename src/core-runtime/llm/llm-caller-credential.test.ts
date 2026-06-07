import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLlm } from "./llm-caller.js";
import {
  disableReviewMockRealizationEnv,
} from "../review/test-fixtures/mock-realization.js";

const openAiMock = vi.hoisted(() => ({
  constructorArgs: [] as Array<{ apiKey?: string; baseURL?: string }>,
  createArgs: [] as Array<Record<string, unknown>>,
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: async (args: Record<string, unknown>) => {
          openAiMock.createArgs.push(args);
          return {
          model: "mock-openai-model",
          choices: [
            {
              message: { content: "final answer" },
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
          };
        },
      },
    };

    constructor(args: { apiKey?: string; baseURL?: string }) {
      openAiMock.constructorArgs.push(args);
    }
  },
}));

describe("callLlm credential resolution", () => {
  let originalHome: string | undefined;
  let originalOpenAiKey: string | undefined;
  let originalCustomKey: string | undefined;
  let restoreMockEnv: (() => void) | undefined;
  let tempHome: string;

  beforeEach(async () => {
    originalHome = process.env.HOME;
    originalOpenAiKey = process.env.OPENAI_API_KEY;
    originalCustomKey = process.env.CUSTOM_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CUSTOM_OPENAI_API_KEY;
    restoreMockEnv = disableReviewMockRealizationEnv();
    openAiMock.constructorArgs.length = 0;
    openAiMock.createArgs.length = 0;
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "onto-llm-caller-home-"));
    process.env.HOME = tempHome;
    await fs.mkdir(path.join(tempHome, ".codex"), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, ".codex", "auth.json"),
      JSON.stringify({ OPENAI_API_KEY: "codex-auth-key" }),
      "utf8",
    );
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalCustomKey === undefined) delete process.env.CUSTOM_OPENAI_API_KEY;
    else process.env.CUSTOM_OPENAI_API_KEY = originalCustomKey;
    restoreMockEnv?.();
    restoreMockEnv = undefined;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it("falls back to Codex auth for default OpenAI calls", async () => {
    const result = await callLlm("system", "user", {
      provider: "openai",
      model_id: "mock-openai-model",
      max_tokens: 64,
    });

    expect(result.text).toBe("final answer");
    expect(openAiMock.constructorArgs[0]?.apiKey).toBe("codex-auth-key");
  });

  it("passes reasoning_effort to direct OpenAI calls", async () => {
    const result = await callLlm("system", "user", {
      provider: "openai",
      model_id: "mock-openai-model",
      max_tokens: 64,
      reasoning_effort: "xhigh",
    });

    expect(result.text).toBe("final answer");
    expect(openAiMock.createArgs[0]?.reasoning_effort).toBe("xhigh");
  });

  it("fails loudly when reasoning_effort is configured for unsupported direct providers", async () => {
    await expect(
      callLlm("system", "user", {
        provider: "anthropic",
        model_id: "mock-anthropic-model",
        max_tokens: 64,
        reasoning_effort: "xhigh",
      }),
    ).rejects.toThrow("cannot honor reasoning_effort");
  });

  it("requires exact custom env for direct OpenAI calls", async () => {
    await expect(
      callLlm("system", "user", {
        provider: "openai",
        model_id: "mock-openai-model",
        max_tokens: 64,
        api_key_env: "CUSTOM_OPENAI_API_KEY",
      }),
    ).rejects.toThrow("CUSTOM_OPENAI_API_KEY");
    expect(openAiMock.constructorArgs).toHaveLength(0);
  });

  it("requires exact custom env for plan-routed OpenAI calls", async () => {
    await expect(
      callLlm("system", "user", {
        provider: "openai",
        model_id: "mock-openai-model",
        max_tokens: 64,
        api_key_env: "CUSTOM_OPENAI_API_KEY",
        plan: {
          provider_identity: "openai",
          model_id: "mock-openai-model",
        },
      }),
    ).rejects.toThrow("CUSTOM_OPENAI_API_KEY");
    expect(openAiMock.constructorArgs).toHaveLength(0);
  });

  it("rejects plan-routed review mock provider as an unsupported provider identity", async () => {
    await expect(
      callLlm("system", "user", {
        provider: "openai",
        model_id: "mock-openai-model",
        max_tokens: 64,
        plan: {
          provider_identity: "mock",
          model_id: "mock-llm-deterministic",
        },
      }),
    ).rejects.toThrow("dispatchByPlan: unexpected provider_identity=mock");
    expect(openAiMock.constructorArgs).toHaveLength(0);
  });

  it("uses exact custom env for plan-routed OpenAI calls", async () => {
    process.env.CUSTOM_OPENAI_API_KEY = "custom-env-key";

    const result = await callLlm("system", "user", {
      provider: "openai",
      model_id: "mock-openai-model",
      max_tokens: 64,
      api_key_env: "CUSTOM_OPENAI_API_KEY",
      plan: {
        provider_identity: "openai",
        model_id: "mock-openai-model",
      },
    });

    expect(result.text).toBe("final answer");
    expect(openAiMock.constructorArgs[0]?.apiKey).toBe("custom-env-key");
  });
});
