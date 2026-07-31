/**
 * What the worker's context actually received, measured from codex's own rollout.
 *
 * The §2차 write-up of this probe attributed "nothing attested" to F-3 (several pages merged into one
 * received record) and quoted record sizes of 810 / 45,138 / 47,451 chars. Re-measuring the promoted
 * run found neither: three pages arrived as three records, one per turn, each clipped to exactly
 * 40,149 chars. This script is how that was found and how the §3차 table is reproduced — the numbers
 * there are not transcribed by hand.
 *
 *   npx tsx development-records/benchmark/20260731-range-delivery-live-probe/measure-received-records.mts \
 *     ~/.codex/sessions/2026/07/31/rollout-*-019fb710-*.jsonl \
 *     ~/.codex/sessions/2026/07/31/rollout-*-019fb712-*.jsonl
 *
 * With no arguments it sweeps every rollout under $CODEX_HOME/sessions and prints only the received
 * record sizes — the sweep that showed no transcript anywhere produces the three quoted numbers.
 *
 * WHAT IT MEASURES, and why each column is separate:
 *
 *   canonical  the page the facade emitted (`JSON.stringify(page)`) — what reconciliation searches for
 *   envelope   `JSON.stringify(result)` — what codex renders into the transcript. NOT the same size:
 *              the page is carried TWICE (escaped in `content[0].text`, plain in `structuredContent`),
 *              so the envelope runs 2.09-2.27x the page and it is the envelope that gets clipped
 *   received   the record that reached the model, after codex's truncation
 *
 * The page-size budget bounds the first column. The clip lands on the second. That gap is the defect.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** codex's marker on a record it cut. Same string the production reader keys on. */
const TRUNCATION_MARKER = "Warning: truncated output";

interface Row {
  readonly timestamp: string;
  readonly kind: string;
  readonly callId: string | null;
  readonly text: string | null;
  readonly result: Record<string, any> | null;
}

function rowsOf(rolloutPath: string): Row[] {
  const out: Row[] = [];
  for (const line of readFileSync(rolloutPath, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    let record: Record<string, any>;
    try {
      record = JSON.parse(line) as Record<string, any>;
    } catch {
      continue;
    }
    const payload = (record.payload ?? {}) as Record<string, any>;
    const kind = String(payload.type ?? "");
    if (kind !== "mcp_tool_call_end" && kind !== "custom_tool_call_output") continue;
    const parts = payload.output;
    out.push({
      timestamp: String(record.timestamp ?? ""),
      kind,
      callId: typeof payload.call_id === "string" ? payload.call_id : null,
      text: Array.isArray(parts)
        // Concatenated exactly the way the production rollout reader concatenates it, so a size here
        // is the size the reconciliation search runs over.
        ? parts.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("")
        : null,
      result: (payload.result?.Ok ?? null) as Record<string, any> | null,
    });
  }
  return out;
}

function report(rolloutPath: string): void {
  const rows = rowsOf(rolloutPath);
  const emissions = rows.filter((row) => row.kind === "mcp_tool_call_end" && row.result !== null);
  const received = rows.filter((row) => row.kind === "custom_tool_call_output" && row.text !== null);

  console.log(`\n=== ${path.basename(rolloutPath)}`);
  console.log(`  emitted ${emissions.length} page(s) -> received ${received.length} record(s)`);

  if (emissions.length > 0) {
    console.log("  page | canonical | envelope | ratio | attestation copy is byte-identical");
    for (const [index, row] of emissions.entries()) {
      const result = row.result!;
      const canonical = String(result.content?.[0]?.text ?? "");
      const envelope = JSON.stringify(result).length;
      // The claim that decides which copy may be removed: reconciliation searches for `canonical`, and
      // `content[0].text` renders ESCAPED inside the envelope. Only the structured copy renders plain.
      const structuredMatches = JSON.stringify(result.structuredContent) === canonical;
      console.log(
        `  ${String(index).padStart(4)} | ${canonical.length.toLocaleString().padStart(9)} | ` +
          `${envelope.toLocaleString().padStart(8)} | ${(envelope / canonical.length).toFixed(3)} | ` +
          `structuredContent=${structuredMatches}`,
      );
    }
  }

  let previousMs = Number.NaN;
  for (const row of received) {
    const text = row.text!;
    if (text.length < 1_000) continue;
    const ms = new Date(row.timestamp).getTime();
    const gap = Number.isNaN(previousMs) ? "" : ` (+${((ms - previousMs) / 1000).toFixed(1)}s)`;
    previousMs = ms;
    const tokens = /original token count: (\d+)/.exec(text)?.[1];
    console.log(
      `  received ${text.length.toLocaleString().padStart(7)} chars${gap}` +
        (text.includes(TRUNCATION_MARKER) ? `  TRUNCATED (original tokens ${tokens})` : "  intact"),
    );
  }

  // A merge shows up as fewer large records than pages: one record then holds more than one payload,
  // and its reported original token count is well above a single page's.
  const large = received.filter((row) => (row.text ?? "").length >= 1_000);
  if (emissions.length > large.length) {
    console.log(
      `  -> MERGED: ${emissions.length} payload(s) rendered into ${large.length} record(s) (F-3)`,
    );
  } else if (emissions.length === large.length && emissions.length > 0) {
    console.log("  -> one record per page: no merge in this run");
  }
}

function sweep(root: string): void {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.startsWith("rollout-") && entry.endsWith(".jsonl")) found.push(full);
    }
  };
  walk(root);
  console.log(`sweeping ${found.length} rollout(s) under ${root}\n`);
  const clipped: number[] = [];
  for (const file of found.sort()) {
    const sizes = rowsOf(file)
      .filter((row) => row.kind === "custom_tool_call_output" && row.text !== null)
      .map((row) => row.text!.length);
    if (sizes.some((size) => size >= 1_000)) {
      console.log(`  ${path.basename(file).slice(8, 33)}  ${sizes.join(", ")}`);
    }
    for (const [index, row] of rowsOf(file).entries()) {
      void index;
      if (row.kind === "custom_tool_call_output" && row.text?.includes(TRUNCATION_MARKER)) {
        clipped.push(row.text.length);
      }
    }
  }
  if (clipped.length === 0) {
    // Non-vacuous: a sweep that found nothing to clip cannot say where the clip lands.
    console.log("\nno truncated record found — this sweep cannot bound the clip");
    return;
  }
  console.log(
    `\nclip: ${clipped.length} truncated record(s), ` +
      `min ${Math.min(...clipped).toLocaleString()} max ${Math.max(...clipped).toLocaleString()} chars`,
  );
}

const args = process.argv.slice(2);
if (args.length === 0) {
  sweep(path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "sessions"));
} else {
  for (const arg of args) report(arg);
}
