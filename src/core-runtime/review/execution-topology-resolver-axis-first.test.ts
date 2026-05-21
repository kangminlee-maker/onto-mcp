import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveExecutionTopology,
  type ExecutionTopologyResolution,
} from "./execution-topology-resolver.js";

// ---------------------------------------------------------------------------
// P2 axis-first integration (Review UX Redesign, 2026-04-21)
// ---------------------------------------------------------------------------
//
// These tests verify the axis-first branch in `resolveExecutionTopology`:
//
//   (1) Happy paths — `config.review` present and all derivation steps
//       succeed. priority_source = "review-axes" and the derived
//       TopologyId is a single-entry priority array.
//
//   (2) Invalid validation / derivation / mapping reports no_host.
//   (3) When `config.review` is absent, the resolver reports no_host.
// ---------------------------------------------------------------------------

type ResolveArgs = Parameters<typeof resolveExecutionTopology>[0];

function args(overrides: Partial<ResolveArgs>): ResolveArgs {
  return {
    ontoConfig: {},
    env: {},
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

describe("resolveExecutionTopology — axis-first happy paths", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("Claude host + main-native axes → cc-main-agent-subagent", () => {
    const res = resolveExecutionTopology(
      args({
        ontoConfig: {
          review: {
            teamlead: { model: "main" },
            subagent: { provider: "main-native" },
          },
        },
        claudeHost: true,
      }),
    );
    const r = expectResolved(res);
    expect(r.topology.id).toBe("cc-main-agent-subagent");
    expect(r.topology.plan_trace.some((l) => l.includes("topology source=review-axes")))
      .toBe(true);
    expect(r.topology.plan_trace.some((l) => l.includes("derived TopologyId=cc-main-agent-subagent")))
      .toBe(true);
  });

  it("Claude host + codex subagent → cc-main-codex-subprocess", () => {
    const res = resolveExecutionTopology(
      args({
        ontoConfig: {
          review: {
            subagent: { provider: "codex", model_id: "gpt-5.4" },
          },
        },
        claudeHost: true,
        codexAvailable: true, // required by cc-main-codex-subprocess downstream check
      }),
    );
    const r = expectResolved(res);
    expect(r.topology.id).toBe("cc-main-codex-subprocess");
  });

  it("Codex host + main-native → codex-main-subprocess", () => {
    const res = resolveExecutionTopology(
      args({
        ontoConfig: {
          review: {
            subagent: { provider: "main-native" },
          },
        },
        codexSessionActive: true,
        codexAvailable: true, // required by codex-main-subprocess downstream check
      }),
    );
    const r = expectResolved(res);
    expect(r.topology.id).toBe("codex-main-subprocess");
  });

  it("Claude + teams + native + controlled deliberation → cc-teams-lens-agent-deliberation", () => {
    const res = resolveExecutionTopology(
      args({
        ontoConfig: {
          review: {
            subagent: { provider: "main-native" },
            lens_deliberation: "controlled-lens-deliberation",
          },
          // The resolver's own requirement check for the deliberation
          // topology ALSO inspects `lens_agent_teams_mode`. Set true so
          // the topology passes the downstream requirement gate.
          lens_agent_teams_mode: true,
        },
        claudeHost: true,
        experimentalAgentTeams: true,
      }),
    );
    const r = expectResolved(res);
    expect(r.topology.id).toBe("cc-teams-lens-agent-deliberation");
  });

  it("external codex teamlead → codex-nested-subprocess", () => {
    const res = resolveExecutionTopology(
      args({
        ontoConfig: {
          review: {
            teamlead: { model: { provider: "codex", model_id: "gpt-5.4" } },
            subagent: { provider: "codex", model_id: "gpt-5.4" },
          },
        },
        // codex-nested-subprocess requires codex available + no CC session
        codexAvailable: true,
        claudeHost: false,
        codexSessionActive: false,
      }),
    );
    const r = expectResolved(res);
    expect(r.topology.id).toBe("codex-nested-subprocess");
  });
});

describe("resolveExecutionTopology — fail-loud axis errors", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("invalid review block reports no_host", () => {
    // Validator rejects `main-native + model_id`.
    const res = resolveExecutionTopology(
      args({
        ontoConfig: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          review: {
            subagent: { provider: "main-native", model_id: "x" },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        },
        claudeHost: true,
        codexSessionActive: true,
        codexAvailable: true,
      }),
    );
    if (res.type !== "no_host") {
      throw new Error(`expected no_host, got resolved topology id=${res.topology.id}`);
    }
    expect(
      res.plan_trace.some((l) => l.includes("validation failed")),
    ).toBe(true);
    expect(
      res.plan_trace.some((l) => l.includes("topology source=review-axes")),
    ).toBe(false);
  });

  it("controlled deliberation without Agent Teams uses the main-native topology", () => {
    const res = resolveExecutionTopology(
      args({
        ontoConfig: {
          review: {
            subagent: { provider: "main-native" },
            lens_deliberation: "controlled-lens-deliberation",
          },
        },
        claudeHost: true,
        codexSessionActive: true,
        codexAvailable: true,
        experimentalAgentTeams: false,
      }),
    );
    const r = expectResolved(res);
    expect(r.topology.id).toBe("cc-main-agent-subagent");
    expect(
      r.topology.plan_trace.some((l) => l.includes("review runner")),
    ).toBe(true);
  });

  it("unknown provider reports no_host through validation", () => {
    const res = resolveExecutionTopology(
      args({
        ontoConfig: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          review: {
            subagent: { provider: "unsupported-provider", model_id: "gpt-4o" },
          } as any,
        },
        claudeHost: true,
        codexSessionActive: true,
        codexAvailable: true,
      }),
    );
    if (res.type !== "no_host") {
      throw new Error(`expected no_host, got resolved topology id=${res.topology.id}`);
    }
    expect(res.plan_trace.some((l) => l.includes("validation failed"))).toBe(true);
  });

  it("unmappable main_native shape reports no_host", () => {
    const res = resolveExecutionTopology(
      args({
        ontoConfig: {
          review: {
            subagent: { provider: "main-native" },
          },
        },
        claudeHost: false,
        codexSessionActive: false,
        codexAvailable: true,
      }),
    );
    if (res.type !== "no_host") {
      throw new Error(
        `expected no_host, got resolved topology id=${res.topology.id}`,
      );
    }
    expect(res.plan_trace.some((l) => l.includes("mapping failed"))).toBe(true);
    expect(
      res.plan_trace.some((l) =>
        l.includes("no topology resolved"),
      ),
    ).toBe(true);
  });
});

describe("resolveExecutionTopology — review absent", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("no review block + CC host → no_host", () => {
    const res = resolveExecutionTopology(
      args({
        ontoConfig: {},
        claudeHost: true,
      }),
    );
    if (res.type !== "no_host") {
      throw new Error(`expected no_host, got resolved topology id=${res.topology.id}`);
    }
    expect(res.plan_trace.some((l) => l.includes("review-axes: "))).toBe(
      false,
    );
    expect(res.plan_trace.some((l) => l.includes("no topology resolved"))).toBe(true);
  });
});
