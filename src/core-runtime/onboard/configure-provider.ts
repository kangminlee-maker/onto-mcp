import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { normalizeLlmModelSwitcher } from "../llm/model-switcher.js";
import {
  readSettingsAt,
  userSettingsPath,
  projectSettingsPath,
} from "../discovery/settings-chain.js";

/**
 * `onto configure-provider` — the input channel that writes provider LLM
 * settings INTO the settings.json chain (the sole settings authority). A
 * desktop bundle (.mcpb) install step or a human can invoke it to seed the
 * actor LLM blocks instead of hand-editing settings.json.
 *
 * INV-CFG-1 / INV-AUTH-1: this module embeds NO spec-boundary defaults
 * (provider/auth/model/effort/retry). Every written value comes from the
 * caller's flags. Missing required input fails loud; omitted `auth` is left
 * out of the file so the loader/model-switcher derives the per-provider
 * default (it is not baked in here). API keys are never written — only the
 * NAME of an env var (`api_key_env`). The settings.json chain stays the sole
 * authority; this only writes a settings file.
 */

const SCHEMA_VERSION = "settings.json/v3" as const;

/** Provider LLM values supplied by the caller. No code-side defaults. */
export interface ProviderSettingsInput {
  provider: string;
  model: string;
  auth?: string | undefined;
  apiKeyEnv?: string | undefined;
  effort?: string | undefined;
  serviceTier?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface WriteProviderSettingsTarget {
  target: "user" | "project";
  projectRoot?: string | undefined;
  /** Explicit override (tests): write to this path instead of the seat path. */
  settingsPath?: string | undefined;
}

export interface WriteProviderSettingsResult {
  path: string;
  summary: string;
}

const REVIEW_ACTOR_SEATS = {
  teamlead: "main",
  lens: "worker",
  synthesize: "worker",
} as const;

// The PROVIDER-MANAGED subset of reconstruct actors — the two required seats
// this command (re)writes. Deliberately NARROWER than the full actor key set
// (settings-chain RECONSTRUCT_ACTOR_KEYS): optional per-role override seats
// (e.g. semantic_map_synthesize) are user-owned and must SURVIVE a provider
// switch — applyActorBlocks spreads the existing actors underneath.
const RECONSTRUCT_ACTORS = ["semantic_author", "confirmation_provider"] as const;

// String-valued switcher fields plus the numeric `timeout_ms` (schema:
// z.number().int()); it must serialize as a JSON number, not a string, or the
// loader re-validation in writeProviderSettings would reject the file.
type LlmBlock = Record<string, string | number>;

/**
 * Build a minimal actor LLM block from caller input. Only keys the caller
 * supplied are emitted — there is no default provider/auth/model/effort.
 */
export function buildLlmBlock(input: ProviderSettingsInput): LlmBlock {
  const block: LlmBlock = {
    provider: input.provider,
    model: input.model,
  };
  if (input.auth !== undefined) block.auth = input.auth;
  if (input.baseUrl !== undefined) block.base_url = input.baseUrl;
  if (input.effort !== undefined) block.effort = input.effort;
  if (input.serviceTier !== undefined) block.service_tier = input.serviceTier;
  if (input.apiKeyEnv !== undefined) block.api_key_env = input.apiKeyEnv;
  if (input.timeoutMs !== undefined) block.timeout_ms = input.timeoutMs;
  return block;
}

interface ReviewActorWrite {
  seat: string;
  llm: LlmBlock;
}

export interface ProviderActorBlocks {
  review: Record<keyof typeof REVIEW_ACTOR_SEATS, ReviewActorWrite>;
  /**
   * Reconstruct actors require `auth` in the settings.json/v3 schema, so they
   * are only emitted when the caller supplied `--auth`. Without it the loader
   * cannot derive a file-level auth for the required-auth reconstruct shape,
   * and silently inserting one would violate INV-CFG-1.
   */
  reconstruct?: Record<(typeof RECONSTRUCT_ACTORS)[number], { llm: LlmBlock }>;
}

/**
 * Construct the actor LLM blocks (review + reconstruct) in the EXACT v3 write
 * shape the loader expects: `review.execution.actors.{teamlead,lens,synthesize}`
 * with mandatory seats, and `reconstruct.execution.actors.{semantic_author,
 * confirmation_provider}`.
 */
export function buildProviderActorBlocks(
  input: ProviderSettingsInput,
): ProviderActorBlocks {
  const llm = buildLlmBlock(input);
  const review = {
    teamlead: { seat: REVIEW_ACTOR_SEATS.teamlead, llm: { ...llm } },
    lens: { seat: REVIEW_ACTOR_SEATS.lens, llm: { ...llm } },
    synthesize: { seat: REVIEW_ACTOR_SEATS.synthesize, llm: { ...llm } },
  };
  const blocks: ProviderActorBlocks = { review };
  if (input.auth !== undefined) {
    blocks.reconstruct = {
      semantic_author: { llm: { ...llm } },
      confirmation_provider: { llm: { ...llm } },
    };
  }
  return blocks;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readRawSettings(filePath: string): Promise<Record<string, unknown>> {
  let contents: string;
  try {
    contents = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  // Parse through the SAME comment-aware path the real loader uses
  // (`readSettingsAt` → `yaml.parse`), not `JSON.parse`: settings.json accepts
  // `#` comments, so JSON.parse would reject an otherwise-valid documented seat
  // and block the merge/bootstrap.
  const parsed: unknown = parseYaml(contents);
  if (parsed === null || parsed === undefined) return {};
  if (!isPlainObject(parsed)) {
    throw new Error(
      `Existing settings at ${filePath} is not a settings object; refusing to overwrite.`,
    );
  }
  return parsed;
}

/**
 * Set ONLY the actor LLM blocks (and schema_version) into an existing raw
 * settings object, preserving every other setting (units, retry, context,
 * domains, …) untouched.
 */
function applyActorBlocks(
  existing: Record<string, unknown>,
  blocks: ProviderActorBlocks,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing };
  next.schema_version = SCHEMA_VERSION;

  const review = isPlainObject(next.review) ? { ...next.review } : {};
  const reviewExecution = isPlainObject(review.execution)
    ? { ...review.execution }
    : {};
  reviewExecution.actors = blocks.review;
  review.execution = reviewExecution;
  next.review = review;

  if (blocks.reconstruct) {
    const reconstruct = isPlainObject(next.reconstruct)
      ? { ...next.reconstruct }
      : {};
    const reconstructExecution = isPlainObject(reconstruct.execution)
      ? { ...reconstruct.execution }
      : {};
    // Overwrite ONLY the provider-managed seats; preserve user-owned actor
    // keys (e.g. the optional semantic_map_synthesize override seat) so a
    // provider switch or bootstrap re-run cannot silently delete them
    // (INV-MODEL-1 role-aware design §5.1-9).
    const existingActors = isPlainObject(reconstructExecution.actors)
      ? reconstructExecution.actors
      : {};
    reconstructExecution.actors = { ...existingActors, ...blocks.reconstruct };
    reconstruct.execution = reconstructExecution;
    next.reconstruct = reconstruct;
  }

  return next;
}

function resolveSeatPath(target: WriteProviderSettingsTarget): string {
  if (target.settingsPath !== undefined) return target.settingsPath;
  if (target.target === "project") {
    if (!target.projectRoot) {
      throw new Error(
        "configure-provider: target=project requires projectRoot.",
      );
    }
    return projectSettingsPath(target.projectRoot);
  }
  return userSettingsPath();
}

/**
 * Validate the actor LLM route via the same model-switcher the loader uses,
 * so an unroutable provider/auth combination fails before any write.
 */
function assertActorRoutes(blocks: ProviderActorBlocks): void {
  const refs: Array<[string, LlmBlock]> = [
    ["review.actors.teamlead", blocks.review.teamlead.llm],
    ["review.actors.lens", blocks.review.lens.llm],
    ["review.actors.synthesize", blocks.review.synthesize.llm],
  ];
  if (blocks.reconstruct) {
    for (const actor of RECONSTRUCT_ACTORS) {
      refs.push([
        `reconstruct.actors.${actor}`,
        blocks.reconstruct[actor].llm,
      ]);
    }
  }
  for (const [where, llm] of refs) {
    try {
      normalizeLlmModelSwitcher(llm);
    } catch (error) {
      throw new Error(
        `${where}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function describeBlocks(blocks: ProviderActorBlocks): string {
  const reviewActors = Object.keys(blocks.review).join(", ");
  const reconstructActors = blocks.reconstruct
    ? Object.keys(blocks.reconstruct).join(", ")
    : "(skipped — reconstruct actors require --auth)";
  return [
    `review: ${reviewActors}`,
    `reconstruct: ${reconstructActors}`,
  ].join("; ");
}

/**
 * Merge provider actor blocks into the settings seat and write atomically.
 * Validates the merged object through the real loader (`readSettingsAt`) plus
 * the model-switcher route check; never writes an invalid file.
 */
/**
 * `--api-key-env` is public, so guard the command's "never the key" guarantee:
 * persist only a value shaped like an env-var NAME. If a caller mistakenly
 * passes the API key itself, refuse — and do NOT echo the supplied value in the
 * error (echoing it would itself leak the secret).
 */
function assertValidApiKeyEnvName(apiKeyEnv: string | undefined): void {
  if (apiKeyEnv === undefined) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
    throw new Error(
      "api_key_env must be an environment variable NAME (letters, digits, " +
        "underscore; not starting with a digit). Refusing to persist the " +
        "supplied value — never pass the API key itself as the env name.",
    );
  }
}

export async function writeProviderSettings(
  input: ProviderSettingsInput,
  target: WriteProviderSettingsTarget,
): Promise<WriteProviderSettingsResult> {
  assertValidApiKeyEnvName(input.apiKeyEnv);
  const blocks = buildProviderActorBlocks(input);
  assertActorRoutes(blocks);

  const filePath = resolveSeatPath(target);
  const existing = await readRawSettings(filePath);
  const merged = applyActorBlocks(existing, blocks);
  const serialized = `${JSON.stringify(merged, null, 2)}\n`;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.configure-provider.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, serialized, "utf8");
  try {
    // Validate via the real loader before committing the write.
    await readSettingsAt(tmpPath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true });
    throw error;
  }
  await fs.rename(tmpPath, filePath);

  return {
    path: filePath,
    summary: describeBlocks(blocks),
  };
}

export interface ParsedConfigureProviderArgs {
  provider: string | undefined;
  model: string | undefined;
  auth: string | undefined;
  apiKeyEnv: string | undefined;
  effort: string | undefined;
  serviceTier: string | undefined;
  baseUrl: string | undefined;
  timeoutMsRaw: string | undefined;
  target: "user" | "project";
  projectRoot: string | undefined;
  settingsPath: string | undefined;
  help: boolean;
  unknownFlags: string[];
}

const USAGE = [
  "Usage: onto configure-provider --provider <p> --model <m> [options]",
  "",
  "Write/merge LLM provider settings into the settings.json chain (the sole",
  "settings authority). Writes the review actor blocks (teamlead/lens/synthesize)",
  "and, when --auth is given, the reconstruct actor blocks (semantic_author/",
  "confirmation_provider). All other settings are preserved.",
  "",
  "Required:",
  "  --provider <p>        LLM provider (e.g. openai, anthropic, grok, lmstudio)",
  "  --model <m>           Model id",
  "",
  "Options:",
  "  --auth <a>            Auth mode (api_key|oauth|local). Omit to let the",
  "                        loader derive the per-provider default. Required to",
  "                        also write reconstruct actor blocks.",
  "  --api-key-env <ENV>   NAME of the env var holding the API key (never the key)",
  "  --effort <e>          Reasoning effort",
  "  --service-tier <t>    Service tier",
  "  --base-url <u>        Base URL override",
  "  --timeout-ms <ms>     Per-actor CLI-worker call timeout (positive integer ms).",
  "                        Bounds the codex/claude direct-call worker; not the",
  "                        api_key SDK route. See llm.timeout_ms.",
  "  --project             Write the project seat (.onto/settings.json) instead",
  "                        of the user seat (~/.onto/settings.json)",
  "  --help, -h            Show this help",
].join("\n");

export function parseConfigureProviderArgs(
  argv: string[],
): ParsedConfigureProviderArgs {
  const parsed: ParsedConfigureProviderArgs = {
    provider: undefined,
    model: undefined,
    auth: undefined,
    apiKeyEnv: undefined,
    effort: undefined,
    serviceTier: undefined,
    baseUrl: undefined,
    timeoutMsRaw: undefined,
    target: "user",
    projectRoot: undefined,
    settingsPath: undefined,
    help: false,
    unknownFlags: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--provider":
        parsed.provider = argv[++i];
        break;
      case "--model":
        parsed.model = argv[++i];
        break;
      case "--auth":
        parsed.auth = argv[++i];
        break;
      case "--api-key-env":
        parsed.apiKeyEnv = argv[++i];
        break;
      case "--effort":
        parsed.effort = argv[++i];
        break;
      case "--service-tier":
        parsed.serviceTier = argv[++i];
        break;
      case "--base-url":
        parsed.baseUrl = argv[++i];
        break;
      case "--timeout-ms":
        parsed.timeoutMsRaw = argv[++i];
        break;
      case "--project":
        parsed.target = "project";
        break;
      case "--project-root":
        parsed.projectRoot = argv[++i];
        break;
      case "--settings-path":
        parsed.settingsPath = argv[++i];
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      default:
        parsed.unknownFlags.push(arg);
        break;
    }
  }

  return parsed;
}

/**
 * CLI entry for `onto configure-provider`. Fails loud (non-zero) on missing
 * required flags or on validation failure; never writes an invalid file and
 * never bakes in a provider/auth/model default.
 */
export async function runConfigureProvider(argv: string[]): Promise<number> {
  const parsed = parseConfigureProviderArgs(argv);
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }
  if (parsed.unknownFlags.length > 0) {
    console.error(
      `[onto configure-provider] Unknown option(s): ${parsed.unknownFlags.join(", ")}`,
    );
    console.error(USAGE);
    return 1;
  }
  const missing: string[] = [];
  if (!parsed.provider) missing.push("--provider");
  if (!parsed.model) missing.push("--model");
  if (missing.length > 0) {
    console.error(
      `[onto configure-provider] Missing required flag(s): ${missing.join(", ")}. ` +
        "No default is assumed — provider and model must be supplied.",
    );
    console.error(USAGE);
    return 1;
  }

  let timeoutMs: number | undefined;
  if (parsed.timeoutMsRaw !== undefined) {
    const n = Number(parsed.timeoutMsRaw);
    if (!Number.isInteger(n) || n < 1) {
      console.error(
        "[onto configure-provider] --timeout-ms must be a positive integer " +
          `(ms); got "${parsed.timeoutMsRaw}".`,
      );
      return 1;
    }
    timeoutMs = n;
  }

  const input: ProviderSettingsInput = {
    provider: parsed.provider!,
    model: parsed.model!,
    ...(parsed.auth !== undefined ? { auth: parsed.auth } : {}),
    ...(parsed.apiKeyEnv !== undefined ? { apiKeyEnv: parsed.apiKeyEnv } : {}),
    ...(parsed.effort !== undefined ? { effort: parsed.effort } : {}),
    ...(parsed.serviceTier !== undefined
      ? { serviceTier: parsed.serviceTier }
      : {}),
    ...(parsed.baseUrl !== undefined ? { baseUrl: parsed.baseUrl } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };

  const targetSpec: WriteProviderSettingsTarget = {
    target: parsed.target,
    ...(parsed.projectRoot !== undefined
      ? { projectRoot: parsed.projectRoot }
      : parsed.target === "project"
        ? { projectRoot: process.cwd() }
        : {}),
    ...(parsed.settingsPath !== undefined
      ? { settingsPath: parsed.settingsPath }
      : {}),
  };

  try {
    const result = await writeProviderSettings(input, targetSpec);
    console.log(`[onto configure-provider] Wrote ${result.path}`);
    console.log(`  ${result.summary}`);
    if (input.auth === undefined) {
      console.log(
        "  Note: --auth omitted — reconstruct actor blocks were skipped " +
          "(they require an explicit auth). The loader derives review auth.",
      );
    }
    return 0;
  } catch (error) {
    console.error(
      `[onto configure-provider] Failed to write settings: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 1;
  }
}
