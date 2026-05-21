import { describe, it, expect } from "vitest";
import {
  formatValidationResult,
  pingAnthropic,
  pingLitellm,
  pingOpenai,
  validateInstall,
  verifyCodex,
} from "./validation.js";
import type { EnvSecrets, InstallDecisions, PreflightDetection } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BLANK_DETECTION: PreflightDetection = {
  existingGlobalConfig: false,
  existingProjectConfig: false,
  hasAnthropicKey: false,
  hasOpenAiKey: false,
  hasLitellmBaseUrl: false,
  hasCodexBinary: false,
  hasCodexAuth: false,
  hostIsClaudeCode: false,
};

/** Build a stub fetch that returns a fixed Response for every call. */
function stubFetchReturning(
  status: number,
  body: unknown = {},
): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

/** Build a stub fetch that throws — network error scenario. */
function stubFetchThrowing(message: string): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

/** Capture the URL + headers of the first request. */
function spyFetch(): {
  fetch: typeof fetch;
  calls: Array<{ url: string; headers: Record<string, string> }>;
} {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchFn: typeof fetch = async (url, init) => {
    const headers: Record<string, string> = {};
    const raw = init?.headers;
    if (raw && !Array.isArray(raw) && !(raw instanceof Headers)) {
      Object.assign(headers, raw as Record<string, string>);
    }
    calls.push({ url: String(url), headers });
    return new Response("{}", { status: 200 });
  };
  return { fetch: fetchFn, calls };
}

// ---------------------------------------------------------------------------
// pingAnthropic
// ---------------------------------------------------------------------------

describe("pingAnthropic", () => {
  it("returns passed=true on 200", async () => {
    const check = await pingAnthropic("sk-ant-test", {
      fetch: stubFetchReturning(200),
    });
    expect(check).toEqual({ name: "anthropic", passed: true });
  });

  it("reports auth failure on 401", async () => {
    const check = await pingAnthropic("sk-ant-bad", {
      fetch: stubFetchReturning(401),
    });
    expect(check.passed).toBe(false);
    expect(check.message).toContain("인증 실패");
  });

  it("reports generic HTTP failure on 5xx", async () => {
    const check = await pingAnthropic("sk-ant-test", {
      fetch: stubFetchReturning(500),
    });
    expect(check.passed).toBe(false);
    expect(check.message).toContain("500");
  });

  it("reports network error on fetch throw", async () => {
    const check = await pingAnthropic("sk-ant-test", {
      fetch: stubFetchThrowing("ECONNREFUSED"),
    });
    expect(check.passed).toBe(false);
    expect(check.message).toContain("네트워크");
    expect(check.message).toContain("ECONNREFUSED");
  });

  it("sends x-api-key header and anthropic-version", async () => {
    const spy = spyFetch();
    await pingAnthropic("sk-ant-xyz", { fetch: spy.fetch });
    expect(spy.calls[0]?.url).toBe("https://api.anthropic.com/v1/models");
    expect(spy.calls[0]?.headers["x-api-key"]).toBe("sk-ant-xyz");
    expect(spy.calls[0]?.headers["anthropic-version"]).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// pingOpenai
// ---------------------------------------------------------------------------

describe("pingOpenai", () => {
  it("returns passed=true on 200", async () => {
    const check = await pingOpenai("sk-test", {
      fetch: stubFetchReturning(200),
    });
    expect(check.passed).toBe(true);
  });

  it("sends Authorization: Bearer header", async () => {
    const spy = spyFetch();
    await pingOpenai("sk-test", { fetch: spy.fetch });
    expect(spy.calls[0]?.url).toBe("https://api.openai.com/v1/models");
    expect(spy.calls[0]?.headers.Authorization).toBe("Bearer sk-test");
  });

  it("reports 401 as auth failure", async () => {
    const check = await pingOpenai("bad", {
      fetch: stubFetchReturning(401),
    });
    expect(check.passed).toBe(false);
    expect(check.message).toContain("인증 실패");
  });
});

// ---------------------------------------------------------------------------
// pingLitellm
// ---------------------------------------------------------------------------

describe("pingLitellm", () => {
  it("appends /models to the base URL", async () => {
    const spy = spyFetch();
    await pingLitellm("http://localhost:4000/v1", undefined, {
      fetch: spy.fetch,
    });
    expect(spy.calls[0]?.url).toBe("http://localhost:4000/v1/models");
  });

  it("strips trailing slashes before appending /models", async () => {
    const spy = spyFetch();
    await pingLitellm("http://localhost:4000/v1/", undefined, {
      fetch: spy.fetch,
    });
    expect(spy.calls[0]?.url).toBe("http://localhost:4000/v1/models");
  });

  it("omits Authorization when no apiKey given", async () => {
    const spy = spyFetch();
    await pingLitellm("http://localhost:11434/v1", undefined, {
      fetch: spy.fetch,
    });
    expect(spy.calls[0]?.headers.Authorization).toBeUndefined();
  });

  it("sends Bearer token when apiKey provided", async () => {
    const spy = spyFetch();
    await pingLitellm("https://litellm.example.com/v1", "sk-proxy", {
      fetch: spy.fetch,
    });
    expect(spy.calls[0]?.headers.Authorization).toBe("Bearer sk-proxy");
  });

  it("reports 401 with guidance to set LITELLM_API_KEY", async () => {
    const check = await pingLitellm("http://localhost:4000/v1", undefined, {
      fetch: stubFetchReturning(401),
    });
    expect(check.passed).toBe(false);
    expect(check.message).toContain("LITELLM_API_KEY");
  });

  it("reports network failure on ECONNREFUSED", async () => {
    const check = await pingLitellm("http://localhost:4000/v1", undefined, {
      fetch: stubFetchThrowing("fetch failed"),
    });
    expect(check.passed).toBe(false);
    expect(check.message).toContain("연결 실패");
  });
});

// ---------------------------------------------------------------------------
// verifyCodex (filesystem-level, no network)
// ---------------------------------------------------------------------------

describe("verifyCodex", () => {
  it("passes when both binary and auth present in detection", () => {
    const check = verifyCodex({
      ...BLANK_DETECTION,
      hasCodexBinary: true,
      hasCodexAuth: true,
    });
    expect(check).toEqual({ name: "codex", passed: true });
  });

  it("fails with binary missing message", () => {
    const check = verifyCodex(BLANK_DETECTION);
    expect(check.passed).toBe(false);
    expect(check.message).toContain("binary");
  });

  it("fails with auth missing message when binary present", () => {
    const check = verifyCodex({ ...BLANK_DETECTION, hasCodexBinary: true });
    expect(check.passed).toBe(false);
    expect(check.message).toContain("codex login");
  });

  it("dependency overrides win over detection values", () => {
    const check = verifyCodex(BLANK_DETECTION, {
      codexBinaryPresent: () => true,
      codexAuthPresent: () => true,
    });
    expect(check.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateInstall orchestrator
// ---------------------------------------------------------------------------

const ANTHROPIC_DECISIONS: InstallDecisions = {
  profileScope: "project",
  reviewProvider: "anthropic",
  learnProvider: "anthropic",
  outputLanguage: "ko",
};

describe("validateInstall", () => {
  it("skips network probe for main-native review + anthropic learn", async () => {
    const spy = spyFetch();
    const result = await validateInstall({
      decisions: {
        ...ANTHROPIC_DECISIONS,
        reviewProvider: "main-native",
      },
      secrets: { anthropicApiKey: "sk-ant-test" },
      detection: BLANK_DETECTION,
      deps: { fetch: spy.fetch },
    });
    // Only anthropic is probed — main-native contributes no network call.
    expect(spy.calls.length).toBe(1);
    expect(spy.calls[0]?.url).toContain("api.anthropic.com");
    expect(result.ok).toBe(true);
  });

  it("dedupes when review and learn providers match", async () => {
    const spy = spyFetch();
    await validateInstall({
      decisions: ANTHROPIC_DECISIONS,
      secrets: { anthropicApiKey: "sk-ant-test" },
      detection: BLANK_DETECTION,
      deps: { fetch: spy.fetch },
    });
    expect(spy.calls.length).toBe(1);
  });

  it("probes both providers when they differ", async () => {
    const spy = spyFetch();
    await validateInstall({
      decisions: {
        ...ANTHROPIC_DECISIONS,
        reviewProvider: "anthropic",
        learnProvider: "openai",
      },
      secrets: { anthropicApiKey: "sk-ant", openaiApiKey: "sk-oai" },
      detection: BLANK_DETECTION,
      deps: { fetch: spy.fetch },
    });
    const urls = spy.calls.map((c) => c.url);
    expect(urls.some((u) => u.includes("api.anthropic.com"))).toBe(true);
    expect(urls.some((u) => u.includes("api.openai.com"))).toBe(true);
  });

  it("fails when credential is missing entirely", async () => {
    const result = await validateInstall({
      decisions: ANTHROPIC_DECISIONS,
      secrets: {},
      detection: BLANK_DETECTION,
      deps: { fetch: stubFetchReturning(200) },
    });
    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => c.message?.includes("ANTHROPIC_API_KEY"))).toBe(
      true,
    );
  });

  it("falls back to process.env when secrets are empty", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "from-env";
    try {
      const spy = spyFetch();
      const result = await validateInstall({
        decisions: ANTHROPIC_DECISIONS,
        secrets: {},
        detection: BLANK_DETECTION,
        deps: { fetch: spy.fetch },
      });
      expect(result.ok).toBe(true);
      expect(spy.calls[0]?.headers["x-api-key"]).toBe("from-env");
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("surfaces codex check in mixed-provider setup", async () => {
    const result = await validateInstall({
      decisions: {
        ...ANTHROPIC_DECISIONS,
        reviewProvider: "codex",
        learnProvider: "anthropic",
      },
      secrets: { anthropicApiKey: "sk-ant" },
      detection: BLANK_DETECTION,
      deps: { fetch: stubFetchReturning(200) },
    });
    expect(result.checks.some((c) => c.name === "codex")).toBe(true);
    expect(result.ok).toBe(false); // codex check fails on blank detection
  });

  it("catches learn-provider=main-native shape violation", async () => {
    const result = await validateInstall({
      decisions: {
        ...ANTHROPIC_DECISIONS,
        reviewProvider: "main-native",
        // @ts-expect-error — intentional runtime-only invalid shape
        learnProvider: "main-native",
      },
      secrets: {} as EnvSecrets,
      detection: BLANK_DETECTION,
      deps: { fetch: stubFetchReturning(200) },
    });
    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => c.message?.includes("main-native"))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// formatValidationResult
// ---------------------------------------------------------------------------

describe("formatValidationResult", () => {
  it("marks passed checks with ✓ and failed with ✗", () => {
    const text = formatValidationResult({
      ok: false,
      checks: [
        { name: "anthropic", passed: true },
        { name: "openai", passed: false, message: "oops" },
      ],
    });
    expect(text).toContain("✓ anthropic");
    expect(text).toContain("✗ openai");
    expect(text).toContain("oops");
  });
});
