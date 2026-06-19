import path from "node:path";
import {
  type WorkbookStructuralInventory,
  inventoryHasRenderableStructure,
} from "../spreadsheet-structure-observer.js";

/**
 * The single source of truth for a spreadsheet ref's review honesty (design: C-review SSOT
 * refactor). Every review honesty surface — support_status, target_refs[].inspectable,
 * review_goal spreadsheet obligations, the prompt material_kind_obligations, the render
 * notes, sha256 — PROJECTS from this one per-ref record instead of independently
 * re-deriving "is this workbook backed?" from a different proxy (the structural root cause
 * of the recurring C-review honesty findings).
 *
 * Two DISTINCT axes, deliberately not coupled:
 *   - `inspectable` — the workbook was READ (`unsupported_reason === null`) AND has
 *     renderable structure (incl. plain tabular data). Drives support_status / target_refs.
 *     A clean CSV or a formula-free data .xlsx is inspectable even though it backs none of
 *     the six structural obligations — coupling inspectable to `backed_goals.length>0`
 *     would wrongly degrade plain-data workbooks to partial.
 *   - `backed_goals` — the POSITIVE subset of the six spreadsheet obligations whose
 *     specific evidence exists in this ref's inventory. Drives review_goal / obligations,
 *     so an obligation is never attached to a ref whose inventory cannot back it.
 */
export interface SpreadsheetRefDisposition {
  /** Resolved absolute path. */
  ref: string;
  /** The workbook was read and has renderable structure (incl. plain tabular data). */
  inspectable: boolean;
  /** null iff inspectable; otherwise `${ref}: <cause>` — the honest downgrade cause. */
  reason: string | null;
  /** Raw-byte content hash reused from the single observation; null when the observer
   *  declined to read the file (oversized/unreadable → content_sha256 === ""). Never a
   *  raw re-read. */
  sha256: string | null;
  /** The subset of the six spreadsheet review obligations this ref's inventory backs. */
  backed_goals: string[];
}

/**
 * risk_signal kinds that do NOT count as `structural_risk_signals` backing:
 *  - `unreadable_sheet_part`: an observation-failure marker, not a structural risk (so a
 *    risk-only corrupt shell backs nothing → not inspectable; R4 held).
 *  - `macro_present`: already owned by `access_and_protection_hygiene` (the observer pushes
 *    BOTH a `macro_present` boolean and a `macro_present` risk_signal — counting the signal
 *    here would double-back and re-open the #3/R4 asymmetry).
 *  - `external_links_present`: already owned by the explicit `external_links.length > 0`
 *    clause (same double-back hazard).
 * The genuine residual structural-risk kinds are `ragged_row`, `oversized_zip_entry`,
 * `pivot_table_cap`. (Error cells are NOT risk_signals — they live in `error_cells[]`,
 * ORed in separately below.)
 */
const NON_STRUCTURAL_RISK_KINDS = new Set([
  "unreadable_sheet_part",
  "macro_present",
  "external_links_present",
]);

/** True when a risk_signal kind is a genuine structural risk (not an observation-failure
 *  marker or a signal already owned by another obligation). */
export function isStructuralRiskSignal(kind: string): boolean {
  return !NON_STRUCTURAL_RISK_KINDS.has(kind);
}

/**
 * The positive backing rule: each spreadsheet review obligation is listed only when its
 * specific evidence exists in this ref's inventory. Mirrors the catalog in
 * `reviewMaterialGoals("spreadsheet")` (target-material-kind.ts) one-to-one.
 */
function computeBackedGoals(inv: WorkbookStructuralInventory): string[] {
  const goals: string[] = [];
  if (inv.formula_cells.length > 0) {
    goals.push("formula_integrity");
  }
  if (
    inv.formula_cells.some((cell) => cell.cross_sheet_refs.length > 0) ||
    inv.cross_sheet_key_overlap.length > 0
  ) {
    goals.push("cross_sheet_reference_integrity");
  }
  if (inv.named_ranges.length > 0) {
    goals.push("named_range_hygiene");
  }
  if (inv.data_validations.length > 0) {
    goals.push("data_validation_coverage");
  }
  if (inv.macro_present || inv.sheets.some((sheet) => sheet.hidden || sheet.protected)) {
    goals.push("access_and_protection_hygiene");
  }
  if (
    inv.risk_signals.some((signal) => isStructuralRiskSignal(signal.kind)) ||
    inv.external_links.length > 0 ||
    inv.error_cells.length > 0
  ) {
    goals.push("structural_risk_signals");
  }
  return goals;
}

/**
 * Compute the single per-ref disposition from the shared workbook inventory (or its
 * absence). Pure, total: never throws. `inventory` is undefined when the ref was never
 * observed (e.g. a directory path that did not pass isSpreadsheetRef).
 */
export function computeSpreadsheetDisposition(
  inventory: WorkbookStructuralInventory | undefined,
  ref: string,
): SpreadsheetRefDisposition {
  const resolved = path.resolve(ref);
  if (inventory === undefined) {
    return {
      ref: resolved,
      inspectable: false,
      reason: `${resolved}: workbook not observed`,
      sha256: null,
      backed_goals: [],
    };
  }
  // The observer declined/failed to read it (unsupported format, unreadable, oversized,
  // or a guarded decode crash) — content_sha256 is "" on a true skip, the real hash when
  // the bytes were read but extraction is unimplemented (.xls etc.).
  if (inventory.unsupported_reason !== null) {
    return {
      ref: resolved,
      inspectable: false,
      reason: `${resolved}: ${inventory.unsupported_reason}`,
      sha256: inventory.content_sha256 || null,
      backed_goals: [],
    };
  }
  const renderable = inventoryHasRenderableStructure(inventory);
  return {
    ref: resolved,
    inspectable: renderable,
    reason: renderable
      ? null
      : `${resolved}: no renderable structure (empty or unreadable workbook)`,
    sha256: inventory.content_sha256 || null,
    backed_goals: renderable ? computeBackedGoals(inventory) : [],
  };
}
