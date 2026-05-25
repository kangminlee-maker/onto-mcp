import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetInstallationPathCacheForTesting,
  resolveInstallationPath,
} from "./installation-paths.js";

function makeTempInstallRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "onto-install-paths-"));
}

describe("resolveInstallationPath", () => {
  const tmpRoots: string[] = [];

  beforeEach(() => {
    __resetInstallationPathCacheForTesting();
  });

  afterEach(() => {
    __resetInstallationPathCacheForTesting();
    for (const root of tmpRoots) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tmpRoots.length = 0;
  });

  it("returns .onto/{kind}/ when the canonical layout exists", () => {
    const installRoot = makeTempInstallRoot();
    tmpRoots.push(installRoot);
    const canonical = path.join(installRoot, ".onto", "authority");
    fs.mkdirSync(canonical, { recursive: true });

    expect(resolveInstallationPath("authority", installRoot)).toBe(canonical);
  });

  it("throws when the canonical layout is missing", () => {
    const installRoot = makeTempInstallRoot();
    tmpRoots.push(installRoot);

    expect(() => resolveInstallationPath("commands", installRoot)).toThrow(
      /\.onto\/commands\/ not found/,
    );
  });

  it("ignores a bare top-level dir that matches the kind name", () => {
    const installRoot = makeTempInstallRoot();
    tmpRoots.push(installRoot);
    fs.mkdirSync(path.join(installRoot, "authority"), { recursive: true });

    expect(() => resolveInstallationPath("authority", installRoot)).toThrow(
      /\.onto\/authority\/ not found/,
    );
  });

  it("caches resolved paths (same kind / installRoot returns identical string)", () => {
    const installRoot = makeTempInstallRoot();
    tmpRoots.push(installRoot);
    fs.mkdirSync(path.join(installRoot, ".onto", "domains"), { recursive: true });

    const first = resolveInstallationPath("domains", installRoot);
    const second = resolveInstallationPath("domains", installRoot);
    expect(first).toBe(second);
  });

  it("cache reset helper allows swapping fixtures across tests", () => {
    const installRoot = makeTempInstallRoot();
    tmpRoots.push(installRoot);
    fs.mkdirSync(path.join(installRoot, ".onto", "roles"), { recursive: true });
    resolveInstallationPath("roles", installRoot);
    __resetInstallationPathCacheForTesting();
    // Second resolve must succeed after a cache flush.
    expect(resolveInstallationPath("roles", installRoot)).toBe(
      path.join(installRoot, ".onto", "roles"),
    );
  });
});
