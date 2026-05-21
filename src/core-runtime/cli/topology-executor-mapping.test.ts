import { describe, it, expect } from "vitest";
import {
  TOPOLOGY_CATALOG,
  type TopologyId,
  type ExecutionTopology,
} from "../review/execution-topology-resolver.js";
import {
  EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES,
  TopologyExecutorMappingError,
  hasStandaloneLensExecutor,
  mapTopologyToExecutorConfig,
  toCoordinatorTopologyDescriptor,
} from "./topology-executor-mapping.js";

// ---------------------------------------------------------------------------
// These tests assert executor mapping invariants:
//
// (1) The mapping support set is exactly the topologies whose lens spawn
//     mechanism is known to this mapper.
//
// (2) Mapping is deterministic per lens_spawn_mechanism:
//       codex-subprocess → codex-review-unit-executor
//       claude-agent-tool / claude-teamcreate-member / generic-subagent
//                        → throw (no subprocess binary exists)
//
// (3) `hasStandaloneLensExecutor` agrees with the mapping's throw/return shape.
//
// (4) `toCoordinatorTopologyDescriptor` strips plan_trace but preserves all
//     other topology attributes — the handoff payload stays compact.
// ---------------------------------------------------------------------------

const FAKE_ONTO_HOME = "/tmp/fake-onto-home";

function synthesize(id: TopologyId): ExecutionTopology {
  return {
    ...TOPOLOGY_CATALOG[id],
    plan_trace: [`synthesized for test: ${id}`],
  };
}

// ---------------------------------------------------------------------------
// Support set
// ---------------------------------------------------------------------------

describe("EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES", () => {
  it("contains exactly 5 mapped topologies", () => {
    expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.size).toBe(5);
    expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has("cc-main-agent-subagent")).toBe(true);
    expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has("cc-main-codex-subprocess")).toBe(true);
    expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has("codex-main-subprocess")).toBe(true);
    expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has("cc-teams-agent-subagent")).toBe(true);
    expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has("cc-teams-codex-subprocess")).toBe(true);
  });

  it("excludes Agent Teams deliberation transport", () => {
    expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has("cc-teams-lens-agent-deliberation")).toBe(false);
  });

  it("excludes external codex teamlead topology", () => {
    expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has("codex-nested-subprocess")).toBe(false);
  });

  // P7 (2026-04-21): generic-* removed entirely from TopologyId enum.
  // Previous test "does NOT include generic-*" is no longer meaningful —
  // the type system now prevents generic-* from existing anywhere.
});

// ---------------------------------------------------------------------------
// mapTopologyToExecutorConfig — codex mechanisms
// ---------------------------------------------------------------------------

describe("mapTopologyToExecutorConfig — codex-subprocess", () => {
  it("2-2 cc-main-codex-subprocess → codex executor", () => {
    const cfg = mapTopologyToExecutorConfig(
      synthesize("cc-main-codex-subprocess"),
      FAKE_ONTO_HOME,
    );
    expect(cfg.bin).toBe("node");
    expect(cfg.args[0]).toContain("codex-review-unit-executor.js");
    expect(cfg.args[0]).toContain(FAKE_ONTO_HOME);
  });

  it("codex-B codex-main-subprocess → codex executor", () => {
    const cfg = mapTopologyToExecutorConfig(
      synthesize("codex-main-subprocess"),
      FAKE_ONTO_HOME,
    );
    expect(cfg.args[0]).toContain("codex-review-unit-executor.js");
  });

  it("1-2 cc-teams-codex-subprocess → codex executor (same as 2-2 at TS level)", () => {
    const cfg = mapTopologyToExecutorConfig(
      synthesize("cc-teams-codex-subprocess"),
      FAKE_ONTO_HOME,
    );
    expect(cfg.args[0]).toContain("codex-review-unit-executor.js");
  });
});

// ---------------------------------------------------------------------------
// mapTopologyToExecutorConfig — claude-agent-tool (no binary; throw)
// ---------------------------------------------------------------------------

describe("mapTopologyToExecutorConfig — claude-agent-tool", () => {
  it("2-1 cc-main-agent-subagent throws (route via coordinator-start handoff)", () => {
    expect(() =>
      mapTopologyToExecutorConfig(synthesize("cc-main-agent-subagent"), FAKE_ONTO_HOME),
    ).toThrow(TopologyExecutorMappingError);
  });

  it("1-1 cc-teams-agent-subagent throws (route via coordinator-start handoff)", () => {
    expect(() =>
      mapTopologyToExecutorConfig(synthesize("cc-teams-agent-subagent"), FAKE_ONTO_HOME),
    ).toThrow(TopologyExecutorMappingError);
  });

  it("claude-agent-tool throw mentions coordinator-start handoff path", () => {
    try {
      mapTopologyToExecutorConfig(synthesize("cc-main-agent-subagent"), FAKE_ONTO_HOME);
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TopologyExecutorMappingError);
      expect((err as Error).message).toContain("coordinator-start handoff");
    }
  });
});

// ---------------------------------------------------------------------------
// mapTopologyToExecutorConfig — unsupported ids
// ---------------------------------------------------------------------------

describe("mapTopologyToExecutorConfig — unsupported", () => {
  it("cc-teams-lens-agent-deliberation throws outside mapping support set", () => {
    expect(() =>
      mapTopologyToExecutorConfig(
        synthesize("cc-teams-lens-agent-deliberation"),
        FAKE_ONTO_HOME,
      ),
    ).toThrow(TopologyExecutorMappingError);
  });

  it("codex-nested-subprocess throws outside mapping support set", () => {
    expect(() =>
      mapTopologyToExecutorConfig(synthesize("codex-nested-subprocess"), FAKE_ONTO_HOME),
    ).toThrow(TopologyExecutorMappingError);
  });

  // P7 (2026-04-21): generic-* removed from TopologyId. Their "reserved"
  // guard is no longer needed — the type system prevents the values from
  // appearing at all.

  it("error message lists all direct-executor supported ids for discoverability", () => {
    try {
      mapTopologyToExecutorConfig(synthesize("codex-nested-subprocess"), FAKE_ONTO_HOME);
      expect.fail("expected throw");
    } catch (err) {
      const msg = (err as Error).message;
      for (const id of EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES) {
        expect(msg).toContain(id);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// hasStandaloneLensExecutor
// ---------------------------------------------------------------------------

describe("hasStandaloneLensExecutor", () => {
  it("codex-subprocess mechanisms have a TS executor binary", () => {
    expect(hasStandaloneLensExecutor(synthesize("cc-main-codex-subprocess"))).toBe(true);
    expect(hasStandaloneLensExecutor(synthesize("cc-teams-codex-subprocess"))).toBe(true);
    expect(hasStandaloneLensExecutor(synthesize("codex-main-subprocess"))).toBe(true);
    expect(hasStandaloneLensExecutor(synthesize("codex-nested-subprocess"))).toBe(true);
  });

  it("claude-agent-tool mechanisms do NOT have a TS executor binary", () => {
    expect(hasStandaloneLensExecutor(synthesize("cc-main-agent-subagent"))).toBe(false);
    expect(hasStandaloneLensExecutor(synthesize("cc-teams-agent-subagent"))).toBe(false);
  });

  it("claude-teamcreate-member (1-0 deliberation) does NOT have a TS executor binary", () => {
    expect(hasStandaloneLensExecutor(synthesize("cc-teams-lens-agent-deliberation"))).toBe(false);
  });

  // P7 (2026-04-21): generic-subagent mechanism tests removed along with
  // generic-* TopologyId values.
});

// ---------------------------------------------------------------------------
// toCoordinatorTopologyDescriptor
// ---------------------------------------------------------------------------

describe("toCoordinatorTopologyDescriptor", () => {
  it("preserves all topology attributes except plan_trace", () => {
    const topology = synthesize("cc-teams-codex-subprocess");
    const descriptor = toCoordinatorTopologyDescriptor(topology);
    expect(descriptor.id).toBe(topology.id);
    expect(descriptor.teamlead_location).toBe(topology.teamlead_location);
    expect(descriptor.lens_spawn_mechanism).toBe(topology.lens_spawn_mechanism);
    expect(descriptor.max_concurrent_lenses).toBe(topology.max_concurrent_lenses);
    expect(descriptor.transport_rank).toBe(topology.transport_rank);
    expect(descriptor.deliberation_channel).toBe(topology.deliberation_channel);
    expect(Object.keys(descriptor)).not.toContain("plan_trace");
  });

  it("is JSON-serializable (handoff transport requirement)", () => {
    const topology = synthesize("cc-teams-lens-agent-deliberation");
    const descriptor = toCoordinatorTopologyDescriptor(topology);
    const json = JSON.stringify(descriptor);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(descriptor);
  });
});
