import type {
  TargetMaterialKind,
  TargetMaterialRefDetection,
  TargetMaterialSupportStatus,
} from "../target-material-kind.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

export interface ReconstructSelectedSourceProfileRef {
  profile_id: string;
  target_material_kind: TargetMaterialKind;
  is_default_for_kind: boolean;
  definition_ref: string | null;
  definition_sha256: string;
  profile_ref: string;
  contract_status: string;
  runtime_implementation_status: string;
  schema_version: number;
  profile_version: number;
  migration_status: string;
  supersedes: string[];
  replaced_by: string[];
  split_from: string[];
  split_into: string[];
  merged_from: string[];
  merged_into: string[];
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

export interface ReconstructTargetMaterialProfileValidationViolation {
  code:
    | "schema_shape_invalid"
    | "target_refs_empty"
    | "detection_ref_mismatch"
    | "selected_profile_missing"
    | "selected_profile_registry_mismatch"
    | "selected_profile_required_field_missing"
    | "target_kind_registry_record_missing"
    | "mixed_candidate_profile_missing"
    | "unsupported_reason_missing";
  message: string;
  subject_id: string | null;
}

export interface ReconstructTargetMaterialProfileValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  target_material_profile_ref: string | null;
  registry_ref: string | null;
  validation_status: "valid" | "invalid";
  target_ref_count: number;
  selected_source_profile_count: number;
  validation_results: string[];
  violations: ReconstructTargetMaterialProfileValidationViolation[];
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

export interface ReconstructInitialSourceFrontierRef {
  frontier_ref_id: string;
  source_ref: string;
  target_material_kind: TargetMaterialKind;
  inventory_unit: string;
  profile_ref: string | null;
  rationale: string;
}

export interface ReconstructInitialSourceFrontierArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  frontier_id: "initial";
  source_refs: ReconstructInitialSourceFrontierRef[];
  skipped_refs: Array<{
    source_ref: string;
    target_material_kind: TargetMaterialKind;
    reason: string;
    authority_impact: string;
  }>;
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

export interface ReconstructCandidateInventoryCandidate {
  candidate_id: string;
  candidate_kind: string;
  name: string;
  description: string;
  salience: "high" | "medium" | "low";
  evidence_refs: ReconstructEvidenceRef[];
}

export interface ReconstructCandidateInventoryArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_observations_ref: string | null;
  required_coverage_observation_ids?: string[];
  candidates: ReconstructCandidateInventoryCandidate[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructCandidateDisposition {
  candidate_id: string;
  disposition_id: string;
  target_seed_refs: string[];
  rationale: string;
  evidence_refs: ReconstructEvidenceRef[];
}

export interface ReconstructCandidateDispositionArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  candidate_inventory_ref: string | null;
  dispositions: ReconstructCandidateDisposition[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructCandidateDispositionValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "duplicate_candidate_id"
    | "duplicate_disposition"
    | "unknown_candidate_id"
    | "missing_candidate_disposition"
    | "invalid_candidate_kind"
    | "invalid_disposition"
    | "promoted_target_missing"
    | "target_ref_missing"
    | "rationale_missing"
    | "evidence_ref_missing"
    | "evidence_ref_shape_invalid"
    | "unknown_observation_ref"
    | "material_kind_mismatch"
    | "source_ref_mismatch"
    | "location_mismatch"
    | "source_observation_coverage_missing";
  message: string;
  candidate_id: string | null;
  observation_id: string | null;
}

export interface ReconstructCandidateDispositionValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  candidate_inventory_ref: string | null;
  candidate_disposition_ref: string | null;
  source_observations_ref: string | null;
  registry_ref: string | null;
  validation_status: "valid" | "invalid";
  candidate_count: number;
  disposition_count: number;
  promoted_candidate_count: number;
  validation_results: string[];
  violations: ReconstructCandidateDispositionValidationViolation[];
}

export interface ReconstructOntologySeedValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "missing_required_field"
    | "duplicate_id"
    | "unknown_ref"
    | "invalid_enum"
    | "evidence_ref_missing"
    | "evidence_ref_shape_invalid"
    | "unknown_observation_ref"
    | "material_kind_mismatch"
    | "source_ref_mismatch"
    | "location_mismatch"
    | "source_ref_unknown"
    | "limitation_ref_unknown"
    | "candidate_authority_ref_invalid"
    | "promoted_candidate_ref_unknown"
    | "candidate_target_ref_invalid"
    | "action_binding_missing"
    | "permission_missing"
    | "data_binding_missing";
  message: string;
  subject_id: string | null;
  observation_id: string | null;
}

export interface ReconstructOntologySeedValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  ontology_seed_ref: string | null;
  candidate_disposition_ref: string | null;
  source_observations_ref: string | null;
  registry_ref: string | null;
  validation_status: "valid" | "invalid";
  seed_ref_count: number;
  evidence_ref_count: number;
  limitation_count: number;
  validation_results: string[];
  violations: ReconstructOntologySeedValidationViolation[];
}

export type ReconstructOntologySeedArtifact = Record<string, unknown>;

export interface ReconstructSeedClaim {
  claim_id: string;
  seed_ref_path: string;
  projection_source: "actionable_ontology_seed";
  evidence_policy: "direct_evidence_only";
  name: string;
  statement: string;
  evidence_refs: ReconstructEvidenceRef[];
}

export interface ReconstructLensJudgmentArtifact {
  schema_version: "1";
  session_id: string;
  round_id: string;
  lens_id: string;
  created_at: string;
  source_observation_directive_ref: string | null;
  candidate_labels: Array<{
    label_id: string;
    label: string;
    evidence_refs: ReconstructEvidenceRef[];
    rationale: string;
  }>;
  semantic_gaps: Array<{
    gap_id: string;
    description: string;
    evidence_refs: ReconstructEvidenceRef[];
    requested_source_refs: string[];
    materiality_rationale: string;
  }>;
  no_next_frontier_rationale: string | null;
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructLensJudgmentIndexArtifact {
  schema_version: "1";
  session_id: string;
  round_id: string;
  created_at: string;
  lens_judgment_refs: Array<{
    lens_id: string;
    artifact_ref: string;
  }>;
}

export interface ReconstructExplorationSynthesisArtifact {
  schema_version: "1";
  session_id: string;
  round_id: string;
  created_at: string;
  lens_judgment_index_ref: string | null;
  accepted_gaps: Array<{
    gap_id: string;
    lens_id: string;
    description: string;
    evidence_refs: ReconstructEvidenceRef[];
  }>;
  requested_source_refs: Array<{
    source_ref: string;
    rationale: string;
    priority: "high" | "medium" | "low";
  }>;
  no_next_frontier_rationale: string | null;
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructSourceFrontierArtifact {
  schema_version: "1";
  session_id: string;
  round_id: string;
  created_at: string;
  exploration_synthesis_ref: string | null;
  frontier_refs: Array<{
    frontier_ref_id: string;
    source_ref: string;
    rationale: string;
    priority: "high" | "medium" | "low";
  }>;
  no_next_frontier_rationale: string | null;
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructSourceFrontierValidationArtifact {
  schema_version: "1";
  session_id: string;
  round_id: string;
  created_at: string;
  source_frontier_ref: string | null;
  source_inventory_ref: string | null;
  source_observations_ref: string | null;
  target_material_profile_validation_ref: string | null;
  upstream_validation_statuses: {
    target_material_profile: ReconstructRecordValidationStatusProjection;
  };
  validation_status: "valid" | "invalid";
  accepted_frontier_ref_ids: string[];
  rejected_frontier_refs: Array<{
    frontier_ref_id: string | null;
    source_ref: string | null;
    reason: string;
  }>;
  no_next_frontier_accepted: boolean;
  validation_results: string[];
}

export const RECONSTRUCT_STAGE_IDS = [
  "invocation_binding",
  "target_material_profile",
  "target_material_profile_validation",
  "source_inventory",
  "initial_source_frontier",
  "source_observation",
  "observation_directive",
  "observation_directive_validation",
  "lens_judgment",
  "exploration_synthesis",
  "source_frontier",
  "source_frontier_validation",
  "candidate_inventory",
  "candidate_disposition",
  "candidate_disposition_validation",
  "ontology_seed",
  "ontology_seed_validation",
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
  "pre_handoff_run_manifest_validation",
  "handoff_decision_validation",
  "final_output",
  "final_output_provenance_validation",
  "record_assembly",
  "post_publication_run_manifest_validation",
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
  ontology_seed_ref: string | null;
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
    | "manifest_step_missing"
    | "manifest_artifact_ref_missing"
    | "manifest_artifact_missing"
    | "manifest_snapshot_missing"
    | "manifest_snapshot_mismatch"
    | "handoff_required_validation_missing"
    | "handoff_required_validation_invalid"
    | "handoff_decision_inconsistent"
    | "final_output_provenance_missing";
  message: string;
  subject_id: string | null;
}

export interface ReconstructClaimRealizationMapValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  claim_realization_map_ref: string | null;
  ontology_seed_ref: string | null;
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
  ontology_seed_ref: string | null;
  ontology_seed_validation_ref: string | null;
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
  ontology_seed_ref: string | null;
  ontology_seed_validation_ref: string | null;
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
  coverage_axis_refs: string[];
  ontology_handoff_axis_refs: string[];
  seed_ref_refs: string[];
  limitation_refs: string[];
  reasoning_or_formalism_facets: string[];
  entity_identity_facets: string[];
  instance_assertion_facets: string[];
  terminology_facets: string[];
  relation_type_facets: string[];
  classification_facets: string[];
  constraint_facets: string[];
  modeling_concern_facets: string[];
  domain_competency_trace_refs: string[];
  reference_standard_refs: string[];
  pattern_catalog_refs: string[];
  query_access_contract_refs: string[];
  visualization_contract_refs: string[];
  graph_exploration_contract_refs: string[];
  domain_competency_semantic_assessments: ReconstructDomainCompetencySemanticAssessment[];
  coverage_disposition: "covered" | "limited" | "unsupported" | "deferred" | "not_applicable";
  expected_answer_kind: "yes_no" | "explanation" | "list" | "mapping" | "gap_statement";
  handoff_relevance: "required" | "supporting" | "diagnostic";
  lifecycle_status: "active" | "deferred" | "unsupported_candidate";
  rationale: string;
  evidence_refs: ReconstructEvidenceRef[];
}

export interface ReconstructDomainCompetencySemanticAssessment {
  competency_id: string;
  source_anchor: string;
  applicability_verdict: "applicable" | "not_applicable" | "deferred";
  semantic_alignment: "preserved" | "limited" | "not_assessed";
  rationale: string;
  evidence_refs: ReconstructEvidenceRef[];
}

export interface ReconstructCompetencyQuestionsArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  seed_confirmation_ref: string | null;
  ontology_seed_ref?: string | null;
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
  reconstruct_run_manifest_ref?: string | null;
  seed_confirmation_validation_ref: string | null;
  ontology_seed_ref?: string | null;
  ontology_seed_validation_ref?: string | null;
  source_observations_ref: string | null;
  admitted_domain_competency_refs?: string[];
  admitted_domain_competency_source_refs?: string[];
  required_admitted_competency_ids?: string[];
  validation_status: "valid" | "invalid";
  competency_question_count: number;
  required_evidence_scope_projection: Array<{
    question_id: string;
    required_evidence_scope: string[];
  }>;
  validation_results: string[];
  violations: ReconstructPostSeedValidationViolation[];
}

export type ReconstructCompetencyQuestionAnswerStatus =
  | "answerable"
  | "partially_answerable"
  | "unsupported"
  | "deferred"
  | "contradicted"
  | "not_applicable";

export interface ReconstructCompetencyQuestionAssessment {
  question_id: string;
  answer_status: ReconstructCompetencyQuestionAnswerStatus;
  answer_summary: string;
  required_seed_refs: string[];
  linked_claim_ids: string[];
  evidence_refs: ReconstructEvidenceRef[];
  missing_source_or_confirmation: string | null;
  ambiguity_notes: string[];
  downstream_effect:
    | "ready"
    | "limited"
    | "blocks_handoff"
    | "blocked_by_missing_source_or_confirmation"
    | "not_applicable";
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
  answerability_summary: {
    declared_question_count: number;
    supported_question_count: number;
    deferred_question_count: number;
    unsupported_question_count: number;
    supported_action_count: number;
    unsupported_action_count: number;
  };
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
    target_material_profile: ReconstructRecordValidationStatusProjection;
    source_observation_directive: ReconstructRecordValidationStatusProjection;
    candidate_disposition: ReconstructRecordValidationStatusProjection;
    ontology_seed: ReconstructRecordValidationStatusProjection;
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
    realization: "runtime" | "mock" | "direct_call";
    actor_id: string;
  };
  status: "completed" | "skipped" | "failed";
  artifact_refs: string[];
  reason?: string;
  authority_impact?: string;
}

export interface ReconstructRunSnapshotFamily {
  family_id: string;
  source_ref: string | null;
  sha256: string;
  item_count: number;
  selected_ids: string[];
}

export interface ReconstructRunActiveContractSnapshot {
  contract_id: string;
  ref: string;
  sha256: string;
  role: string;
  schema_version: number;
  migration_status: string;
}

export interface ReconstructRunGoverningSnapshot {
  registry: {
    registry_id: string;
    registry_ref: string;
    registry_sha256: string;
    schema_version: number;
    status: string;
  };
  active_contracts: ReconstructRunActiveContractSnapshot[];
  selected_source_profiles: ReconstructSelectedSourceProfileRef[];
  validation_gate_catalog: ReconstructValidationGateSnapshot[];
  validator_versions: Array<{
    validator_id: string;
    validator_version: number;
    gate_ids: string[];
    output_ref: string;
  }>;
  snapshot_families: ReconstructRunSnapshotFamily[];
  selected_reference_standard_ids: string[];
  selected_reference_standard_version_or_snapshot_ids: Record<string, string>;
  selected_pattern_catalog_ids: string[];
  selected_pattern_catalog_version_or_snapshot_ids: Record<string, string>;
  selected_pattern_catalog_canonical_uris: Record<string, string>;
  requested_domain_ids: string[];
  /**
   * Runtime projection derived from admitted_domain_competency_snapshots for
   * admitted domain identity refs such as domain:ontology. The per-domain
   * snapshot rows are the governing authority.
   */
  admitted_domain_competency_refs: string[];
  /**
   * Runtime projection of admitted competency source document refs. These refs
   * identify source documents, not traceable competency ids.
   */
  admitted_domain_competency_source_refs: string[];
  admitted_domain_competency_snapshots: ReconstructRunAdmittedDomainCompetencySnapshot[];
  /**
   * Runtime projections derived from admitted_domain_competency_snapshots. They
   * are stored for exact validation and downstream gates, not as independent
   * semantic authority.
   */
  required_admitted_competency_ids: string[];
  admitted_competency_priorities: Record<string, string>;
  competency_id_migration_mappings: ReconstructRunCompetencyIdMigrationMapping[];
  lens_ids: string[];
  migration_status_values: {
    source_profile: string[];
    contract: string[];
  };
}

export interface ReconstructRunAdmittedDomainCompetencySnapshot {
  source_ref: string;
  source_sha256: string;
  source_seat: "project" | "user" | "installation";
  authority_resolution_order: string[];
  domain_id: string;
  competency_parser_id: string;
  competency_parser_version: string;
  admission_policy: string;
  admitted_competencies: Array<{
    competency_id: string;
    qualified_competency_id: string;
    priority: string;
    question: string;
    section_heading: string | null;
    inference_path: string;
    verification_criteria: string;
    source_anchor: string;
  }>;
  required_admitted_competency_ids: string[];
  admitted_competency_priorities: Record<string, string>;
  competency_id_migration_mappings: ReconstructRunCompetencyIdMigrationMapping[];
}

export interface ReconstructRunCompetencyIdMigrationMapping {
  competency_id: string;
  source_version_or_snapshot_id: string;
  migration_status: string;
  supersedes: string[];
  replaced_by: string[];
  split_from: string[];
  split_into: string[];
  merged_from: string[];
  merged_into: string[];
}

export interface ReconstructValidationGateSnapshot {
  gate_id: string;
  validation_artifact_ref: string;
  required_when: string;
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
    profile_kind: "observer_gate_slice" | "mock_semantic_slice" | "full_integral_exploration";
    runner: "material-aware-purpose-adequacy" | "integral-exploration-direct-call";
    semantic_author_realization: "mock" | "direct_call";
    confirmation_provider_realization: "mock" | "direct_call";
    directive_author_id: string;
    confirmation_provider_id: string;
    allowed_completion_claim: string;
  };
  artifact_refs: ReconstructRecordArtifactRefs & {
    reconstruct_record: string | null;
  };
  governing_snapshot: ReconstructRunGoverningSnapshot;
  purpose_adequacy_scope: {
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

export interface ReconstructRunManifestValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  reconstruct_run_manifest_ref: string | null;
  validation_status: "valid" | "invalid";
  completed_step_count: number;
  skipped_step_count: number;
  validation_results: string[];
  violations: ReconstructPostSeedValidationViolation[];
}

export type ReconstructReadinessProjection =
  | "ready"
  | "limited"
  | "not_ready"
  | "blocked";

export interface ReconstructHandoffDecisionValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  stop_decision_ref: string | null;
  pre_handoff_run_manifest_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  readiness_projection_source: "runtime_gate_projection";
  readiness_projection: ReconstructReadinessProjection;
  required_validation_statuses: Record<string, ReconstructRecordValidationStatusProjection>;
  gate_projection: Array<{
    gate_id: string;
    gate_instance_id?: string;
    round_id?: string | null;
    validation_artifact_ref: string;
    concrete_validation_artifact_ref?: string | null;
    required_when: string;
    predicate_instance_id?: string;
    predicate_phase?: string;
    predicate_evaluator_id?: string;
    predicate_evaluator_version?: number;
    predicate_input_authority_refs?: string[];
    predicate_concrete_input_refs?: string[];
    predicate_truth_expression?: string;
    predicate_result?: boolean | null;
    unknown_projection?: string;
    explanation?: string;
    applicability:
      | "applicable"
      | "not_applicable"
      | "self_validation_output"
      | "unknown";
    validation_status: ReconstructRecordValidationStatusProjection;
  }>;
  material_failure_count: number;
  unresolved_count: number;
  validation_results: string[];
  violations: ReconstructPostSeedValidationViolation[];
}

export interface ReconstructFinalOutputProvenanceValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  final_output_ref: string;
  validation_status: "valid" | "invalid";
  required_fragments: string[];
  section_bindings: Array<{
    section_id: string;
    heading: string;
    claim_summary: string;
    authority_refs: string[];
    validation_refs: string[];
    required_fragments: string[];
    binding_status: "present" | "missing";
    trust_status: "grounded" | "unbound";
  }>;
  validation_results: string[];
  violations: ReconstructPostSeedValidationViolation[];
}

export type ReconstructRecordStage =
  | "incomplete"
  | "preparation_artifacts_written"
  | "source_observation_directive_validated"
  | "candidate_disposition_validated"
  | "ontology_seed_validated"
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
  | "pre_handoff_run_manifest_validated"
  | "handoff_decision_validated"
  | "completed";

export type ReconstructRecordValidationStatusProjection =
  | "valid"
  | "invalid"
  | "not_applicable"
  | "not_available";

export interface ReconstructRecordArtifactRefs {
  target_material_profile: string | null;
  target_material_profile_validation: string | null;
  source_inventory: string | null;
  initial_source_frontier: string | null;
  source_observations: string | null;
  source_observation_directive: string | null;
  source_observation_directive_validation: string | null;
  lens_judgment_index: string | null;
  exploration_synthesis: string | null;
  source_frontier: string | null;
  source_frontier_validation: string | null;
  candidate_inventory: string | null;
  candidate_disposition: string | null;
  candidate_disposition_validation: string | null;
  ontology_seed: string | null;
  ontology_seed_validation: string | null;
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
  pre_handoff_run_manifest_validation: string | null;
  post_publication_run_manifest_validation: string | null;
  handoff_decision_validation: string | null;
  final_output: string | null;
  final_output_provenance_validation: string | null;
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
    target_material_profile_status: ReconstructRecordValidationStatusProjection;
    source_observation_directive_status: ReconstructRecordValidationStatusProjection;
    candidate_disposition_status: ReconstructRecordValidationStatusProjection;
    ontology_seed_status: ReconstructRecordValidationStatusProjection;
    claim_realization_status: ReconstructRecordValidationStatusProjection;
    seed_confirmation_status: ReconstructSeedConfirmationStatus | "not_available";
    pre_handoff_run_manifest_status: ReconstructRecordValidationStatusProjection;
    post_publication_run_manifest_status: ReconstructRecordValidationStatusProjection;
    handoff_decision_status: ReconstructRecordValidationStatusProjection;
    final_output_provenance_status: ReconstructRecordValidationStatusProjection;
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
  initial_source_frontier: string;
  source_observations: string;
}
