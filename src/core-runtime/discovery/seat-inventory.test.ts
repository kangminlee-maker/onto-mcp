import { describe, expect, it } from "vitest";
import {
  collectSeatInventory,
  renderSeatInventoryTable,
} from "./seat-inventory.js";
import type { OntoSettings } from "./settings-chain.js";

/** Minimal v3 settings with a review actor + one unit override, plus a
 * reconstruct actor — enough to exercise explicit / inherited / unset. */
function settings(over: Record<string, unknown> = {}): OntoSettings {
  return {
    schema_version: "settings.json/v3",
    review: {
      execution: {
        actors: {
          lens: { llm: { provider: "openai", model: "gpt-5.5", effort: "high" } },
        },
        units: {
          // explicit: sets its own model + effort
          issue_stance_response: {
            llm: { provider: "openai", model: "gpt-5.6-sol", effort: "low" },
          },
          // inherited: a partial (provider-only) override — model + effort
          // are inherited from the lens actor.
          deliberation_response: { llm: { provider: "openai" } },
        },
      },
    },
    ...over,
  } as unknown as OntoSettings;
}

function rowFor(
  rows: ReturnType<typeof collectSeatInventory>,
  path: string,
) {
  return rows.find((row) => row.path === path);
}

describe("collectSeatInventory", () => {
  it("labels a unit that sets its own model as explicit, with its own effort", () => {
    const rows = collectSeatInventory(settings());
    const row = rowFor(rows, "review.execution.units.issue_stance_response.llm");
    expect(row).toMatchObject({
      role: "review",
      provider: "openai",
      model: "gpt-5.6-sol",
      effort: "low",
      provenance: "explicit",
    });
  });

  it("labels a unit without an own model as inherited, resolving model + effort from its actor", () => {
    const rows = collectSeatInventory(settings());
    const row = rowFor(rows, "review.execution.units.deliberation_response.llm");
    expect(row).toMatchObject({
      role: "review",
      provider: "openai",
      model: "gpt-5.5", // from the lens actor
      effort: "high", // inherited actor effort
      provenance: "inherited",
      inheritedFrom: "review.execution.actors.lens.llm",
    });
  });

  it("always surfaces the answer_support_judge named dispatch as unset when no seat configures it", () => {
    const rows = collectSeatInventory(settings());
    const judge = rows.filter((row) => row.role === "answer_support_judge");
    expect(judge).toHaveLength(1);
    expect(judge[0]).toMatchObject({
      provenance: "unset",
      model: undefined,
      path: "(dispatch) request_judge",
    });
  });

  it("surfaces semantic_map_verify as an unset named dispatch when no dispatch_fallback llm is set", () => {
    const rows = collectSeatInventory(settings());
    const verify = rows.filter((row) => row.role === "semantic_map_verify");
    expect(verify).toHaveLength(1);
    expect(verify[0]?.provenance).toBe("unset");
  });

  it("splits a configured reconstruct dispatch_fallback llm into synthesize + verify seats (no unset verify duplicate)", () => {
    const rows = collectSeatInventory(
      settings({
        reconstruct: {
          execution: {
            dispatch_fallback: {
              enabled: true,
              llm: { provider: "openai", model: "gpt-5.5", effort: "medium" },
            },
          },
        },
      }),
    );
    const verifyRows = rows.filter((row) => row.role === "semantic_map_verify");
    // Exactly one verify seat — the configured fallback split, not the unset
    // named-dispatch placeholder.
    expect(verifyRows).toHaveLength(1);
    expect(verifyRows[0]).toMatchObject({
      model: "gpt-5.5",
      effort: "medium",
      provenance: "explicit",
    });
    expect(verifyRows[0]?.path).toContain("#semantic_map_verify");
  });

  it("renders an aligned table with a header", () => {
    const table = renderSeatInventoryTable(collectSeatInventory(settings()));
    const [header] = table.split("\n");
    expect(header).toContain("ROLE");
    expect(header).toContain("SEAT");
    expect(table).toContain("review.execution.units.issue_stance_response.llm");
  });
});
