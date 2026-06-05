import { describe, expect, it } from "vitest";
import type { ReviewExecutionProfile } from "./review-execution-profile.js";
import { buildReviewExecutionRoute } from "./review-execution-route.js";

function profile(
  patch: Partial<ReviewExecutionProfile>,
): ReviewExecutionProfile {
  return {
    mode: "main-workers",
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
      host: "codex",
      executor: "codex",
      resolved_provider: "codex",
      auth_mode: "oauth",
      execution_realization: "worker",
      artifact_host_runtime: "codex",
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
      host: "standalone",
      executor: "direct_call",
      resolved_provider: "openai",
      auth_mode: "api_key",
      execution_realization: "direct-call",
      artifact_host_runtime: "openai",
    });
  });

  it("defaults direct-call OpenAI auth mode to api_key when omitted", () => {
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
      auth_mode: "api_key",
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

  it("maps LM Studio local direct-call to resolved provider lmstudio", () => {
    expect(
      buildReviewExecutionRoute(
        profile({
          worker_executor: "direct_call",
          host: "lmstudio",
          auth: "local",
          provider: "lmstudio",
        }),
      ),
    ).toMatchObject({
      resolved_provider: "lmstudio",
      auth_mode: "local",
      artifact_host_runtime: "lmstudio",
    });
  });

  it("defaults direct-call LM Studio auth mode to local when omitted", () => {
    expect(
      buildReviewExecutionRoute(
        profile({
          worker_executor: "direct_call",
          host: "lmstudio",
          auth: undefined,
          provider: "lmstudio",
        }),
      ),
    ).toMatchObject({
      resolved_provider: "lmstudio",
      auth_mode: "local",
      artifact_host_runtime: "lmstudio",
    });
  });

  it("maps mock execution to resolved provider mock", () => {
    expect(
      buildReviewExecutionRoute(
        profile({
          worker_executor: "mock",
          host: "standalone",
        }),
      ),
    ).toMatchObject({
      host: "standalone",
      executor: "mock",
      resolved_provider: "mock",
      auth_mode: null,
      execution_realization: "direct-call",
      artifact_host_runtime: "standalone",
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
