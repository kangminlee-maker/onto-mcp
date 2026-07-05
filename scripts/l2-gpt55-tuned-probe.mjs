#!/usr/bin/env node
/**
 * Regression probe: does the ⑤ tuned shipping prompt regress gpt-5.5 (the current shipping model)?
 * Runs the 6 content-prone inputs where Sonnet-5-low content-guessed (seqs 10/37/61/62/155/297)
 * through gpt-5.5 medium with the NEW shipping prompt. Pass = raw JSON + no invented business content.
 */
import fs from "node:fs";
import { spawn } from "node:child_process";

const SYS = fs.readFileSync("/tmp/ship-syn.txt", "utf8");
const SEQS = [10, 37, 61, 62, 155, 297];
const cap = new Map();
for (const l of fs.readFileSync(".onto/reconstruct/l2-real-llm-2026-07-03T01-41-57-3392b185/captured-calls.jsonl", "utf8").split("\n")) {
  if (!l.trim()) continue; const d = JSON.parse(l);
  if (SEQS.includes(d.seq) && d.userPrompt) cap.set(d.seq, d.userPrompt);
}
function call(user) {
  return new Promise((res) => {
    const c = spawn("codex", ["exec", "--skip-git-repo-check", "--ephemeral", "-m", "gpt-5.5", "-c", 'model_reasoning_effort="medium"', "-c", 'service_tier="fast"', "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let o = "", e = "", to = false;
    c.stdout.on("data", (x) => o += x); c.stderr.on("data", (x) => e += x);
    c.stdin.on("error", () => {}); c.stdin.write(`${SYS}\n\n---\n\n${user}`); c.stdin.end();
    const t = setTimeout(() => { to = true; c.kill("SIGTERM"); }, 120000);
    c.on("close", (code) => { clearTimeout(t); res(to ? { ok: false, e: "timeout" } : code !== 0 ? { ok: false, e: e.slice(0, 120) } : { ok: true, text: o.trim() }); });
  });
}
const out = [];
for (const seq of SEQS) {
  let r = await call(cap.get(seq));
  if (!r.ok && r.e === "timeout") r = await call(cap.get(seq));
  let rawOk = false, summary = "";
  if (r.ok) { try { const j = JSON.parse(r.text); rawOk = true; summary = (j.semantic_summary || "").slice(0, 160); } catch { summary = "[non-raw] " + r.text.slice(0, 100); } }
  out.push({ seq, ok: r.ok, rawOk, summary, err: r.ok ? null : r.e });
  console.log(`seq ${seq}: raw_json=${rawOk} | ${summary || r.e}`);
}
fs.writeFileSync("/tmp/gpt55-tuned-probe.json", JSON.stringify(out, null, 2));
console.log("\nraw_json_ok:", out.filter((x) => x.rawOk).length + "/" + out.length, "| transport_fail:", out.filter((x) => !x.ok).length);
