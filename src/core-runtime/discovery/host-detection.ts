import { execFileSync } from "node:child_process";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveClaudeBin } from "../llm/claude-bin.js";

const CODEX_ENV_SIGNALS = ["CODEX_THREAD_ID", "CODEX_CI"] as const;

/** True when the current process is running under a Codex-owned session. */
export function detectCodexEnvSignal(): boolean {
  for (const name of CODEX_ENV_SIGNALS) {
    if (process.env[name]) return true;
  }
  return false;
}

/**
 * True when the Codex worker path can be used from this process.
 *
 * Both the executable and an auth file are required. This keeps OAuth review
 * execution fail-loud when the host-bound worker is unavailable.
 */
export function detectCodexBinaryAvailable(): boolean {
  const pathEnv = process.env.PATH ?? "";
  let codexOnPath = false;
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    if (fsSync.existsSync(path.join(dir, "codex"))) {
      codexOnPath = true;
      break;
    }
  }
  if (!codexOnPath) return false;
  return fsSync.existsSync(path.join(os.homedir(), ".codex", "auth.json"));
}

/** OAuth credential filenames older Claude Code builds write under its config
 * dir. Newer builds store the credential in the OS keychain (macOS) instead, so
 * this file probe is the backward-compatible fallback, not the primary check. */
const CLAUDE_OAUTH_CREDENTIAL_FILENAMES = [
  ".credentials.json",
  ".oauth-token",
] as const;

/** Bound on the `claude auth status` probe so a wedged CLI cannot hang review
 * profile resolution. The command is a local credential read (~200ms observed),
 * so this is a generous ceiling, not a normal latency. */
const CLAUDE_AUTH_STATUS_TIMEOUT_MS = 5000;

function claudeConfigDir(env: NodeJS.ProcessEnv): string {
  const configured = env.CLAUDE_CONFIG_DIR;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim();
  }
  return path.join(os.homedir(), ".claude");
}

function claudeBinaryOnPath(env: NodeJS.ProcessEnv): boolean {
  const pathEnv = env.PATH ?? "";
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    if (fsSync.existsSync(path.join(dir, "claude"))) return true;
  }
  return false;
}

function hasClaudeCredentialFile(env: NodeJS.ProcessEnv): boolean {
  const configDir = claudeConfigDir(env);
  return CLAUDE_OAUTH_CREDENTIAL_FILENAMES.some((name) =>
    fsSync.existsSync(path.join(configDir, name)),
  );
}

/**
 * Parse the JSON `claude auth status` prints. Returns its `loggedIn` boolean
 * when the output is the recognized shape, or null otherwise (older CLI without
 * the command, an error, or a format change) so the caller can fall back to the
 * file-credential probe. Pure — unit-testable without spawning the CLI.
 */
export function parseClaudeAuthLoggedIn(stdout: string): boolean | null {
  try {
    const parsed = JSON.parse(stdout) as { loggedIn?: unknown };
    return typeof parsed?.loggedIn === "boolean" ? parsed.loggedIn : null;
  } catch {
    return null;
  }
}

/**
 * True when the Claude Code worker path can be used from this process.
 *
 * The authority on whether the worker can authenticate is the claude CLI
 * itself: `claude auth status` reports login across every credential store
 * (macOS Keychain, credential file, or env token) and every OS — which a
 * file-only probe cannot (a keychain-backed login leaves no credential file).
 * The worker spawns the same CLI, so this checks the exact auth path the run
 * will use. Binary resolution mirrors the executor via {@link resolveClaudeBin}
 * (ONTO_CLAUDE_BIN override + PATH).
 *
 * Falls back to the legacy file-credential probe when the CLI cannot answer
 * (missing binary, timeout, or a build too old for `auth status`), so setups
 * that resolved before this change keep resolving (backward compatible). Unlike
 * {@link detectCodexBinaryAvailable}, which reads codex's on-disk
 * `~/.codex/auth.json` directly, claude's credential is not reliably a file —
 * hence the CLI delegation.
 */
export function detectClaudeBinaryAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const claudeBin = resolveClaudeBin(env);
  try {
    const stdout = execFileSync(claudeBin, ["auth", "status"], {
      env,
      timeout: CLAUDE_AUTH_STATUS_TIMEOUT_MS,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const loggedIn = parseClaudeAuthLoggedIn(stdout);
    if (loggedIn !== null) return loggedIn;
  } catch {
    // ENOENT (no binary), timeout, non-zero exit, or a CLI too old to support
    // `auth status` — fall through to the legacy file-credential probe.
  }
  return claudeBinaryOnPath(env) && hasClaudeCredentialFile(env);
}
