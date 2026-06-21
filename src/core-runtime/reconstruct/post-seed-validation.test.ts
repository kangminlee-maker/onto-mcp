import { beforeAll, describe, expect, it } from "vitest";
import type {
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructClaimRealizationMapArtifact,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructFailureClassificationArtifact,
  ReconstructRevisionProposalArtifact,
  ReconstructRunGoverningSnapshot,
  ReconstructSeedConfirmationArtifact,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import {
  validateClaimRealizationMapForOntologySeed,
  validateCompetencyQuestionAssessment,
  validateCompetencyQuestionsForOntologySeed,
  validateFailureClassification,
  validateFinalOutputProvenance,
  validateRevisionProposal,
  validateSeedConfirmationForOntologySeed,
} from "./post-seed-validation.js";
import { ontologySeedClaimProjections } from "./seed-claim-projections.js";
import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
} from "./contract-registry.js";

let contractRegistry: ReconstructContractRegistry;

beforeAll(async () => {
  contractRegistry = await loadReconstructContractRegistry({
    registryPath: ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
  });
});

const evidenceRef = {
  observation_id: "obs-1",
  target_material_kind: "code" as const,
  source_ref: "/tmp/source.ts",
  location: "file",
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

function competencyCoverageRefs(seedRefRefs: string[] = []) {
  const refs = {
    coverage_axis_refs: contractRegistry.coverage_axis_registry.map((record) =>
      record.axis_id
    ),
    ontology_handoff_axis_refs:
      contractRegistry.ontology_handoff_axis_registry.map((record) => record.axis_id),
    seed_ref_refs: seedRefRefs,
    limitation_refs: [],
    reasoning_or_formalism_facets:
      contractRegistry.reasoning_or_formalism_facet_registry.map((record) =>
        record.facet_id
      ),
    entity_identity_facets:
      contractRegistry.entity_identity_facet_registry.map((record) => record.facet_id),
    instance_assertion_facets:
      contractRegistry.instance_assertion_facet_registry.map((record) =>
        record.facet_id
      ),
    terminology_facets:
      contractRegistry.terminology_facet_registry.map((record) => record.facet_id),
    relation_type_facets:
      contractRegistry.relation_type_facet_registry.map((record) => record.facet_id),
    classification_facets:
      contractRegistry.classification_facet_registry.map((record) => record.facet_id),
    constraint_facets:
      contractRegistry.constraint_facet_registry.map((record) => record.facet_id),
    modeling_concern_facets:
      contractRegistry.modeling_concern_applicability_registry.map((record) =>
        record.concern_id
      ),
    domain_competency_trace_refs: [],
    domain_competency_semantic_assessments: [],
    reference_standard_refs: [],
    pattern_catalog_refs: [],
    query_access_contract_refs: [],
    visualization_contract_refs: [],
    graph_exploration_contract_refs: [],
    coverage_disposition: "covered" as const,
    expected_answer_kind: "yes_no" as const,
    handoff_relevance: "required" as const,
    lifecycle_status: "active" as const,
    rationale: "Fixture question covers all required registry axes.",
  };
  return {
    ...refs,
  };
}

it("keeps metadata mapping as a registry-owned ontology handoff axis", () => {
  expect(
    contractRegistry.ontology_handoff_axis_registry.map((record) => record.axis_id),
  ).toContain("metadata_mapping");
});

function ontologyHandoffFixture(): Record<string, unknown> {
  return {
    readiness_claim: "ready",
    classification_mapping: {
      ontology_scope_kind: "application_ontology_seed",
      classification_axis_policy: "object, actor, action, and data-binding layers",
      classification_level_axis_refs: ["object-1", "actor-1", "action-1"],
      inheritance_model: "flat_seed_layer",
      mece_status: "not_asserted",
      seed_refs: ["object-1", "actor-1", "action-1"],
      limitation_refs: [],
    },
    entity_identity_mapping: {
      entity_id_policy: "stable seed ids",
      uri_or_iri_policy: "not_assigned",
      canonical_identifier_refs: ["object-1", "actor-1", "action-1"],
      alias_identifier_refs: [],
      primitive_vs_defined_status: "defined_by_seed_record",
      definition_criteria_refs: ["object-1"],
      limitation_refs: [],
    },
    instance_assertion_mapping: {
      instance_availability_status: "present",
      instance_refs: ["object-1"],
      example_assertion_refs: ["action-1"],
      abox_assertion_refs: [],
      limitation_refs: [],
    },
    terminology_mapping: {
      canonical_label_policy: "seed names are canonical labels",
      alias_policy: "aliases are not asserted",
      hidden_label_policy: "hidden labels are not asserted",
      homonym_policy: "not assessed in fixture",
      multilingual_label_policy: "single-language fixture labels",
      language_tag_policy: "und",
      limitation_refs: [],
    },
    relation_type_mapping: {
      relation_type_refs: [],
      formal_relation_semantics:
        "No link types are asserted; action bindings express operational relations.",
      domain_range_declaration_refs: ["action-1"],
      relation_property_constraint_refs: [],
      unsupported_relation_candidates: [],
      limitation_refs: [],
    },
    constraint_mapping: {
      constraint_refs: [],
      tbox_constraint_refs: [],
      abox_assertion_constraint_refs: [],
      shape_or_validation_constraint_refs: ["runtime_seed_validator"],
      policy_constraint_refs: ["policy-1"],
      unsupported_constraint_candidates: [],
      limitation_refs: [],
    },
    modularity_boundary: {
      module_candidates: ["fixture_seed_module"],
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
      application_context_refs: ["object-1"],
      actor_or_surface_refs: ["actor-1", "object-1"],
      limitation_refs: [],
    },
    metadata_mapping: {
      descriptive_metadata_refs: ["seed_identity"],
      bibliographic_metadata_refs: [],
      resource_metadata_refs: ["source-observations.yaml"],
      limitation_refs: [],
    },
    provenance_mapping: {
      provenance_binding_refs: ["provenance-1"],
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
        "static_surface",
        "kinetic_surface",
        "dynamic_surface",
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
      mapped_seed_refs: ["object-1", "actor-1", "action-1"],
      limitation_refs: [],
    },
    modeling_concern_applicability: {
      rows: [
        {
          concern_id: "instance_assertion_coverage",
          applies: false,
          applicability_predicate_ref: "fixture has no separate instance catalog",
          trace_refs: ["object-1"],
          limitation_refs: [],
        },
      ],
    },
    reference_standard_mapping: {
      standard_refs: ["operational_ontology_seed_contract"],
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
      connected_seed_refs: ["object-1", "actor-1", "action-1"],
      isolated_seed_refs: [],
      isolation_rationale_refs: [],
    },
    limitation_refs: [],
  };
}

function seedConfirmationValidationForClaims(
  claimIds: string[],
): ReconstructSeedConfirmationValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-05-29T00:00:00.000Z",
    seed_confirmation_ref: "seed-confirmation.yaml",
    ontology_seed_ref: "ontology-seed.yaml",
    ontology_seed_validation_ref: "ontology-seed-validation.yaml",
    validation_status: "valid",
    accepted_claim_ids: claimIds,
    rejected_claim_ids: [],
    partial_claim_ids: [],
    deferred_claim_ids: [],
    cq_eligible_claim_ids: claimIds,
    validation_results: ["seed_confirmation_valid"],
    violations: [],
  };
}

function governingSnapshot(args: {
  admittedCompetencyIds?: string[];
  admittedDomainCompetencyRefs?: string[];
  admittedDomainCompetencySourceRefs?: string[];
} = {}): ReconstructRunGoverningSnapshot {
  const admittedCompetencies = (args.admittedCompetencyIds ?? []).map((id) => ({
    competency_id: id.replace(/^.*#/, ""),
    qualified_competency_id: id,
    priority: "P1",
    question: "Can claim action-1 be answered?",
    section_heading: "Fixture Domain Competencies",
    inference_path: "Fixture inference path",
    verification_criteria: "claim action answered evidence",
    source_anchor: `fixture#${id}`,
  }));
  return {
    registry: {
      registry_id: "registry",
      registry_ref: "reconstruct-contract-registry.yaml",
      registry_sha256: "sha256",
      schema_version: 1,
      status: "active",
    },
    active_contracts: [],
    selected_source_profiles: [],
    validation_gate_catalog: [],
    validator_versions: [],
    snapshot_families: [],
    selected_reference_standard_ids: [],
    selected_reference_standard_version_or_snapshot_ids: {},
    selected_pattern_catalog_ids: [],
    selected_pattern_catalog_version_or_snapshot_ids: {},
    selected_pattern_catalog_canonical_uris: {},
    requested_domain_ids: [],
    admitted_domain_competency_refs: args.admittedDomainCompetencyRefs ?? [],
    admitted_domain_competency_source_refs:
      args.admittedDomainCompetencySourceRefs ?? [],
    admitted_domain_competency_snapshots: admittedCompetencies.length > 0
      ? [
        {
          source_ref: "fixture-domain.md",
          source_sha256: "sha256",
          source_seat: "project",
          authority_resolution_order: ["project"],
          domain_id: "fixture",
          competency_parser_id: "fixture",
          competency_parser_version: "1",
          admission_policy: "fixture",
          admitted_competencies: admittedCompetencies,
          required_admitted_competency_ids: admittedCompetencies.map((item) =>
            item.qualified_competency_id
          ),
          admitted_competency_priorities: Object.fromEntries(
            admittedCompetencies.map((item) => [item.qualified_competency_id, "P1"]),
          ),
          competency_id_migration_mappings: [],
        },
      ]
      : [],
    required_admitted_competency_ids: args.admittedCompetencyIds ?? [],
    admitted_competency_priorities: Object.fromEntries(
      (args.admittedCompetencyIds ?? []).map((id) => [id, "P1"]),
    ),
    competency_id_migration_mappings: [],
    lens_ids: [],
    migration_status_values: {
      source_profile: [],
      contract: [],
    },
  };
}

function sourceObservations(): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-05-29T00:00:00.000Z",
    observations: [
      {
        ...evidenceRef,
        adapter_id: "code-structure-observer",
        summary: "Runtime structural observation.",
        structural_data: {},
      },
    ],
    skipped_refs: [],
    validation_results: [],
  };
}

function ontologySeed(): ReconstructOntologySeedArtifact {
  return {
    seed_identity: {
      schema_version: "1",
      seed_id: "seed-1",
      title: "Fixture Seed",
      target_refs: ["/tmp/source.ts"],
      generated_at: "2026-05-29T00:00:00.000Z",
      authoring_profile: "test",
    },
    purpose: {
      declared_purpose: "Explain fixture behavior.",
      intended_decisions: ["Decide whether fixture behavior can be explained."],
      intended_actions: ["Explain fixture behavior."],
      non_goals: [],
      evidence_refs: [evidenceRef],
    },
    decision_context: {
      principal_user: "Fixture reviewer",
      downstream_use: "bounded_seed_handoff",
      decision_boundary: "Observed fixture only.",
      risk_notes: [],
    },
    conceptual_frame: {
      concepts: [
        {
          concept_id: "concept-1",
          name: "Fixture Concept",
          definition: "Observed fixture behavior.",
          purpose_role: "orients the seed",
          evidence_refs: [evidenceRef],
          confidence: "confirmed",
        },
      ],
      associations: [],
    },
    semantic_layer: {
      object_types: [
        {
          object_type_id: "object-1",
          name: "Fixture Object",
          object_kind: "service",
          description: "Observed fixture object.",
          primary_key: {
            property_id: "property-1",
            name: "fixture id",
            value_type: "string",
            evidence_refs: [evidenceRef],
          },
          properties: [],
          backing_source_refs: ["/tmp/source.ts"],
          evidence_refs: [evidenceRef],
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
          action_type_id: "action-1",
          name: "Explain Fixture",
          description: "Explain the fixture object.",
          actor_type_ids: ["actor-1"],
          target_object_type_ids: ["object-1"],
          affected_object_type_ids: [],
          parameters: [],
          preconditions: [],
          postconditions: [],
          side_effects: [],
          writeback_behavior: {
            writes: false,
            writeback_source_refs: [],
            rationale: "Read-only explanation.",
          },
          evidence_refs: [evidenceRef],
          status: "confirmed",
        },
      ],
      functions: [],
      workflows: [],
    },
    dynamic_layer: {
      actor_types: [
        {
          actor_type_id: "actor-1",
          name: "Fixture Actor",
          actor_kind: "human_user",
          role_refs: ["role-1"],
          description: "User requesting fixture explanation.",
          evidence_refs: [evidenceRef],
        },
      ],
      actor_roles: [
        {
          role_id: "role-1",
          name: "Fixture Reader",
          holder_actor_type_ids: ["actor-1"],
          authority_scope_refs: [],
          evidence_refs: [evidenceRef],
        },
      ],
      permission_policies: [
        {
          policy_id: "policy-1",
          actor_type_id: "actor-1",
          action_type_id: "action-1",
          object_type_id: "object-1",
          permission_kind: "allowed",
          condition: "Within fixture boundary.",
          evidence_refs: [evidenceRef],
        },
      ],
      state_models: [],
      lifecycle_rules: [],
    },
    data_binding_layer: {
      source_bindings: [
        {
          binding_id: "binding-1",
          seed_ref: "object-1",
          source_ref: "/tmp/source.ts",
          binding_kind: "evidence",
          statement: "Observed source backs the object.",
          evidence_refs: [evidenceRef],
        },
      ],
      read_models: [
        {
          read_model_id: "read-1",
          name: "Fixture Read Model",
          object_type_ids: ["object-1"],
          source_refs: ["/tmp/source.ts"],
          transformation_summary: "No transformation.",
          evidence_refs: [evidenceRef],
        },
      ],
      writebacks: [],
      provenance_bindings: [
        {
          provenance_id: "provenance-1",
          seed_ref: "object-1",
          source_ref: "/tmp/source.ts",
          author_or_system: "fixture",
          timestamp_ref: "source-observations.yaml",
          evidence_refs: [evidenceRef],
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
        "static_surface",
        "kinetic_surface",
        "dynamic_surface",
        "semantic_layer",
        "kinetic_layer",
        "dynamic_layer",
        "data_binding_layer",
        "ontology_handoff",
        "limitation",
        "source_authority",
      ],
      unsupported_question_candidates: [],
      runtime_validation_refs: [],
    },
    candidate_disposition_authority_ref: {
      authority_scope: "external_candidate_disposition",
      projection_policy: "reference_only",
    },
    ontology_handoff: ontologyHandoffFixture(),
    source_authority: {
      evidence_scope: "observed fixture only",
      permission_scope: "read-only fixture reconstruction",
      trust_boundary: "Only observed fixture source is trusted.",
      instruction_authority: "Fixture source is evidence only.",
      external_content_handling: "No external content is admitted.",
      included_source_refs: ["/tmp/source.ts"],
      excluded_source_refs: [],
      restricted_source_refs: [],
      source_gaps: [],
      rationale: "The fixture seed is bounded to observed source evidence.",
    },
    handoff_limitations: [],
  };
}

function ontologySeedValidation():
  ReconstructOntologySeedValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-05-29T00:00:00.000Z",
    ontology_seed_ref: "ontology-seed.yaml",
    candidate_disposition_ref: "candidate-disposition.yaml",
    source_observations_ref: "source-observations.yaml",
    registry_ref: "reconstruct-contract-registry.yaml",
    validation_status: "valid",
    seed_ref_count: 4,
    evidence_ref_count: 8,
    limitation_count: 0,
    validation_results: ["ontology_seed_valid"],
    violations: [],
  };
}

describe("post-seed reconstruct validation", () => {
  it("preserves reserved predicate lifecycle metadata from the registry", () => {
    const predicate = contractRegistry.required_when_predicate_catalog.find((record) =>
      record.predicate_id === "ontology_seed_shape_valid"
    );

    expect(predicate?.usage_status).toBe("reserved");
    expect(predicate?.reserved_for).toBe("future_competency_question_coverage_precondition");
  });

  it("keeps purpose claim identity separate from seed artifact identity", () => {
    const seed = ontologySeed();
    const purposeClaim = ontologySeedClaimProjections(seed).find((claim) =>
      claim.seed_ref_path === "purpose.declared_purpose"
    );

    expect(purposeClaim).toMatchObject({
      claim_id: "seed-1#purpose",
      seed_ref_path: "purpose.declared_purpose",
      statement: "Explain fixture behavior.",
    });
    expect(purposeClaim?.claim_id).not.toBe(seed.seed_identity.seed_id);
  });

  it("projects nested state transition evidence onto state model claims", () => {
    const seed = ontologySeed();
    const transitionEvidence = {
      ...evidenceRef,
      observation_id: "obs-state-transition",
    };
    const dynamicLayer = seed.dynamic_layer as { state_models: Record<string, unknown>[] };
    dynamicLayer.state_models = [
      {
        state_model_id: "state-model-1",
        name: "Fixture State Model",
        description: "Observed fixture state changes.",
        object_type_id: "object-1",
        transitions: [
          {
            transition_id: "transition-1",
            from_state: "pending",
            to_state: "approved",
            action_type_id: "action-1",
            evidence_refs: [transitionEvidence],
          },
        ],
      },
    ];

    const stateModelClaim = ontologySeedClaimProjections(seed).find((claim) =>
      claim.claim_id === "state-model-1"
    );

    expect(stateModelClaim?.evidence_refs.map((ref) => ref.observation_id))
      .toEqual(["obs-state-transition"]);
  });

  it("validates ontology-seed authority through downstream claim gates", () => {
    const seed = ontologySeed();
    const claims = ontologySeedClaimProjections(seed).map((claim) => claim.claim_id);
    const claimRealizationMap: ReconstructClaimRealizationMapArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      ontology_seed_ref: "ontology-seed.yaml",
      claim_realizations: claims.map((claimId) => ({
        claim_id: claimId,
        stance: "observed_runtime_behavior",
        evidence_refs: [evidenceRef],
        rationale: "Observed.",
      })),
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const claimValidation = validateClaimRealizationMapForOntologySeed({
      claimRealizationMap,
      ontologySeed: seed,
      sourceObservations: sourceObservations(),
    });
    const confirmation: ReconstructSeedConfirmationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      ontology_seed_ref: "ontology-seed.yaml",
      ontology_seed_validation_ref: "ontology-seed-validation.yaml",
      confirmation_status: "accepted",
      confirmed_claim_ids: claims,
      rejected_claim_ids: [],
      partial_claim_ids: [],
      deferred_claim_ids: [],
      notes: [],
      confirmation_provider: {
        owner: "mock",
        provider_id: "mock",
      },
    };
    const confirmationValidation = validateSeedConfirmationForOntologySeed({
      seedConfirmation: confirmation,
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
    });
    const questions: ReconstructCompetencyQuestionsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      seed_confirmation_ref: null,
      ontology_seed_ref: "ontology-seed.yaml",
      questions: [
        {
          question_id: "cq-1",
          question: "Can the seed explain every active claim?",
          linked_claim_ids: claims,
          ...competencyCoverageRefs(claims),
          evidence_refs: [evidenceRef],
        },
      ],
      open_questions: [],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const questionsValidation = validateCompetencyQuestionsForOntologySeed({
      competencyQuestions: questions,
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
      seedConfirmationValidation: seedConfirmationValidationForClaims(claims),
      sourceObservations: sourceObservations(),
      contractRegistry,
    });

    expect(claimValidation.validation_status).toBe("valid");
    expect(confirmationValidation.validation_status).toBe("valid");
    expect(confirmationValidation.cq_eligible_claim_ids).toEqual(claims);
    expect(questionsValidation.validation_status).toBe("valid");
    expect(questionsValidation.required_evidence_scope_projection).toEqual([
      expect.objectContaining({
        question_id: "cq-1",
        required_evidence_scope: expect.arrayContaining([
          "purpose",
          "ontology_handoff",
          claims[0]!,
        ]),
      }),
    ]);
  });

  it("returns structured invalid output for malformed competency question rows", () => {
    const seed = ontologySeed();
    const claims = ontologySeedClaimProjections(seed).map((claim) => claim.claim_id);
    const malformedQuestions = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      seed_confirmation_ref: null,
      ontology_seed_ref: "ontology-seed.yaml",
      questions: [
        {
          question_id: "cq-malformed",
          question: "Can malformed input be reported without crashing?",
          coverage_disposition: "covered",
          expected_answer_kind: "yes_no",
          handoff_relevance: "required",
          lifecycle_status: "active",
          rationale: "Regression fixture.",
        },
      ],
      open_questions: [],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    } as unknown as ReconstructCompetencyQuestionsArtifact;

    const result = validateCompetencyQuestionsForOntologySeed({
      competencyQuestions: malformedQuestions,
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
      seedConfirmationValidation: seedConfirmationValidationForClaims(claims),
      sourceObservations: sourceObservations(),
      contractRegistry,
    });

    expect(result.validation_status).toBe("invalid");
    expect(result.competency_question_count).toBe(1);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "schema_shape_invalid",
          subject_id: "cq-malformed",
        }),
      ]),
    );
  });

  it("validates domain competency traces against the run governing snapshot", () => {
    const seed = ontologySeed();
    const claims = ontologySeedClaimProjections(seed).map((claim) => claim.claim_id);
    const coverageRefs = competencyCoverageRefs(claims);
    const semanticAssessment = {
      competency_id: "CQ-E01",
      source_anchor: "fixture#CQ-E01",
      applicability_verdict: "applicable" as const,
      semantic_alignment: "preserved" as const,
      rationale: "Fixture domain competency meaning is preserved.",
      evidence_refs: [evidenceRef],
    };
    const question = {
      question_id: "cq-1",
      question: "Can claim action-1 be answered?",
      linked_claim_ids: claims,
      ...coverageRefs,
      domain_competency_trace_refs: ["CQ-E01"],
      domain_competency_semantic_assessments: [semanticAssessment],
      evidence_refs: [evidenceRef],
    };

    const invalid = validateCompetencyQuestionsForOntologySeed({
      competencyQuestions: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        seed_confirmation_ref: null,
        ontology_seed_ref: "ontology-seed.yaml",
        questions: [question],
        open_questions: [],
        directive_author: { owner: "mock", author_id: "mock" },
      },
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
      seedConfirmationValidation: seedConfirmationValidationForClaims(claims),
      sourceObservations: sourceObservations(),
      contractRegistry,
      governingSnapshot: governingSnapshot(),
    });
    const valid = validateCompetencyQuestionsForOntologySeed({
      competencyQuestions: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        seed_confirmation_ref: null,
        ontology_seed_ref: "ontology-seed.yaml",
        questions: [question],
        open_questions: [],
        directive_author: { owner: "mock", author_id: "mock" },
      },
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
      seedConfirmationValidation: seedConfirmationValidationForClaims(claims),
      sourceObservations: sourceObservations(),
      contractRegistry,
      governingSnapshot: governingSnapshot({ admittedCompetencyIds: ["CQ-E01"] }),
    });
    const semanticMismatch = validateCompetencyQuestionsForOntologySeed({
      competencyQuestions: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        seed_confirmation_ref: null,
        ontology_seed_ref: "ontology-seed.yaml",
        questions: [
          {
            ...question,
            domain_competency_semantic_assessments: [{
              ...semanticAssessment,
              source_anchor: "fixture#wrong-anchor",
            }],
          },
        ],
        open_questions: [],
        directive_author: { owner: "mock", author_id: "mock" },
      },
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
      seedConfirmationValidation: seedConfirmationValidationForClaims(claims),
      sourceObservations: sourceObservations(),
      contractRegistry,
      governingSnapshot: governingSnapshot({ admittedCompetencyIds: ["CQ-E01"] }),
    });

    expect(invalid.validation_status).toBe("invalid");
    expect(invalid.violations.some((violation) =>
      violation.message.includes("domain_competency_trace_refs")
    )).toBe(true);
    expect(valid.validation_status).toBe("valid");
    expect(semanticMismatch.validation_status).toBe("invalid");
    expect(semanticMismatch.violations.some((violation) =>
      violation.message.includes("source_anchor must match admitted source anchor")
    )).toBe(true);
  });

  it("requires every admitted domain competency id to appear exactly once", () => {
    const seed = ontologySeed();
    const claims = ontologySeedClaimProjections(seed).map((claim) => claim.claim_id);
    const coverageRefs = competencyCoverageRefs(claims);
    const semanticAssessment = {
      competency_id: "CQ-E01",
      source_anchor: "fixture#CQ-E01",
      applicability_verdict: "applicable" as const,
      semantic_alignment: "preserved" as const,
      rationale: "Fixture domain competency meaning is preserved.",
      evidence_refs: [evidenceRef],
    };
    const question = {
      question_id: "cq-1",
      question: "Can claim action-1 be answered?",
      linked_claim_ids: claims,
      ...coverageRefs,
      domain_competency_trace_refs: ["CQ-E01"],
      domain_competency_semantic_assessments: [semanticAssessment],
      evidence_refs: [evidenceRef],
    };
    const missing = validateCompetencyQuestionsForOntologySeed({
      competencyQuestions: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        seed_confirmation_ref: null,
        ontology_seed_ref: "ontology-seed.yaml",
        questions: [question],
        open_questions: [],
        directive_author: { owner: "mock", author_id: "mock" },
      },
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
      seedConfirmationValidation: seedConfirmationValidationForClaims(claims),
      sourceObservations: sourceObservations(),
      contractRegistry,
      governingSnapshot: governingSnapshot({ admittedCompetencyIds: ["CQ-E01", "CQ-E02"] }),
    });
    const duplicate = validateCompetencyQuestionsForOntologySeed({
      competencyQuestions: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        seed_confirmation_ref: null,
        ontology_seed_ref: "ontology-seed.yaml",
        questions: [
          question,
          {
            ...question,
            question_id: "cq-2",
          },
        ],
        open_questions: [],
        directive_author: { owner: "mock", author_id: "mock" },
      },
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
      seedConfirmationValidation: seedConfirmationValidationForClaims(claims),
      sourceObservations: sourceObservations(),
      contractRegistry,
      governingSnapshot: governingSnapshot({ admittedCompetencyIds: ["CQ-E01"] }),
    });

    expect(missing.violations.some((violation) =>
      violation.message.includes("has no competency question disposition row")
    )).toBe(true);
    expect(duplicate.violations.some((violation) =>
      violation.message.includes("exactly one competency question disposition row")
    )).toBe(true);
  });

  it("validates competency-question facet and proof refs against registry ids", () => {
    const seed = ontologySeed();
    const questionsValidation = validateCompetencyQuestionsForOntologySeed({
      competencyQuestions: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        seed_confirmation_ref: null,
        ontology_seed_ref: "ontology-seed.yaml",
        questions: [
          {
            question_id: "cq-1",
            question: "Can claim action-1 be answered?",
            linked_claim_ids: ["action-1"],
            ...competencyCoverageRefs(["action-1"]),
            entity_identity_facets: ["unknown_facet"],
            query_access_contract_refs: ["unknown_contract"],
            seed_ref_refs: ["unknown_scope"],
            evidence_refs: [evidenceRef],
          },
        ],
        open_questions: [],
        directive_author: { owner: "mock", author_id: "mock" },
      },
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
      seedConfirmationValidation: seedConfirmationValidationForClaims(["action-1"]),
      sourceObservations: sourceObservations(),
      contractRegistry,
    });

    expect(questionsValidation.validation_status).toBe("invalid");
    expect(questionsValidation.violations.some((violation) =>
      violation.message.includes("entity_identity_facets")
    )).toBe(true);
    expect(questionsValidation.violations.some((violation) =>
      violation.message.includes("query_access_contract_refs")
    )).toBe(true);
    expect(questionsValidation.violations.some((violation) =>
      violation.message.includes("seed_ref_refs")
    )).toBe(true);
  });

  it("validates competency assessment, failure classification, revisions, and final provenance", () => {
    const questions: ReconstructCompetencyQuestionsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      seed_confirmation_ref: null,
      ontology_seed_ref: "ontology-seed.yaml",
      questions: [
        {
          question_id: "cq-1",
          question: "Can claim action-1 be answered?",
          linked_claim_ids: ["action-1"],
          ...competencyCoverageRefs(["action-1"]),
          evidence_refs: [evidenceRef],
        },
      ],
      open_questions: [],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const assessment: ReconstructCompetencyQuestionAssessmentArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      competency_questions_ref: "competency-questions.yaml",
      competency_questions_validation_ref: "competency-questions-validation.yaml",
      assessments: [
        {
          question_id: "cq-1",
          answer_status: "partially_answerable",
          answer_summary: "The question is only partially answerable.",
          required_seed_refs: ["action-1"],
          linked_claim_ids: ["action-1"],
          evidence_refs: [evidenceRef],
          missing_source_or_confirmation: null,
          ambiguity_notes: [],
          downstream_effect: "limited",
          rationale: "Needs more evidence.",
        },
      ],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const assessmentValidation = validateCompetencyQuestionAssessment({
      competencyQuestionAssessment: assessment,
      competencyQuestions: questions,
    });
    const invalidAssessment = validateCompetencyQuestionAssessment({
      competencyQuestionAssessment: {
        ...assessment,
        assessments: [
          {
            ...assessment.assessments[0],
            linked_claim_ids: ["unknown-claim"],
            evidence_refs: [{
              ...evidenceRef,
              observation_id: "unknown-observation",
            }],
          },
        ],
      },
      competencyQuestions: questions,
    });
    const answerableWithoutEvidence = validateCompetencyQuestionAssessment({
      competencyQuestionAssessment: {
        ...assessment,
        assessments: [
          {
            ...assessment.assessments[0],
            answer_status: "answerable",
            downstream_effect: "ready",
            required_seed_refs: [],
            evidence_refs: [],
          },
        ],
      },
      competencyQuestions: questions,
    });
    const failureClassification: ReconstructFailureClassificationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      competency_question_assessment_ref: "competency-question-assessment.yaml",
      competency_question_assessment_validation_ref:
        "competency-question-assessment-validation.yaml",
      seed_confirmation_validation_ref: "seed-confirmation-validation.yaml",
      failures: [
        {
          failure_id: "failure-1",
          failure_kind: "insufficient_evidence",
          materiality: "material",
          question_id: "cq-1",
          claim_id: "action-1",
          rationale: "The question is only partially answered.",
          recommended_action: "collect_evidence",
        },
      ],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const failureValidation = validateFailureClassification({
      failureClassification,
      competencyQuestionAssessment: assessment,
      seedConfirmationValidation: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        seed_confirmation_ref: "seed-confirmation.yaml",
        ontology_seed_ref: "ontology-seed.yaml",
        ontology_seed_validation_ref: "ontology-seed-validation.yaml",
        validation_status: "valid",
        accepted_claim_ids: ["concept-1"],
        rejected_claim_ids: [],
        partial_claim_ids: ["action-1"],
        deferred_claim_ids: [],
        cq_eligible_claim_ids: ["concept-1", "action-1"],
        validation_results: ["seed_confirmation_valid"],
        violations: [],
      },
    });
    const revisionProposal: ReconstructRevisionProposalArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      failure_classification_ref: "failure-classification.yaml",
      failure_classification_validation_ref:
        "failure-classification-validation.yaml",
      proposals: [
        {
          proposal_id: "proposal-1",
          target_type: "failure",
          target_id: "failure-1",
          action: "extend",
          rationale: "Gather more source evidence.",
          expected_effect: "The competency question can be answered.",
        },
      ],
      directive_author: {
        owner: "mock",
        author_id: "mock",
      },
    };
    const revisionValidation = validateRevisionProposal({
      revisionProposal,
      failureClassification,
    });
    const finalViolations = validateFinalOutputProvenance({
      finalOutputText: "See ontology-seed.yaml and proposal-1.",
      requiredFragments: ["ontology-seed.yaml", "proposal-1"],
    });
    const finalClaimRestatementViolations = validateFinalOutputProvenance({
      finalOutputText:
        "See claim-projection.yaml.\n\n- Handoff readiness: ready\n",
      requiredFragments: ["claim-projection.yaml"],
      forbiddenFragments: ["Handoff readiness:"],
    });

    expect(assessmentValidation.validation_status).toBe("valid");
    expect(invalidAssessment.validation_status).toBe("invalid");
    expect(invalidAssessment.violations.some((violation) =>
      violation.message.includes("linked_claim_ids")
    )).toBe(true);
    expect(invalidAssessment.violations.some((violation) =>
      violation.message.includes("evidence_refs")
    )).toBe(true);
    expect(answerableWithoutEvidence.validation_status).toBe("invalid");
    expect(answerableWithoutEvidence.violations.some((violation) =>
      violation.code === "evidence_ref_missing"
    )).toBe(true);
    expect(answerableWithoutEvidence.violations.some((violation) =>
      violation.message.includes("must carry required_seed_refs")
    )).toBe(true);
    expect(failureValidation.validation_status).toBe("valid");
    expect(revisionValidation.validation_status).toBe("valid");
    expect(finalViolations).toEqual([]);
    expect(finalClaimRestatementViolations).toContainEqual(
      expect.objectContaining({
        code: "final_output_claim_restatement_forbidden",
        subject_id: "Handoff readiness:",
      }),
    );
  });
});

function clone<T>(value: T): T {
  return structuredClone(value);
}

function expectRejection(
  validation: { validation_status: string; violations: { code: string }[] },
  code: string,
): void {
  expect(validation.validation_status).toBe("invalid");
  expect(validation.violations.some((violation) => violation.code === code))
    .toBe(true);
}

describe("validateClaimRealizationMapForOntologySeed rejection branches", () => {
  function validBase() {
    const seed = ontologySeed();
    const claims = ontologySeedClaimProjections(seed).map((claim) => claim.claim_id);
    const claimRealizationMap: ReconstructClaimRealizationMapArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      ontology_seed_ref: "ontology-seed.yaml",
      claim_realizations: claims.map((claimId) => ({
        claim_id: claimId,
        stance: "observed_runtime_behavior",
        evidence_refs: [{ ...evidenceRef }],
        rationale: "Observed.",
      })),
      directive_author: { owner: "mock", author_id: "mock" },
    };
    return {
      claimRealizationMap,
      ontologySeed: seed,
      sourceObservations: sourceObservations(),
    };
  }

  it("validates the reused base fixture cleanly", () => {
    expect(
      validateClaimRealizationMapForOntologySeed(validBase()).validation_status,
    ).toBe("valid");
  });

  it("rejects a session_id that does not match seed authority (session_id_mismatch)", () => {
    const base = clone(validBase());
    base.claimRealizationMap.session_id = "session-other";
    expectRejection(
      validateClaimRealizationMapForOntologySeed(base),
      "session_id_mismatch",
    );
  });

  it("rejects a duplicate claim realization (duplicate_id)", () => {
    const base = clone(validBase());
    base.claimRealizationMap.claim_realizations.push(
      clone(base.claimRealizationMap.claim_realizations[0]!),
    );
    expectRejection(validateClaimRealizationMapForOntologySeed(base), "duplicate_id");
  });

  it("rejects a realization for an unknown claim id (unknown_id)", () => {
    const base = clone(validBase());
    base.claimRealizationMap.claim_realizations.push({
      claim_id: "claim-does-not-exist",
      stance: "observed_runtime_behavior",
      evidence_refs: [{ ...evidenceRef }],
      rationale: "Observed.",
    });
    expectRejection(validateClaimRealizationMapForOntologySeed(base), "unknown_id");
  });

  it("rejects an out-of-set stance (invalid_enum)", () => {
    const base = clone(validBase());
    (base.claimRealizationMap.claim_realizations[0]! as { stance: string }).stance =
      "bogus_stance";
    expectRejection(validateClaimRealizationMapForOntologySeed(base), "invalid_enum");
  });

  it("rejects a realization without rationale (rationale_missing)", () => {
    const base = clone(validBase());
    base.claimRealizationMap.claim_realizations[0]!.rationale = "   ";
    expectRejection(
      validateClaimRealizationMapForOntologySeed(base),
      "rationale_missing",
    );
  });

  it("rejects a non-deferred realization without evidence (evidence_ref_missing)", () => {
    const base = clone(validBase());
    base.claimRealizationMap.claim_realizations[0]!.evidence_refs = [];
    expectRejection(
      validateClaimRealizationMapForOntologySeed(base),
      "evidence_ref_missing",
    );
  });

  it("rejects a claim with no realization stance (missing_required_coverage)", () => {
    const base = clone(validBase());
    base.claimRealizationMap.claim_realizations.pop();
    expectRejection(
      validateClaimRealizationMapForOntologySeed(base),
      "missing_required_coverage",
    );
  });

  it("rejects evidence citing an unknown observation (unknown_observation_ref)", () => {
    const base = clone(validBase());
    base.claimRealizationMap.claim_realizations[0]!.evidence_refs[0]!.observation_id =
      "obs-unknown";
    expectRejection(
      validateClaimRealizationMapForOntologySeed(base),
      "unknown_observation_ref",
    );
  });

  it("rejects evidence whose material kind differs from the observation (material_kind_mismatch)", () => {
    const base = clone(validBase());
    base.claimRealizationMap.claim_realizations[0]!.evidence_refs[0]!
      .target_material_kind = "document";
    expectRejection(
      validateClaimRealizationMapForOntologySeed(base),
      "material_kind_mismatch",
    );
  });

  it("rejects evidence whose source_ref differs from the observation (source_ref_mismatch)", () => {
    const base = clone(validBase());
    base.claimRealizationMap.claim_realizations[0]!.evidence_refs[0]!.source_ref =
      "/tmp/other.ts";
    expectRejection(
      validateClaimRealizationMapForOntologySeed(base),
      "source_ref_mismatch",
    );
  });

  it("rejects evidence whose location differs from the observation (location_mismatch)", () => {
    const base = clone(validBase());
    base.claimRealizationMap.claim_realizations[0]!.evidence_refs[0]!.location =
      "line:99";
    expectRejection(
      validateClaimRealizationMapForOntologySeed(base),
      "location_mismatch",
    );
  });
});

describe("validateSeedConfirmationForOntologySeed rejection branches", () => {
  function validBase() {
    const seed = ontologySeed();
    const claims = ontologySeedClaimProjections(seed).map((claim) => claim.claim_id);
    const seedConfirmation: ReconstructSeedConfirmationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      ontology_seed_ref: "ontology-seed.yaml",
      ontology_seed_validation_ref: "ontology-seed-validation.yaml",
      confirmation_status: "accepted",
      confirmed_claim_ids: claims,
      rejected_claim_ids: [],
      partial_claim_ids: [],
      deferred_claim_ids: [],
      notes: [],
      confirmation_provider: { owner: "mock", provider_id: "mock" },
    };
    return {
      seedConfirmation,
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
    };
  }

  it("validates the reused base fixture cleanly", () => {
    expect(
      validateSeedConfirmationForOntologySeed(validBase()).validation_status,
    ).toBe("valid");
  });

  it("rejects an invalid prior ontology-seed validation (prior_validation_invalid)", () => {
    const base = clone(validBase());
    base.ontologySeedValidation.validation_status = "invalid";
    expectRejection(
      validateSeedConfirmationForOntologySeed(base),
      "prior_validation_invalid",
    );
  });

  it("rejects confirmation of an unknown claim id (unknown_id)", () => {
    const base = clone(validBase());
    base.seedConfirmation.confirmed_claim_ids = [
      ...base.seedConfirmation.confirmed_claim_ids,
      "claim-unknown",
    ];
    expectRejection(validateSeedConfirmationForOntologySeed(base), "unknown_id");
  });

  it("rejects a claim placed in two confirmation states (conflicting_state)", () => {
    const base = clone(validBase());
    const claimId = base.seedConfirmation.confirmed_claim_ids[0]!;
    base.seedConfirmation.rejected_claim_ids = [claimId];
    expectRejection(
      validateSeedConfirmationForOntologySeed(base),
      "conflicting_state",
    );
  });

  it("rejects a claim with no confirmation state (missing_required_coverage)", () => {
    const base = clone(validBase());
    base.seedConfirmation.confirmed_claim_ids =
      base.seedConfirmation.confirmed_claim_ids.slice(1);
    expectRejection(
      validateSeedConfirmationForOntologySeed(base),
      "missing_required_coverage",
    );
  });
});

describe("validateCompetencyQuestionsForOntologySeed rejection branches", () => {
  function validBase() {
    const seed = ontologySeed();
    const claims = ontologySeedClaimProjections(seed).map((claim) => claim.claim_id);
    const competencyQuestions: ReconstructCompetencyQuestionsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      seed_confirmation_ref: null,
      ontology_seed_ref: "ontology-seed.yaml",
      questions: [
        {
          question_id: "cq-1",
          question: "Can the seed explain every active claim?",
          linked_claim_ids: claims,
          ...competencyCoverageRefs(claims),
          evidence_refs: [{ ...evidenceRef }],
        },
      ],
      open_questions: [],
      directive_author: { owner: "mock", author_id: "mock" },
    };
    return {
      competencyQuestions,
      ontologySeed: seed,
      ontologySeedValidation: ontologySeedValidation(),
      seedConfirmationValidation: seedConfirmationValidationForClaims(claims),
      sourceObservations: sourceObservations(),
      contractRegistry,
    };
  }

  it("validates the reused base fixture cleanly", () => {
    expect(
      validateCompetencyQuestionsForOntologySeed(validBase()).validation_status,
    ).toBe("valid");
  });

  it("rejects a duplicate competency question id (duplicate_id)", () => {
    const base = clone(validBase());
    base.competencyQuestions.questions.push(
      clone(base.competencyQuestions.questions[0]!),
    );
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "duplicate_id",
    );
  });

  it("rejects a question without rationale (rationale_missing)", () => {
    const base = clone(validBase());
    base.competencyQuestions.questions[0]!.rationale = "   ";
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "rationale_missing",
    );
  });

  it("rejects an out-of-set expected_answer_kind (invalid_enum)", () => {
    const base = clone(validBase());
    (base.competencyQuestions.questions[0]! as { expected_answer_kind: string })
      .expected_answer_kind = "bogus_kind";
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "invalid_enum",
    );
  });

  it("rejects a non-covered question without limitation_refs (missing_required_coverage)", () => {
    const base = clone(validBase());
    (base.competencyQuestions.questions[0]! as { coverage_disposition: string })
      .coverage_disposition = "limited";
    base.competencyQuestions.questions[0]!.limitation_refs = [];
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "missing_required_coverage",
    );
  });

  it("rejects a covered active question without evidence (evidence_ref_missing)", () => {
    const base = clone(validBase());
    base.competencyQuestions.questions[0]!.evidence_refs = [];
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "evidence_ref_missing",
    );
  });

  it("rejects a link to a non-eligible claim (unknown_id)", () => {
    const base = clone(validBase());
    base.competencyQuestions.questions[0]!.linked_claim_ids = [
      ...base.competencyQuestions.questions[0]!.linked_claim_ids,
      "claim-not-eligible",
    ];
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "unknown_id",
    );
  });

  it("rejects evidence citing an unknown observation (unknown_observation_ref)", () => {
    const base = clone(validBase());
    base.competencyQuestions.questions[0]!.evidence_refs[0]!.observation_id =
      "obs-unknown";
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "unknown_observation_ref",
    );
  });

  it("rejects evidence whose material kind differs from the observation (material_kind_mismatch)", () => {
    const base = clone(validBase());
    base.competencyQuestions.questions[0]!.evidence_refs[0]!.target_material_kind =
      "document";
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "material_kind_mismatch",
    );
  });

  it("rejects evidence whose source_ref differs from the observation (source_ref_mismatch)", () => {
    const base = clone(validBase());
    base.competencyQuestions.questions[0]!.evidence_refs[0]!.source_ref =
      "/tmp/other.ts";
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "source_ref_mismatch",
    );
  });

  it("rejects evidence whose location differs from the observation (location_mismatch)", () => {
    const base = clone(validBase());
    base.competencyQuestions.questions[0]!.evidence_refs[0]!.location = "line:99";
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "location_mismatch",
    );
  });

  it("rejects an invalid prior seed-confirmation validation (prior_validation_invalid)", () => {
    const base = clone(validBase());
    base.seedConfirmationValidation.validation_status = "invalid";
    expectRejection(
      validateCompetencyQuestionsForOntologySeed(base),
      "prior_validation_invalid",
    );
  });
});

describe("validateCompetencyQuestionAssessment rejection branches", () => {
  function questionsFixture(): ReconstructCompetencyQuestionsArtifact {
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      seed_confirmation_ref: null,
      ontology_seed_ref: "ontology-seed.yaml",
      questions: [
        {
          question_id: "cq-1",
          question: "Can claim action-1 be answered?",
          linked_claim_ids: ["action-1"],
          ...competencyCoverageRefs(["action-1"]),
          evidence_refs: [{ ...evidenceRef }],
        },
      ],
      open_questions: [],
      directive_author: { owner: "mock", author_id: "mock" },
    };
  }

  function validBase() {
    const assessment: ReconstructCompetencyQuestionAssessmentArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      competency_questions_ref: "competency-questions.yaml",
      competency_questions_validation_ref: "competency-questions-validation.yaml",
      assessments: [
        {
          question_id: "cq-1",
          answer_status: "partially_answerable",
          answer_summary: "The question is only partially answerable.",
          required_seed_refs: ["action-1"],
          linked_claim_ids: ["action-1"],
          evidence_refs: [{ ...evidenceRef }],
          missing_source_or_confirmation: null,
          ambiguity_notes: [],
          downstream_effect: "limited",
          rationale: "Needs more evidence.",
        },
      ],
      directive_author: { owner: "mock", author_id: "mock" },
    };
    return {
      competencyQuestionAssessment: assessment,
      competencyQuestions: questionsFixture(),
    };
  }

  it("validates the reused base fixture cleanly", () => {
    expect(
      validateCompetencyQuestionAssessment(validBase()).validation_status,
    ).toBe("valid");
  });

  it("rejects a duplicate competency question assessment (duplicate_id)", () => {
    const base = clone(validBase());
    base.competencyQuestionAssessment.assessments.push(
      clone(base.competencyQuestionAssessment.assessments[0]!),
    );
    expectRejection(
      validateCompetencyQuestionAssessment(base),
      "duplicate_id",
    );
  });

  it("rejects a linked claim outside the question (unknown_id)", () => {
    const base = clone(validBase());
    base.competencyQuestionAssessment.assessments[0]!.linked_claim_ids = [
      "action-1",
      "claim-outside",
    ];
    expectRejection(
      validateCompetencyQuestionAssessment(base),
      "unknown_id",
    );
  });

  it("rejects evidence outside the competency question (unknown_observation_ref)", () => {
    const base = clone(validBase());
    base.competencyQuestionAssessment.assessments[0]!.evidence_refs = [
      { ...evidenceRef },
      { ...evidenceRef, observation_id: "obs-extra" },
    ];
    expectRejection(
      validateCompetencyQuestionAssessment(base),
      "unknown_observation_ref",
    );
  });

  it("rejects an out-of-set answer_status (invalid_enum)", () => {
    const base = clone(validBase());
    (base.competencyQuestionAssessment.assessments[0]! as { answer_status: string })
      .answer_status = "bogus_status";
    expectRejection(
      validateCompetencyQuestionAssessment(base),
      "invalid_enum",
    );
  });

  it("rejects an assessment without rationale (rationale_missing)", () => {
    const base = clone(validBase());
    base.competencyQuestionAssessment.assessments[0]!.rationale = "   ";
    expectRejection(
      validateCompetencyQuestionAssessment(base),
      "rationale_missing",
    );
  });

  it("rejects an assessment missing a question seed ref (missing_required_coverage)", () => {
    const base = clone(validBase());
    base.competencyQuestionAssessment.assessments[0]!.required_seed_refs = [];
    expectRejection(
      validateCompetencyQuestionAssessment(base),
      "missing_required_coverage",
    );
  });
});

describe("validateFailureClassification rejection branches", () => {
  function assessmentFixture(): ReconstructCompetencyQuestionAssessmentArtifact {
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      competency_questions_ref: "competency-questions.yaml",
      competency_questions_validation_ref: "competency-questions-validation.yaml",
      assessments: [
        {
          question_id: "cq-1",
          answer_status: "partially_answerable",
          answer_summary: "The question is only partially answerable.",
          required_seed_refs: ["action-1"],
          linked_claim_ids: ["action-1"],
          evidence_refs: [{ ...evidenceRef }],
          missing_source_or_confirmation: null,
          ambiguity_notes: [],
          downstream_effect: "limited",
          rationale: "Needs more evidence.",
        },
      ],
      directive_author: { owner: "mock", author_id: "mock" },
    };
  }

  function seedConfirmationValidation(): ReconstructSeedConfirmationValidationArtifact {
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      seed_confirmation_ref: "seed-confirmation.yaml",
      ontology_seed_ref: "ontology-seed.yaml",
      ontology_seed_validation_ref: "ontology-seed-validation.yaml",
      validation_status: "valid",
      accepted_claim_ids: ["concept-1"],
      rejected_claim_ids: [],
      partial_claim_ids: ["action-1"],
      deferred_claim_ids: [],
      cq_eligible_claim_ids: ["concept-1", "action-1"],
      validation_results: ["seed_confirmation_valid"],
      violations: [],
    };
  }

  function validBase() {
    const failureClassification: ReconstructFailureClassificationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      competency_question_assessment_ref: "competency-question-assessment.yaml",
      competency_question_assessment_validation_ref:
        "competency-question-assessment-validation.yaml",
      seed_confirmation_validation_ref: "seed-confirmation-validation.yaml",
      failures: [
        {
          failure_id: "failure-1",
          failure_kind: "insufficient_evidence",
          materiality: "material",
          question_id: "cq-1",
          claim_id: "action-1",
          rationale: "The question is only partially answered.",
          recommended_action: "collect_evidence",
        },
      ],
      directive_author: { owner: "mock", author_id: "mock" },
    };
    return {
      failureClassification,
      competencyQuestionAssessment: assessmentFixture(),
      seedConfirmationValidation: seedConfirmationValidation(),
    };
  }

  it("validates the reused base fixture cleanly", () => {
    expect(validateFailureClassification(validBase()).validation_status).toBe("valid");
  });

  it("rejects a duplicate failure id (duplicate_id)", () => {
    const base = clone(validBase());
    base.failureClassification.failures.push(
      clone(base.failureClassification.failures[0]!),
    );
    expectRejection(validateFailureClassification(base), "duplicate_id");
  });

  it("rejects an out-of-set failure_kind (invalid_enum)", () => {
    const base = clone(validBase());
    (base.failureClassification.failures[0]! as { failure_kind: string })
      .failure_kind = "bogus_kind";
    expectRejection(validateFailureClassification(base), "invalid_enum");
  });

  it("rejects a failure referencing an unknown question (unknown_id)", () => {
    const base = clone(validBase());
    base.failureClassification.failures[0]!.question_id = "cq-unknown";
    expectRejection(validateFailureClassification(base), "unknown_id");
  });

  it("rejects a failure without rationale (rationale_missing)", () => {
    const base = clone(validBase());
    base.failureClassification.failures[0]!.rationale = "   ";
    expectRejection(validateFailureClassification(base), "rationale_missing");
  });
});

describe("validateRevisionProposal rejection branches", () => {
  function failureClassification(): ReconstructFailureClassificationArtifact {
    return {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      competency_question_assessment_ref: "competency-question-assessment.yaml",
      competency_question_assessment_validation_ref:
        "competency-question-assessment-validation.yaml",
      seed_confirmation_validation_ref: "seed-confirmation-validation.yaml",
      failures: [
        {
          failure_id: "failure-1",
          failure_kind: "insufficient_evidence",
          materiality: "material",
          question_id: "cq-1",
          claim_id: "action-1",
          rationale: "The question is only partially answered.",
          recommended_action: "collect_evidence",
        },
      ],
      directive_author: { owner: "mock", author_id: "mock" },
    };
  }

  // A seed whose only seed_ref/claim is `concept-1` — knownSeedRefs() resolves
  // to exactly {"concept-1"}, so a seed proposal targeting any other id fails.
  function ontologySeed(): ReconstructOntologySeedArtifact {
    return {
      conceptual_frame: { concepts: [{ concept_id: "concept-1" }] },
    } as unknown as ReconstructOntologySeedArtifact;
  }

  function validBase() {
    const revisionProposal: ReconstructRevisionProposalArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      failure_classification_ref: "failure-classification.yaml",
      failure_classification_validation_ref: "failure-classification-validation.yaml",
      proposals: [
        {
          proposal_id: "proposal-1",
          target_type: "failure",
          target_id: "failure-1",
          action: "extend",
          rationale: "Gather more source evidence.",
          expected_effect: "The competency question can be answered.",
        },
      ],
      directive_author: { owner: "mock", author_id: "mock" },
    };
    return {
      revisionProposal,
      failureClassification: failureClassification(),
      ontologySeed: ontologySeed(),
    };
  }

  function withProposalTarget(
    target: { target_type: string; target_id: string },
  ) {
    const base = clone(validBase());
    Object.assign(base.revisionProposal.proposals[0]!, target);
    return base;
  }

  it("validates the reused base fixture cleanly", () => {
    expect(validateRevisionProposal(validBase()).validation_status).toBe("valid");
  });

  it("rejects a duplicate proposal id (duplicate_id)", () => {
    const base = clone(validBase());
    base.revisionProposal.proposals.push(
      clone(base.revisionProposal.proposals[0]!),
    );
    expectRejection(validateRevisionProposal(base), "duplicate_id");
  });

  it("rejects a proposal referencing an unknown failure (unknown_id)", () => {
    const base = clone(validBase());
    base.revisionProposal.proposals[0]!.target_id = "failure-unknown";
    expectRejection(validateRevisionProposal(base), "unknown_id");
  });

  it("resolves a claim target via a failure's claim_id", () => {
    const base = withProposalTarget({ target_type: "claim", target_id: "action-1" });
    expect(validateRevisionProposal(base).validation_status).toBe("valid");
  });

  it("rejects a claim target absent from the failures' claim_ids (unknown_id)", () => {
    const base = withProposalTarget({ target_type: "claim", target_id: "action-stale" });
    expectRejection(validateRevisionProposal(base), "unknown_id");
  });

  it("resolves a question target via a failure's question_id", () => {
    const base = withProposalTarget({ target_type: "question", target_id: "cq-1" });
    expect(validateRevisionProposal(base).validation_status).toBe("valid");
  });

  it("rejects a question target absent from the failures' question_ids (unknown_id)", () => {
    const base = withProposalTarget({ target_type: "question", target_id: "cq-stale" });
    expectRejection(validateRevisionProposal(base), "unknown_id");
  });

  it("resolves a seed target via knownSeedRefs", () => {
    const base = withProposalTarget({ target_type: "seed", target_id: "concept-1" });
    expect(validateRevisionProposal(base).validation_status).toBe("valid");
  });

  it("rejects a fabricated seed target absent from the ontology seed (unknown_id)", () => {
    const base = withProposalTarget({ target_type: "seed", target_id: "seed-hallucinated" });
    expectRejection(validateRevisionProposal(base), "unknown_id");
  });

  it("rejects every seed target when no ontology seed is supplied (unknown_id)", () => {
    const base = withProposalTarget({ target_type: "seed", target_id: "concept-1" });
    const { ontologySeed: _omit, ...withoutSeed } = base;
    expectRejection(validateRevisionProposal(withoutSeed), "unknown_id");
  });

  it("rejects an out-of-set proposal action (invalid_enum)", () => {
    const base = clone(validBase());
    (base.revisionProposal.proposals[0]! as { action: string }).action =
      "bogus_action";
    expectRejection(validateRevisionProposal(base), "invalid_enum");
  });

  it("rejects a proposal without rationale or expected_effect (rationale_missing)", () => {
    const base = clone(validBase());
    base.revisionProposal.proposals[0]!.rationale = "   ";
    expectRejection(validateRevisionProposal(base), "rationale_missing");
  });
});

describe("validateFinalOutputProvenance rejection branches", () => {
  it("flags a required fragment that the final output does not cite (final_output_provenance_missing)", () => {
    const violations = validateFinalOutputProvenance({
      finalOutputText: "See ontology-seed.yaml.",
      requiredFragments: ["ontology-seed.yaml", "proposal-1"],
    });
    expect(violations.some((violation) =>
      violation.code === "final_output_provenance_missing" &&
      violation.subject_id === "proposal-1"
    )).toBe(true);
  });
});
