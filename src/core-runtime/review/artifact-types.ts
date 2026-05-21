import type { FrameworkScope } from "../learning/shared/scope.js";

export type ReviewEntrypoint = "review";
export type ReviewTargetScopeKind = "file" | "directory" | "bundle";
/**
 * Execution realization for review lens / synthesize unit.
 * - "subagent":      single bounded execution unit (codex exec, claude Agent tool flat,
 *                     or TS process direct LLM call)
 * - "agent-teams":   nested team spawning (Claude Code TeamCreate; claude host only)
 * - "ts_inline_http": TS process directly calls an LLM endpoint. Inline content mode:
 *                     domain docs and target are embedded in the prompt rather than
 *                     fetched via tool calls. Suitable for hosts without their own
 *                     tool ecosystem (standalone CLI). See
 *                     `src/core-runtime/cli/inline-http-review-unit-executor.ts`.
 */
export type ReviewExecutionRealization = "subagent" | "agent-teams" | "ts_inline_http";
/**
 * Host runtime for review execution.
 * - "codex":      codex CLI subprocess (subagent + codex canonical combination)
 * - "claude":     Claude Code host session (both agent_teams_claude and subagent_claude
 *                 combinations; subject session chooses nested vs flat orchestration
 *                 based on its TeamCreate availability)
 * - "anthropic":  Anthropic SDK direct call from TS process. Phase 2 wires this as
 *                 `ts_inline_http + anthropic`. Subagent provider for "Claude Code main
 *                 + Anthropic SDK subagent" cross-host combinations.
 * - "openai":     OpenAI SDK direct call. Wires as `ts_inline_http + openai`.
 * - "grok":       xAI/Grok OpenAI-style API via TS process direct HTTP.
 * - "lmstudio":   Local LM Studio OpenAI-style endpoint.
 * - "standalone": TS process orchestrates with no host LLM (Phase 2 partial; main
 *                 LLM provider read from `main_llm` config in `.onto/config.yml`).
 * See .onto/authority/core-lexicon.yaml:LlmAgentSpawnRealization for semantic definitions.
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

export interface InvocationInterpretationArtifact {
  entrypoint: ReviewEntrypoint;
  target_scope_candidate: ReviewTargetScopeCandidate;
  intent_summary: string;
  domain_recommendation: string;
  domain_selection_required: boolean;
  review_mode_recommendation: ReviewMode;
  lens_selection_plan: LensSelectionPlan;
  ambiguity_notes: string[];
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
  materialized_input_path: string;
  context_candidate_assembly_path: string;
  synthesis_output_path: string;
  finding_ledger_path: string;
  finding_relation_graph_path: string;
  issue_ledger_path: string;
  issue_stance_matrix_path: string;
  deliberation_plan_path: string;
  problem_framing_path: string;
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
  synthesis_output_path: string;
  finding_ledger_path: string;
  finding_relation_graph_path: string;
  issue_ledger_path: string;
  issue_stance_matrix_path: string;
  deliberation_plan_path: string;
  problem_framing_path: string;
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
 * CLI override (`onto review --model=...`) 는 executor dispatch 층에서 추가 적용되므로
 * 본 필드는 **project-level 의도** 를 기록한다 (세션별 override 와 별개).
 *
 * Stderr `[plan:executor]` 로그의 artifact 화 목적. codex global config fallthrough
 * (v0.18.0 hardcoded override 제거 이후) 의 실제 값은 여기에 반영되지 않음 — 그 값은
 * 로그로만 관찰 가능하다는 경계를 의식적으로 유지.
 */
export interface ResolvedLlmPlan {
  model?: string;
  reasoning_effort?: string;
  provider?: string;
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
  plugin_root: string;
  /** Phase 2: persisted extract mode (validated at session start). */
  learning_extract_mode?: string;
  /** Effort persist (Option A): plan-time resolved LLM values from OntoConfig. */
  resolved_llm_plan?: ResolvedLlmPlan;
}

export interface TargetSnapshotManifest {
  review_target_scope_kind: ReviewTargetScopeKind;
  resolved_target_refs: string[];
  captured_at: string;
  capture_reason: string;
}

export interface ContextCandidateAssembly {
  system_purpose_refs: string[];
  domain_context_refs: string[];
  learning_context_refs: string[];
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
 * - `coordinator_derived`: `started_at` from coordinator-state.yaml
 *   transition timestamps (awaiting_lens_dispatch /
 *   awaiting_synthesize_dispatch), `completed_at` from
 *   fs.stat(output_path).mtime. Systematically over-estimates `duration_ms`
 *   by dispatch latency + agent boot time. Platform-dependent mtime
 *   precision (e.g. HFS+ 1s). Source: coordinator-helpers.ts when the
 *   state-transition read AND the mtime read both succeed for a
 *   participating unit.
 *
 * - `batch_window`: session-level window used when a unit does not have
 *   comparable per-unit timing. NOT a per-unit measurement — `duration_ms`
 *   reflects the enclosing session's wall-clock window.
 */
export type UnitTimestampProvenance =
  | "runner_wallclock"
  | "coordinator_derived"
  | "batch_window";

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
  return (
    provenance === "runner_wallclock" || provenance === "coordinator_derived"
  );
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
  planned_lens_ids: string[];
  participating_lens_ids: string[];
  degraded_lens_ids: string[];
  excluded_lens_ids: string[];
  executed_lens_count: number;
  synthesis_executed: boolean;
  deliberation_status?: DeliberationStatus | null | undefined;
  halt_reason?: string | null;
  error_log_path: string;
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
  /**
   * Optional mirror of `CoordinatorStateFile.orchestrator_reported_realization`
   * (see contract §18). Distinct from `resolved_execution_realization` which
   * records plan-time preference; this records the caller's actual dispatch
   * mechanism if self-reported. Absent when no self-report was provided.
   */
  orchestrator_reported_realization?: string;
  resolved_lens_ids: string[];
  execution_result_ref: string;
  session_metadata_ref: string;
  target_snapshot_ref: string;
  materialized_input_ref: string;
  context_candidate_assembly_ref: string;
  lens_result_refs: Record<string, string>;
  lens_output_schema_version: number;
  participating_lens_ids: string[];
  excluded_lens_ids: string[];
  degraded_lens_ids: string[];
  degradation_notes_ref?: string | null;
  per_lens_provenance: Record<string, ReviewLensProvenance>;
  finding_ledger_ref?: string;
  finding_relation_graph_ref?: string;
  issue_ledger_ref?: string;
  issue_stance_matrix_ref?: string;
  deliberation_plan_ref?: string;
  problem_framing_ref?: string;
  issue_resolution_summary?: unknown[];
  synthesis_result_ref: string;
  deliberation_status: DeliberationStatus;
  deliberation_result_ref: string;
  final_output_ref: string;
  shared_phenomenon_summary: SharedPhenomenonSummaryEntry[];
}

// ─────────────────────────────────────────────
// Coordinator State Machine types
// ─────────────────────────────────────────────

// CoordinatorStateName: canonical definition is in scope-runtime/state-machine.ts (REVIEW_STATES).
import type { ReviewState } from "../scope-runtime/state-machine.js";
export type CoordinatorStateName = ReviewState;

export interface CoordinatorStateTransition {
  from: CoordinatorStateName | "(init)";
  to: CoordinatorStateName;
  at: string;
}

export interface CoordinatorStateFile {
  schema_version: string;
  current_state: CoordinatorStateName;
  session_root: string;
  /** Source: PrepareOnlyResult.request_text */
  request_text: string;
  started_at: string;
  halt_reason: string | null;
  error_message: string | null;
  transitions: CoordinatorStateTransition[];
  /**
   * Realization self-reported by the orchestrator (e.g. Claude Code
   * session, coordinator subagent). Recorded on first `coordinator next`
   * call that carries `--orchestrator-reported-realization <value>`.
   *
   * Distinct from `resolved_execution_realization` in `binding.yaml`
   * (which records plan-time preference from the resolver). This field
   * records what the caller actually did — closing the gap observed in
   * development-records/benchmark/20260418-topology-smoke-full-e2e-results.md §"주목할 관찰 1".
   *
   * Values are free-form strings. Examples:
   *   - `claude-agent-tool-flat` (주체자가 Agent tool 로 flat spawn)
   *   - `claude-teamcreate-nested` (TeamCreate 로 coordinator + nested spawn)
   *   - `codex-subprocess` (codex CLI subprocess per lens)
   *
   * Absent when orchestrator did not self-report. Idempotent — first
   * value wins, subsequent calls with different values are ignored.
   */
  orchestrator_reported_realization?: string;
}

export interface CoordinatorAgentInstruction {
  lens_id: string;
  description: string;
  prompt: string;
  output_path: string;
  packet_path?: string;
}

export interface CoordinatorStartResult {
  state: "awaiting_lens_dispatch";
  session_root: string;
  request_text: string;
  agents: CoordinatorAgentInstruction[];
  /**
   * Maximum number of lens agents the orchestrator (caller) may dispatch
   * in parallel in a single batch. Orchestrator must split `agents[]` into
   * batches of this size, dispatch each batch, wait for all agents in the
   * batch to complete, then dispatch the next batch.
   *
   * Value resolution order (P9.2, 2026-04-21):
   *   1. `review.max_concurrent_lenses` (Axis C) in the project config.
   *   2. The resolved topology's catalog default (TOPOLOGY_CATALOG entry
   *      in `execution-topology-resolver.ts`).
   *
   * Zero/negative override values are ignored and the catalog default
   * applies instead. The previous `execution_topology_overrides` map
   * was removed when `OntoConfig.execution_topology_overrides` retired.
   */
  max_concurrent_lenses: number;
}

export interface CoordinatorNextResult {
  state: CoordinatorStateName;
  session_root: string;
  agent?: CoordinatorAgentInstruction | undefined;
  agents?: CoordinatorAgentInstruction[] | undefined;
  final_output_path?: string | undefined;
  review_record_path?: string | undefined;
  record_status?: string | undefined;
  halt_reason?: string | undefined;
  error_message?: string | undefined;
  participating_lens_ids?: string[] | undefined;
  degraded_lens_ids?: string[] | undefined;
}

// ALLOWED_TRANSITIONS: canonical definition is in scope-runtime/state-machine.ts (REVIEW_TRANSITIONS).
// Re-exported here for backward compatibility. W-B-02 dedup.
export { REVIEW_TRANSITIONS as ALLOWED_TRANSITIONS } from "../scope-runtime/state-machine.js";

/**
 * Output of `review:invoke --prepare-only`.
 *
 * Runs all pre-processing and session preparation, then returns without
 * executing lenses or completing the session. The Nested Spawn Coordinator
 * uses this to get `session_root` and then dispatches lenses via Agent tool.
 *
 * `request_text` is the **only** value not derivable from session artifacts
 * (not present in execution-plan.yaml). It must be preserved and passed to
 * `review:complete-session --request-text` later.
 */
export interface PrepareOnlyResult {
  prepare_only: true;
  session_root: string;
  request_text: string;
  execution_realization: ReviewExecutionRealization;
  host_runtime: ReviewHostRuntime;
  review_mode: ReviewMode;
}

// ─────────────────────────────────────────────
// Learning Extraction types (Phase 2)
// ─────────────────────────────────────────────

// Re-export canonical types from semantic-classifier (CONS-5: single definition)
export type {
  SemanticDecision,
  ConflictKind,
} from "../learning/shared/semantic-classifier.js";

/** Classified item trace — A-8 pass → A-11 executed */
export interface ClassifiedItemTrace {
  kind: "classified";
  lens_id: string;
  raw_line: string;
  assembled_line: string;
  repaired: boolean;
  repaired_line?: string;
  decision: import("../learning/shared/semantic-classifier.js").SemanticDecision;
  conflict_kind?: import("../learning/shared/semantic-classifier.js").ConflictKind;
  matched_existing_line?: string;
  reason: string;
  write_path: string | null;
  write_scope: FrameworkScope | null;
  learning_id: string | null;
  persistence_result:
    | "written"
    | "skipped_shadow"
    | "skipped_conflict"
    | "skipped_duplicate"
    | "skipped_unclassified"
    | "write_error";
  write_error?: string;
  model_id: string;
  prompt_hash: string;
}

/** Quarantined item trace — validation failed (CC-2: no semantic decision) */
export interface QuarantinedItemTrace {
  kind: "quarantined";
  lens_id: string;
  raw_line: string;
  assembled_line: string | null;
  failure_stage: "A-8" | "A-8f" | "A-9" | "A-9f";
  failure_reason: string;
  repaired_line?: string;
}

export type ExtractionItemTrace = ClassifiedItemTrace | QuarantinedItemTrace;

/** Conflict proposal (D-1: 저장 안 함 — manifest에만 기록) */
export interface ConflictProposal {
  lens_id: string;
  new_item_line: string;
  matched_existing_line: string;
  decision: "conflict_propose_replace" | "conflict_propose_keep" | "conflict_propose_coexist";
  conflict_kind: import("../learning/shared/semantic-classifier.js").ConflictKind;
  reason: string;
}

/** Event marker trace — C-11 */
export interface MarkerTrace {
  lens_id: string;
  marker_type: "applied-then-found-invalid";
  learning_excerpt: string;
  target_learning_id: string | null;
  resolution:
    | "attached"
    | "skipped_shadow"
    | "unresolved_no_id"
    | "unresolved_not_found";
  target_file?: string;
}

/** Extraction manifest — single owner (R1-U5). R5-IA-R5-2: items_unclassified_pending */
export interface ExtractionManifest {
  schema_version: "1";
  session_id: string;
  extract_mode: "shadow" | "active";
  taxonomy_version: "phase2-v1";
  timestamp: string;

  items_parsed: number;
  items_saved: number;
  items_quarantined: number;
  items_duplicate_skipped: number;
  items_conflict_proposed: number;
  items_unclassified_pending: number;
  markers_found: number;
  markers_attached: number;
  markers_skipped_shadow: number;
  markers_unresolved: number;

  item_traces: ExtractionItemTrace[];
  marker_traces: MarkerTrace[];
  conflict_proposals: ConflictProposal[];
  errors: string[];
}
