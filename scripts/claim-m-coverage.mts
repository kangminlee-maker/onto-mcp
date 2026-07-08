/**
 * Claim-M over-context coverage probe (design §5 Claim M; tenet 2 = accumulation only earns its keep
 * when input exceeds one LLM window). Prior in-context probes were the WRONG regime (flat trivially
 * wins). Here the input is over-context: a 133-column sheet whose full per-column detail does not fit a
 * single call. We measure whether the ACCUMULATED (tile → chunk-read → synthesize) arm exhaustively and
 * FAITHFULLY recovers the sheet's full deterministic column structure that a truncated flat call cannot.
 *
 * The point is NOT "B covers more than A" (preordained — A is truncated). The measured, non-trivial
 * signals are B's FAITHFULNESS: does the reduce silently DROP columns up the tree (R6), does it
 * HALLUCINATE, and does it actually READ the tiles (shuffle control) rather than echo priors.
 *
 * GOLD (deterministic): the sheet's full column list {index, name, type} — known completely.
 * ARMS:
 *   A (flat-truncated): sees only the first TRUNC columns → coverage ceiling = TRUNC/N (the over-context gap).
 *   B (accumulated):    columns tiled into chunks → per-chunk read → one synthesis merging all chunks.
 *   B-shuffled (control): B, but each column's name/type rotated +1 → faithful B reports shifted names →
 *                         they mismatch the real gold → coverage must DROP (else B ignores tiles = gameable).
 * SCORING (deterministic): a column is COVERED iff the proposal has its index with a name matching the
 *   real name (normalized). coverage = covered/N ; hallucination = proposed indices out of range or dup.
 *
 *   npx tsx scripts/claim-m-coverage.mts                              # scout (LLM-0)
 *   CLAIM_M_MODE=run CLAIM_M_ARM=mock npx tsx scripts/claim-m-coverage.mts   # scoring plumbing (LLM-0)
 *   CLAIM_M_MODE=run npx tsx scripts/claim-m-coverage.mts             # LIVE
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { callLlm, resolveLlmProviderConfig } from "../src/core-runtime/llm/llm-caller.ts";
import { resolveReconstructActorLlmSettings, resolveSettingsChain } from "../src/core-runtime/discovery/settings-chain.ts";

const REPO = "/Users/kangmin/cowork/onto-mcp-claude";
const OBS = process.env.CLAIM_M_OBS ?? path.join(REPO, ".onto/reconstruct/abprobe-A-with/source-observations.yaml");
const MODE = process.env.CLAIM_M_MODE ?? "scout";
const ARM = process.env.CLAIM_M_ARM ?? "live";
const SHEET = process.env.CLAIM_M_SHEET ?? "누적";
const TRUNC = Number(process.env.CLAIM_M_TRUNC ?? "25");
const CHUNK = Number(process.env.CLAIM_M_CHUNK ?? "22");
const REPEATS = Number(process.env.CLAIM_M_REPEATS ?? "1");
const MAX_CALLS = Number(process.env.CLAIM_M_MAX_CALLS ?? "60");
const SESSION = path.join(REPO, ".onto/reconstruct/claim-m-coverage");

type Col = { index: number; name: string; type?: string };

function findArray(node: unknown, key: string, out: unknown[]): void {
  if (Array.isArray(node)) { for (const x of node) findArray(x, key, out); return; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key && Array.isArray(v)) { for (const x of v) out.push(x); } else findArray(v, key, out);
    }
  }
}
async function loadCols(): Promise<Col[]> {
  const t0 = Date.now();
  console.log(`[cov] parsing ${OBS} …`);
  const raw = await fs.readFile(OBS, "utf8");
  const obs = parseYaml(raw);
  console.log(`[cov] parsed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const ps: any[] = []; findArray(obs, "per_sheet_data", ps);
  const s = ps.find((x) => x.sheet === SHEET);
  if (!s) throw new Error(`sheet ${SHEET} not found`);
  return (s.columns ?? []).map((c: any) => ({ index: c.index, name: String(c.name ?? `col${c.index}`), type: c.inferred_type }));
}
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// ── LLM plumbing ──
let CALL = 0; let CFG: Record<string, unknown> | null = null;
async function cfg() {
  if (CFG) return CFG;
  const settings = await resolveSettingsChain(REPO, REPO);
  const a = resolveReconstructActorLlmSettings(settings, "semantic_author");
  const c = resolveLlmProviderConfig({ config: { llm: a } }) as Record<string, unknown>;
  CFG = { ...c, max_tokens: 4000 };
  console.log(`[cov] route: provider=${c.provider} model=${c.model_id ?? (c as any).model} adapter=${(c as any).execution_adapter}`);
  return CFG;
}
function extractJson(t: string): Record<string, unknown> {
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error(`no JSON: ${t.slice(0, 160)}`);
  return JSON.parse(t.slice(a, b + 1));
}
async function ask(sys: string, user: string): Promise<Record<string, unknown>> {
  CALL += 1;
  if (CALL > MAX_CALLS) throw new Error(`cap ${MAX_CALLS} exceeded`);
  const r = await callLlm(sys, user, (await cfg()) as never);
  return extractJson((r as { text: string }).text);
}
function parseCols(raw: Record<string, unknown>): { index: number; name: string }[] {
  const arr = Array.isArray(raw.columns) ? (raw.columns as any[]) : [];
  return arr.map((c) => ({ index: Number(c?.index), name: String(c?.name ?? "") })).filter((c) => Number.isFinite(c.index));
}

const READ_SYS = "You characterize spreadsheet columns. For EVERY column given, output its index, its EXACT name " +
  '(verbatim from input), and a one-word role. Output ONLY JSON {"columns":[{"index":<int>,"name":"<verbatim>","role":"<word>"}]}. ' +
  "Do not omit, merge, invent, or renumber any column.";
const SYNTH_SYS = "You merge per-chunk column lists into ONE complete list covering EVERY column from ALL chunks. " +
  'Preserve every index and its EXACT name. Omit nothing. Output ONLY JSON {"columns":[{"index":<int>,"name":"<verbatim>","role":"<word>"}]}.';

async function armFlatTrunc(cols: Col[]): Promise<{ index: number; name: string }[]> {
  const seen = cols.slice(0, TRUNC);
  if (ARM === "mock") return seen.map((c) => ({ index: c.index, name: c.name }));
  return parseCols(await ask(READ_SYS, JSON.stringify({ note: `these are the first ${TRUNC} of many columns`, columns: seen }, null, 2)));
}
// FANIN=999 → all chunk outputs merged in ONE synthesis (shallow, 1 reduce level). FANIN=3 →
// HIERARCHICAL merge (chunk → mid → root), depth ~log_FANIN(#chunks) — stresses R6 silent-drop / error
// accumulation up a DEEP tree (the cross-validation's central worry; the shallow probe could not see it).
const FANIN = Number(process.env.CLAIM_M_FANIN ?? "999");
let TREE_DEPTH = 0;
async function armAccumulated(cols: Col[]): Promise<{ index: number; name: string }[]> {
  if (ARM === "mock") return cols.map((c) => ({ index: c.index, name: c.name }));
  let level: { index: number; name: string }[][] = [];
  for (let i = 0; i < cols.length; i += CHUNK) {
    level.push(parseCols(await ask(READ_SYS, JSON.stringify({ columns: cols.slice(i, i + CHUNK) }, null, 2))));
  }
  let depth = 0;
  while (level.length > 1) {
    const next: { index: number; name: string }[][] = [];
    for (let i = 0; i < level.length; i += FANIN) {
      const group = level.slice(i, i + FANIN);
      if (group.length === 1) { next.push(group[0]); continue; }
      next.push(parseCols(await ask(SYNTH_SYS, JSON.stringify({ chunks: group }, null, 2))));
    }
    level = next; depth += 1;
  }
  TREE_DEPTH = depth;
  return level[0] ?? [];
}
/** control: rotate each column's NAME/TYPE onto the next index; faithful B reports shifted → mismatch gold. */
function shuffleCols(cols: Col[]): Col[] {
  const n = cols.length;
  return cols.map((c, i) => ({ index: c.index, name: cols[(i + 1) % n].name, type: cols[(i + 1) % n].type }));
}

function score(proposed: { index: number; name: string }[], gold: Col[]) {
  const byIdx = new Map(gold.map((c) => [c.index, norm(c.name)]));
  const seenIdx = new Set<number>();
  let covered = 0, halluc = 0;
  for (const p of proposed) {
    if (seenIdx.has(p.index)) { halluc += 1; continue; }
    seenIdx.add(p.index);
    const g = byIdx.get(p.index);
    if (g === undefined) { halluc += 1; continue; }
    if (norm(p.name) === g) covered += 1;
  }
  return { coverage: covered / gold.length, covered, total: gold.length, proposed: proposed.length, hallucination: halluc };
}

async function run(): Promise<void> {
  await fs.mkdir(SESSION, { recursive: true });
  const cols = await loadCols();
  console.log(`\n[cov] sheet=${SHEET} columns=${cols.length}  (A sees first ${TRUNC}; B tiles in chunks of ${CHUNK} = ${Math.ceil(cols.length / CHUNK)} chunks)`);
  if (cols.length <= TRUNC) throw new Error(`not over-context: ${cols.length} <= TRUNC ${TRUNC}`);

  const runs: any[] = [];
  for (let i = 0; i < REPEATS; i += 1) {
    const a = await armFlatTrunc(cols);
    const b = await armAccumulated(cols);
    const c = await armAccumulated(shuffleCols(cols));
    const sA = score(a, cols), sB = score(b, cols), sC = score(c, cols);
    runs.push({ run: i + 1, A: sA, B: sB, B_shuffled: sC });
    console.log(`\n[cov] === run ${i + 1}/${REPEATS} ===`);
    console.log(`   A (flat-truncated) coverage=${sA.coverage.toFixed(2)} (${sA.covered}/${sA.total})  proposed=${sA.proposed}  halluc=${sA.hallucination}`);
    console.log(`   B (accumulated)    coverage=${sB.coverage.toFixed(2)} (${sB.covered}/${sB.total})  proposed=${sB.proposed}  halluc=${sB.hallucination}`);
    console.log(`   B-shuffled control coverage=${sC.coverage.toFixed(2)} (${sC.covered}/${sC.total})  proposed=${sC.proposed}  halluc=${sC.hallucination}`);
  }
  const avg = (f: (r: any) => number) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
  const cA = avg((r) => r.A.coverage), cB = avg((r) => r.B.coverage), cC = avg((r) => r.B_shuffled.coverage);
  const hB = avg((r) => r.B.hallucination);
  const faithful = cB >= 0.9 && hB <= cols.length * 0.02;
  const controlValid = cC < cB - 0.2;
  console.log(`\n[cov] ===== over-context coverage over ${REPEATS} run(s) (B tree: fanin=${FANIN === 999 ? "flat" : FANIN}, reduce-depth=${TREE_DEPTH}) =====`);
  console.log(`   avg coverage:  A(truncated)=${cA.toFixed(2)}  B(accumulated)=${cB.toFixed(2)}  B-shuffled=${cC.toFixed(2)}`);
  console.log(`   B exhaustive & faithful (cov≥0.9, halluc≤2%): ${faithful ? "yes ✅" : "NO ❌"}`);
  console.log(`   control valid (shuffle drops coverage): ${controlValid ? "yes ✅ (B genuinely reads tiles)" : "NO ⚠️"}`);
  console.log(`   → accumulation covers the over-context tail A cannot (${cA.toFixed(2)}→${cB.toFixed(2)}) ${faithful ? "WITHOUT silent drops/hallucination" : "BUT with drops/hallucination"}`);

  const report = { probe: "Claim M — over-context coverage faithfulness", arm: ARM, sheet: SHEET, columns: cols.length,
    trunc: TRUNC, chunk: CHUNK, repeats: REPEATS, avg: { cov_A: cA, cov_B: cB, cov_B_shuffled: cC, halluc_B: hB },
    faithful, control_valid: controlValid, runs, llm_calls: CALL };
  const rp = path.join(SESSION, `report-${ARM}.yaml`);
  await fs.writeFile(rp, stringifyYaml(report));
  console.log(`\n[cov] llm_calls=${CALL}  report=${rp}`);
}
async function scout(): Promise<void> {
  const cols = await loadCols();
  console.log(`[cov] sheet=${SHEET} columns=${cols.length} (over-context vs TRUNC=${TRUNC})`);
  console.log(`[cov] first 8: ${cols.slice(0, 8).map((c) => `${c.index}:${c.name}`).join(", ")}`);
  console.log(`[cov] last 5:  ${cols.slice(-5).map((c) => `${c.index}:${c.name}`).join(", ")}`);
}
async function main() {
  if (MODE === "scout") return scout();
  if (MODE === "run") return run();
  throw new Error(`CLAIM_M_MODE=${MODE} unknown`);
}
main().catch((e) => { console.error(e); process.exit(1); });
