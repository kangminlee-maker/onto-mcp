/**
 * recursive-reduce — R1 linchpin proof harness (grouping-invariance / R8).
 *
 * DESIGN CONTEXT (throwaway/scratchpad, NO production wiring — rescoped comprehension-engine
 * design 20260625 §3.3/§5.1, unified-doc §12 R8). recursive-reduce = a same-schema tree that
 * merges leaf comprehensions of spreadsheet tiles. The one load-bearing thing no committed code
 * demonstrates: can a REAL-LLM k-ary merge, grounded on a canonical child-partition + deterministic
 * value-signature tiles, produce a root whose GROUND CONTENT is byte-identical regardless of how the
 * children were grouped/ordered? If not, recursive-reduce can never be resumable/cacheable → the cut
 * is dead. This harness measures exactly that.
 *
 * SCOPE (R1 only, owner-approved 2026-07-01): isolate the MERGE operator. Leaves are held FIXED as
 * DETERMINISTIC tile summaries (no leaf-read LLM), so leaf-read variance is not a confound — leaf-read
 * LLM quality is a separate axis already exercised in prod. The merge is the only LLM call, and the
 * only thing under test.
 *
 * GROUND CONTENT compared for byte-stability (prose is NOT compared, per design "prose는 달라도 됨"):
 *   { format_clusters (sorted unique shape tokens), boundary_rows (sorted unique transition rows),
 *     distinct_is_lower_bound (OR), heterogeneity }  — all deterministic set-ops over the children.
 *
 * FIXTURE: the persisted real deterministic observation of the 101MB accounting workbook
 *   (.onto/reconstruct/abprobe-A-with/source-observations.yaml). Its segmented_value_tiles carry the
 *   real value-signature tiles — replayed, so NO raw xlsx and NO re-observation is needed.
 *
 * MODES:
 *   (default / REDUCE_PROOF_MODE=scout)  LLM-0. Rank heterogeneous columns → pick a leaf-merge region.
 *   REDUCE_PROOF_MODE=run                 the R1 test (real LLM merges, unless REUSE/MOCK).
 *   REDUCE_PROOF_MERGE=mock               deterministic faithful merge (LLM-0) — validates harness logic.
 *   REDUCE_PROOF_MERGE=mock_jitter        deterministic order-biased merge (LLM-0) — must FAIL (negative
 *                                         control for the harness itself: proves the test can fail).
 *   REDUCE_PROOF_REUSE=1                  replay frozen merge outputs from the session dir (LLM-0).
 *
 * COST CONTROL: REDUCE_PROOF_MAX_CALLS (default 40) hard-caps real LLM calls (throws if exceeded).
 *
 *   npx tsx scripts/reduce-proof-harness.mts                          # scout
 *   REDUCE_PROOF_MODE=run REDUCE_PROOF_MERGE=mock npx tsx scripts/reduce-proof-harness.mts   # logic dry-run
 *   REDUCE_PROOF_MODE=run npx tsx scripts/reduce-proof-harness.mts    # LIVE (real LLM)
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { callLlm, resolveLlmProviderConfig } from "../src/core-runtime/llm/llm-caller.ts";
import {
  resolveReconstructActorLlmSettings,
  resolveSettingsChain,
} from "../src/core-runtime/discovery/settings-chain.ts";

const REPO = "/Users/kangmin/cowork/onto-mcp-claude";
const OBS =
  process.env.REDUCE_PROOF_OBS ??
  path.join(REPO, ".onto/reconstruct/abprobe-A-with/source-observations.yaml");
const MODE = process.env.REDUCE_PROOF_MODE ?? "scout";
const MERGE_KIND = process.env.REDUCE_PROOF_MERGE ?? "live"; // live | mock | mock_jitter
const REUSE = process.env.REDUCE_PROOF_REUSE === "1";
const MAX_CALLS = Number(process.env.REDUCE_PROOF_MAX_CALLS ?? "40");
const SHEET = process.env.REDUCE_PROOF_SHEET ?? "누적";
const COL = Number(process.env.REDUCE_PROOF_COL ?? "4");
const K_LEAVES = Number(process.env.REDUCE_PROOF_LEAVES ?? "4");
const SESSION = path.join(REPO, ".onto/reconstruct/reduce-proof-r1");

type Segment = {
  row_start: number;
  row_end: number;
  non_empty: number;
  dominant_shape: string | null;
  shape_counts?: Record<string, number>;
  type_counts?: Record<string, number>;
  distinct_count: number;
  distinct_is_lower_bound: boolean;
};
type IntraNote = {
  boundary_kind: string;
  prev_shape: string;
  new_shape: string;
  last_prev_format_row: number;
  first_new_format_row: number;
};
type Column = {
  column_index: number;
  segments: Segment[];
  intra_tile_notes?: IntraNote[];
  segments_capped?: boolean;
};
type Projection = { sheet: string; window: number; columns: Column[] };

function collectProjections(node: unknown, out: Projection[]): void {
  if (Array.isArray(node)) {
    for (const x of node) collectProjections(x, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "segmented_value_tiles" && Array.isArray(v)) {
        for (const p of v) out.push(p as Projection);
      } else {
        collectProjections(v, out);
      }
    }
  }
}

type Candidate = {
  sheet: string;
  col: number;
  nonEmptySegs: Segment[];
  shapes: string[];
  boundaries: number;
  notes: IntraNote[];
  span: [number, number];
};

async function loadProjections(): Promise<Projection[]> {
  const t0 = Date.now();
  console.log(`[proof] parsing ${OBS} …`);
  const raw = await fs.readFile(OBS, "utf8");
  const obs = parseYaml(raw);
  console.log(
    `[proof] parsed ${(raw.length / 1e6).toFixed(1)}MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  const projections: Projection[] = [];
  collectProjections(obs, projections);
  return projections;
}

function rankCandidates(projections: Projection[]): Candidate[] {
  const cands: Candidate[] = [];
  for (const p of projections) {
    for (const c of p.columns ?? []) {
      const nonEmptySegs = (c.segments ?? []).filter((s) => s.dominant_shape);
      if (nonEmptySegs.length === 0) continue;
      const shapes = [...new Set(nonEmptySegs.map((s) => s.dominant_shape as string))].sort();
      const notes = c.intra_tile_notes ?? [];
      const rows = nonEmptySegs.flatMap((s) => [s.row_start, s.row_end]);
      cands.push({
        sheet: p.sheet,
        col: c.column_index,
        nonEmptySegs,
        shapes,
        boundaries: notes.length,
        notes,
        span: [Math.min(...rows), Math.max(...rows)],
      });
    }
  }
  // Heterogeneity rank: more distinct shapes, then more boundaries, then more non-empty segments.
  cands.sort(
    (a, b) =>
      b.shapes.length - a.shapes.length ||
      b.boundaries - a.boundaries ||
      b.nonEmptySegs.length - a.nonEmptySegs.length,
  );
  return cands;
}

async function scout(): Promise<void> {
  const projections = await loadProjections();
  const cands = rankCandidates(projections);
  console.log(`[proof] projections=${projections.length}`);
  console.log(`[proof] columns w/ ≥1 non-empty segment: ${cands.length}`);
  console.log(`[proof] columns w/ ≥2 distinct shapes:   ${cands.filter((c) => c.shapes.length >= 2).length}`);
  console.log(`[proof] columns w/ ≥1 boundary note:     ${cands.filter((c) => c.boundaries >= 1).length}`);
  console.log(`\n[proof] TOP heterogeneous columns (leaf-merge candidates):`);
  for (const c of cands.slice(0, 15)) {
    console.log(
      ` sheet=${JSON.stringify(c.sheet)} col=${c.col} rows=${c.span[0]}-${c.span[1]} ` +
        `nonEmptySegs=${c.nonEmptySegs.length} shapes=[${c.shapes.join(",")}] boundaries=${c.boundaries}`,
    );
    for (const n of c.notes.slice(0, 4)) {
      console.log(
        `     boundary ${n.boundary_kind}: ${n.prev_shape}→${n.new_shape} @ ${n.last_prev_format_row}/${n.first_new_format_row}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// R1 run mode: grouping-invariance of a real-LLM k-ary merge over deterministic leaves.
// ---------------------------------------------------------------------------

/** A comprehension node — SAME schema for leaves and merged parents (monoid: same-shape fold). The
 *  GROUND fields (everything except `narration`) are what must be byte-stable across groupings. */
type Node = {
  id: string;
  row_start: number;
  row_end: number;
  format_clusters: string[]; // sorted unique value-shape tokens present
  boundary_rows: number[]; // sorted unique rows where the value-shape changes
  edge_first_shape: string; // dominant shape at the node's first non-empty segment
  edge_last_shape: string; // dominant shape at the node's last non-empty segment
  distinct_is_lower_bound: boolean;
  narration?: string; // free prose — NOT part of ground content, NOT compared
};

/** Canonical ground projection → the byte-comparison subject. Sorted, prose-free. */
function groundOf(n: Node): Record<string, unknown> {
  return {
    row_start: n.row_start,
    row_end: n.row_end,
    format_clusters: [...n.format_clusters].sort(),
    boundary_rows: [...n.boundary_rows].sort((a, b) => a - b),
    edge_first_shape: n.edge_first_shape,
    edge_last_shape: n.edge_last_shape,
    distinct_is_lower_bound: n.distinct_is_lower_bound,
  };
}
function groundHash(n: Node): string {
  return crypto.createHash("sha256").update(JSON.stringify(groundOf(n))).digest("hex").slice(0, 16);
}
function sortCanonical(children: Node[]): Node[] {
  return [...children].sort((a, b) => a.row_start - b.row_start);
}

/** Build K deterministic leaves from a heterogeneous column window (LLM-0). Leaves tile a contiguous
 *  run of non-empty segments spanning the column's first value-shape boundaries, so adjacent leaves
 *  sometimes straddle a real format change (a genuine seam to preserve). */
function buildLeaves(projections: Projection[]): Node[] {
  const proj = projections.find((p) => p.sheet === SHEET);
  if (!proj) throw new Error(`sheet ${SHEET} has no value tiles`);
  const col = (proj.columns ?? []).find((c) => c.column_index === COL);
  if (!col) throw new Error(`sheet ${SHEET} col ${COL} not found`);
  const vNotes = (col.intra_tile_notes ?? []).filter((n) => n.boundary_kind === "value_shape");
  if (vNotes.length < 2) throw new Error(`col ${COL} has <2 value_shape boundaries; pick another region`);
  const b0 = vNotes[0].first_new_format_row;
  const b1 = vNotes[1].first_new_format_row;
  const lo = Math.min(b0, b1) - 3000;
  const hi = Math.max(b0, b1) + 3000;
  const segs = (col.segments ?? []).filter(
    (s) => s.dominant_shape && s.row_end >= lo && s.row_start <= hi,
  );
  if (segs.length < K_LEAVES) throw new Error(`only ${segs.length} non-empty segments in window; need ≥${K_LEAVES}`);
  const per = Math.ceil(segs.length / K_LEAVES);
  const leaves: Node[] = [];
  for (let i = 0; i < K_LEAVES; i += 1) {
    const block = segs.slice(i * per, (i + 1) * per);
    if (block.length === 0) continue;
    const rowStart = Math.min(...block.map((s) => s.row_start));
    const rowEnd = Math.max(...block.map((s) => s.row_end));
    const clusters = [...new Set(block.map((s) => s.dominant_shape as string))].sort();
    const bounds = vNotes
      .filter((n) => n.first_new_format_row > rowStart && n.first_new_format_row <= rowEnd)
      .map((n) => n.first_new_format_row);
    leaves.push({
      id: `L${i}`,
      row_start: rowStart,
      row_end: rowEnd,
      format_clusters: clusters,
      boundary_rows: [...new Set(bounds)].sort((a, b) => a - b),
      edge_first_shape: block[0].dominant_shape as string,
      edge_last_shape: block[block.length - 1].dominant_shape as string,
      distinct_is_lower_bound: block.some((s) => s.distinct_is_lower_bound),
    });
  }
  return leaves;
}

/** Deterministic reference merge — the exact spec the live LLM is asked to follow. Associative &
 *  commutative on ground content by construction (canonical sort + set-union + adjacency-gated seam). */
function mergeDeterministic(children: Node[], jitter: boolean): Node {
  const sorted = jitter ? [...children] : sortCanonical(children); // jitter: honor arrival order (BUG)
  const rowStart = Math.min(...sorted.map((c) => c.row_start));
  const rowEnd = Math.max(...sorted.map((c) => c.row_end));
  const clusters = new Set<string>();
  const bounds = new Set<number>();
  for (const c of sorted) {
    for (const f of c.format_clusters) clusters.add(f);
    for (const b of c.boundary_rows) bounds.add(b);
  }
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const adjacent = a.row_end + 1 === b.row_start;
    if (adjacent && a.edge_last_shape !== b.edge_first_shape) bounds.add(b.row_start);
  }
  // jitter bug: pollute boundaries with each merged node's OWN row_start — a tree-shape-dependent
  // artifact, so different (even canonical) groupings accumulate different boundary sets → NOT invariant.
  if (jitter) bounds.add(rowStart);
  const ordered = jitter ? sorted : sortCanonical(children);
  return {
    id: `M(${children.map((c) => c.id).join("+")})`,
    row_start: rowStart,
    row_end: rowEnd,
    format_clusters: [...clusters].sort(),
    boundary_rows: [...bounds].sort((a, b) => a - b),
    edge_first_shape: ordered[0].edge_first_shape,
    edge_last_shape: ordered[ordered.length - 1].edge_last_shape,
    distinct_is_lower_bound: children.some((c) => c.distinct_is_lower_bound),
    narration: `${jitter ? "jitter" : "det"} merge of ${children.length}`,
  };
}

const MERGE_SYSTEM =
  "You are a DETERMINISTIC merge operator in a recursive comprehension tree over spreadsheet " +
  "value-signature tiles. You combine child nodes into ONE parent node by following the rules EXACTLY. " +
  "Do not infer, sample, or add anything beyond the rules. Output ONLY a single JSON object.";

function mergePrompt(children: Node[]): string {
  const sorted = sortCanonical(children).map((c) => ({
    id: c.id,
    row_start: c.row_start,
    row_end: c.row_end,
    format_clusters: c.format_clusters,
    boundary_rows: c.boundary_rows,
    edge_first_shape: c.edge_first_shape,
    edge_last_shape: c.edge_last_shape,
    distinct_is_lower_bound: c.distinct_is_lower_bound,
  }));
  return [
    "Children (already sorted by row_start, non-overlapping):",
    JSON.stringify(sorted, null, 2),
    "",
    "Produce the PARENT node combining them, computed EXACTLY as:",
    "- row_start = min child.row_start ; row_end = max child.row_end",
    "- format_clusters = the SORTED SET-UNION of all children's format_clusters",
    "- boundary_rows = the SORTED SET-UNION of all children's boundary_rows, PLUS, for each pair of",
    "  CONSECUTIVE children A then B: IF they are row-adjacent (A.row_end + 1 == B.row_start) AND",
    "  A.edge_last_shape != B.edge_first_shape, add a boundary at B.row_start. If A and B are NOT",
    "  adjacent (there is a row gap between them), DO NOT add any boundary between them.",
    "- distinct_is_lower_bound = logical OR of all children's flags",
    "- edge_first_shape = the FIRST child's edge_first_shape ; edge_last_shape = the LAST child's edge_last_shape",
    '- narration = one short sentence (free text; ignored downstream)',
    "",
    'Output JSON: {"row_start":int,"row_end":int,"format_clusters":[str],"boundary_rows":[int],',
    '"edge_first_shape":str,"edge_last_shape":str,"distinct_is_lower_bound":bool,"narration":str}',
  ].join("\n");
}

const CONTROL_SYSTEM =
  "You merge child readings of a spreadsheet column region into one parent reading. Summarize which " +
  "value formats appear and where the format changes. Output ONLY a single JSON object.";
function controlPrompt(children: Node[], order: Node[]): string {
  // NEGATIVE CONTROL: children fed in the GIVEN order (no canonical sort), no adjacency rule.
  const view = order.map((c) => ({
    id: c.id,
    rows: `${c.row_start}-${c.row_end}`,
    formats: c.format_clusters,
    changes_at: c.boundary_rows,
    starts_as: c.edge_first_shape,
    ends_as: c.edge_last_shape,
  }));
  return [
    "Child readings (in the order given):",
    JSON.stringify(view, null, 2),
    "",
    "Combine them into one parent reading. Report the value formats present and the rows where the",
    "format changes across the whole region.",
    'Output JSON: {"format_clusters":[str],"boundary_rows":[int],"narration":str}',
  ].join("\n");
}

// HYBRID merge (owner-directed): code owns the resumable GROUND (mergeDeterministic), the LLM is
// confined to a non-authoritative one-sentence narration that is EXCLUDED from ground/cache key —
// the exact leaf-read discipline (leaf-reader.ts:23-34) extended to the merge operator.
const NARRATION_SYSTEM =
  "You write a ONE-SENTENCE, non-authoritative plain-language gist for a MERGED spreadsheet " +
  "comprehension node. The structural facts (row range, value-format clusters, the rows where the " +
  "format changes) are ALREADY computed deterministically and given to you — you MUST NOT recompute, " +
  'add, contradict, or restate them as numbers. Output ONLY {"narration":"<one sentence>"}.';
function narrationPrompt(children: Node[], ground: Node): string {
  return [
    "Children (row-ordered):",
    JSON.stringify(
      sortCanonical(children).map((c) => ({ id: c.id, rows: `${c.row_start}-${c.row_end}`, formats: c.format_clusters })),
      null,
      2,
    ),
    "",
    "Deterministically-computed parent facts (AUTHORITATIVE — do not change):",
    JSON.stringify(
      { rows: `${ground.row_start}-${ground.row_end}`, format_clusters: ground.format_clusters, boundary_rows: ground.boundary_rows },
      null,
      2,
    ),
    "",
    'Write a one-sentence gist of what this merged region holds. Output JSON: {"narration":"<one sentence>"}',
  ].join("\n");
}

let CALL_COUNT = 0;
let LIVE_CONFIG: Record<string, unknown> | null = null;
const MEMO = new Map<string, Node>();
const FROZEN: Record<string, Node> = {};

async function resolveLiveConfig(): Promise<Record<string, unknown>> {
  if (LIVE_CONFIG) return LIVE_CONFIG;
  const settings = await resolveSettingsChain(REPO, REPO);
  const actorLlm = resolveReconstructActorLlmSettings(settings, "semantic_author");
  const cfg = resolveLlmProviderConfig({ config: { llm: actorLlm } }) as Record<string, unknown>;
  LIVE_CONFIG = { ...cfg, max_tokens: 2000 };
  console.log(
    `[proof] route: provider=${cfg.provider} model=${cfg.model_id ?? (cfg as any).model ?? "?"} adapter=${(cfg as any).execution_adapter ?? "?"}`,
  );
  return LIVE_CONFIG;
}

function extractJson(text: string): Record<string, unknown> {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error(`no JSON object in LLM output: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>;
}

async function callLlmJson(system: string, user: string): Promise<Record<string, unknown>> {
  CALL_COUNT += 1;
  if (CALL_COUNT > MAX_CALLS) throw new Error(`LLM call cap ${MAX_CALLS} exceeded — aborting to protect budget`);
  const cfg = await resolveLiveConfig();
  const res = await callLlm(system, user, cfg as never);
  return extractJson((res as { text: string }).text);
}

function coerceNode(raw: Record<string, unknown>, ids: string[]): Node {
  return {
    id: `M(${ids.join("+")})`,
    row_start: Number(raw.row_start),
    row_end: Number(raw.row_end),
    format_clusters: Array.isArray(raw.format_clusters) ? (raw.format_clusters as string[]).map(String) : [],
    boundary_rows: Array.isArray(raw.boundary_rows) ? (raw.boundary_rows as number[]).map(Number) : [],
    edge_first_shape: String(raw.edge_first_shape ?? ""),
    edge_last_shape: String(raw.edge_last_shape ?? ""),
    distinct_is_lower_bound: Boolean(raw.distinct_is_lower_bound),
    narration: raw.narration ? String(raw.narration) : undefined,
  };
}

/** Merge dispatch with node-cache (memoized on canonical child ground hashes = the design's node cache). */
async function merge(children: Node[]): Promise<Node> {
  const key = MERGE_KIND + ":" + sortCanonical(children).map(groundHash).sort().join(",");
  const cached = MEMO.get(key);
  if (cached) return cached;
  if (REUSE) {
    const frozen = FROZEN[key];
    if (!frozen) throw new Error(`REUSE: no frozen merge for key ${key}`);
    MEMO.set(key, frozen);
    return frozen;
  }
  let out: Node;
  if (MERGE_KIND === "mock") out = mergeDeterministic(children, false);
  else if (MERGE_KIND === "mock_jitter") out = mergeDeterministic(children, true);
  else if (MERGE_KIND === "hybrid") {
    // Code owns ground (byte-stable by construction); LLM adds only non-authoritative narration.
    out = mergeDeterministic(children, false);
    const raw = await callLlmJson(NARRATION_SYSTEM, narrationPrompt(children, out));
    out.narration = typeof raw.narration === "string" ? raw.narration : "";
  } else {
    // "live": LLM authors the ground too (the R8-failing arm, kept for contrast).
    const raw = await callLlmJson(MERGE_SYSTEM, mergePrompt(children));
    out = coerceNode(raw, children.map((c) => c.id));
  }
  MEMO.set(key, out);
  FROZEN[key] = out;
  return out;
}

/** Fold a leaf list into a root under a named grouping (tree shape). */
async function foldTree(leaves: Node[], grouping: string): Promise<Node> {
  const [L0, L1, L2, L3] = leaves;
  if (leaves.length !== 4) {
    // generic left-deep fallback for K≠4
    let acc = leaves[0];
    for (let i = 1; i < leaves.length; i += 1) acc = await merge([acc, leaves[i]]);
    return acc;
  }
  switch (grouping) {
    // CANONICAL (contiguous) partitions — a valid monoid reduce must make these all equal.
    case "balanced_adjacent":
      return merge([await merge([L0, L1]), await merge([L2, L3])]);
    case "flat_kary":
      return merge([L0, L1, L2, L3]);
    case "left_deep":
      return merge([await merge([await merge([L0, L1]), L2]), L3]);
    case "right_deep":
      return merge([L0, await merge([L1, await merge([L2, L3])])]);
    // NON-CANONICAL (non-contiguous) partition — structural control; EXPECTED to break invariance
    // (groups non-adjacent leaves → overlapping/interleaved node ranges lose the L2/L3 seam). This is
    // exactly the failure canonical child-partition (R8) exists to prevent.
    case "cross":
      return merge([await merge([L0, L2]), await merge([L1, L3])]);
    default:
      throw new Error(`unknown grouping ${grouping}`);
  }
}

async function runControl(leaves: Node[]): Promise<{ orderA: string; orderB: string; stable: boolean }> {
  // Same leaves, two DIFFERENT orderings, ungrounded free-prose merge (no canonical sort, no adjacency rule).
  const fwd = [...leaves];
  const rev = [...leaves].reverse();
  const a = await callLlmJson(CONTROL_SYSTEM, controlPrompt(leaves, fwd));
  const b = await callLlmJson(CONTROL_SYSTEM, controlPrompt(leaves, rev));
  const norm = (r: Record<string, unknown>) =>
    JSON.stringify({
      format_clusters: (Array.isArray(r.format_clusters) ? (r.format_clusters as string[]).map(String) : []).sort(),
      boundary_rows: (Array.isArray(r.boundary_rows) ? (r.boundary_rows as number[]).map(Number) : []).sort((x, y) => x - y),
    });
  const hA = crypto.createHash("sha256").update(norm(a)).digest("hex").slice(0, 16);
  const hB = crypto.createHash("sha256").update(norm(b)).digest("hex").slice(0, 16);
  return { orderA: hA, orderB: hB, stable: hA === hB };
}

async function run(): Promise<void> {
  await fs.mkdir(SESSION, { recursive: true });
  const frozenPath = path.join(SESSION, `frozen-${MERGE_KIND}.json`);
  if (REUSE) {
    const disk = JSON.parse(await fs.readFile(frozenPath, "utf8")) as Record<string, Node>;
    for (const [k, v] of Object.entries(disk)) FROZEN[k] = v;
    console.log(`[proof] REUSE: loaded ${Object.keys(FROZEN).length} frozen merges from ${frozenPath}`);
  }
  const projections = await loadProjections();
  const leaves = buildLeaves(projections);
  console.log(`\n[proof] region: sheet=${JSON.stringify(SHEET)} col=${COL} — ${leaves.length} deterministic leaves:`);
  for (const l of leaves) {
    console.log(
      `  ${l.id} rows=${l.row_start}-${l.row_end} clusters=[${l.format_clusters.join(",")}] ` +
        `boundaries=[${l.boundary_rows.join(",")}] edges=${l.edge_first_shape}..${l.edge_last_shape} lb=${l.distinct_is_lower_bound}`,
    );
  }
  // Non-vacuity precondition (CLAUDE.md: assert subject set is non-trivial before a "stable" claim).
  const allClusters = new Set(leaves.flatMap((l) => l.format_clusters));
  const seamCount = (() => {
    const s = sortCanonical(leaves);
    let n = 0;
    for (let i = 0; i + 1 < s.length; i += 1) if (s[i].edge_last_shape !== s[i + 1].edge_first_shape) n += 1;
    return n;
  })();
  const internalBoundaries = leaves.reduce((a, l) => a + l.boundary_rows.length, 0);
  console.log(
    `[proof] non-vacuity: distinct clusters=${allClusters.size} (need ≥2), adjacent-leaf seams=${seamCount}, internal boundaries=${internalBoundaries}`,
  );
  if (allClusters.size < 2 || internalBoundaries + seamCount < 1) {
    throw new Error("VACUOUS region (need ≥2 clusters and ≥1 boundary/seam) — pick another col via REDUCE_PROOF_COL");
  }

  const canonical = ["balanced_adjacent", "flat_kary", "left_deep", "right_deep"];
  const fmt = (r: Node) =>
    `clusters=[${[...r.format_clusters].sort().join(",")}] boundaries=[${[...r.boundary_rows].sort((a, b) => a - b).join(",")}] edges=${r.edge_first_shape}..${r.edge_last_shape}`;

  // One measurement = one fresh LLM pass over all groupings (MEMO/FROZEN reset so no cross-run reuse).
  async function measureOnce(): Promise<{
    hashes: Record<string, string>;
    invariant: boolean;
    roots: Record<string, Node>;
    crossHash: string;
    crossDiverged: boolean;
  }> {
    MEMO.clear();
    for (const k of Object.keys(FROZEN)) delete FROZEN[k];
    const roots: Record<string, Node> = {};
    for (const g of [...canonical, "cross"]) roots[g] = await foldTree(leaves, g);
    const hashes: Record<string, string> = {};
    for (const g of canonical) hashes[g] = groundHash(roots[g]);
    const invariant = new Set(Object.values(hashes)).size === 1;
    const crossHash = groundHash(roots["cross"]);
    return { hashes, invariant, roots, crossHash, crossDiverged: crossHash !== hashes["balanced_adjacent"] };
  }

  const REPEATS = Number(process.env.REDUCE_PROOF_REPEATS ?? "1");
  const runs: Array<Awaited<ReturnType<typeof measureOnce>>> = [];
  for (let i = 0; i < REPEATS; i += 1) {
    const m = await measureOnce();
    runs.push(m);
    const majority = (() => {
      const counts = new Map<string, number>();
      for (const h of Object.values(m.hashes)) counts.set(h, (counts.get(h) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    })();
    const divergent = canonical.filter((g) => m.hashes[g] !== majority);
    console.log(
      `\n[proof] === run ${i + 1}/${REPEATS} : ${m.invariant ? "INVARIANT ✅" : "DIVERGED ❌ [" + divergent.join(",") + "]"} ===`,
    );
    for (const g of canonical) {
      const tag = m.hashes[g] === majority ? "  " : "→ ";
      console.log(`  ${tag}${g.padEnd(18)} ground=${m.hashes[g]}  ${fmt(m.roots[g])}`);
    }
  }

  const invariantCount = runs.filter((r) => r.invariant).length;
  const crossDivergedAll = runs.every((r) => r.crossDiverged);
  console.log(`\n[proof] ========== R8 grouping-invariance over ${REPEATS} run(s) ==========`);
  console.log(`[proof] invariant runs: ${invariantCount}/${REPEATS}`);
  console.log(`[proof] structural control 'cross' diverged in all runs: ${crossDivergedAll ? "yes ✅" : "no"}`);

  // Hybrid observation: the LLM is genuinely in-loop and its narration VARIES, yet it is excluded
  // from ground → the resume/cache subject stayed invariant. This is the whole point of the split.
  let narrationDistinct = 0;
  if (MERGE_KIND === "hybrid") {
    const narrations = runs.map((r) => r.roots["balanced_adjacent"].narration ?? "").filter((n) => n !== "");
    narrationDistinct = new Set(narrations).size;
    console.log(
      `\n[proof] LLM narration (non-authoritative, EXCLUDED from ground): ${narrationDistinct} distinct across ${narrations.length} runs`,
    );
    console.log(`[proof] → LLM is in-loop & its text varies, but ground stayed ${invariantCount}/${REPEATS} invariant (resume key untouched by LLM jitter):`);
    for (const n of narrations.slice(0, 5)) console.log(`    "${n}"`);
  }

  // Negative control (live, single measurement) — the ungrounded free-prose path.
  let control: Awaited<ReturnType<typeof runControl>> | null = null;
  if (MERGE_KIND === "live" && !REUSE) {
    control = await runControl(leaves);
    console.log(
      `[proof] negative control (ungrounded, fwd vs rev order): ${control.stable ? "STABLE (inconclusive — order axis didn't move this task)" : "DIVERGED"}`,
    );
  }

  await fs.writeFile(frozenPath, JSON.stringify(FROZEN, null, 2));
  const report = {
    proof: "recursive-reduce R1 — grouping-invariance (R8)",
    merge_kind: MERGE_KIND,
    fixture: OBS,
    region: { sheet: SHEET, col: COL, leaves: leaves.length },
    leaves: leaves.map(groundOf),
    non_vacuity: { distinct_clusters: allClusters.size, seams: seamCount, internal_boundaries: internalBoundaries },
    repeats: REPEATS,
    invariant_runs: invariantCount,
    runs: runs.map((r, i) => ({
      run: i + 1,
      invariant: r.invariant,
      hashes: r.hashes,
      roots: Object.fromEntries(canonical.map((g) => [g, groundOf(r.roots[g])])),
      cross_hash: r.crossHash,
      cross_diverged: r.crossDiverged,
    })),
    negative_control: control,
    narration_distinct: narrationDistinct,
    llm_calls: CALL_COUNT,
    verdict: invariantCount === REPEATS ? "PASS" : "FAIL",
  };
  const reportPath = path.join(SESSION, `report-${MERGE_KIND}.yaml`);
  await fs.writeFile(reportPath, stringifyYaml(report));
  console.log(`\n[proof] llm_calls=${CALL_COUNT}  report=${reportPath}`);
  console.log(`[proof] VERDICT (${MERGE_KIND}): ${report.verdict} (${invariantCount}/${REPEATS} runs invariant)`);
}

async function main(): Promise<void> {
  if (MODE === "scout") {
    await scout();
    return;
  }
  if (MODE === "run") {
    await run();
    return;
  }
  throw new Error(`REDUCE_PROOF_MODE=${MODE} unknown (use scout | run)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
