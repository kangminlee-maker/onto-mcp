/**
 * Observation catalog tool — Stage 2 session scope binding + cumulative budget (design 20260726 §4.1/§4.2).
 *
 * Stage 1 (`observation-read.ts`) is a pure reader: given a fixed snapshot, a request and a page budget,
 * it serves deterministic bounded pages. It answers "what does this id contain". This module answers the
 * two questions Stage 1 deliberately left open:
 *
 *   WHICH observations may this session pull at all?   → the grant's snapshot, gated (see GATE below)
 *   HOW MUCH may it pull before the ceiling is spent?  → the grant's cumulative budget (see BUDGET below)
 *
 * A grant is a session-scoped, revocable, budget-bearing authority to read. The runtime mints one when it
 * launches a worker, bakes its TOKEN into the worker's connection/environment, and revokes it at exit
 * (design §4.1) — so the session identifier never appears in model input and cannot be named, guessed or
 * swapped by the model. `serve` is the only way to read, and a token is the only way to `serve`.
 *
 * # The isolation boundary, stated precisely
 *
 * A token reaches ONLY its own grant's snapshot, and every budget charge lands on its own grant. What
 * isolation does NOT mean: a cursor is not bound to a grant. Two grants over identical inputs derive the
 * identical `snapshot_digest`, so one's cursor is accepted by the other — measured, not theoretical. That
 * is harmless and deliberate: the receiving token could have requested those same ids directly, so the
 * cursor still only ever NARROWS (design §9.1). Binding a cursor to a grant would need a per-grant secret
 * in it, which is the MAC design §10 considered and did not adopt. Across grants with DIFFERENT content
 * the digests differ and the cursor is refused.
 *
 * # GATE — why minting requires the source-safety ledger
 *
 * The push path is fail-closed: `sourceObservationsForPrompt` admits an observation into a prompt only
 * when its `prompt_context` source-safety row carries `visibility_tier: "consumption_allowed"`; any other
 * tier, or a missing row, withholds it. Every prompt-bearing surface in `run.ts` consumes that gated
 * projection.
 *
 * A pull path fixing its snapshot from the on-disk artifact would serve exactly what the push path
 * withholds — a second door past an existing authority. So the gate lives in the SNAPSHOT CONSTRUCTOR:
 * `fixObservationSnapshot(text, ledger)` takes the ledger as a required parameter and admits only what the
 * ledger admits, and `readObservationPage` reads nothing but a snapshot. There is therefore no ungated
 * snapshot value in the type system and no reader entry point that skips the gate — not because this
 * module is the only caller, but because the bypass cannot be written. (owner decision, 2026-07-26.)
 *
 * The first version of this module DID rely on being the only caller, keeping an ungated
 * `fixObservationSnapshot(text)` exported next to the reader. Cross-family review paired the two exports
 * and served a withheld observation with every type satisfied. That is the difference between a
 * convention and a constraint.
 *
 * The rule is a MIRROR of the push gate, not a stricter variant: the two admit the same set by
 * construction, so the catalog the model navigates and the details it can fetch never disagree.
 *
 * # BUDGET — one ceiling, shared between what is pushed and what is pulled
 *
 * Tool results accumulate in the worker's conversation, so a per-response cap alone would only move the
 * overflow inside codex (design §4.2). The cumulative budget is the remaining headroom of the EXISTING
 * `CODEX_PROMPT_INPUT_CHAR_LIMIT`, imported from the module that owns it — no new ceiling is minted and
 * no caller declares one. (Taking the ceiling as a parameter let a caller pass 3,000,000; a grant then
 * served 1,064,510 chars past the real limit. Cross-family review.)
 *
 * The page budget is a CONSTANT for the grant's life, which is what resolves the conflict Stage 1 left
 * open: a cursor is bound to the budget its split was computed at, so a budget that shrank per call would
 * refuse every continuation. Shrinking is therefore expressed the only way that keeps the split
 * deterministic — as ADMISSION ("is there room for one more full page?"), never as a smaller page. The
 * cost is bounded: up to one page's worth of headroom goes unspent, and exhaustion is an explicit error
 * rather than a silent truncation.
 *
 * Trusting the cursor's own budget field instead would make a cursor an authorization — it could name a
 * budget larger than the ceiling — which design §9.1 rules out ("a cursor is a coordinate, not an
 * authorization"). The budget therefore lives only here, in runtime-held state the model cannot address.
 *
 * # What this module does NOT do
 *
 * Nothing outside tests consumes it yet — the tool façade and the ledger surface are Stage 3, the audit
 * record and post-hoc fingerprint are Stage 4.
 *
 * It DOES read the two artifacts synchronously on every `serve`. Deliberate: the drift check is only
 * meaningful over current contents, and a sync read of local files (measured 5.5 ms for the 4.2 MB pair,
 * against 579 ms to re-parse them) keeps `serve` non-async so it composes with the sync reader.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { codexCombinedPrompt, CODEX_PROMPT_INPUT_CHAR_LIMIT } from "../llm/llm-caller.js";
import type {
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
} from "./artifact-types.js";
import {
  type ObservationReadFailureReason,
  assertObservationSnapshotDigestUnchanged,
  elideMessageValue,
  fixObservationSnapshot,
  ObservationReadError,
  readObservationPage,
  type ObservationReadPage,
  type ObservationReadRequest,
  type ObservationSnapshot,
} from "./observation-read.js";
import {
  type ObservationCoverage,
  type ObservationCoverageRecord,
  foldObservationRange,
  observationCoverageRecord,
} from "./observation-read-coverage.js";

/**
 * Per-response ceiling — design §4.2's "응답 1건당 상한". Held constant for a grant's life (see BUDGET
 * above).
 *
 * 32,000 because a page has to SURVIVE THE TRIP, and the trip has a ceiling this side cannot see: codex
 * trims a tool result middle-out on the way into the model's context, and the MCP server is never told.
 * Two measurements bracket it — in real transcripts the clipped received records cluster at 40,149–40,150
 * chars (that is the clip length, not the limit) while the largest record that arrived whole is 32,151;
 * a direct probe passed at 32,035 and was clipped at 65,049. So the true limit sits somewhere in
 * (32,151, 40,149] and nobody has measured where. This budget sizes the largest page it can emit
 * (31,960 over the measured corpus) BELOW the largest payload ever observed to arrive intact, rather
 * than below the clip length — evidence rather than arithmetic.
 *
 * The previous value, 65,536, sat on the wrong side of both brackets: a full page could not reach the
 * model whole, which under delivery reconciliation meant it was never attested and under the default
 * receipt path meant the runtime authorized a citation to content the worker never saw.
 *
 * THIS IS NECESSARY, NOT SUFFICIENT. The unit codex clips is the RECEIVED RECORD, not the page, and one
 * exec turn can render several tool results into a single record (`delivery-reconciliation.ts` header,
 * measurement 20-… §2). Two pages this size in one turn still exceed the bracket. Sizing alone cannot
 * close that; only transcript-confirmed delivery can, because a clipped record simply fails to attest.
 * See design `23-…md` §3/S4.
 */
export const OBSERVATION_READ_PAGE_CHAR_BUDGET = 32_000;

/**
 * Smallest `pageCharBudget` a grant may be minted with. Both bounds below are MEASURED, not chosen:
 *
 * 1. The reader needs 3,376 chars to serve the worst shape-legal request (`OBSERVATION_READ_MAX_REQUEST_IDS`
 *    ids each at `OBSERVATION_READ_MAX_ID_CHARS`), because the page envelope reserves room for a
 *    continuation cursor carrying all of them. Below that, a well-formed request is refused
 *    `budget_too_small` — a grant that cannot serve its own legal requests must not exist.
 * 2. The longest failure message any `serve` can produce is 200 chars, so the per-call reservation
 *    (`floor + OBSERVATION_READ_EXCHANGE_FRAMING_CHARS` = 5,120) covers charging the real message text.
 *    WITHOUT this floor that guarantee fails: cross-family review minted at `pageCharBudget: 1`, where the
 *    total was exactly the 1,025-char reservation, and one legal call charged 1,181 — 156 over its own
 *    budget. The cumulative bound is only a bound if the reservation dominates every charge.
 *
 * Both numbers are asserted in the tests, so raising `OBSERVATION_READ_MAX_ID_CHARS` or the id cap without
 * revisiting this floor fails rather than silently re-opening the overrun.
 */
export const OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET = 4_096;

/**
 * Chars charged for the envelope around ONE tool exchange — the call, the result wrapper and the turn
 * markers codex renders into the worker's conversation.
 *
 * UNMEASURED, and deliberately generous. We know the provider's ceiling in its own unit (the
 * `input_too_large` payload reports `max_chars`) but not what codex adds per tool turn on top of the
 * payload it is given. Over-reserving costs headroom; under-reserving would put the overflow back inside
 * codex, which is the failure this budget exists to prevent. Stage 5's 59-file run is where the real
 * figure gets measured — until then this is a conservative model, not a measurement.
 */
export const OBSERVATION_READ_EXCHANGE_FRAMING_CHARS = 1_024;

/**
 * Chars withheld from the fetch budget for the worker's own session scaffolding (system preamble, tool
 * schema, instruction framing) — design §4.2's "프레이밍 예비". Same evidentiary status as the per-exchange
 * figure above: conservative, unmeasured, Stage 5 measures it.
 */
export const OBSERVATION_READ_SESSION_RESERVE_CHARS = 8_192;

/**
 * Calls one grant may serve — design §4.2's "dispatch당 호출 횟수 상한".
 *
 * Deliberately a CONSTANT rather than `floor(total / perCall)`. Derived that way it would be dominated:
 * the char bound could never bind first, so the cumulative accounting the design calls for would be
 * unreachable code that a mutation cannot even fail. As a constant the two bounds measure different
 * things and both stay live — chars bound how much of the ceiling the pull side may occupy, calls bound
 * how many round trips a worker may spend (a pathological loop of tiny pages is a latency failure the
 * char bound does not see).
 *
 * 32 is sized off the measured corpus: its largest observation is 780,114 chars, ~12 pages at the 64 KiB
 * page budget, leaving room for a dozen ordinary fetches in the same session. Note the honest
 * consequence — with a 353 KB pushed prompt the char bound funds only ~10 pages, so that one observation
 * cannot be pulled whole. The tool reallocates the ceiling between push and pull; it does not raise it.
 */
export const OBSERVATION_READ_MAX_CALLS = 32;

/**
 * Whether a failure ends the session — no later call under this grant can succeed.
 *
 * Declared HERE because this module owns the lifecycle that makes them terminal: expiry and revocation
 * latch, and the two exhaustion reasons are checked before any state changes. A consumer that listed
 * them itself would be a second declaration of the same rule, and the first attempt at one listed only
 * the two exhaustion reasons — leaving an expired grant answering indefinitely.
 */
export function isTerminalObservationReadFailure(
  reason: ObservationReadFailureReason,
): boolean {
  return reason === "call_limit_exhausted" || reason === "fetch_budget_exhausted" ||
    reason === "grant_expired" || reason === "grant_revoked" || reason === "unknown_grant";
}

/**
 * WHERE the grant's artifacts live. Paths, not contents, and deliberately so: this module re-reads them on
 * every `serve` to detect a mid-flight rewrite, so freshness is a property of the mechanism rather than of
 * a caller remembering to hand over current values.
 *
 * The earlier shape took a `readInputs: () => contents` closure. Cross-family review showed the type was
 * satisfied by `() => cachedContents`, which made the mandatory drift check pass over stale values — the
 * check ran and proved nothing. A path cannot go stale.
 */
export interface ObservationReadGrantSources {
  /** Path to the `source-observations` artifact. */
  readonly observationsPath: string;
  /** Path to the `source-safety-ledger` artifact whose `prompt_context` rows decide what may be served. */
  readonly safetyLedgerPath: string;
  /**
   * Path to the ledger's `source-safety-ledger-validation` artifact. Required, and asserted `valid` at
   * mint.
   *
   * The gate trusts the ledger's `visibility_tier` verbatim — exactly as the push gate does, which is what
   * makes the two an exact mirror. But that tier is only trustworthy because the canonical validator
   * refuses a tier not DERIVED from the four axes (`visibility_derivation_mismatch`), and `run.ts:1767`
   * asserts that validation before any prompt surface consumes the projection. Cross-family review flipped
   * a row to `authorization_state: unauthorized` while leaving `visibility_tier: consumption_allowed`: the
   * validator rejects it, the gate alone does not. Requiring the validation artifact here puts that
   * assertion on the pull path mechanically instead of assuming a Stage-3 wiring will mint after it.
   *
   * This does not make the pull path stricter than the push path: in any run where push works, run.ts has
   * already asserted the same artifact valid.
   */
  readonly safetyLedgerValidationPath: string;
}

/** Both artifacts as raw text. Reading is cheap (measured 5.5 ms for the 4.2 MB pair); parsing is not. */
interface ObservationReadGrantSourceTexts {
  readonly observationsText: string;
  readonly safetyLedgerText: string;
}

function readGrantSourceTexts(
  sources: ObservationReadGrantSources,
): ObservationReadGrantSourceTexts {
  return {
    observationsText: readArtifactText(sources.observationsPath, "source-observations"),
    safetyLedgerText: readArtifactText(sources.safetyLedgerPath, "source-safety-ledger"),
  };
}

/**
 * Read an artifact, mapping an unreadable file into this module's closed failure vocabulary.
 *
 * Reading per serve is what makes the drift check meaningful, but it also puts fs errors on a path whose
 * whole contract is "branch on `reason`". Measured before this wrapper existed: deleting either artifact
 * mid-flight threw a raw `ENOENT` with no `reason` at all, so the tool layer would have had to special-case
 * errno codes or leak an unclassified throw to a worker. An artifact this module cannot read is, to it,
 * indistinguishable from one it cannot use — the existing `artifact_malformed` covers both, and a second
 * reason would split a concept no consumer branches on differently.
 *
 * The message names the artifact's ROLE, not its path: this text can reach a worker, and the filesystem
 * layout is not something the worker needs in order to know the run is broken.
 */
function readArtifactText(filePath: string, artifactRole: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    throw new ObservationReadError(
      "artifact_malformed",
      `${artifactRole} could not be read (${(error as { code?: string }).code ?? "read failed"})`,
    );
  }
}

/**
 * Assert the ledger at `sources.safetyLedgerPath` is the runtime-written, validated ledger FOR
 * `sources.observationsPath`. Runs once, at mint.
 *
 * Two bindings, both on values the runtime's own writers populate:
 *
 * - The ledger names the observations artifact it was built from (`source_observations_ref`, set to
 *   `path.resolve(...)` by `writeSourceSafetyLedgerArtifact`). Comparing it is a real artifact-identity
 *   check, unlike comparing `session_id` — which is `path.basename(sessionRoot)`, so two runs under roots
 *   ending in the same name share it, and observation ids are a hash of the source path, so they collide
 *   too. Cross-family review built that pair: A's observations gated by B's permitting ledger, session
 *   check satisfied.
 * - The validation artifact must report `valid` for THIS ledger and THESE observations (see
 *   `safetyLedgerValidationPath`).
 *
 * A `null` ref fails: the live writer always sets it, so absence means the ledger did not come from the
 * runtime's writer — which is the case worth refusing.
 */
function assertLedgerBoundToObservations(sources: ObservationReadGrantSources): void {
  const validation = parseYamlArtifact(
    readArtifactText(sources.safetyLedgerValidationPath, "source-safety-ledger-validation"),
    "source-safety-ledger-validation",
  ) as Partial<ReconstructSourceSafetyLedgerValidationArtifact>;
  if (validation.validation_status !== "valid") {
    throw new ObservationReadError(
      "artifact_malformed",
      `source-safety-ledger-validation reports ${elideMessageValue(String(validation.validation_status))}, not valid`,
    );
  }
  const observationsPath = path.resolve(sources.observationsPath);
  const ledgerPath = path.resolve(sources.safetyLedgerPath);
  for (
    const [role, ref, expected] of [
      ["source-safety-ledger-validation", validation.source_observations_ref, observationsPath],
      ["source-safety-ledger-validation", validation.source_safety_ledger_ref, ledgerPath],
    ] as const
  ) {
    if (typeof ref !== "string" || path.resolve(ref) !== expected) {
      throw new ObservationReadError(
        "artifact_malformed",
        `${role} was not produced for ${path.basename(expected)}`,
      );
    }
  }
  const ledger = parseSafetyLedger(
    readArtifactText(sources.safetyLedgerPath, "source-safety-ledger"),
  );
  const ledgerRef = ledger.source_observations_ref;
  if (typeof ledgerRef !== "string" || path.resolve(ledgerRef) !== observationsPath) {
    throw new ObservationReadError(
      "artifact_malformed",
      "source-safety-ledger was not written for this source-observations artifact",
    );
  }
  // The validation above proves a validator once ran over a ledger AT THIS PATH — not over THIS
  // ledger. A same-path rewrite after validation would carry the old verdict, and flipping one row
  // from `no_prompt_use` to `consumption_allowed` would then expose an observation the gate had
  // withheld (codex review, PR #271).
  //
  // These two counts are what the validation artifact already carries about the ledger's CONTENTS, so
  // checking them costs nothing and refuses exactly that flip: retiering a withheld row changes
  // `no_prompt_use_count`, and adding or dropping rows changes `safety_row_count`.
  //
  // NOT a content bind. An edit that preserves both counts — swapping WHICH row is withheld — still
  // passes. Closing that needs the validation artifact to carry content hashes, or the validator to
  // re-run at mint; both change a contract, so they are an owner decision rather than a quiet fix.
  const rows = Array.isArray(ledger.safety_rows) ? ledger.safety_rows : [];
  const withheldRows = rows.filter((row) =>
    (row as { visibility_tier?: unknown } | null)?.visibility_tier === "no_prompt_use"
  ).length;
  for (
    const [field, actual, expected] of [
      ["safety_row_count", rows.length, validation.safety_row_count],
      ["no_prompt_use_count", withheldRows, validation.no_prompt_use_count],
    ] as const
  ) {
    if (typeof expected !== "number" || actual !== expected) {
      throw new ObservationReadError(
        "artifact_malformed",
        `source-safety-ledger ${field} is ${actual}, but its validation recorded ` +
          `${String(expected)} — the ledger changed after it was validated`,
      );
    }
  }
}

function parseYamlArtifact(text: string, artifactRole: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parseYaml(text) as unknown;
  } catch (error) {
    throw new ObservationReadError(
      "artifact_malformed",
      `${artifactRole} is not parseable YAML: ${elideMessageValue((error as Error).message)}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ObservationReadError("artifact_malformed", `${artifactRole} is not a mapping`);
  }
  return parsed as Record<string, unknown>;
}

function parseSafetyLedger(ledgerText: string): ReconstructSourceSafetyLedgerArtifact {
  let ledger: unknown;
  try {
    ledger = parseYaml(ledgerText) as unknown;
  } catch (error) {
    throw new ObservationReadError(
      "artifact_malformed",
      `source-safety-ledger is not parseable YAML: ${(error as Error).message}`,
    );
  }
  if (
    !ledger || typeof ledger !== "object" || Array.isArray(ledger) ||
    typeof (ledger as { session_id?: unknown }).session_id !== "string" ||
    !Array.isArray((ledger as { safety_rows?: unknown }).safety_rows)
  ) {
    // Shape-checked rather than trusted from the type: this is a file read at runtime, and a torn write
    // leaves parseable YAML whose `safety_rows` is missing. An absent array would make the gate admit
    // nothing — fail-closed, so not unsafe, but indistinguishable from a real policy decision that
    // withheld everything. Fail loud instead.
    throw new ObservationReadError(
      "artifact_malformed",
      "source-safety-ledger must be a mapping with session_id and a safety_rows array",
    );
  }
  return ledger as ReconstructSourceSafetyLedgerArtifact;
}

export interface ObservationReadFetchBudget {
  /** Constant per-response ceiling every page of this grant is sized against. */
  readonly page_char_budget: number;
  /** Total chars this grant may serve across all calls, framing included. */
  readonly total_fetch_char_budget: number;
  /** Calls this grant may serve — a round-trip bound, independent of the char bound above. */
  readonly max_calls: number;
}

/**
 * One observation this grant actually served, and WHICH CHARACTERS of it.
 *
 * The shape is `ObservationCoverageRecord`, shared with the delivery record. What differs is the
 * AUTHORITY: this one says the runtime wrote those bytes, that one says the worker received them, and
 * only the second is what a citation claims. The names are kept apart for exactly that reason.
 */
export type ObservationReadServedRecord = ObservationCoverageRecord;


/**
 * What the runtime handed out under a grant — the "조회" term of design §3's chain
 * (`인용 ⊆ 조회 ⊆ 스냅샷`). Named honestly: this records what the runtime SERVED, not what the model read
 * (design §7). Stage 3 validates citations against `served`; Stage 4 folds it into the audit record.
 *
 * Carries `grant_id`, never the token: the token authorizes reads, the id identifies the episode in a
 * record that may be written to disk or logged.
 */
export interface ObservationReadReceipt {
  readonly grant_id: string;
  readonly snapshot_digest: string;
  readonly admitted_observation_count: number;
  /** Observations present in the artifact that the gate withheld. Non-zero means the gate did work. */
  readonly withheld_observation_count: number;
  readonly budget: ObservationReadFetchBudget;
  readonly calls_served: number;
  readonly chars_served: number;
  readonly served: readonly ObservationReadServedRecord[];
}

interface ObservationReadGrantState {
  readonly grant_id: string;
  readonly sources: ObservationReadGrantSources;
  readonly snapshot: ObservationSnapshot;
  readonly budget: ObservationReadFetchBudget;
  readonly expiresAtMs: number;
  /**
   * Fast-path drift cache — hashes of the two artifact TEXTS the fixed snapshot was derived from. If both
   * still hash the same, nothing the snapshot depends on can have changed, so the re-derivation is
   * skipped (measured: re-parsing the observations artifact costs 579 ms, dwarfing the 13 ms this check
   * spends). Never authority: a mismatch only routes the check to the digest comparison, which is the
   * single rule that decides drift.
   */
  observationsTextSha256: string;
  safetyLedgerTextSha256: string;
  revoked: boolean;
  /**
   * Latched once expiry is observed. Recomputing `now() >= expiresAtMs` on every call is not terminal: a
   * clock that moves BACKWARDS (NTP correction, manual change) resurrects the grant, and cross-family
   * review demonstrated exactly that with an injected clock. "Terminal" has to be state.
   */
  expired: boolean;
  callsServed: number;
  charsServed: number;
  /**
   * Every decomposition of every observation this grant has served parts of. Keeping the partitions
   * side by side rather than one-record-with-reset is what makes the served set independent of the
   * order pages arrive in (design §12-S4 / §6-4, `observation-read-coverage.ts`).
   */
  readonly served: Map<string, ObservationCoverage>;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Derive the fetch budget from the remaining headroom of the codex stdin ceiling.
 *
 * The ceiling is `CODEX_PROMPT_INPUT_CHAR_LIMIT` itself, imported — NOT a caller-declared number. Taking
 * it as a parameter let a caller pass `3_000_000`, and a grant then charged 1,064,510 chars past the real
 * 1,048,576 limit without refusing (cross-family review). The prompt likewise arrives as its two PARTS and
 * is combined by `codexCombinedPrompt`, the same function `callCodexCli` writes to stdin: a length passed
 * as a number, or a pre-combined string, let a caller measure the user prompt alone and under-count the
 * system prompt plus separator (measured: 140,384 chars granted against a 1,000,007-char dispatch).
 *
 * The char total is what guarantees the ceiling; `OBSERVATION_READ_MAX_CALLS` bounds round trips
 * separately (see there for why it is not derived from the total).
 *
 * Fails loud when the headroom cannot fund a single page. A worker told to use a tool that can never
 * serve is the silent-failure shape design §6 rules out for the catalog, and it applies here too.
 */
export function deriveObservationReadFetchBudget(args: {
  /** The dispatch's two prompt parts. Combined HERE by the codex route's own function, so the measured
   * string is the dispatched string rather than a caller's idea of it. */
  systemPrompt: string;
  userPrompt: string;
  pageCharBudget?: number;
}): ObservationReadFetchBudget {
  const initialPromptChars = codexCombinedPrompt(args.systemPrompt, args.userPrompt).length;
  const pageCharBudget = args.pageCharBudget ?? OBSERVATION_READ_PAGE_CHAR_BUDGET;
  if (!Number.isInteger(pageCharBudget) || pageCharBudget < OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET) {
    throw new ObservationReadError(
      "fetch_budget_unservable",
      `pageCharBudget must be an integer of at least ${OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET}, got ${pageCharBudget}`,
    );
  }
  const totalFetchCharBudget =
    CODEX_PROMPT_INPUT_CHAR_LIMIT - initialPromptChars - OBSERVATION_READ_SESSION_RESERVE_CHARS;
  const perCallWorstCase = pageCharBudget + OBSERVATION_READ_EXCHANGE_FRAMING_CHARS;
  if (totalFetchCharBudget < perCallWorstCase) {
    throw new ObservationReadError(
      "fetch_budget_unservable",
      `the ${CODEX_PROMPT_INPUT_CHAR_LIMIT}-char ceiling leaves ${totalFetchCharBudget} chars after a ` +
        `${initialPromptChars}-char prompt and ${OBSERVATION_READ_SESSION_RESERVE_CHARS} of session ` +
        `reserve; one page needs ${perCallWorstCase}. Reduce the pushed projection before minting a grant.`,
    );
  }
  return Object.freeze({
    page_char_budget: pageCharBudget,
    total_fetch_char_budget: totalFetchCharBudget,
    max_calls: OBSERVATION_READ_MAX_CALLS,
  });
}

/**
 * The runtime's grant table. One instance per host process; the runtime mints a grant per worker launch
 * and revokes it at exit.
 *
 * Deliberately an instance rather than module-level state: a global table would be shared by every
 * concurrent run in the process, and the isolation this class exists to provide (session A cannot read
 * session B) would then rest on token secrecy alone rather than on separable state.
 */
export class ObservationReadGrantRegistry {
  readonly #grants = new Map<string, ObservationReadGrantState>();
  readonly #now: () => number;

  /** `now` is injectable so expiry is deterministic under test rather than wall-clock dependent. */
  constructor(options?: { now?: () => number }) {
    this.#now = options?.now ?? ((): number => Date.now());
  }

  /**
   * Fix a gated snapshot, size the budget, and issue a token for it.
   *
   * The artifacts are read HERE to fix the snapshot and re-read on every `serve` to detect a mid-flight
   * rewrite. Taking paths rather than contents is what makes drift detection mechanical: there is no
   * `serve` path that skips the check and no way to hand the check a stale copy.
   *
   * `systemPrompt`/`userPrompt` are the two parts the dispatch is about to send; they are combined and
   * measured by the codex route's own `codexCombinedPrompt` (see `deriveObservationReadFetchBudget`).
   *
   * `ttlMs` is the caller's — the spawn already knows how long its worker may live (worker timeout plus
   * SIGKILL grace), and a lifetime invented here would either outlive the worker or kill a live one.
   */
  mint(args: {
    sources: ObservationReadGrantSources;
    /** The two prompt parts `callCodexCli` receives — combined here by the route's own function. */
    systemPrompt: string;
    userPrompt: string;
    ttlMs: number;
    pageCharBudget?: number;
  }): { token: string; receipt: ObservationReadReceipt } {
    if (!Number.isInteger(args.ttlMs) || args.ttlMs <= 0) {
      throw new ObservationReadError(
        "fetch_budget_unservable",
        `ttlMs must be a positive integer, got ${args.ttlMs}`,
      );
    }
    const budget = deriveObservationReadFetchBudget({
      systemPrompt: args.systemPrompt,
      userPrompt: args.userPrompt,
      ...(args.pageCharBudget === undefined ? {} : { pageCharBudget: args.pageCharBudget }),
    });
    // COPY the paths. `readonly` is compile-time only and the object arrives by reference, so holding the
    // caller's object let a caller mutate it after mint and redirect every later re-read — cross-family
    // review pointed a live grant at byte-identical copies, then revoked access in the canonical ledger,
    // and the revoked body stayed available because the copies still hashed the same.
    const sources: ObservationReadGrantSources = Object.freeze({
      observationsPath: args.sources.observationsPath,
      safetyLedgerPath: args.sources.safetyLedgerPath,
      safetyLedgerValidationPath: args.sources.safetyLedgerValidationPath,
    });
    assertLedgerBoundToObservations(sources);
    const texts = readGrantSourceTexts(sources);
    const state: ObservationReadGrantState = {
      grant_id: `obsgrant_${randomBytes(8).toString("hex")}`,
      sources,
      snapshot: fixObservationSnapshot(
        texts.observationsText,
        parseSafetyLedger(texts.safetyLedgerText),
      ),
      budget,
      expiresAtMs: this.#now() + args.ttlMs,
      observationsTextSha256: sha256Hex(texts.observationsText),
      safetyLedgerTextSha256: sha256Hex(texts.safetyLedgerText),
      revoked: false,
      expired: false,
      callsServed: 0,
      charsServed: 0,
      served: new Map(),
    };
    // 32 bytes of CSPRNG entropy. The token is the session's whole authority, so it must not be
    // derivable from anything the model can see (a snapshot digest, a session id, a counter) and must
    // never reach a log or an error message — `#resolve` names no token in its failures.
    const token = randomBytes(32).toString("base64url");
    this.#grants.set(token, state);
    return { token, receipt: receiptOf(state) };
  }

  /**
   * Serve one page under a grant.
   *
   * Order is load-bearing: resolve → admission → CHARGE → drift → read. Everything after the charge can
   * fail, and every one of those failures is rendered into the worker's conversation exactly like a
   * result — so an uncharged failure path is an unbounded free loop against the very ceiling this budget
   * protects. That covers a drifted artifact too, which is why the drift check sits after the charge and
   * not before it: the runtime, not the worker, caused the drift, but the error still occupies context,
   * and charging is about bounding the ceiling rather than assigning blame.
   *
   * The three checks BEFORE the charge are the ones with nothing to charge: an unregistered token has no
   * state, and a revoked or expired grant's session is already over.
   */
  /**
   * Charge a `tools/call` that was refused before it could become a request — the malformed MCP
   * `arguments` objects the typed surface above cannot express.
   *
   * It goes through the SAME meters as a served call because it is the same thing to the worker: a
   * round trip whose response text lands in its conversation. Metering it anywhere else made the
   * dispatch limit bypassable — 32 refusals against one counter left `serve`'s counter at zero, so the
   * "terminal" limit was terminal for nothing.
   *
   * Separate from `serve` only so the receipt can still report which attempts never reached the reader.
   * Throws the same exhaustion error, so a dispatch that has spent its round trips gets one answer
   * whether or not the call that spent them was well formed.
   */
  chargeRejectedCall(args: { token: string; messageChars: number }): void {
    const state = this.#resolve(args.token);
    if (state.callsServed >= state.budget.max_calls) {
      throw new ObservationReadError(
        "call_limit_exhausted",
        `this session has served its ${state.budget.max_calls} observation-read calls`,
      );
    }
    // Admission on the EXACT cost, not `serve`'s worst case: a refusal's response is already written,
    // so its size is known and reserving a whole page against it would refuse refusals long before the
    // ceiling. Charging without admitting was the defect — a near-full budget plus one malformed call
    // pushed `chars_served` past the very total it was derived from, breaking this module's one promise.
    //
    // Exactness is also why this path carries no postcondition where `serve` needs one: `serve` admits a
    // worst-case page and then charges the real size, so its total can still surprise it. If this ever
    // becomes a worst-case reservation, it needs `serve`'s postcondition back.
    const cost = OBSERVATION_READ_EXCHANGE_FRAMING_CHARS + args.messageChars;
    if (state.charsServed + cost > state.budget.total_fetch_char_budget) {
      throw new ObservationReadError(
        "fetch_budget_exhausted",
        `this session has ${state.budget.total_fetch_char_budget - state.charsServed} of ` +
          `${state.budget.total_fetch_char_budget} fetch chars left, below the ${cost} this refusal costs`,
      );
    }
    state.callsServed += 1;
    state.charsServed += cost;
  }

  serve(args: { token: string; request: ObservationReadRequest }): ObservationReadPage {
    const state = this.#resolve(args.token);

    if (state.callsServed >= state.budget.max_calls) {
      throw new ObservationReadError(
        "call_limit_exhausted",
        `this session has served its ${state.budget.max_calls} observation-read calls`,
      );
    }
    const perCallWorstCase =
      state.budget.page_char_budget + OBSERVATION_READ_EXCHANGE_FRAMING_CHARS;
    const remaining = state.budget.total_fetch_char_budget - state.charsServed;
    if (remaining < perCallWorstCase) {
      // Admission on the WORST case, never a smaller page: shrinking the page would change the split and
      // invalidate every outstanding cursor (see BUDGET above).
      throw new ObservationReadError(
        "fetch_budget_exhausted",
        `this session has ${remaining} of ${state.budget.total_fetch_char_budget} fetch chars left, ` +
          `below the ${perCallWorstCase} one more page can cost`,
      );
    }

    state.callsServed += 1;
    state.charsServed += OBSERVATION_READ_EXCHANGE_FRAMING_CHARS;
    let page: ObservationReadPage;
    try {
      this.#assertInputsUnchanged(state);
      page = readObservationPage({
        snapshot: state.snapshot,
        request: args.request,
        pageCharBudget: state.budget.page_char_budget,
      });
    } catch (error) {
      // Charge the failure's ACTUAL text, not just the envelope: an error is rendered into the worker's
      // conversation exactly like a result. Bounded by construction — every id is capped at
      // OBSERVATION_READ_MAX_ID_CHARS, so no message approaches a page — which is what makes the
      // reservation above cover this path too.
      state.charsServed += (error as Error).message.length;
      throw error;
    }
    state.charsServed += JSON.stringify(page).length;
    if (state.charsServed > state.budget.total_fetch_char_budget) {
      // The module's core promise, enforced at its own authority: cumulative output never exceeds the
      // ceiling it was derived from. Reaching here means the admission arithmetic above is wrong.
      throw new ObservationReadError(
        "fetch_budget_exhausted",
        `served ${state.charsServed} chars, above the ${state.budget.total_fetch_char_budget} budget`,
      );
    }
    for (const entry of page.entries) {
      // The accumulation rule — which parts of which decomposition count — is declared in
      // `observation-read-coverage.ts`, because delivery reconciliation has to apply the SAME rule to
      // what reached the model and a second declaration is one that can disagree (design §9-F2).
      state.served.set(entry.observation_id, foldObservationRange(
        state.served.get(entry.observation_id),
        entry,
      ));
    }
    return page;
  }

  /** What this grant has served so far. Safe to persist or log — carries `grant_id`, not the token. */
  receipt(token: string): ObservationReadReceipt {
    return receiptOf(this.#resolve(token, { allowRevoked: true, allowExpired: true }));
  }

  /**
   * Reclaim a grant (design §4.1: the runtime revokes at worker exit). The state is kept and MARKED
   * rather than deleted so a later call answers `grant_revoked` instead of `unknown_grant` — a replayed
   * token then reports what actually happened rather than looking like an invented one.
   */
  revoke(token: string): void {
    const state = this.#grants.get(token);
    if (state) state.revoked = true;
  }

  #resolve(
    token: string,
    options?: { allowRevoked?: boolean; allowExpired?: boolean },
  ): ObservationReadGrantState {
    const state = this.#grants.get(token);
    if (!state) {
      // No token in the message, here or anywhere else in this module.
      throw new ObservationReadError("unknown_grant", "no grant is registered for the supplied token");
    }
    if (state.revoked && options?.allowRevoked !== true) {
      throw new ObservationReadError(
        "grant_revoked",
        `grant ${state.grant_id} was revoked; its session is over`,
      );
    }
    // Latch, then read the latch. Expiry must be terminal, and a recomputed comparison is not: a clock
    // that moves backwards would un-expire the grant.
    if (this.#now() >= state.expiresAtMs) state.expired = true;
    if (state.expired && options?.allowExpired !== true) {
      throw new ObservationReadError("grant_expired", `grant ${state.grant_id} has expired`);
    }
    return state;
  }

  /**
   * Fail loud when the artifacts moved under a live grant (design §8) — deliberately NOT a "switch to the
   * newer content" path: an outstanding cursor walks a split of the OLD bodies.
   *
   * Re-reads both artifacts from disk on EVERY call — the paths cannot go stale, which is the property
   * that makes this mechanical rather than a caller obligation.
   *
   * Both texts hashing the same is sufficient for "nothing changed": the snapshot is a pure function of
   * exactly those two strings. Only when a hash moves is the snapshot re-derived and its digest compared,
   * so a byte-level rewrite that leaves the observations equivalent is correctly NOT drift — and the
   * refreshed hashes then let the next call take the cheap path again. This covers the additive direction
   * too (a ledger that newly ADMITS an id is a ledger whose text changed), which a cache keyed on the
   * snapshot's own ids would have missed.
   */
  #assertInputsUnchanged(state: ObservationReadGrantState): void {
    const texts = readGrantSourceTexts(state.sources);
    const observationsTextSha256 = sha256Hex(texts.observationsText);
    const safetyLedgerTextSha256 = sha256Hex(texts.safetyLedgerText);
    if (
      observationsTextSha256 === state.observationsTextSha256 &&
      safetyLedgerTextSha256 === state.safetyLedgerTextSha256
    ) {
      return;
    }
    assertObservationSnapshotDigestUnchanged(
      state.snapshot,
      fixObservationSnapshot(texts.observationsText, parseSafetyLedger(texts.safetyLedgerText)),
    );
    state.observationsTextSha256 = observationsTextSha256;
    state.safetyLedgerTextSha256 = safetyLedgerTextSha256;
  }
}

function receiptOf(state: ObservationReadGrantState): ObservationReadReceipt {
  return Object.freeze({
    grant_id: state.grant_id,
    snapshot_digest: state.snapshot.snapshot_digest,
    admitted_observation_count: state.snapshot.entries.length,
    withheld_observation_count: state.snapshot.withheld_observation_count,
    budget: state.budget,
    calls_served: state.callsServed,
    chars_served: state.charsServed,
    served: Object.freeze(
      [...state.served.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        // One record per observation, and WHICH content version it reports is decided by the same
        // module that owns the fold — a projection that picked differently would reintroduce the order
        // dependence one layer below the accumulator.
        .flatMap(([observationId, coverage]) => {
          const record = observationCoverageRecord(observationId, coverage);
          return record === undefined ? [] : [record];
        }),
    ),
  });
}
