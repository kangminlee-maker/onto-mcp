import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CODEX_PROMPT_INPUT_CHAR_LIMIT, callLlm } from "./llm-caller.js";
import { disableReviewMockRealizationEnv } from "../review/test-fixtures/mock-realization.js";

/**
 * Total-size backstop on the codex stdin route. The guard exists because per-surface budgets are wired
 * surface-by-surface: measured 2026-07-26, two guarded surfaces let a run reach dispatch 74 before a
 * THIRD, unguarded one hit the same provider ceiling with an opaque worker exit.
 *
 * The load-bearing property is NOT "big prompts fail" — it is that the guard **cannot refuse a prompt
 * codex would accept**. That is why it is held at the provider's exact limit in the provider's own unit
 * (characters, per the raw payload `{"max_chars":1048576,"actual_chars":...}`). The boundary and the
 * non-ASCII cases below are the negative controls for that property; without them a byte-counted or
 * margin-carrying guard would pass this file while silently blocking working runs.
 */
class SpawnRecordingChild extends EventEmitter {
  pid = 4242;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });
  kill(): boolean {
    return true;
  }
}

const workerMock = vi.hoisted(() => ({ child: null as unknown, spawnCalls: 0 }));

vi.mock("node:child_process", () => ({
  spawn: () => {
    workerMock.spawnCalls += 1;
    return workerMock.child;
  },
}));

/** Drives a codex call to settlement, reporting rejection instead of throwing. */
async function dispatch(systemPrompt: string, userPrompt: string): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const child = new SpawnRecordingChild();
  workerMock.child = child;
  const settled = callLlm(systemPrompt, userPrompt, {
    provider: "codex",
    model_id: "codex-test",
    max_tokens: 64,
  }).then(
    () => ({ ok: true as const }),
    (e: unknown) => ({ ok: false as const, message: (e as Error).message }),
  );
  // Let the dynamic import("node:child_process") + spawn + listener wiring run, then close the worker
  // so an ACCEPTED prompt settles instead of hanging the test.
  await vi.advanceTimersByTimeAsync(0);
  child.stdout.emit("data", JSON.stringify({ type: "item.completed", item: { text: "{}" } }));
  child.emit("close", 0);
  await vi.advanceTimersByTimeAsync(0);
  return settled;
}

/** combinedPrompt = `${system}\n\n---\n\n${user}`, so the separator counts toward the limit. */
const SEPARATOR_CHARS = "\n\n---\n\n".length;

describe("codex prompt input-limit backstop", () => {
  let restoreMockEnv: (() => void) | undefined;

  beforeEach(() => {
    restoreMockEnv = disableReviewMockRealizationEnv();
    workerMock.spawnCalls = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreMockEnv?.();
    restoreMockEnv = undefined;
  });

  it("rejects an over-limit prompt with the actual size, BEFORE spawning a worker", async () => {
    const user = "a".repeat(CODEX_PROMPT_INPUT_CHAR_LIMIT + 1);
    const result = await dispatch("", user);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("exceeds the worker stdin input limit");
    // The actual count is reported — an opaque "too large" would not be actionable.
    expect(result.message).toContain(String(user.length + SEPARATOR_CHARS));
    expect(result.message).toContain(String(CODEX_PROMPT_INPUT_CHAR_LIMIT));
    // Lifecycle: a doomed call must not leave a child process behind.
    expect(workerMock.spawnCalls).toBe(0);
  });

  it("NEGATIVE CONTROL (boundary): a prompt at exactly the limit is dispatched, not refused", async () => {
    const user = "a".repeat(CODEX_PROMPT_INPUT_CHAR_LIMIT - SEPARATOR_CHARS);
    const result = await dispatch("", user);

    // Exactly at the ceiling ⇒ codex accepts ⇒ the guard must too. A guard carrying any safety margin
    // fails here, which is the point: a margin would refuse calls that currently succeed.
    expect(result.ok).toBe(true);
    expect(workerMock.spawnCalls).toBe(1);
  });

  it("NEGATIVE CONTROL (unit): non-ASCII under the CHAR limit dispatches even though its BYTES exceed it", async () => {
    // Korean is 3 UTF-8 bytes per character. This payload is under the provider's character limit but
    // ~3× over it in bytes, so a byte-counted guard would refuse a prompt codex accepts. This test is
    // what pins the unit; it fails the moment someone "fixes" the guard to count bytes.
    const user = "가".repeat(CODEX_PROMPT_INPUT_CHAR_LIMIT - SEPARATOR_CHARS);
    expect(Buffer.byteLength(user, "utf8")).toBeGreaterThan(CODEX_PROMPT_INPUT_CHAR_LIMIT);

    const result = await dispatch("", user);

    expect(result.ok).toBe(true);
    expect(workerMock.spawnCalls).toBe(1);
  });

  it("counts the system prompt too — the limit binds the COMBINED payload", async () => {
    const half = Math.ceil(CODEX_PROMPT_INPUT_CHAR_LIMIT / 2);
    // Neither side alone exceeds the limit; together they do.
    const result = await dispatch("s".repeat(half), "u".repeat(half));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("exceeds the worker stdin input limit");
    expect(workerMock.spawnCalls).toBe(0);
  });
});
