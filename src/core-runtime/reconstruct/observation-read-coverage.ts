/**
 * How served page parts add up to COVERAGE of an observation — declared once (design §6-4, §9-F2).
 *
 * Two rules live here, and until this module existed they lived in two different files: the
 * accumulation (`observation-read-grant.ts`, what has been served) and the completeness judgment
 * (`observation-read-facade.ts`, whether that covers the observation a citation names). Delivery
 * reconciliation has to apply BOTH to derive `delivered` from what actually reached the model, and a
 * second declaration of either is a rule that can disagree with itself.
 *
 * # Why coverage is CHAR RANGES, not part indexes (design `23-…md` §1)
 *
 * A part index means nothing outside the decomposition that produced it. The split is a pure function
 * of `(body, partAllowance)`, and `partAllowance` is derived from the REQUEST's id list — the page
 * envelope reserves worst-case cursor and entry framing for exactly those ids — so the same
 * observation splits into a different number of parts when it is fetched alone than when it is
 * fetched alongside fifteen others. Unioning indexes across requests therefore assembled a "complete"
 * set out of two different partitions and authorized an observation whose middle was never served
 * (measured: a grouped part 1/2 ending at char 64,774 and a solo part 2/2 starting at 65,068 both
 * report count 2, and merging them claimed complete coverage across a 293-char hole).
 *
 * That defect is a property of the COORDINATE, not of the accumulation. Char offsets into the body are
 * one coordinate space per body: every decomposition of the same content measures from the same origin,
 * so a union of half-open intervals is sound ACROSS decompositions where a union of indexes is not. The
 * measured hole above survives as a hole, because `[0, 64774) ∪ [65068, N)` is two segments and not one.
 *
 * This is why the earlier arrangement is gone rather than extended. It kept one coverage record per
 * `(content sha, allowance)` and asked whether ANY ONE of them was complete — sound, but it could not
 * credit a worker that fetched the first half in one request shape and the second half in another, and
 * it needed the allowance persisted everywhere as "the decomposition's identity". Ranges need neither.
 *
 * # How the body's LENGTH becomes known
 *
 * "Covered whole" needs the total, and a page entry does not carry it. It does not have to: a FINAL
 * part (`part_index === part_count`) ends at the body's end, so folding one teaches the coverage its
 * length. Until one arrives the length is unknown and nothing can be judged complete — which is the
 * correct answer, not a limitation, because a run that never received the tail has not received the
 * observation either.
 */

/** The facts a served page entry contributes: one range of one observation's body. */
export interface ObservationRangeFact {
  readonly observation_id: string;
  readonly observation_content_sha256: string;
  /** Start of the range, a char offset into the observation's canonical body. */
  readonly body_start: number;
  /** End of the range, exclusive. */
  readonly body_end: number;
  /** 1-based. Read ONLY to recognise a final part, which is what teaches the body's length. */
  readonly part_index: number;
  readonly part_count: number;
}

/** A half-open char interval into one observation body. */
export type ObservationRange = readonly [start: number, end: number];

/** Which ranges of ONE body — identified by the hash of that exact content — have been served. */
export interface ObservationContentCoverage {
  readonly sha256: string;
  /** Merged: ascending, disjoint, and never touching (adjacent ranges are joined). */
  ranges: readonly ObservationRange[];
  /** The body's total length, or `undefined` until a final part has been folded. */
  bodyLength: number | undefined;
}

/**
 * One observation's coverage, as an artifact records it — the shape BOTH the facade receipt (what the
 * runtime served) and the delivery record (what reached the worker) persist.
 *
 * One shape, two authorities. They answer different questions and must never be confused for one
 * another, but "which characters of which content" is the same fact in both, and a second declaration
 * of it is a shape that can drift from its twin.
 */
export interface ObservationCoverageRecord {
  readonly observation_id: string;
  readonly observation_content_sha256: string;
  /**
   * Half-open char ranges of the observation's canonical body, merged: ascending, disjoint, joined
   * where they touch. Ranges rather than part indexes because an index means nothing outside the
   * decomposition that produced it, while offsets share one coordinate space per body.
   */
  readonly ranges: readonly ObservationRange[];
  /**
   * The body's total length, or `null` until a final part has been recorded. Without it `ranges` cannot
   * say whether the WHOLE observation is covered or only its opening — and a citation names the
   * observation, not the fragment, so the consumer needs to know the difference.
   */
  readonly body_length: number | null;
}

/** Project one observation's accumulated coverage into the record an artifact persists. */
export function observationCoverageRecord(
  observationId: string,
  coverage: ObservationCoverage,
): ObservationCoverageRecord | undefined {
  const selected = selectReportedContent(coverage);
  if (selected === undefined) return undefined;
  return Object.freeze({
    observation_id: observationId,
    observation_content_sha256: selected.sha256,
    ranges: Object.freeze(
      selected.ranges.map((range) => Object.freeze([...range]) as ObservationRange),
    ),
    body_length: selected.bodyLength ?? null,
  });
}

/** Every version of one observation's content this session has seen ranges of, keyed by content hash. */
export interface ObservationCoverage {
  readonly byContent: Map<string, ObservationContentCoverage>;
}

/**
 * Merge half-open intervals into an ascending, disjoint, non-touching set.
 *
 * Touching intervals are JOINED (`[0,5)` and `[5,9)` become `[0,9)`), because they cover the same chars
 * as `[0,9)` does and leaving them apart would make a complete cover look like two segments. Overlap is
 * absorbed for the same reason: two decompositions can serve overlapping ranges of the same body, and
 * what a citation needs to know is which characters arrived, not how many times.
 */
export function mergeObservationRanges(
  ranges: readonly ObservationRange[],
): readonly ObservationRange[] {
  const sorted = [...ranges].sort((left, right) =>
    left[0] !== right[0] ? left[0] - right[0] : left[1] - right[1]
  );
  const merged: ObservationRange[] = [];
  for (const [start, end] of sorted) {
    if (end <= start) continue;
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      if (end > last[1]) merged[merged.length - 1] = [last[0], end];
      continue;
    }
    merged.push([start, end]);
  }
  return merged;
}

/** Add one served range to an observation's coverage, returning the coverage to store. */
export function foldObservationRange(
  existing: ObservationCoverage | undefined,
  fact: ObservationRangeFact,
): ObservationCoverage {
  const coverage = existing ?? { byContent: new Map<string, ObservationContentCoverage>() };
  const previous = coverage.byContent.get(fact.observation_content_sha256);
  const ranges = mergeObservationRanges([
    ...(previous?.ranges ?? []),
    [fact.body_start, fact.body_end],
  ]);
  // A final part ends at the body's end, so it — and only it — establishes the total. Recorded rather
  // than recomputed from the ranges: the largest `body_end` seen is NOT the length when the tail is
  // missing, and treating it as one would call a truncated fetch complete.
  const bodyLength = fact.part_index === fact.part_count
    ? fact.body_end
    : previous?.bodyLength;
  coverage.byContent.set(fact.observation_content_sha256, {
    sha256: fact.observation_content_sha256,
    ranges,
    bodyLength,
  });
  return coverage;
}

/** Chars this coverage actually holds — the union's measure, not the sum of what was served. */
export function coveredCharCount(ranges: readonly ObservationRange[]): number {
  return ranges.reduce((total, [start, end]) => total + (end - start), 0);
}

/**
 * Does this coverage prove the WHOLE observation was served?
 *
 * A citation names an observation, so serving its opening page and stopping proves the worker saw a
 * fragment — not the thing it is about to cite. Admitting the id anyway let the runtime infer more than
 * its evidence carried, which is the one inference this stage exists to prevent.
 *
 * ONE segment starting at 0 and ending at the body's length. Deliberately not "the covered char count
 * equals the length": a set holding a 445-char hole and an 882-char overlap sums ABOVE the body's
 * length while missing content (reproduced on the real corpus — cross-family review built exactly that
 * from two decompositions of the measured 780,114-char observation), so a count comparison admits it.
 */
export function coversWholeObservation(
  coverage: { readonly ranges: readonly ObservationRange[]; readonly bodyLength: number | undefined },
): boolean {
  if (coverage.bodyLength === undefined) return false;
  const [only] = coverage.ranges;
  return coverage.ranges.length === 1 && only !== undefined && only[0] === 0 &&
    only[1] === coverage.bodyLength;
}

/**
 * The one content version a receipt reports for an observation.
 *
 * A receipt carries one record per observation, so the projection has to choose — and the choice is
 * made ORDER-INDEPENDENTLY, or the fold's order independence would be undone one layer down. Whole
 * coverage wins, because that is the evidence a citation is judged against; among equals the one
 * holding more characters wins, and ties break on the hash so the result never depends on arrival order.
 */
export function selectReportedContent(
  coverage: ObservationCoverage,
): ObservationContentCoverage | undefined {
  const ranked = [...coverage.byContent.values()].sort((left, right) => {
    const whole = Number(coversWholeObservation(right)) - Number(coversWholeObservation(left));
    if (whole !== 0) return whole;
    const covered = coveredCharCount(right.ranges) - coveredCharCount(left.ranges);
    if (covered !== 0) return covered;
    return left.sha256 < right.sha256 ? -1 : left.sha256 > right.sha256 ? 1 : 0;
  });
  return ranked[0];
}
