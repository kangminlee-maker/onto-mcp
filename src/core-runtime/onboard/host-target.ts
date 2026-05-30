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
}

/**
 * The four supported hosts in display order. CLI-backed hosts (Claude Code,
 * Codex) come first; JSON-config hosts (Claude Desktop, Cursor) follow.
 */
export function getDefaultHostTargets(
  options: DefaultHostTargetOptions = {},
): HostTarget[] {
  return [
    createClaudeCodeHost(
      options.claudeConfigDir ? { configDir: options.claudeConfigDir } : {},
    ),
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
