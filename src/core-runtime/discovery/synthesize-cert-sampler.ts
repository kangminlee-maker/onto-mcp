/**
 * S1 — deterministic stratified sampler for the B4 `synthesize-cert/v1` bench
 * (design 20260706-b4-r8-harness-design v3 §3/§4/§15.1).
 *
 * Everything here is pure and deterministic — the orchestrator script does the
 * I/O (observe → buildColumnLeaves → reduceColumnLeavesWithTrace →
 * classifyFrontier per column) and hands the per-fixture candidate universe in.
 * Two responsibilities live here because they must not drift apart:
 *
 *  1. TWO-LAYER INPUT IDENTITY (§4 · round-2 R2-IND-1):
 *     - `deterministic_facts_sha256` — hash of the node's LLM-independent facts
 *       (node_ref + sorted format_clusters + canonical value_shape_seams,
 *       child_summaries EXCLUDED). Computable BEFORE the reference child
 *       authoring spend, so sampling/scope/floor pre-checks run pre-spend
 *       (§3 sequencing).
 *     - `input_sha256` — hash of the FULL frozen SemanticSynthesisInput packet
 *       (child_summaries included). The same-input comparison key: every arm
 *       runs the identical frozen packet, so baseline/candidate rows share it.
 *     Both hashes canonicalize through ONE serializer, and both run the shipped
 *     `assertSynthesisInputBounded` source-safe envelope first, so a smuggled
 *     extra field can never be silently hash-invisible.
 *
 *  2. HONEST DETERMINISTIC SELECTION (§3, cherry-pick 금지): per
 *     (fixture × possessed stratum), over-provision K inputs with a seeded,
 *     content-blind rule — merge strata order by subtree leaf count ascending
 *     (a DISCLOSED cost bias; seed tie-break), leaf strata stride-sample the
 *     stable-key order — and record provenance (pool size, seed, stride, rank,
 *     selected-vs-nearest-unselected) for the R7 representativeness audit.
 *
 * The pre-spend floor gate is part of the sample result (not a separate call a
 * caller could forget): `floor_violations` re-uses the shipped
 * `synthesizeCertManifestFloorViolations` plus a pre-spend prediction of the
 * record validator's `stratum_global_floor`, so an under-provisioned manifest
 * is rejected before any paid call. Structural integrity failures (a candidate
 * whose key/hash lies, an input_id collision) THROW instead — those are
 * harness bugs, not sampling outcomes.
 */
import { createHash } from "node:crypto";
import {
  reduceNodeKey,
  type ComprehensionReduceNode,
  type ComprehensionReduceRegion,
  type ReduceTopologyTrace,
  type SemanticNodeKey,
} from "../reconstruct/comprehension-reduce.js";
import {
  assertReduceTopologyIsTree,
  assertSynthesisInputBounded,
  buildSynthesisInputForNode,
  computeSubtreeLeafCounts,
  type FrontierMode,
  type SemanticSynthesisInput,
} from "../reconstruct/comprehension-semantic-map.js";
import {
  synthesizeCertManifestFloorViolations,
  SYNTHESIZE_CERT_FLOORS,
  type SynthesizeCertStratum,
  type SynthesizeCertViolation,
} from "./synthesize-cert-record.js";

/** Folded into every stratum seed — editing the sampler's selection rule must
 * ship with a version bump so a re-run cannot silently claim the old picks. */
export const SYNTHESIZE_CERT_SAMPLER_VERSION = "synthesize-cert-sampler/v1";

/** §3 over-provisioning: at a pessimistic decisive rate of 0.4, K×reps(3)×0.4 =
 * 6 ≥ the per-stratum decisive floor (5), so a stratum survives real losses. */
export const SYNTHESIZE_CERT_DEFAULT_PER_STRATUM_K = 5;

const sha256Hex = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/** Same projection format as the record module's internal stratum key (kept a
 * one-line local; the record module's helper is private and that file is the
 * frozen evidence contract). */
const stratumKey = (s: SynthesizeCertStratum): string =>
  `seam=${s.seam}|merge=${s.merge}`;

const cmpStr = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

// ── two-layer input identity (§4) ─────────────────────────────────────────────

/** The LLM-independent slice of a SemanticSynthesisInput — what exists before
 * (and regardless of) reference child authoring. */
export interface SynthesizeCertDeterministicFacts {
  node_ref: ComprehensionReduceRegion;
  format_clusters: string[];
  value_shape_seams: { row: number; prev_shape: string; new_shape: string }[];
}

/** Fixed-key-order canonical shape shared by BOTH identity hashes: sorted
 * clusters, canonically-sorted re-keyed seams, re-keyed node_ref. Child
 * summaries (when included) keep their packet order — they are positional
 * prompt content, and the builder's order is already deterministic. */
function canonicalPacketShape(
  packet: SemanticSynthesisInput,
  includeChildren: boolean,
): Record<string, unknown> {
  const r = packet.node_ref;
  const seams = packet.value_shape_seams
    .map((s) => ({ row: s.row, prev_shape: s.prev_shape, new_shape: s.new_shape }))
    .sort(
      (x, y) =>
        x.row - y.row || cmpStr(x.prev_shape, y.prev_shape) || cmpStr(x.new_shape, y.new_shape),
    );
  return {
    node_ref: { sheet: r.sheet, column_index: r.column_index, row_start: r.row_start, row_end: r.row_end },
    format_clusters: [...packet.format_clusters].sort(),
    value_shape_seams: seams,
    ...(includeChildren
      ? { child_summaries: packet.child_summaries.map((c) => ({ key: c.key, summary: c.summary })) }
      : {}),
  };
}

/** `deterministic_facts_sha256` (§4): child-independent by construction — the
 * facts are wrapped with child_summaries=[] to reuse the shipped source-safe
 * envelope guard, then hashed WITHOUT the child field. */
export function synthesizeCertDeterministicFactsSha256(
  facts: SynthesizeCertDeterministicFacts,
): string {
  const probe: SemanticSynthesisInput = {
    node_ref: facts.node_ref,
    format_clusters: facts.format_clusters,
    value_shape_seams: facts.value_shape_seams,
    child_summaries: [],
  };
  assertSynthesisInputBounded(probe);
  return sha256Hex(JSON.stringify(canonicalPacketShape(probe, false)));
}

/** `input_sha256` (§4): identity of the FULL frozen packet (child_summaries
 * included) — the same-input comparison key across arms. The exact-key envelope
 * guard runs first so an extra/smuggled field fails closed instead of being
 * silently excluded from the hash. */
export function synthesizeCertInputSha256(packet: SemanticSynthesisInput): string {
  assertSynthesisInputBounded(packet);
  return sha256Hex(JSON.stringify(canonicalPacketShape(packet, true)));
}

// ── candidate universe (per-column collection) ────────────────────────────────

/** One non-subsumed reduce node, tagged with its stratum + the deterministic
 * facts its frozen packet will carry. `sheet_index` (not the raw sheet name)
 * feeds the source-safe input_id (§3 E). */
export interface SynthesizeCertCandidate {
  node_key: SemanticNodeKey;
  node_ref: ComprehensionReduceRegion;
  sheet_index: number;
  stratum: SynthesizeCertStratum;
  subtree_leaf_count: number;
  deterministic_facts: SynthesizeCertDeterministicFacts;
  deterministic_facts_sha256: string;
}

/**
 * Enumerates the sampler universe for ONE column pipeline: every non-subsumed
 * node, stratum-tagged (merge = accumulating mode; seam = the packet's canonical
 * value_shape_seams are non-empty). The deterministic facts come through the
 * SINGLE-SOURCE `buildSynthesisInputForNode` (with placeholder child summaries,
 * discarded) so the facts hashed here are exactly the fields the frozen packet
 * will carry — the two cannot drift.
 */
export function collectSynthesizeCertCandidates(args: {
  trace: ReduceTopologyTrace;
  nodesByKey: ReadonlyMap<SemanticNodeKey, ComprehensionReduceNode>;
  modes: ReadonlyMap<SemanticNodeKey, FrontierMode>;
  sheetIndex: number;
}): SynthesizeCertCandidate[] {
  const { trace, nodesByKey, modes, sheetIndex } = args;
  if (!Number.isSafeInteger(sheetIndex) || sheetIndex < 0) {
    throw new Error(
      `synthesize-cert-sampler: sheetIndex must be a non-negative safe integer, got ${sheetIndex}`,
    );
  }
  assertReduceTopologyIsTree(trace);
  const leafCounts = computeSubtreeLeafCounts(trace);
  const out: SynthesizeCertCandidate[] = [];
  for (const [key, tnode] of trace.nodes) {
    const mode = modes.get(key);
    if (mode === undefined) {
      throw new Error(`synthesize-cert-sampler: no frontier mode for ${key} — modes must cover the trace`);
    }
    if (mode === "subsumed") continue;
    // Placeholder child summaries: buildSynthesisInputForNode requires a summary
    // per consumed child; the facts we keep exclude child_summaries entirely.
    const consumed = tnode.child_keys.filter((k) => modes.get(k) !== "subsumed");
    const packetShape = buildSynthesisInputForNode(
      trace,
      nodesByKey,
      modes,
      key,
      new Map(consumed.map((k) => [k, ""])),
    );
    const facts: SynthesizeCertDeterministicFacts = {
      node_ref: packetShape.node_ref,
      format_clusters: packetShape.format_clusters,
      value_shape_seams: packetShape.value_shape_seams,
    };
    const leafCount = leafCounts.get(key);
    if (leafCount === undefined) {
      throw new Error(`synthesize-cert-sampler: no leaf count for ${key} (impossible)`);
    }
    out.push({
      node_key: key,
      node_ref: packetShape.node_ref,
      sheet_index: sheetIndex,
      stratum: { seam: facts.value_shape_seams.length > 0, merge: mode === "accumulating" },
      subtree_leaf_count: leafCount,
      deterministic_facts: facts,
      deterministic_facts_sha256: synthesizeCertDeterministicFactsSha256(facts),
    });
  }
  out.sort((a, b) => cmpStr(a.node_key, b.node_key));
  return out;
}

// ── stratified sampling (§3) ─────────────────────────────────────────────────

export interface SynthesizeCertSamplerFixtureInput {
  /** Full sha256 hex of the workbook bytes — the fixture's content identity.
   * input_id embeds its first 8 chars (§3 "<fixture8>"). */
  fixture_id: string;
  candidates: SynthesizeCertCandidate[];
}

export interface SynthesizeCertSampledInput {
  fixture_id: string;
  /** `<fixture8>-s<sheetIdx>-c<colIdx>-r<r0>_<r1>` — whitespace-free, globally
   * unique, raw-sheet-name-free (§3 E). */
  input_id: string;
  node_key: SemanticNodeKey;
  sheet_index: number;
  stratum: SynthesizeCertStratum;
  subtree_leaf_count: number;
  deterministic_facts: SynthesizeCertDeterministicFacts;
  deterministic_facts_sha256: string;
  /** 0-based position in the stratum's selection order (§3 provenance H). */
  sampling_rank: number;
  /** input_id-form id of the pool's nearest UNSELECTED candidate (same ordering
   * the selection used; ties resolve to the earlier index) — the R7 audit
   * compares each pick against this neighbor. Null when the pool was exhausted. */
  nearest_unselected_id: string | null;
}

export interface SynthesizeCertStratumProvenance {
  fixture_id: string;
  stratum: SynthesizeCertStratum;
  pool_size: number;
  selected_count: number;
  seed: string;
  /** merge strata: disclosed content-blind cost bias (§3-2). leaf strata:
   * seeded stride over the stable-key order. */
  ordering: "subtree_leaf_count_asc" | "stable_key_stride";
  /** Stride used for stride-sampling; null when the ordering is cost-based or
   * the pool was taken whole. */
  stride: number | null;
}

export interface SynthesizeCertSampleResult {
  manifest: SynthesizeCertSampledInput[];
  provenance: SynthesizeCertStratumProvenance[];
  /** Pre-spend floor gate (§3 sequencing): shipped manifest-floor lint + a
   * pre-spend prediction of the record validator's stratum_global_floor.
   * Non-empty ⇒ the bench WILL fail — do not spend. */
  floor_violations: SynthesizeCertViolation[];
  /** sha256 over the canonical pre-spend manifest — post-hoc scope-shrink
   * detection (§3 D): a re-run must reproduce this identity. */
  manifest_identity_sha256: string;
  sampler_version: string;
  per_stratum_k: number;
  declared_reps: number;
}

function buildInputId(fixtureId: string, c: SynthesizeCertCandidate): string {
  const r = c.node_ref;
  return `${fixtureId.slice(0, 8)}-s${c.sheet_index}-c${r.column_index}-r${r.row_start}_${r.row_end}`;
}

/** Nearest unselected pool index for a selected index (scan outward; ties →
 * earlier index). Returns -1 when every pool member was selected. */
function nearestUnselectedIndex(selected: ReadonlySet<number>, index: number, poolSize: number): number {
  for (let dist = 1; dist < poolSize; dist += 1) {
    const lo = index - dist;
    if (lo >= 0 && !selected.has(lo)) return lo;
    const hi = index + dist;
    if (hi < poolSize && !selected.has(hi)) return hi;
  }
  return -1;
}

export function sampleStratifiedManifest(
  fixtures: SynthesizeCertSamplerFixtureInput[],
  opts?: { perStratumK?: number; declaredReps?: number },
): SynthesizeCertSampleResult {
  const perStratumK = opts?.perStratumK ?? SYNTHESIZE_CERT_DEFAULT_PER_STRATUM_K;
  const declaredReps = opts?.declaredReps ?? SYNTHESIZE_CERT_FLOORS.minRepsPerFixtureArm;
  if (!Number.isSafeInteger(perStratumK) || perStratumK < 1) {
    throw new Error(`synthesize-cert-sampler: perStratumK must be a positive safe integer, got ${perStratumK}`);
  }
  if (!Number.isSafeInteger(declaredReps) || declaredReps < 1) {
    throw new Error(`synthesize-cert-sampler: declaredReps must be a positive safe integer, got ${declaredReps}`);
  }

  const manifest: SynthesizeCertSampledInput[] = [];
  const provenance: SynthesizeCertStratumProvenance[] = [];
  const seenFixtureIds = new Set<string>();

  for (const fixture of fixtures) {
    // fixture_id must be the workbook's real content sha (64-hex): the input_id
    // prefix and the whitespace-free id guarantee both derive from it.
    if (!/^[0-9a-f]{64}$/.test(fixture.fixture_id)) {
      throw new Error(
        `synthesize-cert-sampler: fixture_id must be a lowercase sha256 hex (workbook content identity), got '${fixture.fixture_id}'`,
      );
    }
    if (seenFixtureIds.has(fixture.fixture_id)) {
      throw new Error(`synthesize-cert-sampler: duplicate fixture_id ${fixture.fixture_id}`);
    }
    seenFixtureIds.add(fixture.fixture_id);

    // Candidate integrity — a candidate whose declared identity lies is a
    // harness bug, fail-closed (§3 정직 선정 rests on these being real).
    const seenNodeKeys = new Set<string>();
    for (const c of fixture.candidates) {
      if (reduceNodeKey(c.node_ref) !== c.node_key) {
        throw new Error(
          `synthesize-cert-sampler: candidate node_key '${c.node_key}' != reduceNodeKey(node_ref) '${reduceNodeKey(c.node_ref)}'`,
        );
      }
      if (seenNodeKeys.has(c.node_key)) {
        throw new Error(`synthesize-cert-sampler: duplicate candidate node_key '${c.node_key}' in fixture ${fixture.fixture_id}`);
      }
      seenNodeKeys.add(c.node_key);
      if (synthesizeCertDeterministicFactsSha256(c.deterministic_facts) !== c.deterministic_facts_sha256) {
        throw new Error(
          `synthesize-cert-sampler: candidate ${c.node_key} deterministic_facts_sha256 does not recompute from its facts`,
        );
      }
      if (c.stratum.seam !== (c.deterministic_facts.value_shape_seams.length > 0)) {
        throw new Error(
          `synthesize-cert-sampler: candidate ${c.node_key} seam flag disagrees with its value_shape_seams`,
        );
      }
      if (!Number.isSafeInteger(c.sheet_index) || c.sheet_index < 0) {
        throw new Error(`synthesize-cert-sampler: candidate ${c.node_key} sheet_index invalid`);
      }
      if (!Number.isSafeInteger(c.subtree_leaf_count) || c.subtree_leaf_count < 1) {
        throw new Error(`synthesize-cert-sampler: candidate ${c.node_key} subtree_leaf_count invalid`);
      }
    }

    // Group by possessed stratum, stable-key order (§3-1).
    const pools = new Map<string, SynthesizeCertCandidate[]>();
    for (const c of [...fixture.candidates].sort((a, b) => cmpStr(a.node_key, b.node_key))) {
      const k = stratumKey(c.stratum);
      const pool = pools.get(k) ?? [];
      pool.push(c);
      pools.set(k, pool);
    }

    for (const [poolKey, pool] of [...pools.entries()].sort((a, b) => cmpStr(a[0], b[0]))) {
      const stratum = pool[0]!.stratum;
      const seed = sha256Hex(`${fixture.fixture_id}|${poolKey}|${SYNTHESIZE_CERT_SAMPLER_VERSION}`);
      const isMerge = stratum.merge;
      // merge: order by subtree leaf count ascending (disclosed content-blind
      // cost bias, §3-2), seed tie-break, node_key as the final total order.
      const ordered = isMerge
        ? [...pool].sort(
            (a, b) =>
              a.subtree_leaf_count - b.subtree_leaf_count ||
              cmpStr(sha256Hex(`${seed}|${a.node_key}`), sha256Hex(`${seed}|${b.node_key}`)) ||
              cmpStr(a.node_key, b.node_key),
          )
        : pool; // leaf strata: stable-key order (already sorted).
      const takeAll = ordered.length <= perStratumK;
      let stride: number | null = null;
      let pickedIndices: number[];
      if (takeAll) {
        pickedIndices = ordered.map((_, i) => i);
      } else if (isMerge) {
        pickedIndices = Array.from({ length: perStratumK }, (_, i) => i); // smallest-K cost bound
      } else {
        // Seeded stride over the stable-key order: spreads picks across the
        // pool instead of clustering at its head. offset+ (K-1)·stride ≤ N-1.
        stride = Math.floor(ordered.length / perStratumK);
        const offset = parseInt(seed.slice(0, 12), 16) % stride;
        pickedIndices = Array.from({ length: perStratumK }, (_, i) => offset + i * stride!);
      }
      const selectedSet = new Set(pickedIndices);
      pickedIndices.forEach((poolIndex, rank) => {
        const c = ordered[poolIndex]!;
        const nearest = nearestUnselectedIndex(selectedSet, poolIndex, ordered.length);
        manifest.push({
          fixture_id: fixture.fixture_id,
          input_id: buildInputId(fixture.fixture_id, c),
          node_key: c.node_key,
          sheet_index: c.sheet_index,
          stratum: c.stratum,
          subtree_leaf_count: c.subtree_leaf_count,
          deterministic_facts: c.deterministic_facts,
          deterministic_facts_sha256: c.deterministic_facts_sha256,
          sampling_rank: rank,
          nearest_unselected_id: nearest === -1 ? null : buildInputId(fixture.fixture_id, ordered[nearest]!),
        });
      });
      provenance.push({
        fixture_id: fixture.fixture_id,
        stratum,
        pool_size: ordered.length,
        selected_count: pickedIndices.length,
        seed,
        ordering: isMerge ? "subtree_leaf_count_asc" : "stable_key_stride",
        stride,
      });
    }
  }

  // §3 E: whitespace-free + globally unique input_ids, asserted before freeze.
  const seenInputIds = new Set<string>();
  for (const entry of manifest) {
    if (!/^\S+$/.test(entry.input_id)) {
      throw new Error(`synthesize-cert-sampler: input_id '${entry.input_id}' contains whitespace or is empty`);
    }
    if (seenInputIds.has(entry.input_id)) {
      throw new Error(`synthesize-cert-sampler: input_id collision '${entry.input_id}' — ids must be globally unique`);
    }
    seenInputIds.add(entry.input_id);
  }

  // Pre-spend floor gate (§3 sequencing): deterministic-facts scope — the
  // input_sha256 slot carries deterministic_facts_sha256 because the frozen
  // packet sha does not exist yet; the floor lint never reads the sha.
  const floorViolations = synthesizeCertManifestFloorViolations({
    inputManifest: manifest.map((e) => ({
      fixture_id: e.fixture_id,
      input_id: e.input_id,
      input_sha256: e.deterministic_facts_sha256,
      stratum: e.stratum,
    })),
    declaredReps,
  });
  // Pre-spend prediction of the record validator's stratum_global_floor: every
  // 2×2 stratum must be floor-reachable (inputs × reps ≥ decisive floor) in at
  // least ONE fixture — a manifest missing a stratum entirely passes the
  // possessed-strata lint above but is guaranteed to fail post-spend.
  const selectedByFixtureStratum = new Map<string, number>();
  for (const e of manifest) {
    const k = `${e.fixture_id} ${stratumKey(e.stratum)}`;
    selectedByFixtureStratum.set(k, (selectedByFixtureStratum.get(k) ?? 0) + 1);
  }
  for (const combo of [
    { seam: false, merge: false },
    { seam: false, merge: true },
    { seam: true, merge: false },
    { seam: true, merge: true },
  ]) {
    const reachable = fixtures.some(
      (fx) =>
        (selectedByFixtureStratum.get(`${fx.fixture_id} ${stratumKey(combo)}`) ?? 0) * declaredReps >=
        SYNTHESIZE_CERT_FLOORS.minDecisivePerStratumArm,
    );
    if (!reachable) {
      floorViolations.push({
        code: "stratum_global_floor",
        message: `stratum ${stratumKey(combo)} is floor-reachable in no fixture (inputs x reps < ${SYNTHESIZE_CERT_FLOORS.minDecisivePerStratumArm} everywhere) — the record WILL fail stratum_global_floor; do not spend`,
        subject_id: null,
      });
    }
  }

  const manifestIdentitySha256 = sha256Hex(
    JSON.stringify(
      [...manifest]
        .sort((a, b) => cmpStr(a.input_id, b.input_id))
        .map((e) => ({
          fixture_id: e.fixture_id,
          input_id: e.input_id,
          node_key: e.node_key,
          stratum: { seam: e.stratum.seam, merge: e.stratum.merge },
          deterministic_facts_sha256: e.deterministic_facts_sha256,
          sampling_rank: e.sampling_rank,
          nearest_unselected_id: e.nearest_unselected_id,
        })),
    ),
  );

  return {
    manifest,
    provenance,
    floor_violations: floorViolations,
    manifest_identity_sha256: manifestIdentitySha256,
    sampler_version: SYNTHESIZE_CERT_SAMPLER_VERSION,
    per_stratum_k: perStratumK,
    declared_reps: declaredReps,
  };
}
