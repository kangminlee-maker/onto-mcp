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

export interface ReconstructSeedClaim {
  claim_id: string;
  name: string;
  statement: string;
  evidence_refs: ReconstructEvidenceRef[];
}

export const RECONSTRUCT_SEED_SCHEMA_VERSIONS = [
  "legacy",
  "transitional",
  "concept_centered",
] as const;

export type ReconstructSeedSchemaVersion =
  (typeof RECONSTRUCT_SEED_SCHEMA_VERSIONS)[number];

export const RECONSTRUCT_HANDOFF_QUESTION_SOURCES = [
  "declared_purpose",
  "user_request",
  "domain_profile",
  "lens_requirement",
] as const;

export type ReconstructHandoffQuestionSource =
  (typeof RECONSTRUCT_HANDOFF_QUESTION_SOURCES)[number];

export interface ReconstructSeedAnswerabilityScope {
  declared_handoff_questions: Array<{
    question_id: string;
    question: string;
    source: ReconstructHandoffQuestionSource;
  }>;
  supported_questions: Array<{
    question_id: string;
    answered_by: {
      concept_ids: string[];
      relation_ids: string[];
    };
    confidence: string;
  }>;
  deferred_questions: Array<{
    question_id: string;
    reason_deferred: string;
    frontier_pressure_ids: string[];
  }>;
  unsupported_questions: Array<{
    question_id: string;
    reason_unsupported: string;
  }>;
  supported_actions: Array<{
    action_id: string;
    action: string;
    supported_by_question_ids: string[];
    readiness_statement: string;
  }>;
  unsupported_actions: Array<{
    action_id: string;
    action: string;
    reason_unsupported: string;
  }>;
  handoff_readiness_statement: string;
  handoff_readiness_question_ids: string[];
}

export interface ReconstructTopLevelConcept {
  concept_id: string;
  name: string;
  aliases: string[];
  definition: string;
  why_top_level: string;
  evidence_refs: ReconstructEvidenceRef[];
  boundary: {
    included_summary: string;
    excluded_summary: string;
    deferred_summary: string;
  };
  confidence: string;
  provisional: boolean;
}

export const RECONSTRUCT_TOP_LEVEL_RELATION_KINDS = [
  "depends_on",
  "enables",
  "produces",
  "consumes",
  "represents",
  "governs",
  "groups",
  "part_of",
  "related_to",
] as const;

export type ReconstructTopLevelRelationKind =
  (typeof RECONSTRUCT_TOP_LEVEL_RELATION_KINDS)[number];

export interface ReconstructTopLevelRelation {
  relation_id: string;
  source_concept_id: string;
  target_concept_id: string;
  relation_kind: ReconstructTopLevelRelationKind;
  relation_label: string;
  direction_statement: string;
  statement: string;
  evidence_refs: ReconstructEvidenceRef[];
  confidence: string;
  provisional: boolean;
  registration_status: "design_local";
}

export interface ReconstructRelationParticipationException {
  concept_id: string;
  isolation_reason: string;
  isolation_pressure_ids: string[];
}

export const RECONSTRUCT_LOWER_LEVEL_DETAIL_PLACEMENTS = [
  "included_support",
  "excluded_boundary",
  "deferred_followup",
  "open_question",
] as const;

export type ReconstructLowerLevelDetailPlacement =
  (typeof RECONSTRUCT_LOWER_LEVEL_DETAIL_PLACEMENTS)[number];

export interface ReconstructLowerLevelDetailPlacementRecord {
  detail_id: string;
  name: string;
  material_kind: TargetMaterialKind;
  source_ref: string;
  placement: ReconstructLowerLevelDetailPlacement;
  owner_concept_id: string;
  rationale: string;
  evidence_refs: ReconstructEvidenceRef[];
  follow_up_question: string | null;
}

export const RECONSTRUCT_FRONTIER_PRESSURE_ORIGINS = [
  "source_observation",
  "lens_objection",
  "material_coverage",
  "answerability_check",
  "lifecycle_event",
] as const;

export type ReconstructFrontierPressureOrigin =
  (typeof RECONSTRUCT_FRONTIER_PRESSURE_ORIGINS)[number];

export const RECONSTRUCT_FRONTIER_PRESSURE_TYPES = [
  "missing_axis",
  "split_or_merge",
  "boundary",
  "core_relation",
  "abstraction_level",
  "evidence_saturation",
  "answerability_gap",
  "material_coverage_gap",
] as const;

export type ReconstructFrontierPressureType =
  (typeof RECONSTRUCT_FRONTIER_PRESSURE_TYPES)[number];

export const RECONSTRUCT_FRONTIER_PRESSURE_STATUSES = [
  "open",
  "resolved",
  "deferred",
  "superseded",
  "non_blocking",
] as const;

export type ReconstructFrontierPressureStatus =
  (typeof RECONSTRUCT_FRONTIER_PRESSURE_STATUSES)[number];

export interface ReconstructFrontierPressure {
  pressure_id: string;
  origin: ReconstructFrontierPressureOrigin;
  origin_ref: string;
  pressure_type: ReconstructFrontierPressureType;
  pressure_question: string;
  target_concept_ids: string[];
  target_relation_ids: string[];
  material_kind: TargetMaterialKind;
  source_ref: string;
  expected_decision_impact: string;
  priority: "high" | "medium" | "low";
  status: ReconstructFrontierPressureStatus;
  status_reason: string;
  superseded_by_pressure_id: string | null;
  evidence_refs: ReconstructEvidenceRef[];
}

export interface ReconstructMaterialCoverageCheckpoint {
  observed_material_kinds: TargetMaterialKind[];
  observed_source_slices: string[];
  source_authority_scope: {
    permission_scope: "within_declared_boundary" | "restricted" | "unknown";
    permission_basis_refs: string[];
    trust_status:
      | "observed_evidence_only"
      | "user_provided_authority"
      | "external_untrusted"
      | "mixed";
    instruction_authority_status:
      | "none_data_only"
      | "declared_process_authority"
      | "mixed_requires_disclosure";
    external_content_handling:
      | "not_applicable"
      | "treated_as_untrusted_data"
      | "sanitized_or_quoted"
      | "excluded";
    restricted_source_refs: string[];
    rationale: string;
  };
  intentionally_excluded_material_kinds: TargetMaterialKind[];
  unexplored_source_categories: string[];
  possible_missing_axis_pressure_ids: string[];
  rationale_for_seed_level_sufficiency: string;
  partial_support_disclosures: string[];
}

export const RECONSTRUCT_CONCEPT_CONVERGENCE_STATES = [
  "not_converged",
  "provisionally_converged",
  "converged_for_seed",
] as const;

export type ReconstructConceptConvergenceState =
  (typeof RECONSTRUCT_CONCEPT_CONVERGENCE_STATES)[number];

export interface ReconstructConceptConvergence {
  state: ReconstructConceptConvergenceState;
  source_convergence_rationale: string;
  review_confirmed: boolean;
  review_profile_ref: string | null;
  remaining_pressure_ids: string[];
}

export interface ReconstructSeedLifecycle {
  seed_id: string;
  parent_seed_ref: string | null;
  id_stability_scope: "session" | "lineage";
  session_id: string;
  source_snapshot_refs: string[];
  source_snapshot_transition: {
    prior_snapshot_refs: string[];
    transition_reason: string;
  };
  exploration_rounds: Array<{
    round_id: string;
    observed_source_refs: string[];
    authoring_pass_ref: string | null;
    changed_concept_ids: string[];
    changed_relation_ids: string[];
    changed_frontier_pressure_ids: string[];
  }>;
  concept_identity_events: Array<{
    event_id: string;
    event_type: ReconstructConceptIdentityEventType;
    prior_concept_ids: string[];
    current_concept_ids: string[];
    target_detail_ids: string[];
    prior_names: string[];
    new_names: string[];
    prior_aliases: string[];
    current_aliases: string[];
    reason: string;
    evidence_refs: ReconstructEvidenceRef[];
    frontier_pressure_ids: string[];
  }>;
  relation_identity_events: Array<{
    event_id: string;
    event_type: ReconstructRelationIdentityEventType;
    prior_relation_ids: string[];
    current_relation_ids: string[];
    reason: string;
    evidence_refs: ReconstructEvidenceRef[];
    frontier_pressure_ids: string[];
  }>;
  pressure_events: Array<{
    event_id: string;
    event_type: ReconstructPressureEventType;
    pressure_id: string;
    prior_status: ReconstructFrontierPressureStatus | null;
    new_status: ReconstructFrontierPressureStatus;
    superseded_by_pressure_id: string | null;
    reason: string;
    evidence_refs: ReconstructEvidenceRef[];
  }>;
  detail_placement_events: Array<{
    event_id: string;
    event_type: ReconstructDetailPlacementEventType;
    detail_ids: string[];
    reason: string;
    evidence_refs: ReconstructEvidenceRef[];
    frontier_pressure_ids: string[];
  }>;
  answerability_events: Array<{
    event_id: string;
    event_type: ReconstructAnswerabilityEventType;
    question_ids: string[];
    action_ids: string[];
    frontier_pressure_ids: string[];
    reason: string;
  }>;
  material_coverage_events: Array<{
    event_id: string;
    event_type: ReconstructMaterialCoverageEventType;
    source_refs: string[];
    material_kinds: TargetMaterialKind[];
    changed_authority_fields: string[];
    prior_authority_state_ref: string | null;
    current_authority_state_ref: string | null;
    prior_authority_state: Record<string, unknown> | null;
    current_authority_state: Record<string, unknown> | null;
    frontier_pressure_ids: string[];
    reason: string;
  }>;
  convergence_events: Array<{
    event_id: string;
    prior_state: ReconstructConceptConvergenceState | null;
    new_state: ReconstructConceptConvergenceState;
    frontier_pressure_ids: string[];
    reason: string;
  }>;
}

export const RECONSTRUCT_CONCEPT_IDENTITY_EVENT_TYPES = [
  "created",
  "renamed",
  "alias_changed",
  "split",
  "merged",
  "demoted",
  "boundary_changed",
] as const;

export type ReconstructConceptIdentityEventType =
  (typeof RECONSTRUCT_CONCEPT_IDENTITY_EVENT_TYPES)[number];

export const RECONSTRUCT_RELATION_IDENTITY_EVENT_TYPES = [
  "created",
  "changed_direction",
  "changed_kind",
  "split",
  "merged",
  "removed",
] as const;

export type ReconstructRelationIdentityEventType =
  (typeof RECONSTRUCT_RELATION_IDENTITY_EVENT_TYPES)[number];

export const RECONSTRUCT_PRESSURE_EVENT_TYPES = [
  "created",
  "resolved",
  "deferred",
  "reopened",
  "superseded",
  "non_blocking",
] as const;

export type ReconstructPressureEventType =
  (typeof RECONSTRUCT_PRESSURE_EVENT_TYPES)[number];

export const RECONSTRUCT_DETAIL_PLACEMENT_EVENT_TYPES = [
  "placed",
  "changed_owner",
  "changed_placement",
  "removed",
] as const;

export type ReconstructDetailPlacementEventType =
  (typeof RECONSTRUCT_DETAIL_PLACEMENT_EVENT_TYPES)[number];

export const RECONSTRUCT_ANSWERABILITY_EVENT_TYPES = [
  "question_supported",
  "question_deferred",
  "question_unsupported",
  "action_supported",
  "action_unsupported",
] as const;

export type ReconstructAnswerabilityEventType =
  (typeof RECONSTRUCT_ANSWERABILITY_EVENT_TYPES)[number];

export const RECONSTRUCT_MATERIAL_COVERAGE_EVENT_TYPES = [
  "source_slice_added",
  "material_kind_excluded",
  "coverage_gap_disclosed",
  "coverage_gap_resolved",
  "source_authority_scope_changed",
] as const;

export type ReconstructMaterialCoverageEventType =
  (typeof RECONSTRUCT_MATERIAL_COVERAGE_EVENT_TYPES)[number];

export const RECONSTRUCT_SEED_AUTHORITY_FIELDS = [
  "answerability_scope",
  "top_level_concepts",
  "top_level_relations",
  "relation_participation_exceptions",
  "lower_level_detail_placements",
  "frontier_pressure_log",
  "material_coverage_checkpoint",
  "convergence",
  "lifecycle",
  "migration_records",
] as const;

export const RECONSTRUCT_SEED_MIGRATION_TARGETS = [
  {
    source_field: "entities",
    target_authority_field: "top_level_concepts",
    accepted_target_authority_fields: ["top_level_concepts"],
    mapping_rule:
      "Legacy entity claims become top-level concept candidates when they explain the declared purpose.",
    compatibility_status: "transitional_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Concept-centered top_level_concepts are the Seed concept authority.",
  },
  {
    source_field: "relations",
    target_authority_field: "top_level_relations",
    accepted_target_authority_fields: ["top_level_relations"],
    mapping_rule:
      "Legacy relation claims become top-level relation hypotheses between selected concepts.",
    compatibility_status: "transitional_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Canonical relation hypotheses live in top_level_relations.",
  },
  {
    source_field: "actions",
    target_authority_field: "answerability_scope.supported_actions",
    accepted_target_authority_fields: [
      "answerability_scope.supported_actions",
      "answerability_scope.unsupported_actions",
    ],
    mapping_rule:
      "Legacy action claims become supported or unsupported Seed-stage actions.",
    compatibility_status: "transitional_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Seed-stage action readiness is owned by answerability_scope.",
  },
  {
    source_field: "properties",
    target_authority_field: "lower_level_detail_placements",
    accepted_target_authority_fields: [
      "lower_level_detail_placements",
      "top_level_concepts.boundary",
      "top_level_relations",
      "answerability_scope.supported_questions",
      "answerability_scope.deferred_questions",
      "answerability_scope.unsupported_questions",
    ],
    mapping_rule:
      "Legacy property claims become lower-level detail placements unless they change concept boundaries.",
    compatibility_status: "transitional_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Lower-level facts must not compete with top-level concept authority.",
  },
  {
    source_field: "rules",
    target_authority_field: "lower_level_detail_placements",
    accepted_target_authority_fields: [
      "lower_level_detail_placements",
      "top_level_concepts.boundary",
      "top_level_relations",
      "answerability_scope.supported_questions",
      "answerability_scope.deferred_questions",
      "answerability_scope.unsupported_questions",
      "frontier_pressure_log",
    ],
    mapping_rule:
      "Legacy rule claims become lower-level detail placements or boundary-affecting evidence.",
    compatibility_status: "transitional_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Seed-stage rule details are not a separate ontology authority.",
  },
  {
    source_field: "open_questions",
    target_authority_field: "answerability_scope.deferred_questions",
    accepted_target_authority_fields: [
      "answerability_scope.deferred_questions",
      "answerability_scope.unsupported_questions",
    ],
    mapping_rule:
      "Legacy open questions become deferred or unsupported handoff questions with pressure refs when applicable.",
    compatibility_status: "transitional_projection",
    obligation_status: "compatibility_allowed",
    rationale: "The declared question inventory lives in answerability_scope.",
  },
  {
    source_field: "included_lower_concepts",
    target_authority_field: "lower_level_detail_placements",
    accepted_target_authority_fields: ["lower_level_detail_placements"],
    mapping_rule:
      "Retired included lower concepts become lower-level detail placements under an owning top-level concept.",
    compatibility_status: "retired_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Retired lower-concept projections are supporting detail, not Seed concept authority.",
  },
  {
    source_field: "excluded_or_deferred_details",
    target_authority_field: "lower_level_detail_placements",
    accepted_target_authority_fields: ["lower_level_detail_placements"],
    mapping_rule:
      "Retired excluded or deferred details become lower-level detail placements with deferred placement where applicable.",
    compatibility_status: "retired_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Deferred detail disposition is owned by lower_level_detail_placements.",
  },
  {
    source_field: "boundary_notes",
    target_authority_field: "top_level_concepts.boundary",
    accepted_target_authority_fields: ["top_level_concepts.boundary"],
    mapping_rule:
      "Retired boundary notes become per-concept included, excluded, and deferred boundary summaries.",
    compatibility_status: "retired_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Concept boundaries live on the top_level_concepts authority seat.",
  },
  {
    source_field: "core_relations",
    target_authority_field: "top_level_relations",
    accepted_target_authority_fields: ["top_level_relations"],
    mapping_rule:
      "Retired core relations become top-level relation hypotheses.",
    compatibility_status: "retired_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Relation authority is centralized in top_level_relations.",
  },
  {
    source_field: "deferred_detail_candidates",
    target_authority_field: "lower_level_detail_placements",
    accepted_target_authority_fields: ["lower_level_detail_placements"],
    mapping_rule:
      "Retired deferred detail candidates become deferred lower-level detail placements.",
    compatibility_status: "retired_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Deferred detail disposition is owned by lower_level_detail_placements.",
  },
  {
    source_field: "convergence.remaining_pressures",
    target_authority_field: "frontier_pressure_log",
    accepted_target_authority_fields: [
      "frontier_pressure_log",
      "convergence.remaining_pressure_ids",
    ],
    mapping_rule:
      "Retired convergence remaining pressures become lifecycle-tracked frontier pressure records.",
    compatibility_status: "retired_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Open or deferred convergence pressure is owned by frontier_pressure_log.",
  },
  {
    source_field: "frontier_refs",
    target_authority_field: "frontier_pressure_log",
    accepted_target_authority_fields: ["frontier_pressure_log"],
    mapping_rule:
      "Retired frontier refs become frontier pressure records that explain why another source would change the Seed.",
    compatibility_status: "retired_projection",
    obligation_status: "compatibility_allowed",
    rationale: "Frontier exploration pressure is owned by frontier_pressure_log.",
  },
] as const;

export type ReconstructSeedMigrationSourceField =
  (typeof RECONSTRUCT_SEED_MIGRATION_TARGETS)[number]["source_field"];

export type ReconstructSeedMigrationTargetAuthorityField =
  (typeof RECONSTRUCT_SEED_MIGRATION_TARGETS)[number]["accepted_target_authority_fields"][number];

export const RECONSTRUCT_TRANSITIONAL_LEGACY_SOURCE_FIELDS =
  RECONSTRUCT_SEED_MIGRATION_TARGETS
    .filter((record) => record.compatibility_status === "transitional_projection")
    .map((record) => record.source_field);

export const RECONSTRUCT_RETIRED_SEED_SOURCE_FIELDS =
  RECONSTRUCT_SEED_MIGRATION_TARGETS
    .filter((record) => record.compatibility_status === "retired_projection")
    .map((record) => record.source_field);

export interface ReconstructSeedMigrationRecord {
  migration_id: string;
  source_field: string;
  target_authority_field: string;
  migration_artifact_ref: string | null;
}

export interface ReconstructSeedCandidateArtifactBase {
  schema_version: "1";
  seed_schema_version?: ReconstructSeedSchemaVersion;
  session_id: string;
  created_at: string;
  purpose: ReconstructSeedClaim;
}

export type ReconstructLegacySeedCandidateArtifact =
  ReconstructSeedCandidateArtifactBase & {
    seed_schema_version?: "legacy";
    non_goals: ReconstructSeedClaim[];
    entities: ReconstructSeedClaim[];
    relations: ReconstructSeedClaim[];
    actions: ReconstructSeedClaim[];
    properties: ReconstructSeedClaim[];
    rules: ReconstructSeedClaim[];
    open_questions: string[];
  };

export type ReconstructTransitionalSeedCandidateArtifact =
  ReconstructSeedCandidateArtifactBase & {
    seed_schema_version: "transitional";
    answerability_scope: ReconstructSeedAnswerabilityScope;
    top_level_concepts: ReconstructTopLevelConcept[];
    top_level_relations: ReconstructTopLevelRelation[];
    relation_participation_exceptions: ReconstructRelationParticipationException[];
    lower_level_detail_placements: ReconstructLowerLevelDetailPlacementRecord[];
    frontier_pressure_log: ReconstructFrontierPressure[];
    material_coverage_checkpoint: ReconstructMaterialCoverageCheckpoint;
    convergence: ReconstructConceptConvergence;
    lifecycle: ReconstructSeedLifecycle;
    migration_records: ReconstructSeedMigrationRecord[];
    non_goals: ReconstructSeedClaim[];
    entities: ReconstructSeedClaim[];
    relations: ReconstructSeedClaim[];
    actions: ReconstructSeedClaim[];
    properties: ReconstructSeedClaim[];
    rules: ReconstructSeedClaim[];
    open_questions: string[];
  };

export type ReconstructConceptCenteredSeedCandidateArtifact =
  ReconstructSeedCandidateArtifactBase & {
    seed_schema_version: "concept_centered";
    answerability_scope: ReconstructSeedAnswerabilityScope;
    top_level_concepts: ReconstructTopLevelConcept[];
    top_level_relations: ReconstructTopLevelRelation[];
    relation_participation_exceptions: ReconstructRelationParticipationException[];
    lower_level_detail_placements: ReconstructLowerLevelDetailPlacementRecord[];
    frontier_pressure_log: ReconstructFrontierPressure[];
    material_coverage_checkpoint: ReconstructMaterialCoverageCheckpoint;
    convergence: ReconstructConceptConvergence;
    lifecycle: ReconstructSeedLifecycle;
    migration_records?: ReconstructSeedMigrationRecord[];
  };

export type ReconstructSeedCandidateArtifact =
  | ReconstructLegacySeedCandidateArtifact
  | ReconstructTransitionalSeedCandidateArtifact
  | ReconstructConceptCenteredSeedCandidateArtifact;

export interface ReconstructSeedCandidateValidationViolation {
  code:
    | "schema_shape_invalid"
    | "session_id_mismatch"
    | "prior_observation_directive_invalid"
    | "claim_id_missing"
    | "claim_name_missing"
    | "claim_name_generic"
    | "duplicate_claim_id"
    | "claim_statement_missing"
    | "claim_evidence_missing"
    | "evidence_ref_shape_invalid"
    | "unknown_observation_ref"
    | "unselected_observation_ref"
    | "material_kind_mismatch"
    | "source_ref_mismatch"
    | "location_mismatch"
    | "invalid_seed_schema_version"
    | "concept_seed_field_missing"
    | "duplicate_concept_id"
    | "duplicate_relation_id"
    | "duplicate_pressure_id"
    | "duplicate_detail_id"
    | "duplicate_question_id"
    | "duplicate_action_id"
    | "duplicate_migration_id"
    | "unknown_concept_ref"
    | "unknown_relation_ref"
    | "unknown_pressure_ref"
    | "unknown_detail_ref"
    | "unknown_question_ref"
    | "unknown_action_ref"
    | "unknown_source_ref"
    | "invalid_enum"
    | "relation_axis_stored"
    | "relation_participation_missing"
    | "answerability_text_missing"
    | "review_profile_ref_missing"
    | "lifecycle_transition_invalid"
    | "pressure_transition_invalid"
    | "migration_record_invalid"
    | "forbidden_lifecycle_field"
    | "convergence_open_pressure"
    | "answerability_inventory_mismatch"
    | "migration_record_missing";
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
  "source_inventory",
  "initial_source_frontier",
  "source_observation",
  "observation_directive",
  "observation_directive_validation",
  "lens_judgment",
  "exploration_synthesis",
  "source_frontier",
  "source_frontier_validation",
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
    realization: "runtime" | "mock" | "direct_call";
    actor_id: string;
  };
  status: "completed" | "skipped" | "failed";
  artifact_refs: string[];
  reason?: string;
  authority_impact?: string;
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
    runner: "material-aware-happy-path" | "integral-exploration-direct-call";
    semantic_author_realization: "mock" | "direct_call";
    confirmation_provider_realization: "mock" | "direct_call";
    directive_author_id: string;
    confirmation_provider_id: string;
    allowed_completion_claim: string;
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
  initial_source_frontier: string | null;
  source_observations: string | null;
  source_observation_directive: string | null;
  source_observation_directive_validation: string | null;
  lens_judgment_index: string | null;
  exploration_synthesis: string | null;
  source_frontier: string | null;
  source_frontier_validation: string | null;
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
  initial_source_frontier: string;
  source_observations: string;
}
