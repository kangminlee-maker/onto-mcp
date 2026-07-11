import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
} from "./artifact-types.js";
import {
  buildReconstructPipelineExecutionLedger,
  reconstructStageIdForArtifactRef,
  reconstructStageOwner,
} from "./pipeline-execution-ledger.js";

const tempRoots: string[] = [];

async function tempSessionRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-reconstruct-ledger-"),
  );
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("reconstruct stage artifact projection authority", () => {
  it("maps non-isomorphic artifact names and confirmation ownership", () => {
    expect(reconstructStageIdForArtifactRef(
      "/tmp/source-safety-ledger-validation.yaml",
    )).toBe("source_safety_validation");
    expect(reconstructStageOwner("purpose_confirmation")).toBe("host_or_user");
    expect(reconstructStageOwner("ontology_seed")).toBe("host_llm");
  });
});

function emptyRefs(): ReconstructRecordArtifactRefs {
  return {
    reconstruct_run_control: null,
    reconstruct_run_control_validation: null,
    reconstruct_run_control_pre_publication_validation: null,
    reconstruct_run_bootstrap_diagnostic: null,
    registry_verification_evidence: null,
    registry_verification_evidence_validation: null,
    target_material_profile: null,
    target_material_profile_validation: null,
    source_inventory: null,
    initial_source_frontier: null,
    source_observations: null,
    source_observation_delta: null,
    source_observation_delta_validation: null,
    source_observation_reentry_validation: null,
    source_observation_lineage_index: null,
    source_observation_lineage_index_validation: null,
    source_safety_ledger: null,
    source_safety_ledger_validation: null,
    source_scout_pack: null,
    source_scout_pack_validation: null,
    source_scout_pack_pre_seed: null,
    source_scout_pack_validation_pre_seed: null,
    source_scout_pack_post_maturation: null,
    source_scout_pack_validation_post_maturation: null,
    source_observation_directive: null,
    source_observation_directive_validation: null,
    lens_judgment_index: null,
    exploration_synthesis: null,
    source_frontier: null,
    source_frontier_validation: null,
    source_purpose_candidates: null,
    source_purpose_candidates_validation: null,
    purpose_confirmation: null,
    purpose_confirmation_validation: null,
    material_admission_ledger: null,
    material_admission_ledger_validation: null,
    candidate_inventory: null,
    candidate_disposition: null,
    candidate_disposition_validation: null,
    seed_authoring_readiness: null,
    seed_authoring_readiness_validation: null,
    ontology_seed: null,
    ontology_seed_validation: null,
    claim_realization_map: null,
    claim_realization_map_validation: null,
    seed_confirmation: null,
    seed_confirmation_validation: null,
    competency_questions: null,
    competency_questions_validation: null,
    competency_question_assessment: null,
    competency_question_assessment_validation: null,
    failure_classification: null,
    failure_classification_validation: null,
    revision_proposal: null,
    revision_proposal_validation: null,
    reconstruct_metrics: null,
    stop_decision: null,
    pre_handoff_run_manifest_validation: null,
    post_publication_run_manifest_validation: null,
    handoff_decision_validation: null,
    maturation_baseline: null,
    maturation_baseline_validation: null,
    baseline_actionability_matrix: null,
    baseline_actionability_matrix_validation: null,
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
    actionable_ontology: null,
    actionable_ontology_validation: null,
    claim_projection: null,
    claim_projection_validation: null,
    final_output: null,
    final_output_provenance_validation: null,
    reconstruct_run_manifest: null,
  };
}

function record(
  root: string,
  refs: Partial<ReconstructRecordArtifactRefs>,
): ReconstructRecordArtifact {
  return {
    schema_version: "1",
    reconstruct_record_id: `reconstruct-record:${path.basename(root)}`,
    session_id: path.basename(root),
    entrypoint: "reconstruct",
    record_stage: "preparation_artifacts_written",
    created_at: "2026-05-27T00:00:00.000Z",
    updated_at: "2026-05-27T00:00:00.000Z",
    target_material_kind: "document",
    support_status: "supported",
    artifact_refs: {
      ...emptyRefs(),
      ...refs,
    },
    artifact_integrity: [],
    validation_summary: {
      target_material_profile_status: "not_available",
      source_observation_directive_status: "not_available",
      candidate_disposition_status: "not_available",
      ontology_seed_status: "not_available",
      claim_realization_status: "not_available",
      seed_confirmation_status: "not_available",
      pre_handoff_run_manifest_status: "not_available",
      post_publication_run_manifest_status: "not_available",
      handoff_decision_status: "not_available",
      semantic_claim_count: null,
      evidence_ref_count: null,
      confirmed_claim_count: null,
      rejected_claim_count: null,
      partial_claim_count: null,
      deferred_claim_count: null,
      competency_question_count: null,
      competency_question_assessment_count: null,
      failure_count: null,
      revision_proposal_count: null,
      unresolved_count: null,
      deferred_count: null,
      pass_rate: null,
    },
    missing_artifacts: [],
    runtime_boundary: {
      semantic_generation: "not_performed",
      runtime_owned_gates: [],
      host_user_mediated_artifacts: [],
      llm_owned_directives: [],
    },
    warnings: [],
  };
}

async function writeArtifact(filePath: string): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const basename = path.basename(filePath);
  const content = basename.includes("validation")
    ? `schema_version: "1"\nvalidation_status: valid\nartifact: ${basename}\n`
    : `artifact: ${basename}\n`;
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

async function writeInvalidValidation(filePath: string): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    `schema_version: "1"\nvalidation_status: invalid\nartifact: ${path.basename(filePath)}\n`,
    "utf8",
  );
  return filePath;
}

describe("buildReconstructPipelineExecutionLedger", () => {
  it("adds the completed fallback outcome as a hashed semantic-map companion", async () => {
    const root = await tempSessionRoot();
    const censusRef = await writeArtifact(
      path.join(root, "comprehension", "semantic-map-census.yaml"),
    );
    const outcomeRef = path.join(root, "dispatch-fallback-outcome.yaml");
    await fs.writeFile(outcomeRef, JSON.stringify({
      schema_version: "dispatch-fallback-outcome/v1",
      session_id: path.basename(root),
      created_at: new Date().toISOString(),
      owner_attempt_id: "attempt-1",
      activation: { ref: path.join(root, "dispatch-fallback-activation.yaml"), sha256: "a".repeat(64) },
      status: "completed",
      partition: {
        target_count: 1,
        completed_count: 1,
        dead_letter_count: 0,
        incomplete_count: 0,
      },
      dispatch_counts: {
        synthesize_logical: 1,
        verify_logical: 0,
        synthesize_adapter_requests: 1,
        verify_adapter_requests: 0,
      },
      final_artifacts: {
        dispatch_incomplete: { ref: path.join(root, "dispatch-incomplete.yaml"), sha256: "b".repeat(64) },
        semantic_map_census: { ref: censusRef, sha256: "c".repeat(64) },
        semantic_map: { ref: path.join(root, "comprehension", "semantic-map.yaml"), sha256: "d".repeat(64) },
      },
      terminal_failure: null,
    }), "utf8");
    const outcomeSha = crypto
      .createHash("sha256")
      .update(await fs.readFile(outcomeRef))
      .digest("hex");
    const reconstructRecord = record(root, { semantic_map_census: censusRef });
    reconstructRecord.record_stage = "completed";
    reconstructRecord.dispatch_fallback = {
      outcome_ref: outcomeRef,
      outcome_sha256: outcomeSha,
      activation_sha256: "a".repeat(64),
      owner_attempt_id: "attempt-1",
      trigger_code: "rate_limit",
      route_relation: "cross_provider",
      target_count: 1,
      completed_count: 1,
      dead_letter_count: 0,
      incomplete_count: 0,
      synthesize_logical_dispatch_count: 1,
      verify_logical_dispatch_count: 0,
      synthesize_adapter_request_count: 1,
      verify_adapter_request_count: 0,
      outcome: "completed",
    };
    const manifest = {
      artifact_refs: {},
      steps: [{
        step_id: "semantic_map",
        status: "completed",
        artifact_refs: [censusRef, outcomeRef],
      }],
    } as never;
    const ledger = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord,
      reconstructRunManifest: manifest,
    });
    const semanticMap = ledger.units.find((unit) => unit.unitId === "semantic_map")!;
    expect(semanticMap.outputRefs).toEqual([censusRef, outcomeRef].sort());
    expect(semanticMap.outputHashes[outcomeRef]).toBe(outcomeSha);

    await expect(
      buildReconstructPipelineExecutionLedger({
        sessionRoot: root,
        reconstructRecord,
        reconstructRunManifest: {
          artifact_refs: {},
          steps: [{
            step_id: "semantic_map",
            status: "completed",
            artifact_refs: [censusRef],
          }],
        } as never,
      }),
    ).rejects.toThrow("record/manifest mismatch");

    await fs.writeFile(outcomeRef, "status: completed\n", "utf8");
    reconstructRecord.dispatch_fallback.outcome_sha256 = crypto
      .createHash("sha256")
      .update(await fs.readFile(outcomeRef))
      .digest("hex");
    await expect(
      buildReconstructPipelineExecutionLedger({
        sessionRoot: root,
        reconstructRecord,
        reconstructRunManifest: manifest,
      }),
    ).rejects.toThrow("not a valid completed canonical outcome");
  });

  it("records direct validator authority-input edges in the ledger topology", async () => {
    const root = await tempSessionRoot();

    const ledger = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, {}),
    });

    expect(
      ledger.units.find((unit) => unit.unitId === "source_frontier_validation")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining([
      "source_frontier",
      "source_inventory",
      "target_material_profile_validation",
      "source_observation",
    ]));
    expect(
      ledger.units.find((unit) => unit.unitId === "candidate_disposition_validation")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining([
      "candidate_inventory",
      "candidate_disposition",
      "source_observation",
    ]));
    expect(
      ledger.units.find((unit) =>
        unit.unitId === "run_control_pre_publication_validation"
      )?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining([
      "run_control_validation",
      "maturation_continuation_decision_validation",
    ]));
    const claimProjectionUpstreams = ledger.units.find((unit) =>
      unit.unitId === "claim_projection"
    )?.upstreamUnitIds ?? [];
    expect(claimProjectionUpstreams).toEqual(expect.arrayContaining([
      "run_control_pre_publication_validation",
      "handoff_decision_validation",
    ]));
    expect(claimProjectionUpstreams).not.toContain("run_control_validation");
    expect(
      ledger.units.find((unit) => unit.unitId === "source_observation_lineage_index")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining(["source_frontier_validation"]));
    expect(
      ledger.units.find((unit) => unit.unitId === "source_purpose_candidates")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining([
      "source_frontier_validation",
      "source_observation_lineage_index_validation",
    ]));
    expect(
      ledger.units.find((unit) => unit.unitId === "source_purpose_candidates_validation")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining([
      "source_purpose_candidates",
      "source_observation",
      "source_observation_lineage_index_validation",
    ]));
    expect(
      ledger.units.find((unit) => unit.unitId === "answer_support_ledger_validation")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining([
      "answer_support_ledger",
      "source_observation_lineage_index_validation",
      "source_safety_validation",
    ]));
    expect(
      ledger.units.find((unit) => unit.unitId === "maturation_question_frontier")
        ?.upstreamUnitIds,
    ).toEqual(["baseline_actionability_matrix_validation"]);
    expect(
      ledger.units.find((unit) => unit.unitId === "actionability_matrix")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining([
      "baseline_actionability_matrix_validation",
      "maturation_answer_claims_validation",
      "ontology_expansion_validation",
      // The current matrix reads the validated question frontier to populate
      // blocking_question_refs, so the dependency must be guarded here too.
      "maturation_question_frontier_validation",
    ]));
    expect(
      ledger.units.find((unit) => unit.unitId === "actionability_matrix_validation")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining([
      "actionability_matrix",
      "maturation_answer_claims_validation",
      "ontology_expansion_validation",
      "maturation_question_frontier_validation",
    ]));
  });

  it("records re-entry as a conditional lineage upstream when frontier deltas exist", async () => {
    const root = await tempSessionRoot();
    const refs = emptyRefs();
    refs.source_observation_reentry_validation = await writeArtifact(
      path.join(root, "source-observation-reentry-validation.yaml"),
    );
    refs.source_observation_lineage_index = await writeArtifact(
      path.join(root, "source-observation-lineage-index.yaml"),
    );

    const ledger = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, refs),
    });

    expect(
      ledger.units.find((unit) => unit.unitId === "source_observation_lineage_index")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining(["source_observation_reentry_validation"]));
    expect(
      ledger.units.find((unit) => unit.unitId === "answer_support_ledger")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining(["source_observation_reentry_validation"]));
    expect(
      ledger.units.find((unit) => unit.unitId === "answer_support_ledger_validation")
        ?.upstreamUnitIds,
    ).toEqual(expect.arrayContaining(["source_observation_reentry_validation"]));
  });

  it("trusts runtime preparation stages when their outputs exist", async () => {
    const root = await tempSessionRoot();
    const targetMaterialProfile = await writeArtifact(
      path.join(root, "target-material-profile.yaml"),
    );
    const targetMaterialProfileValidation = await writeArtifact(
      path.join(root, "target-material-profile-validation.yaml"),
    );
    const sourceInventory = await writeArtifact(
      path.join(root, "source-inventory.yaml"),
    );
    const initialSourceFrontier = await writeArtifact(
      path.join(root, "initial-source-frontier.yaml"),
    );
    const sourceObservations = await writeArtifact(
      path.join(root, "source-observations.yaml"),
    );

    const ledger = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, {
        target_material_profile: targetMaterialProfile,
        target_material_profile_validation: targetMaterialProfileValidation,
        source_inventory: sourceInventory,
        initial_source_frontier: initialSourceFrontier,
        source_observations: sourceObservations,
      }),
      reconstructRecordRef: path.join(root, "reconstruct-record.yaml"),
    });

    expect(
      ledger.units.find((unit) => unit.unitId === "source_observation")
        ?.trustStatus,
    ).toBe("trusted");
    expect(
      ledger.units.find((unit) => unit.unitId === "observation_directive")
        ?.trustStatus,
    ).toBe("untrusted");
  });

  it("keeps LLM-authored artifacts untrusted until their validation gate exists", async () => {
    const root = await tempSessionRoot();
    const targetMaterialProfile = await writeArtifact(
      path.join(root, "target-material-profile.yaml"),
    );
    const targetMaterialProfileValidation = await writeArtifact(
      path.join(root, "target-material-profile-validation.yaml"),
    );
    const sourceInventory = await writeArtifact(
      path.join(root, "source-inventory.yaml"),
    );
    const initialSourceFrontier = await writeArtifact(
      path.join(root, "initial-source-frontier.yaml"),
    );
    const sourceObservations = await writeArtifact(
      path.join(root, "source-observations.yaml"),
    );
    const sourceSafetyLedger = await writeArtifact(
      path.join(root, "source-safety-ledger.yaml"),
    );
    const sourceSafetyLedgerValidation = await writeArtifact(
      path.join(root, "source-safety-ledger-validation.yaml"),
    );
    const sourceScoutPack = await writeArtifact(
      path.join(root, "source-scout-pack.yaml"),
    );
    const sourceScoutPackValidation = await writeArtifact(
      path.join(root, "source-scout-pack-validation.yaml"),
    );
    const sourceObservationDirective = await writeArtifact(
      path.join(root, "source-observation-directive.yaml"),
    );

    const unvalidated = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, {
        target_material_profile: targetMaterialProfile,
        target_material_profile_validation: targetMaterialProfileValidation,
        source_inventory: sourceInventory,
        initial_source_frontier: initialSourceFrontier,
        source_observations: sourceObservations,
        source_safety_ledger: sourceSafetyLedger,
        source_safety_ledger_validation: sourceSafetyLedgerValidation,
        source_scout_pack: sourceScoutPack,
        source_scout_pack_validation: sourceScoutPackValidation,
        source_observation_directive: sourceObservationDirective,
      }),
    });

    expect(
      unvalidated.units.find((unit) => unit.unitId === "observation_directive")
        ?.trustStatus,
    ).toBe("untrusted");

    const sourceObservationDirectiveValidation = await writeArtifact(
      path.join(root, "source-observation-directive-validation.yaml"),
    );
    const validated = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, {
        target_material_profile: targetMaterialProfile,
        target_material_profile_validation: targetMaterialProfileValidation,
        source_inventory: sourceInventory,
        initial_source_frontier: initialSourceFrontier,
        source_observations: sourceObservations,
        source_safety_ledger: sourceSafetyLedger,
        source_safety_ledger_validation: sourceSafetyLedgerValidation,
        source_scout_pack: sourceScoutPack,
        source_scout_pack_validation: sourceScoutPackValidation,
        source_observation_directive: sourceObservationDirective,
        source_observation_directive_validation:
          sourceObservationDirectiveValidation,
      }),
    });

    expect(
      validated.units.find((unit) => unit.unitId === "observation_directive")
        ?.trustStatus,
    ).toBe("trusted");
    expect(
      validated.units.find(
        (unit) => unit.unitId === "observation_directive_validation",
      )?.trustStatus,
    ).toBe("trusted");
  });

  it("does not trust authored artifacts when their validation artifact is invalid", async () => {
    const root = await tempSessionRoot();
    const targetMaterialProfile = await writeArtifact(
      path.join(root, "target-material-profile.yaml"),
    );
    const targetMaterialProfileValidation = await writeArtifact(
      path.join(root, "target-material-profile-validation.yaml"),
    );
    const sourceInventory = await writeArtifact(
      path.join(root, "source-inventory.yaml"),
    );
    const initialSourceFrontier = await writeArtifact(
      path.join(root, "initial-source-frontier.yaml"),
    );
    const sourceObservations = await writeArtifact(
      path.join(root, "source-observations.yaml"),
    );
    const sourceSafetyLedger = await writeArtifact(
      path.join(root, "source-safety-ledger.yaml"),
    );
    const sourceSafetyLedgerValidation = await writeArtifact(
      path.join(root, "source-safety-ledger-validation.yaml"),
    );
    const sourceObservationDirective = await writeArtifact(
      path.join(root, "source-observation-directive.yaml"),
    );
    const sourceObservationDirectiveValidation = await writeInvalidValidation(
      path.join(root, "source-observation-directive-validation.yaml"),
    );

    const ledger = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, {
        target_material_profile: targetMaterialProfile,
        target_material_profile_validation: targetMaterialProfileValidation,
        source_inventory: sourceInventory,
        initial_source_frontier: initialSourceFrontier,
        source_observations: sourceObservations,
        source_observation_directive: sourceObservationDirective,
        source_observation_directive_validation:
          sourceObservationDirectiveValidation,
      }),
    });

    expect(
      ledger.units.find((unit) => unit.unitId === "observation_directive")
        ?.trustStatus,
    ).toBe("blocked_by_upstream");
    expect(
      ledger.units.find(
        (unit) => unit.unitId === "observation_directive_validation",
      )?.trustStatus,
    ).toBe("untrusted");
  });

  it("links ontology seed artifacts through candidate and ontology validation gates", async () => {
    const root = await tempSessionRoot();
    const targetMaterialProfile = await writeArtifact(
      path.join(root, "target-material-profile.yaml"),
    );
    const targetMaterialProfileValidation = await writeArtifact(
      path.join(root, "target-material-profile-validation.yaml"),
    );
    const sourceInventory = await writeArtifact(
      path.join(root, "source-inventory.yaml"),
    );
    const initialSourceFrontier = await writeArtifact(
      path.join(root, "initial-source-frontier.yaml"),
    );
    const sourceObservations = await writeArtifact(
      path.join(root, "source-observations.yaml"),
    );
    const sourceSafetyLedger = await writeArtifact(
      path.join(root, "source-safety-ledger.yaml"),
    );
    const sourceSafetyLedgerValidation = await writeArtifact(
      path.join(root, "source-safety-ledger-validation.yaml"),
    );
    const sourceObservationDirective = await writeArtifact(
      path.join(root, "source-observation-directive.yaml"),
    );
    const sourceObservationDirectiveValidation = await writeArtifact(
      path.join(root, "source-observation-directive-validation.yaml"),
    );
    const lensJudgmentIndex = await writeArtifact(
      path.join(root, "lens-judgment-index.yaml"),
    );
    const explorationSynthesis = await writeArtifact(
      path.join(root, "rounds/round1/exploration-synthesis.yaml"),
    );
    const sourceFrontier = await writeArtifact(
      path.join(root, "rounds/round1/source-frontier.yaml"),
    );
    const sourceFrontierValidation = await writeArtifact(
      path.join(root, "rounds/round1/source-frontier-validation.yaml"),
    );
    const sourceObservationLineageIndex = await writeArtifact(
      path.join(root, "source-observation-lineage-index.yaml"),
    );
    const sourceObservationLineageIndexValidation = await writeArtifact(
      path.join(root, "source-observation-lineage-index-validation.yaml"),
    );
    const candidateInventory = await writeArtifact(
      path.join(root, "candidate-inventory.yaml"),
    );
    const sourcePurposeCandidates = await writeArtifact(
      path.join(root, "source-purpose-candidates.yaml"),
    );
    const sourcePurposeCandidatesValidation = await writeArtifact(
      path.join(root, "source-purpose-candidates-validation.yaml"),
    );
    const purposeConfirmation = await writeArtifact(
      path.join(root, "purpose-confirmation.yaml"),
    );
    const purposeConfirmationValidation = await writeArtifact(
      path.join(root, "purpose-confirmation-validation.yaml"),
    );
    const materialAdmissionLedger = await writeArtifact(
      path.join(root, "material-admission-ledger.yaml"),
    );
    const candidateDisposition = await writeArtifact(
      path.join(root, "candidate-disposition.yaml"),
    );

    const beforeValidation = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, {
        target_material_profile: targetMaterialProfile,
        target_material_profile_validation: targetMaterialProfileValidation,
        source_inventory: sourceInventory,
        initial_source_frontier: initialSourceFrontier,
        source_observations: sourceObservations,
        source_safety_ledger: sourceSafetyLedger,
        source_safety_ledger_validation: sourceSafetyLedgerValidation,
        source_observation_directive: sourceObservationDirective,
        source_observation_directive_validation:
          sourceObservationDirectiveValidation,
        lens_judgment_index: lensJudgmentIndex,
        exploration_synthesis: explorationSynthesis,
        source_frontier: sourceFrontier,
        source_frontier_validation: sourceFrontierValidation,
        source_observation_lineage_index: sourceObservationLineageIndex,
        source_observation_lineage_index_validation:
          sourceObservationLineageIndexValidation,
        source_purpose_candidates: sourcePurposeCandidates,
        source_purpose_candidates_validation: sourcePurposeCandidatesValidation,
        purpose_confirmation: purposeConfirmation,
        purpose_confirmation_validation: purposeConfirmationValidation,
        material_admission_ledger: materialAdmissionLedger,
        candidate_inventory: candidateInventory,
        candidate_disposition: candidateDisposition,
      }),
    });

    expect(
      beforeValidation.units.find((unit) => unit.unitId === "candidate_inventory")
        ?.trustStatus,
    ).toBe("untrusted");

    const candidateDispositionValidation = await writeArtifact(
      path.join(root, "candidate-disposition-validation.yaml"),
    );
    const seedAuthoringReadiness = await writeArtifact(
      path.join(root, "seed-authoring-readiness.yaml"),
    );
    const seedAuthoringReadinessValidation = await writeArtifact(
      path.join(root, "seed-authoring-readiness-validation.yaml"),
    );
    const ontologySeed = await writeArtifact(path.join(root, "ontology-seed.yaml"));
    const ontologySeedValidation = await writeArtifact(
      path.join(root, "ontology-seed-validation.yaml"),
    );

    const afterValidation = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, {
        target_material_profile: targetMaterialProfile,
        target_material_profile_validation: targetMaterialProfileValidation,
        source_inventory: sourceInventory,
        initial_source_frontier: initialSourceFrontier,
        source_observations: sourceObservations,
        source_safety_ledger: sourceSafetyLedger,
        source_safety_ledger_validation: sourceSafetyLedgerValidation,
        source_observation_directive: sourceObservationDirective,
        source_observation_directive_validation:
          sourceObservationDirectiveValidation,
        lens_judgment_index: lensJudgmentIndex,
        exploration_synthesis: explorationSynthesis,
        source_frontier: sourceFrontier,
        source_frontier_validation: sourceFrontierValidation,
        source_observation_lineage_index: sourceObservationLineageIndex,
        source_observation_lineage_index_validation:
          sourceObservationLineageIndexValidation,
        source_purpose_candidates: sourcePurposeCandidates,
        source_purpose_candidates_validation: sourcePurposeCandidatesValidation,
        purpose_confirmation: purposeConfirmation,
        purpose_confirmation_validation: purposeConfirmationValidation,
        material_admission_ledger: materialAdmissionLedger,
        candidate_inventory: candidateInventory,
        candidate_disposition: candidateDisposition,
        candidate_disposition_validation: candidateDispositionValidation,
        seed_authoring_readiness: seedAuthoringReadiness,
        seed_authoring_readiness_validation: seedAuthoringReadinessValidation,
        ontology_seed: ontologySeed,
        ontology_seed_validation: ontologySeedValidation,
      }),
    });

    expect(
      afterValidation.units.find((unit) => unit.unitId === "candidate_inventory")
        ?.trustStatus,
    ).toBe("trusted");
    expect(
      afterValidation.units.find((unit) => unit.unitId === "ontology_seed")
        ?.trustStatus,
    ).toBe("trusted");
    expect(
      afterValidation.units.find((unit) => unit.unitId === "claim_realization")
        ?.status,
    ).toBe("not_reached");
  });

  it("blocks failure classification until competency question assessment validation exists", async () => {
    const root = await tempSessionRoot();
    const refs = emptyRefs();
    const presentKeys: Array<keyof ReconstructRecordArtifactRefs> = [
      "target_material_profile",
      "target_material_profile_validation",
      "source_inventory",
      "initial_source_frontier",
      "source_observations",
      "source_observation_directive",
      "source_observation_directive_validation",
      "lens_judgment_index",
      "exploration_synthesis",
      "source_frontier",
      "source_frontier_validation",
      "source_observation_lineage_index",
      "source_purpose_candidates",
      "source_purpose_candidates_validation",
      "purpose_confirmation",
      "purpose_confirmation_validation",
      "candidate_inventory",
      "candidate_disposition",
      "candidate_disposition_validation",
      "seed_authoring_readiness",
      "seed_authoring_readiness_validation",
      "ontology_seed",
      "ontology_seed_validation",
      "claim_realization_map",
      "claim_realization_map_validation",
      "seed_confirmation",
      "seed_confirmation_validation",
      "competency_questions",
      "competency_questions_validation",
      "competency_question_assessment",
      "failure_classification",
      "failure_classification_validation",
    ];
    for (const key of presentKeys) {
      refs[key] = await writeArtifact(path.join(root, `${key}.yaml`));
    }

    const ledger = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, refs),
    });

    expect(
      ledger.units.find((unit) => unit.unitId === "failure_classification")
        ?.trustStatus,
    ).toBe("blocked_by_upstream");
    expect(
      ledger.units.find((unit) => unit.unitId === "failure_classification_validation")
        ?.trustStatus,
    ).toBe("blocked_by_upstream");
  });

  it("blocks competency question assessment until claim realization validation exists", async () => {
    const root = await tempSessionRoot();
    const refs = emptyRefs();
    const presentKeys: Array<keyof ReconstructRecordArtifactRefs> = [
      "target_material_profile",
      "target_material_profile_validation",
      "source_inventory",
      "initial_source_frontier",
      "source_observations",
      "source_observation_directive",
      "source_observation_directive_validation",
      "lens_judgment_index",
      "exploration_synthesis",
      "source_frontier",
      "source_frontier_validation",
      "source_observation_lineage_index",
      "source_purpose_candidates",
      "source_purpose_candidates_validation",
      "purpose_confirmation",
      "purpose_confirmation_validation",
      "candidate_inventory",
      "candidate_disposition",
      "candidate_disposition_validation",
      "seed_authoring_readiness",
      "seed_authoring_readiness_validation",
      "ontology_seed",
      "ontology_seed_validation",
      "claim_realization_map",
      "seed_confirmation",
      "seed_confirmation_validation",
      "competency_questions",
      "competency_questions_validation",
      "competency_question_assessment",
      "competency_question_assessment_validation",
    ];
    for (const key of presentKeys) {
      refs[key] = await writeArtifact(path.join(root, `${key}.yaml`));
    }

    const ledger = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, refs),
    });

    expect(
      ledger.units.find((unit) => unit.unitId === "competency_question_assessment")
        ?.trustStatus,
    ).toBe("blocked_by_upstream");
    expect(
      ledger.units.find((unit) => unit.unitId === "competency_question_assessment_validation")
        ?.trustStatus,
    ).toBe("blocked_by_upstream");
  });

  it("keeps final output untrusted until provenance validation exists", async () => {
    const root = await tempSessionRoot();
    const refs = emptyRefs();
    const presentKeys: Array<keyof ReconstructRecordArtifactRefs> = [
      "target_material_profile",
      "target_material_profile_validation",
      "source_inventory",
      "initial_source_frontier",
      "source_observations",
      "source_observation_directive",
      "source_observation_directive_validation",
      "lens_judgment_index",
      "exploration_synthesis",
      "source_frontier",
      "source_frontier_validation",
      "source_observation_lineage_index",
      "source_purpose_candidates",
      "source_purpose_candidates_validation",
      "purpose_confirmation",
      "purpose_confirmation_validation",
      "candidate_inventory",
      "candidate_disposition",
      "candidate_disposition_validation",
      "seed_authoring_readiness",
      "seed_authoring_readiness_validation",
      "ontology_seed",
      "ontology_seed_validation",
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
      "maturation_baseline",
      "maturation_baseline_validation",
      "baseline_actionability_matrix",
      "baseline_actionability_matrix_validation",
      "maturation_question_frontier",
      "maturation_question_frontier_validation",
      "actionability_matrix",
      "actionability_matrix_validation",
      "final_output",
    ];
    for (const key of presentKeys) {
      refs[key] = await writeArtifact(path.join(root, `${key}.yaml`));
    }

    const ledger = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, refs),
    });

    expect(
      ledger.units.find((unit) => unit.unitId === "final_output")?.trustStatus,
    ).toBe("untrusted");
  });
});
