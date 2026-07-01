import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverClaudeProfiles,
  looksLikeClaudeConfigDir,
} from "./claude-profile-scan.js";

function mkdir(...segments: string[]): string {
  const dir = path.join(...segments);
  fsSync.mkdirSync(dir, { recursive: true });
  return dir;
}

function touch(dir: string, file: string): void {
  fsSync.writeFileSync(path.join(dir, file), "{}");
}

describe("discoverClaudeProfiles", () => {
  let home: string;
  let external: string;

  beforeEach(() => {
    home = fsSync.mkdtempSync(path.join(os.tmpdir(), "onto-home-"));
    external = fsSync.mkdtempSync(path.join(os.tmpdir(), "onto-ext-"));

    // Real profile dirs, each carrying a different documented marker.
    touch(mkdir(home, ".claude"), "settings.json");
    touch(mkdir(home, ".claude-1"), "settings.json");
    touch(mkdir(home, ".claude-2"), ".credentials.json");
    mkdir(home, ".claude-3", "projects"); // projects/ subdir marker
    touch(mkdir(home, ".claude-3"), ".claude.json");

    // Decoys that must be excluded.
    mkdir(home, ".claude-sessions"); // matches glob, no marker
    mkdir(home, ".claude-empty"); // matches glob, no marker
    touch(home, ".claude.json"); // a FILE, not a config dir
  });

  afterEach(() => {
    fsSync.rmSync(home, { recursive: true, force: true });
    fsSync.rmSync(external, { recursive: true, force: true });
  });

  it("finds .claude and .claude-* dirs that carry a config marker, sorted", () => {
    const found = discoverClaudeProfiles({ homeDir: home });
    expect(found).toEqual([
      path.join(home, ".claude"),
      path.join(home, ".claude-1"),
      path.join(home, ".claude-2"),
      path.join(home, ".claude-3"),
    ]);
  });

  it("excludes marker-less dirs and the .claude.json file", () => {
    const found = discoverClaudeProfiles({ homeDir: home });
    expect(found).not.toContain(path.join(home, ".claude-sessions"));
    expect(found).not.toContain(path.join(home, ".claude-empty"));
    expect(found).not.toContain(path.join(home, ".claude.json"));
  });

  it("includes an ambient CLAUDE_CONFIG_DIR even outside the home glob", () => {
    touch(external, ".credentials.json");
    const found = discoverClaudeProfiles({ homeDir: home, configDirEnv: external });
    expect(found).toContain(path.resolve(external));
    // and does not duplicate or drop the home profiles
    expect(found).toContain(path.join(home, ".claude-1"));
  });

  it("ignores an ambient CLAUDE_CONFIG_DIR that is not a directory", () => {
    const notDir = path.join(external, "nope");
    const found = discoverClaudeProfiles({ homeDir: home, configDirEnv: notDir });
    expect(found).not.toContain(path.resolve(notDir));
  });

  it("returns [] when home has no Claude config dirs", () => {
    const empty = fsSync.mkdtempSync(path.join(os.tmpdir(), "onto-bare-"));
    try {
      expect(discoverClaudeProfiles({ homeDir: empty })).toEqual([]);
    } finally {
      fsSync.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("looksLikeClaudeConfigDir", () => {
  it("is false for a non-existent path", () => {
    expect(looksLikeClaudeConfigDir("/no/such/dir-xyz")).toBe(false);
  });

  it("is true once a marker is present", () => {
    const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "onto-mark-"));
    try {
      expect(looksLikeClaudeConfigDir(dir)).toBe(false);
      touch(dir, "settings.json");
      expect(looksLikeClaudeConfigDir(dir)).toBe(true);
    } finally {
      fsSync.rmSync(dir, { recursive: true, force: true });
    }
  });
});
