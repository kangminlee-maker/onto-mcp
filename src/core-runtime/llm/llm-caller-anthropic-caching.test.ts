import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Boundary-mock the Anthropic SDK: callAnthropic does
// `await import("@anthropic-ai/sdk")`, so intercept the module and capture the
// messages.create payload. vi.hoisted lets the factory reference the spy.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class APIConnectionTimeoutError extends Error {}
  class Anthropic {
    messages = { create: createMock };
    static APIConnectionTimeoutError = APIConnectionTimeoutError;
    constructor(_opts: unknown) {}
  }
  return { default: Anthropic };
});

import { callLlm } from "./llm-caller.js";

const ANTHROPIC_CONFIG = {
  provider: "anthropic" as const,
  model_id: "claude-opus-4-8",
  max_tokens: 1024,
};

function anthropicResponse(usage: Record<string, number | null>) {
  return {
    model: "claude-opus-4-8",
    stop_reason: "end_turn",
    content: [{ type: "text", text: "ok" }],
    usage,
  };
}

describe("anthropic api_key route: prompt caching (cache_control + token telemetry)", () => {
  beforeEach(() => {
    delete process.env.ONTO_LLM_MOCK;
    process.env.ANTHROPIC_API_KEY = "test-key";
    createMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("marks the system block and the user message as ephemeral cache breakpoints", async () => {
    createMock.mockResolvedValue(
      anthropicResponse({
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      }),
    );

    await callLlm("SYSTEM_PROMPT", "USER_PROMPT", ANTHROPIC_CONFIG);

    const arg = createMock.mock.calls[0]![0] as {
      system: Array<{ type: string; text: string; cache_control?: unknown }>;
      messages: Array<{
        role: string;
        content: Array<{ type: string; text: string; cache_control?: unknown }>;
      }>;
    };
    // System is a text block carrying a cache breakpoint (not a bare string).
    expect(Array.isArray(arg.system)).toBe(true);
    expect(arg.system[0]).toMatchObject({
      type: "text",
      text: "SYSTEM_PROMPT",
      cache_control: { type: "ephemeral" },
    });
    // User message content is a text block carrying a cache breakpoint.
    const userBlock = arg.messages[0]!.content[0]!;
    expect(userBlock).toMatchObject({
      type: "text",
      text: "USER_PROMPT",
      cache_control: { type: "ephemeral" },
    });
  });

  it("reports input_tokens as the total = uncached + cache_read + cache_creation, and surfaces the split", async () => {
    createMock.mockResolvedValue(
      anthropicResponse({
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 250,
      }),
    );

    const result = await callLlm("SYS", "USER", ANTHROPIC_CONFIG);

    // The API's input_tokens excludes cache; the reported total sums them back
    // so it stays comparable to an uncached call.
    expect(result.input_tokens).toBe(100 + 4000 + 250);
    expect(result.output_tokens).toBe(20);
    expect(result.cache_read_input_tokens).toBe(4000);
    expect(result.cache_creation_input_tokens).toBe(250);
  });

  it("treats missing cache usage fields as zero (uncached call total equals input_tokens)", async () => {
    createMock.mockResolvedValue(
      anthropicResponse({ input_tokens: 512, output_tokens: 64 }),
    );

    const result = await callLlm("SYS", "USER", ANTHROPIC_CONFIG);

    expect(result.input_tokens).toBe(512);
    expect(result.cache_read_input_tokens).toBe(0);
    expect(result.cache_creation_input_tokens).toBe(0);
  });

  it("keeps an empty system prompt as a bare string (no empty cache block)", async () => {
    createMock.mockResolvedValue(
      anthropicResponse({ input_tokens: 10, output_tokens: 5 }),
    );

    await callLlm("", "USER_PROMPT", ANTHROPIC_CONFIG);

    const arg = createMock.mock.calls[0]![0] as { system: unknown };
    expect(arg.system).toBe("");
  });
});
