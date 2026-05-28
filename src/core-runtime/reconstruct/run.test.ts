import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructLensJudgmentArtifact,
  ReconstructRecordArtifact,
  ReconstructRunManifestArtifact,
  ReconstructSeedCandidateArtifact,
} from "./artifact-types.js";
import {
  RECONSTRUCT_SEED_MIGRATION_TARGETS,
} from "./artifact-types.js";
import {
  createAutoAcceptReconstructConfirmationProvider,
  createDirectCallReconstructConfirmationProvider,
  createDirectCallReconstructDirectiveAuthor,
  createMockReconstructDirectiveAuthor,
  runReconstruct,
} from "./run.js";
import { seedClaimProjections } from "./seed-claim-projections.js";
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
                evidence_observation_ids: ["obs-1"],
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

  function fakeLiveLlm(systemPrompt: string, userPrompt: string): Promise<LlmCallResult> {
    const input = JSON.parse(userPrompt) as Record<string, any>;
    const observations = (input.source_observations ?? []) as Array<{
      observation_id: string;
      target_material_kind?: string;
      source_ref?: string;
    }>;
    const firstObservationId =
      observations[0]?.observation_id ??
      input.seed_candidate?.purpose?.evidence_refs?.[0]?.observation_id ??
      "obs_code_fake";
    const firstMaterialKind = observations[0]?.target_material_kind ?? "code";
    const firstSourceRef = observations[0]?.source_ref ?? "src/feature.ts";
    const migrationRecords = RECONSTRUCT_SEED_MIGRATION_TARGETS
      .filter((record) => record.compatibility_status === "transitional_projection")
      .map((record) => ({
        migration_id: `migration-${record.source_field}`,
        source_field: record.source_field,
        target_authority_field: record.target_authority_field,
        migration_artifact_ref: null,
      }));
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
    } else if (systemPrompt.includes("Author a concept-centered ontology Seed candidate")) {
      text = JSON.stringify({
        seed_schema_version: "transitional",
        purpose: {
          claim_id: "purpose-1",
          name: "Fixture Service Purpose",
          statement: "The fixture exposes a small feature service purpose.",
          evidence_observation_ids: [firstObservationId],
        },
        answerability_scope: {
          declared_handoff_questions: [
            {
              question_id: "question-1",
              question: "What top-level concept explains the fixture service?",
              source: "declared_purpose",
            },
          ],
          supported_questions: [
            {
              question_id: "question-1",
              answered_by: {
                concept_ids: ["concept-fixture-service"],
                relation_ids: [],
              },
              confidence: "medium",
            },
          ],
          deferred_questions: [],
          unsupported_questions: [],
          supported_actions: [
            {
              action_id: "action-explain-fixture-service",
              action: "Explain the bounded fixture service Seed.",
              supported_by_question_ids: ["question-1"],
              readiness_statement: "Ready for bounded fixture handoff.",
            },
          ],
          unsupported_actions: [],
          handoff_readiness_statement: "Ready for bounded fixture handoff.",
          handoff_readiness_question_ids: ["question-1"],
        },
        top_level_concepts: [
          {
            concept_id: "concept-fixture-service",
            name: "Fixture Service",
            aliases: [],
            definition: "A bounded service concept grounded in the observed fixture source.",
            why_top_level: "It explains the fixture behavior for the declared purpose.",
            evidence_observation_ids: [firstObservationId],
            boundary: {
              included_summary: "Observed feature source and its service behavior.",
              excluded_summary: "Unobserved production concerns.",
              deferred_summary: "Full ontology formalization.",
            },
            confidence: "medium",
            provisional: false,
          },
        ],
        top_level_relations: [],
        relation_participation_exceptions: [
          {
            concept_id: "concept-fixture-service",
            isolation_reason: "Single concept fixture has no canonical relation pair.",
            isolation_pressure_ids: ["pressure-fixture-evidence"],
          },
        ],
        lower_level_detail_placements: [
          {
            detail_id: "detail-feature-source",
            name: "Feature Source",
            material_kind: firstMaterialKind,
            source_ref: firstSourceRef,
            placement: "included_support",
            owner_concept_id: "concept-fixture-service",
            rationale: "The feature source supports the Fixture Service concept.",
            evidence_observation_ids: [firstObservationId],
            follow_up_question: null,
          },
        ],
        frontier_pressure_log: [
          {
            pressure_id: "pressure-fixture-evidence",
            origin: "source_observation",
            origin_ref: firstObservationId,
            pressure_type: "evidence_saturation",
            pressure_question: "Would another fixture source change the top-level concept?",
            target_concept_ids: ["concept-fixture-service"],
            target_relation_ids: [],
            material_kind: firstMaterialKind,
            source_ref: firstSourceRef,
            expected_decision_impact: "Additional evidence may refine but not block handoff.",
            priority: "low",
            status: "non_blocking",
            status_reason: "The fixture intentionally has bounded source scope.",
            superseded_by_pressure_id: null,
            evidence_observation_ids: [firstObservationId],
          },
        ],
        material_coverage_checkpoint: {
          observed_material_kinds: [firstMaterialKind],
          observed_source_slices: [firstSourceRef],
          source_authority_scope: {
            permission_scope: "within_declared_boundary",
            permission_basis_refs: [firstSourceRef],
            trust_status: "observed_evidence_only",
            instruction_authority_status: "none_data_only",
            external_content_handling: "not_applicable",
            restricted_source_refs: [],
            rationale: "Fixture source is treated as evidence only.",
          },
          intentionally_excluded_material_kinds: [],
          unexplored_source_categories: [],
          possible_missing_axis_pressure_ids: [],
          rationale_for_seed_level_sufficiency: "Sufficient for bounded fixture handoff.",
          partial_support_disclosures: [],
        },
        convergence: {
          state: "provisionally_converged",
          source_convergence_rationale: "No open pressure remains for fixture handoff.",
          review_confirmed: false,
          review_profile_ref: null,
          remaining_pressure_ids: ["pressure-fixture-evidence"],
        },
        lifecycle: {
          seed_id: "seed-fixture",
          parent_seed_ref: null,
          id_stability_scope: "session",
          session_id: "direct-run",
          source_snapshot_refs: [firstSourceRef],
          source_snapshot_transition: {
            prior_snapshot_refs: [],
            transition_reason: "Initial fixture Seed.",
          },
          exploration_rounds: [
            {
              round_id: "round-1",
              observed_source_refs: [firstSourceRef],
              authoring_pass_ref: "seed-candidate.yaml",
              changed_concept_ids: ["concept-fixture-service"],
              changed_relation_ids: [],
              changed_frontier_pressure_ids: ["pressure-fixture-evidence"],
            },
          ],
          concept_identity_events: [
            {
              event_id: "concept-event-created-1",
              event_type: "created",
              prior_concept_ids: [],
              current_concept_ids: ["concept-fixture-service"],
              target_detail_ids: [],
              prior_names: [],
              new_names: ["Fixture Service"],
              prior_aliases: [],
              current_aliases: [],
              reason: "Initial fixture concept.",
              evidence_observation_ids: [firstObservationId],
              frontier_pressure_ids: ["pressure-fixture-evidence"],
            },
          ],
          relation_identity_events: [],
          pressure_events: [
            {
              event_id: "pressure-event-non-blocking-1",
              event_type: "non_blocking",
              pressure_id: "pressure-fixture-evidence",
              prior_status: null,
              new_status: "non_blocking",
              superseded_by_pressure_id: null,
              reason: "Fixture pressure is non-blocking.",
              evidence_observation_ids: [firstObservationId],
            },
          ],
          detail_placement_events: [
            {
              event_id: "detail-event-placed-1",
              event_type: "placed",
              detail_ids: ["detail-feature-source"],
              reason: "Feature source was placed under the service concept.",
              evidence_observation_ids: [firstObservationId],
              frontier_pressure_ids: ["pressure-fixture-evidence"],
            },
          ],
          answerability_events: [
            {
              event_id: "answerability-event-supported-1",
              event_type: "question_supported",
              question_ids: ["question-1"],
              action_ids: ["action-explain-fixture-service"],
              frontier_pressure_ids: [],
              reason: "Question is supported by the fixture concept.",
            },
          ],
          material_coverage_events: [
            {
              event_id: "material-event-source-slice-added-1",
              event_type: "source_slice_added",
              source_refs: [firstSourceRef],
              material_kinds: [firstMaterialKind],
              changed_authority_fields: ["observed_source_slices"],
              prior_authority_state_ref: null,
              current_authority_state_ref: null,
              prior_authority_state: null,
              current_authority_state: {
                observed_source_slices: [firstSourceRef],
              },
              frontier_pressure_ids: ["pressure-fixture-evidence"],
              reason: "Observed fixture source slice recorded.",
            },
          ],
          convergence_events: [
            {
              event_id: "convergence-event-provisional-1",
              prior_state: null,
              new_state: "provisionally_converged",
              frontier_pressure_ids: ["pressure-fixture-evidence"],
              reason: "No open pressure remains.",
            },
          ],
        },
        migration_records: migrationRecords,
        non_goals: [],
        entities: [
          {
            claim_id: "entity-1",
            name: "Observed Feature Source",
            statement: "The fixture contains one observed feature source unit.",
            evidence_observation_ids: [firstObservationId],
          },
        ],
        relations: [],
        actions: [
          {
            claim_id: "action-1",
            name: "Inspect Feature Source",
            statement: "The feature source can be inspected as service behavior evidence.",
            evidence_observation_ids: [firstObservationId],
          },
        ],
        properties: [],
        rules: [],
        open_questions: [],
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
      const claims = seedClaimProjections(
        input.seed_candidate as ReconstructSeedCandidateArtifact,
      );
      text = JSON.stringify({
        claim_realizations: claims.map((claim: { claim_id: string }) => ({
          claim_id: claim.claim_id,
          stance: "observed_runtime_behavior",
          rationale: "The fixture claim is directly grounded in observed source.",
        })),
      });
    } else if (systemPrompt.includes("Write competency questions")) {
      const claimIds = input.seed_confirmation_validation.cq_eligible_claim_ids as string[];
      text = JSON.stringify({
        questions: claimIds.map((claimId, index) => ({
          question_id: `cq-${index + 1}`,
          question: `Can the Seed explain ${claimId}?`,
          linked_claim_ids: [claimId],
          evidence_observation_ids: [firstObservationId],
        })),
        open_questions: [],
      });
    } else if (systemPrompt.includes("Assess every competency question")) {
      text = JSON.stringify({
        assessments: (input.competency_questions.questions as Array<{ question_id: string }>).map((question) => ({
          question_id: question.question_id,
          answer_status: "answered",
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

  it("runs the material-aware happy path for the first code fixture", async () => {
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
    expect(result.metrics.pass_rate).toBeLessThan(1);
    expect(result.metrics.confirmed_claim_count).toBeGreaterThan(0);
    expect(result.metrics.partial_claim_count).toBeGreaterThan(0);
    expect(result.metrics.deferred_claim_count).toBeGreaterThan(0);
    expect(result.metrics.rejected_claim_count).toBeGreaterThan(0);
    expect(result.metrics.competency_question_assessment_count)
      .toBe(result.metrics.competency_question_count);
    expect(result.metrics.failure_kind_counts.insufficient_evidence)
      .toBeGreaterThan(0);
    expect(result.metrics.revision_proposal_action_counts.extend)
      .toBeGreaterThan(0);
    expect(result.stopDecision.decision).toBe("ask_user");
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

    expect(record.artifact_refs.final_output).toBe(result.finalOutputPath);
    expect(record.artifact_refs.reconstruct_run_manifest)
      .toBe(result.reconstructRunManifestPath);
    expect(record.validation_summary).toMatchObject({
      source_observation_directive_status: "valid",
      seed_candidate_status: "valid",
      seed_confirmation_status: "partial",
    });
    expect(record.validation_summary.failure_count).toBeGreaterThan(0);
    expect(record.validation_summary.revision_proposal_count).toBeGreaterThan(0);
    expect(manifest.runtime_boundary).toMatchObject({
      semantic_generation: "not_performed",
      semantic_authority: "host_llm_or_mock_author",
    });
    expect(manifest.execution_profile).toMatchObject({
      profile_kind: "mock_semantic_slice",
      semantic_author_realization: "mock",
      confirmation_provider_realization: "mock",
    });
    expect(manifest.happy_path_scope.deferred_artifacts).toEqual([
      "domain_context_selection",
      "domain_context_selection_validation",
    ]);
    expect(manifest.steps.find((step) => step.step_id === "seed_candidate"))
      .toMatchObject({
        owner: "host_llm",
        performed_by: {
          authority: "host_llm",
          realization: "mock",
          actor_id: "mock-reconstruct-directive-author",
        },
      });
    expect(manifest.steps.find((step) => step.step_id === "seed_confirmation"))
      .toMatchObject({
        owner: "host_or_user",
        performed_by: {
          authority: "host_or_user",
          realization: "mock",
          actor_id: "mock-mixed-confirmation-provider",
        },
      });
    expect(manifest.steps.map((step) => step.step_id)).toEqual([
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
    ]);
  });

  it("runs the direct-call integral path without product mock authorship", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "direct-run");
    const seedAuthorSystemPrompts: string[] = [];
    const confirmationClaimSummaries: Array<
      Array<{ claim_id: string; claim_kind: string }>
    > = [];
    const llmCall = (systemPrompt: string, userPrompt: string) => {
      if (systemPrompt.includes("Author a concept-centered ontology Seed candidate")) {
        seedAuthorSystemPrompts.push(systemPrompt);
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
    expect(result.finalOutputText).toContain("full_integral_exploration");
    expect(result.finalOutputText).toContain("Runtime Artifact Truth Footer");
    expect(result.finalOutputText).toContain(result.reconstructRecordPath);
    expect(result.finalOutputText).not.toContain("mock");

    const seedCandidate = await readYaml<ReconstructSeedCandidateArtifact>(
      result.artifactRefs.seed_candidate!,
    );
    expect(seedCandidate.seed_schema_version).toBe("transitional");
    expect(seedCandidate.top_level_concepts?.[0]?.concept_id)
      .toBe("concept-fixture-service");
    expect(seedCandidate.top_level_relations?.[0]).toBeUndefined();
    expect(seedCandidate.frontier_pressure_log?.[0]).toMatchObject({
      pressure_id: "pressure-fixture-evidence",
      status: "non_blocking",
    });
    expect(seedCandidate.lifecycle?.pressure_events[0]).toMatchObject({
      pressure_id: "pressure-fixture-evidence",
      new_status: "non_blocking",
    });
    expect(confirmationClaimSummaries[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claim_id: "concept-fixture-service",
          claim_kind: "top_level_concept",
        }),
        expect.objectContaining({
          claim_id: "question-1",
          claim_kind: "supported_question",
        }),
        expect.objectContaining({
          claim_id: "action-explain-fixture-service",
          claim_kind: "supported_action",
        }),
      ]),
    );
    expect(seedAuthorSystemPrompts[0]).toContain(
      '"material_kinds":["<target_material_kind from source_refs>"]',
    );
    expect(seedAuthorSystemPrompts[0]).not.toContain(
      '"material_kinds":["code"]',
    );
    expect(seedAuthorSystemPrompts[0]).toContain(
      "material_coverage_events.material_kinds allowed values: code|spreadsheet|document|database|mixed|unknown",
    );
    expect(seedAuthorSystemPrompts[0]).not.toContain(
      '"material_kinds":["code","spreadsheet","document","database","mixed","unknown"]',
    );
    expect(seedAuthorSystemPrompts[0]).not.toContain("code | spreadsheet");
    expect(result.metrics.answerability_summary).toMatchObject({
      supported_question_count: 1,
      supported_action_count: 1,
    });
    expect(result.finalOutputText).toContain("Seed Answerability");
    expect(result.finalOutputText).toContain("supported question question-1");
  });

  it("fails loud before normalization when direct-call Seed output hides retired projections", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "bad-retired-projection-run",
    );
    const llmCall = async (systemPrompt: string, userPrompt: string) => {
      const result = await fakeLiveLlm(systemPrompt, userPrompt);
      if (systemPrompt.includes("Author a concept-centered ontology Seed candidate")) {
        const raw = JSON.parse(result.text) as any;
        raw.top_level_concepts[0].core_relations = [];
        delete raw.migration_records;
        return {
          ...result,
          text: JSON.stringify(raw),
        };
      }
      return result;
    };

    await expect(runReconstruct({
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
    })).rejects.toThrow(/retained legacy or retired projection fields/);
  });

  it("keeps the same runner path usable for non-code material", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "spreadsheet-run",
    );

    const result = await runReconstruct({
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
    });

    expect(result.reconstructRecord.record_stage).toBe("completed");
    expect(result.reconstructRecord.target_material_kind).toBe("spreadsheet");
    expect(result.reconstructRecord.validation_summary.seed_candidate_status)
      .toBe("valid");
    expect(result.finalOutputText).toContain("Target material kind: spreadsheet");
  });

  it("selects every observation and leaves mixed material expansion explicit", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "mixed-run",
    );

    const result = await runReconstruct({
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
    });

    expect(result.reconstructRecord.target_material_kind).toBe("mixed");
    expect(result.metrics.source_observation_count).toBe(2);
    expect(result.metrics.selected_observation_count).toBe(2);
    expect(result.metrics.semantic_claim_count).toBeGreaterThanOrEqual(5);
    expect(result.metrics.confirmed_claim_count).toBeGreaterThan(0);
    expect(
      result.metrics.partial_claim_count +
      result.metrics.deferred_claim_count +
      result.metrics.rejected_claim_count,
    ).toBeGreaterThan(0);
    expect(result.metrics.competency_question_assessment_count)
      .toBe(result.metrics.competency_question_count);
    expect(result.metrics.failure_kind_counts.insufficient_evidence)
      .toBeGreaterThan(0);
    expect(result.metrics.revision_proposal_action_counts.extend)
      .toBeGreaterThan(0);
    expect(result.metrics.evidence_ref_count).toBeGreaterThanOrEqual(2);
    expect(result.metrics.unresolved_question_count).toBeGreaterThan(0);
    expect(result.stopDecision.decision).toBe("ask_user");
    expect(result.finalOutputText).toContain("Mixed target material requires");
    expect(result.finalOutputText).toContain("failure-1");
    expect(result.finalOutputText).toContain("proposal-1");
    expect(result.finalOutputText).toContain(result.artifactRefs.seed_candidate!);
    expect(result.finalOutputText)
      .toContain(result.artifactRefs.revision_proposal!);
  });
});
