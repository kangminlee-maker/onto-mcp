/**
 * Live provider validation for `onto install`.
 *
 * Given a freshly resolved `{ decisions, secrets, detection }`, this
 * module sends a minimal reachability probe to each non-main-native
 * provider the user selected. A failed probe produces a clear
 * `ValidationCheck` result that the orchestrator surfaces alongside
 * instructions (re-run with `--skip-validation` or fix the credential).
 *
 * # What "ping" means per provider
 *
 *   - anthropic   GET https://api.anthropic.com/v1/models with the
 *                 key — models list is free and confirms the key.
 *   - openai      GET https://api.openai.com/v1/models with the key
 *                 — same rationale, zero token cost.
 *   - litellm     GET {base_url}/models (OpenAI-compatible). The
 *                 `/models` suffix is the OpenAI-compat standard;
 *                 LiteLLM proxy and every listed local runtime
 *                 (Ollama, LM Studio, vLLM, MLX) respond to it.
 *   - codex       Local check only — binary present + auth.json
 *                 present. No network call; the codex CLI handles
 *                 its own OAuth dance.
 *   - main-native Skipped — there's nothing to probe; the runtime
 *                 is the host session itself.
 *
 * # Why fetch directly instead of SDK
 *
 * The `@anthropic-ai/sdk` and `openai` SDKs carry non-trivial startup
 * cost and change their response shapes between majors. A raw HTTP
 * GET is dependency-free, gives a crisp HTTP status code (401 vs 200
 * vs 5xx), and doesn't couple install's validation surface to SDK
 * version drift. LiteLLM is already OpenAI-compatible HTTP, so the
 * same pattern works there.
 *
 * # Testability
 *
 * All network and filesystem access flows through a `PingDependencies`
 * struct. Tests inject a stub `fetch` that returns the desired
 * `Response` shape, and stub codex-presence booleans directly.
 */

import type {
  EnvSecrets,
  InstallDecisions,
  PreflightDetection,
  ReviewProvider,
} from "./types.js";

/** Single check outcome. `message` is populated only on failure. */
export interface ValidationCheck {
  name: string;
  passed: boolean;
  message?: string;
}

/** Aggregated result — `ok` is true iff every check passed. */
export interface ValidationResult {
  ok: boolean;
  checks: ValidationCheck[];
}

/** Injectable dependencies so tests can stub network + fs. */
export interface PingDependencies {
  /** Defaults to the global `fetch` (Node 18+). */
  fetch?: typeof fetch;
  /** Per-request timeout. Default 5s — pings are liveness, not load. */
  timeoutMs?: number;
  /** Stub for codex check; when unset, reads from the PreflightDetection. */
  codexBinaryPresent?: () => boolean;
  codexAuthPresent?: () => boolean;
}

// ---------------------------------------------------------------------------
// Shape guard
// ---------------------------------------------------------------------------

/**
 * Runtime sanity check on the `InstallDecisions` shape.
 *
 * TypeScript already enforces most of this at compile time. The one
 * thing that still benefits from a runtime check is the
 * learn-provider exclusion (it's excluded at the type level via the
 * `LearnProvider` union but a consumer could still construct
 * decisions outside the normal flow).
 */
export function checkDecisionShape(
  decisions: InstallDecisions,
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  if ((decisions.learnProvider as string) === "main-native") {
    checks.push({
      name: "decisions",
      passed: false,
      message:
        "learn provider는 main-native를 지원하지 않습니다. " +
        "background ladder(llm-caller.ts)에서 main-native는 ladder의 일부가 아닙니다.",
    });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function resolveFetch(deps: PingDependencies): typeof fetch {
  return deps.fetch ?? globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Per-provider pings
// ---------------------------------------------------------------------------

export async function pingAnthropic(
  apiKey: string,
  deps: PingDependencies = {},
): Promise<ValidationCheck> {
  const fetchFn = resolveFetch(deps);
  const timeoutMs = deps.timeoutMs ?? 5000;
  try {
    const res = await fetchWithTimeout(
      fetchFn,
      "https://api.anthropic.com/v1/models",
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      },
      timeoutMs,
    );
    if (res.status >= 200 && res.status < 300) {
      return { name: "anthropic", passed: true };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        name: "anthropic",
        passed: false,
        message: "인증 실패 (API key 거부). 키 값을 확인하세요.",
      };
    }
    return {
      name: "anthropic",
      passed: false,
      message: `api.anthropic.com 응답 HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      name: "anthropic",
      passed: false,
      message: `네트워크 오류: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function pingOpenai(
  apiKey: string,
  deps: PingDependencies = {},
): Promise<ValidationCheck> {
  const fetchFn = resolveFetch(deps);
  const timeoutMs = deps.timeoutMs ?? 5000;
  try {
    const res = await fetchWithTimeout(
      fetchFn,
      "https://api.openai.com/v1/models",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      timeoutMs,
    );
    if (res.status >= 200 && res.status < 300) {
      return { name: "openai", passed: true };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        name: "openai",
        passed: false,
        message: "인증 실패 (API key 거부). 키 값을 확인하세요.",
      };
    }
    return {
      name: "openai",
      passed: false,
      message: `api.openai.com 응답 HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      name: "openai",
      passed: false,
      message: `네트워크 오류: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function pingLitellm(
  baseUrl: string,
  apiKey: string | undefined,
  deps: PingDependencies = {},
): Promise<ValidationCheck> {
  const fetchFn = resolveFetch(deps);
  const timeoutMs = deps.timeoutMs ?? 5000;
  const url = baseUrl.replace(/\/+$/, "") + "/models";
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetchWithTimeout(
      fetchFn,
      url,
      { method: "GET", headers },
      timeoutMs,
    );
    if (res.status >= 200 && res.status < 300) {
      return { name: "litellm", passed: true };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        name: "litellm",
        passed: false,
        message:
          "인증 실패. 엔드포인트가 key를 요구합니다 — LITELLM_API_KEY를 설정하세요.",
      };
    }
    return {
      name: "litellm",
      passed: false,
      message: `${url} 응답 HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      name: "litellm",
      passed: false,
      message: `연결 실패 (${url}): ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function verifyCodex(
  detection: PreflightDetection,
  deps: PingDependencies = {},
): ValidationCheck {
  const binaryPresent = deps.codexBinaryPresent
    ? deps.codexBinaryPresent()
    : detection.hasCodexBinary;
  const authPresent = deps.codexAuthPresent
    ? deps.codexAuthPresent()
    : detection.hasCodexAuth;

  if (!binaryPresent) {
    return {
      name: "codex",
      passed: false,
      message: "codex binary가 PATH에 없습니다.",
    };
  }
  if (!authPresent) {
    return {
      name: "codex",
      passed: false,
      message: "~/.codex/auth.json 없음. `codex login` 실행 필요.",
    };
  }
  return { name: "codex", passed: true };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface ValidateInstallArgs {
  decisions: InstallDecisions;
  secrets: EnvSecrets;
  detection: PreflightDetection;
  deps?: PingDependencies;
}

/**
 * Validate the full install outcome.
 *
 * Dedupes the review + learn providers (when same, only pings once),
 * reads credentials from `secrets` with `process.env` as the fallback
 * (so a user who set ANTHROPIC_API_KEY in the shell gets validated
 * without install having to re-capture the key).
 *
 * Never throws — all errors surface as failed `ValidationCheck`
 * entries so the orchestrator can render a complete summary.
 */
export async function validateInstall(
  args: ValidateInstallArgs,
): Promise<ValidationResult> {
  const { decisions, secrets, detection, deps = {} } = args;
  const checks: ValidationCheck[] = [];

  checks.push(...checkDecisionShape(decisions));

  const providers = new Set<ReviewProvider>();
  providers.add(decisions.reviewProvider);
  providers.add(decisions.learnProvider as ReviewProvider);

  for (const provider of providers) {
    switch (provider) {
      case "main-native":
        // Nothing to probe — host session is the runtime.
        break;

      case "anthropic": {
        const apiKey = secrets.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          checks.push({
            name: "anthropic",
            passed: false,
            message: "ANTHROPIC_API_KEY를 찾을 수 없습니다.",
          });
        } else {
          checks.push(await pingAnthropic(apiKey, deps));
        }
        break;
      }

      case "openai": {
        const apiKey = secrets.openaiApiKey ?? process.env.OPENAI_API_KEY;
        if (!apiKey) {
          checks.push({
            name: "openai",
            passed: false,
            message: "OPENAI_API_KEY를 찾을 수 없습니다.",
          });
        } else {
          checks.push(await pingOpenai(apiKey, deps));
        }
        break;
      }

      case "litellm": {
        const baseUrl =
          secrets.litellmBaseUrl ?? process.env.LITELLM_BASE_URL;
        const apiKey = secrets.litellmApiKey ?? process.env.LITELLM_API_KEY;
        if (!baseUrl) {
          checks.push({
            name: "litellm",
            passed: false,
            message: "LITELLM_BASE_URL을 찾을 수 없습니다.",
          });
        } else {
          checks.push(await pingLitellm(baseUrl, apiKey, deps));
        }
        break;
      }

      case "codex":
        checks.push(verifyCodex(detection, deps));
        break;
    }
  }

  return {
    ok: checks.every((c) => c.passed),
    checks,
  };
}

/**
 * Pretty-print a validation result as text. One line per check,
 * `✓` / `✗` prefix, and indented error message on the same line.
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];
  for (const check of result.checks) {
    const mark = check.passed ? "✓" : "✗";
    const suffix = check.message ? ` — ${check.message}` : "";
    lines.push(`  ${mark} ${check.name}${suffix}`);
  }
  return lines.join("\n");
}
