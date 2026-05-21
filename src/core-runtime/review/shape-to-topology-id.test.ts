import { describe, it, expect } from "vitest";
import { shapeToTopologyId } from "./shape-to-topology-id.js";
import type {
  ShapeMappingInput,
  ShapeMappingSignals,
} from "./shape-to-topology-id.js";

// ---------------------------------------------------------------------------
// shapeToTopologyId — Review UX Redesign P2 (2026-04-21)
// ---------------------------------------------------------------------------
//
// Coverage:
//   (1) Design doc §4.2 Host × Shape mapping table — every listed
//       (shape, host, provider) combination has a corresponding assertion.
//   (2) Un-mapped combinations return `ok=false` with a reason.
//   (3) Trace accumulates for both success and failure — operator can read
//       STDERR and reconstruct the decision.
// ---------------------------------------------------------------------------

const CLAUDE: ShapeMappingSignals = {
  claudeHost: true,
  codexSessionActive: false,
};
const CODEX: ShapeMappingSignals = {
  claudeHost: false,
  codexSessionActive: true,
};
const NEITHER: ShapeMappingSignals = {
  claudeHost: false,
  codexSessionActive: false,
};

function input(
  shape: ShapeMappingInput["shape"],
  provider: ShapeMappingInput["subagent_provider"],
  signals: ShapeMappingSignals,
): ShapeMappingInput {
  return { shape, subagent_provider: provider, signals };
}

describe("shapeToTopologyId — main_native host branching", () => {
  it("main_native + Claude host → cc-main-agent-subagent", () => {
    const r = shapeToTopologyId(input("main_native", null, CLAUDE));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.topology_id).toBe("cc-main-agent-subagent");
  });

  it("main_native + Codex host → codex-main-subprocess", () => {
    const r = shapeToTopologyId(input("main_native", null, CODEX));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.topology_id).toBe("codex-main-subprocess");
  });

  it("main_native + neither → failure with clear reason", () => {
    const r = shapeToTopologyId(input("main_native", null, NEITHER));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("Claude Code");
      expect(r.reason).toContain("Codex CLI");
    }
  });
});

describe("shapeToTopologyId — main_foreign mapping", () => {
  it("main_foreign + codex + Claude → cc-main-codex-subprocess", () => {
    const r = shapeToTopologyId(input("main_foreign", "codex", CLAUDE));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.topology_id).toBe("cc-main-codex-subprocess");
  });

  it("main_foreign + unknown provider + Claude → unsupported", () => {
    const r = shapeToTopologyId(
      input("main_foreign", "unsupported-provider" as never, CLAUDE),
    );
    expect(r.ok).toBe(false);
  });

  it("main_foreign + null provider + Claude → unsupported", () => {
    const r = shapeToTopologyId(input("main_foreign", null, CLAUDE));
    expect(r.ok).toBe(false);
  });

  it("main_foreign + codex + Codex host → unsupported (main_foreign requires Claude host)", () => {
    const r = shapeToTopologyId(input("main_foreign", "codex", CODEX));
    expect(r.ok).toBe(false);
  });
});

describe("shapeToTopologyId — teams variants", () => {
  it("main-teams_native → cc-teams-agent-subagent (host-agnostic)", () => {
    const r = shapeToTopologyId(input("main-teams_native", null, CLAUDE));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.topology_id).toBe("cc-teams-agent-subagent");
  });

  it("main-teams_foreign + codex → cc-teams-codex-subprocess", () => {
    const r = shapeToTopologyId(input("main-teams_foreign", "codex", CLAUDE));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.topology_id).toBe("cc-teams-codex-subprocess");
  });

  it("main-teams_foreign + unknown provider → unsupported", () => {
    const r = shapeToTopologyId(
      input("main-teams_foreign", "unsupported-provider" as never, CLAUDE),
    );
    expect(r.ok).toBe(false);
  });

  it("main-teams_foreign + null provider → unsupported", () => {
    const r = shapeToTopologyId(input("main-teams_foreign", null, CLAUDE));
    expect(r.ok).toBe(false);
  });

  it("main-teams_deliberation → cc-teams-lens-agent-deliberation", () => {
    const r = shapeToTopologyId(input("main-teams_deliberation", null, CLAUDE));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.topology_id).toBe("cc-teams-lens-agent-deliberation");
  });
});

describe("shapeToTopologyId — external teamlead", () => {
  it("ext-teamlead_native → codex-nested-subprocess (host-agnostic)", () => {
    const r1 = shapeToTopologyId(input("ext-teamlead_native", "codex", CLAUDE));
    const r2 = shapeToTopologyId(input("ext-teamlead_native", "codex", CODEX));
    const r3 = shapeToTopologyId(
      input("ext-teamlead_native", "codex", NEITHER),
    );
    expect(r1.ok && r2.ok && r3.ok).toBe(true);
    if (r1.ok) expect(r1.topology_id).toBe("codex-nested-subprocess");
    if (r2.ok) expect(r2.topology_id).toBe("codex-nested-subprocess");
    if (r3.ok) expect(r3.topology_id).toBe("codex-nested-subprocess");
  });
});

describe("shapeToTopologyId — trace is populated", () => {
  it("success result carries a non-empty trace", () => {
    const r = shapeToTopologyId(input("main_native", null, CLAUDE));
    expect(r.trace.length).toBeGreaterThan(0);
    expect(r.trace.some((l) => l.includes("mapping shape"))).toBe(true);
  });

  it("failure result carries a non-empty trace", () => {
    const r = shapeToTopologyId(input("main_native", null, NEITHER));
    expect(r.trace.length).toBeGreaterThan(0);
  });
});
