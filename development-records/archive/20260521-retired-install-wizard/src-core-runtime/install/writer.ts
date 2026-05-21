/**
 * File writer for `onto install` — persists the resolved decisions to
 * `config.yml`, `.env`, and `.env.example` atomically.
 *
 * # What this module is
 *
 * A pure function seat (where possible): the rendering helpers
 * (`renderConfigYml`, `renderEnvExample`, `renderEnv`, `parseEnv`) are
 * filesystem-free so they can be unit-tested without tmpdirs. Only
 * `writeInstallFiles` touches disk, and even that delegates content
 * generation to the renderers.
 *
 * # Why atomic writes
 *
 * Both `config.yml` and `.env` are read on every onto invocation — a
 * partial write (e.g. disk full mid-write, process killed) would leave
 * an invalid file that blocks all future commands. Writing to a temp
 * file in the same directory and renaming (POSIX atomic on same
 * filesystem) means a crashed install leaves the prior state intact.
 *
 * # Why merge `.env` instead of overwrite
 *
 * The user may have unrelated keys in `.env` (third-party tool
 * credentials, local overrides). Install touches only the keys it
 * captured this session — the merge step preserves everything else.
 * `.env.example` is overwritten wholesale since it's a template
 * derived purely from the current install decisions.
 *
 * # File modes
 *
 * `.env` is set to 0600 so other users on the machine can't read the
 * secrets file. On Windows, Node's fs module accepts the mode flag but
 * NTFS ACLs don't map cleanly — treat the mode as best-effort and rely
 * on filesystem isolation on that platform.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import type {
  EnvSecrets,
  InstallDecisions,
  InstallPaths,
  ProfileScope,
} from "./types.js";

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the four file targets for a given profile scope.
 *
 * Global scope uses `~/.onto/` (no gitignore touched — there's no repo
 * at the user-home layer). Project scope uses `<projectRoot>/.onto/`
 * and also needs the project's root `.gitignore` path so the write
 * step can ensure `.onto/.env` is ignored.
 */
export function resolveInstallPaths(
  scope: ProfileScope,
  projectRoot: string,
  homeDir: string = os.homedir(),
): InstallPaths {
  if (scope === "global") {
    const ontoDir = path.join(homeDir, ".onto");
    return {
      ontoDir,
      configYmlPath: path.join(ontoDir, "config.yml"),
      envPath: path.join(ontoDir, ".env"),
      envExamplePath: path.join(ontoDir, ".env.example"),
    };
  }
  const ontoDir = path.join(projectRoot, ".onto");
  return {
    ontoDir,
    configYmlPath: path.join(ontoDir, "config.yml"),
    envPath: path.join(ontoDir, ".env"),
    envExamplePath: path.join(ontoDir, ".env.example"),
    gitignorePath: path.join(projectRoot, ".gitignore"),
  };
}

// ---------------------------------------------------------------------------
// config.yml rendering
// ---------------------------------------------------------------------------

/**
 * Produce the YAML text that install writes for the current decisions.
 *
 * Shape rationale:
 *
 *   - `output_language` is always set (user-facing render boundary).
 *   - `review.subagent.provider` records the review channel choice.
 *     For `main-native` this is sufficient — no model_id / effort
 *     fields at install time.
 *   - `subagent_llm.provider` records the learn/background channel.
 *   - `external_http_provider` is ALSO set when learn provider is
 *     anthropic/openai/litellm — it's the ladder's user-override seat
 *     in `llm-caller.ts`, so explicitly matching the user's choice
 *     makes the intent sticky across future env drift.
 *   - `external_http_provider` is NOT set for codex learn — codex is
 *     not a valid value for that field (see config-chain.ts L37).
 *   - Model fields are omitted intentionally. `onto config edit` is
 *     the next step for users who want to pin a specific model; the
 *     install completion message points there.
 */
export function renderConfigYml(decisions: InstallDecisions): string {
  const config: Record<string, unknown> = {
    output_language: decisions.outputLanguage,
    review: {
      subagent: { provider: decisions.reviewProvider },
    },
    subagent_llm: {
      provider: decisions.learnProvider,
    },
  };

  if (
    decisions.learnProvider === "anthropic" ||
    decisions.learnProvider === "openai" ||
    decisions.learnProvider === "litellm"
  ) {
    config.external_http_provider = decisions.learnProvider;
  }

  const header = [
    "# Written by `onto install` — edit with `onto config edit` or",
    "# re-run `onto install --reconfigure`. Full key reference:",
    "# .onto/processes/configuration.md",
    "",
  ].join("\n");

  return header + yaml.stringify(config);
}

// ---------------------------------------------------------------------------
// .env / .env.example rendering
// ---------------------------------------------------------------------------

/**
 * Lightweight `.env` parser. Preserves KEY=VALUE lines, drops comments
 * and blanks. NOT a full shell parser — no variable expansion, no
 * quoting nuance. The write path likewise emits unquoted values.
 *
 * Keys are trimmed; values are taken verbatim after the first `=`
 * (including leading/trailing whitespace, which `.env` consumers
 * typically preserve).
 */
export function parseEnv(contents: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);
    if (key) out.set(key, value);
  }
  return out;
}

/**
 * Serialize a KEY=VALUE map deterministically (sorted by key).
 *
 * Deterministic order matters so a reconfigure that doesn't change any
 * key produces an identical file — no spurious diffs, easy to grep.
 */
export function renderEnv(kv: Map<string, string>): string {
  const header = "# onto runtime credentials — managed by `onto install`.\n";
  const lines: string[] = [header];
  const sorted = [...kv.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [k, v] of sorted) {
    lines.push(`${k}=${v}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Build the `.env.example` text for the current install decisions.
 *
 * Only includes sections for providers actually selected — no point
 * in shipping an ANTHROPIC_API_KEY template to a user who picked
 * codex + openai. The LiteLLM section includes the expanded guidance
 * block (local runtime examples) because that field is the one new
 * users most often fumble — "just the port" is a common mistake.
 */
export function renderEnvExample(decisions: InstallDecisions): string {
  const needsAnthropic =
    decisions.reviewProvider === "anthropic" ||
    decisions.learnProvider === "anthropic";
  const needsOpenai =
    decisions.reviewProvider === "openai" ||
    decisions.learnProvider === "openai";
  const needsLitellm =
    decisions.reviewProvider === "litellm" ||
    decisions.learnProvider === "litellm";

  const lines: string[] = [
    "# ---------------------------------------------------------------------------",
    "# onto runtime credentials",
    "# Copy this file to .env and fill in values as needed.",
    "# Tracked in git; .env is gitignored.",
    "# ---------------------------------------------------------------------------",
    "",
  ];

  if (needsAnthropic) {
    lines.push("# Anthropic API (per-token)", "# ANTHROPIC_API_KEY=sk-ant-...", "");
  }
  if (needsOpenai) {
    lines.push("# OpenAI API (per-token)", "# OPENAI_API_KEY=sk-...", "");
  }
  if (needsLitellm) {
    lines.push(
      "# LiteLLM / OpenAI-compatible endpoint base URL",
      "#",
      "# Full URL required: scheme + host + port + /v1 path prefix.",
      "# Accepts any OpenAI-compatible endpoint — local runtime or remote proxy.",
      "#",
      "# Local examples:",
      "#   LiteLLM proxy   http://localhost:4000/v1",
      "#   Ollama          http://localhost:11434/v1",
      "#   LM Studio       http://localhost:1234/v1",
      "#   vLLM            http://localhost:8000/v1",
      "#   MLX             http://localhost:8080/v1",
      "#",
      "# Remote example:",
      "#   https://litellm.example.com/v1",
      "#",
      "# LITELLM_BASE_URL=http://localhost:4000/v1",
      "",
      "# Optional — only when the endpoint enforces authentication.",
      "# Local endpoints without auth (Ollama 등) leave this blank.",
      "# LITELLM_API_KEY=sk-proxy-token",
      "",
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Atomic file write
// ---------------------------------------------------------------------------

function atomicWrite(target: string, content: string, mode: number): void {
  const dir = path.dirname(target);
  const tmp = path.join(
    dir,
    `.${path.basename(target)}.tmp-${process.pid}-${Date.now()}`,
  );
  fs.writeFileSync(tmp, content, { encoding: "utf8", mode });
  fs.renameSync(tmp, target);
}

// ---------------------------------------------------------------------------
// Orchestration entry
// ---------------------------------------------------------------------------

export interface WriteResult {
  /** The exact content written to config.yml. */
  configYml: string;
  /** The exact content written to .env. */
  env: string;
  /** The exact content written to .env.example. */
  envExample: string;
  /** Paths touched (for the install completion summary). */
  writtenTo: {
    configYml: string;
    env: string;
    envExample: string;
  };
}

export interface WriteInstallFilesArgs {
  paths: InstallPaths;
  decisions: InstallDecisions;
  secrets: EnvSecrets;
  /** When true, compute contents but do not touch the filesystem. */
  dryRun?: boolean;
}

/**
 * Write (or dry-run) the three install output files.
 *
 * Order:
 *   1. Ensure `.onto/` dir exists (idempotent).
 *   2. Read existing `.env` to preserve unrelated keys.
 *   3. Merge newly-captured secrets into the key map.
 *   4. Atomic-write config.yml (0644), .env (0600), .env.example (0644).
 *
 * Returns the content strings for display / testing. Callers handle
 * side-effects like the completion summary print — writer stays focused
 * on file state.
 */
export function writeInstallFiles(args: WriteInstallFilesArgs): WriteResult {
  const { paths, decisions, secrets, dryRun } = args;

  const configYml = renderConfigYml(decisions);
  const envExample = renderEnvExample(decisions);

  // Merge existing .env (if any) with newly-captured secrets.
  let envMap = new Map<string, string>();
  if (!dryRun && fs.existsSync(paths.envPath)) {
    envMap = parseEnv(fs.readFileSync(paths.envPath, "utf8"));
  }
  if (secrets.anthropicApiKey) {
    envMap.set("ANTHROPIC_API_KEY", secrets.anthropicApiKey);
  }
  if (secrets.openaiApiKey) {
    envMap.set("OPENAI_API_KEY", secrets.openaiApiKey);
  }
  if (secrets.litellmBaseUrl) {
    envMap.set("LITELLM_BASE_URL", secrets.litellmBaseUrl);
  }
  if (secrets.litellmApiKey) {
    envMap.set("LITELLM_API_KEY", secrets.litellmApiKey);
  }
  const env = renderEnv(envMap);

  if (!dryRun) {
    fs.mkdirSync(paths.ontoDir, { recursive: true });
    atomicWrite(paths.configYmlPath, configYml, 0o644);
    atomicWrite(paths.envPath, env, 0o600);
    atomicWrite(paths.envExamplePath, envExample, 0o644);
  }

  return {
    configYml,
    env,
    envExample,
    writtenTo: {
      configYml: paths.configYmlPath,
      env: paths.envPath,
      envExample: paths.envExamplePath,
    },
  };
}
