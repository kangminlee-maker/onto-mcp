import { describe, expect, it } from "vitest";
import {
  buildMaterialAdmissionLedgerFromSourcePurpose,
  validateMaterialAdmissionLedger,
} from "./material-admission-validation.js";
import type {
  ReconstructCandidateInventoryArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
} from "./artifact-types.js";

const evidenceRef = {
  observation_id: "obs-1",
  target_material_kind: "code" as const,
  source_ref: "/repo/src/app.ts",
  location: "line:1",
};

function sourceObservations(): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-06-02T00:00:00.000Z",
    observations: [
      {
        observation_id: "obs-1",
        target_material_kind: "code",
        source_ref: "/repo/src/app.ts",
        location: "line:1",
        summary: "The source shows a user action.",
        structural_data: {},
      },
    ],
    skipped_refs: [],
    validation_results: [],
  };
}

function sourcePurposeCandidates(): ReconstructSourcePurposeCandidatesArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-06-02T00:00:00.000Z",
    target_material_kind: "code",
    source_observations_ref: "source-observations.yaml",
    selected_source_profile_refs: [],
    purpose_candidates: [
      {
        purpose_candidate_id: "purpose-1",
        statement: "Understand operational decisions and actions.",
        rank: "primary",
        purpose_source_status: "convergent_inferred",
        evidence_kind_refs: ["P3", "P4"],
        supporting_evidence_refs: [evidenceRef],
        contradicting_source_refs: [],
        adequacy_frame: {
          frame_id: "frame-1",
          frame_kind: "service_operational",
          frame_status: "evidence_inferred",
          adequacy_claim: "The seed needs actionability surfaces.",
          material_kind_requirements: {
            target_material_kind: "code",
            required_facets: ["actor", "action"],
            optional_facets: [],
            rationale: "Actionability requires actor/action coverage.",
          },
          required_elements: [
            {
              element_id: "purpose-element-user-action",
              element_kind: "action",
              material_facet_kind: "kinetic_surface",
              description: "User-triggered action must be represented.",
              actionability_surface_refs: ["kinetic_surface"],
              maturity_dimension_refs: ["structure"],
              member_scope_refs: [],
              member_target_material_kind: null,
              member_source_refs: ["/repo/src/app.ts"],
              cross_material_ref_refs: [],
              supporting_evidence_refs: [evidenceRef],
              expected_seed_ref_families: ["action_type"],
              closure_expectation: "model_or_limit",
            },
          ],
        },
        ranking_rationale: "Fixture purpose.",
        limitation_refs: [],
      },
    ],
    selection: {
      primary_purpose_candidate_id: "purpose-1",
      selection_basis: "fixture",
      confirmation_policy_hint: "not_required",
      unresolved_reason: null,
    },
    directive_author: {
      owner: "host_llm",
      author_id: "fixture",
    },
  };
}

function sourcePurposeValidation(): ReconstructSourcePurposeCandidatesValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-06-02T00:00:00.000Z",
    source_purpose_candidates_ref: "source-purpose-candidates.yaml",
    source_observations_ref: "source-observations.yaml",
    registry_ref: "reconstruct-contract-registry.yaml",
    validation_status: "valid",
    selected_purpose_candidate_id: "purpose-1",
    selected_purpose_frame_id: "frame-1",
    confirmation_required: false,
    validation_results: ["source_purpose_candidates_valid"],
    asserted_obligation_ids: [],
    violations: [],
  };
}

function candidateInventory(): ReconstructCandidateInventoryArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-06-02T00:00:00.000Z",
    source_observations_ref: "source-observations.yaml",
    required_coverage_observation_ids: ["obs-1"],
    candidates: [
      {
        candidate_id: "candidate-user-action",
        candidate_kind: "action_candidate",
        name: "User Action",
        description: "A user-triggered action.",
        salience: "high",
        evidence_refs: [evidenceRef],
      },
    ],
    directive_author: {
      owner: "host_llm",
      author_id: "fixture",
    },
  };
}

function ontologySeed(): ReconstructOntologySeedArtifact {
  return {
    purpose: {
      purpose_adequacy_frame: {
        required_elements: [
          {
            element_id: "purpose-element-user-action",
            seed_ref_refs: ["action-user-action"],
            evidence_refs: [evidenceRef],
            limitation_refs: [],
          },
        ],
      },
    },
  };
}

function ontologySeedValidation(): ReconstructOntologySeedValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-06-02T00:00:00.000Z",
    ontology_seed_ref: "ontology-seed.yaml",
    candidate_disposition_ref: "candidate-disposition.yaml",
    source_observations_ref: "source-observations.yaml",
    registry_ref: "reconstruct-contract-registry.yaml",
    validation_status: "valid",
    seed_ref_count: 1,
    evidence_ref_count: 1,
    limitation_count: 0,
    validation_results: ["ontology_seed_valid"],
    violations: [],
  };
}

describe("material admission validation", () => {
  it("builds pre-seed purpose-element admission rows from selected purpose elements", () => {
    const ledger = buildMaterialAdmissionLedgerFromSourcePurpose({
      sessionId: "session-1",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: sourcePurposeValidation(),
    });

    expect(ledger.admission_rows).toHaveLength(1);
    expect(ledger.admission_rows[0]).toMatchObject({
      admission_phase: "pre_seed_purpose_element",
      input_kind: "purpose_adequacy_element",
      purpose_element_snapshot_ref:
        "source-purpose-candidates.yaml#purpose-element-user-action",
      value_snapshot_ref: null,
      disposition: "admitted_material",
      materiality: "blocker",
      purpose_element_refs: ["purpose-element-user-action"],
    });
  });

  it("passes when an admitted row is consumed by candidate and seed artifacts", () => {
    const ledger = buildMaterialAdmissionLedgerFromSourcePurpose({
      sessionId: "session-1",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: sourcePurposeValidation(),
    });
    const validation = validateMaterialAdmissionLedger({
      materialAdmissionLedger: ledger,
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: sourcePurposeValidation(),
      candidateInventory: candidateInventory(),
      ontologySeed: ontologySeed(),
      ontologySeedValidation: ontologySeedValidation(),
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.downstream_consumed_row_count).toBe(1);
  });

  it("fails when an admitted row has no downstream consumer", () => {
    const ledger = buildMaterialAdmissionLedgerFromSourcePurpose({
      sessionId: "session-1",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: sourcePurposeValidation(),
    });
    const validation = validateMaterialAdmissionLedger({
      materialAdmissionLedger: ledger,
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: sourcePurposeValidation(),
      candidateInventory: {
        ...candidateInventory(),
        candidates: [],
      },
      ontologySeed: { purpose: { purpose_adequacy_frame: { required_elements: [] } } },
      ontologySeedValidation: ontologySeedValidation(),
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("downstream_consumer_missing");
  });

  it("rejects diagnostic blocker rows with downstream actionability refs", () => {
    const ledger = buildMaterialAdmissionLedgerFromSourcePurpose({
      sessionId: "session-1",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: sourcePurposeValidation(),
    });
    ledger.admission_rows[0] = {
      ...ledger.admission_rows[0]!,
      disposition: "diagnostic_only",
    };
    const validation = validateMaterialAdmissionLedger({
      materialAdmissionLedger: ledger,
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: sourcePurposeValidation(),
      candidateInventory: candidateInventory(),
      ontologySeed: ontologySeed(),
      ontologySeedValidation: ontologySeedValidation(),
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("diagnostic_affects_actionability");
  });
});

describe("validateMaterialAdmissionLedger rejection branches", () => {
  function validBase() {
    const ledger = buildMaterialAdmissionLedgerFromSourcePurpose({
      sessionId: "session-1",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: sourcePurposeValidation(),
    });
    return {
      materialAdmissionLedger: ledger,
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: sourcePurposeValidation(),
      candidateInventory: candidateInventory(),
      ontologySeed: ontologySeed(),
      ontologySeedValidation: ontologySeedValidation(),
      sourceObservations: sourceObservations(),
    };
  }

  function clone<T>(value: T): T {
    return structuredClone(value);
  }

  function expectRejection(
    validation: ReturnType<typeof validateMaterialAdmissionLedger>,
    code: string,
  ): void {
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((violation) => violation.code === code))
      .toBe(true);
  }

  it("validates the reused base fixture cleanly", () => {
    const validation = validateMaterialAdmissionLedger(validBase());
    expect(validation.validation_status).toBe("valid");
  });

  it("rejects schema_version other than 1 (schema_shape_invalid)", () => {
    const base = clone(validBase());
    (base.materialAdmissionLedger as { schema_version: string }).schema_version = "2";
    expectRejection(validateMaterialAdmissionLedger(base), "schema_shape_invalid");
  });

  it("rejects invalid prior source-purpose validation (prior_validation_invalid)", () => {
    const base = clone(validBase());
    base.sourcePurposeCandidatesValidation.validation_status = "invalid";
    expectRejection(validateMaterialAdmissionLedger(base), "prior_validation_invalid");
  });

  it("rejects mismatched session_id between ledger and prior validation (session_id_mismatch)", () => {
    const base = clone(validBase());
    base.sourcePurposeCandidatesValidation.session_id = "session-other";
    expectRejection(validateMaterialAdmissionLedger(base), "session_id_mismatch");
  });

  it("rejects rows missing admission_id (missing_required_field)", () => {
    const base = clone(validBase());
    base.materialAdmissionLedger.admission_rows[0]!.admission_id = "";
    expectRejection(validateMaterialAdmissionLedger(base), "missing_required_field");
  });

  it("rejects duplicate admission_id across rows (duplicate_id)", () => {
    const base = clone(validBase());
    const row = clone(base.materialAdmissionLedger.admission_rows[0]!);
    base.materialAdmissionLedger.admission_rows.push(row);
    expectRejection(validateMaterialAdmissionLedger(base), "duplicate_id");
  });

  it("rejects an out-of-set enum value (invalid_enum)", () => {
    const base = clone(validBase());
    (base.materialAdmissionLedger.admission_rows[0]! as { materiality: string })
      .materiality = "catastrophic";
    expectRejection(validateMaterialAdmissionLedger(base), "invalid_enum");
  });

  it("rejects a phase/input_kind combination that is not allowed (invalid_phase_input_kind)", () => {
    const base = clone(validBase());
    // Keep purpose_adequacy_element input_kind but move it to the material-value phase.
    base.materialAdmissionLedger.admission_rows[0]!.admission_phase =
      "pre_seed_material_value";
    expectRejection(
      validateMaterialAdmissionLedger(base),
      "invalid_phase_input_kind",
    );
  });

  it("rejects a purpose_adequacy_element row missing its snapshot ref (missing_snapshot_ref)", () => {
    const base = clone(validBase());
    base.materialAdmissionLedger.admission_rows[0]!.purpose_element_snapshot_ref = null;
    expectRejection(validateMaterialAdmissionLedger(base), "missing_snapshot_ref");
  });

  it("rejects supersedes_admission_refs pointing at an unknown id (superseded_ref_unknown)", () => {
    const base = clone(validBase());
    base.materialAdmissionLedger.admission_rows[0]!.supersedes_admission_refs = [
      "material-admission:does-not-exist",
    ];
    expectRejection(validateMaterialAdmissionLedger(base), "superseded_ref_unknown");
  });

  it("rejects purpose_element_refs not in the selected purpose frame (unknown_purpose_element_ref)", () => {
    const base = clone(validBase());
    base.materialAdmissionLedger.admission_rows[0]!.purpose_element_refs = [
      "purpose-element-user-action",
      "purpose-element-not-selected",
    ];
    expectRejection(
      validateMaterialAdmissionLedger(base),
      "unknown_purpose_element_ref",
    );
  });

  it("rejects source_refs that resolve to no observed source (unknown_source_ref)", () => {
    const base = clone(validBase());
    base.materialAdmissionLedger.admission_rows[0]!.source_refs = [
      "/repo/src/app.ts",
      "/repo/src/not-observed.ts",
    ];
    expectRejection(validateMaterialAdmissionLedger(base), "unknown_source_ref");
  });

  it("rejects rejected_ambiguous rows without replayable evidence (rejected_without_replayable_evidence)", () => {
    const base = clone(validBase());
    const row = base.materialAdmissionLedger.admission_rows[0]!;
    row.disposition = "rejected_ambiguous";
    row.source_refs = [];
    row.limitation_refs = [];
    expectRejection(
      validateMaterialAdmissionLedger(base),
      "rejected_without_replayable_evidence",
    );
  });
});
