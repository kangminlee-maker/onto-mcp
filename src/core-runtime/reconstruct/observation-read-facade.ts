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
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ObservationReadError,
  type ObservationReadFailureReason,
  OBSERVATION_ID_PATTERN,
  OBSERVATION_READ_MAX_ID_CHARS,
  OBSERVATION_READ_MAX_REQUEST_IDS,
  type ObservationReadRequest,
} from "./observation-read.js";
import {
  isTerminalObservationReadFailure,
  OBSERVATION_READ_MAX_CALLS,
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
 * Make a launch usable: clear the receipt path so this dispatch starts from NO evidence.
 *
 * The receipt path is derived from the session root and a literal round id, so a resumed run finds its
 * predecessor's file already sitting there. The launch token binding refuses that file — but a binding
 * is a comparison, and a comparison is a line of code that can be wrong. It was: comparing the two
 * tokens directly meant a receipt written before the binding existed met an absent expectation as
 * `undefined !== undefined`, and a stale served set was admitted.
 *
 * Clearing removes the PRECONDITION instead of detecting it. "The file is absent" cannot be computed
 * wrongly, and absent already means "nothing was served" at the consumer, which is the safe answer. The
 * binding stays as the second line of defence — one guards on the file's absence, the other on its
 * contents, so a mistake in either leaves the other standing.
 *
 * Done by the RUNTIME, not the facade: the failure this exists for is the facade never starting, so a
 * facade-side clear would be absent exactly when it is needed. Every launch is built through this
 * function so there is no path that skips it.
 *
 * Fails loud rather than continuing on a best-effort basis: a clear that silently did nothing would put
 * the run back in the state this exists to prevent, without saying so.
 */
export function prepareObservationReadFacadeLaunch(
  launch: ObservationReadFacadeLaunch,
): ObservationReadFacadeLaunch {
  try {
    rmSync(launch.receiptPath, { force: true });
  } catch (error) {
    throw new Error(
      `observation-read facade could not clear a stale receipt at ${launch.receiptPath}: ` +
        `${(error as Error).message}. Serving on top of one risks admitting another dispatch's evidence.`,
    );
  }
  if (existsSync(launch.receiptPath)) {
    throw new Error(
      `observation-read facade receipt at ${launch.receiptPath} still exists after being cleared.`,
    );
  }
  return launch;
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
 * The executable that can actually RUN the resolved entry — derived, not passed.
 *
 * The shipped package resolves a compiled `.js`, which `process.execPath` runs. A source-loaded runtime
 * resolves the `.ts` beside it, which plain node cannot: a live probe registered exactly that pair and
 * codex reported the tool as unavailable, because the server died the instant it started. Deriving the
 * command from the entry's extension removes the mismatch, and an absent loader fails loud here rather
 * than as "the model never called the tool" three minutes later.
 */
function observationReadFacadeServerCommand(serverEntry: string): string {
  if (serverEntry.endsWith(".js")) return process.execPath;
  const loader = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../node_modules/.bin/tsx",
  );
  if (!existsSync(loader)) {
    throw new Error(
      `observation-read facade entry ${serverEntry} needs a TypeScript loader and none is installed ` +
        `at ${loader}. The shipped package resolves a compiled entry; a source-loaded runtime needs tsx.`,
    );
  }
  return loader;
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
export function observationReadFacadeCodexArgs(launch: ObservationReadFacadeLaunch): string[] {
  const server = observationReadFacadeServerEntry();
  const command = observationReadFacadeServerCommand(server);
  return [
    "-c",
    `mcp_servers.onto_observation.command=${JSON.stringify(command)}`,
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
  readonly schema_version: "observation-read-facade-receipt/v2";
  /**
   * The launch this receipt belongs to. WITHOUT it the file is only evidence that *some* facade once
   * served *something* at this path, and the path is derived from the session root plus a literal round
   * id — so a resumed run, or any second dispatch, finds its predecessor's file sitting there. A
   * dispatch whose facade never started would then read that file and admit citations for content this
   * worker never read, which is the exact inverse of the guarantee this stage exists to provide.
   */
  readonly launch_token: string;
  readonly receipt: ObservationReadReceipt;
  /** Attempts this facade rejected before they reached the grant (shape/protocol), for audit honesty. */
  readonly rejected_before_grant: number;
  /**
   * Every failure's REAL message, in order, for the operator only. The worker gets a fixed sentence
   * because the detail can quote artifact text; the runtime owns this file and never sends it anywhere,
   * so this is where "the artifacts could not be read" becomes a diagnosis instead of a dead end.
   *
   * A LIST rather than a single slot because the first failure is usually the cause and the last is
   * usually the symptom: a torn artifact followed by a budget refusal would otherwise leave only the
   * refusal, which explains nothing. Bounded, and the bound keeps BOTH ends — a prefix plus the latest
   * entry — with `dropped_failure_count` saying what fell in between.
   */
  readonly failures: readonly { reason: ObservationReadFailureReason; detail: string }[];
  /**
   * How many failures fell between the retained prefix and the retained latest entry. Without it a
   * truncated list reads as a complete one, and an operator counting entries against `calls_served`
   * would conclude the receipt was inconsistent rather than abridged.
   */
  readonly dropped_failure_count: number;
}

/** Bounds the operator record so one torn artifact cannot grow the receipt without limit. */
const OPERATOR_FAILURE_DETAIL_MAX_CHARS = 2_048;

/**
 * How many leading failures the receipt keeps. One more slot is always reserved for the most recent
 * failure, so the list holds at most this many plus one. "Attempts are bounded by the call limit" was
 * the earlier justification for a plain prefix and it was wrong twice over — refusals that never
 * reached the grant were once unmetered, and a run can fail far more often than it succeeds.
 */
const OPERATOR_FAILURE_HISTORY_MAX = 8;

/** Bounds the model-authored key names echoed back in a shape rejection. */
const UNSUPPORTED_KEY_ECHO_MAX_CHARS = 200;

const DESCRIPTOR_SCHEMA_VERSION: ObservationReadFacadeDescriptor["schema_version"] =
  "observation-read-facade-descriptor/v1";
// v2 because the FILE'S MEANING changed, not its shape: a v1 receipt is evidence that some facade
// served something at this path, a v2 receipt is evidence that THIS launch did. Reusing v1 would leave
// the hole open in both directions — a reader from before the binding accepts our receipts and ignores
// the token, and a v1 receipt reaches our token comparison instead of being refused outright.
const RECEIPT_SCHEMA_VERSION: ObservationReadFacadeReceiptFile["schema_version"] =
  "observation-read-facade-receipt/v2";

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
          // The reader also rejects duplicates, blanks and overlong ids as `request_shape`. Declaring
          // them here is not belt-and-braces: a rule the model can only discover by being refused costs
          // it a round trip, and the refusal it gets back cannot name the cause without quoting text
          // this facade will not quote.
          // `pattern` and not just `minLength`: the reader rejects an id that is only whitespace, and a
          // schema that accepted `"   "` would have the worker told it broke a published rule it kept.
          // `maxLength` counts code points in JSON Schema, so the reader counts them too.
          items: {
            type: "string",
            // No `minLength`: the pattern's `+` already rejects the empty string, and declaring the
            // same rule twice is how two declarations of one rule start disagreeing.
            maxLength: OBSERVATION_READ_MAX_ID_CHARS,
            // The runtime's own id rule, published rather than left to be discovered by refusal. It is
            // also what keeps `maxLength` (code points, per JSON Schema) and the reader's UTF-16 count
            // from ever disagreeing: inside this set they are the same number.
            pattern: OBSERVATION_ID_PATTERN.source,
          },
          uniqueItems: true,
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
      // The exclusivity is DECLARED, not only enforced. Describing the two fields as optional made `{}`
      // and "both at once" schema-valid, so the published contract invited exactly the calls the runtime
      // then rejects — and a rejection the model could have avoided still costs it a round trip.
      oneOf: [
        { required: ["observation_ids"] },
        { required: ["cursor"] },
      ],
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
  readonly #launchToken: string;
  readonly #receiptPath: string;
  #rejectedBeforeGrant = 0;
  readonly #failures: { reason: ObservationReadFailureReason; detail: string }[] = [];
  #droppedFailureCount = 0;
  #spent = false;

  constructor(args: {
    descriptor: ObservationReadFacadeDescriptor;
    /** Injectable for tests; the server entry passes none and gets the real clock. */
    now?: () => number;
  }) {
    // A receipt already at this path bearing OUR launch token means a second dispatch reused this
    // launch, and the opening write below would erase what the first one proved it served. That is
    // silent evidence destruction, so refuse instead: one launch serves one dispatch. A file from a
    // different launch is another run's leftover and is simply replaced — the reader rejects it on the
    // token anyway.
    const existing = readObservationReadFacadeReceipt(
      args.descriptor.receipt_path,
      args.descriptor.launch_token,
    );
    if (existing) {
      throw new Error(
        "observation-read facade refuses to start: a receipt for this launch already exists at " +
          `${args.descriptor.receipt_path}. One launch serves one dispatch; starting again would ` +
          "erase the served set the earlier dispatch proved.",
      );
    }
    this.#launchToken = args.descriptor.launch_token;
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
      // Refused before the grant could see it: an MCP `arguments` object the typed surface cannot
      // express. It is still a round trip, so it goes through the grant's OWN meters — counting it here
      // alone left `serve`'s counter untouched, and 32 refusals followed by a valid call sailed through
      // as if nothing had been spent. `rejected_before_grant` stays as the audit subset it always was.
      return this.rejectCall(request);
    }
    try {
      const page = this.#registry.serve({ token: this.#token, request });
      // NOT written here. The receipt is what the runtime believes the worker received, and until this
      // response is on the wire the worker has received nothing: a facade that died between the write
      // and the flush left a receipt claiming a page that never arrived, and a citation to it was then
      // admitted. `commit()` publishes it after the transport says the bytes went out, so the crash
      // window under-records instead of over-recording — which the consumer already fails closed on.
      return {
        content: [{ type: "text", text: JSON.stringify(page) }],
        structuredContent: page,
        isError: false,
      };
    } catch (error) {
      return this.#failureResult(error);
    }
  }

  /**
   * Publish everything this call changed, once its response has actually been delivered.
   *
   * Called by the process shell after the write completes. Splitting it from `callTool` is the whole
   * point: served state that is durable BEFORE delivery can outlive a response the worker never got.
   */
  commit(): void {
    this.writeReceipt();
  }

  /**
   * Whether this session has answered its last call. A grant with no round trips and no budget left
   * can only produce refusals from here on, and a server that keeps producing them is an unbounded
   * response surface no ceiling in §4.2 can see — so the shell closes after the response goes out.
   */
  get isSpent(): boolean {
    return this.#spent;
  }

  /**
   * Refuse a `tools/call` that never becomes a request — a malformed `arguments` object, or a call
   * naming a tool this server does not serve. Both are round trips whose response lands in the worker's
   * conversation, so both are charged and recorded here rather than answered outside the meters.
   */
  rejectCall(message: string): Record<string, unknown> {
    this.#rejectedBeforeGrant += 1;
    // Recorded BEFORE the charge, and recorded at all: the ordinary shape rejection used to return
    // without touching the failure record, so an operator whose run then died on an unserved citation
    // found nothing written down. Recording first also keeps the CAUSE ahead of any meter symptom the
    // charge below may raise.
    this.#recordFailure("request_shape", message);
    try {
      this.#registry.chargeRejectedCall({ token: this.#token, messageChars: message.length });
    } catch (error) {
      return this.#failureResult(error);
    }
    return toolErrorResult("request_shape", message);
  }

  /**
   * Turn a failure into the worker's answer AND the operator's record.
   *
   * The two are deliberately different. The worker gets the `reason` plus a fixed sentence, because the
   * detailed message can carry artifact text (see WORKER_FAILURE_MESSAGE). But discarding that detail
   * outright left an operator with an unserved-citation failure and no recorded cause, so it is kept
   * here — in the receipt, which only the runtime reads and which never crosses the MCP boundary.
   */
  #failureResult(error: unknown): Record<string, unknown> {
    const reason: ObservationReadFailureReason = error instanceof ObservationReadError
      // Unclassified throw: report it under the closed vocabulary rather than leaking a raw message
      // shape the worker cannot branch on (the same treatment stage 2 gave raw fs errors).
      ? error.reason
      : "artifact_malformed";
    this.#recordFailure(reason, `${(error as Error).message}`);
    // Terminal failures end the session: no later call under this grant can succeed, so the shell closes
    // after this response instead of answering replays forever. WHICH reasons are terminal is the
    // grant's own question — asking it is what stopped this from being a second, shorter list (the first
    // one named the two exhaustion reasons and left an expired grant answering indefinitely).
    if (isTerminalObservationReadFailure(reason)) this.#spent = true;
    return toolErrorResult(reason, WORKER_FAILURE_MESSAGE[reason]);
  }

  /**
   * Keep the first failures AND the most recent one. The cause is usually first and the diagnosis an
   * operator needs is usually last, so a plain prefix silently dropped the terminal error: eight shape
   * rejections followed by a torn artifact left a receipt that never mentioned the artifact.
   */
  #recordFailure(reason: ObservationReadFailureReason, detail: string): void {
    const entry = { reason, detail: detail.slice(0, OPERATOR_FAILURE_DETAIL_MAX_CHARS) };
    if (this.#failures.length < OPERATOR_FAILURE_HISTORY_MAX) {
      this.#failures.push(entry);
      return;
    }
    if (this.#failures.length === OPERATOR_FAILURE_HISTORY_MAX) {
      this.#failures.push(entry); // the reserved latest slot, filled for the first time
      return;
    }
    this.#droppedFailureCount += 1;
    this.#failures[OPERATOR_FAILURE_HISTORY_MAX] = entry;
  }

  /** Rewrite the receipt file atomically: a torn file is indistinguishable from a malicious one. */
  writeReceipt(): void {
    const file: ObservationReadFacadeReceiptFile = {
      schema_version: RECEIPT_SCHEMA_VERSION,
      launch_token: this.#launchToken,
      receipt: this.receipt(),
      rejected_before_grant: this.#rejectedBeforeGrant,
      failures: [...this.#failures],
      dropped_failure_count: this.#droppedFailureCount,
    };
    const temporaryPath = `${this.#receiptPath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.#receiptPath);
  }
}

/**
 * What the WORKER is told about a failure raised below this facade — one fixed sentence per reason,
 * authored here, never a message that travelled up from the reader or the grant.
 *
 * This is a capability boundary, not politeness. Those layers interpolate artifact-derived text into
 * their messages: `fixObservationSnapshot` elides a YAML parser diagnostic into `artifact_malformed`
 * (`observation-read.ts:280`), and a YAML diagnostic quotes the offending SOURCE LINE — which can
 * belong to an observation the consumption gate WITHHELD. Returning it verbatim would route around
 * OBS-4 through the error channel, handing the model content the push gate refused it. The failure is
 * still fully diagnosable on the runtime side, where the detailed message and the receipt both live;
 * what the model needs is the `reason` it branches on, and that is unchanged.
 *
 * Facade-authored `request_shape` text is the one thing still passed through verbatim: it is written in
 * `readToolRequest` from the model's OWN arguments and touches no artifact.
 */
const WORKER_FAILURE_MESSAGE: Record<ObservationReadFailureReason, string> = {
  artifact_malformed:
    "the observation artifacts could not be read; the runtime holds the diagnosis.",
  duplicate_observation_id:
    "the observation catalog is inconsistent; the runtime holds the diagnosis.",
  unknown_observation_id:
    "no observation with that id is available to this dispatch. Use ids from " +
    "prompt_visible_observation_ids.",
  // Deliberately does not name a cause: this reason covers the XOR, empty/oversized lists, blank ids,
  // overlong ids and duplicates, and asserting one of them would send the worker to fix the wrong
  // thing. The published schema states every one of those rules, so a request that reaches here has
  // already ignored a contract it was given.
  request_shape:
    "the request does not satisfy the tool's published input schema. Re-read the schema and send " +
    "exactly one of observation_ids (unique, non-empty ids) or cursor.",
  cursor_malformed: "that cursor is not a continuation this dispatch issued. Start a new fetch.",
  snapshot_drift:
    "the observation set changed under this dispatch; outstanding cursors no longer apply. " +
    "Start a new fetch.",
  budget_too_small: "there is no room left in this dispatch's shared ceiling to serve a page.",
  unknown_grant: "this dispatch has no observation-read session.",
  grant_revoked: "this dispatch's observation-read session is closed.",
  grant_expired: "this dispatch's observation-read session has ended.",
  fetch_budget_exhausted:
    "this dispatch has spent its share of the ceiling. Cite what you already fetched.",
  call_limit_exhausted:
    "this dispatch has used its observation-read calls. Cite what you already fetched.",
  fetch_budget_unservable: "this dispatch cannot serve observation reads.",
};

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
    // Bounded: the model chooses these names, so echoing them verbatim let it size its own error
    // response — an uncharged way to grow its context before this path was metered at all.
    const named = unknownKeys.sort().join(", ").slice(0, UNSUPPORTED_KEY_ECHO_MAX_CHARS);
    return `tool arguments carry unsupported keys: ${named}.`;
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
      // Metered like any other refused call. Answering it outside the session left `tools/call` with a
      // wrong name as a free round trip: no charge, no record, and an unbounded echo of a name the
      // model chose — so 33 of them walked past a 32-call limit.
      return {
        jsonrpc: "2.0",
        id,
        result: session.rejectCall(
          `unknown tool: ${String(params.name).slice(0, UNSUPPORTED_KEY_ECHO_MAX_CHARS)}`,
        ),
      };
    }
    return { jsonrpc: "2.0", id, result: session.callTool(params.arguments) };
  }
  if (record.id === undefined) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
}

/**
 * Read the receipt THIS launch's facade wrote. FAIL-CLOSED by contract: every failure — missing file,
 * torn JSON, wrong schema, a launch token that is not ours — returns null, and the caller must treat
 * null as "nothing was served", never as "the check does not apply".
 *
 * `expectedLaunchToken` is REQUIRED, not optional, because the unbound read is the whole defect: the
 * receipt path is derived from the session root and a literal round id, so a resumed run or a second
 * dispatch finds a predecessor's file already there. A reader that could be called without the token
 * would let a caller re-open that hole; there is no such call to write.
 */
export function readObservationReadFacadeReceipt(
  receiptPath: string,
  expectedLaunchToken: string,
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
  // The FILE's token must be a real token before anything is compared. Comparing the two directly was
  // a gate with a permissive hole: an untyped one-argument call met a pre-binding receipt as
  // `undefined !== undefined`, the mismatch branch never fired, and a stale served set was admitted —
  // measured, not theorised. Validating this side is enough for both, because equality with a non-empty
  // string proves the expectation was that same non-empty string.
  if (typeof record.launch_token !== "string" || record.launch_token.length === 0) return null;
  // Another launch's receipt is another dispatch's evidence. It says nothing about this worker.
  if (record.launch_token !== expectedLaunchToken) return null;
  const receipt = record.receipt;
  if (receipt === null || typeof receipt !== "object") return null;
  const receiptRecord = receipt as Record<string, unknown>;
  if (!Array.isArray(receiptRecord.served)) return null;
  if (typeof receiptRecord.grant_id !== "string") return null;
  // Every served record, not just the array around them. The outer checks made "fail closed on every
  // failure" true only of the envelope: a same-token file whose records lacked hashes and part
  // information was cast straight through, and its ids became citable evidence.
  for (const entry of receiptRecord.served) {
    if (entry === null || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    if (typeof record.observation_id !== "string" || record.observation_id.length === 0) return null;
    if (typeof record.observation_content_sha256 !== "string") return null;
    if (typeof record.part_count !== "number" || !Number.isInteger(record.part_count)) return null;
    if (record.part_count < 1) return null;
    if (!Array.isArray(record.part_indexes)) return null;
    if (record.part_indexes.some((part) => !Number.isInteger(part))) return null;
  }
  return {
    schema_version: RECEIPT_SCHEMA_VERSION,
    launch_token: expectedLaunchToken,
    failures: (Array.isArray(record.failures)
      ? record.failures
      : []) as ObservationReadFacadeReceiptFile["failures"],
    dropped_failure_count: typeof record.dropped_failure_count === "number"
      ? record.dropped_failure_count
      : 0,
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
  return new Set(
    receiptFile.receipt.served
      // WHOLE observations only. A citation names an observation, so serving page 1 of 4 and stopping
      // proves the worker saw an opening fragment — not the thing it is about to cite. Admitting the id
      // anyway let the runtime infer more than its evidence carried, which is the one inference this
      // stage exists to prevent.
      .filter((record) =>
        record.part_count >= 1 &&
        new Set(record.part_indexes).size === record.part_count &&
        record.part_indexes.every((part) => part >= 1 && part <= record.part_count)
      )
      .map((record) => record.observation_id),
  );
}
