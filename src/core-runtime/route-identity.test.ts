import { describe, expect, it } from "vitest";
import {
  modelProviderFromRuntimeProvider,
  profileDerivedRouteIdentity,
  routeHintMatches,
  routeToken,
  witnessedReconstructRouteIdentity,
  worstRouteCompleteness,
} from "./route-identity.js";

describe("modelProviderFromRuntimeProvider", () => {
  it("maps the codex OAuth brand to its model vendor openai", () => {
    expect(modelProviderFromRuntimeProvider("codex")).toBe("openai");
  });

  it("is identity for brands that equal their model vendor", () => {
    expect(modelProviderFromRuntimeProvider("openai")).toBe("openai");
    expect(modelProviderFromRuntimeProvider("anthropic")).toBe("anthropic");
    expect(modelProviderFromRuntimeProvider("grok")).toBe("grok");
    expect(modelProviderFromRuntimeProvider("lmstudio")).toBe("lmstudio");
  });

  it("returns null for an unknown/absent brand", () => {
    expect(modelProviderFromRuntimeProvider(null)).toBeNull();
    expect(modelProviderFromRuntimeProvider("mystery")).toBeNull();
  });
});

describe("witnessedReconstructRouteIdentity", () => {
  it("distinguishes anthropic SDK from Claude Code OAuth (the round-4-6 split)", () => {
    const sdk = witnessedReconstructRouteIdentity({
      provider: "anthropic",
      executionAdapter: "anthropic_sdk",
      declaredBillingMode: "per_token",
      effectiveBaseUrl: "https://api.anthropic.com",
    });
    const oauth = witnessedReconstructRouteIdentity({
      provider: "anthropic",
      executionAdapter: "claude_code",
      declaredBillingMode: "subscription",
      effectiveBaseUrl: "claude-cli://oauth",
    });
    // Same model_provider, but adapter + billing split them — the whole point.
    expect(sdk.model_provider).toBe("anthropic");
    expect(oauth.model_provider).toBe("anthropic");
    expect(sdk.execution_adapter).toBe("anthropic_sdk");
    expect(oauth.execution_adapter).toBe("claude_code");
    expect(routeToken(sdk)).not.toBe(routeToken(oauth));
    expect(sdk.route_completeness).toBe("complete");
    expect(oauth.route_completeness).toBe("complete");
  });

  it("recovers model_provider=openai for the codex OAuth route (not in effective_base_url)", () => {
    const codex = witnessedReconstructRouteIdentity({
      provider: "codex",
      executionAdapter: "codex_cli",
      declaredBillingMode: "subscription",
      effectiveBaseUrl: "codex-cli://oauth",
    });
    expect(codex.model_provider).toBe("openai");
    expect(codex.execution_adapter).toBe("codex_cli");
    expect(codex.route_completeness).toBe("complete");
  });

  it("marks billing as declared but adapter/provider as witnessed provenance", () => {
    const id = witnessedReconstructRouteIdentity({
      provider: "anthropic",
      executionAdapter: "anthropic_sdk",
      declaredBillingMode: "per_token",
      effectiveBaseUrl: "https://api.anthropic.com",
    });
    expect(id.route_provenance).toBe("witnessed");
    // billing carried but the design treats it as declared-provenance (§8).
    expect(id.billing_mode).toBe("per_token");
  });

  it("short-circuits a mock:// base to the coarse mock adapter, no realization", () => {
    const id = witnessedReconstructRouteIdentity({
      provider: "anthropic",
      executionAdapter: "anthropic_sdk",
      declaredBillingMode: "local",
      effectiveBaseUrl: "mock://reconstruct",
    });
    expect(id.execution_adapter).toBe("mock");
    expect(id.realization).toBeNull();
    expect(id.effective_base_url).toBe("mock://reconstruct");
  });

  it("degrades to provider_only when the adapter is absent (legacy telemetry)", () => {
    const id = witnessedReconstructRouteIdentity({
      provider: "anthropic",
      executionAdapter: null,
      declaredBillingMode: null,
      effectiveBaseUrl: null,
    });
    expect(id.execution_adapter).toBeNull();
    expect(id.model_provider).toBe("anthropic");
    expect(id.route_completeness).toBe("provider_only");
  });

  it("degrades to under_determined when the brand is unknown", () => {
    const id = witnessedReconstructRouteIdentity({
      provider: null,
      executionAdapter: null,
      declaredBillingMode: null,
      effectiveBaseUrl: null,
    });
    expect(id.model_provider).toBeNull();
    expect(id.route_completeness).toBe("under_determined");
  });
});

describe("profileDerivedRouteIdentity", () => {
  it("carries the rich review route fields with profile_derived provenance", () => {
    const id = profileDerivedRouteIdentity({
      executionAdapter: "claude_code",
      modelProvider: "anthropic",
      billingMode: "subscription",
      effectiveBaseUrl: null,
      realization: null,
    });
    expect(id.route_provenance).toBe("profile_derived");
    expect(id.execution_adapter).toBe("claude_code");
    expect(id.model_provider).toBe("anthropic");
    expect(id.route_completeness).toBe("complete");
  });

  it("keeps a review-only mock realization sub-token", () => {
    const id = profileDerivedRouteIdentity({
      executionAdapter: "mock",
      modelProvider: null,
      billingMode: "local",
      realization: "semantic_mock",
    });
    expect(id.execution_adapter).toBe("mock");
    expect(id.realization).toBe("semantic_mock");
  });
});

describe("routeToken", () => {
  it("projects the structured identity to adapter:billing:provider", () => {
    const id = witnessedReconstructRouteIdentity({
      provider: "codex",
      executionAdapter: "codex_cli",
      declaredBillingMode: "subscription",
      effectiveBaseUrl: "codex-cli://oauth",
    });
    expect(routeToken(id)).toBe("codex_cli:subscription:openai");
  });

  it("renders provider_only / unknown for an under-determined identity", () => {
    const id = witnessedReconstructRouteIdentity({
      provider: null,
      executionAdapter: null,
      declaredBillingMode: null,
      effectiveBaseUrl: null,
    });
    expect(routeToken(id)).toBe("provider_only:unknown:unknown");
  });
});

describe("worstRouteCompleteness", () => {
  it("returns the most degraded completeness in the set", () => {
    expect(worstRouteCompleteness(["complete", "complete"])).toBe("complete");
    expect(worstRouteCompleteness(["complete", "provider_only"])).toBe("provider_only");
    expect(worstRouteCompleteness(["provider_only", "under_determined"])).toBe(
      "under_determined",
    );
  });

  it("folds an empty set to the complete identity element", () => {
    expect(worstRouteCompleteness([])).toBe("complete");
  });
});

describe("routeHintMatches", () => {
  const sdk = witnessedReconstructRouteIdentity({
    provider: "anthropic",
    executionAdapter: "anthropic_sdk",
    declaredBillingMode: "per_token",
    effectiveBaseUrl: "https://api.anthropic.com",
  });
  const legacy = witnessedReconstructRouteIdentity({
    provider: "anthropic",
    executionAdapter: null,
    declaredBillingMode: null,
    effectiveBaseUrl: null,
  });

  it("corroborates a provider-level hint against model_provider", () => {
    expect(routeHintMatches("anthropic", sdk)).toBe(true);
  });

  it("corroborates the full routeToken and the execution_adapter", () => {
    expect(routeHintMatches(routeToken(sdk), sdk)).toBe(true);
    expect(routeHintMatches("anthropic_sdk", sdk)).toBe(true);
  });

  it("does NOT corroborate a slash-adapter hint against a complete identity", () => {
    // anthropic/claude-cli names the claude-cli adapter, but the identity is the
    // anthropic SDK — corroborating it would hide the SDK-vs-OAuth split.
    expect(routeHintMatches("anthropic/claude-cli", sdk)).toBe(false);
  });

  it("allows the provider-head fallback only for a provider_only legacy identity", () => {
    expect(legacy.route_completeness).toBe("provider_only");
    expect(routeHintMatches("anthropic/claude-cli", legacy)).toBe(true);
  });

  it("does not corroborate a different provider", () => {
    expect(routeHintMatches("openai", sdk)).toBe(false);
  });
});
