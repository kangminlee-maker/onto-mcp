import { describe, expect, it } from "vitest";
import { observeCodeStructure } from "../code-structure-observer.js";
import {
  foldCodeStructureInventory,
  type CodeReduceNode,
} from "./comprehension-reduce-code.js";
import {
  CODE_SYMBOL_NAMES_DISPLAY_CAP,
  accumulateCodeSemanticMap,
  assertCodeSynthesisInputBounded,
  assertCodeSynthesisOutputBounded,
  buildCodeSynthesisInputForNode,
  buildCodeSynthesisMeta,
  projectCodeSemanticMapToSeed,
  reconcileCodeBoundaries,
  type CodeSemanticBoundaryVerifyInput,
  type CodeSemanticSynthesisInput,
  type CodeSemanticSynthesisOutput,
} from "./comprehension-semantic-map-code.js";
import { classifyFrontierCore } from "./comprehension-semantic-map-core.js";

const FILE = "src/example/service.ts";

// A fixture with imports, a standalone function, and a multi-member class — produces kind seams
// (import→function_decl, function_decl→class_decl) and a depth-2 container subtree.
const FIXTURE = [
  'import { a } from "./a.js";',
  'import { b } from "./b.js";',
  "",
  "/** Adds two numbers. */",
  "export function add(x: number, y: number): number {",
  "  return x + y;",
  "}",
  "",
  "/** Orchestrates example work. */",
  "export class Service {",
  "  private count = 0;",
  "",
  "  /** Runs one unit of work. */",
  "  run(): number {",
  "    this.count += 1;",
  "    return this.count;",
  "  }",
  "",
  "  reset(): void {",
  "    this.count = 0;",
  "  }",
  "}",
].join("\n");

const PRE_IMAGE_BASE = {
  reduce_reader_model_identity: "test-model",
  reduce_prompt_sha256: "test-prompt-sha",
  reduce_schema_tool_version: "test-schema-v1",
  comprehension_version: "test-comprehension-v1",
  over_context_gate_config_sha256: "test-gate-config",
  over_context_gate_logic_sha256: "test-gate-logic",
};

async function buildFixtureTree() {
  const observed = await observeCodeStructure({ ref: FILE, text: FIXTURE });
  if (observed.status !== "ok") throw new Error(`fixture must observe ok, got ${observed.status}`);
  const inventory = observed.inventory;
  const { root, trace, nodesByKey } = foldCodeStructureInventory(FILE, inventory, 2);
  return { inventory, root, trace, nodesByKey, meta: buildCodeSynthesisMeta(FILE, inventory) };
}

describe("comprehension-semantic-map-code (design 20260718 DD6/DD9 — step 6 G-L2 module half)", () => {
  it("accumulates a real observer-produced tree through the core walk: N1 anchor split, N3 verify routing, frontier partition, projection > 0", async () => {
    const { root, trace, nodesByKey, meta } = await buildFixtureTree();
    expect(root.boundaries.length).toBeGreaterThan(0); // cardinality guard — the fixture must produce seams.

    const verifyInputs: CodeSemanticBoundaryVerifyInput[] = [];
    const synthesize = (input: CodeSemanticSynthesisInput): CodeSemanticSynthesisOutput => {
      const seam = input.symbol_seams[0];
      return {
        semantic_summary: `code ${input.node_ref.file}:${input.node_ref.line_start}-${input.node_ref.line_end} kinds=[${input.signal_clusters.join("|")}]`,
        boundaries: [
          // exact-seam boundary → anchored (N1 pass 1).
          ...(seam ? [{ line: seam.line, character_before: seam.prev_kind, character_after: seam.new_kind }] : []),
          // far-from-any-seam boundary → unanchored → adversarial verify (N3).
          { line: input.node_ref.line_start + 1000, character_before: "far-before", character_after: "far-after" },
        ],
      };
    };
    const map = accumulateCodeSemanticMap(meta, trace, nodesByKey, {
      synthesize,
      verifyUnanchored: (input) => {
        verifyInputs.push(input);
        return input.boundary.line % 2 === 0 ? "adversarial_confirmed" : "adversarial_refuted";
      },
      preImageBase: PRE_IMAGE_BASE,
      overContextBudget: 2,
      seedBound: false,
    });

    expect(map.size).toBe(trace.nodes.size); // 1:1 semantic node per skeleton node.
    const modes = classifyFrontierCore(trace, 2);
    const roleCounts = { accumulating: 0, frontier: 0, subsumed: 0 };
    for (const m of modes.values()) roleCounts[m] += 1;
    expect(roleCounts.accumulating).toBeGreaterThan(0); // budget 2 forces a real partition.
    expect(roleCounts.subsumed).toBeGreaterThan(0);

    let anchored = 0;
    let unanchored = 0;
    for (const node of map.values()) {
      if (node.reduce_read_attempt === "subsumed") {
        expect(node.semantic_summary).toBe("");
        expect(node.consumed_child_judgment_keys).toEqual([]);
        continue;
      }
      for (const b of node.semantic_boundaries) {
        if (b.anchor_status === "anchored") {
          anchored += 1;
          expect(b.verification).toBe("structural_location_only");
        } else {
          unanchored += 1;
          expect(["adversarial_confirmed", "adversarial_refuted"]).toContain(b.verification);
        }
      }
    }
    expect(anchored).toBeGreaterThan(0); // the exact-seam mock boundary must anchor somewhere.
    expect(unanchored).toBeGreaterThan(0);
    expect(verifyInputs.length).toBe(unanchored); // N3: EVERY unanchored boundary was verified.

    const projection = projectCodeSemanticMapToSeed(map);
    expect(projection.nodes_total).toBeGreaterThan(0); // G-L2 cardinality gate.
    expect(projection.authority).toBe("non_authoritative");
    const refutedInMap = [...map.values()]
      .flatMap((n) => n.semantic_boundaries)
      .filter((b) => b.verification === "adversarial_refuted").length;
    expect(projection.refuted_disclosure_total).toBe(refutedInMap); // refuted disclosed, never silently dropped.
    for (const node of projection.nodes) {
      for (const b of node.boundaries) {
        expect(b.disposition === "structural_location_only" || b.disposition === "adversarial_confirmed").toBe(true);
      }
    }
  });

  it("builds container-aware envelopes: symbol_path labels, sorted bounded symbol_names with authoritative total, O-5 doc/signature identity lines", async () => {
    const { trace, nodesByKey, meta } = await buildFixtureTree();
    const modes = classifyFrontierCore(trace, 0); // everything with children accumulates → all non-leaves take input.
    const summaries = new Map<string, string>();
    // Bottom-up so consumed-child summaries exist.
    const order: string[] = [];
    const walk = (k: string): void => {
      const t = trace.nodes.get(k);
      if (!t) throw new Error(`missing ${k}`);
      for (const c of t.child_keys) walk(c);
      order.push(k);
    };
    walk(trace.root_key);
    const inputs: CodeSemanticSynthesisInput[] = [];
    for (const key of order) {
      if (modes.get(key) === "subsumed") continue;
      const input = buildCodeSynthesisInputForNode(meta, trace, nodesByKey, modes, key, summaries);
      assertCodeSynthesisInputBounded(input); // every built input passes its own source-safety guard.
      inputs.push(input);
      summaries.set(key, `summary of ${key}`);
    }
    expect(inputs.length).toBeGreaterThan(0);

    const classInput = inputs.find((i) => i.symbol_path.some((p) => p.startsWith("class_decl Service")));
    expect(classInput).toBeDefined();
    const addLeaf = inputs.find((i) => i.symbol_path.length === 1 && i.symbol_path[0] === "function_decl add");
    expect(addLeaf).toBeDefined();
    expect(addLeaf!.doc_comment_first_line).toContain("Adds two numbers");
    expect(addLeaf!.signature_line).toContain("export function add");
    const memberLeaf = inputs.find((i) => i.symbol_path.length === 2 && i.symbol_path[0] === "class_decl Service" && i.symbol_path[1] === "member_method run");
    expect(memberLeaf).toBeDefined();
    expect(memberLeaf!.doc_comment_first_line).toContain("Runs one unit");

    const rootInput = inputs[inputs.length - 1]!;
    expect(rootInput.symbol_names).toEqual([...rootInput.symbol_names].sort());
    expect(rootInput.symbol_names_total).toBeGreaterThanOrEqual(rootInput.symbol_names.length);
    expect(rootInput.symbol_names).toContain("Service");
    expect(rootInput.symbol_names).toContain("add");
    expect(rootInput.symbol_names.length).toBeLessThanOrEqual(CODE_SYMBOL_NAMES_DISPLAY_CAP);
    expect(rootInput.child_summaries.length).toBeGreaterThan(0); // accumulating root consumes children.
  });

  it("fails closed on envelope violations: extra field, wrong discriminator, unbounded identity line, malformed output boundary", async () => {
    const { trace, nodesByKey, meta } = await buildFixtureTree();
    const modes = classifyFrontierCore(trace, 10_000); // root = frontier (no child summaries needed).
    const input = buildCodeSynthesisInputForNode(meta, trace, nodesByKey, modes, trace.root_key, new Map());

    expect(() => assertCodeSynthesisInputBounded({ ...input, raw_source: "class Service { … }" } as never)).toThrow(
      /unexpected field 'raw_source'/,
    );
    expect(() => assertCodeSynthesisInputBounded({ ...input, target_material_kind: "spreadsheet" } as never)).toThrow(
      /target_material_kind must be "code"/,
    );
    expect(() => assertCodeSynthesisInputBounded({ ...input, signature_line: "x".repeat(300) })).toThrow(
      /signature_line/,
    );
    expect(input.symbol_names.length).toBeGreaterThan(0); // non-vacuous: the understatement below must be < length.
    expect(() =>
      assertCodeSynthesisInputBounded({ ...input, symbol_names_total: input.symbol_names.length - 1 }),
    ).toThrow(/symbol_names_total/);

    expect(() =>
      assertCodeSynthesisOutputBounded({
        semantic_summary: "ok",
        boundaries: [{ line: "12", character_before: "a", character_after: "b" } as never],
      }),
    ).toThrow(/line must be a safe integer/);
    expect(() =>
      assertCodeSynthesisOutputBounded({
        semantic_summary: "ok",
        boundaries: [{ line: 12, character_before: "a", character_after: "b", row: 12 } as never],
      }),
    ).toThrow(/unexpected field 'row'/);
  });

  it("reconciles with line tolerance 1: exact and ±1 anchor, ±2 stays unanchored, every seam gets a coverage row", async () => {
    const { root } = await buildFixtureTree();
    const seam = root.boundaries[0];
    expect(seam).toBeDefined();
    const pos = seam!.first_new_line;
    // A line ≥2 away from EVERY seam (tolerance is 1) — pos+2 could anchor to a NEIGHBORING seam.
    const farLine = Math.max(...root.boundaries.map((b) => b.first_new_line)) + 10;
    const { boundaries, coverage } = reconcileCodeBoundaries(
      [
        { line: pos, character_before: "exact", character_after: "exact" },
        { line: farLine, character_before: "far", character_after: "far" },
      ],
      root as CodeReduceNode,
    );
    expect(boundaries[0]!.anchor_status).toBe("anchored");
    expect(boundaries[0]!.verification).toBe("structural_location_only");
    expect(boundaries[1]!.anchor_status).toBe("unanchored");
    expect(coverage.length).toBe(root.boundaries.length); // two-sided: EVERY seam is accounted for.
    expect(coverage.some((c) => c.status === "covered")).toBe(true);
  });
});
