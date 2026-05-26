import type {
  InvocationBindingArtifact,
  InvocationInterpretationArtifact,
  ReviewExecutionResultArtifact,
  ReviewExecutionPlan,
  ReviewMode,
  ReviewRecord,
  ReviewResultClassificationSummary,
  ReviewSessionMetadata,
  ReviewStructuredFailureRecord,
  ReviewTargetProfileArtifact,
  ReviewTargetScopeKind,
} from "../core-runtime/review/artifact-types.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveOntoHome } from "../core-runtime/discovery/onto-home.js";
import { loadCoreLensRegistry } from "../core-runtime/discovery/lens-registry.js";
import {
  fileExists,
  isoFromTimestamp,
  isoNow,
  readYamlDocument,
} from "../core-runtime/review/review-artifact-utils.js";
import {
  buildReviewRouteVisibilityFromSession,
  type ReviewRouteVisibility,
} from "../core-runtime/review/route-visibility.js";
import { readValidatedReviewRecord } from "../core-runtime/review/review-record-validation.js";
import { readReviewResultClassification } from "../core-runtime/review/review-result-classification.js";
import {
  REVIEW_EXECUTION_STEP_IDS,
  REVIEW_PROGRESS_STEPS,
  REVIEW_PROGRESS_TOTAL_STEPS,
  type ReviewProgressStepId,
  reviewProgressStepById,
  reviewProgressStepIdFromHalt,
} from "../core-runtime/review/review-progress-contract.js";
import { reviewPrepareOnly, runReviewInvokeCli } from "../core-runtime/cli/review-invoke.js";

export interface PrepareReviewRequest {
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

export type ReviewNativeProgressStage =
  | "start_preview"
  | "session_planned"
  | "invoke_step"
  | "runtime_step"
  | "completed"
  | "final_status";

export interface ReviewNativeProgressEvent {
  presentation_contract_version: string;
  event_kind: "mcp_progress";
  sequence: number;
  generated_at: string;
  source: "review_invoke_console" | "artifact_status";
  stage: ReviewNativeProgressStage;
  session_root: string | null;
  message: string;
  progress: {
    current: number;
    total: number;
    exact_step?: number;
    exact_total?: number;
    label?: string;
  };
}

export type ReviewProgressObserver = (
  event: ReviewNativeProgressEvent,
) => void;

export interface RunReviewRequest extends PrepareReviewRequest {
  providerId?: string;
  progressObserver?: ReviewProgressObserver;
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
  resultClassificationSummary?: ReviewResultClassificationSummary;
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
  progress?: LlmPresentationPrompt;
  halt?: LlmPresentationPrompt;
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
  llmPresentation?: LlmPresentationPrompts;
}

export interface ReviewResult {
  sessionId: string;
  sessionRoot: string;
  reviewRecord: ReviewRecord;
  finalOutputPath: string;
  reviewRunManifestPath: string;
  finalOutputText?: string;
  artifactRefs: Record<string, string>;
  resultClassificationSummary?: ReviewResultClassificationSummary;
  failureRefs: string[];
  routeVisibility?: ReviewRouteVisibility | null;
  llmPresentation?: LlmPresentationPrompts;
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
  observer?: {
    stdout?: (line: string) => void;
    stderr?: (line: string) => void;
  },
): Promise<CapturedConsoleResult<T>> {
  const originalLog: ConsoleMethod = console.log;
  const originalWarn: ConsoleMethod = console.warn;
  const originalError: ConsoleMethod = console.error;
  const stdout: string[] = [];
  const stderr: string[] = [];

  console.log = (...args: unknown[]) => {
    const line = stringifyConsoleArgs(args);
    stdout.push(line);
    try {
      observer?.stdout?.(line);
    } catch {
      // Progress observers are transport-only and must not affect execution.
    }
  };
  console.warn = (...args: unknown[]) => {
    const line = stringifyConsoleArgs(args);
    stderr.push(line);
    try {
      observer?.stderr?.(line);
    } catch {
      // Progress observers are transport-only and must not affect execution.
    }
  };
  console.error = (...args: unknown[]) => {
    const line = stringifyConsoleArgs(args);
    stderr.push(line);
    try {
      observer?.stderr?.(line);
    } catch {
      // Progress observers are transport-only and must not affect execution.
    }
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

async function readOptionalReviewRecord(
  filePath: string,
): Promise<ReviewRecord | null> {
  if (!(await fileExists(filePath))) return null;
  return readValidatedReviewRecord(filePath);
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
      "Cover: outcome, deliberation status, coverage, final review result, highest severity, material issues, non-material findings, action candidates, and primary artifacts.",
      "Make the result comprehensive enough for the user to understand what to do next, but keep operational detail bounded. Use the user's conversation language.",
    ].join("\n"),
    input,
  };
}

const REVIEW_PRESENTATION_CONTRACT_VERSION = "1";

const PRESENTATION_SOURCE_REF_KEYS = [
  "execution_plan",
  "review_run_manifest",
  "execution_result",
  "review_record",
  "review_target_profile",
  "finding_ledger",
  "issue_ledger",
  "problem_framing",
  "final_output",
] as const;

const OPENING_PRESENTATION_SOURCE_REF_KEYS = [
  "interpretation",
  "binding",
  "execution_plan",
  "review_target_profile",
  "review_context_manifest",
] as const;

type ReviewStatusValue = ReviewStatus["status"];
type InterimSignalStatus =
  | "lens_local"
  | "issue_candidate"
  | "deliberation_pending"
  | "deliberated"
  | "finalized";

interface ReviewRunManifestSummary {
  created_at?: string;
  execution_contract?: {
    execution_step_ids?: string[];
    progress_total_steps?: number;
  };
  worker_units?: Array<{
    unit_id?: string;
    unit_kind?: string;
    status?: string;
    output_path?: string;
    failure_message?: string | null;
  }>;
}

type ReviewLivenessStateKind =
  | "prepared"
  | "running_recent_signal"
  | "running_waiting"
  | "running_stale"
  | "halted"
  | "completed"
  | "unknown";

interface ReviewProgressState {
  current_step: number | null;
  total_steps: number | null;
  current_label: string | null;
  completed_steps: string[];
  active_units: string[];
  pending_units: string[];
  elapsed_seconds: number | null;
  next_expected_event: string | null;
}

interface ReviewLivenessState {
  generated_at: string;
  poll_after_seconds: number | null;
  state: ReviewLivenessStateKind;
  last_observed_artifact_key: string | null;
  last_observed_artifact_ref: string | null;
  last_observed_artifact_mtime: string | null;
  seconds_since_last_observed_artifact: number | null;
  summary: string;
}

interface ReviewProgressUpdate {
  interim_signal_status: InterimSignalStatus | null;
  summary: string;
  evidence_refs: string[];
}

interface ReviewHaltPresentation {
  phase: string | null;
  unit_id: string | null;
  unit_kind: string | null;
  lens_id: string | null;
  reason: string;
  produced_artifact_refs: Record<string, string>;
  absent_artifact_refs: Record<string, string>;
  action_candidates: string[];
}

interface ReviewStatusPresentationInput {
  presentation_contract_version: string;
  presentation_kind: "progress" | "halt";
  session_id: string;
  session_root: string;
  status: ReviewStatusValue;
  generated_from_artifact_refs: Record<string, string | null>;
  progress: ReviewProgressState;
  liveness: ReviewLivenessState;
  latest_update: ReviewProgressUpdate;
  result_classification_summary: ReviewResultClassificationSummary | null;
  halt: ReviewHaltPresentation | null;
}

function compactSeverityCounts(
  summary: ReviewResultClassificationSummary,
): string {
  return [
    `blocker=${summary.severity_counts.blocker}`,
    `high=${summary.severity_counts.high}`,
    `medium=${summary.severity_counts.medium}`,
    `low=${summary.severity_counts.low}`,
    `info=${summary.severity_counts.info}`,
  ].join(", ");
}

function compactClassificationSignal(
  summary: ReviewResultClassificationSummary,
): string {
  return `highest=${summary.highest_severity ?? "none"}, material=${summary.material_issue_count}, severity_counts=${compactSeverityCounts(summary)}`;
}

function buildProgressPresentation(input: unknown): LlmPresentationPrompt {
  return {
    prompt: [
      "Render a concise onto review progress update from bounded runtime facts.",
      "Use only the provided input facts. Do not invent findings, severity, elapsed time, halt state, artifacts, or pending units.",
      "Show a compact stepwise/progress-bar style status, the liveness state, latest review signal, artifact refs that matter now, and the next expected event.",
      "Use the user's conversation language.",
    ].join("\n"),
    input,
  };
}

function buildHaltPresentation(input: unknown): LlmPresentationPrompt {
  return {
    prompt: [
      "Render a concise halted-partial onto review update from bounded runtime facts.",
      "Use only the provided input facts. Lead with halt identity, produced artifacts, absent artifacts, and available action candidates.",
      "Do not present partial findings as a completed review. Use the user's conversation language.",
    ].join("\n"),
    input,
  };
}

function progressEvent(args: {
  sequence: number;
  source: ReviewNativeProgressEvent["source"];
  stage: ReviewNativeProgressStage;
  sessionRoot: string | null;
  message: string;
  current: number;
  total?: number;
  exactStep?: number;
  exactTotal?: number;
  label?: string;
}): ReviewNativeProgressEvent {
  return {
    presentation_contract_version: REVIEW_PRESENTATION_CONTRACT_VERSION,
    event_kind: "mcp_progress",
    sequence: args.sequence,
    generated_at: isoNow(),
    source: args.source,
    stage: args.stage,
    session_root: args.sessionRoot,
    message: args.message,
    progress: {
      current: args.current,
      total: args.total ?? 100,
      ...(args.exactStep !== undefined ? { exact_step: args.exactStep } : {}),
      ...(args.exactTotal !== undefined ? { exact_total: args.exactTotal } : {}),
      ...(args.label !== undefined ? { label: args.label } : {}),
    },
  };
}

function progressUnitsForInvokeStep(step: number): number {
  switch (step) {
    case 1:
      return 5;
    case 2:
      return 10;
    case 3:
      return 90;
    default:
      return 0;
  }
}

function progressUnitsForRuntimeStep(step: number, total: number): number {
  if (total <= 0) return 10;
  return Math.min(89, 10 + Math.round((step / total) * 75));
}

function parseSessionRootLine(projectRoot: string, line: string): string | null {
  const match = /^\s*session_root:\s+(.+?)\s*$/.exec(line);
  if (!match?.[1]) return null;
  const rawSessionRoot = match[1];
  return path.isAbsolute(rawSessionRoot)
    ? rawSessionRoot
    : path.resolve(projectRoot, rawSessionRoot);
}

function consoleLineProgressEvent(args: {
  line: string;
  projectRoot: string;
  sessionRoot: string | null;
  sequence: number;
}): { event: ReviewNativeProgressEvent; sessionRoot: string | null } | null {
  const plannedSessionRoot = parseSessionRootLine(args.projectRoot, args.line);
  if (plannedSessionRoot) {
    return {
      sessionRoot: plannedSessionRoot,
      event: progressEvent({
        sequence: args.sequence,
        source: "review_invoke_console",
        stage: "session_planned",
        sessionRoot: plannedSessionRoot,
        message: `Review session planned at ${plannedSessionRoot}.`,
        current: 1,
        label: "session planned",
      }),
    };
  }

  if (args.line.trim() === "[review start]") {
    return {
      sessionRoot: args.sessionRoot,
      event: progressEvent({
        sequence: args.sequence,
        source: "review_invoke_console",
        stage: "start_preview",
        sessionRoot: args.sessionRoot,
        message: "Review start preview generated.",
        current: 0,
        label: "start preview",
      }),
    };
  }

  const invokeStepMatch =
    /^\[review invoke\] step (\d+)\/3\s+(.+?)\s*$/.exec(args.line);
  if (invokeStepMatch?.[1] && invokeStepMatch[2]) {
    const step = Number.parseInt(invokeStepMatch[1], 10);
    const label = invokeStepMatch[2];
    return {
      sessionRoot: args.sessionRoot,
      event: progressEvent({
        sequence: args.sequence,
        source: "review_invoke_console",
        stage: "invoke_step",
        sessionRoot: args.sessionRoot,
        message: label,
        current: progressUnitsForInvokeStep(step),
        exactStep: step,
        exactTotal: 3,
        label,
      }),
    };
  }

  const runtimeStepMatch =
    /^\[review progress\]\s+(\d+)\/(\d+)\s+(.+?)\s*$/.exec(args.line);
  if (runtimeStepMatch?.[1] && runtimeStepMatch[2] && runtimeStepMatch[3]) {
    const step = Number.parseInt(runtimeStepMatch[1], 10);
    const total = Number.parseInt(runtimeStepMatch[2], 10);
    const label = runtimeStepMatch[3];
    return {
      sessionRoot: args.sessionRoot,
      event: progressEvent({
        sequence: args.sequence,
        source: "review_invoke_console",
        stage: "runtime_step",
        sessionRoot: args.sessionRoot,
        message: label,
        current: progressUnitsForRuntimeStep(step, total),
        exactStep: step,
        exactTotal: total,
        label,
      }),
    };
  }

  const completedMatch =
    /^\[review invoke\] completed 3\/3\s+(.+?)\s*$/.exec(args.line);
  if (completedMatch?.[1]) {
    const label = completedMatch[1];
    return {
      sessionRoot: args.sessionRoot,
      event: progressEvent({
        sequence: args.sequence,
        source: "review_invoke_console",
        stage: "completed",
        sessionRoot: args.sessionRoot,
        message: label,
        current: 98,
        exactStep: 3,
        exactTotal: 3,
        label,
      }),
    };
  }

  return null;
}

function generatedFromArtifactRefs(
  artifactRefs: Record<string, string>,
  keys: readonly string[] = PRESENTATION_SOURCE_REF_KEYS,
): Record<string, string | null> {
  const refs: Record<string, string | null> = {};
  for (const key of keys) {
    refs[key] = artifactRefs[key] ?? null;
  }
  return refs;
}

function stepById(stepId: ReviewProgressStepId): {
  id: ReviewProgressStepId;
  step: number;
  label: string;
} {
  return reviewProgressStepById(stepId);
}

function totalProgressSteps(manifest: ReviewRunManifestSummary | null): number {
  const fromManifest = manifest?.execution_contract?.progress_total_steps;
  return typeof fromManifest === "number" && fromManifest > 0
    ? fromManifest
    : REVIEW_PROGRESS_TOTAL_STEPS;
}

function stepIdsFromManifestOrDefault(
  manifest: ReviewRunManifestSummary | null,
): ReviewProgressStepId[] {
  const ids = manifest?.execution_contract?.execution_step_ids;
  if (!Array.isArray(ids)) return [...REVIEW_EXECUTION_STEP_IDS];
  const knownIds = new Set(REVIEW_EXECUTION_STEP_IDS);
  return ids.filter((id): id is ReviewProgressStepId => knownIds.has(id as ReviewProgressStepId));
}

function elapsedSeconds(
  executionResult: ReviewExecutionResultArtifact | null,
): number | null {
  const durationMs = executionResult?.total_duration_ms;
  return typeof durationMs === "number" ? Math.round(durationMs / 1000) : null;
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function secondsBetween(nowMs: number, beforeMs: number | null): number | null {
  if (beforeMs === null) return null;
  return Math.max(0, Math.round((nowMs - beforeMs) / 1000));
}

async function artifactObservation(
  artifactRefs: Record<string, string>,
): Promise<{
  key: string | null;
  ref: string | null;
  mtimeMs: number | null;
}> {
  let latest: { key: string; ref: string; mtimeMs: number } | null = null;
  for (const [key, ref] of Object.entries(artifactRefs)) {
    try {
      const stat = await fs.stat(ref);
      if (!latest || stat.mtimeMs > latest.mtimeMs) {
        latest = { key, ref, mtimeMs: stat.mtimeMs };
      }
    } catch {
      // Artifact refs are best-effort presentation facts; missing files are
      // already filtered by collectArtifactRefs and should not break status.
    }
  }
  return latest ?? { key: null, ref: null, mtimeMs: null };
}

function livenessStateKind(args: {
  status: ReviewStatusValue;
  secondsSinceLastArtifact: number | null;
}): ReviewLivenessStateKind {
  if (args.status === "completed" || args.status === "completed_with_degradation") {
    return "completed";
  }
  if (args.status === "halted_partial" || args.status === "failed") {
    return "halted";
  }
  if (args.status === "prepared") return "prepared";
  if (args.status === "unknown") return "unknown";
  if (args.secondsSinceLastArtifact === null) return "running_waiting";
  if (args.secondsSinceLastArtifact <= 60) return "running_recent_signal";
  if (args.secondsSinceLastArtifact <= 300) return "running_waiting";
  return "running_stale";
}

function livenessPollAfterSeconds(state: ReviewLivenessStateKind): number | null {
  switch (state) {
    case "completed":
    case "halted":
      return null;
    case "running_stale":
      return 15;
    case "running_recent_signal":
    case "running_waiting":
      return 30;
    case "prepared":
    case "unknown":
      return 60;
  }
}

function livenessSummary(args: {
  state: ReviewLivenessStateKind;
  currentLabel: string | null;
  activeUnits: string[];
  lastArtifactKey: string | null;
  secondsSinceLastArtifact: number | null;
}): string {
  const active = args.activeUnits.length > 0
    ? ` active_units=${args.activeUnits.join(", ")}`
    : "";
  const lastArtifact = args.lastArtifactKey
    ? ` last_artifact=${args.lastArtifactKey}`
    : "";
  const since = args.secondsSinceLastArtifact === null
    ? ""
    : ` seconds_since_last_artifact=${args.secondsSinceLastArtifact}`;
  switch (args.state) {
    case "completed":
      return "Review reached a terminal completed state; no further polling is required.";
    case "halted":
      return "Review reached a terminal halted/failed state; operator action is required before progress can continue.";
    case "prepared":
      return "Review is prepared for dispatch; polling can continue after execution starts.";
    case "unknown":
      return "Review status is unknown; polling can continue while artifacts appear.";
    case "running_recent_signal":
      return `Review is still active at ${args.currentLabel ?? "unknown step"} with a recent artifact signal.${active}${lastArtifact}${since}`;
    case "running_waiting":
      return `Review is still active at ${args.currentLabel ?? "unknown step"}; no new final signal is available yet.${active}${lastArtifact}${since}`;
    case "running_stale":
      return `Review is still active at ${args.currentLabel ?? "unknown step"}, but no artifact change has been observed for the stale threshold.${active}${lastArtifact}${since}`;
  }
}

async function existingSeatIds(
  seats: Array<{ lens_id: string; output_path: string }> | undefined,
): Promise<string[]> {
  const existing: string[] = [];
  for (const seat of seats ?? []) {
    if (await fileExists(seat.output_path)) existing.push(seat.lens_id);
  }
  return existing;
}

async function completedProgressStepIds(params: {
  artifactRefs: Record<string, string>;
  executionPlan: ReviewExecutionPlan | null;
  reviewRecord: ReviewRecord | null;
  status: ReviewStatusValue;
}): Promise<ReviewProgressStepId[]> {
  if (params.status === "completed" || params.status === "completed_with_degradation") {
    return REVIEW_PROGRESS_STEPS.map((step) => step.id);
  }

  const completed: ReviewProgressStepId[] = [];
  if (params.executionPlan) completed.push("manifest_validation");

  const plannedLensIds = params.executionPlan?.lens_execution_seats.map(
    (seat) => seat.lens_id,
  ) ?? [];
  const completedLensIds = await existingSeatIds(params.executionPlan?.lens_execution_seats);
  const allPlannedLensesCompleted =
    plannedLensIds.length > 0 && completedLensIds.length >= plannedLensIds.length;
  if (allPlannedLensesCompleted || params.artifactRefs.lens_completion_barrier) {
    completed.push("lens_dispatch");
  }

  if (params.artifactRefs.lens_completion_barrier) completed.push("lens_completion_barrier");
  if (params.artifactRefs.finding_ledger) completed.push("finding_ledger");
  if (params.artifactRefs.finding_relation_graph) completed.push("finding_relation_graph");
  if (params.artifactRefs.issue_ledger) completed.push("issue_ledger");
  if (params.artifactRefs.issue_stance_matrix) completed.push("issue_stance_matrix");
  if (params.artifactRefs.deliberation_plan) completed.push("deliberation_plan");

  const deliberationIds = await existingSeatIds(
    params.executionPlan?.lens_deliberation_prompt_packet_seats,
  );
  const plannedDeliberationIds =
    params.executionPlan?.lens_deliberation_prompt_packet_seats.map((seat) => seat.lens_id) ??
    [];
  if (
    (plannedDeliberationIds.length > 0 &&
      deliberationIds.length >= plannedDeliberationIds.length) ||
    params.artifactRefs.deliberation_output
  ) {
    completed.push("lens_deliberation_responses");
  }

  if (params.artifactRefs.deliberation_output) completed.push("controlled_deliberation");
  if (params.artifactRefs.problem_framing) completed.push("problem_framing");
  if (params.artifactRefs.synthesis_output) {
    completed.push("synthesize");
  }

  return [...new Set(completed)];
}

function currentStepIdFromHalt(
  executionResult: ReviewExecutionResultArtifact | null,
): ReviewProgressStepId | null {
  return reviewProgressStepIdFromHalt({
    haltPhase: executionResult?.halt_phase ?? null,
    haltUnitId: executionResult?.halt_unit_id ?? null,
    haltUnitKind: executionResult?.halt_unit_kind ?? null,
  });
}

async function activeUnits(params: {
  status: ReviewStatusValue;
  currentStepId: ReviewProgressStepId | null;
  executionPlan: ReviewExecutionPlan | null;
  executionResult: ReviewExecutionResultArtifact | null;
}): Promise<string[]> {
  if (
    params.status === "prepared" ||
    params.status === "completed" ||
    params.status === "completed_with_degradation" ||
    params.status === "unknown"
  ) {
    return [];
  }

  if (params.status === "halted_partial") {
    const unitId = params.executionResult?.halt_unit_id;
    return typeof unitId === "string" && unitId.length > 0 ? [unitId] : [];
  }

  if (params.currentStepId === "lens_dispatch") {
    const planned = params.executionPlan?.lens_execution_seats.map((seat) => seat.lens_id) ?? [];
    const completed = new Set(await existingSeatIds(params.executionPlan?.lens_execution_seats));
    const pending = planned.filter((lensId) => !completed.has(lensId));
    return (pending.length > 0 ? pending : planned).map((lensId) => `lens:${lensId}`);
  }

  if (params.currentStepId === "lens_deliberation_responses") {
    const planned =
      params.executionPlan?.lens_deliberation_prompt_packet_seats.map((seat) => seat.lens_id) ??
      [];
    const completed = new Set(
      await existingSeatIds(params.executionPlan?.lens_deliberation_prompt_packet_seats),
    );
    return planned
      .filter((lensId) => !completed.has(lensId))
      .map((lensId) => `deliberation:${lensId}`);
  }

  if (params.currentStepId === "controlled_deliberation") return ["controlled-deliberation"];
  return params.currentStepId ? [params.currentStepId] : [];
}

function latestProgressUpdate(params: {
  status: ReviewStatusValue;
  artifactRefs: Record<string, string>;
  executionResult: ReviewExecutionResultArtifact | null;
  completedLensIds: string[];
  resultClassificationSummary: ReviewResultClassificationSummary;
}): ReviewProgressUpdate {
  if (params.status === "completed" || params.status === "completed_with_degradation") {
    return {
      interim_signal_status: "finalized",
      summary: `Review completed; final output and ReviewRecord are available. ${compactClassificationSignal(params.resultClassificationSummary)}.`,
      evidence_refs: [
        params.artifactRefs.final_output,
        params.artifactRefs.review_record,
      ].filter((ref): ref is string => typeof ref === "string"),
    };
  }

  if (params.status === "halted_partial") {
    return {
      interim_signal_status: null,
      summary: params.executionResult?.halt_reason ?? "Review halted before completion.",
      evidence_refs: [
        params.artifactRefs.execution_result,
        params.artifactRefs.review_run_manifest,
      ].filter((ref): ref is string => typeof ref === "string"),
    };
  }

  if (params.artifactRefs.problem_framing) {
    return {
      interim_signal_status: "deliberated",
      summary: `Problem framing is available; synthesize/final rendering is next. ${compactClassificationSignal(params.resultClassificationSummary)}.`,
      evidence_refs: [params.artifactRefs.problem_framing],
    };
  }

  if (params.artifactRefs.deliberation_output) {
    return {
      interim_signal_status: "deliberated",
      summary: "Controlled deliberation output is available.",
      evidence_refs: [params.artifactRefs.deliberation_output],
    };
  }

  if (params.artifactRefs.deliberation_plan) {
    return {
      interim_signal_status: "deliberation_pending",
      summary: "Deliberation plan is available; lens deliberation or teamlead consolidation remains.",
      evidence_refs: [params.artifactRefs.deliberation_plan],
    };
  }

  if (params.artifactRefs.issue_ledger || params.artifactRefs.issue_stance_matrix) {
    return {
      interim_signal_status: "issue_candidate",
      summary: `Issue-stage artifacts are available for inspection. issue_count=${params.resultClassificationSummary.issue_count}, ${compactClassificationSignal(params.resultClassificationSummary)}.`,
      evidence_refs: [
        params.artifactRefs.issue_ledger,
        params.artifactRefs.issue_stance_matrix,
      ].filter((ref): ref is string => typeof ref === "string"),
    };
  }

  if (params.artifactRefs.finding_ledger || params.completedLensIds.length > 0) {
    return {
      interim_signal_status: "lens_local",
      summary: params.artifactRefs.finding_ledger
        ? `Finding ledger is available from completed lens outputs. finding_count=${params.resultClassificationSummary.finding_count}, ${compactClassificationSignal(params.resultClassificationSummary)}.`
        : `${params.completedLensIds.length} lens output(s) are available.`,
      evidence_refs: [
        params.artifactRefs.finding_ledger,
        ...params.completedLensIds.map((lensId) => `round1/${lensId}.md`),
      ].filter((ref): ref is string => typeof ref === "string"),
    };
  }

  return {
    interim_signal_status: null,
    summary: "Review session is prepared; worker dispatch has not produced review signals yet.",
    evidence_refs: [
      params.artifactRefs.execution_plan,
      params.artifactRefs.review_target_profile,
    ].filter((ref): ref is string => typeof ref === "string"),
  };
}

function expectedCompletedArtifactRefs(sessionRoot: string): Record<string, string> {
  return {
    synthesis_output: path.join(sessionRoot, "synthesis.md"),
    deliberation_output: path.join(sessionRoot, "deliberation.md"),
    final_output: path.join(sessionRoot, "final-output.md"),
    review_record: path.join(sessionRoot, "review-record.yaml"),
  };
}

function haltPresentation(params: {
  sessionRoot: string;
  artifactRefs: Record<string, string>;
  executionResult: ReviewExecutionResultArtifact | null;
}): ReviewHaltPresentation | null {
  const reason = params.executionResult?.halt_reason;
  if (!reason) return null;
  const absentArtifactRefs = Object.fromEntries(
    Object.entries(expectedCompletedArtifactRefs(params.sessionRoot)).filter(
      ([key]) => params.artifactRefs[key] === undefined,
    ),
  );
  return {
    phase: params.executionResult?.halt_phase ?? null,
    unit_id: params.executionResult?.halt_unit_id ?? null,
    unit_kind: params.executionResult?.halt_unit_kind ?? null,
    lens_id: params.executionResult?.halt_lens_id ?? null,
    reason,
    produced_artifact_refs: params.artifactRefs,
    absent_artifact_refs: absentArtifactRefs,
    action_candidates: ["retry_execution", "continue_review"],
  };
}

async function buildReviewStatusPresentationInput(params: {
  sessionRoot: string;
  status: ReviewStatusValue;
  artifactRefs: Record<string, string>;
  executionPlan: ReviewExecutionPlan | null;
  executionResult: ReviewExecutionResultArtifact | null;
  reviewRecord: ReviewRecord | null;
}): Promise<ReviewStatusPresentationInput> {
  const nowMs = Date.now();
  const manifest = await readOptionalYaml<ReviewRunManifestSummary>(
    path.join(params.sessionRoot, "review-run-manifest.yaml"),
  );
  const sessionMetadata = await readOptionalYaml<ReviewSessionMetadata>(
    path.join(params.sessionRoot, "session-metadata.yaml"),
  );
  const completedSteps = await completedProgressStepIds(params);
  const stepIds = stepIdsFromManifestOrDefault(manifest);
  const totalSteps = totalProgressSteps(manifest);
  const completedStepSet = new Set(completedSteps);
  const firstIncompleteIndex = stepIds.findIndex((stepId) => !completedStepSet.has(stepId));
  const haltedStepId = currentStepIdFromHalt(params.executionResult);
  const currentStepId =
    params.status === "prepared" || params.status === "unknown"
      ? null
      : haltedStepId ??
        (firstIncompleteIndex >= 0 ? stepIds[firstIncompleteIndex] ?? null : null);
  const currentStepIndex = currentStepId
    ? stepIds.findIndex((stepId) => stepId === currentStepId)
    : -1;
  const completedStatus =
    params.status === "completed" || params.status === "completed_with_degradation";
  const sessionStartMs =
    parseTimestampMs(params.executionResult?.execution_started_at) ??
    parseTimestampMs(sessionMetadata?.created_at);
  const progress: ReviewProgressState = {
    current_step: completedStatus
      ? totalSteps
      : currentStepIndex >= 0
        ? currentStepIndex + 1
        : 0,
    total_steps: totalSteps,
    current_label: completedStatus
      ? "completed"
      : params.status === "prepared"
        ? "prepared for dispatch"
        : params.status === "halted_partial"
          ? `halted during ${currentStepId ? stepById(currentStepId).label : "unknown"}`
          : currentStepId
            ? stepById(currentStepId).label
            : "unknown",
    completed_steps: params.status === "prepared"
      ? [
          params.artifactRefs.interpretation ? "interpretation" : null,
          params.artifactRefs.binding ? "binding" : null,
          params.artifactRefs.execution_plan ? "execution_plan" : null,
        ].filter((step): step is string => step !== null)
      : completedSteps,
    active_units: await activeUnits({
      status: params.status,
      currentStepId,
      executionPlan: params.executionPlan,
      executionResult: params.executionResult,
    }),
    pending_units: completedStatus
      ? []
      : params.status === "prepared"
        ? REVIEW_PROGRESS_STEPS.map((step) => step.label)
        : currentStepIndex >= 0
          ? stepIds.slice(currentStepIndex + 1).map((stepId) => stepById(stepId).label)
          : [],
    elapsed_seconds: elapsedSeconds(params.executionResult) ??
      secondsBetween(nowMs, sessionStartMs),
    next_expected_event: completedStatus
      ? null
      : params.status === "halted_partial"
        ? "operator action on halted partial result"
        : params.status === "prepared"
          ? "worker dispatch or review execution start"
          : currentStepId
            ? `next ${stepById(currentStepId).label} artifact or timeout`
            : null,
  };
  const completedLensIds = await existingSeatIds(params.executionPlan?.lens_execution_seats);
  const halt = haltPresentation({
    sessionRoot: params.sessionRoot,
    artifactRefs: params.artifactRefs,
    executionResult: params.executionResult,
  });
  const resultClassificationSummary = await readReviewResultClassification(
    params.sessionRoot,
  );
  const observedArtifact = await artifactObservation(params.artifactRefs);
  const secondsSinceLastArtifact = secondsBetween(nowMs, observedArtifact.mtimeMs);
  const livenessState = livenessStateKind({
    status: params.status,
    secondsSinceLastArtifact,
  });
  const liveness: ReviewLivenessState = {
    generated_at: isoNow(),
    poll_after_seconds: livenessPollAfterSeconds(livenessState),
    state: livenessState,
    last_observed_artifact_key: observedArtifact.key,
    last_observed_artifact_ref: observedArtifact.ref,
    last_observed_artifact_mtime: observedArtifact.mtimeMs === null
      ? null
      : isoFromTimestamp(observedArtifact.mtimeMs),
    seconds_since_last_observed_artifact: secondsSinceLastArtifact,
    summary: livenessSummary({
      state: livenessState,
      currentLabel: progress.current_label,
      activeUnits: progress.active_units,
      lastArtifactKey: observedArtifact.key,
      secondsSinceLastArtifact,
    }),
  };
  return {
    presentation_contract_version: REVIEW_PRESENTATION_CONTRACT_VERSION,
    presentation_kind: "progress",
    session_id: params.reviewRecord?.session_id ?? basenameSessionId(params.sessionRoot),
    session_root: params.sessionRoot,
    status: params.status,
    generated_from_artifact_refs: generatedFromArtifactRefs(params.artifactRefs),
    progress,
    liveness,
    latest_update: latestProgressUpdate({
      status: params.status,
      artifactRefs: params.artifactRefs,
      executionResult: params.executionResult,
      completedLensIds,
      resultClassificationSummary,
    }),
    result_classification_summary: resultClassificationSummary,
    halt,
  };
}

async function buildPreparedOpeningBriefInput(
  sessionRoot: string,
  executionPlan: ReviewExecutionPlan,
): Promise<unknown> {
  const artifactRefs = await collectArtifactRefs(sessionRoot);
  const interpretation = await readOptionalYaml<InvocationInterpretationArtifact>(
    path.join(sessionRoot, "interpretation.yaml"),
  );
  const binding = await readOptionalYaml<InvocationBindingArtifact>(
    path.join(sessionRoot, "binding.yaml"),
  );
  const reviewTargetProfile = await readOptionalYaml<ReviewTargetProfileArtifact>(
    executionPlan.review_target_profile_path,
  );

  return {
    presentation_contract_version: REVIEW_PRESENTATION_CONTRACT_VERSION,
    presentation_kind: "opening_brief",
    session_id: executionPlan.session_id,
    session_root: sessionRoot,
    status: "prepared",
    generated_from_artifact_refs: generatedFromArtifactRefs(
      artifactRefs,
      OPENING_PRESENTATION_SOURCE_REF_KEYS,
    ),
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
    review_target_profile: reviewTargetProfile
      ? {
          target_input_kind: reviewTargetProfile.target_input_kind,
          artifact_roles: reviewTargetProfile.artifact_roles,
          domain: reviewTargetProfile.domain,
          maturity: reviewTargetProfile.maturity,
          closure_level: reviewTargetProfile.closure_level,
          review_goal: reviewTargetProfile.review_goal,
          closure_obligation_policy:
            reviewTargetProfile.closure_obligation_policy,
          target_refs: reviewTargetProfile.target_refs,
          inference: reviewTargetProfile.inference,
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
    lens_completion_barrier: path.join(
      sessionRoot,
      "lens-completion-barrier.yaml",
    ),
    finding_ledger: path.join(sessionRoot, "finding-ledger.yaml"),
    finding_relation_graph: path.join(sessionRoot, "finding-relation-graph.yaml"),
    issue_ledger: path.join(sessionRoot, "issue-ledger.yaml"),
    issue_stance_matrix: path.join(sessionRoot, "issue-stance-matrix.yaml"),
    deliberation_plan: path.join(sessionRoot, "deliberation-plan.yaml"),
    problem_framing: path.join(sessionRoot, "problem-framing.yaml"),
    deliberation_output: path.join(sessionRoot, "deliberation.md"),
    synthesis_output: path.join(sessionRoot, "synthesis.md"),
    review_run_manifest: path.join(sessionRoot, "review-run-manifest.yaml"),
    degradation_summary: path.join(sessionRoot, "degradation-summary.yaml"),
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

async function directoryHasMarkdownFiles(directoryPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(directoryPath);
    return entries.some((entry) => entry.endsWith(".md"));
  } catch {
    return false;
  }
}

async function hasRunArtifacts(
  sessionRoot: string,
  artifactRefs: Record<string, string>,
): Promise<boolean> {
  const runRefKeys = [
    "review_run_manifest",
    "execution_result",
    "degradation_summary",
    "lens_completion_barrier",
    "finding_ledger",
    "finding_relation_graph",
    "issue_ledger",
    "issue_stance_matrix",
    "deliberation_plan",
    "problem_framing",
    "deliberation_output",
    "synthesis_output",
    "final_output",
    "review_record",
  ];
  if (runRefKeys.some((key) => artifactRefs[key] !== undefined)) return true;
  return (
    (await directoryHasMarkdownFiles(path.join(sessionRoot, "round1"))) ||
    (await directoryHasMarkdownFiles(path.join(sessionRoot, "deliberation", "round1")))
  );
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
      let progressSequence = 0;
      let observedSessionRoot: string | null = null;
      const emitProgress = (
        event: Omit<
          ReviewNativeProgressEvent,
          "presentation_contract_version" | "event_kind" | "sequence" | "generated_at"
        >,
      ): void => {
        const observer = request.progressObserver;
        if (!observer) return;
        progressSequence += 1;
        try {
          observer({
            presentation_contract_version: REVIEW_PRESENTATION_CONTRACT_VERSION,
            event_kind: "mcp_progress",
            sequence: progressSequence,
            generated_at: isoNow(),
            ...event,
          });
        } catch {
          // Progress notifications are transport-only and must not affect review execution.
        }
      };
      const captureObserver = request.progressObserver
        ? {
            stdout: (text: string): void => {
              for (const line of text.split(/\r?\n/)) {
                const parsed = consoleLineProgressEvent({
                  line,
                  projectRoot: request.projectRoot,
                  sessionRoot: observedSessionRoot,
                  sequence: progressSequence + 1,
                });
                if (!parsed) continue;
                observedSessionRoot = parsed.sessionRoot ?? observedSessionRoot;
                try {
                  request.progressObserver?.(parsed.event);
                } catch {
                  // Progress notifications are transport-only and must not affect review execution.
                }
                progressSequence = parsed.event.sequence;
              }
            },
          }
        : undefined;
      const captured = await withCapturedConsole(async () => {
        const exitCode = await runReviewInvokeCli(argv);
        if (exitCode !== 0) {
          throw new Error(`review invocation failed with exit code ${exitCode}`);
        }
        return exitCode;
      }, captureObserver);
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
      const resolvedResultSessionRoot = path.resolve(result.session_root);
      const artifactRefs = await collectArtifactRefs(resolvedResultSessionRoot);
      const failures = await collectStructuredFailures(resolvedResultSessionRoot);
      const executionPlan = await readOptionalYaml<ReviewExecutionPlan>(
        path.join(resolvedResultSessionRoot, "execution-plan.yaml"),
      );
      const executionResult = await readOptionalYaml<ReviewExecutionResultArtifact>(
        path.join(resolvedResultSessionRoot, "execution-result.yaml"),
      );
      const reviewRecord = await readOptionalReviewRecord(
        path.join(resolvedResultSessionRoot, "review-record.yaml"),
      );
      const resultClassificationSummary =
        await readReviewResultClassification(resolvedResultSessionRoot);
      const progressInput = await buildReviewStatusPresentationInput({
        sessionRoot: resolvedResultSessionRoot,
        status,
        artifactRefs,
        executionPlan,
        executionResult,
        reviewRecord,
      });
      const openingBriefInput = executionPlan
        ? await buildPreparedOpeningBriefInput(resolvedResultSessionRoot, executionPlan)
        : {
            presentation_contract_version: REVIEW_PRESENTATION_CONTRACT_VERSION,
            presentation_kind: "opening_brief",
            session_id: basenameSessionId(resolvedResultSessionRoot),
            session_root: resolvedResultSessionRoot,
            status,
            generated_from_artifact_refs: generatedFromArtifactRefs(artifactRefs),
            start_preview: startPreview,
          };
      const finalResultInput = {
        presentation_contract_version: REVIEW_PRESENTATION_CONTRACT_VERSION,
        presentation_kind: "final_result",
        session_id: basenameSessionId(resolvedResultSessionRoot),
        session_root: resolvedResultSessionRoot,
        status,
        generated_from_artifact_refs: generatedFromArtifactRefs(artifactRefs),
        result_overview: parsed.result_overview ?? null,
        result_classification_summary: resultClassificationSummary,
        review_result: result,
      };
      const llmPresentation: LlmPresentationPrompts = {
        openingBrief: buildOpeningBriefPresentation(openingBriefInput),
        progress: buildProgressPresentation(progressInput),
        ...(progressInput.halt
          ? {
              halt: buildHaltPresentation({
                ...progressInput,
                presentation_kind: "halt",
              }),
            }
          : {}),
        finalResult: buildFinalResultPresentation(finalResultInput),
      };
      emitProgress({
        source: "artifact_status",
        stage: "final_status",
        session_root: resolvedResultSessionRoot,
        message: `Review finished with status ${status}.`,
        progress: {
          current: 100,
          total: 100,
          label: "final status",
        },
      });
      return {
        sessionId: basenameSessionId(result.session_root),
        sessionRoot: resolvedResultSessionRoot,
        status,
        finalOutputPath: result.final_output_path,
        reviewRecordPath: result.review_record_path,
        executionResultPath: result.execution_result_path,
        reviewRunManifestPath:
          result.review_run_manifest_path ??
          path.join(resolvedResultSessionRoot, "review-run-manifest.yaml"),
        deliberationStatus: result.deliberation_status ?? null,
        participatingLensIds: result.participating_lens_ids ?? [],
        degradedLensIds: result.degraded_lens_ids ?? [],
        ...(result.summary !== undefined ? { summary: result.summary } : {}),
        ...(parsed.result_overview !== undefined
          ? { resultOverview: parsed.result_overview }
          : {}),
        artifactRefs,
        resultClassificationSummary,
        ...failures,
        routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedResultSessionRoot),
        startPreview,
        llmPresentation,
      };
    },

    async getReviewStatus(sessionRoot: string): Promise<ReviewStatus> {
      const resolvedSessionRoot = path.resolve(sessionRoot);
      const artifactRefs = await collectArtifactRefs(resolvedSessionRoot);
      const failures = await collectStructuredFailures(resolvedSessionRoot);
      const executionPlan = await readOptionalYaml<ReviewExecutionPlan>(
        path.join(resolvedSessionRoot, "execution-plan.yaml"),
      );
      const executionResult = await readOptionalYaml<ReviewExecutionResultArtifact>(
        path.join(resolvedSessionRoot, "execution-result.yaml"),
      );
      const reviewRecord = await readOptionalReviewRecord(
        path.join(resolvedSessionRoot, "review-record.yaml"),
      );
      const status: ReviewStatus["status"] = reviewRecord
        ? reviewRecord.record_status
        : executionResult?.execution_status === "halted_partial"
          ? "halted_partial"
          : executionPlan
            ? await hasRunArtifacts(resolvedSessionRoot, artifactRefs)
              ? "running"
              : "prepared"
            : "unknown";
      const progressInput = await buildReviewStatusPresentationInput({
        sessionRoot: resolvedSessionRoot,
        status,
        artifactRefs,
        executionPlan,
        executionResult,
        reviewRecord,
      });
      const llmPresentation: LlmPresentationPrompts = {
        progress: buildProgressPresentation(progressInput),
      };
      if (executionPlan) {
        llmPresentation.openingBrief = buildOpeningBriefPresentation(
          await buildPreparedOpeningBriefInput(resolvedSessionRoot, executionPlan),
        );
      }
      if (progressInput.halt) {
        llmPresentation.halt = buildHaltPresentation({
          ...progressInput,
          presentation_kind: "halt",
        });
      }
      if (reviewRecord) {
        return {
          sessionId: reviewRecord.session_id,
          sessionRoot: resolvedSessionRoot,
          status,
          artifactRefs,
          ...failures,
          routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
          llmPresentation,
        };
      }

      if (executionResult?.execution_status === "halted_partial") {
        return {
          sessionId: basenameSessionId(resolvedSessionRoot),
          sessionRoot: resolvedSessionRoot,
          status,
          artifactRefs,
          ...failures,
          routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
          llmPresentation,
        };
      }

      if (executionPlan) {
        return {
          sessionId: basenameSessionId(resolvedSessionRoot),
          sessionRoot: resolvedSessionRoot,
          status,
          artifactRefs,
          ...failures,
          routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
          llmPresentation,
        };
      }

      return {
        sessionId: basenameSessionId(resolvedSessionRoot),
        sessionRoot: resolvedSessionRoot,
        status: "unknown",
        artifactRefs,
        ...failures,
        routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
        llmPresentation,
      };
    },

    async getReviewResult(sessionRoot: string): Promise<ReviewResult> {
      const resolvedSessionRoot = path.resolve(sessionRoot);
      const artifactRefs = await collectArtifactRefs(resolvedSessionRoot);
      const { failureRefs } = await collectStructuredFailures(resolvedSessionRoot);
      const reviewRecordPath = path.join(resolvedSessionRoot, "review-record.yaml");
      const reviewRecord = await readValidatedReviewRecord(reviewRecordPath);
      const finalOutputPath =
        reviewRecord.final_output_ref ?? path.join(resolvedSessionRoot, "final-output.md");
      const finalOutputText = await readOptionalText(finalOutputPath);
      const executionPlan = await readOptionalYaml<ReviewExecutionPlan>(
        path.join(resolvedSessionRoot, "execution-plan.yaml"),
      );
      const executionResult = await readOptionalYaml<ReviewExecutionResultArtifact>(
        path.join(resolvedSessionRoot, "execution-result.yaml"),
      );
      const resultClassificationSummary =
        await readReviewResultClassification(resolvedSessionRoot);
      const status = reviewRecord.record_status;
      const progressInput = await buildReviewStatusPresentationInput({
        sessionRoot: resolvedSessionRoot,
        status,
        artifactRefs,
        executionPlan,
        executionResult,
        reviewRecord,
      });
      const finalResultInput = {
        presentation_contract_version: REVIEW_PRESENTATION_CONTRACT_VERSION,
        presentation_kind: "final_result",
        session_id: reviewRecord.session_id,
        session_root: resolvedSessionRoot,
        status,
        generated_from_artifact_refs: generatedFromArtifactRefs(artifactRefs),
        result_classification_summary: resultClassificationSummary,
        review_record: reviewRecord,
      };
      return {
        sessionId: reviewRecord.session_id,
        sessionRoot: resolvedSessionRoot,
        reviewRecord,
        finalOutputPath,
        reviewRunManifestPath: path.join(resolvedSessionRoot, "review-run-manifest.yaml"),
        artifactRefs,
        resultClassificationSummary,
        failureRefs,
        routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
        llmPresentation: {
          progress: buildProgressPresentation(progressInput),
          ...(progressInput.halt
            ? {
                halt: buildHaltPresentation({
                  ...progressInput,
                  presentation_kind: "halt",
                }),
              }
            : {}),
          finalResult: buildFinalResultPresentation(finalResultInput),
        },
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
