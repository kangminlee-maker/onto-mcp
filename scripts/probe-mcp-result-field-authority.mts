/**
 * MEASUREMENT: which part of an MCP tool result actually reaches the model, and which part counts
 * toward the size at which codex trims?
 *
 * Why it decides a decision. The facade puts the same page in a result TWICE —
 * `content[0].text = JSON.stringify(page)` AND `structuredContent: page`
 * (observation-read-facade.ts:511-512) — measured at 2.05x inflation. Dropping one is on the table
 * because it would roughly halve what the transport carries. That option turns on two unknowns:
 *
 *   --mode=visibility  Does the model see `structuredContent` at all, or only `content[0].text`?
 *                      If it never sees it, dropping it costs the worker nothing.
 *                      If it sees only that, dropping the WRONG one blinds the worker.
 *   --mode=counting    Does `structuredContent` count toward the trim ceiling?
 *                      If it does, dropping it is a real ~2x gain.
 *                      If it does not, dropping it does NOT raise the ceiling and the option's
 *                      headline benefit evaporates — it would only save pipe bytes.
 *
 * `counting` carries its own within-run control: two results with the SAME text size, one with a tiny
 * structuredContent and one with a huge one. If only the second loses probe points, the structured field
 * is what pushed it over. Without that control a loss could just be the text's own size.
 *
 * Values are random per position, so a reported value proves that region arrived and cannot be inferred
 * from the pattern. Costs one real dispatch per invocation.
 *
 *   npx tsx scripts/probe-mcp-result-field-authority.mts --mode=visibility
 *   npx tsx scripts/probe-mcp-result-field-authority.mts --mode=counting
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const CODEX_BIN = "/opt/homebrew/bin/codex";
const MODEL = process.env.ONTO_PROBE_MODEL ?? "gpt-5.6-luna";
const EFFORT = process.env.ONTO_PROBE_EFFORT ?? "low";
const POINTS = 5;

const argOf = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1];
const mode = argOf("mode") ?? "visibility";
if (mode !== "visibility" && mode !== "counting") {
  console.error("--mode must be visibility or counting");
  process.exit(1);
}

const fail: (m: string) => never = (m) => {
  console.error(`\n✗ ${m}`);
  process.exit(1);
};
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const filler = (i: number): string => `the quick brown fox jumps over the lazy dog number ${i} `;

/** Text of `size` chars with an unguessable tag at each of POINTS evenly spaced offsets. */
const build = (size: number, nonces: string[]): string => {
  const out: string[] = [];
  let len = 0;
  let f = 0;
  for (let q = 0; q < POINTS; q += 1) {
    const tag = `[P${q}:${nonces[q]}]`;
    const target = q === POINTS - 1 ? size - tag.length : Math.round((q * size) / (POINTS - 1));
    while (len < target) {
      const piece = filler(f++);
      out.push(piece);
      len += piece.length;
    }
    out.push(tag);
    len += tag.length;
  }
  return out.join("");
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const evidenceDir = path.join(REPO_ROOT, "benchmark", "mcp-result-field-authority", stamp);
mkdirSync(evidenceDir, { recursive: true });
const workDir = mkdtempSync(path.join(os.tmpdir(), "field-authority-"));

type Case = { index: number; label: string; textNonces: string[]; structNonces: string[]; text: string; struct: unknown };
const cases: Case[] = [];

if (mode === "visibility") {
  // Both fields small, each carrying DIFFERENT values. Whichever values come back names the field the
  // model can actually read.
  const t = Array.from({ length: POINTS }, () => randomBytes(5).toString("hex"));
  const s = Array.from({ length: POINTS }, () => randomBytes(5).toString("hex"));
  cases.push({
    index: 0,
    label: "text vs structuredContent, both small",
    textNonces: t,
    structNonces: s,
    text: build(2_000, t),
    struct: { body: build(2_000, s) },
  });
} else {
  // Same text size in both; only the structured field differs. Isolates what pushed a result over.
  // The text size is kept WELL inside the independently measured intact range (32k), so a control that
  // still loses tags indicts the harness or the worker's reporting, not the size — which is exactly the
  // ambiguity a first run at 20k left open.
  const textSize = Number(argOf("text-size") ?? 8_000);
  const tA = Array.from({ length: POINTS }, () => randomBytes(5).toString("hex"));
  const tB = Array.from({ length: POINTS }, () => randomBytes(5).toString("hex"));
  cases.push({
    index: 0,
    label: `CONTROL: ${textSize} text + tiny structuredContent`,
    textNonces: tA,
    structNonces: [],
    text: build(textSize, tA),
    struct: { body: "tiny" },
  });
  cases.push({
    index: 1,
    label: `TREATMENT: ${textSize} text + 150k structuredContent`,
    textNonces: tB,
    structNonces: [],
    text: build(textSize, tB),
    struct: { body: build(150_000, Array.from({ length: POINTS }, () => randomBytes(5).toString("hex"))) },
  });
}

const payloadFile = path.join(workDir, "cases.json");
writeFileSync(payloadFile, JSON.stringify(cases), "utf8");
for (const c of cases) {
  const frame = JSON.stringify({ content: [{ type: "text", text: c.text }], structuredContent: c.struct });
  ok(`case ${c.index} — ${c.label} · full frame ${frame.length} chars`);
}

const shim = path.join(workDir, "shim.mjs");
writeFileSync(
  shim,
  `import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
const cases = JSON.parse(readFileSync(process.env.PROBE_CASES, "utf8"));
const reply = (v) => process.stdout.write(JSON.stringify(v) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.method === "initialize") {
    return reply({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: "probe", version: "1" } } });
  }
  if (String(m.method || "").startsWith("notifications/")) return;
  if (m.method === "tools/list") {
    return reply({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "probe_fetch",
      description: "Returns a tagged result for the given index.",
      inputSchema: { type: "object", properties: { index: { type: "number" } }, required: ["index"] } }] } });
  }
  if (m.method === "tools/call") {
    const idx = Number(m.params?.arguments?.index ?? -1);
    const c = cases.find((q) => q.index === idx);
    if (!c) return reply({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "NO_SUCH_INDEX" }], isError: true } });
    return reply({ jsonrpc: "2.0", id: m.id,
      result: { content: [{ type: "text", text: c.text }], structuredContent: c.struct, isError: false } });
  }
  if (m.id !== undefined) reply({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no" } });
});
`,
  "utf8",
);

const prompt = `You are measuring a tool, not writing code. Follow these steps literally.

Call the tool probe_fetch once for EACH index in this order: ${cases.map((c) => c.index).join(", ")}.
Each call takes exactly {"index": <k>}. That is ${cases.length} call(s) total.

Each result contains tags of the form [P0:value] [P1:value] ... spread through it. Tags may appear in
more than one part of the result; report every distinct tag you can see, wherever it appears.

For each index report:
  seen = every tag you can find, as P<number>:<value>, comma separated. Copy each value exactly.
         If a tag is not present, leave it out.

The values are random. Never guess, infer or reconstruct a value — if you cannot see it, omitting it is
the correct answer. Missing tags are an expected outcome; report exactly what you find.

Reply with EXACTLY ${cases.length} line(s) and nothing else:
IDX <k> seen=<P0:value,P1:value,...>`;

writeFileSync(path.join(evidenceDir, "prompt.txt"), prompt, "utf8");

const args = [
  "exec", "--skip-git-repo-check", "--sandbox", "read-only", "--ignore-user-config",
  "--disable", "apps", "--disable", "shell_tool", "--model", MODEL, "--cd", REPO_ROOT,
  "-c", `model_reasoning_effort="${EFFORT}"`,
  "-c", `mcp_servers.probe.command=${JSON.stringify(process.execPath)}`,
  "-c", `mcp_servers.probe.args=[${JSON.stringify(shim)}]`,
  "-c", `mcp_servers.probe.env.PROBE_CASES=${JSON.stringify(payloadFile)}`,
  "-c", 'mcp_servers.probe.default_tools_approval_mode="approve"',
  "-c", "mcp_servers.probe.startup_timeout_sec=30",
  "-",
];

console.log(`\n  … dispatching ${MODEL} (one real call) · mode=${mode}`);
const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
  const child = spawn(CODEX_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c) => (stdout += String(c)));
  child.stderr.on("data", (c) => (stderr += String(c)));
  child.stdin.write(prompt);
  child.stdin.end();
  child.on("exit", (code) => resolve({ code, stdout, stderr }));
});

writeFileSync(path.join(evidenceDir, "worker-stdout.txt"), result.stdout, "utf8");
writeFileSync(path.join(evidenceDir, "worker-stderr.txt"), result.stderr, "utf8");
console.log(`\n--- codex exit ${result.code} ---\n${result.stdout.trim()}\n`);

const values = new Set<string>();
for (const line of result.stdout.split("\n")) {
  const m = line.match(/IDX\s+\d+\s+seen=(.*)$/);
  if (!m) continue;
  for (const tok of (m[1] ?? "").split(",")) {
    const v = tok.split(":").pop()?.trim();
    if (v) values.add(v);
  }
}
if (values.size === 0) {
  console.error(result.stderr.slice(-1500));
  rmSync(workDir, { recursive: true, force: true });
  fail("the worker reported no tags at all — this measures nothing. Read worker-stderr.txt first.");
}

console.log("--- verdict ---");
const rows: Record<string, unknown>[] = [];
if (mode === "visibility") {
  const c = cases[0]!;
  const fromText = c.textNonces.filter((n) => values.has(n)).length;
  const fromStruct = c.structNonces.filter((n) => values.has(n)).length;
  console.log(`  content[0].text     : ${fromText}/${POINTS} tags returned`);
  console.log(`  structuredContent   : ${fromStruct}/${POINTS} tags returned`);
  const verdict =
    fromText > 0 && fromStruct > 0
      ? "BOTH fields reach the model — dropping either removes something the worker could read"
      : fromText > 0
        ? "ONLY content[0].text reaches the model — structuredContent is invisible to it, so dropping structuredContent costs the worker NOTHING"
        : fromStruct > 0
          ? "ONLY structuredContent reaches the model — dropping THAT would blind the worker; drop text instead"
          : "neither field was reported — inconclusive";
  console.log(`\n  → ${verdict}`);
  rows.push({ mode, text_tags: fromText, struct_tags: fromStruct, points: POINTS, verdict });
} else {
  // Any reported value matching no payload at all is a worker copy error, not a delivery fact. Without
  // this split a mis-typed value reads as a lost region and silently understates delivery.
  const known = new Set(cases.flatMap((c) => [...c.textNonces, ...c.structNonces]));
  const unmatched = [...values].filter((v) => !known.has(v));
  for (const c of cases) {
    const got = c.textNonces.filter((n) => values.has(n)).length;
    const map = c.textNonces.map((n) => (values.has(n) ? "#" : ".")).join("");
    console.log(`  case ${c.index} [${map}] ${got}/${POINTS} — ${c.label}`);
    rows.push({
      mode,
      index: c.index,
      label: c.label,
      survival_map: map,
      text_tags: got,
      points: POINTS,
      // Persisted so a verdict can be re-attributed later without spending another dispatch.
      text_nonces: c.textNonces,
    });
  }
  if (unmatched.length > 0) {
    console.log(`  ⚠ ${unmatched.length} reported value(s) match no payload — worker copy error, not loss: ${unmatched.join(", ")}`);
    rows.push({ mode, unmatched_reported_values: unmatched });
  }
  const ctrl = cases[0]!.textNonces.filter((n) => values.has(n)).length;
  const treat = cases[1]!.textNonces.filter((n) => values.has(n)).length;
  const verdict =
    ctrl === POINTS && treat < POINTS
      ? "structuredContent COUNTS toward the trim ceiling — identical text survived with a tiny structured field and was cut with a large one. Dropping it is a real ceiling gain."
      : ctrl === POINTS && treat === POINTS
        ? "structuredContent does NOT count toward the trim ceiling at this size — dropping it saves pipe bytes but does NOT raise the usable text ceiling."
        : "control did not survive — the 20k text was cut on its own, so this run cannot attribute anything to structuredContent. Re-run with a smaller text.";
  console.log(`\n  → ${verdict}`);
  rows.push({ mode, verdict });
}

writeFileSync(
  path.join(evidenceDir, "verdict.json"),
  JSON.stringify({ codex_version: "0.145.0", model: MODEL, effort: EFFORT, mode, rows }, null, 2),
  "utf8",
);
rmSync(workDir, { recursive: true, force: true });
console.log(`\nevidence → benchmark/mcp-result-field-authority/${stamp}/`);
