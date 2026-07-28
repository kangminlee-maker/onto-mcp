import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { codexWorkerSessionId } from "../llm/llm-caller.js";
import { codexHomeFrom, locateCodexRollout } from "./codex-rollout-reader.js";
import {
  OBSERVATION_READ_MCP_SERVER_NAME,
  observationReadFacadeCodexArgs,
} from "./observation-read-facade.js";
import {
  readObservationReadDeliveryRecord,
  reconcileFacadeDelivery,
  writeObservationReadDeliveryRecord,
} from "./delivery-reconciliation.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ROLLOUT_FIXTURES = path.join(REPO_ROOT, "scripts/fixtures/codex-rollout");
const TEMP_ROOT = mkdtempSync(path.join(os.tmpdir(), "delivery-wiring-"));
afterAll(() => rmSync(TEMP_ROOT, { recursive: true, force: true }));

let seq = 0;
const tempDir = (): string => {
  seq += 1;
  const dir = path.join(TEMP_ROOT, `case-${seq}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

describe("codex worker session id — exactly one banner, or nothing", () => {
  it("reads the id out of a REAL worker stderr", () => {
    // The banner as codex actually prints it, from a measured run.
    const stderr = [
      "OpenAI Codex v0.145.0",
      "--------",
      "workdir: /Users/kangmin/Documents/onto-mcp",
      "model: gpt-5.6-luna",
      "session id: 019fa32b-dd61-7fa2-8b4c-8c789070a2fa",
      "--------",
    ].join("\n");
    expect(codexWorkerSessionId(stderr)).toBe("019fa32b-dd61-7fa2-8b4c-8c789070a2fa");
  });

  it.each([
    ["no banner", "OpenAI Codex v0.145.0\nworkdir: /repo"],
    [
      "two banners — this buffer is not one child's",
      "session id: 019fa32b-dd61-7fa2-8b4c-8c789070a2fa\nsession id: 019fa32c-7611-7303-a52f-ad6c4c23ba9a",
    ],
    ["a uuid-looking string that is not the banner", "note: 019fa32b-dd61-7fa2-8b4c-8c789070a2fa"],
  ])("returns null for %s", (_name, stderr) => {
    expect(codexWorkerSessionId(stderr)).toBeNull();
  });
});

describe("locating a transcript", () => {
  function plantRollout(codexHome: string, day: string, name: string): string {
    const directory = path.join(codexHome, "sessions", day);
    mkdirSync(directory, { recursive: true });
    const file = path.join(directory, name);
    writeFileSync(file, "{}\n");
    return file;
  }

  it("finds the transcript in the day directory the child's life falls in", () => {
    const codexHome = tempDir();
    const startedAtMs = Date.parse("2026-07-27T12:00:00.000Z");
    const at = new Date(startedAtMs);
    const day = path.join(
      String(at.getFullYear()),
      String(at.getMonth() + 1).padStart(2, "0"),
      String(at.getDate()).padStart(2, "0"),
    );
    const planted = plantRollout(codexHome, day, "rollout-2026-07-27T21-00-00-abc-123.jsonl");
    expect(
      locateCodexRollout({
        codexHome,
        sessionId: "abc-123",
        childWindow: { startedAtMs, endedAtMs: startedAtMs + 60_000 },
      }),
    ).toBe(planted);
  });

  it("returns null rather than reaching for another session's file", () => {
    const codexHome = tempDir();
    const startedAtMs = Date.parse("2026-07-27T12:00:00.000Z");
    const at = new Date(startedAtMs);
    const day = path.join(
      String(at.getFullYear()),
      String(at.getMonth() + 1).padStart(2, "0"),
      String(at.getDate()).padStart(2, "0"),
    );
    plantRollout(codexHome, day, "rollout-2026-07-27T21-00-00-someone-else.jsonl");
    // A "newest matching rollout" fallback would have returned the file above (§9-M1 forbids it).
    expect(
      locateCodexRollout({
        codexHome,
        sessionId: "abc-123",
        childWindow: { startedAtMs, endedAtMs: startedAtMs + 60_000 },
      }),
    ).toBeNull();
  });

  it("honours CODEX_HOME, because codex does", () => {
    expect(codexHomeFrom({ CODEX_HOME: "/somewhere/else" }, "/home/me")).toBe("/somewhere/else");
    expect(codexHomeFrom({}, "/home/me")).toBe(path.join("/home/me", ".codex"));
    expect(codexHomeFrom({ CODEX_HOME: "" }, "/home/me")).toBe(path.join("/home/me", ".codex"));
  });
});

/**
 * The defect this test exists for was real: reconciliation scoped the transcript to a server named
 * `observation_read_facade` while the runtime registers `onto_observation`. Nothing failed loudly —
 * our own results simply never matched, so every run would have been unverifiable forever, and with no
 * consumer yet nobody would have noticed. The two now read ONE constant, and this is the check that
 * they still do.
 */
describe("the server name reconciliation scopes to is the one the runtime registers", () => {
  /**
   * The registration side alone is NOT enough, and a mutation proved it: putting the old spelling back
   * in reconciliation left all the other tests green, because the real transcripts carry the
   * measurement probe rather than our server, so scoping to either name finds nothing. The check has
   * to be one where the NAME decides the outcome.
   */
  it("scopes a transcript by that same name — a second spelling finds nothing of ours", () => {
    const dir = tempDir();
    const sessionId = "01900000-0000-7000-8000-000000000001";
    const canonical = JSON.stringify({ entries: [], next_cursor: undefined });
    const stampedAtMs = Date.parse("2026-07-27T12:00:00.000Z");
    const at = new Date(stampedAtMs);
    const dayDir = path.join(
      dir,
      "sessions",
      String(at.getFullYear()),
      String(at.getMonth() + 1).padStart(2, "0"),
      String(at.getDate()).padStart(2, "0"),
    );
    mkdirSync(dayDir, { recursive: true });
    const transcript = [
      {
        timestamp: "2026-07-27T12:00:00.000Z",
        type: "session_meta",
        payload: { session_id: sessionId, cwd: "/repo", cli_version: "0.145.0" },
      },
      {
        timestamp: "2026-07-27T12:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "mcp_tool_call_end",
          call_id: "exec-1",
          // The name the runtime really registers.
          invocation: { server: OBSERVATION_READ_MCP_SERVER_NAME, tool: "onto_observation_read" },
          result: { Ok: { content: [{ type: "text", text: canonical }], isError: false } },
        },
      },
      {
        timestamp: "2026-07-27T12:00:02.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "call_1",
          output: [
            { type: "input_text", text: "Script completed\nOutput:\n" },
            { type: "input_text", text: canonical },
          ],
        },
      },
    ].map((record) => JSON.stringify(record)).join("\n");
    writeFileSync(path.join(dayDir, `rollout-x-${sessionId}.jsonl`), transcript);
    writeFileSync(
      path.join(dir, "emissions.json"),
      JSON.stringify({
        schema_version: "observation-read-facade-emissions/v1",
        launch_token: "launch-1",
        grant_id: "g-1",
        emissions: [{ canonical_text: canonical }],
      }),
    );

    const record = reconcileFacadeDelivery({
      launch: { emissionsPath: path.join(dir, "emissions.json"), launchToken: "launch-1" },
      workerSession: {
        id: sessionId,
        startedAtMs: stampedAtMs - 60_000,
        endedAtMs: stampedAtMs + 60_000,
      },
      recordPath: path.join(dir, "delivery.json"),
      cwd: "/repo",
      codexHome: dir,
      toolName: "onto_observation_read",
    });
    // With the right name the send is ours and the emission is accounted for. With any other name our
    // own send is invisible, the emission has nothing to match, and this becomes
    // `recorded_emission_without_sent_record` — which is what the mutation produces.
    expect(record.status).toBe("verified");
  });

  it("appears in the codex registration arguments", () => {
    const args = observationReadFacadeCodexArgs({
      sources: {
        observationsPath: "/tmp/o.yaml",
        safetyLedgerPath: "/tmp/l.yaml",
        safetyLedgerValidationPath: "/tmp/v.yaml",
      },
      descriptorPath: "/tmp/d.json",
      receiptPath: "/tmp/r.json",
      emissionsPath: "/tmp/e.json",
      launchToken: "t",
      ttlMs: 1_000,
    });
    const keys = args.filter((arg) => arg.startsWith("mcp_servers."));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key.startsWith(`mcp_servers.${OBSERVATION_READ_MCP_SERVER_NAME}.`)).toBe(true);
    }
  });
});

describe("the delivery record — written by reconciliation, read fail-closed", () => {
  it("round-trips a verified result", () => {
    const recordPath = path.join(tempDir(), "delivery.json");
    writeObservationReadDeliveryRecord({
      recordPath,
      launchToken: "launch-1",
      reconciliation: {
        status: "verified",
        delivered: new Set(["obs-b", "obs-a"]),
        attestation: [{ index: 0, chars: 12, disposition: "verbatim_delivered" }],
      },
    });
    const read = readObservationReadDeliveryRecord(recordPath, "launch-1")!;
    expect(read.status).toBe("verified");
    if (read.status !== "verified") return;
    expect(read.delivered).toEqual(["obs-a", "obs-b"]); // sorted, so the file is stable
    expect(read.attestation).toHaveLength(1);
  });

  it("round-trips an unverifiable result WITHOUT inventing an empty delivered set", () => {
    const recordPath = path.join(tempDir(), "delivery.json");
    writeObservationReadDeliveryRecord({
      recordPath,
      launchToken: "launch-1",
      reconciliation: { status: "unverifiable", reason: "rollout_not_found" },
    });
    const raw = JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>;
    // The distinction §9-M2 turns on: an unverifiable record has NO delivered field at all, so it
    // cannot be read as "delivered nothing".
    expect(raw).not.toHaveProperty("delivered");
    const read = readObservationReadDeliveryRecord(recordPath, "launch-1")!;
    expect(read.status).toBe("unverifiable");
    if (read.status === "unverifiable") expect(read.reason).toBe("rollout_not_found");
  });

  it("reads null for a foreign, torn or unknown record", () => {
    const dir = tempDir();
    const recordPath = path.join(dir, "delivery.json");
    writeObservationReadDeliveryRecord({
      recordPath,
      launchToken: "launch-1",
      reconciliation: { status: "verified", delivered: new Set(["a"]), attestation: [] },
    });
    expect(readObservationReadDeliveryRecord(recordPath, "another-launch")).toBeNull();
    expect(readObservationReadDeliveryRecord(path.join(dir, "absent.json"), "launch-1")).toBeNull();

    const intact = JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>;
    const mutations: Record<string, unknown>[] = [
      { schema_version: "observation-read-delivery/v2" },
      { status: "maybe" },
      { delivered: "not an array" },
      { delivered: [5] },
      { attestation: [{ index: 0, chars: 1, disposition: "invented" }] },
      { attestation: "not an array" },
    ];
    for (const [index, mutation] of mutations.entries()) {
      const mutatedPath = path.join(dir, `mutated-${index}.json`);
      writeFileSync(mutatedPath, JSON.stringify({ ...intact, ...mutation }));
      expect(readObservationReadDeliveryRecord(mutatedPath, "launch-1"), JSON.stringify(mutation))
        .toBeNull();
    }
    const torn = path.join(dir, "torn.json");
    writeFileSync(torn, "{ not json");
    expect(readObservationReadDeliveryRecord(torn, "launch-1")).toBeNull();
  });
});

describe("reconcileFacadeDelivery — every missing input becomes unverifiable, never a delivery claim", () => {
  function launchIn(dir: string): { emissionsPath: string; launchToken: string } {
    return { emissionsPath: path.join(dir, "emissions.json"), launchToken: "launch-1" };
  }

  it("refuses when the CLI announced no session", () => {
    const dir = tempDir();
    const record = reconcileFacadeDelivery({
      launch: launchIn(dir),
      workerSession: undefined,
      recordPath: path.join(dir, "delivery.json"),
      toolName: "onto_observation_read",
    });
    expect(record.status).toBe("unverifiable");
    if (record.status === "unverifiable") expect(record.reason).toBe("worker_session_unavailable");
  });

  it("refuses when the facade left no emissions record", () => {
    const dir = tempDir();
    const record = reconcileFacadeDelivery({
      launch: launchIn(dir),
      workerSession: { id: "abc", startedAtMs: Date.now(), endedAtMs: Date.now() },
      recordPath: path.join(dir, "delivery.json"),
      codexHome: dir,
      toolName: "onto_observation_read",
    });
    expect(record.status).toBe("unverifiable");
    if (record.status === "unverifiable") expect(record.reason).toBe("emissions_record_unreadable");
  });

  it("refuses when codex kept no transcript where it would have put one", () => {
    const dir = tempDir();
    writeFileSync(
      path.join(dir, "emissions.json"),
      JSON.stringify({
        schema_version: "observation-read-facade-emissions/v1",
        launch_token: "launch-1",
        grant_id: "g-1",
        emissions: [],
      }),
    );
    const record = reconcileFacadeDelivery({
      launch: launchIn(dir),
      workerSession: { id: "abc", startedAtMs: Date.now(), endedAtMs: Date.now() },
      recordPath: path.join(dir, "delivery.json"),
      codexHome: path.join(dir, "empty-codex-home"),
      toolName: "onto_observation_read",
    });
    expect(record.status).toBe("unverifiable");
    if (record.status === "unverifiable") expect(record.reason).toBe("rollout_not_found");
  });

  /**
   * The whole path, end to end, over a REAL transcript: locate it under a CODEX_HOME we control, read
   * it, reconcile against an emissions record, and persist the verdict. The transcript's server is the
   * measurement probe rather than our facade, so this run has no results of ours and no emissions —
   * a legitimately verified, empty delivery.
   */
  it("verifies a real transcript end to end", () => {
    const dir = tempDir();
    const sessionId = "019fa33f-3382-7b00-8d5a-ce8e9e7be00d";
    const stampedAtMs = Date.parse("2026-07-27T11:04:16.265Z");
    const at = new Date(stampedAtMs);
    const dayDir = path.join(
      dir,
      "sessions",
      String(at.getFullYear()),
      String(at.getMonth() + 1).padStart(2, "0"),
      String(at.getDate()).padStart(2, "0"),
    );
    mkdirSync(dayDir, { recursive: true });
    writeFileSync(
      path.join(dayDir, `rollout-x-${sessionId}.jsonl`),
      readFileSync(path.join(ROLLOUT_FIXTURES, `${sessionId}.jsonl`), "utf8"),
    );
    writeFileSync(
      path.join(dir, "emissions.json"),
      JSON.stringify({
        schema_version: "observation-read-facade-emissions/v1",
        launch_token: "launch-1",
        grant_id: "g-1",
        emissions: [],
      }),
    );

    const record = reconcileFacadeDelivery({
      launch: launchIn(dir),
      workerSession: {
        id: sessionId,
        startedAtMs: stampedAtMs - 60_000,
        endedAtMs: stampedAtMs + 60_000,
      },
      recordPath: path.join(dir, "delivery.json"),
      cwd: "/Users/kangmin/Documents/onto-mcp",
      codexHome: dir,
      toolName: "onto_observation_read",
    });
    expect(record.status).toBe("verified");
    if (record.status !== "verified") return;
    expect(record.delivered).toEqual([]);
    // …and it really was persisted, readable by the launch it belongs to.
    expect(readObservationReadDeliveryRecord(path.join(dir, "delivery.json"), "launch-1")?.status)
      .toBe("verified");
  });

  it("refuses a transcript from an unverified codex version", () => {
    const dir = tempDir();
    const sessionId = "019fa33f-3382-7b00-8d5a-ce8e9e7be00d";
    const stampedAtMs = Date.parse("2026-07-27T11:04:16.265Z");
    const at = new Date(stampedAtMs);
    const dayDir = path.join(
      dir,
      "sessions",
      String(at.getFullYear()),
      String(at.getMonth() + 1).padStart(2, "0"),
      String(at.getDate()).padStart(2, "0"),
    );
    mkdirSync(dayDir, { recursive: true });
    const transcript = readFileSync(
      path.join(ROLLOUT_FIXTURES, `${sessionId}.jsonl`),
      "utf8",
    );
    const retagged = transcript.split("\n").filter((line) => line.trim() !== "").map((line) => {
      const record = JSON.parse(line) as { type?: string; payload?: Record<string, unknown> };
      if (record.type === "session_meta" && record.payload) record.payload.cli_version = "9.9.9";
      return JSON.stringify(record);
    }).join("\n");
    writeFileSync(path.join(dayDir, `rollout-x-${sessionId}.jsonl`), retagged);
    writeFileSync(
      path.join(dir, "emissions.json"),
      JSON.stringify({
        schema_version: "observation-read-facade-emissions/v1",
        launch_token: "launch-1",
        grant_id: "g-1",
        emissions: [],
      }),
    );

    const record = reconcileFacadeDelivery({
      launch: launchIn(dir),
      workerSession: {
        id: sessionId,
        startedAtMs: stampedAtMs - 60_000,
        endedAtMs: stampedAtMs + 60_000,
      },
      recordPath: path.join(dir, "delivery.json"),
      cwd: "/Users/kangmin/Documents/onto-mcp",
      codexHome: dir,
      toolName: "onto_observation_read",
    });
    expect(record.status).toBe("unverifiable");
    if (record.status === "unverifiable") expect(record.reason).toBe("cli_version_not_verified");
  });
});
