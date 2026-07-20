import { describe, expect, it } from "vitest";
import {
  CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET,
  projectCodeInventoryForPrompt,
} from "./code-structure-inventory-projection.js";
import type { CodeSymbolSpan } from "./code-structure-observer.js";

// Spec basis (INV-TEST-1): handoff 20260719-semantic-map-v2-live §2 pre-live flag — the prompt
// payload must never carry an unbounded code inventory (reconstruct/run.ts measured 411,063
// chars); projection mirrors projectInventoryForPrompt (workbook precedent) and consumes the
// DD10 code admission order (span size desc → line_start asc) as a PREFIX, so the cut starves
// leaf detail, never whole-file shape.
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

  it("over budget: drops hierarchy first, admits spans as a size-desc prefix, emits document order", () => {
    // Sizes descend away from document order so admission ≠ document order: the LAST span is
    // the largest. Budget sized to admit exactly the two largest spans.
    const spans = [span(1, 5), span(6, 30), span(31, 100)];
    const inv = inventoryOf(spans);
    const before = JSON.parse(JSON.stringify(inv));
    const envelope = JSON.stringify({
      ...inv,
      symbol_tiles: { spans: [], hierarchy: [], root_key: "1-100" },
    }).length;
    const cost = (s: CodeSymbolSpan) => JSON.stringify(s).length + 1;
    const budget = envelope + cost(spans[2]!) + cost(spans[1]!); // two largest fit, third does not
    const r = projectCodeInventoryForPrompt(inv, budget);
    expect(r.truncated).toBe(true);
    // Hierarchy dropped with an honest manifest record.
    expect(r.inventory.symbol_tiles.hierarchy).toEqual([]);
    expect(r.sections).toContainEqual({ section: "symbol_tiles.hierarchy", kept: 0, total: 3 });
    // Largest two spans admitted, re-emitted in ORIGINAL document order.
    expect(r.inventory.symbol_tiles.spans.map((s) => s.line_start)).toEqual([6, 31]);
    expect(r.sections).toContainEqual({ section: "symbol_tiles.spans", kept: 2, total: 3 });
    // Scalars (identity/provenance) are never trimmed.
    expect(r.inventory.content_sha256).toBe("c0de");
    expect(r.inventory.line_count).toBe(inv.line_count);
    // Pure: the input inventory is not mutated.
    expect(inv).toEqual(before);
    // Deterministic: same input, same budget ⇒ same output bytes.
    expect(JSON.stringify(projectCodeInventoryForPrompt(inv, budget))).toBe(JSON.stringify(r));
  });

  it("respects the char budget on a large synthetic inventory (cardinality > 0 admitted)", () => {
    const spans = Array.from({ length: 400 }, (_, i) => span(i * 10 + 1, i * 10 + 10));
    const inv = inventoryOf(spans);
    expect(JSON.stringify(inv).length).toBeGreaterThan(40_000); // subject is genuinely over budget
    const r = projectCodeInventoryForPrompt(inv);
    expect(r.truncated).toBe(true);
    expect(r.inventory.symbol_tiles.spans.length).toBeGreaterThan(0);
    expect(r.inventory.symbol_tiles.spans.length).toBeLessThan(400);
    expect(JSON.stringify(r.inventory).length).toBeLessThanOrEqual(40_000);
  });
});
