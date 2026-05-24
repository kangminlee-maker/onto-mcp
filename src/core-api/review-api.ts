import type {
  InvocationBindingArtifact,
  InvocationInterpretationArtifact,
  ReviewExecutionPlan,
  ReviewMode,
  ReviewRecord,
  ReviewStructuredFailureRecord,
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
import {
  buildReviewRouteVisibilityFromSession,
  type ReviewRouteVisibility,
} from "../core-runtime/review/route-visibility.js";
import { reviewPrepareOnly, runReviewInvokeCli } from "../core-runtime/cli/review-invoke.js";

export interface PrepareReviewRequest {
  projectRoot: string;
  target: string;
  intent: string;
  domain?: string;
  noDomain?: boolean;
  reviewMode?: ReviewMode;
  lensIds?: string[];
  confirmValueAlignment?: boolean;
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
  routeVisibility?: ReviewRouteVisibility | null;
  llmPresentation: LlmPresentationPrompts;
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
  reviewRunManifestPath: string;
  deliberationStatus?: string | null;
  participatingLensIds: string[];
  degradedLensIds: string[];
  summary?: unknown;
  resultOverview?: unknown;
  artifactRefs?: Record<string, string>;
  failureRefs?: string[];
  routeVisibility?: ReviewRouteVisibility | null;
  startPreview?: {
    entrypointPlan?: unknown;
    routeSummary?: unknown;
    boundedInvokeSteps?: string[];
  };
  llmPresentation?: LlmPresentationPrompts;
}

export interface LlmPresentationPrompt {
  prompt: string;
  input: unknown;
}

export interface LlmPresentationPrompts {
  openingBrief?: LlmPresentationPrompt;
  finalResult?: LlmPresentationPrompt;
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
  failureRefs: string[];
  structuredFailures: ReviewStructuredFailureRecord[];
  routeVisibility?: ReviewRouteVisibility | null;
}

export interface ReviewResult {
  sessionId: string;
  sessionRoot: string;
  reviewRecord: ReviewRecord;
  finalOutputPath: string;
  reviewRunManifestPath: string;
  finalOutputText?: string;
  artifactRefs: Record<string, string>;
  failureRefs: string[];
  routeVisibility?: ReviewRouteVisibility | null;
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
  if (request.executorRealization) {
    result.push("--executor-realization", request.executorRealization);
  }
  for (const lensId of request.lensIds ?? []) {
    result.push("--lens-id", lensId);
  }
  if (request.confirmValueAlignment) {
    result.push("--confirm-value-alignment");
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

function buildOpeningBriefPresentation(input: unknown): LlmPresentationPrompt {
  return {
    prompt: [
      "Explain this onto review opening brief to the user before execution.",
      "Use only the provided input facts. Do not infer or invent target scope, boundary, domain, lens set, model, provider, or execution mode.",
      "Cover: what is being reviewed, why, filesystem boundary, selected domain, review mode and lens set, execution path, model/provider settings, and where the user can change configuration.",
      "Keep it structured and concise. Use the user's conversation language.",
    ].join("\n"),
    input,
  };
}

function buildFinalResultPresentation(input: unknown): LlmPresentationPrompt {
  return {
    prompt: [
      "Explain this onto review result to the user after execution.",
      "Use only the provided input facts and referenced final result fields. Do not invent new findings or silently resolve unresolved disagreement.",
      "Cover: outcome, deliberation status, coverage, final review result, issue count/classification, top problem definitions, and primary artifacts.",
      "Make the result comprehensive enough for the user to understand what to do next, but keep operational detail bounded. Use the user's conversation language.",
    ].join("\n"),
    input,
  };
}

async function buildPreparedOpeningBriefInput(
  sessionRoot: string,
  executionPlan: ReviewExecutionPlan,
): Promise<unknown> {
  const interpretation = await readOptionalYaml<InvocationInterpretationArtifact>(
    path.join(sessionRoot, "interpretation.yaml"),
  );
  const binding = await readOptionalYaml<InvocationBindingArtifact>(
    path.join(sessionRoot, "binding.yaml"),
  );

  return {
    session_id: executionPlan.session_id,
    session_root: sessionRoot,
    interpretation: interpretation
      ? {
          entrypoint: interpretation.entrypoint,
          target_scope_candidate: interpretation.target_scope_candidate,
          intent_summary: interpretation.intent_summary,
          domain_recommendation: interpretation.domain_recommendation,
          domain_selection_required: interpretation.domain_selection_required,
          review_mode_recommendation: interpretation.review_mode_recommendation,
          lens_selection_plan: interpretation.lens_selection_plan,
          ambiguity_notes: interpretation.ambiguity_notes,
        }
      : null,
    binding: binding
      ? {
          resolved_target_scope: binding.resolved_target_scope,
          resolved_session_domain: binding.resolved_session_domain,
          resolved_review_mode: binding.resolved_review_mode,
          resolved_lens_set: binding.resolved_lens_set,
          resolved_execution_realization: binding.resolved_execution_realization,
          resolved_host_runtime: binding.resolved_host_runtime,
          boundary_policy: binding.boundary_policy,
          effective_boundary_state: binding.effective_boundary_state,
        }
      : null,
    execution_plan: {
      review_mode: executionPlan.review_mode,
      execution_realization: executionPlan.execution_realization,
      host_runtime: executionPlan.host_runtime,
      lens_ids: executionPlan.lens_execution_seats.map((seat) => seat.lens_id),
      prompt_packets_root: executionPlan.prompt_packets_root,
      review_run_manifest_path: path.join(sessionRoot, "review-run-manifest.yaml"),
    },
  };
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
    review_run_manifest_path?: string;
    record_status: "completed" | "completed_with_degradation" | "halted_partial" | null;
    deliberation_status?: string | null;
    participating_lens_ids?: string[];
    degraded_lens_ids?: string[];
    summary?: unknown;
  };
  result_overview?: unknown;
  entrypoint_plan?: unknown;
  route_summary?: unknown;
  bounded_invoke_steps?: string[];
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
    actor_invocation_profiles: path.join(
      sessionRoot,
      "execution-preparation",
      "actor-invocation-profiles.yaml",
    ),
    actor_consumer_bindings: path.join(
      sessionRoot,
      "execution-preparation",
      "actor-consumer-bindings.yaml",
    ),
    domain_binding: path.join(
      sessionRoot,
      "execution-preparation",
      "domain-binding.yaml",
    ),
    review_value_alignment_criteria: path.join(
      sessionRoot,
      "execution-preparation",
      "review-value-alignment-criteria.yaml",
    ),
    review_context_manifest: path.join(
      sessionRoot,
      "execution-preparation",
      "review-context-manifest.yaml",
    ),
    lens_completion_barrier: path.join(
      sessionRoot,
      "lens-completion-barrier.yaml",
    ),
    review_run_manifest: path.join(sessionRoot, "review-run-manifest.yaml"),
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

async function collectStructuredFailures(sessionRoot: string): Promise<{
  failureRefs: string[];
  structuredFailures: ReviewStructuredFailureRecord[];
}> {
  const failuresRoot = path.join(sessionRoot, "failures");
  let filenames: string[];
  try {
    filenames = await fs.readdir(failuresRoot);
  } catch {
    return { failureRefs: [], structuredFailures: [] };
  }
  const failureRefs = filenames
    .filter((filename) => filename.endsWith(".yaml"))
    .map((filename) => path.join(failuresRoot, filename))
    .sort();
  const structuredFailures: ReviewStructuredFailureRecord[] = [];
  for (const failureRef of failureRefs) {
    structuredFailures.push(
      await readYamlDocument<ReviewStructuredFailureRecord>(failureRef),
    );
  }
  return { failureRefs, structuredFailures };
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
      const openingBriefInput =
        await buildPreparedOpeningBriefInput(sessionRoot, executionPlan);
      return {
        sessionId: executionPlan.session_id,
        sessionRoot,
        executionPlan,
        routeVisibility: await buildReviewRouteVisibilityFromSession(sessionRoot),
        llmPresentation: {
          openingBrief: buildOpeningBriefPresentation(openingBriefInput),
        },
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
      const startPreview: ReviewRunResult["startPreview"] = {
        entrypointPlan: parsed.entrypoint_plan,
        routeSummary: parsed.route_summary,
        ...(parsed.bounded_invoke_steps !== undefined
          ? { boundedInvokeSteps: parsed.bounded_invoke_steps }
          : {}),
      };
      const finalResultInput = {
        result_overview: parsed.result_overview ?? null,
        review_result: result,
      };
      return {
        sessionId: basenameSessionId(result.session_root),
        sessionRoot: path.resolve(result.session_root),
        status,
        finalOutputPath: result.final_output_path,
        reviewRecordPath: result.review_record_path,
        executionResultPath: result.execution_result_path,
        reviewRunManifestPath:
          result.review_run_manifest_path ??
          path.join(path.resolve(result.session_root), "review-run-manifest.yaml"),
        deliberationStatus: result.deliberation_status ?? null,
        participatingLensIds: result.participating_lens_ids ?? [],
        degradedLensIds: result.degraded_lens_ids ?? [],
        ...(result.summary !== undefined ? { summary: result.summary } : {}),
        ...(parsed.result_overview !== undefined
          ? { resultOverview: parsed.result_overview }
          : {}),
        artifactRefs: await collectArtifactRefs(path.resolve(result.session_root)),
        ...(await collectStructuredFailures(path.resolve(result.session_root))),
        routeVisibility: await buildReviewRouteVisibilityFromSession(
          path.resolve(result.session_root),
        ),
        startPreview,
        llmPresentation: {
          openingBrief: buildOpeningBriefPresentation(startPreview),
          finalResult: buildFinalResultPresentation(finalResultInput),
        },
      };
    },

    async getReviewStatus(sessionRoot: string): Promise<ReviewStatus> {
      const resolvedSessionRoot = path.resolve(sessionRoot);
      const artifactRefs = await collectArtifactRefs(resolvedSessionRoot);
      const failures = await collectStructuredFailures(resolvedSessionRoot);
      const reviewRecord = await readOptionalYaml<ReviewRecord>(
        path.join(resolvedSessionRoot, "review-record.yaml"),
      );
      if (reviewRecord) {
        return {
          sessionId: reviewRecord.session_id,
          sessionRoot: resolvedSessionRoot,
          status: reviewRecord.record_status,
          artifactRefs,
          ...failures,
          routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
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
          ...failures,
          routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
        };
      }

      if (await fileExists(path.join(resolvedSessionRoot, "execution-plan.yaml"))) {
        return {
          sessionId: basenameSessionId(resolvedSessionRoot),
          sessionRoot: resolvedSessionRoot,
          status: executionResult ? "running" : "prepared",
          artifactRefs,
          ...failures,
          routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
        };
      }

      return {
        sessionId: basenameSessionId(resolvedSessionRoot),
        sessionRoot: resolvedSessionRoot,
        status: "unknown",
        artifactRefs,
        ...failures,
        routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
      };
    },

    async getReviewResult(sessionRoot: string): Promise<ReviewResult> {
      const resolvedSessionRoot = path.resolve(sessionRoot);
      const artifactRefs = await collectArtifactRefs(resolvedSessionRoot);
      const { failureRefs } = await collectStructuredFailures(resolvedSessionRoot);
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
        reviewRunManifestPath: path.join(resolvedSessionRoot, "review-run-manifest.yaml"),
        artifactRefs,
        failureRefs,
        routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
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
