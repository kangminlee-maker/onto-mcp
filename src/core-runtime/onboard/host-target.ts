import os from "node:os";
import path from "node:path";
import { type HostTarget } from "./types.js";
import { createClaudeCodeHost, createCodexHost } from "./cli-host.js";
import {
  claudeDesktopConfigPath,
  createJsonConfigHost,
  cursorConfigPath,
} from "./json-config-host.js";

export interface DefaultHostTargetOptions {
  /** Target a specific Claude Code profile by config dir (CLAUDE_CONFIG_DIR). */
  claudeConfigDir?: string;
  /**
   * Register one Claude Code target per config dir (auto-discovered profiles).
   * When non-empty, this replaces the single Claude Code target; takes
   * precedence over `claudeConfigDir`.
   */
  claudeProfiles?: string[];
}

/** Render an absolute path with the home prefix collapsed to `~` for display. */
function shortenHome(target: string): string {
  const home = os.homedir();
  const rel = path.relative(home, target);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return path.join("~", rel);
  }
  return target;
}

/** Build one Claude Code target per discovered profile config dir. */
function claudeProfileTargets(profiles: string[]): HostTarget[] {
  return profiles.map((dir) =>
    createClaudeCodeHost({
      configDir: dir,
      key: `claude-code:${dir}`,
      displayName: `Claude Code (${shortenHome(dir)})`,
    }),
  );
}

/**
 * The supported hosts in display order. CLI-backed hosts (Claude Code, Codex)
 * come first; JSON-config hosts (Claude Desktop, Cursor) follow. When
 * `claudeProfiles` is supplied, Claude Code expands into one target per profile.
 */
export function getDefaultHostTargets(
  options: DefaultHostTargetOptions = {},
): HostTarget[] {
  const claudeTargets =
    options.claudeProfiles && options.claudeProfiles.length > 0
      ? claudeProfileTargets(options.claudeProfiles)
      : [
          createClaudeCodeHost(
            options.claudeConfigDir ? { configDir: options.claudeConfigDir } : {},
          ),
        ];

  return [
    ...claudeTargets,
    createCodexHost(),
    createJsonConfigHost({
      id: "claude-desktop",
      displayName: "Claude Desktop",
      resolvePath: () => claudeDesktopConfigPath(),
    }),
    createJsonConfigHost({
      id: "cursor",
      displayName: "Cursor",
      resolvePath: () => cursorConfigPath(),
    }),
  ];
}
