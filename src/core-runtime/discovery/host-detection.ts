import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

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

/** OAuth credential filenames Claude Code may write under its config dir. */
const CLAUDE_OAUTH_CREDENTIAL_FILENAMES = [
  ".credentials.json",
  ".oauth-token",
] as const;

function claudeConfigDir(): string {
  const configured = process.env.CLAUDE_CONFIG_DIR;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim();
  }
  return path.join(os.homedir(), ".claude");
}

/**
 * True when the Claude Code worker path can be used from this process.
 *
 * Mirrors {@link detectCodexBinaryAvailable}: both the executable and an OAuth
 * credential are required so the external OAuth worker (`claude_code` adapter)
 * route stays fail-loud when the host-bound worker is unavailable. The config
 * dir honors CLAUDE_CONFIG_DIR; the credential filename is tolerant of the
 * known Claude Code variants.
 */
export function detectClaudeBinaryAvailable(): boolean {
  const pathEnv = process.env.PATH ?? "";
  let claudeOnPath = false;
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    if (fsSync.existsSync(path.join(dir, "claude"))) {
      claudeOnPath = true;
      break;
    }
  }
  if (!claudeOnPath) return false;
  const configDir = claudeConfigDir();
  return CLAUDE_OAUTH_CREDENTIAL_FILENAMES.some((name) =>
    fsSync.existsSync(path.join(configDir, name)),
  );
}
