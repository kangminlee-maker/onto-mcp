import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOPOLOGY_CATALOG } from "../review/execution-topology-resolver.js";
import { tryTopologyDerivedExecutor } from "./review-invoke.js";

// ---------------------------------------------------------------------------
// Topology-derived executor dispatch invariants (P9.3, 2026-04-21):
//
// (1) Dispatch uses the resolved topology, either freshly resolved from
//     config or supplied by a caller that already resolved it.
// (2) Resolved topology whose lens_spawn_mechanism has a standalone
//     binary → returns the mapped ReviewUnitExecutorConfig (caller
//     appends subagent/model args as usual).
// (3) Resolved topology whose mechanism has NO standalone binary
//     (claude-agent-tool, claude-teamcreate-member, codex-nested's
//     teamlead location) → returns null.
// (4) No reachable host (resolver returns `no_host`) → returns null.
// (5) `[plan:executor]` STDERR line emitted on successful topology
//     derivation, so operators can see topology → binary mapping.
// ---------------------------------------------------------------------------

const FAKE_HOME = "/tmp/fake-onto-home";

describe("tryTopologyDerivedExecutor — null paths", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    delete process.env.CODEX_THREAD_ID;
    delete process.env.CODEX_CI;
    process.env.PATH = "";
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      process.env[k] = v;
    }
  });

  it("no config.review block + no host → null (resolver returns no_host)", () => {
    const result = tryTopologyDerivedExecutor({}, FAKE_HOME);
    expect(result).toBeNull();
  });

  it("no config.review block + CC host → null (cc-main-agent-subagent has no standalone binary)", () => {
    // P9.3 invariant: even without a review block the resolver maps
    // main_native → cc-main-agent-subagent under CLAUDECODE=1. That
    // topology's mechanism is claude-agent-tool which has no
    // standalone binary, so dispatch returns null for the coordinator seat.
    process.env.CLAUDECODE = "1";
    const result = tryTopologyDerivedExecutor({}, FAKE_HOME);
    expect(result).toBeNull();
  });

  it("missing ontoHome → null (required to resolve executor path)", () => {
    process.env.CLAUDECODE = "1";
    const result = tryTopologyDerivedExecutor(
      { review: { subagent: { provider: "main-native" } } },
      undefined,
    );
    expect(result).toBeNull();
  });

  it("review axis resolves to claude-agent-tool (cc-main-agent-subagent) → null (coordinator handoff is the seat)", () => {
    process.env.CLAUDECODE = "1";
    const result = tryTopologyDerivedExecutor(
      { review: { subagent: { provider: "main-native" } } },
      FAKE_HOME,
    );
    expect(result).toBeNull();
  });

  it("review axis resolves but no host signals → null (no_host case)", () => {
    // CLAUDECODE unset, no codex signals. Axis block derives to
    // main_native shape but the mapping is unreachable — no_host.
    const result = tryTopologyDerivedExecutor(
      { review: { subagent: { provider: "main-native" } } },
      FAKE_HOME,
    );
    expect(result).toBeNull();
  });

  it("review axis resolves to codex-nested-subprocess → null for external teamlead seat", () => {
    // Nested codex requires only codexAvailable; but the mapping module
    // rejects it (its teamlead is codex-subprocess, not a per-lens binary).
    // Without CLAUDECODE and with no real codex binary on the test
    // machine's PATH the resolver will return no_host; the public contract
    // remains null for this caller.
    const result = tryTopologyDerivedExecutor(
      {
        review: {
          teamlead: { model: { provider: "codex", model_id: "gpt-5.4" } },
          subagent: { provider: "codex", model_id: "gpt-5.4" },
        },
      },
      FAKE_HOME,
    );
    expect(result).toBeNull();
  });
});

describe("tryTopologyDerivedExecutor — successful derivation", () => {
  const originalEnv = { ...process.env };
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    delete process.env.CODEX_THREAD_ID;
    delete process.env.CODEX_CI;
    process.env.PATH = "";
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      process.env[k] = v;
    }
  });

  function topologyLogLines(): string[] {
    return stderrSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.startsWith("[plan:executor]"));
  }

  it("cached cc-main-codex-subprocess topology → codex executor binary", () => {
    const result = tryTopologyDerivedExecutor(
      {},
      FAKE_HOME,
      { ...TOPOLOGY_CATALOG["cc-main-codex-subprocess"], plan_trace: [] },
    );
    expect(result).not.toBeNull();
    expect(result!.bin).toBe("node");
    expect(result!.args[0]).toContain("codex-review-unit-executor.js");
    expect(result!.args[0]).toContain(FAKE_HOME);
  });

  it("successful derivation emits [plan:executor] STDERR", () => {
    tryTopologyDerivedExecutor(
      {},
      FAKE_HOME,
      { ...TOPOLOGY_CATALOG["cc-main-codex-subprocess"], plan_trace: [] },
    );
    const lines = topologyLogLines();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("topology=cc-main-codex-subprocess");
    expect(lines[0]).toContain("bin=node");
    expect(lines[0]).toContain("codex-review-unit-executor.js");
  });

  it("no [plan:executor] line when topology returns null", () => {
    // cc-main-agent-subagent has no standalone binary,
    // so no [plan:executor] line should be emitted for this derivation.
    // The resolver picks cc-main-agent-subagent via the axis block.
    process.env.CLAUDECODE = "1";
    tryTopologyDerivedExecutor(
      { review: { subagent: { provider: "main-native" } } },
      FAKE_HOME,
    );
    expect(topologyLogLines()).toHaveLength(0);
  });
});

describe("tryTopologyDerivedExecutor — cached topology decides", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    delete process.env.CODEX_THREAD_ID;
    delete process.env.CODEX_CI;
    process.env.PATH = "";
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      process.env[k] = v;
    }
  });

  it("cached topology selects the binary-backed executor", () => {
    const result = tryTopologyDerivedExecutor(
      {},
      FAKE_HOME,
      { ...TOPOLOGY_CATALOG["cc-teams-codex-subprocess"], plan_trace: [] },
    );
    expect(result).not.toBeNull();
    expect(result!.args[0]).toContain("codex-review-unit-executor.js");
  });
});
