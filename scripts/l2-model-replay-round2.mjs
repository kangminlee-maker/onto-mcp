#!/usr/bin/env node
/**
 * Backlog-⑤ round-2: Sonnet-5-low + Haiku (clean re-baseline + tuned) replay.
 *
 * Fixes two confounds from the ⑤b Haiku probe:
 *  1. Mechanism confound — ⑤b used `claude -p` with Claude Code's DEFAULT system prompt, which
 *     wrapped output in markdown fences and can drift grounding. This round uses
 *     `--system-prompt-file` (full replace) so the synthesize prompt IS the only system prompt,
 *     matching the codex arms' clean single-message shape.
 *  2. Effort control — Sonnet 5 supports `--effort low` (Haiku 4.5 does NOT; effort omitted there).
 *
 * Arms (same 60 stratified inputs as the ⑤ replays; deterministic strided → identical seqs):
 *  - sonnet5_low : base prompt, claude-sonnet-5, --effort low
 *  - haiku_clean : base prompt, claude-haiku-4-5, clean call (isolates the CLI fence confound)
 *  - haiku_tuned : TUNED prompt (no-fence + grounding hardening + seam-aligned boundaries), haiku
 *
 * Deterministic metrics vs the gpt-5.5 MEDIUM baseline: raw-strict JSON rate (fence discipline),
 * structural-cap pass, boundary row-set Jaccard + exact match, seam-exact. Grounding quality
 * (content-guessing) is assessed out of band on the captured summaries.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const SRC = ".onto/reconstruct/l2-real-llm-2026-07-03T01-41-57-3392b185/captured-calls.jsonl";
const CLAUDE = path.join(os.homedir(), ".local/bin/claude");
const CONCURRENCY = 2;
const STAGGER_MS = 1500;
const CALL_TIMEOUT_MS = 120_000;

const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT_DIR = `.onto/reconstruct/l2-model-replay-round2-${runId}`;
fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, "replay-calls.jsonl");
const log = (m) => console.log(`[round2 ${new Date().toISOString()}] ${m}`);

// ── load captured synthesize calls + base prompt
let basePrompt = null;
const records = [];
for (const line of fs.readFileSync(SRC, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const d = JSON.parse(line);
  if (!d.userPrompt) continue;
  if (!(d.systemPrompt || "").startsWith("You are reading ONE spreadsheet column region")) continue;
  if (basePrompt === null) basePrompt = d.systemPrompt;
  const inp = JSON.parse(d.userPrompt);
  records.push({ seq: d.seq, userPrompt: d.userPrompt, baselineText: d.text,
    seams: (inp.value_shape_seams || []).length, children: (inp.child_summaries || []).length, node_ref: inp.node_ref });
}
if (records.length !== 1699) throw new Error(`expected 1699, got ${records.length}`);

// ── TUNED prompt: base + three hardening clauses targeting the ⑤b defects
const tunedPrompt = basePrompt + "\n\n" + [
  "OUTPUT DISCIPLINE: Reply with ONLY the raw JSON object. Do NOT wrap it in markdown code fences or backticks, and do NOT write any text before or after the JSON.",
  "GROUNDING: Describe ONLY value-shape structure — the format-cluster names and seam transitions given. Never name, guess, or infer the business meaning of the cells: do not mention field names, real-world data kinds (\"payment date\", \"status text\", \"amount\", \"id\"), or metric semantics. If there is no shape-grounded reading beyond the shapes present, say the region is a single uniform shape.",
  "BOUNDARIES: A boundary's row should correspond to a value_shape_seam (or a transition a child_summary explicitly reports). Do not invent split points at rows with no supporting seam.",
].join("\n");

const baseFile = path.join(OUT_DIR, "system-base.txt");
const tunedFile = path.join(OUT_DIR, "system-tuned.txt");
fs.writeFileSync(baseFile, basePrompt);
fs.writeFileSync(tunedFile, tunedPrompt);

const ARMS = [
  { arm: "sonnet5_low", model: "claude-sonnet-5", effort: "low", sysFile: baseFile },
  { arm: "haiku_clean", model: "claude-haiku-4-5-20251001", effort: null, sysFile: baseFile },
  { arm: "haiku_tuned", model: "claude-haiku-4-5-20251001", effort: null, sysFile: tunedFile },
];

// ── stratified deterministic sample (identical to the ⑤ replays)
const strata = {
  "leaf+seams": records.filter((r) => r.children === 0 && r.seams > 0),
  "merge+seams": records.filter((r) => r.children > 0 && r.seams > 0),
  "leaf": records.filter((r) => r.children === 0 && r.seams === 0),
  "merge": records.filter((r) => r.children > 0 && r.seams === 0),
};
const QUOTA = { "leaf+seams": 20, "merge+seams": 20, "leaf": 10, "merge": 10 };
const sample = [];
for (const [name, pool] of Object.entries(strata)) {
  pool.sort((a, b) => a.seq - b.seq);
  const want = Math.min(QUOTA[name], pool.length);
  const stride = pool.length / want;
  for (let i = 0; i < want; i += 1) sample.push({ ...pool[Math.floor(i * stride)], stratum: name });
}
log(`sampled ${sample.length} inputs × ${ARMS.length} arms = ${sample.length * ARMS.length} calls`);

function callClaude(model, effort, sysFile, userPrompt) {
  return new Promise((resolve) => {
    const args = ["-p", "--model", model, "--system-prompt-file", sysFile];
    if (effort) args.push("--effort", effort);
    const child = spawn(CLAUDE, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    child.stdout.on("data", (c) => { stdout += String(c); });
    child.stderr.on("data", (c) => { stderr += String(c); });
    child.stdin.on("error", () => {});
    child.stdin.write(userPrompt);
    child.stdin.end();
    const t = setTimeout(() => { timedOut = true; child.kill("SIGTERM");
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 5000); }, CALL_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(t);
      if (timedOut) return resolve({ ok: false, error: "timeout" });
      if (code !== 0) return resolve({ ok: false, error: `exit ${code}: ${stderr.slice(0, 300)}` });
      resolve({ ok: true, text: stdout.trim() });
    });
  });
}

const tasks = [];
for (const r of sample) for (const a of ARMS) tasks.push({ r, a });
tasks.sort((x, y) => x.r.seq - y.r.seq || x.a.arm.localeCompare(y.a.arm));
let done = 0;
const results = [];
async function worker(id) {
  await new Promise((res) => setTimeout(res, id * STAGGER_MS));
  while (true) {
    const task = tasks.shift();
    if (!task) return;
    const { r, a } = task;
    let res = await callClaude(a.model, a.effort, a.sysFile, r.userPrompt);
    if (!res.ok && res.error === "timeout") res = await callClaude(a.model, a.effort, a.sysFile, r.userPrompt);
    const row = { seq: r.seq, stratum: r.stratum, arm: a.arm, ok: res.ok, text: res.ok ? res.text : null, error: res.ok ? null : res.error };
    results.push(row);
    fs.appendFileSync(outPath, JSON.stringify(row) + "\n");
    done += 1;
    if (done % 15 === 0) log(`progress: ${done}/${sample.length * ARMS.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

// ── metrics
function stripFence(text) {
  const m = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : text;
}
function structural(text, nodeRef) {
  let out;
  try { out = JSON.parse(text); } catch { return { parse: false }; }
  const errs = [];
  const s = out.semantic_summary;
  if (typeof s !== "string" || !s.trim()) errs.push("summary_empty");
  else if (s.length > 600) errs.push("summary_over_cap");
  const bs = out.boundaries;
  if (!Array.isArray(bs)) errs.push("boundaries_not_array");
  else {
    if (bs.length > 16) errs.push("boundaries_over_cap");
    for (const b of bs) {
      if (!Number.isInteger(b?.row)) { errs.push("row_not_int"); break; }
      if (b.row < nodeRef.row_start || b.row > nodeRef.row_end) { errs.push("row_out_of_range"); break; }
      if (typeof b.character_before !== "string" || b.character_before.length > 120 ||
          typeof b.character_after !== "string" || b.character_after.length > 120) { errs.push("char_field_invalid"); break; }
      const extra = Object.keys(b).filter((k) => !["row", "character_before", "character_after"].includes(k));
      if (extra.length) { errs.push("boundary_extra_fields"); break; }
    }
  }
  const extraTop = Object.keys(out).filter((k) => !["semantic_summary", "boundaries"].includes(k));
  if (extraTop.length) errs.push("top_extra_fields");
  return { parse: true, pass: errs.length === 0, errs,
    rows: Array.isArray(bs) ? bs.filter((b) => Number.isInteger(b?.row)).map((b) => b.row) : [],
    summary_len: typeof s === "string" ? s.length : 0, nb: Array.isArray(bs) ? bs.length : -1 };
}
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0; for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}
const bySeq = new Map(sample.map((r) => [r.seq, r]));
const report = { run_id: runId, sample_size: sample.length, arms: {} };
for (const a of ARMS) {
  const rows = results.filter((x) => x.arm === a.arm);
  const m = { model: a.model, effort: a.effort, calls: rows.length, transport_fail: rows.filter((x) => !x.ok).length,
    raw_strict: 0, fenced: 0, parse_fail: 0, structural_fail: 0, structural_errs: {},
    jaccard_n: 0, jaccard_sum: 0, exact_match: 0, seam_cases: 0, seam_exact: 0, summary_len_sum: 0, over_split: 0 };
  for (const x of rows) {
    if (!x.ok) continue;
    const r = bySeq.get(x.seq);
    const base = structural(r.baselineText, r.node_ref);
    let rawOk = true; try { JSON.parse(x.text); } catch { rawOk = false; }
    if (rawOk) m.raw_strict += 1; else m.fenced += 1;
    const mine = structural(stripFence(x.text), r.node_ref);
    if (!mine.parse) { m.parse_fail += 1; continue; }
    if (!mine.pass) { m.structural_fail += 1; for (const e of mine.errs) m.structural_errs[e] = (m.structural_errs[e] || 0) + 1; }
    const j = jaccard(mine.rows, base.rows);
    m.jaccard_sum += j; m.jaccard_n += 1;
    if (j === 1) m.exact_match += 1;
    if (mine.nb > base.nb) m.over_split += 1; // more boundaries than baseline
    if (r.seams > 0) { m.seam_cases += 1; if (j === 1) m.seam_exact += 1; }
    m.summary_len_sum += mine.summary_len;
  }
  m.raw_strict_rate = rows.length ? +(m.raw_strict / rows.filter((x) => x.ok).length).toFixed(4) : null;
  m.jaccard_mean = m.jaccard_n ? +(m.jaccard_sum / m.jaccard_n).toFixed(4) : null;
  m.exact_match_rate = m.jaccard_n ? +(m.exact_match / m.jaccard_n).toFixed(4) : null;
  m.seam_exact_rate = m.seam_cases ? +(m.seam_exact / m.seam_cases).toFixed(4) : null;
  m.summary_len_mean = m.jaccard_n ? Math.round(m.summary_len_sum / m.jaccard_n) : null;
  delete m.jaccard_sum; delete m.summary_len_sum;
  report.arms[a.arm] = m;
}
fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
log(`report: ${path.join(OUT_DIR, "report.json")}`);
console.log(JSON.stringify(report, null, 2));
