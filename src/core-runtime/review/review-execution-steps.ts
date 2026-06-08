import fs from "node:fs/promises";
import path from "node:path";
import {
  fileExists,
  isoNow,
  readYamlDocument,
  writeYamlDocument,
} from "./review-artifact-utils.js";
import {
  buildReviewPipelineExecutionLedger,
  type ReviewRunManifestForLedger,
} from "./pipeline-execution-ledger.js";
import {
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
  resolveProblemFramingProfileRef,
  writeIssueArtifactPromptPacket,
} from "./issue-artifact-runtime.js";
import type {
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewIssueArtifactId,
  ReviewLensCompletionBarrierArtifact,
  ReviewSessionMetadata,
  ReviewUnitExecutionResult,
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
 * packet from durable state). Subsequent extractions (stage gate, assemble) land
 * here too.
 */

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
        return { ...artifact, synthesize_execution_result: result };
      default:
        return artifact;
    }
  })();

  await writeYamlDocument(resultPath, merged);
  return merged;
}

/** Repo project root, read from the session metadata the plan points at. */
async function loadProjectRoot(plan: ReviewExecutionPlan): Promise<string> {
  const metadata = await readOptionalYamlArtifact<ReviewSessionMetadata>(
    plan.session_metadata_path,
  );
  if (!metadata?.project_root) {
    throw new Error(
      `review-execution-steps requires session-metadata project_root: ${plan.session_metadata_path}`,
    );
  }
  return metadata.project_root;
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

  const deliberationOutputPath = (await fileExists(plan.deliberation_output_path))
    ? plan.deliberation_output_path
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
 * - `issue_artifact`: generate via {@link writeIssueArtifactPromptPacket} with
 *   inputs rebuilt by {@link reconstructIssueArtifactPacketInputs}.
 * - `deliberation` / `synthesize`: NOT generated here. Their packets are
 *   produced dynamically by the deliberation / synthesis orchestration (which
 *   is interleaved with execution in A); the host round assembles those in
 *   Step 4e. Fail closed rather than emit a divergent packet.
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

  throw new Error(
    `ensureUnitPacket does not generate ${unit.unitKind} packets; the host round assembles deliberation/synthesize packets (Stage 1 Step 4e).`,
  );
}
