#!/usr/bin/env node

import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import {
  defaultReviewRetrySettings,
  type OntoConfig,
  type ReviewExecutionUnitId,
  type ReviewLlmRef,
  type ReviewRetrySettings,
  type ReviewToolMode,
  type ReviewUnitExecutionSettings,
} from "../discovery/settings-chain.js";
import type {
  DeliberationStatus,
  EffectiveBoundaryState,
  ReviewContextManifestArtifact,
  ReviewContextManifestPacketRef,
  ReviewContextSource,
  ReviewDegradationKind,
  ReviewDegradationSummaryArtifact,
  ReviewDegradationUnitFailure,
  ReviewExecutionRealization,
  ReviewExecutionResultArtifact,
  ReviewExecutionPlan,
  ReviewExecutionStatus,
  ReviewHostRuntime,
  ReviewIssueArtifactId,
  ReviewLensOutputFormat,
  ReviewLensCompletionBarrierArtifact,
  ReviewCitationAuditMetadata,
  ReviewCitationAuditRejectionMetadata,
  ReviewArtifactGenerationRealization,
  ReviewNativeAdmissionMetadata,
  ReviewSemanticQualityEvidence,
  ReviewToolBoundarySkipMetadata,
  ReviewUnitKind,
  ReviewUnitExecutionResult,
  ReviewUnitFailureKind,
} from "../review/artifact-types.js";
import {
  appendMarkdownLogEntry,
  fileExists,
  isoFromTimestamp,
  parseMarkdownFrontmatter,
  removeFileIfExists,
  readYamlDocument,
  writeYamlDocument,
} from "../review/review-artifact-utils.js";
import {
  PRE_DELIBERATION_ISSUE_ARTIFACT_IDS,
  buildIssueStanceResponsePrompt,
  completeIssueLedgerArtifactOnDisk,
  issueArtifactConsumerId,
  issueArtifactSpec,
  issueStanceConsumerId,
  issueStancePromptPacketPath,
  issueStanceResponsePath,
  renderIssueStanceInputProjectionSection,
  renderRuntimeIssueStanceMatrixPacket,
  buildIssueStanceInputProjection,
  resolveProblemFramingProfileRef,
  validateIssueArtifactOnDisk,
  validateIssueStanceResponseOnDisk,
  writeIssueStanceMatrixFromResponses,
  writeIssueArtifactPromptPacket,
} from "../review/issue-artifact-runtime.js";
import {
  isLensSidecarArtifactPath,
  lensIdFromRound1ArtifactPath,
  readValidatedLensSidecarArtifact,
  writeLensMarkdownProjectionFromSidecar,
} from "../review/lens-sidecar-artifact.js";
import {
  allLensOutputsAreSidecars,
  renderRuntimeFindingLedgerPacket,
  writeFindingLedgerFromLensSidecars,
} from "../review/lens-sidecar-ledger.js";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";
import { effectiveReviewUnitLlmRef } from "../review/review-execution-profile.js";
import type {
  ReviewContinuationPlan,
  ReviewContinuationUnit,
} from "../review/continuation-plan.js";
import {
  buildInitialExecutionResultScaffold,
  computeReviewFrontier,
  mergeUnitResultIntoExecutionResult,
  validateUnitSeatToResult,
} from "../review/review-execution-steps.js";
import {
  isResolvedLedgerUnit,
  isTrustedLedgerUnit,
} from "../pipeline-execution-ledger.js";
import {
  buildReviewExecutionRoute,
  buildReviewRuntimeRouteArtifactProjection,
} from "../review/review-execution-route.js";
import {
  buildIssueScopedDeliberationWorklist,
  buildIssueScopedLensDeliberationPrompt,
  buildNoPlannedDeliberationResolution,
  buildRuntimeIssueDeliberationUnavailableResponse,
  buildRuntimeUnavailableDeliberationResolution,
  buildTeamleadIssueResolutionPrompt,
  deliberationResolutionPath,
  renderDeliberationMarkdownProjection,
  validateDeliberationResolutionObject,
  validateIssueDeliberationResponseObject,
  type IssueDeliberationResponseArtifact,
  type IssueScopedDeliberationWorkItem,
} from "../review/controlled-lens-deliberation.js";
import {
  computeLensCompletionBarrier,
  resolveRequiredParticipatingLensCount,
} from "../review/lens-completion-policy.js";
import { assertRuntimeOrchestratedSession } from "../review/orchestration-owner.js";
import {
  REVIEW_EXECUTION_STEP_IDS,
  REVIEW_PROGRESS_TOTAL_STEPS,
} from "../review/review-progress-contract.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";
import {
  dispatchNestedBatch,
  executeReviewViaNestedBatch,
  nestedOuterConfigFromLlmRef,
  type NestedBatchBrand,
} from "./nested-batch-dispatch.js";
import {
  ReviewStructuredFailureError,
  writeAndThrowStructuredFailureRecord,
} from "../review/failure-records.js";
import {
  assertReviewExecutionPlanSessionBoundary,
} from "../review/execution-plan-boundary.js";
import {
  appendRuntimeStreamChunkSync,
  appendRuntimeStreamEventSync,
} from "../observability/runtime-stream-observation.js";
import { parseStringList } from "./assemble-review-record.js";
import {
  renderReviewUnitBoundaryDetailsSection,
} from "../review/unit-boundary-details.js";
import {
  renderIssueSynthesisPrompt,
  buildRuntimeIssueSynthesisUnavailableResponse,
  synthesisLedgerPath,
  synthesisWorkItemsPath,
  validateIssueSynthesisResponseOnDisk,
  writeReviewSynthesisLedger,
  writeReviewSynthesisWorkItems,
  writeSynthesisMarkdownFromLedger,
  type IssueSynthesisResponseArtifact,
  type ReviewSynthesisWorkItem,
  type ReviewSynthesisWorkItemsArtifact,
} from "../review/synthesis-map-reduce.js";
import {
  isDirectModelCallSelection,
  normalizeLlmModelSwitcher,
} from "../llm/model-switcher.js";
import { parseRuntimeIssueDeliberationSchemaContext } from "./runtime-submit-context.js";
import { parseRuntimeIssueStanceSchemaContext } from "./runtime-submit-context.js";
import { parseRuntimeIssueSynthesisSchemaContext } from "./runtime-submit-context.js";
import { salvageInputPathFor, type SalvageInput } from "./submit-salvage.js";
import { awaitChildExit } from "../child-process-exit.js";
import {
  DispatchBreakerState,
  TRANSIENT_TRANSPORT_MESSAGE_PATTERNS,
  buildDispatchIncompleteArtifact,
  classifySystemicDispatchFailure,
  dispatchIncompleteArtifactPath,
  type DispatchBreakerTripState,
} from "../llm/dispatch-breaker.js";
import {
  CORRELATED_VALIDATION_HALT_REASON,
  applyResubmitErrorSpecToPacket,
  buildResubmitErrorSpec,
  classifyUnsupportedEvidenceRefFailure,
  classifyDeliberationUnsupportedEvidenceRefFailure,
  classifySynthesisUnsupportedSourceRefFailure,
  isUnsupportedEvidenceRefFailureMessage,
  correlatedValidationExceeded,
} from "./unit-resubmit.js";
import {
  isReviewArtifactGenerationRealization,
  semanticQualityEvidenceForArtifactGeneration,
} from "../review/artifact-generation-realization.js";

export interface ReviewUnitExecutorConfig {
  bin: string;
  args: string[];
}

export interface ExecutionDispatchResult {
  unit_id: string;
  unit_kind: ReviewUnitKind;
  packet_path: string;
  output_path: string;
  output_format?:
    | "markdown"
    | "lens-sidecar"
    | "issue-artifact"
    | "issue-stance-response"
    | "issue-deliberation-response"
    | "deliberation-resolution"
    | "issue-synthesis-response";
  human_output_path?: string;
  human_output_ref?: string;
}

export interface ReviewPromptExecutionResult {
  session_root: string;
  executed_lens_count: number;
  synthesis_output_path: string;
  participating_lens_ids: string[];
  degraded_lens_ids: string[];
  synthesis_executed: boolean;
  error_log_path: string | null;
  halt_reason?: string;
  halt_phase?: string | null;
  halt_unit_id?: string | null;
  halt_unit_kind?: ReviewUnitKind | null;
  halt_lens_id?: string | null;
}

interface ExecutionFailure {
  unit_id: string;
  unit_kind: ReviewUnitKind;
  packet_path: string;
  output_path: string;
  message: string;
  failure_kind: ReviewUnitFailureKind;
}

interface ReviewExecutorRunMetadata {
  input_tokens?: number;
  output_tokens?: number;
  tool_calls?: number;
  tool_iterations?: number;
  tool_mode?: string;
  native_admission?: ReviewNativeAdmissionMetadata;
  tool_boundary_skips?: ReviewToolBoundarySkipMetadata;
  citation_audit?: ReviewCitationAuditMetadata;
  citation_audit_rejection?: ReviewCitationAuditRejectionMetadata;
  host_runtime?: ReviewHostRuntime;
  model_id?: string;
  artifact_generation_realization?: ReviewArtifactGenerationRealization;
  semantic_quality_evidence?: ReviewSemanticQualityEvidence;
}

export interface ExecutionOutcome {
  dispatch: ExecutionDispatchResult;
  success: boolean;
  startedAtMs: number;
  completedAtMs: number;
  attemptCount?: number;
  executorMetadata?: ReviewExecutorRunMetadata;
  packetBytes?: number | null;
  outputBytes?: number | null;
  failure?: ExecutionFailure;
  preservedResult?: ReviewUnitExecutionResult;
  childOutcomes?: ExecutionOutcome[];
  artifactGenerationRealization?: ReviewArtifactGenerationRealization;
  semanticQualityEvidence?: ReviewSemanticQualityEvidence;
  /** Attempt-level recovery marker (opt-in submit salvage). */
  recovery?: "salvaged_submit";
  /** True when ANY attempt of this dispatch ran with a resubmit error spec
   * injected (설계 A corrective retry; incl. the attempt-0 structural
   * pre-injection). Loop-scope accumulated: the spec fires on a FAILED
   * iteration and the healed submit returns on the NEXT one, so per-attempt
   * capture would systematically miss exactly the healed cases
   * (review-cert/v2 disclosure source — 20260712-review-cert-v2-design §5.2). */
  resubmitApplied?: true;
  /** True when this outcome came from the nested-workers batch WINDOW
   * (batch-ok, or a batch failure finalized under an explicit zero-retry
   * policy) rather than a directly-observed flat dispatch. The dispatch
   * breaker records these via `recordItemSkipped`: completed for the recovery
   * set, but no proof the provider lane is alive THIS run — recording them as
   * success would let a stale batch-window success reset an outage streak
   * (§4-1 nested-workers breaker coverage). */
  nestedBatchWindow?: true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSuccessfulOutcome(
  outcome: ExecutionOutcome | undefined,
): outcome is ExecutionOutcome & { success: true } {
  return outcome !== undefined && outcome.success;
}

function isFailureOutcome(
  outcome: ExecutionOutcome | undefined,
): outcome is ExecutionOutcome & { success: false; failure: ExecutionFailure } {
  return (
    outcome !== undefined &&
    !outcome.success &&
    outcome.failure !== undefined
  );
}

async function appendExecutionProgress(
  errorLogPath: string,
  title: string,
  bodyLines: string[],
): Promise<void> {
  await appendMarkdownLogEntry(errorLogPath, title, bodyLines.join("\n"));
}

async function emitReviewProgress(args: {
  executionPlan: ReviewExecutionPlan;
  step: number;
  label: string;
  details?: string[];
}): Promise<void> {
  const detailText =
    args.details && args.details.length > 0
      ? ` - ${args.details.join("; ")}`
      : "";
  console.log(
    `[review progress] ${args.step}/${REVIEW_PROGRESS_TOTAL_STEPS} ${args.label}${detailText}`,
  );
  await appendExecutionProgress(
    args.executionPlan.error_log_path,
    `review progress ${args.step}/${REVIEW_PROGRESS_TOTAL_STEPS}: ${args.label}`,
    args.details ?? [],
  );
}

function renderEffectiveBoundaryStateLog(
  effectiveBoundaryState: EffectiveBoundaryState,
): string {
  return [
    `web_research: requested=${effectiveBoundaryState.web_research.requested_policy}, effective=${effectiveBoundaryState.web_research.effective_policy}, guarantee=${effectiveBoundaryState.web_research.guarantee_level}`,
    `repo_exploration: requested=${effectiveBoundaryState.repo_exploration.requested_policy}, effective=${effectiveBoundaryState.repo_exploration.effective_policy}, guarantee=${effectiveBoundaryState.repo_exploration.guarantee_level}`,
    `recursive_reference_expansion: requested=${effectiveBoundaryState.recursive_reference_expansion.requested_policy}, effective=${effectiveBoundaryState.recursive_reference_expansion.effective_policy}, guarantee=${effectiveBoundaryState.recursive_reference_expansion.guarantee_level}`,
    `source_mutation: requested=${effectiveBoundaryState.source_mutation.requested_policy}, effective=${effectiveBoundaryState.source_mutation.effective_policy}, guarantee=${effectiveBoundaryState.source_mutation.guarantee_level}`,
    `filesystem_scope_effective: ${effectiveBoundaryState.filesystem_scope.effective_allowed_roots.join(", ")}`,
    `filesystem_scope_guarantee: ${effectiveBoundaryState.filesystem_scope.guarantee_level}`,
    ...effectiveBoundaryState.web_research.notes.map((note) => `note.web_research: ${note}`),
    ...effectiveBoundaryState.repo_exploration.notes.map((note) => `note.repo_exploration: ${note}`),
    ...effectiveBoundaryState.recursive_reference_expansion.notes.map(
      (note) => `note.recursive_reference_expansion: ${note}`,
    ),
    ...effectiveBoundaryState.source_mutation.notes.map((note) => `note.source_mutation: ${note}`),
    ...effectiveBoundaryState.filesystem_scope.notes.map(
      (note) => `note.filesystem_scope: ${note}`,
    ),
  ].join("\n");
}

function issueArtifactOutputPaths(
  executionPlan: ReviewExecutionPlan,
  artifactIds: ReviewIssueArtifactId[],
): string[] {
  const ids = new Set(artifactIds);
  return executionPlan.issue_artifact_prompt_packet_seats
    .filter((seat) => ids.has(seat.artifact_id))
    .map((seat) => seat.output_path);
}

function resolvedLensOutputFormat(
  executionPlan: ReviewExecutionPlan,
): ReviewLensOutputFormat {
  return executionPlan.lens_output_format ?? "sidecar";
}

function lensDispatchOutputPath(args: {
  executionPlan: ReviewExecutionPlan;
  lensId: string;
  markdownOutputPath: string;
  sidecarOutputPath?: string | undefined;
}): string {
  if (resolvedLensOutputFormat(args.executionPlan) !== "sidecar") {
    return args.markdownOutputPath;
  }
  if (!args.sidecarOutputPath) {
    throw new Error(
      `lens_output_format=sidecar requires sidecar_output_path for lens dispatch: ${args.lensId}`,
    );
  }
  return args.sidecarOutputPath;
}

function lensHumanOutputPath(args: {
  executionPlan: ReviewExecutionPlan;
  markdownOutputPath: string;
}): string | undefined {
  if (resolvedLensOutputFormat(args.executionPlan) !== "sidecar") return undefined;
  return args.executionPlan.write_lens_markdown === false
    ? undefined
    : args.markdownOutputPath;
}

function renderReviewUnitBoundaryContext(
  projectRoot: string,
  executionPlan: ReviewExecutionPlan,
  unitId: string,
  outputPath: string,
  allowedReadRefs: string[],
): string {
  return `\n${renderReviewUnitBoundaryDetailsSection({
    projectRoot,
    unitId,
    outputPath,
    allowedReadRefs,
    repoExplorationPolicy: "denied",
    boundaryPolicy: executionPlan.boundary_policy,
    effectiveBoundaryState: executionPlan.effective_boundary_state,
    boundaryEnforcementProfile: executionPlan.boundary_enforcement_profile,
  })}`;
}

function resolveAllowedReadRef(projectRoot: string, ref: string): string {
  return path.isAbsolute(ref) ? ref : path.resolve(projectRoot, ref);
}

function uniqueAllowedReadRefs(projectRoot: string, refs: string[]): string[] {
  return [
    ...new Set(
      refs
        .filter((ref) => ref.trim().length > 0)
        .map((ref) => resolveAllowedReadRef(projectRoot, ref)),
    ),
  ];
}

function uniqueStrings<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

async function writeLensCompletionBarrier(args: {
  executionPlan: ReviewExecutionPlan;
  observedDispatchWidth: number;
  minimumParticipatingLenses: number;
  lensDispatches: ExecutionDispatchResult[];
  successfulLensDispatches: ExecutionDispatchResult[];
  executionFailures: ExecutionFailure[];
}): Promise<ReviewLensCompletionBarrierArtifact> {
  const barrier = computeLensCompletionBarrier({
    sessionId: args.executionPlan.session_id,
    createdAt: isoFromTimestamp(Date.now()),
    observedDispatchWidth: args.observedDispatchWidth,
    minimumParticipatingLenses: args.minimumParticipatingLenses,
    plannedLensIds: args.lensDispatches.map((dispatch) => dispatch.unit_id),
    completedLensIds: args.successfulLensDispatches.map(
      (dispatch) => dispatch.unit_id,
    ),
    failedLensIds: args.executionFailures
      .filter((failure) => failure.unit_kind === "lens")
      .map((failure) => failure.unit_id),
  });
  const barrierPath =
    args.executionPlan.lens_completion_barrier_path ??
    path.join(args.executionPlan.session_root, "lens-completion-barrier.yaml");
  await writeYamlDocument(barrierPath, barrier);
  await appendExecutionProgress(
    args.executionPlan.error_log_path,
    "runner lens completion barrier",
    [
      `status: ${barrier.status}`,
      `observed_dispatch_width: ${barrier.observed_dispatch_width}`,
      `completed_lens_count: ${barrier.completed_lens_ids.length}`,
      `degraded_lens_count: ${barrier.degraded_lens_ids.length}`,
      `downstream_allowed: ${String(barrier.downstream_allowed)}`,
    ],
  );
  return barrier;
}

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

/** Default stagger delay between successive lens dispatches (ms).
 *  Spreads initial burst to avoid thundering-herd on the external API. */
function defaultStaggerDelayMsForExecutorConfig(
  executorConfig: ReviewUnitExecutorConfig,
): number {
  if (
    executorConfigUsesCodexWorker(executorConfig) ||
    executorConfigUsesClaudeWorker(executorConfig)
  ) {
    // external worker (codex/claude) spawns a process -> API request per lens
    return 1500;
  }
  return 0;
}

function executorConfigUsesCodexWorker(
  executorConfig: ReviewUnitExecutorConfig,
): boolean {
  return executorConfig.args.some((arg) => arg.includes("codex-review-unit-executor"));
}

function executorConfigUsesClaudeWorker(
  executorConfig: ReviewUnitExecutorConfig,
): boolean {
  return executorConfig.args.some((arg) =>
    arg.includes("claude-code-review-unit-executor"),
  );
}

function executorConfigUsesInlineHttpWorker(
  executorConfig: ReviewUnitExecutorConfig,
): boolean {
  return executorConfig.args.some((arg) =>
    arg.includes("inline-http-review-unit-executor")
  );
}

function dispatchRequiresRuntimeSubmitTool(dispatch: ExecutionDispatchResult): boolean {
  return Boolean(
    dispatch.output_format &&
      dispatch.output_format !== "markdown" &&
      dispatch.output_format !== "lens-sidecar",
  );
}

const DEFAULT_REVIEW_UNIT_TIMEOUT_MS = 240_000;
const REVIEW_CANCEL_REQUEST_FILENAME = "review-cancel-request.yaml";

interface ReviewRuntimeRetryPolicy {
  lensMaxRetries: number;
  issueArtifactMaxRetries: number;
  deliberationMaxRetries: number;
  synthesisMaxRetries: number;
  retryInitialDelayMs: number;
}

type ReviewExecutionResultArtifactDraft =
  Omit<
    ReviewExecutionResultArtifact,
    "retry_policy" | "artifact_generation_realization" | "semantic_quality_evidence"
  > & {
    retry_policy?: ReviewRetrySettings;
    artifact_generation_realization?: ReviewArtifactGenerationRealization;
    semantic_quality_evidence?: ReviewSemanticQualityEvidence;
  };

function retryPolicyFromProfile(
  profile: ReviewExecutionProfile | undefined,
): ReviewRuntimeRetryPolicy {
  const retry = profile?.retry ?? defaultReviewRetrySettings();
  return {
    lensMaxRetries: retry.lens_max_retries,
    issueArtifactMaxRetries: retry.issue_artifact_max_retries,
    deliberationMaxRetries: retry.deliberation_max_retries,
    synthesisMaxRetries: retry.synthesis_max_retries,
    retryInitialDelayMs: retry.retry_initial_delay_ms,
  };
}

interface ReviewCancelRequestArtifact {
  schema_version: "1";
  session_id: string;
  requested_at: string;
  requested_by: "mcp";
  reason: string;
}

class ReviewUnitTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(unitId: string, timeoutMs: number) {
    super(`Review unit ${unitId} timed out after ${timeoutMs}ms.`);
    this.name = "ReviewUnitTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

function isReviewUnitTimeoutError(error: unknown): boolean {
  return error instanceof ReviewUnitTimeoutError;
}

class ReviewUnitOutputContractError extends Error {
  readonly failureKind: ReviewUnitFailureKind;

  constructor(message: string, failureKind: ReviewUnitFailureKind = "output_contract") {
    super(message);
    this.name = "ReviewUnitOutputContractError";
    this.failureKind = failureKind;
  }
}

class ReviewIssueArtifactDispatchError extends Error {
  readonly outcome: ExecutionOutcome | null;
  readonly originalError: unknown;
  /** Explicit halt_reason override (e.g. `correlated_validation: …`);
   * null keeps the default `Issue artifact generation failed: …` phrasing. */
  readonly haltReason: string | null;
  /** 설계 B 트립 전용: halt 시점까지 기록된 배치 outcome 전체(완료+최종
   * 실패). 완료 유닛의 행이 execution-result에 남아야 continuation ledger가
   * 그 유닛을 재디스패치하지 않는다 — 회복 집합 == 미완료 집합 (규칙 5).
   * 트립 외 halt 경로는 빈 배열(현행 동작 보존). */
  readonly batchOutcomes: ExecutionOutcome[];

  constructor(
    message: string,
    outcome: ExecutionOutcome | null,
    originalError: unknown,
    haltReason: string | null = null,
    batchOutcomes: ExecutionOutcome[] = [],
  ) {
    super(message);
    this.name = "ReviewIssueArtifactDispatchError";
    this.outcome = outcome;
    this.originalError = originalError;
    this.haltReason = haltReason;
    this.batchOutcomes = batchOutcomes;
  }
}

function issueArtifactOutcomeFromError(error: unknown): ExecutionOutcome | null {
  if (error instanceof ReviewIssueArtifactDispatchError) {
    return error.outcome;
  }
  return null;
}

class ReviewControlledDeliberationDispatchError extends Error {
  readonly outcomes: ExecutionOutcome[];
  readonly failedOutcome: ExecutionOutcome | null;

  constructor(
    message: string,
    outcomes: ExecutionOutcome[],
    failedOutcome: ExecutionOutcome | null,
  ) {
    super(message);
    this.name = "ReviewControlledDeliberationDispatchError";
    this.outcomes = outcomes;
    this.failedOutcome = failedOutcome;
  }
}

function controlledDeliberationOutcomesFromError(
  error: unknown,
): ExecutionOutcome[] {
  if (error instanceof ReviewControlledDeliberationDispatchError) {
    return error.outcomes;
  }
  return [];
}

function controlledDeliberationFailedOutcomeFromError(
  error: unknown,
): ExecutionOutcome | null {
  if (error instanceof ReviewControlledDeliberationDispatchError) {
    return error.failedOutcome;
  }
  return null;
}

function haltLensIdFromOutcome(outcome: ExecutionOutcome | null): string | null {
  if (!outcome) return null;
  if (outcome.dispatch.unit_kind === "lens") {
    return outcome.dispatch.unit_id;
  }
  if (
    outcome.dispatch.unit_kind === "deliberation" &&
    outcome.dispatch.unit_id.startsWith("deliberation-")
  ) {
    return outcome.dispatch.unit_id.replace(/^deliberation-/, "");
  }
  if (
    outcome.dispatch.unit_kind === "deliberation" &&
    outcome.dispatch.unit_id.startsWith("deliberation:")
  ) {
    const [, , lensId] = outcome.dispatch.unit_id.split(":");
    return lensId ?? null;
  }
  return null;
}

function haltArtifactFields(
  haltPhase: string,
  outcome: ExecutionOutcome | null,
): Pick<
  ReviewExecutionResultArtifact,
  "halt_phase" | "halt_unit_id" | "halt_unit_kind" | "halt_lens_id"
> {
  return {
    halt_phase: haltPhase,
    halt_unit_id: outcome?.dispatch.unit_id ?? null,
    halt_unit_kind: outcome?.dispatch.unit_kind ?? null,
    halt_lens_id: haltLensIdFromOutcome(outcome),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unitSettingsIdForDispatch(
  dispatch: ExecutionDispatchResult,
): ReviewExecutionUnitId {
  if (dispatch.unit_kind === "lens") return "lens";
  if (dispatch.unit_id === "finding-ledger") return "finding_ledger";
  if (dispatch.unit_id === "finding-relation-graph") {
    return "finding_relation_graph";
  }
  if (dispatch.unit_id === "issue-ledger") return "issue_ledger";
  if (dispatch.unit_id === "issue-stance-matrix") return "issue_stance_matrix";
  if (dispatch.unit_id === "deliberation-plan") return "deliberation_plan";
  if (dispatch.unit_id === "problem-framing") return "problem_framing";
  if (dispatch.unit_id.startsWith("issue-stance:")) {
    return "issue_stance_response";
  }
  if (dispatch.unit_id.startsWith("deliberation:")) {
    return "deliberation_response";
  }
  if (dispatch.unit_id === "controlled-deliberation") {
    return "deliberation_resolution";
  }
  if (
    dispatch.unit_kind === "synthesize" ||
    dispatch.unit_id.startsWith("synthesis:")
  ) {
    return "synthesis_response";
  }
  throw new Error(
    `No review execution unit settings id is mapped for dispatch ${dispatch.unit_kind}:${dispatch.unit_id}.`,
  );
}

function unitExecutionSettingsForDispatch(
  profile: ReviewExecutionProfile | undefined,
  dispatch: ExecutionDispatchResult,
): ReviewUnitExecutionSettings | undefined {
  return profile?.units?.[unitSettingsIdForDispatch(dispatch)];
}

function maxRetriesForDispatch(args: {
  profile: ReviewExecutionProfile | undefined;
  dispatch: ExecutionDispatchResult;
  fallback: number;
}): number {
  return unitExecutionSettingsForDispatch(args.profile, args.dispatch)?.max_retries ??
    args.fallback;
}

function retryInitialDelayMsForDispatch(args: {
  profile: ReviewExecutionProfile | undefined;
  dispatch: ExecutionDispatchResult;
  fallback: number;
}): number {
  return unitExecutionSettingsForDispatch(args.profile, args.dispatch)
    ?.retry_initial_delay_ms ?? args.fallback;
}

function timeoutMsForDispatch(args: {
  profile: ReviewExecutionProfile | undefined;
  dispatch: ExecutionDispatchResult;
  fallback: number;
}): number {
  return unitExecutionSettingsForDispatch(args.profile, args.dispatch)?.timeout_ms ??
    args.fallback;
}

function maxConcurrentLensesForProfile(args: {
  profile: ReviewExecutionProfile | undefined;
  plannedLensCount: number;
}): number {
  const configured = args.profile?.max_concurrent_lenses;
  const bounded = configured === undefined
    ? args.plannedLensCount
    : Math.min(configured, args.plannedLensCount);
  return Math.max(1, bounded);
}

function maxUnitOutputBytes(args: {
  profile: ReviewExecutionProfile | undefined;
  dispatch: ExecutionDispatchResult;
}): number {
  const unitMax = unitExecutionSettingsForDispatch(args.profile, args.dispatch)
    ?.max_output_bytes;
  if (unitMax !== undefined) return unitMax;
  const raw = process.env.ONTO_REVIEW_MAX_UNIT_OUTPUT_BYTES;
  if (raw === undefined || raw.trim().length === 0) return 512 * 1024;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 512 * 1024;
}

function stripSingleValueCliOptions(args: string[], optionNames: string[]): string[] {
  const optionSet = new Set(optionNames.map((optionName) => `--${optionName}`));
  const equalsPrefixes = optionNames.map((optionName) => `--${optionName}=`);
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) continue;
    if (optionSet.has(token)) {
      const value = args[index + 1];
      if (typeof value === "string" && !value.startsWith("--")) {
        index += 1;
      }
      continue;
    }
    if (equalsPrefixes.some((prefix) => token.startsWith(prefix))) {
      continue;
    }
    out.push(token);
  }
  return out;
}

function stripInlineHttpLlmOverrideArgs(args: string[]): string[] {
  return stripSingleValueCliOptions(args, [
    "provider",
    "auth",
    "model",
    "llm-base-url",
    "api-key-env",
    "reasoning-effort",
  ]);
}

function isServiceTierConfigOverride(value: string | undefined): boolean {
  if (!value) return false;
  return value.trim().startsWith("service_tier=");
}

function stripCodexLlmOverrideArgs(args: string[]): string[] {
  const withoutSimpleOverrides = stripSingleValueCliOptions(args, [
    "model",
    "reasoning-effort",
  ]);
  const out: string[] = [];
  for (let index = 0; index < withoutSimpleOverrides.length; index += 1) {
    const token = withoutSimpleOverrides[index];
    if (token === undefined) continue;
    if (token === "--config-override") {
      const value = withoutSimpleOverrides[index + 1];
      if (isServiceTierConfigOverride(value)) {
        index += 1;
        continue;
      }
    }
    if (
      token.startsWith("--config-override=") &&
      isServiceTierConfigOverride(token.slice("--config-override=".length))
    ) {
      continue;
    }
    out.push(token);
  }
  return out;
}

function appendInlineHttpLlmOverrideArgs(
  args: string[],
  llm: ReviewLlmRef | undefined,
): void {
  if (!llm) return;
  const normalized = normalizeLlmModelSwitcher(llm);
  if (isDirectModelCallSelection(normalized)) {
    args.push("--provider", normalized.model_provider);
  } else if (llm.provider) {
    args.push("--provider", llm.provider);
  }
  if (normalized?.auth) args.push("--auth", normalized.auth);
  else if (llm.auth) args.push("--auth", llm.auth);
  if (normalized?.model_id) args.push("--model", normalized.model_id);
  else if (llm.model) args.push("--model", llm.model);
  if (normalized?.base_url) args.push("--llm-base-url", normalized.base_url);
  else if (llm.base_url) args.push("--llm-base-url", llm.base_url);
  if (normalized?.api_key_env) {
    args.push("--api-key-env", normalized.api_key_env);
  } else if (llm.api_key_env) {
    args.push("--api-key-env", llm.api_key_env);
  }
  if (normalized?.reasoning_effort) {
    args.push("--reasoning-effort", normalized.reasoning_effort);
  } else if (llm.effort) {
    args.push("--reasoning-effort", llm.effort);
  }
}

function appendCodexLlmOverrideArgs(
  args: string[],
  llm: ReviewLlmRef | undefined,
): void {
  if (!llm) return;
  if (llm.model) args.push("--model", llm.model);
  if (llm.effort) args.push("--reasoning-effort", llm.effort);
  if (llm.service_tier) {
    args.push("--config-override", `service_tier="${llm.service_tier}"`);
  }
}

function appendInlineHttpUnitExecutionKnobArgs(
  args: string[],
  settings: ReviewUnitExecutionSettings | undefined,
): void {
  if (!settings) return;
  if (settings.max_tokens !== undefined) {
    args.push("--max-tokens", String(settings.max_tokens));
  }
  if (settings.tool_mode !== undefined) {
    const toolMode: ReviewToolMode = settings.tool_mode;
    args.push("--tool-mode", toolMode);
  }
}

function rejectUnsupportedUnitExecutionKnobs(args: {
  settings: ReviewUnitExecutionSettings | undefined;
  unitId: ReviewExecutionUnitId;
  executorKind: string;
}): void {
  if (!args.settings) return;
  const unsupported: string[] = [];
  if (args.settings.max_tokens !== undefined) unsupported.push("max_tokens");
  if (args.settings.tool_mode !== undefined) unsupported.push("tool_mode");
  if (unsupported.length === 0) return;
  throw new Error(
    `Review unit settings for ${args.unitId} include ${unsupported.join(
      ", ",
    )}, but the ${args.executorKind} executor cannot enforce those knobs. Remove them for this route or use the inline HTTP/direct-call executor where they are enforceable.`,
  );
}

function executorConfigWithUnitSettings(args: {
  executorConfig: ReviewUnitExecutorConfig;
  dispatch: ExecutionDispatchResult;
  profile: ReviewExecutionProfile | undefined;
}): ReviewUnitExecutorConfig {
  const unitSettings = unitExecutionSettingsForDispatch(args.profile, args.dispatch);
  if (!unitSettings) {
    return args.executorConfig;
  }

  let executorArgs = [...args.executorConfig.args];
  const unitId = unitSettingsIdForDispatch(args.dispatch);
  const effectiveLlm = args.profile
    ? effectiveReviewUnitLlmRef(args.profile, unitId)
    : unitSettings.llm;
  const isInlineHttp = executorConfigUsesInlineHttpWorker(args.executorConfig);
  if (isInlineHttp) {
    if (effectiveLlm) {
      executorArgs = stripInlineHttpLlmOverrideArgs(executorArgs);
    }
    appendInlineHttpLlmOverrideArgs(executorArgs, effectiveLlm);
    appendInlineHttpUnitExecutionKnobArgs(executorArgs, unitSettings);
  } else if (executorConfigUsesCodexWorker(args.executorConfig)) {
    if (effectiveLlm) {
      executorArgs = stripCodexLlmOverrideArgs(executorArgs);
    }
    appendCodexLlmOverrideArgs(executorArgs, effectiveLlm);
    rejectUnsupportedUnitExecutionKnobs({
      settings: unitSettings,
      unitId,
      executorKind: "codex_cli",
    });
  } else if (executorConfigUsesClaudeWorker(args.executorConfig)) {
    // The claude worker accepts the same --model/--reasoning-effort overrides
    // and likewise cannot enforce the inline-http unit execution knobs.
    appendCodexLlmOverrideArgs(executorArgs, effectiveLlm);
    rejectUnsupportedUnitExecutionKnobs({
      settings: unitSettings,
      unitId,
      executorKind: "claude_code",
    });
  } else {
    rejectUnsupportedUnitExecutionKnobs({
      settings: unitSettings,
      unitId,
      executorKind: "configured",
    });
  }
  return { bin: args.executorConfig.bin, args: executorArgs };
}

async function fileSizeIfPresent(filePath: string): Promise<number | null> {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return null;
  }
}

function isMarkdownFenceLine(line: string): boolean {
  return /^\s{0,3}(?:```|~~~)/.test(line);
}

function markdownHeadingRegex(heading: string): RegExp {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(#{2,3})\\s+${escaped}\\s*$`);
}

function findMarkdownHeading(
  lines: string[],
  heading: string,
): { index: number; level: number } | null {
  const headingPattern = markdownHeadingRegex(heading);
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (isMarkdownFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = headingPattern.exec(line);
    if (!match) continue;
    return { index, level: match[1]?.length ?? 0 };
  }
  return null;
}

function markdownSectionBody(text: string, heading: string): string | null {
  const lines = text.split(/\r?\n/);
  const headingMatch = findMarkdownHeading(lines, heading);
  if (headingMatch === null) return null;

  const bodyLines: string[] = [];
  let inFence = false;
  for (let index = headingMatch.index + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (isMarkdownFenceLine(line)) {
      inFence = !inFence;
      bodyLines.push(line);
      continue;
    }
    const nextHeading = inFence ? null : /^(#{2,3})\s+\S/.exec(line);
    if (nextHeading && (nextHeading[1]?.length ?? 0) <= headingMatch.level) break;
    bodyLines.push(line);
  }
  return bodyLines.join("\n").trim();
}

function requireMarkdownHeadings(args: {
  text: string;
  outputPath: string;
  unitId: string;
  headings: string[];
  requireNonEmptyBodies?: boolean;
}): void {
  const missing: string[] = [];
  const empty: string[] = [];
  for (const heading of args.headings) {
    const body = markdownSectionBody(args.text, heading);
    if (body === null) {
      missing.push(heading);
      continue;
    }
    if (args.requireNonEmptyBodies && body.trim().length === 0) {
      empty.push(heading);
    }
  }
  if (missing.length === 0 && empty.length === 0) return;
  if (empty.length > 0) {
    throw new ReviewUnitOutputContractError(
      `Review unit ${args.unitId} output has empty required section body/bodies: ${empty.join(", ")} in ${args.outputPath}`,
    );
  }
  throw new ReviewUnitOutputContractError(
    `Review unit ${args.unitId} output is missing required section heading(s): ${missing.join(", ")} in ${args.outputPath}`,
  );
}

function parseLensYamlListSection(args: {
  text: string;
  outputPath: string;
  unitId: string;
  heading: string;
}): unknown[] {
  const body = markdownSectionBody(args.text, args.heading);
  if (body === null || body.trim().length === 0) {
    throw new ReviewUnitOutputContractError(
      `Review unit ${args.unitId} output section ${args.heading} must contain a YAML list body in ${args.outputPath}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(body);
  } catch (error) {
    throw new ReviewUnitOutputContractError(
      `Review unit ${args.unitId} output section ${args.heading} has malformed YAML in ${args.outputPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new ReviewUnitOutputContractError(
      `Review unit ${args.unitId} output section ${args.heading} must be a YAML list in ${args.outputPath}`,
    );
  }
  return parsed;
}

function parseLensStringListSection(args: {
  text: string;
  outputPath: string;
  unitId: string;
  heading: string;
}): string[] {
  const body = markdownSectionBody(args.text, args.heading);
  if (body === null || body.trim().length === 0) {
    throw new ReviewUnitOutputContractError(
      `Review unit ${args.unitId} output section ${args.heading} must contain a YAML string list body in ${args.outputPath}`,
    );
  }
  try {
    return parseStringList(body, `${args.unitId} ${args.heading}`);
  } catch (error) {
    throw new ReviewUnitOutputContractError(
      `Review unit ${args.unitId} output section ${args.heading} must be a YAML string list or markdown bullet list in ${args.outputPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertLensDomainConstraintsUsed(args: {
  items: unknown[];
  outputPath: string;
  unitId: string;
}): void {
  for (const [index, item] of args.items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ReviewUnitOutputContractError(
        `Review unit ${args.unitId} Domain Constraints Used item ${index} must be a YAML mapping in ${args.outputPath}`,
      );
    }
    const record = item as Record<string, unknown>;
    for (const field of ["source_doc", "source_version_or_snapshot_id", "anchor"]) {
      if (typeof record[field] !== "string" || record[field].trim().length === 0) {
        throw new ReviewUnitOutputContractError(
          `Review unit ${args.unitId} Domain Constraints Used item ${index} must include non-empty ${field} in ${args.outputPath}`,
        );
      }
    }
  }
}

function assertLensDomainContextAssumptions(args: {
  items: unknown[];
  outputPath: string;
  unitId: string;
}): void {
  for (const [index, item] of args.items.entries()) {
    if (typeof item !== "string") {
      throw new ReviewUnitOutputContractError(
        `Review unit ${args.unitId} Domain Context Assumptions item ${index} must be a string in ${args.outputPath}`,
      );
    }
  }
}

const SYNTHESIZE_PARTICIPATION_RUN_STATUS_VALUES = new Set([
  "full",
  "degraded",
  "insufficient",
]);
const SYNTHESIZE_MISSING_LENS_REASON_VALUES = new Set([
  "missing",
  "failed",
  "abstained",
]);

interface SynthesizeMissingOrFailedLensFrontmatter {
  lens_id: string;
  reason: string;
}

interface SynthesizeParticipationFrontmatter {
  expected_lenses: string[];
  received_lenses: string[];
  missing_or_failed_lenses: SynthesizeMissingOrFailedLensFrontmatter[];
  run_status: string;
}

function requireFrontmatterStringArray(
  value: unknown,
  label: string,
  outputPath: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new ReviewUnitOutputContractError(
      `${label} must be a YAML list in ${outputPath}`,
    );
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new ReviewUnitOutputContractError(
        `${label}[${index}] must be a non-empty string in ${outputPath}`,
      );
    }
    return item;
  });
}

function requireFrontmatterRecord(
  value: unknown,
  label: string,
  outputPath: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReviewUnitOutputContractError(
      `${label} must be a YAML mapping in ${outputPath}`,
    );
  }
  return value as Record<string, unknown>;
}

function validateSynthesizeParticipationFrontmatter(args: {
  metadata: Record<string, unknown> | null;
  outputPath: string;
}): SynthesizeParticipationFrontmatter {
  const participation = requireFrontmatterRecord(
    args.metadata?.participation,
    "Synthesize frontmatter participation",
    args.outputPath,
  );
  const expectedLenses = requireFrontmatterStringArray(
    participation.expected_lenses,
    "Synthesize frontmatter participation.expected_lenses",
    args.outputPath,
  );
  const receivedLenses = requireFrontmatterStringArray(
    participation.received_lenses,
    "Synthesize frontmatter participation.received_lenses",
    args.outputPath,
  );
  const missingOrFailed = participation.missing_or_failed_lenses;
  if (!Array.isArray(missingOrFailed)) {
    throw new ReviewUnitOutputContractError(
      `Synthesize frontmatter participation.missing_or_failed_lenses must be a YAML list in ${args.outputPath}`,
    );
  }
  const missingOrFailedLenses: SynthesizeMissingOrFailedLensFrontmatter[] = [];
  for (const [index, item] of missingOrFailed.entries()) {
    const record = requireFrontmatterRecord(
      item,
      `Synthesize frontmatter participation.missing_or_failed_lenses[${index}]`,
      args.outputPath,
    );
    if (typeof record.lens_id !== "string" || record.lens_id.trim().length === 0) {
      throw new ReviewUnitOutputContractError(
        `Synthesize frontmatter participation.missing_or_failed_lenses[${index}].lens_id must be a non-empty string in ${args.outputPath}`,
      );
    }
    if (
      typeof record.reason !== "string" ||
      !SYNTHESIZE_MISSING_LENS_REASON_VALUES.has(record.reason)
    ) {
      throw new ReviewUnitOutputContractError(
        `Synthesize frontmatter participation.missing_or_failed_lenses[${index}].reason must be one of missing, failed, abstained in ${args.outputPath}`,
      );
    }
    missingOrFailedLenses.push({
      lens_id: record.lens_id,
      reason: record.reason,
    });
  }
  if (
    typeof participation.run_status !== "string" ||
    !SYNTHESIZE_PARTICIPATION_RUN_STATUS_VALUES.has(participation.run_status)
  ) {
    throw new ReviewUnitOutputContractError(
      `Synthesize frontmatter participation.run_status must be one of full, degraded, insufficient in ${args.outputPath}`,
    );
  }
  return {
    expected_lenses: expectedLenses,
    received_lenses: receivedLenses,
    missing_or_failed_lenses: missingOrFailedLenses,
    run_status: participation.run_status,
  };
}

function assertStringSetEqual(args: {
  actual: string[];
  expected: string[];
  label: string;
  outputPath: string;
}): void {
  const actualSet = new Set(args.actual);
  const expectedSet = new Set(args.expected);
  const missing = [...expectedSet].filter((value) => !actualSet.has(value));
  const extra = [...actualSet].filter((value) => !expectedSet.has(value));
  const hasDuplicates = actualSet.size !== args.actual.length;
  if (missing.length === 0 && extra.length === 0 && !hasDuplicates) return;
  throw new ReviewUnitOutputContractError(
    `${args.label} does not match runtime lens truth in ${args.outputPath}: ` +
      `expected=[${args.expected.join(", ")}], actual=[${args.actual.join(", ")}]` +
      (hasDuplicates ? ", duplicate values present" : "") +
      (missing.length > 0 ? `, missing=[${missing.join(", ")}]` : "") +
      (extra.length > 0 ? `, extra=[${extra.join(", ")}]` : ""),
  );
}

function synthesizeRunStatusForLensTruth(args: {
  expectedLensIds: string[];
  receivedLensIds: string[];
}): "full" | "degraded" | "insufficient" {
  if (
    args.expectedLensIds.length > 0 &&
    args.receivedLensIds.length === args.expectedLensIds.length
  ) {
    return "full";
  }
  if (
    args.receivedLensIds.length === 0 ||
    (args.receivedLensIds.length === 1 && args.receivedLensIds[0] === "axiology")
  ) {
    return "insufficient";
  }
  return "degraded";
}

function validateSynthesizeParticipationTruth(args: {
  text: string;
  outputPath: string;
  expectedLensIds: string[];
  receivedLensIds: string[];
}): void {
  const metadata = parseMarkdownFrontmatter<{
    participation?: unknown;
  }>(args.text).metadata;
  const participation = validateSynthesizeParticipationFrontmatter({
    metadata: metadata as Record<string, unknown> | null,
    outputPath: args.outputPath,
  });
  assertStringSetEqual({
    actual: participation.expected_lenses,
    expected: args.expectedLensIds,
    label: "Synthesize frontmatter participation.expected_lenses",
    outputPath: args.outputPath,
  });
  assertStringSetEqual({
    actual: participation.received_lenses,
    expected: args.receivedLensIds,
    label: "Synthesize frontmatter participation.received_lenses",
    outputPath: args.outputPath,
  });
  const expectedMissingLensIds = args.expectedLensIds.filter(
    (lensId) => !args.receivedLensIds.includes(lensId),
  );
  assertStringSetEqual({
    actual: participation.missing_or_failed_lenses.map((item) => item.lens_id),
    expected: expectedMissingLensIds,
    label: "Synthesize frontmatter participation.missing_or_failed_lenses",
    outputPath: args.outputPath,
  });
  const expectedRunStatus = synthesizeRunStatusForLensTruth({
    expectedLensIds: args.expectedLensIds,
    receivedLensIds: args.receivedLensIds,
  });
  if (participation.run_status !== expectedRunStatus) {
    throw new ReviewUnitOutputContractError(
      `Synthesize frontmatter participation.run_status must be ${expectedRunStatus} for runtime lens truth in ${args.outputPath}; got ${participation.run_status}`,
    );
  }
}

function validateMarkdownOutputContract(args: {
  dispatch: ExecutionDispatchResult;
  outputPath: string;
  text: string;
}): void {
  if (args.dispatch.unit_kind === "lens") {
    requireMarkdownHeadings({
      text: args.text,
      outputPath: args.outputPath,
      unitId: args.dispatch.unit_id,
      headings: [
        "Domain Constraints Used",
        "Domain Context Assumptions",
      ],
    });
    assertLensDomainConstraintsUsed({
      items: parseLensYamlListSection({
        text: args.text,
        outputPath: args.outputPath,
        unitId: args.dispatch.unit_id,
        heading: "Domain Constraints Used",
      }),
      outputPath: args.outputPath,
      unitId: args.dispatch.unit_id,
    });
    assertLensDomainContextAssumptions({
      items: parseLensStringListSection({
        text: args.text,
        outputPath: args.outputPath,
        unitId: args.dispatch.unit_id,
        heading: "Domain Context Assumptions",
      }),
      outputPath: args.outputPath,
      unitId: args.dispatch.unit_id,
    });
    return;
  }

  if (args.dispatch.unit_kind === "deliberation") {
    if (args.dispatch.unit_id === "controlled-deliberation") {
      if (!args.text.trimStart().startsWith("---")) {
        throw new ReviewUnitOutputContractError(
          `Controlled deliberation output must start with YAML frontmatter: ${args.outputPath}`,
        );
      }
      const frontmatterStatus = parseMarkdownFrontmatter<{
        deliberation_status?: string;
      }>(args.text).metadata?.deliberation_status;
      if (frontmatterStatus !== "performed") {
        throw new ReviewUnitOutputContractError(
          `Controlled deliberation output must declare deliberation_status: performed in ${args.outputPath}`,
        );
      }
      requireMarkdownHeadings({
        text: args.text,
        outputPath: args.outputPath,
        unitId: args.dispatch.unit_id,
        headings: [
          "Consensus",
          "Conditional Consensus",
          "Disagreement",
          "Deliberation Decision",
          "Axiology-Proposed Additional Perspectives",
          "Purpose Alignment Verification",
          "Immediate Actions Required",
          "Recommendations",
          "Unique Finding Tagging",
        ],
      });
      return;
    }
    requireMarkdownHeadings({
      text: args.text,
      outputPath: args.outputPath,
      unitId: args.dispatch.unit_id,
      headings: [
        "Re-evaluation Summary",
        "Accepted From Other Lenses",
        "Contested Points",
        "Position Changes",
        "Final Lens Position",
      ],
    });
    return;
  }

  if (args.dispatch.unit_kind === "synthesize") {
    if (!args.text.trimStart().startsWith("---")) {
      throw new ReviewUnitOutputContractError(
        `Synthesize output must start with YAML frontmatter: ${args.outputPath}`,
      );
    }
    const frontmatter = parseMarkdownFrontmatter<{
      deliberation_status?: string;
      participation?: unknown;
    }>(args.text).metadata;
    if (frontmatter?.deliberation_status !== "performed") {
      throw new ReviewUnitOutputContractError(
        `Synthesize output must acknowledge controlled deliberation with deliberation_status: performed in ${args.outputPath}`,
      );
    }
    validateSynthesizeParticipationFrontmatter({
      metadata: frontmatter as Record<string, unknown> | null,
      outputPath: args.outputPath,
    });
    requireMarkdownHeadings({
      text: args.text,
      outputPath: args.outputPath,
      unitId: args.dispatch.unit_id,
      requireNonEmptyBodies: true,
      headings: [
        "Consensus",
        "Conditional Consensus",
        "Disagreement",
        "Deliberation Decision",
        "Axiology-Proposed Additional Perspectives",
        "Purpose Alignment Verification",
        "Final Review Result",
        "Boundary Notes",
        "Immediate Actions Required",
        "Recommendations",
        "Unique Finding Tagging",
      ],
    });
  }
}

async function readReviewCancelRequest(
  sessionRoot: string,
): Promise<ReviewCancelRequestArtifact | null> {
  const cancelPath = path.join(sessionRoot, REVIEW_CANCEL_REQUEST_FILENAME);
  if (!(await fileExists(cancelPath))) return null;
  return readYamlDocument<ReviewCancelRequestArtifact>(cancelPath);
}

async function ensureNonEmptyOutputFile(outputPath: string): Promise<void> {
  if (!(await fileExists(outputPath))) {
    throw new ReviewUnitOutputContractError(
      `Executor did not create output file: ${outputPath}`,
    );
  }

  const fileText = await fs.readFile(outputPath, "utf8");
  if (fileText.trim().length === 0) {
    throw new ReviewUnitOutputContractError(
      `Executor created empty output file: ${outputPath}`,
      "empty_output",
    );
  }
}

async function validateUnitOutputFile(args: {
  dispatch: ExecutionDispatchResult;
  outputPath: string;
  executionPlan?: ReviewExecutionPlan;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
}): Promise<void> {
  await ensureNonEmptyOutputFile(args.outputPath);
  const outputBytes = await fileSizeIfPresent(args.outputPath);
  const maxBytes = maxUnitOutputBytes({
    profile: args.reviewExecutionProfile,
    dispatch: args.dispatch,
  });
  if (outputBytes !== null && outputBytes > maxBytes) {
    throw new ReviewUnitOutputContractError(
      `Review unit ${args.dispatch.unit_id} output is too large: ${outputBytes} bytes > ${maxBytes} bytes (${args.outputPath}).`,
    );
  }
  if (args.dispatch.output_format === "lens-sidecar") {
    if (!args.executionPlan) {
      throw new ReviewUnitOutputContractError(
        `Lens sidecar validation requires execution plan context: ${args.outputPath}`,
      );
    }
    try {
      await readValidatedLensSidecarArtifact({
        sidecarPath: args.outputPath,
        sessionId: args.executionPlan.session_id,
        lensId: args.dispatch.unit_id,
        expectedHumanOutputRef: args.dispatch.human_output_ref ?? null,
      });
    } catch (error: unknown) {
      throw new ReviewUnitOutputContractError(
        error instanceof Error ? error.message : String(error),
      );
    }
    if (args.dispatch.human_output_path) {
      await writeLensMarkdownProjectionFromSidecar({
        sidecarPath: args.outputPath,
        humanOutputPath: args.dispatch.human_output_path,
        sessionId: args.executionPlan.session_id,
        lensId: args.dispatch.unit_id,
        expectedHumanOutputRef: args.dispatch.human_output_ref ?? null,
      });
      await ensureNonEmptyOutputFile(args.dispatch.human_output_path);
    }
    return;
  }
  if (
    args.dispatch.output_format === "issue-artifact" ||
    args.dispatch.output_format === "issue-stance-response" ||
    args.dispatch.output_format === "issue-deliberation-response" ||
    args.dispatch.output_format === "deliberation-resolution" ||
    args.dispatch.output_format === "issue-synthesis-response"
  ) {
    return;
  }
  const outputText = await fs.readFile(args.outputPath, "utf8");
  validateMarkdownOutputContract({
    dispatch: args.dispatch,
    outputPath: args.outputPath,
    text: outputText,
  });
}

async function validateSynthesizeOutputParticipationTruth(args: {
  outputPath: string;
  expectedLensIds: string[];
  receivedLensIds: string[];
}): Promise<void> {
  await ensureNonEmptyOutputFile(args.outputPath);
  const outputText = await fs.readFile(args.outputPath, "utf8");
  validateSynthesizeParticipationTruth({
    text: outputText,
    outputPath: args.outputPath,
    expectedLensIds: args.expectedLensIds,
    receivedLensIds: args.receivedLensIds,
  });
}

function failureKindFromError(error: unknown): ReviewUnitFailureKind {
  if (error instanceof ReviewUnitTimeoutError) return "timeout";
  if (error instanceof ReviewUnitOutputContractError) return error.failureKind;
  if (error instanceof Error) return failureKindFromMessage(error.message);
  return "unknown";
}

// Shared transient-transport vocabulary is single-sourced in the dispatch
// breaker module; this consumer adds only its executor-specific extra.
const TRANSIENT_EXECUTOR_FAILURE_PATTERNS = [
  ...TRANSIENT_TRANSPORT_MESSAGE_PATTERNS,
  "responses_retry",
  // Provider pre-dispatch refusals. These arrive as text appended to the
  // worker's echoed output, so they MUST be classified here — the
  // output_contract substring scan below would otherwise match contract
  // keywords echoed from the packet body and mislabel a capacity/quota
  // refusal as an output-format violation (observed live 2026-07-18:
  // "Selected model is at capacity" runs recorded as output_contract).
  // Anchored to the full provider phrases: bare "at capacity"/"usage limit"
  // occur in domain text and validator-echoed refs, and this scan runs FIRST
  // — a loose anchor would reroute genuine contract failures into retries.
  "selected model is at capacity",
  "hit your usage limit",
];

function isTransientExecutorFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return TRANSIENT_EXECUTOR_FAILURE_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

function failureKindFromMessage(message: string): ReviewUnitFailureKind {
  const normalized = message.toLowerCase();
  if (isTransientExecutorFailureMessage(message)) {
    return "executor_exit";
  }
  if (
    normalized.includes("empty output") ||
    normalized.includes("empty final text")
  ) {
    return "empty_output";
  }
  if (
    normalized.includes("did not create output file") ||
    normalized.includes("missing output") ||
    normalized.includes("output missing") ||
    normalized.includes("orchestrator rejected") ||
    normalized.includes("missing required section heading") ||
    normalized.includes("malformed output") ||
    normalized.includes("packet unit boundary details read authority is invalid") ||
    normalized.includes("invalid unit boundary details") ||
    normalized.includes("must start with yaml frontmatter") ||
    normalized.includes("deliberation_status: performed") ||
    normalized.includes("issue synthesis response") ||
    normalized.includes("source_work_item_ref") ||
    normalized.includes("source_refs_used") ||
    normalized.includes("boundary_notes") ||
    normalized.includes("schema_version") ||
    normalized.includes("work_item_id") ||
    normalized.includes("issue_id") ||
    // structured-submit extraction failures (claude: no result payload;
    // both adapters: unparseable submit JSON) are contract violations, not
    // executor transport failures.
    normalized.includes("contained no structured payload") ||
    normalized.includes("structured output json")
  ) {
    return "output_contract";
  }
  return "executor_exit";
}

export function shouldRetryUnitFailure(args: {
  error: unknown;
  attempt: number;
  maxRetries: number;
  dispatch: ExecutionDispatchResult;
  reviewExecutionProfile: ReviewExecutionProfile | undefined;
}): boolean {
  if (args.attempt >= args.maxRetries) return false;
  const failureKind = failureKindFromError(args.error);
  if (failureKind === "empty_output") return false;
  if (failureKind === "output_contract") {
    // §4-2c structural retry gate: an output_contract failure is normally
    // terminal, but a resubmit-correctable whitelist rejection is
    // substring-misclassified as output_contract when its message contains an
    // envelope field name (synthesis: always; deliberation: rare hallucinated
    // ref). Route it back to a corrective retry only when resubmit will actually
    // fire on it — otherwise keep the terminal, byte-identical behavior.
    return isResubmitCorrectableRetry(args);
  }
  return true;
}

/**
 * Allow an output_contract retry iff resubmit is enabled AND the unit is
 * gate-eligible AND the precise structural classifier matches — making the
 * gate's activation a strict subset of the resubmit strategy's activation
 * (design §10: F-1 retry ⟺ strategy fires). Reads the shared
 * RESUBMIT_UNIT_ROUTING table so the gate and dispatcher cannot diverge (M-1).
 * OFF (resubmit disabled) → false → byte-identical to output_contract being
 * terminal. Issue-stance is gate-eligible as of the rare-poison hardening cut:
 * final stance demote/correlated decisions still read the terminal outcome, so
 * an infra final failure remains a whole-run halt rather than being
 * reinterpreted as validation.
 */
function isResubmitCorrectableRetry(args: {
  error: unknown;
  dispatch: ExecutionDispatchResult;
  reviewExecutionProfile: ReviewExecutionProfile | undefined;
}): boolean {
  if (args.reviewExecutionProfile?.retry?.resubmit?.enabled !== true) {
    return false;
  }
  const outputFormat = args.dispatch.output_format;
  const routing = outputFormat
    ? RESUBMIT_UNIT_ROUTING[outputFormat]
    : undefined;
  if (!routing || !routing.gateEligible) return false;
  const message =
    args.error instanceof Error ? args.error.message : String(args.error);
  return routing.classify(message) !== null;
}

function retryTimeoutMs(baseTimeoutMs: number, attempt: number): number {
  const multiplier = attempt + 1;
  const expanded = baseTimeoutMs * multiplier;
  return Number.isFinite(expanded) && expanded > 0
    ? Math.floor(expanded)
    : baseTimeoutMs;
}

/**
 * 설계 B: 리뷰 fan-out 풀(lens/stance)의 dispatch breaker (opt-in,
 * `review.execution.retry.dispatch_breaker`). 리뷰는 per-unit bounded retry가
 * 이미 있으므로 backoff 재시도는 얹지 않는다(규칙 1은 기존 유닛 재시도
 * 예산으로 충족; policy의 backoff_* 필드는 리뷰 배선에서 미소비) — 최종
 * outcome 기록 + 계통 임계 감지 + 배치 halt + 미완료 아티팩트만 추가한다.
 * OFF(기본) = 현행 halt/배리어 동작 보존.
 */
function reviewDispatchBreakerFromProfile(
  profile: ReviewExecutionProfile | undefined,
  args: { concurrent: boolean },
): DispatchBreakerState | null {
  const policy = profile?.retry?.dispatch_breaker;
  // Review lens/stance pools can be Promise.all fan-outs, so completion order
  // must not decide poison-vs-outage recovery classification. This is
  // runtime-owned; it is deliberately not a user-facing settings key.
  return policy?.enabled === true
    ? new DispatchBreakerState({ ...policy, concurrent: args.concurrent })
    : null;
}

/** 리뷰 경로는 `invokeExecutor` 직행이라 dispatch 마커가 없다 — 최종
 * failure.message 기반 분류를 쓴다. stderr 기반이라 content-derived 오분류
 * 리스크는 낮으나 잔여 리스크로 기록 (handoff §3.2). */
function reviewSystemicFailureClassFromOutcome(outcome: ExecutionOutcome) {
  return classifySystemicDispatchFailure(outcome.failure?.message);
}

/** §4-1: record a nested-pool unit's FINAL outcome to the dispatch breaker.
 *
 * A batch-window SUCCESS (`nestedBatchWindow` + success) is recorded as skipped:
 * completed for the recovery set, but no proof the provider lane is alive THIS
 * run, so it must not reset a systemic streak. A FAILURE — whether from the
 * batch window or a real flat dispatch — is classified like the flat path
 * (item-local → dead-letter, systemic → recovery victim); it is never skipped
 * (교차검증 F2/Finding A: skipping a failure mis-labels it completed and drops
 * it from the recovery set, diverging from the flat path). A real flat success
 * drives `recordItemSuccess`. Returns the trip state on the threshold crossing so
 * the caller can freeze halt attribution to it. */
export function recordNestedUnitOutcomeToBreaker(
  breaker: DispatchBreakerState,
  outcome: ExecutionOutcome,
): DispatchBreakerTripState | null {
  if (outcome.nestedBatchWindow && outcome.success) {
    breaker.recordItemSkipped(outcome.dispatch.unit_id);
    return null;
  }
  if (outcome.success) {
    breaker.recordItemSuccess(outcome.dispatch.unit_id);
    return null;
  }
  return breaker.recordItemFailure({
    item_id: outcome.dispatch.unit_id,
    failure_class: reviewSystemicFailureClassFromOutcome(outcome),
    failure_message: outcome.failure?.message ?? "unknown error",
    attempt_count: outcome.attemptCount ?? 1,
  });
}

/** halt_reason vocabulary for a review-side breaker trip — the prefix is the
 * grep/consumer key (reconstruct의 DispatchBreakerTrippedError 문구와 동형). */
export const REVIEW_DISPATCH_BREAKER_HALT_REASON_PREFIX = "dispatch_breaker";

function reviewDispatchBreakerHaltReason(
  trip: DispatchBreakerTripState,
  incompleteArtifactPath: string,
): string {
  return `${REVIEW_DISPATCH_BREAKER_HALT_REASON_PREFIX}: ${trip.failure_class} failed ${trip.consecutive_item_count} consecutive units (threshold ${trip.threshold}) — batch halted, incomplete units persisted for exact re-dispatch (${incompleteArtifactPath})`;
}

/** 규칙 6 관측 상시화 + 규칙 5 정확 재디스패치 집합: breaker-ON 배치는
 * 트립이든 완주든 end-state를 리뷰 세션 루트에 영속한다 (reconstruct의
 * persistDispatchIncompleteArtifact 동형; 경로는 breaker 모듈이 단일소스). */
async function persistReviewDispatchIncompleteArtifact(args: {
  sessionRoot: string;
  batchLabel: "lens" | "issue-stance";
  plannedItemIds: readonly string[];
  state: DispatchBreakerState;
}): Promise<string> {
  const artifactPath = dispatchIncompleteArtifactPath(args.sessionRoot);
  await writeYamlDocument(
    artifactPath,
    buildDispatchIncompleteArtifact({
      pipeline: "review",
      batchLabel: args.batchLabel,
      createdAt: isoFromTimestamp(Date.now()),
      plannedItemIds: args.plannedItemIds,
      state: args.state,
    }),
  );
  return artifactPath;
}

/**
 * 설계 A (bounded resubmit): before the next retry of an issue-stance unit
 * whose submit was rejected by the `issue_evidence_refs` whitelist, inject
 * the error spec into the unit's packet so the retry is a corrective
 * resubmit instead of a blind re-run. The retry budget itself is unchanged
 * (`issue_artifact_max_retries`); only the packet content differs. Opt-in
 * via `review.execution.retry.resubmit.enabled`; returns true when a spec
 * was applied.
 */
async function applyStanceResubmitErrorSpec(args: {
  dispatch: ExecutionDispatchResult;
  error: unknown;
  attempt: number;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
  errorLogPath: string;
}): Promise<boolean> {
  if (args.reviewExecutionProfile?.retry?.resubmit?.enabled !== true) {
    return false;
  }
  if (args.dispatch.output_format !== "issue-stance-response") return false;
  const violation =
    classifyUnsupportedEvidenceRefFailure(
      args.error instanceof Error ? args.error.message : String(args.error),
    ) ?? (await readFrozenUnsupportedRefViolation(args.dispatch.output_path));
  if (!violation) return false;
  let packetText: string;
  try {
    packetText = await fs.readFile(args.dispatch.packet_path, "utf8");
  } catch {
    return false;
  }
  let allowedRefs: string[] = [];
  try {
    const context = parseRuntimeIssueStanceSchemaContext(packetText);
    allowedRefs = context.issue_evidence_refs[violation.issueId] ?? [];
  } catch {
    allowedRefs = [];
  }
  const resubmitAttempt = args.attempt + 1;
  await fs.writeFile(
    args.dispatch.packet_path,
    applyResubmitErrorSpecToPacket(
      packetText,
      buildResubmitErrorSpec({
        violation,
        allowedEvidenceRefs: allowedRefs,
        resubmitAttempt,
      }),
    ),
    "utf8",
  );
  await appendExecutionProgress(
    args.errorLogPath,
    `runner stance resubmit: ${args.dispatch.unit_id}`,
    [
      `resubmit_attempt: ${resubmitAttempt}`,
      `issue_id: ${violation.issueId}`,
      `unsupported_ref: ${violation.evidenceRef}`,
    ],
  );
  return true;
}

/** Worker adapters exit before stderr reliably carries the validation text;
 * the per-attempt frozen salvage input is the structural evidence source. */
async function readFrozenUnsupportedRefViolation(
  outputPath: string,
): Promise<ReturnType<typeof classifyUnsupportedEvidenceRefFailure>> {
  try {
    const raw = await fs.readFile(salvageInputPathFor(outputPath), "utf8");
    const frozen = JSON.parse(raw) as SalvageInput;
    return typeof frozen.error === "string"
      ? classifyUnsupportedEvidenceRefFailure(frozen.error)
      : null;
  } catch {
    return null;
  }
}

/**
 * §4-2c single source for resubmit unit routing. Both the dispatcher
 * (`applyResubmitErrorSpec` → `apply`) and the structural retry gate
 * (`shouldRetryUnitFailure` → `classify` + `gateEligible`) read this one table,
 * so the "retry-allowed ⟺ resubmit-strategy-fires" invariant cannot drift across
 * two parallel switches. `gateEligible` marks units whose output_contract-poison
 * rejections may be routed back to a corrective retry — deliberation and
 * synthesis, which degrade non-haltingly on cap exhaustion, and stance rare
 * output_contract-poison failures, whose terminal outcome still drives the
 * existing demote/correlated machinery. If a stance retry ends in infra failure,
 * it remains a halt; only terminal validation failures demote or correlate.
 */
interface ResubmitUnitRouting {
  classify: (message: string) => unknown | null;
  apply: (args: {
    dispatch: ExecutionDispatchResult;
    error: unknown;
    attempt: number;
    reviewExecutionProfile?: ReviewExecutionProfile | undefined;
    errorLogPath: string;
  }) => Promise<boolean>;
  gateEligible: boolean;
}

export const RESUBMIT_UNIT_ROUTING: Record<string, ResubmitUnitRouting> =
  Object.freeze({
    "issue-stance-response": {
      classify: classifyUnsupportedEvidenceRefFailure,
      apply: applyStanceResubmitErrorSpec,
      gateEligible: true,
    },
    "issue-deliberation-response": {
      classify: classifyDeliberationUnsupportedEvidenceRefFailure,
      apply: applyDeliberationResubmitErrorSpec,
      gateEligible: true,
    },
    "issue-synthesis-response": {
      classify: classifySynthesisUnsupportedSourceRefFailure,
      apply: applySynthesisResubmitErrorSpec,
      gateEligible: true,
    },
  });

/**
 * 설계 A / §4-6a / §4-2c: unit-agnostic entry for bounded resubmit error-spec
 * injection. Routes by `output_format` through the shared routing table to the
 * per-unit strategy; unrouted formats (ledgers, lenses, …) are a no-op, so the
 * retry stays blind for units without a classifiable, spec-correctable
 * validation rejection. The opt-in gate is re-checked here so OFF returns before
 * any per-unit work.
 */
export async function applyResubmitErrorSpec(args: {
  dispatch: ExecutionDispatchResult;
  error: unknown;
  attempt: number;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
  errorLogPath: string;
  /** When provided, a spec application also refreshes the context manifest's
   * packet_sha256 for the mutated packet. The manifest pins each packet's
   * dispatch-time hash and continuation FAIL-CLOSES on mismatch
   * (packet_hash_mismatch), so a runtime-owned packet mutation without a
   * manifest refresh bricks `onto_review_continue` for any session halted
   * after a resubmit injection. */
  executionPlan?: ReviewExecutionPlan | undefined;
}): Promise<boolean> {
  if (args.reviewExecutionProfile?.retry?.resubmit?.enabled !== true) {
    return false;
  }
  const outputFormat = args.dispatch.output_format;
  const routing = outputFormat
    ? RESUBMIT_UNIT_ROUTING[outputFormat]
    : undefined;
  const applied = routing ? await routing.apply(args) : false;
  if (applied && args.executionPlan !== undefined) {
    await refreshManifestPacketHash({
      executionPlan: args.executionPlan,
      packetPath: args.dispatch.packet_path,
    });
  }
  return applied;
}

/** K2 (20260712-stance-ref-vocabulary-unification-design.md §5): re-pin the
 * manifest packet_sha256 after a legitimate runtime-owned packet mutation
 * (resubmit error spec). No-op when the packet has no manifest ref yet. */
async function refreshManifestPacketHash(args: {
  executionPlan: ReviewExecutionPlan;
  packetPath: string;
}): Promise<void> {
  let manifestPath: string;
  let manifest: ReviewContextManifestArtifact;
  try {
    ({ manifestPath, manifest } = await readReviewContextManifest(
      args.executionPlan,
    ));
  } catch {
    // No materialized manifest (e.g. unit-scoped test harnesses) → nothing is
    // pinned, so there is nothing to re-pin.
    return;
  }
  const resolvedPacketPath = path.resolve(args.packetPath);
  const entry = manifest.packet_refs.find(
    (ref) => path.resolve(ref.packet_ref) === resolvedPacketPath,
  );
  if (!entry) return;
  const packetSha256 = await optionalFileDigest(args.packetPath);
  if (!packetSha256 || packetSha256 === entry.packet_sha256) return;
  const updatedManifest: ReviewContextManifestArtifact = {
    ...manifest,
    packet_refs: manifest.packet_refs.map((ref) =>
      path.resolve(ref.packet_ref) === resolvedPacketPath
        ? { ...ref, packet_sha256: packetSha256 }
        : ref,
    ),
  };
  await writeYamlDocument(manifestPath, updatedManifest);
}

/** deliberation unit_id is `deliberation:<issueId>:<lensId>` (the live colon
 * form built by buildIssueScopedLensDeliberationPrompt); mirrors the split
 * convention in haltLensIdFromOutcome. */
function deliberationUnitIdParts(
  unitId: string,
): { issueId: string; lensId: string } | null {
  if (!unitId.startsWith("deliberation:")) return null;
  const [, issueId, lensId] = unitId.split(":");
  if (!issueId || !lensId) return null;
  return { issueId, lensId };
}

/**
 * §4-6a deliberation strategy: inject the evidence_refs error spec before the
 * next retry of a deliberation-response unit whose submit was rejected by the
 * `allowed_evidence_refs` whitelist. The deliberation throw carries only the
 * ref, so issue_id/lens_id come from the dispatch unit_id and the allowed set
 * from the packet's runtime projection (flat, single-(issue,lens) scope).
 * Cap exhaustion keeps deliberation's existing non-halting degrade
 * (completeUnavailableDeliberationResponseUnit) — no demotion machinery.
 */
async function applyDeliberationResubmitErrorSpec(args: {
  dispatch: ExecutionDispatchResult;
  error: unknown;
  attempt: number;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
  errorLogPath: string;
}): Promise<boolean> {
  if (args.reviewExecutionProfile?.retry?.resubmit?.enabled !== true) {
    return false;
  }
  if (args.dispatch.output_format !== "issue-deliberation-response") {
    return false;
  }
  const violation =
    classifyDeliberationUnsupportedEvidenceRefFailure(
      args.error instanceof Error ? args.error.message : String(args.error),
    ) ??
    (await readFrozenDeliberationUnsupportedRefViolation(
      args.dispatch.output_path,
    ));
  if (!violation) return false;
  const parts = deliberationUnitIdParts(args.dispatch.unit_id);
  if (!parts) return false;
  let packetText: string;
  try {
    packetText = await fs.readFile(args.dispatch.packet_path, "utf8");
  } catch {
    return false;
  }
  let allowedRefs: string[] = [];
  try {
    allowedRefs =
      parseRuntimeIssueDeliberationSchemaContext(packetText).allowed_evidence_refs;
  } catch {
    allowedRefs = [];
  }
  const resubmitAttempt = args.attempt + 1;
  await fs.writeFile(
    args.dispatch.packet_path,
    applyResubmitErrorSpecToPacket(
      packetText,
      buildResubmitErrorSpec({
        violation: {
          stanceIndex: null,
          issueId: parts.issueId,
          evidenceRef: violation.evidenceRef,
        },
        allowedEvidenceRefs: allowedRefs,
        resubmitAttempt,
        unit: { kind: "deliberation", lensId: parts.lensId },
      }),
    ),
    "utf8",
  );
  await appendExecutionProgress(
    args.errorLogPath,
    `runner deliberation resubmit: ${args.dispatch.unit_id}`,
    [
      `resubmit_attempt: ${resubmitAttempt}`,
      `issue_id: ${parts.issueId}`,
      `lens_id: ${parts.lensId}`,
      `unsupported_ref: ${violation.evidenceRef}`,
    ],
  );
  return true;
}

/** Deliberation counterpart of readFrozenUnsupportedRefViolation: the salvage
 * freeze is output_format-agnostic, so a deliberation submit rejection is
 * recoverable from the frozen error even when the adapter swallowed stderr. */
async function readFrozenDeliberationUnsupportedRefViolation(
  outputPath: string,
): Promise<ReturnType<typeof classifyDeliberationUnsupportedEvidenceRefFailure>> {
  try {
    const raw = await fs.readFile(salvageInputPathFor(outputPath), "utf8");
    const frozen = JSON.parse(raw) as SalvageInput;
    return typeof frozen.error === "string"
      ? classifyDeliberationUnsupportedEvidenceRefFailure(frozen.error)
      : null;
  } catch {
    return null;
  }
}

/** synthesis unit_id is `synthesis:<issueId>` (workItem.work_item_id, built in
 * synthesis-map-reduce as `synthesis:${issue_id}`); the source_refs_used
 * rejection text carries no issue_id, so it is recovered here. */
function synthesisIssueIdFromUnitId(unitId: string): string | null {
  if (!unitId.startsWith("synthesis:")) return null;
  const issueId = unitId.slice("synthesis:".length);
  return issueId.length > 0 ? issueId : null;
}

/**
 * §4-2c/2-A synthesis strategy: inject the source_refs_used error spec before
 * the next retry of a synthesis-response unit whose submit was rejected by the
 * `allowed_source_refs` whitelist (bad ref) or the "must include at least one"
 * guard. issue_id comes from the dispatch unit_id, the allowed set from the
 * packet's runtime projection. Cap exhaustion keeps synthesis's existing
 * non-halting degrade (completeUnavailableSynthesisResponseUnit) — no demotion
 * machinery. In-loop retry reachability depends on the structural retry gate
 * (shouldRetryUnitFailure), because the synthesis rejection message always
 * substring-classifies as output_contract.
 */
async function applySynthesisResubmitErrorSpec(args: {
  dispatch: ExecutionDispatchResult;
  error: unknown;
  attempt: number;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
  errorLogPath: string;
}): Promise<boolean> {
  if (args.reviewExecutionProfile?.retry?.resubmit?.enabled !== true) {
    return false;
  }
  if (args.dispatch.output_format !== "issue-synthesis-response") return false;
  const violation =
    classifySynthesisUnsupportedSourceRefFailure(
      args.error instanceof Error ? args.error.message : String(args.error),
    ) ??
    (await readFrozenSynthesisUnsupportedRefViolation(args.dispatch.output_path));
  if (!violation) return false;
  const issueId = synthesisIssueIdFromUnitId(args.dispatch.unit_id);
  if (!issueId) return false;
  let packetText: string;
  try {
    packetText = await fs.readFile(args.dispatch.packet_path, "utf8");
  } catch {
    return false;
  }
  let allowedRefs: string[] = [];
  try {
    allowedRefs =
      parseRuntimeIssueSynthesisSchemaContext(packetText).allowed_source_refs;
  } catch {
    allowedRefs = [];
  }
  const resubmitAttempt = args.attempt + 1;
  await fs.writeFile(
    args.dispatch.packet_path,
    applyResubmitErrorSpecToPacket(
      packetText,
      buildResubmitErrorSpec({
        violation: {
          stanceIndex: null,
          issueId,
          evidenceRef: violation.sourceRef ?? "",
        },
        allowedEvidenceRefs: allowedRefs,
        resubmitAttempt,
        unit: { kind: "synthesis", issueId },
      }),
    ),
    "utf8",
  );
  await appendExecutionProgress(
    args.errorLogPath,
    `runner synthesis resubmit: ${args.dispatch.unit_id}`,
    [
      `resubmit_attempt: ${resubmitAttempt}`,
      `issue_id: ${issueId}`,
      `unsupported_ref: ${violation.sourceRef ?? "(none — must cite >=1 allowed source ref)"}`,
    ],
  );
  return true;
}

/** Synthesis counterpart of readFrozenUnsupportedRefViolation. */
async function readFrozenSynthesisUnsupportedRefViolation(
  outputPath: string,
): Promise<ReturnType<typeof classifySynthesisUnsupportedSourceRefFailure>> {
  try {
    const raw = await fs.readFile(salvageInputPathFor(outputPath), "utf8");
    const frozen = JSON.parse(raw) as SalvageInput;
    return typeof frozen.error === "string"
      ? classifySynthesisUnsupportedSourceRefFailure(frozen.error)
      : null;
  } catch {
    return null;
  }
}

function parseExecutorRunMetadata(stdout: string): ReviewExecutorRunMetadata | undefined {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    const metadata: ReviewExecutorRunMetadata = {};
    if (typeof record.input_tokens === "number") {
      metadata.input_tokens = record.input_tokens;
    }
    if (typeof record.output_tokens === "number") {
      metadata.output_tokens = record.output_tokens;
    }
    if (typeof record.tool_calls === "number") {
      metadata.tool_calls = record.tool_calls;
    }
    if (typeof record.tool_iterations === "number") {
      metadata.tool_iterations = record.tool_iterations;
    }
    if (typeof record.tool_mode === "string") {
      metadata.tool_mode = record.tool_mode;
    }
    const nativeAdmission = parseNativeAdmissionMetadata(record.native_admission);
    if (nativeAdmission) {
      metadata.native_admission = nativeAdmission;
    }
    const toolBoundarySkips = parseToolBoundarySkipMetadata(
      record.tool_boundary_skips,
    );
    if (toolBoundarySkips) {
      metadata.tool_boundary_skips = toolBoundarySkips;
    }
    const citationAudit = parseCitationAuditMetadata(record.citation_audit);
    if (citationAudit.audit) {
      metadata.citation_audit = citationAudit.audit;
    }
    if (citationAudit.rejection) {
      metadata.citation_audit_rejection = citationAudit.rejection;
    }
    if (isReviewHostRuntime(record.host_runtime)) {
      metadata.host_runtime = record.host_runtime;
    }
    if (typeof record.model_id === "string") {
      metadata.model_id = record.model_id;
    }
    if (isReviewArtifactGenerationRealization(record.artifact_generation_realization)) {
      metadata.artifact_generation_realization =
        record.artifact_generation_realization;
      metadata.semantic_quality_evidence =
        semanticQualityEvidenceForArtifactGeneration(
          record.artifact_generation_realization,
        );
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  } catch {
    return undefined;
  }
}

function isReviewHostRuntime(value: unknown): value is ReviewHostRuntime {
  return (
    value === "codex" ||
    value === "anthropic" ||
    value === "openai" ||
    value === "grok" ||
    value === "lmstudio" ||
    value === "standalone"
  );
}

function parseCitationAuditMetadata(value: unknown): {
  audit?: ReviewCitationAuditMetadata;
  rejection?: ReviewCitationAuditRejectionMetadata;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const quotesUnmatched = record.quotes_unmatched;
  const quotesUnmatchedMeta = record.quotes_unmatched_meta;
  const status = record.status;
  const coverageStatus = record.coverage_status;
  const failedRefs = record.failed_refs;
  if (
    typeof record.quotes_checked !== "number" ||
    !Array.isArray(quotesUnmatched) ||
    !quotesUnmatched.every((item) => typeof item === "string") ||
    !Array.isArray(quotesUnmatchedMeta) ||
    !quotesUnmatchedMeta.every((item) => typeof item === "string") ||
    typeof record.attribution_count !== "number" ||
    typeof record.min_quote_length !== "number"
  ) {
    return {};
  }
  if (status !== undefined && status !== "completed" && status !== "skipped") {
    return {};
  }
  if (
    coverageStatus !== undefined &&
    coverageStatus !== "complete" &&
    coverageStatus !== "partial" &&
    coverageStatus !== "none"
  ) {
    return {};
  }
  if (
    failedRefs !== undefined &&
    (!Array.isArray(failedRefs) ||
      !failedRefs.every((item) => typeof item === "string"))
  ) {
    return {};
  }
  const normalizedStatus =
    status === "completed" || status === "skipped"
      ? status
      : typeof record.skip_reason === "string"
        ? "skipped"
        : "completed";
  const normalizedCoverageStatus =
    coverageStatus === "complete" ||
    coverageStatus === "partial" ||
    coverageStatus === "none"
      ? coverageStatus
      : normalizedStatus === "skipped"
        ? "none"
        : Array.isArray(failedRefs) && failedRefs.length > 0
          ? "partial"
          : "complete";
  const normalizedFailedRefs = Array.isArray(failedRefs) ? failedRefs : [];
  if (
    (normalizedStatus === "skipped" && normalizedCoverageStatus !== "none") ||
    (normalizedStatus === "completed" && normalizedCoverageStatus === "none") ||
    (normalizedCoverageStatus === "complete" && normalizedFailedRefs.length > 0) ||
    (coverageStatus === "partial" && normalizedFailedRefs.length === 0)
  ) {
    return {
      rejection: {
        reason: "contradictory_status_coverage",
        status: normalizedStatus,
        coverage_status: normalizedCoverageStatus,
        ...(typeof record.skip_reason === "string"
          ? { skip_reason: record.skip_reason }
          : {}),
      },
    };
  }
  return {
    audit: {
      status: normalizedStatus,
      coverage_status: normalizedCoverageStatus,
      quotes_checked: record.quotes_checked,
      quotes_unmatched: [...quotesUnmatched],
      quotes_unmatched_meta: [...quotesUnmatchedMeta],
      attribution_count: record.attribution_count,
      min_quote_length: record.min_quote_length,
      ...(typeof record.skip_reason === "string"
        ? { skip_reason: record.skip_reason }
        : {}),
      ...(normalizedFailedRefs.length > 0
        ? { failed_refs: [...normalizedFailedRefs] }
        : {}),
    },
  };
}

function parseNativeAdmissionMetadata(
  value: unknown,
): ReviewNativeAdmissionMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const attemptedNativeToolBoundarySkips = parseToolBoundarySkipMetadata(
    record.attempted_native_tool_boundary_skips,
  );
  if (
    typeof record.requested_tool_mode !== "string" ||
    typeof record.effective_tool_mode !== "string" ||
    typeof record.decision !== "string"
  ) {
    return undefined;
  }
  return {
    requested_tool_mode: record.requested_tool_mode,
    effective_tool_mode: record.effective_tool_mode,
    decision: record.decision,
    ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    ...(typeof record.allowed_read_refs_count === "number"
      ? { allowed_read_refs_count: record.allowed_read_refs_count }
      : {}),
    ...(typeof record.read_authority_declared === "boolean"
      ? { read_authority_declared: record.read_authority_declared }
      : {}),
    ...(typeof record.read_authority_malformed === "boolean"
      ? { read_authority_malformed: record.read_authority_malformed }
      : {}),
    ...(typeof record.read_authority_failure === "string"
      ? { read_authority_failure: record.read_authority_failure }
      : {}),
    ...(attemptedNativeToolBoundarySkips
      ? { attempted_native_tool_boundary_skips: attemptedNativeToolBoundarySkips }
      : {}),
  };
}

function parseToolBoundarySkipMetadata(
  value: unknown,
): ReviewToolBoundarySkipMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.boundary_skips !== "number" ||
    typeof record.unreadable_skips !== "number" ||
    typeof record.oversized_skips !== "number"
  ) {
    return undefined;
  }
  return {
    boundary_skips: record.boundary_skips,
    unreadable_skips: record.unreadable_skips,
    oversized_skips: record.oversized_skips,
  };
}

async function invokeExecutor(
  executorConfig: ReviewUnitExecutorConfig,
  projectRoot: string,
  sessionRoot: string,
  executionPlan: ReviewExecutionPlan,
  dispatch: ExecutionDispatchResult,
  timeoutMs: number = DEFAULT_REVIEW_UNIT_TIMEOUT_MS,
  reviewExecutionProfile?: ReviewExecutionProfile | undefined,
  /** Extra executor argv (e.g. submit-salvage re-invocation flags). */
  extraArgs: string[] = [],
): Promise<ReviewExecutorRunMetadata | undefined> {
  const effectiveExecutorConfig = executorConfigWithUnitSettings({
    executorConfig,
    dispatch,
    profile: reviewExecutionProfile,
  });
  const artifactGenerationRealization =
    reviewExecutionProfile?.artifact_generation_realization ??
    executionPlan.artifact_generation_realization;
  await fs.mkdir(path.dirname(dispatch.output_path), { recursive: true });
  const extraDispatchArgs = [
    ...(dispatch.output_format && dispatch.output_format !== "markdown"
      ? ["--output-format", dispatch.output_format]
      : []),
    ...(dispatch.human_output_ref
      ? ["--human-output-ref", dispatch.human_output_ref]
      : []),
    ...(executorConfigUsesInlineHttpWorker(effectiveExecutorConfig)
      ? ["--artifact-generation-realization", artifactGenerationRealization]
      : []),
  ];

  const detached = process.platform !== "win32";
  const child = spawn(
    effectiveExecutorConfig.bin,
    [
      ...effectiveExecutorConfig.args,
      "--project-root",
      projectRoot,
      "--session-root",
      sessionRoot,
      "--unit-id",
      dispatch.unit_id,
      "--unit-kind",
      dispatch.unit_kind,
      "--packet-path",
      dispatch.packet_path,
      "--output-path",
      dispatch.output_path,
      ...extraDispatchArgs,
      ...extraArgs,
    ],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      detached,
      env: {
        ...process.env,
        ...(process.env.ONTO_HOME ? { ONTO_HOME: process.env.ONTO_HOME } : {}),
      },
    },
  );
  const runtimeSourceBase = {
    kind: "process" as const,
    label: `${dispatch.unit_kind}:${dispatch.unit_id}`,
    unitId: dispatch.unit_id,
    stageId: dispatch.unit_kind,
  };
  const runtimeSource = child.pid !== undefined
    ? { ...runtimeSourceBase, processId: child.pid }
    : runtimeSourceBase;
  appendRuntimeStreamEventSync({
    pipeline: "review",
    sessionRoot,
    source: runtimeSource,
    stream: "status",
    message: `executor started: ${dispatch.unit_kind} ${dispatch.unit_id}`,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
    appendRuntimeStreamChunkSync(
      {
        pipeline: "review",
        sessionRoot,
        source: runtimeSource,
        stream: "stdout",
      },
      chunk,
    );
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
    appendRuntimeStreamChunkSync(
      {
        pipeline: "review",
        sessionRoot,
        source: runtimeSource,
        stream: "stderr",
      },
      chunk,
    );
  });

  let timedOut = false;
  let forceKillTimer: NodeJS.Timeout | null = null;
  const terminateChild = (signal: NodeJS.Signals): void => {
    if (child.pid === undefined) return;
    try {
      if (detached) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch {
      // Process may have exited between timeout and signal delivery.
    }
  };

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    terminateChild("SIGTERM");
    forceKillTimer = setTimeout(() => terminateChild("SIGKILL"), 2_000);
  }, timeoutMs);
  const exitCode = await awaitChildExit(child, {
    onSettled: () => {
      clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    },
  });
  appendRuntimeStreamEventSync({
    pipeline: "review",
    sessionRoot,
    source: runtimeSource,
    stream: "status",
    message: `executor exited: ${dispatch.unit_kind} ${dispatch.unit_id} code=${exitCode}`,
  });

  if (timedOut) {
    await removeFileIfExists(dispatch.output_path);
    throw new ReviewUnitTimeoutError(dispatch.unit_id, timeoutMs);
  }

  if (exitCode !== 0) {
    const stderrMessage = stderr.trim();
    const stdoutMessage = stdout.trim();
    const combinedMessage = [stderrMessage, stdoutMessage]
      .filter((message) => message.length > 0)
      .join("\n");
    throw new Error(
      combinedMessage.length > 0
        ? combinedMessage
        : `Executor exited with code ${exitCode} for ${dispatch.unit_id}`,
    );
  }

  if (stderr.trim().length > 0) {
    console.warn(`[review runner warning] ${dispatch.unit_id}: ${stderr.trim()}`);
  }

  await validateUnitOutputFile({
    dispatch,
    outputPath: dispatch.output_path,
    executionPlan,
    reviewExecutionProfile,
  });
  return parseExecutorRunMetadata(stdout);
}

// Exported for the resubmit-marker falsifiability tests (review-cert/v2
// §5.3): the outcome→unit-result projection is where the marker would be
// silently dropped if the wiring regressed.
export function toUnitExecutionResult(
  outcome: ExecutionOutcome,
): ReviewUnitExecutionResult {
  if (outcome.preservedResult) {
    return normalizePreservedUnitExecutionResult(outcome.preservedResult);
  }
  return {
    unit_id: outcome.dispatch.unit_id,
    unit_kind: outcome.dispatch.unit_kind,
    packet_path: outcome.dispatch.packet_path,
    output_path: outcome.dispatch.output_path,
    status: outcome.success ? "completed" : "failed",
    started_at: isoFromTimestamp(outcome.startedAtMs),
    completed_at: isoFromTimestamp(outcome.completedAtMs),
    duration_ms: Math.max(0, outcome.completedAtMs - outcome.startedAtMs),
    // TS runner measures process wall-clock via Date.now() around
    // invokeExecutor; both ends are exact to millisecond precision.
    timestamp_provenance: "runner_wallclock",
    failure_message: outcome.failure?.message ?? null,
    failure_kind: outcome.failure?.failure_kind ?? null,
    ...(outcome.attemptCount !== undefined
      ? { attempt_count: outcome.attemptCount }
      : {}),
    ...(outcome.resubmitApplied ? { resubmit_applied: true } : {}),
    ...(outcome.packetBytes !== undefined
      ? { packet_bytes: outcome.packetBytes }
      : {}),
    ...(outcome.outputBytes !== undefined
      ? { output_bytes: outcome.outputBytes }
      : {}),
    ...(outcome.executorMetadata?.input_tokens !== undefined
      ? { input_tokens: outcome.executorMetadata.input_tokens }
      : {}),
    ...(outcome.executorMetadata?.output_tokens !== undefined
      ? { output_tokens: outcome.executorMetadata.output_tokens }
      : {}),
    ...(outcome.executorMetadata?.tool_calls !== undefined
      ? { tool_calls: outcome.executorMetadata.tool_calls }
      : {}),
    ...(outcome.executorMetadata?.tool_iterations !== undefined
      ? { tool_iterations: outcome.executorMetadata.tool_iterations }
      : {}),
    ...(outcome.executorMetadata?.tool_mode !== undefined
      ? { executor_tool_mode: outcome.executorMetadata.tool_mode }
      : {}),
    ...(outcome.executorMetadata?.native_admission !== undefined
      ? { native_admission: outcome.executorMetadata.native_admission }
      : {}),
    ...(outcome.executorMetadata?.tool_boundary_skips !== undefined
      ? { tool_boundary_skips: outcome.executorMetadata.tool_boundary_skips }
      : {}),
    ...(outcome.executorMetadata?.citation_audit !== undefined
      ? { citation_audit: outcome.executorMetadata.citation_audit }
      : {}),
    ...(outcome.executorMetadata?.citation_audit_rejection !== undefined
      ? {
          citation_audit_rejection:
            outcome.executorMetadata.citation_audit_rejection,
        }
      : {}),
    ...(outcome.executorMetadata?.host_runtime !== undefined
      ? { executor_host_runtime: outcome.executorMetadata.host_runtime }
      : {}),
    ...(outcome.executorMetadata?.model_id !== undefined
      ? { model_id: outcome.executorMetadata.model_id }
      : {}),
    ...(outcome.artifactGenerationRealization !== undefined
      ? { artifact_generation_realization: outcome.artifactGenerationRealization }
      : {}),
    ...(outcome.semanticQualityEvidence !== undefined
      ? { semantic_quality_evidence: outcome.semanticQualityEvidence }
      : {}),
    ...(outcome.childOutcomes !== undefined
      ? {
          child_result_count: outcome.childOutcomes.length,
          child_results: outcome.childOutcomes.map(toUnitExecutionResult),
        }
      : {}),
    ...(outcome.recovery !== undefined ? { recovery: outcome.recovery } : {}),
  };
}

function normalizePreservedUnitExecutionResult(
  result: ReviewUnitExecutionResult,
): ReviewUnitExecutionResult {
  const normalizeChildren = (
    target: ReviewUnitExecutionResult,
  ): ReviewUnitExecutionResult =>
    target.child_results
      ? {
          ...target,
          child_result_count:
            target.child_result_count ?? target.child_results.length,
          child_results: target.child_results.map(
            normalizePreservedUnitExecutionResult,
          ),
        }
      : target;
  if (result.citation_audit === undefined || result.citation_audit === null) {
    return normalizeChildren(result);
  }
  const citationAudit = parseCitationAuditMetadata(result.citation_audit);
  if (citationAudit.audit) {
    const sanitized: ReviewUnitExecutionResult = { ...result };
    delete sanitized.citation_audit_rejection;
    return normalizeChildren({ ...sanitized, citation_audit: citationAudit.audit });
  }
  const sanitized: ReviewUnitExecutionResult = { ...result };
  delete sanitized.citation_audit;
  return normalizeChildren({
    ...sanitized,
    ...(citationAudit.rejection
      ? { citation_audit_rejection: citationAudit.rejection }
      : {}),
  });
}

function allUnitExecutionResults(
  artifact: ReviewExecutionResultArtifact | null,
): ReviewUnitExecutionResult[] {
  if (!artifact) return [];
  const roots = [
    ...artifact.lens_execution_results,
    ...(artifact.issue_artifact_execution_results ?? []),
    ...(artifact.deliberation_execution_results ?? []),
    ...(artifact.synthesize_execution_result
      ? [artifact.synthesize_execution_result]
      : []),
  ];
  const flattened: ReviewUnitExecutionResult[] = [];
  const visit = (result: ReviewUnitExecutionResult): void => {
    flattened.push(result);
    // A recovered unit's child_results are audit-only attempt records (the
    // exhausted failure preserved by submit salvage), not constituent units:
    // they are neither continuation-preservation targets nor degradation
    // evidence, so the flatten stops at the recovered parent.
    if (result.recovery === "salvaged_submit") return;
    for (const child of result.child_results ?? []) {
      visit(child);
    }
  };
  for (const result of roots) visit(result);
  return flattened;
}

/**
 * Continuation preservation index: unit_id → prior result. Parents are
 * authoritative over same-id audit children (a fallback-completed unit
 * preserves its failed attempt in child_results under the same unit_id;
 * salvaged units' audit children are already excluded by the flatten);
 * allUnitExecutionResults visits parents before children, so first-wins keeps
 * the completed parent from being shadowed by its failed audit child.
 */
export function buildPreviousResultsByUnitId(
  artifact: ReviewExecutionResultArtifact | null,
): Map<string, ReviewUnitExecutionResult> {
  const byUnitId = new Map<string, ReviewUnitExecutionResult>();
  for (const result of allUnitExecutionResults(artifact)) {
    if (!byUnitId.has(result.unit_id)) byUnitId.set(result.unit_id, result);
  }
  return byUnitId;
}

export function outcomeFromPreviousResult(
  result: ReviewUnitExecutionResult,
): ExecutionOutcome {
  const startedAtMs = Date.parse(result.started_at);
  const completedAtMs = Date.parse(result.completed_at);
  return {
    dispatch: {
      unit_id: result.unit_id,
      unit_kind: result.unit_kind,
      packet_path: result.packet_path,
      output_path: result.output_path,
    },
    success: result.status === "completed",
    startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
    completedAtMs: Number.isFinite(completedAtMs) ? completedAtMs : Date.now(),
    ...(result.status === "failed"
      ? {
          failure: {
            unit_id: result.unit_id,
            unit_kind: result.unit_kind,
            packet_path: result.packet_path,
            output_path: result.output_path,
            message: result.failure_message ?? "Previous unit failed.",
            failure_kind: result.failure_kind ?? "unknown",
          },
        }
      : {}),
    ...(result.attempt_count !== undefined
      ? { attemptCount: result.attempt_count }
      : {}),
    // Preserved salvaged completions must keep their recovery marker, or a
    // continuation rewrite would re-count the audit failure as degradation
    // and drop the unit from the salvaged-unit reporting.
    ...(result.recovery !== undefined && result.recovery !== null
      ? { recovery: result.recovery }
      : {}),
    ...(result.packet_bytes !== undefined ? { packetBytes: result.packet_bytes } : {}),
    ...(result.output_bytes !== undefined ? { outputBytes: result.output_bytes } : {}),
    executorMetadata: {
      ...(result.input_tokens !== undefined && result.input_tokens !== null
        ? { input_tokens: result.input_tokens }
        : {}),
      ...(result.output_tokens !== undefined && result.output_tokens !== null
        ? { output_tokens: result.output_tokens }
        : {}),
      ...(result.tool_calls !== undefined && result.tool_calls !== null
        ? { tool_calls: result.tool_calls }
        : {}),
      ...(result.tool_iterations !== undefined && result.tool_iterations !== null
        ? { tool_iterations: result.tool_iterations }
        : {}),
      ...(result.executor_tool_mode !== undefined && result.executor_tool_mode !== null
        ? { tool_mode: result.executor_tool_mode }
        : {}),
      ...(result.native_admission !== undefined && result.native_admission !== null
        ? { native_admission: result.native_admission }
        : {}),
      ...(result.tool_boundary_skips !== undefined && result.tool_boundary_skips !== null
        ? { tool_boundary_skips: result.tool_boundary_skips }
        : {}),
      ...(result.citation_audit !== undefined && result.citation_audit !== null
        ? { citation_audit: result.citation_audit }
        : {}),
      ...(result.citation_audit_rejection !== undefined &&
      result.citation_audit_rejection !== null
        ? { citation_audit_rejection: result.citation_audit_rejection }
        : {}),
      ...(result.executor_host_runtime !== undefined &&
      result.executor_host_runtime !== null
        ? { host_runtime: result.executor_host_runtime }
        : {}),
      ...(result.model_id !== undefined && result.model_id !== null
        ? { model_id: result.model_id }
        : {}),
      ...(result.artifact_generation_realization !== undefined &&
      result.artifact_generation_realization !== null
        ? { artifact_generation_realization: result.artifact_generation_realization }
        : {}),
      ...(result.semantic_quality_evidence !== undefined &&
      result.semantic_quality_evidence !== null
        ? { semantic_quality_evidence: result.semantic_quality_evidence }
        : {}),
    },
    ...(result.artifact_generation_realization !== undefined &&
    result.artifact_generation_realization !== null
      ? { artifactGenerationRealization: result.artifact_generation_realization }
      : {}),
    ...(result.semantic_quality_evidence !== undefined &&
    result.semantic_quality_evidence !== null
      ? { semanticQualityEvidence: result.semantic_quality_evidence }
      : {}),
    ...(result.child_results !== undefined
      ? { childOutcomes: result.child_results.map(outcomeFromPreviousResult) }
      : {}),
    preservedResult: result,
  };
}

function deriveExecutionStatus(params: {
  synthesisExecuted: boolean;
  degradedLensIds: string[];
  degradedUnitCount?: number;
}): ReviewExecutionStatus {
  if (!params.synthesisExecuted) {
    return "halted_partial";
  }
  if (params.degradedLensIds.length > 0 || (params.degradedUnitCount ?? 0) > 0) {
    return "completed_with_degradation";
  }
  return "completed";
}

function failedChildOutcomeCount(outcome: ExecutionOutcome): number {
  // A recovered unit's childOutcomes are audit-only attempt records (the
  // exhausted failure preserved by submit salvage); the unit's content is a
  // full validator-passing completion, unlike fallback completions whose
  // failed children mark genuinely degraded sub-units.
  if (outcome.recovery !== undefined) return 0;
  return (outcome.childOutcomes ?? []).reduce(
    (total, child) =>
      total + (child.success ? 0 : 1) + failedChildOutcomeCount(child),
    0,
  );
}

async function readStructuredDeliberationStatus(
  executionPlan: ReviewExecutionPlan,
  synthesizeOutputPath: string,
): Promise<DeliberationStatus> {
  if (!(await fileExists(executionPlan.deliberation_output_path))) {
    throw new Error(
      `Missing controlled deliberation result: ${executionPlan.deliberation_output_path}`,
    );
  }
  const deliberationText = await fs.readFile(
    executionPlan.deliberation_output_path,
    "utf8",
  );
  if (deliberationText.trim().length === 0) {
    throw new Error(
      `Controlled deliberation result is empty: ${executionPlan.deliberation_output_path}`,
    );
  }
  const deliberationFrontmatter = parseMarkdownFrontmatter<{
    deliberation_status?: string;
  }>(deliberationText).metadata?.deliberation_status;
  if (deliberationFrontmatter !== "performed") {
    throw new Error(
      `Controlled deliberation result must declare deliberation_status: performed in ${executionPlan.deliberation_output_path}`,
    );
  }
  if (!(await fileExists(synthesizeOutputPath))) {
    throw new Error(`Missing synthesize output: ${synthesizeOutputPath}`);
  }
  const synthesizeText = await fs.readFile(synthesizeOutputPath, "utf8");
  const parsed = parseMarkdownFrontmatter<{ deliberation_status?: string }>(
    synthesizeText,
  );
  const frontmatterStatus = parsed.metadata?.deliberation_status;
  if (frontmatterStatus === "performed") return "performed";
  throw new Error(
    `Synthesize output must acknowledge controlled deliberation with deliberation_status: performed in ${synthesizeOutputPath}`,
  );
}

function degradationSummaryPathForSession(sessionRoot: string): string {
  return path.join(sessionRoot, "degradation-summary.yaml");
}

function inferFailureLensId(
  artifact: ReviewExecutionResultArtifact,
  result: ReviewUnitExecutionResult,
): string | null {
  if (result.unit_kind === "lens") return result.unit_id;
  if (artifact.halt_unit_id === result.unit_id) {
    return artifact.halt_lens_id ?? null;
  }
  if (
    result.unit_kind === "deliberation" &&
    result.unit_id.startsWith("deliberation-")
  ) {
    return result.unit_id.slice("deliberation-".length) || null;
  }
  return null;
}

function collectFailedUnits(
  artifact: ReviewExecutionResultArtifact,
): ReviewDegradationUnitFailure[] {
  const includeAttemptCount =
    artifact.retry_policy?.resubmit?.enabled === true;
  return allUnitExecutionResults(artifact)
    .filter((result) => result.status === "failed")
    .map((result) => ({
      unit_id: result.unit_id,
      unit_kind: result.unit_kind,
      lens_id: inferFailureLensId(artifact, result),
      packet_path: result.packet_path,
      output_path: result.output_path,
      failure_kind: result.failure_kind ?? null,
      failure_message: result.failure_message ?? "unknown failure",
      ...(includeAttemptCount && result.attempt_count !== undefined
        ? { attempt_count: result.attempt_count }
        : {}),
    }));
}

function degradationKindsFor(
  artifact: ReviewExecutionResultArtifact,
  failedUnits: ReviewDegradationUnitFailure[],
): ReviewDegradationKind[] {
  const kinds: ReviewDegradationKind[] = [];
  if (artifact.degraded_lens_ids.length > 0) kinds.push("lens_degradation");
  if (artifact.execution_status === "halted_partial") kinds.push("halted_partial");
  if (failedUnits.length > 0) kinds.push("unit_failure");
  return kinds;
}

async function writeDegradationSummaryArtifact(
  executionPlan: ReviewExecutionPlan,
  artifact: ReviewExecutionResultArtifact,
): Promise<void> {
  const summaryPath = degradationSummaryPathForSession(executionPlan.session_root);
  const failedUnits = collectFailedUnits(artifact);
  const degradationKinds = degradationKindsFor(artifact, failedUnits);
  if (degradationKinds.length === 0) {
    await removeFileIfExists(summaryPath);
    return;
  }
  const summary: ReviewDegradationSummaryArtifact = {
    schema_version: "1",
    session_id: artifact.session_id,
    created_at: artifact.execution_completed_at,
    source_execution_result_ref: executionPlan.execution_result_path,
    source_error_log_ref: (await fileExists(executionPlan.error_log_path))
      ? executionPlan.error_log_path
      : null,
    execution_status: artifact.execution_status,
    degradation_kinds: degradationKinds,
    degraded_lens_ids: artifact.degraded_lens_ids,
    excluded_lens_ids: artifact.excluded_lens_ids,
    halt_reason: artifact.halt_reason ?? null,
    halt_phase: artifact.halt_phase ?? null,
    halt_unit_id: artifact.halt_unit_id ?? null,
    halt_unit_kind: artifact.halt_unit_kind ?? null,
    halt_lens_id: artifact.halt_lens_id ?? null,
    failed_units: failedUnits,
  };
  await writeYamlDocument(summaryPath, summary);
}

function unitResultWithArtifactGenerationDefaults(
  result: ReviewUnitExecutionResult,
  defaults: {
    artifactGenerationRealization: ReviewArtifactGenerationRealization;
    semanticQualityEvidence: ReviewSemanticQualityEvidence;
  },
): ReviewUnitExecutionResult {
  const artifactGenerationRealization =
    result.artifact_generation_realization ??
    defaults.artifactGenerationRealization;
  const semanticQualityEvidence =
    result.semantic_quality_evidence ??
    semanticQualityEvidenceForArtifactGeneration(artifactGenerationRealization);
  const childResults = result.child_results?.map((child) =>
    unitResultWithArtifactGenerationDefaults(child, defaults)
  );
  return {
    ...result,
    artifact_generation_realization: artifactGenerationRealization,
    semantic_quality_evidence: semanticQualityEvidence,
    ...(childResults !== undefined
      ? {
          child_result_count: result.child_result_count ?? childResults.length,
          child_results: childResults,
        }
      : {}),
  };
}

async function writeExecutionResultArtifact(
  executionPlan: ReviewExecutionPlan,
  artifact: ReviewExecutionResultArtifactDraft,
  reviewExecutionProfile?: ReviewExecutionProfile | undefined,
): Promise<void> {
  const artifactGenerationRealization =
    artifact.artifact_generation_realization ??
    executionPlan.artifact_generation_realization;
  const semanticQualityEvidence =
    artifact.semantic_quality_evidence ??
    semanticQualityEvidenceForArtifactGeneration(artifactGenerationRealization);
  const unitDefaults = {
    artifactGenerationRealization,
    semanticQualityEvidence,
  };
  const artifactWithRetryPolicy: ReviewExecutionResultArtifact = {
    ...artifact,
    lens_execution_results: artifact.lens_execution_results.map((result) =>
      unitResultWithArtifactGenerationDefaults(result, unitDefaults)
    ),
    issue_artifact_execution_results:
      (artifact.issue_artifact_execution_results ?? []).map((result) =>
        unitResultWithArtifactGenerationDefaults(result, unitDefaults)
      ),
    deliberation_execution_results:
      (artifact.deliberation_execution_results ?? []).map((result) =>
        unitResultWithArtifactGenerationDefaults(result, unitDefaults)
      ),
    synthesize_execution_result: artifact.synthesize_execution_result
      ? unitResultWithArtifactGenerationDefaults(
          artifact.synthesize_execution_result,
          unitDefaults,
        )
      : null,
    artifact_generation_realization: artifactGenerationRealization,
    semantic_quality_evidence: semanticQualityEvidence,
    retry_policy:
      artifact.retry_policy ??
      reviewExecutionProfile?.retry ??
      defaultReviewRetrySettings(),
  };
  try {
    await writeYamlDocument(executionPlan.execution_result_path, artifactWithRetryPolicy);
    await writeDegradationSummaryArtifact(executionPlan, artifactWithRetryPolicy);
    await writeReviewRunManifest(
      executionPlan,
      artifactWithRetryPolicy,
      reviewExecutionProfile,
    );
  } catch (error) {
    await writeAndThrowStructuredFailureRecord({
      sessionRoot: executionPlan.session_root,
      phase: "execution.artifact_write",
      reasonCode: "review_execution_artifact_write_failed",
      humanMessage:
        "Runtime failed to write a required review execution artifact.",
      requiredUserAction:
        "Restore write access to the review session artifact path, then rerun the review.",
      retrySafety: "safe_after_environment_change",
      artifactTrust: "execution_artifacts_partial",
      dispatchState: "dispatched",
      artifactRefs: {
        execution_plan: path.join(executionPlan.session_root, "execution-plan.yaml"),
        execution_result: executionPlan.execution_result_path,
        degradation_summary: degradationSummaryPathForSession(
          executionPlan.session_root,
        ),
        review_run_manifest: path.join(
          executionPlan.session_root,
          "review-run-manifest.yaml",
        ),
      },
      mcpErrorCode: "ONTO_REVIEW_ARTIFACT_WRITE_FAILED",
      detailsKind: "artifact_write",
      details: {
        execution_result_path: executionPlan.execution_result_path,
        degradation_summary_path: degradationSummaryPathForSession(
          executionPlan.session_root,
        ),
        review_run_manifest_path: path.join(
          executionPlan.session_root,
          "review-run-manifest.yaml",
        ),
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function throwMalformedOutputFailure(args: {
  executionPlan: ReviewExecutionPlan;
  phase: string;
  unitId: string;
  unitKind: ReviewUnitKind;
  packetPath: string;
  outputPath: string;
  humanMessage: string;
  error: unknown;
}): Promise<never> {
  return writeAndThrowStructuredFailureRecord({
    sessionRoot: args.executionPlan.session_root,
    phase: args.phase,
    reasonCode: "review_unit_malformed_output",
    humanMessage: args.humanMessage,
    requiredUserAction:
      "Regenerate the review unit output with the current prompt contract.",
    retrySafety: "safe_after_input_change",
    artifactTrust: "execution_artifacts_partial",
    dispatchState: "dispatched",
    artifactRefs: {
      execution_plan: path.join(args.executionPlan.session_root, "execution-plan.yaml"),
      packet: args.packetPath,
      output: args.outputPath,
      error_log: args.executionPlan.error_log_path,
    },
    mcpErrorCode: "ONTO_REVIEW_MALFORMED_OUTPUT",
    detailsKind: "malformed_output",
    details: {
      unit_id: args.unitId,
      unit_kind: args.unitKind,
      packet_path: args.packetPath,
      output_path: args.outputPath,
      error_message:
        args.error instanceof Error ? args.error.message : String(args.error),
    },
  });
}

async function optionalFileDigest(filePath: string): Promise<string | null> {
  if (!(await fileExists(filePath))) return null;
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function consumerIdForLens(lensId: string): string {
  return `lens:${lensId}`;
}

function deriveContextAccessMatrix(
  contextSources: ReviewContextSource[],
): Record<string, string[]> {
  const matrix: Record<string, string[]> = {};
  for (const source of contextSources) {
    for (const consumerId of source.allowed_consumers) {
      matrix[consumerId] = [
        ...(matrix[consumerId] ?? []),
        source.context_source_id,
      ];
    }
  }
  return Object.fromEntries(
    Object.entries(matrix).map(([consumerId, sourceIds]) => [
      consumerId,
      [...new Set(sourceIds)].sort(),
    ]),
  );
}

function sortedJson(values: string[]): string {
  return JSON.stringify([...new Set(values)].sort());
}

async function throwManifestValidationFailure(args: {
  executionPlan: ReviewExecutionPlan;
  reasonCode: string;
  humanMessage: string;
  requiredUserAction: string;
  detailsKind:
    | "manifest_lifecycle"
    | "context_eligibility"
    | "schema_validation";
  details: Record<string, unknown>;
}): Promise<never> {
  return writeAndThrowStructuredFailureRecord({
    sessionRoot: args.executionPlan.session_root,
    phase: "packets_materialized.manifest_validation",
    reasonCode: args.reasonCode,
    humanMessage: args.humanMessage,
    requiredUserAction: args.requiredUserAction,
    retrySafety: "safe_after_input_change",
    artifactTrust: "manifest_artifacts_trusted",
    dispatchState: "dispatch_blocked",
    artifactRefs: {
      execution_plan: path.join(args.executionPlan.session_root, "execution-plan.yaml"),
      review_context_manifest:
        args.executionPlan.review_context_manifest_path ??
        path.join(
          args.executionPlan.session_root,
          "execution-preparation",
          "review-context-manifest.yaml",
        ),
    },
    mcpErrorCode: "ONTO_REVIEW_MANIFEST_VALIDATION_FAILED",
    detailsKind: args.detailsKind,
    details: args.details,
  });
}

function packetRefByPath(
  packetRefs: ReviewContextManifestPacketRef[],
): Map<string, ReviewContextManifestPacketRef> {
  return new Map(
    packetRefs.map((packetRef) => [path.resolve(packetRef.packet_ref), packetRef]),
  );
}

async function reviewContextManifestPath(
  executionPlan: ReviewExecutionPlan,
): Promise<string> {
  return (
    executionPlan.review_context_manifest_path ??
    path.join(
      executionPlan.session_root,
      "execution-preparation",
      "review-context-manifest.yaml",
    )
  );
}

async function readReviewContextManifest(
  executionPlan: ReviewExecutionPlan,
): Promise<{
  manifestPath: string;
  manifest: ReviewContextManifestArtifact;
}> {
  const manifestPath = await reviewContextManifestPath(executionPlan);
  return {
    manifestPath,
    manifest: await readYamlDocument<ReviewContextManifestArtifact>(manifestPath),
  };
}

async function validatePromptPacketRefForDispatch(args: {
  executionPlan: ReviewExecutionPlan;
  manifest: ReviewContextManifestArtifact;
  expectedMatrix: Record<string, string[]>;
  consumerId: string;
  packetPath: string;
}): Promise<void> {
  const refsByPath = packetRefByPath(args.manifest.packet_refs);
  const ref = refsByPath.get(path.resolve(args.packetPath));
  if (!ref) {
    await throwManifestValidationFailure({
      executionPlan: args.executionPlan,
      reasonCode: "packet_ref_missing",
      humanMessage: "A required prompt packet is absent from the manifest.",
      requiredUserAction: "Regenerate prompt packets before dispatch.",
      detailsKind: "manifest_lifecycle",
      details: {
        consumer_id: args.consumerId,
        packet_path: args.packetPath,
      },
    });
    return;
  }
  if (ref.consumer_id !== args.consumerId) {
    await throwManifestValidationFailure({
      executionPlan: args.executionPlan,
      reasonCode: "packet_consumer_mismatch",
      humanMessage: "A prompt packet is bound to an unexpected consumer.",
      requiredUserAction:
        "Regenerate actor/consumer bindings and prompt packets before dispatch.",
      detailsKind: "context_eligibility",
      details: {
        packet_path: args.packetPath,
        expected_consumer_id: args.consumerId,
        actual_consumer_id: ref.consumer_id,
      },
    });
  }
  const observedPacketHash = await optionalFileDigest(args.packetPath);
  if (ref.packet_sha256 !== observedPacketHash) {
    await throwManifestValidationFailure({
      executionPlan: args.executionPlan,
      reasonCode: "packet_hash_mismatch",
      humanMessage: "A prompt packet hash changed after manifest dispatch.",
      requiredUserAction:
        "Regenerate prompt packets or restart review preparation.",
      detailsKind: "manifest_lifecycle",
      details: {
        packet_path: args.packetPath,
        expected_sha256: ref.packet_sha256,
        observed_sha256: observedPacketHash,
      },
    });
  }
  const allowedContext = args.expectedMatrix[ref.consumer_id];
  if (!allowedContext) {
    await throwManifestValidationFailure({
      executionPlan: args.executionPlan,
      reasonCode: "packet_consumer_not_admitted",
      humanMessage:
        "A prompt packet consumer is not admitted by the review context manifest.",
      requiredUserAction:
        "Regenerate actor/consumer bindings and prompt packets before dispatch.",
      detailsKind: "context_eligibility",
      details: {
        consumer_id: ref.consumer_id,
        packet_path: ref.packet_ref,
      },
    });
    return;
  }
  const allContextIds = args.manifest.context_sources.map(
    (source) => source.context_source_id,
  );
  const expectedForbiddenContext = allContextIds.filter(
    (sourceId) => !allowedContext.includes(sourceId),
  );
  if (
    sortedJson(ref.consumed_context_refs) !== sortedJson(allowedContext) ||
    sortedJson(ref.forbidden_context_refs) !==
      sortedJson(expectedForbiddenContext)
  ) {
    await throwManifestValidationFailure({
      executionPlan: args.executionPlan,
      reasonCode: "packet_context_eligibility_mismatch",
      humanMessage:
        "Prompt packet context refs do not match manifest consumer eligibility.",
      requiredUserAction: "Regenerate prompt packets from the current manifest.",
      detailsKind: "context_eligibility",
      details: {
        consumer_id: ref.consumer_id,
        packet_path: ref.packet_ref,
        expected_consumed_context_refs: allowedContext,
        actual_consumed_context_refs: ref.consumed_context_refs,
        expected_forbidden_context_refs: expectedForbiddenContext,
        actual_forbidden_context_refs: ref.forbidden_context_refs,
      },
    });
  }
}

async function validateManifestPacketRefsForDispatch(args: {
  executionPlan: ReviewExecutionPlan;
  manifest: ReviewContextManifestArtifact;
  expectedMatrix: Record<string, string[]>;
}): Promise<void> {
  const allContextIds = args.manifest.context_sources.map(
    (source) => source.context_source_id,
  );
  for (const ref of args.manifest.packet_refs) {
    const allowedContext = args.expectedMatrix[ref.consumer_id];
    if (!allowedContext) {
      await throwManifestValidationFailure({
        executionPlan: args.executionPlan,
        reasonCode: "packet_consumer_not_admitted",
        humanMessage:
          "A prompt packet consumer is not admitted by the review context manifest.",
        requiredUserAction:
          "Regenerate actor/consumer bindings and prompt packets before dispatch.",
        detailsKind: "context_eligibility",
        details: {
          consumer_id: ref.consumer_id,
          packet_path: ref.packet_ref,
        },
      });
      return;
    }
    const observedPacketHash = await optionalFileDigest(ref.packet_ref);
    if (ref.packet_sha256 !== observedPacketHash) {
      await throwManifestValidationFailure({
        executionPlan: args.executionPlan,
        reasonCode: "packet_hash_mismatch",
        humanMessage: "A prompt packet hash changed after manifest dispatch.",
        requiredUserAction:
          "Regenerate prompt packets or restart review preparation.",
        detailsKind: "manifest_lifecycle",
        details: {
          packet_path: ref.packet_ref,
          expected_sha256: ref.packet_sha256,
          observed_sha256: observedPacketHash,
        },
      });
    }
    const expectedForbiddenContext = allContextIds.filter(
      (sourceId) => !allowedContext.includes(sourceId),
    );
    if (
      sortedJson(ref.consumed_context_refs) !== sortedJson(allowedContext) ||
      sortedJson(ref.forbidden_context_refs) !==
        sortedJson(expectedForbiddenContext)
    ) {
      await throwManifestValidationFailure({
        executionPlan: args.executionPlan,
        reasonCode: "packet_context_eligibility_mismatch",
        humanMessage:
          "Prompt packet context refs do not match manifest consumer eligibility.",
        requiredUserAction: "Regenerate prompt packets from the current manifest.",
        detailsKind: "context_eligibility",
        details: {
          consumer_id: ref.consumer_id,
          packet_path: ref.packet_ref,
          expected_consumed_context_refs: allowedContext,
          actual_consumed_context_refs: ref.consumed_context_refs,
          expected_forbidden_context_refs: expectedForbiddenContext,
          actual_forbidden_context_refs: ref.forbidden_context_refs,
        },
      });
    }
  }
}

const generatedPacketRefRegistrationQueues = new Map<string, Promise<void>>();

async function withGeneratedPacketRefRegistrationLock<T>(
  manifestPath: string,
  task: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(manifestPath);
  const previous = generatedPacketRefRegistrationQueues.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  generatedPacketRefRegistrationQueues.set(key, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (generatedPacketRefRegistrationQueues.get(key) === queued) {
      generatedPacketRefRegistrationQueues.delete(key);
    }
  }
}

async function registerGeneratedPromptPacketRefForDispatch(args: {
  executionPlan: ReviewExecutionPlan;
  consumerId: string;
  packetPath: string;
}): Promise<void> {
  const manifestPath = await reviewContextManifestPath(args.executionPlan);
  await withGeneratedPacketRefRegistrationLock(manifestPath, async () =>
    registerGeneratedPromptPacketRefForDispatchUnlocked(args),
  );
}

async function registerGeneratedPromptPacketRefForDispatchUnlocked(args: {
  executionPlan: ReviewExecutionPlan;
  consumerId: string;
  packetPath: string;
}): Promise<void> {
  const { manifestPath, manifest } = await readReviewContextManifest(
    args.executionPlan,
  );
  if (manifest.lifecycle_state !== "dispatched") {
    await throwManifestValidationFailure({
      executionPlan: args.executionPlan,
      reasonCode: "review_context_manifest_not_dispatched",
      humanMessage:
        "Review context manifest must be dispatched before generated packet registration.",
      requiredUserAction:
        "Regenerate prompt packets from a validated manifest before dispatch.",
      detailsKind: "manifest_lifecycle",
      details: {
        manifest_path: manifestPath,
        lifecycle_state: manifest.lifecycle_state,
      },
    });
  }
  const expectedMatrix = deriveContextAccessMatrix(manifest.context_sources);
  const allowedContext = expectedMatrix[args.consumerId];
  if (!allowedContext) {
    await throwManifestValidationFailure({
      executionPlan: args.executionPlan,
      reasonCode: "packet_consumer_not_admitted",
      humanMessage:
        "A generated prompt packet consumer is not admitted by the review context manifest.",
      requiredUserAction:
        "Regenerate actor/consumer bindings and prompt packets before dispatch.",
      detailsKind: "context_eligibility",
      details: {
        consumer_id: args.consumerId,
        packet_path: args.packetPath,
      },
    });
    return;
  }
  const packetSha256 = await optionalFileDigest(args.packetPath);
  if (!packetSha256) {
    await throwManifestValidationFailure({
      executionPlan: args.executionPlan,
      reasonCode: "generated_packet_missing",
      humanMessage: "A generated prompt packet is missing before dispatch.",
      requiredUserAction: "Regenerate the runtime prompt packet before dispatch.",
      detailsKind: "manifest_lifecycle",
      details: {
        consumer_id: args.consumerId,
        packet_path: args.packetPath,
      },
    });
    return;
  }
  const allContextIds = manifest.context_sources.map(
    (source) => source.context_source_id,
  );
  const packetRef: ReviewContextManifestPacketRef = {
    consumer_id: args.consumerId,
    packet_ref: args.packetPath,
    packet_sha256: packetSha256,
    consumed_context_refs: allowedContext,
    forbidden_context_refs: allContextIds.filter(
      (sourceId) => !allowedContext.includes(sourceId),
    ),
  };
  const packetPath = path.resolve(args.packetPath);
  const updatedManifest: ReviewContextManifestArtifact = {
    ...manifest,
    packet_refs: [
      ...manifest.packet_refs.filter(
        (ref) => path.resolve(ref.packet_ref) !== packetPath,
      ),
      packetRef,
    ],
    validation_results: [
      ...new Set([
        ...manifest.validation_results,
        `generated_packet_ref_registered:${args.consumerId}`,
      ]),
    ],
  };
  await writeYamlDocument(manifestPath, updatedManifest);
  await validatePromptPacketRefForDispatch({
    executionPlan: args.executionPlan,
    manifest: updatedManifest,
    expectedMatrix,
    consumerId: args.consumerId,
    packetPath: args.packetPath,
  });
}

async function pruneGeneratedPromptPacketRefs(
  executionPlan: ReviewExecutionPlan,
): Promise<void> {
  const { manifestPath, manifest } = await readReviewContextManifest(executionPlan);
  const staticPacketPaths = new Set(
    [
      ...executionPlan.lens_prompt_packet_seats.map((seat) => seat.packet_path),
    ].map((packetPath) => path.resolve(packetPath)),
  );
  const staticPacketRefs = manifest.packet_refs.filter((packetRef) =>
    staticPacketPaths.has(path.resolve(packetRef.packet_ref)),
  );
  if (staticPacketRefs.length === manifest.packet_refs.length) return;
  await writeYamlDocument(manifestPath, {
    ...manifest,
    packet_refs: staticPacketRefs,
    validation_results: [
      ...new Set([
        ...manifest.validation_results,
        "generated_packet_refs_pruned_for_new_execution",
      ]),
    ],
  });
}

async function ensureReviewContextManifestReadyForDispatch(
  executionPlan: ReviewExecutionPlan,
): Promise<void> {
  const manifestPath = await reviewContextManifestPath(executionPlan);
  if (!(await fileExists(manifestPath))) {
    await throwManifestValidationFailure({
      executionPlan,
      reasonCode: "review_context_manifest_missing",
      humanMessage: "Review context manifest is missing before lens dispatch.",
      requiredUserAction:
        "Run review preparation again so the manifest and prompt packet refs are materialized.",
      detailsKind: "manifest_lifecycle",
      details: { manifest_path: manifestPath },
    });
  }

  const manifest = await readYamlDocument<ReviewContextManifestArtifact>(
    manifestPath,
  );
  if (manifest.schema_version !== "1") {
    await throwManifestValidationFailure({
      executionPlan,
      reasonCode: "review_context_manifest_schema_unsupported",
      humanMessage: "Review context manifest schema version is unsupported.",
      requiredUserAction:
        "Regenerate the review context manifest with the current runtime.",
      detailsKind: "schema_validation",
      details: {
        manifest_path: manifestPath,
        expected_schema_version: "1",
        actual_schema_version: manifest.schema_version,
      },
    });
  }
  if (manifest.lifecycle_state !== "dispatched") {
    await throwManifestValidationFailure({
      executionPlan,
      reasonCode: "review_context_manifest_not_dispatched",
      humanMessage:
        "Review context manifest must be dispatched before lens execution.",
      requiredUserAction:
        "Regenerate prompt packets from a validated manifest before dispatch.",
      detailsKind: "manifest_lifecycle",
      details: {
        manifest_path: manifestPath,
        lifecycle_state: manifest.lifecycle_state,
      },
    });
  }

  const expectedMatrix = deriveContextAccessMatrix(manifest.context_sources);
  if (
    JSON.stringify(expectedMatrix) !==
    JSON.stringify(manifest.derived_context_access_matrix)
  ) {
    await throwManifestValidationFailure({
      executionPlan,
      reasonCode: "review_context_matrix_mismatch",
      humanMessage:
        "Review context manifest access matrix does not match allowed consumers.",
      requiredUserAction:
        "Regenerate the review context manifest from runtime-owned context sources.",
      detailsKind: "context_eligibility",
      details: {
        expected_matrix: expectedMatrix,
        actual_matrix: manifest.derived_context_access_matrix,
      },
    });
  }

  for (const source of manifest.context_sources) {
    const resolvedSourcePath = path.resolve(source.source_ref);
    if (source.required && !(await fileExists(resolvedSourcePath))) {
      await throwManifestValidationFailure({
        executionPlan,
        reasonCode: "required_context_source_missing",
        humanMessage: "A required review context source is missing.",
        requiredUserAction:
          "Restore the required artifact or restart review preparation.",
        detailsKind: "context_eligibility",
        details: {
          context_source_id: source.context_source_id,
          source_ref: source.source_ref,
        },
      });
    }
    const observedHash = await optionalFileDigest(resolvedSourcePath);
    if (source.source_sha256 !== observedHash) {
      await throwManifestValidationFailure({
        executionPlan,
        reasonCode: "context_source_hash_mismatch",
        humanMessage: "A review context source hash changed after manifest validation.",
        requiredUserAction:
          "Restart review preparation so context hashes and prompt packets match the target state.",
        detailsKind: "context_eligibility",
        details: {
          context_source_id: source.context_source_id,
          source_ref: source.source_ref,
          expected_sha256: source.source_sha256,
          observed_sha256: observedHash,
        },
      });
    }
  }

  await validateManifestPacketRefsForDispatch({
    executionPlan,
    manifest,
    expectedMatrix,
  });

  const requiredPackets = [
    ...executionPlan.lens_prompt_packet_seats.map((seat) => ({
      consumer_id: consumerIdForLens(seat.lens_id),
      packet_path: seat.packet_path,
    })),
  ];
  for (const requiredPacket of requiredPackets) {
    await validatePromptPacketRefForDispatch({
      executionPlan,
      manifest,
      expectedMatrix,
      consumerId: requiredPacket.consumer_id,
      packetPath: requiredPacket.packet_path,
    });
  }
}

async function unitManifestEntry(
  result: ReviewUnitExecutionResult,
): Promise<Record<string, unknown>> {
  const executionScope =
    result.unit_id === "synthesize" && result.unit_kind === "synthesize"
      ? "runtime_aggregate"
      : "worker";
  return {
    unit_id: result.unit_id,
    unit_kind: result.unit_kind,
    execution_scope: executionScope,
    packet_path: result.packet_path,
    packet_sha256: await optionalFileDigest(result.packet_path),
    output_path: result.output_path,
    output_sha256: await optionalFileDigest(result.output_path),
    status: result.status,
    started_at: result.started_at,
    completed_at: result.completed_at,
    duration_ms: result.duration_ms,
    timestamp_provenance: result.timestamp_provenance ?? "unknown",
    failure_message: result.failure_message ?? null,
    failure_kind: result.failure_kind ?? null,
    attempt_count: result.attempt_count ?? null,
    packet_bytes: result.packet_bytes ?? null,
    output_bytes: result.output_bytes ?? null,
    input_tokens: result.input_tokens ?? null,
    output_tokens: result.output_tokens ?? null,
    tool_calls: result.tool_calls ?? null,
    tool_iterations: result.tool_iterations ?? null,
    executor_tool_mode: result.executor_tool_mode ?? null,
    native_admission: result.native_admission ?? null,
    tool_boundary_skips: result.tool_boundary_skips ?? null,
    citation_audit: result.citation_audit ?? null,
    citation_audit_rejection: result.citation_audit_rejection ?? null,
    executor_host_runtime: result.executor_host_runtime ?? null,
    model_id: result.model_id ?? null,
    artifact_generation_realization:
      result.artifact_generation_realization ?? null,
    semantic_quality_evidence: result.semantic_quality_evidence ?? null,
    child_result_count: result.child_result_count ?? null,
    child_results: result.child_results ?? [],
  };
}

function flattenUnitResultsForRunManifest(
  results: ReviewUnitExecutionResult[],
): ReviewUnitExecutionResult[] {
  const flattened: ReviewUnitExecutionResult[] = [];
  for (const result of results) {
    flattened.push(result);
    if (result.child_results && result.child_results.length > 0) {
      flattened.push(...flattenUnitResultsForRunManifest(result.child_results));
    }
  }
  return flattened;
}

async function writeReviewRunManifest(
  executionPlan: ReviewExecutionPlan,
  artifact: ReviewExecutionResultArtifact,
  reviewExecutionProfile?: ReviewExecutionProfile | undefined,
): Promise<void> {
  const synthesizeResult = artifact.synthesize_execution_result ?? null;
  const manifestPath = path.join(executionPlan.session_root, "review-run-manifest.yaml");
  const unitResults = [
    ...artifact.lens_execution_results,
    ...(artifact.issue_artifact_execution_results ?? []),
    ...(artifact.deliberation_execution_results ?? []),
    ...(synthesizeResult ? [synthesizeResult] : []),
  ];
  const workerUnits = [];
  for (const result of flattenUnitResultsForRunManifest(unitResults)) {
    workerUnits.push(await unitManifestEntry(result));
  }
  const resumeToken = crypto
    .createHash("sha256")
    .update(
      [
        executionPlan.session_id,
        executionPlan.execution_result_path,
        artifact.execution_started_at,
      ].join("\n"),
    )
    .digest("hex");
  await writeYamlDocument(manifestPath, {
    schema_version: "1",
    session_id: executionPlan.session_id,
    created_at: artifact.execution_completed_at,
    execution_contract: {
      schema_version: "1",
      execution_step_ids: [...REVIEW_EXECUTION_STEP_IDS],
      progress_total_steps: REVIEW_PROGRESS_TOTAL_STEPS,
      resume_token: resumeToken,
      resume_token_ref: "review-run-manifest.execution_contract.resume_token",
      idempotency_scope: "session_id",
      idempotency_key: executionPlan.session_id,
      duplicate_dispatch_policy: "session_id_collision_blocks",
    },
    artifact_generation_realization: artifact.artifact_generation_realization,
    semantic_quality_evidence: artifact.semantic_quality_evidence,
    review_execution_profile: reviewExecutionProfile
      ? (() => {
          const route = buildReviewExecutionRoute(reviewExecutionProfile);
          return {
            mode: reviewExecutionProfile.mode,
            teamlead: reviewExecutionProfile.teamlead,
            lens: reviewExecutionProfile.lens,
            synthesize: reviewExecutionProfile.synthesize,
            deliberation: reviewExecutionProfile.deliberation,
            runtime_route: buildReviewRuntimeRouteArtifactProjection(route),
            model: reviewExecutionProfile.model ?? null,
            effort: reviewExecutionProfile.effort ?? null,
            service_tier: reviewExecutionProfile.service_tier ?? null,
            base_url: reviewExecutionProfile.base_url ?? null,
            retry: reviewExecutionProfile.retry ?? null,
            units: reviewExecutionProfile.units,
            trace: reviewExecutionProfile.trace,
          };
        })()
      : null,
    effective_retry_policy: artifact.retry_policy,
    artifact_refs: {
      session_metadata: executionPlan.session_metadata_path,
      interpretation: executionPlan.interpretation_artifact_path,
      binding: executionPlan.binding_output_path,
      execution_plan: path.join(executionPlan.session_root, "execution-plan.yaml"),
      execution_result: executionPlan.execution_result_path,
      degradation_summary:
        degradationKindsFor(artifact, collectFailedUnits(artifact)).length > 0
          ? degradationSummaryPathForSession(executionPlan.session_root)
          : null,
      actor_invocation_profiles: executionPlan.actor_invocation_profiles_path ?? null,
      actor_consumer_bindings: executionPlan.actor_consumer_bindings_path ?? null,
      domain_binding: executionPlan.domain_binding_path ?? null,
      review_target_profile: executionPlan.review_target_profile_path,
      review_value_alignment_criteria:
        executionPlan.review_value_alignment_criteria_path ?? null,
      review_context_manifest: executionPlan.review_context_manifest_path ?? null,
      lens_completion_barrier: executionPlan.lens_completion_barrier_path ?? null,
	      final_output: executionPlan.final_output_path,
	      review_record: executionPlan.review_record_path,
	      synthesis_work_items: synthesisWorkItemsPath(executionPlan.session_root),
	      synthesis_ledger: synthesisLedgerPath(executionPlan.session_root),
	      synthesis_output: executionPlan.synthesis_output_path,
	      deliberation_output: executionPlan.deliberation_output_path,
	      deliberation_resolution: deliberationResolutionPath(executionPlan.session_root),
      finding_ledger: executionPlan.finding_ledger_path,
      finding_relation_graph: executionPlan.finding_relation_graph_path,
      issue_ledger: executionPlan.issue_ledger_path,
      issue_stance_matrix: executionPlan.issue_stance_matrix_path,
      problem_framing: executionPlan.problem_framing_path,
    },
    worker_units: workerUnits,
    halt: artifact.halt_reason
      ? {
          phase: artifact.halt_phase ?? null,
          unit_id: artifact.halt_unit_id ?? null,
          unit_kind: artifact.halt_unit_kind ?? null,
          lens_id: artifact.halt_lens_id ?? null,
          reason: artifact.halt_reason,
        }
      : null,
	    synthesis_provenance: {
	      synthesis_executed: artifact.synthesis_executed,
	      synthesis_work_items_path: synthesisWorkItemsPath(executionPlan.session_root),
	      synthesis_work_items_sha256: await optionalFileDigest(
	        synthesisWorkItemsPath(executionPlan.session_root),
	      ),
	      synthesis_ledger_path: synthesisLedgerPath(executionPlan.session_root),
	      synthesis_ledger_sha256: await optionalFileDigest(
	        synthesisLedgerPath(executionPlan.session_root),
	      ),
	      synthesis_output_path: executionPlan.synthesis_output_path,
	      synthesis_output_sha256: await optionalFileDigest(executionPlan.synthesis_output_path),
      deliberation_status: artifact.deliberation_status ?? null,
      deliberation_output_path: executionPlan.deliberation_output_path,
      deliberation_output_sha256: await optionalFileDigest(executionPlan.deliberation_output_path),
      participating_lens_ids: artifact.participating_lens_ids,
      degraded_lens_ids: artifact.degraded_lens_ids,
      observed_dispatch_width:
        artifact.observed_dispatch_width ?? artifact.max_concurrent_lenses,
      lens_completion_barrier_ref: artifact.lens_completion_barrier_ref ?? null,
      issue_artifact_refs: Object.fromEntries(
        executionPlan.issue_artifact_prompt_packet_seats.map((seat) => [
          issueArtifactSpec(seat.artifact_id).ref_key,
          seat.output_path,
        ]),
      ),
    },
  });
}

async function resetExecutionOutputs(
  executionPlan: ReviewExecutionPlan,
): Promise<void> {
  const pathsToClear = [
    executionPlan.execution_result_path,
    // The run manifest describes the run being discarded; leaving it would
    // feed stale unit hashes to the frontier ledger on the rerun (fresh
    // seats vs old manifest hashes -> untrusted lens units -> the post-lens
    // router has nothing to route). It is rewritten at the final batch write.
    path.join(executionPlan.session_root, "review-run-manifest.yaml"),
    degradationSummaryPathForSession(executionPlan.session_root),
    executionPlan.error_log_path,
    executionPlan.synthesis_output_path,
    synthesisWorkItemsPath(executionPlan.session_root),
    synthesisLedgerPath(executionPlan.session_root),
    executionPlan.deliberation_output_path,
    deliberationResolutionPath(executionPlan.session_root),
    executionPlan.finding_ledger_path,
    executionPlan.finding_relation_graph_path,
    executionPlan.issue_ledger_path,
    executionPlan.issue_stance_matrix_path,
    executionPlan.deliberation_plan_path,
    executionPlan.problem_framing_path,
    executionPlan.final_output_path,
    executionPlan.lens_completion_barrier_path ??
      path.join(executionPlan.session_root, "lens-completion-barrier.yaml"),
    // 설계 B: 이전 run의 breaker end-state는 폐기되는 run의 기록이다 —
    // 남기면 fresh 재실행(특히 breaker OFF)이 낡은 트립/회복 집합을 주장한다.
    dispatchIncompleteArtifactPath(executionPlan.session_root),
    executionPlan.teamlead_deliberation_prompt_packet_path,
    ...executionPlan.lens_execution_seats.map((seat) => seat.output_path),
    ...executionPlan.lens_execution_seats
      .map((seat) => seat.sidecar_output_path)
      .filter((targetPath): targetPath is string => typeof targetPath === "string"),
    ...executionPlan.lens_execution_seats.map((seat) =>
      issueStanceResponsePath({
        executionPlan,
        lensId: seat.lens_id,
      }),
    ),
    ...executionPlan.lens_execution_seats.map((seat) =>
      issueStancePromptPacketPath({
        executionPlan,
        lensId: seat.lens_id,
      }),
    ),
    ...executionPlan.issue_artifact_prompt_packet_seats.map(
      (seat) => seat.packet_path,
    ),
    ...executionPlan.issue_artifact_prompt_packet_seats.map(
      (seat) => seat.output_path,
    ),
  ];

  await Promise.all(pathsToClear.map((targetPath) => removeFileIfExists(targetPath)));
  await Promise.all([
    fs.rm(path.join(executionPlan.deliberation_root_path, "responses"), {
      recursive: true,
      force: true,
    }),
    fs.rm(path.join(executionPlan.prompt_packets_root, "deliberation"), {
      recursive: true,
      force: true,
    }),
    fs.rm(path.join(executionPlan.session_root, "synthesis"), {
      recursive: true,
      force: true,
    }),
    fs.rm(path.join(executionPlan.prompt_packets_root, "synthesis"), {
      recursive: true,
      force: true,
    }),
  ]);
}

async function appendExecutionFailure(
  errorLogPath: string,
  failure: ExecutionFailure,
  effectiveBoundaryState?: EffectiveBoundaryState,
): Promise<void> {
  await appendMarkdownLogEntry(
    errorLogPath,
    `${failure.unit_kind} failure: ${failure.unit_id}`,
    [
      `unit_id: ${failure.unit_id}`,
      `unit_kind: ${failure.unit_kind}`,
      `packet_path: ${failure.packet_path}`,
      `output_path: ${failure.output_path}`,
      `failure_kind: ${failure.failure_kind}`,
      `message: ${failure.message}`,
      ...(effectiveBoundaryState
        ? [
            "",
            "[effective_boundary_state]",
            renderEffectiveBoundaryStateLog(effectiveBoundaryState),
          ]
        : []),
    ].join("\n"),
  );
}

async function runSingleDispatchWithRetries(args: {
  projectRoot: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  executorConfig: ReviewUnitExecutorConfig;
  dispatch: ExecutionDispatchResult;
  maxRetries: number;
  retryInitialDelayMs: number;
  unitTimeoutMs?: number;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
  /**
   * Explicit retry-budget override bypassing maxRetriesForDispatch — used
   * by the nested first-attempt path to spend the remaining budget after
   * the batch consumed one attempt (effective - 1).
   */
  maxRetriesOverride?: number;
}): Promise<ExecutionOutcome> {
  const {
    projectRoot,
    sessionRoot,
    executionPlan,
    executorConfig,
    dispatch,
    maxRetries,
    retryInitialDelayMs,
    unitTimeoutMs = DEFAULT_REVIEW_UNIT_TIMEOUT_MS,
    reviewExecutionProfile,
  } = args;
  console.log(`[review runner] starting ${dispatch.unit_kind}: ${dispatch.unit_id}`);
  await appendExecutionProgress(
    executionPlan.error_log_path,
    `runner dispatch started: ${dispatch.unit_id}`,
    [
      `unit_id: ${dispatch.unit_id}`,
      `unit_kind: ${dispatch.unit_kind}`,
      `packet_path: ${dispatch.packet_path}`,
      `output_path: ${dispatch.output_path}`,
    ],
  );

  const startedAtMs = Date.now();
  let lastError: unknown = undefined;
  let attemptsUsed = 0;
  const artifactGenerationRealization =
    reviewExecutionProfile?.artifact_generation_realization ??
    executionPlan.artifact_generation_realization;
  const semanticQualityEvidence = semanticQualityEvidenceForArtifactGeneration(
    artifactGenerationRealization,
  );
  const effectiveMaxRetries =
    args.maxRetriesOverride ??
    maxRetriesForDispatch({
      profile: reviewExecutionProfile,
      dispatch,
      fallback: maxRetries,
    });
  const effectiveRetryInitialDelayMs = retryInitialDelayMsForDispatch({
    profile: reviewExecutionProfile,
    dispatch,
    fallback: retryInitialDelayMs,
  });
  const effectiveUnitTimeoutMs = timeoutMsForDispatch({
    profile: reviewExecutionProfile,
    dispatch,
    fallback: unitTimeoutMs,
  });
  let resubmitApplied = false;
  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt += 1) {
    attemptsUsed = attempt + 1;
    if (attempt === 0) {
      // 설계 A: nested-batch 1차 시도 실패의 flat 폴백과 halted 세션 resume은
      // 이 루프 밖에서 실패해 frozen salvage input만 남는다 — 그 구조적
      // 근거가 있으면 첫 flat 시도 전에 오류 명세를 주입해 blind 재실행을
      // 막는다. (스위치 OFF·미지원 output_format·freeze 부재 시 no-op)
      resubmitApplied = (await applyResubmitErrorSpec({
        dispatch,
        error: null,
        attempt: 0,
        reviewExecutionProfile,
        errorLogPath: executionPlan.error_log_path,
        executionPlan,
      })) || resubmitApplied;
    }
    try {
      const executorMetadata = await invokeExecutor(
        executorConfig,
        projectRoot,
        sessionRoot,
        executionPlan,
        dispatch,
        retryTimeoutMs(effectiveUnitTimeoutMs, attempt),
        reviewExecutionProfile,
      );
      const completedAtMs = Date.now();
      console.log(`[review runner] completed ${dispatch.unit_kind}: ${dispatch.unit_id}`);
      await appendExecutionProgress(
        executionPlan.error_log_path,
        `runner dispatch completed: ${dispatch.unit_id}`,
        [
          `unit_id: ${dispatch.unit_id}`,
          `unit_kind: ${dispatch.unit_kind}`,
          `output_path: ${dispatch.output_path}`,
        ],
      );
      return {
        dispatch,
        success: true,
        startedAtMs,
        completedAtMs,
        attemptCount: attempt + 1,
        ...(resubmitApplied ? { resubmitApplied: true as const } : {}),
        ...(executorMetadata !== undefined ? { executorMetadata } : {}),
        artifactGenerationRealization:
          executorMetadata?.artifact_generation_realization ??
          artifactGenerationRealization,
        semanticQualityEvidence:
          executorMetadata?.semantic_quality_evidence ?? semanticQualityEvidence,
        packetBytes: await fileSizeIfPresent(dispatch.packet_path),
        outputBytes: await fileSizeIfPresent(dispatch.output_path),
      };
    } catch (error: unknown) {
      lastError = error;
      if (shouldRetryUnitFailure({ error, attempt, maxRetries: effectiveMaxRetries, dispatch, reviewExecutionProfile })) {
        const retryDelay = effectiveRetryInitialDelayMs * (attempt + 1);
        console.log(
          `[review runner] ${dispatch.unit_id} attempt ${attempt + 1} failed, retrying in ${retryDelay}ms...`,
        );
        await appendExecutionProgress(
          executionPlan.error_log_path,
          `runner dispatch retry: ${dispatch.unit_id}`,
          [
            `attempt: ${attempt + 1}/${effectiveMaxRetries}`,
            `retry_delay_ms: ${retryDelay}`,
            `error: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`,
          ],
        );
        resubmitApplied = (await applyResubmitErrorSpec({
          dispatch,
          error,
          attempt,
          reviewExecutionProfile,
          errorLogPath: executionPlan.error_log_path,
          executionPlan,
        })) || resubmitApplied;
        if (dispatch.unit_kind === "synthesize") {
          await appendExecutionProgress(
            executionPlan.error_log_path,
            `runner synthesize retry: ${dispatch.unit_id}`,
            [
              `attempt: ${attempt + 1}/${effectiveMaxRetries}`,
              `retry_delay_ms: ${retryDelay}`,
              `error: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`,
            ],
          );
        }
        await sleep(retryDelay);
      }
      if (!shouldRetryUnitFailure({ error, attempt, maxRetries: effectiveMaxRetries, dispatch, reviewExecutionProfile })) break;
    }
  }

  const completedAtMs = Date.now();
  const failure: ExecutionFailure = {
    unit_id: dispatch.unit_id,
    unit_kind: dispatch.unit_kind,
    packet_path: dispatch.packet_path,
    output_path: dispatch.output_path,
    message: lastError instanceof Error ? lastError.message : String(lastError),
    failure_kind: failureKindFromError(lastError),
  };

  // Opt-in submit salvage (design: submit-salvage-recovery-design.md): the
  // regular budget is exhausted — recover the frozen attempt's semantics via
  // the executor's salvage mode. The trigger is STRUCTURAL, not heuristic:
  // the freeze file exists iff the LAST attempt failed inside the structured
  // extract/validate/write block (executors clear stale freezes per attempt),
  // so message-classification gaps in failure_kind cannot suppress or
  // mis-fire salvage. The exhausted failure stays loudly recorded as a child
  // result; salvage failure falls through to the unchanged failure return.
  const salvageSettings = reviewExecutionProfile?.retry?.salvage;
  const salvageAdapter = reviewExecutionProfile?.worker_executor;
  if (
    salvageSettings?.enabled === true &&
    (salvageAdapter === "claude_code" || salvageAdapter === "codex") &&
    dispatch.output_format !== undefined &&
    dispatch.output_format !== "markdown"
  ) {
    const salvageInputPath = `${dispatch.output_path}.salvage-input.json`;
    if (await fileExists(salvageInputPath)) {
      try {
        const salvageStartedAtMs = Date.now();
        const executorMetadata = await invokeExecutor(
          executorConfig,
          projectRoot,
          sessionRoot,
          executionPlan,
          dispatch,
          retryTimeoutMs(effectiveUnitTimeoutMs, 0),
          reviewExecutionProfile,
          [
            "--salvage-from",
            salvageInputPath,
            // The transcription model runs on the unit's own adapter, so it
            // is forwarded only when its provider family matches (mismatch
            // falls back to the unit model inside the executor).
            ...(salvageSettings.transcription_llm?.model &&
            ((salvageAdapter === "claude_code" &&
              (salvageSettings.transcription_llm.provider ?? "anthropic") ===
                "anthropic") ||
              (salvageAdapter === "codex" &&
                salvageSettings.transcription_llm.provider === "openai"))
              ? ["--salvage-transcription-model", salvageSettings.transcription_llm.model]
              : []),
          ],
        );
        console.log(
          `[review runner] salvaged ${dispatch.unit_kind}: ${dispatch.unit_id} (submit salvage)`,
        );
        await appendExecutionProgress(
          executionPlan.error_log_path,
          `runner dispatch salvaged: ${dispatch.unit_id}`,
          [
            `unit_id: ${dispatch.unit_id}`,
            `recovery: salvaged_submit`,
            `exhausted_attempts: ${attemptsUsed}`,
          ],
        );
        const failedOutcome: ExecutionOutcome = {
          dispatch,
          success: false,
          startedAtMs,
          completedAtMs,
          attemptCount: attemptsUsed,
          failure,
          artifactGenerationRealization,
          semanticQualityEvidence,
        };
        return {
          dispatch,
          success: true,
          startedAtMs,
          completedAtMs: Date.now(),
          attemptCount: attemptsUsed + 1,
          recovery: "salvaged_submit",
          ...(resubmitApplied ? { resubmitApplied: true as const } : {}),
          childOutcomes: [failedOutcome],
          ...(executorMetadata !== undefined ? { executorMetadata } : {}),
          artifactGenerationRealization:
            executorMetadata?.artifact_generation_realization ??
            artifactGenerationRealization,
          semanticQualityEvidence:
            executorMetadata?.semantic_quality_evidence ?? semanticQualityEvidence,
          packetBytes: await fileSizeIfPresent(dispatch.packet_path),
          outputBytes: await fileSizeIfPresent(dispatch.output_path),
        };
      } catch (salvageError: unknown) {
        const salvageMessage =
          salvageError instanceof Error
            ? salvageError.message
            : String(salvageError);
        await appendExecutionProgress(
          executionPlan.error_log_path,
          `runner dispatch salvage failed: ${dispatch.unit_id}`,
          [`error: ${salvageMessage.slice(0, 200)}`],
        );
      }
    }
  }

  const packetBytes = await fileSizeIfPresent(dispatch.packet_path);
  const outputBytes = await fileSizeIfPresent(dispatch.output_path);
  await removeFileIfExists(dispatch.output_path);
  await appendExecutionFailure(
    executionPlan.error_log_path,
    failure,
    executionPlan.effective_boundary_state,
  );
  return {
    dispatch,
    success: false,
    startedAtMs,
    completedAtMs,
    attemptCount: attemptsUsed,
    ...(resubmitApplied ? { resubmitApplied: true as const } : {}),
    packetBytes,
    outputBytes,
    failure,
    artifactGenerationRealization,
    semanticQualityEvidence,
  };
}

/**
 * Brand for the downstream nested batch path — non-null only when the
 * profile selects nested-workers with an executor that has an outer
 * worker realization.
 */
function nestedStageBrandForProfile(
  profile: ReviewExecutionProfile | undefined,
): NestedBatchBrand | null {
  if (profile?.mode !== "nested-workers") return null;
  if (profile.worker_executor === "codex") return "codex";
  if (profile.worker_executor === "claude_code") return "claude";
  return null;
}

export interface NestedStageBatchAttempt {
  /** Batch outcome per unit id (only units that were in the batch). */
  byUnitId: Map<string, { ok: boolean; error?: string }>;
  startedAtMs: number;
  completedAtMs: number;
}

/**
 * Downstream wide-stage nested first attempt: hand the stage's dispatches
 * to ONE outer nesting batch worker (waves capped at the stage's flat
 * worker-pool width). Returns undefined when the gate does not apply —
 * not nested-workers, no outer brand, or fewer than two dispatches
 * (batching a single unit buys no fan-out, only an extra outer LLM).
 *
 * This is attempt #1 of the unit's retry budget; failed units fall back
 * to the flat per-unit retry loop via
 * {@link unitOutcomeWithNestedFirstAttempt}.
 */
export async function runNestedStageFirstAttempt(args: {
  stageLabel: string;
  projectRoot: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  executorConfig: ReviewUnitExecutorConfig;
  dispatches: ExecutionDispatchResult[];
  dispatchWidth: number;
  unitTimeoutMs?: number;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
  dispatchImpl?: typeof dispatchNestedBatch;
}): Promise<NestedStageBatchAttempt | undefined> {
  const profile = args.reviewExecutionProfile;
  const brand = nestedStageBrandForProfile(profile);
  if (!brand || args.dispatches.length < 2) return undefined;
  const firstDispatch = args.dispatches[0]!;
  // Same effective unit-executor config the flat loop would spawn for this
  // stage (all dispatches in one stage share a unit-settings id) — parity
  // by construction.
  const effectiveExecutorConfig = executorConfigWithUnitSettings({
    executorConfig: args.executorConfig,
    dispatch: firstDispatch,
    profile,
  });
  const effectiveUnitTimeoutMs = timeoutMsForDispatch({
    profile,
    dispatch: firstDispatch,
    fallback: args.unitTimeoutMs ?? DEFAULT_REVIEW_UNIT_TIMEOUT_MS,
  });
  const units = args.dispatches.map((dispatch) => ({
    unit_id: dispatch.unit_id,
    unit_kind: dispatch.unit_kind,
    packet_path: dispatch.packet_path,
    output_path: dispatch.output_path,
    extra_args: [
      ...(dispatch.output_format && dispatch.output_format !== "markdown"
        ? ["--output-format", dispatch.output_format]
        : []),
      ...(dispatch.human_output_ref
        ? ["--human-output-ref", dispatch.human_output_ref]
        : []),
      // Self-enforced per-unit timeout: the batch script has no per-unit
      // kill switch, so a hung inner must bound itself — otherwise it
      // holds its wave's barrier and burns the outer's multi-wave budget.
      "--timeout-ms",
      String(effectiveUnitTimeoutMs),
    ],
  }));
  const width = Math.max(1, Math.min(args.dispatchWidth, args.dispatches.length));
  // Outer timeout backstop covering every wave plus startup overhead; the
  // per-unit self-timeout above keeps a single hang from consuming it.
  const waveCount = Math.ceil(units.length / width);
  const timeoutMs = effectiveUnitTimeoutMs * waveCount + 60_000;

  console.log(
    `[review runner] nested batch (${args.stageLabel}): ${units.length} units, width=${width}, brand=${brand}`,
  );
  await appendExecutionProgress(
    args.executionPlan.error_log_path,
    `runner nested batch dispatch: ${args.stageLabel}`,
    [
      `unit_count: ${units.length}`,
      `dispatch_width: ${width}`,
      `brand: ${brand}`,
    ],
  );

  const startedAtMs = Date.now();
  const run = await (args.dispatchImpl ?? dispatchNestedBatch)({
    brand,
    sessionRoot: args.sessionRoot,
    projectRoot: args.projectRoot,
    outer_config: nestedOuterConfigFromLlmRef(brand, profile?.teamlead?.llm) ?? {},
    units,
    inner_executor: effectiveExecutorConfig,
    dispatch_width: width,
    timeout_ms: timeoutMs,
    stream_label: args.stageLabel,
  });
  const completedAtMs = Date.now();

  const byUnitId = new Map(
    run.outcomes.map((outcome) => [
      outcome.unit_id,
      {
        ok: outcome.status === "ok",
        ...(outcome.error ? { error: outcome.error } : {}),
      },
    ]),
  );
  const failedCount = run.outcomes.filter((o) => o.status !== "ok").length;
  await appendExecutionProgress(
    args.executionPlan.error_log_path,
    `runner nested batch finished: ${args.stageLabel}`,
    [
      `ok: ${run.outcomes.length - failedCount}/${run.outcomes.length}`,
      `summary_parsed: ${run.summary_parsed}`,
      `outer_exit_code: ${run.outer_exit_code}`,
    ],
  );
  return { byUnitId, startedAtMs, completedAtMs };
}

/**
 * Per-unit outcome combinator for the nested first-attempt path:
 *   - no batch / unit not in batch → flat dispatch with the full budget;
 *   - batch ok → success outcome (attempt #1, batch window timings);
 *   - batch fail + remaining budget → flat retries (effective - 1);
 *   - batch fail + zero budget → finalize the failure (no extra attempt —
 *     an explicit zero-retry policy means exactly one attempt).
 *
 * The two batch-window branches (batch ok, zero-budget fail) carry
 * `nestedBatchWindow: true` marking them as not directly observed. A breaker
 * skips a batch-window SUCCESS (completed, no streak reset) but still records a
 * batch-window FAILURE as a failure (see recordNestedUnitOutcomeToBreaker) —
 * the flat-retry branch is a real dispatch and stays untagged (§4-1).
 */
export async function unitOutcomeWithNestedFirstAttempt(args: {
  batch: NestedStageBatchAttempt | undefined;
  flat: Parameters<typeof runSingleDispatchWithRetries>[0];
  runFlat?: typeof runSingleDispatchWithRetries;
}): Promise<ExecutionOutcome> {
  const runFlat = args.runFlat ?? runSingleDispatchWithRetries;
  const batchOutcome = args.batch?.byUnitId.get(args.flat.dispatch.unit_id);
  if (!args.batch || !batchOutcome) {
    return runFlat(args.flat);
  }
  const { dispatch, executionPlan, reviewExecutionProfile } = args.flat;
  const artifactGenerationRealization =
    reviewExecutionProfile?.artifact_generation_realization ??
    executionPlan.artifact_generation_realization;
  const semanticQualityEvidence = semanticQualityEvidenceForArtifactGeneration(
    artifactGenerationRealization,
  );
  if (batchOutcome.ok) {
    console.log(
      `[review runner] completed ${dispatch.unit_kind}: ${dispatch.unit_id} (nested batch)`,
    );
    await appendExecutionProgress(
      executionPlan.error_log_path,
      `runner nested batch completed: ${dispatch.unit_id}`,
      [
        `unit_id: ${dispatch.unit_id}`,
        `unit_kind: ${dispatch.unit_kind}`,
        `output_path: ${dispatch.output_path}`,
      ],
    );
    return {
      dispatch,
      success: true,
      startedAtMs: args.batch.startedAtMs,
      completedAtMs: args.batch.completedAtMs,
      attemptCount: 1,
      nestedBatchWindow: true,
      artifactGenerationRealization,
      semanticQualityEvidence,
      packetBytes: await fileSizeIfPresent(dispatch.packet_path),
      outputBytes: await fileSizeIfPresent(dispatch.output_path),
    };
  }
  const effectiveMaxRetries = maxRetriesForDispatch({
    profile: reviewExecutionProfile,
    dispatch,
    fallback: args.flat.maxRetries,
  });
  if (effectiveMaxRetries >= 1) {
    // The batch consumed attempt #1 — spend the remaining budget flat.
    return runFlat({ ...args.flat, maxRetriesOverride: effectiveMaxRetries - 1 });
  }
  const message = batchOutcome.error ?? "nested batch unit failed";
  const failure: ExecutionFailure = {
    unit_id: dispatch.unit_id,
    unit_kind: dispatch.unit_kind,
    packet_path: dispatch.packet_path,
    output_path: dispatch.output_path,
    message,
    failure_kind: failureKindFromMessage(message),
  };
  const packetBytes = await fileSizeIfPresent(dispatch.packet_path);
  const outputBytes = await fileSizeIfPresent(dispatch.output_path);
  await removeFileIfExists(dispatch.output_path);
  await appendExecutionFailure(
    executionPlan.error_log_path,
    failure,
    executionPlan.effective_boundary_state,
  );
  return {
    dispatch,
    success: false,
    startedAtMs: args.batch.startedAtMs,
    completedAtMs: args.batch.completedAtMs,
    attemptCount: 1,
    nestedBatchWindow: true,
    packetBytes,
    outputBytes,
    failure,
    artifactGenerationRealization,
    semanticQualityEvidence,
  };
}

// ---------------------------------------------------------------------------
// Unit-execution layer (4f F2) — per-unit execution functions extracted from
// the stage worker closures. Each owns the full A semantics for ONE unit:
// dispatch (nested first-attempt + flat retry budget), stage validation, and
// unavailable-completion fallback. Stage sequencing still calls them from the
// existing worker pools; the frontier loop (F3) becomes their second caller
// with kind context derived from durable state instead of stage locals.
// ---------------------------------------------------------------------------

/** Shared per-unit execution inputs (stage- and frontier-agnostic). */
export interface RuntimeUnitExecutionContext {
  projectRoot: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  executorConfig: ReviewUnitExecutorConfig;
  retryPolicy: ReviewRuntimeRetryPolicy;
  unitTimeoutMs?: number | undefined;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
}

/**
 * Issue-stance unit: dispatch + on-disk stance validation. A validation
 * failure is terminal for the unit (flat semantics: no retry on stage
 * validation), recorded as an output-contract failure with the seat removed.
 */
export async function executeIssueStanceUnit(args: {
  ctx: RuntimeUnitExecutionContext;
  dispatch: ExecutionDispatchResult;
  participatingLensIds: string[];
  nestedBatch?: NestedStageBatchAttempt | undefined;
}): Promise<ExecutionOutcome> {
  const { ctx, dispatch } = args;
  const outcome = await unitOutcomeWithNestedFirstAttempt({
    batch: args.nestedBatch,
    flat: {
      projectRoot: ctx.projectRoot,
      sessionRoot: ctx.sessionRoot,
      executionPlan: ctx.executionPlan,
      executorConfig: ctx.executorConfig,
      dispatch,
      maxRetries: ctx.retryPolicy.issueArtifactMaxRetries,
      retryInitialDelayMs: ctx.retryPolicy.retryInitialDelayMs,
      ...(ctx.unitTimeoutMs !== undefined
        ? { unitTimeoutMs: ctx.unitTimeoutMs }
        : {}),
      reviewExecutionProfile: ctx.reviewExecutionProfile,
    },
  });
  if (!outcome.success) {
    return outcome;
  }
  const lensId = dispatch.unit_id.slice("issue-stance:".length);
  try {
    await validateIssueStanceResponseOnDisk({
      executionPlan: ctx.executionPlan,
      projectRoot: ctx.projectRoot,
      responsePath: dispatch.output_path,
      lensId,
      participatingLensIds: args.participatingLensIds,
    });
    return outcome;
  } catch (error) {
    const failure: ExecutionFailure = {
      unit_id: dispatch.unit_id,
      unit_kind: dispatch.unit_kind,
      packet_path: dispatch.packet_path,
      output_path: dispatch.output_path,
      message: error instanceof Error ? error.message : String(error),
      failure_kind: failureKindFromError(error),
    };
    await removeFileIfExists(dispatch.output_path);
    await appendExecutionFailure(
      ctx.executionPlan.error_log_path,
      failure,
      ctx.executionPlan.effective_boundary_state,
    );
    // §4-1: an on-disk validation failure is a directly-observed unit failure,
    // not a batch-window outcome — drop the nested-batch tag so the breaker
    // records it as a failure (dead-letter), consistent with the flat path.
    // (A batch-ok→validation-fail unit would otherwise spread
    // `nestedBatchWindow: true` and be mis-recorded as skipped/completed.)
    const { nestedBatchWindow: _batchWindow, ...observed } = outcome;
    return {
      ...observed,
      success: false as const,
      completedAtMs: Date.now(),
      outputBytes: await fileSizeIfPresent(dispatch.output_path),
      failure,
    };
  }
}

/**
 * Runtime fallback for an unavailable per-issue deliberation participant:
 * preserve the source stance and record an unavailable-participant response
 * at the unit's seat. Null when completion itself fails (caller keeps the
 * original failed outcome).
 */
export async function completeUnavailableDeliberationResponseUnit(args: {
  executionPlan: ReviewExecutionPlan;
  dispatch: ExecutionDispatchResult;
  workItem: IssueScopedDeliberationWorkItem;
  reason: string;
  failedOutcome?: ExecutionOutcome | undefined;
}): Promise<ExecutionOutcome | null> {
  const { executionPlan, dispatch, workItem, reason, failedOutcome } = args;
  try {
    const allowedEvidenceRefs = parseRuntimeIssueDeliberationSchemaContext(
      await fs.readFile(dispatch.packet_path, "utf8"),
    ).allowed_evidence_refs;
    const artifact = buildRuntimeIssueDeliberationUnavailableResponse({
      sessionId: executionPlan.session_id,
      workItem,
      reason,
      allowedEvidenceRefs,
    });
    await writeYamlDocument(dispatch.output_path, artifact);
    validateIssueDeliberationResponseObject({
      parsed: artifact,
      sessionId: executionPlan.session_id,
      issueId: workItem.issue_id,
      lensId: workItem.lens_id,
      allowedEvidenceRefs,
    });
    await appendExecutionProgress(
      executionPlan.error_log_path,
      "runner issue deliberation runtime completion",
      [
        `unit_id: ${dispatch.unit_id}`,
        `reason: ${reason.slice(0, 500)}`,
        "completion_rule: preserve source stance; record unavailable participant response",
      ],
    );
    return {
      dispatch,
      success: true,
      startedAtMs: failedOutcome?.startedAtMs ?? Date.now(),
      completedAtMs: Date.now(),
      attemptCount: failedOutcome?.attemptCount ?? 1,
      packetBytes:
        failedOutcome?.packetBytes ?? (await fileSizeIfPresent(dispatch.packet_path)),
      outputBytes: await fileSizeIfPresent(dispatch.output_path),
      ...(failedOutcome !== undefined ? { childOutcomes: [failedOutcome] } : {}),
      ...(failedOutcome?.artifactGenerationRealization !== undefined
        ? {
            artifactGenerationRealization:
              failedOutcome.artifactGenerationRealization,
          }
        : {}),
      ...(failedOutcome?.semanticQualityEvidence !== undefined
        ? { semanticQualityEvidence: failedOutcome.semanticQualityEvidence }
        : {}),
    };
  } catch (completionError) {
    await appendExecutionProgress(
      executionPlan.error_log_path,
      "runner issue deliberation runtime completion failed",
      [
        `unit_id: ${dispatch.unit_id}`,
        `reason: ${reason.slice(0, 500)}`,
        `completion_error: ${errorMessage(completionError).slice(0, 500)}`,
      ],
    );
    return null;
  }
}

/**
 * Per-issue deliberation unit: dispatch; an executor failure falls back to
 * the runtime unavailable-completion (degraded-but-progressing semantics).
 */
export async function executeDeliberationResponseUnit(args: {
  ctx: RuntimeUnitExecutionContext;
  dispatch: ExecutionDispatchResult;
  workItem: IssueScopedDeliberationWorkItem;
  nestedBatch?: NestedStageBatchAttempt | undefined;
}): Promise<ExecutionOutcome> {
  const { ctx, dispatch } = args;
  const outcome = await unitOutcomeWithNestedFirstAttempt({
    batch: args.nestedBatch,
    flat: {
      projectRoot: ctx.projectRoot,
      sessionRoot: ctx.sessionRoot,
      executionPlan: ctx.executionPlan,
      executorConfig: ctx.executorConfig,
      dispatch,
      maxRetries: ctx.retryPolicy.deliberationMaxRetries,
      retryInitialDelayMs: ctx.retryPolicy.retryInitialDelayMs,
      ...(ctx.unitTimeoutMs !== undefined
        ? { unitTimeoutMs: ctx.unitTimeoutMs }
        : {}),
      reviewExecutionProfile: ctx.reviewExecutionProfile,
    },
  });
  if (!outcome.success) {
    return (
      (await completeUnavailableDeliberationResponseUnit({
        executionPlan: ctx.executionPlan,
        dispatch,
        workItem: args.workItem,
        reason: outcome.failure?.message ?? "unknown executor failure",
        failedOutcome: outcome,
      })) ?? outcome
    );
  }
  return outcome;
}

/**
 * Runtime fallback for an unavailable per-issue synthesis worker: a
 * conservative projection from synthesis-work-items.yaml written at the
 * unit's seat. Null when completion itself fails.
 */
export async function completeUnavailableSynthesisResponseUnit(args: {
  executionPlan: ReviewExecutionPlan;
  dispatch: ExecutionDispatchResult;
  workItem: ReviewSynthesisWorkItem;
  sourceWorkItemsRef: string;
  reason: string;
  failedOutcome?: ExecutionOutcome | undefined;
}): Promise<{
  outcome: ExecutionOutcome;
  response: IssueSynthesisResponseArtifact;
} | null> {
  const { executionPlan, dispatch, workItem, reason, failedOutcome } = args;
  try {
    const response = buildRuntimeIssueSynthesisUnavailableResponse({
      sessionId: executionPlan.session_id,
      workItem,
      sourceWorkItemsRef: args.sourceWorkItemsRef,
      reason,
    });
    await writeYamlDocument(dispatch.output_path, response);
    await appendExecutionProgress(
      executionPlan.error_log_path,
      "runner issue synthesis runtime completion",
      [
        `unit_id: ${dispatch.unit_id}`,
        `reason: ${reason.slice(0, 500)}`,
        "completion_rule: conservative projection from synthesis-work-items.yaml",
      ],
    );
    return {
      outcome: {
        dispatch,
        success: true,
        startedAtMs: failedOutcome?.startedAtMs ?? Date.now(),
        completedAtMs: Date.now(),
        attemptCount: failedOutcome?.attemptCount ?? 1,
        packetBytes:
          failedOutcome?.packetBytes ??
          (await fileSizeIfPresent(dispatch.packet_path)),
        outputBytes: await fileSizeIfPresent(dispatch.output_path),
        ...(failedOutcome !== undefined ? { childOutcomes: [failedOutcome] } : {}),
        ...(failedOutcome?.artifactGenerationRealization !== undefined
          ? {
              artifactGenerationRealization:
                failedOutcome.artifactGenerationRealization,
            }
          : {}),
        ...(failedOutcome?.semanticQualityEvidence !== undefined
          ? { semanticQualityEvidence: failedOutcome.semanticQualityEvidence }
          : {}),
      },
      response,
    };
  } catch (completionError) {
    await appendExecutionProgress(
      executionPlan.error_log_path,
      "runner issue synthesis runtime completion failed",
      [
        `unit_id: ${dispatch.unit_id}`,
        `reason: ${reason.slice(0, 500)}`,
        `completion_error: ${errorMessage(completionError).slice(0, 500)}`,
      ],
    );
    return null;
  }
}

/**
 * Per-issue synthesis unit: dispatch + on-disk response validation; both
 * executor failure and validation failure fall back to the runtime
 * unavailable-completion. `response` is null only when the unit terminally
 * failed (no fallback possible).
 */
export async function executeSynthesisResponseUnit(args: {
  ctx: RuntimeUnitExecutionContext;
  dispatch: ExecutionDispatchResult;
  workItem: ReviewSynthesisWorkItem;
  sourceWorkItemsRef: string;
  nestedBatch?: NestedStageBatchAttempt | undefined;
}): Promise<{
  outcome: ExecutionOutcome;
  response: IssueSynthesisResponseArtifact | null;
}> {
  const { ctx, dispatch } = args;
  const outcome = await unitOutcomeWithNestedFirstAttempt({
    batch: args.nestedBatch,
    flat: {
      projectRoot: ctx.projectRoot,
      sessionRoot: ctx.sessionRoot,
      executionPlan: ctx.executionPlan,
      executorConfig: ctx.executorConfig,
      dispatch,
      maxRetries: ctx.retryPolicy.synthesisMaxRetries,
      retryInitialDelayMs: ctx.retryPolicy.retryInitialDelayMs,
      ...(ctx.unitTimeoutMs !== undefined
        ? { unitTimeoutMs: ctx.unitTimeoutMs }
        : {}),
      reviewExecutionProfile: ctx.reviewExecutionProfile,
    },
  });
  if (!outcome.success) {
    const completed = await completeUnavailableSynthesisResponseUnit({
      executionPlan: ctx.executionPlan,
      dispatch,
      workItem: args.workItem,
      sourceWorkItemsRef: args.sourceWorkItemsRef,
      reason: outcome.failure?.message ?? "unknown synthesis worker failure",
      failedOutcome: outcome,
    });
    return completed ?? { outcome, response: null };
  }
  try {
    const response = await validateIssueSynthesisResponseOnDisk({
      responsePath: dispatch.output_path,
      sessionId: ctx.executionPlan.session_id,
      workItem: args.workItem,
      sourceWorkItemsRef: args.sourceWorkItemsRef,
    });
    return { outcome, response };
  } catch (error) {
    const failedOutcome = await synthesisValidationFailureOutcome({
      executionPlan: ctx.executionPlan,
      dispatch,
      priorOutcome: outcome,
      error,
    });
    const completed = await completeUnavailableSynthesisResponseUnit({
      executionPlan: ctx.executionPlan,
      dispatch,
      workItem: args.workItem,
      sourceWorkItemsRef: args.sourceWorkItemsRef,
      reason: errorMessage(error),
      failedOutcome,
    });
    return completed ?? { outcome: failedOutcome, response: null };
  }
}

// ---------------------------------------------------------------------------
// 4f F3 — frontier plumbing for the A loop. The shared ledger/frontier
// (review-execution-steps) needs engine-shaped execution-result entries on
// disk to advance; these helpers seed/merge them mid-run. They are ledger
// bookkeeping ONLY: every halt/final path still batch-writes A's enriched
// artifact via writeExecutionResultArtifact, overwriting the mid-run state.
// ---------------------------------------------------------------------------

/**
 * Merge one A outcome into the on-disk execution-result in engine shape so
 * the frontier can trust/advance past it. Successful seats go through the
 * same seat-level gate B uses (validateUnitSeatToResult — hashes included,
 * which ledger trust requires); failures merge as failed results.
 */
async function mergeOutcomeIntoFrontierLedger(args: {
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  outcome: ExecutionOutcome;
  base?: ReviewExecutionResultArtifact | undefined;
}): Promise<void> {
  const { dispatch } = args.outcome;
  if (args.outcome.success) {
    const unit: ReviewContinuationUnit = {
      unitId: dispatch.unit_id,
      unitKind: dispatch.unit_kind as ReviewContinuationUnit["unitKind"],
      ...(dispatch.unit_kind === "lens" ? { lensId: dispatch.unit_id } : {}),
      packetPath: dispatch.packet_path,
      outputPath: dispatch.output_path,
      priorStatus: "missing",
      dispatchDecision: "run",
      reason: "runtime loop seed (4f): merge an executed unit into the frontier ledger",
      owner: "host_llm",
    };
    const result = await validateUnitSeatToResult({
      sessionRoot: args.sessionRoot,
      unit,
      executionPlan: args.executionPlan,
    });
    await mergeUnitResultIntoExecutionResult({
      sessionRoot: args.sessionRoot,
      result,
      ...(args.base ? { base: args.base } : {}),
    });
    return;
  }
  await mergeUnitResultIntoExecutionResult({
    sessionRoot: args.sessionRoot,
    result: toUnitExecutionResult(args.outcome),
    ...(args.base ? { base: args.base } : {}),
  });
}

/**
 * Seed the lens stage into the frontier ledger after the (still inline) lens
 * phase, so the post-lens loop starts from a frontier that trusts the lenses
 * the barrier already admitted.
 */
async function seedLensResultsForFrontier(args: {
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  outcomes: ExecutionOutcome[];
}): Promise<void> {
  let base: ReviewExecutionResultArtifact | undefined =
    buildInitialExecutionResultScaffold(args.executionPlan);
  for (const outcome of args.outcomes) {
    await mergeOutcomeIntoFrontierLedger({
      sessionRoot: args.sessionRoot,
      executionPlan: args.executionPlan,
      outcome,
      ...(base ? { base } : {}),
    });
    base = undefined;
  }
}

type PostLensFrontierRoute =
  | { kind: "issue_artifact"; artifactId: ReviewIssueArtifactId }
  | { kind: "deliberation" }
  | { kind: "problem_framing" }
  | { kind: "synthesize" };

/**
 * Canonical stage routing for ready frontier units. Order mirrors the
 * retired sequential path (PRE_DELIBERATION ids → deliberation →
 * problem-framing → synthesize); the per-lens stance maps and per-issue
 * synthesis maps route to their collection stages.
 */
function pickPostLensFrontierRoute(
  ready: ReviewContinuationUnit[],
): PostLensFrontierRoute | null {
  const ids = new Set(ready.map((unit) => unit.unitId));
  for (const artifactId of PRE_DELIBERATION_ISSUE_ARTIFACT_IDS) {
    if (artifactId === "issue-stance-matrix") {
      if (
        ids.has("issue-stance-matrix") ||
        ready.some((unit) => unit.unitId.startsWith("issue-stance:"))
      ) {
        return { kind: "issue_artifact", artifactId };
      }
      continue;
    }
    if (ids.has(artifactId)) return { kind: "issue_artifact", artifactId };
  }
  if (ready.some((unit) => unit.unitKind === "deliberation")) {
    return { kind: "deliberation" };
  }
  if (ids.has("problem-framing")) return { kind: "problem_framing" };
  if (
    ids.has("synthesize") ||
    ready.some((unit) => unit.unitId.startsWith("synthesis:"))
  ) {
    return { kind: "synthesize" };
  }
  return null;
}

function issueArtifactProgress(artifactId: ReviewIssueArtifactId): {
  step: number;
  label: string;
} {
  const spec = issueArtifactSpec(artifactId);
  return { step: spec.progress_step, label: spec.progress_label };
}

function issueArtifactOutputPath(
  executionPlan: ReviewExecutionPlan,
  artifactId: ReviewIssueArtifactId,
): string {
  switch (artifactId) {
    case "finding-ledger":
      return executionPlan.finding_ledger_path;
    case "finding-relation-graph":
      return executionPlan.finding_relation_graph_path;
    case "issue-ledger":
      return executionPlan.issue_ledger_path;
    case "issue-stance-matrix":
      return executionPlan.issue_stance_matrix_path;
    case "deliberation-plan":
      return executionPlan.deliberation_plan_path;
    case "problem-framing":
      return executionPlan.problem_framing_path;
  }
}

async function runIssueStanceMatrixCollectionDispatch(args: {
  projectRoot: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  executorConfig: ReviewUnitExecutorConfig;
  lensOutputPaths: string[];
  unitTimeoutMs: number;
  retryPolicy: ReviewRuntimeRetryPolicy;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
  /** Continuation per-unit gate (deliberation/synthesis 스테이지와 동일
   * 패턴): 제공되면 run-owing 유닛만 디스패치하고, 나머지는 완료된 prior
   * result에서 preserved outcome을 복원한다 — 트립/halt 회복이 이미 지불한
   * 완료 유닛을 재디스패치하지 않게 한다 (규칙 5). */
  runUnitIds?: Set<string> | undefined;
  preservedResultsByUnitId?: Map<string, ReviewUnitExecutionResult> | undefined;
}): Promise<ExecutionOutcome> {
  const participatingLensIds = args.lensOutputPaths.map(lensIdFromRound1ArtifactPath);
  const startedAtMs = Date.now();
  const seat = args.executionPlan.issue_artifact_prompt_packet_seats.find(
    (candidate) => candidate.artifact_id === "issue-stance-matrix",
  );
  if (!seat) {
    throw new Error("Missing issue artifact prompt seat: issue-stance-matrix");
  }
  const findingLedger = await readYamlDocument<Record<string, unknown>>(
    args.executionPlan.finding_ledger_path,
  );
  const relationGraph = await readYamlDocument<Record<string, unknown>>(
    args.executionPlan.finding_relation_graph_path,
  );
  const issueLedger = await readYamlDocument<Record<string, unknown>>(
    args.executionPlan.issue_ledger_path,
  );
  const projectionSection = renderIssueStanceInputProjectionSection(
    buildIssueStanceInputProjection({
      projectRoot: args.projectRoot,
      findingLedgerPath: args.executionPlan.finding_ledger_path,
      findingRelationGraphPath: args.executionPlan.finding_relation_graph_path,
      issueLedgerPath: args.executionPlan.issue_ledger_path,
      findingLedger,
      relationGraph,
      issueLedger,
      lensOutputPaths: args.lensOutputPaths,
    }),
  );
  const responsePathsByLensId = new Map<string, string>();
  const dispatches = participatingLensIds.map((lensId): ExecutionDispatchResult => {
    const outputPath = issueStanceResponsePath({
      executionPlan: args.executionPlan,
      lensId,
    });
    responsePathsByLensId.set(lensId, outputPath);
    return {
      unit_id: issueStanceConsumerId(lensId),
      unit_kind: "issue_artifact",
      packet_path: issueStancePromptPacketPath({
        executionPlan: args.executionPlan,
        lensId,
      }),
      output_path: outputPath,
      output_format: "issue-stance-response",
    };
  });
  const maxConcurrentIssueStanceResponses = maxConcurrentLensesForProfile({
    profile: args.reviewExecutionProfile,
    plannedLensCount: dispatches.length,
  });
  await emitReviewProgress({
    executionPlan: args.executionPlan,
    step: issueArtifactProgress("issue-stance-matrix").step,
    label: "issue stance responses",
    details: [
      `participating_lens_count=${participatingLensIds.length}`,
      `max_concurrent=${maxConcurrentIssueStanceResponses}`,
    ],
  });
  await appendExecutionProgress(
    args.executionPlan.error_log_path,
    "runner issue stance response dispatch policy",
    [`max_concurrent_issue_stance_responses: ${maxConcurrentIssueStanceResponses}`],
  );
  await Promise.all(
    dispatches.map(async (dispatch) => {
      const lensId = dispatch.unit_id.slice("issue-stance:".length);
      await fs.mkdir(path.dirname(dispatch.packet_path), { recursive: true });
      await fs.writeFile(
        dispatch.packet_path,
        `${buildIssueStanceResponsePrompt({
          sessionId: args.executionPlan.session_id,
          projectRoot: args.projectRoot,
          executionPlan: args.executionPlan,
          lensId,
          outputPath: dispatch.output_path,
          lensOutputPaths: args.lensOutputPaths,
          issueStanceInputProjection: projectionSection,
        }).trimEnd()}\n`,
        "utf8",
      );
      await registerGeneratedPromptPacketRefForDispatch({
        executionPlan: args.executionPlan,
        consumerId: issueStanceConsumerId(lensId),
        packetPath: dispatch.packet_path,
      });
    }),
  );

  // Continuation per-unit gate: run-owing 유닛만 디스패치 대상이다.
  // preserved 유닛은 완료된 prior result에서 outcome을 복원한다 (아래 워커).
  const owesStanceRun = (unitId: string): boolean =>
    args.runUnitIds === undefined || args.runUnitIds.has(unitId);
  const runOwingDispatches = dispatches.filter((dispatch) =>
    owesStanceRun(dispatch.unit_id),
  );

  // nested-workers: attempt #1 for the whole stage goes through ONE outer
  // nesting batch worker (waves capped at the flat pool width); failed
  // units fall back to the flat per-unit retry loop below. preserved 유닛은
  // 배치에 넣지 않는다 — 디스패치를 빚지지 않은 유닛이다.
  const stanceNestedBatch = await runNestedStageFirstAttempt({
    stageLabel: "issue-stance",
    projectRoot: args.projectRoot,
    sessionRoot: args.sessionRoot,
    executionPlan: args.executionPlan,
    executorConfig: args.executorConfig,
    dispatches: runOwingDispatches,
    dispatchWidth: maxConcurrentIssueStanceResponses,
    unitTimeoutMs: args.unitTimeoutMs,
    reviewExecutionProfile: args.reviewExecutionProfile,
  });

  const outcomes: Array<ExecutionOutcome | undefined> = new Array(dispatches.length);
  let nextDispatchIndex = 0;
  // 설계 B + §4-1: stance 풀 breaker — 유닛의 최종 outcome(per-unit bounded
  // retry 소진 후)을 관찰 단위로 기록한다. nested 1차 배치가 실행돼도 생성한다:
  // 배치-창 SUCCESS는 실 디스패치가 아니므로 recordItemSkipped로 완료만 집계해
  // 과거 배치 창의 생존 증거가 현재 계통 실패 streak을 오리셋하지 못하게 하고
  // (#166 결함 클래스 재유입 차단), 배치-창 FAILURE는 flat 경로처럼 실패로 기록
  // 한다(item-local→dead-letter, 계통→회복 victim). 배치-실패 유닛이 flat 재시도
  // 예산을 쓰면 그 실 관측이 streak을 구동한다.
  const breakerState = reviewDispatchBreakerFromProfile(
    args.reviewExecutionProfile,
    {
      concurrent:
        Math.min(maxConcurrentIssueStanceResponses, runOwingDispatches.length) > 1,
    },
  );
  let breakerTripOutcome: ExecutionOutcome | null = null;
  async function runIssueStanceWorker(): Promise<void> {
    while (true) {
      const dispatchIndex = nextDispatchIndex;
      nextDispatchIndex += 1;
      if (dispatchIndex >= dispatches.length) return;
      const dispatch = dispatches[dispatchIndex]!;
      if (!owesStanceRun(dispatch.unit_id)) {
        // preserved/continuation 유닛: 디스패치 없이 완료 증거를 복원한다.
        // breaker에는 기록하지 않는다 — planned 집합 자체가 run-owing
        // 유닛으로 계산된다 (lens 풀과 동일 규약). 트립 여부와 무관하게
        // 기록해야 완료 증거가 결과 아티팩트에서 유실되지 않는다.
        const prior = args.preservedResultsByUnitId?.get(dispatch.unit_id);
        if (!prior || prior.status !== "completed") {
          throw new Error(
            `Cannot preserve continuation unit without a completed prior result: ${dispatch.unit_id}`,
          );
        }
        outcomes[dispatchIndex] = outcomeFromPreviousResult(prior);
        continue;
      }
      // 트립 이후엔 새 flat 디스패치를 빚지는 유닛만 건너뛴다 — 그런 유닛은
      // 미디스패치로 incomplete 집합에 남아 회복 재디스패치 대상이 된다(규칙 5).
      // 배치-성공(디스패치 안 빚음)과 zero-retry 배치-실패(예산 소진 → 새 flat
      // 디스패치 없음)는 트립 후에도 처리해 recordNested…로 기록·분류한다:
      // 미기록 시 incomplete로 오집계되고, item-local 배치-실패는 dead-letter
      // 여야 하는데 스킵하면 incomplete로 오분류된다(교차검증 — lens 풀과 대칭,
      // 계약의 nested 균일 규칙 준수). return이 아닌 continue: 뒤 인덱스
      // preserved 복원도 마저 소진.
      if (breakerState?.tripped()) {
        const batchOutcome = stanceNestedBatch?.byUnitId.get(dispatch.unit_id);
        const owesNewDispatch =
          batchOutcome?.ok !== true &&
          (batchOutcome === undefined ||
            maxRetriesForDispatch({
              profile: args.reviewExecutionProfile,
              dispatch,
              fallback: args.retryPolicy.issueArtifactMaxRetries,
            }) >= 1);
        if (owesNewDispatch) continue;
      }
      const outcome = await executeIssueStanceUnit({
        ctx: {
          projectRoot: args.projectRoot,
          sessionRoot: args.sessionRoot,
          executionPlan: args.executionPlan,
          executorConfig: args.executorConfig,
          retryPolicy: args.retryPolicy,
          unitTimeoutMs: args.unitTimeoutMs,
          reviewExecutionProfile: args.reviewExecutionProfile,
        },
        dispatch,
        participatingLensIds,
        nestedBatch: stanceNestedBatch,
      });
      outcomes[dispatchIndex] = outcome;
      if (breakerState) {
        // §4-1: 배치-창 결과는 skipped(완료만, 계통 streak 불변), 실 flat
        // 디스패치는 성공/실패로 반영한다. 첫 임계 도달이 트립 권위 — halt
        // 귀속을 그 유닛의 outcome으로 고정한다.
        const trip = recordNestedUnitOutcomeToBreaker(breakerState, outcome);
        if (trip !== null) breakerTripOutcome = outcome;
      }
    }
  }
  await Promise.all(
    Array.from(
      {
        length: Math.min(maxConcurrentIssueStanceResponses, dispatches.length),
      },
      async () => runIssueStanceWorker(),
    ),
  );
  const completedOutcomes = outcomes.filter(
    (outcome): outcome is ExecutionOutcome => outcome !== undefined,
  );
  const failedOutcomes = completedOutcomes.filter((outcome) => !outcome.success);
  const resubmitEnabled =
    args.reviewExecutionProfile?.retry?.resubmit?.enabled === true;
  const stanceDispatchError = (
    outcome: ExecutionOutcome,
    haltReason: string | null = null,
    batchOutcomes: ExecutionOutcome[] = [],
  ): ReviewIssueArtifactDispatchError => {
    const message = outcome.failure?.message ?? "unknown error";
    return new ReviewIssueArtifactDispatchError(
      `Issue stance response failed: ${message}`,
      outcome,
      message,
      haltReason,
      batchOutcomes,
    );
  };
  if (breakerState) {
    // 규칙 6: 트립이든 완주든 배치 end-state를 영속 — 회복 절차가 항상
    // 정확한 재디스패치 집합을 갖는다. 트립이 아니어도 아래의 기존
    // 강등/halt 규칙은 그대로 진행된다 (breaker는 구제하지 않는다).
    const incompleteArtifactPath = await persistReviewDispatchIncompleteArtifact({
      sessionRoot: args.sessionRoot,
      batchLabel: "issue-stance",
      // planned = 이번 run이 실제 디스패치를 빚진 유닛 집합 (preserved 제외).
      plannedItemIds: runOwingDispatches.map((dispatch) => dispatch.unit_id),
      state: breakerState,
    });
    const trip = breakerState.tripped();
    if (trip) {
      // 규칙 4: 계통 실패 임계 도달 — 배치 halt + 사용자 공지(halt_reason에
      // 미완료 목록 경로 포함). 설계 A의 halt 배관(4번째 인자 haltReason →
      // haltAfterIssueArtifactFailure → halted_partial)을 재사용한다.
      const haltReason = reviewDispatchBreakerHaltReason(trip, incompleteArtifactPath);
      await appendExecutionProgress(
        args.executionPlan.error_log_path,
        "runner issue stance dispatch breaker tripped",
        [
          `failure_class: ${trip.failure_class}`,
          `consecutive_unit_count: ${trip.consecutive_item_count}`,
          `threshold: ${trip.threshold}`,
          `dispatch_incomplete_path: ${incompleteArtifactPath}`,
        ],
      );
      throw stanceDispatchError(
        breakerTripOutcome ?? failedOutcomes[0]!,
        haltReason,
        // halt 시점까지의 배치 진실 전체 — 완료 유닛의 행이 남아야 회복
        // 재디스패치 집합이 dispatch-incomplete의 미완료 집합과 일치한다.
        completedOutcomes,
      );
    }
  }
  let demotedLensIds: string[] = [];
  if (failedOutcomes.length > 0) {
    // 검증-거부 분류는 두 근거를 모두 본다: in-process 경로는 실패 메시지
    // (submit-시점·on-disk 검증기 양쪽 문구), worker 경로는 stderr가 검증
    // 문구를 보장하지 않으므로 frozen salvage input을 구조적 근거로 읽는다.
    const validationFailures: ExecutionOutcome[] = [];
    if (resubmitEnabled) {
      for (const outcome of failedOutcomes) {
        const classified =
          isUnsupportedEvidenceRefFailureMessage(outcome.failure?.message) ||
          (await readFrozenUnsupportedRefViolation(
            outcome.dispatch.output_path,
          )) !== null;
        if (classified) validationFailures.push(outcome);
      }
    }
    if (
      resubmitEnabled &&
      correlatedValidationExceeded({
        validationFailedUnitCount: validationFailures.length,
        totalUnitCount: dispatches.length,
      })
    ) {
      // 설계 A 상관 에스컬레이션: 같은 검증 클래스가 stance 유닛 과반에서
      // 실패하면 구조 결함(프롬프트/스키마/컨텍스트 조립)이므로 whole-run
      // halt를 보존한다.
      throw stanceDispatchError(
        validationFailures[0]!,
        `${CORRELATED_VALIDATION_HALT_REASON}: evidence_refs validation rejected ${validationFailures.length}/${dispatches.length} stance units`,
      );
    }
    const demotable =
      resubmitEnabled && validationFailures.length === failedOutcomes.length;
    if (!demotable) {
      // 현행 승격 규칙 보존: 인프라 실패(timeout/transport/…)와 OFF 경로는
      // 지금처럼 whole-run halt.
      throw stanceDispatchError(failedOutcomes[0]!);
    }
    // 설계 A 유닛 강등: resubmit cap을 소진한 검증-거부 유닛만
    // complete-with-failure로 남긴다. 실패 outcome은 집계 outcome의 failed
    // child로 유지되어 degradation-summary와 상태 강등이 자동 전파되고,
    // 리뷰는 생존 렌즈의 stance로 계속한다.
    demotedLensIds = validationFailures.map((outcome) =>
      outcome.dispatch.unit_id.slice("issue-stance:".length),
    );
    await appendExecutionProgress(
      args.executionPlan.error_log_path,
      "runner stance units demoted (bounded resubmit exhausted)",
      demotedLensIds.map((lensId) => `lens_id: ${lensId}`),
    );
  }
  const survivorLensIds = participatingLensIds.filter(
    (lensId) => !demotedLensIds.includes(lensId),
  );
  const survivorResponsePaths = [
    ...new Set(
      survivorLensIds
        .map((lensId) => responsePathsByLensId.get(lensId))
        .filter((value): value is string => value !== undefined),
    ),
  ];

  await fs.mkdir(path.dirname(seat.packet_path), { recursive: true });
  await fs.writeFile(
    seat.packet_path,
    `${renderRuntimeIssueStanceMatrixPacket({
      projectRoot: args.projectRoot,
      sessionId: args.executionPlan.session_id,
      outputPath: seat.output_path,
      responsePaths: survivorResponsePaths,
    }).trimEnd()}\n`,
    "utf8",
  );
  await registerGeneratedPromptPacketRefForDispatch({
    executionPlan: args.executionPlan,
    consumerId: issueArtifactConsumerId("issue-stance-matrix"),
    packetPath: seat.packet_path,
  });
  await writeIssueStanceMatrixFromResponses({
    executionPlan: args.executionPlan,
    projectRoot: args.projectRoot,
    responsePathsByLensId,
    participatingLensIds: survivorLensIds,
    demotedLensIds,
    outputPath: seat.output_path,
  });
  return {
    dispatch: {
      unit_id: "issue-stance-matrix",
      unit_kind: "issue_artifact",
      packet_path: seat.packet_path,
      output_path: seat.output_path,
    },
    success: true,
    startedAtMs,
    completedAtMs: Date.now(),
    attemptCount: 1,
    packetBytes: await fileSizeIfPresent(seat.packet_path),
    outputBytes: await fileSizeIfPresent(seat.output_path),
    // map/reduce audit trail: per-lens stance results (including salvaged
    // completions with their exhausted-failure child_results) fold under the
    // collection row, mirroring the deliberation aggregate.
    childOutcomes: completedOutcomes,
  };
}

async function runIssueArtifactDispatch(args: {
  projectRoot: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  executorConfig: ReviewUnitExecutorConfig;
  artifactId: ReviewIssueArtifactId;
  lensOutputPaths: string[];
  deliberationResponsePaths?: string[];
  deliberationOutputPath?: string;
  problemFramingProfileRef?: string | null;
  unitTimeoutMs: number;
  retryPolicy: ReviewRuntimeRetryPolicy;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
  /** Continuation per-unit gate — stance 수집 스테이지로 전달된다. */
  runUnitIds?: Set<string> | undefined;
  preservedResultsByUnitId?: Map<string, ReviewUnitExecutionResult> | undefined;
}): Promise<ExecutionOutcome> {
  if (args.artifactId === "issue-stance-matrix") {
    return runIssueStanceMatrixCollectionDispatch({
      projectRoot: args.projectRoot,
      sessionRoot: args.sessionRoot,
      executionPlan: args.executionPlan,
      executorConfig: args.executorConfig,
      lensOutputPaths: args.lensOutputPaths,
      unitTimeoutMs: args.unitTimeoutMs,
      retryPolicy: args.retryPolicy,
      reviewExecutionProfile: args.reviewExecutionProfile,
      runUnitIds: args.runUnitIds,
      preservedResultsByUnitId: args.preservedResultsByUnitId,
    });
  }
  const seat = await writeIssueArtifactPromptPacket({
    artifactId: args.artifactId,
    sessionId: args.executionPlan.session_id,
    projectRoot: args.projectRoot,
    executionPlan: args.executionPlan,
    lensOutputPaths: args.lensOutputPaths,
    ...(args.deliberationResponsePaths
      ? { deliberationResponsePaths: args.deliberationResponsePaths }
      : {}),
    ...(args.deliberationOutputPath
      ? { deliberationOutputPath: args.deliberationOutputPath }
      : {}),
    ...(args.problemFramingProfileRef !== undefined
      ? { problemFramingProfileRef: args.problemFramingProfileRef }
      : {}),
  });
  const dispatch = {
    unit_id: args.artifactId,
    unit_kind: "issue_artifact" as const,
    packet_path: seat.packet_path,
    output_path: seat.output_path,
    output_format: "issue-artifact" as const,
  };
  const progress = issueArtifactProgress(args.artifactId);
  await emitReviewProgress({
    executionPlan: args.executionPlan,
    step: progress.step,
    label: progress.label,
    details: [`artifact=${args.artifactId}`],
  });
  const participatingLensIds = args.lensOutputPaths.map(lensIdFromRound1ArtifactPath);
  if (
    args.artifactId === "finding-ledger" &&
    allLensOutputsAreSidecars(args.lensOutputPaths)
  ) {
    const startedAtMs = Date.now();
    await fs.mkdir(path.dirname(seat.packet_path), { recursive: true });
    await fs.writeFile(
      seat.packet_path,
      `${renderRuntimeFindingLedgerPacket({
        projectRoot: args.projectRoot,
        sessionId: args.executionPlan.session_id,
        outputPath: seat.output_path,
        sidecarPaths: args.lensOutputPaths,
      }).trimEnd()}\n`,
      "utf8",
    );
    await registerGeneratedPromptPacketRefForDispatch({
      executionPlan: args.executionPlan,
      consumerId: issueArtifactConsumerId(args.artifactId),
      packetPath: seat.packet_path,
    });
    await writeFindingLedgerFromLensSidecars({
      projectRoot: args.projectRoot,
      sessionId: args.executionPlan.session_id,
      sidecarPaths: args.lensOutputPaths,
      outputPath: seat.output_path,
    });
    await validateIssueArtifactOnDisk({
      executionPlan: args.executionPlan,
      projectRoot: args.projectRoot,
      artifactId: args.artifactId,
      participatingLensIds,
    });
    return {
      dispatch,
      success: true,
      startedAtMs,
      completedAtMs: Date.now(),
      attemptCount: 1,
      packetBytes: await fileSizeIfPresent(seat.packet_path),
      outputBytes: await fileSizeIfPresent(seat.output_path),
    };
  }
  let lastOutcome: ExecutionOutcome | null = null;
  let lastValidationError: unknown = null;
  const validationMaxAttempts = Math.max(1, args.retryPolicy.issueArtifactMaxRetries);
  const tryCompleteIssueLedgerWithRuntime = async (params: {
    outcome: ExecutionOutcome;
    reason: string;
    candidatePath?: string | undefined;
    attemptCount: number;
  }): Promise<ExecutionOutcome | null> => {
    if (args.artifactId !== "issue-ledger") return null;
    try {
      await completeIssueLedgerArtifactOnDisk({
        executionPlan: args.executionPlan,
        projectRoot: args.projectRoot,
        participatingLensIds,
        candidatePath: params.candidatePath,
      });
      await appendExecutionProgress(
        args.executionPlan.error_log_path,
        "runner issue-ledger runtime completion",
        [
          `reason: ${params.reason.slice(0, 500)}`,
          "completion_source: finding-ledger.yaml + finding-relation-graph.yaml",
          "completion_rule: same_root_candidate merges only; shared_cause_candidate dependencies only",
        ],
      );
      return {
        dispatch,
        success: true,
        startedAtMs: params.outcome.startedAtMs,
        completedAtMs: Date.now(),
        attemptCount: params.attemptCount,
        ...(params.outcome.executorMetadata !== undefined
          ? { executorMetadata: params.outcome.executorMetadata }
          : {}),
        ...(params.outcome.artifactGenerationRealization !== undefined
          ? {
              artifactGenerationRealization:
                params.outcome.artifactGenerationRealization,
            }
          : {}),
        ...(params.outcome.semanticQualityEvidence !== undefined
          ? { semanticQualityEvidence: params.outcome.semanticQualityEvidence }
          : {}),
        packetBytes:
          params.outcome.packetBytes ?? (await fileSizeIfPresent(seat.packet_path)),
        outputBytes: await fileSizeIfPresent(seat.output_path),
      };
    } catch (completionError) {
      await appendExecutionProgress(
        args.executionPlan.error_log_path,
        "runner issue-ledger runtime completion failed",
        [
          `reason: ${params.reason.slice(0, 500)}`,
          `completion_error: ${errorMessage(completionError).slice(0, 500)}`,
        ],
      );
      lastValidationError = completionError;
      return null;
    }
  };
  for (let attempt = 0; attempt < validationMaxAttempts; attempt += 1) {
    if (attempt > 0) {
      await fs.appendFile(
        seat.packet_path,
        [
          "",
          "## Validation Error To Correct",
          "The previous artifact output was rejected by the runtime validator.",
          "Rewrite the entire YAML artifact. Preserve the same contract and quote string scalars.",
          "",
          "```text",
          lastValidationError instanceof Error
            ? lastValidationError.message
            : String(lastValidationError),
          "```",
          "",
        ].join("\n"),
        "utf8",
      );
    }
    await registerGeneratedPromptPacketRefForDispatch({
      executionPlan: args.executionPlan,
      consumerId: issueArtifactConsumerId(args.artifactId),
      packetPath: seat.packet_path,
    });
    const outcome = await runSingleDispatchWithRetries({
      projectRoot: args.projectRoot,
      sessionRoot: args.sessionRoot,
      executionPlan: args.executionPlan,
      executorConfig: args.executorConfig,
      dispatch,
      maxRetries: args.retryPolicy.issueArtifactMaxRetries,
      retryInitialDelayMs: args.retryPolicy.retryInitialDelayMs,
      unitTimeoutMs: args.unitTimeoutMs,
      reviewExecutionProfile: args.reviewExecutionProfile,
    });
    lastOutcome = outcome;
    if (!outcome.success) {
      const completedOutcome = await tryCompleteIssueLedgerWithRuntime({
        outcome,
        reason: `executor failure: ${outcome.failure?.message ?? "unknown error"}`,
        attemptCount: outcome.attemptCount ?? attempt + 1,
      });
      if (completedOutcome) return completedOutcome;
      throw new ReviewIssueArtifactDispatchError(
        `Issue artifact generation failed for ${args.artifactId}: ${outcome.failure?.message ?? "unknown error"}`,
        outcome,
        outcome.failure?.message ?? "unknown error",
      );
    }
    try {
      await validateIssueArtifactOnDisk({
        executionPlan: args.executionPlan,
        projectRoot: args.projectRoot,
        artifactId: args.artifactId,
        participatingLensIds,
      });
      return {
        ...outcome,
        attemptCount: attempt + (outcome.attemptCount ?? 1),
      };
    } catch (error) {
      lastValidationError = error;
      const completedOutcome = await tryCompleteIssueLedgerWithRuntime({
        outcome,
        reason: error instanceof Error ? error.message : String(error),
        candidatePath: seat.output_path,
        attemptCount: attempt + (outcome.attemptCount ?? 1),
      });
      if (completedOutcome) return completedOutcome;
      console.warn(
        `[review progress] ${progress.step}/${REVIEW_PROGRESS_TOTAL_STEPS} ${args.artifactId} validation failed on attempt ${attempt + 1}/${validationMaxAttempts}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await removeFileIfExists(seat.output_path);
    }
  }
  const failureMessage =
    "An issue artifact review unit produced malformed output.";
  const failedOutcome =
    lastOutcome === null
      ? null
      : {
          dispatch,
          success: false,
          startedAtMs: lastOutcome.startedAtMs,
          completedAtMs: Date.now(),
          attemptCount: validationMaxAttempts,
          ...(lastOutcome.packetBytes !== undefined
            ? { packetBytes: lastOutcome.packetBytes }
            : {}),
          ...(lastOutcome.outputBytes !== undefined
            ? { outputBytes: lastOutcome.outputBytes }
            : {}),
          ...(lastOutcome.executorMetadata !== undefined
            ? { executorMetadata: lastOutcome.executorMetadata }
            : {}),
          failure: {
            unit_id: dispatch.unit_id,
            unit_kind: dispatch.unit_kind,
            packet_path: dispatch.packet_path,
            output_path: dispatch.output_path,
            message: `${failureMessage}: ${errorMessage(lastValidationError)}`,
            failure_kind: "output_contract" as const,
          },
        };
  try {
    return await throwMalformedOutputFailure({
      executionPlan: args.executionPlan,
      phase: `execution.issue_artifact.${args.artifactId}`,
      unitId: args.artifactId,
      unitKind: "issue_artifact",
      packetPath: seat.packet_path,
      outputPath: seat.output_path,
      humanMessage: failureMessage,
      error: lastValidationError,
    });
  } catch (error) {
    throw new ReviewIssueArtifactDispatchError(
      `${failureMessage}: ${errorMessage(error)}`,
      failedOutcome,
      error,
    );
  }
}

async function runControlledLensDeliberation(args: {
  projectRoot: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  lensExecutorConfig: ReviewUnitExecutorConfig;
  teamleadExecutorConfig: ReviewUnitExecutorConfig;
  successfulLensDispatches: ExecutionDispatchResult[];
  maxConcurrentLenses: number;
  unitTimeoutMs: number;
  retryPolicy: ReviewRuntimeRetryPolicy;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
  runUnitIds?: Set<string>;
  preservedResultsByUnitId?: Map<string, ReviewUnitExecutionResult>;
}): Promise<{
  deliberationDispatches: ExecutionDispatchResult[];
  deliberationOutcomes: ExecutionOutcome[];
  teamleadOutcome: ExecutionOutcome;
}> {
  const {
    projectRoot,
    sessionRoot,
    executionPlan,
    lensExecutorConfig,
    teamleadExecutorConfig,
    successfulLensDispatches,
    maxConcurrentLenses,
    unitTimeoutMs,
  } = args;
  if (executionPlan.deliberation_mode !== "controlled-lens-deliberation") {
    throw new Error(
      `Unsupported review deliberation mode: ${executionPlan.deliberation_mode}`,
    );
  }

  await appendExecutionProgress(
    executionPlan.error_log_path,
    "runner controlled lens deliberation started",
    [
      `deliberation_mode: ${executionPlan.deliberation_mode}`,
      `participating_lens_count: ${successfulLensDispatches.length}`,
    ],
  );

  const deliberationPlan = await readYamlDocument<Record<string, unknown>>(
    executionPlan.deliberation_plan_path,
  );
  const issueLedger = await readYamlDocument<Record<string, unknown>>(
    executionPlan.issue_ledger_path,
  );
  const issueStanceMatrix = await readYamlDocument<Record<string, unknown>>(
    executionPlan.issue_stance_matrix_path,
  );

  const workItems = buildIssueScopedDeliberationWorklist({
    promptPacketsRoot: executionPlan.prompt_packets_root,
    deliberationRootPath: executionPlan.deliberation_root_path,
    deliberationPlan,
    issueLedger,
    issueStanceMatrix,
  });
  const workItemByUnitId = new Map(
    workItems.map((workItem) => [
      `deliberation:${workItem.issue_id}:${workItem.lens_id}`,
      workItem,
    ]),
  );

  const deliberationDispatches = workItems.map((workItem) => {
    return {
      unit_id: `deliberation:${workItem.issue_id}:${workItem.lens_id}`,
      unit_kind: "deliberation" as const,
      packet_path: workItem.packet_path,
      output_path: workItem.output_path,
      output_format: "issue-deliberation-response" as const,
    };
  });

  await emitReviewProgress({
    executionPlan,
    step: 9,
    label: "issue-scoped deliberation responses",
    details: [`work_item_count=${deliberationDispatches.length}`],
  });
  const shouldRunUnit = (unitId: string): boolean =>
    args.runUnitIds === undefined ||
    args.runUnitIds.has(unitId) ||
    (
      unitId.startsWith("deliberation:") &&
      args.runUnitIds.has("controlled-deliberation")
    );
  const preservedOutcomeForDispatch = (
    dispatch: ExecutionDispatchResult,
  ): ExecutionOutcome => {
    const result = args.preservedResultsByUnitId?.get(dispatch.unit_id);
    if (!result || result.status !== "completed") {
      throw new Error(
        `Cannot preserve continuation unit without a completed prior result: ${dispatch.unit_id}`,
      );
    }
    return outcomeFromPreviousResult(result);
  };
  const outputContractFailureOutcome = async (
    dispatch: ExecutionDispatchResult,
    error: unknown,
    priorOutcome?: ExecutionOutcome,
  ): Promise<ExecutionOutcome> => {
    const startedAtMs = priorOutcome?.startedAtMs ?? Date.now();
    const completedAtMs = Date.now();
    const failure: ExecutionFailure = {
      unit_id: dispatch.unit_id,
      unit_kind: dispatch.unit_kind,
      packet_path: dispatch.packet_path,
      output_path: dispatch.output_path,
      message: errorMessage(error),
      failure_kind: "output_contract",
    };
    await appendExecutionFailure(
      executionPlan.error_log_path,
      failure,
      executionPlan.effective_boundary_state,
    );
    return {
      dispatch,
      success: false,
      startedAtMs,
      completedAtMs,
      attemptCount: priorOutcome?.attemptCount ?? 1,
      packetBytes:
        priorOutcome?.packetBytes ?? await fileSizeIfPresent(dispatch.packet_path),
      outputBytes:
        priorOutcome?.outputBytes ?? await fileSizeIfPresent(dispatch.output_path),
      failure,
    };
  };
  // Unavailable-completion now lives at module level
  // (completeUnavailableDeliberationResponseUnit) — shared by the worker
  // path (via executeDeliberationResponseUnit) and the validation loop.
  for (const dispatch of deliberationDispatches) {
    if (!shouldRunUnit(dispatch.unit_id)) continue;
    const workItem = workItemByUnitId.get(dispatch.unit_id);
    if (!workItem) throw new Error(`Missing deliberation work item: ${dispatch.unit_id}`);
    const deliberationReadRefs = [
      executionPlan.issue_ledger_path,
      executionPlan.issue_stance_matrix_path,
      executionPlan.deliberation_plan_path,
      executionPlan.finding_ledger_path,
      executionPlan.finding_relation_graph_path,
    ];
    const packetText = buildIssueScopedLensDeliberationPrompt({
      sessionId: executionPlan.session_id,
      projectRoot,
      workItem,
      boundaryContext: renderReviewUnitBoundaryContext(
        projectRoot,
        executionPlan,
        dispatch.unit_id,
        dispatch.output_path,
        deliberationReadRefs,
      ),
    });
    await fs.mkdir(path.dirname(dispatch.packet_path), { recursive: true });
    await fs.writeFile(dispatch.packet_path, `${packetText.trimEnd()}\n`, "utf8");
    await registerGeneratedPromptPacketRefForDispatch({
      executionPlan,
      consumerId: `deliberation:${workItem.lens_id}`,
      packetPath: dispatch.packet_path,
    });
  }

  // nested-workers: batch attempt #1 over the runnable (non-preserved)
  // deliberation units; failures fall back to flat per-unit retries.
  const deliberationNestedBatch = await runNestedStageFirstAttempt({
    stageLabel: "deliberation",
    projectRoot,
    sessionRoot,
    executionPlan,
    executorConfig: lensExecutorConfig,
    dispatches: deliberationDispatches.filter((dispatch) =>
      shouldRunUnit(dispatch.unit_id),
    ),
    dispatchWidth: maxConcurrentLenses,
    unitTimeoutMs,
    reviewExecutionProfile: args.reviewExecutionProfile,
  });

  const deliberationOutcomes: Array<ExecutionOutcome | undefined> = new Array(
    deliberationDispatches.length,
  );
  let nextDeliberationIndex = 0;

  async function runDeliberationWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextDeliberationIndex;
      nextDeliberationIndex += 1;
      if (currentIndex >= deliberationDispatches.length) return;
      const dispatch = deliberationDispatches[currentIndex];
      if (!dispatch) return;
      if (!shouldRunUnit(dispatch.unit_id)) {
        deliberationOutcomes[currentIndex] = preservedOutcomeForDispatch(dispatch);
        continue;
      }
      const workItem = workItemByUnitId.get(dispatch.unit_id);
      if (!workItem) {
        // Dispatches are built 1:1 from the worklist; the validation loop
        // below would throw on the same absence — fail loud here too.
        throw new Error(`Missing deliberation work item: ${dispatch.unit_id}`);
      }
      deliberationOutcomes[currentIndex] = await executeDeliberationResponseUnit({
        ctx: {
          projectRoot,
          sessionRoot,
          executionPlan,
          executorConfig: lensExecutorConfig,
          retryPolicy: args.retryPolicy,
          unitTimeoutMs,
          reviewExecutionProfile: args.reviewExecutionProfile,
        },
        dispatch,
        workItem,
        nestedBatch: deliberationNestedBatch,
      });
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(maxConcurrentLenses, deliberationDispatches.length) },
      async () => runDeliberationWorker(),
    ),
  );

  const completedDeliberationOutcomes = deliberationOutcomes.filter(
    (outcome): outcome is ExecutionOutcome => outcome !== undefined,
  );
  const failedDeliberation = completedDeliberationOutcomes.find(
    (outcome) => !outcome.success,
  );
  if (failedDeliberation?.failure) {
    throw new ReviewControlledDeliberationDispatchError(
      `Controlled lens deliberation failed for ${failedDeliberation.dispatch.unit_id}: ${failedDeliberation.failure.message}`,
      completedDeliberationOutcomes,
      failedDeliberation,
    );
  }

  const validatedResponses: IssueDeliberationResponseArtifact[] = [];
  for (const dispatch of deliberationDispatches) {
    const workItem = workItemByUnitId.get(dispatch.unit_id);
    if (!workItem) throw new Error(`Missing deliberation work item: ${dispatch.unit_id}`);
    try {
      validatedResponses.push(
        validateIssueDeliberationResponseObject({
          parsed: await readYamlDocument<Record<string, unknown>>(dispatch.output_path),
          sessionId: executionPlan.session_id,
          issueId: workItem.issue_id,
          lensId: workItem.lens_id,
          allowedEvidenceRefs: parseRuntimeIssueDeliberationSchemaContext(
            await fs.readFile(dispatch.packet_path, "utf8"),
          ).allowed_evidence_refs,
        }),
      );
    } catch (error) {
      const failedOutcome = await outputContractFailureOutcome(
        dispatch,
        error,
        completedDeliberationOutcomes.find(
          (outcome) => outcome.dispatch.unit_id === dispatch.unit_id,
        ),
      );
      const completedOutcome = await completeUnavailableDeliberationResponseUnit({
        executionPlan,
        dispatch,
        workItem,
        reason: errorMessage(error),
        failedOutcome,
      });
      if (completedOutcome) {
        const allowedEvidenceRefs = parseRuntimeIssueDeliberationSchemaContext(
          await fs.readFile(dispatch.packet_path, "utf8"),
        ).allowed_evidence_refs;
        validatedResponses.push(
          validateIssueDeliberationResponseObject({
            parsed: await readYamlDocument<Record<string, unknown>>(
              dispatch.output_path,
            ),
            sessionId: executionPlan.session_id,
            issueId: workItem.issue_id,
            lensId: workItem.lens_id,
            allowedEvidenceRefs,
          }),
        );
        const outcomeIndex = completedDeliberationOutcomes.findIndex(
          (outcome) => outcome.dispatch.unit_id === dispatch.unit_id,
        );
        if (outcomeIndex >= 0) {
          completedDeliberationOutcomes[outcomeIndex] = completedOutcome;
        } else {
          completedDeliberationOutcomes.push(completedOutcome);
        }
        continue;
      }
      throw new ReviewControlledDeliberationDispatchError(
        `Controlled lens deliberation output contract failed for ${dispatch.unit_id}: ${errorMessage(error)}`,
        [
          ...completedDeliberationOutcomes.filter(
            (outcome) => outcome.dispatch.unit_id !== dispatch.unit_id,
          ),
          failedOutcome,
        ],
        failedOutcome,
      );
    }
  }

  const resolutionPath = deliberationResolutionPath(executionPlan.session_root);
  const teamleadReadRefs = [
    executionPlan.issue_ledger_path,
    executionPlan.issue_stance_matrix_path,
    executionPlan.deliberation_plan_path,
    ...deliberationDispatches.map((dispatch) => dispatch.output_path),
    ...issueArtifactOutputPaths(
      executionPlan,
      PRE_DELIBERATION_ISSUE_ARTIFACT_IDS,
    ),
  ];

  const teamleadDispatch: ExecutionDispatchResult = {
    unit_id: "controlled-deliberation",
    unit_kind: "deliberation",
    packet_path: executionPlan.teamlead_deliberation_prompt_packet_path,
    output_path: resolutionPath,
    output_format: "deliberation-resolution",
  };
  const completeUnavailableTeamleadResolution = async (
    reason: string,
    failedOutcome?: ExecutionOutcome,
  ): Promise<{
    outcome: ExecutionOutcome;
    resolution: ReturnType<typeof buildRuntimeUnavailableDeliberationResolution>;
  } | null> => {
    try {
      const resolution = buildRuntimeUnavailableDeliberationResolution({
        sessionId: executionPlan.session_id,
        issueLedger,
        deliberationPlan,
        responses: validatedResponses,
        reason,
      });
      await writeYamlDocument(resolutionPath, resolution);
      const validatedResolution = validateDeliberationResolutionObject({
        parsed: resolution,
        sessionId: executionPlan.session_id,
        issueLedger,
        deliberationPlan,
      });
      await fs.writeFile(
        executionPlan.deliberation_output_path,
        `${renderDeliberationMarkdownProjection({
          resolution: validatedResolution,
        }).trimEnd()}\n`,
        "utf8",
      );
      await appendExecutionProgress(
        executionPlan.error_log_path,
        "runner teamlead deliberation runtime completion",
        [
          `reason: ${reason.slice(0, 500)}`,
          "completion_rule: preserve issue-ledger truth; mark planned issues unresolved-with-reason",
        ],
      );
      return {
        outcome: {
          dispatch: teamleadDispatch,
          success: true,
          startedAtMs: failedOutcome?.startedAtMs ?? Date.now(),
          completedAtMs: Date.now(),
          attemptCount: failedOutcome?.attemptCount ?? 1,
          packetBytes:
            failedOutcome?.packetBytes ??
            await fileSizeIfPresent(teamleadDispatch.packet_path),
          outputBytes: await fileSizeIfPresent(teamleadDispatch.output_path),
          ...(failedOutcome !== undefined ? { childOutcomes: [failedOutcome] } : {}),
          ...(failedOutcome?.artifactGenerationRealization !== undefined
            ? {
                artifactGenerationRealization:
                  failedOutcome.artifactGenerationRealization,
              }
            : {}),
          ...(failedOutcome?.semanticQualityEvidence !== undefined
            ? { semanticQualityEvidence: failedOutcome.semanticQualityEvidence }
            : {}),
        },
        resolution: validatedResolution,
      };
    } catch (completionError) {
      await appendExecutionProgress(
        executionPlan.error_log_path,
        "runner teamlead deliberation runtime completion failed",
        [
          `reason: ${reason.slice(0, 500)}`,
          `completion_error: ${errorMessage(completionError).slice(0, 500)}`,
        ],
      );
      return null;
    }
  };
  let teamleadOutcome: ExecutionOutcome;
  if (shouldRunUnit(teamleadDispatch.unit_id) && deliberationDispatches.length === 0) {
    const startedAtMs = Date.now();
    const resolution = buildNoPlannedDeliberationResolution({
      sessionId: executionPlan.session_id,
      issueLedger,
    });
    await fs.mkdir(path.dirname(executionPlan.teamlead_deliberation_prompt_packet_path), {
      recursive: true,
    });
    await fs.writeFile(
      executionPlan.teamlead_deliberation_prompt_packet_path,
      [
        "# Runtime Controlled Deliberation Resolution",
        "",
        `session_id: ${executionPlan.session_id}`,
        "unit_id: controlled-deliberation",
        "unit_kind: deliberation",
        "",
        "No issue required LLM deliberation according to deliberation-plan.yaml.",
      ].join("\n") + "\n",
      "utf8",
    );
    await registerGeneratedPromptPacketRefForDispatch({
      executionPlan,
      consumerId: "controlled-deliberation",
      packetPath: executionPlan.teamlead_deliberation_prompt_packet_path,
    });
    await writeYamlDocument(resolutionPath, resolution);
    teamleadOutcome = {
      dispatch: teamleadDispatch,
      success: true,
      startedAtMs,
      completedAtMs: Date.now(),
      attemptCount: 0,
      packetBytes: await fileSizeIfPresent(teamleadDispatch.packet_path),
      outputBytes: await fileSizeIfPresent(teamleadDispatch.output_path),
    };
  } else if (shouldRunUnit(teamleadDispatch.unit_id)) {
    const teamleadPacketText = buildTeamleadIssueResolutionPrompt({
      sessionId: executionPlan.session_id,
      projectRoot,
      outputPath: resolutionPath,
      deliberationPlan,
      issueLedger,
      responses: validatedResponses,
      boundaryContext: renderReviewUnitBoundaryContext(
        projectRoot,
        executionPlan,
        teamleadDispatch.unit_id,
        resolutionPath,
        teamleadReadRefs,
      ),
    });
    await fs.writeFile(
      executionPlan.teamlead_deliberation_prompt_packet_path,
      `${teamleadPacketText.trimEnd()}\n`,
      "utf8",
    );
    await registerGeneratedPromptPacketRefForDispatch({
      executionPlan,
      consumerId: "controlled-deliberation",
      packetPath: executionPlan.teamlead_deliberation_prompt_packet_path,
    });

    await emitReviewProgress({
      executionPlan,
      step: 10,
      label: "teamlead controlled deliberation",
      details: [`output_path=${resolutionPath}`],
    });
    teamleadOutcome = await runSingleDispatchWithRetries({
      projectRoot,
      sessionRoot,
      executionPlan,
      executorConfig: teamleadExecutorConfig,
      dispatch: teamleadDispatch,
      maxRetries: args.retryPolicy.deliberationMaxRetries,
      retryInitialDelayMs: args.retryPolicy.retryInitialDelayMs,
      unitTimeoutMs,
      reviewExecutionProfile: args.reviewExecutionProfile,
    });
  } else {
    teamleadOutcome = preservedOutcomeForDispatch(teamleadDispatch);
  }
  if (!teamleadOutcome.success) {
    const completedResolution = await completeUnavailableTeamleadResolution(
      teamleadOutcome.failure?.message ?? "unknown teamlead failure",
      teamleadOutcome,
    );
    if (completedResolution) {
      teamleadOutcome = completedResolution.outcome;
    } else {
      throw new ReviewControlledDeliberationDispatchError(
        `Teamlead controlled deliberation failed: ${teamleadOutcome.failure?.message ?? "unknown error"}`,
        [...completedDeliberationOutcomes, teamleadOutcome],
        teamleadOutcome,
      );
    }
  }
  let resolution;
  try {
    resolution = validateDeliberationResolutionObject({
      parsed: await readYamlDocument<Record<string, unknown>>(resolutionPath),
      sessionId: executionPlan.session_id,
      issueLedger,
      deliberationPlan,
    });
  } catch (error) {
    const failedOutcome = await outputContractFailureOutcome(
      teamleadDispatch,
      error,
      teamleadOutcome,
    );
    const completedResolution = await completeUnavailableTeamleadResolution(
      errorMessage(error),
      failedOutcome,
    );
    if (completedResolution) {
      teamleadOutcome = completedResolution.outcome;
      resolution = completedResolution.resolution;
    } else {
    throw new ReviewControlledDeliberationDispatchError(
      `Teamlead controlled deliberation output contract failed: ${errorMessage(error)}`,
      [...completedDeliberationOutcomes, failedOutcome],
      failedOutcome,
    );
    }
  }
  await fs.writeFile(
    executionPlan.deliberation_output_path,
    `${renderDeliberationMarkdownProjection({ resolution }).trimEnd()}\n`,
    "utf8",
  );

  await appendExecutionProgress(
    executionPlan.error_log_path,
    "runner controlled lens deliberation completed",
    [
      `deliberation_resolution_path: ${resolutionPath}`,
      `deliberation_output_path: ${executionPlan.deliberation_output_path}`,
      `issue_deliberation_response_count: ${deliberationDispatches.length}`,
    ],
  );

  return {
    deliberationDispatches,
    deliberationOutcomes: completedDeliberationOutcomes,
    teamleadOutcome,
  };
}

interface SynthesisMapReduceResult {
  outcome: ExecutionOutcome;
  issueOutcomes: ExecutionOutcome[];
}

function sourceWorkItemRef(workItem: ReviewSynthesisWorkItem): string {
  return `synthesis-work-items.yaml#${workItem.work_item_id}`;
}

async function synthesisValidationFailureOutcome(args: {
  executionPlan: ReviewExecutionPlan;
  dispatch: ExecutionDispatchResult;
  priorOutcome: ExecutionOutcome;
  error: unknown;
}): Promise<ExecutionOutcome> {
  const failure: ExecutionFailure = {
    unit_id: args.dispatch.unit_id,
    unit_kind: args.dispatch.unit_kind,
    packet_path: args.dispatch.packet_path,
    output_path: args.dispatch.output_path,
    message: errorMessage(args.error),
    failure_kind: failureKindFromError(args.error),
  };
  await removeFileIfExists(args.dispatch.output_path);
  await appendExecutionFailure(
    args.executionPlan.error_log_path,
    failure,
    args.executionPlan.effective_boundary_state,
  );
  return {
    dispatch: args.dispatch,
    success: false,
    startedAtMs: args.priorOutcome.startedAtMs,
    completedAtMs: Date.now(),
    ...(args.priorOutcome.attemptCount !== undefined
      ? { attemptCount: args.priorOutcome.attemptCount }
      : {}),
    ...(args.priorOutcome.executorMetadata !== undefined
      ? { executorMetadata: args.priorOutcome.executorMetadata }
      : {}),
    ...(args.priorOutcome.packetBytes !== undefined
      ? { packetBytes: args.priorOutcome.packetBytes }
      : {}),
    outputBytes: await fileSizeIfPresent(args.dispatch.output_path),
    failure,
  };
}

function aggregateSynthesisExecutorMetadata(
  outcomes: ExecutionOutcome[],
): ReviewExecutorRunMetadata | undefined {
  const metadataRows = outcomes
    .map((outcome) => outcome.executorMetadata)
    .filter((metadata): metadata is ReviewExecutorRunMetadata => metadata !== undefined);
  if (metadataRows.length === 0) return undefined;
  const summed: ReviewExecutorRunMetadata = {};
  for (const field of [
    "input_tokens",
    "output_tokens",
    "tool_calls",
    "tool_iterations",
  ] as const) {
    const values = metadataRows
      .map((metadata) => metadata[field])
      .filter((value): value is number => typeof value === "number");
    if (values.length > 0) {
      summed[field] = values.reduce((total, value) => total + value, 0);
    }
  }
  const hostRuntimes = uniqueStrings(
    metadataRows
      .map((metadata) => metadata.host_runtime)
      .filter((value): value is ReviewHostRuntime => value !== undefined),
  );
  if (hostRuntimes.length === 1) summed.host_runtime = hostRuntimes[0]!;
  const modelIds = uniqueStrings(
    metadataRows
      .map((metadata) => metadata.model_id)
      .filter((value): value is string => value !== undefined),
  );
  if (modelIds.length === 1) summed.model_id = modelIds[0]!;
  const artifactGenerationRealizations = uniqueStrings(
    metadataRows
      .map((metadata) => metadata.artifact_generation_realization)
      .filter((value): value is ReviewArtifactGenerationRealization =>
        value !== undefined
      ),
  );
  if (artifactGenerationRealizations.length === 1) {
    const realization = artifactGenerationRealizations[0]!;
    summed.artifact_generation_realization = realization;
    summed.semantic_quality_evidence =
      semanticQualityEvidenceForArtifactGeneration(realization);
  }
  const nativeAdmissions = metadataRows
    .map((metadata) => metadata.native_admission)
    .filter(
      (metadata): metadata is ReviewNativeAdmissionMetadata =>
        metadata !== undefined,
    );
  if (nativeAdmissions.length > 0) {
    const uniqueNativeAdmissions = uniqueByJson(nativeAdmissions);
    if (uniqueNativeAdmissions.length === 1) {
      summed.native_admission = uniqueNativeAdmissions[0]!;
    }
  }
  const toolBoundarySkips = sumToolBoundarySkipMetadata(
    metadataRows
      .map((metadata) => metadata.tool_boundary_skips)
      .filter(
        (metadata): metadata is ReviewToolBoundarySkipMetadata =>
          metadata !== undefined,
      ),
  );
  if (toolBoundarySkips) {
    summed.tool_boundary_skips = toolBoundarySkips;
  }
  const citationAudit = aggregateCitationAuditMetadata(metadataRows);
  if (citationAudit?.audit) {
    summed.citation_audit = citationAudit.audit;
  }
  if (citationAudit?.rejection) {
    summed.citation_audit_rejection = citationAudit.rejection;
  }
  return Object.keys(summed).length > 0 ? summed : undefined;
}

function uniqueByJson<T>(values: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function sumToolBoundarySkipMetadata(
  rows: ReviewToolBoundarySkipMetadata[],
): ReviewToolBoundarySkipMetadata | undefined {
  if (rows.length === 0) return undefined;
  return {
    boundary_skips: rows.reduce((total, row) => total + row.boundary_skips, 0),
    unreadable_skips: rows.reduce((total, row) => total + row.unreadable_skips, 0),
    oversized_skips: rows.reduce((total, row) => total + row.oversized_skips, 0),
  };
}

function aggregateCitationAuditMetadata(
  rows: ReviewExecutorRunMetadata[],
): {
  audit?: ReviewCitationAuditMetadata;
  rejection?: ReviewCitationAuditRejectionMetadata;
} | undefined {
  const rejectionRows = rows
    .map((metadata) => metadata.citation_audit_rejection)
    .filter(
      (metadata): metadata is ReviewCitationAuditRejectionMetadata =>
        metadata !== undefined,
    );
  if (rejectionRows.length > 0) {
    return { rejection: rejectionRows[0]! };
  }
  const auditRows = rows
    .map((metadata) => metadata.citation_audit)
    .filter(
      (metadata): metadata is ReviewCitationAuditMetadata =>
        metadata !== undefined,
    );
  if (auditRows.length === 0) return undefined;
  if (auditRows.length === 1) return { audit: auditRows[0]! };
  if (auditRows.length !== rows.length) return undefined;

  const failedRefs = uniqueStrings(
    auditRows.flatMap((audit) => audit.failed_refs ?? []),
  );
  const allSkipped = auditRows.every((audit) => audit.status === "skipped");
  const status = allSkipped ? "skipped" : "completed";
  const coverageStatus: ReviewCitationAuditMetadata["coverage_status"] = allSkipped
    ? "none"
    : failedRefs.length > 0 ||
        auditRows.some((audit) => audit.coverage_status === "partial")
      ? "partial"
      : "complete";
  const skipReasons = uniqueStrings(
    auditRows
      .map((audit) => audit.skip_reason)
      .filter((reason): reason is string => reason !== undefined),
  );
  return {
    audit: {
      status,
      coverage_status: coverageStatus,
      quotes_checked: auditRows.reduce(
        (total, audit) => total + audit.quotes_checked,
        0,
      ),
      quotes_unmatched: uniqueStrings(
        auditRows.flatMap((audit) => audit.quotes_unmatched),
      ),
      quotes_unmatched_meta: uniqueStrings(
        auditRows.flatMap((audit) => audit.quotes_unmatched_meta),
      ),
      attribution_count: auditRows.reduce(
        (total, audit) => total + audit.attribution_count,
        0,
      ),
      min_quote_length: Math.min(
        ...auditRows.map((audit) => audit.min_quote_length),
      ),
      ...(skipReasons.length > 0 ? { skip_reason: skipReasons.join("; ") } : {}),
      ...(failedRefs.length > 0 ? { failed_refs: failedRefs } : {}),
    },
  };
}

async function runSynthesisMapReduceDispatch(args: {
  projectRoot: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  executorConfig: ReviewUnitExecutorConfig;
  expectedLensIds: string[];
  receivedLensIds: string[];
  maxConcurrentIssueSynthesis: number;
  unitTimeoutMs: number;
  retryPolicy: ReviewRuntimeRetryPolicy;
  reviewExecutionProfile?: ReviewExecutionProfile | undefined;
  runUnitIds?: Set<string>;
  preservedResultsByUnitId?: Map<string, ReviewUnitExecutionResult>;
}): Promise<SynthesisMapReduceResult> {
  const workItemsPath = synthesisWorkItemsPath(args.sessionRoot);
  const ledgerPath = synthesisLedgerPath(args.sessionRoot);
  const aggregateDispatch: ExecutionDispatchResult = {
    unit_id: "synthesize",
    unit_kind: "synthesize",
    packet_path: workItemsPath,
    output_path: ledgerPath,
  };
  const aggregateStartedAtMs = Date.now();
  const issueOutcomes: ExecutionOutcome[] = [];

  const aggregateFailureOutcome = async (
    error: unknown,
    failedOutcome?: ExecutionOutcome,
  ): Promise<SynthesisMapReduceResult> => {
    const executorMetadata = aggregateSynthesisExecutorMetadata(issueOutcomes);
    const failure: ExecutionFailure = {
      unit_id: aggregateDispatch.unit_id,
      unit_kind: aggregateDispatch.unit_kind,
      packet_path: aggregateDispatch.packet_path,
      output_path: aggregateDispatch.output_path,
      message: failedOutcome?.failure?.message ?? errorMessage(error),
      failure_kind:
        failedOutcome?.failure?.failure_kind ?? failureKindFromError(error),
    };
    await removeFileIfExists(aggregateDispatch.output_path);
    await removeFileIfExists(args.executionPlan.synthesis_output_path);
    await appendExecutionFailure(
      args.executionPlan.error_log_path,
      failure,
      args.executionPlan.effective_boundary_state,
    );
    return {
      outcome: {
        dispatch: aggregateDispatch,
        success: false,
        startedAtMs: aggregateStartedAtMs,
        completedAtMs: Date.now(),
        attemptCount: issueOutcomes.length > 0
          ? Math.max(
              ...issueOutcomes.map((outcome) => outcome.attemptCount ?? 0),
              0,
            )
          : 0,
        ...(executorMetadata !== undefined ? { executorMetadata } : {}),
        packetBytes: await fileSizeIfPresent(aggregateDispatch.packet_path),
        outputBytes: await fileSizeIfPresent(aggregateDispatch.output_path),
        failure,
        childOutcomes: issueOutcomes.filter(
          (outcome): outcome is ExecutionOutcome => outcome !== undefined,
        ),
      },
      issueOutcomes,
    };
  };

  try {
    const [
      findingLedger,
      relationGraph,
      issueLedger,
      issueStanceMatrix,
      deliberationPlan,
      problemFraming,
    ] = await Promise.all([
      readYamlDocument<Record<string, unknown>>(args.executionPlan.finding_ledger_path),
      readYamlDocument<Record<string, unknown>>(
        args.executionPlan.finding_relation_graph_path,
      ),
      readYamlDocument<Record<string, unknown>>(args.executionPlan.issue_ledger_path),
      readYamlDocument<Record<string, unknown>>(
        args.executionPlan.issue_stance_matrix_path,
      ),
      readYamlDocument<Record<string, unknown>>(
        args.executionPlan.deliberation_plan_path,
      ),
      readYamlDocument<Record<string, unknown>>(args.executionPlan.problem_framing_path),
    ]);
    const deliberationResolution = validateDeliberationResolutionObject({
      parsed: await readYamlDocument<Record<string, unknown>>(
        deliberationResolutionPath(args.sessionRoot),
      ),
      sessionId: args.executionPlan.session_id,
      issueLedger,
      deliberationPlan,
    });
    const workItems: ReviewSynthesisWorkItemsArtifact =
      await writeReviewSynthesisWorkItems({
        projectRoot: args.projectRoot,
        executionPlan: args.executionPlan,
        findingLedger,
        relationGraph,
        issueLedger,
        issueStanceMatrix,
        deliberationPlan,
        deliberationResolution,
        problemFraming,
      });

    const dispatches = workItems.work_items.map((workItem) => ({
      unit_id: workItem.work_item_id,
      unit_kind: "synthesize" as const,
      packet_path: workItem.packet_path,
      output_path: workItem.response_path,
      output_format: "issue-synthesis-response" as const,
    }));
    const shouldRunUnit = (unitId: string): boolean => {
      if (args.runUnitIds === undefined) return true;
      if (args.runUnitIds.has(unitId)) return true;
      if (
        args.runUnitIds.has("synthesize") &&
        args.preservedResultsByUnitId?.get(unitId)?.status !== "completed"
      ) {
        return true;
      }
      return false;
    };
    const preservedOutcomeForDispatch = (
      dispatch: ExecutionDispatchResult,
    ): ExecutionOutcome => {
      const result = args.preservedResultsByUnitId?.get(dispatch.unit_id);
      if (!result || result.status !== "completed") {
        throw new Error(
          `Cannot preserve continuation unit without a completed prior result: ${dispatch.unit_id}`,
        );
      }
      return outcomeFromPreviousResult(result);
    };
    const workItemByUnitId = new Map(
      workItems.work_items.map((workItem) => [workItem.work_item_id, workItem]),
    );
    // Unavailable-completion now lives at module level
    // (completeUnavailableSynthesisResponseUnit) — consumed via
    // executeSynthesisResponseUnit in the worker.
    const synthesisReadRefs = uniqueAllowedReadRefs(args.projectRoot, [
      workItemsPath,
      args.executionPlan.finding_ledger_path,
      args.executionPlan.finding_relation_graph_path,
      args.executionPlan.issue_ledger_path,
      args.executionPlan.issue_stance_matrix_path,
      args.executionPlan.deliberation_plan_path,
      deliberationResolutionPath(args.sessionRoot),
      args.executionPlan.problem_framing_path,
      args.executionPlan.review_target_profile_path,
    ]);

    await Promise.all(
      workItems.work_items.filter((workItem) =>
        shouldRunUnit(workItem.work_item_id),
      ).map(async (workItem) => {
        await fs.mkdir(path.dirname(workItem.packet_path), { recursive: true });
        await fs.writeFile(
          workItem.packet_path,
          `${renderIssueSynthesisPrompt({
            sessionId: args.executionPlan.session_id,
            projectRoot: args.projectRoot,
            workItem,
            workItemsPath,
            boundaryContext: renderReviewUnitBoundaryContext(
              args.projectRoot,
              args.executionPlan,
              workItem.work_item_id,
              workItem.response_path,
              synthesisReadRefs,
            ),
          }).trimEnd()}\n`,
          "utf8",
        );
        await registerGeneratedPromptPacketRefForDispatch({
          executionPlan: args.executionPlan,
          consumerId: "synthesize",
          packetPath: workItem.packet_path,
        });
      }),
    );

    // nested-workers: batch attempt #1 over the runnable synthesis units;
    // failures fall back to flat per-unit retries.
    const synthesisNestedBatch = await runNestedStageFirstAttempt({
      stageLabel: "synthesis",
      projectRoot: args.projectRoot,
      sessionRoot: args.sessionRoot,
      executionPlan: args.executionPlan,
      executorConfig: args.executorConfig,
      dispatches: dispatches.filter((dispatch) => shouldRunUnit(dispatch.unit_id)),
      dispatchWidth: Math.max(1, args.maxConcurrentIssueSynthesis),
      unitTimeoutMs: args.unitTimeoutMs,
      reviewExecutionProfile: args.reviewExecutionProfile,
    });

    const responses: IssueSynthesisResponseArtifact[] = [];
    let nextDispatchIndex = 0;
    const workerCount = Math.min(
      Math.max(1, args.maxConcurrentIssueSynthesis),
      dispatches.length,
    );
    const runWorker = async (): Promise<void> => {
      while (nextDispatchIndex < dispatches.length) {
        const currentIndex = nextDispatchIndex;
        nextDispatchIndex += 1;
        const dispatch = dispatches[currentIndex];
        if (!dispatch) continue;
        const workItem = workItemByUnitId.get(dispatch.unit_id);
        if (!workItem) {
          throw new Error(`Missing synthesis work item: ${dispatch.unit_id}`);
        }
        if (!shouldRunUnit(dispatch.unit_id)) {
          const preservedOutcome = preservedOutcomeForDispatch(dispatch);
          issueOutcomes[currentIndex] = preservedOutcome;
          responses[currentIndex] = await validateIssueSynthesisResponseOnDisk({
            responsePath: dispatch.output_path,
            sessionId: args.executionPlan.session_id,
            workItem,
            sourceWorkItemsRef: sourceWorkItemRef(workItem),
          });
          continue;
        }
        const { outcome, response } = await executeSynthesisResponseUnit({
          ctx: {
            projectRoot: args.projectRoot,
            sessionRoot: args.sessionRoot,
            executionPlan: args.executionPlan,
            executorConfig: args.executorConfig,
            retryPolicy: args.retryPolicy,
            unitTimeoutMs: args.unitTimeoutMs,
            reviewExecutionProfile: args.reviewExecutionProfile,
          },
          dispatch,
          workItem,
          sourceWorkItemsRef: sourceWorkItemRef(workItem),
          nestedBatch: synthesisNestedBatch,
        });
        issueOutcomes[currentIndex] = outcome;
        if (response) {
          responses[currentIndex] = response;
        }
      }
    };

    if (dispatches.length > 0) {
      await emitReviewProgress({
        executionPlan: args.executionPlan,
        step: 12,
        label: "issue-scoped synthesis responses",
        details: [`work_item_count=${dispatches.length}`],
      });
      await Promise.all(
        Array.from({ length: workerCount }, () => runWorker()),
      );
    } else {
      await emitReviewProgress({
        executionPlan: args.executionPlan,
        step: 12,
        label: "runtime synthesis ledger",
        details: ["material_issue_count=0"],
      });
    }

    const failedOutcome = issueOutcomes.find((outcome) => outcome && !outcome.success);
    if (failedOutcome) {
      return aggregateFailureOutcome(
        new Error(
          `Issue-scoped synthesis failed: ${failedOutcome.failure?.message ?? "unknown error"}`,
        ),
        failedOutcome,
      );
    }

    const ledger = await writeReviewSynthesisLedger({
      projectRoot: args.projectRoot,
      executionPlan: args.executionPlan,
      workItems,
      responses,
    });
    await writeSynthesisMarkdownFromLedger({
      ledger,
      outputPath: args.executionPlan.synthesis_output_path,
      expectedLensIds: args.expectedLensIds,
      receivedLensIds: args.receivedLensIds,
    });
    await appendExecutionProgress(
      args.executionPlan.error_log_path,
      "runner synthesis map-reduce completed",
      [
        `synthesis_work_items_path: ${workItemsPath}`,
        `synthesis_ledger_path: ${ledgerPath}`,
        `synthesis_projection_path: ${args.executionPlan.synthesis_output_path}`,
        `issue_synthesis_response_count: ${responses.length}`,
      ],
    );
    const executorMetadata = aggregateSynthesisExecutorMetadata(issueOutcomes);
    return {
      outcome: {
        dispatch: aggregateDispatch,
        success: true,
        startedAtMs: aggregateStartedAtMs,
        completedAtMs: Date.now(),
        attemptCount: dispatches.length === 0
          ? 0
          : Math.max(...issueOutcomes.map((outcome) => outcome.attemptCount ?? 0)),
        ...(executorMetadata !== undefined ? { executorMetadata } : {}),
        packetBytes: await fileSizeIfPresent(aggregateDispatch.packet_path),
        outputBytes: await fileSizeIfPresent(aggregateDispatch.output_path),
        childOutcomes: issueOutcomes.filter(
          (outcome): outcome is ExecutionOutcome => outcome !== undefined,
        ),
      },
      issueOutcomes,
    };
  } catch (error) {
    return aggregateFailureOutcome(error);
  }
}

export async function executeReviewPromptExecution(
  params: {
    projectRoot: string;
    sessionRoot: string;
    defaultExecutorConfig: ReviewUnitExecutorConfig;
    teamleadExecutorConfig?: ReviewUnitExecutorConfig;
    synthesizeExecutorConfig?: ReviewUnitExecutorConfig;
    reviewExecutionProfile?: ReviewExecutionProfile | undefined;
    ontoConfig?: OntoConfig;
    unitTimeoutMs?: number;
    continuationPlan?: ReviewContinuationPlan;
  },
): Promise<ReviewPromptExecutionResult> {
  const projectRoot = path.resolve(params.projectRoot);
  const sessionRoot = path.resolve(params.sessionRoot);
  const executionPlanPath = path.join(sessionRoot, "execution-plan.yaml");
  const executionPlan = await readYamlDocument<ReviewExecutionPlan>(executionPlanPath);
  await assertReviewExecutionPlanSessionBoundary({ sessionRoot, executionPlan });
  // Fail-closed A/B boundary (Step 5): onto must not spawn units for a
  // host-orchestrated session. Reject before any dispatch.
  assertRuntimeOrchestratedSession(executionPlan.orchestration);
  const executionStartedAtMs = Date.now();
  const continuationPlan = params.continuationPlan;
  const continuationMode = continuationPlan !== undefined;
  const continuationRunUnitIds = new Set(
    [
      ...(continuationPlan?.frontierUnits ?? []),
      ...(continuationPlan?.downstreamUnits ?? []),
    ]
      .filter((unit) => unit.dispatchDecision === "run")
      .map((unit) => unit.unitId),
  );
  const previousExecutionResult =
    continuationMode && await fileExists(executionPlan.execution_result_path)
      ? await readYamlDocument<ReviewExecutionResultArtifact>(
          executionPlan.execution_result_path,
        )
      : null;
  const previousResultsByUnitId = buildPreviousResultsByUnitId(
    previousExecutionResult,
  );
  const shouldRunUnit = (unitId: string): boolean =>
    !continuationMode || continuationRunUnitIds.has(unitId);
  const preservedOutcomeForDispatch = (
    dispatch: ExecutionDispatchResult,
  ): ExecutionOutcome => {
    const result = previousResultsByUnitId.get(dispatch.unit_id);
    if (!result || result.status !== "completed") {
      throw new Error(
        `Cannot preserve continuation unit without a completed prior result: ${dispatch.unit_id}`,
      );
    }
    return outcomeFromPreviousResult(result);
  };
  if (continuationMode) {
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner continuation mode",
      [
        `frontier_units: ${continuationPlan.frontierUnits.map((unit) => unit.unitId).join(", ")}`,
        `downstream_units: ${continuationPlan.downstreamUnits.map((unit) => unit.unitId).join(", ")}`,
        `preserved_artifact_count: ${continuationPlan.preservedArtifactRefs.length}`,
      ].join("\n"),
    );
  } else {
    await resetExecutionOutputs(executionPlan);
    await pruneGeneratedPromptPacketRefs(executionPlan);
  }
  await ensureReviewContextManifestReadyForDispatch(executionPlan);
  await emitReviewProgress({
    executionPlan,
    step: 1,
    label: "load execution plan",
    details: [`session_id=${executionPlan.session_id}`],
  });
  await appendMarkdownLogEntry(
    executionPlan.error_log_path,
    "runner boundary state",
    renderEffectiveBoundaryStateLog(executionPlan.effective_boundary_state),
  );
  await emitReviewProgress({
    executionPlan,
    step: 2,
    label: "record effective boundary",
    details: [
      `web=${executionPlan.effective_boundary_state.web_research.effective_policy}`,
      `repo=${executionPlan.effective_boundary_state.repo_exploration.effective_policy}`,
    ],
  });

  const defaultExecutorConfig = params.defaultExecutorConfig;
  const teamleadExecutorConfig =
    params.teamleadExecutorConfig ?? defaultExecutorConfig;
  const synthesizeExecutorConfig =
    params.synthesizeExecutorConfig ?? defaultExecutorConfig;
  const unitTimeoutMs = params.unitTimeoutMs ?? DEFAULT_REVIEW_UNIT_TIMEOUT_MS;
  const retryPolicy = retryPolicyFromProfile(params.reviewExecutionProfile);
  const lensDispatches: ExecutionDispatchResult[] =
    executionPlan.lens_prompt_packet_seats.map((seat) => {
      const humanOutputPath = lensHumanOutputPath({
        executionPlan,
        markdownOutputPath: seat.output_path,
      });
      return {
        unit_id: seat.lens_id,
        unit_kind: "lens" as const,
        packet_path: seat.packet_path,
        output_path: lensDispatchOutputPath({
          executionPlan,
          lensId: seat.lens_id,
          markdownOutputPath: seat.output_path,
          sidecarOutputPath: seat.sidecar_output_path,
        }),
        ...(resolvedLensOutputFormat(executionPlan) === "sidecar"
          ? { output_format: "lens-sidecar" as const }
          : {}),
        ...(humanOutputPath ? { human_output_path: humanOutputPath } : {}),
        ...(humanOutputPath
          ? { human_output_ref: path.relative(projectRoot, humanOutputPath) }
          : {}),
      };
    });
  const maxConcurrentLenses = maxConcurrentLensesForProfile({
    profile: params.reviewExecutionProfile,
    plannedLensCount: lensDispatches.length,
  });
  const observedDispatchWidth = maxConcurrentLenses;

  await emitReviewProgress({
    executionPlan,
    step: 3,
    label: "isolated lens execution",
    details: [
      `planned_lens_count=${lensDispatches.length}`,
      `max_concurrent=${maxConcurrentLenses}`,
    ],
  });
  console.log(
    `[review runner] parallel lens dispatch enabled: max_concurrent=${maxConcurrentLenses}`,
  );
  await appendExecutionProgress(
    executionPlan.error_log_path,
    "runner parallel dispatch policy",
    [`max_concurrent_lenses: ${maxConcurrentLenses}`],
  );
  // nested-workers is served by the NestingBatchWorker path below: inner
  // invocations are the SAME unit executors the flat loop spawns, so the
  // structured-output / read-only / bounded-dispatch guarantees that the
  // retired raw-`codex exec` nested path lacked now hold by code sharing.
  // The only remaining fail-closed case is an executor brand without an
  // outer worker realization (direct_call), rejected at the dispatch
  // branch.
  if (
    params.reviewExecutionProfile?.mode === "nested-workers" &&
    params.reviewExecutionProfile.worker_executor !== "codex" &&
    params.reviewExecutionProfile.worker_executor !== "claude_code"
  ) {
    await writeAndThrowStructuredFailureRecord({
      sessionRoot,
      phase: "pre_dispatch.actor_route",
      reasonCode: "nested_workers_executor_unsupported",
      humanMessage:
        "Review execution profile nested-workers requires an external OAuth worker executor (codex or claude_code); direct_call has no outer worker seat.",
      requiredUserAction:
        "Set review.execution.executor to codex or claude_code, or use review.execution.topology=main-workers.",
      retrySafety: "safe_after_input_change",
      artifactTrust: "manifest_artifacts_trusted",
      dispatchState: "dispatch_blocked",
      artifactRefs: {
        execution_plan: path.join(sessionRoot, "execution-plan.yaml"),
      },
      mcpErrorCode: "ONTO_REVIEW_ACTOR_ROUTE_UNAVAILABLE",
      detailsKind: "actor_route",
      details: {
        requested_mode: params.reviewExecutionProfile.mode,
        worker_executor: params.reviewExecutionProfile.worker_executor,
        lens_output_format: resolvedLensOutputFormat(executionPlan),
        write_lens_markdown: executionPlan.write_lens_markdown ?? null,
        max_concurrent_lenses: maxConcurrentLenses,
      },
    });
  }

  const staggerDelayMs = defaultStaggerDelayMsForExecutorConfig(defaultExecutorConfig);
  const maxRetries = retryPolicy.lensMaxRetries;
  const retryInitialDelayMs = retryPolicy.retryInitialDelayMs;

  if (staggerDelayMs > 0) {
    console.log(
      `[review runner] stagger delay: ${staggerDelayMs}ms between successive lens dispatches`,
    );
  }

  const executionOutcomes: Array<ExecutionOutcome | undefined> = new Array(
    lensDispatches.length,
  );
  let nextLensIndex = 0;

  // A-path 스코프 판별을 호이스트: 초기 lens 페이즈가 nested 배치로 가는
  // 조건 (continuation/repair 패스는 항상 flat per-unit 루프).
  const nestedLensWorkerExecutor =
    !continuationMode &&
    params.reviewExecutionProfile?.mode === "nested-workers" &&
    (params.reviewExecutionProfile.worker_executor === "codex" ||
      params.reviewExecutionProfile.worker_executor === "claude_code")
      ? params.reviewExecutionProfile.worker_executor
      : null;
  // 설계 B + §4-1: lens 풀 breaker — flat per-unit 루프(runLensWorker)와 nested
  // 1차 배치의 flat-fallback이 최종 outcome을 관찰 단위로 기록한다. nested
  // 배치-성공 유닛은 실 디스패치가 아니므로 recordItemSkipped로 완료만
  // 집계하고(미기록 시 incomplete로 오집계, 배치-창 생존이 계통 streak을
  // 오리셋하는 것 차단), 배치-실패 유닛의 flat 재시도만 streak을 구동한다.
  const lensBreakerState = reviewDispatchBreakerFromProfile(
    params.reviewExecutionProfile,
    {
      concurrent:
        Math.min(
          maxConcurrentLenses,
          lensDispatches.filter((dispatch) => shouldRunUnit(dispatch.unit_id))
            .length,
        ) > 1,
    },
  );

  async function haltForCancellation(args: {
    cancelRequest: ReviewCancelRequestArtifact;
    phase: string;
    issueArtifactOutcomes?: ExecutionOutcome[];
    deliberationExecutionResults?: ExecutionOutcome[];
    synthesizeOutcome?: ExecutionOutcome | null;
    deliberationStatus?: DeliberationStatus | null;
  }): Promise<ReviewPromptExecutionResult> {
    const completedLensOutcomes = executionOutcomes.filter(isSuccessfulOutcome);
    const successfulLensDispatches = completedLensOutcomes.map(
      (outcome) => outcome.dispatch,
    );
    const executionFailures = executionOutcomes
      .filter(isFailureOutcome)
      .map((outcome) => outcome.failure);
    const degradedLensIds = executionFailures
      .filter((failure) => failure.unit_kind === "lens")
      .map((failure) => failure.unit_id);
    const haltReason = `Review cancelled by MCP request: ${args.cancelRequest.reason}`;
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner cancelled",
      [
        haltReason,
        `requested_at: ${args.cancelRequest.requested_at}`,
        `phase: ${args.phase}`,
      ].join("\n"),
    );
    const executionCompletedAtMs = Date.now();
    await writeExecutionResultArtifact(executionPlan, {
      session_id: executionPlan.session_id,
      session_root: sessionRoot,
      execution_realization: executionPlan.execution_realization,
      host_runtime: executionPlan.host_runtime,
      review_mode: executionPlan.review_mode,
      execution_status: "halted_partial",
      execution_started_at: isoFromTimestamp(executionStartedAtMs),
      execution_completed_at: isoFromTimestamp(executionCompletedAtMs),
      total_duration_ms: Math.max(0, executionCompletedAtMs - executionStartedAtMs),
      max_concurrent_lenses: maxConcurrentLenses,
      observed_dispatch_width: observedDispatchWidth,
      planned_lens_ids: lensDispatches.map((dispatch) => dispatch.unit_id),
      participating_lens_ids: successfulLensDispatches.map(
        (dispatch) => dispatch.unit_id,
      ),
      degraded_lens_ids: degradedLensIds,
      excluded_lens_ids: lensDispatches
        .map((dispatch) => dispatch.unit_id)
        .filter(
          (lensId) =>
            !successfulLensDispatches.some((dispatch) => dispatch.unit_id === lensId) &&
            !degradedLensIds.includes(lensId),
        ),
      executed_lens_count: successfulLensDispatches.length,
      synthesis_executed: false,
      deliberation_status: args.deliberationStatus ?? "not_performed",
      halt_reason: haltReason,
      ...haltArtifactFields("cancellation", null),
      error_log_path: executionPlan.error_log_path,
      lens_completion_barrier_ref:
        executionPlan.lens_completion_barrier_path ??
        path.join(sessionRoot, "lens-completion-barrier.yaml"),
      lens_execution_results: executionOutcomes
        .filter((outcome): outcome is ExecutionOutcome => outcome !== undefined)
        .map(toUnitExecutionResult),
      issue_artifact_execution_results:
        args.issueArtifactOutcomes?.map(toUnitExecutionResult) ?? [],
      deliberation_execution_results:
        args.deliberationExecutionResults?.map(toUnitExecutionResult) ?? [],
      synthesize_execution_result: args.synthesizeOutcome
        ? toUnitExecutionResult(args.synthesizeOutcome)
        : null,
    }, params.reviewExecutionProfile);
    return {
      session_root: sessionRoot,
      executed_lens_count: successfulLensDispatches.length,
      synthesis_output_path: executionPlan.synthesis_output_path,
      participating_lens_ids: successfulLensDispatches.map(
        (dispatch) => dispatch.unit_id,
      ),
      degraded_lens_ids: degradedLensIds,
      synthesis_executed: false,
      error_log_path: executionPlan.error_log_path,
      halt_reason: haltReason,
      ...haltArtifactFields("cancellation", null),
    };
  }

  const initialCancelRequest = await readReviewCancelRequest(sessionRoot);
  if (initialCancelRequest) {
    return haltForCancellation({
      cancelRequest: initialCancelRequest,
      phase: "before_lens_dispatch",
    });
  }

  async function runLensWorker(workerIndex: number): Promise<void> {
    // Stagger initial dispatch to avoid thundering-herd on external APIs.
    // Only the very first dispatch of each worker is staggered; subsequent
    // picks (after a lens completes) are not staggered since the burst has
    // already been spread out by then.
    if (staggerDelayMs > 0 && workerIndex > 0) {
      await sleep(workerIndex * staggerDelayMs);
    }

    while (true) {
      const currentIndex = nextLensIndex;
      nextLensIndex += 1;
      if (currentIndex >= lensDispatches.length) {
        return;
      }

      const dispatch = lensDispatches[currentIndex];
      if (!dispatch) {
        return;
      }
      if (await readReviewCancelRequest(sessionRoot)) {
        return;
      }
      if (!shouldRunUnit(dispatch.unit_id)) {
        // preserved/continuation 유닛은 breaker에 기록하지 않는다 — planned
        // 집합 자체가 "이번 run이 실제 디스패치하는 유닛"으로 계산된다.
        // 트립 여부와 무관하게 기록한다: 디스패치가 필요 없는 완료 증거를
        // 빼먹으면 barrier/execution-result가 완료 lens를 missing으로
        // 기록해 다음 continuation이 이미 완료된 lens를 재디스패치한다.
        executionOutcomes[currentIndex] = preservedOutcomeForDispatch(dispatch);
        continue;
      }
      // 설계 B: 트립 이후 새 lens를 디스패치하지 않는다 — 남은 실행 유닛은
      // 미디스패치로 incomplete 집합에 남아 회복 재디스패치 대상이 된다
      // (규칙 5). return이 아닌 continue: 뒤 인덱스의 preserved 유닛 기록을
      // 마저 소진해야 한다.
      if (lensBreakerState?.tripped()) {
        continue;
      }
      console.log(`[review runner] starting ${dispatch.unit_kind}: ${dispatch.unit_id}`);
      await appendExecutionProgress(
        executionPlan.error_log_path,
        `runner dispatch started: ${dispatch.unit_id}`,
        [
          `unit_id: ${dispatch.unit_id}`,
          `unit_kind: ${dispatch.unit_kind}`,
          `packet_path: ${dispatch.packet_path}`,
          `output_path: ${dispatch.output_path}`,
        ],
      );

      const startedAtMs = Date.now();
      let lastError: unknown = undefined;
      let succeeded = false;
      let executorMetadata: ReviewExecutorRunMetadata | undefined = undefined;
      let attemptsUsed = 0;
      const effectiveMaxRetries = maxRetriesForDispatch({
        profile: params.reviewExecutionProfile,
        dispatch,
        fallback: maxRetries,
      });
      const effectiveRetryInitialDelayMs = retryInitialDelayMsForDispatch({
        profile: params.reviewExecutionProfile,
        dispatch,
        fallback: retryInitialDelayMs,
      });
      const effectiveUnitTimeoutMs = timeoutMsForDispatch({
        profile: params.reviewExecutionProfile,
        dispatch,
        fallback: unitTimeoutMs,
      });

      for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
        attemptsUsed = attempt + 1;
        try {
          executorMetadata = await invokeExecutor(
            defaultExecutorConfig,
            projectRoot,
            sessionRoot,
            executionPlan,
            dispatch,
            retryTimeoutMs(effectiveUnitTimeoutMs, attempt),
            params.reviewExecutionProfile,
          );
          succeeded = true;
          break;
        } catch (error: unknown) {
          lastError = error;
          if (
            shouldRetryUnitFailure({
              error,
              attempt,
              maxRetries: effectiveMaxRetries,
              dispatch,
              reviewExecutionProfile: params.reviewExecutionProfile,
            })
          ) {
            const retryDelay = effectiveRetryInitialDelayMs * (attempt + 1);
            console.log(
              `[review runner] ${dispatch.unit_id} attempt ${attempt + 1} failed, retrying in ${retryDelay}ms...`,
            );
            await appendExecutionProgress(
              executionPlan.error_log_path,
              `runner dispatch retry: ${dispatch.unit_id}`,
              [
                `attempt: ${attempt + 1}/${effectiveMaxRetries}`,
                `retry_delay_ms: ${retryDelay}`,
                `error: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`,
              ],
            );
            await sleep(retryDelay);
          }
          if (
            !shouldRetryUnitFailure({
              error,
              attempt,
              maxRetries: effectiveMaxRetries,
              dispatch,
              reviewExecutionProfile: params.reviewExecutionProfile,
            })
          ) break;
        }
      }

      if (succeeded) {
        const completedAtMs = Date.now();
        console.log(`[review runner] completed ${dispatch.unit_kind}: ${dispatch.unit_id}`);
        await appendExecutionProgress(
          executionPlan.error_log_path,
          `runner dispatch completed: ${dispatch.unit_id}`,
          [
            `unit_id: ${dispatch.unit_id}`,
            `unit_kind: ${dispatch.unit_kind}`,
            `output_path: ${dispatch.output_path}`,
          ],
        );
        executionOutcomes[currentIndex] = {
          dispatch,
          success: true,
          startedAtMs,
          completedAtMs,
          attemptCount: attemptsUsed,
          ...(executorMetadata !== undefined ? { executorMetadata } : {}),
          packetBytes: await fileSizeIfPresent(dispatch.packet_path),
          outputBytes: await fileSizeIfPresent(dispatch.output_path),
        };
        // 실 디스패치 성공만 프로바이더 생존 증거다 (breaker 규칙 2).
        lensBreakerState?.recordItemSuccess(dispatch.unit_id);
      } else {
        const completedAtMs = Date.now();
        const failure: ExecutionFailure = {
          unit_id: dispatch.unit_id,
          unit_kind: dispatch.unit_kind,
          packet_path: dispatch.packet_path,
          output_path: dispatch.output_path,
          message: lastError instanceof Error ? lastError.message : String(lastError),
          failure_kind: failureKindFromError(lastError),
        };
        const packetBytes = await fileSizeIfPresent(dispatch.packet_path);
        const outputBytes = await fileSizeIfPresent(dispatch.output_path);
        await removeFileIfExists(dispatch.output_path);
        await appendExecutionFailure(
          executionPlan.error_log_path,
          failure,
          executionPlan.effective_boundary_state,
        );
        const outcome: ExecutionOutcome = {
          dispatch,
          success: false,
          startedAtMs,
          completedAtMs,
          attemptCount: attemptsUsed,
          packetBytes,
          outputBytes,
          failure,
        };
        executionOutcomes[currentIndex] = outcome;
        // 유닛의 최종 실패(per-unit retry 소진)를 관찰 단위로 기록. 계통
        // 클래스가 아니면(dead-letter) streak에 닿지 않고, 트립 여부는 루프
        // 상단 체크가 소비한다 — halt는 배리어 뒤 epilogue가 수행.
        lensBreakerState?.recordItemFailure({
          item_id: dispatch.unit_id,
          failure_class: reviewSystemicFailureClassFromOutcome(outcome),
          failure_message: failure.message,
          attempt_count: attemptsUsed,
        });
      }
    }
  }

  // Nested batch dispatch covers the initial lens phase only (A-path
  // scope). Continuation/repair passes re-dispatch remaining units through
  // the flat per-unit loop — same unit-executor invocation, same artifact
  // contract, so the seat truth is identical either way.
  if (nestedLensWorkerExecutor !== null) {
    const nestedBrand =
      nestedLensWorkerExecutor === "codex"
        ? ("codex" as const)
        : ("claude" as const);
    console.log(
      `[review runner] mode=nested-workers worker_executor=${nestedLensWorkerExecutor}`,
    );
    await appendExecutionProgress(
      executionPlan.error_log_path,
      "runner profile dispatch: nested-workers",
      [
        `teamlead_seat: ${params.reviewExecutionProfile?.teamlead.seat}`,
        `lens_seat: ${params.reviewExecutionProfile?.lens.seat}`,
        `worker_executor: ${nestedLensWorkerExecutor}`,
        `planned_lens_count: ${lensDispatches.length}`,
      ],
    );
    const nestedStartedAtMs = Date.now();
    // Parity by construction: nested units reuse the SAME flat dispatch
    // list (canonical seat paths, output-format, human ref) and the SAME
    // effective unit-executor config (LLM overrides included) the flat
    // loop would spawn — the nested worker only changes who fans out.
    const firstLensDispatch = lensDispatches[0];
    if (!firstLensDispatch) {
      throw new Error("nested-workers dispatch requires at least one lens");
    }
    const nestedLensExecutorConfig = executorConfigWithUnitSettings({
      executorConfig: defaultExecutorConfig,
      dispatch: firstLensDispatch,
      profile: params.reviewExecutionProfile,
    });
    const nestedLensUnitTimeoutMs = timeoutMsForDispatch({
      profile: params.reviewExecutionProfile,
      dispatch: firstLensDispatch,
      fallback: unitTimeoutMs,
    });
    const nestedUnits = lensDispatches.map((dispatch) => ({
      unit_id: dispatch.unit_id,
      unit_kind: dispatch.unit_kind,
      packet_path: dispatch.packet_path,
      output_path: dispatch.output_path,
      extra_args: [
        ...(dispatch.output_format && dispatch.output_format !== "markdown"
          ? ["--output-format", dispatch.output_format]
          : []),
        ...(dispatch.human_output_ref
          ? ["--human-output-ref", dispatch.human_output_ref]
          : []),
        // Self-enforced per-unit timeout — a hung inner must not hold its
        // wave's barrier and burn the outer's multi-wave budget.
        "--timeout-ms",
        String(nestedLensUnitTimeoutMs),
      ],
    }));
    // Concurrency parity with the flat lens pool: waves are capped at
    // maxConcurrentLenses; the outer timeout is a backstop covering every
    // wave plus startup overhead (per-unit hangs bound themselves above).
    const nestedLensWidth = Math.max(
      1,
      Math.min(maxConcurrentLenses, lensDispatches.length),
    );
    const nestedLensWaveCount = Math.ceil(
      lensDispatches.length / nestedLensWidth,
    );
    const nestedResult = await executeReviewViaNestedBatch({
      brand: nestedBrand,
      sessionRoot,
      projectRoot,
      ontoConfig: params.ontoConfig ?? {},
      units: nestedUnits,
      inner_executor: nestedLensExecutorConfig,
      dispatch_width: nestedLensWidth,
      timeout_ms: nestedLensUnitTimeoutMs * nestedLensWaveCount + 60_000,
    });
    const nestedCompletedAtMs = Date.now();
    // Map nested-dispatch outcomes into executionOutcomes[] in lensDispatches order.
    // `participating_lens_ids` is the nested bridge's candidate success set
    // (orchestrator ok AND output file exists + non-empty). The parent runner
    // still applies its local output-contract validator before admitting a lens
    // as participating so every execution profile shares the same sink gate.
    // Retry semantics mirror flat: the batch is attempt #1; a lens that
    // failed in the batch (or failed local validation) spends the remaining
    // budget through the flat per-unit loop (invokeExecutor validates
    // internally, so retried successes are already contract-checked).
    // Explicit zero-retry finalizes the batch failure without a second
    // attempt.
    for (let i = 0; i < lensDispatches.length; i += 1) {
      const dispatch = lensDispatches[i]!;
      const reported = nestedResult.nested_raw.outcomes[i];
      const participating = nestedResult.participating_lens_ids.includes(
        dispatch.unit_id,
      );
      let batchFailureMessage: string | undefined;
      if (participating) {
        try {
          await validateUnitOutputFile({
            dispatch,
            outputPath: dispatch.output_path,
            executionPlan,
            reviewExecutionProfile: params.reviewExecutionProfile,
          });
          console.log(`[review runner] completed ${dispatch.unit_kind}: ${dispatch.unit_id}`);
          await appendExecutionProgress(
            executionPlan.error_log_path,
            `runner nested dispatch completed: ${dispatch.unit_id}`,
            [
              `unit_id: ${dispatch.unit_id}`,
              `unit_kind: ${dispatch.unit_kind}`,
              `output_path: ${dispatch.output_path}`,
            ],
          );
          const okOutcome: ExecutionOutcome = {
            dispatch,
            success: true,
            startedAtMs: nestedStartedAtMs,
            completedAtMs: nestedCompletedAtMs,
            attemptCount: 1,
            nestedBatchWindow: true,
            packetBytes: await fileSizeIfPresent(dispatch.packet_path),
            outputBytes: await fileSizeIfPresent(dispatch.output_path),
          };
          executionOutcomes[i] = okOutcome;
          // §4-1: 배치-성공은 실 디스패치가 아니다 — 헬퍼가 skipped로 완료만
          // 집계(계통 streak 불변). 미기록 시 incomplete로 오집계된다.
          if (lensBreakerState) {
            recordNestedUnitOutcomeToBreaker(lensBreakerState, okOutcome);
          }
          continue;
        } catch (error) {
          batchFailureMessage =
            error instanceof Error ? error.message : String(error);
        }
      } else {
        batchFailureMessage =
          reported?.status === "fail" && reported.error
            ? reported.error
            : nestedResult.halt_reason ??
              "nested worker dispatch failed (output missing or orchestrator rejected)";
      }

      const effectiveLensMaxRetries = maxRetriesForDispatch({
        profile: params.reviewExecutionProfile,
        dispatch,
        fallback: maxRetries,
      });
      if (effectiveLensMaxRetries >= 1) {
        // §4-1: 트립 이후에는 새 flat 재시도를 디스패치하지 않는다 — 이 유닛은
        // 미디스패치로 incomplete 집합에 남아 회복 재디스패치 대상이 된다
        // (규칙 5). 앞선 배치-성공 유닛은 이미 skipped로 기록됐다.
        if (lensBreakerState?.tripped()) continue;
        // Batch consumed attempt #1 — clear the dead seat and spend the
        // remaining budget through the flat loop (same executor config
        // derivation as the flat lens path: invokeExecutor applies the
        // per-unit settings itself).
        await removeFileIfExists(dispatch.output_path);
        await appendExecutionProgress(
          executionPlan.error_log_path,
          `runner nested dispatch retrying flat: ${dispatch.unit_id}`,
          [
            `batch_failure: ${batchFailureMessage}`,
            `remaining_max_retries: ${effectiveLensMaxRetries - 1}`,
          ],
        );
        const flatOutcome = await runSingleDispatchWithRetries({
          projectRoot,
          sessionRoot,
          executionPlan,
          executorConfig: defaultExecutorConfig,
          dispatch,
          maxRetries,
          retryInitialDelayMs,
          unitTimeoutMs,
          reviewExecutionProfile: params.reviewExecutionProfile,
          maxRetriesOverride: effectiveLensMaxRetries - 1,
        });
        executionOutcomes[i] = flatOutcome;
        // flat 재시도는 실 디스패치 관측이다 — 성공/실패를 breaker에 반영
        // (§4-1; flatOutcome은 배치-창 태그가 없어 skipped로 빠지지 않는다).
        // lens 트립 halt는 배리어 뒤 epilogue가 tripped()로 수행하므로 반환
        // trip은 소비하지 않는다.
        if (lensBreakerState) {
          recordNestedUnitOutcomeToBreaker(lensBreakerState, flatOutcome);
        }
        continue;
      }

      const failure: ExecutionFailure = {
        unit_id: dispatch.unit_id,
        unit_kind: dispatch.unit_kind,
        packet_path: dispatch.packet_path,
        output_path: dispatch.output_path,
        message: batchFailureMessage ?? "nested worker dispatch failed",
        failure_kind: failureKindFromMessage(batchFailureMessage ?? ""),
      };
      const packetBytes = await fileSizeIfPresent(dispatch.packet_path);
      const outputBytes = await fileSizeIfPresent(dispatch.output_path);
      await removeFileIfExists(dispatch.output_path);
      await appendExecutionFailure(
        executionPlan.error_log_path,
        failure,
        executionPlan.effective_boundary_state,
      );
      const failureOutcome: ExecutionOutcome = {
        dispatch,
        success: false,
        startedAtMs: nestedStartedAtMs,
        completedAtMs: nestedCompletedAtMs,
        attemptCount: 1,
        packetBytes,
        outputBytes,
        failure,
      };
      executionOutcomes[i] = failureOutcome;
      // §4-1 (교차검증 F2/Finding A): zero-retry 배치 실패는 flat 경로처럼
      // 실패로 기록한다 — 검증 실패(item-local)는 dead-letter, 계통 실패는
      // 회복 victim(incomplete). skipped(완료 오집계)가 아니다.
      if (lensBreakerState) {
        recordNestedUnitOutcomeToBreaker(lensBreakerState, failureOutcome);
      }
    }
    // Capture outer teamlead halt_reason for the post-dispatch halt check
    // (synthesize may still run if enough lenses participated, matching the
    // worker-pool semantics).
    if (nestedResult.halt_reason) {
      await appendExecutionProgress(
        executionPlan.error_log_path,
        "runner nested teamlead halt",
        [nestedResult.halt_reason],
      );
    }
  } else {
    await Promise.all(
      Array.from(
        { length: Math.min(maxConcurrentLenses, lensDispatches.length) },
        async (_, workerIndex) => runLensWorker(workerIndex),
      ),
    );
  }

  // 설계 B 규칙 6: breaker-ON lens 배치는 트립이든 완주든 end-state를
  // 영속한다 — 회복 절차가 항상 정확한 재디스패치 집합을 갖는다.
  let lensDispatchIncompletePath: string | null = null;
  if (lensBreakerState) {
    lensDispatchIncompletePath = await persistReviewDispatchIncompleteArtifact({
      sessionRoot,
      batchLabel: "lens",
      plannedItemIds: lensDispatches
        .filter((dispatch) => shouldRunUnit(dispatch.unit_id))
        .map((dispatch) => dispatch.unit_id),
      state: lensBreakerState,
    });
  }

  const postLensCancelRequest = await readReviewCancelRequest(sessionRoot);
  if (postLensCancelRequest) {
    return haltForCancellation({
      cancelRequest: postLensCancelRequest,
      phase: "after_lens_dispatch",
    });
  }

  const successfulLensDispatches = executionOutcomes
    .filter(isSuccessfulOutcome)
    .map((outcome) => outcome.dispatch);
  const executionFailures = executionOutcomes
    .filter(isFailureOutcome)
    .map((outcome) => outcome.failure);
  const minimumParticipatingLenses =
    resolveRequiredParticipatingLensCount(executionPlan);
  const lensCompletionBarrier = await writeLensCompletionBarrier({
    executionPlan,
    observedDispatchWidth,
    minimumParticipatingLenses,
    lensDispatches,
    successfulLensDispatches,
    executionFailures,
  });

  // 설계 B 규칙 4: lens 트립은 배리어 판정과 무관하게 무조건 halt한다
  // (트립 시점 이후 유닛은 미디스패치라 배리어가 우연히 downstream을 허용해도
  // 배치는 이미 불완전하다). 배리어 아티팩트는 위에서 정상 기록되어
  // continuation frontier가 미완료 lens를 재제안할 수 있다. lens 풀은
  // 실패를 throw하지 않고 outcome으로만 기록하므로(전파 캐치 없음), 트립
  // halt도 기존 배리어 halt와 같은 구조화 블록으로 수행한다.
  const lensBreakerTrip = lensBreakerState?.tripped() ?? null;
  if (lensBreakerTrip !== null || !lensCompletionBarrier.downstream_allowed) {
    const haltReason =
      lensBreakerTrip !== null
        ? reviewDispatchBreakerHaltReason(
            lensBreakerTrip,
            lensDispatchIncompletePath ??
              dispatchIncompleteArtifactPath(sessionRoot),
          )
        : successfulLensDispatches.length === 0
          ? "No participating lens outputs were produced."
          : `Selected lens completion barrier failed: ${lensCompletionBarrier.completed_lens_ids.length}/${lensCompletionBarrier.planned_lens_ids.length} planned lenses completed.`;
    const haltPhase =
      lensBreakerTrip !== null ? "lens_dispatch_breaker" : "lens_completion_barrier";
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner halted before synthesize",
      `${haltReason}\n\n[effective_boundary_state]\n${renderEffectiveBoundaryStateLog(
        executionPlan.effective_boundary_state,
      )}`,
    );
    const degradedLensIds = executionFailures
      .filter((failure) => failure.unit_kind === "lens")
      .map((failure) => failure.unit_id);
    const executionCompletedAtMs = Date.now();
    await writeExecutionResultArtifact(executionPlan, {
      session_id: executionPlan.session_id,
      session_root: sessionRoot,
      execution_realization: executionPlan.execution_realization,
      host_runtime: executionPlan.host_runtime,
      review_mode: executionPlan.review_mode,
      execution_status: deriveExecutionStatus({
        synthesisExecuted: false,
        degradedLensIds,
      }),
      execution_started_at: isoFromTimestamp(executionStartedAtMs),
      execution_completed_at: isoFromTimestamp(executionCompletedAtMs),
      total_duration_ms: Math.max(0, executionCompletedAtMs - executionStartedAtMs),
      max_concurrent_lenses: maxConcurrentLenses,
      observed_dispatch_width: observedDispatchWidth,
      planned_lens_ids: lensDispatches.map((dispatch) => dispatch.unit_id),
      participating_lens_ids: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
      degraded_lens_ids: degradedLensIds,
      excluded_lens_ids: lensDispatches
        .map((dispatch) => dispatch.unit_id)
        .filter(
          (lensId) =>
            !successfulLensDispatches.some((dispatch) => dispatch.unit_id === lensId) &&
            !degradedLensIds.includes(lensId),
        ),
      executed_lens_count: successfulLensDispatches.length,
      synthesis_executed: false,
      deliberation_status: "not_performed",
      halt_reason: haltReason,
      ...haltArtifactFields(haltPhase, null),
      error_log_path: executionPlan.error_log_path,
      lens_completion_barrier_ref:
        executionPlan.lens_completion_barrier_path ??
        path.join(sessionRoot, "lens-completion-barrier.yaml"),
      lens_execution_results: executionOutcomes
        .filter((outcome): outcome is ExecutionOutcome => outcome !== undefined)
        .map(toUnitExecutionResult),
      synthesize_execution_result: null,
    }, params.reviewExecutionProfile);
    return {
      session_root: sessionRoot,
      executed_lens_count: successfulLensDispatches.length,
      synthesis_output_path: executionPlan.synthesis_output_path,
      participating_lens_ids: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
      degraded_lens_ids: executionFailures
        .filter((failure) => failure.unit_kind === "lens")
        .map((failure) => failure.unit_id),
      synthesis_executed: false,
      error_log_path: executionPlan.error_log_path,
      halt_reason: haltReason,
      ...haltArtifactFields(haltPhase, null),
    };
  }

  const issueArtifactOutcomes: ExecutionOutcome[] = [];
  const lensOutputPaths = successfulLensDispatches.map(
    (dispatch) => dispatch.output_path,
  );
  const haltAfterIssueArtifactFailure = async (args: {
    error: unknown;
    deliberationStatus: DeliberationStatus | null;
    deliberationExecutionResults?: ExecutionOutcome[];
  }): Promise<ReviewPromptExecutionResult> => {
    // 설계 B 트립: halt 시점까지의 배치 outcome 전체(완료 포함)를 결과
    // 아티팩트에 보존한다 — 완료 stance 유닛 행이 없으면 continuation
    // ledger가 missing으로 도출해 이미 지불한 완료분을 재디스패치한다.
    const batchOutcomes =
      args.error instanceof ReviewIssueArtifactDispatchError
        ? args.error.batchOutcomes
        : [];
    for (const outcome of batchOutcomes) {
      if (
        !issueArtifactOutcomes.some(
          (existing) => existing.dispatch.unit_id === outcome.dispatch.unit_id,
        )
      ) {
        issueArtifactOutcomes.push(outcome);
      }
    }
    const failureOutcome = issueArtifactOutcomeFromError(args.error);
    if (
      failureOutcome &&
      !issueArtifactOutcomes.some(
        (outcome) => outcome.dispatch.unit_id === failureOutcome.dispatch.unit_id,
      )
    ) {
      issueArtifactOutcomes.push(failureOutcome);
    }
    const failureMessage = errorMessage(args.error);
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner halted during issue artifact generation",
      failureMessage,
    );
    const degradedLensIds = executionFailures
      .filter((failure) => failure.unit_kind === "lens")
      .map((failure) => failure.unit_id);
    const executionCompletedAtMs = Date.now();
    const haltReasonOverride =
      args.error instanceof ReviewIssueArtifactDispatchError
        ? args.error.haltReason
        : null;
    const haltReason =
      haltReasonOverride ?? `Issue artifact generation failed: ${failureMessage}`;
    await writeExecutionResultArtifact(executionPlan, {
      session_id: executionPlan.session_id,
      session_root: sessionRoot,
      execution_realization: executionPlan.execution_realization,
      host_runtime: executionPlan.host_runtime,
      review_mode: executionPlan.review_mode,
      execution_status: deriveExecutionStatus({
        synthesisExecuted: false,
        degradedLensIds,
      }),
      execution_started_at: isoFromTimestamp(executionStartedAtMs),
      execution_completed_at: isoFromTimestamp(executionCompletedAtMs),
      total_duration_ms: Math.max(0, executionCompletedAtMs - executionStartedAtMs),
      max_concurrent_lenses: maxConcurrentLenses,
      observed_dispatch_width: observedDispatchWidth,
      planned_lens_ids: lensDispatches.map((dispatch) => dispatch.unit_id),
      participating_lens_ids: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
      degraded_lens_ids: degradedLensIds,
      excluded_lens_ids: lensDispatches
        .map((dispatch) => dispatch.unit_id)
        .filter(
          (lensId) =>
            !successfulLensDispatches.some((dispatch) => dispatch.unit_id === lensId) &&
            !degradedLensIds.includes(lensId),
        ),
      executed_lens_count: successfulLensDispatches.length,
      synthesis_executed: false,
      deliberation_status: args.deliberationStatus,
      halt_reason: haltReason,
      ...haltArtifactFields("issue_artifact", failureOutcome),
      error_log_path: executionPlan.error_log_path,
      lens_completion_barrier_ref:
        executionPlan.lens_completion_barrier_path ??
        path.join(sessionRoot, "lens-completion-barrier.yaml"),
      lens_execution_results: executionOutcomes
        .filter((outcome): outcome is ExecutionOutcome => outcome !== undefined)
        .map(toUnitExecutionResult),
      issue_artifact_execution_results:
        issueArtifactOutcomes.map(toUnitExecutionResult),
      deliberation_execution_results:
        args.deliberationExecutionResults?.map(toUnitExecutionResult) ?? [],
      synthesize_execution_result: null,
    }, params.reviewExecutionProfile);
    const originalError =
      args.error instanceof ReviewIssueArtifactDispatchError
        ? args.error.originalError
        : args.error;
    if (originalError instanceof ReviewStructuredFailureError) {
      throw originalError;
    }
    return {
      session_root: sessionRoot,
      executed_lens_count: successfulLensDispatches.length,
      synthesis_output_path: executionPlan.synthesis_output_path,
      participating_lens_ids: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
      degraded_lens_ids: degradedLensIds,
      synthesis_executed: false,
      error_log_path: executionPlan.error_log_path,
      halt_reason: haltReason,
      ...haltArtifactFields("issue_artifact", failureOutcome),
    };
  };
  // ---------------------------------------------------------------------
  // 4f F3 — frontier-driven post-lens sequencing. The shared ledger/
  // frontier decides WHAT runs next; the existing stage handlers execute
  // it and the existing composition/halt blocks remain the artifact
  // authority. Mid-loop engine merges exist only so the frontier can
  // advance — every halt/final path still batch-writes A's enriched
  // artifact, overwriting the mid-run engine-shaped state.
  // ---------------------------------------------------------------------
  await seedLensResultsForFrontier({
    sessionRoot,
    executionPlan,
    outcomes: executionOutcomes.filter(
      (outcome): outcome is ExecutionOutcome => outcome !== undefined,
    ),
  });

  let controlledDeliberation!: Awaited<
    ReturnType<typeof runControlledLensDeliberation>
  >;
  let deliberationStageRan = false;
  let synthesizeOutcome!: ExecutionOutcome;
  let synthesizeStageRan = false;
  const routedFrontierStages = new Set<string>();

  const runPreDeliberationArtifactStage = async (
    artifactId: ReviewIssueArtifactId,
  ): Promise<ReviewPromptExecutionResult | null> => {
    const cancelRequest = await readReviewCancelRequest(sessionRoot);
    if (cancelRequest) {
      return haltForCancellation({
        cancelRequest,
        phase: `before_issue_artifact:${artifactId}`,
        issueArtifactOutcomes,
      });
    }
    if (!shouldRunUnit(artifactId)) {
      issueArtifactOutcomes.push(
        preservedOutcomeForDispatch({
          unit_id: artifactId,
          unit_kind: "issue_artifact",
          packet_path:
            executionPlan.issue_artifact_prompt_packet_seats.find(
              (seat) => seat.artifact_id === artifactId,
            )?.packet_path ??
            path.join(
              executionPlan.prompt_packets_root,
              issueArtifactSpec(artifactId).prompt_packet_file_name,
            ),
          output_path: issueArtifactOutputPath(executionPlan, artifactId),
        }),
      );
      return null;
    }
    try {
      issueArtifactOutcomes.push(await runIssueArtifactDispatch({
        projectRoot,
        sessionRoot,
        executionPlan,
        executorConfig:
          artifactId === "issue-stance-matrix"
            ? defaultExecutorConfig
            : teamleadExecutorConfig,
        artifactId,
        lensOutputPaths,
        unitTimeoutMs,
        retryPolicy,
        reviewExecutionProfile: params.reviewExecutionProfile,
        // Continuation: stance 수집 스테이지가 run-owing 유닛만 디스패치하고
        // 완료 유닛은 prior result에서 복원한다 (규칙 5 — 회복 재디스패치
        // 집합 == 미완료 집합).
        ...(continuationMode
          ? {
              runUnitIds: continuationRunUnitIds,
              preservedResultsByUnitId: previousResultsByUnitId,
            }
          : {}),
      }));
      return null;
    } catch (error) {
      return haltAfterIssueArtifactFailure({
        error,
        deliberationStatus: "not_performed",
      });
    }
  };

  const runDeliberationStage = async (): Promise<ReviewPromptExecutionResult | null> => {
    routedFrontierStages.add("deliberation");
    const preDeliberationCancelRequest = await readReviewCancelRequest(sessionRoot);
    if (preDeliberationCancelRequest) {
      return haltForCancellation({
        cancelRequest: preDeliberationCancelRequest,
        phase: "before_controlled_deliberation",
        issueArtifactOutcomes,
      });
    }
    try {
      controlledDeliberation = await runControlledLensDeliberation({
        projectRoot,
        sessionRoot,
        executionPlan,
        lensExecutorConfig: defaultExecutorConfig,
        teamleadExecutorConfig,
        successfulLensDispatches,
        maxConcurrentLenses,
        unitTimeoutMs,
        retryPolicy,
        reviewExecutionProfile: params.reviewExecutionProfile,
        ...(continuationMode
          ? {
              runUnitIds: continuationRunUnitIds,
              preservedResultsByUnitId: previousResultsByUnitId,
            }
          : {}),
      });
      deliberationStageRan = true;
      return null;
    } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    const deliberationExecutionOutcomes =
      controlledDeliberationOutcomesFromError(error);
    const failedDeliberationOutcome =
      controlledDeliberationFailedOutcomeFromError(error);
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner halted during controlled deliberation",
      [
        failureMessage,
        "",
        "halt_phase: controlled_lens_deliberation",
        `halt_unit_id: ${failedDeliberationOutcome?.dispatch.unit_id ?? "unknown"}`,
        `halt_unit_kind: ${failedDeliberationOutcome?.dispatch.unit_kind ?? "unknown"}`,
        `halt_lens_id: ${haltLensIdFromOutcome(failedDeliberationOutcome) ?? "none"}`,
      ].join("\n"),
    );
    const degradedLensIds = executionFailures
      .filter((failure) => failure.unit_kind === "lens")
      .map((failure) => failure.unit_id);
    const executionCompletedAtMs = Date.now();
    await writeExecutionResultArtifact(executionPlan, {
      session_id: executionPlan.session_id,
      session_root: sessionRoot,
      execution_realization: executionPlan.execution_realization,
      host_runtime: executionPlan.host_runtime,
      review_mode: executionPlan.review_mode,
      execution_status: deriveExecutionStatus({
        synthesisExecuted: false,
        degradedLensIds,
      }),
      execution_started_at: isoFromTimestamp(executionStartedAtMs),
      execution_completed_at: isoFromTimestamp(executionCompletedAtMs),
      total_duration_ms: Math.max(0, executionCompletedAtMs - executionStartedAtMs),
      max_concurrent_lenses: maxConcurrentLenses,
      observed_dispatch_width: observedDispatchWidth,
      planned_lens_ids: lensDispatches.map((dispatch) => dispatch.unit_id),
      participating_lens_ids: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
      degraded_lens_ids: degradedLensIds,
      excluded_lens_ids: lensDispatches
        .map((dispatch) => dispatch.unit_id)
        .filter(
          (lensId) =>
            !successfulLensDispatches.some((dispatch) => dispatch.unit_id === lensId) &&
            !degradedLensIds.includes(lensId),
        ),
      executed_lens_count: successfulLensDispatches.length,
      synthesis_executed: false,
      deliberation_status: "not_performed",
      halt_reason: `Controlled lens deliberation failed: ${failureMessage}`,
      ...haltArtifactFields(
        "controlled_lens_deliberation",
        failedDeliberationOutcome,
      ),
      error_log_path: executionPlan.error_log_path,
      lens_completion_barrier_ref:
        executionPlan.lens_completion_barrier_path ??
        path.join(sessionRoot, "lens-completion-barrier.yaml"),
      lens_execution_results: executionOutcomes
        .filter((outcome): outcome is ExecutionOutcome => outcome !== undefined)
        .map(toUnitExecutionResult),
      issue_artifact_execution_results:
        issueArtifactOutcomes.map(toUnitExecutionResult),
      deliberation_execution_results:
        deliberationExecutionOutcomes.map(toUnitExecutionResult),
      synthesize_execution_result: null,
    }, params.reviewExecutionProfile);
    return {
      session_root: sessionRoot,
      executed_lens_count: successfulLensDispatches.length,
      synthesis_output_path: executionPlan.synthesis_output_path,
      participating_lens_ids: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
      degraded_lens_ids: degradedLensIds,
      synthesis_executed: false,
      error_log_path: executionPlan.error_log_path,
      halt_reason: `Controlled lens deliberation failed: ${failureMessage}`,
      ...haltArtifactFields(
        "controlled_lens_deliberation",
        failedDeliberationOutcome,
      ),
    };
    }
  };

  const runProblemFramingStage = async (): Promise<ReviewPromptExecutionResult | null> => {
  if (!shouldRunUnit("problem-framing")) {
    issueArtifactOutcomes.push(
      preservedOutcomeForDispatch({
        unit_id: "problem-framing",
        unit_kind: "issue_artifact",
        packet_path:
          executionPlan.issue_artifact_prompt_packet_seats.find(
            (seat) => seat.artifact_id === "problem-framing",
          )?.packet_path ??
          path.join(
            executionPlan.prompt_packets_root,
            issueArtifactSpec("problem-framing").prompt_packet_file_name,
          ),
        output_path: executionPlan.problem_framing_path,
      }),
    );
  } else {
    try {
      issueArtifactOutcomes.push(await runIssueArtifactDispatch({
        projectRoot,
        sessionRoot,
        executionPlan,
        executorConfig: teamleadExecutorConfig,
        artifactId: "problem-framing",
        lensOutputPaths,
        deliberationResponsePaths:
          controlledDeliberation.deliberationDispatches.map(
            (dispatch) => dispatch.output_path,
          ),
        deliberationOutputPath:
          controlledDeliberation.teamleadOutcome.dispatch.output_path,
        problemFramingProfileRef: await resolveProblemFramingProfileRef({
          projectRoot,
          executionPlan,
        }),
        unitTimeoutMs,
        retryPolicy,
        reviewExecutionProfile: params.reviewExecutionProfile,
      }));
    } catch (error) {
      return haltAfterIssueArtifactFailure({
        error,
        deliberationStatus: "performed",
        deliberationExecutionResults: [
          ...controlledDeliberation.deliberationOutcomes,
          controlledDeliberation.teamleadOutcome,
        ],
      });
    }
  }
    return null;
  };

  const synthesizeDispatch: ExecutionDispatchResult = {
    unit_id: "synthesize",
    unit_kind: "synthesize",
    packet_path: synthesisWorkItemsPath(sessionRoot),
    output_path: synthesisLedgerPath(sessionRoot),
  };

  const runSynthesizeStage = async (): Promise<ReviewPromptExecutionResult | null> => {
  const preSynthesizeCancelRequest = await readReviewCancelRequest(sessionRoot);
  if (preSynthesizeCancelRequest) {
    return haltForCancellation({
      cancelRequest: preSynthesizeCancelRequest,
      phase: "before_synthesize",
      issueArtifactOutcomes,
      deliberationExecutionResults: [
        ...controlledDeliberation.deliberationOutcomes,
        controlledDeliberation.teamleadOutcome,
      ],
      deliberationStatus: "performed",
    });
  }

  synthesizeStageRan = true;
  if (shouldRunUnit("synthesize")) {
    console.log("[review runner] starting synthesize map-reduce: synthesize");
    await appendExecutionProgress(
      executionPlan.error_log_path,
      "runner dispatch started: synthesize",
      [
        `unit_id: ${synthesizeDispatch.unit_id}`,
        `unit_kind: ${synthesizeDispatch.unit_kind}`,
        `work_items_path: ${synthesizeDispatch.packet_path}`,
        `ledger_path: ${synthesizeDispatch.output_path}`,
        `projection_path: ${executionPlan.synthesis_output_path}`,
      ],
    );
    synthesizeOutcome = (
      await runSynthesisMapReduceDispatch({
        projectRoot,
        sessionRoot,
        executionPlan,
        executorConfig: synthesizeExecutorConfig,
        expectedLensIds: lensDispatches.map((dispatch) => dispatch.unit_id),
        receivedLensIds: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
        maxConcurrentIssueSynthesis: maxConcurrentLenses,
        unitTimeoutMs,
        retryPolicy,
        reviewExecutionProfile: params.reviewExecutionProfile,
        ...(continuationMode
          ? {
              runUnitIds: continuationRunUnitIds,
              preservedResultsByUnitId: previousResultsByUnitId,
            }
          : {}),
      })
    ).outcome;
  } else {
    synthesizeOutcome = preservedOutcomeForDispatch(synthesizeDispatch);
    await ensureNonEmptyOutputFile(synthesizeDispatch.output_path);
    await ensureNonEmptyOutputFile(executionPlan.synthesis_output_path);
  }
    return null;
  };

  // Was a unit's stage already run this process (its seats are this run's
  // products) — used by the absorb gate so a continuation rerun target is
  // never absorbed from a stale seat before its stage executed.
  const frontierStageRanFor = (unit: ReviewContinuationUnit): boolean => {
    const id = unit.unitId;
    if (unit.unitKind === "deliberation") {
      return routedFrontierStages.has("deliberation");
    }
    if (id.startsWith("issue-stance:") || id === "issue-stance-matrix") {
      return routedFrontierStages.has("issue_artifact:issue-stance-matrix");
    }
    if (id === "synthesize" || id.startsWith("synthesis:")) {
      return routedFrontierStages.has("synthesize");
    }
    if (id === "problem-framing") {
      return routedFrontierStages.has("problem_framing");
    }
    return routedFrontierStages.has(`issue_artifact:${id}`);
  };

  const FRONTIER_LOOP_MAX_ITERATIONS = 64;
  for (let iteration = 0; ; iteration += 1) {
    if (iteration >= FRONTIER_LOOP_MAX_ITERATIONS) {
      throw new Error(
        "post-lens frontier loop did not converge (max iterations)",
      );
    }
    const frontier = await computeReviewFrontier(sessionRoot);
    // Convergence = no unit owes work: trusted output OR terminally
    // resolved (demoted complete-with-failure — 설계 A).
    if (frontier.unitLedger.units.every((unit) => isResolvedLedgerUnit(unit))) {
      break;
    }
    const ready = frontier.frontierUnits.filter(
      (unit) => unit.dispatchDecision !== "skip",
    );
    if (ready.length === 0) {
      throw new Error(
        frontier.ineligibleReason ??
          "post-lens frontier stalled: no ready units but untrusted work remains",
      );
    }
    // Absorb seats that already exist (stage products from the previous
    // iteration, preserved continuation units): the same seat-level gate B
    // uses merges them so the frontier advances. Units that still owe an
    // execution this run (stage not run, shouldRunUnit true) are not
    // absorbed from stale seats.
    let absorbed = false;
    for (const unit of ready) {
      if (!unit.outputPath) continue;
      if (!frontierStageRanFor(unit) && shouldRunUnit(unit.unitId)) continue;
      if (!(await fileExists(unit.outputPath))) continue;
      const result = await validateUnitSeatToResult({
        sessionRoot,
        unit,
        executionPlan,
      });
      if (result.status !== "completed") continue;
      await mergeUnitResultIntoExecutionResult({ sessionRoot, result });
      absorbed = true;
    }
    if (absorbed) continue;
    const route = pickPostLensFrontierRoute(ready);
    if (!route) {
      throw new Error(
        `post-lens frontier has no stage route for ready units: ${ready
          .map((unit) => unit.unitId)
          .join(", ")}`,
      );
    }
    const routeKey =
      route.kind === "issue_artifact"
        ? `issue_artifact:${route.artifactId}`
        : route.kind;
    if (routedFrontierStages.has(routeKey)) {
      throw new Error(
        `post-lens frontier did not converge after stage ${routeKey}`,
      );
    }
    routedFrontierStages.add(routeKey);
    let halt: ReviewPromptExecutionResult | null = null;
    switch (route.kind) {
      case "issue_artifact":
        halt = await runPreDeliberationArtifactStage(route.artifactId);
        break;
      case "deliberation":
        halt = await runDeliberationStage();
        break;
      case "problem_framing":
        if (!deliberationStageRan) halt = await runDeliberationStage();
        if (!halt) halt = await runProblemFramingStage();
        break;
      case "synthesize":
        if (!deliberationStageRan) halt = await runDeliberationStage();
        if (!halt) halt = await runSynthesizeStage();
        break;
    }
    if (halt) return halt;
    // A failed synthesize aggregate must reach the artifact-backed halt
    // block below (the previous sequential flow) — the frontier would
    // otherwise re-offer the untrusted synthesize unit and trip the
    // convergence guard before the structured halt result is written.
    if (synthesizeStageRan && !synthesizeOutcome.success) break;
  }

  // Composition parity: stages the frontier never routed (their units were
  // already trusted — continuation) still run their handlers so the final
  // write composes the same arrays the sequential path did (handlers
  // preserve internally via shouldRunUnit).
  if (!deliberationStageRan) {
    const halt = await runDeliberationStage();
    if (halt) return halt;
  }
  if (!synthesizeStageRan) {
    const halt = await runSynthesizeStage();
    if (halt) return halt;
  }
  // Canonical issue-artifact ordering, independent of frontier execution
  // order; preserved entries fill the canonical slots the loop never ran.
  {
    const issueOutcomeById = new Map(
      issueArtifactOutcomes.map((outcome) => [outcome.dispatch.unit_id, outcome]),
    );
    const orderedIssueArtifactOutcomes: ExecutionOutcome[] = [];
    for (const artifactId of [
      ...PRE_DELIBERATION_ISSUE_ARTIFACT_IDS,
      "problem-framing" as const,
    ]) {
      const existing = issueOutcomeById.get(artifactId);
      if (existing) {
        orderedIssueArtifactOutcomes.push(existing);
        continue;
      }
      if (!shouldRunUnit(artifactId)) {
        orderedIssueArtifactOutcomes.push(
          preservedOutcomeForDispatch({
            unit_id: artifactId,
            unit_kind: "issue_artifact",
            packet_path:
              executionPlan.issue_artifact_prompt_packet_seats.find(
                (seat) => seat.artifact_id === artifactId,
              )?.packet_path ??
              path.join(
                executionPlan.prompt_packets_root,
                issueArtifactSpec(artifactId).prompt_packet_file_name,
              ),
            output_path: issueArtifactOutputPath(executionPlan, artifactId),
          }),
        );
        continue;
      }
      throw new Error(
        `issue artifact ${artifactId} missing from frontier composition`,
      );
    }
    issueArtifactOutcomes.length = 0;
    issueArtifactOutcomes.push(...orderedIssueArtifactOutcomes);
  }

  const synthesizeSucceeded = synthesizeOutcome.success;
  if (synthesizeSucceeded) {
    await validateSynthesizeOutputParticipationTruth({
      outputPath: executionPlan.synthesis_output_path,
      expectedLensIds: lensDispatches.map((dispatch) => dispatch.unit_id),
      receivedLensIds: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
    });
  }

  if (!synthesizeSucceeded) {
    const failure = synthesizeOutcome.failure ?? {
      unit_id: synthesizeDispatch.unit_id,
      unit_kind: synthesizeDispatch.unit_kind,
      packet_path: synthesizeDispatch.packet_path,
      output_path: synthesizeDispatch.output_path,
      message: "Synthesize execution failed.",
      failure_kind: "unknown" as const,
    };
    executionFailures.push(failure);
    await removeFileIfExists(synthesizeDispatch.output_path);
    await removeFileIfExists(executionPlan.synthesis_output_path);
    const degradedLensIds = executionFailures
      .filter((recordedFailure) => recordedFailure.unit_kind === "lens")
      .map((recordedFailure) => recordedFailure.unit_id);
    const executionCompletedAtMs = Date.now();
    await writeExecutionResultArtifact(executionPlan, {
      session_id: executionPlan.session_id,
      session_root: sessionRoot,
      execution_realization: executionPlan.execution_realization,
      host_runtime: executionPlan.host_runtime,
      review_mode: executionPlan.review_mode,
      execution_status: deriveExecutionStatus({
        synthesisExecuted: false,
        degradedLensIds,
      }),
      execution_started_at: isoFromTimestamp(executionStartedAtMs),
      execution_completed_at: isoFromTimestamp(executionCompletedAtMs),
      total_duration_ms: Math.max(0, executionCompletedAtMs - executionStartedAtMs),
      max_concurrent_lenses: maxConcurrentLenses,
      observed_dispatch_width: observedDispatchWidth,
      planned_lens_ids: lensDispatches.map((dispatch) => dispatch.unit_id),
      participating_lens_ids: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
      degraded_lens_ids: degradedLensIds,
      excluded_lens_ids: lensDispatches
        .map((dispatch) => dispatch.unit_id)
        .filter(
          (lensId) =>
            !successfulLensDispatches.some((dispatch) => dispatch.unit_id === lensId) &&
            !degradedLensIds.includes(lensId),
        ),
      executed_lens_count: successfulLensDispatches.length,
      synthesis_executed: false,
      deliberation_status: "performed",
      halt_reason: `Synthesize execution failed: ${failure.message}`,
      ...haltArtifactFields("synthesize", synthesizeOutcome),
      error_log_path: executionPlan.error_log_path,
      lens_completion_barrier_ref:
        executionPlan.lens_completion_barrier_path ??
        path.join(sessionRoot, "lens-completion-barrier.yaml"),
      lens_execution_results: executionOutcomes
        .filter((outcome): outcome is ExecutionOutcome => outcome !== undefined)
        .map(toUnitExecutionResult),
      issue_artifact_execution_results:
        issueArtifactOutcomes.map(toUnitExecutionResult),
      deliberation_execution_results: [
        ...controlledDeliberation.deliberationOutcomes,
        controlledDeliberation.teamleadOutcome,
      ].map(toUnitExecutionResult),
      synthesize_execution_result: synthesizeOutcome
        ? toUnitExecutionResult(synthesizeOutcome)
        : null,
    }, params.reviewExecutionProfile);
    return {
      session_root: sessionRoot,
      executed_lens_count: successfulLensDispatches.length,
      synthesis_output_path: executionPlan.synthesis_output_path,
      participating_lens_ids: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
      degraded_lens_ids: executionFailures
        .filter((recordedFailure) => recordedFailure.unit_kind === "lens")
        .map((recordedFailure) => recordedFailure.unit_id),
      synthesis_executed: false,
      error_log_path: executionPlan.error_log_path,
      halt_reason: `Synthesize execution failed: ${failure.message}`,
      ...haltArtifactFields("synthesize", synthesizeOutcome),
    };
  }

  console.log("[review runner] completed synthesize: synthesize");
  await appendExecutionProgress(
    executionPlan.error_log_path,
    "runner dispatch completed: synthesize",
    [
      `unit_id: ${synthesizeDispatch.unit_id}`,
      `unit_kind: ${synthesizeDispatch.unit_kind}`,
      `output_path: ${synthesizeDispatch.output_path}`,
    ],
  );
  const degradedLensIds = executionFailures
    .filter((failure) => failure.unit_kind === "lens")
    .map((failure) => failure.unit_id);
  const degradedUnitCount = [
    ...issueArtifactOutcomes,
    ...controlledDeliberation.deliberationOutcomes,
    controlledDeliberation.teamleadOutcome,
    synthesizeOutcome,
  ].reduce((total, outcome) => total + failedChildOutcomeCount(outcome), 0);
  const executionCompletedAtMs = Date.now();
  const deliberationStatus = await readStructuredDeliberationStatus(
    executionPlan,
    executionPlan.synthesis_output_path,
  ).catch(async (error) =>
    throwMalformedOutputFailure({
      executionPlan,
      phase: "execution.synthesize.validation",
      unitId: synthesizeDispatch.unit_id,
      unitKind: synthesizeDispatch.unit_kind,
      packetPath: synthesizeDispatch.packet_path,
      outputPath: synthesizeDispatch.output_path,
      humanMessage:
        "Synthesize output did not satisfy the controlled deliberation output contract.",
      error,
    }),
  );
  await writeExecutionResultArtifact(executionPlan, {
    session_id: executionPlan.session_id,
    session_root: sessionRoot,
    execution_realization: executionPlan.execution_realization,
    host_runtime: executionPlan.host_runtime,
    review_mode: executionPlan.review_mode,
    execution_status: deriveExecutionStatus({
      synthesisExecuted: true,
      degradedLensIds,
      degradedUnitCount,
    }),
    execution_started_at: isoFromTimestamp(executionStartedAtMs),
    execution_completed_at: isoFromTimestamp(executionCompletedAtMs),
    total_duration_ms: Math.max(0, executionCompletedAtMs - executionStartedAtMs),
    max_concurrent_lenses: maxConcurrentLenses,
    observed_dispatch_width: observedDispatchWidth,
    planned_lens_ids: lensDispatches.map((dispatch) => dispatch.unit_id),
    participating_lens_ids: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
    degraded_lens_ids: degradedLensIds,
    excluded_lens_ids: lensDispatches
      .map((dispatch) => dispatch.unit_id)
      .filter(
        (lensId) =>
          !successfulLensDispatches.some((dispatch) => dispatch.unit_id === lensId) &&
          !degradedLensIds.includes(lensId),
      ),
    executed_lens_count: successfulLensDispatches.length,
    synthesis_executed: true,
    deliberation_status: deliberationStatus,
    halt_reason: null,
    error_log_path: executionPlan.error_log_path,
    lens_completion_barrier_ref:
      executionPlan.lens_completion_barrier_path ??
      path.join(sessionRoot, "lens-completion-barrier.yaml"),
    lens_execution_results: executionOutcomes
      .filter((outcome): outcome is ExecutionOutcome => outcome !== undefined)
      .map(toUnitExecutionResult),
    issue_artifact_execution_results:
      issueArtifactOutcomes.map(toUnitExecutionResult),
    deliberation_execution_results: [
      ...controlledDeliberation.deliberationOutcomes,
      controlledDeliberation.teamleadOutcome,
    ].map(toUnitExecutionResult),
    synthesize_execution_result: synthesizeOutcome
      ? toUnitExecutionResult(synthesizeOutcome)
      : null,
  }, params.reviewExecutionProfile);

  return {
    session_root: sessionRoot,
    executed_lens_count: successfulLensDispatches.length,
    synthesis_output_path: executionPlan.synthesis_output_path,
    participating_lens_ids: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
    degraded_lens_ids: degradedLensIds,
    synthesis_executed: true,
    error_log_path: executionPlan.error_log_path,
  };
}

export async function runReviewPromptExecution(
  argv: string[],
): Promise<ReviewPromptExecutionResult> {
  const { values } = parseArgs({
    options: {
      "project-root": { type: "string", default: "." },
      "session-root": { type: "string" },
      "executor-bin": { type: "string" },
      "executor-arg": { type: "string", multiple: true, default: [] },
      "synthesize-executor-bin": { type: "string" },
      "synthesize-executor-arg": { type: "string", multiple: true, default: [] },
    },
    strict: true,
    allowPositionals: false,
    args: argv,
  });

  const defaultExecutorConfig: ReviewUnitExecutorConfig = {
    bin: requireString(values["executor-bin"], "executor-bin"),
    args: values["executor-arg"],
  };
  const synthesizeExecutorConfig: ReviewUnitExecutorConfig =
    typeof values["synthesize-executor-bin"] === "string" &&
    values["synthesize-executor-bin"].length > 0
      ? {
          bin: values["synthesize-executor-bin"],
          args: values["synthesize-executor-arg"],
        }
      : defaultExecutorConfig;
  return executeReviewPromptExecution({
    projectRoot: requireString(values["project-root"], "project-root"),
    sessionRoot: requireString(values["session-root"], "session-root"),
    defaultExecutorConfig,
    synthesizeExecutorConfig,
  });
}

export async function runReviewPromptExecutionCli(
  argv: string[],
): Promise<number> {
  const result = await runReviewPromptExecution(argv);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  return runReviewPromptExecutionCli(process.argv.slice(2));
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
