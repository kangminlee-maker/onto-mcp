import { describe, expect, it } from "vitest";
import path from "node:path";
import type {
  ReconstructOntologySeedArtifact,
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructMetricsArtifact,
  ReconstructRunManifestArtifact,
  ReconstructRunManifestValidationArtifact,
  ReconstructSeedAuthoringReadinessValidationArtifact,
  ReconstructSeedConfirmationValidationArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructStopDecisionArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import { RECONSTRUCT_STAGE_IDS } from "./artifact-types.js";
import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
} from "./contract-registry.js";
import {
  validateHandoffDecision,
  validatePostMaturationGateProjection,
  validateReconstructRunManifest,
} from "./terminal-validation.js";

const registryPath = path.resolve(
  ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
);

const now = "2026-05-29T00:00:00.000Z";

function validArtifact<T extends { validation_status: "valid" | "invalid" }>(
  extra: Omit<T, "validation_status">,
): T {
  return { ...extra, validation_status: "valid" } as T;
}

function metrics(): ReconstructMetricsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    source_observation_count: 1,
    selected_observation_count: 1,
    semantic_claim_count: 0,
    evidence_ref_count: 0,
    confirmed_claim_count: 0,
    rejected_claim_count: 0,
    partial_claim_count: 0,
    deferred_claim_count: 0,
    competency_question_count: 0,
    competency_question_assessment_count: 0,
    unresolved_question_count: 0,
    deferred_count: 0,
    answerability_summary: {
      declared_question_count: 0,
      supported_question_count: 0,
      deferred_question_count: 0,
      unsupported_question_count: 0,
      supported_action_count: 0,
      unsupported_action_count: 0,
    },
    claim_realization_stance_counts: {
      observed_runtime_behavior: 0,
      declared_design_intent: 0,
      schema_or_contract_presence: 0,
      test_or_fixture_only: 0,
      deferred_or_non_goal: 0,
      unknown: 0,
    },
    confirmation_state_counts: {
      accepted: 0,
      rejected: 0,
      partial: 0,
      deferred: 0,
    },
    competency_question_answer_status_counts: {
      answerable: 0,
      partially_answerable: 0,
      unsupported: 0,
      deferred: 0,
      contradicted: 0,
      not_applicable: 0,
    },
    failure_kind_counts: {
      unsupported_claim: 0,
      unanswered_question: 0,
      contradicted_evidence: 0,
      insufficient_evidence: 0,
      deferred_scope: 0,
      out_of_scope: 0,
    },
    revision_proposal_action_counts: {
      reuse: 0,
      extend: 0,
      rename: 0,
      split: 0,
      reject: 0,
      defer: 0,
    },
    pass_rate: 1,
    validation_status: {
      target_material_profile: "valid",
      source_observation_directive: "valid",
      candidate_disposition: "not_applicable",
      ontology_seed: "not_applicable",
      seed_confirmation: "accepted",
      claim_realization: "not_applicable",
      seed_confirmation_validation: "valid",
      competency_questions: "not_applicable",
      competency_question_assessment: "not_applicable",
      failure_classification: "not_applicable",
      revision_proposal: "not_applicable",
    },
  };
}

function manifest(sourceFrontierRef: string | null): ReconstructRunManifestArtifact {
  return {
    artifact_refs: {
      source_observations: "/tmp/source-observations.yaml",
      source_frontier: sourceFrontierRef,
      stop_decision: "/tmp/stop-decision.yaml",
    },
  } as ReconstructRunManifestArtifact;
}

function sourceScoutPackValidation(
  sourceScoutPackRef: string,
): ReconstructSourceScoutPackValidationArtifact {
  return validArtifact<ReconstructSourceScoutPackValidationArtifact>({
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    source_scout_pack_ref: sourceScoutPackRef,
    source_observations_ref: "/tmp/source-observations.yaml",
    source_observations_sha256: null,
    source_safety_ledger_ref: null,
    source_safety_ledger_sha256: null,
    source_safety_ledger_validation_ref: null,
    source_safety_ledger_validation_sha256: null,
    target_material_profile_validation_ref: null,
    target_material_profile_validation_sha256: null,
    source_observation_lineage_index_validation_ref: null,
    source_observation_lineage_index_validation_sha256: null,
    scout_scope: {
      scope_state: "supported_single_member_code_or_document",
      target_material_kind: "code",
      support_status: "supported",
      limitation_reason: null,
    },
    signal_row_count: 0,
    prompt_visible_signal_count: 0,
    coverage_slot_count: 0,
    validation_results: ["valid"],
    violations: [],
  });
}

function multiRoundManifest(): ReconstructRunManifestArtifact {
  return {
    artifact_refs: {
      source_observations: "/tmp/source-observations.yaml",
      stop_decision: "/tmp/stop-decision.yaml",
    },
    steps: [
      {
        artifact_refs: [
          "/tmp/rounds/round-1/source-frontier.yaml",
          "/tmp/rounds/round-1/source-frontier-validation.yaml",
          "/tmp/rounds/round-2/source-frontier.yaml",
        ],
      },
    ],
  } as ReconstructRunManifestArtifact;
}

async function validateFixture(args: {
  manifest: ReconstructRunManifestArtifact;
  stopDecision?: ReconstructStopDecisionArtifact["decision"];
  ontologySeed?: ReconstructOntologySeedArtifact | null;
  competencyQuestionAssessment?: ReconstructCompetencyQuestionAssessmentArtifact | null;
  sourceFrontierValidation?: { validation_status: "valid" | "invalid" } | null;
  sourceScoutPackValidation?: ReconstructSourceScoutPackValidationArtifact | null;
  sourceScoutPackPreSeedValidation?:
    ReconstructSourceScoutPackValidationArtifact | null;
  sourceScoutPackPostMaturationValidation?:
    ReconstructSourceScoutPackValidationArtifact | null;
  validationArtifactRefs?: Record<string, string | null | undefined>;
  contractRegistry?: ReconstructContractRegistry;
}) {
  const contractRegistry =
    args.contractRegistry ?? await loadReconstructContractRegistry({ registryPath });
  return validateHandoffDecision({
    stopDecision: {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      decision: args.stopDecision ?? "continue",
      declared_purpose: "test",
      metrics_ref: null,
      rationale: "test",
      next_actions: [],
      directive_author: { owner: "mock", author_id: "test" },
    } satisfies ReconstructStopDecisionArtifact,
    stopDecisionRef: "/tmp/stop-decision.yaml",
    manifestValidation: validArtifact<ReconstructRunManifestValidationArtifact>({
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      reconstruct_run_manifest_ref: null,
      completed_step_count: 1,
      skipped_step_count: 0,
      validation_results: ["valid"],
      violations: [],
    }),
    manifestValidationRef: "/tmp/reconstruct-run-manifest.pre-handoff-validation.yaml",
    manifest: args.manifest,
    ontologySeed: args.ontologySeed ?? null,
    competencyQuestionAssessment: args.competencyQuestionAssessment ?? null,
    predicateFacts: { sourceObservationCount: 1 },
    validationArtifactRefs: args.validationArtifactRefs,
    metrics: metrics(),
    targetMaterialProfileValidation:
      validArtifact<ReconstructTargetMaterialProfileValidationArtifact>({
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        target_material_profile_ref: null,
        registry_ref: registryPath,
        target_ref_count: 1,
        selected_source_profile_count: 1,
        validation_results: ["valid"],
        violations: [],
      } as Omit<ReconstructTargetMaterialProfileValidationArtifact, "validation_status">),
    sourceObservationDirectiveValidation:
      validArtifact<ReconstructSourceObservationDirectiveValidationArtifact>({
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        directive_ref: null,
        source_observations_ref: null,
        selected_observation_count: 1,
        validation_results: ["valid"],
        violations: [],
      }),
    sourceFrontierValidation: args.sourceFrontierValidation ?? null,
    sourceScoutPackValidation: args.sourceScoutPackValidation ?? null,
    sourceScoutPackPreSeedValidation:
      args.sourceScoutPackPreSeedValidation ?? null,
    sourceScoutPackPostMaturationValidation:
      args.sourceScoutPackPostMaturationValidation ?? null,
    candidateDispositionValidation: null,
    seedAuthoringReadinessValidation:
      validArtifact<ReconstructSeedAuthoringReadinessValidationArtifact>({
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        seed_authoring_readiness_ref: "/tmp/seed-authoring-readiness.yaml",
        source_purpose_candidates_validation_ref: null,
        purpose_confirmation_validation_ref: null,
        source_scout_pack_validation_ref: null,
        material_admission_ledger_ref: null,
        candidate_disposition_validation_ref: null,
        readiness_classification: "seed_ready",
        closure_row_count: 0,
        validation_results: ["valid"],
        violations: [],
      }),
    ontologySeedValidation: null,
    claimRealizationMapValidation: null,
    competencyQuestionsValidation: null,
    competencyQuestionAssessmentValidation: null,
    seedConfirmationValidation:
      validArtifact<ReconstructSeedConfirmationValidationArtifact>({
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        seed_confirmation_ref: null,
        ontology_seed_ref: null,
        ontology_seed_validation_ref: null,
        accepted_claim_ids: [],
        rejected_claim_ids: [],
        partial_claim_ids: [],
        deferred_claim_ids: [],
        cq_eligible_claim_ids: [],
        validation_results: ["valid"],
        violations: [],
      }),
    failureClassificationValidation: null,
    revisionProposalValidation: null,
    contractRegistry,
  });
}

describe("terminal reconstruct validation", () => {
  it("does not reject continue decisions as seed-readiness inconsistency", async () => {
    const result = await validateFixture({
      manifest: manifest(null),
    });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "handoff_decision_inconsistent" &&
      violation.subject_id === "continue"
    )).toBe(false);
  });

  it("requires seed validation for seed iteration readiness even when the seed artifact is absent", async () => {
    const result = await validateFixture({
      manifest: manifest(null),
    });

    const seedGate = result.gate_projection.find((gate) =>
      gate.gate_id === "ontology_seed_gate"
    );

    expect(seedGate?.predicate_truth_expression).toBe(
      "seed_validity_projection_requested or seed_iteration_readiness_projection_requested",
    );
    expect(seedGate?.applicability).toBe("applicable");
    expect(seedGate?.validation_status).toBe("not_available");
    expect(result.violations.some((violation) =>
      violation.subject_id === "ontology_seed_gate"
    )).toBe(true);
  });

  it("projects pre-seed SourceScoutPack snapshot validation as its own gate authority", async () => {
    const preSeedPackRef = "/tmp/source-scout-pack.pre-seed.yaml";
    const preSeedValidationRef =
      "/tmp/source-scout-pack-validation.pre-seed.yaml";
    const result = await validateFixture({
      manifest: {
        ...manifest(null),
        artifact_refs: {
          ...manifest(null).artifact_refs,
          source_scout_pack_pre_seed: preSeedPackRef,
          source_scout_pack_validation_pre_seed: preSeedValidationRef,
        },
      } as ReconstructRunManifestArtifact,
      sourceScoutPackPreSeedValidation:
        sourceScoutPackValidation(preSeedPackRef),
    });

    const preSeedGate = result.gate_projection.find((gate) =>
      gate.gate_id === "source_scout_pack_pre_seed_gate"
    );

    expect(preSeedGate?.applicability).toBe("applicable");
    expect(preSeedGate?.concrete_validation_artifact_ref)
      .toBe(preSeedValidationRef);
    expect(preSeedGate?.validation_status).toBe("valid");
  });

  it("projects post-maturation SourceScoutPack snapshot validation as its own gate authority", async () => {
    const postMaturationPackRef = "/tmp/source-scout-pack.post-maturation.yaml";
    const postMaturationValidationRef =
      "/tmp/source-scout-pack-validation.post-maturation.yaml";
    const result = await validateFixture({
      manifest: {
        ...manifest(null),
        artifact_refs: {
          ...manifest(null).artifact_refs,
          source_scout_pack_post_maturation: postMaturationPackRef,
          source_scout_pack_validation_post_maturation:
            postMaturationValidationRef,
        },
      } as ReconstructRunManifestArtifact,
      sourceScoutPackPostMaturationValidation:
        sourceScoutPackValidation(postMaturationPackRef),
    });

    const postMaturationGate = result.gate_projection.find((gate) =>
      gate.gate_id === "source_scout_pack_post_maturation_gate"
    );

    expect(postMaturationGate?.applicability).toBe("applicable");
    expect(postMaturationGate?.concrete_validation_artifact_ref)
      .toBe(postMaturationValidationRef);
    expect(postMaturationGate?.validation_status).toBe("valid");
  });

  it("validates post-maturation gate projection as a later terminal-equivalent authority", async () => {
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const postMaturationPackRef = "/tmp/source-scout-pack.post-maturation.yaml";
    const postMaturationValidationRef =
      "/tmp/source-scout-pack-validation.post-maturation.yaml";
    const result = validatePostMaturationGateProjection({
      sessionId: "session-1",
      contractRegistry,
      sourceScoutPackPostMaturationRef: postMaturationPackRef,
      sourceScoutPackPostMaturationValidationRef: postMaturationValidationRef,
      sourceScoutPackPostMaturationValidation:
        sourceScoutPackValidation(postMaturationPackRef),
    });

    expect(result.validation_status).toBe("valid");
    expect(result.projection_scope).toBe("post_maturation_source_scout_gate");
    expect(result.source_scout_pack_post_maturation_ref)
      .toBe(postMaturationPackRef);
    expect(result.source_scout_pack_validation_post_maturation_ref)
      .toBe(postMaturationValidationRef);
    expect(result.gate_projection).toEqual([
      expect.objectContaining({
        gate_id: "source_scout_pack_post_maturation_gate",
        applicability: "applicable",
        concrete_validation_artifact_ref: postMaturationValidationRef,
        validation_status: "valid",
      }),
    ]);
  });

  it("rejects latest-current aliases in post-maturation gate projection", async () => {
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = validatePostMaturationGateProjection({
      sessionId: "session-1",
      contractRegistry,
      sourceScoutPackPostMaturationRef: "/tmp/source-scout-pack.yaml",
      sourceScoutPackPostMaturationValidationRef:
        "/tmp/source-scout-pack-validation.yaml",
      sourceScoutPackPostMaturationValidation:
        sourceScoutPackValidation("/tmp/source-scout-pack.yaml"),
    });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.map((violation) => violation.code))
      .toContain("source_ref_mismatch");
  });

  it("rejects same-basename post-maturation snapshots from another session", async () => {
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = validatePostMaturationGateProjection({
      sessionId: "session-1",
      contractRegistry,
      sourceScoutPackPostMaturationRef:
        "/tmp/session-b/source-scout-pack.post-maturation.yaml",
      sourceScoutPackPostMaturationValidationRef:
        "/tmp/session-a/source-scout-pack-validation.post-maturation.yaml",
      sourceScoutPackPostMaturationValidation:
        sourceScoutPackValidation(
          "/tmp/session-b/source-scout-pack.post-maturation.yaml",
        ),
    });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.map((violation) => violation.code))
      .toContain("source_ref_mismatch");
  });

  it("folds ontology seed iteration readiness into terminal readiness", async () => {
    const baseRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = await validateFixture({
      manifest: manifest(null),
      stopDecision: "stop",
      contractRegistry: {
        ...baseRegistry,
        validation_gate_catalog: [],
      },
      ontologySeed: {
        ontology_handoff: {
          readiness_claim: "limited",
        },
      },
    });

    expect(result.readiness_projection).toBe("limited");
  });

  it("folds competency assessment downstream effects into terminal readiness", async () => {
    const baseRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = await validateFixture({
      manifest: manifest(null),
      stopDecision: "stop",
      contractRegistry: {
        ...baseRegistry,
        validation_gate_catalog: [],
      },
      competencyQuestionAssessment: {
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        competency_questions_ref: null,
        competency_questions_validation_ref: null,
        assessments: [
          {
            question_id: "cq-1",
            answer_status: "deferred",
            answer_summary: "missing confirmation",
            required_seed_refs: [],
            linked_claim_ids: [],
            evidence_refs: [],
            missing_source_or_confirmation: "confirmation missing",
            ambiguity_notes: [],
            downstream_effect: "blocked_by_missing_source_or_confirmation",
            rationale: "blocked for handoff",
          },
        ],
        directive_author: { owner: "mock", author_id: "test" },
      },
    });

    expect(result.readiness_projection).toBe("blocked");
  });

  it("requires failure classification when the run manifest records a runtime halt", async () => {
    const result = await validateFixture({
      manifest: {
        ...manifest(null),
        steps: [
          {
            step_id: "ontology_seed",
            owner: "host_llm",
            performed_by: {
              authority: "host_llm",
              realization: "direct_call",
              actor_id: "author",
            },
            status: "failed",
            artifact_refs: [],
          },
        ],
      } as ReconstructRunManifestArtifact,
    });

    const failureGate = result.gate_projection.find((gate) =>
      gate.gate_id === "failure_classification_gate"
    );

    expect(failureGate?.predicate_truth_expression).toBe(
      "any_required_applicable_validation_artifact_missing_or_failed or runtime_halted == true or reconstruct_metrics.unresolved_question_count > 0",
    );
    expect(failureGate?.applicability).toBe("applicable");
    expect(failureGate?.validation_status).toBe("not_available");
    expect(result.violations.some((violation) =>
      violation.subject_id === "failure_classification_gate"
    )).toBe(true);
  });

  it("evaluates aggregate gate predicates against the complete gate projection", async () => {
    const baseRegistry = await loadReconstructContractRegistry({ registryPath });
    const failureGate = baseRegistry.validation_gate_catalog.find((gate) =>
      gate.gate_id === "failure_classification_gate"
    );
    expect(failureGate).toBeDefined();
    const result = await validateFixture({
      manifest: manifest(null),
      contractRegistry: {
        ...baseRegistry,
        validation_gate_catalog: [
          failureGate!,
          ...baseRegistry.validation_gate_catalog.filter((gate) =>
            gate.gate_id !== "failure_classification_gate"
          ),
        ],
      },
    });

    const ontologySeedGate = result.gate_projection.find((gate) =>
      gate.gate_id === "ontology_seed_gate"
    );
    const failureClassificationGate = result.gate_projection.find((gate) =>
      gate.gate_id === "failure_classification_gate"
    );

    expect(ontologySeedGate?.validation_status).toBe("not_available");
    expect(failureClassificationGate?.applicability).toBe("applicable");
    expect(failureClassificationGate?.validation_status).toBe("not_available");
    expect(result.violations.some((violation) =>
      violation.subject_id === "failure_classification_gate"
    )).toBe(true);
  });

  it("does not certify missing final output or record artifacts as completed", async () => {
    const result = await validateReconstructRunManifest({
      manifest: {
        schema_version: "1",
        session_id: "session-1",
        entrypoint: "reconstruct",
        created_at: now,
        completed_at: now,
        target_refs: [],
        intent: "test",
        execution_profile: {
          profile_kind: "full_integral_exploration",
          runner: "integral-exploration-direct-call",
          semantic_author_realization: "direct_call",
          confirmation_provider_realization: "direct_call",
          directive_author_id: "author",
          confirmation_provider_id: "provider",
          allowed_completion_claim: "test",
        },
        artifact_refs: {
          final_output: "/tmp/onto-missing-final-output.md",
          reconstruct_record: "/tmp/onto-missing-reconstruct-record.yaml",
        },
        governing_snapshot: null,
        purpose_adequacy_scope: {
          implemented_artifacts: [],
          deferred_artifacts: [],
          deferred_reason: "test",
        },
        steps: [
          {
            step_id: "final_output",
            owner: "host_llm",
            performed_by: {
              authority: "host_llm",
              realization: "direct_call",
              actor_id: "author",
            },
            status: "completed",
            artifact_refs: ["/tmp/onto-missing-final-output.md"],
          },
          {
            step_id: "record_assembly",
            owner: "runtime",
            performed_by: {
              authority: "runtime",
              realization: "runtime",
              actor_id: "reconstruct-runtime",
            },
            status: "completed",
            artifact_refs: ["/tmp/onto-missing-reconstruct-record.yaml"],
          },
        ],
        runtime_boundary: {
          semantic_generation: "not_performed",
          semantic_authority: "host_llm_or_mock_author",
        },
      } as ReconstructRunManifestArtifact,
    });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "manifest_artifact_missing" &&
      violation.subject_id === "final_output"
    )).toBe(true);
    expect(result.violations.some((violation) =>
      violation.code === "manifest_artifact_missing" &&
      violation.subject_id === "record_assembly"
    )).toBe(true);
  });

  it("projects conditional frontier validation as not applicable from registry predicate inputs", async () => {
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = validateHandoffDecision({
      stopDecision: {
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        decision: "continue",
        declared_purpose: "test",
        metrics_ref: null,
        rationale: "test",
        next_actions: [],
        directive_author: { owner: "mock", author_id: "test" },
      } satisfies ReconstructStopDecisionArtifact,
      stopDecisionRef: "/tmp/stop-decision.yaml",
      manifestValidation: validArtifact<ReconstructRunManifestValidationArtifact>({
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        reconstruct_run_manifest_ref: null,
        completed_step_count: 1,
        skipped_step_count: 0,
        validation_results: ["valid"],
        violations: [],
      }),
      manifestValidationRef: "/tmp/reconstruct-run-manifest.pre-handoff-validation.yaml",
      manifest: manifest(null),
      predicateFacts: { sourceObservationCount: 1 },
      metrics: metrics(),
      targetMaterialProfileValidation:
        validArtifact<ReconstructTargetMaterialProfileValidationArtifact>({
          schema_version: "1",
          session_id: "session-1",
          created_at: now,
          target_material_profile_ref: null,
          registry_ref: registryPath,
          target_ref_count: 1,
          selected_source_profile_count: 1,
          validation_results: ["valid"],
          violations: [],
        } as Omit<ReconstructTargetMaterialProfileValidationArtifact, "validation_status">),
      sourceObservationDirectiveValidation:
        validArtifact<ReconstructSourceObservationDirectiveValidationArtifact>({
          schema_version: "1",
          session_id: "session-1",
          created_at: now,
          directive_ref: null,
          source_observations_ref: null,
          selected_observation_count: 1,
          validation_results: ["valid"],
          violations: [],
        }),
      sourceFrontierValidation: null,
      candidateDispositionValidation: null,
      seedAuthoringReadinessValidation:
        validArtifact<ReconstructSeedAuthoringReadinessValidationArtifact>({
          schema_version: "1",
          session_id: "session-1",
          created_at: now,
          seed_authoring_readiness_ref: "/tmp/seed-authoring-readiness.yaml",
          source_purpose_candidates_validation_ref: null,
          purpose_confirmation_validation_ref: null,
          source_scout_pack_validation_ref: null,
          material_admission_ledger_ref: null,
          candidate_disposition_validation_ref: null,
          readiness_classification: "seed_ready",
          closure_row_count: 0,
          validation_results: ["valid"],
          violations: [],
        }),
      ontologySeedValidation: null,
      claimRealizationMapValidation: null,
      competencyQuestionsValidation: null,
      competencyQuestionAssessmentValidation: null,
      seedConfirmationValidation:
        validArtifact<ReconstructSeedConfirmationValidationArtifact>({
          schema_version: "1",
          session_id: "session-1",
          created_at: now,
          seed_confirmation_ref: null,
          ontology_seed_ref: null,
          ontology_seed_validation_ref: null,
          accepted_claim_ids: [],
          rejected_claim_ids: [],
          partial_claim_ids: [],
          deferred_claim_ids: [],
          cq_eligible_claim_ids: [],
          validation_results: ["valid"],
          violations: [],
        }),
      failureClassificationValidation: null,
      revisionProposalValidation: null,
      contractRegistry,
    });

    const frontierGate = result.gate_projection.find((gate) =>
      gate.gate_id === "source_frontier_gate"
    );

    expect(frontierGate?.predicate_truth_expression).toBe(
      "artifact_exists(rounds/<round-id>/source-frontier.yaml)",
    );
    expect(frontierGate?.predicate_input_authority_refs).toEqual([
      "rounds/<round-id>/source-frontier.yaml",
    ]);
    expect(frontierGate?.predicate_concrete_input_refs).toEqual([]);
    expect(frontierGate?.applicability).toBe("not_applicable");
    expect(frontierGate?.validation_status).toBe("not_applicable");
    expect(
      result.violations.some((violation) =>
        violation.subject_id === "source_frontier_gate"
      ),
    ).toBe(false);
  });

  it("keeps round-scoped frontier gate instances separate", async () => {
    const result = await validateFixture({
      manifest: multiRoundManifest(),
      sourceFrontierValidation: { validation_status: "valid" },
      validationArtifactRefs: {
        "source-frontier-validation.yaml":
          "/tmp/rounds/round-1/source-frontier-validation.yaml",
      },
    });

    const frontierGates = result.gate_projection.filter((gate) =>
      gate.gate_id === "source_frontier_gate"
    );
    expect(frontierGates.map((gate) => gate.round_id)).toEqual([
      "round-1",
      "round-2",
    ]);
    expect(frontierGates.map((gate) => gate.gate_instance_id)).toEqual([
      "source_frontier_gate:round-1",
      "source_frontier_gate:round-2",
    ]);
    expect(frontierGates[0]?.validation_status).toBe("valid");
    expect(frontierGates[1]?.validation_status).toBe("not_available");
    expect(result.violations.some((violation) =>
      violation.subject_id === "source_frontier_gate:round-2"
    )).toBe(true);
  });

  it("fails closed for unsupported active registry predicate expressions", async () => {
    const baseRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = await validateFixture({
      manifest: manifest(null),
      contractRegistry: {
        ...baseRegistry,
        validation_gate_catalog: [
          ...baseRegistry.validation_gate_catalog,
          {
            gate_id: "future_gate",
            validation_artifact_ref: "future-validation.yaml",
            required_when: "future_predicate",
          },
        ],
        required_when_predicate_catalog: [
          ...baseRegistry.required_when_predicate_catalog,
          {
            predicate_id: "future_predicate",
            input_authority_refs: [],
            truth_expression: "future_runtime_expression()",
            unknown_projection: "not_applicable",
            explanation_template: "Future predicate.",
            predicate_phase: "gate_applicability",
            predicate_evaluator_id: "future-evaluator",
            predicate_evaluator_version: 1,
          },
        ],
      },
    });

    const futureGate = result.gate_projection.find((gate) =>
      gate.gate_id === "future_gate"
    );
    expect(futureGate?.applicability).toBe("unknown");
    expect(futureGate?.validation_status).toBe("not_available");
    expect(futureGate?.explanation).toContain(
      "Unsupported required_when truth expression",
    );
    expect(result.violations.some((violation) =>
      violation.subject_id === "future_gate"
    )).toBe(true);
  });

  it("fails closed instead of aliasing the reserved revision_possible predicate", async () => {
    const baseRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = await validateFixture({
      manifest: manifest(null),
      contractRegistry: {
        ...baseRegistry,
        validation_gate_catalog: [
          ...baseRegistry.validation_gate_catalog,
          {
            gate_id: "reserved_revision_possible_gate",
            validation_artifact_ref: "revision-proposal-validation.yaml",
            required_when: "reserved_revision_possible",
          },
        ],
        required_when_predicate_catalog: [
          ...baseRegistry.required_when_predicate_catalog,
          {
            predicate_id: "reserved_revision_possible",
            input_authority_refs: [
              "failure-classification-validation.yaml",
              "reconstruct-metrics.yaml",
            ],
            truth_expression:
              "failure_classification_validation.status == pass and failure_classification_validation.revision_possible == true",
            unknown_projection: "blocked",
            explanation_template:
              "A reserved revision-possible predicate requires a dedicated evaluator.",
            predicate_phase: "gate_applicability",
            predicate_evaluator_id: "reconstruct_registry_predicate_v1",
            predicate_evaluator_version: 1,
          },
        ],
      },
    });

    const reservedGate = result.gate_projection.find((gate) =>
      gate.gate_id === "reserved_revision_possible_gate"
    );
    expect(reservedGate?.applicability).toBe("unknown");
    expect(reservedGate?.explanation).toContain(
      "Unsupported required_when truth expression",
    );
    expect(result.violations.some((violation) =>
      violation.subject_id === "reserved_revision_possible_gate"
    )).toBe(true);
  });
});

function clone<T>(value: T): T {
  return structuredClone(value);
}

// Valid base for validateReconstructRunManifest: every required stage is
// present as a `skipped` step (skipped steps bypass artifact-ref checks), and
// a truthy governing_snapshot satisfies the snapshot-presence guard when no
// registry validation inputs are supplied. This base validates as "valid".
function validRunManifest(): ReconstructRunManifestArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    entrypoint: "reconstruct",
    created_at: now,
    completed_at: now,
    target_refs: [],
    intent: "test",
    execution_profile: {
      profile_kind: "full_integral_exploration",
      runner: "integral-exploration-direct-call",
      semantic_author_realization: "direct_call",
      confirmation_provider_realization: "direct_call",
      directive_author_id: "author",
      confirmation_provider_id: "provider",
      allowed_completion_claim: "test",
    },
    artifact_refs: {},
    governing_snapshot: { registry: { registry_id: "r" } },
    purpose_adequacy_scope: {
      implemented_artifacts: [],
      deferred_artifacts: [],
      deferred_reason: "test",
    },
    steps: RECONSTRUCT_STAGE_IDS.map((stageId) => ({
      step_id: stageId,
      owner: "runtime",
      performed_by: {
        authority: "runtime",
        realization: "runtime",
        actor_id: "reconstruct-runtime",
      },
      status: "skipped",
      artifact_refs: [],
    })),
    runtime_boundary: {
      semantic_generation: "not_performed",
      semantic_authority: "host_llm_or_mock_author",
    },
  } as ReconstructRunManifestArtifact;
}

describe("validateReconstructRunManifest rejection branches", () => {
  it("validates the base fixture as valid before mutation", async () => {
    const result = await validateReconstructRunManifest({
      manifest: validRunManifest(),
    });
    expect(result.validation_status).toBe("valid");
    expect(result.violations).toEqual([]);
  });

  it("rejects a manifest that omits a required stage step", async () => {
    const base = validRunManifest();
    const mutated = clone(base);
    mutated.steps = mutated.steps.filter(
      (step) => step.step_id !== "stop_decision",
    );
    const result = await validateReconstructRunManifest({ manifest: mutated });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "manifest_step_missing" &&
      violation.subject_id === "stop_decision"
    )).toBe(true);
  });

  it("rejects a completed step that records no artifact refs", async () => {
    const base = validRunManifest();
    const mutated = clone(base);
    const step = mutated.steps.find((candidate) =>
      candidate.step_id === "stop_decision"
    );
    step!.status = "completed";
    step!.artifact_refs = [];
    const result = await validateReconstructRunManifest({ manifest: mutated });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "manifest_artifact_ref_missing" &&
      violation.subject_id === "stop_decision"
    )).toBe(true);
  });

  it("rejects a manifest with no governing snapshot when registry inputs are absent", async () => {
    const base = validRunManifest();
    const mutated = clone(base);
    (mutated as { governing_snapshot: unknown }).governing_snapshot = null;
    const result = await validateReconstructRunManifest({ manifest: mutated });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "manifest_snapshot_missing" &&
      violation.subject_id === "governing_snapshot"
    )).toBe(true);
  });
});

describe("validatePostMaturationGateProjection rejection branches", () => {
  const postMaturationPackRef = "/tmp/source-scout-pack.post-maturation.yaml";
  const postMaturationValidationRef =
    "/tmp/source-scout-pack-validation.post-maturation.yaml";

  it("validates the base projection as valid before mutation", async () => {
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = validatePostMaturationGateProjection({
      sessionId: "session-1",
      contractRegistry,
      sourceScoutPackPostMaturationRef: postMaturationPackRef,
      sourceScoutPackPostMaturationValidationRef: postMaturationValidationRef,
      sourceScoutPackPostMaturationValidation:
        sourceScoutPackValidation(postMaturationPackRef),
    });
    expect(result.validation_status).toBe("valid");
    expect(result.violations).toEqual([]);
  });

  it("rejects a registry that lacks the post-maturation gate row", async () => {
    const baseRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = validatePostMaturationGateProjection({
      sessionId: "session-1",
      contractRegistry: {
        ...baseRegistry,
        validation_gate_catalog: baseRegistry.validation_gate_catalog.filter(
          (gate) => gate.gate_id !== "source_scout_pack_post_maturation_gate",
        ),
      },
      sourceScoutPackPostMaturationRef: postMaturationPackRef,
      sourceScoutPackPostMaturationValidationRef: postMaturationValidationRef,
      sourceScoutPackPostMaturationValidation:
        sourceScoutPackValidation(postMaturationPackRef),
    });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "unknown_id" &&
      violation.subject_id === "source_scout_pack_post_maturation_gate"
    )).toBe(true);
  });

  it("rejects a projection that is missing the post-maturation snapshot ref", async () => {
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = validatePostMaturationGateProjection({
      sessionId: "session-1",
      contractRegistry,
      sourceScoutPackPostMaturationRef: null,
      sourceScoutPackPostMaturationValidationRef: postMaturationValidationRef,
      sourceScoutPackPostMaturationValidation:
        sourceScoutPackValidation(postMaturationPackRef),
    });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "missing_required_ref" &&
      violation.subject_id === "source_scout_pack_post_maturation"
    )).toBe(true);
  });

  it("rejects a projection that is missing the post-maturation validation ref", async () => {
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = validatePostMaturationGateProjection({
      sessionId: "session-1",
      contractRegistry,
      sourceScoutPackPostMaturationRef: postMaturationPackRef,
      sourceScoutPackPostMaturationValidationRef: null,
      sourceScoutPackPostMaturationValidation:
        sourceScoutPackValidation(postMaturationPackRef),
    });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "handoff_required_validation_missing" &&
      violation.subject_id === "source_scout_pack_post_maturation_gate"
    )).toBe(true);
  });

  it("rejects a projection whose post-maturation validation is invalid", async () => {
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const validation = sourceScoutPackValidation(postMaturationPackRef);
    validation.validation_status = "invalid";
    const result = validatePostMaturationGateProjection({
      sessionId: "session-1",
      contractRegistry,
      sourceScoutPackPostMaturationRef: postMaturationPackRef,
      sourceScoutPackPostMaturationValidationRef: postMaturationValidationRef,
      sourceScoutPackPostMaturationValidation: validation,
    });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "handoff_required_validation_invalid" &&
      violation.subject_id === "source_scout_pack_post_maturation_gate"
    )).toBe(true);
  });
});

describe("validateHandoffDecision rejection branches", () => {
  it("rejects handoff when a required gate validation is missing", async () => {
    const result = await validateFixture({
      manifest: manifest(null),
    });

    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "handoff_required_validation_missing" &&
      violation.subject_id === "ontology_seed_gate"
    )).toBe(true);
  });

  it("rejects handoff when a required applicable gate validation is invalid", async () => {
    const preSeedPackRef = "/tmp/source-scout-pack.pre-seed.yaml";
    const preSeedValidationRef = "/tmp/source-scout-pack-validation.pre-seed.yaml";
    const invalidPreSeedValidation = sourceScoutPackValidation(preSeedPackRef);
    invalidPreSeedValidation.validation_status = "invalid";
    const result = await validateFixture({
      manifest: {
        ...manifest(null),
        artifact_refs: {
          ...manifest(null).artifact_refs,
          source_scout_pack_pre_seed: preSeedPackRef,
          source_scout_pack_validation_pre_seed: preSeedValidationRef,
        },
      } as ReconstructRunManifestArtifact,
      sourceScoutPackPreSeedValidation: invalidPreSeedValidation,
    });

    const preSeedGate = result.gate_projection.find((gate) =>
      gate.gate_id === "source_scout_pack_pre_seed_gate"
    );
    expect(preSeedGate?.applicability).toBe("applicable");
    expect(preSeedGate?.validation_status).toBe("invalid");
    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "handoff_required_validation_invalid" &&
      violation.subject_id === "source_scout_pack_pre_seed_gate"
    )).toBe(true);
  });

  it("rejects a stop decision when readiness projection is not ready", async () => {
    const baseRegistry = await loadReconstructContractRegistry({ registryPath });
    const result = await validateFixture({
      manifest: manifest(null),
      stopDecision: "stop",
      contractRegistry: {
        ...baseRegistry,
        validation_gate_catalog: [],
      },
      ontologySeed: {
        ontology_handoff: {
          readiness_claim: "blocked",
        },
      },
    });

    expect(result.readiness_projection).toBe("blocked");
    expect(result.validation_status).toBe("invalid");
    expect(result.violations.some((violation) =>
      violation.code === "handoff_decision_inconsistent" &&
      violation.subject_id === "stop"
    )).toBe(true);
  });
});
