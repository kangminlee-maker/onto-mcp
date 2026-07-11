import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyOpenAIResponsesOutputHeadroom,
  callLlm,
} from "./llm-caller.js";
import { normalizeLlmModelSwitcher } from "./model-switcher.js";
import { readOpenAIResponsesIncompleteEvidence } from "./openai-responses-incomplete-error.js";
import { RECONSTRUCT_SEMANTIC_AUTHOR_MAX_BASE_OUTPUT_TOKENS } from "../reconstruct/output-budget.js";
import {
  disableReviewMockRealizationEnv,
} from "../review/test-fixtures/mock-realization.js";

const openAiMock = vi.hoisted(() => ({
  constructorArgs: [] as Array<{
    apiKey?: string;
    baseURL?: string;
    logLevel?: string;
    logger?: unknown;
  }>,
  // Chat Completions args — grok/lmstudio (and any OpenAI-compatible endpoint).
  createArgs: [] as Array<Record<string, unknown>>,
  // Responses API args — canonical OpenAI reasoning models (gpt-5.x).
  responsesArgs: [] as Array<Record<string, unknown>>,
  // Drives the next responses.create result status (completed | incomplete).
  nextResponseStatus: "completed" as string,
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    static APIConnectionTimeoutError = class extends Error {};
    chat = {
      completions: {
        create: async (args: Record<string, unknown>) => {
          openAiMock.createArgs.push(args);
          return {
            model: "mock-openai-model",
            choices: [{ message: { content: "final answer" } }],
            usage: { prompt_tokens: 3, completion_tokens: 2 },
          };
        },
      },
    };

    responses = {
      create: async (args: Record<string, unknown>) => {
        openAiMock.responsesArgs.push(args);
        const status = openAiMock.nextResponseStatus;
        const completed = status === "completed";
        return {
          id: "resp-mock-1",
          _request_id: "req-mock-1",
          model: "mock-openai-model",
          status,
          incomplete_details:
            status === "incomplete" ? { reason: "max_output_tokens" } : null,
          error: status === "failed" ? { message: "mock failure" } : null,
          output_text: completed ? "final answer" : '{"partial":',
          usage: {
            input_tokens: 3,
            input_tokens_details: { cached_tokens: 1 },
            output_tokens: 12,
            output_tokens_details: { reasoning_tokens: 10 },
          },
        };
      },
    };

    constructor(args: {
      apiKey?: string;
      baseURL?: string;
      logLevel?: string;
      logger?: unknown;
    }) {
      openAiMock.constructorArgs.push(args);
    }
  },
}));

const anthropicMock = vi.hoisted(() => ({
  constructorArgs: [] as Array<{ apiKey?: string }>,
  createArgs: [] as Array<Record<string, unknown>>,
  // Drives the next messages.create stop_reason (end_turn | max_tokens).
  nextStopReason: "end_turn" as string,
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    static APIConnectionTimeoutError = class extends Error {};
    messages = {
      create: async (args: Record<string, unknown>) => {
        anthropicMock.createArgs.push(args);
        return {
          model: "mock-anthropic-model",
          stop_reason: anthropicMock.nextStopReason,
          content: [{ type: "text", text: "final answer" }],
          usage: { input_tokens: 3, output_tokens: 2 },
        };
      },
    };

    constructor(args: { apiKey?: string }) {
      anthropicMock.constructorArgs.push(args);
    }
  },
}));

describe("callLlm credential resolution", () => {
  let originalHome: string | undefined;
  let originalOpenAiKey: string | undefined;
  let originalCustomKey: string | undefined;
  let originalAnthropicKey: string | undefined;
  let originalOpenAiBaseUrl: string | undefined;
  let restoreMockEnv: (() => void) | undefined;
  let tempHome: string;

  beforeEach(async () => {
    originalHome = process.env.HOME;
    originalOpenAiKey = process.env.OPENAI_API_KEY;
    originalCustomKey = process.env.CUSTOM_OPENAI_API_KEY;
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CUSTOM_OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    restoreMockEnv = disableReviewMockRealizationEnv();
    openAiMock.constructorArgs.length = 0;
    openAiMock.createArgs.length = 0;
    openAiMock.responsesArgs.length = 0;
    openAiMock.nextResponseStatus = "completed";
    anthropicMock.constructorArgs.length = 0;
    anthropicMock.createArgs.length = 0;
    anthropicMock.nextStopReason = "end_turn";
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
    if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    if (originalOpenAiBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalOpenAiBaseUrl;
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

  it("passes reasoning effort + max_output_tokens to direct OpenAI calls via the Responses API", async () => {
    const result = await callLlm("system", "user", {
      provider: "openai",
      model_id: "mock-openai-model",
      max_tokens: 64,
      reasoning_effort: "xhigh",
    });

    expect(result.text).toBe("final answer");
    // Canonical OpenAI now routes through the Responses API: effort is
    // reasoning.effort and the output cap is max_output_tokens, not the
    // chat.completions top-level reasoning_effort / max_tokens.
    expect(openAiMock.createArgs).toHaveLength(0);
    const args = openAiMock.responsesArgs[0] as {
      reasoning?: { effort?: string };
      max_output_tokens?: number;
    };
    expect(args?.reasoning?.effort).toBe("xhigh");
    expect(args?.max_output_tokens).toBe(64);
    // Transient call — must opt out of provider-side response storage.
    expect((args as { store?: boolean })?.store).toBe(false);
  });

  it("adds explicit Responses output headroom without changing the base call budget", async () => {
    await callLlm("system", "user", {
      provider: "openai",
      execution_adapter: "openai_sdk",
      model_id: "mock-openai-model",
      max_tokens: 64,
      openai_responses_output_headroom_tokens: 32,
      openai_responses_model_max_output_tokens: 128,
    });

    expect(openAiMock.responsesArgs).toHaveLength(1);
    expect(openAiMock.responsesArgs[0]?.max_output_tokens).toBe(96);
    expect(openAiMock.constructorArgs[0]?.logLevel).toBe("off");
    expect(openAiMock.constructorArgs[0]?.logger).toBeTypeOf("object");
  });

  it("rejects output headroom above the registered model cap before a provider call", async () => {
    await expect(
      callLlm("system", "user", {
        provider: "openai",
        execution_adapter: "openai_sdk",
        model_id: "mock-openai-model",
        max_tokens: 64,
        openai_responses_output_headroom_tokens: 65,
        openai_responses_model_max_output_tokens: 128,
      }),
    ).rejects.toThrow(/exceeds model max_output_tokens=128/);
    expect(openAiMock.responsesArgs).toHaveLength(0);
  });

  it("preflights the largest reconstruct base budget before any provider call", () => {
    const selection = normalizeLlmModelSwitcher({
      provider: "openai",
      auth: "api_key",
      model: "mock-openai-model",
      effort: "low",
    });
    if (!selection) throw new Error("expected normalized selection");

    expect(() => applyOpenAIResponsesOutputHeadroom({
      config: {
        provider: "openai",
        execution_adapter: "openai_sdk",
        model_id: "mock-openai-model",
      },
      selection,
      headroomTokens: 112_001,
      modelMaxOutputTokens: 128_000,
      maxBaseOutputTokens: RECONSTRUCT_SEMANTIC_AUTHOR_MAX_BASE_OUTPUT_TOKENS,
    })).toThrow(/exceeds model max_output_tokens=128000/);
    expect(openAiMock.constructorArgs).toHaveLength(0);
    expect(openAiMock.responsesArgs).toHaveLength(0);
  });

  it("passes effort to direct Anthropic api_key calls via output_config", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";

    const result = await callLlm("system", "user", {
      provider: "anthropic",
      model_id: "mock-anthropic-model",
      max_tokens: 64,
      reasoning_effort: "xhigh",
    });

    expect(result.text).toBe("final answer");
    expect(anthropicMock.constructorArgs[0]?.apiKey).toBe("anthropic-test-key");
    const args = anthropicMock.createArgs[0] as {
      output_config?: { effort?: string };
      thinking?: { type?: string };
    };
    expect(args?.output_config?.effort).toBe("xhigh");
    // effort only modulates reasoning depth on opus-4.x with adaptive thinking on.
    expect(args?.thinking?.type).toBe("adaptive");
  });

  it("rejects a truncated Anthropic response (max_tokens stop) when effort is set", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    anthropicMock.nextStopReason = "max_tokens";

    await expect(
      callLlm("system", "user", {
        provider: "anthropic",
        model_id: "mock-anthropic-model",
        max_tokens: 64,
        reasoning_effort: "xhigh",
      }),
    ).rejects.toThrow(/truncated at max_tokens/);
  });

  it("rejects an incomplete OpenAI Responses result instead of recording empty output", async () => {
    openAiMock.nextResponseStatus = "incomplete";

    await expect(
      callLlm("system", "user", {
        provider: "openai",
        model_id: "mock-openai-model",
        max_tokens: 64,
        reasoning_effort: "low",
      }),
    ).rejects.toThrow(/status=incomplete: max_output_tokens/);
  });

  it("preserves incomplete usage and a partial-output hash in typed evidence", async () => {
    openAiMock.nextResponseStatus = "incomplete";

    let caught: unknown;
    try {
      await callLlm("system", "user", {
        provider: "openai",
        execution_adapter: "openai_sdk",
        model_id: "mock-openai-model",
        max_tokens: 64,
        openai_responses_output_headroom_tokens: 32,
        openai_responses_model_max_output_tokens: 128,
      });
    } catch (error) {
      caught = error;
    }
    const evidence = readOpenAIResponsesIncompleteEvidence(caught);
    expect(evidence).toMatchObject({
      failure_code: "openai_responses_max_output_tokens",
      base_output_ceiling_tokens: 64,
      configured_output_headroom_tokens: 32,
      effective_max_output_tokens: 96,
      input_tokens: 3,
      cached_input_tokens: 1,
      output_tokens: 12,
      reasoning_tokens: 10,
      non_reasoning_output_tokens: 2,
      provider_response_id: "resp-mock-1",
      provider_request_id: "req-mock-1",
      actual_adapter_request_count: null,
    });
    expect(evidence?.partial_output_chars).toBeGreaterThan(0);
    expect(evidence?.partial_output_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(openAiMock.constructorArgs[0]?.baseURL)
      .toBe("https://api.openai.com/v1");
  });

  it("rejects output headroom with a custom actor base_url before dispatch", async () => {
    await expect(callLlm("system", "user", {
      provider: "openai",
      execution_adapter: "openai_sdk",
      base_url: "https://proxy.example/v1",
      model_id: "mock-openai-model",
      max_tokens: 64,
      openai_responses_output_headroom_tokens: 32,
      openai_responses_model_max_output_tokens: 128,
    })).rejects.toThrow(/unsupported dispatch route/);
    expect(openAiMock.constructorArgs).toHaveLength(0);
  });

  it("pins the official Responses endpoint despite OPENAI_BASE_URL", async () => {
    process.env.OPENAI_BASE_URL = "https://proxy.example/v1";
    const result = await callLlm("system", "user", {
      provider: "openai",
      execution_adapter: "openai_sdk",
      model_id: "mock-openai-model",
      max_tokens: 64,
      openai_responses_output_headroom_tokens: 32,
      openai_responses_model_max_output_tokens: 128,
    });

    expect(openAiMock.constructorArgs[0]?.baseURL)
      .toBe("https://api.openai.com/v1");
    expect(result.effective_base_url).toBe("https://api.openai.com/v1");
  });

  it("preserves the ambient OpenAI endpoint when output headroom is off", async () => {
    process.env.OPENAI_BASE_URL =
      "https://user:secret@proxy.example/v1?token=private#fragment";
    const result = await callLlm("system", "user", {
      provider: "openai",
      execution_adapter: "openai_sdk",
      model_id: "mock-openai-model",
      max_tokens: 64,
    });

    expect(openAiMock.constructorArgs[0]?.baseURL).toBeUndefined();
    expect(openAiMock.constructorArgs[0]?.logLevel).toBe("off");
    expect(result.effective_base_url).toBe("https://proxy.example/v1");
    expect(JSON.stringify(result)).not.toMatch(/user|secret|private|fragment/);
  });

  it("sanitizes the ambient endpoint in incomplete evidence", async () => {
    process.env.OPENAI_BASE_URL =
      "https://user:secret@proxy.example/v1?token=private#fragment";
    openAiMock.nextResponseStatus = "incomplete";

    let caught: unknown;
    try {
      await callLlm("system", "user", {
        provider: "openai",
        execution_adapter: "openai_sdk",
        model_id: "mock-openai-model",
        max_tokens: 64,
      });
    } catch (error) {
      caught = error;
    }

    const evidence = readOpenAIResponsesIncompleteEvidence(caught);
    expect(evidence?.effective_base_url).toBe("https://proxy.example/v1");
    expect(JSON.stringify(evidence)).not.toMatch(/user|secret|private|fragment/);
  });

  it("rejects any non-completed OpenAI Responses status (e.g. failed)", async () => {
    openAiMock.nextResponseStatus = "failed";

    await expect(
      callLlm("system", "user", {
        provider: "openai",
        model_id: "mock-openai-model",
        max_tokens: 64,
      }),
    ).rejects.toThrow(/status=failed/);
  });

  it("fails loudly when reasoning_effort is configured for unsupported direct providers", async () => {
    await expect(
      callLlm("system", "user", {
        provider: "grok",
        model_id: "mock-grok-model",
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
