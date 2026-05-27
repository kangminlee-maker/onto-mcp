import type {
  TargetMaterialKind,
  TargetMaterialRefDetection,
  TargetMaterialSupportStatus,
} from "../target-material-kind.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

export interface ReconstructSelectedSourceProfileRef {
  target_material_kind: TargetMaterialKind;
  profile_ref: string;
  support_summary: string;
  scan_targets: string[];
}

export interface ReconstructTargetMaterialProfileArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  target_refs: string[];
  target_material_kind: TargetMaterialKind;
  target_material_kind_candidates: TargetMaterialKind[];
  support_status: TargetMaterialSupportStatus;
  unsupported_reason: string | null;
  selected_source_profiles: ReconstructSelectedSourceProfileRef[];
  detection: {
    owner: "runtime_heuristic";
    confidence: number;
    confidence_basis: string;
    per_ref: TargetMaterialRefDetection[];
  };
}

export interface ReconstructSourceInventoryUnit {
  ref: string;
  exists: boolean;
  target_material_kind: TargetMaterialKind;
  inventory_unit: string;
  profile_ref: string | null;
  scan_status: "planned" | "skipped";
  skip_reason: string | null;
}

export interface ReconstructSourceInventoryArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  inventory_units: ReconstructSourceInventoryUnit[];
  scan_boundary: {
    filesystem_allowed_roots: string[];
    source: "binding";
  };
}

export interface ReconstructSourceObservationsArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  observations: ReconstructSourceObservation[];
  skipped_refs: Array<{
    ref: string;
    target_material_kind: TargetMaterialKind;
    reason: string;
  }>;
  validation_results: string[];
}

export interface ReconstructSourceObservationDirectiveSelection {
  observation_id: string;
  target_material_kind: TargetMaterialKind;
  source_ref: string;
  location: string;
  selection_rationale: string;
}

export interface ReconstructSourceObservationDirectiveArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  selected_observations: ReconstructSourceObservationDirectiveSelection[];
  open_questions: string[];
}

export interface ReconstructDirectiveValidationViolation {
  code:
    | "session_id_mismatch"
    | "empty_selection"
    | "duplicate_observation_ref"
    | "unknown_observation_ref"
    | "material_kind_mismatch"
    | "source_ref_mismatch"
    | "location_mismatch"
    | "selection_rationale_missing";
  message: string;
  observation_id: string | null;
}

export interface ReconstructSourceObservationDirectiveValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  directive_ref: string | null;
  source_observations_ref: string | null;
  validation_status: "valid" | "invalid";
  selected_observation_count: number;
  validation_results: string[];
  violations: ReconstructDirectiveValidationViolation[];
}

export interface ReconstructEvidenceRef {
  observation_id: string;
  target_material_kind: TargetMaterialKind;
  source_ref: string;
  location: string;
}

export interface ReconstructSeedClaim {
  claim_id: string;
  statement: string;
  evidence_refs: ReconstructEvidenceRef[];
}

export interface ReconstructSeedCandidateArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  purpose: ReconstructSeedClaim;
  non_goals: ReconstructSeedClaim[];
  entities: ReconstructSeedClaim[];
  relations: ReconstructSeedClaim[];
  actions: ReconstructSeedClaim[];
  properties: ReconstructSeedClaim[];
  rules: ReconstructSeedClaim[];
  open_questions: string[];
}

export interface ReconstructSeedCandidateValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "prior_observation_directive_invalid"
    | "claim_id_missing"
    | "duplicate_claim_id"
    | "claim_statement_missing"
    | "claim_evidence_missing"
    | "evidence_ref_shape_invalid"
    | "unknown_observation_ref"
    | "unselected_observation_ref"
    | "material_kind_mismatch"
    | "source_ref_mismatch"
    | "location_mismatch";
  message: string;
  claim_id: string | null;
  observation_id: string | null;
}

export interface ReconstructSeedCandidateValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  seed_candidate_ref: string | null;
  source_observations_ref: string | null;
  source_observation_directive_ref: string | null;
  source_observation_directive_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  semantic_claim_count: number;
  evidence_ref_count: number;
  validation_results: string[];
  violations: ReconstructSeedCandidateValidationViolation[];
}

export const RECONSTRUCT_STAGE_IDS = [
  "invocation_binding",
  "target_material_profile",
  "source_inventory",
  "source_observation",
  "observation_directive",
  "observation_directive_validation",
  "domain_context_selection",
  "domain_context_selection_validation",
  "seed_candidate",
  "seed_candidate_validation",
  "claim_realization",
  "claim_realization_validation",
  "seed_confirmation",
  "seed_confirmation_validation",
  "competency_questions",
  "competency_questions_validation",
  "competency_question_assessment",
  "competency_question_assessment_validation",
  "failure_classification",
  "failure_classification_validation",
  "revision_proposal",
  "revision_proposal_validation",
  "metrics",
  "stop_decision",
  "final_output",
  "record_assembly",
] as const;

export type ReconstructStageId = typeof RECONSTRUCT_STAGE_IDS[number];

export type ReconstructClaimRealizationStance =
  | "observed_runtime_behavior"
  | "declared_design_intent"
  | "schema_or_contract_presence"
  | "test_or_fixture_only"
  | "deferred_or_non_goal"
  | "unknown";

export interface ReconstructClaimRealization {
  claim_id: string;
  stance: ReconstructClaimRealizationStance;
  evidence_refs: ReconstructEvidenceRef[];
  rationale: string;
}

export interface ReconstructClaimRealizationMapArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  seed_candidate_ref: string | null;
  claim_realizations: ReconstructClaimRealization[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructPostSeedValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "prior_validation_invalid"
    | "missing_required_ref"
    | "missing_required_coverage"
    | "duplicate_id"
    | "unknown_id"
    | "conflicting_state"
    | "invalid_enum"
    | "rationale_missing"
    | "evidence_ref_missing"
    | "unknown_observation_ref"
    | "material_kind_mismatch"
    | "source_ref_mismatch"
    | "location_mismatch"
    | "final_output_provenance_missing";
  message: string;
  subject_id: string | null;
}

export interface ReconstructClaimRealizationMapValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  claim_realization_map_ref: string | null;
  seed_candidate_ref: string | null;
  source_observations_ref: string | null;
  validation_status: "valid" | "invalid";
  realized_claim_count: number;
  stance_counts: Record<ReconstructClaimRealizationStance, number>;
  validation_results: string[];
  violations: ReconstructPostSeedValidationViolation[];
}

export type ReconstructSeedConfirmationStatus =
  | "accepted"
  | "rejected"
  | "partial"
  | "deferred";

export interface ReconstructSeedConfirmationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  seed_candidate_ref: string | null;
  seed_candidate_validation_ref: string | null;
  confirmation_status: ReconstructSeedConfirmationStatus;
  confirmed_claim_ids: string[];
  rejected_claim_ids: string[];
  partial_claim_ids?: string[];
  deferred_claim_ids?: string[];
  notes: string[];
  confirmation_provider: {
    owner: "host_or_user" | "mock";
    provider_id: string;
  };
}

export interface ReconstructSeedConfirmationValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  seed_confirmation_ref: string | null;
  seed_candidate_ref: string | null;
  seed_candidate_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  accepted_claim_ids: string[];
  rejected_claim_ids: string[];
  partial_claim_ids: string[];
  deferred_claim_ids: string[];
  cq_eligible_claim_ids: string[];
  validation_results: string[];
  violations: ReconstructPostSeedValidationViolation[];
}

export interface ReconstructCompetencyQuestion {
  question_id: string;
  question: string;
  linked_claim_ids: string[];
  evidence_refs: ReconstructEvidenceRef[];
}

export interface ReconstructCompetencyQuestionsArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  seed_confirmation_ref: string | null;
  questions: ReconstructCompetencyQuestion[];
  open_questions: string[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructCompetencyQuestionsValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  competency_questions_ref: string | null;
  seed_confirmation_validation_ref: string | null;
  source_observations_ref: string | null;
  validation_status: "valid" | "invalid";
  competency_question_count: number;
  validation_results: string[];
  violations: ReconstructPostSeedValidationViolation[];
}

export type ReconstructCompetencyQuestionAnswerStatus =
  | "answered"
  | "partially_answered"
  | "not_answered"
  | "needs_evidence"
  | "out_of_scope";

export interface ReconstructCompetencyQuestionAssessment {
  question_id: string;
  answer_status: ReconstructCompetencyQuestionAnswerStatus;
  linked_claim_ids: string[];
  evidence_refs: ReconstructEvidenceRef[];
  rationale: string;
}

export interface ReconstructCompetencyQuestionAssessmentArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  competency_questions_ref: string | null;
  competency_questions_validation_ref: string | null;
  assessments: ReconstructCompetencyQuestionAssessment[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructCompetencyQuestionAssessmentValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  competency_question_assessment_ref: string | null;
  competency_questions_ref: string | null;
  validation_status: "valid" | "invalid";
  assessment_count: number;
  answer_status_counts: Record<ReconstructCompetencyQuestionAnswerStatus, number>;
  validation_results: string[];
  violations: ReconstructPostSeedValidationViolation[];
}

export type ReconstructFailureKind =
  | "unsupported_claim"
  | "unanswered_question"
  | "contradicted_evidence"
  | "insufficient_evidence"
  | "deferred_scope"
  | "out_of_scope";

export type ReconstructFailureRecommendedAction =
  | "revise_seed"
  | "collect_evidence"
  | "defer"
  | "reject_claim"
  | "ask_user";

export interface ReconstructFailureClassificationEntry {
  failure_id: string;
  failure_kind: ReconstructFailureKind;
  materiality: "material" | "non_material";
  question_id: string | null;
  claim_id: string | null;
  rationale: string;
  recommended_action: ReconstructFailureRecommendedAction;
}

export interface ReconstructFailureClassificationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  competency_question_assessment_ref: string | null;
  seed_confirmation_validation_ref: string | null;
  failures: ReconstructFailureClassificationEntry[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructFailureClassificationValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  failure_classification_ref: string | null;
  competency_question_assessment_ref: string | null;
  validation_status: "valid" | "invalid";
  failure_count: number;
  failure_kind_counts: Record<ReconstructFailureKind, number>;
  material_failure_count: number;
  validation_results: string[];
  violations: ReconstructPostSeedValidationViolation[];
}

export type ReconstructRevisionProposalAction =
  | "reuse"
  | "extend"
  | "rename"
  | "split"
  | "reject"
  | "defer";

export interface ReconstructRevisionProposalEntry {
  proposal_id: string;
  target_type: "claim" | "question" | "failure" | "seed" | "domain_context";
  target_id: string;
  action: ReconstructRevisionProposalAction;
  rationale: string;
  expected_effect: string;
}

export interface ReconstructRevisionProposalArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  failure_classification_ref: string | null;
  proposals: ReconstructRevisionProposalEntry[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructRevisionProposalValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  revision_proposal_ref: string | null;
  failure_classification_ref: string | null;
  validation_status: "valid" | "invalid";
  proposal_count: number;
  action_counts: Record<ReconstructRevisionProposalAction, number>;
  validation_results: string[];
  violations: ReconstructPostSeedValidationViolation[];
}

export interface ReconstructMetricsArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_observation_count: number;
  selected_observation_count: number;
  semantic_claim_count: number;
  evidence_ref_count: number;
  confirmed_claim_count: number;
  rejected_claim_count: number;
  partial_claim_count: number;
  deferred_claim_count: number;
  competency_question_count: number;
  competency_question_assessment_count: number;
  unresolved_question_count: number;
  deferred_count: number;
  claim_realization_stance_counts: Record<ReconstructClaimRealizationStance, number>;
  confirmation_state_counts: {
    accepted: number;
    rejected: number;
    partial: number;
    deferred: number;
  };
  competency_question_answer_status_counts:
    Record<ReconstructCompetencyQuestionAnswerStatus, number>;
  failure_kind_counts: Record<ReconstructFailureKind, number>;
  revision_proposal_action_counts: Record<ReconstructRevisionProposalAction, number>;
  pass_rate: number;
  validation_status: {
    source_observation_directive: ReconstructRecordValidationStatusProjection;
    seed_candidate: ReconstructRecordValidationStatusProjection;
    seed_confirmation: ReconstructSeedConfirmationStatus | "not_available";
    claim_realization: ReconstructRecordValidationStatusProjection;
    seed_confirmation_validation: ReconstructRecordValidationStatusProjection;
    competency_questions: ReconstructRecordValidationStatusProjection;
    competency_question_assessment: ReconstructRecordValidationStatusProjection;
    failure_classification: ReconstructRecordValidationStatusProjection;
    revision_proposal: ReconstructRecordValidationStatusProjection;
  };
}

export type ReconstructStopDecision = "stop" | "continue" | "ask_user";

export interface ReconstructStopDecisionArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  decision: ReconstructStopDecision;
  declared_purpose: string;
  metrics_ref: string | null;
  rationale: string;
  next_actions: string[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructRunManifestStep {
  step_id: ReconstructStageId;
  owner: "runtime" | "host_llm" | "host_or_user";
  performed_by: {
    authority: "runtime" | "host_llm" | "host_or_user";
    realization: "runtime" | "mock";
    actor_id: string;
  };
  status: "completed" | "skipped" | "failed";
  artifact_refs: string[];
}

export interface ReconstructRunManifestArtifact {
  schema_version: "1";
  session_id: string;
  entrypoint: "reconstruct";
  created_at: string;
  completed_at: string | null;
  target_refs: string[];
  intent: string;
  execution_profile: {
    runner: "material-aware-happy-path";
    semantic_author_realization: "mock";
    confirmation_provider_realization: "mock";
    directive_author_id: string;
    confirmation_provider_id: string;
  };
  artifact_refs: ReconstructRecordArtifactRefs & {
    reconstruct_record: string | null;
  };
  happy_path_scope: {
    implemented_artifacts: string[];
    deferred_artifacts: string[];
    deferred_reason: string;
  };
  steps: ReconstructRunManifestStep[];
  runtime_boundary: {
    semantic_generation: "not_performed";
    semantic_authority: "host_llm_or_mock_author";
  };
}

export type ReconstructRecordStage =
  | "incomplete"
  | "preparation_artifacts_written"
  | "source_observation_directive_validated"
  | "seed_candidate_validated"
  | "claim_realization_validated"
  | "seed_confirmed"
  | "seed_confirmation_validated"
  | "competency_questions_written"
  | "competency_questions_validated"
  | "competency_question_assessment_validated"
  | "failure_classification_validated"
  | "revision_proposal_validated"
  | "metrics_computed"
  | "stop_decision_written"
  | "completed";

export type ReconstructRecordValidationStatusProjection =
  | "valid"
  | "invalid"
  | "not_available";

export interface ReconstructRecordArtifactRefs {
  target_material_profile: string | null;
  source_inventory: string | null;
  source_observations: string | null;
  source_observation_directive: string | null;
  source_observation_directive_validation: string | null;
  domain_context_selection: string | null;
  domain_context_selection_validation: string | null;
  seed_candidate: string | null;
  seed_candidate_validation: string | null;
  claim_realization_map: string | null;
  claim_realization_map_validation: string | null;
  seed_confirmation: string | null;
  seed_confirmation_validation: string | null;
  competency_questions: string | null;
  competency_questions_validation: string | null;
  competency_question_assessment: string | null;
  competency_question_assessment_validation: string | null;
  failure_classification: string | null;
  failure_classification_validation: string | null;
  revision_proposal: string | null;
  revision_proposal_validation: string | null;
  reconstruct_metrics: string | null;
  stop_decision: string | null;
  final_output: string | null;
  reconstruct_run_manifest: string | null;
}

export interface ReconstructRecordArtifact {
  schema_version: "1";
  reconstruct_record_id: string;
  session_id: string;
  entrypoint: "reconstruct";
  record_stage: ReconstructRecordStage;
  created_at: string;
  updated_at: string;
  target_material_kind: TargetMaterialKind | null;
  support_status: TargetMaterialSupportStatus | null;
  artifact_refs: ReconstructRecordArtifactRefs;
  validation_summary: {
    source_observation_directive_status: ReconstructRecordValidationStatusProjection;
    seed_candidate_status: ReconstructRecordValidationStatusProjection;
    seed_confirmation_status: ReconstructSeedConfirmationStatus | "not_available";
    semantic_claim_count: number | null;
    evidence_ref_count: number | null;
    confirmed_claim_count: number | null;
    rejected_claim_count: number | null;
    partial_claim_count: number | null;
    deferred_claim_count: number | null;
    competency_question_count: number | null;
    competency_question_assessment_count: number | null;
    failure_count: number | null;
    revision_proposal_count: number | null;
    unresolved_count: number | null;
    deferred_count: number | null;
    pass_rate: number | null;
  };
  missing_artifacts: string[];
  runtime_boundary: {
    semantic_generation: "not_performed";
    runtime_owned_gates: string[];
    host_user_mediated_artifacts: string[];
    llm_owned_directives: string[];
  };
  warnings: string[];
}

export interface ReconstructPreparationArtifactRefs {
  target_material_profile: string;
  source_inventory: string;
  source_observations: string;
}
