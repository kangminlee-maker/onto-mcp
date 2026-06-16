import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import {
  validateSourceObservationDirective,
  writeSourceObservationDirectiveValidationArtifact,
} from "./directive-validation.js";

const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-directive-"));
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
    ],
    skipped_refs: [],
    validation_results: ["source_observation_boundary_valid"],
  };
}

function validDirective(): ReconstructSourceObservationDirectiveArtifact {
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

describe("validateSourceObservationDirective", () => {
  it("accepts selected observations that match runtime observations", () => {
    const validation = validateSourceObservationDirective({
      directive: validDirective(),
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.validation_results).toEqual([
      "source_observation_directive_valid",
    ]);
    expect(validation.violations).toEqual([]);
  });

  it("rejects unknown, duplicate, and mismatched observation refs", () => {
    const directive = validDirective();
    directive.selected_observations = [
      {
        ...directive.selected_observations[0],
        target_material_kind: "document",
        selection_rationale: "",
      },
      directive.selected_observations[0],
      {
        ...directive.selected_observations[0],
        observation_id: "obs_missing",
      },
    ];

    const validation = validateSourceObservationDirective({
      directive,
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((entry) => entry.code)).toEqual([
      "material_kind_mismatch",
      "selection_rationale_missing",
      "duplicate_observation_ref",
      "unknown_observation_ref",
    ]);
  });

});

describe("validateSourceObservationDirective rejection branches", () => {
  it("rejects directive session_id that does not match observations", () => {
    const directive = structuredClone(validDirective());
    directive.session_id = "session-other";

    const validation = validateSourceObservationDirective({
      directive,
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "session_id_mismatch")).toBe(true);
  });

  it("rejects a directive with an empty selection", () => {
    const directive = structuredClone(validDirective());
    directive.selected_observations = [];

    const validation = validateSourceObservationDirective({
      directive,
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "empty_selection")).toBe(true);
  });

  it("rejects a selection whose source_ref does not match the observation", () => {
    const directive = structuredClone(validDirective());
    directive.selected_observations[0].source_ref = "/tmp/other-source.csv";

    const validation = validateSourceObservationDirective({
      directive,
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "source_ref_mismatch")).toBe(true);
  });

  it("rejects a selection whose location does not match the observation", () => {
    const directive = structuredClone(validDirective());
    directive.selected_observations[0].location = "/tmp/other-location.csv";

    const validation = validateSourceObservationDirective({
      directive,
      sourceObservations: sourceObservations(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "location_mismatch")).toBe(true);
  });
});

describe("validateSourceObservationDirective artifact write", () => {
  it("writes a validation artifact from directive and observations files", async () => {
    const root = await makeTmpProject();
    const directivePath = path.join(root, "source-observation-directive.yaml");
    const sourceObservationsPath = path.join(root, "source-observations.yaml");
    const outputPath = path.join(root, "source-observation-directive-validation.yaml");
    await fs.writeFile(directivePath, stringifyYaml(validDirective()), "utf8");
    await fs.writeFile(sourceObservationsPath, stringifyYaml(sourceObservations()), "utf8");

    const validation = await writeSourceObservationDirectiveValidationArtifact({
      directivePath,
      sourceObservationsPath,
      outputPath,
    });

    const written =
      parseYaml(await fs.readFile(outputPath, "utf8")) as ReconstructSourceObservationDirectiveValidationArtifact;
    expect(validation.validation_status).toBe("valid");
    expect(written.directive_ref).toBe(path.resolve(directivePath));
    expect(written.source_observations_ref).toBe(path.resolve(sourceObservationsPath));
  });
});
