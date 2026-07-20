# 자료 기반 코드 이해 평가 (누적 조건)

같은 TypeScript 파일에 대한 세 자료가 있습니다. 자료 X는 파일의 앞부분(일부만 포함될 수
있음), 자료 Y는 구조 인벤토리, 자료 Z는 요약 산출물입니다. 각 질문에 대해 다음 세 조건으로
독립 답변을 작성하십시오:

- **조건①**: 자료 X만 사용.
- **조건②**: 자료 X와 자료 Y만 사용.
- **조건③**: 자료 X, Y, Z 모두 사용.

각 답변에 "해당 조건의 자료만으로 충분히 답할 수 있는가"를 answerable: yes/partial/no로
자가 표기하십시오. 자료에 없는 내용을 추측으로 채우지 마십시오 — 근거가 없으면 no로 표기하는
것이 정답입니다.

## 자료 X

````ts
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
    await validateIssueArtifactOnDisk
````

## 자료 Y

```json
{
  "schema_version": "1",
  "language": "typescript",
  "line_count": 8556,
  "content_sha256": "d9253eebca3318ec1709fe418c388ec7971a1e0f5e6cdc3f01e7c729ad791ba7",
  "extractor_logic_sha256": "61f4a602cd375187708ed364d529d7111d5d808d2b21a329f5d984b7f0d3a26c",
  "symbol_tiles": {
    "spans": [
      {
        "line_start": 19,
        "line_end": 45,
        "kind": "import",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "import type {"
      },
      {
        "line_start": 55,
        "line_end": 72,
        "kind": "import",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "import {"
      },
      {
        "line_start": 104,
        "line_end": 117,
        "kind": "import",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "import {"
      },
      {
        "line_start": 149,
        "line_end": 161,
        "kind": "import",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "import {"
      },
      {
        "line_start": 316,
        "line_end": 335,
        "kind": "function_decl",
        "symbol_names": [
          "emitReviewProgress"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function emitReviewProgress(args: {"
      },
      {
        "line_start": 336,
        "line_end": 357,
        "kind": "function_decl",
        "symbol_names": [
          "renderEffectiveBoundaryStateLog"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function renderEffectiveBoundaryStateLog("
      },
      {
        "line_start": 374,
        "line_end": 390,
        "kind": "function_decl",
        "symbol_names": [
          "lensDispatchOutputPath"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function lensDispatchOutputPath(args: {"
      },
      {
        "line_start": 401,
        "line_end": 419,
        "kind": "function_decl",
        "symbol_names": [
          "renderReviewUnitBoundaryContext"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function renderReviewUnitBoundaryContext("
      },
      {
        "line_start": 438,
        "line_end": 476,
        "kind": "function_decl",
        "symbol_names": [
          "writeLensCompletionBarrier"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function writeLensCompletionBarrier(args: {"
      },
      {
        "line_start": 490,
        "line_end": 501,
        "kind": "function_decl",
        "symbol_names": [
          "defaultStaggerDelayMsForExecutorConfig"
        ],
        "depth": 1,
        "doc_first_line": "Default stagger delay between successive lens dispatches (ms).",
        "signature_line": "function defaultStaggerDelayMsForExecutorConfig("
      },
      {
        "line_start": 553,
        "line_end": 565,
        "kind": "function_decl",
        "symbol_names": [
          "retryPolicyFromProfile"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function retryPolicyFromProfile("
      },
      {
        "line_start": 610,
        "line_end": 624,
        "kind": "member_method",
        "symbol_names": [
          "constructor"
        ],
        "depth": 2,
        "doc_first_line": null,
        "signature_line": "constructor("
      },
      {
        "line_start": 637,
        "line_end": 647,
        "kind": "member_method",
        "symbol_names": [
          "constructor"
        ],
        "depth": 2,
        "doc_first_line": null,
        "signature_line": "constructor("
      },
      {
        "line_start": 667,
        "line_end": 687,
        "kind": "function_decl",
        "symbol_names": [
          "haltLensIdFromOutcome"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function haltLensIdFromOutcome(outcome: ExecutionOutcome | null): string | null {"
      },
      {
        "line_start": 688,
        "line_end": 702,
        "kind": "function_decl",
        "symbol_names": [
          "haltArtifactFields"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function haltArtifactFields("
      },
      {
        "line_start": 707,
        "line_end": 738,
        "kind": "function_decl",
        "symbol_names": [
          "unitSettingsIdForDispatch"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function unitSettingsIdForDispatch("
      },
      {
        "line_start": 773,
        "line_end": 783,
        "kind": "function_decl",
        "symbol_names": [
          "maxConcurrentLensesForProfile"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function maxConcurrentLensesForProfile(args: {"
      },
      {
        "line_start": 784,
        "line_end": 796,
        "kind": "function_decl",
        "symbol_names": [
          "maxUnitOutputBytes"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function maxUnitOutputBytes(args: {"
      },
      {
        "line_start": 797,
        "line_end": 818,
        "kind": "function_decl",
        "symbol_names": [
          "stripSingleValueCliOptions"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function stripSingleValueCliOptions(args: string[], optionNames: string[]): string[] {"
      },
      {
        "line_start": 819,
        "line_end": 829,
        "kind": "function_decl",
        "symbol_names": [
          "stripInlineHttpLlmOverrideArgs"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function stripInlineHttpLlmOverrideArgs(args: string[]): string[] {"
      },
      {
        "line_start": 835,
        "line_end": 861,
        "kind": "function_decl",
        "symbol_names": [
          "stripCodexLlmOverrideArgs"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function stripCodexLlmOverrideArgs(args: string[]): string[] {"
      },
      {
        "line_start": 862,
        "line_end": 890,
        "kind": "function_decl",
        "symbol_names": [
          "appendInlineHttpLlmOverrideArgs"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function appendInlineHttpLlmOverrideArgs("
      },
      {
        "line_start": 891,
        "line_end": 902,
        "kind": "function_decl",
        "symbol_names": [
          "appendCodexLlmOverrideArgs"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function appendCodexLlmOverrideArgs("
      },
      {
        "line_start": 903,
        "line_end": 916,
        "kind": "function_decl",
        "symbol_names": [
          "appendInlineHttpUnitExecutionKnobArgs"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function appendInlineHttpUnitExecutionKnobArgs("
      },
      {
        "line_start": 917,
        "line_end": 933,
        "kind": "function_decl",
        "symbol_names": [
          "rejectUnsupportedUnitExecutionKnobs"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function rejectUnsupportedUnitExecutionKnobs(args: {"
      },
      {
        "line_start": 934,
        "line_end": 984,
        "kind": "function_decl",
        "symbol_names": [
          "executorConfigWithUnitSettings"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function executorConfigWithUnitSettings(args: {"
      },
      {
        "line_start": 1002,
        "line_end": 1021,
        "kind": "function_decl",
        "symbol_names": [
          "findMarkdownHeading"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function findMarkdownHeading("
      },
      {
        "line_start": 1022,
        "line_end": 1042,
        "kind": "function_decl",
        "symbol_names": [
          "markdownSectionBody"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function markdownSectionBody(text: string, heading: string): string | null {"
      },
      {
        "line_start": 1043,
        "line_end": 1072,
        "kind": "function_decl",
        "symbol_names": [
          "requireMarkdownHeadings"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function requireMarkdownHeadings(args: {"
      },
      {
        "line_start": 1073,
        "line_end": 1102,
        "kind": "function_decl",
        "symbol_names": [
          "parseLensYamlListSection"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function parseLensYamlListSection(args: {"
      },
      {
        "line_start": 1103,
        "line_end": 1123,
        "kind": "function_decl",
        "symbol_names": [
          "parseLensStringListSection"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function parseLensStringListSection(args: {"
      },
      {
        "line_start": 1124,
        "line_end": 1145,
        "kind": "function_decl",
        "symbol_names": [
          "assertLensDomainConstraintsUsed"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function assertLensDomainConstraintsUsed(args: {"
      },
      {
        "line_start": 1146,
        "line_end": 1159,
        "kind": "function_decl",
        "symbol_names": [
          "assertLensDomainContextAssumptions"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function assertLensDomainContextAssumptions(args: {"
      },
      {
        "line_start": 1183,
        "line_end": 1202,
        "kind": "function_decl",
        "symbol_names": [
          "requireFrontmatterStringArray"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function requireFrontmatterStringArray("
      },
      {
        "line_start": 1203,
        "line_end": 1215,
        "kind": "function_decl",
        "symbol_names": [
          "requireFrontmatterRecord"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function requireFrontmatterRecord("
      },
      {
        "line_start": 1216,
        "line_end": 1281,
        "kind": "function_decl",
        "symbol_names": [
          "validateSynthesizeParticipationFrontmatter"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function validateSynthesizeParticipationFrontmatter(args: {"
      },
      {
        "line_start": 1282,
        "line_end": 1302,
        "kind": "function_decl",
        "symbol_names": [
          "assertStringSetEqual"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function assertStringSetEqual(args: {"
      },
      {
        "line_start": 1303,
        "line_end": 1321,
        "kind": "function_decl",
        "symbol_names": [
          "synthesizeRunStatusForLensTruth"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function synthesizeRunStatusForLensTruth(args: {"
      },
      {
        "line_start": 1322,
        "line_end": 1366,
        "kind": "function_decl",
        "symbol_names": [
          "validateSynthesizeParticipationTruth"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function validateSynthesizeParticipationTruth(args: {"
      },
      {
        "line_start": 1367,
        "line_end": 1493,
        "kind": "function_decl",
        "symbol_names": [
          "validateMarkdownOutputContract"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function validateMarkdownOutputContract(args: {"
      },
      {
        "line_start": 1502,
        "line_end": 1517,
        "kind": "function_decl",
        "symbol_names": [
          "ensureNonEmptyOutputFile"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function ensureNonEmptyOutputFile(outputPath: string): Promise<void> {"
      },
      {
        "line_start": 1518,
        "line_end": 1581,
        "kind": "function_decl",
        "symbol_names": [
          "validateUnitOutputFile"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function validateUnitOutputFile(args: {"
      },
      {
        "line_start": 1582,
        "line_end": 1596,
        "kind": "function_decl",
        "symbol_names": [
          "validateSynthesizeOutputParticipationTruth"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function validateSynthesizeOutputParticipationTruth(args: {"
      },
      {
        "line_start": 1607,
        "line_end": 1621,
        "kind": "const_decl",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": "breaker module; this consumer adds only its executor-specific extra.",
        "signature_line": "const TRANSIENT_EXECUTOR_FAILURE_PATTERNS = ["
      },
      {
        "line_start": 1629,
        "line_end": 1668,
        "kind": "function_decl",
        "symbol_names": [
          "failureKindFromMessage"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function failureKindFromMessage(message: string): ReviewUnitFailureKind {"
      },
      {
        "line_start": 1669,
        "line_end": 1690,
        "kind": "function_decl",
        "symbol_names": [
          "shouldRetryUnitFailure"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "export function shouldRetryUnitFailure(args: {"
      },
      {
        "line_start": 1691,
        "line_end": 1703,
        "kind": "comment_block",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "/**"
      },
      {
        "line_start": 1704,
        "line_end": 1720,
        "kind": "function_decl",
        "symbol_names": [
          "isResubmitCorrectableRetry"
        ],
        "depth": 1,
        "doc_first_line": "Allow an output_contract retry iff resubmit is enabled AND the unit is",
        "signature_line": "function isResubmitCorrectableRetry(args: {"
      },
      {
        "line_start": 1738,
        "line_end": 1749,
        "kind": "function_decl",
        "symbol_names": [
          "reviewDispatchBreakerFromProfile"
        ],
        "depth": 1,
        "doc_first_line": "설계 B: 리뷰 fan-out 풀(lens/stance)의 dispatch breaker (opt-in,",
        "signature_line": "function reviewDispatchBreakerFromProfile("
      },
      {
        "line_start": 1757,
        "line_end": 1768,
        "kind": "comment_block",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "/** §4-1: record a nested-pool unit's FINAL outcome to the dispatch breaker."
      },
      {
        "line_start": 1769,
        "line_end": 1787,
        "kind": "function_decl",
        "symbol_names": [
          "recordNestedUnitOutcomeToBreaker"
        ],
        "depth": 1,
        "doc_first_line": "§4-1: record a nested-pool unit's FINAL outcome to the dispatch breaker.",
        "signature_line": "export function recordNestedUnitOutcomeToBreaker("
      },
      {
        "line_start": 1803,
        "line_end": 1821,
        "kind": "function_decl",
        "symbol_names": [
          "persistReviewDispatchIncompleteArtifact"
        ],
        "depth": 1,
        "doc_first_line": "규칙 6 관측 상시화 + 규칙 5 정확 재디스패치 집합: breaker-ON 배치는",
        "signature_line": "async function persistReviewDispatchIncompleteArtifact(args: {"
      },
      {
        "line_start": 1832,
        "line_end": 1884,
        "kind": "function_decl",
        "symbol_names": [
          "applyStanceResubmitErrorSpec"
        ],
        "depth": 1,
        "doc_first_line": "설계 A (bounded resubmit): before the next retry of an issue-stance unit",
        "signature_line": "async function applyStanceResubmitErrorSpec(args: {"
      },
      {
        "line_start": 1888,
        "line_end": 1900,
        "kind": "function_decl",
        "symbol_names": [
          "readFrozenUnsupportedRefViolation"
        ],
        "depth": 1,
        "doc_first_line": "Worker adapters exit before stderr reliably carries the validation text;",
        "signature_line": "async function readFrozenUnsupportedRefViolation("
      },
      {
        "line_start": 1901,
        "line_end": 1913,
        "kind": "comment_block",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "/**"
      },
      {
        "line_start": 1925,
        "line_end": 1943,
        "kind": "const_decl",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "export const RESUBMIT_UNIT_ROUTING: Record<string, ResubmitUnitRouting> ="
      },
      {
        "line_start": 1953,
        "line_end": 1982,
        "kind": "function_decl",
        "symbol_names": [
          "applyResubmitErrorSpec"
        ],
        "depth": 1,
        "doc_first_line": "설계 A / §4-6a / §4-2c: unit-agnostic entry for bounded resubmit error-spec",
        "signature_line": "export async function applyResubmitErrorSpec(args: {"
      },
      {
        "line_start": 1987,
        "line_end": 2018,
        "kind": "function_decl",
        "symbol_names": [
          "refreshManifestPacketHash"
        ],
        "depth": 1,
        "doc_first_line": "K2 (20260712-stance-ref-vocabulary-unification-design.md §5): re-pin the",
        "signature_line": "async function refreshManifestPacketHash(args: {"
      },
      {
        "line_start": 2041,
        "line_end": 2106,
        "kind": "function_decl",
        "symbol_names": [
          "applyDeliberationResubmitErrorSpec"
        ],
        "depth": 1,
        "doc_first_line": "§4-6a deliberation strategy: inject the evidence_refs error spec before the",
        "signature_line": "async function applyDeliberationResubmitErrorSpec(args: {"
      },
      {
        "line_start": 2111,
        "line_end": 2123,
        "kind": "function_decl",
        "symbol_names": [
          "readFrozenDeliberationUnsupportedRefViolation"
        ],
        "depth": 1,
        "doc_first_line": "Deliberation counterpart of readFrozenUnsupportedRefViolation: the salvage",
        "signature_line": "async function readFrozenDeliberationUnsupportedRefViolation("
      },
      {
        "line_start": 2133,
        "line_end": 2144,
        "kind": "comment_block",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "/**"
      },
      {
        "line_start": 2145,
        "line_end": 2205,
        "kind": "function_decl",
        "symbol_names": [
          "applySynthesisResubmitErrorSpec"
        ],
        "depth": 1,
        "doc_first_line": "§4-2c/2-A synthesis strategy: inject the source_refs_used error spec before",
        "signature_line": "async function applySynthesisResubmitErrorSpec(args: {"
      },
      {
        "line_start": 2208,
        "line_end": 2220,
        "kind": "function_decl",
        "symbol_names": [
          "readFrozenSynthesisUnsupportedRefViolation"
        ],
        "depth": 1,
        "doc_first_line": "Synthesis counterpart of readFrozenUnsupportedRefViolation. */",
        "signature_line": "async function readFrozenSynthesisUnsupportedRefViolation("
      },
      {
        "line_start": 2221,
        "line_end": 2282,
        "kind": "function_decl",
        "symbol_names": [
          "parseExecutorRunMetadata"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function parseExecutorRunMetadata(stdout: string): ReviewExecutorRunMetadata | undefined {"
      },
      {
        "line_start": 2283,
        "line_end": 2293,
        "kind": "function_decl",
        "symbol_names": [
          "isReviewHostRuntime"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function isReviewHostRuntime(value: unknown): value is ReviewHostRuntime {"
      },
      {
        "line_start": 2294,
        "line_end": 2388,
        "kind": "function_decl",
        "symbol_names": [
          "parseCitationAuditMetadata"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function parseCitationAuditMetadata(value: unknown): {"
      },
      {
        "line_start": 2389,
        "line_end": 2428,
        "kind": "function_decl",
        "symbol_names": [
          "parseNativeAdmissionMetadata"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function parseNativeAdmissionMetadata("
      },
      {
        "line_start": 2429,
        "line_end": 2449,
        "kind": "function_decl",
        "symbol_names": [
          "parseToolBoundarySkipMetadata"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function parseToolBoundarySkipMetadata("
      },
      {
        "line_start": 2450,
        "line_end": 2621,
        "kind": "function_decl",
        "symbol_names": [
          "invokeExecutor"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function invokeExecutor("
      },
      {
        "line_start": 2626,
        "line_end": 2706,
        "kind": "function_decl",
        "symbol_names": [
          "toUnitExecutionResult"
        ],
        "depth": 1,
        "doc_first_line": "silently dropped if the wiring regressed.",
        "signature_line": "export function toUnitExecutionResult("
      },
      {
        "line_start": 2707,
        "line_end": 2741,
        "kind": "function_decl",
        "symbol_names": [
          "normalizePreservedUnitExecutionResult"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function normalizePreservedUnitExecutionResult("
      },
      {
        "line_start": 2742,
        "line_end": 2769,
        "kind": "function_decl",
        "symbol_names": [
          "allUnitExecutionResults"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function allUnitExecutionResults("
      },
      {
        "line_start": 2788,
        "line_end": 2885,
        "kind": "function_decl",
        "symbol_names": [
          "outcomeFromPreviousResult"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "export function outcomeFromPreviousResult("
      },
      {
        "line_start": 2886,
        "line_end": 2899,
        "kind": "function_decl",
        "symbol_names": [
          "deriveExecutionStatus"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function deriveExecutionStatus(params: {"
      },
      {
        "line_start": 2900,
        "line_end": 2912,
        "kind": "function_decl",
        "symbol_names": [
          "failedChildOutcomeCount"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function failedChildOutcomeCount(outcome: ExecutionOutcome): number {"
      },
      {
        "line_start": 2913,
        "line_end": 2952,
        "kind": "function_decl",
        "symbol_names": [
          "readStructuredDeliberationStatus"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function readStructuredDeliberationStatus("
      },
      {
        "line_start": 2957,
        "line_end": 2973,
        "kind": "function_decl",
        "symbol_names": [
          "inferFailureLensId"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function inferFailureLensId("
      },
      {
        "line_start": 2974,
        "line_end": 2994,
        "kind": "function_decl",
        "symbol_names": [
          "collectFailedUnits"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function collectFailedUnits("
      },
      {
        "line_start": 2995,
        "line_end": 3005,
        "kind": "function_decl",
        "symbol_names": [
          "degradationKindsFor"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function degradationKindsFor("
      },
      {
        "line_start": 3006,
        "line_end": 3038,
        "kind": "function_decl",
        "symbol_names": [
          "writeDegradationSummaryArtifact"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function writeDegradationSummaryArtifact("
      },
      {
        "line_start": 3039,
        "line_end": 3067,
        "kind": "function_decl",
        "symbol_names": [
          "unitResultWithArtifactGenerationDefaults"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function unitResultWithArtifactGenerationDefaults("
      },
      {
        "line_start": 3068,
        "line_end": 3156,
        "kind": "function_decl",
        "symbol_names": [
          "writeExecutionResultArtifact"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function writeExecutionResultArtifact("
      },
      {
        "line_start": 3157,
        "line_end": 3195,
        "kind": "function_decl",
        "symbol_names": [
          "throwMalformedOutputFailure"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function throwMalformedOutputFailure(args: {"
      },
      {
        "line_start": 3206,
        "line_end": 3225,
        "kind": "function_decl",
        "symbol_names": [
          "deriveContextAccessMatrix"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function deriveContextAccessMatrix("
      },
      {
        "line_start": 3230,
        "line_end": 3265,
        "kind": "function_decl",
        "symbol_names": [
          "throwManifestValidationFailure"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function throwManifestValidationFailure(args: {"
      },
      {
        "line_start": 3274,
        "line_end": 3286,
        "kind": "function_decl",
        "symbol_names": [
          "reviewContextManifestPath"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function reviewContextManifestPath("
      },
      {
        "line_start": 3287,
        "line_end": 3299,
        "kind": "function_decl",
        "symbol_names": [
          "readReviewContextManifest"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function readReviewContextManifest("
      },
      {
        "line_start": 3300,
        "line_end": 3400,
        "kind": "function_decl",
        "symbol_names": [
          "validatePromptPacketRefForDispatch"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function validatePromptPacketRefForDispatch(args: {"
      },
      {
        "line_start": 3401,
        "line_end": 3470,
        "kind": "function_decl",
        "symbol_names": [
          "validateManifestPacketRefsForDispatch"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function validateManifestPacketRefsForDispatch(args: {"
      },
      {
        "line_start": 3473,
        "line_end": 3495,
        "kind": "function_decl",
        "symbol_names": [
          "withGeneratedPacketRefRegistrationLock"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function withGeneratedPacketRefRegistrationLock<T>("
      },
      {
        "line_start": 3496,
        "line_end": 3506,
        "kind": "function_decl",
        "symbol_names": [
          "registerGeneratedPromptPacketRefForDispatch"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function registerGeneratedPromptPacketRefForDispatch(args: {"
      },
      {
        "line_start": 3507,
        "line_end": 3600,
        "kind": "function_decl",
        "symbol_names": [
          "registerGeneratedPromptPacketRefForDispatchUnlocked"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function registerGeneratedPromptPacketRefForDispatchUnlocked(args: {"
      },
      {
        "line_start": 3601,
        "line_end": 3625,
        "kind": "function_decl",
        "symbol_names": [
          "pruneGeneratedPromptPacketRefs"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function pruneGeneratedPromptPacketRefs("
      },
      {
        "line_start": 3626,
        "line_end": 3753,
        "kind": "function_decl",
        "symbol_names": [
          "ensureReviewContextManifestReadyForDispatch"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function ensureReviewContextManifestReadyForDispatch("
      },
      {
        "line_start": 3754,
        "line_end": 3797,
        "kind": "function_decl",
        "symbol_names": [
          "unitManifestEntry"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function unitManifestEntry("
      },
      {
        "line_start": 3798,
        "line_end": 3810,
        "kind": "function_decl",
        "symbol_names": [
          "flattenUnitResultsForRunManifest"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function flattenUnitResultsForRunManifest("
      },
      {
        "line_start": 3811,
        "line_end": 3945,
        "kind": "function_decl",
        "symbol_names": [
          "writeReviewRunManifest"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function writeReviewRunManifest("
      },
      {
        "line_start": 3946,
        "line_end": 4020,
        "kind": "function_decl",
        "symbol_names": [
          "resetExecutionOutputs"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function resetExecutionOutputs("
      },
      {
        "line_start": 4021,
        "line_end": 4046,
        "kind": "function_decl",
        "symbol_names": [
          "appendExecutionFailure"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function appendExecutionFailure("
      },
      {
        "line_start": 4047,
        "line_end": 4338,
        "kind": "function_decl",
        "symbol_names": [
          "runSingleDispatchWithRetries"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function runSingleDispatchWithRetries(args: {"
      },
      {
        "line_start": 4360,
        "line_end": 4371,
        "kind": "comment_block",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "/**"
      },
      {
        "line_start": 4372,
        "line_end": 4473,
        "kind": "function_decl",
        "symbol_names": [
          "runNestedStageFirstAttempt"
        ],
        "depth": 1,
        "doc_first_line": "Downstream wide-stage nested first attempt: hand the stage's dispatches",
        "signature_line": "export async function runNestedStageFirstAttempt(args: {"
      },
      {
        "line_start": 4474,
        "line_end": 4488,
        "kind": "comment_block",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "/**"
      },
      {
        "line_start": 4489,
        "line_end": 4571,
        "kind": "function_decl",
        "symbol_names": [
          "unitOutcomeWithNestedFirstAttempt"
        ],
        "depth": 1,
        "doc_first_line": "Per-unit outcome combinator for the nested first-attempt path:",
        "signature_line": "export async function unitOutcomeWithNestedFirstAttempt(args: {"
      },
      {
        "line_start": 4598,
        "line_end": 4663,
        "kind": "function_decl",
        "symbol_names": [
          "executeIssueStanceUnit"
        ],
        "depth": 1,
        "doc_first_line": "Issue-stance unit: dispatch + on-disk stance validation. A validation",
        "signature_line": "export async function executeIssueStanceUnit(args: {"
      },
      {
        "line_start": 4671,
        "line_end": 4738,
        "kind": "function_decl",
        "symbol_names": [
          "completeUnavailableDeliberationResponseUnit"
        ],
        "depth": 1,
        "doc_first_line": "Runtime fallback for an unavailable per-issue deliberation participant:",
        "signature_line": "export async function completeUnavailableDeliberationResponseUnit(args: {"
      },
      {
        "line_start": 4744,
        "line_end": 4779,
        "kind": "function_decl",
        "symbol_names": [
          "executeDeliberationResponseUnit"
        ],
        "depth": 1,
        "doc_first_line": "Per-issue deliberation unit: dispatch; an executor failure falls back to",
        "signature_line": "export async function executeDeliberationResponseUnit(args: {"
      },
      {
        "line_start": 4786,
        "line_end": 4851,
        "kind": "function_decl",
        "symbol_names": [
          "completeUnavailableSynthesisResponseUnit"
        ],
        "depth": 1,
        "doc_first_line": "Runtime fallback for an unavailable per-issue synthesis worker: a",
        "signature_line": "export async function completeUnavailableSynthesisResponseUnit(args: {"
      },
      {
        "line_start": 4859,
        "line_end": 4922,
        "kind": "function_decl",
        "symbol_names": [
          "executeSynthesisResponseUnit"
        ],
        "depth": 1,
        "doc_first_line": "Per-issue synthesis unit: dispatch + on-disk response validation; both",
        "signature_line": "export async function executeSynthesisResponseUnit(args: {"
      },
      {
        "line_start": 4938,
        "line_end": 4974,
        "kind": "function_decl",
        "symbol_names": [
          "mergeOutcomeIntoFrontierLedger"
        ],
        "depth": 1,
        "doc_first_line": "Merge one A outcome into the on-disk execution-result in engine shape so",
        "signature_line": "async function mergeOutcomeIntoFrontierLedger(args: {"
      },
      {
        "line_start": 4981,
        "line_end": 4997,
        "kind": "function_decl",
        "symbol_names": [
          "seedLensResultsForFrontier"
        ],
        "depth": 1,
        "doc_first_line": "Seed the lens stage into the frontier ledger after the (still inline) lens",
        "signature_line": "async function seedLensResultsForFrontier(args: {"
      },
      {
        "line_start": 5011,
        "line_end": 5038,
        "kind": "function_decl",
        "symbol_names": [
          "pickPostLensFrontierRoute"
        ],
        "depth": 1,
        "doc_first_line": "Canonical stage routing for ready frontier units. Order mirrors the",
        "signature_line": "function pickPostLensFrontierRoute("
      },
      {
        "line_start": 5047,
        "line_end": 5066,
        "kind": "function_decl",
        "symbol_names": [
          "issueArtifactOutputPath"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function issueArtifactOutputPath("
      },
      {
        "line_start": 5067,
        "line_end": 5447,
        "kind": "function_decl",
        "symbol_names": [
          "runIssueStanceMatrixCollectionDispatch"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function runIssueStanceMatrixCollectionDispatch(args: {"
      },
      {
        "line_start": 5448,
        "line_end": 5740,
        "kind": "function_decl",
        "symbol_names": [
          "runIssueArtifactDispatch"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function runIssueArtifactDispatch(args: {"
      },
      {
        "line_start": 5741,
        "line_end": 6298,
        "kind": "function_decl",
        "symbol_names": [
          "runControlledLensDeliberation"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function runControlledLensDeliberation(args: {"
      },
      {
        "line_start": 6308,
        "line_end": 6346,
        "kind": "function_decl",
        "symbol_names": [
          "synthesisValidationFailureOutcome"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function synthesisValidationFailureOutcome(args: {"
      },
      {
        "line_start": 6347,
        "line_end": 6425,
        "kind": "function_decl",
        "symbol_names": [
          "aggregateSynthesisExecutorMetadata"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function aggregateSynthesisExecutorMetadata("
      },
      {
        "line_start": 6426,
        "line_end": 6437,
        "kind": "function_decl",
        "symbol_names": [
          "uniqueByJson"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function uniqueByJson<T>(values: T[]): T[] {"
      },
      {
        "line_start": 6438,
        "line_end": 6448,
        "kind": "function_decl",
        "symbol_names": [
          "sumToolBoundarySkipMetadata"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function sumToolBoundarySkipMetadata("
      },
      {
        "line_start": 6449,
        "line_end": 6516,
        "kind": "function_decl",
        "symbol_names": [
          "aggregateCitationAuditMetadata"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "function aggregateCitationAuditMetadata("
      },
      {
        "line_start": 6517,
        "line_end": 6844,
        "kind": "function_decl",
        "symbol_names": [
          "runSynthesisMapReduceDispatch"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "async function runSynthesisMapReduceDispatch(args: {"
      },
      {
        "line_start": 6845,
        "line_end": 8495,
        "kind": "function_decl",
        "symbol_names": [
          "executeReviewPromptExecution"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "export async function executeReviewPromptExecution("
      },
      {
        "line_start": 8496,
        "line_end": 8532,
        "kind": "function_decl",
        "symbol_names": [
          "runReviewPromptExecution"
        ],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "export async function runReviewPromptExecution("
      },
      {
        "line_start": 8546,
        "line_end": 8556,
        "kind": "other",
        "symbol_names": [],
        "depth": 1,
        "doc_first_line": null,
        "signature_line": "if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {"
      }
    ],
    "hierarchy": [],
    "root_key": "1-8556"
  }
}
```

## 자료 Z

```json
{
  "authority": "non_authoritative",
  "provisional": true,
  "nodes": [
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1-8556",
      "summary": "이 모듈은 리뷰 프롬프트 실행 CLI의 전 과정을 담당한다. 실행 계약과 결과·취소·타임아웃·실패·진행 상태·실행기 설정을 정의하고, 렌즈 실행부터 재제출·오류 라우팅·숙의·issue artifact·problem framing·synthesis·continuation·재시도·검증·artifact 기록·CLI 종료까지 오케스트레이션한다.",
      "boundaries": [
        {
          "line": 4981,
          "before": "렌즈 실행 및 리뷰 실행 상태·오류·재시작 처리를 중심으로 한 실행 오케스트레이션",
          "after": "렌즈 결과 병합, issue artifact·숙의·problem framing·synthesis 및 continuation 후속 처리",
          "disposition": "structural_location_only"
        },
        {
          "line": 8546,
          "before": "synthesis와 continuation을 포함한 리뷰 프롬프트 실행 함수·CLI 진입 처리",
          "after": "모듈의 실행 코드가 끝나고 비심볼성 또는 종료 영역으로 전환",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1-4980",
      "summary": "리뷰 프롬프트 실행 CLI 모듈로, 실행 계약·결과·취소·타임아웃·실패·진행 상태와 실행기 설정을 정의하고 관련 검증·artifact 처리를 제공한다. 이후 영역에서는 재제출·오류 라우팅·salvage·상태 정규화·manifest 검증·재시작·재시도와 issue-stance, deliberation, synthesis 실행 및 continuation/frontier 병합을 오케스트레이션한다.",
      "boundaries": [
        {
          "line": 1604,
          "before": "실행 계약·타입·검증·보조 함수 중심의 리뷰 프롬프트 실행 기반",
          "after": "실패 라우팅·재제출·상태 병합과 deliberation/synthesis 오케스트레이션",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:4981-8556",
      "summary": "이 영역은 리뷰 프롬프트 실행의 후속 처리와 synthesis map-reduce 디스패치를 구현한다. 렌즈 결과를 병합하고 issue artifact·숙의·problem framing·synthesis 경로를 선택하며, 동시성·재시도·실패·검증·중단과 각종 실행 메타데이터 집계를 처리한다. 이어 artifact와 prompt packet을 검증·준비하고 continuation 단위를 실행하며, synthesis 결과와 실패를 기록하고 CLI 진입점과 종료 동작을 제공한다.",
      "boundaries": [
        {
          "line": 4998,
          "before": "후속 실행 함수 선언이 이어지는 구조",
          "after": "frontier 경로를 나타내는 타입 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 5004,
          "before": "타입 선언으로 실행 구조를 정의하는 구간",
          "after": "설명 주석 블록으로 전환",
          "disposition": "structural_location_only"
        },
        {
          "line": 5011,
          "before": "설명 주석으로 다음 처리 목적을 소개하는 구간",
          "after": "후속 리뷰 프롬프트 실행 함수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 6299,
          "before": "리뷰 후속 처리 함수 구현이 이어지는 구간",
          "after": "선언 헤더가 시작되는 구조",
          "disposition": "structural_location_only"
        },
        {
          "line": 6304,
          "before": "구조체 멤버 선언을 마무리하는 구간",
          "after": "새 함수 구현으로 전환",
          "disposition": "structural_location_only"
        },
        {
          "line": 8546,
          "before": "프롬프트 실행·synthesis 및 CLI 함수 구현",
          "after": "기타 후속 코드로 전환",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1604-4980",
      "summary": "리뷰 프롬프트 실행 런타임의 넓은 오케스트레이션 영역으로, 실패·재제출·오류 라우팅과 salvage 검증, 실행 결과·상태·degradation·artifact 메타데이터 정규화, context/consumer 행렬과 manifest 검증, 재시작·재시도·타임아웃을 처리한다. 또한 issue-stance·deliberation·synthesis 단위를 실행·검증하고 성공·실패·unavailable 결과를 continuation 및 frontier ledger에 병합한다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:6517-8556",
      "summary": "Implements review prompt execution and synthesis map-reduce dispatch by loading and validating artifacts, preparing work items and prompt packets, selecting runnable or preserved continuation units, executing with bounded concurrency and fallback handling, validating responses, recording failures or synthesis outputs, and exposing strict CLI entry points. The final region defines the asynchronous CLI launcher, release notice, direct invocation handling, and error exit behavior.",
      "boundaries": [
        {
          "line": 8546,
          "before": "The main review-execution and CLI delegation logic is complete.",
          "after": "The file switches to the asynchronous CLI launcher and direct-invocation exit handling.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:6517-8540",
      "summary": "Implements review prompt execution, including synthesis map-reduce dispatch. It loads and validates artifacts, builds synthesis work items and prompt packets, selects runnable or preserved continuation units, executes with bounded concurrency and fallback handling, validates responses, records failures or writes synthesis outputs, and exposes strict-argument CLI entry points that delegate execution and print the JSON result.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:2995-4980",
      "summary": "리뷰 프롬프트 실행 런타임의 두 하위 영역을 묶는 구조적 영역이다. 전반부는 실행 결과·저하 상태·artifact 및 semantic-quality 증거, digest·context/consumer 행렬·manifest·packet 참조, pre-dispatch 검증, 재시작·실패 기록, 재시도·타임아웃·보완 제출과 중첩 배치 실행을 지원한다. 후반부는 issue-stance·deliberation·synthesis 응답을 실행·검증하고, 성공 결과를 continuation unit으로, 실패 결과를 unit execution result로 frontier ledger에 병합하며 unavailable 대체 결과와 base result 보존을 처리한다.",
      "boundaries": [
        {
          "line": 3471,
          "before": "리뷰 실행 지원 함수들이 실행 결과와 재시도·중첩 배치 처리까지 다루는 흐름",
          "after": "상수 선언을 거쳐 이후 함수 기반 실행 보조 로직으로 전환",
          "disposition": "structural_location_only"
        },
        {
          "line": 4339,
          "before": "실행·manifest·재시도·중첩 단계 처리를 포함하는 함수 구현",
          "after": "다음 실행 단위 영역을 설명하는 주석 블록으로 전환",
          "disposition": "structural_location_only"
        },
        {
          "line": 4353,
          "before": "issue-stance·deliberation·synthesis 실행 지원 함수들",
          "after": "공통 실행 컨텍스트를 표현하는 선언 헤더와 멤버 속성으로 전환",
          "disposition": "structural_location_only"
        },
        {
          "line": 4372,
          "before": "공통 컨텍스트 선언과 주석 기반 경계",
          "after": "응답 단위 실행·검증을 수행하는 함수 구현으로 전환",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:6517-8495",
      "summary": "The visible region implements the synthesis map-reduce dispatch path: it loads and validates review artifacts, creates synthesis work items and prompt packets, selects runnable versus preserved continuation units, executes synthesis units with bounded concurrency and nested-stage fallback, validates responses, records failures or writes the synthesis ledger and markdown projection, and returns aggregate execution outcomes. The source is truncated before the full failure-handling tail and does not show executeReviewPromptExecution.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1-1603",
      "summary": "리뷰 프롬프트 실행 CLI 모듈입니다. 실행·취소·타임아웃·출력 계약·실패·진행 상태를 표현하는 타입과 계약을 정의하고, 실행 결과와 메타데이터를 다루는 보조 함수 및 렌즈 완료 장벽 계산·저장, 실행기별 LLM 설정, frontmatter·렌즈·구조화 artifact·출력 검증, 렌즈 집합과 합성 상태 처리를 제공합니다.",
      "boundaries": [
        {
          "line": 193,
          "before": "암호화·프로세스·파일·설정·아티팩트·LLM 등 외부 의존성을 가져오는 import 영역",
          "after": "실행 결과와 오류, 취소, 정책을 표현하는 타입 선언 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 288,
          "before": "실행 관련 타입과 계약을 모아 정의하는 선언 영역",
          "after": "오류 정규화와 렌즈 실행 완료 장벽 계산·저장을 수행하는 함수 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 490,
          "before": "기본 실행 보조 함수와 결과 처리 로직",
          "after": "실행기 설정, 런타임 정책, 출력·frontmatter·artifact 검증 보조 로직",
          "disposition": "structural_location_only"
        },
        {
          "line": 1160,
          "before": "렌즈·합성 상태 검증을 수행하는 함수 영역",
          "after": "후속 실행 결과와 상태를 구성하는 상수·선언 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:4981-6516",
      "summary": "렌즈 실행 후 리뷰를 계속하기 위한 frontier 및 후속 디스패치 흐름을 정의한다. 실행 결과를 scaffold와 ledger에 병합하고 issue artifact, deliberation, problem framing, synthesis 경로를 선택하며, issue-stance 응답의 동시성·재시도·실패·검증·중단 처리를 수행한다. 이어서 숙의와 synthesis 결과 구조를 구성하고 YAML 작업 항목을 검증하며, executor·호출·토큰·반복·artifact·semantic quality·citation audit 메타데이터를 집계하고 중복을 제거한다.",
      "boundaries": [
        {
          "line": 4998,
          "before": "렌즈 후속 실행을 수행하는 함수 선언",
          "after": "frontier 경로를 표현하는 타입 별칭 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 5004,
          "before": "frontier 관련 타입 정의",
          "after": "후속 실행 목적을 설명하는 주석 블록",
          "disposition": "structural_location_only"
        },
        {
          "line": 5011,
          "before": "설명 주석 블록",
          "after": "후속 frontier 경로 선택 또는 실행 함수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 6299,
          "before": "숙의·synthesis 결과 처리 함수 본문",
          "after": "결과 메타데이터 집계를 위한 선언 헤더",
          "disposition": "structural_location_only"
        },
        {
          "line": 6301,
          "before": "집계 함수 선언 헤더",
          "after": "집계 대상 메타데이터 멤버 속성",
          "disposition": "structural_location_only"
        },
        {
          "line": 6303,
          "before": "집계 대상 메타데이터 멤버 속성",
          "after": "멤버 정의를 닫는 선언 footer",
          "disposition": "structural_location_only"
        },
        {
          "line": 6304,
          "before": "메타데이터 구조 선언 종료",
          "after": "다음 실행 결과 처리 함수 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:2995-4473",
      "summary": "리뷰 프롬프트 실행을 지원하는 함수들과 실행 흐름을 구현한다. 실행 결과·저하 상태·artifact-generation 및 semantic-quality 증거를 정규화하고, digest·consumer/context 행렬·JSON·manifest·packet 참조를 결정적으로 처리한다. pre-dispatch 검증, context manifest와 생성 패킷 참조 관리, 실행 결과 평탄화와 manifest 기록, 재시작·실패 기록, 프로필별 재시도·타임아웃·보완 제출, 중첩 단계와 배치 시도 처리를 포함한다.",
      "boundaries": [
        {
          "line": 3473,
          "before": "지원 함수·검증 및 산출물 보조 로직",
          "after": "컨텍스트 manifest·패킷 참조와 실행 디스패치·결과 처리 로직",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1604-2994",
      "summary": "리뷰 프롬프트 실행의 실패 처리·재제출·오류 라우팅과 frozen salvage 검증을 지원하고, 이어서 deliberation·synthesis 단위 식별, 실행 결과 및 메타데이터 정규화·기록, 인용 감사, 전체 상태·실패 하위 결과·degradation 경로 계산을 오케스트레이션한다.",
      "boundaries": [
        {
          "line": 2023,
          "before": "실패·재제출·오류와 frozen violation을 처리하는 보조 로직",
          "after": "deliberation·synthesis 실행 단위와 결과 정규화·상태 계산을 담당하는 실행 보조 로직",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:490-1603",
      "summary": "리뷰 프롬프트 실행을 지원하는 타입과 보조 함수들을 모은 영역입니다. 실행기 설정과 런타임 정책을 계산하고, 취소·타임아웃·출력 계약·이슈 아티팩트·controlled-deliberation 오류를 표현·변환합니다. 또한 실행기별 LLM·단위 설정, frontmatter·렌즈 메타데이터·구조화 artifact·출력 크기와 비어 있지 않은 결과를 검증하며 렌즈 집합과 합성 상태를 처리합니다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:3473-4473",
      "summary": "리뷰 실행에서 컨텍스트 매니페스트와 생성 프롬프트 패킷 참조를 관리하고, 실행 단위 결과를 평탄화해 상태·시간·실행기·증거·세션·provenance가 포함된 매니페스트를 기록합니다. 또한 재시작·실패 기록과 단일 디스패치의 프로필별 재시도·타임아웃·보완 제출, 중첩 단계 실행 및 배치 시도 결과 처리를 지원합니다.",
      "boundaries": [
        {
          "line": 4339,
          "before": "함수 선언들이 실행·재시도 및 중첩 단계 처리를 구성함",
          "after": "주석 블록이 다음 실행 처리 구간의 구조를 전환함",
          "disposition": "structural_location_only"
        },
        {
          "line": 4345,
          "before": "주석으로 설명된 실행 처리 구간",
          "after": "새 함수 선언이 중첩 단계 실행 처리를 시작함",
          "disposition": "structural_location_only"
        },
        {
          "line": 4353,
          "before": "중첩 단계 실행 함수 선언",
          "after": "선언 헤더가 배치 시도 결과 구조를 도입함",
          "disposition": "structural_location_only"
        },
        {
          "line": 4372,
          "before": "배치 시도 구조 설명과 멤버 정의",
          "after": "새 함수 선언이 이후 실행 로직을 시작함",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:2023-2994",
      "summary": "이 영역은 review 실행을 지원하는 보조 함수와 실행 오케스트레이션을 구현한다. 앞부분은 deliberation·synthesis 단위 식별, 실패·unsupported reference 처리, frozen violation 및 실행 메타데이터 파싱을 담당한다. 뒷부분은 리뷰 단위를 실행하고 결과·인용 감사·아티팩트를 정규화·기록하며, 전체 상태와 실패 하위 결과, deliberation·synthesis 완료 여부 및 degradation 경로를 계산한다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:5741-6516",
      "summary": "이 영역은 통제된 렌즈 숙의와 synthesis 실행 결과 처리를 구성한다. 이슈별 숙의 및 synthesis 결과 구조를 정의하고, YAML artifact에서 작업 항목을 찾아 검증 실패를 구조화된 실패로 기록한다. 이어서 실행 결과의 executor 메타데이터를 토큰·호출·반복·host/model·artifact 생성·semantic-quality·native-admission·tool-boundary·citation-audit 기준으로 집계하고 중복 값을 제거한다.",
      "boundaries": [
        {
          "line": 6299,
          "before": "통제된 렌즈 숙의와 synthesis 결과·검증 실패를 처리하는 함수 영역",
          "after": "실행 결과에서 executor 메타데이터를 집계하는 선언 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 6304,
          "before": "executor 메타데이터 집계 관련 타입 또는 구조 선언",
          "after": "실행 결과들의 메타데이터를 결합하는 함수 구현",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:835-1603",
      "summary": "리뷰 프롬프트 실행을 지원하는 CLI 보조 함수들을 구현합니다. 실행기별 LLM·단위 설정을 구성하거나 제거하고, Markdown·YAML frontmatter·렌즈 메타데이터·구조화 artifact·출력 크기와 비어 있지 않은 결과를 검증합니다. 렌즈 집합의 중복·일치·누락·실패를 확인하며, 취소 요청과 오류 종류를 처리하고 합성 상태·사유·참여 메타데이터를 표현합니다.",
      "boundaries": [
        {
          "line": 1160,
          "before": "렌즈 실행 설정, 파일·Markdown·도메인 제약 검증을 제공하는 CLI 보조 함수들",
          "after": "합성 상태와 참여 메타데이터를 정의하고 렌즈 결과·출력 계약 검증을 수행하는 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 1171,
          "before": "합성 및 렌즈 결과 처리에 필요한 상수·구조 정의",
          "after": "합성 상태·사유와 참여 frontmatter 필드 구조를 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 1183,
          "before": "합성·참여 메타데이터 구조 선언",
          "after": "렌즈 집합, frontmatter, Markdown, 취소·오류 및 출력 계약 검증 함수들",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:4981-5740",
      "summary": "렌즈 실행 이후 리뷰를 계속하기 위한 frontier 구조와 후속 디스패치 흐름을 정의한다. 실행 결과를 scaffold에 병합해 frontier ledger를 초기화하고, issue artifact·deliberation·problem framing·synthesis 경로를 선택한다. 또한 issue artifact 진행 상태와 출력 경로를 설정하고, finding·relation·issue ledger를 바탕으로 렌즈별 issue-stance 응답을 디스패치하며 동시성, 재시도, breaker, 결과 복원·집계, 실패·검증 분류와 중단 아티팩트 기록을 처리한다.",
      "boundaries": [
        {
          "line": 4998,
          "before": "렌즈 실행 결과를 frontier ledger로 초기화하는 함수 선언",
          "after": "후속 frontier 경로를 표현하는 타입 별칭 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 5004,
          "before": "후속 frontier 경로 타입 정의",
          "after": "issue artifact 및 후속 단계 진행을 설명하는 주석 블록",
          "disposition": "structural_location_only"
        },
        {
          "line": 5011,
          "before": "후속 단계의 목적·구조를 설명하는 주석",
          "after": "issue artifact 디스패치와 진행 상태 처리를 구현하는 함수 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:5039-5740",
      "summary": "리뷰 이슈 아티팩트의 진행 상태와 출력 경로를 정한 뒤, 렌즈별 issue-stance 응답 디스패치를 수행하는 영역이다. finding·relation·issue ledger를 입력으로 프롬프트 패킷을 구성하고, continuation 대상과 보존 결과를 구분하며, 동시성 워커·재시도·breaker·결과 복원·집계·실패 및 검증 분류·중단 아티팩트 기록을 다룬다.",
      "boundaries": [
        {
          "line": 5067,
          "before": "아티팩트 진행 상태와 식별자별 출력 경로를 결정하는 순수한 경로·메타데이터 처리",
          "after": "렌즈별 issue-stance 실행을 위한 입력 투영, 프롬프트 구성, 디스패치와 결과 관리",
          "disposition": "adversarial_confirmed"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:5067-5740",
      "summary": "이 영역은 렌즈별 issue-stance 응답을 준비하고 실행하는 비동기 디스패치 함수로 보인다. finding·relation·issue ledger를 읽어 입력 투영과 프롬프트 패킷을 만들고, continuation에서 실행 대상과 보존 결과를 구분한다. nested 최초 시도, 동시성 워커, 재시도·breaker 상태, 보존 결과 복원, 결과 집계와 실패·검증 분류 및 중단 아티팩트 기록을 처리한다. 제공된 소스는 후반부가 잘려 있다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:5741-6346",
      "summary": "이 영역은 이슈 범위의 통제된 렌즈 숙의를 조정하는 함수와 synthesis 결과·이슈별 결과를 담는 인터페이스를 포함한다. 또한 YAML artifact 참조로 synthesis 작업 항목을 찾고, 검증 실패를 구조화된 실행 실패로 변환해 출력 파일을 제거하고 실행 로그에 기록하는 비동기 실패 처리 헬퍼를 정의한다.",
      "boundaries": [
        {
          "line": 6299,
          "before": "통제된 렌즈 숙의 조정과 synthesis 결과 구조를 다루는 함수·타입 영역",
          "after": "synthesis 작업 항목 식별 및 검증 실패 변환을 담당하는 헬퍼 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 6304,
          "before": "YAML artifact 참조와 구조화된 실패 결과를 위한 선언부",
          "after": "synthesis 작업 항목 조회 및 비동기 실패 처리 함수 선언",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:5741-6303",
      "summary": "이 영역은 이슈 범위의 통제된 렌즈 숙의를 조정하는 함수와, 전체 outcome 및 이슈별 issueOutcomes를 함께 담는 SynthesisMapReduceResult 인터페이스를 포함한다. 함수는 실행 모드·숙의 산출물·작업 항목·프롬프트·continuation 결과·worker 응답·검증·실패 및 unavailable fallback을 처리하며, 보이는 범위는 teamlead resolution 준비 중 끝난다.",
      "boundaries": [
        {
          "line": 6299,
          "before": "통제된 렌즈 숙의를 조정하는 함수 선언부",
          "after": "SynthesisMapReduceResult 인터페이스 선언부",
          "disposition": "structural_location_only"
        },
        {
          "line": 6301,
          "before": "인터페이스 헤더",
          "after": "outcome와 issueOutcomes 멤버 속성 정의",
          "disposition": "structural_location_only"
        },
        {
          "line": 6303,
          "before": "인터페이스 멤버 속성",
          "after": "인터페이스 선언 종료",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:5741-6298",
      "summary": "The function orchestrates controlled, issue-scoped lens deliberation. It verifies the execution mode, loads deliberation artifacts, builds work items and dispatches, prepares prompt packets, optionally preserves continuation results, runs nested or concurrent deliberation workers with retries, validates response artifacts, records output-contract failures, and creates unavailable-response fallbacks. The visible source ends while preparing the teamlead resolution stage, so its completion behavior is not shown.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:2450-2994",
      "summary": "구성된 리뷰 실행을 시작하고 결과를 기록·검증·파싱한 뒤 ReviewUnitExecutionResult로 정규화합니다. 하위 실행 결과와 인용 감사 정보를 처리하고 렌즈·이슈 아티팩트·숙의·선택적 종합 결과를 평탄화하며, 이후 보존된 결과를 인덱싱·변환하고 전체 실행 상태, 실패 하위 결과, 숙의·종합 완료 여부, degradation 경로와 실패 기록을 계산합니다.",
      "boundaries": [
        {
          "line": 2622,
          "before": "리뷰 실행 결과를 시작·처리·정규화하는 함수 구현",
          "after": "실행 결과 처리 보조 로직에 대한 설명 블록",
          "disposition": "structural_location_only"
        },
        {
          "line": 2626,
          "before": "실행 결과 처리 보조 로직에 대한 설명 블록",
          "after": "이전 결과 보존, 상태 계산, 실패 기록을 담당하는 함수 구현",
          "disposition": "structural_location_only"
        },
        {
          "line": 2770,
          "before": "이전 결과와 실패 상태를 계산하는 함수 구현",
          "after": "후속 결과 처리 보조 로직에 대한 설명 블록",
          "disposition": "structural_location_only"
        },
        {
          "line": 2779,
          "before": "후속 결과 처리 보조 로직에 대한 설명 블록",
          "after": "보존 결과 변환·상태·degradation 기록을 담당하는 함수 구현",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:3946-4473",
      "summary": "리뷰 실행의 재시작·실패 기록과 단일 디스패치의 프로필별 재시도·타임아웃·보완 제출을 지원한다. 이어서 중첩 단계 실행을 위해 executor 프로필을 구분하고, 배치 시도 결과 구조와 첫 실행기를 정의하여 디스패치 준비, 웨이브·타임아웃 제어, 진행 기록, 결과 매핑 및 완료 정보를 처리한다.",
      "boundaries": [
        {
          "line": 4345,
          "before": "단일 디스패치 재시도·실패 기록과 실행 산출물 처리를 담당하는 함수 영역",
          "after": "중첩 단계 실행을 위한 프로필 브랜딩, 배치 결과 구조, 첫 시도 실행 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:4474-4980",
      "summary": "이 영역은 리뷰 실행 단위의 공통 컨텍스트를 바탕으로 issue-stance, deliberation, synthesis 응답을 실행·검증하고, 중첩 실행 및 flat-dispatch 재시도와 unavailable 대체 결과를 처리한다. 성공 결과는 continuation unit으로, 실패 결과는 unit execution result로 frontier ledger에 병합하며 base result를 선택적으로 보존한다.",
      "boundaries": [
        {
          "line": 4572,
          "before": "중첩 실행·fallback·재시도 및 공통 실행 컨텍스트와 issue-stance 처리를 다루는 함수들",
          "after": "참여자 불가 시 unavailable 응답 artifact를 작성·검증하는 대체 경로",
          "disposition": "structural_location_only"
        },
        {
          "line": 4739,
          "before": "issue-stance 및 unavailable 응답 처리",
          "after": "deliberation·synthesis 응답 실행과 unavailable 결과 보존",
          "disposition": "structural_location_only"
        },
        {
          "line": 4923,
          "before": "deliberation·synthesis 응답 단위 실행 및 실패 처리",
          "after": "실행 결과를 continuation unit 또는 unit execution result로 frontier ledger에 병합",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1-489",
      "summary": "리뷰 프롬프트 실행 CLI 모듈로, 리뷰 실행에 필요한 암호화·프로세스·파일·설정·아티팩트·실패·렌즈·LLM 관련 의존성을 가져온다. 이어서 실행 구성, dispatch 결과, 성공·실패·진행 상태, 메타데이터와 출력 경로를 나타내는 타입 및 계약을 정의하고, 오류·참조 문자열 정규화와 렌즈 실행 완료 장벽의 계산·저장을 위한 보조 함수를 제공한다.",
      "boundaries": [
        {
          "line": 193,
          "before": "외부 모듈 의존성을 import하는 영역",
          "after": "실행 결과와 실패·메타데이터를 표현하는 타입 선언 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 288,
          "before": "실행 구성과 결과 계약을 구성하는 선언 영역",
          "after": "오류 정규화와 완료 장벽 계산·저장을 수행하는 함수 영역",
          "disposition": "structural_location_only"
        },
        {
          "line": 487,
          "before": "리뷰 실행 보조 함수의 구현 영역",
          "after": "후속 주석 블록 영역",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:2995-3472",
      "summary": "리뷰 프롬프트 실행을 위한 지원 함수들을 묶은 영역이다. 실행 결과와 저하 상태, artifact-generation·semantic-quality 증거를 정규화하고 관련 산출물과 구조화된 실패를 기록한다. 또한 파일 digest, lens consumer와 context source 행렬을 계산하며, JSON·manifest·packet 참조를 결정적으로 처리하고 pre-dispatch 전에 packet 존재·consumer binding·허용 consumer·파일 hash·context 참조 적격성을 검증한다.",
      "boundaries": [
        {
          "line": 3471,
          "before": "리뷰 context manifest와 packet 참조를 검증하는 함수 선언들이 이어지는 구간",
          "after": "생성된 packet 참조를 등록하기 위한 queue map 상수 선언으로 전환",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:3473-3945",
      "summary": "리뷰 실행의 컨텍스트 매니페스트와 생성된 프롬프트 패킷 참조를 관리하고, 실행 단위 결과를 평탄화해 상태·시간·실행기·증거·세션 및 provenance 정보가 포함된 리뷰 실행 매니페스트를 기록합니다. 패킷 참조는 실행·등록 조건과 매니페스트 유효성을 확인하며, 새 실행 시 비정적 참조를 정리합니다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1160-1603",
      "summary": "이 영역은 리뷰 실행과 합성 단계의 계약 검증 보조 기능을 구현합니다. 합성 상태·사유 및 참여 메타데이터를 정의하고, 렌즈 집합의 중복·일치·누락·실패 여부, YAML frontmatter와 Markdown 구조, 렌즈 sidecar·구조화 artifact·출력 크기·비어 있지 않은 실행 결과를 검증합니다. 취소 요청을 읽고 오류를 실행 단위 실패 종류로 분류하며 timeout과 출력 계약 오류는 보존합니다.",
      "boundaries": [
        {
          "line": 1171,
          "before": "합성 참여 상태와 사유를 나타내는 상수·타입 정의",
          "after": "합성 참여 frontmatter의 필드 구조 정의",
          "disposition": "structural_location_only"
        },
        {
          "line": 1176,
          "before": "한 합성 참여 메타데이터 구조의 종료",
          "after": "렌즈 집합과 출력 계약을 검증하는 함수 구현 시작",
          "disposition": "structural_location_only"
        },
        {
          "line": 1183,
          "before": "합성 참여 메타데이터 타입 정의의 종료",
          "after": "취소·출력·렌즈 참여 검증 및 오류 분류 헬퍼 구현",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:2023-2449",
      "summary": "이 영역은 review 실행 중 deliberation·synthesis 단위의 식별자와 실패를 처리하는 보조 함수들을 제공한다. 지원되지 않는 evidence reference를 감지해 재제출 오류 사양을 적용하고, frozen violation을 읽으며, synthesis issue ID를 추출한다. 또한 citation audit, executor run, native admission, tool-boundary skip 메타데이터를 제한적으로 파싱해 유효한 값만 반환하고, host runtime 여부를 판별한다.",
      "boundaries": [
        {
          "line": 2145,
          "before": "deliberation 단위 식별·재제출 오류와 frozen 위반을 다루는 함수들",
          "after": "synthesis 재제출 오류 및 실행 메타데이터 파싱 보조 함수들",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1604-2022",
      "summary": "리뷰 프롬프트 실행의 실패 처리와 재제출 경로를 지원한다. 첫 부분은 실패 분류, 재시도·resubmission correction 적격성, 타임아웃과 dispatch breaker 해석·기록·영속화를 다룬다. 이어 breaker 종료와 불완전 artifact, issue-stance 재제출 및 frozen salvage의 unsupported reference 오류를 표현하고, 단위별 오류 명세·라우팅·재시도 검사·조건부 매니페스트 해시 갱신을 연결한다.",
      "boundaries": [
        {
          "line": 1791,
          "before": "dispatch breaker와 실패 결과를 기록·영속화하는 함수군",
          "after": "재제출 오류 적용과 라우팅을 위한 고정 설정·함수군",
          "disposition": "structural_location_only"
        },
        {
          "line": 1914,
          "before": "재제출 관련 함수 구현과 오류 처리",
          "after": "ResubmitUnitRouting 구조와 멤버 속성 정의",
          "disposition": "structural_location_only"
        },
        {
          "line": 1925,
          "before": "ResubmitUnitRouting 구조 정의",
          "after": "재제출 오류 명세와 적격성·해시 갱신 함수 구현",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:3946-4344",
      "summary": "이 영역은 리뷰 실행 재시작과 실패 기록을 지원하고, 단일 디스패치 실행에 프로필별 재시도·타임아웃·오류 명세 재제출을 적용한다. 성공 시 실행 메타데이터와 산출물 크기를 반환하며, 조건에 따라 frozen salvage 입력으로 보완 제출을 시도하고 실패 정보를 기록한다.",
      "boundaries": [
        {
          "line": 4339,
          "before": "단일 디스패치 재시도·salvage 처리를 구현하는 함수 영역",
          "after": "이후 영역의 주석 블록으로 전환",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:490-834",
      "summary": "리뷰 프롬프트 실행에 필요한 실행기 설정과 런타임 정책을 계산하고, 취소·타임아웃·출력 계약·이슈 아티팩트·controlled-deliberation 관련 오류를 타입과 변환 결과로 표현합니다. 오류에서 실행 결과, 배치 결과, 중단 사유와 렌즈 정보를 보존하며, 실행 프로필과 환경 설정에 따라 재시도·지연·타임아웃·동시성·출력 한도를 결정합니다.",
      "boundaries": [
        {
          "line": 532,
          "before": "실행기 설정과 정책을 계산하는 함수들",
          "after": "실행 취소 요청 아티팩트 타입 정의",
          "disposition": "structural_location_only"
        },
        {
          "line": 543,
          "before": "취소 요청 아티팩트의 필드 정의",
          "after": "리뷰 실행 결과 초안 타입 정의",
          "disposition": "structural_location_only"
        },
        {
          "line": 553,
          "before": "실행 결과 초안의 구조 정의",
          "after": "오류에서 실패 실행 결과를 변환하는 함수",
          "disposition": "structural_location_only"
        },
        {
          "line": 584,
          "before": "실행 오류 변환 및 보존 로직",
          "after": "리뷰 유닛 타임아웃 오류 타입과 판별 함수",
          "disposition": "structural_location_only"
        },
        {
          "line": 626,
          "before": "타임아웃·출력 계약·이슈 오류 처리",
          "after": "controlled-deliberation 디스패치 오류와 결과 변환",
          "disposition": "structural_location_only"
        },
        {
          "line": 649,
          "before": "controlled-deliberation 오류·중단 정보 추출",
          "after": "실행 프로필 기반 지연·재시도·제한 계산",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:2450-2778",
      "summary": "이 영역은 구성된 리뷰 실행기를 시작하고 실행 결과를 기록·검증·파싱한 뒤, 보존된 실행 결과를 ReviewUnitExecutionResult로 정규화한다. 하위 실행 결과를 재귀적으로 처리하고 인용 감사 정보를 반영하며, 렌즈·이슈 아티팩트·숙의·선택적 종합 루트의 결과를 평탄화하되 salvaged-submit 부모에서 중단하고 아티팩트가 없으면 결과를 반환하지 않는다.",
      "boundaries": [
        {
          "line": 2622,
          "before": "실행기 호출·출력 스트림·타임아웃·종료·출력 검증을 처리하는 함수 구현",
          "after": "실행 결과를 단위 결과로 투영하고 마커 손실을 방지하는 보조 로직으로 전환",
          "disposition": "structural_location_only"
        },
        {
          "line": 2626,
          "before": "보존된 실행 결과 투영에 대한 설명 주석",
          "after": "보존 결과 정규화와 하위 결과 재귀 처리를 정의하는 함수 구현",
          "disposition": "structural_location_only"
        },
        {
          "line": 2770,
          "before": "리뷰 단위 결과를 수집·평탄화하는 함수 구현",
          "after": "후속 주석 블록으로 전환",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:162-489",
      "summary": "리뷰 프롬프트 실행 모듈의 타입·결과 계약과 보조 함수들을 정의합니다. 실행 구성과 dispatch 결과, 성공·실패·진행 상태, 실행 메타데이터 및 출력 경로를 구조화하고, 오류·참조 문자열을 정규화하며 렌즈 실행 완료 장벽을 계산·저장합니다.",
      "boundaries": [
        {
          "line": 193,
          "before": "파일의 import 선언들이 실행 모듈에 필요한 외부 구조를 구성한다.",
          "after": "실행 구성과 결과 계약을 표현하는 선언이 시작된다.",
          "disposition": "structural_location_only"
        },
        {
          "line": 288,
          "before": "실행 결과·실패·메타데이터 타입 선언이 이어진다.",
          "after": "리뷰 프롬프트 실행을 지원하는 함수 구현이 시작된다.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:835-1159",
      "summary": "리뷰 프롬프트 실행을 지원하는 CLI 보조 함수 영역입니다. Codex·inline HTTP 실행기의 LLM 및 단위 실행 옵션을 구성하거나 제거하고, 지원되지 않는 설정을 거부합니다. 파일 크기와 Markdown 구조를 다루며, 필수 헤딩·섹션·목록·도메인 제약 및 맥락 가정이 출력 계약에 맞는지 검증합니다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:3626-3945",
      "summary": "리뷰 실행 전 컨텍스트 매니페스트와 관련 입력의 유효성을 확인하고, 각 리뷰 단위의 실행 결과를 상태·시간·실행기·증거 정보와 함께 매니페스트 항목으로 구성합니다. 중첩된 단위 결과를 재귀적으로 평탄화한 뒤 세션·실행 계약·재개·재시도·아티팩트·중단·합성 provenance를 포함한 리뷰 실행 매니페스트 YAML을 기록합니다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:2145-2449",
      "summary": "재제출 가능한 synthesis 오류를 감지·기록하고, frozen synthesis 실패 입력과 executor stdout에서 제한된 실행 메타데이터를 읽어 검증하는 보조 함수들을 구현한다. 입력의 구조와 필드 형식을 확인하며, 잘못되거나 비어 있는 값은 null 또는 undefined로 처리하고 인식·검증된 메타데이터만 선택적으로 반환한다.",
      "boundaries": [
        {
          "line": 2206,
          "before": "synthesis 오류 처리와 입력·메타데이터 검증을 수행하는 함수 선언 영역",
          "after": "이후 보조 함수들의 목적을 설명하는 주석 블록으로 전환",
          "disposition": "structural_location_only"
        },
        {
          "line": 2208,
          "before": "보조 함수 목적을 설명하는 주석 블록",
          "after": "호스트 런타임 인식 및 구조화된 review 메타데이터 파싱 함수 선언 영역으로 전환",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1303-1603",
      "summary": "Provides review execution helpers for cancellation, output validation, synthesis participation, and error classification. It validates expected/received/missing or failed lens sets, Markdown frontmatter and structure, lens sidecars, structured artifacts, profile- and dispatch-derived size limits, and non-empty executor output. It also reads cancellation requests and preserves timeout and output-contract failure classifications while mapping other errors to review-unit failure kinds.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:4047-4344",
      "summary": "실행 디스패치를 시도하고, 프로필별 재시도·타임아웃·오류 명세 재제출을 적용한다. 성공하면 실행 메타데이터와 산출물 크기를 반환하며, 예산 소진 후 조건이 충족되면 frozen salvage 입력으로 submit salvage를 시도한다. salvage도 실패하면 오류를 기록하고 실패 결과를 반환한다.",
      "boundaries": [
        {
          "line": 4339,
          "before": "단일 디스패치의 재시도·salvage·실패 기록을 처리하는 함수 구현",
          "after": "nested batch 경로를 식별하기 위한 downstream용 브랜드 설명 주석",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:4474-4738",
      "summary": "이 영역은 중첩 실행의 첫 시도와 flat-dispatch fallback·재시도 처리를 결합하는 경로와, 리뷰 실행 단위의 공통 컨텍스트 계약을 정의한다. 또한 issue-stance 단위를 dispatch·검증하고 실패를 기록하는 경로와, 참여자 불가 시 unavailable 응답 artifact를 작성·검증하는 대체 경로를 제공한다.",
      "boundaries": [
        {
          "line": 4572,
          "before": "중첩 배치의 첫 시도·fallback·재시도 실행 로직",
          "after": "실행 컨텍스트 계약과 issue-stance/unavailable 응답 경로",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:3226-3472",
      "summary": "Provides review-execution helpers for deterministic JSON support, structured manifest-validation failures, packet-reference mapping, manifest-path resolution, and pre-dispatch validation. It reads the review context manifest and verifies packet existence, consumer bindings, admitted consumers, file hashes, and context-reference eligibility, while declaring a queue map for generated packet-reference registration.",
      "boundaries": [
        {
          "line": 3471,
          "before": "Functions validate manifest and prompt packet references against dispatch-time eligibility and integrity rules.",
          "after": "A constant map is declared to queue registration data for generated packet references.",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:4739-4980",
      "summary": "리뷰 실행 중 deliberation·synthesis 응답 단위를 처리하고, 실패 시 unavailable 결과와 실패 메타데이터를 보존한다. 또한 성공한 실행 결과는 검증된 continuation unit으로, 실패 결과는 unit execution result로 frontier ledger에 병합하며 선택적 base result를 유지한다.",
      "boundaries": [
        {
          "line": 4780,
          "before": "deliberation 응답 단위 실행 및 실패 보완 로직",
          "after": "synthesis 응답 단위 실행 로직",
          "disposition": "structural_location_only"
        },
        {
          "line": 4852,
          "before": "synthesis 응답 실행과 실패 메타데이터 보존",
          "after": "frontier ledger 병합 헬퍼",
          "disposition": "structural_location_only"
        },
        {
          "line": 4923,
          "before": "응답 실행 함수들의 종료",
          "after": "mergeOutcomeIntoFrontierLedger 관련 주석 및 병합 로직",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1791-2022",
      "summary": "리뷰 프롬프트 실행 과정에서 디스패치 브레이커 종료 사유와 불완전 artifact를 표현·영속화하고, 옵트인된 issue-stance 재제출 및 frozen salvage 입력의 unsupported evidence-reference 오류를 분류한다. 이어 재제출 라우팅 계약과 고정 테이블을 정의해 단위 형식별 실패 분류, 오류 명세 적용, 재시도 적격성 검사, 조건부 매니페스트 패킷 해시 갱신을 연결한다.",
      "boundaries": [
        {
          "line": 1901,
          "before": "실행 중단·불완전 artifact·재제출 오류를 분류하고 영속화하는 보조 함수들의 묶음",
          "after": "재제출 실행의 라우팅 계약과 형식별 오류·재시도 처리를 정의하는 선언부",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:2995-3225",
      "summary": "이 영역은 리뷰 프롬프트 실행의 산출물과 실패를 관리하는 함수들을 구현한다. 실행 결과의 저하 상태, artifact-generation 및 semantic-quality 증거를 정규화하고 execution-result 산출물을 기록하며, malformed output 실패를 구조화한다. 또한 파일 SHA-256 digest, lens consumer 식별자, consumer별 context source 행렬을 계산한다.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:2779-2994",
      "summary": "This region provides review execution result-processing helpers: it indexes and converts prior unit results into preserved execution outcomes, derives overall execution status, recursively counts failed child outcomes while excluding recovered audit-only children, validates completed deliberation and synthesis, resolves degradation-summary paths, and converts failed units into degradation failure records with preserved metadata and attempt counts.",
      "boundaries": []
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:633-834",
      "summary": "controlled-deliberation 디스패치 오류를 표현하고 오류에서 실행·실패 결과와 중단 렌즈 정보를 추출합니다. 중단 artifact 필드와 비동기 지연을 구성하며, dispatch unit을 canonical execution-settings 식별자와 선택적 실행 프로필에 매핑합니다. 또한 실행 프로필·결과·환경 설정으로 재시도, 지연, 타임아웃, 동시 렌즈 수, 출력 한도를 계산하고 CLI 옵션 및 inline HTTP/LLM override를 정리합니다.",
      "boundaries": [
        {
          "line": 746,
          "before": "오류 처리, 중단 artifact 구성, 지연, 실행 설정 식별·조회 헬퍼",
          "after": "실행 프로필과 결과를 이용한 dispatch 재시도·제한값 계산 및 CLI override 정리",
          "disposition": "adversarial_confirmed"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1303-1501",
      "summary": "Provides review execution validation and cancellation helpers. It classifies synthesize participation from received lenses, validates synthesis frontmatter against expected, received, and missing or failed lens sets, enforces markdown structure and metadata by execution unit kind, and reads a cancellation request artifact when present.",
      "boundaries": [
        {
          "line": 1367,
          "before": "Synthesize participation truth and frontmatter consistency validation.",
          "after": "Markdown output contract validation by execution unit kind, plus cancellation artifact reading.",
          "disposition": "adversarial_confirmed"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:292-489",
      "summary": "리뷰 프롬프트 실행을 지원하는 보조 함수 영역이다. 실행 결과의 성공·실패와 진행 상황을 기록하고, 경계 상태·파일시스템 범위·리뷰 단위 컨텍스트를 렌더링한다. 렌즈 및 artifact의 출력 경로와 형식을 결정하며, 허용된 읽기 참조와 문자열을 정규화·중복 제거하고 필수 문자열을 검증한다. 마지막으로 렌즈 실행 완료 장벽을 계산·저장한다.",
      "boundaries": [
        {
          "line": 487,
          "before": "렌즈 실행 완료 장벽을 계산·저장하는 함수 선언 영역",
          "after": "후속 주석 블록으로 전환",
          "disposition": "structural_location_only"
        }
      ]
    },
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:1604-1790",
      "summary": "리뷰 실행 단위의 실패 처리 정책을 구현한다. 실패를 executor 오류·출력 계약 위반·일시적 또는 시스템적 실패로 분류하고, 재시도 한도와 설정에 따라 일반 재시도나 resubmission correction 가능 여부를 판단한다. 재시도별 타임아웃과 선택적 dispatch breaker를 해석하며, nested batch 결과를 breaker에 기록하고 실패 시 관련 분류·메시지·시도 정보를 남긴다.",
      "boundaries": [
        {
          "line": 1622,
          "before": "실패 분류·재시도 정책을 위한 상수 정의",
          "after": "실패 메시지와 실행 결과를 해석하는 함수 선언",
          "disposition": "structural_location_only"
        },
        {
          "line": 1704,
          "before": "실패 분류·재시도 정책 함수군",
          "after": "타임아웃과 dispatch breaker 정책을 다루는 함수군",
          "disposition": "structural_location_only"
        },
        {
          "line": 1738,
          "before": "재시도 타임아웃 및 breaker 설정 해석",
          "after": "실행 결과를 시스템적 실패 종류로 분류",
          "disposition": "structural_location_only"
        },
        {
          "line": 1769,
          "before": "시스템적 실패 분류 함수",
          "after": "nested batch 결과를 breaker에 기록하는 함수",
          "disposition": "structural_location_only"
        }
      ]
    }
  ],
  "nodes_total": 419,
  "refuted_disclosure": [
    {
      "region": "src/core-runtime/cli/run-review-prompt-execution.ts:4981-8556",
      "line": 6517,
      "before": "렌즈 후속 처리와 artifact·숙의 흐름",
      "after": "리뷰 프롬프트 실행 및 synthesis map-reduce 디스패치 흐름"
    }
  ],
  "refuted_disclosure_total": 9,
  "unanchored_unverified_total": 9,
  "render_truncated": true
}
```

## 질문 (1차 기준 — 5문)

1. 이 파일은 리뷰 실행 파이프라인에서 정확히 무엇을 하는 최상위 함수(오케스트레이터)를 통해 전체 생애주기(계획 로드 → lens 디스패치 → 이슈 아티팩트/deliberation/synthesize 단계 → 최종 실행결과 아티팩트 기록)를 구성하는가? 그 오케스트레이터 함수의 이름과 시작~종료 라인을 밝히고, 이 파일이 CLI로 직접 실행될 때 그 함수에 도달하기까지의 진입점 함수 이름도 함께 답하라.
2. 파일 전체를 훑었을 때 코드가 대략 어떤 성격의 영역들로 나뉘는지 말하라 — (a) 출력 계약 검증/파싱 유틸, (b) 재시도·브레이커·리서밋(resubmit) 정책, (c) 유닛 종류별(issue-stance-matrix, issue-artifact, deliberation, synthesize) 개별 디스패치 함수, (d) 이들을 순서대로 묶는 최상위 오케스트레이터. (c)와 (d)가 각각 대략 어느 라인 구간에 위치하는지 지목하라.
3. lens phase가 끝난 뒤 이슈 아티팩트(finding-ledger 등)·deliberation·problem-framing·synthesize 단계가 실행되는 순서는 고정된 순차 코드가 아니라 반복문 기반의 라우팅 메커니즘으로 결정된다. 이 메커니즘의 이름(또는 핵심 함수)과 동작 방식, 그리고 반복이 멈추는(convergence) 조건을 설명하라.
4. 파일 앞부분(1738~1821줄)에 정의된 dispatch breaker 헬퍼(reviewDispatchBreakerFromProfile / recordNestedUnitOutcomeToBreaker / persistReviewDispatchIncompleteArtifact)는 파일 뒷부분에서 서로 다른 두 개의 유닛 풀(pool)에 대해 각각 독립적으로 인스턴스화되어 쓰인다. 두 사용처가 각각 어느 함수/라인 대역에 있고 어떤 유닛 종류를 감시하는지 밝혀라.
5. lens 유닛 풀과 issue-stance/deliberation/synthesize 유닛 풀은 각각 nested-workers 모드(외부 워커에 유닛들을 배치 위임하는 모드)를 서로 다른 진입점으로 통합한다. lens 풀이 쓰는 함수와 나머지 세 단계가 공통으로 쓰는 함수(및 그 정의 위치)를 구분해서 답하라.

## 질문 (2차 신호 — 3문)

6. 리뷰 진행률 로그(`[review progress] N/M ...`)의 step 번호 리터럴은 파일을 위에서 아래로 읽을 때 실행 순서와 다르게 등장한다. step 9, 10, 12가 발행되는 함수/라인과 step 1, 2, 3이 발행되는 함수/라인을 각각 밝히고, 두 그룹의 파일 내 물리적 위치 선후 관계가 실제 실행 순서와 왜 어긋나는지 설명하라.
7. `runIssueArtifactDispatch` 함수는 오케스트레이터에서 서로 다른 두 시점(사전 deliberation 단계용 아티팩트들과 problem-framing 단계)에 반복 호출된다. 이 함수는 artifactId가 "issue-stance-matrix"일 때 내부적으로 별도의 전담 함수로 위임한다. 그 위임 대상 함수 이름과 정의 위치, 그리고 오케스트레이터에서 이 두 함수가 호출되는 지점(라인)을 밝혀라.
8. `runReviewPromptExecution`(CLI argv 파싱 경로)이 오케스트레이터(`executeReviewPromptExecution`)를 호출할 때 실제로 채워 넘기는 파라미터와, 오케스트레이터 시그니처가 받을 수 있는 전체 파라미터 목록(teamleadExecutorConfig, reviewExecutionProfile, continuationPlan 등)을 비교하라. CLI 경로가 누락하는 파라미터가 있는가?

## 출력 형식

질문별로: `### Q<n>` / `**조건①**: … (answerable: …)` / `**조건②**: … (answerable: …)` / `**조건③**: … (answerable: …)`
마지막에 요약 표(질문×조건×answerable)를 제시하십시오.
