import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLlm } from "./llm-caller.js";
import { disableReviewMockRealizationEnv } from "../review/test-fixtures/mock-realization.js";

/**
 * The codex worker's execution posture must be a property of onto, not of the operator's global
 * `~/.codex/config.toml`. Measured 2026-07-26, the unpinned worker inherited
 * `approval_policy="never"` + `sandbox_mode="danger-full-access"` — unattended shell and patch
 * access over the repo, while onto only ever asks it to read material and return text.
 *
 * This file pins the flag at the spawn boundary because that is the only place the guarantee is
 * observable from inside the process: the sandbox itself is enforced by codex. The assertions are
 * written against argv ORDER-INDEPENDENTLY but VALUE-EXACTLY, so a future edit that keeps the flag
 * while widening the value (`workspace-write`, `danger-full-access`) fails here rather than silently
 * restoring ambient authority.
 */
class FakeChild extends EventEmitter {
  pid = 4242;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });
  kill(): boolean {
    return true;
  }
}

const workerMock = vi.hoisted(() => ({
  child: null as unknown,
  spawns: [] as Array<{ command: string; args: string[] }>,
}));

vi.mock("node:child_process", () => ({
  spawn: (command: string, args: string[]) => {
    workerMock.spawns.push({ command, args });
    return workerMock.child;
  },
}));

/** Runs one codex dispatch to settlement and returns the argv it spawned with. */
async function spawnArgsForCodexCall(): Promise<string[]> {
  const child = new FakeChild();
  workerMock.child = child;
  const settled = callLlm("system", "user", {
    provider: "codex",
    model_id: "codex-test",
    max_tokens: 64,
  }).then(() => undefined, () => undefined);
  await vi.advanceTimersByTimeAsync(0);
  child.stdout.emit("data", JSON.stringify({ type: "item.completed", item: { text: "{}" } }));
  child.emit("close", 0);
  await vi.advanceTimersByTimeAsync(0);
  await settled;
  const spawned = workerMock.spawns.at(-1);
  expect(spawned, "no codex worker was spawned — the assertions below would pass vacuously").toBeDefined();
  return spawned!.args;
}

describe("codex worker execution posture", () => {
  let restoreMockEnv: (() => void) | undefined;

  beforeEach(() => {
    restoreMockEnv = disableReviewMockRealizationEnv();
    workerMock.spawns = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreMockEnv?.();
    restoreMockEnv = undefined;
  });

  it("pins the sandbox to read-only on every codex dispatch", async () => {
    const args = await spawnArgsForCodexCall();

    const flagIndex = args.indexOf("-s");
    expect(flagIndex, `sandbox flag absent from argv: ${args.join(" ")}`).toBeGreaterThanOrEqual(0);
    // Value-exact: widening to workspace-write / danger-full-access must fail here.
    expect(args[flagIndex + 1]).toBe("read-only");
  });

  it("never passes a widened sandbox value, whatever else the argv carries", async () => {
    const args = await spawnArgsForCodexCall();

    expect(args).not.toContain("workspace-write");
    expect(args).not.toContain("danger-full-access");
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("still carries the prompt on stdin — pinning must not change the transport", async () => {
    const args = await spawnArgsForCodexCall();

    // `-` is codex's read-prompt-from-stdin argument; losing it would silently change the call shape.
    expect(args.at(-1)).toBe("-");
  });
});
