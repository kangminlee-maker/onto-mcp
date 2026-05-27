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
    source_inventory: null,
    source_observations: null,
    source_observation_directive: null,
    source_observation_directive_validation: null,
    domain_context_selection: null,
    domain_context_selection_validation: null,
    seed_candidate: null,
    seed_candidate_validation: null,
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
    final_output: null,
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
      source_observation_directive_status: "not_available",
      seed_candidate_status: "not_available",
      seed_confirmation_status: "not_available",
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
  await fs.writeFile(filePath, `artifact: ${path.basename(filePath)}\n`, "utf8");
  return filePath;
}

describe("buildReconstructPipelineExecutionLedger", () => {
  it("trusts runtime preparation stages when their outputs exist", async () => {
    const root = await tempSessionRoot();
    const targetMaterialProfile = await writeArtifact(
      path.join(root, "target-material-profile.yaml"),
    );
    const sourceInventory = await writeArtifact(
      path.join(root, "source-inventory.yaml"),
    );
    const sourceObservations = await writeArtifact(
      path.join(root, "source-observations.yaml"),
    );

    const ledger = await buildReconstructPipelineExecutionLedger({
      sessionRoot: root,
      reconstructRecord: record(root, {
        target_material_profile: targetMaterialProfile,
        source_inventory: sourceInventory,
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
    const sourceInventory = await writeArtifact(
      path.join(root, "source-inventory.yaml"),
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
        source_inventory: sourceInventory,
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
        source_inventory: sourceInventory,
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
});
