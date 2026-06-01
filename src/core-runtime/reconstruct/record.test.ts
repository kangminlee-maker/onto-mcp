import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructOntologySeedValidationArtifact,
  ReconstructFinalOutputProvenanceValidationArtifact,
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructInitialSourceFrontierArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import { assembleReconstructRecord } from "./record.js";

const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-record-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function writeYaml(filePath: string, value: unknown): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyYaml(value), "utf8");
  return filePath;
}

function targetMaterialProfile(sessionId: string): ReconstructTargetMaterialProfileArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-05-27T00:00:00.000Z",
    target_refs: ["/tmp/schedule.csv"],
    target_material_kind: "spreadsheet",
    target_material_kind_candidates: ["spreadsheet"],
    support_status: "partial",
    unsupported_reason: "minimal structural observation is implemented",
    selected_source_profiles: [
      {
        target_material_kind: "spreadsheet",
        profile_ref: "/tmp/spreadsheet.md",
        support_summary: "spreadsheet source profile",
        scan_targets: ["workbook_sheet_or_table_unit"],
      },
    ],
    detection: {
      owner: "runtime_heuristic",
      confidence: 0.92,
      confidence_basis: "file extension indicates spreadsheet material",
      per_ref: [
        {
          ref: "/tmp/schedule.csv",
          exists: true,
          kind: "spreadsheet",
          confidence: 0.92,
          confidence_basis: "file extension indicates spreadsheet material",
        },
      ],
    },
  };
}

function sourceInventory(sessionId: string): ReconstructSourceInventoryArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-05-27T00:00:00.000Z",
    inventory_units: [
      {
        ref: "/tmp/schedule.csv",
        exists: true,
        target_material_kind: "spreadsheet",
        inventory_unit: "workbook_sheet_or_table_unit",
        profile_ref: "/tmp/spreadsheet.md",
        scan_status: "planned",
        skip_reason: null,
      },
    ],
    scan_boundary: {
      filesystem_allowed_roots: ["/tmp"],
      source: "binding",
    },
  };
}

function initialSourceFrontier(sessionId: string): ReconstructInitialSourceFrontierArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-05-27T00:00:00.000Z",
    frontier_id: "initial",
    source_refs: [
      {
        frontier_ref_id: "frontier_initial_abc",
        source_ref: "/tmp/schedule.csv",
        target_material_kind: "spreadsheet",
        inventory_unit: "workbook_sheet_or_table_unit",
        profile_ref: "/tmp/spreadsheet.md",
        rationale: "Initial source frontier from inventory.",
      },
    ],
    skipped_refs: [],
  };
}

function sourceObservations(sessionId: string): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-05-27T00:00:00.000Z",
    observations: [
      {
        observation_id: "obs_spreadsheet_abc",
        target_material_kind: "spreadsheet",
        adapter_id: "minimal-spreadsheet-structure-observer",
        source_ref: "/tmp/schedule.csv",
        location: "/tmp/schedule.csv",
        summary: "spreadsheet material observed at schedule.csv",
        structural_data: {
          basename: "schedule.csv",
          extension: ".csv",
        },
      },
    ],
    skipped_refs: [],
    validation_results: ["source_observation_boundary_valid"],
  };
}

function sourceObservationValidation(
  sessionId: string,
): ReconstructSourceObservationDirectiveValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-05-27T00:00:00.000Z",
    directive_ref: "/tmp/source-observation-directive.yaml",
    source_observations_ref: "/tmp/source-observations.yaml",
    validation_status: "valid",
    selected_observation_count: 1,
    validation_results: ["source_observation_directive_valid"],
    violations: [],
  };
}

function targetMaterialProfileValidation(
  sessionId: string,
): ReconstructTargetMaterialProfileValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-05-27T00:00:00.000Z",
    target_material_profile_ref: "/tmp/target-material-profile.yaml",
    registry_ref: "/tmp/reconstruct-contract-registry.yaml",
    validation_status: "valid",
    target_ref_count: 1,
    selected_source_profile_count: 1,
    validation_results: ["target_material_profile_valid"],
    violations: [],
  };
}

function ontologySeedValidation(sessionId: string): ReconstructOntologySeedValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-05-27T00:00:00.000Z",
    ontology_seed_ref: "/tmp/ontology-seed.yaml",
    candidate_disposition_ref: "/tmp/candidate-disposition.yaml",
    source_observations_ref: "/tmp/source-observations.yaml",
    registry_ref: "/tmp/reconstruct-contract-registry.yaml",
    validation_status: "valid",
    seed_ref_count: 3,
    evidence_ref_count: 3,
    limitation_count: 0,
    validation_results: ["ontology_seed_valid"],
    violations: [],
  };
}

function genericValidation(sessionId: string, status: "valid" | "invalid" = "valid") {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-05-27T00:00:00.000Z",
    validation_status: status,
    validation_results: [status === "valid" ? "valid" : "invalid"],
    violations: status === "valid"
      ? []
      : [{
        code: "missing_required_coverage",
        message: "fixture invalid validation",
        subject_id: "fixture",
      }],
  };
}

function finalOutputProvenanceValidation(
  sessionId: string,
  status: "valid" | "invalid" = "valid",
): ReconstructFinalOutputProvenanceValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-05-27T00:00:00.000Z",
    final_output_ref: "/tmp/final-output.md",
    validation_status: status,
    required_fragments: ["ontology-seed.yaml"],
    section_bindings: [
      {
        section_id: "artifact_truth",
        heading: "Artifact Truth",
        claim_summary: "Final output cites authority artifacts.",
        authority_refs: ["ontology-seed.yaml"],
        validation_refs: ["ontology-seed-validation.yaml"],
        required_fragments: ["ontology-seed.yaml"],
        binding_status: status === "valid" ? "present" : "missing",
        trust_status: status === "valid" ? "grounded" : "unbound",
      },
    ],
    validation_results: [
      status === "valid"
        ? "final_output_provenance_valid"
        : "final_output_provenance_invalid",
    ],
    violations: status === "valid"
      ? []
      : [{
        code: "missing_required_coverage",
        message: "final output is missing required artifact provenance",
        subject_id: "artifact_truth",
      }],
  };
}

async function writeCompletedRecordFixture(
  sessionRoot: string,
  finalOutputProvenanceStatus: "valid" | "invalid" | "missing" = "valid",
): Promise<Partial<ReconstructRecordArtifactRefs>> {
  const sessionId = path.basename(sessionRoot);
  const refs: Partial<ReconstructRecordArtifactRefs> = {
    target_material_profile: await writeYaml(
      path.join(sessionRoot, "target-material-profile.yaml"),
      targetMaterialProfile(sessionId),
    ),
    target_material_profile_validation: await writeYaml(
      path.join(sessionRoot, "target-material-profile-validation.yaml"),
      targetMaterialProfileValidation(sessionId),
    ),
    source_inventory: await writeYaml(
      path.join(sessionRoot, "source-inventory.yaml"),
      sourceInventory(sessionId),
    ),
    initial_source_frontier: await writeYaml(
      path.join(sessionRoot, "initial-source-frontier.yaml"),
      initialSourceFrontier(sessionId),
    ),
    source_observations: await writeYaml(
      path.join(sessionRoot, "source-observations.yaml"),
      sourceObservations(sessionId),
    ),
    source_observation_directive_validation: await writeYaml(
      path.join(sessionRoot, "source-observation-directive-validation.yaml"),
      sourceObservationValidation(sessionId),
    ),
    candidate_disposition_validation: await writeYaml(
      path.join(sessionRoot, "candidate-disposition-validation.yaml"),
      genericValidation(sessionId),
    ),
    ontology_seed_validation: await writeYaml(
      path.join(sessionRoot, "ontology-seed-validation.yaml"),
      ontologySeedValidation(sessionId),
    ),
    claim_realization_map_validation: await writeYaml(
      path.join(sessionRoot, "claim-realization-map-validation.yaml"),
      genericValidation(sessionId),
    ),
    seed_confirmation: await writeYaml(
      path.join(sessionRoot, "seed-confirmation.yaml"),
      {
        schema_version: "1",
        session_id: sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        ontology_seed_ref: "ontology-seed.yaml",
        ontology_seed_validation_ref: "ontology-seed-validation.yaml",
        confirmation_status: "accepted",
        confirmed_claim_ids: ["claim-1"],
        rejected_claim_ids: [],
        partial_claim_ids: [],
        deferred_claim_ids: [],
        notes: [],
        confirmation_provider: { owner: "mock", provider_id: "fixture" },
      },
    ),
    seed_confirmation_validation: await writeYaml(
      path.join(sessionRoot, "seed-confirmation-validation.yaml"),
      {
        ...genericValidation(sessionId),
        accepted_claim_ids: ["claim-1"],
        rejected_claim_ids: [],
        partial_claim_ids: [],
        deferred_claim_ids: [],
        cq_eligible_claim_ids: ["claim-1"],
      },
    ),
    competency_questions: await writeYaml(
      path.join(sessionRoot, "competency-questions.yaml"),
      {
        schema_version: "1",
        session_id: sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        questions: [{ question_id: "cq-1" }],
        open_questions: [],
      },
    ),
    competency_questions_validation: await writeYaml(
      path.join(sessionRoot, "competency-questions-validation.yaml"),
      genericValidation(sessionId),
    ),
    competency_question_assessment: await writeYaml(
      path.join(sessionRoot, "competency-question-assessment.yaml"),
      {
        schema_version: "1",
        session_id: sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        assessments: [{ question_id: "cq-1" }],
      },
    ),
    competency_question_assessment_validation: await writeYaml(
      path.join(sessionRoot, "competency-question-assessment-validation.yaml"),
      genericValidation(sessionId),
    ),
    failure_classification: await writeYaml(
      path.join(sessionRoot, "failure-classification.yaml"),
      {
        schema_version: "1",
        session_id: sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        failures: [],
      },
    ),
    failure_classification_validation: await writeYaml(
      path.join(sessionRoot, "failure-classification-validation.yaml"),
      { ...genericValidation(sessionId), failure_count: 0, material_failure_count: 0 },
    ),
    revision_proposal: await writeYaml(
      path.join(sessionRoot, "revision-proposal.yaml"),
      {
        schema_version: "1",
        session_id: sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        proposals: [],
      },
    ),
    revision_proposal_validation: await writeYaml(
      path.join(sessionRoot, "revision-proposal-validation.yaml"),
      { ...genericValidation(sessionId), proposal_count: 0 },
    ),
    reconstruct_metrics: await writeYaml(
      path.join(sessionRoot, "reconstruct-metrics.yaml"),
      {
        schema_version: "1",
        session_id: sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        semantic_claim_count: 1,
        evidence_ref_count: 1,
        confirmed_claim_count: 1,
        rejected_claim_count: 0,
        partial_claim_count: 0,
        deferred_claim_count: 0,
        competency_question_count: 1,
        competency_question_assessment_count: 1,
        unresolved_question_count: 0,
        deferred_count: 0,
        pass_rate: 1,
      },
    ),
    stop_decision: await writeYaml(
      path.join(sessionRoot, "stop-decision.yaml"),
      { schema_version: "1", session_id: sessionId, decision: "stop" },
    ),
    pre_handoff_run_manifest_validation: await writeYaml(
      path.join(sessionRoot, "reconstruct-run-manifest.pre-handoff-validation.yaml"),
      genericValidation(sessionId),
    ),
    post_publication_run_manifest_validation: await writeYaml(
      path.join(sessionRoot, "reconstruct-run-manifest.post-publication-validation.yaml"),
      genericValidation(sessionId),
    ),
    handoff_decision_validation: await writeYaml(
      path.join(sessionRoot, "handoff-decision-validation.yaml"),
      genericValidation(sessionId),
    ),
    final_output: path.join(sessionRoot, "final-output.md"),
    reconstruct_run_manifest: await writeYaml(
      path.join(sessionRoot, "reconstruct-run-manifest.yaml"),
      { schema_version: "1", session_id: sessionId },
    ),
  };
  await fs.writeFile(
    refs.final_output as string,
    "## Artifact Truth\n- ontology-seed.yaml\n",
    "utf8",
  );
  if (finalOutputProvenanceStatus !== "missing") {
    refs.final_output_provenance_validation = await writeYaml(
      path.join(sessionRoot, "final-output-provenance-validation.yaml"),
      finalOutputProvenanceValidation(sessionId, finalOutputProvenanceStatus),
    );
  }
  return refs;
}

describe("assembleReconstructRecord", () => {
  it("writes a primary reconstruct record with material and validation refs", async () => {
    const sessionRoot = await makeTmpProject();
    const sessionId = path.basename(sessionRoot);
    const targetMaterialProfilePath = await writeYaml(
      path.join(sessionRoot, "target-material-profile.yaml"),
      targetMaterialProfile(sessionId),
    );
    const sourceInventoryPath = await writeYaml(
      path.join(sessionRoot, "source-inventory.yaml"),
      sourceInventory(sessionId),
    );
    const targetMaterialProfileValidationPath = await writeYaml(
      path.join(sessionRoot, "target-material-profile-validation.yaml"),
      targetMaterialProfileValidation(sessionId),
    );
    const initialSourceFrontierPath = await writeYaml(
      path.join(sessionRoot, "initial-source-frontier.yaml"),
      initialSourceFrontier(sessionId),
    );
    const sourceObservationsPath = await writeYaml(
      path.join(sessionRoot, "source-observations.yaml"),
      sourceObservations(sessionId),
    );
    const sourceObservationValidationPath = await writeYaml(
      path.join(sessionRoot, "source-observation-directive-validation.yaml"),
      sourceObservationValidation(sessionId),
    );
    const ontologySeedValidationPath = await writeYaml(
      path.join(sessionRoot, "ontology-seed-validation.yaml"),
      ontologySeedValidation(sessionId),
    );

    const record = await assembleReconstructRecord({
      sessionRoot,
      artifactRefs: {
        target_material_profile: targetMaterialProfilePath,
        target_material_profile_validation: targetMaterialProfileValidationPath,
        source_inventory: sourceInventoryPath,
        initial_source_frontier: initialSourceFrontierPath,
        source_observations: sourceObservationsPath,
        source_observation_directive_validation: sourceObservationValidationPath,
        ontology_seed_validation: ontologySeedValidationPath,
      },
    });

    const writtenPath = path.join(sessionRoot, "reconstruct-record.yaml");
    const written =
      parseYaml(await fs.readFile(writtenPath, "utf8")) as ReconstructRecordArtifact;
    expect(record.record_stage).toBe("ontology_seed_validated");
    expect(record.target_material_kind).toBe("spreadsheet");
    expect(record.support_status).toBe("partial");
    expect(record.validation_summary).toMatchObject({
      target_material_profile_status: "valid",
      source_observation_directive_status: "valid",
      ontology_seed_status: "valid",
      evidence_ref_count: 3,
    });
    expect(record.runtime_boundary.semantic_generation).toBe("not_performed");
    expect(written.artifact_refs.target_material_profile)
      .toBe(path.resolve(targetMaterialProfilePath));
    expect(written.missing_artifacts).toEqual([]);
  });

  it("keeps the record incomplete when required preparation artifacts are absent", async () => {
    const sessionRoot = await makeTmpProject();

    const record = await assembleReconstructRecord({
      sessionRoot,
      artifactRefs: {},
    });

    expect(record.record_stage).toBe("incomplete");
    expect(record.target_material_kind).toBeNull();
    expect(record.validation_summary.source_observation_directive_status)
      .toBe("not_available");
    expect(record.validation_summary.ontology_seed_status).toBe("not_available");
    expect(record.missing_artifacts).toEqual([
      "target_material_profile",
      "target_material_profile_validation",
      "source_inventory",
      "initial_source_frontier",
      "source_observations",
    ]);
    expect(record.warnings[0]).toContain("missing artifact refs");
  });

  it("requires final-output provenance validation before projecting completion", async () => {
    const validRoot = await makeTmpProject();
    const validRecord = await assembleReconstructRecord({
      sessionRoot: validRoot,
      artifactRefs: await writeCompletedRecordFixture(validRoot, "valid"),
    });
    const missingRoot = await makeTmpProject();
    const missingRecord = await assembleReconstructRecord({
      sessionRoot: missingRoot,
      artifactRefs: await writeCompletedRecordFixture(missingRoot, "missing"),
    });
    const invalidRoot = await makeTmpProject();
    const invalidRecord = await assembleReconstructRecord({
      sessionRoot: invalidRoot,
      artifactRefs: await writeCompletedRecordFixture(invalidRoot, "invalid"),
    });

    expect(validRecord.record_stage).toBe("completed");
    expect(validRecord.validation_summary.final_output_provenance_status).toBe("valid");
    expect(missingRecord.record_stage).toBe("handoff_decision_validated");
    expect(missingRecord.validation_summary.final_output_provenance_status)
      .toBe("not_available");
    expect(invalidRecord.record_stage).toBe("handoff_decision_validated");
    expect(invalidRecord.validation_summary.final_output_provenance_status).toBe("invalid");
    expect(invalidRecord.warnings).toContain(
      "final output provenance validation is invalid",
    );
  });
});
