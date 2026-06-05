import path from "node:path";
import type {
  ReviewActorInvocationProfilesArtifact,
  ReviewExecutionPlan,
  ReviewExecutionRealization,
  ReviewHostRuntime,
  ReviewStructuredFailureRecord,
} from "./artifact-types.js";
import { fileExists, readYamlDocument } from "./review-artifact-utils.js";

export interface ReviewRouteVisibility {
  schemaVersion: "1";
  source:
    | "review-run-manifest"
    | "execution-plan"
    | "failure-record";
  sessionId: string | null;
  sessionRoot: string | null;
  executionRealization: ReviewExecutionRealization | null;
  hostRuntime: ReviewHostRuntime | null;
  workerExecutor: string | null;
  runtimeProvider: string | null;
  authMode: string | null;
  actualHostRuntimes: ReviewHostRuntime[];
  routeConsistency:
    | "consistent"
    | "actual_mixed"
    | "profile_actual_conflict"
    | "unknown";
  actorRoute: {
    mode: "unknown" | "single" | "mixed";
    actorCount: number;
    hostRuntimes: string[];
    runtimeProviders: string[];
    authModes: string[];
    workerExecutors: string[];
  };
  actorProfiles: Array<{
    actorProfileId: string;
    actorKind: string;
    executionRealization: ReviewExecutionRealization;
    hostRuntime: ReviewHostRuntime;
    runtimeProvider: string | null;
    authMode: string | null;
    effectiveWorkerExecutor: string;
    model: string | null;
    effort: string | null;
    serviceTier: string | null;
  }>;
  actorProfileStatus: "available" | "missing" | "unreadable";
  artifactRefs: {
    executionPlan?: string;
    reviewRunManifest?: string;
    actorInvocationProfiles?: string;
    failureRecord?: string;
  };
}

interface ReviewRunManifestRouteProjection {
  session_id?: string;
  review_execution_profile?: {
    runtime_route?: {
      execution_realization?: ReviewExecutionRealization;
      host_runtime?: ReviewHostRuntime;
      worker_executor?: string;
      runtime_provider?: string;
      auth_mode?: string | null;
    };
  };
  artifact_refs?: {
    execution_plan?: string;
    actor_invocation_profiles?: string | null;
  };
  worker_units?: Array<{
    executor_host_runtime?: ReviewHostRuntime | null;
  }>;
}

interface ActorProfileReadResult {
  artifact: ReviewActorInvocationProfilesArtifact | null;
  status: ReviewRouteVisibility["actorProfileStatus"];
}

function toActorProfiles(
  artifact: ReviewActorInvocationProfilesArtifact | null,
): ReviewRouteVisibility["actorProfiles"] {
  if (artifact && !Array.isArray(artifact.profiles)) {
    throw new Error("actor invocation profiles artifact has non-array profiles");
  }
  return (artifact?.profiles ?? []).map((profile) => ({
    actorProfileId: requireString(profile.actor_profile_id, "actor_profile_id"),
    actorKind: requireString(profile.actor_kind, "actor_kind"),
    executionRealization: requireExecutionRealization(profile.execution_realization),
    hostRuntime: requireHostRuntime(profile.host_runtime),
    runtimeProvider: optionalString(profile.runtime_provider),
    authMode: optionalString(profile.auth_mode),
    effectiveWorkerExecutor: requireString(
      profile.effective_worker_executor,
      "effective_worker_executor",
    ),
    model: optionalString(profile.model),
    effort: optionalString(profile.effort),
    serviceTier: optionalString(profile.service_tier),
  }));
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`actor invocation profile missing ${label}`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function requireExecutionRealization(value: unknown): ReviewExecutionRealization {
  if (value === "worker" || value === "direct-call") return value;
  throw new Error("actor invocation profile has invalid execution_realization");
}

function requireHostRuntime(value: unknown): ReviewHostRuntime {
  if (
    value === "codex" ||
    value === "anthropic" ||
    value === "openai" ||
    value === "grok" ||
    value === "lmstudio" ||
    value === "standalone"
  ) {
    return value;
  }
  throw new Error("actor invocation profile has invalid host_runtime");
}

function sharedActorProfileString(
  profiles: ReviewRouteVisibility["actorProfiles"],
  pick: (profile: ReviewRouteVisibility["actorProfiles"][number]) => string | null,
): string | null {
  if (profiles.length === 0) return null;
  const [firstProfile] = profiles;
  if (!firstProfile) return null;
  const first = pick(firstProfile);
  return profiles.every((profile) => pick(profile) === first) ? first : null;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return [
    ...new Set(values.filter((value): value is string => typeof value === "string")),
  ].sort();
}

function buildActorRouteSummary(
  profiles: ReviewRouteVisibility["actorProfiles"],
): ReviewRouteVisibility["actorRoute"] {
  if (profiles.length === 0) {
    return {
      mode: "unknown",
      actorCount: 0,
      hostRuntimes: [],
      runtimeProviders: [],
      authModes: [],
      workerExecutors: [],
    };
  }
  const hostRuntimes = uniqueStrings(profiles.map((profile) => profile.hostRuntime));
  const runtimeProviders = uniqueStrings(
    profiles.map((profile) => profile.runtimeProvider),
  );
  const authModes = uniqueStrings(profiles.map((profile) => profile.authMode));
  const workerExecutors = uniqueStrings(
    profiles.map((profile) => profile.effectiveWorkerExecutor),
  );
  return {
    mode:
      hostRuntimes.length <= 1 &&
      runtimeProviders.length <= 1 &&
      authModes.length <= 1 &&
      workerExecutors.length <= 1
        ? "single"
        : "mixed",
    actorCount: profiles.length,
    hostRuntimes,
    runtimeProviders,
    authModes,
    workerExecutors,
  };
}

function actorProfilesOrManifestRouteString(
  profiles: ReviewRouteVisibility["actorProfiles"],
  manifestValue: string | null | undefined,
  pick: (profile: ReviewRouteVisibility["actorProfiles"][number]) => string | null,
): string | null {
  return profiles.length > 0
    ? sharedActorProfileString(profiles, pick)
    : manifestValue ?? null;
}

function providerCompatibleWithActualHost(
  actualHostRuntime: ReviewHostRuntime,
  runtimeProvider: string | null,
): boolean {
  if (runtimeProvider === null) return true;
  if (actualHostRuntime === "codex") return runtimeProvider === "codex";
  if (actualHostRuntime === "standalone") return runtimeProvider === "mock";
  return runtimeProvider === actualHostRuntime;
}

function authCompatibleWithActualHost(
  actualHostRuntime: ReviewHostRuntime,
  authMode: string | null,
): boolean {
  if (authMode === null) return true;
  if (actualHostRuntime === "codex") return authMode === "oauth";
  if (actualHostRuntime === "lmstudio") return authMode === "local";
  if (
    actualHostRuntime === "openai" ||
    actualHostRuntime === "anthropic" ||
    actualHostRuntime === "grok"
  ) {
    return authMode === "api_key";
  }
  return false;
}

async function readActorProfiles(
  actorProfilesPath: string | null,
): Promise<ActorProfileReadResult> {
  if (!actorProfilesPath || !(await fileExists(actorProfilesPath))) {
    return { artifact: null, status: "missing" };
  }
  try {
    return {
      artifact: await readYamlDocument<ReviewActorInvocationProfilesArtifact>(
        actorProfilesPath,
      ),
      status: "available",
    };
  } catch {
    return { artifact: null, status: "unreadable" };
  }
}

function manifestActualHostRuntimes(
  manifest: ReviewRunManifestRouteProjection,
): ReviewHostRuntime[] {
  return [
    ...new Set(
      (manifest.worker_units ?? [])
        .map((unit) => unit.executor_host_runtime)
        .filter((value): value is ReviewHostRuntime => typeof value === "string"),
    ),
  ].sort();
}

function routeConsistency(args: {
  actorRoute: ReviewRouteVisibility["actorRoute"];
  actualHostRuntimes: ReviewHostRuntime[];
  manifestHostRuntime?: ReviewHostRuntime | null;
  runtimeProviders: string[];
  authModes: string[];
}): ReviewRouteVisibility["routeConsistency"] {
  if (args.actualHostRuntimes.length === 0) return "unknown";
  if (args.actualHostRuntimes.length > 1) return "actual_mixed";
  const [actualHostRuntime] = args.actualHostRuntimes;
  if (
    actualHostRuntime &&
    args.manifestHostRuntime &&
    args.manifestHostRuntime !== actualHostRuntime
  ) {
    return "profile_actual_conflict";
  }
  if (
    actualHostRuntime &&
    args.actorRoute.hostRuntimes.length > 0 &&
    !args.actorRoute.hostRuntimes.includes(actualHostRuntime)
  ) {
    return "profile_actual_conflict";
  }
  if (
    actualHostRuntime &&
    (args.runtimeProviders.some(
      (runtimeProvider) =>
        !providerCompatibleWithActualHost(actualHostRuntime, runtimeProvider),
    ) ||
      args.authModes.some(
        (authMode) => !authCompatibleWithActualHost(actualHostRuntime, authMode),
      ))
  ) {
    return "profile_actual_conflict";
  }
  return "consistent";
}

function executionPlanPathFromSession(sessionRoot: string): string {
  return path.join(sessionRoot, "execution-plan.yaml");
}

function actorProfilesPathFromSession(sessionRoot: string): string {
  return path.join(
    sessionRoot,
    "execution-preparation",
    "actor-invocation-profiles.yaml",
  );
}

function reviewRunManifestPathFromSession(sessionRoot: string): string {
  return path.join(sessionRoot, "review-run-manifest.yaml");
}

export async function buildReviewRouteVisibilityFromSession(
  sessionRoot: string,
): Promise<ReviewRouteVisibility | null> {
  const resolvedSessionRoot = path.resolve(sessionRoot);
  const reviewRunManifestPath = reviewRunManifestPathFromSession(resolvedSessionRoot);
  if (await fileExists(reviewRunManifestPath)) {
    const manifest =
      await readYamlDocument<ReviewRunManifestRouteProjection>(
        reviewRunManifestPath,
      );
    const route = manifest.review_execution_profile?.runtime_route;
    const executionPlanPath =
      manifest.artifact_refs?.execution_plan ??
      executionPlanPathFromSession(resolvedSessionRoot);
    const actorProfilesPath =
      manifest.artifact_refs?.actor_invocation_profiles ??
      actorProfilesPathFromSession(resolvedSessionRoot);
    const actorProfileRead = await readActorProfiles(actorProfilesPath);
    let actorProfiles: ReviewRouteVisibility["actorProfiles"] = [];
    let actorProfileStatus = actorProfileRead.status;
    try {
      actorProfiles = toActorProfiles(actorProfileRead.artifact);
    } catch {
      actorProfiles = [];
      actorProfileStatus = "unreadable";
    }
    const actorRoute = buildActorRouteSummary(actorProfiles);
    const actualHostRuntimes = manifestActualHostRuntimes(manifest);
    const profiledManifestHostRuntime = route?.host_runtime ?? null;
    const manifestHostRuntime =
      actualHostRuntimes.length === 1
        ? actualHostRuntimes[0] ?? null
        : route?.host_runtime;
    const topLevelHostRuntime =
      actualHostRuntimes.length > 0
        ? actualHostRuntimes.length === 1
          ? actualHostRuntimes[0] ?? null
          : null
        : actorRoute.mode === "mixed"
          ? null
          : actorProfilesOrManifestRouteString(
              actorProfiles,
              manifestHostRuntime,
              (profile) => profile.hostRuntime,
            ) as ReviewHostRuntime | null;
    const candidateRuntimeProvider = actorProfilesOrManifestRouteString(
      actorProfiles,
      route?.runtime_provider,
      (profile) => profile.runtimeProvider,
    );
    const candidateAuthMode = actorProfilesOrManifestRouteString(
      actorProfiles,
      route?.auth_mode,
      (profile) => profile.authMode,
    );
    const runtimeProvidersToValidate = uniqueStrings([
      typeof route?.runtime_provider === "string" ? route.runtime_provider : null,
      ...actorRoute.runtimeProviders,
    ]);
    const authModesToValidate = uniqueStrings([
      typeof route?.auth_mode === "string" ? route.auth_mode : null,
      ...actorRoute.authModes,
    ]);
    const consistency = routeConsistency({
      actorRoute,
      actualHostRuntimes,
      manifestHostRuntime: profiledManifestHostRuntime,
      runtimeProviders: runtimeProvidersToValidate,
      authModes: authModesToValidate,
    });
    const suppressProfileRouteFields =
      consistency === "profile_actual_conflict" ||
      consistency === "actual_mixed";
    return {
      schemaVersion: "1",
      source: "review-run-manifest",
      sessionId: manifest.session_id ?? path.basename(resolvedSessionRoot),
      sessionRoot: resolvedSessionRoot,
      executionRealization: route?.execution_realization ?? null,
      hostRuntime: topLevelHostRuntime,
      workerExecutor: actorProfilesOrManifestRouteString(
        actorProfiles,
        route?.worker_executor,
        (profile) => profile.effectiveWorkerExecutor,
      ),
      runtimeProvider: suppressProfileRouteFields
        ? null
        : candidateRuntimeProvider,
      authMode: suppressProfileRouteFields
        ? null
        : candidateAuthMode,
      actualHostRuntimes,
      routeConsistency: consistency,
      actorRoute,
      actorProfiles,
      actorProfileStatus,
      artifactRefs: {
        executionPlan: executionPlanPath,
        reviewRunManifest: reviewRunManifestPath,
        ...(actorProfilesPath ? { actorInvocationProfiles: actorProfilesPath } : {}),
      },
    };
  }

  const executionPlanPath = executionPlanPathFromSession(resolvedSessionRoot);
  if (await fileExists(executionPlanPath)) {
    const executionPlan = await readYamlDocument<ReviewExecutionPlan>(
      executionPlanPath,
    );
    const actorProfilesPath =
      executionPlan.actor_invocation_profiles_path ??
      actorProfilesPathFromSession(resolvedSessionRoot);
    const actorProfileRead = await readActorProfiles(actorProfilesPath);
    let actorProfiles: ReviewRouteVisibility["actorProfiles"] = [];
    let actorProfileStatus = actorProfileRead.status;
    try {
      actorProfiles = toActorProfiles(actorProfileRead.artifact);
    } catch {
      actorProfiles = [];
      actorProfileStatus = "unreadable";
    }
    const actorRoute = buildActorRouteSummary(actorProfiles);
    return {
      schemaVersion: "1",
      source: "execution-plan",
      sessionId: executionPlan.session_id,
      sessionRoot: resolvedSessionRoot,
      executionRealization: executionPlan.execution_realization,
      hostRuntime: actorRoute.mode === "mixed" ? null : executionPlan.host_runtime,
      workerExecutor: sharedActorProfileString(
        actorProfiles,
        (profile) => profile.effectiveWorkerExecutor,
      ),
      runtimeProvider: sharedActorProfileString(
        actorProfiles,
        (profile) => profile.runtimeProvider,
      ),
      authMode: sharedActorProfileString(
        actorProfiles,
        (profile) => profile.authMode,
      ),
      actualHostRuntimes: [],
      routeConsistency: "unknown",
      actorRoute,
      actorProfiles,
      actorProfileStatus,
      artifactRefs: {
        executionPlan: executionPlanPath,
        ...(actorProfilesPath ? { actorInvocationProfiles: actorProfilesPath } : {}),
      },
    };
  }

  return null;
}

export async function buildReviewRouteVisibilityFromFailure(
  failureRecord: ReviewStructuredFailureRecord,
  failureRecordPath?: string | null,
): Promise<ReviewRouteVisibility | null> {
  const executionPlanRef = failureRecord.artifact_refs.execution_plan;
  if (executionPlanRef) {
    const sessionRouteVisibility =
      await buildReviewRouteVisibilityFromSession(path.dirname(executionPlanRef));
    if (sessionRouteVisibility) {
      return {
        ...sessionRouteVisibility,
        artifactRefs: {
          ...sessionRouteVisibility.artifactRefs,
          ...(failureRecordPath ? { failureRecord: failureRecordPath } : {}),
        },
      };
    }
  }

  if (!failureRecordPath) return null;
  return {
    schemaVersion: "1",
    source: "failure-record",
    sessionId: null,
    sessionRoot: null,
    executionRealization: null,
    hostRuntime: null,
    workerExecutor: null,
    runtimeProvider: null,
    authMode: null,
    actualHostRuntimes: [],
    routeConsistency: "unknown",
    actorRoute: buildActorRouteSummary([]),
    actorProfiles: [],
    actorProfileStatus: "missing",
    artifactRefs: {
      failureRecord: failureRecordPath,
    },
  };
}
