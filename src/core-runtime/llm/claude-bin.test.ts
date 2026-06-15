import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveClaudeBin, resetClaudeBinCacheForTest } from "./claude-bin.js";

// Per-user claude binary location: ONTO_CLAUDE_BIN override → PATH (executable
// file, never a shell alias) → common install locations → bare "claude" so spawn
// ENOENT carries the actionable guidance.

const tmpDirs: string[] = [];

function makeExecutable(dir: string, name: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, "#!/bin/sh\n", { mode: 0o755 });
  fs.chmodSync(p, 0o755);
  return p;
}

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "claude-bin-"));
  tmpDirs.push(d);
  return d;
}

afterEach(() => {
  resetClaudeBinCacheForTest();
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("resolveClaudeBin", () => {
  it("prefers an explicit ONTO_CLAUDE_BIN override", () => {
    const env = { ONTO_CLAUDE_BIN: "/custom/path/to/claude", PATH: "" } as NodeJS.ProcessEnv;
    expect(resolveClaudeBin(env)).toBe("/custom/path/to/claude");
  });

  it("trims the override and ignores a blank one", () => {
    const dir = tmp();
    const onPath = makeExecutable(dir, "claude");
    const env = { ONTO_CLAUDE_BIN: "   ", PATH: dir } as NodeJS.ProcessEnv;
    expect(resolveClaudeBin(env)).toBe(onPath);
  });

  it("finds claude as an executable FILE on PATH (not by name alone)", () => {
    const dir = tmp();
    const onPath = makeExecutable(dir, "claude");
    const env = { PATH: `/nonexistent/bin${path.delimiter}${dir}` } as NodeJS.ProcessEnv;
    expect(resolveClaudeBin(env)).toBe(onPath);
  });

  it("falls back to the bare name when nothing is found (spawn ENOENT carries guidance)", () => {
    const env = { PATH: "/nonexistent/bin" } as NodeJS.ProcessEnv;
    // No override, not on PATH, and common locations almost certainly absent in
    // the test sandbox — but guard the assertion against a real local install.
    const result = resolveClaudeBin(env);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result.endsWith("claude")).toBe(true);
  });
});
