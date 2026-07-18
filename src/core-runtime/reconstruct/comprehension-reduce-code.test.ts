import { describe, expect, it } from "vitest";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { observeCodeStructure } from "../code-structure-observer.js";
import {
  codeLeafFromSpan,
  codeReduceNodeGroundHash,
  foldCodeStructureInventory,
  mergeCodeReduceNodes,
  CODE_REDUCE_ADAPTER,
} from "./comprehension-reduce-code.js";
import { foldLeavesCore } from "./comprehension-reduce-core.js";

// Spec basis (INV-TEST-1): multi-artifact design 20260718 DD5 — (i) the AUTHORED-hierarchy fold
// and the synthetic fan-in fold must produce a byte-identical root ground (monoid
// grouping-invariance, G-CODE-i, now through the PRODUCT modules), (ii) the trace is a rooted
// tree with collision-guarded registration (inv-F3), (iii) negative controls prove the gates can
// fail (overlap reject). Real fixtures via the real observer — subject set non-empty.

const FIXTURES = path.resolve(__dirname, "../../../scripts/fixtures/code-probe");

async function inventoryFor(name: string) {
  const ref = path.join(FIXTURES, name);
  const text = await readFile(ref, "utf8");
  const result = await observeCodeStructure({ ref, text });
  if (result.status !== "ok") throw new Error(`fixture ${name} unexpectedly unsupported`);
  return { ref, inventory: result.inventory };
}

describe("comprehension-reduce-code (L1 code adapter)", () => {
  it("hierarchy fold and flat/fanin folds agree on the root ground (grouping-invariance)", async () => {
    for (const name of ["inventory_service.py", "multi-decl-single-line.ts", "deep-nesting.ts"]) {
      const { ref, inventory } = await inventoryFor(name);
      const { root, trace, nodesByKey } = foldCodeStructureInventory(ref, inventory, 4);
      const leaves = inventory.symbol_tiles.spans.map((s) => codeLeafFromSpan(ref, s));
      expect(leaves.length).toBeGreaterThan(0); // cardinality guard
      const flatRoot = foldLeavesCore(CODE_REDUCE_ADAPTER, leaves);
      const fanin3Root = foldLeavesCore(CODE_REDUCE_ADAPTER, leaves, 3);
      expect(codeReduceNodeGroundHash(root)).toBe(codeReduceNodeGroundHash(flatRoot));
      expect(codeReduceNodeGroundHash(root)).toBe(codeReduceNodeGroundHash(fanin3Root));
      // Trace well-formedness: root reachable, every child key registered.
      expect(trace.nodes.has(trace.root_key)).toBe(true);
      for (const [, node] of trace.nodes) {
        for (const c of node.child_keys) expect(trace.nodes.has(c)).toBe(true);
      }
      expect(nodesByKey.size).toBe(trace.nodes.size);
    }
  });

  it("rejects an overlapping partition (negative control — the gate can fail)", async () => {
    const { ref, inventory } = await inventoryFor("inventory_service.py");
    const leaves = inventory.symbol_tiles.spans.map((s) => codeLeafFromSpan(ref, s)).slice(0, 2);
    expect(leaves.length).toBe(2);
    const overlapped = [
      leaves[0]!,
      { ...leaves[1]!, region: { ...leaves[1]!.region, line_start: leaves[0]!.region.line_end } },
    ];
    expect(() => mergeCodeReduceNodes(overlapped)).toThrow(/overlap\/interleave/);
  });

  it("rejects a cross-file merge (per-file reduce; cross-file = 1b set tier)", async () => {
    const a = await inventoryFor("inventory_service.py");
    const b = await inventoryFor("deep-nesting.ts");
    const leafA = codeLeafFromSpan(a.ref, a.inventory.symbol_tiles.spans[0]!);
    const leafB = codeLeafFromSpan(b.ref, b.inventory.symbol_tiles.spans[0]!);
    expect(() => mergeCodeReduceNodes([leafA, leafB])).toThrow(/share one file/);
  });

  it("adjacent kind transitions produce symbol_kind seams; ground hash is deterministic", async () => {
    const { ref, inventory } = await inventoryFor("inventory_service.py");
    const { root } = foldCodeStructureInventory(ref, inventory, 4);
    expect(root.boundaries.length).toBeGreaterThan(0);
    for (const b of root.boundaries) {
      expect(b.boundary_kind).toBe("symbol_kind");
      expect(b.first_new_line).toBe(b.last_prev_line + 1); // gapless partition ⇒ adjacent seams
    }
    const again = foldCodeStructureInventory(ref, inventory, 4);
    expect(codeReduceNodeGroundHash(again.root)).toBe(codeReduceNodeGroundHash(root));
  });

  it("fails loud on a malformed inventory (dangling hierarchy key)", async () => {
    const { ref, inventory } = await inventoryFor("deep-nesting.ts");
    const broken = structuredClone(inventory);
    const fileRow = broken.symbol_tiles.hierarchy.find((h) => h.kind === "file")!;
    fileRow.child_keys = [...fileRow.child_keys, "999-1000"];
    expect(() => foldCodeStructureInventory(ref, broken, 4)).toThrow(/resolves to no span/);
  });
});
