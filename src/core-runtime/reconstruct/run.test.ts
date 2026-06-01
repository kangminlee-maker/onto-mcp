import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructOntologySeedValidationArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructLensJudgmentArtifact,
  ReconstructRecordArtifact,
  ReconstructCompetencyQuestionsValidationArtifact,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMetricsArtifact,
  ReconstructRunManifestArtifact,
  ReconstructRunManifestValidationArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructStopDecisionArtifact,
} from "./artifact-types.js";
import {
  createAutoAcceptReconstructConfirmationProvider,
  createDirectCallReconstructConfirmationProvider,
  createDirectCallReconstructDirectiveAuthor,
  createMockReconstructDirectiveAuthor,
  runReconstruct,
} from "./run.js";
import type { ReconstructConfirmationProvider } from "./run.js";
import {
  ontologySeedClaimProjections,
} from "./seed-claim-projections.js";
import type { LlmCallResult } from "../llm/llm-caller.js";

const tmpRoots: string[] = [];

async function tempProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-run-"));
  tmpRoots.push(root);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src", "feature.ts"),
    "export function featureName(): string {\n  return 'reconstruct';\n}\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "schedule.csv"),
    "month,revenue\n2026-01,100\n",
    "utf8",
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

async function readYaml<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function ontologyHandoffFixture(args: {
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

describe("runReconstruct", () => {
  it("compacts lens judgment payloads before exploration synthesis", async () => {
    let capturedPayload: Record<string, any> | null = null;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: (systemPrompt, userPrompt) => {
        expect(systemPrompt).toContain("Integrate reconstruct lens judgments");
        capturedPayload = JSON.parse(userPrompt) as Record<string, any>;
        return Promise.resolve({
          text: JSON.stringify({
            accepted_gaps: [
              {
                gap_id: "gap-1",
                lens_id: "semantics",
                description: "Observed semantic gap.",
                evidence_observation_ids: ["obs-1", "obs-missing"],
              },
            ],
            requested_source_refs: [],
            no_next_frontier_rationale: "No next frontier in fixture.",
          }),
          input_tokens: 1,
          output_tokens: 1,
          model_id: "fake-live-model",
          effective_base_url: "test://fake-live",
          declared_billing_mode: "local",
        });
      },
    });
    const lensJudgments: ReconstructLensJudgmentArtifact[] = [
      {
        schema_version: "1",
        session_id: "session-1",
        round_id: "round-1",
        lens_id: "semantics",
        created_at: "2026-05-28T00:00:00.000Z",
        source_observation_directive_ref: "source-observation-directive.yaml",
        candidate_labels: [
          {
            label_id: "label-1",
            label: "Usage Dashboard",
            evidence_refs: [
              {
                observation_id: "obs-1",
                target_material_kind: "code",
                source_ref: "src/app/page.tsx",
                location: "file",
              },
            ],
            rationale: "The dashboard page exposes user-facing service structure.",
          },
        ],
        semantic_gaps: [
          {
            gap_id: "gap-1",
            description: "Aggregation ownership needs confirmation.",
            evidence_refs: [
              {
                observation_id: "obs-1",
                target_material_kind: "code",
                source_ref: "src/app/page.tsx",
                location: "file",
              },
            ],
            requested_source_refs: ["src/services/usage-mart.service.ts"],
            materiality_rationale: "The gap affects service structure claims.",
          },
        ],
        no_next_frontier_rationale: null,
        directive_author: {
          owner: "host_llm",
          author_id: "fixture-author",
        },
      },
    ];

    const result = await author.writeExplorationSynthesis({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      roundId: "round-1",
      lensJudgmentIndexRef: "lens-judgment-index.yaml",
      lensJudgments,
      sourceObservations: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        observations: [
          {
            observation_id: "obs-1",
            target_material_kind: "code",
            adapter_id: "fixture-observer",
            source_ref: "src/app/page.tsx",
            location: "file",
            summary: "Dashboard page fixture.",
            structural_data: {},
          },
        ],
        skipped_refs: [],
        validation_results: [],
      },
      sourceObservationsRef: "source-observations.yaml",
    });

    expect(capturedPayload?.lens_judgments).toEqual([
      {
        lens_id: "semantics",
        candidate_labels: [
          {
            label_id: "label-1",
            label: "Usage Dashboard",
            evidence_observation_ids: ["obs-1"],
            rationale: "The dashboard page exposes user-facing service structure.",
          },
        ],
        semantic_gaps: [
          {
            gap_id: "gap-1",
            description: "Aggregation ownership needs confirmation.",
            evidence_observation_ids: ["obs-1"],
            requested_source_refs: ["src/services/usage-mart.service.ts"],
            materiality_rationale: "The gap affects service structure claims.",
          },
        ],
        no_next_frontier_rationale: null,
      },
    ]);
    expect(JSON.stringify(capturedPayload)).not.toContain("evidence_refs");
    expect(result.accepted_gaps[0]?.evidence_refs).toEqual([
      {
        observation_id: "obs-1",
        target_material_kind: "code",
        source_ref: "src/app/page.tsx",
        location: "file",
      },
    ]);
  });

  it("canonicalizes duplicate direct-call source observation selections", async () => {
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () =>
        Promise.resolve({
          text: JSON.stringify({
            selected_observations: [
              {
                observation_id: "obs-1",
                selection_rationale: "Shows the dashboard actor.",
              },
              {
                observation_id: "obs-1",
                selection_rationale: "Shows the dashboard workflow.",
              },
            ],
            open_questions: [],
          }),
        } satisfies LlmCallResult),
    });

    const result = await author.writeSourceObservationDirective({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      targetMaterialProfile: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        target_refs: ["src/app/page.tsx"],
        target_material_kind: "code",
        target_material_kind_candidates: ["code"],
        support_status: "partial",
        unsupported_reason: null,
        selected_source_profiles: [],
        detection: {
          owner: "runtime_heuristic",
          confidence: 0.92,
          confidence_basis: "fixture",
          per_ref: [],
        },
      },
      sourceObservations: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        observations: [
          {
            observation_id: "obs-1",
            target_material_kind: "code",
            adapter_id: "fixture-observer",
            source_ref: "src/app/page.tsx",
            location: "file",
            summary: "Dashboard page fixture.",
            structural_data: {},
          },
        ],
        skipped_refs: [],
        validation_results: [],
      },
    });

    expect(result.selected_observations).toHaveLength(1);
    expect(result.selected_observations[0]).toMatchObject({
      observation_id: "obs-1",
      selection_rationale:
        "Shows the dashboard actor. | Shows the dashboard workflow.",
    });
  });

  it("repairs malformed direct-call JSON once before schema coercion", async () => {
    let callCount = 0;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: (systemPrompt) => {
        callCount += 1;
        if (systemPrompt.includes("Repair malformed JSON")) {
          return Promise.resolve({
            text: JSON.stringify({
              selected_observations: [
                {
                  observation_id: "obs-1",
                  selection_rationale: "Shows the dashboard actor.",
                },
              ],
              open_questions: [],
            }),
          } satisfies LlmCallResult);
        }
        return Promise.resolve({
          text:
            "{\"selected_observations\":[{\"observation_id\":\"obs-1\",\"selection_rationale\":\"Shows the dashboard actor.\"}],\"open_questions\":[\"unfinished\" \\u0635}",
        } satisfies LlmCallResult);
      },
    });

    const result = await author.writeSourceObservationDirective({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      targetMaterialProfile: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        target_refs: ["src/app/page.tsx"],
        target_material_kind: "code",
        target_material_kind_candidates: ["code"],
        support_status: "partial",
        unsupported_reason: null,
        selected_source_profiles: [],
        detection: {
          owner: "runtime_heuristic",
          confidence: 0.92,
          confidence_basis: "fixture",
          per_ref: [],
        },
      },
      sourceObservations: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        observations: [
          {
            observation_id: "obs-1",
            target_material_kind: "code",
            adapter_id: "fixture-observer",
            source_ref: "src/app/page.tsx",
            location: "file",
            summary: "Dashboard page fixture.",
            structural_data: {},
          },
        ],
        skipped_refs: [],
        validation_results: [],
      },
    });

    expect(callCount).toBe(2);
    expect(result.selected_observations).toHaveLength(1);
    expect(result.selected_observations[0]?.observation_id).toBe("obs-1");
  });

  it("drops ungrounded direct-call lens rows", async () => {
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () =>
        Promise.resolve({
          text: JSON.stringify({
            candidate_labels: [
              {
                label_id: "label-grounded",
                label: "Grounded label",
                evidence_observation_ids: ["obs-1"],
                rationale: "Grounded in the fixture observation.",
              },
              {
                label_id: "label-ungrounded",
                label: "Ungrounded label",
                evidence_observation_ids: [],
                rationale: "No evidence.",
              },
            ],
            semantic_gaps: [
              {
                gap_id: "gap-ungrounded",
                description: "No evidence-backed gap.",
                evidence_observation_ids: [],
                requested_source_refs: ["docs/missing.md"],
                materiality_rationale: "No evidence.",
              },
            ],
            no_next_frontier_rationale: "No grounded next frontier.",
          }),
        } satisfies LlmCallResult),
    });
    const sourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-28T00:00:00.000Z",
      observations: [
        {
          observation_id: "obs-1",
          target_material_kind: "code",
          adapter_id: "fixture-observer",
          source_ref: "src/app/page.tsx",
          location: "file",
          summary: "Dashboard page fixture.",
          structural_data: {},
        },
      ],
      skipped_refs: [],
      validation_results: [],
    };

    const result = await author.writeLensJudgment({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      roundId: "round-1",
      lensId: "logic",
      lensPrompt: "Check grounding.",
      sourceObservations,
      sourceObservationDirective: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        selected_observations: [
          {
            observation_id: "obs-1",
            target_material_kind: "code",
            source_ref: "src/app/page.tsx",
            location: "file",
            selection_rationale: "Fixture evidence.",
          },
        ],
        open_questions: [],
      },
      sourceObservationDirectiveRef: "source-observation-directive.yaml",
    });

    expect(result.candidate_labels.map((label) => label.label_id))
      .toEqual(["label-grounded"]);
    expect(result.semantic_gaps).toEqual([]);
  });

  it("normalizes evidence-free claim realizations to deferred", async () => {
    const evidence = {
      observation_id: "obs-1",
      target_material_kind: "code" as const,
      source_ref: "src/app/page.tsx",
      location: "file",
    };
    let capturedPayload: Record<string, any> | null = null;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: (_systemPrompt, userPrompt) => {
        capturedPayload = JSON.parse(userPrompt) as Record<string, any>;
        return Promise.resolve({
          text: JSON.stringify({
            claim_realizations: (
              capturedPayload.allowed_claims as Array<{ claim_id: string }>
            ).map((claim) => ({
              claim_id: claim.claim_id,
              stance: "observed_runtime_behavior",
              rationale: "Fixture author attempted to overstate every claim.",
            })),
          }),
          input_tokens: 1,
          output_tokens: 1,
          model_id: "fake-live-model",
          effective_base_url: "test://fake-live",
          declared_billing_mode: "local",
        });
      },
    });
    const ontologySeed: ReconstructOntologySeedArtifact = {
      seed_identity: {
        schema_version: "1",
        seed_id: "seed-1",
        title: "Fixture Seed",
        target_refs: ["src/app/page.tsx"],
        generated_at: "2026-05-29T00:00:00.000Z",
        authoring_profile: "test",
      },
      purpose: {
        declared_purpose: "Explain fixture behavior.",
        intended_decisions: ["Decide whether fixture behavior can be explained."],
        intended_actions: ["Explain fixture behavior."],
        non_goals: [],
        evidence_refs: [evidence],
      },
      handoff_limitations: [
        {
          limitation_id: "limitation-no-evidence",
          limitation_kind: "boundary_gap",
          description: "A limitation with no projected source evidence.",
          affected_refs: [],
          mitigation_or_next_action: "Defer until source evidence exists.",
          evidence_refs: [],
        },
      ],
    };
    const ontologySeedValidation: ReconstructOntologySeedValidationArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      ontology_seed_ref: "ontology-seed.yaml",
      candidate_disposition_ref: "candidate-disposition.yaml",
      source_observations_ref: "source-observations.yaml",
      registry_ref: "reconstruct-contract-registry.yaml",
      validation_status: "valid",
      seed_ref_count: 2,
      evidence_ref_count: 1,
      limitation_count: 1,
      validation_results: ["ontology_seed_valid"],
      violations: [],
    };
    const sourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      observations: [
        {
          observation_id: "obs-1",
          target_material_kind: "code",
          adapter_id: "fixture-observer",
          source_ref: "src/app/page.tsx",
          location: "file",
          summary: "Dashboard page fixture.",
          structural_data: {},
        },
      ],
      skipped_refs: [],
      validation_results: [],
    };

    const result = await author.writeClaimRealizationMap({
      sessionId: "session-1",
      ontologySeed,
      ontologySeedRef: "ontology-seed.yaml",
      ontologySeedValidation,
      sourceObservations,
    });

    expect(capturedPayload?.allowed_claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim_id: "limitation-no-evidence",
          evidence_observation_ids: [],
        }),
      ]),
    );
    expect(result.claim_realizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim_id: "seed-1#purpose",
          stance: "observed_runtime_behavior",
          evidence_refs: [evidence],
        }),
        expect.objectContaining({
          claim_id: "limitation-no-evidence",
          stance: "deferred_or_non_goal",
          evidence_refs: [],
          rationale: expect.stringContaining("Runtime normalized"),
        }),
      ]),
    );
  });

  it("moves linked handoff limitation ids into competency question limitation refs", async () => {
    const evidence = {
      observation_id: "obs-1",
      target_material_kind: "code" as const,
      source_ref: "src/app/page.tsx",
      location: "file",
    };
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () =>
        Promise.resolve({
          text: JSON.stringify({
            questions: [
              {
                question_id: "cq-overlinked",
                question: "Can the seed explain fixture behavior with its limitation?",
                linked_claim_ids: ["seed-1#purpose", "limitation-no-evidence"],
                coverage_axis_refs: ["purpose"],
                ontology_handoff_axis_refs: ["classification"],
                seed_ref_refs: [
                  "seed-1#purpose",
                  "ontology_handoff.classification_mapping",
                ],
                limitation_refs: [],
                reasoning_or_formalism_facets: [],
                entity_identity_facets: [],
                instance_assertion_facets: [],
                terminology_facets: [],
                relation_type_facets: [],
                classification_facets: [],
                constraint_facets: [],
                modeling_concern_facets: [],
                domain_competency_trace_refs: ["domain:ontology#CQ-1"],
                domain_competency_semantic_assessments: [
                  {
                    competency_id: "domain:ontology#CQ-1",
                    source_anchor: "wrong source anchor",
                    applicability_verdict: "applicable",
                    semantic_alignment: "preserved",
                    rationale: "The question evidence also grounds this assessment.",
                    evidence_observation_ids: [],
                  },
                ],
                reference_standard_refs: [],
                pattern_catalog_refs: [],
                query_access_contract_refs: [],
                visualization_contract_refs: [],
                graph_exploration_contract_refs: [],
                coverage_disposition: "limited",
                expected_answer_kind: "explanation",
                handoff_relevance: "required",
                lifecycle_status: "active",
                rationale: "The limitation bounds the question.",
                evidence_observation_ids: ["obs-1"],
              },
            ],
            open_questions: [],
          }),
          input_tokens: 1,
          output_tokens: 1,
          model_id: "fake-live-model",
          effective_base_url: "test://fake-live",
          declared_billing_mode: "local",
        }),
    });
    const ontologySeed: ReconstructOntologySeedArtifact = {
      seed_identity: {
        schema_version: "1",
        seed_id: "seed-1",
        title: "Fixture Seed",
        target_refs: ["src/app/page.tsx"],
        generated_at: "2026-05-29T00:00:00.000Z",
        authoring_profile: "test",
      },
      purpose: {
        declared_purpose: "Explain fixture behavior.",
        intended_decisions: ["Decide whether fixture behavior can be explained."],
        intended_actions: ["Explain fixture behavior."],
        non_goals: [],
        evidence_refs: [evidence],
      },
      handoff_limitations: [
        {
          limitation_id: "limitation-no-evidence",
          limitation_kind: "boundary_gap",
          description: "A limitation with no projected source evidence.",
          affected_refs: [],
          mitigation_or_next_action: "Defer until source evidence exists.",
          evidence_refs: [],
        },
      ],
    };
    const sourceObservations: ReconstructSourceObservationsArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: "2026-05-29T00:00:00.000Z",
      observations: [
        {
          observation_id: "obs-1",
          target_material_kind: "code",
          adapter_id: "fixture-observer",
          source_ref: "src/app/page.tsx",
          location: "file",
          summary: "Dashboard page fixture.",
          structural_data: {},
        },
      ],
      skipped_refs: [],
      validation_results: [],
    };

    const result = await author.writeCompetencyQuestions({
      sessionId: "session-1",
      ontologySeed,
      ontologySeedRef: "ontology-seed.yaml",
      ontologySeedValidation: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        ontology_seed_ref: "ontology-seed.yaml",
        candidate_disposition_ref: "candidate-disposition.yaml",
        source_observations_ref: "source-observations.yaml",
        registry_ref: "reconstruct-contract-registry.yaml",
        validation_status: "valid",
        seed_ref_count: 2,
        evidence_ref_count: 1,
        limitation_count: 1,
        validation_results: ["ontology_seed_valid"],
        violations: [],
      },
      seedConfirmationValidation: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        seed_confirmation_ref: "seed-confirmation.yaml",
        ontology_seed_ref: "ontology-seed.yaml",
        ontology_seed_validation_ref: "ontology-seed-validation.yaml",
        validation_status: "valid",
        accepted_claim_ids: ["seed-1#purpose", "limitation-no-evidence"],
        rejected_claim_ids: [],
        partial_claim_ids: [],
        deferred_claim_ids: [],
        cq_eligible_claim_ids: ["seed-1#purpose"],
        validation_results: ["seed_confirmation_valid"],
        violations: [],
      },
      seedConfirmationValidationRef: "seed-confirmation-validation.yaml",
      claimRealizationMap: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-29T00:00:00.000Z",
        ontology_seed_ref: "ontology-seed.yaml",
        claim_realizations: [],
        directive_author: {
          owner: "host_llm",
          author_id: "fixture-author",
        },
      },
      sourceObservations,
      sourceObservationsRef: "source-observations.yaml",
      contractRegistry: {
        coverage_axis_registry: [{ axis_id: "purpose" }],
        ontology_handoff_axis_registry: [{ axis_id: "classification" }],
        reference_standard_registry: [],
        reference_pattern_catalog_registry: [],
        reasoning_or_formalism_facet_registry: [],
        entity_identity_facet_registry: [],
        instance_assertion_facet_registry: [],
        terminology_facet_registry: [],
        relation_type_facet_registry: [],
        classification_facet_registry: [],
        constraint_facet_registry: [],
        modeling_concern_applicability_registry: [],
        query_access_contract_registry: [],
        visualization_contract_registry: [],
        graph_exploration_contract_registry: [],
      } as any,
      governingSnapshot: {
        required_admitted_competency_ids: ["domain:ontology#CQ-1"],
        admitted_domain_competency_refs: ["domain:ontology"],
        admitted_domain_competency_source_refs: ["user:domain:ontology/competency_qs.md"],
        admitted_competency_priorities: {
          "domain:ontology#CQ-1": "MUST",
        },
        admitted_domain_competency_snapshots: [
          {
            domain_id: "domain:ontology",
            source_ref: "user:domain:ontology/competency_qs.md",
            source_sha256: "fixture",
            competency_parser_version: "fixture",
            admission_policy: "fixture",
            admitted_competencies: [
              {
                competency_id: "CQ-1",
                qualified_competency_id: "domain:ontology#CQ-1",
                priority: "MUST",
                question: "Can the seed answer the fixture domain question?",
                section_heading: "Fixture",
                inference_path: "fixture",
                verification_criteria: "fixture",
                source_anchor: "fixture#CQ-1",
              },
            ],
            required_admitted_competency_ids: ["domain:ontology#CQ-1"],
            admitted_competency_priorities: {
              "domain:ontology#CQ-1": "MUST",
            },
            competency_id_migration_mappings: [],
          },
        ],
      } as any,
    });

    expect(result.questions[0]).toMatchObject({
      linked_claim_ids: ["seed-1#purpose"],
      seed_ref_refs: ["seed-1#purpose"],
      limitation_refs: ["limitation-no-evidence"],
      evidence_refs: [evidence],
    });
    expect(result.questions[0]?.domain_competency_semantic_assessments[0])
      .toMatchObject({
        competency_id: "domain:ontology#CQ-1",
        source_anchor: "fixture#CQ-1",
        evidence_refs: [evidence],
      });
  });

  it("closes direct-call source frontier on the final exploration round", async () => {
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: () =>
        Promise.resolve({
          text: JSON.stringify({
            frontier_refs: [
              {
                source_ref: "docs/extra.md",
                rationale: "A model may still want additional source.",
                priority: "high",
              },
            ],
            no_next_frontier_rationale: null,
          }),
        } satisfies LlmCallResult),
    });

    const result = await author.writeSourceFrontier({
      sessionId: "session-1",
      intent: "Create a bounded reconstruct Seed.",
      roundId: "round-5",
      maxExplorationRounds: 5,
      isFinalExplorationRound: true,
      explorationSynthesisRef: "exploration-synthesis.yaml",
      explorationSynthesis: {
        schema_version: "1",
        session_id: "session-1",
        round_id: "round-5",
        created_at: "2026-05-28T00:00:00.000Z",
        lens_judgment_index_ref: "lens-judgment-index.yaml",
        accepted_gaps: [],
        requested_source_refs: [],
        no_next_frontier_rationale: null,
        directive_author: {
          owner: "host_llm",
          author_id: "fixture-author",
        },
      },
      sourceInventory: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        inventory_units: [
          {
            ref: "docs/extra.md",
            exists: true,
            target_material_kind: "document",
            inventory_unit: "section_heading_or_document_unit",
            profile_ref: null,
            scan_status: "planned",
            skip_reason: null,
          },
        ],
        scan_boundary: {
          filesystem_allowed_roots: [],
          source: "binding",
        },
      },
      sourceObservations: {
        schema_version: "1",
        session_id: "session-1",
        created_at: "2026-05-28T00:00:00.000Z",
        observations: [],
        skipped_refs: [],
        validation_results: [],
      },
    });

    expect(result.frontier_refs).toEqual([]);
    expect(result.no_next_frontier_rationale).toContain(
      "Final exploration round round-5 reached the configured max_rounds=5",
    );
  });

  function fakeLiveLlm(systemPrompt: string, userPrompt: string): Promise<LlmCallResult> {
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
    } else if (systemPrompt.includes("Integrate reconstruct lens judgments")) {
      text = JSON.stringify({
        accepted_gaps: [],
        requested_source_refs: [],
        no_next_frontier_rationale: "All fixture evidence needed for the Seed is present.",
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
          authoring_profile: "fixture-live-author",
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
        ontology_handoff: ontologyHandoffFixture({
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
      const claims = ontologySeedClaimProjections(
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
      text = JSON.stringify({
        decision: "stop",
        rationale: "The fixture has no unresolved questions.",
        next_actions: [],
      });
    } else if (systemPrompt.includes("Author maturation-closure-frontier.yaml")) {
      text = JSON.stringify({
        source_requests: [],
        authority_requests: [],
      });
    } else if (systemPrompt.includes("Author answer-support-ledger.yaml")) {
      text = JSON.stringify({
        evidence_clusters: [],
      });
    } else if (systemPrompt.includes("Author maturation-answer-claims.yaml")) {
      text = JSON.stringify({
        answer_claims: [],
      });
    } else if (systemPrompt.includes("Author ontology-expansion.yaml")) {
      text = JSON.stringify({
        expansions: [],
      });
    } else if (systemPrompt.includes("writing the final reconstruct result")) {
      text = [
        "# Reconstruct Result",
        `Execution profile: ${input.execution_profile.profile_kind}`,
        "The runtime footer should add exact artifact truth refs.",
      ].join("\n");
    } else {
      throw new Error(`Unexpected fake live LLM prompt: ${systemPrompt.slice(0, 80)}`);
    }
    return Promise.resolve({
      text,
      input_tokens: 1,
      output_tokens: 1,
      model_id: "fake-live-model",
      effective_base_url: "test://fake-live",
      declared_billing_mode: "local",
    });
  }

  it("runs the material-aware purpose adequacy path for the first code fixture", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "code-run");

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a bounded reconstruct Seed from the code target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "mock",
      confirmationProviderRealization: "mock",
      directiveAuthor: createMockReconstructDirectiveAuthor(),
      confirmationProvider: createAutoAcceptReconstructConfirmationProvider(),
    });

    expect(result.status).toBe("completed");
    expect(result.reconstructRecord.record_stage).toBe("completed");
    expect(result.reconstructRecord.target_material_kind).toBe("code");
    expect(result.reconstructRecord.runtime_boundary.semantic_generation)
      .toBe("not_performed");
    expect(result.reconstructRecord.runtime_boundary.runtime_owned_gates)
      .not.toContain("seed_confirmation");
    expect(result.reconstructRecord.runtime_boundary.host_user_mediated_artifacts)
      .toContain("seed_confirmation");
    expect(result.metrics.pass_rate).toBe(1);
    expect(result.metrics.confirmed_claim_count).toBeGreaterThan(0);
    expect(result.metrics.partial_claim_count).toBe(0);
    expect(result.metrics.deferred_claim_count).toBe(0);
    expect(result.metrics.rejected_claim_count).toBe(0);
    expect(result.metrics.competency_question_assessment_count)
      .toBe(result.metrics.competency_question_count);
    expect(result.metrics.failure_kind_counts.insufficient_evidence).toBe(0);
    expect(result.metrics.revision_proposal_action_counts.extend).toBe(0);
    expect(result.stopDecision.decision).toBe("stop");
    expect(result.finalOutputText).toContain("Confirmed Seed Content");
    expect(result.finalOutputText).toContain("Claim Realization Summary");
    expect(result.finalOutputText).toContain("Competency Question Assessment");
    expect(result.finalOutputText).toContain("Failure Classifications");
    expect(result.finalOutputText).toContain("Revision Proposals");

    const record = await readYaml<ReconstructRecordArtifact>(
      result.reconstructRecordPath,
    );
    const manifest = await readYaml<ReconstructRunManifestArtifact>(
      result.reconstructRunManifestPath,
    );
    const runManifestValidation =
      await readYaml<ReconstructRunManifestValidationArtifact>(
        record.artifact_refs.post_publication_run_manifest_validation!,
      );
    const handoffDecisionValidation =
      await readYaml<ReconstructHandoffDecisionValidationArtifact>(
        record.artifact_refs.handoff_decision_validation!,
      );
    const preHandoffManifest = await readYaml<ReconstructRunManifestArtifact>(
      path.join(sessionRoot, "reconstruct-run-manifest.pre-handoff.yaml"),
    );
    const preHandoffRunManifestValidation =
      await readYaml<ReconstructRunManifestValidationArtifact>(
        path.join(sessionRoot, "reconstruct-run-manifest.pre-handoff-validation.yaml"),
      );
    const candidateDispositionValidation =
      await readYaml<ReconstructCandidateDispositionValidationArtifact>(
        record.artifact_refs.candidate_disposition_validation!,
      );

    expect(record.artifact_refs.final_output).toBe(result.finalOutputPath);
    expect(record.artifact_refs.reconstruct_run_manifest)
      .toBe(result.reconstructRunManifestPath);
    expect(record.artifact_refs.pre_handoff_run_manifest_validation)
      .toContain("reconstruct-run-manifest.pre-handoff-validation.yaml");
    expect(record.artifact_refs.post_publication_run_manifest_validation)
      .toContain("reconstruct-run-manifest.post-publication-validation.yaml");
    expect(record.artifact_refs.handoff_decision_validation)
      .toContain("handoff-decision-validation.yaml");
    expect(record.artifact_refs.final_output_provenance_validation)
      .toContain("final-output-provenance-validation.yaml");
    expect(record.validation_summary).toMatchObject({
      target_material_profile_status: "valid",
      source_observation_directive_status: "valid",
      candidate_disposition_status: "valid",
      ontology_seed_status: "valid",
      claim_realization_status: "valid",
      seed_confirmation_status: "accepted",
      pre_handoff_run_manifest_status: "valid",
      post_publication_run_manifest_status: "valid",
      handoff_decision_status: "valid",
    });
    expect(runManifestValidation.validation_status).toBe("valid");
    expect(runManifestValidation.reconstruct_run_manifest_ref)
      .toBe(result.reconstructRunManifestPath);
    expect(preHandoffRunManifestValidation.reconstruct_run_manifest_ref)
      .toContain("reconstruct-run-manifest.pre-handoff.yaml");
    expect(handoffDecisionValidation.validation_status).toBe("valid");
    expect(handoffDecisionValidation.stop_decision_ref)
      .toContain("stop-decision.yaml");
    expect(handoffDecisionValidation.readiness_projection_source)
      .toBe("runtime_gate_projection");
    expect(handoffDecisionValidation.pre_handoff_run_manifest_validation_ref)
      .toContain("reconstruct-run-manifest.pre-handoff-validation.yaml");
    expect(handoffDecisionValidation.readiness_projection).toBe("ready");
    expect(handoffDecisionValidation.gate_projection.some((gate) =>
      gate.validation_artifact_ref === "final-output-provenance-validation.yaml"
    )).toBe(false);
    expect(handoffDecisionValidation.gate_projection.some((gate) =>
      gate.validation_artifact_ref === "reconstruct-run-manifest.pre-handoff-validation.yaml"
    )).toBe(true);
    expect(handoffDecisionValidation.gate_projection.some((gate) =>
      gate.validation_artifact_ref === "reconstruct-run-manifest.post-publication-validation.yaml"
    )).toBe(false);
    expect(result.finalOutputText).toContain("Handoff readiness: ready");
    await expect(
      fs.stat(path.join(sessionRoot, "reconstruct-record.pre-publication.yaml")),
    ).resolves.toBeTruthy();
    expect(record.artifact_refs.candidate_inventory)
      .toContain("candidate-inventory.yaml");
    expect(record.artifact_refs.target_material_profile_validation)
      .toContain("target-material-profile-validation.yaml");
    expect(record.artifact_refs.candidate_disposition_validation)
      .toContain("candidate-disposition-validation.yaml");
    expect(candidateDispositionValidation.source_observations_ref)
      .toBe(path.resolve(sessionRoot, "source-observations.yaml"));
    expect(record.artifact_refs.ontology_seed)
      .toContain("ontology-seed.yaml");
    expect(record.artifact_refs.ontology_seed_validation)
      .toContain("ontology-seed-validation.yaml");
    expect(record.artifact_refs.maturation_baseline)
      .toContain("maturation-baseline.yaml");
    expect(record.artifact_refs.maturation_baseline_validation)
      .toContain("maturation-baseline-validation.yaml");
    expect(record.artifact_refs.actionability_matrix)
      .toContain("actionability-matrix.yaml");
    expect(record.artifact_refs.actionability_matrix_validation)
      .toContain("actionability-matrix-validation.yaml");
    expect(record.artifact_refs.maturation_question_frontier)
      .toContain("maturation-question-frontier.yaml");
    expect(record.artifact_refs.maturation_question_frontier_validation)
      .toContain("maturation-question-frontier-validation.yaml");
    expect(record.validation_summary.failure_count).toBe(0);
    expect(record.validation_summary.revision_proposal_count).toBe(0);
    expect(manifest.runtime_boundary).toMatchObject({
      semantic_generation: "not_performed",
      semantic_authority: "host_llm_or_mock_author",
    });
    expect(manifest.execution_profile).toMatchObject({
      profile_kind: "mock_semantic_slice",
      semantic_author_realization: "mock",
      confirmation_provider_realization: "mock",
    });
    expect(manifest.purpose_adequacy_scope.deferred_artifacts).toEqual([]);
    expect(manifest.steps.find((step) => step.step_id === "seed_candidate"))
      .toBeUndefined();
    expect(manifest.steps.find((step) => step.step_id === "seed_confirmation"))
      .toMatchObject({
        owner: "host_or_user",
        performed_by: {
          authority: "host_or_user",
          realization: "mock",
          actor_id: "mock-mixed-confirmation-provider",
        },
      });
    expect(manifest.steps.find((step) => step.step_id === "final_output"))
      .toMatchObject({ status: "completed" });
    expect(manifest.steps.find((step) =>
      step.step_id === "final_output_provenance_validation"
    )).toMatchObject({ status: "completed" });
    expect(manifest.steps.find((step) => step.step_id === "record_assembly"))
      .toMatchObject({ status: "completed" });
    expect(preHandoffManifest.steps.find((step) => step.step_id === "final_output"))
      .toMatchObject({ status: "skipped" });
    expect(preHandoffManifest.steps.find((step) =>
      step.step_id === "final_output_provenance_validation"
    )).toMatchObject({ status: "skipped" });
    expect(preHandoffManifest.steps.find((step) => step.step_id === "record_assembly"))
      .toMatchObject({ status: "skipped" });
    expect(preHandoffManifest.steps.find((step) =>
      step.step_id === "maturation_baseline"
    )).toMatchObject({ status: "skipped" });
    expect(manifest.steps.find((step) =>
      step.step_id === "maturation_question_frontier_validation"
    )).toMatchObject({ status: "completed" });
    expect(manifest.steps.map((step) => step.step_id)).toEqual([
      "invocation_binding",
      "target_material_profile",
      "target_material_profile_validation",
      "source_inventory",
      "initial_source_frontier",
      "source_observation",
      "observation_directive",
      "observation_directive_validation",
      "lens_judgment",
      "exploration_synthesis",
      "source_frontier",
      "source_frontier_validation",
      "source_purpose_candidates",
      "source_purpose_candidates_validation",
      "purpose_confirmation",
      "purpose_confirmation_validation",
      "candidate_inventory",
      "candidate_disposition",
      "candidate_disposition_validation",
      "ontology_seed",
      "ontology_seed_validation",
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
      "actionability_matrix",
      "actionability_matrix_validation",
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
      "maturation_continuation_decision",
      "maturation_continuation_decision_validation",
      "final_output",
      "final_output_provenance_validation",
      "record_assembly",
      "post_publication_run_manifest_validation",
    ]);
  });

  it("authors confirmation before competency questions and uses only CQ-eligible claims", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "eligibility-run");
    const baseConfirmationProvider = createAutoAcceptReconstructConfirmationProvider();
    const confirmationProvider: ReconstructConfirmationProvider = {
      providerId: "fixture-reject-first-claim-provider",
      owner: "mock" as const,
      confirmPurpose: baseConfirmationProvider.confirmPurpose.bind(baseConfirmationProvider),
      async confirmOntologySeed(input) {
        const artifact = await baseConfirmationProvider.confirmOntologySeed(input);
        const [rejectedClaimId, ...acceptedClaimIds] = artifact.confirmed_claim_ids;
        if (!rejectedClaimId) return artifact;
        return {
          ...artifact,
          confirmation_status: "partial" as const,
          confirmed_claim_ids: acceptedClaimIds,
          rejected_claim_ids: [
            ...artifact.rejected_claim_ids,
            rejectedClaimId,
          ],
          notes: [
            ...artifact.notes,
            "Fixture rejects one claim before competency-question authoring.",
          ],
          confirmation_provider: {
            owner: "mock" as const,
            provider_id: "fixture-reject-first-claim-provider",
          },
        };
      },
    };

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a bounded reconstruct Seed from the code fixture.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "mock",
      confirmationProviderRealization: "mock",
      directiveAuthor: createMockReconstructDirectiveAuthor(),
      confirmationProvider,
    })).resolves.toMatchObject({
      status: "completed",
    });

    const seedConfirmationValidation = await readYaml<{
      cq_eligible_claim_ids: string[];
      rejected_claim_ids: string[];
    }>(path.join(sessionRoot, "seed-confirmation-validation.yaml"));
    const competencyQuestions = await readYaml<{
      questions: Array<{ linked_claim_ids: string[] }>;
    }>(path.join(sessionRoot, "competency-questions.yaml"));

    const competencyQuestionsValidation =
      await readYaml<ReconstructCompetencyQuestionsValidationArtifact>(
        path.join(sessionRoot, "competency-questions-validation.yaml"),
      );

    const rejectedClaimId = seedConfirmationValidation.rejected_claim_ids[0];
    expect(seedConfirmationValidation.cq_eligible_claim_ids)
      .not.toContain(rejectedClaimId);
    expect(competencyQuestions.questions.flatMap((question) => question.linked_claim_ids))
      .not.toContain(rejectedClaimId);
    expect(competencyQuestionsValidation.validation_status).toBe("valid");
    expect(competencyQuestionsValidation.seed_confirmation_validation_ref)
      .toContain("seed-confirmation-validation.yaml");
    expect(competencyQuestionsValidation.violations.some((violation) =>
      violation.message.includes("non-eligible claim")
    )).toBe(false);
    const handoffDecisionValidation =
      await readYaml<ReconstructHandoffDecisionValidationArtifact>(
        path.join(sessionRoot, "handoff-decision-validation.yaml"),
      );
    expect(handoffDecisionValidation.validation_status).toBe("valid");
    expect(handoffDecisionValidation.violations).toEqual([]);
  });

  it("threads required domain competencies through governing snapshot, questions, and handoff validation", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "domain-run");
    const domainRoot = path.join(projectRoot, ".onto", "domains", "fixture");
    await fs.mkdir(domainRoot, { recursive: true });
    await fs.writeFile(
      path.join(domainRoot, "competency_qs.md"),
      [
        "# Fixture Domain Competency Questions",
        "",
        "## 1. Core Fixture Checks",
        "",
        "- **CQ-F-01** [P1] Can the fixture service purpose be enumerated?",
        "  - Inference path: fixture profile -> purpose is required",
        "  - Verification criteria: PASS if purpose can be listed.",
        "",
        "- **CQ-F-02** [P2] Can the fixture service optional extension be evaluated?",
        "  - Inference path: fixture profile -> production extension is optional",
        "  - Verification criteria: PASS if optional extension evidence exists.",
        "",
        "- **CQ-F-03** [P3] Can mature fixture visualizations be generated?",
        "  - Inference path: fixture profile -> visualization is diagnostic",
        "  - Verification criteria: PASS if visualization evidence exists.",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a bounded reconstruct Seed from the code target for fixture domain.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      domain: "fixture",
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "mock",
      confirmationProviderRealization: "mock",
      directiveAuthor: createMockReconstructDirectiveAuthor(),
      confirmationProvider: createAutoAcceptReconstructConfirmationProvider(),
    });

    const competencyQuestions =
      await readYaml<ReconstructCompetencyQuestionsArtifact>(
        path.join(sessionRoot, "competency-questions.yaml"),
      );
    const competencyQuestionsValidation =
      await readYaml<ReconstructCompetencyQuestionsValidationArtifact>(
        path.join(sessionRoot, "competency-questions-validation.yaml"),
      );
    const handoffDecisionValidation =
      await readYaml<ReconstructHandoffDecisionValidationArtifact>(
        path.join(sessionRoot, "handoff-decision-validation.yaml"),
      );
    const snapshot = result.reconstructRunManifest.governing_snapshot;
    const domainQuestion = competencyQuestions.questions.find((question) =>
      question.domain_competency_trace_refs.includes("domain:fixture#CQ-F-01")
    );

    expect(result.status).toBe("completed");
    expect(snapshot.requested_domain_ids).toEqual(["fixture"]);
    expect(snapshot.required_admitted_competency_ids).toEqual(["domain:fixture#CQ-F-01"]);
    expect(snapshot.admitted_competency_priorities).toMatchObject({
      "domain:fixture#CQ-F-01": "P1",
      "domain:fixture#CQ-F-02": "P2",
      "domain:fixture#CQ-F-03": "P3",
    });
    expect(competencyQuestions.questions.some((question) =>
      question.domain_competency_trace_refs.includes("domain:fixture#CQ-F-02") ||
      question.domain_competency_trace_refs.includes("domain:fixture#CQ-F-03")
    )).toBe(false);
    expect(domainQuestion).toBeDefined();
    expect(domainQuestion?.domain_competency_semantic_assessments).toEqual([
      expect.objectContaining({
        competency_id: "domain:fixture#CQ-F-01",
        source_anchor: "1. Core Fixture Checks#CQ-F-01",
        applicability_verdict: "applicable",
        semantic_alignment: "preserved",
      }),
    ]);
    expect(competencyQuestionsValidation.validation_status).toBe("valid");
    expect(competencyQuestionsValidation.required_admitted_competency_ids)
      .toEqual(["domain:fixture#CQ-F-01"]);
    expect(result.reconstructRunManifest.purpose_adequacy_scope.deferred_artifacts)
      .toEqual([]);
    expect(result.reconstructRunManifest.purpose_adequacy_scope.deferred_reason)
      .toContain("governing_snapshot");
    expect(handoffDecisionValidation.validation_status).toBe("valid");
  });

  it("runs the direct-call integral path without product mock authorship", async () => {
    const projectRoot = await tempProjectRoot();
    const longSourcePath = path.join(projectRoot, "src", "long-feature.ts");
    await fs.writeFile(
      longSourcePath,
      `export const longFeature = ${JSON.stringify("x".repeat(5000))};\n`,
      "utf8",
    );
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "direct-run");
    const sourcePurposeSystemPrompts: string[] = [];
    const candidateDispositionSystemPrompts: string[] = [];
    const candidateDispositionPayloads: Array<{
      candidate_inventory?: unknown;
    }> = [];
    const ontologySeedSystemPrompts: string[] = [];
    const ontologySeedPayloads: Array<{
      source_observations?: Array<{
        observation_id: string;
        source_ref?: string;
        structural_data?: {
          content_excerpt?: string;
          prompt_content_excerpt_truncated?: boolean;
        };
      }>;
      observed_source_refs?: string[];
    }> = [];
    const confirmationClaimSummaries: Array<
      Array<{ claim_id: string; claim_kind: string }>
    > = [];
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Author source-purpose-candidates.yaml")) {
        sourcePurposeSystemPrompts.push(systemPrompt);
      }
      if (systemPrompt.includes("Author candidate-disposition.yaml")) {
        candidateDispositionSystemPrompts.push(systemPrompt);
        candidateDispositionPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("Author ontology-seed.yaml")) {
        ontologySeedSystemPrompts.push(systemPrompt);
        ontologySeedPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("mediating reconstruct Seed confirmation")) {
        const input = JSON.parse(userPrompt) as {
          claim_summaries?: Array<{ claim_id: string; claim_kind: string }>;
        };
        confirmationClaimSummaries.push(input.claim_summaries ?? []);
      }
      return fakeLiveLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [longSourcePath, path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a live reconstruct Seed from the code target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.reconstructRunManifest.execution_profile).toMatchObject({
      profile_kind: "full_integral_exploration",
      semantic_author_realization: "direct_call",
      confirmation_provider_realization: "direct_call",
    });
    expect(
      result.reconstructRunManifest.steps.find((step) =>
        step.step_id === "lens_judgment"
      ),
    ).toMatchObject({
      status: "completed",
      performed_by: {
        realization: "direct_call",
      },
    });
    expect(result.reconstructRunManifest.artifact_refs.initial_source_frontier)
      .toContain("initial-source-frontier.yaml");
    expect(result.reconstructRunManifest.artifact_refs.source_frontier_validation)
      .toContain("source-frontier-validation.yaml");
    expect(result.reconstructRunManifest.artifact_refs.candidate_inventory)
      .toContain("candidate-inventory.yaml");
    expect(result.reconstructRunManifest.artifact_refs.ontology_seed)
      .toContain("ontology-seed.yaml");
    expect(result.reconstructRecord.validation_summary).toMatchObject({
      target_material_profile_status: "valid",
      candidate_disposition_status: "valid",
      ontology_seed_status: "valid",
    });
    expect(result.finalOutputText).toContain("full_integral_exploration");
    expect(result.finalOutputText).toContain("Runtime Artifact Truth Footer");
    expect(result.finalOutputText).toContain(result.reconstructRecordPath);
    expect(result.finalOutputText).not.toContain("mock");

    await expect(fs.access(path.join(sessionRoot, "seed-candidate.yaml")))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(confirmationClaimSummaries[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim_id: "concept-fixture-service",
          claim_kind: "ontology_seed_claim",
        }),
        expect.objectContaining({
          claim_id: "object-fixture-service",
          claim_kind: "ontology_seed_claim",
        }),
        expect.objectContaining({
          claim_id: "action-explain-fixture",
          claim_kind: "ontology_seed_claim",
        }),
      ]),
    );
    expect(sourcePurposeSystemPrompts[0])
      .toContain("For mixed targets, every required element");
    expect(candidateDispositionSystemPrompts[0])
      .toContain("first valid operational kernel");
    expect(candidateDispositionSystemPrompts[0]).toContain("deferred_to_maturation");
    expect(JSON.stringify(candidateDispositionPayloads[0]?.candidate_inventory))
      .not.toContain("evidence_refs");
    expect(JSON.stringify(candidateDispositionPayloads[0]?.candidate_inventory))
      .toContain("evidence_observation_ids");
    expect(ontologySeedSystemPrompts[0]).toContain("OntologySeed");
    expect(ontologySeedSystemPrompts[0])
      .toContain("compact but schema-valid first-pass seed kernel");
    expect(ontologySeedSystemPrompts[0])
      .toContain("Every limitation_refs value anywhere in the seed must resolve");
    expect(ontologySeedSystemPrompts[0])
      .toContain("conceptual_frame.associations[].source_concept_id");
    expect(ontologySeedPayloads[0]?.source_observations?.length).toBeGreaterThan(0);
    expect(ontologySeedPayloads[0]?.source_observations?.length)
      .toBeLessThanOrEqual(160);
    expect(ontologySeedPayloads[0]?.source_observations).toEqual(
      expect.arrayContaining([
        expect.not.objectContaining({ structural_data: expect.anything() }),
      ]),
    );
    expect(ontologySeedPayloads[0]?.observed_source_refs).toEqual(
      ontologySeedPayloads[0]?.source_observations?.map((observation) =>
        observation.source_ref
      ),
    );
    expect(ontologySeedPayloads[0]?.target_material_profile?.detection)
      .toHaveProperty("per_ref_count");
    expect(ontologySeedPayloads[0]?.target_material_profile?.detection)
      .not.toHaveProperty("per_ref");
    expect(ontologySeedPayloads[0]?.skipped_source_ref_summary)
      .toHaveProperty("skipped_ref_count");
    expect(ontologySeedPayloads[0]?.skipped_source_refs).toBeUndefined();
    expect(ontologySeedPayloads[0]?.candidate_target_ref_obligations)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          target_seed_ref: "object-fixture-service",
        }),
      ]));
    expect(JSON.stringify(ontologySeedPayloads[0]?.candidate_inventory))
      .not.toContain("evidence_refs");
    expect(JSON.stringify(ontologySeedPayloads[0]?.candidate_disposition))
      .not.toContain("evidence_refs");
    expect(JSON.stringify(ontologySeedPayloads[0]?.candidate_inventory))
      .toContain("evidence_observation_ids");
    expect(JSON.stringify(ontologySeedPayloads[0]?.candidate_disposition))
      .toContain("evidence_observation_ids");
    expect(ontologySeedSystemPrompts[0]).toContain(
      "For represented_as_property obligations",
    );
    expect(ontologySeedSystemPrompts[0]).toContain(
      "For represented_as_actor_role obligations",
    );
    expect(ontologySeedSystemPrompts[0]).not.toContain("top_level_concepts");
    expect(result.metrics.answerability_summary).toMatchObject({
      supported_question_count: 11,
      supported_action_count: 1,
    });
    expect(result.finalOutputText).toContain("Seed Answerability");
    expect(result.finalOutputText).toContain("Ontology seed projected claims");
  });

  it("observes accepted source frontier refs before downstream semantic authoring", async () => {
    const projectRoot = await tempProjectRoot();
    await fs.rm(path.join(projectRoot, "schedule.csv"));
    const docsRoot = path.join(projectRoot, "docs");
    const docPath = path.join(docsRoot, "usage.md");
    await fs.mkdir(docsRoot, { recursive: true });
    await fs.writeFile(
      docPath,
      [
        "# Usage Notes",
        "",
        "The dashboard user reviews AI usage, token consumption, and cost anomalies.",
        "The service operator investigates unexpected model usage from the usage report.",
      ].join("\n"),
      "utf8",
    );
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "frontier-round-run",
    );
    let sourceFrontierCalls = 0;
    const candidateInventoryPayloads: Array<{
      source_observations?: Array<{
        source_ref?: string;
        target_material_kind?: string;
      }>;
    }> = [];
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Select observations")) {
        const input = JSON.parse(userPrompt) as {
          source_observations?: Array<{
            observation_id: string;
            source_ref?: string;
          }>;
        };
        const docObservation = input.source_observations?.find((observation) =>
          observation.source_ref === docPath
        );
        if (docObservation) {
          return Promise.resolve({
            text: JSON.stringify({
              selected_observations: [
                {
                  observation_id: docObservation.observation_id,
                  selection_rationale:
                    "The accepted frontier document should reach downstream authoring.",
                },
              ],
              open_questions: [],
            }),
          } satisfies LlmCallResult);
        }
      }
      if (systemPrompt.includes("Convert exploration synthesis")) {
        sourceFrontierCalls += 1;
        if (sourceFrontierCalls === 1) {
          return Promise.resolve({
            text: JSON.stringify({
              frontier_refs: [
                {
                  source_ref: docPath,
                  rationale:
                    "The document names dashboard users and operator-facing usage-review intent.",
                  priority: "high",
                },
                {
                  source_ref: path.join(projectRoot, "src", "feature.ts"),
                  rationale:
                    "The model restated an already observed source alongside a valid new frontier ref.",
                  priority: "medium",
                },
              ],
              no_next_frontier_rationale: null,
            }),
          } satisfies LlmCallResult);
        }
      }
      if (systemPrompt.includes("Author candidate-inventory.yaml")) {
        candidateInventoryPayloads.push(JSON.parse(userPrompt));
      }
      if (systemPrompt.includes("Decide whether the current reconstructed result")) {
        const input = JSON.parse(userPrompt) as {
          allowed_decisions?: string[];
        };
        return Promise.resolve({
          text: JSON.stringify({
            decision: input.allowed_decisions?.[0] ?? "continue",
            rationale: "The fixture follows the runtime-provided allowed decision boundary.",
            next_actions: [],
          }),
        } satisfies LlmCallResult);
      }
      return fakeLiveLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [projectRoot],
      intent: "Create a live reconstruct Seed that follows accepted source frontier refs.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    expect(result.status).toBe("completed");
    expect(sourceFrontierCalls).toBe(2);
    expect(result.reconstructRunManifest.artifact_refs.source_frontier_validation)
      .toContain(path.join("rounds", "round-2", "source-frontier-validation.yaml"));
    const sourceObservations =
      await readYaml<ReconstructSourceObservationsArtifact>(
        path.join(sessionRoot, "source-observations.yaml"),
      );
    expect(sourceObservations.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_ref: docPath,
          target_material_kind: "document",
        }),
      ]),
    );
    expect(sourceObservations.skipped_refs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: docPath,
        }),
      ]),
    );
    expect(candidateInventoryPayloads[0]?.source_observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_ref: docPath,
          target_material_kind: "document",
        }),
      ]),
    );
    const terminalFrontierValidation =
      await readYaml<ReconstructSourceFrontierValidationArtifact>(
        result.reconstructRunManifest.artifact_refs.source_frontier_validation,
      );
    expect(terminalFrontierValidation.round_id).toBe("round-2");
    expect(terminalFrontierValidation.accepted_frontier_ref_ids).toEqual([]);
    expect(terminalFrontierValidation.no_next_frontier_accepted).toBe(true);
  });

  it("treats already-observed source frontier refs as terminal convergence", async () => {
    const projectRoot = await tempProjectRoot();
    const targetRef = path.join(projectRoot, "src", "feature.ts");
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "already-observed-frontier-run",
    );
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Convert exploration synthesis")) {
        return Promise.resolve({
          text: JSON.stringify({
            frontier_refs: [
              {
                source_ref: targetRef,
                rationale:
                  "The already observed source is restated by the authoring model.",
                priority: "medium",
              },
            ],
            no_next_frontier_rationale: null,
          }),
        } satisfies LlmCallResult);
      }
      return fakeLiveLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed that tolerates already-observed terminal frontier refs.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    expect(result.status).toBe("completed");
    const terminalFrontierValidation =
      await readYaml<ReconstructSourceFrontierValidationArtifact>(
        result.reconstructRunManifest.artifact_refs.source_frontier_validation,
      );
    expect(terminalFrontierValidation.validation_status).toBe("valid");
    expect(terminalFrontierValidation.accepted_frontier_ref_ids).toEqual([]);
    expect(terminalFrontierValidation.rejected_frontier_refs).toEqual([
      expect.objectContaining({
        source_ref: targetRef,
        reason: "already_observed",
      }),
    ]);
    expect(terminalFrontierValidation.validation_results).toContain(
      "terminal_frontier_refs_already_observed",
    );
  });

  it("batches direct-call required domain competency dispositions", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "large-domain-run");
    const domainRoot = path.join(projectRoot, ".onto", "domains", "fixture-large");
    await fs.mkdir(domainRoot, { recursive: true });
    await fs.writeFile(
      path.join(domainRoot, "competency_qs.md"),
      [
        "# Fixture Large Domain Competency Questions",
        "",
        "## 1. Required Checks",
        "",
        ...Array.from({ length: 17 }, (_, index) => {
          const id = `CQ-L-${String(index + 1).padStart(2, "0")}`;
          return [
            `- **${id}** [P1] Can fixture requirement ${index + 1} be answered?`,
            `  - Inference path: fixture large profile -> requirement ${index + 1}`,
            `  - Verification criteria: PASS if requirement ${index + 1} is dispositioned.`,
            "",
          ].join("\n");
        }),
      ].join("\n"),
      "utf8",
    );
    const competencyQuestionPayloads: Array<{
      eligible_claims?: Array<{ claim_id: string }>;
      required_domain_competency_question_rows?: Array<{
        competency_id: string;
      }>;
    }> = [];
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Write competency questions")) {
        competencyQuestionPayloads.push(JSON.parse(userPrompt));
      }
      return fakeLiveLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a live reconstruct Seed from the code target with large domain coverage.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      domain: "fixture-large",
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });
    const competencyQuestions =
      await readYaml<ReconstructCompetencyQuestionsArtifact>(
        path.join(sessionRoot, "competency-questions.yaml"),
      );
    const competencyQuestionsValidation =
      await readYaml<ReconstructCompetencyQuestionsValidationArtifact>(
        path.join(sessionRoot, "competency-questions-validation.yaml"),
      );
    const domainBatches = competencyQuestionPayloads.filter((payload) =>
      (payload.required_domain_competency_question_rows ?? []).length > 0
    );

    expect(result.status).toBe("completed");
    expect(competencyQuestionPayloads[0]?.required_domain_competency_question_rows)
      .toEqual([]);
    expect(competencyQuestionPayloads[0]?.eligible_claims?.length).toBeGreaterThan(0);
    expect(domainBatches.map((payload) =>
      payload.required_domain_competency_question_rows?.length
    )).toEqual([8, 8, 1]);
    expect(competencyQuestionsValidation.validation_status).toBe("valid");
    expect(competencyQuestionsValidation.required_admitted_competency_ids)
      .toHaveLength(17);
    expect(competencyQuestions.questions.flatMap((question) =>
      question.domain_competency_trace_refs
    ).sort()).toEqual(
      Array.from({ length: 17 }, (_, index) =>
        `domain:fixture-large#CQ-L-${String(index + 1).padStart(2, "0")}`
      ),
    );
  });

  it("fails loud instead of overwriting authored semantic artifacts in an existing session root", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "retry-run",
    );
    const targetRef = path.join(projectRoot, "src", "feature.ts");
    const firstAttemptPrompts: string[] = [];
    const firstAttemptLlmCall = (systemPrompt: string, userPrompt: string) => {
      firstAttemptPrompts.push(systemPrompt);
      if (systemPrompt.includes("Author ontology-seed.yaml")) {
        throw new Error("ontology seed author timed out");
      }
      return fakeLiveLlm(systemPrompt, userPrompt);
    };

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with retry.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: firstAttemptLlmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: firstAttemptLlmCall,
      }),
    })).rejects.toThrow(/ontology seed author timed out/);

    expect(firstAttemptPrompts.some((prompt) =>
      prompt.includes("Convert exploration synthesis into a concrete source frontier")
    )).toBe(true);
    await fs.access(path.join(
      sessionRoot,
      "rounds",
      "round-1",
      "source-frontier.yaml",
    ));
    await expect(fs.access(path.join(sessionRoot, "seed-candidate.yaml")))
      .rejects.toMatchObject({ code: "ENOENT" });

    const retryPrompts: string[] = [];
    const retryLlmCall = (systemPrompt: string, userPrompt: string) => {
      retryPrompts.push(systemPrompt);
      return fakeLiveLlm(systemPrompt, userPrompt);
    };
    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with retry.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: retryLlmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: retryLlmCall,
      }),
    })).rejects.toThrow(/already exists.*explicit resume or supersession/);

    expect(retryPrompts).toHaveLength(0);

    const resumeResult = await runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with retry.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      resumeMode: "reuse_existing_authored_artifacts",
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: retryLlmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: retryLlmCall,
      }),
    });
    expect(resumeResult.status).toBe("completed");
    expect(retryPrompts.some((prompt) =>
      prompt.includes("Convert exploration synthesis into a concrete source frontier")
    )).toBe(false);
    expect(retryPrompts.some((prompt) =>
      prompt.includes("Author ontology-seed.yaml")
    )).toBe(true);
  });

  it("rejects explicit resume when the current source snapshot changed", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "stale-resume-run",
    );
    const targetRef = path.join(projectRoot, "src", "feature.ts");
    const firstAttemptLlmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Author ontology-seed.yaml")) {
        throw new Error("ontology seed author timed out");
      }
      return fakeLiveLlm(systemPrompt, userPrompt);
    };

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with stale resume protection.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: firstAttemptLlmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: firstAttemptLlmCall,
      }),
    })).rejects.toThrow(/ontology seed author timed out/);

    await fs.writeFile(
      targetRef,
      "export function featureName(): string {\n  return 'changed-source';\n}\n",
      "utf8",
    );
    const resumePrompts: string[] = [];
    await expect(runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      intent: "Create a live reconstruct Seed with stale resume protection.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      resumeMode: "reuse_existing_authored_artifacts",
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return fakeLiveLlm(systemPrompt, userPrompt);
        },
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall: (systemPrompt, userPrompt) => {
          resumePrompts.push(systemPrompt);
          return fakeLiveLlm(systemPrompt, userPrompt);
        },
      }),
    })).rejects.toThrow(/resume provenance mismatch/);
    expect(resumePrompts).toHaveLength(0);
  });

  it("uses ontology-seed.yaml as the only active direct-call seed artifact", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "ontology-seed-only-run",
    );
    const prompts: string[] = [];
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      prompts.push(systemPrompt);
      return fakeLiveLlm(systemPrompt, userPrompt);
    };

    const result = await runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "src", "feature.ts")],
      intent: "Create a live reconstruct Seed from the code target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      directiveAuthor: createDirectCallReconstructDirectiveAuthor({
        llmCall,
      }),
      confirmationProvider: createDirectCallReconstructConfirmationProvider({
        llmCall,
      }),
    });

    const ontologySeed = await readYaml<ReconstructOntologySeedArtifact>(
      result.artifactRefs.ontology_seed!,
    );
    expect(result.artifactRefs).not.toHaveProperty("seed_candidate");
    await expect(fs.access(path.join(sessionRoot, "seed-candidate.yaml")))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(prompts.some((prompt) =>
      prompt.includes("Author a concept-centered ontology Seed candidate")
    )).toBe(false);
    expect(
      (ontologySeed.data_binding_layer as any).source_bindings[0].source_ref,
    ).toBe(path.join(projectRoot, "src", "feature.ts"));
  });

  it("fails loud for non-code material whose source profile adapter is only planned", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "spreadsheet-run",
    );

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "schedule.csv")],
      intent: "Create a bounded reconstruct Seed from the schedule target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "mock",
      confirmationProviderRealization: "mock",
      directiveAuthor: createMockReconstructDirectiveAuthor(),
      confirmationProvider: createAutoAcceptReconstructConfirmationProvider(),
    })).rejects.toThrow(/runtime_implementation_status=planned/);
  });

  it("selects every observation and leaves mixed material expansion explicit", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "mixed-run",
    );

    await expect(runReconstruct({
      projectRoot,
      targetRefs: [
        path.join(projectRoot, "src", "feature.ts"),
        path.join(projectRoot, "schedule.csv"),
      ],
      intent: "Create a bounded reconstruct Seed from a mixed target.",
      sessionRoot,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "mock",
      confirmationProviderRealization: "mock",
      directiveAuthor: createMockReconstructDirectiveAuthor(),
      confirmationProvider: createAutoAcceptReconstructConfirmationProvider(),
    })).resolves.toMatchObject({
      status: "completed",
    });

    const metrics = await readYaml<ReconstructMetricsArtifact>(
      path.join(sessionRoot, "reconstruct-metrics.yaml"),
    );
    const stopDecision = await readYaml<ReconstructStopDecisionArtifact>(
      path.join(sessionRoot, "stop-decision.yaml"),
    );
    const sourceObservations = await readYaml<ReconstructSourceObservationsArtifact>(
      path.join(sessionRoot, "source-observations.yaml"),
    );
    const preHandoffManifestValidation =
      await readYaml<ReconstructRunManifestValidationArtifact>(
        path.join(sessionRoot, "reconstruct-run-manifest.pre-handoff-validation.yaml"),
      );
    const handoffDecisionValidation =
      await readYaml<ReconstructHandoffDecisionValidationArtifact>(
        path.join(sessionRoot, "handoff-decision-validation.yaml"),
      );

    expect(metrics.source_observation_count).toBe(1);
    expect(metrics.selected_observation_count).toBe(1);
    expect(metrics.unresolved_question_count).toBeGreaterThan(0);
    expect(stopDecision.decision).toBe("ask_user");
    expect(preHandoffManifestValidation.validation_status).toBe("valid");
    expect(handoffDecisionValidation.validation_status).toBe("valid");
    expect(handoffDecisionValidation.readiness_projection).toBe("not_ready");
    expect(handoffDecisionValidation.violations).toEqual([]);
    expect(sourceObservations.observations).toHaveLength(1);
    expect(sourceObservations.skipped_refs).toEqual([
      expect.objectContaining({
        target_material_kind: "spreadsheet",
        reason: expect.stringContaining("runtime_implementation_status=planned"),
      }),
    ]);
    await expect(fs.access(path.join(sessionRoot, "final-output.md")))
      .resolves.toBeUndefined();
  });
});
