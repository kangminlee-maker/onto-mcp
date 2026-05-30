import { beforeAll, describe, expect, it } from "vitest";
import type {
  ReconstructActionableOntologySeedArtifact,
  ReconstructActionableOntologySeedValidationArtifact,
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

function ontologySeed(): ReconstructActionableOntologySeedArtifact {
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
  ReconstructActionableOntologySeedValidationArtifact {
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
  });
});
