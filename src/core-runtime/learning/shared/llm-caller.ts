/**
 * Background task (learn/govern/promote) LLM call wrapper.
 *
 * Canonical provider resolution:
 *   1. Caller-explicit: callLlm(..., { provider }) — one provider only.
 *   2. `llm.auth=oauth + llm.provider=openai` — Codex worker.
 *   3. `llm.auth=api_key` — OpenAI / Anthropic / Grok API key from env.
 *   4. `llm.auth=local + llm.provider=lmstudio` — local OpenAI-style endpoint.
 *
 *   Priority 0 (special): ONTO_LLM_MOCK=1 → in-process mock (test only)
 *
 * Mock provider:
 *   When ONTO_LLM_MOCK=1 is set, callLlm() routes to an in-process mock that
 *   pattern-matches the system prompt against known Phase 3 prompts (panel
 *   review, judgment audit, insight reclassify, domain doc) and returns
 *   deterministic JSON. This unblocks E2E tests that need to exercise the
 *   full LLM call path without real API credentials. NEVER ship with this
 *   env var set in production — there's no real reasoning happening.
 *
 * Runtime config must reach this module through the canonical `llm` switcher
 * or an explicit call-site override. Missing provider/model/credentials fail
 * immediately.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadCoreLensRegistry } from "../../discovery/lens-registry.js";
import {
  DEFAULT_GROK_BASE_URL,
  DEFAULT_LMSTUDIO_BASE_URL,
  normalizeLlmModelSwitcher,
  type LlmModelSwitcherConfig,
} from "../../llm/model-switcher.js";

/**
 * Structural subset of ExecutionPlan that callLlm reads. Accepts either the
 * canonical `ExecutionPlan` from `review/execution-plan-resolver.ts` or a
 * hand-built shape for unit tests — the runtime only touches these fields.
 * Kept as an interface to avoid a cyclic import from llm-caller (background
 * task seat) → review (lens seat).
 */
export interface ResolvedPlanLike {
  provider_identity: "anthropic" | "openai" | "grok" | "lmstudio" | "codex" | "claude-code" | "mock";
  model_id?: string;
  base_url?: string;
}

export interface LlmCallConfig {
  provider: "anthropic" | "openai" | "grok" | "lmstudio" | "codex";
  model_id: string;
  max_tokens: number;
  /** Optional base URL for OpenAI-style providers. Ignored by codex/anthropic. */
  base_url?: string;
  /** codex-only: reasoning effort passed as `model_reasoning_effort`. Ignored by other providers. */
  reasoning_effort?: string;
  /**
   * Pre-resolved ExecutionPlan (Review Recovery PR-1, 2026-04-18).
   *
   * When set, callLlm dispatches directly using the plan's
   * `provider_identity` / `model_id` / `base_url`.
   */
  plan?: ResolvedPlanLike;
  /**
   * Per-provider model overrides. Consumed by dispatch AFTER resolveProvider
   * determines the actual provider, so these apply to both explicit and
   * auto-resolved providers. Precedence in dispatch (higher first):
   *   model_id (explicit / bridge-resolved) > models_per_provider[resolved] > fail-fast(api-key paths)
   *
   * Populated by resolveLearningProviderConfig from OntoConfig.{provider}.model.
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
 * Minimal subset of OntoConfig that resolveLearningProviderConfig reads.
 * Kept narrow to avoid learning→discovery coupling; callers pass the same field shape.
 */
export interface LearningProviderConfigInputs {
  llm?: LlmModelSwitcherConfig;
}

/**
 * CLI flag overrides that win over OntoConfig values.
 * Maps to the CLI-flag > env > project-config > onto-home-config precedence (D3).
 */
export interface LearningProviderCliOverrides {
  provider?: "anthropic" | "openai" | "grok" | "lmstudio" | "codex";
  auth?: "api_key" | "oauth" | "local";
  base_url?: string;
  model?: string;
  reasoning_effort?: string;
}

/**
 * Bridge: OntoConfig + CLI overrides → Partial<LlmCallConfig> that callLlm consumes.
 *
 * Callers (learning/promote panel-reviewer, promote-executor, judgment-auditor,
 * insight-reclassifier, extractor, semantic-classifier) should:
 *
 *   const partial = resolveLearningProviderConfig({ config: ontoConfig, cliOverrides });
 *   const result = await callLlm(system, user, { ...partial, max_tokens: 2048 });
 *
 * This replaces the pattern of callers building Partial<LlmCallConfig> ad-hoc, and is
 * the canonical seat where OntoConfig translates to provider resolution input.
 *
 */
export function resolveLearningProviderConfig(args: {
  config?: LearningProviderConfigInputs;
  cliOverrides?: LearningProviderCliOverrides;
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
  const models_per_provider: NonNullable<LlmCallConfig["models_per_provider"]> = {};
  if (provider && model_id) models_per_provider[provider] = model_id;

  const out: Partial<LlmCallConfig> = {};
  if (provider) out.provider = provider;
  if (model_id) out.model_id = model_id;
  if (base_url) out.base_url = base_url;
  if (reasoning_effort) out.reasoning_effort = reasoning_effort;
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
      typeof auth.OPENAI_API_KEY === "string" && auth.OPENAI_API_KEY.length > 0
        ? auth.OPENAI_API_KEY
        : null;
    return { chatgptOAuth: Boolean(oauth), openaiApiKey: openaiKey };
  } catch {
    return { chatgptOAuth: false, openaiApiKey: null };
  }
}

function resolveProvider(
  preferred?: LlmCallConfig["provider"],
  configBaseUrl?: string,
): ResolvedProvider {
  if (preferred === undefined) {
    throw new Error(missingProviderSelectionError());
  }
  if (preferred === "anthropic") {
    if (process.env.ANTHROPIC_API_KEY) {
      return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY };
    }
    throw new Error(explicitProviderMissingCredentialError("anthropic"));
  }
  if (preferred === "openai") {
    if (process.env.OPENAI_API_KEY) {
      return { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
    }
    const codexAuth = readCodexAuthState();
    if (codexAuth.openaiApiKey) {
      return { provider: "openai", apiKey: codexAuth.openaiApiKey };
    }
    throw new Error(explicitProviderMissingCredentialError("openai"));
  }
  if (preferred === "grok") {
    const apiKey = process.env.XAI_API_KEY ?? process.env.GROK_API_KEY;
    if (apiKey) {
      return {
        provider: "grok",
        apiKey,
        baseUrl: configBaseUrl ?? DEFAULT_GROK_BASE_URL,
      };
    }
    throw new Error(explicitProviderMissingCredentialError("grok"));
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
): string {
  const envVar =
    provider === "anthropic"
      ? "ANTHROPIC_API_KEY"
      : provider === "openai"
        ? "OPENAI_API_KEY"
        : "XAI_API_KEY or GROK_API_KEY";
  return [
    `llm.provider=${provider} 명시적으로 선택되었으나 ${envVar}가 환경변수에 없습니다.`,
    ...(provider === "openai"
      ? ["(~/.codex/auth.json의 OPENAI_API_KEY 필드도 비어 있거나 없음)"]
      : []),
    `명시적 provider override를 사용하려면 ${envVar}를 export하세요.`,
    "또는 .onto/settings.json 의 llm block 을 현재 credential에 맞게 수정하세요.",
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
 * Used by anthropic / openai / grok / lmstudio dispatch branches. codex is exempt because
 * the codex CLI picks its own default when `-m` is omitted.
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
      "  1. .onto/settings.json 의 `llm.model: <model-id>`",
      "  3. 호출부에서 LlmCallConfig.model_id 인자 전달 (런타임 override)",
      "(codex provider는 model 미지정 시 codex CLI가 자체 기본값을 사용하므로 이 메시지의 대상이 아닙니다.)",
    ].join("\n"),
  );
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
): Promise<LlmCallResult> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
  });

  emitModelCallLog(
    `${providerLabel} call: model="${modelId}" max_tokens=${maxTokens}${baseUrl ? ` base_url=${baseUrl}` : ""}`,
  );

  let response;
  try {
    response = await client.chat.completions.create({
      model: modelId,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
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
 * --ephemeral keeps this learning call from persisting a session file
 *   alongside review sessions. --skip-git-repo-check lets learning run
 *   from non-repo cwd. No -C/-s/-o: this is single-turn, no agentic scaffold.
 */
async function callCodexCli(
  systemPrompt: string,
  userPrompt: string,
  modelId?: string,
  reasoningEffort?: string,
): Promise<LlmCallResult> {
  const { spawn } = await import("node:child_process");

  const args: string[] = ["exec", "--skip-git-repo-check", "--ephemeral"];
  if (modelId) args.push("-m", modelId);
  if (reasoningEffort) args.push("-c", `model_reasoning_effort="${reasoningEffort}"`);
  args.push("-");

  const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  emitModelCallLog(
    `codex call: model="${modelId ?? "(codex default)"}" effort="${reasoningEffort ?? "(unset)"}" timeout_ms=${DEFAULT_TIMEOUT_MS}`,
  );

  const child = spawn("codex", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
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
          "  1. .onto/settings.json 의 llm.model 값을 현재 계정에서 허용되는 모델로 변경",
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

  if (plan.provider_identity === "mock") {
    return callMockProvider(systemPrompt, userPrompt);
  }
  if (plan.provider_identity === "claude-code") {
    throw new Error(
      "callLlm: ExecutionPlan.provider_identity=claude-code is orchestrator-only; background LLM calls cannot dispatch through the host nested spawn path.",
    );
  }
  if (plan.provider_identity === "codex") {
    const modelId = config.model_id ?? plan.model_id ?? config.models_per_provider?.codex;
    return callCodexCli(systemPrompt, userPrompt, modelId, config.reasoning_effort);
  }
  if (plan.provider_identity === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(explicitProviderMissingCredentialError("anthropic"));
    }
    const modelId = config.model_id ?? plan.model_id ?? config.models_per_provider?.anthropic;
    if (!modelId) throw missingModelError("anthropic");
    return callAnthropic(systemPrompt, userPrompt, apiKey, modelId, maxTokens);
  }
  if (plan.provider_identity === "openai") {
    const envKey = process.env.OPENAI_API_KEY;
    const codexAuth = readCodexAuthState();
    const apiKey = envKey ?? codexAuth.openaiApiKey ?? null;
    if (!apiKey) {
      throw new Error(explicitProviderMissingCredentialError("openai"));
    }
    const modelId = config.model_id ?? plan.model_id ?? config.models_per_provider?.openai;
    if (!modelId) throw missingModelError("openai");
    return callOpenAI(systemPrompt, userPrompt, apiKey, modelId, maxTokens);
  }
  if (plan.provider_identity === "grok") {
    const apiKey = process.env.XAI_API_KEY ?? process.env.GROK_API_KEY;
    if (!apiKey) {
      throw new Error(explicitProviderMissingCredentialError("grok"));
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

/** Call an LLM through the explicitly selected provider path. */
export async function callLlm(
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LlmCallConfig>,
): Promise<LlmCallResult> {
  // Test-only mock provider — gated by ONTO_LLM_MOCK=1.
  if (process.env.ONTO_LLM_MOCK === "1") {
    return callMockProvider(systemPrompt, userPrompt);
  }

  if (config?.plan) {
    return dispatchByPlan(
      systemPrompt,
      userPrompt,
      config as Partial<LlmCallConfig> & { plan: ResolvedPlanLike },
    );
  }

  if (config?.provider === "codex") {
    return callCodexCli(
      systemPrompt,
      userPrompt,
      config.model_id ?? config.models_per_provider?.codex,
      config.reasoning_effort,
    );
  }

  if (config?.provider === "grok") {
    const modelId = config.model_id ?? config.models_per_provider?.grok;
    if (!modelId) throw missingModelError("grok");
    const apiKey = process.env.XAI_API_KEY ?? process.env.GROK_API_KEY;
    if (!apiKey) throw new Error(explicitProviderMissingCredentialError("grok"));
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

  const resolved = resolveProvider(config?.provider, config?.base_url);
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
      );
    }
    case "anthropic": {
      const modelId = config?.model_id ?? perProviderModel;
      if (!modelId) throw missingModelError("anthropic");
      return callAnthropic(systemPrompt, userPrompt, resolved.apiKey, modelId, maxTokens);
    }
    case "openai": {
      const modelId = config?.model_id ?? perProviderModel;
      if (!modelId) throw missingModelError("openai");
      return callOpenAI(systemPrompt, userPrompt, resolved.apiKey, modelId, maxTokens);
    }
    case "grok": {
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

// ---------------------------------------------------------------------------
// Mock provider — test only, gated by ONTO_LLM_MOCK=1
// ---------------------------------------------------------------------------

const MOCK_MODEL_ID = "mock-llm-deterministic";

/**
 * Pattern-match the system prompt against known Phase 3 prompt headers and
 * return a deterministic JSON response shaped to satisfy each module's
 * validator. The matching is intentionally string-prefix based — fragile by
 * design so a prompt change forces a test update rather than silently
 * accepting drift.
 *
 * Coverage:
 *   - Panel reviewer (criteria 1~5)
 *   - Judgment auditor (audit outcomes)
 *   - Insight reclassifier (proposed_role)
 *   - Domain doc proposer Phase B (reflection_form + content)
 *   - Cross-agent dedup (criterion 6, same-principle test)
 *   - Phase 2 semantic classifier (decision)
 *
 * N-1 fix: previously, unknown prompts fell through to a generic "ok" string,
 * which made prompt drift a downstream parse failure instead of an immediate
 * mock-dispatch failure. Now unknown prompts raise an error so test breakage
 * surfaces at the mock layer with the actual prompt prefix in the message.
 */
function callMockProvider(
  systemPrompt: string,
  userPrompt: string,
): Promise<LlmCallResult> {
  let text: string;

  if (systemPrompt.startsWith("You are reviewing promotion candidates")) {
    // Panel reviewer — extract candidate_ids from the user prompt and return
    // one item per id with all-yes criteria + promote verdict.
    const candidateIds = extractCandidateIds(userPrompt);
    text = JSON.stringify({
      items: candidateIds.map((id) => ({
        candidate_id: id,
        verdict: "promote",
        criteria: [1, 2, 3, 4, 5].map((c) => ({
          criterion: c,
          judgment: "yes",
          reasoning: `mock reasoning for criterion ${c}`,
        })),
        axis_tag_recommendation: "retain",
        axis_tag_note: "mock — keep current tags",
        contradiction_resolution: "n/a",
        reason: "mock — all criteria passed deterministically",
      })),
    });
  } else if (
    systemPrompt.startsWith(
      "You are re-verifying previously promoted [judgment]-type learnings",
    )
  ) {
    // Judgment auditor — extract item count and return retain for each.
    const count = extractJudgmentItemCount(userPrompt);
    text = JSON.stringify({
      outcomes: Array.from({ length: count }, (_, i) => ({
        item_index: i,
        decision: "retain",
        reason: "mock — judgment still valid",
        modified_content: null,
      })),
    });
  } else if (
    systemPrompt.startsWith(
      "You are reclassifying [insight]-tagged learnings",
    )
  ) {
    // Insight reclassifier — return foundation as a safe default.
    text = JSON.stringify({
      proposed_role: "foundation",
      reason: "mock — defaulted to foundation",
    });
  } else if (
    systemPrompt.startsWith("You are updating a domain document")
  ) {
    // Domain doc proposer Phase B.
    text = JSON.stringify({
      reflection_form: "add_term",
      content:
        "**Mock Term** — A mock entry produced by the deterministic LLM provider.",
    });
  } else if (
    systemPrompt.startsWith(
      "You are detecting cross-agent principle duplication",
    )
  ) {
    // Cross-agent dedup (criterion 6) — extract the first agent from the
    // user prompt as primary owner and fabricate a consolidated line. The
    // mock happy path always confirms same_principle so tests can exercise
    // the structural path.
    //
    // Negative-path hooks (CG3 + UF3):
    //   ONTO_LLM_MOCK_DEDUP_BOGUS_OWNER=1
    //     → return a primary_owner_agent that is NOT in the shortlist so the
    //       C2 runtime guard in llmConfirmCluster rejects the cluster.
    //   ONTO_LLM_MOCK_DEDUP_SAME_PRINCIPLE_FALSE=1
    //     → return same_principle=false so the UF2 metric bucket bumps.
    //   ONTO_LLM_MOCK_DEDUP_MALFORMED=1
    //     → emit non-JSON so the malformed_json failure channel fires.
    //
    // These hooks are test-only and gated on the ONTO_LLM_MOCK=1 envelope
    // already checked above; production runs never see them.
    if (process.env.ONTO_LLM_MOCK_DEDUP_MALFORMED === "1") {
      text = "{this is not valid json at all";
    } else if (process.env.ONTO_LLM_MOCK_DEDUP_SAME_PRINCIPLE_FALSE === "1") {
      text = JSON.stringify({
        same_principle: false,
        primary_owner_agent: null,
        primary_owner_reason: "mock — disagreement",
        consolidated_principle: "",
        representative_cases: [],
        consolidated_line: "",
      });
    } else {
      const firstAgent = extractFirstDedupAgent(userPrompt);
      const agentCount = countDedupAgents(userPrompt);
      const bogusOwner =
        process.env.ONTO_LLM_MOCK_DEDUP_BOGUS_OWNER === "1"
          ? "offshortlist_ghost_agent"
          : firstAgent;
      text = JSON.stringify({
        same_principle: true,
        primary_owner_agent: bogusOwner,
        primary_owner_reason: "mock — first listed agent",
        consolidated_principle:
          "Mock consolidated principle produced by the deterministic LLM provider.",
        representative_cases: Array.from(
          { length: Math.min(agentCount, 3) },
          (_, i) => `mock case ${i + 1}`,
        ),
        consolidated_line:
          "- [fact] [methodology] [foundation] mock consolidated principle " +
          "(Representative cases: mock case 1; mock case 2) (source: consolidated from mock-mock-2026-04-09)",
      });
    }
  } else if (
    systemPrompt.startsWith("You are a semantic classifier")
  ) {
    text = JSON.stringify({
      decision: "save",
      conflict_kind: null,
      matched_existing_line: null,
      reason: "mock — no overlap detected",
    });
  } else if (
    systemPrompt.startsWith("You are a review complexity assessor")
  ) {
    // Phase 3: Step 1.5 complexity assessment mock — defaults to full review
    text = JSON.stringify({
      q2_cross_verification_secondary: false,
      q2_rationale: "mock — defaulting to full review (cross-verification critical)",
      q3_miss_risk_acceptable: false,
      q3_rationale: "mock — defaulting to full review (risk not acceptable)",
      suggest_core_axis: false,
    });
  } else if (
    systemPrompt.startsWith("You are a review lens selector")
  ) {
    // Phase 3: Step 1.5 lens selection mock — default core-axis set.
    // SSOT: .onto/authority/core-lens-registry.yaml (v0.2.1: cost-constrained
    // Pareto-optimal lenses). Imported at module init (see top of file).
    text = JSON.stringify({
      selected_lens_ids: loadCoreLensRegistry().core_axis_lens_ids,
      rationale: "mock — default core-axis review lens set",
    });
  } else if (
    systemPrompt.startsWith("You are executing a single bounded review unit")
  ) {
    // Phase 2 host-decoupling: ts_inline_http review unit executor (lens
    // variant). The mock returns a minimal lens-output-shaped markdown so
    // executor tests can verify the full call → write → JSON-print path
    // without needing a real LLM endpoint. Real lens output comes from a real
    // LLM; this mock only exercises the executor wiring.
    text = [
      "# Mock Lens Output (ts_inline_http executor mock)",
      "",
      "## Structural Inspection",
      "- Mock checklist item: PASS",
      "",
      "## Findings",
      "(none — mock executor)",
      "",
      "## Newly Learned",
      "(none — mock executor)",
      "",
      "## Applied Learnings",
      "(none — mock executor)",
      "",
      "## Domain Constraints Used",
      "[]",
      "",
      "## Domain Context Assumptions",
      '- "Mock executor returned this output for test purposes via ONTO_LLM_MOCK=1."',
      "",
    ].join("\n");
  } else if (
    systemPrompt.startsWith("You are the synthesize actor for a 9-lens review")
  ) {
    // Phase 3-3: synthesize-variant executor mock. Returns a minimal
    // synthesize-shaped markdown with the 8 required sections + YAML
    // frontmatter so downstream consumers can verify the structure.
    //
    // Phase 3-4 A2 negative-path hook: ONTO_LLM_MOCK_SYNTHESIZE_WRAP_FENCE=1
    // makes the mock wrap its entire response in a ```yaml fence, simulating
    // the 30B-A3B behavior that violates the "Do not wrap" prompt rule. This
    // exercises the executor's stripWrappingCodeFence post-processor without
    // needing a real LLM call.
    //
    // Phase 3-4 A5 negative-path hook: ONTO_LLM_MOCK_SYNTHESIZE_FABRICATE=1
    // injects a fabricated quote (a phrase that won't appear in any lens
    // pool content) into the Disagreement section, simulating the
    // hallucination observed in the A3 benchmark. This exercises the
    // citation audit layer. Both hooks are test-only and gated on the
    // ONTO_LLM_MOCK=1 envelope already checked above.
    const disagreementSection =
      process.env.ONTO_LLM_MOCK_SYNTHESIZE_FABRICATE === "1"
        ? 'Axiology said "A fabricated quote that is definitely nowhere in the lens pool for this mock test run".'
        : "(none — mock executor)";
    const synthesizeBody = [
      "---",
      "deliberation_status: performed",
      "---",
      "",
      "# Mock Synthesize Output (ts_inline_http executor mock, synthesize variant)",
      "",
      "## Consensus",
      "(none — mock executor)",
      "",
      "## Conditional Consensus",
      "(none — mock executor)",
      "",
      "## Disagreement",
      disagreementSection,
      "",
      "## Deliberation Decision",
      "Mock synthesize consumed the controlled deliberation artifact via ONTO_LLM_MOCK=1.",
      "",
      "## Unique Finding Tagging",
      "(none — mock executor)",
      "",
      "## Axiology Integration",
      "(none — mock executor)",
      "",
      "## Newly Learned",
      "(none — mock executor)",
      "",
      "## Degraded Lens Failures",
      "(none — mock executor)",
      "",
    ].join("\n");
    text =
      process.env.ONTO_LLM_MOCK_SYNTHESIZE_WRAP_FENCE === "1"
        ? "```yaml\n" + synthesizeBody + "```"
        : synthesizeBody;
  } else {
    // Unknown prompt → throw with the prefix so tests point at the drifted prompt.
    const prefix = systemPrompt.slice(0, 80).replace(/\n/g, " ");
    return Promise.reject(
      new Error(
        `mock LLM provider: no pattern matched system prompt prefix "${prefix}". ` +
          `If this is a new Phase 3 prompt, add a matching branch in callMockProvider. ` +
          `If this is an old prompt that changed, update the matching prefix.`,
      ),
    );
  }

  return Promise.resolve({
    text,
    input_tokens: estimateMockTokens(systemPrompt + userPrompt),
    output_tokens: estimateMockTokens(text),
    model_id: MOCK_MODEL_ID,
    effective_base_url: "mock://deterministic",
    declared_billing_mode: "per_token",
  });
}

function extractCandidateIds(userPrompt: string): string[] {
  // Panel prompt format: `1. candidate_id=abc123 type=...`
  const ids: string[] = [];
  const re = /candidate_id=([A-Za-z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(userPrompt)) !== null) {
    ids.push(m[1]!);
  }
  return ids;
}

function extractJudgmentItemCount(userPrompt: string): number {
  const m = userPrompt.match(/Judgment items to re-verify:\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Cross-agent dedup user prompt lists items as:
 *   1. agent_id=structure
 *      ...
 *   2. agent_id=coverage
 *      ...
 * Pick the first agent_id we see so the mock's primary_owner_agent matches
 * the first listed shortlist member. Falls back to "structure" when no
 * agent_id appears at all (shouldn't happen in practice).
 */
function extractFirstDedupAgent(userPrompt: string): string {
  const m = userPrompt.match(/agent_id=([A-Za-z0-9_-]+)/);
  return m ? m[1]! : "structure";
}

/**
 * Count the distinct agent_id references in the cross-agent dedup user prompt
 * so the mock can emit a plausible representative_cases list sized to the
 * shortlist.
 */
function countDedupAgents(userPrompt: string): number {
  const ids = new Set<string>();
  const re = /agent_id=([A-Za-z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(userPrompt)) !== null) {
    ids.add(m[1]!);
  }
  return ids.size;
}

function estimateMockTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Compute a stable hash of a prompt string for audit trail.
 */
export function hashPrompt(prompt: string): string {
  return crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 12);
}
