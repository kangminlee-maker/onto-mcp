/**
 * Host MCP registration types.
 *
 * `onto register` writes the onto MCP server into each supported host's own
 * configuration so the host launches `onto mcp` as a stdio MCP server. This is
 * onboarding/integration, not onto runtime data: targets write to host-owned
 * config (user home), never to `{product}/.onto/`.
 */

/** Canonical host identifiers accepted by `--hosts`. */
export type HostId = "claude-code" | "codex" | "claude-desktop" | "cursor";

export const ALL_HOST_IDS: readonly HostId[] = [
  "claude-code",
  "codex",
  "claude-desktop",
  "cursor",
];

/** The MCP server entry written into each host. */
export interface RegistrationEntry {
  /** Server name/key under the host config. Default `onto`. */
  name: string;
  /** Executable the host should launch. Default `onto`. */
  command: string;
  /** Arguments passed to the executable. Default `["mcp"]`. */
  args: string[];
}

/**
 * How a host can currently be registered.
 * - `cli`: an official CLI (`claude`/`codex`) is on PATH and owns the write.
 * - `config`: the host stores MCP servers in a JSON file we edit directly.
 * - `absent`: the host is not detected on this machine.
 */
export type DetectionStatus = "cli" | "config" | "absent";

/** The write mechanism a target will use when applied. */
export type RegistrationMethod = "cli" | "config" | "manual";

/** A non-destructive description of what `apply()` would do (for dry-run/preview). */
export interface HostPlan {
  hostId: HostId;
  displayName: string;
  detection: DetectionStatus;
  method: RegistrationMethod;
  /** One-line human summary of the intended change. */
  summary: string;
  /** Config file path for the `config` method. */
  targetPath?: string;
  /** Shell command that would run for the `cli` method. */
  commandLine?: string;
  /** Paste-able instructions when the only safe path is manual. */
  manualInstructions?: string;
}

export type ApplyOutcome =
  | "registered"
  | "updated"
  | "skipped"
  | "manual"
  | "failed";

export interface ApplyResult {
  hostId: HostId;
  displayName: string;
  outcome: ApplyOutcome;
  /** Human detail: file written, command run, error message, or manual note. */
  detail: string;
}

export interface RegisterOptions {
  force: boolean;
  dryRun: boolean;
}

/**
 * A host target knows how to detect itself, describe an intended registration,
 * and apply it. Implementations write only to host-owned configuration.
 */
export interface HostTarget {
  readonly id: HostId;
  readonly displayName: string;
  detect(): DetectionStatus;
  plan(entry: RegistrationEntry, options: RegisterOptions): HostPlan;
  apply(entry: RegistrationEntry, options: RegisterOptions): Promise<ApplyResult>;
}

/** True when `command` and `args` of an existing host entry already match. */
export function entryMatches(
  existing: { command?: unknown; args?: unknown } | undefined,
  entry: RegistrationEntry,
): boolean {
  if (!existing || typeof existing !== "object") return false;
  if (existing.command !== entry.command) return false;
  const existingArgs = existing.args;
  if (!Array.isArray(existingArgs)) return entry.args.length === 0;
  if (existingArgs.length !== entry.args.length) return false;
  return existingArgs.every((value, index) => value === entry.args[index]);
}
