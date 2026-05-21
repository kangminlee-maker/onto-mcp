/**
 * Plugin install path resolver.
 *
 * onto's canonical authority files (process.md, .onto/processes/, learning-rules.md,
 * .onto/roles/, etc.) are read at runtime from the install location. The path
 * resolution must support multiple install scenarios:
 *
 * 1. Claude Code plugin install: `~/.claude/plugins/onto/`
 * 2. Standalone clone + symlink: arbitrary path
 * 3. Repo development: the repo itself is the plugin
 *
 * # Resolution priority (highest first)
 *
 *   1. ONTO_PLUGIN_DIR env var (explicit override)
 *   2. ~/.claude/plugins/onto/ (Claude Code install default)
 *   3. (None) → returns null; caller decides its explicit default
 *
 * # Why no automatic repo-relative default
 *
 * Repo-relative paths are correct only during local dev. In production
 * (npm-installed CLI, Claude Code plugin), the plugin lives elsewhere.
 * Returning null when no install is detected lets the caller emit a clear
 * "set ONTO_PLUGIN_DIR or install via /plugin install" error rather than
 * silently using the wrong source tree.
 */

import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

export const ENV_ONTO_PLUGIN_DIR = "ONTO_PLUGIN_DIR";

/** The default Claude Code plugin install location. */
export const CLAUDE_CODE_PLUGIN_DEFAULT_PATH = path.join(
  os.homedir(),
  ".claude",
  "plugins",
  "onto",
);

export interface PluginPathResolution {
  pluginDir: string;
  source: "env_override" | "claude_code_install_default";
}

/**
 * Resolve the onto plugin install directory.
 *
 * Returns null when no install is found. Callers in the plugin's own runtime
 * (where __dirname can locate the source) may use repo-relative paths as a
 * default; documentation reads should error out when this returns null.
 */
export function resolvePluginPath(): PluginPathResolution | null {
  const envOverride = process.env[ENV_ONTO_PLUGIN_DIR];
  if (typeof envOverride === "string" && envOverride.length > 0) {
    const expanded = expandHome(envOverride);
    return { pluginDir: expanded, source: "env_override" };
  }

  if (fsSync.existsSync(CLAUDE_CODE_PLUGIN_DEFAULT_PATH)) {
    return {
      pluginDir: CLAUDE_CODE_PLUGIN_DEFAULT_PATH,
      source: "claude_code_install_default",
    };
  }

  return null;
}

/**
 * Resolve a plugin-relative path. Returns null when the plugin install is
 * not found.
 *
 * Example: `resolvePluginRelativePath(".onto/processes/reconstruct.md")` returns
 * `/home/user/.claude/plugins/onto/.onto/processes/reconstruct.md` (or whatever
 * `ONTO_PLUGIN_DIR` resolves to).
 */
export function resolvePluginRelativePath(relativePath: string): string | null {
  const resolution = resolvePluginPath();
  if (!resolution) return null;
  return path.join(resolution.pluginDir, relativePath);
}

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(p === "~" ? 1 : 2));
  }
  return p;
}
