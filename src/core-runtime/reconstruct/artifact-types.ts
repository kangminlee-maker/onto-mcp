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

export type ReconstructRunControlRequestedStage =
  | "seeding"
  | "maturation"
  | "handoff"
  | "resume"
  | "retry";

export type ReconstructRunControlDuplicatePolicy =
  | "return_existing"
  | "continue_existing"
  | "reject_conflict"
  | "create_new_session";

export type ReconstructRunControlRequestStatus =
  | "accepted"
  | "duplicate_same_request"
  | "duplicate_conflict"
  | "rejected_conflict";

export type ReconstructRunControlAttemptKind =
  | "initial"
  | "retry"
  | "resume"
  | "continuation"
  | "recovery";

export type ReconstructRunControlAttemptStatus =
  | "running"
  | "completed"
  | "failed"
  | "halted"
  | "recovered"
  | "abandoned";

export type ReconstructRunControlLockStatus =
  | "held"
  | "released"
  | "expired"
  | "stolen_invalid"
  | "conflict_blocked";

export type ReconstructRunControlTransactionStatus =
  | "prepared"
  | "committed"
  | "rolled_back"
  | "quarantined"
  | "failed";

export type ReconstructRunControlResumeDecision =
  | "resume_allowed"
  | "resume_pending_provenance"
  | "retry_required"
  | "blocked_conflict"
  | "blocked_stale"
  | "blocked_partial_write";

export interface ReconstructRunControlRequestRow {
  request_id: string;
  idempotency_key_hash: string;
  request_fingerprint: string;
  target_signature_ref: string;
  requested_stage: ReconstructRunControlRequestedStage;
  duplicate_policy: ReconstructRunControlDuplicatePolicy;
  request_status: ReconstructRunControlRequestStatus;
}

export interface ReconstructRunControlAttemptRow {
  attempt_id: string;
  parent_attempt_id: string | null;
  attempt_kind: ReconstructRunControlAttemptKind;
  trigger_ref: string | null;
  started_at: string;
  completed_at: string | null;
  attempt_status: ReconstructRunControlAttemptStatus;
  recovery_from_refs: string[];
}

export interface ReconstructRunControlLockRow {
  lock_id: string;
  lock_scope: "session_root" | "artifact_path" | "promotion_request" | "source_snapshot" | "registry_promotion";
  owner_attempt_id: string;
  lease_started_at: string;
  lease_expires_at: string;
  lock_token_hash: string;
  conflict_policy: "fail_loud" | "optimistic_compare_and_swap" | "recover_expired_lease";
  lock_status: ReconstructRunControlLockStatus;
}

export interface ReconstructRunControlWriteTransactionRow {
  transaction_id: string;
  owner_attempt_id: string;
  artifact_ref: string;
  temp_ref: string | null;
  expected_prior_hash: string | null;
  committed_hash: string | null;
  commit_method:
    | "atomic_rename"
    | "compare_and_swap"
    | "append_only"
    | "observed_file_hash";
  transaction_status: ReconstructRunControlTransactionStatus;
  recovery_ref: string | null;
}

export interface ReconstructRunControlResumeRow {
  resume_id: string;
  resume_token_hash: string;
  source_attempt_id: string;
  compatibility_policy?: "authored_artifact_provenance:v1";
  compatibility_check_refs?: string[];
  checkpoint_refs: string[];
  trusted_artifact_refs: string[];
  stale_artifact_refs: string[];
  required_revalidation_refs: string[];
  resume_decision: ReconstructRunControlResumeDecision;
}

export interface ReconstructRunControlArtifact {
  schema_version: "1";
  session_id: string;
  session_root: string;
  created_at: string;
  updated_at: string;
  runtime_version: string;
  request_rows: ReconstructRunControlRequestRow[];
  attempt_rows: ReconstructRunControlAttemptRow[];
  lock_rows: ReconstructRunControlLockRow[];
  write_transactions: ReconstructRunControlWriteTransactionRow[];
  resume_rows: ReconstructRunControlResumeRow[];
}

export interface ReconstructRunControlValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "session_root_missing"
    | "request_row_missing"
    | "attempt_row_missing"
    | "active_attempt_missing"
    | "session_lock_missing"
    | "conflicting_request"
    | "conflicting_lock"
    | "invalid_transaction"
    | "transaction_hash_missing"
    | "terminal_validation_missing"
    | "terminal_validation_invalid"
    | "expected_transaction_missing"
    | "invalid_resume";
  message: string;
  subject_id: string | null;
}

export interface ReconstructRunControlValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  reconstruct_run_control_ref: string | null;
  validation_status: "valid" | "invalid";
  request_count: number;
  attempt_count: number;
  active_lock_count: number;
  transaction_count: number;
  current_attempt_id: string | null;
  validation_results: string[];
  violations: ReconstructRunControlValidationViolation[];
}

export interface ReconstructRunBootstrapDiagnosticArtifact {
  schema_version: "1";
  emitted_at: string;
  attempted_session_root: string;
  request_fingerprint: string;
  idempotency_key_hash: string;
  failure_kind:
    | "lock_conflict"
    | "duplicate_same_request"
    | "duplicate_conflict"
    | "partial_write_detected"
    | "stale_resume"
    | "invalid_request"
    | "missing_run_control";
  conflicting_refs: string[];
  partial_refs: string[];
  safe_recovery_action:
    | "return_existing"
    | "retry_with_new_session"
    | "resume_after_recovery"
    | "manual_cleanup_required"
    | "ask_user";
  diagnostic_source: "runtime_control_bootstrap";
}

export interface ReconstructRegistryVerificationEvidenceRow {
  evidence_id: string;
  evidence_kind:
    | "registry_snapshot"
    | "artifact_authority_row"
    | "validation_gate_row"
    | "validator_row"
    | "predicate_row"
    | "source_profile_row";
  subject_id: string;
  evidence_ref: string;
  evidence_status: "verified" | "pending_verification" | "invalid";
  evidence_hash: string | null;
}

export interface ReconstructRegistryVerificationEvidenceArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  registry_ref: string;
  registry_sha256: string;
  active_artifact_authority_ids: string[];
  active_validation_gate_ids: string[];
  active_validator_ids: string[];
  required_when_predicate_ids: string[];
  source_profile_ids: string[];
  evidence_rows: ReconstructRegistryVerificationEvidenceRow[];
}

export interface ReconstructRegistryVerificationEvidenceValidationViolation {
  code:
    | "schema_shape_invalid"
    | "registry_hash_missing"
    | "registry_hash_mismatch"
    | "registry_ref_mismatch"
    | "registry_claim_mismatch"
    | "duplicate_id"
    | "active_gate_without_validator"
    | "validator_unknown_gate"
    | "predicate_missing_for_gate"
    | "evidence_row_missing"
    | "invalid_evidence_status";
  message: string;
  subject_id: string | null;
}

export interface ReconstructRegistryVerificationEvidenceValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  registry_verification_evidence_ref: string | null;
  registry_ref: string | null;
  validation_status: "valid" | "invalid";
  artifact_authority_count: number;
  validation_gate_count: number;
  validator_count: number;
  predicate_count: number;
  source_profile_count: number;
  validation_results: string[];
  violations: ReconstructRegistryVerificationEvidenceValidationViolation[];
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

export type ReconstructSourceSafetySubjectKind = "source_ref";

export type ReconstructSourceSafetyLifecycleState =
  | "active"
  | "retired"
  | "disposed"
  | "invalidated"
  | "stale"
  | "missing";

export type ReconstructSourceSafetyAuthorizationState =
  | "authorized"
  | "unauthorized"
  | "unknown"
  | "not_required";

export type ReconstructSourceSafetyPrivacyState =
  | "non_sensitive"
  | "privacy_sensitive"
  | "unknown";

export type ReconstructSourceSafetyRedactionState =
  | "none"
  | "redacted"
  | "required"
  | "insufficient";

export type ReconstructSourceSafetyProofSufficiencyState =
  | "sufficient_for_claim"
  | "insufficient_for_claim"
  | "trace_only"
  | "unavailable";

export type ReconstructSourceSafetyReplayState =
  | "replay_allowed"
  | "replay_with_redaction"
  | "no_replay_use"
  | "unknown";

export type ReconstructSourceSafetyIntendedConsumption =
  | "prompt_context"
  | "evidence_support"
  | "public_output"
  | "replay"
  | "material_claim";

export type ReconstructSourceSafetyCanonicalAxis =
  | "lifecycle_state"
  | "authorization_state"
  | "privacy_state"
  | "redaction_state"
  | "proof_sufficiency_state"
  | "replay_state";

export type ReconstructSourceSafetyVisibilityTier =
  | "consumption_allowed"
  | "internal_only"
  | "redacted_output_only"
  | "no_prompt_use"
  | "no_replay_use";

export type ReconstructSourceSafetyAllowedProofForm =
  | "raw_value"
  | "hash"
  | "bounded_summary"
  | "source_ref_only"
  | "unavailable";

export type ReconstructSourceObservationDeltaFrontierKind =
  | "source_frontier"
  | "maturation_closure_frontier";

export interface ReconstructSourceObservationDeltaRow {
  delta_row_id: string;
  frontier_ref_id: string;
  source_ref: string;
  observation_id: string;
  observation_batch_id: string;
  triggering_frontier_validation_ref: string;
  target_material_kind: TargetMaterialKind;
  observation_hash: string;
  lineage_status: "added" | "skipped_duplicate" | "failed";
  limitation_refs: string[];
}

export interface ReconstructSourceObservationDeltaArtifact {
  schema_version: "1";
  session_id: string;
  round_id: string;
  created_at: string;
  frontier_kind: ReconstructSourceObservationDeltaFrontierKind;
  frontier_ref: string;
  frontier_validation_ref: string;
  source_inventory_ref: string;
  previous_source_observations_ref: string;
  source_observations_ref: string;
  accepted_frontier_ref_ids: string[];
  added_observation_ids: string[];
  delta_rows: ReconstructSourceObservationDeltaRow[];
}

export interface ReconstructSourceObservationLineageIndexArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  lineage_rows: Array<{
    lineage_row_id: string;
    round_id: string;
    frontier_kind: ReconstructSourceObservationDeltaFrontierKind;
    source_observation_delta_ref: string;
    source_observation_delta_validation_ref: string;
    source_observation_reentry_validation_ref: string;
    added_observation_ids: string[];
  }>;
}

export interface ReconstructSourceObservationLineageIndexValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "round_id_mismatch"
    | "duplicate_id"
    | "lineage_delta_missing"
    | "lineage_delta_validation_missing"
    | "lineage_reentry_validation_missing"
    | "lineage_delta_validation_invalid"
    | "lineage_reentry_validation_invalid"
    | "lineage_validation_ref_mismatch"
    | "lineage_added_observation_mismatch"
    | "lineage_observation_missing"
    | "frontier_kind_mismatch";
  message: string;
  subject_id: string | null;
}

export interface ReconstructSourceObservationLineageIndexValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_observation_lineage_index_ref: string | null;
  source_observations_ref: string | null;
  validation_status: "valid" | "invalid";
  lineage_row_count: number;
  added_observation_count: number;
  validation_results: string[];
  violations: ReconstructSourceObservationLineageIndexValidationViolation[];
}

export interface ReconstructSourceObservationDeltaValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "round_id_mismatch"
    | "frontier_kind_mismatch"
    | "frontier_validation_invalid"
    | "accepted_frontier_missing"
    | "accepted_frontier_ref_set_mismatch"
    | "delta_row_missing"
    | "delta_row_unknown_frontier"
    | "delta_row_unknown_observation"
    | "added_observation_id_set_mismatch"
    | "source_ref_mismatch"
    | "target_material_kind_mismatch"
    | "observation_hash_mismatch"
    | "observation_lineage_identity_missing"
    | "observation_batch_mismatch"
    | "duplicate_id";
  message: string;
  subject_id: string | null;
}

export interface ReconstructSourceObservationDeltaValidationArtifact {
  schema_version: "1";
  session_id: string;
  round_id: string;
  created_at: string;
  source_observation_delta_ref: string | null;
  frontier_ref: string | null;
  frontier_validation_ref: string | null;
  source_observations_ref: string | null;
  validation_status: "valid" | "invalid";
  accepted_frontier_ref_count: number;
  added_observation_count: number;
  validation_results: string[];
  violations: ReconstructSourceObservationDeltaValidationViolation[];
}

export interface ReconstructSourceObservationReentryValidationViolation {
  code:
    | "schema_shape_invalid"
    | "delta_validation_invalid"
    | "source_safety_validation_invalid"
    | "delta_observation_missing_from_source_observations"
    | "delta_observation_missing_safety_row"
    | "delta_observation_not_prompt_visible";
  message: string;
  subject_id: string | null;
}

export interface ReconstructSourceObservationReentryValidationArtifact {
  schema_version: "1";
  session_id: string;
  round_id: string;
  created_at: string;
  source_observation_delta_validation_ref: string | null;
  source_safety_ledger_validation_ref: string | null;
  source_observations_ref: string | null;
  validation_status: "valid" | "invalid";
  reentered_observation_ids: string[];
  validation_results: string[];
  violations: ReconstructSourceObservationReentryValidationViolation[];
}

export interface ReconstructSourceSafetyRow {
  safety_row_id: string;
  subject_ref: string;
  subject_kind: ReconstructSourceSafetySubjectKind;
  lifecycle_state: ReconstructSourceSafetyLifecycleState;
  authorization_state: ReconstructSourceSafetyAuthorizationState;
  privacy_state: ReconstructSourceSafetyPrivacyState;
  redaction_state: ReconstructSourceSafetyRedactionState;
  proof_sufficiency_state: ReconstructSourceSafetyProofSufficiencyState;
  replay_state: ReconstructSourceSafetyReplayState;
  visibility_tier: ReconstructSourceSafetyVisibilityTier;
  visibility_derivation: {
    intended_consumption: ReconstructSourceSafetyIntendedConsumption;
    derived_from_axes: ReconstructSourceSafetyCanonicalAxis[];
    derivation_rule_ref: string;
  };
  authorization_scope_ref: string | null;
  redaction_evidence: {
    raw_value_available: boolean;
    allowed_proof_forms: ReconstructSourceSafetyAllowedProofForm[];
    redaction_rule_ref: string | null;
  };
  tombstone: {
    tombstone_ref: string | null;
    reason: string | null;
    retired_at: string | null;
    downstream_refs: string[];
  };
  limitation_refs: string[];
}

export interface ReconstructSourceSafetyLedgerArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_observations_ref: string | null;
  safety_rows: ReconstructSourceSafetyRow[];
}

export interface ReconstructSourceSafetyValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "duplicate_id"
    | "missing_required_field"
    | "invalid_enum"
    | "source_observation_missing"
    | "source_observation_safety_row_missing"
    | "visibility_axis_set_invalid"
    | "visibility_derivation_mismatch"
    | "supporting_detail_contradiction";
  message: string;
  subject_id: string | null;
  axis: ReconstructSourceSafetyCanonicalAxis | null;
}

export interface ReconstructSourceSafetyLedgerValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_safety_ledger_ref: string | null;
  source_observations_ref: string | null;
  validation_status: "valid" | "invalid";
  safety_row_count: number;
  no_prompt_use_count: number;
  redacted_output_only_count: number;
  validation_results: string[];
  violations: ReconstructSourceSafetyValidationViolation[];
}

export type ReconstructSourceScoutSignalAxis =
  | "actor"
  | "action"
  | "state"
  | "guard"
  | "object"
  | "declared_purpose"
  | "source_claim"
  | "instruction_cue"
  | "provenance_cue"
  | "limitation";

export type ReconstructSourceScoutSignalBasis =
  | "path"
  | "basename"
  | "heading"
  | "symbol"
  | "excerpt"
  | "schema"
  | "test"
  | "api"
  | "config";

export type ReconstructSourceScoutPromptVisibilityState =
  | "prompt_visible"
  | "redacted"
  | "blocked";

export type ReconstructSourceScoutIntendedConsumption =
  | "scout_prompt_input"
  | "evidence_support"
  | "replay"
  | "public_projection";

export type ReconstructSourceScoutCoverageAxis =
  | ReconstructSourceScoutSignalAxis
  | "profile_local";

export type ReconstructSourceScoutCoverageStatus =
  | "present"
  | "missing"
  | "limitation_cue"
  | "blocked_by_safety";

export type ReconstructSourceScoutScopeState =
  | "supported_single_member_code_or_document"
  | "unsupported_material_scope"
  | "member_scoped_composite";

export interface ReconstructSourceScoutSignalRow {
  signal_row_id: string;
  observation_id: string;
  source_ref: string;
  target_material_kind: TargetMaterialKind;
  signal_axis: ReconstructSourceScoutSignalAxis;
  signal_basis: ReconstructSourceScoutSignalBasis;
  matched_text: string | null;
  matched_text_sha256: string | null;
  evidence_locator: string;
  profile_ref: string | null;
  source_observation_ref: string | null;
  source_observation_content_sha256: string | null;
  source_safety_row_id: string | null;
  source_safety_ledger_ref: string | null;
  source_safety_ledger_validation_ref: string | null;
  prompt_visibility_state: ReconstructSourceScoutPromptVisibilityState;
  intended_consumption: ReconstructSourceScoutIntendedConsumption;
  redaction_summary: string | null;
  limitation_refs: string[];
}

export interface ReconstructSourceScoutCoverageSlot {
  coverage_slot_id: string;
  coverage_axis: ReconstructSourceScoutCoverageAxis;
  target_material_kind: TargetMaterialKind | null;
  status: ReconstructSourceScoutCoverageStatus;
  signal_row_refs: string[];
  limitation_refs: string[];
}

export interface ReconstructSourceScoutPackArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  scout_focus: "actor_action_state";
  scout_scope: {
    scope_state: ReconstructSourceScoutScopeState;
    target_material_kind: TargetMaterialKind;
    target_ref_count: number;
    selected_source_profile_refs: string[];
    limitation_refs: string[];
  };
  source_observations_ref: string | null;
  source_safety_ledger_ref: string | null;
  source_safety_ledger_validation_ref: string | null;
  target_material_profile_ref: string | null;
  target_material_profile_validation_ref: string | null;
  source_observation_lineage_index_validation_ref: string | null;
  input_snapshot_hashes: {
    source_observations_sha256: string | null;
    source_safety_ledger_sha256: string | null;
    source_safety_ledger_validation_sha256: string | null;
    target_material_profile_validation_sha256: string | null;
    source_observation_lineage_index_validation_sha256: string | null;
  };
  signal_rows: ReconstructSourceScoutSignalRow[];
  profile_scout_coverage_slots: ReconstructSourceScoutCoverageSlot[];
  omitted_signal_summary: Array<{
    observation_id: string;
    source_ref: string;
    reason: "no_profile_local_signal" | "blocked_by_source_safety";
    source_safety_row_id: string | null;
    visibility_tier: ReconstructSourceSafetyVisibilityTier | null;
  }>;
  boundary_notes: string[];
}

export interface ReconstructSourceScoutPackValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "source_observations_hash_mismatch"
    | "source_safety_hash_mismatch"
    | "target_material_profile_validation_hash_mismatch"
    | "source_observation_lineage_index_validation_ref_mismatch"
    | "source_observation_lineage_index_validation_hash_mismatch"
    | "source_safety_validation_invalid"
    | "target_material_profile_validation_invalid"
    | "unsupported_scope_overclaimed"
    | "selected_purpose_authority_leak"
    | "invalid_signal_axis"
    | "invalid_signal_basis"
    | "invalid_prompt_visibility_state"
    | "signal_observation_missing"
    | "signal_safety_row_missing"
    | "prompt_visible_signal_without_valid_safety"
    | "prompt_visible_signal_without_consumption_allowed_tier"
    | "coverage_slot_signal_missing"
    | "duplicate_id";
  message: string;
  subject_id: string | null;
}

export interface ReconstructSourceScoutPackValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_scout_pack_ref: string | null;
  source_observations_ref: string | null;
  source_observations_sha256: string | null;
  source_safety_ledger_ref: string | null;
  source_safety_ledger_sha256: string | null;
  source_safety_ledger_validation_ref: string | null;
  source_safety_ledger_validation_sha256: string | null;
  target_material_profile_validation_ref: string | null;
  target_material_profile_validation_sha256: string | null;
  source_observation_lineage_index_validation_ref: string | null;
  source_observation_lineage_index_validation_sha256: string | null;
  scout_scope: ReconstructSourceScoutPackArtifact["scout_scope"];
  validation_status: "valid" | "invalid";
  signal_row_count: number;
  prompt_visible_signal_count: number;
  coverage_slot_count: number;
  validation_results: string[];
  violations: ReconstructSourceScoutPackValidationViolation[];
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

export type ReconstructPurposeEvidenceKind = "P1" | "P2" | "P3" | "P4" | "P5";
export type ReconstructPurposeSourceStatus =
  | "explicit_source_declared"
  | "convergent_inferred"
  | "limitation_backed"
  | "unresolved";

export interface ReconstructPurposeAdequacyRequiredElement {
  element_id: string;
  element_kind: string;
  material_facet_kind: string;
  description: string;
  actionability_surface_refs: string[];
  maturity_dimension_refs: string[];
  member_scope_refs: string[];
  member_target_material_kind: TargetMaterialKind | null;
  member_source_refs: string[];
  cross_material_ref_refs: string[];
  supporting_evidence_refs: ReconstructEvidenceRef[];
  expected_seed_ref_families: string[];
  closure_expectation: "model_or_limit" | "frontier_required";
}

export interface ReconstructPurposeAdequacyFrame {
  frame_id: string;
  frame_kind: string;
  frame_status:
    | "source_declared"
    | "evidence_inferred"
    | "limitation_backed"
    | "unresolved";
  adequacy_claim: string;
  material_kind_requirements: {
    target_material_kind: TargetMaterialKind;
    required_facets: string[];
    optional_facets: string[];
    rationale: string;
  };
  required_elements: ReconstructPurposeAdequacyRequiredElement[];
}

export interface ReconstructSourcePurposeCandidate {
  purpose_candidate_id: string;
  statement: string;
  rank: "primary" | "secondary" | "candidate" | "rejected";
  purpose_source_status: ReconstructPurposeSourceStatus;
  evidence_kind_refs: ReconstructPurposeEvidenceKind[];
  supporting_evidence_refs: ReconstructEvidenceRef[];
  contradicting_source_refs: string[];
  adequacy_frame: ReconstructPurposeAdequacyFrame;
  ranking_rationale: string;
  limitation_refs: string[];
}

export interface ReconstructSourcePurposeCandidatesArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  target_material_kind: TargetMaterialKind;
  source_observations_ref: string | null;
  selected_source_profile_refs: ReconstructSelectedSourceProfileRef[];
  purpose_candidates: ReconstructSourcePurposeCandidate[];
  selection: {
    primary_purpose_candidate_id: string | null;
    selection_basis: string;
    confirmation_policy_hint: string;
    unresolved_reason: string | null;
  };
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructSourcePurposeValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "duplicate_id"
    | "missing_required_field"
    | "missing_primary_purpose"
    | "multiple_primary_purpose"
    | "selected_primary_mismatch"
    | "invalid_enum"
    | "alias_field_present"
    | "p5_only_primary"
    | "insufficient_inferred_evidence"
    | "evidence_ref_missing"
    | "evidence_ref_shape_invalid"
    | "unknown_observation_ref"
    | "material_kind_mismatch"
    | "source_ref_mismatch"
    | "location_mismatch"
    | "required_element_missing"
    | "mixed_lineage_missing"
    | "contradiction_unresolved"
    | "conflicting_state";
  message: string;
  subject_id: string | null;
  evidence_ref: ReconstructEvidenceRef | null;
}

export interface ReconstructSourcePurposeCandidatesValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_purpose_candidates_ref: string | null;
  source_observations_ref: string | null;
  registry_ref: string | null;
  validation_status: "valid" | "invalid";
  selected_purpose_candidate_id: string | null;
  selected_purpose_frame_id: string | null;
  confirmation_required: boolean;
  validation_results: string[];
  violations: ReconstructSourcePurposeValidationViolation[];
}

export interface ReconstructPurposeConfirmationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_purpose_candidates_ref: string | null;
  source_purpose_candidates_validation_ref: string | null;
  purpose_candidate_id: string | null;
  confirmation_status:
    | "not_required"
    | "pending"
    | "confirmed"
    | "rejected"
    | "revised_pending_evidence_check"
    | "revised_confirmed"
    | "not_available";
  confirmed_statement: string | null;
  revised_statement: string | null;
  confirmed_frame_element_refs: string[];
  rejected_frame_element_refs: string[];
  user_response_summary: string;
  source_conflict_policy: string;
  limitation_refs: string[];
  confirmation_provider: {
    owner: "host_or_user" | "mock";
    provider_id: string;
  };
}

export interface ReconstructPurposeConfirmationValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  purpose_confirmation_ref: string | null;
  source_purpose_candidates_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  purpose_projection_status: "usable" | "blocked" | "rerun_required";
  confirmed_purpose_candidate_id: string | null;
  confirmed_statement: string | null;
  seed_readiness_effect:
    | "may_project_ready_or_limited"
    | "must_project_blocked"
    | "must_rerun_purpose_discovery";
  validation_results: string[];
  violations: ReconstructSourcePurposeValidationViolation[];
}

export type ReconstructMaterialAdmissionPhase =
  | "pre_seed_purpose_element"
  | "pre_seed_material_value"
  | "post_cq_domain_competency"
  | "maturation_reassessment";

export type ReconstructMaterialAdmissionInputKind =
  | "purpose_adequacy_element"
  | "material_value"
  | "domain_competency_question";

export type ReconstructMaterialAdmissionDisposition =
  | "admitted_material"
  | "trace_audit_only"
  | "out_of_scope"
  | "deferred_authority"
  | "rejected_ambiguous"
  | "required_blocking"
  | "supporting_material"
  | "diagnostic_only"
  | "deferred_product_decision";

export type ReconstructMateriality =
  | "blocker"
  | "high"
  | "medium"
  | "low"
  | "info";

export type ReconstructMaterialAdmissionMateriality = ReconstructMateriality;

export interface ReconstructMaterialAdmissionRow {
  admission_id: string;
  admission_phase: ReconstructMaterialAdmissionPhase;
  input_kind: ReconstructMaterialAdmissionInputKind;
  input_ref: string;
  source_refs: string[];
  purpose_element_snapshot_ref: string | null;
  value_snapshot_ref: string | null;
  competency_snapshot_ref: string | null;
  admission_policy_ref: string;
  disposition: ReconstructMaterialAdmissionDisposition;
  materiality: ReconstructMaterialAdmissionMateriality;
  purpose_element_refs: string[];
  actionability_surface_refs: string[];
  maturity_dimension_refs: string[];
  downstream_authority_refs: string[];
  supersedes_admission_refs: string[];
  limitation_refs: string[];
  rationale: string;
}

export interface ReconstructMaterialAdmissionLedgerArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_purpose_candidates_ref: string | null;
  source_purpose_candidates_validation_ref: string | null;
  purpose_confirmation_validation_ref: string | null;
  admission_rows: ReconstructMaterialAdmissionRow[];
}

export interface ReconstructMaterialAdmissionValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "duplicate_id"
    | "missing_required_field"
    | "invalid_enum"
    | "unknown_source_ref"
    | "unknown_purpose_element_ref"
    | "missing_snapshot_ref"
    | "invalid_phase_input_kind"
    | "downstream_consumer_missing"
    | "diagnostic_affects_actionability"
    | "rejected_without_replayable_evidence"
    | "superseded_ref_unknown"
    | "prior_validation_invalid";
  message: string;
  admission_id: string | null;
  input_ref: string | null;
}

export interface ReconstructMaterialAdmissionLedgerValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  material_admission_ledger_ref: string | null;
  source_purpose_candidates_validation_ref: string | null;
  candidate_disposition_validation_ref: string | null;
  ontology_seed_validation_ref: string | null;
  maturation_baseline_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  admission_row_count: number;
  required_or_admitted_row_count: number;
  downstream_consumed_row_count: number;
  validation_results: string[];
  violations: ReconstructMaterialAdmissionValidationViolation[];
}

export type ReconstructSeedAuthoringReadinessClassification =
  | "seed_ready"
  | "limited_seed_possible"
  | "frontier_required"
  | "purpose_confirmation_required"
  | "blocked_no_authority"
  | "blocked_validation_gap";

export type ReconstructSeedAuthoringFrontierAvailability =
  | "none"
  | "concrete_frontier_available"
  | "no_concrete_frontier"
  | "unknown";

export type ReconstructSeedAuthoringSourceSufficiencyState =
  | "sufficient_for_claim_scope"
  | "insufficient_for_claim_scope"
  | "unknown_until_frontier"
  | "not_evaluated_due_non_source_blocker"
  | "not_evaluated_due_validation_gap";

export type ReconstructSeedAuthoringExplorationBudgetState =
  | "within_budget"
  | "max_round_exhausted";

export type ReconstructSeedAuthoringMaxRoundExhaustionInterpretation =
  | "not_exhausted"
  | "exhausted_after_sufficient_selected_scope"
  | "exhausted_with_open_frontier"
  | "exhausted_with_non_source_blocker"
  | "exhausted_not_evaluated_due_validation_gap";

export type ReconstructSeedAuthoringLimitationClosureState =
  | "none"
  | "limitation_backed"
  | "limitation_required"
  | "invalid_limitation";

export type ReconstructSeedAuthoringClosureAxis =
  | "purpose"
  | "actor"
  | "action"
  | "object_data"
  | "state_transition"
  | "guard_policy"
  | "static_core"
  | "profile_local";

export type ReconstructSeedAuthoringClosureState =
  | "evidence_backed"
  | "limitation_backed"
  | "frontier_backed"
  | "missing"
  | "unsupported"
  | "blocked_by_validation_gap";

export interface ReconstructSeedAuthoringReadinessInputAuthorityRefs {
  target_material_profile_validation_ref: string | null;
  source_scout_pack_validation_ref: string | null;
  source_observation_directive_validation_ref: string | null;
  source_purpose_candidates_validation_ref: string | null;
  purpose_confirmation_validation_ref: string | null;
  material_admission_ledger_ref: string | null;
  candidate_disposition_validation_ref: string | null;
  source_frontier_validation_refs: string[];
  source_observation_delta_validation_refs: string[];
  source_observation_reentry_validation_refs: string[];
  source_observation_lineage_index_validation_ref: string | null;
}

export interface ReconstructSeedAuthoringClosureRow {
  closure_row_id: string;
  required_element_ref: string;
  material_admission_row_ref: string | null;
  closure_axis: ReconstructSeedAuthoringClosureAxis;
  claim_scope: string;
  closure_state: ReconstructSeedAuthoringClosureState;
  evidence_refs: ReconstructEvidenceRef[];
  limitation_refs: string[];
  frontier_refs: string[];
  validated_upstream_refs: string[];
  member_scope_refs: string[];
  source_safety_refs: string[];
  llm_authority_refs: string[];
}

export interface ReconstructSeedAuthoringDomainRequiredCategoryRow {
  category_id: string;
  category_name: string;
  category_source_ref: string;
  category_closure_state:
    | "included"
    | "evidence_backed"
    | "limitation_backed"
    | "frontier_backed"
    | "missing"
    | "blocked_by_validation_gap";
  purpose_required_element_refs: string[];
  closure_row_refs: string[];
  limitation_refs: string[];
  frontier_refs: string[];
}

export interface ReconstructSeedAuthoringReadinessArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  taxonomy_version: "seed_authoring_readiness:v1";
  enum_owner: "reconstruct-contract-registry.yaml#seed_authoring_readiness_taxonomy";
  selected_purpose_candidate_ref: string | null;
  purpose_adequacy_frame_ref: string | null;
  input_authority_refs: ReconstructSeedAuthoringReadinessInputAuthorityRefs;
  scope_support_ref: string | null;
  readiness_classification: ReconstructSeedAuthoringReadinessClassification;
  missing_requirement_categories: string[];
  frontier_availability: ReconstructSeedAuthoringFrontierAvailability;
  source_sufficiency_state: ReconstructSeedAuthoringSourceSufficiencyState;
  exploration_budget_state: ReconstructSeedAuthoringExplorationBudgetState;
  max_round_exhaustion_interpretation:
    ReconstructSeedAuthoringMaxRoundExhaustionInterpretation;
  limitation_closure_state: ReconstructSeedAuthoringLimitationClosureState;
  closure_rows: ReconstructSeedAuthoringClosureRow[];
  ontology_domain_required_category_rows:
    ReconstructSeedAuthoringDomainRequiredCategoryRow[];
  boundary_notes: string[];
}

export interface ReconstructSeedAuthoringReadinessValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "input_validation_missing"
    | "input_validation_invalid"
    | "selected_purpose_missing"
    | "purpose_confirmation_blocks_seed"
    | "source_scout_scope_unsupported"
    | "closure_row_missing"
    | "closure_row_dangling_required_element"
    | "closure_row_dangling_material_admission"
    | "closure_row_invalid_state"
    | "missing_requirement_category_not_reported"
    | "ontology_domain_category_missing"
    | "semantic_authority_boundary_missing"
    | "source_scout_pre_seed_identity_mismatch"
    | "max_round_exhaustion_interpretation_mismatch"
    | "source_sufficiency_state_mismatch"
    | "readiness_classification_mismatch";
  message: string;
  subject_id: string | null;
}

export interface ReconstructSeedAuthoringReadinessValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  seed_authoring_readiness_ref: string | null;
  source_purpose_candidates_validation_ref: string | null;
  purpose_confirmation_validation_ref: string | null;
  source_scout_pack_validation_ref: string | null;
  material_admission_ledger_ref: string | null;
  candidate_disposition_validation_ref: string | null;
  deterministic_gate_scope: "pre_seed_closure_only";
  semantic_authority_boundary_status: "preserved" | "violated";
  validation_status: "valid" | "invalid";
  readiness_classification:
    ReconstructSeedAuthoringReadinessClassification | null;
  source_sufficiency_state:
    ReconstructSeedAuthoringSourceSufficiencyState | null;
  exploration_budget_state:
    ReconstructSeedAuthoringExplorationBudgetState | null;
  max_round_exhaustion_interpretation:
    ReconstructSeedAuthoringMaxRoundExhaustionInterpretation | null;
  closure_row_count: number;
  validation_results: string[];
  violations: ReconstructSeedAuthoringReadinessValidationViolation[];
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
  "run_control",
  "run_control_validation",
  "registry_verification",
  "registry_verification_validation",
  "target_material_profile",
  "target_material_profile_validation",
  "source_inventory",
  "initial_source_frontier",
  "source_observation",
  "source_safety",
  "source_safety_validation",
  "source_scout_pack",
  "source_scout_pack_validation",
  "source_scout_pack_pre_seed",
  "source_scout_pack_validation_pre_seed",
  "source_scout_pack_post_maturation",
  "source_scout_pack_validation_post_maturation",
  "post_maturation_gate_projection_validation",
  "observation_directive",
  "observation_directive_validation",
  "lens_judgment",
  "exploration_synthesis",
  "source_frontier",
  "source_frontier_validation",
  "source_observation_delta",
  "source_observation_delta_validation",
  "source_observation_reentry_validation",
  "source_observation_lineage_index",
  "source_observation_lineage_index_validation",
  "source_purpose_candidates",
  "source_purpose_candidates_validation",
  "purpose_confirmation",
  "purpose_confirmation_validation",
  "material_admission",
  "candidate_inventory",
  "candidate_disposition",
  "candidate_disposition_validation",
  "seed_authoring_readiness",
  "seed_authoring_readiness_validation",
  "ontology_seed",
  "ontology_seed_validation",
  "material_admission_validation",
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
  "maturation_baseline",
  "maturation_baseline_validation",
  "baseline_actionability_matrix",
  "baseline_actionability_matrix_validation",
  "maturation_question_frontier",
  "maturation_question_frontier_validation",
  "maturation_closure_frontier",
  "maturation_closure_frontier_validation",
  "maturation_authority_response",
  "maturation_authority_response_validation",
  "answer_support_ledger",
  "answer_support_ledger_validation",
  "maturation_answer_claims",
  "maturation_answer_claims_validation",
  "ontology_expansion",
  "ontology_expansion_validation",
  "actionability_matrix",
  "actionability_matrix_validation",
  "maturation_source_delta",
  "maturation_source_delta_validation",
  "maturation_convergence_ledger",
  "maturation_convergence_ledger_validation",
  "maturation_continuation_decision",
  "maturation_continuation_decision_validation",
  "query_proofs",
  "query_proofs_validation",
  "visualization_proofs",
  "visualization_proofs_validation",
  "graph_exploration_proofs",
  "graph_exploration_proofs_validation",
  "actionable_ontology",
  "actionable_ontology_validation",
  "run_control_pre_publication_validation",
  "claim_projection",
  "claim_projection_validation",
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
    | "final_output_provenance_missing"
    | "final_output_claim_restatement_forbidden";
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

export type ReconstructMaturationMateriality = ReconstructMateriality;

export type ReconstructMaturityLevel =
  | "L0_missing"
  | "L1_identified"
  | "L2_modeled"
  | "L3_evidenced"
  | "L4_validated_for_purpose";

export interface ReconstructMaturationBaselineRow {
  baseline_row_id: string;
  purpose_element_ref: string;
  actionability_surface_ref: string;
  maturity_dimension_ref: string;
  materiality: ReconstructMaturationMateriality;
  materiality_ref: string;
  member_scope_refs: string[];
  member_target_material_kind: TargetMaterialKind | null;
  member_source_refs: string[];
  cross_material_ref_refs: string[];
  competency_question_refs: string[];
  competency_assessment_refs: string[];
  domain_competency_trace_refs: string[];
  maturity_level: ReconstructMaturityLevel;
  supporting_seed_refs: string[];
  supporting_evidence_refs: ReconstructEvidenceRef[];
  supporting_validation_refs: string[];
  limitation_refs: string[];
  blocking_reason: string | null;
}

export interface ReconstructMaturationBaselineArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_seed_ref: string | null;
  source_seed_validation_ref: string | null;
  source_claim_realization_map_validation_ref: string | null;
  source_competency_assessment_ref: string | null;
  source_reconstruct_record_ref: string | null;
  source_run_manifest_ref: string | null;
  source_handoff_decision_validation_ref: string | null;
  purpose_frame_ref: string | null;
  source_purpose_candidates_validation_ref: string | null;
  purpose_confirmation_validation_ref: string | null;
  source_material_admission_ledger_ref: string | null;
  source_material_admission_validation_ref: string | null;
  baseline_rows: ReconstructMaturationBaselineRow[];
}

export interface ReconstructMaturationValidationViolation {
  code:
    | "session_id_mismatch"
    | "prior_validation_invalid"
    | "duplicate_id"
    | "unknown_id"
    | "missing_required_ref"
    | "missing_required_coverage"
    | "invalid_enum"
    | "mixed_lineage_missing"
    | "conflicting_state"
    | "already_observed_source_ref"
    | "unsupported_source_ref"
    | "semantic_only_location"
    | "support_mode_missing_authority"
    | "insufficient_independent_evidence"
    | "seed_authority_rewrite_attempt"
    | "source_reconstruct_record_missing";
  message: string;
  subject_id: string | null;
}

export interface ReconstructMaturationBaselineValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  maturation_baseline_ref: string | null;
  source_seed_validation_ref: string | null;
  source_reconstruct_record_ref: string | null;
  source_reconstruct_record_sha256: string | null;
  source_purpose_candidates_validation_ref: string | null;
  purpose_confirmation_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  baseline_row_count: number;
  material_row_count: number;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export interface ReconstructActionabilityMatrixRow {
  matrix_row_id: string;
  baseline_row_refs: string[];
  purpose_element_ref: string;
  actionability_surface_ref: string;
  maturity_dimension_ref: string;
  materiality: ReconstructMaturationMateriality;
  materiality_ref: string;
  member_scope_refs: string[];
  member_target_material_kind: TargetMaterialKind | null;
  member_readiness:
    | "closed"
    | "limitation_backed"
    | "frontier_required"
    | "out_of_scope";
  member_source_refs: string[];
  cross_material_ref_refs: string[];
  competency_question_refs: string[];
  competency_assessment_refs: string[];
  maturity_level: ReconstructMaturityLevel;
  supporting_refs: string[];
  blocking_question_refs: string[];
  limitation_refs: string[];
  next_action: string;
}

export interface ReconstructActionabilityMatrixArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  maturation_baseline_ref: string | null;
  maturation_baseline_validation_ref: string | null;
  rows: ReconstructActionabilityMatrixRow[];
}

export interface ReconstructActionabilityMatrixValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  actionability_matrix_ref: string | null;
  maturation_baseline_validation_ref: string | null;
  maturation_answer_claims_validation_ref?: string | null;
  ontology_expansion_validation_ref?: string | null;
  validation_status: "valid" | "invalid";
  matrix_row_count: number;
  frontier_required_row_count: number;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export interface ReconstructMaturationQuestionFrontierQuestion {
  question_id: string;
  question: string;
  materiality: ReconstructMaturationMateriality;
  materiality_ref: string;
  actionability_surface_refs: string[];
  maturity_dimension_refs: string[];
  purpose_element_refs: string[];
  baseline_row_refs: string[];
  competency_question_refs: string[];
  competency_assessment_refs: string[];
  domain_competency_trace_refs: string[];
  seed_ref_refs: string[];
  current_answer_status: ReconstructCompetencyQuestionAnswerStatus;
  expected_answer_kind: "yes_no" | "explanation" | "list" | "mapping" | "gap_statement";
  evidence_needed: string;
  authority_need: {
    authority_kind:
      | "none"
      | "user"
      | "external_system"
      | "domain_standard"
      | "runtime_capability";
    authority_scope: string | null;
    blocking_if_unavailable: boolean;
    expected_response_kind:
      | "confirmation"
      | "value"
      | "policy"
      | "capability"
      | "external_reference"
      | "unavailable_reason";
  };
  closure_frontier_hint_refs: string[];
  limitation_refs: string[];
}

export interface ReconstructMaturationQuestionFrontierArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  maturation_baseline_ref: string | null;
  maturation_baseline_validation_ref: string | null;
  actionability_matrix_ref: string | null;
  actionability_matrix_validation_ref: string | null;
  questions: ReconstructMaturationQuestionFrontierQuestion[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructMaturationQuestionFrontierValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  maturation_question_frontier_ref: string | null;
  maturation_baseline_validation_ref: string | null;
  actionability_matrix_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  question_count: number;
  material_frontier_question_count: number;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export type ReconstructMaturationAuthorityKind =
  | "user"
  | "external_system"
  | "domain_standard"
  | "runtime_capability";

export type ReconstructMaturationExpectedResponseKind =
  | "confirmation"
  | "value"
  | "policy"
  | "capability"
  | "external_reference"
  | "unavailable_reason";

export type ReconstructMaturationSupportMode =
  | "direct_authority"
  | "runtime_proof"
  | "user_confirmation"
  | "authority_response"
  | "convergent_source_evidence";

export interface ReconstructMaturationClosureFrontierSourceRequest {
  source_request_id: string;
  question_refs: string[];
  member_scope_refs: string[];
  member_source_refs: string[];
  cross_material_ref_refs: string[];
  requested_source_ref: string;
  requested_location: string | null;
  target_material_kind: TargetMaterialKind;
  expected_evidence_kind: string;
  reason: string;
}

export interface ReconstructMaturationClosureFrontierAuthorityRequest {
  authority_request_id: string;
  question_refs: string[];
  authority_kind: ReconstructMaturationAuthorityKind;
  authority_scope: string;
  request_summary: string;
  request_rationale: string;
  blocking_if_unavailable: boolean;
  expected_response_kind: ReconstructMaturationExpectedResponseKind;
  limitation_refs: string[];
}

export interface ReconstructMaturationClosureFrontierArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  round_id: string;
  question_frontier_ref: string | null;
  source_requests: ReconstructMaturationClosureFrontierSourceRequest[];
  authority_requests: ReconstructMaturationClosureFrontierAuthorityRequest[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructMaturationClosureFrontierValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  maturation_closure_frontier_ref: string | null;
  maturation_question_frontier_validation_ref: string | null;
  source_inventory_ref: string | null;
  source_observations_ref: string | null;
  validation_status: "valid" | "invalid";
  source_request_count: number;
  authority_request_count: number;
  accepted_source_request_ids: string[];
  rejected_source_requests: Array<{
    source_request_id: string | null;
    requested_source_ref: string | null;
    reason: string;
  }>;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export interface ReconstructMaturationAuthorityResponse {
  authority_response_id: string;
  authority_request_ref: string;
  authority_kind: ReconstructMaturationAuthorityKind;
  authority_identity: {
    authority_id: string;
    authority_label: string;
    authority_role: string;
  };
  authority_snapshot_ref: string | null;
  authority_version_or_timestamp: string | null;
  response_status:
    | "provided"
    | "unavailable"
    | "rejected"
    | "deferred"
    | "contradicted";
  response_summary: string;
  response_source_ref: string | null;
  supporting_refs: string[];
  limitation_refs: string[];
}

export interface ReconstructMaturationAuthorityResponseArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  closure_frontier_ref: string | null;
  responses: ReconstructMaturationAuthorityResponse[];
}

export interface ReconstructMaturationAuthorityResponseValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  maturation_authority_response_ref: string | null;
  maturation_closure_frontier_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  response_count: number;
  provided_response_count: number;
  unavailable_response_count: number;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export interface ReconstructAnswerSupportEvidenceCluster {
  evidence_cluster_id: string;
  question_refs: string[];
  support_mode: ReconstructMaturationSupportMode;
  proposed_answer_summary: string;
  evidence_refs: ReconstructEvidenceRef[];
  proof_refs: string[];
  user_confirmation_refs: string[];
  authority_response_refs: string[];
  independence_basis: string;
  contradiction_refs: string[];
  limitation_refs: string[];
}

export interface ReconstructAnswerSupportLedgerArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  round_id: string;
  evidence_clusters: ReconstructAnswerSupportEvidenceCluster[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructAnswerSupportLedgerValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  answer_support_ledger_ref: string | null;
  maturation_question_frontier_validation_ref: string | null;
  source_observation_delta_ref: string | null;
  source_observation_lineage_index_ref: string | null;
  source_observation_lineage_index_validation_ref: string | null;
  source_observation_reentry_validation_ref: string | null;
  source_safety_ledger_validation_ref: string | null;
  maturation_authority_response_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  evidence_cluster_count: number;
  supported_question_count: number;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export interface ReconstructMaturationAnswerClaim {
  answer_claim_id: string;
  question_id: string;
  answer: string;
  answer_status: "answered" | "partially_answered";
  support_mode: ReconstructMaturationSupportMode;
  evidence_cluster_refs: string[];
  supporting_evidence_refs: ReconstructEvidenceRef[];
  target_surface_refs: string[];
  target_dimension_refs: string[];
  purpose_element_refs: string[];
  limitation_refs: string[];
}

export interface ReconstructMaturationAnswerClaimsArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  round_id: string;
  answer_claims: ReconstructMaturationAnswerClaim[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructMaturationAnswerClaimsValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  maturation_answer_claims_ref: string | null;
  answer_support_ledger_validation_ref: string | null;
  maturation_question_frontier_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  answer_claim_count: number;
  answered_question_count: number;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export interface ReconstructOntologyExpansionEntry {
  expansion_id: string;
  operation: "add" | "refine" | "defer" | "reject";
  target_surface_refs: string[];
  target_dimension_refs: string[];
  target_seed_or_ontology_refs: string[];
  purpose_element_refs: string[];
  answer_claim_refs: string[];
  evidence_refs: ReconstructEvidenceRef[];
  concept_economy_effect:
    | "reduces_surface"
    | "preserves_surface"
    | "increases_surface";
  rationale: string;
  limitation_refs: string[];
}

export interface ReconstructOntologyExpansionArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  answer_claims_ref: string | null;
  source_seed_ref: string | null;
  expansions: ReconstructOntologyExpansionEntry[];
  directive_author: {
    owner: "host_llm" | "mock";
    author_id: string;
  };
}

export interface ReconstructOntologyExpansionValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  ontology_expansion_ref: string | null;
  maturation_answer_claims_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  expansion_count: number;
  operation_counts: Record<ReconstructOntologyExpansionEntry["operation"], number>;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export type ReconstructMaturationClosureDisposition =
  | "answered_and_expanded"
  | "answered_no_semantic_change"
  | "trace_audit_only"
  | "deferred_user_decision"
  | "deferred_external_authority"
  | "rejected_non_material"
  | "blocked_unavailable"
  | "out_of_scope";

export interface ReconstructMaturationFinalRequestionPass {
  pass_id: string;
  input_authority_refs: string[];
  generated_question_refs: string[];
  new_material_question_refs: string[];
  closed_as_non_material_refs: string[];
  pass_status:
    | "not_run"
    | "no_new_material_question"
    | "material_question_found";
  rationale: string;
}

export interface ReconstructMaturationConvergenceClosureRow {
  closure_id: string;
  question_refs: string[];
  source_observation_delta_validation_refs: string[];
  closure_disposition: ReconstructMaturationClosureDisposition;
  materiality: ReconstructMaturationMateriality;
  actionability_surface_refs: string[];
  maturity_dimension_refs: string[];
  purpose_element_refs: string[];
  affected_matrix_row_refs: string[];
  supporting_refs: string[];
  answer_claim_refs: string[];
  expansion_refs: string[];
  limitation_refs: string[];
  next_action: string;
}

export interface ReconstructMaturationConvergenceSourceObservationClosureRow {
  source_observation_closure_id: string;
  observation_id: string;
  delta_row_id: string;
  source_ref: string;
  source_observation_delta_validation_ref: string;
  question_refs: string[];
  evidence_cluster_refs: string[];
  answer_claim_refs: string[];
  expansion_refs: string[];
  closure_disposition: ReconstructMaturationClosureDisposition;
  limitation_refs: string[];
}

export interface ReconstructMaturationConvergenceRound {
  round_id: string;
  source_observation_delta_validation_ref: string | null;
  maturation_source_delta_validation_ref: string | null;
  question_frontier_validation_ref: string | null;
  actionability_matrix_validation_ref: string | null;
  final_requestion_pass: ReconstructMaturationFinalRequestionPass;
  closure_rows: ReconstructMaturationConvergenceClosureRow[];
  source_observation_closure_rows:
    ReconstructMaturationConvergenceSourceObservationClosureRow[];
  remaining_frontier_refs: string[];
}

export interface ReconstructMaturationConvergenceLedgerArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  rounds: ReconstructMaturationConvergenceRound[];
}

export interface ReconstructMaturationConvergenceLedgerValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  maturation_convergence_ledger_ref: string | null;
  maturation_source_delta_validation_ref: string | null;
  maturation_question_frontier_validation_ref: string | null;
  actionability_matrix_validation_ref: string | null;
  answer_support_ledger_validation_ref: string | null;
  maturation_answer_claims_validation_ref: string | null;
  ontology_expansion_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  closure_row_count: number;
  remaining_frontier_count: number;
  final_requestion_pass_status:
    ReconstructMaturationFinalRequestionPass["pass_status"];
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export type ReconstructMaturationSourceDeltaImpactState =
  | "no_delta"
  | "delta_no_actionability_impact"
  | "delta_affects_actionability";

export interface ReconstructMaturationSourceDeltaImpactRow {
  impact_row_id: string;
  delta_row_id: string;
  observation_id: string;
  source_ref: string;
  target_material_kind: TargetMaterialKind;
  affected_matrix_row_refs: string[];
  impact_state: "affects_actionability" | "no_matching_actionability_row";
  rationale: string;
}

export interface ReconstructMaturationSourceDeltaArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_observation_delta_ref: string | null;
  source_observation_delta_validation_ref: string | null;
  actionability_matrix_ref: string | null;
  actionability_matrix_validation_ref: string | null;
  impact_state: ReconstructMaturationSourceDeltaImpactState;
  delta_row_count: number;
  impacted_matrix_row_refs: string[];
  impact_rows: ReconstructMaturationSourceDeltaImpactRow[];
}

export interface ReconstructMaturationSourceDeltaValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  maturation_source_delta_ref: string | null;
  source_observation_delta_validation_ref: string | null;
  actionability_matrix_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  impact_state: ReconstructMaturationSourceDeltaImpactState;
  impacted_matrix_row_count: number;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export type ReconstructMaturationContinuationDecisionState =
  | "continue"
  | "ask_user"
  | "blocked"
  | "actionable_limited"
  | "actionable_ready";

export interface ReconstructMaturationContinuationDecisionArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  actionability_matrix_validation_ref: string | null;
  maturation_convergence_ledger_validation_ref: string | null;
  decision_state: ReconstructMaturationContinuationDecisionState;
  state_rationale: string;
  blocking_row_refs: string[];
  next_frontier_refs: string[];
  authority_request_refs: string[];
  authority_response_refs: string[];
  claim_scope: {
    included_row_refs: string[];
    excluded_row_refs: string[];
    exclusion_rationale: string | null;
  };
  limitation_refs: string[];
}

export interface ReconstructMaturationContinuationDecisionValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  maturation_continuation_decision_ref: string | null;
  actionability_matrix_validation_ref: string | null;
  maturation_question_frontier_validation_ref: string | null;
  maturation_closure_frontier_validation_ref: string | null;
  answer_support_ledger_validation_ref: string | null;
  maturation_authority_response_validation_ref: string | null;
  ontology_expansion_validation_ref: string | null;
  maturation_convergence_ledger_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  decision_state: ReconstructMaturationContinuationDecisionState;
  blocking_row_count: number;
  next_frontier_count: number;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export type ReconstructActionableOntologyClaim =
  | "actionable_limited"
  | "actionable_ready";

export interface ReconstructActionableOntologyProjectedRow {
  projection_row_id: string;
  matrix_row_ref: string;
  claim_scope: "included" | "excluded";
  actionability_surface_ref: string;
  maturity_dimension_ref: string;
  purpose_element_ref: string;
  materiality: ReconstructMaturationMateriality;
  maturity_level: ReconstructMaturityLevel;
  member_readiness: ReconstructActionabilityMatrixRow["member_readiness"];
  seed_ref_refs: string[];
  expansion_refs: string[];
  evidence_refs: ReconstructEvidenceRef[];
  supporting_refs: string[];
  limitation_refs: string[];
  rationale: string;
}

export interface ReconstructActionableOntologyArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  ontology_seed_ref: string | null;
  ontology_seed_validation_ref: string | null;
  ontology_expansion_ref: string | null;
  ontology_expansion_validation_ref: string | null;
  actionability_matrix_ref: string | null;
  actionability_matrix_validation_ref: string | null;
  maturation_continuation_decision_ref: string | null;
  maturation_continuation_decision_validation_ref: string | null;
  actionability_claim: ReconstructActionableOntologyClaim;
  final_requestion_pass_status:
    ReconstructMaturationFinalRequestionPass["pass_status"];
  claim_scope: {
    included_row_refs: string[];
    excluded_row_refs: string[];
    limitation_refs: string[];
    rationale: string;
  };
  downstream_claims: {
    query_access: "not_claimed";
    visualization: "not_claimed";
    graph_exploration: "not_claimed";
  };
  projected_rows: ReconstructActionableOntologyProjectedRow[];
}

export interface ReconstructActionableOntologyValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  actionable_ontology_ref: string | null;
  ontology_seed_validation_ref: string | null;
  actionability_matrix_validation_ref: string | null;
  ontology_expansion_validation_ref: string | null;
  maturation_continuation_decision_validation_ref: string | null;
  maturation_convergence_ledger_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  actionability_claim: ReconstructActionableOntologyClaim;
  projected_row_count: number;
  included_row_count: number;
  excluded_row_count: number;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export type ReconstructProofAuthoritySurface =
  | "query_access"
  | "visualization"
  | "graph_exploration";

export type ReconstructProofAuthorityClaimState =
  | "not_claimed"
  | "proof_required"
  | "claimed_with_runtime_proof";

export interface ReconstructProofAuthorityRow {
  proof_id: string;
  proof_kind:
    | "query_execution"
    | "visual_render"
    | "graph_traversal"
    | "not_claimed_boundary";
  target_refs: string[];
  supporting_refs: string[];
  limitation_refs: string[];
  proof_summary: string;
}

export interface ReconstructProofAuthorityArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  proof_surface: ReconstructProofAuthoritySurface;
  actionability_matrix_validation_ref: string | null;
  maturation_continuation_decision_validation_ref: string | null;
  actionable_ontology_validation_ref: string | null;
  claim_state: ReconstructProofAuthorityClaimState;
  proof_rows: ReconstructProofAuthorityRow[];
  limitation_refs: string[];
}

export interface ReconstructProofAuthorityValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  proof_authority_ref: string | null;
  proof_surface: ReconstructProofAuthoritySurface;
  actionability_matrix_validation_ref: string | null;
  maturation_continuation_decision_validation_ref: string | null;
  actionable_ontology_validation_ref: string | null;
  validation_status: "valid" | "invalid";
  claim_state: ReconstructProofAuthorityClaimState;
  proof_row_count: number;
  validation_results: string[];
  violations: ReconstructMaturationValidationViolation[];
}

export type ReconstructClaimProjectionSurface =
  | "status"
  | "result"
  | "final_output"
  | "mcp"
  | "api"
  | "handoff"
  | "material_kind_support";

export type ReconstructClaimProjectionLevel =
  | "not_applicable"
  | "seed_candidate"
  | "seed_valid_for_maturation"
  | "maturation_minimum_executable"
  | "maturation_in_progress"
  | "actionable_limited"
  | "actionable_ready"
  | "blocked";

export type ReconstructClaimProjectionDecisionState =
  | "continue"
  | "ask_user"
  | "blocked"
  | "actionable_limited"
  | "actionable_ready"
  | "not_applicable";

export type ReconstructClaimProjectionActionabilityClaim =
  | "none"
  | "limited"
  | "ready";

export type ReconstructClaimProjectionSupportClaim =
  | "unsupported"
  | "profile_supported"
  | "fixture_validated"
  | "golden_source_validated"
  | "real_source_validated"
  | "release_supported";

export interface ReconstructClaimProjectionRow {
  projection_id: string;
  projection_surface: ReconstructClaimProjectionSurface;
  claim_level: ReconstructClaimProjectionLevel;
  decision_state: ReconstructClaimProjectionDecisionState;
  actionability_claim: ReconstructClaimProjectionActionabilityClaim;
  material_kind_capability_refs: string[];
  governance_scope: {
    reconstruct_run_level: "included" | "not_claimed";
    operated_system_release_health:
      | "out_of_scope"
      | "planned_later"
      | "delegated_authority_ref";
    rollback_quota_incident_governance:
      | "out_of_scope"
      | "planned_later"
      | "delegated_authority_ref";
  };
  member_capability_rows: Array<{
    member_id: string;
    target_ref: string;
    target_material_kind: TargetMaterialKind;
    selected_source_profile_id: string | null;
    selected_source_profile_ref: string | null;
    selected_source_profile_definition_sha256: string | null;
    member_source_refs: string[];
    validation_ref: string | null;
    support_claim: ReconstructClaimProjectionSupportClaim;
    readiness_effect: "supported" | "limited" | "blocked";
    next_action: string;
    limitation_refs: string[];
  }>;
  included_row_refs: string[];
  excluded_row_refs: string[];
  required_validation_refs: string[];
  registry_evidence_refs: string[];
  display_label: string;
  machine_status: string;
  timestamp: {
    value: string;
    timezone: string;
    source_ref: string;
  };
  locale_context: {
    locale: string;
    value_format_refs: string[];
  };
  limitation_refs: string[];
}

export interface ReconstructClaimProjectionArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_authority_refs: string[];
  projection_rows: ReconstructClaimProjectionRow[];
}

export interface ReconstructClaimProjectionValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "duplicate_id"
    | "missing_required_surface"
    | "missing_required_field"
    | "invalid_enum"
    | "decision_state_actionability_mismatch"
    | "member_capability_row_missing"
    | "member_capability_lineage_mismatch"
    | "required_validation_ref_missing"
    | "required_validation_ref_invalid"
    | "derived_claim_mismatch"
    | "execution_profile_authority_missing"
    | "mock_backed_completion_claim"
    | "broader_governance_scope_unbounded"
    | "blocked_projection_missing_recovery_ref"
    | "ready_projection_without_ready_decision";
  message: string;
  projection_id: string | null;
}

export interface ReconstructClaimProjectionValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  claim_projection_ref: string | null;
  validation_status: "valid" | "invalid";
  projection_row_count: number;
  strongest_claim_level: ReconstructClaimProjectionLevel;
  decision_state_counts: Record<ReconstructClaimProjectionDecisionState, number>;
  validation_results: string[];
  violations: ReconstructClaimProjectionValidationViolation[];
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
    source_safety: ReconstructRecordValidationStatusProjection;
    material_admission: ReconstructRecordValidationStatusProjection;
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

export interface ReconstructPostMaturationGateProjectionValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  projection_scope: "post_maturation_source_scout_gate";
  source_scout_pack_post_maturation_ref: string | null;
  source_scout_pack_validation_post_maturation_ref: string | null;
  validation_status: "valid" | "invalid";
  gate_projection: ReconstructHandoffDecisionValidationArtifact["gate_projection"];
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
  forbidden_fragments: string[];
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
  reconstruct_run_control: string | null;
  reconstruct_run_control_validation: string | null;
  reconstruct_run_control_pre_publication_validation: string | null;
  reconstruct_run_bootstrap_diagnostic: string | null;
  registry_verification_evidence: string | null;
  registry_verification_evidence_validation: string | null;
  target_material_profile: string | null;
  target_material_profile_validation: string | null;
  source_inventory: string | null;
  initial_source_frontier: string | null;
  source_observations: string | null;
  source_observation_delta: string | null;
  source_observation_delta_validation: string | null;
  source_observation_reentry_validation: string | null;
  source_observation_lineage_index: string | null;
  source_observation_lineage_index_validation: string | null;
  source_safety_ledger: string | null;
  source_safety_ledger_validation: string | null;
  source_scout_pack: string | null;
  source_scout_pack_validation: string | null;
  source_scout_pack_pre_seed: string | null;
  source_scout_pack_validation_pre_seed: string | null;
  source_scout_pack_post_maturation: string | null;
  source_scout_pack_validation_post_maturation: string | null;
  post_maturation_gate_projection_validation: string | null;
  source_observation_directive: string | null;
  source_observation_directive_validation: string | null;
  lens_judgment_index: string | null;
  exploration_synthesis: string | null;
  source_frontier: string | null;
  source_frontier_validation: string | null;
  source_purpose_candidates: string | null;
  source_purpose_candidates_validation: string | null;
  purpose_confirmation: string | null;
  purpose_confirmation_validation: string | null;
  material_admission_ledger: string | null;
  material_admission_ledger_validation: string | null;
  candidate_inventory: string | null;
  candidate_disposition: string | null;
  candidate_disposition_validation: string | null;
  seed_authoring_readiness: string | null;
  seed_authoring_readiness_validation: string | null;
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
  maturation_baseline: string | null;
  maturation_baseline_validation: string | null;
  baseline_actionability_matrix: string | null;
  baseline_actionability_matrix_validation: string | null;
  actionability_matrix: string | null;
  actionability_matrix_validation: string | null;
  maturation_question_frontier: string | null;
  maturation_question_frontier_validation: string | null;
  maturation_closure_frontier: string | null;
  maturation_closure_frontier_validation: string | null;
  maturation_authority_response: string | null;
  maturation_authority_response_validation: string | null;
  answer_support_ledger: string | null;
  answer_support_ledger_validation: string | null;
  maturation_answer_claims: string | null;
  maturation_answer_claims_validation: string | null;
  ontology_expansion: string | null;
  ontology_expansion_validation: string | null;
  maturation_source_delta: string | null;
  maturation_source_delta_validation: string | null;
  maturation_convergence_ledger: string | null;
  maturation_convergence_ledger_validation: string | null;
  maturation_continuation_decision: string | null;
  maturation_continuation_decision_validation: string | null;
  query_proofs: string | null;
  query_proofs_validation: string | null;
  visualization_proofs: string | null;
  visualization_proofs_validation: string | null;
  graph_exploration_proofs: string | null;
  graph_exploration_proofs_validation: string | null;
  actionable_ontology: string | null;
  actionable_ontology_validation: string | null;
  claim_projection: string | null;
  claim_projection_validation: string | null;
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
  artifact_integrity: Array<{
    artifact_key: keyof ReconstructRecordArtifactRefs;
    artifact_ref: string | null;
    exists: boolean;
    sha256: string | null;
    validation_status: ReconstructRecordValidationStatusProjection | null;
  }>;
  validation_summary: {
    target_material_profile_status: ReconstructRecordValidationStatusProjection;
    source_observation_directive_status: ReconstructRecordValidationStatusProjection;
    candidate_disposition_status: ReconstructRecordValidationStatusProjection;
    seed_authoring_readiness_status: ReconstructRecordValidationStatusProjection;
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
