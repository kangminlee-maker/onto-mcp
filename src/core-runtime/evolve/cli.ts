/**
 * Evolve runtime adapter.
 *
 * Routes evolve subcommands to the appropriate command handler.
 */

import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { resolveScopePaths, type ScopePaths } from "../scope-runtime/scope-manager.js";

export async function handleEvolveCli(
  ontoHome: string,
  argv: string[],
): Promise<number> {
  const subcommand = argv[0];
  const subArgv = argv.slice(1);

  switch (subcommand) {
    case "start":
      return handleEvolveStart(ontoHome, subArgv);
    case "propose-align":
      return handleEvolveProposeAlign(subArgv);
    case "align":
      return handleEvolveAlign(subArgv);
    case "draft":
      return handleEvolveDraft(subArgv);
    case "apply":
      return handleEvolveApply(subArgv);
    case "close":
      return handleEvolveClose(subArgv);
    case "defer":
      return handleEvolveDefer(subArgv);

    case "--help":
    case "-h":
    case undefined:
      console.log(
        [
          "Usage: evolve <subcommand> [options]",
          "",
          "Subcommands:",
          "  start <description>              Start or resume an evolve scope",
          "  propose-align --scope-id <id>    Submit consolidated dialog output → align_proposed",
          "  align --scope-id <id>            Lock or revise alignment direction",
          "  draft --scope-id <id>            Generate draft packet / confirm surface / decide constraints",
          "  apply --scope-id <id>            Apply evolve output to implementation",
          "  close --scope-id <id>            Close a validated scope",
          "  defer --scope-id <id>            Defer a non-terminal scope",
          "",
          "Options:",
          "  --project-root <path>       Project root (default: cwd)",
          "  --scopes-dir <path>         Scopes directory (default: <project-root>/scopes)",
          "  --project-name <name>       Project name for scope ID generation",
          "  --scope-id <id>             Target scope ID (required for align/draft/apply/close)",
          "  --entry-mode <mode>         'experience', 'interface', or 'process' (default: experience)",
          "  --json <content>            propose-align: dialog output JSON; align: verdict JSON",
          "  --reason <text>             Defer reason (required for defer)",
          "  --resume-condition <text>   Condition under which scope resumes (required for defer)",
          "",
          "propose-align UX contract:",
          "  Agent (Claude Code session / LLM) conducts dialog with Principal using",
          "  selection-based choices + natural-language fallback, consolidates answers",
          "  across rounds, and on convergence calls propose-align with the resulting",
          "  {interpreted_direction, proposed_scope, scenarios, as_is, constraints,",
          "   decision_questions}. Runtime owns state machine, event log, packet rendering.",
        ].join("\n"),
      );
      return 0;

    default:
      console.error(`[onto] Unknown evolve subcommand: ${subcommand}`);
      console.error("Run evolve help for usage.");
      return 1;
  }
}

// ─── Shared helpers ───

function readOption(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }
  return undefined;
}

function resolveScopePathsFromArgv(argv: string[]): ScopePaths | null {
  const scopeId = readOption(argv, "scope-id");
  if (!scopeId) {
    console.error("[onto] --scope-id is required.");
    return null;
  }
  const projectRoot = readOption(argv, "project-root") ?? process.cwd();
  const scopesDir = readOption(argv, "scopes-dir") ?? join(projectRoot, "scopes");
  return resolveScopePaths(scopesDir, scopeId);
}

// ─── start ───

async function handleEvolveStart(
  _ontoHome: string,
  argv: string[],
): Promise<number> {
  const { executeStart } = await import("./commands/start.js");

  const projectRoot = readOption(argv, "project-root") ?? process.cwd();
  const scopesDir = readOption(argv, "scopes-dir") ?? join(projectRoot, "scopes");
  const projectName = readOption(argv, "project-name");
  const scopeId = readOption(argv, "scope-id");
  const entryMode = (readOption(argv, "entry-mode") ?? "experience") as "experience" | "interface" | "process";

  // Collect non-flag arguments as description
  const rawInput = argv
    .filter((arg) => !arg.startsWith("--"))
    .join(" ")
    .trim();

  if (!rawInput && !scopeId) {
    console.error("[onto] evolve start requires a description or --scope-id to resume.");
    return 1;
  }

  // Ensure scopes directory exists
  if (!existsSync(scopesDir)) {
    mkdirSync(scopesDir, { recursive: true });
  }

  try {
    const result = await executeStart({
      rawInput: rawInput || "",
      projectRoot,
      scopesDir,
      ...(projectName !== undefined ? { projectName } : {}),
      ...(scopeId !== undefined ? { scopeId } : {}),
      entryMode,
      onProgress: (msg: string) => console.log(`  ${msg}`),
    });

    if (!result.success) {
      console.error(`[onto] evolve start failed: ${result.reason} (step: ${result.step})`);
      return 1;
    }

    if (result.action === "initialized") {
      console.log(
        JSON.stringify({
          status: "initialized",
          scope_id: result.scopeId,
          brief_path: result.briefPath,
          message: "Scope initialized. Fill in the brief, then resume evolve start.",
        }, null, 2),
      );
      return 0;
    }

    if (result.action === "resume_info") {
      console.log(
        JSON.stringify({
          status: "resume",
          scope_id: result.scopeId,
          current_state: result.currentState,
          next_action: result.nextAction,
        }, null, 2),
      );
      return 0;
    }

    if (result.action === "process_scope_created") {
      console.log(
        JSON.stringify({
          status: "process_scope_created",
          scope_id: result.scopeId,
          authority_sources: result.authoritySources.length,
          authority_consistency: result.authorityConsistency,
        }, null, 2),
      );
      return 0;
    }

    // Full execution result (code-product path)
    console.log(
      JSON.stringify({
        status: "executed",
        paths: result.paths,
        scan_results: result.scanResults.length,
        scan_errors: result.scanErrors.length,
        total_files: result.totalFiles,
      }, null, 2),
    );
    return 0;
  } catch (error) {
    console.error(
      `[onto] evolve start error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

// ─── align ───

// ─── propose-align ───

async function handleEvolveProposeAlign(argv: string[]): Promise<number> {
  const paths = resolveScopePathsFromArgv(argv);
  if (!paths) return 1;

  const jsonInput = readOption(argv, "json");
  if (!jsonInput) {
    console.error(
      "[onto] evolve propose-align requires --json '<dialog-output>'.",
    );
    console.error(
      'Shape: --json \'{"interpreted_direction":"...","proposed_scope":{"in":[...],"out":[...]},"as_is":{...},"constraints":[...],"decision_questions":[...]}\'',
    );
    console.error(
      "See evolve help for the UX contract (agent owns dialog, runtime owns state/events/packet).",
    );
    return 1;
  }

  const { executeProposeAlign } = await import("./commands/propose-align.js");
  const result = executeProposeAlign(paths, jsonInput);
  console.log(JSON.stringify(result, null, 2));
  return result.success ? 0 : 1;
}

// ─── align ───

async function handleEvolveAlign(argv: string[]): Promise<number> {
  const paths = resolveScopePathsFromArgv(argv);
  if (!paths) return 1;

  const jsonInput = readOption(argv, "json");
  if (!jsonInput) {
    console.error("[onto] evolve align requires --json '<verdict-object>'.");
    console.error("Example: --json '{\"type\":\"approve\",\"direction\":\"...\",\"scope_in\":[],\"scope_out\":[]}'");
    return 1;
  }

  const { executeAlign } = await import("./commands/align.js");
  const verdict = JSON.parse(jsonInput);
  const result = executeAlign({ paths, verdict });
  console.log(JSON.stringify(result, null, 2));
  return result.success ? 0 : 1;
}

// ─── draft ───

async function handleEvolveDraft(argv: string[]): Promise<number> {
  const paths = resolveScopePathsFromArgv(argv);
  if (!paths) return 1;

  const jsonInput = readOption(argv, "json");
  if (!jsonInput) {
    console.error("[onto] evolve draft requires --json '<action-object>'.");
    console.error("Example: --json '{\"type\":\"generate_surface\"}'");
    return 1;
  }

  const { executeDraft } = await import("./commands/draft.js");
  const action = JSON.parse(jsonInput);
  const result = executeDraft({ paths, action });
  console.log(JSON.stringify(result, null, 2));
  return result.success ? 0 : 1;
}

// ─── apply ───

async function handleEvolveApply(argv: string[]): Promise<number> {
  const paths = resolveScopePathsFromArgv(argv);
  if (!paths) return 1;

  const jsonInput = readOption(argv, "json");
  if (!jsonInput) {
    console.error("[onto] evolve apply requires --json '<action-object>'.");
    console.error("Example: --json '{\"type\":\"start_apply\",\"buildSpecHash\":\"...\"}'");
    return 1;
  }

  const projectRoot = readOption(argv, "project-root") ?? process.cwd();
  const { executeApply } = await import("./commands/apply.js");
  const action = JSON.parse(jsonInput);
  const result = executeApply(paths, action, { projectRoot });
  console.log(JSON.stringify(result, null, 2));
  return result.success ? 0 : 1;
}

// ─── close ───

async function handleEvolveClose(argv: string[]): Promise<number> {
  const paths = resolveScopePathsFromArgv(argv);
  if (!paths) return 1;

  const { executeClose } = await import("./commands/close.js");
  const result = executeClose(paths);
  console.log(JSON.stringify(result, null, 2));
  return result.success ? 0 : 1;
}

// ─── defer ───

async function handleEvolveDefer(argv: string[]): Promise<number> {
  const paths = resolveScopePathsFromArgv(argv);
  if (!paths) return 1;

  const reason = readOption(argv, "reason");
  const resumeCondition = readOption(argv, "resume-condition");
  if (!reason || !resumeCondition) {
    console.error("[onto] evolve defer requires --reason and --resume-condition.");
    return 1;
  }

  const { executeDefer } = await import("./commands/defer.js");
  const result = executeDefer(paths, reason, resumeCondition);
  console.log(JSON.stringify(result, null, 2));
  return result.success ? 0 : 1;
}
