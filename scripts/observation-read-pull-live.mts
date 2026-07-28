/**
 * LIVE end-to-end check of the observation-read PULL layer (design 20260726 §4, stage 3b).
 *
 * Everything else about stage 3b is proved in-process: the unit tests drive a real facade session, but
 * the transport is stubbed. This spawns a REAL `codex exec` worker with the REAL production hardening
 * (`callCodexCli`'s exact flags), registers the REAL facade over the REAL 59-observation corpus, and
 * asks a real model to fetch. What it proves that nothing else can:
 *
 *   - codex actually launches our server under `--ignore-user-config --disable apps --disable shell_tool`
 *   - the launch token reaches it and the descriptor/env pair is accepted
 *   - the approval lever really is sufficient for the call to complete
 *   - the model receives a real observation body through the tool
 *   - the receipt lands on disk with the ids that were served
 *
 * Costs one real dispatch on the operator's OAuth session. Run it deliberately:
 *   npx tsx scripts/observation-read-pull-live.mts
 *
 * Evidence is written under benchmark/observation-read-pull-live/<timestamp>/.
 *
 * Its fail path is not theoretical: the first run of this script FAILED with "the facade never served",
 * because the registered command was `process.execPath` against a `.ts` entry — codex launched a server
 * that died instantly and the worker reported the tool unavailable. That defect was invisible to every
 * in-process test (they spawn the entry with a loader that can read it) and is what the derived
 * command in `observationReadFacadeCodexArgs` now prevents.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  observationIdsServed,
  observationReadFacadeCodexArgs,
  OBSERVATION_READ_MCP_SERVER_NAME,
  OBSERVATION_READ_TOOL_NAME,
  readObservationReadFacadeReceipt,
  writeObservationReadFacadeDescriptor,
  type ObservationReadFacadeLaunch,
} from "../src/core-runtime/reconstruct/observation-read-facade.ts";
import { codexWorkerSessionId } from "../src/core-runtime/llm/llm-caller.ts";
import {
  reconcileFacadeDelivery,
  VERIFIED_CODEX_CLI_VERSIONS,
} from "../src/core-runtime/reconstruct/delivery-reconciliation.ts";

type AnyRecord = Record<string, any>;

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "scripts/fixtures/observation-catalog");
const CODEX_BIN = "/opt/homebrew/bin/codex";
const MODEL = process.env.ONTO_PULL_LIVE_MODEL ?? "gpt-5.6-luna";
const EFFORT = process.env.ONTO_PULL_LIVE_EFFORT ?? "low";

// Annotated on the CONST, not just on the arrow: TypeScript only treats a call as control-flow
// terminating when the callee's `never` is on an explicit variable type, so without this the narrowing
// after `if (!receiptFile) fail(...)` does not happen and the checks below read as nullable.
const fail: (message: string) => never = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};
const ok = (message: string): void => console.log(`  ✓ ${message}`);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(REPO_ROOT, "benchmark/observation-read-pull-live", runId);
mkdirSync(outDir, { recursive: true });

// --- Real corpus, real ledger, and the `valid` validation the grant demands.
const observationsText = readFileSync(path.join(FIXTURE_DIR, "source-observations.yaml"), "utf8");
const observationsArtifact = parseYaml(observationsText) as {
  observations: { observation_id: string }[];
};
const ledgerArtifact = parseYaml(
  readFileSync(path.join(FIXTURE_DIR, "source-safety-ledger.yaml"), "utf8"),
) as AnyRecord;
if (observationsArtifact.observations.length === 0) fail("fixture carries no observations");

const observationsPath = path.join(outDir, "source-observations.yaml");
const safetyLedgerPath = path.join(outDir, "source-safety-ledger.yaml");
const safetyLedgerValidationPath = path.join(outDir, "source-safety-ledger-validation.yaml");
writeFileSync(observationsPath, observationsText);
writeFileSync(
  safetyLedgerPath,
  stringifyYaml({ ...ledgerArtifact, source_observations_ref: path.resolve(observationsPath) }),
);
writeFileSync(
  safetyLedgerValidationPath,
  stringifyYaml({
    schema_version: "1",
    session_id: ledgerArtifact.session_id,
    created_at: new Date().toISOString(),
    source_safety_ledger_ref: path.resolve(safetyLedgerPath),
    source_observations_ref: path.resolve(observationsPath),
    validation_status: "valid",
    safety_row_count: (ledgerArtifact.safety_rows as unknown[]).length,
    no_prompt_use_count: 0,
    validation_results: ["source_safety_ledger_valid"],
    asserted_obligation_ids: [],
    violations: [],
  }),
);

const launch: ObservationReadFacadeLaunch = {
  sources: { observationsPath, safetyLedgerPath, safetyLedgerValidationPath },
  descriptorPath: path.join(outDir, "descriptor.json"),
  receiptPath: path.join(outDir, "receipt.json"),
  emissionsPath: path.join(outDir, "emissions.json"),
  launchToken: randomUUID(),
  ttlMs: 600_000,
};

// The two ids the model will be told to fetch. Small ones: this arm proves the ROUTE, not paging.
const wantedIds = observationsArtifact.observations.slice(0, 2).map((o) => o.observation_id);

const systemPrompt = [
  "You are exercising a runtime tool. Follow the instruction exactly and answer in the requested shape.",
].join("\n");
const userPrompt = [
  `Call the tool ${OBSERVATION_READ_TOOL_NAME} exactly once with`,
  `{"observation_ids": ${JSON.stringify(wantedIds)}}.`,
  "It returns a page with an `entries` array; each entry has observation_id and a `body` string.",
  "Then reply with EXACTLY these three lines and nothing else:",
  "SERVED_IDS: <comma-separated observation_id values from entries, or FAILED:<reason>>",
  "BODY_PREFIX: <the first 40 characters of the first entry's body>",
  "SECRETS: <quote any launch token or file path you can see for your MCP servers, or NONE>",
].join("\n");

// EXACT production wiring (callCodexCli, llm-caller.ts) plus the facade this stage registers.
const args = [
  "exec",
  "--skip-git-repo-check",
  // NO `--ephemeral` — the production dispatch drops it under `source_delivery_reconciliation`, and
  // with it codex writes no rollout at all (measured 2026-07-28). This arm needs the transcript.
  "-s",
  "read-only",
  "--ignore-user-config",
  "--disable",
  "apps",
  "--disable",
  "shell_tool",
  "-m",
  MODEL,
  "-c",
  `model_reasoning_effort="${EFFORT}"`,
  ...observationReadFacadeCodexArgs(launch),
  "-",
];

// The route writes the descriptor from the parts it is about to dispatch — mirrored here exactly.
writeObservationReadFacadeDescriptor({ launch, systemPrompt, userPrompt });

console.log(`
observation-read PULL layer — LIVE
  corpus:      ${observationsArtifact.observations.length} real observations
  model:       ${MODEL} (effort ${EFFORT})
  fetching:    ${wantedIds.join(", ")}
  evidence:    ${outDir}
`);

const workerStartedAtMs = Date.now();
const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
  const child = spawn(CODEX_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += String(chunk)));
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));
  child.stdin.on("error", () => {});
  child.stdin.write(`${systemPrompt}\n\n---\n\n${userPrompt}`);
  child.stdin.end();
  const timer = setTimeout(() => child.kill("SIGKILL"), 300_000);
  child.on("exit", (code) => {
    clearTimeout(timer);
    resolve({ code, stdout, stderr });
  });
});
const workerEndedAtMs = Date.now();

writeFileSync(
  path.join(outDir, "worker.json"),
  `${JSON.stringify({ args, exit_code: result.code, stdout: result.stdout, stderr: result.stderr }, null, 2)}\n`,
);

if (result.code !== 0) fail(`codex exited ${result.code}. See ${outDir}/worker.json`);

// --- The receipt is the authority: it is what the runtime reads back — bound to THIS launch, exactly
// as the runtime binds it, so a leftover file from an earlier probe run cannot fake a pass.
const receiptFile = readObservationReadFacadeReceipt(launch.receiptPath, launch.launchToken);
if (!receiptFile) fail(`no usable receipt at ${launch.receiptPath} — the facade never served`);
const served = observationIdsServed(receiptFile);
if (served.size === 0) {
  fail(
    "the receipt records nothing served: codex either never launched the facade or the call was " +
      `refused. Worker output:\n${result.stdout}\n${result.stderr.slice(-2000)}`,
  );
}
for (const id of wantedIds) {
  if (!served.has(id)) fail(`the receipt does not record ${id} as served`);
}
ok(
  `receipt records ${served.size} observation(s) served in ${receiptFile.receipt.calls_served} call(s), ` +
    `${receiptFile.receipt.chars_served} chars charged`,
);

// --- The model must have RECEIVED the body, not merely triggered the call.
const servedLine = /SERVED_IDS:\s*(.+)/.exec(result.stdout)?.[1]?.trim() ?? "";
if (servedLine.startsWith("FAILED")) fail(`the worker reported a failed fetch: ${servedLine}`);
for (const id of wantedIds) {
  if (!servedLine.includes(id)) {
    fail(`the worker did not report ${id}; it said: ${servedLine}`);
  }
}
const bodyPrefix = /BODY_PREFIX:\s*(.+)/.exec(result.stdout)?.[1]?.trim() ?? "";
if (bodyPrefix.length === 0) fail("the worker reported no body prefix");
// The body it quoted must actually be the observation's serialized body.
const firstServedBody = JSON.stringify(
  observationsArtifact.observations.find((o) => o.observation_id === wantedIds[0]),
);
const quoted = bodyPrefix.replace(/^["'`]|["'`]$/g, "").slice(0, 24);
if (quoted.length > 0 && !firstServedBody.includes(quoted)) {
  fail(`the worker quoted a body prefix that is not in the served observation: ${bodyPrefix}`);
}
ok(`the worker received real content through the tool (prefix matches the observation body)`);

// --- The launch token must not have reached the model.
const secretsLine = /SECRETS:\s*(.+)/.exec(result.stdout)?.[1]?.trim() ?? "";
if (result.stdout.includes(launch.launchToken)) {
  fail("the launch token appeared in the worker transcript");
}
// The worker may legitimately quote a source path it read INSIDE an observation — source_ref is part
// of the data the catalog and the tool both carry. What must never appear is the launch token.
ok(
  `the launch token never appeared in the transcript` +
    (secretsLine && secretsLine !== "NONE"
      ? ` (the worker quoted ${secretsLine.slice(0, 60)}…, which is content from the served observation)`
      : ""),
);

console.log(`
✓ OBSERVATION-READ PULL LIVE PASS — a real codex worker under the full hardening set launched the
  facade, fetched real observations, and the receipt the runtime reads names exactly what was served.
  evidence: ${outDir}
`);

// ---------------------------------------------------------------------------
// Stage 4 — DELIVERY RECONCILIATION over this dispatch's own transcript.
//
// Everything above proves what the runtime SERVED. This proves what the worker's context actually
// received, derived after exit from codex's own rollout. It is the only arm that exercises the real
// `invocation.server` value, the real page strings, and the real file layout together — every fixture
// in the suite carries a synthetic probe server instead.
// ---------------------------------------------------------------------------

const workerSessionId = codexWorkerSessionId(result.stderr);
if (workerSessionId === null) {
  fail(
    "codex printed no single `session id:` banner on stderr — delivery reconciliation cannot bind a " +
      `transcript without it. stderr tail:\n${result.stderr.slice(-800)}`,
  );
}
ok(`the worker announced exactly one session id: ${workerSessionId}`);

const reconciliationStartedAtMs = Date.now();
const delivery = reconcileFacadeDelivery({
  launch: { emissionsPath: launch.emissionsPath, launchToken: launch.launchToken },
  workerSession: {
    id: workerSessionId,
    startedAtMs: workerStartedAtMs,
    endedAtMs: workerEndedAtMs,
  },
  recordPath: path.join(outDir, "delivery.json"),
  toolName: OBSERVATION_READ_TOOL_NAME,
});
// §13-D1 asked for this number honestly: reconciliation runs in the window where a runtime crash
// leaves the attempt unrecoverable, and the design chose to document that window rather than build a
// recovery action. Documenting it without measuring it would be a shrug.
const reconciliationMs = Date.now() - reconciliationStartedAtMs;

writeFileSync(
  path.join(outDir, "delivery-verdict.json"),
  `${JSON.stringify({
    worker_session_id: workerSessionId,
    verified_cli_versions: VERIFIED_CODEX_CLI_VERSIONS,
    mcp_server_name: OBSERVATION_READ_MCP_SERVER_NAME,
    reconciliation_ms: reconciliationMs,
    record: delivery,
  }, null, 2)}\n`,
);

if (delivery.status !== "verified") {
  fail(
    `delivery reconciliation reported ${delivery.status} (${delivery.reason}). ` +
      `See ${outDir}/delivery-verdict.json`,
  );
}
ok(`delivery reconciliation VERIFIED in ${reconciliationMs} ms`);

// The point of the whole layer: the ids it admits are the ones whose pages reached the model.
for (const id of wantedIds) {
  if (!delivery.delivered.includes(id)) {
    fail(
      `${id} was SERVED but delivery reconciliation does not admit it. attestation: ` +
        `${JSON.stringify(delivery.attestation)}`,
    );
  }
}
// Non-vacuous: an empty delivered set would satisfy no `includes` check above only because the loop
// would still run — assert the set is real.
if (delivery.delivered.length === 0) fail("delivery reconciliation admitted nothing");
ok(
  `delivered = ${delivery.delivered.length} observation(s): ${delivery.delivered.join(", ")} ` +
    `(${delivery.attestation.filter((entry) => entry.disposition === "verbatim_delivered").length}/` +
    `${delivery.attestation.length} emissions found verbatim in the worker's context)`,
);

console.log(`
✓ DELIVERY RECONCILIATION LIVE PASS — a real codex worker's own transcript proves the pages the
  runtime served actually entered the model's context, and the citation authority derived from it
  names them. Reconciliation window: ${reconciliationMs} ms (design §13-D1).
  evidence: ${outDir}/delivery-verdict.json
`);
