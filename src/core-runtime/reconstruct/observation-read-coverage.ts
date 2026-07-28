/**
 * How served page parts add up to a WHOLE observation — declared once (design §6-4, §9-F2).
 *
 * Two rules live here, and until this module existed they lived in two different files: the
 * accumulation (`observation-read-grant.ts`, which parts of which decomposition were served) and the
 * completeness judgment (`observation-read-facade.ts`, whether those parts cover the observation a
 * citation names). Delivery reconciliation has to apply BOTH to derive `delivered` from what actually
 * reached the model, and a second declaration of either is a rule that can disagree with itself.
 *
 * Neither rule changes here. This module is the extraction; the order-independence change is separate
 * and deliberate (design §6-4, stage 0b).
 */

/** The facts a served page entry contributes. Structural: the page type lives a layer up. */
export interface ObservationReadPartFact {
  readonly observation_id: string;
  readonly observation_content_sha256: string;
  readonly part_index: number;
  readonly part_count: number;
  readonly part_allowance: number;
}

/** Which parts of ONE decomposition of one observation have been served. */
export interface ObservationPartCoverage {
  sha256: string;
  parts: Set<number>;
  partCount: number;
  partAllowance: number;
}

/**
 * Add one served part to an observation's coverage, returning the record to store.
 *
 * A part index means nothing outside the decomposition that produced it. The split is a pure function
 * of `(body, partAllowance)`, and `partAllowance` is derived from the REQUEST's id list — the page
 * envelope reserves worst-case cursor and entry framing for exactly those ids — so the same
 * observation splits into a different number of parts when it is fetched alone than when it is
 * fetched alongside fifteen others. Unioning indexes across requests therefore assembled a "complete"
 * set out of two different partitions and authorized an observation whose tail was never served
 * (measured).
 *
 * Keyed on the ALLOWANCE, not on `part_count`: the split is a pure function of (body, allowance), so
 * the allowance names the partition exactly, while two different partitions can share a count — a
 * grouped part 1/2 ending at char 64,774 and a solo part 2/2 starting at 65,068 both report count 2,
 * and merging them claimed complete coverage across a 293-char hole (measured). A different allowance
 * means the earlier indexes describe a partition this one is not part of, so they are dropped rather
 * than merged — the only direction that cannot invent coverage.
 */
export function foldObservationPart(
  existing: ObservationPartCoverage | undefined,
  entry: ObservationReadPartFact,
): ObservationPartCoverage {
  const record = existing && existing.partAllowance === entry.part_allowance ? existing : {
    sha256: entry.observation_content_sha256,
    parts: new Set<number>(),
    partCount: entry.part_count,
    partAllowance: entry.part_allowance,
  };
  record.parts.add(entry.part_index);
  return record;
}

/**
 * Does this coverage prove the WHOLE observation was served?
 *
 * A citation names an observation, so serving page 1 of 4 and stopping proves the worker saw an
 * opening fragment — not the thing it is about to cite. Admitting the id anyway let the runtime infer
 * more than its evidence carried, which is the one inference this stage exists to prevent.
 */
export function coversWholeObservation(
  record: { readonly part_indexes: readonly number[]; readonly part_count: number },
): boolean {
  return record.part_count >= 1 &&
    new Set(record.part_indexes).size === record.part_count &&
    record.part_indexes.every((part) => part >= 1 && part <= record.part_count);
}
