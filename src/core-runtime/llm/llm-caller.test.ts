import { describe, it, expect } from "vitest";
import { parseClaudeResultEvent } from "./llm-caller.js";

describe("parseClaudeResultEvent — claude -p --output-format json", () => {
  it("extracts the result element from a top-level stream-event ARRAY", () => {
    const stdout = JSON.stringify([
      { type: "system", subtype: "init", session_id: "s1" },
      { type: "assistant", message: { model: "claude-haiku-4-5-20251001" } },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "PONG",
        total_cost_usd: 0.0123,
        session_id: "s1",
        usage: { input_tokens: 11, output_tokens: 3 },
        modelUsage: { "claude-haiku-4-5-20251001": { costUSD: 0.0123 } },
      },
    ]);
    const evt = parseClaudeResultEvent(stdout);
    expect(evt.result).toBe("PONG");
    expect(evt.usage?.input_tokens).toBe(11);
    expect(evt.usage?.output_tokens).toBe(3);
    expect(evt.total_cost_usd).toBeCloseTo(0.0123);
    expect(Object.keys(evt.modelUsage ?? {})[0]).toBe("claude-haiku-4-5-20251001");
  });

  it("accepts a single result OBJECT (non-array environments)", () => {
    const stdout = JSON.stringify({
      type: "result",
      is_error: false,
      result: "hi",
      usage: { input_tokens: 5, output_tokens: 1 },
    });
    const evt = parseClaudeResultEvent(stdout);
    expect(evt.result).toBe("hi");
    expect(evt.usage?.output_tokens).toBe(1);
  });

  it("throws when the array has no result event (exit-0-but-no-answer)", () => {
    const stdout = JSON.stringify([
      { type: "system", subtype: "init" },
      { type: "assistant", message: {} },
    ]);
    expect(() => parseClaudeResultEvent(stdout)).toThrow(/no result event/);
  });

  it("throws on unparseable stdout", () => {
    expect(() => parseClaudeResultEvent("not json at all")).toThrow(/unparseable JSON/);
  });

  it("surfaces an is_error result element for the caller to reject", () => {
    const stdout = JSON.stringify([
      { type: "result", is_error: true, result: "model not allowed" },
    ]);
    const evt = parseClaudeResultEvent(stdout);
    expect(evt.is_error).toBe(true);
    expect(evt.result).toBe("model not allowed");
  });
});
