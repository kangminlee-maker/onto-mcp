/**
 * Observation catalog tool — the worker-facing facade (design 20260726 §4, stage 3b PULL layer).
 *
 * ARCHITECTURE, and why this is a separate PROCESS rather than a method call. Codex spawns MCP servers
 * itself (measured 2026-07-27, design §5.5): a server is a command it launches, so the grant cannot be
 * served from the onto runtime's own process without adding a socket or HTTP listener. The measured
 * launch surface gives us exactly three channels into that child — `command`, `args`, `env` — and none
 * of them can carry a megabyte prompt (argv is bounded). So:
 *
 *   runtime  writes a DESCRIPTOR file (sources, the two dispatched prompt parts, receipt path, ttl)
 *   codex    launches `node <server> --descriptor=<path>` with the launch token in `env`
 *   facade   mints ITS OWN grant from that descriptor and serves the model over stdio
 *   facade   rewrites the RECEIPT file after every attempt; the runtime reads it after the worker exits
 *
 * The prompt parts travel as a FILE, not as numbers: `mint` measures them with the same
 * `codexCombinedPrompt` the dispatch uses and derives the budget against an IMPORTED ceiling. Passing a
 * pre-computed budget would hand this process a number it cannot check — the exact shape stage 2's
 * cross-family review removed from the grant API.
 *
 * WHAT THE LAUNCH TOKEN IS, honestly: a handshake, not a capability. Both the descriptor and the token
 * are written by the runtime, and a local process that wanted the observations could read the artifacts
 * directly, so the token grants nothing. What it does is bind THIS descriptor to THIS launch: a facade
 * started with a descriptor from one dispatch and an env from another refuses to serve instead of
 * serving the wrong session's snapshot. The grant's own token — the one `serve` requires — is minted
 * here and never leaves this process.
 *
 * WHAT THE RECEIPT IS FOR: it is the `조회` term of design §3's `인용 ⊆ 조회 ⊆ 스냅샷`. The runtime reads
 * it to decide which observation ids an authored artifact may cite. It is written by our own child
 * process, which the model cannot reach: `--disable shell_tool` removes command execution and the JS
 * tool runs in a V8 isolate with no filesystem (measured, design §5.5). A missing or malformed receipt
 * is FAIL-CLOSED at the consumer — no served set means no citation is admissible.
 *
 * This module holds the logic and is pure of process concerns (no argv, no stdio, no exit): the entry
 * point is `observation-read-facade-server.ts`. That split is what lets the protocol handling be tested
 * without spawning anything.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ObservationReadError,
  type ObservationReadFailureReason,
  OBSERVATION_READ_MAX_REQUEST_IDS,
  type ObservationReadRequest,
} from "./observation-read.js";
import {
  ObservationReadGrantRegistry,
  type ObservationReadGrantSources,
  type ObservationReadReceipt,
} from "./observation-read-grant.js";

/**
 * Absolute path to the process codex must launch, resolved from THIS module's own location so it is
 * correct under both the compiled package (`dist/.../observation-read-facade-server.js`) and the
 * source loader (`src/.../observation-read-facade-server.ts`). Fails loud when the sibling is missing:
 * a wiring that registered a nonexistent command would leave the worker with a dead server and the
 * failure would surface as "the model never called the tool", which is a different diagnosis.
 */
export function observationReadFacadeServerEntry(): string {
  const here = fileURLToPath(import.meta.url);
  const entry = path.join(
    path.dirname(here),
    `observation-read-facade-server${path.extname(here)}`,
  );
  if (!existsSync(entry)) {
    throw new Error(
      `observation-read facade server entry is missing at ${entry}. The package must ship it beside ` +
        "this module; registering a command that does not exist gives the worker a dead MCP server.",
    );
  }
  return entry;
}

/** The MCP tool name the worker sees. Named for the repo's `onto_*` convention (design §4). */
export const OBSERVATION_READ_TOOL_NAME = "onto_observation_read";

/** Env var carrying the launch token. Read by the server entry, compared against the descriptor. */
export const OBSERVATION_READ_LAUNCH_TOKEN_ENV = "ONTO_OBSERVATION_READ_LAUNCH_TOKEN";

/**
 * What the runtime writes and the facade reads. Everything the facade needs to mint, and nothing it
 * could not check: no budget numbers, no id lists, no pre-combined prompt.
 */
export interface ObservationReadFacadeDescriptor {
  readonly schema_version: "observation-read-facade-descriptor/v1";
  /** Binds this descriptor to one worker launch; compared against the env token. */
  readonly launch_token: string;
  readonly sources: ObservationReadGrantSources;
  /** The two parts `callCodexCli` writes to stdin, verbatim — combined here to measure the budget. */
  readonly system_prompt: string;
  readonly user_prompt: string;
  /** Where to rewrite the receipt after every attempt. */
  readonly receipt_path: string;
  /** Grant lifetime; the runtime knows the worker's timeout. */
  readonly ttl_ms: number;
}

/**
 * What a dispatch hands the codex route to turn on the facade. Carries no prompt: the route writes the
 * descriptor itself, filling in the two parts it is about to dispatch, so the budget can never be
 * derived from a different string than the one that goes to stdin (stage 2's F6 defect, structurally
 * removed rather than re-checked).
 */
export interface ObservationReadFacadeLaunch {
  readonly sources: ObservationReadGrantSources;
  /** Where the route writes the descriptor for this dispatch. */
  readonly descriptorPath: string;
  /** Where the facade rewrites the receipt; the dispatch's caller reads it afterwards. */
  readonly receiptPath: string;
  /** Binds descriptor to launch (a handshake — see the module header). */
  readonly launchToken: string;
  readonly ttlMs: number;
}

/**
 * Write the descriptor for one dispatch. Called by the codex route with the exact prompt parts it is
 * about to write to stdin.
 */
export function writeObservationReadFacadeDescriptor(args: {
  launch: ObservationReadFacadeLaunch;
  systemPrompt: string;
  userPrompt: string;
}): ObservationReadFacadeDescriptor {
  const descriptor: ObservationReadFacadeDescriptor = {
    schema_version: DESCRIPTOR_SCHEMA_VERSION,
    launch_token: args.launch.launchToken,
    sources: args.launch.sources,
    system_prompt: args.systemPrompt,
    user_prompt: args.userPrompt,
    receipt_path: args.launch.receiptPath,
    ttl_ms: args.launch.ttlMs,
  };
  writeFileSync(args.launch.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
  return descriptor;
}

/**
 * The codex CLI arguments that register this facade — single-sourced here so the measured launch
 * contract lives beside the server it launches.
 *
 * `default_tools_approval_mode="approve"` is REQUIRED, not a convenience: measured 2026-07-27
 * (design §5.5), a worker's MCP call in non-interactive `codex exec` dies as
 * `user cancelled MCP tool call` without it, and neither `auto` nor a global `approval_policy="never"`
 * changes that. Its scope is this server alone — it approves nothing else the worker might reach.
 */
export function observationReadFacadeCodexArgs(
  launch: ObservationReadFacadeLaunch,
  nodeExecutable: string,
): string[] {
  const server = observationReadFacadeServerEntry();
  return [
    "-c",
    `mcp_servers.onto_observation.command=${JSON.stringify(nodeExecutable)}`,
    "-c",
    `mcp_servers.onto_observation.args=[${JSON.stringify(server)},${
      JSON.stringify(`--descriptor=${launch.descriptorPath}`)
    }]`,
    "-c",
    `mcp_servers.onto_observation.env.${OBSERVATION_READ_LAUNCH_TOKEN_ENV}=${
      JSON.stringify(launch.launchToken)
    }`,
    "-c",
    'mcp_servers.onto_observation.default_tools_approval_mode="approve"',
    "-c",
    "mcp_servers.onto_observation.startup_timeout_sec=30",
  ];
}

/** Written by the facade, read by the runtime after the worker exits. */
export interface ObservationReadFacadeReceiptFile {
  readonly schema_version: "observation-read-facade-receipt/v1";
  readonly receipt: ObservationReadReceipt;
  /** Attempts this facade rejected before they reached the grant (shape/protocol), for audit honesty. */
  readonly rejected_before_grant: number;
}

const DESCRIPTOR_SCHEMA_VERSION: ObservationReadFacadeDescriptor["schema_version"] =
  "observation-read-facade-descriptor/v1";
const RECEIPT_SCHEMA_VERSION: ObservationReadFacadeReceiptFile["schema_version"] =
  "observation-read-facade-receipt/v1";

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`observation-read facade descriptor field ${field} must be a non-empty string.`);
  }
  return value;
}

/**
 * Parse and validate a descriptor. Fails loud on every missing field rather than defaulting: a facade
 * that started with half a descriptor would serve a grant nobody described.
 */
export function parseObservationReadFacadeDescriptor(
  text: string,
): ObservationReadFacadeDescriptor {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `observation-read facade descriptor is not valid JSON: ${(error as Error).message}`,
    );
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("observation-read facade descriptor must be a JSON object.");
  }
  const record = raw as Record<string, unknown>;
  if (record.schema_version !== DESCRIPTOR_SCHEMA_VERSION) {
    throw new Error(
      `observation-read facade descriptor schema_version must be ${DESCRIPTOR_SCHEMA_VERSION}, got ` +
        `${String(record.schema_version)}.`,
    );
  }
  const sources = record.sources;
  if (sources === null || typeof sources !== "object") {
    throw new Error("observation-read facade descriptor field sources must be an object.");
  }
  const sourceRecord = sources as Record<string, unknown>;
  const ttlMs = record.ttl_ms;
  if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("observation-read facade descriptor field ttl_ms must be a positive number.");
  }
  return {
    schema_version: DESCRIPTOR_SCHEMA_VERSION,
    launch_token: assertString(record.launch_token, "launch_token"),
    sources: {
      observationsPath: assertString(sourceRecord.observationsPath, "sources.observationsPath"),
      safetyLedgerPath: assertString(sourceRecord.safetyLedgerPath, "sources.safetyLedgerPath"),
      safetyLedgerValidationPath: assertString(
        sourceRecord.safetyLedgerValidationPath,
        "sources.safetyLedgerValidationPath",
      ),
    },
    // Allowed to be EMPTY, unlike every other field: a dispatch with an empty system prompt is legal,
    // and the budget derivation is what decides whether the remaining headroom funds a page.
    system_prompt: typeof record.system_prompt === "string"
      ? record.system_prompt
      : (() => {
        throw new Error("observation-read facade descriptor field system_prompt must be a string.");
      })(),
    user_prompt: typeof record.user_prompt === "string"
      ? record.user_prompt
      : (() => {
        throw new Error("observation-read facade descriptor field user_prompt must be a string.");
      })(),
    receipt_path: assertString(record.receipt_path, "receipt_path"),
    ttl_ms: ttlMs,
  };
}

/**
 * The tool as the worker sees it. The input schema is the design §4.1 contract made UNREPRESENTABLE
 * rather than merely validated: there is no session field, no path, no glob, no detail level, and no
 * byte cap the model could name — only ids or an opaque cursor, exclusively.
 */
export function observationReadToolDefinition(): Record<string, unknown> {
  return {
    name: OBSERVATION_READ_TOOL_NAME,
    description:
      "Fetch the full detail of source observations the prompt's navigation catalog lists. Pass up to " +
      `${OBSERVATION_READ_MAX_REQUEST_IDS} observation_ids from that catalog, or pass back a cursor a ` +
      "previous call returned. Every call is metered against one shared budget with the prompt itself, " +
      "so fetch what you will actually cite. An observation larger than one page arrives split: " +
      "concatenate part_index 1..part_count to recover its body exactly.",
    inputSchema: {
      type: "object",
      properties: {
        observation_ids: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: OBSERVATION_READ_MAX_REQUEST_IDS,
          description: "Observation ids from the prompt catalog. Mutually exclusive with cursor.",
        },
        cursor: {
          type: "string",
          description: "Opaque continuation from a previous page. Mutually exclusive with observation_ids.",
        },
      },
      additionalProperties: false,
    },
  };
}

/** JSON-RPC id type as it appears on the wire. */
type JsonRpcId = string | number | null;

export interface FacadeResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * The grant this facade serves, plus the receipt sink. Held by the server entry; passed in so the
 * protocol handling below is a pure function of (message, session) and testable without a process.
 */
export class ObservationReadFacadeSession {
  readonly #registry: ObservationReadGrantRegistry;
  readonly #token: string;
  readonly #receiptPath: string;
  #rejectedBeforeGrant = 0;

  constructor(args: {
    descriptor: ObservationReadFacadeDescriptor;
    /** Injectable for tests; the server entry passes none and gets the real clock. */
    now?: () => number;
  }) {
    this.#registry = new ObservationReadGrantRegistry(
      args.now ? { now: args.now } : {},
    );
    const minted = this.#registry.mint({
      sources: args.descriptor.sources,
      systemPrompt: args.descriptor.system_prompt,
      userPrompt: args.descriptor.user_prompt,
      ttlMs: args.descriptor.ttl_ms,
    });
    this.#token = minted.token;
    this.#receiptPath = args.descriptor.receipt_path;
    // Write the opening receipt BEFORE serving anything: a worker that dies on its first turn still
    // leaves the runtime a receipt saying "granted, served nothing", which is the fail-closed input the
    // citation check wants — distinguishable from "no facade ran at all".
    this.writeReceipt();
  }

  get token(): string {
    return this.#token;
  }

  receipt(): ObservationReadReceipt {
    return this.#registry.receipt(this.#token);
  }

  /**
   * Serve one tool call. Returns the MCP `tools/call` result — success or a structured error. Never
   * throws for a content reason: the worker must see a `reason` it can act on, and the runtime must see
   * the attempt in the receipt either way (design §4.2.1 charges failed calls).
   */
  callTool(rawArguments: unknown): Record<string, unknown> {
    const request = readToolRequest(rawArguments);
    if (typeof request === "string") {
      // Rejected before the grant saw it: shape errors that the grant's own vocabulary does not cover
      // (a malformed MCP arguments object). Counted separately so the receipt does not imply the grant
      // metered them.
      this.#rejectedBeforeGrant += 1;
      this.writeReceipt();
      return toolErrorResult("request_shape", request);
    }
    try {
      const page = this.#registry.serve({ token: this.#token, request });
      this.writeReceipt();
      return {
        content: [{ type: "text", text: JSON.stringify(page) }],
        structuredContent: page,
        isError: false,
      };
    } catch (error) {
      this.writeReceipt();
      if (error instanceof ObservationReadError) {
        return toolErrorResult(error.reason, error.message);
      }
      // Unclassified throw: report it under the closed vocabulary rather than leaking a raw message
      // shape the worker cannot branch on (the same treatment stage 2 gave raw fs errors).
      return toolErrorResult(
        "artifact_malformed",
        `observation read failed: ${(error as Error).message}`,
      );
    }
  }

  /** Rewrite the receipt file atomically: a torn file is indistinguishable from a malicious one. */
  writeReceipt(): void {
    const file: ObservationReadFacadeReceiptFile = {
      schema_version: RECEIPT_SCHEMA_VERSION,
      receipt: this.receipt(),
      rejected_before_grant: this.#rejectedBeforeGrant,
    };
    const temporaryPath = `${this.#receiptPath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.#receiptPath);
  }
}

function toolErrorResult(
  reason: ObservationReadFailureReason,
  message: string,
): Record<string, unknown> {
  const payload = { reason, message };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
}

/**
 * Narrow the MCP `arguments` object to the tool contract. Returns the request, or a message describing
 * why it is not one. Deliberately strict: an unknown key is a rejected request, not an ignored one, so
 * the tool cannot quietly acquire a wider surface than §4.1 declares.
 */
function readToolRequest(rawArguments: unknown): ObservationReadRequest | string {
  const record = (rawArguments ?? {}) as Record<string, unknown>;
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return "tool arguments must be an object.";
  }
  const unknownKeys = Object.keys(record).filter(
    (key) => key !== "observation_ids" && key !== "cursor",
  );
  if (unknownKeys.length > 0) {
    return `tool arguments carry unsupported keys: ${unknownKeys.sort().join(", ")}.`;
  }
  const hasIds = record.observation_ids !== undefined;
  const hasCursor = record.cursor !== undefined;
  if (hasIds === hasCursor) {
    return "tool arguments must carry exactly one of observation_ids or cursor.";
  }
  if (hasCursor) {
    if (typeof record.cursor !== "string") return "cursor must be a string.";
    return { cursor: record.cursor };
  }
  if (!Array.isArray(record.observation_ids)) return "observation_ids must be an array.";
  if (record.observation_ids.some((id) => typeof id !== "string")) {
    return "observation_ids must contain only strings.";
  }
  return { observation_ids: record.observation_ids as string[] };
}

/**
 * Handle one JSON-RPC message. Returns the response to write, or `null` for a notification.
 *
 * The protocol surface is deliberately tiny — `initialize`, `tools/list`, `tools/call`, `ping` — because
 * every method this speaks is a method the worker can reach.
 */
export function handleFacadeMessage(
  message: unknown,
  session: ObservationReadFacadeSession,
): FacadeResponse | null {
  if (message === null || typeof message !== "object") return null;
  const record = message as Record<string, unknown>;
  const id = (record.id ?? null) as JsonRpcId;
  const method = typeof record.method === "string" ? record.method : "";
  const params = (record.params ?? {}) as Record<string, unknown>;

  if (method === "initialize") {
    const requested = typeof params.protocolVersion === "string"
      ? params.protocolVersion
      : "2025-06-18";
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "onto-observation-read-facade", version: "1" },
      },
    };
  }
  if (method.startsWith("notifications/")) return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: [observationReadToolDefinition()] } };
  }
  if (method === "tools/call") {
    if (params.name !== OBSERVATION_READ_TOOL_NAME) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `unknown tool: ${String(params.name)}` },
      };
    }
    return { jsonrpc: "2.0", id, result: session.callTool(params.arguments) };
  }
  if (record.id === undefined) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
}

/**
 * Read a receipt the facade wrote. FAIL-CLOSED by contract: every failure — missing file, torn JSON,
 * wrong schema — returns null, and the caller must treat null as "nothing was served", never as "the
 * check does not apply".
 */
export function readObservationReadFacadeReceipt(
  receiptPath: string,
): ObservationReadFacadeReceiptFile | null {
  let text: string;
  try {
    text = readFileSync(receiptPath, "utf8");
  } catch {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.schema_version !== RECEIPT_SCHEMA_VERSION) return null;
  const receipt = record.receipt;
  if (receipt === null || typeof receipt !== "object") return null;
  const receiptRecord = receipt as Record<string, unknown>;
  if (!Array.isArray(receiptRecord.served)) return null;
  if (typeof receiptRecord.grant_id !== "string") return null;
  return {
    schema_version: RECEIPT_SCHEMA_VERSION,
    receipt: receipt as ObservationReadReceipt,
    rejected_before_grant: typeof record.rejected_before_grant === "number"
      ? record.rejected_before_grant
      : 0,
  };
}

/**
 * The observation ids a receipt proves were SERVED — the `조회` set citations are checked against.
 * Returns an empty set for a null receipt, which is what makes the consumer fail closed.
 */
export function observationIdsServed(
  receiptFile: ObservationReadFacadeReceiptFile | null,
): ReadonlySet<string> {
  if (!receiptFile) return new Set();
  return new Set(receiptFile.receipt.served.map((record) => record.observation_id));
}
