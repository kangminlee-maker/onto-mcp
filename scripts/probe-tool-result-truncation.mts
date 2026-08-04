/**
 * MEASUREMENT, not a feature: does codex truncate an MCP tool result before the model sees it, and if so
 * WHERE does it cut?
 *
 * Why it decides an architecture. Both redesign drafts name this CRITICAL, and it is not only a redesign
 * question — the CURRENTLY COMMITTED stage-3b code claims "coverage complete" from parts it emitted. The
 * runtime cannot see the cut: codex truncates between the MCP server and the model, so the façade emits
 * whole bytes and never learns they were trimmed. Only the model sees the result that actually arrived.
 *
 * What static inspection settled first (codex-cli 0.145.0, no dispatch spent):
 *   - `tool_output_token_limit` is a real top-level config key, so it is settable with `-c`.
 *   - `utils/string/src/truncate.rs` carries the markers " chars truncated" and " tokens truncated".
 *   - a separate context-level cut exists: "Output exceeded the available model context and was truncated".
 *
 * INSTRUMENT DESIGN — and why the obvious one is unsound.
 *
 * The first version of this probe asked the model for the lowest and highest marker it could see plus a
 * nonce at the tail. That cannot distinguish a lossless result from a middle-elided one: if the cut takes
 * the MIDDLE and keeps both ends, the lowest marker, the highest marker AND the tail nonce all survive.
 * Its only discriminator was whether the model volunteered the truncation banner — a model self-report,
 * i.e. exactly the kind of evidence this whole layer exists because it cannot trust. A quiet model would
 * have produced a false LOSSLESS. Measured: `--limit=500` read LOSSLESS while `--limit=1000` truncated.
 *
 * So survival is measured POSITIONALLY instead. Each payload carries an unguessable nonce at each of
 * QUANTILES evenly spaced offsets. The model reports the nonces it can see. A nonce cannot be guessed or
 * extrapolated from the pattern, so the set of nonces returned is a direct map of which REGIONS of the
 * payload reached the model — with no reliance on the model noticing or admitting anything:
 *
 *   all present            → LOSSLESS
 *   ends present, gap      → MIDDLE_ELIDED   (a tail sentinel proves nothing about the body)
 *   leading run only       → HEAD_KEPT
 *   trailing run only      → TAIL_KEPT
 *
 * Two independent filler patterns alternate across the ladder, so a surviving size is not an artifact of
 * one fixture's compressibility. Ground truth is recorded on both sides: the shim logs the exact
 * serialized bytes it emitted per call, so "emitted 128KB, model saw 8KB" is distinguishable from "the
 * shim never ran".
 *
 * Costs one real dispatch per invocation. Run deliberately:
 *   npx tsx scripts/probe-tool-result-truncation.mts --self-test     # spends nothing
 *   npx tsx scripts/probe-tool-result-truncation.mts
 *   npx tsx scripts/probe-tool-result-truncation.mts --sizes=32000 --limit=1000
 *
 * Evidence lands under benchmark/tool-result-truncation/<timestamp>/.
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

/** Probe points evenly spaced through each payload. 9 gives eighth-of-payload resolution on the cut. */
const QUANTILES = 9;
/** Chosen to straddle any plausible token default: ~500 / ~2k / ~8k / ~32k tokens at ~4 chars per token. */
const DEFAULT_SIZES = [2_000, 8_000, 32_000, 128_000];

const argOf = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1];

const limit = argOf("limit");
const sizes = (argOf("sizes")?.split(",").map((s) => Number(s.trim())) ?? DEFAULT_SIZES).filter(
  (n) => Number.isFinite(n) && n >= 1_000,
);

const fail: (message: string) => never = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};
const ok = (message: string): void => console.log(`  ✓ ${message}`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const evidenceDir = path.join(REPO_ROOT, "benchmark", "tool-result-truncation", stamp);
mkdirSync(evidenceDir, { recursive: true });

const workDir = mkdtempSync(path.join(os.tmpdir(), "trunc-probe-"));
const payloadFile = path.join(workDir, "payloads.json");
const shimLog = path.join(workDir, "shim-log.jsonl");

/**
 * Two independent fillers. If only one pattern survived a size, the result would be a statement about
 * that pattern (entropy, tokenizer behaviour) rather than about the size.
 */
const FILLERS: Record<string, (i: number) => string> = {
  alpha: (i) => `the quick brown fox jumps over the lazy dog number ${i} `,
  hex: (i) => `${((i * 2654435761) >>> 0).toString(16).padStart(8, "0")} `,
};

/** Places one unguessable probe tag at each quantile offset, separated by filler. */
const buildPayload = (size: number, fillerName: string, nonces: string[]): string => {
  const filler = FILLERS[fillerName]!;
  const out: string[] = [];
  let len = 0;
  let fillerIndex = 0;
  for (let q = 0; q < QUANTILES; q += 1) {
    const tag = `[Q${q}:${nonces[q]}]`;
    // Last tag sits flush at the tail; the others at their share of the payload.
    const target = q === QUANTILES - 1 ? size - tag.length : Math.round((q * size) / (QUANTILES - 1));
    while (len < target) {
      const piece = filler(fillerIndex++);
      out.push(piece);
      len += piece.length;
    }
    out.push(tag);
    len += tag.length;
  }
  return out.join("");
};

/**
 * Forces one filler for every payload. Holding SIZE constant while changing token density is what
 * separates a byte-denominated cap from a token-denominated one: hex tokenizes to far more tokens per
 * character than prose, so if only hex is trimmed at a size prose survives, the cap counts tokens.
 */
const forcedFiller = argOf("filler");
if (forcedFiller !== undefined && !(forcedFiller in FILLERS)) {
  fail(`--filler=${forcedFiller} is not one of: ${Object.keys(FILLERS).join(", ")}`);
}

const payloads = sizes.map((size, k) => {
  const fillerName = forcedFiller ?? (k % 2 === 0 ? "alpha" : "hex");
  const nonces = Array.from({ length: QUANTILES }, () => randomBytes(5).toString("hex"));
  const text = buildPayload(size, fillerName, nonces);
  return { index: k, requested_size: size, filler: fillerName, nonces, text };
});
writeFileSync(payloadFile, JSON.stringify(payloads), "utf8");

for (const p of payloads) {
  ok(`payload ${p.index}: ${p.text.length} chars · filler=${p.filler} · ${QUANTILES} probe points`);
}

/** The child codex launches: serves a pre-built payload verbatim and records what it emitted. */
const shim = path.join(workDir, "shim.mjs");
writeFileSync(
  shim,
  `import { createInterface } from "node:readline";
import { readFileSync, appendFileSync } from "node:fs";
const payloads = JSON.parse(readFileSync(process.env.PROBE_PAYLOADS, "utf8"));
const LOG = process.env.PROBE_LOG;
const reply = (v) => {
  const s = JSON.stringify(v);
  process.stdout.write(s + "\\n");
  return s.length;
};
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
      description: "Returns a long tagged text for the given index.",
      inputSchema: { type: "object", properties: { index: { type: "number" } }, required: ["index"] } }] } });
  }
  if (m.method === "tools/call") {
    const idx = Number(m.params?.arguments?.index ?? -1);
    const p = payloads.find((q) => q.index === idx);
    if (!p) {
      return reply({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "NO_SUCH_INDEX" }], isError: true } });
    }
    const bytes = reply({ jsonrpc: "2.0", id: m.id,
      result: { content: [{ type: "text", text: p.text }], isError: false } });
    appendFileSync(LOG, JSON.stringify({ index: idx, payload_chars: p.text.length, serialized_frame_bytes: bytes }) + "\\n");
    return;
  }
  if (m.id !== undefined) reply({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no" } });
});
`,
  "utf8",
);
writeFileSync(shimLog, "", "utf8");

/**
 * Negative control for the harness itself. Without it, a truncation verdict is ambiguous between "codex
 * cut the result" and "my shim never emitted the whole thing". Drives the shim over real stdio with no
 * codex involved and requires the served text to be byte-identical to the built payload. Spends nothing.
 */
if (process.argv.includes("--self-test")) {
  const child = spawn(process.execPath, [shim], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, PROBE_PAYLOADS: payloadFile, PROBE_LOG: shimLog },
  });
  let buf = "";
  const seen = new Map<number, string>();
  child.stdout.on("data", (c) => {
    buf += String(c);
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const msg = JSON.parse(line);
      if (typeof msg.id === "number" && msg.id >= 100) {
        seen.set(msg.id - 100, msg.result?.content?.[0]?.text ?? "");
      }
    }
  });
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n` +
      payloads
        .map((p) =>
          JSON.stringify({
            jsonrpc: "2.0",
            id: 100 + p.index,
            method: "tools/call",
            params: { name: "probe_fetch", arguments: { index: p.index } },
          }),
        )
        .join("\n") +
      "\n",
  );
  await new Promise((r) => setTimeout(r, 1500));
  child.stdin.end();
  child.kill();
  let bad = 0;
  for (const p of payloads) {
    const got = seen.get(p.index);
    if (got === p.text && p.nonces.every((n) => got.includes(n))) {
      ok(`self-test index ${p.index}: ${p.text.length} chars round-tripped byte-identical, all tags present`);
    } else {
      bad += 1;
      console.error(`  ✗ self-test index ${p.index}: expected ${p.text.length} chars, got ${got?.length ?? "NOTHING"}`);
    }
  }
  rmSync(workDir, { recursive: true, force: true });
  rmSync(evidenceDir, { recursive: true, force: true });
  if (bad > 0) fail(`${bad} payload(s) did not survive the harness itself — fix before spending a dispatch.`);
  console.log("\nSELF-TEST PASS — the harness delivers every size intact. Any loss seen live is codex's.");
  process.exit(0);
}

const indexList = payloads.map((p) => p.index).join(", ");
/**
 * Separates cumulative-context truncation from worker laziness. Reporting N payloads means copying
 * N*QUANTILES nonces, and a worker that under-lists under that burden is indistinguishable from a
 * worker that received less. With --report-only the worker still FETCHES the whole ladder (so the
 * cumulative condition is reproduced) but describes a single result, holding the copy burden at exactly
 * what a single-payload run costs. A loss that survives this control is not laziness.
 */
const reportOnlyRaw = argOf("report-only");
const reportOnly = reportOnlyRaw === undefined ? undefined : Number(reportOnlyRaw);
if (reportOnly !== undefined && !payloads.some((p) => p.index === reportOnly)) {
  fail(`--report-only=${reportOnly} names no payload in this ladder (indices ${indexList}).`);
}
const reportedIndices = reportOnly === undefined ? payloads.map((p) => p.index) : [reportOnly];

const prompt = `You are measuring a tool, not writing code. Follow these steps literally.

Call the tool probe_fetch once for EACH index in this order: ${indexList}.
Each call takes exactly {"index": <k>}. That is ${payloads.length} calls total. Make every one of these
calls even if you are only asked to describe some of them.

Each result is a long text containing tags of the form [Q0:value] [Q1:value] ... [Q${QUANTILES - 1}:value],
spread from the beginning to the end of the text, separated by filler text.

${
  reportOnly === undefined
    ? "For each index, report the tags that are ACTUALLY PRESENT in the text you received:"
    : `Report ONLY for index ${reportOnly}. Ignore the other results entirely — do not describe them.\nFor index ${reportOnly}, report the tags that are ACTUALLY PRESENT in the text you received:`
}
  seen   = every tag you can find, as Q<number>:<value>, comma separated, in order.
           Copy each value exactly. If a tag is not present in the text, leave it out.
  notice = any text in the result that is not filler or a tag -- for example a note saying content was
           omitted, elided or truncated -- quoted verbatim. If there is no such text, write NONE.

The values are random. Never guess, infer or reconstruct a value: if you cannot see a tag, omitting it
is the correct answer. Some results may be missing tags from the middle; that is an expected outcome and
you should report it exactly as you find it.

Then reply with EXACTLY ${reportedIndices.length} line${reportedIndices.length === 1 ? "" : "s"} and nothing else, in this format:
IDX <k> seen=<Q0:value,Q1:value,...> notice=<verbatim text or NONE>`;

writeFileSync(path.join(evidenceDir, "prompt.txt"), prompt, "utf8");

const args = [
  "exec",
  "--skip-git-repo-check",
  "--sandbox",
  "read-only",
  "--ignore-user-config",
  "--disable",
  "apps",
  "--disable",
  "shell_tool",
  "--model",
  MODEL,
  "--cd",
  REPO_ROOT,
  "-c",
  `model_reasoning_effort="${EFFORT}"`,
  ...(limit === undefined ? [] : ["-c", `tool_output_token_limit=${limit}`]),
  "-c",
  `mcp_servers.probe.command=${JSON.stringify(process.execPath)}`,
  "-c",
  `mcp_servers.probe.args=[${JSON.stringify(shim)}]`,
  "-c",
  `mcp_servers.probe.env.PROBE_PAYLOADS=${JSON.stringify(payloadFile)}`,
  "-c",
  `mcp_servers.probe.env.PROBE_LOG=${JSON.stringify(shimLog)}`,
  "-c",
  'mcp_servers.probe.default_tools_approval_mode="approve"',
  "-c",
  "mcp_servers.probe.startup_timeout_sec=30",
  "-",
];

console.log(
  `\n  … dispatching ${MODEL} (one real call) · tool_output_token_limit=${limit ?? "<default, unset>"}`,
);
const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
  const child = spawn(CODEX_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += String(chunk)));
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));
  child.stdin.write(prompt);
  child.stdin.end();
  child.on("exit", (code) => resolve({ code, stdout, stderr }));
});

const served = existsSync(shimLog)
  ? readFileSync(shimLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];

writeFileSync(path.join(evidenceDir, "worker-stdout.txt"), result.stdout, "utf8");
writeFileSync(path.join(evidenceDir, "worker-stderr.txt"), result.stderr, "utf8");
writeFileSync(
  path.join(evidenceDir, "served.json"),
  JSON.stringify({ codex_exit: result.code, tool_output_token_limit: limit ?? null, served }, null, 2),
  "utf8",
);

console.log(`\n--- codex exit ${result.code} ---\n${result.stdout.trim()}\n`);
console.log("--- shim actually emitted ---");
for (const s of served) {
  console.log(`  index ${s.index}: payload ${s.payload_chars} chars → frame ${s.serialized_frame_bytes} bytes`);
}

if (served.length === 0) {
  console.error(result.stderr.slice(-2000));
  rmSync(workDir, { recursive: true, force: true });
  fail(
    "the shim never served a call: the worker did not reach the tool at all. This measures nothing " +
      `about truncation — read benchmark/tool-result-truncation/${stamp}/worker-stderr.txt first.`,
  );
}

/**
 * Attribution is by nonce, never by the worker's own IDX label: a truncated run was observed reporting
 * one payload's content under another payload's label. Nonces are unguessable, so they identify the
 * payload a line really describes.
 */
const reported = new Map<number, { present: boolean[]; notice: string; claimed: number }>();
const mislabelled: string[] = [];
for (const line of result.stdout.split("\n")) {
  const m = line.match(/IDX\s+(\d+)\s+seen=(.*?)\s+notice=(.*)$/);
  if (!m) continue;
  const claimed = Number(m[1]);
  const values = new Set((m[2] ?? "").split(",").map((s) => s.split(":").pop()?.trim()).filter(Boolean));
  // Whichever payload the reported nonces belong to is the payload this line describes.
  let best = { index: claimed, hits: -1 };
  for (const p of payloads) {
    const hits = p.nonces.filter((n) => values.has(n)).length;
    if (hits > best.hits) best = { index: p.index, hits };
  }
  const target = payloads[best.index]!;
  if (best.index !== claimed) mislabelled.push(`claimed IDX ${claimed} → payload ${best.index}`);
  reported.set(best.index, {
    present: target.nonces.map((n) => values.has(n)),
    notice: (m[3] ?? "").trim(),
    claimed,
  });
}
if (mislabelled.length > 0) {
  console.log(`\n⚠ worker mislabelled lines; re-attributed by nonce: ${mislabelled.join(", ")}`);
}

console.log("\n--- verdict per size ---");
const rows: Record<string, unknown>[] = [];
let anyTruncation = false;
let anyMiddleElided = false;
let anyUnreported = false;

for (const p of payloads) {
  const meta = {
    index: p.index,
    requested_size: p.requested_size,
    actual_chars: p.text.length,
    filler: p.filler,
    nonces: p.nonces,
  };
  const r = reported.get(p.index);
  const emitted = served.find((s) => s.index === p.index);
  if (!reportedIndices.includes(p.index)) {
    // Fetched to create cumulative pressure, deliberately not described. Silence here is by design and
    // must not be read as either loss or losslessness.
    console.log(
      `  size ${p.requested_size}: ${emitted ? "fetched" : "NOT FETCHED"} · not described (--report-only)`,
    );
    rows.push({ ...meta, outcome: emitted ? "fetched_undescribed" : "not_served" });
    if (!emitted) anyUnreported = true;
    continue;
  }
  if (!emitted) {
    console.log(`  size ${p.requested_size}: NOT SERVED — the worker never called this index`);
    rows.push({ ...meta, outcome: "not_served" });
    anyUnreported = true;
    continue;
  }
  if (!r) {
    console.log(`  size ${p.requested_size}: SERVED but the worker did not report it`);
    rows.push({ ...meta, outcome: "served_unreported" });
    anyUnreported = true;
    continue;
  }
  const map = r.present.map((v) => (v ? "#" : ".")).join("");
  const missing = r.present.filter((v) => !v).length;
  const noticed = r.notice.toUpperCase() !== "NONE" && r.notice !== "";
  if (missing === 0) {
    console.log(`  size ${p.requested_size}: LOSSLESS  [${map}] all ${QUANTILES} probe points returned`);
    rows.push({ ...meta, outcome: "lossless", survival_map: map, notice: noticed ? r.notice : null });
    continue;
  }
  anyTruncation = true;
  const firstSeen = r.present.indexOf(true);
  const lastSeen = r.present.lastIndexOf(true);
  const gapInside = r.present.slice(firstSeen, lastSeen).some((v) => !v);
  const shape =
    firstSeen === -1
      ? "NOTHING_ARRIVED"
      : gapInside && r.present[0] && r.present[QUANTILES - 1]
        ? "MIDDLE_ELIDED"
        : r.present[0]
          ? "HEAD_KEPT"
          : "TAIL_KEPT";
  if (shape === "MIDDLE_ELIDED") anyMiddleElided = true;
  console.log(
    `  size ${p.requested_size}: TRUNCATED (${shape})  [${map}] ${missing}/${QUANTILES} probe points lost · ` +
      `notice ${noticed ? `MARKED: ${r.notice}` : "*** not reported by the worker ***"}`,
  );
  rows.push({
    ...meta,
    outcome: "truncated",
    shape,
    survival_map: map,
    probe_points_lost: missing,
    notice: noticed ? r.notice : null,
  });
}

writeFileSync(
  path.join(evidenceDir, "verdict.json"),
  JSON.stringify(
    {
      codex_version: "0.145.0",
      model: MODEL,
      effort: EFFORT,
      tool_output_token_limit: limit ?? null,
      quantiles: QUANTILES,
      rows,
    },
    null,
    2,
  ),
  "utf8",
);

rmSync(workDir, { recursive: true, force: true });

console.log(`\nevidence → benchmark/tool-result-truncation/${stamp}/`);
if (anyUnreported) {
  console.log(
    "\n⚠ INCOMPLETE — a size was not served or not reported, so the ladder has a hole.\n" +
      "  That is not evidence of losslessness. Read worker-stdout.txt before concluding anything.",
  );
}
if (anyMiddleElided) {
  console.log(
    "\n*** MIDDLE ELISION OBSERVED ***\n" +
      "  Both ends of a truncated result reached the model while the body did not. A sentinel, token or\n" +
      "  challenge placed at the END of a chunk therefore proves NOTHING about the chunk's body — it\n" +
      "  arrives intact on a result that lost its middle. Both redesign drafts place their delivery proof\n" +
      "  exactly there (fable: witness token in the response; gpt: challenge at the end).",
  );
}
console.log(
  anyTruncation
    ? "\nTRUNCATION OBSERVED at this setting."
    : "\nNo truncation at any size on this ladder — bounded to the sizes TESTED, this model, this limit, N=1.",
);
