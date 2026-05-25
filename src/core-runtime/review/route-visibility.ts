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
}

function toActorProfiles(
  artifact: ReviewActorInvocationProfilesArtifact | null,
): ReviewRouteVisibility["actorProfiles"] {
  return (artifact?.profiles ?? []).map((profile) => ({
    actorProfileId: profile.actor_profile_id,
    actorKind: profile.actor_kind,
    executionRealization: profile.execution_realization,
    hostRuntime: profile.host_runtime,
    runtimeProvider: profile.runtime_provider,
    authMode: profile.auth_mode,
    effectiveWorkerExecutor: profile.effective_worker_executor,
    model: profile.model,
    effort: profile.effort,
    serviceTier: profile.service_tier,
  }));
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

async function readActorProfiles(
  actorProfilesPath: string | null,
): Promise<ReviewActorInvocationProfilesArtifact | null> {
  if (!actorProfilesPath || !(await fileExists(actorProfilesPath))) return null;
  return readYamlDocument<ReviewActorInvocationProfilesArtifact>(actorProfilesPath);
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
    const actorProfiles = await readActorProfiles(actorProfilesPath);
    return {
      schemaVersion: "1",
      source: "review-run-manifest",
      sessionId: manifest.session_id ?? path.basename(resolvedSessionRoot),
      sessionRoot: resolvedSessionRoot,
      executionRealization: route?.execution_realization ?? null,
      hostRuntime: route?.host_runtime ?? null,
      workerExecutor: route?.worker_executor ?? null,
      runtimeProvider: route?.runtime_provider ?? null,
      authMode: route?.auth_mode ?? null,
      actorProfiles: toActorProfiles(actorProfiles),
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
    const actorProfiles = toActorProfiles(
      await readActorProfiles(actorProfilesPath),
    );
    return {
      schemaVersion: "1",
      source: "execution-plan",
      sessionId: executionPlan.session_id,
      sessionRoot: resolvedSessionRoot,
      executionRealization: executionPlan.execution_realization,
      hostRuntime: executionPlan.host_runtime,
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
      actorProfiles,
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
    actorProfiles: [],
    artifactRefs: {
      failureRecord: failureRecordPath,
    },
  };
}
