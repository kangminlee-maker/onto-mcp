import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import {
  buildCsvInventory,
  buildXlsxInventory,
} from "../spreadsheet-structure-observer.js";
import {
  computeSpreadsheetDisposition,
  isStructuralRiskSignal,
} from "./spreadsheet-review-disposition.js";

const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const SML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const WB_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const relType = (suffix: string) =>
  `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${suffix}`;
const sha = (bytes: Uint8Array): string =>
  crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");

function xlsxFromParts(parts: Record<string, Uint8Array>): {
  bytes: Uint8Array;
  contentSha256: string;
} {
  const bytes = zipSync(parts);
  return { bytes, contentSha256: sha(bytes) };
}

const workbookXml = (extra = "") =>
  strToU8(
    `<?xml version="1.0"?><workbook ${WB_R}><sheets>` +
      `<sheet name="S1" sheetId="1" r:id="rId1"/></sheets>${extra}</workbook>`,
  );
const workbookRels = strToU8(
  `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
    `<Relationship Id="rId1" Type="${relType("worksheet")}" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`,
);

describe("isStructuralRiskSignal", () => {
  it("counts genuine structural-risk kinds and excludes owned/observation-failure kinds", () => {
    // genuine structural risk
    expect(isStructuralRiskSignal("ragged_row")).toBe(true);
    expect(isStructuralRiskSignal("oversized_zip_entry")).toBe(true);
    expect(isStructuralRiskSignal("pivot_table_cap")).toBe(true);
    // excluded: observation-failure marker + signals owned by another goal
    expect(isStructuralRiskSignal("unreadable_sheet_part")).toBe(false);
    expect(isStructuralRiskSignal("macro_present")).toBe(false);
    expect(isStructuralRiskSignal("external_links_present")).toBe(false);
  });
});

describe("computeSpreadsheetDisposition", () => {
  it("a plain-data CSV is inspectable but backs no structural obligation", () => {
    const inv = buildCsvInventory({
      sourceRef: "/abs/data.csv",
      content: "name,role\na,b\nc,d\n",
      contentSha256: sha(strToU8("x")),
    });
    const disp = computeSpreadsheetDisposition(inv, "/abs/data.csv");
    expect(disp.inspectable).toBe(true);
    expect(disp.reason).toBeNull();
    expect(disp.backed_goals).toEqual([]);
  });

  it("a macro-only .xlsm (readable empty sheet + VBA) backs access_and_protection_hygiene only", () => {
    const { bytes, contentSha256 } = xlsxFromParts({
      "xl/workbook.xml": workbookXml(),
      "xl/_rels/workbook.xml.rels": workbookRels,
      "xl/worksheets/sheet1.xml": strToU8(
        `<?xml version="1.0"?><worksheet ${WB_R}><sheetData/></worksheet>`,
      ),
      "xl/vbaProject.bin": strToU8("fake-vba-project"),
    });
    const inv = buildXlsxInventory({
      sourceRef: "/abs/macro.xlsm",
      bytes,
      contentSha256,
      workbookKind: "xlsm",
    });
    expect(inv.macro_present).toBe(true);
    expect(inv.unsupported_reason).toBeNull();
    const disp = computeSpreadsheetDisposition(inv, "/abs/macro.xlsm");
    expect(disp.inspectable).toBe(true);
    expect(disp.backed_goals).toEqual(["access_and_protection_hygiene"]);
  });

  it("a CORRUPT macro shell backs access_and_protection_hygiene ONLY — macro_present does not double-back structural_risk_signals (must #1)", () => {
    // workbook.xml declares a sheet, but the worksheet part is ABSENT (unreadable) and a VBA
    // project is present. The observer emits unreadable_sheet_part + macro_present risk
    // signals over a zero-dimension sheet, unsupported_reason stays null.
    const { bytes, contentSha256 } = xlsxFromParts({
      "xl/workbook.xml": workbookXml(),
      "xl/_rels/workbook.xml.rels": workbookRels,
      // worksheets/sheet1.xml intentionally absent
      "xl/vbaProject.bin": strToU8("fake-vba-project"),
    });
    const inv = buildXlsxInventory({
      sourceRef: "/abs/corrupt.xlsm",
      bytes,
      contentSha256,
      workbookKind: "xlsm",
    });
    expect(inv.macro_present).toBe(true);
    expect(inv.unsupported_reason).toBeNull();
    expect(inv.risk_signals.some((r) => r.kind === "unreadable_sheet_part")).toBe(true);
    expect(inv.risk_signals.some((r) => r.kind === "macro_present")).toBe(true);

    const disp = computeSpreadsheetDisposition(inv, "/abs/corrupt.xlsm");
    expect(disp.inspectable).toBe(true);
    // The KEY assertion: only access_and_protection_hygiene — NOT structural_risk_signals,
    // even though unreadable_sheet_part + macro_present risk signals are present.
    expect(disp.backed_goals).toEqual(["access_and_protection_hygiene"]);
  });

  it("a risk-only corrupt shell (no macro, only unreadable_sheet_part) is NOT inspectable (R4 held)", () => {
    const { bytes, contentSha256 } = xlsxFromParts({
      "xl/workbook.xml": workbookXml(),
      "xl/_rels/workbook.xml.rels": workbookRels,
      // worksheet part absent AND no vbaProject -> only unreadable_sheet_part risk signal
    });
    const inv = buildXlsxInventory({
      sourceRef: "/abs/risk.xlsx",
      bytes,
      contentSha256,
      workbookKind: "xlsx",
    });
    expect(inv.macro_present).toBe(false);
    expect(inv.unsupported_reason).toBeNull();
    const disp = computeSpreadsheetDisposition(inv, "/abs/risk.xlsx");
    expect(disp.inspectable).toBe(false);
    expect(disp.backed_goals).toEqual([]);
    expect(disp.reason).toContain("/abs/risk.xlsx");
  });

  it("a workbook with formulas + named ranges + a data validation backs those goals", () => {
    const { bytes, contentSha256 } = xlsxFromParts({
      "xl/workbook.xml": workbookXml(
        `<definedNames><definedName name="R">S1!$A$1:$A$2</definedName></definedNames>`,
      ),
      "xl/_rels/workbook.xml.rels": workbookRels,
      "xl/worksheets/sheet1.xml": strToU8(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:B2"/><sheetData>` +
          `<row r="1"><c r="A1"><v>1</v></c><c r="B1"><f>A1*2</f><v>2</v></c></row>` +
          `</sheetData>` +
          `<dataValidations count="1"><dataValidation type="list" sqref="A1:A2"><formula1>"x,y"</formula1></dataValidation></dataValidations>` +
          `</worksheet>`,
      ),
    });
    const inv = buildXlsxInventory({
      sourceRef: "/abs/model.xlsx",
      bytes,
      contentSha256,
      workbookKind: "xlsx",
    });
    const disp = computeSpreadsheetDisposition(inv, "/abs/model.xlsx");
    expect(disp.inspectable).toBe(true);
    expect(disp.backed_goals).toEqual(
      expect.arrayContaining([
        "formula_integrity",
        "named_range_hygiene",
        "data_validation_coverage",
      ]),
    );
  });

  it("a formula-only workbook (formulas, otherwise minimal) still backs formula_integrity and is inspectable (Stage 1.1 migration)", () => {
    // After the formula_cells → formula_patterns + formula_cells_total migration, a workbook
    // whose only structural evidence is formulas must still back formula_integrity and be
    // inspectable/renderable (formula_cells_total > 0; formula_patterns is non-empty).
    const { bytes, contentSha256 } = xlsxFromParts({
      "xl/workbook.xml": workbookXml(),
      "xl/_rels/workbook.xml.rels": workbookRels,
      "xl/worksheets/sheet1.xml": strToU8(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A2"/><sheetData>` +
          // a 2-cell fill-down → one pattern, occurrence_count 2, formula_cells_total 2
          `<row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A2">B1*2</f><v>2</v></c></row>` +
          `<row r="2"><c r="A2"><f t="shared" si="0"/><v>4</v></c></row>` +
          `</sheetData></worksheet>`,
      ),
    });
    const inv = buildXlsxInventory({
      sourceRef: "/abs/formulas.xlsx",
      bytes,
      contentSha256,
      workbookKind: "xlsx",
    });
    expect(inv.formula_patterns).toHaveLength(1);
    expect(inv.formula_cells_total).toBe(2);
    const disp = computeSpreadsheetDisposition(inv, "/abs/formulas.xlsx");
    expect(disp.inspectable).toBe(true);
    expect(disp.reason).toBeNull();
    expect(disp.backed_goals).toContain("formula_integrity");
  });

  it("an unobserved ref (undefined inventory) is not inspectable and names the ref", () => {
    const disp = computeSpreadsheetDisposition(undefined, "/abs/dir");
    expect(disp.inspectable).toBe(false);
    expect(disp.backed_goals).toEqual([]);
    expect(disp.reason).toContain("/abs/dir");
    expect(disp.sha256).toBeNull();
  });
});
