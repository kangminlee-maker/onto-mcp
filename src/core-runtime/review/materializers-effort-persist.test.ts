/**
 * Effort persist (Option A) — bootstrap 시점에 OntoConfig 로부터 resolved_llm_plan
 * 을 session-metadata.yaml 에 durable 기록하는 동작 검증.
 *
 * Current contract: actor-owned settings.json/v3 LLM blocks are persisted into
 * session metadata and actor invocation artifacts.
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
  ReviewExecutionPlan,
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
  let originalHome: string | undefined;

  beforeEach(async () => {
    tmp = await makeTmpProject();
    originalHome = process.env.HOME;
    process.env.HOME = path.join(tmp, "home");
    await fs.mkdir(process.env.HOME, { recursive: true });
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  function openAiOauthLlm(effort = "medium") {
    return {
      auth: "oauth",
      provider: "openai",
      model: "gpt-5.5",
      effort,
      service_tier: "fast",
    };
  }

  function openAiApiLlm(effort = "medium") {
    return {
      auth: "api_key",
      provider: "openai",
      model: "gpt-5.5",
      effort,
    };
  }

  function anthropicApiLlm(effort?: string) {
    return {
      auth: "api_key",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      ...(effort ? { effort } : {}),
    };
  }

  function v3ReviewSettings(args: {
    teamlead: unknown;
    lens: unknown;
    synthesize: unknown;
    topology?: "main-workers" | "nested-workers";
    executor?: "auto" | "codex" | "direct_call";
    artifacts?: Record<string, unknown>;
    maxConcurrentLenses?: number;
  }) {
    return {
      schema_version: "settings.json/v3",
      review: {
        ...(args.artifacts ? { artifacts: args.artifacts } : {}),
        execution: {
          topology: args.topology ?? "main-workers",
          executor: args.executor ?? "auto",
          deliberation: "controlled-lens-deliberation",
          ...(args.maxConcurrentLenses !== undefined
            ? { max_concurrent_lenses: args.maxConcurrentLenses }
            : {}),
          actors: {
            teamlead: { seat: "main", llm: args.teamlead },
            lens: { seat: "worker", llm: args.lens },
            synthesize: { seat: "worker", llm: args.synthesize },
          },
        },
      },
    };
  }

  it("persists resolved_llm_plan from canonical OpenAI OAuth llm config", async () => {
    await writeConfig(
      tmp,
      v3ReviewSettings({
        teamlead: openAiOauthLlm("medium"),
        lens: openAiOauthLlm("medium"),
        synthesize: openAiOauthLlm("medium"),
      }),
    );

    const { sessionMetadataPath } =
      await bootstrapInvocationBindingArtifacts(commonParams(tmp));

    const md = await readYaml<ReviewSessionMetadata>(sessionMetadataPath);
    expect(md.resolved_llm_plan).toBeDefined();
    expect(md.resolved_llm_plan?.provider).toBe("codex");
    expect(md.resolved_llm_plan?.execution_route).toBe("external_oauth_worker");
    expect(md.resolved_llm_plan?.execution_adapter).toBe("codex_cli");
    expect(md.resolved_llm_plan?.model_provider).toBe("openai");
    expect(md.resolved_llm_plan?.auth_mode).toBe("oauth");
    expect(md.resolved_llm_plan?.billing_mode).toBe("subscription");
    expect(md.resolved_llm_plan?.model).toBe("gpt-5.5");
    expect(md.resolved_llm_plan?.reasoning_effort).toBe("medium");
    expect(md.resolved_llm_plan?.service_tier).toBe("fast");
  });

  it("persists effective max_concurrent_lenses in the execution plan", async () => {
    await writeConfig(
      tmp,
      v3ReviewSettings({
        teamlead: openAiOauthLlm("medium"),
        lens: openAiOauthLlm("medium"),
        synthesize: openAiOauthLlm("medium"),
        maxConcurrentLenses: 2,
      }),
    );

    const { bindingOutputPath } = await bootstrapInvocationBindingArtifacts({
      ...commonParams(tmp),
      resolvedLensIds: ["structure", "logic", "axiology"],
    });

    const binding = await readYaml<InvocationBindingArtifact>(bindingOutputPath);
    const plan = await readYaml<ReviewExecutionPlan>(binding.execution_plan_path);
    expect(plan.max_concurrent_lenses).toBe(2);
    expect(plan.minimum_participating_lenses).toBe(3);
  });

  it("persists provider when canonical Anthropic API-key llm config is set", async () => {
    await writeConfig(
      tmp,
      v3ReviewSettings({
        teamlead: anthropicApiLlm(),
        lens: anthropicApiLlm(),
        synthesize: anthropicApiLlm(),
      }),
    );

    const { sessionMetadataPath } =
      await bootstrapInvocationBindingArtifacts(commonParams(tmp));

    const md = await readYaml<ReviewSessionMetadata>(sessionMetadataPath);
    expect(md.resolved_llm_plan?.provider).toBe("anthropic");
    expect(md.resolved_llm_plan?.execution_route).toBe("direct_model_call");
    expect(md.resolved_llm_plan?.execution_adapter).toBe("anthropic_sdk");
    expect(md.resolved_llm_plan?.model_provider).toBe("anthropic");
    expect(md.resolved_llm_plan?.auth_mode).toBe("api_key");
    expect(md.resolved_llm_plan?.billing_mode).toBe("per_token");
    expect(md.resolved_llm_plan?.wire_format).toBe("native_sdk");
    expect(md.resolved_llm_plan?.model).toBe("claude-sonnet-4-6");
  });

  it("omits resolved_llm_plan field when effective settings has no LLM fields", async () => {
    const { sessionMetadataPath } =
      await bootstrapInvocationBindingArtifacts({
        ...commonParams(tmp),
        ontoConfig: {},
      });

    const md = await readYaml<ReviewSessionMetadata>(sessionMetadataPath);
    expect(md.resolved_llm_plan).toBeUndefined();
  });

  it("omits resolved_llm_plan field when effective settings has only non-LLM fields", async () => {
    const { sessionMetadataPath } =
      await bootstrapInvocationBindingArtifacts({
        ...commonParams(tmp),
        ontoConfig: { domains: ["software-engineering"] },
      });

    const md = await readYaml<ReviewSessionMetadata>(sessionMetadataPath);
    expect(md.resolved_llm_plan).toBeUndefined();
  });

  it("writes resolved actor invocation profiles and consumer bindings", async () => {
    await writeConfig(
      tmp,
      v3ReviewSettings({
        teamlead: openAiOauthLlm("medium"),
        lens: openAiOauthLlm("medium"),
        synthesize: openAiOauthLlm("xhigh"),
      }),
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
    expect(synthesize?.execution_route).toBe("external_oauth_worker");
    expect(synthesize?.execution_adapter).toBe("codex_cli");
    expect(synthesize?.model_provider).toBe("openai");
    expect(synthesize?.billing_mode).toBe("subscription");
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

  it("records sidecar lens output seats from review artifact settings", async () => {
    await writeConfig(
      tmp,
      v3ReviewSettings({
        teamlead: openAiOauthLlm("medium"),
        lens: openAiOauthLlm("medium"),
        synthesize: openAiOauthLlm("medium"),
        artifacts: {
          lens_output_format: "sidecar",
          write_lens_markdown: false,
        },
      }),
    );

    const { bindingOutputPath } = await bootstrapInvocationBindingArtifacts({
      ...commonParams(tmp),
      resolvedLensIds: ["logic", "coverage"],
    });
    const binding = await readYaml<InvocationBindingArtifact>(bindingOutputPath);
    const plan = await readYaml<ReviewExecutionPlan>(binding.execution_plan_path);

    expect(plan.lens_output_format).toBe("sidecar");
    expect(plan.write_lens_markdown).toBe(false);
    expect(plan.lens_execution_seats.map((seat) => seat.sidecar_output_path)).toEqual([
      path.join(binding.round1_root, "logic.findings.yaml"),
      path.join(binding.round1_root, "coverage.findings.yaml"),
    ]);
    expect(
      binding.boundary_policy.write_policy.allowed_output_refs,
    ).toContain(path.join(binding.round1_root, "logic.findings.yaml"));
    expect(
      binding.boundary_policy.write_policy.allowed_output_refs,
    ).not.toContain(path.join(binding.round1_root, "logic.md"));
  });

  it("derives direct-call actor routes from each actor LLM selection", async () => {
    await writeConfig(
      tmp,
      v3ReviewSettings({
        teamlead: openAiApiLlm("medium"),
        lens: openAiApiLlm("medium"),
        synthesize: anthropicApiLlm("xhigh"),
      }),
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
    expect(teamlead?.execution_route).toBe("direct_model_call");
    expect(teamlead?.execution_adapter).toBe("openai_sdk");
    expect(teamlead?.model_provider).toBe("openai");
    expect(teamlead?.billing_mode).toBe("per_token");
    expect(teamlead?.wire_format).toBe("native_sdk");
    expect(teamlead?.auth_mode).toBe("api_key");
    expect(teamlead?.effective_worker_executor).toBe("direct_call");
    expect(lens?.runtime_provider).toBe("openai");
    expect(lens?.execution_route).toBe("direct_model_call");
    expect(lens?.model_provider).toBe("openai");
    expect(lens?.auth_mode).toBe("api_key");
    expect(lens?.effective_worker_executor).toBe("direct_call");
    expect(synthesize?.runtime_provider).toBe("anthropic");
    expect(synthesize?.execution_route).toBe("direct_model_call");
    expect(synthesize?.execution_adapter).toBe("anthropic_sdk");
    expect(synthesize?.model_provider).toBe("anthropic");
    expect(synthesize?.billing_mode).toBe("per_token");
    expect(synthesize?.wire_format).toBe("native_sdk");
    expect(synthesize?.auth_mode).toBe("api_key");
    expect(synthesize?.effective_worker_executor).toBe("direct_call");
    expect(synthesize?.model).toBe("claude-sonnet-4-6");
    expect(synthesize?.effort).toBe("xhigh");
  });

  it("records standalone direct-call actor route from actor LLM selection", async () => {
    await writeConfig(
      tmp,
      v3ReviewSettings({
        teamlead: openAiApiLlm(),
        lens: openAiApiLlm(),
        synthesize: openAiApiLlm(),
      }),
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
      expect(profile.runtime_provider).toBe("openai");
      expect(profile.execution_route).toBe("direct_model_call");
      expect(profile.execution_adapter).toBe("openai_sdk");
      expect(profile.model_provider).toBe("openai");
      expect(profile.billing_mode).toBe("per_token");
      expect(profile.wire_format).toBe("native_sdk");
      expect(profile.auth_mode).toBe("api_key");
      expect(profile.effective_worker_executor).toBe("direct_call");
      expect(profile.credential_ref).toBeNull();
    }
  });

  it("leaves direct-call actor route unresolved when actor LLM selection is absent", async () => {
    const { bindingOutputPath } = await bootstrapInvocationBindingArtifacts({
      ...commonParams(tmp),
      executionRealization: "direct-call",
      hostRuntime: "openai",
      ontoConfig: {},
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
