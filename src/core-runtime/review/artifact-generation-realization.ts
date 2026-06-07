import type {
  ReviewArtifactGenerationRealization,
  ReviewSemanticQualityEvidence,
} from "./artifact-types.js";

export function semanticQualityEvidenceForArtifactGeneration(
  realization: ReviewArtifactGenerationRealization,
): ReviewSemanticQualityEvidence {
  switch (realization) {
    case "semantic_mock":
      return {
        status: "not_applicable",
        applicability: "real_semantic_path_only",
        reason:
          "semantic mock verifies wiring and artifact contracts; it does not evaluate product semantic quality",
      };
    case "fixture":
      return {
        status: "not_applicable",
        applicability: "real_semantic_path_only",
        reason:
          "fixture realization verifies deterministic contracts; it does not evaluate product semantic quality",
      };
    case "boundary_stub":
      return {
        status: "not_applicable",
        applicability: "real_semantic_path_only",
        reason:
          "boundary stub verifies non-semantic execution surfaces; provider semantic quality remains unverified",
      };
    case "live":
      return {
        status: "not_evaluated",
        applicability: "real_semantic_path_only",
        reason:
          "live semantic path output requires a separate semantic quality gate before quality is claimed",
      };
  }
}

export function isReviewArtifactGenerationRealization(
  value: unknown,
): value is ReviewArtifactGenerationRealization {
  return (
    value === "live" ||
    value === "semantic_mock" ||
    value === "boundary_stub" ||
    value === "fixture"
  );
}

