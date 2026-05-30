import type { TargetMaterialKind } from "../../target-material-kind.js";
import type {
  ReconstructEvidenceRef,
  ReconstructSeedClaim,
} from "../artifact-types.js";

export const LEGACY_RECONSTRUCT_SEED_SCHEMA_VERSIONS = [
  "legacy",
  "transitional",
  "concept_centered",
] as const;

export type LegacyReconstructSeedSchemaVersion =
  (typeof LEGACY_RECONSTRUCT_SEED_SCHEMA_VERSIONS)[number];

export const LEGACY_RECONSTRUCT_HANDOFF_QUESTION_SOURCES = [
  "declared_purpose",
  "user_request",
  "domain_profile",
  "lens_requirement",
] as const;

export type LegacyReconstructHandoffQuestionSource =
  (typeof LEGACY_RECONSTRUCT_HANDOFF_QUESTION_SOURCES)[number];

export interface LegacyReconstructSeedAnswerabilityScope {
  declared_handoff_questions: Array<{
    question_id: string;
    question: string;
    source: LegacyReconstructHandoffQuestionSource;
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

export interface LegacyReconstructTopLevelConcept {
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

export const LEGACY_RECONSTRUCT_TOP_LEVEL_RELATION_KINDS = [
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

export type LegacyReconstructTopLevelRelationKind =
  (typeof LEGACY_RECONSTRUCT_TOP_LEVEL_RELATION_KINDS)[number];

export interface LegacyReconstructTopLevelRelation {
  relation_id: string;
  source_concept_id: string;
  target_concept_id: string;
  relation_kind: LegacyReconstructTopLevelRelationKind;
  relation_label: string;
  direction_statement: string;
  statement: string;
  evidence_refs: ReconstructEvidenceRef[];
  confidence: string;
  provisional: boolean;
  registration_status: "design_local";
}

export interface LegacyReconstructRelationParticipationException {
  concept_id: string;
  isolation_reason: string;
  isolation_pressure_ids: string[];
}

export const LEGACY_RECONSTRUCT_LOWER_LEVEL_DETAIL_PLACEMENTS = [
  "included_support",
  "excluded_boundary",
  "deferred_followup",
  "open_question",
] as const;

export type LegacyReconstructLowerLevelDetailPlacement =
  (typeof LEGACY_RECONSTRUCT_LOWER_LEVEL_DETAIL_PLACEMENTS)[number];

export interface LegacyReconstructLowerLevelDetailPlacementRecord {
  detail_id: string;
  name: string;
  material_kind: TargetMaterialKind;
  source_ref: string;
  placement: LegacyReconstructLowerLevelDetailPlacement;
  owner_concept_id: string;
  rationale: string;
  evidence_refs: ReconstructEvidenceRef[];
  follow_up_question: string | null;
}

export const LEGACY_RECONSTRUCT_FRONTIER_PRESSURE_ORIGINS = [
  "source_observation",
  "lens_objection",
  "material_coverage",
  "answerability_check",
  "lifecycle_event",
] as const;

export type LegacyReconstructFrontierPressureOrigin =
  (typeof LEGACY_RECONSTRUCT_FRONTIER_PRESSURE_ORIGINS)[number];

export const LEGACY_RECONSTRUCT_FRONTIER_PRESSURE_TYPES = [
  "missing_axis",
  "split_or_merge",
  "boundary",
  "core_relation",
  "abstraction_level",
  "evidence_saturation",
  "answerability_gap",
  "material_coverage_gap",
] as const;

export type LegacyReconstructFrontierPressureType =
  (typeof LEGACY_RECONSTRUCT_FRONTIER_PRESSURE_TYPES)[number];

export const LEGACY_RECONSTRUCT_FRONTIER_PRESSURE_STATUSES = [
  "open",
  "resolved",
  "deferred",
  "superseded",
  "non_blocking",
] as const;

export type LegacyReconstructFrontierPressureStatus =
  (typeof LEGACY_RECONSTRUCT_FRONTIER_PRESSURE_STATUSES)[number];

export interface LegacyReconstructFrontierPressure {
  pressure_id: string;
  origin: LegacyReconstructFrontierPressureOrigin;
  origin_ref: string;
  pressure_type: LegacyReconstructFrontierPressureType;
  pressure_question: string;
  target_concept_ids: string[];
  target_relation_ids: string[];
  material_kind: TargetMaterialKind;
  source_ref: string;
  expected_decision_impact: string;
  priority: "high" | "medium" | "low";
  status: LegacyReconstructFrontierPressureStatus;
  status_reason: string;
  superseded_by_pressure_id: string | null;
  evidence_refs: ReconstructEvidenceRef[];
}

export interface LegacyReconstructMaterialCoverageCheckpoint {
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

export const LEGACY_RECONSTRUCT_CONCEPT_CONVERGENCE_STATES = [
  "not_converged",
  "provisionally_converged",
  "converged_for_seed",
] as const;

export type LegacyReconstructConceptConvergenceState =
  (typeof LEGACY_RECONSTRUCT_CONCEPT_CONVERGENCE_STATES)[number];

export interface LegacyReconstructConceptConvergence {
  state: LegacyReconstructConceptConvergenceState;
  source_convergence_rationale: string;
  review_confirmed: boolean;
  review_profile_ref: string | null;
  remaining_pressure_ids: string[];
}

export const LEGACY_RECONSTRUCT_CONCEPT_IDENTITY_EVENT_TYPES = [
  "created",
  "renamed",
  "alias_changed",
  "split",
  "merged",
  "demoted",
  "boundary_changed",
] as const;

export type LegacyReconstructConceptIdentityEventType =
  (typeof LEGACY_RECONSTRUCT_CONCEPT_IDENTITY_EVENT_TYPES)[number];

export const LEGACY_RECONSTRUCT_RELATION_IDENTITY_EVENT_TYPES = [
  "created",
  "changed_direction",
  "changed_kind",
  "split",
  "merged",
  "removed",
] as const;

export type LegacyReconstructRelationIdentityEventType =
  (typeof LEGACY_RECONSTRUCT_RELATION_IDENTITY_EVENT_TYPES)[number];

export const LEGACY_RECONSTRUCT_PRESSURE_EVENT_TYPES = [
  "created",
  "resolved",
  "deferred",
  "reopened",
  "superseded",
  "non_blocking",
] as const;

export type LegacyReconstructPressureEventType =
  (typeof LEGACY_RECONSTRUCT_PRESSURE_EVENT_TYPES)[number];

export const LEGACY_RECONSTRUCT_DETAIL_PLACEMENT_EVENT_TYPES = [
  "placed",
  "changed_owner",
  "changed_placement",
  "removed",
] as const;

export type LegacyReconstructDetailPlacementEventType =
  (typeof LEGACY_RECONSTRUCT_DETAIL_PLACEMENT_EVENT_TYPES)[number];

export const LEGACY_RECONSTRUCT_ANSWERABILITY_EVENT_TYPES = [
  "question_supported",
  "question_deferred",
  "question_unsupported",
  "action_supported",
  "action_unsupported",
] as const;

export type LegacyReconstructAnswerabilityEventType =
  (typeof LEGACY_RECONSTRUCT_ANSWERABILITY_EVENT_TYPES)[number];

export const LEGACY_RECONSTRUCT_MATERIAL_COVERAGE_EVENT_TYPES = [
  "source_slice_added",
  "material_kind_excluded",
  "coverage_gap_disclosed",
  "coverage_gap_resolved",
  "source_authority_scope_changed",
] as const;

export type LegacyReconstructMaterialCoverageEventType =
  (typeof LEGACY_RECONSTRUCT_MATERIAL_COVERAGE_EVENT_TYPES)[number];

export interface LegacyReconstructSeedLifecycle {
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
    event_type: LegacyReconstructConceptIdentityEventType;
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
    event_type: LegacyReconstructRelationIdentityEventType;
    prior_relation_ids: string[];
    current_relation_ids: string[];
    reason: string;
    evidence_refs: ReconstructEvidenceRef[];
    frontier_pressure_ids: string[];
  }>;
  pressure_events: Array<{
    event_id: string;
    event_type: LegacyReconstructPressureEventType;
    pressure_id: string;
    prior_status: LegacyReconstructFrontierPressureStatus | null;
    new_status: LegacyReconstructFrontierPressureStatus;
    superseded_by_pressure_id: string | null;
    reason: string;
    evidence_refs: ReconstructEvidenceRef[];
  }>;
  detail_placement_events: Array<{
    event_id: string;
    event_type: LegacyReconstructDetailPlacementEventType;
    detail_ids: string[];
    reason: string;
    evidence_refs: ReconstructEvidenceRef[];
    frontier_pressure_ids: string[];
  }>;
  answerability_events: Array<{
    event_id: string;
    event_type: LegacyReconstructAnswerabilityEventType;
    question_ids: string[];
    action_ids: string[];
    frontier_pressure_ids: string[];
    reason: string;
  }>;
  material_coverage_events: Array<{
    event_id: string;
    event_type: LegacyReconstructMaterialCoverageEventType;
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
    prior_state: LegacyReconstructConceptConvergenceState | null;
    new_state: LegacyReconstructConceptConvergenceState;
    frontier_pressure_ids: string[];
    reason: string;
  }>;
}

export const LEGACY_RECONSTRUCT_SEED_AUTHORITY_FIELDS = [
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

export const LEGACY_RECONSTRUCT_SEED_MIGRATION_TARGETS = [
  {
    source_field: "entities",
    target_authority_field: "top_level_concepts",
    accepted_target_authority_fields: ["top_level_concepts"],
    mapping_rule:
      "Legacy entity claims become top-level concept candidates when they explain the declared purpose.",
    compatibility_status: "migrate",
    obligation_status: "legacy_isolated",
    rationale: "Concept-centered top_level_concepts are the legacy Seed concept authority.",
  },
  {
    source_field: "relations",
    target_authority_field: "top_level_relations",
    accepted_target_authority_fields: ["top_level_relations"],
    mapping_rule:
      "Legacy relation claims become top-level relation hypotheses between selected concepts.",
    compatibility_status: "migrate",
    obligation_status: "legacy_isolated",
    rationale: "Legacy relation hypotheses live in top_level_relations.",
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
    compatibility_status: "migrate",
    obligation_status: "legacy_isolated",
    rationale: "Legacy Seed-stage action readiness is owned by answerability_scope.",
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
    compatibility_status: "migrate",
    obligation_status: "legacy_isolated",
    rationale: "Legacy lower-level facts must not compete with concept authority.",
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
    compatibility_status: "migrate",
    obligation_status: "legacy_isolated",
    rationale: "Legacy rule details are not a separate ontology authority.",
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
    compatibility_status: "migrate",
    obligation_status: "legacy_isolated",
    rationale: "The legacy declared question inventory lives in answerability_scope.",
  },
  {
    source_field: "included_lower_concepts",
    target_authority_field: "lower_level_detail_placements",
    accepted_target_authority_fields: ["lower_level_detail_placements"],
    mapping_rule:
      "Retired included lower concepts become lower-level detail placements under an owning top-level concept.",
    compatibility_status: "retire",
    obligation_status: "legacy_isolated",
    rationale: "Retired lower-concept projections are supporting detail, not Seed concept authority.",
  },
  {
    source_field: "excluded_or_deferred_details",
    target_authority_field: "lower_level_detail_placements",
    accepted_target_authority_fields: ["lower_level_detail_placements"],
    mapping_rule:
      "Retired excluded or deferred details become lower-level detail placements with deferred placement where applicable.",
    compatibility_status: "retire",
    obligation_status: "legacy_isolated",
    rationale: "Deferred detail disposition is owned by lower_level_detail_placements.",
  },
  {
    source_field: "boundary_notes",
    target_authority_field: "top_level_concepts.boundary",
    accepted_target_authority_fields: ["top_level_concepts.boundary"],
    mapping_rule:
      "Retired boundary notes become per-concept included, excluded, and deferred boundary summaries.",
    compatibility_status: "retire",
    obligation_status: "legacy_isolated",
    rationale: "Legacy concept boundaries live on the top_level_concepts authority seat.",
  },
  {
    source_field: "core_relations",
    target_authority_field: "top_level_relations",
    accepted_target_authority_fields: ["top_level_relations"],
    mapping_rule:
      "Retired core relations become top-level relation hypotheses.",
    compatibility_status: "retire",
    obligation_status: "legacy_isolated",
    rationale: "Legacy relation authority is centralized in top_level_relations.",
  },
  {
    source_field: "deferred_detail_candidates",
    target_authority_field: "lower_level_detail_placements",
    accepted_target_authority_fields: ["lower_level_detail_placements"],
    mapping_rule:
      "Retired deferred detail candidates become deferred lower-level detail placements.",
    compatibility_status: "retire",
    obligation_status: "legacy_isolated",
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
    compatibility_status: "retire",
    obligation_status: "legacy_isolated",
    rationale: "Open or deferred convergence pressure is owned by frontier_pressure_log.",
  },
  {
    source_field: "frontier_refs",
    target_authority_field: "frontier_pressure_log",
    accepted_target_authority_fields: ["frontier_pressure_log"],
    mapping_rule:
      "Retired frontier refs become frontier pressure records that explain why another source would change the Seed.",
    compatibility_status: "retire",
    obligation_status: "legacy_isolated",
    rationale: "Frontier exploration pressure is owned by frontier_pressure_log.",
  },
] as const;

export type LegacyReconstructSeedMigrationSourceField =
  (typeof LEGACY_RECONSTRUCT_SEED_MIGRATION_TARGETS)[number]["source_field"];

export type LegacyReconstructSeedMigrationTargetAuthorityField =
  (typeof LEGACY_RECONSTRUCT_SEED_MIGRATION_TARGETS)[number]["accepted_target_authority_fields"][number];

export const LEGACY_RECONSTRUCT_TRANSITIONAL_LEGACY_SOURCE_FIELDS =
  LEGACY_RECONSTRUCT_SEED_MIGRATION_TARGETS
    .filter((record) => record.compatibility_status === "migrate")
    .map((record) => record.source_field);

export const LEGACY_RECONSTRUCT_RETIRED_SEED_SOURCE_FIELDS =
  LEGACY_RECONSTRUCT_SEED_MIGRATION_TARGETS
    .filter((record) => record.compatibility_status === "retire")
    .map((record) => record.source_field);

export interface LegacyReconstructSeedMigrationRecord {
  migration_id: string;
  source_field: string;
  target_authority_field: string;
  migration_artifact_ref: string | null;
}

export interface LegacyReconstructSeedCandidateArtifactBase {
  schema_version: "1";
  seed_schema_version?: LegacyReconstructSeedSchemaVersion;
  session_id: string;
  created_at: string;
  purpose: ReconstructSeedClaim;
}

export type LegacyReconstructSeedCandidateArtifact =
  LegacyReconstructSeedCandidateArtifactBase & {
    seed_schema_version?: "legacy";
    non_goals: ReconstructSeedClaim[];
    entities: ReconstructSeedClaim[];
    relations: ReconstructSeedClaim[];
    actions: ReconstructSeedClaim[];
    properties: ReconstructSeedClaim[];
    rules: ReconstructSeedClaim[];
    open_questions: string[];
  };

export type LegacyReconstructTransitionalSeedCandidateArtifact =
  LegacyReconstructSeedCandidateArtifactBase & {
    seed_schema_version: "transitional";
    answerability_scope: LegacyReconstructSeedAnswerabilityScope;
    top_level_concepts: LegacyReconstructTopLevelConcept[];
    top_level_relations: LegacyReconstructTopLevelRelation[];
    relation_participation_exceptions: LegacyReconstructRelationParticipationException[];
    lower_level_detail_placements: LegacyReconstructLowerLevelDetailPlacementRecord[];
    frontier_pressure_log: LegacyReconstructFrontierPressure[];
    material_coverage_checkpoint: LegacyReconstructMaterialCoverageCheckpoint;
    convergence: LegacyReconstructConceptConvergence;
    lifecycle: LegacyReconstructSeedLifecycle;
    migration_records: LegacyReconstructSeedMigrationRecord[];
    non_goals: ReconstructSeedClaim[];
    entities: ReconstructSeedClaim[];
    relations: ReconstructSeedClaim[];
    actions: ReconstructSeedClaim[];
    properties: ReconstructSeedClaim[];
    rules: ReconstructSeedClaim[];
    open_questions: string[];
  };

export type LegacyReconstructConceptCenteredSeedCandidateArtifact =
  LegacyReconstructSeedCandidateArtifactBase & {
    seed_schema_version: "concept_centered";
    answerability_scope: LegacyReconstructSeedAnswerabilityScope;
    top_level_concepts: LegacyReconstructTopLevelConcept[];
    top_level_relations: LegacyReconstructTopLevelRelation[];
    relation_participation_exceptions: LegacyReconstructRelationParticipationException[];
    lower_level_detail_placements: LegacyReconstructLowerLevelDetailPlacementRecord[];
    frontier_pressure_log: LegacyReconstructFrontierPressure[];
    material_coverage_checkpoint: LegacyReconstructMaterialCoverageCheckpoint;
    convergence: LegacyReconstructConceptConvergence;
    lifecycle: LegacyReconstructSeedLifecycle;
    migration_records?: LegacyReconstructSeedMigrationRecord[];
  };

export type ReconstructSeedCandidateArtifact =
  | LegacyReconstructSeedCandidateArtifact
  | LegacyReconstructTransitionalSeedCandidateArtifact
  | LegacyReconstructConceptCenteredSeedCandidateArtifact;

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
