import { describe, expect, it, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { zipSync, strToU8 } from "fflate";
import type {
  ReconstructSourceInventoryArtifact,
  ReconstructSourceInventoryUnit,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructInitialSourceFrontierArtifact,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";
import {
  buildReconstructSourceObservation,
  DEFAULT_STRUCTURAL_EXCERPT_CHAR_LIMIT,
  deriveDocumentExcerptProjectionBudget,
  DOCUMENT_CAPTURE_CEILING_CHARS,
  DOCUMENT_EXCERPT_PROJECTION_FLOOR,
  expandSourceObservationIntoRegions,
  isFullExcerptCaptureEligible,
  isSourceRegionDecompositionEligible,
  materializeReconstructPreparationArtifacts,
  spreadsheetUnsupportedReason,
  stableFrontierRefId,
} from "./materialize-preparation.js";
import type { SupportedModelRegistry } from "../discovery/supported-models.js";
import { writeTargetMaterialProfileValidationArtifact } from "./material-profile-validation.js";
import { SPREADSHEET_OBSERVER_ADAPTER_ID } from "../spreadsheet-structure-observer.js";
import { codeStructureLanguageForExtension } from "../code-structure-observer.js";

describe("isFullExcerptCaptureEligible (M3a shared whole-capture policy)", () => {
  it("whole-captures source-language code; bounds config/data code (the M3a allowlist)", () => {
    for (const ext of [".ts", ".tsx", ".js", ".py", ".go", ".rs", ".java", ".rb", ".php", ".swift", ".kt", ".sh", ".css", ".proto", ".dockerfile"]) {
      expect(isFullExcerptCaptureEligible("code", `src/feature${ext}`)).toBe(true);
    }
    // config/data extensions the classifier also maps to `code` default to bounded.
    for (const ext of [".json", ".yaml", ".yml", ".toml", ".xml", ".env", ".cfg", ".conf", ".lock"]) {
      expect(isFullExcerptCaptureEligible("code", `src/config${ext}`)).toBe(false);
    }
  });

  it("DD6′ 단일화: every structure-observer-supported extension is whole-captured (the .mts/.cts/.cjs gap class is closed BY CONSTRUCTION)", () => {
    // The v2 excerpt admission guard skips any structure-observed file whose capture stayed at the
    // bounded sample — so observer support ⊆ whole-capture must hold for every grammar, present
    // and future (the predicate consults codeStructureLanguageForExtension directly).
    for (const ext of [".mts", ".cts", ".cjs", ".mjs", ".ts", ".tsx", ".js", ".jsx", ".py"]) {
      expect(codeStructureLanguageForExtension(ext)).not.toBeNull(); // non-vacuous: these ARE observer-supported.
      expect(isFullExcerptCaptureEligible("code", `src/feature${ext}`)).toBe(true);
    }
  });

  it("whole-captures build-language basenames; bounds config basenames (codex #104)", () => {
    // extensionless build-language sources the classifier maps to `code` by basename
    for (const ref of ["Dockerfile", "ops/Makefile", "Rakefile", "Gemfile"]) {
      expect(isFullExcerptCaptureEligible("code", ref)).toBe(true);
    }
    // config/data basenames stay bounded (small files → sample == whole anyway)
    for (const ref of ["package.json", "tsconfig.json", "Cargo.toml", "go.mod", "pom.xml"]) {
      expect(isFullExcerptCaptureEligible("code", ref)).toBe(false);
    }
  });

  it("whole-captures only text-readable documents; bounds binary docs and inventory kinds", () => {
    for (const ext of [".md", ".txt", ".adoc"]) {
      expect(isFullExcerptCaptureEligible("document", `notes${ext}`)).toBe(true);
    }
    for (const ext of [".pdf", ".docx", ".rtf", ".html"]) {
      expect(isFullExcerptCaptureEligible("document", `notes${ext}`)).toBe(false);
    }
    expect(isFullExcerptCaptureEligible("spreadsheet", "book.xlsx")).toBe(false);
    expect(isFullExcerptCaptureEligible("database", "db.sql")).toBe(false);
  });

  it("is case-insensitive and fail-safe (unknown extension -> bounded)", () => {
    expect(isFullExcerptCaptureEligible("code", "src/Feature.TS")).toBe(true);
    expect(isFullExcerptCaptureEligible("code", "DOCKERFILE")).toBe(true);
    expect(isFullExcerptCaptureEligible("code", "src/x.unknownlang")).toBe(false);
    expect(isFullExcerptCaptureEligible("code", undefined)).toBe(false);
  });
});

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
        // Defect-3 D1 (generic-path guard): the initial-target materialization
        // stamps runtime-target provenance on the generic observation literal too.
        is_runtime_target_source: true,
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

  it("captures a large code file whole so seed authoring is not a leading sample (@codex P2)", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-code-whole");
    const target = path.join(root, "big.ts");
    // > DEFAULT_STRUCTURAL_EXCERPT_CHAR_LIMIT (6000): a leading-sample capture would
    // truncate this and silently author the seed from the file head, with the prompt
    // projection truncation never firing (capture < projection budget).
    const body = `// big code file\n${"export const value = 1;\n".repeat(500)}`;
    expect(body.length).toBeGreaterThan(6000);
    await fs.writeFile(target, body, "utf8");

    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [target],
      profilesRoot,
      filesystemAllowedRoots: [root],
    });
    const observations = await readYaml<ReconstructSourceObservationsArtifact>(
      refs.source_observations,
    );
    const structural = observations.observations[0]?.structural_data as
      | { content_excerpt?: string; excerpt_truncated?: boolean }
      | undefined;
    expect(structural?.content_excerpt).toBe(body);
    expect(structural?.excerpt_truncated).toBe(false);
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
    // Defect-3 D1 (spreadsheet-path guard): the user-provided target must carry the
    // runtime-target provenance marker through the SEPARATE spreadsheet sub-builder,
    // not only the generic literal — otherwise basis-A never fires for the
    // ground-truth (spreadsheet) defect path and G2/G3 keep blocking.
    expect(observation.is_runtime_target_source).toBe(true);
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
    // Stage 1.1: deduplicated formula_patterns + an honest formula_cells_total.
    expect(sd.workbook_inventory.formula_patterns).toHaveLength(1);
    expect(sd.workbook_inventory.formula_patterns[0].pattern).toContain("1+1");
    expect(sd.workbook_inventory.formula_cells_total).toBe(1);
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

  it("spreadsheetUnsupportedReason flags an unsupported workbook but not a supported one (shared frontier guard)", async () => {
    // The frontier / maturation-closure re-entry paths in run.ts reuse this guard to
    // reject an accepted-but-unobservable workbook ref, mirroring the materialize-loop
    // demotion above so the evidence gate is honest on EVERY admission path.
    const root = await makeTmpProject();
    const xls = path.join(root, "legacy.xls");
    const csv = path.join(root, "ok.csv");
    await fs.writeFile(xls, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]));
    await fs.writeFile(csv, "a,b\n1,2\n", "utf8");

    const xlsObservation = await buildReconstructSourceObservation({
      ref: xls,
      exists: true,
      kind: "spreadsheet",
      confidence: 0.92,
      confidence_basis: "test",
    });
    const csvObservation = await buildReconstructSourceObservation({
      ref: csv,
      exists: true,
      kind: "spreadsheet",
      confidence: 0.92,
      confidence_basis: "test",
    });

    expect(spreadsheetUnsupportedReason(xlsObservation!)).not.toBeNull();
    expect(spreadsheetUnsupportedReason(csvObservation!)).toBeNull();
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

describe("stableFrontierRefId (Stage 1 source-region-decomposition design 20260722 §5 A9)", () => {
  function unit(overrides: Partial<ReconstructSourceInventoryUnit> = {}): ReconstructSourceInventoryUnit {
    return {
      ref: "/repo/src/feature.ts",
      exists: true,
      target_material_kind: "code",
      inventory_unit: "file",
      profile_ref: "code-file",
      scan_status: "planned",
      skip_reason: null,
      ...overrides,
    };
  }

  it("with location absent (this PR's only state), matches the pre-A9 formula byte-for-byte", () => {
    const withoutLocation = unit();
    const preA9Digest = crypto
      .createHash("sha256")
      .update(
        `${withoutLocation.target_material_kind}\n${path.resolve(withoutLocation.ref)}\n${withoutLocation.inventory_unit}`,
      )
      .digest("hex")
      .slice(0, 16);
    expect(stableFrontierRefId(withoutLocation)).toBe(`frontier_initial_${preA9Digest}`);
  });

  it("folds location into the digest ONLY when present — two units differing only by an absent" +
    "vs. present location produce DIFFERENT ids (region-readiness)", () => {
    const wholeFile = unit();
    const region = unit({ location: "L1-50" });
    expect(stableFrontierRefId(region)).not.toBe(stableFrontierRefId(wholeFile));
  });

  it("two DIFFERENT locations on the same ref produce distinct ids", () => {
    const region1 = unit({ location: "L1-50" });
    const region2 = unit({ location: "L51-100" });
    expect(stableFrontierRefId(region1)).not.toBe(stableFrontierRefId(region2));
  });
});

describe("isSourceRegionDecompositionEligible (Stage 1 source-region-decomposition design 20260722 §3/§10 PR-1b-2)", () => {
  it("document: eligible strictly above DOCUMENT_EXCERPT_PROJECTION_FLOOR, not at or below", () => {
    expect(isSourceRegionDecompositionEligible("document", DOCUMENT_EXCERPT_PROJECTION_FLOOR)).toBe(false);
    expect(isSourceRegionDecompositionEligible("document", DOCUMENT_EXCERPT_PROJECTION_FLOOR + 1)).toBe(true);
  });

  it("code: eligible strictly above DEFAULT_STRUCTURAL_EXCERPT_CHAR_LIMIT, not at or below", () => {
    expect(isSourceRegionDecompositionEligible("code", DEFAULT_STRUCTURAL_EXCERPT_CHAR_LIMIT)).toBe(false);
    expect(isSourceRegionDecompositionEligible("code", DEFAULT_STRUCTURAL_EXCERPT_CHAR_LIMIT + 1)).toBe(true);
  });

  it("never eligible for spreadsheet/database/mixed/unknown regardless of size", () => {
    for (const kind of ["spreadsheet", "database", "mixed", "unknown"] as const) {
      expect(isSourceRegionDecompositionEligible(kind, 10_000_000)).toBe(false);
    }
  });

  it("never eligible without a numeric char_count (null/undefined)", () => {
    expect(isSourceRegionDecompositionEligible("code", null)).toBe(false);
    expect(isSourceRegionDecompositionEligible("code", undefined)).toBe(false);
    expect(isSourceRegionDecompositionEligible("document", null)).toBe(false);
  });
});

function minimalObservation(
  overrides: Partial<ReconstructSourceObservation> = {},
): ReconstructSourceObservation {
  return {
    observation_id: "obs-test",
    target_material_kind: "document",
    adapter_id: "minimal-document-structure-observer",
    source_ref: "/nonexistent/expand-region-fixture.md",
    location: "/nonexistent/expand-region-fixture.md",
    summary: "document material observed at expand-region-fixture.md",
    structural_data: {
      char_count: 0,
      content_excerpt: "",
      excerpt_truncated: false,
    },
    ...overrides,
  };
}

describe("expandSourceObservationIntoRegions (design §10 PR-1b-2 observe-time fanout)", () => {
  it("degrades to the ORIGINAL whole-file observation, unchanged, when the segmenter finds nothing to split (document, no headings, single paragraph)", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "single-paragraph.md");
    await fs.writeFile(target, "One unbroken paragraph with no blank lines and no headings at all.\n", "utf8");
    const observation = minimalObservation({ source_ref: target, location: target });

    const result = await expandSourceObservationIntoRegions(observation);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(observation); // pass-through — same reference, no clone/mutation.
  });

  it("degrades to the ORIGINAL whole-file observation when the source_ref has vanished (TOCTOU)", async () => {
    const observation = minimalObservation({
      source_ref: "/definitely/does/not/exist/vanished.md",
      location: "/definitely/does/not/exist/vanished.md",
    });
    const result = await expandSourceObservationIntoRegions(observation);
    expect(result).toEqual([observation]);
  });

  it("splits a headed document into gap-free, distinctly-located region observations, keeping content_sha256 as the WHOLE-FILE hash", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "headed.md");
    const text = [
      "# Overview",
      "Intro paragraph.",
      "",
      "## Goals",
      "Goal paragraph one.",
      "Goal paragraph two.",
      "",
      "## Milestones",
      "Milestone paragraph.",
      "",
    ].join("\n");
    await fs.writeFile(target, text, "utf8");
    const wholeFileSha = await sha256File(target);
    const lineCount = text.split(/\r?\n/).length;
    const observation = minimalObservation({
      source_ref: target,
      location: target,
      structural_data: {
        char_count: text.length,
        line_count: lineCount,
        content_sha256: wholeFileSha,
        content_excerpt: text,
        excerpt_truncated: false,
      },
    });

    const regions = await expandSourceObservationIntoRegions(observation);
    expect(regions.length).toBeGreaterThanOrEqual(2);
    const ids = regions.map((r) => r.observation_id);
    const locations = regions.map((r) => r.location);
    expect(new Set(ids).size).toBe(regions.length);
    expect(new Set(locations).size).toBe(regions.length);
    for (const region of regions) {
      // content_sha256 stays the WHOLE-FILE hash (provenance spine, design §6) — never region bytes.
      expect(region.structural_data.content_sha256).toBe(wholeFileSha);
      expect(region.structural_data.excerpt_truncated).toBe(false);
      const start = region.structural_data.region_line_start as number;
      const end = region.structural_data.region_line_end as number;
      expect(end).toBeGreaterThanOrEqual(start);
      // The stored excerpt is the EXACT slice for that region's line range (byte-perfect, not
      // truncated/resampled) — reconstructed from the same original text.
      const expectedSlice = text.split(/\r?\n/).slice(start - 1, end).join("\n") +
        (end < lineCount ? "\n" : "");
      expect((region.structural_data.content_excerpt as string).replace(/\n+$/, ""))
        .toBe(expectedSlice.replace(/\n+$/, ""));
    }
    const sorted = [...regions].sort(
      (a, b) => (a.structural_data.region_line_start as number) - (b.structural_data.region_line_start as number),
    );
    expect(sorted[0]!.structural_data.region_line_start).toBe(1);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.structural_data.region_line_start).toBe(
        (sorted[i - 1]!.structural_data.region_line_end as number) + 1,
      );
    }
    expect(sorted[sorted.length - 1]!.structural_data.region_line_end).toBe(lineCount);
  });

  it("stores the segmenter's role_signal as an additive structural_data.region_role field — 'heading' for a heading-strategy region (design §10 PR-1b-3)", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "headed3.md");
    const text = "# Overview\nIntro.\n\n## Goals\nGoal text.\n";
    await fs.writeFile(target, text, "utf8");
    const observation = minimalObservation({
      source_ref: target,
      location: target,
      structural_data: { content_excerpt: text, excerpt_truncated: false },
    });

    const regions = await expandSourceObservationIntoRegions(observation);
    expect(regions.length).toBeGreaterThanOrEqual(2);
    for (const region of regions) {
      expect(region.structural_data.region_role).toBe("heading");
    }
  });

  it("stores structural_data.region_role 'body' for the blank-line-paragraph fallback (no headings)", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "paragraphs.md");
    const text =
      "Paragraph one line one.\nParagraph one line two.\n\nParagraph two.\n\nParagraph three.\n";
    await fs.writeFile(target, text, "utf8");
    const observation = minimalObservation({
      source_ref: target,
      location: target,
      structural_data: { content_excerpt: text, excerpt_truncated: false },
    });

    const regions = await expandSourceObservationIntoRegions(observation);
    expect(regions.length).toBeGreaterThanOrEqual(2);
    for (const region of regions) {
      expect(region.structural_data.region_role).toBe("body");
    }
  });

  it("re-validates every region observation through the source-observation boundary (fail-loud, never a silent malformed emission)", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "headed2.md");
    await fs.writeFile(target, "# A\nbody a\n\n# B\nbody b\n", "utf8");
    const observation = minimalObservation({ source_ref: target, location: target });
    const regions = await expandSourceObservationIntoRegions(observation);
    expect(regions.length).toBeGreaterThanOrEqual(2);
    for (const region of regions) {
      expect(region.location.trim().length).toBeGreaterThan(0);
      expect(region.observation_id.trim().length).toBeGreaterThan(0);
    }
  });
});

function largeCodeFixtureContent(functionCount = 100): string {
  const parts: string[] = [];
  for (let i = 0; i < functionCount; i += 1) {
    parts.push(
      `export function feature${i}(value: number): number {\n` +
        `  // computed feature ${i}\n` +
        `  return value + ${i};\n` +
        `}\n`,
    );
  }
  return parts.join("\n");
}

describe("Stage 1 source-region-decomposition observe-time fanout — materializeReconstructPreparationArtifacts integration (design §10 PR-1b-2)", () => {
  it("a sub-budget file stays exactly one whole-file observation — byte-identical to the opt-in OFF (dedicated assertion)", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "small.ts");
    await fs.writeFile(target, "export function tiny(): number {\n  return 1;\n}\n", "utf8");

    // Same session basename (→ same session_id) under different parents, so the ONLY input
    // difference between the two runs is the opt-in itself.
    const off = await materializeReconstructPreparationArtifacts({
      sessionRoot: path.join(root, "off", ".onto", "reconstruct", "session-x"),
      targetRefs: [target],
      profilesRoot,
      filesystemAllowedRoots: [root],
    });
    const on = await materializeReconstructPreparationArtifacts({
      sessionRoot: path.join(root, "on", ".onto", "reconstruct", "session-x"),
      targetRefs: [target],
      profilesRoot,
      filesystemAllowedRoots: [root],
      sourceRegionDecomposition: true,
    });

    const offObservations = await readYaml<ReconstructSourceObservationsArtifact>(off.source_observations);
    const onObservations = await readYaml<ReconstructSourceObservationsArtifact>(on.source_observations);
    expect(offObservations.observations).toHaveLength(1);
    expect(onObservations.observations).toHaveLength(1);
    const stripCreatedAt = <T extends { created_at: string }>(artifact: T): T => ({
      ...artifact,
      created_at: "STRIPPED",
    });
    expect(stringifyYaml(stripCreatedAt(onObservations))).toBe(
      stringifyYaml(stripCreatedAt(offObservations)),
    );

    const offInventory = await readYaml<ReconstructSourceInventoryArtifact>(off.source_inventory);
    const onInventory = await readYaml<ReconstructSourceInventoryArtifact>(on.source_inventory);
    expect(stringifyYaml(stripCreatedAt(onInventory))).toBe(stringifyYaml(stripCreatedAt(offInventory)));
  });

  it("an over-budget code fixture (with a real code inventory) decomposes into ≥2 gap-free region observations with distinct ids, and inventory_units/initial-source-frontier reflect the expansion", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "big.ts");
    const content = largeCodeFixtureContent();
    expect(content.length).toBeGreaterThan(DEFAULT_STRUCTURAL_EXCERPT_CHAR_LIMIT); // fixture sanity
    await fs.writeFile(target, content, "utf8");
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-big");

    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [target],
      profilesRoot,
      filesystemAllowedRoots: [root],
      codeStructureObservation: true,
      sourceRegionDecomposition: true,
    });

    const observations = await readYaml<ReconstructSourceObservationsArtifact>(refs.source_observations);
    const regionObservations = observations.observations.filter((o) => o.source_ref === target);
    expect(regionObservations.length).toBeGreaterThanOrEqual(2);
    expect(new Set(regionObservations.map((o) => o.observation_id)).size).toBe(regionObservations.length);
    expect(new Set(regionObservations.map((o) => o.location)).size).toBe(regionObservations.length);

    const wholeFileSha = await sha256File(target);
    for (const observation of regionObservations) {
      // content_sha256 stays the WHOLE-FILE hash (provenance spine, design §6) on every region.
      expect(observation.structural_data.content_sha256).toBe(wholeFileSha);
      expect(typeof observation.structural_data.region_line_start).toBe("number");
      expect(typeof observation.structural_data.region_line_end).toBe("number");
      expect(observation.structural_data.excerpt_truncated).toBe(false);
      // NO false "duplicate observation_id" material: every id is unique (asserted above) and
      // non-blank.
      expect(observation.observation_id.trim().length).toBeGreaterThan(0);
    }
    // gap-free, non-overlapping [1..lineCount] coverage.
    const sorted = [...regionObservations].sort(
      (a, b) => (a.structural_data.region_line_start as number) - (b.structural_data.region_line_start as number),
    );
    expect(sorted[0]!.structural_data.region_line_start).toBe(1);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.structural_data.region_line_start).toBe(
        (sorted[i - 1]!.structural_data.region_line_end as number) + 1,
      );
    }
    const lineCount = regionObservations[0]!.structural_data.line_count as number;
    expect(sorted[sorted.length - 1]!.structural_data.region_line_end).toBe(lineCount);

    // inventory_units reflects the region expansion (design §10 "구현 아키텍처 정정"): one
    // planned unit per region, each region-distinct, so buildInitialSourceFrontier (derived from
    // inventory_units) is automatically per-region — frontier↔observation stays 1:1.
    const inventory = await readYaml<ReconstructSourceInventoryArtifact>(refs.source_inventory);
    const regionUnits = inventory.inventory_units.filter((u) => u.ref === target);
    expect(regionUnits.length).toBe(regionObservations.length);
    expect(new Set(regionUnits.map((u) => u.location)).size).toBe(regionUnits.length);
    for (const unit of regionUnits) expect(unit.scan_status).toBe("planned");

    const initialFrontier = await readYaml<ReconstructInitialSourceFrontierArtifact>(
      refs.initial_source_frontier,
    );
    const regionFrontierRefs = initialFrontier.source_refs.filter((r) => r.source_ref === target);
    expect(regionFrontierRefs.length).toBe(regionObservations.length);
    expect(new Set(regionFrontierRefs.map((r) => r.frontier_ref_id)).size).toBe(regionFrontierRefs.length);
    expect(new Set(regionFrontierRefs.map((r) => r.location)).size).toBe(regionFrontierRefs.length);
  });

  it("an over-budget code fixture with NO captured inventory (codeStructureObservation off) still fully decomposes via the blank-line-paragraph fallback (self-contained, design §10)", async () => {
    const root = await makeTmpProject();
    const target = path.join(root, "big-no-inventory.ts");
    await fs.writeFile(target, largeCodeFixtureContent(), "utf8");
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-big-no-inv");

    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [target],
      profilesRoot,
      filesystemAllowedRoots: [root],
      // codeStructureObservation intentionally OMITTED — proves the opt-in is self-contained.
      sourceRegionDecomposition: true,
    });

    const observations = await readYaml<ReconstructSourceObservationsArtifact>(refs.source_observations);
    const regionObservations = observations.observations.filter((o) => o.source_ref === target);
    expect(regionObservations.length).toBeGreaterThanOrEqual(2);
    for (const observation of regionObservations) {
      expect(observation.structural_data.code_structure_inventory).toBeUndefined();
    }
  });
});
