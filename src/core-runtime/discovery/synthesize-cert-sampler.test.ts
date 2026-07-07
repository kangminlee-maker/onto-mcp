/**
 * S1 sampler tests (design 20260706-b4-r8-harness-design v3 §3/§4/§15.1):
 * determinism (same seed → same manifest, input-order-blind), whitespace-free
 * globally-unique input_ids, the pre-spend floor gate (positive AND negative
 * contrast), selected-vs-nearest provenance, the two-layer identity split
 * (deterministic_facts_sha256 child-independent; input_sha256 child-sensitive),
 * and candidate collection over a REAL reduce pipeline (no observer I/O).
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  reduceColumnLeavesWithTrace,
  reduceNodeKey,
  type ComprehensionReduceNode,
} from "../reconstruct/comprehension-reduce.js";
import {
  classifyFrontier,
  type SemanticSynthesisInput,
} from "../reconstruct/comprehension-semantic-map.js";
import {
  collectSynthesizeCertCandidates,
  sampleStratifiedManifest,
  synthesizeCertDeterministicFactsSha256,
  synthesizeCertInputSha256,
  SYNTHESIZE_CERT_SAMPLER_VERSION,
  type SynthesizeCertCandidate,
  type SynthesizeCertDeterministicFacts,
  type SynthesizeCertSamplerFixtureInput,
} from "./synthesize-cert-sampler.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

const FIXTURE_A = sha("fixture-A");
const FIXTURE_B = sha("fixture-B");

// ── real mini-pipeline (6 leaves, fanin 2, budget 2 → 5 non-subsumed nodes) ───

function leaf(rowStart: number, rowEnd: number, shape: string): ComprehensionReduceNode {
  return {
    region: { sheet: "S", column_index: 3, row_start: rowStart, row_end: rowEnd },
    format_clusters: [shape],
    boundaries: [],
    edge_first_shape: shape,
    edge_last_shape: shape,
    distinct_is_lower_bound: false,
    boundaries_are_lower_bound: false,
    segments_capped: false,
    limiting_witness: null,
  };
}

/** L1..L3 "int" (rows 1-30), L4..L6 "text" (rows 31-60). fanin 2 →
 * M12/M34/M56 → M1234 → root; the int→text junction lands inside M34, so the
 * value_shape seam originates there and folds up into M1234 and the root. */
function buildRealColumn() {
  const leaves = [
    leaf(1, 10, "int"),
    leaf(11, 20, "int"),
    leaf(21, 30, "int"),
    leaf(31, 40, "text"),
    leaf(41, 50, "text"),
    leaf(51, 60, "text"),
  ];
  const { trace, nodesByKey } = reduceColumnLeavesWithTrace(leaves, 2);
  const modes = classifyFrontier(trace, 2);
  return { trace, nodesByKey, modes };
}

// ── hand-built candidate factory (pool-size control for sampling tests) ───────

function makeCandidate(args: {
  sheet?: string;
  sheetIndex?: number;
  col?: number;
  rowStart: number;
  rowEnd: number;
  merge: boolean;
  seam: boolean;
  leafCount?: number;
  cluster?: string;
}): SynthesizeCertCandidate {
  const nodeRef = {
    sheet: args.sheet ?? "S",
    column_index: args.col ?? 1,
    row_start: args.rowStart,
    row_end: args.rowEnd,
  };
  const facts: SynthesizeCertDeterministicFacts = {
    node_ref: nodeRef,
    format_clusters: [args.cluster ?? "int"],
    value_shape_seams: args.seam
      ? [{ row: args.rowStart + 1, prev_shape: "int", new_shape: "text" }]
      : [],
  };
  return {
    node_key: reduceNodeKey(nodeRef),
    node_ref: nodeRef,
    sheet_index: args.sheetIndex ?? 0,
    stratum: { seam: args.seam, merge: args.merge },
    subtree_leaf_count: args.leafCount ?? 1,
    deterministic_facts: facts,
    deterministic_facts_sha256: synthesizeCertDeterministicFactsSha256(facts),
  };
}

/** n candidates of one stratum on consecutive row windows. */
function pool(
  n: number,
  args: { merge: boolean; seam: boolean; col?: number; leafCounts?: number[] },
): SynthesizeCertCandidate[] {
  return Array.from({ length: n }, (_, i) =>
    makeCandidate({
      col: args.col ?? 1,
      rowStart: i * 10 + 1,
      rowEnd: i * 10 + 10,
      merge: args.merge,
      seam: args.seam,
      leafCount: args.leafCounts?.[i] ?? (args.merge ? 2 : 1),
    }),
  );
}

/** Fixture possessing all four strata with `n` inputs each (columns 1..4). */
function fullFixture(fixtureId: string, n: number): SynthesizeCertSamplerFixtureInput {
  return {
    fixture_id: fixtureId,
    candidates: [
      ...pool(n, { merge: false, seam: false, col: 1 }),
      ...pool(n, { merge: false, seam: true, col: 2 }),
      ...pool(n, { merge: true, seam: false, col: 3 }),
      ...pool(n, { merge: true, seam: true, col: 4 }),
    ],
  };
}

// ── two-layer identity (§4) ───────────────────────────────────────────────────

describe("two-layer input identity", () => {
  const facts: SynthesizeCertDeterministicFacts = {
    node_ref: { sheet: "S", column_index: 1, row_start: 1, row_end: 20 },
    format_clusters: ["date", "int"],
    value_shape_seams: [{ row: 10, prev_shape: "int", new_shape: "date" }],
  };
  const packetWith = (children: { key: string; summary: string }[]): SemanticSynthesisInput => ({
    node_ref: facts.node_ref,
    format_clusters: facts.format_clusters,
    value_shape_seams: facts.value_shape_seams,
    child_summaries: children,
  });

  it("deterministic_facts_sha256 is child-independent; input_sha256 is child-sensitive", () => {
    const factsSha = synthesizeCertDeterministicFactsSha256(facts);
    const empty = synthesizeCertInputSha256(packetWith([]));
    const withChildren = synthesizeCertInputSha256(
      packetWith([{ key: "S#1:1-10", summary: "ints" }]),
    );
    const otherChildren = synthesizeCertInputSha256(
      packetWith([{ key: "S#1:1-10", summary: "DIFFERENT prose" }]),
    );
    expect(withChildren).not.toBe(empty);
    expect(otherChildren).not.toBe(withChildren);
    // The facts layer never moves — same value no matter what children exist.
    expect(synthesizeCertDeterministicFactsSha256(facts)).toBe(factsSha);
  });

  it("is permutation-inert on format_clusters but content-sensitive (S3 relabel lever visibility)", () => {
    const permuted = synthesizeCertDeterministicFactsSha256({
      ...facts,
      format_clusters: ["int", "date"],
    });
    const relabeled = synthesizeCertDeterministicFactsSha256({
      ...facts,
      format_clusters: ["date", "text"],
    });
    expect(permuted).toBe(synthesizeCertDeterministicFactsSha256(facts));
    expect(relabeled).not.toBe(synthesizeCertDeterministicFactsSha256(facts));
  });

  it("seam row offset changes the hash (S3 boundary lever visibility)", () => {
    const offset = synthesizeCertDeterministicFactsSha256({
      ...facts,
      value_shape_seams: [{ row: 11, prev_shape: "int", new_shape: "date" }],
    });
    expect(offset).not.toBe(synthesizeCertDeterministicFactsSha256(facts));
  });

  it("rejects a smuggled extra field instead of hashing around it", () => {
    const smuggled = {
      ...packetWith([]),
      raw_cells: ["1,234원"],
    } as unknown as SemanticSynthesisInput;
    expect(() => synthesizeCertInputSha256(smuggled)).toThrow(/unexpected field/);
  });
});

// ── candidate collection over the real pipeline ───────────────────────────────

describe("collectSynthesizeCertCandidates", () => {
  it("enumerates exactly the non-subsumed nodes with correct stratum tags", () => {
    const { trace, nodesByKey, modes } = buildRealColumn();
    const candidates = collectSynthesizeCertCandidates({ trace, nodesByKey, modes, sheetIndex: 0 });
    const nonSubsumed = [...modes.values()].filter((m) => m !== "subsumed").length;
    expect(candidates.length).toBe(nonSubsumed);
    expect(candidates.length).toBe(5);
    const byKey = new Map(candidates.map((c) => [c.node_key, c]));
    // root + M1234 accumulate and carry the folded seam → seam×merge.
    expect(byKey.get("S#3:1-60")!.stratum).toEqual({ seam: true, merge: true });
    expect(byKey.get("S#3:1-40")!.stratum).toEqual({ seam: true, merge: true });
    // M34 holds the int→text junction → seam×leaf; M12/M56 are uniform.
    expect(byKey.get("S#3:21-40")!.stratum).toEqual({ seam: true, merge: false });
    expect(byKey.get("S#3:1-20")!.stratum).toEqual({ seam: false, merge: false });
    expect(byKey.get("S#3:41-60")!.stratum).toEqual({ seam: false, merge: false });
    expect(byKey.get("S#3:1-60")!.subtree_leaf_count).toBe(6);
    expect(byKey.get("S#3:1-40")!.subtree_leaf_count).toBe(4);
    // Facts carry ONLY the three deterministic fields (no child placeholder leak).
    for (const c of candidates) {
      expect(Object.keys(c.deterministic_facts).sort()).toEqual([
        "format_clusters",
        "node_ref",
        "value_shape_seams",
      ]);
      expect(synthesizeCertDeterministicFactsSha256(c.deterministic_facts)).toBe(
        c.deterministic_facts_sha256,
      );
    }
    // Deterministic output order (stable key).
    expect(candidates.map((c) => c.node_key)).toEqual(
      [...candidates.map((c) => c.node_key)].sort(),
    );
  });

  it("fails closed when modes do not cover the trace", () => {
    const { trace, nodesByKey } = buildRealColumn();
    expect(() =>
      collectSynthesizeCertCandidates({ trace, nodesByKey, modes: new Map(), sheetIndex: 0 }),
    ).toThrow(/no frontier mode/);
  });
});

// ── stratified sampling (§3) ──────────────────────────────────────────────────

describe("sampleStratifiedManifest", () => {
  it("is deterministic and blind to candidate input order", () => {
    const fixtures = [fullFixture(FIXTURE_A, 7), fullFixture(FIXTURE_B, 6)];
    const shuffled = fixtures.map((fx) => ({
      ...fx,
      candidates: [...fx.candidates].reverse(),
    }));
    const a = sampleStratifiedManifest(fixtures);
    const b = sampleStratifiedManifest(fixtures);
    const c = sampleStratifiedManifest(shuffled);
    expect(a.manifest.length).toBeGreaterThan(0); // non-vacuous subject set
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("over-provisions K per possessed stratum and passes the pre-spend floor gate on a healthy universe", () => {
    const result = sampleStratifiedManifest([fullFixture(FIXTURE_A, 7), fullFixture(FIXTURE_B, 6)]);
    // 2 fixtures × 4 strata × K(5) — the contrast control: zero floor violations.
    expect(result.manifest.length).toBe(40);
    expect(result.floor_violations).toEqual([]);
    expect(result.per_stratum_k).toBe(5);
    expect(result.declared_reps).toBe(3);
    for (const p of result.provenance) {
      expect(p.selected_count).toBe(5);
      expect(p.seed).toBe(
        sha(
          `${p.fixture_id}|seam=${p.stratum.seam}|merge=${p.stratum.merge}|${SYNTHESIZE_CERT_SAMPLER_VERSION}`,
        ),
      );
    }
  });

  it("emits whitespace-free, globally unique input_ids in the designed shape", () => {
    const result = sampleStratifiedManifest([fullFixture(FIXTURE_A, 7), fullFixture(FIXTURE_B, 6)]);
    const ids = result.manifest.map((e) => e.input_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^\S+$/);
      expect(id).toMatch(/^[0-9a-f]{8}-s\d+-c\d+-r\d+_\d+$/);
    }
    expect(ids.some((id) => id.startsWith(FIXTURE_A.slice(0, 8)))).toBe(true);
    expect(ids.some((id) => id.startsWith(FIXTURE_B.slice(0, 8)))).toBe(true);
  });

  it("bounds merge cost: picks the K smallest subtrees and discloses the ordering", () => {
    const leafCounts = [9, 3, 14, 2, 11, 5, 8, 4]; // distinct → selection is exactly the 5 smallest
    const fx: SynthesizeCertSamplerFixtureInput = {
      fixture_id: FIXTURE_A,
      candidates: pool(8, { merge: true, seam: true, leafCounts }),
    };
    const result = sampleStratifiedManifest([fx]);
    const selected = result.manifest.map((e) => e.subtree_leaf_count).sort((x, y) => x - y);
    expect(selected).toEqual([2, 3, 4, 5, 8]);
    expect(result.provenance[0]!.ordering).toBe("subtree_leaf_count_asc");
    expect(result.provenance[0]!.stride).toBe(null);
    // Rank 0 is the cheapest subtree (cost order IS the selection order).
    expect(result.manifest.find((e) => e.sampling_rank === 0)!.subtree_leaf_count).toBe(2);
  });

  it("stride-samples leaf strata across the pool instead of clustering at its head", () => {
    const fx: SynthesizeCertSamplerFixtureInput = {
      fixture_id: FIXTURE_A,
      candidates: pool(20, { merge: false, seam: false }),
    };
    const result = sampleStratifiedManifest([fx]);
    const prov = result.provenance[0]!;
    expect(prov.ordering).toBe("stable_key_stride");
    expect(prov.stride).toBe(4); // floor(20/5)
    expect(result.manifest.length).toBe(5);
    // Picks are spread: in stable-key order they sit a constant stride apart.
    const sortedPool = [...fx.candidates].sort((a, b) => (a.node_key < b.node_key ? -1 : 1));
    const pickedIndices = result.manifest
      .sort((a, b) => a.sampling_rank - b.sampling_rank)
      .map((e) => sortedPool.findIndex((c) => c.node_key === e.node_key));
    for (let i = 1; i < pickedIndices.length; i += 1) {
      expect(pickedIndices[i]! - pickedIndices[i - 1]!).toBe(4);
    }
  });

  it("records selected-vs-nearest-unselected provenance (null only when the pool is exhausted)", () => {
    const big = sampleStratifiedManifest([
      { fixture_id: FIXTURE_A, candidates: pool(9, { merge: false, seam: true }) },
    ]);
    const selectedIds = new Set(big.manifest.map((e) => e.input_id));
    for (const entry of big.manifest) {
      expect(entry.nearest_unselected_id).not.toBeNull();
      expect(selectedIds.has(entry.nearest_unselected_id!)).toBe(false); // really unselected
    }
    const exhausted = sampleStratifiedManifest([
      { fixture_id: FIXTURE_A, candidates: pool(4, { merge: false, seam: true }) },
    ]);
    expect(exhausted.manifest.length).toBe(4);
    for (const entry of exhausted.manifest) {
      expect(entry.nearest_unselected_id).toBeNull();
    }
  });

  it("pre-spend floor gate rejects an under-provisioned universe (negative contrast)", () => {
    // Single fixture → fixture_floor.
    const single = sampleStratifiedManifest([fullFixture(FIXTURE_A, 7)]);
    expect(single.floor_violations.some((v) => v.code === "fixture_floor")).toBe(true);
    // A possessed stratum with 1 input × 3 reps = 3 < 5 → stratum_coverage.
    const tiny = sampleStratifiedManifest([
      {
        fixture_id: FIXTURE_A,
        candidates: [
          ...pool(7, { merge: false, seam: false, col: 1 }),
          ...pool(1, { merge: true, seam: true, col: 4 }),
        ],
      },
      fullFixture(FIXTURE_B, 6),
    ]);
    expect(tiny.floor_violations.some((v) => v.code === "stratum_coverage")).toBe(true);
    // declaredReps below the contract floor.
    const lowReps = sampleStratifiedManifest(
      [fullFixture(FIXTURE_A, 7), fullFixture(FIXTURE_B, 6)],
      { declaredReps: 2 },
    );
    expect(lowReps.floor_violations.some((v) => v.code === "declared_reps_floor")).toBe(true);
  });

  it("predicts stratum_global_floor pre-spend when NO fixture can floor-meet a stratum", () => {
    // Neither fixture possesses seam×merge — the shipped possessed-strata lint
    // is blind to this, but the record validator would fail post-spend.
    const noSeamMerge = (id: string): SynthesizeCertSamplerFixtureInput => ({
      fixture_id: id,
      candidates: [
        ...pool(7, { merge: false, seam: false, col: 1 }),
        ...pool(7, { merge: false, seam: true, col: 2 }),
        ...pool(7, { merge: true, seam: false, col: 3 }),
      ],
    });
    const result = sampleStratifiedManifest([noSeamMerge(FIXTURE_A), noSeamMerge(FIXTURE_B)]);
    const global = result.floor_violations.filter((v) => v.code === "stratum_global_floor");
    expect(global.length).toBe(1);
    expect(global[0]!.message).toContain("seam=true|merge=true");
  });

  it("manifest identity sha is stable, and moves when the universe shrinks (scope-shrink detection)", () => {
    const fixtures = [fullFixture(FIXTURE_A, 7), fullFixture(FIXTURE_B, 6)];
    const full = sampleStratifiedManifest(fixtures);
    expect(sampleStratifiedManifest(fixtures).manifest_identity_sha256).toBe(
      full.manifest_identity_sha256,
    );
    const shrunk = sampleStratifiedManifest([
      { ...fixtures[0]!, candidates: fixtures[0]!.candidates.slice(0, 21) },
      fixtures[1]!,
    ]);
    expect(shrunk.manifest_identity_sha256).not.toBe(full.manifest_identity_sha256);
  });

  it("fails closed on lying or colliding candidates and invalid options", () => {
    const good = makeCandidate({ rowStart: 1, rowEnd: 10, merge: false, seam: false });
    const lyingKey = { ...good, node_key: "S#1:999-999" };
    expect(() =>
      sampleStratifiedManifest([{ fixture_id: FIXTURE_A, candidates: [lyingKey] }]),
    ).toThrow(/node_key/);
    const lyingSha = { ...good, deterministic_facts_sha256: sha("lie") };
    expect(() =>
      sampleStratifiedManifest([{ fixture_id: FIXTURE_A, candidates: [lyingSha] }]),
    ).toThrow(/does not recompute/);
    const lyingSeam = { ...good, stratum: { seam: true, merge: false } };
    expect(() =>
      sampleStratifiedManifest([{ fixture_id: FIXTURE_A, candidates: [lyingSeam] }]),
    ).toThrow(/seam flag/);
    expect(() =>
      sampleStratifiedManifest([{ fixture_id: FIXTURE_A, candidates: [good, { ...good }] }]),
    ).toThrow(/duplicate candidate/);
    // Same region under two sheet names/indices collapses to one input_id → collision.
    const sheetX = makeCandidate({ sheet: "X", sheetIndex: 1, rowStart: 1, rowEnd: 10, merge: false, seam: false });
    const sheetY = makeCandidate({ sheet: "Y", sheetIndex: 1, rowStart: 1, rowEnd: 10, merge: false, seam: false });
    expect(() =>
      sampleStratifiedManifest([{ fixture_id: FIXTURE_A, candidates: [sheetX, sheetY] }]),
    ).toThrow(/collision/);
    expect(() =>
      sampleStratifiedManifest([{ fixture_id: "not-a-sha", candidates: [good] }]),
    ).toThrow(/sha256 hex/);
    expect(() =>
      sampleStratifiedManifest(
        [{ fixture_id: FIXTURE_A, candidates: [good] }],
        { perStratumK: 0 },
      ),
    ).toThrow(/perStratumK/);
  });

  it("samples a real-pipeline fixture end to end (integration, no observer I/O)", () => {
    const { trace, nodesByKey, modes } = buildRealColumn();
    const candidates = collectSynthesizeCertCandidates({ trace, nodesByKey, modes, sheetIndex: 2 });
    const result = sampleStratifiedManifest([
      { fixture_id: FIXTURE_A, candidates },
      fullFixture(FIXTURE_B, 6),
    ]);
    expect(result.manifest.length).toBeGreaterThan(0);
    const fromPipeline = result.manifest.filter((e) => e.fixture_id === FIXTURE_A);
    // All 5 non-subsumed nodes selected (every pool ≤ K), ids carry sheetIndex 2.
    expect(fromPipeline.length).toBe(5);
    for (const entry of fromPipeline) {
      expect(entry.input_id).toMatch(new RegExp(`^${FIXTURE_A.slice(0, 8)}-s2-c3-r\\d+_\\d+$`));
    }
    // Tiny pools (root/M1234 = 2 merge inputs ≥/… seam×leaf = 1) → the gate
    // correctly predicts the bench cannot clear the decisive floors.
    expect(result.floor_violations.some((v) => v.code === "stratum_coverage")).toBe(true);
  });
});
