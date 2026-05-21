/**
 * Pre-flight environment detection for `onto install`.
 *
 * Scans the environment ONCE at the start of the install flow and
 * produces a `PreflightDetection` snapshot. The interactive prompts
 * module and the non-interactive orchestration both read from this
 * snapshot rather than re-scanning at each step.
 *
 * # Why a single snapshot
 *
 * Two reasons:
 *
 *   1. Consistency — if the user runs `codex login` mid-install, the
 *      snapshot should remain stable so defaults don't shift under
 *      the user's feet. Re-scanning is an explicit action (e.g. the
 *      codex auth prompt retry path).
 *
 *   2. Testability — detect.test.ts can construct a synthetic
 *      snapshot without needing to stub filesystem / env var calls
 *      on every consumer.
 *
 * # Reuse of host-detection.ts
 *
 * The signal-level predicates (API keys, codex binary, Claude Code
 * env) live in `src/core-runtime/discovery/host-detection.ts` and are
 * shared across host resolution, topology detection, and now install.
 * We call them directly rather than duplicating logic.
 */

import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectAnthropicApiKey,
  detectClaudeCodeEnvSignal,
  detectOpenAiApiKey,
} from "../discovery/host-detection.js";
import type { PreflightDetection } from "./types.js";

const ENV_LITELLM_BASE_URL = "LITELLM_BASE_URL";

function detectLiteLlmEndpointForInstall(): boolean {
  return Boolean(process.env[ENV_LITELLM_BASE_URL]);
}

/**
 * True when the `codex` binary is reachable on PATH.
 *
 * Separate from auth detection because the install UX distinguishes:
 *
 *   - no binary              → "install codex CLI first"
 *   - binary + no auth.json  → "run `codex login` to continue"
 *   - binary + auth.json     → ready to use
 *
 * `host-detection.ts#detectCodexBinaryAvailable` combines both checks
 * for topology decisions; install needs the finer split.
 */
function detectCodexBinary(): boolean {
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    if (fsSync.existsSync(path.join(dir, "codex"))) {
      return true;
    }
  }
  return false;
}

/** True when `~/.codex/auth.json` exists (any content). */
function detectCodexAuthFile(): boolean {
  const authPath = path.join(os.homedir(), ".codex", "auth.json");
  return fsSync.existsSync(authPath);
}

/**
 * Path to the global onto config file candidate (`~/.onto/config.yml`).
 *
 * Exported so the writer and tests can reference the same path string
 * without hardcoding it in multiple places.
 */
export function globalConfigPath(): string {
  return path.join(os.homedir(), ".onto", "config.yml");
}

/**
 * Path to the project-scope onto config file candidate relative to a
 * given project root.
 */
export function projectConfigPath(projectRoot: string): string {
  return path.join(projectRoot, ".onto", "config.yml");
}

/**
 * Run pre-flight detection against the current process.
 *
 * `projectRoot` is the resolved target directory — typically
 * `resolveProjectRoot()` from the discovery layer. Caller is expected
 * to pass an absolute path; install does not try to re-resolve here
 * because the scope selection (global vs project) is downstream and
 * may override which config path matters.
 */
export function runPreflight(projectRoot: string): PreflightDetection {
  const litellmBaseUrlValue = process.env[ENV_LITELLM_BASE_URL];

  const result: PreflightDetection = {
    existingGlobalConfig: fsSync.existsSync(globalConfigPath()),
    existingProjectConfig: fsSync.existsSync(projectConfigPath(projectRoot)),
    hasAnthropicKey: detectAnthropicApiKey(),
    hasOpenAiKey: detectOpenAiApiKey(),
    hasLitellmBaseUrl: detectLiteLlmEndpointForInstall(),
    hasCodexBinary: detectCodexBinary(),
    hasCodexAuth: detectCodexAuthFile(),
    hostIsClaudeCode: detectClaudeCodeEnvSignal(),
  };

  if (result.hasLitellmBaseUrl && typeof litellmBaseUrlValue === "string") {
    result.litellmBaseUrlValue = litellmBaseUrlValue;
  }

  return result;
}

/**
 * Human-readable summary of a preflight snapshot, suitable for the
 * install command's Step 0 (pre-flight) display.
 *
 * Lines are indented 2 spaces and prefixed with `✓` / `·` to signal
 * presence vs absence. Pure render — no I/O.
 */
export function formatPreflightSummary(detection: PreflightDetection): string {
  const mark = (present: boolean): string => (present ? "✓" : "·");
  const lines = [
    "감지된 환경:",
    `  ${mark(detection.existingGlobalConfig)} global config (~/.onto/config.yml)`,
    `  ${mark(detection.existingProjectConfig)} project config (<cwd>/.onto/config.yml)`,
    `  ${mark(detection.hasAnthropicKey)} ANTHROPIC_API_KEY`,
    `  ${mark(detection.hasOpenAiKey)} OPENAI_API_KEY`,
    `  ${mark(detection.hasLitellmBaseUrl)} LITELLM_BASE_URL${
      detection.litellmBaseUrlValue ? ` = ${detection.litellmBaseUrlValue}` : ""
    }`,
    `  ${mark(detection.hasCodexBinary)} codex binary on PATH`,
    `  ${mark(detection.hasCodexAuth)} ~/.codex/auth.json`,
    `  ${mark(detection.hostIsClaudeCode)} running inside Claude Code session`,
  ];
  return lines.join("\n");
}
