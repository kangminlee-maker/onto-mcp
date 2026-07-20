import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  scanEnvironmentSignalFiles,
  ENVIRONMENT_SIGNAL_SCAN_MAX_DIRENTS,
} from "./environment-signal-scan.js";

// Spec basis: env-context-profile §0 coverage revision (Stage 0.5). The scan is the fix for the
// live-verified gap — the bounded target census (200/depth-3, DFS) buries root manifests under a
// large non-manifest directory. These tests prove the scan is BFS-shallow-first (never buries),
// dotdir-aware (finds .github/workflows), safe (no symlink follow, skips vendored), and bounded.

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "env-signal-scan-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const write = async (rel: string, body = "x"): Promise<void> => {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body);
};

const rels = (signals: string[]): string[] => signals.map((s) => path.relative(root, s)).sort();

describe("scanEnvironmentSignalFiles", () => {
  it("finds a root manifest even behind a large non-manifest directory (BFS, never buries)", async () => {
    await write("package.json");
    await write("tsconfig.json");
    // a big non-manifest subtree that would exhaust a DFS/entry cap before reaching the root files
    for (let i = 0; i < 300; i++) await write(`docs/note-${i}.md`);
    const result = await scanEnvironmentSignalFiles({ scanRoots: [root] });
    expect(rels(result.signals)).toEqual(["package.json", "tsconfig.json"]);
    expect(result.truncated).toBe(false);
  });

  it("finds deep monorepo package manifests", async () => {
    await write("packages/api/go.mod");
    await write("packages/web/package.json");
    await write("services/worker/requirements.txt");
    const result = await scanEnvironmentSignalFiles({ scanRoots: [root] });
    expect(rels(result.signals)).toEqual([
      "packages/api/go.mod",
      "packages/web/package.json",
      "services/worker/requirements.txt",
    ]);
  });

  it("enters the allowlisted .github dotdir and collects CI workflows", async () => {
    await write(".github/workflows/ci.yml");
    await write(".github/workflows/release.yaml");
    await write(".github/ISSUE_TEMPLATE/bug.md"); // not a signal — must NOT be collected
    await write("package.json");
    const result = await scanEnvironmentSignalFiles({ scanRoots: [root] });
    expect(rels(result.signals)).toEqual([
      ".github/workflows/ci.yml",
      ".github/workflows/release.yaml",
      "package.json",
    ]);
  });

  it("skips node_modules, vendored/build dirs, and non-allowlisted dotdirs", async () => {
    await write("package.json");
    await write("node_modules/dep/package.json"); // vendored manifest — skip
    await write("dist/package.json");             // build output — skip
    await write(".cache/package.json");           // non-allowlisted dotdir — skip
    await write(".git/config");                   // vcs — skip
    const result = await scanEnvironmentSignalFiles({ scanRoots: [root] });
    expect(rels(result.signals)).toEqual(["package.json"]);
  });

  it("never follows symlinks (loop / escape safety)", async () => {
    await write("package.json");
    // a symlink pointing back to the root (would infinite-loop if followed)
    await fs.symlink(root, path.join(root, "loop"));
    // a symlink to an out-of-root dir containing a manifest (must not be collected)
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"));
    await fs.writeFile(path.join(outside, "Cargo.toml"), "x");
    await fs.symlink(outside, path.join(root, "linked"));
    const result = await scanEnvironmentSignalFiles({ scanRoots: [root] });
    expect(rels(result.signals)).toEqual(["package.json"]); // no cargo.toml, no loop hang
    await fs.rm(outside, { recursive: true, force: true });
  });

  it("respects the dirent cap and reports honest truncation", async () => {
    for (let i = 0; i < 50; i++) await write(`d${i}/f.md`);
    await write("package.json");
    const result = await scanEnvironmentSignalFiles({ scanRoots: [root], maxDirents: 5 });
    expect(result.truncated).toBe(true);
    expect(result.dirents_visited).toBeLessThanOrEqual(6);
  });

  it("produces deterministic sorted output", async () => {
    await write("package.json");
    await write("Dockerfile");
    await write("go.mod");
    const a = await scanEnvironmentSignalFiles({ scanRoots: [root] });
    const b = await scanEnvironmentSignalFiles({ scanRoots: [root] });
    expect(a.signals).toEqual(b.signals);
    expect(a.signals).toEqual([...a.signals].sort());
  });

  it("has a large-but-finite default dirent cap", () => {
    expect(ENVIRONMENT_SIGNAL_SCAN_MAX_DIRENTS).toBeGreaterThan(1000);
  });

  it("reports its structural bounds (echoed to coverage for honest depth/cap disclosure)", async () => {
    await write("package.json");
    const result = await scanEnvironmentSignalFiles({ scanRoots: [root], maxDepth: 5, maxDirents: 999 });
    expect(result.max_depth).toBe(5);
    expect(result.max_dirents).toBe(999);
  });

  // F1 (cross-verify HIGH): interleaved BFS across roots — a first root whose DEEP subtree would
  // exhaust the shared cap must NOT starve a later root's SHALLOW manifest. This falsifies the
  // replaced per-root-queue code: there rootA's deep tree truncates the scan before rootB opens.
  it("collects a later root's shallow manifest even when an earlier root's deep tree exhausts the cap", async () => {
    const rootB = await fs.mkdtemp(path.join(os.tmpdir(), "env-signal-scan-B-"));
    try {
      // rootA (=`root`): a small top level ("deep/") hiding a large subtree that alone exceeds the cap.
      await write("deep/keep.md"); // ensures deep/ exists
      for (let i = 0; i < 100; i++) await fs.writeFile(path.join(root, "deep", `f${i}.md`), "x");
      await fs.writeFile(path.join(rootB, "package.json"), "x"); // rootB's shallow (depth-0) manifest
      // Cap large enough for both roots' TOP levels but not rootA's deep subtree: interleaved BFS
      // reaches rootB's level-0 before descending into rootA's deep files; the old per-root code did not.
      const result = await scanEnvironmentSignalFiles({ scanRoots: [root, rootB], maxDirents: 50 });
      const found = result.signals.map((s) => path.basename(s));
      expect(found).toContain("package.json"); // survived the shared budget under interleaving
      expect(result.truncated).toBe(true); // rootA's deep subtree did exhaust the cap
    } finally {
      await fs.rm(rootB, { recursive: true, force: true });
    }
  });

  // F2 (cross-verify MED-HIGH): a truncated scan is still deterministic (dirents name-sorted before
  // the cap), independent of filesystem readdir order.
  it("is deterministic under truncation (name-sorted, readdir-order-independent)", async () => {
    for (const n of ["m", "a", "z", "package.json", "Dockerfile", "b", "go.mod"]) {
      await fs.writeFile(path.join(root, n), "x");
    }
    const a = await scanEnvironmentSignalFiles({ scanRoots: [root], maxDirents: 4 });
    const b = await scanEnvironmentSignalFiles({ scanRoots: [root], maxDirents: 4 });
    expect(a.truncated).toBe(true);
    expect(a.signals).toEqual(b.signals); // same 4 dirents examined every run
  });

  // F4b support: exact-duplicate roots are not double-scanned (the hook additionally drops nested
  // descendant roots; the scan itself dedups exact repeats).
  it("dedups exact-duplicate scan roots", async () => {
    for (let i = 0; i < 10; i++) await write(`x${i}.md`);
    await write("package.json");
    const once = await scanEnvironmentSignalFiles({ scanRoots: [root] });
    const twice = await scanEnvironmentSignalFiles({ scanRoots: [root, root] });
    expect(twice.signals).toEqual(once.signals);
    expect(twice.dirents_visited).toBe(once.dirents_visited); // not double-charged
  });
});
