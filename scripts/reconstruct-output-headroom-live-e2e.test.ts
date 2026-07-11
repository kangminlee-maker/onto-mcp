import { describe, expect, it } from "vitest";
import {
  assertObservedStage,
  isCompletedPhysicalAttempt,
  type ObservedRequest,
} from "./reconstruct-output-headroom-live-e2e.mts";

function observedRequest(
  overrides: Partial<ObservedRequest> = {},
): ObservedRequest {
  return {
    stage: "candidate_disposition",
    method: "POST",
    path: "/v1/responses",
    model: "gpt-5.5",
    effort: "low",
    store: false,
    request_body_sha256: "a".repeat(64),
    max_output_tokens: 29_000,
    provider_status: "completed",
    response_model: "gpt-5.5-2026-06-01",
    response_id_sha256: "b".repeat(64),
    http_status: 200,
    transport_error: null,
    ...overrides,
  };
}

describe("reconstruct output-headroom live evidence", () => {
  it("requires the full completed physical-attempt predicate", () => {
    expect(isCompletedPhysicalAttempt(observedRequest())).toBe(true);
    expect(isCompletedPhysicalAttempt(observedRequest({ http_status: 429 })))
      .toBe(false);
    expect(isCompletedPhysicalAttempt(observedRequest({
      response_id_sha256: null,
    }))).toBe(false);
  });

  it("does not let a retryable non-2xx response complete a logical request body", () => {
    const retryable = observedRequest({ http_status: 429 });
    expect(() => assertObservedStage({
      observations: [retryable],
      stage: "candidate_disposition",
      expectedMaxOutputTokens: 29_000,
    })).toThrow(/has no completed physical attempt/);

    expect(assertObservedStage({
      observations: [retryable, observedRequest()],
      stage: "candidate_disposition",
      expectedMaxOutputTokens: 29_000,
    })).toHaveLength(2);
  });
});
