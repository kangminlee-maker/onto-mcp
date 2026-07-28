/**
 * How served page parts add up to a WHOLE observation — declared once (design §6-4, §9-F2).
 *
 * Two rules live here, and until this module existed they lived in two different files: the
 * accumulation (`observation-read-grant.ts`, which parts of which decomposition were served) and the
 * completeness judgment (`observation-read-facade.ts`, whether those parts cover the observation a
 * citation names). Delivery reconciliation has to apply BOTH to derive `delivered` from what actually
 * reached the model, and a second declaration of either is a rule that can disagree with itself.
 *
 * # Why every partition is tracked, not just the newest (stage 0b, design §12-S4)
 *
 * A part index means nothing outside the decomposition that produced it. The split is a pure function
 * of `(body, partAllowance)`, and `partAllowance` is derived from the REQUEST's id list — the page
 * envelope reserves worst-case cursor and entry framing for exactly those ids — so the same
 * observation splits into a different number of parts when it is fetched alone than when it is
 * fetched alongside fifteen others. Unioning indexes across requests therefore assembled a "complete"
 * set out of two different partitions and authorized an observation whose tail was never served
 * (measured: a grouped part 1/2 ending at char 64,774 and a solo part 2/2 starting at 65,068 both
 * report count 2, and merging them claimed complete coverage across a 293-char hole).
 *
 * The first fix kept ONE record per observation and reset it whenever the allowance changed. That
 * refuses the merge correctly, but it also DISCARDS a partition that was already complete, so the
 * same three pages judged differently depending on the order they arrived in. The order is not even
 * observable: the model's JS decides when each result is rendered, so the wire order the server
 * records is not the order the model received (design §12-S4).
 *
 * So partitions are kept SIDE BY SIDE, keyed by `(content sha, allowance)`, and an observation counts
 * as served when ANY ONE of them is complete. This does not weaken the defence — the measured
 * 293-char-hole case still fails, because its two parts belong to different partitions and neither
 * partition is whole — it only stops the accumulator from throwing away evidence it already had.
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
export interface ObservationPartitionCoverage {
  sha256: string;
  parts: Set<number>;
  partCount: number;
  partAllowance: number;
}

/** Every decomposition of one observation this session has seen parts of. */
export interface ObservationCoverage {
  readonly partitions: Map<string, ObservationPartitionCoverage>;
}

function partitionKey(sha256: string, partAllowance: number): string {
  return `${sha256}|${partAllowance}`;
}

/** Add one served part to an observation's coverage, returning the coverage to store. */
export function foldObservationPart(
  existing: ObservationCoverage | undefined,
  entry: ObservationReadPartFact,
): ObservationCoverage {
  const coverage = existing ?? { partitions: new Map<string, ObservationPartitionCoverage>() };
  const key = partitionKey(entry.observation_content_sha256, entry.part_allowance);
  const partition = coverage.partitions.get(key) ?? {
    sha256: entry.observation_content_sha256,
    parts: new Set<number>(),
    partCount: entry.part_count,
    partAllowance: entry.part_allowance,
  };
  partition.parts.add(entry.part_index);
  coverage.partitions.set(key, partition);
  return coverage;
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

function partitionCovers(partition: ObservationPartitionCoverage): boolean {
  return coversWholeObservation({
    part_indexes: [...partition.parts],
    part_count: partition.partCount,
  });
}

/**
 * The one partition a receipt reports for an observation.
 *
 * A receipt carries one record per observation, so the projection has to choose — and the choice is
 * made ORDER-INDEPENDENTLY, or the fold's order independence would be undone one layer down. A
 * complete partition wins, because that is the evidence a citation is judged against; among equals
 * the smallest allowance wins so the result does not depend on arrival order. With nothing complete,
 * the partition carrying the most parts is reported, which is the most that was honestly served.
 */
export function selectReportedPartition(
  coverage: ObservationCoverage,
): ObservationPartitionCoverage | undefined {
  const ranked = [...coverage.partitions.values()].sort((left, right) => {
    const covers = Number(partitionCovers(right)) - Number(partitionCovers(left));
    if (covers !== 0) return covers;
    if (right.parts.size !== left.parts.size) return right.parts.size - left.parts.size;
    return left.partAllowance - right.partAllowance;
  });
  return ranked[0];
}
