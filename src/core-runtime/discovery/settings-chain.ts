import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { LlmModelSwitcherConfig } from "../llm/model-switcher.js";
import { fileExists } from "../review/review-artifact-utils.js";

const LlmAuthModeSchema = z.enum(["api_key", "oauth", "local"]);
const LlmProviderSchema = z.enum(["openai", "anthropic", "grok", "lmstudio"]);

const LlmSettingsSchema = z
  .object({
    auth: LlmAuthModeSchema.optional(),
    provider: LlmProviderSchema.optional(),
    model: z.string().min(1).optional(),
    base_url: z.string().min(1).optional(),
    effort: z.string().min(1).optional(),
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
    deliberation: ReviewDeliberationSchema.default(
      "controlled-lens-deliberation",
    ),
    max_concurrent_workers: z.number().int().positive().optional(),
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
  deliberation: ReviewDeliberation;
  max_concurrent_workers?: number;
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

export async function assertNoRetiredConfigFiles(
  root: string,
): Promise<void> {
  const retired = [];
  for (const filename of RETIRED_CONFIG_FILENAMES) {
    const candidate = path.join(root, ".onto", filename);
    if (await fileExists(candidate)) retired.push(candidate);
  }
  if (retired.length > 0) {
    throw new Error(
      [
        "Retired onto config file detected.",
        ...retired.map((filePath) => `- ${filePath}`),
        "",
        "Use .onto/settings.json for runtime settings. The retired YAML settings surface is not read.",
      ].join("\n"),
    );
  }
}

async function readSettingsAt(filePath: string): Promise<OntoSettings> {
  if (!(await fileExists(filePath))) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse settings JSON at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const result = SettingsSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      [
        `Invalid onto settings at ${filePath}:`,
        ...result.error.issues.map((issue) => {
          const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          return `- ${where}: ${issue.message}`;
        }),
      ].join("\n"),
    );
  }
  return result.data as OntoSettings;
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
              teamlead: {
                ...(((user.review?.execution) ?? defaultReviewExecution()).teamlead),
                ...(project.review?.execution?.teamlead ?? {}),
              },
              lens: {
                ...(((user.review?.execution) ?? defaultReviewExecution()).lens),
                ...(project.review?.execution?.lens ?? {}),
              },
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
    deliberation: DEFAULT_REVIEW_EXECUTION.deliberation,
  };
}

export async function resolveSettingsChain(
  _ontoHome: string,
  projectRoot: string,
): Promise<OntoSettings> {
  await assertNoRetiredConfigFiles(os.homedir());
  await assertNoRetiredConfigFiles(projectRoot);
  const user = await readSettingsAt(userSettingsPath());
  const project = await readSettingsAt(projectSettingsPath(projectRoot));
  return mergeSettings(user, project);
}

export async function resolveOrthogonalSettingsChain(
  ontoHome: string,
  projectRoot: string,
): Promise<Partial<OntoSettings>> {
  return resolveSettingsChain(ontoHome, projectRoot);
}
