import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  buildCsvInventory,
  buildXlsxInventory,
  columnResidualKey,
  compareColumnResidualDesc,
  DEFAULT_DATA_LAYER_CAPS,
  DEFAULT_WORKBOOK_INVENTORY_PROMPT_CAPS,
  observeSpreadsheetSource,
  parseCsv,
  projectInventoryForAdmission,
  projectInventoryForPrompt,
  projectSegmentedValueTiles,
  SPREADSHEET_OBSERVER_ADAPTER_ID,
  SPREADSHEET_OBSERVER_ADAPTER_VERSION,
  VALIDATION_MEMBER_CHAR_CAP,
  VALIDATION_MEMBER_COUNT_CAP,
  type DataLayerCaps,
  type InventoryColumn,
  type SheetValueTileProjection,
  type WorkbookStructuralInventory,
} from "./spreadsheet-structure-observer.js";
import {
  buildDeterministicComprehensionArtifact,
  validateComprehensionArtifact,
} from "./reconstruct/comprehension-artifact.js";

const shaBytes = (b: Uint8Array) =>
  crypto.createHash("sha256").update(Buffer.from(b)).digest("hex");

const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const SML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const WB_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const relType = (suffix: string) =>
  `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${suffix}`;

/** Assemble a deterministic two-sheet .xlsx (People + hidden Depts) exercising
 *  shared/inline strings, a formula with a cross-sheet ref, an error cell, a
 *  merged range, a data validation, sheet protection, a defined name, an
 *  external link, and a table. */
function makeWorkbookXlsx(): Uint8Array {
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
        `<Relationship Id="rId4" Type="${relType("externalLink")}" Target="externalLinks/externalLink1.xml"/>` +
        `</Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `<?xml version="1.0"?><sst xmlns="${SML_NS}">` +
        `<si><t>name</t></si><si><t>role</t></si><si><t>dept</t></si>` +
        `<si><t>Alice</t></si><si><t>eng</t></si><si><t>Bob</t></si></sst>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:D3"/><sheetProtection sheet="1"/><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>score</t></is></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>4</v></c><c r="D2"><f>Depts!A1*2</f><v>10</v></c></row>` +
        `<row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3" t="s"><v>4</v></c><c r="C3" t="s"><v>4</v></c><c r="D3" t="e"><v>#DIV/0!</v></c></row>` +
        `</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>` +
        `<dataValidations count="1"><dataValidation type="list" sqref="B2:B3"><formula1>"eng,sales"</formula1></dataValidation></dataValidations>` +
        `</worksheet>`,
    ),
    "xl/worksheets/sheet2.xml": strToU8(
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A1"/><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>4</v></c></row></sheetData></worksheet>`,
    ),
    "xl/worksheets/_rels/sheet1.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
        `<Relationship Id="rId1" Type="${relType("table")}" Target="../tables/table1.xml"/></Relationships>`,
    ),
    "xl/tables/table1.xml": strToU8(
      `<?xml version="1.0"?><table xmlns="${SML_NS}" name="PeopleTable" ref="A1:D3"/>`,
    ),
  });
}

/** Minimal single-sheet workbook (no extras) for targeted cases. */
function makeMinimalXlsxParts(sheetXml: string): Record<string, Uint8Array> {
  return {
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook ${WB_R}><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
        `<Relationship Id="rId1" Type="${relType("worksheet")}" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  };
}

const sha = (s: string) => crypto.createHash("sha256").update(Buffer.from(s)).digest("hex");

function inv(content: string, ref = "/abs/data.csv", caps?: DataLayerCaps) {
  return buildCsvInventory({ sourceRef: ref, content, contentSha256: sha(content), caps });
}

describe("buildCsvInventory — structure (P1)", () => {
  const csv = "name,age,city\nAlice,30,Seoul\nBob,25,Busan\nCarol,30,Seoul\n";

  it("detects a tabular header and per-sheet layout (SCHEMA-1)", () => {
    const r = inv(csv);
    expect(r.adapter_id).toBe(SPREADSHEET_OBSERVER_ADAPTER_ID);
    expect(r.workbook_kind).toBe("csv");
    expect(r.inspection_method).toBe("structure_inspected_only");
    expect(r.per_sheet_data).toHaveLength(1);
    const sheet = r.per_sheet_data[0];
    expect(sheet.layout_kind).toBe("tabular");
    expect(sheet.header_rows).toEqual([0]);
    expect(sheet.columns.map((c) => c.name)).toEqual(["name", "age", "city"]);
    expect(r.sheets[0].dimensions).toEqual({ rows: 4, cols: 3 });
  });

  it("infers column types", () => {
    const r = inv(csv);
    const byName = Object.fromEntries(r.per_sheet_data[0].columns.map((c) => [c.name, c.inferred_type]));
    expect(byName.name).toBe("string");
    expect(byName.age).toBe("integer");
    expect(byName.city).toBe("string");
  });

  it("emits aggregate distinct_count for categorical columns but NO raw values", () => {
    const r = inv(csv);
    const city = r.distinct_value_vocab.find((v) => v.column === "city");
    expect(city).toBeDefined();
    expect(city!.distinct_count).toBe(2); // Seoul, Busan
    expect(city!.distinct_count_is_estimate).toBe(false);
    // raw values are never emitted by the extractor.
    for (const v of r.distinct_value_vocab) expect(v.top_values).toBeUndefined();
    // High-cardinality unique column (name) is not a controlled-vocab candidate.
    expect(r.distinct_value_vocab.find((v) => v.column === "name")).toBeUndefined();
  });

  it("treats an all-numeric first row as data, not a header (matrix_no_header)", () => {
    const r = inv("1,2,3\n4,5,6\n");
    expect(r.per_sheet_data[0].layout_kind).toBe("matrix_no_header");
    expect(r.per_sheet_data[0].header_rows).toBeNull();
    expect(r.per_sheet_data[0].columns).toEqual([]); // columns asserted only for tabular
  });
});

describe("buildCsvInventory — determinism & provenance", () => {
  const csv = "k,v\na,1\nb,2\n";

  it("is deterministic: identical input → deep-equal inventory", () => {
    expect(inv(csv)).toEqual(inv(csv));
  });

  it("content_sha256 is the RAW-byte hash, independent of parsing (HASH-1)", () => {
    const r = inv(csv);
    expect(r.content_sha256).toBe(sha(csv));
  });
});

describe("buildCsvInventory — caps (CAPS-1) and risk signals", () => {
  it("flags distinct-count estimate + capture_truncated when the distinct cap is hit", () => {
    const rows = ["c"];
    for (let i = 0; i < 10; i += 1) rows.push(`v${i}`);
    const caps: DataLayerCaps = {
      max_rows_scanned_per_sheet: 1000,
      max_distinct_tracked_per_column: 3,
      max_columns_profiled: 512,
      max_sheet_pairs: 64,
      max_sheets_observed: 2048,
    };
    const r = inv(`${rows.join("\n")}\n`, "/abs/c.csv", caps);
    const entry = r.distinct_value_vocab.find((v) => v.column === "c");
    expect(entry?.distinct_count_is_estimate).toBe(true);
    expect(entry?.distinct_count).toBe(3);
    expect(r.capture_truncated).toBe(true);
  });

  it("records ragged rows literally without diagnosis", () => {
    const r = inv("a,b,c\n1,2,3\n4,5\n");
    const ragged = r.risk_signals.find((s) => s.kind === "ragged_row");
    expect(ragged).toBeDefined();
    expect(ragged!.literal).toBe("2 cols vs 3");
  });
});

describe("buildCsvInventory — parsing edge cases", () => {
  it("parses quoted fields with embedded delimiters and newlines", () => {
    const { rows } = parseCsv('a,"b,c","d\ne"\n1,2,3\n', ",", 100);
    expect(rows).toEqual([
      ["a", "b,c", "d\ne"],
      ["1", "2", "3"],
    ]);
  });

  it("detects a tab delimiter → workbook_kind tsv", () => {
    const r = inv("name\tage\nAlice\t30\n", "/abs/data.tsv");
    expect(r.workbook_kind).toBe("tsv");
    expect(r.per_sheet_data[0].columns.map((c) => c.name)).toEqual(["name", "age"]);
  });

  it("returns unsupported_reason for an empty csv", () => {
    const r = inv("");
    expect(r.unsupported_reason).toBe("empty csv (no rows)");
    expect(r.per_sheet_data[0].layout_kind).toBe("unknown");
  });
});

describe("observeSpreadsheetSource — IO + dispatch", () => {
  const tmp = path.join(os.tmpdir(), `onto-s1-test-${process.pid}`);

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("reads a csv file and builds an inventory with a raw-byte content_sha256", async () => {
    await fs.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "people.csv");
    const content = "name,role\nAlice,eng\nBob,eng\n";
    await fs.writeFile(file, content);
    const r = await observeSpreadsheetSource(file);
    expect(r.workbook_kind).toBe("csv");
    expect(r.content_sha256).toBe(sha(content));
    expect(r.per_sheet_data[0].columns.map((c) => c.name)).toEqual(["name", "role"]);
    expect(r.unsupported_reason).toBeNull();
  });

  it("reads a real .xlsx file end to end (P4)", async () => {
    await fs.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "book.xlsx");
    const bytes = makeWorkbookXlsx();
    await fs.writeFile(file, bytes);
    const r = await observeSpreadsheetSource(file);
    expect(r.workbook_kind).toBe("xlsx");
    expect(r.unsupported_reason).toBeNull();
    expect(r.content_sha256).toBe(shaBytes(bytes)); // raw-byte hash
    expect(r.sheets.map((s) => s.name)).toEqual(["People", "Depts"]);
  });

  it("degrades a corrupt/non-zip .xlsx to an unsupported inventory WITHOUT throwing (B1 crash isolation)", async () => {
    await fs.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "broken.xlsx");
    // Passes the extension + size gate but is not a valid zip, so extraction fails. The
    // observer must return the standard unsupported-inventory shape (which review's
    // disposition and reconstruct's P6 gate both already accept), never throw out and abort.
    await fs.writeFile(file, Buffer.from("this is plain text, not an OOXML zip archive"));
    const r = await observeSpreadsheetSource(file);
    expect(r.unsupported_reason).not.toBeNull();
    expect(r.sheets).toEqual([]);
    expect(r.content_sha256).not.toBe(""); // bytes WERE read; hash preserved
  });

  it("defers xls/ods with an explicit unsupported_reason (not a crash)", async () => {
    await fs.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "legacy.ods");
    await fs.writeFile(file, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const r = await observeSpreadsheetSource(file);
    expect(r.workbook_kind).toBe("ods");
    expect(r.unsupported_reason).toMatch(/deferred/);
    expect(r.content_sha256).toHaveLength(64);
  });

  it("reports unreadable sources without throwing", async () => {
    const r = await observeSpreadsheetSource(path.join(tmp, "does-not-exist.csv"));
    expect(r.unsupported_reason).toMatch(/source unreadable/);
  });
});

describe("projectInventoryForAdmission — aggregate-only projection", () => {
  it("strips raw top_values while preserving aggregate distinct counts", () => {
    const inventory = inv("name,role\nAlice,eng\nBob,eng\n");
    // The observer itself never emits top_values; this simulates a future field
    // carrying one and asserts the single shared projection excludes it for every
    // consumer.
    inventory.distinct_value_vocab[0].top_values = [
      { value: "Alice", count: 1 },
      { value: "Bob", count: 1 },
    ];
    const before = inventory.distinct_value_vocab[0];
    const projected = projectInventoryForAdmission(inventory);
    const entry = projected.distinct_value_vocab[0];

    expect(entry.top_values).toBeUndefined();
    expect(entry.distinct_count).toBe(before.distinct_count);
    expect(entry.distinct_count_is_estimate).toBe(before.distinct_count_is_estimate);
    // No raw value leaks anywhere in the projected inventory.
    expect(JSON.stringify(projected)).not.toContain("Alice");
    // The source inventory is not mutated (projection returns a copy).
    expect(inventory.distinct_value_vocab[0].top_values).toBeDefined();
  });
});

describe("buildXlsxInventory — structure + data (P4)", () => {
  it("extracts sheets, schema, formulas, structure and aggregate data from a workbook", () => {
    const bytes = makeWorkbookXlsx();
    const r = buildXlsxInventory({
      sourceRef: "/abs/book.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
    });

    expect(r.unsupported_reason).toBeNull();
    expect(r.workbook_kind).toBe("xlsx");
    expect(r.inspection_method).toBe("structure_inspected_only");
    expect(r.content_sha256).toBe(shaBytes(bytes)); // raw-byte hash (HASH-1)

    // sheets: order, hidden, protected
    expect(r.sheets.map((s) => s.name)).toEqual(["People", "Depts"]);
    expect(r.sheets.find((s) => s.name === "Depts")!.hidden).toBe(true);
    expect(r.sheets.find((s) => s.name === "People")!.protected).toBe(true);
    expect(r.sheets.find((s) => s.name === "People")!.dimensions).toEqual({ rows: 3, cols: 4 });

    // per-sheet data: header detection + column names (shared + inline strings resolved)
    const people = r.per_sheet_data.find((d) => d.sheet === "People")!;
    expect(people.layout_kind).toBe("tabular");
    expect(people.header_rows).toEqual([0]);
    expect(people.columns.map((c) => c.name)).toEqual(["name", "role", "dept", "score"]);

    // aggregate vocab for the categorical "role"/"dept" columns (counts only)
    expect(r.distinct_value_vocab.some((v) => v.sheet === "People" && v.column === "role")).toBe(true);

    // formula patterns + cross-sheet refs (Stage 1.1: deduped, with an honest cell total)
    expect(r.formula_patterns).toHaveLength(1);
    expect(r.formula_patterns[0]!.sample_cell).toBe("D2");
    expect(r.formula_patterns[0]!.occurrence_count).toBe(1);
    expect(r.formula_cells_total).toBe(1);
    expect(r.formula_patterns[0]!.cross_sheet_refs).toContain("Depts");

    // error cells, merged ranges, data validations, named ranges, external links, tables
    expect(r.error_cells.map((e) => e.token)).toContain("#DIV/0!");
    expect(r.merged_ranges.map((m) => m.range)).toContain("A1:B1");
    expect(r.data_validations[0]!.range).toBe("B2:B3");
    expect(r.data_validations[0]!.rule_summary).toContain("type=list");
    // design-C (Codex #2): a type=list INLINE formula1 is summarized by member COUNT here — the
    // declared values live in the bounded `members` field, never echoed in rule_summary (a second,
    // differently-bounded value channel). The reviewer audits coverage via `members` + this count.
    expect(r.data_validations[0]!.rule_summary).toContain("formula1=list(2 members)");
    expect(r.data_validations[0]!.rule_summary).not.toContain("eng,sales");
    // design-C: structured validation_type, inline enum members, normalized columns.
    expect(r.data_validations[0]!.validation_type).toBe("list");
    expect(r.data_validations[0]!.members).toEqual(["eng", "sales"]);
    expect(r.data_validations[0]!.members_truncated).toBe(false);
    expect(r.data_validations[0]!.applies_to_columns).toEqual([1]); // column B (role)
    expect(r.named_ranges.map((n) => n.name)).toContain("HeadcountRange");
    expect(r.external_links).toHaveLength(1);
    const table = r.tables.find((t) => t.name === "PeopleTable")!;
    expect(table.sheet).toBe("People");
    expect(table.range).toBe("A1:D3");

    // raw DATA cell values never appear — only schema (header names), aggregate
    // counts, and structural tokens (formula/error).
    expect(JSON.stringify(r)).not.toContain("Alice");
    expect(JSON.stringify(r)).not.toContain("Bob");
  });

  it("captures operator and both bounds (formula1/formula2) for a range data validation (#5)", () => {
    const sheet =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A1"/><sheetData>` +
      `<row r="1"><c r="A1"><v>5</v></c></row></sheetData>` +
      `<dataValidations count="1"><dataValidation type="whole" operator="between" sqref="A1:A9">` +
      `<formula1>1</formula1><formula2>10</formula2></dataValidation></dataValidations>` +
      `</worksheet>`;
    const bytes = zipSync(makeMinimalXlsxParts(sheet));
    const r = buildXlsxInventory({
      sourceRef: "/abs/v.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
    });
    const dv = r.data_validations[0]!;
    expect(dv.range).toBe("A1:A9");
    // type + operator + both bounds, so data_validation_coverage is auditable, not just the kind.
    expect(dv.rule_summary).toContain("type=whole");
    expect(dv.rule_summary).toContain("operator=between");
    expect(dv.rule_summary).toContain("formula1=1");
    expect(dv.rule_summary).toContain("formula2=10");
    // design-C: a non-list validation never yields enum members.
    expect(dv.validation_type).toBe("whole");
    expect(dv.members).toBeUndefined();
    expect(dv.members_truncated).toBe(true);
  });

  it("bounds observed sheet count at max_sheets_observed and discloses capture_truncated (B4)", () => {
    const sheetXml =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A1"/><sheetData>` +
      `<row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`;
    const bytes = zipSync({
      "xl/workbook.xml": strToU8(
        `<?xml version="1.0"?><workbook ${WB_R}><sheets>` +
          `<sheet name="S1" sheetId="1" r:id="rId1"/>` +
          `<sheet name="S2" sheetId="2" r:id="rId2"/>` +
          `<sheet name="S3" sheetId="3" r:id="rId3"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
          `<Relationship Id="rId1" Type="${relType("worksheet")}" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="${relType("worksheet")}" Target="worksheets/sheet2.xml"/>` +
          `<Relationship Id="rId3" Type="${relType("worksheet")}" Target="worksheets/sheet3.xml"/>` +
          `</Relationships>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(sheetXml),
      "xl/worksheets/sheet2.xml": strToU8(sheetXml),
      "xl/worksheets/sheet3.xml": strToU8(sheetXml),
    });
    const r = buildXlsxInventory({
      sourceRef: "/abs/many.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
      caps: { ...DEFAULT_DATA_LAYER_CAPS, max_sheets_observed: 2 },
    });
    // Only the first 2 of 3 sheets are observed; the bound is disclosed via capture_truncated,
    // and sheet_count_total preserves the true total so the count is not mis-reported.
    expect(r.sheets.length).toBe(2);
    expect(r.capture_truncated).toBe(true);
    expect(r.sheet_count_total).toBe(3);
  });

  it("extracts cross-sheet refs with non-ASCII (Korean) sheet names and ignores #REF!", () => {
    // Mirrors a real workbook: SUMIFS over Korean-named sheets, plus a #REF! error
    // token that must NOT be mistaken for a sheet reference.
    const sheet =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A1"/><sheetData>` +
      `<row r="1"><c r="A1"><f>SUMIFS(결제상세!$AK:$AK,결제상세!$D:$D,매출!$A1)+#REF!</f><v>0</v></c></row>` +
      `</sheetData></worksheet>`;
    const bytes = zipSync(makeMinimalXlsxParts(sheet));
    const r = buildXlsxInventory({ sourceRef: "/abs/k.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.formula_patterns).toHaveLength(1);
    const refs = r.formula_patterns[0]!.cross_sheet_refs;
    expect(refs).toContain("결제상세");
    expect(refs).toContain("매출");
    expect(refs).not.toContain("REF");
  });

  it("detects a VBA macro project from xl/vbaProject.bin even on a .xlsx", () => {
    const parts = makeMinimalXlsxParts(
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A1"/><sheetData>` +
        `<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`,
    );
    parts["xl/vbaProject.bin"] = strToU8("fake-vba-binary");
    const bytes = zipSync(parts);
    const r = buildXlsxInventory({ sourceRef: "/abs/m.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.macro_present).toBe(true);
    expect(r.risk_signals.some((s) => s.kind === "macro_present")).toBe(true);
  });

  it("bounds the per-sheet scan to the row cap and keeps the true declared size (early-exit)", () => {
    const rows: string[] = [
      `<row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c></row>`,
    ];
    for (let i = 2; i <= 600; i += 1) {
      // Row 600 (well beyond the cap) is a string that WOULD flip the column type
      // to string if it were scanned. With the cap it must never be processed.
      const cell =
        i === 600
          ? `<c r="A600" t="inlineStr"><is><t>LATEMARKER</t></is></c>`
          : `<c r="A${i}"><v>${i}</v></c>`;
      rows.push(`<row r="${i}">${cell}</row>`);
    }
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A600"/><sheetData>${rows.join("")}</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({
      sourceRef: "/abs/big.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
      caps: { ...DEFAULT_DATA_LAYER_CAPS, max_rows_scanned_per_sheet: 50 },
    });

    expect(r.capture_truncated).toBe(true);
    // Late string beyond the scan window never seen → column stays integer.
    const col = r.per_sheet_data[0]!.columns.find((c) => c.name === "id")!;
    expect(col.inferred_type).toBe("integer");
    expect(JSON.stringify(r)).not.toContain("LATEMARKER");
    // Declared dimension is still reported truthfully.
    expect(r.sheets[0]!.dimensions.rows).toBe(600);
    // design-C honesty (§8): non_empty_count is a LOWER BOUND when the row cap truncated the
    // scan — it reflects only the scanned window (cap 50, incl. header), never the declared 599
    // data rows. Bound it to the scanned window and tie it to capture_truncated (asserted above).
    expect(col.non_empty_count).toBeLessThanOrEqual(50);
    expect(col.non_empty_count).toBeLessThan(599);
  });

  it("returns an honest unsupported_reason on a non-OOXML input (not a crash)", () => {
    const r = buildXlsxInventory({
      sourceRef: "/abs/bad.xlsx",
      bytes: strToU8("this is not a zip file"),
      contentSha256: "deadbeef",
      workbookKind: "xlsx",
    });
    // Streaming unzip yields no entries for non-zip bytes → honest "missing
    // workbook.xml"; a malformed zip surfaces "unzip failed". Either is honest.
    expect(r.unsupported_reason).toMatch(/unzip failed|workbook\.xml/);
  });

  it("returns an honest unsupported_reason when xl/workbook.xml is absent", () => {
    const bytes = zipSync({ "xl/styles.xml": strToU8("<styleSheet/>") });
    const r = buildXlsxInventory({
      sourceRef: "/abs/nowb.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
    });
    expect(r.unsupported_reason).toMatch(/workbook\.xml/);
  });

  it("is deterministic: identical bytes → identical inventory", () => {
    const bytes = makeWorkbookXlsx();
    const a = buildXlsxInventory({ sourceRef: "/abs/book.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    const b = buildXlsxInventory({ sourceRef: "/abs/book.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("recognizes pivot tables, resolving fields from the cache, and marks the host sheet crosstab", () => {
    const bytes = zipSync({
      "xl/workbook.xml": strToU8(
        `<?xml version="1.0"?><workbook ${WB_R}><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${relType("worksheet")}" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
      // The pivot renders a numeric crosstab grid (no flat-table header of its own).
      "xl/worksheets/sheet1.xml": strToU8(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A3:C20"/><sheetData>` +
          `<row r="3"><c r="A3"><v>100</v></c><c r="B3"><v>200</v></c></row>` +
          `<row r="4"><c r="A4"><v>300</v></c><c r="B4"><v>400</v></c></row></sheetData></worksheet>`,
      ),
      "xl/worksheets/_rels/sheet1.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${relType("pivotTable")}" Target="../pivotTables/pivotTable1.xml"/></Relationships>`,
      ),
      "xl/pivotTables/pivotTable1.xml": strToU8(
        `<?xml version="1.0"?><pivotTableDefinition name="매출요약" cacheId="1"><location ref="A3:C20"/>` +
          `<pivotFields count="3"><pivotField axis="axisRow"/><pivotField axis="axisCol"/><pivotField dataField="1"/></pivotFields>` +
          `<rowFields count="1"><field x="0"/></rowFields><colFields count="1"><field x="1"/></colFields>` +
          `<dataFields count="1"><dataField name="합계 : 금액" fld="2" subtotal="sum"/></dataFields></pivotTableDefinition>`,
      ),
      "xl/pivotTables/_rels/pivotTable1.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${relType("pivotCacheDefinition")}" Target="../pivotCache/pivotCacheDefinition1.xml"/></Relationships>`,
      ),
      "xl/pivotCache/pivotCacheDefinition1.xml": strToU8(
        `<?xml version="1.0"?><pivotCacheDefinition><cacheSource type="worksheet"><worksheetSource ref="A1:C100" sheet="결제상세"/></cacheSource>` +
          `<cacheFields count="3"><cacheField name="결제일"/><cacheField name="상품"/><cacheField name="금액"/></cacheFields></pivotCacheDefinition>`,
      ),
    });
    const r = buildXlsxInventory({ sourceRef: "/abs/pivot.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });

    expect(r.pivot_tables).toHaveLength(1);
    const p = r.pivot_tables[0]!;
    expect(p.name).toBe("매출요약");
    expect(p.sheet).toBe("Summary");
    expect(p.location).toBe("A3:C20");
    expect(p.source_sheet).toBe("결제상세");
    expect(p.source_ref).toBe("A1:C100");
    expect(p.row_fields).toEqual(["결제일"]); // cache field index 0
    expect(p.column_fields).toEqual(["상품"]); // index 1
    expect(p.data_fields).toEqual(["합계 : 금액"]); // dataField display name
    // the pivot-hosting sheet is a crosstab, not a flat table
    expect(r.per_sheet_data.find((d) => d.sheet === "Summary")!.layout_kind).toBe("pivot_or_crosstab");
  });

  it("computes cross-sheet key overlap between same-named columns (counts only)", () => {
    const sheet = (rows: string) =>
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:B4"/><sheetData>${rows}</sheetData></worksheet>`;
    const str = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
    const num = (ref: string, v: number) => `<c r="${ref}"><v>${v}</v></c>`;
    const bytes = zipSync({
      "xl/workbook.xml": strToU8(
        `<?xml version="1.0"?><workbook ${WB_R}><sheets>` +
          `<sheet name="주문" sheetId="1" r:id="rId1"/><sheet name="출고" sheetId="2" r:id="rId2"/>` +
          `</sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
          `<Relationship Id="rId1" Type="${relType("worksheet")}" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="${relType("worksheet")}" Target="worksheets/sheet2.xml"/></Relationships>`,
      ),
      // 주문.결제번호 = {P001,P002,P003}
      "xl/worksheets/sheet1.xml": strToU8(
        sheet(
          `<row r="1">${str("A1", "결제번호")}${str("B1", "금액")}</row>` +
            `<row r="2">${str("A2", "P001")}${num("B2", 100)}</row>` +
            `<row r="3">${str("A3", "P002")}${num("B3", 200)}</row>` +
            `<row r="4">${str("A4", "P003")}${num("B4", 300)}</row>`,
        ),
      ),
      // 출고.결제번호 = {P002,P003,P004} → overlap with 주문 = {P002,P003} = 2
      "xl/worksheets/sheet2.xml": strToU8(
        sheet(
          `<row r="1">${str("A1", "결제번호")}${str("B1", "상태")}</row>` +
            `<row r="2">${str("A2", "P002")}${str("B2", "done")}</row>` +
            `<row r="3">${str("A3", "P003")}${str("B3", "done")}</row>` +
            `<row r="4">${str("A4", "P004")}${str("B4", "pending")}</row>`,
        ),
      ),
    });
    const r = buildXlsxInventory({ sourceRef: "/abs/join.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });

    expect(r.cross_sheet_key_overlap).toHaveLength(1);
    const o = r.cross_sheet_key_overlap[0]!;
    expect(o.key_name).toBe("결제번호");
    expect([...o.sheets].sort()).toEqual(["주문", "출고"].sort());
    expect(o.pairwise_overlap).toHaveLength(1);
    expect(o.pairwise_overlap[0]!.count).toBe(2); // P002, P003 shared
    // only counts — no raw key values leak.
    expect(JSON.stringify(r.cross_sheet_key_overlap)).not.toContain("P002");
  });
});

describe("header detection — offset headers + confidence (deterministic, finding 3)", () => {
  it("finds the header below leading title / blank rows (high when data has type contrast)", () => {
    const r = inv("Quarterly Report\n\nname,role,amount\nAlice,eng,100\nBob,eng,200\n");
    const d = r.per_sheet_data[0]!;
    expect(d.layout_kind).toBe("tabular");
    expect(d.header_rows).toEqual([2]); // skipped the title row and the blank row
    expect(d.header_confidence).toBe("high"); // numeric 'amount' data → contrast
    expect(d.columns.map((c) => c.name)).toEqual(["name", "role", "amount"]);
  });

  it("keeps a clean first-row header high confidence when data shows type contrast", () => {
    const d = inv("name,age\nAlice,30\nBob,25\n").per_sheet_data[0]!;
    expect(d.layout_kind).toBe("tabular");
    expect(d.header_rows).toEqual([0]);
    expect(d.header_confidence).toBe("high");
  });

  it("flags an all-text first row as LOW confidence — indistinguishable from data (Codex P1)", () => {
    // No type contrast: row 0 could be a header OR the first data row. The observer
    // cannot tell deterministically, so it must not claim high confidence (its cells
    // could be raw values, not schema). Escalation candidate.
    const d = inv("Alice,Engineering\nBob,Sales\nCarol,Marketing\n").per_sheet_data[0]!;
    expect(d.header_confidence).toBe("low");
  });

  it("flags a sparse/uncertain header as low confidence", () => {
    const d = inv("x,,\n1,2,3\n4,5,6\n").per_sheet_data[0]!;
    expect(d.header_confidence).toBe("low");
  });

  it("flags a headerless numeric matrix as matrix_no_header + low confidence", () => {
    const d = inv("1,2,3\n4,5,6\n7,8,9\n").per_sheet_data[0]!;
    expect(d.layout_kind).toBe("matrix_no_header");
    expect(d.header_confidence).toBe("low");
    expect(d.columns).toEqual([]);
  });
});

describe("Codex review fixes (P4 hardening)", () => {
  it("detects CSV delimiter past a leading title line (#7)", () => {
    // Semicolon-delimited with a title + blank line; first-line-only detection
    // would collapse to one column.
    const d = inv("Monthly Report\n\nname;role;amount\nAlice;eng;100\nBob;sales;200\n").per_sheet_data[0]!;
    expect(d.layout_kind).toBe("tabular");
    expect(d.columns.map((c) => c.name)).toEqual(["name", "role", "amount"]);
  });

  it("preserves an XLSB workbook kind instead of mislabeling it csv (#4)", async () => {
    const tmp = path.join(os.tmpdir(), `onto-s1-xlsb-${process.pid}`);
    await fs.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "book.xlsb");
    await fs.writeFile(file, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const r = await observeSpreadsheetSource(file);
    expect(r.workbook_kind).toBe("xlsb");
    expect(r.unsupported_reason).toMatch(/xlsb/);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("does not infer a macro from the .xlsm extension without vbaProject.bin (#8)", () => {
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A1"/><sheetData>` +
          `<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/m.xlsm", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsm" });
    expect(r.macro_present).toBe(false);
    expect(r.risk_signals.some((s) => s.kind === "macro_present")).toBe(false);
  });

  it("reports an offset worksheet dimension as span + offset used_range (#3)", () => {
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="B2:D10"/><sheetData>` +
          `<row r="2"><c r="B2" t="inlineStr"><is><t>h</t></is></c></row></sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/off.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    const s = r.sheets[0]!;
    expect(s.dimensions).toEqual({ rows: 9, cols: 3 }); // span, not bounding box (10,4)
    expect(s.used_range).toBe("R2C2:R10C4"); // offset preserved
  });

  it("sets capture_truncated when a structural cap is hit (#5)", () => {
    // 1001 error cells > XLSX_ERROR_CELL_CAP (1000) → truncated signal.
    let rows = "";
    for (let i = 1; i <= 1001; i += 1) rows += `<row r="${i}"><c r="A${i}" t="e"><v>#REF!</v></c></row>`;
    const bytes = zipSync(
      makeMinimalXlsxParts(`<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A1001"/><sheetData>${rows}</sheetData></worksheet>`),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/cap.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.error_cells.length).toBe(1000);
    expect(r.capture_truncated).toBe(true);
  });

  it("resolves an external-link relationship to its real external target (#6)", () => {
    const bytes = zipSync({
      "xl/workbook.xml": strToU8(`<?xml version="1.0"?><workbook ${WB_R}><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
          `<Relationship Id="rId1" Type="${relType("worksheet")}" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="${relType("externalLink")}" Target="externalLinks/externalLink1.xml"/></Relationships>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A1"/><sheetData/></worksheet>`),
      "xl/externalLinks/_rels/externalLink1.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
          `<Relationship Id="rId1" Type="${relType("externalLinkPath")}" Target="file:///C:/books/source.xlsx" TargetMode="External"/></Relationships>`,
      ),
    });
    const r = buildXlsxInventory({ sourceRef: "/abs/ext.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.external_links).toHaveLength(1);
    expect(r.external_links[0]!.target).toBe("file:///C:/books/source.xlsx"); // real path, not internal zip part
  });
});

describe("Codex review fixes — round 2 (P4 hardening)", () => {
  it("ignores quoted delimiters when detecting the CSV dialect (R2 #1)", () => {
    // Commas are the real delimiter; the semicolons live inside quoted text.
    const d = inv('name,amount,note\nAlice,30,"a;b;c"\nBob,25,"x;y"\n').per_sheet_data[0]!;
    expect(d.layout_kind).toBe("tabular");
    expect(d.columns.map((c) => c.name)).toEqual(["name", "amount", "note"]); // not collapsed by ';'
  });

  it("normalizes offset worksheet cells to the used-range origin — no phantom columns (R2 #2)", () => {
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="B1:C3"/><sheetData>` +
          `<row r="1"><c r="B1" t="inlineStr"><is><t>name</t></is></c><c r="C1" t="inlineStr"><is><t>age</t></is></c></row>` +
          `<row r="2"><c r="B2" t="inlineStr"><is><t>Alice</t></is></c><c r="C2"><v>30</v></c></row>` +
          `<row r="3"><c r="B3" t="inlineStr"><is><t>Bob</t></is></c><c r="C3"><v>25</v></c></row>` +
          `</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/off.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    const d = r.per_sheet_data[0]!;
    expect(d.columns.map((c) => c.name)).toEqual(["name", "age"]); // no leading phantom col_1
  });

  it("collapses a shared-formula fill-down (master + followers) into ONE pattern with occurrence_count = N (Stage 1.1)", () => {
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A2"/><sheetData>` +
          `<row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A2">Other!A1+1</f><v>2</v></c></row>` +
          `<row r="2"><c r="A2"><f t="shared" si="0"/><v>3</v></c></row>` +
          `</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/sf.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    // tier-1 exact-text dedup: the follower resolves to the master's verbatim text, so
    // the fill-down is a SINGLE pattern (not 2 per-cell rows), while formula_cells_total
    // honestly counts every formula cell.
    expect(r.formula_patterns).toHaveLength(1);
    const p = r.formula_patterns[0]!;
    expect(p.pattern).toBe("Other!A1+1");
    expect(p.occurrence_count).toBe(2); // master + 1 follower
    expect(p.sample_cell).toBe("A1"); // first occurrence
    expect(p.applied_ranges).toEqual(["A1", "A2"]);
    expect(r.formula_cells_total).toBe(2);
    expect(r.formula_cells_total_is_lower_bound).toBe(false);
    expect(p.cross_sheet_refs).toContain("Other"); // the fill-down keeps its dependency
  });

  it("does NOT merge two DIFFERENT fill-down blocks (distinct formula text → 2 patterns)", () => {
    // Two shared-formula blocks with DIFFERENT text. Each is its own pattern; tier-1
    // exact-text dedup must not collapse them together.
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:B2"/><sheetData>` +
          `<row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A2">A1*2</f><v>2</v></c>` +
          `<c r="B1"><f t="shared" si="1" ref="B1:B2">B1*3</f><v>3</v></c></row>` +
          `<row r="2"><c r="A2"><f t="shared" si="0"/><v>4</v></c>` +
          `<c r="B2"><f t="shared" si="1"/><v>6</v></c></row>` +
          `</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/two.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.formula_patterns).toHaveLength(2);
    const byText = new Map(r.formula_patterns.map((p) => [p.pattern, p.occurrence_count]));
    expect(byText.get("A1*2")).toBe(2);
    expect(byText.get("B1*3")).toBe(2);
    expect(r.formula_cells_total).toBe(4);
  });

  it("preserves cross_sheet_refs on the deduped pattern (Stage 1.1)", () => {
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A2"/><sheetData>` +
          `<row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A2">Sales!A1+Costs!B1</f><v>2</v></c></row>` +
          `<row r="2"><c r="A2"><f t="shared" si="0"/><v>3</v></c></row>` +
          `</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/xref.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.formula_patterns).toHaveLength(1);
    const refs = r.formula_patterns[0]!.cross_sheet_refs;
    expect(refs).toContain("Sales");
    expect(refs).toContain("Costs");
  });

  it("counts every formula cell in formula_cells_total even with deep occurrence accumulation (cap honesty)", () => {
    // A larger fill-down (one pattern over many cells): occurrence_count accumulates and
    // formula_cells_total counts every cell. applied_ranges stays bounded (≤8). The
    // distinct-pattern cap is 5000 — far above one pattern — so is_lower_bound is false.
    const N = 50;
    const rowsXml = Array.from({ length: N }, (_, i) =>
      i === 0
        ? `<row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A${N}">B1+1</f><v>1</v></c></row>`
        : `<row r="${i + 1}"><c r="A${i + 1}"><f t="shared" si="0"/><v>1</v></c></row>`,
    ).join("");
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A${N}"/><sheetData>${rowsXml}</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/big.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.formula_patterns).toHaveLength(1);
    expect(r.formula_patterns[0]!.occurrence_count).toBe(N);
    expect(r.formula_patterns[0]!.applied_ranges.length).toBe(8); // bounded display list
    expect(r.formula_cells_total).toBe(N);
    expect(r.formula_cells_total_is_lower_bound).toBe(false);
  });

  it("preserves all rich inline-string runs (R2 #5)", () => {
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:B2"/><sheetData>` +
          `<row r="1"><c r="A1" t="inlineStr"><is><r><t>Hel</t></r><r><t>lo</t></r></is></c>` +
          `<c r="B1" t="inlineStr"><is><t>amount</t></is></c></row>` +
          `<row r="2"><c r="A2" t="inlineStr"><is><t>x</t></is></c><c r="B2"><v>10</v></c></row>` +
          `</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/rt.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.per_sheet_data[0]!.columns[0]!.name).toBe("Hello"); // both runs, not just "lo"
  });

  it("preserves sparse row positions so completeness ratios stay honest (R2 #6)", () => {
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A5"/><sheetData>` +
          `<row r="1"><c r="A1" t="inlineStr"><is><t>v</t></is></c></row>` +
          `<row r="2"><c r="A2"><v>10</v></c></row>` +
          `<row r="5"><c r="A5"><v>20</v></c></row>` + // rows 3,4 omitted (blank)
          `</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/sparse.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    // 4 data rows (r2..r5, with r3/r4 blank), 2 non-empty → 0.5, not 1.0.
    expect(r.per_sheet_data[0]!.columns[0]!.non_empty_ratio).toBe(0.5);
  });

  it("strips a leading UTF-8 BOM from the first CSV header cell (R2 #8)", () => {
    const d = inv("﻿name,age\nAlice,30\nBob,25\n").per_sheet_data[0]!;
    expect(d.columns.map((c) => c.name)).toEqual(["name", "age"]); // first name is "name", not "﻿name"
  });
});

describe("Codex review fixes — round 3 (P4 hardening)", () => {
  it("sets capture_truncated when an XLSX sheet exceeds the column cap (R3 #2)", () => {
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:C2"/><sheetData>` +
          `<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="B1" t="inlineStr"><is><t>b</t></is></c><c r="C1" t="inlineStr"><is><t>c</t></is></c></row>` +
          `<row r="2"><c r="A2"><v>1</v></c><c r="B2"><v>2</v></c><c r="C2"><v>3</v></c></row>` +
          `</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({
      sourceRef: "/abs/wide.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
      caps: { ...DEFAULT_DATA_LAYER_CAPS, max_columns_profiled: 2 }, // 3 cols > cap
    });
    expect(r.capture_truncated).toBe(true);
  });

  it("parses a .tsv as tab-delimited even when a cell contains commas (R3 #3)", async () => {
    const tmp = path.join(os.tmpdir(), `onto-s1-tsv-${process.pid}`);
    await fs.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "vendors.tsv");
    await fs.writeFile(file, "name\tcompany\nAlice\tACME, Inc.\nBob\tFoo, LLC\n", "utf8");
    const r = await observeSpreadsheetSource(file);
    expect(r.workbook_kind).toBe("tsv");
    expect(r.per_sheet_data[0]!.columns.map((c) => c.name)).toEqual(["name", "company"]); // not split on the comma
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("types a date-styled numeric XLSX column as a date, not a number (R3 #4)", () => {
    const styles =
      `<?xml version="1.0"?><styleSheet xmlns="${SML_NS}">` +
      `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>` +
      `<cellXfs count="2"><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0"/></cellXfs></styleSheet>`;
    const sheet =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A3"/><sheetData>` +
      `<row r="1"><c r="A1" t="inlineStr"><is><t>txn_date</t></is></c></row>` +
      `<row r="2"><c r="A2" s="1"><v>45292</v></c></row>` + // date serial, date style (xf 1)
      `<row r="3"><c r="A3" s="1"><v>45293</v></c></row>` +
      `</sheetData></worksheet>`;
    const bytes = zipSync({ ...makeMinimalXlsxParts(sheet), "xl/styles.xml": strToU8(styles) });
    const r = buildXlsxInventory({ sourceRef: "/abs/dates.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    const col = r.per_sheet_data[0]!.columns[0]!;
    expect(col.name).toBe("txn_date");
    expect(col.inferred_type).toBe("date"); // serial 45292 → ISO date, not integer
  });
});

describe("Codex review fixes — round 4 (P4 hardening)", () => {
  it("does not treat a color/currency number format as a date (R4 #2)", () => {
    // "[Red]#,##0" contains a 'd' in "Red" — must NOT be read as a date format.
    const styles =
      `<?xml version="1.0"?><styleSheet xmlns="${SML_NS}">` +
      `<numFmts count="1"><numFmt numFmtId="164" formatCode="[Red]#,##0;[Red]-#,##0"/></numFmts>` +
      `<cellXfs count="2"><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0"/></cellXfs></styleSheet>`;
    const sheet =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A3"/><sheetData>` +
      `<row r="1"><c r="A1" t="inlineStr"><is><t>amount</t></is></c></row>` +
      `<row r="2"><c r="A2" s="1"><v>1000</v></c></row>` +
      `<row r="3"><c r="A3" s="1"><v>2000</v></c></row>` +
      `</sheetData></worksheet>`;
    const bytes = zipSync({ ...makeMinimalXlsxParts(sheet), "xl/styles.xml": strToU8(styles) });
    const r = buildXlsxInventory({ sourceRef: "/abs/amt.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.per_sheet_data[0]!.columns[0]!.inferred_type).toBe("integer"); // amounts stay numeric
  });

  it("captures cross-sheet refs to apostrophe sheet names with doubled quotes (R4 #4)", () => {
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A1"/><sheetData>` +
          `<row r="1"><c r="A1"><f>'Bob''s Sheet'!A1+1</f><v>2</v></c></row>` +
          `</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/apos.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.formula_patterns[0]!.cross_sheet_refs).toContain("Bob's Sheet"); // unescaped, not "Bob"
  });
});

describe("projectInventoryForPrompt — bounded prompt projection (size axis)", () => {
  function emptyInventory(): WorkbookStructuralInventory {
    return {
      adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
      adapter_version: 3,
      source_ref: "/abs/book.xlsx",
      content_sha256: "deadbeef",
      workbook_kind: "xlsx",
      inspection_method: "structure_inspected_only",
      sheets: [],
      named_ranges: [],
      tables: [],
      pivot_tables: [],
      formula_patterns: [],
      formula_cells_total: 0,
      formula_cells_total_is_lower_bound: false,
      merged_ranges: [],
      data_validations: [],
      external_links: [],
      error_cells: [],
      macro_present: false,
      risk_signals: [],
      per_sheet_data: [],
      distinct_value_vocab: [],
      cross_sheet_key_overlap: [],
      data_layer_caps: DEFAULT_DATA_LAYER_CAPS,
      capture_truncated: false,
      unsupported_reason: null,
    };
  }

  it("is a no-op on an empty inventory (not truncated, untouched)", () => {
    const inv = emptyInventory();
    const r = projectInventoryForPrompt(inv);
    expect(r.truncated).toBe(false);
    expect(r.sections).toEqual([]);
    expect(r.inventory).toEqual(inv);
  });

  it("leaves a small under-cap inventory fully intact", () => {
    const inv = emptyInventory();
    inv.formula_patterns = [
      { pattern: "=1+1", sample_cell: "A1", occurrence_count: 1, applied_ranges: ["A1"], sheets: ["A"], cross_sheet_refs: [] },
      { pattern: "=A!A1", sample_cell: "B2", occurrence_count: 1, applied_ranges: ["B2"], sheets: ["B"], cross_sheet_refs: ["A"] },
    ];
    inv.formula_cells_total = 2;
    inv.pivot_tables = [
      { name: "P", sheet: "A", location: "A1", source_sheet: "A", source_ref: null, row_fields: ["x"], column_fields: [], page_fields: [], data_fields: ["sum"] },
    ];
    const r = projectInventoryForPrompt(inv);
    expect(r.truncated).toBe(false);
    expect(r.sections).toEqual([]);
    expect(r.inventory.formula_patterns).toEqual(inv.formula_patterns);
    expect(r.inventory.formula_cells_total).toBe(2);
    expect(r.inventory.pivot_tables).toEqual(inv.pivot_tables);
  });

  it("caps formula_patterns to max_formula_patterns and keeps the honest cell total (Stage 1.1)", () => {
    const inv = emptyInventory();
    // 250 distinct patterns; the prompt cap keeps the first max_formula_patterns, while
    // formula_cells_total (the honest cell count) passes through untrimmed.
    for (let i = 0; i < 250; i += 1) {
      inv.formula_patterns.push({
        pattern: `=ROW()+${i}`,
        sample_cell: `A${i}`,
        occurrence_count: 1,
        applied_ranges: [`A${i}`],
        sheets: ["A"],
        cross_sheet_refs: [],
      });
    }
    inv.formula_cells_total = 250;
    const r = projectInventoryForPrompt(inv, {
      max_formula_patterns: 200,
      max_sheets: 50,
      max_columns_per_sheet: 64,
      max_distinct_value_vocab: 200,
      max_pivot_tables: 50,
      max_cross_sheet_overlaps: 50,
      max_pairwise_per_overlap: 16,
      max_named_ranges: 50,
      max_tables: 50,
      max_data_validations: 50,
      max_external_links: 50,
      max_error_cells: 50,
      max_merged_ranges: 50,
      max_risk_signals: 50,
    });
    expect(r.inventory.formula_patterns).toHaveLength(200);
    expect(r.inventory.formula_cells_total).toBe(250); // never trimmed by the SIZE projection
    expect(r.truncated).toBe(true);
    expect(r.sections).toContainEqual({ section: "formula_patterns", kept: 200, total: 250 });
  });

  it("records an honest per-section manifest and preserves the persisted envelope", () => {
    const inv = emptyInventory();
    for (let i = 0; i < 300; i += 1) {
      inv.distinct_value_vocab.push({
        sheet: "A",
        column: `c${i}`,
        distinct_count: 1,
        distinct_count_is_estimate: false,
      });
    }
    inv.per_sheet_data = [
      {
        sheet: "A",
        layout_kind: "tabular",
        header_rows: [1],
        columns: Array.from({ length: 80 }, (_, i) => ({
          name: `c${i}`,
          index: i,
          inferred_type: "string" as const,
          non_empty_ratio: 1,
          distinct_count: 1,
          distinct_count_is_estimate: false,
          non_empty_count: 1,
        })),
        header_confidence: "high",
      },
    ];
    const r = projectInventoryForPrompt(inv);
    expect(r.inventory.distinct_value_vocab).toHaveLength(200);
    expect(r.inventory.per_sheet_data[0]!.columns).toHaveLength(64);
    expect(r.sections).toContainEqual({ section: "distinct_value_vocab", kept: 200, total: 300 });
    expect(r.sections).toContainEqual({ section: "per_sheet_data.columns", kept: 64, total: 80 });
    // Envelope / scalar provenance fields are never touched by the size projection.
    expect(r.inventory.content_sha256).toBe(inv.content_sha256);
    expect(r.inventory.workbook_kind).toBe(inv.workbook_kind);
    expect(r.inventory.inspection_method).toBe("structure_inspected_only");
    // Input is not mutated (pure).
    expect(inv.distinct_value_vocab).toHaveLength(300);
  });

  it("bounds a high-sheet-count workbook with the global sheet ceiling (Codex P2)", () => {
    const inv = emptyInventory();
    // 200 sheets: the per_sheet_data sheet ceiling caps the rendered layout at 50.
    // Formula patterns are deduped (one pattern per sheet here) and stay under the cap.
    for (let s = 0; s < 200; s += 1) {
      const sheet = `S${s}`;
      inv.formula_patterns.push({
        pattern: `=ROW()+${s}`,
        sample_cell: "A1",
        occurrence_count: 1,
        applied_ranges: ["A1"],
        sheets: [sheet],
        cross_sheet_refs: [],
      });
      inv.per_sheet_data.push({
        sheet,
        layout_kind: "tabular",
        header_rows: [1],
        columns: [{ name: "c0", index: 0, inferred_type: "string" as const, non_empty_ratio: 1, distinct_count: 1, distinct_count_is_estimate: false, non_empty_count: 1 }],
        header_confidence: "high",
      });
    }
    inv.formula_cells_total = 200;
    const r = projectInventoryForPrompt(inv);
    expect(r.inventory.per_sheet_data).toHaveLength(50);
    expect(r.truncated).toBe(true);
    expect(r.sections).toContainEqual({ section: "per_sheet_data", kept: 50, total: 200 });
    // 200 distinct patterns == the default cap, so formula_patterns is NOT trimmed.
    expect(r.inventory.formula_patterns).toHaveLength(200);
  });
});

// ───────────────────────── design-C: per-column cardinality + declared enum labels ─────────────────────────

function designCEmptyInventory(): WorkbookStructuralInventory {
  return {
    adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
    adapter_version: SPREADSHEET_OBSERVER_ADAPTER_VERSION,
    source_ref: "/abs/book.xlsx",
    content_sha256: "deadbeef",
    workbook_kind: "xlsx",
    inspection_method: "structure_inspected_only",
    sheets: [],
    named_ranges: [],
    tables: [],
    pivot_tables: [],
    formula_patterns: [],
    formula_cells_total: 0,
    formula_cells_total_is_lower_bound: false,
    merged_ranges: [],
    data_validations: [],
    external_links: [],
    error_cells: [],
    macro_present: false,
    risk_signals: [],
    per_sheet_data: [],
    distinct_value_vocab: [],
    cross_sheet_key_overlap: [],
    data_layer_caps: DEFAULT_DATA_LAYER_CAPS,
    capture_truncated: false,
    unsupported_reason: null,
  };
}

describe("design-C — per-column cardinality (residual signal)", () => {
  it("emits exact distinct/non_empty counts for a fully-distinct column (ratio 1.0)", () => {
    // 60 unique values + a header → distinct_count==non_empty_count==60, not an estimate.
    const rows = ["id"];
    for (let i = 0; i < 60; i += 1) rows.push(`u${i}`);
    const r = inv(`${rows.join("\n")}\n`, "/abs/card.csv");
    const col = r.per_sheet_data[0]!.columns.find((c) => c.name === "id")!;
    expect(col.distinct_count).toBe(60);
    expect(col.non_empty_count).toBe(60);
    expect(col.distinct_count_is_estimate).toBe(false);
    expect(columnResidualKey(col).ratio).toBe(1);
  });

  it("flags distinct_count_is_estimate at the distinct cap (lower bound)", () => {
    const rows = ["id"];
    for (let i = 0; i < 300; i += 1) rows.push(`u${i}`);
    const caps: DataLayerCaps = { ...DEFAULT_DATA_LAYER_CAPS, max_distinct_tracked_per_column: 256 };
    const r = inv(`${rows.join("\n")}\n`, "/abs/cap.csv", caps);
    const col = r.per_sheet_data[0]!.columns.find((c) => c.name === "id")!;
    expect(col.distinct_count).toBe(256);
    expect(col.distinct_count_is_estimate).toBe(true);
    expect(col.non_empty_count).toBe(300);
  });

  it("exactly-256 distinct is honest (not an estimate)", () => {
    const rows = ["id"];
    for (let i = 0; i < 256; i += 1) rows.push(`u${i}`);
    const caps: DataLayerCaps = { ...DEFAULT_DATA_LAYER_CAPS, max_distinct_tracked_per_column: 256 };
    const r = inv(`${rows.join("\n")}\n`, "/abs/exact.csv", caps);
    const col = r.per_sheet_data[0]!.columns.find((c) => c.name === "id")!;
    expect(col.distinct_count).toBe(256);
    expect(col.distinct_count_is_estimate).toBe(false);
  });

  it("an all-empty profiled column has ratio 0 (no NaN) via columnResidualKey", () => {
    // Two columns; the second is entirely empty below the header.
    const r = inv("a,b\n1,\n2,\n3,\n", "/abs/empty.csv");
    const col = r.per_sheet_data[0]!.columns.find((c) => c.name === "b")!;
    expect(col.non_empty_count).toBe(0);
    const key = columnResidualKey(col);
    expect(Number.isNaN(key.ratio)).toBe(false);
    expect(key.ratio).toBe(0);
  });

  it("non-tabular sheets carry no per-column cardinality (columns empty)", () => {
    const r = inv("1,2,3\n4,5,6\n", "/abs/matrix.csv");
    expect(r.per_sheet_data[0]!.layout_kind).toBe("matrix_no_header");
    expect(r.per_sheet_data[0]!.columns).toEqual([]);
  });
});

describe("design-C — columnResidualKey total order & selection", () => {
  const makeCol = (
    index: number,
    distinct: number,
    nonEmpty: number,
    estimate = false,
  ): InventoryColumn => ({
    name: `c${index}`,
    index,
    inferred_type: "string",
    non_empty_ratio: 1,
    distinct_count: distinct,
    distinct_count_is_estimate: estimate,
    non_empty_count: nonEmpty,
  });

  it("orders by estimate desc, ratio desc, index asc (deterministic ties)", () => {
    const est = makeCol(5, 256, 256, true); // estimate → MAXIMAL, first
    const hi = makeCol(2, 10, 10); // ratio 1.0
    const mid = makeCol(0, 5, 10); // ratio 0.5
    const tieA = makeCol(3, 6, 12); // ratio 0.5, index 3
    const tieB = makeCol(1, 6, 12); // ratio 0.5, index 1
    const sorted = [hi, mid, tieA, tieB, est].slice().sort(compareColumnResidualDesc);
    // estimate(5) first; then ratio 1.0 (hi, index 2); then the ratio-0.5 group by index
    // asc: mid(0), tieB(1), tieA(3).
    expect(sorted.map((c) => c.index)).toEqual([5, 2, 0, 1, 3]);
  });

  it("an estimate column stays MAXIMAL (kept) even at a tiny ratio", () => {
    const lowRatioEstimate = makeCol(9, 256, 100000, true); // ratio ~0.0026 but estimate
    const highRatio = makeCol(1, 100, 100); // ratio 1.0
    const sorted = [highRatio, lowRatioEstimate].slice().sort(compareColumnResidualDesc);
    expect(sorted[0]!.index).toBe(9); // estimate first regardless of ratio
  });

  it("projectInventoryForPrompt re-selects the highest-cardinality columns within the cap, emits in original index order, and is non-mutating", () => {
    const caps = { ...DEFAULT_WORKBOOK_INVENTORY_PROMPT_CAPS, max_columns_per_sheet: 3 };
    // 6 columns; residual priority is the REVERSE of index order, so a positional head-N
    // would pick the wrong 3 — proving selection is residual-driven, not positional.
    const columns: InventoryColumn[] = [
      makeCol(0, 1, 100), // ratio 0.01
      makeCol(1, 2, 100), // 0.02
      makeCol(2, 3, 100), // 0.03
      makeCol(3, 50, 100), // 0.50
      makeCol(4, 80, 100), // 0.80
      makeCol(5, 100, 100), // 1.00
    ];
    const inv0 = designCEmptyInventory();
    inv0.per_sheet_data = [
      { sheet: "S", layout_kind: "tabular", header_rows: [0], columns, header_confidence: "high" },
    ];
    const r = projectInventoryForPrompt(inv0, caps);
    const kept = r.inventory.per_sheet_data[0]!.columns.map((c) => c.index);
    // Top-3 by ratio are indexes 5,4,3; emitted in ORIGINAL index order → [3,4,5].
    expect(kept).toEqual([3, 4, 5]);
    expect(r.sections).toContainEqual({ section: "per_sheet_data.columns", kept: 3, total: 6 });
    // Input is not mutated.
    expect(inv0.per_sheet_data[0]!.columns.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("MIRROR-PARITY: a fresh recompute selects the IDENTICAL columns subset (head-N would differ)", () => {
    const caps = { ...DEFAULT_WORKBOOK_INVENTORY_PROMPT_CAPS, max_columns_per_sheet: 2 };
    const columns: InventoryColumn[] = [
      makeCol(0, 90, 100), // 0.90 (high, but index 0 — head-N would keep it)
      makeCol(1, 5, 100), // 0.05
      makeCol(2, 10, 100), // 0.10
      makeCol(3, 95, 100), // 0.95 (highest, index 3 — head-N would DROP it)
    ];
    const inv0 = designCEmptyInventory();
    inv0.per_sheet_data = [
      { sheet: "S", layout_kind: "tabular", header_rows: [0], columns, header_confidence: "high" },
    ];
    const seed = projectInventoryForPrompt(inv0, caps);
    const mirror = projectInventoryForPrompt(inv0, caps);
    const seedCols = seed.inventory.per_sheet_data[0]!.columns.map((c) => c.index);
    const mirrorCols = mirror.inventory.per_sheet_data[0]!.columns.map((c) => c.index);
    expect(seedCols).toEqual(mirrorCols);
    // Residual selection keeps indexes 0 and 3 (top-2 ratios); a positional head-N would
    // have kept 0 and 1 — so the subsets genuinely differ from head-N.
    expect(seedCols).toEqual([0, 3]);
  });
});

describe("design-C — declared type=list enum labels (authority detection)", () => {
  const listValidationSheet = (
    dimRef: string,
    sqref: string,
    formula1: string,
    type = "list",
  ): string =>
    `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="${dimRef}"/><sheetData>` +
    `<row r="1"><c r="A1" t="inlineStr"><is><t>h1</t></is></c><c r="B1" t="inlineStr"><is><t>h2</t></is></c><c r="C1" t="inlineStr"><is><t>h3</t></is></c></row>` +
    `<row r="2"><c r="A2" t="inlineStr"><is><t>x</t></is></c><c r="B2" t="inlineStr"><is><t>y</t></is></c><c r="C2" t="inlineStr"><is><t>z</t></is></c></row>` +
    `</sheetData>` +
    `<dataValidations count="1"><dataValidation type="${type}" sqref="${sqref}"><formula1>${formula1}</formula1></dataValidation></dataValidations>` +
    `</worksheet>`;

  const buildOne = (sheetXml: string) => {
    const bytes = zipSync(makeMinimalXlsxParts(sheetXml));
    return buildXlsxInventory({
      sourceRef: "/abs/dv.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
    });
  };

  it("inline literal formula1 → members parsed; range covers the right column", () => {
    const r = buildOne(listValidationSheet("A1:C2", "B1:B2", '"alpha,beta,gamma"'));
    const dv = r.data_validations[0]!;
    expect(dv.validation_type).toBe("list");
    expect(dv.members).toEqual(["alpha", "beta", "gamma"]);
    expect(dv.members_truncated).toBe(false);
    expect(dv.applies_to_columns).toEqual([1]);
  });

  it("OFFSET sheet (data at B2) normalizes applies_to_columns by dimStartCol", () => {
    // Dimension starts at column B (index 1). A validation on absolute column C (index 2)
    // normalizes to profiled column index 1.
    const sheet =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="B2:D3"/><sheetData>` +
      `<row r="2"><c r="B2" t="inlineStr"><is><t>h1</t></is></c><c r="C2" t="inlineStr"><is><t>h2</t></is></c><c r="D2" t="inlineStr"><is><t>h3</t></is></c></row>` +
      `<row r="3"><c r="B3" t="inlineStr"><is><t>p</t></is></c><c r="C3" t="inlineStr"><is><t>q</t></is></c><c r="D3" t="inlineStr"><is><t>s</t></is></c></row>` +
      `</sheetData>` +
      `<dataValidations count="1"><dataValidation type="list" sqref="C2:C3"><formula1>"on,off"</formula1></dataValidation></dataValidations>` +
      `</worksheet>`;
    const dv = buildOne(sheet).data_validations[0]!;
    expect(dv.members).toEqual(["on", "off"]);
    expect(dv.applies_to_columns).toEqual([1]); // C(abs 2) - dimStartCol(1) = 1
  });

  it("multi-range sqref → union of normalized columns", () => {
    const dv = buildOne(listValidationSheet("A1:C2", "A1:A2 C1:C2", '"p,q"')).data_validations[0]!;
    expect(dv.members).toEqual(["p", "q"]);
    expect(dv.applies_to_columns).toEqual([0, 2]);
  });

  it("whole-column sqref (B:B) maps to ITS column only, not the whole sheet (Codex #1)", () => {
    const dv = buildOne(listValidationSheet("A1:C2", "B:B", '"a,b"')).data_validations[0]!;
    // column B only — the declared enum must NOT attach to neighbours A and C.
    expect(dv.applies_to_columns).toEqual([1]);
  });

  it("whole-column SPAN ($B:$D) maps to its columns within the profiled window", () => {
    // A1:C2 profiles 3 columns (A,B,C). $B:$D covers absolute B,C,D; D (index 3) is beyond the
    // profiled window and is dropped, leaving normalized [1,2] (Codex #1 + #4 clamp).
    const dv = buildOne(listValidationSheet("A1:C2", "$B:$D", '"a,b"')).data_validations[0]!;
    expect(dv.applies_to_columns).toEqual([1, 2]);
  });

  it("range-ref formula1 → no members, members_truncated", () => {
    const dv = buildOne(listValidationSheet("A1:C2", "B1:B2", "Lists!$A$1:$A$5")).data_validations[0]!;
    expect(dv.validation_type).toBe("list");
    expect(dv.members).toBeUndefined();
    expect(dv.members_truncated).toBe(true);
  });

  it("over the member COUNT cap → no members, truncated", () => {
    const many = Array.from({ length: VALIDATION_MEMBER_COUNT_CAP + 1 }, (_, i) => `m${i}`).join(",");
    const dv = buildOne(listValidationSheet("A1:C2", "B1:B2", `"${many}"`)).data_validations[0]!;
    expect(dv.members).toBeUndefined();
    expect(dv.members_truncated).toBe(true);
    // Codex #2: the over-cap declared values must NOT leak via rule_summary either — it shows a
    // member COUNT, not the values (m0,m1,…). The bounded `members` field is the only value channel.
    expect(dv.rule_summary).toContain("formula1=list(");
    expect(dv.rule_summary).not.toContain("m0,m1");
  });

  it("a member over the CHAR cap → no members, truncated", () => {
    const long = "x".repeat(VALIDATION_MEMBER_CHAR_CAP + 1);
    const dv = buildOne(listValidationSheet("A1:C2", "B1:B2", `"ok,${long}"`)).data_validations[0]!;
    expect(dv.members).toBeUndefined();
    expect(dv.members_truncated).toBe(true);
  });

  it("a member exactly at the CHAR cap is kept", () => {
    const exact = "x".repeat(VALIDATION_MEMBER_CHAR_CAP);
    const dv = buildOne(listValidationSheet("A1:C2", "B1:B2", `"${exact}"`)).data_validations[0]!;
    expect(dv.members).toEqual([exact]);
    expect(dv.members_truncated).toBe(false);
  });

  it("type != list → never any members", () => {
    const dv = buildOne(listValidationSheet("A1:C2", "B1:B2", '"a,b"', "custom")).data_validations[0]!;
    expect(dv.validation_type).toBe("custom");
    expect(dv.members).toBeUndefined();
    expect(dv.members_truncated).toBe(true);
  });

  it("CSV carries no data validations (no declared schema authority)", () => {
    const r = inv("a,b\nx,y\n", "/abs/c.csv");
    expect(r.data_validations).toEqual([]);
  });
});

describe("design-C — aggregate-only boundary + admission passthrough", () => {
  it("members survive admission unchanged (declared schema, bounded); non-list emits zero members", () => {
    const sheet =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:B2"/><sheetData>` +
      `<row r="1"><c r="A1" t="inlineStr"><is><t>h1</t></is></c><c r="B1" t="inlineStr"><is><t>h2</t></is></c></row>` +
      `<row r="2"><c r="A2" t="inlineStr"><is><t>x</t></is></c><c r="B2" t="inlineStr"><is><t>y</t></is></c></row>` +
      `</sheetData>` +
      `<dataValidations count="2">` +
      `<dataValidation type="list" sqref="A1:A2"><formula1>"red,green"</formula1></dataValidation>` +
      `<dataValidation type="whole" operator="between" sqref="B1:B2"><formula1>1</formula1><formula2>9</formula2></dataValidation>` +
      `</dataValidations></worksheet>`;
    const bytes = zipSync(makeMinimalXlsxParts(sheet));
    const full = buildXlsxInventory({ sourceRef: "/abs/b.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    const admitted = projectInventoryForAdmission(full);
    const list = admitted.data_validations.find((d) => d.validation_type === "list")!;
    const whole = admitted.data_validations.find((d) => d.validation_type === "whole")!;
    expect(list.members).toEqual(["red", "green"]); // declared labels pass through
    expect(whole.members).toBeUndefined(); // non-list → zero members
    // Bounds invariant: every emitted member set obeys both caps.
    for (const dv of admitted.data_validations) {
      if (dv.members) {
        expect(dv.members.length).toBeLessThanOrEqual(VALIDATION_MEMBER_COUNT_CAP);
        for (const m of dv.members) expect(m.length).toBeLessThanOrEqual(VALIDATION_MEMBER_CHAR_CAP);
      }
    }
  });

  it("adapter_version is 4 (P1-C1 value-tile schema bump)", () => {
    expect(SPREADSHEET_OBSERVER_ADAPTER_VERSION).toBe(4);
    const r = inv("a,b\n1,2\n", "/abs/v.csv");
    expect(r.adapter_version).toBe(4);
  });
});

describe("CUT-2 value-tile — domain-agnostic display-format boundary (T5)", () => {
  // xf1 → 164 (m/d/yyyy), xf2 → 165 (d/m/yyyy): BOTH are date formats, so the date serials collapse
  // to ISO and the VALUE-string shape is uniform (ISO_DATE) — ONLY the display format changes.
  const DATE_STYLES =
    `<?xml version="1.0"?><styleSheet xmlns="${SML_NS}">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="m/d/yyyy"/><numFmt numFmtId="165" formatCode="d/m/yyyy"/></numFmts>` +
    `<cellXfs count="3"><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0"/><xf numFmtId="165" xfId="0"/></cellXfs></styleSheet>`;
  const TILE_OPTS = { window: 2, segmentsPerColumnCap: 256, distinctPerSegmentCap: 32 };

  it("catches a display-only m/d/yyyy→d/m/yyyy change at the EXACT row WITHOUT naming it, and emits NO value_shape boundary", () => {
    // 8 date serials in one column; xf1 (m/d/yyyy) rows 1-4, xf2 (d/m/yyyy) rows 5-8.
    const sheet =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A8"/><sheetData>` +
      `<row r="1"><c r="A1" s="1"><v>45292</v></c></row>` +
      `<row r="2"><c r="A2" s="1"><v>45293</v></c></row>` +
      `<row r="3"><c r="A3" s="1"><v>45294</v></c></row>` +
      `<row r="4"><c r="A4" s="1"><v>45295</v></c></row>` +
      `<row r="5"><c r="A5" s="2"><v>45296</v></c></row>` +
      `<row r="6"><c r="A6" s="2"><v>45297</v></c></row>` +
      `<row r="7"><c r="A7" s="2"><v>45298</v></c></row>` +
      `<row r="8"><c r="A8" s="2"><v>45299</v></c></row>` +
      `</sheetData></worksheet>`;
    const bytes = zipSync({ ...makeMinimalXlsxParts(sheet), "xl/styles.xml": strToU8(DATE_STYLES) });
    const r = buildXlsxInventory({
      sourceRef: "/abs/fmt.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
      valueTileOpts: TILE_OPTS,
    });
    const col = r.segmented_value_tiles![0]!.columns[0]!;
    const fmtNotes = col.intra_tile_notes.filter((n) => n.boundary_kind === "display_format");
    const shapeNotes = col.intra_tile_notes.filter((n) => n.boundary_kind === "value_shape");
    expect(shapeNotes).toHaveLength(0); // display-only change → NOT a value_shape boundary
    expect(fmtNotes).toHaveLength(1);
    const note = fmtNotes[0]!;
    expect(note.prev_shape).toBe("m/d/yyyy");
    expect(note.new_shape).toBe("d/m/yyyy"); // distinct identities, no "US/UK" naming
    expect(note.last_prev_format_row).toBe(4); // exact transition rows
    expect(note.first_new_format_row).toBe(5);
  });

  it("treats two DIFFERENT cellXfs sharing the SAME formatCode as one identity (no phantom boundary)", () => {
    const styles =
      `<?xml version="1.0"?><styleSheet xmlns="${SML_NS}">` +
      `<numFmts count="2"><numFmt numFmtId="164" formatCode="m/d/yyyy"/><numFmt numFmtId="165" formatCode="m/d/yyyy"/></numFmts>` +
      `<cellXfs count="3"><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0"/><xf numFmtId="165" xfId="0"/></cellXfs></styleSheet>`;
    const sheet =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A4"/><sheetData>` +
      `<row r="1"><c r="A1" s="1"><v>45292</v></c></row>` +
      `<row r="2"><c r="A2" s="1"><v>45293</v></c></row>` +
      `<row r="3"><c r="A3" s="2"><v>45294</v></c></row>` +
      `<row r="4"><c r="A4" s="2"><v>45295</v></c></row>` +
      `</sheetData></worksheet>`;
    const bytes = zipSync({ ...makeMinimalXlsxParts(sheet), "xl/styles.xml": strToU8(styles) });
    const r = buildXlsxInventory({
      sourceRef: "/abs/dupxf.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
      valueTileOpts: TILE_OPTS,
    });
    const col = r.segmented_value_tiles![0]!.columns[0]!;
    expect(col.intra_tile_notes.filter((n) => n.boundary_kind === "display_format")).toHaveLength(0);
  });

  it("sanitizes domain literals out of the format-identity (no quoted text reaches the tile)", () => {
    // A custom currency format carrying a domain literal: "USD"#,##0 — the literal must be stripped.
    const styles =
      `<?xml version="1.0"?><styleSheet xmlns="${SML_NS}">` +
      `<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;USD&quot;#,##0"/></numFmts>` +
      `<cellXfs count="2"><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0"/></cellXfs></styleSheet>`;
    const sheet =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A3"/><sheetData>` +
      `<row r="1"><c r="A1" s="1"><v>1000</v></c></row>` +
      `<row r="2"><c r="A2" s="1"><v>2000</v></c></row>` +
      `<row r="3"><c r="A3" s="1"><v>3000</v></c></row>` +
      `</sheetData></worksheet>`;
    const bytes = zipSync({ ...makeMinimalXlsxParts(sheet), "xl/styles.xml": strToU8(styles) });
    const r = buildXlsxInventory({
      sourceRef: "/abs/cur.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
      valueTileOpts: TILE_OPTS,
    });
    const col = r.segmented_value_tiles![0]!.columns[0]!;
    const allFormatKeys = col.segments.flatMap((s) => Object.keys(s.format_counts));
    expect(allFormatKeys.length).toBeGreaterThan(0);
    for (const k of allFormatKeys) {
      expect(k.toLowerCase()).not.toContain("usd"); // domain literal stripped
      expect(k).not.toContain('"');
    }
    expect(allFormatKeys).toContain("#,##0"); // the sanitized display grammar remains
  });

  it("captures no format dimension when format capture is OFF (formatRows absent) — value-shape only", () => {
    const rows = [["2024-01-01"], ["2024-01-02"], ["2024-01-03"], ["2024-01-04"]];
    const proj: SheetValueTileProjection = projectSegmentedValueTiles({
      sheetName: "S",
      rows,
      caps: DEFAULT_DATA_LAYER_CAPS,
      opts: TILE_OPTS,
    });
    for (const c of proj.columns) {
      expect(c.segments.every((s) => Object.keys(s.format_counts).length === 0)).toBe(true);
      expect(c.segments.every((s) => s.dominant_format === null)).toBe(true);
      expect(c.intra_tile_notes.filter((n) => n.boundary_kind === "display_format")).toHaveLength(0);
    }
  });

  it("surfaces a benign trailing total-row format change as a boundary (FP measured; classification is downstream)", () => {
    // rows 1-5 share xf1 (#,##0); row 6 is a total in xf2 (#,##0.00). The display change IS surfaced
    // (faithful reading) — whether it is a real anomaly is the consumer's call, not the sidecar's.
    const styles =
      `<?xml version="1.0"?><styleSheet xmlns="${SML_NS}">` +
      `<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>` +
      `<cellXfs count="3"><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0"/><xf numFmtId="165" xfId="0"/></cellXfs></styleSheet>`;
    const sheet =
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A6"/><sheetData>` +
      `<row r="1"><c r="A1" s="1"><v>10</v></c></row>` +
      `<row r="2"><c r="A2" s="1"><v>20</v></c></row>` +
      `<row r="3"><c r="A3" s="1"><v>30</v></c></row>` +
      `<row r="4"><c r="A4" s="1"><v>40</v></c></row>` +
      `<row r="5"><c r="A5" s="1"><v>50</v></c></row>` +
      `<row r="6"><c r="A6" s="2"><v>150</v></c></row>` +
      `</sheetData></worksheet>`;
    const bytes = zipSync({ ...makeMinimalXlsxParts(sheet), "xl/styles.xml": strToU8(styles) });
    const r = buildXlsxInventory({
      sourceRef: "/abs/total.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
      valueTileOpts: { window: 5, segmentsPerColumnCap: 256, distinctPerSegmentCap: 32 },
    });
    const col = r.segmented_value_tiles![0]!.columns[0]!;
    const fmtNotes = col.intra_tile_notes.filter((n) => n.boundary_kind === "display_format");
    expect(fmtNotes).toHaveLength(1); // surfaced (not suppressed) — downstream decides if benign
    expect(fmtNotes[0]!.last_prev_format_row).toBe(5);
    expect(fmtNotes[0]!.first_new_format_row).toBe(6);
    expect(fmtNotes[0]!.prev_shape).toBe("#,##0");
    expect(fmtNotes[0]!.new_shape).toBe("#,##0.00");
  });
});

describe("projectInventoryForPrompt — value-tile is reconstruct-only (T8 review scope-out)", () => {
  const STYLES =
    `<?xml version="1.0"?><styleSheet xmlns="${SML_NS}">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="m/d/yyyy"/><numFmt numFmtId="165" formatCode="d/m/yyyy"/></numFmts>` +
    `<cellXfs count="3"><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0"/><xf numFmtId="165" xfId="0"/></cellXfs></styleSheet>`;
  const SHEET =
    `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A4"/><sheetData>` +
    `<row r="1"><c r="A1" s="1"><v>45292</v></c></row>` +
    `<row r="2"><c r="A2" s="1"><v>45293</v></c></row>` +
    `<row r="3"><c r="A3" s="2"><v>45294</v></c></row>` +
    `<row r="4"><c r="A4" s="2"><v>45295</v></c></row>` +
    `</sheetData></worksheet>`;
  const makeInv = () => {
    const bytes = zipSync({ ...makeMinimalXlsxParts(SHEET), "xl/styles.xml": strToU8(STYLES) });
    return buildXlsxInventory({
      sourceRef: "/abs/vt.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
      valueTileOpts: { window: 2, segmentsPerColumnCap: 256, distinctPerSegmentCap: 32 },
    });
  };

  it("producer always carries value tiles + value_tile_config", () => {
    const inv = makeInv();
    expect(inv.segmented_value_tiles).toBeDefined();
    expect(inv.value_tile_config).toBeDefined();
  });

  it("omits value tiles AND value_tile_config from the prompt projection by default (review path)", () => {
    const proj = projectInventoryForPrompt(makeInv());
    expect((proj.inventory as Record<string, unknown>).segmented_value_tiles).toBeUndefined();
    expect((proj.inventory as Record<string, unknown>).value_tile_config).toBeUndefined();
  });

  it("includes value tiles when the caller opts in (reconstruct path), but NEVER value_tile_config", () => {
    const proj = projectInventoryForPrompt(makeInv(), undefined, { includeValueTiles: true });
    expect((proj.inventory as Record<string, unknown>).segmented_value_tiles).toBeDefined();
    expect((proj.inventory as Record<string, unknown>).value_tile_config).toBeUndefined();
  });

  it("bounds the opted-in value tile to boundary witnesses (segments dropped, notes kept)", () => {
    const proj = projectInventoryForPrompt(makeInv(), undefined, { includeValueTiles: true });
    const vt = (proj.inventory as Record<string, unknown>)
      .segmented_value_tiles as SheetValueTileProjection[];
    expect(vt.length).toBeGreaterThan(0);
    for (const sheet of vt) {
      for (const col of sheet.columns) {
        expect(col.intra_tile_notes.length).toBeGreaterThan(0); // only boundary-bearing columns kept
        expect(col.segments).toEqual([]); // verbose per-segment aggregates dropped from the prompt
      }
    }
    const notes = vt.flatMap((s) => s.columns.flatMap((c) => c.intra_tile_notes));
    expect(notes.some((n) => n.boundary_kind === "display_format")).toBe(true); // witness reached prompt
  });
});

describe("P1-C1 deterministic sidecar E2E (inventory → ComprehensionArtifact → reconstruct projection)", () => {
  const STYLES =
    `<?xml version="1.0"?><styleSheet xmlns="${SML_NS}">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="m/d/yyyy"/><numFmt numFmtId="165" formatCode="d/m/yyyy"/></numFmts>` +
    `<cellXfs count="3"><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0"/><xf numFmtId="165" xfId="0"/></cellXfs></styleSheet>`;
  // col A: date serials, DISPLAY-format flips at row 5 (m/d/yyyy → d/m/yyyy); col B: INT → TEXT
  // VALUE-shape flips at row 5. One workbook exercising BOTH boundary kinds end-to-end.
  const SHEET =
    `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:B8"/><sheetData>` +
    `<row r="1"><c r="A1" s="1"><v>45292</v></c><c r="B1"><v>1</v></c></row>` +
    `<row r="2"><c r="A2" s="1"><v>45293</v></c><c r="B2"><v>2</v></c></row>` +
    `<row r="3"><c r="A3" s="1"><v>45294</v></c><c r="B3"><v>3</v></c></row>` +
    `<row r="4"><c r="A4" s="1"><v>45295</v></c><c r="B4"><v>4</v></c></row>` +
    `<row r="5"><c r="A5" s="2"><v>45296</v></c><c r="B5" t="inlineStr"><is><t>x</t></is></c></row>` +
    `<row r="6"><c r="A6" s="2"><v>45297</v></c><c r="B6" t="inlineStr"><is><t>y</t></is></c></row>` +
    `<row r="7"><c r="A7" s="2"><v>45298</v></c><c r="B7" t="inlineStr"><is><t>z</t></is></c></row>` +
    `<row r="8"><c r="A8" s="2"><v>45299</v></c><c r="B8" t="inlineStr"><is><t>w</t></is></c></row>` +
    `</sheetData></worksheet>`;
  const OPTS = { window: 2, segmentsPerColumnCap: 256, distinctPerSegmentCap: 32 };
  const buildInv = () => {
    const bytes = zipSync({ ...makeMinimalXlsxParts(SHEET), "xl/styles.xml": strToU8(STYLES) });
    return buildXlsxInventory({
      sourceRef: "/abs/e2e.xlsx",
      bytes,
      contentSha256: shaBytes(bytes),
      workbookKind: "xlsx",
      valueTileOpts: OPTS,
    });
  };

  it("threads BOTH boundary kinds inventory→artifact→reconstruct prompt (byte-stable); review stays scoped out", () => {
    const inv1 = buildInv();
    const inv2 = buildInv();
    // 1) deterministic + byte-stable across runs
    expect(JSON.stringify(inv1.segmented_value_tiles)).toBe(JSON.stringify(inv2.segmented_value_tiles));

    // 2) ComprehensionArtifact carries both witnesses and validates (fail-closed completeness)
    const artifact = buildDeterministicComprehensionArtifact({ observationId: "obs-e2e", inventory: inv1 });
    const violations: string[] = [];
    validateComprehensionArtifact(artifact, violations);
    expect(violations).toEqual([]);
    const witness = artifact.value_signature_tile_witness as {
      boundaries: Array<{ boundary_kind: string }>;
    };
    expect(witness.boundaries.some((b) => b.boundary_kind === "display_format")).toBe(true);
    expect(witness.boundaries.some((b) => b.boundary_kind === "value_shape")).toBe(true);

    // 3) reconstruct prompt projection REACHES the boundary witnesses (opt-in, bounded)
    const recon = projectInventoryForPrompt(inv1, undefined, { includeValueTiles: true });
    const reconNotes = (
      (recon.inventory as Record<string, unknown>).segmented_value_tiles as SheetValueTileProjection[]
    ).flatMap((s) => s.columns.flatMap((c) => c.intra_tile_notes));
    expect(reconNotes.some((n) => n.boundary_kind === "display_format")).toBe(true);
    expect(reconNotes.some((n) => n.boundary_kind === "value_shape")).toBe(true);

    // 4) review path does NOT receive value tiles (scope-out / byte-stability guard)
    const review = projectInventoryForPrompt(inv1);
    expect((review.inventory as Record<string, unknown>).segmented_value_tiles).toBeUndefined();
  });
});
