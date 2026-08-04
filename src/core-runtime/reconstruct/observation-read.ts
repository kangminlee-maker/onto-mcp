/**
 * Observation catalog tool — Stage 1 pure artifact reader (design 20260726 §4/§9).
 *
 * The push layer projects a detail-less catalog (observation_id · source_ref · summary — 13 KB over the
 * measured 59-observation corpus); the DETAIL behind a chosen id is 2,611 KB, 99% of it in one field
 * (`structural_data`). This module is the PULL side: it serves an observation's full record by id, in
 * deterministic bounded pages, from a FIXED snapshot.
 *
 * PURE + TOTAL over its inputs. It performs no I/O: `fixObservationSnapshot` takes the artifact TEXT and
 * `readObservationPage` takes the fixed snapshot. Wiring (session binding + cumulative budget, ledger
 * surface, audit) is Stages 2–4; nothing outside tests consumes this module yet.
 *
 * Invariants it upholds (design §3):
 *   OBS-1  mints/mutates NO observation — every served body is the artifact's own record, verbatim.
 *   OBS-2  reads nothing outside the fixed snapshot — ids are resolved against `snapshot.index` only.
 *   OBS-3  pages/cursors are transport projections, never evidence — they carry no id the snapshot lacks.
 *
 * WHY THE SNAPSHOT MUST BE FIXED (measured, not assumed): the observation artifact is overwritten IN
 * PLACE and grows mid-run — `source-admission-selection-stage.ts:454·586·716` rewrite it and `run.ts`
 * reassigns `sourceObservations` at :1591 (admission selection), :2347 (frontier refs) and :3789
 * (maturation closure). So "read the latest" would silently change what a cursor is walking. The reader
 * therefore serves a snapshot fixed once, binds every cursor to its digest, and
 * `assertObservationSnapshotUnchanged` turns a mid-flight rewrite into a loud integrity failure rather
 * than a switch to newer content.
 */
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { assertArrayField } from "../artifact-io.js";
import { observationRangeId } from "./observation-range-id.js";
import type { ReconstructSourceSafetyLedgerArtifact } from "./artifact-types.js";
import { sourceSafetyRowIdForObservationId } from "./source-safety-validation.js";

/**
 * Contract cap on ids per request (design §4.1). The request shape is `{observation_ids[1..16]}` XOR
 * `{cursor}` — deliberately WITHOUT a session id, path, glob, query, detail grade or byte bound, so
 * "this must not become a general file reader" (owner constraint C3) is unrepresentable rather than
 * merely validated.
 */
export const OBSERVATION_READ_MAX_REQUEST_IDS = 16;

/**
 * Longest accepted `observation_ids` element. Real ids are `obs_<16 hex>` (20 chars), so this is generous
 * by any measure — its job is to bound a CALLER-CONTROLLED failure message. Without it, an unresolvable
 * 200,000-char id produced a ~200,000-char `unknown_observation_id` error, and the grant layer's
 * fixed-size charge for a failed call under-counted it by two orders of magnitude while the text still
 * occupied the worker's context (cross-family review reproduced it). Bounding the input is the fix; the
 * accounting cannot be honest about an unbounded string.
 */
export const OBSERVATION_READ_MAX_ID_CHARS = 128;

/**
 * The character set an observation id may use, published in the tool schema and enforced here so the
 * two cannot drift. Minted ids are `obs_` + 16 hex chars; this is deliberately wider than that so a
 * future id scheme does not silently become unrequestable, and narrow enough that one character is one
 * UTF-16 unit is one byte.
 */
export const OBSERVATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Cursor payload version. Bumped when the cursor's fields change OR when the decomposition it is a
 * coordinate INTO changes; an older cursor is then rejected.
 *
 * v2: the range contract (design `23-…md` §3/S1). A cursor binds the snapshot digest and the page
 * BUDGET — not the allowance — so the budget check alone does not notice that the entry framing grew and
 * moved every boundary. A v1 cursor would have passed both existing checks and then resumed into a
 * different split at the same `(o, p)`: measured on the real corpus, the first boundary moves from
 * 62,528 to 62,395, so 133 characters would be served twice and reported as consecutive parts. The
 * version is what refuses it. (Cross-family review; the migration note that said the budget binding
 * already covered this was wrong — it covers a budget CHANGE, which this is not.)
 *
 * v3: the budget's UNIT changed from page chars to rendered result chars (design `23-…md` §3, "S4
 * 재개방"). The same numeric `b` therefore names a different decomposition, and the cost per code point
 * changed with it, so every boundary moves. `b` alone cannot refuse a v2 cursor — it compares equal
 * whenever the two budgets happen to share a number — which is the same hole v2 was minted to close.
 */
const OBSERVATION_CURSOR_VERSION = 3;

/**
 * Upper bound reserved for the part_index / part_count digit width when sizing a part, and the hard cap
 * on a body's part count. A body needing more parts than this cannot be served with a correctly sized
 * reservation, so it fails loud instead of overflowing the page budget by a digit.
 */
const PART_NUMBER_SENTINEL = 9_999_999_999;

/**
 * Smallest page content allowance that can still make progress: one `\uXXXX` escape costs 6 chars, so a
 * part allowance below that could fail to advance past a single code point.
 */
const MIN_PART_ALLOWANCE_CHARS = 6;

/**
 * Closed failure vocabulary for the whole observation-read contract — the reader below AND the
 * session-scoped grant layer above it (`observation-read-grant.ts`). Deliberately ONE union rather than
 * one per module: a worker calling the tool sees a single surface, so it must branch on a single `reason`
 * set. The comments mark which layer raises which.
 */
export type ObservationReadFailureReason =
  // raised by this module (the pure reader)
  | "artifact_malformed"
  | "duplicate_observation_id"
  | "unknown_observation_id"
  | "request_shape"
  | "cursor_malformed"
  | "snapshot_drift"
  | "budget_too_small"
  // raised by the grant layer (session scope + cumulative budget)
  | "unknown_grant"
  | "grant_revoked"
  | "grant_expired"
  | "fetch_budget_exhausted"
  | "call_limit_exhausted"
  | "fetch_budget_unservable";

/** Carries the `reason` above, so callers branch on it instead of on message text. */
export class ObservationReadError extends Error {
  readonly reason: ObservationReadFailureReason;

  constructor(reason: ObservationReadFailureReason, detail: string) {
    super(`observation read [${reason}]: ${detail}`);
    this.name = "ObservationReadError";
    this.reason = reason;
  }
}

export interface ObservationSnapshotEntry {
  readonly observation_id: string;
  /**
   * sha256 (hex) of `body` as UTF-8 — the per-observation content hash of design §7's fingerprint.
   *
   * Named apart from the artifact's own `structural_data.content_sha256` on purpose: that one hashes the
   * SOURCE FILE's bytes and travels verbatim INSIDE `body`, so a page carrying both under one name would
   * hand its consumer two different hashes of two different things spelled identically.
   */
  readonly observation_content_sha256: string;
  /**
   * The observation record serialized as JSON, KEY ORDER AS THE ARTIFACT CARRIES IT. This is the unit the
   * reader delivers and the unit `observation_content_sha256` covers; parts are slices of exactly this
   * string, so concatenating an observation's parts in order reproduces it character-for-character.
   */
  readonly body: string;
}

/**
 * Module-private brand. `ObservationSnapshot` is nominal, not structural: only `sealSnapshot` can produce
 * a value carrying this symbol, so the ONLY way to hold a snapshot is to have gone through
 * `fixObservationSnapshot` and therefore through the consumption gate.
 *
 * Without it the interface was satisfiable by a hand-written object literal — cross-family review passed
 * `{ entries: [], lookup: () => withheldEntry }` to `readObservationPage` and got the withheld body back,
 * with no cast and no constructor. Moving the gate into the constructor is only a constraint if the
 * constructor is the sole source of the type. An explicit `as ObservationSnapshot` cast still defeats this,
 * but a cast is a visible, reviewable act rather than an innocent-looking literal.
 */
declare const OBSERVATION_SNAPSHOT_BRAND: unique symbol;

/**
 * A FIXED, GATED snapshot. "Fixed" is enforced, not promised: entries and the entry array are frozen, and
 * the id lookup is a closure over a private Map rather than an exposed one — so `snapshot_digest` cannot
 * drift from the content it names while a cursor walk is in flight. (Cross-family review found the
 * earlier shape, which exposed mutable entries through a Map, let a caller rewrite a body between pages
 * with `assertObservationSnapshotUnchanged` still reporting clean.)
 */
export interface ObservationSnapshot {
  /** Nominal marker — see `OBSERVATION_SNAPSHOT_BRAND`. Never read; its presence is the point. */
  readonly [OBSERVATION_SNAPSHOT_BRAND]: true;
  readonly session_id: string;
  /**
   * sha256 (hex) over an INJECTIVE encoding of (domain tag, session_id, sorted (observation_id,
   * observation_content_sha256) pairs). Identifies the snapshot's CONTENT: stable across a byte-different
   * rewrite of identical observations, rotated by any added, removed or changed observation. Cursors bind
   * to it.
   */
  readonly snapshot_digest: string;
  /**
   * The ADMITTED entries, canonical order (observation_id ascending, code-unit comparison). Frozen.
   * Observations the consumption gate withheld are absent, so OBS-2 makes them unreachable.
   */
  readonly entries: readonly ObservationSnapshotEntry[];
  /**
   * Observations present in the artifact that the gate withheld. Non-zero is the evidence the gate did
   * work; the grant layer surfaces it in the audit receipt.
   */
  readonly withheld_observation_count: number;
  /** Resolve an id against the snapshot. The only way in — there is no exposed index to rewrite. */
  readonly lookup: (observationId: string) => ObservationSnapshotEntry | undefined;
}

export interface ObservationReadRequest {
  /** 1..OBSERVATION_READ_MAX_REQUEST_IDS ids. Mutually exclusive with `cursor`. */
  observation_ids?: readonly string[];
  /** Opaque continuation from a previous page's `next_cursor`. Mutually exclusive with `observation_ids`. */
  cursor?: string;
}

export interface ObservationReadPageEntry {
  observation_id: string;
  observation_content_sha256: string;
  /** 1-based position of this part within the observation's body. */
  part_index: number;
  /** Total parts the observation's body splits into at this budget. `1` when it fits whole. */
  part_count: number;
  /**
   * The per-part character allowance this page was built under — the DECOMPOSITION'S IDENTITY.
   *
   * The split is a pure function of (body, allowance), and the allowance is derived from the request's
   * id list, so the same observation splits differently in different requests. `part_count` alone does
   * not identify a partition: two requests can produce the same count with different boundaries, and
   * merging their indexes assembled "complete" coverage with a gap in the middle (measured). A consumer
   * accumulating parts across calls must merge only within one allowance.
   */
  part_allowance: number;
  /**
   * Start of this part within the observation's body, as a character offset — the RANGE this entry is.
   *
   * Stated by the runtime rather than derived downstream, because it CANNOT be derived: the split cuts
   * on JSON escape cost, not character count (`codePointJsonCost` charges 1, 2 or 6), and the allowance
   * itself depends on the request's id list. A consumer computing `part_index * part_allowance` would be
   * wrong by a content-dependent amount on every observation that escapes anything.
   */
  body_start: number;
  /** End of this part, exclusive. `body.slice(body_start, body_end)` is this entry's `body`, exactly. */
  body_end: number;
  /**
   * sha256 (hex) of `body.slice(body_start, body_end)` as UTF-8 — the hash OF THE RANGE, not of the
   * observation. Makes a citation to this range self-verifying: a consumer holding the observation can
   * re-slice and check, so a range that names content the runtime never served cannot be constructed.
   */
  range_content_sha256: string;
  /**
   * The NAME a citation uses for this range — opaque by construction, derived from the tuple above.
   *
   * The offsets beside it are the runtime's own accounting (reconciliation reads them and must never
   * re-split). The citation surface accepts only this, which is what makes "cite a range I did not
   * read" unrepresentable rather than merely forbidden: an id naming a range this launch never emitted
   * resolves to nothing. `observation-range-id.ts` owns both the mint and the resolution.
   */
  range_id: string;
  /** Slice of the observation body. Concatenate parts 1..part_count to recover it exactly. */
  body: string;
}

export interface ObservationReadPage {
  snapshot_digest: string;
  entries: ObservationReadPageEntry[];
  /** Absent when the request is fully served; otherwise pass it back verbatim as `{cursor}`. */
  next_cursor?: string;
}

interface ObservationCursorPayload {
  v: number;
  /** snapshot_digest this cursor is bound to. */
  d: string;
  /** page char budget the split was computed at. */
  b: number;
  ids: string[];
  /** index into `ids` of the next observation to serve. */
  o: number;
  /** 0-based index of the next part within that observation. */
  p: number;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Longest an ARTIFACT- OR CALLER-DERIVED value may be when it appears in a failure message.
 *
 * Failure messages are charged against the grant's cumulative budget, so an unbounded interpolation is an
 * unbounded charge. Cross-family review put a 200,000-char `session_id` in a ledger and the resulting
 * mismatch message charged 201,116 chars against a 66,560 total — a 134,556 overrun from one legal call.
 * Every interpolation of a value this module did not itself compute goes through `elide`.
 */
const MESSAGE_VALUE_MAX_CHARS = 96;

/** Exported for the grant layer, whose messages interpolate artifact values under the same bound. */
export function elideMessageValue(value: string): string {
  return elide(value);
}

function elide(value: string): string {
  return value.length <= MESSAGE_VALUE_MAX_CHARS
    ? value
    : `${value.slice(0, MESSAGE_VALUE_MAX_CHARS)}…(${value.length} chars)`;
}

/**
 * Rejects the values a YAML parse can produce that JSON cannot represent faithfully — a non-finite
 * number would serialize to `null` and a bigint would throw deep inside `JSON.stringify`. Used as a
 * replacer so the check rides along on the serialization pass already being made (no extra walk), which
 * is what lets "reassembled parts equal the body" also mean "the served record equals the artifact's".
 */
function rejectNonJsonRepresentable(_key: string, value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new ObservationReadError(
      "artifact_malformed",
      "observation carries a non-finite number, which has no faithful JSON projection",
    );
  }
  if (Object.is(value, -0)) {
    // YAML round-trips `-0`; JSON.stringify flattens it to `0`. Left accepted, the served body and the
    // content hash would both silently disagree with the artifact, and flipping `-0` to `0` on disk
    // would not rotate the digest. (Cross-family review.)
    throw new ObservationReadError(
      "artifact_malformed",
      "observation carries negative zero, which JSON serialization flattens to 0",
    );
  }
  if (typeof value === "bigint") {
    throw new ObservationReadError(
      "artifact_malformed",
      "observation carries a bigint, which has no faithful JSON projection",
    );
  }
  return value;
}

/**
 * The canonical body of one observation record — the string the reader serves, hashes and slices.
 *
 * Exported because RANGE OFFSETS ARE MEASURED AGAINST IT. A consumer re-deriving the body with its own
 * `JSON.stringify` call would agree today and drift the moment the replacer changes, and a drifted body
 * makes every offset name different characters while still looking well-formed. One authority, imported.
 */
export function canonicalObservationBody(observation: unknown): string {
  return JSON.stringify(observation, rejectNonJsonRepresentable);
}

/**
 * Fix a snapshot from the artifact text: parse, project each observation to its canonical body, hash it,
 * APPLY THE CONSUMPTION GATE, and derive the content digest over what survives. Fails loud on a malformed
 * artifact, a blank/absent observation_id, a duplicate id (a duplicate would make `{observation_ids}`
 * ambiguous — the reader must never guess), or a ledger belonging to a different session.
 *
 * The ledger is a REQUIRED parameter, not an option (design §3.1). This is the only constructor of an
 * `ObservationSnapshot` and `readObservationPage` reads nothing else, so **there is no ungated snapshot
 * type and no reader entry point that skips the gate** — the bypass is unrepresentable rather than
 * forbidden. Cross-family review found the earlier shape, where an ungated `fixObservationSnapshot(text)`
 * was exported alongside the reader, and demonstrated that a future façade could pair the two and serve a
 * withheld observation while satisfying every type.
 *
 * Deterministic: the same text and ledger always yield the same bodies, hashes and digest.
 */
export function fixObservationSnapshot(
  artifactText: string,
  sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact,
): ObservationSnapshot {
  let document: unknown;
  try {
    document = parseYaml(artifactText) as unknown;
  } catch (error) {
    throw new ObservationReadError(
      "artifact_malformed",
      `source-observations is not parseable YAML: ${elide((error as Error).message)}`,
    );
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new ObservationReadError("artifact_malformed", "source-observations is not a mapping");
  }
  const record = document as Record<string, unknown>;
  const sessionId = record.session_id;
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new ObservationReadError("artifact_malformed", "source-observations has no session_id");
  }
  if (sourceSafetyLedger.session_id !== sessionId) {
    // The ledger validator classifies this as `session_id_mismatch` and `run.ts` asserts the validation
    // before use — but a snapshot constructor that merely ASSUMES validation ran is a gate keyed to the
    // wrong session's decisions. Cross-family review built exactly that: session A's observations with a
    // type-correct session B ledger whose rows share the id format, and the withheld observation served.
    throw new ObservationReadError(
      "artifact_malformed",
      `source-safety ledger belongs to session ${elide(sourceSafetyLedger.session_id)}, not ${elide(sessionId)}`,
    );
  }
  try {
    // Reuse the shared artifact shape guard (a torn write leaves a parseable file whose required array
    // is missing or scalar), but re-surface it in this module's failure vocabulary so a caller branches
    // on one `reason` set rather than two error kinds.
    assertArrayField(record.observations, "source-observations", "observations");
  } catch (error) {
    throw new ObservationReadError("artifact_malformed", (error as Error).message);
  }

  const entries: ObservationSnapshotEntry[] = [];
  const seenIds = new Set<string>();
  for (const raw of record.observations as unknown[]) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ObservationReadError("artifact_malformed", "observation entry is not a mapping");
    }
    const observationId = (raw as Record<string, unknown>).observation_id;
    if (typeof observationId !== "string" || !observationId.trim()) {
      throw new ObservationReadError(
        "artifact_malformed",
        "observation entry has no observation_id",
      );
    }
    if (seenIds.has(observationId)) {
      throw new ObservationReadError(
        "duplicate_observation_id",
        `${elide(observationId)} appears more than once; an id must resolve to exactly one observation`,
      );
    }
    const body = canonicalObservationBody(raw);
    // Frozen at construction: a snapshot that can be edited in place is not fixed, and a mid-walk edit
    // would leave `snapshot_digest` naming content the reader is no longer serving.
    entries.push(
      Object.freeze({
        observation_id: observationId,
        observation_content_sha256: sha256Hex(body),
        body,
      }),
    );
    seenIds.add(observationId);
  }

  const admitted = promptContextAdmittedObservationIds({
    observationIds: entries.map((entry) => entry.observation_id),
    ledger: sourceSafetyLedger,
  });
  return sealSnapshot(
    sessionId,
    entries.filter((entry) => admitted.has(entry.observation_id)),
    entries.length - admitted.size,
  );
}

/**
 * Which of `observationIds` the source-safety ledger admits for `prompt_context` consumption — the gate
 * `fixObservationSnapshot` applies (design §3.1).
 *
 * Mirrors `sourceObservationsForPrompt` exactly — the row is looked up BY THE CANDIDATE'S ID, admitted
 * only on `visibility_tier: "consumption_allowed"`, and a missing row withholds (fail-closed). Candidates
 * are passed in rather than derived from the ledger's rows so the result is a set of OBSERVATION ids: a
 * row id is a different identifier, and returning one where the other is expected is how a gate quietly
 * admits nothing (or everything). The key format itself has one authority,
 * `sourceSafetyRowIdForObservationId`.
 *
 * Duplicate row ids resolve LAST-WINS, matching the push gate's `new Map(rows.map(...))`. The ledger
 * validator rejects duplicates (`duplicate_id`) and `run.ts` asserts the validation before use, so this
 * cannot arise on the live path — but a first-wins or any-wins rule here would make the two gates
 * silently disagree on a [allowed, denied] pair, and "mirrors exactly" is the claim this function makes.
 */
export function promptContextAdmittedObservationIds(args: {
  observationIds: readonly string[];
  ledger: ReconstructSourceSafetyLedgerArtifact;
}): ReadonlySet<string> {
  const tierByRowId = new Map(
    args.ledger.safety_rows.map((row) => [row.safety_row_id, row.visibility_tier] as const),
  );
  return new Set(
    args.observationIds.filter(
      (observationId) =>
        tierByRowId.get(sourceSafetyRowIdForObservationId(observationId, "prompt_context")) ===
          "consumption_allowed",
    ),
  );
}

/**
 * Seal entries into a fixed snapshot: canonical order, frozen entries, closure lookup, content digest.
 * The ONE construction path — `fixObservationSnapshot` and `restrictObservationSnapshot` both go through
 * it, so a restricted snapshot cannot end up with a digest derived by a second, drifting rule.
 *
 * The digest preimage is an INJECTIVE encoding: JSON of a structured tuple, not a delimiter-joined
 * string. A separator-joined encoding is ambiguous — a session_id (or observation_id) carrying the
 * separator plus a hash-shaped tail can reproduce another snapshot's preimage exactly, making a removed
 * observation invisible and that snapshot's cursors acceptable here. (Cross-family review reproduced it.)
 */
function sealSnapshot(
  sessionId: string,
  entries: readonly ObservationSnapshotEntry[],
  withheldCount: number,
): ObservationSnapshot {
  const ordered = [...entries].sort((a, b) =>
    a.observation_id < b.observation_id ? -1 : a.observation_id > b.observation_id ? 1 : 0,
  );
  const index = new Map(ordered.map((entry) => [entry.observation_id, entry] as const));
  const digestPreimage = JSON.stringify([
    "onto-observation-snapshot/1",
    sessionId,
    ordered.map((entry) => [entry.observation_id, entry.observation_content_sha256]),
  ]);
  // The brand is a PHANTOM property: it exists only in the type system, so there is nothing to attach at
  // runtime and this cast is the one place that mints the nominal type. Keeping the cast here — and nowhere
  // else — is what makes "only this function produces a snapshot" checkable by grep.
  return Object.freeze({
    session_id: sessionId,
    snapshot_digest: sha256Hex(digestPreimage),
    entries: Object.freeze(ordered) as readonly ObservationSnapshotEntry[],
    withheld_observation_count: withheldCount,
    lookup: (observationId: string): ObservationSnapshotEntry | undefined =>
      index.get(observationId),
  }) as unknown as ObservationSnapshot;
}

/**
 * Re-derive the snapshot from `artifactText` and fail loud when its content digest moved — the artifact
 * was rewritten under a live snapshot (design §8). Deliberately NOT a "switch to the newer content"
 * path: a cursor mid-walk refers to a split of the OLD bodies.
 */
export function assertObservationSnapshotUnchanged(
  snapshot: ObservationSnapshot,
  artifactText: string,
  sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact,
): void {
  assertObservationSnapshotDigestUnchanged(
    snapshot,
    fixObservationSnapshot(artifactText, sourceSafetyLedger),
  );
}

/**
 * The drift rule itself, over two snapshots rather than a snapshot and a text. Exists so the grant layer
 * — whose live snapshot is a GATED projection, not `fixObservationSnapshot(text)` — enforces drift by the
 * same single rule instead of restating it. A second copy of "compare digests, else throw snapshot_drift"
 * is exactly how the two paths would come to disagree about what drift means.
 */
export function assertObservationSnapshotDigestUnchanged(
  expected: ObservationSnapshot,
  current: ObservationSnapshot,
): void {
  if (current.snapshot_digest !== expected.snapshot_digest) {
    throw new ObservationReadError(
      "snapshot_drift",
      `source-observations changed under the fixed snapshot (${expected.snapshot_digest} → ${current.snapshot_digest})`,
    );
  }
}

/**
 * Chars `JSON.stringify` spends on one code point inside a string literal (quotes excluded). Mirrors the
 * well-formed-stringify rules: `"` and `\` and the five short control escapes cost 2, other C0 controls
 * and LONE surrogates cost 6 (`\uXXXX`), an astral code point is emitted raw as its 2 UTF-16 units.
 * `jsonStringContentCost` is exact — `JSON.stringify(s).length === 2 + jsonStringContentCost(s)` — which
 * is what makes the page-size arithmetic below exact rather than an estimate.
 */
function codePointJsonCost(codePoint: number): number {
  if (codePoint === 0x22 || codePoint === 0x5c) return 2;
  if (
    codePoint === 0x08 ||
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0c ||
    codePoint === 0x0d
  ) {
    return 2;
  }
  if (codePoint < 0x20) return 6;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return 6;
  return codePoint > 0xffff ? 2 : 1;
}

export function jsonStringContentCost(text: string): number {
  let cost = 0;
  for (let i = 0; i < text.length; ) {
    const codePoint = text.codePointAt(i) as number;
    cost += codePointJsonCost(codePoint);
    i += codePoint > 0xffff ? 2 : 1;
  }
  return cost;
}

/**
 * What a serialized fragment of the page costs in the RENDERED TOOL RESULT — the quantity the transport
 * actually clips, and therefore the one every reservation below is denominated in.
 *
 * The result carries the page TWICE: escaped inside `content[0].text` and plain as `structuredContent`
 * (see {@link observationReadToolResult}). The worker's runtime renders the whole result object into its
 * transcript, so a fragment pays its re-escaped length PLUS its own. Because that is additive over the
 * concatenation the serializer produces, per-fragment accounting stays exact rather than a ratio.
 *
 * This is the correction of 2026-07-31 (design `23-…md` §0-1). Sizing the PAGE was measuring the wrong
 * thing: at a 32,000-char page budget every page rendered to 66,892-70,538 chars and was clipped at
 * 40,149 — including one of 29,236 chars, comfortably under its own budget.
 */
function envelopeCostOfSerialized(serialized: string): number {
  return jsonStringContentCost(serialized) + serialized.length;
}

/**
 * Chars one body code point costs in the rendered result — that is, the cost of ITS REPRESENTATION
 * inside the serialized page, counted once escaped and once plain.
 *
 * Derived from {@link codePointJsonCost}'s cases, not from a ratio: `"` serializes to `\"` (2 chars),
 * which re-escapes to `\\\"` (4), so it costs 6; `\n` serializes to `\n` (2), re-escaping to `\\n` (3),
 * so 5; a `\uXXXX` escape is 6 chars re-escaping to 7, so 13; a plain char is 1 and 1, so 2. The
 * per-entry parity check in `readObservationPage` is what keeps these numbers honest against the real
 * serializer.
 */
function codePointEnvelopeCost(codePoint: number): number {
  if (codePoint === 0x22 || codePoint === 0x5c) return 6;
  if (
    codePoint === 0x08 ||
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0c ||
    codePoint === 0x0d
  ) {
    return 5;
  }
  if (codePoint < 0x20) return 13;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return 13;
  return codePoint > 0xffff ? 4 : 2;
}

export function envelopeContentCost(text: string): number {
  let cost = 0;
  for (let i = 0; i < text.length; ) {
    const codePoint = text.codePointAt(i) as number;
    cost += codePointEnvelopeCost(codePoint);
    i += codePoint > 0xffff ? 2 : 1;
  }
  return cost;
}

/**
 * Split a body into parts whose RENDERED cost is ≤ `allowance`, cutting only on code-point boundaries
 * so a surrogate pair is never torn in half (a torn pair would turn 2 emitted chars into two 6-char
 * escapes and break the exactness above). Order-preserving and loss-free by construction: the parts are
 * consecutive `slice`s of the input, so concatenating them returns the input character-for-character.
 *
 * The split is a function of (body, allowance) ALONE — never of how far a page happened to be filled —
 * so `part_count` is stable and a resumed cursor walks the identical decomposition.
 */
function splitBodyByRenderedCost(body: string, allowance: number): string[] {
  const parts: string[] = [];
  let start = 0;
  let cost = 0;
  for (let i = 0; i < body.length; ) {
    const codePoint = body.codePointAt(i) as number;
    const units = codePoint > 0xffff ? 2 : 1;
    const charCost = codePointEnvelopeCost(codePoint);
    if (cost > 0 && cost + charCost > allowance) {
      parts.push(body.slice(start, i));
      start = i;
      cost = 0;
    }
    cost += charCost;
    i += units;
  }
  parts.push(body.slice(start));
  return parts;
}

/**
 * The MCP `tools/call` result the facade returns for a served page — declared HERE, beside the cost
 * model that must size it, because the two are one contract. A copy of the page added there and not
 * here would change what the transport carries while every reservation kept counting the old shape,
 * which is exactly the defect this function exists to make unrepresentable.
 */
export function observationReadToolResult(page: ObservationReadPage): {
  /** A 1-TUPLE, not an array: the emission recorded for reconciliation is `content[0].text`, and a
   * plain array type would make that access nullable and invite a `!` at the one place the bytes are
   * bound to the transcript search. */
  content: [{ type: "text"; text: string }];
  structuredContent: ObservationReadPage;
  isError: false;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(page) }],
    structuredContent: page,
    isError: false,
  };
}

/**
 * Chars the result costs around the serialized page itself. Constant by construction — the serializer
 * emits a fixed prefix, the escaped page, a fixed middle, the plain page, and a fixed suffix — and
 * DERIVED from {@link observationReadToolResult} rather than counted by hand.
 */
const RESULT_FRAMING_CHARS = (() => {
  const page: ObservationReadPage = { snapshot_digest: "", entries: [] };
  return (
    JSON.stringify(observationReadToolResult(page)).length -
    envelopeCostOfSerialized(JSON.stringify(page))
  );
})();

/** The page's own framing string around its entries, for a given digest and (optional) cursor. */
function pageFraming(snapshotDigest: string, cursor: string | undefined): string {
  return JSON.stringify(
    cursor === undefined
      ? { snapshot_digest: snapshotDigest, entries: [] }
      : { snapshot_digest: snapshotDigest, entries: [], next_cursor: cursor },
  );
}

/**
 * The page entry's shape, declared ONCE — used both to reserve room for an entry and to emit it.
 *
 * Two callers, one literal, on purpose. The reservation passes sentinels where the real values are not
 * known yet; the emission passes the real ones. Because both go through THIS function, a field present
 * in the emitted entry but absent from the framing is unrepresentable rather than merely checked —
 * which is the point. (Cross-family review found the earlier arrangement, where the reservation carried
 * its own object literal: forgetting a field there was caught only when the resulting page happened to
 * overflow its budget, and the smallest observations in the measured corpus never do. The guard was
 * input-dependent, so the fix is to remove the second literal rather than to test harder.)
 */
function pageEntryOf(args: {
  observationId: string;
  contentSha256: string;
  partIndex: number;
  partCount: number;
  partAllowance: number;
  bodyStart: number;
  bodyEnd: number;
  rangeContentSha256: string;
  rangeId: string;
  body: string;
}): ObservationReadPageEntry {
  return {
    observation_id: args.observationId,
    observation_content_sha256: args.contentSha256,
    part_index: args.partIndex,
    part_count: args.partCount,
    part_allowance: args.partAllowance,
    body_start: args.bodyStart,
    body_end: args.bodyEnd,
    range_content_sha256: args.rangeContentSha256,
    range_id: args.rangeId,
    body: args.body,
  };
}

/**
 * One entry's serialized framing, excluding its body content (the `""` quotes are included). Returns
 * the STRING rather than a length because the two quantities derived from it — page chars and rendered
 * cost — must come from the same bytes; a length alone cannot say what re-escaping will cost.
 */
function entryFraming(
  observationId: string,
  contentSha256: string,
  partIndex: number,
  partCount: number,
  partAllowance: number,
  bodyStart: number,
  bodyEnd: number,
  rangeContentSha256: string,
  rangeId: string,
): string {
  return JSON.stringify(
    pageEntryOf({
      observationId,
      contentSha256,
      partIndex,
      partCount,
      partAllowance,
      bodyStart,
      bodyEnd,
      rangeContentSha256,
      rangeId,
      body: "",
    }),
  );
}

/** A hash-shaped placeholder for reserving a range hash before the slice that produces it is known. */
const SHA256_HEX_PLACEHOLDER = "0".repeat(64);

/** An id-shaped placeholder. Every minted id has the same length, so the reservation cannot vary. */
const RANGE_ID_PLACEHOLDER = observationRangeId({
  observation_id: "",
  observation_content_sha256: "",
  body_start: 0,
  body_end: 0,
  range_content_sha256: "",
});

function encodeCursor(payload: ObservationCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): ObservationCursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new ObservationReadError("cursor_malformed", "cursor is not a decodable continuation token");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ObservationReadError("cursor_malformed", "cursor payload is not a mapping");
  }
  const payload = parsed as Record<string, unknown>;
  const ids = payload.ids;
  if (
    payload.v !== OBSERVATION_CURSOR_VERSION ||
    typeof payload.d !== "string" ||
    !Number.isInteger(payload.b) ||
    !Array.isArray(ids) ||
    !ids.every((id) => typeof id === "string") ||
    !Number.isInteger(payload.o) ||
    !Number.isInteger(payload.p) ||
    (payload.o as number) < 0 ||
    (payload.p as number) < 0
  ) {
    throw new ObservationReadError("cursor_malformed", "cursor payload has an unexpected shape");
  }
  return {
    v: payload.v as number,
    d: payload.d,
    b: payload.b as number,
    ids: ids as string[],
    o: payload.o as number,
    p: payload.p as number,
  };
}

function assertRequestedIds(ids: readonly string[]): void {
  if (ids.length === 0) {
    throw new ObservationReadError("request_shape", "observation_ids must not be empty");
  }
  if (ids.length > OBSERVATION_READ_MAX_REQUEST_IDS) {
    throw new ObservationReadError(
      "request_shape",
      `observation_ids holds ${ids.length} ids, above the ${OBSERVATION_READ_MAX_REQUEST_IDS} cap`,
    );
  }
  const seen = new Set<string>();
  for (const id of ids) {
    // Length FIRST and in UTF-16 units, which is safe because the charset check below admits only
    // single-unit characters — so for any id that can pass, this count equals the code-point count the
    // published schema's `maxLength` uses. Measuring code points here instead would have meant spreading
    // an arbitrarily long attacker-chosen string into an array before rejecting it.
    if (id.length > OBSERVATION_READ_MAX_ID_CHARS) {
      // The id is NOT echoed — echoing it is the very thing this bound exists to prevent.
      throw new ObservationReadError(
        "request_shape",
        `observation_ids carries a ${id.length}-char id, above the ${OBSERVATION_READ_MAX_ID_CHARS} cap`,
      );
    }
    // The ids this runtime mints are `obs_` plus 16 hex characters (`materialize-preparation.ts:99`),
    // so the accepted charset is published rather than merely assumed. Declaring it removes two problems
    // at once: the schema's code-point `maxLength` and this UTF-16 count can no longer disagree, and the
    // grant's minimum page budget — measured against ASCII ids — cannot be broken by a shape-legal
    // request full of four-byte characters.
    if (!OBSERVATION_ID_PATTERN.test(id)) {
      throw new ObservationReadError(
        "request_shape",
        "observation_ids carries an id outside the published character set",
      );
    }
    if (seen.has(id)) {
      throw new ObservationReadError("request_shape", `observation_ids repeats ${elide(id)}`);
    }
    seen.add(id);
  }
}

/**
 * Serve one page of the requested observations from the fixed snapshot.
 *
 * `resultCharBudget` bounds the RENDERED TOOL RESULT (`JSON.stringify(observationReadToolResult(page))`)
 * — what the worker's transcript actually has to hold, which is the thing the transport clips. It is
 * NOT the page's own size: the result carries the page twice (escaped in `content`, plain in
 * `structuredContent`), so a page runs roughly half its rendered cost and sizing the page instead let
 * every page at a 32,000 budget render to 66,892-70,538 chars and be cut at 40,149 — one of them at
 * 29,236 page chars, comfortably inside the budget it was checked against (design `23-…md` §0-1,
 * measured 2026-07-31).
 *
 * Stage 1 takes the budget as an argument on purpose: design §4.2 derives it from the remaining headroom
 * of the existing `CODEX_PROMPT_INPUT_CHAR_LIMIT` rather than minting a new ceiling, and that cumulative
 * accounting is Stage 2's.
 *
 * Entries are emitted in the caller's id order, whole observations first-fit and oversized ones split
 * across consecutive pages. An observation LARGER THAN A PAGE is the normal case, not an edge: the
 * measured corpus holds a 780,114-char observation whose `content_excerpt` scalar alone is 222,483.
 *
 * Each call re-derives the split for the whole request rather than caching it — the price of a cursor
 * that carries its own position instead of a server-side handle, and of the reader staying pure. Cost is
 * O(requested body chars) per page, bounded by the 16-id cap; walking the full measured corpus (59
 * observations, 2.7 M chars, 65 KiB pages) is ~2 s of the test suite. Revisit only if a larger request
 * cap or a much smaller page budget makes the re-derivation dominate.
 *
 * Two boundaries this function does NOT defend, both deliberate:
 *
 * - The page envelope reserves room for a continuation cursor UNCONDITIONALLY, including on a page that
 *   turns out to be terminal. That costs a few hundred chars of headroom and means budgets below roughly
 *   500 chars are refused with `budget_too_small` even when the whole body would have fit. Sizing the
 *   terminal page without the reservation would buy back that band at the cost of the property the whole
 *   design rests on: the split would stop being a function of `(body, partAllowance)` alone and
 *   `part_count` would depend on whether a page happened to be last. The band is far below any budget
 *   Stage 2 can derive from a ~1 MiB ceiling, and the error names the exact framing costs.
 * - A cursor is a client-held COORDINATE, not an authorization. A hand-built one can skip parts or name a
 *   different id set — but it can only ever NARROW what the client receives: every id still resolves
 *   against this snapshot, the 16-id cap still applies, and no cursor reaches content the same client
 *   could not request directly. Making a forged cursor unrepresentable needs a MAC or a server-side
 *   handle; design §10 records that alternative and adopts digest binding instead.
 */
export function readObservationPage(args: {
  snapshot: ObservationSnapshot;
  request: ObservationReadRequest;
  resultCharBudget: number;
}): ObservationReadPage {
  const { snapshot, request, resultCharBudget } = args;
  if (!Number.isInteger(resultCharBudget) || resultCharBudget <= 0) {
    throw new ObservationReadError(
      "budget_too_small",
      `resultCharBudget must be a positive integer, got ${resultCharBudget}`,
    );
  }

  const hasIds = request.observation_ids !== undefined;
  const hasCursor = request.cursor !== undefined;
  if (hasIds === hasCursor) {
    throw new ObservationReadError(
      "request_shape",
      "exactly one of observation_ids or cursor must be supplied",
    );
  }

  let ids: readonly string[];
  let startObservation = 0;
  let startPart = 0;
  if (hasIds) {
    ids = request.observation_ids as readonly string[];
    assertRequestedIds(ids);
  } else {
    const cursor = decodeCursor(request.cursor as string);
    if (cursor.d !== snapshot.snapshot_digest) {
      throw new ObservationReadError(
        "snapshot_drift",
        "cursor was issued against a different snapshot; re-request the ids against the current one",
      );
    }
    if (cursor.b !== resultCharBudget) {
      throw new ObservationReadError(
        "cursor_malformed",
        `cursor was issued at a page budget of ${cursor.b}, not ${resultCharBudget}`,
      );
    }
    ids = cursor.ids;
    assertRequestedIds(ids);
    startObservation = cursor.o;
    startPart = cursor.p;
  }

  const requested = ids.map((id) => {
    const entry = snapshot.lookup(id);
    if (!entry) {
      // OBS-2: an id outside the snapshot is refused identically whether it never existed or belongs to
      // another session — the reader never discloses that a different snapshot holds it.
      throw new ObservationReadError("unknown_observation_id", `${elide(id)} is not in the fixed snapshot`);
    }
    return entry;
  });

  // Reserve the page envelope at its WORST case — a continuation cursor at the largest position this
  // request can reach — so the reservation is a constant of (ids, digest, budget) and every page is
  // sized against the same allowance, whether or not it ends up carrying a cursor.
  const maxCursorChars = encodeCursor({
    v: OBSERVATION_CURSOR_VERSION,
    d: snapshot.snapshot_digest,
    b: resultCharBudget,
    ids: [...ids],
    o: ids.length,
    p: PART_NUMBER_SENTINEL,
  }).length;
  // Everything below is denominated in RENDERED cost, not page chars: the budget bounds the result the
  // worker's transcript has to hold, and the page is only one of the two copies inside it.
  const framingCost = envelopeCostOfSerialized(
    pageFraming(snapshot.snapshot_digest, "x".repeat(maxCursorChars)),
  );
  const maxEntryFramingCost = requested.reduce(
    (max, entry) =>
      Math.max(
        max,
        envelopeCostOfSerialized(entryFraming(
          entry.observation_id,
          entry.observation_content_sha256,
          PART_NUMBER_SENTINEL,
          PART_NUMBER_SENTINEL,
          PART_NUMBER_SENTINEL,
          // Offsets are bounded by the body length, so the part-number sentinel is a safe over-reserve
          // for them too — the same constant rather than a second one to keep in step.
          PART_NUMBER_SENTINEL,
          PART_NUMBER_SENTINEL,
          SHA256_HEX_PLACEHOLDER,
          RANGE_ID_PLACEHOLDER,
        )),
      ),
    0,
  );
  const partAllowance =
    resultCharBudget - RESULT_FRAMING_CHARS - framingCost - maxEntryFramingCost;
  if (partAllowance < MIN_PART_ALLOWANCE_CHARS) {
    throw new ObservationReadError(
      "budget_too_small",
      `resultCharBudget ${resultCharBudget} leaves ${partAllowance} chars of rendered room for content after ${RESULT_FRAMING_CHARS} of result framing, ${framingCost} of page framing and ${maxEntryFramingCost} of entry framing; at least ${MIN_PART_ALLOWANCE_CHARS} are needed`,
    );
  }

  // Flatten (observation, part) into ONE ordered work list. The split is already a pure function of
  // (body, partAllowance), so this list is the same on every call for a given request — which is what a
  // resumed cursor's (observation index, part index) coordinate refers to.
  const pending: Array<{
    observationIndex: number;
    entry: ObservationSnapshotEntry;
    partIndex: number;
    partCount: number;
    bodyStart: number;
    bodyEnd: number;
    rangeContentSha256: string;
    rangeId: string;
    body: string;
  }> = [];
  const firstPartOfObservation: number[] = [];
  requested.forEach((entry, observationIndex) => {
    const parts = splitBodyByRenderedCost(entry.body, partAllowance);
    if (parts.length > PART_NUMBER_SENTINEL) {
      throw new ObservationReadError(
        "budget_too_small",
        `${entry.observation_id} splits into ${parts.length} parts at this budget, above the ${PART_NUMBER_SENTINEL} cap`,
      );
    }
    firstPartOfObservation.push(pending.length);
    // The offsets come from the split itself — the parts ARE consecutive slices, so accumulating their
    // lengths is the only derivation that cannot disagree with what is served. Hashing each range costs
    // one more pass over the same characters the split already walked; the reader re-derives the whole
    // request's split on every call anyway (see this function's header), so the order is unchanged.
    let bodyStart = 0;
    parts.forEach((body, partIndex) => {
      const bodyEnd = bodyStart + body.length;
      const rangeContentSha256 = sha256Hex(body);
      pending.push({
        observationIndex,
        entry,
        partIndex,
        partCount: parts.length,
        bodyStart,
        bodyEnd,
        rangeContentSha256,
        rangeId: observationRangeId({
          observation_id: entry.observation_id,
          observation_content_sha256: entry.observation_content_sha256,
          body_start: bodyStart,
          body_end: bodyEnd,
          range_content_sha256: rangeContentSha256,
        }),
        body,
      });
      bodyStart = bodyEnd;
    });
  });

  // A cursor is only ever issued at a part that still has to be served, so a position at or past the end
  // is a forged/stale token rather than a legitimate "already done" — refuse it instead of returning a
  // silently empty page.
  const startOfObservation = firstPartOfObservation[startObservation];
  if (startOfObservation === undefined) {
    throw new ObservationReadError("cursor_malformed", "cursor points past the end of its own request");
  }
  const startFlat = startOfObservation + startPart;
  const startDescriptor = pending[startFlat];
  if (startDescriptor === undefined || startDescriptor.observationIndex !== startObservation) {
    throw new ObservationReadError("cursor_malformed", "cursor points past the end of its own request");
  }

  const entries: ObservationReadPageEntry[] = [];
  let used = RESULT_FRAMING_CHARS + framingCost;
  let flat = startFlat;
  for (; flat < pending.length; flat += 1) {
    const part = pending[flat] as (typeof pending)[number];
    const framing = entryFraming(
      part.entry.observation_id,
      part.entry.observation_content_sha256,
      part.partIndex + 1,
      part.partCount,
      partAllowance,
      part.bodyStart,
      part.bodyEnd,
      part.rangeContentSha256,
      part.rangeId,
    );
    // The `,` separating entries is one page char, hence two rendered chars.
    const cost = envelopeCostOfSerialized(framing) + envelopeContentCost(part.body) +
      (entries.length > 0 ? 2 : 0);
    if (entries.length > 0 && used + cost > resultCharBudget) break;
    const entry = pageEntryOf({
      observationId: part.entry.observation_id,
      contentSha256: part.entry.observation_content_sha256,
      partIndex: part.partIndex + 1,
      partCount: part.partCount,
      partAllowance,
      bodyStart: part.bodyStart,
      bodyEnd: part.bodyEnd,
      rangeContentSha256: part.rangeContentSha256,
      rangeId: part.rangeId,
      body: part.body,
    });
    // The COST MODEL, checked per entry (design `23-…md` §3/S1, review F-9). Field parity is already
    // structural — `pageEntryOf` is the only entry literal — so what remains falsifiable is the
    // arithmetic: `jsonStringContentCost` must equal what `JSON.stringify` actually spends on this body,
    // or every reservation above it is wrong. Checking it here fires on the FIRST entry, where the
    // page-level assertion below fires only once a page grows past its budget — which the corpus's small
    // observations never do. Both stay: this covers the entry, that covers the page envelope.
    const emitted = JSON.stringify(entry);
    if (emitted.length !== framing.length + jsonStringContentCost(part.body)) {
      throw new ObservationReadError(
        "budget_too_small",
        `entry for ${part.entry.observation_id} part ${part.partIndex + 1} serialized to ${emitted.length} chars, ` +
          `but its framing reserved ${framing.length} plus ${jsonStringContentCost(part.body)} of content; ` +
          "the reserved shape and the emitted shape disagree",
      );
    }
    // The SAME parity, one level up: the rendered cost model must equal what re-escaping this entry
    // actually spends. `codePointEnvelopeCost` is a hand-derived table over `codePointJsonCost`'s cases,
    // and a wrong row there would under-reserve silently — the page would fit its budget and be clipped
    // in transit, which is precisely the failure this change exists to close.
    const reservedCost = envelopeCostOfSerialized(framing) + envelopeContentCost(part.body);
    if (envelopeCostOfSerialized(emitted) !== reservedCost) {
      throw new ObservationReadError(
        "budget_too_small",
        `entry for ${part.entry.observation_id} part ${part.partIndex + 1} renders to ${
          envelopeCostOfSerialized(emitted)
        } chars, but the cost model reserved ${reservedCost}; the rendered-cost table is wrong`,
      );
    }
    entries.push(entry);
    used += cost;
  }

  const nextPart = pending[flat];
  const page: ObservationReadPage = {
    snapshot_digest: snapshot.snapshot_digest,
    entries,
    ...(nextPart !== undefined
      ? {
          next_cursor: encodeCursor({
            v: OBSERVATION_CURSOR_VERSION,
            d: snapshot.snapshot_digest,
            b: resultCharBudget,
            ids: [...ids],
            o: nextPart.observationIndex,
            p: nextPart.partIndex,
          }),
        }
      : {}),
  };

  // The module's core promise, enforced at its own authority rather than asserted downstream: no RESULT
  // it emits exceeds the budget it was sized against. Measured on the result rather than on the page,
  // because the page is not what the transport clips — a page well under its own size still rendered to
  // 66,892 chars and was cut at 40,149 (design `23-…md` §0-1, 2026-07-31). A miscount in the arithmetic
  // above fails loud here instead of reaching a worker as content that silently never arrived.
  const renderedChars = JSON.stringify(observationReadToolResult(page)).length;
  if (renderedChars > resultCharBudget) {
    throw new ObservationReadError(
      "budget_too_small",
      `page rendered to ${renderedChars} result chars, above the ${resultCharBudget} budget it was sized against`,
    );
  }
  return page;
}
