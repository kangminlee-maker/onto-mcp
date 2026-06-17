/**
 * Unified route identity (effort-calibration simplification, design
 * 20260617-effort-calibration-simplification-telemetry-derived-design.md §5).
 *
 * A RouteIdentity is a projection of the model-switcher's already-resolved
 * selection — it REUSES LlmExecutionAdapter / LlmProviderName / LlmBillingMode
 * rather than minting a parallel vocabulary. The only genuinely new fields are
 * `route_provenance` (witnessed vs profile-derived) and `route_completeness`
 * (whether the route resolved past model_provider).
 *
 * Provenance honesty (design §3, §8):
 *  - reconstruct derives execution_adapter / model_provider from the resolved
 *    selection carried on the call config (witnessed at the call boundary), NOT
 *    by reverse-mapping effective_base_url (which cannot recover model_provider
 *    for codex-cli://oauth or a custom openai-compatible base).
 *  - billing_mode is a code-path constant (`declared_billing_mode`), so it stays
 *    declared-provenance even on the reconstruct (otherwise witnessed) side.
 *  - effective_base_url is corroboration only, and identifies custom proxy bases
 *    that downgrade route_completeness.
 */
import {
  DEFAULT_GROK_BASE_URL,
  DEFAULT_LMSTUDIO_BASE_URL,
  type LlmBillingMode,
  type LlmExecutionAdapter,
  type LlmProviderName,
  type RuntimeLlmProvider,
} from "./llm/model-switcher.js";

export type RouteProvenance = "witnessed" | "profile_derived";

/**
 * Calibration route adapter set. Extends the live LlmExecutionAdapter with
 * `mock` (a deliberate concept-surface addition for calibration; not added to
 * LlmExecutionAdapter itself — design §11.3).
 */
export type RouteExecutionAdapter = LlmExecutionAdapter | "mock";

/**
 * Whether a route resolved past model_provider.
 *  - `complete`: execution_adapter AND model_provider known.
 *  - `provider_only`: model_provider known but adapter unknown (legacy
 *    provider-only telemetry) — non-decision-grade unless --allow-preliminary.
 *  - `under_determined`: not even model_provider resolved.
 */
export type RouteCompleteness = "complete" | "provider_only" | "under_determined";

export interface RouteIdentity {
  execution_adapter: RouteExecutionAdapter | null;
  model_provider: LlmProviderName | null;
  /** declared-provenance even on the reconstruct witnessed side (design §8). */
  billing_mode: LlmBillingMode | null;
  /** Corroboration + custom-base identification; not the primary derivation source. */
  effective_base_url: string | null;
  route_provenance: RouteProvenance;
  route_completeness: RouteCompleteness;
  /** Review-only mock realization; null for reconstruct (design §8). */
  realization: string | null;
}

/**
 * Map the model-switcher's RuntimeLlmProvider brand to the canonical model
 * vendor. The only brand that differs from its model_provider is `codex` (the
 * openai OAuth brand). Returns null for an unknown brand (route_completeness
 * then degrades to under_determined).
 */
export function modelProviderFromRuntimeProvider(
  provider: string | null | undefined,
): LlmProviderName | null {
  switch (provider as RuntimeLlmProvider) {
    case "codex":
    case "openai":
      return "openai";
    case "anthropic":
      return "anthropic";
    case "grok":
      return "grok";
    case "lmstudio":
      return "lmstudio";
    default:
      return null;
  }
}

/** The non-default openai-compatible bases that ARE normal provider routes. */
const KNOWN_OPENAI_COMPATIBLE_BASE_URLS: ReadonlySet<string> = new Set([
  DEFAULT_GROK_BASE_URL,
  DEFAULT_LMSTUDIO_BASE_URL,
]);

/**
 * Whether an `openai_compatible_http` route runs against a CUSTOM proxy base —
 * a base_url that is neither a mock sentinel nor one of the known provider
 * defaults. The selection still resolves an adapter + model_provider, but a
 * custom endpoint cannot be treated as the normal provider route (design §6 MF2):
 * effective_base_url is corroboration only, so a custom base downgrades
 * route_completeness rather than passing as fully witnessed.
 */
function isCustomOpenAiCompatibleBase(
  adapter: RouteExecutionAdapter | null,
  baseUrl: string | null,
): boolean {
  if (adapter !== "openai_compatible_http") return false;
  if (!baseUrl) return false;
  return !KNOWN_OPENAI_COMPATIBLE_BASE_URLS.has(baseUrl);
}

function completeness(
  adapter: RouteExecutionAdapter | null,
  modelProvider: LlmProviderName | null,
  baseUrl: string | null,
): RouteCompleteness {
  if (!modelProvider) return "under_determined";
  if (!adapter) return "provider_only";
  if (isCustomOpenAiCompatibleBase(adapter, baseUrl)) return "provider_only";
  return "complete";
}

/**
 * Build the witnessed reconstruct RouteIdentity from the fields available at the
 * call-record boundary: the resolved provider brand and execution_adapter
 * carried on the call config (witnessed), the call result's declared billing
 * mode and effective_base_url. A `mock://` base short-circuits to the mock
 * adapter (coarse; reconstruct contributes no realization).
 */
export function witnessedReconstructRouteIdentity(input: {
  /** Resolved RuntimeLlmProvider from the call config (args.llmConfig.provider). */
  provider: string | null | undefined;
  /** Resolved adapter carried on the call config (args.llmConfig.execution_adapter). */
  executionAdapter: LlmExecutionAdapter | null | undefined;
  /** Call result declared_billing_mode (code-path constant; declared-provenance). */
  declaredBillingMode: LlmBillingMode | null | undefined;
  /** Call result effective_base_url (corroboration / custom-base id). */
  effectiveBaseUrl: string | null | undefined;
}): RouteIdentity {
  const effectiveBaseUrl = input.effectiveBaseUrl ?? null;
  if (effectiveBaseUrl?.startsWith("mock://")) {
    return {
      execution_adapter: "mock",
      model_provider: null,
      billing_mode: input.declaredBillingMode ?? "local",
      effective_base_url: effectiveBaseUrl,
      route_provenance: "witnessed",
      route_completeness: "complete",
      realization: null,
    };
  }
  const adapter = input.executionAdapter ?? null;
  const modelProvider = modelProviderFromRuntimeProvider(input.provider);
  return {
    execution_adapter: adapter,
    model_provider: modelProvider,
    billing_mode: input.declaredBillingMode ?? null,
    effective_base_url: effectiveBaseUrl,
    route_provenance: "witnessed",
    route_completeness: completeness(adapter, modelProvider, effectiveBaseUrl),
    realization: null,
  };
}

/**
 * Build a profile-derived RouteIdentity from a review route projection (already
 * structurally rich: adapter / model_provider / billing / base_url). Review has
 * no result-level base_url witness, so provenance is profile_derived (design
 * §4, §11.1). `realization` (semantic_mock | boundary_stub | fixture) is
 * review-only.
 */
export function profileDerivedRouteIdentity(input: {
  executionAdapter: RouteExecutionAdapter | null | undefined;
  modelProvider: LlmProviderName | null | undefined;
  billingMode: LlmBillingMode | null | undefined;
  effectiveBaseUrl?: string | null | undefined;
  realization?: string | null | undefined;
}): RouteIdentity {
  const adapter = input.executionAdapter ?? null;
  const modelProvider = input.modelProvider ?? null;
  const effectiveBaseUrl = input.effectiveBaseUrl ?? null;
  return {
    execution_adapter: adapter,
    model_provider: modelProvider,
    billing_mode: input.billingMode ?? null,
    effective_base_url: effectiveBaseUrl,
    route_provenance: "profile_derived",
    route_completeness: completeness(adapter, modelProvider, effectiveBaseUrl),
    realization: input.realization ?? null,
  };
}

/**
 * Derived single-string projection of a RouteIdentity for CLI `--route`
 * comparison and grouping keys. The structured RouteIdentity stays canonical;
 * this is a lossy projection (design §11.2). Shape:
 * `<adapter|provider_only>:<billing>:<model_provider>`.
 */
export function routeToken(identity: RouteIdentity): string {
  const adapter = identity.execution_adapter ?? "provider_only";
  const billing = identity.billing_mode ?? "unknown";
  const provider = identity.model_provider ?? "unknown";
  return `${adapter}:${billing}:${provider}`;
}

const ROUTE_COMPLETENESS_ORDER: Record<RouteCompleteness, number> = {
  complete: 0,
  provider_only: 1,
  under_determined: 2,
};

/**
 * The most degraded completeness across a set of identities. The route axis of
 * the decision-grade gate (design §7 Q3) uses the worst — one legacy
 * provider-only source taints the merged profile's route. `complete` is the
 * fold identity (an empty list returns `complete`); a caller that treats "no
 * identities at all" as a degradation must handle the empty case itself.
 */
export function worstRouteCompleteness(
  values: readonly RouteCompleteness[],
): RouteCompleteness {
  let worst: RouteCompleteness = "complete";
  for (const value of values) {
    if (ROUTE_COMPLETENESS_ORDER[value] > ROUTE_COMPLETENESS_ORDER[worst]) {
      worst = value;
    }
  }
  return worst;
}

/**
 * Whether a declared `--route` hint corroborates a derived identity. The hint is
 * a human label — historically provider-level (`"anthropic"`) or the slash form
 * (`"anthropic/claude-cli"`) — while the canonical route is the structured
 * RouteIdentity. The hint is demoted to a non-fatal cross-check (design §5,
 * §11.2): an EXACT match against the full routeToken, the model_provider, or the
 * execution_adapter always corroborates. The lenient provider-head fallback
 * (first slash segment → model_provider) applies ONLY when the adapter is
 * unknown (provider_only / under_determined): for a `complete` identity the
 * adapter IS known, so a slash hint naming a different adapter (e.g.
 * `anthropic/claude-cli` against an `anthropic_sdk` identity) must NOT be
 * silently corroborated — that would hide the SDK-vs-OAuth split this refactor
 * exists to surface.
 */
export function routeHintMatches(hint: string, identity: RouteIdentity): boolean {
  if (
    hint === routeToken(identity) ||
    hint === identity.model_provider ||
    hint === identity.execution_adapter
  ) {
    return true;
  }
  if (identity.route_completeness === "complete") return false;
  const head = hint.split("/")[0] ?? hint;
  return head === identity.model_provider;
}
