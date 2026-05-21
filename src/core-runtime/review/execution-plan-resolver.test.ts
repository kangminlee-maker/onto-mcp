import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { OntoConfig } from "../discovery/config-chain.js";
import {
  resolveExecutionPlan,
  type ExecutionPlanResolution,
} from "./execution-plan-resolver.js";

// ---------------------------------------------------------------------------
// These tests assert two invariants of the unified ExecutionPlan resolver:
//
// (1) Every decision point writes a trace line, so operators can reconstruct
//     the ladder walk from STDERR + plan_trace alone. "Silent divergence" —
//     the failure mode that made review fail 5 times on 2026-04-17~18 — is
//     structurally impossible when every branch logs.
//
// (2) The returned ExecutionPlan shape is stable: separation_rank,
//     execution_realization, host_runtime, and provider_identity are always
//     populated together; callers can rely on this quadruple without
//     defensive undefined checks.
// ---------------------------------------------------------------------------

const BASE_CONFIG: OntoConfig = {};

function expectResolved(
  resolution: ExecutionPlanResolution,
): Extract<ExecutionPlanResolution, { type: "resolved" }> {
  if (resolution.type !== "resolved") {
    throw new Error(
      `expected resolved, got no_host: ${resolution.reason.slice(0, 80)}`,
    );
  }
  return resolution;
}

function expectNoHost(
  resolution: ExecutionPlanResolution,
): Extract<ExecutionPlanResolution, { type: "no_host" }> {
  if (resolution.type !== "no_host") {
    throw new Error(
      `expected no_host, got resolved plan with rank=${resolution.plan.separation_rank}`,
    );
  }
  return resolution;
}

describe("resolveExecutionPlan — P0 mock", () => {
  it("P0 mock: ONTO_LLM_MOCK=1 short-circuits the ladder at S3", () => {
    const res = resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: BASE_CONFIG,
      env: { ONTO_LLM_MOCK: "1" },
      claudeHost: false,
      codexAvailable: false,
    });
    const resolved = expectResolved(res);
    expect(resolved.plan.separation_rank).toBe("S3");
    expect(resolved.plan.execution_realization).toBe("mock");
    expect(resolved.plan.provider_identity).toBe("mock");
    expect(resolved.plan.plan_trace[0]).toContain("P0 mock: matched");
  });
});

describe("resolveExecutionPlan — P1 explicit", () => {
  it("P1a --codex flag wins over claudeHost auto-detection", () => {
    const res = resolveExecutionPlan({
      explicitCodex: true,
      ontoConfig: {},
      env: {},
      claudeHost: true, // would otherwise match P2
      codexAvailable: false,
    });
    const resolved = expectResolved(res);
    expect(resolved.plan.separation_rank).toBe("S0");
    expect(resolved.plan.host_runtime).toBe("codex");
    expect(resolved.plan.provider_identity).toBe("codex");
    expect(resolved.plan.plan_trace[0]).toContain("P1 explicit-codex");
  });

  it("P1f env ONTO_HOST_RUNTIME=lmstudio forces ts_inline_http with matching provider", () => {
    const res = resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: {
        llm: {
          auth: "local",
          provider: "lmstudio",
          model: "llama-8b",
          base_url: "http://proxy.local",
        },
      },
      env: { ONTO_HOST_RUNTIME: "lmstudio" },
      claudeHost: false,
      codexAvailable: false,
    });
    const resolved = expectResolved(res);
    expect(resolved.plan.separation_rank).toBe("S1");
    expect(resolved.plan.execution_realization).toBe("ts_inline_http");
    expect(resolved.plan.provider_identity).toBe("lmstudio");
    expect(resolved.plan.base_url).toBe("http://proxy.local");
  });
});

describe("resolveExecutionPlan — P2/P3 auto-detection", () => {
  it("P2 claudeHost=true wins over codexAvailable (stay-in-host)", () => {
    const res = resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: {},
      env: {},
      claudeHost: true,
      codexAvailable: true, // would match P3 if P2 didn't exist
    });
    const resolved = expectResolved(res);
    expect(resolved.plan.host_runtime).toBe("claude");
    expect(resolved.plan.separation_rank).toBe("S2");
  });

  it("P3 codexAvailable=true → S0 subprocess", () => {
    const res = resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: {},
      env: {},
      claudeHost: false,
      codexAvailable: true,
    });
    const resolved = expectResolved(res);
    expect(resolved.plan.separation_rank).toBe("S0");
    expect(resolved.plan.provider_identity).toBe("codex");
  });

  it("P4 llm switcher config → ts_inline_http when no host/codex", () => {
    const res = resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: {
        llm: {
          auth: "api_key",
          provider: "anthropic",
          model: "claude-sonnet-4",
        },
      },
      env: {},
      claudeHost: false,
      codexAvailable: false,
    });
    const resolved = expectResolved(res);
    expect(resolved.plan.separation_rank).toBe("S1");
    expect(resolved.plan.provider_identity).toBe("anthropic");
    expect(resolved.plan.model_id).toBe("claude-sonnet-4");
  });

  it("no viable path → no_host with reason", () => {
    const res = resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: {},
      env: {},
      claudeHost: false,
      codexAvailable: false,
    });
    const nohost = expectNoHost(res);
    expect(nohost.reason).toContain("Review execution plan");
    expect(nohost.plan_trace.length).toBeGreaterThan(0);
    expect(nohost.plan_trace.at(-1)).toContain("no viable path");
  });
});

describe("resolveExecutionPlan — env override", () => {
  it("ONTO_HOST_RUNTIME=standalone → ts_inline_http + provider lookup", () => {
    const res = resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: { llm: { auth: "api_key", provider: "openai", model: "gpt-5" } },
      env: { ONTO_HOST_RUNTIME: "standalone" },
      claudeHost: true, // env should override claudeHost auto-detection
      codexAvailable: true,
    });
    const resolved = expectResolved(res);
    expect(resolved.plan.execution_realization).toBe("ts_inline_http");
    expect(resolved.plan.provider_identity).toBe("openai");
    expect(resolved.plan.model_id).toBe("gpt-5");
  });

  it("ONTO_HOST_RUNTIME=codex → subprocess even without explicit flag", () => {
    const res = resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: {},
      env: { ONTO_HOST_RUNTIME: "codex" },
      claudeHost: false,
      codexAvailable: false, // env override ignores auto-detection
    });
    const resolved = expectResolved(res);
    expect(resolved.plan.host_runtime).toBe("codex");
  });
});

describe("resolveExecutionPlan — observability", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("emits [plan] prefix for every decision line", () => {
    resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: {},
      env: {},
      claudeHost: true,
      codexAvailable: false,
    });
    const calls = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const planLines = calls.filter((l: string) => l.startsWith("[plan]"));
    expect(planLines.length).toBeGreaterThan(0);
    for (const line of planLines) {
      expect(line).toMatch(/^\[plan\] /);
    }
  });

  it("plan_trace matches what was emitted to stderr (single source of truth)", () => {
    const res = resolveExecutionPlan({
      explicitCodex: true,
      ontoConfig: {},
      env: {},
      claudeHost: false,
      codexAvailable: false,
    });
    const resolved = expectResolved(res);
    const stderrLines = stderrSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.startsWith("[plan] "))
      .map((l: string) => l.replace(/^\[plan\] /, "").replace(/\n$/, ""));
    expect(resolved.plan.plan_trace).toEqual(stderrLines);
  });

  it("no_host resolution still surfaces plan_trace for debugging", () => {
    const res = resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: {},
      env: {},
      claudeHost: false,
      codexAvailable: false,
    });
    const nohost = expectNoHost(res);
    expect(nohost.plan_trace).toBeDefined();
    expect(nohost.plan_trace.length).toBeGreaterThan(0);
  });
});

describe("resolveExecutionPlan — provider resolution", () => {
  it("llm switcher selects the external provider", () => {
    const res = resolveExecutionPlan({
      explicitCodex: false,
      ontoConfig: {
        llm: { auth: "api_key", provider: "anthropic", model: "claude-x" },
      },
      env: {},
      claudeHost: false,
      codexAvailable: false,
    });
    const resolved = expectResolved(res);
    expect(resolved.plan.provider_identity).toBe("anthropic");
  });
});

describe("resolveExecutionPlan — retry policy", () => {
  it("retry_policy is populated on every resolved plan", () => {
    const res = resolveExecutionPlan({
      explicitCodex: true,
      ontoConfig: {},
      env: {},
      claudeHost: false,
      codexAvailable: false,
    });
    const resolved = expectResolved(res);
    expect(resolved.plan.retry_policy).toBeDefined();
    expect(resolved.plan.retry_policy.timeout_ms).toBeGreaterThan(0);
    expect(resolved.plan.retry_policy.max_attempts).toBeGreaterThanOrEqual(1);
    expect(["exponential", "linear", "none"]).toContain(
      resolved.plan.retry_policy.backoff,
    );
  });
});
