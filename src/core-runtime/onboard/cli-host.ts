import { execFileSync } from "node:child_process";
import {
  type ApplyResult,
  type DetectionStatus,
  type HostId,
  type HostPlan,
  type HostTarget,
  type RegisterOptions,
  type RegistrationEntry,
} from "./types.js";
import { isCommandOnPath } from "./path-scan.js";

/**
 * Hosts registered through their own official CLI (`claude mcp …`,
 * `codex mcp …`). The CLI owns the config format/schema, which keeps us
 * dependency-free (no TOML parser) and forward-compatible.
 */

export interface CommandRun {
  status: number;
  stdout: string;
  stderr: string;
}

/** Injectable command runner (defaults to real process execution; mocked in tests). */
export interface CommandRunner {
  exists(command: string): boolean;
  run(command: string, args: string[]): CommandRun;
}

export const defaultCommandRunner: CommandRunner = {
  exists: (command) => isCommandOnPath(command),
  run: (command, args) => {
    try {
      const stdout = execFileSync(command, args, { encoding: "utf8" });
      return { status: 0, stdout, stderr: "" };
    } catch (error) {
      const err = error as { status?: number; stdout?: unknown; stderr?: unknown };
      return {
        status: typeof err.status === "number" ? err.status : 1,
        stdout: typeof err.stdout === "string" ? err.stdout : "",
        stderr:
          typeof err.stderr === "string"
            ? err.stderr
            : error instanceof Error
              ? error.message
              : String(error),
      };
    }
  },
};

export interface CliHostSpec {
  id: HostId;
  displayName: string;
  /** The CLI executable name, e.g. `claude` or `codex`. */
  cli: string;
  /** Build the `mcp add` argv (after the cli name) for this host. */
  addArgs: (entry: RegistrationEntry) => string[];
  /** Build the `mcp remove` argv used by `--force` re-registration. */
  removeArgs: (entry: RegistrationEntry) => string[];
  /** Build the `mcp list` argv used to probe for an existing entry. */
  listArgs: () => string[];
  /** Manual fallback instructions shown when the CLI is absent. */
  manualInstructions: (entry: RegistrationEntry) => string;
}

function isAlreadyRegistered(
  spec: CliHostSpec,
  runner: CommandRunner,
  entry: RegistrationEntry,
): boolean {
  const result = runner.run(spec.cli, spec.listArgs());
  if (result.status !== 0) return false;
  const haystack = `${result.stdout}\n${result.stderr}`;
  // CLIs print one server name per line; a word-boundary match avoids
  // false positives from substrings of other server names.
  const pattern = new RegExp(`(^|[^\\w-])${escapeRegExp(entry.name)}([^\\w-]|$)`, "m");
  return pattern.test(haystack);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createCliHost(
  spec: CliHostSpec,
  runner: CommandRunner = defaultCommandRunner,
): HostTarget {
  const detect = (): DetectionStatus => (runner.exists(spec.cli) ? "cli" : "absent");

  return {
    id: spec.id,
    displayName: spec.displayName,
    detect,
    plan(entry: RegistrationEntry): HostPlan {
      const detection = detect();
      if (detection === "absent") {
        return {
          hostId: spec.id,
          displayName: spec.displayName,
          detection,
          method: "manual",
          summary: `${spec.cli} CLI not found — manual step required`,
          manualInstructions: spec.manualInstructions(entry),
        };
      }
      const commandLine = `${spec.cli} ${spec.addArgs(entry).join(" ")}`;
      return {
        hostId: spec.id,
        displayName: spec.displayName,
        detection,
        method: "cli",
        summary: `Run: ${commandLine}`,
        commandLine,
      };
    },
    async apply(
      entry: RegistrationEntry,
      options: RegisterOptions,
    ): Promise<ApplyResult> {
      if (detect() === "absent") {
        return {
          hostId: spec.id,
          displayName: spec.displayName,
          outcome: "manual",
          detail: spec.manualInstructions(entry),
        };
      }

      const exists = isAlreadyRegistered(spec, runner, entry);
      if (exists && !options.force) {
        return {
          hostId: spec.id,
          displayName: spec.displayName,
          outcome: "skipped",
          detail: `${entry.name} already registered (use --force to re-add)`,
        };
      }
      if (exists && options.force) {
        runner.run(spec.cli, spec.removeArgs(entry)); // best effort; ignore failure
      }

      const result = runner.run(spec.cli, spec.addArgs(entry));
      if (result.status === 0) {
        return {
          hostId: spec.id,
          displayName: spec.displayName,
          outcome: exists ? "updated" : "registered",
          detail: `${spec.cli} ${spec.addArgs(entry).join(" ")}`,
        };
      }
      return {
        hostId: spec.id,
        displayName: spec.displayName,
        outcome: "failed",
        detail: (result.stderr || result.stdout || "command failed").trim(),
      };
    },
  };
}

/** Claude Code — registers at user scope so it applies across all projects. */
export function createClaudeCodeHost(runner?: CommandRunner): HostTarget {
  return createCliHost(
    {
      id: "claude-code",
      displayName: "Claude Code",
      cli: "claude",
      addArgs: (entry) => [
        "mcp",
        "add",
        entry.name,
        "-s",
        "user",
        "--",
        entry.command,
        ...entry.args,
      ],
      removeArgs: (entry) => ["mcp", "remove", entry.name, "-s", "user"],
      listArgs: () => ["mcp", "list"],
      manualInstructions: (entry) =>
        `claude CLI not found. Install Claude Code, then run:\n` +
        `  claude mcp add ${entry.name} -s user -- ${entry.command} ${entry.args.join(" ")}`,
    },
    runner,
  );
}

/** Codex CLI. */
export function createCodexHost(runner?: CommandRunner): HostTarget {
  return createCliHost(
    {
      id: "codex",
      displayName: "Codex CLI",
      cli: "codex",
      addArgs: (entry) => [
        "mcp",
        "add",
        entry.name,
        "--",
        entry.command,
        ...entry.args,
      ],
      removeArgs: (entry) => ["mcp", "remove", entry.name],
      listArgs: () => ["mcp", "list"],
      manualInstructions: (entry) =>
        `codex CLI not found. Either install Codex and run:\n` +
        `  codex mcp add ${entry.name} -- ${entry.command} ${entry.args.join(" ")}\n` +
        `or add this block to ~/.codex/config.toml:\n` +
        `  [mcp_servers.${entry.name}]\n` +
        `  command = "${entry.command}"\n` +
        `  args = [${entry.args.map((a) => `"${a}"`).join(", ")}]`,
    },
    runner,
  );
}
