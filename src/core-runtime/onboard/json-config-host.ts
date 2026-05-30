import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  type ApplyResult,
  type DetectionStatus,
  type HostId,
  type HostPlan,
  type HostTarget,
  type RegisterOptions,
  type RegistrationEntry,
  entryMatches,
} from "./types.js";

/**
 * Hosts that store MCP servers in a JSON file with an `mcpServers` map
 * (Claude Desktop, Cursor). Registration reconciles only our own `<name>` key
 * and preserves every other server already present.
 */

type ReconcileOutcome = "registered" | "updated" | "skipped";

interface ReconcileResult {
  config: Record<string, unknown>;
  outcome: ReconcileOutcome;
}

/**
 * Pure reconciliation: given the previously-parsed config (or undefined when the
 * file is absent/empty), return the new config object and what changed. Our own
 * `<name>` key is always brought to the desired value; sibling servers and other
 * top-level keys are preserved.
 */
export function reconcileMcpServers(
  existing: unknown,
  entry: RegistrationEntry,
): ReconcileResult {
  const root: Record<string, unknown> =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const priorServers =
    root.mcpServers && typeof root.mcpServers === "object" && !Array.isArray(root.mcpServers)
      ? (root.mcpServers as Record<string, unknown>)
      : {};
  const servers: Record<string, unknown> = { ...priorServers };
  const prior = servers[entry.name] as { command?: unknown; args?: unknown } | undefined;

  if (entryMatches(prior, entry)) {
    return { config: root, outcome: "skipped" };
  }

  servers[entry.name] = { command: entry.command, args: [...entry.args] };
  root.mcpServers = servers;
  return {
    config: root,
    outcome: prior === undefined ? "registered" : "updated",
  };
}

export interface JsonConfigHostSpec {
  id: HostId;
  displayName: string;
  /** Resolve the absolute config file path (allows env/home injection for tests). */
  resolvePath: () => string;
  /** Detection: present when the config file or its parent directory exists. */
  detect?: () => DetectionStatus;
}

function defaultDetect(configPath: string): DetectionStatus {
  if (fsSync.existsSync(configPath)) return "config";
  if (fsSync.existsSync(path.dirname(configPath))) return "config";
  return "absent";
}

async function readJsonIfPresent(filePath: string): Promise<unknown> {
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
  if (text.trim().length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Existing config at ${filePath} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Fix or remove it, then re-run.`,
    );
  }
}

export function createJsonConfigHost(spec: JsonConfigHostSpec): HostTarget {
  const detect = spec.detect ?? (() => defaultDetect(spec.resolvePath()));

  return {
    id: spec.id,
    displayName: spec.displayName,
    detect,
    plan(entry: RegistrationEntry): HostPlan {
      const targetPath = spec.resolvePath();
      return {
        hostId: spec.id,
        displayName: spec.displayName,
        detection: detect(),
        method: "config",
        summary: `Set mcpServers.${entry.name} → ${entry.command} ${entry.args.join(" ")}`.trim(),
        targetPath,
      };
    },
    async apply(
      entry: RegistrationEntry,
      _options: RegisterOptions,
    ): Promise<ApplyResult> {
      const targetPath = spec.resolvePath();
      try {
        const existing = await readJsonIfPresent(targetPath);
        const { config, outcome } = reconcileMcpServers(existing, entry);
        if (outcome === "skipped") {
          return {
            hostId: spec.id,
            displayName: spec.displayName,
            outcome: "skipped",
            detail: `${entry.name} already registered in ${targetPath}`,
          };
        }
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
        return {
          hostId: spec.id,
          displayName: spec.displayName,
          outcome,
          detail: `${outcome === "registered" ? "Added" : "Updated"} ${entry.name} in ${targetPath}`,
        };
      } catch (error) {
        return {
          hostId: spec.id,
          displayName: spec.displayName,
          outcome: "failed",
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Claude Desktop config path. macOS and Windows use app-data locations; other
 * platforms fall back to a Linux-style XDG path (best effort).
 */
export function claudeDesktopConfigPath(
  homedir: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "darwin") {
    return path.join(
      homedir,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(homedir, "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  return path.join(homedir, ".config", "Claude", "claude_desktop_config.json");
}

/** Cursor global MCP config path. */
export function cursorConfigPath(homedir: string = os.homedir()): string {
  return path.join(homedir, ".cursor", "mcp.json");
}
