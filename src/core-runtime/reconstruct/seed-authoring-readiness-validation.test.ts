import { describe, expect, it } from "vitest";
import type {
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructEvidenceRef,
  ReconstructMaterialAdmissionLedgerArtifact,
  ReconstructPurposeAdequacyRequiredElement,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import { buildMaterialAdmissionLedgerFromSourcePurpose } from "./material-admission-validation.js";
import {
  assertSeedAuthoringReadinessAllowsSeed,
  buildSeedAuthoringReadinessFromArtifacts,
  validateSeedAuthoringReadiness,
} from "./seed-authoring-readiness-validation.js";

const createdAt = "2026-06-04T00:00:00.000Z";
const sessionId = "seed-readiness-test";

const evidenceRef: ReconstructEvidenceRef = {
  observation_id: "obs-1",
  target_material_kind: "code",
  source_ref: "/tmp/source.ts",
  location: "/tmp/source.ts:1",
};

function requiredElement(
  patch: Partial<ReconstructPurposeAdequacyRequiredElement> = {},
): ReconstructPurposeAdequacyRequiredElement {
  return {
    element_id: "purpose-element-action",
    element_kind: "action",
    material_facet_kind: "action",
    description: "Represent the observed user action.",
    actionability_surface_refs: ["kinetic_surface"],
    maturity_dimension_refs: ["intent"],
    member_scope_refs: [],
    member_target_material_kind: null,
    member_source_refs: [evidenceRef.source_ref],
    cross_material_ref_refs: [],
    supporting_evidence_refs: [evidenceRef],
    expected_seed_ref_families: ["kinetic_layer.action_types"],
    closure_expectation: "model_or_limit",
    ...patch,
  };
}

function sourcePurposeCandidates(
  element: ReconstructPurposeAdequacyRequiredElement = requiredElement(),
): ReconstructSourcePurposeCandidatesArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: createdAt,
    target_material_kind: "code",
    source_observations_ref: "source-observations.yaml",
    selected_source_profile_refs: [],
    purpose_candidates: [
      {
        purpose_candidate_id: "purpose-primary",
        statement: "Build an actionable seed from observed code.",
        rank: "primary",
        purpose_source_status: "explicit_source_declared",
        evidence_kind_refs: ["P1", "P2"],
        supporting_evidence_refs: [evidenceRef],
        contradicting_source_refs: [],
        adequacy_frame: {
          frame_id: "frame-primary",
          frame_kind: "operational_ontology_seed",
          frame_status: "source_declared",
          adequacy_claim: "The seed must preserve actionability closure.",
          material_kind_requirements: {
            target_material_kind: "code",
            required_facets: ["action"],
            optional_facets: [],
            rationale: "fixture",
          },
          required_elements: [element],
        },
        ranking_rationale: "fixture",
        limitation_refs: [],
      },
    ],
    selection: {
      primary_purpose_candidate_id: "purpose-primary",
      selection_basis: "fixture",
      confirmation_policy_hint: "not_required",
      unresolved_reason: null,
    },
    directive_author: { owner: "mock", author_id: "test" },
  };
}

function sourcePurposeValidation(): ReconstructSourcePurposeCandidatesValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: createdAt,
    source_purpose_candidates_ref: "source-purpose-candidates.yaml",
    source_observations_ref: "source-observations.yaml",
    registry_ref: "reconstruct-contract-registry.yaml",
    validation_status: "valid",
    selected_purpose_candidate_id: "purpose-primary",
    selected_purpose_frame_id: "frame-primary",
    confirmation_required: false,
    validation_results: ["valid"],
    violations: [],
  };
}

function purposeConfirmationValidation(
  seedReadinessEffect:
    ReconstructPurposeConfirmationValidationArtifact["seed_readiness_effect"] =
      "may_project_ready_or_limited",
): ReconstructPurposeConfirmationValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: createdAt,
    purpose_confirmation_ref: "purpose-confirmation.yaml",
    source_purpose_candidates_validation_ref:
      "source-purpose-candidates-validation.yaml",
    validation_status: "valid",
    purpose_projection_status:
      seedReadinessEffect === "may_project_ready_or_limited"
        ? "usable"
        : "blocked",
    confirmed_purpose_candidate_id: "purpose-primary",
    confirmed_statement: "Build an actionable seed from observed code.",
    seed_readiness_effect: seedReadinessEffect,
    validation_results: ["valid"],
    violations: [],
  };
}

function targetMaterialProfileValidation(): ReconstructTargetMaterialProfileValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: createdAt,
    target_material_profile_ref: "target-material-profile.yaml",
    registry_ref: "reconstruct-contract-registry.yaml",
    validation_status: "valid",
    target_ref_count: 1,
    selected_source_profile_count: 1,
    validation_results: ["valid"],
    violations: [],
  };
}

function sourceScoutPackValidation(
  scopeState:
    ReconstructSourceScoutPackValidationArtifact["scout_scope"]["scope_state"] =
      "supported_single_member_code_or_document",
): ReconstructSourceScoutPackValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: createdAt,
    source_scout_pack_ref: "source-scout-pack.pre-seed.yaml",
    source_observations_ref: "source-observations.yaml",
    source_observations_sha256: null,
    source_safety_ledger_ref: "source-safety-ledger.yaml",
    source_safety_ledger_sha256: null,
    source_safety_ledger_validation_ref: "source-safety-ledger-validation.yaml",
    source_safety_ledger_validation_sha256: null,
    target_material_profile_validation_ref:
      "target-material-profile-validation.yaml",
    target_material_profile_validation_sha256: null,
    scout_scope: {
      scope_state: scopeState,
      target_material_kind: "code",
      target_ref_count: 1,
      selected_source_profile_refs: ["code-source-profile"],
      limitation_refs: [],
    },
    validation_status: "valid",
    signal_row_count: 3,
    prompt_visible_signal_count: 3,
    coverage_slot_count: 3,
    validation_results: ["valid"],
    violations: [],
  };
}

function sourceObservationDirectiveValidation(): ReconstructSourceObservationDirectiveValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: createdAt,
    directive_ref: "source-observation-directive.yaml",
    source_observations_ref: "source-observations.yaml",
    validation_status: "valid",
    selected_observation_count: 1,
    validation_results: ["valid"],
    violations: [],
  };
}

function candidateDispositionValidation(): ReconstructCandidateDispositionValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: createdAt,
    candidate_inventory_ref: "candidate-inventory.yaml",
    candidate_disposition_ref: "candidate-disposition.yaml",
    source_observations_ref: "source-observations.yaml",
    registry_ref: "reconstruct-contract-registry.yaml",
    validation_status: "valid",
    candidate_count: 1,
    disposition_count: 1,
    promoted_candidate_count: 1,
    validation_results: ["valid"],
    violations: [],
  };
}

function sourceFrontierValidation(): ReconstructSourceFrontierValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    round_id: "round-5",
    created_at: createdAt,
    source_frontier_ref: "rounds/round-5/source-frontier.yaml",
    source_inventory_ref: "source-inventory.yaml",
    source_observations_ref: "source-observations.yaml",
    target_material_profile_validation_ref:
      "target-material-profile-validation.yaml",
    upstream_validation_statuses: {
      target_material_profile: "valid",
    },
    validation_status: "valid",
    accepted_frontier_ref_ids: [],
    rejected_frontier_refs: [],
    no_next_frontier_accepted: true,
    validation_results: ["valid"],
    violations: [],
  };
}

function buildReadiness(
  element: ReconstructPurposeAdequacyRequiredElement = requiredElement(),
  options: {
    sourcePurpose?: ReconstructSourcePurposeCandidatesArtifact;
    purposeValidation?: ReconstructSourcePurposeCandidatesValidationArtifact;
    purposeConfirmation?: ReconstructPurposeConfirmationValidationArtifact;
    materialAdmissionLedger?: ReconstructMaterialAdmissionLedgerArtifact;
    targetMaterialProfileValidation?: ReconstructTargetMaterialProfileValidationArtifact;
    sourceScoutPackValidation?: ReconstructSourceScoutPackValidationArtifact;
    sourceObservationDirectiveValidation?:
      ReconstructSourceObservationDirectiveValidationArtifact;
    candidateDispositionValidation?:
      ReconstructCandidateDispositionValidationArtifact;
    sourceFrontierValidations?: ReconstructSourceFrontierValidationArtifact[];
    admittedDomainIds?: string[];
    maxExplorationRounds?: number;
  } = {},
) {
  const sourcePurpose = options.sourcePurpose ?? sourcePurposeCandidates(element);
  const purposeValidation = options.purposeValidation ?? sourcePurposeValidation();
  const purposeConfirmation =
    options.purposeConfirmation ?? purposeConfirmationValidation();
  const materialAdmissionLedger = options.materialAdmissionLedger ??
    buildMaterialAdmissionLedgerFromSourcePurpose({
    sessionId,
    sourcePurposeCandidates: sourcePurpose,
    sourcePurposeCandidatesRef: "source-purpose-candidates.yaml",
    sourcePurposeCandidatesValidation: purposeValidation,
    sourcePurposeCandidatesValidationRef:
      "source-purpose-candidates-validation.yaml",
      purposeConfirmationValidation: purposeConfirmation,
    purposeConfirmationValidationRef: "purpose-confirmation-validation.yaml",
    });
  const targetMaterialProfile =
    options.targetMaterialProfileValidation ?? targetMaterialProfileValidation();
  const sourceScoutPack =
    options.sourceScoutPackValidation ?? sourceScoutPackValidation();
  const sourceObservationDirective =
    options.sourceObservationDirectiveValidation ??
      sourceObservationDirectiveValidation();
  const candidateDisposition =
    options.candidateDispositionValidation ?? candidateDispositionValidation();
  const sourceFrontierValidations =
    options.sourceFrontierValidations ?? [sourceFrontierValidation()];
  const readiness = buildSeedAuthoringReadinessFromArtifacts({
    sessionId,
    sourcePurposeCandidates: sourcePurpose,
    sourcePurposeCandidatesRef: "source-purpose-candidates.yaml",
    sourcePurposeCandidatesValidation: purposeValidation,
    sourcePurposeCandidatesValidationRef:
      "source-purpose-candidates-validation.yaml",
    targetMaterialProfileValidation: targetMaterialProfile,
    targetMaterialProfileValidationRef: "target-material-profile-validation.yaml",
    sourceScoutPackValidation: sourceScoutPack,
    sourceScoutPackValidationRef: "source-scout-pack-validation.pre-seed.yaml",
    sourceObservationDirectiveValidation: sourceObservationDirective,
    sourceObservationDirectiveValidationRef:
      "source-observation-directive-validation.yaml",
    purposeConfirmationValidation: purposeConfirmation,
    purposeConfirmationValidationRef: "purpose-confirmation-validation.yaml",
    materialAdmissionLedger,
    materialAdmissionLedgerRef: "material-admission-ledger.yaml",
    candidateDispositionValidation: candidateDisposition,
    candidateDispositionValidationRef: "candidate-disposition-validation.yaml",
    sourceFrontierValidations,
    sourceFrontierValidationRefs: sourceFrontierValidations.map((frontier) =>
      `${frontier.source_frontier_ref.replace("source-frontier.yaml", "")}source-frontier-validation.yaml`
    ),
    admittedDomainIds: options.admittedDomainIds,
    maxExplorationRounds: options.maxExplorationRounds ?? 5,
  });
  return {
    sourcePurpose,
    purposeValidation,
    purposeConfirmation,
    materialAdmissionLedger,
    targetMaterialProfile,
    sourceScoutPack,
    sourceObservationDirective,
    candidateDisposition,
    sourceFrontierValidations,
    readiness,
  };
}

describe("seed authoring readiness validation", () => {
  it("projects seed_ready when selected purpose elements have evidence-backed material rows", () => {
    const { sourcePurpose, purposeValidation, materialAdmissionLedger, readiness } =
      buildReadiness();

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: readiness,
      seedAuthoringReadinessRef: "seed-authoring-readiness.yaml",
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceScoutPackValidation: sourceScoutPackValidation(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
      purposeConfirmationValidation: purposeConfirmationValidation(),
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDispositionValidation(),
      sourceFrontierValidations: [sourceFrontierValidation()],
    });

    expect(readiness.readiness_classification).toBe("seed_ready");
    expect(readiness.closure_rows[0]?.closure_state).toBe("evidence_backed");
    expect(readiness.exploration_budget_state).toBe("max_round_exhausted");
    expect(readiness.source_sufficiency_state).toBe("sufficient_for_claim_scope");
    expect(readiness.max_round_exhaustion_interpretation)
      .toBe("exhausted_after_sufficient_selected_scope");
    expect(readiness.boundary_notes).toContain(
      "SeedAuthoringReadiness validates deterministic closure only; semantic adequacy remains owned by seed authoring and downstream validators.",
    );
    expect(validation.validation_status).toBe("valid");
    expect(validation.deterministic_gate_scope).toBe("pre_seed_closure_only");
    expect(validation.semantic_authority_boundary_status).toBe("preserved");
    expect(validation.max_round_exhaustion_interpretation)
      .toBe("exhausted_after_sufficient_selected_scope");
    expect(() =>
      assertSeedAuthoringReadinessAllowsSeed({ readiness, validation })
    ).not.toThrow();
  });

  it("projects frontier_required without making validation invalid", () => {
    const { sourcePurpose, purposeValidation, materialAdmissionLedger, readiness } =
      buildReadiness(requiredElement({
        element_id: "purpose-element-frontier-state",
        element_kind: "state",
        description: "Represent unresolved state transitions.",
        closure_expectation: "frontier_required",
      }));

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: readiness,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceScoutPackValidation: sourceScoutPackValidation(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
      purposeConfirmationValidation: purposeConfirmationValidation(),
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDispositionValidation(),
      sourceFrontierValidations: [sourceFrontierValidation()],
    });

    expect(readiness.readiness_classification).toBe("frontier_required");
    expect(readiness.source_sufficiency_state).toBe("insufficient_for_claim_scope");
    expect(readiness.exploration_budget_state).toBe("max_round_exhausted");
    expect(readiness.max_round_exhaustion_interpretation)
      .toBe("exhausted_with_open_frontier");
    expect(validation.validation_status).toBe("valid");
    expect(() =>
      assertSeedAuthoringReadinessAllowsSeed({ readiness, validation })
    ).toThrow(/does not allow/);
  });

  it("rejects latest-current SourceScoutPack validation as seed-readiness authority", () => {
    const { sourcePurpose, purposeValidation, materialAdmissionLedger, readiness } =
      buildReadiness();
    const latestScoutValidation = {
      ...sourceScoutPackValidation(),
      source_scout_pack_ref: "source-scout-pack.yaml",
    };

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: readiness,
      seedAuthoringReadinessRef: "seed-authoring-readiness.yaml",
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceScoutPackValidation: latestScoutValidation,
      sourceScoutPackValidationRef: "source-scout-pack-validation.yaml",
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
      purposeConfirmationValidation: purposeConfirmationValidation(),
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDispositionValidation(),
      sourceFrontierValidations: [sourceFrontierValidation()],
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("source_scout_pre_seed_identity_mismatch");
  });

  it("rejects same-basename pre-seed SourceScoutPack snapshots from another session", () => {
    const { sourcePurpose, purposeValidation, materialAdmissionLedger, readiness } =
      buildReadiness();
    const validationRef =
      "/tmp/session-a/source-scout-pack-validation.pre-seed.yaml";
    const wrongSessionScoutValidation = {
      ...sourceScoutPackValidation(),
      source_scout_pack_ref:
        "/tmp/session-b/source-scout-pack.pre-seed.yaml",
    };
    const readinessForValidationRef = {
      ...readiness,
      input_authority_refs: {
        ...readiness.input_authority_refs,
        source_scout_pack_validation_ref: validationRef,
      },
      scope_support_ref: `${validationRef}#scout_scope`,
      closure_rows: readiness.closure_rows.map((row) => ({
        ...row,
        validated_upstream_refs: row.validated_upstream_refs.map((ref) =>
          ref === "source-scout-pack-validation.pre-seed.yaml"
            ? validationRef
            : ref
        ),
      })),
    };

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: readinessForValidationRef,
      seedAuthoringReadinessRef: "seed-authoring-readiness.yaml",
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceScoutPackValidation: wrongSessionScoutValidation,
      sourceScoutPackValidationRef: validationRef,
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
      purposeConfirmationValidation: purposeConfirmationValidation(),
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDispositionValidation(),
      sourceFrontierValidations: [sourceFrontierValidation()],
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("source_scout_pre_seed_identity_mismatch");
  });

  it("rejects tampered readiness classification", () => {
    const { sourcePurpose, purposeValidation, materialAdmissionLedger, readiness } =
      buildReadiness(requiredElement({
        element_id: "purpose-element-frontier-state",
        element_kind: "state",
        description: "Represent unresolved state transitions.",
        closure_expectation: "frontier_required",
      }));
    const tampered = {
      ...readiness,
      readiness_classification: "seed_ready" as const,
    };

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: tampered,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceScoutPackValidation: sourceScoutPackValidation(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
      purposeConfirmationValidation: purposeConfirmationValidation(),
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDispositionValidation(),
      sourceFrontierValidations: [sourceFrontierValidation()],
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code))
      .toContain("readiness_classification_mismatch");
  });

  it("rejects readiness artifacts that omit the semantic authority boundary", () => {
    const { sourcePurpose, purposeValidation, materialAdmissionLedger, readiness } =
      buildReadiness();
    const tampered = {
      ...readiness,
      boundary_notes: [],
    };

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: tampered,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceScoutPackValidation: sourceScoutPackValidation(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
      purposeConfirmationValidation: purposeConfirmationValidation(),
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDispositionValidation(),
      sourceFrontierValidations: [sourceFrontierValidation()],
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.semantic_authority_boundary_status).toBe("violated");
    expect(validation.violations.map((item) => item.code))
      .toContain("semantic_authority_boundary_missing");
  });

  it("rejects tampered max-round exhaustion interpretation", () => {
    const { sourcePurpose, purposeValidation, materialAdmissionLedger, readiness } =
      buildReadiness();
    const tampered = {
      ...readiness,
      max_round_exhaustion_interpretation: "exhausted_with_open_frontier" as const,
    };

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: tampered,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceScoutPackValidation: sourceScoutPackValidation(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
      purposeConfirmationValidation: purposeConfirmationValidation(),
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDispositionValidation(),
      sourceFrontierValidations: [sourceFrontierValidation()],
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code))
      .toContain("max_round_exhaustion_interpretation_mismatch");
  });

  it("projects limited_seed_possible when selected purpose closure is limitation-backed", () => {
    const element = requiredElement({
      element_id: "purpose-element-dynamic-limit",
      element_kind: "state",
      description: "Represent dynamic behavior or record a limitation.",
    });
    const sourcePurpose = sourcePurposeCandidates(element);
    const purposeValidation = sourcePurposeValidation();
    const purposeConfirmation = purposeConfirmationValidation();
    const ledger = buildMaterialAdmissionLedgerFromSourcePurpose({
      sessionId,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      purposeConfirmationValidation: purposeConfirmation,
    });
    const limitedLedger: ReconstructMaterialAdmissionLedgerArtifact = {
      ...ledger,
      admission_rows: ledger.admission_rows.map((row) => ({
        ...row,
        limitation_refs: ["limitation-dynamic-state"],
      })),
    };
    const {
      readiness,
      targetMaterialProfile,
      sourceScoutPack,
      sourceObservationDirective,
      candidateDisposition,
      sourceFrontierValidations,
    } = buildReadiness(element, {
      sourcePurpose,
      purposeValidation,
      purposeConfirmation,
      materialAdmissionLedger: limitedLedger,
    });

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: readiness,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfile,
      sourceScoutPackValidation: sourceScoutPack,
      sourceObservationDirectiveValidation: sourceObservationDirective,
      purposeConfirmationValidation: purposeConfirmation,
      materialAdmissionLedger: limitedLedger,
      candidateDispositionValidation: candidateDisposition,
      sourceFrontierValidations,
    });

    expect(readiness.readiness_classification).toBe("limited_seed_possible");
    expect(readiness.closure_rows[0]?.closure_state).toBe("limitation_backed");
    expect(readiness.limitation_closure_state).toBe("limitation_backed");
    expect(validation.validation_status).toBe("valid");
    expect(() =>
      assertSeedAuthoringReadinessAllowsSeed({ readiness, validation })
    ).not.toThrow();
  });

  it("projects explicit handoff-limitation purpose elements as limited seed possible", () => {
    const element = requiredElement({
      element_id: "purpose-element-owner-reference-limitation",
      element_kind: "handoff_limitation",
      material_facet_kind: "under_specified_reference",
      description:
        "Record the observed owner actor reference gap as a handoff limitation.",
      actionability_surface_refs: ["dynamic_surface"],
      maturity_dimension_refs: ["context", "external", "evidence"],
      expected_seed_ref_families: [
        "handoff_limitations",
        "dynamic_layer.actor_types",
      ],
      closure_expectation: "frontier_required",
    });
    const {
      sourcePurpose,
      purposeValidation,
      purposeConfirmation,
      materialAdmissionLedger,
      targetMaterialProfile,
      sourceScoutPack,
      sourceObservationDirective,
      candidateDisposition,
      sourceFrontierValidations,
      readiness,
    } = buildReadiness(element);

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: readiness,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfile,
      sourceScoutPackValidation: sourceScoutPack,
      sourceObservationDirectiveValidation: sourceObservationDirective,
      purposeConfirmationValidation: purposeConfirmation,
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDisposition,
      sourceFrontierValidations,
    });

    expect(readiness.readiness_classification).toBe("limited_seed_possible");
    expect(readiness.closure_rows[0]?.closure_axis).toBe("actor");
    expect(readiness.closure_rows[0]?.closure_state).toBe("limitation_backed");
    expect(readiness.closure_rows[0]?.limitation_refs).toEqual([
      "purpose_handoff_limitation:purpose-element-owner-reference-limitation",
    ]);
    expect(readiness.missing_requirement_categories).not.toContain("actor");
    expect(readiness.source_sufficiency_state).toBe("sufficient_for_claim_scope");
    expect(readiness.max_round_exhaustion_interpretation)
      .toBe("exhausted_after_sufficient_selected_scope");
    expect(validation.validation_status).toBe("valid");
    expect(() =>
      assertSeedAuthoringReadinessAllowsSeed({ readiness, validation })
    ).not.toThrow();
  });

  it("projects purpose_confirmation_required from confirmation validation without treating it as source insufficiency", () => {
    const {
      sourcePurpose,
      purposeValidation,
      purposeConfirmation,
      materialAdmissionLedger,
      targetMaterialProfile,
      sourceScoutPack,
      sourceObservationDirective,
      candidateDisposition,
      sourceFrontierValidations,
      readiness,
    } = buildReadiness(requiredElement(), {
      purposeConfirmation:
        purposeConfirmationValidation("must_project_blocked"),
    });

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: readiness,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfile,
      sourceScoutPackValidation: sourceScoutPack,
      sourceObservationDirectiveValidation: sourceObservationDirective,
      purposeConfirmationValidation: purposeConfirmation,
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDisposition,
      sourceFrontierValidations,
    });

    expect(readiness.readiness_classification)
      .toBe("purpose_confirmation_required");
    expect(readiness.source_sufficiency_state)
      .toBe("not_evaluated_due_non_source_blocker");
    expect(validation.validation_status).toBe("valid");
    expect(() =>
      assertSeedAuthoringReadinessAllowsSeed({ readiness, validation })
    ).toThrow(/does not allow/);
  });

  it("rejects readiness artifacts whose source sufficiency state differs from the deterministic classification", () => {
    const {
      sourcePurpose,
      purposeValidation,
      purposeConfirmation,
      materialAdmissionLedger,
      targetMaterialProfile,
      sourceScoutPack,
      sourceObservationDirective,
      candidateDisposition,
      sourceFrontierValidations,
      readiness,
    } = buildReadiness(requiredElement());

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: {
        ...readiness,
        source_sufficiency_state: "unknown_until_frontier",
      },
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfile,
      sourceScoutPackValidation: sourceScoutPack,
      sourceObservationDirectiveValidation: sourceObservationDirective,
      purposeConfirmationValidation: purposeConfirmation,
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDisposition,
      sourceFrontierValidations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code))
      .toContain("source_sufficiency_state_mismatch");
  });

  it("projects blocked_no_authority when no selected purpose candidate resolves", () => {
    const sourcePurpose: ReconstructSourcePurposeCandidatesArtifact = {
      ...sourcePurposeCandidates(),
      purpose_candidates: [],
    };
    const {
      purposeValidation,
      purposeConfirmation,
      materialAdmissionLedger,
      targetMaterialProfile,
      sourceScoutPack,
      sourceObservationDirective,
      candidateDisposition,
      sourceFrontierValidations,
      readiness,
    } = buildReadiness(requiredElement(), { sourcePurpose });

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: readiness,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfile,
      sourceScoutPackValidation: sourceScoutPack,
      sourceObservationDirectiveValidation: sourceObservationDirective,
      purposeConfirmationValidation: purposeConfirmation,
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDisposition,
      sourceFrontierValidations,
    });

    expect(readiness.readiness_classification).toBe("blocked_no_authority");
    expect(readiness.selected_purpose_candidate_ref).toBeNull();
    expect(readiness.source_sufficiency_state)
      .toBe("not_evaluated_due_non_source_blocker");
    expect(validation.validation_status).toBe("valid");
    expect(() =>
      assertSeedAuthoringReadinessAllowsSeed({ readiness, validation })
    ).toThrow(/does not allow/);
  });

  it("projects blocked_validation_gap before semantic readiness states", () => {
    const invalidScoutValidation: ReconstructSourceScoutPackValidationArtifact = {
      ...sourceScoutPackValidation(),
      validation_status: "invalid",
      validation_results: ["invalid"],
      violations: [{
        code: "source_scout_pack_signal_dangling_observation",
        message: "fixture invalid scout pack",
        subject_id: "signal-1",
      }],
    };
    const {
      sourcePurpose,
      purposeValidation,
      purposeConfirmation,
      materialAdmissionLedger,
      targetMaterialProfile,
      sourceObservationDirective,
      candidateDisposition,
      sourceFrontierValidations,
      readiness,
    } = buildReadiness(requiredElement(), {
      sourceScoutPackValidation: invalidScoutValidation,
    });

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: readiness,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfile,
      sourceScoutPackValidation: invalidScoutValidation,
      sourceObservationDirectiveValidation: sourceObservationDirective,
      purposeConfirmationValidation: purposeConfirmation,
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDisposition,
      sourceFrontierValidations,
    });

    expect(readiness.readiness_classification).toBe("blocked_validation_gap");
    expect(readiness.closure_rows[0]?.closure_state)
      .toBe("blocked_by_validation_gap");
    expect(readiness.source_sufficiency_state)
      .toBe("not_evaluated_due_validation_gap");
    expect(validation.validation_status).toBe("valid");
    expect(() =>
      assertSeedAuthoringReadinessAllowsSeed({ readiness, validation })
    ).toThrow(/does not allow/);
  });

  it("keeps ontology-domain missing categories diagnostic unless selected-purpose closure is missing", () => {
    const {
      sourcePurpose,
      purposeValidation,
      purposeConfirmation,
      materialAdmissionLedger,
      targetMaterialProfile,
      sourceScoutPack,
      sourceObservationDirective,
      candidateDisposition,
      sourceFrontierValidations,
      readiness,
    } = buildReadiness(requiredElement(), {
      admittedDomainIds: ["ontology"],
    });

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: readiness,
      sourcePurposeCandidates: sourcePurpose,
      sourcePurposeCandidatesValidation: purposeValidation,
      targetMaterialProfileValidation: targetMaterialProfile,
      sourceScoutPackValidation: sourceScoutPack,
      sourceObservationDirectiveValidation: sourceObservationDirective,
      purposeConfirmationValidation: purposeConfirmation,
      materialAdmissionLedger,
      candidateDispositionValidation: candidateDisposition,
      sourceFrontierValidations,
      admittedDomainIds: ["ontology"],
    });

    expect(readiness.readiness_classification).toBe("seed_ready");
    expect(readiness.ontology_domain_required_category_rows.length).toBe(9);
    expect(readiness.missing_requirement_categories).toEqual([]);
    expect(readiness.ontology_domain_required_category_rows.some((row) =>
      row.category_closure_state === "missing"
    )).toBe(true);
    expect(readiness.source_sufficiency_state).toBe("sufficient_for_claim_scope");
    expect(validation.validation_status).toBe("valid");
  });
});

describe("validateSeedAuthoringReadiness rejection branches", () => {
  function validBundle(
    buildOptions: Parameters<typeof buildReadiness>[1] = {},
    element: ReconstructPurposeAdequacyRequiredElement = requiredElement(),
  ) {
    const bundle = buildReadiness(element, buildOptions);
    const validateArgs = {
      sourcePurposeCandidates: bundle.sourcePurpose,
      sourcePurposeCandidatesValidation: bundle.purposeValidation,
      targetMaterialProfileValidation: bundle.targetMaterialProfile,
      sourceScoutPackValidation: bundle.sourceScoutPack,
      sourceObservationDirectiveValidation: bundle.sourceObservationDirective,
      purposeConfirmationValidation: bundle.purposeConfirmation,
      materialAdmissionLedger: bundle.materialAdmissionLedger,
      candidateDispositionValidation: bundle.candidateDisposition,
      sourceFrontierValidations: bundle.sourceFrontierValidations,
      admittedDomainIds: buildOptions.admittedDomainIds,
    };
    return { bundle, validateArgs };
  }

  it("confirms the reused valid base validates before mutation", () => {
    const { bundle, validateArgs } = validBundle();
    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: bundle.readiness,
      ...validateArgs,
    });
    expect(validation.validation_status).toBe("valid");
  });

  it("rejects session_id_mismatch when readiness session_id diverges from source-purpose-candidates", () => {
    const { bundle, validateArgs } = validBundle();
    const tampered = structuredClone(bundle.readiness);
    tampered.session_id = `${bundle.readiness.session_id}-divergent`;

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: tampered,
      ...validateArgs,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((item) => item.code === "session_id_mismatch"))
      .toBe(true);
  });

  it("rejects closure_row_missing when an expected closure row is dropped from the artifact", () => {
    const { bundle, validateArgs } = validBundle();
    const tampered = structuredClone(bundle.readiness);
    expect(tampered.closure_rows.length).toBeGreaterThan(0);
    tampered.closure_rows = tampered.closure_rows.slice(1);

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: tampered,
      ...validateArgs,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((item) => item.code === "closure_row_missing"))
      .toBe(true);
  });

  it("rejects closure_row_invalid_state when a closure row reports the wrong closure state", () => {
    const { bundle, validateArgs } = validBundle();
    const tampered = structuredClone(bundle.readiness);
    const target = tampered.closure_rows[0];
    expect(target).toBeDefined();
    expect(target!.closure_state).toBe("evidence_backed");
    target!.closure_state = "missing";

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: tampered,
      ...validateArgs,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((item) => item.code === "closure_row_invalid_state"))
      .toBe(true);
  });

  it("rejects closure_row_dangling_material_admission when a row points at an unexpected admission ref", () => {
    const { bundle, validateArgs } = validBundle();
    const tampered = structuredClone(bundle.readiness);
    const target = tampered.closure_rows[0];
    expect(target).toBeDefined();
    target!.material_admission_row_ref = "material-admission:fabricated-row";

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: tampered,
      ...validateArgs,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((item) =>
      item.code === "closure_row_dangling_material_admission"
    )).toBe(true);
  });

  it("rejects closure_row_dangling_required_element when the artifact carries an unknown closure row", () => {
    const { bundle, validateArgs } = validBundle();
    const tampered = structuredClone(bundle.readiness);
    const base = tampered.closure_rows[0];
    expect(base).toBeDefined();
    tampered.closure_rows = [
      ...tampered.closure_rows,
      {
        ...structuredClone(base!),
        closure_row_id: "seed-authoring-closure:fabricated-unknown-element",
        required_element_ref: "purpose-element-unknown",
      },
    ];

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: tampered,
      ...validateArgs,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((item) =>
      item.code === "closure_row_dangling_required_element"
    )).toBe(true);
  });

  it("rejects missing_requirement_category_not_reported when reported categories diverge from closure rows", () => {
    const { bundle, validateArgs } = validBundle();
    const tampered = structuredClone(bundle.readiness);
    tampered.missing_requirement_categories = [
      ...tampered.missing_requirement_categories,
      "fabricated_missing_category",
    ];

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: tampered,
      ...validateArgs,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((item) =>
      item.code === "missing_requirement_category_not_reported"
    )).toBe(true);
  });

  it("rejects ontology_domain_category_missing when an expected ontology domain category row is dropped", () => {
    const { bundle, validateArgs } = validBundle({ admittedDomainIds: ["ontology"] });
    expect(bundle.readiness.ontology_domain_required_category_rows.length)
      .toBeGreaterThan(0);
    const tampered = structuredClone(bundle.readiness);
    tampered.ontology_domain_required_category_rows =
      tampered.ontology_domain_required_category_rows.slice(1);

    const validation = validateSeedAuthoringReadiness({
      seedAuthoringReadiness: tampered,
      ...validateArgs,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((item) =>
      item.code === "ontology_domain_category_missing"
    )).toBe(true);
  });
});
