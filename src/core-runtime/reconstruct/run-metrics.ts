import type {
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructClaimRealizationMapValidationArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructFailureClassificationValidationArtifact,
  ReconstructMaterialAdmissionLedgerValidationArtifact,
  ReconstructMetricsArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructRevisionProposalValidationArtifact,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import { ontologyClaims } from "./authoring-prompt-payloads.js";
import { isoNow } from "./run-primitives.js";
import { ontologySeedAnswerabilitySummary } from "./seed-claim-projections.js";

function answerabilitySummary(
  ontologySeed: ReconstructOntologySeedArtifact,
): ReconstructMetricsArtifact["answerability_summary"] {
  return ontologySeedAnswerabilitySummary(ontologySeed);
}

export function calculateMetrics(args: {
  sessionId: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact;
  sourceObservationDirectiveValidation:
    ReconstructSourceObservationDirectiveValidationArtifact;
  sourceSafetyLedgerValidation: ReconstructSourceSafetyLedgerValidationArtifact;
  materialAdmissionLedgerValidation:
    ReconstructMaterialAdmissionLedgerValidationArtifact;
  candidateDispositionValidation: ReconstructCandidateDispositionValidationArtifact;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  claimRealizationMapValidation: ReconstructClaimRealizationMapValidationArtifact;
  seedConfirmation: ReconstructSeedConfirmationArtifact;
  seedConfirmationValidation: ReconstructSeedConfirmationValidationArtifact;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionsValidation: ReconstructCompetencyQuestionsValidationArtifact;
  competencyQuestionAssessmentValidation:
    ReconstructCompetencyQuestionAssessmentValidationArtifact;
  failureClassificationValidation: ReconstructFailureClassificationValidationArtifact;
  revisionProposalValidation: ReconstructRevisionProposalValidationArtifact;
}): ReconstructMetricsArtifact {
  const validationStatus = {
    target_material_profile:
      args.targetMaterialProfileValidation.validation_status,
    source_observation_directive:
      args.sourceObservationDirectiveValidation.validation_status,
    source_safety: args.sourceSafetyLedgerValidation.validation_status,
    material_admission:
      args.materialAdmissionLedgerValidation.validation_status,
    candidate_disposition:
      args.candidateDispositionValidation.validation_status,
    ontology_seed: args.ontologySeedValidation.validation_status,
    seed_confirmation: args.seedConfirmation.confirmation_status,
    claim_realization: args.claimRealizationMapValidation.validation_status,
    seed_confirmation_validation:
      args.seedConfirmationValidation.validation_status,
    competency_questions: args.competencyQuestionsValidation.validation_status,
    competency_question_assessment:
      args.competencyQuestionAssessmentValidation.validation_status,
    failure_classification:
      args.failureClassificationValidation.validation_status,
    revision_proposal: args.revisionProposalValidation.validation_status,
  };
  const rejectedClaimCount =
    args.seedConfirmationValidation.rejected_claim_ids.length;
  const partialClaimCount = args.seedConfirmationValidation.partial_claim_ids.length;
  const deferredClaimCount =
    args.seedConfirmationValidation.deferred_claim_ids.length;
  const invalidGateCount = [
    validationStatus.source_observation_directive,
    validationStatus.target_material_profile,
    validationStatus.source_safety,
    validationStatus.material_admission,
    validationStatus.candidate_disposition,
    validationStatus.ontology_seed,
    validationStatus.claim_realization,
    validationStatus.seed_confirmation_validation,
    validationStatus.competency_questions,
    validationStatus.competency_question_assessment,
    validationStatus.failure_classification,
    validationStatus.revision_proposal,
  ].filter((status) => status !== "valid").length;
  const unresolvedQuestionCount =
    rejectedClaimCount +
    partialClaimCount +
    args.sourceObservations.skipped_refs.length +
    args.failureClassificationValidation.material_failure_count +
    args.competencyQuestions.open_questions.length +
    invalidGateCount;
  const competencyQuestionCount = args.competencyQuestions.questions.length;
  const passedQuestions = Math.max(
    0,
    competencyQuestionCount - unresolvedQuestionCount,
  );
  const answerStatusCounts =
    args.competencyQuestionAssessmentValidation.answer_status_counts;
  const projectedOntologyClaims = ontologyClaims(args.ontologySeed);

  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    source_observation_count: args.sourceObservations.observations.length,
    selected_observation_count:
      args.sourceObservationDirectiveValidation.selected_observation_count,
    semantic_claim_count: projectedOntologyClaims.length,
    evidence_ref_count: args.ontologySeedValidation.evidence_ref_count,
    confirmed_claim_count:
      args.seedConfirmationValidation.accepted_claim_ids.length,
    rejected_claim_count: rejectedClaimCount,
    partial_claim_count: partialClaimCount,
    deferred_claim_count: deferredClaimCount,
    competency_question_count: competencyQuestionCount,
    competency_question_assessment_count:
      args.competencyQuestionAssessmentValidation.assessment_count,
    unresolved_question_count: unresolvedQuestionCount,
    deferred_count: deferredClaimCount +
      answerStatusCounts.deferred +
      args.failureClassificationValidation.failure_kind_counts.deferred_scope,
    answerability_summary: answerabilitySummary(args.ontologySeed),
    claim_realization_stance_counts:
      args.claimRealizationMapValidation.stance_counts,
    confirmation_state_counts: {
      accepted: args.seedConfirmationValidation.accepted_claim_ids.length,
      rejected: rejectedClaimCount,
      partial: partialClaimCount,
      deferred: deferredClaimCount,
    },
    competency_question_answer_status_counts: answerStatusCounts,
    failure_kind_counts:
      args.failureClassificationValidation.failure_kind_counts,
    revision_proposal_action_counts: args.revisionProposalValidation.action_counts,
    pass_rate:
      competencyQuestionCount === 0
        ? 0
        : Number((passedQuestions / competencyQuestionCount).toFixed(4)),
    validation_status: validationStatus,
  };
}
