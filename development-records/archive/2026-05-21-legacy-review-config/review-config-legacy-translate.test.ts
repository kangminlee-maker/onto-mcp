import { describe, it, expect } from "vitest";
import {
  legacyFieldsToReviewConfig,
  legacyTopologyIdToAxes,
} from "./review-config-legacy-translate.js";

// ---------------------------------------------------------------------------
// legacy translation — Review UX Redesign P1 (2026-04-20)
// ---------------------------------------------------------------------------
//
// Authoritative mapping table: design doc §7.2.
// - 8 known legacy topology ids → partial axes (each with specific runtime
//   preconditions where applicable).
// - 2 generic-* ids → null (dropped from v3 catalog).
// - unknown ids → null.
//
// legacyFieldsToReviewConfig also overlays model_id / effort from legacy
// per-provider blocks (codex.* / litellm.* / etc.) into the translated axes.
// ---------------------------------------------------------------------------

describe("legacyTopologyIdToAxes — §7.2 mapping table", () => {
  it("cc-main-agent-subagent → teamlead=main, subagent=main-native", () => {
    const a = legacyTopologyIdToAxes("cc-main-agent-subagent");
    expect(a).not.toBeNull();
    expect(a?.teamlead).toEqual({ model: "main" });
    expect(a?.subagent).toEqual({ provider: "main-native" });
    expect(a?.runtime_preconditions).toEqual({});
  });

  it("cc-main-codex-subprocess → teamlead=main, subagent=codex", () => {
    const a = legacyTopologyIdToAxes("cc-main-codex-subprocess");
    expect(a?.subagent).toMatchObject({ provider: "codex" });
    expect(a?.runtime_preconditions).toEqual({});
  });

  it("cc-teams-agent-subagent → requires_agent_teams_env=true", () => {
    const a = legacyTopologyIdToAxes("cc-teams-agent-subagent");
    expect(a?.subagent).toEqual({ provider: "main-native" });
    expect(a?.runtime_preconditions.requires_agent_teams_env).toBe(true);
  });

  it("cc-teams-codex-subprocess → requires_agent_teams_env=true + codex", () => {
    const a = legacyTopologyIdToAxes("cc-teams-codex-subprocess");
    expect(a?.subagent).toMatchObject({ provider: "codex" });
    expect(a?.runtime_preconditions.requires_agent_teams_env).toBe(true);
  });

  it("cc-teams-litellm-sessions → requires_agent_teams_env=true + litellm", () => {
    const a = legacyTopologyIdToAxes("cc-teams-litellm-sessions");
    expect(a?.subagent).toMatchObject({ provider: "litellm" });
    expect(a?.runtime_preconditions.requires_agent_teams_env).toBe(true);
  });

  it("cc-teams-lens-agent-deliberation → lens_deliberation=sendmessage-a2a", () => {
    const a = legacyTopologyIdToAxes("cc-teams-lens-agent-deliberation");
    expect(a?.subagent).toEqual({ provider: "main-native" });
    expect(a?.lens_deliberation).toBe("sendmessage-a2a");
    expect(a?.runtime_preconditions.requires_agent_teams_env).toBe(true);
  });

  it("codex-main-subprocess → implies_host_codex=true", () => {
    const a = legacyTopologyIdToAxes("codex-main-subprocess");
    expect(a?.subagent).toEqual({ provider: "main-native" });
    expect(a?.runtime_preconditions.implies_host_codex).toBe(true);
  });

  it("codex-nested-subprocess → external teamlead=codex + plain-terminal host", () => {
    const a = legacyTopologyIdToAxes("codex-nested-subprocess");
    expect(a?.teamlead?.model).toMatchObject({ provider: "codex" });
    expect(a?.subagent).toMatchObject({ provider: "codex" });
    expect(a?.runtime_preconditions.implies_host_plain_terminal).toBe(true);
  });

  it("generic-nested-subagent → null (dropped from v3 catalog)", () => {
    expect(legacyTopologyIdToAxes("generic-nested-subagent")).toBeNull();
  });

  it("generic-main-subagent → null (dropped from v3 catalog)", () => {
    expect(legacyTopologyIdToAxes("generic-main-subagent")).toBeNull();
  });

  it("unknown id → null", () => {
    expect(legacyTopologyIdToAxes("not-a-real-topology")).toBeNull();
    expect(legacyTopologyIdToAxes("")).toBeNull();
  });
});

describe("legacyFieldsToReviewConfig — overlay provider blocks", () => {
  it("returns null when no execution_topology_priority", () => {
    expect(legacyFieldsToReviewConfig({})).toBeNull();
    expect(
      legacyFieldsToReviewConfig({ codex: { model: "gpt-5.4" } }),
    ).toBeNull();
  });

  it("returns null for empty priority array", () => {
    expect(
      legacyFieldsToReviewConfig({ execution_topology_priority: [] }),
    ).toBeNull();
  });

  it("uses first entry of priority array", () => {
    const r = legacyFieldsToReviewConfig({
      execution_topology_priority: [
        "cc-main-codex-subprocess",
        "codex-main-subprocess",
      ],
      codex: { model: "gpt-5.4", effort: "high" },
    });
    expect(r).not.toBeNull();
    expect(r?.source_topology_id).toBe("cc-main-codex-subprocess");
    expect(r?.config.subagent).toEqual({
      provider: "codex",
      model_id: "gpt-5.4",
      effort: "high",
    });
  });

  it("overlays codex.model + codex.effort into subagent axes", () => {
    const r = legacyFieldsToReviewConfig({
      execution_topology_priority: ["cc-teams-codex-subprocess"],
      codex: { model: "gpt-5.4-preview", effort: "xhigh" },
    });
    expect(r?.config.subagent).toEqual({
      provider: "codex",
      model_id: "gpt-5.4-preview",
      effort: "xhigh",
    });
    expect(r?.runtime_preconditions.requires_agent_teams_env).toBe(true);
  });

  it("overlays litellm.model into litellm subagent", () => {
    const r = legacyFieldsToReviewConfig({
      execution_topology_priority: ["cc-teams-litellm-sessions"],
      litellm: { model: "llama-8b" },
    });
    expect(r?.config.subagent).toMatchObject({
      provider: "litellm",
      model_id: "llama-8b",
    });
  });

  it("warns when foreign provider block has no model", () => {
    const r = legacyFieldsToReviewConfig({
      execution_topology_priority: ["cc-main-codex-subprocess"],
      // codex block absent — no model to overlay
    });
    expect(r).not.toBeNull();
    expect(r?.warnings.some((w) => w.includes("model_id"))).toBe(true);
  });

  it("preserves lens_deliberation for deliberation topology", () => {
    const r = legacyFieldsToReviewConfig({
      execution_topology_priority: ["cc-teams-lens-agent-deliberation"],
    });
    expect(r?.config.lens_deliberation).toBe("sendmessage-a2a");
  });

  it("codex-nested overlays codex.model into both teamlead and subagent", () => {
    const r = legacyFieldsToReviewConfig({
      execution_topology_priority: ["codex-nested-subprocess"],
      codex: { model: "gpt-5.4", effort: "high" },
    });
    expect(r?.config.teamlead?.model).toEqual({
      provider: "codex",
      model_id: "gpt-5.4",
      effort: "high",
    });
    expect(r?.config.subagent).toEqual({
      provider: "codex",
      model_id: "gpt-5.4",
      effort: "high",
    });
    expect(r?.runtime_preconditions.implies_host_plain_terminal).toBe(true);
  });

  it("returns null when first priority entry is generic-*", () => {
    const r = legacyFieldsToReviewConfig({
      execution_topology_priority: ["generic-main-subagent"],
    });
    expect(r).toBeNull();
  });

  it("rejects non-string first entry gracefully", () => {
    const r = legacyFieldsToReviewConfig({
      execution_topology_priority: [42, "cc-main-agent-subagent"],
    });
    expect(r).toBeNull();
  });
});
