import { describe, expect, it } from "vitest";
import type { ReviewExecutionProfile } from "./review-execution-profile.js";
import { buildReviewExecutionRoute } from "./review-execution-route.js";

function profile(
  patch: Partial<ReviewExecutionProfile>,
): ReviewExecutionProfile {
  return {
    mode: "main-workers",
    orchestration: "runtime",
    teamlead: { seat: "main" },
    lens: { seat: "worker" },
    synthesize: { seat: "worker" },
    deliberation: "controlled-lens-deliberation",
    worker_executor: "codex",
    host: "codex",
    auth: "oauth",
    provider: "openai",
    model: "gpt-5.5",
    trace: [],
    ...patch,
  };
}

describe("buildReviewExecutionRoute", () => {
  it("maps OpenAI OAuth Codex worker to resolved provider codex", () => {
    expect(
      buildReviewExecutionRoute(
        profile({
          worker_executor: "codex",
          host: "codex",
          auth: "oauth",
          provider: "openai",
        }),
      ),
    ).toMatchObject({
      execution_route: "external_oauth_worker",
      execution_adapter: "codex_cli",
      model_provider: "openai",
      model_id: "gpt-5.5",
      billing_mode: "subscription",
      host: "codex",
      executor: "codex",
      resolved_provider: "codex",
      auth_mode: "oauth",
      execution_realization: "worker",
      artifact_host_runtime: "codex",
    });
  });

  it("maps Anthropic OAuth claude_code worker to the external OAuth worker route", () => {
    expect(
      buildReviewExecutionRoute(
        profile({
          worker_executor: "claude_code",
          host: "anthropic",
          auth: "oauth",
          provider: "anthropic",
          model: "claude-opus-4-8",
        }),
      ),
    ).toMatchObject({
      execution_route: "external_oauth_worker",
      execution_adapter: "claude_code",
      model_provider: "anthropic",
      model_id: "claude-opus-4-8",
      billing_mode: "subscription",
      host: "standalone",
      executor: "claude_code",
      resolved_provider: "anthropic",
      auth_mode: "oauth",
      execution_realization: "worker",
      artifact_host_runtime: "anthropic",
    });
  });

  it("maps OpenAI API-key direct-call to resolved provider openai", () => {
    expect(
      buildReviewExecutionRoute(
        profile({
          worker_executor: "direct_call",
          host: "openai",
          auth: "api_key",
          provider: "openai",
        }),
      ),
    ).toMatchObject({
      execution_route: "direct_model_call",
      execution_adapter: "openai_sdk",
      model_provider: "openai",
      model_id: "gpt-5.5",
      wire_format: "native_sdk",
      billing_mode: "per_token",
      host: "standalone",
      executor: "direct_call",
      resolved_provider: "openai",
      auth_mode: "api_key",
      execution_realization: "direct-call",
      artifact_host_runtime: "openai",
    });
  });

  it("does not invent API-key auth for direct-call OpenAI when auth is omitted", () => {
    expect(
      buildReviewExecutionRoute(
        profile({
          worker_executor: "direct_call",
          host: "openai",
          auth: undefined,
          provider: "openai",
        }),
      ),
    ).toMatchObject({
      resolved_provider: "openai",
      auth_mode: null,
      artifact_host_runtime: "openai",
    });
  });

  it("maps Anthropic API-key direct-call to resolved provider anthropic", () => {
    expect(
      buildReviewExecutionRoute(
        profile({
          worker_executor: "direct_call",
          host: "anthropic",
          auth: "api_key",
          provider: "anthropic",
        }),
      ).resolved_provider,
    ).toBe("anthropic");
  });

  it.todo(
    "maps reserved/future LM Studio local direct-call after the local route patch",
  );

  it("maps standalone provider direct-call to direct model route", () => {
    expect(
      buildReviewExecutionRoute(
        profile({
          worker_executor: "direct_call",
          host: "standalone",
          auth: "api_key",
          provider: "openai",
        }),
      ),
    ).toMatchObject({
      execution_route: "direct_model_call",
      execution_adapter: "openai_sdk",
      model_provider: "openai",
      model_id: "gpt-5.5",
      wire_format: "native_sdk",
      billing_mode: "per_token",
      host: "standalone",
      executor: "direct_call",
      resolved_provider: "openai",
      auth_mode: "api_key",
      execution_realization: "direct-call",
      artifact_host_runtime: "openai",
    });
  });

  it("fails loud when direct-call has no API/local provider host", () => {
    expect(() =>
      buildReviewExecutionRoute(
        profile({
          worker_executor: "direct_call",
          host: "codex",
          provider: undefined,
        }),
      ),
    ).toThrow("Review direct-call route requires an API/local provider host");
  });

  it("fails loud when direct-call host and provider authority conflict", () => {
    expect(() =>
      buildReviewExecutionRoute(
        profile({
          worker_executor: "direct_call",
          host: "anthropic",
          auth: "api_key",
          provider: "openai",
        }),
      ),
    ).toThrow("Review direct-call route has conflicting provider authority");
  });

  it("fails loud when direct-call uses OAuth auth", () => {
    expect(() =>
      buildReviewExecutionRoute(
        profile({
          worker_executor: "direct_call",
          host: "anthropic",
          auth: "oauth",
          provider: undefined,
        }),
      ),
    ).toThrow("Review direct-call route requires API-key/local auth");
  });

  it("fails loud when standalone direct-call provider uses OAuth auth", () => {
    expect(() =>
      buildReviewExecutionRoute(
        profile({
          worker_executor: "direct_call",
          host: "standalone",
          provider: "openai",
          auth: "oauth",
        }),
      ),
    ).toThrow("Review direct-call route requires API-key/local auth");
  });
});
