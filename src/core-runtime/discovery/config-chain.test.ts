import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveConfigChain } from "./config-chain.js";

// ---------------------------------------------------------------------------
// config-chain — fail-loud config surface.
//
// Unsupported model/profile keys must fail at config load. The canonical
// model switcher lives under `llm:` and review execution shape under `review:`.
// ---------------------------------------------------------------------------

const cleanupDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `onto-p95-${prefix}-`));
  cleanupDirs.push(dir);
  return dir;
}

function writeConfig(dir: string, yaml: string): void {
  fs.mkdirSync(path.join(dir, ".onto"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".onto", "config.yml"), yaml, "utf8");
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
});

describe("resolveConfigChain — fail-loud config surface", () => {
  it("unsupported project config keys throw", async () => {
    const homeDir = makeTmpDir("bad-h");
    const projDir = makeTmpDir("bad-p");
    writeConfig(projDir, "host_runtime: codex\napi_provider: codex\n");

    await expect(resolveConfigChain(homeDir, projDir)).rejects.toThrow(
      /Unsupported \.onto config key\(s\).*host_runtime.*api_provider/s,
    );
  });

  it("unsupported keys fail even when review block is present", async () => {
    const homeDir = makeTmpDir("mixed-bad-h");
    const projDir = makeTmpDir("mixed-bad-p");
    writeConfig(
      projDir,
      [
        "host_runtime: anthropic",
        "review:",
        "  subagent:",
        "    provider: main-native",
        "llm:",
        "  auth: oauth",
        "  provider: openai",
        "  model: gpt-5.4",
      ].join("\n"),
    );

    await expect(resolveConfigChain(homeDir, projDir)).rejects.toThrow(
      /Unsupported \.onto config key\(s\).*host_runtime/s,
    );
  });

  it("canonical home llm switcher is adopted when project has no config", async () => {
    const homeDir = makeTmpDir("home-llm-h");
    const projDir = makeTmpDir("home-llm-p");
    writeConfig(
      homeDir,
      ["llm:", "  auth: oauth", "  provider: openai", "  model: gpt-5.4"].join("\n"),
    );

    const config = await resolveConfigChain(homeDir, projDir);
    expect(config.llm?.provider).toBe("openai");
    expect(config.llm?.model).toBe("gpt-5.4");
  });

  it("completely empty configs load without throw", async () => {
    const homeDir = makeTmpDir("empty-h");
    const projDir = makeTmpDir("empty-p");

    const config = await resolveConfigChain(homeDir, projDir);
    expect(config).toBeDefined();
    expect(config.llm).toBeUndefined();
    expect(config.review).toBeUndefined();
  });
});
