import { describe, expect, it, vi } from "vitest";
import { parseRegisterArgs, runRegister } from "./register.js";
import {
  createCliHost,
  createClaudeCodeHost,
  type CommandRunner,
  type CommandRun,
} from "./cli-host.js";
import {
  type ApplyResult,
  type HostId,
  type HostPlan,
  type HostTarget,
  type RegistrationEntry,
} from "./types.js";

describe("parseRegisterArgs", () => {
  it("defaults name/command and leaves hosts undefined", () => {
    const parsed = parseRegisterArgs([]);
    expect(parsed.name).toBe("onto");
    expect(parsed.command).toBe("onto");
    expect(parsed.hosts).toBeUndefined();
  });

  it("parses --hosts list and flags", () => {
    const parsed = parseRegisterArgs([
      "--hosts",
      "cursor, codex",
      "--yes",
      "--dry-run",
      "--force",
    ]);
    expect(parsed.hosts).toEqual(["cursor", "codex"]);
    expect(parsed.yes).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.force).toBe(true);
  });

  it("collects invalid host ids", () => {
    const parsed = parseRegisterArgs(["--hosts", "cursor,bogus"]);
    expect(parsed.hosts).toEqual(["cursor"]);
    expect(parsed.invalidHosts).toEqual(["bogus"]);
  });

  it("records --all and unknown flags", () => {
    const parsed = parseRegisterArgs(["--all", "--wat"]);
    expect(parsed.hosts).toBe("all");
    expect(parsed.unknownFlags).toEqual(["--wat"]);
  });

  it("parses --claude-config-dir", () => {
    const parsed = parseRegisterArgs(["--claude-config-dir", "/Users/x/.claude-1"]);
    expect(parsed.claudeConfigDir).toBe("/Users/x/.claude-1");
  });
});

/** A fake host target that records apply() calls. */
function fakeTarget(id: HostId, displayName: string): HostTarget & { applied: number } {
  const target = {
    id,
    displayName,
    applied: 0,
    detect: () => "config" as const,
    plan: (_entry: RegistrationEntry): HostPlan => ({
      hostId: id,
      displayName,
      detection: "config",
      method: "config",
      summary: `plan ${id}`,
    }),
    apply: async (_entry: RegistrationEntry): Promise<ApplyResult> => {
      target.applied += 1;
      return { hostId: id, displayName, outcome: "registered", detail: "ok" };
    },
  };
  return target;
}

describe("runRegister — orchestration", () => {
  it("dry-run writes nothing", async () => {
    const t = fakeTarget("cursor", "Cursor");
    const code = await runRegister(["--hosts", "cursor", "--dry-run"], {
      targets: [t],
      isTty: false,
    });
    expect(code).toBe(0);
    expect(t.applied).toBe(0);
  });

  it("non-TTY without --yes refuses to write", async () => {
    const t = fakeTarget("cursor", "Cursor");
    const code = await runRegister(["--hosts", "cursor"], { targets: [t], isTty: false });
    expect(code).toBe(1);
    expect(t.applied).toBe(0);
  });

  it("non-TTY without host selection errors", async () => {
    const t = fakeTarget("cursor", "Cursor");
    const code = await runRegister([], { targets: [t], isTty: false });
    expect(code).toBe(1);
  });

  it("--hosts + --yes applies selected targets", async () => {
    const cursor = fakeTarget("cursor", "Cursor");
    const codex = fakeTarget("codex", "Codex CLI");
    const code = await runRegister(["--hosts", "cursor", "--yes"], {
      targets: [cursor, codex],
      isTty: false,
    });
    expect(code).toBe(0);
    expect(cursor.applied).toBe(1);
    expect(codex.applied).toBe(0);
  });

  it("--list returns 0 and applies nothing", async () => {
    const t = fakeTarget("cursor", "Cursor");
    const code = await runRegister(["--list"], { targets: [t], isTty: false });
    expect(code).toBe(0);
    expect(t.applied).toBe(0);
  });
});

describe("createCliHost — mocked runner", () => {
  const entry: RegistrationEntry = { name: "onto", command: "onto", args: ["mcp"] };

  const codexSpec = {
    id: "codex" as const,
    displayName: "Codex CLI",
    cli: "codex",
    addArgs: (e: RegistrationEntry) => ["mcp", "add", e.name, "--", e.command, ...e.args],
    removeArgs: (e: RegistrationEntry) => ["mcp", "remove", e.name],
    listArgs: () => ["mcp", "list"],
    manualInstructions: () => "manual",
  };

  interface FakeOpts {
    existsCli?: boolean;
    preRegistered?: boolean;
    addEffective?: boolean; // does `mcp add` actually take effect?
    listSucceeds?: boolean; // does `mcp list` exit 0?
    addStatus?: number;
  }

  /** Stateful fake: `mcp list` reflects whether `mcp add`/`remove` ran. */
  function fakeRunner(opts: FakeOpts = {}): CommandRunner & { envs: Array<Record<string, string> | undefined> } {
    const {
      existsCli = true,
      preRegistered = false,
      addEffective = true,
      listSucceeds = true,
      addStatus = 0,
    } = opts;
    let present = preRegistered;
    const envs: Array<Record<string, string> | undefined> = [];
    return {
      envs,
      exists: () => existsCli,
      run: (_command, args, env): CommandRun => {
        envs.push(env);
        if (args[1] === "list") {
          if (!listSucceeds) return { status: 1, stdout: "", stderr: "list failed" };
          return { status: 0, stdout: present ? "onto  enabled\n" : "", stderr: "" };
        }
        if (args[1] === "add") {
          if (addStatus === 0 && addEffective) present = true;
          return addStatus === 0
            ? { status: 0, stdout: "", stderr: "" }
            : { status: addStatus, stdout: "", stderr: "boom" };
        }
        if (args[1] === "remove") {
          present = false;
          return { status: 0, stdout: "", stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    };
  }

  it("registers when absent and the add is verified present", async () => {
    const host = createCliHost(codexSpec, fakeRunner({ preRegistered: false }));
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("registered");
  });

  it("skips when already present and not forced", async () => {
    const host = createCliHost(codexSpec, fakeRunner({ preRegistered: true }));
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("skipped");
  });

  it("reports failed when add exits 0 but the entry is not listed (wrapper/alias no-op)", async () => {
    const host = createCliHost(codexSpec, fakeRunner({ addEffective: false }));
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("failed");
    expect(result.detail).toContain("not listed afterward");
  });

  it("registers with an unverified note when list cannot confirm", async () => {
    const host = createCliHost(codexSpec, fakeRunner({ listSucceeds: false }));
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("registered");
    expect(result.detail).toContain("could not verify");
  });

  it("emits manual outcome when CLI is absent", async () => {
    const host = createCliHost(
      { ...codexSpec, manualInstructions: () => "install codex" },
      fakeRunner({ existsCli: false }),
    );
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("manual");
    expect(result.detail).toContain("install codex");
  });

  it("reports failed when add command errors", async () => {
    const host = createCliHost(codexSpec, fakeRunner({ addStatus: 1 }));
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("failed");
    expect(result.detail).toBe("boom");
  });

  it("Claude Code host pins CLAUDE_CONFIG_DIR onto every CLI call", async () => {
    const runner = fakeRunner({ preRegistered: false });
    const host = createClaudeCodeHost({ configDir: "/Users/x/.claude-1", runner });
    await host.apply(entry, { force: false, dryRun: false });
    expect(runner.envs.length).toBeGreaterThan(0);
    for (const env of runner.envs) {
      expect(env).toEqual({ CLAUDE_CONFIG_DIR: "/Users/x/.claude-1" });
    }
    expect(host.plan(entry, { force: false, dryRun: false }).summary).toContain(
      "config dir: /Users/x/.claude-1",
    );
  });
});

// silence orchestration console output noise during tests
vi.spyOn(console, "log").mockImplementation(() => undefined);
