import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectReviewAxes } from "./detect-review-axes.js";

// ---------------------------------------------------------------------------
// detectReviewAxes — Review UX Redesign P4 (2026-04-21)
// ---------------------------------------------------------------------------
//
// These tests exercise the projection of env signals into the onboard
// axis vocabulary. The underlying detection helpers (from discovery/) are
// covered by their own suite; here we only verify:
//
//   (1) Host priority ordering — Claude Code > Codex CLI > plain.
//   (2) agent_teams_available reads CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS.
//   (3) codex_available is sourced from the shared discovery helper.
//
// The codex binary / auth.json probe is filesystem-backed, so we mock
// `detectCodexBinaryAvailable` from the discovery module to keep the tests
// hermetic.
// ---------------------------------------------------------------------------

vi.mock("../discovery/host-detection.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../discovery/host-detection.js");
  return {
    ...actual,
    // Override only the filesystem-dependent probe. The env-signal helpers
    // remain real so we can control behaviour via process.env.
    detectCodexBinaryAvailable: vi.fn(() => false),
  };
});

const savedEnv: Record<string, string | undefined> = {};
const VOLATILE_ENV_KEYS = [
  "CLAUDECODE",
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
  "CODEX_THREAD_ID",
  "CODEX_CI",
];

beforeEach(() => {
  for (const key of VOLATILE_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of VOLATILE_ENV_KEYS) {
    const original = savedEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
  vi.resetAllMocks();
});

describe("detectReviewAxes — host category", () => {
  it("returns plain-terminal when no host signal is present", () => {
    const result = detectReviewAxes();
    expect(result.detected.host).toBe("plain-terminal");
  });

  it("returns claude-code when CLAUDECODE=1", () => {
    process.env.CLAUDECODE = "1";
    expect(detectReviewAxes().detected.host).toBe("claude-code");
  });

  it("returns claude-code when CLAUDE_PROJECT_DIR is set", () => {
    process.env.CLAUDE_PROJECT_DIR = "/tmp/proj";
    expect(detectReviewAxes().detected.host).toBe("claude-code");
  });

  it("returns codex-cli when CODEX_THREAD_ID is set", () => {
    process.env.CODEX_THREAD_ID = "thr-123";
    expect(detectReviewAxes().detected.host).toBe("codex-cli");
  });

  it("prefers claude-code over codex-cli when both signals are present", () => {
    // An inner Codex exec inside a Claude Code session — onboard context
    // is Claude Code; codex availability is surfaced separately.
    process.env.CLAUDECODE = "1";
    process.env.CODEX_THREAD_ID = "thr-123";
    expect(detectReviewAxes().detected.host).toBe("claude-code");
  });
});

describe("detectReviewAxes — agent_teams_available (strict =1)", () => {
  // The resolver uses `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1"`.
  // Onboard MUST use the same check so the two layers never disagree on
  // whether teams are available — otherwise onboard writes a config the
  // runtime silently rejects (P3 would degrade it, violating the UX
  // promise that "what onboard accepts is what runs").

  it("is false when env var is absent", () => {
    expect(detectReviewAxes().detected.agent_teams_available).toBe(false);
  });

  it('is true only when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1"', () => {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
    expect(detectReviewAxes().detected.agent_teams_available).toBe(true);
  });

  it('is false for truthy-looking strings that are not "1"', () => {
    // These would pass a naive Boolean() check but must NOT activate teams.
    // The resolver rejects them; onboard must match.
    for (const value of ["true", "yes", "on", "enabled", "TRUE", "2"]) {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = value;
      expect(detectReviewAxes().detected.agent_teams_available).toBe(false);
    }
  });

  it('is false for falsy-looking strings ("0", "false", empty)', () => {
    for (const value of ["0", "false", ""]) {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = value;
      expect(detectReviewAxes().detected.agent_teams_available).toBe(false);
    }
  });
});

describe("detectReviewAxes — codex_available", () => {
  it("surfaces the discovery helper verdict (mocked false by default)", async () => {
    const mod = await import("../discovery/host-detection.js");
    const spy = vi.mocked(mod.detectCodexBinaryAvailable);
    spy.mockReturnValue(false);
    expect(detectReviewAxes().detected.codex_available).toBe(false);

    spy.mockReturnValue(true);
    expect(detectReviewAxes().detected.codex_available).toBe(true);
  });
});
