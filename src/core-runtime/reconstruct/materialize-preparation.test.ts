import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";
import { materializeReconstructPreparationArtifacts } from "./materialize-preparation.js";

const profilesRoot = path.resolve(".onto/processes/reconstruct/source-profiles");
const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-prep-"));
  tmpRoots.push(root);
  return root;
}

async function readYaml<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("materializeReconstructPreparationArtifacts", () => {
  it("writes material profile, inventory, and structural observations", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-a");
    const target = path.join(root, "schedule.csv");
    await fs.writeFile(target, "account,amount\ncash,10\n", "utf8");

    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [target],
      profilesRoot,
      filesystemAllowedRoots: [root],
    });

    const materialProfile =
      await readYaml<ReconstructTargetMaterialProfileArtifact>(
        refs.target_material_profile,
      );
    const inventory =
      await readYaml<ReconstructSourceInventoryArtifact>(refs.source_inventory);
    const observations =
      await readYaml<ReconstructSourceObservationsArtifact>(
        refs.source_observations,
      );

    expect(materialProfile.target_material_kind).toBe("spreadsheet");
    expect(materialProfile.selected_source_profiles).toHaveLength(1);
    expect(materialProfile.support_status).toBe("partial");
    expect(inventory.inventory_units).toEqual([
      expect.objectContaining({
        ref: target,
        exists: true,
        target_material_kind: "spreadsheet",
        scan_status: "planned",
      }),
    ]);
    expect(observations.observations).toHaveLength(1);
    expect(observations.observations[0]).toEqual(
      expect.objectContaining({
        observation_id: expect.stringMatching(/^obs_spreadsheet_[0-9a-f]+$/),
        target_material_kind: "spreadsheet",
        adapter_id: "minimal-spreadsheet-structure-observer",
        source_ref: target,
      }),
    );
    expect(observations.validation_results).toContain(
      "source_observation_boundary_valid",
    );
  });

  it("keeps unknown targets skipped instead of guessing an adapter", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-b");
    const target = path.join(root, "opaque.target");
    await fs.writeFile(target, "opaque", "utf8");

    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [target],
      profilesRoot,
      filesystemAllowedRoots: [root],
    });

    const materialProfile =
      await readYaml<ReconstructTargetMaterialProfileArtifact>(
        refs.target_material_profile,
      );
    const observations =
      await readYaml<ReconstructSourceObservationsArtifact>(
        refs.source_observations,
      );

    expect(materialProfile.target_material_kind).toBe("unknown");
    expect(materialProfile.support_status).toBe("unknown");
    expect(observations.observations).toEqual([]);
    expect(observations.skipped_refs).toEqual([
      expect.objectContaining({
        ref: target,
        target_material_kind: "unknown",
      }),
    ]);
  });
});
