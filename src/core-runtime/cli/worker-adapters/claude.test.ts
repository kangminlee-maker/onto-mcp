import { describe, it, expect } from "vitest";
import { createClaudeWorkerAdapter } from "./claude.js";
import type { WorkerRunContext, WorkerRunState } from "../cli-worker-runner.js";

const ctx: WorkerRunContext = {
  projectRoot: "/repo",
  sessionRoot: "/repo/.onto/review/s1",
  unitId: "logic",
  unitKind: "lens",
  outputPath: "/repo/.onto/review/s1/round1/logic.md",
  boundedPrompt: "prompt",
};

function state(stdout: string, exitCode = 0, stderr = ""): WorkerRunState {
  return { stdout, stderr, exitCode };
}

describe("createClaudeWorkerAdapter — buildArgv", () => {
  it("defaults to a read-only, non-interactive single-turn run", () => {
    const argv = createClaudeWorkerAdapter().buildArgv(ctx);
    expect(argv.slice(0, 3)).toEqual(["-p", "--output-format", "json"]);
    expect(argv).toContain("--tools");
    expect(argv[argv.indexOf("--tools") + 1]).toBe("Read,Glob,Grep");
    expect(argv[argv.indexOf("--permission-mode") + 1]).toBe("bypassPermissions");
    expect(argv).not.toContain("--model");
  });

  it("passes --model / --effort and custom tools / permission / add-dir when provided", () => {
    const argv = createClaudeWorkerAdapter({
      model: "claude-opus-4-8",
      effort: "high",
      tools: "Read",
      permissionMode: "dontAsk",
      addDirs: ["/lib", "/cfg"],
    }).buildArgv(ctx);
    expect(argv[argv.indexOf("--model") + 1]).toBe("claude-opus-4-8");
    expect(argv[argv.indexOf("--effort") + 1]).toBe("high");
    expect(argv[argv.indexOf("--tools") + 1]).toBe("Read");
    expect(argv[argv.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    expect(argv.filter((a) => a === "--add-dir").length).toBe(2);
    expect(argv).toContain("/lib");
    expect(argv).toContain("/cfg");
  });
});

describe("createClaudeWorkerAdapter — extractOutput", () => {
  const adapter = createClaudeWorkerAdapter();

  it("returns the result text from a stream-event array", async () => {
    const stdout = JSON.stringify([
      { type: "system", subtype: "init" },
      { type: "result", is_error: false, result: "# Lens Output\n- finding" },
    ]);
    expect(await adapter.extractOutput(ctx, state(stdout))).toBe("# Lens Output\n- finding");
  });

  it("throws on an is_error result element", async () => {
    const stdout = JSON.stringify([
      { type: "result", is_error: true, result: "model not allowed" },
    ]);
    await expect(adapter.extractOutput(ctx, state(stdout))).rejects.toThrow(/error result.*model not allowed/);
  });

  it("throws when there is no result event (exit-0-but-no-answer)", async () => {
    const stdout = JSON.stringify([{ type: "system", subtype: "init" }]);
    await expect(adapter.extractOutput(ctx, state(stdout))).rejects.toThrow(/no result event/);
  });
});

describe("createClaudeWorkerAdapter — classifyExitError", () => {
  it("adds an auth hint when stderr looks like a login failure", () => {
    const adapter = createClaudeWorkerAdapter();
    const hint = adapter.classifyExitError?.(ctx, state("", 1, "Error: not logged in. Please run /login"));
    expect(hint).toMatch(/claude auth login/);
  });

  it("returns undefined for unrelated failures", () => {
    const adapter = createClaudeWorkerAdapter();
    expect(adapter.classifyExitError?.(ctx, state("", 1, "some other error"))).toBeUndefined();
  });
});
