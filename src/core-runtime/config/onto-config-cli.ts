import fs from "node:fs/promises";
import path from "node:path";

import {
  assertNoRetiredConfigFiles,
  defaultReviewExecution,
  projectSettingsPath,
  resolveSettingsChain,
  type OntoSettings,
  type ReviewExecutionSettings,
  type ReviewExecutionMode,
  type ReviewWorkerSeat,
} from "../discovery/settings-chain.js";

const SUPPORTED_SET_PATHS = [
  "llm.auth",
  "llm.provider",
  "llm.model",
  "llm.effort",
  "llm.base_url",
  "llm.api_key_env",
  "review.execution.mode",
  "review.execution.teamlead.seat",
  "review.execution.lens.seat",
  "review.execution.max_concurrent_workers",
  "output_language",
  "review_mode",
] as const;

type SupportedSetPath = (typeof SUPPORTED_SET_PATHS)[number];

export async function handleConfigCli(
  ontoHome: string,
  argv: string[],
): Promise<number> {
  const subcommand = argv[0] ?? "show";
  const args = argv.slice(1);
  const projectRoot = process.cwd();

  try {
    switch (subcommand) {
      case "show":
        return handleShow(ontoHome, projectRoot);
      case "validate":
        return handleValidate(ontoHome, projectRoot);
      case "set":
        return handleSet(ontoHome, projectRoot, args);
      case "use":
        return handleUse(ontoHome, projectRoot, args);
      case "--help":
      case "-h":
        printHelp();
        return 0;
      default:
        throw new Error(`Unknown settings subcommand: ${subcommand}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function printHelp(): void {
  console.log(
    [
      "onto config - inspect or edit .onto/settings.json",
      "",
      "Usage:",
      "  onto config show",
      "  onto config validate",
      "  onto config set <path> <value>",
      "  onto config use main-workers",
      "  onto config use nested-workers",
      "",
      "Supported set paths:",
      ...SUPPORTED_SET_PATHS.map((keyPath) => `  - ${keyPath}`),
    ].join("\n"),
  );
}

async function handleShow(
  ontoHome: string,
  projectRoot: string,
): Promise<number> {
  const settings = await resolveSettingsChain(ontoHome, projectRoot);
  console.log(JSON.stringify({
    settings_path: projectSettingsPath(projectRoot),
    settings,
  }, null, 2));
  return 0;
}

async function handleValidate(
  ontoHome: string,
  projectRoot: string,
): Promise<number> {
  await resolveSettingsChain(ontoHome, projectRoot);
  console.log(JSON.stringify({
    ok: true,
    settings_path: projectSettingsPath(projectRoot),
  }, null, 2));
  return 0;
}

async function handleSet(
  ontoHome: string,
  projectRoot: string,
  argv: string[],
): Promise<number> {
  if (argv.length !== 2) {
    throw new Error("onto config set requires <path> and <value>.");
  }
  const [keyPath, rawValue] = argv as [string, string];
  if (!SUPPORTED_SET_PATHS.includes(keyPath as SupportedSetPath)) {
    throw new Error(
      `Unsupported settings path: ${keyPath}. Supported: ${SUPPORTED_SET_PATHS.join(", ")}`,
    );
  }

  const settings = await readProjectSettings(projectRoot);
  setValue(settings, keyPath as SupportedSetPath, rawValue);
  await writeProjectSettings(projectRoot, settings);
  await resolveSettingsChain(ontoHome, projectRoot);
  console.log(JSON.stringify({
    ok: true,
    changed: keyPath,
    settings_path: projectSettingsPath(projectRoot),
  }, null, 2));
  return 0;
}

async function handleUse(
  ontoHome: string,
  projectRoot: string,
  argv: string[],
): Promise<number> {
  const mode = argv[0];
  if (mode !== "main-workers" && mode !== "nested-workers") {
    throw new Error("onto config use supports main-workers or nested-workers.");
  }

  const settings = await readProjectSettings(projectRoot);
  const execution = settings.review?.execution ?? defaultReviewExecution();
  settings.review = {
    ...(settings.review ?? { execution }),
    execution: {
      ...execution,
      mode,
      teamlead: {
        ...(execution.teamlead ?? { llm: "inherit" }),
        seat: mode === "main-workers" ? "main" : "worker",
      },
      lens: {
        ...(execution.lens ?? { llm: "inherit" }),
        seat: "worker",
      },
      deliberation: "controlled-lens-deliberation",
    },
  };

  const maxConcurrent = readOption(argv.slice(1), "max-concurrent-workers");
  if (maxConcurrent !== undefined) {
    settings.review.execution.max_concurrent_workers =
      parsePositiveInteger(maxConcurrent, "--max-concurrent-workers");
  }

  await writeProjectSettings(projectRoot, settings);
  await resolveSettingsChain(ontoHome, projectRoot);
  console.log(JSON.stringify({
    ok: true,
    mode,
    settings_path: projectSettingsPath(projectRoot),
  }, null, 2));
  return 0;
}

async function readProjectSettings(projectRoot: string): Promise<OntoSettings> {
  await assertNoRetiredConfigFiles(projectRoot);
  const settingsPath = projectSettingsPath(projectRoot);
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    return JSON.parse(raw) as OntoSettings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw new Error(
      `Failed to read ${settingsPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function writeProjectSettings(
  projectRoot: string,
  settings: OntoSettings,
): Promise<void> {
  const settingsPath = projectSettingsPath(projectRoot);
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(
    settingsPath,
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf8",
  );
}

function setValue(
  settings: OntoSettings,
  keyPath: SupportedSetPath,
  rawValue: string,
): void {
  switch (keyPath) {
    case "llm.auth":
      settings.llm = { ...(settings.llm ?? {}), auth: parseAuth(rawValue) };
      return;
    case "llm.provider":
      settings.llm = { ...(settings.llm ?? {}), provider: parseProvider(rawValue) };
      return;
    case "llm.model":
      settings.llm = { ...(settings.llm ?? {}), model: requireNonEmpty(rawValue, keyPath) };
      return;
    case "llm.effort":
      settings.llm = { ...(settings.llm ?? {}), effort: requireNonEmpty(rawValue, keyPath) };
      return;
    case "llm.base_url":
      settings.llm = { ...(settings.llm ?? {}), base_url: requireNonEmpty(rawValue, keyPath) };
      return;
    case "llm.api_key_env":
      settings.llm = { ...(settings.llm ?? {}), api_key_env: requireNonEmpty(rawValue, keyPath) };
      return;
    case "review.execution.mode":
      ensureExecution(settings).mode = parseMode(rawValue);
      normalizeExecutionSeats(settings);
      return;
    case "review.execution.teamlead.seat":
      ensureExecution(settings).teamlead = {
        ...ensureExecution(settings).teamlead,
        seat: parseSeat(rawValue),
      };
      return;
    case "review.execution.lens.seat":
      ensureExecution(settings).lens = {
        ...ensureExecution(settings).lens,
        seat: parseSeat(rawValue),
      };
      return;
    case "review.execution.max_concurrent_workers":
      ensureExecution(settings).max_concurrent_workers =
        parsePositiveInteger(rawValue, keyPath);
      return;
    case "output_language":
      settings.output_language = requireNonEmpty(rawValue, keyPath);
      return;
    case "review_mode":
      if (rawValue !== "core-axis" && rawValue !== "full") {
        throw new Error("review_mode must be core-axis or full.");
      }
      settings.review_mode = rawValue;
      return;
  }
}

function ensureExecution(settings: OntoSettings): ReviewExecutionSettings {
  const execution = settings.review?.execution ?? defaultReviewExecution();
  settings.review = {
    ...(settings.review ?? { execution }),
    execution,
  };
  return settings.review.execution;
}

function normalizeExecutionSeats(settings: OntoSettings): void {
  const execution = ensureExecution(settings);
  execution.teamlead = {
    ...execution.teamlead,
    seat: execution.mode === "main-workers" ? "main" : "worker",
  };
  execution.lens = {
    ...execution.lens,
    seat: "worker",
  };
}

function parseAuth(rawValue: string): "api_key" | "oauth" | "local" {
  if (rawValue === "api_key" || rawValue === "oauth" || rawValue === "local") {
    return rawValue;
  }
  throw new Error("llm.auth must be api_key, oauth, or local.");
}

function parseProvider(rawValue: string): "openai" | "anthropic" | "grok" | "lmstudio" {
  if (
    rawValue === "openai" ||
    rawValue === "anthropic" ||
    rawValue === "grok" ||
    rawValue === "lmstudio"
  ) {
    return rawValue;
  }
  throw new Error("llm.provider must be openai, anthropic, grok, or lmstudio.");
}

function parseMode(rawValue: string): ReviewExecutionMode {
  if (rawValue === "main-workers" || rawValue === "nested-workers") {
    return rawValue;
  }
  throw new Error("review.execution.mode must be main-workers or nested-workers.");
}

function parseSeat(rawValue: string): ReviewWorkerSeat {
  if (rawValue === "main" || rawValue === "worker") {
    return rawValue;
  }
  throw new Error("review execution seat must be main or worker.");
}

function parsePositiveInteger(rawValue: string, label: string): number {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  const value = Number.parseInt(rawValue, 10);
  if (value < 1) {
    throw new Error(`${label} must be >= 1.`);
  }
  return value;
}

function requireNonEmpty(rawValue: string, label: string): string {
  if (rawValue.length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }
  return rawValue;
}

function readOption(argv: string[], name: string): string | undefined {
  const token = `--${name}`;
  const index = argv.indexOf(token);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${token} requires a value.`);
  }
  return value;
}
