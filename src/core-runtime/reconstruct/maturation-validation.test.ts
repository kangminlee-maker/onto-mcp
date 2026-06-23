import { describe, expect, it } from "vitest";
import type {
  ReconstructActionabilityMatrixValidationArtifact,
  ReconstructAnswerSupportLedgerArtifact,
  ReconstructAnswerSupportLedgerValidationArtifact,
  ReconstructAnswerSupportJudgmentArtifact,
  ReconstructActionabilityMatrixArtifact,
  ReconstructActionabilityMatrixRow,
  ReconstructMaturationAuthorityResponseArtifact,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructEvidenceRef,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationClosureFrontierValidationArtifact,
  ReconstructMaturationContinuationDecisionArtifact,
  ReconstructMaturationConvergenceLedgerValidationArtifact,
  ReconstructMaturationAnswerClaimsArtifact,
  ReconstructMaturationAnswerClaimsValidationArtifact,
  ReconstructMaturationQuestionFrontierValidationArtifact,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructOntologyExpansionArtifact,
  ReconstructOntologyExpansionValidationArtifact,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalValidationArtifact,
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
  validateAnswerSupportJudgment,
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

function sourcePurposeCandidates(
  candidateLimitationRefs: string[] = [],
): ReconstructSourcePurposeCandidatesArtifact {
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
        limitation_refs: candidateLimitationRefs,
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

function baseline(seedRefs = ["object-feature"], candidateLimitationRefs: string[] = []) {
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
    sourcePurposeCandidates: sourcePurposeCandidates(candidateLimitationRefs),
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
    asserted_obligation_ids: [],
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

// M4b fixtures: an empty (no-blocker) revision proposal + its valid validation, threaded
// into the continuation builder/validator. revisionProposal(["p1:reject", ...]) builds a
// blocker-bearing set for the M4b gate tests.
function revisionProposal(
  specs: string[] = [],
): ReconstructRevisionProposalArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    failure_classification_ref: "failure-classification.yaml",
    proposals: specs.map((spec, index) => {
      const [proposalId, action] = spec.split(":");
      return {
        proposal_id: proposalId ?? `proposal-${index + 1}`,
        target_type: "failure",
        target_id: "failure-1",
        action: (action ?? "reuse") as
          ReconstructRevisionProposalArtifact["proposals"][number]["action"],
        rationale: "fixture",
        expected_effect: "fixture",
      };
    }),
    directive_author: { owner: "host_llm", author_id: "mock" },
  };
}

function revisionProposalValidation(
  status: "valid" | "invalid" = "valid",
  ref: string = "revision-proposal.yaml",
): ReconstructRevisionProposalValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    revision_proposal_ref: ref,
    failure_classification_ref: "failure-classification.yaml",
    validation_status: status,
    proposal_count: 0,
    action_counts: { reuse: 0, extend: 0, rename: 0, split: 0, reject: 0, defer: 0 },
    validation_results: [
      status === "valid" ? "revision_proposal_valid" : "revision_proposal_invalid",
    ],
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

  it("keeps unmodeled material rows frontier-required when only candidate-level limitations exist (#22 dead-machine fix)", () => {
    const candidateLimitation = "limitation-source-coverage-partial";
    const maturationBaseline = baseline([], [candidateLimitation]);
    const baselineValidation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates([candidateLimitation]),
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

    // Candidate-level limitation is surfaced once at the baseline/matrix top level,
    // never copied onto the row...
    expect(maturationBaseline.candidate_limitation_refs).toEqual([candidateLimitation]);
    expect(matrix.candidate_limitation_refs).toEqual([candidateLimitation]);
    expect(maturationBaseline.baseline_rows[0]?.limitation_refs).toEqual([]);
    // ...so the answer machine stays alive: the unmodeled material row remains
    // frontier-required instead of being silently buried as limitation_backed.
    expect(matrix.rows[0]?.member_readiness).toBe("frontier_required");
    expect(matrix.rows[0]?.limitation_refs).toEqual([]);
    expect(matrixValidation.frontier_required_row_count).toBe(1);
    expect(baselineValidation.validation_status).toBe("valid");
    expect(matrixValidation.validation_status).toBe("valid");
  });

  it("rejects an actionability matrix that drops the baseline's candidate limitations (@codex P2)", () => {
    const candidateLimitation = "limitation-source-coverage-partial";
    const maturationBaseline = baseline([], [candidateLimitation]);
    const baselineValidation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates([candidateLimitation]),
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
    // A stale/edited matrix that drops the source-level limitation must fail, so
    // continuation cannot silently project actionable_ready off a tampered matrix.
    const tamperedMatrix = { ...matrix, candidate_limitation_refs: [] };
    const validation = validateActionabilityMatrix({
      actionabilityMatrix: tamperedMatrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) =>
      v.code === "conflicting_state" && v.subject_id === "candidate_limitation_refs"
    )).toBe(true);
  });

  it("rejects a maturation baseline whose candidate limitations drift from the selected candidate (@codex P2)", () => {
    const candidateLimitation = "limitation-source-coverage-partial";
    const maturationBaseline = baseline([], [candidateLimitation]);
    // Tamper: drop the source-level limitation the selected candidate declared, so
    // the matrix↔baseline check alone (which would copy the same empty set) cannot
    // catch the drift — only the baseline↔candidate anchor does.
    const tamperedBaseline = {
      ...maturationBaseline,
      candidate_limitation_refs: [],
    };
    const validation = validateMaturationBaseline({
      maturationBaseline: tamperedBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: sourcePurposeCandidates([candidateLimitation]),
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) =>
      v.code === "conflicting_state" && v.subject_id === "candidate_limitation_refs"
    )).toBe(true);
  });

  it("rejects a baseline that drops or duplicates a required maturation tuple (M1 P1-a)", () => {
    const maturationBaseline = baseline();
    const validateBaseline = (b: ReturnType<typeof baseline>) =>
      validateMaturationBaseline({
        maturationBaseline: b,
        maturationBaselineRef: "maturation-baseline.yaml",
        sourcePurposeCandidates: sourcePurposeCandidates(),
        sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
        purposeConfirmationValidation: validPurposeConfirmation(),
        ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
        competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
        handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
        sourceReconstructRecordSha256: sourceRecordSha,
      });
    // As built, the baseline covers its required tuple exactly once.
    expect(validateBaseline(maturationBaseline).validation_status).toBe("valid");
    // Deleting the required row erases its scope → missing coverage.
    expect(
      validateBaseline({ ...maturationBaseline, baseline_rows: [] }).violations
        .some((v) => v.code === "missing_required_coverage"),
    ).toBe(true);
    // Duplicating the required tuple under a fresh row id → conflicting coverage.
    const row0 = maturationBaseline.baseline_rows[0]!;
    const duplicated = {
      ...maturationBaseline,
      baseline_rows: [row0, { ...row0, baseline_row_id: `${row0.baseline_row_id}-dup` }],
    };
    expect(validateBaseline(duplicated).violations.some((v) =>
      v.code === "conflicting_state" && (v.subject_id ?? "").startsWith("[")
    )).toBe(true);
  });

  it("rejects a matrix that drops or mutates a baseline row (M1 P1-b)", () => {
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
    const validateMatrix = (m: typeof matrix) =>
      validateActionabilityMatrix({
        actionabilityMatrix: m,
        actionabilityMatrixRef: "actionability-matrix.yaml",
        maturationBaseline,
        maturationBaselineValidation: baselineValidation,
        maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      });
    expect(validateMatrix(matrix).validation_status).toBe("valid");
    // Dropping the matrix row erases the baseline row's scope from the claim.
    expect(
      validateMatrix({ ...matrix, rows: [] }).violations
        .some((v) => v.code === "missing_required_coverage"),
    ).toBe(true);
    // Mutating the matrix row's inherited identity field → conflicting state.
    const mutated = {
      ...matrix,
      rows: [{ ...matrix.rows[0]!, purpose_element_ref: "tampered-element" }],
    };
    expect(validateMatrix(mutated).violations.some((v) =>
      v.code === "conflicting_state" &&
      v.subject_id === matrix.rows[0]!.matrix_row_id
    )).toBe(true);
  });

  it("rejects a matrix that swaps lineage multiplicity or tampers competency refs (onto P1-b refinement)", () => {
    // Baseline row carries a duplicate-bearing member-source lineage so that a
    // multiplicity swap (same set, same length) is observable.
    const base = baseline();
    const dupBaseline = {
      ...base,
      baseline_rows: base.baseline_rows.map((row) => ({
        ...row,
        member_source_refs: ["lineage-a", "lineage-a", "lineage-b"],
      })),
    };
    const baselineValidation = validateMaturationBaseline({
      maturationBaseline: dupBaseline,
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
      maturationBaseline: dupBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const validateMatrix = (m: typeof matrix) =>
      validateActionabilityMatrix({
        actionabilityMatrix: m,
        actionabilityMatrixRef: "actionability-matrix.yaml",
        maturationBaseline: dupBaseline,
        maturationBaselineValidation: baselineValidation,
        maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      });
    const rowId = matrix.rows[0]!.matrix_row_id;
    // The faithfully-built matrix preserves order + multiplicity + competency refs.
    expect(validateMatrix(matrix).validation_status).toBe("valid");
    expect(matrix.rows[0]!.competency_question_refs.length).toBeGreaterThan(0);
    // Swapping a duplicate occurrence keeps the set and length but changes multiplicity
    // — a set-only check would miss this; exact array equality must flag it.
    const multiplicitySwapped = {
      ...matrix,
      rows: matrix.rows.map((row) => ({
        ...row,
        member_source_refs: ["lineage-a", "lineage-b", "lineage-b"],
      })),
    };
    expect(validateMatrix(multiplicitySwapped).violations.some((v) =>
      v.code === "conflicting_state" && v.subject_id === rowId
    )).toBe(true);
    // Competency refs are baseline-copied (immutable); tampering them is a conflict.
    const competencyTampered = {
      ...matrix,
      rows: matrix.rows.map((row) => ({
        ...row,
        competency_question_refs: ["cq-tampered"],
      })),
    };
    expect(validateMatrix(competencyTampered).violations.some((v) =>
      v.code === "conflicting_state" && v.subject_id === rowId
    )).toBe(true);
  });

  it("keeps material L3 answer-supported rows frontier-required until expansion validates them for purpose", () => {
    // A current-matrix recompute carries the question frontier pair (the row stays
    // frontier_required, so it must cite its blocking question).
    const { maturationBaseline, baselineValidation, matrix: initialMatrix, frontier, frontierValidation } =
      frontierScenario();
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
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
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
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
    });

    expect(matrix.rows[0]?.maturity_level).toBe("L3_evidenced");
    expect(matrix.rows[0]?.member_readiness).toBe("frontier_required");
    expect(matrixValidation.validation_status).toBe("valid");
  });

  it("raises material rows to L4 closed only from validated answer claims and ontology expansion", () => {
    const { maturationBaseline, baselineValidation, matrix: initialMatrix, frontier, frontierValidation } =
      frontierScenario();
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
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
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
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
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

  it("wires blocking_question_refs as the matrix->frontier reverse link (G track)", () => {
    const { maturationBaseline, baselineValidation, frontier, frontierValidation } =
      frontierScenario();
    const validateWithFrontier = (m: ReconstructActionabilityMatrixArtifact) =>
      validateActionabilityMatrix({
        actionabilityMatrix: m,
        actionabilityMatrixRef: "actionability-matrix.yaml",
        maturationBaseline,
        maturationBaselineValidation: baselineValidation,
        maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
        maturationQuestionFrontier: frontier,
        maturationQuestionFrontierValidation: frontierValidation,
        maturationQuestionFrontierValidationRef:
          "maturation-question-frontier-validation.yaml",
        maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
      });
    // Current-matrix recompute threads the validated frontier in -> reverse link populates.
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
    });
    const frontierRow = matrix.rows.find(
      (r) => r.member_readiness === "frontier_required",
    )!;
    expect(frontierRow).toBeDefined();
    expect(frontierRow.blocking_question_refs).toContain("mq-feature-object");
    const validated = validateWithFrontier(matrix);
    expect(validated.validation_status).toBe("valid");
    // The threaded frontier-validation ref is recorded as provenance (ultracode G-1).
    expect(validated.maturation_question_frontier_validation_ref).toBe(
      "maturation-question-frontier-validation.yaml",
    );
    // Dropping the reverse link on an open row -> missing coverage.
    const dropped = {
      ...matrix,
      rows: matrix.rows.map((r) =>
        r.matrix_row_id === frontierRow.matrix_row_id
          ? { ...r, blocking_question_refs: [] }
          : r
      ),
    };
    expect(validateWithFrontier(dropped).violations.some((v) =>
      v.code === "missing_required_coverage" &&
      v.subject_id === frontierRow.matrix_row_id
    )).toBe(true);
    // A blocking ref that does not resolve to the validated frontier -> unknown_id.
    const dangling = {
      ...matrix,
      rows: matrix.rows.map((r) =>
        r.matrix_row_id === frontierRow.matrix_row_id
          ? { ...r, blocking_question_refs: ["mq-ghost"] }
          : r
      ),
    };
    expect(validateWithFrontier(dangling).violations.some((v) =>
      v.code === "unknown_id" && v.subject_id === "mq-ghost"
    )).toBe(true);
  });

  it("rejects blocking_question_refs on the pre-frontier baseline matrix (G track)", () => {
    const { maturationBaseline, baselineValidation } = frontierScenario();
    // Baseline matrix: no frontier threaded in -> builder leaves the reverse link empty.
    const baselineMatrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    expect(
      baselineMatrix.rows.every((r) => r.blocking_question_refs.length === 0),
    ).toBe(true);
    const validateBaselineMatrix = (m: ReconstructActionabilityMatrixArtifact) =>
      validateActionabilityMatrix({
        actionabilityMatrix: m,
        actionabilityMatrixRef: "baseline-actionability-matrix.yaml",
        maturationBaseline,
        maturationBaselineValidation: baselineValidation,
        maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      });
    expect(validateBaselineMatrix(baselineMatrix).validation_status).toBe("valid");
    // Citing a question before the frontier exists is a conflict.
    const premature = {
      ...baselineMatrix,
      rows: baselineMatrix.rows.map((r, index) =>
        index === 0 ? { ...r, blocking_question_refs: ["mq-premature"] } : r
      ),
    };
    expect(validateBaselineMatrix(premature).violations.some((v) =>
      v.code === "conflicting_state" &&
      v.subject_id === premature.rows[0]!.matrix_row_id
    )).toBe(true);
  });

  it("rejects blocking_question_refs on a closed (non-frontier) matrix row (G track)", () => {
    const { maturationBaseline, baselineValidation, frontier, frontierValidation } =
      frontierScenario();
    const initialMatrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const answerClaims = answerClaimsForRow(initialMatrix.rows[0]!);
    const ontologyExpansion = ontologyExpansionForRow(initialMatrix.rows[0]!);
    // Answer claims + expansion raise the row to L4 -> closed (no longer frontier).
    const buildArgs = {
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
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
    };
    const matrix = buildActionabilityMatrixArtifact(buildArgs);
    const closedRow = matrix.rows[0]!;
    expect(closedRow.member_readiness).toBe("closed");
    expect(closedRow.blocking_question_refs).toEqual([]);
    const tainted = {
      ...matrix,
      rows: matrix.rows.map((r, index) =>
        index === 0 ? { ...r, blocking_question_refs: ["mq-feature-object"] } : r
      ),
    };
    const validation = validateActionabilityMatrix({
      actionabilityMatrix: tainted,
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
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
    });
    expect(validation.violations.some((v) =>
      v.code === "conflicting_state" && v.subject_id === closedRow.matrix_row_id
    )).toBe(true);
  });

  it("requires a frontier_required row to cite EVERY frontier question naming it (codex P2 #1)", () => {
    const { maturationBaseline, baselineValidation, frontier } = frontierScenario();
    const baseQuestion = frontier.questions[0]!;
    // Two validated frontier questions name the SAME baseline row.
    const twoQuestionFrontier = {
      ...frontier,
      questions: [
        { ...baseQuestion, question_id: "mq-feature-object" },
        { ...baseQuestion, question_id: "mq-feature-object-2" },
      ],
    };
    const validFrontierValidation = { validation_status: "valid", maturation_baseline_validation_ref: "maturation-baseline-validation.yaml" } as ReconstructMaturationQuestionFrontierValidationArtifact;
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationQuestionFrontier: twoQuestionFrontier,
      maturationQuestionFrontierValidation: validFrontierValidation,
    });
    const frontierRow = matrix.rows.find(
      (r) => r.member_readiness === "frontier_required",
    )!;
    // The builder populates the FULL set.
    expect(new Set(frontierRow.blocking_question_refs)).toEqual(
      new Set(["mq-feature-object", "mq-feature-object-2"]),
    );
    const validate = (m: ReconstructActionabilityMatrixArtifact) =>
      validateActionabilityMatrix({
        actionabilityMatrix: m,
        actionabilityMatrixRef: "actionability-matrix.yaml",
        maturationBaseline,
        maturationBaselineValidation: baselineValidation,
        maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
        maturationQuestionFrontier: twoQuestionFrontier,
        maturationQuestionFrontierValidation: validFrontierValidation,
        maturationQuestionFrontierValidationRef:
          "maturation-question-frontier-validation.yaml",
      });
    expect(validate(matrix).validation_status).toBe("valid");
    // Dropping ONE of the two questions (a subset) must now fail — exact set required.
    const subset = {
      ...matrix,
      rows: matrix.rows.map((r) =>
        r.matrix_row_id === frontierRow.matrix_row_id
          ? { ...r, blocking_question_refs: ["mq-feature-object"] }
          : r
      ),
    };
    expect(validate(subset).violations.some((v) =>
      v.code === "missing_required_coverage" &&
      v.subject_id === frontierRow.matrix_row_id
    )).toBe(true);
  });

  it("rejects a blocking question that resolves but does not name the row (ultracode namesRow gap)", () => {
    const { maturationBaseline, baselineValidation, frontier } = frontierScenario();
    const baseQuestion = frontier.questions[0]!;
    // mq-other-row exists in the frontier but names a different baseline row.
    const frontierWithOther = {
      ...frontier,
      questions: [
        { ...baseQuestion, question_id: "mq-feature-object" },
        {
          ...baseQuestion,
          question_id: "mq-other-row",
          baseline_row_refs: ["other-baseline-row"],
        },
      ],
    };
    const validFrontierValidation = { validation_status: "valid", maturation_baseline_validation_ref: "maturation-baseline-validation.yaml" } as ReconstructMaturationQuestionFrontierValidationArtifact;
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationQuestionFrontier: frontierWithOther,
      maturationQuestionFrontierValidation: validFrontierValidation,
    });
    const frontierRow = matrix.rows.find(
      (r) => r.member_readiness === "frontier_required",
    )!;
    // Cite the real-but-wrong-row question alongside the legitimately-expected one.
    const tampered = {
      ...matrix,
      rows: matrix.rows.map((r) =>
        r.matrix_row_id === frontierRow.matrix_row_id
          ? { ...r, blocking_question_refs: ["mq-feature-object", "mq-other-row"] }
          : r
      ),
    };
    const validation = validateActionabilityMatrix({
      actionabilityMatrix: tampered,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationQuestionFrontier: frontierWithOther,
      maturationQuestionFrontierValidation: validFrontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
    });
    expect(validation.violations.some((v) =>
      v.code === "conflicting_state" &&
      v.subject_id === frontierRow.matrix_row_id
    )).toBe(true);
  });

  it("fails the current matrix when a supplied frontier validation is invalid (codex P2 #3)", () => {
    const { maturationBaseline, baselineValidation, frontier, frontierValidation } =
      frontierScenario();
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
    });
    // A supplied-but-invalid frontier validation must fail, not silently fall back.
    const validation = validateActionabilityMatrix({
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: { validation_status: "invalid" } as ReconstructMaturationQuestionFrontierValidationArtifact,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
    });
    expect(validation.violations.some((v) =>
      v.code === "prior_validation_invalid" &&
      v.subject_id === "maturation-question-frontier-validation.yaml"
    )).toBe(true);
  });

  it("fails loud on a half-threaded question frontier (one side only) (codex round-2 P2)", () => {
    const { maturationBaseline, baselineValidation, frontier, frontierValidation } =
      frontierScenario();
    const baselineMatrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    });
    const validateHalf = (
      half: Pick<
        Parameters<typeof validateActionabilityMatrix>[0],
        "maturationQuestionFrontier" | "maturationQuestionFrontierValidation"
      >,
    ) =>
      validateActionabilityMatrix({
        actionabilityMatrix: baselineMatrix,
        actionabilityMatrixRef: "actionability-matrix.yaml",
        maturationBaseline,
        maturationBaselineValidation: baselineValidation,
        maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
        maturationQuestionFrontierValidationRef:
          "maturation-question-frontier-validation.yaml",
        ...half,
      });
    // Frontier artifact without its validation -> missing required ref.
    expect(
      validateHalf({ maturationQuestionFrontier: frontier }).violations.some((v) =>
        v.code === "missing_required_ref"
      ),
    ).toBe(true);
    // Validation without its frontier artifact -> missing required ref.
    expect(
      validateHalf({ maturationQuestionFrontierValidation: frontierValidation })
        .violations.some((v) => v.code === "missing_required_ref"),
    ).toBe(true);
    // Neither supplied (the baseline matrix) must NOT trip the pair check.
    expect(
      validateHalf({}).violations.some((v) => v.code === "missing_required_ref"),
    ).toBe(false);
  });

  it("requires the frontier pair when post-frontier inputs are present (codex round-3 P2)", () => {
    const { maturationBaseline, baselineValidation, matrix: initialMatrix } =
      frontierScenario();
    const answerClaims = answerClaimsForRow(initialMatrix.rows[0]!);
    // A current-matrix recompute carries answer-claim inputs but OMITS the frontier pair —
    // it must NOT be treated as the (empty) baseline matrix.
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
    const validation = validateActionabilityMatrix({
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
      // No frontier pair supplied despite post-frontier inputs.
    });
    expect(validation.violations.some((v) => v.code === "missing_required_ref")).toBe(
      true,
    );
  });

  it("fails an open row when the supplied frontier names no matching question (codex round-3 P2)", () => {
    const { maturationBaseline, baselineValidation, frontier } = frontierScenario();
    // A mismatched/stale frontier: its question names a DIFFERENT baseline row, so no
    // question names the actual frontier_required row.
    const mismatchedFrontier = {
      ...frontier,
      questions: frontier.questions.map((q) => ({
        ...q,
        baseline_row_refs: ["other-baseline-row"],
      })),
    };
    const validFrontierValidation = { validation_status: "valid", maturation_baseline_validation_ref: "maturation-baseline-validation.yaml" } as ReconstructMaturationQuestionFrontierValidationArtifact;
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationQuestionFrontier: mismatchedFrontier,
      maturationQuestionFrontierValidation: validFrontierValidation,
    });
    const frontierRow = matrix.rows.find(
      (r) => r.member_readiness === "frontier_required",
    )!;
    // The builder finds no naming question, so the reverse link is empty...
    expect(frontierRow.blocking_question_refs).toEqual([]);
    const validation = validateActionabilityMatrix({
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationQuestionFrontier: mismatchedFrontier,
      maturationQuestionFrontierValidation: validFrontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
    });
    // ...and the validator must not let the unresolved open row pass silently.
    expect(validation.violations.some((v) =>
      v.code === "missing_required_coverage" &&
      v.subject_id === frontierRow.matrix_row_id
    )).toBe(true);
  });

  it("rejects a frontier validation that validates a different frontier artifact (codex round-4 P2)", () => {
    const { maturationBaseline, baselineValidation, frontier, frontierValidation } =
      frontierScenario();
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: "session-1",
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
    });
    // The supplied frontier validation records a DIFFERENT frontier ref than the frontier
    // artifact being consumed -> the validation does not bless this (possibly stale) frontier.
    const validation = validateActionabilityMatrix({
      actionabilityMatrix: matrix,
      actionabilityMatrixRef: "actionability-matrix.yaml",
      maturationBaseline,
      maturationBaselineValidation: baselineValidation,
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      // mismatched: the validation validated "maturation-question-frontier.yaml" (per
      // frontierScenario) but we claim the consumed frontier is a different artifact.
      maturationQuestionFrontierRef: "other-question-frontier.yaml",
    });
    expect(validation.violations.some((v) =>
      v.code === "conflicting_state" &&
      v.subject_id === "maturation-question-frontier-validation.yaml"
    )).toBe(true);
  });

  it("rejects a cross-artifact lineage break in the consumed validation chain (follow-up)", () => {
    const { maturationBaseline, baselineValidation, matrix: initialMatrix, frontier, frontierValidation } =
      frontierScenario();
    const answerClaims = answerClaimsForRow(initialMatrix.rows[0]!);
    const ontologyExpansion = ontologyExpansionForRow(initialMatrix.rows[0]!);
    // Build a faithful current matrix (claims + expansion + frontier all consistent).
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
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
    });
    const validateChain = (overrides: Partial<Parameters<typeof validateActionabilityMatrix>[0]>) =>
      validateActionabilityMatrix({
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
        maturationQuestionFrontier: frontier,
        maturationQuestionFrontierValidation: frontierValidation,
        maturationQuestionFrontierValidationRef:
          "maturation-question-frontier-validation.yaml",
        maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
        ...overrides,
      });
    // Faithful chain validates.
    expect(validateChain({}).validation_status).toBe("valid");
    // (a) frontier validation produced against a DIFFERENT baseline validation.
    expect(validateChain({
      maturationQuestionFrontierValidation: {
        ...frontierValidation,
        maturation_baseline_validation_ref: "other-baseline-validation.yaml",
      },
    }).violations.some((v) => v.code === "conflicting_state")).toBe(true);
    // (b) answer-claims validation produced against a DIFFERENT frontier validation.
    expect(validateChain({
      maturationAnswerClaimsValidation: {
        ...answerClaimsValidation(),
        maturation_question_frontier_validation_ref: "other-frontier-validation.yaml",
      },
    }).violations.some((v) => v.code === "conflicting_state")).toBe(true);
    // (c) ontology-expansion validation produced against a DIFFERENT answer-claims validation.
    expect(validateChain({
      ontologyExpansionValidation: {
        ...ontologyExpansionValidation(),
        maturation_answer_claims_validation_ref: "other-claims-validation.yaml",
      },
    }).violations.some((v) => v.code === "conflicting_state")).toBe(true);
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

  // G(a) slice 21 ENFORCEMENT BINDINGS — non-vacuous, NON-OVERLAPPING breaching inputs for four of the
  // five recorded obligations (frontier-triggered re-entry is bound by "rejects answer support that
  // consumes a delta observation missing from re-entry-approved ids" above). Each trips its own violation
  // code on a breach and clears it on a clean variant.
  function answerSupportLedgerWith(
    cluster: ReconstructAnswerSupportLedgerArtifact["evidence_clusters"][number],
  ): ReconstructAnswerSupportLedgerArtifact {
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [cluster],
      directive_author: { owner: "host_llm", author_id: "test-author" },
    };
  }

  it("ENFORCEMENT BINDING (slice 21 validate_evidence_cluster_question_refs): a cluster question_ref that does not resolve to the validated frontier trips unknown_id; a resolving ref clears it", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const observations = sourceObservations(["src/feature.ts"]);
    const safety = sourceSafetyAuthority(observations);
    const baseArgs = {
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: observations,
      ...safety,
    };
    const cluster = (questionRef: string) => ({
      evidence_cluster_id: "cluster-source-evidence",
      question_refs: [questionRef],
      support_mode: "direct_authority" as const,
      proposed_answer_summary: "Observed source supports the feature object.",
      evidence_refs: [evidence],
      proof_refs: [],
      user_confirmation_refs: [],
      authority_response_refs: [],
      independence_basis: "single direct source authority",
      contradiction_refs: [],
      limitation_refs: [],
    });
    const breach = validateAnswerSupportLedger({
      ...baseArgs,
      answerSupportLedger: answerSupportLedgerWith(cluster("mq-ghost")),
    });
    expect(breach.violations.some((v) => v.code === "unknown_id")).toBe(true);
    const clean = validateAnswerSupportLedger({
      ...baseArgs,
      answerSupportLedger: answerSupportLedgerWith(cluster("mq-feature-object")),
    });
    expect(clean.violations.some((v) => v.code === "unknown_id")).toBe(false);
  });

  it("ENFORCEMENT BINDING (slice 21 validate_user_confirmation_support_mode): a user_confirmation cluster missing confirmation authority trips support_mode_missing_authority; valid refs + confirmation clear it", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const baseArgs = {
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: sourceObservations(["src/feature.ts"]),
      purposeConfirmationValidation: validPurposeConfirmation(),
    };
    const cluster = (userConfirmationRefs: string[]) => ({
      evidence_cluster_id: "cluster-user-confirmation",
      question_refs: ["mq-feature-object"],
      support_mode: "user_confirmation" as const,
      proposed_answer_summary: "User confirmed the feature object purpose.",
      evidence_refs: [],
      proof_refs: [],
      user_confirmation_refs: userConfirmationRefs,
      authority_response_refs: [],
      independence_basis: "user confirmation authority",
      contradiction_refs: [],
      limitation_refs: [],
    });
    const breach = validateAnswerSupportLedger({
      ...baseArgs,
      answerSupportLedger: answerSupportLedgerWith(cluster([])),
    });
    expect(breach.violations.some((v) => v.code === "support_mode_missing_authority")).toBe(true);
    const clean = validateAnswerSupportLedger({
      ...baseArgs,
      answerSupportLedger: answerSupportLedgerWith(cluster(["user-confirmation-1"])),
    });
    expect(clean.violations.some((v) => v.code === "support_mode_missing_authority")).toBe(false);
  });

  it("ENFORCEMENT BINDING (slice 21 require_two_independent_evidence_refs_for_convergent_source_evidence): a convergent cluster with one evidence record trips insufficient_independent_evidence; two independent records clear it", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const observations = sourceObservations(["src/feature.ts", "src/other.ts"]);
    const safety = sourceSafetyAuthority(observations);
    const secondEvidence: ReconstructEvidenceRef = {
      observation_id: "obs-code-2",
      target_material_kind: "code",
      source_ref: "src/other.ts",
      location: "src/other.ts",
    };
    const baseArgs = {
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: observations,
      ...safety,
    };
    const cluster = (evidenceRefs: ReconstructEvidenceRef[]) => ({
      evidence_cluster_id: "cluster-convergent",
      question_refs: ["mq-feature-object"],
      support_mode: "convergent_source_evidence" as const,
      proposed_answer_summary: "Convergent evidence supports the feature object.",
      evidence_refs: evidenceRefs,
      proof_refs: [],
      user_confirmation_refs: [],
      authority_response_refs: [],
      independence_basis: "two independent source records",
      contradiction_refs: [],
      limitation_refs: [],
    });
    const breach = validateAnswerSupportLedger({
      ...baseArgs,
      answerSupportLedger: answerSupportLedgerWith(cluster([evidence])),
    });
    expect(breach.violations.some((v) => v.code === "insufficient_independent_evidence")).toBe(true);
    const clean = validateAnswerSupportLedger({
      ...baseArgs,
      answerSupportLedger: answerSupportLedgerWith(cluster([evidence, secondEvidence])),
    });
    expect(clean.violations.some((v) => v.code === "insufficient_independent_evidence")).toBe(false);
  });

  it("ENFORCEMENT BINDING (slice 21 require_observation_specific_evidence_support_source_safety_row...): evidence whose observation lacks a sufficient/replay-allowed safety row trips missing_required_ref; a proper row clears it", () => {
    const { frontier, frontierValidation } = frontierScenario();
    const observations = sourceObservations(["src/feature.ts"]);
    const cluster = {
      evidence_cluster_id: "cluster-source-evidence",
      question_refs: ["mq-feature-object"],
      support_mode: "direct_authority" as const,
      proposed_answer_summary: "Observed source supports the feature object.",
      evidence_refs: [evidence],
      proof_refs: [],
      user_confirmation_refs: [],
      authority_response_refs: [],
      independence_basis: "single direct source authority",
      contradiction_refs: [],
      limitation_refs: [],
    };
    const baseArgs = {
      answerSupportLedgerRef: "answer-support-ledger.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      sourceObservations: observations,
      answerSupportLedger: answerSupportLedgerWith(cluster),
    };
    // breach: a present-but-empty safety ledger has no observation-specific row for obs-code-1.
    const breach = validateAnswerSupportLedger({
      ...baseArgs,
      ...sourceSafetyAuthority(sourceObservations([])),
    });
    expect(breach.violations.some((v) => v.code === "missing_required_ref")).toBe(true);
    // clean: a proper safety ledger carries the sufficient/replay-allowed rows for the cited observation.
    const clean = validateAnswerSupportLedger({
      ...baseArgs,
      ...sourceSafetyAuthority(observations),
    });
    expect(clean.violations.some((v) => v.code === "missing_required_ref")).toBe(false);
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
      revisionProposalRef: "revision-proposal.yaml",
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
      revisionProposalRef: "revision-proposal.yaml",
    });

    expect(continuationDecision.decision_state).toBe("blocked");
    expect(validation.validation_status).toBe("valid");
    expect(falseReadyValidation.validation_status).toBe("invalid");
    expect(falseReadyValidation.violations.map((violation) => violation.code))
      .toContain("conflicting_state");

    // M1 P1-c: a claim_scope that OMITS a non-closed (excluded) row is rejected. The
    // resolve check alone would pass; the recomputed partition catches the omission.
    const tamperedScopeValidation = validateMaturationContinuationDecision({
      maturationContinuationDecision: {
        ...continuationDecision,
        claim_scope: {
          ...continuationDecision.claim_scope,
          excluded_row_refs: [],
        },
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
      revisionProposalRef: "revision-proposal.yaml",
    });
    expect(tamperedScopeValidation.validation_status).toBe("invalid");
    expect(tamperedScopeValidation.violations.some((v) =>
      v.code === "conflicting_state" &&
      v.subject_id === "claim_scope.excluded_row_refs"
    )).toBe(true);
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
      revisionProposalRef: "revision-proposal.yaml",
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
      revisionProposalRef: "revision-proposal.yaml",
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
      revisionProposalRef: "revision-proposal.yaml",
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

    // M4b: unresolved reject/defer revision proposals downgrade the same all-closed,
    // convergence-proven matrix from actionable_ready to actionable_limited, surface as
    // revision_blocker_limitation_refs, and fold into limitation_refs.
    const validateReady = (
      decisionArtifact: ReconstructMaturationContinuationDecisionArtifact,
      proposal: ReconstructRevisionProposalArtifact,
      proposalValidation: ReconstructRevisionProposalValidationArtifact,
      proposalRef = "revision-proposal.yaml",
    ) =>
      validateMaturationContinuationDecision({
        maturationContinuationDecision: decisionArtifact,
        maturationContinuationDecisionRef: "maturation-continuation-decision.yaml",
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
        revisionProposal: proposal,
        revisionProposalValidation: proposalValidation,
        revisionProposalRef: proposalRef,
      });
    const blockerProposal = revisionProposal(["p1:reject", "p2:defer"]);
    const blockerDecision = buildMaturationContinuationDecisionArtifact({
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
      revisionProposal: blockerProposal,
      revisionProposalValidation: revisionProposalValidation(),
    });
    expect(blockerDecision.decision_state).toBe("actionable_limited");
    expect(blockerDecision.revision_blocker_limitation_refs)
      .toEqual(["revision-blocker:p1", "revision-blocker:p2"]);
    expect(blockerDecision.limitation_refs)
      .toEqual(expect.arrayContaining([
        "revision-blocker:p1",
        "revision-blocker:p2",
      ]));
    expect(
      validateReady(blockerDecision, blockerProposal, revisionProposalValidation())
        .validation_status,
    ).toBe("valid");
    // Gate: a hand-edited actionable_ready with a blocker present -> conflicting_state.
    const forcedReady = validateReady(
      { ...blockerDecision, decision_state: "actionable_ready" },
      blockerProposal,
      revisionProposalValidation(),
    );
    expect(forcedReady.validation_status).toBe("invalid");
    expect(forcedReady.violations.map((v) => v.code)).toContain("conflicting_state");
    // Conservation: a tampered (emptied) blocker field -> conflicting_state.
    const tamperedField = validateReady(
      { ...blockerDecision, revision_blocker_limitation_refs: [] },
      blockerProposal,
      revisionProposalValidation(),
    );
    expect(tamperedField.validation_status).toBe("invalid");
    expect(tamperedField.violations.map((v) => v.code)).toContain("conflicting_state");
    // Superset: dropping a blocker ref from limitation_refs -> missing_required_ref.
    const droppedFold = validateReady(
      {
        ...blockerDecision,
        limitation_refs: blockerDecision.limitation_refs.filter(
          (ref) => !ref.startsWith("revision-blocker:"),
        ),
      },
      blockerProposal,
      revisionProposalValidation(),
    );
    expect(droppedFold.validation_status).toBe("invalid");
    expect(droppedFold.violations.map((v) => v.code)).toContain("missing_required_ref");
    // onto finding-002 binding: a valid validation certifying a DIFFERENT proposal ref.
    const bindingMismatch = validateReady(
      blockerDecision,
      blockerProposal,
      revisionProposalValidation("valid", "other-revision-proposal.yaml"),
    );
    expect(bindingMismatch.validation_status).toBe("invalid");
    expect(bindingMismatch.violations.map((v) => v.code)).toContain("conflicting_state");
    // Invalid revision-proposal-validation: builder emits no blockers (gated) so it stays
    // actionable_ready; the validator raises ONLY prior_validation_invalid (symmetric
    // derivation -> no spurious conservation conflict).
    const invalidBuilt = buildMaturationContinuationDecisionArtifact({
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
      revisionProposal: revisionProposal(["p1:reject"]),
      revisionProposalValidation: revisionProposalValidation("invalid"),
    });
    expect(invalidBuilt.decision_state).toBe("actionable_ready");
    expect(invalidBuilt.revision_blocker_limitation_refs).toEqual([]);
    const invalidValidation = validateReady(
      invalidBuilt,
      revisionProposal(["p1:reject"]),
      revisionProposalValidation("invalid"),
    );
    const invalidCodes = invalidValidation.violations.map((v) => v.code);
    expect(invalidCodes).toContain("prior_validation_invalid");
    expect(invalidValidation.violations.filter((v) =>
      v.code === "conflicting_state" &&
      v.subject_id === "revision_blocker_limitation_refs"
    )).toHaveLength(0);
    // codex R1: a valid validation with a NULL revision_proposal_ref does not certify the
    // consumed proposal -> binding conflicting_state (no unbound acceptance).
    const unboundBinding = validateReady(
      blockerDecision,
      blockerProposal,
      { ...revisionProposalValidation(), revision_proposal_ref: null },
    );
    expect(unboundBinding.validation_status).toBe("invalid");
    expect(unboundBinding.violations.some((v) =>
      v.code === "conflicting_state" && v.subject_id === "revision_proposal_ref"
    )).toBe(true);
    // codex R1: a pre-M4b persisted decision lacks revision_blocker_limitation_refs; the
    // validator normalizes the missing field to [] (does not throw) and produces a result.
    const { revision_blocker_limitation_refs: _legacy, ...legacyDecision } =
      readyDecision;
    const legacyValidation = validateReady(
      legacyDecision as ReconstructMaturationContinuationDecisionArtifact,
      revisionProposal(),
      revisionProposalValidation(),
    );
    expect(legacyValidation.validation_status).toBe("valid");

    // #22: purpose-candidate-level limitations keep the same all-closed matrix at
    // actionable_limited (not actionable_ready) and surface as a claim limitation,
    // without ever forcing a row to limitation_backed.
    const candidateLimitedDecision = buildMaturationContinuationDecisionArtifact({
      sessionId: "session-1",
      actionabilityMatrix: {
        ...matrix,
        candidate_limitation_refs: ["limitation-source-coverage-partial"],
      },
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationConvergenceLedgerValidation: noQuestionConvergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation: closureValidation,
      maturationAuthorityResponse: authorityResponse,
      ontologyExpansionValidation: noQuestionOntologyExpansionValidation,
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
    });
    expect(candidateLimitedDecision.decision_state).toBe("actionable_limited");
    expect(candidateLimitedDecision.limitation_refs)
      .toContain("limitation-source-coverage-partial");

    // @codex: the validator mirrors the builder — a saved/edited actionable_ready
    // decision is rejected when the matrix still carries candidate limitations, so a
    // stale ready state cannot be trusted downstream.
    const staleReadyValidation = validateMaturationContinuationDecision({
      maturationContinuationDecision: readyDecision,
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      actionabilityMatrix: {
        ...matrix,
        candidate_limitation_refs: ["limitation-source-coverage-partial"],
      },
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
      revisionProposalRef: "revision-proposal.yaml",
    });
    expect(staleReadyValidation.validation_status).toBe("invalid");
    expect(staleReadyValidation.violations.some((v) =>
      v.code === "conflicting_state" && v.subject_id === "actionable_ready"
    )).toBe(true);

    // @codex R3: the public claim projects decision.limitation_refs, so a limited
    // decision that omits a matrix candidate limitation is rejected — the source-level
    // limitation cannot silently disappear from the downstream claim.
    const droppedLimitationValidation = validateMaturationContinuationDecision({
      maturationContinuationDecision: candidateLimitedDecision,
      maturationContinuationDecisionRef:
        "maturation-continuation-decision.yaml",
      actionabilityMatrix: {
        ...matrix,
        candidate_limitation_refs: [
          "limitation-source-coverage-partial",
          "limitation-extra-not-in-decision",
        ],
      },
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
      revisionProposalRef: "revision-proposal.yaml",
    });
    expect(droppedLimitationValidation.validation_status).toBe("invalid");
    expect(droppedLimitationValidation.violations.some((v) =>
      v.code === "missing_required_ref" &&
      v.subject_id === "candidate_limitation_refs"
    )).toBe(true);

    // @codex R6: when candidate limitations AND an unproven final re-question convergence
    // both hold, the candidate branch is selected but the convergence limitation must
    // still reach the claim — both belong in decision.limitation_refs.
    const candidateAndConvergenceDecision = buildMaturationContinuationDecisionArtifact({
      sessionId: "session-1",
      actionabilityMatrix: {
        ...matrix,
        candidate_limitation_refs: ["limitation-source-coverage-partial"],
      },
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationConvergenceLedgerValidation: convergenceValidation,
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationClosureFrontier: closureFrontier,
      maturationClosureFrontierValidation: closureValidation,
      maturationAuthorityResponse: authorityResponse,
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
    });
    expect(candidateAndConvergenceDecision.decision_state).toBe("actionable_limited");
    expect(candidateAndConvergenceDecision.limitation_refs)
      .toContain("limitation-source-coverage-partial");
    expect(candidateAndConvergenceDecision.limitation_refs)
      .toContain("maturation-final-requestion:not_run");
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
      revisionProposalRef: "revision-proposal.yaml",
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
      revisionProposal: revisionProposal(),
      revisionProposalValidation: revisionProposalValidation(),
      revisionProposalRef: "revision-proposal.yaml",
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

  const evidence2: ReconstructEvidenceRef = {
    observation_id: "obs-code-2",
    target_material_kind: "code",
    source_ref: "src/other.ts",
    location: "src/other.ts",
  };

  function convergentLedger(): ReconstructAnswerSupportLedgerArtifact {
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [{
        evidence_cluster_id: "cluster-convergent",
        question_refs: ["mq-feature-object"],
        support_mode: "convergent_source_evidence",
        proposed_answer_summary: "Two independent sources support the answer.",
        evidence_refs: [evidence, evidence2],
        proof_refs: [],
        user_confirmation_refs: [],
        authority_response_refs: [],
        independence_basis: "two distinct sources",
        contradiction_refs: [],
        limitation_refs: [],
      }],
      directive_author: { owner: "host_llm", author_id: "ledger-author" },
    };
  }

  function judgmentArtifact(
    rows: Array<{
      evidence?: ReconstructEvidenceRef;
      cluster?: string;
      supports?: "supported" | "not_supported";
      rationale?: string;
      id?: string;
    }>,
  ): ReconstructAnswerSupportJudgmentArtifact {
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      answer_support_ledger_ref: "answer-support-ledger.yaml",
      answer_support_ledger_validation_ref:
        "answer-support-ledger-validation.yaml",
      judgments: rows.map((row, index) => ({
        judgment_id: row.id ?? `j-${index + 1}`,
        evidence_cluster_ref: row.cluster ?? "cluster-convergent",
        evidence_ref: row.evidence ?? evidence,
        supports: row.supports ?? "supported",
        rationale_ref: row.rationale ?? `rationale-${index + 1}`,
      })),
      directive_author: { owner: "host_llm", author_id: "judge-author" },
    };
  }

  it("B-5: valid when every convergent evidence is judged with a rationale", () => {
    const validation = validateAnswerSupportJudgment({
      answerSupportJudgment: judgmentArtifact([{ evidence }, { evidence: evidence2 }]),
      answerSupportLedger: convergentLedger(),
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
    });
    expect(validation.validation_status).toBe("valid");
    expect(validation.judgment_count).toBe(2);
    expect(validation.supported_judgment_count).toBe(2);
  });

  it("B-5: missing_required_coverage when a convergent evidence ref is omitted (Codex #3)", () => {
    const validation = validateAnswerSupportJudgment({
      answerSupportJudgment: judgmentArtifact([{ evidence }]),
      answerSupportLedger: convergentLedger(),
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
    });
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((v) => v.code))
      .toContain("missing_required_coverage");
  });

  it("B-5: unknown_id / invalid_enum / missing_required_ref / duplicate_id", () => {
    const validation = validateAnswerSupportJudgment({
      answerSupportJudgment: {
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        round_id: "maturation-round-1",
        answer_support_ledger_ref: null,
        answer_support_ledger_validation_ref: null,
        judgments: [
          {
            judgment_id: "dup",
            evidence_cluster_ref: "cluster-convergent",
            evidence_ref: evidence,
            supports: "supported",
            rationale_ref: "r",
          },
          {
            judgment_id: "dup",
            evidence_cluster_ref: "no-such-cluster",
            evidence_ref: evidence2,
            supports: "maybe" as "supported",
            rationale_ref: "   ",
          },
        ],
        directive_author: { owner: "host_llm", author_id: "judge-author" },
      },
      answerSupportLedger: convergentLedger(),
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
    });
    const codes = validation.violations.map((v) => v.code);
    expect(codes).toContain("duplicate_id");
    expect(codes).toContain("unknown_id");
    expect(codes).toContain("invalid_enum");
    expect(codes).toContain("missing_required_ref");
  });

  it("B-5: prior_validation_invalid when the support-ledger validation is invalid", () => {
    const validation = validateAnswerSupportJudgment({
      answerSupportJudgment: judgmentArtifact([{ evidence }, { evidence: evidence2 }]),
      answerSupportLedger: convergentLedger(),
      answerSupportLedgerValidation: {
        ...emptyAnswerSupportValidation(),
        validation_status: "invalid",
      },
    });
    expect(validation.violations.map((v) => v.code))
      .toContain("prior_validation_invalid");
  });

  it("B-5: non-convergent cluster allows a partial judgment (no coverage requirement)", () => {
    const ledger = convergentLedger();
    ledger.evidence_clusters[0]!.support_mode = "direct_authority";
    const validation = validateAnswerSupportJudgment({
      answerSupportJudgment: judgmentArtifact([{ evidence }]),
      answerSupportLedger: ledger,
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
    });
    expect(validation.validation_status).toBe("valid");
  });

  it("B-5: duplicate_id when the same (cluster, evidence) pair gets two conflicting verdicts", () => {
    // The laundering exploit: same evidence judged supported AND not_supported.
    // Must be invalid so B-6 cannot silently keep the 'supported' verdict.
    const validation = validateAnswerSupportJudgment({
      answerSupportJudgment: judgmentArtifact([
        { evidence, supports: "supported", id: "j1" },
        { evidence, supports: "not_supported", id: "j2" },
        { evidence: evidence2, supports: "supported", id: "j3" },
      ]),
      answerSupportLedger: convergentLedger(),
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
    });
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((v) => v.code)).toContain("duplicate_id");
  });

  it("B-5: convergent coverage is satisfied when a cited ref is judged not_supported", () => {
    const validation = validateAnswerSupportJudgment({
      answerSupportJudgment: judgmentArtifact([
        { evidence, supports: "supported" },
        { evidence: evidence2, supports: "not_supported" },
      ]),
      answerSupportLedger: convergentLedger(),
      answerSupportLedgerValidation: emptyAnswerSupportValidation(),
    });
    expect(validation.validation_status).toBe("valid");
    expect(validation.violations.map((v) => v.code))
      .not.toContain("missing_required_coverage");
    expect(validation.supported_judgment_count).toBe(1);
  });

  function convergentClaimScenario() {
    const { frontier, frontierValidation } = frontierScenario();
    const observations = sourceObservations(["src/feature.ts", "src/other.ts"]);
    const safety = sourceSafetyAuthority(observations);
    const ledger = convergentLedger();
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
      answer_claims: [{
        answer_claim_id: "answer-claim-feature-object",
        question_id: "mq-feature-object",
        answer: "Two independent sources support the feature object.",
        answer_status: "answered",
        support_mode: "convergent_source_evidence",
        evidence_cluster_refs: ["cluster-convergent"],
        supporting_evidence_refs: [evidence, evidence2],
        target_surface_refs: ["static_surface"],
        target_dimension_refs: ["structure"],
        purpose_element_refs: ["purpose-element-feature-object"],
        limitation_refs: [],
      }],
      directive_author: { owner: "host_llm", author_id: "test-author" },
    };
    return { frontier, frontierValidation, ledger, ledgerValidation, answerClaims };
  }

  function claimsValidationWithJudge(
    scenario: ReturnType<typeof convergentClaimScenario>,
    judgment: ReconstructAnswerSupportJudgmentArtifact | null,
  ) {
    const judgmentValidation = judgment
      ? validateAnswerSupportJudgment({
        answerSupportJudgment: judgment,
        answerSupportLedger: scenario.ledger,
        answerSupportLedgerValidation: scenario.ledgerValidation,
      })
      : null;
    return validateMaturationAnswerClaims({
      maturationAnswerClaims: scenario.answerClaims,
      maturationAnswerClaimsRef: "maturation-answer-claims.yaml",
      answerSupportLedger: scenario.ledger,
      answerSupportLedgerValidation: scenario.ledgerValidation,
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationQuestionFrontier: scenario.frontier,
      maturationQuestionFrontierValidation: scenario.frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      answerSupportJudgment: judgment,
      answerSupportJudgmentValidation: judgmentValidation,
      answerSupportJudgmentValidationRef: judgment
        ? "answer-support-judgment-validation.yaml"
        : null,
    });
  }

  it("B-6: convergent claim valid with two independent judge-confirmed supports", () => {
    const scenario = convergentClaimScenario();
    const validation = claimsValidationWithJudge(
      scenario,
      judgmentArtifact([{ evidence }, { evidence: evidence2 }]),
    );
    expect(scenario.ledgerValidation.validation_status).toBe("valid");
    expect(validation.validation_status).toBe("valid");
    expect(validation.answer_support_judgment_validation_ref)
      .toBe("answer-support-judgment-validation.yaml");
  });

  it("B-6: insufficient_independent_evidence when fewer than two are judge-confirmed", () => {
    const scenario = convergentClaimScenario();
    const validation = claimsValidationWithJudge(
      scenario,
      judgmentArtifact([
        { evidence, supports: "supported" },
        { evidence: evidence2, supports: "not_supported" },
      ]),
    );
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((v) => v.code))
      .toContain("insufficient_independent_evidence");
  });

  it("B-6: fail-closed — a convergent claim without a valid judgment is invalid", () => {
    const scenario = convergentClaimScenario();
    const validation = claimsValidationWithJudge(scenario, null);
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((v) => v.code))
      .toContain("prior_validation_invalid");
  });

  it("B-6: same-source supported refs collapse to one independent support (insufficient)", () => {
    // Two clusters whose supported evidence shares the same source_ref:location;
    // the INDEPENDENCE key collapses them to 1, so >=2 is not met even though two
    // separate (cluster, evidence) IDENTITY pairs were judge-confirmed.
    const { frontier, frontierValidation } = frontierScenario();
    const sameSourceA: ReconstructEvidenceRef = {
      observation_id: "obs-code-1",
      target_material_kind: "code",
      source_ref: "src/feature.ts",
      location: "src/feature.ts",
    };
    const sameSourceB: ReconstructEvidenceRef = {
      observation_id: "obs-code-1b",
      target_material_kind: "code",
      source_ref: "src/feature.ts",
      location: "src/feature.ts",
    };
    const ledger: ReconstructAnswerSupportLedgerArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      evidence_clusters: [
        {
          evidence_cluster_id: "cluster-a",
          question_refs: ["mq-feature-object"],
          support_mode: "convergent_source_evidence",
          proposed_answer_summary: "Cluster A.",
          evidence_refs: [sameSourceA],
          proof_refs: [],
          user_confirmation_refs: [],
          authority_response_refs: [],
          independence_basis: "a",
          contradiction_refs: [],
          limitation_refs: [],
        },
        {
          evidence_cluster_id: "cluster-b",
          question_refs: ["mq-feature-object"],
          support_mode: "convergent_source_evidence",
          proposed_answer_summary: "Cluster B.",
          evidence_refs: [sameSourceB],
          proof_refs: [],
          user_confirmation_refs: [],
          authority_response_refs: [],
          independence_basis: "b",
          contradiction_refs: [],
          limitation_refs: [],
        },
      ],
      directive_author: { owner: "host_llm", author_id: "ledger-author" },
    };
    // Bypass the ledger envelope check (each cluster has a single ref here, which
    // the ledger validator would flag); this test isolates the B-6 INDEPENDENCE
    // collapse, where two judge-confirmed refs sharing one source:location count as 1.
    const ledgerValidation: ReconstructAnswerSupportLedgerValidationArtifact = {
      ...emptyAnswerSupportValidation(),
      evidence_cluster_count: 2,
      supported_question_count: 1,
    };
    const judgment: ReconstructAnswerSupportJudgmentArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      answer_support_ledger_ref: "answer-support-ledger.yaml",
      answer_support_ledger_validation_ref: "answer-support-ledger-validation.yaml",
      judgments: [
        { judgment_id: "j-a", evidence_cluster_ref: "cluster-a", evidence_ref: sameSourceA, supports: "supported", rationale_ref: "ra" },
        { judgment_id: "j-b", evidence_cluster_ref: "cluster-b", evidence_ref: sameSourceB, supports: "supported", rationale_ref: "rb" },
      ],
      directive_author: { owner: "host_llm", author_id: "judge-author" },
    };
    const judgmentValidation = validateAnswerSupportJudgment({
      answerSupportJudgment: judgment,
      answerSupportLedger: ledger,
      answerSupportLedgerValidation: ledgerValidation,
    });
    const answerClaims: ReconstructMaturationAnswerClaimsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      answer_claims: [{
        answer_claim_id: "answer-claim-feature-object",
        question_id: "mq-feature-object",
        answer: "Two same-source refs.",
        answer_status: "answered",
        support_mode: "convergent_source_evidence",
        evidence_cluster_refs: ["cluster-a", "cluster-b"],
        supporting_evidence_refs: [sameSourceA, sameSourceB],
        target_surface_refs: ["static_surface"],
        target_dimension_refs: ["structure"],
        purpose_element_refs: ["purpose-element-feature-object"],
        limitation_refs: [],
      }],
      directive_author: { owner: "host_llm", author_id: "test-author" },
    };
    const validation = validateMaturationAnswerClaims({
      maturationAnswerClaims: answerClaims,
      maturationAnswerClaimsRef: "maturation-answer-claims.yaml",
      answerSupportLedger: ledger,
      answerSupportLedgerValidation: ledgerValidation,
      answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
      maturationQuestionFrontier: frontier,
      maturationQuestionFrontierValidation: frontierValidation,
      maturationQuestionFrontierValidationRef:
        "maturation-question-frontier-validation.yaml",
      answerSupportJudgment: judgment,
      answerSupportJudgmentValidation: judgmentValidation,
      answerSupportJudgmentValidationRef: "answer-support-judgment-validation.yaml",
    });
    expect(judgmentValidation.validation_status).toBe("valid");
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((v) => v.code))
      .toContain("insufficient_independent_evidence");
  });

  it("B-6: convergent claim that omits judge-confirmed evidence from its own refs is insufficient", () => {
    // Both clusters' evidence are judge-confirmed, but the claim only carries one
    // supporting_evidence_ref. Sufficiency follows the claim's OWN refs (Codex #3),
    // so this must fail even though the clusters contain two confirmed refs.
    const scenario = convergentClaimScenario();
    scenario.answerClaims.answer_claims[0]!.supporting_evidence_refs = [evidence];
    const validation = claimsValidationWithJudge(
      scenario,
      judgmentArtifact([{ evidence }, { evidence: evidence2 }]),
    );
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((v) => v.code))
      .toContain("insufficient_independent_evidence");
  });

  it("gate-enforce (R5): a judge-blocked convergent claim propagates to block downstream ontology expansion", () => {
    const scenario = convergentClaimScenario();
    // convergent claim with NO judgment => B-6 fail-closed => claims validation invalid
    const claimsValidation = claimsValidationWithJudge(scenario, null);
    expect(claimsValidation.validation_status).toBe("invalid");
    // the invalid claims validation must PROPAGATE: ontology expansion (a
    // downstream consumer) refuses to proceed, so a judge-less convergent claim
    // cannot advance end-to-end through the maturation pipeline.
    const expansionValidation = validateOntologyExpansion({
      ontologyExpansion: emptyOntologyExpansion(),
      maturationAnswerClaims: scenario.answerClaims,
      maturationAnswerClaimsValidation: claimsValidation,
      maturationAnswerClaimsValidationRef:
        "maturation-answer-claims-validation.yaml",
    });
    expect(expansionValidation.validation_status).toBe("invalid");
    expect(expansionValidation.violations.map((v) => v.code))
      .toContain("prior_validation_invalid");
  });
});

describe("maturation rejection branches", () => {
  // Pins "reject invalid artifact" behavior for emittable codes not already
  // asserted elsewhere. Each case deep-clones a VALID base and applies the
  // smallest shape-valid-but-semantically-invalid mutation.

  // Builds a closure frontier whose single source request targets an
  // inventoried-but-unobserved code source: a VALID base for closure
  // source-request rejection branches.
  function validClosureSourceRequestScenario() {
    const { frontier, frontierValidation } = frontierScenario();
    const closureFrontier: ReconstructMaturationClosureFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      round_id: "maturation-round-1",
      question_frontier_ref: "maturation-question-frontier.yaml",
      source_requests: [
        {
          source_request_id: "source-request-feature-extra",
          question_refs: ["mq-feature-object"],
          member_scope_refs: [],
          member_source_refs: [],
          cross_material_ref_refs: [],
          requested_source_ref: "src/feature-extra.ts",
          requested_location: "src/feature-extra.ts",
          target_material_kind: "code",
          expected_evidence_kind: "additional structural evidence",
          reason: "The request targets a new, not-yet-observed inventory source.",
        },
      ],
      authority_requests: [],
      directive_author: {
        owner: "host_llm",
        author_id: "test-author",
      },
    };
    return {
      frontier,
      frontierValidation,
      closureFrontier,
      runClosure: (
        target: ReconstructMaturationClosureFrontierArtifact,
      ): ReconstructMaturationClosureFrontierValidationArtifact =>
        validateMaturationClosureFrontier({
          maturationClosureFrontier: target,
          maturationClosureFrontierRef: "maturation-closure-frontier.yaml",
          maturationQuestionFrontier: frontier,
          maturationQuestionFrontierValidation: frontierValidation,
          maturationQuestionFrontierValidationRef:
            "maturation-question-frontier-validation.yaml",
          sourceInventory: sourceInventory([
            "src/feature.ts",
            "src/feature-extra.ts",
          ]),
          sourceInventoryRef: "source-inventory.yaml",
          sourceObservations: sourceObservations(["src/feature.ts"]),
          sourceObservationsRef: "source-observations.yaml",
          targetMaterialProfileValidation:
            validTargetMaterialProfileValidation(),
        }),
    };
  }

  it("accepts the closure source-request base before mutation", () => {
    const { closureFrontier, runClosure } = validClosureSourceRequestScenario();
    expect(runClosure(closureFrontier).validation_status).toBe("valid");
  });

  it("rejects a maturation baseline whose session_id does not match source-purpose candidates", () => {
    const maturationBaseline = structuredClone(baseline());
    maturationBaseline.session_id = "session-mismatch";

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
    expect(validation.violations.some((v) => v.code === "session_id_mismatch"))
      .toBe(true);
  });

  it("rejects a baseline row that loses member lineage when the target is mixed material", () => {
    const maturationBaseline = structuredClone(baseline());
    // Base baseline row carries no member lineage and no limitation refs, so a
    // mixed-material purpose target makes that row require preserved lineage.
    const mixedCandidates = structuredClone(sourcePurposeCandidates());
    mixedCandidates.target_material_kind = "mixed";

    const validation = validateMaturationBaseline({
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      sourcePurposeCandidates: mixedCandidates,
      sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
      purposeConfirmationValidation: validPurposeConfirmation(),
      ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
      competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
      handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
      sourceReconstructRecordSha256: sourceRecordSha,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "mixed_lineage_missing"))
      .toBe(true);
  });

  it("exempts mixed lineage only when the selected candidate is itself limitation-backed (@codex R3)", () => {
    const candidateLimitation = "limitation-mixed-member-lineage-unrecoverable";
    // Baseline rows carry no member lineage; the candidate-level limitation is surfaced
    // at the baseline top level (not copied onto rows).
    const maturationBaseline = baseline([], [candidateLimitation]);
    const validateMixed = (
      candidates: ReturnType<typeof sourcePurposeCandidates>,
    ) =>
      validateMaturationBaseline({
        maturationBaseline,
        maturationBaselineRef: "maturation-baseline.yaml",
        sourcePurposeCandidates: candidates,
        sourcePurposeCandidatesValidation: validSourcePurposeValidation(),
        purposeConfirmationValidation: validPurposeConfirmation(),
        ontologySeedValidation: { validation_status: "valid" } as ReconstructOntologySeedValidationArtifact,
        competencyQuestionAssessmentValidation: { validation_status: "valid" } as ReconstructCompetencyQuestionAssessmentValidationArtifact,
        handoffDecisionValidation: { validation_status: "valid" } as ReconstructHandoffDecisionValidationArtifact,
        sourceReconstructRecordSha256: sourceRecordSha,
      });

    // A limitation-backed mixed candidate: the upstream purpose validator already
    // accepted its limitation as justifying the missing member lineage, so its rows
    // are exempt from mixed_lineage_missing.
    const limitationBacked = structuredClone(
      sourcePurposeCandidates([candidateLimitation]),
    );
    limitationBacked.target_material_kind = "mixed";
    limitationBacked.purpose_candidates[0]!.purpose_source_status =
      "limitation_backed";
    expect(
      validateMixed(limitationBacked).violations.some((v) =>
        v.code === "mixed_lineage_missing"
      ),
    ).toBe(false);

    // Contrast: a NOT-limitation-backed mixed candidate is not exempted by an
    // incidental candidate limitation — each row still needs its own lineage or
    // limitation (the F2 row-scoped obligation is preserved).
    const notLimitationBacked = structuredClone(
      sourcePurposeCandidates([candidateLimitation]),
    );
    notLimitationBacked.target_material_kind = "mixed";
    expect(
      validateMixed(notLimitationBacked).violations.some((v) =>
        v.code === "mixed_lineage_missing"
      ),
    ).toBe(true);
  });

  it("rejects a closure source request whose source ref is not in source inventory", () => {
    const { closureFrontier, runClosure } = validClosureSourceRequestScenario();
    const mutated = structuredClone(closureFrontier);
    mutated.source_requests[0]!.requested_source_ref = "src/not-inventoried.ts";
    mutated.source_requests[0]!.requested_location = "src/not-inventoried.ts";

    const validation = runClosure(mutated);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "unsupported_source_ref"))
      .toBe(true);
  });

  it("rejects a closure source request whose location is semantic-only", () => {
    const { closureFrontier, runClosure } = validClosureSourceRequestScenario();
    const mutated = structuredClone(closureFrontier);
    mutated.source_requests[0]!.requested_location = "semantic:feature-extra";

    const validation = runClosure(mutated);

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "semantic_only_location"))
      .toBe(true);
  });
});

// M4b builder branch coverage for matrix shapes the all-closed readyDecision test cannot
// reach: (1) blockers while an EARLIER branch wins (unconditional field/fold), and (2)
// blockers with zero closed rows (must route to blocked, not an invalid actionable_limited).
describe("M4b continuation builder branches (revision blockers)", () => {
  function matrixWithSingleRow(
    readiness: ReconstructActionabilityMatrixRow["member_readiness"],
  ): ReconstructActionabilityMatrixArtifact {
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      maturation_baseline_ref: "maturation-baseline.yaml",
      maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
      candidate_limitation_refs: [],
      rows: [{
        matrix_row_id: "row-1",
        baseline_row_refs: ["baseline-row-1"],
        purpose_element_ref: "element-1",
        actionability_surface_ref: "surface-1",
        maturity_dimension_ref: "dimension-1",
        materiality: "high",
        materiality_ref: "materiality-1",
        member_scope_refs: [],
        member_target_material_kind: "code",
        member_readiness: readiness,
        member_source_refs: [],
        cross_material_ref_refs: [],
        competency_question_refs: [],
        competency_assessment_refs: [],
        maturity_level: "L1",
        supporting_refs: [],
        blocking_question_refs: [],
        limitation_refs: [],
        next_action: "n/a",
      }],
    } as unknown as ReconstructActionabilityMatrixArtifact;
  }

  function buildWith(
    matrix: ReconstructActionabilityMatrixArtifact,
    proposal: ReconstructRevisionProposalArtifact,
  ): ReconstructMaturationContinuationDecisionArtifact {
    return buildMaturationContinuationDecisionArtifact({
      sessionId: "session-1",
      actionabilityMatrix: matrix,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationConvergenceLedgerValidation: {
        ...emptyConvergenceLedgerValidation(),
        final_requestion_pass_status: "no_new_material_question",
      },
      maturationConvergenceLedgerValidationRef:
        "maturation-convergence-ledger-validation.yaml",
      maturationQuestionFrontier: {
        questions: [],
      } as unknown as ReconstructMaturationQuestionFrontierArtifact,
      maturationClosureFrontier: {
        authority_requests: [],
      } as unknown as ReconstructMaturationClosureFrontierArtifact,
      maturationClosureFrontierValidation:
        {} as unknown as ReconstructMaturationClosureFrontierValidationArtifact,
      maturationAuthorityResponse: {
        responses: [],
      } as unknown as ReconstructMaturationAuthorityResponseArtifact,
      ontologyExpansionValidation: emptyOntologyExpansionValidation(),
      revisionProposal: proposal,
      revisionProposalValidation: revisionProposalValidation(),
    });
  }

  it("records blockers unconditionally even when an earlier branch (frontier->blocked) wins", () => {
    const decision = buildWith(
      matrixWithSingleRow("frontier_required"),
      revisionProposal(["p1:reject"]),
    );
    // frontier_required material row forces blocked; the blocker field/fold is still set.
    expect(decision.decision_state).toBe("blocked");
    expect(decision.revision_blocker_limitation_refs).toEqual(["revision-blocker:p1"]);
    expect(decision.limitation_refs).toContain("revision-blocker:p1");
  });

  it("routes blockers with zero closed rows to blocked (not an invalid actionable_limited)", () => {
    const decision = buildWith(
      matrixWithSingleRow("out_of_scope"),
      revisionProposal(["p1:defer"]),
    );
    // No frontier/limitation/closed rows: the blocker branch must choose blocked, because
    // actionable_limited with zero included rows would fail validation and halt the run.
    expect(decision.decision_state).toBe("blocked");
    expect(decision.claim_scope.included_row_refs).toEqual([]);
    expect(decision.revision_blocker_limitation_refs).toEqual(["revision-blocker:p1"]);
  });

  it("allows actionable_ready when only reuse/extend/rename/split proposals remain", () => {
    const decision = buildWith(
      matrixWithSingleRow("closed"),
      revisionProposal(["p1:reuse", "p2:extend", "p3:rename", "p4:split"]),
    );
    expect(decision.revision_blocker_limitation_refs).toEqual([]);
    expect(decision.decision_state).toBe("actionable_ready");
  });
});
