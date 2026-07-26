import { describe, expect, it } from "vitest";
import { competencyQuestionsRepairDirectives } from "./post-seed-validation.js";
import type {
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructPostSeedValidationViolation,
} from "./artifact-types.js";

function validationWith(
  violations: ReconstructPostSeedValidationViolation[],
): ReconstructCompetencyQuestionsValidationArtifact {
  return {
    validation_status: violations.length === 0 ? "valid" : "invalid",
    violations,
  } as unknown as ReconstructCompetencyQuestionsValidationArtifact;
}

function violation(
  code: string,
  message: string,
  subjectId: string,
): ReconstructPostSeedValidationViolation {
  return {
    code,
    message,
    subject_id: subjectId,
  } as unknown as ReconstructPostSeedValidationViolation;
}

describe("competencyQuestionsRepairDirectives", () => {
  it("surfaces missing-coverage directives first, then other violations, verbatim", () => {
    const directives = competencyQuestionsRepairDirectives(
      validationWith([
        violation("schema_shape_invalid", "question cq-3 has an invalid shape", "cq-3"),
        violation(
          "missing_required_coverage",
          "modeling concern has no competency question coverage: ontology_representation_formalism",
          "ontology_representation_formalism",
        ),
        violation(
          "missing_required_coverage",
          "coverage axis has no competency question coverage: dynamic_surface",
          "dynamic_surface",
        ),
      ]),
    );
    expect(directives).toEqual([
      "modeling concern has no competency question coverage: ontology_representation_formalism",
      "coverage axis has no competency question coverage: dynamic_surface",
      "question cq-3 has an invalid shape",
    ]);
  });

  it("dedupes repeated directive messages", () => {
    const message =
      "modeling concern has no competency question coverage: ontology_representation_formalism";
    const directives = competencyQuestionsRepairDirectives(
      validationWith([
        violation("missing_required_coverage", message, "a"),
        violation("missing_required_coverage", message, "a"),
      ]),
    );
    expect(directives).toEqual([message]);
  });

  it("returns a non-empty actionable fallback when there are no violations", () => {
    const directives = competencyQuestionsRepairDirectives(validationWith([]));
    expect(directives).toHaveLength(1);
    expect(directives[0]).toMatch(/every required coverage axis, modeling concern/i);
  });
});
