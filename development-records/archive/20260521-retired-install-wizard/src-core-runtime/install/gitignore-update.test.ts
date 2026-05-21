import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureGitignoreEntry } from "./gitignore-update.js";

describe("ensureGitignoreEntry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-install-git-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a new .gitignore with the entry when file absent", () => {
    const gi = path.join(tmpDir, ".gitignore");
    const result = ensureGitignoreEntry(gi);
    expect(result.created).toBe(true);
    expect(result.alreadyPresent).toBe(false);
    expect(fs.readFileSync(gi, "utf8")).toBe(".onto/.env\n");
  });

  it("appends the entry to an existing .gitignore without duplication", () => {
    const gi = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gi, "node_modules/\ndist/\n");
    const result = ensureGitignoreEntry(gi);
    expect(result.created).toBe(false);
    expect(result.alreadyPresent).toBe(false);
    const content = fs.readFileSync(gi, "utf8");
    expect(content).toContain("node_modules/");
    expect(content.trim().endsWith(".onto/.env")).toBe(true);
  });

  it("is a no-op when the entry is already present", () => {
    const gi = path.join(tmpDir, ".gitignore");
    const original = "dist/\n.onto/.env\nnode_modules/\n";
    fs.writeFileSync(gi, original);
    const result = ensureGitignoreEntry(gi);
    expect(result.alreadyPresent).toBe(true);
    expect(fs.readFileSync(gi, "utf8")).toBe(original);
  });

  it("recognizes leading slash variants", () => {
    const gi = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gi, "/.onto/.env\n");
    const result = ensureGitignoreEntry(gi);
    expect(result.alreadyPresent).toBe(true);
  });

  it("ignores inline comments on the entry line", () => {
    const gi = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gi, ".onto/.env  # secrets\n");
    const result = ensureGitignoreEntry(gi);
    expect(result.alreadyPresent).toBe(true);
  });

  it("adds a trailing newline when the existing file has none", () => {
    const gi = path.join(tmpDir, ".gitignore");
    fs.writeFileSync(gi, "dist/");
    const result = ensureGitignoreEntry(gi);
    expect(result.alreadyPresent).toBe(false);
    expect(fs.readFileSync(gi, "utf8")).toBe("dist/\n.onto/.env\n");
  });

  it("dry-run returns expected content without writing", () => {
    const gi = path.join(tmpDir, ".gitignore");
    const result = ensureGitignoreEntry(gi, { dryRun: true });
    expect(result.content).toBe(".onto/.env\n");
    expect(fs.existsSync(gi)).toBe(false);
  });
});
