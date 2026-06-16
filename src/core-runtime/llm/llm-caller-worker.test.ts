import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLlm } from "./llm-caller.js";
import { disableReviewMockRealizationEnv } from "../review/test-fixtures/mock-realization.js";

// A fake child that models a worker which IGNORES SIGTERM: .kill() records the
// signal but only an explicit SIGKILL emits "close". This is the hang case the
// SIGKILL-escalation guard fixes.
class FakeChild extends EventEmitter {
  pid = 4242;
  signals: string[] = [];
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn(),
  });
  kill(signal: string): boolean {
    this.signals.push(signal);
    if (signal === "SIGKILL") {
      // SIGKILL cannot be trapped — the process dies and "close" fires.
      queueMicrotask(() => this.emit("close", 137));
    }
    return true;
  }
}

const workerMock = vi.hoisted(() => ({ child: null as unknown }));

vi.mock("node:child_process", () => ({
  spawn: () => workerMock.child,
}));

describe("CLI worker timeout lifecycle", () => {
  let restoreMockEnv: (() => void) | undefined;

  beforeEach(() => {
    restoreMockEnv = disableReviewMockRealizationEnv();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreMockEnv?.();
    restoreMockEnv = undefined;
  });

  it("escalates SIGTERM to SIGKILL when the worker ignores the timeout signal, and registers a stdin error listener", async () => {
    const child = new FakeChild();
    workerMock.child = child;
    const stdinErrorListeners: number[] = [];
    child.stdin.on("newListener", (event: string) => {
      if (event === "error") stdinErrorListeners.push(1);
    });

    const settled = callLlm("system", "user", {
      provider: "codex",
      model_id: "codex-test",
      max_tokens: 64,
    }).then(
      () => ({ ok: true as const }),
      (e: unknown) => ({ ok: false as const, error: e }),
    );

    // Let the dynamic import("node:child_process") + spawn + listener wiring run.
    await vi.advanceTimersByTimeAsync(0);

    // EPIPE guard: an error listener is attached to stdin before writing.
    expect(stdinErrorListeners.length).toBeGreaterThan(0);
    // Emitting an error on stdin must NOT throw (would crash the host otherwise).
    expect(() => child.stdin.emit("error", new Error("EPIPE"))).not.toThrow();

    // Drive past the worker timeout — SIGTERM is sent but the worker ignores it.
    await vi.advanceTimersByTimeAsync(600_000);
    expect(child.signals).toContain("SIGTERM");
    expect(child.signals).not.toContain("SIGKILL");

    // Past the SIGKILL grace period the guard escalates; the process then dies.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(child.signals).toContain("SIGKILL");

    const result = await settled;
    expect(result.ok).toBe(false);
    expect((result as { error: Error }).error.message).toMatch(
      /timed out after \d+ms/,
    );
  });
});
