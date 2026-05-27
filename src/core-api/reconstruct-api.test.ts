import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructSourceObservationsArtifact,
} from "../core-runtime/reconstruct/artifact-types.js";
import { createOntoReconstructCoreApi } from "./reconstruct-api.js";

const tempRoots: string[] = [];

async function tempProjectRoot(): Promise<string> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-core-api-reconstruct-"),
  );
  tempRoots.push(projectRoot);
  await fs.writeFile(
    path.join(projectRoot, "schedule.csv"),
    "month,revenue\n2026-01,100\n",
    "utf8",
  );
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "src", "feature.ts"),
    "export const feature = 'reconstruct';\n",
    "utf8",
  );
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("createOntoReconstructCoreApi", () => {
  it("lists source profiles from the configured onto home", async () => {
    const api = createOntoReconstructCoreApi({
      ontoHome: path.resolve("."),
    });

    const profiles = await api.listSourceProfiles();

    expect(profiles.map((profile) => profile.target_material_kind).sort()).toEqual([
      "code",
      "database",
      "document",
      "spreadsheet",
    ]);
  });

  it("prepares reconstruct artifacts and record without generating ontology meaning", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReconstructCoreApi({
      ontoHome: path.resolve("."),
    });

    const prepared = await api.prepareReconstruct({
      projectRoot,
      targetRefs: ["schedule.csv"],
      sessionRoot: ".onto/reconstruct/test-session",
    });

    expect(prepared.sessionId).toBe("test-session");
    expect(prepared.reconstructRecord.record_stage).toBe("preparation_artifacts_written");
    expect(prepared.reconstructRecord.target_material_kind).toBe("spreadsheet");
    expect(prepared.reconstructRecord.runtime_boundary.semantic_generation)
      .toBe("not_performed");
    expect(prepared.artifactRefs.target_material_profile).toContain(
      "target-material-profile.yaml",
    );
    expect(prepared.artifactRefs.reconstruct_record).toContain(
      "reconstruct-record.yaml",
    );
  });

  it("validates LLM-owned directives and reassembles the reconstruct record", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReconstructCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReconstruct({
      projectRoot,
      targetRefs: ["schedule.csv"],
      sessionRoot: ".onto/reconstruct/test-session",
    });
    const sourceObservations =
      parseYaml(
        await fs.readFile(prepared.artifactRefs.source_observations!, "utf8"),
      ) as ReconstructSourceObservationsArtifact;
    const observation = sourceObservations.observations[0]!;
    const evidenceRef = {
      observation_id: observation.observation_id,
      target_material_kind: observation.target_material_kind,
      source_ref: observation.source_ref,
      location: observation.location,
    };
    const directivePath = path.join(
      prepared.sessionRoot,
      "source-observation-directive.yaml",
    );
    const seedCandidatePath = path.join(prepared.sessionRoot, "seed-candidate.yaml");
    await fs.writeFile(
      directivePath,
      stringifyYaml({
        schema_version: "1",
        session_id: prepared.sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        selected_observations: [
          {
            ...evidenceRef,
            selection_rationale:
              "Core API test selects the runtime observation as evidence.",
          },
        ],
        open_questions: [],
      }),
      "utf8",
    );
    await fs.writeFile(
      seedCandidatePath,
      stringifyYaml({
        schema_version: "1",
        session_id: prepared.sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        purpose: {
          claim_id: "purpose-1",
          statement: "Use the observed spreadsheet material as seed evidence.",
          evidence_refs: [evidenceRef],
        },
        non_goals: [],
        entities: [],
        relations: [],
        actions: [],
        properties: [],
        rules: [],
        open_questions: [],
      }),
      "utf8",
    );

    const directiveValidation = await api.validateSourceObservationDirective({
      directivePath,
      sourceObservationsPath: prepared.artifactRefs.source_observations!,
    });
    const seedValidation = await api.validateSeedCandidate({
      seedCandidatePath,
      sourceObservationsPath: prepared.artifactRefs.source_observations!,
      sourceObservationDirectivePath: directivePath,
      sourceObservationDirectiveValidationPath:
        path.join(prepared.sessionRoot, "source-observation-directive-validation.yaml"),
    });
    const record = await api.assembleRecord({
      sessionRoot: prepared.sessionRoot,
      artifactRefs: {
        target_material_profile: prepared.artifactRefs.target_material_profile,
        source_inventory: prepared.artifactRefs.source_inventory,
        source_observations: prepared.artifactRefs.source_observations,
        source_observation_directive: directivePath,
        source_observation_directive_validation:
          path.join(prepared.sessionRoot, "source-observation-directive-validation.yaml"),
        seed_candidate: seedCandidatePath,
        seed_candidate_validation:
          path.join(prepared.sessionRoot, "seed-candidate-validation.yaml"),
      },
    });
    const readBack = await api.getRecord(prepared.sessionRoot);

    expect(directiveValidation.validation_status).toBe("valid");
    expect(seedValidation.validation_status).toBe("valid");
    expect(record.record_stage).toBe("seed_candidate_validated");
    expect(readBack.validation_summary.seed_candidate_status).toBe("valid");
    expect(readBack.validation_summary.semantic_claim_count).toBe(1);
  });

  it("runs the reconstruct happy path through the core API", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReconstructCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReconstruct({
      projectRoot,
      targetRefs: ["src/feature.ts"],
      intent: "Core API code happy path fixture.",
      sessionRoot: ".onto/reconstruct/core-api-code-run",
      semanticAuthorRealization: "mock",
      confirmationProviderRealization: "mock",
    });
    const readBack = await api.getRunResult(result.sessionRoot);

    expect(result.status).toBe("completed");
    expect(result.reconstructRecord.record_stage).toBe("completed");
    expect(result.reconstructRecord.target_material_kind).toBe("code");
    expect(result.artifactRefs.final_output).toBe(result.finalOutputPath);
    expect(readBack.status).toBe("completed");
    expect(readBack.finalOutputText).toContain("Core API code happy path fixture.");
    expect(readBack.reconstructRunManifest).not.toBeNull();
  });
});
