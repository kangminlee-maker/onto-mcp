#!/usr/bin/env node

import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import type { OntoConfig } from "../discovery/settings-chain.js";
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
  ReviewLensCompletionBarrierArtifact,
  ReviewCitationAuditMetadata,
  ReviewCitationAuditRejectionMetadata,
  ReviewNativeAdmissionMetadata,
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
  issueArtifactConsumerId,
  issueArtifactSpec,
  renderIssueArtifactRefs,
  resolveProblemFramingProfileRef,
  validateIssueArtifactOnDisk,
  writeIssueArtifactPromptPacket,
} from "../review/issue-artifact-runtime.js";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";
import type { ReviewContinuationPlan } from "../review/continuation-plan.js";
import { buildReviewExecutionRoute } from "../review/review-execution-route.js";
import {
  buildLensControlledDeliberationPrompt,
  buildTeamleadControlledDeliberationPrompt,
  type LensOutputForDeliberation,
  type LensDeliberationResponseForTeamlead,
} from "../review/controlled-lens-deliberation.js";
import { resolveRequiredParticipatingLensCount } from "../review/lens-completion-policy.js";
import {
  REVIEW_EXECUTION_STEP_IDS,
  REVIEW_PROGRESS_TOTAL_STEPS,
} from "../review/review-progress-contract.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";
import { executeReviewViaCodexNested } from "./codex-nested-dispatch.js";
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
import {
  renderReviewUnitBoundaryDetailsSection,
} from "../review/unit-boundary-details.js";
import {
  parsePacketAllowedReadAuthority,
} from "../review/packet-boundary-policy.js";

export interface ReviewUnitExecutorConfig {
  bin: string;
  args: string[];
}

interface ExecutionDispatchResult {
  unit_id: string;
  unit_kind: ReviewUnitKind;
  packet_path: string;
  output_path: string;
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
}

interface ExecutionOutcome {
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

function stripReviewUnitBoundaryDetailsSections(packetText: string): string {
  const lines = packetText.split(/\r?\n/);
  const output: string[] = [];
  let skippingBoundaryDetails = false;
  for (const line of lines) {
    const isHeading = /^\s*#{1,6}\s+\S/.test(line);
    const isBoundaryDetailsHeading =
      /^\s*#{1,6}\s*(?:Runtime\s+Unit\s+|Unit\s+)?Boundary\s+Details\s*$/.test(
        line,
      );
    if (isBoundaryDetailsHeading) {
      skippingBoundaryDetails = true;
      continue;
    }
    if (skippingBoundaryDetails && isHeading) {
      skippingBoundaryDetails = false;
    }
    if (!skippingBoundaryDetails) {
      output.push(line);
    }
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function renderLensOutputRefsSection(
  projectRoot: string,
  lensDispatches: ExecutionDispatchResult[],
): string {
  const sections = lensDispatches.map((dispatch) => {
    const relativeOutputPath = path.relative(projectRoot, dispatch.output_path);
    return `- ${dispatch.unit_id}: ${relativeOutputPath}`;
  });
  return `## Runtime Participating Lens Outputs\n${sections.join("\n")}\n`;
}

function renderDegradedLensFailuresSection(
  failures: ExecutionFailure[],
): string {
  if (failures.length === 0) {
    return "";
  }
  return `## Degraded Lens Failures\n${failures
    .map(
      (failure) =>
        `- ${failure.unit_id}: ${failure.message.replaceAll("\n", " ").trim()}`,
    )
    .join("\n")}\n`;
}

async function writeLensCompletionBarrier(args: {
  executionPlan: ReviewExecutionPlan;
  observedDispatchWidth: number;
  minimumParticipatingLenses: number;
  lensDispatches: ExecutionDispatchResult[];
  successfulLensDispatches: ExecutionDispatchResult[];
  executionFailures: ExecutionFailure[];
}): Promise<ReviewLensCompletionBarrierArtifact> {
  const plannedLensIds = args.lensDispatches.map((dispatch) => dispatch.unit_id);
  const completedLensIds = args.successfulLensDispatches.map(
    (dispatch) => dispatch.unit_id,
  );
  const failedLensIds = args.executionFailures
    .filter((failure) => failure.unit_kind === "lens")
    .map((failure) => failure.unit_id);
  const missingLensIds = plannedLensIds.filter(
    (lensId) =>
      !completedLensIds.includes(lensId) && !failedLensIds.includes(lensId),
  );
  const degradedLensIds = plannedLensIds.filter(
    (lensId) => !completedLensIds.includes(lensId),
  );
  const downstreamAllowed =
    completedLensIds.length >= args.minimumParticipatingLenses;
  const status: ReviewLensCompletionBarrierArtifact["status"] =
    downstreamAllowed && degradedLensIds.length === 0
      ? "passed"
      : downstreamAllowed
        ? "passed_with_degradation"
        : "failed";
  const barrier: ReviewLensCompletionBarrierArtifact = {
    schema_version: "1",
    session_id: args.executionPlan.session_id,
    created_at: isoFromTimestamp(Date.now()),
    observed_dispatch_width: args.observedDispatchWidth,
    minimum_participating_lenses: args.minimumParticipatingLenses,
    planned_lens_ids: plannedLensIds,
    completed_lens_ids: completedLensIds,
    failed_lens_ids: failedLensIds,
    missing_lens_ids: missingLensIds,
    degraded_lens_ids: degradedLensIds,
    status,
    downstream_allowed: downstreamAllowed,
    downstream_reason: downstreamAllowed
      ? "selected lens completion threshold satisfied"
      : "selected lens completion threshold not satisfied",
  };
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

function renderControlledDeliberationRefsSection(
  projectRoot: string,
  executionPlan: ReviewExecutionPlan,
  deliberationDispatches: ExecutionDispatchResult[],
): string {
  return [
    "## Controlled Lens Deliberation Result",
    `- teamlead result: ${path.relative(projectRoot, executionPlan.deliberation_output_path)}`,
    "",
    "## Lens Deliberation Responses",
    ...deliberationDispatches.map(
      (dispatch) =>
        `- ${dispatch.unit_id.replace(/^deliberation-/, "")}: ${path.relative(
          projectRoot,
          dispatch.output_path,
        )}`,
    ),
    "",
  ].join("\n");
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
  if (executorConfig.args.some((arg) => arg.includes("codex-review-unit-executor"))) {
    // codex executor spawns an external process -> API request per lens
    return 1500;
  }
  return 0;
}

/** Default retry count for individual lens execution failures.
 *  Set high (10) to absorb transient network timeouts and CLI crashes
 *  without losing a lens to degraded status. Retries use a bounded linear
 *  delay based on the attempt number. */
const DEFAULT_LENS_MAX_RETRIES = 10;

/** Base delay for bounded linear retries. Synthesize reuses the base delay. */
const DEFAULT_LENS_RETRY_INITIAL_DELAY_MS = 8000;
const DEFAULT_REVIEW_UNIT_TIMEOUT_MS = 600_000;
const REVIEW_CANCEL_REQUEST_FILENAME = "review-cancel-request.yaml";

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

  constructor(
    message: string,
    outcome: ExecutionOutcome | null,
    originalError: unknown,
  ) {
    super(message);
    this.name = "ReviewIssueArtifactDispatchError";
    this.outcome = outcome;
    this.originalError = originalError;
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

function maxUnitOutputBytes(): number {
  const raw = process.env.ONTO_REVIEW_MAX_UNIT_OUTPUT_BYTES;
  if (raw === undefined || raw.trim().length === 0) return 512 * 1024;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 512 * 1024;
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
      items: parseLensYamlListSection({
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
}): Promise<void> {
  await ensureNonEmptyOutputFile(args.outputPath);
  const outputBytes = await fileSizeIfPresent(args.outputPath);
  const maxBytes = maxUnitOutputBytes();
  if (outputBytes !== null && outputBytes > maxBytes) {
    throw new ReviewUnitOutputContractError(
      `Review unit ${args.dispatch.unit_id} output is too large: ${outputBytes} bytes > ${maxBytes} bytes (${args.outputPath}).`,
    );
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

function failureKindFromMessage(message: string): ReviewUnitFailureKind {
  const normalized = message.toLowerCase();
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
    normalized.includes("must start with yaml frontmatter") ||
    normalized.includes("deliberation_status: performed")
  ) {
    return "output_contract";
  }
  return "executor_exit";
}

function shouldRetryUnitFailure(args: {
  error: unknown;
  attempt: number;
  maxRetries: number;
}): boolean {
  if (args.attempt >= args.maxRetries) return false;
  const failureKind = failureKindFromError(args.error);
  if (
    failureKind === "timeout" ||
    failureKind === "empty_output" ||
    failureKind === "output_contract"
  ) {
    return false;
  }
  return true;
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
    (normalizedCoverageStatus === "complete" && normalizedFailedRefs.length > 0)
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
  dispatch: ExecutionDispatchResult,
  timeoutMs: number = DEFAULT_REVIEW_UNIT_TIMEOUT_MS,
): Promise<ReviewExecutorRunMetadata | undefined> {
  await fs.mkdir(path.dirname(dispatch.output_path), { recursive: true });

  const detached = process.platform !== "win32";
  const child = spawn(
    executorConfig.bin,
    [
      ...executorConfig.args,
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

  const exitCode = await new Promise<number>((resolve, reject) => {
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateChild("SIGTERM");
      forceKillTimer = setTimeout(() => terminateChild("SIGKILL"), 2_000);
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve(code ?? 1);
    });
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
  });
  return parseExecutorRunMetadata(stdout);
}

function toUnitExecutionResult(
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
  };
}

function normalizePreservedUnitExecutionResult(
  result: ReviewUnitExecutionResult,
): ReviewUnitExecutionResult {
  if (result.citation_audit === undefined || result.citation_audit === null) {
    return result;
  }
  const citationAudit = parseCitationAuditMetadata(result.citation_audit);
  if (citationAudit.audit) {
    const sanitized: ReviewUnitExecutionResult = { ...result };
    delete sanitized.citation_audit_rejection;
    return { ...sanitized, citation_audit: citationAudit.audit };
  }
  const sanitized: ReviewUnitExecutionResult = { ...result };
  delete sanitized.citation_audit;
  return {
    ...sanitized,
    ...(citationAudit.rejection
      ? { citation_audit_rejection: citationAudit.rejection }
      : {}),
  };
}

function allUnitExecutionResults(
  artifact: ReviewExecutionResultArtifact | null,
): ReviewUnitExecutionResult[] {
  if (!artifact) return [];
  return [
    ...artifact.lens_execution_results,
    ...(artifact.issue_artifact_execution_results ?? []),
    ...(artifact.deliberation_execution_results ?? []),
    ...(artifact.synthesize_execution_result
      ? [artifact.synthesize_execution_result]
      : []),
  ];
}

function outcomeFromPreviousResult(
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
    },
    preservedResult: result,
  };
}

function deriveExecutionStatus(params: {
  synthesisExecuted: boolean;
  degradedLensIds: string[];
}): ReviewExecutionStatus {
  if (!params.synthesisExecuted) {
    return "halted_partial";
  }
  if (params.degradedLensIds.length > 0) {
    return "completed_with_degradation";
  }
  return "completed";
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
  const synthesizeResult = artifact.synthesize_execution_result ?? null;
  const unitResults = [
    ...artifact.lens_execution_results,
    ...(artifact.issue_artifact_execution_results ?? []),
    ...(artifact.deliberation_execution_results ?? []),
    ...(synthesizeResult ? [synthesizeResult] : []),
  ];
  return unitResults
    .filter((result) => result.status === "failed")
    .map((result) => ({
      unit_id: result.unit_id,
      unit_kind: result.unit_kind,
      lens_id: inferFailureLensId(artifact, result),
      packet_path: result.packet_path,
      output_path: result.output_path,
      failure_kind: result.failure_kind ?? null,
      failure_message: result.failure_message ?? "unknown failure",
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

async function writeExecutionResultArtifact(
  executionPlan: ReviewExecutionPlan,
  artifact: ReviewExecutionResultArtifact,
  reviewExecutionProfile?: ReviewExecutionProfile,
): Promise<void> {
  try {
    await writeYamlDocument(executionPlan.execution_result_path, artifact);
    await writeDegradationSummaryArtifact(executionPlan, artifact);
    await writeReviewRunManifest(executionPlan, artifact, reviewExecutionProfile);
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

async function registerGeneratedPromptPacketRefForDispatch(args: {
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
      executionPlan.synthesize_prompt_packet_path,
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
    {
      consumer_id: "synthesize",
      packet_path: executionPlan.synthesize_prompt_packet_path,
    },
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
  return {
    unit_id: result.unit_id,
    unit_kind: result.unit_kind,
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
  };
}

async function writeReviewRunManifest(
  executionPlan: ReviewExecutionPlan,
  artifact: ReviewExecutionResultArtifact,
  reviewExecutionProfile?: ReviewExecutionProfile,
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
  for (const result of unitResults) {
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
    review_execution_profile: reviewExecutionProfile
      ? (() => {
          const route = buildReviewExecutionRoute(reviewExecutionProfile);
          return {
            mode: reviewExecutionProfile.mode,
            teamlead: reviewExecutionProfile.teamlead,
            lens: reviewExecutionProfile.lens,
            synthesize: reviewExecutionProfile.synthesize,
            deliberation: reviewExecutionProfile.deliberation,
            runtime_route: {
              execution_realization: route.execution_realization,
              host_runtime: route.artifact_host_runtime,
              worker_executor: route.executor,
              runtime_provider: route.resolved_provider,
              auth_mode: route.auth_mode,
            },
            model: reviewExecutionProfile.model ?? null,
            effort: reviewExecutionProfile.effort ?? null,
            service_tier: reviewExecutionProfile.service_tier ?? null,
            base_url: reviewExecutionProfile.base_url ?? null,
            trace: reviewExecutionProfile.trace,
          };
        })()
      : null,
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
      synthesis_output: executionPlan.synthesis_output_path,
      deliberation_output: executionPlan.deliberation_output_path,
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
    degradationSummaryPathForSession(executionPlan.session_root),
    executionPlan.error_log_path,
    executionPlan.synthesis_output_path,
    executionPlan.deliberation_output_path,
    executionPlan.finding_ledger_path,
    executionPlan.finding_relation_graph_path,
    executionPlan.issue_ledger_path,
    executionPlan.issue_stance_matrix_path,
    executionPlan.deliberation_plan_path,
    executionPlan.problem_framing_path,
    executionPlan.final_output_path,
    executionPlan.lens_completion_barrier_path ??
      path.join(executionPlan.session_root, "lens-completion-barrier.yaml"),
    executionPlan.teamlead_deliberation_prompt_packet_path,
    path.join(
      executionPlan.prompt_packets_root,
      "synthesize.runtime.prompt.md",
    ),
    ...executionPlan.lens_execution_seats.map((seat) => seat.output_path),
    ...executionPlan.issue_artifact_prompt_packet_seats.map(
      (seat) => seat.packet_path,
    ),
    ...executionPlan.issue_artifact_prompt_packet_seats.map(
      (seat) => seat.output_path,
    ),
    ...executionPlan.lens_deliberation_prompt_packet_seats.map(
      (seat) => seat.packet_path,
    ),
    ...executionPlan.lens_deliberation_prompt_packet_seats.map(
      (seat) => seat.output_path,
    ),
  ];

  await Promise.all(pathsToClear.map((targetPath) => removeFileIfExists(targetPath)));
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
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    attemptsUsed = attempt + 1;
    try {
      const executorMetadata = await invokeExecutor(
        executorConfig,
        projectRoot,
        sessionRoot,
        dispatch,
        unitTimeoutMs,
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
        ...(executorMetadata !== undefined ? { executorMetadata } : {}),
        packetBytes: await fileSizeIfPresent(dispatch.packet_path),
        outputBytes: await fileSizeIfPresent(dispatch.output_path),
      };
    } catch (error: unknown) {
      lastError = error;
      if (shouldRetryUnitFailure({ error, attempt, maxRetries })) {
        const retryDelay = retryInitialDelayMs * (attempt + 1);
        console.log(
          `[review runner] ${dispatch.unit_id} attempt ${attempt + 1} failed, retrying in ${retryDelay}ms...`,
        );
        await appendExecutionProgress(
          executionPlan.error_log_path,
          `runner dispatch retry: ${dispatch.unit_id}`,
          [
            `attempt: ${attempt + 1}/${maxRetries}`,
            `retry_delay_ms: ${retryDelay}`,
            `error: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`,
          ],
        );
        await sleep(retryDelay);
      }
      if (!shouldRetryUnitFailure({ error, attempt, maxRetries })) break;
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
    packetBytes,
    outputBytes,
    failure,
  };
}

function lensOutputsForDeliberation(
  dispatches: ExecutionDispatchResult[],
): LensOutputForDeliberation[] {
  return dispatches.map((dispatch) => ({
    lens_id: dispatch.unit_id,
    output_path: dispatch.output_path,
  }));
}

function requireDeliberationSeat(
  executionPlan: ReviewExecutionPlan,
  lensId: string,
): { packet_path: string; output_path: string } {
  const seat = executionPlan.lens_deliberation_prompt_packet_seats.find(
    (candidate) => candidate.lens_id === lensId,
  );
  if (!seat) {
    throw new Error(`Missing deliberation prompt seat for lens: ${lensId}`);
  }
  return seat;
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
}): Promise<ExecutionOutcome> {
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
  };
  const progress = issueArtifactProgress(args.artifactId);
  await emitReviewProgress({
    executionPlan: args.executionPlan,
    step: progress.step,
    label: progress.label,
    details: [`artifact=${args.artifactId}`],
  });
  const participatingLensIds = args.lensOutputPaths.map((lensPath) =>
    path.basename(lensPath, ".md"),
  );
  let lastOutcome: ExecutionOutcome | null = null;
  let lastValidationError: unknown = null;
  for (let attempt = 0; attempt < 1; attempt += 1) {
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
      maxRetries: 1,
      retryInitialDelayMs: DEFAULT_LENS_RETRY_INITIAL_DELAY_MS,
      unitTimeoutMs: args.unitTimeoutMs,
    });
    lastOutcome = outcome;
    if (!outcome.success) {
      throw new ReviewIssueArtifactDispatchError(
        `Issue artifact generation failed for ${args.artifactId}: ${outcome.failure?.message ?? "unknown error"}`,
        outcome,
        outcome.failure?.message ?? "unknown error",
      );
    }
    try {
      await validateIssueArtifactOnDisk({
        executionPlan: args.executionPlan,
        artifactId: args.artifactId,
        participatingLensIds,
      });
      return outcome;
    } catch (error) {
      lastValidationError = error;
      console.warn(
        `[review progress] ${progress.step}/${REVIEW_PROGRESS_TOTAL_STEPS} ${args.artifactId} validation failed on attempt ${attempt + 1}/1: ${
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
          ...(lastOutcome.attemptCount !== undefined
            ? { attemptCount: lastOutcome.attemptCount }
            : {}),
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
  issueArtifactContext?: string;
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
    issueArtifactContext,
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

  const lensOutputs = lensOutputsForDeliberation(successfulLensDispatches);
  const lensOutputById = new Map(
    lensOutputs.map((lensOutput) => [lensOutput.lens_id, lensOutput]),
  );

  const deliberationDispatches = successfulLensDispatches.map((dispatch) => {
    const seat = requireDeliberationSeat(executionPlan, dispatch.unit_id);
    return {
      unit_id: `deliberation-${dispatch.unit_id}`,
      unit_kind: "deliberation" as const,
      packet_path: seat.packet_path,
      output_path: seat.output_path,
    };
  });

  await emitReviewProgress({
    executionPlan,
    step: 9,
    label: "lens deliberation responses",
    details: [`participating_lens_count=${deliberationDispatches.length}`],
  });
  const shouldRunUnit = (unitId: string): boolean =>
    args.runUnitIds === undefined || args.runUnitIds.has(unitId);
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
  for (const dispatch of deliberationDispatches) {
    if (!shouldRunUnit(dispatch.unit_id)) continue;
    const lensId = dispatch.unit_id.replace(/^deliberation-/, "");
    const ownOutput = lensOutputById.get(lensId);
    if (!ownOutput) {
      throw new Error(`Missing primary lens output for deliberation: ${lensId}`);
    }
    const otherOutputs = lensOutputs.filter((lens) => lens.lens_id !== lensId);
    const deliberationReadRefs = [
      ownOutput.output_path,
      ...otherOutputs.map((output) => output.output_path),
      ...issueArtifactOutputPaths(
        executionPlan,
        PRE_DELIBERATION_ISSUE_ARTIFACT_IDS,
      ),
    ];
    const packetText = buildLensControlledDeliberationPrompt({
      session_id: executionPlan.session_id,
      lens_id: lensId,
      output_path: dispatch.output_path,
      own_output: ownOutput,
      other_outputs: otherOutputs,
      ...(issueArtifactContext ? { issue_artifact_context: issueArtifactContext } : {}),
      boundary_context: renderReviewUnitBoundaryContext(
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
      consumerId: `deliberation:${lensId}`,
      packetPath: dispatch.packet_path,
    });
  }

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
      deliberationOutcomes[currentIndex] = await runSingleDispatchWithRetries({
        projectRoot,
        sessionRoot,
        executionPlan,
        executorConfig: lensExecutorConfig,
        dispatch,
        maxRetries: DEFAULT_LENS_MAX_RETRIES,
        retryInitialDelayMs: DEFAULT_LENS_RETRY_INITIAL_DELAY_MS,
        unitTimeoutMs,
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

  const lensDeliberationResponses: LensDeliberationResponseForTeamlead[] =
    deliberationDispatches.map((dispatch) => ({
      lens_id: dispatch.unit_id.replace(/^deliberation-/, ""),
      response_path: dispatch.output_path,
    }));
  const teamleadReadRefs = [
    ...lensOutputs.map((output) => output.output_path),
    ...lensDeliberationResponses.map((response) => response.response_path),
    ...issueArtifactOutputPaths(
      executionPlan,
      PRE_DELIBERATION_ISSUE_ARTIFACT_IDS,
    ),
  ];

  const teamleadDispatch: ExecutionDispatchResult = {
    unit_id: "controlled-deliberation",
    unit_kind: "deliberation",
    packet_path: executionPlan.teamlead_deliberation_prompt_packet_path,
    output_path: executionPlan.deliberation_output_path,
  };
  let teamleadOutcome: ExecutionOutcome;
  if (shouldRunUnit(teamleadDispatch.unit_id)) {
    const teamleadPacketText = buildTeamleadControlledDeliberationPrompt({
      session_id: executionPlan.session_id,
      output_path: executionPlan.deliberation_output_path,
      lens_outputs: lensOutputs,
      lens_deliberation_responses: lensDeliberationResponses,
      ...(issueArtifactContext ? { issue_artifact_context: issueArtifactContext } : {}),
      boundary_context: renderReviewUnitBoundaryContext(
        projectRoot,
        executionPlan,
        teamleadDispatch.unit_id,
        executionPlan.deliberation_output_path,
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
      details: [`output_path=${executionPlan.deliberation_output_path}`],
    });
    teamleadOutcome = await runSingleDispatchWithRetries({
      projectRoot,
      sessionRoot,
      executionPlan,
      executorConfig: teamleadExecutorConfig,
      dispatch: teamleadDispatch,
      maxRetries: 1,
      retryInitialDelayMs: DEFAULT_LENS_RETRY_INITIAL_DELAY_MS,
      unitTimeoutMs,
    });
  } else {
    teamleadOutcome = preservedOutcomeForDispatch(teamleadDispatch);
  }
  if (!teamleadOutcome.success) {
    throw new ReviewControlledDeliberationDispatchError(
      `Teamlead controlled deliberation failed: ${teamleadOutcome.failure?.message ?? "unknown error"}`,
      [...completedDeliberationOutcomes, teamleadOutcome],
      teamleadOutcome,
    );
  }

  await appendExecutionProgress(
    executionPlan.error_log_path,
    "runner controlled lens deliberation completed",
    [
      `deliberation_output_path: ${executionPlan.deliberation_output_path}`,
      `lens_deliberation_response_count: ${deliberationDispatches.length}`,
    ],
  );

  return {
    deliberationDispatches,
    deliberationOutcomes: completedDeliberationOutcomes,
    teamleadOutcome,
  };
}

export async function executeReviewPromptExecution(
  params: {
    projectRoot: string;
    sessionRoot: string;
    defaultExecutorConfig: ReviewUnitExecutorConfig;
    teamleadExecutorConfig?: ReviewUnitExecutorConfig;
    synthesizeExecutorConfig?: ReviewUnitExecutorConfig;
    reviewExecutionProfile?: ReviewExecutionProfile;
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
  const previousResultsByUnitId = new Map(
    allUnitExecutionResults(previousExecutionResult).map((result) => [
      result.unit_id,
      result,
    ]),
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

  const lensDispatches: ExecutionDispatchResult[] =
    executionPlan.lens_prompt_packet_seats.map((seat) => ({
      unit_id: seat.lens_id,
      unit_kind: "lens" as const,
      packet_path: seat.packet_path,
      output_path: seat.output_path,
    }));
  const maxConcurrentLenses = Math.max(1, lensDispatches.length);
  const observedDispatchWidth = lensDispatches.length;

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

  const staggerDelayMs = defaultStaggerDelayMsForExecutorConfig(defaultExecutorConfig);
  const maxRetries = DEFAULT_LENS_MAX_RETRIES;
  const retryInitialDelayMs = DEFAULT_LENS_RETRY_INITIAL_DELAY_MS;

  if (staggerDelayMs > 0) {
    console.log(
      `[review runner] stagger delay: ${staggerDelayMs}ms between successive lens dispatches`,
    );
  }

  const executionOutcomes: Array<ExecutionOutcome | undefined> = new Array(
    lensDispatches.length,
  );
  let nextLensIndex = 0;

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
        executionOutcomes[currentIndex] = preservedOutcomeForDispatch(dispatch);
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

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        attemptsUsed = attempt + 1;
        try {
          executorMetadata = await invokeExecutor(
            defaultExecutorConfig,
            projectRoot,
            sessionRoot,
            dispatch,
            unitTimeoutMs,
          );
          succeeded = true;
          break;
        } catch (error: unknown) {
          lastError = error;
          if (shouldRetryUnitFailure({ error, attempt, maxRetries })) {
            const retryDelay = retryInitialDelayMs * (attempt + 1);
            console.log(
              `[review runner] ${dispatch.unit_id} attempt ${attempt + 1} failed, retrying in ${retryDelay}ms...`,
            );
            await appendExecutionProgress(
              executionPlan.error_log_path,
              `runner dispatch retry: ${dispatch.unit_id}`,
              [
                `attempt: ${attempt + 1}/${maxRetries}`,
                `retry_delay_ms: ${retryDelay}`,
                `error: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`,
              ],
            );
            await sleep(retryDelay);
          }
          if (!shouldRetryUnitFailure({ error, attempt, maxRetries })) break;
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
        executionOutcomes[currentIndex] = {
          dispatch,
          success: false,
          startedAtMs,
          completedAtMs,
          attemptCount: attemptsUsed,
          packetBytes,
          outputBytes,
          failure,
        };
      }
    }
  }

  if (
    !continuationMode &&
    params.reviewExecutionProfile?.mode === "nested-workers" &&
    params.reviewExecutionProfile.worker_executor === "codex"
  ) {
    console.log(
      "[review runner] mode=nested-workers worker_executor=codex",
    );
    await appendExecutionProgress(
      executionPlan.error_log_path,
      "runner profile dispatch: nested-workers",
      [
        `teamlead_seat: ${params.reviewExecutionProfile.teamlead.seat}`,
        `lens_seat: ${params.reviewExecutionProfile.lens.seat}`,
        `worker_executor: ${params.reviewExecutionProfile.worker_executor}`,
        `planned_lens_count: ${lensDispatches.length}`,
      ],
    );
    const nestedStartedAtMs = Date.now();
    const nestedResult = await executeReviewViaCodexNested({
      sessionRoot,
      projectRoot,
      ontoConfig: params.ontoConfig ?? {},
    });
    const nestedCompletedAtMs = Date.now();
    // Map nested-dispatch outcomes into executionOutcomes[] in lensDispatches order.
    // `participating_lens_ids` is the nested bridge's candidate success set
    // (orchestrator ok AND output file exists + non-empty). The parent runner
    // still applies its local output-contract validator before admitting a lens
    // as participating so every execution profile shares the same sink gate.
    for (let i = 0; i < lensDispatches.length; i += 1) {
      const dispatch = lensDispatches[i]!;
      const reported = nestedResult.nested_raw.outcomes[i];
      const participating = nestedResult.participating_lens_ids.includes(
        dispatch.unit_id,
      );
      if (participating) {
        try {
          await validateUnitOutputFile({
            dispatch,
            outputPath: dispatch.output_path,
          });
        } catch (error) {
          const failure: ExecutionFailure = {
            unit_id: dispatch.unit_id,
            unit_kind: dispatch.unit_kind,
            packet_path: dispatch.packet_path,
            output_path: dispatch.output_path,
            message: error instanceof Error ? error.message : String(error),
            failure_kind: failureKindFromError(error),
          };
          const packetBytes = await fileSizeIfPresent(dispatch.packet_path);
          const outputBytes = await fileSizeIfPresent(dispatch.output_path);
          await removeFileIfExists(dispatch.output_path);
          await appendExecutionFailure(
            executionPlan.error_log_path,
            failure,
            executionPlan.effective_boundary_state,
          );
          executionOutcomes[i] = {
            dispatch,
            success: false,
            startedAtMs: nestedStartedAtMs,
            completedAtMs: nestedCompletedAtMs,
            attemptCount: 1,
            packetBytes,
            outputBytes,
            failure,
          };
          continue;
        }
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
        executionOutcomes[i] = {
          dispatch,
          success: true,
          startedAtMs: nestedStartedAtMs,
          completedAtMs: nestedCompletedAtMs,
          attemptCount: 1,
          packetBytes: await fileSizeIfPresent(dispatch.packet_path),
          outputBytes: await fileSizeIfPresent(dispatch.output_path),
        };
      } else {
        const message =
          reported?.status === "fail" && reported.error
            ? reported.error
            : nestedResult.halt_reason ??
              "nested worker dispatch failed (output missing or orchestrator rejected)";
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
        executionOutcomes[i] = {
          dispatch,
          success: false,
          startedAtMs: nestedStartedAtMs,
          completedAtMs: nestedCompletedAtMs,
          attemptCount: 1,
          packetBytes,
          outputBytes,
          failure,
        };
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

  if (!lensCompletionBarrier.downstream_allowed) {
    const haltReason =
      successfulLensDispatches.length === 0
        ? "No participating lens outputs were produced."
        : `Selected lens completion barrier failed: ${lensCompletionBarrier.completed_lens_ids.length}/${lensCompletionBarrier.planned_lens_ids.length} planned lenses completed.`;
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
      ...haltArtifactFields("lens_completion_barrier", null),
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
      ...haltArtifactFields("lens_completion_barrier", null),
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
    const haltReason = `Issue artifact generation failed: ${failureMessage}`;
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
  for (const artifactId of PRE_DELIBERATION_ISSUE_ARTIFACT_IDS) {
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
      continue;
    }
    try {
      issueArtifactOutcomes.push(await runIssueArtifactDispatch({
        projectRoot,
        sessionRoot,
        executionPlan,
        executorConfig: teamleadExecutorConfig,
        artifactId,
        lensOutputPaths,
        unitTimeoutMs,
      }));
    } catch (error) {
      return haltAfterIssueArtifactFailure({
        error,
        deliberationStatus: "not_performed",
      });
    }
  }
  const issueArtifactContext = [
    "Use the issue artifact refs below as the root-cause issue frame.",
    "Read these YAML artifacts when evaluating contested points; do not infer issue state from memory.",
    "",
    renderIssueArtifactRefs(
      projectRoot,
      executionPlan,
      PRE_DELIBERATION_ISSUE_ARTIFACT_IDS,
    ),
  ].join("\n");

  let controlledDeliberation: Awaited<
    ReturnType<typeof runControlledLensDeliberation>
  >;
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
      issueArtifactContext,
      ...(continuationMode
        ? {
            runUnitIds: continuationRunUnitIds,
            preservedResultsByUnitId: previousResultsByUnitId,
          }
        : {}),
    });
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
        deliberationOutputPath: executionPlan.deliberation_output_path,
        problemFramingProfileRef: await resolveProblemFramingProfileRef({
          projectRoot,
          executionPlan,
        }),
        unitTimeoutMs,
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

  const synthesizePacketRuntimePath = path.join(
    executionPlan.prompt_packets_root,
    "synthesize.runtime.prompt.md",
  );
  const synthesizePacketText = await fs.readFile(
    executionPlan.synthesize_prompt_packet_path,
    "utf8",
  );
  const synthesizeBaseReadAuthority =
    parsePacketAllowedReadAuthority(synthesizePacketText);
  if (
    !synthesizeBaseReadAuthority.declared ||
    synthesizeBaseReadAuthority.malformed
  ) {
    throw new ReviewUnitOutputContractError(
      `Synthesize base prompt packet has invalid Unit Boundary Details read authority: ${executionPlan.synthesize_prompt_packet_path}`,
    );
  }
  const synthesizeBaseReadRefs = synthesizeBaseReadAuthority.refs;
  const synthesizePacketBaseText =
    stripReviewUnitBoundaryDetailsSections(synthesizePacketText);
  const synthesizeRuntimeReadRefs = uniqueAllowedReadRefs(projectRoot, [
    ...synthesizeBaseReadRefs,
    ...successfulLensDispatches.map((dispatch) => dispatch.output_path),
    executionPlan.deliberation_output_path,
    ...controlledDeliberation.deliberationDispatches.map(
      (dispatch) => dispatch.output_path,
    ),
    ...issueArtifactOutputPaths(executionPlan, [
      "finding-ledger",
      "finding-relation-graph",
      "issue-ledger",
      "issue-stance-matrix",
      "deliberation-plan",
      "problem-framing",
    ]),
  ]);
  const enrichedSynthesizePacketText = `${synthesizePacketBaseText.trimEnd()}\n\n${renderLensOutputRefsSection(
    projectRoot,
    successfulLensDispatches,
  )}\n${renderControlledDeliberationRefsSection(
    projectRoot,
    executionPlan,
    controlledDeliberation.deliberationDispatches,
  )}\n## Issue-Stance Closure Artifacts\n${renderIssueArtifactRefs(projectRoot, executionPlan, [
    "finding-ledger",
    "finding-relation-graph",
    "issue-ledger",
    "issue-stance-matrix",
    "deliberation-plan",
    "problem-framing",
  ])}\n\n${renderReviewUnitBoundaryContext(
    projectRoot,
    executionPlan,
    "synthesize",
    executionPlan.synthesis_output_path,
    synthesizeRuntimeReadRefs,
  )}\n\n${renderDegradedLensFailuresSection(
    executionFailures.filter((failure) => failure.unit_kind === "lens"),
  )}`;
  await fs.writeFile(
    synthesizePacketRuntimePath,
    enrichedSynthesizePacketText.trimEnd() + "\n",
    "utf8",
  );
  await registerGeneratedPromptPacketRefForDispatch({
    executionPlan,
    consumerId: "synthesize",
    packetPath: synthesizePacketRuntimePath,
  });

  const synthesizeDispatch: ExecutionDispatchResult = {
    unit_id: "synthesize",
    unit_kind: "synthesize",
    packet_path: synthesizePacketRuntimePath,
    output_path: executionPlan.synthesis_output_path,
  };

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

  if (shouldRunUnit("synthesize")) {
    await emitReviewProgress({
      executionPlan,
      step: 12,
      label: "synthesize and write execution result",
      details: [`participating_lens_count=${successfulLensDispatches.length}`],
    });
    console.log("[review runner] starting synthesize: synthesize");
    await appendExecutionProgress(
      executionPlan.error_log_path,
      "runner dispatch started: synthesize",
      [
        `unit_id: ${synthesizeDispatch.unit_id}`,
        `unit_kind: ${synthesizeDispatch.unit_kind}`,
        `packet_path: ${synthesizeDispatch.packet_path}`,
        `output_path: ${synthesizeDispatch.output_path}`,
      ],
    );
  }
  const synthesizeStartedAtMs = Date.now();
  const synthesizeMaxRetries = 1;
  let synthesizeOutcome: ExecutionOutcome | null = null;
  let synthesizeLastError: unknown = undefined;
  let synthesizeSucceeded = false;
  let synthesizeExecutorMetadata: ReviewExecutorRunMetadata | undefined = undefined;
  let synthesizeAttemptsUsed = 0;

  if (shouldRunUnit("synthesize")) {
    for (let attempt = 0; attempt <= synthesizeMaxRetries; attempt++) {
      synthesizeAttemptsUsed = attempt + 1;
      try {
        synthesizeExecutorMetadata = await invokeExecutor(
          synthesizeExecutorConfig,
          projectRoot,
          sessionRoot,
          synthesizeDispatch,
          unitTimeoutMs,
        );
        await validateSynthesizeOutputParticipationTruth({
          outputPath: synthesizeDispatch.output_path,
          expectedLensIds: lensDispatches.map((dispatch) => dispatch.unit_id),
          receivedLensIds: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
        });
        synthesizeSucceeded = true;
        break;
      } catch (error: unknown) {
        synthesizeLastError = error;
        if (shouldRetryUnitFailure({
          error,
          attempt,
          maxRetries: synthesizeMaxRetries,
        })) {
          const retryDelay = DEFAULT_LENS_RETRY_INITIAL_DELAY_MS;
          console.log(
            `[review runner] synthesize attempt ${attempt + 1} failed, retrying in ${retryDelay}ms...`,
          );
          await appendExecutionProgress(
            executionPlan.error_log_path,
            "runner synthesize retry",
            [
              `attempt: ${attempt + 1}/${synthesizeMaxRetries}`,
              `retry_delay_ms: ${retryDelay}`,
              `error: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`,
            ],
          );
          await sleep(retryDelay);
        }
        if (!shouldRetryUnitFailure({
          error,
          attempt,
          maxRetries: synthesizeMaxRetries,
        })) break;
      }
    }
  } else {
    synthesizeOutcome = preservedOutcomeForDispatch(synthesizeDispatch);
    await validateUnitOutputFile({
      dispatch: synthesizeDispatch,
      outputPath: synthesizeDispatch.output_path,
    });
    await validateSynthesizeOutputParticipationTruth({
      outputPath: synthesizeDispatch.output_path,
      expectedLensIds: lensDispatches.map((dispatch) => dispatch.unit_id),
      receivedLensIds: successfulLensDispatches.map((dispatch) => dispatch.unit_id),
    });
    synthesizeSucceeded = true;
  }

  if (synthesizeSucceeded && synthesizeOutcome === null) {
    synthesizeOutcome = {
      dispatch: synthesizeDispatch,
      success: true,
      startedAtMs: synthesizeStartedAtMs,
      completedAtMs: Date.now(),
      attemptCount: synthesizeAttemptsUsed,
      ...(synthesizeExecutorMetadata !== undefined
        ? { executorMetadata: synthesizeExecutorMetadata }
        : {}),
      packetBytes: await fileSizeIfPresent(synthesizeDispatch.packet_path),
      outputBytes: await fileSizeIfPresent(synthesizeDispatch.output_path),
    };
  }

  if (!synthesizeSucceeded) {
    const error = synthesizeLastError;
    const failure: ExecutionFailure = {
      unit_id: synthesizeDispatch.unit_id,
      unit_kind: synthesizeDispatch.unit_kind,
      packet_path: synthesizeDispatch.packet_path,
      output_path: synthesizeDispatch.output_path,
      message: error instanceof Error ? error.message : String(error),
      failure_kind: failureKindFromError(error),
    };
    const packetBytes = await fileSizeIfPresent(synthesizeDispatch.packet_path);
    const outputBytes = await fileSizeIfPresent(synthesizeDispatch.output_path);
    synthesizeOutcome = {
      dispatch: synthesizeDispatch,
      success: false,
      startedAtMs: synthesizeStartedAtMs,
      completedAtMs: Date.now(),
      attemptCount: synthesizeAttemptsUsed,
      packetBytes,
      outputBytes,
      failure,
    };
    executionFailures.push(failure);
    await removeFileIfExists(synthesizeDispatch.output_path);
    await appendExecutionFailure(
      executionPlan.error_log_path,
      failure,
      executionPlan.effective_boundary_state,
    );
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
