import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  normalizeLlmModelSwitcher,
  type LlmModelSwitcherConfig,
} from "../llm/model-switcher.js";
import {
  createStructuredFailureRecord,
  type StructuredFailureParams,
} from "../review/failure-records.js";
import { fileExists } from "../review/review-artifact-utils.js";
import type { ReviewStructuredFailureRecord } from "../review/artifact-types.js";

const LlmAuthModeSchema = z.enum(["api_key", "oauth", "local"]);
const LlmProviderSchema = z.enum(["openai", "anthropic", "grok", "lmstudio"]);

const LlmSettingsSchema = z
  .object({
    auth: LlmAuthModeSchema.optional(),
    provider: LlmProviderSchema.optional(),
    model: z.string().min(1).optional(),
    base_url: z.string().min(1).optional(),
    effort: z.string().min(1).optional(),
    service_tier: z.string().min(1).optional(),
    api_key_env: z.string().min(1).optional(),
  })
  .strict();

const LlmRefSchema = z.union([z.literal("inherit"), LlmSettingsSchema]);

const ReviewWorkerSeatSchema = z.enum(["main", "worker"]);
const ReviewExecutionModeSchema = z.enum(["main-workers", "nested-workers"]);
const ReviewExecutorSelectionSchema = z.enum([
  "auto",
  "codex",
  "direct_call",
  "mock",
]);
const ReviewDeliberationSchema = z.enum(["controlled-lens-deliberation"]);

const DEFAULT_REVIEW_EXECUTION = {
  mode: "main-workers",
  executor: "auto",
  teamlead: { seat: "main", llm: "inherit" },
  lens: { seat: "worker", llm: "inherit" },
  synthesize: { seat: "worker", llm: "inherit" },
  deliberation: "controlled-lens-deliberation",
} as const;

const ReviewActorSettingsSchema = z
  .object({
    seat: ReviewWorkerSeatSchema.optional(),
    llm: LlmRefSchema.optional(),
  })
  .strict();

const ReviewExecutionSettingsSchema = z
  .object({
    mode: ReviewExecutionModeSchema.optional(),
    executor: ReviewExecutorSelectionSchema.optional(),
    teamlead: ReviewActorSettingsSchema.optional(),
    lens: ReviewActorSettingsSchema.optional(),
    synthesize: ReviewActorSettingsSchema.optional(),
    deliberation: ReviewDeliberationSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const mode = value.mode ?? "main-workers";
    const teamleadSeat = value.teamlead?.seat ?? "main";
    const lensSeat = value.lens?.seat ?? "worker";
    const synthesizeSeat = value.synthesize?.seat ?? "worker";

    if (mode === "main-workers" && teamleadSeat !== "main") {
      ctx.addIssue({
        code: "custom",
        path: ["teamlead", "seat"],
        message: "main-workers requires review.execution.teamlead.seat=main.",
      });
    }
    if (mode === "main-workers" && lensSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["lens", "seat"],
        message: "main-workers requires review.execution.lens.seat=worker.",
      });
    }
    if (mode === "nested-workers" && teamleadSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["teamlead", "seat"],
        message: "nested-workers requires review.execution.teamlead.seat=worker.",
      });
    }
    if (mode === "nested-workers" && lensSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["lens", "seat"],
        message: "nested-workers requires review.execution.lens.seat=worker.",
      });
    }
    if (synthesizeSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["synthesize", "seat"],
        message: "review.execution.synthesize.seat must be worker.",
      });
    }
  });

const ReviewSettingsSchema = z
  .object({
    mode: z.enum(["core-axis", "full"]).optional(),
    domains: z.array(z.string().min(1)).optional(),
    context: z
      .object({
        excluded_names: z.array(z.string().min(1)).optional(),
        max_listing_depth: z.union([z.number(), z.string()]).optional(),
        max_listing_entries: z.union([z.number(), z.string()]).optional(),
        max_embed_lines: z.union([z.number(), z.string()]).optional(),
      })
      .strict()
      .optional(),
    execution: ReviewExecutionSettingsSchema.optional(),
  })
  .strict();

const V1SettingsSchema = z
  .object({
    schema_version: z.literal("settings.json/v1").optional(),
    llm: LlmSettingsSchema.optional(),
    review: ReviewSettingsSchema.optional(),
    review_mode: z.enum(["core-axis", "full"]).optional(),
    domains: z.array(z.string().min(1)).optional(),
    excluded_names: z.array(z.string().min(1)).optional(),
    max_listing_depth: z.union([z.number(), z.string()]).optional(),
    max_listing_entries: z.union([z.number(), z.string()]).optional(),
    max_embed_lines: z.union([z.number(), z.string()]).optional(),
  })
  .strict();

const V2ReviewActorSettingsSchema = z
  .object({
    seat: ReviewWorkerSeatSchema.optional(),
    llm: LlmRefSchema.optional(),
  })
  .strict();

const V2ReviewExecutionSettingsSchema = z
  .object({
    topology: ReviewExecutionModeSchema.optional(),
    executor: ReviewExecutorSelectionSchema.optional(),
    actors: z
      .object({
        teamlead: V2ReviewActorSettingsSchema.optional(),
        lens: V2ReviewActorSettingsSchema.optional(),
        synthesize: V2ReviewActorSettingsSchema.optional(),
      })
      .strict()
      .optional(),
    deliberation: ReviewDeliberationSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const topology = value.topology ?? "main-workers";
    const teamleadSeat = value.actors?.teamlead?.seat ?? "main";
    const lensSeat = value.actors?.lens?.seat ?? "worker";
    const synthesizeSeat = value.actors?.synthesize?.seat ?? "worker";

    if (topology === "main-workers" && teamleadSeat !== "main") {
      ctx.addIssue({
        code: "custom",
        path: ["actors", "teamlead", "seat"],
        message: "main-workers requires review.execution.actors.teamlead.seat=main.",
      });
    }
    if (topology === "main-workers" && lensSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["actors", "lens", "seat"],
        message: "main-workers requires review.execution.actors.lens.seat=worker.",
      });
    }
    if (topology === "nested-workers" && teamleadSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["actors", "teamlead", "seat"],
        message: "nested-workers requires review.execution.actors.teamlead.seat=worker.",
      });
    }
    if (topology === "nested-workers" && lensSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["actors", "lens", "seat"],
        message: "nested-workers requires review.execution.actors.lens.seat=worker.",
      });
    }
    if (synthesizeSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["actors", "synthesize", "seat"],
        message: "review.execution.actors.synthesize.seat must be worker.",
      });
    }
  });

const V2ReviewSettingsSchema = z
  .object({
    mode: z.enum(["core-axis", "full"]).optional(),
    domains: z.array(z.string().min(1)).optional(),
    context: z
      .object({
        excluded_names: z.array(z.string().min(1)).optional(),
        max_listing_depth: z.union([z.number(), z.string()]).optional(),
        max_listing_entries: z.union([z.number(), z.string()]).optional(),
        max_embed_lines: z.union([z.number(), z.string()]).optional(),
      })
      .strict()
      .optional(),
    execution: V2ReviewExecutionSettingsSchema.optional(),
  })
  .strict();

const V2SettingsSchema = z
  .object({
    schema_version: z.literal("settings.json/v2"),
    llm: z
      .object({
        default: LlmSettingsSchema.optional(),
      })
      .strict()
      .optional(),
    review: V2ReviewSettingsSchema.optional(),
  })
  .strict();

const SettingsSchema = z.union([V1SettingsSchema, V2SettingsSchema]);
const NormalizedSettingsSchema = z
  .object({
    schema_version: z.enum(["settings.json/v1", "settings.json/v2"]).optional(),
    llm: LlmSettingsSchema.optional(),
    review: ReviewSettingsSchema.optional(),
    review_mode: z.enum(["core-axis", "full"]).optional(),
    domains: z.array(z.string().min(1)).optional(),
    excluded_names: z.array(z.string().min(1)).optional(),
    max_listing_depth: z.union([z.number(), z.string()]).optional(),
    max_listing_entries: z.union([z.number(), z.string()]).optional(),
    max_embed_lines: z.union([z.number(), z.string()]).optional(),
  })
  .strict();
type V1Settings = z.infer<typeof V1SettingsSchema>;
type V2Settings = z.infer<typeof V2SettingsSchema>;
type ParsedSettings = z.infer<typeof SettingsSchema>;

export type ReviewExecutionMode = z.infer<typeof ReviewExecutionModeSchema>;
export type ReviewExecutorSelection = z.infer<typeof ReviewExecutorSelectionSchema>;
export type ReviewWorkerSeat = z.infer<typeof ReviewWorkerSeatSchema>;
export type ReviewDeliberation = z.infer<typeof ReviewDeliberationSchema>;

export type ReviewLlmRef = "inherit" | LlmModelSwitcherConfig;

export interface ReviewContextSettings {
  excluded_names?: string[];
  max_listing_depth?: number | string;
  max_listing_entries?: number | string;
  max_embed_lines?: number | string;
}

interface ReviewContextSettingsInput {
  excluded_names?: string[] | undefined;
  max_listing_depth?: number | string | undefined;
  max_listing_entries?: number | string | undefined;
  max_embed_lines?: number | string | undefined;
}

interface ReviewActorSettingsInput {
  seat?: ReviewWorkerSeat | undefined;
  llm?: ReviewLlmRef | undefined;
}

interface ReviewExecutionSettingsInput {
  mode?: ReviewExecutionMode | undefined;
  executor?: ReviewExecutorSelection | undefined;
  teamlead?: ReviewActorSettingsInput | undefined;
  lens?: ReviewActorSettingsInput | undefined;
  synthesize?: ReviewActorSettingsInput | undefined;
  deliberation?: ReviewDeliberation | undefined;
}

export interface ReviewActorSettings {
  seat?: ReviewWorkerSeat;
  llm?: ReviewLlmRef;
}

export interface ResolvedReviewActorSettings {
  seat: ReviewWorkerSeat;
  llm: ReviewLlmRef;
}

export interface ReviewExecutionSettings {
  mode?: ReviewExecutionMode;
  executor?: ReviewExecutorSelection;
  teamlead?: ReviewActorSettings;
  lens?: ReviewActorSettings;
  synthesize?: ReviewActorSettings;
  deliberation?: ReviewDeliberation;
}

export interface ResolvedReviewExecutionSettings {
  mode: ReviewExecutionMode;
  executor: ReviewExecutorSelection;
  teamlead: ResolvedReviewActorSettings;
  lens: ResolvedReviewActorSettings;
  synthesize: ResolvedReviewActorSettings;
  deliberation: ReviewDeliberation;
}

export interface ReviewSettings {
  mode?: "core-axis" | "full";
  domains?: string[];
  context?: ReviewContextSettings;
  execution?: ReviewExecutionSettings;
}

export interface OntoSettings {
  schema_version?: "settings.json/v1" | "settings.json/v2";
  llm?: LlmModelSwitcherConfig;
  review?: ReviewSettings;
  review_mode?: "core-axis" | "full";
  domains?: string[];
  excluded_names?: string[];
  max_listing_depth?: number | string;
  max_listing_entries?: number | string;
  max_embed_lines?: number | string;
}

export type OntoConfig = OntoSettings;

export const SETTINGS_FILENAME = "settings.json";
export const RETIRED_CONFIG_FILENAMES = [
  `config.${"yml"}`,
  `config.${"yaml"}`,
] as const;

export function userSettingsPath(): string {
  return path.join(os.homedir(), ".onto", SETTINGS_FILENAME);
}

export function projectSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, ".onto", SETTINGS_FILENAME);
}

export class UnsupportedOntoConfigFilesError extends Error {
  readonly unsupportedPaths: string[];
  readonly failureRecord: ReviewStructuredFailureRecord;

  constructor(unsupportedPaths: string[]) {
    const message = [
      "Unsupported onto config file detected.",
      ...unsupportedPaths.map((filePath) => `- ${filePath}`),
      "",
      "Use .onto/settings.json for runtime settings. YAML settings are not read.",
    ].join("\n");
    super(message);
    this.name = "UnsupportedOntoConfigFilesError";
    this.unsupportedPaths = unsupportedPaths;
    const failureParams: StructuredFailureParams = {
      phase: "pre_manifest.retired_entry",
      reasonCode: "retired_config_file_detected",
      humanMessage: "Unsupported onto config file detected.",
      requiredUserAction:
        "Remove retired YAML config files and move runtime settings to .onto/settings.json.",
      retrySafety: "safe_after_input_change",
      artifactTrust: "no_artifacts_trusted",
      dispatchState: "not_dispatched",
      artifactRefs: {},
      mcpErrorCode: "ONTO_REVIEW_RETIRED_CONFIG_DETECTED",
      detailsKind: "retired_config",
      details: {
        unsupported_paths: unsupportedPaths,
        active_settings_filename: SETTINGS_FILENAME,
      },
    };
    this.failureRecord = createStructuredFailureRecord(failureParams);
  }
}

export class OntoSettingsValidationError extends Error {
  readonly failureRecord: ReviewStructuredFailureRecord;

  constructor(args: {
    message: string;
    settingsPath?: string;
    reasonCode: string;
    details: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = "OntoSettingsValidationError";
    this.failureRecord = createStructuredFailureRecord({
      phase: "pre_manifest.settings_validation",
      reasonCode: args.reasonCode,
      humanMessage: args.message.split("\n")[0] ?? "Invalid onto settings.",
      requiredUserAction:
        "Fix .onto/settings.json or user ~/.onto/settings.json, then retry the review.",
      retrySafety: "safe_after_input_change",
      artifactTrust: "no_artifacts_trusted",
      dispatchState: "not_dispatched",
      artifactRefs: args.settingsPath ? { settings: args.settingsPath } : {},
      mcpErrorCode: "ONTO_REVIEW_SETTINGS_VALIDATION_FAILED",
      detailsKind: "settings_validation",
      details: {
        ...(args.settingsPath ? { settings_path: args.settingsPath } : {}),
        ...args.details,
      },
    });
  }
}

export async function assertNoUnsupportedConfigFiles(
  root: string,
): Promise<void> {
  const unsupported = [];
  for (const filename of RETIRED_CONFIG_FILENAMES) {
    const candidate = path.join(root, ".onto", filename);
    if (await fileExists(candidate)) unsupported.push(candidate);
  }
  if (unsupported.length > 0) {
    throw new UnsupportedOntoConfigFilesError(unsupported);
  }
}

function definedReviewContext(
  context: ReviewContextSettingsInput,
): ReviewContextSettings | undefined {
  const out: ReviewContextSettings = {};
  if (context.excluded_names !== undefined) {
    out.excluded_names = context.excluded_names;
  }
  if (context.max_listing_depth !== undefined) {
    out.max_listing_depth = context.max_listing_depth;
  }
  if (context.max_listing_entries !== undefined) {
    out.max_listing_entries = context.max_listing_entries;
  }
  if (context.max_embed_lines !== undefined) {
    out.max_embed_lines = context.max_embed_lines;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function definedReviewActorSettings(
  actor: ReviewActorSettingsInput | undefined,
): ReviewActorSettings | undefined {
  if (!actor) return undefined;
  const out: ReviewActorSettings = {};
  if (actor.seat !== undefined) out.seat = actor.seat;
  if (actor.llm !== undefined) out.llm = actor.llm;
  return Object.keys(out).length > 0 ? out : undefined;
}

function definedReviewExecutionSettings(
  execution: ReviewExecutionSettingsInput | undefined,
): ReviewExecutionSettings | undefined {
  if (!execution) return undefined;
  const out: ReviewExecutionSettings = {};
  if (execution.mode !== undefined) out.mode = execution.mode;
  if (execution.executor !== undefined) out.executor = execution.executor;
  const teamlead = definedReviewActorSettings(execution.teamlead);
  const lens = definedReviewActorSettings(execution.lens);
  const synthesize = definedReviewActorSettings(execution.synthesize);
  if (teamlead) out.teamlead = teamlead;
  if (lens) out.lens = lens;
  if (synthesize) out.synthesize = synthesize;
  if (execution.deliberation !== undefined) {
    out.deliberation = execution.deliberation;
  }
  return Object.keys(out).length > 0 ? out : {};
}

function normalizeV1Settings(settings: V1Settings): OntoSettings {
  const mode = settings.review?.mode ?? settings.review_mode;
  const domains = settings.review?.domains ?? settings.domains;
  const context = definedReviewContext({
    excluded_names: settings.review?.context?.excluded_names ?? settings.excluded_names,
    max_listing_depth:
      settings.review?.context?.max_listing_depth ?? settings.max_listing_depth,
    max_listing_entries:
      settings.review?.context?.max_listing_entries ?? settings.max_listing_entries,
    max_embed_lines:
      settings.review?.context?.max_embed_lines ?? settings.max_embed_lines,
  });
  let review: ReviewSettings | undefined;
  if (settings.review || mode !== undefined || domains !== undefined || context) {
    review = {};
    const execution = definedReviewExecutionSettings(settings.review?.execution);
    if (execution) review.execution = execution;
    if (mode !== undefined) review.mode = mode;
    if (domains !== undefined) review.domains = domains;
    if (context) review.context = context;
  }
  return {
    schema_version: settings.schema_version ?? "settings.json/v1",
    ...(settings.llm ? { llm: settings.llm } : {}),
    ...(review ? { review } : {}),
    ...(mode !== undefined ? { review_mode: mode } : {}),
    ...(domains !== undefined ? { domains } : {}),
    ...(context?.excluded_names !== undefined
      ? { excluded_names: context.excluded_names }
      : {}),
    ...(context?.max_listing_depth !== undefined
      ? { max_listing_depth: context.max_listing_depth }
      : {}),
    ...(context?.max_listing_entries !== undefined
      ? { max_listing_entries: context.max_listing_entries }
      : {}),
    ...(context?.max_embed_lines !== undefined
      ? { max_embed_lines: context.max_embed_lines }
      : {}),
  };
}

function v2ActorSettings(
  actor: z.infer<typeof V2ReviewActorSettingsSchema>,
): ReviewActorSettings | undefined {
  const out: ReviewActorSettings = {};
  if (actor.seat !== undefined) out.seat = actor.seat;
  if (actor.llm !== undefined) out.llm = actor.llm;
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeV2Settings(settings: V2Settings): OntoSettings {
  const execution = settings.review?.execution;
  const mode = settings.review?.mode;
  const domains = settings.review?.domains;
  const context = settings.review?.context
    ? definedReviewContext(settings.review.context)
    : undefined;
  let review: ReviewSettings | undefined;
  if (settings.review) {
    review = {};
    if (execution) {
      const normalizedExecution: ReviewExecutionSettings = {};
      if (execution.topology !== undefined) {
        normalizedExecution.mode = execution.topology;
      }
      if (execution.executor !== undefined) {
        normalizedExecution.executor = execution.executor;
      }
      const teamlead = execution.actors?.teamlead
        ? v2ActorSettings(execution.actors.teamlead)
        : undefined;
      const lens = execution.actors?.lens
        ? v2ActorSettings(execution.actors.lens)
        : undefined;
      const synthesize = execution.actors?.synthesize
        ? v2ActorSettings(execution.actors.synthesize)
        : undefined;
      if (teamlead) normalizedExecution.teamlead = teamlead;
      if (lens) normalizedExecution.lens = lens;
      if (synthesize) normalizedExecution.synthesize = synthesize;
      if (execution.deliberation !== undefined) {
        normalizedExecution.deliberation = execution.deliberation;
      }
      review.execution = normalizedExecution;
    }
    if (mode !== undefined) review.mode = mode;
    if (domains !== undefined) review.domains = domains;
    if (context) review.context = context;
  }
  return {
    schema_version: "settings.json/v2",
    ...(settings.llm?.default ? { llm: settings.llm.default } : {}),
    ...(review ? { review } : {}),
    ...(mode !== undefined ? { review_mode: mode } : {}),
    ...(domains !== undefined ? { domains } : {}),
    ...(context?.excluded_names !== undefined
      ? { excluded_names: context.excluded_names }
      : {}),
    ...(context?.max_listing_depth !== undefined
      ? { max_listing_depth: context.max_listing_depth }
      : {}),
    ...(context?.max_listing_entries !== undefined
      ? { max_listing_entries: context.max_listing_entries }
      : {}),
    ...(context?.max_embed_lines !== undefined
      ? { max_embed_lines: context.max_embed_lines }
      : {}),
  };
}

function normalizeParsedSettings(settings: ParsedSettings): OntoSettings {
  return settings.schema_version === "settings.json/v2"
    ? normalizeV2Settings(settings)
    : normalizeV1Settings(settings);
}

async function readSettingsAt(filePath: string): Promise<OntoSettings> {
  if (!(await fileExists(filePath))) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new OntoSettingsValidationError({
      message: `Failed to parse settings JSON at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      settingsPath: filePath,
      reasonCode: "settings_json_parse_failed",
      details: {
        parse_error: error instanceof Error ? error.message : String(error),
      },
    });
  }
  const schema =
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as { schema_version?: unknown }).schema_version === "settings.json/v2"
      ? V2SettingsSchema
      : V1SettingsSchema;
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new OntoSettingsValidationError({
      message: [
        `Invalid onto settings at ${filePath}:`,
        ...result.error.issues.map((issue) => {
          const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          return `- ${where}: ${issue.message}`;
        }),
      ].join("\n"),
      settingsPath: filePath,
      reasonCode: "settings_schema_validation_failed",
      details: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      },
    });
  }
  return normalizeParsedSettings(result.data as ParsedSettings);
}

function mergeReviewActorSettings(
  defaultActor: ResolvedReviewActorSettings,
  userActor: ReviewActorSettings | undefined,
  projectActor: ReviewActorSettings | undefined,
): ResolvedReviewActorSettings {
  const userLlm = userActor?.llm ?? defaultActor.llm;
  const projectLlm = projectActor?.llm;
  const mergedLlm =
    userLlm !== "inherit" &&
    projectLlm !== undefined &&
    projectLlm !== "inherit"
      ? { ...userLlm, ...projectLlm }
      : projectLlm ?? userLlm;
  return {
    seat: projectActor?.seat ?? userActor?.seat ?? defaultActor.seat,
    llm: mergedLlm,
  };
}

function mergeReviewContextSettings(
  userContext: ReviewContextSettings | undefined,
  projectContext: ReviewContextSettings | undefined,
): ReviewContextSettings | undefined {
  const merged: ReviewContextSettings = {
    ...(userContext ?? {}),
    ...(projectContext ?? {}),
  };
  if (userContext?.excluded_names || projectContext?.excluded_names) {
    merged.excluded_names = [
      ...new Set([
        ...(userContext?.excluded_names ?? []),
        ...(projectContext?.excluded_names ?? []),
      ]),
    ];
  }
  return definedReviewContext(merged);
}

function contextFromSettings(settings: OntoSettings): ReviewContextSettings | undefined {
  return definedReviewContext({
    excluded_names: settings.review?.context?.excluded_names ?? settings.excluded_names,
    max_listing_depth:
      settings.review?.context?.max_listing_depth ?? settings.max_listing_depth,
    max_listing_entries:
      settings.review?.context?.max_listing_entries ?? settings.max_listing_entries,
    max_embed_lines:
      settings.review?.context?.max_embed_lines ?? settings.max_embed_lines,
  });
}

function resolveActorLlmForValidation(
  actorName: "teamlead" | "lens" | "synthesize",
  ref: ReviewLlmRef | undefined,
  inherited: LlmModelSwitcherConfig | undefined,
): LlmModelSwitcherConfig | undefined {
  if (!ref) return undefined;
  if (ref === "inherit") return inherited;
  const shouldOverlayInherited = ref.auth === undefined && ref.provider === undefined;
  const resolved = {
    ...(shouldOverlayInherited ? inherited ?? {} : {}),
    ...ref,
  };
  const selection = normalizeLlmModelSwitcher(resolved);
  if (!selection) {
    throw new Error(
      `review.execution.actors.${actorName}.llm must provide provider/auth fields or inherit from llm.default.`,
    );
  }
  return resolved;
}

function mergeSettings(
  user: OntoSettings,
  project: OntoSettings,
): OntoSettings {
  const llm =
    user.llm || project.llm ? { ...user.llm, ...project.llm } : undefined;
  const defaultExecution = defaultReviewExecution();
  const userExecution = user.review?.execution;
  const projectExecution = project.review?.execution;
  const hasExplicitExecution =
    user.review?.execution !== undefined || projectExecution !== undefined;
  const execution: ResolvedReviewExecutionSettings | undefined = hasExplicitExecution
    ? {
        mode:
          projectExecution?.mode ?? userExecution?.mode ?? defaultExecution.mode,
        executor:
          projectExecution?.executor ??
          userExecution?.executor ??
          defaultExecution.executor,
        teamlead: mergeReviewActorSettings(
          defaultExecution.teamlead,
          userExecution?.teamlead,
          projectExecution?.teamlead,
        ),
        lens: mergeReviewActorSettings(
          defaultExecution.lens,
          userExecution?.lens,
          projectExecution?.lens,
        ),
        synthesize: mergeReviewActorSettings(
          defaultExecution.synthesize,
          userExecution?.synthesize,
          projectExecution?.synthesize,
        ),
        deliberation:
          projectExecution?.deliberation ??
          userExecution?.deliberation ??
          defaultExecution.deliberation,
      }
    : undefined;
  const mode =
    project.review?.mode ??
    project.review_mode ??
    user.review?.mode ??
    user.review_mode;
  const domains =
    project.review?.domains ??
    project.domains ??
    user.review?.domains ??
    user.domains;
  const context = mergeReviewContextSettings(
    contextFromSettings(user),
    contextFromSettings(project),
  );
  const hasReview =
    user.review !== undefined ||
    project.review !== undefined ||
    mode !== undefined ||
    domains !== undefined ||
    context !== undefined;
  const review = hasReview
    ? {
        ...(mode !== undefined ? { mode } : {}),
        ...(domains !== undefined ? { domains } : {}),
        ...(context ? { context } : {}),
        ...(execution ? { execution } : {}),
      }
    : undefined;

  const merged: OntoSettings = {
    ...user,
    ...project,
    ...((project.schema_version ?? user.schema_version) !== undefined
      ? { schema_version: project.schema_version ?? user.schema_version }
      : {}),
    ...(llm ? { llm } : {}),
    ...(review ? { review } : {}),
    ...(mode !== undefined ? { review_mode: mode } : {}),
    ...(domains !== undefined ? { domains } : {}),
    ...(context?.excluded_names !== undefined
      ? { excluded_names: context.excluded_names }
      : {}),
    ...(context?.max_listing_depth !== undefined
      ? { max_listing_depth: context.max_listing_depth }
      : {}),
    ...(context?.max_listing_entries !== undefined
      ? { max_listing_entries: context.max_listing_entries }
      : {}),
    ...(context?.max_embed_lines !== undefined
      ? { max_embed_lines: context.max_embed_lines }
      : {}),
  };
  return merged;
}

export function defaultReviewExecution(): ResolvedReviewExecutionSettings {
  return {
    mode: DEFAULT_REVIEW_EXECUTION.mode,
    executor: DEFAULT_REVIEW_EXECUTION.executor,
    teamlead: { ...DEFAULT_REVIEW_EXECUTION.teamlead },
    lens: { ...DEFAULT_REVIEW_EXECUTION.lens },
    synthesize: { ...DEFAULT_REVIEW_EXECUTION.synthesize },
    deliberation: DEFAULT_REVIEW_EXECUTION.deliberation,
  };
}

function validateActorLlmRefs(settings: OntoSettings): void {
  const execution = settings.review?.execution;
  const refs: Array<["teamlead" | "lens" | "synthesize", ReviewLlmRef | undefined]> = [
    ["teamlead", execution?.teamlead?.llm],
    ["lens", execution?.lens?.llm],
    ["synthesize", execution?.synthesize?.llm],
  ];
  for (const [actorName, ref] of refs) {
    const resolved = resolveActorLlmForValidation(actorName, ref, settings.llm);
    if (resolved) normalizeLlmModelSwitcher(resolved);
  }
}

export async function resolveSettingsChain(
  _ontoHome: string,
  projectRoot: string,
): Promise<OntoSettings> {
  await assertNoUnsupportedConfigFiles(os.homedir());
  await assertNoUnsupportedConfigFiles(projectRoot);
  const user = await readSettingsAt(userSettingsPath());
  const project = await readSettingsAt(projectSettingsPath(projectRoot));
  const merged = mergeSettings(user, project);
  const result = NormalizedSettingsSchema.safeParse(merged);
  if (!result.success) {
    throw new OntoSettingsValidationError({
      message: [
        "Invalid merged onto settings:",
        ...result.error.issues.map((issue) => {
          const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          return `- ${where}: ${issue.message}`;
        }),
      ].join("\n"),
      reasonCode: "merged_settings_schema_validation_failed",
      details: {
        user_settings_path: userSettingsPath(),
        project_settings_path: projectSettingsPath(projectRoot),
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      },
    });
  }
  try {
    normalizeLlmModelSwitcher(merged.llm);
    validateActorLlmRefs(merged);
  } catch (error) {
    throw new OntoSettingsValidationError({
      message: error instanceof Error ? error.message : String(error),
      reasonCode: "settings_llm_route_validation_failed",
      details: {
        user_settings_path: userSettingsPath(),
        project_settings_path: projectSettingsPath(projectRoot),
        validation_error: error instanceof Error ? error.message : String(error),
      },
    });
  }
  return merged;
}
