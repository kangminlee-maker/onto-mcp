import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  buildCsvInventory,
  buildXlsxInventory,
  DEFAULT_DATA_LAYER_CAPS,
  observeSpreadsheetSource,
  parseCsv,
  projectInventoryForAdmission,
  SPREADSHEET_OBSERVER_ADAPTER_ID,
  type DataLayerCaps,
} from "./spreadsheet-structure-observer.js";

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

  it("emits aggregate distinct_count for categorical columns but NO raw values (CHAN-1)", () => {
    const r = inv(csv);
    const city = r.distinct_value_vocab.find((v) => v.column === "city");
    expect(city).toBeDefined();
    expect(city!.distinct_count).toBe(2); // Seoul, Busan
    expect(city!.distinct_count_is_estimate).toBe(false);
    // CHAN-1: raw values are never emitted by the extractor.
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

describe("projectInventoryForAdmission — channel governance (CHAN-1/CHAN-2)", () => {
  it("strips raw top_values while preserving aggregate distinct counts", () => {
    const inventory = inv("name,role\nAlice,eng\nBob,eng\n");
    // The observer itself never emits top_values; a future data-observation
    // phase might (via the source-safety channel). Simulate that and assert the
    // single shared projection excludes it for every consumer.
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

    // formulas + cross-sheet refs
    expect(r.formula_cells).toHaveLength(1);
    expect(r.formula_cells[0]!.cell).toBe("D2");
    expect(r.formula_cells[0]!.cross_sheet_refs).toContain("Depts");

    // error cells, merged ranges, data validations, named ranges, external links, tables
    expect(r.error_cells.map((e) => e.token)).toContain("#DIV/0!");
    expect(r.merged_ranges.map((m) => m.range)).toContain("A1:B1");
    expect(r.data_validations[0]!.range).toBe("B2:B3");
    expect(r.data_validations[0]!.rule_summary).toContain("list");
    expect(r.named_ranges.map((n) => n.name)).toContain("HeadcountRange");
    expect(r.external_links).toHaveLength(1);
    const table = r.tables.find((t) => t.name === "PeopleTable")!;
    expect(table.sheet).toBe("People");
    expect(table.range).toBe("A1:D3");

    // Channel governance (CHAN-1): raw DATA cell values never appear — only schema
    // (header names), aggregate counts, and structural tokens (formula/error).
    expect(JSON.stringify(r)).not.toContain("Alice");
    expect(JSON.stringify(r)).not.toContain("Bob");
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
    expect(r.formula_cells).toHaveLength(1);
    const refs = r.formula_cells[0]!.cross_sheet_refs;
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

  it("computes cross-sheet key overlap between same-named columns (counts only, CHAN-1)", () => {
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
    // CHAN-1: only counts — no raw key values leak.
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

  it("records shared-formula follower cells, resolving them to the master (R2 #4)", () => {
    const bytes = zipSync(
      makeMinimalXlsxParts(
        `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:A2"/><sheetData>` +
          `<row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A2">Other!A1+1</f><v>2</v></c></row>` +
          `<row r="2"><c r="A2"><f t="shared" si="0"/><v>3</v></c></row>` +
          `</sheetData></worksheet>`,
      ),
    );
    const r = buildXlsxInventory({ sourceRef: "/abs/sf.xlsx", bytes, contentSha256: shaBytes(bytes), workbookKind: "xlsx" });
    expect(r.formula_cells).toHaveLength(2); // master + follower, not just the master
    expect(r.formula_cells.map((f) => f.formula)).toEqual(["Other!A1+1", "Other!A1+1"]);
    expect(r.formula_cells[1]!.cross_sheet_refs).toContain("Other"); // follower keeps the dependency
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
    expect(r.formula_cells[0]!.cross_sheet_refs).toContain("Bob's Sheet"); // unescaped, not "Bob"
  });
});
