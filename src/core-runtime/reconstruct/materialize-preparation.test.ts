import { describe, expect, it, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructInitialSourceFrontierArtifact,
} from "./artifact-types.js";
import { materializeReconstructPreparationArtifacts } from "./materialize-preparation.js";
import { writeTargetMaterialProfileValidationArtifact } from "./material-profile-validation.js";

const profilesRoot = path.resolve(".onto/processes/reconstruct/source-profiles");
const registryPath = path.resolve(".onto/processes/reconstruct/reconstruct-contract-registry.yaml");
const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-prep-"));
  tmpRoots.push(root);
  return root;
}

async function readYaml<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

async function sha256File(filePath: string): Promise<string> {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
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
    const target = path.join(root, "feature.ts");
    await fs.writeFile(target, "export const feature = true;\n", "utf8");

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
    const initialFrontier =
      await readYaml<ReconstructInitialSourceFrontierArtifact>(
        refs.initial_source_frontier,
      );

    expect(materialProfile.target_material_kind).toBe("code");
    expect(materialProfile.selected_source_profiles).toHaveLength(1);
    expect(materialProfile.selected_source_profiles[0]).toEqual(
      expect.objectContaining({
        profile_id: "code-source-profile",
        runtime_implementation_status: "partially_wired",
        migration_status: "current",
      }),
    );
    expect(materialProfile.support_status).toBe("partial");
    expect(inventory.inventory_units).toEqual([
      expect.objectContaining({
        ref: target,
        exists: true,
        target_material_kind: "code",
        scan_status: "planned",
      }),
    ]);
    expect(observations.observations).toHaveLength(1);
    expect(observations.observations[0]).toEqual(
      expect.objectContaining({
        observation_id: expect.stringMatching(/^obs_[0-9a-f]+$/),
        target_material_kind: "code",
        adapter_id: "minimal-code-structure-observer",
        source_ref: target,
      }),
    );
    expect(observations.validation_results).toContain(
      "source_observation_boundary_valid",
    );
    expect(initialFrontier.source_refs).toEqual([
      expect.objectContaining({
        source_ref: target,
        target_material_kind: "code",
      }),
    ]);
  });

  it("observes markdown document targets with the document source profile", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-doc");
    const target = path.join(root, "README.md");
    await fs.writeFile(
      target,
      [
        "# Product Guide",
        "",
        "This guide explains the dashboard audience, ingestion policy, and review workflow.",
        "",
      ].join("\n"),
      "utf8",
    );

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

    expect(materialProfile.target_material_kind).toBe("document");
    expect(materialProfile.support_status).toBe("partial");
    expect(materialProfile.selected_source_profiles[0]).toEqual(
      expect.objectContaining({
        profile_id: "document-source-profile",
        runtime_implementation_status: "partially_wired",
      }),
    );
    expect(inventory.inventory_units[0]).toEqual(
      expect.objectContaining({
        target_material_kind: "document",
        scan_status: "planned",
      }),
    );
    expect(observations.observations[0]).toEqual(
      expect.objectContaining({
        target_material_kind: "document",
        adapter_id: "minimal-document-structure-observer",
        source_ref: target,
      }),
    );
    expect(observations.observations[0]?.structural_data.content_excerpt)
      .toContain("dashboard audience");
  });

  it("captures a text-readable document whole but caps a binary document at the small budget", async () => {
    const root = await makeTmpProject();
    // > 6000 chars so the old leading-slice boundary would truncate it.
    const body = `# Strategy\n\n${"goal milestone problem ".repeat(400)}\n`;
    expect(body.length).toBeGreaterThan(6000);

    const mdTarget = path.join(root, "strategy.md");
    const pdfTarget = path.join(root, "strategy.pdf");
    await fs.writeFile(mdTarget, body, "utf8");
    await fs.writeFile(pdfTarget, body, "utf8"); // .pdf detected as document; read as UTF-8

    const readDoc = async (target: string) => {
      const sessionRoot = path.join(
        root,
        ".onto",
        "reconstruct",
        `session-${path.basename(target)}`,
      );
      const refs = await materializeReconstructPreparationArtifacts({
        sessionRoot,
        targetRefs: [target],
        profilesRoot,
        filesystemAllowedRoots: [root],
      });
      const observations = await readYaml<ReconstructSourceObservationsArtifact>(
        refs.source_observations,
      );
      return observations.observations[0]?.structural_data;
    };

    const md = await readDoc(mdTarget);
    const pdf = await readDoc(pdfTarget);

    // Text-readable document: captured whole (tail reaches seed authoring).
    expect(md?.excerpt_truncated).toBe(false);
    expect(md?.content_excerpt?.length).toBe(body.length);

    // Binary document extension: kept at the small structural sample — never 200K of
    // decoded binary bytes (regression guard, Codex P2).
    expect(pdf?.excerpt_truncated).toBe(true);
    expect(pdf?.content_excerpt?.length).toBe(6000);
  });

  it("uses the default source profile for inventory when another profile sorts first", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-default-profile");
    const registryPath = path.join(
      root,
      ".onto",
      "processes",
      "reconstruct",
      "reconstruct-contract-registry.yaml",
    );
    const tempProfilesRoot = path.join(
      root,
      ".onto",
      "processes",
      "reconstruct",
      "source-profiles",
    );
    const target = path.join(root, "feature.ts");
    const alternateProfile = path.join(tempProfilesRoot, "aaa-code-alt.md");
    await fs.mkdir(tempProfilesRoot, { recursive: true });
    await fs.writeFile(target, "export const feature = true;\n", "utf8");
    await fs.writeFile(
      alternateProfile,
      [
        "# Source Profile: Alternate Code",
        "",
        "> Target material kind: `code`",
        "",
        "## Scan Targets",
        "- alternate code scan",
        "",
      ].join("\n"),
      "utf8",
    );
    const registry = parseYaml(await fs.readFile(
      path.resolve(".onto/processes/reconstruct/reconstruct-contract-registry.yaml"),
      "utf8",
    )) as Record<string, any>;
    registry.source_profile_records = registry.source_profile_records.map(
      (record: Record<string, any>) => {
        if (typeof record.definition_ref !== "string") return record;
        return {
          ...record,
          definition_ref: path.resolve(record.definition_ref),
        };
      },
    );
    registry.source_profile_records.push({
      profile_id: "aaa-code-source-profile",
      target_material_kind: "code",
      is_default_for_kind: false,
      definition_ref: alternateProfile,
      definition_sha256: await sha256File(alternateProfile),
      contract_status: "active",
      runtime_implementation_status: "planned",
      schema_version: 1,
      profile_version: 1,
      migration_status: "current",
      supersedes: [],
      replaced_by: [],
      split_from: [],
      split_into: [],
      merged_from: [],
      merged_into: [],
    });
    await fs.writeFile(registryPath, stringifyYaml(registry), "utf8");

    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [target],
      profilesRoot: tempProfilesRoot,
      filesystemAllowedRoots: [root],
    });

    const materialProfile =
      await readYaml<ReconstructTargetMaterialProfileArtifact>(
        refs.target_material_profile,
      );
    const inventory =
      await readYaml<ReconstructSourceInventoryArtifact>(refs.source_inventory);

    expect(materialProfile.selected_source_profiles[0]).toEqual(
      expect.objectContaining({
        profile_id: "code-source-profile",
        is_default_for_kind: true,
      }),
    );
    expect(inventory.inventory_units[0]).toEqual(
      expect.objectContaining({
        scan_status: "planned",
        profile_ref: expect.stringContaining("code.md"),
      }),
    );
  });

  it("skips contract-active profiles whose runtime adapter is planned", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-planned");
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
    expect(materialProfile.support_status).toBe("unsupported");
    expect(materialProfile.selected_source_profiles[0]).toEqual(
      expect.objectContaining({
        profile_id: "spreadsheet-source-profile",
        runtime_implementation_status: "planned",
      }),
    );
    expect(inventory.inventory_units[0]).toEqual(
      expect.objectContaining({
        scan_status: "skipped",
        skip_reason: expect.stringContaining("runtime_implementation_status=planned"),
      }),
    );
    expect(observations.observations).toEqual([]);
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

  it("expands directory targets into per-member material observations", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-c");
    const code = path.join(root, "src", "feature.ts");
    const sheet = path.join(root, "data", "schedule.csv");
    await fs.mkdir(path.dirname(code), { recursive: true });
    await fs.mkdir(path.dirname(sheet), { recursive: true });
    await fs.writeFile(code, "export const feature = true;\n", "utf8");
    await fs.writeFile(sheet, "month,revenue\n2026-01,100\n", "utf8");

    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [root],
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
    const initialFrontier =
      await readYaml<ReconstructInitialSourceFrontierArtifact>(
        refs.initial_source_frontier,
      );

    expect(materialProfile.target_material_kind).toBe("mixed");
    expect(materialProfile.support_status).toBe("partial_composite");
    expect(materialProfile.target_material_kind_candidates.sort()).toEqual([
      "code",
      "spreadsheet",
    ]);
    expect(observations.observations.map((observation) =>
      observation.target_material_kind
    )).toEqual(["code"]);
    expect(observations.skipped_refs).toEqual([
      expect.objectContaining({
        ref: sheet,
        target_material_kind: "spreadsheet",
        reason: expect.stringContaining("runtime_implementation_status=planned"),
      }),
    ]);
    expect(initialFrontier.source_refs).toHaveLength(1);

    const validation = await writeTargetMaterialProfileValidationArtifact({
      targetMaterialProfilePath: refs.target_material_profile,
      registryPath,
      outputPath: path.join(sessionRoot, "target-material-profile-validation.yaml"),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });
});
