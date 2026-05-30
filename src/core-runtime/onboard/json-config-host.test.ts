import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  claudeDesktopConfigPath,
  createJsonConfigHost,
  reconcileMcpServers,
} from "./json-config-host.js";
import { type RegistrationEntry } from "./types.js";

const entry: RegistrationEntry = { name: "onto", command: "onto", args: ["mcp"] };

describe("reconcileMcpServers — pure merge", () => {
  it("adds onto to an empty/absent config", () => {
    const { config, outcome } = reconcileMcpServers(undefined, entry);
    expect(outcome).toBe("registered");
    expect(config).toEqual({ mcpServers: { onto: { command: "onto", args: ["mcp"] } } });
  });

  it("preserves sibling servers and other top-level keys", () => {
    const existing = {
      theme: "dark",
      mcpServers: { other: { command: "x", args: ["y"] } },
    };
    const { config, outcome } = reconcileMcpServers(existing, entry);
    expect(outcome).toBe("registered");
    expect(config).toEqual({
      theme: "dark",
      mcpServers: {
        other: { command: "x", args: ["y"] },
        onto: { command: "onto", args: ["mcp"] },
      },
    });
  });

  it("is idempotent — identical entry skips", () => {
    const existing = { mcpServers: { onto: { command: "onto", args: ["mcp"] } } };
    expect(reconcileMcpServers(existing, entry).outcome).toBe("skipped");
  });

  it("updates a differing onto entry without touching siblings", () => {
    const existing = {
      mcpServers: {
        onto: { command: "old", args: [] },
        other: { command: "x", args: ["y"] },
      },
    };
    const { config, outcome } = reconcileMcpServers(existing, entry);
    expect(outcome).toBe("updated");
    expect((config.mcpServers as Record<string, unknown>).onto).toEqual({
      command: "onto",
      args: ["mcp"],
    });
    expect((config.mcpServers as Record<string, unknown>).other).toEqual({
      command: "x",
      args: ["y"],
    });
  });
});

describe("createJsonConfigHost — fs round-trip", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function tmpConfigPath(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onto-register-"));
    tmpDirs.push(dir);
    return path.join(dir, "nested", "mcp.json");
  }

  it("creates the file (and parent dirs) on first apply", async () => {
    const target = await tmpConfigPath();
    const host = createJsonConfigHost({
      id: "cursor",
      displayName: "Cursor",
      resolvePath: () => target,
    });
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("registered");
    const written = JSON.parse(fsSync.readFileSync(target, "utf8"));
    expect(written.mcpServers.onto).toEqual({ command: "onto", args: ["mcp"] });
  });

  it("second apply is idempotent (skipped, file unchanged)", async () => {
    const target = await tmpConfigPath();
    const host = createJsonConfigHost({
      id: "cursor",
      displayName: "Cursor",
      resolvePath: () => target,
    });
    await host.apply(entry, { force: false, dryRun: false });
    const firstBytes = fsSync.readFileSync(target, "utf8");
    const second = await host.apply(entry, { force: false, dryRun: false });
    expect(second.outcome).toBe("skipped");
    expect(fsSync.readFileSync(target, "utf8")).toBe(firstBytes);
  });

  it("fails loudly on malformed existing JSON", async () => {
    const target = await tmpConfigPath();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "{ not json", "utf8");
    const host = createJsonConfigHost({
      id: "cursor",
      displayName: "Cursor",
      resolvePath: () => target,
    });
    const result = await host.apply(entry, { force: false, dryRun: false });
    expect(result.outcome).toBe("failed");
    expect(result.detail).toContain("not valid JSON");
  });
});

describe("claudeDesktopConfigPath — platform branches", () => {
  it("uses macOS Application Support path", () => {
    expect(claudeDesktopConfigPath("/Users/x", "darwin")).toBe(
      "/Users/x/Library/Application Support/Claude/claude_desktop_config.json",
    );
  });
});
