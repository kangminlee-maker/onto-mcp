import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructRecordArtifact,
  ReconstructSeedCandidateValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
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

function seedCandidateValidation(sessionId: string): ReconstructSeedCandidateValidationArtifact {
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-05-27T00:00:00.000Z",
    seed_candidate_ref: "/tmp/seed-candidate.yaml",
    source_observations_ref: "/tmp/source-observations.yaml",
    source_observation_directive_ref: "/tmp/source-observation-directive.yaml",
    source_observation_directive_validation_ref:
      "/tmp/source-observation-directive-validation.yaml",
    validation_status: "valid",
    semantic_claim_count: 3,
    evidence_ref_count: 3,
    validation_results: ["seed_candidate_evidence_valid"],
    violations: [],
  };
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
    const sourceObservationsPath = await writeYaml(
      path.join(sessionRoot, "source-observations.yaml"),
      sourceObservations(sessionId),
    );
    const sourceObservationValidationPath = await writeYaml(
      path.join(sessionRoot, "source-observation-directive-validation.yaml"),
      sourceObservationValidation(sessionId),
    );
    const seedCandidateValidationPath = await writeYaml(
      path.join(sessionRoot, "seed-candidate-validation.yaml"),
      seedCandidateValidation(sessionId),
    );

    const record = await assembleReconstructRecord({
      sessionRoot,
      artifactRefs: {
        target_material_profile: targetMaterialProfilePath,
        source_inventory: sourceInventoryPath,
        source_observations: sourceObservationsPath,
        source_observation_directive_validation: sourceObservationValidationPath,
        seed_candidate_validation: seedCandidateValidationPath,
      },
    });

    const writtenPath = path.join(sessionRoot, "reconstruct-record.yaml");
    const written =
      parseYaml(await fs.readFile(writtenPath, "utf8")) as ReconstructRecordArtifact;
    expect(record.record_stage).toBe("seed_candidate_validated");
    expect(record.target_material_kind).toBe("spreadsheet");
    expect(record.support_status).toBe("partial");
    expect(record.validation_summary).toMatchObject({
      source_observation_directive_status: "valid",
      seed_candidate_status: "valid",
      semantic_claim_count: 3,
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
    expect(record.validation_summary.seed_candidate_status).toBe("not_available");
    expect(record.missing_artifacts).toEqual([
      "target_material_profile",
      "source_inventory",
      "source_observations",
    ]);
    expect(record.warnings[0]).toContain("missing artifact refs");
  });
});
