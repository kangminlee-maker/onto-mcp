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
// The DATA-OBSERVATION layer is aggregate-counts-only by default — `distinct_value_vocab`
// carries `distinct_count` but NOT raw `top_values`, no raw sample rows / cell values are
// emitted, and per-column cardinality (distinct_count / non_empty_count) is COUNTS only.
// The ONE narrowed exception (design-C, NOT a preserved guarantee): `data_validations[].members`
// carries the DECLARED type=list enum labels parsed from an INLINE formula1 literal — bounded,
// and never sourced from observed cell values (so off-list / free / high-cardinality raw values
// are still never emitted). The inventory is a structural / aggregate index, not a data dump.
//   Scope note: column/header NAMES are emitted as structural schema (a header is,
//   by definition, labels — not data). Deterministic header detection can misread a
//   headerless all-text sheet's first DATA row as a header, surfacing that one row
//   as column names; such sheets are flagged `header_confidence: "low"` (see
//   detectHeaderRow) and are the intended targets of P0.5 LLM escalation. The
//   aggregate no-raw-VALUE guarantee above is unaffected.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Unzip, UnzipInflate } from "fflate";
import { SaxesParser, type SaxesTagPlain } from "saxes";

export const SPREADSHEET_OBSERVER_ADAPTER_ID = "spreadsheet-structure-observer";
// v2 (Stage 1.1): per-cell `formula_cells` replaced by deduplicated `formula_patterns`
// (tier-1 exact-text dedup) + an honest `formula_cells_total`. A bump invalidates a
// resume's reuse hash (run.ts sourceObservationsReuseSha256) so a stale old-schema seed
// is never silently reused.
// v3 (design-C): per-column cardinality (distinct_count / distinct_count_is_estimate /
// non_empty_count on every profiled column) + declared type=list enum members on
// data_validations (validation_type / members / members_truncated / applies_to_columns).
// v4 (P1-C1): segmented value-tile projection promoted to production.
// v5 (P1-C2-B′ #3): per-column `is_uniform_formula` — true when a single single-column formula
// pattern provably covers the column's data cells (a repeated/shared fill-down). The leaf-read
// trigger skips such columns (structure fully captures them). Additive optional field.
export const SPREADSHEET_OBSERVER_ADAPTER_VERSION = 5;

export type WorkbookKind = "xlsx" | "xlsm" | "csv" | "tsv" | "xls" | "xlsb" | "ods";

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
  /** Workbook-level ceiling on the number of worksheets OBSERVED (rows/structure read into
   *  memory and persisted). Conservatively high so normal workbooks are untouched; bounds a
   *  pathological many-sheet workbook (the per-workbook analog of the bounded-observation
   *  fix) and sets capture_truncated when hit. */
  max_sheets_observed: number;
}

export const DEFAULT_DATA_LAYER_CAPS: DataLayerCaps = {
  max_rows_scanned_per_sheet: 100_000,
  max_distinct_tracked_per_column: 256,
  max_columns_profiled: 512,
  max_sheet_pairs: 64,
  max_sheets_observed: 2048,
};

// design-C declared type=list enum-member bounds.
/** Max declared enum members emitted per type=list validation. Reuses the existing
 *  categorical gate ceiling (the distinct_value_vocab `<= 50` rule below) so "a bounded
 *  controlled vocabulary" means the same count everywhere. Over this → members absent +
 *  members_truncated. */
export const VALIDATION_MEMBER_COUNT_CAP = 50;
/** Max characters per declared enum member. PRELIMINARY / bench-calibrated: enum labels are
 *  short, so a long "member" signals the formula1 is not really an enum (e.g. a long range
 *  expression). Any member over this → members absent + members_truncated. */
export const VALIDATION_MEMBER_CHAR_CAP = 64;

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
  /** Per-column cardinality (design-C residual signal). Distinct value COUNT over the
   *  SCANNED rows; exact, or `max_distinct_tracked_per_column` (256) when the distinct
   *  cap was hit (then a lower bound). NOT a value list — only the count. */
  distinct_count: number;
  /** True when `distinct_count` hit the distinct cap (it is then a `>= cap` lower bound). */
  distinct_count_is_estimate: boolean;
  /** Non-empty cell COUNT over the SCANNED rows — the cardinality base. Exact within the
   *  scanned rows; a lower bound when the sheet's rows were row-cap truncated (signalled by
   *  the sheet-level `capture_truncated`, not a per-column flag). */
  non_empty_count: number;
  /** P1-C2-B′ #3 (adapter v5): true when this column is provably a SINGLE uniform formula — exactly
   *  one single-column formula pattern covers it with occurrence_count === non_empty_count (a fill-down
   *  whose references shift but whose structure is one repeated formula; Excel shared-formula dedup
   *  already collapses these to one pattern). Structure fully captures such a column, so the leaf-read
   *  trigger skips it. Absent/false unless PROVEN (xlsx only; conservative — a partial-formula column,
   *  a multi-formula column [a row-range break = real structure], or a multi-column fill is NOT marked,
   *  erring to read). NOTE: occurrence_count is whole-sheet, so a formula sitting in a title/header row
   *  identical to the data fill-down could in theory over-skip — semantically absurd for real headers
   *  (labels), and the only loss is a redundant leaf-read of an already-captured formula column. */
  is_uniform_formula?: boolean;
}

/** The ONE pure cardinality-priority calc point (design-C §2.1): selection, display, and the
 *  route-less mirror all read THIS so they cannot drift. Total order is
 *  (is_estimate ? 1 : 0) DESC, then ratio DESC, then column.index ASC, where
 *  ratio = non_empty_count === 0 ? 0 : distinct_count / non_empty_count (never NaN). A
 *  distinct-cap estimate is a lower bound, so it is treated as MAXIMALly informative (kept
 *  first) — the is_estimate term lives ONLY here, never duplicated at a call site. */
export function columnResidualKey(col: InventoryColumn): {
  estimate: number;
  ratio: number;
  index: number;
} {
  const ratio =
    col.non_empty_count === 0 ? 0 : col.distinct_count / col.non_empty_count;
  return { estimate: col.distinct_count_is_estimate ? 1 : 0, ratio, index: col.index };
}

/** Descending residual-priority comparator over {@link columnResidualKey} (highest priority
 *  first): estimate DESC, ratio DESC, index ASC. Deterministic — equal estimate+ratio break
 *  by index, so the order is total. */
export function compareColumnResidualDesc(a: InventoryColumn, b: InventoryColumn): number {
  const ka = columnResidualKey(a);
  const kb = columnResidualKey(b);
  if (ka.estimate !== kb.estimate) return kb.estimate - ka.estimate;
  if (ka.ratio !== kb.ratio) return kb.ratio - ka.ratio;
  return ka.index - kb.index;
}

export interface PerSheetData {
  sheet: string;
  layout_kind: SheetLayoutKind;
  /** Multi-row / merged headers are representable; null = no header row
   *  (design §2.4 SCHEMA-1). columns[] is only asserted when layout_kind=tabular. */
  header_rows: number[] | null;
  columns: InventoryColumn[];
  /** Deterministic header-detection confidence (design §10 C′ / §11 P0.5). The
   *  observer stays LLM-free; "low" honestly marks a sheet whose header/layout the
   *  heuristic could not resolve well — a candidate for downstream LLM escalation
   *  (a separate, governed step), never resolved inside this module. */
  header_confidence: "high" | "low";
}

export interface DistinctValueVocabEntry {
  sheet: string;
  column: string;
  /** Aggregate count only. If the distinct set hit the cap, this is a ">= cap"
   *  lower-bound estimate. */
  distinct_count: number;
  distinct_count_is_estimate: boolean;
  /** Raw values are intentionally absent — the inventory carries aggregate counts
   *  only, not raw cell values. */
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
  /** PivotTables (design §2.2): aggregation/summary structure. Field NAMES are
   *  schema (like column headers), not raw cell values; the pivot CACHE RECORDS
   *  (the cached data) are never read. */
  pivot_tables: Array<{
    name: string;
    sheet: string;
    location: string;
    source_sheet: string | null;
    source_ref: string | null;
    row_fields: string[];
    column_fields: string[];
    page_fields: string[];
    data_fields: string[];
  }>;
  /** Deduplicated formula patterns (Stage 1.1, tier-1 exact-text dedup). A fill-down
   *  (one shared-formula master replicated verbatim across N cells) collapses to a
   *  SINGLE pattern with `occurrence_count = N`. `pattern` is the formula text verbatim;
   *  `sample_cell` is the first occurrence; `applied_ranges` is a bounded (≤8), display-only
   *  list of cell addresses; `sheets` are the distinct sheets it appears on; `cross_sheet_refs`
   *  is the sheet-level union. Carries only formula text + cell addresses + sheet names — never
   *  raw DATA cell values (the inventory is aggregate-only). */
  formula_patterns: Array<{
    pattern: string;
    sample_cell: string;
    occurrence_count: number;
    applied_ranges: string[];
    sheets: string[];
    cross_sheet_refs: string[];
  }>;
  /** Honest count of EVERY formula cell observed (Σ occurrence_count over retained patterns,
   *  plus any cells whose new distinct pattern was dropped at the distinct-pattern cap). */
  formula_cells_total: number;
  /** True when the distinct-pattern cap dropped a new pattern, so `formula_cells_total`
   *  still counts every cell but `formula_patterns` is an incomplete distinct set. */
  formula_cells_total_is_lower_bound: boolean;
  merged_ranges: Array<{ sheet: string; range: string }>;
  /** Data-validation rules. `members` is the ONLY value-bearing field (design-C): the
   *  DECLARED type=list enum labels, parsed from an INLINE formula1 literal — never from
   *  observed cell values (so off-list / violating values cannot leak). Bounded by
   *  VALIDATION_MEMBER_COUNT_CAP / VALIDATION_MEMBER_CHAR_CAP; a range-ref formula1, over-count,
   *  or any over-length member leaves `members` absent with `members_truncated: true`. */
  data_validations: Array<{
    sheet: string;
    range: string;
    rule_summary: string;
    /** Structured validation kind ("list"/"date"/…); the dvType preserved structurally so
     *  consumers need not re-parse `rule_summary` (which stays display-only). */
    validation_type: string;
    /** Declared type=list enum labels (bounded). Present ONLY for an inline-formula1 list
     *  validation within the caps; absent otherwise. NEVER observed cell values. */
    members?: string[];
    /** True when members were NOT emitted: not a list, a range-ref formula1 (unresolved),
     *  over count cap, or any member over the char cap. */
    members_truncated: boolean;
    /** Origin-normalized (minus the used-range start column) profiled column indices the
     *  sqref covers (parser-computed; design-C §3). A whole-column ref (B:B / $B:$D) covers only
     *  ITS column span (clamped to the profiled window), not the whole sheet (Codex round2 #1). */
    applies_to_columns: number[];
  }>;
  external_links: Array<{ target: string; kind: string }>;
  error_cells: Array<{ sheet: string; cell: string; token: string }>;
  macro_present: boolean;
  risk_signals: InventoryRiskSignal[];
  per_sheet_data: PerSheetData[];
  distinct_value_vocab: DistinctValueVocabEntry[];
  cross_sheet_key_overlap: CrossSheetKeyOverlap[];
  data_layer_caps: DataLayerCaps;
  capture_truncated: boolean;
  /** Total worksheet count in the workbook, present ONLY when observation was bounded by
   *  `max_sheets_observed` (so `sheets` holds fewer than this). Lets a consumer disclose
   *  "N of M observed" instead of mis-reporting the capped count as the total; absent when
   *  no sheet cap was hit (the full set is in `sheets`). */
  sheet_count_total?: number;
  /** P1-C1 (§3.1): segmented value-tile projection per sheet — row-window type/shape signatures plus
   *  domain-agnostic display-format (numFmt) boundaries. Present on xlsx/xlsm inventories; absent on
   *  CSV/TSV and unsupported workbooks (which have no styles/rows grid to project from). */
  segmented_value_tiles?: SheetValueTileProjection[];
  /** P1-C1 resume hardening: the value-tile opts that SHAPED segmented_value_tiles (window + caps).
   *  These change the inventory CONTENT (segment boundaries) but are invisible to content_sha256 (raw
   *  bytes) and adapter_version (schema shape), so the reuse digest folds them. Present on xlsx/xlsm. */
  value_tile_config?: ValueTileOpts;
  unsupported_reason: string | null;
}

// ───────────────────────── P6: honesty/provenance gate support ─────────────────────────
//
// These live next to the inventory type so the PRODUCER (the materialize summary
// builder) and the GATE (validateSourceObservationBoundary) bind to the SAME
// literals and helper and cannot drift. `inspection_method` needs no runtime
// assertion: it is a single-literal type written as a const by every emitter, so
// the type already makes "claims recompute" unrepresentable (capability boundary).

/** Fixed disclosure phrase the observation summary MUST carry when the inventory
 *  reports partial structural capture (P6 assertion D). */
export const SPREADSHEET_CAPTURE_TRUNCATED_PHRASE =
  "capture_truncated: structural capture hit a budget cap (partial structural evidence)";

/** Fixed disclosure phrase the observation summary MUST carry when the workbook
 *  carries macro/VBA code (P6: an emitted honesty/safety signal — structure-only
 *  inspection cannot vouch for executable behavior). */
export const SPREADSHEET_MACRO_PRESENT_PHRASE =
  "macro_present: workbook carries macro/VBA code (structure inspected only; behavior not vouched)";

/** True when an inventory carries any INSPECTED structure across the FULL inventory
 *  surface: a sheet with non-zero dimensions, any structural array (including derived
 *  cross_sheet_key_overlap and risk_signals, which can only exist after a workbook was
 *  read+profiled), profiled columns, or distinct-value vocab. An UNSUPPORTED inventory
 *  must NOT claim inspected structure — it carries only an `unsupported_reason` (P6
 *  assertion C). The legitimate empty-csv placeholder (a zero-dimension sheet shell with
 *  no columns) and `unsupportedInventory()` (`sheets: []`, all arrays empty) both return
 *  false here, so the honesty gate passes those honest states rather than crashing them. */
export function inventoryHasInspectedStructure(
  inventory: WorkbookStructuralInventory,
): boolean {
  return (
    inventory.sheets.some(
      (sheet) => sheet.dimensions.rows > 0 || sheet.dimensions.cols > 0,
    ) ||
    inventory.named_ranges.length > 0 ||
    inventory.tables.length > 0 ||
    inventory.pivot_tables.length > 0 ||
    inventory.formula_patterns.length > 0 ||
    inventory.merged_ranges.length > 0 ||
    inventory.data_validations.length > 0 ||
    inventory.external_links.length > 0 ||
    inventory.error_cells.length > 0 ||
    inventory.distinct_value_vocab.length > 0 ||
    inventory.cross_sheet_key_overlap.length > 0 ||
    inventory.risk_signals.length > 0 ||
    (inventory.segmented_value_tiles?.some((s) => s.columns.length > 0) ?? false) ||
    inventory.per_sheet_data.some((sheet) => sheet.columns.length > 0)
  );
}

/** Stricter than {@link inventoryHasInspectedStructure} for REVIEW inspectability: a
 *  workbook backs a review obligation only when it rendered ACTUAL renderable structure —
 *  sheet bodies, formulas, named ranges, tables, validations, links, vocab, cross-sheet
 *  overlap, OR access/protection hygiene evidence (a macro project, a protected sheet).
 *  Error/risk signals ALONE do not count: a corrupt workbook whose worksheet parts are all
 *  unreadable emits `unreadable_sheet_part` risk signals over zero-dimension sheets, which
 *  `inventoryHasInspectedStructure` counts as "inspected" (its job is P6 provenance —
 *  "something was observed") but which give a reviewer no structure to audit. Review uses
 *  this view so a spreadsheet obligation is never attached to a workbook whose only
 *  evidence is an error signal — while still treating a macro-only or protection-only
 *  `.xlsm` as inspectable, since access_and_protection_hygiene has real evidence there
 *  (a corrupt shell has neither: its macro flag is false and protection is unknowable
 *  without a readable worksheet part). error_cells are excluded: a real error cell always
 *  lives on a non-zero-dimension sheet, already covered above. */
export function inventoryHasRenderableStructure(
  inventory: WorkbookStructuralInventory,
): boolean {
  return (
    inventory.sheets.some(
      (sheet) => sheet.dimensions.rows > 0 || sheet.dimensions.cols > 0,
    ) ||
    inventory.macro_present ||
    inventory.sheets.some((sheet) => sheet.protected) ||
    inventory.named_ranges.length > 0 ||
    inventory.tables.length > 0 ||
    inventory.pivot_tables.length > 0 ||
    inventory.formula_patterns.length > 0 ||
    inventory.merged_ranges.length > 0 ||
    inventory.data_validations.length > 0 ||
    inventory.external_links.length > 0 ||
    inventory.distinct_value_vocab.length > 0 ||
    inventory.cross_sheet_key_overlap.length > 0 ||
    (inventory.segmented_value_tiles?.some((s) => s.columns.length > 0) ?? false) ||
    inventory.per_sheet_data.some((sheet) => sheet.columns.length > 0)
  );
}

// ───────────────────────── P1: CSV extractor (pure Node, zero-dep) ─────────────────────────

const CSV_DELIMITERS = [",", "\t", ";"] as const;
type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

/** Count occurrences of `delim` in `line` that fall OUTSIDE double-quoted fields,
 *  so a delimiter inside a quoted free-text cell doesn't skew detection. */
function countDelimiterOutsideQuotes(line: string, delim: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === delim) count += 1;
  }
  return count;
}

/** Pick the delimiter with the most occurrences across the first several
 *  non-empty lines (deterministic; comma wins ties by being first). Scanning
 *  more than one line keeps a leading title/blank line — common in exported
 *  reports — from mis-picking the delimiter, and quoted fields are ignored so a
 *  semicolon inside a comma file's text column isn't counted. */
function detectDelimiter(text: string): CsvDelimiter {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 10);
  let best: CsvDelimiter = ",";
  let bestCount = -1;
  for (const d of CSV_DELIMITERS) {
    let count = 0;
    for (const line of lines) count += countDelimiterOutsideQuotes(line, d);
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

// Header detection scans the first rows (real workbooks put title / blank rows
// above the header) and scores each as fill_ratio × label_ratio: a header is a
// mostly-filled row of mostly-non-numeric labels. Deterministic; the residual
// ambiguous tail is flagged low-confidence rather than resolved by an LLM here.
const HEADER_SCAN_ROWS = 15;
const HEADER_SCORE_STRONG = 0.45;
const HEADER_SCORE_WEAK = 0.15;

/** fill_ratio × label_ratio of a candidate header row (0 when blank). */
function scoreHeaderRow(cells: string[], colCount: number): number {
  if (colCount === 0) return 0;
  let nonEmpty = 0;
  let nonNumeric = 0;
  for (const c of cells) {
    const t = c.trim();
    if (t.length === 0) continue;
    nonEmpty += 1;
    const kind = classifyValue(t);
    if (kind !== "integer" && kind !== "number") nonNumeric += 1;
  }
  if (nonEmpty === 0) return 0;
  return (nonEmpty / colCount) * (nonNumeric / nonEmpty);
}

/** Whether the rows just below `headerRow` carry typed (numeric/date/boolean)
 *  data — the contrast that distinguishes a real header from a first DATA row of
 *  strings. Without it, an all-text first row is indistinguishable from data. */
function hasDataTypeContrast(rows: string[][], headerRow: number): boolean {
  const end = Math.min(rows.length, headerRow + 1 + 30);
  for (let r = headerRow + 1; r < end; r += 1) {
    for (const cell of rows[r] ?? []) {
      const t = cell.trim();
      if (t.length === 0) continue;
      const k = classifyValue(t);
      if (k === "integer" || k === "number" || k === "date" || k === "boolean") return true;
    }
  }
  return false;
}

/** Pick the best header row in the first HEADER_SCAN_ROWS (skipping title/blank
 *  rows above it) and rate confidence. A strong label row is HIGH confidence only
 *  when the data below shows type contrast — an all-text first row over all-text
 *  data is indistinguishable from data, so it is flagged LOW (its cells could be
 *  raw values, not schema; Codex P1). A populated sheet with no label-like row is
 *  a headerless matrix, also flagged low. Both are escalation candidates. */
function detectHeaderRow(
  rows: string[][],
  colCount: number,
): { headerRowIndex: number | null; confidence: "high" | "low" } {
  const scanLimit = Math.min(HEADER_SCAN_ROWS, rows.length);
  let bestRow = -1;
  let bestScore = 0;
  for (let r = 0; r < scanLimit; r += 1) {
    const score = scoreHeaderRow(rows[r] ?? [], colCount);
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  if (bestScore >= HEADER_SCORE_STRONG) {
    const confidence = hasDataTypeContrast(rows, bestRow) ? "high" : "low";
    return { headerRowIndex: bestRow, confidence };
  }
  if (bestScore >= HEADER_SCORE_WEAK) return { headerRowIndex: bestRow, confidence: "low" };
  return { headerRowIndex: null, confidence: "low" };
}

function sha256Hex(bytes: Buffer | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

interface SheetRowProfile {
  layout_kind: SheetLayoutKind;
  header_rows: number[] | null;
  header_confidence: "high" | "low";
  columns: InventoryColumn[];
  distinct_value_vocab: DistinctValueVocabEntry[];
  risk_signals: InventoryRiskSignal[];
  data_layer_truncated: boolean;
  col_count: number;
  row_count: number;
  /** Bounded distinct value SET per real-named column (tabular only) — held
   *  INTERNALLY to compute cross-sheet key overlap; never emitted (only the
   *  overlap COUNT is). Empty for matrix/headerless sheets. */
  column_value_sets: Map<string, Set<string>>;
}

/** Deterministic per-sheet data profiling shared by every format (csv = one
 *  sheet; xlsx = one call per sheet). Given the already-parsed cell grid (header
 *  + data rows, already bounded by the row cap upstream), derive header detection,
 *  column types, aggregate distinct counts, and ragged-row risk signals. Holds NO
 *  raw values beyond bounded distinct sets it counts internally. */
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
      header_confidence: "low",
      columns: [],
      distinct_value_vocab: [],
      risk_signals: [],
      data_layer_truncated: false,
      col_count: 0,
      row_count: 0,
      column_value_sets: new Map(),
    };
  }

  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const { headerRowIndex, confidence } = detectHeaderRow(rows, colCount);
  const hasHeader = headerRowIndex !== null;
  const headerCells = hasHeader ? (rows[headerRowIndex] ?? []) : [];
  const headerRows = hasHeader ? [headerRowIndex] : null;
  // Data begins after the detected header row; rows above it (titles/blanks) are
  // dropped from the data scan.
  const headerStart = hasHeader ? headerRowIndex + 1 : 0;
  const dataRows = rows.slice(headerStart);
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
    // A fully-empty row is a blank/omitted row (sparse gap), not a ragged row.
    if (dr && dr.length > 0 && dr.length !== colCount) {
      risk_signals.push({
        kind: "ragged_row",
        location: `${sheetName}:row ${headerStart + r + 1}`,
        literal: `${dr.length} cols vs ${colCount}`,
      });
    }
  }

  const columns: InventoryColumn[] = [];
  const distinct_value_vocab: DistinctValueVocabEntry[] = [];
  // Retained only for tabular sheets with a real column name — fuels cross-sheet
  // key overlap; never emitted. Bounded by the distinct cap per column.
  const column_value_sets = new Map<string, Set<string>>();
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
      // design-C per-column cardinality, O(1) from the scan above: distinct value COUNT
      // (cap-aware lower bound when distinctEstimate) over the SCANNED non-empty cells.
      distinct_count: distinctEstimate ? caps.max_distinct_tracked_per_column : distinct.size,
      distinct_count_is_estimate: distinctEstimate,
      non_empty_count: nonEmpty,
    });

    // Categorical → controlled-vocab candidate. Deterministic rule: a bounded,
    // repeating set of non-unique values. AGGREGATE COUNT ONLY: no raw top_values
    // are emitted here (the per-column distinct_count above is likewise a COUNT, not a
    // value list; declared type=list enum LABELS live only on data_validations.members,
    // sourced from formula1 — never from these observed values).
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

    // Cross-sheet key/dimension candidate: a real-named tabular column with ≥2
    // distinct values. The bounded set stays internal.
    if (hasHeader && distinct.size >= 2) {
      const name = columnName(c);
      if (!name.startsWith("col_")) column_value_sets.set(name, distinct);
    }
  }

  const layout: SheetLayoutKind = hasHeader ? "tabular" : "matrix_no_header";
  return {
    layout_kind: layout,
    header_rows: headerRows,
    header_confidence: confidence,
    columns: layout === "tabular" ? columns : [],
    distinct_value_vocab,
    risk_signals,
    data_layer_truncated: dataLayerTruncated,
    col_count: colCount,
    row_count: rows.length,
    column_value_sets,
  };
}

/** Cross-sheet key/dimension overlap (design §2.4): for each column NAME shared by
 *  ≥2 sheets, the pairwise count of shared values between their (bounded) value
 *  sets — a data-level relationship signal. Counts only; the total number of pairs
 *  is bounded by max_sheet_pairs (CAPS-1). */
function computeCrossSheetKeyOverlap(
  perSheet: Array<{ sheet: string; valueSets: Map<string, Set<string>> }>,
  caps: DataLayerCaps,
): { overlaps: CrossSheetKeyOverlap[]; truncated: boolean } {
  const byKey = new Map<string, Array<{ sheet: string; values: Set<string> }>>();
  for (const { sheet, valueSets } of perSheet) {
    for (const [col, values] of valueSets) {
      const list = byKey.get(col);
      if (list) list.push({ sheet, values });
      else byKey.set(col, [{ sheet, values }]);
    }
  }
  const overlaps: CrossSheetKeyOverlap[] = [];
  let pairBudget = caps.max_sheet_pairs;
  let truncated = false;
  for (const [key, occ] of byKey) {
    if (occ.length < 2) continue;
    const pairwise: Array<{ a: string; b: string; count: number }> = [];
    for (let i = 0; i < occ.length; i += 1) {
      for (let j = i + 1; j < occ.length; j += 1) {
        if (pairBudget <= 0) {
          truncated = true;
          break;
        }
        pairBudget -= 1;
        const a = occ[i]!;
        const b = occ[j]!;
        const [small, large] = a.values.size <= b.values.size ? [a.values, b.values] : [b.values, a.values];
        let count = 0;
        for (const v of small) if (large.has(v)) count += 1;
        if (count > 0) pairwise.push({ a: a.sheet, b: b.sheet, count });
      }
      if (pairBudget <= 0) break;
    }
    if (pairwise.length > 0) {
      overlaps.push({ key_name: key, sheets: occ.map((o) => o.sheet), pairwise_overlap: pairwise });
    }
  }
  return { overlaps, truncated };
}

/** Build the inventory from already-read CSV text. Pure & deterministic:
 *  identical (sourceRef, content, contentSha256, caps) → identical inventory. */
export function buildCsvInventory(args: {
  sourceRef: string;
  content: string;
  contentSha256: string;
  caps?: DataLayerCaps;
  /** When the source extension is definitive (e.g. .tsv), pass the delimiter so a
   *  tab file isn't re-detected as comma when tabs are sparse in the sample. */
  delimiter?: CsvDelimiter;
}): WorkbookStructuralInventory {
  const caps = args.caps ?? DEFAULT_DATA_LAYER_CAPS;
  const sheetName = path.basename(args.sourceRef);
  // Strip a leading UTF-8 BOM (common in Excel CSV exports) so it doesn't attach
  // to the first header cell. content_sha256 stays the raw-byte hash (with BOM).
  const content = args.content.charCodeAt(0) === 0xfeff ? args.content.slice(1) : args.content;
  const delimiter = args.delimiter ?? detectDelimiter(content);
  // +1 so a header row never eats into the data-row scan budget.
  const { rows, truncated: rowsTruncated } = parseCsv(
    content,
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
    pivot_tables: [],
    formula_patterns: [],
    formula_cells_total: 0,
    formula_cells_total_is_lower_bound: false,
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
      per_sheet_data: [{ sheet: sheetName, layout_kind: "unknown", header_rows: null, header_confidence: "low", columns: [] }],
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
        header_confidence: profile.header_confidence,
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
// Read-only OOXML structure extraction, STREAMING. fflate's streaming Unzip feeds
// each entry's decompressed chunks incrementally so a multi-hundred-MB worksheet
// is never held whole — worksheet chunks are piped straight into a streaming SAX
// parser and the per-sheet cell scan is bounded by data_layer_caps (cell VALUE
// work stops at the row cap; structural parts after <sheetData> are still seen).
// Pass 1 collects the small parts (workbook, rels, sharedStrings, tables); pass 2
// streams the worksheets (sharedStrings now resolved). No writing, no formula
// recalculation, no whole-workbook object model.

/** Byte budget for an ACCUMULATED small part (workbook/sharedStrings/rels/table).
 *  Worksheets are streamed and not subject to it. Counted from decompressed
 *  chunks (the streaming local header may omit sizes), and on overflow the part
 *  is dropped (capture_truncated + risk signal) rather than held in memory. */
const XLSX_PART_BYTE_BUDGET = 128 * 1024 * 1024;

// Repurposed (Stage 1.1) as a DISTINCT-pattern cap: the max number of distinct formula
// texts retained per sheet. occurrence_count keeps accumulating past it, and every cell is
// still counted in formula_cells_total; a new distinct pattern beyond it is dropped and
// flagged via formula_patterns_capped (an honest lower bound).
const XLSX_FORMULA_CAP = 5000;
// Bounded, display-only list of cell addresses per pattern (no exact authority).
const XLSX_FORMULA_APPLIED_RANGE_CAP = 8;
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

/** "A1:G100" / "B2:D10" / "A1" → the SPAN (rows × cols actually used) and the
 *  used_range in R1C1 notation preserving the offset; null if unparseable. A sheet
 *  whose dimension starts below/right of A1 (title rows, left margins) reports its
 *  real span and origin, not a bounding box from A1. */
function parseDimension(
  ref: string,
): { dims: { rows: number; cols: number }; usedRange: string; startRow: number; startCol: number } | null {
  const parts = ref.split(":");
  const a = parseCellRef((parts[0] ?? "").trim());
  const b = parseCellRef((parts[parts.length - 1] ?? "").trim());
  if (!a || !b) return null;
  const startRow = Math.min(a.row, b.row);
  const endRow = Math.max(a.row, b.row);
  const startCol = Math.min(a.col, b.col);
  const endCol = Math.max(a.col, b.col);
  return {
    dims: { rows: endRow - startRow + 1, cols: endCol - startCol + 1 },
    usedRange: `R${startRow}C${startCol + 1}:R${endRow}C${endCol + 1}`,
    startRow,
    startCol,
  };
}

/** Sheet names referenced by a formula via the `Sheet!`/`'Sheet Name'!` prefix
 *  (a cross-sheet relationship signal), excluding self-references. */
function extractCrossSheetRefs(formula: string, currentSheet: string): string[] {
  const refs = new Set<string>();
  // Unicode-aware (sheet names are commonly non-ASCII, e.g. Korean). The
  // negative lookbehind drops Excel error tokens like `#REF!` (a `#`-prefixed
  // name followed by `!` is an error, not a sheet reference).
  // Quoted sheet names may contain doubled apostrophes ('Bob''s Sheet'); allow
  // them in the quoted branch, then unescape '' → ' below.
  const re = /(?<!#)(?:'((?:[^']|'')+)'|([\p{L}_][\p{L}\p{N}_.]*))!/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    const name = (m[1] ?? m[2] ?? "").replace(/''/g, "'");
    if (name && name !== currentSheet) refs.add(name);
  }
  return [...refs];
}

/** Feed the in-memory archive to a streaming Unzip in bounded input chunks. This
 *  is what makes it genuinely streaming: pushing the whole buffer at once lets the
 *  sync inflater emit a huge entry as one chunk (which would also blow past V8's
 *  ~512MB max string length when decoded). 1 MiB input chunks keep the inflated
 *  output — and our decoded strings fed to SAX — small. */
function pushArchive(unzip: Unzip, bytes: Uint8Array): void {
  const CHUNK = 1 << 20;
  if (bytes.length === 0) {
    unzip.push(new Uint8Array(0), true);
    return;
  }
  for (let off = 0; off < bytes.length; off += CHUNK) {
    const end = Math.min(off + CHUNK, bytes.length);
    unzip.push(bytes.subarray(off, end), end >= bytes.length);
  }
}

/** Stream the archive once, decoding only the entries `want()` selects into a
 *  name→text map. Each accepted entry is accumulated from decompressed chunks and
 *  dropped if it exceeds XLSX_PART_BYTE_BUDGET (memory guard / zip-bomb defense).
 *  `onMacro` fires for xl/vbaProject.bin without decompressing it. Synchronous:
 *  fflate's UnzipInflate runs the callbacks during push. */
function streamCollectEntries(args: {
  bytes: Uint8Array;
  want: (name: string) => boolean;
  onOversized: (name: string) => void;
  onMacro: (name: string) => void;
}): Map<string, string> {
  const out = new Map<string, string>();
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (file.name === "xl/vbaProject.bin") {
      args.onMacro(file.name);
      return;
    }
    if (!args.want(file.name)) return;
    const chunks: Uint8Array[] = [];
    let total = 0;
    let oversized = false;
    file.ondata = (err, chunk, final) => {
      if (err || oversized) return;
      total += chunk.length;
      if (total > XLSX_PART_BYTE_BUDGET) {
        oversized = true;
        chunks.length = 0;
        args.onOversized(file.name);
        return;
      }
      // fflate may reuse the chunk buffer — copy before retaining.
      chunks.push(chunk.slice());
      if (final) out.set(file.name, new TextDecoder().decode(concatChunks(chunks, total)));
    };
    file.start();
  };
  pushArchive(unzip, args.bytes);
  return out;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Stream the archive once, piping each worksheet entry selected by `want()`
 *  through `sinkFor(name)` chunk-by-chunk (the worksheet is never materialized
 *  whole). Synchronous (UnzipInflate). */
function streamWorksheets(args: {
  bytes: Uint8Array;
  want: (name: string) => boolean;
  sinkFor: (name: string) => { write: (text: string) => void; finalize: () => void } | null;
}): void {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (!args.want(file.name)) return;
    const sink = args.sinkFor(file.name);
    if (!sink) return;
    const decoder = new TextDecoder();
    file.ondata = (err, chunk, final) => {
      if (err) return;
      sink.write(decoder.decode(chunk, { stream: !final }));
      if (final) sink.finalize();
    };
    file.start();
  };
  pushArchive(unzip, args.bytes);
}

function resolveZipPath(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  return path.posix.normalize(path.posix.join(baseDir, target));
}

interface ParsedRel { id: string; type: string; target: string; targetMode: string }
function parseRels(xml: string): ParsedRel[] {
  const rels: ParsedRel[] = [];
  const parser = new SaxesParser();
  parser.on("opentag", (node) => {
    if (node.name === "Relationship") {
      const a = attrsOf(node);
      rels.push({ id: a.Id ?? "", type: a.Type ?? "", target: a.Target ?? "", targetMode: a.TargetMode ?? "" });
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

// Excel stores dates as numeric serials; the date-ness is in the cell's number
// format (style), not the value. Builtin date numFmt IDs (date / datetime only;
// time-only 18-21,45-47 are excluded so a time serial isn't rendered as a date).
const BUILTIN_DATE_NUMFMT_IDS = new Set([14, 15, 16, 17, 22]);

/** A custom format is date-ish if it carries a year or day token (`m` alone is
 *  ambiguous month/minute). Bracketed tokens ([Red], [$-409], [h]), quoted
 *  literals ("text"), and escaped chars are stripped first so a color/currency
 *  format like `[Red]#,##0` isn't mistaken for a date via the `d` in "Red". */
function isDateFormatCode(code: string): boolean {
  const stripped = code
    .replace(/\[[^\]]*\]/g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "");
  return /[yd]/i.test(stripped);
}

/** Normalize a numFmt formatCode into a deterministic, DOMAIN-AGNOSTIC, source-safe identity: the
 *  display GRAMMAR only. Strips locale/color/elapsed brackets (`[$-409]` `[Red]` `[h]`), QUOTED
 *  LITERALS (`"text"` — sanitizing any domain text so it never reaches a prompt), and escaped chars
 *  (`\.`); collapses whitespace and lowercases. The code NEVER names a format (it does not decide
 *  "US vs UK date") — it only carries the sanitized grammar so a downstream LLM can name a format
 *  CHANGE at runtime (owner 2026-06-27). `m/d/yyyy` and `d/m/yyyy` stay DISTINCT identities (the
 *  boundary is still caught) without any naming. Reuses the same strip rules as isDateFormatCode. */
function normalizeFormatCode(code: string): string {
  return code
    .replace(/\[[^\]]*\]/g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Parse styles.xml → (1) the set of cellXfs indexes (a cell's `s` attribute) whose number format
 *  is a date, so date-styled numeric cells can be typed as dates; and (2) `xfFormatIdentity`: each
 *  cellXf index → its domain-agnostic format-identity (sanitized display formatCode for custom
 *  formats; `b<numFmtId>` for builtin/General — an opaque key, NOT a naming table). The value-tile
 *  projection uses (2) to detect DISPLAY-format boundaries without the code ever naming the format. */
function parseStyles(xml: string): {
  dateXfIndexes: Set<number>;
  xfFormatIdentity: Map<number, string>;
} {
  const dateNumFmtIds = new Set<number>(BUILTIN_DATE_NUMFMT_IDS);
  // Custom numFmt definitions (numFmtId → raw formatCode) precede cellXfs in OOXML, so they are
  // fully known before the cellXfs loop resolves each xf's identity.
  const customFormatCode = new Map<number, string>();
  const dateXfIndexes = new Set<number>();
  const xfFormatIdentity = new Map<number, string>();
  let inCellXfs = false;
  let xfIndex = 0;
  const parser = new SaxesParser();
  parser.on("opentag", (node) => {
    const a = attrsOf(node);
    if (node.name === "numFmt") {
      const id = parseInt(a.numFmtId ?? "", 10);
      if (Number.isInteger(id) && a.formatCode) {
        customFormatCode.set(id, a.formatCode);
        if (isDateFormatCode(a.formatCode)) dateNumFmtIds.add(id);
      }
    } else if (node.name === "cellXfs") {
      inCellXfs = true; // the `s` attribute indexes into cellXfs, not cellStyleXfs
      xfIndex = 0;
    } else if (node.name === "xf" && inCellXfs) {
      const id = parseInt(a.numFmtId ?? "0", 10);
      if (dateNumFmtIds.has(id)) dateXfIndexes.add(xfIndex);
      const custom = customFormatCode.get(id);
      // custom → sanitized grammar; builtin (incl. General id 0) → opaque `b<id>` (no naming).
      xfFormatIdentity.set(xfIndex, custom !== undefined ? normalizeFormatCode(custom) : `b${id}`);
      xfIndex += 1;
    }
  });
  parser.on("closetag", (node) => {
    if (node.name === "cellXfs") inCellXfs = false;
  });
  parser.write(xml).close();
  return { dateXfIndexes, xfFormatIdentity };
}

/** Excel 1900-system serial → ISO date (YYYY-MM-DD). 25569 = serial of
 *  1970-01-01; correct for dates from 1900-03-01 on (covers real data). */
function excelSerialToISODate(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const d = new Date(Math.round((serial - 25569) * 86400000));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

interface ParsedPivotTable {
  name: string;
  location: string;
  rowFieldIdx: number[];
  colFieldIdx: number[];
  pageFieldIdx: number[];
  dataFields: Array<{ fld: number; name: string }>;
}
/** Parse a pivotTableN.xml: the field LAYOUT (which cache-field index sits on
 *  rows / columns / pages / data), not any cached data. */
function parsePivotTable(xml: string): ParsedPivotTable | null {
  let name = "";
  let location = "";
  let sawRoot = false;
  const rowFieldIdx: number[] = [];
  const colFieldIdx: number[] = [];
  const pageFieldIdx: number[] = [];
  const dataFields: Array<{ fld: number; name: string }> = [];
  let section: "row" | "col" | "page" | "data" | null = null;
  const parser = new SaxesParser();
  parser.on("opentag", (node) => {
    const a = attrsOf(node);
    switch (node.name) {
      case "pivotTableDefinition":
        name = a.name ?? "";
        sawRoot = true;
        break;
      case "location":
        if (a.ref) location = a.ref;
        break;
      case "rowFields":
        section = "row";
        break;
      case "colFields":
        section = "col";
        break;
      case "pageFields":
        section = "page";
        break;
      case "dataFields":
        section = "data";
        break;
      case "field": {
        const x = parseInt(a.x ?? "", 10);
        if (Number.isInteger(x) && x >= 0) {
          if (section === "row") rowFieldIdx.push(x);
          else if (section === "col") colFieldIdx.push(x);
        }
        break;
      }
      case "pageField": {
        const f = parseInt(a.fld ?? "", 10);
        if (Number.isInteger(f) && f >= 0) pageFieldIdx.push(f);
        break;
      }
      case "dataField": {
        const f = parseInt(a.fld ?? "", 10);
        if (Number.isInteger(f)) dataFields.push({ fld: f, name: a.name ?? "" });
        break;
      }
      default:
        break;
    }
  });
  parser.on("closetag", (node) => {
    if (
      node.name === "rowFields" ||
      node.name === "colFields" ||
      node.name === "pageFields" ||
      node.name === "dataFields"
    ) {
      section = null;
    }
  });
  parser.write(xml).close();
  return sawRoot ? { name, location, rowFieldIdx, colFieldIdx, pageFieldIdx, dataFields } : null;
}

/** Parse a pivotCacheDefinition: the source range/sheet and the cache field NAMES
 *  (indexed; pivot field placements reference them). Cache RECORDS are never read. */
function parsePivotCacheDefinition(xml: string): {
  sourceSheet: string | null;
  sourceRef: string | null;
  fieldNames: string[];
} {
  let sourceSheet: string | null = null;
  let sourceRef: string | null = null;
  const fieldNames: string[] = [];
  const parser = new SaxesParser();
  parser.on("opentag", (node) => {
    const a = attrsOf(node);
    if (node.name === "worksheetSource") {
      sourceSheet = a.sheet ?? null;
      sourceRef = a.ref ?? a.name ?? null;
    } else if (node.name === "cacheField") {
      fieldNames.push(a.name ?? "");
    }
  });
  parser.write(xml).close();
  return { sourceSheet, sourceRef, fieldNames };
}

interface ParsedWorksheet {
  dimensions: { rows: number; cols: number };
  used_range: string | null;
  protected: boolean;
  merged_ranges: Array<{ sheet: string; range: string }>;
  /** Data validations with design-C authority detection already computed in the parser
   *  (where dimStartCol is live): validation_type (structured dvType), origin-normalized
   *  applies_to_columns, and inline type=list enum members. The aggregate site places these
   *  verbatim — no further normalization needed. */
  data_validations: Array<{
    sheet: string;
    range: string;
    rule_summary: string;
    validation_type: string;
    members?: string[];
    members_truncated: boolean;
    applies_to_columns: number[];
  }>;
  /** Per-sheet deduplicated formula patterns (tier-1 exact-text). No `sheets` at the
   *  per-sheet level — the workbook merge adds it when combining across sheets. */
  formula_patterns: Array<{
    pattern: string;
    sample_cell: string;
    occurrence_count: number;
    applied_ranges: string[];
    cross_sheet_refs: string[];
    /** P1-C2-B′ #3: the origin-normalized column all this pattern's cells occupy, or null for a
     *  multi-column fill. Used per-sheet to mark a single uniform-formula column; not merged to the
     *  workbook level (column attribution is per-sheet). */
    applies_to_single_column: number | null;
  }>;
  /** Every formula cell on this sheet, counted regardless of the distinct-pattern cap. */
  formula_cells_total: number;
  /** A new distinct pattern was dropped at the distinct-pattern cap (occurrence still counted). */
  formula_patterns_capped: boolean;
  error_cells: Array<{ sheet: string; cell: string; token: string }>;
  rows: string[][];
  /** CUT-2 EXPERIMENTAL: per-cell cellXf index (the `s` attribute), index-aligned with `rows`,
   *  captured ONLY when `xfFormatIdentity` was supplied to the parser. Resolve an index to its
   *  domain-agnostic format-identity via the workbook's `xfFormatIdentity` map. */
  formatRows?: number[][];
  rows_truncated: boolean;
  /** A structural cap (formula/merge/validation/error) was hit — folds into
   *  capture_truncated so the artifact doesn't read as complete (Codex P2). */
  caps_hit: boolean;
}
/** Maximum characters kept from a single validation bounds expression: a list source can
 *  be arbitrarily long, but the prompt only needs enough to audit the constraint shape. */
const XLSX_VALIDATION_FORMULA_CHARS = 200;
// Length bound for a validation sqref before whitespace-splitting it into sub-ranges, so a
// crafted huge whitespace-union cannot allocate an unbounded array (Codex round3 #6). A real
// sqref references a handful of ranges; this is a generous safety ceiling.
const XLSX_VALIDATION_SQREF_CHARS = 8192;

/** Build an auditable data-validation rule summary from the captured constraint fields.
 *  formula1/formula2 are the rule BOUNDS (list source, min/max, date) — the constraint
 *  definition, not raw cell data — so rendering them lets the reviewer verify
 *  data_validation_coverage instead of seeing only the validation kind. Long expressions
 *  are bounded with an explicit ellipsis so the summary never balloons. */
function buildValidationRuleSummary(rule: {
  type: string;
  operator: string;
  formula1: string;
  formula2: string;
  /** Optional pre-parsed inline-list members (computed once at capture). Reused here so the
   *  member count is not re-split from formula1 (Codex round2 #4). */
  members?: { members?: string[]; truncated: boolean };
}): string {
  const clip = (text: string): string =>
    text.length > XLSX_VALIDATION_FORMULA_CHARS
      ? `${text.slice(0, XLSX_VALIDATION_FORMULA_CHARS)}…`
      : text;
  // For a type=list INLINE formula1, do NOT echo the declared values here: they are carried by
  // the bounded `members` field (VALIDATION_MEMBER_* caps). Echoing them in rule_summary would be
  // a second, differently-bounded value channel that leaks over-cap declared labels into the
  // prompt/admission artifact when `members` is suppressed (Codex round1 #2). Summarize as a
  // member count (reusing the bounded parse, never a fresh full split); a range-ref or non-list
  // formula1 keeps the clipped display.
  const renderFormula1 = (f1: string): string => {
    if (rule.type === "list" && f1.trim().startsWith('"')) {
      const m = rule.members ?? parseInlineListMembers(f1);
      return m.members ? `list(${m.members.length} members)` : "list(capped)";
    }
    return clip(f1);
  };
  const parts = [`type=${rule.type || "any"}`];
  if (rule.operator) parts.push(`operator=${rule.operator}`);
  if (rule.formula1) parts.push(`formula1=${renderFormula1(rule.formula1)}`);
  if (rule.formula2) parts.push(`formula2=${clip(rule.formula2)}`);
  return parts.join("; ");
}

/** design-C declared enum members from a dataValidation formula1 (type=list only).
 *  Returns members ONLY when formula1 is an INLINE quoted literal (`"a,b,c"`): strip the
 *  outer quotes, split on the list separator (`,`), trim. A RANGE-REF formula1 (members live
 *  in other cells, e.g. `Lists!$A$1:$A$5`) is UNRESOLVED → `{ members: undefined,
 *  truncated: true }`. Over the count cap, or any member over the char cap → also truncated
 *  with members absent (a long "member" signals it is not an enum). Never reads observed
 *  cell values. */
function parseInlineListMembers(formula1: string): {
  members?: string[];
  truncated: boolean;
} {
  const trimmed = formula1.trim();
  // Inline literal: starts (and, well-formed, ends) with a double quote. Anything else
  // (a range ref, a defined name) is unresolved here.
  if (!trimmed.startsWith('"')) return { truncated: true };
  // Strip the outer quotes (drop a trailing quote if present).
  const inner = trimmed.endsWith('"') && trimmed.length >= 2
    ? trimmed.slice(1, -1)
    : trimmed.slice(1);
  // Bound the work BEFORE splitting (Codex round2 #4): a valid in-cap list is at most
  // COUNT_CAP × (CHAR_CAP + 1) chars, so anything longer cannot be in-cap — return truncated
  // without materializing every member of a crafted/huge streamed inline list.
  if (inner.length > VALIDATION_MEMBER_COUNT_CAP * (VALIDATION_MEMBER_CHAR_CAP + 1)) {
    return { truncated: true };
  }
  const members = inner.split(",").map((m) => m.trim());
  if (members.length > VALIDATION_MEMBER_COUNT_CAP) return { truncated: true };
  if (members.some((m) => m.length > VALIDATION_MEMBER_CHAR_CAP)) return { truncated: true };
  return { members, truncated: false };
}

/** design-C: the origin-NORMALIZED profiled column indices a validation sqref covers.
 *  Split sqref on whitespace (a multi-range sqref like "A1:A5 C1:C5"), parse each sub-range
 *  with parseDimension (NOT parseCellRef — sqref entries are ranges), union the column spans,
 *  normalize each by `- dimStartCol` (same frame as the cell-column normalization), and keep
 *  only `0 <= c < profiledCols`. A whole-column ref (`B:B` / `$B:$D`) fails parseDimension (no
 *  row), so its column-letter span is parsed directly and mapped to ITS columns only — not the
 *  whole sheet (Codex round2 #1). Result is sorted ascending and de-duplicated. The sqref is
 *  length-bounded and iteration stops once every profiled column is covered, so a crafted huge
 *  whitespace-union cannot consume unbounded memory/CPU (Codex round3 #6). */
function parseSqrefColumns(
  sqref: string,
  dimStartCol: number,
  profiledCols: number,
): number[] {
  const cols = new Set<number>();
  // Add an ABSOLUTE column span, normalized to the used-range origin and CLAMPED to the profiled
  // window [dimStartCol, dimStartCol + profiledCols) before iterating — so a crafted huge range
  // (e.g. A1:ZZZZZZ1) cannot make this walk millions of columns (Codex #4).
  const addAbsSpan = (startAbs: number, endAbs: number): void => {
    const lo = Math.max(startAbs, dimStartCol);
    const hi = Math.min(endAbs, dimStartCol + profiledCols - 1);
    for (let abs = lo; abs <= hi; abs += 1) cols.add(abs - dimStartCol);
  };
  // Bound before splitting: cap the sqref length (a pathological union can be huge) and stop once
  // every profiled column is already covered — neither can add more (Codex round3 #6).
  const bounded =
    sqref.length > XLSX_VALIDATION_SQREF_CHARS
      ? sqref.slice(0, XLSX_VALIDATION_SQREF_CHARS)
      : sqref;
  for (const sub of bounded.split(/\s+/)) {
    if (cols.size >= profiledCols) break;
    const ref = sub.trim();
    if (ref.length === 0) continue;
    const d = parseDimension(ref);
    if (d) {
      addAbsSpan(d.startCol, d.startCol + d.dims.cols - 1);
      continue;
    }
    // Whole-column range (B:B / $B:$D): no row component, so parseDimension declined. Map it to
    // ITS column span (not the whole sheet) so the declared enum attaches only to those columns
    // (Codex #1).
    const m = /^\$?([A-Z]+):\$?([A-Z]+)$/.exec(ref);
    if (m) {
      const a = columnLettersToIndex(m[1]!);
      const b = columnLettersToIndex(m[2]!);
      addAbsSpan(Math.min(a, b), Math.max(a, b));
    }
  }
  return [...cols].sort((a, b) => a - b);
}

/** A streaming worksheet parser: pipe decompressed chunks through `write`, then
 *  `finalize`, then read `getResult`. The worksheet is never materialized whole;
 *  the per-sheet cell scan is bounded by `caps` (cell VALUE work stops at the row
 *  cap, structural parts after <sheetData> are still captured). */
function createWorksheetParser(args: {
  sharedStrings: string[];
  sheetName: string;
  caps: DataLayerCaps;
  dateXfIndexes: Set<number>;
  /** When supplied (experimental value-tile path), capture per-cell cellXf indexes into `formatRows`
   *  (index-aligned with `rows`) for domain-agnostic display-format boundary detection. Absent in the
   *  production path → no `formatRows` captured, artifact byte-identical. */
  xfFormatIdentity?: Map<number, string>;
}): { write: (text: string) => void; finalize: () => void; getResult: () => ParsedWorksheet } {
  const { sharedStrings, sheetName, caps, dateXfIndexes, xfFormatIdentity } = args;
  const captureFormats = xfFormatIdentity !== undefined;
  const merged_ranges: ParsedWorksheet["merged_ranges"] = [];
  // design-C: capture each validation's RAW fields during streaming; resolve
  // validation_type / members / applies_to_columns at getResult time, when dimStartCol is
  // final and the profiled-column count is known (so normalization is in the right frame).
  // design-C (Codex round2 #5): members + the clipped rule_summary are computed at CAPTURE from
  // the full formula text (which is transient, one validation at a time), so this never retains
  // raw formula1/formula2 for up to XLSX_DATAVALIDATION_CAP entries until getResult.
  const rawValidations: Array<{
    sqref: string;
    type: string;
    members?: string[];
    membersTruncated: boolean;
    rule_summary: string;
  }> = [];
  // Tier-1 exact-text formula dedup, accumulated at extraction time. The key is the
  // resolved formula text (followers resolve to the master verbatim), so a fill-down
  // collapses to one entry. occurrence_count counts every cell of a retained pattern;
  // formulaCellsTotal counts EVERY formula cell (cap-independent). XLSX_FORMULA_CAP is
  // repurposed as a DISTINCT-pattern cap; dropping a new pattern at the cap sets
  // formulaPatternsCapped (an honest lower-bound flag), not capsHit.
  const formulaPatterns = new Map<
    string,
    {
      sample_cell: string;
      occurrence_count: number;
      applied_ranges: string[];
      cross_sheet_refs: string[];
      // P1-C2-B′ #3: the origin-normalized column this pattern's cells occupy, or null once a cell in
      // a DIFFERENT column is seen (multi-column fill). Used to detect a single uniform-formula column.
      single_col: number | null;
    }
  >();
  let formulaCellsTotal = 0;
  let formulaPatternsCapped = false;
  const error_cells: ParsedWorksheet["error_cells"] = [];
  const rows: string[][] = [];
  // Per-cell cellXf index, index-aligned with `rows` (only populated when captureFormats). A cell's
  // domain-agnostic format-identity is recovered later via xfFormatIdentity.get(index).
  const formatRows: number[][] = [];
  let protectedSheet = false;
  let declaredDims: { rows: number; cols: number } | null = null;
  let declaredUsedRange: string | null = null;
  let dimStartCol = 0; // used-range origin column (0 = A); normalizes cell columns
  let firstRowNum = -1; // r of the first <row> seen; anchors sparse-gap padding
  let maxRow = 0;
  let maxCol = 0;
  let rowsTruncated = false;
  let capsHit = false;

  // Shared formulas: only the master cell carries text (`<f t="shared" si="N">…`),
  // followers are empty (`<f t="shared" si="N"/>`). Resolve followers to the master.
  const sharedFormulas = new Map<string, string>();
  let cellHasFormula = false;
  let fShared = false;
  let fSi = "";

  let curRow: string[] | null = null;
  let curFormatRow: number[] | null = null;
  let cellRef = "";
  let cellType = "";
  let cellStyle = -1;
  let cellCol = 0;
  let inV = false;
  let inF = false;
  let inIs = false;
  let inIsT = false;
  let vText = "";
  let fText = "";
  let isText = "";

  // dataValidation rule capture: a validation's BOUNDS live in its formula1/formula2
  // children (a list source, a min/max, a date) and its comparison in the `operator`
  // attribute — the constraint DEFINITION a reviewer must audit, not raw cell data. We
  // accumulate them across the open/text/close of one <dataValidation> and emit on close
  // so data_validation_coverage is backed by the actual rule, not just `type=`.
  let dvActive = false;
  let dvType = "";
  let dvOperator = "";
  let dvSqref = "";
  let dvFormula1 = "";
  let dvFormula2 = "";
  let inDvF1 = false;
  let inDvF2 = false;

  const parser = new SaxesParser();
  parser.on("opentag", (node) => {
    const a = attrsOf(node);
    switch (node.name) {
      case "dimension": {
        if (a.ref) {
          const d = parseDimension(a.ref);
          if (d) {
            declaredDims = d.dims;
            declaredUsedRange = d.usedRange;
            dimStartCol = d.startCol;
          }
        }
        break;
      }
      case "sheetProtection":
        protectedSheet = true;
        break;
      case "mergeCell":
        if (a.ref) {
          if (merged_ranges.length < XLSX_MERGE_CAP) merged_ranges.push({ sheet: sheetName, range: a.ref });
          else capsHit = true;
        }
        break;
      case "dataValidation":
        // Begin a validation; the rule_summary is built on close from type + operator +
        // formula1/formula2 (the bounds), so the reviewer sees the constraint, not just
        // its kind. self-closing (<dataValidation .../>) still fires a closetag below.
        dvActive = true;
        dvType = a.type ?? "any";
        dvOperator = a.operator ?? "";
        dvSqref = a.sqref ?? "";
        dvFormula1 = "";
        dvFormula2 = "";
        break;
      case "formula1":
        if (dvActive) {
          inDvF1 = true;
          dvFormula1 = "";
        }
        break;
      case "formula2":
        if (dvActive) {
          inDvF2 = true;
          dvFormula2 = "";
        }
        break;
      case "row": {
        // Honor the row's `r` index so omitted empty rows leave real gaps —
        // otherwise sparse sheets collapse and inflate completeness ratios. Gaps
        // are padded as empty rows, bounded by the row cap.
        const rowNum = parseInt(a.r ?? "0", 10);
        if (rowNum > 0) {
          if (firstRowNum < 0) firstRowNum = rowNum;
          const targetIndex = rowNum - firstRowNum;
          while (rows.length < targetIndex && rows.length < caps.max_rows_scanned_per_sheet) {
            rows.push([]);
            if (captureFormats) formatRows.push([]); // keep formatRows index-aligned with rows
          }
        }
        curRow = rows.length >= caps.max_rows_scanned_per_sheet ? null : [];
        curFormatRow = curRow === null ? null : captureFormats ? [] : null;
        if (curRow === null) rowsTruncated = true;
        break;
      }
      case "c": {
        cellRef = a.r ?? "";
        cellType = a.t ?? "";
        cellStyle = a.s !== undefined ? parseInt(a.s, 10) : -1;
        const parsed = cellRef ? parseCellRef(cellRef) : null;
        // Normalize to the used-range origin so an offset sheet (e.g. B2:D10)
        // doesn't gain phantom leading empty columns.
        cellCol = parsed ? Math.max(0, parsed.col - dimStartCol) : curRow ? curRow.length : 0;
        if (parsed) {
          maxRow = Math.max(maxRow, parsed.row);
          maxCol = Math.max(maxCol, parsed.col + 1);
        }
        vText = "";
        fText = "";
        isText = "";
        cellHasFormula = false;
        fShared = false;
        fSi = "";
        break;
      }
      case "v":
        inV = true;
        vText = "";
        break;
      case "f":
        inF = true;
        fText = "";
        cellHasFormula = true;
        fShared = a.t === "shared";
        fSi = a.si ?? "";
        break;
      case "is":
        inIs = true;
        isText = "";
        break;
      case "t":
        if (inIs) inIsT = true;
        break;
      default:
        break;
    }
  });
  parser.on("text", (t) => {
    if (inV) vText += t;
    else if (inF) fText += t;
    else if (inIsT) isText += t;
    else if (inDvF1) dvFormula1 += t;
    else if (inDvF2) dvFormula2 += t;
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
      case "formula1":
        inDvF1 = false;
        break;
      case "formula2":
        inDvF2 = false;
        break;
      case "dataValidation":
        if (dvActive) {
          dvActive = false;
          if (rawValidations.length < XLSX_DATAVALIDATION_CAP) {
            // Parse declared enum members from the FULL formula1 now (bounded by
            // parseInlineListMembers) and build the clipped rule_summary here, retaining only
            // bounded results — the raw formula text is not accumulated (Codex round2 #5).
            const parsedMembers =
              dvType === "list" ? parseInlineListMembers(dvFormula1) : { truncated: true };
            rawValidations.push({
              sqref: dvSqref,
              type: dvType,
              ...(parsedMembers.members !== undefined
                ? { members: parsedMembers.members }
                : {}),
              membersTruncated: parsedMembers.truncated,
              rule_summary: buildValidationRuleSummary({
                type: dvType,
                operator: dvOperator,
                formula1: dvFormula1,
                formula2: dvFormula2,
                members: parsedMembers,
              }),
            });
          } else {
            capsHit = true;
          }
        }
        break;
      case "c": {
        // Formula + error are structural (kept regardless of the row cap, bounded
        // by their own caps). The cell's grid value is the cached <v> result.
        // A shared-formula master stores its text; a follower (empty <f>) reuses it
        // so filled-down formulas are not undercounted.
        let formulaText = fText;
        if (fShared && fSi) {
          if (fText.length > 0) sharedFormulas.set(fSi, fText);
          else formulaText = sharedFormulas.get(fSi) ?? "";
        }
        if (cellHasFormula) {
          // tier-1 exact-text dedup, keyed on the resolved formula text (followers
          // resolve to the master verbatim, so fill-downs collapse to one entry).
          formulaCellsTotal += 1; // counts every formula cell, cap-independent.
          const existing = formulaPatterns.get(formulaText);
          if (existing) {
            existing.occurrence_count += 1;
            // Single-column attribution (#3): a cell in a different column demotes the pattern to
            // multi-column (null), so it can never mark a column as a single uniform formula.
            if (existing.single_col !== null && existing.single_col !== cellCol) existing.single_col = null;
            if (existing.applied_ranges.length < XLSX_FORMULA_APPLIED_RANGE_CAP) {
              existing.applied_ranges.push(cellRef);
            }
            for (const ref of extractCrossSheetRefs(formulaText, sheetName)) {
              if (!existing.cross_sheet_refs.includes(ref)) existing.cross_sheet_refs.push(ref);
            }
          } else if (formulaPatterns.size < XLSX_FORMULA_CAP) {
            formulaPatterns.set(formulaText, {
              sample_cell: cellRef,
              occurrence_count: 1,
              applied_ranges: [cellRef],
              cross_sheet_refs: extractCrossSheetRefs(formulaText, sheetName),
              single_col: cellCol,
            });
          } else {
            // Distinct-pattern cap hit: the cell is still counted in formulaCellsTotal,
            // but the new distinct pattern is dropped — an honest lower bound.
            formulaPatternsCapped = true;
          }
        }
        if (cellType === "e") {
          if (error_cells.length < XLSX_ERROR_CELL_CAP) {
            error_cells.push({ sheet: sheetName, cell: cellRef, token: vText });
          } else {
            capsHit = true;
          }
        }
        if (curRow) {
          let value: string;
          if (cellType === "s") value = sharedStrings[parseInt(vText, 10)] ?? "";
          else if (cellType === "inlineStr") value = isText;
          else if (cellType === "b") value = vText === "1" ? "true" : "false";
          else if (
            (cellType === "" || cellType === "n") &&
            vText.length > 0 &&
            dateXfIndexes.has(cellStyle)
          ) {
            // Numeric serial with a date number format → emit the ISO date so the
            // column is typed as a date, not a number (Codex P2).
            value = excelSerialToISODate(Number(vText)) ?? vText;
          } else value = vText; // str / e / n / default number
          if (cellCol >= 0) {
            while (curRow.length < cellCol) curRow.push("");
            curRow[cellCol] = value;
            if (curFormatRow) {
              while (curFormatRow.length < cellCol) curFormatRow.push(-1);
              curFormatRow[cellCol] = cellStyle; // cellXf index; -1 = no style (General)
            }
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
          if (captureFormats) formatRows.push(curFormatRow ?? []);
          curRow = null;
          curFormatRow = null;
        }
        break;
      default:
        break;
    }
  });
  return {
    write: (text: string) => {
      parser.write(text);
    },
    finalize: () => {
      parser.close();
    },
    getResult: (): ParsedWorksheet => {
      // design-C authority resolution: members + rule_summary were already resolved at capture
      // (Codex round2 #5); now that dimStartCol and the full grid are final, compute the
      // profiled-column count (same frame as profileSheetRows) and the normalized covered columns.
      const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
      const profiledCols = Math.min(colCount, caps.max_columns_profiled);
      const data_validations: ParsedWorksheet["data_validations"] = rawValidations.map(
        (v) => ({
          sheet: sheetName,
          range: v.sqref,
          rule_summary: v.rule_summary,
          validation_type: v.type,
          ...(v.members !== undefined ? { members: v.members } : {}),
          members_truncated: v.membersTruncated,
          applies_to_columns: parseSqrefColumns(v.sqref, dimStartCol, profiledCols),
        }),
      );
      return {
      dimensions: declaredDims ?? { rows: maxRow, cols: maxCol },
      used_range: declaredUsedRange,
      protected: protectedSheet,
      merged_ranges,
      data_validations,
      // Materialize each entry with its key (the formula text) as `pattern`.
      formula_patterns: [...formulaPatterns.entries()].map(([pattern, entry]) => ({
        pattern,
        sample_cell: entry.sample_cell,
        occurrence_count: entry.occurrence_count,
        applied_ranges: entry.applied_ranges,
        cross_sheet_refs: entry.cross_sheet_refs,
        applies_to_single_column: entry.single_col,
      })),
      formula_cells_total: formulaCellsTotal,
      formula_patterns_capped: formulaPatternsCapped,
      error_cells,
      rows,
      ...(captureFormats ? { formatRows } : {}),
      rows_truncated: rowsTruncated,
      caps_hit: capsHit,
      };
    },
  };
}

// ════════════════════════ P1-C1 — segmented value-tile projection (production) ════════════════════════
//
// design `20260625-rescoped-comprehension-engine-design.md` §3.1: the engine's ONLY new deterministic
// surface, now WIRED into production (P1-C1, §7/§12). The projection is a pure function of the SINGLE
// observer pass's `rows[][]` grid (the exact input `profileSheetRows` consumes; zero source re-scan)
// plus `formatRows` (per-cell cellXf from the same pass), surfaced under `segmented_value_tiles`.
// NOT a raw-value dump (P12: aggregate signatures only; bounded distinct; sanitized format-identity).
export interface ValueTileOpts {
  /** Row-window size of one segment (the detection grid). Benchmark-backed SSOT candidate (§3.1/P6);
   *  detection grid is ⊥ to localization resolution — the bracketed refine pins the exact boundary row
   *  regardless of this window (§13). */
  window: number;
  /** Hard cap on segments retained per column (P12 bounded memory: O(columns × segments), not O(cells)). */
  segmentsPerColumnCap: number;
  /** Hard cap on distinct values retained per segment (bounded signature, not a raw dump). */
  distinctPerSegmentCap: number;
}

export const DEFAULT_VALUE_TILE_OPTS: ValueTileOpts = {
  window: 1024,
  segmentsPerColumnCap: 256,
  distinctPerSegmentCap: 32,
};

/** A normalized SERIALIZATION shape of one raw cell string (not the value, the shape). The dominant
 *  shape per segment is the contradiction-ground (R8): a shape change between adjacent segments is a
 *  boundary candidate. Derived purely from the value string already in `rows[][]` — so a DISPLAY-only
 *  numFmt change on uniform date serials (which the pass already collapsed to ISO) is invisible here;
 *  that is the separate-scan/fold exception Cut-2 characterizes, not a value-string signature. */
function serializationShape(raw: string): string {
  const v = raw.trim();
  if (v.length === 0) return "EMPTY";
  if (/^(true|false)$/i.test(v)) return "BOOL";
  if (/^-?\d+$/.test(v)) return "INT";
  if (/^-?\d+\.\d+$/.test(v)) return "DEC";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return "ISO_DATE";
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) return "ISO_DATETIME";
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)) return "SLASH_DATE";
  if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(v)) return "DOT_DATE";
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v)) return "EMAIL";
  return "TEXT";
}

export interface ValueTileSegment {
  /** 1-based inclusive sheet-row range of this segment (anchored at the grid's first row = 1). */
  row_start: number;
  row_end: number;
  non_empty: number;
  /** Per-InferredColumnType counts over non-empty cells (reuses `classifyValue`). */
  type_counts: Record<string, number>;
  /** Per-serialization-shape counts over non-empty cells. */
  shape_counts: Record<string, number>;
  /** Deterministic dominant shape (max count; ties broken by shape name ASC). null when all-empty. */
  dominant_shape: string | null;
  /** Per-format-identity counts over non-empty cells (DISPLAY format; domain-agnostic & source-safe).
   *  Empty {} when format capture is off (production until T1). */
  format_counts: Record<string, number>;
  /** Deterministic dominant format-identity (max count; ties by identity ASC). null when off/all-empty. */
  dominant_format: string | null;
  /** Bounded distinct value set within the segment (capped → is_lower_bound). */
  distinct_count: number;
  distinct_is_lower_bound: boolean;
}

/** A boundary candidate between two adjacent same-column segments whose dominant shape differs, refined
 *  to the EXACT transition row by a bracketed scan over only those two windows (§13 intra_tile_note). */
export interface IntraTileNote {
  /** Which signal moved at this boundary: a value-string SHAPE change, or a DISPLAY-format (numFmt)
   *  change. `prev_shape`/`new_shape` hold the serialization shape for `value_shape`, or the
   *  sanitized domain-agnostic format-identity for `display_format` (a downstream LLM names it). */
  boundary_kind: "value_shape" | "display_format";
  prev_shape: string;
  new_shape: string;
  /** Last row (1-based) carrying the prev shape/format before the transition. */
  last_prev_format_row: number;
  /** First row (1-based) carrying the new shape/format. */
  first_new_format_row: number;
}

export interface ColumnValueTiles {
  column_index: number;
  segments: ValueTileSegment[];
  /** True when `segmentsPerColumnCap` stopped new-segment creation (segments are an honest lower bound). */
  segments_capped: boolean;
  intra_tile_notes: IntraTileNote[];
}

export interface SheetValueTileProjection {
  sheet: string;
  window: number;
  columns: ColumnValueTiles[];
  /** Structural memory witness (P12): the number of segment records the result actually retains — bounds the
   *  projection's OWN footprint as O(columns × segments), independent of the cell count. */
  retained_segments: number;
  /** Sum of per-segment distinct COUNTS. NOTE: the distinct-value Sets are LOCAL to each segment loop and
   *  discarded (only the integer `distinct_count` is kept per segment) — so no distinct VALUES are retained;
   *  this is a conservative upper proxy for the per-segment distinct work, not retained memory. */
  summed_segment_distinct_count: number;
}

/** Pick the exact transition row inside the bracket [a.row_start, b.row_end] of two adjacent segments:
 *  the last row whose shape == prev before the first row whose shape == new. Scans only the two windows
 *  (bounded), so the localization resolution is row-precise regardless of `window` (P6). */
function refineBoundary(args: {
  rows: string[][];
  col: number;
  bracketStartRow: number;
  bracketEndRow: number;
  prevSig: string;
  newSig: string;
  boundaryKind: IntraTileNote["boundary_kind"];
  /** rowIdx0 = 0-based row index; returns the cell's signature, or null to SKIP (empty/off). */
  signatureOf: (rowIdx0: number, col: number) => string | null;
}): IntraTileNote | null {
  const { rows, col, bracketStartRow, bracketEndRow, prevSig, newSig, boundaryKind, signatureOf } = args;
  // rows[] is 0-based; sheet rows are 1-based. bracket rows are 1-based inclusive.
  let firstNew = -1;
  for (let r = bracketStartRow - 1; r <= bracketEndRow - 1 && r < rows.length; r += 1) {
    const sig = signatureOf(r, col);
    if (sig === null) continue;
    if (sig === newSig) {
      firstNew = r;
      break;
    }
  }
  if (firstNew < 0) return null;
  let lastPrev = -1;
  for (let r = firstNew - 1; r >= bracketStartRow - 1; r -= 1) {
    const sig = signatureOf(r, col);
    if (sig === null) continue;
    if (sig === prevSig) {
      lastPrev = r;
      break;
    }
  }
  if (lastPrev < 0) return null;
  return {
    boundary_kind: boundaryKind,
    prev_shape: prevSig,
    new_shape: newSig,
    last_prev_format_row: lastPrev + 1,
    first_new_format_row: firstNew + 1,
  };
}

/** CUT-2: project the segmented value-tile surface from the already-materialized `rows[][]` grid. PURE
 *  (no source re-scan, no file read) and DETERMINISTIC (fixed iteration order). Holds only bounded
 *  per-segment aggregates (P12). `rows` is `parsed.rows` from the single streaming pass — the same input
 *  `profileSheetRows` consumes. */
export function projectSegmentedValueTiles(args: {
  sheetName: string;
  rows: string[][];
  caps: DataLayerCaps;
  opts: ValueTileOpts;
  /** Per-cell cellXf indexes (index-aligned with `rows`) + the workbook's format-identity map. When
   *  both present, the projection ALSO detects domain-agnostic DISPLAY-format boundaries (the code
   *  never names a format; a downstream LLM names the change). Absent → value-shape boundaries only. */
  formatRows?: number[][];
  xfFormatIdentity?: Map<number, string>;
}): SheetValueTileProjection {
  const { sheetName, rows, caps, opts, formatRows, xfFormatIdentity } = args;
  const captureFormats = formatRows !== undefined && xfFormatIdentity !== undefined;
  // A cell's value-string serialization shape, or null to SKIP (empty cell).
  const valueSigOf = (rowIdx0: number, c: number): string | null => {
    const cell = (rows[rowIdx0] ?? [])[c] ?? "";
    return cell.trim().length === 0 ? null : serializationShape(cell);
  };
  // A cell's domain-agnostic format-identity, or null to SKIP (empty value cell / no style / off).
  const formatSigOf = (rowIdx0: number, c: number): string | null => {
    if (!captureFormats) return null;
    const cell = (rows[rowIdx0] ?? [])[c] ?? "";
    if (cell.trim().length === 0) return null;
    return xfFormatIdentity!.get((formatRows![rowIdx0] ?? [])[c] ?? -1) ?? null;
  };
  // Deterministic dominant key: max count, ties broken by key name ASC (shared by shape + format).
  const dominantOf = (counts: Record<string, number>): string | null => {
    let best: string | null = null;
    let bestCount = -1;
    for (const [k, c] of Object.entries(counts).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      if (c > bestCount) {
        bestCount = c;
        best = k;
      }
    }
    return best;
  };
  const colCount = Math.min(
    rows.reduce((m, r) => Math.max(m, r.length), 0),
    caps.max_columns_profiled,
  );
  const window = Math.max(1, opts.window);
  const columns: ColumnValueTiles[] = [];
  let retainedSegments = 0;
  let summedSegmentDistinct = 0;

  for (let col = 0; col < colCount; col += 1) {
    const segments: ValueTileSegment[] = [];
    let segmentsCapped = false;
    for (let segStart = 0; segStart < rows.length; segStart += window) {
      if (segments.length >= opts.segmentsPerColumnCap) {
        segmentsCapped = true;
        break;
      }
      const segEnd = Math.min(segStart + window, rows.length);
      const typeCounts: Record<string, number> = {};
      const shapeCounts: Record<string, number> = {};
      const formatCounts: Record<string, number> = {};
      const distinct = new Set<string>();
      let distinctLowerBound = false;
      let nonEmpty = 0;
      for (let r = segStart; r < segEnd; r += 1) {
        const cell = (rows[r] ?? [])[col] ?? "";
        if (cell.trim().length === 0) continue;
        nonEmpty += 1;
        const t = classifyValue(cell);
        typeCounts[t] = (typeCounts[t] ?? 0) + 1;
        const s = serializationShape(cell);
        shapeCounts[s] = (shapeCounts[s] ?? 0) + 1;
        if (captureFormats) {
          const fid = formatSigOf(r, col);
          if (fid !== null) formatCounts[fid] = (formatCounts[fid] ?? 0) + 1;
        }
        if (distinct.size < opts.distinctPerSegmentCap) distinct.add(cell);
        else if (!distinct.has(cell)) distinctLowerBound = true;
      }
      const dominant = dominantOf(shapeCounts);
      const dominantFormat = captureFormats ? dominantOf(formatCounts) : null;
      segments.push({
        row_start: segStart + 1,
        row_end: segEnd,
        non_empty: nonEmpty,
        type_counts: typeCounts,
        shape_counts: shapeCounts,
        dominant_shape: dominant,
        format_counts: formatCounts,
        dominant_format: dominantFormat,
        distinct_count: distinct.size,
        distinct_is_lower_bound: distinctLowerBound,
      });
      retainedSegments += 1;
      summedSegmentDistinct += distinct.size;
    }
    // Boundary candidates: adjacent non-empty segments whose dominant shape differs → refine to the exact
    // transition row over the two-window bracket.
    const intraTileNotes: IntraTileNote[] = [];
    for (let i = 1; i < segments.length; i += 1) {
      const prev = segments[i - 1]!;
      const cur = segments[i]!;
      // value-string SHAPE boundary
      if (
        prev.dominant_shape !== null &&
        cur.dominant_shape !== null &&
        prev.dominant_shape !== cur.dominant_shape
      ) {
        const note = refineBoundary({
          rows,
          col,
          bracketStartRow: prev.row_start,
          bracketEndRow: cur.row_end,
          prevSig: prev.dominant_shape,
          newSig: cur.dominant_shape,
          boundaryKind: "value_shape",
          signatureOf: valueSigOf,
        });
        if (note) intraTileNotes.push(note);
      }
      // DISPLAY-format boundary (domain-agnostic format-identity; a downstream LLM names the change)
      if (
        captureFormats &&
        prev.dominant_format !== null &&
        cur.dominant_format !== null &&
        prev.dominant_format !== cur.dominant_format
      ) {
        const note = refineBoundary({
          rows,
          col,
          bracketStartRow: prev.row_start,
          bracketEndRow: cur.row_end,
          prevSig: prev.dominant_format,
          newSig: cur.dominant_format,
          boundaryKind: "display_format",
          signatureOf: formatSigOf,
        });
        if (note) intraTileNotes.push(note);
      }
    }
    columns.push({ column_index: col, segments, segments_capped: segmentsCapped, intra_tile_notes: intraTileNotes });
  }

  return {
    sheet: sheetName,
    window,
    columns,
    retained_segments: retainedSegments,
    summed_segment_distinct_count: summedSegmentDistinct,
  };
}
// ══════════════════════════════════ END CUT-2 EXPERIMENTAL ══════════════════════════════════

/** Build the inventory from xlsx/xlsm bytes (design §11.2). Deterministic and
 *  read-only. `content_sha256` is the RAW-byte hash, supplied by the caller. */
export function buildXlsxInventory(args: {
  sourceRef: string;
  bytes: Uint8Array;
  contentSha256: string;
  workbookKind: WorkbookKind;
  caps?: DataLayerCaps;
  /** P1-C1 (§3.1): row-window value-tile opts. Production callers may omit → DEFAULT_VALUE_TILE_OPTS.
   *  The segmented value-tile projection (incl. domain-agnostic display-format boundaries) is ALWAYS
   *  produced now and surfaced under `segmented_value_tiles`. */
  valueTileOpts?: ValueTileOpts;
}): WorkbookStructuralInventory {
  const caps = args.caps ?? DEFAULT_DATA_LAYER_CAPS;
  const valueTileOpts = args.valueTileOpts ?? DEFAULT_VALUE_TILE_OPTS;
  const valueTiles: SheetValueTileProjection[] = [];
  const risk_signals: InventoryRiskSignal[] = [];
  let captureTruncated = false;
  // Macro presence is evidence-based: the actual xl/vbaProject.bin part, detected
  // during pass 1 (onMacro). The .xlsm extension alone is NOT proof — a
  // macro-enabled-format workbook can be macro-free (avoids false positives).
  let macroPresent = false;

  const unsupported = (reason: string): WorkbookStructuralInventory =>
    unsupportedInventory({
      sourceRef: args.sourceRef,
      contentSha256: args.contentSha256,
      workbookKind: args.workbookKind,
      reason,
    });

  // Pass 1: stream the small parts (workbook, rels, sharedStrings, sheet rels,
  // tables, pivot definitions) into memory. Worksheets and the giant pivot cache
  // RECORDS are NOT inflated here (pivotCacheDefinition is; records are skipped).
  let parts: Map<string, string>;
  try {
    parts = streamCollectEntries({
      bytes: args.bytes,
      want: (name) =>
        name === "xl/workbook.xml" ||
        name === "xl/_rels/workbook.xml.rels" ||
        name === "xl/sharedStrings.xml" ||
        name === "xl/styles.xml" ||
        (name.startsWith("xl/worksheets/_rels/") && name.endsWith(".rels")) ||
        (name.startsWith("xl/tables/") && name.endsWith(".xml")) ||
        (name.startsWith("xl/externalLinks/_rels/") && name.endsWith(".rels")) ||
        (name.startsWith("xl/pivotTables/") && (name.endsWith(".xml") || name.endsWith(".rels"))) ||
        (name.startsWith("xl/pivotCache/") && name.endsWith(".xml") && name.includes("Definition")),
      onMacro: () => {
        macroPresent = true;
      },
      onOversized: (name) => {
        captureTruncated = true;
        risk_signals.push({
          kind: "oversized_zip_entry",
          location: name,
          literal: `decompressed part exceeds ${XLSX_PART_BYTE_BUDGET} bytes; dropped`,
        });
      },
    });
  } catch (error) {
    return unsupported(`xlsx unzip failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const workbookXml = parts.get("xl/workbook.xml");
  if (!workbookXml) {
    return unsupported("xlsx missing xl/workbook.xml (not a valid OOXML workbook)");
  }

  let workbook: ParsedWorkbook;
  let workbookRels: ParsedRel[];
  let sharedStrings: string[];
  let dateXfIndexes: Set<number>;
  // Domain-agnostic display-format identity per cellXf index (value-tile boundary detection).
  let xfFormatIdentity: Map<number, string>;
  try {
    workbook = parseWorkbook(workbookXml);
    const relsXml = parts.get("xl/_rels/workbook.xml.rels");
    workbookRels = relsXml ? parseRels(relsXml) : [];
    const sstXml = parts.get("xl/sharedStrings.xml");
    sharedStrings = sstXml ? parseSharedStrings(sstXml) : [];
    const stylesXml = parts.get("xl/styles.xml");
    const styles = stylesXml
      ? parseStyles(stylesXml)
      : { dateXfIndexes: new Set<number>(), xfFormatIdentity: new Map<number, string>() };
    dateXfIndexes = styles.dateXfIndexes;
    xfFormatIdentity = styles.xfFormatIdentity;
  } catch (error) {
    return unsupported(`xlsx workbook parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // B4: bound the number of OBSERVED worksheets. A pathological many-sheet workbook would
  // otherwise hold every sheet's row-grid in memory at once and persist an unbounded
  // inventory (the per-workbook analog of bounded observation). The cap is conservatively
  // high, so normal workbooks are untouched; when hit, capture_truncated discloses it. This
  // bounds the set feeding BOTH the sheetByPath population and the final inventory loop.
  let sheetCountTotal: number | undefined;
  if (workbook.sheets.length > caps.max_sheets_observed) {
    sheetCountTotal = workbook.sheets.length; // preserve the true total before slicing
    workbook.sheets = workbook.sheets.slice(0, caps.max_sheets_observed);
    captureTruncated = true;
  }

  const relById = new Map(workbookRels.map((r) => [r.id, r]));

  // External workbook links: the workbook rel points to an INTERNAL part
  // (externalLinks/externalLinkN.xml); the real external file/URL lives in that
  // part's own .rels (TargetMode=External). Resolve to the actual dependency.
  const external_links = workbookRels
    .filter((r) => r.type.toLowerCase().endsWith("externallink"))
    .map((r) => {
      const partPath = resolveZipPath("xl", r.target);
      const relsXml = parts.get(
        `${path.posix.dirname(partPath)}/_rels/${path.posix.basename(partPath)}.rels`,
      );
      const ext = relsXml
        ? parseRels(relsXml).find(
            (rr) => rr.targetMode === "External" || rr.type.toLowerCase().endsWith("externallinkpath"),
          )
        : undefined;
      return { target: ext?.target ?? r.target, kind: "external_workbook_link" };
    });

  const named_ranges = workbook.definedNames.map((dn) => ({
    name: dn.name,
    scope: dn.localSheetId !== undefined ? `sheet:${dn.localSheetId}` : "workbook",
    refers_to: dn.refersTo,
  }));

  // Resolve each sheet's worksheet entry path and its owned tables + pivot tables
  // (from pass-1 sheet rels + parts — all small, already in memory).
  const sheetByPath = new Map<string, { name: string; rid: string; hidden: boolean }>();
  const tables: Array<{ name: string; sheet: string; range: string }> = [];
  const pivotRefs: Array<{ sheet: string; baseDir: string; pivotPath: string }> = [];
  for (const sheetEntry of workbook.sheets) {
    const rel = relById.get(sheetEntry.rid);
    const sheetPath = rel ? resolveZipPath("xl", rel.target) : null;
    if (!sheetPath) continue;
    sheetByPath.set(sheetPath, sheetEntry);
    const sheetDir = path.posix.dirname(sheetPath);
    const sheetRelsXml = parts.get(`${sheetDir}/_rels/${path.posix.basename(sheetPath)}.rels`);
    if (!sheetRelsXml) continue;
    for (const r of parseRels(sheetRelsXml)) {
      const type = r.type.toLowerCase();
      // pivotTable type also ends with "table" — check it first.
      if (type.endsWith("pivottable")) {
        pivotRefs.push({ sheet: sheetEntry.name, baseDir: sheetDir, pivotPath: resolveZipPath(sheetDir, r.target) });
      } else if (type.endsWith("table")) {
        const tableXml = parts.get(resolveZipPath(sheetDir, r.target));
        const table = tableXml ? parseTable(tableXml) : null;
        if (table) tables.push({ name: table.name, sheet: sheetEntry.name, range: table.ref });
      }
    }
  }

  // Build pivot tables: parse each pivotTableN.xml + resolve its cache definition
  // (field names + source) via the pivot's rels. Cache RECORDS are never read.
  const pivot_tables: WorkbookStructuralInventory["pivot_tables"] = [];
  const pivotHostSheets = new Set<string>();
  const PIVOT_CAP = 300;
  for (const { sheet, pivotPath } of pivotRefs) {
    if (pivot_tables.length >= PIVOT_CAP) {
      captureTruncated = true;
      risk_signals.push({
        kind: "pivot_table_cap",
        location: path.basename(args.sourceRef),
        literal: `more than ${PIVOT_CAP} pivot tables; remainder omitted`,
      });
      break;
    }
    const pivotXml = parts.get(pivotPath);
    if (!pivotXml) continue;
    const pt = parsePivotTable(pivotXml);
    if (!pt) continue;
    let fieldNames: string[] = [];
    let sourceSheet: string | null = null;
    let sourceRef: string | null = null;
    const pivotDir = path.posix.dirname(pivotPath);
    const pivotRelsXml = parts.get(`${pivotDir}/_rels/${path.posix.basename(pivotPath)}.rels`);
    if (pivotRelsXml) {
      for (const r of parseRels(pivotRelsXml)) {
        if (!r.type.toLowerCase().endsWith("pivotcachedefinition")) continue;
        const cacheXml = parts.get(resolveZipPath(pivotDir, r.target));
        if (cacheXml) {
          const cache = parsePivotCacheDefinition(cacheXml);
          fieldNames = cache.fieldNames;
          sourceSheet = cache.sourceSheet;
          sourceRef = cache.sourceRef;
        }
        break;
      }
    }
    const nameOf = (idx: number) => fieldNames[idx] ?? `field_${idx}`;
    pivot_tables.push({
      name: pt.name,
      sheet,
      location: pt.location,
      source_sheet: sourceSheet,
      source_ref: sourceRef,
      row_fields: pt.rowFieldIdx.map(nameOf),
      column_fields: pt.colFieldIdx.map(nameOf),
      page_fields: pt.pageFieldIdx.map(nameOf),
      data_fields: pt.dataFields.map((d) => d.name || nameOf(d.fld)),
    });
    pivotHostSheets.add(sheet);
  }

  // Pass 2: stream each worksheet through a SAX parser chunk-by-chunk — a
  // hundred-MB sheet is bounded by the row cap, never held whole.
  const parsedByPath = new Map<string, ParsedWorksheet>();
  try {
    streamWorksheets({
      bytes: args.bytes,
      want: (name) => sheetByPath.has(name),
      sinkFor: (name) => {
        const sheetEntry = sheetByPath.get(name);
        if (!sheetEntry) return null;
        const wp = createWorksheetParser({
          sharedStrings,
          sheetName: sheetEntry.name,
          caps,
          dateXfIndexes,
          xfFormatIdentity,
        });
        return {
          write: wp.write,
          finalize: () => {
            wp.finalize();
            parsedByPath.set(name, wp.getResult());
          },
        };
      },
    });
  } catch {
    // A corrupt worksheet aborts the streaming push; sheets parsed before it are
    // retained, and any sheet missing from parsedByPath degrades to unreadable below.
  }

  const sheets: InventorySheet[] = [];
  const per_sheet_data: PerSheetData[] = [];
  const distinct_value_vocab: DistinctValueVocabEntry[] = [];
  const crossSheetInput: Array<{ sheet: string; valueSets: Map<string, Set<string>> }> = [];
  // Workbook-level formula patterns deduped by pattern text ACROSS sheets (the per-sheet
  // map is keyed within a sheet; the same fill-down on two sheets shares one entry here).
  const formulaPatternsByText = new Map<string, WorkbookStructuralInventory["formula_patterns"][number]>();
  let formulaCellsTotal = 0;
  let formulaCellsTotalIsLowerBound = false;
  const merged_ranges: WorkbookStructuralInventory["merged_ranges"] = [];
  const data_validations: WorkbookStructuralInventory["data_validations"] = [];
  const error_cells: WorkbookStructuralInventory["error_cells"] = [];

  for (const sheetEntry of workbook.sheets) {
    const rel = relById.get(sheetEntry.rid);
    const sheetPath = rel ? resolveZipPath("xl", rel.target) : null;
    const parsed = sheetPath ? parsedByPath.get(sheetPath) : undefined;
    if (!parsed) {
      // Sheet part missing/unreadable — record it literally, keep the others.
      risk_signals.push({
        kind: "unreadable_sheet_part",
        location: sheetEntry.name,
        literal: sheetPath ? `missing or unreadable entry ${sheetPath}` : `unresolved relationship ${sheetEntry.rid}`,
      });
      sheets.push({
        name: sheetEntry.name,
        used_range: null,
        dimensions: { rows: 0, cols: 0 },
        hidden: sheetEntry.hidden,
        protected: false,
      });
      per_sheet_data.push({ sheet: sheetEntry.name, layout_kind: "unknown", header_rows: null, header_confidence: "low", columns: [] });
      continue;
    }

    if (parsed.rows_truncated || parsed.caps_hit) captureTruncated = true;
    // Merge per-sheet formula patterns into the workbook-level set, deduped by pattern
    // text across sheets: sum occurrences, union sheets/cross_sheet_refs, merge
    // applied_ranges bounded to the cap, keep the first sample_cell.
    for (const p of parsed.formula_patterns) {
      const existing = formulaPatternsByText.get(p.pattern);
      if (existing) {
        existing.occurrence_count += p.occurrence_count;
        if (!existing.sheets.includes(sheetEntry.name)) existing.sheets.push(sheetEntry.name);
        for (const ref of p.cross_sheet_refs) {
          if (!existing.cross_sheet_refs.includes(ref)) existing.cross_sheet_refs.push(ref);
        }
        for (const range of p.applied_ranges) {
          if (existing.applied_ranges.length >= XLSX_FORMULA_APPLIED_RANGE_CAP) break;
          existing.applied_ranges.push(range);
        }
      } else {
        formulaPatternsByText.set(p.pattern, {
          pattern: p.pattern,
          sample_cell: p.sample_cell,
          occurrence_count: p.occurrence_count,
          applied_ranges: p.applied_ranges.slice(0, XLSX_FORMULA_APPLIED_RANGE_CAP),
          sheets: [sheetEntry.name],
          cross_sheet_refs: [...p.cross_sheet_refs],
        });
      }
    }
    formulaCellsTotal += parsed.formula_cells_total;
    if (parsed.formula_patterns_capped) formulaCellsTotalIsLowerBound = true;
    merged_ranges.push(...parsed.merged_ranges);
    data_validations.push(...parsed.data_validations);
    error_cells.push(...parsed.error_cells);

    const profile = profileSheetRows({ sheetName: sheetEntry.name, rows: parsed.rows, caps });
    // P1-C2-B′ #3 (gate follow-up): deterministic uniform-formula detection. A column is structurally
    // complete when EXACTLY ONE single-column formula pattern covers its data cells (occurrence_count
    // === non_empty_count) — a fill-down whose refs shift but whose structure is one repeated formula
    // (Excel stores these as shared formulas, already deduped to one pattern with an exact count). The
    // leaf-read trigger skips such columns. Conservative: a partial-formula column, a multi-formula
    // column (a row-range break is real structure), or a multi-column fill fails the match and is READ
    // (safe over-read; never a wrong skip). Same origin-normalized column frame as profile.columns.
    if (parsed.formula_patterns.length > 0) {
      const singleColFormula = new Map<number, { total: number; patterns: number }>();
      for (const p of parsed.formula_patterns) {
        if (p.applies_to_single_column === null) continue;
        const agg = singleColFormula.get(p.applies_to_single_column) ?? { total: 0, patterns: 0 };
        agg.total += p.occurrence_count;
        agg.patterns += 1;
        singleColFormula.set(p.applies_to_single_column, agg);
      }
      for (const col of profile.columns) {
        const agg = singleColFormula.get(col.index);
        if (agg && agg.patterns === 1 && col.non_empty_count > 0 && agg.total === col.non_empty_count) {
          col.is_uniform_formula = true;
        }
      }
    }
    // P1-C1: the value-tile projection is a PURE FUNCTION of `parsed.rows` (the exact grid
    // `profileSheetRows` just consumed) + `parsed.formatRows` (per-cell cellXf, same pass) — zero
    // source re-scan, computed at the same site. Always produced now (bounded by caps + opts).
    valueTiles.push(
      projectSegmentedValueTiles({
        sheetName: sheetEntry.name,
        rows: parsed.rows,
        caps,
        opts: valueTileOpts,
        ...(parsed.formatRows ? { formatRows: parsed.formatRows, xfFormatIdentity } : {}),
      }),
    );
    if (profile.data_layer_truncated || profile.col_count > caps.max_columns_profiled) {
      captureTruncated = true;
    }
    risk_signals.push(...profile.risk_signals);
    distinct_value_vocab.push(...profile.distinct_value_vocab);
    if (profile.column_value_sets.size > 0) {
      crossSheetInput.push({ sheet: sheetEntry.name, valueSets: profile.column_value_sets });
    }

    const dims = parsed.dimensions;
    sheets.push({
      name: sheetEntry.name,
      // Prefer the declared dimension's used range (preserves an offset origin);
      // fall back to an A1-anchored range derived from scanned extents.
      used_range: parsed.used_range ?? (dims.rows > 0 ? `R1C1:R${dims.rows}C${dims.cols}` : null),
      dimensions: dims,
      hidden: sheetEntry.hidden,
      protected: parsed.protected,
    });
    // A pivot-hosting sheet whose own layout isn't a confident flat table is a
    // crosstab (uses the otherwise-unset pivot_or_crosstab kind). A sheet with a
    // real header that merely also anchors a pivot keeps its tabular layout — the
    // pivots are recorded separately in pivot_tables.
    const hostsPivot = pivotHostSheets.has(sheetEntry.name);
    per_sheet_data.push({
      sheet: sheetEntry.name,
      layout_kind:
        hostsPivot && profile.layout_kind !== "tabular" ? "pivot_or_crosstab" : profile.layout_kind,
      header_rows: profile.header_rows,
      header_confidence: profile.header_confidence,
      columns: profile.columns,
    });
  }

  const { overlaps: cross_sheet_key_overlap, truncated: overlapTruncated } =
    computeCrossSheetKeyOverlap(crossSheetInput, caps);
  if (overlapTruncated) captureTruncated = true;

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
    pivot_tables,
    formula_patterns: [...formulaPatternsByText.values()],
    formula_cells_total: formulaCellsTotal,
    formula_cells_total_is_lower_bound: formulaCellsTotalIsLowerBound,
    merged_ranges,
    data_validations,
    external_links,
    error_cells,
    macro_present: macroPresent,
    risk_signals,
    per_sheet_data,
    distinct_value_vocab,
    cross_sheet_key_overlap,
    data_layer_caps: caps,
    capture_truncated: captureTruncated,
    ...(sheetCountTotal !== undefined ? { sheet_count_total: sheetCountTotal } : {}),
    segmented_value_tiles: valueTiles,
    value_tile_config: valueTileOpts,
    unsupported_reason: null,
  };
}

const SPREADSHEET_EXTENSION_KINDS: Record<string, WorkbookKind> = {
  ".csv": "csv",
  ".tsv": "tsv",
  ".xlsx": "xlsx",
  ".xlsm": "xlsm",
  ".xls": "xls",
  ".xlsb": "xlsb",
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
    unsupported_reason: args.reason,
  };
}

/** A pre-read gate on the compressed source size: the whole file is loaded into
 *  a Buffer (then streaming-unzipped), so an oversized source must fail loud with
 *  an unsupported_reason rather than OOM the host before caps can apply. */
const MAX_SOURCE_BYTES = 1024 * 1024 * 1024; // 1 GiB

/** Observe a spreadsheet source file. csv/tsv use the pure-Node extractor and
 *  xlsx/xlsm the streaming fflate+saxes extractor; xls/xlsb/ods return
 *  `unsupported_reason`. `content_sha256` is always the RAW-byte hash. */
export async function observeSpreadsheetSource(
  sourceRef: string,
  opts?: { caps?: DataLayerCaps },
): Promise<WorkbookStructuralInventory> {
  const ext = path.extname(sourceRef).toLowerCase();
  const workbookKind = SPREADSHEET_EXTENSION_KINDS[ext];
  let bytes: Buffer;
  try {
    const stat = await fs.stat(sourceRef);
    if (stat.size > MAX_SOURCE_BYTES) {
      return unsupportedInventory({
        sourceRef,
        contentSha256: "",
        workbookKind: workbookKind ?? "csv",
        reason: `source too large (${stat.size} bytes > ${MAX_SOURCE_BYTES}); not read`,
      });
    }
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
  // CRASH ISOLATION: structural extraction can throw — most concretely a 512MB–1GiB CSV
  // whose bytes pass the size gate but exceed V8's ~512MB string limit on
  // `bytes.toString("utf8")`, plus any unexpected parser failure. Degrade THIS workbook to
  // an honest unsupported inventory (preserving the already-computed raw-byte hash) instead
  // of throwing out of the observer and aborting the whole review prep / reconstruct run.
  try {
    if (workbookKind === "csv" || workbookKind === "tsv") {
      return buildCsvInventory({
        sourceRef,
        content: bytes.toString("utf8"),
        contentSha256,
        // The .tsv extension is definitive — force tabs instead of re-detecting.
        ...(workbookKind === "tsv" ? { delimiter: "\t" as const } : {}),
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
    // xls (BIFF binary) / xlsb (binary OOXML) / ods (a different ZIP/XML schema) —
    // separate parsers, not yet implemented (design §11.2 scoped xlsx/xlsm first).
    // The workbook_kind is preserved (not mislabeled csv) so the artifact is honest.
    return unsupportedInventory({
      sourceRef,
      contentSha256,
      workbookKind,
      reason: `${workbookKind} extraction not yet implemented (xls/xlsb/ods deferred; xlsx/xlsm supported)`,
    });
  } catch (error) {
    return unsupportedInventory({
      sourceRef,
      contentSha256,
      workbookKind,
      reason: `structural observation failed (${error instanceof Error ? error.message : String(error)})`,
    });
  }
}

/**
 * The single shared projection of a workbook inventory used by BOTH reconstruct and
 * review. It returns a structural + aggregate-only view: raw cell values —
 * `distinct_value_vocab[].top_values` (and any future sample/key-value fields) — are
 * excluded. Both consumers route through this so the aggregate-only default (the
 * inventory is a structural/aggregate index, not a data dump) is enforced in ONE
 * place and cannot drift between them.
 *
 * design-C narrowing: `data_validations[].members` IS value-bearing but passes through
 * unchanged — it is DECLARED schema (the type=list enum labels from formula1), not observed
 * data, and is already bounded at emission (VALIDATION_MEMBER_COUNT_CAP / _CHAR_CAP, never
 * sourced from cell values). Per-column cardinality (distinct_count / non_empty_count) is a
 * COUNT, not a value, so it likewise passes through.
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

// ───────────────── Prompt projection (SIZE axis — bounds array size for the prompt) ─────────────────
//
// `projectInventoryForAdmission` returns the aggregate-only view (no raw values). It
// does NOT bound array SIZE: a real workbook yields tens of thousands of formula cells and
// thousands of per-(sheet,column) vocab rows (one observed file: 27,245 formula
// cells across 14 sheets). The persisted inventory keeps all of them (replay /
// provenance), but a SEED-AUTHORING PROMPT must carry only a bounded, representative
// structural sample — otherwise the inventory overflows the model window with no
// budget guard (the content_excerpt budget, which a workbook never has, does not
// cover it). This is the spreadsheet analog of the document excerpt projection
// budget: capture whole, project a bounded view at prompt time, and record what was
// dropped so the prompt stays honest (the seed author can declare a limitation).
//
// v1 uses fixed, model-agnostic head caps: a representative structural sample is the
// right product shape regardless of window (you never want all 27,245 formula cells
// in a prompt), and fixed caps are safe even for the smallest registered window.
// Window-proportional sizing is a deferred refinement (calibrated at the live bench,
// like the document budget's CJK calibration).

export interface WorkbookInventoryPromptCaps {
  /** formula_patterns kept (Stage 1.1). Patterns are already deduped (a fill-down is one
   *  entry), so a single global head-N over the small distinct set is enough — no per-sheet
   *  split is needed. `formula_cells_total` (+ is_lower_bound) is unaffected by this cap. */
  max_formula_patterns: number;
  /** Max sheets kept in per_sheet_data. The per-column cap bounds each sheet, but a
   *  high-sheet-count workbook still needs a sheet ceiling. */
  max_sheets: number;
  /** columns[] kept per per_sheet_data entry (a wide sheet can profile up to
   *  data_layer_caps.max_columns_profiled = 512 columns). */
  max_columns_per_sheet: number;
  max_distinct_value_vocab: number;
  max_pivot_tables: number;
  max_cross_sheet_overlaps: number;
  /** pairwise_overlap kept per kept cross_sheet_key_overlap entry. */
  max_pairwise_per_overlap: number;
  max_named_ranges: number;
  max_tables: number;
  max_data_validations: number;
  max_external_links: number;
  max_error_cells: number;
  max_merged_ranges: number;
  max_risk_signals: number;
  /** P1-C1 #5: value-tile sheets kept in the reconstruct-only prompt projection (PRELIMINARY,
   *  pending INV-BENCH-1 calibration). */
  max_value_tile_sheets: number;
  /** boundary-bearing columns kept per value-tile sheet. */
  max_value_tile_columns_per_sheet: number;
  /** intra_tile_notes kept per kept value-tile column. */
  max_value_tile_notes_per_column: number;
}

export const DEFAULT_WORKBOOK_INVENTORY_PROMPT_CAPS: WorkbookInventoryPromptCaps = {
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
  // P1-C1 #5 PRELIMINARY (live calibration = INV-BENCH-1 follow-up).
  max_value_tile_sheets: 50,
  max_value_tile_columns_per_sheet: 32,
  max_value_tile_notes_per_column: 16,
};

/** One dropped-detail record per section the projection actually trimmed. The seed
 *  author reads these to declare an honest limitation about partial structural
 *  evidence (handoff B2 / §11 honesty). */
export interface WorkbookInventorySectionTruncation {
  section: string;
  kept: number;
  total: number;
}

export interface WorkbookInventoryProjectionResult {
  inventory: WorkbookStructuralInventory;
  truncated: boolean;
  sections: WorkbookInventorySectionTruncation[];
}

/**
 * Bounded, representative prompt projection of a workbook inventory (SIZE axis).
 * Pure, deterministic, total: it never mutates the input and never throws, mirroring
 * `projectInventoryForAdmission`. The returned `sections` enumerate exactly the
 * arrays that were trimmed (kept < total) so truncation is surfaced honestly rather
 * than silently swallowed.
 */
export function projectInventoryForPrompt(
  inventory: WorkbookStructuralInventory,
  caps: WorkbookInventoryPromptCaps = DEFAULT_WORKBOOK_INVENTORY_PROMPT_CAPS,
  opts: { includeValueTiles?: boolean } = {},
): WorkbookInventoryProjectionResult {
  // P1-C1: value-tile is RECONSTRUCT-ONLY in prompts (§12 T8). value_tile_config is an internal
  // resume input and is NEVER prompt-projected; segmented_value_tiles is omitted from the projection
  // unless the caller opts in (#5). The shared review path (renderSpreadsheetStructuralView) does NOT
  // opt in → its rendered view stays byte-stable and the value tile never leaks into a review prompt.
  const { segmented_value_tiles: rawValueTiles, value_tile_config, ...inventoryRest } = inventory;
  void value_tile_config;
  const sections: WorkbookInventorySectionTruncation[] = [];
  const record = (section: string, kept: number, total: number): void => {
    if (kept < total) sections.push({ section, kept, total });
  };

  // Formula patterns are already deduped (a fill-down is one entry), so a single head-N
  // over the small distinct set bounds the prompt. formula_cells_total (+ is_lower_bound)
  // pass through unchanged below — the honest true-total is never trimmed.
  const formulaPatterns = inventory.formula_patterns.slice(0, caps.max_formula_patterns);
  record("formula_patterns", formulaPatterns.length, inventory.formula_patterns.length);

  // per_sheet_data: cap the number of SHEETS first (bounds a high-sheet-count
  // workbook), then cap each kept sheet's columns[]. columnsTotal sums only kept
  // sheets — a dropped sheet's column loss is implied by the per_sheet_data record.
  const keptSheets = inventory.per_sheet_data.slice(0, caps.max_sheets);
  record("per_sheet_data", keptSheets.length, inventory.per_sheet_data.length);
  let columnsKept = 0;
  let columnsTotal = 0;
  const perSheetData = keptSheets.map((sheet) => {
    columnsTotal += sheet.columns.length;
    // design-C: when a sheet has more columns than the fixed cap, RE-SELECT which columns
    // survive by residual priority (highest cardinality first, the most informative residual
    // signal) instead of a positional head-N — then emit the survivors in ORIGINAL index
    // order for readability. Pure: sort a COPY, never mutate the input. The kept COUNT is
    // unchanged (cap), so the truncation disclosure (kept/total) stays accurate.
    let columns: InventoryColumn[];
    if (sheet.columns.length <= caps.max_columns_per_sheet) {
      columns = sheet.columns;
    } else {
      const selected = new Set(
        [...sheet.columns]
          .sort(compareColumnResidualDesc)
          .slice(0, caps.max_columns_per_sheet),
      );
      columns = sheet.columns.filter((col) => selected.has(col));
    }
    columnsKept += columns.length;
    return { ...sheet, columns };
  });
  record("per_sheet_data.columns", columnsKept, columnsTotal);

  const distinctValueVocab = inventory.distinct_value_vocab.slice(
    0,
    caps.max_distinct_value_vocab,
  );
  record(
    "distinct_value_vocab",
    distinctValueVocab.length,
    inventory.distinct_value_vocab.length,
  );

  const pivotTables = inventory.pivot_tables.slice(0, caps.max_pivot_tables);
  record("pivot_tables", pivotTables.length, inventory.pivot_tables.length);

  // cross_sheet_key_overlap: cap the entry list AND each kept entry's pairwise list.
  let pairwiseKept = 0;
  let pairwiseTotal = 0;
  const crossSheetOverlaps = inventory.cross_sheet_key_overlap
    .slice(0, caps.max_cross_sheet_overlaps)
    .map((overlap) => {
      pairwiseTotal += overlap.pairwise_overlap.length;
      const pairwise = overlap.pairwise_overlap.slice(0, caps.max_pairwise_per_overlap);
      pairwiseKept += pairwise.length;
      return { ...overlap, pairwise_overlap: pairwise };
    });
  record(
    "cross_sheet_key_overlap",
    crossSheetOverlaps.length,
    inventory.cross_sheet_key_overlap.length,
  );
  // pairwiseTotal only sums the KEPT entries; report the trim only when those entries
  // were themselves trimmed (a dropped entry's pairwise loss is implied by the entry
  // record above, so double-counting it would overstate the pairwise total).
  record("cross_sheet_key_overlap.pairwise_overlap", pairwiseKept, pairwiseTotal);

  const namedRanges = inventory.named_ranges.slice(0, caps.max_named_ranges);
  record("named_ranges", namedRanges.length, inventory.named_ranges.length);

  const tables = inventory.tables.slice(0, caps.max_tables);
  record("tables", tables.length, inventory.tables.length);

  const dataValidations = inventory.data_validations.slice(0, caps.max_data_validations);
  record("data_validations", dataValidations.length, inventory.data_validations.length);

  const externalLinks = inventory.external_links.slice(0, caps.max_external_links);
  record("external_links", externalLinks.length, inventory.external_links.length);

  const errorCells = inventory.error_cells.slice(0, caps.max_error_cells);
  record("error_cells", errorCells.length, inventory.error_cells.length);

  const mergedRanges = inventory.merged_ranges.slice(0, caps.max_merged_ranges);
  record("merged_ranges", mergedRanges.length, inventory.merged_ranges.length);

  const riskSignals = inventory.risk_signals.slice(0, caps.max_risk_signals);
  record("risk_signals", riskSignals.length, inventory.risk_signals.length);

  // P1-C1 #5: bounded value-tile projection (reconstruct opt-in). Keep only boundary-bearing columns
  // (intra_tile_notes are the load-bearing witness — prev/new shape+format + the EXACT transition
  // rows) and DROP the verbose per-segment aggregates from the prompt (segments:[]). Bounded by
  // sheets/columns/notes caps; every trim is recorded for honest truncation disclosure.
  let valueTilesProjected: SheetValueTileProjection[] | undefined;
  if (opts.includeValueTiles && rawValueTiles) {
    const keptVtSheets = rawValueTiles.slice(0, caps.max_value_tile_sheets);
    record("segmented_value_tiles", keptVtSheets.length, rawValueTiles.length);
    let vtColsKept = 0;
    let vtColsTotal = 0;
    let vtNotesKept = 0;
    let vtNotesTotal = 0;
    valueTilesProjected = keptVtSheets.map((s) => {
      const boundaryCols = s.columns.filter((c) => c.intra_tile_notes.length > 0);
      vtColsTotal += boundaryCols.length;
      const keptCols = boundaryCols.slice(0, caps.max_value_tile_columns_per_sheet);
      vtColsKept += keptCols.length;
      const columns = keptCols.map((c) => {
        vtNotesTotal += c.intra_tile_notes.length;
        const notes = c.intra_tile_notes.slice(0, caps.max_value_tile_notes_per_column);
        vtNotesKept += notes.length;
        return { ...c, segments: [], intra_tile_notes: notes };
      });
      return { ...s, columns };
    });
    record("segmented_value_tiles.columns", vtColsKept, vtColsTotal);
    record("segmented_value_tiles.intra_tile_notes", vtNotesKept, vtNotesTotal);
  }

  return {
    inventory: {
      ...inventoryRest,
      formula_patterns: formulaPatterns,
      per_sheet_data: perSheetData,
      distinct_value_vocab: distinctValueVocab,
      pivot_tables: pivotTables,
      cross_sheet_key_overlap: crossSheetOverlaps,
      named_ranges: namedRanges,
      tables,
      data_validations: dataValidations,
      external_links: externalLinks,
      error_cells: errorCells,
      merged_ranges: mergedRanges,
      risk_signals: riskSignals,
      // P1-C1 §12 T8/#5: value-tile included ONLY when the caller opts in (reconstruct), bounded to
      // boundary witnesses; omitted by default so review's shared projection stays byte-stable.
      ...(valueTilesProjected ? { segmented_value_tiles: valueTilesProjected } : {}),
    },
    truncated: sections.length > 0,
    sections,
  };
}
