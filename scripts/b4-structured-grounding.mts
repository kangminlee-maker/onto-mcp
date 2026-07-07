/**
 * B4 `synthesize-cert/v1` STRUCTURED-GROUNDING orchestrator (owner decision
 * 2026-07-07, post-R7 structured-extraction cut; SGF revision same day).
 *
 * The R7 human audit (Group A packet comparison) found gpt-5.5's holistic
 * grounding pass/fail conflates interpretive-gloss quality (semantic, human
 * territory) with fact fabrication (structural, deterministically checkable).
 * This script computes a THIRD, deterministic grounding column per
 * coordinate: an independent LLM lens (opus, in production) extracts
 * VERBATIM structural claims from each arm's summary (never judges), an
 * honesty guard confirms the extraction didn't invent anything absent from
 * the summary text, and a pure verifier
 * (`verifyStructuralGrounding`, synthesize-cert-judge.ts) compares those
 * claims against the packet's OWN structural facts — no LLM judgement in
 * that last step. The LLM's authority is bounded to low-privilege
 * extraction; the grounding VERDICT itself is 100% deterministic code.
 *
 * SGF revision (post-live-extraction analysis): the verifier is
 * STRUCTURE-ONLY — it checks row POSITIONS (`fabricated_boundary_row`,
 * `fabricated_transition_row`), never format-label TEXT. A live run found
 * label matching false-positives constantly (summaries name formats in
 * natural language — "integer", "decimal date" — while packets carry codes —
 * "INT", "DEC", "ISO_DATE"): 17 of candidate's 18 real-run "fabrication"
 * flags were this vocabulary artifact, only 1 was genuine. Format naming is
 * an LLM-semantic residual (domain-agnostic-no-static-enums), never a
 * deterministic-code comparison — see synthesize-cert-judge.ts's SG1 module
 * doc for the full rationale.
 *
 * Reuses (no re-implementation):
 *  - `reconstructSynthesizeCertJudgeReplayInputs` (synthesize-cert-judge.ts) —
 *    the SAME content-hash join scripts/b4-rejudge.mts and
 *    scripts/b4-r7-audit.mts already proved 100% — to recover every arm's
 *    actual output from `local/live-calls.jsonl` (NO arm re-spend).
 *  - `foldSynthesizeCertProgressRows` (synthesize-cert-loop.ts, now generic)
 *    for both this script's OWN progress sidecar and for reading the two
 *    prior judge-verdict sidecars (gpt-5.5's and opus's).
 *  - `createB4LiveStructuralClaimExtractor` / `runB4QuotaProbe` /
 *    `createB4LiveCallHarness` (b4-live-realization.mts) — the SAME live-
 *    wiring pattern scripts/b4-rejudge.mts's opus judge seat used.
 *
 * Boundary metric is OUT OF SCOPE for this cut (a separate, already-known
 * degenerate-metric issue) — only grounding is computed here.
 *
 * Modes (LLM realization is switch-gated; MOCK IS THE DEFAULT — zero spend):
 *  - no --go, no --recompute : full pre-spend rehearsal. Reconstruction + a
 *    deterministic MOCK extractor (always empty claims — trivially honest,
 *    trivially grounded; {@link verifyStructuralGrounding}'s own unit tests
 *    already prove the verifier's logic) run the FULL dispatch/aggregate/
 *    persist/resume scaffold to completion. Outputs land under
 *    `<runDir>/local/structured-grounding-mock-*` (gitignored).
 *  - --go : LIVE opus extraction. Requires --run-dir. Quota-probes the opus
 *    seat, then extracts for every one of the 270 `ok` coordinates (all
 *    three arms) not already decisively extracted (resumable via the
 *    progress sidecar). ZERO SPEND on a re-run once fully extracted.
 *  - --recompute : ZERO SPEND, no LLM call, no reconstruction needed. Reads
 *    the REAL persisted `local/structured-grounding-rows.progress.jsonl`
 *    (a prior --go run's raw extracted claims — never the mock sidecar),
 *    re-applies the CURRENT `verifyStructuralGrounding` to each `ok` row's
 *    persisted claims, and rewrites `structured-grounding-comparison.json`
 *    with the freshly-derived verdicts. This is how a verifier RULE fix
 *    (like the SGF revision) gets re-scored against already-captured
 *    evidence without re-spending a single extraction call. Mutually
 *    exclusive with --go.
 *
 * Persistence (paths relative to --run-dir):
 *  - structured-grounding-comparison.json (tracked, --go or --recompute:
 *    source-safe AGGREGATE ONLY — per-arm {gpt5_holistic, opus_holistic,
 *    deterministic_structural} pass/tot, extraction dispatch counts,
 *    violation-kind counts {fabricated_boundary_row,
 *    fabricated_transition_row}. NEVER per-row claims/prose.)
 *  - local/structured-grounding-calls.jsonl (gitignored, --go only: every
 *    raw extraction call, shared terminal-abort harness)
 *  - local/structured-grounding-rows.progress.jsonl (gitignored, --go only:
 *    one line per coordinate — claims + violation codes + verdict — folded
 *    into priors on a rerun; --recompute reads this, never writes it)
 *  - local/structured-grounding-mock-comparison.json /
 *    local/structured-grounding-mock-rows.progress.jsonl (gitignored, mock
 *    rehearsal only)
 *
 * Usage:
 *   npx tsx scripts/b4-structured-grounding.mts --run-dir <dir> [--go] [--max-calls <n>]
 *   npx tsx scripts/b4-structured-grounding.mts --run-dir <dir> --recompute
 * --max-calls (--go only; default 300): the REMAINING forecast (matched
 * coordinates not already decisively extracted) must not exceed this before
 * ANY spend (incl. the quota probe).
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { SemanticSynthesisInput } from "../src/core-runtime/reconstruct/comprehension-semantic-map.ts";
import { projectSemanticMapSynthesisOutput } from "../src/core-runtime/reconstruct/run.ts";
import { resolveLlmProviderConfig } from "../src/core-runtime/llm/llm-caller.ts";
import { parseSynthesizeCertFreezeCheckpoint } from "../src/core-runtime/discovery/synthesize-cert-packet.ts";
import {
  foldSynthesizeCertProgressRows,
  synthesizeCertOutputSha256,
} from "../src/core-runtime/discovery/synthesize-cert-loop.ts";
import {
  reconstructSynthesizeCertJudgeReplayInputs,
  SynthesizeCertClaimHonestyViolation,
  SynthesizeCertClaimParseFail,
  verifyStructuralGrounding,
  type SynthesizeCertCapturedCall,
  type SynthesizeCertStructuralClaimExtractorFn,
  type SynthesizeCertStructuralClaims,
  type SynthesizeCertStructuralGroundingViolationCode,
} from "../src/core-runtime/discovery/synthesize-cert-judge.ts";
import {
  SYNTHESIZE_CERT_ARMS,
  type SynthesizeCertArm,
  type SynthesizeCertJudgementRow,
} from "../src/core-runtime/discovery/synthesize-cert-record.ts";
import { createMockSynthesizeCertStructuralClaimExtractor } from "../src/core-runtime/discovery/test-fixtures/synthesize-cert-mock-realization.ts";
import {
  createB4LiveCallHarness,
  createB4LiveStructuralClaimExtractor,
  runB4QuotaProbe,
} from "./b4-live-realization.mts";

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[b4-structured-grounding ${ts()}] ${m}`);

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let runDir: string | null = null;
let go = false;
let recompute = false;
let maxCalls = 300;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--run-dir") runDir = argv[++i] ?? null;
  else if (arg === "--go") go = true;
  else if (arg === "--recompute") recompute = true;
  else if (arg === "--max-calls") {
    const raw = argv[++i];
    const parsed = raw === undefined ? NaN : Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`b4-structured-grounding: --max-calls requires a positive integer, got '${raw}'`);
    }
    maxCalls = parsed;
  } else throw new Error(`b4-structured-grounding: unknown arg '${arg}'`);
}
if (runDir === null) {
  throw new Error("b4-structured-grounding: --run-dir <dir> is required.");
}
if (go && recompute) {
  throw new Error("b4-structured-grounding: --go and --recompute are mutually exclusive (recompute never dispatches, --go always does).");
}

const OPUS_MODEL = { provider: "anthropic" as const, model: "claude-opus-4-8" };
const REGION_SUFFIX = /-r(\d+)_(\d+)$/;

interface StructuredGroundingProgressRow {
  row_id: string;
  input_id: string;
  rep: number;
  arm: SynthesizeCertArm;
  extraction_status: "ok" | "parse_error" | "honesty_violation" | "transport_error";
  claims: SynthesizeCertStructuralClaims | null;
  structural_violation_codes: SynthesizeCertStructuralGroundingViolationCode[];
  deterministic_grounding: "pass" | "fail" | "not_judged";
}

function parseRegionFromInputId(inputId: string): { regionStart: number; regionEnd: number } {
  const regionMatch = REGION_SUFFIX.exec(inputId);
  if (!regionMatch) {
    throw new Error(
      `b4-structured-grounding: input_id '${inputId}' does not match the expected -r<start>_<end> suffix (fail-closed)`,
    );
  }
  return { regionStart: Number(regionMatch[1]), regionEnd: Number(regionMatch[2]) };
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

function violationKindCountsOf(rows: readonly StructuredGroundingProgressRow[]): Record<SynthesizeCertStructuralGroundingViolationCode, number> {
  const counts: Record<SynthesizeCertStructuralGroundingViolationCode, number> = {
    fabricated_boundary_row: 0,
    fabricated_transition_row: 0,
  };
  for (const row of rows) {
    for (const code of row.structural_violation_codes) counts[code] += 1;
  }
  return counts;
}
function holisticPassTot(rows: readonly SynthesizeCertJudgementRow[], arm: SynthesizeCertArm): { pass: number; tot: number } {
  const decisive = rows.filter((r) => r.arm === arm && r.candidate_output_status === "ok" && r.judge_status === "ok");
  return { pass: decisive.filter((r) => r.metrics.grounding === "pass").length, tot: decisive.length };
}
function structuralPassTot(rows: readonly StructuredGroundingProgressRow[], arm: SynthesizeCertArm): { pass: number; tot: number } {
  const extracted = rows.filter((r) => r.arm === arm && r.extraction_status === "ok");
  return { pass: extracted.filter((r) => r.deterministic_grounding === "pass").length, tot: extracted.length };
}

// ── S0: load run artifacts common to every mode ──────────────────────────────
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
log(`gpt-5.5 (original) judge rows: folded into ${oldRows.length} coordinate row(s)`);

const rawNewRows = await readJsonl(path.join(runDir, "local", "rejudge-rows.progress.jsonl"));
const newRows = foldSynthesizeCertProgressRows(rawNewRows as unknown as SynthesizeCertJudgementRow[]);
log(`opus (rejudge) judge rows: folded into ${newRows.length} coordinate row(s)`);

let finalStructuredRows: StructuredGroundingProgressRow[];
let extractionSeatLabel: string;
let extractionDispatch: { attempted: number; ok: number; parse_error: number; honesty_violation: number; transport_error: number };

if (recompute) {
  // ── --recompute: zero-spend re-score of ALREADY-CAPTURED claims against
  //    the CURRENT verifyStructuralGrounding — no reconstruction, no LLM. ──
  const realProgressPath = path.join(runDir, "local", "structured-grounding-rows.progress.jsonl");
  const rawPersisted = await readJsonl(realProgressPath);
  const persistedRows = foldSynthesizeCertProgressRows(rawPersisted as unknown as StructuredGroundingProgressRow[]);
  log(`recompute: folded ${rawPersisted.length} persisted line(s) into ${persistedRows.length} row(s) from ${realProgressPath}`);

  finalStructuredRows = persistedRows.map((row) => {
    if (row.extraction_status !== "ok" || row.claims === null) return row; // carry forward unchanged — no claims to re-verify
    const { regionStart, regionEnd } = parseRegionFromInputId(row.input_id);
    const originalPacket = originalPacketsByInputId.get(row.input_id);
    if (!originalPacket) {
      throw new Error(`b4-structured-grounding: recompute found no original packet for input_id ${row.input_id} (fail-closed)`);
    }
    const violations = verifyStructuralGrounding({ packet: originalPacket, regionStart, regionEnd, claims: row.claims });
    return {
      ...row,
      structural_violation_codes: violations.map((v) => v.code),
      deterministic_grounding: violations.length === 0 ? "pass" : "fail",
    };
  });

  extractionDispatch = {
    attempted: persistedRows.length,
    ok: persistedRows.filter((r) => r.extraction_status === "ok").length,
    parse_error: persistedRows.filter((r) => r.extraction_status === "parse_error").length,
    honesty_violation: persistedRows.filter((r) => r.extraction_status === "honesty_violation").length,
    transport_error: persistedRows.filter((r) => r.extraction_status === "transport_error").length,
  };
  extractionSeatLabel = `${OPUS_MODEL.provider}/${OPUS_MODEL.model} (recompute — 0 LLM calls, verifier re-applied to persisted claims)`;
} else {
  // ── --go (live) or mock rehearsal: reconstruct arm outputs, dispatch/mock-extract ──
  const rawLiveCalls = await readJsonl(path.join(runDir, "local", "live-calls.jsonl"));
  const capturedCalls: SynthesizeCertCapturedCall[] = rawLiveCalls.map((c) => ({
    seq: c.seq as number,
    role: c.role as string,
    text: typeof c.text === "string" ? c.text : null,
  }));

  const replay = reconstructSynthesizeCertJudgeReplayInputs({
    rows: oldRows,
    originalPacketsByInputId,
    capturedCalls,
    projectArmOutput: projectSemanticMapSynthesisOutput,
    hashArmOutput: synthesizeCertOutputSha256,
  });
  if (replay.unmatched.length > 0) {
    console.error("[b4-structured-grounding] RECONSTRUCTION FAILED — ok row(s) with no matching captured call (fail-closed, refusing to proceed):");
    for (const row of replay.unmatched) console.error(`  ${row.row_id}`);
    process.exit(1);
  }
  log(`reconstruction: ${replay.matched.length} matched, 0 unmatched`);

  const progressFileName = go ? "structured-grounding-rows.progress.jsonl" : "structured-grounding-mock-rows.progress.jsonl";
  const progressPath = path.join(runDir, "local", progressFileName);
  let priorRows: StructuredGroundingProgressRow[] = [];
  try {
    const rawPrior = await readJsonl(progressPath);
    priorRows = foldSynthesizeCertProgressRows(rawPrior as unknown as StructuredGroundingProgressRow[]);
    log(`resume: folded ${rawPrior.length} prior line(s) into ${priorRows.length} row(s)`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const priorByRowId = new Map(priorRows.map((r) => [r.row_id, r]));
  const pendingPairs = replay.matched.filter((pair) => {
    const prior = priorByRowId.get(pair.row.row_id);
    return !prior || prior.extraction_status !== "ok";
  });
  log(`extraction forecast: ${pendingPairs.length} remaining coordinate(s) (of ${replay.matched.length} reconstructed; cap=${maxCalls})`);
  if (go && pendingPairs.length > maxCalls) {
    throw new Error(
      `b4-structured-grounding: remaining forecast ${pendingPairs.length} exceeds --max-calls ${maxCalls} — refusing to spend past the approved budget unit. No spend has occurred (this check runs before the quota probe).`,
    );
  }

  await fs.mkdir(path.join(runDir, "local"), { recursive: true });
  let extractorFn: SynthesizeCertStructuralClaimExtractorFn;
  if (go) {
    const opusLlmConfig = resolveLlmProviderConfig({ config: { llm: { provider: OPUS_MODEL.provider, model: OPUS_MODEL.model } } });
    if (opusLlmConfig.provider !== OPUS_MODEL.provider || opusLlmConfig.model_id !== OPUS_MODEL.model) {
      throw new Error(
        `b4-structured-grounding: opus seat resolved to ${opusLlmConfig.provider ?? "(unresolved)"}/${opusLlmConfig.model_id ?? "(unresolved)"}, expected ${OPUS_MODEL.provider}/${OPUS_MODEL.model} — refusing to dispatch under a mismatched identity`,
      );
    }
    log("preflight: 1-call quota probe (opus extraction seat)");
    const probe = await runB4QuotaProbe({ llmConfig: opusLlmConfig, label: `${OPUS_MODEL.provider}/${OPUS_MODEL.model}` });
    log(`preflight: quota probe ok (${probe.label})`);
    const harness = createB4LiveCallHarness(path.join(runDir, "local", "structured-grounding-calls.jsonl"));
    extractorFn = createB4LiveStructuralClaimExtractor({ llmCall: harness.forRole("extract"), llmConfig: opusLlmConfig });
    extractionSeatLabel = `${OPUS_MODEL.provider}/${OPUS_MODEL.model}`;
  } else {
    extractorFn = createMockSynthesizeCertStructuralClaimExtractor();
    extractionSeatLabel = "mock (rehearsal — not evidence)";
  }
  log(`extraction seat: ${extractionSeatLabel}`);

  const newRowsByRowId = new Map<string, StructuredGroundingProgressRow>();
  for (const prior of priorRows) {
    if (prior.extraction_status === "ok") newRowsByRowId.set(prior.row_id, prior); // resume: never re-spend a decisive prior extraction
  }
  let extractOk = 0;
  let parseErrorCount = 0;
  let honestyViolationCount = 0;
  let transportErrorCount = 0;
  for (const pair of pendingPairs) {
    const { regionStart, regionEnd } = parseRegionFromInputId(pair.row.input_id);

    let extractionStatus: StructuredGroundingProgressRow["extraction_status"];
    let claims: SynthesizeCertStructuralClaims | null = null;
    let violationCodes: SynthesizeCertStructuralGroundingViolationCode[] = [];
    let deterministicGrounding: StructuredGroundingProgressRow["deterministic_grounding"] = "not_judged";
    try {
      claims = await extractorFn(pair.judgeInput.arm_output.semantic_summary);
      const violations = verifyStructuralGrounding({ packet: pair.judgeInput.original_packet, regionStart, regionEnd, claims });
      violationCodes = violations.map((v) => v.code);
      deterministicGrounding = violations.length === 0 ? "pass" : "fail";
      extractionStatus = "ok";
      extractOk += 1;
    } catch (error) {
      if (error instanceof SynthesizeCertClaimParseFail) {
        extractionStatus = "parse_error";
        parseErrorCount += 1;
      } else if (error instanceof SynthesizeCertClaimHonestyViolation) {
        extractionStatus = "honesty_violation";
        honestyViolationCount += 1;
      } else {
        extractionStatus = "transport_error"; // covers timeout + any other raw dispatch failure
        transportErrorCount += 1;
      }
    }

    const newRow: StructuredGroundingProgressRow = {
      row_id: pair.row.row_id,
      input_id: pair.row.input_id,
      rep: pair.row.rep,
      arm: pair.row.arm,
      extraction_status: extractionStatus,
      claims,
      structural_violation_codes: violationCodes,
      deterministic_grounding: deterministicGrounding,
    };
    newRowsByRowId.set(newRow.row_id, newRow);
    await fs.appendFile(progressPath, `${JSON.stringify(newRow)}\n`);
  }
  log(
    `extraction dispatch: ${pendingPairs.length} attempted (ok=${extractOk}, parse_error=${parseErrorCount}, honesty_violation=${honestyViolationCount}, transport_error=${transportErrorCount})`,
  );

  finalStructuredRows = replay.matched.map((pair) => newRowsByRowId.get(pair.row.row_id)!);
  extractionDispatch = {
    attempted: pendingPairs.length,
    ok: extractOk,
    parse_error: parseErrorCount,
    honesty_violation: honestyViolationCount,
    transport_error: transportErrorCount,
  };
}

// ── aggregate: gpt5_holistic vs opus_holistic vs deterministic_structural ───
const perArmGrounding = Object.fromEntries(
  SYNTHESIZE_CERT_ARMS.map((arm) => [
    arm,
    {
      gpt5_holistic: holisticPassTot(oldRows, arm),
      opus_holistic: holisticPassTot(newRows, arm),
      deterministic_structural: structuralPassTot(finalStructuredRows, arm),
    },
  ]),
) as Record<SynthesizeCertArm, { gpt5_holistic: { pass: number; tot: number }; opus_holistic: { pass: number; tot: number }; deterministic_structural: { pass: number; tot: number } }>;

const violationKindCounts = violationKindCountsOf(finalStructuredRows);

const comparison = {
  structured_grounding_comparison_contract: "synthesize-cert-structured-grounding-comparison/v1",
  run_dir: runDir,
  extraction_seat: extractionSeatLabel,
  extraction_dispatch: extractionDispatch,
  per_arm_grounding: perArmGrounding,
  violation_kind_counts: violationKindCounts,
};

// ── persist ───────────────────────────────────────────────────────────────
const comparisonPath =
  go || recompute
    ? path.join(runDir, "structured-grounding-comparison.json")
    : path.join(runDir, "local", "structured-grounding-mock-comparison.json");
await fs.mkdir(path.dirname(comparisonPath), { recursive: true });
await fs.writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`);
log(`comparison persisted → ${comparisonPath}`);

// ── console: source-safe aggregate only — never prose/claims ───────────────
log(
  `extraction dispatch: attempted=${extractionDispatch.attempted} ok=${extractionDispatch.ok} parse_error=${extractionDispatch.parse_error} honesty_violation=${extractionDispatch.honesty_violation} transport_error=${extractionDispatch.transport_error}`,
);
for (const arm of SYNTHESIZE_CERT_ARMS) {
  const g = perArmGrounding[arm];
  log(
    `${arm}: gpt5_holistic=${g.gpt5_holistic.pass}/${g.gpt5_holistic.tot} opus_holistic=${g.opus_holistic.pass}/${g.opus_holistic.tot} deterministic_structural=${g.deterministic_structural.pass}/${g.deterministic_structural.tot}`,
  );
}
log(
  `violation kinds: fabricated_boundary_row=${violationKindCounts.fabricated_boundary_row} fabricated_transition_row=${violationKindCounts.fabricated_transition_row}`,
);
