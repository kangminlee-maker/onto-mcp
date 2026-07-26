import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLlm } from "./llm-caller.js";
import {
  isLlmTimeoutError,
} from "../reconstruct/authoring-llm-call.js";
import { disableReviewMockRealizationEnv } from "../review/test-fixtures/mock-realization.js";

// Each SDK mock rejects the request with its own APIConnectionTimeoutError —
// the class the real SDK throws once `timeout` is exceeded and `maxRetries` is
// spent. The mock default export exposes the class statically so llm-caller's
// `err instanceof OpenAI.APIConnectionTimeoutError` / `Anthropic.APIConnection
// TimeoutError` detection matches (instanceof, not name — the real class does
// not override Error.prototype.name).
vi.mock("openai", () => {
  class APIConnectionTimeoutError extends Error {}
  class MockOpenAI {
    static APIConnectionTimeoutError = APIConnectionTimeoutError;
    // Canonical OpenAI now routes through the Responses API; grok/lmstudio still
    // use chat.completions. Both surfaces reject with the SDK timeout class.
    chat = {
      completions: {
        create: async () => {
          throw new APIConnectionTimeoutError("Request timed out.");
        },
      },
    };
    responses = {
      create: async () => {
        throw new APIConnectionTimeoutError("Request timed out.");
      },
    };
    constructor(_args: unknown) {}
  }
  return { default: MockOpenAI };
});

vi.mock("@anthropic-ai/sdk", () => {
  class APIConnectionTimeoutError extends Error {}
  class MockAnthropic {
    static APIConnectionTimeoutError = APIConnectionTimeoutError;
    messages = {
      create: async () => {
        throw new APIConnectionTimeoutError("Request timed out.");
      },
    };
    constructor(_args: unknown) {}
  }
  return { default: MockAnthropic };
});

describe("llm-caller SDK timeout classification", () => {
  let restoreMockEnv: (() => void) | undefined;
  let originalOpenAi: string | undefined;
  let originalAnthropic: string | undefined;

  beforeEach(() => {
    restoreMockEnv = disableReviewMockRealizationEnv();
    originalOpenAi = process.env.OPENAI_API_KEY;
    originalAnthropic = process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  });

  afterEach(() => {
    restoreMockEnv?.();
    restoreMockEnv = undefined;
    if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAi;
    if (originalAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropic;
  });

  it("the raw SDK timeout message is NOT recognized — the reason normalization is needed", () => {
    // This is the bug the fix closes: the SDK throws "Request timed out.", which
    // the timeout-recovery classifier does not match, so api_key-provider timeout
    // recovery was dead until llm-caller normalized the message.
    expect(isLlmTimeoutError(new Error("Request timed out."))).toBe(false);
  });

  it("normalizes an OpenAI SDK timeout into a classifier-recognized message", async () => {
    const err = await callLlm("system", "user", {
      provider: "openai",
      model_id: "gpt-test",
      max_tokens: 64,
    }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/timed out after \d+ms/);
    // The whole point: the normalized message triggers timeout recovery.
    expect(isLlmTimeoutError(err)).toBe(true);
    // Original SDK error preserved for diagnostics.
    expect((err as Error).cause).toBeInstanceOf(Error);
  });

  it("normalizes an Anthropic SDK timeout into a classifier-recognized message", async () => {
    const err = await callLlm("system", "user", {
      provider: "anthropic",
      model_id: "claude-test",
      max_tokens: 64,
    }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/timed out after \d+ms/);
    expect(isLlmTimeoutError(err)).toBe(true);
    expect((err as Error).cause).toBeInstanceOf(Error);
  });
});
