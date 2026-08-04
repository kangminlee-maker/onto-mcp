/**
 * Delivery reconciliation — derives `delivered` from what actually entered the model's context
 * (design §0, §6-2 stage 2). Pure: it takes a transcript and what the facade recorded emitting, and
 * returns either a verified delivered set or a reason it cannot be verified. No consumer yet.
 *
 * THE ONE QUESTION. For each canonical page string the facade emitted, did that exact string appear in
 * some record of the model's context? Nothing else is asked. In particular:
 *
 *   - NO PAIRING between a sent record and "its" output. The two id spaces are disjoint
 *     (`exec-<uuid>` against `call_<…>`), and the measured transcripts show why a positional rule
 *     would be wrong in BOTH directions: one exec fetched four payloads and rendered them into a
 *     single output, and another stored a payload and printed it from a LATER exec entirely
 *     (measurement 20-…, §2). Searching every received record is the only shape that survives both.
 *   - NO RE-SPLITTING. The emission carries the page the facade actually served; reconciliation never
 *     recomputes a partition (§9-F2). It folds the delivered pages through the SAME reducer the live
 *     metering uses (`observation-read-coverage.ts`).
 *
 * WHAT A NEGATIVE RESULT MEANS. "Not found" is `verbatim_delivery_not_attested`, never "not
 * delivered" (§12-S3). A model that parsed the envelope and printed only the body delivered the
 * observation perfectly well while leaving no verbatim copy — the artifact must not claim otherwise.
 * The refusal direction is safe (an unattested page is not citable) but the STATEMENT would be false.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import type { CodexRolloutExpectations, CodexRolloutRefusal } from "./codex-rollout-reader.js";
import { codexHomeFrom, locateCodexRollout, readCodexRollout } from "./codex-rollout-reader.js";
import {
  OBSERVATION_READ_MCP_SERVER_NAME,
  readObservationReadFacadeEmissions,
} from "./observation-read-facade.js";
import {
  type ObservationCoverage,
  type ObservationCoverageRecord,
  type ObservationRange,
  type ObservationRangeFact,
  coversWholeObservation,
  foldObservationRange,
  observationCoverageRecord,
} from "./observation-read-coverage.js";

/** What the facade recorded serving: the emitted string, verbatim (§9-F4). */
export interface ObservationReadEmission {
  /** `JSON.stringify(page)` exactly as it went out — not a digest and not a re-serialization. */
  readonly canonical_text: string;
}

export type EmissionDisposition = "verbatim_delivered" | "verbatim_delivery_not_attested";

export interface EmissionAttestation {
  /** Position in the emission record, so a disclosure can name one without quoting a page. */
  readonly index: number;
  readonly chars: number;
  readonly disposition: EmissionDisposition;
}

export type DeliveryReconciliationRefusal =
  | CodexRolloutRefusal
  /** The CLI never announced exactly one session id, so no transcript can be bound (§9-M1). */
  | "worker_session_unavailable"
  /** codex kept no transcript where it would have put one — deleted, ephemeral, or another home. */
  | "rollout_not_found"
  | "rollout_unreadable"
  /** The facade's own emissions record is missing, torn, or another launch's. */
  | "emissions_record_unreadable"
  /** No delivery record for this launch — reconciliation never ran, or never finished. */
  | "delivery_record_unreadable"
  /** A result from OUR server that no recorded emission accounts for (§11-L1). */
  | "sent_without_recorded_emission"
  /** A recorded emission the transcript never shows the server sending. */
  | "recorded_emission_without_sent_record"
  /** Our own record is not a page. Our record, so this is a defect, not a codex change. */
  | "emission_not_a_page";

export type DeliveryAttestation =
  | { readonly status: "verified"; readonly attestation: readonly EmissionAttestation[] }
  | { readonly status: "unverifiable"; readonly reason: DeliveryReconciliationRefusal };

/**
 * The reconciliation result. `delivered` exists ONLY on the verified branch, which is what stops an
 * `unverifiable` run from being silently read as an empty served set one layer down (§11-L7).
 */
export type DeliveryReconciliation =
  | {
    readonly status: "verified";
    readonly delivered: readonly ObservationCoverageRecord[];
    readonly attestation: readonly EmissionAttestation[];
  }
  | { readonly status: "unverifiable"; readonly reason: DeliveryReconciliationRefusal };

export interface DeliveryReconciliationInput {
  readonly emissions: readonly ObservationReadEmission[];
  readonly transcript: string;
  readonly expect: CodexRolloutExpectations & {
    /** Which MCP server in the transcript is ours. Scoping BEFORE comparing is what makes §11-L1 work. */
    readonly server: string;
    readonly tool: string;
  };
}

/** Multiset difference by exact text — the only key the two sides share. */
function unaccountedFor(left: readonly string[], right: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const text of right) counts.set(text, (counts.get(text) ?? 0) + 1);
  for (const text of left) {
    const remaining = counts.get(text) ?? 0;
    if (remaining === 0) return true;
    counts.set(text, remaining - 1);
  }
  return false;
}

/**
 * Which emissions arrived verbatim, and whether the transcript and our record agree about what was
 * sent at all. Separated from the fold so it can be replayed against real transcripts whose payloads
 * are not observation pages.
 */
export function attestEmissionDelivery(input: DeliveryReconciliationInput): DeliveryAttestation {
  const rollout = readCodexRollout(input.transcript, input.expect);
  if (!rollout.ok) return { status: "unverifiable", reason: rollout.refusal };

  // Scope to our own server FIRST. The measured corpus has 28 sent records against 34 received ones —
  // an exec that calls no tool still produces a received record — so a whole-transcript count
  // comparison would be wrong before it was even applied (§11-L1, measurement 20-… §5).
  const ourSent = rollout.sent
    .filter((record) => record.server === input.expect.server && record.tool === input.expect.tool)
    // An error result is rendered into the conversation too, but it is not an emission: the facade
    // records what it SERVED, and a refusal served no page.
    .filter((record) => !record.is_error && record.text !== null)
    .map((record) => record.text!);
  const recorded = input.emissions.map((emission) => emission.canonical_text);

  // Bidirectional, as §11-L1 requires — and by TEXT, because the id spaces do not join. The server
  // commits its receipt after the response bytes are already out, so a crash in that window leaves a
  // page that was sent and never recorded; one-way checking would call that run verified.
  if (unaccountedFor(ourSent, recorded)) {
    return { status: "unverifiable", reason: "sent_without_recorded_emission" };
  }
  if (unaccountedFor(recorded, ourSent)) {
    return { status: "unverifiable", reason: "recorded_emission_without_sent_record" };
  }

  const attestation = input.emissions.map((emission, index): EmissionAttestation => ({
    index,
    chars: emission.canonical_text.length,
    disposition: rollout.received.some((record) => record.text.includes(emission.canonical_text))
      ? "verbatim_delivered"
      : "verbatim_delivery_not_attested",
  }));
  return { status: "verified", attestation };
}

function rangesOfPage(canonicalText: string): readonly ObservationRangeFact[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalText);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return null;
  const facts: ObservationRangeFact[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) return null;
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.observation_id !== "string" ||
      typeof candidate.observation_content_sha256 !== "string" ||
      typeof candidate.part_index !== "number" || typeof candidate.part_count !== "number" ||
      // The OFFSETS are what this layer folds, and a page that does not state them cannot be folded —
      // they are not derivable here (the split cuts on JSON escape cost, and this module must never
      // re-split, §9-F2). A page from before the range contract therefore fails as "not a page", which
      // is the honest answer: it is not a page THIS rule can judge.
      typeof candidate.body_start !== "number" || typeof candidate.body_end !== "number"
    ) {
      return null;
    }
    facts.push({
      observation_id: candidate.observation_id,
      observation_content_sha256: candidate.observation_content_sha256,
      body_start: candidate.body_start,
      body_end: candidate.body_end,
      part_index: candidate.part_index,
      part_count: candidate.part_count,
    });
  }
  return facts;
}

/**
 * `delivered` — WHICH CHARACTERS of which observations reached the model's context.
 *
 * Ranges rather than a set of ids, because that is the unit the evidence actually supports: a worker
 * that read one section of an 800 KB observation received that section, and the layer above decides
 * what may be claimed from it. Under the old id-set shape the only expressible answer was "all of it or
 * none", which made a large observation permanently uncitable no matter how faithfully it was read.
 *
 * Only the attested emissions are folded, and they are folded by the reducer the live metering shares,
 * so coverage can only accumulate out of pages that actually arrived. The fold is order independent
 * (stage 0b), which matters here more than anywhere: the order pages arrive in the transcript is the
 * order the SERVER wrote them, and the measured `store`/`load` phase shows that is not the order the
 * model received them.
 */
export function reconcileDelivery(input: DeliveryReconciliationInput): DeliveryReconciliation {
  const attested = attestEmissionDelivery(input);
  if (attested.status === "unverifiable") return attested;

  const coverage = new Map<string, ObservationCoverage>();
  for (const [index, emission] of input.emissions.entries()) {
    const ranges = rangesOfPage(emission.canonical_text);
    if (ranges === null) return { status: "unverifiable", reason: "emission_not_a_page" };
    if (attested.attestation[index]!.disposition !== "verbatim_delivered") continue;
    for (const fact of ranges) {
      coverage.set(fact.observation_id, foldObservationRange(coverage.get(fact.observation_id), fact));
    }
  }

  const delivered = [...coverage.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .flatMap(([observationId, observationCoverage]) => {
      const record = observationCoverageRecord(observationId, observationCoverage);
      return record === undefined ? [] : [record];
    });
  return { status: "verified", delivered, attestation: attested.attestation };
}

/**
 * The persisted reconciliation result — design §2's "v3 receipt", named for what it holds.
 *
 * It is deliberately NOT the facade's receipt file: that one says what the runtime SERVED and is
 * written by the facade, while this says what ARRIVED and is written only here, after the worker is
 * gone (§9-F3). Two producers of one file is the shape that let a run die mid-flight and still have
 * its emit-time record read as authority.
 *
 * `delivered` exists only on the verified branch, in the file as in the type (§11-L7).
 */
export type ObservationReadDeliveryRecordFile =
  | {
    readonly schema_version: "observation-read-delivery/v2";
    readonly launch_token: string;
    readonly status: "verified";
    readonly delivered: readonly ObservationCoverageRecord[];
    readonly attestation: readonly EmissionAttestation[];
  }
  | {
    readonly schema_version: "observation-read-delivery/v2";
    readonly launch_token: string;
    readonly status: "unverifiable";
    readonly reason: DeliveryReconciliationRefusal;
  };

// v2 because `delivered` changed UNIT, not shape: it was the ids whose whole content arrived and is now
// the char ranges that arrived. A v1 reader handed a v2 file would read an array of objects where it
// expected strings; a v2 reader handed a v1 file would read ids as coverage records. Both fail closed
// here (unknown version -> null -> "no record"), which is the honest outcome for a file authored under
// a rule this build no longer applies.
const DELIVERY_RECORD_SCHEMA_VERSION = "observation-read-delivery/v2" as const;

export function writeObservationReadDeliveryRecord(args: {
  readonly recordPath: string;
  readonly launchToken: string;
  readonly reconciliation: DeliveryReconciliation;
}): ObservationReadDeliveryRecordFile {
  const file: ObservationReadDeliveryRecordFile = args.reconciliation.status === "verified"
    ? {
      schema_version: DELIVERY_RECORD_SCHEMA_VERSION,
      launch_token: args.launchToken,
      status: "verified",
      // Already ordered by observation id where it is derived, so the file's order is the fold's — the
      // sort does not live in two places.
      delivered: args.reconciliation.delivered,
      attestation: args.reconciliation.attestation,
    }
    : {
      schema_version: DELIVERY_RECORD_SCHEMA_VERSION,
      launch_token: args.launchToken,
      status: "unverifiable",
      reason: args.reconciliation.reason,
    };
  const temporaryPath = `${args.recordPath}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, args.recordPath);
  return file;
}

/**
 * Read a delivery record, FAIL-CLOSED. A missing file, torn JSON, an unknown shape or another launch's
 * token all yield `null` — which a consumer must read as "we have no record", not as "nothing was
 * delivered". The distinction is the whole point of §9-M2, and it survives here because `null` and
 * `{status:"verified", delivered:[]}` are different values.
 */
export function readObservationReadDeliveryRecord(
  recordPath: string,
  expectedLaunchToken: string,
): ObservationReadDeliveryRecordFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(recordPath, "utf8")) as unknown;
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.schema_version !== DELIVERY_RECORD_SCHEMA_VERSION) return null;
  if (typeof record.launch_token !== "string" || record.launch_token !== expectedLaunchToken) {
    return null;
  }
  if (record.status === "unverifiable") {
    return typeof record.reason === "string"
      ? {
        schema_version: DELIVERY_RECORD_SCHEMA_VERSION,
        launch_token: record.launch_token,
        status: "unverifiable",
        reason: record.reason as DeliveryReconciliationRefusal,
      }
      : null;
  }
  if (record.status !== "verified") return null;
  if (!Array.isArray(record.delivered)) return null;
  const delivered: ObservationCoverageRecord[] = [];
  for (const entry of record.delivered) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.observation_id !== "string" ||
      typeof candidate.observation_content_sha256 !== "string" ||
      !Array.isArray(candidate.ranges) ||
      (candidate.body_length !== null && typeof candidate.body_length !== "number")
    ) {
      return null;
    }
    const ranges: ObservationRange[] = [];
    for (const range of candidate.ranges) {
      if (
        !Array.isArray(range) || range.length !== 2 ||
        typeof range[0] !== "number" || typeof range[1] !== "number"
      ) {
        return null;
      }
      ranges.push([range[0], range[1]]);
    }
    delivered.push({
      observation_id: candidate.observation_id,
      observation_content_sha256: candidate.observation_content_sha256,
      ranges,
      body_length: candidate.body_length as number | null,
    });
  }
  if (!Array.isArray(record.attestation)) return null;
  const attestation: EmissionAttestation[] = [];
  for (const entry of record.attestation) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.index !== "number" || typeof candidate.chars !== "number" ||
      (candidate.disposition !== "verbatim_delivered" &&
        candidate.disposition !== "verbatim_delivery_not_attested")
    ) {
      return null;
    }
    attestation.push({
      index: candidate.index,
      chars: candidate.chars,
      disposition: candidate.disposition,
    });
  }
  return {
    schema_version: DELIVERY_RECORD_SCHEMA_VERSION,
    launch_token: record.launch_token,
    status: "verified",
    delivered,
    attestation,
  };
}

/**
 * The codex versions this derivation has been verified against.
 *
 * A transcript from any other version is `unverifiable` — not because it is necessarily different, but
 * because nobody has checked. Stage 4 makes this a gate with a re-verification procedure behind it;
 * until then it is a constant, and its being a constant is what keeps an unverified version from
 * silently producing a delivered set (§9-M3, §10-R2-1).
 */
export const VERIFIED_CODEX_CLI_VERSIONS: readonly string[] = ["0.145.0"];

/**
 * Reconcile one finished dispatch and persist the result. Called by the runtime AFTER the worker has
 * exited, because a transcript is only complete then.
 *
 * Never throws for an evidence reason: every missing or unreadable input becomes an `unverifiable`
 * record, which is the honest statement and the fail-closed one. It DOES throw if it cannot write its
 * own record — a runtime that silently fails to persist evidence is the failure this whole layer
 * exists to remove.
 */
export function reconcileFacadeDelivery(args: {
  readonly launch: {
    readonly emissionsPath: string;
    readonly launchToken: string;
  };
  readonly workerSession: { id: string; startedAtMs: number; endedAtMs: number } | undefined;
  readonly recordPath: string;
  readonly cwd?: string;
  readonly codexHome?: string;
  readonly toolName: string;
}): ObservationReadDeliveryRecordFile {
  const persist = (reconciliation: DeliveryReconciliation): ObservationReadDeliveryRecordFile =>
    writeObservationReadDeliveryRecord({
      recordPath: args.recordPath,
      launchToken: args.launch.launchToken,
      reconciliation,
    });

  if (args.workerSession === undefined) {
    return persist({ status: "unverifiable", reason: "worker_session_unavailable" });
  }
  const emissionsFile = readObservationReadFacadeEmissions(
    args.launch.emissionsPath,
    args.launch.launchToken,
  );
  if (emissionsFile === null) {
    return persist({ status: "unverifiable", reason: "emissions_record_unreadable" });
  }
  const rolloutPath = locateCodexRollout({
    codexHome: args.codexHome ?? codexHomeFrom(process.env, os.homedir()),
    sessionId: args.workerSession.id,
    childWindow: args.workerSession,
  });
  if (rolloutPath === null) {
    return persist({ status: "unverifiable", reason: "rollout_not_found" });
  }
  let transcript: string;
  try {
    transcript = readFileSync(rolloutPath, "utf8");
  } catch {
    return persist({ status: "unverifiable", reason: "rollout_unreadable" });
  }
  return persist(reconcileDelivery({
    emissions: emissionsFile.emissions,
    transcript,
    expect: {
      sessionId: args.workerSession.id,
      cwd: args.cwd ?? process.cwd(),
      verifiedCliVersions: VERIFIED_CODEX_CLI_VERSIONS,
      childWindow: args.workerSession,
      // The SAME constant the registration uses, not a second spelling of it.
      server: OBSERVATION_READ_MCP_SERVER_NAME,
      tool: args.toolName,
    },
  }));
}

/**
 * What a citation may name, and on what basis — the shape the consumer branches on (§10-R2-4, §11-L7).
 *
 * The two rejections are NOT the same statement. "Verified, and this id did not arrive" is a fact
 * about the run; "we could not verify" is a fact about our evidence, and reporting the second as the
 * first is the false statement §12-S3 names. Both refuse the citation — only the sentence differs.
 */
export type CitableObservations =
  | { readonly basis: "delivered"; readonly coverage: readonly ObservationCoverageRecord[] }
  | { readonly basis: "unverifiable"; readonly reason: DeliveryReconciliationRefusal };

/** Project a delivery record into what may be cited. A missing record admits nothing. */
export function citableFromDeliveryRecord(
  record: ObservationReadDeliveryRecordFile | null,
): CitableObservations {
  if (record === null) return { basis: "unverifiable", reason: "delivery_record_unreadable" };
  if (record.status !== "verified") return { basis: "unverifiable", reason: record.reason };
  return { basis: "delivered", coverage: record.delivered };
}

/**
 * Did the characters `[start, end)` of THIS content actually arrive?
 *
 * The content hash is part of the question, not a detail: offsets only mean something against the body
 * they were measured on, so coverage of a different version of the same observation answers nothing
 * here. A range spanning a hole is refused because it is not contained in any single covered segment —
 * which is the same rule `coversWholeObservation` applies, at range granularity instead of whole-body.
 */
export function deliveredCoversRange(
  citable: { readonly coverage: readonly ObservationCoverageRecord[] },
  ref: {
    readonly observation_id: string;
    readonly observation_content_sha256: string;
    readonly body_start: number;
    readonly body_end: number;
  },
): boolean {
  const record = citable.coverage.find((entry) =>
    entry.observation_id === ref.observation_id &&
    entry.observation_content_sha256 === ref.observation_content_sha256
  );
  if (record === undefined) return false;
  return record.ranges.some(([start, end]) => start <= ref.body_start && ref.body_end <= end);
}
