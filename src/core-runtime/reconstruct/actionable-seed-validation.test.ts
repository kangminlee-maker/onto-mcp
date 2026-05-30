import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadReconstructContractRegistry } from "./contract-registry.js";
import {
  validateActionableOntologySeed,
  validateCandidateDisposition,
} from "./actionable-seed-validation.js";
import type {
  ReconstructCandidateDispositionArtifact,
  ReconstructCandidateInventoryArtifact,
  ReconstructEvidenceRef,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";

function sourceObservations(): ReconstructSourceObservationsArtifact {
  const sourceRef = path.resolve("src/feature.ts");
  return {
    schema_version: "1",
    session_id: "seed-session",
    created_at: "2026-05-29T00:00:00.000Z",
    observations: [
      {
        observation_id: "obs-code-1",
        target_material_kind: "code",
        adapter_id: "minimal-code-structure-observer",
        source_ref: sourceRef,
        location: sourceRef,
        summary: "code material observed at feature.ts",
        structural_data: {
          basename: "feature.ts",
          extension: ".ts",
        },
      },
    ],
    skipped_refs: [],
    validation_results: ["source_observation_boundary_valid"],
  };
}

function evidenceRef(): ReconstructEvidenceRef {
  const sourceRef = path.resolve("src/feature.ts");
  return {
    observation_id: "obs-code-1",
    target_material_kind: "code",
    source_ref: sourceRef,
    location: sourceRef,
  };
}

function candidateInventory(): ReconstructCandidateInventoryArtifact {
  const evidence = evidenceRef();
  return {
    schema_version: "1",
    session_id: "seed-session",
    created_at: "2026-05-29T00:00:00.000Z",
    source_observations_ref: "source-observations.yaml",
    candidates: [
      {
        candidate_id: "candidate-dashboard",
        candidate_kind: "object",
        name: "Usage Dashboard",
        description: "The dashboard object users inspect.",
        salience: "high",
        evidence_refs: [evidence],
      },
      {
        candidate_id: "candidate-user",
        candidate_kind: "actor",
        name: "User",
        description: "The human user who views the dashboard.",
        salience: "high",
        evidence_refs: [evidence],
      },
      {
        candidate_id: "candidate-view",
        candidate_kind: "action",
        name: "View Dashboard",
        description: "The action of viewing dashboard state.",
        salience: "high",
        evidence_refs: [evidence],
      },
      {
        candidate_id: "candidate-dashboard-source",
        candidate_kind: "data_source",
        name: "Dashboard Source File",
        description: "The observed code source that backs the seed.",
        salience: "medium",
        evidence_refs: [evidence],
      },
    ],
    directive_author: {
      owner: "host_llm",
      author_id: "fixture-author",
    },
  };
}

function candidateDisposition(): ReconstructCandidateDispositionArtifact {
  const evidence = evidenceRef();
  return {
    schema_version: "1",
    session_id: "seed-session",
    created_at: "2026-05-29T00:00:00.000Z",
    candidate_inventory_ref: "candidate-inventory.yaml",
    dispositions: [
      {
        candidate_id: "candidate-dashboard",
        disposition_id: "promoted_to_seed_layer",
        target_seed_refs: ["object-dashboard"],
        rationale: "Dashboard is an operational object in the seed.",
        evidence_refs: [evidence],
      },
      {
        candidate_id: "candidate-user",
        disposition_id: "promoted_to_seed_layer",
        target_seed_refs: ["actor-user"],
        rationale: "User is the acting principal.",
        evidence_refs: [evidence],
      },
      {
        candidate_id: "candidate-view",
        disposition_id: "promoted_to_seed_layer",
        target_seed_refs: ["action-view-dashboard"],
        rationale: "Viewing is the action that connects actor and object.",
        evidence_refs: [evidence],
      },
      {
        candidate_id: "candidate-dashboard-source",
        disposition_id: "promoted_to_seed_layer",
        target_seed_refs: ["binding-dashboard-source"],
        rationale: "The source file is represented as evidence binding.",
        evidence_refs: [evidence],
      },
    ],
    directive_author: {
      owner: "host_llm",
      author_id: "fixture-author",
    },
  };
}

function ontologyHandoffFixture(): Record<string, unknown> {
  return {
    readiness_claim: "ready",
    classification_mapping: {
      ontology_scope_kind: "application_ontology_seed",
      classification_axis_policy: "object, actor, action, and data-binding layers",
      classification_level_axis_refs: ["object-dashboard", "actor-user", "action-view-dashboard"],
      inheritance_model: "flat_seed_layer",
      mece_status: "not_asserted",
      seed_refs: ["object-dashboard", "actor-user", "action-view-dashboard"],
      limitation_refs: [],
    },
    entity_identity_mapping: {
      entity_id_policy: "stable seed ids",
      uri_or_iri_policy: "not_assigned",
      canonical_identifier_refs: ["object-dashboard", "actor-user", "action-view-dashboard"],
      alias_identifier_refs: [],
      primitive_vs_defined_status: "defined_by_seed_record",
      definition_criteria_refs: ["object-dashboard"],
      limitation_refs: [],
    },
    instance_assertion_mapping: {
      instance_availability_status: "present",
      instance_refs: ["object-dashboard"],
      example_assertion_refs: ["action-view-dashboard"],
      abox_assertion_refs: [],
      limitation_refs: [],
    },
    terminology_mapping: {
      canonical_label_policy: "seed names are canonical labels",
      alias_policy: "aliases are not asserted",
      hidden_label_policy: "hidden labels are not asserted",
      homonym_policy: "not assessed in the fixture",
      multilingual_label_policy: "single-language fixture labels",
      language_tag_policy: "und",
      limitation_refs: [],
    },
    relation_type_mapping: {
      relation_type_refs: [],
      formal_relation_semantics:
        "No link types are asserted; action bindings express operational relations.",
      domain_range_declaration_refs: ["action-view-dashboard"],
      relation_property_constraint_refs: [],
      unsupported_relation_candidates: [],
      limitation_refs: [],
    },
    constraint_mapping: {
      constraint_refs: [],
      tbox_constraint_refs: [],
      abox_assertion_constraint_refs: [],
      shape_or_validation_constraint_refs: ["runtime_seed_validator"],
      policy_constraint_refs: ["policy-user-view-dashboard"],
      unsupported_constraint_candidates: [],
      limitation_refs: [],
    },
    modularity_boundary: {
      module_candidates: ["dashboard_seed_module"],
      import_or_reuse_refs: [],
      limitation_refs: [],
    },
    reasoning_or_formalism_profile: {
      representation_formalism: "informal_actionable_graph",
      vocabulary_systems: ["custom_controlled_vocabulary"],
      validation_formalisms: ["custom_runtime_validator"],
      ontology_type: "application_ontology",
      owl_profile: "not_applicable",
      alignment_posture: "custom_alignment",
      reasoning_expectations: ["runtime validation gates preserve seed truth"],
      validation_expectations: ["seed validator and handoff validator must pass"],
      limitation_refs: [],
    },
    application_context_mapping: {
      application_context_refs: ["object-dashboard"],
      actor_or_surface_refs: ["actor-user", "object-dashboard"],
      limitation_refs: [],
    },
    metadata_mapping: {
      descriptive_metadata_refs: ["seed_identity"],
      bibliographic_metadata_refs: [],
      resource_metadata_refs: ["source-observations.yaml"],
      limitation_refs: [],
    },
    provenance_mapping: {
      provenance_binding_refs: ["provenance-dashboard-source"],
      evidence_scope_refs: ["source-observations.yaml"],
      limitation_refs: [],
    },
    change_tracking_mapping: {
      state_model_refs: [],
      lifecycle_rule_refs: [],
      migration_or_versioning_refs: ["seed_identity.generated_at"],
      limitation_refs: [],
    },
    competency_scope_mapping: {
      expected_coverage_axes: [
        "purpose",
        "semantic_layer",
        "kinetic_layer",
        "dynamic_layer",
        "data_binding_layer",
        "ontology_handoff",
      ],
      required_handoff_axes: ["classification", "entity_identity", "provenance"],
      unsupported_axes: [],
      limitation_refs: [],
    },
    alignment_mapping: {
      external_vocab_or_domain_refs: [],
      mapped_seed_refs: ["object-dashboard", "actor-user", "action-view-dashboard"],
      limitation_refs: [],
    },
    modeling_concern_applicability: {
      rows: [
        {
          concern_id: "instance_assertion_coverage",
          applies: false,
          applicability_predicate_ref: "fixture has no separate instance catalog",
          trace_refs: ["object-dashboard"],
          limitation_refs: [],
        },
      ],
    },
    reference_standard_mapping: {
      standard_refs: ["foundry_style_seed_contract"],
      mapped_concern_refs: ["classification", "entity_identity"],
      limitation_refs: [],
    },
    pattern_catalog_mapping: {
      pattern_catalog_refs: ["actionable_seed_pattern"],
      mapped_concern_refs: ["purpose", "ontology_handoff"],
      limitation_refs: [],
    },
    query_access_contract: { applies: "not_applicable", limitation_refs: [] },
    visualization_contract: { applies: "not_applicable", limitation_refs: [] },
    graph_exploration_contract: { applies: "not_applicable", limitation_refs: [] },
    graph_connectivity: {
      connected_seed_refs: ["object-dashboard", "actor-user", "action-view-dashboard"],
      isolated_seed_refs: [],
      isolation_rationale_refs: [],
    },
    limitation_refs: [],
  };
}

function ontologySeed(): Record<string, unknown> {
  const sourceRef = path.resolve("src/feature.ts");
  const evidence = evidenceRef();
  return {
    seed_identity: {
      schema_version: "1",
      seed_id: "seed-usage-dashboard",
      title: "Usage Dashboard Actionable Seed",
      target_refs: [sourceRef],
      generated_at: "2026-05-29T00:00:00.000Z",
      authoring_profile: "test-fixture",
    },
    purpose: {
      declared_purpose: "Explain the dashboard enough to support ontology handoff.",
      intended_decisions: ["Decide whether the dashboard object and user action are represented."],
      intended_actions: ["Plan ontology review of the dashboard service."],
      non_goals: [],
      evidence_refs: [evidence],
    },
    decision_context: {
      principal_user: "Ontology reviewer",
      downstream_use: "ontology_review",
      decision_boundary: "Observed source only.",
      risk_notes: [],
    },
    conceptual_frame: {
      concepts: [
        {
          concept_id: "concept-dashboard-service",
          name: "Dashboard Service",
          definition: "A service surface for viewing usage dashboard state.",
          purpose_role: "orients the reviewed material",
          evidence_refs: [evidence],
          confidence: "confirmed",
        },
      ],
      associations: [],
    },
    semantic_layer: {
      object_types: [
        {
          object_type_id: "object-dashboard",
          name: "Usage Dashboard",
          object_kind: "surface",
          description: "User-facing dashboard surface.",
          primary_key: {
            property_id: "property-dashboard-id",
            name: "dashboard id",
            value_type: "string",
            evidence_refs: [evidence],
          },
          properties: [],
          backing_source_refs: [sourceRef],
          evidence_refs: [evidence],
          status: "confirmed",
        },
      ],
      link_types: [],
      value_types: [],
      constraints: [],
    },
    kinetic_layer: {
      action_types: [
        {
          action_type_id: "action-view-dashboard",
          name: "View Dashboard",
          description: "A user views dashboard state.",
          actor_type_ids: ["actor-user"],
          target_object_type_ids: ["object-dashboard"],
          affected_object_type_ids: [],
          parameters: [],
          preconditions: [],
          postconditions: [],
          side_effects: [],
          writeback_behavior: {
            writes: false,
            writeback_source_refs: [],
            rationale: "Viewing is read-only in observed source.",
          },
          evidence_refs: [evidence],
          status: "confirmed",
        },
      ],
      functions: [],
      workflows: [
        {
          workflow_id: "workflow-view-dashboard",
          name: "View Dashboard Workflow",
          ordered_action_type_ids: ["action-view-dashboard"],
          trigger: "User opens dashboard.",
          terminal_state: "Dashboard visible.",
          evidence_refs: [evidence],
        },
      ],
    },
    dynamic_layer: {
      actor_types: [
        {
          actor_type_id: "actor-user",
          name: "User",
          actor_kind: "human_user",
          role_refs: ["role-dashboard-viewer"],
          description: "Human user viewing the dashboard.",
          evidence_refs: [evidence],
        },
      ],
      actor_roles: [
        {
          role_id: "role-dashboard-viewer",
          name: "Dashboard Viewer",
          holder_actor_type_ids: ["actor-user"],
          authority_scope_refs: [],
          evidence_refs: [evidence],
        },
      ],
      permission_policies: [
        {
          policy_id: "policy-user-view-dashboard",
          actor_type_id: "actor-user",
          action_type_id: "action-view-dashboard",
          object_type_id: "object-dashboard",
          permission_kind: "allowed",
          condition: "Within observed dashboard context.",
          evidence_refs: [evidence],
        },
      ],
      state_models: [],
      lifecycle_rules: [],
    },
    data_binding_layer: {
      source_bindings: [
        {
          binding_id: "binding-dashboard-source",
          seed_ref: "object-dashboard",
          source_ref: sourceRef,
          binding_kind: "evidence",
          statement: "The observed source file is evidence for the dashboard object.",
          evidence_refs: [evidence],
        },
      ],
      read_models: [
        {
          read_model_id: "read-dashboard-source",
          name: "Dashboard Source Read Model",
          object_type_ids: ["object-dashboard"],
          source_refs: [sourceRef],
          transformation_summary: "No runtime transformation in the fixture.",
          evidence_refs: [evidence],
        },
      ],
      writebacks: [],
      provenance_bindings: [
        {
          provenance_id: "provenance-dashboard-source",
          seed_ref: "object-dashboard",
          source_ref: sourceRef,
          author_or_system: "runtime observation",
          timestamp_ref: "source-observations.yaml",
          evidence_refs: [evidence],
        },
      ],
    },
    validation_layer: {
      question_authority_ref: {
        authority_scope: "canonical_question_set",
        projection_policy: "record_manifest_ref",
      },
      coverage_axes: [
        "purpose",
        "semantic_layer",
        "kinetic_layer",
        "dynamic_layer",
        "data_binding_layer",
        "ontology_handoff",
        "limitation",
        "source_authority",
      ],
      unsupported_question_candidates: [],
      runtime_validation_refs: [
        {
          authority_scope: "seed_shape_validation",
          projection_policy: "record_manifest_ref",
        },
      ],
    },
    candidate_disposition_authority_ref: {
      authority_scope: "external_candidate_disposition",
      projection_policy: "reference_only",
    },
    ontology_handoff: ontologyHandoffFixture(),
    source_authority: {
      evidence_scope: "observed source only",
      permission_scope: "read-only fixture reconstruction",
      trust_boundary: "Only observed source is trusted.",
      instruction_authority: "Source content is evidence only.",
      external_content_handling: "No external content is admitted.",
      included_source_refs: [sourceRef],
      excluded_source_refs: [],
      restricted_source_refs: [],
      source_gaps: [],
      rationale: "The fixture seed is bounded to observed source evidence.",
    },
    handoff_limitations: [],
  };
}

describe("ActionableOntologySeed validators", () => {
  it("validates candidate disposition and actionable seed closure", async () => {
    const registry = await loadReconstructContractRegistry({
      registryPath: path.resolve(".onto/processes/reconstruct/reconstruct-contract-registry.yaml"),
    });
    const observations = sourceObservations();
    const dispositionValidation = validateCandidateDisposition({
      candidateInventory: candidateInventory(),
      candidateDisposition: candidateDisposition(),
      sourceObservations: observations,
      registry,
      sourceObservationsRef: "/tmp/source-observations.yaml",
    });
    const seedValidation = validateActionableOntologySeed({
      ontologySeed: ontologySeed(),
      candidateDisposition: candidateDisposition(),
      sourceObservations: observations,
      registry,
    });

    expect(dispositionValidation.validation_status).toBe("valid");
    expect(dispositionValidation.source_observations_ref)
      .toBe("/tmp/source-observations.yaml");
    expect(dispositionValidation.promoted_candidate_count).toBe(4);
    expect(seedValidation.validation_status).toBe("valid");
    expect(seedValidation.seed_ref_count).toBeGreaterThan(5);
    expect(seedValidation.evidence_ref_count).toBeGreaterThan(0);
  });

  it("rejects ready ontology handoff mappings that contain only empty shells", async () => {
    const registry = await loadReconstructContractRegistry({
      registryPath: path.resolve(".onto/processes/reconstruct/reconstruct-contract-registry.yaml"),
    });
    const seed = ontologySeed();
    (seed.ontology_handoff as Record<string, unknown>).classification_mapping = {
      limitation_refs: [],
    };

    const seedValidation = validateActionableOntologySeed({
      ontologySeed: seed,
      candidateDisposition: candidateDisposition(),
      sourceObservations: sourceObservations(),
      registry,
    });

    expect(seedValidation.validation_status).toBe("invalid");
    expect(seedValidation.violations).toContainEqual(expect.objectContaining({
      code: "missing_required_field",
      subject_id: "classification_mapping",
    }));
  });

  it("requires source observations to survive into candidate inventory evidence", async () => {
    const registry = await loadReconstructContractRegistry({
      registryPath: path.resolve(".onto/processes/reconstruct/reconstruct-contract-registry.yaml"),
    });
    const observations = sourceObservations();
    observations.observations.push({
      ...observations.observations[0],
      observation_id: "obs-code-2",
      source_ref: path.resolve("src/secondary.ts"),
      location: path.resolve("src/secondary.ts"),
      summary: "second observed source file",
    });

    const dispositionValidation = validateCandidateDisposition({
      candidateInventory: candidateInventory(),
      candidateDisposition: candidateDisposition(),
      sourceObservations: observations,
      registry,
    });

    expect(dispositionValidation.validation_status).toBe("invalid");
    expect(dispositionValidation.violations.some((violation) =>
      violation.code === "source_observation_coverage_missing" &&
      violation.observation_id === "obs-code-2"
    )).toBe(true);
  });

  it("allows an object primary key to reference a property on the same object", async () => {
    const registry = await loadReconstructContractRegistry({
      registryPath: path.resolve(".onto/processes/reconstruct/reconstruct-contract-registry.yaml"),
    });
    const seed = ontologySeed();
    const objectType = ((seed.semantic_layer as any).object_types[0]) as any;
    objectType.properties = [
      {
        property_id: "property-dashboard-id",
        name: "dashboard id",
        value_type: "string",
        nullable: false,
        description: "The dashboard primary key property.",
        constraints: [],
        evidence_refs: [evidenceRef()],
      },
    ];

    const seedValidation = validateActionableOntologySeed({
      ontologySeed: seed,
      candidateDisposition: candidateDisposition(),
      sourceObservations: sourceObservations(),
      registry,
    });

    expect(seedValidation.validation_status).toBe("valid");
    expect(seedValidation.violations.map((violation) => violation.code))
      .not.toContain("duplicate_id");
  });

  it("rejects prose values in fields named evidence_refs", async () => {
    const registry = await loadReconstructContractRegistry({
      registryPath: path.resolve(".onto/processes/reconstruct/reconstruct-contract-registry.yaml"),
    });
    const seed = ontologySeed();
    ((seed.ontology_handoff as any).provenance_mapping as any).evidence_refs =
      "Evidence is described in prose here.";

    const seedValidation = validateActionableOntologySeed({
      ontologySeed: seed,
      candidateDisposition: candidateDisposition(),
      sourceObservations: sourceObservations(),
      registry,
    });

    expect(seedValidation.validation_status).toBe("invalid");
    expect(seedValidation.violations.map((violation) => violation.code))
      .toContain("evidence_ref_shape_invalid");
  });

  it("rejects seed semantic enum values outside the reconstruct registry", async () => {
    const registry = await loadReconstructContractRegistry({
      registryPath: path.resolve(".onto/processes/reconstruct/reconstruct-contract-registry.yaml"),
    });
    const seed = ontologySeed();
    ((seed.semantic_layer as any).object_types[0]).status = "certainly_done";
    ((seed.ontology_handoff as any).reasoning_or_formalism_profile)
      .representation_formalism = "spreadsheet_magic";

    const seedValidation = validateActionableOntologySeed({
      ontologySeed: seed,
      candidateDisposition: candidateDisposition(),
      sourceObservations: sourceObservations(),
      registry,
    });

    expect(seedValidation.validation_status).toBe("invalid");
    expect(seedValidation.violations.filter((violation) =>
      violation.code === "invalid_enum"
    ).length).toBeGreaterThanOrEqual(2);
  });

  it("rejects missing dispositions and promoted target refs that are not in the seed", async () => {
    const registry = await loadReconstructContractRegistry({
      registryPath: path.resolve(".onto/processes/reconstruct/reconstruct-contract-registry.yaml"),
    });
    const observations = sourceObservations();
    const badDisposition = candidateDisposition();
    badDisposition.dispositions = badDisposition.dispositions.filter((row) =>
      row.candidate_id !== "candidate-user"
    );
    badDisposition.dispositions[0]!.target_seed_refs = ["missing-seed-ref"];
    const badSeed = ontologySeed();
    ((badSeed.kinetic_layer as any).action_types[0]).actor_type_ids = [];

    const dispositionValidation = validateCandidateDisposition({
      candidateInventory: candidateInventory(),
      candidateDisposition: badDisposition,
      sourceObservations: observations,
      registry,
    });
    const seedValidation = validateActionableOntologySeed({
      ontologySeed: badSeed,
      candidateDisposition: badDisposition,
      sourceObservations: observations,
      registry,
    });

    expect(dispositionValidation.validation_status).toBe("invalid");
    expect(dispositionValidation.violations.map((violation) => violation.code))
      .toContain("missing_candidate_disposition");
    expect(seedValidation.validation_status).toBe("invalid");
    expect(seedValidation.violations.map((violation) => violation.code))
      .toEqual(expect.arrayContaining([
        "promoted_candidate_ref_unknown",
        "action_binding_missing",
      ]));
  });
});
