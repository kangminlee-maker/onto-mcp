import type { ReviewExecutionPlan } from "./artifact-types.js";

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
