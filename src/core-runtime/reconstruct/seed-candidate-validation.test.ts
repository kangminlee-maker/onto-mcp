import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructSeedCandidateArtifact,
  ReconstructSeedCandidateValidationArtifact,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import {
  validateSeedCandidate,
  writeSeedCandidateValidationArtifact,
} from "./seed-candidate-validation.js";

const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-seed-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function sourceObservations(): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-a",
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
      {
        observation_id: "obs_document_def",
        target_material_kind: "document",
        adapter_id: "minimal-document-structure-observer",
        source_ref: "/tmp/policy.md",
        location: "/tmp/policy.md",
        summary: "document material observed at policy.md",
        structural_data: {
          basename: "policy.md",
          extension: ".md",
        },
      },
    ],
    skipped_refs: [],
    validation_results: ["source_observation_boundary_valid"],
  };
}

function evidenceRef(observationId = "obs_spreadsheet_abc") {
  return {
    observation_id: observationId,
    target_material_kind: observationId === "obs_document_def" ? "document" : "spreadsheet",
    source_ref: observationId === "obs_document_def" ? "/tmp/policy.md" : "/tmp/schedule.csv",
    location: observationId === "obs_document_def" ? "/tmp/policy.md" : "/tmp/schedule.csv",
  } as const;
}

function sourceObservationDirective(): ReconstructSourceObservationDirectiveArtifact {
  return {
    schema_version: "1",
    session_id: "session-a",
    created_at: "2026-05-27T00:00:00.000Z",
    selected_observations: [
      {
        observation_id: "obs_spreadsheet_abc",
        target_material_kind: "spreadsheet",
        source_ref: "/tmp/schedule.csv",
        location: "/tmp/schedule.csv",
        selection_rationale: "The observation is a structural spreadsheet ref.",
      },
    ],
    open_questions: [],
  };
}

function sourceObservationDirectiveValidation(
  validationStatus: "valid" | "invalid" = "valid",
): ReconstructSourceObservationDirectiveValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-a",
    created_at: "2026-05-27T00:00:00.000Z",
    directive_ref: "/tmp/source-observation-directive.yaml",
    source_observations_ref: "/tmp/source-observations.yaml",
    validation_status: validationStatus,
    selected_observation_count: 1,
    validation_results: validationStatus === "valid"
      ? ["source_observation_directive_valid"]
      : ["source_observation_directive_invalid"],
    violations: [],
  };
}

function validSeedCandidate(): ReconstructSeedCandidateArtifact {
  return {
    schema_version: "1",
    session_id: "session-a",
    created_at: "2026-05-27T00:00:00.000Z",
    purpose: {
      claim_id: "purpose-1",
      name: "Spreadsheet Purpose",
      statement: "Explain the declared spreadsheet purpose.",
      evidence_refs: [evidenceRef()],
    },
    non_goals: [],
    entities: [
      {
        claim_id: "entity-1",
        name: "Schedule Row",
        statement: "Schedule row is a candidate entity.",
        evidence_refs: [evidenceRef()],
      },
    ],
    relations: [],
    actions: [],
    properties: [],
    rules: [
      {
        claim_id: "rule-1",
        name: "Formula-Like Cell Rule",
        statement: "Formula-like cells are candidate rules.",
        evidence_refs: [evidenceRef()],
      },
    ],
    open_questions: [],
  };
}

describe("validateSeedCandidate", () => {
  it("accepts semantic claims when each claim cites selected runtime observations", () => {
    const validation = validateSeedCandidate({
      seedCandidate: validSeedCandidate(),
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.validation_results).toEqual(["seed_candidate_evidence_valid"]);
    expect(validation.semantic_claim_count).toBe(3);
    expect(validation.evidence_ref_count).toBe(3);
    expect(validation.violations).toEqual([]);
  });

  it("rejects semantic claims without validated observation evidence", () => {
    const seedCandidate = validSeedCandidate();
    seedCandidate.entities = [
      {
        claim_id: "duplicate-id",
        name: "Entity 1",
        statement: "",
        evidence_refs: [],
      },
      {
        claim_id: "duplicate-id",
        name: "Unknown Evidence Entity",
        statement: "Unknown evidence is rejected.",
        evidence_refs: [{
          ...evidenceRef(),
          observation_id: "obs_missing",
        }],
      },
    ];
    seedCandidate.relations = [
      {
        claim_id: "relation-1",
        name: "Unselected Evidence Relation",
        statement: "Unselected evidence is rejected.",
        evidence_refs: [evidenceRef("obs_document_def")],
      },
    ];
    seedCandidate.properties = [
      {
        claim_id: "property-1",
        name: "Mismatched Material Property",
        statement: "Mismatched material is rejected.",
        evidence_refs: [{
          ...evidenceRef(),
          target_material_kind: "document",
        }],
      },
    ];
    seedCandidate.rules = [
      {
        claim_id: "rule-1",
        name: "Mismatched Location Rule",
        statement: "Mismatched source and location are rejected.",
        evidence_refs: [{
          ...evidenceRef(),
          source_ref: "/tmp/other.csv",
          location: "/tmp/other.csv",
        }],
      },
    ];

    const validation = validateSeedCandidate({
      seedCandidate,
      sourceObservations: sourceObservations(),
      sourceObservationDirective: sourceObservationDirective(),
      sourceObservationDirectiveValidation: sourceObservationDirectiveValidation("invalid"),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "prior_observation_directive_invalid",
      "duplicate_claim_id",
      "claim_name_generic",
      "claim_statement_missing",
      "claim_evidence_missing",
      "unknown_observation_ref",
      "unselected_observation_ref",
      "material_kind_mismatch",
      "source_ref_mismatch",
      "location_mismatch",
    ]));
  });

  it("reports malformed SeedCandidateDirective shape instead of throwing", () => {
    const malformedSeedCandidate = {
      schema_version: "1",
      session_id: "session-a",
      created_at: "2026-05-27T00:00:00.000Z",
      purpose: {
        statement: "",
        evidence_refs: [
          {
            observation_id: "obs_spreadsheet_abc",
            target_material_kind: "not-a-kind",
            location: "/tmp/schedule.csv",
          },
        ],
      },
      entities: "not-an-array",
      relations: [],
      actions: [],
      properties: [],
      rules: [],
    } as unknown as ReconstructSeedCandidateArtifact;

    const validation = validateSeedCandidate({
      seedCandidate: malformedSeedCandidate,
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "schema_shape_invalid",
      "claim_id_missing",
      "claim_name_missing",
      "claim_statement_missing",
      "claim_evidence_missing",
      "evidence_ref_shape_invalid",
    ]));
  });

  it("writes a validation artifact from SeedCandidateDirective and evidence files", async () => {
    const root = await makeTmpProject();
    const seedCandidatePath = path.join(root, "seed-candidate.yaml");
    const sourceObservationsPath = path.join(root, "source-observations.yaml");
    const sourceObservationDirectivePath =
      path.join(root, "source-observation-directive.yaml");
    const sourceObservationDirectiveValidationPath =
      path.join(root, "source-observation-directive-validation.yaml");
    const outputPath = path.join(root, "seed-candidate-validation.yaml");
    await fs.writeFile(seedCandidatePath, stringifyYaml(validSeedCandidate()), "utf8");
    await fs.writeFile(sourceObservationsPath, stringifyYaml(sourceObservations()), "utf8");
    await fs.writeFile(
      sourceObservationDirectivePath,
      stringifyYaml(sourceObservationDirective()),
      "utf8",
    );
    await fs.writeFile(
      sourceObservationDirectiveValidationPath,
      stringifyYaml(sourceObservationDirectiveValidation()),
      "utf8",
    );

    const validation = await writeSeedCandidateValidationArtifact({
      seedCandidatePath,
      sourceObservationsPath,
      sourceObservationDirectivePath,
      sourceObservationDirectiveValidationPath,
      outputPath,
    });

    const written =
      parseYaml(await fs.readFile(outputPath, "utf8")) as ReconstructSeedCandidateValidationArtifact;
    expect(validation.validation_status).toBe("valid");
    expect(written.seed_candidate_ref).toBe(path.resolve(seedCandidatePath));
    expect(written.source_observations_ref).toBe(path.resolve(sourceObservationsPath));
    expect(written.source_observation_directive_ref)
      .toBe(path.resolve(sourceObservationDirectivePath));
    expect(written.source_observation_directive_validation_ref)
      .toBe(path.resolve(sourceObservationDirectiveValidationPath));
  });
});
