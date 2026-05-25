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
