/**
 * The run manifest — the run's own account of what it did, step by step, and who did each step.
 *
 * `createRunManifest` walks the completed run and emits one row per stage: completed or skipped,
 * which performer executed it (runtime, directive author, confirmation provider), and the witness
 * that proves it happened. `applyGracefulReachability` then marks the stages a graceful terminal
 * made unreachable, so a run that stopped early reads as "not reached" rather than "failed". The
 * realization types (`Reconstruct*Realization`) record WHICH backing implementation was wired, so a
 * manifest is comparable across runs.
 */
import { WITNESS_LESS_CONDITIONAL_STAGE_IDS } from "./artifact-types.js";
import type {
  ReconstructReachabilityStageWitness,
  ReconstructRecordArtifactRefs,
  ReconstructRunGoverningSnapshot,
  ReconstructRunManifestArtifact,
  ReconstructRunManifestStep,
  ReconstructStageId,
} from "./artifact-types.js";
import type { ReconstructConfirmationProvider } from "./confirmation-provider-contract.js";
import type { ReconstructDirectiveAuthor } from "./directive-author-contract.js";
import { mergedUnitExecutionTelemetry } from "./execution-telemetry.js";
import { isoNow } from "./run-primitives.js";

export type ReconstructSemanticAuthorRealization = "direct_call";

export type ReconstructConfirmationProviderRealization = "direct_call";

function completedStep(
  stepId: ReconstructStageId,
  owner: ReconstructRunManifestStep["owner"],
  performedBy: ReconstructRunManifestStep["performed_by"],
  artifactRefs: string[],
): ReconstructRunManifestStep {
  return {
    step_id: stepId,
    owner,
    performed_by: performedBy,
    status: "completed",
    artifact_refs: artifactRefs,
  };
}

function skippedStep(
  stepId: ReconstructStageId,
  owner: ReconstructRunManifestStep["owner"],
  performedBy: ReconstructRunManifestStep["performed_by"],
  reason: string,
  authorityImpact: string,
): ReconstructRunManifestStep {
  return {
    step_id: stepId,
    owner,
    performed_by: performedBy,
    status: "skipped",
    artifact_refs: [],
    reason,
    authority_impact: authorityImpact,
  };
}

function runtimePerformer(): ReconstructRunManifestStep["performed_by"] {
  return {
    authority: "runtime",
    realization: "runtime",
    actor_id: "onto-reconstruct-runtime",
  };
}

function directiveAuthorPerformer(
  directiveAuthor: ReconstructDirectiveAuthor,
): ReconstructRunManifestStep["performed_by"] {
  return {
    authority: "host_llm",
    realization: "direct_call",
    actor_id: directiveAuthor.authorId,
  };
}

function confirmationProviderPerformer(
  confirmationProvider: ReconstructConfirmationProvider,
): ReconstructRunManifestStep["performed_by"] {
  return {
    authority: "host_or_user",
    realization: "direct_call",
    actor_id: confirmationProvider.providerId,
  };
}

// The witness-less conditional lineage stages (canonical set in artifact-types.ts, shared with the
// reachability validator). Only these may carry `skip_kind: "legit_conditional"` on a graceful manifest.
const WITNESS_LESS_CONDITIONAL_STAGES: ReadonlySet<ReconstructStageId> = new Set(
  WITNESS_LESS_CONDITIONAL_STAGE_IDS,
);

/**
 * Input a graceful terminal (Slice 3) hands to the manifest builder so it can produce a
 * witness-truthful reachability manifest instead of the completed-run manifest. Derived entirely
 * from disk facts (design v2 §8): the disposition/terminal step from the terminal signal, the
 * witness ref + its stage witnesses from the always-written lineage census.
 */
export interface ReconstructGracefulTerminalManifestInput {
  disposition: "blocked" | "limited";
  terminalStepId: ReconstructStageId;
  /** Path to the lineage census (the reachability witness); null when the run stopped before it. */
  reachabilityWitnessRef: string | null;
  /** The lineage census's stage witnesses (empty when the lineage phase never ran). */
  lineageWitnesses: ReconstructReachabilityStageWitness[];
}

/**
 * Graceful-terminal reachability transform (design v2 §3). Rewrites one built manifest step to a
 * witness-truthful skip_kind so an un-wired stage cannot masquerade as a healthy completion:
 *   - completed WITH refs → kept (the artifact ref IS the witness it ran and produced).
 *   - completed with NO refs → the graceful terminal stopped before this stage; re-gated to
 *     skipped/not_reached. Without this, the completed-step ref check would false-flag
 *     manifest_artifact_ref_missing on every not-reached stage — the v0/v1 P1 failure. Covers ALL
 *     unconditional completedStep blocks uniformly (M7). invocation_binding is exempt (always
 *     reached, ref-less by design).
 *   - skipped witness-less lineage stage → legit_conditional when the census witnessed it ran (the
 *     validator confirms legit_no_op independently), else not_reached (the lineage phase never ran).
 *   - any other skipped stage → not_reached.
 */
function applyGracefulReachability(
  step: ReconstructRunManifestStep,
  ranLineageStages: ReadonlySet<ReconstructStageId>,
): ReconstructRunManifestStep {
  if (step.step_id === "invocation_binding") return step;
  if (step.status === "completed") {
    if (step.artifact_refs.length > 0) return step;
    return {
      ...step,
      status: "skipped",
      skip_kind: "not_reached",
      reason: "stage not reached before the graceful terminal disposition",
      authority_impact:
        "no artifact was produced; the graceful terminal stopped the run before this stage",
    };
  }
  if (step.status === "skipped") {
    if (WITNESS_LESS_CONDITIONAL_STAGES.has(step.step_id)) {
      return ranLineageStages.has(step.step_id)
        ? { ...step, skip_kind: "legit_conditional" }
        : { ...step, skip_kind: "not_reached" };
    }
    return { ...step, skip_kind: "not_reached" };
  }
  return step; // failed steps are out of graceful reachability scope
}

export function createRunManifest(args: {
  sessionId: string;
  targetRefs: string[];
  intent: string;
  semanticAuthorRealization: ReconstructSemanticAuthorRealization;
  confirmationProviderRealization: ReconstructConfirmationProviderRealization;
  directiveAuthor: ReconstructDirectiveAuthor;
  confirmationProvider: ReconstructConfirmationProvider;
  artifactRefs: ReconstructRecordArtifactRefs;
  reconstructRecordPath: string;
  governingSnapshot: ReconstructRunGoverningSnapshot;
  terminalArtifactsCompleted: boolean;
  dispatchFallbackOutcomeRef?: string;
  /**
   * Present only for a graceful terminal (Slice 3). When set, the built steps are rewritten to a
   * witness-truthful reachability manifest, the graceful_terminal marker is emitted, and the
   * completion claim is downgraded to a truthful blocked/limited statement. Absent on completed and
   * pre-handoff runs — the output is then byte-identical to before this parameter existed.
   */
  graceful?: ReconstructGracefulTerminalManifestInput;
}): ReconstructRunManifestArtifact {
  const ranLineageStages = new Set<ReconstructStageId>(
    (args.graceful?.lineageWitnesses ?? []).map((w) => w.step_id),
  );
  // A graceful terminal (design §16.3-a) reaches here with terminalArtifactsCompleted=false, but
  // its caller (assembleGracefulTerminal) has already set the produced refs (final_output, record)
  // to real paths and the unproduced ones to null. The blanket-null below would erase the produced
  // refs, so the graceful path bypasses it and trusts the caller's refs verbatim.
  const artifactRefs = args.terminalArtifactsCompleted || args.graceful
    ? args.artifactRefs
    : {
      ...args.artifactRefs,
      handoff_decision_validation: null,
      maturation_baseline: null,
      maturation_baseline_validation: null,
      baseline_actionability_matrix: null,
      baseline_actionability_matrix_validation: null,
      maturation_value_discharge: null,
      maturation_value_discharge_validation: null,
      maturation_value_discharge_census: null,
      actionability_matrix: null,
      actionability_matrix_validation: null,
      maturation_question_frontier: null,
      maturation_question_frontier_validation: null,
      maturation_closure_frontier: null,
      maturation_closure_frontier_validation: null,
      maturation_authority_response: null,
      maturation_authority_response_validation: null,
      answer_support_ledger: null,
      answer_support_ledger_validation: null,
      answer_support_judgment: null,
      answer_support_judgment_validation: null,
      maturation_answer_claims: null,
      maturation_answer_claims_validation: null,
      ontology_expansion: null,
      ontology_expansion_validation: null,
      maturation_source_delta: null,
      maturation_source_delta_validation: null,
      maturation_convergence_ledger: null,
      maturation_convergence_ledger_validation: null,
      maturation_continuation_decision: null,
      maturation_continuation_decision_validation: null,
      query_proofs: null,
      query_proofs_validation: null,
      visualization_proofs: null,
      visualization_proofs_validation: null,
      graph_exploration_proofs: null,
      graph_exploration_proofs_validation: null,
      claim_projection: null,
      claim_projection_validation: null,
      final_output: null,
    };
  return {
    schema_version: "1",
    session_id: args.sessionId,
    entrypoint: "reconstruct",
    created_at: isoNow(),
    completed_at: isoNow(),
    target_refs: args.targetRefs,
    intent: args.intent,
    execution_profile: {
      profile_kind: "full_integral_exploration",
      runner: "integral-exploration-direct-call",
      semantic_author_realization: args.semanticAuthorRealization,
      confirmation_provider_realization: args.confirmationProviderRealization,
      directive_author_id: args.directiveAuthor.authorId,
      confirmation_provider_id: args.confirmationProvider.providerId,
      // RM-2 (design v2 §5): a graceful terminal must NOT claim it completed the live integral path.
      // The truthful claim states the run stopped early with the recorded disposition.
      allowed_completion_claim: args.graceful
        ? `Runtime stopped early with a ${args.graceful.disposition} disposition at ${args.graceful.terminalStepId}; only the reached artifacts were produced and later stages are recorded as not reached.`
        : "Runtime completed the live integral reconstruct path for the produced and explicitly skipped artifacts.",
    },
    artifact_refs: {
      ...artifactRefs,
      // A graceful terminal assembles a real record before the manifest (design §16.5), so its
      // reconstruct_record ref is preserved just like a completed run's.
      reconstruct_record: args.terminalArtifactsCompleted || args.graceful
        ? args.reconstructRecordPath
        : null,
    },
    governing_snapshot: args.governingSnapshot,
    purpose_adequacy_scope: {
      implemented_artifacts: [
        "reconstruct_run_control",
        "reconstruct_run_control_validation",
        "reconstruct_run_control_pre_publication_validation",
        "registry_verification_evidence",
        "registry_verification_evidence_validation",
        "target_material_profile",
        "target_material_profile_validation",
        "source_inventory",
        "initial_source_frontier",
        "source_observations",
        "seed_stage_prompt_source_observations",
        "source_observation_delta",
        "source_observation_delta_validation",
        "source_observation_reentry_validation",
        "source_observation_lineage_index",
        "source_safety_ledger",
        "source_safety_ledger_validation",
        "source_scout_pack",
        "source_scout_pack_validation",
        "source_scout_pack_pre_seed",
        "source_scout_pack_validation_pre_seed",
        "source_observation_directive",
        "source_observation_directive_validation",
        "lens_judgment_index",
        "exploration_synthesis",
        "source_frontier",
        "source_frontier_validation",
        "source_purpose_candidates",
        "source_purpose_candidates_validation",
        "purpose_confirmation",
        "purpose_confirmation_validation",
        "material_admission_ledger",
        "candidate_inventory",
        "candidate_disposition",
        "candidate_disposition_validation",
        "seed_authoring_readiness",
        "seed_authoring_readiness_validation",
        "ontology_seed",
        "ontology_seed_validation",
        "material_admission_ledger_validation",
        "claim_realization_map",
        "claim_realization_map_validation",
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
        "reconstruct_metrics",
        "stop_decision",
        "pre_handoff_run_manifest_validation",
        "handoff_decision_validation",
        "reconstruct_run_manifest",
        ...(args.terminalArtifactsCompleted
          ? [
            "maturation_baseline",
            "maturation_baseline_validation",
            "source_scout_pack_post_maturation",
            "source_scout_pack_validation_post_maturation",
            "post_maturation_gate_projection_validation",
            "baseline_actionability_matrix",
            "baseline_actionability_matrix_validation",
            "maturation_question_frontier",
            "maturation_question_frontier_validation",
            "maturation_closure_frontier",
            "maturation_closure_frontier_validation",
            "maturation_authority_response",
            "maturation_authority_response_validation",
            "answer_support_ledger",
            "answer_support_ledger_validation",
            "answer_support_judgment",
            "answer_support_judgment_validation",
            "maturation_answer_claims",
            "maturation_answer_claims_validation",
            "ontology_expansion",
            "ontology_expansion_validation",
            "actionability_matrix",
            "actionability_matrix_validation",
            "maturation_source_delta",
            "maturation_source_delta_validation",
            "maturation_convergence_ledger",
            "maturation_convergence_ledger_validation",
            "maturation_continuation_decision",
            "maturation_continuation_decision_validation",
            "query_proofs",
            "query_proofs_validation",
            "visualization_proofs",
            "visualization_proofs_validation",
            "graph_exploration_proofs",
            "graph_exploration_proofs_validation",
            ...(args.artifactRefs.actionable_ontology
              ? [
                "actionable_ontology",
                "actionable_ontology_validation",
              ]
              : []),
            "claim_projection",
            "claim_projection_validation",
            "final_output",
            "final_output_provenance_validation",
            "post_publication_run_manifest_validation",
            "reconstruct_record",
          ]
          : []),
        // A graceful terminal still deterministically produces its final-output and record (design
        // §16.3-b), so those IDs belong in implemented_artifacts even though the pipeline stopped
        // early — otherwise a purpose-adequacy review would read them as un-implemented.
        ...(args.graceful
          ? [
            "final_output",
            ...(args.artifactRefs.final_output_provenance_validation
              ? ["final_output_provenance_validation"]
              : []),
            "reconstruct_record",
          ]
          : []),
      ],
      deferred_artifacts: [],
      deferred_reason: args.governingSnapshot.requested_domain_ids.length > 0
        ? "Domain competency admission is recorded in governing_snapshot; no separate domain competency selection artifact is active."
        : "No reconstruct artifacts are deferred by the active runtime contract.",
    },
    steps: [
      completedStep("invocation_binding", "runtime", runtimePerformer(), []),
      completedStep("run_control", "runtime", runtimePerformer(), [
        args.artifactRefs.reconstruct_run_control,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("run_control_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.reconstruct_run_control_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("registry_verification", "runtime", runtimePerformer(), [
        args.artifactRefs.registry_verification_evidence,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("registry_verification_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.registry_verification_evidence_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("target_material_profile", "runtime", runtimePerformer(), [
        args.artifactRefs.target_material_profile,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("target_material_profile_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.target_material_profile_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_inventory", "runtime", runtimePerformer(), [
        args.artifactRefs.source_inventory,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("initial_source_frontier", "runtime", runtimePerformer(), [
        args.artifactRefs.initial_source_frontier,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_observation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_observations,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_safety", "runtime", runtimePerformer(), [
        args.artifactRefs.source_safety_ledger,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_safety_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_safety_ledger_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_scout_pack", "runtime", runtimePerformer(), [
        args.artifactRefs.source_scout_pack,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_scout_pack_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_scout_pack_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("source_scout_pack_pre_seed", "runtime", runtimePerformer(), [
        args.artifactRefs.source_scout_pack_pre_seed,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "source_scout_pack_validation_pre_seed",
        "runtime",
        runtimePerformer(),
        [args.artifactRefs.source_scout_pack_validation_pre_seed]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "observation_directive",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.source_observation_directive]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("observation_directive_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_observation_directive_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "lens_judgment",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.lens_judgment_index]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "exploration_synthesis",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.exploration_synthesis]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "source_frontier",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.source_frontier]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("source_frontier_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.source_frontier_validation,
      ].filter((ref): ref is string => ref !== null)),
      ...(args.artifactRefs.source_observation_delta
        ? [
          completedStep("source_observation_delta", "runtime", runtimePerformer(), [
            args.artifactRefs.source_observation_delta,
          ]),
          completedStep(
            "source_observation_delta_validation",
            "runtime",
            runtimePerformer(),
            [args.artifactRefs.source_observation_delta_validation]
              .filter((ref): ref is string => ref !== null),
          ),
          completedStep(
            "source_observation_reentry_validation",
            "runtime",
            runtimePerformer(),
            [args.artifactRefs.source_observation_reentry_validation]
              .filter((ref): ref is string => ref !== null),
          ),
        ]
        : [
          skippedStep(
            "source_observation_delta",
            "runtime",
            runtimePerformer(),
            "no frontier-triggered source observations were added",
            "no multi-round source observation lineage delta applies",
          ),
          skippedStep(
            "source_observation_delta_validation",
            "runtime",
            runtimePerformer(),
            "no source observation delta artifact exists",
            "delta validation is not applicable",
          ),
          skippedStep(
            "source_observation_reentry_validation",
            "runtime",
            runtimePerformer(),
            "no source observation delta was available for downstream prompt re-entry",
            "re-entry validation is not applicable",
          ),
        ]),
      args.artifactRefs.source_observation_lineage_index
        ? completedStep("source_observation_lineage_index", "runtime", runtimePerformer(), [
          args.artifactRefs.source_observation_lineage_index,
        ])
        : skippedStep(
          "source_observation_lineage_index",
          "runtime",
          runtimePerformer(),
          "source-observation-lineage-index.yaml is emitted after source-observation delta collection closes.",
          "No lineage index is available before source-observation delta collection has closed.",
        ),
      args.artifactRefs.source_observation_lineage_index_validation
        ? completedStep(
          "source_observation_lineage_index_validation",
          "runtime",
          runtimePerformer(),
          [args.artifactRefs.source_observation_lineage_index_validation],
        )
        : skippedStep(
          "source_observation_lineage_index_validation",
          "runtime",
          runtimePerformer(),
          "source-observation-lineage-index-validation.yaml is emitted after the lineage index exists.",
          "No lineage index validation is available before source-observation delta collection has closed.",
        ),
      // P1-C2 leaf-read (first LLM-touch). Census ref present → completed (the always-written census
      // is the durable evidence surface, even when zero labels were produced); null → skipped (the
      // stage no-op'd because the author has no readLeafLabels).
      args.artifactRefs.leaf_read_census
        ? completedStep(
          "leaf_read",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.leaf_read_census],
        )
        : skippedStep(
          "leaf_read",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "leaf-read stage did not run (author has no readLeafLabels).",
          "No leaf-read capture was attempted; the deterministic companion stands unchanged.",
        ),
      // Layer-2 semantic_map stage (wiring design 20260702 §6/W3). Census ref present → completed
      // (the always-written census is the durable evidence surface, even map-absent); null →
      // skipped (the stage no-op'd; skip reason names the canonical capability PAIR — X8).
      args.artifactRefs.semantic_map_census
        ? completedStep(
          "semantic_map",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.semantic_map_census, args.artifactRefs.semantic_map_sidecar]
            .concat(
              args.dispatchFallbackOutcomeRef
                ? [args.dispatchFallbackOutcomeRef]
                : [],
            )
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "semantic_map",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          // Honest disjunction (ultracode audit H): a null census means the stage never WROTE its
          // witness — either the author lacks the capability pair (the default-off skip) or the run
          // ended before the stage (graceful terminal). This builder only sees the ref, so it must
          // not assert capability absence as fact.
          "semantic-map stage wrote no census (author lacks the synthesizeSemanticMapNode/verifySemanticMapBoundary pair, or the run terminated before the stage).",
          "No semantic-map accumulation was recorded; the flat leaf-read path stands unchanged.",
        ),
      completedStep(
        "source_purpose_candidates",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.source_purpose_candidates]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "source_purpose_candidates_validation",
        "runtime",
        runtimePerformer(),
        [args.artifactRefs.source_purpose_candidates_validation]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "purpose_confirmation",
        "host_or_user",
        confirmationProviderPerformer(args.confirmationProvider),
        [args.artifactRefs.purpose_confirmation]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "purpose_confirmation_validation",
        "runtime",
        runtimePerformer(),
        [args.artifactRefs.purpose_confirmation_validation]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("material_admission", "runtime", runtimePerformer(), [
        args.artifactRefs.material_admission_ledger,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "candidate_inventory",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.candidate_inventory]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep(
        "candidate_disposition",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.candidate_disposition]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("candidate_disposition_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.candidate_disposition_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("seed_authoring_readiness", "runtime", runtimePerformer(), [
        args.artifactRefs.seed_authoring_readiness,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("seed_authoring_readiness_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.seed_authoring_readiness_validation,
      ].filter((ref): ref is string => ref !== null)),
      // M3c: the runtime captures the pre-maturation seed-stage observation snapshot at this
      // gate (before ontology_seed authoring), so it has its own producer step/ledger unit.
      completedStep("seed_stage_prompt_source_observations", "runtime", runtimePerformer(), [
        args.artifactRefs.seed_stage_prompt_source_observations,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "ontology_seed",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.ontology_seed]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("ontology_seed_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.ontology_seed_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("material_admission_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.material_admission_ledger_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "claim_realization",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.claim_realization_map]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("claim_realization_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.claim_realization_map_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "seed_confirmation",
        "host_or_user",
        confirmationProviderPerformer(args.confirmationProvider),
        [args.artifactRefs.seed_confirmation]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("seed_confirmation_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.seed_confirmation_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "competency_questions",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.competency_questions]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("competency_questions_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.competency_questions_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "competency_question_assessment",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.competency_question_assessment]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("competency_question_assessment_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.competency_question_assessment_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "failure_classification",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.failure_classification]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("failure_classification_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.failure_classification_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "revision_proposal",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.revision_proposal]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("revision_proposal_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.revision_proposal_validation,
      ].filter((ref): ref is string => ref !== null)),
      completedStep("metrics", "runtime", runtimePerformer(), [
        args.artifactRefs.reconstruct_metrics,
      ].filter((ref): ref is string => ref !== null)),
      completedStep(
        "stop_decision",
        "host_llm",
        directiveAuthorPerformer(args.directiveAuthor),
        [args.artifactRefs.stop_decision]
          .filter((ref): ref is string => ref !== null),
      ),
      completedStep("pre_handoff_run_manifest_validation", "runtime", runtimePerformer(), [
        args.artifactRefs.pre_handoff_run_manifest_validation,
      ].filter((ref): ref is string => ref !== null)),
      args.terminalArtifactsCompleted
        ? completedStep("handoff_decision_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.handoff_decision_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "handoff_decision_validation",
          "runtime",
          runtimePerformer(),
          "handoff-decision-validation.yaml is emitted after pre-handoff manifest validation.",
          "Pre-handoff manifest validation must not certify future handoff validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_baseline", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_baseline,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_baseline",
          "runtime",
          runtimePerformer(),
          "maturation-baseline.yaml is emitted after handoff validation.",
          "Pre-handoff manifest validation must not certify future maturation baseline.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_baseline_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_baseline_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_baseline_validation",
          "runtime",
          runtimePerformer(),
          "maturation-baseline-validation.yaml is emitted after maturation baseline.",
          "Pre-handoff manifest validation must not certify future maturation baseline validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("source_scout_pack_post_maturation", "runtime", runtimePerformer(), [
          args.artifactRefs.source_scout_pack_post_maturation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "source_scout_pack_post_maturation",
          "runtime",
          runtimePerformer(),
          "source-scout-pack.post-maturation.yaml is emitted after maturation lineage refresh.",
          "Pre-handoff manifest validation must not certify future maturation scout snapshots.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "source_scout_pack_validation_post_maturation",
          "runtime",
          runtimePerformer(),
          [args.artifactRefs.source_scout_pack_validation_post_maturation]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "source_scout_pack_validation_post_maturation",
          "runtime",
          runtimePerformer(),
          "source-scout-pack-validation.post-maturation.yaml is emitted after post-maturation source scout snapshot.",
          "Pre-handoff manifest validation must not certify future maturation scout validation snapshots.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "post_maturation_gate_projection_validation",
          "runtime",
          runtimePerformer(),
          [args.artifactRefs.post_maturation_gate_projection_validation]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "post_maturation_gate_projection_validation",
          "runtime",
          runtimePerformer(),
          "post-maturation-gate-projection-validation.yaml is emitted after the post-maturation scout snapshot validation.",
          "Pre-handoff manifest validation must not certify future post-maturation gate projection.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("baseline_actionability_matrix", "runtime", runtimePerformer(), [
          args.artifactRefs.baseline_actionability_matrix,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "baseline_actionability_matrix",
          "runtime",
          runtimePerformer(),
          "baseline-actionability-matrix.yaml is emitted after maturation baseline validation.",
          "Pre-handoff manifest validation must not certify future baseline actionability matrix.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("baseline_actionability_matrix_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.baseline_actionability_matrix_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "baseline_actionability_matrix_validation",
          "runtime",
          runtimePerformer(),
          "baseline-actionability-matrix-validation.yaml is emitted after baseline actionability matrix.",
          "Pre-handoff manifest validation must not certify future baseline actionability matrix validation.",
        ),
      // Maturation value-read cut (design §13.5 F3). Single stage id — discharge validation is
      // an embedded self-validation step, so exactly one manifest step. Census ref present →
      // completed (the always-written discharge census is the durable evidence surface even on
      // zero discharge); null → skipped (the stage no-op'd because there were no value-readable
      // limitation-backed rows or the author lacks the value-read path). leaf_read precedent.
      args.artifactRefs.maturation_value_discharge_census
        ? completedStep(
          "maturation_value_read",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.maturation_value_discharge_census],
        )
        : skippedStep(
          "maturation_value_read",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "value-read stage did not run (no value-readable limitation-backed rows or the author lacks the value-read path).",
          "No value-read discharge was attempted; the baseline actionability matrix stands unchanged.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "maturation_question_frontier",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.maturation_question_frontier]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "maturation_question_frontier",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "maturation-question-frontier.yaml is emitted after baseline actionability matrix validation.",
          "Pre-handoff manifest validation must not certify future maturation question frontier.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_question_frontier_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_question_frontier_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_question_frontier_validation",
          "runtime",
          runtimePerformer(),
          "maturation-question-frontier-validation.yaml is emitted after question frontier.",
          "Pre-handoff manifest validation must not certify future maturation question frontier validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "maturation_closure_frontier",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.maturation_closure_frontier]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "maturation_closure_frontier",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "maturation-closure-frontier.yaml is emitted after question frontier validation.",
          "Pre-handoff manifest validation must not certify future maturation closure frontier.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_closure_frontier_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_closure_frontier_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_closure_frontier_validation",
          "runtime",
          runtimePerformer(),
          "maturation-closure-frontier-validation.yaml is emitted after closure frontier.",
          "Pre-handoff manifest validation must not certify future maturation closure frontier validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_authority_response", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_authority_response,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_authority_response",
          "runtime",
          runtimePerformer(),
          "maturation-authority-response.yaml is emitted after closure frontier validation.",
          "Pre-handoff manifest validation must not certify future maturation authority response.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_authority_response_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_authority_response_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_authority_response_validation",
          "runtime",
          runtimePerformer(),
          "maturation-authority-response-validation.yaml is emitted after authority response.",
          "Pre-handoff manifest validation must not certify future maturation authority response validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "answer_support_ledger",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.answer_support_ledger]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "answer_support_ledger",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "answer-support-ledger.yaml is emitted after authority response validation.",
          "Pre-handoff manifest validation must not certify future answer support ledger.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("answer_support_ledger_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.answer_support_ledger_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "answer_support_ledger_validation",
          "runtime",
          runtimePerformer(),
          "answer-support-ledger-validation.yaml is emitted after answer support ledger.",
          "Pre-handoff manifest validation must not certify future answer support validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "answer_support_judgment",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.answer_support_judgment]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "answer_support_judgment",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "answer-support-judgment.yaml is emitted after answer support ledger validation.",
          "Pre-handoff manifest validation must not certify future answer support judgment.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("answer_support_judgment_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.answer_support_judgment_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "answer_support_judgment_validation",
          "runtime",
          runtimePerformer(),
          "answer-support-judgment-validation.yaml is emitted after answer support judgment.",
          "Pre-handoff manifest validation must not certify future answer support judgment validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "maturation_answer_claims",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.maturation_answer_claims]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "maturation_answer_claims",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "maturation-answer-claims.yaml is emitted after answer support validation.",
          "Pre-handoff manifest validation must not certify future maturation answer claims.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_answer_claims_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_answer_claims_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_answer_claims_validation",
          "runtime",
          runtimePerformer(),
          "maturation-answer-claims-validation.yaml is emitted after answer claims.",
          "Pre-handoff manifest validation must not certify future maturation answer claims validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "ontology_expansion",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.ontology_expansion]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "ontology_expansion",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "ontology-expansion.yaml is emitted after answer claims validation.",
          "Pre-handoff manifest validation must not certify future ontology expansion.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("ontology_expansion_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.ontology_expansion_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "ontology_expansion_validation",
          "runtime",
          runtimePerformer(),
          "ontology-expansion-validation.yaml is emitted after ontology expansion.",
          "Pre-handoff manifest validation must not certify future ontology expansion validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("actionability_matrix", "runtime", runtimePerformer(), [
          args.artifactRefs.actionability_matrix,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "actionability_matrix",
          "runtime",
          runtimePerformer(),
          "actionability-matrix.yaml is emitted after validated answer claims and ontology expansion.",
          "Pre-handoff manifest validation must not certify future actionability matrix.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("actionability_matrix_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.actionability_matrix_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "actionability_matrix_validation",
          "runtime",
          runtimePerformer(),
          "actionability-matrix-validation.yaml is emitted after current actionability matrix recomputation.",
          "Pre-handoff manifest validation must not certify future actionability matrix validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_source_delta", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_source_delta,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_source_delta",
          "runtime",
          runtimePerformer(),
          "maturation-source-delta.yaml is emitted after current actionability matrix validation.",
          "Pre-handoff manifest validation must not certify future source-delta impact judgment.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_source_delta_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_source_delta_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_source_delta_validation",
          "runtime",
          runtimePerformer(),
          "maturation-source-delta-validation.yaml is emitted after source-delta impact judgment.",
          "Pre-handoff manifest validation must not certify future source-delta validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_convergence_ledger", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_convergence_ledger,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_convergence_ledger",
          "runtime",
          runtimePerformer(),
          "maturation-convergence-ledger.yaml is emitted after current actionability matrix validation.",
          "Pre-handoff manifest validation must not certify future convergence ledger.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_convergence_ledger_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_convergence_ledger_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_convergence_ledger_validation",
          "runtime",
          runtimePerformer(),
          "maturation-convergence-ledger-validation.yaml is emitted after convergence ledger.",
          "Pre-handoff manifest validation must not certify future convergence ledger validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_continuation_decision", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_continuation_decision,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_continuation_decision",
          "runtime",
          runtimePerformer(),
          "maturation-continuation-decision.yaml is emitted after convergence ledger validation.",
          "Pre-handoff manifest validation must not certify future maturation continuation decision.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("maturation_continuation_decision_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.maturation_continuation_decision_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "maturation_continuation_decision_validation",
          "runtime",
          runtimePerformer(),
          "maturation-continuation-decision-validation.yaml is emitted after continuation decision.",
          "Pre-handoff manifest validation must not certify future maturation continuation validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("query_proofs", "runtime", runtimePerformer(), [
          args.artifactRefs.query_proofs,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "query_proofs",
          "runtime",
          runtimePerformer(),
          "query-proofs.yaml is emitted after continuation validation.",
          "Pre-handoff manifest validation must not certify future query proof boundary.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("query_proofs_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.query_proofs_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "query_proofs_validation",
          "runtime",
          runtimePerformer(),
          "query-proofs-validation.yaml is emitted after query proof boundary.",
          "Pre-handoff manifest validation must not certify future query proof validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("visualization_proofs", "runtime", runtimePerformer(), [
          args.artifactRefs.visualization_proofs,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "visualization_proofs",
          "runtime",
          runtimePerformer(),
          "visualization-proofs.yaml is emitted after continuation validation.",
          "Pre-handoff manifest validation must not certify future visualization proof boundary.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("visualization_proofs_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.visualization_proofs_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "visualization_proofs_validation",
          "runtime",
          runtimePerformer(),
          "visualization-proofs-validation.yaml is emitted after visualization proof boundary.",
          "Pre-handoff manifest validation must not certify future visualization proof validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("graph_exploration_proofs", "runtime", runtimePerformer(), [
          args.artifactRefs.graph_exploration_proofs,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "graph_exploration_proofs",
          "runtime",
          runtimePerformer(),
          "graph-exploration-proofs.yaml is emitted after continuation validation.",
          "Pre-handoff manifest validation must not certify future graph exploration proof boundary.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("graph_exploration_proofs_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.graph_exploration_proofs_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "graph_exploration_proofs_validation",
          "runtime",
          runtimePerformer(),
          "graph-exploration-proofs-validation.yaml is emitted after graph exploration proof boundary.",
          "Pre-handoff manifest validation must not certify future graph exploration proof validation.",
        ),
      args.terminalArtifactsCompleted && args.artifactRefs.actionable_ontology
        ? completedStep("actionable_ontology", "runtime", runtimePerformer(), [
          args.artifactRefs.actionable_ontology,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "actionable_ontology",
          "runtime",
          runtimePerformer(),
          "actionable-ontology.yaml is emitted only for actionable_limited or actionable_ready continuation states.",
          args.terminalArtifactsCompleted
            ? "Continuation decision did not project an actionable ontology artifact."
            : "Pre-handoff manifest validation must not certify future actionable ontology projection.",
        ),
      args.terminalArtifactsCompleted &&
          args.artifactRefs.actionable_ontology_validation
        ? completedStep("actionable_ontology_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.actionable_ontology_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "actionable_ontology_validation",
          "runtime",
          runtimePerformer(),
          "actionable-ontology-validation.yaml is emitted only when actionable-ontology.yaml exists.",
          args.terminalArtifactsCompleted
            ? "No actionable ontology artifact was emitted for this continuation state."
            : "Pre-handoff manifest validation must not certify future actionable ontology validation.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "run_control_pre_publication_validation",
          "runtime",
          runtimePerformer(),
          [
            args.artifactRefs
              .reconstruct_run_control_pre_publication_validation,
          ].filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "run_control_pre_publication_validation",
          "runtime",
          runtimePerformer(),
          "reconstruct-run-control.pre-publication-validation.yaml is emitted as the immutable checkpoint before claim projection.",
          "Pre-handoff manifest validation must not certify a pre-publication checkpoint before maturation continuation validation closes.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("claim_projection", "runtime", runtimePerformer(), [
          args.artifactRefs.claim_projection,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "claim_projection",
          "runtime",
          runtimePerformer(),
          "claim-projection.yaml is emitted as a pre-publication authority before final-output authoring.",
          "Pre-handoff manifest validation must not certify a claim projection before maturation continuation validation closes.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep("claim_projection_validation", "runtime", runtimePerformer(), [
          args.artifactRefs.claim_projection_validation,
        ].filter((ref): ref is string => ref !== null))
        : skippedStep(
          "claim_projection_validation",
          "runtime",
          runtimePerformer(),
          "claim-projection-validation.yaml is emitted as a pre-publication authority before final-output authoring.",
          "Pre-handoff manifest validation must not certify claim projection validation before maturation continuation validation closes.",
        ),
      args.graceful
        // Graceful terminal: the final-output is a deterministic runtime-authored blocked/limited
        // statement, NOT an LLM completion (design §16.3-c) — so runtime owner, not host_llm. When
        // its ref is present the step is kept completed; when absent, applyGracefulReachability
        // downgrades this ref-less completed step to not_reached.
        ? completedStep(
          "final_output",
          "runtime",
          runtimePerformer(),
          [args.artifactRefs.final_output]
            .filter((ref): ref is string => ref !== null),
        )
        : args.terminalArtifactsCompleted
        ? completedStep(
          "final_output",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          [args.artifactRefs.final_output]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "final_output",
          "host_llm",
          directiveAuthorPerformer(args.directiveAuthor),
          "final-output.md is emitted after claim projection validation and delegates public claim truth to the canonical claim projection artifact.",
          "Pre-handoff manifest validation must not certify future final output.",
        ),
      // Both runtime-owned; a graceful terminal produces these deterministically (§16.3-c). A
      // ref-less completed step is downgraded to not_reached by applyGracefulReachability.
      args.terminalArtifactsCompleted || args.graceful
        ? completedStep(
          "final_output_provenance_validation",
          "runtime",
          runtimePerformer(),
          [args.artifactRefs.final_output_provenance_validation]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "final_output_provenance_validation",
          "runtime",
          runtimePerformer(),
          "final-output-provenance-validation.yaml is emitted after final output.",
          "Pre-handoff manifest validation must not certify future final-output provenance.",
        ),
      args.terminalArtifactsCompleted || args.graceful
        ? completedStep(
          "record_assembly",
          "runtime",
          runtimePerformer(),
          [args.reconstructRecordPath],
        )
        : skippedStep(
          "record_assembly",
          "runtime",
          runtimePerformer(),
          "reconstruct-record.yaml is finally assembled after claim projection validation.",
          "Pre-handoff manifest validation must not certify future record assembly.",
        ),
      args.terminalArtifactsCompleted
        ? completedStep(
          "post_publication_run_manifest_validation",
          "runtime",
          runtimePerformer(),
          [args.artifactRefs.post_publication_run_manifest_validation]
            .filter((ref): ref is string => ref !== null),
        )
        : skippedStep(
          "post_publication_run_manifest_validation",
          "runtime",
          runtimePerformer(),
          "post-publication run-manifest validation is emitted after final output and record refs exist.",
          "Pre-handoff manifest validation must not certify future post-publication audit.",
        ),
    ].map((step) => {
      const executionTelemetry = mergedUnitExecutionTelemetry(
        [
          args.directiveAuthor.executionTelemetry,
          args.confirmationProvider.executionTelemetry,
        ],
        step.step_id,
      );
      return executionTelemetry
        ? { ...step, execution_telemetry: executionTelemetry }
        : step;
    }).map((step) =>
      // Graceful terminal only: rewrite each step to a witness-truthful skip_kind (design v2 §3).
      // When absent this is a no-op that returns the same step objects, so the completed/pre-handoff
      // manifest stays byte-identical.
      args.graceful ? applyGracefulReachability(step, ranLineageStages) : step
    ),
    runtime_boundary: {
      semantic_generation: "not_performed",
      semantic_authority: "host_llm_author",
    },
    // Graceful-terminal marker (design v2 §4): its presence switches the validator into the
    // reachability rules. Absent on completed and pre-handoff runs (byte-identical to before).
    ...(args.graceful
      ? {
        graceful_terminal: {
          disposition: args.graceful.disposition,
          terminal_step_id: args.graceful.terminalStepId,
          reachability_witness_ref: args.graceful.reachabilityWitnessRef,
        },
      }
      : {}),
  };
}
