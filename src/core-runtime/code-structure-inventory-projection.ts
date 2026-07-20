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
 * + line range), then spans are admitted as a PREFIX of the admission order — span size
 * descending, then line_start ascending (globally unique under the strict line-ownership
 * partition), then original index (total by construction). This mirrors the DD10 admission
 * ORDER; the DD10 comparator itself is a different site (comprehension-semantic-map-code.ts
 * `admissionCompare`, untouched here). The admitted set is emitted in original document order,
 * so root/large container spans survive the cut: the budget starves leaf detail, never
 * whole-file shape (the 7b starvation-diagnosis rule).
 *
 * The budget bounds the ACTUAL prompt serialization: callJsonAuthor stringifies the payload
 * with `JSON.stringify(payload, null, 2)`, so every measurement here is the pretty length of
 * the CANDIDATE projected inventory (render-budget precedent, renderSemanticMapProjection —
 * its original compact node-only estimate under-counted ~2x; 교차검증 gh HIGH가 이 클래스의
 * 재발을 적발). Post-condition: pretty(projected) ≤ charBudget. Residual under-count from the
 * payload's OUTER nesting indentation (the inventory sits levels deep in structural_data) is
 * O(depth) per line — the same disclosed approximation the render budget accepts.
 */
export function projectCodeInventoryForPrompt(
  inventory: CodeStructureInventory,
  charBudget: number = CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET,
): CodeInventoryPromptProjectionResult {
  const pretty = (value: unknown): number => JSON.stringify(value, null, 2).length;
  if (pretty(inventory) <= charBudget) {
    return { inventory, truncated: false, sections: [] };
  }
  const sections: CodeInventoryPromptProjectionResult["sections"] = [];
  const record = (section: string, kept: number, total: number): void => {
    if (kept < total) sections.push({ section, kept, total });
  };
  const { spans, hierarchy, root_key } = inventory.symbol_tiles;
  record("symbol_tiles.hierarchy", 0, hierarchy.length);
  const ranked = spans
    .map((span, index) => ({ span, index }))
    .sort((a, b) =>
      (b.span.line_end - b.span.line_start) - (a.span.line_end - a.span.line_start) ||
      a.span.line_start - b.span.line_start ||
      a.index - b.index
    );
  // Index-based admission (NOT object identity): a spans array carrying the same object
  // reference twice must never re-admit both occurrences past the cut (교차검증 inv MEDIUM —
  // unreachable from the current observer, sealed structurally anyway).
  const admitted = new Set<number>();
  const candidate = (): CodeStructureInventory => ({
    ...inventory,
    symbol_tiles: {
      spans: spans.filter((_, index) => admitted.has(index)),
      hierarchy: [],
      root_key,
    },
  });
  for (const { index } of ranked) {
    admitted.add(index);
    if (pretty(candidate()) > charBudget) {
      admitted.delete(index);
      break;
    }
  }
  const projected = candidate();
  record("symbol_tiles.spans", projected.symbol_tiles.spans.length, spans.length);
  return { inventory: projected, truncated: true, sections };
}
