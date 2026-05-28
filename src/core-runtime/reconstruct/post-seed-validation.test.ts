import { describe, expect, it } from "vitest";
import type {
  ReconstructClaimRealizationMapArtifact,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructFailureClassificationArtifact,
  ReconstructRevisionProposalArtifact,
  ReconstructSeedCandidateArtifact,
  ReconstructSeedCandidateValidationArtifact,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import {
  validateClaimRealizationMap,
  validateCompetencyQuestionAssessment,
  validateCompetencyQuestions,
  validateFailureClassification,
  validateFinalOutputProvenance,
  validateRevisionProposal,
  validateSeedConfirmation,
} from "./post-seed-validation.js";

const evidenceRef = {
  observation_id: "obs-1",
  target_material_kind: "code" as const,
  source_ref: "/tmp/source.ts",
  location: "file",
};

function sourceObservations(): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-05-27T00:00:00.000Z",
    observations: [
      {
        ...evidenceRef,
        adapter_id: "code-structure-observer",
        summary: "Runtime structural observation.",
        structural_data: {},
      },
    ],
    skipped_refs: [],
    validation_results: [],
  };
}

function seedCandidate(): ReconstructSeedCandidateArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-05-27T00:00:00.000Z",
    purpose: {
      claim_id: "claim-1",
      name: "Claim One",
      statement: "Claim one.",
      evidence_refs: [evidenceRef],
    },
    non_goals: [
      {
        claim_id: "claim-2",
        name: "Claim Two",
        statement: "Claim two.",
        evidence_refs: [evidenceRef],
      },
    ],
    entities: [],
    relations: [],
    actions: [],
    properties: [],
    rules: [],
    open_questions: [],
  };
}

function conceptCenteredSeedCandidate(): ReconstructSeedCandidateArtifact {
  return {
    schema_version: "1",
    seed_schema_version: "concept_centered",
    session_id: "session-1",
    created_at: "2026-05-27T00:00:00.000Z",
    purpose: {
      claim_id: "purpose-1",
      name: "Concept Seed Purpose",
      statement: "Explain the concept-centered Seed.",
      evidence_refs: [evidenceRef],
    },
    answerability_scope: {
      declared_handoff_questions: [
        {
          question_id: "question-1",
          question: "What top-level concept explains this Seed?",
          source: "declared_purpose",
        },
      ],
      supported_questions: [
        {
          question_id: "question-1",
          answered_by: {
            concept_ids: ["concept-1"],
            relation_ids: [],
          },
          confidence: "medium",
        },
      ],
      deferred_questions: [],
      unsupported_questions: [],
      supported_actions: [
        {
          action_id: "action-1",
          action: "Explain the concept Seed.",
          supported_by_question_ids: ["question-1"],
          readiness_statement: "Ready for concept-centered handoff.",
        },
      ],
      unsupported_actions: [],
      handoff_readiness_statement: "Ready for concept-centered handoff.",
      handoff_readiness_question_ids: ["question-1"],
    },
    top_level_concepts: [
      {
        concept_id: "concept-1",
        name: "Concept Seed",
        aliases: [],
        definition: "A top-level concept grounded in observed evidence.",
        why_top_level: "It explains the declared Seed purpose.",
        evidence_refs: [evidenceRef],
        boundary: {
          included_summary: "Observed source behavior.",
          excluded_summary: "Unobserved implementation details.",
          deferred_summary: "Future ontology formalization.",
        },
        confidence: "medium",
        provisional: false,
      },
    ],
    top_level_relations: [],
    relation_participation_exceptions: [
      {
        concept_id: "concept-1",
        isolation_reason: "Single concept Seed has no relation pair.",
        isolation_pressure_ids: ["pressure-1"],
      },
    ],
    lower_level_detail_placements: [
      {
        detail_id: "detail-1",
        name: "Observed Source",
        material_kind: "code",
        source_ref: "/tmp/source.ts",
        placement: "included_support",
        owner_concept_id: "concept-1",
        rationale: "The source supports the concept.",
        evidence_refs: [evidenceRef],
        follow_up_question: null,
      },
    ],
    frontier_pressure_log: [
      {
        pressure_id: "pressure-1",
        origin: "source_observation",
        origin_ref: "obs-1",
        pressure_type: "evidence_saturation",
        pressure_question: "Would more evidence change this concept?",
        target_concept_ids: ["concept-1"],
        target_relation_ids: [],
        material_kind: "code",
        source_ref: "/tmp/source.ts",
        expected_decision_impact: "May refine but does not block handoff.",
        priority: "low",
        status: "non_blocking",
        status_reason: "The pressure is disclosed and bounded.",
        superseded_by_pressure_id: null,
        evidence_refs: [evidenceRef],
      },
    ],
    material_coverage_checkpoint: {
      observed_material_kinds: ["code"],
      observed_source_slices: ["/tmp/source.ts"],
      source_authority_scope: {
        permission_scope: "within_declared_boundary",
        permission_basis_refs: ["/tmp/source.ts"],
        trust_status: "observed_evidence_only",
        instruction_authority_status: "none_data_only",
        external_content_handling: "not_applicable",
        restricted_source_refs: [],
        rationale: "The fixture source is evidence only.",
      },
      intentionally_excluded_material_kinds: [],
      unexplored_source_categories: [],
      possible_missing_axis_pressure_ids: [],
      rationale_for_seed_level_sufficiency: "Sufficient for bounded handoff.",
      partial_support_disclosures: [],
    },
    convergence: {
      state: "provisionally_converged",
      source_convergence_rationale: "No open pressure remains.",
      review_confirmed: false,
      review_profile_ref: null,
      remaining_pressure_ids: ["pressure-1"],
    },
    lifecycle: {
      seed_id: "seed-1",
      parent_seed_ref: null,
      id_stability_scope: "session",
      session_id: "session-1",
      source_snapshot_refs: ["/tmp/source.ts"],
      source_snapshot_transition: {
        prior_snapshot_refs: [],
        transition_reason: "Initial concept-centered Seed.",
      },
      exploration_rounds: [
        {
          round_id: "round-1",
          observed_source_refs: ["/tmp/source.ts"],
          authoring_pass_ref: "seed-candidate.yaml",
          changed_concept_ids: ["concept-1"],
          changed_relation_ids: [],
          changed_frontier_pressure_ids: ["pressure-1"],
        },
      ],
      concept_identity_events: [
        {
          event_id: "concept-event-1",
          event_type: "created",
          prior_concept_ids: [],
          current_concept_ids: ["concept-1"],
          target_detail_ids: [],
          prior_names: [],
          new_names: ["Concept Seed"],
          prior_aliases: [],
          current_aliases: [],
          reason: "Initial concept.",
          evidence_refs: [evidenceRef],
          frontier_pressure_ids: ["pressure-1"],
        },
      ],
      relation_identity_events: [],
      pressure_events: [
        {
          event_id: "pressure-event-1",
          event_type: "non_blocking",
          pressure_id: "pressure-1",
          prior_status: null,
          new_status: "non_blocking",
          superseded_by_pressure_id: null,
          reason: "Pressure is non-blocking.",
          evidence_refs: [evidenceRef],
        },
      ],
      detail_placement_events: [
        {
          event_id: "detail-event-1",
          event_type: "placed",
          detail_ids: ["detail-1"],
          reason: "Detail placed under concept.",
          evidence_refs: [evidenceRef],
          frontier_pressure_ids: ["pressure-1"],
        },
      ],
      answerability_events: [
        {
          event_id: "answerability-event-1",
          event_type: "question_supported",
          question_ids: ["question-1"],
          action_ids: ["action-1"],
          frontier_pressure_ids: [],
          reason: "Question is supported.",
        },
      ],
      material_coverage_events: [
        {
          event_id: "material-event-1",
          event_type: "source_slice_added",
          source_refs: ["/tmp/source.ts"],
          material_kinds: ["code"],
          changed_authority_fields: ["observed_source_slices"],
          prior_authority_state_ref: null,
          current_authority_state_ref: null,
          prior_authority_state: null,
          current_authority_state: {
            observed_source_slices: ["/tmp/source.ts"],
          },
          frontier_pressure_ids: ["pressure-1"],
          reason: "Observed source slice recorded.",
        },
      ],
      convergence_events: [
        {
          event_id: "convergence-event-1",
          prior_state: null,
          new_state: "provisionally_converged",
          frontier_pressure_ids: ["pressure-1"],
          reason: "No open pressure remains.",
        },
      ],
    },
  };
}

function seedCandidateValidation(): ReconstructSeedCandidateValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-05-27T00:00:00.000Z",
    seed_candidate_ref: "seed-candidate.yaml",
    source_observations_ref: "source-observations.yaml",
    source_observation_directive_ref: "source-observation-directive.yaml",
    source_observation_directive_validation_ref:
      "source-observation-directive-validation.yaml",
    validation_status: "valid",
    semantic_claim_count: 2,
    evidence_ref_count: 2,
    validation_results: ["seed_candidate_evidence_valid"],
    violations: [],
  };
}

function seedConfirmation(): ReconstructSeedConfirmationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-05-27T00:00:00.000Z",
    seed_candidate_ref: "seed-candidate.yaml",
    seed_candidate_validation_ref: "seed-candidate-validation.yaml",
    confirmation_status: "partial",
    confirmed_claim_ids: ["claim-1"],
    rejected_claim_ids: [],
    partial_claim_ids: ["claim-2"],
    deferred_claim_ids: [],
    notes: [],
    confirmation_provider: {
      owner: "mock",
      provider_id: "mock",
    },
  };
}

function seedConfirmationValidation():
  ReconstructSeedConfirmationValidationArtifact {
  return validateSeedConfirmation({
    seedConfirmation: seedConfirmation(),
    seedCandidate: seedCandidate(),
    seedCandidateValidation: seedCandidateValidation(),
  });
}

describe("post-seed reconstruct validation", () => {
  it("validates pure concept-centered authority through downstream claim gates", () => {
    const seed = conceptCenteredSeedCandidate();
    const claimIds = ["purpose-1", "concept-1", "question-1", "action-1"];
    const claimRealizationMap: ReconstructClaimRealizationMapArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      seed_candidate_ref: "seed-candidate.yaml",
      claim_realizations: claimIds.map((claimId) => ({
        claim_id: claimId,
        stance: "observed_runtime_behavior",
        evidence_refs: [evidenceRef],
        rationale: "Observed.",
      })),
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const claimValidation = validateClaimRealizationMap({
      claimRealizationMap,
      seedCandidate: seed,
      sourceObservations: sourceObservations(),
    });
    const confirmation: ReconstructSeedConfirmationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      seed_candidate_ref: "seed-candidate.yaml",
      seed_candidate_validation_ref: "seed-candidate-validation.yaml",
      confirmation_status: "accepted",
      confirmed_claim_ids: claimIds,
      rejected_claim_ids: [],
      partial_claim_ids: [],
      deferred_claim_ids: [],
      notes: [],
      confirmation_provider: {
        owner: "mock",
        provider_id: "mock",
      },
    };
    const confirmationValidation = validateSeedConfirmation({
      seedConfirmation: confirmation,
      seedCandidate: seed,
      seedCandidateValidation: {
        ...seedCandidateValidation(),
        semantic_claim_count: claimIds.length,
      },
    });
    const questions: ReconstructCompetencyQuestionsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      seed_confirmation_ref: "seed-confirmation.yaml",
      questions: [
        {
          question_id: "cq-1",
          question: "Can the concept-centered Seed explain every accepted claim?",
          linked_claim_ids: claimIds,
          evidence_refs: [evidenceRef],
        },
      ],
      open_questions: [],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const questionsValidation = validateCompetencyQuestions({
      competencyQuestions: questions,
      seedConfirmationValidation: confirmationValidation,
      sourceObservations: sourceObservations(),
    });

    expect(claimValidation.validation_status).toBe("valid");
    expect(confirmationValidation.validation_status).toBe("valid");
    expect(confirmationValidation.cq_eligible_claim_ids).toEqual(claimIds);
    expect(questionsValidation.validation_status).toBe("valid");
  });

  it("keeps deferred and unsupported answerability records out of CQ eligibility", () => {
    const seed = conceptCenteredSeedCandidate() as any;
    seed.answerability_scope.declared_handoff_questions.push(
      {
        question_id: "question-2",
        question: "What remains deferred?",
        source: "user_request",
      },
      {
        question_id: "question-3",
        question: "What is unsupported?",
        source: "user_request",
      },
    );
    seed.answerability_scope.deferred_questions.push({
      question_id: "question-2",
      reason_deferred: "Additional source exploration is required.",
      frontier_pressure_ids: ["pressure-1"],
    });
    seed.answerability_scope.unsupported_questions.push({
      question_id: "question-3",
      reason_unsupported: "The Seed does not claim this scope.",
    });
    seed.answerability_scope.unsupported_actions.push({
      action_id: "action-2",
      action: "Use the Seed as a full ontology.",
      reason_unsupported: "Seed output is not ontology-complete.",
    });
    const confirmation: ReconstructSeedConfirmationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      seed_candidate_ref: "seed-candidate.yaml",
      seed_candidate_validation_ref: "seed-candidate-validation.yaml",
      confirmation_status: "accepted",
      confirmed_claim_ids: [
        "purpose-1",
        "concept-1",
        "question-1",
        "action-1",
        "question-2",
        "question-3",
        "action-2",
      ],
      rejected_claim_ids: [],
      partial_claim_ids: [],
      deferred_claim_ids: [],
      notes: [],
      confirmation_provider: {
        owner: "mock",
        provider_id: "mock",
      },
    };

    const validation = validateSeedConfirmation({
      seedConfirmation: confirmation,
      seedCandidate: seed,
      seedCandidateValidation: {
        ...seedCandidateValidation(),
        semantic_claim_count: confirmation.confirmed_claim_ids.length,
      },
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.cq_eligible_claim_ids).toEqual([
      "purpose-1",
      "concept-1",
      "question-1",
      "action-1",
    ]);
  });

  it("validates complete claim realization coverage and evidence refs", () => {
    const artifact: ReconstructClaimRealizationMapArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      seed_candidate_ref: "seed-candidate.yaml",
      claim_realizations: [
        {
          claim_id: "claim-1",
          stance: "observed_runtime_behavior",
          evidence_refs: [evidenceRef],
          rationale: "Observed.",
        },
        {
          claim_id: "claim-2",
          stance: "declared_design_intent",
          evidence_refs: [evidenceRef],
          rationale: "Declared.",
        },
      ],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };

    const validation = validateClaimRealizationMap({
      claimRealizationMap: artifact,
      seedCandidate: seedCandidate(),
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.stance_counts.observed_runtime_behavior).toBe(1);
    expect(validation.stance_counts.declared_design_intent).toBe(1);
  });

  it("rejects missing confirmation coverage and conflicting claim states", () => {
    const confirmation = seedConfirmation();
    confirmation.confirmed_claim_ids = ["claim-1", "claim-2"];
    confirmation.rejected_claim_ids = ["claim-2"];

    const validation = validateSeedConfirmation({
      seedConfirmation: confirmation,
      seedCandidate: seedCandidate(),
      seedCandidateValidation: seedCandidateValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code))
      .toContain("conflicting_state");
  });

  it("validates competency question coverage and assessment exactly once", () => {
    const questions: ReconstructCompetencyQuestionsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      seed_confirmation_ref: "seed-confirmation.yaml",
      questions: [
        {
          question_id: "cq-1",
          question: "Can claim-1 be answered?",
          linked_claim_ids: ["claim-1"],
          evidence_refs: [evidenceRef],
        },
      ],
      open_questions: [],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const questionsValidation = validateCompetencyQuestions({
      competencyQuestions: questions,
      seedConfirmationValidation: seedConfirmationValidation(),
      sourceObservations: sourceObservations(),
    });
    const assessment: ReconstructCompetencyQuestionAssessmentArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      competency_questions_ref: "competency-questions.yaml",
      competency_questions_validation_ref: "competency-questions-validation.yaml",
      assessments: [
        {
          question_id: "cq-1",
          answer_status: "partially_answered",
          linked_claim_ids: ["claim-1"],
          evidence_refs: [evidenceRef],
          rationale: "Only partially answered.",
        },
      ],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };

    const assessmentValidation = validateCompetencyQuestionAssessment({
      competencyQuestionAssessment: assessment,
      competencyQuestions: questions,
    });

    expect(questionsValidation.validation_status).toBe("valid");
    expect(assessmentValidation.validation_status).toBe("valid");
    expect(assessmentValidation.answer_status_counts.partially_answered).toBe(1);
  });

  it("rejects competency questions that omit eligible confirmed claims", () => {
    const confirmationValidation = seedConfirmationValidation();
    confirmationValidation.accepted_claim_ids = ["claim-1", "claim-2"];
    confirmationValidation.cq_eligible_claim_ids = ["claim-1", "claim-2"];
    const questions: ReconstructCompetencyQuestionsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      seed_confirmation_ref: "seed-confirmation.yaml",
      questions: [
        {
          question_id: "cq-1",
          question: "Can claim-1 be answered?",
          linked_claim_ids: ["claim-1"],
          evidence_refs: [evidenceRef],
        },
      ],
      open_questions: [],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };

    const validation = validateCompetencyQuestions({
      competencyQuestions: questions,
      seedConfirmationValidation: confirmationValidation,
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({
        code: "missing_required_coverage",
        subject_id: "claim-2",
      }),
    );
  });

  it("validates failure and revision linkage", () => {
    const assessment: ReconstructCompetencyQuestionAssessmentArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      competency_questions_ref: "competency-questions.yaml",
      competency_questions_validation_ref: "competency-questions-validation.yaml",
      assessments: [
        {
          question_id: "cq-1",
          answer_status: "not_answered",
          linked_claim_ids: ["claim-1"],
          evidence_refs: [evidenceRef],
          rationale: "Not answered.",
        },
      ],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const failures: ReconstructFailureClassificationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      competency_question_assessment_ref: "competency-question-assessment.yaml",
      seed_confirmation_validation_ref: "seed-confirmation-validation.yaml",
      failures: [
        {
          failure_id: "failure-1",
          failure_kind: "unanswered_question",
          materiality: "material",
          question_id: "cq-1",
          claim_id: "claim-1",
          rationale: "Needs evidence.",
          recommended_action: "collect_evidence",
        },
      ],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const failureValidation = validateFailureClassification({
      failureClassification: failures,
      competencyQuestionAssessment: assessment,
      seedConfirmationValidation: seedConfirmationValidation(),
    });
    const revision: ReconstructRevisionProposalArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-27T00:00:00.000Z",
      failure_classification_ref: "failure-classification.yaml",
      proposals: [
        {
          proposal_id: "proposal-1",
          target_type: "failure",
          target_id: "failure-1",
          action: "extend",
          rationale: "Add evidence.",
          expected_effect: "Question becomes answerable.",
        },
      ],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const revisionValidation = validateRevisionProposal({
      revisionProposal: revision,
      failureClassification: failures,
    });

    expect(failureValidation.validation_status).toBe("valid");
    expect(failureValidation.material_failure_count).toBe(1);
    expect(revisionValidation.validation_status).toBe("valid");
    expect(revisionValidation.action_counts.extend).toBe(1);
  });

  it("detects missing final output provenance fragments", () => {
    const violations = validateFinalOutputProvenance({
      finalOutputText: "Reconstruct record: reconstruct-record.yaml",
      requiredFragments: ["reconstruct-record.yaml", "failure-1"],
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]?.code).toBe("final_output_provenance_missing");
  });
});
