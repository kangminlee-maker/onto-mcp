import { describe, expect, it } from "vitest";
import {
  OntoDeprecatedToolAliases,
  OntoReconstructToolInputSchema,
  OntoSimpleProfileToolNames,
  OntoToolNames,
} from "./tool-schemas.js";
import { advertisedToolDefinitions } from "./server.js";

// Pins the consolidated MCP tool surface from the Host Usability Roadmap
// (docs/architecture/mcp-native-tool-surface.md §Phase 1). INV-TEST-1: these
// expectations encode the intended spec, not whatever the code currently emits.
describe("MCP tool surface (Host Usability Roadmap Phase 1)", () => {
  it("advertises exactly the 12 consolidated full-profile tools", () => {
    expect([...OntoToolNames]).toEqual([
      "onto_review",
      "onto_prepare_review",
      "onto_review_continue",
      "onto_review_round",
      "onto_review_advance",
      "onto_review_cancel",
      "onto_review_read",
      "onto_observe_source",
      "onto_validate_reconstruct_directive",
      "onto_reconstruct",
      "onto_reconstruct_read",
      "onto_list",
    ]);
  });

  it("exposes an 8-tool simple profile that is a subset of full and keeps cancellation", () => {
    expect([...OntoSimpleProfileToolNames]).toEqual([
      "onto_review",
      "onto_review_read",
      "onto_review_cancel",
      "onto_reconstruct",
      "onto_observe_source",
      "onto_validate_reconstruct_directive",
      "onto_reconstruct_read",
      "onto_list",
    ]);
    const full = new Set<string>(OntoToolNames);
    for (const name of OntoSimpleProfileToolNames) {
      expect(full.has(name)).toBe(true);
    }
    // Run-control reachability: cancellation stays in the surface that starts
    // long runs (not deferred to escalation).
    expect([...OntoSimpleProfileToolNames]).toContain("onto_review_cancel");
    // Advanced orchestration is hidden in simple.
    for (const advanced of [
      "onto_prepare_review",
      "onto_review_continue",
      "onto_review_round",
      "onto_review_advance",
    ]) {
      expect([...OntoSimpleProfileToolNames]).not.toContain(advanced);
    }
  });

  it("keeps the 7 pre-consolidation names as deprecated aliases, disjoint from the advertised surface", () => {
    expect([...OntoDeprecatedToolAliases]).toEqual([
      "onto_review_status",
      "onto_review_result",
      "onto_reconstruct_status",
      "onto_reconstruct_result",
      "onto_list_lenses",
      "onto_list_domains",
      "onto_list_source_profiles",
    ]);
    const full = new Set<string>(OntoToolNames);
    for (const alias of OntoDeprecatedToolAliases) {
      expect(full.has(alias)).toBe(false);
    }
  });

  it("exposes the reconstruct tuning + opt-in judge override fields on the onto_reconstruct surface", () => {
    // The judge override (and the sibling llmEffort) must be reachable through
    // the canonical MCP host path, not only the Core API / benchmark harness.
    const parsed = OntoReconstructToolInputSchema.parse({
      targetRefs: ["schedule.csv"],
      intent: "reconstruct the schedule",
      llmEffort: "high",
      judgeLlmEffort: "high",
      judgeModel: "gpt-5.5",
    });
    expect(parsed.llmEffort).toBe("high");
    expect(parsed.judgeLlmEffort).toBe("high");
    expect(parsed.judgeModel).toBe("gpt-5.5");

    // Advertised JSON schema (what MCP clients see) carries the same fields.
    const reconstructTool = advertisedToolDefinitions().find(
      (tool) => tool.name === "onto_reconstruct",
    );
    expect(reconstructTool).toBeDefined();
    const properties = (reconstructTool!.inputSchema as {
      properties: Record<string, unknown>;
    }).properties;
    expect(properties.llmEffort).toBeDefined();
    expect(properties.judgeLlmEffort).toBeDefined();
    expect(properties.judgeModel).toBeDefined();
  });
});
