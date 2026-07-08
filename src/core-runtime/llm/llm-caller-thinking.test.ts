import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLlm } from "./llm-caller.js";
import { disableReviewMockRealizationEnv } from "../review/test-fixtures/mock-realization.js";

// Capture the exact request body callAnthropic hands the SDK, and control the
// response, so we can assert on the `thinking` opt-in wiring without a live
// call. Shared state via vi.hoisted (the vi.mock factory is hoisted above the
// imports). Mirrors the SDK mock shape used by llm-caller-timeout.test.ts.
const hoisted = vi.hoisted(() => ({
  lastCreateArgs: undefined as Record<string, unknown> | undefined,
  nextStopReason: "end_turn" as string,
}));

vi.mock("@anthropic-ai/sdk", () => {
  class APIConnectionTimeoutError extends Error {}
  class MockAnthropic {
    static APIConnectionTimeoutError = APIConnectionTimeoutError;
    messages = {
      create: async (args: Record<string, unknown>) => {
        hoisted.lastCreateArgs = args;
        return {
          model: (args.model as string) ?? "mock",
          stop_reason: hoisted.nextStopReason,
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [{ type: "text", text: "ok" }],
        };
      },
    };
    constructor(_args: unknown) {}
  }
  return { default: MockAnthropic };
});

const ANTHROPIC_BASE = {
  provider: "anthropic" as const,
  model_id: "claude-sonnet-5",
  max_tokens: 64,
};

describe("callAnthropic thinking opt-in wiring", () => {
  let restoreMockEnv: (() => void) | undefined;
  let originalAnthropic: string | undefined;

  beforeEach(() => {
    restoreMockEnv = disableReviewMockRealizationEnv();
    originalAnthropic = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    hoisted.lastCreateArgs = undefined;
    hoisted.nextStopReason = "end_turn";
  });

  afterEach(() => {
    restoreMockEnv?.();
    restoreMockEnv = undefined;
    if (originalAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropic;
  });

  it("thinking_mode='disabled' sends thinking:{type:'disabled'} and no output_config", async () => {
    await callLlm("system", "user", {
      ...ANTHROPIC_BASE,
      thinking_mode: "disabled",
    });
    const req = hoisted.lastCreateArgs;
    expect(req).toBeDefined();
    expect(req?.thinking).toEqual({ type: "disabled" });
    expect(req).not.toHaveProperty("output_config");
  });

  it("default (no thinking_mode, no reasoning_effort) omits the thinking block — legacy byte-parity", async () => {
    await callLlm("system", "user", { ...ANTHROPIC_BASE });
    const req = hoisted.lastCreateArgs;
    expect(req).toBeDefined();
    // The legacy request carries no thinking / output_config keys at all.
    expect(req).not.toHaveProperty("thinking");
    expect(req).not.toHaveProperty("output_config");
    // Core fields are still present.
    expect(req?.model).toBe("claude-sonnet-5");
    expect(req?.max_tokens).toBe(64);
  });

  it("reasoning_effort (no thinking_mode) keeps the adaptive path unchanged", async () => {
    await callLlm("system", "user", {
      ...ANTHROPIC_BASE,
      reasoning_effort: "high",
    });
    const req = hoisted.lastCreateArgs;
    expect(req?.thinking).toEqual({ type: "adaptive" });
    expect(req?.output_config).toEqual({ effort: "high" });
  });

  it("thinking_mode='disabled' takes precedence over reasoning_effort", async () => {
    await callLlm("system", "user", {
      ...ANTHROPIC_BASE,
      reasoning_effort: "high",
      thinking_mode: "disabled",
    });
    const req = hoisted.lastCreateArgs;
    expect(req?.thinking).toEqual({ type: "disabled" });
    expect(req).not.toHaveProperty("output_config");
  });

  it("fails loud on a max_tokens truncation while thinking is disabled", async () => {
    hoisted.nextStopReason = "max_tokens";
    const err = await callLlm("system", "user", {
      ...ANTHROPIC_BASE,
      thinking_mode: "disabled",
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/truncated at max_tokens/);
    expect((err as Error).message).toMatch(/thinking disabled/);
  });

  it("does NOT guard truncation on the legacy no-opt path (unchanged)", async () => {
    hoisted.nextStopReason = "max_tokens";
    const result = await callLlm("system", "user", { ...ANTHROPIC_BASE });
    // No effort, no thinking_mode → the legacy path returns the (possibly
    // truncated) text rather than throwing, exactly as before this change.
    expect(result.text).toBe("ok");
  });
});
