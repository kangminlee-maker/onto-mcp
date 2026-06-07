import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLlmWithTools } from "../llm/llm-tool-loop.js";

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
              finish_reason: "stop",
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

describe("callLlmWithTools credential resolution", () => {
  let originalHome: string | undefined;
  let originalOpenAiKey: string | undefined;
  let originalCustomKey: string | undefined;
  let tempHome: string;

  beforeEach(async () => {
    originalHome = process.env.HOME;
    originalOpenAiKey = process.env.OPENAI_API_KEY;
    originalCustomKey = process.env.CUSTOM_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CUSTOM_OPENAI_API_KEY;
    openAiMock.constructorArgs.length = 0;
    openAiMock.createArgs.length = 0;
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "onto-tool-loop-home-"));
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
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it("falls back to Codex auth for OpenAI native tool loops when no custom env is configured", async () => {
    const result = await callLlmWithTools(
      "system",
      "user",
      [],
      {
        provider: "openai",
        model_id: "mock-openai-model",
      },
      {
        projectRoot: tempHome,
        ontoHome: tempHome,
      },
    );

    expect(result.text).toBe("final answer");
    expect(openAiMock.constructorArgs[0]?.apiKey).toBe("codex-auth-key");
  });

  it("passes reasoning_effort to OpenAI native tool loops", async () => {
    const result = await callLlmWithTools(
      "system",
      "user",
      [],
      {
        provider: "openai",
        model_id: "mock-openai-model",
        reasoning_effort: "xhigh",
      },
      {
        projectRoot: tempHome,
        ontoHome: tempHome,
      },
    );

    expect(result.text).toBe("final answer");
    expect(openAiMock.createArgs[0]?.reasoning_effort).toBe("xhigh");
  });

  it("fails loudly when reasoning_effort is configured for unsupported tool-loop providers", async () => {
    await expect(
      callLlmWithTools(
        "system",
        "user",
        [],
        {
          provider: "anthropic",
          model_id: "mock-anthropic-model",
          reasoning_effort: "xhigh",
        },
        {
          projectRoot: tempHome,
          ontoHome: tempHome,
        },
      ),
    ).rejects.toThrow("cannot honor reasoning_effort");
  });

  it("ignores blank Codex auth for OpenAI native tool loops", async () => {
    await fs.writeFile(
      path.join(tempHome, ".codex", "auth.json"),
      JSON.stringify({ OPENAI_API_KEY: "   " }),
      "utf8",
    );

    await expect(
      callLlmWithTools(
        "system",
        "user",
        [],
        {
          provider: "openai",
          model_id: "mock-openai-model",
        },
        {
          projectRoot: tempHome,
          ontoHome: tempHome,
        },
      ),
    ).rejects.toThrow(
      "callLlmWithTools(openai) requires OPENAI_API_KEY or ~/.codex/auth.json OPENAI_API_KEY",
    );
  });

  it("requires the exact configured custom env for OpenAI native tool loops", async () => {
    await expect(
      callLlmWithTools(
        "system",
        "user",
        [],
        {
          provider: "openai",
          model_id: "mock-openai-model",
          api_key_env: "CUSTOM_OPENAI_API_KEY",
        },
        {
          projectRoot: tempHome,
          ontoHome: tempHome,
        },
      ),
    ).rejects.toThrow(
      "callLlmWithTools(openai) requires CUSTOM_OPENAI_API_KEY",
    );
  });

  it("uses the exact configured custom env for OpenAI native tool loops", async () => {
    process.env.CUSTOM_OPENAI_API_KEY = "custom-env-key";

    const result = await callLlmWithTools(
      "system",
      "user",
      [],
      {
        provider: "openai",
        model_id: "mock-openai-model",
        api_key_env: "CUSTOM_OPENAI_API_KEY",
      },
      {
        projectRoot: tempHome,
        ontoHome: tempHome,
      },
    );

    expect(result.text).toBe("final answer");
    expect(openAiMock.constructorArgs[0]?.apiKey).toBe("custom-env-key");
  });

  it("reports Codex auth fallback in default OpenAI native missing credential errors", async () => {
    await fs.rm(path.join(tempHome, ".codex", "auth.json"), { force: true });

    await expect(
      callLlmWithTools(
        "system",
        "user",
        [],
        {
          provider: "openai",
          model_id: "mock-openai-model",
        },
        {
          projectRoot: tempHome,
          ontoHome: tempHome,
        },
      ),
    ).rejects.toThrow(
      "callLlmWithTools(openai) requires OPENAI_API_KEY or ~/.codex/auth.json OPENAI_API_KEY",
    );
  });
});
