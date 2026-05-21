import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  detectHostRuntime,
  detectHostRuntimeCategory,
  detectHostCapabilities,
  detectClaudeCodeEnvSignal,
  detectCodexEnvSignal,
  ENV_ONTO_HOST_RUNTIME,
} from "./host-detection.js";

const HOST_ENV_VARS = [
  ENV_ONTO_HOST_RUNTIME,
  "CLAUDECODE",
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
  "CODEX_THREAD_ID",
  "CODEX_CI",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
];

let savedEnv: Record<string, string | undefined> = {};

function savePotentiallyConflictingEnv(): void {
  savedEnv = {};
  for (const key of HOST_ENV_VARS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // Make PATH effectively empty so codex binary detection cannot
  // accidentally trigger on the test runner's shell PATH.
  savedEnv.PATH = process.env.PATH;
  process.env.PATH = "";
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

beforeEach(() => {
  savePotentiallyConflictingEnv();
});
afterEach(() => {
  restoreEnv();
});

describe("detectHostRuntime — priority order", () => {
  it("Priority 1: ONTO_HOST_RUNTIME env override wins over all signals", () => {
    process.env[ENV_ONTO_HOST_RUNTIME] = "standalone";
    process.env.CLAUDECODE = "1";
    process.env.CODEX_THREAD_ID = "abc";

    const result = detectHostRuntime({ host_runtime: "claude" });

    expect(result.hostRuntime).toBe("standalone");
    expect(result.detectionSource).toBe("env_override");
  });

  it("Priority 2: config.host_runtime wins over env signals (no env override)", () => {
    process.env.CLAUDECODE = "1";
    process.env.CODEX_THREAD_ID = "abc";

    const result = detectHostRuntime({ host_runtime: "codex" });

    expect(result.hostRuntime).toBe("codex");
    expect(result.detectionSource).toBe("config_override");
  });

  it("Priority 3: Claude env signal → claude when no override", () => {
    process.env.CLAUDECODE = "1";

    const result = detectHostRuntime({});

    expect(result.hostRuntime).toBe("claude");
    expect(result.detectionSource).toBe("claude_env_signal");
  });

  it("Priority 4: Codex env signal → codex when no Claude signal", () => {
    process.env.CODEX_THREAD_ID = "thread-123";

    const result = detectHostRuntime({});

    expect(result.hostRuntime).toBe("codex");
    expect(result.detectionSource).toBe("codex_env_signal");
  });

  it("Priority 6: standalone default when no signals", () => {
    const result = detectHostRuntime({});

    expect(result.hostRuntime).toBe("standalone");
    expect(result.detectionSource).toBe("standalone_default");
  });

  it("ONTO_HOST_RUNTIME accepts case-insensitive values", () => {
    process.env[ENV_ONTO_HOST_RUNTIME] = "  CLAUDE  ";

    const result = detectHostRuntime({});

    expect(result.hostRuntime).toBe("claude");
    expect(result.detectionSource).toBe("env_override");
  });

  it("ONTO_HOST_RUNTIME with invalid value is ignored, falls through to next priority", () => {
    process.env[ENV_ONTO_HOST_RUNTIME] = "invalid_host";
    process.env.CLAUDECODE = "1";

    const result = detectHostRuntime({});

    expect(result.hostRuntime).toBe("claude");
    expect(result.detectionSource).toBe("claude_env_signal");
  });
});

describe("detectHostRuntime — Claude env signal variants", () => {
  it("CLAUDECODE alone triggers claude", () => {
    process.env.CLAUDECODE = "1";
    expect(detectHostRuntimeCategory({})).toBe("claude");
  });

  it("CLAUDE_PROJECT_DIR alone triggers claude", () => {
    process.env.CLAUDE_PROJECT_DIR = "/some/project";
    expect(detectHostRuntimeCategory({})).toBe("claude");
  });

  it("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS alone does not trigger claude", () => {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
    expect(detectHostRuntimeCategory({})).toBe("standalone");
  });

  it("Codex env signal wins when only the Claude experimental flag is also present", () => {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
    process.env.CODEX_THREAD_ID = "thread-x";
    expect(detectHostRuntimeCategory({})).toBe("codex");
  });

  it("Claude takes priority over codex when both env signals present", () => {
    process.env.CLAUDECODE = "1";
    process.env.CODEX_THREAD_ID = "thread-x";
    expect(detectHostRuntimeCategory({})).toBe("claude");
  });
});

describe("detectHostCapabilities — capability matrix", () => {
  it("claude host: hasTeamCreate + hasAgentSpawn = true", () => {
    const caps = detectHostCapabilities("claude");
    expect(caps.hasTeamCreate).toBe(true);
    expect(caps.hasAgentSpawn).toBe(true);
  });

  it("codex host: hasTeamCreate + hasAgentSpawn = false", () => {
    const caps = detectHostCapabilities("codex");
    expect(caps.hasTeamCreate).toBe(false);
    expect(caps.hasAgentSpawn).toBe(false);
  });

  it("standalone host: hasTeamCreate + hasAgentSpawn = false", () => {
    const caps = detectHostCapabilities("standalone");
    expect(caps.hasTeamCreate).toBe(false);
    expect(caps.hasAgentSpawn).toBe(false);
  });

  it("LLM provider capabilities are environmental, independent of host", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-openai-test";

    const claudeCaps = detectHostCapabilities("claude");
    const standaloneCaps = detectHostCapabilities("standalone");

    expect(claudeCaps.hasAnthropicApiKey).toBe(true);
    expect(claudeCaps.hasOpenAiApiKey).toBe(true);
    expect(standaloneCaps.hasAnthropicApiKey).toBe(true);
    expect(standaloneCaps.hasOpenAiApiKey).toBe(true);
  });
});

describe("Low-level signal detectors", () => {
  it("detectClaudeCodeEnvSignal: returns false when no Claude env vars", () => {
    expect(detectClaudeCodeEnvSignal()).toBe(false);
  });

  it("detectClaudeCodeEnvSignal: returns true on Claude host signals only", () => {
    process.env.CLAUDECODE = "1";
    expect(detectClaudeCodeEnvSignal()).toBe(true);
    delete process.env.CLAUDECODE;

    process.env.CLAUDE_PROJECT_DIR = "/x";
    expect(detectClaudeCodeEnvSignal()).toBe(true);
    delete process.env.CLAUDE_PROJECT_DIR;

    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
    expect(detectClaudeCodeEnvSignal()).toBe(false);
  });

  it("detectCodexEnvSignal: returns false when no codex env", () => {
    expect(detectCodexEnvSignal()).toBe(false);
  });

  it("detectCodexEnvSignal: returns true on CODEX_THREAD_ID", () => {
    process.env.CODEX_THREAD_ID = "x";
    expect(detectCodexEnvSignal()).toBe(true);
  });

  it("detectCodexEnvSignal: returns true on CODEX_CI", () => {
    process.env.CODEX_CI = "1";
    expect(detectCodexEnvSignal()).toBe(true);
  });
});
