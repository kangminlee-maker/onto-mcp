import type {
  InvocationBindingArtifact,
  InvocationInterpretationArtifact,
  ReviewActorInvocationProfilesArtifact,
  ReviewExecutionResultArtifact,
  ReviewExecutionPlan,
  ReviewLensCompletionBarrierArtifact,
  ReviewMode,
  ReviewRecord,
  ReviewResultClassificationSummary,
  ReviewSessionMetadata,
  ReviewStructuredFailureRecord,
  ReviewTargetProfileArtifact,
  ReviewTargetScopeKind,
  ReviewUnitExecutionResult,
} from "../core-runtime/review/artifact-types.js";
import type { PipelineExecutionLedger } from "../core-runtime/pipeline-execution-ledger.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveOntoHome } from "../core-runtime/discovery/onto-home.js";
import { loadCoreLensRegistry } from "../core-runtime/discovery/lens-registry.js";
import {
  fileExists,
  isDeprecatedDomainAlias,
  isoFromTimestamp,
  isoNow,
  normalizeDomainValue,
  readYamlDocument,
  writeYamlDocument,
} from "../core-runtime/review/review-artifact-utils.js";
import {
  assertPathInsideRoot,
  realpathIfExists,
} from "../core-runtime/path-boundary.js";
import {
  assertReviewExecutionPlanSessionBoundary,
} from "../core-runtime/review/execution-plan-boundary.js";
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
import {
  collectReviewInvocationArtifactRefs,
  prepareReviewInvocationRequest,
  runReviewInvocation,
  type ReviewInvocationProgressEvent,
} from "../core-runtime/review/review-invocation-runner.js";
import { completeReviewSession } from "../core-runtime/cli/complete-review-session.js";
import {
  buildExecutorConfigFromRealization,
} from "../core-runtime/cli/review-invoke.js";
import {
  executeReviewPromptExecution,
  type ReviewPromptExecutionResult,
} from "../core-runtime/cli/run-review-prompt-execution.js";
import {
  buildReviewPipelineExecutionLedger,
  type ReviewRunManifestForLedger,
} from "../core-runtime/review/pipeline-execution-ledger.js";
import {
  buildReviewContinuationPlan,
  type ReviewContinuationPlan,
} from "../core-runtime/review/continuation-plan.js";
import type {
  ReviewExecutionHost,
  ReviewExecutionProfile,
  ReviewWorkerExecutor,
} from "../core-runtime/review/review-execution-profile.js";

export type ReviewExecutorRealization = "codex" | "mock" | "ts_inline_http";

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
  source: "artifact_status";
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

export type ReviewResultProjectionLevel = "compact" | "standard" | "full";

export interface ReviewDomainTokenResolution {
  requestedToken: string;
  normalizedDomain: string | null;
  resolution: "exact" | "alias" | "suggestion" | "no_domain" | "unknown";
  suggestionIds: string[];
}

export interface ReviewTargetMaterialSupportProjection {
  targetMaterialKind: string | null;
  supportStatus: string | null;
  unsupportedReason: string | null;
  detectionConfidence: number | null;
  detectionConfidenceBasis: string | null;
}

export interface ReviewEnvironmentWarningProjection {
  warningId: string;
  source: string;
  message: string;
  fatality: "non_fatal";
  affectedCapability: string;
  outputTrustImpact: "none" | "unknown";
  observedAt: string;
}

export type ReviewRuntimeUnitStatus =
  | "pending"
  | "running"
  | "retrying"
  | "running_stale"
  | "completed"
  | "failed";

export interface ReviewRuntimeUnitProgressProjection {
  unitId: string;
  publicAlias: string;
  unitKind: string;
  progressStepId: ReviewProgressStepId | null;
  status: ReviewRuntimeUnitStatus;
  packetPath: string | null;
  outputPath: string | null;
  runningLogRef: string | null;
  latestSignal: string | null;
  latestSignalAt: string | null;
  secondsSinceLatestSignal: number | null;
  attemptCount: number;
  failureMessage: string | null;
}

export interface ReviewRunHandle {
  schemaVersion: "1";
  sessionId: string;
  sessionRoot: string;
  invocationId: string;
  status: ReviewStatus["status"];
  projectRoot: string | null;
  target: {
    requestedTarget: string | null;
    targetScopeKind: ReviewTargetScopeKind | null;
    targetMaterialKind: string | null;
  };
  domain: ReviewDomainTokenResolution;
  artifactRefs: {
    sessionMetadata: string | null;
    executionPlan: string | null;
    reviewRunManifest: string | null;
    executionResult: string | null;
    finalOutput: string | null;
    reviewRecord: string | null;
  };
  requestHash: string | null;
  pollAfterSeconds: number | null;
}

export interface ReviewActiveAttemptProjection {
  attemptId: string;
  attemptKind: "initial_review" | "continuation";
  status: "started" | "completed" | "halted_partial" | "failed";
  sessionId: string;
  sessionRoot: string;
  startedAt: string;
  updatedAt: string;
  activeUnits: string[];
  requestedFrontierUnits: string[];
  latestObservedArtifactRef: string | null;
  staleAfterSeconds: number;
  secondsSinceUpdated: number | null;
  isStale: boolean;
  attemptManifestRef: string;
}

export interface ReviewRunControlProjection {
  activeAttempt: ReviewActiveAttemptProjection | null;
  lifecycleState:
    | "prepared"
    | "active"
    | "stale_active"
    | "cancellation_requested"
    | "failed_attempt"
    | "halted"
    | "completed"
    | "unknown";
  alreadyRunning: boolean;
  cancellationAvailable: boolean;
  cancellationRequested: boolean;
  cancellationRequestRef: string | null;
  continuationAvailable: boolean;
  retryAvailable: boolean;
  retrySemantics: "use_review_continue";
  hostTimeoutSemantics: "review_continues_under_session";
  statusReason: string;
}

export interface ReviewSessionLookupQuery {
  projectRoot: string;
  target?: string;
  domain?: string;
  requestHash?: string;
  createdAfter?: string;
  limit?: number;
}

export interface ReviewSessionLookupResult {
  sessionId: string;
  sessionRoot: string;
  createdAt: string | null;
  requestedTarget: string | null;
  requestedDomainToken: string | null;
  normalizedDomain: string | null;
  requestHash: string | null;
  status: ReviewStatus["status"];
  artifactRefs: Record<string, string>;
}

export interface RunReviewRequest extends PrepareReviewRequest {
  providerId?: string;
  progressObserver?: ReviewProgressObserver;
  returnRunningAfterMs?: number;
}

export interface ContinueReviewRequest {
  sessionRoot: string;
  projectRoot?: string;
  targetUnits?: string[];
  requestText?: string;
  executorRealization?: ReviewExecutorRealization;
}

export interface CancelReviewRequest {
  sessionRoot: string;
  projectRoot?: string;
  reason?: string;
}

export interface ReviewRunResult {
  sessionId: string;
  sessionRoot: string;
  status: "running" | "completed" | "completed_with_degradation" | "halted_partial";
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
  pipelineExecutionLedger?: PipelineExecutionLedger;
  resultClassificationSummary?: ReviewResultClassificationSummary;
  failureRefs?: string[];
  routeVisibility?: ReviewRouteVisibility | null;
  startPreview?: {
    entrypointPlan?: unknown;
    routeSummary?: unknown;
    boundedInvokeSteps?: string[];
  };
  llmPresentation?: LlmPresentationPrompts;
  runHandle?: ReviewRunHandle;
  runControl?: ReviewRunControlProjection;
  targetMaterialSupport?: ReviewTargetMaterialSupportProjection | null;
  environmentWarnings?: ReviewEnvironmentWarningProjection[];
}

export interface ReviewContinuationAttempt {
  attemptId: string;
  attemptRoot: string;
  continuationPlanPath: string;
  attemptManifestPath: string;
  supersededArtifactBackups: Array<{
    sourceRef: string;
    backupRef: string;
  }>;
}

export interface ReviewContinueResult {
  sessionId: string;
  sessionRoot: string;
  decision: "executed" | "already_running";
  status: ReviewStatus["status"];
  continuationPlan?: ReviewContinuationPlan;
  continuationAttempt?: ReviewContinuationAttempt;
  promptExecutionResult?: ReviewPromptExecutionResult;
  artifactRefs: Record<string, string>;
  pipelineExecutionLedger?: PipelineExecutionLedger;
  resultClassificationSummary?: ReviewResultClassificationSummary;
  failureRefs: string[];
  routeVisibility?: ReviewRouteVisibility | null;
  llmPresentation?: LlmPresentationPrompts;
  activeAttempt?: ReviewActiveAttemptProjection;
}

export interface ReviewCancelResult {
  sessionId: string;
  sessionRoot: string;
  decision: "requested" | "not_cancellable" | "already_terminal";
  status: ReviewStatus["status"];
  cancelRequestPath: string;
  reason: string;
  artifactRefs: Record<string, string>;
  runControl?: ReviewRunControlProjection;
  llmPresentation?: LlmPresentationPrompts;
}

export interface ReviewContinuationArtifactRestore {
  sourceRef: string;
  backupRef: string;
  restored: boolean;
  errorMessage?: string;
}

export interface ReviewContinuationFailureContent {
  mcp_error_code: "ONTO_REVIEW_CONTINUATION_FAILED";
  session_id: string;
  session_root: string;
  attempt_id: string;
  attempt_root: string;
  attempt_manifest_ref: string;
  continuation_plan_ref: string;
  continuation_plan: ReviewContinuationPlan;
  superseded_artifact_backups: ReviewContinuationAttempt["supersededArtifactBackups"];
  restored_artifact_backups: ReviewContinuationArtifactRestore[];
  error_message: string;
}

export class ReviewContinuationError extends Error {
  readonly failureContent: ReviewContinuationFailureContent;
  readonly originalError: unknown;

  constructor(args: {
    message: string;
    originalError: unknown;
    failureContent: ReviewContinuationFailureContent;
  }) {
    super(args.message);
    this.name = "ReviewContinuationError";
    this.originalError = args.originalError;
    this.failureContent = args.failureContent;
  }
}

export class ReviewDomainResolutionError extends Error {
  readonly domainResolution: ReviewDomainTokenResolution;

  constructor(args: {
    message: string;
    domainResolution: ReviewDomainTokenResolution;
  }) {
    super(args.message);
    this.name = "ReviewDomainResolutionError";
    this.domainResolution = args.domainResolution;
  }
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
  pipelineExecutionLedger?: PipelineExecutionLedger;
  continuationPlan?: ReviewContinuationPlan;
  failureRefs: string[];
  structuredFailures: ReviewStructuredFailureRecord[];
  routeVisibility?: ReviewRouteVisibility | null;
  llmPresentation?: LlmPresentationPrompts;
  runControl?: ReviewRunControlProjection;
  targetMaterialSupport?: ReviewTargetMaterialSupportProjection | null;
  environmentWarnings?: ReviewEnvironmentWarningProjection[];
  unitProgress?: ReviewRuntimeUnitProgressProjection[];
  latestSessionMatches?: ReviewSessionLookupResult[];
}

export interface ReviewResult {
  sessionId: string;
  sessionRoot: string;
  projectionLevel: ReviewResultProjectionLevel;
  reviewRecord?: ReviewRecord;
  reviewRecordSummary: {
    reviewRecordId: string;
    recordStatus: ReviewRecord["record_status"];
    requestText: string;
    resolvedLensIds: string[];
    participatingLensIds: string[];
    degradedLensIds: string[];
    deliberationStatus: ReviewRecord["deliberation_status"];
  };
  finalOutputPath: string;
  reviewRunManifestPath: string;
  finalOutputText?: string;
  artifactRefs: Record<string, string>;
  pipelineExecutionLedger?: PipelineExecutionLedger;
  resultClassificationSummary?: ReviewResultClassificationSummary;
  failureRefs: string[];
  routeVisibility?: ReviewRouteVisibility | null;
  llmPresentation?: LlmPresentationPrompts;
  targetMaterialSupport?: ReviewTargetMaterialSupportProjection | null;
  environmentWarnings?: ReviewEnvironmentWarningProjection[];
}

export interface OntoReviewCoreApi {
  prepareReview(request: PrepareReviewRequest): Promise<PreparedReview>;
  runReview(request: RunReviewRequest): Promise<ReviewRunResult>;
  continueReview(request: ContinueReviewRequest): Promise<ReviewContinueResult>;
  cancelReview(request: CancelReviewRequest): Promise<ReviewCancelResult>;
  getReviewStatus(sessionRoot: string): Promise<ReviewStatus>;
  getReviewResult(
    sessionRoot: string,
    options?: { projectionLevel?: ReviewResultProjectionLevel },
  ): Promise<ReviewResult>;
  findLatestReviewSessions(
    query: ReviewSessionLookupQuery,
  ): Promise<ReviewSessionLookupResult[]>;
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
  try {
    return await readValidatedReviewRecord(filePath);
  } catch {
    return null;
  }
}

async function readOptionalText(filePath: string): Promise<string | undefined> {
  if (!(await fileExists(filePath))) return undefined;
  return fs.readFile(filePath, "utf8");
}

async function resolveReviewRecordFinalOutputPath(args: {
  sessionRoot: string;
  projectRoot: string | null;
  finalOutputRef: string | null | undefined;
}): Promise<string> {
  const sessionRoot = path.resolve(args.sessionRoot);
  const rawRef = args.finalOutputRef ?? path.join(sessionRoot, "final-output.md");
  const candidates = path.isAbsolute(rawRef)
    ? [path.resolve(rawRef)]
    : [
        path.resolve(sessionRoot, rawRef),
        ...(args.projectRoot ? [path.resolve(args.projectRoot, rawRef)] : []),
      ];
  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) continue;
    await assertPathInsideRoot({
      root: sessionRoot,
      candidate,
      label: "ReviewRecord.final_output_ref",
    });
    return candidate;
  }
  const fallback = candidates[0] ?? path.join(sessionRoot, "final-output.md");
  await assertPathInsideRoot({
    root: sessionRoot,
    candidate: fallback,
    label: "ReviewRecord.final_output_ref",
  });
  return fallback;
}

async function assertSamePath(args: {
  label: string;
  expected: string;
  actual: string;
}): Promise<void> {
  const expected = path.resolve(args.expected);
  const actual = path.resolve(args.actual);
  if (expected === actual) return;
  const realExpected = await realpathIfExists(expected);
  const realActual = await realpathIfExists(actual);
  if (realExpected && realActual && path.resolve(realExpected) === path.resolve(realActual)) {
    return;
  }
  throw new Error(
    `${args.label} mismatch: expected ${expected}, received ${actual}`,
  );
}

function buildOpeningBriefPresentation(input: unknown): LlmPresentationPrompt {
  return {
    prompt: [
      "Explain this onto review opening brief to the user before execution.",
      "Use only the provided input facts. Do not infer or invent target scope, boundary, domain, lens set, model, provider, or execution mode.",
      "Cover: what is being reviewed, why, filesystem boundary, selected domain and domain selection reason, review mode and lens set, execution path, model/provider settings, and where the user can change configuration.",
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

const ACTIVE_REVIEW_ATTEMPT_FILENAME = "active-review-attempt.yaml";
const ENVIRONMENT_WARNINGS_FILENAME = "environment-warnings.yaml";
const REVIEW_CANCEL_REQUEST_FILENAME = "review-cancel-request.yaml";
const DEFAULT_ACTIVE_ATTEMPT_STALE_AFTER_SECONDS = 1_200;
const REVIEW_RUNNER_WARNING_PREFIX = "[review runner warning]";

interface ReviewActiveAttemptArtifact {
  schema_version: "1";
  attempt_id: string;
  attempt_kind: ReviewActiveAttemptProjection["attemptKind"];
  session_id: string;
  session_root: string;
  project_root: string | null;
  created_at: string;
  updated_at: string;
  status: ReviewActiveAttemptProjection["status"];
  active_units: string[];
  requested_frontier_units: string[];
  run_control: {
    stale_after_seconds: number;
    source_tool: "onto.review" | "onto.review_continue";
    request_hash: string | null;
  };
  latest_observed_artifact_ref: string | null;
  error_message?: string | null;
}

interface ReviewEnvironmentWarningsArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  warnings: ReviewEnvironmentWarningProjection[];
}

interface ReviewCancelRequestArtifact {
  schema_version: "1";
  session_id: string;
  requested_at: string;
  requested_by: "mcp";
  reason: string;
}

function activeAttemptPath(sessionRoot: string): string {
  return path.join(sessionRoot, ACTIVE_REVIEW_ATTEMPT_FILENAME);
}

function environmentWarningsPath(sessionRoot: string): string {
  return path.join(sessionRoot, ENVIRONMENT_WARNINGS_FILENAME);
}

function reviewCancelRequestPath(sessionRoot: string): string {
  return path.join(sessionRoot, REVIEW_CANCEL_REQUEST_FILENAME);
}

function activeAttemptStaleAfterSeconds(): number {
  const parsed = Number(process.env.ONTO_REVIEW_ACTIVE_ATTEMPT_STALE_AFTER_SECONDS);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_ACTIVE_ATTEMPT_STALE_AFTER_SECONDS;
}

function stripDomainTokenValue(domainValue: string): string {
  const trimmed = domainValue.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeRefForHash(ref: string | undefined): string | null {
  if (!ref) return null;
  return path.normalize(ref).split(path.sep).join(path.posix.sep);
}

function canonicalReviewRequestIdentity(input: {
  target: string | null;
  intent: string | null;
  domain: string | null;
  targetScopeKind: string | null;
  primaryRef: string | null;
  memberRefs: string[];
  bundleKind: string | null;
  reviewMode: string | null;
  lensIds: string[];
}): Record<string, unknown> | null {
  if (!input.target || !input.intent) return null;
  return {
    schema: "review-request-identity-v2",
    target: normalizeRefForHash(input.target),
    intent: input.intent,
    domain: input.domain ? normalizeDomainValue(input.domain) : null,
    targetScopeKind: input.targetScopeKind,
    primaryRef: normalizeRefForHash(input.primaryRef ?? undefined),
    memberRefs: input.memberRefs.map((ref) => normalizeRefForHash(ref) ?? ref).sort(),
    bundleKind: input.bundleKind,
    reviewMode: input.reviewMode,
    lensIds: [...input.lensIds].sort(),
  };
}

function hashReviewRequestIdentity(identity: Record<string, unknown> | null): string | null {
  if (!identity) return null;
  return crypto.createHash("sha256").update(stableJson(identity)).digest("hex");
}

function requestHashForReviewInput(args: PrepareReviewRequest): string | null {
  return hashReviewRequestIdentity(
    canonicalReviewRequestIdentity({
      target: args.target,
      intent: args.intent,
      domain: args.noDomain ? "none" : args.domain ?? null,
      targetScopeKind: args.targetScopeKind ?? null,
      primaryRef: args.primaryRef ?? null,
      memberRefs: args.memberRefs ?? [],
      bundleKind: args.bundleKind ?? null,
      reviewMode: args.reviewMode ?? null,
      lensIds: args.lensIds ?? [],
    }),
  );
}

function requestHashFromArtifacts(args: {
  metadata: ReviewSessionMetadata | null;
  interpretation: InvocationInterpretationArtifact | null;
  binding?: InvocationBindingArtifact | null;
}): string | null {
  const scope = args.interpretation?.target_scope_candidate;
  return hashReviewRequestIdentity(
    canonicalReviewRequestIdentity({
      target: args.metadata?.requested_target ?? null,
      intent: args.interpretation?.intent_summary ?? null,
      domain: args.binding?.resolved_session_domain ??
        args.metadata?.requested_domain_token ??
        null,
      targetScopeKind: scope?.kind ?? null,
      primaryRef: scope?.primary_ref ?? null,
      memberRefs: scope?.member_refs ?? [],
      bundleKind: scope?.bundle_kind ?? null,
      reviewMode: args.binding?.resolved_review_mode ??
        args.interpretation?.review_mode_recommendation ??
        null,
      lensIds: args.binding?.resolved_lens_set ??
        args.interpretation?.lens_selection_plan?.recommended_lenses ??
        [],
    }),
  );
}

function domainTokenResolution(args: {
  requestedToken: string | null | undefined;
  normalizedDomain: string | null | undefined;
  suggestionIds?: string[];
}): ReviewDomainTokenResolution {
  const requestedToken = args.requestedToken ?? "";
  const stripped = stripDomainTokenValue(requestedToken);
  const normalized = args.normalizedDomain ?? null;
  const suggestionIds = args.suggestionIds ?? [];
  if (normalized === "none") {
    return {
      requestedToken,
      normalizedDomain: null,
      resolution: "no_domain",
      suggestionIds,
    };
  }
  if (!normalized) {
    return {
      requestedToken,
      normalizedDomain: null,
      resolution: suggestionIds.length > 0 ? "suggestion" : "unknown",
      suggestionIds,
    };
  }
  return {
    requestedToken,
    normalizedDomain: normalized,
    resolution:
      stripped.length > 0 && normalizeDomainValue(stripped) !== stripped
        ? "alias"
        : "exact",
    suggestionIds,
  };
}

async function availableDomainIds(
  projectRoot: string,
  ontoHome: string,
): Promise<string[]> {
  const roots = [
    path.join(path.resolve(projectRoot), ".onto", "domains"),
    path.join(os.homedir(), ".onto", "domains"),
    path.join(ontoHome, ".onto", "domains"),
  ];
  const ids = new Set<string>();
  for (const root of roots) {
    for (const id of await listDomainDirs(root)) {
      ids.add(id);
    }
  }
  return [...ids].sort();
}

function domainSimilarityScore(requested: string, candidate: string): number {
  const requestedTokens = new Set(requested.toLowerCase().split(/[-_\s]+/).filter(Boolean));
  const candidateTokens = new Set(candidate.toLowerCase().split(/[-_\s]+/).filter(Boolean));
  let overlap = 0;
  for (const token of requestedTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }
  if (candidate.toLowerCase().includes(requested.toLowerCase()) ||
    requested.toLowerCase().includes(candidate.toLowerCase())) {
    overlap += 2;
  }
  return overlap;
}

function suggestDomainIds(requestedToken: string, availableIds: string[]): string[] {
  const stripped = stripDomainTokenValue(requestedToken).toLowerCase();
  if (!stripped) return [];
  return availableIds
    .map((id) => ({ id, score: domainSimilarityScore(stripped, id) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 5)
    .map((entry) => entry.id);
}

async function validateRequestedDomainForDispatch(
  request: PrepareReviewRequest,
  ontoHome: string,
): Promise<void> {
  if (!request.domain || request.noDomain) return;
  const normalizedDomain = normalizeDomainValue(request.domain);
  if (normalizedDomain === "none") return;
  const domains = await availableDomainIds(request.projectRoot, ontoHome);
  if (domains.includes(normalizedDomain)) return;
  const suggestionIds = suggestDomainIds(request.domain, domains);
  throw new ReviewDomainResolutionError({
    message: suggestionIds.length > 0
      ? `Unknown review domain ${request.domain}. Did you mean: ${suggestionIds.join(", ")}?`
      : `Unknown review domain ${request.domain}; no safe domain suggestion is available.`,
    domainResolution: domainTokenResolution({
      requestedToken: request.domain,
      normalizedDomain: null,
      suggestionIds,
    }),
  });
}

function reviewTerminalStatus(status: ReviewStatus["status"]): boolean {
  return (
    status === "completed" ||
    status === "completed_with_degradation" ||
    status === "halted_partial" ||
    status === "failed"
  );
}

async function readTargetMaterialSupport(
  sessionRoot: string,
  executionPlan: ReviewExecutionPlan | null,
): Promise<ReviewTargetMaterialSupportProjection | null> {
  const targetProfilePath =
    executionPlan?.review_target_profile_path ??
    path.join(sessionRoot, "execution-preparation", "review-target-profile.yaml");
  const targetProfile =
    await readOptionalYaml<ReviewTargetProfileArtifact>(targetProfilePath);
  const profile = targetProfile?.material_profile;
  if (!profile) return null;
  return {
    targetMaterialKind: profile.target_material_kind,
    supportStatus: profile.support_status,
    unsupportedReason: profile.unsupported_reason,
    detectionConfidence: profile.detection.confidence,
    detectionConfidenceBasis: profile.detection.confidence_basis,
  };
}

async function readEnvironmentWarnings(
  sessionRoot: string,
): Promise<ReviewEnvironmentWarningProjection[]> {
  const artifact = await readOptionalYaml<ReviewEnvironmentWarningsArtifact>(
    environmentWarningsPath(sessionRoot),
  );
  return artifact?.warnings ?? [];
}

async function writeEnvironmentWarningsFromStderr(args: {
  sessionRoot: string;
  stderr: string[];
}): Promise<ReviewEnvironmentWarningProjection[]> {
  const warningLines = args.stderr
    .map((line) => line.trim())
    .filter((line) => line.startsWith(REVIEW_RUNNER_WARNING_PREFIX))
    .map((line) => line.slice(REVIEW_RUNNER_WARNING_PREFIX.length).trim())
    .filter((line) => line.length > 0);
  if (warningLines.length === 0) return [];

  const existing = await readEnvironmentWarnings(args.sessionRoot);
  const seenMessages = new Set(existing.map((warning) => warning.message));
  const observedAt = isoNow();
  const additions: ReviewEnvironmentWarningProjection[] = [];
  for (const [index, message] of warningLines.entries()) {
    if (seenMessages.has(message)) continue;
    const digest = crypto
      .createHash("sha256")
      .update(`${observedAt}\n${index}\n${message}`)
      .digest("hex")
      .slice(0, 12);
    additions.push({
      warningId: `environment-warning-${digest}`,
      source: "review_runner_warning",
      message,
      fatality: "non_fatal",
      affectedCapability: "review_execution_observability",
      outputTrustImpact: "unknown",
      observedAt,
    });
  }
  const warnings = [...existing, ...additions];
  if (warnings.length > 0) {
    await writeYamlDocument(environmentWarningsPath(args.sessionRoot), {
      schema_version: "1",
      session_id: basenameSessionId(args.sessionRoot),
      created_at: observedAt,
      warnings,
    });
  }
  return warnings;
}

function activeUnitsForInitialReview(
  executionPlan: ReviewExecutionPlan | null,
): string[] {
  const lensIds = (executionPlan?.lens_execution_seats ?? []).map(
    (seat) => seat.lens_id,
  );
  return lensIds.length > 0
    ? lensIds.map((lensId) => `lens:${lensId}`)
    : ["review_execution"];
}

function requestedUnitsMatchActive(
  activeUnits: string[],
  targetUnits: string[] | undefined,
): boolean {
  if (activeUnits.length === 0) return false;
  if (!targetUnits || targetUnits.length === 0) return true;
  const normalizedActive = new Set(
    activeUnits.flatMap((unit) => {
      const suffix = unit.includes(":") ? unit.split(":").at(-1) ?? unit : unit;
      return [unit, suffix];
    }),
  );
  return targetUnits.some((unit) => normalizedActive.has(unit));
}

async function writeActiveAttemptStarted(args: {
  sessionRoot: string;
  attemptId: string;
  attemptKind: ReviewActiveAttemptProjection["attemptKind"];
  sourceTool: "onto.review" | "onto.review_continue";
  requestHash: string | null;
  activeUnits: string[];
  requestedFrontierUnits?: string[];
}): Promise<void> {
  const sessionMetadata = await readOptionalYaml<ReviewSessionMetadata>(
    path.join(args.sessionRoot, "session-metadata.yaml"),
  );
  const artifactRefs = await collectArtifactRefs(args.sessionRoot);
  const observed = await artifactObservation(artifactRefs);
  const now = isoNow();
  const artifact: ReviewActiveAttemptArtifact = {
    schema_version: "1",
    attempt_id: args.attemptId,
    attempt_kind: args.attemptKind,
    session_id: sessionMetadata?.session_id ?? basenameSessionId(args.sessionRoot),
    session_root: args.sessionRoot,
    project_root: sessionMetadata?.project_root ?? null,
    created_at: now,
    updated_at: now,
    status: "started",
    active_units: args.activeUnits,
    requested_frontier_units: args.requestedFrontierUnits ?? [],
    run_control: {
      stale_after_seconds: activeAttemptStaleAfterSeconds(),
      source_tool: args.sourceTool,
      request_hash: args.requestHash,
    },
    latest_observed_artifact_ref: observed.ref,
  };
  await writeYamlDocument(activeAttemptPath(args.sessionRoot), artifact);
}

async function updateActiveAttemptTerminal(args: {
  sessionRoot: string;
  status: ReviewActiveAttemptProjection["status"];
  errorMessage?: string;
}): Promise<void> {
  const attemptPath = activeAttemptPath(args.sessionRoot);
  const existing = await readOptionalYaml<ReviewActiveAttemptArtifact>(attemptPath);
  if (!existing) return;
  const artifactRefs = await collectArtifactRefs(args.sessionRoot);
  const observed = await artifactObservation(artifactRefs);
  await writeYamlDocument(attemptPath, {
    ...existing,
    updated_at: isoNow(),
    status: args.status,
    latest_observed_artifact_ref: observed.ref,
    ...(args.errorMessage !== undefined ? { error_message: args.errorMessage } : {}),
  });
}

async function activeAttemptProjection(
  sessionRoot: string,
): Promise<ReviewActiveAttemptProjection | null> {
  const attemptPath = activeAttemptPath(sessionRoot);
  const artifact = await readOptionalYaml<ReviewActiveAttemptArtifact>(attemptPath);
  if (!artifact) return null;
  const updatedMs = parseTimestampMs(artifact.updated_at);
  const secondsSinceUpdated = secondsBetween(Date.now(), updatedMs);
  const staleAfterSeconds =
    artifact.run_control?.stale_after_seconds ?? DEFAULT_ACTIVE_ATTEMPT_STALE_AFTER_SECONDS;
  const isStale =
    artifact.status === "started" &&
    secondsSinceUpdated !== null &&
    secondsSinceUpdated > staleAfterSeconds;
  return {
    attemptId: artifact.attempt_id,
    attemptKind: artifact.attempt_kind,
    status: artifact.status,
    sessionId: artifact.session_id,
    sessionRoot: artifact.session_root,
    startedAt: artifact.created_at,
    updatedAt: artifact.updated_at,
    activeUnits: artifact.active_units ?? [],
    requestedFrontierUnits: artifact.requested_frontier_units ?? [],
    latestObservedArtifactRef: artifact.latest_observed_artifact_ref ?? null,
    staleAfterSeconds,
    secondsSinceUpdated,
    isStale,
    attemptManifestRef: attemptPath,
  };
}

async function buildRunControl(
  sessionRoot: string,
  status: ReviewStatus["status"],
): Promise<ReviewRunControlProjection> {
  const activeAttempt = await activeAttemptProjection(sessionRoot);
  const cancellationRequestRef = await fileExists(reviewCancelRequestPath(sessionRoot))
    ? reviewCancelRequestPath(sessionRoot)
    : null;
  const cancellationRequested = cancellationRequestRef !== null;
  const alreadyRunning =
    status === "running" &&
    activeAttempt?.status === "started" &&
    !activeAttempt.isStale;
  const lifecycleState: ReviewRunControlProjection["lifecycleState"] =
    status === "completed" || status === "completed_with_degradation"
      ? "completed"
      : status === "halted_partial"
        ? "halted"
        : activeAttempt?.status === "failed"
          ? "failed_attempt"
          : activeAttempt?.status === "started" && activeAttempt.isStale
            ? "stale_active"
            : cancellationRequested
              ? "cancellation_requested"
              : alreadyRunning
                ? "active"
                : status === "prepared"
                  ? "prepared"
                  : "unknown";
  const continuationAvailable =
    status === "prepared" ||
    status === "halted_partial" ||
    lifecycleState === "failed_attempt" ||
    lifecycleState === "stale_active";
  const cancellationAvailable = alreadyRunning && !cancellationRequested;
  const statusReason =
    lifecycleState === "active"
      ? "review attempt is actively running and can be cancelled"
      : lifecycleState === "cancellation_requested"
        ? "cancellation has already been requested and will be observed at a runtime checkpoint"
        : lifecycleState === "stale_active"
          ? "active attempt is stale; use review_status evidence before continuing"
          : lifecycleState === "failed_attempt"
            ? "active attempt failed before a stronger terminal execution artifact was written"
            : lifecycleState === "prepared"
              ? "review is prepared but no worker attempt is active"
              : lifecycleState === "halted"
                ? "review has halted through execution artifacts"
                : lifecycleState === "completed"
                  ? "review is terminally completed"
                  : "no actionable run-control state is available";
  return {
    activeAttempt,
    lifecycleState,
    alreadyRunning,
    cancellationAvailable,
    cancellationRequested,
    cancellationRequestRef,
    continuationAvailable,
    retryAvailable: continuationAvailable,
    retrySemantics: "use_review_continue",
    hostTimeoutSemantics: "review_continues_under_session",
    statusReason,
  };
}

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
  unit_progress: ReviewRuntimeUnitProgressProjection[];
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
  run_control: ReviewRunControlProjection;
  target_material_support: ReviewTargetMaterialSupportProjection | null;
  environment_warnings: ReviewEnvironmentWarningProjection[];
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

const RUNTIME_UNIT_STALE_AFTER_SECONDS = 300;

type RuntimeLogSignalKind = "started" | "retry" | "completed" | "failed";

interface RuntimeLogSignal {
  unitId: string;
  kind: RuntimeLogSignalKind;
  summary: string;
  at: string | null;
  atMs: number | null;
  attempt: number | null;
  failureMessage: string | null;
}

interface FileObservation {
  exists: boolean;
  size: number;
  mtimeMs: number | null;
}

async function observeFile(filePath: string | null): Promise<FileObservation> {
  if (!filePath) return { exists: false, size: 0, mtimeMs: null };
  try {
    const stat = await fs.stat(filePath);
    return {
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return { exists: false, size: 0, mtimeMs: null };
  }
}

function allReviewUnitResults(
  executionResult: ReviewExecutionResultArtifact | null,
): ReviewUnitExecutionResult[] {
  if (!executionResult) return [];
  return [
    ...executionResult.lens_execution_results,
    ...(executionResult.issue_artifact_execution_results ?? []),
    ...(executionResult.deliberation_execution_results ?? []),
    ...(executionResult.synthesize_execution_result
      ? [executionResult.synthesize_execution_result]
      : []),
  ];
}

function parseRuntimeLogHeading(
  rawHeading: string,
): { at: string | null; title: string } | null {
  const match = /^##\s+(.+?)\s+\|\s+(.+?)\s*$/.exec(rawHeading.trim());
  if (!match?.[2]) return null;
  return {
    at: match[1] ?? null,
    title: match[2],
  };
}

function bodyScalar(body: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, "m").exec(body);
  return match?.[1] ?? null;
}

function parseAttempt(body: string): number | null {
  const raw = bodyScalar(body, "attempt");
  if (!raw) return null;
  const match = /^(\d+)/.exec(raw.trim());
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function runtimeSignalFromEntry(entry: string): RuntimeLogSignal | null {
  const [headingLine, ...bodyLines] = entry.split(/\r?\n/);
  if (!headingLine) return null;
  const heading = parseRuntimeLogHeading(headingLine);
  if (!heading) return null;
  const body = bodyLines.join("\n");
  const title = heading.title;
  const titlePatterns: Array<{
    kind: RuntimeLogSignalKind;
    pattern: RegExp;
    summary: string;
  }> = [
    {
      kind: "started",
      pattern: /^runner dispatch started: (.+?)\s*$/,
      summary: "runner dispatch started",
    },
    {
      kind: "retry",
      pattern: /^runner dispatch retry: (.+?)\s*$/,
      summary: "runner dispatch retry",
    },
    {
      kind: "completed",
      pattern: /^runner (?:nested )?dispatch completed: (.+?)\s*$/,
      summary: "runner dispatch completed",
    },
    {
      kind: "failed",
      pattern: /^(?:lens|deliberation|issue_artifact|synthesize) failure: (.+?)\s*$/,
      summary: "runner dispatch failed",
    },
  ];
  for (const candidate of titlePatterns) {
    const match = candidate.pattern.exec(title);
    if (!match?.[1]) continue;
    const atMs = parseTimestampMs(heading.at);
    return {
      unitId: match[1],
      kind: candidate.kind,
      summary: candidate.summary,
      at: heading.at,
      atMs,
      attempt: candidate.kind === "retry" ? parseAttempt(body) : null,
      failureMessage: candidate.kind === "failed" ? bodyScalar(body, "message") : null,
    };
  }
  return null;
}

async function runtimeLogSignalsByUnit(
  errorLogPath: string,
): Promise<Map<string, RuntimeLogSignal[]>> {
  const text = await readOptionalText(errorLogPath);
  const signals = new Map<string, RuntimeLogSignal[]>();
  if (!text) return signals;
  for (const rawEntry of text.split(/\n(?=## )/)) {
    const signal = runtimeSignalFromEntry(rawEntry.trimEnd());
    if (!signal) continue;
    signals.set(signal.unitId, [...(signals.get(signal.unitId) ?? []), signal]);
  }
  return signals;
}

function latestRuntimeSignal(
  signals: RuntimeLogSignal[],
): RuntimeLogSignal | null {
  if (signals.length === 0) return null;
  return signals.reduce((latest, signal) => {
    const latestMs = latest.atMs ?? -1;
    const signalMs = signal.atMs ?? -1;
    return signalMs >= latestMs ? signal : latest;
  });
}

function runtimeSignalCount(
  signals: RuntimeLogSignal[],
  kind: RuntimeLogSignalKind,
): number {
  return signals.filter((signal) => signal.kind === kind).length;
}

function runtimeUnitAlias(unitKind: string, unitId: string): string {
  if (unitKind === "lens") return `lens:${unitId}`;
  if (unitKind === "deliberation" && unitId.startsWith("deliberation-")) {
    return `deliberation:${unitId.replace(/^deliberation-/, "")}`;
  }
  return unitId;
}

function runtimeUnitStepId(unitKind: string): ReviewProgressStepId | null {
  if (unitKind === "lens") return "lens_dispatch";
  if (unitKind === "deliberation") return "lens_deliberation_responses";
  return null;
}

async function deriveRuntimeUnitProgress(args: {
  executionPlan: ReviewExecutionPlan | null;
  executionResult: ReviewExecutionResultArtifact | null;
  nowMs: number;
}): Promise<ReviewRuntimeUnitProgressProjection[]> {
  const executionPlan = args.executionPlan;
  if (!executionPlan) return [];
  const signalsByUnit = await runtimeLogSignalsByUnit(executionPlan.error_log_path);
  const terminalResultsByUnit = new Map(
    allReviewUnitResults(args.executionResult).map((result) => [
      result.unit_id,
      result,
    ]),
  );
  const lensUnits = executionPlan.lens_execution_seats.map((seat) => {
    const packetPath =
      executionPlan.lens_prompt_packet_seats.find(
        (packetSeat) => packetSeat.lens_id === seat.lens_id,
      )?.packet_path ?? null;
    return {
      unitId: seat.lens_id,
      unitKind: "lens",
      packetPath,
      outputPath: seat.output_path,
      runningLogRef: path.join(path.dirname(seat.output_path), `.${seat.lens_id}.running.log`),
    };
  });

  const projections: ReviewRuntimeUnitProgressProjection[] = [];
  for (const unit of lensUnits) {
    const output = await observeFile(unit.outputPath);
    const runningLog = await observeFile(unit.runningLogRef);
    const signals = signalsByUnit.get(unit.unitId) ?? [];
    const latestSignal = latestRuntimeSignal(signals);
    const terminalResult = terminalResultsByUnit.get(unit.unitId);
    const retryCount = runtimeSignalCount(signals, "retry");
    const hasStarted =
      signals.some((signal) => signal.kind === "started") ||
      runningLog.exists;
    const attemptCount = Math.max(
      terminalResult ? 1 : 0,
      hasStarted ? retryCount + 1 : 0,
    );

    let latestSignalName = latestSignal?.summary ?? null;
    let latestSignalAt = latestSignal?.at ?? null;
    let latestSignalMs = latestSignal?.atMs ?? null;
    if (
      runningLog.exists &&
      runningLog.mtimeMs !== null &&
      (latestSignalMs === null || runningLog.mtimeMs > latestSignalMs)
    ) {
      latestSignalName = "running log updated";
      latestSignalAt = isoFromTimestamp(runningLog.mtimeMs);
      latestSignalMs = runningLog.mtimeMs;
    }

    let status: ReviewRuntimeUnitStatus = "pending";
    let failureMessage = latestSignal?.failureMessage ?? null;
    if (terminalResult?.status === "failed") {
      status = "failed";
      latestSignalName = "terminal execution result failed";
      latestSignalAt = terminalResult.completed_at;
      latestSignalMs = parseTimestampMs(terminalResult.completed_at);
      failureMessage = terminalResult.failure_message ?? failureMessage;
    } else if (
      terminalResult?.status === "completed" ||
      latestSignal?.kind === "completed" ||
      (output.exists && output.size > 0)
    ) {
      status = "completed";
      if (!latestSignalName || (output.mtimeMs !== null && output.mtimeMs > (latestSignalMs ?? -1))) {
        latestSignalName = "output file present";
        latestSignalAt = output.mtimeMs === null ? null : isoFromTimestamp(output.mtimeMs);
        latestSignalMs = output.mtimeMs;
      }
    } else if (latestSignal?.kind === "failed") {
      status = "failed";
      failureMessage = latestSignal.failureMessage;
    } else if (latestSignal?.kind === "retry") {
      const seconds = secondsBetween(args.nowMs, latestSignalMs);
      status =
        seconds !== null && seconds > RUNTIME_UNIT_STALE_AFTER_SECONDS
          ? "running_stale"
          : "retrying";
    } else if (hasStarted) {
      const seconds = secondsBetween(args.nowMs, latestSignalMs);
      status =
        seconds !== null && seconds > RUNTIME_UNIT_STALE_AFTER_SECONDS
          ? "running_stale"
          : "running";
    }

    projections.push({
      unitId: unit.unitId,
      publicAlias: runtimeUnitAlias(unit.unitKind, unit.unitId),
      unitKind: unit.unitKind,
      progressStepId: runtimeUnitStepId(unit.unitKind),
      status,
      packetPath: unit.packetPath,
      outputPath: unit.outputPath,
      runningLogRef: runningLog.exists ? unit.runningLogRef : null,
      latestSignal: latestSignalName,
      latestSignalAt,
      secondsSinceLatestSignal: secondsBetween(args.nowMs, latestSignalMs),
      attemptCount,
      failureMessage,
    });
  }
  return projections;
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

  const plannedLensIds = (params.executionPlan?.lens_execution_seats ?? []).map(
    (seat) => seat.lens_id,
  );
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
    (params.executionPlan?.lens_deliberation_prompt_packet_seats ?? []).map(
      (seat) => seat.lens_id,
    );
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
    const planned = (params.executionPlan?.lens_execution_seats ?? []).map(
      (seat) => seat.lens_id,
    );
    const completed = new Set(await existingSeatIds(params.executionPlan?.lens_execution_seats));
    const pending = planned.filter((lensId) => !completed.has(lensId));
    return (pending.length > 0 ? pending : planned).map((lensId) => `lens:${lensId}`);
  }

  if (params.currentStepId === "lens_deliberation_responses") {
    const planned =
      (params.executionPlan?.lens_deliberation_prompt_packet_seats ?? []).map(
        (seat) => seat.lens_id,
      );
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
  const unitProgress = await deriveRuntimeUnitProgress({
    executionPlan: params.executionPlan,
    executionResult: params.executionResult,
    nowMs,
  });
  const runtimeActiveUnits = unitProgress
    .filter((unit) =>
      unit.status === "running" ||
      unit.status === "retrying" ||
      unit.status === "running_stale",
    )
    .map((unit) => unit.publicAlias);
  const progressActiveUnits =
    currentStepId === "lens_dispatch" && unitProgress.length > 0
      ? runtimeActiveUnits
      : await activeUnits({
          status: params.status,
          currentStepId,
          executionPlan: params.executionPlan,
          executionResult: params.executionResult,
        });
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
    active_units: progressActiveUnits,
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
    unit_progress: unitProgress,
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
  const runControl = await buildRunControl(params.sessionRoot, params.status);
  const targetMaterialSupport = await readTargetMaterialSupport(
    params.sessionRoot,
    params.executionPlan,
  );
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
    run_control: runControl,
    target_material_support: targetMaterialSupport,
    environment_warnings: await readEnvironmentWarnings(params.sessionRoot),
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
          binding_notes: binding.binding_notes ?? [],
        }
      : null,
    review_target_profile: reviewTargetProfile
      ? {
          target_input_kind: reviewTargetProfile.target_input_kind,
          target_material_kind: reviewTargetProfile.target_material_kind,
          material_profile: reviewTargetProfile.material_profile,
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

async function buildReviewRunHandle(args: {
  sessionRoot: string;
  status: ReviewStatus["status"];
  invocationId: string;
  requestHash?: string | null;
}): Promise<ReviewRunHandle> {
  const artifactRefs = await collectArtifactRefs(args.sessionRoot);
  const executionPlan = await readOptionalYaml<ReviewExecutionPlan>(
    path.join(args.sessionRoot, "execution-plan.yaml"),
  );
  const metadata = await readOptionalYaml<ReviewSessionMetadata>(
    path.join(args.sessionRoot, "session-metadata.yaml"),
  );
  const interpretation = await readOptionalYaml<InvocationInterpretationArtifact>(
    path.join(args.sessionRoot, "interpretation.yaml"),
  );
  const binding = await readOptionalYaml<InvocationBindingArtifact>(
    path.join(args.sessionRoot, "binding.yaml"),
  );
  const targetProfile = await readOptionalYaml<ReviewTargetProfileArtifact>(
    executionPlan?.review_target_profile_path ??
      path.join(args.sessionRoot, "execution-preparation", "review-target-profile.yaml"),
  );
  const requestHash =
    args.requestHash ??
      requestHashFromArtifacts({ metadata, interpretation, binding });
  const normalizedDomain =
    binding?.resolved_session_domain ??
    targetProfile?.domain ??
    (metadata?.requested_domain_token
      ? normalizeDomainValue(metadata.requested_domain_token)
      : null);
  return {
    schemaVersion: "1",
    sessionId:
      metadata?.session_id ?? executionPlan?.session_id ?? basenameSessionId(args.sessionRoot),
    sessionRoot: args.sessionRoot,
    invocationId: args.invocationId,
    status: args.status,
    projectRoot: metadata?.project_root ?? null,
    target: {
      requestedTarget:
        metadata?.requested_target ?? targetProfile?.requested_target ?? null,
      targetScopeKind: targetProfile?.target_scope_kind ?? null,
      targetMaterialKind: targetProfile?.target_material_kind ?? null,
    },
    domain: domainTokenResolution({
      requestedToken: metadata?.requested_domain_token ?? null,
      normalizedDomain,
    }),
    artifactRefs: {
      sessionMetadata: artifactRefs.session_metadata ?? null,
      executionPlan: artifactRefs.execution_plan ?? null,
      reviewRunManifest: artifactRefs.review_run_manifest ?? null,
      executionResult: artifactRefs.execution_result ?? null,
      finalOutput: artifactRefs.final_output ?? null,
      reviewRecord: artifactRefs.review_record ?? null,
    },
    requestHash,
    pollAfterSeconds: reviewTerminalStatus(args.status) ? null : 5,
  };
}

async function buildRunningReviewRunResult(args: {
  sessionRoot: string;
  invocationId: string;
  requestHash?: string | null;
}): Promise<ReviewRunResult> {
  const sessionRoot = path.resolve(args.sessionRoot);
  const artifactRefs = await collectArtifactRefs(sessionRoot);
  const failures = await collectStructuredFailures(sessionRoot);
  const executionPlan = await readOptionalYaml<ReviewExecutionPlan>(
    path.join(sessionRoot, "execution-plan.yaml"),
  );
  const executionResult = await readOptionalYaml<ReviewExecutionResultArtifact>(
    path.join(sessionRoot, "execution-result.yaml"),
  );
  const reviewRecord = await readOptionalReviewRecord(
    path.join(sessionRoot, "review-record.yaml"),
  );
  const progressInput = await buildReviewStatusPresentationInput({
    sessionRoot,
    status: "running",
    artifactRefs,
    executionPlan,
    executionResult,
    reviewRecord,
  });
  const runHandle = await buildReviewRunHandle({
    sessionRoot,
    status: "running",
    invocationId: args.invocationId,
    ...(args.requestHash !== undefined ? { requestHash: args.requestHash } : {}),
  });
  const llmPresentation: LlmPresentationPrompts = {
    progress: buildProgressPresentation(progressInput),
  };
  if (executionPlan) {
    llmPresentation.openingBrief = buildOpeningBriefPresentation(
      await buildPreparedOpeningBriefInput(sessionRoot, executionPlan),
    );
  }
  return {
    sessionId: runHandle.sessionId,
    sessionRoot,
    status: "running",
    finalOutputPath:
      executionPlan?.final_output_path ?? path.join(sessionRoot, "final-output.md"),
    reviewRecordPath:
      executionPlan?.review_record_path ?? path.join(sessionRoot, "review-record.yaml"),
    executionResultPath:
      executionPlan?.execution_result_path ?? path.join(sessionRoot, "execution-result.yaml"),
    reviewRunManifestPath: path.join(sessionRoot, "review-run-manifest.yaml"),
    deliberationStatus: null,
    participatingLensIds: [],
    degradedLensIds: [],
    artifactRefs,
    ...failures,
    routeVisibility: await buildReviewRouteVisibilityFromSession(sessionRoot),
    llmPresentation,
    runHandle,
    runControl: progressInput.run_control,
    targetMaterialSupport: progressInput.target_material_support,
    environmentWarnings: progressInput.environment_warnings,
  };
}

async function collectArtifactRefs(sessionRoot: string): Promise<Record<string, string>> {
  return collectReviewInvocationArtifactRefs(sessionRoot);
}

async function buildPipelineExecutionLedgerIfPossible(args: {
  sessionRoot: string;
  artifactRefs: Record<string, string>;
  executionPlan: ReviewExecutionPlan | null;
  executionResult: ReviewExecutionResultArtifact | null;
}): Promise<PipelineExecutionLedger | undefined> {
  if (!args.executionPlan) return undefined;
  const reviewRunManifest = await readOptionalYaml<ReviewRunManifestForLedger>(
    path.join(args.sessionRoot, "review-run-manifest.yaml"),
  );
  const lensCompletionBarrier =
    await readOptionalYaml<ReviewLensCompletionBarrierArtifact>(
      path.join(args.sessionRoot, "lens-completion-barrier.yaml"),
  );
  try {
    return await buildReviewPipelineExecutionLedger({
      sessionRoot: args.sessionRoot,
      artifactRefs: args.artifactRefs,
      executionPlan: args.executionPlan,
      executionResult: args.executionResult,
      reviewRunManifest,
      lensCompletionBarrier,
    });
  } catch {
    return undefined;
  }
}

interface ReviewRunManifestForContinue {
  review_execution_profile?: {
    mode?: unknown;
    teamlead?: unknown;
    lens?: unknown;
    synthesize?: unknown;
    deliberation?: unknown;
    runtime_route?: {
      worker_executor?: unknown;
      host_runtime?: unknown;
      runtime_provider?: unknown;
      auth_mode?: unknown;
    };
    model?: unknown;
    effort?: unknown;
    service_tier?: unknown;
    base_url?: unknown;
    trace?: unknown;
  } | null;
}

function workerExecutorToRealization(
  workerExecutor: unknown,
): ReviewExecutorRealization | null {
  if (workerExecutor === "mock") return "mock";
  if (workerExecutor === "codex") return "codex";
  if (workerExecutor === "direct_call") return "ts_inline_http";
  return null;
}

function workerExecutorFromRealization(
  realization: ReviewExecutorRealization,
): ReviewWorkerExecutor {
  if (realization === "mock") return "mock";
  if (realization === "codex") return "codex";
  return "direct_call";
}

function reviewExecutionHostFromRuntime(
  hostRuntime: unknown,
  workerExecutor: ReviewWorkerExecutor,
): ReviewExecutionHost {
  if (workerExecutor === "mock") return "standalone";
  if (workerExecutor === "codex") return "codex";
  if (
    hostRuntime === "openai" ||
    hostRuntime === "anthropic" ||
    hostRuntime === "grok" ||
    hostRuntime === "lmstudio"
  ) {
    return hostRuntime;
  }
  return "openai";
}

function reviewExecutionProfileFromManifest(
  manifest: ReviewRunManifestForContinue | null,
): ReviewExecutionProfile | undefined {
  const profile = manifest?.review_execution_profile;
  const route = profile?.runtime_route;
  const workerExecutor = route?.worker_executor;
  if (
    workerExecutor !== "mock" &&
    workerExecutor !== "codex" &&
    workerExecutor !== "direct_call"
  ) {
    return undefined;
  }
  if (
    profile?.mode !== "main-workers" &&
    profile?.mode !== "nested-workers"
  ) {
    return undefined;
  }
  if (
    profile.teamlead === null ||
    typeof profile.teamlead !== "object" ||
    profile.lens === null ||
    typeof profile.lens !== "object" ||
    profile.synthesize === null ||
    typeof profile.synthesize !== "object" ||
    typeof profile.deliberation !== "string"
  ) {
    return undefined;
  }
  const host = reviewExecutionHostFromRuntime(route?.host_runtime, workerExecutor);
  const runtimeProvider =
    typeof route?.runtime_provider === "string" &&
    route.runtime_provider !== "mock" &&
    route.runtime_provider !== "codex"
      ? route.runtime_provider
      : undefined;
  const authMode =
    route?.auth_mode === "api_key" ||
    route?.auth_mode === "oauth" ||
    route?.auth_mode === "local"
      ? route.auth_mode
      : undefined;

  const reconstructed: ReviewExecutionProfile = {
    mode: profile.mode,
    teamlead: profile.teamlead as ReviewExecutionProfile["teamlead"],
    lens: profile.lens as ReviewExecutionProfile["lens"],
    synthesize: profile.synthesize as ReviewExecutionProfile["synthesize"],
    deliberation: profile.deliberation as ReviewExecutionProfile["deliberation"],
    worker_executor: workerExecutor,
    host,
    trace: Array.isArray(profile.trace)
      ? profile.trace.filter((item): item is string => typeof item === "string")
      : [],
  };
  if (runtimeProvider) {
    reconstructed.provider =
      runtimeProvider as NonNullable<ReviewExecutionProfile["provider"]>;
  }
  if (authMode) {
    reconstructed.auth =
      authMode as NonNullable<ReviewExecutionProfile["auth"]>;
  }
  if (typeof profile.model === "string") reconstructed.model = profile.model;
  if (typeof profile.effort === "string") reconstructed.effort = profile.effort;
  if (typeof profile.service_tier === "string") {
    reconstructed.service_tier = profile.service_tier;
  }
  if (typeof profile.base_url === "string") {
    reconstructed.base_url = profile.base_url;
  }
  return reconstructed;
}

function reviewExecutionProfileFromActorProfiles(args: {
  actorProfiles: ReviewActorInvocationProfilesArtifact | null;
  executorRealization: ReviewExecutorRealization;
}): ReviewExecutionProfile | undefined {
  const profiles = args.actorProfiles?.profiles ?? [];
  const teamlead = profiles.find((profile) => profile.actor_kind === "teamlead");
  const lens = profiles.find((profile) => profile.actor_kind === "lens");
  const synthesize = profiles.find((profile) => profile.actor_kind === "synthesize");
  if (!teamlead || !lens || !synthesize) return undefined;
  const workerExecutor = workerExecutorFromRealization(args.executorRealization);
  const host = reviewExecutionHostFromRuntime(
    teamlead.host_runtime,
    workerExecutor,
  );
  const runtimeProvider =
    teamlead.runtime_provider &&
    teamlead.runtime_provider !== "mock" &&
    teamlead.runtime_provider !== "codex"
      ? teamlead.runtime_provider
      : undefined;
  const reconstructed: ReviewExecutionProfile = {
    mode: "main-workers",
    teamlead: { seat: teamlead.seat, llm: "inherit" },
    lens: { seat: lens.seat, llm: "inherit" },
    synthesize: { seat: synthesize.seat, llm: "inherit" },
    deliberation: "controlled-lens-deliberation",
    worker_executor: workerExecutor,
    host,
    trace: ["reconstructed_from_actor_invocation_profiles_for_continuation"],
  };
  if (runtimeProvider) {
    reconstructed.provider =
      runtimeProvider as NonNullable<ReviewExecutionProfile["provider"]>;
  }
  if (
    teamlead.auth_mode === "api_key" ||
    teamlead.auth_mode === "oauth" ||
    teamlead.auth_mode === "local"
  ) {
    reconstructed.auth =
      teamlead.auth_mode as NonNullable<ReviewExecutionProfile["auth"]>;
  }
  if (teamlead.model) reconstructed.model = teamlead.model;
  if (teamlead.effort) reconstructed.effort = teamlead.effort;
  if (teamlead.service_tier) reconstructed.service_tier = teamlead.service_tier;
  if (teamlead.base_url) reconstructed.base_url = teamlead.base_url;
  return reconstructed;
}

function executorRealizationFromManifest(
  manifest: ReviewRunManifestForContinue | null,
): ReviewExecutorRealization | null {
  return workerExecutorToRealization(
    manifest?.review_execution_profile?.runtime_route?.worker_executor,
  );
}

function continuationAttemptId(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "Z");
  return `${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
}

async function copySupersededArtifacts(args: {
  attemptRoot: string;
  artifactRefs: string[];
}): Promise<ReviewContinuationAttempt["supersededArtifactBackups"]> {
  const backupRoot = path.join(args.attemptRoot, "superseded-artifacts");
  const backups: ReviewContinuationAttempt["supersededArtifactBackups"] = [];
  for (const [index, sourceRef] of args.artifactRefs.entries()) {
    if (!(await fileExists(sourceRef))) continue;
    await fs.mkdir(backupRoot, { recursive: true });
    const backupRef = path.join(
      backupRoot,
      `${String(index + 1).padStart(3, "0")}-${path.basename(sourceRef)}`,
    );
    await fs.copyFile(sourceRef, backupRef);
    backups.push({ sourceRef, backupRef });
  }
  return backups;
}

async function restoreSupersededArtifacts(
  backups: ReviewContinuationAttempt["supersededArtifactBackups"],
): Promise<ReviewContinuationArtifactRestore[]> {
  const restores: ReviewContinuationArtifactRestore[] = [];
  for (const backup of backups) {
    try {
      await fs.mkdir(path.dirname(backup.sourceRef), { recursive: true });
      await fs.copyFile(backup.backupRef, backup.sourceRef);
      restores.push({ ...backup, restored: true });
    } catch (error) {
      restores.push({
        ...backup,
        restored: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return restores;
}

function continuationSessionArtifactRefs(args: {
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
}): string[] {
  return [
    args.executionPlan.execution_result_path,
    path.join(args.sessionRoot, "review-run-manifest.yaml"),
    path.join(args.sessionRoot, "degradation-summary.yaml"),
    args.executionPlan.error_log_path,
    args.executionPlan.synthesis_output_path,
    args.executionPlan.deliberation_output_path,
    args.executionPlan.final_output_path,
    args.executionPlan.review_record_path,
  ];
}

async function resolveContinuationRequestText(args: {
  sessionRoot: string;
  requestText?: string;
}): Promise<string> {
  if (typeof args.requestText === "string" && args.requestText.trim().length > 0) {
    return args.requestText;
  }
  const reviewRecord = await readOptionalReviewRecord(
    path.join(args.sessionRoot, "review-record.yaml"),
  );
  if (reviewRecord?.request_text) return reviewRecord.request_text;
  const interpretation = await readOptionalYaml<InvocationInterpretationArtifact>(
    path.join(args.sessionRoot, "interpretation.yaml"),
  );
  if (interpretation?.intent_summary) return interpretation.intent_summary;
  const targetProfile = await readOptionalYaml<ReviewTargetProfileArtifact>(
    path.join(args.sessionRoot, "execution-preparation", "review-target-profile.yaml"),
  );
  if (targetProfile?.review_intent_summary) {
    return targetProfile.review_intent_summary;
  }
  const metadata = await readOptionalYaml<ReviewSessionMetadata>(
    path.join(args.sessionRoot, "session-metadata.yaml"),
  );
  return metadata?.requested_target
    ? `Continue review for ${metadata.requested_target}`
    : "Continue review";
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
      .filter((entry) => entry.isDirectory() && !isDeprecatedDomainAlias(entry.name))
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

  const api: OntoReviewCoreApi = {
    async prepareReview(request: PrepareReviewRequest): Promise<PreparedReview> {
      await validateRequestedDomainForDispatch(request, ontoHome);
      const result = await prepareReviewInvocationRequest(request, { ontoHome });
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
      await validateRequestedDomainForDispatch(request, ontoHome);
      const requestHash = requestHashForReviewInput(request);
      const invocationId = `initial-${continuationAttemptId()}`;
      let progressSequence = 0;
      let observedSessionRoot: string | null = null;
      let sessionRootResolved = false;
      let activeAttemptWrite: Promise<void> | null = null;
      let resolveSessionRoot: (sessionRoot: string) => void = () => {};
      const sessionRootSeen = new Promise<string>((resolve) => {
        resolveSessionRoot = resolve;
      });
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
      const noteSessionRoot = (sessionRoot: string): void => {
        const resolved = path.resolve(sessionRoot);
        observedSessionRoot = resolved;
        if (sessionRootResolved) return;
        sessionRootResolved = true;
        resolveSessionRoot(resolved);
        activeAttemptWrite = (async () => {
          const executionPlan = await readOptionalYaml<ReviewExecutionPlan>(
            path.join(resolved, "execution-plan.yaml"),
          );
          await writeActiveAttemptStarted({
            sessionRoot: resolved,
            attemptId: invocationId,
            attemptKind: "initial_review",
            sourceTool: "onto.review",
            requestHash,
            activeUnits: activeUnitsForInitialReview(executionPlan),
          });
        })().catch(() => {
          // Active-attempt metadata is an operational projection; review
          // execution remains artifact-truthful even if this write fails.
        });
      };
      const runnerProgressObserver = (event: ReviewInvocationProgressEvent): void => {
        if (event.sessionRoot) noteSessionRoot(event.sessionRoot);
        const stage: ReviewNativeProgressStage =
          event.phase === "prepare"
            ? "session_planned"
            : event.phase === "execute"
              ? "runtime_step"
              : event.phase === "project"
                ? "completed"
                : "invoke_step";
        const current =
          event.phase === "resolve"
            ? 5
            : event.phase === "prepare"
              ? 20
              : event.phase === "execute"
                ? event.status === "completed" ? 80 : 40
                : event.phase === "complete"
                  ? event.status === "completed" ? 95 : 85
                  : 100;
        emitProgress({
          source: "artifact_status",
          stage,
          session_root: event.sessionRoot ?? observedSessionRoot,
          message: event.message,
          progress: {
            current,
            total: 100,
            label: event.phase,
          },
        });
      };

      const fullRun = (async (): Promise<ReviewRunResult> => {
        try {
          const invocation = await runReviewInvocation(request, {
            ontoHome,
            noWatch: true,
            progressObserver: runnerProgressObserver,
          });
          const parsed = invocation.output;
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
          noteSessionRoot(resolvedResultSessionRoot);
          await activeAttemptWrite;
          await writeEnvironmentWarningsFromStderr({
            sessionRoot: resolvedResultSessionRoot,
            stderr: invocation.stderr,
          });
          await updateActiveAttemptTerminal({
            sessionRoot: resolvedResultSessionRoot,
            status: status === "halted_partial" ? "halted_partial" : "completed",
          });
          const artifactRefs = await collectArtifactRefs(resolvedResultSessionRoot);
          const failures = await collectStructuredFailures(resolvedResultSessionRoot);
          const executionPlan = await readOptionalYaml<ReviewExecutionPlan>(
            path.join(resolvedResultSessionRoot, "execution-plan.yaml"),
          );
          const executionResult = await readOptionalYaml<ReviewExecutionResultArtifact>(
            path.join(resolvedResultSessionRoot, "execution-result.yaml"),
          );
          const pipelineExecutionLedger =
            await buildPipelineExecutionLedgerIfPossible({
              sessionRoot: resolvedResultSessionRoot,
              artifactRefs,
              executionPlan,
              executionResult,
            });
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
            ...(pipelineExecutionLedger ? { pipelineExecutionLedger } : {}),
            resultClassificationSummary,
            ...failures,
            routeVisibility:
              await buildReviewRouteVisibilityFromSession(resolvedResultSessionRoot),
            startPreview,
            llmPresentation,
            runHandle: await buildReviewRunHandle({
              sessionRoot: resolvedResultSessionRoot,
              status,
              invocationId,
            }),
            runControl: progressInput.run_control,
            targetMaterialSupport: progressInput.target_material_support,
            environmentWarnings: progressInput.environment_warnings,
          };
        } catch (error) {
          if (observedSessionRoot) {
            await updateActiveAttemptTerminal({
              sessionRoot: observedSessionRoot,
              status: "failed",
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          }
          throw error;
        }
      })();

      if (request.returnRunningAfterMs !== undefined) {
        const waitMs = Math.max(0, request.returnRunningAfterMs);
        const earlyRunning = (async (): Promise<ReviewRunResult> => {
          const sessionRoot = await sessionRootSeen;
          if (activeAttemptWrite) await activeAttemptWrite;
          if (waitMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
          }
          return buildRunningReviewRunResult({
            sessionRoot,
            invocationId,
          });
        })();
        const winner = await Promise.race([
          fullRun.then((result) => ({ kind: "completed" as const, result })),
          earlyRunning.then((result) => ({ kind: "running" as const, result })),
        ]);
        if (winner.kind === "running") {
          fullRun.catch(() => {
            // The session artifacts and active-attempt projection record the failure.
          });
        }
        return winner.result;
      }

      return fullRun;
    },

    async continueReview(
      request: ContinueReviewRequest,
    ): Promise<ReviewContinueResult> {
      const resolvedSessionRoot = path.resolve(request.sessionRoot);
      const sessionMetadataPath = path.join(
        resolvedSessionRoot,
        "session-metadata.yaml",
      );
      const sessionMetadata = await readOptionalYaml<ReviewSessionMetadata>(
        sessionMetadataPath,
      );
      if (!sessionMetadata) {
        throw new Error(
          `Cannot continue review without session-metadata.yaml: ${resolvedSessionRoot}`,
        );
      }
      const projectRoot = path.resolve(
        request.projectRoot ?? sessionMetadata.project_root,
      );
      await assertSamePath({
        label: "ReviewSessionMetadata.project_root",
        expected: projectRoot,
        actual: sessionMetadata.project_root,
      });
      const artifactRefs = await collectArtifactRefs(resolvedSessionRoot);
      const executionPlan = await readOptionalYaml<ReviewExecutionPlan>(
        path.join(resolvedSessionRoot, "execution-plan.yaml"),
      );
      if (!executionPlan) {
        throw new Error(
          `Cannot continue review without execution-plan.yaml: ${resolvedSessionRoot}`,
        );
      }
      if (executionPlan.session_id !== sessionMetadata.session_id) {
        throw new Error(
          `Review continuation session id mismatch: metadata=${sessionMetadata.session_id}, executionPlan=${executionPlan.session_id}`,
        );
      }
      await assertSamePath({
        label: "ReviewExecutionPlan.session_metadata_path",
        expected: sessionMetadataPath,
        actual: executionPlan.session_metadata_path,
      });
      await assertReviewExecutionPlanSessionBoundary({
        sessionRoot: resolvedSessionRoot,
        executionPlan,
      });
      const activeRunControl = await buildRunControl(
        resolvedSessionRoot,
        "running",
      );
      if (
        activeRunControl.alreadyRunning &&
        requestedUnitsMatchActive(
          activeRunControl.activeAttempt?.activeUnits ?? [],
          request.targetUnits,
        )
      ) {
        const status = await api.getReviewStatus(resolvedSessionRoot);
        return {
          sessionId: status.sessionId,
          sessionRoot: resolvedSessionRoot,
          decision: "already_running",
          status: "running",
          artifactRefs: status.artifactRefs,
          failureRefs: status.failureRefs,
          ...(status.pipelineExecutionLedger
            ? { pipelineExecutionLedger: status.pipelineExecutionLedger }
            : {}),
          resultClassificationSummary:
            await readReviewResultClassification(resolvedSessionRoot),
          ...(status.routeVisibility !== undefined
            ? { routeVisibility: status.routeVisibility }
            : {}),
          ...(status.llmPresentation !== undefined
            ? { llmPresentation: status.llmPresentation }
            : {}),
          ...(activeRunControl.activeAttempt
            ? { activeAttempt: activeRunControl.activeAttempt }
            : {}),
        };
      }
      const executionResult = await readOptionalYaml<ReviewExecutionResultArtifact>(
        path.join(resolvedSessionRoot, "execution-result.yaml"),
      );
      const pipelineExecutionLedger =
        await buildPipelineExecutionLedgerIfPossible({
          sessionRoot: resolvedSessionRoot,
          artifactRefs,
          executionPlan,
          executionResult,
        });
      if (!pipelineExecutionLedger) {
        throw new Error(
          `Cannot continue review without a PipelineExecutionLedger: ${resolvedSessionRoot}`,
        );
      }
      const continuationPlan = buildReviewContinuationPlan({
        ledger: pipelineExecutionLedger,
        ...(request.targetUnits !== undefined
          ? { targetUnits: request.targetUnits }
          : {}),
      });
      if (!continuationPlan.eligible) {
        throw new Error(
          `Review continuation is not eligible: ${continuationPlan.ineligibleReason ?? "unknown reason"}`,
        );
      }

      const reviewRunManifest =
        await readOptionalYaml<ReviewRunManifestForContinue>(
          path.join(resolvedSessionRoot, "review-run-manifest.yaml"),
        );
      const executorRealization =
        request.executorRealization ??
        executorRealizationFromManifest(reviewRunManifest);
      if (!executorRealization) {
        throw new Error(
          "Review continuation requires executorRealization when the prior review-run-manifest does not expose a worker executor.",
        );
      }
      const actorProfiles = await readOptionalYaml<ReviewActorInvocationProfilesArtifact>(
        executionPlan.actor_invocation_profiles_path ??
          path.join(
            resolvedSessionRoot,
            "execution-preparation",
            "actor-invocation-profiles.yaml",
          ),
      );
      const manifestReviewExecutionProfile =
        request.executorRealization === undefined
          ? reviewExecutionProfileFromManifest(reviewRunManifest)
          : undefined;
      const actorProfileReviewExecutionProfile = manifestReviewExecutionProfile
        ? undefined
        : reviewExecutionProfileFromActorProfiles({
            actorProfiles,
            executorRealization,
          });
      const reviewExecutionProfile =
        manifestReviewExecutionProfile ?? actorProfileReviewExecutionProfile;
      const reviewExecutionProfileSource = manifestReviewExecutionProfile
        ? "review-run-manifest"
        : actorProfileReviewExecutionProfile
          ? "actor-invocation-profiles"
          : "none";
      const attemptId = continuationAttemptId();
      const attemptRoot = path.join(
        resolvedSessionRoot,
        "continuation-attempts",
        attemptId,
      );
      const continuationPlanPath = path.join(
        attemptRoot,
        "continuation-plan.yaml",
      );
      const attemptManifestPath = path.join(
        attemptRoot,
        "continuation-attempt.yaml",
      );
      await writeYamlDocument(continuationPlanPath, continuationPlan);
      const supersededArtifactBackups = await copySupersededArtifacts({
        attemptRoot,
        artifactRefs: [
          ...new Set([
            ...continuationPlan.supersededArtifactRefs,
            ...continuationSessionArtifactRefs({
              sessionRoot: resolvedSessionRoot,
              executionPlan,
            }),
          ]),
        ],
      });
      const attemptStartedAt = isoNow();
      const writeAttemptManifest = async (
        status: "started" | "completed" | "halted_partial" | "failed",
        extra: Record<string, unknown> = {},
      ): Promise<void> => {
        await writeYamlDocument(attemptManifestPath, {
          schema_version: "1",
          attempt_id: attemptId,
          session_id: executionPlan.session_id,
          session_root: resolvedSessionRoot,
          created_at: attemptStartedAt,
          updated_at: isoNow(),
          status,
          executor_realization: executorRealization,
          target_units: request.targetUnits ?? [],
          continuation_plan_ref: continuationPlanPath,
          superseded_artifact_backups: supersededArtifactBackups,
          execution_route_provenance: {
            executor_realization: executorRealization,
            review_execution_profile_source: reviewExecutionProfileSource,
            requested_executor_realization: request.executorRealization ?? null,
            previous_execution_realization: executionPlan.execution_realization,
            previous_host_runtime: executionPlan.host_runtime,
          },
          ...extra,
        });
      };
      await writeAttemptManifest("started");
      await writeActiveAttemptStarted({
        sessionRoot: resolvedSessionRoot,
        attemptId,
        attemptKind: "continuation",
        sourceTool: "onto.review_continue",
        requestHash: null,
        activeUnits: continuationPlan.frontierUnits.map((unit) => unit.unitId),
        requestedFrontierUnits: request.targetUnits ?? [],
      });

      let promptExecutionResult: ReviewPromptExecutionResult | undefined;
      try {
        const executorConfig = buildExecutorConfigFromRealization(
          executorRealization,
          ontoHome,
        );
        promptExecutionResult = (
          await withCapturedConsole(() =>
            executeReviewPromptExecution({
              projectRoot,
              sessionRoot: resolvedSessionRoot,
              defaultExecutorConfig: executorConfig,
              ...(reviewExecutionProfile ? { reviewExecutionProfile } : {}),
              continuationPlan,
            }),
          )
        ).result;
        if (promptExecutionResult.synthesis_executed) {
          const requestText = await resolveContinuationRequestText({
            sessionRoot: resolvedSessionRoot,
            ...(request.requestText ? { requestText: request.requestText } : {}),
          });
          await withCapturedConsole(() =>
            completeReviewSession([
              "--project-root",
              projectRoot,
              "--session-root",
              resolvedSessionRoot,
              "--request-text",
              requestText,
            ]),
          );
        }
        await writeAttemptManifest(
          promptExecutionResult.synthesis_executed
            ? "completed"
            : "halted_partial",
          { prompt_execution_result: promptExecutionResult },
        );
        await updateActiveAttemptTerminal({
          sessionRoot: resolvedSessionRoot,
          status: promptExecutionResult.synthesis_executed
            ? "completed"
            : "halted_partial",
        });
      } catch (error) {
        const restoredArtifactBackups =
          await restoreSupersededArtifacts(supersededArtifactBackups);
        const errorMessage = error instanceof Error ? error.message : String(error);
        await writeAttemptManifest("failed", {
          error_message: errorMessage,
          ...(promptExecutionResult
            ? { prompt_execution_result: promptExecutionResult }
            : {}),
          restored_artifact_backups: restoredArtifactBackups,
        });
        await updateActiveAttemptTerminal({
          sessionRoot: resolvedSessionRoot,
          status: "failed",
          errorMessage,
        });
        throw new ReviewContinuationError({
          message: `Review continuation failed: ${errorMessage}`,
          originalError: error,
          failureContent: {
            mcp_error_code: "ONTO_REVIEW_CONTINUATION_FAILED",
            session_id: executionPlan.session_id,
            session_root: resolvedSessionRoot,
            attempt_id: attemptId,
            attempt_root: attemptRoot,
            attempt_manifest_ref: attemptManifestPath,
            continuation_plan_ref: continuationPlanPath,
            continuation_plan: continuationPlan,
            superseded_artifact_backups: supersededArtifactBackups,
            restored_artifact_backups: restoredArtifactBackups,
            error_message: errorMessage,
          },
        });
      }
      if (!promptExecutionResult) {
        throw new Error("Review continuation finished without prompt execution result.");
      }

      const postStatus = await api.getReviewStatus(resolvedSessionRoot);
      return {
        sessionId: postStatus.sessionId,
        sessionRoot: resolvedSessionRoot,
        decision: "executed",
        status: postStatus.status,
        continuationPlan,
        continuationAttempt: {
          attemptId,
          attemptRoot,
          continuationPlanPath,
          attemptManifestPath,
          supersededArtifactBackups,
        },
        promptExecutionResult,
        artifactRefs: postStatus.artifactRefs,
        ...(postStatus.pipelineExecutionLedger
          ? { pipelineExecutionLedger: postStatus.pipelineExecutionLedger }
          : {}),
        resultClassificationSummary:
          await readReviewResultClassification(resolvedSessionRoot),
        failureRefs: postStatus.failureRefs,
        ...(postStatus.routeVisibility !== undefined
          ? { routeVisibility: postStatus.routeVisibility }
          : {}),
        ...(postStatus.llmPresentation !== undefined
          ? { llmPresentation: postStatus.llmPresentation }
          : {}),
      };
    },

    async cancelReview(request: CancelReviewRequest): Promise<ReviewCancelResult> {
      const resolvedSessionRoot = path.resolve(request.sessionRoot);
      const sessionMetadata = await readOptionalYaml<ReviewSessionMetadata>(
        path.join(resolvedSessionRoot, "session-metadata.yaml"),
      );
      if (!sessionMetadata) {
        throw new Error(
          `Cannot cancel review without session-metadata.yaml: ${resolvedSessionRoot}`,
        );
      }
      const projectRoot = path.resolve(
        request.projectRoot ?? sessionMetadata.project_root,
      );
      await assertSamePath({
        label: "ReviewSessionMetadata.project_root",
        expected: projectRoot,
        actual: sessionMetadata.project_root,
      });
      const statusBeforeCancel = await api.getReviewStatus(resolvedSessionRoot);
      if (reviewTerminalStatus(statusBeforeCancel.status)) {
        return {
          sessionId: statusBeforeCancel.sessionId,
          sessionRoot: resolvedSessionRoot,
          decision: "already_terminal",
          status: statusBeforeCancel.status,
          cancelRequestPath: reviewCancelRequestPath(resolvedSessionRoot),
          reason: "review is already terminal",
          artifactRefs: statusBeforeCancel.artifactRefs,
          ...(statusBeforeCancel.runControl
            ? { runControl: statusBeforeCancel.runControl }
            : {}),
          ...(statusBeforeCancel.llmPresentation
            ? { llmPresentation: statusBeforeCancel.llmPresentation }
            : {}),
        };
      }
      if (!statusBeforeCancel.runControl?.cancellationAvailable) {
        return {
          sessionId: statusBeforeCancel.sessionId,
          sessionRoot: resolvedSessionRoot,
          decision: "not_cancellable",
          status: statusBeforeCancel.status,
          cancelRequestPath: reviewCancelRequestPath(resolvedSessionRoot),
          reason: statusBeforeCancel.runControl?.statusReason ??
            "review is not currently cancellable",
          artifactRefs: statusBeforeCancel.artifactRefs,
          ...(statusBeforeCancel.runControl
            ? { runControl: statusBeforeCancel.runControl }
            : {}),
          ...(statusBeforeCancel.llmPresentation
            ? { llmPresentation: statusBeforeCancel.llmPresentation }
            : {}),
        };
      }
      const reason = request.reason?.trim() || "operator requested cancellation";
      const cancelRequest: ReviewCancelRequestArtifact = {
        schema_version: "1",
        session_id: sessionMetadata.session_id,
        requested_at: isoNow(),
        requested_by: "mcp",
        reason,
      };
      const cancelRequestPath = reviewCancelRequestPath(resolvedSessionRoot);
      await writeYamlDocument(cancelRequestPath, cancelRequest);
      const status = await api.getReviewStatus(resolvedSessionRoot);
      return {
        sessionId: status.sessionId,
        sessionRoot: resolvedSessionRoot,
        decision: "requested",
        status: status.status,
        cancelRequestPath,
        reason,
        artifactRefs: status.artifactRefs,
        ...(status.runControl ? { runControl: status.runControl } : {}),
        ...(status.llmPresentation ? { llmPresentation: status.llmPresentation } : {}),
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
      const pipelineExecutionLedger =
        await buildPipelineExecutionLedgerIfPossible({
          sessionRoot: resolvedSessionRoot,
          artifactRefs,
          executionPlan,
          executionResult,
        });
      const continuationPlan = pipelineExecutionLedger
        ? buildReviewContinuationPlan({ ledger: pipelineExecutionLedger })
        : undefined;
      const reviewRecord = await readOptionalReviewRecord(
        path.join(resolvedSessionRoot, "review-record.yaml"),
      );
      const activeAttempt = await activeAttemptProjection(resolvedSessionRoot);
      const activeRunInProgress =
        activeAttempt?.status === "started" && !activeAttempt.isStale;
      const status: ReviewStatus["status"] = reviewRecord
        ? reviewRecord.record_status
        : executionResult?.execution_status === "halted_partial"
          ? "halted_partial"
          : activeAttempt?.status === "failed"
            ? "failed"
            : activeAttempt?.status === "halted_partial"
              ? "halted_partial"
              : executionPlan
                ? (activeRunInProgress ||
                    await hasRunArtifacts(resolvedSessionRoot, artifactRefs))
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
          ...(pipelineExecutionLedger ? { pipelineExecutionLedger } : {}),
          ...(continuationPlan ? { continuationPlan } : {}),
          ...failures,
          routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
          llmPresentation,
          runControl: progressInput.run_control,
          targetMaterialSupport: progressInput.target_material_support,
          environmentWarnings: progressInput.environment_warnings,
          unitProgress: progressInput.progress.unit_progress,
        };
      }

      if (executionResult?.execution_status === "halted_partial") {
        return {
          sessionId: basenameSessionId(resolvedSessionRoot),
          sessionRoot: resolvedSessionRoot,
          status,
          artifactRefs,
          ...(pipelineExecutionLedger ? { pipelineExecutionLedger } : {}),
          ...(continuationPlan ? { continuationPlan } : {}),
          ...failures,
          routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
          llmPresentation,
          runControl: progressInput.run_control,
          targetMaterialSupport: progressInput.target_material_support,
          environmentWarnings: progressInput.environment_warnings,
          unitProgress: progressInput.progress.unit_progress,
        };
      }

      if (executionPlan) {
        return {
          sessionId: basenameSessionId(resolvedSessionRoot),
          sessionRoot: resolvedSessionRoot,
          status,
          artifactRefs,
          ...(pipelineExecutionLedger ? { pipelineExecutionLedger } : {}),
          ...(continuationPlan ? { continuationPlan } : {}),
          ...failures,
          routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
          llmPresentation,
          runControl: progressInput.run_control,
          targetMaterialSupport: progressInput.target_material_support,
          environmentWarnings: progressInput.environment_warnings,
          unitProgress: progressInput.progress.unit_progress,
        };
      }

      return {
        sessionId: basenameSessionId(resolvedSessionRoot),
        sessionRoot: resolvedSessionRoot,
        status: "unknown",
        artifactRefs,
        ...(pipelineExecutionLedger ? { pipelineExecutionLedger } : {}),
        ...(continuationPlan ? { continuationPlan } : {}),
        ...failures,
        routeVisibility: await buildReviewRouteVisibilityFromSession(resolvedSessionRoot),
        llmPresentation,
        runControl: progressInput.run_control,
        targetMaterialSupport: progressInput.target_material_support,
        environmentWarnings: progressInput.environment_warnings,
        unitProgress: progressInput.progress.unit_progress,
      };
    },

    async getReviewResult(
      sessionRoot: string,
      options: { projectionLevel?: ReviewResultProjectionLevel } = {},
    ): Promise<ReviewResult> {
      const resolvedSessionRoot = path.resolve(sessionRoot);
      const projectionLevel = options.projectionLevel ?? "full";
      const artifactRefs = await collectArtifactRefs(resolvedSessionRoot);
      const { failureRefs } = await collectStructuredFailures(resolvedSessionRoot);
      const reviewRecordPath = path.join(resolvedSessionRoot, "review-record.yaml");
      const reviewRecord = await readValidatedReviewRecord(reviewRecordPath);
      const resultSessionMetadata = await readOptionalYaml<ReviewSessionMetadata>(
        path.join(resolvedSessionRoot, "session-metadata.yaml"),
      );
      const finalOutputPath = await resolveReviewRecordFinalOutputPath({
        sessionRoot: resolvedSessionRoot,
        projectRoot: resultSessionMetadata?.project_root ?? null,
        finalOutputRef: reviewRecord.final_output_ref,
      });
      const finalOutputText =
        projectionLevel === "compact"
          ? undefined
          : await readOptionalText(finalOutputPath);
      const executionPlan = await readOptionalYaml<ReviewExecutionPlan>(
        path.join(resolvedSessionRoot, "execution-plan.yaml"),
      );
      const executionResult = await readOptionalYaml<ReviewExecutionResultArtifact>(
        path.join(resolvedSessionRoot, "execution-result.yaml"),
      );
      const pipelineExecutionLedger =
        await buildPipelineExecutionLedgerIfPossible({
          sessionRoot: resolvedSessionRoot,
          artifactRefs,
          executionPlan,
          executionResult,
        });
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
        review_record: projectionLevel === "full" ? reviewRecord : null,
        review_record_summary: {
          review_record_id: reviewRecord.review_record_id,
          record_status: reviewRecord.record_status,
          resolved_lens_ids: reviewRecord.resolved_lens_ids,
          participating_lens_ids: reviewRecord.participating_lens_ids,
          degraded_lens_ids: reviewRecord.degraded_lens_ids,
          deliberation_status: reviewRecord.deliberation_status,
        },
      };
      const targetMaterialSupport = await readTargetMaterialSupport(
        resolvedSessionRoot,
        executionPlan,
      );
      const environmentWarnings = await readEnvironmentWarnings(resolvedSessionRoot);
      return {
        sessionId: reviewRecord.session_id,
        sessionRoot: resolvedSessionRoot,
        projectionLevel,
        reviewRecordSummary: {
          reviewRecordId: reviewRecord.review_record_id,
          recordStatus: reviewRecord.record_status,
          requestText: reviewRecord.request_text,
          resolvedLensIds: reviewRecord.resolved_lens_ids,
          participatingLensIds: reviewRecord.participating_lens_ids,
          degradedLensIds: reviewRecord.degraded_lens_ids,
          deliberationStatus: reviewRecord.deliberation_status,
        },
        ...(projectionLevel === "full" ? { reviewRecord } : {}),
        finalOutputPath,
        reviewRunManifestPath: path.join(resolvedSessionRoot, "review-run-manifest.yaml"),
        artifactRefs,
        ...(pipelineExecutionLedger ? { pipelineExecutionLedger } : {}),
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
        targetMaterialSupport,
        environmentWarnings,
        ...(finalOutputText !== undefined ? { finalOutputText } : {}),
      };
    },

    async findLatestReviewSessions(
      query: ReviewSessionLookupQuery,
    ): Promise<ReviewSessionLookupResult[]> {
      const projectRoot = path.resolve(query.projectRoot);
      const reviewRoot = path.join(projectRoot, ".onto", "review");
      let entries;
      try {
        entries = await fs.readdir(reviewRoot, { withFileTypes: true });
      } catch {
        return [];
      }
      const createdAfterMs = query.createdAfter
        ? parseTimestampMs(query.createdAfter)
        : null;
      const targetFilter = query.target ? path.normalize(query.target) : null;
      const domainFilter = query.domain ? normalizeDomainValue(query.domain) : null;
      const matches: ReviewSessionLookupResult[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sessionRoot = path.join(reviewRoot, entry.name);
        const metadata = await readOptionalYaml<ReviewSessionMetadata>(
          path.join(sessionRoot, "session-metadata.yaml"),
        );
        if (!metadata) continue;
        const interpretation = await readOptionalYaml<InvocationInterpretationArtifact>(
          path.join(sessionRoot, "interpretation.yaml"),
        );
        const binding = await readOptionalYaml<InvocationBindingArtifact>(
          path.join(sessionRoot, "binding.yaml"),
        );
        const targetProfile = await readOptionalYaml<ReviewTargetProfileArtifact>(
          path.join(sessionRoot, "execution-preparation", "review-target-profile.yaml"),
        );
        const createdAt = metadata.created_at ?? null;
        const createdAtMs = parseTimestampMs(createdAt);
        if (
          createdAfterMs !== null &&
          createdAtMs !== null &&
          createdAtMs < createdAfterMs
        ) {
          continue;
        }
        if (
          targetFilter &&
          path.normalize(metadata.requested_target) !== targetFilter &&
          path.normalize(targetProfile?.requested_target ?? "") !== targetFilter
        ) {
          continue;
        }
        const normalizedDomain =
          binding?.resolved_session_domain ??
          targetProfile?.domain ??
          normalizeDomainValue(metadata.requested_domain_token ?? "");
        if (
          domainFilter &&
          normalizeDomainValue(normalizedDomain) !== domainFilter
        ) {
          continue;
        }
        const requestHash = requestHashFromArtifacts({
          metadata,
          interpretation,
          binding,
        });
        if (query.requestHash && requestHash !== query.requestHash) {
          continue;
        }
        const artifactRefs = await collectArtifactRefs(sessionRoot);
        const status = (await api.getReviewStatus(sessionRoot)).status;
        matches.push({
          sessionId: metadata.session_id ?? entry.name,
          sessionRoot,
          createdAt,
          requestedTarget: metadata.requested_target ?? null,
          requestedDomainToken: metadata.requested_domain_token ?? null,
          normalizedDomain:
            normalizedDomain === "none" || normalizedDomain.length === 0
              ? null
              : normalizeDomainValue(normalizedDomain),
          requestHash,
          status,
          artifactRefs,
        });
      }
      matches.sort((a, b) => {
        const left = parseTimestampMs(a.createdAt) ?? 0;
        const right = parseTimestampMs(b.createdAt) ?? 0;
        return right - left;
      });
      return matches.slice(0, query.limit ?? 5);
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
  return api;
}
