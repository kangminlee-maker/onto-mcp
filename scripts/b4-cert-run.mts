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
 *  - --go : live capture. NOT WIRED in this session (design §0 비-목표: live
 *    runs are owner-budget-gated); fails loud so the switch surface exists
 *    without shipping untested live code. Live wiring = reference/arm authors
 *    via createDirectCallReconstructDirectiveAuthor (§5) + independent judge
 *    lens (§7) + l2-real-llm-run quota preflight, in the budget-approved session.
 *
 * Persistence per run (out dir defaults to
 * development-records/benchmark/synthesize-cert/<stamp>/):
 *  - synthesize-cert-record.json   (tracked; MOCK runs are labeled in
 *    reproduction.limitations and are NOT B5 evidence)
 *  - synthesize-cert-capsule.json  (tracked; source-safe by construction)
 *  - local/packets.json            (GITIGNORED prose sidecar: frozen packets
 *    incl. child-summary prose + node identity, for R7 audit / judge replay)
 *
 * Usage: npx tsx scripts/b4-cert-run.mts [--fixture <xlsx>]... [--out <dir>] [--go]
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
} from "../src/core-runtime/discovery/synthesize-cert-assemble.ts";
import {
  assembleSynthesizeCertCapsule,
  validateSynthesizeCertCapsuleBinding,
} from "../src/core-runtime/discovery/synthesize-cert-capsule.ts";
import { runSynthesizeCertLoop } from "../src/core-runtime/discovery/synthesize-cert-loop.ts";
import { freezeSynthesizeCertPackets } from "../src/core-runtime/discovery/synthesize-cert-packet.ts";
import { validateSynthesizeCertRecord } from "../src/core-runtime/discovery/synthesize-cert-record.ts";
import {
  collectSynthesizeCertCandidates,
  sampleStratifiedManifest,
  type SynthesizeCertCandidate,
  type SynthesizeCertSamplerFixtureInput,
} from "../src/core-runtime/discovery/synthesize-cert-sampler.ts";
import type { SynthesizeCertColumnPipeline } from "../src/core-runtime/discovery/synthesize-cert-packet.ts";
import {
  buildSynthesizeCertFullFixturePipelines,
  createMockSynthesizeCertJudge,
  mockReferenceSynthesize,
  mockSynthesizeCertArmOutput,
} from "../src/core-runtime/discovery/test-fixtures/synthesize-cert-mock-realization.ts";

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[b4-cert-run ${ts()}] ${m}`);

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const fixturePaths: string[] = [];
let outDir: string | null = null;
let go = false;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--fixture") fixturePaths.push(argv[++i] ?? "");
  else if (arg === "--out") outDir = argv[++i] ?? null;
  else if (arg === "--go") go = true;
  else throw new Error(`b4-cert-run: unknown arg '${arg}'`);
}
if (go) {
  throw new Error(
    "b4-cert-run: --go (live capture) is not wired yet — live realizations (arm authors via createDirectCallReconstructDirectiveAuthor §5, independent judge lens §7, quota preflight) land in the owner-budget-approved session. Everything before the LLM boundary runs today via the default mock mode.",
  );
}

const CANDIDATE = { provider: "anthropic", model: "claude-haiku-4-5-20251001" };
const BASELINE = { provider: "openai", model: "gpt-5.5" };
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

// ── S2: freeze (mock reference realization) ───────────────────────────────────
const frozen = await freezeSynthesizeCertPackets({
  entries: sample.manifest,
  resolvePipeline: (entry) => {
    const pipeline = pipelinesByFixture
      .get(entry.fixture_id)
      ?.find((p) => p.trace.nodes.has(entry.node_key));
    if (!pipeline) throw new Error(`no pipeline for ${entry.input_id}`);
    return pipeline;
  },
  referenceSynthesize: mockReferenceSynthesize(),
});
log(`frozen ${frozen.packets.length} packets (${frozen.reference_synthesize_calls} mock reference calls)`);

// ── S3–S5: coordinate loop (mock arms + mock judge) ───────────────────────────
const mutationSeed = `b4-${sample.manifest_identity_sha256.slice(0, 16)}`;
const loop = await runSynthesizeCertLoop({
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

// ── S7: record + gates ────────────────────────────────────────────────────────
const record = assembleSynthesizeCertRecord({
  createdAt: ts(),
  candidateModel: CANDIDATE,
  baselineModel: BASELINE,
  promptSha256,
  declaredReps: DECLARED_REPS,
  mutationSeed,
  entries: sample.manifest,
  packets: frozen.packets,
  judgementRows: loop.rows,
  reproduction: {
    command: `npx tsx scripts/b4-cert-run.mts${fixturePaths.map((f) => ` --fixture ${f}`).join("")}`,
    source_paths: sourcePaths,
    limitations:
      "MOCK RUN — deterministic mock realizations; NOT B5 evidence. Live scope when captured: per-node synthesize capability only (capsule limitation_ids).",
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
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const runDir =
  outDir ??
  path.join(
    "development-records/benchmark/synthesize-cert",
    `${stamp}${fixturePaths.length > 0 ? "" : "-synthetic"}-mock`,
  );
await fs.mkdir(path.join(runDir, "local"), { recursive: true });
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
