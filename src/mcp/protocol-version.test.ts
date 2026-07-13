import { describe, expect, it } from "vitest";
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  handleRequest,
  negotiateProtocolVersion,
} from "./server.js";

// Protocol-version negotiation crosses the real initialize dispatch, not just
// the pure helper: onto hand-rolls JSON-RPC and must echo a client's requested
// revision when supported (backward compatibility) and fall back to the latest
// otherwise. These paths need no LLM provider.
describe("negotiateProtocolVersion", () => {
  it("echoes every published revision onto supports", () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      expect(negotiateProtocolVersion(version)).toBe(version);
    }
  });

  it("keeps the original 2024-11-05 client unaffected (backward compatibility)", () => {
    expect(negotiateProtocolVersion("2024-11-05")).toBe("2024-11-05");
  });

  it("falls back to the latest for unknown, older, or missing versions", () => {
    for (const requested of [
      undefined,
      null,
      "",
      "not-a-version",
      "2024-10-07",
      42,
    ]) {
      expect(negotiateProtocolVersion(requested)).toBe(LATEST_PROTOCOL_VERSION);
    }
  });

  it("advertises the current MCP revision as latest", () => {
    expect(LATEST_PROTOCOL_VERSION).toBe("2025-11-25");
  });
});

async function initializeResult(
  params: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  const response = (await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    ...(params !== undefined ? { params } : {}),
  })) as { result: Record<string, unknown> };
  return response.result;
}

describe("initialize dispatch (real handleRequest path)", () => {
  it("negotiates the client's supported version through the real handler", async () => {
    const result = await initializeResult({ protocolVersion: "2025-11-25" });
    expect(result.protocolVersion).toBe("2025-11-25");
    expect(result.capabilities).toEqual({
      tools: {},
      resources: {},
      prompts: {},
    });
    expect((result.serverInfo as { name?: string }).name).toBe("onto-mcp");
  });

  it("echoes a legacy 2024-11-05 client through the real handler", async () => {
    const result = await initializeResult({ protocolVersion: "2024-11-05" });
    expect(result.protocolVersion).toBe("2024-11-05");
  });

  it("falls back to the latest when the client omits a version", async () => {
    const result = await initializeResult(undefined);
    expect(result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });

  it("returns server orientation that points at the durable usage resource", async () => {
    const result = await initializeResult({ protocolVersion: "2025-11-25" });
    const instructions = result.instructions;
    expect(typeof instructions).toBe("string");
    expect(instructions as string).toContain("onto://usage");
    expect(instructions as string).toContain("review");
    expect(instructions as string).toContain("reconstruct");
  });
});

// The draft (RC 2026-07-28) drops `initialize` for a stateless model and adds
// `server/discover`, which RC-aware clients may use as a STDIO backward-compat
// probe. onto does not implement it; a clean -32601 (Method not found) is what
// lets those clients fall back to the initialize handshake, so lock it.
describe("graceful downgrade for draft/RC clients", () => {
  it("returns -32601 for server/discover and other unknown methods", async () => {
    for (const method of ["server/discover", "tasks/get", "logging/setLevel"]) {
      const response = (await handleRequest({
        jsonrpc: "2.0",
        id: 7,
        method,
      })) as { error?: { code?: number } };
      expect(response.error?.code).toBe(-32601);
    }
  });
});

// End-to-end: the version negotiated at initialize must gate the additive
// fields tools/list emits on the same connection. An older Claude Desktop that
// negotiates 2024-11-05 must receive pre-2025 tool definitions.
describe("initialize → tools/list gating (real connection sequence)", () => {
  async function toolsListAfterInit(
    clientVersion: string,
  ): Promise<Array<Record<string, unknown>>> {
    await handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: clientVersion },
    });
    const list = (await handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })) as { result: { tools: Array<Record<string, unknown>> } };
    return list.result.tools;
  }

  it("emits pre-2025 tool defs after a 2024-11-05 initialize", async () => {
    const tools = await toolsListAfterInit("2024-11-05");
    expect(tools.length).toBeGreaterThan(0);
    expect(
      tools.every(
        (tool) =>
          tool.annotations === undefined && tool.outputSchema === undefined,
      ),
    ).toBe(true);
  });

  it("emits annotations + outputSchema after a 2025-11-25 initialize", async () => {
    const tools = await toolsListAfterInit("2025-11-25");
    expect(tools.every((tool) => tool.annotations !== undefined)).toBe(true);
    expect(tools.some((tool) => tool.outputSchema !== undefined)).toBe(true);
  });
});
