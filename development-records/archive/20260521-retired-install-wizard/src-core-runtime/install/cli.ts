/**
 * `onto install` orchestrator — ties together pre-flight detection,
 * either interactive or flag-driven decision resolution, the file
 * writer, and the live validator.
 *
 * # Two execution modes
 *
 * **Interactive** (default): opens a readline-backed PromptIO and
 * walks the user through the 6-step flow, capturing decisions + any
 * secrets typed at the keyboard.
 *
 * **Non-interactive** (`--non-interactive` or
 * `ONTO_INSTALL_NON_INTERACTIVE=1`): resolves every decision from
 * flags/env directly. Missing required flags or credentials fail
 * fast with an explicit error — never prompt. Meant for CI, Docker
 * images, and provisioning scripts.
 *
 * # Shared pipeline
 *
 * Once both modes produce `{ decisions, secrets }`, they converge on
 * the same write → gitignore → validate → completion sequence in
 * `runInstallAfterDecisions`.
 *
 * # Testability
 *
 * `handleInstallCliWithOverrides()` accepts optional overrides for
 * `homeDir`, `projectRoot`, `fetch`, `io`, and `silent`. Integration
 * tests use these to run install against tmpdirs, stub the network,
 * and capture output. Production dispatch calls the thin
 * `handleInstallCli()` wrapper which supplies no overrides.
 */

import fs from "node:fs";
import os from "node:os";
import { resolveProjectRoot } from "../discovery/project-root.js";
import {
  formatPreflightSummary,
  runPreflight,
} from "./detect.js";
import { ensureGitignoreEntry } from "./gitignore-update.js";
import {
  createReadlineIo,
  runInteractivePrompts,
  type PromptIO,
} from "./prompts.js";
import {
  formatValidationResult,
  validateInstall,
  type PingDependencies,
} from "./validation.js";
import {
  parseEnv,
  resolveInstallPaths,
  writeInstallFiles,
  type WriteResult,
} from "./writer.js";
import type {
  EnvSecrets,
  InstallDecisions,
  InstallFlags,
  LearnProvider,
  PreflightDetection,
  ProfileScope,
  ReviewProvider,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REVIEW_PROVIDER_VALUES: readonly ReviewProvider[] = [
  "main-native",
  "codex",
  "anthropic",
  "openai",
  "litellm",
];

const LEARN_PROVIDER_VALUES: readonly (LearnProvider | "same")[] = [
  "same",
  "codex",
  "anthropic",
  "openai",
  "litellm",
];

const TRUTHY_ENV_VALUES: ReadonlySet<string> = new Set([
  "1",
  "true",
  "TRUE",
  "yes",
  "YES",
]);

function envTruthy(value: string | undefined): boolean {
  return typeof value === "string" && TRUTHY_ENV_VALUES.has(value);
}

// ---------------------------------------------------------------------------
// Flag parsing (argv + env)
// ---------------------------------------------------------------------------

function readFlagValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  if (idx < 0 || idx + 1 >= argv.length) return undefined;
  const value = argv[idx + 1];
  if (typeof value !== "string" || value.startsWith("--")) return undefined;
  return value;
}

/**
 * Parse install flags from argv only. Retained as the simpler form
 * for tests and to keep the argv-reading surface in one place.
 */
export function parseInstallFlags(argv: string[]): InstallFlags {
  const flags: InstallFlags = {
    nonInteractive: argv.includes("--non-interactive"),
    reconfigure: argv.includes("--reconfigure") || argv.includes("--force"),
    skipValidation: argv.includes("--skip-validation"),
    dryRun: argv.includes("--dry-run"),
  };

  const profileScope = readFlagValue(argv, "profile-scope");
  if (profileScope === "global" || profileScope === "project") {
    flags.profileScope = profileScope as ProfileScope;
  }

  const reviewProvider = readFlagValue(argv, "review-provider");
  if (
    reviewProvider &&
    (REVIEW_PROVIDER_VALUES as readonly string[]).includes(reviewProvider)
  ) {
    flags.reviewProvider = reviewProvider as ReviewProvider;
  }

  const learnProvider = readFlagValue(argv, "learn-provider");
  if (
    learnProvider &&
    (LEARN_PROVIDER_VALUES as readonly string[]).includes(learnProvider)
  ) {
    flags.learnProvider = learnProvider as LearnProvider | "same";
  }

  const outputLanguage = readFlagValue(argv, "output-language");
  if (outputLanguage === "ko" || outputLanguage === "en") {
    flags.outputLanguage = outputLanguage;
  }

  const litellmBaseUrl = readFlagValue(argv, "litellm-base-url");
  if (litellmBaseUrl) flags.litellmBaseUrl = litellmBaseUrl;

  const envFile = readFlagValue(argv, "env-file");
  if (envFile) flags.envFile = envFile;

  return flags;
}

/**
 * Merge environment-variable defaults into a flag set. argv always
 * wins — env only fills values that argv left unset.
 *
 * Env naming: `ONTO_INSTALL_<UPPERCASE_WITH_UNDERSCORES>`. Booleans
 * accept `1 | true | TRUE | yes | YES`.
 */
export function parseInstallFlagsWithEnv(
  argv: string[],
  env: NodeJS.ProcessEnv,
): InstallFlags {
  const flags = parseInstallFlags(argv);

  if (!flags.nonInteractive && envTruthy(env.ONTO_INSTALL_NON_INTERACTIVE)) {
    flags.nonInteractive = true;
  }
  if (!flags.reconfigure && envTruthy(env.ONTO_INSTALL_RECONFIGURE)) {
    flags.reconfigure = true;
  }
  if (!flags.skipValidation && envTruthy(env.ONTO_INSTALL_SKIP_VALIDATION)) {
    flags.skipValidation = true;
  }
  if (!flags.dryRun && envTruthy(env.ONTO_INSTALL_DRY_RUN)) {
    flags.dryRun = true;
  }

  if (!flags.profileScope) {
    const v = env.ONTO_INSTALL_PROFILE_SCOPE;
    if (v === "global" || v === "project") flags.profileScope = v;
  }
  if (!flags.reviewProvider) {
    const v = env.ONTO_INSTALL_REVIEW_PROVIDER;
    if (v && (REVIEW_PROVIDER_VALUES as readonly string[]).includes(v)) {
      flags.reviewProvider = v as ReviewProvider;
    }
  }
  if (!flags.learnProvider) {
    const v = env.ONTO_INSTALL_LEARN_PROVIDER;
    if (v && (LEARN_PROVIDER_VALUES as readonly string[]).includes(v)) {
      flags.learnProvider = v as LearnProvider | "same";
    }
  }
  if (!flags.outputLanguage) {
    const v = env.ONTO_INSTALL_OUTPUT_LANGUAGE;
    if (v === "ko" || v === "en") flags.outputLanguage = v;
  }
  if (!flags.litellmBaseUrl && env.ONTO_INSTALL_LITELLM_BASE_URL) {
    flags.litellmBaseUrl = env.ONTO_INSTALL_LITELLM_BASE_URL;
  }
  if (!flags.envFile && env.ONTO_INSTALL_ENV_FILE) {
    flags.envFile = env.ONTO_INSTALL_ENV_FILE;
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Env-file loader
// ---------------------------------------------------------------------------

/**
 * Load KEY=VALUE pairs from an explicit `.env` file into a target env
 * map. Missing keys in the target are set; already-present keys are
 * left untouched (shell env wins over a provided file, matching
 * src/cli.ts auto-load semantics).
 *
 * Returns the count of keys actually inserted so the orchestrator can
 * log how much came from the file.
 */
export function loadEnvFileInto(
  filePath: string,
  target: NodeJS.ProcessEnv,
): { loaded: number; missingFile: boolean } {
  if (!fs.existsSync(filePath)) {
    return { loaded: 0, missingFile: true };
  }
  const content = fs.readFileSync(filePath, "utf8");
  let loaded = 0;
  for (const [k, v] of parseEnv(content)) {
    if (target[k] === undefined) {
      target[k] = v;
      loaded += 1;
    }
  }
  return { loaded, missingFile: false };
}

// ---------------------------------------------------------------------------
// Non-interactive resolution
// ---------------------------------------------------------------------------

export type ResolveDecisionsResult =
  | { ok: true; decisions: InstallDecisions; secrets: EnvSecrets }
  | { ok: false; errors: string[] };

/**
 * Turn a flag set + env snapshot into a complete InstallDecisions +
 * EnvSecrets pair, failing loudly when anything required is missing.
 *
 * Used by the non-interactive path. Interactive path bypasses this
 * and uses `runInteractivePrompts` instead — prompts fill missing
 * values rather than erroring.
 */
export function resolveDecisionsFromFlags(args: {
  flags: InstallFlags;
  detection: PreflightDetection;
  env: NodeJS.ProcessEnv;
}): ResolveDecisionsResult {
  const { flags, detection, env } = args;
  const errors: string[] = [];

  if (!flags.profileScope) {
    errors.push("--profile-scope <global|project>");
  }
  if (!flags.reviewProvider) {
    errors.push("--review-provider <provider>");
  }
  if (errors.length > 0) {
    return {
      ok: false,
      errors: [`필수 플래그 누락: ${errors.join(", ")}`],
    };
  }

  // Resolve learn provider. `same` or missing means "use review
  // provider" — unless review is main-native, in which case learn
  // must be explicit (main-native isn't in the background ladder).
  let learnProvider: LearnProvider;
  if (!flags.learnProvider || flags.learnProvider === "same") {
    if (flags.reviewProvider === "main-native") {
      return {
        ok: false,
        errors: [
          "--review-provider=main-native 선택 시 --learn-provider 를 명시해야 합니다.",
          "  (background ladder가 main-native를 지원하지 않습니다.)",
        ],
      };
    }
    learnProvider = flags.reviewProvider as LearnProvider;
  } else {
    learnProvider = flags.learnProvider as LearnProvider;
  }

  // Collect credentials from env (+ litellm base URL from flag).
  const providers = new Set<ReviewProvider>();
  providers.add(flags.reviewProvider as ReviewProvider);
  providers.add(learnProvider as ReviewProvider);

  const credErrors: string[] = [];
  const secrets: EnvSecrets = {};
  for (const p of providers) {
    switch (p) {
      case "main-native":
        if (!detection.hostIsClaudeCode) {
          // Allowed but warned about — not a hard error. The caller's
          // stderr write surfaces the warning; here we just note it.
        }
        break;
      case "anthropic":
        if (env.ANTHROPIC_API_KEY) {
          secrets.anthropicApiKey = env.ANTHROPIC_API_KEY;
        } else {
          credErrors.push("ANTHROPIC_API_KEY");
        }
        break;
      case "openai":
        if (env.OPENAI_API_KEY) {
          secrets.openaiApiKey = env.OPENAI_API_KEY;
        } else {
          credErrors.push("OPENAI_API_KEY");
        }
        break;
      case "litellm": {
        const baseUrl = flags.litellmBaseUrl ?? env.LITELLM_BASE_URL;
        if (baseUrl) {
          secrets.litellmBaseUrl = baseUrl;
        } else {
          credErrors.push("LITELLM_BASE_URL (--litellm-base-url or env)");
        }
        if (env.LITELLM_API_KEY) secrets.litellmApiKey = env.LITELLM_API_KEY;
        break;
      }
      case "codex":
        if (!detection.hasCodexBinary) {
          credErrors.push("codex binary (install codex CLI)");
        } else if (!detection.hasCodexAuth) {
          credErrors.push("~/.codex/auth.json (run `codex login`)");
        }
        break;
    }
  }

  if (credErrors.length > 0) {
    return {
      ok: false,
      errors: [
        `자격 증명 누락: ${credErrors.join(", ")}`,
        "  env 변수로 설정하거나 --env-file <path> 로 지정하세요.",
      ],
    };
  }

  const decisions: InstallDecisions = {
    profileScope: flags.profileScope as ProfileScope,
    reviewProvider: flags.reviewProvider as ReviewProvider,
    learnProvider,
    outputLanguage: flags.outputLanguage ?? "ko",
  };
  if (secrets.litellmBaseUrl) {
    decisions.litellmBaseUrl = secrets.litellmBaseUrl;
  }

  return { ok: true, decisions, secrets };
}

// ---------------------------------------------------------------------------
// Shared write → gitignore → validate → completion pipeline
// ---------------------------------------------------------------------------

interface PipelineArgs {
  decisions: InstallDecisions;
  secrets: EnvSecrets;
  detection: PreflightDetection;
  flags: InstallFlags;
  projectRoot: string;
  homeDir: string;
  pingDeps?: PingDependencies;
  write: (text: string) => void;
  writeErr: (text: string) => void;
}

async function runInstallAfterDecisions(args: PipelineArgs): Promise<number> {
  const {
    decisions,
    secrets,
    detection,
    flags,
    projectRoot,
    homeDir,
    pingDeps,
    write,
    writeErr,
  } = args;

  const paths = resolveInstallPaths(decisions.profileScope, projectRoot, homeDir);
  const result = writeInstallFiles({
    paths,
    decisions,
    secrets,
    dryRun: flags.dryRun,
  });

  let gitignoreResult: ReturnType<typeof ensureGitignoreEntry> | undefined;
  if (paths.gitignorePath) {
    gitignoreResult = ensureGitignoreEntry(paths.gitignorePath, {
      dryRun: flags.dryRun,
    });
  }

  if (!flags.dryRun && !flags.skipValidation) {
    write("\nProvider 검증 중...\n");
    const validation = await validateInstall({
      decisions,
      secrets,
      detection,
      ...(pingDeps ? { deps: pingDeps } : {}),
    });
    write(`${formatValidationResult(validation)}\n`);
    if (!validation.ok) {
      writeErr(
        [
          "",
          "[onto] 일부 provider 검증 실패.",
          "  - 자격 증명을 수정한 뒤 `onto install --reconfigure` 로 재실행하거나",
          "  - 네트워크 제약 환경이면 `--skip-validation` 을 추가해 검증을 건너뛰세요.",
          "",
        ].join("\n"),
      );
      return 1;
    }
  }

  printCompletion(result, gitignoreResult, flags.dryRun, write);
  return 0;
}

// ---------------------------------------------------------------------------
// Help + completion printers
// ---------------------------------------------------------------------------

function printHelp(write: (text: string) => void): void {
  write(
    [
      "Usage: onto install [options]",
      "",
      "First-run setup wizard for onto. Writes config.yml + .env +",
      ".env.example to ~/.onto/ (global) or <repo>/.onto/ (project).",
      "",
      "Options:",
      "  --profile-scope <global|project>     Where to write config.",
      "  --review-provider <provider>         main-native | codex | anthropic | openai | litellm",
      "  --learn-provider <provider>          same | codex | anthropic | openai | litellm",
      "  --output-language <ko|en>            Principal-facing render language.",
      "  --litellm-base-url <url>             LiteLLM endpoint (for litellm provider).",
      "  --env-file <path>                    Load a .env file before install runs.",
      "  --reconfigure, --force               Allow overwriting existing config.",
      "  --skip-validation                    Skip the live provider ping.",
      "  --dry-run                            Compute changes without writing.",
      "  --non-interactive                    Resolve decisions from flags + env only.",
      "  --help, -h                           Show this help.",
      "",
      "Environment variables (argv overrides env):",
      "  ONTO_INSTALL_PROFILE_SCOPE, ONTO_INSTALL_REVIEW_PROVIDER,",
      "  ONTO_INSTALL_LEARN_PROVIDER, ONTO_INSTALL_OUTPUT_LANGUAGE,",
      "  ONTO_INSTALL_LITELLM_BASE_URL, ONTO_INSTALL_ENV_FILE,",
      "  ONTO_INSTALL_NON_INTERACTIVE, ONTO_INSTALL_RECONFIGURE,",
      "  ONTO_INSTALL_SKIP_VALIDATION, ONTO_INSTALL_DRY_RUN.",
      "",
      "Credentials (read from env; not accepted via flag):",
      "  ANTHROPIC_API_KEY, OPENAI_API_KEY,",
      "  LITELLM_BASE_URL, LITELLM_API_KEY.",
      "",
      "Next steps after install:",
      "  onto onboard           Initialize project-specific domains and review axes.",
      "  onto help              List all commands.",
      "  onto config edit       Adjust models and advanced fields.",
      "",
    ].join("\n"),
  );
}

function printCompletion(
  result: WriteResult,
  gitignoreResult: ReturnType<typeof ensureGitignoreEntry> | undefined,
  dryRun: boolean,
  write: (text: string) => void,
): void {
  const header = dryRun ? "설치 미리보기 완료 (--dry-run)" : "설치 완료";
  write(`\n${header}\n\n`);
  write(`  config.yml     → ${result.writtenTo.configYml}\n`);
  write(`  .env           → ${result.writtenTo.env}\n`);
  write(`  .env.example   → ${result.writtenTo.envExample}\n`);
  if (gitignoreResult) {
    if (gitignoreResult.created) {
      write("  .gitignore     → (생성) .onto/.env 추가됨\n");
    } else if (!gitignoreResult.alreadyPresent) {
      write("  .gitignore     → .onto/.env 추가됨\n");
    } else {
      write("  .gitignore     → .onto/.env 이미 등록됨\n");
    }
  }
  write("\n다음 단계:\n");
  write("  onto onboard           # 프로젝트 도메인/축 초기화\n");
  write("  onto help              # 전체 명령 확인\n");
  write("  onto config edit       # 모델 등 세부 조정\n\n");
}

// ---------------------------------------------------------------------------
// Main entry + overrides
// ---------------------------------------------------------------------------

export interface HandleInstallOverrides {
  /** Override os.homedir() — tests point this at a tmpdir. */
  homeDir?: string;
  /** Override `resolveProjectRoot()`. */
  projectRoot?: string;
  /** Stub fetch for validation ping. */
  fetch?: typeof fetch;
  /** Pre-built PromptIO (e.g. ScriptedIo for interactive test). */
  io?: PromptIO;
  /** Route stdout/stderr writes into provided functions instead of process streams. */
  write?: (text: string) => void;
  writeErr?: (text: string) => void;
}

export async function handleInstallCli(
  ontoHome: string,
  argv: string[],
): Promise<number> {
  return handleInstallCliWithOverrides(ontoHome, argv);
}

export async function handleInstallCliWithOverrides(
  _ontoHome: string,
  argv: string[],
  overrides: HandleInstallOverrides = {},
): Promise<number> {
  const write =
    overrides.write ?? ((text: string) => process.stdout.write(text));
  const writeErr =
    overrides.writeErr ?? ((text: string) => process.stderr.write(text));

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp(write);
    return 0;
  }

  const flags = parseInstallFlagsWithEnv(argv, process.env);

  // --env-file (if provided) is loaded BEFORE detection/validation
  // so subsequent reads see the injected keys.
  if (flags.envFile) {
    const { missingFile } = loadEnvFileInto(flags.envFile, process.env);
    if (missingFile) {
      writeErr(
        `[onto] --env-file 경로를 찾을 수 없습니다: ${flags.envFile}\n`,
      );
      return 1;
    }
  }

  const homeDir = overrides.homeDir ?? os.homedir();
  const projectRoot = overrides.projectRoot ?? resolveProjectRoot();
  const detection = runPreflight(projectRoot);

  if (
    (detection.existingGlobalConfig || detection.existingProjectConfig) &&
    !flags.reconfigure
  ) {
    writeErr(
      [
        "[onto] 기존 config가 감지되어 install을 중단합니다.",
        "",
        formatPreflightSummary(detection),
        "",
        "  덮어쓰려면 `--reconfigure` 를 추가해 다시 실행하세요.",
        "  일부 필드만 편집하려면 `onto config edit` 을 사용하세요.",
        "",
      ].join("\n"),
    );
    return 1;
  }

  const pingDeps: PingDependencies = {};
  if (overrides.fetch) pingDeps.fetch = overrides.fetch;

  if (flags.nonInteractive) {
    return runNonInteractive({
      flags,
      detection,
      projectRoot,
      homeDir,
      pingDeps,
      write,
      writeErr,
    });
  }

  return runInteractive({
    flags,
    detection,
    projectRoot,
    homeDir,
    pingDeps,
    ...(overrides.io ? { io: overrides.io } : {}),
    write,
    writeErr,
  });
}

// ---------------------------------------------------------------------------
// Mode branches
// ---------------------------------------------------------------------------

async function runNonInteractive(args: {
  flags: InstallFlags;
  detection: PreflightDetection;
  projectRoot: string;
  homeDir: string;
  pingDeps: PingDependencies;
  write: (text: string) => void;
  writeErr: (text: string) => void;
}): Promise<number> {
  const {
    flags,
    detection,
    projectRoot,
    homeDir,
    pingDeps,
    write,
    writeErr,
  } = args;

  const resolved = resolveDecisionsFromFlags({
    flags,
    detection,
    env: process.env,
  });
  if (!resolved.ok) {
    writeErr(`[onto] install: ${resolved.errors.join("\n")}\n`);
    return 1;
  }

  if (
    resolved.decisions.reviewProvider === "main-native" &&
    !detection.hostIsClaudeCode
  ) {
    writeErr(
      "[onto] [warning] review-provider=main-native 선택됨 — Claude Code 세션 외부에서는 review가 실패합니다.\n",
    );
  }

  return runInstallAfterDecisions({
    decisions: resolved.decisions,
    secrets: resolved.secrets,
    detection,
    flags,
    projectRoot,
    homeDir,
    pingDeps,
    write,
    writeErr,
  });
}

async function runInteractive(args: {
  flags: InstallFlags;
  detection: PreflightDetection;
  projectRoot: string;
  homeDir: string;
  pingDeps: PingDependencies;
  io?: PromptIO;
  write: (text: string) => void;
  writeErr: (text: string) => void;
}): Promise<number> {
  const {
    flags,
    detection,
    projectRoot,
    homeDir,
    pingDeps,
    io: providedIo,
    write,
    writeErr,
  } = args;

  const io = providedIo ?? createReadlineIo();
  try {
    write("\nonto install — 첫 실행 설정 마법사\n\n");
    write(formatPreflightSummary(detection));
    write("\n\n");

    const { decisions, secrets } = await runInteractivePrompts({
      io,
      flags,
      detection,
    });

    return runInstallAfterDecisions({
      decisions,
      secrets,
      detection,
      flags,
      projectRoot,
      homeDir,
      pingDeps,
      write,
      writeErr,
    });
  } catch (error) {
    writeErr(
      `[onto] install failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    return 1;
  } finally {
    io.close();
  }
}
