import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatPreflightSummary,
  globalConfigPath,
  projectConfigPath,
  runPreflight,
} from "./detect.js";
import type { PreflightDetection } from "./types.js";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "LITELLM_BASE_URL",
  "CLAUDECODE",
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
];

let savedEnv: Record<string, string | undefined> = {};

function saveEnv(): void {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  savedEnv.PATH = process.env.PATH;
  // Empty PATH neutralizes codex binary detection.
  process.env.PATH = "";
  savedEnv.HOME = process.env.HOME;
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/** Point HOME at a tmpdir so ~/.onto/ / ~/.codex/ checks are isolated. */
function isolateHome(): string {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "onto-install-test-"));
  process.env.HOME = tmpHome;
  return tmpHome;
}

function cleanupHome(tmpHome: string): void {
  fs.rmSync(tmpHome, { recursive: true, force: true });
}

describe("runPreflight", () => {
  let tmpHome: string;
  let tmpProject: string;

  beforeEach(() => {
    saveEnv();
    tmpHome = isolateHome();
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "onto-install-proj-"));
  });

  afterEach(() => {
    restoreEnv();
    cleanupHome(tmpHome);
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it("returns all-false baseline when environment is empty", () => {
    const result = runPreflight(tmpProject);
    expect(result).toEqual({
      existingGlobalConfig: false,
      existingProjectConfig: false,
      hasAnthropicKey: false,
      hasOpenAiKey: false,
      hasLitellmBaseUrl: false,
      hasCodexBinary: false,
      hasCodexAuth: false,
      hostIsClaudeCode: false,
    });
  });

  it("detects ANTHROPIC_API_KEY", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const result = runPreflight(tmpProject);
    expect(result.hasAnthropicKey).toBe(true);
    expect(result.hasOpenAiKey).toBe(false);
  });

  it("detects OPENAI_API_KEY from env", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const result = runPreflight(tmpProject);
    expect(result.hasOpenAiKey).toBe(true);
  });

  it("detects OPENAI_API_KEY from ~/.codex/auth.json", () => {
    const codexDir = path.join(tmpHome, ".codex");
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(
      path.join(codexDir, "auth.json"),
      JSON.stringify({ OPENAI_API_KEY: "sk-from-file" }),
    );
    const result = runPreflight(tmpProject);
    expect(result.hasOpenAiKey).toBe(true);
    expect(result.hasCodexAuth).toBe(true);
  });

  it("captures LITELLM_BASE_URL value when present", () => {
    process.env.LITELLM_BASE_URL = "http://localhost:4000/v1";
    const result = runPreflight(tmpProject);
    expect(result.hasLitellmBaseUrl).toBe(true);
    expect(result.litellmBaseUrlValue).toBe("http://localhost:4000/v1");
  });

  it("detects Claude Code session via CLAUDECODE env signal", () => {
    process.env.CLAUDECODE = "1";
    const result = runPreflight(tmpProject);
    expect(result.hostIsClaudeCode).toBe(true);
  });

  it("splits codex binary and auth presence for install UX", () => {
    // Binary present, auth missing — the "run `codex login`" branch.
    const fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-install-bin-"));
    fs.writeFileSync(path.join(fakeBinDir, "codex"), "#!/bin/sh\nexit 0");
    fs.chmodSync(path.join(fakeBinDir, "codex"), 0o755);
    try {
      process.env.PATH = fakeBinDir;
      const result = runPreflight(tmpProject);
      expect(result.hasCodexBinary).toBe(true);
      expect(result.hasCodexAuth).toBe(false);
    } finally {
      fs.rmSync(fakeBinDir, { recursive: true, force: true });
    }
  });

  it("detects existing global and project config files independently", () => {
    fs.mkdirSync(path.join(tmpHome, ".onto"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".onto", "config.yml"),
      "output_language: ko\n",
    );
    fs.mkdirSync(path.join(tmpProject, ".onto"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpProject, ".onto", "config.yml"),
      "output_language: en\n",
    );
    const result = runPreflight(tmpProject);
    expect(result.existingGlobalConfig).toBe(true);
    expect(result.existingProjectConfig).toBe(true);
  });
});

describe("path helpers", () => {
  it("globalConfigPath points at ~/.onto/config.yml", () => {
    expect(globalConfigPath()).toBe(
      path.join(os.homedir(), ".onto", "config.yml"),
    );
  });

  it("projectConfigPath joins project root with .onto/config.yml", () => {
    expect(projectConfigPath("/tmp/proj")).toBe("/tmp/proj/.onto/config.yml");
  });
});

describe("formatPreflightSummary", () => {
  it("uses ✓ for present signals and · for absent ones", () => {
    const snapshot: PreflightDetection = {
      existingGlobalConfig: true,
      existingProjectConfig: false,
      hasAnthropicKey: true,
      hasOpenAiKey: false,
      hasLitellmBaseUrl: true,
      litellmBaseUrlValue: "http://localhost:4000/v1",
      hasCodexBinary: false,
      hasCodexAuth: false,
      hostIsClaudeCode: true,
    };
    const out = formatPreflightSummary(snapshot);
    expect(out).toContain("✓ global config");
    expect(out).toContain("· project config");
    expect(out).toContain("✓ ANTHROPIC_API_KEY");
    expect(out).toContain("· OPENAI_API_KEY");
    expect(out).toContain("http://localhost:4000/v1");
    expect(out).toContain("✓ running inside Claude Code");
  });
});
