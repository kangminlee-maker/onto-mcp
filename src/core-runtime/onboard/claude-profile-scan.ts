import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Markers that identify a directory as a Claude Code config dir.
 *
 * `settings.json` and `.credentials.json` are documented to live under
 * `CLAUDE_CONFIG_DIR` (code.claude.com/docs/en/settings: "Credentials are
 * stored in ~/.claude/.credentials.json, or under $CLAUDE_CONFIG_DIR if that
 * variable is set"). `.claude.json` (user/local MCP + state) and `projects/`
 * appear inside relocated profile dirs in practice. Requiring any one of these
 * excludes sibling dirs like `.claude-sessions` that match the name glob but
 * are not config roots.
 */
const CLAUDE_CONFIG_MARKERS = [
  "settings.json",
  ".credentials.json",
  ".claude.json",
  "projects",
] as const;

export interface DiscoverClaudeProfilesOptions {
  /** Home directory to scan (default: os.homedir()). */
  homeDir?: string;
  /** Ambient CLAUDE_CONFIG_DIR; included even when outside the home glob. */
  configDirEnv?: string;
}

function isDirectory(target: string): boolean {
  try {
    return fsSync.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** True when `dir` is a directory carrying at least one Claude config marker. */
export function looksLikeClaudeConfigDir(dir: string): boolean {
  if (!isDirectory(dir)) return false;
  return CLAUDE_CONFIG_MARKERS.some((marker) =>
    fsSync.existsSync(path.join(dir, marker)),
  );
}

/**
 * Discover Claude Code config directories the user keeps under their home:
 * the default `~/.claude` plus `~/.claude-*` variants that carry a config
 * marker, plus any ambient `CLAUDE_CONFIG_DIR` (honored even if it lives
 * outside the home glob). Returns absolute paths, deduped and deterministically
 * sorted (default `~/.claude` first, then numeric-aware order).
 */
export function discoverClaudeProfiles(
  options: DiscoverClaudeProfilesOptions = {},
): string[] {
  const home = options.homeDir ?? os.homedir();
  const found = new Set<string>();

  // Ambient CLAUDE_CONFIG_DIR is authoritative for "the active profile" and may
  // point outside the home glob, so include it whenever it resolves to a dir.
  const env = options.configDirEnv?.trim();
  if (env && isDirectory(env)) found.add(path.resolve(env));

  let entries: string[] = [];
  try {
    entries = fsSync.readdirSync(home);
  } catch {
    entries = [];
  }
  for (const name of entries) {
    if (name !== ".claude" && !name.startsWith(".claude-")) continue;
    const dir = path.join(home, name);
    if (looksLikeClaudeConfigDir(dir)) found.add(path.resolve(dir));
  }

  return [...found].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}
