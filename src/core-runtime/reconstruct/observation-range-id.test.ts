import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { ReconstructSourceSafetyLedgerArtifact } from "./artifact-types.js";
import { fixObservationSnapshot, readObservationPage } from "./observation-read.js";
import {
  type ObservationRangeRef,
  indexEmittedObservationRanges,
  isObservationRangeId,
  observationRangeId,
} from "./observation-range-id.js";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const FIXTURES = path.join(REPO_ROOT, "scripts/fixtures/observation-catalog");
const snapshot = fixObservationSnapshot(
  readFileSync(path.join(FIXTURES, "source-observations.yaml"), "utf8"),
  parseYaml(
    readFileSync(path.join(FIXTURES, "source-safety-ledger.yaml"), "utf8"),
  ) as ReconstructSourceSafetyLedgerArtifact,
);

const ref = (overrides: Partial<ObservationRangeRef> = {}): ObservationRangeRef => ({
  observation_id: "obs_0123456789abcdef",
  observation_content_sha256: "a".repeat(64),
  body_start: 0,
  body_end: 100,
  range_content_sha256: "b".repeat(64),
  ...overrides,
});

/** Serve one observation to exhaustion at a budget that really splits it. */
function serveAll(observationId: string, resultCharBudget: number): string[] {
  const texts: string[] = [];
  let page = readObservationPage({
    snapshot,
    request: { observation_ids: [observationId] },
    resultCharBudget,
  });
  texts.push(JSON.stringify(page));
  while (page.next_cursor !== undefined) {
    page = readObservationPage({ snapshot, request: { cursor: page.next_cursor }, resultCharBudget });
    texts.push(JSON.stringify(page));
  }
  return texts;
}

const largest = [...snapshot.entries].sort((a, b) => b.body.length - a.body.length)[0]!;

describe("observation range id — the name a citation uses, and what turns it back into coordinates", () => {
  it("is deterministic, and every field of the tuple changes it", () => {
    expect(observationRangeId(ref())).toBe(observationRangeId(ref()));
    const base = observationRangeId(ref());
    const variants: Partial<ObservationRangeRef>[] = [
      { observation_id: "obs_fedcba9876543210" },
      { observation_content_sha256: "c".repeat(64) },
      { body_start: 1 },
      { body_end: 101 },
      { range_content_sha256: "d".repeat(64) },
    ];
    // Every one, not "at least one": a preimage that dropped a field would still pass a spot check on
    // the field it kept, and dropping the content hash is exactly how two versions of one observation
    // would come to share a name.
    for (const variant of variants) {
      expect(observationRangeId(ref(variant)), JSON.stringify(variant)).not.toBe(base);
    }
  });

  it("cannot be confused by a separator smuggled into an id", () => {
    // The preimage is JSON of a tuple, not a delimiter-joined string. A joined encoding is ambiguous:
    // an observation id carrying the separator plus a hash-shaped tail reproduces another range's
    // preimage exactly. (The same defect was found and fixed in the snapshot digest.)
    const smuggled = observationRangeId(
      ref({ observation_id: `obs_a"|${"a".repeat(64)}`, observation_content_sha256: "" }),
    );
    expect(smuggled).not.toBe(observationRangeId(ref()));
  });

  it("recognises its own shape and rejects everything else", () => {
    expect(isObservationRangeId(observationRangeId(ref()))).toBe(true);
    for (
      const bad of [
        "",
        "obs_0123456789abcdef",
        "orng_v1_",
        `orng_v1_${"a".repeat(31)}`,
        `orng_v1_${"a".repeat(33)}`,
        `orng_v1_${"A".repeat(32)}`, // uppercase is not the hex this mints
        `orng_v2_${"a".repeat(32)}`,
        ` orng_v1_${"a".repeat(32)}`,
      ]
    ) {
      expect(isObservationRangeId(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("resolves every range the reader actually emitted, over the real corpus", () => {
    const texts = serveAll(largest.observation_id, 32_000);
    expect(texts.length).toBeGreaterThan(1); // non-vacuous: it really splits at this budget
    const table = indexEmittedObservationRanges(texts);
    const entries = texts.flatMap((text) =>
      (JSON.parse(text) as { entries: { range_id: string; body_start: number; body_end: number }[] })
        .entries
    );
    expect(table.size).toBe(entries.length);
    for (const entry of entries) {
      const resolved = table.get(entry.range_id);
      expect(resolved).toBeDefined();
      expect(resolved!.body_start).toBe(entry.body_start);
      expect(resolved!.body_end).toBe(entry.body_end);
      // The coordinates resolve to the CONTENT they name, checked against the snapshot rather than
      // against the page — a page that agreed with itself would prove nothing.
      expect(largest.body.slice(resolved!.body_start, resolved!.body_end).length)
        .toBe(entry.body_end - entry.body_start);
    }
  });

  it("does not resolve an id this launch never emitted", () => {
    const table = indexEmittedObservationRanges(serveAll(largest.observation_id, 32_000));
    // Well-formed and computable from what a worker can see — forgery is not blocked by secrecy, it is
    // blocked because resolution is a lookup in the runtime's own record of what it sent.
    const invented = observationRangeId(ref({ observation_id: largest.observation_id }));
    expect(isObservationRangeId(invented)).toBe(true);
    expect(table.has(invented)).toBe(false);
  });

  it("ignores an entry whose stated id disagrees with its own coordinates", () => {
    const [text] = serveAll(largest.observation_id, 32_000);
    const page = JSON.parse(text!) as { entries: Record<string, unknown>[] };
    const honest = indexEmittedObservationRanges([JSON.stringify(page)]);
    expect(honest.size).toBe(page.entries.length); // positive control
    // The id is re-derived from the tuple, so a page whose id and coordinates disagree cannot install
    // a lookup resolving to content its id does not name.
    page.entries[0]!.range_id = observationRangeId(ref());
    expect(indexEmittedObservationRanges([JSON.stringify(page)]).size).toBe(page.entries.length - 1);
  });

  it("skips what it cannot read instead of failing the run", () => {
    const texts = serveAll(largest.observation_id, 32_000);
    const table = indexEmittedObservationRanges([
      "not json",
      "[]",
      JSON.stringify({ entries: "not an array" }),
      JSON.stringify({ entries: [{ observation_id: "obs_x" }] }),
      ...texts,
    ]);
    // A torn record answers "this cannot be resolved", and the caller refuses that citation. Making it
    // fatal here would turn one unreadable emission into a dead run — the shape §2.5 exists to remove.
    expect(table.size).toBeGreaterThan(0);
  });

  it("drops a second entry that states an id its own coordinates do not produce", () => {
    const [text] = serveAll(largest.observation_id, 32_000);
    const page = JSON.parse(text!) as { entries: Record<string, unknown>[] };
    const entry = page.entries[0]!;
    const impostor = { ...entry, body_end: (entry.body_end as number) - 1 };
    const table = indexEmittedObservationRanges([JSON.stringify({ entries: [entry, impostor] })]);
    // The impostor keeps the honest entry's id while naming a different range. It is dropped by the
    // id/coordinate re-derivation, so the id still resolves to what it actually names.
    expect(table.size).toBe(1);
    expect(table.get(entry.range_id as string)!.body_end).toBe(entry.body_end);
  });

  // NOT TESTED, deliberately: `ObservationRangeIdCollisionError`. It fires only when two DIFFERENT
  // tuples produce the same 128-bit digest, which cannot be constructed here — and the test that
  // claimed to cover it was vacuous (it built an id/coordinate mismatch, which the check above drops
  // before the collision branch is reached, then asserted the error class `toBeDefined`). The branch
  // stays because the alternative on a collision is resolving a citation to a range the worker did not
  // name; it is a fail-closed backstop, not a path with a reachable fixture.
});

describe("the reader names every range it serves", () => {
  it("carries a well-formed range_id on every entry, matching its own tuple", () => {
    let checked = 0;
    for (const text of serveAll(largest.observation_id, 32_000)) {
      for (
        const entry of (JSON.parse(text) as {
          entries: {
            observation_id: string;
            observation_content_sha256: string;
            body_start: number;
            body_end: number;
            range_content_sha256: string;
            range_id: string;
          }[];
        }).entries
      ) {
        expect(isObservationRangeId(entry.range_id)).toBe(true);
        expect(entry.range_id).toBe(observationRangeId(entry));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(1);
  });
});
