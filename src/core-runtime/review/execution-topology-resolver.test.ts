import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DIRECT_SPAWN_SUPPORTED_TOPOLOGIES,
  TOPOLOGY_CATALOG,
  UnsupportedTopologyError,
  assertDirectSpawnSupported,
  resolveExecutionTopology,
  type ExecutionTopologyResolution,
  type TopologyId,
} from "./execution-topology-resolver.js";

// ---------------------------------------------------------------------------
// Invariants covered here (post-P9.1, 2026-04-21):
//
// (1) TOPOLOGY_CATALOG has exactly 7 canonical entries, each with the
//     full static attribute set populated. Controlled deliberation is the
//     canonical channel for all review topologies.
// (2) `assertDirectSpawnSupported` matches the direct spawn support set:
//     3 ids pass, all others throw UnsupportedTopologyError with guidance.
// (3) `review.max_concurrent_lenses` is the only override applied at
//     resolution time; zero / negative values keep the catalog default.
// (4) `[topology]` STDERR prefix mirrors plan_trace 1:1.
// (5) `no_host` resolution composes a reason listing signals + guidance.
// (6) When `config.review` is absent, the resolver reports no_host.
//
// Axis-first positive / negative coverage lives in
// `execution-topology-resolver-axis-first.test.ts`.
// ---------------------------------------------------------------------------

type ResolveArgs = Parameters<typeof resolveExecutionTopology>[0];

const CLEAN_ENV: NodeJS.ProcessEnv = {};

function withSignals(overrides: Partial<ResolveArgs>): ResolveArgs {
  return {
    ontoConfig: {},
    env: CLEAN_ENV,
    claudeHost: false,
    experimentalAgentTeams: false,
    codexAvailable: false,
    codexSessionActive: false,
    ...overrides,
  };
}

function expectResolved(
  res: ExecutionTopologyResolution,
): Extract<ExecutionTopologyResolution, { type: "resolved" }> {
  if (res.type !== "resolved") {
    throw new Error(`expected resolved, got no_host: ${res.reason.slice(0, 120)}`);
  }
  return res;
}

function expectNoHost(
  res: ExecutionTopologyResolution,
): Extract<ExecutionTopologyResolution, { type: "no_host" }> {
  if (res.type !== "no_host") {
    throw new Error(
      `expected no_host, got resolved topology id=${res.topology.id}`,
    );
  }
  return res;
}

/**
 * Minimal `config.review` axis block that derives to `cc-main-agent-subagent`
 * under a Claude host. Used as a vehicle for exercising resolver plumbing
 * (overrides, observability) without duplicating axis-first happy-path
 * coverage.
 */
const REVIEW_BLOCK_MAIN_NATIVE: NonNullable<ResolveArgs["ontoConfig"]["review"]> = {
  teamlead: { model: "main" },
  subagent: { provider: "main-native" },
};

// ---------------------------------------------------------------------------
// (3) review.max_concurrent_lenses — canonical concurrency override (P9.2)
// ---------------------------------------------------------------------------

describe("resolveExecutionTopology — review.max_concurrent_lenses override", () => {
  it("positive review.max_concurrent_lenses takes effect and logs the change", () => {
    const res = resolveExecutionTopology(
      withSignals({
        ontoConfig: {
          review: {
            ...REVIEW_BLOCK_MAIN_NATIVE,
            max_concurrent_lenses: 6,
          },
        },
        claudeHost: true,
      }),
    );
    const resolved = expectResolved(res);
    expect(resolved.topology.id).toBe("cc-main-agent-subagent");
    expect(resolved.topology.max_concurrent_lenses).toBe(6);
    expect(
      resolved.topology.plan_trace.some((l) =>
        l.includes("override max_concurrent_lenses 10 → 6 (via review.max_concurrent_lenses)"),
      ),
    ).toBe(true);
  });

  it("zero/negative review.max_concurrent_lenses reports no_host through validation", () => {
    const res = resolveExecutionTopology(
      withSignals({
        ontoConfig: {
          review: {
            ...REVIEW_BLOCK_MAIN_NATIVE,
            max_concurrent_lenses: 0,
          },
        },
        claudeHost: true,
      }),
    );
    const nohost = expectNoHost(res);
    expect(
      nohost.plan_trace.some((l) =>
        l.includes("review.max_concurrent_lenses"),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (4) plan_trace + [topology] STDERR — single source of truth
// ---------------------------------------------------------------------------

describe("resolveExecutionTopology — observability", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("emits [topology] prefix for every decision line", () => {
    resolveExecutionTopology(
      withSignals({
        ontoConfig: { review: REVIEW_BLOCK_MAIN_NATIVE },
        claudeHost: true,
      }),
    );
    const calls = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const topologyLines = calls.filter((l: string) => l.startsWith("[topology]"));
    expect(topologyLines.length).toBeGreaterThan(0);
    for (const line of topologyLines) {
      expect(line).toMatch(/^\[topology\] /);
    }
  });

  it("plan_trace matches the lines emitted to STDERR (no divergence)", () => {
    const res = resolveExecutionTopology(
      withSignals({
        ontoConfig: { review: REVIEW_BLOCK_MAIN_NATIVE },
        claudeHost: true,
      }),
    );
    const resolved = expectResolved(res);
    const stderrLines = stderrSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.startsWith("[topology] "))
      .map((l: string) => l.replace(/^\[topology\] /, "").replace(/\n$/, ""));
    expect(resolved.topology.plan_trace).toEqual(stderrLines);
  });

  // (5) no_host composition
  it("no_host resolution surfaces plan_trace + guidance reason", () => {
    const res = resolveExecutionTopology(withSignals({}));
    const nohost = expectNoHost(res);
    expect(nohost.plan_trace.length).toBeGreaterThan(0);
    expect(nohost.reason).toContain("Execution topology 를 도출할 수 없습니다");
    expect(nohost.reason).toContain("현재 환경 시그널");
    expect(nohost.reason).toContain("해결 방법");
  });
});

// ---------------------------------------------------------------------------
// (2) Direct spawn support set
// ---------------------------------------------------------------------------

describe("resolveExecutionTopology — direct spawn support set", () => {
  it("direct spawn supports exactly 3 topologies", () => {
    expect(DIRECT_SPAWN_SUPPORTED_TOPOLOGIES.size).toBe(3);
    expect(DIRECT_SPAWN_SUPPORTED_TOPOLOGIES.has("cc-main-agent-subagent")).toBe(true);
    expect(DIRECT_SPAWN_SUPPORTED_TOPOLOGIES.has("cc-main-codex-subprocess")).toBe(true);
    expect(DIRECT_SPAWN_SUPPORTED_TOPOLOGIES.has("codex-main-subprocess")).toBe(true);
  });

  it("assertDirectSpawnSupported passes for supported ids", () => {
    for (const id of DIRECT_SPAWN_SUPPORTED_TOPOLOGIES) {
      expect(() =>
        assertDirectSpawnSupported({
          ...TOPOLOGY_CATALOG[id],
          plan_trace: [],
        }),
      ).not.toThrow();
    }
  });

  it("assertDirectSpawnSupported throws UnsupportedTopologyError for non-supported ids", () => {
    const unsupported: TopologyId[] = [
      "cc-teams-lens-agent-deliberation",
      "cc-teams-agent-subagent",
      "cc-teams-codex-subprocess",
      "codex-nested-subprocess",
    ];
    for (const id of unsupported) {
      expect(() =>
        assertDirectSpawnSupported({ ...TOPOLOGY_CATALOG[id], plan_trace: [] }),
      ).toThrow(UnsupportedTopologyError);
    }
  });

  it("UnsupportedTopologyError message names the required execution surface", () => {
    try {
      assertDirectSpawnSupported({
        ...TOPOLOGY_CATALOG["cc-teams-agent-subagent"],
        plan_trace: [],
      });
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedTopologyError);
      const msg = (err as Error).message;
      expect(msg).toContain("TeamCreate coordinator execution");
      expect(msg).toContain("cc-main-agent-subagent");
    }
  });
});

// ---------------------------------------------------------------------------
// (1) Catalog shape stability
// ---------------------------------------------------------------------------

const EXPECTED_CATALOG_IDS: TopologyId[] = [
  "cc-teams-lens-agent-deliberation",
  "cc-teams-agent-subagent",
  "cc-teams-codex-subprocess",
  "cc-main-agent-subagent",
  "cc-main-codex-subprocess",
  "codex-nested-subprocess",
  "codex-main-subprocess",
];

describe("TOPOLOGY_CATALOG — shape", () => {
  it("has exactly 7 canonical entries", () => {
    const catalogIds = Object.keys(TOPOLOGY_CATALOG).sort();
    expect(catalogIds).toEqual([...EXPECTED_CATALOG_IDS].sort());
    expect(catalogIds.length).toBe(7);
  });

  it("each entry has all required static attributes populated", () => {
    for (const id of Object.keys(TOPOLOGY_CATALOG) as TopologyId[]) {
      const entry = TOPOLOGY_CATALOG[id];
      expect(entry.id).toBe(id);
      expect(entry.teamlead_location).toBeTruthy();
      expect(entry.lens_spawn_mechanism).toBeTruthy();
      expect(entry.max_concurrent_lenses).toBeGreaterThan(0);
      expect(["S0", "S1", "S2", "S3"]).toContain(entry.transport_rank);
      expect(entry.deliberation_channel).toBe("controlled-lens-deliberation");
    }
  });

  it("all topologies declare controlled lens deliberation", () => {
    const channels = new Set(
      (Object.keys(TOPOLOGY_CATALOG) as TopologyId[]).map(
        (id) => TOPOLOGY_CATALOG[id].deliberation_channel,
      ),
    );
    expect([...channels]).toEqual(["controlled-lens-deliberation"]);
  });
});

// ---------------------------------------------------------------------------
// (6) review absent → no_host
// ---------------------------------------------------------------------------

describe("resolveExecutionTopology — missing review block", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("no review block + CC host → no_host", () => {
    const res = resolveExecutionTopology(
      withSignals({
        ontoConfig: {},
        claudeHost: true,
      }),
    );
    const nohost = expectNoHost(res);
    expect(nohost.plan_trace.some((l) => l.includes("no topology resolved"))).toBe(true);
  });

  it("no review block + no host signals → no_host", () => {
    const res = resolveExecutionTopology(withSignals({}));
    const nohost = expectNoHost(res);
    expect(nohost.plan_trace.some((l) => l.includes("no topology resolved"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (2-bis) checkTopologyRequirements — per-branch negative coverage
//
// Restored in PR #161 self-review (2026-04-21). Axis-first pipeline
// produces each TopologyId, then the detailed requirements check rejects
// it due to a single missing signal. The resolver returns `no_host` and
// the plan_trace records the precise skip reason.
// ---------------------------------------------------------------------------

describe("checkTopologyRequirements — axis-first derives id but requirement fails", () => {
  it("lens_agent_teams_mode=false keeps controlled deliberation on the runner transport", () => {
    const res = resolveExecutionTopology(
      withSignals({
        ontoConfig: {
          review: {
            subagent: { provider: "main-native" },
            lens_deliberation: "controlled-lens-deliberation",
          },
          lens_agent_teams_mode: false,
        },
        claudeHost: true,
        experimentalAgentTeams: true,
      }),
    );
    expect(res.type).toBe("resolved");
    if (res.type === "resolved") {
      expect(res.topology.id).toBe("cc-teams-agent-subagent");
      expect(
        res.topology.plan_trace.some((l) =>
          l.includes("controlled deliberation will be executed by the review runner transport"),
        ),
      ).toBe(true);
    }
  });

  it("cc-teams-codex-subprocess skips when codex binary missing", () => {
    const res = resolveExecutionTopology(
      withSignals({
        ontoConfig: {
          review: {
            subagent: { provider: "codex", model_id: "gpt-5.4" },
          },
        },
        claudeHost: true,
        experimentalAgentTeams: true,
        codexAvailable: false,
      }),
    );
    const nohost = expectNoHost(res);
    expect(
      nohost.plan_trace.some((l) =>
        l.includes("cc-teams-codex-subprocess: skip — need codex binary + ~/.codex/auth.json"),
      ),
    ).toBe(true);
  });

  it("codex-main-subprocess skips when codex binary missing despite session signal", () => {
    const res = resolveExecutionTopology(
      withSignals({
        ontoConfig: {
          review: {
            subagent: { provider: "main-native" },
          },
        },
        claudeHost: false,
        codexSessionActive: true,
        codexAvailable: false,
      }),
    );
    const nohost = expectNoHost(res);
    expect(
      nohost.plan_trace.some((l) =>
        l.includes("codex-main-subprocess: skip — need codex binary + ~/.codex/auth.json"),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// env-defaulting (no injected signals) — uses process.env
// ---------------------------------------------------------------------------

describe("resolveExecutionTopology — env defaults", () => {
  it("falls back to host-detection helpers when signals are not injected", () => {
    // Inject ontoConfig but omit detection flag args. The resolver should
    // call detectClaudeCodeEnvSignal() etc. — we only assert the shape is
    // valid (resolved or no_host with a trace).
    const res = resolveExecutionTopology({
      ontoConfig: { review: REVIEW_BLOCK_MAIN_NATIVE },
      env: {},
    });
    expect(["resolved", "no_host"]).toContain(res.type);
    if (res.type === "no_host") {
      expect(res.plan_trace.length).toBeGreaterThan(0);
    }
  });
});
