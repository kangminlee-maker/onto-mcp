/**
 * MEASUREMENT: is the acknowledgement round trip that design 3 rests on actually available, and what
 * does it cost an honest worker?
 *
 * Design 3 ("atomic frames + ack") moves the delivered/emitted boundary off the stream write callback —
 * which the truncation measurement proved only means "bytes entered a pipe" — and onto a value the
 * worker must send BACK in a later tool call. Everything in that design depends on four capabilities
 * that no test in this repository exercises, because they live in the worker, not in our process:
 *
 *   1. ROUND TRIP        Can the worker return, in a tool ARGUMENT, a value it received in a tool RESULT?
 *   2. ARGUMENT FIDELITY Does that value reach the server byte-identical, or is the inbound direction
 *                        subject to its own transformation? (Result trimming is measured; input is not.)
 *   3. HONEST-WORKER COST How often does a worker that genuinely received the value reproduce it wrong?
 *                        A mangled challenge costs a real citation, so this prices the design's downside.
 *   4. FAIL-CLOSED       When a chunk IS trimmed, does a challenge placed at the chunk's MIDPOINT die
 *                        with the body — or survive and wrongly certify it?
 *
 * (4) is the synthesis's one contested point. Reviewer A proposed mid-placement so a middle-out trim
 * kills the proof with the body; reviewer B held that no position is sound in general. Both are honoured
 * here: mid-placement is measured as HARDENING (does it fail closed today?), never as the soundness
 * argument — the soundness argument is the atomic-frame invariant that keeps chunks under the ceiling.
 *
 * Method. One declared `tool_output_token_limit=T`, then chunks that straddle it:
 *   - under-T chunks  → must arrive intact → their mid-challenge must come back exactly
 *   - over-T chunk    → must be trimmed    → its mid-challenge must NOT come back
 * The over-T chunk is the negative control. Without it a run where every ack succeeded would not
 * distinguish "the mechanism works" from "the mechanism accepts anything".
 *
 * The server is the only judge: it minted the challenges, so it compares against its own record rather
 * than trusting anything the worker says about itself.
 *
 * Costs one real dispatch. Run deliberately:
 *   npx tsx scripts/probe-ack-roundtrip.mts
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const CODEX_BIN = "/opt/homebrew/bin/codex";
const MODEL = process.env.ONTO_PROBE_MODEL ?? "gpt-5.6-luna";
const EFFORT = process.env.ONTO_PROBE_EFFORT ?? "low";

const argOf = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1];

/** Declared ceiling for this launch. Design 3 pins this rather than discovering a default. */
const TOKEN_LIMIT = Number(argOf("limit") ?? 2_000);
/** 128-bit, the realistic shape of a one-use challenge. Copy burden is part of what this measures. */
const CHALLENGE_BYTES = 16;

const fail: (m: string) => never = (m) => {
  console.error(`\n✗ ${m}`);
  process.exit(1);
};
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const filler = (i: number): string => `the quick brown fox jumps over the lazy dog number ${i} `;

/**
 * Body of `size` chars carrying `challenge` at its MIDPOINT, plus witness tags at evenly spaced offsets.
 *
 * The witness tags exist because "expect: trimmed" must be MEASURED, not assumed from size. A first run
 * declared "mid-placement does not fail closed" purely because a large chunk's challenge came back —
 * without ever establishing that the chunk was trimmed at all. If the tags all survive, the chunk was
 * intact and that run proved nothing about fail-closed behaviour.
 */
const WITNESSES = 5;
const buildChunk = (size: number, challenge: string, witnesses: string[]): string => {
  const tag = `[ACK_CHALLENGE:${challenge}]`;
  const out: string[] = [];
  let len = 0;
  let i = 0;
  const grow = (target: number): void => {
    while (len < target) {
      const piece = filler(i++);
      out.push(piece);
      len += piece.length;
    }
  };
  const mid = Math.floor(size / 2);
  for (let w = 0; w < WITNESSES; w += 1) {
    const wt = `[W${w}:${witnesses[w]}]`;
    const at = w === WITNESSES - 1 ? size - wt.length : Math.round((w * size) / (WITNESSES - 1));
    if (len < mid && at >= mid) {
      grow(mid);
      out.push(tag);
      len += tag.length;
    }
    grow(at);
    out.push(wt);
    len += wt.length;
  }
  if (!out.includes(tag)) {
    out.push(tag);
  }
  return out.join("");
};

type Chunk = {
  index: number; size: number; challenge: string; expect: "intact" | "trimmed"; text: string; witnesses: string[];
};
const chunks: Chunk[] = [
  { index: 0, size: 4_000, expect: "intact" as const },
  { index: 1, size: 6_000, expect: "intact" as const },
  { index: 2, size: 60_000, expect: "trimmed" as const },
].map((c) => {
  const challenge = randomBytes(CHALLENGE_BYTES).toString("hex");
  const witnesses = Array.from({ length: WITNESSES }, () => randomBytes(5).toString("hex"));
  return { ...c, challenge, witnesses, text: buildChunk(c.size, challenge, witnesses) };
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const evidenceDir = path.join(REPO_ROOT, "benchmark", "ack-roundtrip", stamp);
mkdirSync(evidenceDir, { recursive: true });
const workDir = mkdtempSync(path.join(os.tmpdir(), "ack-probe-"));
const chunkFile = path.join(workDir, "chunks.json");
const ackLog = path.join(workDir, "ack-log.jsonl");
writeFileSync(chunkFile, JSON.stringify(chunks), "utf8");
writeFileSync(ackLog, "", "utf8");

for (const c of chunks) {
  ok(`chunk ${c.index}: ${c.text.length} chars · expect ${c.expect} · challenge at midpoint`);
}

const shim = path.join(workDir, "shim.mjs");
writeFileSync(
  shim,
  `import { createInterface } from "node:readline";
import { readFileSync, appendFileSync } from "node:fs";
const chunks = JSON.parse(readFileSync(process.env.PROBE_CHUNKS, "utf8"));
const LOG = process.env.PROBE_ACK_LOG;
const reply = (v) => process.stdout.write(JSON.stringify(v) + "\\n");
const record = (e) => appendFileSync(LOG, JSON.stringify(e) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.method === "initialize") {
    return reply({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: "probe", version: "1" } } });
  }
  if (String(m.method || "").startsWith("notifications/")) return;
  if (m.method === "tools/list") {
    return reply({ jsonrpc: "2.0", id: m.id, result: { tools: [
      { name: "probe_read", description: "Read one chunk. The result contains an ACK_CHALLENGE you must acknowledge.",
        inputSchema: { type: "object", properties: { index: { type: "number" } }, required: ["index"] } },
      { name: "probe_ack", description: "Acknowledge a chunk by returning its ACK_CHALLENGE value.",
        inputSchema: { type: "object", properties: { challenge: { type: "string" } }, required: ["challenge"] } },
    ] } });
  }
  if (m.method === "tools/call") {
    const name = m.params?.name;
    const a = m.params?.arguments ?? {};
    if (name === "probe_read") {
      const c = chunks.find((q) => q.index === Number(a.index));
      if (!c) return reply({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "NO_SUCH_CHUNK" }], isError: true } });
      record({ event: "served", index: c.index, chars: c.text.length });
      return reply({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: c.text }], isError: false } });
    }
    if (name === "probe_ack") {
      // The server is the judge: compare against what IT minted, byte for byte.
      const got = typeof a.challenge === "string" ? a.challenge : JSON.stringify(a.challenge);
      const hit = chunks.find((q) => q.challenge === got);
      record({ event: "ack", received: got, matched_index: hit ? hit.index : null, exact: Boolean(hit) });
      return reply({ jsonrpc: "2.0", id: m.id, result: {
        content: [{ type: "text", text: hit ? "ACK_ACCEPTED" : "ACK_REJECTED_UNKNOWN_CHALLENGE" }], isError: false } });
    }
    return reply({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "NO_SUCH_TOOL" }], isError: true } });
  }
  if (m.id !== undefined) reply({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no" } });
});
`,
  "utf8",
);

const prompt = `You are exercising a two-step tool protocol. Follow it literally.

For EACH index in this order: ${chunks.map((c) => c.index).join(", ")}

  Step 1. Call probe_read with {"index": <k>}.
  Step 2. The result text contains a marker of the form [ACK_CHALLENGE:value] somewhere inside it.
          Find it and immediately call probe_ack with {"challenge": "<that value>"}, copied EXACTLY.

If — and only if — a result contains no [ACK_CHALLENGE:...] marker at all, skip its probe_ack call and
move to the next index. Do not invent, guess or reuse a value from another chunk: an invented value is
worse than a skipped acknowledgement.

Each result ALSO contains witness tags of the form [W0:value] [W1:value] ... spread through it. These
are not acknowledged; you only report them at the end. Report exactly the ones you can see — if tags are
missing from the middle of a result, that is an expected outcome and reporting it accurately matters.

When you have finished all indices, reply with EXACTLY one line and nothing else:
DONE acked=<indices you acknowledged, or NONE> witness2=<every W tag you saw in index 2, as W<n>:<value>, comma separated>`;

writeFileSync(path.join(evidenceDir, "prompt.txt"), prompt, "utf8");

const args = [
  "exec", "--skip-git-repo-check", "--sandbox", "read-only", "--ignore-user-config",
  "--disable", "apps", "--disable", "shell_tool", "--model", MODEL, "--cd", REPO_ROOT,
  "-c", `model_reasoning_effort="${EFFORT}"`,
  "-c", `tool_output_token_limit=${TOKEN_LIMIT}`,
  "-c", `mcp_servers.probe.command=${JSON.stringify(process.execPath)}`,
  "-c", `mcp_servers.probe.args=[${JSON.stringify(shim)}]`,
  "-c", `mcp_servers.probe.env.PROBE_CHUNKS=${JSON.stringify(chunkFile)}`,
  "-c", `mcp_servers.probe.env.PROBE_ACK_LOG=${JSON.stringify(ackLog)}`,
  "-c", 'mcp_servers.probe.default_tools_approval_mode="approve"',
  "-c", "mcp_servers.probe.startup_timeout_sec=30",
  "-",
];

console.log(`\n  … dispatching ${MODEL} (one real call) · tool_output_token_limit=${TOKEN_LIMIT}`);
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

const events = existsSync(ackLog)
  ? readFileSync(ackLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];
writeFileSync(path.join(evidenceDir, "worker-stdout.txt"), result.stdout, "utf8");
writeFileSync(path.join(evidenceDir, "worker-stderr.txt"), result.stderr, "utf8");

console.log(`\n--- codex exit ${result.code} ---\n${result.stdout.trim()}\n`);
console.log("--- server-side record ---");
for (const e of events) {
  console.log(
    e.event === "served"
      ? `  served chunk ${e.index} (${e.chars} chars)`
      : `  ack received: ${e.exact ? `EXACT match → chunk ${e.matched_index}` : `NO MATCH ("${String(e.received).slice(0, 40)}…")`}`,
  );
}
if (events.length === 0) {
  console.error(result.stderr.slice(-2000));
  rmSync(workDir, { recursive: true, force: true });
  fail(`the shim was never called — this measures nothing. Read benchmark/ack-roundtrip/${stamp}/worker-stderr.txt`);
}

// Whether the oversized chunk was ACTUALLY trimmed, established from witness tags the worker reported
// rather than assumed from its size.
const reportedValues = new Set(
  (result.stdout.match(/W\d+:([0-9a-f]{10})/g) ?? []).map((t) => t.split(":")[1]!),
);
const big = chunks.find((c) => c.expect === "trimmed")!;
const witnessSurvived = big.witnesses.filter((w) => reportedValues.has(w)).length;
const witnessMap = big.witnesses.map((w) => (reportedValues.has(w) ? "#" : ".")).join("");
const bigWasTrimmed = witnessSurvived > 0 && witnessSurvived < WITNESSES;
console.log(
  `\n--- was the oversized chunk actually trimmed? ---\n` +
    `  chunk ${big.index} witnesses [${witnessMap}] ${witnessSurvived}/${WITNESSES} reported → ` +
    (bigWasTrimmed
      ? "TRIMMED (measured)"
      : witnessSurvived === WITNESSES
        ? "INTACT — so this run cannot test fail-closed at all"
        : "worker reported no witnesses — inconclusive"),
);

console.log("\n--- verdict per chunk ---");
const rows: Record<string, unknown>[] = [];
let mechanismWorks = false;
let failClosedHeld = true;
let mangled = 0;
for (const c of chunks) {
  const served = events.some((e) => e.event === "served" && e.index === c.index);
  const acked = events.some((e) => e.event === "ack" && e.exact && e.matched_index === c.index);
  const verdict = !served
    ? "NOT SERVED — worker never read it"
    : c.expect === "intact"
      ? acked
        ? "ACK EXACT — round trip works, value arrived byte-identical"
        : "*** NO ACK *** — an under-ceiling chunk failed to come back: honest-worker cost or a broken path"
      : !bigWasTrimmed
        ? "INCONCLUSIVE — this chunk was not measurably trimmed, so it tests nothing about fail-closed"
        : acked
          ? "*** ACK ON A MEASURABLY TRIMMED CHUNK *** — the mid challenge SURVIVED while body regions did not"
          : "no ack, as required — the trim took the mid challenge with the body (fail-closed held)";
  if (c.expect === "intact" && acked) mechanismWorks = true;
  if (c.expect === "intact" && served && !acked) mangled += 1;
  if (c.expect === "trimmed" && acked && bigWasTrimmed) failClosedHeld = false;
  console.log(`  chunk ${c.index} (${c.text.length} chars, expect ${c.expect}): ${verdict}`);
  rows.push({ index: c.index, chars: c.text.length, expect: c.expect, served, acked, verdict });
}

const unmatched = events.filter((e) => e.event === "ack" && !e.exact);
writeFileSync(
  path.join(evidenceDir, "verdict.json"),
  JSON.stringify(
    { codex_version: "0.145.0", model: MODEL, effort: EFFORT, tool_output_token_limit: TOKEN_LIMIT,
      challenge_bits: CHALLENGE_BYTES * 8, rows, unmatched_acks: unmatched, events },
    null, 2,
  ),
  "utf8",
);
rmSync(workDir, { recursive: true, force: true });

console.log("\n--- what this licenses ---");
console.log(
  mechanismWorks
    ? "  ROUND TRIP + ARGUMENT FIDELITY: available. A value delivered in a result came back byte-identical\n" +
        "  in a later call argument, judged by the server that minted it."
    : "  ROUND TRIP: NOT demonstrated. Design 3's delivered/emitted transition has no measured carrier —\n" +
        "  do not build on it until this passes.",
);
console.log(
  `  HONEST-WORKER COST: ${mangled} of ${chunks.filter((c) => c.expect === "intact").length} under-ceiling chunks failed to acknowledge` +
    `${unmatched.length > 0 ? ` · ${unmatched.length} non-matching ack(s) sent` : ""}.`,
);
console.log(
  !bigWasTrimmed
    ? "  FAIL-CLOSED: NOT TESTED this run — the oversized chunk was not measurably trimmed. Draw no\n" +
        "  conclusion about mid-placement from it."
    : failClosedHeld
      ? "  FAIL-CLOSED (hardening only): the measurably trimmed chunk produced no valid ack, so mid-placement\n" +
          "  failed closed HERE. One version's trim geometry — hardening, never the soundness argument."
      : "  FAIL-CLOSED: DID NOT HOLD, and it is now MEASURED: body regions were lost while the mid challenge\n" +
          "  came back exactly. This is direct empirical support for the cross-family reviewer's thesis that no\n" +
          "  in-band position is sound. Rely solely on the atomic-frame invariant.",
);
console.log(`\nevidence → benchmark/ack-roundtrip/${stamp}/`);
