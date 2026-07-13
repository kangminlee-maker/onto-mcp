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
    for (const tool of advertisedToolDefinitions()) {
      out[String(tool.name)] = tool.annotations as
        | Record<string, unknown>
        | undefined;
    }
    return out;
  }

  it("annotates every advertised tool in both profiles", () => {
    for (const profile of [undefined, "simple"] as const) {
      setProfile(profile);
      const tools = advertisedToolDefinitions();
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
