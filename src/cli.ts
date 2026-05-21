#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { resolveOntoHome } from "./core-runtime/discovery/onto-home.js";
import { resolveProjectRoot } from "./core-runtime/discovery/project-root.js";
import {
  printOntoReleaseChannelNotice,
  readOntoVersion,
} from "./core-runtime/release-channel/release-channel.js";
import {
  readSingleOptionValueFromArgv,
} from "./core-runtime/review/review-artifact-utils.js";

/**
 * Trust Boundary: check if .onto/ directory needs to be created in the
 * target project. If .onto/ doesn't exist yet, ask for user confirmation
 * before proceeding (the review will create .onto/review/{session}/).
 */
async function checkOntoDirectoryInit(
  projectRoot: string,
  ontoHome: string,
  argv: string[],
): Promise<boolean> {
  const ontoDir = path.join(projectRoot, ".onto");

  // Already exists — previous consent assumed
  if (fs.existsSync(ontoDir)) return true;

  // Self-review (projectRoot === ontoHome) — no consent needed
  if (path.resolve(projectRoot) === path.resolve(ontoHome)) return true;

  // Non-interactive: require --allow-onto-init
  if (argv.includes("--allow-onto-init")) return true;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      [
        `[onto] This project does not have a .onto/ directory yet: ${projectRoot}`,
        "Running a review will create .onto/review/ in this project.",
        "Pass --allow-onto-init to proceed, or create .onto/ manually.",
      ].join("\n"),
    );
    return false;
  }

  // Interactive: prompt user
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await readline.question(
      [
        `[onto] This project does not have a .onto/ directory: ${projectRoot}`,
        "A review session will create .onto/review/ in this directory.",
        "Consider adding .onto/review/ to .gitignore.",
        "Continue? (y/n): ",
      ].join("\n"),
    );
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}

async function handleReview(
  ontoHome: string,
  argv: string[],
): Promise<number> {
  const enrichedArgv = [...argv];

  if (!argv.includes("--onto-home")) {
    enrichedArgv.push("--onto-home", ontoHome);
  }

  let projectRoot: string | undefined;
  if (!argv.includes("--project-root")) {
    const firstNonFlag = argv.find(
      (arg) => !arg.startsWith("--") && !arg.startsWith("@"),
    );
    projectRoot = resolveProjectRoot(firstNonFlag);
    enrichedArgv.push("--project-root", projectRoot);
  } else {
    const idx = argv.indexOf("--project-root");
    projectRoot = idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
  }

  // Trust Boundary: confirm .onto/ creation in external projects
  if (projectRoot) {
    const allowed = await checkOntoDirectoryInit(
      path.resolve(projectRoot),
      ontoHome,
      argv,
    );
    if (!allowed) {
      console.error("[onto] Review canceled: .onto/ directory creation not approved.");
      return 1;
    }
  }

  const { runReviewInvokeCli } = await import(
    "./core-runtime/cli/review-invoke.js"
  );
  return runReviewInvokeCli(enrichedArgv);
}

async function handleCompleteSession(
  ontoHome: string,
  argv: string[],
): Promise<number> {
  const enrichedArgv = [...argv];

  if (!argv.includes("--onto-home")) {
    enrichedArgv.push("--onto-home", ontoHome);
  }

  const { runCompleteReviewSessionCli } = await import(
    "./core-runtime/cli/complete-review-session.js"
  );
  return runCompleteReviewSessionCli(enrichedArgv);
}

async function handleCoordinator(
  ontoHome: string,
  argv: string[],
): Promise<number> {
  const subcommand = argv[0];
  const subArgv = argv.slice(1);

  const enrichedArgv = [...subArgv];
  if (!subArgv.includes("--onto-home")) {
    enrichedArgv.push("--onto-home", ontoHome);
  }

  switch (subcommand) {
    case "start": {
      // Resolve project root like handleReview does
      if (!enrichedArgv.includes("--project-root")) {
        const firstNonFlag = enrichedArgv.find(
          (arg) => !arg.startsWith("--") && !arg.startsWith("@"),
        );
        const projectRoot = resolveProjectRoot(firstNonFlag);
        enrichedArgv.push("--project-root", projectRoot);
      }

      // Trust Boundary: confirm .onto/ creation in external projects
      const prIdx = enrichedArgv.indexOf("--project-root");
      const projectRoot = prIdx >= 0 && prIdx + 1 < enrichedArgv.length
        ? enrichedArgv[prIdx + 1]
        : undefined;
      if (projectRoot) {
        const allowed = await checkOntoDirectoryInit(
          path.resolve(projectRoot),
          ontoHome,
          enrichedArgv,
        );
        if (!allowed) {
          console.error("[onto] Coordinator canceled: .onto/ directory creation not approved.");
          return 1;
        }
      }

      const { coordinatorStart } = await import(
        "./core-runtime/cli/coordinator-state-machine.js"
      );
      try {
        const result = await coordinatorStart(enrichedArgv);
        console.log(JSON.stringify(result, null, 2));
        return 0;
      } catch (error) {
        console.error(
          `[onto] coordinator start failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return 1;
      }
    }

    case "next": {
      if (!enrichedArgv.includes("--project-root")) {
        const projectRoot = resolveProjectRoot();
        enrichedArgv.push("--project-root", projectRoot);
      }

      const { coordinatorNext } = await import(
        "./core-runtime/cli/coordinator-state-machine.js"
      );

      const sessionRootIdx = enrichedArgv.indexOf("--session-root");
      const nextSessionRootRaw = sessionRootIdx >= 0 ? enrichedArgv[sessionRootIdx + 1] : undefined;
      const nextSessionRoot = nextSessionRootRaw ? path.resolve(nextSessionRootRaw) : "";
      const projRootIdx = enrichedArgv.indexOf("--project-root");
      const nextProjectRootRaw = projRootIdx >= 0 ? enrichedArgv[projRootIdx + 1] : undefined;
      const nextProjectRoot = nextProjectRootRaw ? path.resolve(nextProjectRootRaw) : process.cwd();

      if (!nextSessionRoot) {
        console.error("[onto] coordinator next requires --session-root");
        return 1;
      }

      try {
        const result = await coordinatorNext(nextSessionRoot, nextProjectRoot);
        console.log(JSON.stringify(result, null, 2));
        return 0;
      } catch (error) {
        console.error(
          `[onto] coordinator next failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return 1;
      }
    }

    case "status": {
      const { coordinatorStatus } = await import(
        "./core-runtime/cli/coordinator-state-machine.js"
      );

      const srIdx = enrichedArgv.indexOf("--session-root");
      const statusSessionRootRaw = srIdx >= 0 ? enrichedArgv[srIdx + 1] : undefined;
      const statusSessionRoot = statusSessionRootRaw ? path.resolve(statusSessionRootRaw) : "";

      if (!statusSessionRoot) {
        console.error("[onto] coordinator status requires --session-root");
        return 1;
      }

      try {
        const state = await coordinatorStatus(statusSessionRoot);
        console.log(JSON.stringify(state, null, 2));
        return 0;
      } catch (error) {
        console.error(
          `[onto] coordinator status failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return 1;
      }
    }

    case "--help":
    case "-h":
    case undefined:
      console.log(
        [
          "Usage: onto coordinator <subcommand> [options]",
          "",
          "Subcommands:",
          "  start <target> <intent>     Start a coordinated review session",
          "  next --session-root <path>  Advance to the next state",
          "  status --session-root <path>  Show current coordinator state",
        ].join("\n"),
      );
      return 0;

    default:
      console.error(`[onto] Unknown coordinator subcommand: ${subcommand}`);
      return 1;
  }
}

/**
 * Detects how onto is installed relative to the current project.
 *
 * - "user": npm install -g — installed for the user, shared across projects
 * - "project": npm install — installed in this project's node_modules, version pinned
 * - "development": git clone + npm link — running from onto source repo
 */
function detectInstallationMode(
  ontoHome: string,
  projectRoot: string,
): "user" | "project" | "development" {
  const normalizedHome = path.resolve(ontoHome);
  const normalizedProject = path.resolve(projectRoot);

  // Development: ontoHome is the project itself (running from onto repo)
  if (normalizedHome === normalizedProject) return "development";

  // Project: ontoHome is under projectRoot/node_modules/
  const nodeModulesPrefix = path.join(normalizedProject, "node_modules");
  if (normalizedHome.startsWith(nodeModulesPrefix)) return "project";

  // User: ontoHome is outside projectRoot (global installation)
  return "user";
}

// ---------------------------------------------------------------------------
// Phase 3 promote / reclassify-insights / migrate-session-roots
// ---------------------------------------------------------------------------

function generateSessionId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(16).slice(2, 10);
  return `${date}-${rand}`;
}

async function handleMigrateSessionRoots(argv: string[]): Promise<number> {
  const projectRoot = resolveProjectRoot();
  const dryRun = argv.includes("--dry-run");

  // DD-20: wire the builtin spec registrar before session-root-guard /
  // migrate touch the layout-version artifact.
  await import("./core-runtime/learning/shared/artifact-registry-init.js");

  const { migrateSessionRoots } = await import(
    "./core-runtime/cli/migrate-session-roots.js"
  );
  const result = migrateSessionRoots({ projectRoot, dryRun });

  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) return 1;
  return 0;
}

async function handlePromote(ontoHome: string, argv: string[]): Promise<number> {
  const projectRoot = resolveProjectRoot();

  // DD-20: wire the builtin spec registrar before any REGISTRY use.
  await import("./core-runtime/learning/shared/artifact-registry-init.js");

  // Migration gate (DD-8)
  try {
    const { ensureSessionRootsMigrated } = await import(
      "./core-runtime/cli/session-root-guard.js"
    );
    ensureSessionRootsMigrated(projectRoot, "enforce");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  // Sub-mode dispatch
  if (argv.includes("--apply")) {
    return handlePromoteApply(ontoHome, projectRoot, argv);
  }
  if (argv.includes("--resolve-conflict")) {
    return handlePromoteResolveConflict(projectRoot, argv);
  }
  if (argv.includes("--status")) {
    return handlePromoteStatus(projectRoot, argv);
  }
  return handlePromoteAnalyze(ontoHome, projectRoot, argv);
}

async function handlePromoteAnalyze(
  ontoHome: string,
  projectRoot: string,
  argv: string[],
): Promise<number> {
  const sessionId =
    readSingleOptionValueFromArgv(argv, "session-id") ?? generateSessionId();
  const skipPanel = argv.includes("--skip-panel");
  const skipAudit = argv.includes("--skip-audit");

  const { runPromoter } = await import(
    "./core-runtime/learning/promote/promoter.js"
  );

  // Note: the CLI's `ontoHome` is the install directory, not the user data
  // directory. Phase 3 user state (audit-state, global learnings) lives at
  // `~/.onto/` regardless of where the install lives, so we let runPromoter
  // default to that path. We pass ontoHome only via panel-reviewer's
  // ontoHome param when it would be wrong to default to the user dir.
  void ontoHome;

  const result = await runPromoter({
    mode: "promote",
    sessionId,
    projectRoot,
    skipPanel,
    skipAudit,
  });

  console.log(
    JSON.stringify(
      {
        session_id: sessionId,
        report_path: result.reportPath,
        session_root: result.sessionRoot,
        candidates: result.report.collection.candidate_items.length,
        panel_verdicts: result.report.panel_verdicts.length,
        retirement_candidates: result.report.retirement_candidates.length,
        domain_doc_candidates: result.report.domain_doc_candidates.length,
        degraded_states: result.report.degraded_states.length,
        warnings: result.report.warnings,
      },
      null,
      2,
    ),
  );
  return 0;
}

async function handlePromoteApply(
  ontoHome: string,
  projectRoot: string,
  argv: string[],
): Promise<number> {
  // --apply <session-id> [--resume] [--force-stale] [--dry-run]
  const applyIdx = argv.indexOf("--apply");
  const sessionId = argv[applyIdx + 1];
  if (!sessionId || sessionId.startsWith("--")) {
    console.error("[onto] promote --apply requires a session id");
    return 1;
  }

  const { runPromoteExecutor } = await import(
    "./core-runtime/learning/promote/promote-executor.js"
  );

  // See handlePromoteAnalyze: don't forward install-dir ontoHome.
  void ontoHome;

  const outcome = await runPromoteExecutor({
    sessionId,
    projectRoot,
    resume: argv.includes("--resume"),
    forceStale: argv.includes("--force-stale"),
    dryRun: argv.includes("--dry-run"),
  });

  console.log(JSON.stringify(outcome, null, 2));
  switch (outcome.kind) {
    case "completed":
      return 0;
    case "no_decisions":
      return 0;
    case "stale_baseline":
      return 2;
    case "manual_escalation_required":
      return 2;
    case "failed_resumable":
      return 3;
  }
}

async function handlePromoteResolveConflict(
  projectRoot: string,
  argv: string[],
): Promise<number> {
  // --resolve-conflict <session-id> --select <attempt-id> [--note "..."]
  const idx = argv.indexOf("--resolve-conflict");
  const sessionId = argv[idx + 1];
  const selectIdx = argv.indexOf("--select");
  const selectedAttemptId = selectIdx >= 0 ? argv[selectIdx + 1] : undefined;
  const noteIdx = argv.indexOf("--note");
  const note = noteIdx >= 0 ? argv[noteIdx + 1] : undefined;

  if (!sessionId || sessionId.startsWith("--") || !selectedAttemptId) {
    console.error(
      "[onto] usage: onto promote --resolve-conflict <session-id> " +
        "--select <attempt-id> [--note '<reason>']",
    );
    return 1;
  }

  const { gatherRecoveryContext, resolveRecoveryTruth, saveRecoveryResolution } =
    await import("./core-runtime/learning/shared/recovery-context.js");

  const context = await gatherRecoveryContext(sessionId, projectRoot);
  const resolved = resolveRecoveryTruth(context, projectRoot);
  if (resolved.kind !== "manual_escalation_required") {
    console.error(
      `[onto] no manual escalation required for session ${sessionId} ` +
        `(current state: ${resolved.kind})`,
    );
    return 1;
  }

  const valid = new Set(resolved.conflicting_attempts.map((c) => c.attempt_id));
  if (!valid.has(selectedAttemptId)) {
    console.error(
      `[onto] selected attempt_id ${selectedAttemptId} not in conflicting attempts. ` +
        `Valid: ${[...valid].join(", ")}`,
    );
    return 1;
  }

  const now = new Date().toISOString();
  const newEntry = {
    resolved_at: now,
    resolved_by: "operator" as const,
    resolution_method: "cli_command" as const,
    selected_attempt_id: selectedAttemptId,
    selected_attempt_reason: note ?? "Operator selection (no note provided)",
    all_attempts_at_resolution_time: resolved.conflicting_attempts,
    ...(note !== undefined ? { operator_note: note } : {}),
  };

  // saveRecoveryResolution will merge with prior history (NQ-21 append-only).
  // We pass a single-entry resolution_history containing the new decision;
  // the save helper expands prior entries from the existing artifact.
  saveRecoveryResolution(projectRoot, {
    schema_version: "1",
    session_id: sessionId,
    ...newEntry,
    resolution_history: [newEntry],
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        session_id: sessionId,
        selected_attempt_id: selectedAttemptId,
        next_command: `onto promote --apply ${sessionId} --resume`,
      },
      null,
      2,
    ),
  );
  return 0;
}

async function handlePromoteStatus(
  projectRoot: string,
  argv: string[],
): Promise<number> {
  const idx = argv.indexOf("--status");
  const sessionId = argv[idx + 1];
  if (!sessionId || sessionId.startsWith("--")) {
    console.error("[onto] promote --status requires a session id");
    return 1;
  }

  const { loadApplyState } = await import(
    "./core-runtime/learning/promote/apply-state.js"
  );
  const sessionRoot = path.join(
    projectRoot,
    ".onto",
    "sessions",
    "promote",
    sessionId,
  );
  const state = loadApplyState(sessionRoot);
  console.log(JSON.stringify({ session_id: sessionId, state }, null, 2));
  return state ? 0 : 1;
}

async function handleReclassifyInsights(
  ontoHome: string,
  argv: string[],
): Promise<number> {
  const projectRoot = resolveProjectRoot();

  // DD-20: wire the builtin spec registrar before any REGISTRY use.
  await import("./core-runtime/learning/shared/artifact-registry-init.js");

  try {
    const { ensureSessionRootsMigrated } = await import(
      "./core-runtime/cli/session-root-guard.js"
    );
    ensureSessionRootsMigrated(projectRoot, "enforce");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const dryRun = argv.includes("--dry-run");
  const applyReportPath = readSingleOptionValueFromArgv(argv, "apply");

  // See handlePromoteAnalyze: don't forward install-dir ontoHome.
  void ontoHome;

  // Apply mode: --apply <report-path> reads the Phase A report and rewrites
  // role tags in place. The analyze mode writes that report first.
  if (applyReportPath !== undefined) {
    const { applyInsightReclassifications } = await import(
      "./core-runtime/learning/promote/insight-reclassifier.js"
    );
    const resolvedReportPath = path.isAbsolute(applyReportPath)
      ? applyReportPath
      : path.join(projectRoot, applyReportPath);
    const applyResult = applyInsightReclassifications({
      reportPath: resolvedReportPath,
      dryRun,
    });
    console.log(JSON.stringify(applyResult, null, 2));
    return applyResult.failed > 0 ? 1 : 0;
  }

  const sessionId =
    readSingleOptionValueFromArgv(argv, "session-id") ?? generateSessionId();
  const targetAgent = readSingleOptionValueFromArgv(argv, "target");

  const { runInsightReclassifier } = await import(
    "./core-runtime/learning/promote/insight-reclassifier.js"
  );

  const result = await runInsightReclassifier({
    sessionId,
    projectRoot,
    ...(targetAgent !== undefined ? { targetAgent } : {}),
    dryRun,
  });

  console.log(JSON.stringify(result, null, 2));
  return 0;
}

async function handleInfo(ontoHome: string): Promise<number> {
  const projectRoot = resolveProjectRoot();
  const installationMode = detectInstallationMode(ontoHome, projectRoot);
  const version = await readOntoVersion();
  console.log(
    JSON.stringify(
      {
        onto_home: ontoHome,
        project_root: projectRoot,
        installation_mode: installationMode,
        version,
        cwd: process.cwd(),
        node_version: process.version,
      },
      null,
      2,
    ),
  );
  return 0;
}

/**
 * Load KEY=VALUE pairs from a `.env` file into `process.env`, without
 * overriding values already set by the invoking shell. Comments and
 * blank lines are skipped; malformed lines are ignored defensively.
 *
 * Called at process start for `~/.onto/.env` (global profile) and
 * `<cwd>/.onto/.env` (project profile), in that order. The project
 * file's values take precedence over the global file's when both
 * define the same key — but neither overrides the live shell env.
 *
 * Why not a dotenv package: keeping this inline avoids adding a
 * runtime dep for ~15 lines of logic. If we ever need `.env.local`
 * layering, variable expansion, or multiline-quoted values, reach
 * for `dotenv` instead.
 */
function loadOntoEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = line.slice(eq + 1);
  }
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();

  const argv = process.argv.slice(2);
  const subcommand = argv[0];
  const subcommandArgv = argv.slice(1);

  const ontoHomeFlag = readSingleOptionValueFromArgv(argv, "onto-home");
  const ontoHome = resolveOntoHome(ontoHomeFlag);

  // Set ONTO_HOME so spawned processes inherit it
  process.env.ONTO_HOME = ontoHome;

  // Auto-load onto's .env files.
  // Global first so project overrides it; neither overrides the shell.
  loadOntoEnvFile(path.join(os.homedir(), ".onto", ".env"));
  loadOntoEnvFile(path.join(process.cwd(), ".onto", ".env"));

  switch (subcommand) {
    case "review":
      // Check for --complete-session mode
      if (subcommandArgv.includes("--complete-session")) {
        const filteredArgv = subcommandArgv.filter(
          (arg) => arg !== "--complete-session",
        );
        return handleCompleteSession(ontoHome, filteredArgv);
      }
      return handleReview(ontoHome, subcommandArgv);

    case "coordinator":
      return handleCoordinator(ontoHome, subcommandArgv);

    case "info":
      return handleInfo(ontoHome);

    case "promote":
      return handlePromote(ontoHome, subcommandArgv);

    case "reclassify-insights":
      return handleReclassifyInsights(ontoHome, subcommandArgv);

    case "migrate-session-roots":
      return handleMigrateSessionRoots(subcommandArgv);

    case "evolve": {
      const { handleEvolveCli } = await import(
        "./core-runtime/evolve/cli.js"
      );
      return handleEvolveCli(ontoHome, subcommandArgv);
    }

    case "reconstruct": {
      const { handleReconstructCli } = await import(
        "./core-runtime/evolve/commands/reconstruct.js"
      );
      return handleReconstructCli(ontoHome, subcommandArgv);
    }

    case "health": {
      const { handleHealth } = await import("./core-runtime/cli/health.js");
      return handleHealth(ontoHome, subcommandArgv);
    }

    case "govern": {
      const { handleGovernCli } = await import(
        "./core-runtime/govern/cli.js"
      );
      return handleGovernCli(ontoHome, subcommandArgv);
    }

    case "config": {
      const { handleConfigCli } = await import(
        "./core-runtime/config/onto-config-cli.js"
      );
      return handleConfigCli(ontoHome, subcommandArgv);
    }

    case "install":
      console.error(
        "[onto] `onto install` is retired while the active llm switcher is being simplified. Edit .onto/settings.json directly or use `onto config`.",
      );
      return 1;

    case "mcp": {
      const { startMcpServer } = await import("./mcp/server.js");
      return startMcpServer();
    }

    case "learn":
    case "build":
    case "ask":
      console.error(
        `[onto] Subcommand '${subcommand}' is not yet implemented in global CLI.`,
      );
      return 1;

    case "--version":
    case "-v": {
      const version = await readOntoVersion();
      console.log(`onto-core ${version}`);
      return 0;
    }

    case "--help":
    case "-h":
    case undefined:
      console.log(
        [
          "Usage: onto <subcommand> [options]",
          "",
          "Subcommands:",
          "  evolve start <description>   Start an evolve scope",
          "  reconstruct <subcommand>    Reconstruct activity CLI (start/explore/complete)",
          "  govern <subcommand>         Govern queue CLI (submit/list/decide)",
          "  review <target> <intent>   Run 9-lens review",
          "  review --complete-session   Complete a prepared session",
          "  coordinator start|next|status  State machine coordinated review",
          "  info                        Show installation mode, onto home, project root",
          "  promote                     Phase 3 promote (analyze)",
          "  promote --apply <id>         Apply approved decisions",
          "  promote --resolve-conflict <id> --select <attempt-id>  Resolve recovery conflict",
          "  promote --status <id>        Inspect ApplyExecutionState",
          "  reclassify-insights         Reclassify [insight] role tags",
          "  migrate-session-roots       Move pre-v3 sessions under review/",
          "  health [project]            Learning pool health dashboard (default: global)",
          "  config [subcommand]         Inspect / edit onto config (show/set/edit/re-detect/validate)",
          "  mcp                         Start the MCP stdio tool server",
          "",
          "Options:",
          "  --onto-home <path>         Override onto installation directory",
          "  --project-root <path>      Override target project root",
          "  --prepare-only             Prepare session without executing lenses",
          "  --allow-onto-init          Allow .onto/ creation in new projects (non-interactive)",
          "  --version, -v              Show version",
          "  --help, -h                 Show this help",
          "",
          "Installation:",
          "  npm install -g onto-core   Global install (onto command everywhere)",
          "  npm install onto-core       Project install (npx onto within project, version pinned)",
        ].join("\n"),
      );
      return 0;

    default:
      console.error(`[onto] Unknown subcommand: ${subcommand}`);
      console.error("Run 'onto --help' for usage.");
      return 1;
  }
}

main().then(
  (exitCode) => process.exit(exitCode),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
