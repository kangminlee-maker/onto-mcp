import { describe, expect, it, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { zipSync, strToU8 } from "fflate";
import type {
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructInitialSourceFrontierArtifact,
} from "./artifact-types.js";
import {
  buildReconstructSourceObservation,
  deriveDocumentExcerptProjectionBudget,
  DOCUMENT_CAPTURE_CEILING_CHARS,
  DOCUMENT_EXCERPT_PROJECTION_FLOOR,
  materializeReconstructPreparationArtifacts,
} from "./materialize-preparation.js";
import type { SupportedModelRegistry } from "../discovery/supported-models.js";
import { writeTargetMaterialProfileValidationArtifact } from "./material-profile-validation.js";
import { SPREADSHEET_OBSERVER_ADAPTER_ID } from "../spreadsheet-structure-observer.js";

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

    // Binary document extension: kept at the small structural sample — never the
    // capture ceiling in decoded binary bytes (regression guard, Codex P2).
    expect(pdf?.excerpt_truncated).toBe(true);
    expect(pdf?.content_excerpt?.length).toBe(6000);
  });

  it("captures a text document past the prior 200K excerpt limit whole (raised capture ceiling)", async () => {
    const root = await makeTmpProject();
    // > 200K chars: the prior DOCUMENT_EXCERPT_CHAR_LIMIT would have truncated
    // this; the raised DOCUMENT_CAPTURE_CEILING_CHARS captures it whole so the
    // seed-stage projection (not capture) owns model-aware narrowing.
    const body = "goal milestone problem decision ".repeat(8000); // 256K chars
    expect(body.length).toBeGreaterThan(200_000);

    const mdTarget = path.join(root, "large.md");
    await fs.writeFile(mdTarget, body, "utf8");
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-large");
    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [mdTarget],
      profilesRoot,
      filesystemAllowedRoots: [root],
    });
    const observations = await readYaml<ReconstructSourceObservationsArtifact>(
      refs.source_observations,
    );
    const md = observations.observations[0]?.structural_data;
    expect(md?.excerpt_truncated).toBe(false);
    expect(md?.content_excerpt?.length).toBe(body.length);
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

  it("skips contract-active profiles whose runtime adapter is planned (database)", async () => {
    // database-source-profile is still `planned`, so it remains the example of a
    // contract-active profile that runtime declines to observe. (spreadsheet was
    // flipped to partially_wired — see the spreadsheet activation test below.)
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-planned");
    const target = path.join(root, "warehouse.sqlite");
    await fs.writeFile(target, "SQLite format 3 ", "utf8");

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

    expect(materialProfile.target_material_kind).toBe("database");
    expect(materialProfile.support_status).toBe("unsupported");
    expect(materialProfile.selected_source_profiles[0]).toEqual(
      expect.objectContaining({
        profile_id: "database-source-profile",
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

  it("observes a spreadsheet through the shared structure observer once partially_wired (C-recon)", async () => {
    // The gate flip (spreadsheet-source-profile → partially_wired) means a real
    // workbook is no longer skipped: it flows through the full prep pipeline and
    // emits a deterministic workbook_inventory in source-observations.yaml.
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-spreadsheet");
    const target = path.join(root, "schedule.csv");
    await fs.writeFile(target, "account,amount\ncash,10\nbank,20\n", "utf8");

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
    expect(materialProfile.support_status).toBe("partial");
    expect(materialProfile.selected_source_profiles[0]).toEqual(
      expect.objectContaining({
        profile_id: "spreadsheet-source-profile",
        runtime_implementation_status: "partially_wired",
      }),
    );
    expect(inventory.inventory_units[0]).toEqual(
      expect.objectContaining({ scan_status: "planned" }),
    );
    expect(observations.observations).toHaveLength(1);
    const observation = observations.observations[0]!;
    expect(observation.adapter_id).toBe(SPREADSHEET_OBSERVER_ADAPTER_ID);
    expect(observation.summary).toContain("structure_inspected_only");
    const sd = observation.structural_data as Record<string, any>;
    expect(sd.workbook_inventory).toBeDefined();
    expect(sd.workbook_inventory.workbook_kind).toBe("csv");
    expect(sd.workbook_inventory.inspection_method).toBe("structure_inspected_only");
    // Raw-byte hash surfaced top-level for source-scout-pack admission (§11 HASH-1).
    expect(sd.content_sha256).toBe(sd.workbook_inventory.content_sha256);
  });

  it("observes an xlsx workbook through the full prep pipeline (C-recon, binary path)", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-xlsx");
    const target = path.join(root, "book.xlsx");
    const relsNs = "http://schemas.openxmlformats.org/package/2006/relationships";
    const wbR =
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const worksheetRelType =
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
    const bytes = zipSync({
      "xl/workbook.xml": strToU8(
        `<?xml version="1.0"?><workbook ${wbR}><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${relsNs}">` +
          `<Relationship Id="rId1" Type="${worksheetRelType}" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        `<?xml version="1.0"?><worksheet><sheetData><row r="1">` +
          `<c r="A1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>`,
      ),
    });
    await fs.writeFile(target, Buffer.from(bytes));

    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [target],
      profilesRoot,
      filesystemAllowedRoots: [root],
    });

    const observations =
      await readYaml<ReconstructSourceObservationsArtifact>(refs.source_observations);
    expect(observations.observations).toHaveLength(1);
    const observation = observations.observations[0]!;
    expect(observation.adapter_id).toBe(SPREADSHEET_OBSERVER_ADAPTER_ID);
    const sd = observation.structural_data as Record<string, any>;
    expect(sd.workbook_inventory.workbook_kind).toBe("xlsx");
    expect(sd.workbook_inventory.inspection_method).toBe("structure_inspected_only");
    expect(sd.workbook_inventory.formula_cells).toHaveLength(1);
    expect(sd.workbook_inventory.formula_cells[0].formula).toContain("1+1");
    expect(sd.content_sha256).toBe(sd.workbook_inventory.content_sha256);
  });

  it("demotes an unsupported workbook format (.xls) to a skip — keeps the evidence gate honest (Codex P2)", async () => {
    // After the gate flip an .xls/.xlsb/.ods ref is runnable, but the observer cannot
    // extract it (unsupported_reason). It must NOT pass the evidence gate as an empty
    // observation — it is demoted to a skip so a sole-target run fails loud.
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-xls");
    const target = path.join(root, "legacy.xls");
    await fs.writeFile(target, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]));

    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [target],
      profilesRoot,
      filesystemAllowedRoots: [root],
    });

    const observations =
      await readYaml<ReconstructSourceObservationsArtifact>(refs.source_observations);
    // No structural evidence → demoted to skip → zero observations (sole target halts).
    expect(observations.observations).toEqual([]);
    expect(observations.skipped_refs).toEqual([
      expect.objectContaining({
        target_material_kind: "spreadsheet",
        reason: expect.stringContaining("extraction unsupported"),
      }),
    ]);
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
    // Both members now observe: code via the minimal observer, the spreadsheet via
    // the shared structure observer (gate flipped to partially_wired).
    expect(
      observations.observations.map((observation) => observation.target_material_kind).sort(),
    ).toEqual(["code", "spreadsheet"]);
    expect(observations.skipped_refs).toEqual([]);
    expect(initialFrontier.source_refs).toHaveLength(2);

    const validation = await writeTargetMaterialProfileValidationArtifact({
      targetMaterialProfilePath: refs.target_material_profile,
      registryPath,
      outputPath: path.join(sessionRoot, "target-material-profile-validation.yaml"),
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });
});

describe("deriveDocumentExcerptProjectionBudget", () => {
  const registry: SupportedModelRegistry = {
    schema_version: "1",
    supported_models: [
      {
        provider: "openai",
        model: "gpt-5.5",
        verified_at: "2026-06-13",
        benchmark_evidence_refs: ["development-records/benchmark/x.json"],
        context_window_tokens: 1_050_000,
        context_window_provenance: "OpenAI API model reference",
      },
      {
        provider: "anthropic",
        model: "claude-opus-4-8",
        verified_at: "2026-06-15",
        benchmark_evidence_refs: ["development-records/benchmark/y.json"],
        context_window_tokens: 1_000_000,
        context_window_provenance: "Anthropic model reference",
      },
      {
        // A registered model WITHOUT a window → FLOOR fallback.
        provider: "openai",
        model: "gpt-legacy",
        verified_at: "2026-01-01",
        benchmark_evidence_refs: ["development-records/benchmark/z.json"],
      },
      {
        // Tiny window so the derived raw budget falls below FLOOR → clamps up.
        provider: "grok",
        model: "grok-small",
        verified_at: "2026-01-01",
        benchmark_evidence_refs: ["development-records/benchmark/g.json"],
        context_window_tokens: 300_000,
        context_window_provenance: "fixture",
      },
      {
        // Huge window so the derived raw budget exceeds CEILING → clamps down.
        provider: "grok",
        model: "grok-huge",
        verified_at: "2026-01-01",
        benchmark_evidence_refs: ["development-records/benchmark/h.json"],
        context_window_tokens: 100_000_000,
        context_window_provenance: "fixture",
      },
    ],
  };

  // floor(window * 0.5 * 1) - 50_000, then clamp(., FLOOR, CEILING).
  it("scales the budget to the model window (within the clamp range)", () => {
    expect(
      deriveDocumentExcerptProjectionBudget(
        { provider: "anthropic", modelId: "claude-opus-4-8" },
        registry,
      ),
    ).toBe(450_000); // 1_000_000*0.5 - 50_000
    expect(
      deriveDocumentExcerptProjectionBudget(
        { provider: "openai", modelId: "gpt-5.5" },
        registry,
      ),
    ).toBe(475_000); // 1_050_000*0.5 - 50_000
    expect(deriveDocumentExcerptProjectionBudget(
      { provider: "anthropic", modelId: "claude-opus-4-8" },
      registry,
    )).toBeGreaterThan(DOCUMENT_EXCERPT_PROJECTION_FLOOR);
  });

  it("clamps a below-floor derived budget up to FLOOR", () => {
    // 300_000*0.5 - 50_000 = 100_000 < FLOOR
    expect(
      deriveDocumentExcerptProjectionBudget(
        { provider: "grok", modelId: "grok-small" },
        registry,
      ),
    ).toBe(DOCUMENT_EXCERPT_PROJECTION_FLOOR);
  });

  it("clamps an above-ceiling derived budget down to CEILING", () => {
    expect(
      deriveDocumentExcerptProjectionBudget(
        { provider: "grok", modelId: "grok-huge" },
        registry,
      ),
    ).toBe(DOCUMENT_CAPTURE_CEILING_CHARS);
  });

  it("falls back to FLOOR when provider or model is unresolved", () => {
    expect(
      deriveDocumentExcerptProjectionBudget({ modelId: "gpt-5.5" }, registry),
    ).toBe(DOCUMENT_EXCERPT_PROJECTION_FLOOR);
    expect(
      deriveDocumentExcerptProjectionBudget({ provider: "openai" }, registry),
    ).toBe(DOCUMENT_EXCERPT_PROJECTION_FLOOR);
    expect(deriveDocumentExcerptProjectionBudget({}, registry)).toBe(
      DOCUMENT_EXCERPT_PROJECTION_FLOOR,
    );
  });

  it("falls back to FLOOR for an unregistered pair", () => {
    expect(
      deriveDocumentExcerptProjectionBudget(
        { provider: "openai", modelId: "gpt-unknown" },
        registry,
      ),
    ).toBe(DOCUMENT_EXCERPT_PROJECTION_FLOOR);
    // Registered model under the wrong provider is also unregistered as a pair.
    expect(
      deriveDocumentExcerptProjectionBudget(
        { provider: "anthropic", modelId: "gpt-5.5" },
        registry,
      ),
    ).toBe(DOCUMENT_EXCERPT_PROJECTION_FLOOR);
  });

  it("falls back to FLOOR for a registered model without a window", () => {
    expect(
      deriveDocumentExcerptProjectionBudget(
        { provider: "openai", modelId: "gpt-legacy" },
        registry,
      ),
    ).toBe(DOCUMENT_EXCERPT_PROJECTION_FLOOR);
  });

  it("never returns below FLOOR or above CEILING", () => {
    const budget = deriveDocumentExcerptProjectionBudget(
      { provider: "openai", modelId: "gpt-5.5" },
      registry,
    );
    expect(budget).toBeGreaterThanOrEqual(DOCUMENT_EXCERPT_PROJECTION_FLOOR);
    expect(budget).toBeLessThanOrEqual(DOCUMENT_CAPTURE_CEILING_CHARS);
  });
});

describe("buildReconstructSourceObservation re-observation fail-soft", () => {
  it("returns null when a previously-detected ref vanished before re-observation", async () => {
    const root = await makeTmpProject();
    // detection.exists was true at detection time, but the file is gone by the
    // time re-observation runs (TOCTOU). The stat must degrade to null, not crash.
    const detection = {
      ref: path.join(root, "deleted-after-detection.ts"),
      exists: true,
      kind: "code" as const,
      confidence: 0.92,
      confidence_basis: "test fixture",
    };

    await expect(
      buildReconstructSourceObservation(detection),
    ).resolves.toBeNull();
  });
});

describe("buildReconstructSourceObservation spreadsheet seam (P2, csv)", () => {
  it("routes csv through the structure observer with no raw cell values", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "people.csv");
    // A distinctive DATA cell value: it must never appear in the observation
    // (channel governance §11 CHAN-1 — aggregate/structural only, no raw values).
    await fs.writeFile(
      target,
      "name,role\nSECRET_DATA_VALUE_XYZ,engineer\nbob,analyst\n",
      "utf8",
    );
    const detection = {
      ref: target,
      exists: true,
      kind: "spreadsheet" as const,
      confidence: 0.92,
      confidence_basis: "test fixture",
    };

    const observation = await buildReconstructSourceObservation(detection);
    expect(observation).not.toBeNull();
    expect(observation!.adapter_id).toBe(SPREADSHEET_OBSERVER_ADAPTER_ID);
    expect(observation!.target_material_kind).toBe("spreadsheet");

    const sd = observation!.structural_data as Record<string, unknown>;
    // HASH-1: content_sha256 is the RAW-byte hash, surfaced at the top level for
    // source-scout-pack admission.
    expect(sd.content_sha256).toBe(await sha256File(target));
    expect(sd.path_kind).toBe("file");
    // Generic raw-text path's content_excerpt must be absent for a workbook.
    expect(sd.content_excerpt).toBeUndefined();

    const inventory = sd.workbook_inventory as Record<string, unknown>;
    expect(inventory.workbook_kind).toBe("csv");
    expect(inventory.inspection_method).toBe("structure_inspected_only");
    expect(inventory.unsupported_reason).toBeNull();
    expect((inventory.sheets as unknown[]).length).toBe(1);

    // The data cell value must not leak anywhere in the serialized observation.
    expect(JSON.stringify(observation)).not.toContain("SECRET_DATA_VALUE_XYZ");
    // Aggregate-only vocab: distinct counts are kept, raw top_values are not.
    for (const entry of inventory.distinct_value_vocab as Array<
      Record<string, unknown>
    >) {
      expect(entry).not.toHaveProperty("top_values");
      expect(typeof entry.distinct_count).toBe("number");
    }
  });

  it("admits an unparseable xlsx as structure-only with an honest unsupported_reason (no crash)", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "report.xlsx");
    // A corrupt/non-OOXML .xlsx: the observer returns an unsupported inventory
    // (honest reason, no crash) and the seam must still admit it.
    await fs.writeFile(target, "not-a-real-xlsx", "utf8");
    const detection = {
      ref: target,
      exists: true,
      kind: "spreadsheet" as const,
      confidence: 0.92,
      confidence_basis: "test fixture",
    };

    const observation = await buildReconstructSourceObservation(detection);
    expect(observation).not.toBeNull();
    const sd = observation!.structural_data as Record<string, unknown>;
    expect(sd.content_sha256).toBe(await sha256File(target));
    const inventory = sd.workbook_inventory as Record<string, unknown>;
    expect(inventory.workbook_kind).toBe("xlsx");
    expect(inventory.unsupported_reason).toEqual(expect.stringMatching(/unzip failed|workbook\.xml/));
    expect(observation!.summary).toContain("extraction unsupported");
    expect(observation!.summary).toContain("structure_inspected_only");
  });
});
