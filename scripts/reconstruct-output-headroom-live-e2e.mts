/**
 * N=1 live route-compatibility probe for reconstruct semantic-author output
 * headroom. This is not benchmark evidence for a default or quality decision.
 *
 * Usage:
 *   npm run test:reconstruct:output-headroom:live
 *   npm run test:reconstruct:output-headroom:live -- --go
 */
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createOntoReconstructCoreApi } from "../src/core-api/reconstruct-api.ts";
import {
  assertSettingsModelsSupported,
  resolveSettingsChain,
} from "../src/core-runtime/discovery/settings-chain.ts";
import { normalizeLlmModelSwitcher } from "../src/core-runtime/llm/model-switcher.ts";
import {
  RECONSTRUCT_SEMANTIC_AUTHOR_OUTPUT_CEILINGS,
} from "../src/core-runtime/reconstruct/output-budget.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = path.join(
  REPO_ROOT,
  "development-records",
  "reference",
  "material-kind",
  "accounting-schedule.csv",
);
const HEADROOM_TOKENS = 25_000;
const CANDIDATE_BASE_TOKENS =
  RECONSTRUCT_SEMANTIC_AUTHOR_OUTPUT_CEILINGS.candidate_disposition;
const ONTOLOGY_SEED_BASE_TOKENS =
  RECONSTRUCT_SEMANTIC_AUTHOR_OUTPUT_CEILINGS.ontology_seed;
const MAX_OPENAI_REQUESTS = 120;
const execFileAsync = promisify(execFile);

type TargetStage = "candidate_disposition" | "ontology_seed";

export interface ObservedRequest {
  stage: TargetStage;
  method: string;
  path: string;
  model: string | null;
  effort: string | null;
  store: boolean | null;
  request_body_sha256: string;
  max_output_tokens: number | null;
  provider_status: string | null;
  response_model: string | null;
  response_id_sha256: string | null;
  http_status: number | null;
  transport_error: string | null;
}

function log(message: string): void {
  process.stdout.write(`[reconstruct-output-headroom-live] ${message}\n`);
}

function sha256(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requestUrl(input: string | URL | Request): URL {
  return input instanceof Request ? new URL(input.url) : new URL(String(input));
}

async function requestBodyText(
  input: string | URL | Request,
  init: RequestInit | undefined,
): Promise<string> {
  if (typeof init?.body === "string") return init.body;
  if (input instanceof Request) return input.clone().text();
  return "";
}

function targetStage(body: string): TargetStage | null {
  if (body.includes("Author candidate-disposition.yaml")) {
    return "candidate_disposition";
  }
  if (body.includes("Author ontology-seed.yaml as an OntologySeed")) {
    return "ontology_seed";
  }
  return null;
}

function requestPayload(body: string): {
  max_output_tokens: number | null;
  model: string | null;
  effort: string | null;
  store: boolean | null;
} {
  try {
    const parsed = JSON.parse(body) as {
      max_output_tokens?: unknown;
      model?: unknown;
      store?: unknown;
      reasoning?: { effort?: unknown };
    };
    return {
      max_output_tokens: typeof parsed.max_output_tokens === "number"
        ? parsed.max_output_tokens
        : null,
      model: typeof parsed.model === "string" ? parsed.model : null,
      effort: typeof parsed.reasoning?.effort === "string"
        ? parsed.reasoning.effort
        : null,
      store: typeof parsed.store === "boolean" ? parsed.store : null,
    };
  } catch {
    return { max_output_tokens: null, model: null, effort: null, store: null };
  }
}

async function providerResponseMetadata(response: Response): Promise<{
  status: string | null;
  model: string | null;
  id_sha256: string | null;
}> {
  try {
    const payload = await response.clone().json() as {
      status?: unknown;
      model?: unknown;
      id?: unknown;
    };
    return {
      status: typeof payload.status === "string" ? payload.status : null,
      model: typeof payload.model === "string" ? payload.model : null,
      id_sha256: typeof payload.id === "string" ? sha256(payload.id) : null,
    };
  } catch {
    return { status: null, model: null, id_sha256: null };
  }
}

function credentialReady(value: string | undefined): boolean {
  return typeof value === "string" &&
    value.startsWith("sk-") &&
    value.trim() === value &&
    value.length >= 20;
}

function isSdkRetryableHttpStatus(status: number | null): boolean {
  return status === 408 || status === 409 || status === 429 ||
    (status !== null && status >= 500);
}

export function isCompletedPhysicalAttempt(row: ObservedRequest): boolean {
  return row.transport_error === null &&
    row.http_status !== null &&
    row.http_status >= 200 &&
    row.http_status < 300 &&
    row.provider_status === "completed" &&
    row.response_model?.startsWith("gpt-5.5") === true &&
    Boolean(row.response_id_sha256);
}

function projectSettings(): unknown {
  const directApiActor = {
    llm: {
      auth: "api_key",
      provider: "openai",
      model: "gpt-5.5",
      effort: "low",
      api_key_env: "OPENAI_API_KEY",
    },
  };
  return {
    schema_version: "settings.json/v3",
    reconstruct: {
      execution: {
        actors: {
          semantic_author: {
            ...directApiActor,
            llm_runtime: {
              openai_responses_output_headroom_tokens: HEADROOM_TOKENS,
            },
          },
          confirmation_provider: directApiActor,
        },
        semantic_map_authoring: false,
        dispatch_breaker: { enabled: false },
        dispatch_fallback: { enabled: false },
      },
    },
  };
}

export function assertObservedStage(args: {
  observations: ObservedRequest[];
  stage: TargetStage;
  expectedMaxOutputTokens: number;
}): ObservedRequest[] {
  const rows = args.observations.filter((row) => row.stage === args.stage);
  if (rows.length === 0) {
    throw new Error(`no physical OpenAI request observed for ${args.stage}`);
  }
  const rowsByRequestBody = new Map<string, ObservedRequest[]>();
  for (const row of rows) {
    if (
      row.method !== "POST" ||
      row.path !== "/v1/responses" ||
      row.model !== "gpt-5.5" ||
      row.effort !== "low" ||
      row.store !== false
    ) {
      throw new Error(
        `${args.stage} route mismatch: ${row.method} ${row.path} ` +
          `model=${row.model} effort=${row.effort} store=${row.store}`,
      );
    }
    if (row.max_output_tokens !== args.expectedMaxOutputTokens) {
      throw new Error(
        `${args.stage} max_output_tokens=${row.max_output_tokens}; ` +
          `expected ${args.expectedMaxOutputTokens}`,
      );
    }
    const grouped = rowsByRequestBody.get(row.request_body_sha256) ?? [];
    grouped.push(row);
    rowsByRequestBody.set(row.request_body_sha256, grouped);
    if (row.transport_error === null) {
      const completed = isCompletedPhysicalAttempt(row);
      if (!completed && !isSdkRetryableHttpStatus(row.http_status)) {
        throw new Error(
          `${args.stage} non-completed provider response: http=${row.http_status} ` +
            `status=${row.provider_status} model=${row.response_model}`,
        );
      }
    }
  }
  for (const [requestBodyHash, attempts] of rowsByRequestBody) {
    if (!attempts.some(isCompletedPhysicalAttempt)) {
      throw new Error(
        `${args.stage} request ${requestBodyHash} has no completed physical attempt`,
      );
    }
  }
  return rows;
}

async function assertNonEmptyArtifacts(sessionRoot: string): Promise<{
  candidate_disposition_ref: string;
  ontology_seed_ref: string;
  candidate_disposition_count: number;
  ontology_seed_top_level_key_count: number;
  candidate_disposition_sha256: string;
  ontology_seed_sha256: string;
  candidate_disposition_reuse_match_hash: string;
  ontology_seed_reuse_match_hash: string;
}> {
  const candidateRef = path.join(sessionRoot, "candidate-disposition.yaml");
  const ontologySeedRef = path.join(sessionRoot, "ontology-seed.yaml");
  const candidate = parseYaml(await fs.readFile(candidateRef, "utf8")) as {
    dispositions?: unknown[];
  };
  const ontologySeed = parseYaml(await fs.readFile(ontologySeedRef, "utf8")) as
    Record<string, unknown>;
  const candidateBytes = await fs.readFile(candidateRef);
  const ontologySeedBytes = await fs.readFile(ontologySeedRef);
  const candidateProvenance = parseYaml(await fs.readFile(
    `${candidateRef}.reuse-provenance.yaml`,
    "utf8",
  )) as { reuse_match_hash?: unknown };
  const ontologySeedProvenance = parseYaml(await fs.readFile(
    `${ontologySeedRef}.reuse-provenance.yaml`,
    "utf8",
  )) as { reuse_match_hash?: unknown };
  const dispositionCount = candidate.dispositions?.length ?? 0;
  const seedKeyCount = Object.keys(ontologySeed).length;
  if (dispositionCount === 0 || seedKeyCount === 0) {
    throw new Error(
      `target artifacts are empty: dispositions=${dispositionCount} seed_keys=${seedKeyCount}`,
    );
  }
  if (
    typeof candidateProvenance.reuse_match_hash !== "string" ||
    typeof ontologySeedProvenance.reuse_match_hash !== "string"
  ) {
    throw new Error("target artifact reuse identity is missing");
  }
  return {
    candidate_disposition_ref: candidateRef,
    ontology_seed_ref: ontologySeedRef,
    candidate_disposition_count: dispositionCount,
    ontology_seed_top_level_key_count: seedKeyCount,
    candidate_disposition_sha256: sha256(candidateBytes),
    ontology_seed_sha256: sha256(ontologySeedBytes),
    candidate_disposition_reuse_match_hash:
      candidateProvenance.reuse_match_hash,
    ontology_seed_reuse_match_hash: ontologySeedProvenance.reuse_match_hash,
  };
}

async function run(): Promise<void> {
  const go = process.argv.includes("--go");
  if (process.env.ONTO_LLM_MOCK !== undefined) {
    throw new Error("live probe refuses to run while ONTO_LLM_MOCK is present");
  }
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const projectRoot = path.join(
    REPO_ROOT,
    ".onto",
    "temp",
    `reconstruct-output-headroom-live-${runId}`,
  );
  const projectSettingsRef = path.join(projectRoot, ".onto", "settings.json");
  const targetRef = path.join(projectRoot, "accounting-schedule.csv");
  const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "session");
  const fixtureBytes = await fs.readFile(FIXTURE_PATH);
  const harnessBytes = await fs.readFile(fileURLToPath(import.meta.url));
  const sourceRefs = [
    "src/core-runtime/llm/llm-caller.ts",
    "src/core-runtime/llm/openai-responses-incomplete-error.ts",
    "src/core-runtime/reconstruct/leaf-reader.ts",
    "src/core-runtime/reconstruct/llm-dispatch-failure.ts",
    "src/core-runtime/reconstruct/output-budget.ts",
    "src/core-runtime/reconstruct/run-control-validation.ts",
    "src/core-runtime/reconstruct/run.ts",
    "src/core-api/reconstruct-api.ts",
    "src/core-runtime/discovery/settings-chain.ts",
    "src/core-runtime/discovery/supported-models.ts",
    ".onto/settings.json",
    ".onto/authority/supported-models.yaml",
    ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    "package-lock.json",
    "node_modules/openai/package.json",
  ];
  const sourceSha256Before = Object.fromEntries(await Promise.all(
    sourceRefs.map(async (ref) => [
      ref,
      sha256(await fs.readFile(path.join(REPO_ROOT, ref))),
    ]),
  ));
  await fs.mkdir(path.dirname(projectSettingsRef), { recursive: true });
  await fs.writeFile(
    projectSettingsRef,
    `${JSON.stringify(projectSettings(), null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(targetRef, fixtureBytes);

  const settings = await resolveSettingsChain(REPO_ROOT, projectRoot);
  assertSettingsModelsSupported(settings);
  const semanticAuthor =
    settings.reconstruct?.execution?.actors?.semantic_author;
  if (!semanticAuthor?.llm || !semanticAuthor.llm_runtime) {
    throw new Error("preflight requires a full semantic_author actor and llm_runtime");
  }
  const selection = normalizeLlmModelSwitcher(semanticAuthor.llm);
  if (
    !selection ||
    selection.model_provider !== "openai" ||
    selection.auth !== "api_key" ||
    selection.execution_route !== "direct_model_call" ||
    selection.execution_adapter !== "openai_sdk" ||
    selection.wire_format !== "native_sdk" ||
    selection.model_id !== "gpt-5.5" ||
    selection.reasoning_effort !== "low"
  ) {
    throw new Error("preflight route is not openai/api_key/openai_sdk/gpt-5.5/low");
  }
  const targetStat = await fs.stat(targetRef);
  if (!targetStat.isFile() || targetStat.size === 0) {
    throw new Error("preflight target set is empty");
  }
  const credentialPresentAndValid = credentialReady(process.env.OPENAI_API_KEY);
  const transportTimeoutOverrideMs = process.env.ONTO_LLM_TIMEOUT_MS === undefined
    ? null
    : Number(process.env.ONTO_LLM_TIMEOUT_MS);
  if (
    transportTimeoutOverrideMs !== null &&
    (!Number.isSafeInteger(transportTimeoutOverrideMs) || transportTimeoutOverrideMs <= 0)
  ) {
    throw new Error("ONTO_LLM_TIMEOUT_MS must be a positive safe integer when present");
  }
  const preflight = {
    schema_version: "reconstruct-output-headroom-live-preflight/v1",
    evidence_class: "preliminary_n1_route_compatibility",
    created_at: new Date().toISOString(),
    go,
    project_root: projectRoot,
    session_root: sessionRoot,
    target_ref: targetRef,
    target_sha256: sha256(fixtureBytes),
    settings_sha256: sha256(`${JSON.stringify(projectSettings(), null, 2)}\n`),
    harness_sha256: sha256(harnessBytes),
    target_count: 1,
    route: {
      provider: selection.model_provider,
      auth: selection.auth,
      adapter: selection.execution_adapter,
      wire_format: selection.wire_format,
      model: selection.model_id,
      effort: selection.reasoning_effort,
      credential_env: selection.api_key_env,
      credential_present_and_format_valid: credentialPresentAndValid,
      transport_timeout_override_ms: transportTimeoutOverrideMs,
    },
    headroom_tokens: HEADROOM_TOKENS,
    expected_max_output_tokens: {
      candidate_disposition: CANDIDATE_BASE_TOKENS + HEADROOM_TOKENS,
      ontology_seed: ONTOLOGY_SEED_BASE_TOKENS + HEADROOM_TOKENS,
    },
    product_claim_limit:
      "N=1 route compatibility and changed-path execution only; not a default, quality, or cost decision",
  };
  const preflightRef = path.join(projectRoot, "output-headroom-live-preflight.json");
  await fs.writeFile(preflightRef, `${JSON.stringify(preflight, null, 2)}\n`);
  log(`preflight=${preflightRef}`);
  if (!go) {
    log("provider_calls=0 (--go absent)");
    return;
  }
  if (!credentialPresentAndValid) {
    throw new Error("OPENAI_API_KEY is absent or malformed; refusing provider calls");
  }

  const originalFetch = globalThis.fetch;
  const observations: ObservedRequest[] = [];
  let openAiRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.hostname !== "api.openai.com") {
      return originalFetch(input, init);
    }
    openAiRequests += 1;
    if (openAiRequests > MAX_OPENAI_REQUESTS) {
      const capFailureRef = path.join(projectRoot, "output-headroom-live-cap-failure.json");
      await fs.writeFile(capFailureRef, `${JSON.stringify({
        schema_version: "reconstruct-output-headroom-live-cap-failure/v1",
        failed_at: new Date().toISOString(),
        max_openai_requests: MAX_OPENAI_REQUESTS,
        completed_physical_requests: openAiRequests - 1,
        session_root: sessionRoot,
      }, null, 2)}\n`);
      process.stderr.write(
        `[reconstruct-output-headroom-live] HARD STOP request cap ${MAX_OPENAI_REQUESTS} exceeded; ` +
          `failure=${capFailureRef}\n`,
      );
      process.exit(70);
    }
    const body = await requestBodyText(input, init);
    const stage = targetStage(body);
    const payload = stage ? requestPayload(body) : null;
    const observation = stage && payload
      ? {
          stage,
          method: (init?.method ?? (input instanceof Request ? input.method : "GET"))
            .toUpperCase(),
          path: url.pathname,
          model: payload.model,
          effort: payload.effort,
          store: payload.store,
          request_body_sha256: sha256(body),
          max_output_tokens: payload.max_output_tokens,
          provider_status: null,
          response_model: null,
          response_id_sha256: null,
          http_status: null,
          transport_error: null,
        } satisfies ObservedRequest
      : null;
    if (observation) observations.push(observation);
    let response: Response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      if (observation) {
        observation.transport_error = error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      }
      throw error;
    }
    if (stage) {
      const responseMetadata = await providerResponseMetadata(response);
      if (!observation) throw new Error(`missing request observation for ${stage}`);
      observation.provider_status = responseMetadata.status;
      observation.response_model = responseMetadata.model;
      observation.response_id_sha256 = responseMetadata.id_sha256;
      observation.http_status = response.status;
    }
    return response;
  };

  const api = createOntoReconstructCoreApi({ ontoHome: REPO_ROOT });
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const observationCheckpointRef = path.join(
    projectRoot,
    "output-headroom-live-observations.json",
  );
  const writeObservationCheckpoint = async (args: {
    terminalStatus: string;
    recordStage: string | null;
    terminalError: { name: string; message: string } | null;
    failure?: unknown;
  }): Promise<void> => {
    let targetPath:
      | {
          status: "confirmed";
          candidate_requests: ObservedRequest[];
          ontology_seed_requests: ObservedRequest[];
          artifacts: Awaited<ReturnType<typeof assertNonEmptyArtifacts>>;
        }
      | { status: "not_confirmed"; reason: string };
    try {
      const candidateRequests = assertObservedStage({
        observations,
        stage: "candidate_disposition",
        expectedMaxOutputTokens: CANDIDATE_BASE_TOKENS + HEADROOM_TOKENS,
      });
      const ontologySeedRequests = assertObservedStage({
        observations,
        stage: "ontology_seed",
        expectedMaxOutputTokens: ONTOLOGY_SEED_BASE_TOKENS + HEADROOM_TOKENS,
      });
      targetPath = {
        status: "confirmed",
        candidate_requests: candidateRequests,
        ontology_seed_requests: ontologySeedRequests,
        artifacts: await assertNonEmptyArtifacts(sessionRoot),
      };
    } catch (error) {
      targetPath = {
        status: "not_confirmed",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    const sourceSha256After = Object.fromEntries(await Promise.all(
      sourceRefs.map(async (ref) => [
        ref,
        sha256(await fs.readFile(path.join(REPO_ROOT, ref))),
      ]),
    ));
    await fs.writeFile(observationCheckpointRef, `${JSON.stringify({
      schema_version: "reconstruct-output-headroom-live-observations/v1",
      terminal_status: args.terminalStatus,
      record_stage: args.recordStage,
      terminal_error: args.terminalError,
      ...(args.failure !== undefined ? { failure: args.failure } : {}),
      target_path: targetPath,
      openai_physical_request_count: openAiRequests,
      observations,
      provenance: {
        source_sha256_before: sourceSha256Before,
        source_sha256_after: sourceSha256After,
        load_bearing_sources_stable_during_run:
          JSON.stringify(sourceSha256Before) === JSON.stringify(sourceSha256After),
      },
    }, null, 2)}\n`);
  };
  let result: Awaited<ReturnType<typeof api.runReconstruct>>;
  try {
    result = await api.runReconstruct({
      projectRoot,
      targetRefs: [targetRef],
      sessionRoot,
      intent:
        "Reconstruct a compact operational ontology seed for answering accounting schedule questions about period, account, amount, and approval state.",
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
    });
  } catch (error) {
    await writeObservationCheckpoint({
      terminalStatus: "threw",
      recordStage: null,
      terminalError: error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "unknown", message: String(error) },
    });
    throw error;
  } finally {
    globalThis.fetch = originalFetch;
  }

  if (result.status === "failed") {
    await writeObservationCheckpoint({
      terminalStatus: result.status,
      recordStage: null,
      terminalError: null,
      failure: result.failure,
    });
    throw new Error(
      `live reconstruct failed at ${result.failure.unit_id}: ${result.failure.failure_code}`,
    );
  }
  await writeObservationCheckpoint({
    terminalStatus: result.status,
    recordStage: result.reconstructRecord.record_stage,
    terminalError: null,
  });
  if (result.status !== "completed" || result.reconstructRecord.record_stage !== "completed") {
    throw new Error(
      `live reconstruct terminal status=${result.status} ` +
        `record_stage=${result.reconstructRecord.record_stage}; expected completed`,
    );
  }
  const candidateRequests = assertObservedStage({
    observations,
    stage: "candidate_disposition",
    expectedMaxOutputTokens: CANDIDATE_BASE_TOKENS + HEADROOM_TOKENS,
  });
  const ontologySeedRequests = assertObservedStage({
    observations,
    stage: "ontology_seed",
    expectedMaxOutputTokens: ONTOLOGY_SEED_BASE_TOKENS + HEADROOM_TOKENS,
  });
  const artifacts = await assertNonEmptyArtifacts(sessionRoot);
  const finalOutputText = await fs.readFile(result.finalOutputPath, "utf8");
  if (!finalOutputText.trim()) throw new Error("final output is empty");

  const gitHead = (await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
  })).stdout.trim();
  const gitStatus = (await execFileAsync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 },
  )).stdout;
  const sourceSha256After = Object.fromEntries(await Promise.all(
    sourceRefs.map(async (ref) => [
      ref,
      sha256(await fs.readFile(path.join(REPO_ROOT, ref))),
    ]),
  ));
  if (JSON.stringify(sourceSha256Before) !== JSON.stringify(sourceSha256After)) {
    throw new Error("changed-path source bytes changed during the live probe");
  }
  const evidence = {
    schema_version: "reconstruct-output-headroom-live-evidence/v1",
    evidence_class: "preliminary_n1_route_compatibility",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - startedMs,
    project_root: projectRoot,
    session_root: sessionRoot,
    target_sha256: sha256(fixtureBytes),
    provenance: {
      git_head: gitHead,
      worktree_dirty: gitStatus.trim().length > 0,
      worktree_status_sha256: sha256(gitStatus),
      settings_sha256: preflight.settings_sha256,
      harness_sha256: preflight.harness_sha256,
      source_sha256_before: sourceSha256Before,
      source_sha256_after: sourceSha256After,
      load_bearing_sources_stable_during_run: true,
    },
    route: preflight.route,
    headroom_tokens: HEADROOM_TOKENS,
    openai_physical_request_count: openAiRequests,
    target_stage_requests: {
      candidate_disposition: candidateRequests,
      ontology_seed: ontologySeedRequests,
    },
    terminal: {
      status: result.status,
      record_stage: result.reconstructRecord.record_stage,
      final_output_sha256: sha256(finalOutputText),
    },
    artifacts,
    product_claim_limit: preflight.product_claim_limit,
  };
  const evidenceDir = path.join(
    REPO_ROOT,
    "development-records",
    "benchmark",
    "reconstruct-output-headroom-live",
  );
  await fs.mkdir(evidenceDir, { recursive: true });
  const evidenceRef = path.join(evidenceDir, `${runId}.json`);
  await fs.writeFile(evidenceRef, `${JSON.stringify(evidence, null, 2)}\n`);
  log(`PASS evidence=${evidenceRef}`);
  log(
    `status=${result.status} candidate_requests=${candidateRequests.length} ` +
      `ontology_seed_requests=${ontologySeedRequests.length} ` +
      `openai_requests=${openAiRequests}`,
  );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await run();
}
