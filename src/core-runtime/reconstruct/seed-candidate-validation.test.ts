import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructSeedCandidateArtifact,
  ReconstructSeedCandidateValidationArtifact,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import {
  RECONSTRUCT_SEED_MIGRATION_TARGETS,
} from "./artifact-types.js";
import {
  validateSeedCandidate,
  writeSeedCandidateValidationArtifact,
} from "./seed-candidate-validation.js";

const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-seed-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function sourceObservations(): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-a",
    created_at: "2026-05-27T00:00:00.000Z",
    observations: [
      {
        observation_id: "obs_spreadsheet_abc",
        target_material_kind: "spreadsheet",
        adapter_id: "minimal-spreadsheet-structure-observer",
        source_ref: "/tmp/schedule.csv",
        location: "/tmp/schedule.csv",
        summary: "spreadsheet material observed at schedule.csv",
        structural_data: {
          basename: "schedule.csv",
          extension: ".csv",
        },
      },
      {
        observation_id: "obs_document_def",
        target_material_kind: "document",
        adapter_id: "minimal-document-structure-observer",
        source_ref: "/tmp/policy.md",
        location: "/tmp/policy.md",
        summary: "document material observed at policy.md",
        structural_data: {
          basename: "policy.md",
          extension: ".md",
        },
      },
    ],
    skipped_refs: [],
    validation_results: ["source_observation_boundary_valid"],
  };
}

function evidenceRef(observationId = "obs_spreadsheet_abc") {
  return {
    observation_id: observationId,
    target_material_kind: observationId === "obs_document_def" ? "document" : "spreadsheet",
    source_ref: observationId === "obs_document_def" ? "/tmp/policy.md" : "/tmp/schedule.csv",
    location: observationId === "obs_document_def" ? "/tmp/policy.md" : "/tmp/schedule.csv",
  } as const;
}

function sourceObservationDirective(): ReconstructSourceObservationDirectiveArtifact {
  return {
    schema_version: "1",
    session_id: "session-a",
    created_at: "2026-05-27T00:00:00.000Z",
    selected_observations: [
      {
        observation_id: "obs_spreadsheet_abc",
        target_material_kind: "spreadsheet",
        source_ref: "/tmp/schedule.csv",
        location: "/tmp/schedule.csv",
        selection_rationale: "The observation is a structural spreadsheet ref.",
      },
    ],
    open_questions: [],
  };
}

function sourceObservationDirectiveValidation(
  validationStatus: "valid" | "invalid" = "valid",
): ReconstructSourceObservationDirectiveValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-a",
    created_at: "2026-05-27T00:00:00.000Z",
    directive_ref: "/tmp/source-observation-directive.yaml",
    source_observations_ref: "/tmp/source-observations.yaml",
    validation_status: validationStatus,
    selected_observation_count: 1,
    validation_results: validationStatus === "valid"
      ? ["source_observation_directive_valid"]
      : ["source_observation_directive_invalid"],
    violations: [],
  };
}

function validSeedCandidate(): ReconstructSeedCandidateArtifact {
  return {
    schema_version: "1",
    session_id: "session-a",
    created_at: "2026-05-27T00:00:00.000Z",
    purpose: {
      claim_id: "purpose-1",
      name: "Spreadsheet Purpose",
      statement: "Explain the declared spreadsheet purpose.",
      evidence_refs: [evidenceRef()],
    },
    non_goals: [],
    entities: [
      {
        claim_id: "entity-1",
        name: "Schedule Row",
        statement: "Schedule row is a candidate entity.",
        evidence_refs: [evidenceRef()],
      },
    ],
    relations: [],
    actions: [],
    properties: [],
    rules: [
      {
        claim_id: "rule-1",
        name: "Formula-Like Cell Rule",
        statement: "Formula-like cells are candidate rules.",
        evidence_refs: [evidenceRef()],
      },
    ],
    open_questions: [],
  };
}

function validTransitionalSeedCandidate(): ReconstructSeedCandidateArtifact {
  return {
    ...validSeedCandidate(),
    seed_schema_version: "transitional",
    answerability_scope: {
      declared_handoff_questions: [
        {
          question_id: "question-1",
          question: "What top-level concept explains this Seed?",
          source: "declared_purpose",
        },
      ],
      supported_questions: [
        {
          question_id: "question-1",
          answered_by: {
            concept_ids: ["concept-1"],
            relation_ids: [],
          },
          confidence: "medium",
        },
      ],
      deferred_questions: [],
      unsupported_questions: [],
      supported_actions: [
        {
          action_id: "action-1",
          action: "Explain the Seed purpose.",
          supported_by_question_ids: ["question-1"],
          readiness_statement: "Ready for bounded handoff.",
        },
      ],
      unsupported_actions: [],
      handoff_readiness_statement: "Ready for bounded Seed handoff.",
      handoff_readiness_question_ids: ["question-1"],
    },
    top_level_concepts: [
      {
        concept_id: "concept-1",
        name: "Schedule Management",
        aliases: [],
        definition: "A top-level purpose-relative concept for schedule evidence.",
        why_top_level: "It explains multiple observed schedule details.",
        evidence_refs: [evidenceRef()],
        boundary: {
          included_summary: "Schedule rows and related evidence.",
          excluded_summary: "Unobserved policy document claims.",
          deferred_summary: "Detailed ontology formalization.",
        },
        confidence: "medium",
        provisional: false,
      },
    ],
    top_level_relations: [],
    relation_participation_exceptions: [
      {
        concept_id: "concept-1",
        isolation_reason: "Single concept Seed has no relation pair yet.",
        isolation_pressure_ids: ["pressure-1"],
      },
    ],
    lower_level_detail_placements: [
      {
        detail_id: "detail-1",
        name: "Schedule CSV",
        material_kind: "spreadsheet",
        source_ref: "/tmp/schedule.csv",
        placement: "included_support",
        owner_concept_id: "concept-1",
        rationale: "The CSV supports the concept boundary.",
        evidence_refs: [evidenceRef()],
        follow_up_question: null,
      },
    ],
    frontier_pressure_log: [
      {
        pressure_id: "pressure-1",
        origin: "source_observation",
        origin_ref: "obs_spreadsheet_abc",
        pressure_type: "evidence_saturation",
        pressure_question: "Would more evidence change the top-level concept?",
        target_concept_ids: ["concept-1"],
        target_relation_ids: [],
        material_kind: "spreadsheet",
        source_ref: "/tmp/schedule.csv",
        expected_decision_impact: "More evidence may refine but not block this Seed.",
        priority: "low",
        status: "non_blocking",
        status_reason: "The pressure is disclosed and does not block handoff.",
        superseded_by_pressure_id: null,
        evidence_refs: [evidenceRef()],
      },
    ],
    material_coverage_checkpoint: {
      observed_material_kinds: ["spreadsheet"],
      observed_source_slices: ["/tmp/schedule.csv"],
      source_authority_scope: {
        permission_scope: "within_declared_boundary",
        permission_basis_refs: ["/tmp/schedule.csv"],
        trust_status: "observed_evidence_only",
        instruction_authority_status: "none_data_only",
        external_content_handling: "not_applicable",
        restricted_source_refs: [],
        rationale: "The fixture source is evidence only.",
      },
      intentionally_excluded_material_kinds: [],
      unexplored_source_categories: [],
      possible_missing_axis_pressure_ids: [],
      rationale_for_seed_level_sufficiency: "Sufficient for a fixture Seed.",
      partial_support_disclosures: [],
    },
    convergence: {
      state: "provisionally_converged",
      source_convergence_rationale: "No open pressure remains.",
      review_confirmed: false,
      review_profile_ref: null,
      remaining_pressure_ids: ["pressure-1"],
    },
    lifecycle: {
      seed_id: "seed-session-a",
      parent_seed_ref: null,
      id_stability_scope: "session",
      session_id: "session-a",
      source_snapshot_refs: ["/tmp/schedule.csv"],
      source_snapshot_transition: {
        prior_snapshot_refs: [],
        transition_reason: "Initial Seed.",
      },
      exploration_rounds: [
        {
          round_id: "round-1",
          observed_source_refs: ["/tmp/schedule.csv"],
          authoring_pass_ref: "seed-candidate.yaml",
          changed_concept_ids: ["concept-1"],
          changed_relation_ids: [],
          changed_frontier_pressure_ids: ["pressure-1"],
        },
      ],
      concept_identity_events: [
        {
          event_id: "concept-event-1",
          event_type: "created",
          prior_concept_ids: [],
          current_concept_ids: ["concept-1"],
          target_detail_ids: [],
          prior_names: [],
          new_names: ["Schedule Management"],
          prior_aliases: [],
          current_aliases: [],
          reason: "Initial concept.",
          evidence_refs: [evidenceRef()],
          frontier_pressure_ids: ["pressure-1"],
        },
      ],
      relation_identity_events: [],
      pressure_events: [
        {
          event_id: "pressure-event-1",
          event_type: "non_blocking",
          pressure_id: "pressure-1",
          prior_status: null,
          new_status: "non_blocking",
          superseded_by_pressure_id: null,
          reason: "Non-blocking pressure recorded.",
          evidence_refs: [evidenceRef()],
        },
      ],
      detail_placement_events: [
        {
          event_id: "detail-event-1",
          event_type: "placed",
          detail_ids: ["detail-1"],
          reason: "Detail placed under concept.",
          evidence_refs: [evidenceRef()],
          frontier_pressure_ids: ["pressure-1"],
        },
      ],
      answerability_events: [
        {
          event_id: "answerability-event-1",
          event_type: "question_supported",
          question_ids: ["question-1"],
          action_ids: ["action-1"],
          frontier_pressure_ids: [],
          reason: "Question supported.",
        },
      ],
      material_coverage_events: [
        {
          event_id: "material-event-1",
          event_type: "source_slice_added",
          source_refs: ["/tmp/schedule.csv"],
          material_kinds: ["spreadsheet"],
          changed_authority_fields: ["observed_source_slices"],
          prior_authority_state_ref: null,
          current_authority_state_ref: null,
          prior_authority_state: null,
          current_authority_state: {
            observed_source_slices: ["/tmp/schedule.csv"],
          },
          frontier_pressure_ids: ["pressure-1"],
          reason: "Observed source slice recorded.",
        },
      ],
      convergence_events: [
        {
          event_id: "convergence-event-1",
          prior_state: null,
          new_state: "provisionally_converged",
          frontier_pressure_ids: ["pressure-1"],
          reason: "No open pressure remains.",
        },
      ],
    },
    migration_records: RECONSTRUCT_SEED_MIGRATION_TARGETS
      .filter((record) => record.compatibility_status === "transitional_projection")
      .map((record) => ({
        migration_id: `migration-${record.source_field}`,
        source_field: record.source_field,
        target_authority_field: record.target_authority_field,
        migration_artifact_ref: null,
      })),
  };
}

describe("validateSeedCandidate", () => {
  it("accepts semantic claims when each claim cites selected runtime observations", () => {
    const validation = validateSeedCandidate({
      seedCandidate: validSeedCandidate(),
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.validation_results).toEqual(["seed_candidate_evidence_valid"]);
    expect(validation.semantic_claim_count).toBe(3);
    expect(validation.evidence_ref_count).toBe(3);
    expect(validation.violations).toEqual([]);
  });

  it("rejects semantic claims without validated observation evidence", () => {
    const seedCandidate = validSeedCandidate();
    seedCandidate.entities = [
      {
        claim_id: "duplicate-id",
        name: "Entity 1",
        statement: "",
        evidence_refs: [],
      },
      {
        claim_id: "duplicate-id",
        name: "Unknown Evidence Entity",
        statement: "Unknown evidence is rejected.",
        evidence_refs: [{
          ...evidenceRef(),
          observation_id: "obs_missing",
        }],
      },
    ];
    seedCandidate.relations = [
      {
        claim_id: "relation-1",
        name: "Unselected Evidence Relation",
        statement: "Unselected evidence is rejected.",
        evidence_refs: [evidenceRef("obs_document_def")],
      },
    ];
    seedCandidate.properties = [
      {
        claim_id: "property-1",
        name: "Mismatched Material Property",
        statement: "Mismatched material is rejected.",
        evidence_refs: [{
          ...evidenceRef(),
          target_material_kind: "document",
        }],
      },
    ];
    seedCandidate.rules = [
      {
        claim_id: "rule-1",
        name: "Mismatched Location Rule",
        statement: "Mismatched source and location are rejected.",
        evidence_refs: [{
          ...evidenceRef(),
          source_ref: "/tmp/other.csv",
          location: "/tmp/other.csv",
        }],
      },
    ];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation("invalid"),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "prior_observation_directive_invalid",
      "duplicate_claim_id",
      "claim_name_generic",
      "claim_statement_missing",
      "claim_evidence_missing",
      "unknown_observation_ref",
      "unselected_observation_ref",
      "material_kind_mismatch",
      "source_ref_mismatch",
      "location_mismatch",
    ]));
  });

  it("reports malformed SeedCandidateDirective shape instead of throwing", () => {
    const malformedSeedCandidate = {
      schema_version: "1",
      session_id: "session-a",
      created_at: "2026-05-27T00:00:00.000Z",
      purpose: {
        statement: "",
        evidence_refs: [
          {
            observation_id: "obs_spreadsheet_abc",
            target_material_kind: "not-a-kind",
            location: "/tmp/schedule.csv",
          },
        ],
      },
      entities: "not-an-array",
      relations: [],
      actions: [],
      properties: [],
      rules: [],
    } as unknown as ReconstructSeedCandidateArtifact;

    const validation = validateSeedCandidate({
      seedCandidate: malformedSeedCandidate,
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "schema_shape_invalid",
      "claim_id_missing",
      "claim_name_missing",
      "claim_statement_missing",
      "claim_evidence_missing",
      "evidence_ref_shape_invalid",
    ]));
  });

  it("accepts transitional concept-centered Seed authority fields", () => {
    const validation = validateSeedCandidate({
      seedCandidate: validTransitionalSeedCandidate(),
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
    expect(validation.semantic_claim_count).toBe(6);
    expect(validation.evidence_ref_count).toBe(6);
  });

  it("rejects projected claim id collisions across concept-centered and legacy seats", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.entities[0].claim_id = "concept-1";

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "duplicate_claim_id",
        claim_id: "concept-1",
      }),
    ]));
  });

  it("rejects competing relation axis, ambiguous pressure lifecycle, and broken answerability refs", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.top_level_relations = [
      {
        relation_id: "relation-1",
        source_concept_id: "concept-1",
        target_concept_id: "concept-missing",
        relation_kind: "depends_on",
        relation_axis: "dependency_flow",
        relation_label: "bad relation",
        direction_statement: "Bad relation.",
        statement: "Bad relation.",
        evidence_refs: [evidenceRef()],
        confidence: "low",
        provisional: true,
        registration_status: "design_local",
      },
    ];
    seedCandidate.answerability_scope.supported_actions[0].supported_by_question_ids = [
      "question-missing",
    ];
    seedCandidate.lifecycle.pressure_events[0].pressure_ids = ["pressure-1"];
    seedCandidate.lifecycle.pressure_events[0].current_pressure_id = "pressure-1";

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "relation_axis_stored",
      "unknown_concept_ref",
      "unknown_question_ref",
      "forbidden_lifecycle_field",
    ]));
  });

  it("rejects top-level concepts that are neither related nor isolated", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.top_level_concepts.push({
      concept_id: "concept-2",
      name: "Policy Interpretation",
      aliases: [],
      definition: "A separate top-level concept for policy evidence.",
      why_top_level: "It could explain document evidence independently.",
      evidence_refs: [evidenceRef()],
      boundary: {
        included_summary: "Policy interpretation evidence.",
        excluded_summary: "Schedule row implementation details.",
        deferred_summary: "Formal policy ontology.",
      },
      confidence: "low",
      provisional: true,
    });

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "relation_participation_missing",
    );
  });

  it("rejects isolated relation exceptions without pressure refs", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.relation_participation_exceptions[0].isolation_pressure_ids = [];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "relation_participation_missing",
    );
  });

  it("rejects isolated relation exceptions without explicit reasons", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    delete seedCandidate.relation_participation_exceptions[0].isolation_reason;

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "relation_participation_missing",
        claim_id: "concept-1",
      }),
    ]));
  });

  it("rejects dangling lifecycle and material-coverage refs", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.lifecycle.exploration_rounds[0].changed_concept_ids = ["concept-missing"];
    seedCandidate.lifecycle.exploration_rounds[0].changed_relation_ids = ["relation-missing"];
    seedCandidate.lifecycle.exploration_rounds[0].changed_frontier_pressure_ids = [
      "pressure-missing",
    ];
    seedCandidate.lifecycle.detail_placement_events[0].frontier_pressure_ids = [
      "pressure-missing",
    ];
    seedCandidate.lifecycle.answerability_events[0].frontier_pressure_ids = [
      "pressure-missing",
    ];
    seedCandidate.lifecycle.material_coverage_events[0].material_kinds = ["not-a-kind"];
    seedCandidate.lifecycle.material_coverage_events[0].frontier_pressure_ids = [
      "pressure-missing",
    ];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "unknown_concept_ref",
      "unknown_relation_ref",
      "unknown_pressure_ref",
      "invalid_enum",
    ]));
  });

  it("rejects lifecycle transitions that lack identity and source continuity", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.lifecycle.id_stability_scope = "lineage";
    seedCandidate.lifecycle.parent_seed_ref = null;
    seedCandidate.lifecycle.source_snapshot_refs = ["/tmp/missing-current.csv"];
    seedCandidate.lifecycle.source_snapshot_transition.prior_snapshot_refs = [];
    seedCandidate.lifecycle.exploration_rounds[0].observed_source_refs = [
      "/tmp/missing-round.csv",
    ];
    seedCandidate.lifecycle.concept_identity_events[0].event_type = "split";
    seedCandidate.lifecycle.concept_identity_events[0].prior_concept_ids = [];
    seedCandidate.lifecycle.concept_identity_events[0].current_concept_ids = ["concept-1"];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "lifecycle_transition_invalid",
      "unknown_source_ref",
    ]));
  });

  it("accepts lineage prior snapshot refs as parent-scope transition shape", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.lifecycle.id_stability_scope = "lineage";
    seedCandidate.lifecycle.parent_seed_ref = "seed-parent.yaml";
    seedCandidate.lifecycle.source_snapshot_transition.prior_snapshot_refs = [
      "parent-session/source-observations.yaml",
    ];
    seedCandidate.lifecycle.source_snapshot_transition.transition_reason =
      "Continuing from a parent Seed snapshot.";

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });

  it("rejects demoted concept lifecycle events without a detail-placement bridge", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.lifecycle.concept_identity_events[0].event_type = "demoted";
    seedCandidate.lifecycle.concept_identity_events[0].prior_concept_ids = ["concept-old"];
    seedCandidate.lifecycle.concept_identity_events[0].current_concept_ids = [];
    seedCandidate.lifecycle.concept_identity_events[0].target_detail_ids = [];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "lifecycle_transition_invalid",
    );
  });

  it("rejects pressure supersession cycles and unsupported action support edges", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.frontier_pressure_log[0].status = "superseded";
    seedCandidate.frontier_pressure_log[0].superseded_by_pressure_id = "pressure-1";
    seedCandidate.answerability_scope.supported_actions[0].supported_by_question_ids = [];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "answerability_inventory_mismatch",
      "pressure_transition_invalid",
    ]));
  });

  it("rejects blank superseded pressure successors and inconsistent pressure event states", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.frontier_pressure_log[0].status = "superseded";
    seedCandidate.frontier_pressure_log[0].superseded_by_pressure_id = " ";
    seedCandidate.lifecycle.pressure_events[0].event_type = "resolved";
    seedCandidate.lifecycle.pressure_events[0].new_status = "open";

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "pressure_transition_invalid",
    );
  });

  it("accepts ordered pressure event histories when the final event matches the pressure log", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.frontier_pressure_log[0].status = "resolved";
    seedCandidate.frontier_pressure_log[0].status_reason = "Resolved by observed source.";
    seedCandidate.lifecycle.pressure_events = [
      {
        event_id: "pressure-event-created",
        event_type: "created",
        pressure_id: "pressure-1",
        prior_status: null,
        new_status: "open",
        superseded_by_pressure_id: null,
        reason: "Pressure opened during initial authoring.",
        evidence_refs: [evidenceRef()],
      },
      {
        event_id: "pressure-event-resolved",
        event_type: "resolved",
        pressure_id: "pressure-1",
        prior_status: "open",
        new_status: "resolved",
        superseded_by_pressure_id: null,
        reason: "Pressure resolved by observed evidence.",
        evidence_refs: [evidenceRef()],
      },
    ];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });

  it("rejects pressure event histories with stale prior state or successor disagreement", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.frontier_pressure_log.push({
      ...seedCandidate.frontier_pressure_log[0],
      pressure_id: "pressure-2",
      status: "open",
      superseded_by_pressure_id: null,
    });
    seedCandidate.frontier_pressure_log[0].status = "superseded";
    seedCandidate.frontier_pressure_log[0].superseded_by_pressure_id = "pressure-2";
    seedCandidate.lifecycle.pressure_events = [
      {
        event_id: "pressure-event-created",
        event_type: "created",
        pressure_id: "pressure-1",
        prior_status: null,
        new_status: "open",
        superseded_by_pressure_id: null,
        reason: "Pressure opened during initial authoring.",
        evidence_refs: [evidenceRef()],
      },
      {
        event_id: "pressure-event-superseded",
        event_type: "superseded",
        pressure_id: "pressure-1",
        prior_status: "resolved",
        new_status: "superseded",
        superseded_by_pressure_id: "pressure-missing",
        reason: "Pressure was replaced.",
        evidence_refs: [evidenceRef()],
      },
      {
        event_id: "pressure-event-created-2",
        event_type: "created",
        pressure_id: "pressure-2",
        prior_status: null,
        new_status: "open",
        superseded_by_pressure_id: null,
        reason: "Replacement pressure opened.",
        evidence_refs: [evidenceRef()],
      },
    ];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "pressure_transition_invalid",
    );
  });

  it("rejects non-superseded pressure records with successor refs", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.frontier_pressure_log[0].superseded_by_pressure_id = "pressure-2";

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "pressure_transition_invalid",
    );
  });

  it("accepts unresolved pressure disclosure without resolving evidence refs", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.frontier_pressure_log[0].status = "open";
    seedCandidate.frontier_pressure_log[0].status_reason =
      "Still needs another source slice.";
    seedCandidate.frontier_pressure_log[0].evidence_refs = [];
    seedCandidate.convergence.state = "not_converged";
    seedCandidate.convergence.remaining_pressure_ids = ["pressure-1"];
    seedCandidate.lifecycle.pressure_events[0].event_type = "created";
    seedCandidate.lifecycle.pressure_events[0].new_status = "open";
    seedCandidate.lifecycle.pressure_events[0].evidence_refs = [];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });

  it("rejects concept-centered authority fields without seed_schema_version", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    delete seedCandidate.seed_schema_version;

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "invalid_seed_schema_version",
    );
  });

  it("accepts concept_centered Seeds without transitional migration records", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.seed_schema_version = "concept_centered";
    delete seedCandidate.migration_records;
    delete seedCandidate.non_goals;
    delete seedCandidate.entities;
    delete seedCandidate.relations;
    delete seedCandidate.actions;
    delete seedCandidate.properties;
    delete seedCandidate.rules;
    delete seedCandidate.open_questions;

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });

  it("rejects concept_centered Seeds that retain legacy projections without migration records", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.seed_schema_version = "concept_centered";
    delete seedCandidate.migration_records;

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "migration_record_missing",
    );
  });

  it("rejects concept_centered Seeds that retain nested retired projections without migration records", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.seed_schema_version = "concept_centered";
    delete seedCandidate.migration_records;
    delete seedCandidate.non_goals;
    delete seedCandidate.entities;
    delete seedCandidate.relations;
    delete seedCandidate.actions;
    delete seedCandidate.properties;
    delete seedCandidate.rules;
    delete seedCandidate.open_questions;
    Object.assign(seedCandidate.top_level_concepts[0], {
      included_lower_concepts: [],
      excluded_or_deferred_details: [],
      boundary_notes: [],
      core_relations: [],
      deferred_detail_candidates: [],
      frontier_refs: [],
      open_questions: [],
    });
    seedCandidate.convergence.remaining_pressures = [];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "migration_record_missing",
        claim_id: "included_lower_concepts",
      }),
      expect.objectContaining({
        code: "migration_record_missing",
        claim_id: "excluded_or_deferred_details",
      }),
      expect.objectContaining({
        code: "migration_record_missing",
        claim_id: "boundary_notes",
      }),
      expect.objectContaining({
        code: "migration_record_missing",
        claim_id: "core_relations",
      }),
      expect.objectContaining({
        code: "migration_record_missing",
        claim_id: "deferred_detail_candidates",
      }),
      expect.objectContaining({
        code: "migration_record_missing",
        claim_id: "frontier_refs",
      }),
      expect.objectContaining({
        code: "migration_record_missing",
        claim_id: "open_questions",
      }),
      expect.objectContaining({
        code: "migration_record_missing",
        claim_id: "convergence.remaining_pressures",
      }),
    ]));
  });

  it("rejects lifecycle without a source snapshot transition", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    delete seedCandidate.lifecycle.source_snapshot_transition;

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "lifecycle_transition_invalid",
    );
  });

  it("rejects migration records without concrete concept-centered authority", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.migration_records[0] = {
      migration_id: "migration-invalid",
      source_field: "claims",
      target_authority_field: "concept_centered_seed_authority",
      migration_artifact_ref: "",
    };

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "migration_record_invalid",
      "schema_shape_invalid",
    ]));
  });

  it("accepts exact alternate migration targets declared by the mapping authority", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    const actionMigration = seedCandidate.migration_records.find(
      (record: any) => record.source_field === "actions",
    );
    const propertyMigration = seedCandidate.migration_records.find(
      (record: any) => record.source_field === "properties",
    );
    actionMigration.target_authority_field = "answerability_scope.unsupported_actions";
    propertyMigration.target_authority_field = "top_level_concepts.boundary";

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });

  it("rejects dangling material source-authority refs", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.material_coverage_checkpoint.observed_source_slices = [
      "/tmp/missing-observed.csv",
    ];
    seedCandidate.material_coverage_checkpoint.source_authority_scope.permission_basis_refs = [
      "/tmp/missing-authority.csv",
    ];
    seedCandidate.lifecycle.material_coverage_events[0].source_refs = [
      "/tmp/missing-event.csv",
    ];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "unknown_source_ref",
    );
  });

  it("rejects lower-level detail placements with dangling source provenance", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.lower_level_detail_placements[0].source_ref = "/tmp/missing-detail.csv";

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "unknown_source_ref",
      "source_ref_mismatch",
    ]));
  });

  it("rejects duplicate concept-centered authority identifiers", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.top_level_concepts.push({ ...seedCandidate.top_level_concepts[0] });
    seedCandidate.frontier_pressure_log.push({ ...seedCandidate.frontier_pressure_log[0] });
    seedCandidate.lower_level_detail_placements.push({
      ...seedCandidate.lower_level_detail_placements[0],
    });
    seedCandidate.answerability_scope.declared_handoff_questions.push({
      ...seedCandidate.answerability_scope.declared_handoff_questions[0],
    });
    seedCandidate.answerability_scope.supported_actions.push({
      ...seedCandidate.answerability_scope.supported_actions[0],
    });
    seedCandidate.migration_records.push({ ...seedCandidate.migration_records[0] });

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "duplicate_concept_id",
      "duplicate_pressure_id",
      "duplicate_detail_id",
      "duplicate_question_id",
      "duplicate_action_id",
      "duplicate_migration_id",
    ]));
  });

  it("rejects convergence and material coverage lifecycle inconsistencies", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.frontier_pressure_log[0].status = "open";
    seedCandidate.lifecycle.pressure_events[0].event_type = "created";
    seedCandidate.lifecycle.pressure_events[0].new_status = "open";
    seedCandidate.convergence.state = "converged_for_seed";
    seedCandidate.lifecycle.material_coverage_events[0].event_type =
      "source_authority_scope_changed";
    seedCandidate.lifecycle.material_coverage_events[0].changed_authority_fields = [];
    seedCandidate.lifecycle.material_coverage_events[0].prior_authority_state = null;
    seedCandidate.lifecycle.material_coverage_events[0].current_authority_state = null;

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "convergence_open_pressure",
      "schema_shape_invalid",
    ]));
  });

  it("rejects material coverage events that copy unrelated material kinds", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.lifecycle.material_coverage_events[0].material_kinds = [
      "code",
      "spreadsheet",
      "document",
      "database",
      "mixed",
      "unknown",
    ];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "material_kind_mismatch",
    );
  });

  it("rejects material coverage events that use checkpoint material truth without event source refs", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.lifecycle.material_coverage_events[0].source_refs = [];
    seedCandidate.lifecycle.material_coverage_events[0].material_kinds = ["spreadsheet"];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "unknown_source_ref",
      "material_kind_mismatch",
    ]));
  });

  it("accepts excluded material coverage events through the exclusion authority", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.material_coverage_checkpoint.intentionally_excluded_material_kinds = [
      "document",
    ];
    seedCandidate.lifecycle.material_coverage_events[0] = {
      event_id: "material-event-excluded-1",
      event_type: "material_kind_excluded",
      source_refs: [],
      material_kinds: ["document"],
      changed_authority_fields: ["intentionally_excluded_material_kinds"],
      prior_authority_state_ref: null,
      current_authority_state_ref: null,
      prior_authority_state: null,
      current_authority_state: {
        intentionally_excluded_material_kinds: ["document"],
      },
      frontier_pressure_ids: ["pressure-1"],
      reason: "Document material was intentionally excluded from this Seed.",
    };

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("valid");
  });

  it("rejects excluded material coverage events proven only by source refs", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.lifecycle.material_coverage_events[0] = {
      event_id: "material-event-excluded-1",
      event_type: "material_kind_excluded",
      source_refs: ["/tmp/policy.md"],
      material_kinds: ["document"],
      changed_authority_fields: ["intentionally_excluded_material_kinds"],
      prior_authority_state_ref: null,
      current_authority_state_ref: null,
      prior_authority_state: null,
      current_authority_state: {
        intentionally_excluded_material_kinds: [],
      },
      frontier_pressure_ids: ["pressure-1"],
      reason: "Document material was discussed but not intentionally excluded in the checkpoint.",
    };

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "material_kind_mismatch",
    );
  });

  it("rejects blank answerability text", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.answerability_scope.declared_handoff_questions = [
      {
        question_id: "question-1",
        question: " ",
        source: "declared_purpose",
      },
      {
        question_id: "question-2",
        question: "What remains unknown?",
        source: "user_request",
      },
      {
        question_id: "question-3",
        question: "What is unsupported?",
        source: "domain_profile",
      },
    ];
    seedCandidate.answerability_scope.supported_questions[0].confidence = "";
    seedCandidate.answerability_scope.deferred_questions = [
      {
        question_id: "question-2",
        reason_deferred: "",
        frontier_pressure_ids: ["pressure-1"],
      },
    ];
    seedCandidate.answerability_scope.unsupported_questions = [
      {
        question_id: "question-3",
        reason_unsupported: " ",
      },
    ];
    seedCandidate.answerability_scope.supported_actions[0].action = "";
    seedCandidate.answerability_scope.supported_actions[0].readiness_statement = "";
    seedCandidate.answerability_scope.unsupported_actions = [
      {
        action_id: "action-2",
        action: " ",
        reason_unsupported: "",
      },
    ];
    seedCandidate.answerability_scope.handoff_readiness_statement = "";

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "answerability_text_missing",
    );
  });

  it("reports missing review profile ref with a specific violation code", () => {
    const seedCandidate = validTransitionalSeedCandidate() as any;
    seedCandidate.convergence.review_confirmed = true;
    seedCandidate.convergence.review_profile_ref = null;

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toContain(
      "review_profile_ref_missing",
    );
  });

  it("writes a validation artifact from SeedCandidateDirective and evidence files", async () => {
    const root = await makeTmpProject();
    const seedCandidatePath = path.join(root, "seed-candidate.yaml");
    const sourceObservationsPath = path.join(root, "source-observations.yaml");
    const sourceObservationDirectivePath =
      path.join(root, "source-observation-directive.yaml");
    const sourceObservationDirectiveValidationPath =
      path.join(root, "source-observation-directive-validation.yaml");
    const outputPath = path.join(root, "seed-candidate-validation.yaml");
    await fs.writeFile(seedCandidatePath, stringifyYaml(validSeedCandidate()), "utf8");
    await fs.writeFile(sourceObservationsPath, stringifyYaml(sourceObservations()), "utf8");
    await fs.writeFile(
      sourceObservationDirectivePath,
      stringifyYaml(sourceObservationDirective()),
      "utf8",
    );
    await fs.writeFile(
      sourceObservationDirectiveValidationPath,
      stringifyYaml(sourceObservationDirectiveValidation()),
      "utf8",
    );

    const validation = await writeSeedCandidateValidationArtifact({
      seedCandidatePath,
      sourceObservationsPath,
      sourceObservationDirectivePath,
      sourceObservationDirectiveValidationPath,
      outputPath,
    });

    const written =
      parseYaml(await fs.readFile(outputPath, "utf8")) as ReconstructSeedCandidateValidationArtifact;
    expect(validation.validation_status).toBe("valid");
    expect(written.seed_candidate_ref).toBe(path.resolve(seedCandidatePath));
    expect(written.source_observations_ref).toBe(path.resolve(sourceObservationsPath));
    expect(written.source_observation_directive_ref)
      .toBe(path.resolve(sourceObservationDirectivePath));
    expect(written.source_observation_directive_validation_ref)
      .toBe(path.resolve(sourceObservationDirectiveValidationPath));
  });
});
