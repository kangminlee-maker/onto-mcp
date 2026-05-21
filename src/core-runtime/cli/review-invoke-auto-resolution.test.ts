import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  resolveExecutionRealizationHandoff,
  detectClaudeCodeHost,
  detectCodexAvailable,
} from "./review-invoke.js";

// ─── Helpers ───

const originalEnv = { ...process.env };

function clearEnv() {
  delete process.env.CLAUDECODE;
  // Don't touch PATH/HOME globally — we override them in tests that need to.
}

function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v;
  }
}

function createTmpHome(): { home: string; cleanup: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "onto-auto-resolution-test-"));
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  return {
    home,
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
  };
}

// ─── detectClaudeCodeHost ───

describe("detectClaudeCodeHost", () => {
  beforeEach(() => {
    clearEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("returns true when CLAUDECODE=1", () => {
    process.env.CLAUDECODE = "1";
    expect(detectClaudeCodeHost()).toBe(true);
  });

  it("returns false when CLAUDECODE unset", () => {
    expect(detectClaudeCodeHost()).toBe(false);
  });

  it("returns false when CLAUDECODE=0 or other value", () => {
    process.env.CLAUDECODE = "0";
    expect(detectClaudeCodeHost()).toBe(false);
    process.env.CLAUDECODE = "true";
    expect(detectClaudeCodeHost()).toBe(false);
  });
});

// ─── detectCodexAvailable ───

describe("detectCodexAvailable", () => {
  let tmp: { home: string; cleanup: () => void } | null = null;
  const originalPath = process.env.PATH;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tmp = createTmpHome();
    process.env.HOME = tmp.home;
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
    tmp = null;
    if (originalPath !== undefined) process.env.PATH = originalPath;
    if (originalHome !== undefined) process.env.HOME = originalHome;
  });

  it("returns false when codex binary not on PATH", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-empty-path-"));
    process.env.PATH = emptyDir;
    try {
      expect(detectCodexAvailable()).toBe(false);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("returns false when binary on PATH but auth.json missing", () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-bin-"));
    const fakeCodex = path.join(binDir, "codex");
    fs.writeFileSync(fakeCodex, "#!/bin/sh\necho fake\n");
    fs.chmodSync(fakeCodex, 0o755);
    process.env.PATH = binDir;
    // HOME has tmp with .codex dir but no auth.json
    try {
      expect(detectCodexAvailable()).toBe(false);
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  });

  it("returns true when both binary and auth.json exist", () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-bin-"));
    const fakeCodex = path.join(binDir, "codex");
    fs.writeFileSync(fakeCodex, "#!/bin/sh\necho fake\n");
    fs.chmodSync(fakeCodex, 0o755);
    process.env.PATH = binDir;
    fs.writeFileSync(path.join(tmp!.home, ".codex", "auth.json"), "{}");
    try {
      expect(detectCodexAvailable()).toBe(true);
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  });
});

// ─── resolveExecutionRealizationHandoff ───

describe("resolveExecutionRealizationHandoff", () => {
  let tmp: { home: string; cleanup: () => void } | null = null;
  const originalPath = process.env.PATH;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    clearEnv();
    tmp = createTmpHome();
    process.env.HOME = tmp.home;
    // Default: empty PATH (codex not available) unless test sets it.
    process.env.PATH = "/tmp/none-existing-dir";
  });

  afterEach(() => {
    if (tmp) tmp.cleanup();
    tmp = null;
    if (originalPath !== undefined) process.env.PATH = originalPath;
    else delete process.env.PATH;
    if (originalHome !== undefined) process.env.HOME = originalHome;
    restoreEnv();
  });

  it("E1 explicit --codex → self", () => {
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: true,
      prepareOnly: false,
      ontoConfig: {},
    });
    expect(out.type).toBe("self");
    if (out.type === "self") {
      expect(out.profile.host_runtime).toBe("codex");
    }
  });

  it("E1b prepare-only on Claude host → self with Claude profile (artifact seam)", () => {
    // coordinator-state-machine calls reviewPrepareOnly(--prepare-only) from within
    // a Claude Code session; it must receive the Claude profile so prepared session
    // artifacts get recorded as host-team+claude, not worker+codex. This is the
    // artifact seam fix (review consensus #1, 2026-04-16).
    process.env.CLAUDECODE = "1";
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      prepareOnly: true,
      ontoConfig: {},
    });
    expect(out.type).toBe("self");
    if (out.type === "self") {
      expect(out.profile.host_runtime).toBe("claude");
      expect(out.profile.execution_realization).toBe("host-team");
    }
  });

  it("E2 env ONTO_HOST_RUNTIME=claude → coordinator_start with host-team default", () => {
    process.env.ONTO_HOST_RUNTIME = "claude";
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      prepareOnly: false,
      ontoConfig: {},
    });
    expect(out.type).toBe("coordinator_start");
    if (out.type === "coordinator_start") {
      expect(out.profile.execution_realization).toBe("host-team");
    }
  });

  it("E2c env ONTO_HOST_RUNTIME=codex → self", () => {
    process.env.ONTO_HOST_RUNTIME = "codex";
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      prepareOnly: false,
      ontoConfig: {},
    });
    expect(out.type).toBe("self");
    if (out.type === "self") {
      expect(out.profile.host_runtime).toBe("codex");
    }
  });

  it("E3 auto + CLAUDECODE=1 → coordinator_start with host-team", () => {
    process.env.CLAUDECODE = "1";
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      prepareOnly: false,
      ontoConfig: {},
    });
    expect(out.type).toBe("coordinator_start");
    if (out.type === "coordinator_start") {
      expect(out.profile.execution_realization).toBe("host-team");
    }
  });

  it("E4 auto + codex available + no CLAUDECODE → self", () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-bin-"));
    const fakeCodex = path.join(binDir, "codex");
    fs.writeFileSync(fakeCodex, "#!/bin/sh\n");
    fs.chmodSync(fakeCodex, 0o755);
    process.env.PATH = binDir;
    fs.writeFileSync(path.join(tmp!.home, ".codex", "auth.json"), "{}");
    try {
      const out = resolveExecutionRealizationHandoff({
        explicitCodex: false,
        prepareOnly: false,
        ontoConfig: {},
      });
      expect(out.type).toBe("self");
    if (out.type === "self") {
      expect(out.profile.host_runtime).toBe("codex");
    }
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  });

  it("E5 auto + both CLAUDECODE and codex available → stay-in-host (Claude wins)", () => {
    process.env.CLAUDECODE = "1";
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-bin-"));
    const fakeCodex = path.join(binDir, "codex");
    fs.writeFileSync(fakeCodex, "#!/bin/sh\n");
    fs.chmodSync(fakeCodex, 0o755);
    process.env.PATH = binDir;
    fs.writeFileSync(path.join(tmp!.home, ".codex", "auth.json"), "{}");
    try {
      const out = resolveExecutionRealizationHandoff({
        explicitCodex: false,
        prepareOnly: false,
        ontoConfig: {},
      });
      expect(out.type).toBe("coordinator_start");
      if (out.type === "coordinator_start") {
        expect(out.profile.execution_realization).toBe("host-team");
      }
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  });

  it("E6 auto + nothing available → no_host", () => {
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      prepareOnly: false,
      ontoConfig: {},
    });
    expect(out).toEqual({ type: "no_host" });
  });

  it("E7 llm.provider=lmstudio → ts_inline_http self-execute", () => {
    // Local model wiring is live via the P4 llm-switcher branch. The
    // handoff returns `self` so the invoking process runs the executor
    // in-band.
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      prepareOnly: false,
      ontoConfig: {
        llm: {
          auth: "local",
          provider: "lmstudio",
          model: "llama-8b",
          base_url: "http://proxy.local",
        },
      },
    });
    expect(out).toEqual({
      type: "self",
      profile: { execution_realization: "ts_inline_http", host_runtime: "lmstudio" },
    });
  });
});
