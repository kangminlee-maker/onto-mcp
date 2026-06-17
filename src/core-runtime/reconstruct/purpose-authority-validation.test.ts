import { describe, expect, it } from "vitest";
import type {
  ReconstructEvidenceRef,
  ReconstructPurposeConfirmationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
} from "./artifact-types.js";
import {
  validatePurposeConfirmation,
  validateSourcePurposeCandidates,
} from "./purpose-authority-validation.js";

const now = "2026-05-29T00:00:00.000Z";

const evidenceRef: ReconstructEvidenceRef = {
  observation_id: "obs-code-1",
  target_material_kind: "code",
  source_ref: "src/feature.ts",
  location: "src/feature.ts",
};

function sourceObservations(): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    observations: [
      {
        observation_id: evidenceRef.observation_id,
        target_material_kind: "code",
        adapter_id: "code-structure-observer",
        source_ref: evidenceRef.source_ref,
        location: evidenceRef.location,
        summary: "Observed exported feature function.",
        structural_data: { export_count: 1 },
      },
    ],
    skipped_refs: [],
    validation_results: ["valid"],
  };
}

function sourcePurposeCandidates(
  patch: Partial<ReconstructSourcePurposeCandidatesArtifact["purpose_candidates"][number]> = {},
): ReconstructSourcePurposeCandidatesArtifact {
  const candidate = {
    purpose_candidate_id: "purpose-feature-explanation",
    statement: "Explain the feature module as an operational ontology seed.",
    rank: "primary" as const,
    purpose_source_status: "explicit_source_declared" as const,
    evidence_kind_refs: ["P1", "P2"] as const,
    supporting_evidence_refs: [evidenceRef],
    contradicting_source_refs: [],
    adequacy_frame: {
      frame_id: "frame-feature-explanation",
      frame_kind: "operational_ontology_seed",
      frame_status: "source_declared" as const,
      adequacy_claim:
        "The seed is adequate when it preserves object, action, and source evidence.",
      material_kind_requirements: {
        target_material_kind: "code" as const,
        required_facets: ["object", "action", "evidence"],
        optional_facets: ["actor"],
        rationale: "Code source needs object and action grounding for seed handoff.",
      },
      required_elements: [
        {
          element_id: "purpose-element-feature-object",
          element_kind: "object",
          material_facet_kind: "object",
          description: "Represent the feature module object.",
          actionability_surface_refs: ["static_surface"],
          maturity_dimension_refs: ["structure", "evidence"],
          member_scope_refs: [],
          member_target_material_kind: null,
          member_source_refs: [],
          cross_material_ref_refs: [],
          supporting_evidence_refs: [evidenceRef],
          expected_seed_ref_families: ["semantic_layer.object_types"],
          closure_expectation: "model_or_limit" as const,
        },
        {
          element_id: "purpose-element-feature-action",
          element_kind: "action",
          material_facet_kind: "action",
          description: "Represent the feature explanation action.",
          actionability_surface_refs: ["kinetic_surface"],
          maturity_dimension_refs: ["intent", "relation"],
          member_scope_refs: [],
          member_target_material_kind: null,
          member_source_refs: [],
          cross_material_ref_refs: [],
          supporting_evidence_refs: [evidenceRef],
          expected_seed_ref_families: ["kinetic_layer.action_types"],
          closure_expectation: "model_or_limit" as const,
        },
        {
          element_id: "purpose-element-feature-boundary",
          element_kind: "limitation",
          material_facet_kind: "limitation",
          description: "Represent source boundary limits for maturation.",
          actionability_surface_refs: ["dynamic_surface"],
          maturity_dimension_refs: ["context", "external"],
          member_scope_refs: [],
          member_target_material_kind: null,
          member_source_refs: [],
          cross_material_ref_refs: [],
          supporting_evidence_refs: [evidenceRef],
          expected_seed_ref_families: ["handoff_limitations"],
          closure_expectation: "model_or_limit" as const,
        },
      ],
    },
    ranking_rationale: "The fixture source directly names the feature module.",
    limitation_refs: [],
    ...patch,
  };
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    target_material_kind: "code",
    source_observations_ref: "source-observations.yaml",
    selected_source_profile_refs: [],
    purpose_candidates: [candidate],
    selection: {
      primary_purpose_candidate_id: candidate.purpose_candidate_id,
      selection_basis: "Single source-backed purpose candidate.",
      confirmation_policy_hint: "Source-declared purpose does not require confirmation.",
      unresolved_reason: null,
    },
    directive_author: {
      owner: "host_llm",
      author_id: "test-author",
    },
  };
}

function sourcePurposeValidation(
  artifact: ReconstructSourcePurposeCandidatesArtifact,
) {
  return validateSourcePurposeCandidates({
    sourcePurposeCandidates: artifact,
    sourcePurposeCandidatesRef: "source-purpose-candidates.yaml",
    sourceObservations: sourceObservations(),
    sourceObservationsRef: "source-observations.yaml",
  });
}

function purposeConfirmation(
  status: ReconstructPurposeConfirmationArtifact["confirmation_status"],
  statement: string | null,
): ReconstructPurposeConfirmationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    source_purpose_candidates_ref: "source-purpose-candidates.yaml",
    source_purpose_candidates_validation_ref: "source-purpose-candidates-validation.yaml",
    purpose_candidate_id: "purpose-feature-explanation",
    confirmation_status: status,
    confirmed_statement: statement,
    revised_statement: null,
    confirmed_frame_element_refs: [
      "purpose-element-feature-object",
      "purpose-element-feature-action",
      "purpose-element-feature-boundary",
    ],
    rejected_frame_element_refs: [],
    user_response_summary: "Fixture confirmation.",
    source_conflict_policy: "No source conflict observed.",
    limitation_refs: [],
    confirmation_provider: {
      owner: "host_or_user",
      provider_id: "test-provider",
    },
  };
}

describe("purpose authority validation", () => {
  it("accepts one source-declared primary purpose and marks confirmation not required", () => {
    const validation = sourcePurposeValidation(sourcePurposeCandidates());

    expect(validation.validation_status).toBe("valid");
    expect(validation.selected_purpose_candidate_id)
      .toBe("purpose-feature-explanation");
    expect(validation.confirmation_required).toBe(false);
    expect(validation.violations).toEqual([]);
  });

  it("rejects a primary purpose backed only by weak contextual hints", () => {
    const validation = sourcePurposeValidation(sourcePurposeCandidates({
      evidence_kind_refs: ["P5"],
    }));

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("p5_only_primary");
  });

  it("rejects dangling source observation evidence refs", () => {
    const validation = sourcePurposeValidation(sourcePurposeCandidates({
      supporting_evidence_refs: [{
        ...evidenceRef,
        observation_id: "missing-observation",
      }],
    }));

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("unknown_observation_ref");
  });

  it("requires confirmation for inferred purpose and validates confirmed projection", () => {
    const sourceValidation = sourcePurposeValidation(sourcePurposeCandidates({
      purpose_source_status: "convergent_inferred",
      evidence_kind_refs: ["P2", "P3"],
      adequacy_frame: {
        ...sourcePurposeCandidates().purpose_candidates[0].adequacy_frame,
        frame_status: "evidence_inferred",
      },
    }));

    expect(sourceValidation.validation_status).toBe("valid");
    expect(sourceValidation.confirmation_required).toBe(true);

    const confirmationValidation = validatePurposeConfirmation({
      purposeConfirmation: purposeConfirmation(
        "confirmed",
        "Explain the feature module as an operational ontology seed.",
      ),
      purposeConfirmationRef: "purpose-confirmation.yaml",
      sourcePurposeCandidatesValidation: sourceValidation,
      sourcePurposeCandidatesValidationRef: "source-purpose-candidates-validation.yaml",
    });

    expect(confirmationValidation.validation_status).toBe("valid");
    expect(confirmationValidation.purpose_projection_status).toBe("usable");
    expect(confirmationValidation.seed_readiness_effect)
      .toBe("may_project_ready_or_limited");
  });

  it("blocks seed readiness when inferred purpose confirmation is pending", () => {
    const sourceValidation = sourcePurposeValidation(sourcePurposeCandidates({
      purpose_source_status: "convergent_inferred",
      evidence_kind_refs: ["P2", "P3"],
      adequacy_frame: {
        ...sourcePurposeCandidates().purpose_candidates[0].adequacy_frame,
        frame_status: "evidence_inferred",
      },
    }));

    const confirmationValidation = validatePurposeConfirmation({
      purposeConfirmation: purposeConfirmation("pending", null),
      purposeConfirmationRef: "purpose-confirmation.yaml",
      sourcePurposeCandidatesValidation: sourceValidation,
      sourcePurposeCandidatesValidationRef: "source-purpose-candidates-validation.yaml",
    });

    expect(confirmationValidation.validation_status).toBe("invalid");
    expect(confirmationValidation.purpose_projection_status).toBe("blocked");
    expect(confirmationValidation.seed_readiness_effect).toBe("must_project_blocked");
  });
});

// Deep clone helper so each mutation works on an isolated copy of the valid base.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("validateSourcePurposeCandidates rejection branches", () => {
  it("confirms the base fixture validates clean before mutations", () => {
    const validation = sourcePurposeValidation(sourcePurposeCandidates());

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });

  it("rejects alias field source_purpose_status (alias_field_present)", () => {
    const base = clone(sourcePurposeCandidates());
    (base as unknown as Record<string, unknown>).source_purpose_status = "explicit_source_declared";

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "alias_field_present")).toBe(true);
  });

  it("rejects session_id that does not match observations (session_id_mismatch)", () => {
    const base = clone(sourcePurposeCandidates());
    base.session_id = "session-mismatch";

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "session_id_mismatch")).toBe(true);
  });

  it("rejects candidates with no primary candidate (missing_primary_purpose)", () => {
    const base = clone(sourcePurposeCandidates());
    base.purpose_candidates[0].rank = "secondary";

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "missing_primary_purpose")).toBe(true);
  });

  it("rejects more than one primary candidate (multiple_primary_purpose)", () => {
    const base = clone(sourcePurposeCandidates());
    const second = clone(base.purpose_candidates[0]);
    second.purpose_candidate_id = "purpose-feature-explanation-2";
    second.adequacy_frame.frame_id = "frame-feature-explanation-2";
    base.purpose_candidates.push(second);

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "multiple_primary_purpose")).toBe(true);
  });

  it("rejects selection pointing at a non-primary candidate (selected_primary_mismatch)", () => {
    const base = clone(sourcePurposeCandidates());
    const secondary = clone(base.purpose_candidates[0]);
    secondary.purpose_candidate_id = "purpose-feature-secondary";
    secondary.rank = "secondary";
    secondary.adequacy_frame.frame_id = "frame-feature-secondary";
    base.purpose_candidates.push(secondary);
    base.selection.primary_purpose_candidate_id = "purpose-feature-secondary";

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "selected_primary_mismatch")).toBe(true);
  });

  it("rejects duplicate purpose_candidate_id (duplicate_id)", () => {
    const base = clone(sourcePurposeCandidates());
    const duplicate = clone(base.purpose_candidates[0]);
    duplicate.rank = "rejected";
    duplicate.adequacy_frame.frame_id = "frame-feature-duplicate";
    base.purpose_candidates.push(duplicate);

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "duplicate_id")).toBe(true);
  });

  it("rejects an empty candidate statement (missing_required_field)", () => {
    const base = clone(sourcePurposeCandidates());
    base.purpose_candidates[0].statement = "   ";

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "missing_required_field")).toBe(true);
  });

  it("rejects an out-of-range evidence kind (invalid_enum)", () => {
    const base = clone(sourcePurposeCandidates());
    base.purpose_candidates[0].evidence_kind_refs = [
      "P1",
      "P9" as unknown as ReconstructEvidenceRef["target_material_kind"],
    ] as ReconstructSourcePurposeCandidatesArtifact["purpose_candidates"][number]["evidence_kind_refs"];

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "invalid_enum")).toBe(true);
  });

  it("rejects a malformed supporting evidence ref (evidence_ref_shape_invalid)", () => {
    const base = clone(sourcePurposeCandidates());
    (base.purpose_candidates[0] as unknown as Record<string, unknown>)
      .supporting_evidence_refs = [{ observation_id: "obs-code-1" }];

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "evidence_ref_shape_invalid")).toBe(true);
  });

  it("rejects a non-rejected candidate citing no evidence (evidence_ref_missing)", () => {
    const base = clone(sourcePurposeCandidates());
    base.purpose_candidates[0].supporting_evidence_refs = [];

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "evidence_ref_missing")).toBe(true);
  });

  it("rejects inferred primary purpose with insufficient evidence kinds (insufficient_inferred_evidence)", () => {
    const base = clone(sourcePurposeCandidates());
    base.purpose_candidates[0].purpose_source_status = "convergent_inferred";
    base.purpose_candidates[0].evidence_kind_refs = ["P1"];
    base.purpose_candidates[0].adequacy_frame.frame_status = "evidence_inferred";

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "insufficient_inferred_evidence")).toBe(true);
  });

  it("rejects unresolved contradicting source refs (contradiction_unresolved)", () => {
    const base = clone(sourcePurposeCandidates());
    base.purpose_candidates[0].contradicting_source_refs = ["src/conflict.ts"];

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "contradiction_unresolved")).toBe(true);
  });

  it("rejects an adequacy frame missing required elements (required_element_missing)", () => {
    const base = clone(sourcePurposeCandidates());
    base.purpose_candidates[0].adequacy_frame.required_elements = [];

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "required_element_missing")).toBe(true);
  });

  it("allows a rejected candidate with empty required_elements (rank-aware leniency)", () => {
    const base = clone(sourcePurposeCandidates());
    const rejected = clone(base.purpose_candidates[0]);
    rejected.purpose_candidate_id = "purpose-feature-rejected";
    rejected.rank = "rejected";
    rejected.adequacy_frame.frame_id = "frame-feature-rejected";
    rejected.adequacy_frame.required_elements = [];
    base.purpose_candidates.push(rejected);

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });

  it("still rejects a rejected candidate whose required_elements is not an array (required_element_missing)", () => {
    const base = clone(sourcePurposeCandidates());
    const rejected = clone(base.purpose_candidates[0]);
    rejected.purpose_candidate_id = "purpose-feature-rejected";
    rejected.rank = "rejected";
    rejected.adequacy_frame.frame_id = "frame-feature-rejected";
    // Only an empty array is exempt for rejected; a non-array still violates the contract.
    (rejected.adequacy_frame as unknown as Record<string, unknown>).required_elements = null;
    base.purpose_candidates.push(rejected);

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "required_element_missing")).toBe(true);
  });

  it("still rejects a non-rejected candidate with empty required_elements (required_element_missing)", () => {
    const base = clone(sourcePurposeCandidates());
    const secondary = clone(base.purpose_candidates[0]);
    secondary.purpose_candidate_id = "purpose-feature-secondary";
    secondary.rank = "secondary";
    secondary.adequacy_frame.frame_id = "frame-feature-secondary";
    secondary.adequacy_frame.required_elements = [];
    base.purpose_candidates.push(secondary);

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "required_element_missing")).toBe(true);
  });

  it("still validates element format when a rejected candidate provides required_elements", () => {
    const base = clone(sourcePurposeCandidates());
    const rejected = clone(base.purpose_candidates[0]);
    rejected.purpose_candidate_id = "purpose-feature-rejected";
    rejected.rank = "rejected";
    rejected.adequacy_frame.frame_id = "frame-feature-rejected";
    // Non-empty required_elements still trigger element-format checks for rejected candidates.
    rejected.adequacy_frame.required_elements[0].element_id = "   ";
    base.purpose_candidates.push(rejected);

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "required_element_missing")).toBe(true);
  });

  it("rejects mixed target material without member lineage (mixed_lineage_missing)", () => {
    const base = clone(sourcePurposeCandidates());
    base.target_material_kind = "mixed";

    const validation = sourcePurposeValidation(base);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "mixed_lineage_missing")).toBe(true);
  });
});

describe("validatePurposeConfirmation rejection branches", () => {
  function inferredSourceValidation() {
    return sourcePurposeValidation(sourcePurposeCandidates({
      purpose_source_status: "convergent_inferred",
      evidence_kind_refs: ["P2", "P3"],
      adequacy_frame: {
        ...sourcePurposeCandidates().purpose_candidates[0].adequacy_frame,
        frame_status: "evidence_inferred",
      },
    }));
  }

  it("confirms the inferred-confirmation base validates clean before mutations", () => {
    const sourceValidation = inferredSourceValidation();
    const confirmationValidation = validatePurposeConfirmation({
      purposeConfirmation: purposeConfirmation(
        "confirmed",
        "Explain the feature module as an operational ontology seed.",
      ),
      purposeConfirmationRef: "purpose-confirmation.yaml",
      sourcePurposeCandidatesValidation: sourceValidation,
      sourcePurposeCandidatesValidationRef: "source-purpose-candidates-validation.yaml",
    });

    expect(confirmationValidation.validation_status).toBe("valid");
    expect(confirmationValidation.violations).toEqual([]);
  });

  it("rejects a confirmation whose session_id differs (session_id_mismatch)", () => {
    const sourceValidation = inferredSourceValidation();
    const confirmation = purposeConfirmation(
      "confirmed",
      "Explain the feature module as an operational ontology seed.",
    );
    confirmation.session_id = "session-mismatch";

    const confirmationValidation = validatePurposeConfirmation({
      purposeConfirmation: confirmation,
      purposeConfirmationRef: "purpose-confirmation.yaml",
      sourcePurposeCandidatesValidation: sourceValidation,
      sourcePurposeCandidatesValidationRef: "source-purpose-candidates-validation.yaml",
    });

    expect(confirmationValidation.validation_status).toBe("invalid");
    expect(confirmationValidation.violations.some((v) => v.code === "session_id_mismatch")).toBe(true);
  });

  it("rejects a confirmation pointing at a different candidate (selected_primary_mismatch)", () => {
    const sourceValidation = inferredSourceValidation();
    const confirmation = purposeConfirmation(
      "confirmed",
      "Explain the feature module as an operational ontology seed.",
    );
    confirmation.purpose_candidate_id = "purpose-other-candidate";

    const confirmationValidation = validatePurposeConfirmation({
      purposeConfirmation: confirmation,
      purposeConfirmationRef: "purpose-confirmation.yaml",
      sourcePurposeCandidatesValidation: sourceValidation,
      sourcePurposeCandidatesValidationRef: "source-purpose-candidates-validation.yaml",
    });

    expect(confirmationValidation.validation_status).toBe("invalid");
    expect(confirmationValidation.violations.some((v) => v.code === "selected_primary_mismatch")).toBe(true);
  });

  it("rejects a confirmed status without confirmed_statement (missing_required_field)", () => {
    const sourceValidation = inferredSourceValidation();

    const confirmationValidation = validatePurposeConfirmation({
      purposeConfirmation: purposeConfirmation("confirmed", null),
      purposeConfirmationRef: "purpose-confirmation.yaml",
      sourcePurposeCandidatesValidation: sourceValidation,
      sourcePurposeCandidatesValidationRef: "source-purpose-candidates-validation.yaml",
    });

    expect(confirmationValidation.validation_status).toBe("invalid");
    expect(confirmationValidation.violations.some((v) => v.code === "missing_required_field")).toBe(true);
  });

  it("rejects a confirmation against a failed source validation (conflicting_state)", () => {
    const sourceValidation = inferredSourceValidation();
    const failedSourceValidation = clone(sourceValidation);
    failedSourceValidation.validation_status = "invalid";

    const confirmationValidation = validatePurposeConfirmation({
      purposeConfirmation: purposeConfirmation(
        "confirmed",
        "Explain the feature module as an operational ontology seed.",
      ),
      purposeConfirmationRef: "purpose-confirmation.yaml",
      sourcePurposeCandidatesValidation: failedSourceValidation,
      sourcePurposeCandidatesValidationRef: "source-purpose-candidates-validation.yaml",
    });

    expect(confirmationValidation.validation_status).toBe("invalid");
    expect(confirmationValidation.violations.some((v) => v.code === "conflicting_state")).toBe(true);
  });
});
