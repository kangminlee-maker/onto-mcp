#!/usr/bin/env node
/**
 * Backlog-⑤ quality comparison: blind rubric judge (Opus 4.8) of semantic-map outputs.
 *
 * Deterministic metrics (Jaccard, structural caps) already showed all arms ~0.98–0.99 on boundary
 * ROWS. They cannot judge SEMANTIC quality — whether a summary stays grounded in shape vocabulary
 * (no invented cell contents) and whether proposed boundaries are faithful to the given seams.
 * This script scores those two objective axes with an INDEPENDENT judge (Opus 4.8 — not the
 * cheapest contestant), BLIND to which model produced each output.
 *
 * Contestants (same 60 aligned inputs as the round-2 replay):
 *   - baseline_gpt55 : the captured gpt-5.5 medium output (the reference we're comparing against)
 *   - haiku_tuned    : the lowest-cost candidate (tuned prompt)
 *   - sonnet5_low    : the balance candidate
 * Reports grounding-pass rate + boundary-faithful rate per arm; the gpt-5.5 baseline's own rates
 * are the yardstick (an arm that matches or beats baseline on both is quality-viable).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const SRC = ".onto/reconstruct/l2-real-llm-2026-07-03T01-41-57-3392b185/captured-calls.jsonl";
const CLAUDE = path.join(os.homedir(), ".local/bin/claude");
const JUDGE_SYS = "/tmp/judge-sys.txt";
const JUDGE_MODEL = "claude-opus-4-8";
const CONCURRENCY = 3;
const STAGGER_MS = 1200;
const CALL_TIMEOUT_MS = 150_000;

const round2Dir = fs.readdirSync(".onto/reconstruct").filter((d) => d.startsWith("l2-model-replay-round2-")).sort().at(-1);
const ROUND2 = path.join(".onto/reconstruct", round2Dir, "replay-calls.jsonl");
const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT_DIR = `.onto/reconstruct/l2-quality-judge-${runId}`;
fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, "judgements.jsonl");
const log = (m) => console.log(`[judge ${new Date().toISOString()}] ${m}`);

// baseline gpt-5.5 outputs + inputs, keyed by seq
const baseline = new Map();
for (const line of fs.readFileSync(SRC, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const d = JSON.parse(line);
  if (!d.userPrompt) continue;
  if (!(d.systemPrompt || "").startsWith("You are reading ONE spreadsheet column region")) continue;
  baseline.set(d.seq, { input: JSON.parse(d.userPrompt), text: d.text });
}
// round-2 arm outputs
const arms = { haiku_tuned: new Map(), sonnet5_low: new Map() };
for (const line of fs.readFileSync(ROUND2, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  if (r.ok && arms[r.arm]) arms[r.arm].set(r.seq, r.text);
}
const seqs = [...arms.haiku_tuned.keys()].filter((s) => baseline.has(s)).sort((a, b) => a - b);
log(`aligned seqs: ${seqs.length}`);

function stripFence(t) { const m = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/); return m ? m[1] : t; }
function parseCand(text) { try { const o = JSON.parse(stripFence(text)); return { semantic_summary: o.semantic_summary, boundaries: o.boundaries }; } catch { return null; } }

// build tasks: (seq, arm, candidate)
const tasks = [];
for (const seq of seqs) {
  const input = baseline.get(seq).input;
  const cands = { baseline_gpt55: parseCand(baseline.get(seq).text), haiku_tuned: parseCand(arms.haiku_tuned.get(seq)), sonnet5_low: parseCand(arms.sonnet5_low.get(seq)) };
  for (const [arm, cand] of Object.entries(cands)) {
    if (cand) tasks.push({ seq, arm, payload: JSON.stringify({ input, candidate: cand }) });
  }
}
log(`judge calls: ${tasks.length}`);

function judge(payload) {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE, ["-p", "--model", JUDGE_MODEL, "--system-prompt-file", JUDGE_SYS], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    child.stdout.on("data", (c) => { stdout += String(c); });
    child.stderr.on("data", (c) => { stderr += String(c); });
    child.stdin.on("error", () => {});
    child.stdin.write(payload); child.stdin.end();
    const t = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 5000); }, CALL_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(t);
      if (timedOut) return resolve({ ok: false });
      if (code !== 0) return resolve({ ok: false, err: stderr.slice(0, 200) });
      try { const v = JSON.parse(stripFence(stdout.trim())); resolve({ ok: true, grounding: v.grounding, boundary_faithful: v.boundary_faithful, note: v.note }); }
      catch { resolve({ ok: false, err: "unparseable: " + stdout.slice(0, 120) }); }
    });
  });
}

let done = 0;
const results = [];
async function worker(id) {
  await new Promise((res) => setTimeout(res, id * STAGGER_MS));
  while (true) {
    const task = tasks.shift();
    if (!task) return;
    let v = await judge(task.payload);
    if (!v.ok) v = await judge(task.payload);
    const row = { seq: task.seq, arm: task.arm, ...v };
    results.push(row);
    fs.appendFileSync(outPath, JSON.stringify(row) + "\n");
    done += 1;
    if (done % 20 === 0) log(`progress: ${done}/${tasks.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

const report = { run_id: runId, judge_model: JUDGE_MODEL, arms: {} };
for (const arm of ["baseline_gpt55", "haiku_tuned", "sonnet5_low"]) {
  const rows = results.filter((r) => r.arm === arm && r.ok);
  const n = rows.length;
  const gPass = rows.filter((r) => r.grounding === 1).length;
  const bPass = rows.filter((r) => r.boundary_faithful === 1).length;
  report.arms[arm] = { judged: n, judge_fail: results.filter((r) => r.arm === arm && !r.ok).length,
    grounding_pass: gPass, grounding_rate: n ? +(gPass / n).toFixed(4) : null,
    boundary_faithful_pass: bPass, boundary_rate: n ? +(bPass / n).toFixed(4) : null };
}
fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
log(`report: ${path.join(OUT_DIR, "report.json")}`);
console.log(JSON.stringify(report, null, 2));
