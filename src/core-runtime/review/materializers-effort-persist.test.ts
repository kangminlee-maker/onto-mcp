/**
 * Effort persist (Option A) — bootstrap 시점에 OntoConfig 로부터 resolved_llm_plan
 * 을 session-metadata.yaml 에 durable 기록하는 동작 검증.
 *
 * Source authority: development-records/plan (없음 — memory
 * project_framework_v1_session_20260420.md backlog [4]).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parse as parseYaml } from "yaml";
import type {
  InvocationBindingArtifact,
  ReviewActorConsumerBindingsArtifact,
  ReviewActorInvocationProfilesArtifact,
  ReviewSessionMetadata,
} from "./artifact-types.js";
import { bootstrapInvocationBindingArtifacts } from "./materializers.js";

async function readYaml<T>(p: string): Promise<T> {
  const text = await fs.readFile(p, "utf8");
  return parseYaml(text) as T;
}

async function makeTmpProject(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "onto-effort-persist-"));
  return base;
}

async function writeConfig(
  projectRoot: string,
  value: unknown,
): Promise<void> {
  const dir = path.join(projectRoot, ".onto");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "settings.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function commonParams(projectRoot: string) {
  return {
    projectRoot,
    requestedTarget: "src/foo.ts",
    targetScopeKind: "file" as const,
    resolvedTargetRefs: [path.join(projectRoot, "src/foo.ts")],
    domainFinalValue: "software-engineering",
    domainSelectionMode: "auto",
    executionRealization: "worker" as const,
    hostRuntime: "codex" as const,
    reviewMode: "core-axis" as const,
    resolvedLensIds: ["structure"],
  };
}

describe("bootstrapInvocationBindingArtifacts — resolved_llm_plan persistence", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmpProject();
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("persists resolved_llm_plan from canonical OpenAI OAuth llm config", async () => {
    await writeConfig(
      tmp,
      {
        llm: {
          auth: "oauth",
          provider: "openai",
          model: "gpt-5.5",
          effort: "medium",
          service_tier: "fast",
        },
      },
    );

    const { sessionMetadataPath } =
      await bootstrapInvocationBindingArtifacts(commonParams(tmp));

    const md = await readYaml<ReviewSessionMetadata>(sessionMetadataPath);
    expect(md.resolved_llm_plan).toBeDefined();
    expect(md.resolved_llm_plan?.provider).toBe("codex");
    expect(md.resolved_llm_plan?.model).toBe("gpt-5.5");
    expect(md.resolved_llm_plan?.reasoning_effort).toBe("medium");
    expect(md.resolved_llm_plan?.service_tier).toBe("fast");
  });

  it("persists provider when canonical Anthropic API-key llm config is set", async () => {
    await writeConfig(
      tmp,
      {
        llm: {
          auth: "api_key",
          provider: "anthropic",
          model: "claude-sonnet-4-6",
        },
      },
    );

    const { sessionMetadataPath } =
      await bootstrapInvocationBindingArtifacts(commonParams(tmp));

    const md = await readYaml<ReviewSessionMetadata>(sessionMetadataPath);
    expect(md.resolved_llm_plan?.provider).toBe("anthropic");
    expect(md.resolved_llm_plan?.model).toBe("claude-sonnet-4-6");
  });

  it("omits resolved_llm_plan field when settings.json is missing", async () => {
    const { sessionMetadataPath } =
      await bootstrapInvocationBindingArtifacts(commonParams(tmp));

    const md = await readYaml<ReviewSessionMetadata>(sessionMetadataPath);
    expect(md.resolved_llm_plan).toBeUndefined();
  });

  it("omits resolved_llm_plan field when settings.json has no LLM fields", async () => {
    // Fixture writes an orthogonal-only field so the settings JSON is
    // non-empty but carries no LLM profile information.
    await writeConfig(tmp, { domains: ["software-engineering"] });

    const { sessionMetadataPath } =
      await bootstrapInvocationBindingArtifacts(commonParams(tmp));

    const md = await readYaml<ReviewSessionMetadata>(sessionMetadataPath);
    expect(md.resolved_llm_plan).toBeUndefined();
  });

  it("writes resolved actor invocation profiles and consumer bindings", async () => {
    await writeConfig(
      tmp,
      {
        llm: {
          auth: "oauth",
          provider: "openai",
          model: "gpt-5.5",
          effort: "medium",
          service_tier: "fast",
        },
        review: {
          execution: {
            mode: "main-workers",
            teamlead: { seat: "main", llm: "inherit" },
            lens: { seat: "worker", llm: "inherit" },
            synthesize: {
              seat: "worker",
              llm: { effort: "xhigh" },
            },
            deliberation: "controlled-lens-deliberation",
          },
        },
      },
    );

    const { bindingOutputPath } = await bootstrapInvocationBindingArtifacts({
      ...commonParams(tmp),
      resolvedLensIds: ["structure", "axiology"],
    });

    const binding = await readYaml<InvocationBindingArtifact>(bindingOutputPath);
    expect(binding.actor_invocation_profiles_path).toBeDefined();
    expect(binding.actor_consumer_bindings_path).toBeDefined();
    expect(binding.review_context_manifest_path).toBeDefined();

    const profiles =
      await readYaml<ReviewActorInvocationProfilesArtifact>(
        binding.actor_invocation_profiles_path!,
      );
    expect(profiles.profiles.map((profile) => profile.actor_kind).sort()).toEqual([
      "lens",
      "synthesize",
      "teamlead",
    ]);
    expect(
      profiles.profiles.some(
        (profile) => profile.actor_profile_id === "actor:deliberation",
      ),
    ).toBe(false);
    const synthesize = profiles.profiles.find(
      (profile) => profile.actor_kind === "synthesize",
    );
    expect(synthesize?.runtime_provider).toBe("codex");
    expect(synthesize?.auth_mode).toBe("oauth");
    expect(synthesize?.effective_worker_executor).toBe("codex");
    expect(synthesize?.model).toBe("gpt-5.5");
    expect(synthesize?.effort).toBe("xhigh");
    expect(synthesize?.service_tier).toBe("fast");
    expect(synthesize?.credential_ref).toBe("host:codex:oauth");

    const bindings =
      await readYaml<ReviewActorConsumerBindingsArtifact>(
        binding.actor_consumer_bindings_path!,
      );
    expect(bindings.bindings.some((entry) => entry.consumer_id === "axiology"))
      .toBe(false);
    expect(
      bindings.bindings.some(
        (entry) =>
          entry.consumer_id === "lens:axiology" &&
          entry.consumer_kind === "lens" &&
          entry.actor_profile_id === "actor:lens",
      ),
    ).toBe(true);
    expect(
      bindings.bindings.some(
        (entry) =>
          entry.consumer_id === "deliberation:structure" &&
          entry.actor_profile_id === "actor:lens" &&
          entry.actor_kind === "lens",
      ),
    ).toBe(true);
  });

  it("derives direct-call actor routes from each actor LLM selection", async () => {
    await writeConfig(
      tmp,
      {
        llm: {
          auth: "api_key",
          provider: "openai",
          model: "gpt-5.5",
          effort: "medium",
        },
        review: {
          execution: {
            mode: "main-workers",
            teamlead: { seat: "main", llm: "inherit" },
            lens: { seat: "worker", llm: "inherit" },
            synthesize: {
              seat: "worker",
              llm: {
                auth: "api_key",
                provider: "anthropic",
                model: "claude-sonnet-4-6",
                effort: "xhigh",
              },
            },
            deliberation: "controlled-lens-deliberation",
          },
        },
      },
    );

    const { bindingOutputPath } = await bootstrapInvocationBindingArtifacts({
      ...commonParams(tmp),
      executionRealization: "direct-call",
      hostRuntime: "openai",
    });

    const binding = await readYaml<InvocationBindingArtifact>(bindingOutputPath);
    const profiles =
      await readYaml<ReviewActorInvocationProfilesArtifact>(
        binding.actor_invocation_profiles_path!,
      );
    const teamlead = profiles.profiles.find(
      (profile) => profile.actor_kind === "teamlead",
    );
    const lens = profiles.profiles.find(
      (profile) => profile.actor_kind === "lens",
    );
    const synthesize = profiles.profiles.find(
      (profile) => profile.actor_kind === "synthesize",
    );

    expect(teamlead?.runtime_provider).toBe("openai");
    expect(teamlead?.auth_mode).toBe("api_key");
    expect(teamlead?.effective_worker_executor).toBe("direct_call");
    expect(lens?.runtime_provider).toBe("openai");
    expect(lens?.auth_mode).toBe("api_key");
    expect(lens?.effective_worker_executor).toBe("direct_call");
    expect(synthesize?.runtime_provider).toBe("anthropic");
    expect(synthesize?.auth_mode).toBe("api_key");
    expect(synthesize?.effective_worker_executor).toBe("direct_call");
    expect(synthesize?.model).toBe("claude-sonnet-4-6");
    expect(synthesize?.effort).toBe("xhigh");
  });

  it("records mock actor route from executor without accepting provider/auth inputs", async () => {
    await writeConfig(
      tmp,
      {
        llm: {
          auth: "api_key",
          provider: "openai",
          model: "gpt-5.5",
        },
      },
    );

    const { bindingOutputPath } = await bootstrapInvocationBindingArtifacts({
      ...commonParams(tmp),
      executionRealization: "direct-call",
      hostRuntime: "standalone",
    });

    const binding = await readYaml<InvocationBindingArtifact>(bindingOutputPath);
    const profiles =
      await readYaml<ReviewActorInvocationProfilesArtifact>(
        binding.actor_invocation_profiles_path!,
      );

    for (const profile of profiles.profiles) {
      expect(profile.runtime_provider).toBe("mock");
      expect(profile.auth_mode).toBeNull();
      expect(profile.effective_worker_executor).toBe("mock");
      expect(profile.credential_ref).toBeNull();
    }
  });

  it("leaves direct-call actor route unresolved when actor LLM selection is absent", async () => {
    const { bindingOutputPath } = await bootstrapInvocationBindingArtifacts({
      ...commonParams(tmp),
      executionRealization: "direct-call",
      hostRuntime: "openai",
    });

    const binding = await readYaml<InvocationBindingArtifact>(bindingOutputPath);
    const profiles =
      await readYaml<ReviewActorInvocationProfilesArtifact>(
        binding.actor_invocation_profiles_path!,
      );

    for (const profile of profiles.profiles) {
      expect(profile.runtime_provider).toBeNull();
      expect(profile.auth_mode).toBeNull();
      expect(profile.effective_worker_executor).toBe("direct_call");
      expect(profile.credential_ref).toBeNull();
    }
  });
});
