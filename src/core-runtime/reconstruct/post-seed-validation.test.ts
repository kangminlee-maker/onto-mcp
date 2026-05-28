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
