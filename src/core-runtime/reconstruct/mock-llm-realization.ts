/**
 * Reconstruct mock LLM realization (INV-MOCK-1 deletion boundary).
 *
 * Deterministic semantic payloads for every reconstruct LLM unit, keyed on
 * the unit's prompt contract. This module is the single boundary that owns
 * reconstruct mock payloads:
 *  - product code may import it only at an explicit realization switch point
 *    (`scripts/check-import-boundary.ts` allowlist);
 *  - tests consume it directly as the full-pipeline fixture author.
 *
 * Mock runs verify wiring, schemas, artifact contracts, and validation gates.
 * They are not product semantic output: runs record the mock actor ids in the
 * run manifest (`performed_by.actor_id`) so artifacts stay attributable.
 *
 * The realization switch reuses the shared mock env vocabulary
 * (`ONTO_LLM_MOCK=1`, declared by the review mock realization module).
 */
import type { LlmCallResult } from "../llm/llm-caller.js";
import { REVIEW_MOCK_REALIZATION_ENV } from "../llm/mock-llm-realization.js";
import type { ReconstructOntologySeedArtifact } from "./artifact-types.js";
import { ontologySeedClaimProjections } from "./seed-claim-projections.js";

export const RECONSTRUCT_MOCK_REALIZATION_ENV = REVIEW_MOCK_REALIZATION_ENV;

export const RECONSTRUCT_MOCK_AUTHOR_ID = "reconstruct-mock-semantic-author";
export const RECONSTRUCT_MOCK_CONFIRMATION_PROVIDER_ID =
  "reconstruct-mock-confirmation-provider";

export function isReconstructMockLlmRealizationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[RECONSTRUCT_MOCK_REALIZATION_ENV] === "1";
}

export function reconstructMockOntologyHandoff(args: {
  objectTypeId: string;
  actorTypeId: string;
  actionTypeId: string;
  policyId: string;
  provenanceId: string;
}): Record<string, unknown> {
  return {
    readiness_claim: "ready",
    classification_mapping: {
      ontology_scope_kind: "application_ontology_seed",
      classification_axis_policy: "object, actor, action, and data-binding layers",
      classification_level_axis_refs: [
        args.objectTypeId,
        args.actorTypeId,
        args.actionTypeId,
      ],
      inheritance_model: "flat_seed_layer",
      mece_status: "not_asserted",
      seed_refs: [args.objectTypeId, args.actorTypeId, args.actionTypeId],
      limitation_refs: [],
    },
    entity_identity_mapping: {
      entity_id_policy: "stable seed ids",
      uri_or_iri_policy: "not_assigned",
      canonical_identifier_refs: [args.objectTypeId, args.actorTypeId, args.actionTypeId],
      alias_identifier_refs: [],
      primitive_vs_defined_status: "defined_by_seed_record",
      definition_criteria_refs: [args.objectTypeId],
      limitation_refs: [],
    },
    instance_assertion_mapping: {
      instance_availability_status: "present",
      instance_refs: [args.objectTypeId],
      example_assertion_refs: [args.actionTypeId],
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
      domain_range_declaration_refs: [args.actionTypeId],
      relation_property_constraint_refs: [],
      unsupported_relation_candidates: [],
      limitation_refs: [],
    },
    constraint_mapping: {
      constraint_refs: [],
      tbox_constraint_refs: [],
      abox_assertion_constraint_refs: [],
      shape_or_validation_constraint_refs: ["runtime_seed_validator"],
      policy_constraint_refs: [args.policyId],
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
      application_context_refs: [args.objectTypeId],
      actor_or_surface_refs: [args.actorTypeId, args.objectTypeId],
      limitation_refs: [],
    },
    metadata_mapping: {
      descriptive_metadata_refs: ["seed_identity"],
      bibliographic_metadata_refs: [],
      resource_metadata_refs: ["source-observations.yaml"],
      limitation_refs: [],
    },
    provenance_mapping: {
      provenance_binding_refs: [args.provenanceId],
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
      mapped_seed_refs: [args.objectTypeId, args.actorTypeId, args.actionTypeId],
      limitation_refs: [],
    },
    modeling_concern_applicability: {
      rows: [
        {
          concern_id: "instance_assertion_coverage",
          applies: false,
          applicability_predicate_ref: "fixture has no separate instance catalog",
          trace_refs: [args.objectTypeId],
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
      connected_seed_refs: [args.objectTypeId, args.actorTypeId, args.actionTypeId],
      isolated_seed_refs: [],
      isolation_rationale_refs: [],
    },
    limitation_refs: [],
  };
}

export function callReconstructMockLlm(
  systemPrompt: string,
  userPrompt: string,
): Promise<LlmCallResult> {
  const input = JSON.parse(userPrompt) as Record<string, any>;
  const observations = (input.source_observations ?? []) as Array<{
    observation_id: string;
    target_material_kind?: string;
    source_ref?: string;
  }>;
  const firstObservationId =
    observations[0]?.observation_id ??
    input.eligible_claims?.[0]?.evidence_observation_ids?.[0] ??
    "obs_code_fake";
  const evidenceObservationIds = observations.length > 0
    ? observations.map((observation) => observation.observation_id)
    : [firstObservationId];
  const firstMaterialKind = observations[0]?.target_material_kind ?? "code";
  const firstSourceRef = observations[0]?.source_ref ?? "src/feature.ts";
  const targetMaterialKind =
    input.target_material_profile?.target_material_kind ?? firstMaterialKind;
  const mixedMemberScopeRefs = targetMaterialKind === "mixed"
    ? evidenceObservationIds
    : [];
  const mixedMemberSourceRefs = targetMaterialKind === "mixed"
    ? [...new Set(observations.map((observation) =>
      observation.source_ref ?? firstSourceRef
    ))]
    : [];
  const mixedMemberTargetKind = targetMaterialKind === "mixed"
    ? firstMaterialKind
    : null;
  let text: string;
  if (systemPrompt.includes("Select observations")) {
    text = JSON.stringify({
      selected_observations: [
        {
          observation_id: firstObservationId,
          selection_rationale: "Observed source is relevant to the declared reconstruct purpose.",
        },
      ],
      open_questions: [],
    });
  } else if (systemPrompt.includes("Integrate reconstruct lens judgments")) {
    // Checked before the broader "reconstruct lens" predicate: the synthesis
    // prompt contains that substring, so the narrower branch must win.
    text = JSON.stringify({
      accepted_gaps: [],
      requested_source_refs: [],
      no_next_frontier_rationale: "All fixture evidence needed for the Seed is present.",
    });
  } else if (systemPrompt.includes("reconstruct lens")) {
    text = JSON.stringify({
      candidate_labels: [
        {
          label_id: "label-1",
          label: "service purpose",
          evidence_observation_ids: [firstObservationId],
          rationale: "The observed source exposes service behavior.",
        },
      ],
      semantic_gaps: [],
      no_next_frontier_rationale: "No additional source is required for this fixture.",
    });
  } else if (systemPrompt.includes("Convert exploration synthesis")) {
    text = JSON.stringify({
      frontier_refs: [],
      no_next_frontier_rationale: "No next frontier is required for this fixture.",
    });
  } else if (systemPrompt.includes("Author source-purpose-candidates.yaml")) {
    text = JSON.stringify({
      purpose_candidates: [
        {
          purpose_candidate_id: "purpose-candidate-fixture-service",
          statement: "Explain fixture service structure for bounded handoff.",
          rank: "primary",
          purpose_source_status: "explicit_source_declared",
          evidence_kind_refs: ["P1", "P2"],
          supporting_evidence_observation_ids: evidenceObservationIds,
          contradicting_source_refs: [],
          adequacy_frame: {
            frame_id: "purpose-frame-fixture-service",
            frame_kind: "operational_ontology_seed",
            frame_status: "source_declared",
            adequacy_claim:
              "The seed is adequate when it represents the fixture service, fixture user, explanation action, and source evidence binding.",
            material_kind_requirements: {
              target_material_kind: targetMaterialKind,
              required_facets: ["object", "actor", "action", "evidence"],
              optional_facets: ["policy", "state"],
              rationale:
                "The fixture source needs object, actor, action, and evidence facets for bounded handoff.",
            },
            required_elements: [
              {
                element_id: "purpose-element-fixture-service",
                element_kind: "object",
                material_facet_kind: "object",
                description: "Fixture service is represented as the target object.",
                actionability_surface_refs: ["static_surface"],
                maturity_dimension_refs: ["structure", "evidence"],
                member_scope_refs: mixedMemberScopeRefs,
                member_target_material_kind: mixedMemberTargetKind,
                member_source_refs: mixedMemberSourceRefs,
                cross_material_ref_refs: mixedMemberSourceRefs,
                supporting_evidence_observation_ids: evidenceObservationIds,
                expected_seed_ref_families: ["semantic_layer.object_types"],
                closure_expectation: "model_or_limit",
              },
              {
                element_id: "purpose-element-fixture-user",
                element_kind: "actor",
                material_facet_kind: "actor",
                description: "Fixture user is represented as the acting principal.",
                actionability_surface_refs: ["dynamic_surface"],
                maturity_dimension_refs: ["context", "relation"],
                member_scope_refs: mixedMemberScopeRefs,
                member_target_material_kind: mixedMemberTargetKind,
                member_source_refs: mixedMemberSourceRefs,
                cross_material_ref_refs: mixedMemberSourceRefs,
                supporting_evidence_observation_ids: evidenceObservationIds,
                expected_seed_ref_families: ["dynamic_layer.actor_types"],
                closure_expectation: "model_or_limit",
              },
              {
                element_id: "purpose-element-explain-fixture",
                element_kind: "action",
                material_facet_kind: "action",
                description:
                  "Explain Fixture is represented as the purpose-supporting action.",
                actionability_surface_refs: ["kinetic_surface"],
                maturity_dimension_refs: ["intent", "relation"],
                member_scope_refs: mixedMemberScopeRefs,
                member_target_material_kind: mixedMemberTargetKind,
                member_source_refs: mixedMemberSourceRefs,
                cross_material_ref_refs: mixedMemberSourceRefs,
                supporting_evidence_observation_ids: evidenceObservationIds,
                expected_seed_ref_families: ["kinetic_layer.action_types"],
                closure_expectation: "model_or_limit",
              },
            ],
          },
          ranking_rationale: "Fixture source names a service object and explanation action.",
          limitation_refs: [],
        },
      ],
      selection: {
        primary_purpose_candidate_id: "purpose-candidate-fixture-service",
        selection_basis: "Fixture direct-call test selected the source-declared purpose.",
        confirmation_policy_hint: "Source-declared purpose does not require confirmation.",
        unresolved_reason: null,
      },
    });
  } else if (systemPrompt.includes("Author candidate-inventory.yaml")) {
    text = JSON.stringify({
      candidates: [
        {
          candidate_id: "candidate-fixture-service",
          candidate_kind: "object",
          name: "Fixture Service",
          description: "A bounded service object grounded in fixture source.",
          salience: "high",
          evidence_observation_ids: evidenceObservationIds,
        },
        {
          candidate_id: "candidate-fixture-user",
          candidate_kind: "actor",
          name: "Fixture User",
          description: "The user who consumes the fixture service explanation.",
          salience: "high",
          evidence_observation_ids: evidenceObservationIds,
        },
        {
          candidate_id: "candidate-explain-fixture",
          candidate_kind: "action",
          name: "Explain Fixture",
          description: "The action of explaining the fixture service.",
          salience: "high",
          evidence_observation_ids: evidenceObservationIds,
        },
        {
          candidate_id: "candidate-fixture-source",
          candidate_kind: "data_source",
          name: "Fixture Source",
          description: "The observed source file backing the fixture seed.",
          salience: "high",
          evidence_observation_ids: evidenceObservationIds,
        },
      ],
    });
  } else if (systemPrompt.includes("Author candidate-disposition.yaml")) {
    text = JSON.stringify({
      dispositions: [
        {
          candidate_id: "candidate-fixture-service",
          disposition_id: "promoted_to_seed_layer",
          target_seed_refs: ["object-fixture-service"],
          rationale: "The fixture service is the main seed object.",
          evidence_observation_ids: evidenceObservationIds,
        },
        {
          candidate_id: "candidate-fixture-user",
          disposition_id: "promoted_to_seed_layer",
          target_seed_refs: ["actor-fixture-user"],
          rationale: "The user is required for action binding.",
          evidence_observation_ids: evidenceObservationIds,
        },
        {
          candidate_id: "candidate-explain-fixture",
          disposition_id: "promoted_to_seed_layer",
          target_seed_refs: ["action-explain-fixture"],
          rationale: "The explanation action connects actor and object.",
          evidence_observation_ids: evidenceObservationIds,
        },
        {
          candidate_id: "candidate-fixture-source",
          disposition_id: "promoted_to_seed_layer",
          target_seed_refs: ["binding-fixture-source"],
          rationale: "The source is represented through data binding.",
          evidence_observation_ids: evidenceObservationIds,
        },
      ],
    });
  } else if (systemPrompt.includes("Author ontology-seed.yaml")) {
    const evidence = {
      observation_id: firstObservationId,
      target_material_kind: firstMaterialKind,
      source_ref: firstSourceRef,
      location: firstSourceRef,
    };
    text = JSON.stringify({
      seed_identity: {
        schema_version: "1",
        seed_id: "seed-fixture-service",
        title: "Fixture Service Actionable Seed",
        target_refs: [firstSourceRef],
        generated_at: "2026-05-29T00:00:00.000Z",
        authoring_profile: {
          profile_id: "fixture-live-author",
          mode: "object-returned-by-host-llm",
        },
      },
      purpose: {
        reconstruct_intent: input.intent ?? "Create a live reconstruct Seed from the code target.",
        declared_purpose: "Explain fixture service structure for bounded handoff.",
        purpose_source_status: "convergent_inferred",
        purpose_evidence_policy: {
          accepted_evidence_kind: "P3 observable purpose support",
          acceptance_basis: "Fixture source observation supports the bounded seed purpose.",
        },
        purpose_confirmation: {
          required: false,
          status: "not_required",
          confirmed_purpose_candidate_id: "purpose-candidate-fixture-service",
          prompt_summary: "Fixture direct-call test does not require user confirmation.",
          user_response_summary: "Not required for fixture direct-call test.",
          source_conflict_policy: "no source conflict observed",
          limitation_refs: [],
        },
        purpose_candidates: [
          {
            purpose_candidate_id: "purpose-candidate-fixture-service",
            statement: "Explain fixture service structure for bounded handoff.",
            rank: "primary",
            purpose_source_status: "convergent_inferred",
            evidence_kind_refs: ["P3", "P4"],
            supporting_source_refs: [firstSourceRef],
            contradicting_source_refs: [],
            adequacy_signal_coverage: {
              material_kind: firstMaterialKind,
              required_facets: ["object", "actor", "action", "evidence"],
              covered_facets: ["object", "actor", "action", "evidence"],
              missing_facets: [],
            },
            ranking_rationale: "Fixture source names a service object and explanation action.",
            limitation_refs: [],
          },
        ],
        purpose_adequacy_frame: {
          frame_id: "purpose-frame-fixture-service",
          name: "Fixture Service Purpose Adequacy",
          frame_kind: "product_operation",
          frame_status: "evidence_inferred",
          adequacy_claim:
            "The seed is adequate when it represents the fixture service, fixture user, explanation action, and source evidence binding.",
          ranking_rationale:
            "The frame follows the observed fixture service object and explanation action.",
          material_kind_requirements: {
            target_material_kind: firstMaterialKind,
            required_facets: ["object", "actor", "action", "evidence"],
            optional_facets: ["policy", "state"],
            rationale:
              "The code fixture needs object, actor, action, and evidence facets for bounded handoff.",
          },
          required_elements: [
            {
              element_id: "purpose-element-fixture-service",
              element_kind: "object",
              description: "Fixture service is represented as the target object.",
              seed_ref_refs: ["object-fixture-service"],
              evidence_refs: [evidence],
              limitation_refs: [],
            },
            {
              element_id: "purpose-element-fixture-user",
              element_kind: "actor",
              description: "Fixture user is represented as the acting principal.",
              seed_ref_refs: ["actor-fixture-user"],
              evidence_refs: [evidence],
              limitation_refs: [],
            },
            {
              element_id: "purpose-element-explain-fixture",
              element_kind: "action",
              description: "Explain Fixture is represented as the purpose-supporting action.",
              seed_ref_refs: ["action-explain-fixture"],
              evidence_refs: [evidence],
              limitation_refs: [],
            },
          ],
          source_refs: [firstSourceRef],
          evidence_refs: [evidence],
          limitation_refs: [],
        },
        secondary_purpose_frames: [],
        intended_decisions: ["Decide whether the fixture service can be explained."],
        intended_actions: ["Explain fixture service structure."],
        non_goals: [],
        evidence_refs: [evidence],
      },
      decision_context: {
        principal_user: "Fixture reviewer",
        downstream_use: "bounded_seed_handoff",
        decision_boundary: "Observed fixture source only.",
        risk_notes: [],
      },
      conceptual_frame: {
        concepts: [
          {
            concept_id: "concept-fixture-service",
            name: "Fixture Service",
            definition: "A bounded fixture service concept.",
            purpose_role: "orients the fixture service seed",
            evidence_refs: [evidence],
            confidence: "confirmed",
          },
        ],
        associations: [],
      },
      semantic_layer: {
        object_types: [
          {
            object_type_id: "object-fixture-service",
            name: "Fixture Service",
            object_kind: "service",
            description: "Service object represented by observed fixture source.",
            primary_key: {
              property_id: "property-fixture-service-id",
              name: "fixture service id",
              value_type: "string",
              evidence_refs: [evidence],
            },
            properties: [],
            backing_source_refs: [firstSourceRef],
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
            action_type_id: "action-explain-fixture",
            name: "Explain Fixture",
            description: "Explain the fixture service.",
            actor_type_ids: ["actor-fixture-user"],
            target_object_type_ids: ["object-fixture-service"],
            affected_object_type_ids: [],
            parameters: [],
            preconditions: [],
            postconditions: [],
            side_effects: [],
            writeback_behavior: {
              writes: false,
              writeback_source_refs: [],
              rationale: "Explanation is read-only.",
            },
            evidence_refs: [evidence],
            status: "confirmed",
          },
        ],
        functions: [],
        workflows: [
          {
            workflow_id: "workflow-explain-fixture",
            name: "Explain Fixture Workflow",
            ordered_action_type_ids: ["action-explain-fixture"],
            trigger: "Fixture reviewer requests explanation.",
            terminal_state: "Fixture explanation is available.",
            evidence_refs: [evidence],
          },
        ],
      },
      dynamic_layer: {
        actor_types: [
          {
            actor_type_id: "actor-fixture-user",
            name: "Fixture User",
            actor_kind: "human_user",
            role_refs: ["role-fixture-reader"],
            description: "User consuming fixture service explanation.",
            evidence_refs: [evidence],
          },
        ],
        actor_roles: [
          {
            role_id: "role-fixture-reader",
            name: "Fixture Reader",
            holder_actor_type_ids: ["actor-fixture-user"],
            authority_scope_refs: [],
            evidence_refs: [evidence],
          },
        ],
        permission_policies: [
          {
            policy_id: "policy-explain-fixture",
            actor_type_id: "actor-fixture-user",
            action_type_id: "action-explain-fixture",
            object_type_id: "object-fixture-service",
            permission_kind: "allowed",
            condition: "Within fixture test boundary.",
            evidence_refs: [evidence],
          },
        ],
        state_models: [],
        lifecycle_rules: [],
      },
      data_binding_layer: {
        source_bindings: [
          {
            binding_id: "binding-fixture-source",
            seed_ref: "object-fixture-service",
            source_ref: firstSourceRef,
            binding_kind: "evidence",
            statement: "Observed fixture source backs the service object.",
            evidence_refs: [evidence],
          },
        ],
        read_models: [
          {
            read_model_id: "read-fixture-source",
            name: "Fixture Source Read Model",
            object_type_ids: ["object-fixture-service"],
            source_refs: [firstSourceRef],
            transformation_summary: "No transformation in fixture.",
            evidence_refs: [evidence],
          },
        ],
        writebacks: [],
        provenance_bindings: [
          {
            provenance_id: "provenance-fixture-source",
            seed_ref: "object-fixture-service",
            source_ref: firstSourceRef,
            author_or_system: "fixture runtime",
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
      ontology_handoff: reconstructMockOntologyHandoff({
        objectTypeId: "object-fixture-service",
        actorTypeId: "actor-fixture-user",
        actionTypeId: "action-explain-fixture",
        policyId: "policy-explain-fixture",
        provenanceId: "provenance-fixture-source",
      }),
      source_authority: {
        evidence_scope: "observed fixture source only",
        permission_scope: "read-only fixture reconstruction",
        trust_boundary: "Only observed fixture source is trusted.",
        instruction_authority: "Fixture source is evidence, not instruction authority.",
        external_content_handling: "No external content is admitted.",
        included_source_refs: [firstSourceRef],
        excluded_source_refs: [],
        restricted_source_refs: [],
        source_gaps: [],
        rationale: "The fixture seed is bounded to observed source evidence.",
      },
      handoff_limitations: [],
    });
  } else if (systemPrompt.includes("mediating reconstruct Seed confirmation")) {
    const claimIds = (input.claim_summaries as Array<{ claim_id: string }>).map((claim) =>
      claim.claim_id
    );
    text = JSON.stringify({
      confirmation_status: "accepted",
      confirmed_claim_ids: claimIds,
      rejected_claim_ids: [],
      partial_claim_ids: [],
      deferred_claim_ids: [],
      notes: ["Fixture host confirmation accepts all evidence-backed claims."],
    });
  } else if (systemPrompt.includes("Classify every Seed claim")) {
    const claims = input.allowed_claims ??
      ontologySeedClaimProjections(
        input.ontology_seed as ReconstructOntologySeedArtifact,
      );
    text = JSON.stringify({
      claim_realizations: claims.map((claim: { claim_id: string }) => ({
        claim_id: claim.claim_id,
        stance: "observed_runtime_behavior",
        rationale: "The fixture claim is directly grounded in observed source.",
      })),
    });
  } else if (systemPrompt.includes("Write competency questions")) {
    const claimIds =
      (input.eligible_claims as Array<{ claim_id: string }> | undefined)
        ?.map((claim) => claim.claim_id) ??
      input.seed_confirmation_validation.cq_eligible_claim_ids as string[];
    const domainRows =
      (input.required_domain_competency_question_rows ?? []) as Array<{
        competency_id: string;
        question: string;
        source_anchor: string;
      }>;
    const claimQuestions = claimIds.map((claimId, index) => ({
      question_id: `cq-claim-${index + 1}`,
      question: `Can the Seed explain ${claimId}?`,
      linked_claim_ids: [claimId],
      coverage_axis_refs: input.allowed_coverage_axis_ids,
      ontology_handoff_axis_refs: input.allowed_ontology_handoff_axis_ids,
      seed_ref_refs: [claimId],
      limitation_refs: [],
      reasoning_or_formalism_facets:
        input.allowed_reasoning_or_formalism_facet_ids,
      entity_identity_facets: input.allowed_entity_identity_facet_ids,
      instance_assertion_facets: input.allowed_instance_assertion_facet_ids,
      terminology_facets: input.allowed_terminology_facet_ids,
      relation_type_facets: input.allowed_relation_type_facet_ids,
      classification_facets: input.allowed_classification_facet_ids,
      constraint_facets: input.allowed_constraint_facet_ids,
      modeling_concern_facets: input.allowed_modeling_concern_ids,
      domain_competency_trace_refs: [],
      domain_competency_semantic_assessments: [],
      reference_standard_refs: [],
      pattern_catalog_refs: [],
      query_access_contract_refs: [],
      visualization_contract_refs: [],
      graph_exploration_contract_refs: [],
      coverage_disposition: "covered",
      expected_answer_kind: "yes_no",
      handoff_relevance: "required",
      lifecycle_status: "active",
      rationale: "The fixture question covers the claim and registry facets.",
      evidence_observation_ids: [firstObservationId],
    }));
    const domainQuestions = domainRows.map((row, index) => ({
      question_id: `cq-domain-${index + 1}`,
      question: row.question,
      linked_claim_ids: [],
      coverage_axis_refs: input.allowed_coverage_axis_ids,
      ontology_handoff_axis_refs: input.allowed_ontology_handoff_axis_ids,
      seed_ref_refs: [],
      limitation_refs: [],
      reasoning_or_formalism_facets:
        input.allowed_reasoning_or_formalism_facet_ids,
      entity_identity_facets: input.allowed_entity_identity_facet_ids,
      instance_assertion_facets: input.allowed_instance_assertion_facet_ids,
      terminology_facets: input.allowed_terminology_facet_ids,
      relation_type_facets: input.allowed_relation_type_facet_ids,
      classification_facets: input.allowed_classification_facet_ids,
      constraint_facets: input.allowed_constraint_facet_ids,
      modeling_concern_facets: input.allowed_modeling_concern_ids,
      domain_competency_trace_refs: [row.competency_id],
      domain_competency_semantic_assessments: [
        {
          competency_id: row.competency_id,
          source_anchor: row.source_anchor,
          applicability_verdict: "applicable",
          semantic_alignment: "preserved",
          rationale: "The fixture source preserves this admitted domain competency.",
          evidence_observation_ids: [firstObservationId],
        },
      ],
      reference_standard_refs: [],
      pattern_catalog_refs: [],
      query_access_contract_refs: [],
      visualization_contract_refs: [],
      graph_exploration_contract_refs: [],
      coverage_disposition: "covered",
      expected_answer_kind: "yes_no",
      handoff_relevance: "required",
      lifecycle_status: "active",
      rationale: "The fixture question covers an admitted domain competency.",
      evidence_observation_ids: [firstObservationId],
    }));
    text = JSON.stringify({
      questions: [...claimQuestions, ...domainQuestions],
      open_questions: [],
    });
  } else if (systemPrompt.includes("Assess every competency question")) {
    text = JSON.stringify({
      assessments: (input.competency_questions.questions as Array<{ question_id: string }>).map((question) => ({
        question_id: question.question_id,
        answer_status: "answerable",
        rationale: "The fixture evidence answers this question.",
      })),
    });
  } else if (systemPrompt.includes("Classify unsafe or incomplete assessments")) {
    text = JSON.stringify({ failures: [] });
  } else if (systemPrompt.includes("Propose bounded ontology actions")) {
    text = JSON.stringify({ proposals: [] });
  } else if (systemPrompt.includes("Decide whether the current reconstructed result")) {
    const allowedDecision = (input.allowed_decisions as string[] | undefined)?.[0] ??
      "stop";
    text = JSON.stringify({
      decision: allowedDecision,
      rationale: "The fixture follows the runtime-provided allowed decision boundary.",
      next_actions: allowedDecision === "stop" ? [] : ["Continue maturation."],
    });
  } else if (systemPrompt.includes("Author maturation-question-frontier.yaml")) {
    text = JSON.stringify({ questions: [] });
  } else if (systemPrompt.includes("Author maturation-closure-frontier.yaml")) {
    text = JSON.stringify({
      source_requests: [],
      authority_requests: [],
    });
  } else if (systemPrompt.includes("Author answer-support-ledger.yaml")) {
    text = JSON.stringify({
      evidence_clusters: [],
    });
  } else if (systemPrompt.includes("Author answer-support-judgment.yaml")) {
    // Mirrors the judge author payload shape: per-cluster
    // {evidence_cluster_id, evidence_observation_ids}. Returns one supported
    // judgment per cited evidence to exercise the supported path deterministically.
    const judgeClusters = (input.evidence_clusters ?? []) as Array<{
      evidence_cluster_id: string;
      evidence_observation_ids?: string[];
    }>;
    text = JSON.stringify({
      judgments: judgeClusters.flatMap((cluster) =>
        (cluster.evidence_observation_ids ?? []).map((observationId, index) => ({
          judgment_id: `${cluster.evidence_cluster_id}-judgment-${index + 1}`,
          evidence_cluster_ref: cluster.evidence_cluster_id,
          evidence_observation_id: observationId,
          supports: "supported",
          rationale_ref: `rationale:${cluster.evidence_cluster_id}:${observationId}`,
        }))
      ),
    });
  } else if (systemPrompt.includes("Author maturation-answer-claims.yaml")) {
    text = JSON.stringify({
      answer_claims: [],
    });
  } else if (systemPrompt.includes("Author ontology-expansion.yaml")) {
    text = JSON.stringify({
      expansions: [],
    });
  } else if (systemPrompt.includes("Read provisional column labels for a low-confidence")) {
    // P1-C2-A §11 R10 / P1-C2-B′ §3: the leaf-reader (CAPTURE) fixture branch. Returns one
    // provisional label per known column PLUS a deterministic capture (role/note) so the generalized
    // capture path is exercised. The mock model_id is a constant ("reconstruct-mock-model" in the
    // result below), so the model-identity-rotation test must mutate the PRODUCTION LlmCallConfig,
    // never this constant (avoids CG-2 contamination).
    const columns = (input.columns ?? []) as Array<{ column_index: number }>;
    // Deterministic role rotation across the bounded vocabulary (mock only — no domain meaning).
    const mockRoles = ["category", "measure", "identifier", "free_text", "reference"] as const;
    text = JSON.stringify({
      labels: columns.map((column, i) => ({
        column_index: column.column_index,
        tentative_label: `provisional column ${column.column_index}`,
        semantic_role: mockRoles[i % mockRoles.length],
        captured_note: `mock capture for column ${column.column_index}`,
      })),
      unread_columns: [],
    });
  } else if (systemPrompt.includes("writing the final reconstruct result")) {
    text = [
      "# Reconstruct Result",
      `Execution profile: ${input.execution_profile.profile_kind}`,
      "The runtime footer should add exact artifact truth refs.",
    ].join("\n");
  } else {
    throw new Error(`Unexpected reconstruct mock LLM prompt: ${systemPrompt.slice(0, 80)}`);
  }
  return Promise.resolve({
    text,
    input_tokens: 1,
    output_tokens: 1,
    model_id: "reconstruct-mock-model",
    effective_base_url: "mock://reconstruct",
    declared_billing_mode: "local",
  });
}
