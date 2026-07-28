import { describe, expect, it } from "vitest";
import {
  type ObservationPartCoverage,
  type ObservationReadPartFact,
  coversWholeObservation,
  foldObservationPart,
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
function foldAll(entries: readonly ObservationReadPartFact[]): Map<string, ObservationPartCoverage> {
  const served = new Map<string, ObservationPartCoverage>();
  for (const entry of entries) {
    served.set(entry.observation_id, foldObservationPart(served.get(entry.observation_id), entry));
  }
  return served;
}

/** The receipt projection, as `receiptOf` builds it — indexes ascending. */
function asServedRecord(
  coverage: ObservationPartCoverage,
): { part_indexes: readonly number[]; part_count: number } {
  return {
    part_indexes: [...coverage.parts].sort((a, b) => a - b),
    part_count: coverage.partCount,
  };
}

describe("observation read coverage — the accumulation and completeness rules, declared once", () => {
  it("accumulates parts of ONE decomposition into a whole observation", () => {
    const served = foldAll([part({ part_index: 1 }), part({ part_index: 2 })]);
    const coverage = served.get("obs-1")!;
    expect([...coverage.parts].sort()).toEqual([1, 2]);
    expect(coverage.partAllowance).toBe(1_000);
    expect(coversWholeObservation(asServedRecord(coverage))).toBe(true);
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
    expect(coverage.partAllowance).toBe(65_068);
    expect([...coverage.parts]).toEqual([2]); // the 64,774 partition's index was dropped, not merged
    expect(coversWholeObservation(asServedRecord(coverage))).toBe(false);
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
    expect([...served.get("obs-1")!.parts].sort()).toEqual([1, 2]);
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
   * The order dependence this extraction PRESERVES, pinned so stage 0b's change is visible as a
   * deliberate one rather than a drift. The same three parts, in two orders, judge differently today:
   * the last allowance wins and discards what came before it.
   */
  it("is order dependent today — pinned so the stage 0b change cannot happen silently", () => {
    const forward = foldAll([
      part({ part_index: 1, part_count: 2, part_allowance: 1_000 }),
      part({ part_index: 1, part_count: 1, part_allowance: 2_000 }),
      part({ part_index: 2, part_count: 2, part_allowance: 1_000 }),
    ]);
    const reordered = foldAll([
      part({ part_index: 1, part_count: 2, part_allowance: 1_000 }),
      part({ part_index: 2, part_count: 2, part_allowance: 1_000 }),
      part({ part_index: 1, part_count: 1, part_allowance: 2_000 }),
    ]);
    expect(coversWholeObservation(asServedRecord(forward.get("obs-1")!))).toBe(false);
    expect(coversWholeObservation(asServedRecord(reordered.get("obs-1")!))).toBe(true);
  });
});
