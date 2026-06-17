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
});

describe("header detection — offset headers + confidence (deterministic, finding 3)", () => {
  it("finds the header below leading title / blank rows", () => {
    const r = inv("Quarterly Report\n\nname,role,dept\nAlice,eng,core\nBob,eng,core\n");
    const d = r.per_sheet_data[0]!;
    expect(d.layout_kind).toBe("tabular");
    expect(d.header_rows).toEqual([2]); // skipped the title row and the blank row
    expect(d.header_confidence).toBe("high");
    expect(d.columns.map((c) => c.name)).toEqual(["name", "role", "dept"]);
  });

  it("keeps a clean first-row header high confidence", () => {
    const d = inv("name,role\nAlice,eng\nBob,eng\n").per_sheet_data[0]!;
    expect(d.layout_kind).toBe("tabular");
    expect(d.header_rows).toEqual([0]);
    expect(d.header_confidence).toBe("high");
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
