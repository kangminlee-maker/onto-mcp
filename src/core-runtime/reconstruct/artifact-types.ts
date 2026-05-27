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

export type ReconstructSeedConfirmationStatus =
  | "accepted"
  | "rejected"
  | "partial";

export interface ReconstructSeedConfirmationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  seed_candidate_ref: string | null;
  seed_candidate_validation_ref: string | null;
  confirmation_status: ReconstructSeedConfirmationStatus;
  confirmed_claim_ids: string[];
  rejected_claim_ids: string[];
  notes: string[];
  confirmation_provider: {
    owner: "host_or_user" | "mock";
    provider_id: string;
  };
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
  competency_question_count: number;
  unresolved_question_count: number;
  pass_rate: number;
  validation_status: {
    source_observation_directive: ReconstructRecordValidationStatusProjection;
    seed_candidate: ReconstructRecordValidationStatusProjection;
    seed_confirmation: ReconstructSeedConfirmationStatus | "not_available";
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
  step_id: string;
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
  | "seed_confirmed"
  | "competency_questions_written"
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
  seed_candidate: string | null;
  seed_candidate_validation: string | null;
  seed_confirmation: string | null;
  competency_questions: string | null;
  failure_classification: string | null;
  revision_proposal: string | null;
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
    competency_question_count: number | null;
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
