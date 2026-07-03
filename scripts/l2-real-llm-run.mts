/**
 * Layer-2 semantic-map REAL-LLM production run harness (design 20260703 §5/§6 v3).
 *
 * Repo harness (the installed onto MCP predates the wiring cut — abprobe precedent).
 * Phases: 0 pre-flight (quota probe · immutable snapshot · deterministic expected-dispatch
 * pre-computation · cap check · INV-MODEL-1) → 1 run (capture wrapper · consecutive-transport-
 * failure soft-abort) → 2 verdict (hard criteria · 4-class completion contract · run-report).
 *
 * Usage: npx tsx scripts/l2-real-llm-run.mts <source.xlsx> [--go]
 *   Without --go the harness stops after pre-flight (forecast only, zero authoring LLM calls
 *   beyond the 1-call quota probe).
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { callLlm, resolveLlmProviderConfig } from "../src/core-runtime/llm/llm-caller.ts";
import {
  assertSettingsModelsSupported,
  resolveReconstructActorLlmSettings,
  resolveSettingsChain,
} from "../src/core-runtime/discovery/settings-chain.ts";
import { observeSpreadsheetSource } from "../src/core-runtime/spreadsheet-structure-observer.ts";
import {
  buildColumnLeaves,
  reduceColumnLeavesWithTrace,
} from "../src/core-runtime/reconstruct/comprehension-reduce.ts";
import { classifyFrontier } from "../src/core-runtime/reconstruct/comprehension-semantic-map.ts";
import {
  createDirectCallReconstructConfirmationProvider,
  createDirectCallReconstructDirectiveAuthor,
  DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
  runReconstruct,
  SEMANTIC_MAP_SEED_PROMPT_NOTE,
} from "../src/core-runtime/reconstruct/run.ts";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[l2-run ${ts()}] ${m}`);

const sourceArg = process.argv[2];
const GO = process.argv.includes("--go");
if (!sourceArg) throw new Error("usage: l2-real-llm-run.mts <source.xlsx> [--go]");
const SOURCE = path.resolve(sourceArg);

// ── phase 0: pre-flight ───────────────────────────────────────────────────────────────────────────

log("phase 0: settings + INV-MODEL-1");
const settings = await resolveSettingsChain(REPO, REPO);
assertSettingsModelsSupported(settings); // live spend gate — harness calls it explicitly (core-run path bypasses the api entry)
const authorLlm = resolveReconstructActorLlmSettings(settings, "semantic_author");
const authorLlmConfig = resolveLlmProviderConfig({ config: { llm: authorLlm } }) as Record<string, unknown>;
const providerLlm = resolveReconstructActorLlmSettings(settings, "confirmation_provider");
const providerLlmConfig = resolveLlmProviderConfig({ config: { llm: providerLlm } }) as Record<string, unknown>;
const modelIdentity = `${String(authorLlmConfig.provider ?? "?")}/${String(authorLlmConfig.model_id ?? (authorLlmConfig as { model?: string }).model ?? "?")}`;
log(`route: ${modelIdentity}`);

log("phase 0: 1-call quota probe");
const probe = await callLlm("Reply with exactly: ok", "ok?", { ...authorLlmConfig, max_tokens: 16 } as never);
if (!(probe as { text?: string }).text) throw new Error("quota probe returned no text — aborting before any spend");
log(`quota probe ok (${((probe as { text: string }).text ?? "").slice(0, 20)})`);

log("phase 0: immutable snapshot");
const sourceBytes = await fs.readFile(SOURCE);
const sourceSha = crypto.createHash("sha256").update(sourceBytes).digest("hex");
const runId = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${sourceSha.slice(0, 8)}`;
const workdir = path.join(os.tmpdir(), `l2-real-llm-${runId}`);
await fs.mkdir(workdir, { recursive: true });
const snapshot = path.join(workdir, `snapshot-${sourceSha.slice(0, 8)}.xlsx`);
await fs.writeFile(snapshot, sourceBytes);
log(`snapshot: ${snapshot} sha256=${sourceSha}`);

log("phase 0: deterministic expected-dispatch pre-computation (LLM 0)");
const inv = await observeSpreadsheetSource(snapshot) as {
  segmented_value_tiles?: Array<{ sheet?: string; name?: string; columns?: unknown[] }>;
};
let expectedDispatches = 0;
let colCount = 0;
for (const sheet of inv.segmented_value_tiles ?? []) {
  for (const col of sheet.columns ?? []) {
    const leaves = buildColumnLeaves(
      (sheet.sheet ?? sheet.name) as string,
      col as never,
      { leafCount: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG.leaf_count },
    );
    if (leaves.length === 0) continue;
    colCount += 1;
    const { trace } = reduceColumnLeavesWithTrace(leaves, DEFAULT_SEMANTIC_MAP_STAGE_CONFIG.fanin);
    const modes = classifyFrontier(trace, DEFAULT_SEMANTIC_MAP_STAGE_CONFIG.over_context_budget);
    for (const [, mode] of modes) if (mode !== "subsumed") expectedDispatches += 1;
  }
}
const cap = DEFAULT_SEMANTIC_MAP_STAGE_CONFIG.max_synthesize_calls;
log(`expected synthesize dispatches = ${expectedDispatches} over ${colCount} columns (cap ${cap}; worst-case real calls ≤ ${expectedDispatches * 6})`);
if (expectedDispatches === 0) throw new Error("pre-flight: 0 expected dispatches — wrong source? aborting");
if (expectedDispatches > cap) throw new Error(`pre-flight: expected ${expectedDispatches} > cap ${cap} — the X7 gate would self-disable the stage; aborting`);

const sessionRoot = path.join(REPO, ".onto", "reconstruct", `l2-real-llm-${runId}`);
try {
  await fs.access(sessionRoot);
  throw new Error(`sessionRoot already exists: ${sessionRoot} (fail-fast, §10.F9)`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const preflight = {
  run_id: runId,
  source: SOURCE,
  snapshot,
  snapshot_sha256: sourceSha,
  model_identity: modelIdentity,
  expected_synthesize_dispatches: expectedDispatches,
  column_count: colCount,
  caps: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
  worst_case_real_calls: expectedDispatches * 6,
  go: GO,
  preflight_at: ts(),
};
await fs.mkdir(path.dirname(sessionRoot), { recursive: true });
await fs.mkdir(sessionRoot, { recursive: true });
const preflightPath = path.join(sessionRoot, "preflight.json");
await fs.writeFile(preflightPath, JSON.stringify(preflight, null, 2));
log(`preflight written: ${preflightPath}`);
if (!GO) {
  log("no --go: stopping after pre-flight (zero authoring calls made).");
  process.exit(0);
}

// ── phase 1: run ──────────────────────────────────────────────────────────────────────────────────

const capturePath = path.join(sessionRoot, "captured-calls.jsonl");
let callCount = 0;
let consecutiveTransportFailures = 0;
let harnessAborted = false;
const capturingLlmCall = async (
  systemPrompt: string,
  userPrompt: string,
  config?: Record<string, unknown>,
) => {
  if (harnessAborted) {
    throw new Error("HARNESS ABORT: ≥5 consecutive transport failures — refusing further spend (design §6 abort criterion)");
  }
  callCount += 1;
  const seq = callCount;
  try {
    const result = await callLlm(systemPrompt, userPrompt, config as never);
    consecutiveTransportFailures = 0;
    await fs.appendFile(
      capturePath,
      JSON.stringify({ seq, at: ts(), systemPrompt, userPrompt, text: (result as { text?: string }).text ?? null }) + "\n",
    );
    if (seq % 50 === 0) log(`progress: ${seq} LLM calls captured`);
    return result;
  } catch (error) {
    consecutiveTransportFailures += 1;
    await fs.appendFile(
      capturePath,
      JSON.stringify({ seq, at: ts(), systemPrompt: systemPrompt.slice(0, 120), error: String(error).slice(0, 400), consecutive: consecutiveTransportFailures }) + "\n",
    );
    if (consecutiveTransportFailures >= 5) {
      harnessAborted = true;
      log("ABORT FLAG SET: 5 consecutive transport failures — subsequent calls fail immediately");
    }
    throw error;
  }
};

log(`phase 1: run start (session ${sessionRoot})`);
const startedAt = Date.now();
const directiveAuthor = createDirectCallReconstructDirectiveAuthor({
  llmCall: capturingLlmCall as never,
  llmConfig: authorLlmConfig as never,
  authorId: "l2-real-llm-semantic-author",
  enableSemanticMapAuthoring: true,
});
const confirmationProvider = createDirectCallReconstructConfirmationProvider({
  llmCall: capturingLlmCall as never,
  llmConfig: providerLlmConfig as never,
  providerId: "l2-real-llm-confirmation-provider",
});
let runStatus = "harness_exception";
let runError: string | null = null;
try {
  const result = await runReconstruct({
    projectRoot: workdir,
    targetRefs: [snapshot],
    intent: "Create a bounded reconstruct Seed from the payment/revenue-recognition workbook.",
    sessionRoot,
    profilesRoot: path.join(REPO, ".onto", "processes", "reconstruct", "source-profiles"),
    filesystemAllowedRoots: [workdir],
    semanticAuthorRealization: "direct_call",
    confirmationProviderRealization: "direct_call",
    directiveAuthor,
    confirmationProvider,
  } as never);
  runStatus = (result as { status?: string }).status ?? "unknown";
} catch (error) {
  runError = String(error).slice(0, 2000);
  log(`run threw: ${runError.slice(0, 300)}`);
}
const wallMs = Date.now() - startedAt;
log(`phase 1 done: status=${runStatus} wall=${Math.round(wallMs / 1000)}s llmCalls=${callCount}`);

// ── phase 2: verdict (harness-computed completion class, design §6 v3) ────────────────────────────

async function readYamlish(p: string): Promise<Record<string, unknown> | null> {
  try {
    const { parse } = await import("yaml");
    return parse(await fs.readFile(p, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
const census = await readYamlish(path.join(sessionRoot, "comprehension", "semantic-map-census.yaml"));
const sidecar = await readYamlish(path.join(sessionRoot, "comprehension", "semantic-map.yaml"));
const provenance = await readYamlish(path.join(sessionRoot, "ontology-seed.yaml.reuse-provenance.yaml"));

const synthTotal = Number(census?.synthesize_calls_total ?? -1);
const verifyTotal = Number(census?.verify_calls_total ?? -1);
const mapPresent = Number(census?.observations_map_present ?? -1);
// column status vocabulary (artifact-types ReconstructSemanticMapCensusColumn): produced/empty are
// healthy; failed/capped/skipped_observation_fallback mean the observation fell back to flat.
const censusColumns = (census as {
  observations?: Array<{ columns?: Array<{ status?: string }> }>;
} | null)?.observations?.flatMap((o) => o.columns ?? []) ?? null;
const failedColumns = censusColumns === null
  ? -1
  : censusColumns.filter((c) => c.status !== "produced" && c.status !== "empty").length;
const seedCall = await (async () => {
  try {
    const lines = (await fs.readFile(capturePath, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    return lines.find((c: { systemPrompt?: string }) => c.systemPrompt?.includes("Author ontology-seed.yaml")) ?? null;
  } catch {
    return null;
  }
})();
const seedHasMap = Boolean(
  seedCall && typeof seedCall.userPrompt === "string" &&
    "semantic_map" in (JSON.parse(seedCall.userPrompt) as Record<string, unknown>) &&
    (seedCall.systemPrompt as string).includes(SEMANTIC_MAP_SEED_PROMPT_NOTE),
);
const fingerprint = (provenance?.reuse_match as { semantic_map_aggregate_fingerprint_sha256?: string | null } | undefined)
  ?.semantic_map_aggregate_fingerprint_sha256 ?? null;

const hard = {
  completed_only: runStatus === "completed",
  map_present: mapPresent === 1,
  failed_columns_zero: failedColumns === 0,
  synthesize_equals_preflight: synthTotal === expectedDispatches,
  verify_positive_and_capped: verifyTotal > 0 && verifyTotal <= DEFAULT_SEMANTIC_MAP_STAGE_CONFIG.max_verify_calls,
  seed_prompt_carries_map: seedHasMap,
  fingerprint_64hex: typeof fingerprint === "string" && /^[0-9a-f]{64}$/.test(fingerprint),
};
const hardPassExceptVerify = hard.completed_only && hard.map_present && hard.failed_columns_zero &&
  hard.synthesize_equals_preflight && hard.seed_prompt_carries_map && hard.fingerprint_64hex;
const isPrimaryModel = modelIdentity.includes("gpt-5.5");
let completionClass: string;
if (hardPassExceptVerify && hard.verify_positive_and_capped) {
  completionClass = isPrimaryModel ? "primary_success" : "fallback_route_evidence";
} else if (hardPassExceptVerify && verifyTotal === 0) {
  completionClass = "synthesize_only_partial";
} else {
  completionClass = "degraded_or_blocked";
}

const report = {
  run_id: runId,
  completion_class: completionClass,
  model_identity: modelIdentity,
  run_status: runStatus,
  run_error: runError,
  wall_seconds: Math.round(wallMs / 1000),
  llm_calls_captured: callCount,
  expected_synthesize_dispatches: expectedDispatches,
  census: { synthesize_calls_total: synthTotal, verify_calls_total: verifyTotal, observations_map_present: mapPresent, failed_columns: failedColumns },
  hard_criteria: hard,
  sidecar_nodes_total: (sidecar as { observations?: Array<{ projection?: { nodes_total?: number } }> } | null)
    ?.observations?.[0]?.projection?.nodes_total ?? null,
  snapshot_sha256: sourceSha,
  session_root: sessionRoot,
  reported_at: ts(),
};
const reportPath = path.join(sessionRoot, "run-report.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
log(`VERDICT: ${completionClass}`);
log(`report: ${reportPath}`);
console.log(JSON.stringify(report, null, 2));
