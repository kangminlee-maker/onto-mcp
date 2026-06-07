import path from "node:path";
import type {
  ReviewActorInvocationProfilesArtifact,
  ReviewExecutionPlan,
  ReviewExecutionRealization,
  ReviewHostRuntime,
  ReviewStructuredFailureRecord,
} from "./artifact-types.js";
import type {
  LlmBillingMode,
  LlmExecutionAdapter,
  LlmExecutionRoute,
  LlmProviderName,
  LlmWireFormat,
} from "../llm/model-switcher.js";
import { fileExists, readYamlDocument } from "./review-artifact-utils.js";

export interface ReviewRouteVisibility {
  schemaVersion: "1";
  source:
    | "review-run-manifest"
    | "execution-plan"
    | "failure-record";
  sessionId: string | null;
  sessionRoot: string | null;
  executionRoute: LlmExecutionRoute | null;
  executionAdapter: LlmExecutionAdapter | null;
  modelProvider: LlmProviderName | null;
  modelId: string | null;
  baseUrl: string | null;
  wireFormat: LlmWireFormat | null;
  billingMode: LlmBillingMode | null;
  /** Legacy compatibility projection. Prefer executionRoute/executionAdapter/modelProvider. */
  executionRealization: ReviewExecutionRealization | null;
  /** Legacy compatibility projection. Prefer executionRoute/executionAdapter/modelProvider. */
  hostRuntime: ReviewHostRuntime | null;
  /** Legacy compatibility projection. Prefer executionRoute/executionAdapter/modelProvider. */
  workerExecutor: string | null;
  /** Legacy compatibility projection. Prefer modelProvider. */
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
    executionRoutes: string[];
    executionAdapters: string[];
    modelProviders: string[];
    billingModes: string[];
    authModes: string[];
    workerExecutors: string[];
  };
  actorProfiles: Array<{
    actorProfileId: string;
    actorKind: string;
    executionRoute: LlmExecutionRoute | null;
    executionAdapter: LlmExecutionAdapter | null;
    modelProvider: LlmProviderName | null;
    billingMode: LlmBillingMode | null;
    wireFormat: LlmWireFormat | null;
    executionRealization: ReviewExecutionRealization;
    hostRuntime: ReviewHostRuntime;
    runtimeProvider: string | null;
    authMode: string | null;
    effectiveWorkerExecutor: string;
    model: string | null;
    baseUrl: string | null;
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
      execution_route?: unknown;
      execution_adapter?: unknown;
      model_provider?: unknown;
      model_id?: unknown;
      base_url?: unknown;
      wire_format?: unknown;
      billing_mode?: unknown;
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
    unit_id?: string | null;
    unit_kind?: string | null;
    executor_host_runtime?: ReviewHostRuntime | null;
  }>;
}

interface ReviewRunManifestWorkerRouteUnit {
  unitId: string | null;
  unitKind: string | null;
  executorHostRuntime: ReviewHostRuntime;
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
    executionRoute: optionalExecutionRoute(profile.execution_route),
    executionAdapter: optionalExecutionAdapter(profile.execution_adapter),
    modelProvider: optionalModelProvider(profile.model_provider),
    billingMode: optionalBillingMode(profile.billing_mode),
    wireFormat: optionalWireFormat(profile.wire_format),
    executionRealization: requireExecutionRealization(profile.execution_realization),
    hostRuntime: requireHostRuntime(profile.host_runtime),
    runtimeProvider: optionalString(profile.runtime_provider),
    authMode: optionalString(profile.auth_mode),
    effectiveWorkerExecutor: requireString(
      profile.effective_worker_executor,
      "effective_worker_executor",
    ),
    model: optionalString(profile.model),
    baseUrl: optionalString(profile.base_url),
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

function optionalExecutionRoute(value: unknown): LlmExecutionRoute | null {
  if (value === "external_oauth_worker" || value === "direct_model_call") {
    return value;
  }
  return null;
}

function optionalExecutionAdapter(value: unknown): LlmExecutionAdapter | null {
  if (
    value === "codex_cli" ||
    value === "claude_code" ||
    value === "openai_sdk" ||
    value === "anthropic_sdk" ||
    value === "openai_compatible_http"
  ) {
    return value;
  }
  return null;
}

function optionalModelProvider(value: unknown): LlmProviderName | null {
  if (
    value === "openai" ||
    value === "anthropic" ||
    value === "grok" ||
    value === "lmstudio"
  ) {
    return value;
  }
  return null;
}

function optionalWireFormat(value: unknown): LlmWireFormat | null {
  if (value === "native_sdk" || value === "openai_compatible") return value;
  return null;
}

function optionalBillingMode(value: unknown): LlmBillingMode | null {
  if (value === "subscription" || value === "per_token" || value === "local") {
    return value;
  }
  return null;
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
      executionRoutes: [],
      executionAdapters: [],
      modelProviders: [],
      billingModes: [],
      authModes: [],
      workerExecutors: [],
    };
  }
  const hostRuntimes = uniqueStrings(profiles.map((profile) => profile.hostRuntime));
  const runtimeProviders = uniqueStrings(
    profiles.map((profile) => profile.runtimeProvider),
  );
  const executionRoutes = uniqueStrings(
    profiles.map((profile) => profile.executionRoute),
  );
  const executionAdapters = uniqueStrings(
    profiles.map((profile) => profile.executionAdapter),
  );
  const modelProviders = uniqueStrings(
    profiles.map((profile) => profile.modelProvider),
  );
  const billingModes = uniqueStrings(
    profiles.map((profile) => profile.billingMode),
  );
  const authModes = uniqueStrings(profiles.map((profile) => profile.authMode));
  const workerExecutors = uniqueStrings(
    profiles.map((profile) => profile.effectiveWorkerExecutor),
  );
  return {
    mode:
      hostRuntimes.length <= 1 &&
      runtimeProviders.length <= 1 &&
      executionRoutes.length <= 1 &&
      executionAdapters.length <= 1 &&
      modelProviders.length <= 1 &&
      billingModes.length <= 1 &&
      authModes.length <= 1 &&
      workerExecutors.length <= 1
        ? "single"
        : "mixed",
    actorCount: profiles.length,
    hostRuntimes,
    runtimeProviders,
    executionRoutes,
    executionAdapters,
    modelProviders,
    billingModes,
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
  if (actualHostRuntime === "standalone") return false;
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

function manifestActualWorkerRouteUnits(
  manifest: ReviewRunManifestRouteProjection,
): ReviewRunManifestWorkerRouteUnit[] {
  return (manifest.worker_units ?? [])
    .map((unit) => ({
      unitId: optionalString(unit.unit_id),
      unitKind: optionalString(unit.unit_kind),
      executorHostRuntime: unit.executor_host_runtime,
    }))
    .filter(
      (unit): unit is ReviewRunManifestWorkerRouteUnit =>
        typeof unit.executorHostRuntime === "string",
    );
}

function uniqueActualHostRuntimes(
  units: ReviewRunManifestWorkerRouteUnit[],
): ReviewHostRuntime[] {
  return [
    ...new Set(
      units.map((unit) => unit.executorHostRuntime),
    ),
  ].sort();
}

function actorKindForWorkerUnit(
  unit: ReviewRunManifestWorkerRouteUnit,
): string | null {
  if (unit.unitKind === "lens") return "lens";
  if (unit.unitKind === "synthesize") return "synthesize";
  if (unit.unitKind === "issue_artifact") return "teamlead";
  if (unit.unitKind === "deliberation") {
    return unit.unitId === "controlled-deliberation" ? "teamlead" : "lens";
  }
  return null;
}

function actualMixedConsistency(args: {
  actualWorkerUnits: ReviewRunManifestWorkerRouteUnit[];
  actorProfiles: ReviewRouteVisibility["actorProfiles"];
}): ReviewRouteVisibility["routeConsistency"] {
  if (args.actorProfiles.length === 0) return "actual_mixed";
  for (const unit of args.actualWorkerUnits) {
    const actorKind = actorKindForWorkerUnit(unit);
    if (!actorKind) return "actual_mixed";
    const profile = args.actorProfiles.find(
      (candidate) => candidate.actorKind === actorKind,
    );
    if (!profile) return "actual_mixed";
    if (profile.hostRuntime !== unit.executorHostRuntime) {
      return "profile_actual_conflict";
    }
    if (
      !providerCompatibleWithActualHost(
        unit.executorHostRuntime,
        profile.runtimeProvider,
      ) ||
      !authCompatibleWithActualHost(unit.executorHostRuntime, profile.authMode)
    ) {
      return "profile_actual_conflict";
    }
  }
  return "consistent";
}

function routeConsistency(args: {
  actorRoute: ReviewRouteVisibility["actorRoute"];
  actualHostRuntimes: ReviewHostRuntime[];
  actualWorkerUnits: ReviewRunManifestWorkerRouteUnit[];
  actorProfiles: ReviewRouteVisibility["actorProfiles"];
  manifestHostRuntime?: ReviewHostRuntime | null;
  runtimeProviders: string[];
  authModes: string[];
}): ReviewRouteVisibility["routeConsistency"] {
  if (args.actualHostRuntimes.length === 0) return "unknown";
  if (args.actualHostRuntimes.length > 1) {
    return actualMixedConsistency({
      actualWorkerUnits: args.actualWorkerUnits,
      actorProfiles: args.actorProfiles,
    });
  }
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
    const actualWorkerUnits = manifestActualWorkerRouteUnits(manifest);
    const actualHostRuntimes = uniqueActualHostRuntimes(actualWorkerUnits);
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
    const candidateExecutionRoute = actorProfilesOrManifestRouteString(
      actorProfiles,
      optionalExecutionRoute(route?.execution_route),
      (profile) => profile.executionRoute,
    ) as LlmExecutionRoute | null;
    const candidateExecutionAdapter = actorProfilesOrManifestRouteString(
      actorProfiles,
      optionalExecutionAdapter(route?.execution_adapter),
      (profile) => profile.executionAdapter,
    ) as LlmExecutionAdapter | null;
    const candidateModelProvider = actorProfilesOrManifestRouteString(
      actorProfiles,
      optionalModelProvider(route?.model_provider),
      (profile) => profile.modelProvider,
    ) as LlmProviderName | null;
    const candidateModelId = actorProfilesOrManifestRouteString(
      actorProfiles,
      optionalString(route?.model_id),
      (profile) => profile.model,
    );
    const candidateBaseUrl = actorProfilesOrManifestRouteString(
      actorProfiles,
      optionalString(route?.base_url),
      (profile) => profile.baseUrl,
    );
    const candidateWireFormat = actorProfilesOrManifestRouteString(
      actorProfiles,
      optionalWireFormat(route?.wire_format),
      (profile) => profile.wireFormat,
    ) as LlmWireFormat | null;
    const candidateBillingMode = actorProfilesOrManifestRouteString(
      actorProfiles,
      optionalBillingMode(route?.billing_mode),
      (profile) => profile.billingMode,
    ) as LlmBillingMode | null;
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
      actualWorkerUnits,
      actorProfiles,
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
      executionRoute: suppressProfileRouteFields ? null : candidateExecutionRoute,
      executionAdapter: suppressProfileRouteFields ? null : candidateExecutionAdapter,
      modelProvider: suppressProfileRouteFields ? null : candidateModelProvider,
      modelId: suppressProfileRouteFields ? null : candidateModelId,
      baseUrl: suppressProfileRouteFields ? null : candidateBaseUrl,
      wireFormat: suppressProfileRouteFields ? null : candidateWireFormat,
      billingMode: suppressProfileRouteFields ? null : candidateBillingMode,
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
      executionRoute: sharedActorProfileString(
        actorProfiles,
        (profile) => profile.executionRoute,
      ) as LlmExecutionRoute | null,
      executionAdapter: sharedActorProfileString(
        actorProfiles,
        (profile) => profile.executionAdapter,
      ) as LlmExecutionAdapter | null,
      modelProvider: sharedActorProfileString(
        actorProfiles,
        (profile) => profile.modelProvider,
      ) as LlmProviderName | null,
      modelId: sharedActorProfileString(
        actorProfiles,
        (profile) => profile.model,
      ),
      baseUrl: sharedActorProfileString(
        actorProfiles,
        (profile) => profile.baseUrl,
      ),
      wireFormat: sharedActorProfileString(
        actorProfiles,
        (profile) => profile.wireFormat,
      ) as LlmWireFormat | null,
      billingMode: sharedActorProfileString(
        actorProfiles,
        (profile) => profile.billingMode,
      ) as LlmBillingMode | null,
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
    executionRoute: null,
    executionAdapter: null,
    modelProvider: null,
    modelId: null,
    baseUrl: null,
    wireFormat: null,
    billingMode: null,
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
