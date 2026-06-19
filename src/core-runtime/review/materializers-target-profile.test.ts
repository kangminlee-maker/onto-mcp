import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { zipSync, strToU8 } from "fflate";
import type { ReviewTargetProfileArtifact } from "./artifact-types.js";
import { materializeReviewExecutionPreparationArtifacts } from "./materializers.js";

const tmpRoots: string[] = [];

const SPREADSHEET_MATERIAL_GOALS = [
  "formula_integrity",
  "cross_sheet_reference_integrity",
  "named_range_hygiene",
  "data_validation_coverage",
  "access_and_protection_hygiene",
  "structural_risk_signals",
];

const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const SML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const WB_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const relType = (suffix: string) =>
  `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${suffix}`;

/** Two-sheet .xlsx exercising the obligation-backing surfaces: a cross-sheet formula,
 *  a defined name, a data validation, an error cell, a hidden sheet, sheet protection,
 *  a VBA macro project, and a sentinel raw cell value (ZZSENTINELZZ) that must NEVER
 *  leak into the prompt. Enough to prove the review render carries DETAIL (not counts)
 *  AND keeps raw cell values out. */
function makeReviewXlsx(): Uint8Array {
  return zipSync({
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook ${WB_R}><sheets>` +
        `<sheet name="People" sheetId="1" r:id="rId1"/>` +
        `<sheet name="Depts" sheetId="2" state="hidden" r:id="rId2"/>` +
        `</sheets><definedNames>` +
        `<definedName name="HeadcountRange">People!$A$1:$C$3</definedName>` +
        `</definedNames></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
        `<Relationship Id="rId1" Type="${relType("worksheet")}" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${relType("worksheet")}" Target="worksheets/sheet2.xml"/>` +
        `<Relationship Id="rId3" Type="${relType("sharedStrings")}" Target="sharedStrings.xml"/>` +
        `</Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `<?xml version="1.0"?><sst xmlns="${SML_NS}">` +
        `<si><t>name</t></si><si><t>role</t></si><si><t>dept</t></si>` +
        `<si><t>ZZSENTINELZZ</t></si></sst>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:D3"/><sheetProtection sheet="1"/><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>3</v></c><c r="D2"><f>Depts!A1*2</f><v>10</v></c></row>` +
        `<row r="3"><c r="D3" t="e"><v>#DIV/0!</v></c></row>` +
        `</sheetData>` +
        `<dataValidations count="1"><dataValidation type="list" sqref="B2:B3"><formula1>"eng,sales"</formula1></dataValidation></dataValidations>` +
        `</worksheet>`,
    ),
    "xl/worksheets/sheet2.xml": strToU8(
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A1"/><sheetData>` +
        `<row r="1"><c r="A1"><v>5</v></c></row></sheetData></worksheet>`,
    ),
    "xl/vbaProject.bin": strToU8("fake-vba-project"),
  });
}

/** A parseable-but-empty .xlsx: one sheet, NO <dimension> tag and an empty <sheetData/>,
 *  so the observer reads it cleanly (unsupported_reason stays null) yet finds no inspected
 *  structure at all (dimensions 0×0, every structural array empty). */
function makeEmptyXlsx(): Uint8Array {
  return zipSync({
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook ${WB_R}><sheets>` +
        `<sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
        `<Relationship Id="rId1" Type="${relType("worksheet")}" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0"?><worksheet ${WB_R}><sheetData/></worksheet>`,
    ),
  });
}

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-review-profile-"));
  tmpRoots.push(root);
  return root;
}

async function readProfile(sessionRoot: string): Promise<ReviewTargetProfileArtifact> {
  const profilePath = path.join(
    sessionRoot,
    "execution-preparation",
    "review-target-profile.yaml",
  );
  return parseYaml(await fs.readFile(profilePath, "utf8")) as ReviewTargetProfileArtifact;
}

async function readMaterializedInput(sessionRoot: string): Promise<string> {
  return fs.readFile(
    path.join(sessionRoot, "execution-preparation", "materialized-input.md"),
    "utf8",
  );
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("review target profile material kind", () => {
  it("requires an explicit session domain instead of defaulting to none", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-domain");
    const target = path.join(root, "target.md");
    await fs.writeFile(target, "# Target\n", "utf8");

    await expect(
      materializeReviewExecutionPreparationArtifacts({
        sessionRoot,
        scopeKind: "file",
        resolvedTargetRefs: [target],
        materializedKind: "single_text",
        requestedTarget: target,
        reviewIntentSummary: "review target",
        sessionDomain: "",
        filesystemAllowedRoots: [root],
      }),
    ).rejects.toThrow("requires explicit sessionDomain");
  });

  it("records spreadsheet material kind and detection evidence", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-a");
    const target = path.join(root, "revenue.csv");
    await fs.writeFile(target, "month,revenue\nJan,100\n", "utf8");

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "file",
      resolvedTargetRefs: [target],
      materializedKind: "single_text",
      requestedTarget: target,
      reviewIntentSummary: "review accounting sheet",
      sessionDomain: "accounting",
      filesystemAllowedRoots: [root],
    });

    const profile = await readProfile(sessionRoot);
    expect(profile.target_material_kind).toBe("spreadsheet");
    expect(profile.material_profile.target_material_kind).toBe("spreadsheet");
    expect(profile.material_profile.target_material_kind_candidates).toEqual([
      "spreadsheet",
    ]);
    // C-review: an inspectable spreadsheet format (.csv) is supported; the
    // structure-only honesty is carried by the render header + contract (so
    // unsupported_reason stays null), and the kind-derived review obligations attach.
    expect(profile.material_profile.support_status).toBe("supported");
    expect(profile.material_profile.unsupported_reason).toBeNull();
    expect(profile.target_refs[0].inspectable).toBe(true);
    expect(profile.review_goal).toEqual(
      expect.arrayContaining(SPREADSHEET_MATERIAL_GOALS),
    );
    expect(profile.material_profile.detection.confidence).toBeGreaterThan(0.8);
  });

  it("renders bounded spreadsheet DETAIL (formula text / named ranges / validations) into materialized-input (F1)", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-xlsx");
    const target = path.join(root, "model.xlsx");
    await fs.writeFile(target, Buffer.from(makeReviewXlsx()));

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "file",
      resolvedTargetRefs: [target],
      materializedKind: "single_text",
      requestedTarget: target,
      reviewIntentSummary: "review workbook model",
      sessionDomain: "accounting",
      filesystemAllowedRoots: [root],
    });

    const materialized = await readMaterializedInput(sessionRoot);
    // formula TEXT + cross-sheet ref (not just a count) — the F1 obligation backing:
    expect(materialized).toContain("Depts!A1*2");
    expect(materialized).toContain("cross-sheet");
    // named-range refers_to detail (named_range_hygiene):
    expect(materialized).toContain("HeadcountRange");
    expect(materialized).toContain("People!$A$1:$C$3");
    // data_validation range detail (data_validation_coverage):
    expect(materialized).toContain("B2:B3");
    // error-cell token detail (structural_risk_signals backing):
    expect(materialized).toContain("#DIV/0!");
    // access_and_protection_hygiene backing: hidden sheet, protected sheet, macro:
    expect(materialized).toContain("(hidden)");
    expect(materialized).toContain("(protected)");
    expect(materialized).toContain("macro_present");
    // structure-only honesty header preserved:
    expect(materialized).toContain("structure inspected only");
    // honesty invariant: a raw cell value must NEVER leak into the prompt (TA-4):
    expect(materialized).not.toContain("ZZSENTINELZZ");

    const profile = await readProfile(sessionRoot);
    expect(profile.material_profile.support_status).toBe("supported");
    expect(profile.target_refs[0].inspectable).toBe(true);
  });

  it("downgrades an unsupported workbook FORMAT (.xls) to partial and marks the ref not inspectable (H1/H4/F2)", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-xls");
    const target = path.join(root, "legacy.xls");
    // BIFF-ish magic bytes; the observer defers .xls extraction -> unsupported_reason.
    await fs.writeFile(target, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "file",
      resolvedTargetRefs: [target],
      materializedKind: "single_text",
      requestedTarget: target,
      reviewIntentSummary: "review legacy workbook",
      sessionDomain: "accounting",
      filesystemAllowedRoots: [root],
    });

    const profile = await readProfile(sessionRoot);
    expect(profile.target_material_kind).toBe("spreadsheet");
    // Not supported: the format was not inspected, so no false "we read it".
    expect(profile.material_profile.support_status).toBe("partial");
    // The reason carries the ref's ACTUAL observer cause, not an extension label.
    expect(profile.material_profile.unsupported_reason).toContain("xls extraction not yet implemented");
    expect(profile.target_refs[0].inspectable).toBe(false);
    // No inventory-backed obligations when nothing was inspected (NONE of the 6).
    for (const goal of SPREADSHEET_MATERIAL_GOALS) {
      expect(profile.review_goal).not.toContain(goal);
    }
    // The render honestly says unsupported — profile and render agree.
    const materialized = await readMaterializedInput(sessionRoot);
    expect(materialized).toContain("unsupported:");
  });

  it("emits partial with per-ref inspectability for a mixed-format spreadsheet bundle (.csv + .xls)", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-mixedfmt");
    const csv = path.join(root, "q1.csv");
    const xls = path.join(root, "legacy.xls");
    await fs.writeFile(csv, "month,revenue\nJan,100\n", "utf8");
    await fs.writeFile(xls, Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "bundle",
      resolvedTargetRefs: [csv, xls],
      materializedKind: "bundle_member_texts",
      requestedTarget: "workbook bundle",
      reviewIntentSummary: "review both workbooks",
      sessionDomain: "accounting",
      bundleKind: "mixed-evidence",
      filesystemAllowedRoots: [root],
    });

    const profile = await readProfile(sessionRoot);
    // Both refs are spreadsheet kind, but one FORMAT is not inspectable -> partial.
    expect(profile.target_material_kind).toBe("spreadsheet");
    expect(profile.material_profile.support_status).toBe("partial");
    // At least one ref inspectable -> obligations still attach (backed by the .csv).
    expect(profile.review_goal).toContain("formula_integrity");
    const inspectableByName = Object.fromEntries(
      profile.target_refs.map((ref) => [path.basename(ref.ref), ref.inspectable]),
    );
    expect(inspectableByName["q1.csv"]).toBe(true);
    expect(inspectableByName["legacy.xls"]).toBe(false);
  });

  it("downgrades to partial when a MATERIALIZED-only spreadsheet ref is uninspectable, even if resolved targets are clean (WC-1)", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-divergent");
    const csv = path.join(root, "resolved.csv");
    const xls = path.join(root, "materialized.xls");
    await fs.writeFile(csv, "month,revenue\nJan,100\n", "utf8");
    await fs.writeFile(xls, Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "file",
      resolvedTargetRefs: [csv],
      materializedRefs: [xls],
      materializedKind: "single_text",
      requestedTarget: csv,
      reviewIntentSummary: "divergent resolved/materialized sets",
      sessionDomain: "accounting",
      filesystemAllowedRoots: [root],
    });

    const profile = await readProfile(sessionRoot);
    // The gate scope follows the RENDER scope (materializedRefs): the uninspectable .xls
    // that gets rendered into materialized-input downgrades the claim — no false supported.
    expect(profile.material_profile.support_status).toBe("partial");
    const materialized = await readMaterializedInput(sessionRoot);
    expect(materialized).toContain("unsupported:");
  });

  it("treats an empty-but-supported-format workbook (empty .csv) as partial with its ACTUAL reason, not a false 'unsupported format' (CER-1)", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-emptycsv");
    const csv = path.join(root, "empty.csv");
    await fs.writeFile(csv, "", "utf8");

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "file",
      resolvedTargetRefs: [csv],
      materializedKind: "single_text",
      requestedTarget: csv,
      reviewIntentSummary: "review empty csv",
      sessionDomain: "accounting",
      filesystemAllowedRoots: [root],
    });

    const profile = await readProfile(sessionRoot);
    expect(profile.material_profile.support_status).toBe("partial");
    // Reason reflects emptiness, NOT a bogus "unsupported format (.csv)".
    expect(profile.material_profile.unsupported_reason).toContain("empty csv");
    expect(profile.material_profile.unsupported_reason).not.toContain("unsupported");
    expect(profile.target_refs[0].inspectable).toBe(false);
    // Profile and render agree (render shows the observer's unsupported_reason).
    const materialized = await readMaterializedInput(sessionRoot);
    expect(materialized).toContain("unsupported: empty csv");
  });

  it("downgrades an empty-but-parseable .xlsx (no inspected structure) to partial and marks the ref not inspectable (empty OOXML)", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-emptyxlsx");
    const xlsx = path.join(root, "blank.xlsx");
    await fs.writeFile(xlsx, Buffer.from(makeEmptyXlsx()));

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "file",
      resolvedTargetRefs: [xlsx],
      materializedKind: "single_text",
      requestedTarget: xlsx,
      reviewIntentSummary: "review empty xlsx",
      sessionDomain: "accounting",
      filesystemAllowedRoots: [root],
    });

    const profile = await readProfile(sessionRoot);
    expect(profile.target_material_kind).toBe("spreadsheet");
    // It PARSED (unsupported_reason is null), but it has NO inspected structure — the
    // honesty gate must not emit supported/null for a workbook the render shows as empty.
    expect(profile.material_profile.support_status).toBe("partial");
    expect(profile.target_refs[0].inspectable).toBe(false);
    // No ref inspectable -> the spreadsheet obligations drop (no rendered backing).
    expect(profile.review_goal).not.toEqual(
      expect.arrayContaining(SPREADSHEET_MATERIAL_GOALS),
    );
  });

  it("degrades a directory of spreadsheets (kind=spreadsheet but no directly-inspectable workbook ref) to partial", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-ssdir");
    const dir = path.join(root, "quarters");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "q1.csv"), "month,revenue\nJan,100\n", "utf8");
    await fs.writeFile(path.join(dir, "q2.csv"), "month,revenue\nFeb,120\n", "utf8");

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "directory",
      resolvedTargetRefs: [dir],
      materializedKind: "directory_listing",
      requestedTarget: dir,
      reviewIntentSummary: "review a directory of spreadsheets",
      sessionDomain: "accounting",
      filesystemAllowedRoots: [root],
    });

    const profile = await readProfile(sessionRoot);
    // The sampled children are all spreadsheets, so the kind aggregates to spreadsheet...
    expect(profile.target_material_kind).toBe("spreadsheet");
    // ...but the directory path itself is not a workbook ref (gateRefs is empty; the
    // render emits only a listing), so a bare `supported` would be dishonest.
    expect(profile.material_profile.support_status).toBe("partial");
    expect(profile.review_goal).not.toEqual(
      expect.arrayContaining(SPREADSHEET_MATERIAL_GOALS),
    );
  });

  it("discloses a bounded structural sample in materialized-input when the projection trims (TA-3)", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-wide");
    const csv = path.join(root, "wide.csv");
    const header = Array.from({ length: 70 }, (_, i) => `c${i + 1}`).join(",");
    const row = Array.from({ length: 70 }, (_, i) => `v${i + 1}`).join(",");
    await fs.writeFile(csv, `${header}\n${row}\n`, "utf8");

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "file",
      resolvedTargetRefs: [csv],
      materializedKind: "single_text",
      requestedTarget: csv,
      reviewIntentSummary: "review wide csv",
      sessionDomain: "accounting",
      filesystemAllowedRoots: [root],
    });

    const materialized = await readMaterializedInput(sessionRoot);
    // 70 columns > max_columns_per_sheet (64) -> projection trims columns; the honesty
    // note discloses the bounded sample rather than silently swallowing it.
    expect(materialized).toContain("structural sample bounded");
    expect(materialized).toContain("64/70");
  });

  it("records mixed material kind for explicit bundles", async () => {
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "review", "session-b");
    const code = path.join(root, "src", "handler.ts");
    const doc = path.join(root, "docs", "policy.md");
    await fs.mkdir(path.dirname(code), { recursive: true });
    await fs.mkdir(path.dirname(doc), { recursive: true });
    await fs.writeFile(code, "export const ok = true;\n", "utf8");
    await fs.writeFile(doc, "# Policy\n", "utf8");

    await materializeReviewExecutionPreparationArtifacts({
      sessionRoot,
      scopeKind: "bundle",
      resolvedTargetRefs: [code, doc],
      materializedKind: "bundle_member_texts",
      requestedTarget: "implementation bundle",
      reviewIntentSummary: "review code and policy together",
      sessionDomain: "none",
      bundleKind: "mixed-evidence",
      filesystemAllowedRoots: [root],
    });

    const profile = await readProfile(sessionRoot);
    expect(profile.target_material_kind).toBe("mixed");
    expect(profile.material_profile.target_material_kind_candidates.sort()).toEqual([
      "code",
      "document",
    ]);
    expect(profile.material_profile.support_status).toBe("partial_composite");
  });
});
