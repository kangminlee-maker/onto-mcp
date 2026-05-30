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
 *
 * Two robustness measures handle hosts whose CLI name or config location
 * varies (e.g. Claude Code multi-profile via `CLAUDE_CONFIG_DIR`, or a `claude`
 * that is an aliased/wrapper no-op):
 *  - `commandEnv` lets a host pin environment (e.g. `CLAUDE_CONFIG_DIR`) onto
 *    every CLI call so probe and write target the same profile.
 *  - `apply()` re-probes after `mcp add` and only reports success when the
 *    server actually appears, so a CLI that exits 0 without registering is
 *    reported as `failed` rather than a false `registered`.
 */

export interface CommandRun {
  status: number;
  stdout: string;
  stderr: string;
}

/** Injectable command runner (defaults to real process execution; mocked in tests). */
export interface CommandRunner {
  exists(command: string): boolean;
  run(command: string, args: string[], env?: Record<string, string>): CommandRun;
}

export const defaultCommandRunner: CommandRunner = {
  exists: (command) => isCommandOnPath(command),
  run: (command, args, env) => {
    try {
      const stdout = execFileSync(command, args, {
        encoding: "utf8",
        ...(env ? { env: { ...process.env, ...env } } : {}),
      });
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
  /** Environment pinned onto every CLI call (e.g. `CLAUDE_CONFIG_DIR`). */
  commandEnv?: Record<string, string>;
  /** One-line note appended to the plan summary (e.g. effective config dir). */
  targetNote?: string;
}

/** Tri-state registration probe: avoids both false positives and false negatives. */
type ProbeState = "present" | "absent" | "unknown";

function probeRegistered(
  spec: CliHostSpec,
  runner: CommandRunner,
  entry: RegistrationEntry,
): ProbeState {
  const result = runner.run(spec.cli, spec.listArgs(), spec.commandEnv);
  if (result.status !== 0) return "unknown";
  const haystack = `${result.stdout}\n${result.stderr}`;
  // CLIs print one server name per line; a word-boundary match avoids
  // false positives from substrings of other server names.
  const pattern = new RegExp(`(^|[^\\w-])${escapeRegExp(entry.name)}([^\\w-]|$)`, "m");
  return pattern.test(haystack) ? "present" : "absent";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createCliHost(
  spec: CliHostSpec,
  runner: CommandRunner = defaultCommandRunner,
): HostTarget {
  const detect = (): DetectionStatus => (runner.exists(spec.cli) ? "cli" : "absent");
  const withNote = (summary: string): string =>
    spec.targetNote ? `${summary} (${spec.targetNote})` : summary;

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
        summary: withNote(`Run: ${commandLine}`),
        commandLine,
      };
    },
    async apply(
      entry: RegistrationEntry,
      options: RegisterOptions,
    ): Promise<ApplyResult> {
      const base = { hostId: spec.id, displayName: spec.displayName };
      if (detect() === "absent") {
        return { ...base, outcome: "manual", detail: spec.manualInstructions(entry) };
      }

      const before = probeRegistered(spec, runner, entry);
      if (before === "present" && !options.force) {
        return {
          ...base,
          outcome: "skipped",
          detail: `${entry.name} already registered (use --force to re-add)`,
        };
      }
      if (before === "present" && options.force) {
        runner.run(spec.cli, spec.removeArgs(entry), spec.commandEnv); // best effort
      }

      const result = runner.run(spec.cli, spec.addArgs(entry), spec.commandEnv);
      if (result.status !== 0) {
        return {
          ...base,
          outcome: "failed",
          detail: (result.stderr || result.stdout || "command failed").trim(),
        };
      }

      // Verify the add actually took effect. A CLI that exits 0 without
      // registering (aliased/wrapper `claude`, wrong profile) must not be
      // reported as success.
      const after = probeRegistered(spec, runner, entry);
      const outcome = before === "present" ? "updated" : "registered";
      if (after === "present") {
        return { ...base, outcome, detail: `${spec.cli} ${spec.addArgs(entry).join(" ")}` };
      }
      if (after === "unknown") {
        return {
          ...base,
          outcome,
          detail: `${spec.cli} ${spec.addArgs(entry).join(" ")} (could not verify via ${spec.cli} mcp list)`,
        };
      }
      return {
        ...base,
        outcome: "failed",
        detail:
          `${spec.cli} accepted the command but ${entry.name} is not listed afterward. ` +
          `The ${spec.cli} on PATH may be an alias/wrapper or target a different profile` +
          (spec.targetNote ? ` (${spec.targetNote})` : "") +
          `. Try registering against the real CLI/profile directly.`,
      };
    },
  };
}

export interface ClaudeCodeHostOptions {
  /** Target a specific Claude Code profile by config dir (CLAUDE_CONFIG_DIR). */
  configDir?: string;
  runner?: CommandRunner;
}

/**
 * Claude Code — registers at user scope so it applies across all projects.
 *
 * Config-dir resolution: explicit `configDir` wins; otherwise an ambient
 * `CLAUDE_CONFIG_DIR` is honored (and shown in the plan); otherwise the claude
 * default (`~/.claude`) applies.
 */
export function createClaudeCodeHost(options: ClaudeCodeHostOptions = {}): HostTarget {
  const effectiveDir = options.configDir ?? process.env.CLAUDE_CONFIG_DIR;
  const spec: CliHostSpec = {
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
    ...(effectiveDir ? { commandEnv: { CLAUDE_CONFIG_DIR: effectiveDir } } : {}),
    targetNote: effectiveDir ? `config dir: ${effectiveDir}` : "config dir: claude default (~/.claude)",
  };
  return createCliHost(spec, options.runner);
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
