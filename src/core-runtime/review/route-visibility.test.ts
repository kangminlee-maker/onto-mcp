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
        "    host_runtime: anthropic",
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
    expect(visibility?.actorProfiles).toHaveLength(2);
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
    expect(visibility?.authMode).toBe("oauth");
  });
});
