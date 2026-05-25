import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectCodexBinaryAvailable } from "../discovery/host-detection.js";
import { resolveExecutionRealizationHandoff } from "./review-invoke.js";

const originalEnv = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
}

function createTmpHome(): { home: string; cleanup: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "onto-review-auto-"));
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  return {
    home,
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
  };
}

describe("review invoke execution auto-resolution", () => {
  let tmp: { home: string; cleanup: () => void } | null = null;

  beforeEach(() => {
    tmp = createTmpHome();
    process.env.HOME = tmp.home;
    process.env.PATH = "/tmp/onto-missing-bin";
    delete process.env.ONTO_HOST_RUNTIME;
    delete process.env.ONTO_LLM_MOCK;
    delete process.env.CLAUDECODE;
  });

  afterEach(() => {
    tmp?.cleanup();
    tmp = null;
    restoreEnv();
  });

  it("detects unavailable Codex when binary or auth is missing", () => {
    expect(detectCodexBinaryAvailable()).toBe(false);
  });

  it("uses API-key settings as direct-call self execution", () => {
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      ontoConfig: {
        llm: {
          auth: "api_key",
          provider: "anthropic",
          model: "claude-sonnet-4-6",
        },
      },
    });

    expect(out.type).toBe("self");
    if (out.type === "self") {
      expect(out.profile.execution_realization).toBe("direct-call");
      expect(out.profile.host_runtime).toBe("anthropic");
    }
  });

  it("uses local LM Studio settings as direct-call self execution", () => {
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      ontoConfig: {
        llm: {
          auth: "local",
          provider: "lmstudio",
          model: "llama-8b",
          base_url: "http://127.0.0.1:1234/v1",
        },
      },
    });

    expect(out.type).toBe("self");
    if (out.type === "self") {
      expect(out.profile.execution_realization).toBe("direct-call");
      expect(out.profile.host_runtime).toBe("lmstudio");
    }
  });

  it("fails loud for retired Claude host runtime selection", () => {
    process.env.ONTO_HOST_RUNTIME = "claude";
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      ontoConfig: {},
    });

    expect(out).toEqual({ type: "no_host" });
  });

  it("uses Codex worker when binary and auth are available", () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-codex-bin-"));
    const fakeCodex = path.join(binDir, "codex");
    fs.writeFileSync(fakeCodex, "#!/bin/sh\n");
    fs.chmodSync(fakeCodex, 0o755);
    process.env.PATH = binDir;
    fs.writeFileSync(path.join(tmp!.home, ".codex", "auth.json"), "{}");

    try {
      const out = resolveExecutionRealizationHandoff({
        explicitCodex: false,
        ontoConfig: {},
      });

      expect(out.type).toBe("self");
      if (out.type === "self") {
        expect(out.profile.execution_realization).toBe("worker");
        expect(out.profile.host_runtime).toBe("codex");
      }
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  });
});
