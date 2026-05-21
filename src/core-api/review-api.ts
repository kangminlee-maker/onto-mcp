import type {
  ReviewExecutionPlan,
  ReviewMode,
  ReviewRecord,
} from "../core-runtime/review/artifact-types.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveOntoHome } from "../core-runtime/discovery/onto-home.js";
import { loadCoreLensRegistry } from "../core-runtime/discovery/lens-registry.js";
import {
  fileExists,
  readYamlDocument,
} from "../core-runtime/review/review-artifact-utils.js";
import { reviewPrepareOnly, runReviewInvokeCli } from "../core-runtime/cli/review-invoke.js";

export interface PrepareReviewRequest {
  projectRoot: string;
  target: string;
  intent: string;
  domain?: string;
  noDomain?: boolean;
  reviewMode?: ReviewMode;
  lensIds?: string[];
  maxConcurrentLenses?: number;
  /**
   * Debug/testing escape hatch. Normal MCP callers should let project config
   * choose the provider so the tool remains model/host independent.
   */
  executorRealization?: "codex" | "mock" | "ts_inline_http";
}

export interface PreparedReview {
  sessionId: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
}

export interface RunReviewRequest extends PrepareReviewRequest {
  providerId?: string;
}

export interface ReviewRunResult {
  sessionId: string;
  sessionRoot: string;
  status: "completed" | "completed_with_degradation" | "halted_partial";
  finalOutputPath: string;
  reviewRecordPath: string;
  executionResultPath: string;
  deliberationStatus?: string | null;
  participatingLensIds: string[];
  degradedLensIds: string[];
}

export interface ReviewStatus {
  sessionId: string;
  sessionRoot: string;
  status:
    | "prepared"
    | "running"
    | "completed"
    | "completed_with_degradation"
    | "halted_partial"
    | "failed"
    | "unknown";
  artifactRefs: Record<string, string>;
}

export interface ReviewResult {
  sessionId: string;
  sessionRoot: string;
  reviewRecord: ReviewRecord;
  finalOutputPath: string;
  finalOutputText?: string;
}

export interface OntoReviewCoreApi {
  prepareReview(request: PrepareReviewRequest): Promise<PreparedReview>;
  runReview(request: RunReviewRequest): Promise<ReviewRunResult>;
  getReviewStatus(sessionRoot: string): Promise<ReviewStatus>;
  getReviewResult(sessionRoot: string): Promise<ReviewResult>;
  listLenses(): Promise<{ full: string[]; coreAxis: string[] }>;
  listDomains(projectRoot?: string): Promise<string[]>;
}

export interface OntoReviewCoreApiOptions {
  ontoHome?: string;
}

type ConsoleMethod = (...args: unknown[]) => void;

interface CapturedConsoleResult<T> {
  result: T;
  stdout: string[];
  stderr: string[];
}

function stringifyConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.stack ?? arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

async function withCapturedConsole<T>(
  action: () => Promise<T>,
): Promise<CapturedConsoleResult<T>> {
  const originalLog: ConsoleMethod = console.log;
  const originalWarn: ConsoleMethod = console.warn;
  const originalError: ConsoleMethod = console.error;
  const stdout: string[] = [];
  const stderr: string[] = [];

  console.log = (...args: unknown[]) => {
    stdout.push(stringifyConsoleArgs(args));
  };
  console.warn = (...args: unknown[]) => {
    stderr.push(stringifyConsoleArgs(args));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(stringifyConsoleArgs(args));
  };

  try {
    const result = await action();
    return { result, stdout, stderr };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function resolveRequiredOntoHome(explicit?: string): string {
  return resolveOntoHome(explicit);
}

function appendCommonReviewArgs(
  args: string[],
  request: PrepareReviewRequest,
  ontoHome: string,
): string[] {
  const result = [
    ...args,
    request.target,
    request.intent,
    "--project-root",
    path.resolve(request.projectRoot),
  ];

  result.push("--onto-home", ontoHome);
  if (request.domain && request.noDomain) {
    throw new Error("Use either domain or noDomain, not both.");
  }
  if (request.domain) {
    result.push("--domain", request.domain);
  }
  if (request.noDomain) {
    result.push("--no-domain");
  }
  if (request.reviewMode) {
    result.push("--review-mode", request.reviewMode);
  }
  if (request.maxConcurrentLenses !== undefined) {
    result.push("--max-concurrent-lenses", String(request.maxConcurrentLenses));
  }
  if (request.executorRealization) {
    result.push("--executor-realization", request.executorRealization);
  }
  for (const lensId of request.lensIds ?? []) {
    result.push("--lens-id", lensId);
  }
  return result;
}

function basenameSessionId(sessionRoot: string): string {
  return path.basename(path.resolve(sessionRoot));
}

async function readOptionalYaml<T>(filePath: string): Promise<T | null> {
  if (!(await fileExists(filePath))) return null;
  return readYamlDocument<T>(filePath);
}

async function readOptionalText(filePath: string): Promise<string | undefined> {
  if (!(await fileExists(filePath))) return undefined;
  return fs.readFile(filePath, "utf8");
}

function parseReviewInvokeOutput(stdout: string[]): unknown {
  for (const line of [...stdout].reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      // Keep looking: progress messages are not JSON.
    }
  }
  throw new Error("review invocation completed without a structured JSON result.");
}

function isReviewInvokeShape(value: unknown): value is {
  review_result: {
    session_root: string;
    final_output_path: string;
    review_record_path: string;
    execution_result_path: string;
    record_status: "completed" | "completed_with_degradation" | "halted_partial" | null;
    deliberation_status?: string | null;
    participating_lens_ids?: string[];
    degraded_lens_ids?: string[];
  };
} {
  if (value === null || typeof value !== "object") return false;
  const reviewResult = (value as { review_result?: unknown }).review_result;
  return reviewResult !== null && typeof reviewResult === "object";
}

async function collectArtifactRefs(sessionRoot: string): Promise<Record<string, string>> {
  const candidates: Record<string, string> = {
    session_metadata: path.join(sessionRoot, "session-metadata.yaml"),
    interpretation: path.join(sessionRoot, "interpretation.yaml"),
    binding: path.join(sessionRoot, "binding.yaml"),
    execution_plan: path.join(sessionRoot, "execution-plan.yaml"),
    execution_result: path.join(sessionRoot, "execution-result.yaml"),
    error_log: path.join(sessionRoot, "error-log.md"),
    final_output: path.join(sessionRoot, "final-output.md"),
    review_record: path.join(sessionRoot, "review-record.yaml"),
  };
  const entries: [string, string][] = [];
  for (const [key, filePath] of Object.entries(candidates)) {
    if (await fileExists(filePath)) entries.push([key, filePath]);
  }
  return Object.fromEntries(entries);
}

async function listDomainDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function createOntoReviewCoreApi(
  options: OntoReviewCoreApiOptions = {},
): OntoReviewCoreApi {
  const ontoHome = resolveRequiredOntoHome(options.ontoHome);

  return {
    async prepareReview(request: PrepareReviewRequest): Promise<PreparedReview> {
      const argv = appendCommonReviewArgs([], request, ontoHome);
      const { result } = await withCapturedConsole(() => reviewPrepareOnly(argv));
      const sessionRoot = path.resolve(result.session_root);
      const executionPlan = await readYamlDocument<ReviewExecutionPlan>(
        path.join(sessionRoot, "execution-plan.yaml"),
      );
      return {
        sessionId: executionPlan.session_id,
        sessionRoot,
        executionPlan,
      };
    },

    async runReview(request: RunReviewRequest): Promise<ReviewRunResult> {
      const argv = appendCommonReviewArgs(["--no-watch"], request, ontoHome);
      const captured = await withCapturedConsole(async () => {
        const exitCode = await runReviewInvokeCli(argv);
        if (exitCode !== 0) {
          throw new Error(`review invocation failed with exit code ${exitCode}`);
        }
        return exitCode;
      });
      const parsed = parseReviewInvokeOutput(captured.stdout);
      if (!isReviewInvokeShape(parsed)) {
        throw new Error("review invocation returned an unexpected result shape.");
      }
      const result = parsed.review_result;
      const status = result.record_status ?? "halted_partial";
      return {
        sessionId: basenameSessionId(result.session_root),
        sessionRoot: path.resolve(result.session_root),
        status,
        finalOutputPath: result.final_output_path,
        reviewRecordPath: result.review_record_path,
        executionResultPath: result.execution_result_path,
        deliberationStatus: result.deliberation_status ?? null,
        participatingLensIds: result.participating_lens_ids ?? [],
        degradedLensIds: result.degraded_lens_ids ?? [],
      };
    },

    async getReviewStatus(sessionRoot: string): Promise<ReviewStatus> {
      const resolvedSessionRoot = path.resolve(sessionRoot);
      const artifactRefs = await collectArtifactRefs(resolvedSessionRoot);
      const reviewRecord = await readOptionalYaml<ReviewRecord>(
        path.join(resolvedSessionRoot, "review-record.yaml"),
      );
      if (reviewRecord) {
        return {
          sessionId: reviewRecord.session_id,
          sessionRoot: resolvedSessionRoot,
          status: reviewRecord.record_status,
          artifactRefs,
        };
      }

      const executionResult = await readOptionalYaml<{ execution_status?: ReviewStatus["status"] }>(
        path.join(resolvedSessionRoot, "execution-result.yaml"),
      );
      if (executionResult?.execution_status === "halted_partial") {
        return {
          sessionId: basenameSessionId(resolvedSessionRoot),
          sessionRoot: resolvedSessionRoot,
          status: "halted_partial",
          artifactRefs,
        };
      }

      if (await fileExists(path.join(resolvedSessionRoot, "execution-plan.yaml"))) {
        return {
          sessionId: basenameSessionId(resolvedSessionRoot),
          sessionRoot: resolvedSessionRoot,
          status: executionResult ? "running" : "prepared",
          artifactRefs,
        };
      }

      return {
        sessionId: basenameSessionId(resolvedSessionRoot),
        sessionRoot: resolvedSessionRoot,
        status: "unknown",
        artifactRefs,
      };
    },

    async getReviewResult(sessionRoot: string): Promise<ReviewResult> {
      const resolvedSessionRoot = path.resolve(sessionRoot);
      const reviewRecordPath = path.join(resolvedSessionRoot, "review-record.yaml");
      const reviewRecord = await readYamlDocument<ReviewRecord>(reviewRecordPath);
      const finalOutputPath =
        reviewRecord.final_output_ref ?? path.join(resolvedSessionRoot, "final-output.md");
      const finalOutputText = await readOptionalText(finalOutputPath);
      return {
        sessionId: reviewRecord.session_id,
        sessionRoot: resolvedSessionRoot,
        reviewRecord,
        finalOutputPath,
        ...(finalOutputText !== undefined ? { finalOutputText } : {}),
      };
    },

    async listLenses(): Promise<{ full: string[]; coreAxis: string[] }> {
      const registry = loadCoreLensRegistry();
      return {
        full: registry.full_review_lens_ids,
        coreAxis: registry.core_axis_lens_ids,
      };
    },

    async listDomains(projectRoot?: string): Promise<string[]> {
      const roots = [
        ...(projectRoot ? [path.join(path.resolve(projectRoot), ".onto", "domains")] : []),
        path.join(os.homedir(), ".onto", "domains"),
        ...(ontoHome ? [path.join(ontoHome, ".onto", "domains")] : []),
      ];
      const names = new Set<string>();
      for (const root of roots) {
        for (const name of await listDomainDirs(root)) {
          names.add(name);
        }
      }
      return [...names].sort();
    },
  };
}
