import fs from "node:fs/promises";
import path from "node:path";
import {
  fileExists,
  isoFromTimestamp,
  isoNow,
  readYamlDocument,
  writeYamlDocument,
} from "./review-artifact-utils.js";
import {
  buildReviewPipelineExecutionLedger,
  type ReviewRunManifestForLedger,
} from "./pipeline-execution-ledger.js";
import {
  fileSha256IfPresent,
  isResolvedLedgerUnit,
  isTrustedLedgerUnit,
  type PipelineExecutionLedger,
} from "../pipeline-execution-ledger.js";
import {
  buildReviewContinuationPlan,
  type ReviewContinuationPlan,
  type ReviewContinuationUnit,
} from "./continuation-plan.js";
import { readValidatedLensSidecarArtifact } from "./lens-sidecar-artifact.js";
import {
  computeLensCompletionBarrier,
  resolveRequiredParticipatingLensCount,
} from "./lens-completion-policy.js";
import { assertHostOrchestratedSession } from "./orchestration-owner.js";
import { semanticQualityEvidenceForArtifactGeneration } from "./artifact-generation-realization.js";
import { defaultReviewRetrySettings } from "../discovery/settings-chain.js";
import {
  buildIssueStanceInputProjection,
  buildIssueStanceResponsePrompt,
  PRE_DELIBERATION_ISSUE_ARTIFACT_IDS,
  renderIssueStanceInputProjectionSection,
  resolveProblemFramingProfileRef,
  writeIssueArtifactPromptPacket,
  writeIssueStanceMatrixFromResponses,
} from "./issue-artifact-runtime.js";
import {
  buildIssueScopedDeliberationWorklist,
  buildIssueScopedLensDeliberationPrompt,
  buildTeamleadIssueResolutionPrompt,
  deliberationResolutionPath,
  renderDeliberationMarkdownProjection,
  validateDeliberationResolutionObject,
  type IssueDeliberationResponseArtifact,
} from "./controlled-lens-deliberation.js";
import {
  renderIssueSynthesisPrompt,
  synthesisLedgerPath,
  synthesisWorkItemsPath,
  validateIssueSynthesisResponseOnDisk,
  writeReviewSynthesisLedger,
  writeReviewSynthesisWorkItems,
  writeSynthesisMarkdownFromLedger,
  type IssueSynthesisResponseArtifact,
  type ReviewSynthesisWorkItemsArtifact,
} from "./synthesis-map-reduce.js";
import { renderReviewUnitBoundaryDetailsSection } from "./unit-boundary-details.js";
import type {
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewIssueArtifactId,
  ReviewLensCompletionBarrierArtifact,
  ReviewSessionMetadata,
  ReviewUnitExecutionResult,
  ReviewUnitKind,
} from "./artifact-types.js";

/**
 * Shared durable step engine for review execution (Phase 2, Stage 1).
 *
 * Progression is driven by on-disk artifacts -> PipelineExecutionLedger ->
 * continuation-plan frontier, NOT by in-memory control flow. The onto-runtime
 * path (A) and the host-orchestration path (B) share these steps; the only
 * difference between A and B is who *executes* a unit (onto spawns vs the host
 * spawns). Extractions so far: 4a `computeReviewFrontier` (read-only frontier);
 * 4b `validateUnitSeatToResult` + `mergeUnitResultIntoExecutionResult` (seat ->
 * result -> execution-result merge); 4c `ensureUnitPacket` (frontier-unit prompt
 * packet from durable state); 4d `finalizeStageGate` (lens-completion barrier
 * from durable state, via the shared `computeLensCompletionBarrier`); 4e
 * `reviewRound` / `reviewAdvance` (the host B round engine assembled on 4a-4d,
 * fail-closed to host-orchestrated sessions). The terminal `assembleIfComplete`
 * step calls `completeReviewSession`, which lives in the cli layer, so the
 * core-api wrapper runs it when reviewAdvance signals `ready_to_assemble`.
 */

/**
 * Single-source runtime mirror of the closed {@link ReviewUnitKind} union. The
 * `satisfies Record<ReviewUnitKind, true>` makes adding an enum member a compile
 * error here, so a new kind cannot be planned/executed until it is wired into the
 * result buckets ({@link mergeUnitResultIntoExecutionResult}) and the seat gate.
 * This is the guard against the silent-drop where an unhandled unit_kind would
 * leave the frontier permanently stalled with no error.
 */
const REVIEW_UNIT_KINDS = {
  lens: true,
  issue_artifact: true,
  deliberation: true,
  synthesize: true,
} satisfies Record<ReviewUnitKind, true>;

function isReviewUnitKind(value: string): value is ReviewUnitKind {
  return Object.prototype.hasOwnProperty.call(REVIEW_UNIT_KINDS, value);
}

async function readOptionalYamlArtifact<T>(filePath: string): Promise<T | null> {
  if (!(await fileExists(filePath))) return null;
  return readYamlDocument<T>(filePath);
}

function executionPlanPath(sessionRoot: string): string {
  return path.join(sessionRoot, "execution-plan.yaml");
}

function executionResultPath(sessionRoot: string): string {
  return path.join(sessionRoot, "execution-result.yaml");
}

/** Load the prepared session's execution plan from durable state, or throw. */
async function loadExecutionPlan(sessionRoot: string): Promise<ReviewExecutionPlan> {
  const executionPlan = await readOptionalYamlArtifact<ReviewExecutionPlan>(
    executionPlanPath(sessionRoot),
  );
  if (!executionPlan) {
    throw new Error(
      `review-execution-steps requires execution-plan.yaml: ${sessionRoot}`,
    );
  }
  return executionPlan;
}

/**
 * Reconstruct the PipelineExecutionLedger for a prepared session from durable
 * state (execution-plan + optional execution-result / review-run-manifest /
 * lens-completion-barrier). Read-only.
 *
 * Shared by {@link computeReviewFrontier} (frontier) and the packet/result
 * steps that need trusted-unit provenance (e.g. {@link ensureUnitPacket}'s
 * lens-output reconstruction).
 */
export async function buildSessionLedger(
  sessionRoot: string,
  executionPlan?: ReviewExecutionPlan,
): Promise<PipelineExecutionLedger> {
  const planPath = executionPlanPath(sessionRoot);
  const plan = executionPlan ?? (await loadExecutionPlan(sessionRoot));

  const resultPath = executionResultPath(sessionRoot);
  const reviewRunManifestPath = path.join(sessionRoot, "review-run-manifest.yaml");
  const lensCompletionBarrierPath = path.join(
    sessionRoot,
    "lens-completion-barrier.yaml",
  );

  const executionResult =
    await readOptionalYamlArtifact<ReviewExecutionResultArtifact>(resultPath);
  const reviewRunManifest =
    await readOptionalYamlArtifact<ReviewRunManifestForLedger>(
      reviewRunManifestPath,
    );
  const lensCompletionBarrier =
    await readOptionalYamlArtifact<ReviewLensCompletionBarrierArtifact>(
      lensCompletionBarrierPath,
    );

  // artifactRefs only contributes the ledger's provenance `sourceRefs`; it does
  // not affect unit entries or the frontier. A minimal set keeps this module
  // free of the heavy invocation-runner import.
  const artifactRefs: Record<string, string> = {
    execution_plan: planPath,
    ...(executionResult ? { execution_result: resultPath } : {}),
    ...(reviewRunManifest ? { review_run_manifest: reviewRunManifestPath } : {}),
    ...(lensCompletionBarrier
      ? { lens_completion_barrier: lensCompletionBarrierPath }
      : {}),
    ...(plan.finding_ledger_path
      ? { finding_ledger: plan.finding_ledger_path }
      : {}),
    ...(plan.issue_ledger_path ? { issue_ledger: plan.issue_ledger_path } : {}),
    ...(plan.review_context_manifest_path
      ? { review_context_manifest: plan.review_context_manifest_path }
      : {}),
  };

  return buildReviewPipelineExecutionLedger({
    sessionRoot,
    executionPlan: plan,
    artifactRefs,
    executionResult,
    reviewRunManifest,
    lensCompletionBarrier,
  });
}

/**
 * Build the current review frontier for a prepared session from durable state.
 *
 * Reconstructs the PipelineExecutionLedger (see {@link buildSessionLedger}) and
 * returns the continuation plan whose `frontierUnits` are the units that are
 * ready to run next (all upstreams trusted, not yet trusted themselves).
 *
 * Read-only: writes nothing. A fresh session (no execution-result) yields the
 * initial stage (lens units) as the frontier.
 */
export async function computeReviewFrontier(
  sessionRoot: string,
  targetUnits?: string[],
): Promise<ReviewContinuationPlan> {
  const ledger = await buildSessionLedger(sessionRoot);
  return buildReviewContinuationPlan({
    ledger,
    ...(targetUnits !== undefined ? { targetUnits } : {}),
  });
}

/**
 * Validate one frontier unit's on-disk seat from durable state and project it
 * into a {@link ReviewUnitExecutionResult} (4b, strangler extraction).
 *
 * A and B share this seat-level gate; the only thing they do differently is
 * *execute* the unit (onto spawns vs the host spawns). The host writes the
 * seat at the unit's canonical `output_path`; this function reads that seat and
 * decides whether it is a `completed` or `failed` result. It does NOT write the
 * ledger/execution-result — that authority stays with onto via
 * {@link mergeUnitResultIntoExecutionResult}.
 *
 * Seat gate (mirrors run-review-prompt-execution `validateUnitOutputFile`):
 * - seat absent / unset output_path -> failed (output_contract).
 * - seat empty -> failed (empty_output).
 * - lens unit + sidecar lens format -> structural sidecar validation.
 * - otherwise -> non-empty is sufficient (deeper per-artifact semantic
 *   validation runs where the pipeline already applies it, when a downstream
 *   stage consumes the artifact).
 *
 * Timing is not measured here (the host ran the unit, not onto), so the result
 * carries `timestamp_provenance: "batch_window"` to mark its duration as
 * non-comparable, with `recordedAt` (default: now) as both endpoints.
 */
export async function validateUnitSeatToResult(args: {
  sessionRoot: string;
  unit: ReviewContinuationUnit;
  recordedAt?: string;
  executionPlan?: ReviewExecutionPlan;
}): Promise<ReviewUnitExecutionResult> {
  const { unit } = args;
  if (!isReviewUnitKind(unit.unitKind)) {
    throw new Error(
      `validateUnitSeatToResult: unit ${unit.unitId} has unknown unit_kind "${unit.unitKind}" (not a ReviewUnitKind); a new kind must be wired into the result buckets and frontier routing before it can be executed.`,
    );
  }
  const executionPlan =
    args.executionPlan ?? (await loadExecutionPlan(args.sessionRoot));
  const recordedAt = args.recordedAt ?? isoNow();

  const baseResult = (
    extra: Partial<ReviewUnitExecutionResult>,
  ): ReviewUnitExecutionResult => ({
    unit_id: unit.unitId,
    unit_kind: unit.unitKind as ReviewUnitExecutionResult["unit_kind"],
    packet_path: unit.packetPath ?? "",
    output_path: unit.outputPath ?? "",
    status: "completed",
    started_at: recordedAt,
    completed_at: recordedAt,
    duration_ms: 0,
    timestamp_provenance: "batch_window",
    failure_message: null,
    failure_kind: null,
    ...extra,
  });

  const outputPath = unit.outputPath;
  if (!outputPath) {
    return baseResult({
      status: "failed",
      failure_kind: "output_contract",
      failure_message: `Review unit ${unit.unitId} has no seat output path.`,
    });
  }
  if (!(await fileExists(outputPath))) {
    return baseResult({
      status: "failed",
      failure_kind: "output_contract",
      failure_message: `Review unit ${unit.unitId} did not create output file: ${outputPath}`,
    });
  }
  const seatText = await fs.readFile(outputPath, "utf8");
  if (seatText.trim().length === 0) {
    return baseResult({
      status: "failed",
      failure_kind: "empty_output",
      failure_message: `Review unit ${unit.unitId} produced empty output: ${outputPath}`,
    });
  }

  if (
    unit.unitKind === "lens" &&
    (executionPlan.lens_output_format ?? "markdown") === "sidecar"
  ) {
    try {
      await readValidatedLensSidecarArtifact({
        sidecarPath: outputPath,
        sessionId: executionPlan.session_id,
        lensId: unit.lensId ?? unit.unitId,
      });
    } catch (error: unknown) {
      return baseResult({
        status: "failed",
        failure_kind: "output_contract",
        failure_message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return baseResult({});
}

function upsertUnitResult(
  results: ReviewUnitExecutionResult[],
  result: ReviewUnitExecutionResult,
): ReviewUnitExecutionResult[] {
  const index = results.findIndex((entry) => entry.unit_id === result.unit_id);
  if (index === -1) return [...results, result];
  const next = [...results];
  next[index] = result;
  return next;
}

/**
 * Merge one unit result into the session's execution-result.yaml (4b).
 *
 * Unifies the host (B) path's per-round results: each advance validates a seat
 * (see {@link validateUnitSeatToResult}) and merges the result into the right
 * bucket by `unit_kind`, replacing any prior entry for the same `unit_id`.
 * Re-deriving the ledger from the updated execution-result then advances the
 * frontier (ledger `buildUnitEntry` reads unit status from execution-result
 * first), keeping artifact-truth authority with onto.
 *
 * execution-result.yaml must already exist (the prepared session scaffold) or a
 * `base` artifact must be supplied; this function never invents the
 * execution-level metadata.
 */
export async function mergeUnitResultIntoExecutionResult(args: {
  sessionRoot: string;
  result: ReviewUnitExecutionResult;
  base?: ReviewExecutionResultArtifact;
}): Promise<ReviewExecutionResultArtifact> {
  const resultPath = executionResultPath(args.sessionRoot);
  const existing =
    await readOptionalYamlArtifact<ReviewExecutionResultArtifact>(resultPath);
  const artifact = existing ?? args.base;
  if (!artifact) {
    throw new Error(
      `mergeUnitResultIntoExecutionResult requires an existing execution-result.yaml or a base scaffold: ${args.sessionRoot}`,
    );
  }

  const { result } = args;
  const merged: ReviewExecutionResultArtifact = (() => {
    switch (result.unit_kind) {
      case "lens":
        return {
          ...artifact,
          lens_execution_results: upsertUnitResult(
            artifact.lens_execution_results,
            result,
          ),
        };
      case "issue_artifact":
        return {
          ...artifact,
          issue_artifact_execution_results: upsertUnitResult(
            artifact.issue_artifact_execution_results ?? [],
            result,
          ),
        };
      case "deliberation":
        return {
          ...artifact,
          deliberation_execution_results: upsertUnitResult(
            artifact.deliberation_execution_results ?? [],
            result,
          ),
        };
      case "synthesize":
        // The singular `synthesize` is the runtime reduce; per-issue
        // `synthesis:<issue>` map results go to their own bucket so the N maps
        // do not overwrite each other or the reduce.
        return result.unit_id === "synthesize"
          ? { ...artifact, synthesize_execution_result: result }
          : {
              ...artifact,
              synthesis_map_execution_results: upsertUnitResult(
                artifact.synthesis_map_execution_results ?? [],
                result,
              ),
            };
      default: {
        const exhaustive: never = result.unit_kind;
        throw new Error(
          `mergeUnitResultIntoExecutionResult: no execution-result bucket for unit_kind "${String(exhaustive)}" (unit ${result.unit_id}); extend this switch when adding a ReviewUnitKind.`,
        );
      }
    }
  })();

  const withLensSummary = withDerivedLensSummary(merged);
  await writeYamlDocument(resultPath, withLensSummary);
  return withLensSummary;
}

/**
 * Keep the lens summary counters in step with `lens_execution_results`.
 *
 * The mid-run artifact used to carry the scaffold's `[]` / `0` until the run
 * finished, so a file holding nine completed lens results also said zero lenses
 * had executed. Deriving on every merge means the two never disagree.
 *
 * This is the *recorded* view (a lens result whose seat validated). The terminal
 * writers narrow further — {@link finalizeHostExecutionResultIfComplete} to
 * ledger-trusted lenses, the runner's batch write to its own outcomes — so the
 * count can shrink at the end; it can never read as zero while results exist.
 */
function withDerivedLensSummary(
  artifact: ReviewExecutionResultArtifact,
): ReviewExecutionResultArtifact {
  const participating = artifact.lens_execution_results
    .filter((result) => result.status === "completed")
    .map((result) => result.unit_id);
  const degraded = artifact.lens_execution_results
    .filter((result) => result.status === "failed")
    .map((result) => result.unit_id);
  // `excluded_lens_ids` stays owned by the terminal writers: mid-run, a lens that
  // has not reported is pending, not excluded, and "excluded" is a verdict about
  // a finished run.
  return {
    ...artifact,
    participating_lens_ids: participating,
    degraded_lens_ids: degraded,
    executed_lens_count: participating.length,
  };
}

/** Session metadata the plan points at (carries project_root + orchestration). */
async function loadSessionMetadata(
  plan: ReviewExecutionPlan,
): Promise<ReviewSessionMetadata> {
  const metadata = await readOptionalYamlArtifact<ReviewSessionMetadata>(
    plan.session_metadata_path,
  );
  if (!metadata) {
    throw new Error(
      `review-execution-steps requires session-metadata: ${plan.session_metadata_path}`,
    );
  }
  return metadata;
}

/** Repo project root, read from the session metadata the plan points at. */
async function loadProjectRoot(plan: ReviewExecutionPlan): Promise<string> {
  const metadata = await loadSessionMetadata(plan);
  if (!metadata.project_root) {
    throw new Error(
      `review-execution-steps requires session-metadata project_root: ${plan.session_metadata_path}`,
    );
  }
  return metadata.project_root;
}

/**
 * Fail-closed orchestration-owner guard (capability surface, Step 5). The host
 * round/advance steps run only on a host-orchestrated session; the gate
 * semantics live in {@link assertHostOrchestratedSession}, this reads the stamp.
 */
async function assertHostOrchestration(
  plan: ReviewExecutionPlan,
): Promise<void> {
  const metadata = await loadSessionMetadata(plan);
  assertHostOrchestratedSession(metadata.orchestration);
}

/** Trusted units of a given kind, in ledger order, with their seat output path. */
function trustedUnitOutputPaths(
  ledger: PipelineExecutionLedger,
  unitKind: string,
): string[] {
  return ledger.units
    .filter((entry) => entry.unitKind === unitKind && isTrustedLedgerUnit(entry))
    .flatMap((entry) => entry.outputRefs.slice(0, 1));
}

export interface IssueArtifactPacketInputs {
  projectRoot: string;
  lensOutputPaths: string[];
  deliberationResponsePaths: string[];
  deliberationOutputPath: string | undefined;
  problemFramingProfileRef: string | null;
}

/**
 * Reconstruct, from durable session state, the inputs that
 * {@link writeIssueArtifactPromptPacket} consumes (4c).
 *
 * In the onto-runtime path (A) these come from in-memory execution context; the
 * host path (B) has only on-disk state, so this rebuilds them: `project_root`
 * from the plan, `lensOutputPaths` from the trusted lens units in the ledger,
 * and (for the post-deliberation `problem-framing` artifact) the deliberation
 * refs from the trusted deliberation units + the plan's teamlead deliberation
 * output + the resolved problem-framing profile.
 */
export async function reconstructIssueArtifactPacketInputs(
  sessionRoot: string,
  artifactId: ReviewIssueArtifactId,
  executionPlan?: ReviewExecutionPlan,
): Promise<IssueArtifactPacketInputs> {
  const plan = executionPlan ?? (await loadExecutionPlan(sessionRoot));
  const projectRoot = await loadProjectRoot(plan);
  const ledger = await buildSessionLedger(sessionRoot, plan);
  const lensOutputPaths = trustedUnitOutputPaths(ledger, "lens");

  if (artifactId !== "problem-framing") {
    return {
      projectRoot,
      lensOutputPaths,
      deliberationResponsePaths: [],
      deliberationOutputPath: undefined,
      problemFramingProfileRef: null,
    };
  }

  // `deliberationOutputPath` feeds writeIssueArtifactPromptPacket, which reads it
  // as the deliberation *resolution* YAML — so this is deliberation-resolution.yaml,
  // not the deliberation.md human projection.
  const resolutionPath = deliberationResolutionPath(plan.session_root);
  const deliberationOutputPath = (await fileExists(resolutionPath))
    ? resolutionPath
    : undefined;
  return {
    projectRoot,
    lensOutputPaths,
    deliberationResponsePaths: trustedUnitOutputPaths(ledger, "deliberation"),
    deliberationOutputPath,
    problemFramingProfileRef: await resolveProblemFramingProfileRef({
      projectRoot,
      executionPlan: plan,
    }),
  };
}

export interface EnsureUnitPacketResult {
  packetPath: string;
  generated: boolean;
}

/** Issue-artifact output paths for the given ids (mirrors the A runner helper). */
function issueArtifactOutputPaths(
  executionPlan: ReviewExecutionPlan,
  artifactIds: readonly ReviewIssueArtifactId[],
): string[] {
  const ids = new Set(artifactIds);
  return executionPlan.issue_artifact_prompt_packet_seats
    .filter((seat) => ids.has(seat.artifact_id))
    .map((seat) => seat.output_path);
}

/**
 * Reconstruct A's `renderReviewUnitBoundaryContext` (which lives in the cli
 * layer) from the review-layer {@link renderReviewUnitBoundaryDetailsSection},
 * so the host (B) packet carries the identical boundary section without a cli
 * import. Same wrapper: leading newline + `repo_exploration_policy: "denied"`.
 */
function renderHostUnitBoundaryContext(args: {
  projectRoot: string;
  executionPlan: ReviewExecutionPlan;
  unitId: string;
  outputPath: string;
  allowedReadRefs: string[];
}): string {
  return `\n${renderReviewUnitBoundaryDetailsSection({
    projectRoot: args.projectRoot,
    unitId: args.unitId,
    outputPath: args.outputPath,
    allowedReadRefs: args.allowedReadRefs,
    repoExplorationPolicy: "denied",
    boundaryPolicy: args.executionPlan.boundary_policy,
    effectiveBoundaryState: args.executionPlan.effective_boundary_state,
    boundaryEnforcementProfile: args.executionPlan.boundary_enforcement_profile,
  })}`;
}

async function writePacket(packetPath: string, packetText: string): Promise<void> {
  await fs.mkdir(path.dirname(packetPath), { recursive: true });
  await fs.writeFile(packetPath, `${packetText.trimEnd()}\n`, "utf8");
}

/**
 * Reconstruct an `issue-stance:<lens>` map packet from durable state (Stage 2).
 * Mirrors A's `runIssueStanceMatrixCollectionDispatch` per-lens dispatch: the
 * runtime stance input projection (from finding/relation/issue ledgers) plus the
 * trusted lens outputs. The stance prompt carries no boundary section.
 */
async function reconstructStancePacket(
  sessionRoot: string,
  unit: ReviewContinuationUnit,
  plan: ReviewExecutionPlan,
): Promise<EnsureUnitPacketResult> {
  const lensId = unit.unitId.slice("issue-stance:".length);
  const projectRoot = await loadProjectRoot(plan);
  const ledger = await buildSessionLedger(sessionRoot, plan);
  const lensOutputPaths = trustedUnitOutputPaths(ledger, "lens");
  const [findingLedger, relationGraph, issueLedger] = await Promise.all([
    readYamlDocument<Record<string, unknown>>(plan.finding_ledger_path),
    readYamlDocument<Record<string, unknown>>(plan.finding_relation_graph_path),
    readYamlDocument<Record<string, unknown>>(plan.issue_ledger_path),
  ]);
  const projection = renderIssueStanceInputProjectionSection(
    buildIssueStanceInputProjection({
      projectRoot,
      findingLedgerPath: plan.finding_ledger_path,
      findingRelationGraphPath: plan.finding_relation_graph_path,
      issueLedgerPath: plan.issue_ledger_path,
      findingLedger,
      relationGraph,
      issueLedger,
      lensOutputPaths,
    }),
  );
  const outputPath = unit.outputPath ?? "";
  const packetText = buildIssueStanceResponsePrompt({
    sessionId: plan.session_id,
    projectRoot,
    executionPlan: plan,
    lensId,
    outputPath,
    lensOutputPaths,
    issueStanceInputProjection: projection,
  });
  const packetPath = unit.packetPath ?? "";
  await writePacket(packetPath, packetText);
  return { packetPath, generated: true };
}

/**
 * Reconstruct a deliberation packet: the per-issue `deliberation:<issue>:<lens>`
 * map unit (from the issue-scoped worklist) or the `controlled-deliberation`
 * teamlead reduce (from the trusted per-issue responses). Mirrors A's two call
 * sites in the runner.
 */
async function reconstructDeliberationPacket(
  sessionRoot: string,
  unit: ReviewContinuationUnit,
  plan: ReviewExecutionPlan,
): Promise<EnsureUnitPacketResult> {
  const projectRoot = await loadProjectRoot(plan);
  const packetPath = unit.packetPath ?? "";

  if (unit.unitId === "controlled-deliberation") {
    const [deliberationPlan, issueLedger] = await Promise.all([
      readYamlDocument<Record<string, unknown>>(plan.deliberation_plan_path),
      readYamlDocument<Record<string, unknown>>(plan.issue_ledger_path),
    ]);
    const ledger = await buildSessionLedger(sessionRoot, plan);
    const responsePaths = ledger.units
      .filter(
        (entry) =>
          entry.unitKind === "deliberation" &&
          entry.unitId.startsWith("deliberation:") &&
          isTrustedLedgerUnit(entry),
      )
      .flatMap((entry) => entry.outputRefs.slice(0, 1));
    const responses = await Promise.all(
      responsePaths.map((responsePath) =>
        readYamlDocument<IssueDeliberationResponseArtifact>(responsePath),
      ),
    );
    const outputPath = unit.outputPath ?? deliberationResolutionPath(plan.session_root);
    const teamleadReadRefs = [
      plan.issue_ledger_path,
      plan.issue_stance_matrix_path,
      plan.deliberation_plan_path,
      ...responsePaths,
      ...issueArtifactOutputPaths(plan, PRE_DELIBERATION_ISSUE_ARTIFACT_IDS),
    ];
    const packetText = buildTeamleadIssueResolutionPrompt({
      sessionId: plan.session_id,
      projectRoot,
      outputPath,
      deliberationPlan,
      issueLedger,
      responses,
      boundaryContext: renderHostUnitBoundaryContext({
        projectRoot,
        executionPlan: plan,
        unitId: unit.unitId,
        outputPath,
        allowedReadRefs: teamleadReadRefs,
      }),
    });
    await writePacket(packetPath, packetText);
    return { packetPath, generated: true };
  }

  const [deliberationPlan, issueLedger, issueStanceMatrix] = await Promise.all([
    readYamlDocument<Record<string, unknown>>(plan.deliberation_plan_path),
    readYamlDocument<Record<string, unknown>>(plan.issue_ledger_path),
    readYamlDocument<Record<string, unknown>>(plan.issue_stance_matrix_path),
  ]);
  const workItems = buildIssueScopedDeliberationWorklist({
    promptPacketsRoot: plan.prompt_packets_root,
    deliberationRootPath: plan.deliberation_root_path,
    deliberationPlan,
    issueLedger,
    issueStanceMatrix,
  });
  const workItem = workItems.find(
    (item) => `deliberation:${item.issue_id}:${item.lens_id}` === unit.unitId,
  );
  if (!workItem) {
    throw new Error(
      `reconstructDeliberationPacket: no work item for ${unit.unitId} in deliberation-plan.`,
    );
  }
  const outputPath = unit.outputPath ?? workItem.output_path;
  const deliberationReadRefs = [
    plan.issue_ledger_path,
    plan.issue_stance_matrix_path,
    plan.deliberation_plan_path,
    plan.finding_ledger_path,
    plan.finding_relation_graph_path,
  ];
  const packetText = buildIssueScopedLensDeliberationPrompt({
    sessionId: plan.session_id,
    projectRoot,
    workItem,
    boundaryContext: renderHostUnitBoundaryContext({
      projectRoot,
      executionPlan: plan,
      unitId: unit.unitId,
      outputPath,
      allowedReadRefs: deliberationReadRefs,
    }),
  });
  await writePacket(packetPath, packetText);
  return { packetPath, generated: true };
}

/**
 * Reconstruct a `synthesis:<issue>` map packet from the durable
 * `synthesis-work-items.yaml`. Mirrors A's per-work-item synthesis dispatch.
 */
async function reconstructSynthesisPacket(
  unit: ReviewContinuationUnit,
  plan: ReviewExecutionPlan,
): Promise<EnsureUnitPacketResult> {
  const projectRoot = await loadProjectRoot(plan);
  const workItemsPath = synthesisWorkItemsPath(plan.session_root);
  const workItems =
    await readYamlDocument<ReviewSynthesisWorkItemsArtifact>(workItemsPath);
  const workItem = workItems.work_items.find(
    (item) => item.work_item_id === unit.unitId,
  );
  if (!workItem) {
    throw new Error(
      `reconstructSynthesisPacket: no work item for ${unit.unitId} in synthesis-work-items.`,
    );
  }
  const synthesisReadRefs = [
    workItemsPath,
    plan.finding_ledger_path,
    plan.finding_relation_graph_path,
    plan.issue_ledger_path,
    plan.issue_stance_matrix_path,
    plan.deliberation_plan_path,
    deliberationResolutionPath(plan.session_root),
    plan.problem_framing_path,
    plan.review_target_profile_path,
  ];
  const packetText = renderIssueSynthesisPrompt({
    sessionId: plan.session_id,
    projectRoot,
    workItem,
    workItemsPath,
    boundaryContext: renderHostUnitBoundaryContext({
      projectRoot,
      executionPlan: plan,
      unitId: unit.unitId,
      outputPath: workItem.response_path,
      allowedReadRefs: synthesisReadRefs,
    }),
  });
  const packetPath = unit.packetPath ?? workItem.packet_path;
  await writePacket(packetPath, packetText);
  return { packetPath, generated: true };
}

/**
 * Ensure a frontier unit's prompt packet exists on disk, generating it from
 * durable state when the host (B) is about to execute the unit (4c).
 *
 * The onto-runtime path (A) generates these packets inline inside
 * `executeReviewPromptExecution`; this is the shared, durable-state extraction
 * so the host round can produce the same packet without that in-memory context.
 * A and B differ only in who *executes* the unit afterward.
 *
 * - `lens`: prepare already materialized the packet -> noop; assert it exists
 *   and return its path.
 * - `issue-stance:<lens>`: reconstruct via {@link reconstructStancePacket}.
 * - `issue_artifact`: generate via {@link writeIssueArtifactPromptPacket} with
 *   inputs rebuilt by {@link reconstructIssueArtifactPacketInputs}.
 * - `deliberation` (`deliberation:<i>:<l>` and `controlled-deliberation`):
 *   reconstruct via {@link reconstructDeliberationPacket}.
 * - `synthesize` (`synthesis:<issue>`): reconstruct via
 *   {@link reconstructSynthesisPacket}.
 *
 * Each reconstruction mirrors A's corresponding runner call site, rebuilding the
 * builder inputs from durable disk state (no cli import). The runtime reduce
 * units (`issue-stance-matrix`, `synthesize`) never reach here — they are not
 * host-executed and carry no LLM packet (see {@link computeRoundResult}).
 */
export async function ensureUnitPacket(
  sessionRoot: string,
  unit: ReviewContinuationUnit,
  executionPlan?: ReviewExecutionPlan,
): Promise<EnsureUnitPacketResult> {
  const plan = executionPlan ?? (await loadExecutionPlan(sessionRoot));

  if (unit.unitKind === "lens") {
    const packetPath = unit.packetPath ?? "";
    if (!packetPath || !(await fileExists(packetPath))) {
      throw new Error(
        `ensureUnitPacket: lens packet missing for ${unit.unitId} (prepare must materialize it): ${packetPath}`,
      );
    }
    return { packetPath, generated: false };
  }

  // The per-lens stance map units carry `unitKind: "issue_artifact"` but are not
  // standard issue artifacts; intercept them before the issue-artifact path.
  if (unit.unitId.startsWith("issue-stance:")) {
    return reconstructStancePacket(sessionRoot, unit, plan);
  }

  if (unit.unitKind === "issue_artifact") {
    const artifactId = unit.unitId as ReviewIssueArtifactId;
    const inputs = await reconstructIssueArtifactPacketInputs(
      sessionRoot,
      artifactId,
      plan,
    );
    const seat = await writeIssueArtifactPromptPacket({
      artifactId,
      sessionId: plan.session_id,
      projectRoot: inputs.projectRoot,
      executionPlan: plan,
      lensOutputPaths: inputs.lensOutputPaths,
      ...(inputs.deliberationResponsePaths.length > 0
        ? { deliberationResponsePaths: inputs.deliberationResponsePaths }
        : {}),
      ...(inputs.deliberationOutputPath
        ? { deliberationOutputPath: inputs.deliberationOutputPath }
        : {}),
      problemFramingProfileRef: inputs.problemFramingProfileRef,
    });
    return { packetPath: seat.packet_path, generated: true };
  }

  if (unit.unitKind === "deliberation") {
    return reconstructDeliberationPacket(sessionRoot, unit, plan);
  }

  if (unit.unitKind === "synthesize") {
    return reconstructSynthesisPacket(unit, plan);
  }

  throw new Error(
    `ensureUnitPacket: unsupported unit kind ${unit.unitKind} for ${unit.unitId}.`,
  );
}

/**
 * Compute and record the lens-completion stage gate from durable state (4d).
 *
 * The lens stage barrier decides whether downstream (issue-artifact) work may
 * proceed. The onto-runtime (A) writes it inline from in-memory dispatch
 * outcomes; this is the shared durable-state extraction so the host (B) round
 * can write the same gate after its lens round. Both compute the gate via the
 * shared {@link computeLensCompletionBarrier}; A and B only differ in how the
 * planned / completed / failed lens id sets are derived.
 *
 * Here the sets come from the ledger: completed = trusted lens units, failed =
 * lens units recorded `failed`, planned = the plan's lens seats. The caller
 * decides halt/proceed from the returned barrier's `downstream_allowed`.
 */
export async function finalizeStageGate(
  sessionRoot: string,
  executionPlan?: ReviewExecutionPlan,
): Promise<ReviewLensCompletionBarrierArtifact> {
  const plan = executionPlan ?? (await loadExecutionPlan(sessionRoot));
  const ledger = await buildSessionLedger(sessionRoot, plan);
  const lensUnits = ledger.units.filter((entry) => entry.unitKind === "lens");
  const plannedLensIds = plan.lens_execution_seats.map((seat) => seat.lens_id);
  const completedLensIds = lensUnits
    .filter((entry) => isTrustedLedgerUnit(entry))
    .map((entry) => entry.unitId);
  const failedLensIds = lensUnits
    .filter((entry) => entry.status === "failed")
    .map((entry) => entry.unitId);

  const barrier = computeLensCompletionBarrier({
    sessionId: plan.session_id,
    createdAt: isoNow(),
    observedDispatchWidth: plan.max_concurrent_lenses ?? plannedLensIds.length,
    minimumParticipatingLenses: resolveRequiredParticipatingLensCount(plan),
    plannedLensIds,
    completedLensIds,
    failedLensIds,
  });

  const barrierPath =
    plan.lens_completion_barrier_path ??
    path.join(sessionRoot, "lens-completion-barrier.yaml");
  await writeYamlDocument(barrierPath, barrier);
  return barrier;
}

/** A frontier unit projected for the host to execute next. */
export interface ReviewRoundUnit {
  unit_id: string;
  unit_kind: string;
  lens_id?: string;
  packet_path: string | null;
  output_path: string | null;
}

/**
 * Outcome of a host round/advance (4e):
 * - `in_progress`: `ready_units` are ready for the host to execute now.
 * - `ready_to_assemble`: the frontier is empty and terminal; the caller runs
 *   `completeReviewSession` (which lives in the cli layer, so the core-api
 *   wrapper invokes it — see Step 6).
 * - `halted`: no ready units but downstream work remains (an upstream is not
 *   trusted, or the lens gate is unsatisfied).
 */
export type ReviewRoundResult =
  | { status: "in_progress"; ready_units: ReviewRoundUnit[] }
  | { status: "ready_to_assemble" }
  | { status: "halted"; reason: string };

function projectRoundUnit(unit: ReviewContinuationUnit): ReviewRoundUnit {
  return {
    unit_id: unit.unitId,
    unit_kind: unit.unitKind,
    ...(unit.lensId != null ? { lens_id: unit.lensId } : {}),
    packet_path: unit.packetPath,
    output_path: unit.outputPath,
  };
}

/** Whether a runtime reduce finished (seat written) or only advanced a stage. */
interface RuntimeReduceOutcome {
  completed: boolean;
}

/**
 * Run the `synthesize` runtime reduce. Two stages, idempotent across the
 * fixed-point: (1) if `synthesis-work-items.yaml` is absent, build it from the
 * trusted upstream artifacts (this surfaces the per-issue `synthesis:<issue>` map
 * units for the host to run, so it does NOT complete the unit); (2) once the work
 * items exist (and all map responses are present), reduce them into the synthesis
 * ledger + markdown projection. A zero-issue plan collapses straight to (2).
 */
async function runSynthesizeReduce(
  plan: ReviewExecutionPlan,
  projectRoot: string,
): Promise<RuntimeReduceOutcome> {
  const workItemsPath = synthesisWorkItemsPath(plan.session_root);
  if (!(await fileExists(workItemsPath))) {
    const [
      findingLedger,
      relationGraph,
      issueLedger,
      issueStanceMatrix,
      deliberationPlan,
      problemFraming,
    ] = await Promise.all([
      readYamlDocument<Record<string, unknown>>(plan.finding_ledger_path),
      readYamlDocument<Record<string, unknown>>(plan.finding_relation_graph_path),
      readYamlDocument<Record<string, unknown>>(plan.issue_ledger_path),
      readYamlDocument<Record<string, unknown>>(plan.issue_stance_matrix_path),
      readYamlDocument<Record<string, unknown>>(plan.deliberation_plan_path),
      readYamlDocument<Record<string, unknown>>(plan.problem_framing_path),
    ]);
    const deliberationResolution = validateDeliberationResolutionObject({
      parsed: await readYamlDocument<Record<string, unknown>>(
        deliberationResolutionPath(plan.session_root),
      ),
      sessionId: plan.session_id,
      issueLedger,
      deliberationPlan,
    });
    await writeReviewSynthesisWorkItems({
      projectRoot,
      executionPlan: plan,
      findingLedger,
      relationGraph,
      issueLedger,
      issueStanceMatrix,
      deliberationPlan,
      deliberationResolution,
      problemFraming,
    });
    // Stage 1 only surfaces the map units; the reduce is not yet complete unless
    // there are no work items (handled by the next fixed-point iteration).
    return { completed: false };
  }

  const workItems =
    await readYamlDocument<ReviewSynthesisWorkItemsArtifact>(workItemsPath);
  const responses: IssueSynthesisResponseArtifact[] = await Promise.all(
    workItems.work_items.map((workItem) =>
      validateIssueSynthesisResponseOnDisk({
        responsePath: workItem.response_path,
        sessionId: plan.session_id,
        workItem,
        sourceWorkItemsRef: `synthesis-work-items.yaml#${workItem.work_item_id}`,
      }),
    ),
  );
  const ledger = await writeReviewSynthesisLedger({
    projectRoot,
    executionPlan: plan,
    workItems,
    responses,
  });
  const plannedLensIds = plan.lens_execution_seats.map((seat) => seat.lens_id);
  await writeSynthesisMarkdownFromLedger({
    ledger,
    outputPath: plan.synthesis_output_path,
    expectedLensIds: plannedLensIds,
    receivedLensIds: plannedLensIds,
  });
  return { completed: true };
}

/**
 * Run one runtime-owned reduce unit inline (onto authority; never host-visible).
 * The reduce writes its own output seat; the caller records the unit's result via
 * the shared seat gate once the reduce reports it completed.
 */
async function runRuntimeOwnedUnit(
  sessionRoot: string,
  unit: ReviewContinuationUnit,
  plan: ReviewExecutionPlan,
): Promise<RuntimeReduceOutcome> {
  const projectRoot = await loadProjectRoot(plan);

  if (unit.unitId === "issue-stance-matrix") {
    const ledger = await buildSessionLedger(sessionRoot, plan);
    const responsePathsByLensId = new Map<string, string>();
    const participatingLensIds: string[] = [];
    for (const entry of ledger.units) {
      if (!entry.unitId.startsWith("issue-stance:") || !isTrustedLedgerUnit(entry)) {
        continue;
      }
      const lensId = entry.unitId.slice("issue-stance:".length);
      const responsePath = entry.outputRefs[0];
      if (!responsePath) continue;
      participatingLensIds.push(lensId);
      responsePathsByLensId.set(lensId, responsePath);
    }
    await writeIssueStanceMatrixFromResponses({
      executionPlan: plan,
      projectRoot,
      responsePathsByLensId,
      participatingLensIds,
      outputPath: plan.issue_stance_matrix_path,
    });
    return { completed: true };
  }

  if (unit.unitId === "synthesize") {
    return runSynthesizeReduce(plan, projectRoot);
  }

  throw new Error(
    `runRuntimeOwnedUnit: no runtime reducer for ${unit.unitId} (${unit.unitKind}).`,
  );
}

/** Build a `failed` result for a runtime unit whose reduce threw. */
function failedRuntimeResult(
  unit: ReviewContinuationUnit,
  error: unknown,
  recordedAt: string,
): ReviewUnitExecutionResult {
  return {
    unit_id: unit.unitId,
    unit_kind: unit.unitKind as ReviewUnitExecutionResult["unit_kind"],
    packet_path: unit.packetPath ?? "",
    output_path: unit.outputPath ?? "",
    status: "failed",
    started_at: recordedAt,
    completed_at: recordedAt,
    duration_ms: 0,
    timestamp_provenance: "batch_window",
    failure_message: error instanceof Error ? error.message : String(error),
    failure_kind: "output_contract",
  };
}

/**
 * Drain runtime-owned reduce units from the frontier (4e fixed-point). After the
 * host's seats are merged, re-derive the frontier and, while it contains only
 * `runtime` units, run each reduce inline, record its result, and re-derive.
 * Stops when a `host_llm` unit appears (the host must act next), the frontier is
 * empty/terminal, or the max-iteration backstop trips. A reduce throw merges a
 * `failed` result and halts cleanly.
 */
async function runRuntimeFixedPoint(
  sessionRoot: string,
  plan: ReviewExecutionPlan,
): Promise<void> {
  const MAX_ITERATIONS = 64;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const frontier = await computeReviewFrontier(sessionRoot);
    if (!frontier.eligible) return;
    const runnable = frontier.frontierUnits.filter(
      (unit) => unit.dispatchDecision === "run",
    );
    if (runnable.some((unit) => unit.owner === "host_llm")) return;
    const runtimeUnits = runnable.filter((unit) => unit.owner === "runtime");
    if (runtimeUnits.length === 0) return;

    for (const unit of runtimeUnits) {
      try {
        const outcome = await runRuntimeOwnedUnit(sessionRoot, unit, plan);
        if (outcome.completed) {
          const result = await validateUnitSeatToResult({
            sessionRoot,
            unit,
            executionPlan: plan,
          });
          await mergeUnitResultIntoExecutionResult({ sessionRoot, result });
        }
      } catch (error) {
        await mergeUnitResultIntoExecutionResult({
          sessionRoot,
          result: failedRuntimeResult(unit, error, isoNow()),
        });
        return;
      }
    }
  }
}

/**
 * Ensure the runtime-owned `deliberation.md` human projection exists once the
 * controlled-deliberation resolution seat is present. The onto path (A) writes it
 * inline from the resolution; the host path produces only the machine resolution
 * (`deliberation-resolution.yaml`), so onto derives the projection here. Idempotent
 * and fail-soft: a missing resolution is a no-op.
 */
async function ensureDeliberationMarkdownProjection(
  sessionRoot: string,
  plan: ReviewExecutionPlan,
): Promise<void> {
  const resolutionPath = deliberationResolutionPath(plan.session_root);
  if (!(await fileExists(resolutionPath))) return;
  if (await fileExists(plan.deliberation_output_path)) return;
  const [issueLedger, deliberationPlan] = await Promise.all([
    readYamlDocument<Record<string, unknown>>(plan.issue_ledger_path),
    readYamlDocument<Record<string, unknown>>(plan.deliberation_plan_path),
  ]);
  const resolution = validateDeliberationResolutionObject({
    parsed: await readYamlDocument<Record<string, unknown>>(resolutionPath),
    sessionId: plan.session_id,
    issueLedger,
    deliberationPlan,
  });
  await fs.writeFile(
    plan.deliberation_output_path,
    `${renderDeliberationMarkdownProjection({ resolution }).trimEnd()}\n`,
    "utf8",
  );
}

/**
 * Once every ledger unit is trusted, promote the host (B) execution-result from
 * its `running` scaffold to `completed`, so assembly does not treat the run as
 * degraded/halted. Narrows the participating lenses to the ledger-trusted set
 * (mid-run merges record every lens whose seat validated) and stamps the
 * completion fields the scaffold deliberately left null. No-op until the pipeline
 * is terminal or if already completed.
 */
async function finalizeHostExecutionResultIfComplete(
  sessionRoot: string,
  plan: ReviewExecutionPlan,
): Promise<void> {
  const ledger = await buildSessionLedger(sessionRoot, plan);
  // Convergence = no owed work: trusted OR terminally resolved (demoted).
  if (!ledger.units.every((unit) => isResolvedLedgerUnit(unit))) return;
  const resultPath = executionResultPath(sessionRoot);
  const existing =
    await readOptionalYamlArtifact<ReviewExecutionResultArtifact>(resultPath);
  if (!existing || existing.execution_status === "completed") return;
  const trustedLensIds = ledger.units
    .filter((unit) => unit.unitKind === "lens" && isTrustedLedgerUnit(unit))
    .map((unit) => unit.unitId);
  const completedAt = isoNow();
  const startedAtMs = Date.parse(existing.execution_started_at);
  await writeYamlDocument(resultPath, {
    ...existing,
    execution_status: "completed",
    execution_completed_at: completedAt,
    // Real wall-time across the host rounds. The scaffold no longer pre-fills a
    // duration, so a missed stamp here fails the terminal artifact validator
    // instead of silently recording every host run as 0 ms.
    total_duration_ms: Number.isFinite(startedAtMs)
      ? Math.max(0, Date.parse(completedAt) - startedAtMs)
      : 0,
    participating_lens_ids: trustedLensIds,
    executed_lens_count: trustedLensIds.length,
    synthesis_executed: true,
    deliberation_status: "performed",
  });

  // The synthesis provenance the completed-record terminal trust check reads. The
  // onto path (A) emits a full review-run-manifest; the host (B) writes just the
  // synthesis provenance, whose hashes assembly recomputes from the same files.
  const synthesisLedger = synthesisLedgerPath(plan.session_root);
  await writeYamlDocument(path.join(sessionRoot, "review-run-manifest.yaml"), {
    schema_version: "1",
    session_id: plan.session_id,
    synthesis_provenance: {
      synthesis_executed: true,
      synthesis_ledger_path: synthesisLedger,
      synthesis_ledger_sha256: await fileSha256IfPresent(synthesisLedger),
      synthesis_output_path: plan.synthesis_output_path,
      synthesis_output_sha256: await fileSha256IfPresent(plan.synthesis_output_path),
    },
  });
}

/**
 * Compute the current round result: the frontier ready units (with their prompt
 * packets ensured) or a terminal/halted signal. Shared by reviewRound and the
 * tail of reviewAdvance.
 *
 * Only `host_llm` units are returned as `ready_units` (and have their packets
 * ensured); `runtime` reduce units are never surfaced to the host — they are
 * drained by {@link runRuntimeFixedPoint} inside reviewAdvance.
 */
async function computeRoundResult(
  sessionRoot: string,
  plan: ReviewExecutionPlan,
): Promise<ReviewRoundResult> {
  const frontier = await computeReviewFrontier(sessionRoot);
  // Terminal: every ledger unit owes no work (trusted or terminally
  // resolved), so there is nothing left to run and the caller assembles.
  // (A continuation plan with no untrusted frontier is `eligible: false`,
  // so this must precede the ineligibility check.)
  if (frontier.unitLedger.units.every((unit) => isResolvedLedgerUnit(unit))) {
    return { status: "ready_to_assemble" };
  }
  if (!frontier.eligible) {
    return {
      status: "halted",
      reason: frontier.ineligibleReason ?? "review continuation is not eligible",
    };
  }
  const hostUnits = frontier.frontierUnits.filter(
    (unit) => unit.owner === "host_llm",
  );
  const runtimeUnits = frontier.frontierUnits.filter(
    (unit) => unit.owner === "runtime",
  );
  if (hostUnits.length === 0) {
    if (runtimeUnits.length > 0 || frontier.downstreamUnits.length > 0) {
      return {
        status: "halted",
        reason:
          "no host-ready units but work remains (an upstream is not trusted, the stage gate is unsatisfied, or a runtime reduce did not drain)",
      };
    }
    return { status: "ready_to_assemble" };
  }

  const readyUnits: ReviewRoundUnit[] = [];
  for (const unit of hostUnits) {
    await ensureUnitPacket(sessionRoot, unit, plan);
    readyUnits.push(projectRoundUnit(unit));
  }
  return { status: "in_progress", ready_units: readyUnits };
}

/**
 * Host round (B): return the units ready to execute now, with their prompt
 * packets ensured on disk (4e). onto does NOT execute them — the host does, then
 * calls {@link reviewAdvance}. Fail-closed to host-orchestrated sessions.
 */
export async function reviewRound(
  sessionRoot: string,
  executionPlan?: ReviewExecutionPlan,
): Promise<ReviewRoundResult> {
  const plan = executionPlan ?? (await loadExecutionPlan(sessionRoot));
  await assertHostOrchestration(plan);
  return computeRoundResult(sessionRoot, plan);
}

/**
 * Initial execution-result.yaml scaffold for a host session (B), seeded on the
 * first advance before any unit result exists. It carries only the
 * execution-level metadata derived from the plan; per-unit results are merged in
 * by {@link mergeUnitResultIntoExecutionResult}, which keeps the lens summary
 * counters in step with them.
 *
 * The artifact is upserted mid-run, so every field here must be readable as
 * "not finished": `running` status, and no completion stamp or duration.
 *
 * `executionStartedAtMs` is the run's real start. The onto path (A) seeds this
 * scaffold after the lens phase and must pass it, or the artifact would date the
 * run from the seed and understate elapsed time by the whole lens phase — the
 * progress projection reads this field as the session start. The host path (B)
 * seeds on its first advance, where "now" is the start.
 */
export function buildInitialExecutionResultScaffold(
  plan: ReviewExecutionPlan,
  executionStartedAtMs?: number,
): ReviewExecutionResultArtifact {
  const plannedLensIds = plan.lens_execution_seats.map((seat) => seat.lens_id);
  return {
    session_id: plan.session_id,
    session_root: plan.session_root,
    execution_realization: plan.execution_realization,
    host_runtime: plan.host_runtime,
    artifact_generation_realization: plan.artifact_generation_realization,
    semantic_quality_evidence: semanticQualityEvidenceForArtifactGeneration(
      plan.artifact_generation_realization,
    ),
    review_mode: plan.review_mode,
    execution_status: "running",
    execution_started_at:
      executionStartedAtMs === undefined
        ? isoNow()
        : isoFromTimestamp(executionStartedAtMs),
    execution_completed_at: null,
    total_duration_ms: null,
    max_concurrent_lenses: plan.max_concurrent_lenses ?? plannedLensIds.length,
    // Resolved retry policy stamped on the plan at prepare; fall back to the
    // default only for plans serialized before the stamp existed.
    retry_policy: plan.retry_policy ?? defaultReviewRetrySettings(),
    planned_lens_ids: plannedLensIds,
    participating_lens_ids: [],
    degraded_lens_ids: [],
    excluded_lens_ids: [],
    executed_lens_count: 0,
    synthesis_executed: false,
    error_log_path: plan.error_log_path,
    lens_execution_results: [],
  };
}

/**
 * Host advance (B): validate the seats the host just wrote for `executed`
 * units, merge them into the durable result, finalize the lens stage gate, then
 * return the next round (4e). onto owns ledger/result/gate truth; the host owns
 * unit execution. Fail-closed to host-orchestrated sessions.
 *
 * On the first advance (no execution-result yet) the result is self-seeded from
 * {@link buildInitialExecutionResultScaffold}; `opts.base` overrides that seed.
 */
export async function reviewAdvance(
  sessionRoot: string,
  executed: string[],
  opts?: { base?: ReviewExecutionResultArtifact; executionPlan?: ReviewExecutionPlan },
): Promise<ReviewRoundResult> {
  const plan = opts?.executionPlan ?? (await loadExecutionPlan(sessionRoot));
  await assertHostOrchestration(plan);

  const frontier = await computeReviewFrontier(sessionRoot);
  const frontierById = new Map(
    frontier.frontierUnits.map((unit) => [unit.unitId, unit]),
  );

  let base: ReviewExecutionResultArtifact | undefined =
    opts?.base ?? buildInitialExecutionResultScaffold(plan);
  for (const unitId of executed) {
    const unit = frontierById.get(unitId);
    if (!unit) {
      throw new Error(
        `reviewAdvance: ${unitId} is not in the current frontier; only frontier units can be advanced.`,
      );
    }
    const result = await validateUnitSeatToResult({
      sessionRoot,
      unit,
      executionPlan: plan,
    });
    await mergeUnitResultIntoExecutionResult({
      sessionRoot,
      result,
      ...(base ? { base } : {}),
    });
    base = undefined;
  }

  await finalizeStageGate(sessionRoot, plan);
  await ensureDeliberationMarkdownProjection(sessionRoot, plan);
  await runRuntimeFixedPoint(sessionRoot, plan);
  await finalizeHostExecutionResultIfComplete(sessionRoot, plan);
  return computeRoundResult(sessionRoot, plan);
}
