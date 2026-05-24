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
const ReviewDeliberationSchema = z.enum(["controlled-lens-deliberation"]);

const DEFAULT_REVIEW_EXECUTION = {
  mode: "main-workers",
  teamlead: { seat: "main", llm: "inherit" },
  lens: { seat: "worker", llm: "inherit" },
  synthesize: { seat: "worker", llm: "inherit" },
  deliberation: "controlled-lens-deliberation",
} as const;

const ReviewActorSettingsSchema = z
  .object({
    seat: ReviewWorkerSeatSchema,
    llm: LlmRefSchema.default("inherit"),
  })
  .strict();

const ReviewExecutionSettingsSchema = z
  .object({
    mode: ReviewExecutionModeSchema.default("main-workers"),
    teamlead: ReviewActorSettingsSchema.default({
      seat: "main",
      llm: "inherit",
    }),
    lens: ReviewActorSettingsSchema.default({
      seat: "worker",
      llm: "inherit",
    }),
    synthesize: ReviewActorSettingsSchema.default({
      seat: "worker",
      llm: "inherit",
    }),
    deliberation: ReviewDeliberationSchema.default(
      "controlled-lens-deliberation",
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "main-workers" && value.teamlead.seat !== "main") {
      ctx.addIssue({
        code: "custom",
        path: ["teamlead", "seat"],
        message: "main-workers requires review.execution.teamlead.seat=main.",
      });
    }
    if (value.mode === "main-workers" && value.lens.seat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["lens", "seat"],
        message: "main-workers requires review.execution.lens.seat=worker.",
      });
    }
    if (value.mode === "nested-workers" && value.teamlead.seat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["teamlead", "seat"],
        message: "nested-workers requires review.execution.teamlead.seat=worker.",
      });
    }
    if (value.mode === "nested-workers" && value.lens.seat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["lens", "seat"],
        message: "nested-workers requires review.execution.lens.seat=worker.",
      });
    }
    if (value.synthesize.seat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["synthesize", "seat"],
        message: "review.execution.synthesize.seat must be worker.",
      });
    }
  });

const ReviewSettingsSchema = z
  .object({
    execution: ReviewExecutionSettingsSchema.default(DEFAULT_REVIEW_EXECUTION),
  })
  .strict();

const SettingsSchema = z
  .object({
    llm: LlmSettingsSchema.optional(),
    review: ReviewSettingsSchema.optional(),
    review_mode: z.enum(["core-axis", "full"]).optional(),
    domains: z.array(z.string().min(1)).optional(),
    excluded_names: z.array(z.string().min(1)).optional(),
    max_listing_depth: z.union([z.number(), z.string()]).optional(),
    max_listing_entries: z.union([z.number(), z.string()]).optional(),
    max_embed_lines: z.union([z.number(), z.string()]).optional(),
    output_language: z.string().min(1).optional(),
    learning_extract_mode: z.enum(["disabled", "shadow", "active"]).optional(),
  })
  .strict();

export type ReviewExecutionMode = z.infer<typeof ReviewExecutionModeSchema>;
export type ReviewWorkerSeat = z.infer<typeof ReviewWorkerSeatSchema>;
export type ReviewDeliberation = z.infer<typeof ReviewDeliberationSchema>;

export type ReviewLlmRef = "inherit" | LlmModelSwitcherConfig;

export interface ReviewActorSettings {
  seat: ReviewWorkerSeat;
  llm: ReviewLlmRef;
}

export interface ReviewExecutionSettings {
  mode: ReviewExecutionMode;
  teamlead: ReviewActorSettings;
  lens: ReviewActorSettings;
  synthesize: ReviewActorSettings;
  deliberation: ReviewDeliberation;
}

export interface ReviewSettings {
  execution: ReviewExecutionSettings;
}

export interface OntoSettings {
  llm?: LlmModelSwitcherConfig;
  review?: ReviewSettings;
  review_mode?: "core-axis" | "full";
  domains?: string[];
  excluded_names?: string[];
  max_listing_depth?: number | string;
  max_listing_entries?: number | string;
  max_embed_lines?: number | string;
  output_language?: string;
  learning_extract_mode?: "disabled" | "shadow" | "active";
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
  const result = SettingsSchema.safeParse(parsed);
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
  return result.data as OntoSettings;
}

function mergeReviewActorSettings(
  userActor: ReviewActorSettings,
  projectActor: Partial<ReviewActorSettings> | undefined,
): ReviewActorSettings {
  const userLlm = userActor.llm;
  const projectLlm = projectActor?.llm;
  const mergedLlm =
    userLlm !== "inherit" &&
    projectLlm !== undefined &&
    projectLlm !== "inherit"
      ? { ...userLlm, ...projectLlm }
      : projectLlm ?? userLlm;
  return {
    ...userActor,
    ...(projectActor ?? {}),
    llm: mergedLlm,
  };
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
      `review.execution.${actorName}.llm must provide llm.provider or inherit from root llm.`,
    );
  }
  return resolved;
}

function mergeSettings(
  user: OntoSettings,
  project: OntoSettings,
): OntoSettings {
  return {
    ...user,
    ...project,
    ...(user.llm || project.llm ? { llm: { ...user.llm, ...project.llm } } : {}),
    ...(user.review || project.review
      ? {
          review: {
            ...(user.review ?? { execution: defaultReviewExecution() }),
            ...(project.review ?? {}),
            execution: {
              ...((user.review?.execution) ?? defaultReviewExecution()),
              ...(project.review?.execution ?? {}),
              teamlead: mergeReviewActorSettings(
                ((user.review?.execution) ?? defaultReviewExecution()).teamlead,
                project.review?.execution?.teamlead,
              ),
              lens: mergeReviewActorSettings(
                ((user.review?.execution) ?? defaultReviewExecution()).lens,
                project.review?.execution?.lens,
              ),
              synthesize: mergeReviewActorSettings(
                ((user.review?.execution) ?? defaultReviewExecution()).synthesize,
                project.review?.execution?.synthesize,
              ),
            },
          },
        }
      : {}),
    ...(user.excluded_names || project.excluded_names
      ? {
          excluded_names: [
            ...new Set([
              ...(user.excluded_names ?? []),
              ...(project.excluded_names ?? []),
            ]),
          ],
        }
      : {}),
  };
}

export function defaultReviewExecution(): ReviewExecutionSettings {
  return {
    mode: DEFAULT_REVIEW_EXECUTION.mode,
    teamlead: { ...DEFAULT_REVIEW_EXECUTION.teamlead },
    lens: { ...DEFAULT_REVIEW_EXECUTION.lens },
    synthesize: { ...DEFAULT_REVIEW_EXECUTION.synthesize },
    deliberation: DEFAULT_REVIEW_EXECUTION.deliberation,
  };
}

function validateActorLlmRefs(settings: OntoSettings): void {
  const execution = settings.review?.execution;
  const refs: Array<["teamlead" | "lens" | "synthesize", ReviewLlmRef | undefined]> = [
    ["teamlead", execution?.teamlead.llm],
    ["lens", execution?.lens.llm],
    ["synthesize", execution?.synthesize.llm],
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
  const result = SettingsSchema.safeParse(merged);
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

export async function resolveOrthogonalSettingsChain(
  ontoHome: string,
  projectRoot: string,
): Promise<Partial<OntoSettings>> {
  return resolveSettingsChain(ontoHome, projectRoot);
}
