#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { completeReviewSession } from "./complete-review-session.js";
import {
  ensureProviderRouteReadyForDispatch,
  inferExecutorRealization,
  readOptionalReviewSummary,
  readReviewResultClosureSummary,
  readReviewResultExplanationSummary,
  resolveExecutorConfig,
  resolveReviewInvokeSetup,
  concurrencyStrategyFor,
  renderReviewResultOverview,
  renderReviewStartPreview,
  requireString,
  type ResolvedExecutionProfile,
  type ReviewInvokeRouteSummary,
} from "./review-invoke.js";
import { executeReviewPromptExecution } from "./run-review-prompt-execution.js";
import { startReviewSession } from "./start-review-session.js";
import { spawnWatcherPane } from "./spawn-watcher.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";
import {
  buildReviewExecutionRoute,
  buildReviewRuntimeRouteArtifactProjection,
} from "../review/review-execution-route.js";
import type {
  PrepareOnlyResult,
  ReviewMode,
  ReviewTargetScopeKind,
} from "../review/artifact-types.js";
import type {
  LlmExecutionAdapter,
  LlmExecutionRoute,
} from "../llm/model-switcher.js";
import {
  fileExists,
  normalizeDomainValue,
  hasOptionFlag,
  readSingleOptionValueFromArgv,
} from "../review/review-artifact-utils.js";

export type ReviewExecutorRealization = "codex" | "ts_inline_http" | "claude_code";

export interface ReviewInvocationRequest {
  projectRoot: string;
  target: string;
  intent: string;
  targetScopeKind?: ReviewTargetScopeKind;
  primaryRef?: string;
  memberRefs?: string[];
  bundleKind?: string;
  diffRange?: string;
  domain?: string;
  noDomain?: boolean;
  reviewMode?: ReviewMode;
  lensIds?: string[];
  confirmValueAlignment?: boolean;
  executionRoute?: LlmExecutionRoute;
  /** Disambiguates external_oauth_worker into codex_cli vs claude_code. */
  executionAdapter?: LlmExecutionAdapter;
  /** Debug-only legacy executor override. Prefer executionRoute. */
  executorRealization?: ReviewExecutorRealization;
}

export interface ReviewInvocationArgvOptions {
  ontoHome: string;
}

export type ReviewInvocationArtifactRefs = Record<string, string>;

export type ReviewInvocationProgressPhase =
  | "resolve"
  | "prepare"
  | "execute"
  | "complete"
  | "project";

export interface ReviewInvocationProgressEvent {
  version: 1;
  eventKind: "phase" | "artifact" | "failure";
  phase: ReviewInvocationProgressPhase;
  status: "started" | "completed" | "failed";
  sessionId: string | null;
  sessionRoot: string | null;
  message: string;
  artifactRef?: string;
  failure?: {
    message: string;
    retrySafety: "safe" | "unsafe" | "unknown";
  };
}

export type ReviewInvocationProgressObserver = (
  event: ReviewInvocationProgressEvent,
) => void | Promise<void>;

export interface ReviewInvocationCliOutput {
  summary?: unknown;
  review_result: {
    session_root: string;
    final_output_path: string;
    review_record_path: string;
    execution_result_path: string;
    review_run_manifest_path?: string;
    record_status: "completed" | "completed_with_degradation" | "halted_partial" | null;
    deliberation_status?: string | null;
    halt_reason?: string | null;
    halt_phase?: string | null;
    halt_unit_id?: string | null;
    halt_unit_kind?: string | null;
    halt_lens_id?: string | null;
    participating_lens_ids?: string[];
    degraded_lens_ids?: string[];
    summary?: unknown;
  };
  result_overview?: unknown;
  entrypoint_plan?: unknown;
  route_summary?: unknown;
  artifacts?: Record<string, string>;
  bounded_invoke_steps?: string[];
  completion?: unknown;
}

type ReviewInvocationRecordStatus =
  | "completed"
  | "completed_with_degradation"
  | "halted_partial"
  | null;

export interface RunReviewInvocationOptions {
  ontoHome: string;
  noWatch?: boolean;
  progressObserver?: ReviewInvocationProgressObserver;
}

export interface RunReviewInvocationResult {
  output: ReviewInvocationCliOutput;
  stdout: string[];
  stderr: string[];
}

export interface ReviewInvocationEquivalenceProjection {
  recordStatus: ReviewInvocationRecordStatus;
  deliberationStatus: string | null;
  domainFinalValue: string | null;
  domainSelectionMode: string | null;
  reviewMode: string | null;
  routeSummary: unknown;
  boundedInvokeSteps: string[];
  artifactKeys: string[];
  participatingLensIds: string[];
  degradedLensIds: string[];
}

export function appendReviewInvocationRequestArgs(
  args: string[],
  request: ReviewInvocationRequest,
  options: ReviewInvocationArgvOptions,
): string[] {
  if (request.domain && request.noDomain) {
    throw new Error("Use either domain or noDomain, not both.");
  }

  const result = [
    ...args,
    request.target,
    request.intent,
    "--project-root",
    path.resolve(request.projectRoot),
    "--onto-home",
    options.ontoHome,
  ];

  if (request.domain) {
    result.push("--domain", normalizeDomainValue(request.domain));
    result.push("--requested-domain-token", request.domain);
  }
  if (request.noDomain) {
    result.push("--no-domain");
  }
  if (request.reviewMode) {
    result.push("--review-mode", request.reviewMode);
  }
  if (request.targetScopeKind) {
    result.push("--target-scope-kind", request.targetScopeKind);
  }
  if (request.primaryRef) {
    result.push("--primary-ref", request.primaryRef);
  }
  for (const memberRef of request.memberRefs ?? []) {
    result.push("--member-ref", memberRef);
  }
  if (request.bundleKind) {
    result.push("--bundle-kind", request.bundleKind);
  }
  if (request.diffRange) {
    result.push("--diff-range", request.diffRange);
  }
  const executorRealization = executorRealizationFromRequest(request);
  if (executorRealization) {
    result.push("--executor-realization", executorRealization);
  }
  for (const lensId of request.lensIds ?? []) {
    result.push("--lens-id", lensId);
  }
  if (request.confirmValueAlignment) {
    result.push("--confirm-value-alignment");
  }
  return result;
}

function executorRealizationFromRequest(
  request: Pick<
    ReviewInvocationRequest,
    "executionRoute" | "executionAdapter" | "executorRealization"
  >,
): ReviewExecutorRealization | undefined {
  const routeRealization =
    request.executionRoute === "external_oauth_worker"
      ? request.executionAdapter === "claude_code"
        ? "claude_code"
        : "codex"
      : request.executionRoute === "direct_model_call"
        ? "ts_inline_http"
        : undefined;
  if (
    request.executorRealization !== undefined &&
    routeRealization !== undefined &&
    request.executorRealization !== routeRealization
  ) {
    throw new Error(
      `Conflicting review execution overrides: executionRoute=${request.executionRoute} maps to ${routeRealization}, but debug executorRealization=${request.executorRealization}.`,
    );
  }
  return request.executorRealization ?? routeRealization;
}

export async function prepareReviewInvocationRequest(
  request: ReviewInvocationRequest,
  options: RunReviewInvocationOptions,
): Promise<PrepareOnlyResult> {
  const argv = appendReviewInvocationRequestArgs([], request, {
    ontoHome: options.ontoHome,
  });
  try {
    const { result } = await withCapturedInvocationConsole(() =>
      prepareReviewInvocationArgv(argv, options.progressObserver),
    );
    return result;
  } catch (error) {
    await emitFailureProgress(options.progressObserver, "prepare", null, error);
    throw error;
  }
}

export async function runReviewInvocation(
  request: ReviewInvocationRequest,
  options: RunReviewInvocationOptions,
): Promise<RunReviewInvocationResult> {
  const argv = appendReviewInvocationRequestArgs(
    options.noWatch === false ? [] : ["--no-watch"],
    request,
    { ontoHome: options.ontoHome },
  );
  try {
    const captured = await withCapturedInvocationConsole(() =>
      runReviewInvocationArgv(argv, options.progressObserver),
    );
    return {
      output: captured.result,
      stdout: captured.stdout,
      stderr: captured.stderr,
    };
  } catch (error) {
    await emitFailureProgress(options.progressObserver, "execute", null, error);
    throw error;
  }
}

export async function collectReviewInvocationArtifactRefs(
  sessionRoot: string,
): Promise<ReviewInvocationArtifactRefs> {
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
    review_target_profile: path.join(
      sessionRoot,
      "execution-preparation",
      "review-target-profile.yaml",
    ),
    review_context_manifest: path.join(
      sessionRoot,
      "execution-preparation",
      "review-context-manifest.yaml",
    ),
    lens_completion_barrier: path.join(sessionRoot, "lens-completion-barrier.yaml"),
    finding_ledger: path.join(sessionRoot, "finding-ledger.yaml"),
    finding_relation_graph: path.join(sessionRoot, "finding-relation-graph.yaml"),
    issue_ledger: path.join(sessionRoot, "issue-ledger.yaml"),
    issue_stance_matrix: path.join(sessionRoot, "issue-stance-matrix.yaml"),
    deliberation_plan: path.join(sessionRoot, "deliberation-plan.yaml"),
    problem_framing: path.join(sessionRoot, "problem-framing.yaml"),
    deliberation_output: path.join(sessionRoot, "deliberation.md"),
    deliberation_resolution: path.join(sessionRoot, "deliberation-resolution.yaml"),
    synthesis_work_items: path.join(sessionRoot, "synthesis-work-items.yaml"),
    synthesis_ledger: path.join(sessionRoot, "synthesis-ledger.yaml"),
    synthesis_output: path.join(sessionRoot, "synthesis.md"),
    review_run_manifest: path.join(sessionRoot, "review-run-manifest.yaml"),
    degradation_summary: path.join(sessionRoot, "degradation-summary.yaml"),
    active_review_attempt: path.join(sessionRoot, "active-review-attempt.yaml"),
    review_cancel_request: path.join(sessionRoot, "review-cancel-request.yaml"),
    environment_warnings: path.join(sessionRoot, "environment-warnings.yaml"),
    error_log: path.join(sessionRoot, "error-log.md"),
    final_output: path.join(sessionRoot, "final-output.md"),
    review_record: path.join(sessionRoot, "review-record.yaml"),
  };
  const entries: [string, string][] = [];
  for (const [key, filePath] of Object.entries(candidates)) {
    if (await fileExists(filePath)) {
      entries.push([key, filePath]);
    }
  }
  return Object.fromEntries(entries);
}

export function parseReviewInvocationCliOutput(
  stdout: string[],
): ReviewInvocationCliOutput {
  for (const line of [...stdout].reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isReviewInvocationCliOutput(parsed)) return parsed;
    } catch {
      // Keep looking: progress messages may contain braces or partial JSON.
    }
  }
  throw new Error("review invocation completed without a structured JSON result.");
}

export function projectReviewInvocationEquivalence(
  output: ReviewInvocationCliOutput,
): ReviewInvocationEquivalenceProjection {
  const entrypointPlan = isRecord(output.entrypoint_plan)
    ? output.entrypoint_plan
    : {};
  const artifacts = isRecord(output.artifacts) ? output.artifacts : {};
  return {
    recordStatus: output.review_result.record_status,
    deliberationStatus: output.review_result.deliberation_status ?? null,
    domainFinalValue:
      typeof entrypointPlan.domain_final_value === "string"
        ? entrypointPlan.domain_final_value
        : null,
    domainSelectionMode:
      typeof entrypointPlan.domain_selection_mode === "string"
        ? entrypointPlan.domain_selection_mode
        : null,
    reviewMode:
      typeof entrypointPlan.review_mode === "string"
        ? entrypointPlan.review_mode
        : null,
    routeSummary: output.route_summary ?? null,
    boundedInvokeSteps: output.bounded_invoke_steps ?? [],
    artifactKeys: Object.keys(artifacts).sort(),
    participatingLensIds: output.review_result.participating_lens_ids ?? [],
    degradedLensIds: output.review_result.degraded_lens_ids ?? [],
  };
}

function isReviewInvocationCliOutput(
  value: unknown,
): value is ReviewInvocationCliOutput {
  if (value === null || typeof value !== "object") return false;
  const reviewResult = (value as { review_result?: unknown }).review_result;
  return reviewResult !== null && typeof reviewResult === "object";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type ConsoleMethod = (...args: unknown[]) => void;

function stringifyConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) =>
      typeof arg === "string"
        ? arg
        : arg instanceof Error
          ? arg.stack ?? arg.message
          : JSON.stringify(arg),
    )
    .join(" ");
}

async function withCapturedInvocationConsole<T>(
  action: () => Promise<T>,
): Promise<{ result: T; stdout: string[]; stderr: string[] }> {
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

async function emitProgress(
  observer: ReviewInvocationProgressObserver | undefined,
  event: ReviewInvocationProgressEvent,
): Promise<void> {
  if (!observer) return;
  try {
    await observer(event);
  } catch {
    // Progress observers are transport-only and must not affect execution.
  }
}

async function emitFailureProgress(
  observer: ReviewInvocationProgressObserver | undefined,
  phase: ReviewInvocationProgressPhase,
  sessionRoot: string | null,
  error: unknown,
): Promise<void> {
  await emitProgress(observer, {
    version: 1,
    eventKind: "failure",
    phase,
    status: "failed",
    sessionId: sessionIdFromRoot(sessionRoot),
    sessionRoot,
    message: error instanceof Error ? error.message : String(error),
    failure: {
      message: error instanceof Error ? error.message : String(error),
      retrySafety: "unknown",
    },
  });
}

function sessionIdFromRoot(sessionRoot: string | null): string | null {
  return sessionRoot ? path.basename(path.resolve(sessionRoot)) : null;
}

function normalizeReviewInvocationRecordStatus(
  status: string | null | undefined,
): ReviewInvocationRecordStatus {
  if (
    status === "completed" ||
    status === "completed_with_degradation" ||
    status === "halted_partial"
  ) {
    return status;
  }
  if (status === "degraded") return "completed_with_degradation";
  if (status === "failed" || status === "halted") return "halted_partial";
  return null;
}

export async function prepareReviewInvocationArgv(
  argv: string[],
  observer?: ReviewInvocationProgressObserver,
): Promise<PrepareOnlyResult> {
  await emitProgress(observer, {
    version: 1,
    eventKind: "phase",
    phase: "resolve",
    status: "started",
    sessionId: null,
    sessionRoot: null,
    message: "Resolving review invocation.",
  });
  const setup = await resolveReviewInvokeSetup(argv);
  await emitProgress(observer, {
    version: 1,
    eventKind: "phase",
    phase: "resolve",
    status: "completed",
    sessionId: null,
    sessionRoot: null,
    message: "Resolved review invocation.",
  });

  await emitProgress(observer, {
    version: 1,
    eventKind: "phase",
    phase: "prepare",
    status: "started",
    sessionId: null,
    sessionRoot: null,
    message: "Preparing review session.",
  });
  const startResult = await startReviewSession(setup.startArgv);
  const sessionRoot = path.resolve(startResult.session_root);
  await emitProgress(observer, {
    version: 1,
    eventKind: "artifact",
    phase: "prepare",
    status: "completed",
    sessionId: sessionIdFromRoot(sessionRoot),
    sessionRoot,
    artifactRef: path.join(sessionRoot, "execution-plan.yaml"),
    message: "Prepared review session.",
  });

  return {
    prepare_only: true,
    session_root: sessionRoot,
    request_text: setup.resolvedInvokeInputs.requestText,
    execution_realization: setup.executionProfile.execution_realization,
    host_runtime: setup.executionProfile.host_runtime,
    review_mode: setup.resolvedInvokeInputs.reviewMode,
  };
}

export async function runReviewInvocationArgv(
  argv: string[],
  observer?: ReviewInvocationProgressObserver,
): Promise<ReviewInvocationCliOutput> {
  const setup = await resolveReviewInvokeSetup(argv);
  const resolvedProjectRoot = path.resolve(
    readSingleOptionValueFromArgv(setup.startArgv, "project-root") ?? ".",
  );
  const hasExplicitExecutorOverride =
    readSingleOptionValueFromArgv(argv, "executor-realization") !== undefined ||
    readSingleOptionValueFromArgv(argv, "executor-bin") !== undefined ||
    readSingleOptionValueFromArgv(argv, "synthesize-executor-realization") !== undefined ||
    readSingleOptionValueFromArgv(argv, "synthesize-executor-bin") !== undefined;
  const effectiveReviewExecutionProfile =
    setup.executionProfile.review_execution_profile;

  await emitProgress(observer, {
    version: 1,
    eventKind: "phase",
    phase: "prepare",
    status: "started",
    sessionId: null,
    sessionRoot: null,
    message: "Starting review session preparation.",
  });
  const startResult = await startReviewSession(setup.startArgv);
  const sessionRoot = path.resolve(startResult.session_root);
  await emitProgress(observer, {
    version: 1,
    eventKind: "artifact",
    phase: "prepare",
    status: "completed",
    sessionId: sessionIdFromRoot(sessionRoot),
    sessionRoot,
    artifactRef: path.join(sessionRoot, "execution-plan.yaml"),
    message: "Review session prepared.",
  });

  await ensureProviderRouteReadyForDispatch({
    sessionRoot,
    executionPlanPath: path.join(sessionRoot, "execution-plan.yaml"),
    reviewExecutionProfile: effectiveReviewExecutionProfile,
  });

  const defaultExecutorConfig = resolveExecutorConfig(
    argv,
    "",
    setup.ontoConfig,
    setup.ontoHome,
    hasExplicitExecutorOverride
      ? undefined
      : setup.executionProfile.review_execution_profile,
    "lens",
  );
  const teamleadExecutorConfig = resolveExecutorConfig(
    argv,
    "",
    setup.ontoConfig,
    setup.ontoHome,
    hasExplicitExecutorOverride
      ? undefined
      : setup.executionProfile.review_execution_profile,
    "teamlead",
  );
  const synthesizeExecutorConfig = resolveExecutorConfig(
    argv,
    "synthesize-",
    setup.ontoConfig,
    setup.ontoHome,
    hasExplicitExecutorOverride
      ? undefined
      : setup.executionProfile.review_execution_profile,
    "synthesize",
  );

  await emitProgress(observer, {
    version: 1,
    eventKind: "phase",
    phase: "execute",
    status: "started",
    sessionId: sessionIdFromRoot(sessionRoot),
    sessionRoot,
    message: "Starting review prompt execution.",
  });
  const promptExecutionResult = await executeReviewPromptExecution({
    projectRoot: resolvedProjectRoot,
    sessionRoot,
    defaultExecutorConfig,
    ...(teamleadExecutorConfig.bin === defaultExecutorConfig.bin &&
    JSON.stringify(teamleadExecutorConfig.args) ===
      JSON.stringify(defaultExecutorConfig.args)
      ? {}
      : { teamleadExecutorConfig }),
    ...(synthesizeExecutorConfig.bin === defaultExecutorConfig.bin &&
    JSON.stringify(synthesizeExecutorConfig.args) ===
      JSON.stringify(defaultExecutorConfig.args)
      ? {}
      : { synthesizeExecutorConfig }),
    reviewExecutionProfile: effectiveReviewExecutionProfile,
    ontoConfig: setup.ontoConfig,
  });
  await emitProgress(observer, {
    version: 1,
    eventKind: "artifact",
    phase: "execute",
    status: "completed",
    sessionId: sessionIdFromRoot(sessionRoot),
    sessionRoot,
    artifactRef: path.join(sessionRoot, "execution-result.yaml"),
    message: "Review prompt execution completed.",
  });

  await emitProgress(observer, {
    version: 1,
    eventKind: "phase",
    phase: "complete",
    status: "started",
    sessionId: sessionIdFromRoot(sessionRoot),
    sessionRoot,
    message: "Assembling review record.",
  });
  await completeReviewSession([
    "--project-root",
    resolvedProjectRoot,
    "--session-root",
    sessionRoot,
    "--request-text",
    setup.resolvedInvokeInputs.requestText,
  ]);
  await emitProgress(observer, {
    version: 1,
    eventKind: "artifact",
    phase: "complete",
    status: "completed",
    sessionId: sessionIdFromRoot(sessionRoot),
    sessionRoot,
    artifactRef: path.join(sessionRoot, "review-record.yaml"),
    message: "Review record assembled.",
  });

  const output = await projectReviewInvocationCliOutput({
    setup,
    sessionRoot,
    resolvedProjectRoot,
    promptExecutionResult,
    defaultExecutorConfig,
  });
  await emitProgress(observer, {
    version: 1,
    eventKind: "artifact",
    phase: "project",
    status: "completed",
    sessionId: sessionIdFromRoot(sessionRoot),
    sessionRoot,
    artifactRef: output.review_result.final_output_path,
    message: "Review invocation result projected.",
  });
  return output;
}

async function projectReviewInvocationCliOutput(args: {
  setup: Awaited<ReturnType<typeof resolveReviewInvokeSetup>>;
  sessionRoot: string;
  resolvedProjectRoot: string;
  promptExecutionResult: Awaited<ReturnType<typeof executeReviewPromptExecution>>;
  defaultExecutorConfig: ReturnType<typeof resolveExecutorConfig>;
}): Promise<ReviewInvocationCliOutput> {
  const reviewSummary = await readOptionalReviewSummary(args.sessionRoot);
  const boundedInvokeSteps = [
    "start_review_session",
    "run_review_prompt_execution",
    "complete_review_session",
  ] as const;
  const effectiveReviewExecutionProfile =
    args.setup.executionProfile.review_execution_profile;
  const finalRoute = buildReviewExecutionRoute(effectiveReviewExecutionProfile);
  const routeProfile = {
    ...args.setup.executionProfile,
    execution_realization: finalRoute.execution_realization,
    host_runtime: finalRoute.artifact_host_runtime,
    review_execution_profile: effectiveReviewExecutionProfile,
  };
  const routeSummary: ReviewInvokeRouteSummary = {
    combined_entrypoint: "review_invocation",
    bounded_invoke_steps: [...boundedInvokeSteps],
    execution_realization: routeProfile.execution_realization,
    host_runtime: routeProfile.host_runtime,
    review_execution_profile: {
      mode: routeProfile.review_execution_profile.mode,
      teamlead_seat: routeProfile.review_execution_profile.teamlead.seat,
      lens_seat: routeProfile.review_execution_profile.lens.seat,
      synthesize_seat: routeProfile.review_execution_profile.synthesize.seat,
      worker_executor: routeProfile.review_execution_profile.worker_executor,
      deliberation: routeProfile.review_execution_profile.deliberation,
      runtime_route: buildReviewRuntimeRouteArtifactProjection(finalRoute),
      ...(routeProfile.review_execution_profile.model
        ? { model: routeProfile.review_execution_profile.model }
        : {}),
      ...(routeProfile.review_execution_profile.effort
        ? { effort: routeProfile.review_execution_profile.effort }
        : {}),
      ...(routeProfile.review_execution_profile.service_tier
        ? { service_tier: routeProfile.review_execution_profile.service_tier }
        : {}),
      ...(routeProfile.review_execution_profile.retry
        ? { retry: routeProfile.review_execution_profile.retry }
        : {}),
    },
    review_mode: args.setup.resolvedInvokeInputs.reviewMode,
    max_concurrent_lenses: args.setup.maxConcurrentLenses,
    concurrency_strategy:
      args.setup.maxConcurrentLenses >=
      args.setup.resolvedInvokeInputs.resolvedLensIds.length
        ? "all_lenses_parallel"
        : "bounded_lens_parallel",
    synthesize_waits_for_all_lenses: true,
  };
  const finalOutputPath =
    reviewSummary.binding?.final_output_path ??
    path.join(args.sessionRoot, "final-output.md");
  const reviewRecordPath =
    reviewSummary.binding?.review_record_path ??
    path.join(args.sessionRoot, "review-record.yaml");
  const executionResultPath =
    reviewSummary.binding?.execution_result_path ??
    path.join(args.sessionRoot, "execution-result.yaml");
  const reviewRunManifestPath = path.join(args.sessionRoot, "review-run-manifest.yaml");
  const participatingLensIds =
    reviewSummary.reviewRecord?.participating_lens_ids ??
    args.promptExecutionResult.participating_lens_ids;
  const degradedLensIds =
    reviewSummary.reviewRecord?.degraded_lens_ids ??
    args.promptExecutionResult.degraded_lens_ids;
  const recordStatus = normalizeReviewInvocationRecordStatus(
    reviewSummary.reviewRecord?.record_status ??
      reviewSummary.executionResult?.execution_status ??
      null,
  );
  const deliberationStatus =
    reviewSummary.reviewRecord?.deliberation_status ??
    reviewSummary.executionResult?.deliberation_status ??
    null;
  const haltSummary =
    reviewSummary.executionResult?.halt_reason || args.promptExecutionResult.halt_reason
      ? {
          reason:
            reviewSummary.executionResult?.halt_reason ??
            args.promptExecutionResult.halt_reason ??
            null,
          phase:
            reviewSummary.executionResult?.halt_phase ??
            args.promptExecutionResult.halt_phase ??
            null,
          unit_id:
            reviewSummary.executionResult?.halt_unit_id ??
            args.promptExecutionResult.halt_unit_id ??
            null,
          unit_kind:
            reviewSummary.executionResult?.halt_unit_kind ??
            args.promptExecutionResult.halt_unit_kind ??
            null,
          lens_id:
            reviewSummary.executionResult?.halt_lens_id ??
            args.promptExecutionResult.halt_lens_id ??
            null,
        }
      : null;
  const executionSummary = {
    status: recordStatus,
    deliberation_status: deliberationStatus,
    halt: haltSummary,
    review_mode: args.setup.resolvedInvokeInputs.reviewMode,
    lens: {
      participating_count: participatingLensIds.length,
      degraded_count: degradedLensIds.length,
      participating_lens_ids: participatingLensIds,
      degraded_lens_ids: degradedLensIds,
    },
    executor: {
      max_concurrent_lenses: args.setup.maxConcurrentLenses,
      concurrency_strategy:
        args.setup.maxConcurrentLenses >=
        args.setup.resolvedInvokeInputs.resolvedLensIds.length
          ? "all_lenses_parallel"
          : "bounded_lens_parallel",
      realization: inferExecutorRealization(args.defaultExecutorConfig),
      profile: routeSummary.review_execution_profile,
    },
  };
  const artifactRefs = {
    session_root: args.sessionRoot,
    final_output: finalOutputPath,
    review_record: reviewRecordPath,
    execution_result: executionResultPath,
    review_run_manifest: reviewRunManifestPath,
  };
  const closureSummary = await readReviewResultClosureSummary(args.sessionRoot);
  const explanationSummary =
    await readReviewResultExplanationSummary(finalOutputPath);
  const resultOverview = {
    outcome: {
      status: recordStatus,
      deliberation_status: deliberationStatus,
      halt: haltSummary,
      review_mode: args.setup.resolvedInvokeInputs.reviewMode,
    },
    scope: {
      target: args.setup.resolvedInvokeInputs.requestedTarget,
      target_scope_kind: args.setup.resolvedInvokeInputs.targetScopeKind,
      domain: args.setup.resolvedInvokeInputs.domainFinalValue,
      domain_selection_reason:
        args.setup.resolvedInvokeInputs.domainSelectionReason,
    },
    coverage: {
      planned_lens_count: args.setup.resolvedInvokeInputs.resolvedLensIds.length,
      participating_lens_count: participatingLensIds.length,
      degraded_lens_count: degradedLensIds.length,
      participating_lens_ids: participatingLensIds,
      degraded_lens_ids: degradedLensIds,
    },
    explanation: {
      final_review_result: explanationSummary.final_review_result,
      boundary_notes: explanationSummary.boundary_notes,
    },
    issues: closureSummary,
    artifacts: artifactRefs,
  };

  return {
    summary: executionSummary,
    result_overview: resultOverview,
    entrypoint_plan: {
      entrypoint: "review",
      target: args.setup.resolvedInvokeInputs.requestedTarget,
      target_scope_kind: args.setup.resolvedInvokeInputs.targetScopeKind,
      resolved_target_refs: args.setup.resolvedInvokeInputs.resolvedTargetRefs,
      request_text: args.setup.resolvedInvokeInputs.requestText,
      requested_domain_token:
        args.setup.resolvedInvokeInputs.requestedDomainToken.length > 0
          ? args.setup.resolvedInvokeInputs.requestedDomainToken
          : null,
      domain_selection_required:
        args.setup.resolvedInvokeInputs.domainSelectionRequired,
      domain_selection_mode: args.setup.resolvedInvokeInputs.domainSelectionMode,
      domain_selection_reason:
        args.setup.resolvedInvokeInputs.domainSelectionReason,
      domain_final_value: args.setup.resolvedInvokeInputs.domainFinalValue,
      review_mode: args.setup.resolvedInvokeInputs.reviewMode,
    },
    route_summary: routeSummary,
    artifacts: artifactRefs,
    review_result: {
      session_root: args.sessionRoot,
      final_output_path: finalOutputPath,
      review_record_path: reviewRecordPath,
      execution_result_path: executionResultPath,
      review_run_manifest_path: reviewRunManifestPath,
      record_status: recordStatus,
      deliberation_status: deliberationStatus,
      halt_reason: haltSummary?.reason ?? null,
      halt_phase: haltSummary?.phase ?? null,
      halt_unit_id: haltSummary?.unit_id ?? null,
      halt_unit_kind: haltSummary?.unit_kind ?? null,
      halt_lens_id: haltSummary?.lens_id ?? null,
      participating_lens_ids: participatingLensIds,
      degraded_lens_ids: degradedLensIds,
      summary: executionSummary,
    },
    bounded_invoke_steps: [...boundedInvokeSteps],
    completion: {
      status: recordStatus,
      final_output_path: finalOutputPath,
      review_record_path: reviewRecordPath,
    },
  };
}

/**
 * Runs review preparation and returns the result directly (no console output).
 *
 * The execution_realization / host_runtime in the returned result mirror the
 * values written into the prepared session artifacts.
 */
export async function reviewPrepareOnly(argv: string[]): Promise<PrepareOnlyResult> {
  return prepareReviewInvocationArgv(argv);
}

export async function runReviewInvokeCli(argv: string[]): Promise<number> {
  const prepareOnly = hasOptionFlag(argv, "prepare-only");

  if (!prepareOnly) {
    const output = await runReviewInvocationArgv(argv);
    console.log(JSON.stringify(output, null, 2));
    return 0;
  }

  const setup = await resolveReviewInvokeSetup(argv);

  const resolvedProjectRoot = path.resolve(
    readSingleOptionValueFromArgv(setup.startArgv, "project-root") ?? ".",
  );
  const rawOntoHome = readSingleOptionValueFromArgv(setup.startArgv, "onto-home");
  const resolvedOntoHome = rawOntoHome ? path.resolve(rawOntoHome) : undefined;

  const noWatch = hasOptionFlag(argv, "no-watch");
  const hasExplicitExecutorBinOverride =
    readSingleOptionValueFromArgv(argv, "executor-bin") !== undefined ||
    readSingleOptionValueFromArgv(argv, "synthesize-executor-bin") !== undefined;
  const effectiveReviewExecutionProfile =
    setup.executionProfile.review_execution_profile;
  const plannedSessionId = requireString(
    readSingleOptionValueFromArgv(setup.startArgv, "session-id"),
    "session-id",
  );
  const plannedSessionRoot = path.join(
    resolvedProjectRoot,
    ".onto",
    "review",
    plannedSessionId,
  );

  console.log(
    renderReviewStartPreview({
      projectRoot: resolvedProjectRoot,
      sessionRoot: plannedSessionRoot,
      setup,
      reviewExecutionProfile: effectiveReviewExecutionProfile,
    }),
  );
  console.log("[review invoke] step 1/3 start session");
  const startResult = await startReviewSession(setup.startArgv);

  if (prepareOnly) {
    const sessionRoot = path.resolve(startResult.session_root);
    const profile: ResolvedExecutionProfile = setup.executionProfile;
    const result: PrepareOnlyResult = {
      prepare_only: true,
      session_root: sessionRoot,
      request_text: setup.resolvedInvokeInputs.requestText,
      execution_realization: profile.execution_realization,
      host_runtime: profile.host_runtime,
      review_mode: setup.resolvedInvokeInputs.reviewMode,
    };
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  const sessionRoot = path.resolve(startResult.session_root);

  // Auto-attach the live watcher pane AFTER session creation so the watcher
  // receives the exact session-root as an explicit argument. Prior behaviour
  // spawned the watcher before startReviewSession and relied on the shared
  // `.onto/review/.latest-session` pointer — but that pointer is a project-
  // global single file, so concurrent review sessions (two or more
  // review invocations running in parallel) caused each
  // watcher to latch onto whichever session wrote `.latest-session` last.
  // Passing sessionRoot explicitly eliminates that race.
  if (!noWatch) {
    const watcherResult = spawnWatcherPane(
      resolvedProjectRoot,
      sessionRoot,
      resolvedOntoHome,
    );
    if (watcherResult.spawned) {
      // Distinguish dry-run (mechanism detected, no osascript/tmux invoked)
      // from real attach (actual side pane / split / tab opened). Log
      // readers need both to verify "did the pane appear?" without
      // conflating it with "did detection logic reach the right branch?".
      const action = watcherResult.dry_run
        ? "detection via"
        : "attached via";
      console.log(
        `[review runner] live watcher ${action} ${watcherResult.mechanism}`,
      );
    } else {
      console.log(
        `[review runner] live progress: open another terminal and run \`bash scripts/onto-review-watch.sh "${sessionRoot}"\`` +
          (watcherResult.reason ? ` (${watcherResult.reason})` : ""),
      );
    }
  }

  const resolvedRequestText = setup.resolvedInvokeInputs.requestText;
  await ensureProviderRouteReadyForDispatch({
    sessionRoot,
    executionPlanPath: path.join(sessionRoot, "execution-plan.yaml"),
    reviewExecutionProfile: effectiveReviewExecutionProfile,
  });

  const defaultExecutorConfig = resolveExecutorConfig(
    argv,
    "",
    setup.ontoConfig,
    setup.ontoHome,
    hasExplicitExecutorBinOverride
      ? undefined
      : setup.executionProfile.review_execution_profile,
    "lens",
  );
  const teamleadExecutorConfig = resolveExecutorConfig(
    argv,
    "",
    setup.ontoConfig,
    setup.ontoHome,
    hasExplicitExecutorBinOverride
      ? undefined
      : setup.executionProfile.review_execution_profile,
    "teamlead",
  );
  const synthesizeExecutorConfig = resolveExecutorConfig(
    argv,
    "synthesize-",
    setup.ontoConfig,
    setup.ontoHome,
    hasExplicitExecutorBinOverride
      ? undefined
      : setup.executionProfile.review_execution_profile,
    "synthesize",
  );

  console.log("[review invoke] step 2/3 prompt execution");
  const promptExecutionResult = await executeReviewPromptExecution({
    projectRoot: resolvedProjectRoot,
    sessionRoot,
    defaultExecutorConfig,
    ...(teamleadExecutorConfig.bin === defaultExecutorConfig.bin &&
    JSON.stringify(teamleadExecutorConfig.args) ===
      JSON.stringify(defaultExecutorConfig.args)
      ? {}
      : { teamleadExecutorConfig }),
    ...(synthesizeExecutorConfig.bin === defaultExecutorConfig.bin &&
    JSON.stringify(synthesizeExecutorConfig.args) ===
      JSON.stringify(defaultExecutorConfig.args)
      ? {}
      : { synthesizeExecutorConfig }),
    reviewExecutionProfile: effectiveReviewExecutionProfile,
    ontoConfig: setup.ontoConfig,
  });

  console.log("[review invoke] step 3/3 record assembly");
  await completeReviewSession([
    "--project-root",
    resolvedProjectRoot,
    "--session-root",
    sessionRoot,
    "--request-text",
    resolvedRequestText,
  ]);
  console.log("[review invoke] completed 3/3 record assembly");
  const reviewSummary = await readOptionalReviewSummary(sessionRoot);
  const boundedInvokeSteps = [
    "start_review_session",
    "run_review_prompt_execution",
    "complete_review_session",
  ] as const;
  const finalRoute = buildReviewExecutionRoute(effectiveReviewExecutionProfile);
  const routeProfile: ResolvedExecutionProfile = {
    ...setup.executionProfile,
    execution_realization: finalRoute.execution_realization,
    host_runtime: finalRoute.artifact_host_runtime,
    review_execution_profile: effectiveReviewExecutionProfile,
  };
  const routeSummary: ReviewInvokeRouteSummary = {
    combined_entrypoint: "review_invocation",
    bounded_invoke_steps: [...boundedInvokeSteps],
    execution_realization: routeProfile.execution_realization,
    host_runtime: routeProfile.host_runtime,
    review_execution_profile: {
      mode: routeProfile.review_execution_profile.mode,
      teamlead_seat: routeProfile.review_execution_profile.teamlead.seat,
      lens_seat: routeProfile.review_execution_profile.lens.seat,
      synthesize_seat: routeProfile.review_execution_profile.synthesize.seat,
      worker_executor: routeProfile.review_execution_profile.worker_executor,
      deliberation: routeProfile.review_execution_profile.deliberation,
      runtime_route: buildReviewRuntimeRouteArtifactProjection(finalRoute),
      ...(routeProfile.review_execution_profile.model
        ? { model: routeProfile.review_execution_profile.model }
        : {}),
      ...(routeProfile.review_execution_profile.effort
        ? { effort: routeProfile.review_execution_profile.effort }
        : {}),
      ...(routeProfile.review_execution_profile.service_tier
        ? { service_tier: routeProfile.review_execution_profile.service_tier }
        : {}),
      ...(routeProfile.review_execution_profile.retry
        ? { retry: routeProfile.review_execution_profile.retry }
        : {}),
    },
    review_mode: setup.resolvedInvokeInputs.reviewMode,
    max_concurrent_lenses: setup.maxConcurrentLenses,
    concurrency_strategy: concurrencyStrategyFor({
      plannedLensCount: setup.resolvedInvokeInputs.resolvedLensIds.length,
      maxConcurrentLenses: setup.maxConcurrentLenses,
    }),
    synthesize_waits_for_all_lenses: true,
  };
  const finalOutputPath =
    reviewSummary.binding?.final_output_path ?? path.join(sessionRoot, "final-output.md");
  const reviewRecordPath =
    reviewSummary.binding?.review_record_path ?? path.join(sessionRoot, "review-record.yaml");
  const executionResultPath =
    reviewSummary.binding?.execution_result_path ?? path.join(sessionRoot, "execution-result.yaml");
  const reviewRunManifestPath = path.join(sessionRoot, "review-run-manifest.yaml");
  const participatingLensIds =
    reviewSummary.reviewRecord?.participating_lens_ids ??
    promptExecutionResult.participating_lens_ids;
  const degradedLensIds =
    reviewSummary.reviewRecord?.degraded_lens_ids ??
    promptExecutionResult.degraded_lens_ids;
  const recordStatus =
    reviewSummary.reviewRecord?.record_status ??
    reviewSummary.executionResult?.execution_status ??
    null;
  const deliberationStatus =
    reviewSummary.reviewRecord?.deliberation_status ??
    reviewSummary.executionResult?.deliberation_status ??
    null;
  const haltSummary =
    reviewSummary.executionResult?.halt_reason || promptExecutionResult.halt_reason
      ? {
          reason:
            reviewSummary.executionResult?.halt_reason ??
            promptExecutionResult.halt_reason ??
            null,
          phase:
            reviewSummary.executionResult?.halt_phase ??
            promptExecutionResult.halt_phase ??
            null,
          unit_id:
            reviewSummary.executionResult?.halt_unit_id ??
            promptExecutionResult.halt_unit_id ??
            null,
          unit_kind:
            reviewSummary.executionResult?.halt_unit_kind ??
            promptExecutionResult.halt_unit_kind ??
            null,
          lens_id:
            reviewSummary.executionResult?.halt_lens_id ??
            promptExecutionResult.halt_lens_id ??
            null,
        }
      : null;
  const executionSummary = {
    status: recordStatus,
    deliberation_status: deliberationStatus,
    halt: haltSummary,
    review_mode: setup.resolvedInvokeInputs.reviewMode,
    lens: {
      participating_count: participatingLensIds.length,
      degraded_count: degradedLensIds.length,
      participating_lens_ids: participatingLensIds,
      degraded_lens_ids: degradedLensIds,
    },
    executor: {
      max_concurrent_lenses: setup.maxConcurrentLenses,
      concurrency_strategy: concurrencyStrategyFor({
        plannedLensCount: setup.resolvedInvokeInputs.resolvedLensIds.length,
        maxConcurrentLenses: setup.maxConcurrentLenses,
      }),
      realization: inferExecutorRealization(defaultExecutorConfig),
      profile: routeSummary.review_execution_profile,
    },
  };
  const artifactRefs = {
    session_root: sessionRoot,
    final_output: finalOutputPath,
    review_record: reviewRecordPath,
    execution_result: executionResultPath,
    review_run_manifest: reviewRunManifestPath,
  };
  const closureSummary = await readReviewResultClosureSummary(sessionRoot);
  const explanationSummary =
    await readReviewResultExplanationSummary(finalOutputPath);
  const resultOverview = {
    outcome: {
      status: recordStatus,
      deliberation_status: deliberationStatus,
      halt: haltSummary,
      review_mode: setup.resolvedInvokeInputs.reviewMode,
    },
    scope: {
      target: setup.resolvedInvokeInputs.requestedTarget,
      target_scope_kind: setup.resolvedInvokeInputs.targetScopeKind,
      domain: setup.resolvedInvokeInputs.domainFinalValue,
      domain_selection_reason: setup.resolvedInvokeInputs.domainSelectionReason,
    },
    coverage: {
      planned_lens_count: setup.resolvedInvokeInputs.resolvedLensIds.length,
      participating_lens_count: participatingLensIds.length,
      degraded_lens_count: degradedLensIds.length,
      participating_lens_ids: participatingLensIds,
      degraded_lens_ids: degradedLensIds,
    },
    explanation: {
      final_review_result: explanationSummary.final_review_result,
      boundary_notes: explanationSummary.boundary_notes,
    },
    issues: closureSummary,
    artifacts: artifactRefs,
  };

  console.log(
    renderReviewResultOverview({
      projectRoot: resolvedProjectRoot,
      target: setup.resolvedInvokeInputs.requestedTarget,
      targetScopeKind: setup.resolvedInvokeInputs.targetScopeKind,
      domain: setup.resolvedInvokeInputs.domainFinalValue,
      domainSelectionReason: setup.resolvedInvokeInputs.domainSelectionReason,
      status: recordStatus,
      deliberationStatus,
      reviewMode: setup.resolvedInvokeInputs.reviewMode,
      plannedLensIds: setup.resolvedInvokeInputs.resolvedLensIds,
      participatingLensIds,
      degradedLensIds,
      closureSummary,
      explanationSummary,
      artifactRefs,
    }),
  );

  console.log(
    JSON.stringify(
      {
        summary: executionSummary,
        result_overview: resultOverview,
        entrypoint_plan: {
          entrypoint: "review",
          target: setup.resolvedInvokeInputs.requestedTarget,
          target_scope_kind: setup.resolvedInvokeInputs.targetScopeKind,
          resolved_target_refs: setup.resolvedInvokeInputs.resolvedTargetRefs,
          request_text: resolvedRequestText,
          requested_domain_token:
            setup.resolvedInvokeInputs.requestedDomainToken.length > 0
              ? setup.resolvedInvokeInputs.requestedDomainToken
              : null,
          domain_selection_required: setup.resolvedInvokeInputs.domainSelectionRequired,
          domain_selection_mode: setup.resolvedInvokeInputs.domainSelectionMode,
          domain_selection_reason: setup.resolvedInvokeInputs.domainSelectionReason,
          domain_final_value: setup.resolvedInvokeInputs.domainFinalValue,
          review_mode: setup.resolvedInvokeInputs.reviewMode,
        },
        route_summary: routeSummary,
        artifacts: artifactRefs,
        review_result: {
          session_root: sessionRoot,
          final_output_path: finalOutputPath,
          review_record_path: reviewRecordPath,
          execution_result_path: executionResultPath,
          review_run_manifest_path: reviewRunManifestPath,
          record_status: recordStatus,
          deliberation_status: deliberationStatus,
          halt_reason: haltSummary?.reason ?? null,
          halt_phase: haltSummary?.phase ?? null,
          halt_unit_id: haltSummary?.unit_id ?? null,
          halt_unit_kind: haltSummary?.unit_kind ?? null,
          halt_lens_id: haltSummary?.lens_id ?? null,
          participating_lens_ids: participatingLensIds,
          degraded_lens_ids: degradedLensIds,
          summary: executionSummary,
        },
        bounded_invoke_steps: [...boundedInvokeSteps],
        completion: {
          status: recordStatus,
          final_output_path: finalOutputPath,
          review_record_path: reviewRecordPath,
        },
      },
      null,
      2,
    ),
  );
  return 0;
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  return runReviewInvokeCli(process.argv.slice(2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (exitCode) => process.exit(exitCode),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
