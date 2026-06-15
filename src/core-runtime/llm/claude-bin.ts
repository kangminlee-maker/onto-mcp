import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resolve the Claude Code CLI binary path, accommodating per-user install
 * locations. Anthropic OAuth review/reconstruct workers spawn this binary, and
 * its location varies by machine and install method — and a host like Claude
 * Desktop may launch the server with a minimal `PATH` that does not include the
 * user's `claude`. So a bare `spawn("claude")` is not reliable across users.
 *
 * Resolution order (first hit wins):
 *   1. `ONTO_CLAUDE_BIN` — explicit operator override (absolute path or name).
 *   2. `claude` discoverable on `PATH` (as an executable file — shell aliases
 *      and functions are never consulted because spawn does not use them).
 *   3. Common Claude Code install locations (native installer, older local
 *      install, Homebrew).
 *   4. The literal `"claude"` — so `spawn` fails with the existing actionable
 *      ENOENT message ("Claude Code CLI not found … set ONTO_CLAUDE_BIN") rather
 *      than this resolver inventing a different error.
 *
 * Pure function of `env`: resolution is a handful of `stat`/`access` syscalls and
 * each call site invokes it at most once per spawn (or once at module load), so
 * it is NOT cached — a cache keyed on nothing would return a stale path when a
 * later call passes a different `env.PATH` (the injected `env` would silently
 * stop controlling discovery). The same applies to the codex OAuth direct route
 * (`callCodexCli` still spawns a bare `"codex"`); extending this resolver to
 * codex is a symmetric, deferred follow-up.
 */

function isExecutableFile(candidate: string): boolean {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** `claude` resolvable as an executable file on `PATH` (not a shell alias). */
function findClaudeOnPath(env: NodeJS.ProcessEnv): string | undefined {
  const rawPath = env.PATH ?? env.Path ?? "";
  for (const dir of rawPath.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, "claude");
    if (isExecutableFile(candidate)) return candidate;
  }
  return undefined;
}

/** Common Claude Code install locations, checked when PATH lookup misses. */
function commonInstallLocations(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".local", "bin", "claude"), // native installer symlink
    path.join(home, ".claude", "local", "claude"), // older local install
    "/opt/homebrew/bin/claude", // Homebrew (Apple silicon)
    "/usr/local/bin/claude", // Homebrew (Intel) / manual
  ];
}

export function resolveClaudeBin(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ONTO_CLAUDE_BIN?.trim();
  if (override) return override;

  const onPath = findClaudeOnPath(env);
  if (onPath) return onPath;

  for (const location of commonInstallLocations()) {
    if (isExecutableFile(location)) return location;
  }

  // Not found — return the bare name so spawn ENOENT carries the actionable
  // "set ONTO_CLAUDE_BIN" guidance.
  // POSIX-scoped: the bundle targets macOS/Linux (manifest compatibility.platforms
  // = darwin/linux) and discovers a `claude` binary (no Windows `claude.exe` /
  // %LOCALAPPDATA% lookup). Windows is out of scope here.
  return "claude";
}
