import { describe, expect, it } from "vitest";
import {
  CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET,
  projectCodeInventoryForPrompt,
} from "./code-structure-inventory-projection.js";
import type { CodeSymbolSpan } from "./code-structure-observer.js";

// Spec basis (INV-TEST-1): handoff 20260719-semantic-map-v2-live §2 pre-live flag — the prompt
// payload must never carry an unbounded code inventory (reconstruct/run.ts measured 411,063
// chars). The budget contract is the PRETTY length (JSON.stringify(x, null, 2)) because
// callJsonAuthor serializes the payload pretty (render-budget precedent; 교차검증 gh HIGH).
// Admission mirrors the DD10 order (span size desc → line_start asc → index) as a PREFIX, so
// the cut starves leaf detail, never whole-file shape.
describe("projectCodeInventoryForPrompt — bounded prompt projection (size axis)", () => {
  const span = (line_start: number, line_end: number): CodeSymbolSpan => ({
    line_start,
    line_end,
    kind: "function_decl",
    symbol_names: [`sym${line_start}`],
    depth: 1,
    doc_first_line: `doc for ${line_start}`,
    signature_line: `export function sym${line_start}(): void {`,
  });
  const inventoryOf = (spans: CodeSymbolSpan[]) => ({
    schema_version: "1" as const,
    language: "typescript" as const,
    line_count: spans.length === 0 ? 0 : spans[spans.length - 1]!.line_end,
    content_sha256: "c0de",
    extractor_logic_sha256: "10g1c",
    symbol_tiles: {
      spans,
      hierarchy: spans.map((s) => ({
        key: `${s.line_start}-${s.line_end}`,
        kind: s.kind,
        symbol_name: s.symbol_names[0] ?? null,
        child_keys: [],
      })),
      root_key: "1-100",
    },
  });

  it("pins the default budget to the reviewed per-kind constant class value", () => {
    expect(CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET).toBe(40_000);
  });

  it("passes a within-budget inventory through unchanged with no manifest", () => {
    const inv = inventoryOf([span(1, 10), span(11, 20)]);
    const r = projectCodeInventoryForPrompt(inv);
    expect(r.truncated).toBe(false);
    expect(r.sections).toEqual([]);
    expect(r.inventory).toBe(inv); // pass-through, no copy
  });

  const pretty = (value: unknown): number => JSON.stringify(value, null, 2).length;

  it("over budget: drops hierarchy first, admits spans as a size-desc prefix, emits document order", () => {
    // Sizes descend away from document order so admission ≠ document order: the LAST span is
    // the largest. Budget = exact pretty length of the projection carrying the two largest
    // spans — the third cannot fit (any addition strictly grows the pretty length).
    const spans = [span(1, 5), span(6, 30), span(31, 100)];
    const inv = inventoryOf(spans);
    const before = JSON.parse(JSON.stringify(inv));
    const budget = pretty({
      ...inv,
      symbol_tiles: { spans: [spans[1]!, spans[2]!], hierarchy: [], root_key: "1-100" },
    });
    const r = projectCodeInventoryForPrompt(inv, budget);
    expect(r.truncated).toBe(true);
    // Hierarchy dropped with an honest manifest record.
    expect(r.inventory.symbol_tiles.hierarchy).toEqual([]);
    expect(r.sections).toContainEqual({ section: "symbol_tiles.hierarchy", kept: 0, total: 3 });
    // Largest two spans admitted, re-emitted in ORIGINAL document order.
    expect(r.inventory.symbol_tiles.spans.map((s) => s.line_start)).toEqual([6, 31]);
    expect(r.sections).toContainEqual({ section: "symbol_tiles.spans", kept: 2, total: 3 });
    // The REAL contract: pretty(projected) ≤ budget.
    expect(pretty(r.inventory)).toBeLessThanOrEqual(budget);
    // Scalars (identity/provenance) are never trimmed.
    expect(r.inventory.content_sha256).toBe("c0de");
    expect(r.inventory.line_count).toBe(inv.line_count);
    // Pure: the input inventory is not mutated.
    expect(inv).toEqual(before);
    // Deterministic: same input, same budget ⇒ same output bytes.
    expect(JSON.stringify(projectCodeInventoryForPrompt(inv, budget))).toBe(JSON.stringify(r));
  });

  it("respects the PRETTY char budget on a large synthetic inventory (cardinality > 0 admitted)", () => {
    const spans = Array.from({ length: 400 }, (_, i) => span(i * 10 + 1, i * 10 + 10));
    const inv = inventoryOf(spans);
    expect(pretty(inv)).toBeGreaterThan(40_000); // subject is genuinely over budget
    const r = projectCodeInventoryForPrompt(inv);
    expect(r.truncated).toBe(true);
    expect(r.inventory.symbol_tiles.spans.length).toBeGreaterThan(0);
    expect(r.inventory.symbol_tiles.spans.length).toBeLessThan(400);
    // The budget bounds the ACTUAL prompt serialization (pretty), not the compact length.
    expect(pretty(r.inventory)).toBeLessThanOrEqual(40_000);
  });

  it("never re-admits a duplicated object reference past the cut (index-based admission)", () => {
    // Adversarial shape (교차검증 inv MEDIUM — unreachable from the real observer, sealed
    // structurally): the SAME span object appears twice; the budget admits exactly one
    // occurrence. Identity-based admission would emit both and overshoot the budget.
    const shared = span(1, 50);
    const spans = [shared, span(51, 60), shared];
    const inv = inventoryOf(spans);
    const budget = pretty({
      ...inv,
      symbol_tiles: { spans: [shared], hierarchy: [], root_key: "1-100" },
    });
    const r = projectCodeInventoryForPrompt(inv, budget);
    expect(r.truncated).toBe(true);
    expect(r.inventory.symbol_tiles.spans).toHaveLength(1);
    expect(pretty(r.inventory)).toBeLessThanOrEqual(budget);
    expect(r.sections).toContainEqual({ section: "symbol_tiles.spans", kept: 1, total: 3 });
  });
});
