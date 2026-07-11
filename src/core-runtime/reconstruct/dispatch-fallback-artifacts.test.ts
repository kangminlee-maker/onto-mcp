import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import {
  assertDispatchFallbackSessionAdmission,
  artifactIntegrity,
  DispatchFallbackActivationSchema,
  DispatchFallbackOutcomeSchema,
  publishDispatchFallbackActivation,
  publishDispatchFallbackOutcome,
  readDispatchFallbackOutcome,
  projectDispatchFallbackRecordBlock,
  securePublishDispatchFallbackYaml,
  type DispatchFallbackActivation,
} from "./dispatch-fallback-artifacts.js";
import type { ReconstructRunControlArtifact } from "./artifact-types.js";
import { dispatchDescriptorProjection } from "../llm/sealed-dispatch-capability.js";
import { buildDispatchIncompleteArtifactFromPartition } from "../llm/dispatch-breaker.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), "onto-fallback-artifacts-"));
  roots.push(value);
  return value;
}

function descriptor(role: "semantic_map_synthesize" | "semantic_map_verify", provider: "openai" | "anthropic") {
  return dispatchDescriptorProjection({
    model_provider: provider,
    model_id: "model",
    execution_adapter: provider === "openai" ? "openai_sdk" as const : "anthropic_sdk" as const,
    protocol_version: provider === "openai" ? "openai_responses_v1" as const : "anthropic_messages_v1" as const,
    adapter_package_version: provider === "openai" ? "6.39.0" : "0.99.0",
    auth: "api_key" as const,
    endpoint_kind: "official_sdk" as const,
    service_tier: null,
    reasoning_effort: "medium",
    dispatch_role: role,
  });
}

function activation(sessionId: string): DispatchFallbackActivation {
  const primary = descriptor("semantic_map_synthesize", "openai");
  return {
    schema_version: "dispatch-fallback-activation/v1",
    session_id: sessionId,
    created_at: new Date().toISOString(),
    owner_attempt_id: "attempt-1",
    owner_lock_token_hash: "lock-token",
    trigger: {
      failure_class: "rate_limit",
      systemic_failure_threshold: 1,
      contributors: [{
        descriptor_id: primary.descriptor_id,
        capability_instance_id: "instance-1",
        logical_dispatch_id: "logical-1",
        actual_adapter_request_count: 1,
        failure_class: "rate_limit",
        failure_code: "http_429",
        source: "sdk_http_status",
        observation_id: "obs-1",
        operation: "semantic_map_synthesize",
      }],
    },
    primary_descriptor: primary,
    primary_capability_instance_id: "instance-1",
    fallback_descriptors: {
      synthesize: descriptor("semantic_map_synthesize", "anthropic"),
      verify: descriptor("semantic_map_verify", "anthropic"),
    },
    partition: {
      planned: ["obs-1", "obs-2"],
      completed: ["obs-2"],
      dead_letter: [],
      incomplete: ["obs-1"],
    },
    route_relation: "cross_provider",
  };
}

describe("dispatch fallback admission", () => {
  it("rejects overlap across completed/dead-letter/incomplete even when their union covers planned", () => {
    const artifact = activation("session-overlap");
    artifact.partition.dead_letter = ["obs-1"];
    expect(DispatchFallbackActivationSchema.safeParse(artifact).success).toBe(false);
  });

  it("rejects class/code, contributor membership, and descriptor-role binding mutations", () => {
    const base = activation("session-mutations");
    const wrongCode = structuredClone(base) as unknown as Record<string, any>;
    wrongCode.trigger.contributors[0].failure_code = "http_401";
    expect(DispatchFallbackActivationSchema.safeParse(wrongCode).success).toBe(false);

    const completedContributor = structuredClone(base);
    completedContributor.trigger.contributors[0]!.observation_id = "obs-2";
    expect(DispatchFallbackActivationSchema.safeParse(completedContributor).success)
      .toBe(false);

    const swappedRoles = structuredClone(base);
    swappedRoles.fallback_descriptors.synthesize = descriptor(
      "semantic_map_verify",
      "anthropic",
    );
    expect(DispatchFallbackActivationSchema.safeParse(swappedRoles).success).toBe(false);

    const invalidOutcome = {
      schema_version: "dispatch-fallback-outcome/v1",
      session_id: "session-mutations",
      created_at: new Date().toISOString(),
      owner_attempt_id: "attempt-1",
      activation: { ref: "/tmp/activation", sha256: "a".repeat(64) },
      status: "halted",
      partition: {
        target_count: 1,
        completed_count: 0,
        dead_letter_count: 0,
        incomplete_count: 1,
      },
      dispatch_counts: {
        synthesize_logical: 1,
        verify_logical: 0,
        synthesize_adapter_requests: 1,
        verify_adapter_requests: 0,
      },
      final_artifacts: {
        dispatch_incomplete: { ref: "/tmp/dispatch", sha256: "b".repeat(64) },
        semantic_map_census: { ref: "/tmp/census", sha256: "c".repeat(64) },
        semantic_map: { ref: "/tmp/map", sha256: "d".repeat(64) },
      },
      terminal_failure: {
        descriptor_id: "descriptor",
        capability_instance_id: "instance",
        logical_dispatch_id: "logical",
        actual_adapter_request_count: 1,
        failure_class: "auth",
        failure_code: "http_429",
        source: "sdk_http_status",
      },
    };
    expect(DispatchFallbackOutcomeSchema.safeParse(invalidOutcome).success).toBe(false);
  });

  it("rejects a symlinked canonical comprehension parent", async () => {
    const sessionRoot = await root();
    const redirect = path.join(sessionRoot, "redirect");
    await fs.mkdir(redirect);
    await fs.symlink(redirect, path.join(sessionRoot, "comprehension"));
    await expect(
      securePublishDispatchFallbackYaml({
        sessionRoot,
        relativePath: "comprehension/semantic-map.yaml",
        value: { schema_version: "1", observations: [] },
      }),
    ).rejects.toThrow("publication parent must be a real directory");
    await expect(fs.stat(path.join(redirect, "semantic-map.yaml"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects running+held ownership regardless of an expired lease timestamp", async () => {
    const sessionRoot = await root();
    const runControl: ReconstructRunControlArtifact = {
      schema_version: "1",
      session_id: path.basename(sessionRoot),
      session_root: sessionRoot,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      runtime_version: "test",
      request_rows: [],
      attempt_rows: [{
        attempt_id: "attempt-1",
        parent_attempt_id: null,
        attempt_kind: "initial",
        trigger_ref: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        attempt_status: "running",
        recovery_from_refs: [],
      }],
      lock_rows: [{
        lock_id: "lock-1",
        lock_scope: "session_root",
        owner_attempt_id: "attempt-1",
        lease_started_at: "2000-01-01T00:00:00.000Z",
        lease_expires_at: "2000-01-01T01:00:00.000Z",
        lock_token_hash: "lock-token",
        conflict_policy: "recover_expired_lease",
        lock_status: "held",
      }],
      write_transactions: [],
      resume_rows: [],
    };
    await fs.writeFile(
      path.join(sessionRoot, "reconstruct-run-control.yaml"),
      stringifyYaml(runControl),
    );
    await expect(
      assertDispatchFallbackSessionAdmission({ sessionRoot, enabled: true }),
    ).rejects.toThrow("lease expiry is not takeover authority");
  });

  it("rejects every later entry after create-once activation, even when disabled", async () => {
    const sessionRoot = await root();
    await publishDispatchFallbackActivation(
      sessionRoot,
      activation(path.basename(sessionRoot)),
    );
    await expect(
      assertDispatchFallbackSessionAdmission({ sessionRoot, enabled: false }),
    ).rejects.toThrow("retry_with_new_session");
    await expect(
      publishDispatchFallbackActivation(
        sessionRoot,
        activation(path.basename(sessionRoot)),
      ),
    ).rejects.toThrow("create-once artifact already exists");
  });

  it("verifies the completed outcome pair and fails closed after final-artifact tampering", async () => {
    const sessionRoot = await root();
    const activationIntegrity = await publishDispatchFallbackActivation(
      sessionRoot,
      activation(path.basename(sessionRoot)),
    );
    expect((await artifactIntegrity(activationIntegrity.path)).sha256).toBe(
      activationIntegrity.sha256,
    );
    const dispatchRef = path.join(sessionRoot, "dispatch-incomplete.yaml");
    const censusRef = path.join(
      sessionRoot,
      "comprehension",
      "semantic-map-census.yaml",
    );
    const mapRef = path.join(
      sessionRoot,
      "comprehension",
      "semantic-map.yaml",
    );
    await fs.mkdir(path.dirname(censusRef), { recursive: true });
    await Promise.all([
      fs.writeFile(
        dispatchRef,
        stringifyYaml(buildDispatchIncompleteArtifactFromPartition({
          pipeline: "reconstruct",
          batchLabel: "semantic-map",
          createdAt: new Date().toISOString(),
          plannedItemIds: ["obs-1", "obs-2"],
          completedItemIds: ["obs-1", "obs-2"],
          deadLetter: [],
          breaker: {
            tripped: false,
            failure_class: null,
            consecutive_item_count: null,
            threshold: 1,
          },
        })),
      ),
      fs.writeFile(censusRef, stringifyYaml({
        schema_version: "1",
        observations_total: 2,
        observations_map_present: 0,
        observations_map_absent: 2,
        synthesize_calls_total: 0,
        verify_calls_total: 0,
        max_synthesize_calls: 10,
        max_verify_calls: 10,
        author_id: "fixture",
        synthesize_model_identity: "fixture",
        verify_model_identity: "fixture",
        by_observation: ["obs-1", "obs-2"].map((observation_id) => ({
          observation_id,
          map_present: false,
          skip_reason: "no_value_tiles",
          fingerprint: null,
          columns: [],
        })),
      })),
      fs.writeFile(mapRef, stringifyYaml({ schema_version: "1", observations: [] })),
    ]);
    await publishDispatchFallbackOutcome(sessionRoot, {
      schema_version: "dispatch-fallback-outcome/v1",
      session_id: path.basename(sessionRoot),
      created_at: new Date().toISOString(),
      owner_attempt_id: "attempt-1",
      activation: {
        ref: activationIntegrity.path,
        sha256: activationIntegrity.sha256,
      },
      status: "completed",
      partition: {
        target_count: 1,
        completed_count: 1,
        dead_letter_count: 0,
        incomplete_count: 0,
      },
      dispatch_counts: {
        synthesize_logical: 1,
        verify_logical: 0,
        synthesize_adapter_requests: 1,
        verify_adapter_requests: 0,
      },
      final_artifacts: {
        dispatch_incomplete: await artifactIntegrity(dispatchRef),
        semantic_map_census: await artifactIntegrity(censusRef),
        semantic_map: await artifactIntegrity(mapRef),
      },
      terminal_failure: null,
    });
    expect(
      path.resolve((await readDispatchFallbackOutcome(sessionRoot))!.activation.ref),
    ).toBe(path.resolve(activationIntegrity.path));
    await expect(
      assertDispatchFallbackSessionAdmission({ sessionRoot, enabled: false }),
    ).rejects.toThrow("retry_with_new_session");
    const validOutcome = (await readDispatchFallbackOutcome(sessionRoot))!;
    await fs.writeFile(
      path.join(sessionRoot, "dispatch-fallback-outcome.yaml"),
      stringifyYaml({
        ...validOutcome,
        partition: {
          target_count: 0,
          completed_count: 0,
          dead_letter_count: 0,
          incomplete_count: 0,
        },
      }),
    );
    await expect(
      assertDispatchFallbackSessionAdmission({ sessionRoot, enabled: false }),
    ).rejects.toThrow("outcome/final target partition mismatch");
    await fs.writeFile(
      path.join(sessionRoot, "dispatch-fallback-outcome.yaml"),
      stringifyYaml(validOutcome),
    );
    await fs.writeFile(censusRef, "tampered: true\n");
    await expect(
      assertDispatchFallbackSessionAdmission({ sessionRoot, enabled: false }),
    ).rejects.toThrow("semantic_map_census ref/hash mismatch");
  });
});

describe("dispatch fallback record projection", () => {
  it("projects a bounded completed consumer block and rejects halted outcomes", () => {
    const base = {
      schema_version: "dispatch-fallback-outcome/v1" as const,
      session_id: "session-1",
      created_at: new Date().toISOString(),
      owner_attempt_id: "attempt-1",
      activation: { ref: "/tmp/activation", sha256: "a".repeat(64) },
      partition: {
        target_count: 2,
        completed_count: 1,
        dead_letter_count: 1,
        incomplete_count: 0,
      },
      dispatch_counts: {
        synthesize_logical: 2,
        verify_logical: 1,
        synthesize_adapter_requests: 2,
        verify_adapter_requests: 1,
      },
      final_artifacts: {
        dispatch_incomplete: { ref: "/tmp/dispatch", sha256: "b".repeat(64) },
        semantic_map_census: { ref: "/tmp/census", sha256: "c".repeat(64) },
        semantic_map: { ref: "/tmp/map", sha256: "d".repeat(64) },
      },
    };
    const block = projectDispatchFallbackRecordBlock({
      outcome: { ...base, status: "completed", terminal_failure: null },
      outcomeIntegrity: { path: "/tmp/outcome", sha256: "e".repeat(64) },
    });
    expect(block).toMatchObject({
      trigger_code: "rate_limit",
      route_relation: "cross_provider",
      target_count: 2,
      completed_count: 1,
      dead_letter_count: 1,
      outcome: "completed",
    });
    expect(() =>
      projectDispatchFallbackRecordBlock({
        outcome: {
          ...base,
          status: "halted",
          partition: { ...base.partition, completed_count: 0, incomplete_count: 1 },
          terminal_failure: {
            descriptor_id: "descriptor",
            capability_instance_id: "instance",
            logical_dispatch_id: "logical",
            actual_adapter_request_count: 1,
            failure_class: "rate_limit",
            failure_code: "http_429",
            source: "sdk_http_status",
          },
        },
        outcomeIntegrity: { path: "/tmp/outcome", sha256: "e".repeat(64) },
      }),
    ).toThrow("only a completed");
  });
});
