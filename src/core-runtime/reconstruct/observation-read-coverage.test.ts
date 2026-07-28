import { describe, expect, it } from "vitest";
import {
  type ObservationCoverage,
  type ObservationReadPartFact,
  coversWholeObservation,
  foldObservationPart,
  selectReportedPartition,
} from "./observation-read-coverage.js";

function part(
  overrides: Partial<ObservationReadPartFact> & Pick<ObservationReadPartFact, "part_index">,
): ObservationReadPartFact {
  return {
    observation_id: "obs-1",
    observation_content_sha256: "sha-1",
    part_count: 2,
    part_allowance: 1_000,
    ...overrides,
  };
}

/** The call site's shape: fold into a map keyed by observation id, exactly as the grant does. */
function foldAll(entries: readonly ObservationReadPartFact[]): Map<string, ObservationCoverage> {
  const served = new Map<string, ObservationCoverage>();
  for (const entry of entries) {
    served.set(entry.observation_id, foldObservationPart(served.get(entry.observation_id), entry));
  }
  return served;
}

/** The receipt projection, as `receiptOf` builds it — reported partition, indexes ascending. */
function asServedRecord(
  coverage: ObservationCoverage,
): { part_indexes: readonly number[]; part_count: number; part_allowance: number } {
  const record = selectReportedPartition(coverage)!;
  return {
    part_indexes: [...record.parts].sort((a, b) => a - b),
    part_count: record.partCount,
    part_allowance: record.partAllowance,
  };
}

describe("observation read coverage — the accumulation and completeness rules, declared once", () => {
  it("accumulates parts of ONE decomposition into a whole observation", () => {
    const served = foldAll([part({ part_index: 1 }), part({ part_index: 2 })]);
    const record = asServedRecord(served.get("obs-1")!);
    expect(record.part_indexes).toEqual([1, 2]);
    expect(record.part_allowance).toBe(1_000);
    expect(coversWholeObservation(record)).toBe(true);
  });

  it("does not admit an observation whose tail was never served", () => {
    const served = foldAll([part({ part_index: 1 })]);
    expect(coversWholeObservation(asServedRecord(served.get("obs-1")!))).toBe(false);
  });

  /**
   * THE measured regression. A grouped part 1/2 ending at char 64,774 and a solo part 2/2 starting at
   * 65,068 both report `part_count: 2`, so a rule keyed on the COUNT would merge them and claim
   * complete coverage across a 293-char hole. Keying on the allowance drops the earlier partition
   * instead — the only direction that cannot invent coverage.
   */
  it("refuses to assemble complete coverage out of two different partitions", () => {
    const served = foldAll([
      part({ part_index: 1, part_count: 2, part_allowance: 64_774 }),
      part({ part_index: 2, part_count: 2, part_allowance: 65_068 }),
    ]);
    const coverage = served.get("obs-1")!;
    // BOTH partitions are kept now — and neither is whole, which is why the merge is still refused.
    expect(coverage.partitions.size).toBe(2);
    for (const partition of coverage.partitions.values()) {
      expect(partition.parts.size).toBe(1);
    }
    expect(coversWholeObservation(asServedRecord(coverage))).toBe(false);
  });

  /**
   * codex ultracode review, PR #271. Every fixture pinned `sha-1`, so the partition key could drop
   * `observation_content_sha256` entirely and this suite stayed green — while parts of two DIFFERENT
   * content versions merged into one "complete" observation that never fully arrived.
   */
  it("does not merge parts of two different CONTENT versions", () => {
    const served = foldAll([
      part({ part_index: 1, part_count: 2, observation_content_sha256: "sha-A" }),
      part({ part_index: 2, part_count: 2, observation_content_sha256: "sha-B" }),
    ]);
    const coverage = served.get("obs-1")!;
    expect(coverage.partitions.size).toBe(2); // one per content version
    expect(coversWholeObservation(asServedRecord(coverage))).toBe(false);
  });

  /**
   * codex ultracode review, PR #271. The permutation fixture had BOTH partitions complete, so the
   * projection's "a complete partition wins" comparison could be deleted and the suite stayed green.
   * A small complete partition must beat a larger incomplete one.
   */
  it("reports a COMPLETE small partition over a larger incomplete one", () => {
    const served = foldAll([
      part({ part_index: 1, part_count: 1, part_allowance: 2_000 }),
      part({ part_index: 1, part_count: 3, part_allowance: 1_000 }),
      part({ part_index: 2, part_count: 3, part_allowance: 1_000 }),
    ]);
    const record = asServedRecord(served.get("obs-1")!);
    expect(record.part_count).toBe(1); // the complete one, not the 2-of-3
    expect(coversWholeObservation(record)).toBe(true);
  });

  it("keeps observations independent", () => {
    const served = foldAll([
      part({ observation_id: "obs-1", part_index: 1, part_count: 1 }),
      part({ observation_id: "obs-2", part_index: 1, part_count: 2 }),
    ]);
    expect(coversWholeObservation(asServedRecord(served.get("obs-1")!))).toBe(true);
    expect(coversWholeObservation(asServedRecord(served.get("obs-2")!))).toBe(false);
  });

  it("treats a repeated fetch of the same part as one part", () => {
    const served = foldAll([part({ part_index: 1 }), part({ part_index: 1 }), part({ part_index: 2 })]);
    expect(asServedRecord(served.get("obs-1")!).part_indexes).toEqual([1, 2]);
  });

  describe("completeness rejects every shape that is not full coverage", () => {
    it.each([
      { name: "zero parts", part_indexes: [], part_count: 0 },
      { name: "negative count", part_indexes: [1], part_count: -1 },
      { name: "duplicate indexes standing in for coverage", part_indexes: [1, 1], part_count: 2 },
      { name: "index above the count", part_indexes: [1, 3], part_count: 2 },
      { name: "index below one", part_indexes: [0, 1], part_count: 2 },
      { name: "missing middle", part_indexes: [1, 3], part_count: 3 },
    ])("$name", ({ part_indexes, part_count }) => {
      expect(coversWholeObservation({ part_indexes, part_count })).toBe(false);
    });

    it("accepts a whole single-part observation", () => {
      expect(coversWholeObservation({ part_indexes: [1], part_count: 1 })).toBe(true);
    });
  });

  /**
   * Stage 0b: the judgment no longer depends on the order pages arrive in. The server's wire order is
   * not the order the model received them — the JS the model writes decides when each result is
   * rendered (design §12-S4) — so an accumulator that discarded a completed partition because a
   * later page used a different allowance could refuse a delivery that really happened.
   */
  it("judges the same set of parts the same way in any order", () => {
    const parts = [
      part({ part_index: 1, part_count: 2, part_allowance: 1_000 }),
      part({ part_index: 1, part_count: 1, part_allowance: 2_000 }),
      part({ part_index: 2, part_count: 2, part_allowance: 1_000 }),
    ];
    const orders = [
      [parts[0]!, parts[1]!, parts[2]!],
      [parts[0]!, parts[2]!, parts[1]!],
      [parts[1]!, parts[0]!, parts[2]!],
      [parts[1]!, parts[2]!, parts[0]!],
      [parts[2]!, parts[0]!, parts[1]!],
      [parts[2]!, parts[1]!, parts[0]!],
    ];
    const projected = orders.map((order) => asServedRecord(foldAll(order).get("obs-1")!));
    for (const record of projected) {
      expect(coversWholeObservation(record)).toBe(true);
      // Identical projection, not merely an identical verdict: the receipt must not vary either.
      expect(record).toEqual(projected[0]);
    }
  });

  it("stays order independent when NO partition is complete", () => {
    const forward = foldAll([
      part({ part_index: 1, part_count: 2, part_allowance: 64_774 }),
      part({ part_index: 2, part_count: 2, part_allowance: 65_068 }),
    ]);
    const backward = foldAll([
      part({ part_index: 2, part_count: 2, part_allowance: 65_068 }),
      part({ part_index: 1, part_count: 2, part_allowance: 64_774 }),
    ]);
    const forwardRecord = asServedRecord(forward.get("obs-1")!);
    expect(forwardRecord).toEqual(asServedRecord(backward.get("obs-1")!));
    expect(coversWholeObservation(forwardRecord)).toBe(false);
  });
});
