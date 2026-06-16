import { describe, expect, it } from "vitest";
import type {
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMaterialAdmissionLedgerValidationArtifact,
  ReconstructMaturationContinuationDecisionArtifact,
  ReconstructMaturationContinuationDecisionValidationArtifact,
  ReconstructRegistryVerificationEvidenceValidationArtifact,
  ReconstructRunControlValidationArtifact,
  ReconstructRunManifestArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import {
  buildClaimProjectionArtifact,
  validateClaimProjection,
} from "./claim-projection-validation.js";

const now = "2026-06-02T00:00:00.000Z";

function targetMaterialProfile(): ReconstructTargetMaterialProfileArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    target_refs: ["/repo"],
    target_material_kind: "code",
    target_material_kind_candidates: ["code"],
    support_status: "supported",
    unsupported_reason: null,
    selected_source_profiles: [{
      profile_id: "code.v1",
      target_material_kind: "code",
      is_default_for_kind: true,
      definition_ref: "source-profiles/code.v1.yaml",
      definition_sha256: "sha256-fixture",
      profile_ref: "code.v1",
      contract_status: "active",
      runtime_implementation_status: "implemented",
      schema_version: 1,
      profile_version: 1,
      migration_status: "current",
      supersedes: [],
      replaced_by: [],
      split_from: [],
      split_into: [],
      merged_from: [],
      merged_into: [],
      support_summary: "fixture",
      scan_targets: ["**/*.ts"],
    }],
    detection: {
      owner: "runtime_heuristic",
      confidence: 1,
      confidence_basis: "fixture",
      per_ref: [],
    },
  };
}

function targetMaterialProfileValidation(
  validationStatus: "valid" | "invalid" = "valid",
): ReconstructTargetMaterialProfileValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    target_material_profile_ref: "target-material-profile.yaml",
    registry_ref: "reconstruct-contract-registry.yaml",
    validation_status: validationStatus,
    target_ref_count: 1,
    selected_source_profile_count: 1,
    validation_results: validationStatus === "valid"
      ? ["target_material_profile_valid"]
      : ["target_material_profile_invalid"],
    violations: [],
  };
}

function mixedTargetMaterialProfile(): ReconstructTargetMaterialProfileArtifact {
  const profile = targetMaterialProfile();
  return {
    ...profile,
    target_refs: ["/repo/src/feature.ts", "/repo/docs/guide.md"],
    target_material_kind: "mixed",
    target_material_kind_candidates: ["code", "document"],
    support_status: "partial_composite",
    selected_source_profiles: [{
      ...profile.selected_source_profiles[0]!,
      target_material_kind: "code",
      profile_id: "code.v1",
      profile_ref: "code.v1",
    }],
    detection: {
      owner: "runtime_heuristic",
      confidence: 0.75,
      confidence_basis: "fixture mixed target",
      per_ref: [
        {
          ref: "/repo/src/feature.ts",
          exists: true,
          kind: "code",
          confidence: 0.92,
          confidence_basis: "fixture code",
        },
        {
          ref: "/repo/docs/guide.md",
          exists: true,
          kind: "document",
          confidence: 0.92,
          confidence_basis: "fixture document",
        },
      ],
    },
  };
}

function validationArtifact(
  validationStatus: "valid" | "invalid" = "valid",
): ReconstructHandoffDecisionValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    stop_decision_ref: "stop-decision.yaml",
    pre_handoff_run_manifest_validation_ref:
      "reconstruct-run-manifest.pre-handoff-validation.yaml",
    validation_status: validationStatus,
    readiness_projection_source: "runtime_gate_projection",
    readiness_projection: validationStatus === "valid" ? "ready" : "blocked",
    required_validation_statuses: {},
    gate_projection: [],
    material_failure_count: 0,
    unresolved_count: 0,
    validation_results: validationStatus === "valid"
      ? ["handoff_decision_valid"]
      : ["handoff_decision_invalid"],
    violations: [],
  };
}

function runControlValidation(
  validationStatus: "valid" | "invalid" = "valid",
): ReconstructRunControlValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    reconstruct_run_control_ref: "reconstruct-run-control.yaml",
    validation_status: validationStatus,
    request_count: 1,
    attempt_count: 1,
    active_lock_count: 1,
    transaction_count: 1,
    current_attempt_id: "attempt-1",
    validation_results: validationStatus === "valid"
      ? ["reconstruct_run_control_valid"]
      : ["reconstruct_run_control_invalid"],
    violations: [],
  };
}

function registryVerificationValidation(
  validationStatus: "valid" | "invalid" = "valid",
): ReconstructRegistryVerificationEvidenceValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    registry_verification_evidence_ref: "registry-verification-evidence.yaml",
    registry_ref: "reconstruct-contract-registry.yaml",
    validation_status: validationStatus,
    artifact_authority_count: 1,
    validation_gate_count: 1,
    validator_count: 1,
    predicate_count: 1,
    source_profile_count: 1,
    validation_results: validationStatus === "valid"
      ? ["registry_verification_evidence_valid"]
      : ["registry_verification_evidence_invalid"],
    violations: [],
  };
}

function runManifest(args?: {
  semanticAuthorRealization?: "mock" | "direct_call";
  confirmationProviderRealization?: "mock" | "direct_call";
}): ReconstructRunManifestArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    entrypoint: "reconstruct",
    created_at: now,
    completed_at: now,
    target_refs: ["/repo"],
    intent: "fixture",
    execution_profile: {
      profile_kind: "full_integral_exploration",
      runner: "integral-exploration-direct-call",
      semantic_author_realization: args?.semanticAuthorRealization ?? "direct_call",
      confirmation_provider_realization:
        args?.confirmationProviderRealization ?? "direct_call",
      directive_author_id: "fixture-directive-author",
      confirmation_provider_id: "fixture-confirmation-provider",
      allowed_completion_claim: "fixture",
    },
    artifact_refs: {} as ReconstructRunManifestArtifact["artifact_refs"],
    governing_snapshot: {
      registry_ref: "reconstruct-contract-registry.yaml",
      registry_hash: "hash",
      active_contract_refs: [],
      active_contract_hashes: {},
      source_profile_refs: [],
      source_profile_hashes: {},
      migration_catalog_refs: [],
      migration_catalog_hashes: {},
      requested_domain_ids: [],
      lens_ids: [],
      admitted_domain_ids: [],
    },
    purpose_adequacy_scope: {
      implemented_artifacts: [],
      deferred_artifacts: [],
      deferred_reason: "fixture",
    },
    steps: [],
    validation_gates: [],
  };
}

function sourceSafetyValidation(
  validationStatus: "valid" | "invalid" = "valid",
): ReconstructSourceSafetyLedgerValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    source_safety_ledger_ref: "source-safety-ledger.yaml",
    source_observations_ref: "source-observations.yaml",
    validation_status: validationStatus,
    safety_row_count: 1,
    no_prompt_use_count: 0,
    redacted_output_only_count: 0,
    validation_results: validationStatus === "valid"
      ? ["source_safety_valid"]
      : ["source_safety_invalid"],
    violations: [],
  };
}

function materialAdmissionValidation(
  validationStatus: "valid" | "invalid" = "valid",
): ReconstructMaterialAdmissionLedgerValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    material_admission_ledger_ref: "material-admission-ledger.yaml",
    source_purpose_candidates_validation_ref:
      "source-purpose-candidates-validation.yaml",
    candidate_disposition_validation_ref: "candidate-disposition-validation.yaml",
    ontology_seed_validation_ref: "ontology-seed-validation.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    validation_status: validationStatus,
    admission_row_count: 1,
    required_or_admitted_row_count: 1,
    downstream_consumed_row_count: 1,
    validation_results: validationStatus === "valid"
      ? ["material_admission_valid"]
      : ["material_admission_invalid"],
    violations: [],
  };
}

function continuationDecision(
  decisionState: ReconstructMaturationContinuationDecisionArtifact["decision_state"] =
    "actionable_ready",
): ReconstructMaturationContinuationDecisionArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    actionability_matrix_validation_ref: "actionability-matrix-validation.yaml",
    decision_state: decisionState,
    state_rationale: "fixture",
    blocking_row_refs: [],
    next_frontier_refs: [],
    authority_request_refs: [],
    authority_response_refs: [],
    claim_scope: {
      included_row_refs: ["actionability-row-1"],
      excluded_row_refs: [],
      exclusion_rationale: null,
    },
    limitation_refs: [],
  };
}

function continuationDecisionValidation(
  decisionState: ReconstructMaturationContinuationDecisionValidationArtifact["decision_state"] =
    "actionable_ready",
  validationStatus: "valid" | "invalid" = "valid",
): ReconstructMaturationContinuationDecisionValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    maturation_continuation_decision_ref:
      "maturation-continuation-decision.yaml",
    actionability_matrix_validation_ref: "actionability-matrix-validation.yaml",
    maturation_question_frontier_validation_ref:
      "maturation-question-frontier-validation.yaml",
    maturation_closure_frontier_validation_ref:
      "maturation-closure-frontier-validation.yaml",
    answer_support_ledger_validation_ref: "answer-support-ledger-validation.yaml",
    maturation_authority_response_validation_ref:
      "maturation-authority-response-validation.yaml",
    ontology_expansion_validation_ref: "ontology-expansion-validation.yaml",
    validation_status: validationStatus,
    decision_state: decisionState,
    blocking_row_count: 0,
    next_frontier_count: 0,
    validation_results: validationStatus === "valid"
      ? ["maturation_continuation_decision_valid"]
      : ["maturation_continuation_decision_invalid"],
    violations: [],
  };
}

function projection(args?: {
  handoffStatus?: "valid" | "invalid";
  sourceSafetyStatus?: "valid" | "invalid";
  materialAdmissionStatus?: "valid" | "invalid";
  continuationStatus?: "valid" | "invalid";
  runControlStatus?: "valid" | "invalid";
  registryStatus?: "valid" | "invalid";
  targetMaterialProfileStatus?: "valid" | "invalid";
  decisionState?: ReconstructMaturationContinuationDecisionValidationArtifact["decision_state"];
}) {
  const decisionState = args?.decisionState ?? "actionable_ready";
  return buildClaimProjectionArtifact({
    sessionId: "session-1",
    targetMaterialProfile: targetMaterialProfile(),
    targetMaterialProfileRef: "target-material-profile.yaml",
    targetMaterialProfileValidation:
      targetMaterialProfileValidation(args?.targetMaterialProfileStatus),
    targetMaterialProfileValidationRef:
      "target-material-profile-validation.yaml",
    handoffDecisionValidation: validationArtifact(args?.handoffStatus),
    handoffDecisionValidationRef: "handoff-decision-validation.yaml",
    runControlValidation: runControlValidation(args?.runControlStatus),
    runControlValidationRef:
      "reconstruct-run-control.pre-publication-validation.yaml",
    registryVerificationEvidenceValidation:
      registryVerificationValidation(args?.registryStatus),
    registryVerificationEvidenceValidationRef:
      "registry-verification-evidence-validation.yaml",
    sourceSafetyLedgerValidation:
      sourceSafetyValidation(args?.sourceSafetyStatus),
    sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
    materialAdmissionLedgerValidation:
      materialAdmissionValidation(args?.materialAdmissionStatus),
    materialAdmissionLedgerValidationRef:
      "material-admission-ledger-validation.yaml",
    maturationContinuationDecision: continuationDecision(decisionState),
    maturationContinuationDecisionRef: "maturation-continuation-decision.yaml",
    maturationContinuationDecisionValidation:
      continuationDecisionValidation(decisionState, args?.continuationStatus),
    maturationContinuationDecisionValidationRef:
      "maturation-continuation-decision-validation.yaml",
    reconstructRunManifestRef: "reconstruct-run-manifest.yaml",
    registryRef: "reconstruct-contract-registry.yaml",
  });
}

describe("claim projection validation", () => {
  const expectedValidationRefs = [
    "handoff-decision-validation.yaml",
    "target-material-profile-validation.yaml",
    "reconstruct-run-control.pre-publication-validation.yaml",
    "registry-verification-evidence-validation.yaml",
    "source-safety-ledger-validation.yaml",
    "material-admission-ledger-validation.yaml",
    "maturation-continuation-decision-validation.yaml",
  ];

  it("accepts an actionable-ready projection across public surfaces", () => {
    const artifact = projection();
    const validation = validateClaimProjection({
      claimProjection: artifact,
      targetMaterialProfile: targetMaterialProfile(),
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      expectedRequiredValidationRefs: expectedValidationRefs,
      requiredValidationStatuses: expectedValidationRefs.map((ref) => ({
        ref,
        status: "valid",
      })),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.projection_row_count).toBe(7);
    expect(validation.strongest_claim_level).toBe("actionable_ready");
    expect(artifact.projection_rows.map((row) => row.projection_surface))
      .toEqual([
        "status",
        "result",
        "final_output",
        "mcp",
        "api",
        "handoff",
        "material_kind_support",
      ]);
    expect(
      artifact.projection_rows.find((row) =>
        row.projection_surface === "material_kind_support"
      )?.decision_state,
    ).toBe("not_applicable");
    expect(
      artifact.projection_rows.find((row) =>
        row.projection_surface === "material_kind_support"
      ),
    ).toMatchObject({
      claim_level: "not_applicable",
      actionability_claim: "none",
      included_row_refs: [],
      excluded_row_refs: [],
    });
  });

  it("does not overstate unknown material-kind support as profile supported", () => {
    const profile = targetMaterialProfile();
    profile.support_status = "unknown";
    profile.unsupported_reason = "target material kind could not be classified";
    profile.selected_source_profiles = [];
    const artifact = buildClaimProjectionArtifact({
      sessionId: "session-1",
      targetMaterialProfile: profile,
      targetMaterialProfileRef: "target-material-profile.yaml",
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      targetMaterialProfileValidationRef:
        "target-material-profile-validation.yaml",
      handoffDecisionValidation: validationArtifact(),
      handoffDecisionValidationRef: "handoff-decision-validation.yaml",
      runControlValidation: runControlValidation(),
      runControlValidationRef:
        "reconstruct-run-control.pre-publication-validation.yaml",
      registryVerificationEvidenceValidation: registryVerificationValidation(),
      registryVerificationEvidenceValidationRef:
        "registry-verification-evidence-validation.yaml",
      sourceSafetyLedgerValidation: sourceSafetyValidation(),
      sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
      materialAdmissionLedgerValidation: materialAdmissionValidation(),
      materialAdmissionLedgerValidationRef:
        "material-admission-ledger-validation.yaml",
      maturationContinuationDecision:
        continuationDecision("actionable_ready"),
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      maturationContinuationDecisionValidation:
        continuationDecisionValidation("actionable_ready"),
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
      reconstructRunManifestRef: "reconstruct-run-manifest.yaml",
      registryRef: "reconstruct-contract-registry.yaml",
    });

    expect(
      artifact.projection_rows.find((row) =>
        row.projection_surface === "material_kind_support"
      )?.member_capability_rows[0]?.support_claim,
    ).toBe("unsupported");
  });

  it("preserves per-member material-kind support lineage for mixed targets", () => {
    const profile = mixedTargetMaterialProfile();
    const artifact = buildClaimProjectionArtifact({
      sessionId: "session-1",
      targetMaterialProfile: profile,
      targetMaterialProfileRef: "target-material-profile.yaml",
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      targetMaterialProfileValidationRef:
        "target-material-profile-validation.yaml",
      handoffDecisionValidation: validationArtifact(),
      handoffDecisionValidationRef: "handoff-decision-validation.yaml",
      runControlValidation: runControlValidation(),
      runControlValidationRef:
        "reconstruct-run-control.pre-publication-validation.yaml",
      registryVerificationEvidenceValidation: registryVerificationValidation(),
      registryVerificationEvidenceValidationRef:
        "registry-verification-evidence-validation.yaml",
      sourceSafetyLedgerValidation: sourceSafetyValidation(),
      sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
      materialAdmissionLedgerValidation: materialAdmissionValidation(),
      materialAdmissionLedgerValidationRef:
        "material-admission-ledger-validation.yaml",
      maturationContinuationDecision:
        continuationDecision("actionable_ready"),
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      maturationContinuationDecisionValidation:
        continuationDecisionValidation("actionable_ready"),
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
      reconstructRunManifestRef: "reconstruct-run-manifest.yaml",
      registryRef: "reconstruct-contract-registry.yaml",
    });

    const materialKindSupport = artifact.projection_rows.find((row) =>
      row.projection_surface === "material_kind_support"
    )!;

    expect(materialKindSupport.member_capability_rows).toEqual([
	      expect.objectContaining({
	        member_id: "/repo/src/feature.ts",
	        target_ref: "/repo/src/feature.ts",
	        target_material_kind: "code",
	        selected_source_profile_id: "code.v1",
	        selected_source_profile_ref: "code.v1",
	        selected_source_profile_definition_sha256: "sha256-fixture",
	        member_source_refs: ["/repo/src/feature.ts"],
	        validation_ref: "target-material-profile.yaml",
	        support_claim: "profile_supported",
	        readiness_effect: "supported",
	      }),
	      expect.objectContaining({
	        member_id: "/repo/docs/guide.md",
	        target_ref: "/repo/docs/guide.md",
	        target_material_kind: "document",
	        selected_source_profile_id: null,
	        selected_source_profile_ref: null,
	        selected_source_profile_definition_sha256: null,
	        member_source_refs: ["/repo/docs/guide.md"],
	        validation_ref: "target-material-profile.yaml",
	        support_claim: "unsupported",
	        readiness_effect: "blocked",
	      }),
    ]);

    const validation = validateClaimProjection({
      claimProjection: artifact,
      targetMaterialProfile: profile,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
    });

    expect(validation.validation_status).toBe("valid");
  });

  it("rejects collapsed material-kind support rows for mixed targets", () => {
    const profile = mixedTargetMaterialProfile();
    const artifact = buildClaimProjectionArtifact({
      sessionId: "session-1",
      targetMaterialProfile: profile,
      targetMaterialProfileRef: "target-material-profile.yaml",
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      targetMaterialProfileValidationRef:
        "target-material-profile-validation.yaml",
      handoffDecisionValidation: validationArtifact(),
      handoffDecisionValidationRef: "handoff-decision-validation.yaml",
      runControlValidation: runControlValidation(),
      runControlValidationRef:
        "reconstruct-run-control.pre-publication-validation.yaml",
      registryVerificationEvidenceValidation: registryVerificationValidation(),
      registryVerificationEvidenceValidationRef:
        "registry-verification-evidence-validation.yaml",
      sourceSafetyLedgerValidation: sourceSafetyValidation(),
      sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
      materialAdmissionLedgerValidation: materialAdmissionValidation(),
      materialAdmissionLedgerValidationRef:
        "material-admission-ledger-validation.yaml",
      maturationContinuationDecision:
        continuationDecision("actionable_ready"),
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      maturationContinuationDecisionValidation:
        continuationDecisionValidation("actionable_ready"),
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
      reconstructRunManifestRef: "reconstruct-run-manifest.yaml",
      registryRef: "reconstruct-contract-registry.yaml",
    });
    const materialKindSupport = artifact.projection_rows.find((row) =>
      row.projection_surface === "material_kind_support"
    )!;
    materialKindSupport.member_capability_rows =
      materialKindSupport.member_capability_rows.map((member) => ({
        ...member,
        target_material_kind: "mixed",
        support_claim: "profile_supported",
        limitation_refs: [],
      }));

    const validation = validateClaimProjection({
      claimProjection: artifact,
      targetMaterialProfile: profile,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("member_capability_lineage_mismatch");
  });

  it("blocks the projection when a required runtime validation is invalid", () => {
    const artifact = projection({ materialAdmissionStatus: "invalid" });
    const validation = validateClaimProjection({
      claimProjection: artifact,
      expectedRequiredValidationRefs: expectedValidationRefs,
      requiredValidationStatuses: expectedValidationRefs.map((ref) => ({
        ref,
        status: "valid",
      })),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.strongest_claim_level).toBe("blocked");
    expect(
      artifact.projection_rows
        .filter((row) => row.projection_surface !== "material_kind_support")
        .every((row) => row.limitation_refs.length > 0),
    ).toBe(true);
  });

  it("rejects stale projection rows when a required proof ref is invalid", () => {
    const artifact = projection();
    const validation = validateClaimProjection({
      claimProjection: artifact,
      expectedRequiredValidationRefs: expectedValidationRefs,
      requiredValidationStatuses: expectedValidationRefs.map((ref) => ({
        ref,
        status: ref === "registry-verification-evidence-validation.yaml"
          ? "invalid"
          : "valid",
      })),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("required_validation_ref_invalid");
  });

  it("accepts blocked projections for invalid upstream refs when recovery refs are exposed", () => {
    const artifact = projection({ registryStatus: "invalid" });
    const validation = validateClaimProjection({
      claimProjection: artifact,
      expectedRequiredValidationRefs: expectedValidationRefs,
      requiredValidationStatuses: expectedValidationRefs.map((ref) => ({
        ref,
        status: ref === "registry-verification-evidence-validation.yaml"
          ? "invalid"
          : "valid",
      })),
      expectedClaimProjection: projection({ registryStatus: "invalid" }),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.strongest_claim_level).toBe("blocked");
    expect(
      artifact.projection_rows
        .filter((row) => row.projection_surface !== "material_kind_support")
        .every((row) =>
          row.limitation_refs.includes(
            "registry-verification-evidence-validation.yaml",
          )
        ),
    ).toBe(true);
  });

  it("rejects blocked projections that hide the invalid upstream recovery ref", () => {
    const artifact = projection({ registryStatus: "invalid" });
    for (const row of artifact.projection_rows) {
      if (row.projection_surface !== "material_kind_support") {
        row.limitation_refs = row.limitation_refs.filter((ref) =>
          ref !== "registry-verification-evidence-validation.yaml"
        );
      }
    }
    const validation = validateClaimProjection({
      claimProjection: artifact,
      expectedRequiredValidationRefs: expectedValidationRefs,
      requiredValidationStatuses: expectedValidationRefs.map((ref) => ({
        ref,
        status: ref === "registry-verification-evidence-validation.yaml"
          ? "invalid"
          : "valid",
      })),
      expectedClaimProjection: projection({ registryStatus: "invalid" }),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toEqual(expect.arrayContaining([
        "required_validation_ref_invalid",
        "derived_claim_mismatch",
      ]));
  });

  it("rejects projection rows that are stronger than the upstream continuation decision", () => {
    const expected = projection({ decisionState: "continue" });
    const artifact = projection({ decisionState: "continue" });
    for (const row of artifact.projection_rows) {
      if (row.projection_surface !== "material_kind_support") {
        row.claim_level = "actionable_ready";
        row.decision_state = "actionable_ready";
        row.actionability_claim = "ready";
        row.display_label = "Actionable Ready";
        row.machine_status = "actionable_ready";
      }
    }
    const validation = validateClaimProjection({
      claimProjection: artifact,
      expectedClaimProjection: expected,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("derived_claim_mismatch");
  });

  it("accepts actionable completion claims backed by direct-call execution", () => {
    const artifact = projection();
    const validation = validateClaimProjection({
      claimProjection: artifact,
      expectedRequiredValidationRefs: expectedValidationRefs,
      requiredValidationStatuses: expectedValidationRefs.map((ref) => ({
        ref,
        status: "valid",
      })),
      executionProfileTruth: {
        reconstructRunManifestRef: "reconstruct-run-manifest.yaml",
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "direct_call",
      },
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });

  it("rejects claim projection without execution profile authority", () => {
    const artifact = projection();
    artifact.source_authority_refs = artifact.source_authority_refs.filter((ref) =>
      ref !== "reconstruct-run-manifest.yaml"
    );
    const validation = validateClaimProjection({
      claimProjection: artifact,
      expectedRequiredValidationRefs: expectedValidationRefs,
      requiredValidationStatuses: expectedValidationRefs.map((ref) => ({
        ref,
        status: "valid",
      })),
      executionProfileTruth: {
        reconstructRunManifestRef: "reconstruct-run-manifest.yaml",
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "direct_call",
      },
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("execution_profile_authority_missing");
  });

  it("rejects missing public projection surfaces", () => {
    const artifact = projection();
    artifact.projection_rows = artifact.projection_rows.filter((row) =>
      row.projection_surface !== "api"
    );
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("missing_required_surface");
  });

  it("rejects blocked rows without recovery or limitation refs", () => {
    const artifact = projection({ handoffStatus: "invalid" });
    artifact.projection_rows[0]!.limitation_refs = [];
    artifact.projection_rows[0]!.excluded_row_refs = [];
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("blocked_projection_missing_recovery_ref");
  });
});

describe("validateClaimProjection rejection branches", () => {
  function nonMaterialRow(artifact: ReturnType<typeof projection>) {
    return artifact.projection_rows.find((row) =>
      row.projection_surface !== "material_kind_support"
    )!;
  }

  function materialRow(artifact: ReturnType<typeof projection>) {
    return artifact.projection_rows.find((row) =>
      row.projection_surface === "material_kind_support"
    )!;
  }

  it("treats the base actionable-ready projection as valid before mutation", () => {
    const base = structuredClone(projection());
    const validation = validateClaimProjection({ claimProjection: base });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });

  it("rejects an unexpected schema_version (schema_shape_invalid)", () => {
    const artifact = structuredClone(projection());
    (artifact as { schema_version: string }).schema_version = "2";
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "schema_shape_invalid"))
      .toBe(true);
  });

  it("rejects duplicate projection ids (duplicate_id)", () => {
    const artifact = structuredClone(projection());
    artifact.projection_rows[1]!.projection_id =
      artifact.projection_rows[0]!.projection_id;
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "duplicate_id"))
      .toBe(true);
  });

  it("rejects an out-of-enum claim_level (invalid_enum)", () => {
    const artifact = structuredClone(projection());
    (nonMaterialRow(artifact) as { claim_level: string }).claim_level =
      "not_a_real_level";
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "invalid_enum"))
      .toBe(true);
  });

  it("rejects actionable_ready decision_state without ready actionability (decision_state_actionability_mismatch)", () => {
    const artifact = structuredClone(projection());
    nonMaterialRow(artifact).actionability_claim = "limited";
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) =>
        v.code === "decision_state_actionability_mismatch"
      ),
    ).toBe(true);
  });

  it("rejects an empty material-kind support member row set (member_capability_row_missing)", () => {
    const artifact = structuredClone(projection());
    materialRow(artifact).member_capability_rows = [];
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) => v.code === "member_capability_row_missing"),
    ).toBe(true);
  });

  it("rejects actionable_ready claim_level without actionable_ready decision_state (ready_projection_without_ready_decision)", () => {
    const artifact = structuredClone(projection());
    const row = nonMaterialRow(artifact);
    row.decision_state = "actionable_limited";
    row.actionability_claim = "limited";
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) =>
        v.code === "ready_projection_without_ready_decision"
      ),
    ).toBe(true);
  });

  it("rejects a row that cites no required validation refs (required_validation_ref_missing)", () => {
    const artifact = structuredClone(projection());
    nonMaterialRow(artifact).required_validation_refs = [];
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) => v.code === "required_validation_ref_missing"),
    ).toBe(true);
  });

  it("rejects an unbounded operated-system release-health governance scope (broader_governance_scope_unbounded)", () => {
    const artifact = structuredClone(projection());
    (nonMaterialRow(artifact).governance_scope as {
      operated_system_release_health: string;
    }).operated_system_release_health = "included";
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) =>
        v.code === "broader_governance_scope_unbounded"
      ),
    ).toBe(true);
  });

  it("rejects a row missing a bounded UX field (missing_required_field)", () => {
    const artifact = structuredClone(projection());
    nonMaterialRow(artifact).display_label = "";
    const validation = validateClaimProjection({ claimProjection: artifact });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "missing_required_field"))
      .toBe(true);
  });
});
