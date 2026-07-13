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
});
