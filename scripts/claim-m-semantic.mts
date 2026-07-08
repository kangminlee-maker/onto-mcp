/**
 * Claim-M semantic-fidelity probe (design §9 follow-up; the semantic-quality side of Claim M).
 *
 * In the over-context regime B beats A on anything coverage-driven (established). The genuinely NEW,
 * gradable question is the RISK side the cross-validation flagged (case-2): does the ACCUMULATED
 * thematic map INVENT semantic structure not supported by the data, or stay faithful? We ground it:
 * each column has a DETERMINISTIC role from its inferred_type (date→temporal, string→identity,
 * integer/number→measure). Both arms propose high-level THEMATIC BLOCKS {label, role, column_indices}.
 * We score, deterministically:
 *   fidelity      = per-block, fraction of its columns whose deterministic role == the block's claimed
 *                   role (type-coherence), size-weighted. Low ⇒ the arm invented an incoherent grouping.
 *   hallucination = column indices claimed that don't exist / are duplicated across blocks.
 *   coverage      = columns assigned to some block / N (coverage confound acknowledged; A is truncated).
 * CONTROL: B-shuffled (column types rotated) → a faithful B should have its temporal/identity blocks
 *   become type-incoherent (fidelity drops); if fidelity stays high, B is asserting blocks from priors.
 *
 * Uses the same over-context sheet (누적, 133 cols) + the FANIN hierarchical reduce from
 * claim-m-coverage.mts. Deterministic gold = column inferred_type.
 *
 *   npx tsx scripts/claim-m-semantic.mts                              # scout (LLM-0)
 *   CLAIM_M_MODE=run CLAIM_M_ARM=mock npx tsx scripts/claim-m-semantic.mts   # plumbing (LLM-0)
 *   CLAIM_M_MODE=run [CLAIM_M_FANIN=3] npx tsx scripts/claim-m-semantic.mts  # LIVE
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
const FANIN = Number(process.env.CLAIM_M_FANIN ?? "999");
const REPEATS = Number(process.env.CLAIM_M_REPEATS ?? "1");
const MAX_CALLS = Number(process.env.CLAIM_M_MAX_CALLS ?? "80");
const SESSION = path.join(REPO, ".onto/reconstruct/claim-m-semantic");

type Col = { index: number; name: string; type: string; role: string };
const ROLE_OF = (t: string): string =>
  t === "date" ? "temporal" : t === "string" ? "identity" : t === "integer" || t === "number" ? "measure" : "other";

function findArray(node: unknown, key: string, out: unknown[]): void {
  if (Array.isArray(node)) { for (const x of node) findArray(x, key, out); return; }
  if (node && typeof node === "object") for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === key && Array.isArray(v)) { for (const x of v) out.push(x); } else findArray(v, key, out);
  }
}
async function loadCols(): Promise<Col[]> {
  const raw = await fs.readFile(OBS, "utf8");
  const obs = parseYaml(raw);
  const ps: any[] = []; findArray(obs, "per_sheet_data", ps);
  const s = ps.find((x) => x.sheet === SHEET);
  if (!s) throw new Error(`sheet ${SHEET} not found`);
  return (s.columns ?? []).map((c: any) => ({ index: c.index, name: String(c.name ?? `col${c.index}`), type: c.inferred_type ?? "?", role: ROLE_OF(c.inferred_type ?? "?") }));
}

let CALL = 0; let CFG: Record<string, unknown> | null = null;
async function cfg() {
  if (CFG) return CFG;
  const settings = await resolveSettingsChain(REPO, REPO);
  const a = resolveReconstructActorLlmSettings(settings, "semantic_author");
  const c = resolveLlmProviderConfig({ config: { llm: a } }) as Record<string, unknown>;
  CFG = { ...c, max_tokens: 3000 };
  console.log(`[sem] route: provider=${c.provider} model=${c.model_id ?? (c as any).model}`);
  return CFG;
}
function extractJson(t: string): Record<string, unknown> {
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error(`no JSON: ${t.slice(0, 160)}`);
  return JSON.parse(t.slice(a, b + 1));
}
async function ask(sys: string, user: string): Promise<Record<string, unknown>> {
  CALL += 1; if (CALL > MAX_CALLS) throw new Error(`cap ${MAX_CALLS}`);
  const r = await callLlm(sys, user, (await cfg()) as never);
  return extractJson((r as { text: string }).text);
}

type Block = { label: string; role: string; column_indices: number[] };
function parseBlocks(raw: Record<string, unknown>): Block[] {
  const arr = Array.isArray(raw.blocks) ? (raw.blocks as any[]) : [];
  return arr.map((b) => ({ label: String(b?.label ?? ""), role: String(b?.role ?? "other"),
    column_indices: Array.isArray(b?.column_indices) ? b.column_indices.map(Number).filter(Number.isFinite) : [] }));
}
const BLOCK_SYS = "You group spreadsheet columns into high-level THEMATIC BLOCKS for an ontology seed. Each " +
  'block has a label, a role from {identity, temporal, measure, other}, and the column indices in it. Assign ' +
  'EVERY given column to exactly one block. Output ONLY JSON {"blocks":[{"label":"..","role":"..","column_indices":[..]}]}.';

// READ + hierarchical reduce reused from the coverage probe shape, but leaves emit BLOCKS.
const CHUNK_BLOCK_SYS = BLOCK_SYS + " These are one chunk of a larger sheet.";
const MERGE_BLOCK_SYS = "You merge per-chunk thematic block lists into ONE consistent set of blocks for the whole " +
  'sheet, preserving EVERY column index. Output ONLY JSON {"blocks":[{"label":"..","role":"..","column_indices":[..]}]}.';

async function armFlatTrunc(cols: Col[]): Promise<Block[]> {
  const seen = cols.slice(0, TRUNC);
  if (ARM === "mock") return [{ label: "all", role: "measure", column_indices: seen.map((c) => c.index) }];
  return parseBlocks(await ask(BLOCK_SYS, JSON.stringify({ note: `first ${TRUNC} of many columns`, columns: seen.map((c) => ({ index: c.index, name: c.name, type: c.type })) }, null, 2)));
}
let TREE_DEPTH = 0;
async function armAccumulated(cols: Col[]): Promise<Block[]> {
  if (ARM === "mock") return [{ label: "all", role: "measure", column_indices: cols.map((c) => c.index) }];
  let level: Block[][] = [];
  for (let i = 0; i < cols.length; i += CHUNK) {
    const chunk = cols.slice(i, i + CHUNK).map((c) => ({ index: c.index, name: c.name, type: c.type }));
    level.push(parseBlocks(await ask(CHUNK_BLOCK_SYS, JSON.stringify({ columns: chunk }, null, 2))));
  }
  let depth = 0;
  while (level.length > 1) {
    const next: Block[][] = [];
    for (let i = 0; i < level.length; i += FANIN) {
      const group = level.slice(i, i + FANIN);
      if (group.length === 1) { next.push(group[0]); continue; }
      next.push(parseBlocks(await ask(MERGE_BLOCK_SYS, JSON.stringify({ chunk_blocks: group }, null, 2))));
    }
    level = next; depth += 1;
  }
  TREE_DEPTH = depth;
  return level[0] ?? [];
}
function shuffleTypes(cols: Col[]): Col[] {
  const n = cols.length;
  return cols.map((c, i) => ({ ...c, type: cols[(i + 1) % n].type, role: cols[(i + 1) % n].role }));
}

function score(blocks: Block[], cols: Col[]) {
  const roleOf = new Map(cols.map((c) => [c.index, c.role]));
  const assigned = new Set<number>();
  let halluc = 0, roleHit = 0, roleTot = 0;
  for (const b of blocks) for (const idx of b.column_indices) {
    if (!roleOf.has(idx) || assigned.has(idx)) { halluc += 1; continue; }
    assigned.add(idx);
    roleTot += 1;
    if (roleOf.get(idx) === b.role) roleHit += 1;
  }
  return { coverage: assigned.size / cols.length, blocks: blocks.length, assigned: assigned.size,
    fidelity: roleTot === 0 ? 0 : roleHit / roleTot, hallucination: halluc };
}

async function run(): Promise<void> {
  await fs.mkdir(SESSION, { recursive: true });
  const cols = await loadCols();
  const dist: Record<string, number> = {};
  for (const c of cols) dist[c.role] = (dist[c.role] ?? 0) + 1;
  console.log(`[sem] sheet=${SHEET} columns=${cols.length} deterministic roles=${JSON.stringify(dist)}`);
  console.log(`[sem] baseline: majority-role fidelity floor = ${(Math.max(...Object.values(dist)) / cols.length).toFixed(2)} (calling everything 'measure')`);

  const runs: any[] = [];
  for (let i = 0; i < REPEATS; i += 1) {
    const a = await armFlatTrunc(cols);
    const b = await armAccumulated(cols);
    const c = await armAccumulated(shuffleTypes(cols));
    const sA = score(a, cols), sB = score(b, cols), sC = score(c, cols);
    runs.push({ run: i + 1, A: sA, B: sB, B_shuffled: sC });
    console.log(`\n[sem] === run ${i + 1}/${REPEATS} (B depth=${TREE_DEPTH}) ===`);
    console.log(`   A (flat-trunc) coverage=${sA.coverage.toFixed(2)} fidelity=${sA.fidelity.toFixed(2)} blocks=${sA.blocks} halluc=${sA.hallucination}`);
    console.log(`   B (accumulated) coverage=${sB.coverage.toFixed(2)} fidelity=${sB.fidelity.toFixed(2)} blocks=${sB.blocks} halluc=${sB.hallucination}`);
    console.log(`   B-shuffled ctrl coverage=${sC.coverage.toFixed(2)} fidelity=${sC.fidelity.toFixed(2)} blocks=${sC.blocks} halluc=${sC.hallucination}`);
  }
  const avg = (f: (r: any) => number) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
  const fB = avg((r) => r.B.fidelity), fC = avg((r) => r.B_shuffled.fidelity), hB = avg((r) => r.B.hallucination);
  const floor = Math.max(...Object.values(dist)) / cols.length;
  console.log(`\n[sem] ===== semantic fidelity over ${REPEATS} run(s) (fanin=${FANIN === 999 ? "flat" : FANIN}, depth=${TREE_DEPTH}) =====`);
  console.log(`   B fidelity=${fB.toFixed(2)} (vs majority-floor ${floor.toFixed(2)})  hallucination=${hB.toFixed(1)}`);
  console.log(`   B-shuffled fidelity=${fC.toFixed(2)} → ${fC < fB - 0.1 ? "DROPS ✅ (B's blocks track real types, not priors)" : "holds ⚠️ (fidelity from priors/majority, not reading)"}`);
  console.log(`   → B ${fB > floor + 0.05 ? "beats" : "≈"} the trivial majority-role floor; hallucination ${hB <= 2 ? "low ✅" : "HIGH ❌ (invents unsupported structure)"}`);

  const report = { probe: "Claim M — semantic fidelity (thematic-block type-coherence)", arm: ARM, sheet: SHEET,
    columns: cols.length, role_dist: dist, majority_floor: floor, fanin: FANIN, depth: TREE_DEPTH, repeats: REPEATS,
    avg: { fidelity_B: fB, fidelity_B_shuffled: fC, halluc_B: hB }, runs, llm_calls: CALL };
  const rp = path.join(SESSION, `report-${ARM}.yaml`);
  await fs.writeFile(rp, stringifyYaml(report));
  console.log(`\n[sem] llm_calls=${CALL}  report=${rp}`);
}
async function scout(): Promise<void> {
  const cols = await loadCols();
  const dist: Record<string, number> = {};
  for (const c of cols) dist[c.role] = (dist[c.role] ?? 0) + 1;
  console.log(`[sem] sheet=${SHEET} columns=${cols.length} roles=${JSON.stringify(dist)} majority-floor=${(Math.max(...Object.values(dist)) / cols.length).toFixed(2)}`);
}
async function main() { if (MODE === "scout") return scout(); if (MODE === "run") return run(); throw new Error(`mode ${MODE}`); }
main().catch((e) => { console.error(e); process.exit(1); });
