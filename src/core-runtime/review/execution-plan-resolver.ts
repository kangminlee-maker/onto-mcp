/** Resolves the concrete review execution plan from host signals and llm config. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { OntoConfig } from "../discovery/config-chain.js";
import { detectCodexBinaryAvailable } from "../discovery/host-detection.js";
import {
  normalizeLlmModelSwitcher,
} from "../llm/model-switcher.js";
import type { TopologyId } from "./execution-topology-resolver.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Context-separation rank (see sketch §1.2). Higher rank = stronger main-context
 * isolation. The ladder prefers higher rank when multiple paths are viable.
 *
 * S0 Subprocess (codex CLI)           — full isolation
 * S1 External HTTP API (inline-http)  — process shared, API context independent
 * S2 Host nested spawn                — main-context shared (claude TeamCreate)
 * S3 In-process mock                  — test only
 */
export type SeparationRank = "S0" | "S1" | "S2" | "S3";

export type ExecutionRealization =
  | "subagent"
  | "agent-teams"
  | "ts_inline_http"
  | "mock";

export type HostRuntime =
  | "codex"
  | "claude"
  | "standalone"
  | "anthropic"
  | "openai"
  | "grok"
  | "lmstudio"
  | "mock";

export type ProviderIdentity =
  | "codex"
  | "anthropic"
  | "openai"
  | "grok"
  | "lmstudio"
  | "claude-code"
  | "mock";

export interface ExecutionPlan {
  separation_rank: SeparationRank;
  execution_realization: ExecutionRealization;
  host_runtime: HostRuntime;
  provider_identity: ProviderIdentity;
  /** Chosen per-request model id; undefined when the executor picks its own (codex). */
  model_id?: string;
  /** Base URL for OpenAI-style providers. */
  base_url?: string;
  retry_policy: RetryPolicy;
  /** Ordered list of decision points; emitted to STDERR and available for session artifacts. */
  plan_trace: string[];
  /** Canonical topology id when the plan maps to a registered topology. */
  topology_id?: TopologyId;
}

export interface RetryPolicy {
  timeout_ms: number;
  max_attempts: number;
  backoff: "exponential" | "linear" | "none";
}

export type ExecutionPlanResolution =
  | { type: "resolved"; plan: ExecutionPlan }
  | { type: "no_host"; plan_trace: string[]; reason: string };

export interface ResolveExecutionPlanArgs {
  /** --codex CLI flag explicitly requested. */
  explicitCodex: boolean;
  ontoConfig: OntoConfig;
  /**
   * Environment variable snapshot. Defaults to process.env. Tests inject a
   * controlled map so ladder decisions are reproducible without mutating
   * the global env.
   */
  env?: NodeJS.ProcessEnv;
  /**
   * Whether a Claude Code session is currently hosting this invocation.
   * Defaults to `process.env.CLAUDECODE === "1"`. Injected for test isolation.
   */
  claudeHost?: boolean;
  /**
   * Whether the codex binary + auth.json pair is reachable. Defaults to
   * `detectCodexBinaryAvailable()`. Injected for test isolation.
   */
  codexAvailable?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS =
  Number(process.env.ONTO_LLM_TIMEOUT_MS) || 120_000;
const DEFAULT_MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

/**
 * Plan-level STDERR log. Mirrors `[provider-ladder]` and `[model-call]`
 * patterns (PR #91 / PR #93) so operators can reconstruct the full decision
 * sequence from a single STDERR capture.
 *
 * No suppressor env var: decision rationale is load-bearing for review
 * reproducibility. Tests capture via vi.spyOn(process.stderr, "write").
 */
function emitPlanLog(line: string): void {
  process.stderr.write(`[plan] ${line}\n`);
}

// ---------------------------------------------------------------------------
// Codex auth introspection (shared with llm-caller.ts; duplicated for
// resolver independence — both seats converge on detectCodexBinaryAvailable
// but this resolver needs the chatgpt-OAuth distinction separately).
// ---------------------------------------------------------------------------

interface CodexAuthState {
  chatgptOAuth: boolean;
  openaiApiKey: string | null;
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

// ---------------------------------------------------------------------------
// Ladder resolution
// ---------------------------------------------------------------------------

/**
 * Compute the ExecutionPlan by walking the context-separation ladder.
 *
 * Priority (higher rank = preferred, matches sketch §3.2):
 *   P0  Mock (ONTO_LLM_MOCK=1)                        — test only
 *   P1a Explicit --codex CLI flag                      — subprocess (S0)
 *   P1f env ONTO_HOST_RUNTIME override                 — any rank
 *   P2  Auto-detected Claude Code host (CLAUDECODE=1)  — host nested spawn (S2)
 *   P3  Auto-detected codex binary + auth.json         — subprocess (S0)
 *   P4  llm auth/provider switcher                     — external HTTP (S1) or codex OAuth
 *   Fail-fast when nothing is viable.
 *
 * The `review:` axis block owns topology. The `llm` switcher owns provider
 * and auth selection. Missing viable execution input returns `no_host`.
 */
export function resolveExecutionPlan(
  args: ResolveExecutionPlanArgs,
): ExecutionPlanResolution {
  const env = args.env ?? process.env;
  const claudeHost = args.claudeHost ?? env.CLAUDECODE === "1";
  const codexAvailable =
    args.codexAvailable ?? detectCodexBinaryAvailable();
  const trace: string[] = [];

  const log = (line: string): void => {
    emitPlanLog(line);
    trace.push(line);
  };

  const retry_policy: RetryPolicy = {
    timeout_ms: DEFAULT_TIMEOUT_MS,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    backoff: "exponential",
  };

  // P0: Mock — test envelope.
  if (env.ONTO_LLM_MOCK === "1") {
    log("P0 mock: matched (ONTO_LLM_MOCK=1)");
    return {
      type: "resolved",
      plan: {
        separation_rank: "S3",
        execution_realization: "mock",
        host_runtime: "mock",
        provider_identity: "mock",
        retry_policy,
        plan_trace: trace,
      },
    };
  }

  // P1a: Explicit --codex flag. Overrides all other inputs.
  if (args.explicitCodex) {
    log("P1 explicit-codex: matched (--codex flag)");
    return resolveCodexPlan(log, trace, retry_policy, args.ontoConfig);
  }

  // P1f: env ONTO_HOST_RUNTIME override.
  const envHost = env.ONTO_HOST_RUNTIME?.trim().toLowerCase();
  if (envHost === "codex") {
    log("P1 env-override: ONTO_HOST_RUNTIME=codex");
    return resolveCodexPlan(log, trace, retry_policy, args.ontoConfig);
  }
  if (envHost === "claude") {
    log("P1 env-override: ONTO_HOST_RUNTIME=claude → agent-teams");
    return {
      type: "resolved",
      plan: {
        separation_rank: "S2",
        execution_realization: "agent-teams",
        host_runtime: "claude",
        provider_identity: "claude-code",
        retry_policy,
        plan_trace: trace,
      },
    };
  }
  if (envHost === "anthropic" || envHost === "openai" || envHost === "grok" || envHost === "lmstudio") {
    log(`P1 env-override: ONTO_HOST_RUNTIME=${envHost} → ts_inline_http`);
    return resolveExternalHttpPlan(
      log,
      trace,
      retry_policy,
      args.ontoConfig,
      { forcedProvider: envHost as "anthropic" | "openai" | "grok" | "lmstudio" },
    );
  }
  if (envHost === "standalone") {
    log("P1 env-override: ONTO_HOST_RUNTIME=standalone → ts_inline_http");
    return resolveExternalHttpPlan(log, trace, retry_policy, args.ontoConfig);
  }

  // P2: Auto-detected Claude Code host (stay-in-host).
  if (claudeHost) {
    log("P2 auto: claudeHost=true → agent-teams / host-nested-spawn");
    return {
      type: "resolved",
      plan: {
        separation_rank: "S2",
        execution_realization: "agent-teams",
        host_runtime: "claude",
        provider_identity: "claude-code",
        retry_policy,
        plan_trace: trace,
      },
    };
  }

  // P3: Auto-detected codex. Auth content is validated at invocation time.
  if (codexAvailable) {
    log("P3 auto: codex binary + auth.json present → subprocess");
    return resolveCodexPlan(log, trace, retry_policy, args.ontoConfig);
  }
  log("P3 auto: codex binary unavailable → skip");

  // P4: canonical llm switcher.
  const llmSelection = normalizeLlmModelSwitcher(args.ontoConfig.llm);
  if (llmSelection) {
    if (llmSelection.provider === "codex") {
      log("P4 llm switcher: auth=oauth provider=openai → codex subprocess");
      return resolveCodexPlan(log, trace, retry_policy, args.ontoConfig);
    }
    log(
      `P4 llm switcher: auth=${llmSelection.auth} provider=${llmSelection.provider} → ts_inline_http`,
    );
    return resolveExternalHttpPlan(log, trace, retry_policy, args.ontoConfig);
  }

  log("final: no viable path → no_host");
  return {
    type: "no_host",
    plan_trace: trace,
    reason: buildNoHostReason(),
  };
}

// ---------------------------------------------------------------------------
// Sub-resolvers
// ---------------------------------------------------------------------------

function resolveCodexPlan(
  log: (line: string) => void,
  trace: string[],
  retry_policy: RetryPolicy,
  config: OntoConfig,
): ExecutionPlanResolution {
  const selection = normalizeLlmModelSwitcher(config.llm);
  const modelId =
    selection?.provider === "codex" ? selection.model_id : undefined;
  log(
    `codex plan: separation_rank=S0 executor=subprocess model_id=${modelId ?? "(codex default)"}`,
  );
  return {
    type: "resolved",
    plan: {
      separation_rank: "S0",
      execution_realization: "subagent",
      host_runtime: "codex",
      provider_identity: "codex",
      ...(modelId ? { model_id: modelId } : {}),
      retry_policy,
      plan_trace: trace,
    },
  };
}

function resolveExternalHttpPlan(
  log: (line: string) => void,
  trace: string[],
  retry_policy: RetryPolicy,
  config: OntoConfig,
  opts?: { forcedProvider?: "anthropic" | "openai" | "grok" | "lmstudio" },
): ExecutionPlanResolution {
  const providerField = pickExternalProviderField(config, opts);
  if (!providerField.provider) {
    log("external-http: no provider identified (llm.provider unset)");
    return {
      type: "no_host",
      plan_trace: trace,
      reason: buildMissingExternalProviderReason(),
    };
  }

  const provider = providerField.provider;
  const selection = normalizeLlmModelSwitcher(config.llm);
  const modelId = selection?.model_id;
  const base_url = selection?.base_url;

  log(
    `external-http plan: provider=${provider} source=${providerField.source} model_id=${modelId ?? "(unresolved)"} base_url=${base_url ?? "(default)"}`,
  );

  return {
    type: "resolved",
    plan: {
      separation_rank: "S1",
      execution_realization: "ts_inline_http",
      host_runtime: provider,
      provider_identity: provider,
      ...(modelId ? { model_id: modelId } : {}),
      ...(base_url ? { base_url } : {}),
      retry_policy,
      plan_trace: trace,
    },
  };
}

// ---------------------------------------------------------------------------
// Provider field lookup
// ---------------------------------------------------------------------------

interface ProviderFieldResult {
  provider: "anthropic" | "openai" | "grok" | "lmstudio" | null;
  source: string;
}

function pickExternalProviderField(
  config: OntoConfig,
  opts?: { forcedProvider?: "anthropic" | "openai" | "grok" | "lmstudio" },
): ProviderFieldResult {
  if (opts?.forcedProvider) {
    return { provider: opts.forcedProvider, source: "forced (env ONTO_HOST_RUNTIME)" };
  }
  const selection = normalizeLlmModelSwitcher(config.llm);
  if (selection && selection.provider !== "codex") {
    return { provider: selection.provider, source: "llm" };
  }
  return { provider: null, source: "(none)" };
}

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

function buildNoHostReason(): string {
  return [
    "Review execution plan을 해소할 수 없습니다.",
    "현재 감지 결과: Claude Code 세션 아님(CLAUDECODE unset), codex 바이너리 또는 ~/.codex/auth.json 부재, llm switcher 미설정.",
    "",
    "다음 중 한 가지로 해결하세요:",
    "  1. Claude Code 세션에서 `onto review` 재실행",
    "  2. codex CLI 설치 + `codex login` 후 재실행",
    "  3. `--codex` 플래그로 codex subprocess 강제",
    "  4. `.onto/config.yml` 에 `review:` axis block 추가 (docs/topology-migration-guide.md §7 참고)",
    "  5. `.onto/config.yml` 에 llm: { auth, provider, model } 설정",
    "  6. local 실행은 llm.auth=local + llm.provider=lmstudio 로 설정",
  ].join("\n");
}

function buildMissingExternalProviderReason(): string {
  return [
    "LLM switcher 미지정.",
    "`.onto/config.yml` 에 llm block 을 추가하세요:",
    "  llm:",
    "    auth: api_key",
    "    provider: anthropic    # 또는 openai | grok | lmstudio",
    "    model: <model-id>",
  ].join("\n");
}
