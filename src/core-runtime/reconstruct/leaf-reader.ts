import { createHash } from "node:crypto";
import {
  compareColumnResidualDesc,
  type InventoryColumn,
  type SheetValueTileProjection,
  type WorkbookStructuralInventory,
} from "../spreadsheet-structure-observer.js";
import {
  LEAF_SEMANTIC_ROLES,
  type LeafReadLabel,
  type LeafReadProducedResult,
  type LeafSemanticRole,
} from "./comprehension-artifact.js";
import { readReconstructLlmDispatchFailureError } from "./llm-dispatch-failure.js";

// ─────────────────────────────────────────────────────────────────────────────
// leaf-reader (§3.2 / P1-C2-A · P1-C2-B′) — the FIRST LLM-touch. For a region the deterministic
// observer could not fully capture — a low-confidence (unstructured) region, OR a high-confidence
// column whose structure is incomplete (P1-C2-B′ §3) — the leaf-reader asks the LLM to CAPTURE what
// structure missed: a provisional label, an optional analytical role, and an optional note on the
// structure/meaning the aggregate signatures reveal.
//
// Honesty (§2.2/§2.3):
//  - The label/role/note TEXT is the LLM's only contribution. The confidence tags are DETERMINISTIC:
//    the read is always forced confidence='low' and is_lower_bound=true — the LLM cannot claim a
//    strong reading on a structurally weak region (graceful degrade, non-authoritative).
//  - Input is bounded deterministic structural metadata: value-tile shapes/format-identities,
//    header-candidate rows, and (for a resolved high-confidence column) the deterministic column
//    HEADER LABEL + inferred type/distinct count. NO raw DATA cell values and no literal formatCodes
//    reach the LLM (source-safety, P1-C1 §3.4). The header label is column IDENTITY (already visible
//    to the authoring LLM via the inventory), not row data; PII/value redaction is out of scope by
//    owner governance. So `captured_note` is free LLM text but is grounded ONLY on these aggregate
//    signals + the header label — it has no raw data value to restate.
//  - Localization stays grounded on the deterministic value-tile (degrade is naming-only); a wrong
//    label cannot corrupt correlation because this cut feeds no reduce/merge.
//  - Failure (LLM hard error) and empty reads are explicit outcomes, never a silent success (§11 R9).
//
// This module is LLM-caller-injected (`callLlm`) so it is exercised by the INV-MOCK-1 fixture in
// tests and the real authoring caller in production; the module itself is realization-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

/** Single-source leaf-read prompt template. Registered in the authoring-prompt catalog (CG-1) so an
 *  edit rotates the resume key; also hashed into the llm_touch_fingerprint ⓑ (leaf_prompt_sha256).
 *  The opening line is the mock dispatcher's stable key — keep it stable when editing the body. */
export const LEAF_READ_SYSTEM_PROMPT = [
  "Read provisional column labels for a low-confidence spreadsheet region.",
  "",
  "You are given bounded, aggregate-only evidence about spreadsheet columns the deterministic",
  "observer could NOT fully capture — either a region whose header could not be resolved",
  "(low-confidence), or a high-confidence column whose structure is incomplete (free-text or",
  "high-residual content the deterministic summary does not pin down). The evidence is value-shape /",
  "display-format signatures, the rows where a signature changes, candidate header row indices, and —",
  "for a resolved column — the deterministic column HEADER LABEL / inferred type / distinct count. You",
  "are NOT given raw DATA cell values: the header label is column identity, not row data.",
  "",
  "For each column you can read, return:",
  " - tentative_label: a SHORT label naming what the column most likely holds;",
  ' - semantic_role (optional): one of "category" | "measure" | "identifier" | "free_text" |',
  '   "reference" — a SINGLE-COLUMN guess from the signals; "identifier"/"reference" are tentative',
  "   hints only (relationships are judged downstream, not here);",
  " - captured_note (optional): a SHORT note on structure or meaning the signatures reveal that the",
  "   deterministic summary did not (e.g. a hidden grouping, or what a format boundary signifies).",
  "Omit a column you cannot read rather than guessing. Return STRICT JSON:",
  '{ "labels": [{ "column_index": <int>, "tentative_label": "<short label>",',
  '              "semantic_role": "<role>"?, "captured_note": "<short note>"? }],',
  '  "unread_columns": [{ "column_index": <int>, "reason": "<why unreadable>" }] }',
  "",
  "Your reads are provisional and non-authoritative; the runtime tags every read low-confidence.",
  "Base every label, role, and note ONLY on the deterministic signals provided (header label, inferred",
  "type, distinct count, value-shape/format signatures, boundary rows) — you are given NO raw DATA cell",
  "values, so a note must never invent or restate a literal data value.",
].join("\n");

export function leafReadPromptSha256(): string {
  return createHash("sha256").update(LEAF_READ_SYSTEM_PROMPT).digest("hex");
}

/** Why a region/column was selected for a leaf-read (P1-C2-B′ §2.1; honest trigger provenance — a
 *  structure-incomplete column in a HIGH-confidence sheet must not ship a false 'low header' lineage). */
export type LeafReadTrigger = "low_confidence_header" | "structure_incomplete";

/** Bounded, source-safe evidence for one leaf-read region (one sheet). Deterministic structural
 *  metadata + the column HEADER LABEL only; NO raw DATA cell values (source-safety, P1-C1 §3.4). */
export interface LeafReadRegionEvidence {
  sheet: string;
  /** Why this region is read (P1-C2-B′). Defaults to low_confidence_header for the P1-C2-A path. */
  trigger?: LeafReadTrigger;
  /** Candidate header rows the deterministic heuristic could not confirm (indices only). */
  header_candidate_rows: number[];
  columns: {
    column_index: number;
    /** Column name (HIGH-confidence tabular sheets only; the deterministic header name). */
    column_name?: string;
    /** Deterministic structural signals (HIGH-confidence sheets) — the basis the structure-
     *  incompleteness trigger selected on; NOT raw values (counts/type only). */
    inferred_type?: string;
    distinct_count?: number;
    distinct_is_estimate?: boolean;
    dominant_shape: string | null;
    dominant_format: string | null;
    /** Boundary witnesses for this column (shape/format transitions; row numbers only). */
    boundaries: {
      boundary_kind: "value_shape" | "display_format";
      prev_shape: string;
      new_shape: string;
      first_new_format_row: number;
    }[];
  }[];
}

export type LeafReadOutcome =
  | { kind: "produced"; result: LeafReadProducedResult }
  | { kind: "unread"; reason: string }
  | { kind: "failed"; reason: string };

/**
 * Derive bounded leaf-read evidence for every LOW-confidence sheet from the deterministic inventory.
 * Returns one region per low-confidence sheet that has value-tile signal. High-confidence sheets are
 * left to the deterministic path (no leaf-read). Source-safe by construction (aggregate signatures
 * + row indices only).
 */
export function extractLowConfidenceLeafEvidence(
  inventory: WorkbookStructuralInventory,
): LeafReadRegionEvidence[] {
  const tilesBySheet = new Map<string, SheetValueTileProjection>();
  for (const tile of inventory.segmented_value_tiles ?? []) tilesBySheet.set(tile.sheet, tile);

  const regions: LeafReadRegionEvidence[] = [];
  for (const sheet of inventory.per_sheet_data ?? []) {
    if (sheet.header_confidence !== "low") continue;
    const tile = tilesBySheet.get(sheet.sheet);
    if (!tile) continue;
    const columns = tile.columns.map((col) => {
      const lastSegment = col.segments.length > 0 ? col.segments[col.segments.length - 1] : undefined;
      return {
      column_index: col.column_index,
      dominant_shape: lastSegment ? lastSegment.dominant_shape : null,
      dominant_format: lastSegment ? lastSegment.dominant_format : null,
      boundaries: col.intra_tile_notes.map((note) => ({
        boundary_kind: note.boundary_kind,
        prev_shape: note.prev_shape,
        new_shape: note.new_shape,
        first_new_format_row: note.first_new_format_row,
      })),
      };
    });
    if (columns.length === 0) continue;
    regions.push({
      sheet: sheet.sheet,
      trigger: "low_confidence_header",
      header_candidate_rows: sheet.header_rows ?? [],
      columns,
    });
  }
  return regions;
}

/** Bounded-fan-out config for the structure-incompleteness trigger (P1-C2-B′ §2.2). PRELIMINARY —
 *  folds into the resume key so re-tuning rotates it (no silent stale). */
export interface StructureLeafTriggerOpts {
  /** Max columns leaf-read across the workbook (cost is no concern, but context/scale is bounded). */
  max_columns: number;
}
export const DEFAULT_STRUCTURE_LEAF_TRIGGER_OPTS: StructureLeafTriggerOpts = { max_columns: 64 };

export interface StructureLeafEvidence {
  regions: LeafReadRegionEvidence[];
  /** Honest census (gate RB6): columns the trigger considered candidates but the cap left UNREAD —
   *  never a silent drop; the consumer learns "not examined (capped)". */
  capped_columns: { sheet: string; column_index: number; column_name: string | null }[];
}

/**
 * Deterministic structure-incompleteness trigger (P1-C2-B′ §2.1). Selects leaf-read targets by a
 * DETERMINISTIC predicate over inventory signals — NOT an LLM judgment of "importance" (which would
 * make the read-set non-deterministic and reopen DET-1). The reason to read is capture-completeness:
 * read every column UNLESS structure trivially captures it (a single constant; empty). High-residual
 * (free-text / content-rich) columns are prioritised; the cap bounds fan-out with an honest capped
 * census. Low-confidence sheets keep the P1-C2-A guarantee (always read; no regression).
 *
 * LLM-free, so the resulting read-set is a pure function of the inventory — the property that makes
 * the existing resume contract sound (§4).
 */
export function extractStructureLeafEvidence(
  inventory: WorkbookStructuralInventory,
  opts: StructureLeafTriggerOpts = DEFAULT_STRUCTURE_LEAF_TRIGGER_OPTS,
): StructureLeafEvidence {
  const tilesBySheet = new Map<string, SheetValueTileProjection>();
  for (const tile of inventory.segmented_value_tiles ?? []) tilesBySheet.set(tile.sheet, tile);

  // (1) Low-confidence sheets: the P1-C2-A read-set — ALWAYS read (no cap, no regression).
  const lowConfidenceRegions = extractLowConfidenceLeafEvidence(inventory);
  const lowConfidenceSheets = new Set(lowConfidenceRegions.map((r) => r.sheet));

  // (2) High-confidence tabular sheets: structure-incomplete columns, residual-prioritised.
  interface Candidate {
    sheet: string;
    column: InventoryColumn;
    tile: SheetValueTileProjection | undefined;
  }
  const candidates: Candidate[] = [];
  for (const sheet of inventory.per_sheet_data ?? []) {
    if (lowConfidenceSheets.has(sheet.sheet)) continue; // already fully read by (1)
    const tile = tilesBySheet.get(sheet.sheet);
    for (const column of sheet.columns) {
      if (!isStructureIncomplete(column)) continue;
      candidates.push({ sheet: sheet.sheet, column, tile });
    }
  }
  // Deterministic priority: highest residual (structure summarises LEAST) first.
  candidates.sort((a, b) => {
    const r = compareColumnResidualDesc(a.column, b.column);
    if (r !== 0) return r;
    return a.sheet < b.sheet ? -1 : a.sheet > b.sheet ? 1 : 0;
  });

  const selected = candidates.slice(0, Math.max(0, opts.max_columns));
  const capped = candidates.slice(Math.max(0, opts.max_columns));

  // Group selected high-confidence candidates into per-sheet regions (enriched with value-tile
  // boundary witnesses by column index when available).
  const bySheet = new Map<string, LeafReadRegionEvidence>();
  for (const { sheet, column, tile } of selected) {
    let region = bySheet.get(sheet);
    if (!region) {
      region = { sheet, trigger: "structure_incomplete", header_candidate_rows: [], columns: [] };
      bySheet.set(sheet, region);
    }
    const tileCol = tile?.columns.find((c) => c.column_index === column.index);
    const lastSegment =
      tileCol && tileCol.segments.length > 0 ? tileCol.segments[tileCol.segments.length - 1] : undefined;
    region.columns.push({
      column_index: column.index,
      column_name: column.name,
      inferred_type: column.inferred_type,
      distinct_count: column.distinct_count,
      distinct_is_estimate: column.distinct_count_is_estimate,
      dominant_shape: lastSegment ? lastSegment.dominant_shape : null,
      dominant_format: lastSegment ? lastSegment.dominant_format : null,
      boundaries: (tileCol?.intra_tile_notes ?? []).map((note) => ({
        boundary_kind: note.boundary_kind,
        prev_shape: note.prev_shape,
        new_shape: note.new_shape,
        first_new_format_row: note.first_new_format_row,
      })),
    });
  }

  return {
    regions: [...lowConfidenceRegions, ...bySheet.values()],
    capped_columns: capped.map((c) => ({
      sheet: c.sheet,
      column_index: c.column.index,
      column_name: c.column.name,
    })),
  };
}

/** Deterministic "structure trivially captures this column" predicate (P1-C2-B′ §2.1). A column is a
 *  leaf-read candidate UNLESS structure already says everything: a single constant value, empty, or a
 *  single uniform formula. (Cost is no concern, so the default leans toward reading — missing a
 *  capturable fact is the defect to avoid, not an extra read.)
 *
 *  Uniform-formula skip (gate follow-up #3): the observer marks `is_uniform_formula` when EXACTLY one
 *  single-column formula pattern provably covers the column's data cells (a fill-down whose references
 *  shift but whose structure is one repeated formula; Excel shared-formula dedup collapses these). The
 *  observer is conservative — a partial-formula / multi-formula / multi-column column is NOT marked, so
 *  this never wrongly skips. (See InventoryColumn.is_uniform_formula for the residual title-row caveat.) */
function isStructureIncomplete(column: InventoryColumn): boolean {
  if (column.inferred_type === "empty") return false;
  if (column.non_empty_count === 0) return false;
  if (column.distinct_count <= 1 && !column.distinct_count_is_estimate) return false; // single constant
  if (column.is_uniform_formula) return false; // one repeated formula → structure fully captures it (#3)
  return true;
}

/** sha256 of the read-set-shaping LOGIC source (the deterministic trigger: selection + predicate +
 *  ordering). Folded into the llm_touch_fingerprint ⓑ so editing the read-set logic TAUTOLOGICALLY
 *  rotates the resume key (CG-1 pattern; [[cg1-catalog-mechanism-decision]]) — NOT relying on a manual
 *  comprehension_version bump. The read-set is a pure function of the inventory AND this logic: the
 *  inventory inputs are covered by ⓐ (content_sha256 + adapter_version, which DETERMINE the inventory),
 *  this covers the logic, and structure_leaf_trigger_config covers the config. Over-rotates on a
 *  cosmetic source edit (safe: fail toward regenerate, never silent-stale). */
export function structureLeafTriggerLogicSha256(): string {
  const sep = " ";
  return createHash("sha256")
    .update(extractStructureLeafEvidence.toString())
    .update(sep)
    .update(extractLowConfidenceLeafEvidence.toString())
    .update(sep)
    .update(isStructureIncomplete.toString())
    .update(sep)
    .update(compareColumnResidualDesc.toString())
    .digest("hex");
}

interface LeafReadRawLabel {
  column_index: number;
  tentative_label: string;
  semantic_role?: string;
  captured_note?: string;
}

/** Bound on a captured note (the LLM's free-text gist of structure the deterministic summary missed).
 *  It is derived from aggregate signatures only (no raw cell values reach the LLM), so this caps prose
 *  length, not source exposure. */
const MAX_CAPTURED_NOTE_CHARS = 240;
const LEAF_SEMANTIC_ROLE_SET = new Set<string>(LEAF_SEMANTIC_ROLES);

/**
 * Run the LLM leaf-read (CAPTURE) for one region the deterministic observer could not fully capture.
 * `callLlm` is injected (mock fixture in tests, real authoring caller in production). The LLM
 * contributes only the label / role / note TEXT; confidence and is_lower_bound are forced (low /
 * true) regardless of the trigger. An unrecognised semantic_role is dropped (the label is kept);
 * a captured_note is trimmed and length-bounded.
 */
export async function readStructureLeaf(args: {
  evidence: LeafReadRegionEvidence;
  callLlm: (systemPrompt: string, userPayload: unknown) => Promise<string>;
}): Promise<LeafReadOutcome> {
  const { evidence, callLlm } = args;
  let raw: string;
  try {
    raw = await callLlm(LEAF_READ_SYSTEM_PROMPT, {
      sheet: evidence.sheet,
      header_candidate_rows: evidence.header_candidate_rows,
      columns: evidence.columns,
    });
  } catch (error) {
    // Provider output-ceiling failures are run-terminal: partial output must
    // never enter leaf degradation or permit a later semantic call.
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    // §11 R9: ordinary transport/provider errors remain explicit FAILED
    // outcomes and degrade to the deterministic producer.
    return { kind: "failed", reason: `leaf-read LLM call failed: ${(error as Error).message}` };
  }

  let parsed: { labels?: LeafReadRawLabel[] };
  try {
    parsed = JSON.parse(raw) as { labels?: LeafReadRawLabel[] };
  } catch {
    return { kind: "failed", reason: "leaf-read returned unparseable JSON" };
  }

  const rawLabels = Array.isArray(parsed.labels) ? parsed.labels : [];
  const knownColumns = new Set(evidence.columns.map((c) => c.column_index));
  const labels: LeafReadLabel[] = rawLabels
    .filter(
      (l) =>
        l &&
        typeof l.column_index === "number" &&
        knownColumns.has(l.column_index) &&
        typeof l.tentative_label === "string" &&
        l.tentative_label.trim() !== "",
    )
    .map((l) => {
      // Capture (P1-C2-B′ §3): an unrecognised role is dropped (label kept); a note is trimmed +
      // length-bounded. The LLM saw only aggregate signatures, so a note carries no raw cell value.
      const role: LeafSemanticRole | undefined =
        typeof l.semantic_role === "string" && LEAF_SEMANTIC_ROLE_SET.has(l.semantic_role)
          ? (l.semantic_role as LeafSemanticRole)
          : undefined;
      const note =
        typeof l.captured_note === "string" && l.captured_note.trim() !== ""
          ? l.captured_note.trim().slice(0, MAX_CAPTURED_NOTE_CHARS)
          : undefined;
      const label: LeafReadLabel = {
        sheet: evidence.sheet,
        column_index: l.column_index,
        tentative_label: l.tentative_label.trim(),
        // Forced honesty tags (§2.2): the region is structurally incomplete, so the read is always a
        // non-authoritative lower bound regardless of any confidence the model asserts.
        confidence: "low",
        is_lower_bound: true,
      };
      if (role) label.semantic_role = role;
      if (note) label.captured_note = note;
      return label;
    });

  if (labels.length === 0) {
    return { kind: "unread", reason: "leaf-read produced no readable labels for this region" };
  }
  const limitingReason =
    evidence.trigger === "structure_incomplete"
      ? "structure-incomplete region; columns captured provisionally from value-tile signatures"
      : "low header_confidence region; labels read provisionally from value-tile signatures";
  return {
    kind: "produced",
    result: {
      labels,
      limiting_region_ref: `${evidence.sheet}!region`,
      limiting_reason: limitingReason,
    },
  };
}
