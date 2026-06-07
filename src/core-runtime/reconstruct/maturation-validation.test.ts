import { describe, expect, it } from "vitest";
import type {
  ReconstructActionabilityMatrixValidationArtifact,
  ReconstructAnswerSupportLedgerArtifact,
  ReconstructAnswerSupportLedgerValidationArtifact,
  ReconstructActionabilityMatrixArtifact,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructEvidenceRef,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationClosureFrontierValidationArtifact,
  ReconstructMaturationConvergenceLedgerValidationArtifact,
  ReconstructMaturationAnswerClaimsArtifact,
  ReconstructMaturationAnswerClaimsValidationArtifact,
  ReconstructMaturationQuestionFrontierValidationArtifact,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructOntologyExpansionArtifact,
  ReconstructOntologyExpansionValidationArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationDeltaArtifact,
  ReconstructSourceObservationDeltaValidationArtifact,
  ReconstructSourceObservationLineageIndexArtifact,
  ReconstructSourceObservationLineageIndexValidationArtifact,
  ReconstructSourceObservationReentryValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import {
  buildActionableOntologyArtifact,
  buildActionabilityMatrixArtifact,
  buildMaturationAuthorityResponseArtifact,
  buildMaturationBaselineArtifact,
  buildMaturationConvergenceLedgerArtifact,
  buildMaturationContinuationDecisionArtifact,
  buildMaturationSourceDeltaArtifact,
  validateAnswerSupportLedger,
  validateActionabilityMatrix,
  validateActionableOntology,
  validateMaturationAuthorityResponse,
  validateMaturationAnswerClaims,
  validateMaturationBaseline,
  validateMaturationClosureFrontier,
  validateMaturationConvergenceLedger,
  validateMaturationContinuationDecision,
  validateMaturationQuestionFrontier,
  validateMaturationSourceDelta,
  validateOntologyExpansion,
} from "./maturation-validation.js";
import {
  buildSourceSafetyLedgerFromSourceObservations,
  validateSourceSafetyLedger,
} from "./source-safety-validation.js";

const now = "2026-05-29T00:00:00.000Z";
const sourceRecordSha = "sha256-source-reconstruct-record";

const evidence: ReconstructEvidenceRef = {
  observation_id: "obs-code-1",
  target_material_kind: "code",
  source_ref: "src/feature.ts",
  location: "src/feature.ts",
};

function sourcePurposeCandidates(): ReconstructSourcePurposeCandidatesArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    target_material_kind: "code",
    source_observations_ref: "source-observations.yaml",
    selected_source_profile_refs: [],
    purpose_candidates: [
      {
        purpose_candidate_id: "purpose-feature",
        statement: "Explain the feature module as an operational ontology seed.",
        rank: "primary",
        purpose_source_status: "explicit_source_declared",
        evidence_kind_refs: ["P1", "P2"],
        supporting_evidence_refs: [evidence],
        contradicting_source_refs: [],
        adequacy_frame: {
          frame_id: "frame-feature",
          frame_kind: "operational_ontology_seed",
          frame_status: "source_declared",
          adequacy_claim: "Feature object and action are represented.",
          material_kind_requirements: {
            target_material_kind: "code",
            required_facets: ["object"],
            optional_facets: [],
            rationale: "Fixture.",
          },
          required_elements: [
            {
              element_id: "purpose-element-feature-object",
              element_kind: "object",
              material_facet_kind: "object",
              description: "Represent the feature object.",
              actionability_surface_refs: ["static_surface"],
              maturity_dimension_refs: ["structure"],
              member_scope_refs: [],
              member_target_material_kind: null,
              member_source_refs: [],
              cross_material_ref_refs: [],
              supporting_evidence_refs: [evidence],
              expected_seed_ref_families: ["semantic_layer.object_types"],
              closure_expectation: "model_or_limit",
            },
          ],
        },
        ranking_rationale: "Fixture.",
        limitation_refs: [],
      },
    ],
    selection: {
      primary_purpose_candidate_id: "purpose-feature",
      selection_basis: "Fixture.",
      confirmation_policy_hint: "Not required.",
      unresolved_reason: null,
    },
    directive_author: {
      owner: "host_llm",
      author_id: "test-author",
    },
  };
}

function ontologySeed(seedRefs = ["object-feature"]): ReconstructOntologySeedArtifact {
  return {
    purpose: {
      purpose_adequacy_frame: {
        required_elements: [
          {
            element_id: "purpose-element-feature-object",
            element_kind: "object",
            seed_ref_refs: seedRefs,
            evidence_refs: seedRefs.length > 0 ? [evidence] : [],
            limitation_refs: [],
          },
        ],
      },
    },
  };
}

function competencyQuestions(): ReconstructCompetencyQuestionsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    seed_confirmation_ref: "seed-confirmation.yaml",
    ontology_seed_ref: "ontology-seed.yaml",
    questions: [
      {
        question_id: "cq-feature-object",
        question: "Is the feature object represented?",
        linked_claim_ids: [],
        coverage_axis_refs: ["static_surface"],
        ontology_handoff_axis_refs: [],
        seed_ref_refs: ["object-feature"],
        limitation_refs: [],
        reasoning_or_formalism_facets: [],
        entity_identity_facets: [],
        instance_assertion_facets: [],
        terminology_facets: [],
        relation_type_facets: [],
        classification_facets: [],
        constraint_facets: [],
        modeling_concern_facets: [],
        domain_competency_trace_refs: [],
        reference_standard_refs: [],
        pattern_catalog_refs: [],
        query_access_contract_refs: [],
        visualization_contract_refs: [],
        graph_exploration_contract_refs: [],
        domain_competency_semantic_assessments: [],
        coverage_disposition: "covered",
        expected_answer_kind: "yes_no",
        handoff_relevance: "required",
        lifecycle_status: "active",
        rationale: "Fixture.",
        evidence_refs: [evidence],
      },
    ],
    open_questions: [],
    directive_author: {
      owner: "host_llm",
      author_id: "test-author",
    },
  };
}

function competencyAssessment(): ReconstructCompetencyQuestionAssessmentArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    competency_questions_ref: "competency-questions.yaml",
    competency_questions_validation_ref: "competency-questions-validation.yaml",
    assessments: [
      {
        question_id: "cq-feature-object",
        answer_status: "answerable",
        answer_summary: "The object is represented.",
        required_seed_refs: ["object-feature"],
        linked_claim_ids: [],
        evidence_refs: [evidence],
        missing_source_or_confirmation: null,
        ambiguity_notes: [],
        downstream_effect: "ready",
        rationale: "Fixture.",
      },
    ],
    directive_author: {
      owner: "host_llm",
      author_id: "test-author",
    },
  };
}

function validSourcePurposeValidation(): ReconstructSourcePurposeCandidatesValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    source_purpose_candidates_ref: "source-purpose-candidates.yaml",
    source_observations_ref: "source-observations.yaml",
    registry_ref: null,
    validation_status: "valid",
    selected_purpose_candidate_id: "purpose-feature",
    selected_purpose_frame_id: "frame-feature",
    confirmation_required: false,
    validation_results: ["valid"],
    violations: [],
  };
}

function validPurposeConfirmation(): ReconstructPurposeConfirmationValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    purpose_confirmation_ref: "purpose-confirmation.yaml",
    source_purpose_candidates_validation_ref:
      "source-purpose-candidates-validation.yaml",
    validation_status: "valid",
    purpose_projection_status: "usable",
    confirmed_purpose_candidate_id: "purpose-feature",
    confirmed_statement: "Explain the feature module as an operational ontology seed.",
    seed_readiness_effect: "may_project_ready_or_limited",
    validation_results: ["valid"],
    violations: [],
  };
}

function baseline(seedRefs = ["object-feature"]) {
  return buildMaturationBaselineArtifact({
    sessionId: "session-1",
    sourceSeedRef: "ontology-seed.yaml",
    sourceSeedValidationRef: "ontology-seed-validation.yaml",
    sourceClaimRealizationMapValidationRef: "claim-realization-map-validation.yaml",
    sourceCompetencyAssessmentRef: "competency-question-assessment.yaml",
    sourceCompetencyAssessmentValidationRef:
      "competency-question-assessment-validation.yaml",
    sourceReconstructRecordRef: "reconstruct-record.yaml",
    sourceRunManifestRef: "reconstruct-run-manifest.yaml",
    sourceHandoffDecisionValidationRef: "handoff-decision-validation.yaml",
    sourceMaterialAdmissionLedgerRef: "material-admission-ledger.yaml",
    sourceMaterialAdmissionValidationRef:
      "material-admission-ledger-validation.yaml",
    sourcePurposeCandidates: sourcePurposeCandidates(),
    sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
    sourcePurposeCandidatesValidationRef: "source-purpose-candidates-validation.yaml",
    purposeConfirmationValidation: validPurposeConfirmation(),
    purposeConfirmationValidationRef: "purpose-confirmation-validation.yaml",
    ontologySeed: ontologySeed(seedRefs),
    ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
    claimRealizationMapValidationRef: "claim-realization-map-validation.yaml",
    competencyQuestions: competencyQuestions(),
    competencyQuestionAssessment: competencyAssessment(),
    handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
  });
}

function validTargetMaterialProfileValidation(): ReconstructTargetMaterialProfileValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    target_material_profile_ref: "target-material-profile.yaml",
    registry_ref: null,
    validation_status: "valid",
    target_ref_count: 1,
    selected_source_profile_count: 1,
    validation_results: ["valid"],
    violations: [],
  };
}

function sourceInventory(refs = ["src/feature.ts"]): ReconstructSourceInventoryArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    inventory_units: refs.map((ref) => ({
      ref,
      exists: true,
      target_material_kind: "code",
      inventory_unit: "file",
      profile_ref: "code.v1",
      scan_status: "planned",
      skip_reason: null,
    })),
    scan_boundary: {
      filesystem_allowed_roots: ["."],
      source: "binding",
    },
  };
}

function sourceObservations(refs = ["src/feature.ts"]): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    observations: refs.map((ref, index) => ({
      observation_id: `obs-code-${index + 1}`,
      target_material_kind: "code",
      adapter_id: "code-structure-observer",
      source_ref: ref,
      location: ref,
      summary: "Runtime structural observation.",
      structural_data: {
        path: ref,
        source_safety_consumption_authorizations: [
          "public_output",
          "material_claim",
        ],
      },
    })),
    skipped_refs: [],
    validation_results: ["valid"],
  };
}

function sourceSafetyAuthority(
  observations = sourceObservations(["src/feature.ts"]),
) {
  const sourceSafetyLedger = buildSourceSafetyLedgerFromSourceObservations({
    sourceObservations: observations,
    sourceObservationsRef: "source-observations.yaml",
  });
  const sourceSafetyLedgerValidation = validateSourceSafetyLedger({
    sourceSafetyLedger,
    sourceSafetyLedgerRef: "source-safety-ledger.yaml",
    sourceObservations: observations,
    sourceObservationsRef: "source-observations.yaml",
  });
  return {
    sourceSafetyLedger,
    sourceSafetyLedgerRef: "source-safety-ledger.yaml",
    sourceSafetyLedgerValidation,
    sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
  };
}

function sourceObservationDelta(
  observationIds = ["obs-code-1"],
): ReconstructSourceObservationDeltaArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    round_id: "maturation-round-1",
    created_at: now,
    frontier_kind: "maturation_closure_frontier",
    frontier_ref: "maturation-closure-frontier.yaml",
    frontier_validation_ref: "maturation-closure-frontier-validation.yaml",
    source_inventory_ref: "source-inventory.yaml",
    previous_source_observations_ref: "source-observations.before.yaml",
    source_observations_ref: "source-observations.yaml",
    accepted_frontier_ref_ids: observationIds.map((id) =>
      `source-request-${id}`
    ),
    added_observation_ids: observationIds,
    delta_rows: observationIds.map((id, index) => ({
      delta_row_id: `delta-row-${id}`,
      frontier_ref_id: `source-request-${id}`,
      observation_id: id,
      source_ref: `src/feature-${index + 1}.ts`,
      target_material_kind: "code",
      observation_hash: `sha256-${id}`,
    })),
  };
}

function sourceObservationReentryValidation(
  validationStatus: "valid" | "invalid" = "valid",
  reenteredObservationIds = ["obs-code-1"],
): ReconstructSourceObservationReentryValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    round_id: "maturation-round-1",
    created_at: now,
    source_observation_delta_validation_ref:
      "source-observation-delta-validation.yaml",
    source_safety_ledger_validation_ref:
      "source-safety-ledger-validation.yaml",
    source_observations_ref: "source-observations.yaml",
    validation_status: validationStatus,
    reentered_observation_ids: validationStatus === "valid"
      ? reenteredObservationIds
      : [],
    validation_results: [
      validationStatus === "valid"
        ? "source_observation_reentry_valid"
        : "source_observation_reentry_invalid",
    ],
    violations: validationStatus === "valid"
      ? []
      : [{
        code: "delta_observation_missing_safety_row",
        message: "fixture invalid re-entry validation",
        subject_id: "obs-code-1",
      }],
  };
}

function sourceObservationLineageIndex(
  observationIds = ["obs-code-1"],
): ReconstructSourceObservationLineageIndexArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    lineage_rows: [{
      lineage_row_id: "lineage-row-maturation-round-1",
      round_id: "maturation-round-1",
      frontier_kind: "maturation_closure_frontier",
      source_observation_delta_ref: "source-observation-delta.yaml",
      source_observation_delta_validation_ref:
        "source-observation-delta-validation.yaml",
      source_observation_reentry_validation_ref:
        "source-observation-reentry-validation.yaml",
      added_observation_ids: observationIds,
    }],
  };
}

function sourceObservationLineageIndexValidation(
  validationStatus: "valid" | "invalid" = "valid",
): ReconstructSourceObservationLineageIndexValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    source_observation_lineage_index_ref:
      "source-observation-lineage-index.yaml",
    source_observations_ref: "source-observations.yaml",
    validation_status: validationStatus,
    lineage_row_count: 1,
    added_observation_count: validationStatus === "valid" ? 1 : 0,
    validation_results: [
      validationStatus === "valid"
        ? "source_observation_lineage_index_valid"
        : "source_observation_lineage_index_invalid",
    ],
    violations: validationStatus === "valid"
      ? []
      : [{
        code: "lineage_delta_validation_invalid",
        message: "fixture invalid lineage validation",
        subject_id: "source-observation-delta-validation.yaml",
      }],
  };
}

function frontierScenario() {
  const maturationBaseline = baseline([]);
  const baselineValidation = validateMaturationBaseline({
    maturationBaseline,
    maturationBaselineRef: "maturation-baseline.yaml",
    sourcePurposeCandidates: sourcePurposeCandidates(),
    sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
    purposeConfirmationValidation: validPurposeConfirmation(),
    ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
    competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
    handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
    sourceReconstructRecordSha256: sourceRecordSha,
  });
  const matrix = buildActionabilityMatrixArtifact({
    sessionId: "session-1",
    maturationBaseline,
    maturationBaselineRef: "maturation-baseline.yaml",
    maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
  });
  const matrixValidation = validateActionabilityMatrix({
    actionabilityMatrix: matrix,
    actionabilityMatrixRef: "actionability-matrix.yaml",
    maturationBaseline,
    maturationBaselineValidation: baselineValidation,
    maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
  });
  const row = matrix.rows[0]!;
  const frontier: ReconstructMaturationQuestionFrontierArtifact = {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    maturation_baseline_ref: "maturation-baseline.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    actionability_matrix_ref: "actionability-matrix.yaml",
    actionability_matrix_validation_ref: "actionability-matrix-validation.yaml",
    questions: [
      {
        question_id: "mq-feature-object",
        question: "What source evidence closes the feature object?",
        materiality: row.materiality,
        materiality_ref: row.materiality_ref,
        actionability_surface_refs: [row.actionability_surface_ref],
        maturity_dimension_refs: [row.maturity_dimension_ref],
        purpose_element_refs: [row.purpose_element_ref],
        baseline_row_refs: row.baseline_row_refs,
        competency_question_refs: row.competency_question_refs,
        competency_assessment_refs: row.competency_assessment_refs,
        domain_competency_trace_refs: [],
        seed_ref_refs: [],
        current_answer_status: "unsupported",
        expected_answer_kind: "explanation",
        evidence_needed: "Concrete source evidence or authority.",
        authority_need: {
          authority_kind: "none",
          authority_scope: null,
          blocking_if_unavailable: false,
          expected_response_kind: "unavailable_reason",
        },
        closure_frontier_hint_refs: ["src/feature.ts"],
        limitation_refs: [],
      },
    ],
    directive_author: {
      owner: "host_llm",
      author_id: "test-author",
    },
  };
  const frontierValidation = validateMaturationQuestionFrontier({
    maturationQuestionFrontier: frontier,
    maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
    maturationBaseline,
    maturationBaselineValidation: baselineValidation,
    maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    actionabilityMatrix: matrix,
    actionabilityMatrixValidation: matrixValidation,
    actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
  });

  return {
    maturationBaseline,
    baselineValidation,
    matrix,
    matrixValidation,
    frontier,
    frontierValidation,
  };
}

function emptyAnswerSupportValidation(): ReconstructAnswerSupportLedgerValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    answer_support_ledger_ref: "answer-support-ledger.yaml",
    maturation_question_frontier_validation_ref:
      "maturation-question-frontier-validation.yaml",
    source_observation_delta_ref: null,
    source_observation_lineage_index_ref: null,
    source_observation_lineage_index_validation_ref: null,
    source_observation_reentry_validation_ref: null,
    source_safety_ledger_validation_ref: null,
    maturation_authority_response_validation_ref:
      "maturation-authority-response-validation.yaml",
    validation_status: "valid",
    evidence_cluster_count: 0,
    supported_question_count: 0,
    validation_results: ["answer_support_ledger_valid"],
    violations: [],
  };
}

function emptyAnswerSupportLedger(): ReconstructAnswerSupportLedgerArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    round_id: "maturation-round-1",
    evidence_clusters: [],
    directive_author: {
      owner: "host_llm",
      author_id: "test-author",
    },
  };
}

function emptyMaturationAnswerClaims(): ReconstructMaturationAnswerClaimsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    round_id: "maturation-round-1",
    answer_claims: [],
    directive_author: {
      owner: "host_llm",
      author_id: "test-author",
    },
  };
}

function answerClaimsForRow(
  row: ReconstructActionabilityMatrixArtifact["rows"][number],
): ReconstructMaturationAnswerClaimsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    round_id: "maturation-round-1",
    answer_claims: [
      {
        answer_claim_id: "answer-claim-feature-object",
        question_id: "mq-feature-object",
        answer: "The source evidence closes the feature object for this purpose.",
        answer_status: "answered",
        support_mode: "direct_authority",
        evidence_cluster_refs: ["cluster-feature-object"],
        supporting_evidence_refs: [evidence],
        target_surface_refs: [row.actionability_surface_ref],
        target_dimension_refs: [row.maturity_dimension_ref],
        purpose_element_refs: [row.purpose_element_ref],
        limitation_refs: [],
      },
    ],
    directive_author: {
      owner: "host_llm",
      author_id: "test-author",
    },
  };
}

function answerClaimsValidation(
  answerClaimCount = 1,
): ReconstructMaturationAnswerClaimsValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    maturation_answer_claims_ref: "maturation-answer-claims.yaml",
    answer_support_ledger_validation_ref: "answer-support-ledger-validation.yaml",
    maturation_question_frontier_validation_ref:
      "maturation-question-frontier-validation.yaml",
    validation_status: "valid",
    answer_claim_count: answerClaimCount,
    answered_question_count: answerClaimCount,
    validation_results: ["maturation_answer_claims_valid"],
    violations: [],
  };
}

function emptyOntologyExpansion(): ReconstructOntologyExpansionArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    answer_claims_ref: "maturation-answer-claims.yaml",
    source_seed_ref: "ontology-seed.yaml",
    expansions: [],
    directive_author: {
      owner: "host_llm",
      author_id: "test-author",
    },
  };
}

function ontologyExpansionForRow(
  row: ReconstructActionabilityMatrixArtifact["rows"][number],
): ReconstructOntologyExpansionArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    answer_claims_ref: "maturation-answer-claims.yaml",
    source_seed_ref: "ontology-seed.yaml",
    expansions: [
      {
        expansion_id: "expansion-feature-object",
        operation: "add",
        target_surface_refs: [row.actionability_surface_ref],
        target_dimension_refs: [row.maturity_dimension_ref],
        target_seed_or_ontology_refs: row.baseline_row_refs,
        purpose_element_refs: [row.purpose_element_ref],
        answer_claim_refs: ["answer-claim-feature-object"],
        evidence_refs: [evidence],
        concept_economy_effect: "preserves_surface",
        rationale:
          "The validated answer claim adds the missing semantic support for this row.",
        limitation_refs: [],
      },
    ],
    directive_author: {
      owner: "host_llm",
      author_id: "test-author",
    },
  };
}

function emptyOntologyExpansionValidation(): ReconstructOntologyExpansionValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    ontology_expansion_ref: "ontology-expansion.yaml",
    maturation_answer_claims_validation_ref: "maturation-answer-claims-validation.yaml",
    validation_status: "valid",
    expansion_count: 0,
    operation_counts: {
      add: 0,
      refine: 0,
      defer: 0,
      reject: 0,
    },
    validation_results: ["ontology_expansion_valid"],
    violations: [],
  };
}

function ontologyExpansionValidation(
  expansionCount = 1,
): ReconstructOntologyExpansionValidationArtifact {
  return {
    ...emptyOntologyExpansionValidation(),
    expansion_count: expansionCount,
    operation_counts: {
      add: expansionCount,
      refine: 0,
      defer: 0,
      reject: 0,
    },
  };
}

function emptyConvergenceLedgerValidation(): ReconstructMaturationConvergenceLedgerValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    maturation_convergence_ledger_ref: "maturation-convergence-ledger.yaml",
    maturation_source_delta_validation_ref:
      "maturation-source-delta-validation.yaml",
    maturation_question_frontier_validation_ref:
      "maturation-question-frontier-validation.yaml",
    actionability_matrix_validation_ref: "actionability-matrix-validation.yaml",
    answer_support_ledger_validation_ref: "answer-support-ledger-validation.yaml",
    maturation_answer_claims_validation_ref:
      "maturation-answer-claims-validation.yaml",
    ontology_expansion_validation_ref: "ontology-expansion-validation.yaml",
    validation_status: "valid",
    closure_row_count: 0,
    remaining_frontier_count: 0,
    final_requestion_pass_status: "not_run",
    validation_results: ["maturation_convergence_ledger_valid"],
    violations: [],
  };
}

describe("maturation validation", () => {
  it("projects L4 baseline rows from seed refs and answerable competency assessment", () => {
    const maturationBaseline = baseline();
    const validation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });

    expect(maturationBaseline.baseline_rows[0]?.maturity_level)
      .toBe("L4_validated_for_purpose");
    expect(maturationBaseline.baseline_rows[0]?.materiality_ref)
      .toBe("material-admission:pre_seed_purpose_element:purpose-element-feature-object");
    expect(validation.validation_status).toBe("valid");
    expect(validation.source_reconstruct_record_sha256).toBe(sourceRecordSha);
  });

  it("rejects a maturation baseline whose source reconstruct record is not hashed", () => {
    const maturationBaseline = baseline();
    const validation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: null,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("source_reconstruct_record_missing");
  });

  it("rejects baseline materiality refs that bypass material admission authority", () => {
    const maturationBaseline = baseline();
    maturationBaseline.baseline_rows[0] = {
      ...maturationBaseline.baseline_rows[0]!,
      materiality_ref: "source-purpose-candidates.yaml#purpose-element-feature-object",
    };
    const validation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("missing_required_ref");
  });

  it("projects unmodeled material rows into actionability frontier requirements", () => {
    const maturationBaseline = baseline([]);
    const baselineValidation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const matrixValidation = validateActionabilityMatrix({
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });

    expect(matrix.rows[0]?.member_readiness).toBe("frontier_required");
    expect(matrixValidation.frontier_required_row_count).toBe(1);
    expect(matrixValidation.validation_status).toBe("valid");
  });

  it("keeps material L3 answer-supported rows frontier-required until expansion validates them for purpose", () => {
    const maturationBaseline = baseline([]);
    const baselineValidation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });
    const initialMatrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const answerClaims = answerClaimsForRow(initialMatrix.rows[0]!);
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsValidation: answerClaimsValidation(),
      maturationAnswerClaimsValidationRef:
        "maturation-answer-claims-validation.yaml",
      ontologyExpansion: emptyOntologyExpansion(),
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
    });
    const matrixValidation = validateActionabilityMatrix({
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsValidation: answerClaimsValidation(),
      maturationAnswerClaimsValidationRef:
        "maturation-answer-claims-validation.yaml",
      ontologyExpansion: emptyOntologyExpansion(),
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
    });

    expect(matrix.rows[0]?.maturity_level).toBe("L3_evidenced");
    expect(matrix.rows[0]?.member_readiness).toBe("frontier_required");
    expect(matrixValidation.validation_status).toBe("valid");
  });

  it("raises material rows to L4 closed only from validated answer claims and ontology expansion", () => {
    const maturationBaseline = baseline([]);
    const baselineValidation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });
    const initialMatrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const answerClaims = answerClaimsForRow(initialMatrix.rows[0]!);
    const ontologyExpansion = ontologyExpansionForRow(initialMatrix.rows[0]!);
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsValidation: answerClaimsValidation(),
      maturationAnswerClaimsValidationRef:
        "maturation-answer-claims-validation.yaml",
      ontologyExpansion,
      ontologyExpansionValidation: ontologyExpansionValidation(),
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
    });
    const matrixValidation = validateActionabilityMatrix({
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsValidation: answerClaimsValidation(),
      maturationAnswerClaimsValidationRef:
        "maturation-answer-claims-validation.yaml",
      ontologyExpansion,
      ontologyExpansionValidation: ontologyExpansionValidation(),
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
    });

    expect(matrix.rows[0]?.maturity_level).toBe("L4_validated_for_purpose");
    expect(matrix.rows[0]?.member_readiness).toBe("closed");
    expect(matrix.rows[0]?.supporting_refs).toEqual(
      expect.arrayContaining([
        "maturation-answer-claims-validation.yaml",
        "ontology-expansion-validation.yaml",
        "answer-claim-feature-object",
        "expansion-feature-object",
      ]),
    );
    expect(matrixValidation.validation_status).toBe("valid");
  });

  it("rejects a question frontier that omits material frontier-required rows", () => {
    const maturationBaseline = baseline([]);
    const baselineValidation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });
    const matrix: ReconstructActionabilityMatrixArtifact =
      buildActionabilityMatrixArtifact({
        sessionId: "session-1",
        maturationBaseline,
        maturationBaselineRef: "maturation-baseline.yaml",
        maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      });
    const matrixValidation = validateActionabilityMatrix({
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const frontier: ReconstructMaturationQuestionFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      maturation_baseline_ref: "maturation-baseline.yaml",
      maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
      actionability_matrix_ref: "actionability-matrix.yaml",
      actionability_matrix_validation_ref: "actionability-matrix-validation.yaml",
      questions: [],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };

    const validation = validateMaturationQuestionFrontier({
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("missing_required_coverage");
  });

  it("rejects closure source requests for already observed source refs", () => {
    const { frontier, frontierValidation } = frontierScenario();
    expect(frontierValidation.validation_status).toBe("valid");
    const closureFrontier: ReconstructMaturationClosureFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: [
        {
          source_request_id: "source-request-observed",
          question_refs: ["mq-feature-object"],
          member_scope_refs: [],
          member_source_refs: [],
          cross_material_ref_refs: [],
          requested_source_ref: "src/feature.ts",
          requested_location: "src/feature.ts",
          target_material_kind: "code",
          expected_evidence_kind: "additional structural evidence",
          reason: "The request repeats an already observed source.",
        },
      ],
      authority_requests: [],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };

    const validation = validateMaturationClosureFrontier({
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierRef: "maturation-closure-frontier.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceInventory: sourceInventory(["src/feature.ts"]),
      sourceInventoryRef: "source-inventory.yaml",
      sourceObservations: sourceObservations(["src/feature.ts"]),
      sourceObservationsRef: "source-observations.yaml",
      targetMaterialProfileValidation: validTargetMaterialProfileValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.accepted_source_request_ids).toEqual([]);
    expect(validation.rejected_source_requests).toEqual([
      expect.objectContaining({
        source_request_id: "source-request-observed",
        reason: expect.stringContaining("already_observed_source_ref"),
      }),
    ]);
  });

  it("rejects answer support that cites deferred authority responses", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const closureFrontier: ReconstructMaturationClosureFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: [],
      authority_requests: [
        {
          authority_request_id: "authority-request-feature-owner",
          question_refs: ["mq-feature-object"],
          authority_kind: "user",
          authority_scope: "feature owner",
          request_summary: "Confirm the feature object semantics.",
          request_rationale: "The source does not close the material question.",
          blocking_if_unavailable: true,
          expected_response_kind: "confirmation",
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };
    const closureValidation = validateMaturationClosureFrontier({
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierRef: "maturation-closure-frontier.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceInventory: sourceInventory(["src/feature.ts"]),
      sourceInventoryRef: "source-inventory.yaml",
      sourceObservations: sourceObservations(["src/feature.ts"]),
      sourceObservationsRef: "source-observations.yaml",
      targetMaterialProfileValidation: validTargetMaterialProfileValidation(),
    });
    const authorityResponse = buildMaturationAuthorityResponseArtifact({
      sessionId: "session-1",
      closureFrontier,
      closureFrontierRef: "maturation-closure-frontier.yaml",
    });
    const authorityResponseValidation = validateMaturationAuthorityResponse({
      maturationAuthorityResponse: authorityResponse,
      maturationAuthorityResponseRef: "maturation-authority-response.yaml",
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
    });
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [
        {
          evidence_cluster_id: "cluster-deferred-authority",
          question_refs: ["mq-feature-object"],
          support_mode: "authority_response",
          proposed_answer_summary:
            "This should not be accepted because authority response is deferred.",
          evidence_refs: [],
          proof_refs: [],
          user_confirmation_refs: [],
          authority_response_refs: [
            authorityResponse.responses[0]!.authority_response_id,
          ],
          independence_basis: "single deferred authority response",
          contradiction_refs: [],
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };

    const validation = validateAnswerSupportLedger({
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: sourceObservations(["src/feature.ts"]),
      maturationAuthorityResponse: authorityResponse,
      maturationAuthorityResponseValidation: authorityResponseValidation,
      maturationAuthorityResponseValidationRef:
        "maturation-authority-response-validation.yaml",
    });

    expect(closureValidation.validation_status).toBe("valid");
    expect(authorityResponseValidation.validation_status).toBe("valid");
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("support_mode_missing_authority");
  });

  it("requires valid source observation re-entry validation before answer support can consume new source evidence", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const observations = sourceObservations(["src/feature.ts"]);
    const safety = sourceSafetyAuthority(observations);
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [
        {
          evidence_cluster_id: "cluster-source-evidence",
          question_refs: ["mq-feature-object"],
          support_mode: "direct_authority",
          proposed_answer_summary: "Observed source supports the feature object.",
          evidence_refs: [evidence],
          proof_refs: [],
          user_confirmation_refs: [],
          authority_response_refs: [],
          independence_basis: "single direct source authority",
          contradiction_refs: [],
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };

    const validation = validateAnswerSupportLedger({
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: observations,
      sourceObservationReentryValidation:
        sourceObservationReentryValidation("invalid"),
      sourceObservationReentryValidationRef:
        "source-observation-reentry-validation.yaml",
      ...safety,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.source_observation_reentry_validation_ref)
      .toBe("source-observation-reentry-validation.yaml");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("prior_validation_invalid");
  });

  it("fails closed when source-backed answer support omits source-safety authority", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [
        {
          evidence_cluster_id: "cluster-source-evidence",
          question_refs: ["mq-feature-object"],
          support_mode: "direct_authority",
          proposed_answer_summary: "Observed source supports the feature object.",
          evidence_refs: [evidence],
          proof_refs: [],
          user_confirmation_refs: [],
          authority_response_refs: [],
          independence_basis: "single direct source authority",
          contradiction_refs: [],
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };

    const validation = validateAnswerSupportLedger({
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: sourceObservations(["src/feature.ts"]),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toEqual(expect.arrayContaining([
        "missing_required_ref",
        "prior_validation_invalid",
      ]));
  });

  it("requires lineage authority when source-backed evidence carries lineage metadata", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const observations = sourceObservations(["src/feature.ts"]);
    observations.observations[0] = {
      ...observations.observations[0]!,
      round_id: "maturation-round-1",
      observation_batch_id: "batch-1",
      triggering_frontier_validation_ref: "source-frontier-validation.yaml",
    };
    const safety = sourceSafetyAuthority(observations);
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [
        {
          evidence_cluster_id: "cluster-source-evidence",
          question_refs: ["mq-feature-object"],
          support_mode: "direct_authority",
          proposed_answer_summary: "Observed source supports the feature object.",
          evidence_refs: [evidence],
          proof_refs: [],
          user_confirmation_refs: [],
          authority_response_refs: [],
          independence_basis: "single direct source authority",
          contradiction_refs: [],
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };

    const validation = validateAnswerSupportLedger({
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: observations,
      ...safety,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toEqual(expect.arrayContaining([
        "missing_required_ref",
        "prior_validation_invalid",
      ]));
  });

  it("requires valid lineage index validation before answer support can consume lineage-indexed evidence", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const observations = sourceObservations(["src/feature.ts"]);
    const safety = sourceSafetyAuthority(observations);
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [
        {
          evidence_cluster_id: "cluster-source-evidence",
          question_refs: ["mq-feature-object"],
          support_mode: "direct_authority",
          proposed_answer_summary: "Observed source supports the feature object.",
          evidence_refs: [evidence],
          proof_refs: [],
          user_confirmation_refs: [],
          authority_response_refs: [],
          independence_basis: "single direct source authority",
          contradiction_refs: [],
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };

    const missingValidation = validateAnswerSupportLedger({
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: observations,
      sourceObservationLineageIndex: sourceObservationLineageIndex(),
      sourceObservationLineageIndexRef: "source-observation-lineage-index.yaml",
      sourceObservationReentryValidations: [{
        ref: "source-observation-reentry-validation.yaml",
        validation: sourceObservationReentryValidation("valid"),
      }],
      ...safety,
    });
    const invalidValidation = validateAnswerSupportLedger({
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: observations,
      sourceObservationLineageIndex: sourceObservationLineageIndex(),
      sourceObservationLineageIndexRef: "source-observation-lineage-index.yaml",
      sourceObservationLineageIndexValidation:
        sourceObservationLineageIndexValidation("invalid"),
      sourceObservationLineageIndexValidationRef:
        "source-observation-lineage-index-validation.yaml",
      sourceObservationReentryValidations: [{
        ref: "source-observation-reentry-validation.yaml",
        validation: sourceObservationReentryValidation("valid"),
      }],
      ...safety,
    });

    expect(missingValidation.validation_status).toBe("invalid");
    expect(missingValidation.violations.map((violation) => violation.code))
      .toContain("prior_validation_invalid");
    expect(invalidValidation.validation_status).toBe("invalid");
    expect(invalidValidation.source_observation_lineage_index_validation_ref)
      .toBe("source-observation-lineage-index-validation.yaml");
    expect(invalidValidation.violations.map((violation) => violation.code))
      .toContain("prior_validation_invalid");
  });

  it("rejects lineage validation that does not validate the consumed lineage index ref", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const observations = sourceObservations(["src/feature.ts"]);
    observations.observations[0] = {
      ...observations.observations[0]!,
      round_id: "maturation-round-1",
      observation_batch_id: "batch-1",
      triggering_frontier_validation_ref: "source-frontier-validation.yaml",
    };
    const safety = sourceSafetyAuthority(observations);
    const mismatchedLineageValidation = {
      ...sourceObservationLineageIndexValidation("valid"),
      source_observation_lineage_index_ref:
        "other-source-observation-lineage-index.yaml",
    };
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [
        {
          evidence_cluster_id: "cluster-source-evidence",
          question_refs: ["mq-feature-object"],
          support_mode: "direct_authority",
          proposed_answer_summary: "Observed source supports the feature object.",
          evidence_refs: [evidence],
          proof_refs: [],
          user_confirmation_refs: [],
          authority_response_refs: [],
          independence_basis: "single direct source authority",
          contradiction_refs: [],
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };

    const validation = validateAnswerSupportLedger({
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
      sourceObservationLineageIndex: sourceObservationLineageIndex(),
      sourceObservationLineageIndexRef: "source-observation-lineage-index.yaml",
      sourceObservationLineageIndexValidation: mismatchedLineageValidation,
      sourceObservationLineageIndexValidationRef:
        "source-observation-lineage-index-validation.yaml",
      sourceObservationReentryValidations: [{
        ref: "source-observation-reentry-validation.yaml",
        validation: sourceObservationReentryValidation("valid"),
      }],
      ...safety,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("prior_validation_invalid");
  });

  it("rejects answer support that consumes a delta observation missing from re-entry-approved ids", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const observations = sourceObservations(["src/feature.ts"]);
    const safety = sourceSafetyAuthority(observations);
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [
        {
          evidence_cluster_id: "cluster-source-evidence",
          question_refs: ["mq-feature-object"],
          support_mode: "direct_authority",
          proposed_answer_summary:
            "Observed source supports the feature object.",
          evidence_refs: [evidence],
          proof_refs: [],
          user_confirmation_refs: [],
          authority_response_refs: [],
          independence_basis: "single direct source authority",
          contradiction_refs: [],
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };

    const validation = validateAnswerSupportLedger({
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: observations,
      sourceObservationDelta: sourceObservationDelta(["obs-code-1"]),
      sourceObservationDeltaRef: "source-observation-delta.yaml",
      sourceObservationLineageIndex: sourceObservationLineageIndex([
        "obs-code-1",
      ]),
      sourceObservationLineageIndexRef: "source-observation-lineage-index.yaml",
      sourceObservationLineageIndexValidation:
        sourceObservationLineageIndexValidation("valid"),
      sourceObservationLineageIndexValidationRef:
        "source-observation-lineage-index-validation.yaml",
      sourceObservationReentryValidations: [{
        ref: "source-observation-reentry-validation.yaml",
        validation: sourceObservationReentryValidation("valid", ["obs-code-2"]),
      }],
      sourceObservationReentryValidation:
        sourceObservationReentryValidation("valid", ["obs-code-2"]),
      sourceObservationReentryValidationRef:
        "source-observation-reentry-validation.yaml",
      ...safety,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("missing_required_ref");
  });

  it("does not close material questions with frontier hints as answer support", () => {
    const { frontier, frontierValidation, matrix, matrixValidation } =
      frontierScenario();
    const answerSupportLedger = emptyAnswerSupportLedger();
    const answerSupportValidation = emptyAnswerSupportValidation();
    const answerClaims = emptyMaturationAnswerClaims();
    const answerClaimsValidation = validateMaturationAnswerClaims({
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsRef: "maturation-answer-claims.yaml",
      answerSupportLedger,
      answerSupportLedgerValidation: answerSupportValidation,
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
    });
    const ontologyExpansion = emptyOntologyExpansion();
    const ontologyExpansionValidation = validateOntologyExpansion({
      ontologyExpansion,
      ontologyExpansionRef: "ontology-expansion.yaml",
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsValidation: answerClaimsValidation,
      maturationAnswerClaimsValidationRef:
        "maturation-answer-claims-validation.yaml",
    });
    const ledger = buildMaturationConvergenceLedgerArtifact({
      sessionId: "session-1",
      roundId: "maturation-round-1",
      sourceObservationDelta: sourceObservationDelta(["obs-code-1"]),
      sourceObservationDeltaValidationRef:
        "source-observation-delta-validation.yaml",
      maturationSourceDeltaValidationRef:
        "maturation-source-delta-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationClosureFrontier: {
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        round_id: "maturation-round-1",
        question_frontier_ref: "maturation-question-frontier.yaml",
        source_requests: [],
        authority_requests: [],
        directive_author: {
          owner: "host_llm",
          author_id: "test-author",
        },
      },
      answerSupportLedger,
      maturationAnswerClaims: answerClaims,
      ontologyExpansion,
    });
    const validation = validateMaturationConvergenceLedger({
      maturationConvergenceLedger: ledger,
      maturationConvergenceLedgerRef: "maturation-convergence-ledger.yaml",
      sourceObservationDelta: sourceObservationDelta(["obs-code-1"]),
      sourceObservationDeltaRef: "source-observation-delta.yaml",
      sourceObservationDeltaValidationRef:
        "source-observation-delta-validation.yaml",
      maturationSourceDeltaValidationRef:
        "maturation-source-delta-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      answerSupportLedger,
      answerSupportLedgerValidation: answerSupportValidation,
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsValidation: answerClaimsValidation,
      maturationAnswerClaimsValidationRef:
        "maturation-answer-claims-validation.yaml",
      ontologyExpansion,
      ontologyExpansionValidation,
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
    });

    expect(ledger.rounds[0]?.closure_rows[0]?.supporting_refs)
      .toContain("src/feature.ts");
    expect(ledger.rounds[0]?.closure_rows[0]?.closure_disposition)
      .toBe("blocked_unavailable");
    expect(ledger.rounds[0]?.final_requestion_pass).toMatchObject({
      generated_question_refs: ["mq-feature-object"],
      new_material_question_refs: ["mq-feature-object"],
      pass_status: "material_question_found",
    });
    expect(ledger.rounds[0]?.source_observation_closure_rows[0])
      .toMatchObject({
        observation_id: "obs-code-1",
        delta_row_id: "delta-row-obs-code-1",
        closure_disposition: "trace_audit_only",
      });
    expect(ledger.rounds[0]?.maturation_source_delta_validation_ref)
      .toBe("maturation-source-delta-validation.yaml");
    expect(validation.maturation_source_delta_validation_ref)
      .toBe("maturation-source-delta-validation.yaml");
    expect(validation.validation_status).toBe("valid");

    const invalidSourceDeltaValidation = validateMaturationConvergenceLedger({
      maturationConvergenceLedger: {
        ...ledger,
        rounds: [{
          ...ledger.rounds[0]!,
          closure_rows: [{
            ...ledger.rounds[0]!.closure_rows[0]!,
            source_observation_delta_validation_refs: [
              "unrelated-source-delta-validation.yaml",
            ],
          }],
        }],
      },
      maturationConvergenceLedgerRef: "maturation-convergence-ledger.yaml",
      sourceObservationDelta: sourceObservationDelta(["obs-code-1"]),
      sourceObservationDeltaRef: "source-observation-delta.yaml",
      sourceObservationDeltaValidationRef:
        "source-observation-delta-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      answerSupportLedger,
      answerSupportLedgerValidation: answerSupportValidation,
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsValidation: answerClaimsValidation,
      maturationAnswerClaimsValidationRef:
        "maturation-answer-claims-validation.yaml",
      ontologyExpansion,
      ontologyExpansionValidation,
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
    });

    expect(invalidSourceDeltaValidation.validation_status).toBe("invalid");
    expect(invalidSourceDeltaValidation.violations.map((violation) => violation.code))
      .toContain("conflicting_state");

    const duplicateSourceObservationClosure =
      validateMaturationConvergenceLedger({
        maturationConvergenceLedger: {
          ...ledger,
          rounds: [{
            ...ledger.rounds[0]!,
            source_observation_closure_rows: [
              ledger.rounds[0]!.source_observation_closure_rows[0]!,
              {
                ...ledger.rounds[0]!.source_observation_closure_rows[0]!,
                source_observation_closure_id:
                  "source-observation-closure:duplicate",
              },
            ],
          }],
        },
        maturationConvergenceLedgerRef: "maturation-convergence-ledger.yaml",
        sourceObservationDelta: sourceObservationDelta(["obs-code-1"]),
        sourceObservationDeltaRef: "source-observation-delta.yaml",
        sourceObservationDeltaValidationRef:
          "source-observation-delta-validation.yaml",
        maturationQuestionFrontier: frontier,
        maturationQuestionFrontierValidation: frontierValidation,
        maturationQuestionFrontierValidationRef:
          "maturation-question-frontier-validation.yaml",
        actionabilityMatrix: matrix,
        actionabilityMatrixValidation: matrixValidation,
        actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
        answerSupportLedger,
        answerSupportLedgerValidation: answerSupportValidation,
        answerSupportLedgerValidationRef:
          "answer-support-ledger-validation.yaml",
        maturationAnswerClaims: answerClaims,
        maturationAnswerClaimsValidation: answerClaimsValidation,
        maturationAnswerClaimsValidationRef:
          "maturation-answer-claims-validation.yaml",
        ontologyExpansion,
        ontologyExpansionValidation,
        ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      });

    expect(duplicateSourceObservationClosure.validation_status).toBe("invalid");
    expect(duplicateSourceObservationClosure.violations.map((violation) =>
      violation.code
    )).toContain("duplicate_id");
  });

  it("requires ontology expansion evidence to trace through answer claims", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const observations = sourceObservations(["src/feature.ts"]);
    const safety = sourceSafetyAuthority(observations);
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [
        {
          evidence_cluster_id: "cluster-source-evidence",
          question_refs: ["mq-feature-object"],
          support_mode: "direct_authority",
          proposed_answer_summary: "Observed source supports the feature object.",
          evidence_refs: [evidence],
          proof_refs: [],
          user_confirmation_refs: [],
          authority_response_refs: [],
          independence_basis: "single direct source authority",
          contradiction_refs: [],
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };
    const ledgerValidation = validateAnswerSupportLedger({
      answerSupportLedger: ledger,
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: observations,
      ...safety,
    });
    const answerClaims: ReconstructMaturationAnswerClaimsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      answer_claims: [
        {
          answer_claim_id: "answer-claim-feature-object",
          question_id: "mq-feature-object",
          answer: "The feature object is supported by the observed source.",
          answer_status: "answered",
          support_mode: "direct_authority",
          evidence_cluster_refs: ["cluster-source-evidence"],
          supporting_evidence_refs: [evidence],
          target_surface_refs: ["static_surface"],
          target_dimension_refs: ["structure"],
          purpose_element_refs: ["purpose-element-feature-object"],
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };
    const answerClaimsValidation = validateMaturationAnswerClaims({
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsRef: "maturation-answer-claims.yaml",
      answerSupportLedger: ledger,
      answerSupportLedgerValidation: ledgerValidation,
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
    });
    const expansion: ReconstructOntologyExpansionArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      answer_claims_ref: "maturation-answer-claims.yaml",
      source_seed_ref: "ontology-seed.yaml",
      expansions: [
        {
          expansion_id: "expansion-missing-evidence",
          operation: "add",
          target_surface_refs: ["static_surface"],
          target_dimension_refs: ["structure"],
          target_seed_or_ontology_refs: ["semantic_layer.object_types/object-new"],
          purpose_element_refs: ["purpose-element-feature-object"],
          answer_claim_refs: ["answer-claim-feature-object"],
          evidence_refs: [],
          concept_economy_effect: "increases_surface",
          rationale:
            "The answer claim proves a new concept is required rather than refining the existing seed.",
          limitation_refs: [],
        },
        {
          expansion_id: "expansion-seed-rewrite",
          operation: "refine",
          target_surface_refs: ["static_surface"],
          target_dimension_refs: ["structure"],
          target_seed_or_ontology_refs: ["/tmp/ontology-seed.yaml"],
          purpose_element_refs: ["purpose-element-feature-object"],
          answer_claim_refs: ["answer-claim-feature-object"],
          evidence_refs: [evidence],
          concept_economy_effect: "preserves_surface",
          rationale: "This row attempts to touch the seed authority directly.",
          limitation_refs: [],
        },
      ],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };

    const validation = validateOntologyExpansion({
      ontologyExpansion: expansion,
      ontologyExpansionRef: "ontology-expansion.yaml",
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsValidation: answerClaimsValidation,
      maturationAnswerClaimsValidationRef: "maturation-answer-claims-validation.yaml",
    });

    expect(ledgerValidation.validation_status).toBe("valid");
    expect(answerClaimsValidation.validation_status).toBe("valid");
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toEqual(expect.arrayContaining([
        "missing_required_ref",
        "seed_authority_rewrite_attempt",
      ]));
  });

  it("keeps continuation blocked while material frontier rows remain open", () => {
    const { matrix, matrixValidation, frontier, frontierValidation } =
      frontierScenario();
    const closureFrontier: ReconstructMaturationClosureFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: [],
      authority_requests: [],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };
    const closureValidation = validateMaturationClosureFrontier({
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierRef: "maturation-closure-frontier.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceInventory: sourceInventory(["src/feature.ts"]),
      sourceInventoryRef: "source-inventory.yaml",
      sourceObservations: sourceObservations(["src/feature.ts"]),
      sourceObservationsRef: "source-observations.yaml",
      targetMaterialProfileValidation: validTargetMaterialProfileValidation(),
    });
    const authorityResponse = buildMaturationAuthorityResponseArtifact({
      sessionId: "session-1",
      closureFrontier,
      closureFrontierRef: "maturation-closure-frontier.yaml",
    });
    const authorityResponseValidation = validateMaturationAuthorityResponse({
      maturationAuthorityResponse: authorityResponse,
      maturationAuthorityResponseRef: "maturation-authority-response.yaml",
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
    });
    const continuationDecision = buildMaturationContinuationDecisionArtifact({
      sessionId: "session-1",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationConvergenceLedgerValidation: emptyConvergenceLedgerValidation(),
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation: closureValidation,
      maturationAuthorityResponse: authorityResponse,
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
    });

    const validation = validateMaturationContinuationDecision({
      maturationContinuationDecision: continuationDecision,
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationAuthorityResponseValidation: authorityResponseValidation,
      maturationAuthorityResponseValidationRef:
        "maturation-authority-response-validation.yaml",
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      maturationConvergenceLedgerValidation: emptyConvergenceLedgerValidation(),
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
    });
    const falseReadyValidation = validateMaturationContinuationDecision({
      maturationContinuationDecision: {
        ...continuationDecision,
        decision_state: "actionable_ready",
      },
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationAuthorityResponseValidation: authorityResponseValidation,
      maturationAuthorityResponseValidationRef:
        "maturation-authority-response-validation.yaml",
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      maturationConvergenceLedgerValidation: emptyConvergenceLedgerValidation(),
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
    });

    expect(continuationDecision.decision_state).toBe("blocked");
    expect(validation.validation_status).toBe("valid");
    expect(falseReadyValidation.validation_status).toBe("invalid");
    expect(falseReadyValidation.violations.map((violation) => violation.code))
      .toContain("conflicting_state");
  });

  it("projects maturation source-delta impact against actionability matrix rows", () => {
    const maturationBaseline = baseline();
    const baselineValidation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const matrixValidation = validateActionabilityMatrix({
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const delta = sourceObservationDelta(["obs-code-1"]);
    const deltaValidation: ReconstructSourceObservationDeltaValidationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      round_id: "maturation-round-1",
      created_at: now,
      source_observation_delta_ref: "source-observation-delta.yaml",
      frontier_ref: "maturation-closure-frontier.yaml",
      frontier_validation_ref: "maturation-closure-frontier-validation.yaml",
      source_observations_ref: "source-observations.yaml",
      validation_status: "valid",
      accepted_frontier_ref_count: 1,
      added_observation_count: 1,
      validation_results: ["source_observation_delta_valid"],
      violations: [],
    };

    const sourceDelta = buildMaturationSourceDeltaArtifact({
      sessionId: "session-1",
      sourceObservationDelta: delta,
      sourceObservationDeltaRef: "source-observation-delta.yaml",
      sourceObservationDeltaValidationRef:
        "source-observation-delta-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
    });
    const validation = validateMaturationSourceDelta({
      maturationSourceDelta: sourceDelta,
      maturationSourceDeltaRef: "maturation-source-delta.yaml",
      sourceObservationDelta: delta,
      sourceObservationDeltaValidation: deltaValidation,
      sourceObservationDeltaValidationRef:
        "source-observation-delta-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
    });
    const noImpactValidation = validateMaturationSourceDelta({
      maturationSourceDelta: {
        ...sourceDelta,
        impact_state: "delta_no_actionability_impact",
        impacted_matrix_row_refs: [],
        impact_rows: sourceDelta.impact_rows.map((row) => ({
          ...row,
          impact_state: "no_matching_actionability_row",
          affected_matrix_row_refs: [],
        })),
      },
      sourceObservationDelta: delta,
      sourceObservationDeltaValidation: deltaValidation,
      sourceObservationDeltaValidationRef:
        "source-observation-delta-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
    });

    expect(sourceDelta.impact_state).toBe("delta_affects_actionability");
    expect(sourceDelta.impacted_matrix_row_refs.length).toBeGreaterThan(0);
    expect(validation.validation_status).toBe("valid");
    expect(noImpactValidation.validation_status).toBe("invalid");
    expect(noImpactValidation.violations.map((violation) => violation.code))
      .toContain("conflicting_state");
  });

  it("requires final re-question convergence before actionable ready", () => {
    const maturationBaseline = baseline();
    const baselineValidation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const matrixValidation = validateActionabilityMatrix({
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const frontier: ReconstructMaturationQuestionFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      maturation_baseline_ref: "maturation-baseline.yaml",
      maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
      actionability_matrix_ref: "actionability-matrix.yaml",
      actionability_matrix_validation_ref: "actionability-matrix-validation.yaml",
      questions: [],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };
    const frontierValidation = validateMaturationQuestionFrontier({
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
    });
    const closureFrontier: ReconstructMaturationClosureFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: [],
      authority_requests: [],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };
    const closureValidation = validateMaturationClosureFrontier({
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierRef: "maturation-closure-frontier.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceInventory: sourceInventory(["src/feature.ts"]),
      sourceInventoryRef: "source-inventory.yaml",
      sourceObservations: sourceObservations(["src/feature.ts"]),
      sourceObservationsRef: "source-observations.yaml",
      targetMaterialProfileValidation: validTargetMaterialProfileValidation(),
    });
    const authorityResponse = buildMaturationAuthorityResponseArtifact({
      sessionId: "session-1",
      closureFrontier,
      closureFrontierRef: "maturation-closure-frontier.yaml",
    });
    const authorityResponseValidation = validateMaturationAuthorityResponse({
      maturationAuthorityResponse: authorityResponse,
      maturationAuthorityResponseRef: "maturation-authority-response.yaml",
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
    });
    const convergenceValidation = emptyConvergenceLedgerValidation();
    const decision = buildMaturationContinuationDecisionArtifact({
      sessionId: "session-1",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation: closureValidation,
      maturationAuthorityResponse: authorityResponse,
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
    });
    const validation = validateMaturationContinuationDecision({
      maturationContinuationDecision: decision,
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationAuthorityResponseValidation: authorityResponseValidation,
      maturationAuthorityResponseValidationRef:
        "maturation-authority-response-validation.yaml",
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
    });
    const falseReadyValidation = validateMaturationContinuationDecision({
      maturationContinuationDecision: {
        ...decision,
        decision_state: "actionable_ready",
        limitation_refs: [],
      },
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationAuthorityResponseValidation: authorityResponseValidation,
      maturationAuthorityResponseValidationRef:
        "maturation-authority-response-validation.yaml",
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
    });
    const ontologyExpansion = emptyOntologyExpansion();
    const ontologyExpansionValidation = emptyOntologyExpansionValidation();
    const actionableOntology = buildActionableOntologyArtifact({
      sessionId: "session-1",
      ontologySeedRef: "ontology-seed.yaml",
      ontologySeedValidationRef: "ontology-seed-validation.yaml",
      ontologyExpansionRef: "ontology-expansion.yaml",
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      ontologyExpansion,
      maturationContinuationDecision: decision,
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      maturationContinuationDecisionValidation: validation,
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
    });
    const actionableValidation = validateActionableOntology({
      actionableOntology,
      actionableOntologyRef: "actionable-ontology.yaml",
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      ontologySeedValidationRef: "ontology-seed-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      ontologyExpansion,
      ontologyExpansionValidation,
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      maturationContinuationDecision: decision,
      maturationContinuationDecisionValidation: validation,
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
    });
    const downstreamClaimValidation = validateActionableOntology({
      actionableOntology: {
        ...actionableOntology,
        downstream_claims: {
          ...actionableOntology.downstream_claims,
          query_access: "claimed_without_proof" as "not_claimed",
        },
      },
      actionableOntologyRef: "actionable-ontology.yaml",
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      ontologySeedValidationRef: "ontology-seed-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      ontologyExpansion,
      ontologyExpansionValidation,
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      maturationContinuationDecision: decision,
      maturationContinuationDecisionValidation: validation,
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
    });
    const noQuestionAnswerSupportLedger = emptyAnswerSupportLedger();
    const noQuestionAnswerSupportValidation = emptyAnswerSupportValidation();
    const noQuestionAnswerClaims = emptyMaturationAnswerClaims();
    const noQuestionAnswerClaimsValidation = validateMaturationAnswerClaims({
      maturationAnswerClaims: noQuestionAnswerClaims,
      maturationAnswerClaimsRef: "maturation-answer-claims.yaml",
      answerSupportLedger: noQuestionAnswerSupportLedger,
      answerSupportLedgerValidation: noQuestionAnswerSupportValidation,
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
    });
    const noQuestionOntologyExpansion = emptyOntologyExpansion();
    const noQuestionOntologyExpansionValidation = validateOntologyExpansion({
      ontologyExpansion: noQuestionOntologyExpansion,
      ontologyExpansionRef: "ontology-expansion.yaml",
      maturationAnswerClaims: noQuestionAnswerClaims,
      maturationAnswerClaimsValidation: noQuestionAnswerClaimsValidation,
      maturationAnswerClaimsValidationRef:
        "maturation-answer-claims-validation.yaml",
    });
    const noQuestionConvergenceLedger = buildMaturationConvergenceLedgerArtifact({
      sessionId: "session-1",
      roundId: "maturation-round-1",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationClosureFrontier: closureFrontier,
      answerSupportLedger: noQuestionAnswerSupportLedger,
      maturationAnswerClaims: noQuestionAnswerClaims,
      ontologyExpansion: noQuestionOntologyExpansion,
    });
    const noQuestionConvergenceValidation = validateMaturationConvergenceLedger({
      maturationConvergenceLedger: noQuestionConvergenceLedger,
      maturationConvergenceLedgerRef: "maturation-convergence-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      answerSupportLedger: noQuestionAnswerSupportLedger,
      answerSupportLedgerValidation: noQuestionAnswerSupportValidation,
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationAnswerClaims: noQuestionAnswerClaims,
      maturationAnswerClaimsValidation: noQuestionAnswerClaimsValidation,
      maturationAnswerClaimsValidationRef:
        "maturation-answer-claims-validation.yaml",
      ontologyExpansion: noQuestionOntologyExpansion,
      ontologyExpansionValidation: noQuestionOntologyExpansionValidation,
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
    });
    const readyDecision = buildMaturationContinuationDecisionArtifact({
      sessionId: "session-1",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationConvergenceLedgerValidation: noQuestionConvergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation: closureValidation,
      maturationAuthorityResponse: authorityResponse,
      ontologyExpansionValidation: noQuestionOntologyExpansionValidation,
    });
    const readyValidation = validateMaturationContinuationDecision({
      maturationContinuationDecision: readyDecision,
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
      answerSupportLedgerValidation: noQuestionAnswerSupportValidation,
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationAuthorityResponseValidation: authorityResponseValidation,
      maturationAuthorityResponseValidationRef:
        "maturation-authority-response-validation.yaml",
      ontologyExpansionValidation: noQuestionOntologyExpansionValidation,
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      maturationConvergenceLedgerValidation: noQuestionConvergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
    });

    expect(decision.decision_state).toBe("actionable_limited");
    expect(decision.limitation_refs)
      .toContain("maturation-final-requestion:not_run");
    expect(validation.validation_status).toBe("valid");
    expect(actionableOntology.actionability_claim).toBe("actionable_limited");
    expect(actionableOntology.projected_rows).toHaveLength(matrix.rows.length);
    expect(actionableValidation.validation_status).toBe("valid");
    expect(downstreamClaimValidation.validation_status).toBe("invalid");
    expect(downstreamClaimValidation.violations.map((violation) => violation.code))
      .toContain("invalid_enum");
    expect(noQuestionConvergenceValidation.final_requestion_pass_status)
      .toBe("no_new_material_question");
    expect(readyDecision.decision_state).toBe("actionable_ready");
    expect(readyValidation.validation_status).toBe("valid");
    expect(falseReadyValidation.validation_status).toBe("invalid");
    expect(falseReadyValidation.violations.map((violation) => violation.code))
      .toContain("conflicting_state");
  });

  it("rejects actionable limited when no rows can be included in the claim", () => {
    const maturationBaseline = baseline();
    const limitedBaseline = {
      ...maturationBaseline,
      baseline_rows: maturationBaseline.baseline_rows.map((row) => ({
        ...row,
        limitation_refs: ["limitation-all-rows"],
      })),
    };
    const baselineValidation = validateMaturationBaseline({
      maturationBaseline: limitedBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates(),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline: limitedBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const matrixValidation = validateActionabilityMatrix({
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline: limitedBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const frontier: ReconstructMaturationQuestionFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      maturation_baseline_ref: "maturation-baseline.yaml",
      maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
      actionability_matrix_ref: "actionability-matrix.yaml",
      actionability_matrix_validation_ref: "actionability-matrix-validation.yaml",
      questions: [],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };
    const frontierValidation = validateMaturationQuestionFrontier({
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
      maturationBaseline: limitedBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
    });
    const closureFrontier: ReconstructMaturationClosureFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: [],
      authority_requests: [],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };
    const closureValidation = validateMaturationClosureFrontier({
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierRef: "maturation-closure-frontier.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceInventory: sourceInventory(["src/feature.ts"]),
      sourceInventoryRef: "source-inventory.yaml",
      sourceObservations: sourceObservations(["src/feature.ts"]),
      sourceObservationsRef: "source-observations.yaml",
      targetMaterialProfileValidation: validTargetMaterialProfileValidation(),
    });
    const authorityResponse = buildMaturationAuthorityResponseArtifact({
      sessionId: "session-1",
      closureFrontier,
      closureFrontierRef: "maturation-closure-frontier.yaml",
    });
    const authorityResponseValidation = validateMaturationAuthorityResponse({
      maturationAuthorityResponse: authorityResponse,
      maturationAuthorityResponseRef: "maturation-authority-response.yaml",
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
    });
    const convergenceValidation = emptyConvergenceLedgerValidation();
    const decision = buildMaturationContinuationDecisionArtifact({
      sessionId: "session-1",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation: closureValidation,
      maturationAuthorityResponse: authorityResponse,
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
    });
    const validation = validateMaturationContinuationDecision({
      maturationContinuationDecision: decision,
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationAuthorityResponseValidation: authorityResponseValidation,
      maturationAuthorityResponseValidationRef:
        "maturation-authority-response-validation.yaml",
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
    });
    const falseLimitedDecision = {
      ...decision,
      decision_state: "actionable_limited" as const,
      blocking_row_refs: [],
    };
    const falseLimitedValidation = validateMaturationContinuationDecision({
      maturationContinuationDecision: falseLimitedDecision,
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      maturationClosureFrontierValidation: closureValidation,
      maturationClosureFrontierValidationRef:
        "maturation-closure-frontier-validation.yaml",
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationAuthorityResponseValidation: authorityResponseValidation,
      maturationAuthorityResponseValidationRef:
        "maturation-authority-response-validation.yaml",
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
    });
    const ontologyExpansion = emptyOntologyExpansion();
    const ontologyExpansionValidation = emptyOntologyExpansionValidation();
    const falseLimitedOntology = buildActionableOntologyArtifact({
      sessionId: "session-1",
      ontologySeedRef: "ontology-seed.yaml",
      ontologySeedValidationRef: "ontology-seed-validation.yaml",
      ontologyExpansionRef: "ontology-expansion.yaml",
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      ontologyExpansion,
      maturationContinuationDecision: falseLimitedDecision,
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      maturationContinuationDecisionValidation: {
        ...falseLimitedValidation,
        validation_status: "valid",
      },
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
    });
    const falseLimitedOntologyValidation = validateActionableOntology({
      actionableOntology: falseLimitedOntology,
      actionableOntologyRef: "actionable-ontology.yaml",
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      ontologySeedValidationRef: "ontology-seed-validation.yaml",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidation: matrixValidation,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      ontologyExpansion,
      ontologyExpansionValidation,
      ontologyExpansionValidationRef: "ontology-expansion-validation.yaml",
      maturationContinuationDecision: falseLimitedDecision,
      maturationContinuationDecisionValidation: {
        ...falseLimitedValidation,
        validation_status: "valid",
      },
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
    });

    expect(decision.decision_state).toBe("blocked");
    expect(decision.blocking_row_refs).toEqual(
      matrix.rows.map((row) => row.matrix_row_id),
    );
    expect(validation.validation_status).toBe("valid");
    expect(falseLimitedValidation.validation_status).toBe("invalid");
    expect(falseLimitedValidation.violations.map((violation) => violation.code))
      .toContain("missing_required_ref");
    expect(falseLimitedOntologyValidation.validation_status).toBe("invalid");
    expect(
      falseLimitedOntologyValidation.violations.map((violation) => violation.code),
    ).toContain("missing_required_ref");
  });
});
