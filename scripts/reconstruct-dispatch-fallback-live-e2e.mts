/**
 * Bounded live evidence for reconstruct dispatch-fallback P1a.
 *
 * The isolated project settings own every route. The normal reconstruct author
 * remains on the configured OAuth worker. Only the primary semantic-map
 * synthesize HTTP request is replaced with a deterministic SDK-shaped 429;
 * fallback synthesize/verify requests use the official alternate-provider SDK.
 *
 * Usage:
 *   npm run test:reconstruct:dispatch-fallback:live
 *   npm run test:reconstruct:dispatch-fallback:live -- --go
 *   npm run test:reconstruct:dispatch-fallback:live -- --settings <path> --go
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { parse as parseYaml } from "yaml";
import { createOntoReconstructCoreApi } from "../src/core-api/reconstruct-api.ts";
import {
  assertSettingsModelsSupported,
  completeDispatchBreakerSettings,
  resolveSettingsChain,
  type DispatchFallbackSettings,
} from "../src/core-runtime/discovery/settings-chain.ts";
import {
  buildColumnLeaves,
  reduceColumnLeavesWithTrace,
} from "../src/core-runtime/reconstruct/comprehension-reduce.ts";
import { classifyFrontier } from "../src/core-runtime/reconstruct/comprehension-semantic-map.ts";
import {
  createSealedDispatchCapability,
  type SemanticMapDispatchOperation,
} from "../src/core-runtime/llm/sealed-dispatch-capability.ts";
import { normalizeLlmModelSwitcher } from "../src/core-runtime/llm/model-switcher.ts";
import {
  DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
  SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT,
  SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
} from "../src/core-runtime/reconstruct/run.ts";
import { observeSpreadsheetSource } from "../src/core-runtime/spreadsheet-structure-observer.ts";
import {
  DispatchFallbackActivationSchema,
  DispatchFallbackOutcomeSchema,
  artifactIntegrity,
  assertDispatchFallbackTerminalArtifactContracts,
  projectDispatchFallbackRecordBlock,
} from "../src/core-runtime/reconstruct/dispatch-fallback-artifacts.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SETTINGS_PATH = path.join(
  REPO_ROOT,
  ".onto",
  "temp",
  "dispatch-fallback-live-settings.json",
);
const MAX_ALTERNATE_PROVIDER_REQUESTS = 12;
const MAX_DELEGATED_PRIMARY_REQUESTS = 40;
const PRIMARY_RATE_LIMIT_ATTEMPTS = 3;

interface LiveVerifyProbe {
  logical_dispatch_id: string;
  actual_adapter_request_count: number;
  output_sha256: string;
  verdict: "adversarial_confirmed" | "adversarial_refuted";
}

function log(message: string): void {
  process.stdout.write(`[dispatch-fallback-live] ${message}\n`);
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function sha256(bytes: Uint8Array | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function credentialFormatOk(provider: "openai" | "anthropic", value: string): boolean {
  const prefix = provider === "openai" ? "sk-" : "sk-ant-";
  return value.length >= 20 && value.trim() === value && value.startsWith(prefix);
}

function fetchUrl(input: string | URL | Request): URL {
  if (input instanceof Request) return new URL(input.url);
  return new URL(String(input));
}

function requestBodyText(init: RequestInit | undefined): string {
  return typeof init?.body === "string" ? init.body : "";
}

function syntheticWorkbook(): Uint8Array {
  const relationshipNamespace =
    "http://schemas.openxmlformats.org/package/2006/relationships";
  const officeRelationshipNamespace =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const spreadsheetNamespace =
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rows = Array.from({ length: 2048 }, (_, index) => {
    const row = index + 1;
    return row <= 1024
      ? `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>shape</t></is></c></row>`
      : `<row r="${row}"><c r="A${row}"><v>${row}</v></c></row>`;
  }).join("");
  return zipSync({
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook xmlns:r="${officeRelationshipNamespace}">` +
        `<sheets><sheet name="ShapeTransition" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${relationshipNamespace}">` +
        `<Relationship Id="rId1" Type="${officeRelationshipNamespace}/worksheet" ` +
        `Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0"?><worksheet xmlns="${spreadsheetNamespace}" ` +
        `xmlns:r="${officeRelationshipNamespace}"><dimension ref="A1:A2048"/>` +
        `<sheetData>${rows}</sheetData></worksheet>`,
    ),
  });
}

async function deterministicFixtureForecast(sourcePath: string): Promise<{
  synthesizeDispatches: number;
  valueShapeSeams: number;
}> {
  const inventory = await observeSpreadsheetSource(sourcePath) as {
    segmented_value_tiles?: Array<{
      sheet?: string;
      name?: string;
      columns?: Parameters<typeof buildColumnLeaves>[1][];
    }>;
  };
  let synthesizeDispatches = 0;
  let valueShapeSeams = 0;
  for (const sheet of inventory.segmented_value_tiles ?? []) {
    for (const column of sheet.columns ?? []) {
      valueShapeSeams += column.intra_tile_notes.filter(
        (note) => note.boundary_kind === "value_shape",
      ).length;
      const leaves = buildColumnLeaves(
        sheet.sheet ?? sheet.name ?? "(unknown)",
        column,
        { leafCount: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG.leaf_count },
      );
      if (leaves.length === 0) continue;
      const { trace } = reduceColumnLeavesWithTrace(
        leaves,
        DEFAULT_SEMANTIC_MAP_STAGE_CONFIG.fanin,
      );
      const modes = classifyFrontier(
        trace,
        DEFAULT_SEMANTIC_MAP_STAGE_CONFIG.over_context_budget,
      );
      synthesizeDispatches += [...modes.values()].filter(
        (mode) => mode !== "subsumed",
      ).length;
    }
  }
  return { synthesizeDispatches, valueShapeSeams };
}

function enabledFallbackSettings(
  value: DispatchFallbackSettings | undefined,
): Extract<DispatchFallbackSettings, { enabled: true }> {
  if (!value || value.enabled !== true) {
    throw new Error("live evidence settings require dispatch_fallback.enabled=true.");
  }
  return value;
}

function semanticMapActorLlm(settings: Awaited<ReturnType<typeof resolveSettingsChain>>) {
  const llm = settings.reconstruct?.execution?.actors?.semantic_map_synthesize?.llm;
  if (!llm) {
    throw new Error("live evidence settings require a semantic_map_synthesize actor.");
  }
  return llm;
}

async function invokeLiveVerifyProbe(
  fallback: Extract<DispatchFallbackSettings, { enabled: true }>,
): Promise<LiveVerifyProbe> {
  const verifyCapability = await createSealedDispatchCapability({
    llm: fallback.llm,
    operation: "semantic_map_verify" satisfies SemanticMapDispatchOperation,
  });
  const verifyResult = await verifyCapability.invokeOnce({
    system_prompt: SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT,
    user_prompt: JSON.stringify({
      node_ref: {
        sheet: "ShapeTransition",
        column_index: 0,
        row_start: 1,
        row_end: 2048,
      },
      boundary: {
        row: 800,
        character_before: "uniform TEXT shape",
        character_after: "uniform TEXT shape",
        anchor_status: "unanchored",
        verification: "unverified",
      },
      summary:
        "The proposed row has no co-located value-shape seam and the before/after character is redundant.",
    }),
    max_tokens: 300,
    logical_dispatch_id: crypto.randomUUID(),
  });
  const parsedVerify = JSON.parse(verifyResult.result.text) as Record<string, unknown>;
  if (
    Object.keys(parsedVerify).length !== 1 ||
    (parsedVerify.verdict !== "adversarial_confirmed" &&
      parsedVerify.verdict !== "adversarial_refuted")
  ) {
    throw new Error("live fallback verify probe returned a non-canonical verdict payload.");
  }
  return {
    logical_dispatch_id: verifyResult.logical_dispatch_id,
    actual_adapter_request_count: verifyResult.actual_adapter_request_count,
    output_sha256: sha256(verifyResult.result.text),
    verdict: parsedVerify.verdict,
  };
}

async function assessExistingSession(sessionRoot: string): Promise<void> {
  const projectRoot = path.resolve(sessionRoot, "../../..");
  const settingsPath = path.join(projectRoot, ".onto", "settings.json");
  const profileBytes = await fs.readFile(settingsPath);
  const settings = await resolveSettingsChain(REPO_ROOT, projectRoot);
  assertSettingsModelsSupported(settings);
  const fallback = enabledFallbackSettings(
    settings.reconstruct?.execution?.dispatch_fallback,
  );
  const fallbackSelection = normalizeLlmModelSwitcher(fallback.llm);
  if (
    !fallbackSelection ||
    (fallbackSelection.model_provider !== "openai" &&
      fallbackSelection.model_provider !== "anthropic")
  ) {
    throw new Error("assessment requires a sealed OpenAI or Anthropic fallback route.");
  }
  const credentialEnv = fallbackSelection.api_key_env;
  const credential = credentialEnv ? process.env[credentialEnv] : undefined;
  if (
    typeof credential !== "string" ||
    !credentialFormatOk(fallbackSelection.model_provider, credential)
  ) {
    throw new Error(`credential ${credentialEnv ?? "(missing env name)"} is absent or malformed.`);
  }

  const activationPath = path.join(sessionRoot, "dispatch-fallback-activation.yaml");
  const outcomePath = path.join(sessionRoot, "dispatch-fallback-outcome.yaml");
  const activation = DispatchFallbackActivationSchema.parse(
    parseYaml(await fs.readFile(activationPath, "utf8")),
  );
  const outcome = DispatchFallbackOutcomeSchema.parse(
    parseYaml(await fs.readFile(outcomePath, "utf8")),
  );
  if (outcome.status !== "completed") {
    throw new Error("assessment requires a completed fallback outcome.");
  }
  const activationIntegrity = await artifactIntegrity(activationPath);
  const outcomeIntegrity = await artifactIntegrity(outcomePath);
  if (
    path.resolve(outcome.activation.ref) !== path.resolve(activationIntegrity.ref) ||
    outcome.activation.sha256 !== activationIntegrity.sha256
  ) {
    throw new Error("assessment activation ref/hash does not match the completed outcome.");
  }
  for (const artifact of Object.values(outcome.final_artifacts)) {
    const integrity = await artifactIntegrity(artifact.ref);
    if (integrity.sha256 !== artifact.sha256) {
      throw new Error(`assessment artifact hash mismatch: ${artifact.ref}`);
    }
  }
  const terminal = assertDispatchFallbackTerminalArtifactContracts({
    partition: parseYaml(
      await fs.readFile(outcome.final_artifacts.dispatch_incomplete.ref, "utf8"),
    ),
    census: parseYaml(
      await fs.readFile(outcome.final_artifacts.semantic_map_census.ref, "utf8"),
    ),
    sidecar: parseYaml(
      await fs.readFile(outcome.final_artifacts.semantic_map.ref, "utf8"),
    ),
  });
  const recordProjection = projectDispatchFallbackRecordBlock({
    outcome,
    outcomeIntegrity: {
      path: outcomeIntegrity.ref,
      sha256: outcomeIntegrity.sha256,
    },
  });
  const primaryAdapterRequests = activation.trigger.contributors.reduce(
    (sum, contributor) => sum + contributor.actual_adapter_request_count,
    0,
  );

  const originalFetch = globalThis.fetch;
  let verifyProbeRequests = 0;
  const fallbackHost = fallbackSelection.model_provider === "openai"
    ? "api.openai.com"
    : "api.anthropic.com";
  globalThis.fetch = async (input, init) => {
    if (fetchUrl(input).hostname === fallbackHost) {
      verifyProbeRequests += 1;
      if (verifyProbeRequests > 1) {
        throw new Error("assessment verify probe exceeded its one-request cap.");
      }
    }
    return originalFetch(input, init);
  };
  let verifyProbe: LiveVerifyProbe;
  try {
    verifyProbe = await invokeLiveVerifyProbe(fallback);
  } finally {
    globalThis.fetch = originalFetch;
  }
  if (
    verifyProbeRequests !== 1 ||
    verifyProbe.actual_adapter_request_count !== 1
  ) {
    throw new Error("assessment verify probe did not make exactly one adapter request.");
  }

  const runControl = parseYaml(
    await fs.readFile(path.join(sessionRoot, "reconstruct-run-control.yaml"), "utf8"),
  ) as { attempt_rows?: Array<{ attempt_status?: string }> };
  const evidence = {
    schema_version: "dispatch-fallback-live-evidence/v1",
    evidence_class: {
      same_call_path: "injected_primary_typed_rate_limit_real_fallback",
      alternate_provider_synthesize: "live",
      alternate_provider_verify_probe: "live",
      natural_primary_rate_limit: "not_observed",
      semantic_quality_decision: "not_assessed",
    },
    assessed_at: new Date().toISOString(),
    session_root: sessionRoot,
    settings_sha256: sha256(profileBytes),
    run_attempt_status: runControl.attempt_rows?.at(-1)?.attempt_status ?? null,
    downstream_completion: "not_claimed",
    injected_primary_adapter_requests: primaryAdapterRequests,
    canonical_record_projection_if_assembled: recordProjection,
    semantic_map_census: {
      observations_map_present: terminal.census.observations_map_present,
      fallback_synthesize_logical_calls:
        terminal.census.fallback_synthesize_logical_calls ?? 0,
      fallback_verify_logical_calls:
        terminal.census.fallback_verify_logical_calls ?? 0,
      fallback_synthesize_adapter_requests:
        terminal.census.fallback_synthesize_adapter_requests ?? 0,
      fallback_verify_adapter_requests:
        terminal.census.fallback_verify_adapter_requests ?? 0,
    },
    verify_probe: verifyProbe,
    artifact_refs: {
      activation: activationIntegrity.ref,
      outcome: outcomeIntegrity.ref,
      dispatch_incomplete: outcome.final_artifacts.dispatch_incomplete.ref,
      semantic_map_census: outcome.final_artifacts.semantic_map_census.ref,
      semantic_map: outcome.final_artifacts.semantic_map.ref,
      reconstruct_run_control: path.join(sessionRoot, "reconstruct-run-control.yaml"),
    },
  };
  const evidencePath = path.join(projectRoot, "dispatch-fallback-live-evidence.json");
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  log(`PASS assessed_evidence=${evidencePath}`);
  log(
    `fallback_outcome=${outcome.status} primary_adapter_requests=${primaryAdapterRequests} ` +
      `fallback_synthesize=${terminal.census.fallback_synthesize_adapter_requests ?? 0} ` +
      `fallback_verify_stage=${terminal.census.fallback_verify_adapter_requests ?? 0} ` +
      `fallback_verify_probe=${verifyProbe.actual_adapter_request_count} ` +
      `downstream=${evidence.downstream_completion}`,
  );
}

async function run(): Promise<void> {
  const assessedSession = argumentValue("--assess-session");
  if (assessedSession) {
    await assessExistingSession(path.resolve(assessedSession));
    return;
  }
  const go = process.argv.includes("--go");
  const settingsPath = path.resolve(argumentValue("--settings") ?? DEFAULT_SETTINGS_PATH);
  const profileBytes = await fs.readFile(settingsPath);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const projectRoot = path.join(
    REPO_ROOT,
    ".onto",
    "temp",
    `dispatch-fallback-live-${runId}`,
  );
  const sourcePath = path.join(projectRoot, "shape-transition.xlsx");
  const projectSettingsPath = path.join(projectRoot, ".onto", "settings.json");
  const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "session");
  await fs.mkdir(path.dirname(projectSettingsPath), { recursive: true });
  await fs.writeFile(projectSettingsPath, profileBytes);
  const workbookBytes = syntheticWorkbook();
  await fs.writeFile(sourcePath, workbookBytes);

  const settings = await resolveSettingsChain(REPO_ROOT, projectRoot);
  assertSettingsModelsSupported(settings);
  if (settings.reconstruct?.execution?.semantic_map_authoring !== true) {
    throw new Error("live evidence settings require semantic_map_authoring=true.");
  }
  const breaker = completeDispatchBreakerSettings(
    settings.reconstruct?.execution?.dispatch_breaker,
  );
  if (
    !breaker.enabled ||
    breaker.systemic_threshold !== 1 ||
    breaker.per_call_max_attempts !== PRIMARY_RATE_LIMIT_ATTEMPTS ||
    breaker.backoff_initial_ms !== 0 ||
    breaker.backoff_cap_ms !== 0
  ) {
    throw new Error(
      "live evidence breaker must be enabled with threshold=1, attempts=3, and zero backoff.",
    );
  }
  const fallback = enabledFallbackSettings(
    settings.reconstruct?.execution?.dispatch_fallback,
  );
  const primarySelection = normalizeLlmModelSwitcher(semanticMapActorLlm(settings));
  const fallbackSelection = normalizeLlmModelSwitcher(fallback.llm);
  if (
    !primarySelection ||
    primarySelection.execution_route !== "direct_model_call" ||
    primarySelection.auth !== "api_key"
  ) {
    throw new Error("primary semantic-map synthesize route must be a direct api_key route.");
  }
  if (
    !fallbackSelection ||
    fallbackSelection.execution_route !== "direct_model_call" ||
    fallbackSelection.auth !== "api_key" ||
    (fallbackSelection.model_provider !== "openai" &&
      fallbackSelection.model_provider !== "anthropic")
  ) {
    throw new Error("fallback route must be a sealed OpenAI or Anthropic api_key route.");
  }
  if (primarySelection.model_provider === fallbackSelection.model_provider) {
    throw new Error("live evidence requires cross-provider primary and fallback routes.");
  }
  const credentialEnv = fallbackSelection.api_key_env;
  const credential = credentialEnv ? process.env[credentialEnv] : undefined;
  const credentialReady =
    typeof credential === "string" &&
    credentialFormatOk(fallbackSelection.model_provider, credential);
  const primaryCredentialEnv = primarySelection.api_key_env;
  const primaryCredential = primaryCredentialEnv
    ? process.env[primaryCredentialEnv]
    : undefined;
  const primaryCredentialReady =
    (primarySelection.model_provider === "openai" ||
      primarySelection.model_provider === "anthropic") &&
    typeof primaryCredential === "string" &&
    credentialFormatOk(primarySelection.model_provider, primaryCredential);
  const forecast = await deterministicFixtureForecast(sourcePath);
  if (forecast.synthesizeDispatches !== 1 || forecast.valueShapeSeams !== 1) {
    throw new Error(
      `fixture forecast drifted: ${JSON.stringify(forecast)} (expected one dispatch and one seam).`,
    );
  }
  if (process.env.ONTO_LLM_MOCK !== undefined) {
    throw new Error("live evidence refuses to run while ONTO_LLM_MOCK is present.");
  }

  const preflight = {
    schema_version: "dispatch-fallback-live-preflight/v1",
    created_at: new Date().toISOString(),
    go,
    settings_path: settingsPath,
    settings_sha256: sha256(profileBytes),
    project_root: projectRoot,
    session_root: sessionRoot,
    source_sha256: sha256(workbookBytes),
    primary: {
      provider: primarySelection.model_provider,
      model: primarySelection.model_id,
      operation: "semantic_map_synthesize",
      injected_failure: "sdk_http_429",
      expected_adapter_requests: PRIMARY_RATE_LIMIT_ATTEMPTS,
      credential_env: primaryCredentialEnv,
      credential_present_and_format_valid: primaryCredentialReady,
      delegated_request_cap: MAX_DELEGATED_PRIMARY_REQUESTS,
    },
    fallback: {
      provider: fallbackSelection.model_provider,
      model: fallbackSelection.model_id,
      credential_env: credentialEnv,
      credential_present_and_format_valid: credentialReady,
      request_cap: MAX_ALTERNATE_PROVIDER_REQUESTS,
    },
    forecast,
    product_claim_limit:
      "injected primary incident plus real alternate-provider semantic path; not natural-rate-limit evidence",
  };
  const preflightPath = path.join(projectRoot, "dispatch-fallback-live-preflight.json");
  await fs.writeFile(preflightPath, `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
  log(`preflight=${preflightPath}`);
  log(
    `routes=${primarySelection.model_provider}/${primarySelection.model_id} -> ` +
      `${fallbackSelection.model_provider}/${fallbackSelection.model_id}; ` +
    `credentials_ready=${primaryCredentialReady && credentialReady}; ` +
      `forecast=${JSON.stringify(forecast)}`,
  );
  if (!go) {
    log("provider_calls=0 (--go absent)");
    return;
  }
  if (!primaryCredentialReady || !credentialReady) {
    throw new Error(
      "primary or fallback credential is absent or malformed; refusing provider calls.",
    );
  }

  const originalFetch = globalThis.fetch;
  let injectedPrimary429 = 0;
  let delegatedPrimaryRequests = 0;
  let alternateProviderRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = fetchUrl(input);
    const body = requestBodyText(init);
    const primaryHost = primarySelection.model_provider === "openai"
      ? "api.openai.com"
      : "api.anthropic.com";
    const fallbackHost = fallbackSelection.model_provider === "openai"
      ? "api.openai.com"
      : "api.anthropic.com";
    if (
      url.hostname === primaryHost &&
      body.includes(SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT.slice(0, 180))
    ) {
      injectedPrimary429 += 1;
      return new Response(
        JSON.stringify({
          error: {
            type: "rate_limit_error",
            code: "rate_limit_exceeded",
            message: "bounded dispatch-fallback live-evidence injection",
          },
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "x-request-id": `onto-live-evidence-${injectedPrimary429}`,
          },
        },
      );
    }
    if (url.hostname === primaryHost) {
      delegatedPrimaryRequests += 1;
      if (delegatedPrimaryRequests > MAX_DELEGATED_PRIMARY_REQUESTS) {
        throw new Error(
          `delegated primary request cap ${MAX_DELEGATED_PRIMARY_REQUESTS} exceeded.`,
        );
      }
    }
    if (url.hostname === fallbackHost) {
      alternateProviderRequests += 1;
      if (alternateProviderRequests > MAX_ALTERNATE_PROVIDER_REQUESTS) {
        throw new Error(
          `alternate-provider request cap ${MAX_ALTERNATE_PROVIDER_REQUESTS} exceeded.`,
        );
      }
    }
    return originalFetch(input, init);
  };

  const api = createOntoReconstructCoreApi({ ontoHome: REPO_ROOT });
  let result: Awaited<ReturnType<typeof api.runReconstruct>> | undefined;
  let verifyProbe: LiveVerifyProbe | undefined;
  let downstreamError: unknown = null;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    result = await api.runReconstruct({
      projectRoot,
      targetRefs: [sourcePath],
      sessionRoot,
      intent:
        "Reconstruct a bounded operational seed for this synthetic workbook and preserve the " +
        "structural TEXT-to-INT transition as non-authoritative semantic-map evidence.",
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
    });
    verifyProbe = await invokeLiveVerifyProbe(fallback);
  } catch (error) {
    downstreamError = error;
  } finally {
    globalThis.fetch = originalFetch;
  }

  if (downstreamError !== null) {
    try {
      await fs.access(path.join(sessionRoot, "dispatch-fallback-outcome.yaml"));
      await assessExistingSession(sessionRoot);
      log("fallback evidence persisted despite a later downstream failure.");
    } catch (assessmentError) {
      log(
        `fallback assessment unavailable: ${
          assessmentError instanceof Error ? assessmentError.message : String(assessmentError)
        }`,
      );
    }
    throw downstreamError;
  }
  if (!result) {
    throw new Error("live reconstruct returned no result and no error.");
  }
  if (!verifyProbe) {
    throw new Error("live reconstruct completed without a verify probe result.");
  }

  const recordFallback = result.reconstructRecord.dispatch_fallback;
  if (!recordFallback || recordFallback.outcome !== "completed") {
    throw new Error("live run did not produce a completed canonical dispatch_fallback record block.");
  }
  if (injectedPrimary429 !== PRIMARY_RATE_LIMIT_ATTEMPTS) {
    throw new Error(
      `primary injection count=${injectedPrimary429}; expected ${PRIMARY_RATE_LIMIT_ATTEMPTS}.`,
    );
  }
  const census = parseYaml(
    await fs.readFile(
      path.join(sessionRoot, "comprehension", "semantic-map-census.yaml"),
      "utf8",
    ),
  ) as {
    observations_map_present?: number;
    fallback_synthesize_logical_calls?: number;
    fallback_verify_logical_calls?: number;
    fallback_synthesize_adapter_requests?: number;
    fallback_verify_adapter_requests?: number;
  };
  if (
    (census.observations_map_present ?? 0) < 1 ||
    (census.fallback_synthesize_logical_calls ?? 0) < 1 ||
    (census.fallback_synthesize_adapter_requests ?? 0) < 1
  ) {
    throw new Error("live fallback did not produce a non-empty semantic-map census.");
  }
  if (verifyProbe.actual_adapter_request_count !== 1) {
    throw new Error("live fallback verify probe must make exactly one adapter request.");
  }
  const evidence = {
    schema_version: "dispatch-fallback-live-evidence/v1",
    evidence_class: {
      same_call_path: "injected_primary_typed_rate_limit_real_fallback",
      alternate_provider_synthesize: "live",
      alternate_provider_verify_probe: "live",
      natural_primary_rate_limit: "not_observed",
      semantic_quality_decision: "not_assessed",
    },
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - startedMs,
    session_root: sessionRoot,
    reconstruct_status: result.status,
    source_sha256: sha256(workbookBytes),
    settings_sha256: sha256(profileBytes),
    injected_primary_429_requests: injectedPrimary429,
    delegated_primary_sdk_requests: delegatedPrimaryRequests,
    alternate_provider_requests: alternateProviderRequests,
    dispatch_fallback: recordFallback,
    semantic_map_census: {
      observations_map_present: census.observations_map_present ?? 0,
      fallback_synthesize_logical_calls:
        census.fallback_synthesize_logical_calls ?? 0,
      fallback_verify_logical_calls: census.fallback_verify_logical_calls ?? 0,
      fallback_synthesize_adapter_requests:
        census.fallback_synthesize_adapter_requests ?? 0,
      fallback_verify_adapter_requests:
        census.fallback_verify_adapter_requests ?? 0,
    },
    verify_probe: verifyProbe,
    artifact_refs: {
      reconstruct_record: result.reconstructRecordPath,
      reconstruct_run_manifest: result.reconstructRunManifestPath,
      fallback_outcome: recordFallback.outcome_ref,
      semantic_map_census: path.join(
        sessionRoot,
        "comprehension",
        "semantic-map-census.yaml",
      ),
    },
  };
  const evidencePath = path.join(projectRoot, "dispatch-fallback-live-evidence.json");
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  log(`PASS evidence=${evidencePath}`);
  log(
    `status=${result.status} primary_429=${injectedPrimary429} ` +
      `fallback_requests=${alternateProviderRequests} ` +
      `fallback_synthesize=${census.fallback_synthesize_adapter_requests ?? 0} ` +
      `fallback_verify_stage=${census.fallback_verify_adapter_requests ?? 0} ` +
      `fallback_verify_probe=${verifyProbe.actual_adapter_request_count}`,
  );
}

await run();
