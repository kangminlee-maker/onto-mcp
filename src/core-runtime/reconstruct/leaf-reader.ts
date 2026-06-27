import { createHash } from "node:crypto";
import type {
  SheetValueTileProjection,
  WorkbookStructuralInventory,
} from "../spreadsheet-structure-observer.js";
import type { LeafReadLabel, LeafReadProducedResult } from "./comprehension-artifact.js";

// ─────────────────────────────────────────────────────────────────────────────
// leaf-reader (§3.2 / P1-C2-A) — the FIRST LLM-touch. For a low-confidence (unstructured) region
// the deterministic observer leaves the label blank ("which row is the header?" is a reading
// question, not a deterministic one). The leaf-reader asks the LLM for a PROVISIONAL label.
//
// Honesty (§2.2/§2.3):
//  - The label TEXT is the LLM's only contribution. The confidence tags are DETERMINISTIC: a
//    low-confidence region forces confidence='low' and is_lower_bound=true — the LLM cannot claim
//    a strong label on a structurally weak region (graceful degrade, non-authoritative).
//  - Input is bounded + aggregate-only (value-tile shapes/format-identities + header-candidate rows);
//    NO raw cell values or literal formatCodes reach the LLM (source-safety, P1-C1 §3.4 inherited).
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
  "You are given bounded, aggregate-only evidence about columns whose header could not be resolved",
  "deterministically: value-shape / display-format signatures, the rows where a signature changes,",
  "and candidate header row indices. You are NOT given raw cell values.",
  "",
  "For each column you can read, return a SHORT provisional label naming what the column most likely",
  "holds. Omit a column you cannot read rather than guessing. Return STRICT JSON:",
  '{ "labels": [{ "column_index": <int>, "tentative_label": "<short label>" }],',
  '  "unread_columns": [{ "column_index": <int>, "reason": "<why unreadable>" }] }',
  "",
  "Your labels are provisional and non-authoritative; the runtime tags every label low-confidence.",
].join("\n");

export function leafReadPromptSha256(): string {
  return createHash("sha256").update(LEAF_READ_SYSTEM_PROMPT).digest("hex");
}

/** Bounded, source-safe evidence for one low-confidence region (one sheet). NO raw cell values. */
export interface LeafReadRegionEvidence {
  sheet: string;
  /** Candidate header rows the deterministic heuristic could not confirm (indices only). */
  header_candidate_rows: number[];
  columns: {
    column_index: number;
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
      header_candidate_rows: sheet.header_rows ?? [],
      columns,
    });
  }
  return regions;
}

interface LeafReadRawLabel {
  column_index: number;
  tentative_label: string;
}

/**
 * Run the LLM leaf-read for one low-confidence region. `callLlm` is injected (mock fixture in tests,
 * real authoring caller in production). The LLM contributes only the label TEXT; confidence and
 * is_lower_bound are forced (low / true) for the low-confidence region.
 */
export async function readLowConfidenceLeaf(args: {
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
    // §11 R9: an LLM hard error (network/timeout/budget) is an explicit FAILED outcome — the caller
    // degrades to a deterministic producer, never aborts the run.
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
    .map((l) => ({
      sheet: evidence.sheet,
      column_index: l.column_index,
      tentative_label: l.tentative_label.trim(),
      // Forced honesty tags (§2.2): the region is structurally low-confidence, so the read is always
      // a non-authoritative lower bound regardless of any confidence the model asserts.
      confidence: "low",
      is_lower_bound: true,
    }));

  if (labels.length === 0) {
    return { kind: "unread", reason: "leaf-read produced no readable labels for this region" };
  }
  return {
    kind: "produced",
    result: {
      labels,
      limiting_region_ref: `${evidence.sheet}!region`,
      limiting_reason: "low header_confidence region; labels read provisionally from value-tile signatures",
    },
  };
}
