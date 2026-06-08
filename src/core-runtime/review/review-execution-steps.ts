import path from "node:path";
import { fileExists, readYamlDocument } from "./review-artifact-utils.js";
import {
  buildReviewPipelineExecutionLedger,
  type ReviewRunManifestForLedger,
} from "./pipeline-execution-ledger.js";
import {
  buildReviewContinuationPlan,
  type ReviewContinuationPlan,
} from "./continuation-plan.js";
import type {
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewLensCompletionBarrierArtifact,
} from "./artifact-types.js";

/**
 * Shared durable step engine for review execution (Phase 2, Stage 1).
 *
 * Progression is driven by on-disk artifacts -> PipelineExecutionLedger ->
 * continuation-plan frontier, NOT by in-memory control flow. The onto-runtime
 * path (A) and the host-orchestration path (B) share these steps; the only
 * difference between A and B is who *executes* a unit (onto spawns vs the host
 * spawns). This module is the first strangler extraction (4a): the read-only
 * frontier computation. Subsequent extractions (validate->result->merge,
 * packet generation, stage gate, assemble) land here too.
 */

async function readOptionalYamlArtifact<T>(filePath: string): Promise<T | null> {
  if (!(await fileExists(filePath))) return null;
  return readYamlDocument<T>(filePath);
}

/**
 * Build the current review frontier for a prepared session from durable state.
 *
 * Reads execution-plan (+ optional execution-result, review-run-manifest,
 * lens-completion-barrier), reconstructs the PipelineExecutionLedger, and
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
  const executionPlanPath = path.join(sessionRoot, "execution-plan.yaml");
  const executionPlan =
    await readOptionalYamlArtifact<ReviewExecutionPlan>(executionPlanPath);
  if (!executionPlan) {
    throw new Error(
      `computeReviewFrontier requires execution-plan.yaml: ${sessionRoot}`,
    );
  }

  const executionResultPath = path.join(sessionRoot, "execution-result.yaml");
  const reviewRunManifestPath = path.join(sessionRoot, "review-run-manifest.yaml");
  const lensCompletionBarrierPath = path.join(
    sessionRoot,
    "lens-completion-barrier.yaml",
  );

  const executionResult =
    await readOptionalYamlArtifact<ReviewExecutionResultArtifact>(
      executionResultPath,
    );
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
    execution_plan: executionPlanPath,
    ...(executionResult ? { execution_result: executionResultPath } : {}),
    ...(reviewRunManifest ? { review_run_manifest: reviewRunManifestPath } : {}),
    ...(lensCompletionBarrier
      ? { lens_completion_barrier: lensCompletionBarrierPath }
      : {}),
    ...(executionPlan.finding_ledger_path
      ? { finding_ledger: executionPlan.finding_ledger_path }
      : {}),
    ...(executionPlan.issue_ledger_path
      ? { issue_ledger: executionPlan.issue_ledger_path }
      : {}),
    ...(executionPlan.review_context_manifest_path
      ? { review_context_manifest: executionPlan.review_context_manifest_path }
      : {}),
  };

  const ledger = await buildReviewPipelineExecutionLedger({
      sessionRoot,
      executionPlan,
      artifactRefs,
      executionResult,
      reviewRunManifest,
      lensCompletionBarrier,
    });

  return buildReviewContinuationPlan({
    ledger,
    ...(targetUnits !== undefined ? { targetUnits } : {}),
  });
}
