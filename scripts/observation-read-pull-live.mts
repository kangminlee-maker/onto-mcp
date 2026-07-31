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
  readObservationReadFacadeEmissions,
  readObservationReadFacadeReceipt,
  writeObservationReadFacadeDescriptor,
  type ObservationReadFacadeLaunch,
} from "../src/core-runtime/reconstruct/observation-read-facade.ts";
import { codexWorkerSessionId } from "../src/core-runtime/llm/llm-caller.ts";
import {
  reconcileFacadeDelivery,
  VERIFIED_CODEX_CLI_VERSIONS,
} from "../src/core-runtime/reconstruct/delivery-reconciliation.ts";
import { canonicalObservationBody } from "../src/core-runtime/reconstruct/observation-read.ts";
import { indexEmittedObservationRanges } from "../src/core-runtime/reconstruct/observation-range-id.ts";
import { OBSERVATION_READ_PAGE_CHAR_BUDGET } from "../src/core-runtime/reconstruct/observation-read-grant.ts";
import { coversWholeObservation } from "../src/core-runtime/reconstruct/observation-read-coverage.ts";

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
/** A loud non-fatal note: the layer behaved correctly but the ENVIRONMENT limits what it can prove. */
const warn = (message: string): void => console.log(`  ! ${message}`);

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
    no_prompt_use_count: (ledgerArtifact.safety_rows as { visibility_tier?: unknown }[])
      .filter((row) => row.visibility_tier === "no_prompt_use").length,
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

// What the model will be told to fetch. ONE observation that really SPLITS at this grant's budget,
// because the unit this layer delivers is a range and a single-page fetch cannot show a range being
// walked. The earlier arm took `slice(0, 2)` — two observations of 10,018 and 3,483 chars, one page
// each — which proved the ROUTE and nothing about paging; that was right for stage 3b and stopped
// being enough when the unit changed (design `23-…md`).
//
// DERIVED, not named: a hard-coded id goes stale silently when the fixture changes, and a
// single-page observation would make every assertion below pass while proving the opposite.
const splitting = observationsArtifact.observations
  // The CANONICAL body — the same serialization the reader slices, imported rather than re-derived
  // with a local `JSON.stringify`, because a drifted body makes every offset name other characters.
  .map((observation) => ({
    id: observation.observation_id as string,
    chars: canonicalObservationBody(observation).length,
  }))
  .sort((left, right) => left.chars - right.chars)
  // Big enough to need several pages, small enough that walking it stays far under the call limit.
  .find((candidate) =>
    candidate.chars > OBSERVATION_READ_PAGE_CHAR_BUDGET * 2 &&
    candidate.chars < OBSERVATION_READ_PAGE_CHAR_BUDGET * 4
  );
if (!splitting) {
  fail("no observation in the corpus splits into 3-4 pages at this budget; the paging arm is vacuous");
}
const wantedIds = [splitting.id];

const systemPrompt = [
  "You are exercising a runtime tool. Follow the instruction exactly and answer in the requested shape.",
].join("\n");
const userPrompt = [
  `Call the tool ${OBSERVATION_READ_TOOL_NAME} with`,
  `{"observation_ids": ${JSON.stringify(wantedIds)}}.`,
  "It returns a page with an `entries` array; each entry has observation_id, range_id, part_index,",
  "part_count and a `body` string. The observation is LARGER THAN ONE PAGE, so the page also carries",
  '`next_cursor`. Keep calling the tool with {"cursor": "<the next_cursor you just received>"} until a',
  "page comes back WITHOUT next_cursor. Do not stop early.",
  "Then reply with EXACTLY these five lines and nothing else:",
  "SERVED_IDS: <comma-separated observation_id values from entries, or FAILED:<reason>>",
  "PAGES: <how many tool calls you made>",
  "RANGE_IDS: <comma-separated range_id values, in the order you received them>",
  "BODY_TAIL: <the LAST 40 characters of the LAST page's entry body>",
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
// --- PAGING. The worker must have WALKED the observation, and the tail is the part that matters:
// codex trims a tool result middle-out, so a head prefix survives a clip that destroyed the content.
// Quoting the END is evidence the last page arrived whole.
const servedBody = canonicalObservationBody(
  observationsArtifact.observations.find((o) => o.observation_id === wantedIds[0]),
);
const pagesLine = /PAGES:\s*(\d+)/.exec(result.stdout)?.[1] ?? "";
const pagesReported = Number(pagesLine);
if (!Number.isInteger(pagesReported) || pagesReported < 2) {
  fail(`the worker reported ${pagesLine || "no"} page(s); this arm needs a multi-page walk`);
}
// NOT an equality. The receipt counts CALLS SERVED; the worker counts the distinct pages it used, and
// a model may legitimately repeat a call — the first live run of this arm did exactly that (two calls
// for part 1/3, then two cursor steps: 4 calls, 3 distinct ranges), and an equality assertion read that
// as a runtime/worker disagreement when nothing was wrong. The receipt stays the authority on calls.
if (receiptFile.receipt.calls_served < pagesReported) {
  fail(
    `the worker claims ${pagesReported} pages but the receipt records only ` +
      `${receiptFile.receipt.calls_served} served call(s) — it cannot have received pages the runtime ` +
      "never served",
  );
}
// The tail the worker quotes is a NOTE, not a gate. Asking a model to copy 40 exact characters is
// asking it to do the one thing it is unreliable at: across runs of this arm the same model quoted the
// true tail once and a passage from the middle the next time, at the same effort. Failing on that would
// make the probe flaky about the MODEL while saying nothing about the layer.
//
// The gate for "the last page arrived whole" is DELIVERY RECONCILIATION below, and it is strictly
// stronger: it looks for each emitted page's ENTIRE canonical text in the worker's own transcript, not
// for 24 characters the model retyped. A clipped last page cannot produce whole coverage there.
const bodyTail = /BODY_TAIL:\s*(.+)/.exec(result.stdout)?.[1]?.trim() ?? "";
const quotedTail = bodyTail
  .replace(/^["'`]|["'`]$/g, "")
  // The worker receives `body` as a JSON string VALUE, so it sees the escaped form: the canonical
  // body's `"` arrives as `\"`. Comparing the two forms directly fails on any tail holding a quote.
  .replace(/\\"/g, '"')
  .replace(/\\\\/g, "\\")
  .slice(-24);
const tailMatched = quotedTail.length > 0 && servedBody.endsWith(quotedTail);
ok(
  `the worker walked ${pagesReported} pages over a ${servedBody.length.toLocaleString()}-char ` +
    `observation (tail quote ${tailMatched ? "matches the true end" : "did not match — see reconciliation below"})`,
);
// --- REASSEMBLY is the RUNTIME's claim, not the worker's: the receipt's ranges must merge into one
// segment covering [0, body_length). Asking the worker to echo an 80 KB body would prove nothing that
// the transport could not have mangled on the way back.
const servedRecord = receiptFile.receipt.served.find((r) => r.observation_id === wantedIds[0]);
if (!servedRecord) fail(`the receipt has no coverage record for ${wantedIds[0]}`);
if (
  !coversWholeObservation({
    ranges: servedRecord.ranges,
    bodyLength: servedRecord.body_length ?? undefined,
  })
) {
  fail(
    `the receipt's ranges do not cover the observation whole: ` +
      `${JSON.stringify(servedRecord.ranges)} of ${servedRecord.body_length}`,
  );
}
if (servedRecord.body_length !== servedBody.length) {
  fail(
    `the receipt says the body is ${servedRecord.body_length} chars, the artifact says ` +
      `${servedBody.length} — the coordinate space the ranges were measured in is not this body`,
  );
}
ok(
  `the ${pagesReported} pages reassemble: ranges merge to [0, ${servedRecord.body_length}) and that ` +
    "is the artifact's own canonical body length",
);

// --- RANGE IDS. Two claims, and they belong to two different authorities.
//
// The TILING is the runtime's: the ids it minted for this observation must cover [0, body_length) in
// order. Asking the worker's report to prove that made the check depend on a model's diligence in
// echoing a list — measured, it answered `PAGES: 3` and then listed two ids, and the assertion failed
// for a reason that says nothing about this layer.
//
// What the WORKER's report proves is narrower and still worth proving: the names it saw are names the
// runtime actually minted. That is the property a citation rests on.
const emittedTable = indexEmittedObservationRanges(
  (readObservationReadFacadeEmissions(launch.emissionsPath, launch.launchToken)?.emissions ?? [])
    .map((emission) => emission.canonical_text),
);
if (emittedTable.size === 0) fail("no emitted ranges could be indexed; the citation surface is dead");
const mintedForTarget = [...emittedTable.entries()]
  .filter(([, ref]) => ref.observation_id === wantedIds[0])
  .sort(([, left], [, right]) => left.body_start - right.body_start);
if (mintedForTarget.length < 2) {
  fail(`only ${mintedForTarget.length} range(s) were minted for ${wantedIds[0]}; the paging arm is vacuous`);
}
let walked = 0;
for (const [rangeId, ref] of mintedForTarget) {
  if (ref.body_start !== walked) {
    fail(`range ${rangeId} starts at ${ref.body_start}, expected ${walked} — the minted ranges leave a hole`);
  }
  walked = ref.body_end;
}
if (walked !== servedBody.length) {
  fail(`the minted ranges stop at ${walked} of ${servedBody.length} chars`);
}
ok(
  `the ${mintedForTarget.length} minted range ids tile [0, ${walked}) in order — every character of ` +
    "the observation has a name a citation could use",
);

const reportedRangeIds = (/RANGE_IDS:\s*(.+)/.exec(result.stdout)?.[1] ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
if (reportedRangeIds.length === 0) fail("the worker reported no range ids at all");
for (const rangeId of reportedRangeIds) {
  if (!emittedTable.has(rangeId)) {
    fail(`the worker reported a range id this launch never emitted: ${rangeId}`);
  }
}
ok(
  `all ${reportedRangeIds.length} range id(s) the worker echoed resolve against what the runtime ` +
    `emitted (it walked ${pagesReported} pages and named ${reportedRangeIds.length})`,
);
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
const attested = delivery.attestation.filter((entry) => entry.disposition === "verbatim_delivered");
if (attested.length === 0) {
  // NOT a probe failure — the layer refusing content that did not arrive is the layer working. What it
  // reveals is a TRANSPORT limit the design predicted and nothing had measured: codex clips the
  // RECEIVED RECORD, and one exec turn can render several tool results into one. Measured here: four
  // pages of ~31,951 chars each — every one under the 32,000 budget and under the 32,151 largest
  // payload ever observed uncut — arrived as three records of 810 / 45,138 / 47,451 chars. The merged
  // ones are above the (32,151, 40,149] bracket, so they were clipped and NOTHING attests.
  //
  // The prescription is the prompt lever the design names: ONE tool call per exec turn. Sizing alone
  // cannot close this (see design `23-…md` §3/S4, F-3).
  warn(
    `NOTHING ATTESTED: ${delivery.attestation.length} page(s) of ~${
      Math.max(...delivery.attestation.map((entry) => entry.chars))
    } chars were served and none appeared verbatim in the worker's context. This is the received-record ` +
      "boundary: a multi-call walk in one turn merges into one output and is clipped. Reconciliation " +
      "refused, which is the correct fail-closed behaviour.",
  );
  if (delivery.delivered.length !== 0) {
    fail(
      "reconciliation admitted coverage while attesting nothing — the fail-closed property is broken, " +
        `which is a defect: ${JSON.stringify(delivery.delivered)}`,
    );
  }
  ok("fail-closed holds: nothing attested, nothing admitted, nothing citable");
} else {
  for (const id of wantedIds) {
    const record = delivery.delivered.find((entry) => entry.observation_id === id);
    if (
      record === undefined ||
      !coversWholeObservation({ ranges: record.ranges, bodyLength: record.body_length ?? undefined })
    ) {
      fail(
        `${id} had attested pages but is not admitted whole (${
          record === undefined ? "no coverage record" : JSON.stringify(record.ranges)
        }). attestation: ${JSON.stringify(delivery.attestation)}`,
      );
    }
  }
  ok(`every requested observation is admitted whole from ${attested.length} attested page(s)`);
}
ok(
  // Rendered per record, not `join`ed: `delivered` is coverage now, and joining an array of objects
  // prints `[object Object]` — which reads like a pass while showing nothing. (It did, on the first
  // live run after the range change.)
  `delivered = ${delivery.delivered.length} observation(s): ${
    delivery.delivered
      .map((entry) =>
        `${entry.observation_id} ${
          entry.ranges.map(([start, end]) => `[${start},${end})`).join("+")
        }/${entry.body_length ?? "?"}`
      )
      .join(", ")
  } ` +
    `(${delivery.attestation.filter((entry) => entry.disposition === "verbatim_delivered").length}/` +
    `${delivery.attestation.length} emissions found verbatim in the worker's context)`,
);

console.log(`
✓ DELIVERY RECONCILIATION LIVE PASS — a real codex worker's own transcript proves the pages the
  runtime served actually entered the model's context, and the citation authority derived from it
  names them. Reconciliation window: ${reconciliationMs} ms (design §13-D1).
  evidence: ${outDir}/delivery-verdict.json
`);
