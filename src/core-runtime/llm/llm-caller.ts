/**
 * Core LLM call wrapper.
 *
 * Canonical provider resolution:
 *   1. Caller-explicit: callLlm(..., { provider }) — one provider only.
 *   2. Actor/root `auth=oauth + provider=openai` — Codex worker.
 *   3. Actor/root `auth=api_key` — OpenAI / Anthropic / Grok API key from env.
 *   4. Reserved/future: actor/root `auth=local + provider=lmstudio` with an
 *      explicit local model id.
 *
 * Runtime config must reach this module through the canonical `llm` switcher
 * or an explicit call-site override. Missing provider/model/credentials fail
 * immediately.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DEFAULT_GROK_BASE_URL,
  DEFAULT_LMSTUDIO_BASE_URL,
  isExternalOauthWorkerSelection,
  normalizeLlmModelSwitcher,
  type LlmModelSwitcherConfig,
} from "./model-switcher.js";
import {
  appendRuntimeModelCallLogFromCurrentContext,
  appendRuntimeStreamChunkFromCurrentContextSync,
} from "../observability/runtime-stream-observation.js";
import {
  callReviewMockLlm,
  isReviewMockLlmRealizationEnabled,
} from "./mock-llm-realization.js";
import type { ReviewArtifactGenerationRealization } from "../review/artifact-types.js";

/**
 * Structural subset of ExecutionPlan that callLlm reads. Accepts either the
 * canonical `ExecutionPlan` from `review/execution-plan-resolver.ts` or a
 * hand-built shape for unit tests — the runtime only touches these fields.
 * Kept as an interface to avoid a cyclic import from llm-caller (background
 * task seat) → review (lens seat).
 */
export interface ResolvedPlanLike {
  provider_identity:
    | "anthropic"
    | "openai"
    | "grok"
    | "lmstudio"
    | "codex";
  model_id?: string;
  base_url?: string;
}

export interface LlmCallConfig {
  provider: "anthropic" | "openai" | "grok" | "lmstudio" | "codex";
  model_id: string;
  max_tokens: number;
  /** Optional base URL for OpenAI-style providers. Ignored by codex/anthropic. */
  base_url?: string;
  /** Optional environment variable name that contains the API key. */
  api_key_env?: string;
  /** Reasoning effort. Codex maps it to `model_reasoning_effort`; OpenAI API maps it to `reasoning_effort`. */
  reasoning_effort?: string;
  /** codex-only: service tier passed as `service_tier`. Ignored by other providers. */
  service_tier?: string;
  /**
   * Pre-resolved ExecutionPlan (Review Recovery PR-1, 2026-04-18).
   *
   * When set, callLlm dispatches directly using the plan's
   * `provider_identity` / `model_id` / `base_url`.
  */
  plan?: ResolvedPlanLike;
  artifact_generation_realization?: ReviewArtifactGenerationRealization;
  /**
   * Per-provider model overrides. Consumed by dispatch AFTER resolveProvider
   * determines the actual provider, so these apply to both explicit and
   * auto-resolved providers. Precedence in dispatch (higher first):
   *   model_id (explicit / bridge-resolved) > models_per_provider[resolved] > fail-fast(api-key paths)
   *
   * Populated by resolveLlmProviderConfig from OntoConfig.{provider}.model.
   */
  models_per_provider?: {
    anthropic?: string;
    openai?: string;
    grok?: string;
    lmstudio?: string;
    codex?: string;
  };
}

/**
 * Minimal subset of OntoConfig that resolveLlmProviderConfig reads.
 */
export interface LlmProviderConfigInputs {
  llm?: LlmModelSwitcherConfig;
}

/**
 * CLI flag overrides that win over OntoConfig values.
 * Maps to the CLI-flag > env > project-config > onto-home-config precedence (D3).
 */
export interface LlmProviderCliOverrides {
  provider?: "anthropic" | "openai" | "grok" | "lmstudio" | "codex";
  auth?: "api_key" | "oauth" | "local";
  base_url?: string;
  model?: string;
  reasoning_effort?: string;
  service_tier?: string;
  api_key_env?: string;
}

/**
 * Bridge: OntoConfig + CLI overrides → Partial<LlmCallConfig> that callLlm consumes.
 *
 * Review callers should:
 *
 *   const partial = resolveLlmProviderConfig({ config: ontoConfig, cliOverrides });
 *   const result = await callLlm(system, user, { ...partial, max_tokens: 2048 });
 *
 * This is the canonical seat where OntoConfig translates to provider resolution input.
 */
export function resolveLlmProviderConfig(args: {
  config?: LlmProviderConfigInputs;
  cliOverrides?: LlmProviderCliOverrides;
}): Partial<LlmCallConfig> {
  const config = args.config ?? {};
  const cli = args.cliOverrides ?? {};

  const selection = normalizeLlmModelSwitcher(config.llm);
  const provider = cli.provider ?? selection?.provider;

  const model_id = cli.model ?? selection?.model_id;

  const envBaseUrl =
    provider === "grok"
      ? process.env.GROK_BASE_URL ?? process.env.XAI_BASE_URL
      : provider === "lmstudio"
        ? process.env.LMSTUDIO_BASE_URL
        : undefined;
  const base_url =
    cli.base_url ?? envBaseUrl ?? selection?.base_url;

  const reasoning_effort = cli.reasoning_effort ?? selection?.reasoning_effort;
  const service_tier = isExternalOauthWorkerSelection(selection)
    ? selection.service_tier
    : undefined;
  const api_key_env = cli.api_key_env ?? selection?.api_key_env;
  const models_per_provider: NonNullable<LlmCallConfig["models_per_provider"]> = {};
  if (provider && model_id) models_per_provider[provider] = model_id;

  const out: Partial<LlmCallConfig> = {};
  if (provider) out.provider = provider;
  if (model_id) out.model_id = model_id;
  if (base_url) out.base_url = base_url;
  if (reasoning_effort) out.reasoning_effort = reasoning_effort;
  if (service_tier) out.service_tier = service_tier;
  if (api_key_env) out.api_key_env = api_key_env;
  if (Object.keys(models_per_provider).length > 0) {
    out.models_per_provider = models_per_provider;
  }
  return out;
}

export interface LlmCallResult {
  text: string;
  input_tokens: number;
  output_tokens: number;
  model_id: string;
  artifact_generation_realization?: ReviewArtifactGenerationRealization;
  /** Actual endpoint hit (audit trail). SDK and worker providers each fill their own sentinel. */
  effective_base_url?: string;
  /** Declarative billing classification for audit output. */
  declared_billing_mode?: "subscription" | "per_token" | "local";
}

// Phase 3 production found 30s too tight for large audit batches (37 items
// could time out then SDK-retry for 90s total). 120s is generous
// enough for ~50-item single-batch audits while still failing fast on real
// network problems.
const DEFAULT_TIMEOUT_MS = Number(process.env.ONTO_LLM_TIMEOUT_MS) || 120_000;
// SDK auto-retry hides failures behind a long stall. We surface failures
// faster (1 retry instead of the default 2) so operators see provider errors
// within ~2× timeout instead of ~3×.
const DEFAULT_MAX_RETRIES = 1;

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

interface ResolvedProvider {
  provider: "anthropic" | "openai" | "grok" | "lmstudio" | "codex";
  apiKey: string;           // For codex: unused; filled with sentinel.
  baseUrl?: string;         // For OpenAI-style providers.
}

interface CodexAuthState {
  chatgptOAuth: boolean;
  openaiApiKey: string | null;
}

/**
 * Model-call observability — emits STDERR logs for each LLM API call, covering
 * (a) pre-call model_id + provider + max_tokens, (b) post-call usage on success,
 * (c) full SDK error fields (status / error.type / error.message / request_id)
 * on failure. Silent "Connection error." wrapping by review runner no longer
 * hides model-not-found / auth / quota / network distinctions.
 */
function emitModelCallLog(line: string): void {
  process.stderr.write(`[model-call] ${line}\n`);
  appendRuntimeModelCallLogFromCurrentContext(line);
}

function readCodexAuthState(): CodexAuthState {
  const codexAuthPath = path.join(os.homedir(), ".codex", "auth.json");
  if (!fs.existsSync(codexAuthPath)) {
    return { chatgptOAuth: false, openaiApiKey: null };
  }
  try {
    const auth = JSON.parse(fs.readFileSync(codexAuthPath, "utf8"));
    const oauth =
      auth.auth_mode === "chatgpt" ||
      (auth.tokens && typeof auth.tokens.access_token === "string");
    const openaiKey =
      typeof auth.OPENAI_API_KEY === "string" &&
      auth.OPENAI_API_KEY.trim().length > 0
        ? auth.OPENAI_API_KEY.trim()
        : null;
    return { chatgptOAuth: Boolean(oauth), openaiApiKey: openaiKey };
  } catch {
    return { chatgptOAuth: false, openaiApiKey: null };
  }
}

function readEnvApiKey(envNames: string[]): string | null {
  for (const envName of envNames) {
    const value = process.env[envName];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readOpenAiApiKey(apiKeyEnv?: string): string | null {
  if (apiKeyEnv) return readEnvApiKey([apiKeyEnv]);
  return readEnvApiKey(["OPENAI_API_KEY"]) ?? readCodexAuthState().openaiApiKey;
}

function resolveProvider(
  preferred?: LlmCallConfig["provider"],
  configBaseUrl?: string,
  apiKeyEnv?: string,
): ResolvedProvider {
  if (preferred === undefined) {
    throw new Error(missingProviderSelectionError());
  }
  if (preferred === "anthropic") {
    const apiKey = readEnvApiKey(apiKeyEnv ? [apiKeyEnv] : ["ANTHROPIC_API_KEY"]);
    if (apiKey) {
      return { provider: "anthropic", apiKey };
    }
    throw new Error(explicitProviderMissingCredentialError("anthropic", apiKeyEnv));
  }
  if (preferred === "openai") {
    const apiKey = readOpenAiApiKey(apiKeyEnv);
    if (apiKey) {
      return { provider: "openai", apiKey };
    }
    throw new Error(explicitProviderMissingCredentialError("openai", apiKeyEnv));
  }
  if (preferred === "grok") {
    const apiKey = readEnvApiKey(
      apiKeyEnv ? [apiKeyEnv] : ["XAI_API_KEY", "GROK_API_KEY"],
    );
    if (apiKey) {
      return {
        provider: "grok",
        apiKey,
        baseUrl: configBaseUrl ?? DEFAULT_GROK_BASE_URL,
      };
    }
    throw new Error(explicitProviderMissingCredentialError("grok", apiKeyEnv));
  }
  if (preferred === "lmstudio") {
    return {
      provider: "lmstudio",
      apiKey: "lmstudio-local",
      baseUrl: configBaseUrl ?? process.env.LMSTUDIO_BASE_URL ?? DEFAULT_LMSTUDIO_BASE_URL,
    };
  }
  return {
    provider: "codex",
    apiKey: "codex-oauth",
  };
}

function explicitProviderMissingCredentialError(
  provider: "anthropic" | "openai" | "grok",
  configuredEnv?: string,
): string {
  const envVar =
    configuredEnv ??
    (provider === "anthropic"
      ? "ANTHROPIC_API_KEY"
      : provider === "openai"
        ? "OPENAI_API_KEY"
        : "XAI_API_KEY or GROK_API_KEY");
  return [
    `LLM provider=${provider} 명시적으로 선택되었으나 ${envVar}가 환경변수에 없습니다.`,
    ...(provider === "openai" && configuredEnv === undefined
      ? ["(~/.codex/auth.json의 OPENAI_API_KEY 필드도 비어 있거나 없음)"]
      : []),
    `명시적 provider override를 사용하려면 ${envVar}를 export하세요.`,
    "또는 .onto/settings.json 의 actor별 llm 설정을 현재 credential에 맞게 수정하세요.",
  ].join("\n");
}

function missingProviderSelectionError(): string {
  return [
    "LLM provider가 지정되지 않았습니다.",
    "`.onto/settings.json`에 `llm` 블록을 추가하거나 호출부에서 provider를 명시하세요:",
    "  llm:",
    "    auth: oauth | api_key | local",
    "    provider: openai | anthropic | grok | lmstudio",
    "    model: <model-id>",
  ].join("\n");
}

/**
 * Construct a fail-fast error for api-key providers when no model is specified.
 * Used by anthropic / openai / grok / reserved-future lmstudio dispatch
 * branches. codex is exempt because the codex CLI picks its own default when
 * `-m` is omitted.
 *
 * Hardcoded DEFAULT_ANTHROPIC_MODEL / DEFAULT_OPENAI_MODEL constants were removed
 * from this module (2026-04-15): model choice is a user decision (cost / quality /
 * account constraints) and should not be hardcoded in library code where it can
 * go stale or mismatch account permissions.
 */
function missingModelError(provider: "anthropic" | "openai" | "grok" | "lmstudio"): Error {
  const providerField = provider;
  return new Error(
    [
      `provider=${provider} 경로는 model 지정이 필요합니다. 하드코딩된 기본 모델은 제거되었습니다.`,
      "다음 중 한 가지로 설정하세요:",
      "  1. .onto/settings.json 의 actor별 `llm.model: <model-id>`",
      "  3. 호출부에서 LlmCallConfig.model_id 인자 전달 (런타임 override)",
      "(codex provider는 model 미지정 시 codex CLI가 자체 기본값을 사용하므로 이 메시지의 대상이 아닙니다.)",
    ].join("\n"),
  );
}

function unsupportedReasoningEffortError(provider: "anthropic" | "grok" | "lmstudio"): Error {
  return new Error(
    `provider=${provider} cannot honor reasoning_effort; remove effort from this actor or switch to provider=openai/codex.`,
  );
}

function assertNoUnsupportedReasoningEffort(
  provider: "anthropic" | "grok" | "lmstudio",
  reasoningEffort: string | undefined,
): void {
  if (reasoningEffort) {
    throw unsupportedReasoningEffortError(provider);
  }
}

// ---------------------------------------------------------------------------
// Anthropic call
// ---------------------------------------------------------------------------

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  modelId: string,
  maxTokens: number,
): Promise<LlmCallResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({
    apiKey,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
  });

  emitModelCallLog(`anthropic call: model="${modelId}" max_tokens=${maxTokens}`);

  let response;
  try {
    response = await client.messages.create({
      model: modelId,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    const e = err as {
      status?: number;
      name?: string;
      message?: string;
      error?: { type?: string; message?: string };
      request_id?: string;
    };
    emitModelCallLog(
      `anthropic call FAILED: model="${modelId}" status=${e.status ?? "?"} type=${e.error?.type ?? e.name ?? "?"} message="${e.error?.message ?? e.message ?? String(err)}" request_id=${e.request_id ?? "?"}`,
    );
    throw err;
  }

  emitModelCallLog(
    `anthropic success: model_id=${response.model ?? modelId} input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens}`,
  );

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => ("text" in block ? (block as { text: string }).text : ""))
    .join("\n");

  return {
    text,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    model_id: modelId,
    effective_base_url: "https://api.anthropic.com",
    declared_billing_mode: "per_token",
  };
}

// ---------------------------------------------------------------------------
// OpenAI call
// ---------------------------------------------------------------------------

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  modelId: string,
  maxTokens: number,
  baseUrl?: string,
  providerLabel: "openai" | "grok" | "lmstudio" = "openai",
  reasoningEffort?: string,
): Promise<LlmCallResult> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
  });

  emitModelCallLog(
    `${providerLabel} call: model="${modelId}" max_tokens=${maxTokens} effort=${reasoningEffort ?? "(unset)"}${baseUrl ? ` base_url=${baseUrl}` : ""}`,
  );

  let response;
  try {
    response = await client.chat.completions.create({
      model: modelId,
      max_tokens: maxTokens,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    } as never);
  } catch (err) {
    const e = err as {
      status?: number;
      name?: string;
      message?: string;
      error?: { type?: string; message?: string };
      request_id?: string;
    };
    emitModelCallLog(
      `${providerLabel} call FAILED: model="${modelId}" status=${e.status ?? "?"} type=${e.error?.type ?? e.name ?? "?"} message="${e.error?.message ?? e.message ?? String(err)}" request_id=${e.request_id ?? "?"}`,
    );
    throw err;
  }

  emitModelCallLog(
    `${providerLabel} success: model_id=${response.model ?? modelId} input_tokens=${response.usage?.prompt_tokens ?? 0} output_tokens=${response.usage?.completion_tokens ?? 0}`,
  );

  const text = response.choices[0]?.message?.content ?? "";

  const defaultBase =
    providerLabel === "grok"
      ? DEFAULT_GROK_BASE_URL
      : providerLabel === "lmstudio"
        ? DEFAULT_LMSTUDIO_BASE_URL
        : "https://api.openai.com/v1";
  return {
    text,
    input_tokens: response.usage?.prompt_tokens ?? 0,
    output_tokens: response.usage?.completion_tokens ?? 0,
    model_id: modelId,
    effective_base_url: baseUrl ?? defaultBase,
    declared_billing_mode: providerLabel === "lmstudio" ? "local" : "per_token",
  };
}

// ---------------------------------------------------------------------------
// codex CLI call (OAuth subscription path)
// ---------------------------------------------------------------------------

/**
 * Invoke `codex exec --ephemeral -` as a Codex worker for a single-turn
 * prompt → text response. Uses the host's codex CLI authentication
 * (chatgpt OAuth via ~/.codex/auth.json), which routes through chatgpt.com's
 * backend — cannot be reached via the OpenAI SDK.
 *
 * --ephemeral keeps this worker call from persisting an interactive session.
 *   --skip-git-repo-check lets the worker run from non-repo cwd. No -C/-s/-o:
 *   this is single-turn, no agentic scaffold.
 */
async function callCodexCli(
  systemPrompt: string,
  userPrompt: string,
  modelId?: string,
  reasoningEffort?: string,
  serviceTier?: string,
): Promise<LlmCallResult> {
  const { spawn } = await import("node:child_process");

  const args: string[] = ["exec", "--skip-git-repo-check", "--ephemeral"];
  if (modelId) args.push("-m", modelId);
  if (reasoningEffort) args.push("-c", `model_reasoning_effort="${reasoningEffort}"`);
  if (serviceTier) args.push("-c", `service_tier="${serviceTier}"`);
  args.push("-");

  const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  emitModelCallLog(
    `codex call: model="${modelId ?? "(codex default)"}" effort="${reasoningEffort ?? "(unset)"}" service_tier="${serviceTier ?? "(unset)"}" timeout_ms=${DEFAULT_TIMEOUT_MS}`,
  );

  const child = spawn("codex", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const codexStreamSourceBase = {
    kind: "process" as const,
    label: "codex-cli",
  };
  const codexStreamSource = child.pid !== undefined
    ? { ...codexStreamSourceBase, processId: child.pid }
    : codexStreamSourceBase;

  let stdout = "";
  let stderr = "";
  let timedOut = false;

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
    appendRuntimeStreamChunkFromCurrentContextSync(
      "stdout",
      chunk,
      codexStreamSource,
    );
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
    appendRuntimeStreamChunkFromCurrentContextSync(
      "stderr",
      chunk,
      codexStreamSource,
    );
  });

  child.stdin.write(combinedPrompt);
  child.stdin.end();

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, DEFAULT_TIMEOUT_MS);

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeoutHandle);
      if (err.code === "ENOENT") {
        reject(new Error(
          "codex CLI not found on PATH. Install codex to use the OAuth subscription path: https://github.com/openai/codex",
        ));
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      resolve(code ?? 1);
    });
  });

  if (timedOut) {
    emitModelCallLog(
      `codex call FAILED: model="${modelId ?? "(codex default)"}" reason=timeout timeout_ms=${DEFAULT_TIMEOUT_MS}`,
    );
    throw new Error(`codex CLI call timed out after ${DEFAULT_TIMEOUT_MS}ms`);
  }
  if (exitCode !== 0) {
    const combined = [stderr.trim(), stdout.trim()]
      .filter((m) => m.length > 0)
      .join("\n");
    emitModelCallLog(
      `codex call FAILED: model="${modelId ?? "(codex default)"}" exit_code=${exitCode} message="${combined.slice(0, 200).replace(/\n/g, " ")}"`,
    );
    // A1: chatgpt account model allowlist rejection — augment with actionable hint.
    // codex emits errors like:
    //   "The 'gpt-4o-mini' model is not supported when using Codex with a ChatGPT account."
    // Surface a fix path so users don't have to decode the upstream message.
    if (
      combined.includes("is not supported when using Codex with a ChatGPT account") ||
      combined.includes("not supported when using Codex")
    ) {
      const requested = modelId ?? "(codex default)";
      throw new Error(
        [
          combined,
          "",
          `지정된 모델 "${requested}"이 현재 ChatGPT 계정의 codex allowlist에 없습니다.`,
          "다음 중 한 가지로 해결하세요:",
          "  1. .onto/settings.json 의 actor별 llm.model 값을 현재 계정에서 허용되는 모델로 변경",
          "  2. 터미널에서 `codex` 를 직접 실행해 현재 계정에서 선택 가능한 모델 확인",
          "  3. `codex login` 으로 API-key 모드로 전환 (per-token 과금, 더 넓은 모델 범위)",
        ].join("\n"),
      );
    }
    throw new Error(
      combined.length > 0 ? combined : `codex CLI exited with code ${exitCode}`,
    );
  }

  const text = stdout.trim();
  // codex exec does not return usage metadata in stdout; estimate by char count.
  // LlmCallResult carries these as approximate; audit may flag via declared_billing_mode=subscription.
  const estimateTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));
  const in_tokens = estimateTokens(combinedPrompt);
  const out_tokens = estimateTokens(text);

  emitModelCallLog(
    `codex success: model_id=${modelId ?? "codex-default"} input_tokens~=${in_tokens} output_tokens~=${out_tokens}`,
  );

  return {
    text,
    input_tokens: in_tokens,
    output_tokens: out_tokens,
    model_id: modelId ?? "codex-default",
    effective_base_url: "codex-cli://oauth",
    declared_billing_mode: "subscription",
  };
}

// ---------------------------------------------------------------------------
// Plan-aware dispatch (Review Recovery PR-1)
// ---------------------------------------------------------------------------

/**
 * Dispatch an LLM call using a pre-resolved ExecutionPlan shape. The plan
 * carries `provider_identity`, `model_id`, and `base_url`; credentials are
 * still read from env (ANTHROPIC_API_KEY / OPENAI_API_KEY / XAI_API_KEY)
 * since secrets never enter the plan by design.
 *
 * Why credentials stay in env:
 *   The plan is written to session artifacts (`execution-plan.yaml`) for
 *   reproducibility and audit. Including API keys would leak them; env-sourced
 *   credentials keep the plan portable while the runtime still has enough to
 *   authenticate.
 */
async function dispatchByPlan(
  systemPrompt: string,
  userPrompt: string,
  config: Partial<LlmCallConfig> & { plan: ResolvedPlanLike },
): Promise<LlmCallResult> {
  const { plan } = config;
  const maxTokens = config.max_tokens ?? 1024;

  if (plan.provider_identity === "codex") {
    const modelId = config.model_id ?? plan.model_id ?? config.models_per_provider?.codex;
    return callCodexCli(
      systemPrompt,
      userPrompt,
      modelId,
      config.reasoning_effort,
      config.service_tier,
    );
  }
  if (plan.provider_identity === "anthropic") {
    assertNoUnsupportedReasoningEffort("anthropic", config.reasoning_effort);
    const apiKey = readEnvApiKey(
      config.api_key_env ? [config.api_key_env] : ["ANTHROPIC_API_KEY"],
    );
    if (!apiKey) {
      throw new Error(
        explicitProviderMissingCredentialError("anthropic", config.api_key_env),
      );
    }
    const modelId = config.model_id ?? plan.model_id ?? config.models_per_provider?.anthropic;
    if (!modelId) throw missingModelError("anthropic");
    return callAnthropic(systemPrompt, userPrompt, apiKey, modelId, maxTokens);
  }
  if (plan.provider_identity === "openai") {
    const apiKey = readOpenAiApiKey(config.api_key_env);
    if (!apiKey) {
      throw new Error(
        explicitProviderMissingCredentialError("openai", config.api_key_env),
      );
    }
    const modelId = config.model_id ?? plan.model_id ?? config.models_per_provider?.openai;
    if (!modelId) throw missingModelError("openai");
    return callOpenAI(
      systemPrompt,
      userPrompt,
      apiKey,
      modelId,
      maxTokens,
      undefined,
      "openai",
      config.reasoning_effort,
    );
  }
  if (plan.provider_identity === "grok") {
    assertNoUnsupportedReasoningEffort("grok", config.reasoning_effort);
    const apiKey = readEnvApiKey(
      config.api_key_env ? [config.api_key_env] : ["XAI_API_KEY", "GROK_API_KEY"],
    );
    if (!apiKey) {
      throw new Error(
        explicitProviderMissingCredentialError("grok", config.api_key_env),
      );
    }
    const modelId = config.model_id ?? plan.model_id ?? config.models_per_provider?.grok;
    if (!modelId) throw missingModelError("grok");
    return callOpenAI(
      systemPrompt,
      userPrompt,
      apiKey,
      modelId,
      maxTokens,
      plan.base_url ?? config.base_url ?? DEFAULT_GROK_BASE_URL,
      "grok",
    );
  }
  if (plan.provider_identity === "lmstudio") {
    assertNoUnsupportedReasoningEffort("lmstudio", config.reasoning_effort);
    const modelId = config.model_id ?? plan.model_id ?? config.models_per_provider?.lmstudio;
    if (!modelId) throw missingModelError("lmstudio");
    return callOpenAI(
      systemPrompt,
      userPrompt,
      "lmstudio-local",
      modelId,
      maxTokens,
      plan.base_url ?? config.base_url ?? process.env.LMSTUDIO_BASE_URL ?? DEFAULT_LMSTUDIO_BASE_URL,
      "lmstudio",
    );
  }
  throw new Error(
    `dispatchByPlan: unexpected provider_identity=${String((plan as { provider_identity: unknown }).provider_identity)}`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function isLegacyCodexCliProvider(
  config?: Partial<LlmCallConfig>,
): config is Partial<LlmCallConfig> & { provider: "codex" } {
  // Compatibility dispatch key for the Codex CLI adapter. Review route truth is
  // execution_route + execution_adapter + model_provider, not provider=codex.
  return config?.provider === "codex";
}

/** Call an LLM through the explicitly selected provider path. */
export async function callLlm(
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LlmCallConfig>,
): Promise<LlmCallResult> {
  if (
    isReviewMockLlmRealizationEnabled() &&
    config?.artifact_generation_realization !== "semantic_mock"
  ) {
    throw new Error(
      "ONTO_LLM_MOCK requires review.execution.artifact_generation_realization=semantic_mock.",
    );
  }
  if (
    isReviewMockLlmRealizationEnabled() ||
    config?.artifact_generation_realization === "semantic_mock"
  ) {
    return callReviewMockLlm(systemPrompt, userPrompt, config);
  }

  if (config?.plan) {
    return dispatchByPlan(
      systemPrompt,
      userPrompt,
      config as Partial<LlmCallConfig> & { plan: ResolvedPlanLike },
    );
  }

  if (isLegacyCodexCliProvider(config)) {
    return callCodexCli(
      systemPrompt,
      userPrompt,
      config.model_id ?? config.models_per_provider?.codex,
      config.reasoning_effort,
      config.service_tier,
    );
  }

  if (config?.provider === "anthropic") {
    assertNoUnsupportedReasoningEffort("anthropic", config.reasoning_effort);
  }

  if (config?.provider === "grok") {
    assertNoUnsupportedReasoningEffort("grok", config.reasoning_effort);
    const modelId = config.model_id ?? config.models_per_provider?.grok;
    if (!modelId) throw missingModelError("grok");
    const apiKey = readEnvApiKey(
      config.api_key_env ? [config.api_key_env] : ["XAI_API_KEY", "GROK_API_KEY"],
    );
    if (!apiKey) {
      throw new Error(
        explicitProviderMissingCredentialError("grok", config.api_key_env),
      );
    }
    const maxTokens = config.max_tokens ?? 1024;
    return callOpenAI(
      systemPrompt,
      userPrompt,
      apiKey,
      modelId,
      maxTokens,
      config.base_url ?? DEFAULT_GROK_BASE_URL,
      "grok",
    );
  }

  if (config?.provider === "lmstudio") {
    assertNoUnsupportedReasoningEffort("lmstudio", config.reasoning_effort);
    const modelId = config.model_id ?? config.models_per_provider?.lmstudio;
    if (!modelId) throw missingModelError("lmstudio");
    const maxTokens = config.max_tokens ?? 1024;
    return callOpenAI(
      systemPrompt,
      userPrompt,
      "lmstudio-local",
      modelId,
      maxTokens,
      config.base_url ?? process.env.LMSTUDIO_BASE_URL ?? DEFAULT_LMSTUDIO_BASE_URL,
      "lmstudio",
    );
  }

  const resolved = resolveProvider(
    config?.provider,
    config?.base_url,
    config?.api_key_env,
  );
  const maxTokens = config?.max_tokens ?? 1024;
  const perProviderModel = config?.models_per_provider?.[resolved.provider];

  switch (resolved.provider) {
    case "codex": {
      const modelId = config?.model_id ?? perProviderModel;
      return callCodexCli(
        systemPrompt,
        userPrompt,
        modelId,
        config?.reasoning_effort,
        config?.service_tier,
      );
    }
    case "anthropic": {
      assertNoUnsupportedReasoningEffort("anthropic", config?.reasoning_effort);
      const modelId = config?.model_id ?? perProviderModel;
      if (!modelId) throw missingModelError("anthropic");
      return callAnthropic(systemPrompt, userPrompt, resolved.apiKey, modelId, maxTokens);
    }
    case "openai": {
      const modelId = config?.model_id ?? perProviderModel;
      if (!modelId) throw missingModelError("openai");
      return callOpenAI(
        systemPrompt,
        userPrompt,
        resolved.apiKey,
        modelId,
        maxTokens,
        undefined,
        "openai",
        config?.reasoning_effort,
      );
    }
    case "grok": {
      assertNoUnsupportedReasoningEffort("grok", config?.reasoning_effort);
      const modelId = config?.model_id ?? perProviderModel;
      if (!modelId) throw missingModelError("grok");
      return callOpenAI(
        systemPrompt,
        userPrompt,
        resolved.apiKey,
        modelId,
        maxTokens,
        resolved.baseUrl ?? DEFAULT_GROK_BASE_URL,
        "grok",
      );
    }
    case "lmstudio": {
      assertNoUnsupportedReasoningEffort("lmstudio", config?.reasoning_effort);
      const modelId = config?.model_id ?? perProviderModel;
      if (!modelId) throw missingModelError("lmstudio");
      return callOpenAI(
        systemPrompt,
        userPrompt,
        resolved.apiKey,
        modelId,
        maxTokens,
        resolved.baseUrl ?? DEFAULT_LMSTUDIO_BASE_URL,
        "lmstudio",
      );
    }
  }
}

/**
 * Compute a stable hash of a prompt string for audit trail.
 */
export function hashPrompt(prompt: string): string {
  return crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 12);
}
