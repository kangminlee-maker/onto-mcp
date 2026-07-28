import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { afterAll, describe, expect, it } from "vitest";
import {
  handleFacadeMessage,
  observationIdsServed,
  observationReadFacadeServerEntry,
  observationReadToolDefinition,
  OBSERVATION_READ_LAUNCH_TOKEN_ENV,
  OBSERVATION_READ_TOOL_NAME,
  ObservationReadFacadeSession,
  parseObservationReadFacadeDescriptor,
  prepareObservationReadFacadeLaunch,
  readObservationReadFacadeEmissions,
  readObservationReadFacadeReceipt,
  type ObservationReadFacadeDescriptor,
} from "./observation-read-facade.js";
import {
  fixObservationSnapshot,
  OBSERVATION_READ_MAX_ID_CHARS,
  OBSERVATION_READ_MAX_REQUEST_IDS,
} from "./observation-read.js";
import { OBSERVATION_READ_MAX_CALLS } from "./observation-read-grant.js";

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
      // Derived from the ledger this validation is FOR, exactly as the real validator derives it
      // (`source-safety-validation.ts`). Hard-coding 0 made the pair internally inconsistent, which the
      // grant's post-validation count bind then refused — correctly.
      safety_row_count: (ledger.safety_rows as unknown[]).length,
      no_prompt_use_count: (ledger.safety_rows as { visibility_tier?: unknown }[])
        .filter((row) => row.visibility_tier === "no_prompt_use").length,
      validation_results: ["source_safety_ledger_valid"],
      asserted_obligation_ids: [],
      violations: [],
    }),
  );
  return { observationsPath, safetyLedgerPath, safetyLedgerValidationPath };
}

function writeDescriptor(
  overrides: Partial<ObservationReadFacadeDescriptor> = {},
): {
  descriptor: ObservationReadFacadeDescriptor;
  descriptorPath: string;
  receiptPath: string;
  emissionsPath: string;
} {
  const sources = overrides.sources ?? writeSources();
  tempSeq += 1;
  const receiptPath = path.join(TEMP_ROOT, `receipt-${tempSeq}.json`);
  const emissionsPath = path.join(TEMP_ROOT, `emissions-${tempSeq}.json`);
  const descriptor: ObservationReadFacadeDescriptor = {
    schema_version: "observation-read-facade-descriptor/v2",
    launch_token: `launch-token-${tempSeq}`,
    sources,
    system_prompt: "SYSTEM",
    user_prompt: "USER",
    receipt_path: receiptPath,
    emissions_path: emissionsPath,
    ttl_ms: 600_000,
    ...overrides,
  };
  const descriptorPath = path.join(TEMP_ROOT, `descriptor-${tempSeq}.json`);
  writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2));
  return { descriptor, descriptorPath, receiptPath, emissionsPath };
}

/**
 * Drive one tool call the way the PROCESS SHELL does: handle the message, then commit once the response
 * would have been delivered. The split is production behaviour — served state must not be durable
 * before the bytes are out — so a helper that committed eagerly would test a facade nobody runs.
 */
const callTool = (
  session: ObservationReadFacadeSession,
  args: unknown,
  id = 1,
): Record<string, any> => {
  const result = handleFacadeMessage(
    { jsonrpc: "2.0", id, method: "tools/call", params: { name: OBSERVATION_READ_TOOL_NAME, arguments: args } },
    session,
  )!.result as Record<string, any>;
  session.commit();
  return result;
};

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
      // The RETIRED version: a v1 descriptor names no emissions path, so a facade reading one would
      // have nowhere to claim its start right — refusing it is what stops a half-run.
      ["schema_version", { schema_version: "observation-read-facade-descriptor/v1" }],
      ["launch_token", { launch_token: "" }],
      ["sources", { sources: undefined }],
      ["observationsPath", { sources: { ...descriptor.sources, observationsPath: "" } }],
      ["safetyLedgerValidationPath", {
        sources: { ...descriptor.sources, safetyLedgerValidationPath: undefined },
      }],
      ["system_prompt", { system_prompt: undefined }],
      ["user_prompt", { user_prompt: 5 }],
      ["receipt_path", { receipt_path: "" }],
      ["emissions_path", { emissions_path: "" }],
      ["emissions_path missing", { emissions_path: undefined }],
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
  });

  it("meters a tools/call that names another tool, instead of answering it for free", () => {
    // Answering this outside the session made it a free round trip: no charge, no record, and an
    // unbounded echo of a name the model chose — so calls with a wrong name walked past the 32-call
    // limit the repaired meter exists to enforce.
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const before = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    const answer = handleFacadeMessage(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "onto_reconstruct" } },
      session,
    )!.result as Record<string, any>;
    session.commit();
    expect(answer.isError).toBe(true);
    expect(answer.structuredContent.message).toMatch(/unknown tool/);
    const after = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(after.receipt.calls_served).toBe(before.receipt.calls_served + 1);
    expect(after.rejected_before_grant).toBe(before.rejected_before_grant + 1);
    expect(after.failures.length).toBe(before.failures.length + 1);
    // And the echoed name is bounded, like every other model-authored string this server repeats.
    const huge = handleFacadeMessage(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "z".repeat(50_000) } },
      session,
    )!.result as Record<string, any>;
    session.commit();
    expect(huge.structuredContent.message.length).toBeLessThan(1_000);
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
    const opening = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token);
    expect(opening?.receipt.calls_served).toBe(0);
    expect(observationIdsServed(opening).size).toBe(0);

    const wanted = allObservationIds.slice(0, 2);
    const result = callTool(session, { observation_ids: wanted });
    expect(result.isError).toBe(false);
    expect(result.structuredContent.entries.length).toBeGreaterThan(0);

    const receiptFile = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token);
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
    const receiptFile = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
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
    const afterFailure = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    // Design §4.2.1: a failed call still consumes budget — errors occupy the worker's context too.
    expect(afterFailure.receipt.calls_served).toBe(1);
    expect(afterFailure.receipt.chars_served).toBeGreaterThan(0);
    expect(observationIdsServed(afterFailure).size).toBe(0);
    // A shape rejection never reaches the READER, so it is counted separately for audit — but it is
    // still a round trip, so it spends the same dispatch meter. Counting it only in the separate
    // tally is what made the 32-call limit bypassable.
    callTool(session, { nonsense: true }, 2);
    const afterShape = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(afterShape.rejected_before_grant).toBe(1);
    expect(afterShape.receipt.calls_served).toBe(2);
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

describe("observation read facade — the worker's error channel carries no artifact text", () => {
  it("never returns a parser diagnostic to the model, only the reason it branches on", () => {
    // A YAML diagnostic quotes the offending SOURCE LINE. Tear the artifact inside a WITHHELD
    // observation's scalar: the parse fails before the consumption gate can run, so a verbatim message
    // would hand the model exactly the content the push gate refused it.
    const secret = "WITHHELD_SECRET_STRING";
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const torn = `observations:\n  - observation_id: x\n    body: "${secret}: unterminated\n`;
    writeFileSync(descriptor.sources.observationsPath, torn);
    const result = callTool(session, { observation_ids: [allObservationIds[0]] });
    expect(result.isError).toBe(true);
    const rendered = JSON.stringify(result);
    // Non-vacuous: the reader really does put the source text in ITS message, so the absence below is
    // the facade withholding it rather than the diagnostic never containing it.
    let readerMessage = "";
    try {
      fixObservationSnapshot(torn, ledgerArtifact as never);
    } catch (error) {
      readerMessage = (error as Error).message;
    }
    expect(readerMessage).toContain(secret);
    expect(rendered).not.toContain(secret);
    expect(result.structuredContent.reason).toBe("artifact_malformed");
  });

  it("spends ONE dispatch meter across malformed and valid calls alike", () => {
    // The first bound counted refusals separately, so 32 of them left the grant's own counter at zero
    // and a valid call afterwards sailed through as if nothing had been spent. The mixed sequence is
    // the arm that catches it; an all-malformed sequence passes either way.
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    for (let call = 1; call <= OBSERVATION_READ_MAX_CALLS; call += 1) {
      expect(callTool(session, { nonsense: true }, call).structuredContent.reason)
        .toBe("request_shape");
    }
    // A well-formed call now finds the meter spent, rather than a fresh grant.
    const valid = callTool(session, { observation_ids: [allObservationIds[0]] }, 100);
    expect(valid.isError).toBe(true);
    expect(valid.structuredContent.reason).toBe("call_limit_exhausted");
    const receipt = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(receipt.receipt.calls_served).toBe(OBSERVATION_READ_MAX_CALLS);
    // The audit subset still says how many never reached the reader — the valid call did, so it is
    // counted by the meter above and not here.
    expect(receipt.rejected_before_grant).toBe(OBSERVATION_READ_MAX_CALLS);
    // Refusals cost chars too — they are rendered into the worker's conversation like any page.
    expect(receipt.receipt.chars_served).toBeGreaterThan(0);
  });

  it("keeps the operator's diagnosis in the receipt while withholding it from the worker", () => {
    // Sanitising the worker's channel must not delete the cause: an operator otherwise gets an
    // unserved-citation failure with nothing recorded about why the artifact could not be read.
    const secret = "WITHHELD_SECRET_STRING";
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    writeFileSync(
      descriptor.sources.observationsPath,
      `observations:\n  - observation_id: x\n    body: "${secret}: unterminated\n`,
    );
    const result = callTool(session, { observation_ids: [allObservationIds[0]] });
    expect(JSON.stringify(result)).not.toContain(secret);
    const receipt = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(receipt.failures[0]?.reason).toBe("artifact_malformed");
    expect(receipt.failures[0]?.detail).toContain(secret);
  });

  it("bounds the model-authored key names it echoes back", () => {
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const huge = "k".repeat(50_000);
    const result = callTool(session, { [huge]: 1 });
    expect(result.structuredContent.reason).toBe("request_shape");
    // The model chose that key name; echoing it whole let it size its own error response.
    expect(result.structuredContent.message.length).toBeLessThan(1_000);
  });

  it("holds the ceiling invariant across a mixed call sequence", () => {
    // Scoped honestly: with the real fixture's budget this sequence never approaches the ceiling, so it
    // is a smoke check that mixed traffic keeps the receipt coherent. The arm that actually exercises
    // the refusal admission is in observation-read-grant.test.ts, where the budget can be made tight.
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const budget = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!
      .receipt.budget.total_fetch_char_budget;
    expect(budget).toBeGreaterThan(0);
    for (let call = 1; call <= OBSERVATION_READ_MAX_CALLS; call += 1) {
      const result = callTool(
        session,
        call % 2 === 0 ? { nonsense: "x".repeat(400) } : { observation_ids: [allObservationIds[0]] },
        call,
      );
      const served = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!.receipt;
      expect(served.chars_served, `after call ${call} (${result.structuredContent?.reason})`)
        .toBeLessThanOrEqual(budget);
    }
  });

  it("keeps the first failure as well as the last, and records pre-grant refusals too", () => {
    // The single slot skipped the ordinary shape rejection entirely and let a later terminal symptom
    // overwrite the artifact failure that caused it.
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    callTool(session, { nonsense: true }, 1);
    const afterShape = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(afterShape.failures.length).toBe(1);
    expect(afterShape.failures[0]!.reason).toBe("request_shape");

    // Now a real artifact failure, then a second one: the FIRST cause must survive.
    writeFileSync(descriptor.sources.observationsPath, "observations:\n  - bad: \"unterminated\n");
    callTool(session, { observation_ids: [allObservationIds[0]] }, 2);
    callTool(session, { observation_ids: [allObservationIds[1]] }, 3);
    const receipt = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(receipt.failures[0]!.reason).toBe("request_shape");
    expect(receipt.failures.length).toBe(3);
  });

  it("keeps the terminal failure even after the history fills up", () => {
    // A plain prefix silently dropped the diagnosis an operator actually needs: enough shape rejections
    // to fill the list, then the real artifact failure, and the receipt never mentioned the artifact.
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    for (let call = 1; call <= 10; call += 1) callTool(session, { nonsense: true }, call);
    writeFileSync(descriptor.sources.observationsPath, "observations:\n  - bad: \"unterminated\n");
    callTool(session, { observation_ids: [allObservationIds[0]] }, 11);
    const receipt = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(receipt.failures[0]!.reason).toBe("request_shape"); // the cause survives at the front
    expect(receipt.failures.at(-1)!.reason).toBe("artifact_malformed"); // and the symptom at the back
    expect(receipt.dropped_failure_count).toBeGreaterThan(0); // the gap is declared, not hidden
  });

  it("publishes the id rule the runtime actually applies", () => {
    const items = (observationReadToolDefinition().inputSchema as Record<string, any>)
      .properties.observation_ids.items;
    const pattern = new RegExp(items.pattern);
    // The ids this runtime mints (`obs_` + 16 hex) pass; whitespace-only and astral ids do not.
    expect(pattern.test(allObservationIds[0]!)).toBe(true);
    expect(pattern.test("   ")).toBe(false);
    expect(pattern.test("🙂")).toBe(false);
    // Inside that set one character is one UTF-16 unit, so the schema's code-point `maxLength` and the
    // reader's `String.length` cannot disagree — which is what made 65 emoji schema-valid and
    // runtime-invalid before.
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    // A SHORT id outside the set: it passes every length and blank check, so only the charset rule can
    // refuse it. Using a long one here would have been refused for its length either way.
    expect(callTool(session, { observation_ids: ["🙂"] }).structuredContent.reason)
      .toBe("request_shape");
    expect(callTool(session, { observation_ids: ["obs has a space"] }, 3).structuredContent.reason)
      .toBe("request_shape");
    // Contrast: a well-formed id that simply is not in this snapshot fails for a DIFFERENT reason.
    expect(callTool(session, { observation_ids: ["obs_0000000000000000"] }, 2)
      .structuredContent.reason).toBe("unknown_observation_id");
  });

  it("declares the reader's model-input rules in the schema, not only in the refusal", () => {
    const items = (observationReadToolDefinition().inputSchema as Record<string, any>)
      .properties.observation_ids;
    expect(items.uniqueItems).toBe(true);
    expect(items.items.maxLength).toBe(OBSERVATION_READ_MAX_ID_CHARS);
  });

  it("does not tell the worker the cause was the XOR when it was not", () => {
    // A duplicate id is schema-invalid AND reader-invalid, but it is not an XOR mistake. Naming the
    // wrong rule sends the worker to fix something that was never broken.
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const dup = allObservationIds[0]!;
    const result = callTool(session, { observation_ids: [dup, dup] });
    expect(result.structuredContent.reason).toBe("request_shape");
    expect(result.structuredContent.message).not.toMatch(/never both and never neither/);
  });

  it("bounds the shape rejections that never reach the grant", () => {
    // A shape rejection is a round trip whose error body lands in the worker's conversation like any
    // page, but it is counted outside the grant — so without a bound it was the one way to add context
    // that no ceiling in §4.2 could see.
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    for (let call = 1; call <= OBSERVATION_READ_MAX_CALLS; call += 1) {
      expect(callTool(session, { nonsense: true }, call).structuredContent.reason)
        .toBe("request_shape");
    }
    const past = callTool(session, { nonsense: true }, OBSERVATION_READ_MAX_CALLS + 1);
    expect(past.structuredContent.reason).toBe("call_limit_exhausted");
    // Still recorded honestly: the bound changes what the worker is told, not what the audit says.
    expect(
      readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!.rejected_before_grant,
    ).toBe(OBSERVATION_READ_MAX_CALLS + 1);
  });

  it("declares ids-XOR-cursor in the published schema, not only in the runtime check", () => {
    const schema = observationReadToolDefinition().inputSchema as Record<string, any>;
    // `{}` and "both at once" were schema-valid, so the advertised contract invited the very calls the
    // runtime rejects.
    expect(schema.oneOf).toEqual([
      { required: ["observation_ids"] },
      { required: ["cursor"] },
    ]);
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("observation read facade — receipt reading is fail-closed (design §8)", () => {
  it("returns null for every unusable receipt, and an empty served set for null", () => {
    tempSeq += 1;
    const token = `launch-token-${tempSeq}`;
    const missing = path.join(TEMP_ROOT, `absent-${tempSeq}.json`);
    expect(readObservationReadFacadeReceipt(missing, token)).toBeNull();

    const torn = path.join(TEMP_ROOT, `torn-${tempSeq}.json`);
    writeFileSync(torn, '{"schema_version": "observation-read-facade-rec');
    expect(readObservationReadFacadeReceipt(torn, token)).toBeNull();

    const wrongSchema = path.join(TEMP_ROOT, `wrong-${tempSeq}.json`);
    writeFileSync(wrongSchema, JSON.stringify({ schema_version: "v2", receipt: { served: [] } }));
    expect(readObservationReadFacadeReceipt(wrongSchema, token)).toBeNull();

    const noServed = path.join(TEMP_ROOT, `noserved-${tempSeq}.json`);
    writeFileSync(
      noServed,
      JSON.stringify({
        schema_version: "observation-read-facade-receipt/v1",
        launch_token: token,
        receipt: { grant_id: "g" },
      }),
    );
    expect(readObservationReadFacadeReceipt(noServed, token)).toBeNull();

    // The consumer-facing consequence: nothing served, so no citation can be admissible.
    expect(observationIdsServed(null).size).toBe(0);
  });

  it("fails closed when either side of the binding is missing, not just when they differ", () => {
    // The first shape of this check compared the two values directly, so an untyped one-argument call
    // meeting a pre-binding receipt was `undefined !== undefined` — the mismatch branch never fired and
    // a stale served set was admitted. A gate must fail closed on its own inputs before comparing them.
    tempSeq += 1;
    const legacy = path.join(TEMP_ROOT, `legacy-${tempSeq}.json`);
    const staleServed = [{ observation_id: "obs_stale_A" }, { observation_id: "obs_stale_B" }];
    writeFileSync(
      legacy,
      JSON.stringify({
        schema_version: "observation-read-facade-receipt/v1",
        receipt: { grant_id: "g-old", served: staleServed },
        rejected_before_grant: 0,
      }),
    );
    const untyped = readObservationReadFacadeReceipt as unknown as (...a: unknown[]) => unknown;
    // A pre-binding receipt is refused on its wire version alone, with or without an expected token.
    expect(untyped(legacy)).toBeNull();
    expect(untyped(legacy, "current-launch")).toBeNull();

    // ...and a CURRENT receipt is refused when the caller supplies no token. Written through the real
    // session so this arm cannot pass merely because the file was hand-made wrong.
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    callTool(session, { observation_ids: [allObservationIds[0]] });
    expect(untyped(receiptPath)).toBeNull();
    expect(untyped(receiptPath, "")).toBeNull();
    // Positive control: the same file with the right token really does carry a served observation.
    expect(
      observationIdsServed(readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token))
        .size,
    ).toBe(1);
  });

  it("publishes nothing until the response is committed", () => {
    // The ordering IS the property: a receipt durable before the bytes are out can describe a page the
    // worker never got. Both consolidation lenses reported that no test distinguished "published late"
    // from "published early", so this asserts the gap directly rather than the happy path.
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const before = readFileSync(receiptPath, "utf8");
    const result = handleFacadeMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: OBSERVATION_READ_TOOL_NAME,
          arguments: { observation_ids: [allObservationIds[0]] },
        },
      },
      session,
    )!.result as Record<string, any>;
    expect(result.isError).toBe(false); // non-vacuous: a real page was produced
    expect(readFileSync(receiptPath, "utf8")).toBe(before); // ...and nothing was published yet
    session.commit();
    expect(observationIdsServed(readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token))
      .has(allObservationIds[0]!)).toBe(true);
  });

  it("treats an EXPIRED grant as terminal, not just the two exhaustion reasons", () => {
    // The grant defines expiry as a latched terminal state, but the first latch listed only the two
    // exhaustion reasons — so an expired session stayed open and answered refusals indefinitely. The
    // set of terminal reasons is the grant's question; asking it is what keeps the two in step.
    const { descriptor } = writeDescriptor();
    let now = 1_000;
    const session = new ObservationReadFacadeSession({ descriptor, now: () => now });
    expect(callTool(session, { observation_ids: [allObservationIds[0]] }).isError).toBe(false);
    expect(session.isSpent).toBe(false);
    now += descriptor.ttl_ms + 1;
    expect(callTool(session, { observation_ids: [allObservationIds[1]] }, 2).structuredContent.reason)
      .toBe("grant_expired");
    expect(session.isSpent).toBe(true);
  });

  it("marks itself spent on terminal exhaustion, and only then", () => {
    // The shell closes the server on this flag. Nothing else may set it: a session that reported spent
    // after an ordinary refusal would end the dispatch while the grant still had room.
    const { descriptor } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    callTool(session, { nonsense: true }, 1);
    expect(session.isSpent).toBe(false);
    callTool(session, { observation_ids: ["obs_0000000000000000"] }, 2); // unknown id, not terminal
    expect(session.isSpent).toBe(false);
    for (let call = 3; call <= OBSERVATION_READ_MAX_CALLS + 2; call += 1) {
      callTool(session, { nonsense: true }, call);
    }
    expect(session.isSpent).toBe(true);
  });

  it("does not admit an observation the worker only received part of", () => {
    // A citation names the OBSERVATION. Serving page 1 of N and stopping proves the worker saw an
    // opening fragment, not the thing it is about to cite, so the reduction must not hand that id to
    // the citation check.
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const [biggest] = [...observationsArtifact.observations]
      .sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length);
    const first = callTool(session, { observation_ids: [biggest!.observation_id] });
    expect(first.structuredContent.next_cursor).toBeTruthy(); // non-vacuous: it really does split
    const partial = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(partial.receipt.served.some((r) => r.observation_id === biggest!.observation_id))
      .toBe(true); // the receipt DOES record the fragment...
    expect(observationIdsServed(partial).has(biggest!.observation_id)).toBe(false); // ...but it is not citable

    // Walk it to the end; now the whole observation was received and the id becomes citable.
    let cursor = first.structuredContent.next_cursor as string | undefined;
    for (let page = 0; cursor && page < 40; page += 1) {
      const next = callTool(session, { cursor }, page + 2);
      cursor = next.structuredContent?.next_cursor as string | undefined;
    }
    const complete = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(observationIdsServed(complete).has(biggest!.observation_id)).toBe(true);
  });

  it("refuses a same-version receipt whose served records are malformed", () => {
    // The outer checks made "fail closed on every failure" true only of the envelope: a file carrying
    // this launch's own token but records without hashes or part information was cast straight through.
    tempSeq += 1;
    const forged = path.join(TEMP_ROOT, `forged-${tempSeq}.json`);
    const token = `launch-token-${tempSeq}`;
    const wellFormed = {
      observation_id: "obs_0000000000000001",
      observation_content_sha256: "abc",
      part_indexes: [1],
      part_count: 1,
    };
    const write = (served: unknown) =>
      writeFileSync(
        forged,
        JSON.stringify({
          schema_version: "observation-read-facade-receipt/v2",
          launch_token: token,
          receipt: { grant_id: "g", served },
          rejected_before_grant: 0,
          failures: [],
          dropped_failure_count: 0,
        }),
      );
    // Positive control: the well-formed shape IS accepted, so the rejections below are about the defect.
    write([wellFormed]);
    expect(observationIdsServed(readObservationReadFacadeReceipt(forged, token)).size).toBe(1);
    const broken: unknown[] = [
      { observation_id: "obs_0000000000000001" }, // no hash, no parts
      { ...wellFormed, part_count: 0 },
      { ...wellFormed, part_indexes: "1" },
      { ...wellFormed, observation_id: "" },
      "not-an-object",
    ];
    for (const [index, served] of broken.entries()) {
      write([served]);
      expect(readObservationReadFacadeReceipt(forged, token), `case ${index}`).toBeNull();
    }
  });

  it("refuses a well-formed receipt that belongs to a different launch", () => {
    // The receipt path is derived from the session root and a literal round id, so a resumed run finds
    // its predecessor's file. Without the token binding, a dispatch whose facade never started would
    // read that file and admit citations for content this worker never received.
    const { descriptor, receiptPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    callTool(session, { observation_ids: [allObservationIds[0]] });
    // Positive control: with the right token this receipt really does prove a served observation, so
    // the negative below fails for the token and not because the file says nothing.
    expect(
      observationIdsServed(readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token))
        .size,
    ).toBe(1);
    expect(readObservationReadFacadeReceipt(receiptPath, "some-other-launch")).toBeNull();
    expect(observationIdsServed(readObservationReadFacadeReceipt(receiptPath, "some-other-launch")))
      .toEqual(new Set());
  });

  it("refuses to start a second facade over this launch's own receipt", () => {
    // One launch serves one dispatch. A second start would rewrite the receipt as "granted, served
    // nothing" and destroy the evidence the first dispatch produced, so it fails loud instead.
    const { descriptor, receiptPath } = writeDescriptor();
    const first = new ObservationReadFacadeSession({ descriptor });
    callTool(first, { observation_ids: [allObservationIds[0]] });
    expect(() => new ObservationReadFacadeSession({ descriptor })).toThrow(
      /a receipt for this launch already exists/,
    );
    // The first dispatch's evidence survived the refusal.
    expect(
      observationIdsServed(readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token))
        .size,
    ).toBe(1);
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

  it("publishes nothing when the response could not be written", async () => {
    // Entering a write callback proves the write COMPLETED, not that it SUCCEEDED — Node calls it with
    // EPIPE when the reader is gone. Committing there published a page nobody received, which is the
    // exact failure deferring the commit was meant to prevent.
    const { descriptor, descriptorPath, receiptPath } = writeDescriptor();
    const request = `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: OBSERVATION_READ_TOOL_NAME,
        arguments: { observation_ids: [allObservationIds[0]] },
      },
    })}\n`;
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(
        path.join(REPO_ROOT, "node_modules/.bin/tsx"),
        [observationReadFacadeServerEntry(), `--descriptor=${descriptorPath}`],
        {
          stdio: ["pipe", "pipe", "ignore"],
          env: { ...process.env, [OBSERVATION_READ_LAUNCH_TOKEN_ENV]: descriptor.launch_token },
        },
      );
      child.stdin.on("error", () => {});
      // Destroy the read side so the child's write fails instead of being delivered.
      child.stdout.destroy();
      child.stdin.write(request);
      child.on("exit", (exitCode) => resolve(exitCode));
    });
    expect(code).not.toBe(0); // it ended rather than pretending the page landed
    // The opening receipt the constructor wrote is still what is on disk: granted, served nothing.
    const receipt = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(receipt.receipt.calls_served).toBe(0);
    expect(observationIdsServed(receipt).size).toBe(0);
  }, 60_000);

  it("answers a pipelined batch one at a time and stops at the terminal response", async () => {
    // Every frame arrives in ONE stdin chunk, so readline hands them all over before any write callback
    // runs. Without serialization: an earlier callback published state produced by later calls (evidence
    // for a call that had not been delivered), and frames kept being handled after the terminal response
    // had marked the session spent. Both windows close by handling one response at a time.
    const { descriptor, descriptorPath, receiptPath } = writeDescriptor();
    const frames = [
      { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      ...Array.from({ length: OBSERVATION_READ_MAX_CALLS + 4 }, (_unused, index) => ({
        jsonrpc: "2.0",
        id: index + 1,
        method: "tools/call",
        params: { name: OBSERVATION_READ_TOOL_NAME, arguments: { nonsense: true } },
      })),
    ].map((message) => `${JSON.stringify(message)}\n`).join("");

    const run = await runServer({
      descriptorPath,
      env: { [OBSERVATION_READ_LAUNCH_TOKEN_ENV]: descriptor.launch_token },
      stdin: frames,
    });
    expect(run.code).toBe(0);
    const replies = run.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const reasons = replies.map((r) => r.result?.structuredContent?.reason).filter(Boolean);
    // Non-vacuous: the batch really did drive the session to its limit.
    expect(reasons).toContain("call_limit_exhausted");
    // The terminal reply is the LAST thing written — nothing after it was handled.
    expect(reasons.at(-1)).toBe("call_limit_exhausted");
    expect(reasons.filter((reason) => reason === "call_limit_exhausted").length).toBe(1);
    // ...and the receipt on disk agrees with what was actually answered.
    const receipt = readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)!;
    expect(receipt.receipt.calls_served).toBe(OBSERVATION_READ_MAX_CALLS);
    expect(receipt.rejected_before_grant).toBe(reasons.length);
  }, 60_000);

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
    expect(
      observationIdsServed(readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token))
        .size,
    ).toBe(1);

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

/**
 * Stage 3a-1 — the facade records what it EMITTED, and creating that record is how it claims the right
 * to start (design §4, §11-L2). Nothing reads these yet: reconciliation is the next stage.
 */
describe("observation read facade — emissions record and the start right", () => {
  it("records the emitted page string BYTE-IDENTICALLY to what the worker received", () => {
    const { descriptor, emissionsPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const result = callTool(session, { observation_ids: [allObservationIds[0]] });

    const emissions = readObservationReadFacadeEmissions(emissionsPath, descriptor.launch_token)!;
    expect(emissions).not.toBeNull();
    expect(emissions.emissions).toHaveLength(1);
    // THE property reconciliation depends on: the recorded string is the one that went out, not a
    // re-serialization of the same object. A second `JSON.stringify` could differ and the transcript
    // search would then look for bytes nobody sent.
    expect(emissions.emissions[0]!.canonical_text).toBe(result.content[0].text);
    expect(JSON.parse(emissions.emissions[0]!.canonical_text)).toEqual(result.structuredContent);
  });

  it("records every page of a split observation, in emission order", () => {
    const { descriptor, emissionsPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    const [biggest] = [...observationsArtifact.observations]
      .sort((left, right) => JSON.stringify(right).length - JSON.stringify(left).length);
    const first = callTool(session, { observation_ids: [biggest!.observation_id] });
    const emitted = [first.content[0].text as string];
    let cursor = (first.structuredContent as { next_cursor?: string }).next_cursor;
    expect(cursor, "the fixture must actually split, or this proves nothing").toBeTruthy();
    let guard = 0;
    while (cursor && guard < 50) {
      guard += 1;
      const next = callTool(session, { cursor }, guard + 1);
      emitted.push(next.content[0].text as string);
      cursor = (next.structuredContent as { next_cursor?: string }).next_cursor;
    }
    const emissions = readObservationReadFacadeEmissions(emissionsPath, descriptor.launch_token)!;
    expect(emissions.emissions.map((entry) => entry.canonical_text)).toEqual(emitted);
  });

  /**
   * The two guards are INDEPENDENT and ordered: the receipt latch refuses a launch that already
   * proved something, and the start right refuses one that is merely already claimed. Isolating the
   * second means arranging the state only it can see — a claim with no receipt yet, which is exactly
   * the race window the latch cannot cover because neither process has written a receipt.
   */
  it("refuses to start when another facade already claimed the right, before any receipt exists", () => {
    const { descriptor, emissionsPath, receiptPath } = writeDescriptor();
    writeFileSync(emissionsPath, "");
    expect(existsSync(receiptPath), "the latch must not be what refuses here").toBe(false);
    expect(() => new ObservationReadFacadeSession({ descriptor }))
      .toThrow(/could not claim the start right/);
    // The loser minted nothing and wrote nothing: the claim is taken BEFORE the grant exists, so a
    // refused facade cannot be left holding a live budget.
    expect(existsSync(receiptPath)).toBe(false);
  });

  it("still refuses a second facade on a launch that already served, via the receipt latch", () => {
    const { descriptor, receiptPath } = writeDescriptor();
    const first = new ObservationReadFacadeSession({ descriptor });
    callTool(first, { observation_ids: [allObservationIds[0]] });
    const servedBefore = observationIdsServed(
      readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token),
    );
    expect(() => new ObservationReadFacadeSession({ descriptor }))
      .toThrow(/a receipt for this launch already exists/);
    // The first dispatch's evidence is untouched.
    expect(
      observationIdsServed(readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)),
    ).toEqual(servedBefore);
  });

  it("clearing a launch releases the start right, so a resumed run can serve", () => {
    const { descriptor, emissionsPath, receiptPath } = writeDescriptor();
    new ObservationReadFacadeSession({ descriptor });
    prepareObservationReadFacadeLaunch({
      sources: descriptor.sources,
      descriptorPath: path.join(TEMP_ROOT, "unused-descriptor.json"),
      receiptPath,
      emissionsPath,
      launchToken: descriptor.launch_token,
      ttlMs: descriptor.ttl_ms,
    });
    expect(() => new ObservationReadFacadeSession({ descriptor })).not.toThrow();
  });

  it("reads fail-closed — a torn, foreign or unknown record is null, never an empty emission list", () => {
    const { descriptor, emissionsPath } = writeDescriptor();
    const session = new ObservationReadFacadeSession({ descriptor });
    callTool(session, { observation_ids: [allObservationIds[0]] });
    expect(readObservationReadFacadeEmissions(emissionsPath, descriptor.launch_token)).not.toBeNull();

    // Another launch's token.
    expect(readObservationReadFacadeEmissions(emissionsPath, "some-other-launch")).toBeNull();
    // Absent.
    expect(readObservationReadFacadeEmissions(path.join(TEMP_ROOT, "nope.json"), "t")).toBeNull();

    const intact = JSON.parse(readFileSync(emissionsPath, "utf8")) as Record<string, unknown>;
    for (
      const mutation of [
        { schema_version: "observation-read-facade-emissions/v2" },
        { grant_id: 5 },
        { emissions: "not an array" },
        { emissions: [{ canonical_text: 5 }] },
        { emissions: [{}] },
      ]
    ) {
      const path_ = path.join(TEMP_ROOT, `emissions-mutated-${JSON.stringify(mutation).length}.json`);
      writeFileSync(path_, JSON.stringify({ ...intact, ...mutation }));
      expect(readObservationReadFacadeEmissions(path_, descriptor.launch_token), JSON.stringify(mutation))
        .toBeNull();
    }
    const torn = path.join(TEMP_ROOT, "emissions-torn.json");
    writeFileSync(torn, "{ not json");
    expect(readObservationReadFacadeEmissions(torn, descriptor.launch_token)).toBeNull();
  });

  it("publishes through a temp name no other facade can pick", () => {
    // A shared `${path}.tmp` let two facades over one path rename each other's half-written bytes into
    // place (§11-L2). Occupying that exact name is what makes the difference OBSERVABLE: an
    // implementation still using it fails on the obstruction, a unique-name one never looks there.
    // Asserting only "no temp file survives" would pass either way — a rename removes it regardless.
    const { descriptor, emissionsPath, receiptPath } = writeDescriptor();
    mkdirSync(`${emissionsPath}.tmp`);
    mkdirSync(`${receiptPath}.tmp`);
    const session = new ObservationReadFacadeSession({ descriptor });
    callTool(session, { observation_ids: [allObservationIds[0]] });
    expect(readObservationReadFacadeEmissions(emissionsPath, descriptor.launch_token)).not.toBeNull();
    expect(readObservationReadFacadeReceipt(receiptPath, descriptor.launch_token)).not.toBeNull();
    // The obstruction is untouched, and no stray temp of ours is left behind.
    expect(existsSync(`${emissionsPath}.tmp`)).toBe(true);
  });
});
