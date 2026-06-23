import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildXlsxInventory,
  observeSpreadsheetSource,
  projectInventoryForAdmission,
  SPREADSHEET_CAPTURE_TRUNCATED_PHRASE,
  SPREADSHEET_MACRO_PRESENT_PHRASE,
  SPREADSHEET_OBSERVER_ADAPTER_ID,
  type WorkbookStructuralInventory,
} from "../spreadsheet-structure-observer.js";
import { strToU8, zipSync } from "fflate";
import { buildSpreadsheetObservationSummary } from "./materialize-preparation.js";
import {
  validateSourceObservationBoundary,
  type ReconstructSourceObservation,
} from "./source-observations.js";

describe("validateSourceObservationBoundary", () => {
  it("accepts structural observations", () => {
    const result = validateSourceObservationBoundary({
      observation_id: "obs_spreadsheet_formula_1",
      target_material_kind: "spreadsheet",
      adapter_id: "minimal-spreadsheet-structure-observer",
      source_ref: "/tmp/workbook.xlsx",
      location: "Sheet1:B12",
      summary: "Cell B12 contains a SUM formula referencing B2:B11.",
      structural_data: {
        cell: "B12",
        formula: "=SUM(B2:B11)",
        precedents: ["B2:B11"],
      },
    });

    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("rejects ontology claims in source observations", () => {
    const result = validateSourceObservationBoundary({
      observation_id: "obs_code_1",
      target_material_kind: "code",
      adapter_id: "minimal-code-structure-observer",
      source_ref: "/tmp/payment.ts",
      location: "payment.ts:14",
      summary: "Payment is an aggregate root.",
      structural_data: {
        entity: "Payment",
        fields: ["status", "amount"],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      "structural_data contains semantic key: entity",
    );
    expect(result.violations).toContain(
      "summary contains prohibited ontology interpretation: aggregate root",
    );
  });
});

// ───────────────────────── P6: spreadsheet honesty/provenance gate ─────────────────────────

const VALID_SHA = "a".repeat(64);

/** A baseline SUPPORTED inventory (one real sheet) matching the producer shape.
 *  Override one field per test. */
function makeInventory(
  overrides: Partial<WorkbookStructuralInventory> = {},
): WorkbookStructuralInventory {
  return {
    adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
    adapter_version: 2,
    source_ref: "/tmp/workbook.xlsx",
    content_sha256: VALID_SHA,
    workbook_kind: "xlsx",
    inspection_method: "structure_inspected_only",
    sheets: [
      { name: "Sheet1", used_range: "R1C1:R10C3", dimensions: { rows: 10, cols: 3 }, hidden: false, protected: false },
    ],
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
    per_sheet_data: [
      { sheet: "Sheet1", layout_kind: "tabular", header_rows: [1], header_confidence: "high", columns: [{ name: "id", index: 0, inferred_type: "integer", non_empty_ratio: 1, distinct_count: 3, distinct_count_is_estimate: false, non_empty_count: 3 }] },
    ],
    distinct_value_vocab: [],
    cross_sheet_key_overlap: [],
    data_layer_caps: {
      max_rows_scanned_per_sheet: 100_000,
      max_distinct_tracked_per_column: 256,
      max_columns_profiled: 512,
      max_sheet_pairs: 64,
      max_sheets_observed: 2048,
    },
    capture_truncated: false,
    unsupported_reason: null,
    ...overrides,
  };
}

// Build the summary via the REAL producer fn (not a test re-implementation) so the
// emit branch is what the gate is checked against — deleting a phrase push in the
// builder would now break these tests (the emit/assert binding is genuinely covered).
function spreadsheetObservation(
  inventory: WorkbookStructuralInventory,
  summary: string = buildSpreadsheetObservationSummary("workbook.xlsx", inventory),
): ReconstructSourceObservation {
  return {
    observation_id: "obs_spreadsheet_1",
    target_material_kind: "spreadsheet",
    adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
    source_ref: inventory.source_ref,
    location: inventory.source_ref,
    summary,
    // content_sha256 is surfaced top-level (the field the source-scout-pack
    // provenance consumer binds to), mirroring buildSpreadsheetSourceObservation.
    structural_data: {
      content_sha256: inventory.content_sha256,
      workbook_inventory: inventory,
    },
  };
}

describe("validateSourceObservationBoundary — P6 spreadsheet honesty gate", () => {
  // ── Positive must-pass: legitimate states the observer emits MUST NOT crash the
  //    gate. The validator throws inside the builder, before the materialize loop's
  //    graceful skip-demotion, so a false positive here = a hard run crash. ──

  it("passes a supported workbook with a well-formed content hash", () => {
    const result = validateSourceObservationBoundary(
      spreadsheetObservation(makeInventory()),
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("passes the empty-csv inventory (unsupported_reason + a zero-dimension placeholder sheet)", () => {
    const inventory = makeInventory({
      workbook_kind: "csv",
      sheets: [
        { name: "sheet1", used_range: null, dimensions: { rows: 0, cols: 0 }, hidden: false, protected: false },
      ],
      per_sheet_data: [
        { sheet: "sheet1", layout_kind: "unknown", header_rows: null, header_confidence: "low", columns: [] },
      ],
      unsupported_reason: "empty csv (no rows)",
    });
    const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
    expect(result.valid).toBe(true);
  });

  it("passes the oversized/unreadable unsupported inventory (sheets: [] with an empty hash)", () => {
    const inventory = makeInventory({
      content_sha256: "",
      sheets: [],
      per_sheet_data: [],
      unsupported_reason: "source too large for in-process inspection",
    });
    const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
    expect(result.valid).toBe(true);
  });

  it("passes an unsupported-format inventory (.xls: real hash, no inspected structure)", () => {
    const inventory = makeInventory({
      workbook_kind: "xls",
      sheets: [],
      per_sheet_data: [],
      unsupported_reason: "unsupported workbook format: .xls (BIFF)",
    });
    const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
    expect(result.valid).toBe(true);
  });

  it("passes a supported workbook with capture_truncated disclosed in the summary", () => {
    const result = validateSourceObservationBoundary(
      spreadsheetObservation(makeInventory({ capture_truncated: true })),
    );
    expect(result.valid).toBe(true);
  });

  it("passes a supported workbook with macro_present disclosed in the summary", () => {
    const result = validateSourceObservationBoundary(
      spreadsheetObservation(makeInventory({ macro_present: true })),
    );
    expect(result.valid).toBe(true);
  });

  // ── Negative: each assertion fires on a genuinely incoherent observation. ──

  it("B: rejects a supported workbook with a blank top-level content_sha256", () => {
    const inventory = makeInventory({ content_sha256: "" });
    const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
    expect(result.valid).toBe(false);
    expect(result.violations).toContain("content_sha256_missing");
  });

  it("B: rejects a supported workbook with a non-hex content_sha256", () => {
    const inventory = makeInventory({ content_sha256: "NOT-A-HASH" });
    const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
    expect(result.valid).toBe(false);
    expect(result.violations).toContain("content_sha256_missing");
  });

  // C: an unsupported inventory must not claim inspected structure across the FULL
  // surface. Each case neutralizes `sheets` (zero-dim) and per_sheet_data columns so
  // the ONLY inspected-structure signal is the one surface under test — otherwise the
  // helper's first `sheets` clause short-circuits and the per-surface coverage is
  // illusory (the producer never emits these incoherent states, but the gate must
  // catch a fabricated/corrupted inventory on EACH surface).
  const C_SURFACES: Array<[string, Partial<WorkbookStructuralInventory>]> = [
    ["sheets non-zero dims", { sheets: [{ name: "S", used_range: "R1C1:R2C2", dimensions: { rows: 2, cols: 2 }, hidden: false, protected: false }] }],
    ["named_ranges", { named_ranges: [{ name: "Rng", scope: "workbook", refers_to: "S!A1" }] }],
    ["tables", { tables: [{ name: "T", sheet: "S", range: "A1:B2" }] }],
    ["pivot_tables", { pivot_tables: [{ name: "P", sheet: "S", location: "A1", source_sheet: null, source_ref: null, row_fields: [], column_fields: [], page_fields: [], data_fields: [] }] }],
    ["formula_patterns", { formula_patterns: [{ pattern: "=SUM(A:A)", sample_cell: "B2", occurrence_count: 1, applied_ranges: ["B2"], sheets: ["S"], cross_sheet_refs: [] }] }],
    ["merged_ranges", { merged_ranges: [{ sheet: "S", range: "A1:B1" }] }],
    ["data_validations", { data_validations: [{ sheet: "S", range: "A1", rule_summary: "list", validation_type: "list", members_truncated: false, applies_to_columns: [0] }] }],
    ["external_links", { external_links: [{ target: "other.xlsx", kind: "external" }] }],
    ["error_cells", { error_cells: [{ sheet: "S", cell: "C3", token: "#REF!" }] }],
    ["distinct_value_vocab", { distinct_value_vocab: [{ sheet: "S", column: "id", distinct_count: 3, distinct_count_is_estimate: false }] }],
    ["cross_sheet_key_overlap", { cross_sheet_key_overlap: [{ key_name: "id", sheets: ["S", "T"], pairwise_overlap: [{ a: "S", b: "T", count: 2 }] }] }],
    ["risk_signals", { risk_signals: [{ kind: "external_links_present", location: "book", literal: "1 link" }] }],
    ["per_sheet_data columns", { per_sheet_data: [{ sheet: "S", layout_kind: "tabular", header_rows: [1], header_confidence: "high", columns: [{ name: "id", index: 0, inferred_type: "integer", non_empty_ratio: 1, distinct_count: 3, distinct_count_is_estimate: false, non_empty_count: 3 }] }] }],
  ];
  for (const [surface, override] of C_SURFACES) {
    it(`C: rejects an unsupported inventory claiming inspected structure via ${surface}`, () => {
      const inventory = makeInventory({
        unsupported_reason: "unsupported workbook format: .xls (BIFF)",
        sheets: [{ name: "S", used_range: null, dimensions: { rows: 0, cols: 0 }, hidden: false, protected: false }],
        per_sheet_data: [{ sheet: "S", layout_kind: "unknown", header_rows: null, header_confidence: "low", columns: [] }],
        ...override,
      });
      const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
      expect(result.valid).toBe(false);
      expect(result.violations).toContain(
        "unsupported spreadsheet inventory must not claim inspected structure",
      );
    });
  }

  it("D: rejects capture_truncated when the summary does not disclose it", () => {
    const inventory = makeInventory({ capture_truncated: true });
    const result = validateSourceObservationBoundary(
      spreadsheetObservation(inventory, "spreadsheet workbook observed — 1 sheet(s), structure_inspected_only"),
    );
    expect(result.valid).toBe(false);
    expect(result.violations).toContain("capture_truncated not disclosed in observation summary");
  });

  it("D: rejects macro_present when the summary does not disclose it", () => {
    const inventory = makeInventory({ macro_present: true });
    const result = validateSourceObservationBoundary(
      spreadsheetObservation(inventory, "spreadsheet workbook observed — 1 sheet(s), structure_inspected_only"),
    );
    expect(result.valid).toBe(false);
    expect(result.violations).toContain("macro_present not disclosed in observation summary");
  });

  it("rejects a spreadsheet observation that carries no workbook_inventory", () => {
    const result = validateSourceObservationBoundary({
      observation_id: "obs_spreadsheet_1",
      target_material_kind: "spreadsheet",
      adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
      source_ref: "/tmp/workbook.xlsx",
      location: "/tmp/workbook.xlsx",
      summary: "spreadsheet workbook observed — structure_inspected_only",
      structural_data: { content_sha256: VALID_SHA },
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      "spreadsheet observation must carry a workbook_inventory in structural_data",
    );
  });

  it("rejects a present-but-blank unsupported_reason (Codex P2)", () => {
    // A blank reason would skip the supported hash check yet not demote downstream,
    // admitting a no-evidence workbook. The gate must flag the incoherent blank.
    const inventory = makeInventory({ unsupported_reason: "" });
    const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
    expect(result.valid).toBe(false);
    expect(result.violations).toContain("unsupported_reason must not be blank");
  });

  it("rejects an array workbook_inventory payload (Codex P2)", () => {
    const result = validateSourceObservationBoundary({
      observation_id: "obs_spreadsheet_1",
      target_material_kind: "spreadsheet",
      adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
      source_ref: "/tmp/workbook.xlsx",
      location: "/tmp/workbook.xlsx",
      summary: "spreadsheet workbook observed — structure_inspected_only",
      structural_data: { content_sha256: VALID_SHA, workbook_inventory: [] },
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      "spreadsheet observation must carry a workbook_inventory in structural_data",
    );
  });

  it("rejects a top-level content_sha256 that disagrees with the inventory hash (Codex P2)", () => {
    const inventory = makeInventory({ content_sha256: "a".repeat(64) });
    const result = validateSourceObservationBoundary({
      observation_id: "obs_spreadsheet_1",
      target_material_kind: "spreadsheet",
      adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
      source_ref: inventory.source_ref,
      location: inventory.source_ref,
      summary: buildSpreadsheetObservationSummary("workbook.xlsx", inventory),
      // Corrupted envelope: top-level hash names different bytes than the nested
      // inventory hash (which is what gets projected into the prompt).
      structural_data: { content_sha256: "b".repeat(64), workbook_inventory: inventory },
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      "content_sha256 disagrees with workbook_inventory hash",
    );
  });

  it("does not apply spreadsheet honesty checks to the generic minimal observer", () => {
    // The generic minimal-spreadsheet observer (no real extraction) must be
    // unaffected: it carries no workbook_inventory and a UTF-8 text hash, neither
    // of which the spreadsheet gate should judge.
    const result = validateSourceObservationBoundary({
      observation_id: "obs_min_1",
      target_material_kind: "spreadsheet",
      adapter_id: "minimal-spreadsheet-structure-observer",
      source_ref: "/tmp/workbook.xlsx",
      location: "/tmp/workbook.xlsx",
      summary: "minimal structural observation",
      structural_data: { content_excerpt: "a,b,c" },
    });
    expect(result.valid).toBe(true);
  });

  // ── design-C value-aware bound (members are the only value-bearing field). ──

  it("passes a list validation carrying bounded inline enum members", () => {
    const inventory = makeInventory({
      data_validations: [
        { sheet: "S", range: "A1:A9", rule_summary: 'type=list; formula1="a,b"', validation_type: "list", members: ["a", "b"], members_truncated: false, applies_to_columns: [0] },
      ],
    });
    const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
    expect(result.valid).toBe(true);
  });

  it("rejects members present on a non-list validation_type (forged/incoherent)", () => {
    const inventory = makeInventory({
      data_validations: [
        { sheet: "S", range: "A1:A9", rule_summary: "type=whole", validation_type: "whole", members: ["a", "b"], members_truncated: false, applies_to_columns: [0] },
      ],
    });
    const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      "data_validation members present but validation_type is not 'list'",
    );
  });

  it("rejects members exceeding the count cap", () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `m${i}`);
    const inventory = makeInventory({
      data_validations: [
        { sheet: "S", range: "A1:A9", rule_summary: "type=list", validation_type: "list", members: tooMany, members_truncated: false, applies_to_columns: [0] },
      ],
    });
    const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      "data_validation members exceed VALIDATION_MEMBER_COUNT_CAP",
    );
  });

  it("rejects a member exceeding the char cap", () => {
    const inventory = makeInventory({
      data_validations: [
        { sheet: "S", range: "A1:A9", rule_summary: "type=list", validation_type: "list", members: ["x".repeat(65)], members_truncated: false, applies_to_columns: [0] },
      ],
    });
    const result = validateSourceObservationBoundary(spreadsheetObservation(inventory));
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      "data_validation member exceeds VALIDATION_MEMBER_CHAR_CAP",
    );
  });
});

// Integration: REAL producer output (observeSpreadsheetSource / buildXlsxInventory)
// through the real summary builder and the gate — proves the gate accepts the actual
// inventory shapes the observer emits, not just hand-crafted fixtures (the C-recon F1
// "fixture diverges from reality" trap). Mirrors buildSpreadsheetSourceObservation's
// envelope (top-level content_sha256 + admission-projected inventory + real summary).
describe("validateSourceObservationBoundary — P6 real producer output passes the gate", () => {
  const tmp = path.join(os.tmpdir(), `onto-p6-gate-${process.pid}`);
  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  function realObservation(
    ref: string,
    raw: WorkbookStructuralInventory,
  ): ReconstructSourceObservation {
    const inventory = projectInventoryForAdmission(raw);
    return {
      observation_id: "obs_real",
      target_material_kind: "spreadsheet",
      adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
      source_ref: ref,
      location: ref,
      summary: buildSpreadsheetObservationSummary(path.basename(ref), inventory),
      structural_data: {
        content_sha256: inventory.content_sha256,
        workbook_inventory: inventory,
      },
    };
  }

  async function writeTmp(name: string, bytes: Uint8Array | string): Promise<string> {
    await fs.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, name);
    await fs.writeFile(file, bytes);
    return file;
  }

  it("accepts a real non-empty CSV observation (supported, real content hash)", async () => {
    const file = await writeTmp("data.csv", "id,name\n1,alice\n2,bob\n");
    const result = validateSourceObservationBoundary(
      realObservation(file, await observeSpreadsheetSource(file)),
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("accepts a real empty CSV observation (unsupported, no crash)", async () => {
    const file = await writeTmp("empty.csv", "");
    const result = validateSourceObservationBoundary(
      realObservation(file, await observeSpreadsheetSource(file)),
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a real unsupported-format (.xls) observation", async () => {
    const file = await writeTmp("legacy.xls", Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
    const result = validateSourceObservationBoundary(
      realObservation(file, await observeSpreadsheetSource(file)),
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a real macro xlsx and discloses macro_present in the summary", () => {
    const ns = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const relsNs = "http://schemas.openxmlformats.org/package/2006/relationships";
    const wsType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
    const bytes = zipSync({
      "xl/workbook.xml": strToU8(`<?xml version="1.0"?><workbook ${ns}><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="${relsNs}"><Relationship Id="rId1" Type="${wsType}" Target="worksheets/sheet1.xml"/></Relationships>`),
      "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0"?><worksheet ${ns}><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>name</t></is></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`),
      "xl/vbaProject.bin": strToU8("fake-vba-binary"),
    });
    const raw = buildXlsxInventory({
      sourceRef: "/abs/macro.xlsx",
      bytes,
      contentSha256: crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex"),
      workbookKind: "xlsx",
    });
    expect(raw.macro_present).toBe(true);
    const observation = realObservation("/abs/macro.xlsx", raw);
    expect(observation.summary).toContain(SPREADSHEET_MACRO_PRESENT_PHRASE);
    const result = validateSourceObservationBoundary(observation);
    expect(result.valid).toBe(true);
  });
});
