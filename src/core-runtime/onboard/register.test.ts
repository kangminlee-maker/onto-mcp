import { describe, expect, it, vi } from "vitest";
import { parseRegisterArgs, runRegister } from "./register.js";
import { createCliHost, type CommandRunner, type CommandRun } from "./cli-host.js";
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
  function runner(overrides: Partial<CommandRunner> & { listText?: string }): CommandRunner {
    const calls: string[][] = [];
    const base: CommandRunner = {
      exists: () => true,
      run: (command, args): CommandRun => {
        calls.push([command, ...args]);
        if (args[0] === "mcp" && args[1] === "list") {
          return { status: 0, stdout: overrides.listText ?? "", stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    };
    return { ...base, ...overrides, run: overrides.run ?? base.run };
  }

  const entry: RegistrationEntry = { name: "onto", command: "onto", args: ["mcp"] };

  it("registers when not already present", async () => {
    const host = createCliHost(
      {
        id: "codex",
        displayName: "Codex CLI",
        cli: "codex",
        addArgs: (e) => ["mcp", "add", e.name, "--", e.command, ...e.args],
        removeArgs: (e) => ["mcp", "remove", e.name],
        listArgs: () => ["mcp", "list"],
        manualInstructions: () => "manual",
      },
      runner({ listText: "" }),
    );
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("registered");
  });

  it("skips when already present and not forced", async () => {
    const host = createCliHost(
      {
        id: "codex",
        displayName: "Codex CLI",
        cli: "codex",
        addArgs: (e) => ["mcp", "add", e.name, "--", e.command, ...e.args],
        removeArgs: (e) => ["mcp", "remove", e.name],
        listArgs: () => ["mcp", "list"],
        manualInstructions: () => "manual",
      },
      runner({ listText: "onto  enabled\n" }),
    );
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("skipped");
  });

  it("emits manual outcome when CLI is absent", async () => {
    const host = createCliHost(
      {
        id: "codex",
        displayName: "Codex CLI",
        cli: "codex",
        addArgs: (e) => ["mcp", "add", e.name, "--", e.command, ...e.args],
        removeArgs: (e) => ["mcp", "remove", e.name],
        listArgs: () => ["mcp", "list"],
        manualInstructions: () => "install codex",
      },
      runner({ exists: () => false }),
    );
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("manual");
    expect(result.detail).toContain("install codex");
  });

  it("reports failed when add command errors", async () => {
    const failRunner: CommandRunner = {
      exists: () => true,
      run: (_command, args) => {
        if (args[1] === "list") return { status: 0, stdout: "", stderr: "" };
        return { status: 1, stdout: "", stderr: "boom" };
      },
    };
    const host = createCliHost(
      {
        id: "codex",
        displayName: "Codex CLI",
        cli: "codex",
        addArgs: (e) => ["mcp", "add", e.name, "--", e.command, ...e.args],
        removeArgs: (e) => ["mcp", "remove", e.name],
        listArgs: () => ["mcp", "list"],
        manualInstructions: () => "manual",
      },
      failRunner,
    );
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("failed");
    expect(result.detail).toBe("boom");
  });
});

// silence orchestration console output noise during tests
vi.spyOn(console, "log").mockImplementation(() => undefined);
