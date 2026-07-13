import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  OntoDeprecatedToolAliases,
  OntoSimpleProfileToolNames,
  OntoToolNames,
} from "./tool-schemas.js";
import { advertisedToolDefinitions, callTool } from "./server.js";

// Crosses the MCP server boundary (advertisement + dispatch), not just the
// exported name arrays: tools/list profile filtering, deprecated-alias
// callability, consolidated-tool dispatch, and onto_review_read recovery.
// These read-only paths need no LLM provider. (INV-TEST-1)

function advertisedNames(): string[] {
  return advertisedToolDefinitions().map((tool) => String(tool.name)).sort();
}

function setProfile(value: string | undefined): void {
  if (value === undefined) delete process.env.ONTO_MCP_PROFILE;
  else process.env.ONTO_MCP_PROFILE = value;
}

describe("MCP tool surface — server boundary behavior", () => {
  afterEach(() => setProfile(undefined));

  it("advertises the full profile (12) by default", () => {
    setProfile(undefined);
    expect(advertisedNames()).toEqual([...OntoToolNames].sort());
  });

  it("advertises the 8-tool simple profile under ONTO_MCP_PROFILE=simple", () => {
    setProfile("simple");
    expect(advertisedNames()).toEqual([...OntoSimpleProfileToolNames].sort());
  });

  it("normalizes whitespace/case before resolving the profile", () => {
    setProfile("  SiMpLe  ");
    expect(advertisedNames()).toEqual([...OntoSimpleProfileToolNames].sort());
  });

  it("falls back to full for an unknown profile value", () => {
    setProfile("bogus");
    expect(advertisedNames()).toEqual([...OntoToolNames].sort());
  });

  it("never advertises a deprecated alias in either profile", () => {
    for (const profile of [undefined, "simple"] as const) {
      setProfile(profile);
      const advertised = new Set(advertisedNames());
      for (const alias of OntoDeprecatedToolAliases) {
        expect(advertised.has(alias)).toBe(false);
      }
    }
  });

  it("keeps every deprecated alias callable (never 'Unknown tool')", async () => {
    const argsByAlias: Record<string, unknown> = {
      onto_review_status: { latest: true },
      onto_review_result: { sessionRoot: ".onto/review/__no_such_session__" },
      onto_reconstruct_status: { sessionRoot: ".onto/reconstruct/__no_such_session__" },
      onto_reconstruct_result: { sessionRoot: ".onto/reconstruct/__no_such_session__" },
      onto_list_lenses: {},
      onto_list_domains: {},
      onto_list_source_profiles: {},
    };
    for (const alias of OntoDeprecatedToolAliases) {
      const result = await callTool(alias, argsByAlias[alias] ?? {});
      expect(JSON.stringify(result)).not.toContain("Unknown tool");
    }
  });

  it("dispatches onto_list for every kind", async () => {
    for (const kind of ["lenses", "domains", "source_profiles"] as const) {
      const result = await callTool("onto_list", { kind });
      expect(JSON.stringify(result)).not.toContain("Unknown tool");
    }
  });

  it("onto_review_read latest=true with no sessions returns status=unknown", async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), "onto-read-empty-"));
    const result = await callTool("onto_review_read", {
      latest: true,
      projectRoot: emptyRoot,
    });
    expect(JSON.stringify(result)).toContain("\"unknown\"");
  });

  it("rejects a genuinely unknown tool name", async () => {
    const result = await callTool("onto_definitely_not_a_tool", {});
    expect(JSON.stringify(result)).toContain("Unknown tool");
  });
});

// Advisory tool annotations flow through tools/list so hosts can badge safety
// (read-only, non-destructive) and cost (open-world LLM dispatch) without
// parsing descriptions. These hints are carried unchanged into the draft/RC.
describe("MCP tool annotations", () => {
  afterEach(() => setProfile(undefined));

  function annotationsByName(): Record<
    string,
    Record<string, unknown> | undefined
  > {
    const out: Record<string, Record<string, unknown> | undefined> = {};
    for (const tool of advertisedToolDefinitions("2025-11-25")) {
      out[String(tool.name)] = tool.annotations as
        | Record<string, unknown>
        | undefined;
    }
    return out;
  }

  it("annotates every advertised tool in both profiles", () => {
    for (const profile of [undefined, "simple"] as const) {
      setProfile(profile);
      const tools = advertisedToolDefinitions("2025-11-25");
      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        const ann = tool.annotations as Record<string, unknown> | undefined;
        expect(ann, String(tool.name)).toBeDefined();
        expect(typeof ann?.title).toBe("string");
        expect(typeof ann?.readOnlyHint).toBe("boolean");
        expect(typeof ann?.destructiveHint).toBe("boolean");
        expect(typeof ann?.openWorldHint).toBe("boolean");
      }
    }
  });

  it("marks exactly the pure read/list tools read-only", () => {
    const ann = annotationsByName();
    const readOnly = Object.keys(ann)
      .filter((name) => ann[name]?.readOnlyHint === true)
      .sort();
    expect(readOnly).toEqual(
      ["onto_list", "onto_reconstruct_read", "onto_review_read"].sort(),
    );
  });

  it("never marks a tool destructive (writes are confined to .onto/)", () => {
    const ann = annotationsByName();
    for (const name of Object.keys(ann)) {
      expect(ann[name]?.destructiveHint, name).toBe(false);
    }
  });

  it("marks exactly the LLM-dispatching tools open-world", () => {
    const ann = annotationsByName();
    const openWorld = Object.keys(ann)
      .filter((name) => ann[name]?.openWorldHint === true)
      .sort();
    expect(openWorld).toEqual(
      ["onto_reconstruct", "onto_review", "onto_review_continue"].sort(),
    );
  });
});

// outputSchema is declared only where the structuredContent shape is stable
// (onto_list's per-kind envelopes); the variable-projection tools are deferred.
// The parity test drives the real handler for every kind and validates the
// actual structuredContent against the *declared* schema, so drift in either
// direction fails the build.
describe("MCP tool outputSchema (selective, parity-checked)", () => {
  function outputSchemaFor(name: string): unknown {
    return advertisedToolDefinitions("2025-11-25").find(
      (tool) => String(tool.name) === name,
    )?.outputSchema;
  }

  it("declares an anyOf output schema for onto_list", () => {
    const schema = outputSchemaFor("onto_list") as
      | { anyOf?: unknown }
      | undefined;
    expect(schema).toBeDefined();
    expect(Array.isArray(schema?.anyOf)).toBe(true);
  });

  it("real onto_list output satisfies exactly one declared branch per kind", async () => {
    const schema = outputSchemaFor("onto_list") as {
      anyOf: Array<{ required: string[] }>;
    };
    for (const kind of ["lenses", "domains", "source_profiles"] as const) {
      const result = (await callTool("onto_list", { kind })) as {
        structuredContent?: Record<string, unknown>;
      };
      const sc = result.structuredContent;
      expect(sc, kind).toBeTypeOf("object");
      const matched = schema.anyOf.filter((branch) =>
        branch.required.every(
          (key) => !!sc && key in sc && Array.isArray(sc[key]),
        ),
      );
      expect(matched.length, `kind=${kind} must match one declared branch`).toBe(
        1,
      );
    }
  });

  it("defers outputSchema for the variable-projection tools", () => {
    for (const name of [
      "onto_review_read",
      "onto_reconstruct_read",
      "onto_review",
      "onto_reconstruct",
    ]) {
      expect(outputSchemaFor(name), name).toBeUndefined();
    }
  });
});

// A client only receives an additive tool-definition field if it negotiated the
// revision that introduced it. This protects older hosts — notably an older
// Claude Desktop that negotiates 2024-11-05 — which then get byte-identical
// pre-2025 tool definitions.
describe("MCP tool-definition version gating", () => {
  afterEach(() => setProfile(undefined));

  it("emits pre-2025 tool definitions unchanged at 2024-11-05 (no annotations, no outputSchema)", () => {
    for (const tool of advertisedToolDefinitions("2024-11-05")) {
      expect(tool.annotations, String(tool.name)).toBeUndefined();
      expect(tool.outputSchema, String(tool.name)).toBeUndefined();
      expect(Object.keys(tool).sort()).toEqual([
        "description",
        "inputSchema",
        "name",
      ]);
    }
  });

  it("adds annotations but not outputSchema at 2025-03-26", () => {
    const tools = advertisedToolDefinitions("2025-03-26");
    expect(tools.every((tool) => tool.annotations !== undefined)).toBe(true);
    expect(tools.every((tool) => tool.outputSchema === undefined)).toBe(true);
  });

  it("adds outputSchema (where declared) from 2025-06-18 up", () => {
    for (const version of ["2025-06-18", "2025-11-25"] as const) {
      const list = advertisedToolDefinitions(version);
      expect(list.every((tool) => tool.annotations !== undefined)).toBe(true);
      const ontoList = list.find((tool) => String(tool.name) === "onto_list");
      expect(ontoList?.outputSchema, version).toBeDefined();
    }
  });
});
