import type { LlmAuthMode, RuntimeLlmProvider } from "../llm/model-switcher.js";
import type {
  ReviewExecutionRealization,
  ReviewHostRuntime,
} from "./artifact-types.js";
import type {
  ReviewExecutionHost,
  ReviewExecutionProfile,
  ReviewWorkerExecutor,
} from "./review-execution-profile.js";

type ReviewExecutionRouteHost = "codex" | "standalone";
type ReviewExecutionRouteProvider = RuntimeLlmProvider | "mock";

interface ReviewExecutionRouteProjection {
  host: ReviewExecutionRouteHost;
  executor: ReviewWorkerExecutor;
  resolved_provider: ReviewExecutionRouteProvider;
  auth_mode: LlmAuthMode | null;
  execution_realization: ReviewExecutionRealization;
  artifact_host_runtime: ReviewHostRuntime;
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
  if (isDirectCallHost(profile.host)) {
    if (profile.provider && profile.provider !== profile.host) {
      throw new Error(
        `Review direct-call route has conflicting provider authority: host=${profile.host}, provider=${profile.provider}.`,
      );
    }
    if (profile.auth === "oauth") {
      throw new Error(
        `Review direct-call route requires API-key/local auth; got auth=oauth for host=${profile.host}.`,
      );
    }
    return profile.host;
  }
  if (profile.provider) return profile.provider;
  throw new Error(
    `Review direct-call route requires an API/local provider host; got host=${profile.host}.`,
  );
}

export function buildReviewExecutionRoute(
  profile: ReviewExecutionProfile,
): ReviewExecutionRouteProjection {
  if (profile.worker_executor === "mock") {
    return {
      host: "standalone",
      executor: "mock",
      resolved_provider: "mock",
      auth_mode: null,
      execution_realization: "direct-call",
      artifact_host_runtime: "standalone",
    };
  }

  if (profile.worker_executor === "codex") {
    return {
      host: "codex",
      executor: "codex",
      resolved_provider: "codex",
      auth_mode: profile.auth ?? "oauth",
      execution_realization: "worker",
      artifact_host_runtime: "codex",
    };
  }

  const resolvedProvider = directCallProviderForProfile(profile);
  const artifactHostRuntime =
    isDirectCallHost(profile.host) ? profile.host : resolvedProvider;

  return {
    host: "standalone",
    executor: "direct_call",
    resolved_provider: resolvedProvider,
    auth_mode: profile.auth ?? null,
    execution_realization: "direct-call",
    artifact_host_runtime: artifactHostRuntime as ReviewHostRuntime,
  };
}
