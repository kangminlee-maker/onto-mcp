import { describe, expect, it } from "vitest";
import { observeCodeStructure } from "../code-structure-observer.js";
import {
  codeReduceNodeKey,
  foldCodeStructureInventory,
  type CodeReduceNode,
} from "./comprehension-reduce-code.js";
import {
  CODE_SOURCE_LINES_CHAR_CAP,
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
  // DD6′: the fixture text doubles as the observation-time whole-capture excerpt (sha-coherent
  // by construction — the observer extracted from the same text).
  return { inventory, root, trace, nodesByKey, meta: buildCodeSynthesisMeta(FILE, inventory, FIXTURE) };
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

  it("DD10 admission order (리뷰 gh M-2 선핀 총순서): span-desc → line_start-asc → nodeKey lex; the maxNodes cut keeps the WIDEST regions, and the order provably differs from the v1 lex cut", async () => {
    const { trace, nodesByKey, meta } = await buildFixtureTree();
    const map = accumulateCodeSemanticMap(meta, trace, nodesByKey, {
      synthesize: (input) => ({
        semantic_summary: `s ${input.node_ref.line_start}-${input.node_ref.line_end}`,
        boundaries: [],
      }),
      verifyUnanchored: () => "adversarial_refuted",
      preImageBase: PRE_IMAGE_BASE,
      overContextBudget: 2,
      seedBound: false,
    });

    const projection = projectCodeSemanticMapToSeed(map);
    expect(projection.nodes.length).toBeGreaterThan(2); // cardinality — an order claim over ≤2 nodes is near-vacuous.
    const spans = projection.nodes.map((n) => n.node_ref);
    // ① the file-level ROOT (widest span) admits FIRST — the starvation fix's essence.
    const widest = Math.max(...spans.map((s) => s.line_end - s.line_start));
    expect(spans[0]!.line_end - spans[0]!.line_start).toBe(widest);
    // ①②③ pinned total order holds pairwise across the whole projection.
    for (let i = 1; i < spans.length; i += 1) {
      const a = spans[i - 1]!;
      const b = spans[i]!;
      const cmp =
        (b.line_end - b.line_start) - (a.line_end - a.line_start) ||
        a.line_start - b.line_start ||
        (codeReduceNodeKey(a) < codeReduceNodeKey(b) ? -1 : 1);
      expect(cmp).toBeLessThan(0);
    }
    // Negative control: the v1 lex order over the SAME refs is a DIFFERENT sequence — if this ever
    // collapses to equal, the fixture can no longer falsify an admissionCompare regression.
    const lexOrder = [...spans].sort((a, b) => (codeReduceNodeKey(a) < codeReduceNodeKey(b) ? -1 : 1));
    expect(lexOrder.map((s) => codeReduceNodeKey(s))).not.toEqual(spans.map((s) => codeReduceNodeKey(s)));

    // The maxNodes cut consumes the admission order: survivors are exactly the head of the full
    // order (root/large regions), never the lex head — with authoritative totals intact.
    const capped = projectCodeSemanticMapToSeed(map, { maxNodes: 2 });
    expect(capped.nodes.map((n) => codeReduceNodeKey(n.node_ref)))
      .toEqual(spans.slice(0, 2).map((s) => codeReduceNodeKey(s)));
    expect(capped.nodes_total).toBe(projection.nodes_total);
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

    // DD6′: childless envelopes carry the EXACT span slice of the fixture text; merge envelopes
    // stay body-free (본문은 frontier에서만).
    expect(rootInput.source_lines).toBeNull();
    expect(addLeaf!.source_lines).not.toBeNull();
    const fixtureLines = FIXTURE.split("\n");
    const addRef = addLeaf!.node_ref;
    expect(addLeaf!.source_lines!.text).toBe(fixtureLines.slice(addRef.line_start - 1, addRef.line_end).join("\n"));
    expect(addLeaf!.source_lines!.text).toContain("return x + y;"); // the BODY is present (O-6 — v1 never shipped it).
    expect(addLeaf!.source_lines!.truncated).toBe(false);
    expect(addLeaf!.source_lines!.total_lines).toBe(addRef.line_end - addRef.line_start + 1);
  });

  it("DD6′ per-envelope source cap: an over-cap span head-truncates at 12,000 chars with the explicit flag and an authoritative total_lines", async () => {
    const { trace, nodesByKey, meta } = await buildFixtureTree();
    const modes = classifyFrontierCore(trace, 10_000); // root = frontier — the whole file is one envelope.
    const rootRef = trace.nodes.get(trace.root_key)!.node_ref;
    const spanLineCount = rootRef.line_end - rootRef.line_start + 1;
    // Same line COUNT as the real capture (the slice-integrity guard must pass); one giant line
    // pushes the joined span far over the cap.
    const giantLines = meta.sourceLines.map((line, i) => (i === 0 ? "x".repeat(CODE_SOURCE_LINES_CHAR_CAP + 3_000) : line));
    const giantMeta = { ...meta, sourceLines: giantLines };
    const input = buildCodeSynthesisInputForNode(giantMeta, trace, nodesByKey, modes, trace.root_key, new Map());
    assertCodeSynthesisInputBounded(input); // the capped envelope passes its own guard.
    expect(input.source_lines).not.toBeNull();
    expect(input.source_lines!.truncated).toBe(true);
    expect(input.source_lines!.text.length).toBe(CODE_SOURCE_LINES_CHAR_CAP);
    expect(input.source_lines!.total_lines).toBe(spanLineCount);
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

    // DD6′ frontier ⇔ source biconditional + source bounds (fail-closed both directions).
    expect(input.child_summaries.length).toBe(0); // this IS a frontier envelope — non-vacuous below.
    expect(() => assertCodeSynthesisInputBounded({ ...input, source_lines: null })).toThrow(
      /null on a frontier/,
    );
    expect(() =>
      assertCodeSynthesisInputBounded({
        ...input,
        source_lines: null,
        child_summaries: [{ key: "1-1", summary: "s" }],
      }),
    ).not.toThrow(); // a merge envelope is body-free by contract.
    expect(() =>
      assertCodeSynthesisInputBounded({
        ...input,
        child_summaries: [{ key: "1-1", summary: "s" }],
      }),
    ).toThrow(/source on a merge/);
    expect(() =>
      assertCodeSynthesisInputBounded({
        ...input,
        source_lines: { ...input.source_lines!, extra: 1 } as never,
      }),
    ).toThrow(/unexpected field 'extra'/);
    expect(() =>
      assertCodeSynthesisInputBounded({
        ...input,
        source_lines: { ...input.source_lines!, text: "x".repeat(CODE_SOURCE_LINES_CHAR_CAP + 1) },
      }),
    ).toThrow(/source cap/);
    expect(() =>
      assertCodeSynthesisInputBounded({
        ...input,
        source_lines: { ...input.source_lines!, total_lines: 0 },
      }),
    ).toThrow(/total_lines/);

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
