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

/**
 * The sandbox pin above covers codex's own shell/patch. It does NOT cover MCP servers or the
 * account connectors — measured 2026-07-26, an `-s read-only` worker still called an MCP tool and
 * still enumerated GitHub write tools (`_merge_pull_request`, `_create_file`, …). These flags close
 * those doors; each is pinned here so a later edit cannot quietly reopen one.
 */
describe("codex worker tool surface", () => {
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

  it("drops the operator's user config, so no user-configured MCP server reaches the worker", async () => {
    const args = await spawnArgsForCodexCall();
    expect(args).toContain("--ignore-user-config");
  });

  it("disables the account connectors and the shell, as adjacent --disable pairs", async () => {
    const args = await spawnArgsForCodexCall();

    // Pair-wise, not merely "contains the word": `--disable` must actually carry each value.
    const pairs = args.flatMap((a, i) => (a === "--disable" ? [args[i + 1]] : []));
    expect(pairs, `--disable pairs in argv: ${args.join(" ")}`).toContain("apps");
    expect(pairs).toContain("shell_tool");
  });

  it("keeps the sandbox pin alongside the surface flags — they close different doors", async () => {
    const args = await spawnArgsForCodexCall();

    expect(args[args.indexOf("-s") + 1]).toBe("read-only");
    expect(args).toContain("--ignore-user-config");
  });
});
