import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveClaudeBin } from "./claude-bin.js";

// Per-user claude binary location: ONTO_CLAUDE_BIN override → PATH (executable
// file, never a shell alias) → common install locations → bare "claude" so spawn
// ENOENT carries the actionable guidance. resolveClaudeBin is a pure function of
// `env` (no cache), so discovery always reflects the supplied environment.

const tmpDirs: string[] = [];

function makeExecutable(dir: string, name: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, "#!/bin/sh\n");
  fs.chmodSync(p, 0o755);
  return p;
}

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "claude-bin-"));
  tmpDirs.push(d);
  return d;
}

afterEach(() => {
  vi.restoreAllMocks();
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

  it("finds claude as an executable FILE on PATH", () => {
    const dir = tmp();
    const onPath = makeExecutable(dir, "claude");
    const env = { PATH: `/nonexistent/bin${path.delimiter}${dir}` } as NodeJS.ProcessEnv;
    expect(resolveClaudeBin(env)).toBe(onPath);
  });

  it("rejects a PATH entry where `claude` is a DIRECTORY (not an executable file)", () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, "claude"), { recursive: true }); // a dir named claude
    const realDir = tmp();
    const real = makeExecutable(realDir, "claude");
    const env = { PATH: `${dir}${path.delimiter}${realDir}` } as NodeJS.ProcessEnv;
    // The directory must be skipped (isFile guard) so the real file wins.
    expect(resolveClaudeBin(env)).toBe(real);
  });

  it("rejects a present-but-non-executable `claude` file on PATH", () => {
    const dir = tmp();
    const p = path.join(dir, "claude");
    fs.writeFileSync(p, "#!/bin/sh\n");
    fs.chmodSync(p, 0o644); // not executable
    vi.spyOn(os, "homedir").mockReturnValue(tmp()); // empty home → no common-loc hit
    const env = { PATH: dir } as NodeJS.ProcessEnv;
    // Not executable → not found on PATH → no common location → bare "claude".
    expect(resolveClaudeBin(env)).toBe("claude");
  });

  it("discovers a common install location when PATH misses (e.g. ~/.local/bin)", () => {
    const home = tmp();
    const localBin = path.join(home, ".local", "bin");
    const installed = makeExecutable(localBin, "claude");
    vi.spyOn(os, "homedir").mockReturnValue(home);
    const env = { PATH: "/nonexistent/bin" } as NodeJS.ProcessEnv;
    expect(resolveClaudeBin(env)).toBe(installed);
  });

  it("follows a symlink at a common install location (native-installer shape)", () => {
    const home = tmp();
    const versions = tmp();
    const realBin = makeExecutable(versions, "claude-2.1.0");
    const localBin = path.join(home, ".local", "bin");
    fs.mkdirSync(localBin, { recursive: true });
    const link = path.join(localBin, "claude");
    fs.symlinkSync(realBin, link); // ~/.local/bin/claude -> versions/claude-2.1.0
    vi.spyOn(os, "homedir").mockReturnValue(home);
    const env = { PATH: "/nonexistent/bin" } as NodeJS.ProcessEnv;
    expect(resolveClaudeBin(env)).toBe(link);
  });

  it("re-reads env each call (no stale cache): a different env.PATH resolves differently", () => {
    const a = tmp();
    const aBin = makeExecutable(a, "claude");
    const b = tmp();
    const bBin = makeExecutable(b, "claude");
    expect(resolveClaudeBin({ PATH: a } as NodeJS.ProcessEnv)).toBe(aBin);
    // A second call with a different PATH must NOT return the first result.
    expect(resolveClaudeBin({ PATH: b } as NodeJS.ProcessEnv)).toBe(bBin);
  });

  it("falls back to the bare name when nothing is found", () => {
    vi.spyOn(os, "homedir").mockReturnValue(tmp()); // empty home → no common locations
    const env = { PATH: "/nonexistent/bin" } as NodeJS.ProcessEnv;
    expect(resolveClaudeBin(env)).toBe("claude");
  });
});
