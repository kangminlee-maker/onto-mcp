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
// This file ships P0 (the inventory type + envelope) and P1 (the pure-Node,
// zero-dependency CSV extractor). xlsx/xls/ods go through a bundled Node library
// at P4 (design §11.2) and currently return `unsupported_reason`.
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

  const colsTruncated = colCount > caps.max_columns_profiled;
  const usedRange = `R1C1:R${rows.length}C${colCount}`;
  const layout: SheetLayoutKind = hasHeader ? "tabular" : "matrix_no_header";

  return {
    ...envelope,
    sheets: [
      {
        name: sheetName,
        used_range: usedRange,
        dimensions: { rows: rows.length, cols: colCount },
        hidden: false,
        protected: false,
      },
    ],
    risk_signals,
    per_sheet_data: [
      {
        sheet: sheetName,
        layout_kind: layout,
        header_rows: headerRows,
        columns: layout === "tabular" ? columns : [],
      },
    ],
    distinct_value_vocab,
    capture_truncated: rowsTruncated || colsTruncated || dataLayerTruncated,
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
  // xlsx/xlsm/xls/ods — P4 (bundled Node library). Not yet wired (design §11.2).
  return unsupportedInventory({
    sourceRef,
    contentSha256,
    workbookKind,
    reason: `${workbookKind} extraction not yet implemented (P4: bundled Node library)`,
  });
}
