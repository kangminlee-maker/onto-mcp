import type {
  CodeStructureInventory,
  CodeSymbolSpan,
} from "./code-structure-observer.js";

// ─────────────────────────────────────────────────────────────────────────────
// code-structure-inventory-projection — bounded PROMPT projection of a code inventory
// (pre-live flag, handoff 20260719-semantic-map-v2-live §2; the code twin of
// spreadsheet-structure-observer's projectInventoryForPrompt).
//
// Lives OUTSIDE code-structure-observer.ts deliberately: that file is the frozen G-SEM
// experiment subject (content sha pinned `8f055465…` — 설계 §10 재평정 게이트 1 "수정 금지"),
// and the projection is a prompt-side concern, not an observation concern — it never touches
// the persisted inventory or any reuse key.
// ─────────────────────────────────────────────────────────────────────────────

/** Char budget for the prompt-facing projection of ONE code inventory (per-kind constant class,
 *  CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET precedent). The persisted source-observations
 *  artifact keeps the FULL inventory; only the prompt payload is capped (capture-whole /
 *  project-bounded — the workbook_inventory pattern). Measured unbounded worst case:
 *  reconstruct/run.ts inventory JSON = 411,063 chars, which would dwarf the raw-source and
 *  semantic-map contributions in a seed-authoring prompt. */
export const CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET = 40_000;

export interface CodeInventoryPromptProjectionResult {
  inventory: CodeStructureInventory;
  truncated: boolean;
  /** One record per section the projection actually trimmed (kept < total). */
  sections: { section: string; kept: number; total: number }[];
}

/**
 * Bounded, deterministic prompt projection of a code inventory (SIZE axis). Pure and total:
 * never mutates the input, never throws; a within-budget inventory passes through unchanged.
 * Over budget: `hierarchy` is dropped first (nesting stays recoverable from each span's `depth`
 * + line range), then spans are admitted as a PREFIX of the DD10 code admission order — span
 * size descending, then line_start ascending (a total order under the strict line-ownership
 * partition: line_start is unique) — until the budget is consumed, and the admitted set is
 * emitted in original document order. Root/large container spans therefore survive the cut:
 * the budget starves leaf detail, never whole-file shape (the 7b starvation-diagnosis rule).
 * The cost model is per-part JSON.stringify length — an approximation of the final prompt
 * serialization, not a hard byte contract.
 */
export function projectCodeInventoryForPrompt(
  inventory: CodeStructureInventory,
  charBudget: number = CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET,
): CodeInventoryPromptProjectionResult {
  if (JSON.stringify(inventory).length <= charBudget) {
    return { inventory, truncated: false, sections: [] };
  }
  const sections: CodeInventoryPromptProjectionResult["sections"] = [];
  const record = (section: string, kept: number, total: number): void => {
    if (kept < total) sections.push({ section, kept, total });
  };
  const { spans, hierarchy, root_key } = inventory.symbol_tiles;
  record("symbol_tiles.hierarchy", 0, hierarchy.length);
  const envelope: CodeStructureInventory = {
    ...inventory,
    symbol_tiles: { spans: [], hierarchy: [], root_key },
  };
  let used = JSON.stringify(envelope).length;
  const ranked = [...spans].sort((a, b) =>
    (b.line_end - b.line_start) - (a.line_end - a.line_start) ||
    a.line_start - b.line_start
  );
  const admitted = new Set<CodeSymbolSpan>();
  for (const span of ranked) {
    const cost = JSON.stringify(span).length + 1;
    if (used + cost > charBudget) break;
    used += cost;
    admitted.add(span);
  }
  const keptSpans = spans.filter((span) => admitted.has(span));
  record("symbol_tiles.spans", keptSpans.length, spans.length);
  return {
    inventory: { ...envelope, symbol_tiles: { spans: keptSpans, hierarchy: [], root_key } },
    truncated: true,
    sections,
  };
}
