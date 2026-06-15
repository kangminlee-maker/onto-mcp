import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

// Boundary-mock the claude CLI spawn: callClaudeCli does
// `await import("node:child_process")`, so intercept that module.
let nextChild: FakeChild | undefined;
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => nextChild),
}));

import { callLlm, resolveLlmProviderConfig } from "./llm-caller.js";

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid: number;
  kill: () => void;
}

/** A fake claude child that emits `stdout` then closes with `exitCode`. */
function fakeClaudeChild(stdout: string, exitCode = 0): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 4242;
  child.kill = vi.fn();
  // Emit after the caller has attached its listeners.
  setImmediate(() => {
    if (stdout.length > 0) child.stdout.emit("data", stdout);
    child.emit("close", exitCode);
  });
  return child;
}

const ANTHROPIC_OAUTH_LLM = {
  provider: "anthropic",
  auth: "oauth",
  model: "claude-opus-4",
};

describe("anthropic OAuth → Claude Code CLI worker (reconstruct direct-call)", () => {
  beforeEach(() => {
    delete process.env.ONTO_LLM_MOCK;
  });
  afterEach(() => {
    vi.clearAllMocks();
    nextChild = undefined;
  });

  it("resolveLlmProviderConfig carries execution_adapter=claude_code for anthropic+oauth", () => {
    const cfg = resolveLlmProviderConfig({ config: { llm: ANTHROPIC_OAUTH_LLM } });
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.execution_adapter).toBe("claude_code");
    expect(cfg.model_id).toBe("claude-opus-4");
  });

  it("keeps anthropic+api_key on the SDK adapter (does NOT route to the worker)", () => {
    const cfg = resolveLlmProviderConfig({
      config: { llm: { provider: "anthropic", auth: "api_key", model: "claude-opus-4" } },
    });
    expect(cfg.execution_adapter).toBe("anthropic_sdk");
  });

  it("callLlm dispatches anthropic+oauth to the claude worker and returns its result text + usage", async () => {
    const resultEvent = JSON.stringify([
      { type: "system", subtype: "init" },
      {
        type: "result",
        subtype: "success",
        result: "RECONSTRUCTED",
        model: "claude-opus-4",
        usage: { input_tokens: 12, output_tokens: 3 },
      },
    ]);
    nextChild = fakeClaudeChild(resultEvent, 0);
    const cfg = resolveLlmProviderConfig({ config: { llm: ANTHROPIC_OAUTH_LLM } });

    const res = await callLlm("system prompt", "user prompt", cfg);

    expect(res.text).toBe("RECONSTRUCTED");
    expect(res.input_tokens).toBe(12);
    expect(res.output_tokens).toBe(3);
    expect(res.model_id).toBe("claude-opus-4");
    expect(res.declared_billing_mode).toBe("subscription");
    expect(res.effective_base_url).toBe("claude-cli://oauth");
  });

  it("tolerates the single result-object form and estimates tokens when usage is absent", async () => {
    nextChild = fakeClaudeChild(
      JSON.stringify({ type: "result", subtype: "success", result: "OK" }),
      0,
    );
    const cfg = resolveLlmProviderConfig({ config: { llm: ANTHROPIC_OAUTH_LLM } });

    const res = await callLlm("system prompt", "user prompt", cfg);

    expect(res.text).toBe("OK");
    expect(res.input_tokens).toBeGreaterThan(0);
    expect(res.output_tokens).toBeGreaterThan(0);
  });

  it("surfaces a claude worker failure (is_error result event)", async () => {
    nextChild = fakeClaudeChild(
      JSON.stringify([{ type: "result", is_error: true, result: "login required" }]),
      0,
    );
    const cfg = resolveLlmProviderConfig({ config: { llm: ANTHROPIC_OAUTH_LLM } });

    await expect(callLlm("system prompt", "user prompt", cfg)).rejects.toThrow(
      /login required/,
    );
  });

  it("surfaces a non-zero claude exit as an error", async () => {
    const child = new EventEmitter() as FakeChild;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 99;
    child.kill = vi.fn();
    setImmediate(() => {
      child.stderr.emit("data", "claude: not logged in");
      child.emit("close", 1);
    });
    nextChild = child;
    const cfg = resolveLlmProviderConfig({ config: { llm: ANTHROPIC_OAUTH_LLM } });

    await expect(callLlm("system prompt", "user prompt", cfg)).rejects.toThrow(
      /not logged in/,
    );
  });
});
