import { type HostTarget } from "./types.js";
import { createClaudeCodeHost, createCodexHost } from "./cli-host.js";
import {
  claudeDesktopConfigPath,
  createJsonConfigHost,
  cursorConfigPath,
} from "./json-config-host.js";

/**
 * The four supported hosts in display order. CLI-backed hosts (Claude Code,
 * Codex) come first; JSON-config hosts (Claude Desktop, Cursor) follow.
 */
export function getDefaultHostTargets(): HostTarget[] {
  return [
    createClaudeCodeHost(),
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
