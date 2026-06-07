import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildReviewRouteVisibilityFromSession } from "./route-visibility.js";

async function makeSessionRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "onto-route-visibility-"));
}

async function writePreparedSession(
  sessionRoot: string,
  actorProfileYaml: string,
): Promise<void> {
  const preparationRoot = path.join(sessionRoot, "execution-preparation");
  await fs.mkdir(preparationRoot, { recursive: true });
  const actorProfilesPath = path.join(
    preparationRoot,
    "actor-invocation-profiles.yaml",
  );
  await fs.writeFile(
    path.join(sessionRoot, "execution-plan.yaml"),
    [
      "session_id: route-visibility-test",
      `session_root: ${JSON.stringify(sessionRoot)}`,
      "execution_realization: direct-call",
      "host_runtime: openai",
      `actor_invocation_profiles_path: ${JSON.stringify(actorProfilesPath)}`,
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(actorProfilesPath, actorProfileYaml, "utf8");
}

describe("buildReviewRouteVisibilityFromSession", () => {
  it("keeps prepared-session top-level route fields only when actor profiles agree", async () => {
    const sessionRoot = await makeSessionRoot();
    await writePreparedSession(
      sessionRoot,
      [
        "schema_version: 1",
        "session_id: route-visibility-test",
        "profiles:",
        "  - actor_profile_id: teamlead",
        "    actor_kind: teamlead",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "    model: gpt-5.5",
        "    effort: medium",
        "    service_tier: fast",
        "  - actor_profile_id: synthesize",
        "    actor_kind: synthesize",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    runtime_provider: anthropic",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "    model: claude-opus-4",
        "    effort: xhigh",
        "    service_tier: null",
        "",
      ].join("\n"),
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.source).toBe("execution-plan");
    expect(visibility?.workerExecutor).toBe("direct_call");
    expect(visibility?.runtimeProvider).toBeNull();
    expect(visibility?.authMode).toBe("api_key");
    expect(visibility?.actorRoute.mode).toBe("mixed");
    expect(visibility?.actorRoute.runtimeProviders).toEqual([
      "anthropic",
      "openai",
    ]);
    expect(visibility?.actorProfiles).toHaveLength(2);
    expect(visibility?.actorProfileStatus).toBe("available");
  });

  it("reports prepared-session top-level route fields when actor profiles agree", async () => {
    const sessionRoot = await makeSessionRoot();
    await writePreparedSession(
      sessionRoot,
      [
        "schema_version: 1",
        "session_id: route-visibility-test",
        "profiles:",
        "  - actor_profile_id: teamlead",
        "    actor_kind: teamlead",
        "    execution_route: external_oauth_worker",
        "    execution_adapter: codex_cli",
        "    model_provider: openai",
        "    billing_mode: subscription",
        "    execution_realization: worker",
        "    host_runtime: codex",
        "    runtime_provider: codex",
        "    auth_mode: oauth",
        "    effective_worker_executor: codex",
        "    model: gpt-5.5",
        "    effort: medium",
        "    service_tier: fast",
        "  - actor_profile_id: lens",
        "    actor_kind: lens",
        "    execution_route: external_oauth_worker",
        "    execution_adapter: codex_cli",
        "    model_provider: openai",
        "    billing_mode: subscription",
        "    execution_realization: worker",
        "    host_runtime: codex",
        "    runtime_provider: codex",
        "    auth_mode: oauth",
        "    effective_worker_executor: codex",
        "    model: gpt-5.5",
        "    effort: medium",
        "    service_tier: fast",
        "",
      ].join("\n"),
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.workerExecutor).toBe("codex");
    expect(visibility?.runtimeProvider).toBe("codex");
    expect(visibility?.executionRoute).toBe("external_oauth_worker");
    expect(visibility?.executionAdapter).toBe("codex_cli");
    expect(visibility?.modelProvider).toBe("openai");
    expect(visibility?.modelId).toBe("gpt-5.5");
    expect(visibility?.billingMode).toBe("subscription");
    expect(visibility?.authMode).toBe("oauth");
    expect(visibility?.actorRoute.mode).toBe("single");
    expect(visibility?.actorRoute.executionRoutes).toEqual([
      "external_oauth_worker",
    ]);
    expect(visibility?.actorRoute.executionAdapters).toEqual(["codex_cli"]);
    expect(visibility?.actorRoute.modelProviders).toEqual(["openai"]);
    expect(visibility?.actorRoute.billingModes).toEqual(["subscription"]);
    expect(visibility?.actorProfiles[0]).toMatchObject({
      executionRoute: "external_oauth_worker",
      executionAdapter: "codex_cli",
      modelProvider: "openai",
      billingMode: "subscription",
    });
    expect(visibility?.actorProfileStatus).toBe("available");
  });

  it("does not expose a representative manifest provider when actor profiles are mixed", async () => {
    const sessionRoot = await makeSessionRoot();
    const preparationRoot = path.join(sessionRoot, "execution-preparation");
    await fs.mkdir(preparationRoot, { recursive: true });
    const actorProfilesPath = path.join(
      preparationRoot,
      "actor-invocation-profiles.yaml",
    );
    await fs.writeFile(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      [
        "session_id: route-visibility-test",
        "review_execution_profile:",
        "  runtime_route:",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    worker_executor: direct_call",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "artifact_refs:",
        `  actor_invocation_profiles: ${JSON.stringify(actorProfilesPath)}`,
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      actorProfilesPath,
      [
        "schema_version: 1",
        "session_id: route-visibility-test",
        "profiles:",
        "  - actor_profile_id: lens",
        "    actor_kind: lens",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "    model: gpt-5.5",
        "    effort: high",
        "    service_tier: null",
        "  - actor_profile_id: synthesize",
        "    actor_kind: synthesize",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    runtime_provider: anthropic",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "    model: claude-opus-4",
        "    effort: xhigh",
        "    service_tier: null",
        "",
      ].join("\n"),
      "utf8",
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.source).toBe("review-run-manifest");
    expect(visibility?.runtimeProvider).toBeNull();
    expect(visibility?.hostRuntime).toBeNull();
    expect(visibility?.workerExecutor).toBe("direct_call");
    expect(visibility?.actorRoute).toMatchObject({
      mode: "mixed",
      hostRuntimes: ["openai"],
      runtimeProviders: ["anthropic", "openai"],
    });
    expect(visibility?.actorProfileStatus).toBe("available");
  });

  it("reads canonical runtime route fields from manifest when actor profiles are missing", async () => {
    const sessionRoot = await makeSessionRoot();
    const missingActorProfilesPath = path.join(
      sessionRoot,
      "execution-preparation",
      "actor-invocation-profiles.yaml",
    );
    await fs.writeFile(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      [
        "session_id: route-visibility-test",
        "review_execution_profile:",
        "  runtime_route:",
        "    execution_route: direct_model_call",
        "    execution_adapter: openai_sdk",
        "    model_provider: openai",
        "    model_id: gpt-5.5",
        "    wire_format: native_sdk",
        "    billing_mode: per_token",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    worker_executor: direct_call",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "artifact_refs:",
        `  actor_invocation_profiles: ${JSON.stringify(missingActorProfilesPath)}`,
        "",
      ].join("\n"),
      "utf8",
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.source).toBe("review-run-manifest");
    expect(visibility?.executionRoute).toBe("direct_model_call");
    expect(visibility?.executionAdapter).toBe("openai_sdk");
    expect(visibility?.modelProvider).toBe("openai");
    expect(visibility?.modelId).toBe("gpt-5.5");
    expect(visibility?.wireFormat).toBe("native_sdk");
    expect(visibility?.billingMode).toBe("per_token");
    expect(visibility?.runtimeProvider).toBe("openai");
    expect(visibility?.actorProfileStatus).toBe("missing");
  });

  it("uses actual worker unit host runtimes when actor profiles are missing", async () => {
    const sessionRoot = await makeSessionRoot();
    const missingActorProfilesPath = path.join(
      sessionRoot,
      "execution-preparation",
      "actor-invocation-profiles.yaml",
    );
    await fs.writeFile(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      [
        "session_id: route-visibility-test",
        "review_execution_profile:",
        "  runtime_route:",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    worker_executor: direct_call",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "artifact_refs:",
        `  actor_invocation_profiles: ${JSON.stringify(missingActorProfilesPath)}`,
        "worker_units:",
        "  - unit_id: logic",
        "    executor_host_runtime: openai",
        "  - unit_id: synthesize",
        "    executor_host_runtime: anthropic",
        "",
      ].join("\n"),
      "utf8",
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.source).toBe("review-run-manifest");
    expect(visibility?.actorProfileStatus).toBe("missing");
    expect(visibility?.actorRoute.mode).toBe("unknown");
    expect(visibility?.hostRuntime).toBeNull();
    expect(visibility?.actualHostRuntimes).toEqual(["anthropic", "openai"]);
    expect(visibility?.routeConsistency).toBe("actual_mixed");
  });

  it("treats mixed actual worker runtimes as consistent when actor profiles match each unit kind", async () => {
    const sessionRoot = await makeSessionRoot();
    const preparationRoot = path.join(sessionRoot, "execution-preparation");
    await fs.mkdir(preparationRoot, { recursive: true });
    const actorProfilesPath = path.join(
      preparationRoot,
      "actor-invocation-profiles.yaml",
    );
    await fs.writeFile(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      [
        "session_id: route-visibility-test",
        "review_execution_profile:",
        "  runtime_route:",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    worker_executor: direct_call",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "artifact_refs:",
        `  actor_invocation_profiles: ${JSON.stringify(actorProfilesPath)}`,
        "worker_units:",
        "  - unit_id: logic",
        "    unit_kind: lens",
        "    executor_host_runtime: openai",
        "  - unit_id: synthesize",
        "    unit_kind: synthesize",
        "    executor_host_runtime: anthropic",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      actorProfilesPath,
      [
        "schema_version: 1",
        "session_id: route-visibility-test",
        "profiles:",
        "  - actor_profile_id: lens",
        "    actor_kind: lens",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "    model: gpt-5.5",
        "    effort: high",
        "    service_tier: null",
        "  - actor_profile_id: synthesize",
        "    actor_kind: synthesize",
        "    execution_realization: direct-call",
        "    host_runtime: anthropic",
        "    runtime_provider: anthropic",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "    model: claude-opus-4",
        "    effort: high",
        "    service_tier: null",
        "",
      ].join("\n"),
      "utf8",
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.actualHostRuntimes).toEqual(["anthropic", "openai"]);
    expect(visibility?.routeConsistency).toBe("consistent");
    expect(visibility?.hostRuntime).toBeNull();
    expect(visibility?.runtimeProvider).toBeNull();
    expect(visibility?.authMode).toBe("api_key");
  });

  it("flags actual worker host conflict with manifest route when actor profiles are missing", async () => {
    const sessionRoot = await makeSessionRoot();
    const missingActorProfilesPath = path.join(
      sessionRoot,
      "execution-preparation",
      "actor-invocation-profiles.yaml",
    );
    await fs.writeFile(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      [
        "session_id: route-visibility-test",
        "review_execution_profile:",
        "  runtime_route:",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    worker_executor: direct_call",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "artifact_refs:",
        `  actor_invocation_profiles: ${JSON.stringify(missingActorProfilesPath)}`,
        "worker_units:",
        "  - unit_id: synthesize",
        "    executor_host_runtime: anthropic",
        "",
      ].join("\n"),
      "utf8",
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.actorProfileStatus).toBe("missing");
    expect(visibility?.actualHostRuntimes).toEqual(["anthropic"]);
    expect(visibility?.hostRuntime).toBe("anthropic");
    expect(visibility?.runtimeProvider).toBeNull();
    expect(visibility?.authMode).toBeNull();
    expect(visibility?.routeConsistency).toBe("profile_actual_conflict");
  });

  it("flags stale manifest provider and auth when actual worker host is known", async () => {
    const sessionRoot = await makeSessionRoot();
    const missingActorProfilesPath = path.join(
      sessionRoot,
      "execution-preparation",
      "actor-invocation-profiles.yaml",
    );
    await fs.writeFile(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      [
        "session_id: route-visibility-test",
        "review_execution_profile:",
        "  runtime_route:",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    worker_executor: direct_call",
        "    runtime_provider: anthropic",
        "    auth_mode: oauth",
        "artifact_refs:",
        `  actor_invocation_profiles: ${JSON.stringify(missingActorProfilesPath)}`,
        "worker_units:",
        "  - unit_id: synthesize",
        "    executor_host_runtime: openai",
        "",
      ].join("\n"),
      "utf8",
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.actorProfileStatus).toBe("missing");
    expect(visibility?.actualHostRuntimes).toEqual(["openai"]);
    expect(visibility?.hostRuntime).toBe("openai");
    expect(visibility?.runtimeProvider).toBeNull();
    expect(visibility?.authMode).toBeNull();
    expect(visibility?.routeConsistency).toBe("profile_actual_conflict");
  });

  it("flags stale manifest provider and auth even when actor profiles agree", async () => {
    const sessionRoot = await makeSessionRoot();
    const preparationRoot = path.join(sessionRoot, "execution-preparation");
    await fs.mkdir(preparationRoot, { recursive: true });
    const actorProfilesPath = path.join(
      preparationRoot,
      "actor-invocation-profiles.yaml",
    );
    await fs.writeFile(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      [
        "session_id: route-visibility-test",
        "review_execution_profile:",
        "  runtime_route:",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    worker_executor: direct_call",
        "    runtime_provider: anthropic",
        "    auth_mode: oauth",
        "artifact_refs:",
        `  actor_invocation_profiles: ${JSON.stringify(actorProfilesPath)}`,
        "worker_units:",
        "  - unit_id: synthesize",
        "    executor_host_runtime: openai",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      actorProfilesPath,
      [
        "schema_version: 1",
        "session_id: route-visibility-test",
        "profiles:",
        "  - actor_profile_id: synthesize",
        "    actor_kind: synthesize",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "    model: gpt-5.5",
        "    effort: high",
        "    service_tier: null",
        "",
      ].join("\n"),
      "utf8",
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.actorProfileStatus).toBe("available");
    expect(visibility?.actualHostRuntimes).toEqual(["openai"]);
    expect(visibility?.hostRuntime).toBe("openai");
    expect(visibility?.runtimeProvider).toBeNull();
    expect(visibility?.authMode).toBeNull();
    expect(visibility?.routeConsistency).toBe("profile_actual_conflict");
  });

  it("flags incompatible actor provider when actual worker host is known", async () => {
    const sessionRoot = await makeSessionRoot();
    const preparationRoot = path.join(sessionRoot, "execution-preparation");
    await fs.mkdir(preparationRoot, { recursive: true });
    const actorProfilesPath = path.join(
      preparationRoot,
      "actor-invocation-profiles.yaml",
    );
    await fs.writeFile(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      [
        "session_id: route-visibility-test",
        "review_execution_profile:",
        "  runtime_route:",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    worker_executor: direct_call",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "artifact_refs:",
        `  actor_invocation_profiles: ${JSON.stringify(actorProfilesPath)}`,
        "worker_units:",
        "  - unit_id: synthesize",
        "    executor_host_runtime: openai",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      actorProfilesPath,
      [
        "schema_version: 1",
        "session_id: route-visibility-test",
        "profiles:",
        "  - actor_profile_id: lens",
        "    actor_kind: lens",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    runtime_provider: anthropic",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "    model: claude-opus-4",
        "    effort: high",
        "    service_tier: null",
        "  - actor_profile_id: synthesize",
        "    actor_kind: synthesize",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "    model: gpt-5.5",
        "    effort: high",
        "    service_tier: null",
        "",
      ].join("\n"),
      "utf8",
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.actorProfileStatus).toBe("available");
    expect(visibility?.actualHostRuntimes).toEqual(["openai"]);
    expect(visibility?.hostRuntime).toBe("openai");
    expect(visibility?.runtimeProvider).toBeNull();
    expect(visibility?.authMode).toBeNull();
    expect(visibility?.routeConsistency).toBe("profile_actual_conflict");
  });

  it("flags actual worker host conflict with manifest route when actor profiles are unreadable", async () => {
    const sessionRoot = await makeSessionRoot();
    const preparationRoot = path.join(sessionRoot, "execution-preparation");
    await fs.mkdir(preparationRoot, { recursive: true });
    const actorProfilesPath = path.join(
      preparationRoot,
      "actor-invocation-profiles.yaml",
    );
    await fs.writeFile(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      [
        "session_id: route-visibility-test",
        "review_execution_profile:",
        "  runtime_route:",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    worker_executor: direct_call",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "artifact_refs:",
        `  actor_invocation_profiles: ${JSON.stringify(actorProfilesPath)}`,
        "worker_units:",
        "  - unit_id: synthesize",
        "    executor_host_runtime: anthropic",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(actorProfilesPath, "profiles: not-an-array\n", "utf8");

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.actorProfileStatus).toBe("unreadable");
    expect(visibility?.actualHostRuntimes).toEqual(["anthropic"]);
    expect(visibility?.hostRuntime).toBe("anthropic");
    expect(visibility?.runtimeProvider).toBeNull();
    expect(visibility?.authMode).toBeNull();
    expect(visibility?.routeConsistency).toBe("profile_actual_conflict");
  });

  it("prefers actual worker host runtime over conflicting actor profiles", async () => {
    const sessionRoot = await makeSessionRoot();
    const preparationRoot = path.join(sessionRoot, "execution-preparation");
    await fs.mkdir(preparationRoot, { recursive: true });
    const actorProfilesPath = path.join(
      preparationRoot,
      "actor-invocation-profiles.yaml",
    );
    await fs.writeFile(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      [
        "session_id: route-visibility-test",
        "review_execution_profile:",
        "  runtime_route:",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    worker_executor: direct_call",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "artifact_refs:",
        `  actor_invocation_profiles: ${JSON.stringify(actorProfilesPath)}`,
        "worker_units:",
        "  - unit_id: synthesize",
        "    executor_host_runtime: anthropic",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      actorProfilesPath,
      [
        "schema_version: 1",
        "session_id: route-visibility-test",
        "profiles:",
        "  - actor_profile_id: synthesize",
        "    actor_kind: synthesize",
        "    execution_realization: direct-call",
        "    host_runtime: openai",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "    model: gpt-5.5",
        "    effort: high",
        "    service_tier: null",
        "",
      ].join("\n"),
      "utf8",
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.actorProfileStatus).toBe("available");
    expect(visibility?.actorRoute.mode).toBe("single");
    expect(visibility?.actorRoute.hostRuntimes).toEqual(["openai"]);
    expect(visibility?.actualHostRuntimes).toEqual(["anthropic"]);
    expect(visibility?.hostRuntime).toBe("anthropic");
    expect(visibility?.runtimeProvider).toBeNull();
    expect(visibility?.authMode).toBeNull();
    expect(visibility?.routeConsistency).toBe("profile_actual_conflict");
  });

  it("marks schema-invalid actor profiles as unreadable", async () => {
    const sessionRoot = await makeSessionRoot();
    await writePreparedSession(
      sessionRoot,
      [
        "schema_version: 1",
        "session_id: route-visibility-test",
        "profiles: not-an-array",
        "",
      ].join("\n"),
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.actorProfileStatus).toBe("unreadable");
    expect(visibility?.actorRoute.mode).toBe("unknown");
    expect(visibility?.actorProfiles).toEqual([]);
  });

  it("marks malformed actor profile entries as unreadable", async () => {
    const sessionRoot = await makeSessionRoot();
    await writePreparedSession(
      sessionRoot,
      [
        "schema_version: 1",
        "session_id: route-visibility-test",
        "profiles:",
        "  - actor_profile_id: malformed",
        "    actor_kind: lens",
        "    execution_realization: direct-call",
        "    runtime_provider: openai",
        "    auth_mode: api_key",
        "    effective_worker_executor: direct_call",
        "",
      ].join("\n"),
    );

    const visibility = await buildReviewRouteVisibilityFromSession(sessionRoot);

    expect(visibility?.actorProfileStatus).toBe("unreadable");
    expect(visibility?.actorRoute.mode).toBe("unknown");
    expect(visibility?.actorProfiles).toEqual([]);
  });
});
