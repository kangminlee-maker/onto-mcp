/**
 * Layer-2 FUNCTIONAL real-path E2E (owner-approved scope: 기능 실경로 E2E — NOT quality re-measurement,
 * which design §9 already did and bans). Proves the REAL product module accumulateSemanticMap +
 * reconcileBoundaries + all fail-closed validators + projectSemanticMapToSeed run end-to-end on a REAL
 * reduce trace built from REAL persisted 101MB-workbook value tiles (누적#13, 98 non-empty segments =
 * genuinely over-context) — with REAL LLM synthesize/verify in the live arm. The by-construction unit
 * tests only ever exercised MOCK output; §9's claim-m-semantic.mts BYPASSED this module entirely (it
 * re-implemented a hierarchical reduce). This closes that gap: does real LLM output survive the real
 * module's honesty / taint / frontier / projection validators?
 *
 * SOURCE-SAFE: the LLM sees only deterministic structural facts (value-shape clusters + seam rows +
 * child summaries) — never a raw cell value / formatCode (leaf-reader discipline, enforced by
 * assertSynthesisInputBounded inside the module).
 *
 * FALSIFIABLE: negative controls (LLM-0) prove the module THROWS on malformed output, so a green run
 * could have failed — not a vacuous pass.
 *
 *   npx tsx scripts/l2e2e.mts                       # mock arm + negative controls (LLM-0)
 *   L2_MODE=live npx tsx scripts/l2e2e.mts          # real LLM synthesize/verify (bounded, monthly budget)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { buildColumnLeaves, reduceColumnLeavesWithTrace, reduceNodeKey } from "../src/core-runtime/reconstruct/comprehension-reduce.ts";
import type { ColumnValueTiles } from "../src/core-runtime/spreadsheet-structure-observer.ts";
import {
  accumulateSemanticMap,
  projectSemanticMapToSeed,
  type SemanticSynthesisFn,
  type SemanticSynthesisInput,
  type SemanticSynthesisOutput,
  type AdversarialVerifyFn,
  type ComprehensionSemanticNode,
  type FrontierMode,
} from "../src/core-runtime/reconstruct/comprehension-semantic-map.ts";
import { classifyFrontier } from "../src/core-runtime/reconstruct/comprehension-semantic-map.ts";
import { callLlm, resolveLlmProviderConfig } from "../src/core-runtime/llm/llm-caller.ts";
import { resolveReconstructActorLlmSettings, resolveSettingsChain } from "../src/core-runtime/discovery/settings-chain.ts";

const REPO_MAIN = "/Users/kangmin/cowork/onto-mcp-claude";
const OBS = process.env.L2_OBS ?? path.join(REPO_MAIN, ".onto/reconstruct/abprobe-A-with/source-observations.yaml");
const MODE = process.env.L2_MODE ?? "mock";
const SHEET = process.env.L2_SHEET ?? "누적";
const COL = Number(process.env.L2_COL ?? "13");
const LEAVES = Number(process.env.L2_LEAVES ?? "8");
const FANIN = Number(process.env.L2_FANIN ?? "2");
const BUDGET = Number(process.env.L2_BUDGET ?? "2");
const MAX_CALLS = Number(process.env.L2_MAX_CALLS ?? "24");
const SESSION = path.join(REPO_MAIN, ".onto/reconstruct/l2-functional-e2e");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ── load a REAL column's value tiles from the persisted observation ──────────────────────────────
function findArray(node: unknown, key: string, out: unknown[]): void {
  if (Array.isArray(node)) { for (const x of node) findArray(x, key, out); return; }
  if (node && typeof node === "object") for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === key && Array.isArray(v)) { for (const x of v) out.push(x); } else findArray(v, key, out);
  }
}
async function loadColumn(): Promise<ColumnValueTiles> {
  const obs = parseYaml(await fs.readFile(OBS, "utf8"));
  const blocks: any[] = []; findArray(obs, "segmented_value_tiles", blocks);
  const block = blocks.find((b) => b.sheet === SHEET);
  if (!block) throw new Error(`sheet ${SHEET} has no segmented_value_tiles`);
  const col = (block.columns ?? []).find((c: any) => c.column_index === COL);
  if (!col) throw new Error(`column ${COL} not found in ${SHEET}`);
  return { column_index: col.column_index, segments: col.segments ?? [], segments_capped: !!col.segments_capped, intra_tile_notes: col.intra_tile_notes ?? [] };
}

// ── LLM plumbing (reused from claim-m-semantic.mts — the working §9 route) ────────────────────────
let CALL = 0; let CFG: Record<string, unknown> | null = null;
async function cfg() {
  if (CFG) return CFG;
  const settings = await resolveSettingsChain(REPO_MAIN, REPO_MAIN);
  const a = resolveReconstructActorLlmSettings(settings, "semantic_author");
  const c = resolveLlmProviderConfig({ config: { llm: a } }) as Record<string, unknown>;
  CFG = { ...c, max_tokens: 1500 };
  console.log(`[l2e2e] live route: provider=${c.provider} model=${c.model_id ?? (c as any).model}`);
  return CFG;
}
function extractJson(t: string): Record<string, unknown> {
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error(`no JSON in: ${t.slice(0, 160)}`);
  return JSON.parse(t.slice(a, b + 1));
}
async function ask(sys: string, user: string): Promise<Record<string, unknown>> {
  CALL += 1;
  if (CALL > MAX_CALLS) throw new Error(`LLM call cap ${MAX_CALLS} exceeded`);
  const r = await callLlm(sys, user, (await cfg()) as never);
  return extractJson((r as { text: string }).text);
}

const SYNTH_SYS =
  "You read the DETERMINISTIC structural profile of a spreadsheet column REGION — its value-shape " +
  "clusters, its shape-transition seam rows, and its child-region summaries — and produce a semantic " +
  "reading. Output ONLY JSON {\"semantic_summary\":\"<=300 chars, what this region likely represents\"," +
  "\"boundaries\":[{\"row\":<int in the region>,\"character_before\":\"<=30 chars\",\"character_after\":" +
  "\"<=30 chars\"}]}. Propose 0-3 boundaries where the region's MEANING shifts. A boundary MAY coincide " +
  "with a shape-transition seam OR fall elsewhere (a pure meaning shift with no structural signal). " +
  "You NEVER see raw cell values — reason only from the shapes/seams given.";
const VERIFY_SYS =
  "You INDEPENDENTLY re-check ONE proposed semantic boundary that has NO structural corroboration (no " +
  "value-shape seam co-locates with it). Decide if the region's meaning genuinely shifts at that row. " +
  "Output ONLY JSON {\"result\":\"adversarial_confirmed\"} or {\"result\":\"adversarial_refuted\"}.";

// ── mock realizations (deterministic, LLM-0) — exercise anchored + unanchored + confirmed + refuted ──
const mockSynthesize: SemanticSynthesisFn = (input: SemanticSynthesisInput): SemanticSynthesisOutput => {
  const seamRows = new Set(input.value_shape_seams.map((s) => s.row));
  const boundaries: SemanticSynthesisOutput["boundaries"] = [];
  const firstSeam = input.value_shape_seams[0];
  if (firstSeam) boundaries.push({ row: firstSeam.row, character_before: "prev", character_after: "next" }); // → anchored
  // a row guaranteed NOT within ±1 of any seam → unanchored (exercise the case-2 blind-structure path).
  let r = input.node_ref.row_start;
  while (r <= input.node_ref.row_end && [...seamRows].some((s) => Math.abs(s - r) <= 1)) r += 3;
  if (r <= input.node_ref.row_end) boundaries.push({ row: r, character_before: "u", character_after: "v" });
  return { semantic_summary: `mock region ${reduceNodeKey(input.node_ref)} clusters=${input.format_clusters.join("/")} seams=${input.value_shape_seams.length} children=${input.child_summaries.length}`, boundaries };
};
let MOCK_VERIFY_N = 0;
// Alternate confirmed/refuted so BOTH seed dispositions (adversarial_confirmed kept + adversarial_refuted
// excluded→disclosed→taint) are exercised deterministically, independent of the picked row parity.
const mockVerify: AdversarialVerifyFn = () => (MOCK_VERIFY_N++ % 2 === 0 ? "adversarial_confirmed" : "adversarial_refuted");

// The module's synthesize/verify are SYNC; the live LLM is async. We PRE-COMPUTE every node's live
// output by walking the same frontier partition the module uses, then feed sync closures that read the
// precomputed map. (Order-independent: keyed by node.)
type LiveOut = { out: SemanticSynthesisOutput; verifyByRow: Map<number, "adversarial_confirmed" | "adversarial_refuted"> };

function summarizeInput(input: SemanticSynthesisInput): string {
  return JSON.stringify({
    node_ref: input.node_ref,
    format_clusters: input.format_clusters,
    value_shape_seams: input.value_shape_seams,
    child_summaries: input.child_summaries.map((c) => ({ key: c.key, summary: c.summary })),
  }, null, 2);
}

async function main() {
  await fs.mkdir(SESSION, { recursive: true });
  const column = await loadColumn();
  const leaves = buildColumnLeaves(SHEET, column, { leafCount: LEAVES });
  if (leaves.length === 0) throw new Error("no leaves (column all-empty?)");
  const { trace, nodesByKey } = reduceColumnLeavesWithTrace(leaves, FANIN);
  const modes = classifyFrontier(trace, BUDGET);
  const modeCount: Record<FrontierMode, number> = { accumulating: 0, frontier: 0, subsumed: 0 };
  for (const m of modes.values()) modeCount[m] += 1;
  console.log(`[l2e2e] REAL tree: ${SHEET}#${COL} leaves=${leaves.length} nodes=${trace.nodes.size} fanin=${FANIN} budget=${BUDGET}`);
  console.log(`[l2e2e] frontier partition: accumulating=${modeCount.accumulating} frontier=${modeCount.frontier} subsumed=${modeCount.subsumed}`);

  const preImageBase = {
    reduce_reader_model_identity: MODE === "live" ? String((await cfg()).model_id ?? (await cfg()).model ?? "live") : "mock-deterministic",
    reduce_prompt_sha256: sha(SYNTH_SYS),
    reduce_schema_tool_version: "l2e2e-1",
    comprehension_version: "e2e",
    over_context_gate_config_sha256: sha("frontier-leaf-count-gate"),
    over_context_gate_logic_sha256: sha("classifyFrontier@320b530"),
  };

  // Assemble synthesize/verify closures.
  let synthesize: SemanticSynthesisFn;
  let verifyUnanchored: AdversarialVerifyFn;
  if (MODE === "mock") {
    synthesize = mockSynthesize;
    verifyUnanchored = mockVerify;
  } else {
    // Pre-run: walk the frontier partition ourselves to pre-compute each node's live LLM output BEFORE
    // the sync module walk. Mirror the module's produced/subsumed rule so we only spend calls on
    // produced nodes.
    const liveByKey = new Map<string, LiveOut>();
    // bottom-up: leaves first. Reuse a topological order via repeated scan (small tree).
    const order: string[] = [];
    const seen = new Set<string>();
    const walk = (k: string) => {
      if (seen.has(k)) return;
      const t = trace.nodes.get(k)!;
      for (const c of t.child_keys) walk(c);
      seen.add(k); order.push(k);
    };
    walk(trace.root_key);
    const summaryByKey = new Map<string, string>();
    for (const key of order) {
      const mode = modes.get(key)!;
      const t = trace.nodes.get(key)!;
      const rn = nodesByKey.get(key)!;
      if (mode === "subsumed") { summaryByKey.set(key, ""); continue; }
      const isFrontier = mode === "frontier";
      const seams = rn.boundaries.filter((b) => b.boundary_kind === "value_shape")
        .map((b) => ({ row: b.first_new_format_row, prev_shape: b.prev_shape, new_shape: b.new_shape }))
        .sort((a, b) => a.row - b.row);
      const dedupSeams = seams.filter((s, i) => i === 0 || s.row !== seams[i - 1].row || s.prev_shape !== seams[i - 1].prev_shape || s.new_shape !== seams[i - 1].new_shape);
      const childSummaries = isFrontier ? [] : t.child_keys.filter((c) => modes.get(c) !== "subsumed").map((c) => ({ key: c, summary: summaryByKey.get(c) ?? "" }));
      const synthInput: SemanticSynthesisInput = {
        node_ref: { sheet: rn.region.sheet, column_index: rn.region.column_index, row_start: rn.region.row_start, row_end: rn.region.row_end },
        format_clusters: [...rn.format_clusters].sort(),
        value_shape_seams: dedupSeams,
        child_summaries: childSummaries,
      };
      const rawOut = await ask(SYNTH_SYS, summarizeInput(synthInput));
      const boundaries = (Array.isArray(rawOut.boundaries) ? rawOut.boundaries : []).slice(0, 3).map((b: any) => ({
        row: Number(b?.row), character_before: String(b?.character_before ?? "").slice(0, 30), character_after: String(b?.character_after ?? "").slice(0, 30),
      })).filter((b: any) => Number.isSafeInteger(b.row));
      const out: SemanticSynthesisOutput = { semantic_summary: String(rawOut.semantic_summary ?? "").slice(0, 300), boundaries };
      summaryByKey.set(key, out.semantic_summary);
      // pre-verify unanchored boundaries (row not within ±1 of a seam).
      const verifyByRow = new Map<number, "adversarial_confirmed" | "adversarial_refuted">();
      for (const b of boundaries) {
        const anchored = dedupSeams.some((s) => Math.abs(s.row - b.row) <= 1);
        if (anchored) continue;
        const v = await ask(VERIFY_SYS, JSON.stringify({ node_ref: synthInput.node_ref, boundary: b, summary: out.semantic_summary }, null, 2));
        verifyByRow.set(b.row, v.result === "adversarial_confirmed" ? "adversarial_confirmed" : "adversarial_refuted");
      }
      liveByKey.set(key, { out, verifyByRow });
    }
    synthesize = (input) => {
      const key = reduceNodeKey(input.node_ref);
      const pre = liveByKey.get(key);
      if (!pre) throw new Error(`no precomputed live output for ${key}`);
      return pre.out;
    };
    verifyUnanchored = ({ node_ref, boundary }) => {
      const key = reduceNodeKey(node_ref);
      const pre = liveByKey.get(key);
      const v = pre?.verifyByRow.get(boundary.row);
      // If the live verifier didn't cover this row, fail-closed conservatively (refuted).
      return v ?? "adversarial_refuted";
    };
  }

  // ── the REAL module call ──────────────────────────────────────────────────────────────────────
  const map = accumulateSemanticMap(trace, nodesByKey, { synthesize, verifyUnanchored, preImageBase, overContextBudget: BUDGET, seedBound: false });
  const seed = projectSemanticMapToSeed(map, { maxNodes: 100, maxDisclosure: 100 });

  // ── census over the REAL result ─────────────────────────────────────────────────────────────────
  let anchored = 0, unanchored = 0, confirmed = 0, refuted = 0, produced = 0, subsumed = 0;
  for (const n of map.values()) {
    if (n.reduce_read_attempt === "subsumed") { subsumed += 1; continue; }
    produced += 1;
    for (const b of n.semantic_boundaries) {
      if (b.anchor_status === "anchored") anchored += 1;
      else { unanchored += 1; if (b.verification === "adversarial_confirmed") confirmed += 1; else if (b.verification === "adversarial_refuted") refuted += 1; }
    }
  }
  const rootKey = trace.root_key;
  const rootTaint = (map.get(rootKey) as ComprehensionSemanticNode).unanchored_unverified_count;

  // ── ASSERTIONS (positive, falsifiable) ─────────────────────────────────────────────────────────
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  const ck = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  ck("reachability: map covers every trace node", map.size === trace.nodes.size, `${map.size}/${trace.nodes.size}`);
  ck("over-context partition exercised (accum+frontier+subsumed > 0)", modeCount.accumulating > 0 && modeCount.frontier > 0 && modeCount.subsumed > 0, JSON.stringify(modeCount));
  ck("anchored path exercised (real seam co-located a boundary)", anchored > 0, `anchored=${anchored}`);
  ck("unanchored+adversarial path exercised (structure-blind)", unanchored > 0 && confirmed + refuted === unanchored, `unanchored=${unanchored} confirmed=${confirmed} refuted=${refuted}`);
  ck("seed projection honest + authoritative totals", seed.authority === "non_authoritative" && seed.provisional === true && seed.nodes_total >= 0, `nodes_total=${seed.nodes_total} refuted_total=${seed.refuted_disclosure_total}`);
  ck("taint census self-consistent (root >= refuted+failed at root subtree)", rootTaint >= seed.unanchored_unverified_total - 0, `rootTaint=${rootTaint} projTaint=${seed.unanchored_unverified_total}`);

  // ── NEGATIVE CONTROLS (LLM-0) — prove the module CAN fail (green is not vacuous) ────────────────
  const nc: { name: string; threw: boolean; msg: string }[] = [];
  const expectThrow = (name: string, fn: () => void) => {
    try { fn(); nc.push({ name, threw: false, msg: "DID NOT THROW ❌" }); }
    catch (e) { nc.push({ name, threw: true, msg: String((e as Error).message).slice(0, 90) }); }
  };
  // NC1: synthesize emits an extra field → assertSynthesisOutputBounded must fail closed.
  expectThrow("NC1 extra output field → source-safe envelope throws", () =>
    accumulateSemanticMap(trace, nodesByKey, { synthesize: (input) => ({ ...mockSynthesize(input), sneaky_raw_value: "SECRET" } as any), verifyUnanchored: mockVerify, preImageBase, overContextBudget: BUDGET }));
  // NC2: verifier returns a bogus status → fail-closed enum throws.
  expectThrow("NC2 bogus verifier status → fail-closed enum throws", () =>
    accumulateSemanticMap(trace, nodesByKey, { synthesize: mockSynthesize, verifyUnanchored: (() => "totally_bogus") as any, preImageBase, overContextBudget: BUDGET }));
  // NC3: tampered nodesByKey (ground mismatch vs trace) → mismatch throws.
  expectThrow("NC3 tampered nodesByKey ground → mismatch throws", () => {
    const tampered = new Map(nodesByKey);
    const victim = [...tampered.values()][0];
    tampered.set(reduceNodeKey(victim.region), { ...victim, format_clusters: [...victim.format_clusters, "TAMPER_INJECTED"] });
    accumulateSemanticMap(trace, tampered, { synthesize: mockSynthesize, verifyUnanchored: mockVerify, preImageBase, overContextBudget: BUDGET });
  });
  // NC4 negative-of-negative: budget = NaN → fail-closed (proves the guard, not the value).
  expectThrow("NC4 NaN budget → fail-closed", () =>
    accumulateSemanticMap(trace, nodesByKey, { synthesize: mockSynthesize, verifyUnanchored: mockVerify, preImageBase, overContextBudget: NaN }));

  const allPass = checks.every((c) => c.pass);
  const allThrew = nc.every((c) => c.threw);
  console.log(`\n[l2e2e] ===== positive assertions (${MODE} arm) =====`);
  for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}  [${c.detail}]`);
  console.log(`[l2e2e] ===== negative controls (LLM-0; must ALL throw) =====`);
  for (const c of nc) console.log(`  ${c.threw ? "✅ threw" : "❌ SILENT"} ${c.name}  — ${c.msg}`);
  console.log(`\n[l2e2e] boundary census: anchored=${anchored} unanchored=${unanchored} (confirmed=${confirmed} refuted=${refuted})  produced=${produced} subsumed=${subsumed}`);
  console.log(`[l2e2e] seed: nodes_total=${seed.nodes_total} refuted_disclosure_total=${seed.refuted_disclosure_total} taint=${seed.unanchored_unverified_total}`);
  console.log(`[l2e2e] llm_calls=${CALL}`);
  console.log(`[l2e2e] VERDICT: positive=${allPass ? "PASS ✅" : "FAIL ❌"}  negative-controls=${allThrew ? "ALL-THREW ✅" : "SILENT-PASS DETECTED ❌"}`);

  const report = {
    probe: "Layer-2 functional real-path E2E (accumulateSemanticMap + validators + projection on a REAL reduce trace)",
    mode: MODE, source: `${SHEET}#${COL} (real persisted value tiles, 98 non-empty segments)`,
    tree: { leaves: leaves.length, nodes: trace.nodes.size, fanin: FANIN, over_context_budget: BUDGET, frontier_partition: modeCount },
    boundary_census: { anchored, unanchored, adversarial_confirmed: confirmed, adversarial_refuted: refuted, produced_nodes: produced, subsumed_nodes: subsumed },
    seed_projection: { nodes_total: seed.nodes_total, refuted_disclosure_total: seed.refuted_disclosure_total, taint: seed.unanchored_unverified_total, authority: seed.authority, provisional: seed.provisional },
    positive_checks: checks, negative_controls: nc,
    verdict: { positive_all_pass: allPass, negative_controls_all_threw: allThrew }, llm_calls: CALL,
  };
  const rp = path.join(SESSION, `report-${MODE}.yaml`);
  await fs.writeFile(rp, stringifyYaml(report));
  console.log(`[l2e2e] report=${rp}`);
  if (!allPass || !allThrew) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
