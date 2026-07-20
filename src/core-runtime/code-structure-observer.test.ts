import { describe, expect, it } from "vitest";
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  observeCodeStructure,
  codeStructureLanguageForExtension,
  CODE_STRUCTURE_LINE_BOUND,
} from "./code-structure-observer.js";

// Spec basis (INV-TEST-1): multi-artifact design 20260718 §3 DD4/DD5 — line-ownership partition
// (gapless, non-overlapping, same-line siblings coalesce), depth-2 hierarchy, O-5 enrichment
// (doc first line + signature line, bounded), explicit `unsupported` for a language without a
// bundled grammar, and byte-determinism (same input ⇒ same inventory). Fixtures are the committed
// N=1 probe fixtures (scripts/fixtures/code-probe) — real files, not synthetic strings, so the
// entity-under-test set is non-empty by construction.

const FIXTURES = path.resolve(__dirname, "../../scripts/fixtures/code-probe");

async function observeFixture(name: string) {
  const ref = path.join(FIXTURES, name);
  const text = await readFile(ref, "utf8");
  return { text, result: await observeCodeStructure({ ref, text }) };
}

describe("code-structure-observer", () => {
  it("emits a gapless, non-overlapping line-ownership partition over a real TS fixture", async () => {
    const { text, result } = await observeFixture("multi-decl-single-line.ts");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const spans = [...result.inventory.symbol_tiles.spans].sort((a, b) => a.line_start - b.line_start);
    expect(spans.length).toBeGreaterThan(0); // cardinality guard — vacuous pass sealed
    // Leaves (depth-max spans per line range) must tile lines 1..line_count exactly once.
    const leafSpans = spans.filter(
      (s) => !spans.some((o) => o !== s && o.line_start >= s.line_start && o.line_end <= s.line_end && (o.line_start > s.line_start || o.line_end < s.line_end)),
    );
    const owned = new Set<number>();
    for (const s of leafSpans) {
      for (let line = s.line_start; line <= s.line_end; line += 1) {
        expect(owned.has(line)).toBe(false); // non-overlap
        owned.add(line);
      }
    }
    expect(owned.size).toBe(result.inventory.line_count); // gapless
    expect(result.inventory.line_count).toBe(text.split(/\r?\n/).length);
  });

  it("coalesces same-line sibling declarations into one leaf (inv-F2 input class)", async () => {
    const { result } = await observeFixture("multi-decl-single-line.ts");
    if (result.status !== "ok") throw new Error("expected ok");
    // Fixture line 5: `export function f() ... export function g() ...` — one span, both names.
    const coalesced = result.inventory.symbol_tiles.spans.find((s) => s.symbol_names.includes("f"));
    expect(coalesced).toBeDefined();
    expect(coalesced!.symbol_names).toContain("g");
  });

  it("builds the depth-2 hierarchy with decl_header/decl_footer only when they own lines", async () => {
    const { result } = await observeFixture("inventory_service.py");
    if (result.status !== "ok") throw new Error("expected ok");
    const { hierarchy, spans, root_key } = result.inventory.symbol_tiles;
    const byKey = new Map(hierarchy.map((h) => [h.key, h]));
    const root = byKey.get(root_key);
    expect(root).toBeDefined();
    expect(root!.child_keys.length).toBeGreaterThan(0);
    // Python classes with members produce decl_header leaves carrying the class name.
    const header = spans.find((s) => s.kind === "decl_header" && s.symbol_names.includes("InventoryLedger"));
    expect(header).toBeDefined();
    // Every hierarchy child key resolves (tree well-formedness at the inventory level).
    for (const h of hierarchy) {
      for (const c of h.child_keys) expect(byKey.has(c)).toBe(true);
    }
  });

  it("captures O-5 enrichment: docstring/comment first line + bounded signature line", async () => {
    const { result } = await observeFixture("inventory_service.py");
    if (result.status !== "ok") throw new Error("expected ok");
    const spans = result.inventory.symbol_tiles.spans;
    const ledgerHeader = spans.find((s) => s.symbol_names.includes("InventoryLedger"));
    expect(ledgerHeader?.doc_first_line).toContain("Append-only ledger");
    const signatures = spans.map((s) => s.signature_line).filter((x): x is string => x !== null);
    expect(signatures.length).toBeGreaterThan(0);
    for (const sig of signatures) {
      expect(sig.length).toBeLessThanOrEqual(CODE_STRUCTURE_LINE_BOUND + 1); // +1 = ellipsis char
    }
    // Nameless-file coverage (O-5 C2): a barrel re-export still yields signature-bearing spans.
    const barrel = await observeFixture("barrel-reexport.ts");
    if (barrel.result.status !== "ok") throw new Error("expected ok");
    const barrelSigs = barrel.result.inventory.symbol_tiles.spans.filter((s) => s.signature_line?.includes("export"));
    expect(barrelSigs.length).toBeGreaterThan(0);
  });

  it("is byte-deterministic (same input ⇒ identical inventory JSON)", async () => {
    const a = await observeFixture("deep-nesting.ts");
    const b = await observeFixture("deep-nesting.ts");
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
    if (a.result.status !== "ok") throw new Error("expected ok");
    expect(a.result.inventory.extractor_logic_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.result.inventory.content_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns an explicit unsupported reason for a language without a bundled grammar (gf-F5)", async () => {
    const result = await observeCodeStructure({ ref: "/tmp/x/main.go", text: "package main\n" });
    expect(result).toEqual({ status: "unsupported", reason: "language not supported: .go" });
    expect(codeStructureLanguageForExtension(".go")).toBeNull();
    expect(codeStructureLanguageForExtension(".py")).toBe("python");
    expect(codeStructureLanguageForExtension(".ts")).toBe("typescript");
  });
});

// ─── Phase 1b FD4: opt-in import extraction (design 20260720 v3; impl plan 단계 C) ───
describe("code-structure-observer import capture (FD4, set-tier opt-in)", () => {
  const observe = (ref: string, text: string, captureImports?: boolean) =>
    observeCodeStructure(captureImports === undefined ? { ref, text } : { ref, text, captureImports });

  it("opt-in OFF keeps the inventory byte-identical (no imports/import_census keys)", async () => {
    const text = 'import { a } from "./alpha.js";\nexport const x = a;\n';
    const off = await observe("g1.ts", text);
    const offDefault = await observe("g1.ts", text, false);
    if (off.status !== "ok" || offDefault.status !== "ok") throw new Error("expected ok");
    expect(JSON.stringify(off.inventory)).toBe(JSON.stringify(offDefault.inventory));
    expect(off.inventory.symbol_tiles).not.toHaveProperty("imports");
    expect(off.inventory).not.toHaveProperty("import_census");
  });

  it("extracts TS import + re-export specifiers from AST fields, deduplicates, and accounts honestly", async () => {
    const text = [
      'import { a } from "./alpha.js";',
      'import type { B } from "../beta.js";',
      'import { a as a2 } from "./alpha.js";', // duplicate specifier
      'export { c } from "./gamma.js";',       // re-export = import occurrence
      'export const local = 1;',               // export WITHOUT source — not an import
      'import "bare-package";',
    ].join("\n") + "\n";
    const result = await observe("imports.ts", text, true);
    if (result.status !== "ok") throw new Error("expected ok");
    const imports = result.inventory.symbol_tiles.imports!;
    const census = result.inventory.import_census!;
    expect(imports.map((r) => r.to_specifier)).toEqual([
      "./alpha.js",
      "../beta.js",
      "./gamma.js",
      "bare-package",
    ]);
    for (const record of imports) expect(record.resolved_in_set).toBeNull();
    expect(census.import_nodes_seen).toBe(5);
    expect(census.imports_recorded).toBe(4);
    expect(census.duplicates_observed).toBe(1);
    expect(census.omitted).toBe(0);
    // Honesty invariant: every seen occurrence is recorded, a duplicate, or omitted.
    expect(census.import_nodes_seen).toBe(
      census.imports_recorded + census.duplicates_observed + census.omitted,
    );
  });

  it("extracts Python import forms (from-relative, dotted, multi-name, future)", async () => {
    const text = [
      "from .utils import helper",
      "from ..pkg.mod import thing",
      "import os, sys",
      "import numpy as np",
      "from __future__ import annotations",
      "",
      "X = 1",
    ].join("\n");
    const result = await observe("imports.py", text, true);
    if (result.status !== "ok") throw new Error("expected ok");
    const imports = result.inventory.symbol_tiles.imports!;
    expect(imports.map((r) => r.to_specifier)).toEqual([
      ".utils",
      "..pkg.mod",
      "os",
      "sys",
      "numpy",
      "__future__",
    ]);
    const census = result.inventory.import_census!;
    expect(census.import_nodes_seen).toBe(
      census.imports_recorded + census.duplicates_observed + census.omitted,
    );
  });

  it("preserves an over-bound specifier as truncated-unresolvable (M-10), never silently cut", async () => {
    const longSpecifier = "./" + "x".repeat(CODE_STRUCTURE_LINE_BOUND + 20);
    const text = `import { a } from "${longSpecifier}";\n`;
    const result = await observe("long.ts", text, true);
    if (result.status !== "ok") throw new Error("expected ok");
    const record = result.inventory.symbol_tiles.imports![0]!;
    expect(record.specifier_truncated).toBe(true);
    expect(record.original_length).toBe(longSpecifier.length);
    expect(record.original_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.to_specifier.length).toBeLessThanOrEqual(CODE_STRUCTURE_LINE_BOUND + 1);
  });

  it("capture rotates extractor_logic_sha256 identically ON and OFF (one logic identity)", async () => {
    const text = 'import { a } from "./alpha.js";\nexport const x = a;\n';
    const on = await observe("rot.ts", text, true);
    const off = await observe("rot.ts", text);
    if (on.status !== "ok" || off.status !== "ok") throw new Error("expected ok");
    // The digest folds SOURCE logic, not the runtime option — ON/OFF observations of the same
    // bytes share one extractor identity (the set fingerprint separates capture presence).
    expect(on.inventory.extractor_logic_sha256).toBe(off.inventory.extractor_logic_sha256);
  });
});
