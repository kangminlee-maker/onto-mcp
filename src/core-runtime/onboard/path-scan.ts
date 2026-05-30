import fsSync from "node:fs";
import path from "node:path";

/**
 * True when `command` resolves to an executable on PATH.
 *
 * Mirrors the PATH-scan strategy in
 * `src/core-runtime/discovery/host-detection.ts` (`detectCodexBinaryAvailable`),
 * but is generic and does not require any auth file. On Windows it also probes
 * the common executable extensions.
 */
export function isCommandOnPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const pathEnv = env.PATH ?? env.Path ?? "";
  const isWindows = process.platform === "win32";
  const candidates = isWindows
    ? [command, `${command}.cmd`, `${command}.exe`, `${command}.bat`]
    : [command];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const candidate of candidates) {
      if (fsSync.existsSync(path.join(dir, candidate))) return true;
    }
  }
  return false;
}
