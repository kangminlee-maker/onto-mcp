import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  buildSemanticMapBridgeCallbacks,
  mergeSemanticSeedProjections,
  resolveSemanticMapCapability,
  runSemanticMapStage,
  type ReconstructDirectiveAuthor,
  type SemanticMapStageConfig,
} from "./run.js";
import type {
  SemanticBoundaryVerification,
  SemanticBoundaryVerifyInput,
  SemanticSynthesisInput,
  SemanticSynthesisOutput,
} from "./comprehension-semantic-map.js";
import type { ColumnValueTiles } from "../spreadsheet-structure-observer.js";

// W1 (wiring design 20260702 §15.2/§15.3): the semantic-map author capability PAIR rule.
// Production enforcement starts when the W2 semantic_map stage entry calls the resolver; W1 fixes
// the resolver's executable contract here (the fail-loud one-sided pair is the negative-control pair).

type CapabilitySeat = Pick<
  ReconstructDirectiveAuthor,
  "synthesizeSemanticMapNode" | "verifySemanticMapBoundary"
>;

const synthesize = async (): Promise<SemanticSynthesisOutput> => ({
  semantic_summary: "s",
  boundaries: [],
});
const verify = async (): Promise<SemanticBoundaryVerification> => "adversarial_confirmed";

describe("resolveSemanticMapCapability (W1 pair rule)", () => {
  it("both present → 'present'", () => {
    const author: CapabilitySeat = {
      synthesizeSemanticMapNode: synthesize,
      verifySemanticMapBoundary: verify,
    };
    expect(resolveSemanticMapCapability(author)).toBe("present");
  });

  it("both absent → 'absent' (default-off skip signal, readLeafLabels precedent)", () => {
    const author: CapabilitySeat = {};
    expect(resolveSemanticMapCapability(author)).toBe("absent");
  });

  it("only synthesize → fail-loud configuration error (negative control)", () => {
    const author: CapabilitySeat = { synthesizeSemanticMapNode: synthesize };
    expect(() => resolveSemanticMapCapability(author)).toThrow(/PAIR/);
  });

  it("only verify → fail-loud configuration error (negative control)", () => {
    const author: CapabilitySeat = { verifySemanticMapBoundary: verify };
    expect(() => resolveSemanticMapCapability(author)).toThrow(/PAIR/);
  });
});

// ── W2 stage fixtures ─────────────────────────────────────────────────────────────────────────────

function seg(rowStart: number, rowEnd: number, shape: string | null): ColumnValueTiles["segments"][number] {
  return {
    row_start: rowStart,
    row_end: rowEnd,
    non_empty: shape === null ? 0 : rowEnd - rowStart + 1,
    type_counts: shape === null ? {} : { string: rowEnd - rowStart + 1 },
    shape_counts: shape === null ? {} : { [shape]: rowEnd - rowStart + 1 },
    dominant_shape: shape,
    format_counts: {},
    dominant_format: null,
    distinct_count: shape === null ? 0 : 3,
    distinct_is_lower_bound: false,
  };
}

/** 4 non-empty segments TEXT/TEXT/DEC/DEC + one exact value_shape seam at row 21. */
function richColumn(columnIndex: number): ColumnValueTiles {
  return {
    column_index: columnIndex,
    segments: [seg(1, 10, "TEXT"), seg(11, 20, "TEXT"), seg(21, 30, "DEC"), seg(31, 40, "DEC")],
    segments_capped: false,
    intra_tile_notes: [
      { boundary_kind: "value_shape", prev_shape: "TEXT", new_shape: "DEC", last_prev_format_row: 20, first_new_format_row: 21 },
    ],
  };
}

function emptyColumn(columnIndex: number): ColumnValueTiles {
  return { column_index: columnIndex, segments: [seg(1, 40, null)], segments_capped: false, intra_tile_notes: [] };
}

function observationsArtifact(
  observations: { observation_id: string; columns: ColumnValueTiles[] }[],
): Parameters<typeof runSemanticMapStage>[0]["sourceObservations"] {
  return {
    observations: observations.map((o) => ({
      observation_id: o.observation_id,
      target_material_kind: "spreadsheet",
      structural_data: {
        workbook_inventory: {
          segmented_value_tiles: [{ sheet: "S", window: 1024, columns: o.columns, retained_segments: 0 }],
        },
      },
    })),
  } as unknown as Parameters<typeof runSemanticMapStage>[0]["sourceObservations"];
}

/** Deterministic mock author: one boundary at the node's row_start (anchored only for the node
 *  starting at the seam row 21), verify verdict by row parity. Counters expose call counts. */
function mockAuthor(opts: { failOnColumn?: number; failVerify?: boolean } = {}): {
  author: ReconstructDirectiveAuthor;
  counters: { synthesize: number; verify: number };
} {
  const counters = { synthesize: 0, verify: 0 };
  const author = {
    async synthesizeSemanticMapNode(input: SemanticSynthesisInput): Promise<SemanticSynthesisOutput> {
      // ATTEMPT counter (W2-X7-001): incremented before a failure throw, mirroring the stage's
      // dispatch-time accounting — so census totals can be asserted against real attempts.
      counters.synthesize += 1;
      if (opts.failOnColumn !== undefined && input.node_ref.column_index === opts.failOnColumn) {
        throw new Error("mock synthesize failure (W2 fallback NC)");
      }
      // Seam-aware (junction seams materialize on MERGE nodes): anchor one boundary at the first
      // seam when the node has one (exercises the anchored path), plus one at row_start (unanchored
      // wherever no seam is within ±1 — exercises the adversarial path).
      const seam = input.value_shape_seams[0];
      return {
        semantic_summary: `mock ${input.node_ref.sheet}#${input.node_ref.column_index}:${input.node_ref.row_start}-${input.node_ref.row_end} kids=${input.child_summaries.length}`,
        boundaries: [
          ...(seam ? [{ row: seam.row, character_before: "seam-prev", character_after: "seam-next" }] : []),
          { row: input.node_ref.row_start, character_before: "prev", character_after: "next" },
        ],
      };
    },
    async verifySemanticMapBoundary(input: SemanticBoundaryVerifyInput): Promise<SemanticBoundaryVerification> {
      counters.verify += 1; // attempt counter (before a failure throw — mirrors dispatch accounting)
      if (opts.failVerify) throw new Error("mock verify failure (W2 rejection-path NC)");
      return input.boundary.row % 2 === 0 ? "adversarial_confirmed" : "adversarial_refuted";
    },
  } as unknown as ReconstructDirectiveAuthor;
  return { author, counters };
}

const CONFIG: SemanticMapStageConfig = {
  leaf_count: 4,
  fanin: 2,
  over_context_budget: 1,
  max_synthesize_calls: 100,
  max_verify_calls: 100,
  max_nodes: 50,
  max_disclosure: 50,
};

const PRE_IMAGE_BASE = {
  reduce_reader_model_identity: "mock/none",
  reduce_prompt_sha256: "p",
  reduce_schema_tool_version: "v1",
  comprehension_version: "c1",
  over_context_gate_config_sha256: "cfg",
  over_context_gate_logic_sha256: "logic",
};

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "w2-semantic-map-"));
}

// ── W2 stage: deterministic E2E + negative controls (design §7 W2 row) ───────────────────────────

describe("runSemanticMapStage (W2)", () => {
  it("E2E happy path: real trees from tiles → bridge → module accumulate → merged projection + census + sidecar", async () => {
    const { author, counters } = mockAuthor();
    const sessionRoot = await tempRoot();
    const result = await runSemanticMapStage({
      sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0), emptyColumn(1)] }]),
      directiveAuthor: author,
      sessionRoot,
      config: CONFIG,
      preImageBase: PRE_IMAGE_BASE,
    });
    // 4 leaves, fanin 2 → 7 nodes; budget 1 → 4 leaf frontiers + 3 accumulating = 7 produced.
    expect(counters.synthesize).toBe(7);
    expect(result.census?.observations_map_present).toBe(1);
    const projection = result.projectionByObservation.get("obs-1");
    expect(projection).toBeDefined();
    expect(projection!.authority).toBe("non_authoritative");
    expect(projection!.nodes_total).toBeGreaterThan(0);
    // the seam-row boundary (row 21) is anchored somewhere; unanchored ones were all adversarially processed.
    const rows = result.census!.by_observation[0]!.columns;
    expect(rows.map((r) => r.status)).toEqual(["produced", "empty"]);
    expect(rows[0]!.anchored).toBeGreaterThan(0);
    expect(rows[0]!.unanchored).toBe(rows[0]!.adversarial_confirmed + rows[0]!.adversarial_refuted);
    // census + sidecar ALWAYS persisted when the stage ran (dead-code / ENOENT negative control).
    const census = parseYaml(await fs.readFile(result.censusPath!, "utf8")) as { schema_version: string };
    expect(census.schema_version).toBe("1");
    const sidecar = parseYaml(await fs.readFile(result.sidecarPath!, "utf8")) as { observations: { observation_id: string }[] };
    expect(sidecar.observations[0]!.observation_id).toBe("obs-1");
  });

  it("default-off: author without the pair → skip result, census null, NO files", async () => {
    const sessionRoot = await tempRoot();
    const result = await runSemanticMapStage({
      sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
      directiveAuthor: {} as unknown as ReconstructDirectiveAuthor,
      sessionRoot,
      config: CONFIG,
      preImageBase: PRE_IMAGE_BASE,
    });
    expect(result.census).toBeNull();
    expect(result.censusPath).toBeNull();
    expect(result.projectionByObservation.size).toBe(0);
    await expect(fs.access(path.join(sessionRoot, "comprehension", "semantic-map-census.yaml"))).rejects.toThrow();
  });

  it("X5 fallback: one failing column dooms ITS observation to flat; sibling observation unaffected", async () => {
    const { author } = mockAuthor({ failOnColumn: 1 });
    const sessionRoot = await tempRoot();
    const result = await runSemanticMapStage({
      sourceObservations: observationsArtifact([
        { observation_id: "obs-doomed", columns: [richColumn(0), richColumn(1)] },
        { observation_id: "obs-ok", columns: [richColumn(0)] },
      ]),
      directiveAuthor: author,
      sessionRoot,
      config: CONFIG,
      preImageBase: PRE_IMAGE_BASE,
    });
    expect(result.projectionByObservation.has("obs-doomed")).toBe(false); // no partial-map silent replace
    expect(result.projectionByObservation.has("obs-ok")).toBe(true);
    const doomed = result.census!.by_observation.find((o) => o.observation_id === "obs-doomed")!;
    expect(doomed.map_present).toBe(false);
    expect(doomed.columns.map((c) => c.status)).toEqual(["produced", "failed"]);
    expect(doomed.columns[1]!.reason).toMatch(/mock synthesize failure/);
  });

  it("X7 synthesize preflight cap: observation capped with ZERO author calls + census records it", async () => {
    const { author, counters } = mockAuthor();
    const sessionRoot = await tempRoot();
    const result = await runSemanticMapStage({
      sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
      directiveAuthor: author,
      sessionRoot,
      config: { ...CONFIG, max_synthesize_calls: 3 }, // needs 7
      preImageBase: PRE_IMAGE_BASE,
    });
    expect(counters.synthesize).toBe(0); // deterministic skip BEFORE any LLM call
    expect(result.projectionByObservation.size).toBe(0);
    const row = result.census!.by_observation[0]!;
    expect(row.map_present).toBe(false);
    expect(row.columns[0]!.status).toBe("capped");
    expect(row.columns[0]!.reason).toMatch(/preflight/);
  });

  it("X7/R2-01 verify incremental cap: exceeding mid-column → capped column → observation fallback (spent calls counted)", async () => {
    const { author, counters } = mockAuthor();
    const sessionRoot = await tempRoot();
    const result = await runSemanticMapStage({
      sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
      directiveAuthor: author,
      sessionRoot,
      config: { ...CONFIG, max_verify_calls: 0 }, // first unanchored boundary → cap
      preImageBase: PRE_IMAGE_BASE,
    });
    expect(result.projectionByObservation.size).toBe(0);
    const col = result.census!.by_observation[0]!.columns[0]!;
    expect(col.status).toBe("capped");
    expect(col.reason).toMatch(/verify-call cap/);
    expect(counters.verify).toBe(0);
    expect(result.census!.synthesize_calls_total).toBeGreaterThan(0); // spent synthesize calls honestly counted
    // Row↔total consistency: the capped ROW carries its spent calls (Σ rows == totals — no hidden spend).
    expect(col.synthesize_calls).toBe(result.census!.synthesize_calls_total);
  });

  it("W2-X7-001: a dispatched-then-throwing call is still COUNTED (attempt accounting, census==attempts)", async () => {
    const { author, counters } = mockAuthor({ failOnColumn: 0 }); // first synthesize dispatch throws
    const sessionRoot = await tempRoot();
    const result = await runSemanticMapStage({
      sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
      directiveAuthor: author,
      sessionRoot,
      config: CONFIG,
      preImageBase: PRE_IMAGE_BASE,
    });
    expect(counters.synthesize).toBe(1); // one attempt, thrown
    expect(result.census!.synthesize_calls_total).toBe(1); // the ATTEMPT is budget spend, not the success
    expect(result.census!.by_observation[0]!.columns[0]!.synthesize_calls).toBe(1); // row == total
  });

  it("X7 preflight exact boundary: budget == need → runs; budget == need-1 → capped (off-by-one control)", async () => {
    const run = async (cap: number) => {
      const { author, counters } = mockAuthor();
      const result = await runSemanticMapStage({
        sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
        directiveAuthor: author,
        sessionRoot: await tempRoot(),
        config: { ...CONFIG, max_synthesize_calls: cap },
        preImageBase: PRE_IMAGE_BASE,
      });
      return { status: result.census!.by_observation[0]!.columns[0]!.status, calls: counters.synthesize };
    };
    expect(await run(7)).toEqual({ status: "produced", calls: 7 }); // exactly the need → NOT capped
    expect(await run(6)).toEqual({ status: "capped", calls: 0 }); // one short → deterministic skip, zero LLM
  });

  it("W2-X7-001 (verify side): a dispatched-then-throwing verify is counted; column fails to flat", async () => {
    const { author, counters } = mockAuthor({ failVerify: true });
    const sessionRoot = await tempRoot();
    const result = await runSemanticMapStage({
      sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
      directiveAuthor: author,
      sessionRoot,
      config: CONFIG,
      preImageBase: PRE_IMAGE_BASE,
    });
    expect(result.projectionByObservation.size).toBe(0); // verify failure → column failed → flat
    expect(counters.verify).toBe(1); // one attempt, thrown
    expect(result.census!.verify_calls_total).toBe(1); // attempt counted (verify side of W2-X7-001)
    expect(result.census!.by_observation[0]!.columns[0]!.status).toBe("failed");
  });

  it("census partition (onto issue-003/006): unevaluatable spreadsheet observations recorded with skip_reason, totals reconcile", async () => {
    const { author } = mockAuthor();
    const sessionRoot = await tempRoot();
    const noTiles = {
      observations: [
        {
          observation_id: "obs-no-tiles",
          target_material_kind: "spreadsheet",
          structural_data: { workbook_inventory: { segmented_value_tiles: [] } },
        },
        {
          observation_id: "obs-no-inventory",
          target_material_kind: "spreadsheet",
          structural_data: {},
        },
      ],
    } as unknown as Parameters<typeof runSemanticMapStage>[0]["sourceObservations"];
    const result = await runSemanticMapStage({
      sourceObservations: noTiles,
      directiveAuthor: author,
      sessionRoot,
      config: CONFIG,
      preImageBase: PRE_IMAGE_BASE,
    });
    const census = result.census!;
    expect(census.observations_total).toBe(2); // COMPLETE partition — nothing silently dropped
    expect(census.observations_total).toBe(census.observations_map_present + census.observations_map_absent);
    expect(census.by_observation.map((o) => o.skip_reason)).toEqual(["no_value_tiles", "no_workbook_inventory"]);
  });

  it("config fail-loud (R2-04): a NaN/absent cap throws at entry, before any work", async () => {
    const { author, counters } = mockAuthor();
    const sessionRoot = await tempRoot();
    await expect(
      runSemanticMapStage({
        sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
        directiveAuthor: author,
        sessionRoot,
        config: { ...CONFIG, max_nodes: Number.NaN },
        preImageBase: PRE_IMAGE_BASE,
      }),
    ).rejects.toThrow(/max_nodes/);
    expect(counters.synthesize).toBe(0);
  });

  it("one-sided author → stage entry fail-loud (production enforcement site, §15.2)", async () => {
    const sessionRoot = await tempRoot();
    const oneSided = { synthesizeSemanticMapNode: async () => ({ semantic_summary: "s", boundaries: [] }) } as unknown as ReconstructDirectiveAuthor;
    await expect(
      runSemanticMapStage({
        sourceObservations: observationsArtifact([]),
        directiveAuthor: oneSided,
        sessionRoot,
        config: CONFIG,
        preImageBase: PRE_IMAGE_BASE,
      }),
    ).rejects.toThrow(/PAIR/);
  });

  it("determinism: two runs over the same fixture → identical projection and census", async () => {
    const run = async () => {
      const { author } = mockAuthor();
      return runSemanticMapStage({
        sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
        directiveAuthor: author,
        sessionRoot: await tempRoot(),
        config: CONFIG,
        preImageBase: PRE_IMAGE_BASE,
      });
    };
    const [a, b] = [await run(), await run()];
    expect(a.projectionByObservation.get("obs-1")).toEqual(b.projectionByObservation.get("obs-1"));
    expect(a.census).toEqual(b.census);
  });
});

// ── §3(b)/(c) bridge drift detectors: falsifiable without production hooks ────────────────────────

describe("buildSemanticMapBridgeCallbacks (W2 §3 drift guards)", () => {
  const input: SemanticSynthesisInput = {
    node_ref: { sheet: "S", column_index: 0, row_start: 1, row_end: 10 },
    format_clusters: ["TEXT"],
    value_shape_seams: [],
    child_summaries: [],
  };
  const output: SemanticSynthesisOutput = { semantic_summary: "s", boundaries: [] };

  it("synthesize drift: recorded input ≠ module input → throw (silent divergence blocked)", () => {
    const callbacks = buildSemanticMapBridgeCallbacks(
      new Map([["S#0:1-10", { input_json: "TAMPERED", output, verifies: [] }]]),
    );
    expect(() => callbacks.synthesize(input)).toThrow(/drifted/);
  });

  it("synthesize: missing precomputed node → throw (no silent fabrication)", () => {
    const callbacks = buildSemanticMapBridgeCallbacks(new Map());
    expect(() => callbacks.synthesize(input)).toThrow(/no precomputed synthesis/);
  });

  it("verify: unmatched full-input key → throw (X3 — no conservative fallback)", () => {
    const callbacks = buildSemanticMapBridgeCallbacks(
      new Map([["S#0:1-10", { input_json: "x", output, verifies: [{ input_json: "OTHER", verdict: "adversarial_confirmed" }] }]]),
    );
    const verifyInput: SemanticBoundaryVerifyInput = {
      node_ref: { sheet: "S", column_index: 0, row_start: 1, row_end: 10 },
      boundary: { row: 3, character_before: "a", character_after: "b", anchor_status: "unanchored", verification: "unverified" },
      summary: "s",
    };
    expect(() => callbacks.verifyUnanchored(verifyInput)).toThrow(/no recorded adversarial verification/);
  });
});

// ── merge helper: authoritative totals + canonical order ─────────────────────────────────────────

describe("mergeSemanticSeedProjections (W2)", () => {
  it("sums AUTHORITATIVE totals and re-caps display lists (bounded view, honest totals)", () => {
    const p = (col: number, nodes: number, taint: number) => ({
      authority: "non_authoritative" as const,
      provisional: true as const,
      nodes: Array.from({ length: nodes }, (_, i) => ({
        node_ref: { sheet: "S", column_index: col, row_start: i + 1, row_end: i + 10 },
        semantic_summary: `c${col}n${i}`,
        boundaries: [],
      })),
      nodes_total: nodes,
      refuted_disclosure: [],
      refuted_disclosure_total: 0,
      unanchored_unverified_total: taint,
    });
    const merged = mergeSemanticSeedProjections([p(0, 3, 1), p(1, 3, 2)], { max_nodes: 4, max_disclosure: 4 });
    expect(merged.nodes_total).toBe(6); // authoritative sum
    expect(merged.nodes.length).toBe(4); // display re-capped — shorter than total, never a silent drop
    expect(merged.unanchored_unverified_total).toBe(3);
    // canonical order: all of column 0 before column 1 (reduceNodeKey sort)
    expect(merged.nodes[0]!.node_ref.column_index).toBe(0);
  });
});
