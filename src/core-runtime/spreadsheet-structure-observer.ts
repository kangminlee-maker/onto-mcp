// Spreadsheet structure observer (S1 — design:
// development-records/design/20260617-spreadsheet-extraction-adapter-s1-design.md).
//
// L1 format adapter: turns a workbook into a deterministic, runtime-owned
// `WorkbookStructuralInventory`. This is the missing "readable representation"
// layer that lets onto observe spreadsheet material at all (see §2.1a). It is
// LLM-FREE: it answers only "what does the workbook structurally contain", never
// "what does it mean" (the seam/seed stages own meaning).
//
// Shared cross-pipeline runtime (consumed by reconstruct + review), so it lives
// at the top level of core-runtime alongside target-material-kind.ts rather than
// under a pipeline subdir (repo-layout.md; import-boundary).
//
// This file ships P0 (the inventory type + envelope), P1 (the pure-Node,
// zero-dependency CSV extractor) and P4 (xlsx/xlsm via the bundled read-only
// fflate + saxes stack — streaming unzip + SAX, design §11.2). xls (BIFF) and
// ods (a different ZIP/XML schema) still return `unsupported_reason`.
//
// Capability boundary (design §1.2, §10 C′): extraction here is deterministic and
// uses only deterministic heuristics for the judgment calls (header detection,
// column typing, categorical detection). LLM escalation for ambiguous layouts is
// a separate, named step (design §10 / §11 ESC-1) and is NOT part of this module.
//
// Honesty / channel governance (design §11 CHAN-1): the data-observation layer is
// aggregate-counts-only by default — `distinct_value_vocab` carries `distinct_count`
// but NOT raw `top_values`, and no raw sample rows are emitted. Raw values only ever
// reach a prompt through the source-safety channel at the seam stage, never from here.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync, type Unzipped, type UnzipFileInfo } from "fflate";
import { SaxesParser, type SaxesTagPlain } from "saxes";

export const SPREADSHEET_OBSERVER_ADAPTER_ID = "spreadsheet-structure-observer";
export const SPREADSHEET_OBSERVER_ADAPTER_VERSION = 1;

export type WorkbookKind = "xlsx" | "xlsm" | "csv" | "tsv" | "xls" | "ods";

export type SheetLayoutKind =
  | "tabular"
  | "pivot_or_crosstab"
  | "matrix_no_header"
  | "unknown";

export type InferredColumnType =
  | "integer"
  | "number"
  | "date"
  | "boolean"
  | "string"
  | "empty";

/** Caps for the data-observation layer (design §2.4 CAPS-1). Recorded in the
 *  inventory and folded into the P0.5 replay cache key (design §10.4 CACHE-1). */
export interface DataLayerCaps {
  max_rows_scanned_per_sheet: number;
  max_distinct_tracked_per_column: number;
  max_columns_profiled: number;
  max_sheet_pairs: number;
}

export const DEFAULT_DATA_LAYER_CAPS: DataLayerCaps = {
  max_rows_scanned_per_sheet: 100_000,
  max_distinct_tracked_per_column: 256,
  max_columns_profiled: 512,
  max_sheet_pairs: 64,
};

export interface InventorySheet {
  name: string;
  used_range: string | null;
  dimensions: { rows: number; cols: number };
  hidden: boolean;
  protected: boolean;
}

export interface InventoryColumn {
  name: string;
  index: number;
  inferred_type: InferredColumnType;
  non_empty_ratio: number;
}

export interface PerSheetData {
  sheet: string;
  layout_kind: SheetLayoutKind;
  /** Multi-row / merged headers are representable; null = no header row
   *  (design §2.4 SCHEMA-1). columns[] is only asserted when layout_kind=tabular. */
  header_rows: number[] | null;
  columns: InventoryColumn[];
}

export interface DistinctValueVocabEntry {
  sheet: string;
  column: string;
  /** Aggregate count only (design §11 CHAN-1). If the distinct set hit the cap,
   *  this is a ">= cap" lower-bound estimate. */
  distinct_count: number;
  distinct_count_is_estimate: boolean;
  /** Raw values are intentionally absent by default — they may only be populated
   *  downstream through the source-safety channel, never by this extractor. */
  top_values?: Array<{ value: string; count: number }>;
}

export interface CrossSheetKeyOverlap {
  key_name: string;
  sheets: string[];
  pairwise_overlap: Array<{ a: string; b: string; count: number }>;
}

export interface InventoryRiskSignal {
  kind: string;
  location: string;
  /** Recorded literally, without diagnosis (design §2.2 / profile Prohibited Interpretation). */
  literal: string;
}

/** Runtime-owned canonical artifact (design §2.2). The envelope fields
 *  (adapter_id/version, source_ref, content_sha256, workbook_kind,
 *  inspection_method, unsupported_reason) are kind-agnostic; the rest is the
 *  spreadsheet realization. */
export interface WorkbookStructuralInventory {
  adapter_id: string;
  adapter_version: number;
  source_ref: string;
  /** Raw-byte hash of the source (design §11 HASH-1 — NOT the UTF-8-text hash
   *  textStats uses). Treated downstream as an opaque string. */
  content_sha256: string;
  workbook_kind: WorkbookKind;
  inspection_method: "structure_inspected_only";
  sheets: InventorySheet[];
  named_ranges: Array<{ name: string; scope: string; refers_to: string }>;
  tables: Array<{ name: string; sheet: string; range: string }>;
  formula_cells: Array<{ sheet: string; cell: string; formula: string; cross_sheet_refs: string[] }>;
  merged_ranges: Array<{ sheet: string; range: string }>;
  data_validations: Array<{ sheet: string; range: string; rule_summary: string }>;
  external_links: Array<{ target: string; kind: string }>;
  error_cells: Array<{ sheet: string; cell: string; token: string }>;
  macro_present: boolean;
  risk_signals: InventoryRiskSignal[];
  per_sheet_data: PerSheetData[];
  distinct_value_vocab: DistinctValueVocabEntry[];
  cross_sheet_key_overlap: CrossSheetKeyOverlap[];
  data_layer_caps: DataLayerCaps;
  capture_truncated: boolean;
  unsupported_reason: string | null;
}

// ───────────────────────── P1: CSV extractor (pure Node, zero-dep) ─────────────────────────

const CSV_DELIMITERS = [",", "\t", ";"] as const;
type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

/** Pick the delimiter with the most occurrences on the first physical line
 *  (deterministic; comma wins ties by being first). */
function detectDelimiter(text: string): CsvDelimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best: CsvDelimiter = ",";
  let bestCount = -1;
  for (const d of CSV_DELIMITERS) {
    // Count only outside of the first cell's quotes is overkill for detection;
    // a raw count is a stable, good-enough heuristic for the delimiter choice.
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC4180-ish parser: quoted fields, "" escapes, embedded delimiters/newlines.
 *  Stops after `maxRows` parsed records (caps); reports whether more remained. */
export function parseCsv(
  text: string,
  delimiter: CsvDelimiter,
  maxRows: number,
): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let rowStarted = false;
  let truncated = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    rowStarted = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
    const ch = text[i];
    rowStarted = true;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      pushRow();
    } else {
      field += ch;
    }
  }
  // Flush trailing field/row unless we stopped on a clean row boundary.
  if (rows.length < maxRows && (rowStarted || field.length > 0 || row.length > 0)) {
    pushRow();
  }
  return { rows, truncated };
}

const INTEGER_RE = /^-?\d+$/;
const NUMBER_RE = /^-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?$/;
const BOOLEAN_RE = /^(?:true|false)$/i;
// Conservative date shapes: ISO (2026-06-17), and common slash/dot dates.
const DATE_RE = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$|^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/;

function classifyValue(raw: string): Exclude<InferredColumnType, "empty"> {
  const v = raw.trim();
  if (BOOLEAN_RE.test(v)) return "boolean";
  if (INTEGER_RE.test(v)) return "integer";
  if (NUMBER_RE.test(v)) return "number";
  if (DATE_RE.test(v)) return "date";
  return "string";
}

/** A header row, deterministically: every cell non-empty AND at least one cell
 *  is non-numeric (a pure-numeric first row is data, not a header). */
function looksLikeHeader(cells: string[]): boolean {
  if (cells.length === 0) return false;
  let sawNonNumeric = false;
  for (const c of cells) {
    const t = c.trim();
    if (t.length === 0) return false;
    const kind = classifyValue(t);
    if (kind !== "integer" && kind !== "number") sawNonNumeric = true;
  }
  return sawNonNumeric;
}

function sha256Hex(bytes: Buffer | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

interface SheetRowProfile {
  layout_kind: SheetLayoutKind;
  header_rows: number[] | null;
  columns: InventoryColumn[];
  distinct_value_vocab: DistinctValueVocabEntry[];
  risk_signals: InventoryRiskSignal[];
  data_layer_truncated: boolean;
  col_count: number;
  row_count: number;
}

/** Deterministic per-sheet data profiling shared by every format (csv = one
 *  sheet; xlsx = one call per sheet). Given the already-parsed cell grid (header
 *  + data rows, already bounded by the row cap upstream), derive header detection,
 *  column types, aggregate distinct counts, and ragged-row risk signals. Holds NO
 *  raw values beyond bounded distinct sets it counts internally (CHAN-1). */
function profileSheetRows(args: {
  sheetName: string;
  rows: string[][];
  caps: DataLayerCaps;
}): SheetRowProfile {
  const { sheetName, rows, caps } = args;
  if (rows.length === 0) {
    return {
      layout_kind: "unknown",
      header_rows: null,
      columns: [],
      distinct_value_vocab: [],
      risk_signals: [],
      data_layer_truncated: false,
      col_count: 0,
      row_count: 0,
    };
  }

  const headerCells = rows[0] ?? [];
  const hasHeader = looksLikeHeader(headerCells);
  const headerRows = hasHeader ? [0] : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const profiledCols = Math.min(colCount, caps.max_columns_profiled);

  const columnName = (idx: number): string => {
    const raw = hasHeader ? (headerCells[idx] ?? "").trim() : "";
    return raw.length > 0 ? raw : `col_${idx + 1}`;
  };

  // Ragged rows (inconsistent column count) recorded literally, capped.
  const risk_signals: InventoryRiskSignal[] = [];
  const RAGGED_CAP = 20;
  for (let r = 0; r < dataRows.length && risk_signals.length < RAGGED_CAP; r += 1) {
    const dr = dataRows[r];
    if (dr && dr.length !== colCount) {
      risk_signals.push({
        kind: "ragged_row",
        location: `${sheetName}:row ${r + (hasHeader ? 2 : 1)}`,
        literal: `${dr.length} cols vs ${colCount}`,
      });
    }
  }

  const columns: InventoryColumn[] = [];
  const distinct_value_vocab: DistinctValueVocabEntry[] = [];
  let dataLayerTruncated = false;

  for (let c = 0; c < profiledCols; c += 1) {
    const typeCounts = new Map<InferredColumnType, number>();
    const distinct = new Set<string>();
    let distinctEstimate = false;
    let nonEmpty = 0;
    for (const dr of dataRows) {
      const cell = (dr[c] ?? "").trim();
      if (cell.length === 0) continue;
      nonEmpty += 1;
      const kind = classifyValue(cell);
      typeCounts.set(kind, (typeCounts.get(kind) ?? 0) + 1);
      if (distinct.size < caps.max_distinct_tracked_per_column) {
        distinct.add(cell);
      } else if (!distinct.has(cell)) {
        distinctEstimate = true;
      }
    }
    // Majority type among non-empty values; empty column → "empty".
    let inferred: InferredColumnType = "empty";
    let bestCount = 0;
    // Deterministic tie-break by the fixed enum order below.
    for (const t of ["string", "date", "number", "integer", "boolean"] as InferredColumnType[]) {
      const n = typeCounts.get(t) ?? 0;
      if (n > bestCount) {
        bestCount = n;
        inferred = t;
      }
    }
    const denom = dataRows.length === 0 ? 0 : nonEmpty / dataRows.length;
    columns.push({
      name: columnName(c),
      index: c,
      inferred_type: inferred,
      non_empty_ratio: Math.round(denom * 1000) / 1000,
    });

    // Categorical → controlled-vocab candidate. Deterministic rule: a bounded,
    // repeating set of non-unique values. AGGREGATE COUNT ONLY (CHAN-1): no raw
    // top_values are emitted here.
    if (distinctEstimate) {
      // Hit the distinct cap → count is a lower-bound estimate; flag truncation (CAPS-1).
      dataLayerTruncated = true;
      distinct_value_vocab.push({
        sheet: sheetName,
        column: columnName(c),
        distinct_count: caps.max_distinct_tracked_per_column,
        distinct_count_is_estimate: true,
      });
    } else if (nonEmpty > 0 && distinct.size >= 1 && distinct.size <= 50 && distinct.size < nonEmpty) {
      distinct_value_vocab.push({
        sheet: sheetName,
        column: columnName(c),
        distinct_count: distinct.size,
        distinct_count_is_estimate: false,
      });
    }
  }

  const layout: SheetLayoutKind = hasHeader ? "tabular" : "matrix_no_header";
  return {
    layout_kind: layout,
    header_rows: headerRows,
    columns: layout === "tabular" ? columns : [],
    distinct_value_vocab,
    risk_signals,
    data_layer_truncated: dataLayerTruncated,
    col_count: colCount,
    row_count: rows.length,
  };
}

/** Build the inventory from already-read CSV text. Pure & deterministic:
 *  identical (sourceRef, content, contentSha256, caps) → identical inventory. */
export function buildCsvInventory(args: {
  sourceRef: string;
  content: string;
  contentSha256: string;
  caps?: DataLayerCaps;
}): WorkbookStructuralInventory {
  const caps = args.caps ?? DEFAULT_DATA_LAYER_CAPS;
  const sheetName = path.basename(args.sourceRef);
  const delimiter = detectDelimiter(args.content);
  // +1 so a header row never eats into the data-row scan budget.
  const { rows, truncated: rowsTruncated } = parseCsv(
    args.content,
    delimiter,
    caps.max_rows_scanned_per_sheet + 1,
  );

  const envelope = {
    adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
    adapter_version: SPREADSHEET_OBSERVER_ADAPTER_VERSION,
    source_ref: path.resolve(args.sourceRef),
    content_sha256: args.contentSha256,
    workbook_kind: (delimiter === "\t" ? "tsv" : "csv") as WorkbookKind,
    inspection_method: "structure_inspected_only" as const,
    named_ranges: [],
    tables: [],
    formula_cells: [],
    merged_ranges: [],
    data_validations: [],
    external_links: [],
    error_cells: [],
    macro_present: false,
    cross_sheet_key_overlap: [] as CrossSheetKeyOverlap[], // single logical sheet
    data_layer_caps: caps,
  };

  if (rows.length === 0) {
    return {
      ...envelope,
      sheets: [{ name: sheetName, used_range: null, dimensions: { rows: 0, cols: 0 }, hidden: false, protected: false }],
      risk_signals: [],
      per_sheet_data: [{ sheet: sheetName, layout_kind: "unknown", header_rows: null, columns: [] }],
      distinct_value_vocab: [],
      capture_truncated: rowsTruncated,
      unsupported_reason: "empty csv (no rows)",
    };
  }

  const profile = profileSheetRows({ sheetName, rows, caps });
  const colsTruncated = profile.col_count > caps.max_columns_profiled;

  return {
    ...envelope,
    sheets: [
      {
        name: sheetName,
        used_range: `R1C1:R${profile.row_count}C${profile.col_count}`,
        dimensions: { rows: profile.row_count, cols: profile.col_count },
        hidden: false,
        protected: false,
      },
    ],
    risk_signals: profile.risk_signals,
    per_sheet_data: [
      {
        sheet: sheetName,
        layout_kind: profile.layout_kind,
        header_rows: profile.header_rows,
        columns: profile.columns,
      },
    ],
    distinct_value_vocab: profile.distinct_value_vocab,
    capture_truncated: rowsTruncated || colsTruncated || profile.data_layer_truncated,
    unsupported_reason: null,
  };
}

// ───────────────────────── P4: xlsx/xlsm extractor (fflate + saxes) ─────────────────────────
//
// Read-only OOXML structure extraction. We stream-decompress only the XML parts
// we parse (filter), guard each entry with a decompressed-byte budget (zip-bomb
// defense), and bound the per-sheet cell scan by data_layer_caps with early-exit
// (cell VALUE work stops at the row cap; structural parts after <sheetData> —
// mergeCells/dataValidations/sheetProtection — are still captured). No writing,
// no formula recalculation, no whole-workbook object model.

/** Per-entry decompressed-size budget. A single XML part larger than this is
 *  skipped (capture_truncated + risk signal) rather than inflated into memory. */
const XLSX_PER_ENTRY_BYTE_BUDGET = 64 * 1024 * 1024;

const XLSX_FORMULA_CAP = 5000;
const XLSX_MERGE_CAP = 2000;
const XLSX_DATAVALIDATION_CAP = 1000;
const XLSX_ERROR_CELL_CAP = 1000;

type SaxAttributes = Record<string, string>;
function attrsOf(node: SaxesTagPlain): SaxAttributes {
  return node.attributes as SaxAttributes;
}

/** "A"→0, "Z"→25, "AA"→26 (0-based column index). */
function columnLettersToIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i += 1) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

/** "A1" / "$A$1" → { col, row } (0-based col, 1-based row); null if unparseable. */
function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref);
  if (!m) return null;
  return { col: columnLettersToIndex(m[1]!), row: parseInt(m[2]!, 10) };
}

/** "A1:G100" / "A1" → { rows, cols }; null if unparseable. */
function parseRangeDims(ref: string): { rows: number; cols: number } | null {
  const parts = ref.split(":");
  const a = parseCellRef((parts[0] ?? "").trim());
  const b = parseCellRef((parts[parts.length - 1] ?? "").trim());
  if (!a || !b) return null;
  return { rows: Math.max(a.row, b.row), cols: Math.max(a.col, b.col) + 1 };
}

/** Sheet names referenced by a formula via the `Sheet!`/`'Sheet Name'!` prefix
 *  (a cross-sheet relationship signal), excluding self-references. */
function extractCrossSheetRefs(formula: string, currentSheet: string): string[] {
  const refs = new Set<string>();
  // Unicode-aware (sheet names are commonly non-ASCII, e.g. Korean). The
  // negative lookbehind drops Excel error tokens like `#REF!` (a `#`-prefixed
  // name followed by `!` is an error, not a sheet reference).
  const re = /(?<!#)(?:'([^']+)'|([\p{L}_][\p{L}\p{N}_.]*))!/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    const name = (m[1] ?? m[2] ?? "").replace(/''/g, "'");
    if (name && name !== currentSheet) refs.add(name);
  }
  return [...refs];
}

function decodeEntry(files: Unzipped, name: string): string | null {
  const bytes = files[name];
  return bytes ? new TextDecoder().decode(bytes) : null;
}

function resolveZipPath(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  return path.posix.normalize(path.posix.join(baseDir, target));
}

interface ParsedRel { id: string; type: string; target: string }
function parseRels(xml: string): ParsedRel[] {
  const rels: ParsedRel[] = [];
  const parser = new SaxesParser();
  parser.on("opentag", (node) => {
    if (node.name === "Relationship") {
      const a = attrsOf(node);
      rels.push({ id: a.Id ?? "", type: a.Type ?? "", target: a.Target ?? "" });
    }
  });
  parser.write(xml).close();
  return rels;
}

interface ParsedWorkbook {
  sheets: Array<{ name: string; rid: string; hidden: boolean }>;
  definedNames: Array<{ name: string; refersTo: string; localSheetId: string | undefined }>;
}
function parseWorkbook(xml: string): ParsedWorkbook {
  const sheets: ParsedWorkbook["sheets"] = [];
  const definedNames: ParsedWorkbook["definedNames"] = [];
  const parser = new SaxesParser();
  let inDefinedName = false;
  let dnName = "";
  let dnLocal: string | undefined;
  let dnText = "";
  parser.on("opentag", (node) => {
    const a = attrsOf(node);
    if (node.name === "sheet") {
      const state = a.state ?? "visible";
      sheets.push({
        name: a.name ?? "",
        rid: a["r:id"] ?? a.id ?? "",
        hidden: state === "hidden" || state === "veryHidden",
      });
    } else if (node.name === "definedName") {
      inDefinedName = true;
      dnName = a.name ?? "";
      dnLocal = a.localSheetId;
      dnText = "";
    }
  });
  parser.on("text", (t) => {
    if (inDefinedName) dnText += t;
  });
  parser.on("closetag", (node) => {
    if (node.name === "definedName") {
      definedNames.push({ name: dnName, refersTo: dnText.trim(), localSheetId: dnLocal });
      inDefinedName = false;
    }
  });
  parser.write(xml).close();
  return { sheets, definedNames };
}

/** Shared string table (cells of type `s` reference it by index). Rich-text runs
 *  are concatenated. Bounded only by the per-entry byte budget upstream. */
function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const parser = new SaxesParser();
  let inSi = false;
  let inT = false;
  let current = "";
  parser.on("opentag", (node) => {
    if (node.name === "si") {
      inSi = true;
      current = "";
    } else if (node.name === "t" && inSi) {
      inT = true;
    }
  });
  parser.on("text", (t) => {
    if (inT) current += t;
  });
  parser.on("closetag", (node) => {
    if (node.name === "t") inT = false;
    else if (node.name === "si") {
      strings.push(current);
      inSi = false;
    }
  });
  parser.write(xml).close();
  return strings;
}

function parseTable(xml: string): { name: string; ref: string } | null {
  let result: { name: string; ref: string } | null = null;
  const parser = new SaxesParser();
  parser.on("opentag", (node) => {
    if (node.name === "table" && !result) {
      const a = attrsOf(node);
      result = { name: a.name ?? "", ref: a.ref ?? "" };
    }
  });
  parser.write(xml).close();
  return result;
}

interface ParsedWorksheet {
  dimensions: { rows: number; cols: number };
  protected: boolean;
  merged_ranges: Array<{ sheet: string; range: string }>;
  data_validations: Array<{ sheet: string; range: string; rule_summary: string }>;
  formula_cells: Array<{ sheet: string; cell: string; formula: string; cross_sheet_refs: string[] }>;
  error_cells: Array<{ sheet: string; cell: string; token: string }>;
  rows: string[][];
  rows_truncated: boolean;
}
function parseWorksheet(args: {
  xml: string;
  sharedStrings: string[];
  sheetName: string;
  caps: DataLayerCaps;
}): ParsedWorksheet {
  const { xml, sharedStrings, sheetName, caps } = args;
  const merged_ranges: ParsedWorksheet["merged_ranges"] = [];
  const data_validations: ParsedWorksheet["data_validations"] = [];
  const formula_cells: ParsedWorksheet["formula_cells"] = [];
  const error_cells: ParsedWorksheet["error_cells"] = [];
  const rows: string[][] = [];
  let protectedSheet = false;
  let declaredDims: { rows: number; cols: number } | null = null;
  let maxRow = 0;
  let maxCol = 0;
  let rowsTruncated = false;

  let curRow: string[] | null = null;
  let cellRef = "";
  let cellType = "";
  let cellCol = 0;
  let inV = false;
  let inF = false;
  let inIs = false;
  let inIsT = false;
  let vText = "";
  let fText = "";
  let isText = "";

  const parser = new SaxesParser();
  parser.on("opentag", (node) => {
    const a = attrsOf(node);
    switch (node.name) {
      case "dimension": {
        if (a.ref) declaredDims = parseRangeDims(a.ref);
        break;
      }
      case "sheetProtection":
        protectedSheet = true;
        break;
      case "mergeCell":
        if (a.ref && merged_ranges.length < XLSX_MERGE_CAP) {
          merged_ranges.push({ sheet: sheetName, range: a.ref });
        }
        break;
      case "dataValidation":
        if (data_validations.length < XLSX_DATAVALIDATION_CAP) {
          data_validations.push({
            sheet: sheetName,
            range: a.sqref ?? "",
            rule_summary: `type=${a.type ?? "any"}`,
          });
        }
        break;
      case "row":
        curRow = rows.length >= caps.max_rows_scanned_per_sheet ? null : [];
        if (curRow === null) rowsTruncated = true;
        break;
      case "c": {
        cellRef = a.r ?? "";
        cellType = a.t ?? "";
        const parsed = cellRef ? parseCellRef(cellRef) : null;
        cellCol = parsed ? parsed.col : curRow ? curRow.length : 0;
        if (parsed) {
          maxRow = Math.max(maxRow, parsed.row);
          maxCol = Math.max(maxCol, parsed.col + 1);
        }
        vText = "";
        fText = "";
        isText = "";
        break;
      }
      case "v":
        inV = true;
        vText = "";
        break;
      case "f":
        inF = true;
        fText = "";
        break;
      case "is":
        inIs = true;
        break;
      case "t":
        if (inIs) {
          inIsT = true;
          isText = "";
        }
        break;
      default:
        break;
    }
  });
  parser.on("text", (t) => {
    if (inV) vText += t;
    else if (inF) fText += t;
    else if (inIsT) isText += t;
  });
  parser.on("closetag", (node) => {
    switch (node.name) {
      case "v":
        inV = false;
        break;
      case "f":
        inF = false;
        break;
      case "is":
        inIs = false;
        break;
      case "c": {
        // Formula + error are structural (kept regardless of the row cap, bounded
        // by their own caps). The cell's grid value is the cached <v> result.
        if (fText.length > 0 && formula_cells.length < XLSX_FORMULA_CAP) {
          formula_cells.push({
            sheet: sheetName,
            cell: cellRef,
            formula: fText,
            cross_sheet_refs: extractCrossSheetRefs(fText, sheetName),
          });
        }
        if (cellType === "e" && error_cells.length < XLSX_ERROR_CELL_CAP) {
          error_cells.push({ sheet: sheetName, cell: cellRef, token: vText });
        }
        if (curRow) {
          let value: string;
          if (cellType === "s") value = sharedStrings[parseInt(vText, 10)] ?? "";
          else if (cellType === "inlineStr") value = isText;
          else if (cellType === "b") value = vText === "1" ? "true" : "false";
          else value = vText; // str / e / n / default number
          if (cellCol >= 0) {
            while (curRow.length < cellCol) curRow.push("");
            curRow[cellCol] = value;
          }
        }
        break;
      }
      case "t":
        if (inIs) inIsT = false;
        break;
      case "row":
        if (curRow) {
          rows.push(curRow);
          curRow = null;
        }
        break;
      default:
        break;
    }
  });
  parser.write(xml).close();

  return {
    dimensions: declaredDims ?? { rows: maxRow, cols: maxCol },
    protected: protectedSheet,
    merged_ranges,
    data_validations,
    formula_cells,
    error_cells,
    rows,
    rows_truncated: rowsTruncated,
  };
}

/** Build the inventory from xlsx/xlsm bytes (design §11.2). Deterministic and
 *  read-only. `content_sha256` is the RAW-byte hash, supplied by the caller. */
export function buildXlsxInventory(args: {
  sourceRef: string;
  bytes: Uint8Array;
  contentSha256: string;
  workbookKind: WorkbookKind;
  caps?: DataLayerCaps;
}): WorkbookStructuralInventory {
  const caps = args.caps ?? DEFAULT_DATA_LAYER_CAPS;
  const risk_signals: InventoryRiskSignal[] = [];
  let captureTruncated = false;
  let macroPresent = args.workbookKind === "xlsm";

  const unsupported = (reason: string): WorkbookStructuralInventory =>
    unsupportedInventory({
      sourceRef: args.sourceRef,
      contentSha256: args.contentSha256,
      workbookKind: args.workbookKind,
      reason,
    });

  let files: Unzipped;
  try {
    files = unzipSync(args.bytes, {
      filter: (f: UnzipFileInfo) => {
        if (f.name === "xl/vbaProject.bin") {
          macroPresent = true;
          return false;
        }
        if (f.originalSize > XLSX_PER_ENTRY_BYTE_BUDGET) {
          captureTruncated = true;
          risk_signals.push({
            kind: "oversized_zip_entry",
            location: f.name,
            literal: `original_size=${f.originalSize} exceeds ${XLSX_PER_ENTRY_BYTE_BUDGET}`,
          });
          return false;
        }
        // Only the XML/rels parts we parse — never media/binaries.
        return /^xl\/.*\.(xml|rels)$/i.test(f.name);
      },
    });
  } catch (error) {
    return unsupported(`xlsx unzip failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const workbookXml = decodeEntry(files, "xl/workbook.xml");
  if (!workbookXml) {
    return unsupported("xlsx missing xl/workbook.xml (not a valid OOXML workbook)");
  }

  let workbook: ParsedWorkbook;
  let workbookRels: ParsedRel[];
  let sharedStrings: string[];
  try {
    workbook = parseWorkbook(workbookXml);
    const relsXml = decodeEntry(files, "xl/_rels/workbook.xml.rels");
    workbookRels = relsXml ? parseRels(relsXml) : [];
    const sstXml = decodeEntry(files, "xl/sharedStrings.xml");
    sharedStrings = sstXml ? parseSharedStrings(sstXml) : [];
  } catch (error) {
    return unsupported(`xlsx workbook parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const relById = new Map(workbookRels.map((r) => [r.id, r]));

  // External workbook links (relationship type ends with /externalLink).
  const external_links = workbookRels
    .filter((r) => r.type.toLowerCase().endsWith("externallink"))
    .map((r) => ({ target: r.target, kind: "external_workbook_link" }));

  const named_ranges = workbook.definedNames.map((dn) => ({
    name: dn.name,
    scope: dn.localSheetId !== undefined ? `sheet:${dn.localSheetId}` : "workbook",
    refers_to: dn.refersTo,
  }));

  const sheets: InventorySheet[] = [];
  const per_sheet_data: PerSheetData[] = [];
  const distinct_value_vocab: DistinctValueVocabEntry[] = [];
  const tables: Array<{ name: string; sheet: string; range: string }> = [];
  const formula_cells: WorkbookStructuralInventory["formula_cells"] = [];
  const merged_ranges: WorkbookStructuralInventory["merged_ranges"] = [];
  const data_validations: WorkbookStructuralInventory["data_validations"] = [];
  const error_cells: WorkbookStructuralInventory["error_cells"] = [];

  for (const sheetEntry of workbook.sheets) {
    const rel = relById.get(sheetEntry.rid);
    const sheetPath = rel ? resolveZipPath("xl", rel.target) : null;
    const sheetXml = sheetPath ? decodeEntry(files, sheetPath) : null;
    if (!sheetXml) {
      // Sheet part missing/unreadable — record it literally, keep the others.
      risk_signals.push({
        kind: "unreadable_sheet_part",
        location: sheetEntry.name,
        literal: sheetPath ? `missing entry ${sheetPath}` : `unresolved relationship ${sheetEntry.rid}`,
      });
      sheets.push({
        name: sheetEntry.name,
        used_range: null,
        dimensions: { rows: 0, cols: 0 },
        hidden: sheetEntry.hidden,
        protected: false,
      });
      per_sheet_data.push({ sheet: sheetEntry.name, layout_kind: "unknown", header_rows: null, columns: [] });
      continue;
    }

    let parsed: ParsedWorksheet;
    try {
      parsed = parseWorksheet({ xml: sheetXml, sharedStrings, sheetName: sheetEntry.name, caps });
    } catch (error) {
      risk_signals.push({
        kind: "unreadable_sheet_part",
        location: sheetEntry.name,
        literal: `parse error: ${error instanceof Error ? error.message : String(error)}`,
      });
      sheets.push({
        name: sheetEntry.name,
        used_range: null,
        dimensions: { rows: 0, cols: 0 },
        hidden: sheetEntry.hidden,
        protected: false,
      });
      per_sheet_data.push({ sheet: sheetEntry.name, layout_kind: "unknown", header_rows: null, columns: [] });
      continue;
    }

    if (parsed.rows_truncated) captureTruncated = true;
    formula_cells.push(...parsed.formula_cells);
    merged_ranges.push(...parsed.merged_ranges);
    data_validations.push(...parsed.data_validations);
    error_cells.push(...parsed.error_cells);

    const profile = profileSheetRows({ sheetName: sheetEntry.name, rows: parsed.rows, caps });
    if (profile.data_layer_truncated) captureTruncated = true;
    risk_signals.push(...profile.risk_signals);
    distinct_value_vocab.push(...profile.distinct_value_vocab);

    const dims = parsed.dimensions;
    sheets.push({
      name: sheetEntry.name,
      used_range: dims.rows > 0 ? `R1C1:R${dims.rows}C${dims.cols}` : null,
      dimensions: dims,
      hidden: sheetEntry.hidden,
      protected: parsed.protected,
    });
    per_sheet_data.push({
      sheet: sheetEntry.name,
      layout_kind: profile.layout_kind,
      header_rows: profile.header_rows,
      columns: profile.columns,
    });

    // Tables owned by this sheet (sheet rels → ../tables/tableN.xml).
    if (sheetPath) {
      const sheetRelsPath = `${path.posix.dirname(sheetPath)}/_rels/${path.posix.basename(sheetPath)}.rels`;
      const sheetRelsXml = decodeEntry(files, sheetRelsPath);
      if (sheetRelsXml) {
        for (const r of parseRels(sheetRelsXml)) {
          if (!r.type.toLowerCase().endsWith("table")) continue;
          const tablePath = resolveZipPath(path.posix.dirname(sheetPath), r.target);
          const tableXml = decodeEntry(files, tablePath);
          const table = tableXml ? parseTable(tableXml) : null;
          if (table) tables.push({ name: table.name, sheet: sheetEntry.name, range: table.ref });
        }
      }
    }
  }

  if (macroPresent) {
    risk_signals.push({ kind: "macro_present", location: path.basename(args.sourceRef), literal: "workbook carries a VBA project" });
  }
  if (external_links.length > 0) {
    risk_signals.push({ kind: "external_links_present", location: path.basename(args.sourceRef), literal: `${external_links.length} external workbook link(s)` });
  }

  return {
    adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
    adapter_version: SPREADSHEET_OBSERVER_ADAPTER_VERSION,
    source_ref: path.resolve(args.sourceRef),
    content_sha256: args.contentSha256,
    workbook_kind: args.workbookKind,
    inspection_method: "structure_inspected_only",
    sheets,
    named_ranges,
    tables,
    formula_cells,
    merged_ranges,
    data_validations,
    external_links,
    error_cells,
    macro_present: macroPresent,
    risk_signals,
    per_sheet_data,
    distinct_value_vocab,
    // Cross-sheet key-overlap (a data-relation signal, §2.4) needs retained
    // bounded per-column value sets across sheets — a distinct increment, not
    // wired yet (csv returns [] too).
    cross_sheet_key_overlap: [],
    data_layer_caps: caps,
    capture_truncated: captureTruncated,
    unsupported_reason: null,
  };
}

const SPREADSHEET_EXTENSION_KINDS: Record<string, WorkbookKind> = {
  ".csv": "csv",
  ".tsv": "tsv",
  ".xlsx": "xlsx",
  ".xlsm": "xlsm",
  ".xls": "xls",
  ".ods": "ods",
};

function unsupportedInventory(args: {
  sourceRef: string;
  contentSha256: string;
  workbookKind: WorkbookKind;
  reason: string;
}): WorkbookStructuralInventory {
  return {
    adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
    adapter_version: SPREADSHEET_OBSERVER_ADAPTER_VERSION,
    source_ref: path.resolve(args.sourceRef),
    content_sha256: args.contentSha256,
    workbook_kind: args.workbookKind,
    inspection_method: "structure_inspected_only",
    sheets: [],
    named_ranges: [],
    tables: [],
    formula_cells: [],
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
    unsupported_reason: args.reason,
  };
}

/** Observe a spreadsheet source file. P1 implements csv/tsv (pure Node);
 *  xlsx/xlsm/xls/ods are deferred to P4 (bundled Node lib) and return
 *  `unsupported_reason`. `content_sha256` is always the RAW-byte hash. */
export async function observeSpreadsheetSource(
  sourceRef: string,
  opts?: { caps?: DataLayerCaps },
): Promise<WorkbookStructuralInventory> {
  const ext = path.extname(sourceRef).toLowerCase();
  const workbookKind = SPREADSHEET_EXTENSION_KINDS[ext];
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(sourceRef);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return unsupportedInventory({
      sourceRef,
      contentSha256: "",
      workbookKind: workbookKind ?? "csv",
      reason: `source unreadable (${code ?? "unknown"})`,
    });
  }
  const contentSha256 = sha256Hex(bytes);
  if (workbookKind === undefined) {
    return unsupportedInventory({ sourceRef, contentSha256, workbookKind: "csv", reason: `unrecognized spreadsheet extension: ${ext || "(none)"}` });
  }
  if (workbookKind === "csv" || workbookKind === "tsv") {
    return buildCsvInventory({
      sourceRef,
      content: bytes.toString("utf8"),
      contentSha256,
      ...(opts?.caps ? { caps: opts.caps } : {}),
    });
  }
  if (workbookKind === "xlsx" || workbookKind === "xlsm") {
    return buildXlsxInventory({
      sourceRef,
      bytes,
      contentSha256,
      workbookKind,
      ...(opts?.caps ? { caps: opts.caps } : {}),
    });
  }
  // xls (BIFF binary) / ods (a different ZIP/XML schema) — separate parsers, not
  // yet implemented (design §11.2 scoped xlsx/xlsm first).
  return unsupportedInventory({
    sourceRef,
    contentSha256,
    workbookKind,
    reason: `${workbookKind} extraction not yet implemented (xls/ods deferred; xlsx/xlsm supported)`,
  });
}

/**
 * The single admission-safe projection of a workbook inventory (design §11
 * CHAN-1/CHAN-2). It returns a structural + aggregate-only view: raw cell values
 * — `distinct_value_vocab[].top_values` (and any future sample/key-value fields)
 * — are excluded. Consumers that lack their own source-safety admission gate
 * (e.g. the review pipeline, §3.2) MUST route through this so the safe default is
 * enforced in ONE place and cannot drift between consumers. Raw values reach a
 * prompt only via the explicit source-safety channel, never via this projection.
 */
export function projectInventoryForAdmission(
  inventory: WorkbookStructuralInventory,
): WorkbookStructuralInventory {
  return {
    ...inventory,
    // Reconstruct each vocab entry from aggregate-only fields, dropping the
    // optional raw-value `top_values` entirely.
    distinct_value_vocab: inventory.distinct_value_vocab.map((entry) => ({
      sheet: entry.sheet,
      column: entry.column,
      distinct_count: entry.distinct_count,
      distinct_count_is_estimate: entry.distinct_count_is_estimate,
    })),
  };
}
