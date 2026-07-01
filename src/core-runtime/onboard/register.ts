import {
  ALL_HOST_IDS,
  type ApplyResult,
  type HostId,
  type HostPlan,
  type HostTarget,
  type RegisterOptions,
  type RegistrationEntry,
} from "./types.js";
import { getDefaultHostTargets } from "./host-target.js";
import { discoverClaudeProfiles } from "./claude-profile-scan.js";
import { promptMultiSelect, promptYesNo } from "./prompt.js";

/**
 * `onto register` — registers the onto MCP server into supported hosts.
 *
 * Interactive when stdin is a TTY and no host selection flags are given;
 * fully flag-driven otherwise (CI / scripts). Writes only host-owned config.
 */

export interface ParsedRegisterArgs {
  hosts: HostId[] | "all" | undefined;
  yes: boolean;
  dryRun: boolean;
  force: boolean;
  list: boolean;
  help: boolean;
  name: string;
  command: string;
  claudeConfigDir: string | undefined;
  allClaudeProfiles: boolean;
  unknownFlags: string[];
  invalidHosts: string[];
}

const USAGE = [
  "Usage: onto register [options]",
  "",
  "Register the onto MCP server into supported hosts so they launch `onto mcp`.",
  "Interactive when run in a terminal with no --hosts/--all; flag-driven otherwise.",
  "",
  "Hosts: claude-code, codex, claude-desktop, cursor",
  "",
  "Options:",
  "  --hosts <a,b,...>  Comma-separated host ids to register",
  "  --all              Register all supported hosts",
  "  --list             Show host detection status and exit",
  "  --dry-run          Show intended changes without writing",
  "  --yes, -y          Skip the confirmation prompt (required in non-TTY)",
  "  --force            Re-register CLI hosts even if already present",
  "  --name <id>        MCP server name (default: onto)",
  "  --command <cmd>    Executable the host launches (default: onto)",
  "  --claude-config-dir <path>  Target a Claude Code profile (sets",
  "                     CLAUDE_CONFIG_DIR; default: ambient env or ~/.claude)",
  "  --all-claude-profiles  Auto-discover every Claude Code config dir under",
  "                     home (~/.claude and ~/.claude-*) and register each",
  "                     (mutually exclusive with --claude-config-dir)",
  "  --help, -h         Show this help",
].join("\n");

export function parseRegisterArgs(argv: string[]): ParsedRegisterArgs {
  const parsed: ParsedRegisterArgs = {
    hosts: undefined,
    yes: false,
    dryRun: false,
    force: false,
    list: false,
    help: false,
    name: "onto",
    command: "onto",
    claudeConfigDir: undefined,
    allClaudeProfiles: false,
    unknownFlags: [],
    invalidHosts: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--all":
        parsed.hosts = "all";
        break;
      case "--yes":
      case "-y":
        parsed.yes = true;
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--force":
        parsed.force = true;
        break;
      case "--list":
        parsed.list = true;
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--hosts": {
        const value = argv[++i] ?? "";
        const ids: HostId[] = [];
        for (const raw of value.split(",").map((s) => s.trim()).filter(Boolean)) {
          if ((ALL_HOST_IDS as readonly string[]).includes(raw)) {
            ids.push(raw as HostId);
          } else {
            parsed.invalidHosts.push(raw);
          }
        }
        parsed.hosts = parsed.hosts === "all" ? "all" : ids;
        break;
      }
      case "--name":
        parsed.name = argv[++i] ?? parsed.name;
        break;
      case "--command":
        parsed.command = argv[++i] ?? parsed.command;
        break;
      case "--claude-config-dir":
        parsed.claudeConfigDir = argv[++i] ?? parsed.claudeConfigDir;
        break;
      case "--all-claude-profiles":
        parsed.allClaudeProfiles = true;
        break;
      default:
        parsed.unknownFlags.push(arg);
        break;
    }
  }

  return parsed;
}

/** Unique selection identity for a target (host *instance*, not just kind). */
function targetKey(target: HostTarget): string {
  return target.key ?? target.id;
}

/**
 * Flag-driven selection by host *kind* (`id`). `--hosts claude-code` therefore
 * selects every Claude Code profile target when several are expanded.
 */
function resolveSelectedTargets(
  parsed: ParsedRegisterArgs,
  targets: HostTarget[],
): HostTarget[] {
  if (parsed.hosts === "all") return targets;
  if (Array.isArray(parsed.hosts)) {
    const requested = new Set(parsed.hosts);
    return targets.filter((t) => requested.has(t.id));
  }
  return [];
}

function detectionLabel(status: string): string {
  if (status === "cli") return "detected (CLI)";
  if (status === "config") return "detected (config)";
  return "not detected";
}

function printPlans(plans: HostPlan[]): void {
  console.log("\nPlanned changes:");
  for (const plan of plans) {
    console.log(`  • ${plan.displayName} [${detectionLabel(plan.detection)}]`);
    console.log(`      ${plan.summary}`);
    if (plan.method === "manual" && plan.manualInstructions) {
      for (const line of plan.manualInstructions.split("\n")) {
        console.log(`      ${line}`);
      }
    }
  }
}

function printResults(results: ApplyResult[]): void {
  console.log("\nResults:");
  for (const result of results) {
    console.log(`  • ${result.displayName}: ${result.outcome} — ${result.detail}`);
  }
}

export interface RunRegisterDeps {
  targets?: HostTarget[];
  isTty?: boolean;
  /** Override Claude profile discovery (defaults to scanning the home dir). */
  discoverClaudeProfiles?: () => string[];
}

/**
 * Build the default host targets honoring profile flags. When
 * `--all-claude-profiles` is set, discover every Claude Code config dir under
 * home and expand Claude Code into one target per profile; if none are found,
 * fall back to the single default target with a note.
 */
function buildDefaultTargets(
  parsed: ParsedRegisterArgs,
  deps: RunRegisterDeps,
): HostTarget[] {
  if (parsed.allClaudeProfiles) {
    const discover =
      deps.discoverClaudeProfiles ??
      (() => {
        const env = process.env.CLAUDE_CONFIG_DIR;
        return discoverClaudeProfiles(env ? { configDirEnv: env } : {});
      });
    const profiles = discover();
    if (profiles.length > 0) {
      return getDefaultHostTargets({ claudeProfiles: profiles });
    }
    console.error(
      "[onto register] --all-claude-profiles: no Claude Code config dirs found " +
        "under home; falling back to the default profile.",
    );
    return getDefaultHostTargets({});
  }
  return getDefaultHostTargets(
    parsed.claudeConfigDir ? { claudeConfigDir: parsed.claudeConfigDir } : {},
  );
}

export async function runRegister(
  argv: string[],
  deps: RunRegisterDeps = {},
): Promise<number> {
  const parsed = parseRegisterArgs(argv);
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }
  if (parsed.unknownFlags.length > 0) {
    console.error(`[onto register] Unknown option(s): ${parsed.unknownFlags.join(", ")}`);
    console.error(USAGE);
    return 1;
  }
  if (parsed.invalidHosts.length > 0) {
    console.error(
      `[onto register] Unknown host(s): ${parsed.invalidHosts.join(", ")}. ` +
        `Valid: ${ALL_HOST_IDS.join(", ")}`,
    );
    return 1;
  }
  if (parsed.allClaudeProfiles && parsed.claudeConfigDir) {
    console.error(
      "[onto register] Use either --all-claude-profiles or --claude-config-dir, " +
        "not both.",
    );
    return 1;
  }

  const targets = deps.targets ?? buildDefaultTargets(parsed, deps);
  const isTty = deps.isTty ?? Boolean(process.stdin.isTTY);

  if (parsed.list) {
    console.log("Host detection:");
    for (const target of targets) {
      console.log(`  • ${target.displayName}: ${detectionLabel(target.detect())}`);
    }
    return 0;
  }

  const entry: RegistrationEntry = {
    name: parsed.name,
    command: parsed.command,
    args: ["mcp"],
  };

  // Determine which hosts to register.
  let selectedTargets = resolveSelectedTargets(parsed, targets);
  const selectionGivenByFlag = parsed.hosts !== undefined;

  if (!selectionGivenByFlag) {
    if (!isTty) {
      console.error(
        "[onto register] No hosts specified. Use --hosts <ids> or --all " +
          "(interactive selection requires a terminal).",
      );
      return 1;
    }
    const defaults = targets.filter((t) => t.detect() !== "absent").map(targetKey);
    const chosen = await promptMultiSelect(
      "Select hosts to register onto with:",
      targets.map((t) => ({
        id: targetKey(t),
        label: t.displayName,
        detail: detectionLabel(t.detect()),
      })),
      defaults.length > 0 ? defaults : targets.map(targetKey),
    );
    selectedTargets = targets.filter((t) => chosen.includes(targetKey(t)));
  }

  if (selectedTargets.length === 0) {
    console.error("[onto register] No hosts selected. Nothing to do.");
    return 1;
  }
  const options: RegisterOptions = { force: parsed.force, dryRun: parsed.dryRun };
  const plans = selectedTargets.map((t) => t.plan(entry, options));
  printPlans(plans);

  if (parsed.dryRun) {
    console.log("\n(dry-run) No changes were written.");
    return 0;
  }

  // Confirmation gate (write-before-confirm governance, product-locality §5.3 spirit).
  if (!parsed.yes) {
    if (!isTty) {
      console.error(
        "\n[onto register] Refusing to write without confirmation. Re-run with --yes.",
      );
      return 1;
    }
    const proceed = await promptYesNo("\nApply these changes?", true);
    if (!proceed) {
      console.log("Aborted. No changes written.");
      return 0;
    }
  }

  const results: ApplyResult[] = [];
  for (const target of selectedTargets) {
    results.push(await target.apply(entry, options));
  }
  printResults(results);

  const failed = results.filter((r) => r.outcome === "failed");
  const manual = results.filter((r) => r.outcome === "manual");
  if (manual.length > 0) {
    console.log(
      `\nNote: ${manual.length} host(s) need a manual step (CLI not found) — see above.`,
    );
  }
  if (failed.length > 0) {
    console.error(`\n${failed.length} host(s) failed to register.`);
    return 1;
  }
  console.log("\nDone. Restart the host app(s) to pick up the onto MCP server.");
  return 0;
}
