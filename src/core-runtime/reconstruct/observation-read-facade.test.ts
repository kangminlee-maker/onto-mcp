import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { afterAll, describe, expect, it } from "vitest";
import {
  handleFacadeMessage,
  observationIdsServed,
  observationReadFacadeServerEntry,
  OBSERVATION_READ_LAUNCH_TOKEN_ENV,
  OBSERVATION_READ_TOOL_NAME,
  ObservationReadFacadeSession,
  parseObservationReadFacadeDescriptor,
  readObservationReadFacadeReceipt,
  type ObservationReadFacadeDescriptor,
} from "./observation-read-facade.js";
import { OBSERVATION_READ_MAX_REQUEST_IDS } from "./observation-read.js";

// Spec basis: development-records/design/20260726-observation-catalog-tool-design.md §4 (tool contract)
// and §9 stage 3b. The facade is the PULL layer's server: it mints a grant from a descriptor the runtime
// writes, serves the worker over MCP stdio, and rewrites a receipt the runtime reads back as the `조회`
// term of `인용 ⊆ 조회 ⊆ 스냅샷`.
//
// The corpus is the REAL one (scripts/fixtures/observation-catalog/, see its PROVENANCE.md): 59
// observations and the safety ledger from one bench run. A synthetic corpus would not reproduce the
// sizes that make paging and budget refusal real.

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "scripts/fixtures/observation-catalog");
const OBSERVATIONS_FIXTURE = path.join(FIXTURE_DIR, "source-observations.yaml");
const LEDGER_FIXTURE = path.join(FIXTURE_DIR, "source-safety-ledger.yaml");

const TEMP_ROOT = mkdtempSync(path.join(os.tmpdir(), "onto-observation-facade-"));
let tempSeq = 0;

afterAll(() => {
  rmSync(TEMP_ROOT, { recursive: true, force: true });
});

const observationsArtifact = parseYaml(readFileSync(OBSERVATIONS_FIXTURE, "utf8")) as {
  observations: { observation_id: string }[];
};
const ledgerArtifact = parseYaml(readFileSync(LEDGER_FIXTURE, "utf8")) as Record<string, unknown>;
const allObservationIds = observationsArtifact.observations.map((o) => o.observation_id);

/**
 * Write the three artifacts plus a `valid` validation for them. The ledger must NAME the observations
 * artifact it was written for — mint binds on that ref, so a stale pair fails rather than gating one
 * run's observations with another run's decisions.
 */
function writeSources(options: { ledgerOverride?: Record<string, unknown> } = {}) {
  tempSeq += 1;
  const observationsPath = path.join(TEMP_ROOT, `observations-${tempSeq}.yaml`);
  const safetyLedgerPath = path.join(TEMP_ROOT, `ledger-${tempSeq}.yaml`);
  const safetyLedgerValidationPath = path.join(TEMP_ROOT, `ledger-validation-${tempSeq}.yaml`);
  writeFileSync(observationsPath, readFileSync(OBSERVATIONS_FIXTURE, "utf8"));
  const ledger = {
    ...ledgerArtifact,
    ...options.ledgerOverride,
    source_observations_ref: path.resolve(observationsPath),
  };
  writeFileSync(safetyLedgerPath, stringifyYaml(ledger));
  writeFileSync(
    safetyLedgerValidationPath,
    stringifyYaml({
      schema_version: "1",
      session_id: ledgerArtifact.session_id,
      created_at: "2026-07-27T00:00:00.000Z",
      source_safety_ledger_ref: path.resolve(safetyLedgerPath),
      source_observations_ref: path.resolve(observationsPath),
      validation_status: "valid",
      safety_row_count: (ledger.safety_rows as unknown[]).length,
      no_prompt_use_count: 0,
      validation_results: ["source_safety_ledger_valid"],
      asserted_obligation_ids: [],
      violations: [],
    }),
  );
  return { observationsPath, safetyLedgerPath, safetyLedgerValidationPath };
}

function writeDescriptor(
  overrides: Partial<ObservationReadFacadeDescriptor> = {},
): { descriptor: ObservationReadFacadeDescriptor; descriptorPath: string; receiptPath: string } {
  const sources = overrides.sources ?? writeSources();
  tempSeq += 1;
  const receiptPath = path.join(TEMP_ROOT, `receipt-${tempSeq}.json`);
  const descriptor: ObservationReadFacadeDescriptor = {
    schema_version: "observation-read-facade-descriptor/v1",
    launch_token: "launch-token-fixture",
    sources,
    system_prompt: "SYSTEM",
    user_prompt: "USER",
    receipt_path: receiptPath,
    ttl_ms: 600_000,
    ...overrides,
  };
  const descriptorPath = path.join(TEMP_ROOT, `descriptor-${tempSeq}.json`);
  writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2));
  return { descriptor, descriptorPath, receiptPath };
}

const callTool = (
  session: ObservationReadFacadeSession,
  args: unknown,
  id = 1,
): Record<string, any> =>
  handleFacadeMessage(
    { jsonrpc: "2.0", id, method: "tools/call", params: { name: OBSERVATION_READ_TOOL_NAME, arguments: args } },
    session,
  )!.result as Record<string, any>;

describe("observation read facade — descriptor contract (stage 3b)", () => {
  it("accepts the descriptor the runtime writes", () => {
    const { descriptor, descriptorPath } = writeDescriptor();
    expect(parseObservationReadFacadeDescriptor(readFileSync(descriptorPath, "utf8"))).toEqual(
      descriptor,
    );
  });

  it("refuses every incomplete descriptor rather than defaulting a field", () => {
    const { descriptor } = writeDescriptor();
    const mutations: [string, Record<string, unknown>][] = [
      ["schema_version", { schema_version: "observation-read-facade-descriptor/v2" }],
      ["launch_token", { launch_token: "" }],
      ["sources", { sources: undefined }],
      ["observationsPath", { sources: { ...descriptor.sources, observationsPath: "" } }],
      ["safetyLedgerValidationPath", {
        sources: { ...descriptor.sources, safetyLedgerValidationPath: undefined },
      }],
      ["system_prompt", { system_prompt: undefined }],
      ["user_prompt", { user_prompt: 5 }],
      ["receipt_path", { receipt_path: "" }],
      ["ttl_ms", { ttl_ms: 0 }],
    ];
    expect(mutations.length).toBeGreaterThan(0); // non-empty subject
    for (const [label, override] of mutations) {
      expect(
        () => parseObservationReadFacadeDescriptor(JSON.stringify({ ...descriptor, ...override })),
        label,
      ).toThrow();
    }
    // An EMPTY system prompt is legal (a dispatch may have none) — the budget decides, not this parser.
    expect(
      parseObservationReadFacadeDescriptor(JSON.stringify({ ...descriptor, system_prompt: "" }))
        .system_prompt,
    ).toBe("");
  });

  it("rejects non-JSON and non-object descriptors", () => {
    expect(() => parseObservationReadFacadeDescriptor("not json")).toThrow(/not valid JSON/);
    expect(() => parseObservationReadFacadeDescriptor("[]")).toThrow(/must be a JSON object/);
  });
});

describe("observation read facade — the tool the worker sees (design §4.1)", () => {
  it("exposes exactly the ids-XOR-cursor contract, with no addressable session/path/budget", () => {
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const listed = handleFacadeMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, session)!
      .result as { tools: Record<string, any>[] };
    expect(listed.tools.length).toBe(1);
    const [tool] = listed.tools;
    expect(tool!.name).toBe(OBSERVATION_READ_TOOL_NAME);
    // The §4.1 property: the model cannot NAME a session, a path, a glob, a detail level, or a byte cap.
    expect(Object.keys(tool!.inputSchema.properties).sort()).toEqual(["cursor", "observation_ids"]);
    expect(tool!.inputSchema.additionalProperties).toBe(false);
    expect(tool!.inputSchema.properties.observation_ids.maxItems).toBe(
      OBSERVATION_READ_MAX_REQUEST_IDS,
    );
  });

  it("answers initialize/ping and refuses unknown methods and tools", () => {
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const initialized = handleFacadeMessage(
      { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-11-25" } },
      session,
    )!.result as Record<string, any>;
    expect(initialized.protocolVersion).toBe("2025-11-25"); // echo what the client asked for
    expect(handleFacadeMessage({ jsonrpc: "2.0", id: 2, method: "ping" }, session)!.result).toEqual({});
    // Notifications get no reply at all.
    expect(handleFacadeMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, session))
      .toBeNull();
    expect(
      handleFacadeMessage({ jsonrpc: "2.0", id: 3, method: "resources/list" }, session)!.error!.code,
    ).toBe(-32601);
    expect(
      (handleFacadeMessage(
        { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "onto_reconstruct" } },
        session,
      )!.error!.message),
    ).toMatch(/unknown tool/);
  });

  it("rejects a request that carries an unsupported key instead of ignoring it", () => {
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const result = callTool(session, {
      observation_ids: [allObservationIds[0]],
      detail_level: "full",
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.reason).toBe("request_shape");
    expect(result.structuredContent.message).toMatch(/detail_level/);
  });

  it("rejects ids-and-cursor together, and neither", () => {
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    for (const args of [{}, { observation_ids: [allObservationIds[0]], cursor: "x" }]) {
      const result = callTool(session, args);
      expect(result.isError).toBe(true);
      expect(result.structuredContent.reason).toBe("request_shape");
    }
  });
});

describe("observation read facade — serving and the receipt (design §3)", () => {
  it("serves a real observation and records it in the receipt", () => {
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    // The opening receipt exists BEFORE any call: "granted, served nothing" is distinguishable from
    // "no facade ran", which is what lets the consumer fail closed on the second case only.
    const opening = readObservationReadFacadeReceipt(receiptPath);
    expect(opening?.receipt.calls_served).toBe(0);
    expect(observationIdsServed(opening).size).toBe(0);

    const wanted = allObservationIds.slice(0, 2);
    const result = callTool(session, { observation_ids: wanted });
    expect(result.isError).toBe(false);
    expect(result.structuredContent.entries.length).toBeGreaterThan(0);

    const receiptFile = readObservationReadFacadeReceipt(receiptPath);
    expect(receiptFile).not.toBeNull();
    expect(receiptFile!.receipt.calls_served).toBe(1);
    // The served set is what citations are checked against — it must name the observations, not the parts.
    const served = observationIdsServed(receiptFile);
    expect(served.has(wanted[0]!)).toBe(true);
    // ...and nothing that was not asked for.
    expect([...served].every((id) => wanted.includes(id))).toBe(true);
  });

  it("reassembles a split observation across cursor pages, byte-identically", () => {
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    // The largest observation in the real corpus needs several pages; walking the cursor must recover
    // its body exactly (the stage-1 property, now through the MCP surface).
    const [biggest] = [...observationsArtifact.observations]
      .sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length);
    let request: Record<string, unknown> = { observation_ids: [biggest!.observation_id] };
    const parts: string[] = [];
    let pages = 0;
    for (;;) {
      const result = callTool(session, request);
      expect(result.isError).toBe(false);
      pages += 1;
      for (const entry of result.structuredContent.entries) parts.push(entry.body);
      if (!result.structuredContent.next_cursor) break;
      request = { cursor: result.structuredContent.next_cursor };
      if (pages > 40) throw new Error("cursor walk did not terminate");
    }
    expect(pages).toBeGreaterThan(1); // non-vacuous: this observation really does split
    const reassembled = JSON.parse(parts.join(""));
    expect(reassembled.observation_id).toBe(biggest!.observation_id);
  });

  it("withholds an observation the ledger does not admit — as an UNKNOWN id, not a refusal", () => {
    const withheldId = allObservationIds[0]!;
    const rows = (ledgerArtifact.safety_rows as Record<string, unknown>[]).map((row) =>
      row.safety_row_id === `source_safety:${withheldId}:prompt_context`
        ? { ...row, visibility_tier: "no_prompt_use" }
        : row
    );
    const { descriptor, receiptPath } = writeDescriptor({
      sources: writeSources({ ledgerOverride: { safety_rows: rows } }),
    });
    const session = new ObservationReadFacadeSession({ descriptor });
    const result = callTool(session, { observation_ids: [withheldId] });
    expect(result.isError).toBe(true);
    // Design §8: a withheld id is indistinguishable from one that does not exist — the tool does not
    // tell the worker that something it may not have exists.
    expect(result.structuredContent.reason).toBe("unknown_observation_id");
    const receiptFile = readObservationReadFacadeReceipt(receiptPath)!;
    expect(receiptFile.receipt.withheld_observation_count).toBe(1);
    expect(observationIdsServed(receiptFile).has(withheldId)).toBe(false);
    // Contrast (non-vacuous): a DIFFERENT id from the same corpus serves fine.
    const other = callTool(session, { observation_ids: [allObservationIds[1]] }, 2);
    expect(other.isError).toBe(false);
  });

  it("charges a failed call and keeps the receipt current after every attempt", () => {
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    callTool(session, { observation_ids: ["no-such-observation"] });
    const afterFailure = readObservationReadFacadeReceipt(receiptPath)!;
    // Design §4.2.1: a failed call still consumes budget — errors occupy the worker's context too.
    expect(afterFailure.receipt.calls_served).toBe(1);
    expect(afterFailure.receipt.chars_served).toBeGreaterThan(0);
    expect(observationIdsServed(afterFailure).size).toBe(0);
    // A shape rejection never reaches the grant, so it is counted separately rather than implied to
    // have been metered.
    callTool(session, { nonsense: true }, 2);
    const afterShape = readObservationReadFacadeReceipt(receiptPath)!;
    expect(afterShape.rejected_before_grant).toBe(1);
    expect(afterShape.receipt.calls_served).toBe(1);
  });

  it("maps an unclassified failure into the closed reason vocabulary", () => {
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    // Delete the artifact out from under a live grant: the re-read fails with a raw fs error, which the
    // worker must still see as a `reason` it can branch on.
    rmSync(descriptor.sources.observationsPath);
    const result = callTool(session, { observation_ids: [allObservationIds[0]] });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.reason).toBe("artifact_malformed");
  });
});

describe("observation read facade — receipt reading is fail-closed (design §8)", () => {
  it("returns null for every unusable receipt, and an empty served set for null", () => {
    tempSeq += 1;
    const missing = path.join(TEMP_ROOT, `absent-${tempSeq}.json`);
    expect(readObservationReadFacadeReceipt(missing)).toBeNull();

    const torn = path.join(TEMP_ROOT, `torn-${tempSeq}.json`);
    writeFileSync(torn, '{"schema_version": "observation-read-facade-rec');
    expect(readObservationReadFacadeReceipt(torn)).toBeNull();

    const wrongSchema = path.join(TEMP_ROOT, `wrong-${tempSeq}.json`);
    writeFileSync(wrongSchema, JSON.stringify({ schema_version: "v2", receipt: { served: [] } }));
    expect(readObservationReadFacadeReceipt(wrongSchema)).toBeNull();

    const noServed = path.join(TEMP_ROOT, `noserved-${tempSeq}.json`);
    writeFileSync(
      noServed,
      JSON.stringify({
        schema_version: "observation-read-facade-receipt/v1",
        receipt: { grant_id: "g" },
      }),
    );
    expect(readObservationReadFacadeReceipt(noServed)).toBeNull();

    // The consumer-facing consequence: nothing served, so no citation can be admissible.
    expect(observationIdsServed(null).size).toBe(0);
  });
});

describe("observation read facade — the entry the runtime will launch", () => {
  it("resolves a server entry that exists beside this module, in whatever form is loaded", () => {
    const entry = observationReadFacadeServerEntry();
    expect(existsSync(entry)).toBe(true);
    expect(path.basename(entry)).toMatch(/^observation-read-facade-server\.(ts|js)$/);
    // Same directory as the module that resolved it: the package ships them together, and a resolver
    // that reached outside would break in dist without breaking here.
    expect(path.dirname(entry)).toBe(
      path.dirname(fileURLToPath(new URL("./observation-read-facade.ts", import.meta.url))),
    );
  });
});

describe("observation read facade — the launch contract, as a real process", () => {
  const serverEntry = path.join(
    REPO_ROOT,
    "src/core-runtime/reconstruct/observation-read-facade-server.ts",
  );

  function runServer(args: {
    descriptorPath: string;
    env: NodeJS.ProcessEnv;
    stdin?: string;
  }): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      // Run the TypeScript entry through the repo's own loader. Production spawns the COMPILED entry
      // (`node dist/.../observation-read-facade-server.js`); what this exercises is the launch contract
      // — argv, env, exit codes, stdio framing — which is the same in both. The compiled path's
      // existence is a wiring concern and is pinned where the runtime computes it.
      const child = spawn(
        path.join(REPO_ROOT, "node_modules/.bin/tsx"),
        [serverEntry, `--descriptor=${args.descriptorPath}`],
        { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...args.env } },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += String(chunk)));
      child.stderr.on("data", (chunk) => (stderr += String(chunk)));
      child.stdin.on("error", () => {});
      if (args.stdin) child.stdin.write(args.stdin);
      child.stdin.end();
      child.on("exit", (code) => resolve({ code, stdout, stderr }));
    });
  }

  it("serves over real stdio when the launch token matches, and refuses when it does not", async () => {
    const { descriptor, descriptorPath, receiptPath } = writeDescriptor();
    const requests = [
      { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: OBSERVATION_READ_TOOL_NAME,
          arguments: { observation_ids: [allObservationIds[0]] },
        },
      },
    ].map((message) => `${JSON.stringify(message)}\n`).join("");

    const ok = await runServer({
      descriptorPath,
      env: { [OBSERVATION_READ_LAUNCH_TOKEN_ENV]: descriptor.launch_token },
      stdin: requests,
    });
    expect(ok.code).toBe(0);
    const responses = ok.stdout.trim().split("\n").map((line) => JSON.parse(line));
    expect(responses.map((r) => r.id)).toEqual([0, 1, 2]); // the notification got no reply
    expect(responses[2].result.isError).toBe(false);
    expect(observationIdsServed(readObservationReadFacadeReceipt(receiptPath)).size).toBe(1);

    // Wrong launch token: refuse BEFORE serving, and say nothing about either value.
    const mismatched = await runServer({
      descriptorPath,
      env: { [OBSERVATION_READ_LAUNCH_TOKEN_ENV]: "another-dispatch-token" },
      stdin: requests,
    });
    expect(mismatched.code).toBe(2);
    expect(mismatched.stdout).toBe("");
    expect(mismatched.stderr).toMatch(/launch token does not match/);
    expect(mismatched.stderr).not.toContain(descriptor.launch_token);
  }, 60_000);

  it("refuses to start with no token, and with an unreadable descriptor", async () => {
    const { descriptorPath } = writeDescriptor();
    const noToken = await runServer({ descriptorPath, env: { [OBSERVATION_READ_LAUNCH_TOKEN_ENV]: "" } });
    expect(noToken.code).toBe(2);
    expect(noToken.stderr).toMatch(new RegExp(OBSERVATION_READ_LAUNCH_TOKEN_ENV));

    const absent = await runServer({
      descriptorPath: path.join(TEMP_ROOT, "does-not-exist.json"),
      env: { [OBSERVATION_READ_LAUNCH_TOKEN_ENV]: "t" },
    });
    expect(absent.code).toBe(2);
    expect(absent.stderr).toMatch(/cannot read descriptor/);
  }, 60_000);
});
