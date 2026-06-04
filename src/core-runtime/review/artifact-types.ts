import type {
  TargetMaterialKind,
  TargetMaterialSupportStatus,
} from "../target-material-kind.js";

export type ReviewEntrypoint = "review";
export type ReviewTargetScopeKind = "file" | "directory" | "bundle";
export type ReviewExecutionRealization = "worker" | "direct-call";
/**
 * Host runtime for review execution.
 * - "codex":      Codex host-bound worker path.
 * - "claude":     Claude Code CLI worker path (`claude -p`).
 * - "anthropic":  Anthropic SDK direct call from TS process.
 * - "openai":     OpenAI SDK direct call.
 * - "grok":       xAI/Grok OpenAI-style API via TS process direct HTTP.
 * - "lmstudio":   Local LM Studio OpenAI-style endpoint.
 * - "standalone": TS process orchestrates with no host LLM.
 */
export type ReviewHostRuntime =
  | "codex"
  | "claude"
  | "anthropic"
  | "openai"
  | "grok"
  | "lmstudio"
  | "standalone";
export type ReviewMode = "core-axis" | "full";
export type BoundaryAccessPolicy = "allowed" | "denied";
export type BoundaryGuaranteeLevel =
  | "prompt_declared_only"
  | "host_enforced"
  | "mcp_scoped"
  | "environment_enforced";
export type ReviewRecordStatus =
  | "completed"
  | "completed_with_degradation"
  | "halted_partial";
export type ReviewFindingSeverity =
  | "blocker"
  | "high"
  | "medium"
  | "low"
  | "info";
export type ReviewActionCandidate =
  | "fix_now"
  | "fix_before_release"
  | "accept_risk"
  | "follow_up"
  | "out_of_scope"
  | "needs_evidence"
  | "continue_review"
  | "retry_execution";
export type DeliberationStatus = "performed" | "not_performed";
export type ReviewExecutionStatus =
  | "completed"
  | "completed_with_degradation"
  | "halted_partial";
export type ReviewUnitKind =
  | "lens"
  | "issue_artifact"
  | "deliberation"
  | "synthesize";
export type ReviewDeliberationMode = "controlled-lens-deliberation";
export type ReviewUnitExecutionStatus = "completed" | "failed" | "skipped";
export type ReviewTargetMaterializedInputKind =
  | "single_text"
  | "directory_listing"
  | "bundle_member_texts";
export type ReviewTargetInputKind =
  | "single_file"
  | "directory"
  | "explicit_bundle"
  | "git_diff"
  | "generated_packet";
export type ReviewTargetArtifactRole =
  | "knowledge_artifact"
  | "decision_artifact"
  | "procedural_artifact"
  | "computational_artifact"
  | "record_artifact"
  | "contract_artifact"
  | "creative_artifact"
  | "presentation_artifact"
  | "data_artifact"
  | "configuration_artifact";
export type ReviewTargetClosureLevel =
  | "bounded_closed"
  | "bounded_partial"
  | "open_partial";
export type ReviewTargetRefRole = "primary" | "supporting";
export type ReviewTargetRefKind = "file" | "directory" | "generated";
export type ReviewActorKind =
  | "teamlead"
  | "lens"
  | "synthesize";
export type ReviewActorSeat = "main" | "worker";
export type ReviewContextManifestLifecycleState =
  | "created"
  | "validated"
  | "blocked"
  | "dispatched"
  | "completed"
  | "invalidated";
export type ReviewContextSensitivity = "public" | "internal" | "sensitive";
export type ReviewFailureRetrySafety =
  | "safe_after_input_change"
  | "safe_after_environment_change"
  | "unsafe_without_operator_review";
export type ReviewFailureArtifactTrust =
  | "no_artifacts_trusted"
  | "pre_manifest_artifacts_trusted"
  | "manifest_artifacts_trusted"
  | "execution_artifacts_partial"
  | "execution_artifacts_trusted";
export type ReviewFailureDispatchState =
  | "not_dispatched"
  | "dispatch_blocked"
  | "partially_dispatched"
  | "dispatched";
export type ReviewFailureDetailsKind =
  | "settings_validation"
  | "retired_config"
  | "domain_binding"
  | "value_alignment_gate"
  | "actor_route"
  | "manifest_lifecycle"
  | "context_eligibility"
  | "provider_api"
  | "malformed_output"
  | "schema_validation"
  | "artifact_write"
  | "security_disclosure";
export type ReviewLensCompletionBarrierStatus =
  | "passed"
  | "passed_with_degradation"
  | "failed";

export interface ReviewTargetScopeCandidate {
  kind: ReviewTargetScopeKind;
  primary_ref: string;
  member_refs?: string[];
  bundle_kind?: string;
}

export interface LensSelectionPlan {
  always_include: string[];
  recommended_lenses: string[];
  rationale: string[];
}

export interface ReviewValueAlignmentConfirmation {
  status: "confirmed";
  confirmed_by: "user";
  source_ref: string;
  confirmed_at: string;
}

export interface InvocationInterpretationArtifact {
  entrypoint: ReviewEntrypoint;
  target_scope_candidate: ReviewTargetScopeCandidate;
  intent_summary: string;
  domain_recommendation: string;
  domain_selection_required: boolean;
  review_mode_recommendation: ReviewMode;
  lens_selection_plan: LensSelectionPlan;
  ambiguity_notes: string[];
  value_alignment_confirmation?: ReviewValueAlignmentConfirmation;
}

export interface DomainFinalSelection {
  recommendation: string;
  final_value: string;
  selection_mode: string;
}

export interface ResolvedTargetScope {
  kind: ReviewTargetScopeKind;
  resolved_refs: string[];
  bundle_kind?: string;
}

export interface BoundaryPolicy {
  web_research_policy: BoundaryAccessPolicy;
  repo_exploration_policy: BoundaryAccessPolicy;
  recursive_reference_expansion_policy: BoundaryAccessPolicy;
  filesystem_scope: {
    allowed_roots: string[];
  };
  write_policy: {
    source_mutation_policy: BoundaryAccessPolicy;
    allowed_output_refs: string[];
  };
  provenance_policy: {
    extra_exploration_citation_required: boolean;
    web_source_citation_required: boolean;
  };
}

export interface BoundaryPresentation {
  role_definition_presentation: "embedded_and_ref";
  primary_target_presentation: "embedded_and_ref";
  required_context_presentation: "ref_only";
  output_seat_presentation: "declared";
  control_policy_presentation: "declared";
}

export interface BoundaryEnforcementProfile {
  prompt_boundary_enforcement: BoundaryGuaranteeLevel;
  filesystem_boundary_enforcement: BoundaryGuaranteeLevel;
  network_boundary_enforcement: BoundaryGuaranteeLevel;
  write_boundary_enforcement: BoundaryGuaranteeLevel;
}

export interface EffectiveBoundaryDecision {
  requested_policy: BoundaryAccessPolicy;
  effective_policy: BoundaryAccessPolicy;
  guarantee_level: BoundaryGuaranteeLevel;
  notes: string[];
}

export interface EffectiveFilesystemScope {
  requested_allowed_roots: string[];
  effective_allowed_roots: string[];
  guarantee_level: BoundaryGuaranteeLevel;
  notes: string[];
}

export interface EffectiveBoundaryState {
  web_research: EffectiveBoundaryDecision;
  repo_exploration: EffectiveBoundaryDecision;
  recursive_reference_expansion: EffectiveBoundaryDecision;
  source_mutation: EffectiveBoundaryDecision;
  filesystem_scope: EffectiveFilesystemScope;
}

export interface InvocationBindingArtifact {
  resolved_target_scope: ResolvedTargetScope;
  domain_final_selection: DomainFinalSelection;
  resolved_session_domain: string;
  resolved_execution_realization: ReviewExecutionRealization;
  resolved_host_runtime: ReviewHostRuntime;
  resolved_review_mode: ReviewMode;
  resolved_lens_set: string[];
  session_id: string;
  session_root: string;
  round1_root: string;
  execution_preparation_root: string;
  execution_plan_path: string;
  session_metadata_path: string;
  interpretation_artifact_path: string;
  binding_output_path: string;
  target_snapshot_path: string;
  target_snapshot_manifest_path: string;
  review_target_profile_path: string;
  materialized_input_path: string;
  context_candidate_assembly_path: string;
  actor_invocation_profiles_path?: string;
  actor_consumer_bindings_path?: string;
  domain_binding_path?: string;
  review_value_alignment_criteria_path?: string;
  review_context_manifest_path?: string;
  synthesis_output_path: string;
  finding_ledger_path: string;
  finding_relation_graph_path: string;
  issue_ledger_path: string;
  issue_stance_matrix_path: string;
  deliberation_plan_path: string;
  problem_framing_path: string;
  lens_completion_barrier_path?: string;
  deliberation_mode: ReviewDeliberationMode;
  deliberation_root_path: string;
  deliberation_output_path: string;
  execution_result_path: string;
  error_log_path: string;
  review_record_path: string;
  final_output_path: string;
  boundary_policy: BoundaryPolicy;
  boundary_presentation: BoundaryPresentation;
  boundary_enforcement_profile: BoundaryEnforcementProfile;
  effective_boundary_state: EffectiveBoundaryState;
  binding_notes: string[];
}

export interface ReviewLensExecutionSeat {
  lens_id: string;
  output_path: string;
}

export interface ReviewLensPromptPacketSeat {
  lens_id: string;
  packet_path: string;
  output_path: string;
}

export type ReviewIssueArtifactId =
  | "finding-ledger"
  | "finding-relation-graph"
  | "issue-ledger"
  | "issue-stance-matrix"
  | "deliberation-plan"
  | "problem-framing";

export interface ReviewIssueArtifactPromptPacketSeat {
  artifact_id: ReviewIssueArtifactId;
  packet_path: string;
  output_path: string;
}

export interface ReviewExecutionPlan {
  session_id: string;
  session_root: string;
  execution_realization: ReviewExecutionRealization;
  host_runtime: ReviewHostRuntime;
  review_mode: ReviewMode;
  interpretation_artifact_path: string;
  binding_output_path: string;
  session_metadata_path: string;
  execution_preparation_root: string;
  round1_root: string;
  lens_execution_seats: ReviewLensExecutionSeat[];
  prompt_packets_root: string;
  lens_prompt_packet_seats: ReviewLensPromptPacketSeat[];
  issue_artifact_prompt_packet_seats: ReviewIssueArtifactPromptPacketSeat[];
  lens_deliberation_prompt_packet_seats: ReviewLensPromptPacketSeat[];
  teamlead_deliberation_prompt_packet_path: string;
  synthesize_prompt_packet_path: string;
  actor_invocation_profiles_path?: string;
  actor_consumer_bindings_path?: string;
  domain_binding_path?: string;
  review_target_profile_path: string;
  review_value_alignment_criteria_path?: string;
  review_context_manifest_path?: string;
  synthesis_output_path: string;
  finding_ledger_path: string;
  finding_relation_graph_path: string;
  issue_ledger_path: string;
  issue_stance_matrix_path: string;
  deliberation_plan_path: string;
  problem_framing_path: string;
  lens_completion_barrier_path?: string;
  deliberation_mode: ReviewDeliberationMode;
  deliberation_root_path: string;
  deliberation_output_path: string;
  execution_result_path: string;
  error_log_path: string;
  final_output_path: string;
  review_record_path: string;
  max_concurrent_lenses?: number;
  minimum_participating_lenses?: number;
  boundary_policy: BoundaryPolicy;
  boundary_presentation: BoundaryPresentation;
  boundary_enforcement_profile: BoundaryEnforcementProfile;
  effective_boundary_state: EffectiveBoundaryState;
}

/**
 * Plan-time resolved LLM values for executor (effort persist Option A).
 *
 * Bootstrap 시점에 OntoConfig 로부터 도출된 model · reasoning_effort · provider.
 * Session-level override is applied at executor dispatch when present, so
 * 본 필드는 **project-level 의도** 를 기록한다 (세션별 override 와 별개).
 *
 * Stderr `[plan:executor]` 로그의 artifact 화 목적. codex global config fallthrough
 * (v0.18.0 hardcoded override 제거 이후) 의 실제 값은 여기에 반영되지 않음 — 그 값은
 * 로그로만 관찰 가능하다는 경계를 의식적으로 유지.
 */
export interface ResolvedLlmPlan {
  model?: string;
  reasoning_effort?: string;
  service_tier?: string;
  provider?: string;
}

export interface ReviewResolvedActorInvocationProfile {
  actor_profile_id: string;
  actor_kind: ReviewActorKind;
  seat: ReviewActorSeat;
  execution_realization: ReviewExecutionRealization;
  host_runtime: ReviewHostRuntime;
  runtime_provider: string | null;
  auth_mode: string | null;
  model: string | null;
  effort: string | null;
  service_tier: string | null;
  base_url: string | null;
  effective_worker_executor: string;
  credential_ref: string | null;
  credential_serialization_policy: "ref_only_no_secret";
  route_unavailable_policy: "fail_before_dispatch";
  capability_requirements: string[];
  source_settings_refs: string[];
}

export interface ReviewActorInvocationProfilesArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  profiles: ReviewResolvedActorInvocationProfile[];
}

export interface ReviewActorConsumerBinding {
  actor_profile_id: string;
  actor_kind: ReviewActorKind;
  actor_instance_id: string;
  consumer_id: string;
  consumer_kind: string;
  lens_id: string | null;
  applies_to: string[];
  profile_ref: string;
  context_access_ref: string;
  extension_admission_status: "admitted";
}

export interface ReviewActorConsumerBindingsArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  bindings: ReviewActorConsumerBinding[];
}

export interface ReviewDomainDocumentBinding {
  doc_id: string;
  path: string;
  required: boolean;
  status: "present" | "missing" | "not_applicable";
  sha256: string | null;
  allowed_consumers: string[];
}

export interface ReviewDomainBindingArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  selected_domain: string;
  selection_mode: string;
  domain_sentinel: boolean;
  domain_directory: string | null;
  attempted_directories: string[];
  validation_status: "valid" | "blocked";
  required_docs: ReviewDomainDocumentBinding[];
  optional_docs: ReviewDomainDocumentBinding[];
}

export interface ReviewValueAlignmentCriterion {
  criterion_id: string;
  statement: string;
  source_kind: string;
  source_ref: string;
  authority_rank: number;
  inference_owner: string;
  confidence: number;
  confidence_basis: string;
  confirmation_status: "confirmed" | "pending_confirmation";
  ambiguity_status: "clear" | "ambiguous";
  conflict_status: "none" | "contested";
  lifecycle_state:
    | "inferred"
    | "pending_confirmation"
    | "confirmed"
    | "revised"
    | "contested"
    | "insufficient"
    | "blocked"
    | "invalidated";
  lineage_ref: string;
  dispatch_decision:
    | "allow_dispatch"
    | "block_for_confirmation"
    | "block_for_revision"
    | "block_for_more_context"
    | "halt"
    | "regenerate_or_cancel";
}

export interface ReviewValueAlignmentCriteriaArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  dispatch_state: "allow_dispatch" | "blocked";
  criteria: ReviewValueAlignmentCriterion[];
}

export interface ReviewContextSource {
  context_source_id: string;
  source_kind: string;
  source_ref: string;
  source_sha256: string | null;
  required: boolean;
  sensitivity: ReviewContextSensitivity;
  allowed_consumers: string[];
}

export interface ReviewContextManifestPacketRef {
  consumer_id: string;
  packet_ref: string;
  packet_sha256: string | null;
  consumed_context_refs: string[];
  forbidden_context_refs: string[];
}

export interface ReviewContextManifestArtifact {
  schema_version: "1";
  producer: "onto-review-runtime";
  producer_version: string;
  settings_schema_version: string;
  domain_registry_version: string;
  alignment_contract_version: string;
  lifecycle_state: ReviewContextManifestLifecycleState;
  session_id: string;
  target_refs: string[];
  domain_binding_ref: string;
  review_value_alignment_criteria_ref: string;
  actor_consumer_bindings_ref: string;
  context_sources: ReviewContextSource[];
  derived_context_access_matrix: Record<string, string[]>;
  packet_refs: ReviewContextManifestPacketRef[];
  validation_results: string[];
  failure_record_refs: string[];
}

export interface ReviewStructuredFailureRecord {
  schema_version: "1";
  failure_id: string;
  created_at: string;
  phase: string;
  reason_code: string;
  human_message: string;
  required_user_action: string;
  retry_safety: ReviewFailureRetrySafety;
  artifact_trust: ReviewFailureArtifactTrust;
  dispatch_state: ReviewFailureDispatchState;
  artifact_refs: Record<string, string>;
  mcp_error_code: string;
  details_kind: ReviewFailureDetailsKind;
  details: Record<string, unknown>;
}

export interface ReviewSessionMetadata {
  session_id: string;
  entrypoint: ReviewEntrypoint;
  execution_realization: ReviewExecutionRealization;
  host_runtime: ReviewHostRuntime;
  review_mode: ReviewMode;
  created_at: string;
  project_root: string;
  requested_target: string;
  requested_domain_token: string;
  onto_home: string;
  /** Effort persist (Option A): plan-time resolved LLM values from OntoConfig. */
  resolved_llm_plan?: ResolvedLlmPlan;
}

export interface TargetSnapshotManifest {
  review_target_scope_kind: ReviewTargetScopeKind;
  resolved_target_refs: string[];
  review_target_profile_ref: string;
  captured_at: string;
  capture_reason: string;
}

export interface ReviewTargetProfileRef {
  ref: string;
  role: ReviewTargetRefRole;
  kind: ReviewTargetRefKind;
  exists: boolean;
  sha256: string | null;
}

export interface ReviewTargetMaterialProfile {
  target_material_kind: TargetMaterialKind;
  target_material_kind_candidates: TargetMaterialKind[];
  support_status: TargetMaterialSupportStatus;
  unsupported_reason: string | null;
  detection: {
    owner: "runtime_heuristic";
    confidence: number;
    confidence_basis: string;
  };
}

export interface ReviewTargetProfileArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  target_scope_kind: ReviewTargetScopeKind;
  materialized_input_kind: ReviewTargetMaterializedInputKind;
  target_input_kind: ReviewTargetInputKind;
  target_material_kind: TargetMaterialKind;
  requested_target: string | null;
  review_intent_summary: string | null;
  artifact_roles: {
    primary: ReviewTargetArtifactRole;
    secondary: ReviewTargetArtifactRole[];
  };
  domain: string;
  maturity: "review_candidate";
  closure_level: ReviewTargetClosureLevel;
  review_goal: string[];
  closure_obligation_policy: string[];
  target_refs: ReviewTargetProfileRef[];
  material_profile: ReviewTargetMaterialProfile;
  boundary: {
    filesystem_allowed_roots: string[];
    source: "binding";
  };
  inference: {
    owner: "runtime_heuristic";
    confidence: number;
    confidence_basis: string;
  };
}

export interface ContextCandidateAssembly {
  system_purpose_refs: string[];
  domain_context_refs: string[];
  role_definition_refs: string[];
  execution_rule_refs: string[];
}

/**
 * Provenance of a ReviewUnitExecutionResult's `started_at`, `completed_at`,
 * and `duration_ms` fields.
 *
 * Consumers comparing per-unit timing across execution realizations MUST
 * consult this field — values from different provenances are NOT directly
 * comparable (e.g. averaging `duration_ms` across a mix of wall-clock and
 * dispatch-derived entries produces meaningless numbers). Use
 * {@link isPerUnitComparableProvenance} before treating `duration_ms` as a
 * per-unit measurement.
 *
 * - `runner_wallclock`: process wall-clock measurement taken at execution
 *   time. Both `started_at` and `completed_at` are exact within millisecond
 *   precision. Source: run-review-prompt-execution.ts (TS runner path).
 *
 * - `batch_window`: session-level window used when a unit does not have
 *   comparable per-unit timing. NOT a per-unit measurement — `duration_ms`
 *   reflects the enclosing session's wall-clock window.
 */
export type UnitTimestampProvenance = "runner_wallclock" | "batch_window";

/**
 * Predicate for consumers: returns true when `duration_ms` is a real per-unit
 * measurement safe to average / sort / SLA-compare. Returns false for
 * `batch_window` and for absent values.
 *
 * As of PR #26 there are no in-repo consumers of per-unit `duration_ms` —
 * this predicate is the recommended entry point for future aggregation,
 * reporting, or health-snapshot code.
 */
export function isPerUnitComparableProvenance(
  provenance: UnitTimestampProvenance | undefined | null,
): boolean {
  return provenance === "runner_wallclock";
}

export interface ReviewUnitExecutionResult {
  unit_id: string;
  unit_kind: ReviewUnitKind;
  packet_path: string;
  output_path: string;
  status: ReviewUnitExecutionStatus;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  /**
   * Provenance of `started_at` / `completed_at` / `duration_ms`. See
   * {@link UnitTimestampProvenance} for the interpretation of each value.
   *
   * Optional at the type level so that older artifacts (written before this
   * field existed) can still be parsed. All new writes MUST populate the
   * field. Consumers that care about measurability should use
   * {@link isPerUnitComparableProvenance}, which treats absence as
   * non-comparable.
   */
  timestamp_provenance?: UnitTimestampProvenance;
  failure_message?: string | null;
}

export interface ReviewExecutionResultArtifact {
  session_id: string;
  session_root: string;
  execution_realization: ReviewExecutionRealization;
  host_runtime: ReviewHostRuntime;
  review_mode: ReviewMode;
  execution_status: ReviewExecutionStatus;
  execution_started_at: string;
  execution_completed_at: string;
  total_duration_ms: number;
  max_concurrent_lenses: number;
  observed_dispatch_width?: number;
  planned_lens_ids: string[];
  participating_lens_ids: string[];
  degraded_lens_ids: string[];
  excluded_lens_ids: string[];
  executed_lens_count: number;
  synthesis_executed: boolean;
  deliberation_status?: DeliberationStatus | null | undefined;
  halt_reason?: string | null;
  halt_phase?: string | null;
  halt_unit_id?: string | null;
  halt_unit_kind?: ReviewUnitKind | null;
  halt_lens_id?: string | null;
  error_log_path: string;
  lens_completion_barrier_ref?: string;
  lens_execution_results: ReviewUnitExecutionResult[];
  issue_artifact_execution_results?: ReviewUnitExecutionResult[];
  deliberation_execution_results?: ReviewUnitExecutionResult[];
  /**
   * Per-unit result for the synthesize stage. `null` when synthesis was not
   * executed (typically `execution_status === "halted_partial"`). Consumers
   * must NOT interpret absence as `duration_ms: 0`; prefer an explicit null
   * check before including synthesize timing in any aggregation.
   */
  synthesize_execution_result?: ReviewUnitExecutionResult | null;
}

export type ReviewDegradationKind =
  | "lens_degradation"
  | "halted_partial"
  | "unit_failure";

export interface ReviewDegradationUnitFailure {
  unit_id: string;
  unit_kind: ReviewUnitKind;
  lens_id?: string | null;
  packet_path: string;
  output_path: string;
  failure_message: string;
}

export interface ReviewDegradationSummaryArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  source_execution_result_ref: string;
  source_error_log_ref: string | null;
  execution_status: ReviewExecutionStatus;
  degradation_kinds: ReviewDegradationKind[];
  degraded_lens_ids: string[];
  excluded_lens_ids: string[];
  halt_reason: string | null;
  halt_phase: string | null;
  halt_unit_id: string | null;
  halt_unit_kind: ReviewUnitKind | null;
  halt_lens_id: string | null;
  failed_units: ReviewDegradationUnitFailure[];
}

export interface ReviewLensCompletionBarrierArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  observed_dispatch_width: number;
  minimum_participating_lenses: number;
  planned_lens_ids: string[];
  completed_lens_ids: string[];
  failed_lens_ids: string[];
  missing_lens_ids: string[];
  degraded_lens_ids: string[];
  status: ReviewLensCompletionBarrierStatus;
  downstream_allowed: boolean;
  downstream_reason: string;
}

export interface ReviewLensDomainConstraint {
  source_doc: string;
  source_version_or_snapshot_id: string;
  anchor: string;
}

export interface ReviewLensProvenance {
  domain_constraints_used: ReviewLensDomainConstraint[] | null;
  domain_context_assumptions: string[] | null;
}

export type SharedPhenomenonClaimRelation =
  | "corroboration"
  | "disagreement"
  | "partial overlap"
  | "dedup";

export interface SharedPhenomenonSummaryEntry {
  target: string;
  evidence_anchor: string;
  participating_lens_ids: string[];
  claim_relation: SharedPhenomenonClaimRelation;
}

export interface ReviewResultIssueProjection {
  issue_id: string;
  severity: ReviewFindingSeverity;
  material: boolean;
  affected_purpose: string;
  failure_condition: string;
  impact: string;
  evidence_refs: string[];
  source_lens_ids: string[];
  action_candidates: ReviewActionCandidate[];
  rationale: string;
  domain_threshold_used?: string | null;
  problem_definition?: string;
  issue_statement?: string;
  timing_class?: string;
  closure_class?: string;
  closure_obligation?: string;
  judgment_state?: string;
}

export interface ReviewActionCandidateProjection {
  issue_id: string;
  candidates: ReviewActionCandidate[];
  derivation_refs: string[];
  rationale: string;
}

export interface ReviewResultClassificationSummary {
  highest_severity: ReviewFindingSeverity | null;
  finding_count: number;
  issue_count: number;
  finding_severity_counts: Record<ReviewFindingSeverity, number>;
  issue_severity_counts: Record<ReviewFindingSeverity, number>;
  severity_counts: Record<ReviewFindingSeverity, number>;
  material_issue_count: number;
  non_material_finding_count: number;
  material_issues: ReviewResultIssueProjection[];
  non_material_findings: ReviewResultIssueProjection[];
  action_candidates: ReviewActionCandidateProjection[];
}

export interface DirectoryListingOptions {
  excluded_names: string[];
  max_depth: number;
  max_entries: number;
}

export interface ReviewRecord {
  review_record_id: string;
  session_id: string;
  entrypoint: ReviewEntrypoint;
  record_status: ReviewRecordStatus;
  created_at: string;
  updated_at: string;
  request_text: string;
  review_target_scope_ref: string;
  interpretation_ref: string;
  binding_ref: string;
  domain_final_selection_ref: string;
  resolved_review_mode?: string;
  resolved_execution_realization?: string;
  resolved_host_runtime?: string;
  resolved_lens_ids: string[];
  execution_result_ref: string;
  session_metadata_ref: string;
  target_snapshot_ref: string;
  materialized_input_ref: string;
  review_target_profile_ref: string;
  context_candidate_assembly_ref: string;
  lens_result_refs: Record<string, string>;
  lens_output_schema_version: number;
  participating_lens_ids: string[];
  excluded_lens_ids: string[];
  degraded_lens_ids: string[];
  degradation_notes_ref?: string | null;
  per_lens_provenance: Record<string, ReviewLensProvenance>;
  finding_ledger_ref?: string | null;
  finding_relation_graph_ref?: string | null;
  issue_ledger_ref?: string | null;
  issue_stance_matrix_ref?: string | null;
  deliberation_plan_ref?: string | null;
  problem_framing_ref?: string | null;
  issue_resolution_summary?: unknown[];
  result_classification_summary?: ReviewResultClassificationSummary | null;
  synthesis_result_ref: string | null;
  deliberation_status: DeliberationStatus;
  deliberation_result_ref: string | null;
  final_output_ref: string;
  shared_phenomenon_summary: SharedPhenomenonSummaryEntry[];
}

export { REVIEW_TRANSITIONS as ALLOWED_TRANSITIONS } from "./review-state-machine.js";

/**
 * Output of the review invocation prepare-only path.
 *
 * Runs all pre-processing and session preparation, then returns without
 * executing lenses or completing the session.
 *
 * `request_text` is the **only** value not derivable from session artifacts
 * (not present in execution-plan.yaml). It must be preserved and passed to
 * the review completion runtime later.
 */
export interface PrepareOnlyResult {
  prepare_only: true;
  session_root: string;
  request_text: string;
  execution_realization: ReviewExecutionRealization;
  host_runtime: ReviewHostRuntime;
  review_mode: ReviewMode;
}
