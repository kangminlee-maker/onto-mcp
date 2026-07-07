/**
 * R7 grounding-disagreement audit extractor for the B4 `synthesize-cert/v1`
 * bench (owner decision 2026-07-07, post opus-rejudge cut).
 *
 * The opus rejudge (scripts/b4-rejudge.mts) flipped the `metric_regression`
 * gate on grounding but disagreed with the original gpt-5.5 judge on a
 * meaningful number of individual rows. WHICH disagreement is genuine
 * (candidate hallucination the gpt-5.5 judge over-penalized as same-family
 * bias, vs. opus being too lenient on the negative arm's actual corruption)
 * is a semantic judgement — R7 human curation, never re-enforced
 * deterministically here. This script does PURE EXTRACTION only: it
 * reconstructs every disagreement's evidence (original packet, the arm's
 * actual output, and — for the negative arm — the mutated packet the arm
 * actually saw) from the run's own artifacts, with NO LLM call anywhere in
 * this file, and writes a human-readable audit file with a blank
 * `HUMAN VERDICT:` slot per case. It never re-judges, never re-labels, never
 * computes a verdict of its own beyond the deterministic pass/fail/pass/fail
 * comparison that DEFINES a "disagreement".
 *
 * Reuses (no re-implementation):
 *  - `foldSynthesizeCertProgressRows` / `coordinateKey` (synthesize-cert-loop.ts)
 *    to fold both progress sidecars and join them per coordinate.
 *  - `reconstructSynthesizeCertJudgeReplayInputs` (synthesize-cert-judge.ts) —
 *    the SAME content-hash join scripts/b4-rejudge.mts already proved 100% —
 *    to recover each arm's actual output from `local/live-calls.jsonl`.
 *  - `applyInputCorruptionV1` (synthesize-cert-mutation.ts) with the SAME
 *    mutationSeed derivation scripts/b4-rejudge.mts uses
 *    (`b4-${manifest_identity_sha256.slice(0,16)}`) to recover the exact
 *    mutated packet a negative_control row's arm call actually saw.
 *
 * Two extracted groups (grounding only — boundary is the known degenerate
 * metric per the rejudge comparison, out of scope here):
 *  - Group A (crux): arm=candidate, gpt-5.5 grounding=fail, opus grounding=pass.
 *    "Is this a genuine Haiku hallucination, or a gpt-5.5 same-family
 *    over-penalization?"
 *  - Group B (opus leniency check): arm=negative_control, gpt-5.5
 *    grounding=fail, opus grounding=pass. "Did opus miss real injected
 *    corruption?" — shown WITH the mutated packet the arm actually saw,
 *    since judging this case requires knowing what the arm was given.
 *
 * Output: `<runDir>/local/r7-grounding-audit.md` (GITIGNORED — carries full
 * packet prose incl. child_summaries, the same source-safety class as
 * `local/packets.json`/`local/live-calls.jsonl`; never a tracked path).
 *
 * Console output is SOURCE-SAFE ONLY: group counts and the output file path.
 * No packet/summary prose is ever written to stdout.
 *
 * Usage: npx tsx scripts/b4-r7-audit.mts --run-dir <dir>
 * Zero spend: no LLM call anywhere in this file (read-only over run artifacts).
 */
import fs from "node:fs/promises";
import path from "node:path";
import type {
  SemanticSynthesisInput,
  SemanticSynthesisOutput,
} from "../src/core-runtime/reconstruct/comprehension-semantic-map.ts";
import { projectSemanticMapSynthesisOutput } from "../src/core-runtime/reconstruct/run.ts";
import { parseSynthesizeCertFreezeCheckpoint } from "../src/core-runtime/discovery/synthesize-cert-packet.ts";
import {
  coordinateKey,
  foldSynthesizeCertProgressRows,
  synthesizeCertOutputSha256,
} from "../src/core-runtime/discovery/synthesize-cert-loop.ts";
import {
  reconstructSynthesizeCertJudgeReplayInputs,
  type SynthesizeCertCapturedCall,
} from "../src/core-runtime/discovery/synthesize-cert-judge.ts";
import { applyInputCorruptionV1 } from "../src/core-runtime/discovery/synthesize-cert-mutation.ts";
import type { SynthesizeCertJudgementRow } from "../src/core-runtime/discovery/synthesize-cert-record.ts";

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[b4-r7-audit ${ts()}] ${m}`);

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let runDir: string | null = null;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--run-dir") runDir = argv[++i] ?? null;
  else throw new Error(`b4-r7-audit: unknown arg '${arg}'`);
}
if (runDir === null) {
  throw new Error("b4-r7-audit: --run-dir <dir> is required (the run to audit — must carry both judgement-rows.progress.jsonl and rejudge-rows.progress.jsonl).");
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}
async function readJsonl(filePath: string): Promise<Record<string, unknown>[]> {
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// ── S0: load run artifacts (read-only, no LLM anywhere in this file) ─────────
log(`loading run dir ${runDir}`);
const checkpointRaw = (await readJson(path.join(runDir, "local", "freeze-checkpoint.json"))) as {
  manifest_identity_sha256: string;
  packets: Array<{ input_id: string }>;
};
const checkpoint = parseSynthesizeCertFreezeCheckpoint(checkpointRaw, {
  expectedManifestIdentitySha256: checkpointRaw.manifest_identity_sha256,
  expectedInputIds: checkpointRaw.packets.map((p) => p.input_id),
});
const originalPacketsByInputId = new Map<string, SemanticSynthesisInput>(
  checkpoint.packets.map((p) => [p.input_id, p.packet]),
);
log(`checkpoint verified: ${checkpoint.packets.length} packets`);

const rawOldRows = await readJsonl(path.join(runDir, "local", "judgement-rows.progress.jsonl"));
const oldRows = foldSynthesizeCertProgressRows(rawOldRows as unknown as SynthesizeCertJudgementRow[]);
log(`gpt-5.5 (original) judge rows: folded ${rawOldRows.length} raw line(s) into ${oldRows.length} coordinate row(s)`);

const rawNewRows = await readJsonl(path.join(runDir, "local", "rejudge-rows.progress.jsonl"));
const newRows = foldSynthesizeCertProgressRows(rawNewRows as unknown as SynthesizeCertJudgementRow[]);
log(`opus (rejudge) judge rows: folded ${rawNewRows.length} raw line(s) into ${newRows.length} coordinate row(s)`);

const rawLiveCalls = await readJsonl(path.join(runDir, "local", "live-calls.jsonl"));
const capturedCalls: SynthesizeCertCapturedCall[] = rawLiveCalls.map((c) => ({
  seq: c.seq as number,
  role: c.role as string,
  text: typeof c.text === "string" ? c.text : null,
}));

const mutationSeed = `b4-${checkpointRaw.manifest_identity_sha256.slice(0, 16)}`; // mirrors scripts/b4-rejudge.mts's derivation exactly

// ── S1: reconstruct every arm's actual output (same 100%-join scripts/b4-rejudge.mts proved) ──
const replay = reconstructSynthesizeCertJudgeReplayInputs({
  rows: oldRows,
  originalPacketsByInputId,
  capturedCalls,
  projectArmOutput: projectSemanticMapSynthesisOutput,
  hashArmOutput: synthesizeCertOutputSha256,
});
if (replay.unmatched.length > 0) {
  console.error("[b4-r7-audit] RECONSTRUCTION FAILED — ok row(s) with no matching captured call (fail-closed, refusing to proceed):");
  for (const row of replay.unmatched) console.error(`  ${row.row_id}`);
  process.exit(1);
}
const armOutputByRowId = new Map<string, SemanticSynthesisOutput>(
  replay.matched.map((pair) => [pair.row.row_id, pair.judgeInput.arm_output]),
);
log(`reconstruction: ${replay.matched.length} matched, 0 unmatched`);

// ── S2: join gpt-5.5 vs opus per coordinate, extract grounding mismatches ────
interface GroundingMismatch {
  old: SynthesizeCertJudgementRow;
  new_: SynthesizeCertJudgementRow;
}
const oldByCoord = new Map(oldRows.map((r) => [coordinateKey(r.input_id, r.rep, r.arm), r]));
const newByCoord = new Map(newRows.map((r) => [coordinateKey(r.input_id, r.rep, r.arm), r]));
const mismatches: GroundingMismatch[] = [];
for (const [key, oldRow] of oldByCoord) {
  const newRow = newByCoord.get(key);
  if (!newRow) continue; // not rejudged (out of scope for this audit)
  if (oldRow.judge_status !== "ok" || newRow.judge_status !== "ok") continue; // not decisively comparable
  if (oldRow.metrics.grounding === newRow.metrics.grounding) continue; // no mismatch
  mismatches.push({ old: oldRow, new_: newRow });
}

const groupA = mismatches.filter(
  (m) => m.old.arm === "candidate" && m.old.metrics.grounding === "fail" && m.new_.metrics.grounding === "pass",
);
const groupB = mismatches.filter(
  (m) => m.old.arm === "negative_control" && m.old.metrics.grounding === "fail" && m.new_.metrics.grounding === "pass",
);

// ── S3: render the audit file (full prose — gitignored local/ sidecar only) ──
function renderPacket(p: SemanticSynthesisInput): string {
  return JSON.stringify(
    { format_clusters: p.format_clusters, value_shape_seams: p.value_shape_seams, child_summaries: p.child_summaries },
    null,
    2,
  );
}
function renderArmOutput(o: SemanticSynthesisOutput): string {
  return JSON.stringify({ semantic_summary: o.semantic_summary, boundaries: o.boundaries }, null, 2);
}
function renderCase(m: GroundingMismatch, withMutatedPacket: boolean): string {
  const original = originalPacketsByInputId.get(m.old.input_id);
  const armOutput = armOutputByRowId.get(m.old.row_id);
  if (!original || !armOutput) {
    throw new Error(`b4-r7-audit: missing reconstructed evidence for ${m.old.row_id} (fail-closed — should be unreachable after the 100%-join check above)`);
  }
  const lines: string[] = [];
  lines.push(`### ${m.old.row_id}`);
  lines.push("");
  lines.push(`- input_id: \`${m.old.input_id}\` · rep: ${m.old.rep} · arm: \`${m.old.arm}\``);
  lines.push(`- gpt-5.5 verdict: grounding=**${m.old.metrics.grounding}**, boundary=${m.old.metrics.boundary}`);
  lines.push(`- opus verdict: grounding=**${m.new_.metrics.grounding}**, boundary=${m.new_.metrics.boundary}`);
  lines.push("");
  lines.push("**original_packet**" + (withMutatedPacket ? " (uncorrupted)" : ""));
  lines.push("```json");
  lines.push(renderPacket(original));
  lines.push("```");
  if (withMutatedPacket) {
    const mutated = applyInputCorruptionV1(original, { seed: mutationSeed }).mutated;
    lines.push("");
    lines.push("**mutated_packet (what the arm actually saw)**");
    lines.push("```json");
    lines.push(renderPacket(mutated));
    lines.push("```");
  }
  lines.push("");
  lines.push(`**arm output (${m.old.arm})**`);
  lines.push("```json");
  lines.push(renderArmOutput(armOutput));
  lines.push("```");
  lines.push("");
  lines.push("HUMAN VERDICT: ____");
  lines.push("");
  lines.push("---");
  return lines.join("\n");
}

const mdLines: string[] = [];
mdLines.push("# R7 Grounding Disagreement Audit");
mdLines.push("");
mdLines.push(`Run dir: \`${runDir}\``);
mdLines.push("");
mdLines.push("## Summary (source-safe)");
mdLines.push("");
mdLines.push(`- Group A (candidate, gpt-5.5 grounding=fail → opus grounding=pass — crux): ${groupA.length}`);
mdLines.push(`- Group B (negative_control, gpt-5.5 grounding=fail → opus grounding=pass — opus leniency check): ${groupB.length}`);
mdLines.push(`- Total grounding mismatches (any arm, any direction, both judges decisive): ${mismatches.length}`);
mdLines.push("");
mdLines.push("Fill in `HUMAN VERDICT:` per case below. This file is a pure extraction — no LLM judged or re-judged anything here.");
mdLines.push("");
mdLines.push("---");
mdLines.push("");
mdLines.push("## Group A — candidate grounding fail→pass");
mdLines.push("");
mdLines.push("Question: is this a genuine Haiku hallucination the gpt-5.5 judge correctly caught, or a gpt-5.5 same-family over-penalization opus correctly waves through?");
mdLines.push("");
for (const m of groupA) mdLines.push(renderCase(m, false));
mdLines.push("");
mdLines.push("## Group B — negative_control grounding fail→pass");
mdLines.push("");
mdLines.push("Question: did opus miss real injected corruption (relabel/v1 lever), or was the gpt-5.5 judge over-penalizing here too?");
mdLines.push("");
for (const m of groupB) mdLines.push(renderCase(m, true));

const outPath = path.join(runDir, "local", "r7-grounding-audit.md");
await fs.writeFile(outPath, `${mdLines.join("\n")}\n`);

// ── console: SOURCE-SAFE summary only — never prose ─────────────────────────
log(`group A (candidate fail→pass): ${groupA.length}`);
log(`group B (negative_control fail→pass): ${groupB.length}`);
log(`total grounding mismatches: ${mismatches.length}`);
log(`audit file written → ${outPath}`);
