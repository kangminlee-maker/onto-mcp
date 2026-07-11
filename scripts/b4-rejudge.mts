/**
 * B4 `synthesize-cert/v1` REJUDGE harness — swaps the judge lens to an
 * independent model family over an ALREADY-CAPTURED live run, without
 * re-spending any arm synthesize call (design 20260706-b4-r8-harness-design
 * v3 §7 "R7 judge replay"; owner decision 2026-07-07).
 *
 * Motivation: a completed live run's judge and baseline arm shared one model
 * family (openai/gpt-5.5), so a candidate<baseline `metric_regression` gate
 * failure is confounded by same-family judge bias. This harness reconstructs
 * every `ok` coordinate's {original_packet, arm_output} pair by CONTENT-HASH
 * join over the run's own capture (`local/freeze-checkpoint.json` +
 * `local/judgement-rows.progress.jsonl` + `local/live-calls.jsonl` — never
 * re-observes the source fixture, never re-dispatches an arm), then
 * re-dispatches ONLY the judge call under an independent lens
 * (anthropic/claude-opus-4-8), reusing the SAME judge prompt
 * (synthesize-cert-judge.ts) and the SAME live-wiring helpers
 * (scripts/b4-live-realization.mts) the original live run used.
 *
 * Modes (LLM realization is switch-gated; MOCK IS THE DEFAULT — zero spend):
 *  - no --go : full pre-spend rehearsal. Reconstruction + 100% join +
 *    aggregate/validate/comparison scaffold run to completion against a
 *    DETERMINISTIC mock judge (createMockSynthesizeCertJudge) — proves the
 *    scaffold's correctness before any opus spend. Outputs land under
 *    `<runDir>/local/rejudge-mock-*` (gitignored, clearly mock-labeled —
 *    NEVER the tracked root paths a real rejudge would use).
 *  - --go : LIVE opus rejudge. Requires --run-dir. Quota-probes the opus
 *    seat, then re-dispatches the judge for every `ok` coordinate not
 *    already decisively rejudged (resumable via the progress sidecar).
 *
 * NOT reconstructed: the durable evidence CAPSULE
 * (synthesize-cert-capsule.json). Capsule assembly requires the ORIGINAL
 * run's S1 sampler provenance (per-input sampling_rank/nearest_unselected_id
 * + per-stratum pool_size/selected_count/seed/ordering/stride) — none of
 * which the original run persisted (it exited at the record gate BEFORE its
 * persist step) and none of which is deterministically re-derivable here
 * (the source fixture workbook is not available in this checkout). A
 * capsule-bound record requires a FRESH live run (scripts/b4-cert-run.mts),
 * not a rejudge. This is disclosed in the record's own
 * `reproduction.limitations` and this run's `rejudge-comparison.json`.
 *
 * Persistence (paths relative to --run-dir):
 *  - synthesize-cert-record.json  (tracked; --go only, only when the
 *    rejudged record recomputes to 0 `validateSynthesizeCertRecord`
 *    violations — labels itself RE-JUDGED, not a capsule-bound B5 record)
 *  - rejudge-comparison.json      (tracked, --go only, ALWAYS written:
 *    old-judge vs new-judge per-arm/per-metric pass/tot + means, regression
 *    flip flags, opus dispatch success/failure counts, record violations if
 *    any — source-safe: hashes/counts/flags only, no packet prose)
 *  - local/rejudge-opus-calls.jsonl      (gitignored, --go only: every raw
 *    opus judge call, tagged role="judge", shared terminal-abort harness)
 *  - local/rejudge-rows.progress.jsonl   (gitignored, --go only: one line
 *    per rejudged coordinate, incremental — folded into priors on a rerun)
 *  - local/rejudge-mock-record.json      (gitignored, mock rehearsal only)
 *  - local/rejudge-mock-comparison.json  (gitignored, mock rehearsal only)
 *  - local/rejudge-mock-rows.progress.jsonl (gitignored, mock rehearsal only)
 *
 * Usage: npx tsx scripts/b4-rejudge.mts --run-dir <dir> [--go] [--max-calls <n>]
 * --max-calls (--go only; default 300): the REMAINING forecast (ok
 * coordinates not already decisively rejudged) must not exceed this before
 * ANY spend (incl. the quota probe) — raise only with owner budget approval.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { projectSemanticMapSynthesisOutput } from "../src/core-runtime/reconstruct/run.ts";
import type { SemanticSynthesisInput } from "../src/core-runtime/reconstruct/comprehension-semantic-map.ts";
import { resolveLlmProviderConfig } from "../src/core-runtime/llm/llm-caller.ts";
import { parseSynthesizeCertFreezeCheckpoint } from "../src/core-runtime/discovery/synthesize-cert-packet.ts";
import {
  foldSynthesizeCertProgressRows,
  synthesizeCertOutputSha256,
  SynthesizeCertJudgeTimeout,
} from "../src/core-runtime/discovery/synthesize-cert-loop.ts";
import {
  assertSynthesizeCertJudgeVerdicts,
  reconstructSynthesizeCertJudgeReplayInputs,
  type SynthesizeCertCapturedCall,
} from "../src/core-runtime/discovery/synthesize-cert-judge.ts";
import { buildInputCorruptionV1NegativeArm } from "../src/core-runtime/discovery/synthesize-cert-mutation.ts";
import {
  computeSynthesizeCertAggregates,
  isDecisiveRow,
  parseSynthesizeCertRecord,
  SYNTHESIZE_CERT_ARMS,
  SYNTHESIZE_CERT_CONTRACT,
  SYNTHESIZE_CERT_METRICS,
  validateSynthesizeCertRecord,
  type SynthesizeCertArm,
  type SynthesizeCertJudgementRow,
  type SynthesizeCertMetric,
} from "../src/core-runtime/discovery/synthesize-cert-record.ts";
import {
  projectSynthesizeCertArmDispatch,
  synthesizeCertDispatchGuardViolations,
  type SynthesizeCertArmDispatch,
} from "../src/core-runtime/discovery/synthesize-cert-assemble.ts";
import { createMockSynthesizeCertJudge } from "../src/core-runtime/discovery/test-fixtures/synthesize-cert-mock-realization.ts";
import {
  createB4LiveCallHarness,
  createB4LiveSynthesizeCertJudge,
  runB4QuotaProbe,
} from "./b4-live-realization.mts";

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[b4-rejudge ${ts()}] ${m}`);

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let runDir: string | null = null;
let go = false;
let maxCalls = 300;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--run-dir") runDir = argv[++i] ?? null;
  else if (arg === "--go") go = true;
  else if (arg === "--max-calls") {
    const raw = argv[++i];
    const parsed = raw === undefined ? NaN : Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`b4-rejudge: --max-calls requires a positive integer, got '${raw}'`);
    }
    maxCalls = parsed;
  } else throw new Error(`b4-rejudge: unknown arg '${arg}'`);
}
if (runDir === null) {
  throw new Error("b4-rejudge: --run-dir <dir> is required (the completed live run to rejudge).");
}

const OPUS_MODEL = { provider: "anthropic" as const, model: "claude-opus-4-8" };
const ARM_ROLES = new Set<string>(SYNTHESIZE_CERT_ARMS);

// ── S0: load the run's own capture (no re-observation, no arm re-spend) ──────
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

log(`loading run dir ${runDir}`);
const checkpointRaw = (await readJson(path.join(runDir, "local", "freeze-checkpoint.json"))) as {
  manifest_identity_sha256: string;
  packets: Array<{ input_id: string }>;
};
const checkpoint = parseSynthesizeCertFreezeCheckpoint(checkpointRaw, {
  expectedManifestIdentitySha256: checkpointRaw.manifest_identity_sha256,
  expectedInputIds: checkpointRaw.packets.map((p) => p.input_id),
});
log(`checkpoint verified: ${checkpoint.packets.length} packets (identity ${checkpointRaw.manifest_identity_sha256.slice(0, 12)}…)`);

const originalPacketsByInputId = new Map<string, SemanticSynthesisInput>(
  checkpoint.packets.map((p) => [p.input_id, p.packet]),
);

const rawProgressRows = await readJsonl(path.join(runDir, "local", "judgement-rows.progress.jsonl"));
const foldedRows = foldSynthesizeCertProgressRows(
  rawProgressRows as unknown as SynthesizeCertJudgementRow[],
);
log(`folded ${rawProgressRows.length} raw progress line(s) into ${foldedRows.length} coordinate row(s)`);

const rawLiveCalls = await readJsonl(path.join(runDir, "local", "live-calls.jsonl"));
const capturedCalls: SynthesizeCertCapturedCall[] = rawLiveCalls.map((c) => ({
  seq: c.seq as number,
  role: c.role as string,
  text: typeof c.text === "string" ? c.text : null,
}));

// ── arm_prompt_sha256: derived from the run's OWN captured system prompt text
//    (never the current in-repo constant — a faithful re-derivation, immune
//    to any prompt drift since capture time) — every successful arm-role call
//    must share ONE sha (§6.2-4), asserted here before it is trusted. ──
const armPromptShas = new Set<string>();
for (const call of rawLiveCalls) {
  if (!ARM_ROLES.has(call.role as string)) continue;
  if (typeof call.text !== "string" || typeof call.systemPrompt !== "string") continue; // error captures truncate systemPrompt — excluded
  armPromptShas.add(crypto.createHash("sha256").update(call.systemPrompt).digest("hex"));
}
if (armPromptShas.size !== 1) {
  throw new Error(
    `b4-rejudge: captured arm calls do not share exactly one system-prompt sha (found ${armPromptShas.size}) — cannot faithfully derive arm_prompt_sha256 (fail-closed).`,
  );
}
const armPromptSha256 = [...armPromptShas][0]!;

// ── declared_reps: recovered from the rows themselves (max rep observed) —
//    the original harness always populates reps 1..declaredReps uniformly. ──
const declaredReps = foldedRows.reduce((max, r) => Math.max(max, r.rep), 0);
if (declaredReps < 1) throw new Error("b4-rejudge: no rows with rep >= 1 found — empty or corrupt progress capture.");

// ── baseline/candidate seat identity: read from the run's OWN preflight, not
//    a re-hardcoded literal (single-source of what the run actually declared). ──
interface PreflightSeatFields {
  baseline_reference_judge_seat?: string;
  candidate_negative_control_seat?: string;
  declared_dispatch?: unknown;
}
async function readPreflightSeats(): Promise<{
  baseline: { provider: string; model: string };
  candidate: { provider: string; model: string };
  declaredDispatch: unknown;
}> {
  let preflight: PreflightSeatFields | null = null;
  for (const name of ["preflight.json", "preflight.resume.json"]) {
    try {
      preflight = (await readJson(path.join(runDir!, name))) as PreflightSeatFields;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!preflight?.baseline_reference_judge_seat || !preflight.candidate_negative_control_seat) {
    throw new Error(`b4-rejudge: ${runDir}/preflight.json (or preflight.resume.json) missing seat identity fields — cannot determine arm_model without it.`);
  }
  const split = (s: string): { provider: string; model: string } => {
    const idx = s.indexOf("/");
    if (idx < 0) throw new Error(`b4-rejudge: malformed seat identity '${s}' (expected 'provider/model')`);
    return { provider: s.slice(0, idx), model: s.slice(idx + 1) };
  };
  return {
    baseline: split(preflight.baseline_reference_judge_seat),
    candidate: split(preflight.candidate_negative_control_seat),
    declaredDispatch: preflight.declared_dispatch,
  };
}
const seats = await readPreflightSeats();
log(`seats (from preflight): baseline/reference/original-judge=${seats.baseline.provider}/${seats.baseline.model}, candidate/negative_control=${seats.candidate.provider}/${seats.candidate.model}`);

// ── dispatch witness (effort-witness design §4.5.1-7): the rejudge record is
//    the actual B5 binding artifact (the registry-cited sonnet-5 record's
//    reproduction.command is this script) AND --go overwrites the fresh
//    record's path — so the SAME declared-vs-witnessed guard re-runs here and
//    the witness rides this record too, or a guard-failed fresh run could be
//    laundered into a clean tracked binding record. Legacy runs (no
//    declared_dispatch, all-legacy capture) skip and emit nothing. ──
const dispatchProjection = projectSynthesizeCertArmDispatch(rawLiveCalls);
let rejudgeArmDispatch: SynthesizeCertArmDispatch | null = null;
if (seats.declaredDispatch === undefined) {
  if (!dispatchProjection.legacy) {
    throw new Error(
      "b4-rejudge: capture carries dispatch witnesses but the preflight has no declared_dispatch — inconsistent-era runDir, refusing to certify",
    );
  }
  log("dispatch witness: legacy run (no declaration, pre-witness capture) — arm_dispatch omitted");
} else {
  const problems = dispatchProjection.legacy
    ? ["preflight declares a dispatch but the capture is entirely pre-witness (legacy lines)"]
    : [...dispatchProjection.violations];
  if (problems.length === 0 && dispatchProjection.armDispatch !== null) {
    problems.push(
      ...synthesizeCertDispatchGuardViolations({
        declared: seats.declaredDispatch as SynthesizeCertArmDispatch,
        witnessed: dispatchProjection.armDispatch,
        armProviders: {
          baseline: seats.baseline.provider,
          candidate: seats.candidate.provider,
          negative_control: seats.candidate.provider,
        },
      }),
    );
    rejudgeArmDispatch = dispatchProjection.armDispatch;
  }
  if (problems.length > 0) {
    throw new Error(
      `b4-rejudge: DISPATCH WITNESS GUARD FAILED:\n${problems.map((p) => `  ${p}`).join("\n")}`,
    );
  }
  log("dispatch witness: declared == witnessed for all three arms");
}

const mutationSeed = `b4-${checkpointRaw.manifest_identity_sha256.slice(0, 16)}`; // mirrors scripts/b4-cert-run.mts's derivation exactly

// ── RD3 — reconstruct judge-replay inputs by content-hash join (fail-closed) ─
const replay = reconstructSynthesizeCertJudgeReplayInputs({
  rows: foldedRows,
  originalPacketsByInputId,
  capturedCalls,
  projectArmOutput: projectSemanticMapSynthesisOutput,
  hashArmOutput: synthesizeCertOutputSha256,
});
log(`reconstruction: ${replay.matched.length} matched, ${replay.unmatched.length} unmatched (of ${foldedRows.filter((r) => r.candidate_output_status === "ok").length} ok row(s))`);
if (replay.unmatched.length > 0) {
  console.error("[b4-rejudge] RECONSTRUCTION FAILED — ok row(s) with no matching captured call (fail-closed, refusing to proceed):");
  for (const row of replay.unmatched) console.error(`  ${row.row_id}`);
  process.exit(1);
}

// ── prior rejudge progress (resume-by-rerun: same --run-dir, same mode) ─────
const progressFileName = go ? "rejudge-rows.progress.jsonl" : "rejudge-mock-rows.progress.jsonl";
const progressPath = path.join(runDir, "local", progressFileName);
let priorRejudgeRows: SynthesizeCertJudgementRow[] = [];
try {
  const rawPrior = await readJsonl(progressPath);
  priorRejudgeRows = foldSynthesizeCertProgressRows(rawPrior as unknown as SynthesizeCertJudgementRow[]);
  log(`resume: folded ${rawPrior.length} prior rejudge line(s) into ${priorRejudgeRows.length} row(s)`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const priorRejudgeByRowId = new Map(priorRejudgeRows.map((r) => [r.row_id, r]));
const pendingPairs = replay.matched.filter((pair) => {
  const prior = priorRejudgeByRowId.get(pair.row.row_id);
  return !prior || !isDecisiveRow(prior);
});
log(`rejudge forecast: ${pendingPairs.length} remaining coordinate(s) (of ${replay.matched.length} reconstructed; cap=${maxCalls})`);
if (go && pendingPairs.length > maxCalls) {
  throw new Error(
    `b4-rejudge: remaining forecast ${pendingPairs.length} exceeds --max-calls ${maxCalls} — refusing to spend past the approved budget unit. No spend has occurred (this check runs before the quota probe).`,
  );
}

// ── judge realization: opus live (--go) or deterministic mock (rehearsal) ──
await fs.mkdir(path.join(runDir, "local"), { recursive: true });
let judgeFn: (input: { original_packet: SemanticSynthesisInput; arm_output: import("../src/core-runtime/reconstruct/comprehension-semantic-map.ts").SemanticSynthesisOutput }) => ReturnType<ReturnType<typeof createMockSynthesizeCertJudge>>;
let rejudgeSeatLabel: string;
if (go) {
  const opusLlmConfig = resolveLlmProviderConfig({ config: { llm: { provider: OPUS_MODEL.provider, model: OPUS_MODEL.model } } });
  if (opusLlmConfig.provider !== OPUS_MODEL.provider || opusLlmConfig.model_id !== OPUS_MODEL.model) {
    throw new Error(
      `b4-rejudge: opus seat resolved to ${opusLlmConfig.provider ?? "(unresolved)"}/${opusLlmConfig.model_id ?? "(unresolved)"}, expected ${OPUS_MODEL.provider}/${OPUS_MODEL.model} — refusing to dispatch under a mismatched identity`,
    );
  }
  log("preflight: 1-call quota probe (opus judge seat)");
  const probe = await runB4QuotaProbe({ llmConfig: opusLlmConfig, label: `${OPUS_MODEL.provider}/${OPUS_MODEL.model}` });
  log(`preflight: quota probe ok (${probe.label})`);
  const harness = createB4LiveCallHarness(path.join(runDir, "local", "rejudge-opus-calls.jsonl"));
  judgeFn = createB4LiveSynthesizeCertJudge({ llmCall: harness.forRole("judge"), llmConfig: opusLlmConfig });
  rejudgeSeatLabel = `${OPUS_MODEL.provider}/${OPUS_MODEL.model}`;
} else {
  judgeFn = createMockSynthesizeCertJudge();
  rejudgeSeatLabel = "mock (rehearsal — not evidence)";
}
log(`rejudge seat: ${rejudgeSeatLabel}`);

// ── dispatch loop: judge-only re-execution over reconstructed pairs ─────────
const newRowsByRowId = new Map<string, SynthesizeCertJudgementRow>();
for (const prior of priorRejudgeRows) {
  if (isDecisiveRow(prior)) newRowsByRowId.set(prior.row_id, prior); // resume: never re-spend a decisive prior rejudge
}
let opusOk = 0;
let opusJudgeError = 0;
let opusTimeout = 0;
for (const pair of pendingPairs) {
  let judgeStatus: SynthesizeCertJudgementRow["judge_status"] = "not_run";
  let metrics: SynthesizeCertJudgementRow["metrics"] = { grounding: "not_judged", boundary: "not_judged" };
  try {
    const verdicts = await judgeFn(pair.judgeInput);
    assertSynthesizeCertJudgeVerdicts(verdicts);
    judgeStatus = "ok";
    metrics = { grounding: verdicts.grounding, boundary: verdicts.boundary };
    opusOk += 1;
  } catch (error) {
    judgeStatus = error instanceof SynthesizeCertJudgeTimeout ? "timeout" : "judge_error";
    if (judgeStatus === "timeout") opusTimeout += 1;
    else opusJudgeError += 1;
  }
  // Carry EVERY other field of the original row forward unchanged — the arm
  // output is immutable; a rejudge changes only judge_status + metrics.
  const newRow: SynthesizeCertJudgementRow = { ...pair.row, judge_status: judgeStatus, metrics };
  newRowsByRowId.set(newRow.row_id, newRow);
  await fs.appendFile(progressPath, `${JSON.stringify(newRow)}\n`);
}
log(`rejudge dispatch: ${pendingPairs.length} attempted (ok=${opusOk}, judge_error=${opusJudgeError}, timeout=${opusTimeout})`);

// ── assemble the full rejudged row set: rejudged rows replace their original,
//    every other row (non-ok, or not attempted this run) carries forward as-is ──
const finalRows: SynthesizeCertJudgementRow[] = foldedRows.map((row) => newRowsByRowId.get(row.row_id) ?? row);

// ── record assembly (direct — NOT assembleSynthesizeCertRecord, which needs
//    full S1 sampler entries this rejudge harness never has; input_manifest
//    is built straight from the checkpoint's own frozen-packet fields, which
//    are exactly the manifest entry shape) ──
const inputManifest = checkpoint.packets.map((p) => ({
  fixture_id: p.fixture_id,
  input_id: p.input_id,
  input_sha256: p.input_sha256,
  stratum: { seam: p.stratum.seam, merge: p.stratum.merge },
}));

const limitations =
  `RE-JUDGED — original arm outputs (baseline/reference ${seats.baseline.provider}/${seats.baseline.model}; ` +
  `candidate+negative_control ${seats.candidate.provider}/${seats.candidate.model}) captured LIVE in ${runDir} ` +
  "were reused VERBATIM (content-hash reconstructed from local/live-calls.jsonl — NO arm re-spend). " +
  `Grounding/boundary verdicts were RE-DERIVED by an INDEPENDENT judge lens (${rejudgeSeatLabel}), cross-family ` +
  `from the original run's same-family (${seats.baseline.provider}/${seats.baseline.model}) judge, to remove ` +
  "same-family judge bias as a confound on the metric_regression gate. No durable evidence CAPSULE accompanies " +
  "this record YET — CAPSULE DEFERRED, not impossible: the original run's S1 sampler provenance (per-input " +
  "sampling_rank/nearest_unselected_id + per-stratum pool_size/selected_count/seed/ordering/stride) was never " +
  "persisted by the original --go run (it exited at the record gate before its persist step), but it IS " +
  "deterministically recoverable by re-running the sampler (sampleStratifiedManifest, zero LLM spend) over the " +
  "SAME original fixture workbook(s) this run observed, then binding the result to this checkpoint via " +
  "manifest_identity_sha256 equality. That reconstruction is deferred until it is known whether this rejudge " +
  "makes candidate>=baseline hold (flips metric_regression): only then is a capsule worth assembling for actual " +
  "B5 pursuit. A capsule-bound record can be completed by re-deriving that provenance and calling " +
  "assembleSynthesizeCertCapsule + validateSynthesizeCertCapsuleBinding — not by a fresh live run. Per-node " +
  "synthesize capability only; production reconcile/verify/taint/projection are NOT certified; a " +
  "production-contrast run is still required before B5 registration (design §13).";

const rawRecord = {
  record_contract: SYNTHESIZE_CERT_CONTRACT,
  created_at: ts(),
  provider: seats.candidate.provider,
  model: seats.candidate.model,
  declared_reps: declaredReps,
  arm_prompt_sha256: { baseline: armPromptSha256, candidate: armPromptSha256, negative_control: armPromptSha256 },
  arm_model: {
    baseline: { provider: seats.baseline.provider, model: seats.baseline.model },
    candidate: { provider: seats.candidate.provider, model: seats.candidate.model },
    negative_control: { provider: seats.candidate.provider, model: seats.candidate.model },
  },
  // Witnessed dispatch, guard-verified above — omitted on legacy runs.
  ...(rejudgeArmDispatch !== null ? { arm_dispatch: rejudgeArmDispatch } : {}),
  negative_arm: buildInputCorruptionV1NegativeArm(mutationSeed),
  input_manifest: inputManifest,
  judgement_rows: finalRows,
  declared_aggregates: computeSynthesizeCertAggregates({ inputManifest, judgementRows: finalRows }),
  reproduction: {
    command: `npx tsx scripts/b4-rejudge.mts --run-dir ${runDir}${go ? " --go" : ""}`,
    source_paths: [runDir],
    limitations,
  },
};
const parsedRecord = parseSynthesizeCertRecord(rawRecord);
if (!parsedRecord.record) {
  console.error("[b4-rejudge] ASSEMBLED RECORD FAILED SCHEMA:");
  for (const v of parsedRecord.violations) console.error(`  ${v.code}: ${v.message}`);
  process.exit(1);
}
const record = parsedRecord.record;
const violations = validateSynthesizeCertRecord(record);
log(`record recompute: ${violations.length} violation(s)`);
for (const v of violations) log(`  ${v.code}: ${v.message}`);

// ── comparison report: old (original) judge vs new (rejudge) judge ─────────
function armMetricTable(
  rows: readonly SynthesizeCertJudgementRow[],
): Record<SynthesizeCertArm, Record<SynthesizeCertMetric, { pass: number; tot: number }>> {
  const table = {} as Record<SynthesizeCertArm, Record<SynthesizeCertMetric, { pass: number; tot: number }>>;
  for (const arm of SYNTHESIZE_CERT_ARMS) {
    const decisive = rows.filter((r) => r.arm === arm && isDecisiveRow(r));
    table[arm] = {} as Record<SynthesizeCertMetric, { pass: number; tot: number }>;
    for (const metric of SYNTHESIZE_CERT_METRICS) {
      table[arm][metric] = { pass: decisive.filter((r) => r.metrics[metric] === "pass").length, tot: decisive.length };
    }
  }
  return table;
}
function regressionFlip(oldTable: ReturnType<typeof armMetricTable>, newTable: ReturnType<typeof armMetricTable>) {
  const flips = {} as Record<SynthesizeCertMetric, { old_regressed: boolean; new_regressed: boolean; flipped: boolean }>;
  for (const metric of SYNTHESIZE_CERT_METRICS) {
    const oldBaseline = oldTable.baseline[metric];
    const oldCandidate = oldTable.candidate[metric];
    const newBaseline = newTable.baseline[metric];
    const newCandidate = newTable.candidate[metric];
    const oldMean = (t: { pass: number; tot: number }) => (t.tot === 0 ? null : t.pass / t.tot);
    const oldB = oldMean(oldBaseline);
    const oldC = oldMean(oldCandidate);
    const newB = oldMean(newBaseline);
    const newC = oldMean(newCandidate);
    const oldRegressed = oldB !== null && oldC !== null && oldC < oldB;
    const newRegressed = newB !== null && newC !== null && newC < newB;
    flips[metric] = { old_regressed: oldRegressed, new_regressed: newRegressed, flipped: oldRegressed && !newRegressed };
  }
  return flips;
}
const oldTable = armMetricTable(foldedRows);
const newTable = armMetricTable(finalRows);
const comparison = {
  rejudge_comparison_contract: "synthesize-cert-rejudge-comparison/v1",
  run_dir: runDir,
  original_judge_seat: `${seats.baseline.provider}/${seats.baseline.model}`,
  rejudge_seat: rejudgeSeatLabel,
  reconstruction: { matched: replay.matched.length, unmatched: replay.unmatched.length },
  rejudge_dispatch: { attempted: pendingPairs.length, ok: opusOk, judge_error: opusJudgeError, timeout: opusTimeout },
  per_arm_per_metric_pass_tot: { old_judge: oldTable, new_judge: newTable },
  metric_regression_flip: regressionFlip(oldTable, newTable),
  declared_aggregates: { old_judge: computeSynthesizeCertAggregates({ inputManifest, judgementRows: foldedRows }), new_judge: record.declared_aggregates },
  record_violations: violations.map((v) => ({ code: v.code, message: v.message, subject_id: v.subject_id })),
  record_persisted: violations.length === 0,
};

// ── persist ───────────────────────────────────────────────────────────────
const comparisonPath = go ? path.join(runDir, "rejudge-comparison.json") : path.join(runDir, "local", "rejudge-mock-comparison.json");
await fs.writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`);
log(`comparison persisted → ${comparisonPath}`);
if (violations.length === 0) {
  const recordPath = go ? path.join(runDir, "synthesize-cert-record.json") : path.join(runDir, "local", "rejudge-mock-record.json");
  await fs.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  log(`record: 0 violations → persisted to ${recordPath} (capsule intentionally NOT produced — see reproduction.limitations)`);
} else {
  log(`record: ${violations.length} violation(s) — NOT persisted as evidence; see ${comparisonPath}`);
}
