/**
 * Claim-M probe — does the accumulated hierarchical semantic map beat flat leaf labels as
 * ontology-seed input? (design 20260701-reduce-merge-layer-boundary-design.md §5 Claim M / §8).
 *
 * SCOPE: the ONE grounded, non-gameable facet (owner-chosen metric ①) — CROSS-SHEET RELATIONSHIP
 * recovery. The accumulated map's unique claimed value is surfacing structure a single leaf can't see
 * (emergent cross-region relationships). We measure whether a workbook-level ACCUMULATION step (Arm B)
 * recovers the real cross-sheet key relationships better than a FLAT one-shot (Arm A), scored against a
 * DETERMINISTIC gold (cross_sheet_key_overlap) by EXACT sheet-pair matching — no soft judge.
 *
 * ARMS (both get the SAME per-sheet input = deterministic columns + one LLM per-sheet summary; differ
 * ONLY in the extra accumulation step):
 *   A (flat):        one call → propose cross-sheet relationships from the flat list of sheet summaries.
 *   B (accumulated): call 1 = workbook-level synthesis across the summaries (the extra hierarchical
 *                    step) → call 2 = propose relationships from that synthesis.
 * CONTROLS:
 *   B-shuffled: Arm B but per-sheet key columns are DETERMINISTICALLY rotated across sheets so the true
 *               overlaps are broken → recall must DROP (else B is hallucinating regardless of signal).
 *   hallucination: proposed sheet-pairs NOT in gold (B must not win merely by proposing more).
 *
 * SCORING (deterministic): recall = |proposed ∩ gold| / |gold|; hallucination = |proposed \ gold|.
 * VERDICT (this facet): M supported iff recall_B > recall_A AND hallucination_B ≤ hallucination_A AND
 *   recall_B_shuffled < recall_B.
 *
 * FIXTURE: persisted real 101MB observation (.onto/reconstruct/abprobe-A-with/source-observations.yaml).
 *
 *   npx tsx scripts/claim-m-probe.mts                                 # scout (gold + subset, LLM-0)
 *   CLAIM_M_MODE=run CLAIM_M_ARM=mock npx tsx scripts/claim-m-probe.mts   # scoring plumbing (LLM-0)
 *   CLAIM_M_MODE=run npx tsx scripts/claim-m-probe.mts                # LIVE (real LLM)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { callLlm, resolveLlmProviderConfig } from "../src/core-runtime/llm/llm-caller.ts";
import {
  resolveReconstructActorLlmSettings,
  resolveSettingsChain,
} from "../src/core-runtime/discovery/settings-chain.ts";

const REPO = "/Users/kangmin/cowork/onto-mcp-claude";
const OBS = process.env.CLAIM_M_OBS ?? path.join(REPO, ".onto/reconstruct/abprobe-A-with/source-observations.yaml");
const MODE = process.env.CLAIM_M_MODE ?? "scout";
const ARM_KIND = process.env.CLAIM_M_ARM ?? "live"; // live | mock
const REPEATS = Number(process.env.CLAIM_M_REPEATS ?? "1");
const MAX_CALLS = Number(process.env.CLAIM_M_MAX_CALLS ?? "60");
const N_SHEETS = Number(process.env.CLAIM_M_SHEETS ?? "6");
const SESSION = path.join(REPO, ".onto/reconstruct/claim-m-probe");

type SheetCol = { name?: string; index: number; inferred_type?: string; distinct_count?: number };
type SheetData = { sheet: string; header_confidence?: string; columns?: SheetCol[] };
type OverlapKey = { key_name: string; sheets?: string[]; pairwise_overlap?: { a: string; b: string; count: number }[] };

function findArray(node: unknown, key: string, out: unknown[]): void {
  if (Array.isArray(node)) { for (const x of node) findArray(x, key, out); return; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key && Array.isArray(v)) { for (const x of v) out.push(x); }
      else findArray(v, key, out);
    }
  }
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

async function loadObs(): Promise<{ sheets: SheetData[]; overlaps: OverlapKey[] }> {
  const t0 = Date.now();
  console.log(`[claim-m] parsing ${OBS} …`);
  const raw = await fs.readFile(OBS, "utf8");
  const obs = parseYaml(raw);
  console.log(`[claim-m] parsed ${(raw.length / 1e6).toFixed(1)}MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const sheets: unknown[] = []; findArray(obs, "per_sheet_data", sheets);
  const overlaps: unknown[] = []; findArray(obs, "cross_sheet_key_overlap", overlaps);
  return { sheets: sheets as SheetData[], overlaps: overlaps as OverlapKey[] };
}

/** Deterministic gold: every sheet-pair that shares a key with a positive value overlap. */
function buildGold(overlaps: OverlapKey[]): Map<string, Set<string>> {
  const gold = new Map<string, Set<string>>(); // pairKey -> set of key_names
  for (const ov of overlaps) {
    for (const p of ov.pairwise_overlap ?? []) {
      if ((p.count ?? 0) <= 0) continue;
      const k = pairKey(p.a, p.b);
      if (!gold.has(k)) gold.set(k, new Set());
      gold.get(k)!.add(ov.key_name);
    }
  }
  return gold;
}

function pickSubset(sheets: SheetData[], gold: Map<string, Set<string>>): string[] {
  const freq = new Map<string, number>();
  for (const k of gold.keys()) for (const s of k.split("|")) freq.set(s, (freq.get(s) ?? 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map((e) => e[0]);
  const known = new Set(sheets.map((s) => s.sheet));
  return ranked.filter((s) => known.has(s)).slice(0, N_SHEETS);
}

function goldInSubset(gold: Map<string, Set<string>>, subset: string[]): Map<string, Set<string>> {
  const set = new Set(subset);
  const g = new Map<string, Set<string>>();
  for (const [k, keys] of gold) { const [a, b] = k.split("|"); if (set.has(a) && set.has(b)) g.set(k, keys); }
  return g;
}

function sheetFacts(sheets: SheetData[], subset: string[]) {
  const bySheet = new Map(sheets.map((s) => [s.sheet, s]));
  return subset.map((name) => {
    const s = bySheet.get(name);
    const cols = (s?.columns ?? []).slice(0, 40).map((c) => ({ name: c.name ?? `col${c.index}`, type: c.inferred_type }));
    return { sheet: name, header_confidence: s?.header_confidence, columns: cols };
  });
}

// ── LLM plumbing (mirrors reduce-proof-harness) ───────────────────────────────
let CALL_COUNT = 0;
let LIVE_CONFIG: Record<string, unknown> | null = null;
async function cfg(): Promise<Record<string, unknown>> {
  if (LIVE_CONFIG) return LIVE_CONFIG;
  const settings = await resolveSettingsChain(REPO, REPO);
  const actorLlm = resolveReconstructActorLlmSettings(settings, "semantic_author");
  const c = resolveLlmProviderConfig({ config: { llm: actorLlm } }) as Record<string, unknown>;
  LIVE_CONFIG = { ...c, max_tokens: 2000 };
  console.log(`[claim-m] route: provider=${c.provider} model=${c.model_id ?? (c as any).model} adapter=${(c as any).execution_adapter}`);
  return LIVE_CONFIG;
}
function extractJson(text: string): Record<string, unknown> {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error(`no JSON in: ${text.slice(0, 160)}`);
  return JSON.parse(text.slice(a, b + 1));
}
async function ask(system: string, user: string): Promise<Record<string, unknown>> {
  CALL_COUNT += 1;
  if (CALL_COUNT > MAX_CALLS) throw new Error(`call cap ${MAX_CALLS} exceeded`);
  const res = await callLlm(system, user, (await cfg()) as never);
  return extractJson((res as { text: string }).text);
}

// ── Arms ──────────────────────────────────────────────────────────────────────
type Facts = ReturnType<typeof sheetFacts>;
type Rel = { a: string; b: string };

const SUMMARY_SYS = "You summarize ONE spreadsheet sheet from its deterministic column facts. Output ONLY " +
  'JSON {"about":"<one phrase: what this sheet holds>","key_columns":["<column names that look like ids/keys/join columns>"]}. ' +
  "Use ONLY the given column names/types; do not invent columns.";
async function summarize(f: Facts[number]): Promise<Record<string, unknown>> {
  if (ARM_KIND === "mock") return { about: `sheet ${f.sheet}`, key_columns: f.columns.slice(0, 3).map((c) => c.name) };
  return ask(SUMMARY_SYS, JSON.stringify(f, null, 2));
}

const REL_SYS = "You propose CROSS-SHEET relationships for an ontology seed: which sheets are linked because " +
  "they share a join/key column (same column name appearing in both). Output ONLY JSON " +
  '{"relationships":[{"a":"<sheet>","b":"<sheet>","shared_key":"<column name>"}]}. Use ONLY the given sheet names.';

function relsFromRaw(raw: Record<string, unknown>, subset: string[]): Rel[] {
  const set = new Set(subset);
  const arr = Array.isArray(raw.relationships) ? (raw.relationships as any[]) : [];
  const seen = new Set<string>(); const out: Rel[] = [];
  for (const r of arr) {
    const a = String(r?.a ?? ""), b = String(r?.b ?? "");
    if (!set.has(a) || !set.has(b) || a === b) continue;
    const k = pairKey(a, b); if (seen.has(k)) continue; seen.add(k); out.push({ a, b });
  }
  return out;
}

async function armFlat(summaries: any[], subset: string[], gold: Map<string, Set<string>>): Promise<Rel[]> {
  if (ARM_KIND === "mock") { const g = [...gold.keys()]; return g.slice(0, Math.ceil(g.length / 2)).map((k) => ({ a: k.split("|")[0], b: k.split("|")[1] })); }
  const raw = await ask(REL_SYS, JSON.stringify({ sheets: summaries }, null, 2));
  return relsFromRaw(raw, subset);
}

const ACC_SYS = "You are the WORKBOOK-LEVEL accumulation step of a comprehension tree. Given per-sheet summaries, " +
  "cross-reference their key_columns ACROSS all sheets and state, for every column NAME that appears in 2+ sheets, " +
  "which sheets share it. Be systematic and exhaustive. Output ONLY JSON " +
  '{"shared_columns":[{"column":"<name>","sheets":["<sheet>","<sheet>"...]}]}.';
async function armAccumulate(summaries: any[], subset: string[], gold: Map<string, Set<string>>): Promise<Rel[]> {
  if (ARM_KIND === "mock") { const g = [...gold.keys()]; return g.map((k) => ({ a: k.split("|")[0], b: k.split("|")[1] })); }
  const synth = await ask(ACC_SYS, JSON.stringify({ sheets: summaries }, null, 2));
  const raw = await ask(REL_SYS, JSON.stringify({ sheets: summaries, workbook_shared_columns: synth.shared_columns ?? [] }, null, 2));
  return relsFromRaw(raw, subset);
}

/** B-shuffled control: keep each sheet's NAME but rotate ALL its described content (columns,
 *  key_columns, about) onto the next sheet — destroys the real cross-sheet column evidence, leaving
 *  only sheet-name priors. Recall must then DROP; residual recall = name-prior/hallucination, not the
 *  column-evidence reasoning the accumulation is supposed to add. */
function shuffleSummaries(summaries: any[]): any[] {
  const n = summaries.length;
  return summaries.map((s, i) => {
    const src = summaries[(i + 1) % n];
    return { sheet: s.sheet, columns: src.columns, key_columns: src.key_columns, about: src.about };
  });
}

function score(proposed: Rel[], gold: Map<string, Set<string>>) {
  const goldSet = new Set(gold.keys());
  const prop = new Set(proposed.map((r) => pairKey(r.a, r.b)));
  let hit = 0; for (const k of prop) if (goldSet.has(k)) hit += 1;
  const recall = goldSet.size === 0 ? 0 : hit / goldSet.size;
  const halluc = [...prop].filter((k) => !goldSet.has(k)).length;
  return { recall, hit, gold: goldSet.size, hallucination: halluc, proposed: prop.size };
}

async function run(): Promise<void> {
  await fs.mkdir(SESSION, { recursive: true });
  const { sheets, overlaps } = await loadObs();
  const goldAll = buildGold(overlaps);
  const subset = pickSubset(sheets, goldAll);
  const gold = goldInSubset(goldAll, subset);
  console.log(`\n[claim-m] subset (${subset.length} sheets): ${subset.join(", ")}`);
  console.log(`[claim-m] gold cross-sheet pairs in subset: ${gold.size}`);
  for (const [k, keys] of gold) console.log(`   ${k}  (shared: ${[...keys].join(", ")})`);
  if (gold.size < 2) throw new Error("VACUOUS: <2 gold pairs in subset — raise CLAIM_M_SHEETS");

  let facts = sheetFacts(sheets, subset);
  let subsetX = subset;
  let goldX = gold;
  const ANON = process.env.CLAIM_M_ANON === "1";
  if (ANON) {
    // Remove the sheet-NAME prior: rename sheets to Sheet1..N so the only cross-sheet signal is shared
    // COLUMN evidence (what accumulation is supposed to exploit). Map back for nothing — score in anon space.
    const anon: Record<string, string> = {};
    subset.forEach((s, i) => (anon[s] = `Sheet${i + 1}`));
    subsetX = subset.map((s) => anon[s]);
    facts = facts.map((f) => ({ ...f, sheet: anon[f.sheet] }));
    const g = new Map<string, Set<string>>();
    for (const [k, keys] of gold) { const [a, b] = k.split("|"); g.set(pairKey(anon[a], anon[b]), keys); }
    goldX = g;
    console.log(`[claim-m] ANON on: ${subset.map((s, i) => `${s}→Sheet${i + 1}`).join(", ")} (only column evidence remains)`);
  }
  const dump = (label: string, rels: Rel[]) => {
    const gs = new Set(goldX.keys());
    const marks = rels.map((r) => { const k = pairKey(r.a, r.b); return `${k}${gs.has(k) ? "" : "✗"}`; });
    console.log(`     ${label}: [${marks.join(", ")}]`);
  };

  const runs: any[] = [];
  for (let i = 0; i < REPEATS; i += 1) {
    const summaries = [];
    for (const f of facts) summaries.push({ sheet: f.sheet, columns: f.columns, ...(await summarize(f)) });
    const flat = await armFlat(summaries, subsetX, goldX);
    const acc = await armAccumulate(summaries, subsetX, goldX);
    const accShuf = await armAccumulate(shuffleSummaries(summaries), subsetX, goldX);
    const sA = score(flat, goldX), sB = score(acc, goldX), sC = score(accShuf, goldX);
    runs.push({ run: i + 1, A: sA, B: sB, B_shuffled: sC });
    console.log(`\n[claim-m] === run ${i + 1}/${REPEATS} ===`);
    console.log(`   A (flat)       recall=${sA.recall.toFixed(2)} (${sA.hit}/${sA.gold})  hallucination=${sA.hallucination}  proposed=${sA.proposed}`);
    console.log(`   B (accumulated) recall=${sB.recall.toFixed(2)} (${sB.hit}/${sB.gold})  hallucination=${sB.hallucination}  proposed=${sB.proposed}`);
    console.log(`   B-shuffled ctrl recall=${sC.recall.toFixed(2)} (${sC.hit}/${sC.gold})  hallucination=${sC.hallucination}`);
    dump("A pairs", flat); dump("B pairs", acc); dump("B-shuf pairs", accShuf);
  }

  const avg = (f: (r: any) => number) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
  const rA = avg((r) => r.A.recall), rB = avg((r) => r.B.recall), rC = avg((r) => r.B_shuffled.recall);
  const hA = avg((r) => r.A.hallucination), hB = avg((r) => r.B.hallucination);
  const supported = rB > rA && hB <= hA && rC < rB;
  const controlValid = rC < rB;
  console.log(`\n[claim-m] ===== Claim M (relationship-recovery facet) over ${REPEATS} run(s) =====`);
  console.log(`   avg recall:  A=${rA.toFixed(2)}  B=${rB.toFixed(2)}  B-shuffled=${rC.toFixed(2)}`);
  console.log(`   avg halluc:  A=${hA.toFixed(1)}  B=${hB.toFixed(1)}`);
  console.log(`   control valid (B-shuffled < B): ${controlValid ? "yes ✅" : "NO ⚠️ (measurement gameable)"}`);
  console.log(`   VERDICT: ${supported ? "M SUPPORTED ✅ (B>A recall, no worse hallucination, control holds)" : "M NOT SUPPORTED ❌"}`);

  const report = {
    probe: "Claim M — cross-sheet relationship recovery (metric ①)", arm_kind: ARM_KIND,
    fixture: OBS, subset, gold_pairs: [...gold.keys()], repeats: REPEATS,
    avg: { recall_A: rA, recall_B: rB, recall_B_shuffled: rC, halluc_A: hA, halluc_B: hB },
    control_valid: controlValid, verdict: supported ? "SUPPORTED" : "NOT_SUPPORTED", runs, llm_calls: CALL_COUNT,
  };
  const rp = path.join(SESSION, `report-${ARM_KIND}.yaml`);
  await fs.writeFile(rp, stringifyYaml(report));
  console.log(`\n[claim-m] llm_calls=${CALL_COUNT}  report=${rp}`);
}

async function scout(): Promise<void> {
  const { sheets, overlaps } = await loadObs();
  const goldAll = buildGold(overlaps);
  const subset = pickSubset(sheets, goldAll);
  const gold = goldInSubset(goldAll, subset);
  console.log(`[claim-m] sheets=${sheets.length} overlap-keys=${overlaps.length} gold-pairs(all)=${goldAll.size}`);
  console.log(`[claim-m] subset (${subset.length}): ${subset.join(", ")}`);
  console.log(`[claim-m] gold pairs in subset: ${gold.size}`);
  for (const [k, keys] of gold) console.log(`   ${k}  (shared: ${[...keys].join(", ")})`);
}

async function main(): Promise<void> {
  if (MODE === "scout") return scout();
  if (MODE === "run") return run();
  throw new Error(`CLAIM_M_MODE=${MODE} unknown (scout | run)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
