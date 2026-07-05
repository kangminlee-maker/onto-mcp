import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  buildSemanticMapBridgeCallbacks,
  DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
  dispatchIncompleteArtifactPath,
  mergeSemanticSeedProjections,
  observationPromptPayload,
  RECONSTRUCT_AUTHORING_PROMPT_CONTRACT,
  renderSemanticMapProjection,
  resolveSemanticMapCapability,
  runSemanticMapStage,
  SEMANTIC_MAP_PROMPT_NOTE,
  SEMANTIC_MAP_SEED_PROMPT_NOTE,
  type ReconstructDirectiveAuthor,
  type SemanticMapStageConfig,
} from "./run.js";
import {
  DispatchBreakerTrippedError,
  type DispatchBreakerPolicy,
} from "../llm/dispatch-breaker.js";
import type { DispatchIncompleteArtifact } from "../llm/dispatch-breaker.js";
import type { SemanticSeedProjection } from "./comprehension-semantic-map.js";
import type {
  SemanticBoundaryVerification,
  SemanticBoundaryVerifyInput,
  SemanticSynthesisInput,
  SemanticSynthesisOutput,
} from "./comprehension-semantic-map.js";
import type { ColumnValueTiles } from "../spreadsheet-structure-observer.js";
import { assertGatingKeyExcludesInEpochOutput } from "./llm-touch-fingerprint.js";
import { unitIdForAuthoredArtifactName } from "./execution-telemetry.js";

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
      verifyModelIdentity: "mock/none",
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
      verifyModelIdentity: "mock/none",
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
      verifyModelIdentity: "mock/none",
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
      verifyModelIdentity: "mock/none",
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
      verifyModelIdentity: "mock/none",
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
      verifyModelIdentity: "mock/none",
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
        verifyModelIdentity: "mock/none",
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
      verifyModelIdentity: "mock/none",
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
      verifyModelIdentity: "mock/none",
    });
    const census = result.census!;
    expect(census.observations_total).toBe(2); // COMPLETE partition — nothing silently dropped
    expect(census.observations_total).toBe(census.observations_map_present + census.observations_map_absent);
    // canonical observation_id processing order (onto-W3 issue-004a): obs-no-inventory < obs-no-tiles
    expect(census.by_observation.map((o) => o.skip_reason)).toEqual(["no_workbook_inventory", "no_value_tiles"]);
  });

  it("W3-005: duplicate observation_id → fail-loud at stage entry (aggregate/map keying)", async () => {
    const { author } = mockAuthor();
    await expect(
      runSemanticMapStage({
        sourceObservations: observationsArtifact([
          { observation_id: "dup", columns: [richColumn(0)] },
          { observation_id: "dup", columns: [richColumn(0)] },
        ]),
        directiveAuthor: author,
        sessionRoot: await tempRoot(),
        config: CONFIG,
        preImageBase: PRE_IMAGE_BASE,
        verifyModelIdentity: "mock/none",
      }),
    ).rejects.toThrow(/duplicate observation_id/);
  });

  it("ultracode-A containment NC: a malformed column (absent segments) dooms ITS observation, run+census+sibling survive", async () => {
    const { author } = mockAuthor();
    const sessionRoot = await tempRoot();
    const malformed = {
      observations: [
        {
          observation_id: "obs-bad",
          target_material_kind: "spreadsheet",
          structural_data: {
            workbook_inventory: {
              segmented_value_tiles: [
                { sheet: "S", window: 1024, columns: [{ column_index: 0 }], retained_segments: 0 }, // no segments → pre-fix crash
              ],
            },
          },
        },
        {
          observation_id: "obs-good",
          target_material_kind: "spreadsheet",
          structural_data: {
            workbook_inventory: {
              segmented_value_tiles: [{ sheet: "S", window: 1024, columns: [richColumn(0)], retained_segments: 0 }],
            },
          },
        },
      ],
    } as unknown as Parameters<typeof runSemanticMapStage>[0]["sourceObservations"];
    const result = await runSemanticMapStage({
      sourceObservations: malformed,
      directiveAuthor: author,
      sessionRoot,
      config: CONFIG,
      preImageBase: PRE_IMAGE_BASE,
      verifyModelIdentity: "mock/none",
    }); // must NOT throw (pre-fix: TypeError escaped the stage and killed the run)
    const bad = result.census!.by_observation.find((o) => o.observation_id === "obs-bad")!;
    expect(bad.skip_reason).toBe("deterministic_phase_failed");
    expect(bad.skip_detail).toMatch(/segments|filter|undefined/i);
    expect(result.projectionByObservation.has("obs-good")).toBe(true); // sibling unaffected
    expect(result.censusPath).toBeTruthy(); // always-written census survived the contained failure
    expect(result.census!.observations_total).toBe(
      result.census!.observations_map_present + result.census!.observations_map_absent,
    );
  });

  it("ultracode doom-skip NC: FIRST column fails → sibling column row is skipped_observation_fallback with zero calls", async () => {
    const { author } = mockAuthor({ failOnColumn: 0 });
    const result = await runSemanticMapStage({
      sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0), richColumn(1)] }]),
      directiveAuthor: author,
      sessionRoot: await tempRoot(),
      config: CONFIG,
      preImageBase: PRE_IMAGE_BASE,
      verifyModelIdentity: "mock/none",
    });
    const rows = result.census!.by_observation[0]!.columns;
    expect(rows.map((r) => r.status)).toEqual(["failed", "skipped_observation_fallback"]);
    expect(rows[1]!.synthesize_calls).toBe(0); // post-failure LLM work actually skipped
  });

  it("ultracode X7 NC: the cap is a GLOBAL running total across observations (dropping accumulation would pass obs-2)", async () => {
    const { author, counters } = mockAuthor();
    const result = await runSemanticMapStage({
      sourceObservations: observationsArtifact([
        { observation_id: "obs-1", columns: [richColumn(0)] },
        { observation_id: "obs-2", columns: [richColumn(0)] },
      ]),
      directiveAuthor: author,
      sessionRoot: await tempRoot(),
      config: { ...CONFIG, max_synthesize_calls: 7 }, // exactly ONE observation's need
      preImageBase: PRE_IMAGE_BASE,
      verifyModelIdentity: "mock/none",
    });
    expect(counters.synthesize).toBe(7); // only the first observation ran
    const [first, second] = result.census!.by_observation;
    expect(first!.map_present).toBe(true);
    expect(second!.map_present).toBe(false);
    expect(second!.columns[0]!.status).toBe("capped"); // global-total preflight capped obs-2
  });

  it("ultracode rotation axes: leaf_count (F2) and prompt-contract sha (F6) rotate the aggregate fingerprint", async () => {
    const run = async (over: Partial<SemanticMapStageConfig>, preOver: Partial<typeof PRE_IMAGE_BASE>) => {
      const { author } = mockAuthor();
      return (await runSemanticMapStage({
        sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
        directiveAuthor: author,
        sessionRoot: await tempRoot(),
        config: { ...CONFIG, ...over },
        preImageBase: { ...PRE_IMAGE_BASE, ...preOver },
        verifyModelIdentity: "mock/none",
      })).aggregateFingerprint;
    };
    const base = await run({}, {});
    expect(await run({ leaf_count: 2 }, {})).not.toBe(base); // F2 topology axis
    expect(await run({}, { reduce_prompt_sha256: "p2" })).not.toBe(base); // F6 prompt-contract axis
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
        verifyModelIdentity: "mock/none",
      });
    };
    const [a, b] = [await run(), await run()];
    expect(a.projectionByObservation.get("obs-1")).toEqual(b.projectionByObservation.get("obs-1"));
    expect(a.census).toEqual(b.census);
  });
});

// ── W3: reuse fingerprint rotation + gating-key denylist + telemetry registration ────────────────

describe("W3 fingerprint + registration", () => {
  const runWith = async (over: Partial<SemanticMapStageConfig> = {}, preOver: Partial<typeof PRE_IMAGE_BASE> = {}, verifyModelIdentity = "mock/none") => {
    const { author } = mockAuthor();
    return runSemanticMapStage({
      sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
      directiveAuthor: author,
      sessionRoot: await tempRoot(),
      config: { ...CONFIG, ...over },
      preImageBase: { ...PRE_IMAGE_BASE, ...preOver },
      verifyModelIdentity,
    });
  };

  it("aggregate fingerprint is deterministic; rotates on topology config (F2), verify model (F4), version knob", async () => {
    const base1 = (await runWith()).aggregateFingerprint;
    const base2 = (await runWith()).aggregateFingerprint;
    expect(base1).toBeTruthy();
    expect(base1).toBe(base2); // deterministic — same inputs, same key
    expect((await runWith({ fanin: 3 })).aggregateFingerprint).not.toBe(base1); // F2: silent-stale class
    expect((await runWith({ max_verify_calls: 99 })).aggregateFingerprint).not.toBe(base1); // X7 cap folded
    expect((await runWith({ max_nodes: 49 })).aggregateFingerprint).not.toBe(base1); // X9 projection cap folded
    expect((await runWith({}, {}, "other/model")).aggregateFingerprint).not.toBe(base1); // F4 verify model
    expect((await runWith({}, { comprehension_version: "c2" })).aggregateFingerprint).not.toBe(base1); // knob
    expect((await runWith({}, { reduce_reader_model_identity: "swap/model" })).aggregateFingerprint).not.toBe(base1);
    // Whole-preImageBase fold (self-caught silent-stale): gate LOGIC version + schema tool version
    // rotate the seed key too — a selective fold left these outside it.
    expect((await runWith({}, { over_context_gate_logic_sha256: "logic-v2" })).aggregateFingerprint).not.toBe(base1);
    expect((await runWith({}, { reduce_schema_tool_version: "v2" })).aggregateFingerprint).not.toBe(base1);
  });

  it("R2 DEFAULT-config pin (real-LLM cut §10.F4): the PRODUCTION default config is exact-pinned — any change rotates every capability-on seed reuse key and must be a conscious decision", () => {
    expect(DEFAULT_SEMANTIC_MAP_STAGE_CONFIG).toEqual({
      leaf_count: 8,
      fanin: 2,
      over_context_budget: 2,
      max_synthesize_calls: 2400,
      max_verify_calls: 1000,
      max_nodes: 60,
      max_disclosure: 30,
    });
  });

  it("W4-001 golden pin: the aggregate fingerprint is CONSCIOUSLY rotated — any pre-image change (incl. the render-budget VALUE fold) fails this literal", async () => {
    expect((await runWith()).aggregateFingerprint).toBe("5cf86504af2b72b18072204e9fbba850fc828ca5f18b423f5fb5dc9dce2ae4bb");
  });

  it("skipped stage → aggregate fingerprint null (leaf-read null pattern)", async () => {
    const result = await runSemanticMapStage({
      sourceObservations: observationsArtifact([{ observation_id: "obs-1", columns: [richColumn(0)] }]),
      directiveAuthor: {} as unknown as ReconstructDirectiveAuthor,
      sessionRoot: await tempRoot(),
      config: CONFIG,
      preImageBase: PRE_IMAGE_BASE,
      verifyModelIdentity: "mock/none",
    });
    expect(result.aggregateFingerprint).toBeNull();
  });

  it("F9 denylist: a gating key carrying a Layer-2 ⓒ field fails closed", () => {
    expect(() =>
      assertGatingKeyExcludesInEpochOutput("w3-test", { nested: { semantic_summary: "llm text" } }),
    ).toThrow(/semantic_summary/);
    expect(() =>
      assertGatingKeyExcludesInEpochOutput("w3-test", { refuted_disclosure: [] }),
    ).toThrow(/refuted_disclosure/);
  });

  it("F5 telemetry: BOTH author capability call names resolve to the semantic_map unit (Defect-1 guard)", () => {
    expect(unitIdForAuthoredArtifactName("semantic-map-synthesize")).toBe("semantic_map");
    expect(unitIdForAuthoredArtifactName("semantic-map-verify")).toBe("semantic_map");
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

  it("ultracode-G: byte-identical duplicate boundaries replay 1:1 (match-and-consume, no first-verdict aliasing)", () => {
    const dupInput: SemanticBoundaryVerifyInput = {
      node_ref: { sheet: "S", column_index: 0, row_start: 1, row_end: 10 },
      boundary: { row: 3, character_before: "a", character_after: "b", anchor_status: "unanchored", verification: "unverified" },
      summary: "s",
    };
    // Match the bridge's stableJson (recursive key sort) so the recorded key equals the replay key.
    const stable = (v: unknown): string =>
      Array.isArray(v)
        ? `[${v.map(stable).join(",")}]`
        : v && typeof v === "object"
          ? `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
          : JSON.stringify(v) ?? "null";
    const dupJson = stable(dupInput);
    const callbacks = buildSemanticMapBridgeCallbacks(
      new Map([[
        "S#0:1-10",
        {
          input_json: "x",
          output,
          verifies: [
            { input_json: dupJson, verdict: "adversarial_confirmed" as const },
            { input_json: dupJson, verdict: "adversarial_refuted" as const },
          ],
        },
      ]]),
    );
    // Two identical module calls must consume BOTH records in order — a find-first replay returns
    // confirmed twice (silently overwriting the author's refuted second answer).
    const verifyModuleShape = (cb: typeof callbacks.verifyUnanchored) => [cb(dupInput), cb(dupInput)];
    expect(verifyModuleShape(callbacks.verifyUnanchored)).toEqual(["adversarial_confirmed", "adversarial_refuted"]);
    expect(() => callbacks.verifyUnanchored(dupInput)).toThrow(/no unconsumed/); // third call = over-replay
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
    expect(() => callbacks.verifyUnanchored(verifyInput)).toThrow(/no unconsumed recorded adversarial verification/);
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


// ── W4 §4: shared renderer + observation-prompt replace surface ───────────────────────────────────

function seedProjection(nodes: number): SemanticSeedProjection {
  return {
    authority: "non_authoritative",
    provisional: true,
    nodes: Array.from({ length: nodes }, (_, i) => ({
      node_ref: { sheet: "S", column_index: 0, row_start: i * 10 + 1, row_end: i * 10 + 10 },
      semantic_summary: `summary-${i}`,
      boundaries: [
        { row: i * 10 + 2, character_before: "a", character_after: "b", disposition: "structural_location_only" as const },
      ],
    })),
    nodes_total: nodes,
    refuted_disclosure: [],
    refuted_disclosure_total: 1,
    unanchored_unverified_total: 2,
  };
}

function projectionWithRefuted(nodes: number, refuted: number): SemanticSeedProjection {
  const base = seedProjection(nodes);
  return {
    ...base,
    refuted_disclosure: Array.from({ length: refuted }, (_, i) => ({
      node_ref: { sheet: "S", column_index: 1, row_start: 1, row_end: 20 },
      row: i + 3,
      character_before: "x",
      character_after: "y",
    })),
    refuted_disclosure_total: refuted,
  };
}

describe("renderSemanticMapProjection (W4 shared renderer, issue-012 budget contract)", () => {
  it("renders bounded nodes with AUTHORITATIVE totals and no truncation under a generous budget", () => {
    const r = renderSemanticMapProjection(seedProjection(3), 10_000, true) as Record<string, unknown>;
    expect(r.authority).toBe("non_authoritative");
    expect((r.nodes as unknown[]).length).toBe(3);
    expect(r.nodes_total).toBe(3);
    expect(r.refuted_disclosure_total).toBe(1);
    expect(r.unanchored_unverified_total).toBe(2);
    expect(r.render_truncated).toBe(false);
    expect(r.note).toBe(SEMANTIC_MAP_PROMPT_NOTE); // (B) inline note = the SHARED caveat
  });

  it("includeNote=false (seed surface): no inline note — the caveat is hoisted ONCE into the seed system prompt", () => {
    const r = renderSemanticMapProjection(seedProjection(2), 10_000, false) as Record<string, unknown>;
    expect("note" in r).toBe(false);
    expect((r.nodes as unknown[]).length).toBe(2);
  });

  it("budget truncation is a deterministic TAIL drop with an explicit flag — totals stay authoritative", () => {
    const r = renderSemanticMapProjection(seedProjection(5), 1_000, false) as Record<string, unknown>;
    expect((r.nodes as unknown[]).length).toBeGreaterThanOrEqual(1);
    expect((r.nodes as unknown[]).length).toBeLessThan(5);
    expect(r.nodes_total).toBe(5); // never a silent drop
    expect(r.render_truncated).toBe(true);
    const first = (r.nodes as { region: string }[])[0];
    expect(first?.region).toBe("S#0:1-10"); // canonical head retained
  });

  it("EXACT budget contract (codex W4-002 ≡ onto issue-001/002/004/005): the WHOLE returned envelope's actual prompt serialization never exceeds the budget", () => {
    for (const budget of [500, 900, 1_500, 4_000]) {
      const r = renderSemanticMapProjection(projectionWithRefuted(8, 5), budget, false);
      expect(JSON.stringify(r, null, 2).length).toBeLessThanOrEqual(budget);
    }
    const withNote = renderSemanticMapProjection(projectionWithRefuted(8, 5), 1_500, true);
    expect(JSON.stringify(withNote, null, 2).length).toBeLessThanOrEqual(1_500);
  });

  it("W4-004: refuted disclosure ROWS are prompt-visible (design §4 honesty), nodes admit FIRST", () => {
    const p = projectionWithRefuted(2, 3);
    const full = renderSemanticMapProjection(p, 100_000, false) as Record<string, unknown>;
    expect((full.refuted_disclosure as unknown[]).length).toBe(3);
    expect((full.refuted_disclosure as { row: number }[])[0]?.row).toBe(3);
    // one char under the full render: the deterministic drop is the LAST refuted row, never a node
    const fullLen = JSON.stringify(full, null, 2).length;
    const r = renderSemanticMapProjection(p, fullLen - 1, false) as Record<string, unknown>;
    expect((r.nodes as unknown[]).length).toBe(2); // nodes-first priority intact
    expect((r.refuted_disclosure as unknown[]).length).toBe(2);
    expect(r.refuted_disclosure_total).toBe(3); // total stays authoritative
    expect(r.render_truncated).toBe(true);
  });

  it("fail-loud budget (issue-012 NC): NaN/zero budget throws; a budget too small for the empty envelope throws instead of silently overshooting", () => {
    expect(() => renderSemanticMapProjection(seedProjection(1), Number.NaN, true)).toThrow(/charBudget/);
    expect(() => renderSemanticMapProjection(seedProjection(1), 0, true)).toThrow(/charBudget/);
    expect(() => renderSemanticMapProjection(seedProjection(1), 300, true)).toThrow(/cannot fit/);
  });

  it("CG-1: BOTH notes are catalog-backed; the seed note COMPOSES the shared caveat (editing either rotates the sha)", () => {
    expect(RECONSTRUCT_AUTHORING_PROMPT_CONTRACT.ontology_seed_semantic_map_note).toBe(SEMANTIC_MAP_SEED_PROMPT_NOTE);
    expect(RECONSTRUCT_AUTHORING_PROMPT_CONTRACT.observation_semantic_map_note).toBe(SEMANTIC_MAP_PROMPT_NOTE);
    expect(SEMANTIC_MAP_SEED_PROMPT_NOTE.endsWith(SEMANTIC_MAP_PROMPT_NOTE)).toBe(true);
    expect(SEMANTIC_MAP_SEED_PROMPT_NOTE).toContain("userPayload.semantic_map");
  });
});

describe("W4 §4(B) — observation prompt replace (observationPromptPayload)", () => {
  const oneObservation = () =>
    ({
      observations: [
        {
          observation_id: "obs-1",
          target_material_kind: "spreadsheet",
          source_ref: "/x/book.xlsx",
          location: "/x/book.xlsx",
          summary: "spreadsheet",
          structural_data: { basename: "book.xlsx" },
        },
      ],
      skipped_refs: [],
    }) as unknown as Parameters<typeof observationPromptPayload>[0];

  it("map-present: the hierarchical render REPLACES flat labels and PRESERVES not_examined_capped (X4)", () => {
    const payload = observationPromptPayload(oneObservation(), {
      provisionalLabelsByObservation: new Map([["obs-1", ["col0: flat label"]]]),
      cappedColumnsByObservation: new Map([["obs-1", ["col7 (status)"]]]),
      semanticMapByObservation: new Map([["obs-1", seedProjection(2)]]),
    }) as Array<Record<string, any>>;
    const pl = payload[0]!.provisional_labels;
    expect(pl.nodes).toHaveLength(2); // hierarchical render present
    expect(pl.labels).toBeUndefined(); // flat labels REPLACED (D-REL)
    expect(pl.not_examined_capped).toEqual(["col7 (status)"]); // X4 preserved
    expect(pl.not_examined_capped_total).toBe(1);
    expect(pl.note).toBe(SEMANTIC_MAP_PROMPT_NOTE); // inline caveat — (B)'s only note site
  });

  it("map-absent: byte-identical flat behavior (the new gate is bypassed entirely)", () => {
    const withOpt = observationPromptPayload(oneObservation(), {
      provisionalLabelsByObservation: new Map([["obs-1", ["col0: flat label"]]]),
      semanticMapByObservation: new Map([["other-obs", seedProjection(1)]]),
    }) as Array<Record<string, unknown>>;
    const without = observationPromptPayload(oneObservation(), {
      provisionalLabelsByObservation: new Map([["obs-1", ["col0: flat label"]]]),
    }) as Array<Record<string, unknown>>;
    expect(JSON.stringify(withOpt)).toBe(JSON.stringify(without));
  });

  it("W4-005 reset semantics: an EMPTY map (the unconditional per-run set) behaves byte-identically to never-set", () => {
    const emptyMap = observationPromptPayload(oneObservation(), {
      provisionalLabelsByObservation: new Map([["obs-1", ["col0: flat label"]]]),
      semanticMapByObservation: new Map(),
    }) as Array<Record<string, unknown>>;
    const neverSet = observationPromptPayload(oneObservation(), {
      provisionalLabelsByObservation: new Map([["obs-1", ["col0: flat label"]]]),
    }) as Array<Record<string, unknown>>;
    expect(JSON.stringify(emptyMap)).toBe(JSON.stringify(neverSet));
  });
});


// ── 설계 B: dispatch limit/transport circuit breaker (F-B1/F-B2/F-B3) ────────────────────────────

const BREAKER: DispatchBreakerPolicy = {
  enabled: true,
  systemic_threshold: 3,
  per_call_max_attempts: 3,
  backoff_initial_ms: 1,
  backoff_cap_ms: 4,
};

/** Per-observation column index selects the author script; columnIndex null
 *  builds a structural-skip observation (no workbook_inventory). */
function breakerObservations(
  specs: { id: string; columnIndex: number | null }[],
): Parameters<typeof runSemanticMapStage>[0]["sourceObservations"] {
  const artifact = observationsArtifact(
    specs.map((spec) => ({
      observation_id: spec.id,
      columns: [richColumn(spec.columnIndex ?? 0)],
    })),
  ) as unknown as { observations: Array<{ observation_id: string; structural_data: Record<string, unknown> }> };
  for (const spec of specs) {
    if (spec.columnIndex === null) {
      const observation = artifact.observations.find((o) => o.observation_id === spec.id)!;
      observation.structural_data = {};
    }
  }
  return artifact as unknown as Parameters<typeof runSemanticMapStage>[0]["sourceObservations"];
}

/** Author whose synthesize throws `failureMessage` for columns in `failColumns`
 *  (dead-limit / poison scripting) and succeeds elsewhere. */
function scriptedFailureAuthor(opts: {
  failColumns: number[];
  failureMessage: string;
  /** When set, synthesize emits one unanchored boundary and verify throws this. */
  verifyFailureMessage?: string;
}): { author: ReconstructDirectiveAuthor; counters: { synthesize: number; verify: number } } {
  const counters = { synthesize: 0, verify: 0 };
  const author = {
    async synthesizeSemanticMapNode(input: SemanticSynthesisInput): Promise<SemanticSynthesisOutput> {
      counters.synthesize += 1;
      if (opts.failColumns.includes(input.node_ref.column_index)) {
        throw new Error(opts.failureMessage);
      }
      return {
        semantic_summary: `ok ${input.node_ref.sheet}#${input.node_ref.column_index}:${input.node_ref.row_start}-${input.node_ref.row_end}`,
        boundaries: opts.verifyFailureMessage
          ? [{ row: input.node_ref.row_start, character_before: "prev", character_after: "next" }]
          : [],
      };
    },
    async verifySemanticMapBoundary(): Promise<SemanticBoundaryVerification> {
      counters.verify += 1;
      if (opts.verifyFailureMessage) throw new Error(opts.verifyFailureMessage);
      return "adversarial_confirmed";
    },
  } as unknown as ReconstructDirectiveAuthor;
  return { author, counters };
}

async function readIncompleteArtifact(sessionRoot: string): Promise<DispatchIncompleteArtifact> {
  return parseYaml(
    await fs.readFile(dispatchIncompleteArtifactPath(sessionRoot), "utf8"),
  ) as DispatchIncompleteArtifact;
}

function stageArgs(
  sourceObservations: Parameters<typeof runSemanticMapStage>[0]["sourceObservations"],
  author: ReconstructDirectiveAuthor,
  sessionRoot: string,
  dispatchBreaker?: DispatchBreakerPolicy,
): Parameters<typeof runSemanticMapStage>[0] {
  return {
    sourceObservations,
    directiveAuthor: author,
    sessionRoot,
    config: CONFIG,
    preImageBase: PRE_IMAGE_BASE,
    verifyModelIdentity: "mock/none",
    ...(dispatchBreaker ? { dispatchBreaker } : {}),
  };
}

describe("semantic-map dispatch breaker (설계 B)", () => {
  it("F-B1: dead limit trips after backoff exhaustion at N=3, persists the incomplete list, bounded dispatch count", async () => {
    const sessionRoot = await tempRoot();
    const { author, counters } = scriptedFailureAuthor({
      failColumns: [0],
      failureMessage: "status=429 too many requests",
    });
    const observations = breakerObservations([
      { id: "obs-1", columnIndex: 0 },
      { id: "obs-2", columnIndex: 0 },
      { id: "obs-3", columnIndex: 0 },
      { id: "obs-4", columnIndex: 0 },
    ]);

    let tripError: unknown;
    try {
      await runSemanticMapStage(stageArgs(observations, author, sessionRoot, BREAKER));
    } catch (error) {
      tripError = error;
    }
    expect(tripError).toBeInstanceOf(DispatchBreakerTrippedError);
    // 규칙 4 공지: 미완료 목록 경로가 사용자에게 도달하는 오류 메시지에 실린다.
    expect((tripError as Error).message).toContain("dispatch-incomplete.yaml");

    // 재시도 폭풍 부재를 수치로: 총 디스패치 == N items x per-item cap (성공분 0).
    expect(counters.synthesize).toBe(
      BREAKER.systemic_threshold * BREAKER.per_call_max_attempts,
    );

    const artifact = await readIncompleteArtifact(sessionRoot);
    expect(artifact.breaker).toMatchObject({
      tripped: true,
      failure_class: "rate_limit",
      consecutive_item_count: 3,
      threshold: 3,
    });
    expect(artifact.completed_item_ids).toEqual([]);
    // 계통 장애 피해 아이템은 dead-letter가 아니라 회복 재디스패치 대상이다.
    expect(artifact.dead_letter).toEqual([]);
    expect(artifact.incomplete_item_ids).toEqual(["obs-1", "obs-2", "obs-3", "obs-4"]);

    // 트립도 stage-ran: spend census가 남는다 (breaker 재시도 spend 병기).
    const census = parseYaml(
      await fs.readFile(path.join(sessionRoot, "comprehension", "semantic-map-census.yaml"), "utf8"),
    ) as {
      breaker_retry_synthesize_calls?: number;
      observations_total: number;
      observations_map_present: number;
      observations_map_absent: number;
      by_observation: Array<{ observation_id: string }>;
    };
    expect(census.breaker_retry_synthesize_calls).toBe(
      BREAKER.systemic_threshold * (BREAKER.per_call_max_attempts - 1),
    );
    // 트립 census도 완전 파티션을 유지한다: 트립 관찰의 행까지 기록되고
    // 총계가 행과 대조된다 (미도달 obs-4는 total에도 행에도 없음).
    expect(census.observations_total).toBe(3);
    expect(census.by_observation.map((o) => o.observation_id)).toEqual([
      "obs-1",
      "obs-2",
      "obs-3",
    ]);
    expect(
      census.observations_map_present + census.observations_map_absent,
    ).toBe(census.observations_total);
  });

  it("regression: a structural skip between systemic failures neither resets the streak nor poisons victims", async () => {
    const sessionRoot = await tempRoot();
    const { author } = scriptedFailureAuthor({
      failColumns: [5],
      failureMessage: "status=429 too many requests",
    });
    // 순서: 실패(5) → skip(no inventory) → 실패 → 실패 → 임계 3에서 트립.
    const observations = breakerObservations([
      { id: "obs-1", columnIndex: 5 },
      { id: "obs-2", columnIndex: null },
      { id: "obs-3", columnIndex: 5 },
      { id: "obs-4", columnIndex: 5 },
      { id: "obs-5", columnIndex: 5 },
    ]);

    await expect(
      runSemanticMapStage(stageArgs(observations, author, sessionRoot, BREAKER)),
    ).rejects.toBeInstanceOf(DispatchBreakerTrippedError);

    const artifact = await readIncompleteArtifact(sessionRoot);
    expect(artifact.breaker.tripped).toBe(true);
    // skip은 완료(회복 불요)로만 기록되고, outage 피해 관찰은 dead-letter가
    // 아니라 미완료 집합에 남는다.
    expect(artifact.completed_item_ids).toEqual(["obs-2"]);
    expect(artifact.dead_letter).toEqual([]);
    expect(artifact.incomplete_item_ids).toEqual(["obs-1", "obs-3", "obs-4", "obs-5"]);
  });

  it("verify-path systemic failure: retries are spend-counted and the observation lands in the recovery set", async () => {
    const sessionRoot = await tempRoot();
    const { author, counters } = scriptedFailureAuthor({
      failColumns: [],
      failureMessage: "unused",
      verifyFailureMessage: "status=429 too many requests",
    });
    const observations = breakerObservations([{ id: "obs-1", columnIndex: 0 }]);

    const result = await runSemanticMapStage(
      stageArgs(observations, author, sessionRoot, BREAKER),
    );

    // 임계(3) 미달: 트립 없이 완주하되, verify 재시도 spend가 census에 남는다.
    expect(result.census?.breaker_retry_verify_calls).toBe(
      BREAKER.per_call_max_attempts - 1,
    );
    expect(counters.verify).toBe(BREAKER.per_call_max_attempts);
    const artifact = await readIncompleteArtifact(sessionRoot);
    expect(artifact.breaker.tripped).toBe(false);
    expect(artifact.dead_letter).toEqual([]);
    expect(artifact.incomplete_item_ids).toEqual(["obs-1"]);
  });

  it("F-B1 OFF twin: the disabled path preserves today's doom-to-flat behavior (no breaker artifacts, no backoff retries)", async () => {
    const sessionRoot = await tempRoot();
    const { author, counters } = scriptedFailureAuthor({
      failColumns: [0],
      failureMessage: "status=429 too many requests",
    });
    const observations = breakerObservations([
      { id: "obs-1", columnIndex: 0 },
      { id: "obs-2", columnIndex: 0 },
      { id: "obs-3", columnIndex: 0 },
      { id: "obs-4", columnIndex: 0 },
    ]);

    const result = await runSemanticMapStage(stageArgs(observations, author, sessionRoot));

    // 현행 동작: 관찰별 doom-to-flat, run은 계속. backoff 재시도 없음(관찰당 1회).
    expect(counters.synthesize).toBe(4);
    expect(result.census?.observations_map_absent).toBe(4);
    expect(result.census?.breaker_retry_synthesize_calls).toBeUndefined();
    await expect(fs.access(dispatchIncompleteArtifactPath(sessionRoot))).rejects.toThrow();
  });

  it("F-B2: a poison item dead-letters alone and the batch completes", async () => {
    const sessionRoot = await tempRoot();
    // obs-2만 item-local 실패(컬럼 5), 나머지는 정상.
    const { author } = scriptedFailureAuthor({
      failColumns: [5],
      failureMessage: "author returned invalid JSON and repair failed",
    });
    const observations = breakerObservations([
      { id: "obs-1", columnIndex: 0 },
      { id: "obs-2", columnIndex: 5 },
      { id: "obs-3", columnIndex: 0 },
    ]);

    const result = await runSemanticMapStage(
      stageArgs(observations, author, sessionRoot, BREAKER),
    );

    expect(result.census?.observations_map_present).toBe(2);
    const artifact = await readIncompleteArtifact(sessionRoot);
    expect(artifact.breaker.tripped).toBe(false);
    expect(artifact.dead_letter.map((entry) => entry.item_id)).toEqual(["obs-2"]);
    expect(artifact.dead_letter[0]?.failure_class).toBeNull();
    expect(artifact.completed_item_ids).toEqual(["obs-1", "obs-3"]);
    expect(artifact.incomplete_item_ids).toEqual([]);
  });

  it("F-B2 systemic-poison variant: a lone rate-limited item is poison once a later item succeeds", async () => {
    const sessionRoot = await tempRoot();
    const { author } = scriptedFailureAuthor({
      failColumns: [5],
      failureMessage: "status=429 session limit",
    });
    const observations = breakerObservations([
      { id: "obs-1", columnIndex: 5 },
      { id: "obs-2", columnIndex: 0 },
      { id: "obs-3", columnIndex: 0 },
    ]);

    const result = await runSemanticMapStage(
      stageArgs(observations, author, sessionRoot, BREAKER),
    );

    expect(result.census?.observations_map_present).toBe(2);
    const artifact = await readIncompleteArtifact(sessionRoot);
    expect(artifact.breaker.tripped).toBe(false);
    expect(artifact.dead_letter.map((entry) => entry.item_id)).toEqual(["obs-1"]);
    expect(artifact.dead_letter[0]?.failure_class).toBe("rate_limit");
    expect(artifact.incomplete_item_ids).toEqual([]);
  });

  it("F-B3: the recovery re-dispatch set equals the persisted incomplete set exactly", async () => {
    const sessionRoot = await tempRoot();
    // Run 1: obs-1 성공(컬럼 0), obs-2..5는 dead limit(컬럼 5) → obs-2,3,4에서 트립, obs-5 미디스패치.
    const dead = scriptedFailureAuthor({
      failColumns: [5],
      failureMessage: "status=429 too many requests",
    });
    const run1Observations = breakerObservations([
      { id: "obs-1", columnIndex: 0 },
      { id: "obs-2", columnIndex: 5 },
      { id: "obs-3", columnIndex: 5 },
      { id: "obs-4", columnIndex: 5 },
      { id: "obs-5", columnIndex: 5 },
    ]);
    await expect(
      runSemanticMapStage(stageArgs(run1Observations, dead.author, sessionRoot, BREAKER)),
    ).rejects.toBeInstanceOf(DispatchBreakerTrippedError);

    const tripped = await readIncompleteArtifact(sessionRoot);
    expect(tripped.completed_item_ids).toEqual(["obs-1"]);
    expect(tripped.incomplete_item_ids).toEqual(["obs-2", "obs-3", "obs-4", "obs-5"]);

    // Run 2 (회복): 미완료 집합만 재디스패치 — provider 정상.
    const incomplete = new Set(tripped.incomplete_item_ids);
    const healthy = scriptedFailureAuthor({ failColumns: [], failureMessage: "unused" });
    const run2Observations = breakerObservations(
      [
        { id: "obs-2", columnIndex: 5 },
        { id: "obs-3", columnIndex: 5 },
        { id: "obs-4", columnIndex: 5 },
        { id: "obs-5", columnIndex: 5 },
      ].filter((spec) => incomplete.has(spec.id)),
    );
    const recovery = await runSemanticMapStage(
      stageArgs(run2Observations, healthy.author, sessionRoot, BREAKER),
    );

    // 집합 동등성: 회복 run이 디스패치한 관찰 == 미완료 집합.
    expect(
      (recovery.census?.by_observation ?? []).map((o) => o.observation_id).sort(),
    ).toEqual([...incomplete].sort());
    const recovered = await readIncompleteArtifact(sessionRoot);
    expect(recovered.breaker.tripped).toBe(false);
    expect(recovered.completed_item_ids.sort()).toEqual([...incomplete].sort());
    expect(recovered.incomplete_item_ids).toEqual([]);
    expect(recovered.dead_letter).toEqual([]);
  });
});
