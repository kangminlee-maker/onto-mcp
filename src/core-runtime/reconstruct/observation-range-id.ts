/**
 * The name a citation uses for a range, and the only thing that can turn one back into coordinates
 * (design `23-…md` §3, S3).
 *
 * WHY AN OPAQUE ID AND NOT THE COORDINATES. A page states `body_start`/`body_end` because delivery
 * reconciliation must read them and must never re-split (`delivery-reconciliation.ts` header). The
 * worker therefore SEES offsets — and that is fine, because the citation surface does not accept them.
 * A schema that takes only `orng_v1_…` makes "cite characters 40,000–41,000, which I did not read"
 * unrepresentable rather than forbidden, and an id naming a range this launch never emitted resolves
 * to nothing at all. Forgery is not blocked by secrecy (the digest is computable from what the worker
 * can see); it is blocked because RESOLUTION is a lookup in the runtime's own record of what it sent.
 *
 * WHY THE EMISSIONS RECORD IS THE TABLE. It already exists, it is already the artifact reconciliation
 * replays, and it is written by the runtime after the response bytes are out. Minting a second store
 * would be a second thing that can disagree with what was actually served.
 */
import { createHash } from "node:crypto";

/** Prefix and version of a range id. Bumped if the preimage below changes. */
export const OBSERVATION_RANGE_ID_PREFIX = "orng_v1_";

/** Hex chars of the digest carried in an id. 128 bits — collision here is fail-closed, see below. */
const OBSERVATION_RANGE_ID_DIGEST_CHARS = 32;

/** What a range id names: one half-open slice of one version of one observation's canonical body. */
export interface ObservationRangeRef {
  readonly observation_id: string;
  readonly observation_content_sha256: string;
  readonly body_start: number;
  readonly body_end: number;
  readonly range_content_sha256: string;
}

/**
 * Mint the id for a range. Deterministic and total: the same tuple always yields the same id, so two
 * pages that serve the identical slice name it identically and a citation to either resolves.
 *
 * The preimage is an INJECTIVE encoding — JSON of a structured tuple, not a delimiter-joined string.
 * A separator-joined encoding is ambiguous: an observation id carrying the separator plus a hash-shaped
 * tail can reproduce another range's preimage exactly. (The same defect was found and fixed in the
 * snapshot digest; it is not re-introduced here.)
 */
export function observationRangeId(ref: ObservationRangeRef): string {
  const preimage = JSON.stringify([
    "onto-observation-range/1",
    ref.observation_id,
    ref.observation_content_sha256,
    ref.body_start,
    ref.body_end,
    ref.range_content_sha256,
  ]);
  return OBSERVATION_RANGE_ID_PREFIX +
    createHash("sha256").update(preimage, "utf8").digest("hex").slice(
      0,
      OBSERVATION_RANGE_ID_DIGEST_CHARS,
    );
}

/** Whether a string is shaped like a range id at all — checked before it is used as a lookup key. */
export function isObservationRangeId(value: string): boolean {
  return value.startsWith(OBSERVATION_RANGE_ID_PREFIX) &&
    new RegExp(`^[0-9a-f]{${OBSERVATION_RANGE_ID_DIGEST_CHARS}}$`).test(
      value.slice(OBSERVATION_RANGE_ID_PREFIX.length),
    );
}

/** A range id that resolved to two different tuples — see `indexEmittedObservationRanges`. */
export class ObservationRangeIdCollisionError extends Error {
  constructor(rangeId: string) {
    super(`observation range id ${rangeId} resolves to more than one range`);
    this.name = "ObservationRangeIdCollisionError";
  }
}

/**
 * Build the resolution table from the pages this launch actually emitted.
 *
 * Pages that do not parse, or entries missing the range fields, are SKIPPED rather than rejected: this
 * function answers "what can be resolved", and a caller that finds an id missing refuses the citation.
 * Making an unreadable emission fatal here would turn one torn record into a dead run, which is the
 * shape §2.5 exists to remove.
 *
 * A digest collision — one id, two different tuples — THROWS. It cannot happen by accident at 128 bits,
 * and if it ever does, the alternative is resolving a citation to a range the worker did not name.
 */
export function indexEmittedObservationRanges(
  canonicalPageTexts: readonly string[],
): ReadonlyMap<string, ObservationRangeRef> {
  const table = new Map<string, ObservationRangeRef>();
  for (const text of canonicalPageTexts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const entries = (parsed as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const candidate = entry as Record<string, unknown>;
      if (
        typeof candidate.observation_id !== "string" ||
        typeof candidate.observation_content_sha256 !== "string" ||
        typeof candidate.body_start !== "number" ||
        typeof candidate.body_end !== "number" ||
        typeof candidate.range_content_sha256 !== "string" ||
        typeof candidate.range_id !== "string"
      ) {
        continue;
      }
      const ref: ObservationRangeRef = {
        observation_id: candidate.observation_id,
        observation_content_sha256: candidate.observation_content_sha256,
        body_start: candidate.body_start,
        body_end: candidate.body_end,
        range_content_sha256: candidate.range_content_sha256,
      };
      // The id the PAGE carried is not trusted as a key on its own — it is re-derived from the tuple,
      // so a page whose id and coordinates disagree cannot install a lookup that resolves to content
      // the id does not name.
      const rangeId = observationRangeId(ref);
      if (rangeId !== candidate.range_id) continue;
      const existing = table.get(rangeId);
      if (existing !== undefined) {
        if (
          existing.observation_id !== ref.observation_id ||
          existing.observation_content_sha256 !== ref.observation_content_sha256 ||
          existing.body_start !== ref.body_start || existing.body_end !== ref.body_end ||
          existing.range_content_sha256 !== ref.range_content_sha256
        ) {
          throw new ObservationRangeIdCollisionError(rangeId);
        }
        continue;
      }
      table.set(rangeId, ref);
    }
  }
  return table;
}
