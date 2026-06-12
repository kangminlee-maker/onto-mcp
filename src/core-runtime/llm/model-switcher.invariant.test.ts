import { describe, expect, it } from "vitest";
import { normalizeLlmModelSwitcher } from "./model-switcher.js";

/**
 * INVARIANT TEST (INV-AUTH-1 — 기본 인증은 항상 OAuth; G3).
 *
 * 기대값의 근거는 INVARIANTS.md 명세다. "코드가 지금 이렇게 동작하니까"는
 * 기대값 변경 사유가 아니다(INV-TEST-1) — 이 파일을 바꾸려면 INVARIANTS.md
 * 명세 변경 근거를 함께 제시한다.
 */
describe("INV-AUTH-1: auth omission resolves to OAuth", () => {
  it("provider=openai without auth resolves to the OAuth/Codex worker route", () => {
    const normalized = normalizeLlmModelSwitcher({
      provider: "openai",
      model: "gpt-5.5",
    });
    expect(normalized.auth).toBe("oauth");
    expect(normalized.execution_route).toBe("external_oauth_worker");
    expect(normalized.billing_mode).toBe("subscription");
  });

  it("api_key/local are only honored when explicitly requested", () => {
    const explicit = normalizeLlmModelSwitcher({
      provider: "openai",
      auth: "api_key",
      model: "gpt-5.5",
    });
    expect(explicit.auth).toBe("api_key");
    expect(explicit.execution_route).toBe("direct_model_call");
  });
});
