import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
} from "./artifact-types.js";
import { buildReconstructPipelineExecutionLedger } from "./pipeline-execution-ledger.js";

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

function emptyRefs(): ReconstructRecordArtifactRefs {
  return {
    target_material_profile: null,
    target_material_profile_validation: null,
    source_inventory: null,
    initial_source_frontier: null,
    source_observations: null,
    source_observation_directive: null,
    source_observation_directive_validation: null,
    lens_judgment_index: null,
    exploration_synthesis: null,
    source_frontier: null,
    source_frontier_validation: null,
    candidate_inventory: null,
    candidate_disposition: null,
    candidate_disposition_validation: null,
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

  it("links actionable seed artifacts through candidate and ontology validation gates", async () => {
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
    const candidateInventory = await writeArtifact(
      path.join(root, "candidate-inventory.yaml"),
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
        source_observation_directive: sourceObservationDirective,
        source_observation_directive_validation:
          sourceObservationDirectiveValidation,
        lens_judgment_index: lensJudgmentIndex,
        exploration_synthesis: explorationSynthesis,
        source_frontier: sourceFrontier,
        source_frontier_validation: sourceFrontierValidation,
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
        source_observation_directive: sourceObservationDirective,
        source_observation_directive_validation:
          sourceObservationDirectiveValidation,
        lens_judgment_index: lensJudgmentIndex,
        exploration_synthesis: explorationSynthesis,
        source_frontier: sourceFrontier,
        source_frontier_validation: sourceFrontierValidation,
        candidate_inventory: candidateInventory,
        candidate_disposition: candidateDisposition,
        candidate_disposition_validation: candidateDispositionValidation,
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
    ).toBe("missing");
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
      "candidate_inventory",
      "candidate_disposition",
      "candidate_disposition_validation",
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
      "candidate_inventory",
      "candidate_disposition",
      "candidate_disposition_validation",
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
      "candidate_inventory",
      "candidate_disposition",
      "candidate_disposition_validation",
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
