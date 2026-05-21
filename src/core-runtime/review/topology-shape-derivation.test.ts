import { describe, it, expect } from "vitest";
import { deriveTopologyShape } from "./topology-shape-derivation.js";
import type { ShapeDerivationSignals } from "./topology-shape-derivation.js";

// ---------------------------------------------------------------------------
// deriveTopologyShape — Review UX Redesign P2 (2026-04-21)
// ---------------------------------------------------------------------------
//
// Test invariants:
//   (1) 6 shapes are reachable from valid axis configs under corresponding
//       environment signals.
//   (2) Environment-conditional branching: same axis config produces a
//       different shape based on teams availability.
//   (3) Controlled deliberation is always representable. Agent Teams is
//       selected only when the environment exposes that transport.
//   (4) External teamlead produces ext-teamlead_native regardless of other
//       axes; non-codex external teamlead rejected.
// ---------------------------------------------------------------------------

const NO_TEAMS: ShapeDerivationSignals = {
  claudeHost: true,
  codexSessionActive: false,
  experimentalAgentTeams: false,
  lensAgentTeamsMode: false,
};
const TEAMS_ON: ShapeDerivationSignals = {
  claudeHost: true,
  codexSessionActive: false,
  experimentalAgentTeams: true,
  lensAgentTeamsMode: false,
};
const TEAMS_WITH_DELIBERATION: ShapeDerivationSignals = {
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

describe("deriveTopologyShape — 6 shape happy paths", () => {
  it("main_native: empty config + no teams → flat main + native", () => {
    const r = deriveTopologyShape({}, NO_TEAMS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.derived.shape).toBe("main_native");
      expect(r.derived.subagent_provider).toBeNull();
    }
  });

  it("main_native: teamlead=main + subagent=main-native + no teams", () => {
    const r = deriveTopologyShape(
      {
        teamlead: { model: "main" },
        subagent: { provider: "main-native" },
      },
      NO_TEAMS,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.derived.shape).toBe("main_native");
  });

  it("main_foreign: subagent=codex + no teams", () => {
    const r = deriveTopologyShape(
      { subagent: { provider: "codex", model_id: "gpt-5.4" } },
      NO_TEAMS,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.derived.shape).toBe("main_foreign");
      expect(r.derived.subagent_provider).toBe("codex");
    }
  });

  it("main-teams_native: subagent=main-native + teams on", () => {
    const r = deriveTopologyShape(
      { subagent: { provider: "main-native" } },
      TEAMS_ON,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.derived.shape).toBe("main-teams_native");
      expect(r.derived.subagent_provider).toBeNull();
    }
  });

  it("main-teams_foreign: subagent=codex + teams on", () => {
    const r = deriveTopologyShape(
      { subagent: { provider: "codex", model_id: "gpt-5.4" } },
      TEAMS_ON,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.derived.shape).toBe("main-teams_foreign");
      expect(r.derived.subagent_provider).toBe("codex");
    }
  });

  it("main-teams_deliberation: main-native + controlled deliberation + teams on", () => {
    const r = deriveTopologyShape(
      {
        teamlead: { model: "main" },
        subagent: { provider: "main-native" },
        lens_deliberation: "controlled-lens-deliberation",
      },
      TEAMS_WITH_DELIBERATION,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.derived.shape).toBe("main-teams_deliberation");
  });

  it("ext-teamlead_native: teamlead=codex", () => {
    const r = deriveTopologyShape(
      {
        teamlead: {
          model: { provider: "codex", model_id: "gpt-5.4" },
        },
        subagent: { provider: "codex", model_id: "gpt-5.4" },
      },
      NO_TEAMS,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.derived.shape).toBe("ext-teamlead_native");
      expect(r.derived.subagent_provider).toBe("codex");
    }
  });
});

describe("deriveTopologyShape — environment-conditional branching", () => {
  it("same config (main+native) produces different shape per teams availability", () => {
    const config = { subagent: { provider: "main-native" } } as const;
    const r1 = deriveTopologyShape(config, NO_TEAMS);
    const r2 = deriveTopologyShape(config, TEAMS_ON);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.derived.shape).toBe("main_native");
      expect(r2.derived.shape).toBe("main-teams_native");
    }
  });

  it("Codex host with main+native → main_native (not main-teams_native since teams off)", () => {
    const r = deriveTopologyShape(
      { subagent: { provider: "main-native" } },
      CODEX_HOST,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.derived.shape).toBe("main_native");
  });
});

describe("deriveTopologyShape — controlled deliberation transport", () => {
  it("uses main_native when Agent Teams is not available", () => {
    const r = deriveTopologyShape(
      {
        subagent: { provider: "main-native" },
        lens_deliberation: "controlled-lens-deliberation",
      },
      NO_TEAMS,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.derived.shape).toBe("main_native");
      expect(r.derived.trace.some((s) => s.includes("review runner"))).toBe(true);
    }
  });

  it("keeps codex subprocess shape when subagent is codex", () => {
    const r = deriveTopologyShape(
      {
        subagent: { provider: "codex", model_id: "gpt-5.4" },
        lens_deliberation: "controlled-lens-deliberation",
      },
      TEAMS_ON,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.derived.shape).toBe("main-teams_foreign");
      expect(r.derived.subagent_provider).toBe("codex");
    }
  });

  it("uses main_foreign when both Agent Teams is absent and subagent is codex", () => {
    const r = deriveTopologyShape(
      {
        subagent: { provider: "codex", model_id: "gpt-5.4" },
        lens_deliberation: "controlled-lens-deliberation",
      },
      NO_TEAMS,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.derived.shape).toBe("main_foreign");
      expect(r.derived.subagent_provider).toBe("codex");
    }
  });
});

describe("deriveTopologyShape — external teamlead", () => {
  it("rejects non-codex external teamlead", () => {
    // Note: validator already rejects this at config load time. Cast via
    // any to bypass the TS provider union narrowing.
    const r = deriveTopologyShape(
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        teamlead: {
          model: { provider: "anthropic" as const, model_id: "claude-x" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
      NO_TEAMS,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons.some((s) => s.includes("anthropic"))).toBe(true);
    }
  });

  it("ext-teamlead_native is reached regardless of teams signal", () => {
    const r = deriveTopologyShape(
      {
        teamlead: { model: { provider: "codex", model_id: "gpt-5.4" } },
        subagent: { provider: "codex", model_id: "gpt-5.4" },
      },
      TEAMS_ON,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.derived.shape).toBe("ext-teamlead_native");
  });
});

describe("deriveTopologyShape — trace captures reasoning", () => {
  it("trace includes teamlead, subagent, teams_available lines", () => {
    const r = deriveTopologyShape(
      { subagent: { provider: "codex", model_id: "gpt-5.4" } },
      TEAMS_ON,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.derived.trace.some((l) => l.includes("teamlead"))).toBe(true);
      expect(r.derived.trace.some((l) => l.includes("subagent"))).toBe(true);
      expect(r.derived.trace.some((l) => l.includes("teams_available"))).toBe(
        true,
      );
      expect(r.derived.trace.some((l) => l.includes("shape="))).toBe(true);
    }
  });
});
