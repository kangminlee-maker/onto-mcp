import type {
  ReviewExecutionPlan,
  ReviewLensCompletionBarrierArtifact,
} from "./artifact-types.js";

export interface LensCompletionBarrierInputs {
  sessionId: string;
  createdAt: string;
  observedDispatchWidth: number;
  minimumParticipatingLenses: number;
  plannedLensIds: string[];
  completedLensIds: string[];
  failedLensIds: string[];
}

/**
 * Pure lens-completion barrier computation shared by the onto-runtime (A) and
 * host (B) paths. Given the planned / completed / failed lens id sets, derive
 * the missing & degraded sets, the gate status, and whether downstream
 * (issue-artifact) work is allowed. I/O (file write, progress log) and the
 * input derivation stay with each caller; only the gate semantics live here so
 * A and B cannot diverge.
 */
export function computeLensCompletionBarrier(
  args: LensCompletionBarrierInputs,
): ReviewLensCompletionBarrierArtifact {
  const missingLensIds = args.plannedLensIds.filter(
    (lensId) =>
      !args.completedLensIds.includes(lensId) &&
      !args.failedLensIds.includes(lensId),
  );
  const degradedLensIds = args.plannedLensIds.filter(
    (lensId) => !args.completedLensIds.includes(lensId),
  );
  const downstreamAllowed =
    args.completedLensIds.length >= args.minimumParticipatingLenses;
  const status: ReviewLensCompletionBarrierArtifact["status"] =
    downstreamAllowed && degradedLensIds.length === 0
      ? "passed"
      : downstreamAllowed
        ? "passed_with_degradation"
        : "failed";
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: args.createdAt,
    observed_dispatch_width: args.observedDispatchWidth,
    minimum_participating_lenses: args.minimumParticipatingLenses,
    planned_lens_ids: args.plannedLensIds,
    completed_lens_ids: args.completedLensIds,
    failed_lens_ids: args.failedLensIds,
    missing_lens_ids: missingLensIds,
    degraded_lens_ids: degradedLensIds,
    status,
    downstream_allowed: downstreamAllowed,
    downstream_reason: downstreamAllowed
      ? "selected lens completion threshold satisfied"
      : "selected lens completion threshold not satisfied",
  };
}

export function resolveRequiredParticipatingLensCount(
  executionPlan: Pick<
    ReviewExecutionPlan,
    "lens_prompt_packet_seats" | "minimum_participating_lenses"
  >,
): number {
  const selectedLensCount = executionPlan.lens_prompt_packet_seats.length;
  if (selectedLensCount < 1) {
    throw new Error("Review execution plan must select at least one lens.");
  }
  const configuredMinimum = executionPlan.minimum_participating_lenses;
  if (configuredMinimum === undefined) {
    return selectedLensCount;
  }
  if (!Number.isInteger(configuredMinimum) || configuredMinimum < 1) {
    throw new Error(
      `minimum_participating_lenses must be a positive integer, got ${String(
        configuredMinimum,
      )}.`,
    );
  }
  if (configuredMinimum !== selectedLensCount) {
    throw new Error(
      `minimum_participating_lenses must equal selected lens count (${selectedLensCount}), got ${configuredMinimum}.`,
    );
  }
  return configuredMinimum;
}
