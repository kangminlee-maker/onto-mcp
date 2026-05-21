#!/usr/bin/env node

import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type { OntoConfig } from "../discovery/settings-chain.js";
import type {
  DeliberationStatus,
  EffectiveBoundaryState,
  ReviewExecutionRealization,
  ReviewExecutionResultArtifact,
  ReviewExecutionPlan,
  ReviewExecutionStatus,
  ReviewIssueArtifactId,
  ReviewUnitKind,
  ReviewUnitExecutionResult,
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
  renderIssueArtifactContext,
  renderIssueArtifactRefs,
  resolveProblemFramingProfileRef,
  validateIssueArtifactOnDisk,
  writeIssueArtifactPromptPacket,
} from "../review/issue-artifact-runtime.js";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";
import {
  buildLensControlledDeliberationPrompt,
  buildTeamleadControlledDeliberationPrompt,
  type LensOutputForDeliberation,
  type LensDeliberationResponseForTeamlead,
} from "../review/controlled-lens-deliberation.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";
import { executeReviewViaCodexNested } from "./codex-nested-dispatch.js";

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
}

interface ExecutionFailure {
  unit_id: string;
  unit_kind: ReviewUnitKind;
  packet_path: string;
  output_path: string;
  message: string;
}

interface ExecutionOutcome {
  dispatch: ExecutionDispatchResult;
  success: boolean;
  startedAtMs: number;
  completedAtMs: number;
  failure?: ExecutionFailure;
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

function requirePositiveInteger(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid positive integer for --${optionName}: ${value}`);
  }
  return parsed;
}

function defaultMaxConcurrentLensesForExecutorConfig(
  executorConfig: ReviewUnitExecutorConfig,
): number {
  if (executorConfig.bin === "npm" || executorConfig.bin.endsWith("npm.cmd")) {
    if (executorConfig.args.includes("review:codex-unit-executor")) {
      // 9 lenses can run concurrently with stagger + retry to mitigate
      // thundering herd and transient API rate-limit failures.
      return 9;
    }
  }
  return 1;
}

/** Default stagger delay between successive lens dispatches (ms).
 *  Spreads initial burst to avoid thundering-herd on the external API. */
function defaultStaggerDelayMsForExecutorConfig(
  executorConfig: ReviewUnitExecutorConfig,
): number {
  if (executorConfig.bin === "npm" || executorConfig.bin.endsWith("npm.cmd")) {
    if (executorConfig.args.includes("review:codex-unit-executor")) {
      // codex executor spawns an external process → API request per lens
      return 1500;
    }
  }
  return 0;
}

/** Default retry count for individual lens execution failures.
 *  Set high (10) to absorb transient network timeouts and CLI crashes
 *  without losing a lens to degraded status. Each retry uses exponential
 *  backoff (8s, 16s, 24s, ...) so the worst-case total wait before
 *  final failure is ~7 minutes — acceptable for a lens that normally
 *  takes 3-5 minutes. */
const DEFAULT_LENS_MAX_RETRIES = 10;

/** Delay before first retry (ms). Doubles on each subsequent retry. */
const DEFAULT_LENS_RETRY_INITIAL_DELAY_MS = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureNonEmptyOutputFile(outputPath: string): Promise<void> {
  if (!(await fileExists(outputPath))) {
    throw new Error(`Executor did not create output file: ${outputPath}`);
  }

  const fileText = await fs.readFile(outputPath, "utf8");
  if (fileText.trim().length === 0) {
    throw new Error(`Executor created empty output file: ${outputPath}`);
  }
}

async function invokeExecutor(
  executorConfig: ReviewUnitExecutorConfig,
  projectRoot: string,
  sessionRoot: string,
  dispatch: ExecutionDispatchResult,
): Promise<void> {
  await fs.mkdir(path.dirname(dispatch.output_path), { recursive: true });

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
      env: {
        ...process.env,
        ...(process.env.ONTO_HOME ? { ONTO_HOME: process.env.ONTO_HOME } : {}),
      },
    },
  );

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

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

  await ensureNonEmptyOutputFile(dispatch.output_path);
}

function toUnitExecutionResult(
  outcome: ExecutionOutcome,
): ReviewUnitExecutionResult {
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

async function writeExecutionResultArtifact(
  executionPlan: ReviewExecutionPlan,
  artifact: ReviewExecutionResultArtifact,
  reviewExecutionProfile?: ReviewExecutionProfile,
): Promise<void> {
  await writeYamlDocument(executionPlan.execution_result_path, artifact);
  await writeReviewRunManifest(executionPlan, artifact, reviewExecutionProfile);
}

async function optionalFileDigest(filePath: string): Promise<string | null> {
  if (!(await fileExists(filePath))) return null;
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
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
  await writeYamlDocument(manifestPath, {
    schema_version: "1",
    session_id: executionPlan.session_id,
    created_at: artifact.execution_completed_at,
    review_execution_profile: reviewExecutionProfile
      ? {
          mode: reviewExecutionProfile.mode,
          teamlead: reviewExecutionProfile.teamlead,
          lens: reviewExecutionProfile.lens,
          deliberation: reviewExecutionProfile.deliberation,
          worker_executor: reviewExecutionProfile.worker_executor,
          host: reviewExecutionProfile.host,
          provider: reviewExecutionProfile.provider ?? null,
          auth: reviewExecutionProfile.auth ?? null,
          model: reviewExecutionProfile.model ?? null,
          effort: reviewExecutionProfile.effort ?? null,
          base_url: reviewExecutionProfile.base_url ?? null,
          trace: reviewExecutionProfile.trace,
        }
      : null,
    artifact_refs: {
      session_metadata: executionPlan.session_metadata_path,
      interpretation: executionPlan.interpretation_artifact_path,
      binding: executionPlan.binding_output_path,
      execution_plan: path.join(executionPlan.session_root, "execution-plan.yaml"),
      execution_result: executionPlan.execution_result_path,
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
    synthesis_provenance: {
      synthesis_executed: artifact.synthesis_executed,
      synthesis_output_path: executionPlan.synthesis_output_path,
      synthesis_output_sha256: await optionalFileDigest(executionPlan.synthesis_output_path),
      deliberation_status: artifact.deliberation_status ?? null,
      deliberation_output_path: executionPlan.deliberation_output_path,
      deliberation_output_sha256: await optionalFileDigest(executionPlan.deliberation_output_path),
      participating_lens_ids: artifact.participating_lens_ids,
      degraded_lens_ids: artifact.degraded_lens_ids,
      issue_artifact_refs: {
        finding_ledger: executionPlan.finding_ledger_path,
        finding_relation_graph: executionPlan.finding_relation_graph_path,
        issue_ledger: executionPlan.issue_ledger_path,
        issue_stance_matrix: executionPlan.issue_stance_matrix_path,
        deliberation_plan: executionPlan.deliberation_plan_path,
        problem_framing: executionPlan.problem_framing_path,
      },
    },
  });
}

async function resetExecutionOutputs(
  executionPlan: ReviewExecutionPlan,
): Promise<void> {
  const pathsToClear = [
    executionPlan.execution_result_path,
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
}): Promise<ExecutionOutcome> {
  const {
    projectRoot,
    sessionRoot,
    executionPlan,
    executorConfig,
    dispatch,
    maxRetries,
    retryInitialDelayMs,
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
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await invokeExecutor(executorConfig, projectRoot, sessionRoot, dispatch);
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
      };
    } catch (error: unknown) {
      lastError = error;
      if (attempt < maxRetries) {
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
    }
  }

  const completedAtMs = Date.now();
  const failure: ExecutionFailure = {
    unit_id: dispatch.unit_id,
    unit_kind: dispatch.unit_kind,
    packet_path: dispatch.packet_path,
    output_path: dispatch.output_path,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  };
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
    failure,
  };
}

async function readLensOutputsForDeliberation(
  dispatches: ExecutionDispatchResult[],
): Promise<LensOutputForDeliberation[]> {
  return Promise.all(
    dispatches.map(async (dispatch) => ({
      lens_id: dispatch.unit_id,
      output_path: dispatch.output_path,
      content: await fs.readFile(dispatch.output_path, "utf8"),
    })),
  );
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
  const participatingLensIds = args.lensOutputPaths.map((lensPath) =>
    path.basename(lensPath, ".md"),
  );
  let lastOutcome: ExecutionOutcome | null = null;
  let lastValidationError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
    const outcome = await runSingleDispatchWithRetries({
      projectRoot: args.projectRoot,
      sessionRoot: args.sessionRoot,
      executionPlan: args.executionPlan,
      executorConfig: args.executorConfig,
      dispatch,
      maxRetries: 1,
      retryInitialDelayMs: DEFAULT_LENS_RETRY_INITIAL_DELAY_MS,
    });
    lastOutcome = outcome;
    if (!outcome.success) {
      throw new Error(
        `Issue artifact generation failed for ${args.artifactId}: ${outcome.failure?.message ?? "unknown error"}`,
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
      await removeFileIfExists(seat.output_path);
    }
  }
  throw new Error(
    `Issue artifact validation failed for ${args.artifactId}: ${
      lastValidationError instanceof Error
        ? lastValidationError.message
        : String(lastValidationError)
    }${lastOutcome?.failure ? ` (${lastOutcome.failure.message})` : ""}`,
  );
}

async function runControlledLensDeliberation(args: {
  projectRoot: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  executorConfig: ReviewUnitExecutorConfig;
  successfulLensDispatches: ExecutionDispatchResult[];
  maxConcurrentLenses: number;
  issueArtifactContext?: string;
}): Promise<{
  deliberationDispatches: ExecutionDispatchResult[];
  deliberationOutcomes: ExecutionOutcome[];
  teamleadOutcome: ExecutionOutcome;
}> {
  const {
    projectRoot,
    sessionRoot,
    executionPlan,
    executorConfig,
    successfulLensDispatches,
    maxConcurrentLenses,
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

  const lensOutputs = await readLensOutputsForDeliberation(
    successfulLensDispatches,
  );
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

  for (const dispatch of deliberationDispatches) {
    const lensId = dispatch.unit_id.replace(/^deliberation-/, "");
    const ownOutput = lensOutputById.get(lensId);
    if (!ownOutput) {
      throw new Error(`Missing primary lens output for deliberation: ${lensId}`);
    }
    const otherOutputs = lensOutputs.filter((lens) => lens.lens_id !== lensId);
    const packetText = buildLensControlledDeliberationPrompt({
      session_id: executionPlan.session_id,
      lens_id: lensId,
      output_path: dispatch.output_path,
      own_output: ownOutput,
      other_outputs: otherOutputs,
      ...(issueArtifactContext ? { issue_artifact_context: issueArtifactContext } : {}),
    });
    await fs.mkdir(path.dirname(dispatch.packet_path), { recursive: true });
    await fs.writeFile(dispatch.packet_path, `${packetText.trimEnd()}\n`, "utf8");
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
      deliberationOutcomes[currentIndex] = await runSingleDispatchWithRetries({
        projectRoot,
        sessionRoot,
        executionPlan,
        executorConfig,
        dispatch,
        maxRetries: DEFAULT_LENS_MAX_RETRIES,
        retryInitialDelayMs: DEFAULT_LENS_RETRY_INITIAL_DELAY_MS,
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
    throw new Error(
      `Controlled lens deliberation failed for ${failedDeliberation.dispatch.unit_id}: ${failedDeliberation.failure.message}`,
    );
  }

  const lensDeliberationResponses: LensDeliberationResponseForTeamlead[] =
    await Promise.all(
      deliberationDispatches.map(async (dispatch) => {
        const lensId = dispatch.unit_id.replace(/^deliberation-/, "");
        return {
          lens_id: lensId,
          response_path: dispatch.output_path,
          content: await fs.readFile(dispatch.output_path, "utf8"),
        };
      }),
    );

  const teamleadPacketText = buildTeamleadControlledDeliberationPrompt({
    session_id: executionPlan.session_id,
    output_path: executionPlan.deliberation_output_path,
    lens_outputs: lensOutputs,
    lens_deliberation_responses: lensDeliberationResponses,
    ...(issueArtifactContext ? { issue_artifact_context: issueArtifactContext } : {}),
  });
  await fs.writeFile(
    executionPlan.teamlead_deliberation_prompt_packet_path,
    `${teamleadPacketText.trimEnd()}\n`,
    "utf8",
  );

  const teamleadDispatch: ExecutionDispatchResult = {
    unit_id: "controlled-deliberation",
    unit_kind: "deliberation",
    packet_path: executionPlan.teamlead_deliberation_prompt_packet_path,
    output_path: executionPlan.deliberation_output_path,
  };
  const teamleadOutcome = await runSingleDispatchWithRetries({
    projectRoot,
    sessionRoot,
    executionPlan,
    executorConfig,
    dispatch: teamleadDispatch,
    maxRetries: 1,
    retryInitialDelayMs: DEFAULT_LENS_RETRY_INITIAL_DELAY_MS,
  });
  if (!teamleadOutcome.success) {
    throw new Error(
      `Teamlead controlled deliberation failed: ${teamleadOutcome.failure?.message ?? "unknown error"}`,
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
    synthesizeExecutorConfig?: ReviewUnitExecutorConfig;
    maxConcurrentLenses?: number;
    reviewExecutionProfile?: ReviewExecutionProfile;
    ontoConfig?: OntoConfig;
  },
): Promise<ReviewPromptExecutionResult> {
  const projectRoot = path.resolve(params.projectRoot);
  const sessionRoot = path.resolve(params.sessionRoot);
  const executionPlanPath = path.join(sessionRoot, "execution-plan.yaml");
  const executionPlan = await readYamlDocument<ReviewExecutionPlan>(executionPlanPath);
  const executionStartedAtMs = Date.now();
  await resetExecutionOutputs(executionPlan);
  await appendMarkdownLogEntry(
    executionPlan.error_log_path,
    "runner boundary state",
    renderEffectiveBoundaryStateLog(executionPlan.effective_boundary_state),
  );

  const defaultExecutorConfig = params.defaultExecutorConfig;
  const synthesizeExecutorConfig =
    params.synthesizeExecutorConfig ?? defaultExecutorConfig;
  const maxConcurrentLenses = Math.max(
    1,
    Math.min(
      params.maxConcurrentLenses ?? 1,
      executionPlan.lens_prompt_packet_seats.length || 1,
    ),
  );

  const lensDispatches: ExecutionDispatchResult[] =
    executionPlan.lens_prompt_packet_seats.map((seat) => ({
      unit_id: seat.lens_id,
      unit_kind: "lens" as const,
      packet_path: seat.packet_path,
      output_path: seat.output_path,
    }));

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

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await invokeExecutor(defaultExecutorConfig, projectRoot, sessionRoot, dispatch);
          succeeded = true;
          break;
        } catch (error: unknown) {
          lastError = error;
          if (attempt < maxRetries) {
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
        };
      } else {
        const completedAtMs = Date.now();
        const failure: ExecutionFailure = {
          unit_id: dispatch.unit_id,
          unit_kind: dispatch.unit_kind,
          packet_path: dispatch.packet_path,
          output_path: dispatch.output_path,
          message: lastError instanceof Error ? lastError.message : String(lastError),
        };
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
          failure,
        };
      }
    }
  }

  if (
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
    // `participating_lens_ids` is the authoritative success set (orchestrator
    // ok AND output file exists + non-empty). Missing / failed → record as
    // ExecutionFailure; also remove empty output files for consistency with
    // worker-pool cleanup path.
    for (let i = 0; i < lensDispatches.length; i += 1) {
      const dispatch = lensDispatches[i]!;
      const reported = nestedResult.nested_raw.outcomes[i];
      const participating = nestedResult.participating_lens_ids.includes(
        dispatch.unit_id,
      );
      if (participating) {
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
        };
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

  const successfulLensDispatches = executionOutcomes
    .filter(isSuccessfulOutcome)
    .map((outcome) => outcome.dispatch);
  const executionFailures = executionOutcomes
    .filter(isFailureOutcome)
    .map((outcome) => outcome.failure);

  if (successfulLensDispatches.length < 2) {
    const haltReason =
      successfulLensDispatches.length === 0
        ? "No participating lens outputs were produced."
        : "Fewer than two participating lens outputs remain after degraded execution.";
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
      deliberation_status: null,
      halt_reason: haltReason,
      error_log_path: executionPlan.error_log_path,
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
    };
  }

  const issueArtifactOutcomes: ExecutionOutcome[] = [];
  const lensOutputPaths = successfulLensDispatches.map(
    (dispatch) => dispatch.output_path,
  );
  for (const artifactId of PRE_DELIBERATION_ISSUE_ARTIFACT_IDS) {
    issueArtifactOutcomes.push(
      await runIssueArtifactDispatch({
        projectRoot,
        sessionRoot,
        executionPlan,
        executorConfig: defaultExecutorConfig,
        artifactId,
        lensOutputPaths,
      }),
    );
  }
  const issueArtifactContext = await renderIssueArtifactContext({
    projectRoot,
    executionPlan,
  });

  const controlledDeliberation = await runControlledLensDeliberation({
    projectRoot,
    sessionRoot,
    executionPlan,
    executorConfig: defaultExecutorConfig,
    successfulLensDispatches,
    maxConcurrentLenses,
    issueArtifactContext,
  });

  issueArtifactOutcomes.push(
    await runIssueArtifactDispatch({
      projectRoot,
      sessionRoot,
      executionPlan,
      executorConfig: defaultExecutorConfig,
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
    }),
  );

  const synthesizePacketRuntimePath = path.join(
    executionPlan.prompt_packets_root,
    "synthesize.runtime.prompt.md",
  );
  const synthesizePacketText = await fs.readFile(
    executionPlan.synthesize_prompt_packet_path,
    "utf8",
  );
  const enrichedSynthesizePacketText = `${synthesizePacketText.trimEnd()}\n\n${renderLensOutputRefsSection(
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
  ])}\n\n${renderDegradedLensFailuresSection(
    executionFailures.filter((failure) => failure.unit_kind === "lens"),
  )}`;
  await fs.writeFile(
    synthesizePacketRuntimePath,
    enrichedSynthesizePacketText.trimEnd() + "\n",
    "utf8",
  );

  const synthesizeDispatch: ExecutionDispatchResult = {
    unit_id: "synthesize",
    unit_kind: "synthesize",
    packet_path: synthesizePacketRuntimePath,
    output_path: executionPlan.synthesis_output_path,
  };

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
  const synthesizeStartedAtMs = Date.now();
  const synthesizeMaxRetries = 1; // process.md: "Retry once before halting"
  let synthesizeOutcome: ExecutionOutcome | null = null;
  let synthesizeLastError: unknown = undefined;
  let synthesizeSucceeded = false;

  for (let attempt = 0; attempt <= synthesizeMaxRetries; attempt++) {
    try {
      await invokeExecutor(
        synthesizeExecutorConfig,
        projectRoot,
        sessionRoot,
        synthesizeDispatch,
      );
      synthesizeSucceeded = true;
      break;
    } catch (error: unknown) {
      synthesizeLastError = error;
      if (attempt < synthesizeMaxRetries) {
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
    }
  }

  if (synthesizeSucceeded) {
    synthesizeOutcome = {
      dispatch: synthesizeDispatch,
      success: true,
      startedAtMs: synthesizeStartedAtMs,
      completedAtMs: Date.now(),
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
    };
    synthesizeOutcome = {
      dispatch: synthesizeDispatch,
      success: false,
      startedAtMs: synthesizeStartedAtMs,
      completedAtMs: Date.now(),
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
      error_log_path: executionPlan.error_log_path,
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
      "max-concurrent-lenses": { type: "string" },
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
  const maxConcurrentLenses =
    typeof values["max-concurrent-lenses"] === "string" &&
    values["max-concurrent-lenses"].length > 0
      ? requirePositiveInteger(values["max-concurrent-lenses"], "max-concurrent-lenses")
      : defaultMaxConcurrentLensesForExecutorConfig(defaultExecutorConfig);

  return executeReviewPromptExecution({
    projectRoot: requireString(values["project-root"], "project-root"),
    sessionRoot: requireString(values["session-root"], "session-root"),
    defaultExecutorConfig,
    synthesizeExecutorConfig,
    maxConcurrentLenses,
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
