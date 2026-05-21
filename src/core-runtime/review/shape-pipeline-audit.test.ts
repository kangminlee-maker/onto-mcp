import { describe, it, expect } from "vitest";
import type { OntoReviewConfig } from "../discovery/config-chain.js";
import {
  DIRECT_SPAWN_SUPPORTED_TOPOLOGIES,
  TOPOLOGY_CATALOG,
  resolveExecutionTopology,
  type ExecutionTopologyResolution,
  type TopologyId,
} from "./execution-topology-resolver.js";
import { EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES } from "../cli/topology-executor-mapping.js";
import { shapeToTopologyId } from "./shape-to-topology-id.js";
import {
  deriveTopologyShape,
  type ShapeDerivationSignals,
  type TopologyShape,
} from "./topology-shape-derivation.js";

// ---------------------------------------------------------------------------
// P8 — 6 Shape × 7 Pipeline Step Smoke Audit
// ---------------------------------------------------------------------------
//
// Purpose: **design-integrity verification** across the 6 canonical
// TopologyShapes introduced by P1–P5. The audit answers three questions:
//
//   (1) Can each shape be derived from a valid OntoReviewConfig + signals?
//   (2) Does each shape map to a canonical TopologyId in the existing 7-
//       value catalog (not null, not generic-*)?
//   (3) For each shape, what fraction of the 7-step review pipeline is
//       currently wired for spawn-time execution vs blocked on a future
//       implementation slice (nested codex, Agent Teams deliberation)?
//
// The test is **hermetic** — no real LLM calls, no spawn. Each table row
// exercises the dispatch path (resolver + mapping + executor support set)
// and records the expected state, so regressions surface in CI instead of
// during a real review invocation.
//
// Pipeline steps referenced:
//   1. interpret         — InvocationInterpretation (topology-agnostic)
//   2. bind              — target binding + session creation (topology-agnostic)
//   3. start-session     — session artifact seed (topology-agnostic)
//   4. materialize       — prompt packets (topology-agnostic per sketch v3 §2)
//   5. dispatch lenses   — **topology-specific**, the sole shape-sensitive step
//   6. synthesize        — single-lens context, topology-agnostic
//   7. complete          — session close, topology-agnostic
//
// Only step 5 is shape-sensitive. Steps 1-4/6-7 consume the resolved
// ExecutionTopology but their behaviour is the same for any valid topology.
// The audit therefore focuses coverage on step 5 while asserting catalog
// integrity for steps 1-4/6-7.
// ---------------------------------------------------------------------------

const CLAUDE_NO_TEAMS: ShapeDerivationSignals = {
  claudeHost: true,
  codexSessionActive: false,
  experimentalAgentTeams: false,
  lensAgentTeamsMode: false,
};
const CLAUDE_TEAMS: ShapeDerivationSignals = {
  claudeHost: true,
  codexSessionActive: false,
  experimentalAgentTeams: true,
  lensAgentTeamsMode: false,
};
const CLAUDE_TEAMS_WITH_DELIBERATION: ShapeDerivationSignals = {
  claudeHost: true,
  codexSessionActive: false,
  experimentalAgentTeams: true,
  lensAgentTeamsMode: true,
};
const CODEX_HOST: ShapeDerivationSignals = {
  claudeHost: false,
  codexSessionActive: true,
  experimentalAgentTeams: false,
  lensAgentTeamsMode: false,
};
const PLAIN_TERMINAL: ShapeDerivationSignals = {
  claudeHost: false,
  codexSessionActive: false,
  experimentalAgentTeams: false,
  lensAgentTeamsMode: false,
};

interface AuditRow {
  shape: TopologyShape;
  /** Minimal axis config that drives derivation to `shape` under `signals`. */
  axes: OntoReviewConfig;
  /** Env + host signals that make the shape reachable. */
  signals: ShapeDerivationSignals;
  /** Canonical TopologyId this shape should map to under the signals. */
  expected_topology_id: TopologyId;
  /** True when the topology is in EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES. */
  expected_spawn_supported: boolean;
  /** Execution surface that owns a non-mapped spawn path. */
  blocked_on?: "nested codex teamlead" | "Agent Teams deliberation";
  /**
   * Supplementary top-level OntoConfig fields required by the resolver's
   * downstream `checkTopologyRequirements` gate for the expected topology.
   * Example: `cc-teams-lens-agent-deliberation` requires
   * `lens_agent_teams_mode: true` (double opt-in, sketch v3 §3).
   */
  config_extras?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Audit matrix — 6 rows, one per TopologyShape
// ---------------------------------------------------------------------------

const AUDIT_MATRIX: AuditRow[] = [
  {
    shape: "main_native",
    axes: {
      teamlead: { model: "main" },
      subagent: { provider: "main-native" },
    },
    signals: CLAUDE_NO_TEAMS,
    expected_topology_id: "cc-main-agent-subagent",
    expected_spawn_supported: true,
  },
  {
    shape: "main_foreign",
    axes: {
      subagent: { provider: "codex", model_id: "gpt-5.4", effort: "high" },
    },
    signals: CLAUDE_NO_TEAMS,
    expected_topology_id: "cc-main-codex-subprocess",
    expected_spawn_supported: true,
  },
  {
    shape: "main-teams_native",
    axes: {
      subagent: { provider: "main-native" },
    },
    signals: CLAUDE_TEAMS,
    expected_topology_id: "cc-teams-agent-subagent",
    expected_spawn_supported: true,
  },
  {
    shape: "main-teams_foreign",
    axes: {
      subagent: { provider: "codex", model_id: "gpt-5.4", effort: "high" },
    },
    signals: CLAUDE_TEAMS,
    expected_topology_id: "cc-teams-codex-subprocess",
    expected_spawn_supported: true,
  },
  {
    shape: "main-teams_deliberation",
    axes: {
      subagent: { provider: "main-native" },
      lens_deliberation: "controlled-lens-deliberation",
    },
    signals: CLAUDE_TEAMS_WITH_DELIBERATION,
    expected_topology_id: "cc-teams-lens-agent-deliberation",
    expected_spawn_supported: false,
    blocked_on: "Agent Teams deliberation",
    // Double opt-in gate — cc-teams-lens-agent-deliberation additionally
    // requires this config flag on top of CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
    // because keeping lens agents alive for controlled-deliberation transport materially changes the
    // memory/latency profile (sketch v3 §3).
    config_extras: { lens_agent_teams_mode: true },
  },
  {
    shape: "ext-teamlead_native",
    axes: {
      teamlead: { model: { provider: "codex", model_id: "gpt-5.4" } },
      subagent: { provider: "codex", model_id: "gpt-5.4" },
    },
    signals: PLAIN_TERMINAL,
    expected_topology_id: "codex-nested-subprocess",
    expected_spawn_supported: false,
    blocked_on: "nested codex teamlead",
  },
];

// ---------------------------------------------------------------------------
// Stage 1 — derivation correctness
// ---------------------------------------------------------------------------

describe("P8 audit — stage 1: shape derivation reaches every canonical shape", () => {
  for (const row of AUDIT_MATRIX) {
    it(`${row.shape} derives from axes + signals`, () => {
      const r = deriveTopologyShape(row.axes, row.signals);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.derived.shape).toBe(row.shape);
      }
    });
  }

  it("every shape in the audit is unique (no drift between runtime and audit matrix)", () => {
    const shapes = new Set(AUDIT_MATRIX.map((r) => r.shape));
    expect(shapes.size).toBe(AUDIT_MATRIX.length);
    expect(shapes.size).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Stage 2 — shape → TopologyId mapping
// ---------------------------------------------------------------------------

describe("P8 audit — stage 2: every shape maps to a canonical TopologyId", () => {
  for (const row of AUDIT_MATRIX) {
    it(`${row.shape} → ${row.expected_topology_id}`, () => {
      const r = deriveTopologyShape(row.axes, row.signals);
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const mapping = shapeToTopologyId({
        shape: r.derived.shape,
        subagent_provider: r.derived.subagent_provider,
        signals: {
          claudeHost: row.signals.claudeHost,
          codexSessionActive: row.signals.codexSessionActive,
        },
      });

      expect(mapping.ok).toBe(true);
      if (mapping.ok) {
        expect(mapping.topology_id).toBe(row.expected_topology_id);
        // Mapped id must exist in the catalog (no drift from TopologyId type).
        expect(TOPOLOGY_CATALOG[mapping.topology_id]).toBeDefined();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Stage 3 — resolver end-to-end (axis-first branch)
// ---------------------------------------------------------------------------

describe("P8 audit — stage 3: resolver end-to-end selects expected topology", () => {
  for (const row of AUDIT_MATRIX) {
    it(`${row.shape}: resolver picks ${row.expected_topology_id} via axis-first`, () => {
      const res: ExecutionTopologyResolution = resolveExecutionTopology({
        ontoConfig: { review: row.axes, ...(row.config_extras ?? {}) },
        claudeHost: row.signals.claudeHost,
        codexSessionActive: row.signals.codexSessionActive,
        experimentalAgentTeams: row.signals.experimentalAgentTeams,
        codexAvailable: true, // P8 audit assumes codex is present for codex-flavored shapes
      });

      if (res.type !== "resolved") {
        throw new Error(
          `expected resolved for shape=${row.shape}, got no_host: ${res.reason.slice(0, 120)}`,
        );
      }
      expect(res.topology.id).toBe(row.expected_topology_id);
      expect(
        res.topology.plan_trace.some((l) => l.includes("topology source=review-axes")),
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Stage 4 — executor mapping readiness
// ---------------------------------------------------------------------------

describe("P8 audit — stage 4: spawn-readiness per shape", () => {
  for (const row of AUDIT_MATRIX) {
    it(`${row.shape}: spawn-supported=${row.expected_spawn_supported}${
      row.blocked_on ? ` (blocked_on=${row.blocked_on})` : ""
    }`, () => {
      const supported = EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has(row.expected_topology_id);
      expect(supported).toBe(row.expected_spawn_supported);
      if (!supported) {
        expect(row.blocked_on).toBeDefined();
      }
    });
  }

  it("executor mapping support includes direct spawn support", () => {
    for (const id of DIRECT_SPAWN_SUPPORTED_TOPOLOGIES) {
      expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has(id)).toBe(true);
    }
    expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.size).toBeGreaterThan(
      DIRECT_SPAWN_SUPPORTED_TOPOLOGIES.size,
    );
  });

  it("spawn-ready shapes map into the spawn-supported TopologyIds", () => {
    const spawnReadyIds = new Set(
      AUDIT_MATRIX.filter((r) => r.expected_spawn_supported).map(
        (r) => r.expected_topology_id,
      ),
    );
    for (const id of spawnReadyIds) {
      expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has(id)).toBe(true);
    }
    const codexHostMapping = shapeToTopologyId({
      shape: "main_native",
      subagent_provider: null,
      signals: { claudeHost: false, codexSessionActive: true },
    });
    expect(codexHostMapping.ok).toBe(true);
    if (codexHostMapping.ok) {
      expect(codexHostMapping.topology_id).toBe("codex-main-subprocess");
      expect(EXECUTOR_MAPPING_SUPPORTED_TOPOLOGIES.has(codexHostMapping.topology_id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Stage 5 — pipeline step invariants (catalog integrity for steps 1-4, 6-7)
// ---------------------------------------------------------------------------

describe("P8 audit — stage 5: pipeline step invariants (topology-agnostic steps)", () => {
  // Steps 1-4, 6-7 consume ExecutionTopology as an opaque snapshot. The
  // audit verifies that the resolved topology always carries the 5
  // load-bearing fields those steps read.

  for (const row of AUDIT_MATRIX) {
    it(`${row.shape}: resolved topology exposes the 6 step-agnostic fields`, () => {
      const res = resolveExecutionTopology({
        ontoConfig: { review: row.axes, ...(row.config_extras ?? {}) },
        claudeHost: row.signals.claudeHost,
        codexSessionActive: row.signals.codexSessionActive,
        experimentalAgentTeams: row.signals.experimentalAgentTeams,
        codexAvailable: true,
      });
      if (res.type !== "resolved") {
        throw new Error(
          `expected resolved for shape=${row.shape}, got no_host`,
        );
      }
      const t = res.topology;
      // steps 1 (interpret) / 3 (start-session) read topology.id + lens_spawn_mechanism
      expect(typeof t.id).toBe("string");
      expect(typeof t.lens_spawn_mechanism).toBe("string");
      // step 2 (bind) reads teamlead_location
      expect(typeof t.teamlead_location).toBe("string");
      // step 4 (materialize) reads max_concurrent_lenses
      expect(typeof t.max_concurrent_lenses).toBe("number");
      expect(t.max_concurrent_lenses).toBeGreaterThan(0);
      // step 5 (dispatch) reads everything; step 6 (synthesize) reads deliberation_channel
      expect(typeof t.deliberation_channel).toBe("string");
      // step 7 (complete) reads plan_trace
      expect(Array.isArray(t.plan_trace)).toBe(true);
      expect(t.plan_trace.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Stage 6 — catalog non-drift (guards against future refactor regressions)
// ---------------------------------------------------------------------------

describe("P8 audit — stage 6: catalog + default priority non-drift", () => {
  it("TOPOLOGY_CATALOG contains every expected_topology_id from the audit", () => {
    for (const row of AUDIT_MATRIX) {
      expect(TOPOLOGY_CATALOG[row.expected_topology_id]).toBeDefined();
    }
  });

  it("TOPOLOGY_CATALOG exposes every audit topology id (post-P9.1 ladder-free invariant)", () => {
    // P9.1 (2026-04-21): DEFAULT_TOPOLOGY_PRIORITY is retired. The catalog
    // is now the SSOT for resolvable TopologyIds — the audit must assert
    // every expected_topology_id is materialized as a catalog entry so
    // the axis-first pipeline can produce it.
    for (const row of AUDIT_MATRIX) {
      expect(TOPOLOGY_CATALOG[row.expected_topology_id]).toBeDefined();
    }
  });

  // Note: shape-name uniqueness is already asserted in Stage 1. Not repeated
  // here — see `"every shape in the audit is unique"` above.
});
