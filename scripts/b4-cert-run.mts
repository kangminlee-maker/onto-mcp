/**
 * B4 `synthesize-cert/v1` bench orchestrator (design
 * 20260706-b4-r8-harness-design v3 §2/§15 — the I/O + realization-switch shell
 * around the deterministic core modules in src/core-runtime/discovery/).
 *
 * Modes (LLM realization is switch-gated; MOCK IS THE DEFAULT — zero spend):
 *  - no --fixture args : synthetic 2-fixture mock bench (no file I/O, smoke).
 *  - --fixture a.xlsx --fixture b.xlsx : REAL observe → collect → sample →
 *    pre-spend floor gate over the real workbooks, then mock LLM realizations
 *    (a full-fidelity rehearsal of everything deterministic, zero spend).
 *  - --fixture ... --go : LIVE capture. Requires >=1 --fixture (a live run
 *    over the synthetic universe is a contradiction — rejected before any
 *    spend). Live wiring (scripts/b4-live-realization.mts): settings-chain +
 *    supported-model-registry resolution for the openai `semantic_author`
 *    seat (reference/baseline/judge), a directly-constructed anthropic
 *    candidate seat (candidate/negative_control — currently claude-sonnet-5
 *    with extended thinking OFF; §5, checked by the live module's exact-path
 *    bench allowance before the config is constructed), a 1-call quota probe per
 *    distinct provider route, and an incremental local/ capture sidecar.
 *  - --go ... --resume <runDir> : resumes an interrupted live run against the
 *    SAME --fixture args (same order) instead of re-spending the reference
 *    freeze. Requires --go. Loads/verifies `<runDir>/local/freeze-checkpoint.json`
 *    (manifest identity + per-packet input_sha256 re-check, fail-closed) and
 *    folds `<runDir>/local/judgement-rows.progress.jsonl` (if present) into
 *    priorRows — the loop then only re-dispatches non-decisive coordinates.
 *    Forecast/cap apply to the REMAINING coordinates only; probe results and
 *    forecast go to `preflight.resume.json` (the original preflight.json is
 *    never overwritten, preserving the fresh-run spend audit trail).
 *
 * Persistence per run (out dir defaults to
 * development-records/benchmark/synthesize-cert/<stamp>/):
 *  - synthesize-cert-record.json   (tracked; MOCK runs are labeled in
 *    reproduction.limitations and are NOT B5 evidence)
 *  - synthesize-cert-capsule.json  (tracked; source-safe by construction)
 *  - preflight.json                (tracked, --go only; source-safe: resolved
 *    seat identities + quota-probe result + call forecast, no prose)
 *  - preflight.resume.json         (tracked, --resume only; same shape, does
 *    not overwrite preflight.json)
 *  - local/packets.json            (GITIGNORED prose sidecar: frozen packets
 *    incl. child-summary prose + node identity, for R7 audit / judge replay)
 *  - local/live-calls.jsonl        (GITIGNORED, --go only: every raw live
 *    request/response, tagged by role, for R7 judge replay)
 *  - local/freeze-checkpoint.json  (GITIGNORED, --go only: the exact frozen
 *    packets, written right after freeze completes — enables --resume without
 *    re-spending the reference freeze; source-safe fields only, same
 *    child-summary prose sensitivity as local/packets.json)
 *  - local/judgement-rows.progress.jsonl (GITIGNORED, --go only: one line per
 *    completed coordinate, incremental — folded into priorRows on --resume)
 *
 * Usage: npx tsx scripts/b4-cert-run.mts [--fixture <xlsx>]... [--out <dir>] [--go] [--max-calls <n>] [--resume <runDir>]
 * --max-calls (--go only; default 800, §11 forecast 500-700 + headroom): the
 * preflight forecast must not exceed this before ANY spend (incl. the quota
 * probe) — raise only with owner budget approval. On --resume this caps the
 * REMAINING forecast, not the original full-universe forecast.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { observeSpreadsheetSource } from "../src/core-runtime/spreadsheet-structure-observer.ts";
import {
  buildColumnLeaves,
  reduceColumnLeavesWithTrace,
} from "../src/core-runtime/reconstruct/comprehension-reduce.ts";
import { classifyFrontier } from "../src/core-runtime/reconstruct/comprehension-semantic-map.ts";
import {
  DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
  SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
} from "../src/core-runtime/reconstruct/run.ts";
import {
  assembleSynthesizeCertRecord,
  projectSynthesizeCertArmDispatch,
  synthesizeCertDispatchGuardViolations,
  type SynthesizeCertArmDispatch,
} from "../src/core-runtime/discovery/synthesize-cert-assemble.ts";
import {
  assembleSynthesizeCertCapsule,
  validateSynthesizeCertCapsuleBinding,
} from "../src/core-runtime/discovery/synthesize-cert-capsule.ts";
import {
  coordinateKey,
  foldSynthesizeCertProgressRows,
  runSynthesizeCertLoop,
} from "../src/core-runtime/discovery/synthesize-cert-loop.ts";
import {
  freezeSynthesizeCertPackets,
  parseSynthesizeCertFreezeCheckpoint,
  serializeSynthesizeCertFreezeCheckpoint,
} from "../src/core-runtime/discovery/synthesize-cert-packet.ts";
import {
  isDecisiveRow,
  SYNTHESIZE_CERT_ARMS,
  validateSynthesizeCertRecord,
  type SynthesizeCertJudgementRow,
} from "../src/core-runtime/discovery/synthesize-cert-record.ts";
import {
  collectSynthesizeCertCandidates,
  sampleStratifiedManifest,
  type SynthesizeCertCandidate,
  type SynthesizeCertSampledInput,
  type SynthesizeCertSamplerFixtureInput,
} from "../src/core-runtime/discovery/synthesize-cert-sampler.ts";
import type { SynthesizeCertColumnPipeline } from "../src/core-runtime/discovery/synthesize-cert-packet.ts";
import {
  buildSynthesizeCertFullFixturePipelines,
  createMockSynthesizeCertJudge,
  mockReferenceSynthesize,
  mockSynthesizeCertArmOutput,
} from "../src/core-runtime/discovery/test-fixtures/synthesize-cert-mock-realization.ts";
import {
  B4_SYNTHESIZE_REASONING_EFFORT_OVERRIDE,
  type B4DeclaredModelIdentity,
  createB4LiveCallHarness,
  createB4LiveSynthesizeArm,
  createB4LiveSynthesizeCertJudge,
  forecastB4ReferenceSynthesizeCalls,
  resolveB4LiveSeats,
  runB4QuotaProbe,
} from "./b4-live-realization.mts";

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[b4-cert-run ${ts()}] ${m}`);

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const fixturePaths: string[] = [];
let outDir: string | null = null;
let go = false;
let resumeDir: string | null = null;
// §11 budget-unit hard cap (l2-real-llm-run expectedDispatches>cap precedent):
// 500-700 forecast + headroom. Checked before any spend (incl. quota probes).
let maxCalls = 800;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--fixture") fixturePaths.push(argv[++i] ?? "");
  else if (arg === "--out") outDir = argv[++i] ?? null;
  else if (arg === "--go") go = true;
  else if (arg === "--resume") resumeDir = argv[++i] ?? null;
  else if (arg === "--max-calls") {
    const raw = argv[++i];
    const parsed = raw === undefined ? NaN : Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`b4-cert-run: --max-calls requires a positive integer, got '${raw}'`);
    }
    maxCalls = parsed;
  } else throw new Error(`b4-cert-run: unknown arg '${arg}'`);
}
if (go && fixturePaths.length === 0) {
  throw new Error(
    "b4-cert-run: --go (live capture) requires at least one --fixture — a live run over the synthetic mock universe is not meaningful evidence. Pass --fixture <xlsx> (repeatable) alongside --go.",
  );
}
if (resumeDir !== null && !go) {
  throw new Error(
    "b4-cert-run: --resume requires --go — resuming a live run only makes sense while live (mock has no checkpoint to resume from). Pass --go --fixture <same xlsx, same order> --resume <runDir>.",
  );
}

// INV-MODEL-1 B4 gpt-5.6-luna candidate (owner directive 2026-07-11): the
// candidate/negative seat is gpt-5.6-luna at reasoning_effort=low — the
// spreadsheet recursive-LLM (semantic_map) seat this candidate targets. The
// declared effort is injected onto the synthesize calls (candidateSynthesizeEffort
// below) so the codex worker dispatches THAT effort instead of inheriting a
// host ~/.codex/config.toml default, and the dispatch witness guard holds the
// capture against this declaration. Directly constructed, NOT a settings seat
// (see b4-live-realization.mts module doc). Prior candidate: claude-sonnet-5
// thinking-off (registered 2026-07-08 — supported-models.yaml).
const CANDIDATE: B4DeclaredModelIdentity = {
  provider: "openai",
  model: "gpt-5.6-luna",
  reasoning_effort: "low",
};
const BASELINE = { provider: "openai", model: "gpt-5.5" } as const;
// Declared per-arm dispatch (effort-witness design §4.5-3): the PLAN the
// declared-vs-witnessed guard compares the capture witness against, persisted
// on the preflight. baseline synthesize runs at the ⑤a low override;
// candidate/negative carry exactly the CANDIDATE declaration.
const CANDIDATE_DECLARED_DISPATCH = {
  ...(CANDIDATE.reasoning_effort !== undefined
    ? { reasoning_effort: CANDIDATE.reasoning_effort }
    : {}),
  ...(CANDIDATE.thinking_mode !== undefined
    ? { thinking_mode: CANDIDATE.thinking_mode }
    : {}),
};
const DECLARED_DISPATCH: SynthesizeCertArmDispatch = {
  baseline: { reasoning_effort: B4_SYNTHESIZE_REASONING_EFFORT_OVERRIDE },
  candidate: CANDIDATE_DECLARED_DISPATCH,
  negative_control: CANDIDATE_DECLARED_DISPATCH,
};
const DECLARED_REPS = 3;
const promptSha256 = crypto
  .createHash("sha256")
  .update(SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT)
  .digest("hex");

// ── universe: real observe or synthetic ──────────────────────────────────────
const pipelinesByFixture = new Map<string, SynthesizeCertColumnPipeline[]>();
const fixtures: SynthesizeCertSamplerFixtureInput[] = [];
const sourcePaths: string[] = [];

if (fixturePaths.length > 0) {
  const cfg = DEFAULT_SEMANTIC_MAP_STAGE_CONFIG;
  for (const sourcePath of fixturePaths) {
    log(`observe ${sourcePath}`);
    const bytes = await fs.readFile(sourcePath);
    const fixtureId = crypto.createHash("sha256").update(bytes).digest("hex");
    const inv = (await observeSpreadsheetSource(sourcePath)) as {
      segmented_value_tiles?: Array<{ sheet?: string; name?: string; columns?: unknown[] }>;
    };
    const pipelines: SynthesizeCertColumnPipeline[] = [];
    const candidates: SynthesizeCertCandidate[] = [];
    (inv.segmented_value_tiles ?? []).forEach((sheetTiles, sheetIndex) => {
      const sheetName = (sheetTiles.sheet ?? sheetTiles.name) as string;
      for (const column of sheetTiles.columns ?? []) {
        const leaves = buildColumnLeaves(sheetName, column as never, { leafCount: cfg.leaf_count });
        if (leaves.length === 0) continue;
        const { trace, nodesByKey } = reduceColumnLeavesWithTrace(leaves, cfg.fanin);
        const modes = classifyFrontier(trace, cfg.over_context_budget);
        const pipeline = { trace, nodesByKey, modes };
        pipelines.push(pipeline);
        candidates.push(...collectSynthesizeCertCandidates({ ...pipeline, sheetIndex }));
      }
    });
    pipelinesByFixture.set(fixtureId, pipelines);
    fixtures.push({ fixture_id: fixtureId, candidates });
    sourcePaths.push(sourcePath);
    log(`fixture ${fixtureId.slice(0, 8)}: ${candidates.length} candidate nodes`);
  }
} else {
  log("no --fixture given → synthetic 2-fixture mock universe (smoke)");
  for (const name of ["b4-cert-run-synthetic-1", "b4-cert-run-synthetic-2"]) {
    const fixtureId = crypto.createHash("sha256").update(name).digest("hex");
    const pipelines = buildSynthesizeCertFullFixturePipelines();
    pipelinesByFixture.set(fixtureId, pipelines);
    fixtures.push({
      fixture_id: fixtureId,
      candidates: pipelines.flatMap((pipeline) =>
        collectSynthesizeCertCandidates({ ...pipeline, sheetIndex: 0 }),
      ),
    });
    sourcePaths.push(`synthetic:${name}`);
  }
}

// ── S1: sample + PRE-SPEND floor gate (§3 sequencing) ─────────────────────────
const sample = sampleStratifiedManifest(fixtures, { declaredReps: DECLARED_REPS });
log(
  `manifest: ${sample.manifest.length} inputs (identity ${sample.manifest_identity_sha256.slice(0, 12)}…)`,
);
if (sample.floor_violations.length > 0) {
  console.error("[b4-cert-run] PRE-SPEND FLOOR GATE FAILED — not spending:");
  for (const v of sample.floor_violations) console.error(`  ${v.code}: ${v.message}`);
  process.exit(1);
}

/** Single-source pipeline resolver — reused by the (live-only) forecast dry
 * run and by the real freeze below, so the two never drift. */
const resolvePipelineForEntry = (entry: SynthesizeCertSampledInput): SynthesizeCertColumnPipeline => {
  const pipeline = pipelinesByFixture
    .get(entry.fixture_id)
    ?.find((p) => p.trace.nodes.has(entry.node_key));
  if (!pipeline) throw new Error(`no pipeline for ${entry.input_id}`);
  return pipeline;
};

// ── run dir (path only here — created lazily. --go creates it eagerly at the
//    top of its branch below, since its capture sidecar writes incrementally
//    from preflight onward; mock creates it only in the persist section, so a
//    mock run that exits earlier (floor gate / record / capsule-binding
//    failure) leaves NO directory behind — default-off stays diff-provable.
//    --resume reuses the GIVEN dir verbatim — never a fresh stamp — so the
//    capture/progress sidecars already there are appended to, not shadowed) ──
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const runDirSuffix = go ? "" : fixturePaths.length > 0 ? "-mock" : "-synthetic-mock";
const runDir =
  resumeDir ?? outDir ?? path.join("development-records/benchmark/synthesize-cert", `${stamp}${runDirSuffix}`);

/** §11/D4 resume forecast: how many (input × rep × arm) coordinates still lack
 * a decisive prior row — the upper bound on remaining arm+judge spend. Reuses
 * the loop's own `coordinateKey`/`isDecisiveRow` so this can never disagree
 * with what `runSynthesizeCertLoop` itself will actually re-dispatch. */
function countB4RemainingCoordinates(
  manifest: readonly { input_id: string }[],
  declaredReps: number,
  priorRows: readonly SynthesizeCertJudgementRow[],
): number {
  const decisive = new Set(
    priorRows.filter(isDecisiveRow).map((r) => coordinateKey(r.input_id, r.rep, r.arm)),
  );
  let remaining = 0;
  for (const entry of manifest) {
    for (let rep = 1; rep <= declaredReps; rep += 1) {
      for (const arm of SYNTHESIZE_CERT_ARMS) {
        if (!decisive.has(coordinateKey(entry.input_id, rep, arm))) remaining += 1;
      }
    }
  }
  return remaining;
}

// ── S2: freeze (mock or live reference realization) ───────────────────────────
const mutationSeed = `b4-${sample.manifest_identity_sha256.slice(0, 16)}`;
let frozen: Awaited<ReturnType<typeof freezeSynthesizeCertPackets>>;
let loop: Awaited<ReturnType<typeof runSynthesizeCertLoop>>;
let reproductionLimitations: string;

if (go) {
  // --go creates the run dir eagerly: preflight.json + incremental capture
  // both need it before the persist section runs.
  await fs.mkdir(path.join(runDir, "local"), { recursive: true });

  // ── --go preflight: settings + registry + candidate identity, forecast, quota probes (§2/§11) ──
  log("preflight: resolving live seats (settings chain + supported-model registry)");
  const seats = await resolveB4LiveSeats({
    repoRoot: process.cwd(),
    candidate: CANDIDATE,
    baseline: BASELINE,
  });
  log(`preflight: baseline/reference/judge seat = ${seats.baselineModelIdentity}; candidate/negative seat = ${seats.candidateModelIdentity}`);

  // ── --resume load + validate (owner decision D3) — after seats, BEFORE forecast/probe ──
  let resumedFrozen: Awaited<ReturnType<typeof freezeSynthesizeCertPackets>> | null = null;
  let resumedPriorRows: SynthesizeCertJudgementRow[] = [];
  if (resumeDir !== null) {
    log(`resume: loading freeze checkpoint from ${resumeDir}`);
    const checkpointPath = path.join(resumeDir, "local", "freeze-checkpoint.json");
    let checkpointText: string;
    try {
      checkpointText = await fs.readFile(checkpointPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          `b4-cert-run: --resume ${resumeDir} has no freeze checkpoint at ${checkpointPath} — nothing to resume; run fresh without --resume.`,
        );
      }
      throw error;
    }
    let checkpointRaw: unknown;
    try {
      checkpointRaw = JSON.parse(checkpointText);
    } catch (error) {
      throw new Error(
        `b4-cert-run: --resume ${resumeDir} freeze checkpoint at ${checkpointPath} is not valid JSON (fail-closed): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    resumedFrozen = parseSynthesizeCertFreezeCheckpoint(checkpointRaw, {
      expectedManifestIdentitySha256: sample.manifest_identity_sha256,
      expectedInputIds: sample.manifest.map((e) => e.input_id),
    });
    log(`resume: checkpoint verified (${resumedFrozen.packets.length} packets, manifest identity matches)`);

    const progressPath = path.join(resumeDir, "local", "judgement-rows.progress.jsonl");
    let progressText: string | null = null;
    try {
      progressText = await fs.readFile(progressPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (progressText !== null) {
      const rawRows = progressText
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.trim().length > 0)
        .map(({ line, index }) => {
          try {
            return JSON.parse(line) as SynthesizeCertJudgementRow;
          } catch (error) {
            throw new Error(
              `b4-cert-run: --resume progress sidecar line ${index + 1} at ${progressPath} is not valid JSON (fail-closed): ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        });
      resumedPriorRows = foldSynthesizeCertProgressRows(rawRows);
      log(`resume: folded ${rawRows.length} progress line(s) into ${resumedPriorRows.length} prior row(s)`);
    } else {
      log("resume: no progress sidecar found — resuming right after freeze (0 prior rows, valid)");
    }
  }

  const referenceCallsForecast =
    resumeDir !== null
      ? 0 // reference freeze is already checkpointed — never re-spend it on resume
      : await forecastB4ReferenceSynthesizeCalls({
          entries: sample.manifest,
          resolvePipeline: resolvePipelineForEntry,
        });
  const armCallsForecast =
    resumeDir !== null
      ? countB4RemainingCoordinates(sample.manifest, DECLARED_REPS, resumedPriorRows)
      : sample.manifest.length * DECLARED_REPS * 3;
  const judgeCallsForecast = armCallsForecast;
  const totalForecast = referenceCallsForecast + armCallsForecast + judgeCallsForecast;
  log(
    resumeDir !== null
      ? `preflight forecast (RESUME — reference skipped): remaining=${armCallsForecast} judge=${judgeCallsForecast} total≈${totalForecast} (cap=${maxCalls})`
      : `preflight forecast: reference=${referenceCallsForecast} arm=${armCallsForecast} judge=${judgeCallsForecast} total≈${totalForecast} (cap=${maxCalls})`,
  );
  if (totalForecast > maxCalls) {
    throw new Error(
      `b4-cert-run: preflight forecast ${totalForecast} exceeds --max-calls ${maxCalls} — refusing to spend past the approved budget unit (design §11; raise --max-calls only with owner approval). No spend has occurred (this check runs before the quota probe).`,
    );
  }

  log("preflight: 1-call quota probe per distinct provider route");
  const openaiProbe = await runB4QuotaProbe({
    llmConfig: seats.baselineLlmConfig,
    label: seats.baselineModelIdentity,
  });
  const anthropicProbe = await runB4QuotaProbe({
    llmConfig: seats.candidateLlmConfig,
    label: seats.candidateModelIdentity,
  });
  log(`preflight: quota probes ok (${openaiProbe.label}, ${anthropicProbe.label})`);

  // Resume writes a SIBLING preflight.resume.json — the original preflight.json
  // (fresh-run probe/forecast) stays untouched, preserving the full spend
  // audit history across a resume instead of overwriting it (owner decision D4).
  await fs.writeFile(
    path.join(runDir, resumeDir !== null ? "preflight.resume.json" : "preflight.json"),
    `${JSON.stringify(
      {
        at: ts(),
        ...(resumeDir !== null ? { resumed_at: ts() } : {}),
        baseline_reference_judge_seat: seats.baselineModelIdentity,
        candidate_negative_control_seat: seats.candidateModelIdentity,
        // The dispatch PLAN (effort-witness design): the post-run guard and
        // b4-rejudge compare the capture WITNESS against exactly this.
        declared_dispatch: DECLARED_DISPATCH,
        forecast: {
          reference_calls: referenceCallsForecast,
          arm_calls: armCallsForecast,
          judge_calls: judgeCallsForecast,
          total: totalForecast,
          cap: maxCalls,
        },
        quota_probes: [openaiProbe, anthropicProbe],
      },
      null,
      2,
    )}\n`,
  );

  // ── live dispatch: capturing harness (shared terminal-abort) + seat-bound fns ──
  const harness = createB4LiveCallHarness(path.join(runDir, "local", "live-calls.jsonl"));
  const referenceFn = createB4LiveSynthesizeArm({
    role: "reference",
    llmCall: harness.forRole("reference"),
    llmConfig: seats.baselineLlmConfig,
    synthesizeReasoningEffort: B4_SYNTHESIZE_REASONING_EFFORT_OVERRIDE,
  });
  const baselineFn = createB4LiveSynthesizeArm({
    role: "baseline",
    llmCall: harness.forRole("baseline"),
    llmConfig: seats.baselineLlmConfig,
    synthesizeReasoningEffort: B4_SYNTHESIZE_REASONING_EFFORT_OVERRIDE,
  });
  // The candidate/negative synthesize effort is declared on CANDIDATE (unset for
  // the anthropic thinking-mode route, so this stays byte-identical there; an
  // openai candidate declares it so the codex worker dispatches THAT effort
  // instead of inheriting a host ~/.codex/config.toml default). Injected the
  // same way reference/baseline inject the ⑤a override — a synthesize-call knob.
  const candidateSynthesizeEffort = CANDIDATE.reasoning_effort !== undefined
    ? { synthesizeReasoningEffort: CANDIDATE.reasoning_effort }
    : {};
  const candidateFn = createB4LiveSynthesizeArm({
    role: "candidate",
    llmCall: harness.forRole("candidate"),
    llmConfig: seats.candidateLlmConfig,
    ...candidateSynthesizeEffort,
  });
  const negativeFn = createB4LiveSynthesizeArm({
    role: "negative_control",
    llmCall: harness.forRole("negative_control"),
    llmConfig: seats.candidateLlmConfig,
    ...candidateSynthesizeEffort,
  });
  const judgeFn = createB4LiveSynthesizeCertJudge({
    llmCall: harness.forRole("judge"),
    llmConfig: seats.baselineLlmConfig,
  });

  if (resumeDir !== null) {
    // D5: freeze is SKIPPED entirely — the checkpoint already carries the
    // identical frozen packets, and mutationSeed above is re-derived from the
    // (identity-verified) manifest, so it is automatically the same value.
    frozen = resumedFrozen!;
    log(`resume: reusing ${frozen.packets.length} checkpointed packets (freeze skipped, 0 reference spend)`);
  } else {
    log("live: S2 freeze (reference authoring, real spend starts now)");
    frozen = await freezeSynthesizeCertPackets({
      entries: sample.manifest,
      resolvePipeline: resolvePipelineForEntry,
      referenceSynthesize: referenceFn,
    });
    log(`live: frozen ${frozen.packets.length} packets (${frozen.reference_synthesize_calls} reference calls)`);
    // D2: persist the freeze checkpoint right after freeze completes, before
    // the loop starts — a crash mid-loop can then --resume without re-freezing.
    await fs.writeFile(
      path.join(runDir, "local", "freeze-checkpoint.json"),
      `${JSON.stringify(serializeSynthesizeCertFreezeCheckpoint(frozen, sample.manifest_identity_sha256), null, 2)}\n`,
    );
    log("live: freeze checkpoint persisted (local/freeze-checkpoint.json — enables --resume)");
  }

  const progressPath = path.join(runDir, "local", "judgement-rows.progress.jsonl");
  log("live: S3-S5 coordinate loop (baseline/candidate/negative_control + judge)");
  loop = await runSynthesizeCertLoop({
    packets: frozen.packets,
    declaredReps: DECLARED_REPS,
    arms: { baseline: baselineFn, candidate: candidateFn, negative_control: negativeFn },
    judge: judgeFn,
    mutationSeed,
    ...(resumeDir !== null ? { priorRows: resumedPriorRows } : {}),
    onRowComplete: async (row) => {
      await fs.appendFile(progressPath, `${JSON.stringify(row)}\n`);
    },
  });
  log(
    `live: loop ${loop.rows.length} rows (${loop.synthesize_calls} synth, ${loop.judge_calls} judge)${
      loop.aborted ? ` ABORTED: ${loop.aborted.reason}` : ""
    } (harness calls=${harness.callCount()}, aborted=${harness.isAborted()})`,
  );
  reproductionLimitations =
    "LIVE RUN — per-node synthesize capability only (capsule certification_scope/limitation_ids); " +
    "production reconcile/verify/taint/projection are NOT certified; a production-contrast run " +
    "(capsule production_contrast) is required before B5 registration (§13).";
} else {
  // ── S2: freeze (mock reference realization) ─────────────────────────────────
  frozen = await freezeSynthesizeCertPackets({
    entries: sample.manifest,
    resolvePipeline: resolvePipelineForEntry,
    referenceSynthesize: mockReferenceSynthesize(),
  });
  log(`frozen ${frozen.packets.length} packets (${frozen.reference_synthesize_calls} mock reference calls)`);

  // ── S3–S5: coordinate loop (mock arms + mock judge) ───────────────────────────
  loop = await runSynthesizeCertLoop({
    packets: frozen.packets,
    declaredReps: DECLARED_REPS,
    arms: {
      baseline: async (p) => mockSynthesizeCertArmOutput(p),
      candidate: async (p) => mockSynthesizeCertArmOutput(p),
      negative_control: async (p) => mockSynthesizeCertArmOutput(p),
    },
    judge: createMockSynthesizeCertJudge(),
    mutationSeed,
  });
  log(
    `loop: ${loop.rows.length} rows (${loop.synthesize_calls} synth, ${loop.judge_calls} judge)${loop.aborted ? ` ABORTED: ${loop.aborted.reason}` : ""}`,
  );
  reproductionLimitations =
    "MOCK RUN — deterministic mock realizations; NOT B5 evidence. Live scope when captured: per-node synthesize capability only (capsule limitation_ids).";
}

// ── S6.5: dispatch witness (effort-witness design §4 gate 3-5, --go only) ─────
// Project the per-arm dispatch WITNESS from the full capture file (re-read, not
// in-memory: resume appends to the same file, so this covers prior sessions),
// then hold it against the declared plan. Fail-loud BEFORE assembly/persist —
// a record must never certify a dispatch the capture cannot witness.
let armDispatch: SynthesizeCertArmDispatch | undefined;
if (go) {
  const captureLines = (
    await fs.readFile(path.join(runDir, "local", "live-calls.jsonl"), "utf8")
  )
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
  const projection = projectSynthesizeCertArmDispatch(captureLines);
  const dispatchProblems = projection.legacy
    ? ["capture is entirely pre-witness (legacy lines) but this run DECLARED a dispatch — resuming a pre-witness run cannot be certified"]
    : projection.violations;
  if (dispatchProblems.length === 0 && projection.armDispatch !== null) {
    const guardViolations = synthesizeCertDispatchGuardViolations({
      declared: DECLARED_DISPATCH,
      witnessed: projection.armDispatch,
      armProviders: {
        baseline: BASELINE.provider,
        candidate: CANDIDATE.provider,
        negative_control: CANDIDATE.provider,
      },
    });
    dispatchProblems.push(...guardViolations);
    armDispatch = projection.armDispatch;
  }
  if (dispatchProblems.length > 0) {
    console.error("[b4-cert-run] DISPATCH WITNESS GUARD FAILED:");
    for (const problem of dispatchProblems) console.error(`  ${problem}`);
    process.exit(1);
  }
  log("dispatch witness: declared == witnessed for all three arms");
}

// ── S7: record + gates ────────────────────────────────────────────────────────
const record = assembleSynthesizeCertRecord({
  createdAt: ts(),
  candidateModel: CANDIDATE,
  baselineModel: BASELINE,
  ...(armDispatch !== undefined ? { armDispatch } : {}),
  promptSha256,
  declaredReps: DECLARED_REPS,
  mutationSeed,
  entries: sample.manifest,
  packets: frozen.packets,
  judgementRows: loop.rows,
  reproduction: {
    command: `npx tsx scripts/b4-cert-run.mts${fixturePaths.map((f) => ` --fixture ${f}`).join("")}${go ? " --go" : ""}${resumeDir !== null ? ` --resume ${resumeDir}` : ""}`,
    source_paths: sourcePaths,
    limitations: reproductionLimitations,
  },
});
const recordViolations = validateSynthesizeCertRecord(record);
if (recordViolations.length > 0) {
  console.error("[b4-cert-run] RECORD RECOMPUTE FAILED:");
  for (const v of recordViolations) console.error(`  ${v.code}: ${v.message}`);
  process.exit(1);
}
log("record: validateSynthesizeCertRecord → 0 violations");

const capsule = assembleSynthesizeCertCapsule({
  recordRef: "synthesize-cert-record.json",
  inputManifest: record.input_manifest,
  judgementRows: record.judgement_rows,
  sampledEntries: sample.manifest,
  samplingProvenance: sample.provenance,
  samplerVersion: sample.sampler_version,
  perStratumK: sample.per_stratum_k,
  declaredReps: sample.declared_reps,
  manifestIdentitySha256: sample.manifest_identity_sha256,
  packets: frozen.packets,
  negativeMutations: loop.negative_mutations,
  productionContrast: { completed: false }, // honest: the contrast run has not happened
});
const bindingViolations = validateSynthesizeCertCapsuleBinding({
  record,
  capsuleRaw: JSON.parse(JSON.stringify(capsule)),
});
const blocking = bindingViolations.filter((v) => v.code !== "obligation_incomplete");
if (blocking.length > 0) {
  console.error("[b4-cert-run] CAPSULE BINDING FAILED:");
  for (const v of blocking) console.error(`  ${v.code}: ${v.message}`);
  process.exit(1);
}
log(
  `capsule: binding gate clean${
    bindingViolations.length > 0
      ? " (obligation_incomplete outstanding — production-contrast run required before B5, §13)"
      : ""
  }`,
);

// ── persist ───────────────────────────────────────────────────────────────────
await fs.mkdir(path.join(runDir, "local"), { recursive: true }); // idempotent for --go; first creation for mock
await fs.writeFile(
  path.join(runDir, "synthesize-cert-record.json"),
  `${JSON.stringify(record, null, 2)}\n`,
);
await fs.writeFile(
  path.join(runDir, "synthesize-cert-capsule.json"),
  `${JSON.stringify(capsule, null, 2)}\n`,
);
await fs.writeFile(
  path.join(runDir, "local", "packets.json"),
  `${JSON.stringify(
    frozen.packets.map((p) => ({ input_id: p.input_id, node_key: p.node_key, packet: p.packet })),
    null,
    2,
  )}\n`,
);
log(`persisted → ${runDir} (record+capsule tracked, local/ gitignored prose sidecar)`);
