import { describe, expect, it } from "vitest";
import {
  type ObservationCoverage,
  type ObservationCoverageRecord,
  type ObservationRangeFact,
  coveredCharCount,
  coversWholeObservation,
  foldObservationRange,
  mergeObservationRanges,
  observationCoverageRecord,
} from "./observation-read-coverage.js";

/**
 * One served range. `part_index`/`part_count` are here only because a FINAL part is what teaches the
 * fold the body's length — nothing else reads them, which is the change this suite exists to hold.
 */
function range(
  overrides: Partial<ObservationRangeFact> & Pick<ObservationRangeFact, "body_start" | "body_end">,
): ObservationRangeFact {
  return {
    observation_id: "obs-1",
    observation_content_sha256: "sha-1",
    part_index: 1,
    part_count: 2,
    ...overrides,
  };
}

/** The call site's shape: fold into a map keyed by observation id, exactly as the grant does. */
function foldAll(facts: readonly ObservationRangeFact[]): Map<string, ObservationCoverage> {
  const served = new Map<string, ObservationCoverage>();
  for (const fact of facts) {
    served.set(fact.observation_id, foldObservationRange(served.get(fact.observation_id), fact));
  }
  return served;
}

/** The receipt/delivery projection, as both artifacts build it. */
const asRecord = (coverage: ObservationCoverage, id = "obs-1"): ObservationCoverageRecord =>
  observationCoverageRecord(id, coverage)!;

const whole = (record: ObservationCoverageRecord): boolean =>
  coversWholeObservation({ ranges: record.ranges, bodyLength: record.body_length ?? undefined });

describe("observation read coverage — the accumulation and completeness rules, declared once", () => {
  it("accumulates consecutive ranges of ONE body into whole coverage", () => {
    const served = foldAll([
      range({ body_start: 0, body_end: 100, part_index: 1, part_count: 2 }),
      range({ body_start: 100, body_end: 250, part_index: 2, part_count: 2 }),
    ]);
    const record = asRecord(served.get("obs-1")!);
    // Touching ranges are JOINED: `[0,100)` and `[100,250)` cover the same chars as `[0,250)`, and
    // leaving them apart would make a complete cover look like two segments.
    expect(record.ranges).toEqual([[0, 250]]);
    expect(record.body_length).toBe(250);
    expect(whole(record)).toBe(true);
  });

  it("does not admit an observation whose tail was never served", () => {
    const served = foldAll([range({ body_start: 0, body_end: 100, part_index: 1, part_count: 2 })]);
    const record = asRecord(served.get("obs-1")!);
    // No final part arrived, so the body's LENGTH is unknown — and an unknown total cannot be covered.
    expect(record.body_length).toBeNull();
    expect(whole(record)).toBe(false);
  });

  /**
   * THE measured regression, in the coordinate that survives it. A grouped part 1/2 ending at char
   * 64,774 and a solo part 2/2 starting at 65,068 both report `part_count: 2`, so an index rule merges
   * them into "complete" across a 293-char hole. Offsets share one coordinate space per body, so the
   * hole stays a hole no matter which decompositions the ranges came from.
   */
  it("refuses to assemble complete coverage across a hole between two decompositions", () => {
    const served = foldAll([
      range({ body_start: 0, body_end: 64_774, part_index: 1, part_count: 2 }),
      range({ body_start: 65_068, body_end: 130_136, part_index: 2, part_count: 2 }),
    ]);
    const record = asRecord(served.get("obs-1")!);
    expect(record.ranges).toEqual([[0, 64_774], [65_068, 130_136]]);
    expect(whole(record)).toBe(false);
  });

  /**
   * The FOURTH control (cross-family review, reproduced on the real corpus). A set can hold a hole AND
   * an overlap at once, so its covered-char SUM exceeds the body length while content is missing: on
   * the measured 780,114-char observation, `16-id part 1 + solo part 2 + 16-id parts 3..14` leaves a
   * 445-char hole and an 882-char overlap and sums to 780,551. A `sum >= bodyLength` implementation
   * passes every other control in this file and admits exactly this.
   */
  it("refuses a set that holds a hole AND an overlap, whose char sum exceeds the body", () => {
    const served = foldAll([
      range({ body_start: 0, body_end: 62_083, part_index: 1, part_count: 3 }),
      range({ body_start: 61_201, body_end: 62_083, part_index: 2, part_count: 3 }), // overlap: 882
      range({ body_start: 62_528, body_end: 780_114, part_index: 3, part_count: 3 }), // hole: 445
    ]);
    const record = asRecord(served.get("obs-1")!);
    const served_sum = 62_083 + 882 + (780_114 - 62_528);
    expect(served_sum).toBeGreaterThan(780_114); // the control is only a control if the sum DOES exceed
    expect(coveredCharCount(record.ranges)).toBeLessThan(780_114);
    expect(record.body_length).toBe(780_114);
    expect(whole(record)).toBe(false);
  });

  /**
   * codex ultracode review, PR #271. Every fixture pinned `sha-1`, so the coverage key could drop
   * `observation_content_sha256` entirely and this suite stayed green — while ranges of two DIFFERENT
   * content versions merged into one "complete" observation that never fully arrived. Offsets make the
   * merge *look* right, which is exactly why the content hash has to key the coordinate space.
   */
  it("does not merge ranges of two different CONTENT versions", () => {
    const served = foldAll([
      range({ body_start: 0, body_end: 100, part_index: 1, part_count: 2, observation_content_sha256: "sha-A" }),
      range({ body_start: 100, body_end: 250, part_index: 2, part_count: 2, observation_content_sha256: "sha-B" }),
    ]);
    const coverage = served.get("obs-1")!;
    expect(coverage.byContent.size).toBe(2); // one coordinate space per content version
    expect(whole(asRecord(coverage))).toBe(false);
  });

  /**
   * codex ultracode review, PR #271. The permutation fixture had BOTH versions complete, so the
   * projection's "whole wins" comparison could be deleted and the suite stayed green. A small complete
   * cover must beat a larger incomplete one.
   */
  it("reports a COMPLETE small cover over a larger incomplete one", () => {
    const served = foldAll([
      range({ body_start: 0, body_end: 50, part_index: 1, part_count: 1, observation_content_sha256: "sha-small" }),
      range({ body_start: 0, body_end: 900, part_index: 1, part_count: 2, observation_content_sha256: "sha-big" }),
    ]);
    const record = asRecord(served.get("obs-1")!);
    expect(record.observation_content_sha256).toBe("sha-small");
    expect(coveredCharCount(record.ranges)).toBeLessThan(900); // genuinely the smaller one
    expect(whole(record)).toBe(true);
  });

  it("keeps observations independent", () => {
    const served = foldAll([
      range({ observation_id: "obs-1", body_start: 0, body_end: 40, part_index: 1, part_count: 1 }),
      range({ observation_id: "obs-2", body_start: 0, body_end: 40, part_index: 1, part_count: 2 }),
    ]);
    expect(whole(asRecord(served.get("obs-1")!, "obs-1"))).toBe(true);
    expect(whole(asRecord(served.get("obs-2")!, "obs-2"))).toBe(false);
  });

  it("treats a repeated fetch of the same range as one range", () => {
    const served = foldAll([
      range({ body_start: 0, body_end: 100, part_index: 1, part_count: 2 }),
      range({ body_start: 0, body_end: 100, part_index: 1, part_count: 2 }),
      range({ body_start: 100, body_end: 250, part_index: 2, part_count: 2 }),
    ]);
    const record = asRecord(served.get("obs-1")!);
    expect(record.ranges).toEqual([[0, 250]]);
    expect(coveredCharCount(record.ranges)).toBe(250); // counted once, not twice
  });

  describe("merging is total over the shapes a fold can produce", () => {
    it.each([
      { name: "empty", input: [], expected: [] },
      { name: "already merged", input: [[0, 5], [7, 9]], expected: [[0, 5], [7, 9]] },
      { name: "out of order", input: [[7, 9], [0, 5]], expected: [[0, 5], [7, 9]] },
      { name: "touching joins", input: [[0, 5], [5, 9]], expected: [[0, 9]] },
      { name: "overlap absorbs", input: [[0, 6], [4, 9]], expected: [[0, 9]] },
      { name: "contained absorbs", input: [[0, 9], [4, 6]], expected: [[0, 9]] },
      { name: "empty range dropped", input: [[3, 3], [0, 5]], expected: [[0, 5]] },
    ])("$name", ({ input, expected }) => {
      expect(mergeObservationRanges(input as [number, number][])).toEqual(expected);
    });
  });

  describe("completeness rejects every shape that is not full coverage", () => {
    it.each([
      { name: "no ranges", ranges: [], bodyLength: 10 },
      { name: "unknown length", ranges: [[0, 10]], bodyLength: undefined },
      { name: "starts past the origin", ranges: [[1, 10]], bodyLength: 10 },
      { name: "stops before the end", ranges: [[0, 9]], bodyLength: 10 },
      { name: "two segments", ranges: [[0, 4], [5, 10]], bodyLength: 10 },
      { name: "covers more than the body", ranges: [[0, 11]], bodyLength: 10 },
    ])("$name", ({ ranges, bodyLength }) => {
      expect(
        coversWholeObservation({ ranges: ranges as [number, number][], bodyLength }),
      ).toBe(false);
    });

    it("accepts one range spanning the whole body", () => {
      expect(coversWholeObservation({ ranges: [[0, 10]], bodyLength: 10 })).toBe(true);
    });
  });

  /**
   * Stage 0b: the judgment does not depend on the order pages arrive in. The server's wire order is not
   * the order the model received them — the JS the model writes decides when each result is rendered
   * (design §12-S4) — so an accumulator sensitive to order could refuse a delivery that really happened.
   */
  it("judges the same ranges the same way in any order", () => {
    const facts = [
      range({ body_start: 0, body_end: 100, part_index: 1, part_count: 3 }),
      range({ body_start: 100, body_end: 180, part_index: 2, part_count: 3 }),
      range({ body_start: 180, body_end: 250, part_index: 3, part_count: 3 }),
    ];
    const orders = [
      [facts[0]!, facts[1]!, facts[2]!],
      [facts[0]!, facts[2]!, facts[1]!],
      [facts[1]!, facts[0]!, facts[2]!],
      [facts[1]!, facts[2]!, facts[0]!],
      [facts[2]!, facts[0]!, facts[1]!],
      [facts[2]!, facts[1]!, facts[0]!],
    ];
    const projected = orders.map((order) => asRecord(foldAll(order).get("obs-1")!));
    for (const record of projected) {
      expect(whole(record)).toBe(true);
      // Identical projection, not merely an identical verdict: the receipt must not vary either.
      expect(record).toEqual(projected[0]);
    }
  });

  it("stays order independent when coverage is INCOMPLETE", () => {
    const forward = foldAll([
      range({ body_start: 0, body_end: 64_774, part_index: 1, part_count: 2 }),
      range({ body_start: 65_068, body_end: 130_136, part_index: 2, part_count: 2 }),
    ]);
    const backward = foldAll([
      range({ body_start: 65_068, body_end: 130_136, part_index: 2, part_count: 2 }),
      range({ body_start: 0, body_end: 64_774, part_index: 1, part_count: 2 }),
    ]);
    const forwardRecord = asRecord(forward.get("obs-1")!);
    expect(forwardRecord).toEqual(asRecord(backward.get("obs-1")!));
    expect(whole(forwardRecord)).toBe(false);
  });

  /**
   * The capability the range unit buys, and the reason the allowance-keyed arrangement is gone: a
   * worker that fetched the front in one request shape and the back in another really did receive the
   * whole body, and the old rule refused it because no single decomposition was complete.
   */
  it("credits a gap-free cover assembled from two different decompositions", () => {
    const served = foldAll([
      range({ body_start: 0, body_end: 64_774, part_index: 1, part_count: 2 }), // from a 16-id request
      range({ body_start: 64_000, body_end: 130_136, part_index: 2, part_count: 2 }), // from a solo one
    ]);
    const record = asRecord(served.get("obs-1")!);
    expect(record.ranges).toEqual([[0, 130_136]]);
    expect(whole(record)).toBe(true);
  });
});
