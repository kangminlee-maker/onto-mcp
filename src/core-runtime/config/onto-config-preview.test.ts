import { describe, it, expect } from "vitest";
import type { OntoReviewConfig } from "../discovery/config-chain.js";
import {
  previewTopologyDerivation,
  renderPreview,
  type PreviewSignals,
} from "./onto-config-preview.js";

// ---------------------------------------------------------------------------
// previewTopologyDerivation — Review UX Redesign P5 (2026-04-21)
// ---------------------------------------------------------------------------
//
// These tests verify that the preview helper mirrors the runtime resolver's
// axis-first path:
//
//   (1) Happy path — a valid config + suitable host → correct shape +
//       canonical TopologyId.
//   (2) controlled-lens-deliberation without Agent Teams remains executable through the
//       controlled deliberation artifacts in the TS runner.
//   (3) Unsupported axis combinations fail loudly.
//   (4) renderPreview produces a stable human-readable block for CLI use.
// ---------------------------------------------------------------------------

const CLAUDE_NO_TEAMS: PreviewSignals = {
  claudeHost: true,
  codexSessionActive: false,
  experimentalAgentTeams: false,
  lensAgentTeamsMode: false,
};
const CLAUDE_TEAMS: PreviewSignals = {
  claudeHost: true,
  codexSessionActive: false,
  experimentalAgentTeams: true,
  lensAgentTeamsMode: false,
};
const CODEX_HOST: PreviewSignals = {
  claudeHost: false,
  codexSessionActive: true,
  experimentalAgentTeams: false,
  lensAgentTeamsMode: false,
};
const NEITHER: PreviewSignals = {
  claudeHost: false,
  codexSessionActive: false,
  experimentalAgentTeams: false,
  lensAgentTeamsMode: false,
};

describe("previewTopologyDerivation — happy paths", () => {
  it("empty config + Claude host → main_native / cc-main-agent-subagent", () => {
    const r = previewTopologyDerivation({}, CLAUDE_NO_TEAMS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shape).toBe("main_native");
      expect(r.topology_id).toBe("cc-main-agent-subagent");
    }
  });

  it("teams + main-native → main-teams_native / cc-teams-agent-subagent", () => {
    const config: OntoReviewConfig = {
      teamlead: { model: "main" },
      subagent: { provider: "main-native" },
    };
    const r = previewTopologyDerivation(config, CLAUDE_TEAMS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shape).toBe("main-teams_native");
      expect(r.topology_id).toBe("cc-teams-agent-subagent");
    }
  });

  it("Codex host + main-native → main_native / codex-main-subprocess", () => {
    const r = previewTopologyDerivation(
      { subagent: { provider: "main-native" } },
      CODEX_HOST,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shape).toBe("main_native");
      expect(r.topology_id).toBe("codex-main-subprocess");
    }
  });

  it("Codex host + codex subagent → main_foreign / codex-main-subprocess", () => {
    const r = previewTopologyDerivation(
      { subagent: { provider: "codex", model_id: "gpt-5.4" } },
      CODEX_HOST,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shape).toBe("main_foreign");
      expect(r.topology_id).toBe("codex-main-subprocess");
    }
  });
});

describe("previewTopologyDerivation — controlled deliberation transport", () => {
  it("controlled deliberation without teams → main_native with runner-owned deliberation", () => {
    const config: OntoReviewConfig = {
      subagent: { provider: "main-native" },
      lens_deliberation: "controlled-lens-deliberation",
    };
    const r = previewTopologyDerivation(config, CLAUDE_NO_TEAMS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shape).toBe("main_native");
      expect(r.topology_id).toBe("cc-main-agent-subagent");
      expect(r.trace.some((l) => l.includes("review runner"))).toBe(true);
    }
  });

  it("controlled deliberation with codex subagent stays on the codex subprocess shape", () => {
    const config: OntoReviewConfig = {
      subagent: { provider: "codex", model_id: "gpt-5.4" },
      lens_deliberation: "controlled-lens-deliberation",
    };
    const r = previewTopologyDerivation(config, CLAUDE_NO_TEAMS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shape).toBe("main_foreign");
      expect(r.topology_id).toBe("cc-main-codex-subprocess");
    }
  });
});

describe("previewTopologyDerivation — fail-loud paths", () => {
  it("main_native unmappable → preview fails with explanatory reason", () => {
    const r = previewTopologyDerivation({}, NEITHER);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("main_native shape requires");
      expect(r.trace.some((l) => l.includes("main_native"))).toBe(true);
    }
  });
});

describe("renderPreview — human-readable output", () => {
  it("success block includes shape + topology_id + trace", () => {
    const r = previewTopologyDerivation({}, CLAUDE_NO_TEAMS);
    const text = renderPreview(r);
    expect(text).toContain("Topology derivation preview");
    expect(text).toContain("shape:");
    expect(text).toContain("cc-main-agent-subagent");
    expect(text).toContain("Trace:");
  });

  it("failure block includes reason + FAILED header", () => {
    const r = previewTopologyDerivation({}, NEITHER);
    const text = renderPreview(r);
    expect(text).toContain("FAILED");
    expect(text).toContain("reason:");
  });
});
