/**
 * Review UX Redesign P5 — `onto config` interactive CLI.
 *
 * # What this module is
 *
 * The entry point for the `onto config` subcommand tree:
 *
 *   - `onto config`                      (alias for `show`)
 *   - `onto config show`                 detailed current state + derivation preview
 *   - `onto config set <key> <value>`    single-field mutation
 *   - `onto config edit`                 interactive stepwise prompts
 *   - `onto config re-detect`            re-run environment probes, show diff
 *   - `onto config validate`             validator + derivation preview (no write)
 *
 * # Why it exists
 *
 * Design doc §6 defines this surface as the principal's control panel for
 * the `review:` axis block. Without a dedicated CLI, every change requires
 * hand-editing YAML — error-prone for the discriminated-union semantics of
 * `SubagentSpec` and the cross-field constraints validated at runtime.
 *
 * # How it relates
 *
 * - Reuses P4's detection (`detectReviewAxes`) and write (`writeReviewBlock`).
 * - Reuses P1's validator (`validateReviewConfig`).
 * - Reuses P2's derivation (`previewTopologyDerivation` via the new preview
 *   helper which wraps `deriveTopologyShape` + `shapeToTopologyId`).
 * - Registered in `src/cli.ts` as the `"config"` subcommand.
 */

import readline from "node:readline/promises";
import path from "node:path";

import type {
  OntoReviewConfig,
  SubagentSpec,
  TeamleadSpec,
} from "../discovery/config-chain.js";
import { resolveOrthogonalConfigChain } from "../discovery/config-chain.js";
import {
  validateReviewConfig,
  type ValidationError,
} from "../review/review-config-validator.js";
import { detectReviewAxes } from "../onboard/detect-review-axes.js";
import { writeReviewBlock } from "../onboard/write-review-block.js";
import { previewTopologyDerivation, renderPreview } from "./onto-config-preview.js";
import { applySet, SUPPORTED_SET_PATHS } from "./onto-config-key-path.js";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Main dispatcher for `onto config`. Called from `src/cli.ts`.
 *
 * Returns the exit code. All STDERR/STDOUT IO happens here; subcommand
 * helpers return data to this function which renders it.
 */
export async function handleConfigCli(
  ontoHome: string,
  argv: string[],
): Promise<number> {
  const sub = argv[0] ?? "show";
  const subArgv = argv.slice(1);

  const projectRoot = process.cwd();

  switch (sub) {
    case "show":
      return handleShow(ontoHome, projectRoot);
    case "set":
      return handleSet(projectRoot, subArgv);
    case "edit":
      return handleEdit(projectRoot);
    case "re-detect":
      return handleRedetect(ontoHome, projectRoot);
    case "validate":
      return handleValidate(ontoHome, projectRoot);
    case "--help":
    case "-h":
      printHelp();
      return 0;
    default:
      console.error(
        `error: unknown subcommand "${sub}". Run \`onto config --help\` for usage.`,
      );
      return 1;
  }
}

function printHelp(): void {
  const lines = [
    "onto config — manage the review axis block in .onto/config.yml",
    "",
    "Usage:",
    "  onto config                  show current state + derivation preview (alias for `show`)",
    "  onto config show             detailed current state + preview",
    "  onto config set <key> <val>  mutate a single axis field",
    "  onto config edit             interactive stepwise prompts",
    "  onto config re-detect        re-run environment probes, show diff",
    "  onto config validate         run validator + preview (no write)",
    "",
    "Supported `set` paths:",
    ...SUPPORTED_SET_PATHS.map((p) => `  - ${p}`),
    "",
    "External teamlead specs (teamlead.model = {provider, model_id, effort})",
    "require `onto config edit` — `set` only accepts `teamlead.model main`.",
  ];
  console.log(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

async function handleShow(
  ontoHome: string,
  projectRoot: string,
): Promise<number> {
  try {
    const merged = await resolveOrthogonalConfigChain(ontoHome, projectRoot);
    const review = merged.review ?? {};
    const detection = detectReviewAxes().detected;

    console.log(renderShow(review, detection, projectRoot));

    const validation = validateReviewConfig(review);
    if (!validation.ok) {
      console.log("");
      console.log("## Validation errors");
      for (const err of validation.errors) {
        console.log(`  - ${err.path}: ${err.message}`);
      }
      return 1;
    }

    console.log("");
    console.log(
      renderPreview(
        previewTopologyDerivation(validation.config, {
          claudeHost: detection.host === "claude-code",
          codexSessionActive: detection.host === "codex-cli",
          experimentalAgentTeams: detection.agent_teams_available,
          lensAgentTeamsMode: merged.lens_agent_teams_mode === true,
        }),
      ),
    );
    return 0;
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

function renderShow(
  review: OntoReviewConfig,
  detection: ReturnType<typeof detectReviewAxes>["detected"],
  projectRoot: string,
): string {
  const lines: string[] = [];
  lines.push(`# onto config — ${path.join(projectRoot, ".onto", "config.yml")}`);
  lines.push("");
  lines.push("## Current review axes");
  lines.push("");
  lines.push(`  teamlead.model:          ${renderTeamlead(review.teamlead)}`);
  lines.push(`  subagent:                ${renderSubagent(review.subagent)}`);
  lines.push(
    `  max_concurrent_lenses:   ${review.max_concurrent_lenses ?? "(default)"}`,
  );
  lines.push(
    `  lens_deliberation:       ${review.lens_deliberation ?? "controlled-lens-deliberation (default)"}`,
  );
  lines.push("");
  lines.push("## Detected environment");
  lines.push("");
  lines.push(`  host:                    ${detection.host}`);
  lines.push(`  agent_teams_available:   ${detection.agent_teams_available}`);
  lines.push(`  codex_available:         ${detection.codex_available}`);
  return lines.join("\n");
}

function renderTeamlead(teamlead: TeamleadSpec | undefined): string {
  if (!teamlead) return "main (default)";
  if (teamlead.model === "main") return "main";
  const m = teamlead.model;
  const effort = m.effort ? `, effort=${m.effort}` : "";
  return `{provider=${m.provider}, model_id=${m.model_id}${effort}}`;
}

function renderSubagent(subagent: SubagentSpec | undefined): string {
  if (!subagent) return "main-native (default)";
  if (subagent.provider === "main-native") return "main-native";
  const effort = subagent.effort ? `, effort=${subagent.effort}` : "";
  return `{provider=${subagent.provider}, model_id=${subagent.model_id}${effort}}`;
}

// ---------------------------------------------------------------------------
// set
// ---------------------------------------------------------------------------

async function handleSet(
  projectRoot: string,
  argv: string[],
): Promise<number> {
  // N2: require exactly two positional args. Previous `rest.join(" ")` relax
  // accepted `onto config set foo a b c` as `value="a b c"` — surprising UX
  // given that no supported path takes a space-containing value in practice.
  // Values that legitimately contain spaces (e.g. quoted effort strings) are
  // still received as a single argv slot because the shell already split them.
  if (argv.length !== 2) {
    console.error(
      "error: `onto config set` requires exactly <key> and <value>. " +
        "Quote values that contain spaces. Run `onto config --help` for usage.",
    );
    return 1;
  }
  const [key, value] = argv as [string, string];

  try {
    const configPath = path.join(projectRoot, ".onto", "config.yml");
    const merged = await readProjectReviewBlock(configPath);
    const mutation = applySet(merged, key, value);
    if (!mutation.ok) {
      console.error(`error: ${mutation.error}`);
      return 1;
    }
    return writeAndReport(configPath, mutation.config, [`${key} = ${value}`]);
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// edit (interactive)
// ---------------------------------------------------------------------------

async function handleEdit(projectRoot: string): Promise<number> {
  if (!process.stdin.isTTY) {
    console.error(
      "error: `onto config edit` requires an interactive TTY. " +
        "Use `onto config set` or `onto config` to inspect/modify non-interactively.",
    );
    return 1;
  }

  const configPath = path.join(projectRoot, ".onto", "config.yml");
  const current = await readProjectReviewBlock(configPath);
  const lensAgentTeamsMode = await readProjectLensAgentTeamsMode(configPath);
  const detection = detectReviewAxes().detected;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const changes: string[] = [];
  let working: OntoReviewConfig = structuredClone(current);

  try {
    console.log(renderShow(working, detection, projectRoot));
    console.log("");
    console.log("Enter key=value to update, `validate` to preview, `save` to write, `quit` to abort.");
    console.log(`Supported keys: ${SUPPORTED_SET_PATHS.join(", ")}`);

    while (true) {
      const line = (await rl.question("> ")).trim();
      if (line.length === 0) continue;
      if (line === "quit" || line === "q") {
        console.log("No changes written.");
        return 0;
      }
      if (line === "save" || line === "s") {
        break;
      }
      if (line === "validate" || line === "v") {
        const validation = validateReviewConfig(working);
        if (!validation.ok) {
          for (const err of validation.errors) {
            console.log(`  - ${err.path}: ${err.message}`);
          }
          continue;
        }
        console.log(
          renderPreview(
            previewTopologyDerivation(validation.config, {
              claudeHost: detection.host === "claude-code",
              codexSessionActive: detection.host === "codex-cli",
              experimentalAgentTeams: detection.agent_teams_available,
              lensAgentTeamsMode,
            }),
          ),
        );
        continue;
      }
      const eq = line.indexOf("=");
      if (eq < 0) {
        console.log("format: <key>=<value> (e.g. subagent.provider=codex)");
        continue;
      }
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      const mutation = applySet(working, key, value);
      if (!mutation.ok) {
        console.log(`  error: ${mutation.error}`);
        continue;
      }
      working = mutation.config;
      changes.push(`${key}=${value}`);
      console.log(`  ok: ${key}=${value}`);
    }
  } finally {
    rl.close();
  }

  if (changes.length === 0) {
    console.log("No changes to save.");
    return 0;
  }
  return writeAndReport(configPath, working, changes);
}

// ---------------------------------------------------------------------------
// re-detect
// ---------------------------------------------------------------------------

async function handleRedetect(
  ontoHome: string,
  projectRoot: string,
): Promise<number> {
  const merged = await resolveOrthogonalConfigChain(ontoHome, projectRoot);
  const review = merged.review ?? {};
  const detection = detectReviewAxes().detected;

  console.log("## Re-detected environment");
  console.log("");
  console.log(`  host:                    ${detection.host}`);
  console.log(`  agent_teams_available:   ${detection.agent_teams_available}`);
  console.log(`  codex_available:         ${detection.codex_available}`);

  const validation = validateReviewConfig(review);
  if (!validation.ok) {
    console.log("");
    console.log("Note: current review block is invalid; cannot preview derivation.");
    return 0;
  }
  console.log("");
  console.log(
    renderPreview(
      previewTopologyDerivation(validation.config, {
        claudeHost: detection.host === "claude-code",
        codexSessionActive: detection.host === "codex-cli",
        experimentalAgentTeams: detection.agent_teams_available,
        lensAgentTeamsMode: merged.lens_agent_teams_mode === true,
      }),
    ),
  );
  console.log("");
  console.log(
    "Note: re-detect is read-only. Use `onto config edit` or `onto config set` to apply changes.",
  );
  return 0;
}

// ---------------------------------------------------------------------------
// validate (write-free)
// ---------------------------------------------------------------------------

async function handleValidate(
  ontoHome: string,
  projectRoot: string,
): Promise<number> {
  const merged = await resolveOrthogonalConfigChain(ontoHome, projectRoot);
  const review = merged.review ?? {};
  const detection = detectReviewAxes().detected;

  const validation = validateReviewConfig(review);
  if (!validation.ok) {
    console.log("## Validation errors");
    console.log("");
    for (const err of validation.errors) {
      console.log(`  - ${err.path}: ${err.message}`);
    }
    return 1;
  }
  console.log("## Validation: ok");
  console.log("");
  console.log(
    renderPreview(
      previewTopologyDerivation(validation.config, {
        claudeHost: detection.host === "claude-code",
        codexSessionActive: detection.host === "codex-cli",
        experimentalAgentTeams: detection.agent_teams_available,
        lensAgentTeamsMode: merged.lens_agent_teams_mode === true,
      }),
    ),
  );
  return 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read the project-level `.onto/config.yml` and return its `review` block
 * (or an empty object if absent/invalid). Bypasses `resolveConfigChain` so
 * the writer acts on the project file, not the merged home+project view.
 */
async function readProjectReviewBlock(
  configPath: string,
): Promise<OntoReviewConfig> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(configPath)) {
      return {};
    }
    const raw = fs.readFileSync(configPath, "utf8");
    const { parse } = await import("yaml");
    const doc = parse(raw) as { review?: unknown } | null;
    if (!doc || typeof doc !== "object") return {};
    if (doc.review === undefined) return {};
    const validation = validateReviewConfig(doc.review);
    if (validation.ok) return validation.config;
    // N1: surface the invalid state before proceeding. Without this the set /
    // edit flows would silently start from an empty config, overwriting
    // partially-typed garbage on next save with no operator awareness.
    process.stderr.write(
      "[onto:config] warning: existing review block in config is invalid — starting from empty state\n",
    );
    for (const err of validation.errors) {
      process.stderr.write(`  - ${err.path}: ${err.message}\n`);
    }
    return {};
  } catch {
    return {};
  }
}

async function readProjectLensAgentTeamsMode(configPath: string): Promise<boolean> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(configPath)) return false;
    const raw = fs.readFileSync(configPath, "utf8");
    const { parse } = await import("yaml");
    const doc = parse(raw) as { lens_agent_teams_mode?: unknown } | null;
    return Boolean(doc && typeof doc === "object" && doc.lens_agent_teams_mode === true);
  } catch {
    return false;
  }
}

function writeAndReport(
  configPath: string,
  next: OntoReviewConfig,
  changes: string[],
): number {
  const validation = validateReviewConfig(next);
  if (!validation.ok) {
    console.error("error: the resulting config is invalid — write aborted.");
    for (const e of validation.errors) {
      console.error(`  - ${e.path}: ${e.message}`);
    }
    return 1;
  }
  const result = writeReviewBlock(configPath, validation.config);
  if (!result.ok) {
    console.error("error: write failed");
    for (const e of (result as { errors: ValidationError[] }).errors) {
      console.error(`  - ${e.path}: ${e.message}`);
    }
    return 1;
  }
  console.log("## Saved");
  console.log("");
  for (const c of changes) console.log(`  - ${c}`);
  console.log("");
  console.log(`  path: ${result.path}`);
  if (result.created) console.log("  created: true");
  if (result.replacedExistingBlock) console.log("  replaced_existing_block: true");
  return 0;
}
