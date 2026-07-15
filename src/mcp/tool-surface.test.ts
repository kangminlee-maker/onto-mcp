import { describe, expect, it } from "vitest";
import {
  OntoDeprecatedToolAliases,
  OntoReconstructToolInputSchema,
  OntoReviewToolInputSchema,
  OntoSimpleProfileToolNames,
  OntoToolNames,
} from "./tool-schemas.js";
import { advertisedToolDefinitions, USAGE_GUIDE } from "./server.js";

function advertisedProperties(toolName: string): Record<string, unknown> {
  const tool = advertisedToolDefinitions().find((t) => t.name === toolName);
  expect(tool).toBeDefined();
  return (tool!.inputSchema as { properties: Record<string, unknown> }).properties;
}

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

  it("exposes the opt-in judge override fields on the onto_reconstruct surface", () => {
    // The judge overrides must be reachable through the canonical MCP host path,
    // not only the Core API / benchmark harness.
    const parsed = OntoReconstructToolInputSchema.parse({
      targetRefs: ["schedule.csv"],
      intent: "reconstruct the schedule",
      judgeLlmEffort: "high",
      judgeModel: "gpt-5.5",
    });
    expect(parsed.judgeLlmEffort).toBe("high");
    expect(parsed.judgeModel).toBe("gpt-5.5");

    // Advertised JSON schema (what MCP clients see) carries the same fields.
    const properties = advertisedProperties("onto_reconstruct");
    expect(properties.judgeLlmEffort).toBeDefined();
    expect(properties.judgeModel).toBeDefined();
  });

  it("exposes the per-call llmOverride and has removed llmEffort on review + reconstruct", () => {
    // llmOverride replaces the removed llmEffort (design v4 §6(a)): reachable on
    // both the zod parse surface and the advertised JSON schema, for review and
    // reconstruct; llmEffort is gone from both.
    const reconstructParsed = OntoReconstructToolInputSchema.parse({
      targetRefs: ["schedule.csv"],
      intent: "reconstruct the schedule",
      llmOverride: { provider: "anthropic", auth: "oauth", model: "claude-opus-4-8" },
    });
    expect(reconstructParsed.llmOverride).toEqual({
      provider: "anthropic",
      auth: "oauth",
      model: "claude-opus-4-8",
    });
    expect("llmEffort" in reconstructParsed).toBe(false);

    const reviewParsed = OntoReviewToolInputSchema.parse({
      target: "src/x.ts",
      intent: "review it",
      llmOverride: { effort: "high" },
    });
    expect(reviewParsed.llmOverride).toEqual({ effort: "high" });

    // Refine: a provider switch requires an explicit model on both surfaces.
    expect(() =>
      OntoReconstructToolInputSchema.parse({
        targetRefs: ["schedule.csv"],
        intent: "reconstruct the schedule",
        llmOverride: { provider: "anthropic" },
      })
    ).toThrow();
    expect(() =>
      OntoReviewToolInputSchema.parse({
        target: "src/x.ts",
        intent: "review it",
        llmOverride: { provider: "anthropic" },
      })
    ).toThrow();

    // Advertised JSON schema: llmOverride present, llmEffort removed, on both.
    for (const toolName of ["onto_review", "onto_reconstruct"]) {
      const properties = advertisedProperties(toolName);
      expect(properties.llmOverride).toBeDefined();
      expect(properties.llmEffort).toBeUndefined();
      // The advertised contract must carry the same provider->model condition the
      // zod boundary enforces, so a client reading tools/list learns it there
      // instead of from a rejection. Excluded credential/endpoint fields must
      // stay absent from the advertised surface too.
      const llmOverride = properties.llmOverride as Record<string, unknown>;
      expect(llmOverride.additionalProperties).toBe(false);
      expect(llmOverride.if).toEqual({ required: ["provider"] });
      expect(llmOverride.then).toEqual({ required: ["model"] });
      expect(llmOverride.dependentRequired).toEqual({ provider: ["model"] });
      const overrideProps = llmOverride.properties as Record<string, unknown>;
      expect(Object.keys(overrideProps).sort()).toEqual(
        ["auth", "effort", "model", "provider", "service_tier"],
      );
      for (const excluded of ["base_url", "api_key_env", "timeout_ms"]) {
        expect(overrideProps[excluded]).toBeUndefined();
      }
    }
    for (const toolName of ["onto_review", "onto_reconstruct"]) {
      const tool = advertisedToolDefinitions().find((t) => t.name === toolName);
      expect(JSON.stringify(tool!.inputSchema)).not.toContain("llmEffort");
    }
  });

  it("does not expose a benchCandidate escape hatch on the onto_reconstruct product surface", () => {
    expect(() =>
      OntoReconstructToolInputSchema.parse({
        targetRefs: ["schedule.csv"],
        intent: "reconstruct the schedule",
        benchCandidate: { provider: "anthropic", model: "candidate" },
      })
    ).toThrow();

    const reconstructTool = advertisedToolDefinitions().find(
      (tool) => tool.name === "onto_reconstruct",
    );
    expect(reconstructTool).toBeDefined();
    const properties = (reconstructTool!.inputSchema as {
      properties: Record<string, unknown>;
    }).properties;
    expect(properties.benchCandidate).toBeUndefined();
    expect(JSON.stringify(reconstructTool!.inputSchema)).not.toContain(
      "benchCandidate",
    );
  });
});

// §4-6b: onto_review_continue is the DEFAULT operational resume for a
// halted/timed-out review, and the host guidance must keep it distinct from the
// continue_review finding action-candidate (evidence-boundary expansion). These
// assertions are discriminating: the pre-§4-6b conditional framing (no "default"
// resume role, no continue_review disambiguation) fails them.
describe("review continuation default guidance (§4-6b)", () => {
  const continueDescription = (): string => {
    const tool = advertisedToolDefinitions().find(
      (entry) => entry.name === "onto_review_continue",
    );
    expect(tool).toBeDefined();
    return String(tool!.description);
  };

  it("frames onto_review_continue as the default resume for halted/timed-out sessions", () => {
    const description = continueDescription();
    expect(description).toMatch(/default way to resume/i);
    expect(description).toMatch(/halted/i);
    // Prefer resuming over restarting a fresh review.
    expect(description).toMatch(/prefer this over starting a new onto_review/i);
  });

  it("disambiguates the operational resume from the continue_review action-candidate", () => {
    const description = continueDescription();
    // Names the colliding concept explicitly and marks it as NOT the same thing.
    expect(description).toContain("continue_review");
    expect(description).toMatch(/not the continue_review|distinct from/i);
    expect(description).toMatch(/expand/i);
  });

  it("teaches the halt→continue default in the usage guide, distinct from continue_review", () => {
    // Happy-path resume step: halted + continuationAvailable → onto_review_continue.
    expect(USAGE_GUIDE).toMatch(/halted/i);
    expect(USAGE_GUIDE).toContain("default next action is `onto_review_continue`");
    expect(USAGE_GUIDE).toContain("continuationAvailable");
    // Same disambiguation carried into the reference guide.
    expect(USAGE_GUIDE).toContain("continue_review");
  });
});
