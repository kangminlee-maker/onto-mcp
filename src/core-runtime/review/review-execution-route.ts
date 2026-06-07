import type {
  LlmAuthMode,
  LlmBillingMode,
  LlmExecutionAdapter,
  LlmExecutionRoute,
  LlmProviderName,
  LlmWireFormat,
  RuntimeLlmProvider,
} from "../llm/model-switcher.js";
import type {
  ReviewArtifactGenerationRealization,
  ReviewExecutionRealization,
  ReviewHostRuntime,
} from "./artifact-types.js";
import type {
  ReviewExecutionHost,
  ReviewExecutionProfile,
  ReviewWorkerExecutor,
} from "./review-execution-profile.js";

type ReviewExecutionRouteHost = "codex" | "standalone";
type ReviewExecutionRouteProvider = RuntimeLlmProvider;

export interface ReviewExecutionRouteProjection {
  execution_route: LlmExecutionRoute;
  execution_adapter: LlmExecutionAdapter;
  model_provider: LlmProviderName | null;
  model_id?: string;
  base_url?: string;
  wire_format?: LlmWireFormat;
  billing_mode: LlmBillingMode;
  /** Legacy host projection kept for existing artifacts and continuation. */
  host: ReviewExecutionRouteHost;
  /** Legacy executor projection kept for existing artifacts and continuation. */
  executor: ReviewWorkerExecutor;
  /** Legacy provider projection kept for existing artifacts and continuation. */
  resolved_provider: ReviewExecutionRouteProvider;
  auth_mode: LlmAuthMode | null;
  execution_realization: ReviewExecutionRealization;
  artifact_host_runtime: ReviewHostRuntime;
  artifact_generation_realization: ReviewArtifactGenerationRealization;
}

export interface ReviewRuntimeRouteArtifactProjection {
  execution_route: LlmExecutionRoute;
  execution_adapter: LlmExecutionAdapter;
  model_provider: LlmProviderName | null;
  model_id?: string;
  base_url?: string;
  wire_format?: LlmWireFormat;
  billing_mode: LlmBillingMode;
  /** Legacy compatibility projection. Prefer execution_route. */
  execution_realization: ReviewExecutionRealization;
  /** Legacy compatibility projection. Prefer execution_adapter/model_provider. */
  host_runtime: ReviewHostRuntime;
  artifact_generation_realization: ReviewArtifactGenerationRealization;
  /** Legacy compatibility projection. Prefer execution_route. */
  worker_executor: ReviewWorkerExecutor;
  /** Legacy compatibility projection. Prefer model_provider/execution_adapter. */
  runtime_provider: ReviewExecutionRouteProvider;
  auth_mode: LlmAuthMode | null;
}

export function buildReviewRuntimeRouteArtifactProjection(
  route: ReviewExecutionRouteProjection,
): ReviewRuntimeRouteArtifactProjection {
  return {
    execution_route: route.execution_route,
    execution_adapter: route.execution_adapter,
    model_provider: route.model_provider,
    ...(route.model_id ? { model_id: route.model_id } : {}),
    ...(route.base_url ? { base_url: route.base_url } : {}),
    ...(route.wire_format ? { wire_format: route.wire_format } : {}),
    billing_mode: route.billing_mode,
    execution_realization: route.execution_realization,
    host_runtime: route.artifact_host_runtime,
    artifact_generation_realization: route.artifact_generation_realization,
    worker_executor: route.executor,
    runtime_provider: route.resolved_provider,
    auth_mode: route.auth_mode,
  };
}

function isDirectCallHost(
  host: ReviewExecutionHost,
): host is Extract<ReviewExecutionHost, "openai" | "anthropic" | "grok" | "lmstudio"> {
  return (
    host === "openai" ||
    host === "anthropic" ||
    host === "grok" ||
    host === "lmstudio"
  );
}

function directCallProviderForProfile(
  profile: ReviewExecutionProfile,
): ReviewExecutionRouteProvider {
  let provider: ReviewExecutionRouteProvider | null = null;
  if (isDirectCallHost(profile.host)) {
    if (profile.provider && profile.provider !== profile.host) {
      throw new Error(
        `Review direct-call route has conflicting provider authority: host=${profile.host}, provider=${profile.provider}.`,
      );
    }
    provider = profile.host;
  } else if (profile.provider) {
    provider = profile.provider;
  } else {
    throw new Error(
      `Review direct-call route requires an API/local provider host; got host=${profile.host}.`,
    );
  }
  if (profile.auth === "oauth") {
    throw new Error(
      `Review direct-call route requires API-key/local auth; got auth=oauth for host=${profile.host}.`,
    );
  }
  return provider;
}

function defaultDirectCallAuthMode(
  provider: ReviewExecutionRouteProvider,
): LlmAuthMode | null {
  if (provider === "lmstudio") return "local";
  return null;
}

function directCallAdapterForProvider(
  provider: ReviewExecutionRouteProvider,
): LlmExecutionAdapter {
  if (provider === "anthropic") return "anthropic_sdk";
  if (provider === "openai") return "openai_sdk";
  return "openai_compatible_http";
}

function wireFormatForDirectCall(
  provider: ReviewExecutionRouteProvider,
): LlmWireFormat {
  if (provider === "anthropic" || provider === "openai") return "native_sdk";
  return "openai_compatible";
}

function billingModeForDirectCall(
  provider: ReviewExecutionRouteProvider,
): LlmBillingMode {
  if (provider === "lmstudio") return "local";
  return "per_token";
}

export function buildReviewExecutionRoute(
  profile: ReviewExecutionProfile,
): ReviewExecutionRouteProjection {
  if (profile.worker_executor === "codex") {
    return {
      execution_route: "external_oauth_worker",
      execution_adapter: "codex_cli",
      model_provider: profile.provider ?? "openai",
      ...(profile.model ? { model_id: profile.model } : {}),
      billing_mode: "subscription",
      host: "codex",
      executor: "codex",
      resolved_provider: "codex",
      auth_mode: profile.auth ?? "oauth",
      execution_realization: "worker",
      artifact_host_runtime: "codex",
      artifact_generation_realization: profile.artifact_generation_realization,
    };
  }

  const resolvedProvider = directCallProviderForProfile(profile);
  const artifactHostRuntime =
    isDirectCallHost(profile.host) ? profile.host : resolvedProvider;

  return {
    execution_route: "direct_model_call",
    execution_adapter: directCallAdapterForProvider(resolvedProvider),
    model_provider: resolvedProvider === "codex" ? null : resolvedProvider,
    ...(profile.model ? { model_id: profile.model } : {}),
    ...(profile.base_url ? { base_url: profile.base_url } : {}),
    wire_format: wireFormatForDirectCall(resolvedProvider),
    billing_mode: billingModeForDirectCall(resolvedProvider),
    host: "standalone",
    executor: "direct_call",
    resolved_provider: resolvedProvider,
    auth_mode: profile.auth ?? defaultDirectCallAuthMode(resolvedProvider),
    execution_realization: "direct-call",
    artifact_host_runtime: artifactHostRuntime as ReviewHostRuntime,
    artifact_generation_realization: profile.artifact_generation_realization,
  };
}
