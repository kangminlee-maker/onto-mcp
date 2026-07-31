import { describe, expect, it } from "vitest";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { ReconstructSourceSafetyLedgerArtifact } from "./artifact-types.js";
import {
  assertObservationSnapshotUnchanged,
  fixObservationSnapshot,
  envelopeContentCost,
  jsonStringContentCost,
  OBSERVATION_READ_MAX_ID_CHARS,
  OBSERVATION_READ_MAX_REQUEST_IDS,
  ObservationReadError,
  observationReadToolResult,
  readObservationPage,
  type ObservationReadPage,
  type ObservationReadRequest,
  type ObservationSnapshot,
} from "./observation-read.js";
// The LIVE budget, imported rather than restated: a test that pins its own number would keep passing
// after the runtime's value moved, which is how the page-vs-result defect survived its own gate.
import { OBSERVATION_READ_RESULT_CHAR_BUDGET } from "./observation-read-grant.js";

// Spec basis: development-records/design/20260726-observation-catalog-tool-design.md §4 (contract),
// §9 Stage 1 done-when — (i) reassembled pages are byte-identical to the source, (ii) every response is
// at or under the budget, (iii) an OVERSIZED SCALAR negative control proves the split path is not
// vacuous, (iv) the fixture is asserted non-empty with non-empty structural_data BEFORE anything is
// concluded from it.
//
// The fixture is the REAL artifact of the 59-file value bench (2026-07-26), preserved verbatim from a
// gitignored session directory — see scripts/fixtures/observation-catalog/PROVENANCE.md. Synthetic
// observations appear only where the real corpus cannot supply the case (astral text, malformed
// artifacts).

const FIXTURE = path.resolve(
  __dirname,
  "../../../scripts/fixtures/observation-catalog/source-observations.yaml",
);

const artifactText = readFileSync(FIXTURE, "utf8");
const artifact = parseYaml(artifactText) as {
  session_id: string;
  observations: Array<Record<string, unknown>>;
};

/**
 * A source-safety ledger admitting every observation the given artifact carries.
 *
 * `fixObservationSnapshot` requires a ledger — the consumption gate is part of constructing a snapshot, so
 * an ungated one cannot be built (design §3.1). These tests are about the READER, so they hand it a ledger
 * that withholds nothing; the gate's own behaviour is exercised in `observation-read-grant.test.ts` and by
 * the one withholding case below. Derived from the artifact rather than hard-coded so it stays correct as
 * fixtures change, and tolerant of malformed input because several tests below feed exactly that.
 */
function admitAll(text: string): ReconstructSourceSafetyLedgerArtifact {
  let document: unknown;
  try {
    document = parseYaml(text) as unknown;
  } catch {
    document = undefined;
  }
  const record = (document ?? {}) as { session_id?: unknown; observations?: unknown };
  const ids = Array.isArray(record.observations)
    ? record.observations.flatMap((observation) => {
      const id = (observation as { observation_id?: unknown } | null)?.observation_id;
      return typeof id === "string" ? [id] : [];
    })
    : [];
  return admittingLedger(
    typeof record.session_id === "string" ? record.session_id : "session",
    ids,
  );
}

function admittingLedger(
  sessionId: string,
  admittedIds: readonly string[],
  withheldIds: readonly string[] = [],
): ReconstructSourceSafetyLedgerArtifact {
  const row = (
    id: string,
    tier: "consumption_allowed" | "no_prompt_use",
  ): ReconstructSourceSafetyLedgerArtifact["safety_rows"][number] => ({
    safety_row_id: `source_safety:${id}:prompt_context`,
    subject_ref: `/tmp/${id}.ts`,
    subject_kind: "source_ref",
    lifecycle_state: "active",
    authorization_state: "authorized",
    proof_sufficiency_state: "sufficient_for_claim",
    replay_state: "replay_allowed",
    visibility_tier: tier,
    visibility_derivation: {
      intended_consumption: "prompt_context",
      derived_from_axes: ["lifecycle_state"],
      derivation_rule_ref: "test",
    },
    authorization_scope_ref: null,
    tombstone: { tombstone_ref: null, reason: null, retired_at: null, downstream_refs: [] },
    limitation_refs: [],
  });
  return {
    schema_version: "1",
    session_id: sessionId,
    created_at: "2026-07-26T00:00:00.000Z",
    source_observations_ref: null,
    safety_rows: [
      ...admittedIds.map((id) => row(id, "consumption_allowed")),
      ...withheldIds.map((id) => row(id, "no_prompt_use")),
    ],
  };
}

const fixSnapshotAdmittingAll = (text: string): ObservationSnapshot =>
  fixObservationSnapshot(text, admitAll(text));

const snapshot = fixSnapshotAdmittingAll(artifactText);
const allIds = artifact.observations.map((observation) => observation.observation_id as string);

/** A realistic per-response ceiling, small enough that the corpus needs many pages. */
const PAGE_BUDGET = 65_536;
/** Larger than any escaped body in the corpus — the contrast arm where nothing splits. */
const UNBOUNDED_BUDGET = 8_000_000;

/** The largest single string value anywhere in the corpus, and the observation holding it. */
const largestScalar = ((): { observationId: string; serialized: string } => {
  let best = { observationId: "", serialized: "" };
  const walkValue = (value: unknown, observationId: string): void => {
    if (typeof value === "string") {
      const serialized = JSON.stringify(value);
      if (serialized.length > best.serialized.length) best = { observationId, serialized };
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walkValue(item, observationId);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) walkValue(item, observationId);
    }
  };
  for (const observation of artifact.observations) {
    walkValue(observation, observation.observation_id as string);
  }
  return best;
})();

/** The failure `reason` a call produced, or "no-error" — keeps every rejection assertion one shape. */
function reasonOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof ObservationReadError ? error.reason : `unexpected:${String(error)}`;
  }
  return "no-error";
}

function walk(
  fromSnapshot: ObservationSnapshot,
  ids: readonly string[],
  resultCharBudget: number,
): ObservationReadPage[] {
  const pages: ObservationReadPage[] = [];
  let request: ObservationReadRequest = { observation_ids: ids };
  for (;;) {
    const page = readObservationPage({ snapshot: fromSnapshot, request, resultCharBudget });
    pages.push(page);
    if (page.next_cursor === undefined) return pages;
    request = { cursor: page.next_cursor };
    if (pages.length > 10_000) throw new Error("cursor walk did not terminate");
  }
}

/** Concatenate every page's entries per observation, asserting the parts arrive in order, exactly once. */
function reassemble(pages: readonly ObservationReadPage[]): Map<string, string> {
  const parts = new Map<string, string[]>();
  const declaredCount = new Map<string, number>();
  for (const page of pages) {
    for (const entry of page.entries) {
      const bucket = parts.get(entry.observation_id) ?? [];
      // A gap or a repeat would make a byte-identical concatenation an accident, not a property.
      expect(entry.part_index).toBe(bucket.length + 1);
      expect(entry.part_index).toBeLessThanOrEqual(entry.part_count);
      // Keep the FIRST declared count and hold every later page to it. Overwriting instead would let
      // pages of one observation disagree about part_count and still satisfy the final size check —
      // cross-family review demonstrated exactly that hole in this helper.
      const declared = declaredCount.get(entry.observation_id);
      if (declared === undefined) declaredCount.set(entry.observation_id, entry.part_count);
      else expect(entry.part_count).toBe(declared);
      bucket.push(entry.body);
      parts.set(entry.observation_id, bucket);
    }
  }
  for (const [id, bucket] of parts) expect(bucket.length).toBe(declaredCount.get(id));
  return new Map([...parts].map(([id, bucket]) => [id, bucket.join("")]));
}

function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** No lone surrogate — the split must never tear a pair (String.isWellFormed is newer than the lib target). */
function isWellFormed(text: string): boolean {
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
}

describe("fixture preconditions — the subject set must be non-empty before anything is concluded", () => {
  it("carries observations, each with non-empty structural_data", () => {
    expect(artifact.observations.length).toBeGreaterThan(0);
    for (const observation of artifact.observations) {
      const structural = observation.structural_data as Record<string, unknown> | undefined;
      expect(structural).toBeTruthy();
      expect(Object.keys(structural ?? {}).length).toBeGreaterThan(0);
    }
    expect(snapshot.entries.length).toBe(artifact.observations.length);
    expect(snapshot.session_id).toBe(artifact.session_id);
  });

  it("contains an observation larger than a page AND a single scalar larger than a page", () => {
    // Without both, the split path and the oversized-scalar control below would pass vacuously.
    expect(Math.max(...snapshot.entries.map((entry) => entry.body.length))).toBeGreaterThan(PAGE_BUDGET);
    expect(largestScalar.serialized.length).toBeGreaterThan(PAGE_BUDGET);
  });
});

describe("readObservationPage — deterministic bounded pages over the real corpus", () => {
  it("reassembles byte-identically and every page stays at or under the budget", () => {
    const idBatches = batches(allIds, OBSERVATION_READ_MAX_REQUEST_IDS);
    let pageCount = 0;
    for (const ids of idBatches) {
      const pages = walk(snapshot, ids, PAGE_BUDGET);
      pageCount += pages.length;
      for (const page of pages) {
        expect(page.snapshot_digest).toBe(snapshot.snapshot_digest);
        expect(page.entries.length).toBeGreaterThan(0);
        // The transport measure, not a raw-body estimate: JSON escaping is inside the ceiling.
        expect(JSON.stringify(page).length).toBeLessThanOrEqual(PAGE_BUDGET);
      }
      const rebuilt = reassemble(pages);
      expect([...rebuilt.keys()].sort()).toEqual([...ids].sort());
      for (const id of ids) {
        expect(rebuilt.get(id)).toBe(snapshot.lookup(id)?.body);
      }
    }
    // The walk actually paged; a single page per batch would exercise no cursor at all.
    expect(pageCount).toBeGreaterThan(idBatches.length);
  });

  it("delivers the observation the artifact holds, not a reshaped projection", () => {
    const ids = allIds.slice(0, OBSERVATION_READ_MAX_REQUEST_IDS);
    const rebuilt = reassemble(walk(snapshot, ids, PAGE_BUDGET));
    for (const id of ids) {
      expect(JSON.parse(rebuilt.get(id) as string)).toEqual(
        artifact.observations.find((observation) => observation.observation_id === id),
      );
    }
  });

  it("splits INSIDE an oversized scalar — a field-boundary split would not (negative control)", () => {
    const id = largestScalar.observationId;
    const body = snapshot.lookup(id)?.body as string;
    const scalarStart = body.indexOf(largestScalar.serialized);
    // Precondition: the scalar really is present verbatim in the served body.
    expect(scalarStart).toBeGreaterThanOrEqual(0);
    const scalarEnd = scalarStart + largestScalar.serialized.length;

    const parts = walk(snapshot, [id], PAGE_BUDGET)
      .flatMap((page) => page.entries)
      .map((entry) => entry.body);
    expect(parts.length).toBeGreaterThan(1);
    const boundaries: number[] = [];
    let offset = 0;
    for (const part of parts.slice(0, -1)) {
      offset += part.length;
      boundaries.push(offset);
    }
    expect(boundaries.filter((at) => at > scalarStart && at < scalarEnd).length).toBeGreaterThan(0);
  });

  it("does not split what fits — contrast control at both ends", () => {
    // Same budget, smallest observation: one part. Splitting responds to size, it is not a constant.
    const smallest = [...snapshot.entries].sort((a, b) => a.body.length - b.body.length)[0];
    const smallPages = walk(snapshot, [smallest?.observation_id as string], PAGE_BUDGET);
    expect(smallPages).toHaveLength(1);
    expect(smallPages[0]?.entries).toHaveLength(1);
    expect(smallPages[0]?.entries[0]?.part_count).toBe(1);
    expect(smallPages[0]?.next_cursor).toBeUndefined();

    // Budget above every escaped body: the largest observation also arrives whole.
    const largePages = walk(snapshot, [largestScalar.observationId], UNBOUNDED_BUDGET);
    expect(largePages).toHaveLength(1);
    expect(largePages[0]?.entries[0]?.part_count).toBe(1);
  });

  it("serves entries in the caller's id order", () => {
    const ids = [allIds[3], allIds[0], allIds[1]] as string[];
    const served: string[] = [];
    for (const entry of walk(snapshot, ids, PAGE_BUDGET).flatMap((page) => page.entries)) {
      if (served[served.length - 1] !== entry.observation_id) served.push(entry.observation_id);
    }
    expect(served).toEqual(ids);
  });

  it("is deterministic — the same request yields the same pages", () => {
    const ids = allIds.slice(0, 4);
    expect(JSON.stringify(walk(snapshot, ids, PAGE_BUDGET))).toBe(
      JSON.stringify(walk(snapshot, ids, PAGE_BUDGET)),
    );
  });
});

describe("snapshot integrity — a mid-run rewrite must fail, not silently switch content", () => {
  const mutatedText = stringifyYaml({
    ...artifact,
    observations: artifact.observations.slice(0, artifact.observations.length - 1),
  });
  const firstPage = readObservationPage({
    snapshot,
    request: { observation_ids: [largestScalar.observationId] },
    resultCharBudget: PAGE_BUDGET,
  });

  it("issues a cursor for a body that does not fit (precondition for the two rejections below)", () => {
    expect(firstPage.next_cursor).toBeDefined();
  });

  it("rejects a cursor issued against a different snapshot", () => {
    const drifted = fixSnapshotAdmittingAll(mutatedText);
    expect(drifted.snapshot_digest).not.toBe(snapshot.snapshot_digest);
    expect(
      reasonOf(() =>
        readObservationPage({
          snapshot: drifted,
          request: { cursor: firstPage.next_cursor as string },
          resultCharBudget: PAGE_BUDGET,
        }),
      ),
    ).toBe("snapshot_drift");
  });

  it("rejects a cursor replayed at a different page budget", () => {
    // A different budget re-splits the bodies, so the cursor's part coordinate no longer means the same.
    expect(
      reasonOf(() =>
        readObservationPage({
          snapshot,
          request: { cursor: firstPage.next_cursor as string },
          resultCharBudget: PAGE_BUDGET / 2,
        }),
      ),
    ).toBe("cursor_malformed");
  });

  it("assertObservationSnapshotUnchanged tolerates a reformat but catches a content change", () => {
    const reformatted = stringifyYaml(artifact, { lineWidth: 40 });
    // Precondition: the reformat really did change the bytes, so the tolerance is not vacuous.
    expect(reformatted).not.toBe(artifactText);
    expect(reasonOf(() => assertObservationSnapshotUnchanged(snapshot, reformatted, admitAll(reformatted))))
      .toBe("no-error");
    expect(reasonOf(() => assertObservationSnapshotUnchanged(snapshot, mutatedText, admitAll(mutatedText))))
      .toBe("snapshot_drift");
  });
});

describe("request shape — safety by unrepresentability, checked at the boundary", () => {
  it("refuses anything but exactly one of observation_ids / cursor", () => {
    expect(reasonOf(() => readObservationPage({ snapshot, request: {}, resultCharBudget: PAGE_BUDGET })))
      .toBe("request_shape");
    expect(
      reasonOf(() =>
        readObservationPage({
          snapshot,
          request: { observation_ids: [allIds[0] as string], cursor: "x" },
          resultCharBudget: PAGE_BUDGET,
        }),
      ),
    ).toBe("request_shape");
  });

  it("refuses an empty, over-cap, blank or repeated id list — and admits exactly the cap", () => {
    const rejected: ReadonlyArray<readonly string[]> = [
      [],
      Array.from({ length: OBSERVATION_READ_MAX_REQUEST_IDS + 1 }, () => allIds[0] as string),
      [" "],
      [allIds[0] as string, allIds[0] as string],
    ];
    for (const observation_ids of rejected) {
      expect(
        reasonOf(() =>
          readObservationPage({ snapshot, request: { observation_ids }, resultCharBudget: PAGE_BUDGET }),
        ),
      ).toBe("request_shape");
    }
    expect(
      reasonOf(() =>
        readObservationPage({
          snapshot,
          request: { observation_ids: allIds.slice(0, OBSERVATION_READ_MAX_REQUEST_IDS) },
          resultCharBudget: PAGE_BUDGET,
        }),
      ),
    ).toBe("no-error");
  });

  it("refuses an id outside the snapshot without disclosing whether it exists elsewhere", () => {
    expect(
      reasonOf(() =>
        readObservationPage({
          snapshot,
          request: { observation_ids: ["obs_not_in_this_snapshot"] },
          resultCharBudget: PAGE_BUDGET,
        }),
      ),
    ).toBe("unknown_observation_id");
  });

  it("caps an id's length, and does not echo the oversized id back", () => {
    // Without the cap, an unresolvable 200,000-char id produced a ~200,000-char failure message, which the
    // grant layer charged as a fixed 1,024 while the text still occupied the worker's context
    // (cross-family review). The bound makes the message small AND keeps the accounting honest.
    const oversized = "z".repeat(OBSERVATION_READ_MAX_ID_CHARS + 1);
    const attempt = (): unknown =>
      readObservationPage({
        snapshot,
        request: { observation_ids: [oversized] },
        resultCharBudget: PAGE_BUDGET,
      });
    expect(reasonOf(attempt)).toBe("request_shape");
    let message = "";
    try {
      attempt();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(oversized);
    expect(message.length).toBeLessThan(200);
    // Contrast: an id AT the cap is a shape-legal request that fails only because it resolves to nothing.
    expect(
      reasonOf(() =>
        readObservationPage({
          snapshot,
          request: { observation_ids: ["z".repeat(OBSERVATION_READ_MAX_ID_CHARS)] },
          resultCharBudget: PAGE_BUDGET,
        })
      ),
    ).toBe("unknown_observation_id");
  });

  it("refuses a malformed or out-of-range cursor", () => {
    expect(
      reasonOf(() =>
        readObservationPage({ snapshot, request: { cursor: "!!!" }, resultCharBudget: PAGE_BUDGET }),
      ),
    ).toBe("cursor_malformed");
    const pastTheEnd = Buffer.from(
      JSON.stringify({
        v: 1,
        d: snapshot.snapshot_digest,
        b: PAGE_BUDGET,
        ids: [allIds[0] as string],
        o: 0,
        p: 9_999,
      }),
      "utf8",
    ).toString("base64url");
    expect(
      reasonOf(() =>
        readObservationPage({ snapshot, request: { cursor: pastTheEnd }, resultCharBudget: PAGE_BUDGET }),
      ),
    ).toBe("cursor_malformed");
  });

  it("a forged cursor can only narrow what it receives, never widen it", () => {
    // The cursor is a client-held coordinate, not an authorization (see the module's boundary note). What
    // must hold is that no hand-built cursor reaches content a direct request could not: outside the
    // snapshot, or past the id cap.
    const forge = (payload: Record<string, unknown>): string =>
      Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    // The version is READ BACK from a cursor the reader just issued, not written down here. This test is
    // about forgery narrowing, not about versioning: pinning a literal would make it fail on every
    // version bump for a reason that has nothing to do with what it checks (it did, on the S1 bump).
    const issued = readObservationPage({
      snapshot,
      request: { observation_ids: [largestScalar.observationId] },
      resultCharBudget: PAGE_BUDGET,
    }).next_cursor as string;
    const currentVersion = (
      JSON.parse(Buffer.from(issued, "base64url").toString("utf8")) as { v: number }
    ).v;
    const base = { v: currentVersion, d: snapshot.snapshot_digest, b: PAGE_BUDGET, o: 0, p: 0 };
    expect(
      reasonOf(() =>
        readObservationPage({
          snapshot,
          request: { cursor: forge({ ...base, ids: ["obs_not_in_this_snapshot"] }) },
          resultCharBudget: PAGE_BUDGET,
        }),
      ),
    ).toBe("unknown_observation_id");
    expect(
      reasonOf(() =>
        readObservationPage({
          snapshot,
          request: {
            cursor: forge({
              ...base,
              ids: Array.from({ length: OBSERVATION_READ_MAX_REQUEST_IDS + 1 }, (_, i) => allIds[i]),
            }),
          },
          resultCharBudget: PAGE_BUDGET,
        }),
      ),
    ).toBe("request_shape");
    // Skipping forward within one's own request IS reachable, and stays bounded by that request.
    const skipped = readObservationPage({
      snapshot,
      request: { cursor: forge({ ...base, ids: [largestScalar.observationId], p: 1 }) },
      resultCharBudget: PAGE_BUDGET,
    });
    expect(skipped.entries[0]?.part_index).toBe(2);
    expect(skipped.entries.every((entry) => entry.observation_id === largestScalar.observationId)).toBe(
      true,
    );
  });

  it("refuses a budget too small to carry any content", () => {
    expect(
      reasonOf(() =>
        readObservationPage({
          snapshot,
          request: { observation_ids: [allIds[0] as string] },
          resultCharBudget: 64,
        }),
      ),
    ).toBe("budget_too_small");
  });
});

describe("fixObservationSnapshot — fail loud on an artifact the reader cannot serve", () => {
  const syntheticArtifact = (
    observations: unknown[],
    overrides: Record<string, unknown> = {},
  ): string =>
    stringifyYaml({
      schema_version: "1",
      session_id: "session",
      created_at: "2026-07-26T00:00:00.000Z",
      observations,
      skipped_refs: [],
      validation_results: [],
      ...overrides,
    });

  const observation = (id: string, structural: Record<string, unknown> = { k: "v" }): unknown => ({
    observation_id: id,
    target_material_kind: "code",
    adapter_id: "test-adapter",
    source_ref: "/tmp/a.ts",
    location: "/tmp/a.ts",
    summary: "code material observed at a.ts",
    structural_data: structural,
  });

  it("accepts a well-formed artifact (the control for the rejections below)", () => {
    expect(reasonOf(() => fixSnapshotAdmittingAll(syntheticArtifact([observation("obs_a"), observation("obs_b")]))))
      .toBe("no-error");
  });

  it("applies the consumption gate: a withheld observation never enters the snapshot", () => {
    // The gate lives in the CONSTRUCTOR (design §3.1), so there is no ungated snapshot for the reader to
    // be handed. Contrast arm: the same artifact with both ids admitted serves obs_b fine.
    const text = syntheticArtifact([observation("obs_a"), observation("obs_b")]);
    const gated = fixObservationSnapshot(text, admittingLedger("session", ["obs_a"], ["obs_b"]));
    expect(gated.entries.map((entry) => entry.observation_id)).toEqual(["obs_a"]);
    expect(gated.withheld_observation_count).toBe(1);
    expect(gated.lookup("obs_b")).toBeUndefined();
    expect(
      reasonOf(() =>
        readObservationPage({
          snapshot: gated,
          request: { observation_ids: ["obs_b"] },
          resultCharBudget: PAGE_BUDGET,
        })
      ),
    ).toBe("unknown_observation_id");

    const ungated = fixSnapshotAdmittingAll(text);
    expect(ungated.entries.map((entry) => entry.observation_id)).toEqual(["obs_a", "obs_b"]);
    expect(ungated.withheld_observation_count).toBe(0);
    // The gate rotates the digest, so a cursor from one projection is refused by the other.
    expect(gated.snapshot_digest).not.toBe(ungated.snapshot_digest);
  });

  it("rejects a ledger from a different session instead of gating on its decisions", () => {
    const text = syntheticArtifact([observation("obs_a")]);
    expect(reasonOf(() => fixObservationSnapshot(text, admittingLedger("other-session", ["obs_a"]))))
      .toBe("artifact_malformed");
    expect(reasonOf(() => fixObservationSnapshot(text, admittingLedger("session", ["obs_a"]))))
      .toBe("no-error");
  });

  it("rejects a duplicate observation_id — an id must resolve to exactly one observation", () => {
    expect(
      reasonOf(() => fixSnapshotAdmittingAll(syntheticArtifact([observation("obs_a"), observation("obs_a")]))),
    ).toBe("duplicate_observation_id");
  });

  it("rejects a missing session_id, a blank id, a non-mapping document and a non-array observations", () => {
    expect(
      reasonOf(() => fixSnapshotAdmittingAll(syntheticArtifact([observation("obs_a")], { session_id: "" }))),
    ).toBe("artifact_malformed");
    expect(reasonOf(() => fixSnapshotAdmittingAll(syntheticArtifact([observation(" ")])))).toBe(
      "artifact_malformed",
    );
    expect(reasonOf(() => fixSnapshotAdmittingAll("- a\n- b\n"))).toBe("artifact_malformed");
    expect(reasonOf(() => fixSnapshotAdmittingAll("session_id: s\nobservations: 3\n"))).toBe(
      "artifact_malformed",
    );
  });

  it("rejects a value with no faithful JSON projection instead of serving it as null", () => {
    expect(
      reasonOf(() => fixSnapshotAdmittingAll(syntheticArtifact([observation("obs_a", { count: NaN })]))),
    ).toBe("artifact_malformed");
    expect(
      reasonOf(() =>
        fixSnapshotAdmittingAll(syntheticArtifact([observation("obs_a", { count: Infinity })])),
      ),
    ).toBe("artifact_malformed");
    // -0 survives YAML and dies in JSON: the served body would say 0, and flipping the artifact from
    // -0 to 0 would not rotate the digest. Positive zero must still pass (contrast control).
    expect(
      reasonOf(() => fixSnapshotAdmittingAll(syntheticArtifact([observation("obs_a", { count: -0 })]))),
    ).toBe("artifact_malformed");
    expect(
      reasonOf(() => fixSnapshotAdmittingAll(syntheticArtifact([observation("obs_a", { count: 0 })]))),
    ).toBe("no-error");
  });

  it("cannot be edited in place once fixed — the snapshot is frozen, not merely promised", () => {
    const fixed = fixSnapshotAdmittingAll(syntheticArtifact([observation("obs_a")]));
    const entry = fixed.lookup("obs_a") as { body: string };
    // A writable entry would let a caller swap a body between pages while snapshot_digest — and
    // assertObservationSnapshotUnchanged, which compares that stored scalar — still reported clean.
    expect(() => {
      entry.body = "tampered";
    }).toThrow(TypeError);
    expect(fixed.lookup("obs_a")?.body).not.toBe("tampered");
    expect(Object.isFrozen(fixed.entries)).toBe(true);
  });

  it("digests an injective encoding — a separator inside a field cannot forge another snapshot", () => {
    // Negative control for the digest preimage: snapshot B's session_id reproduces snapshot A's
    // "<session>\n<id> <hash>" line, so a delimiter-joined preimage would make the two indistinguishable
    // and let A's cursors read B. Reproduced by cross-family review against the earlier encoding.
    const twoEntries = fixSnapshotAdmittingAll(
      syntheticArtifact([observation("obs_a"), observation("obs_b")]),
    );
    const hashOfA = twoEntries.entries.find((e) => e.observation_id === "obs_a")
      ?.observation_content_sha256 as string;
    const forged = fixSnapshotAdmittingAll(
      syntheticArtifact([observation("obs_b")], { session_id: `session\nobs_a ${hashOfA}` }),
    );
    expect(forged.snapshot_digest).not.toBe(twoEntries.snapshot_digest);
    expect(twoEntries.entries).toHaveLength(2);
    expect(forged.entries).toHaveLength(1);
  });

  it("digests content, not artifact order — stable on reorder, rotated on change", () => {
    const forward = fixSnapshotAdmittingAll(
      syntheticArtifact([observation("obs_a"), observation("obs_b")]),
    );
    const reversed = fixSnapshotAdmittingAll(
      syntheticArtifact([observation("obs_b"), observation("obs_a")]),
    );
    expect(reversed.snapshot_digest).toBe(forward.snapshot_digest);
    const changed = fixSnapshotAdmittingAll(
      syntheticArtifact([observation("obs_a"), observation("obs_b", { k: "w" })]),
    );
    expect(changed.snapshot_digest).not.toBe(forward.snapshot_digest);
  });
});

describe("serialized-cost model — the arithmetic the page budget rests on", () => {
  it("is exact for EVERY code point, and for the adjacencies that could interact", () => {
    // Exhaustive over the whole domain (~51 ms) rather than a sample battery: this identity is what the
    // page budget's arithmetic rests on, and the escaping classes that surprise (U+007F and U+2028 are
    // NOT escaped; a lone surrogate IS) are exactly the ones a hand-picked battery tends to miss.
    let mismatches = 0;
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
      const text = String.fromCodePoint(codePoint);
      if (2 + jsonStringContentCost(text) !== JSON.stringify(text).length) mismatches += 1;
    }
    expect(mismatches).toBe(0);

    const interesting = [0x22, 0x5c, 0x08, 0x0a, 0x1f, 0x7f, 0x2028, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0x1f600];
    for (const first of interesting) {
      for (const second of interesting) {
        // A lone high followed by a lone low forms a PAIR, whose cost is 2 rather than 6+6 — the one
        // place a per-code-point model could disagree with the serializer.
        const text = String.fromCodePoint(first) + String.fromCodePoint(second);
        expect(2 + jsonStringContentCost(text)).toBe(JSON.stringify(text).length);
      }
    }

    // Negative control: a naive "one char, one unit" model must FAIL this harness, or the sweep above
    // proves nothing about the harness's ability to discriminate.
    const naive = (text: string): number => text.length;
    expect(
      interesting.filter(
        (codePoint) =>
          2 + naive(String.fromCodePoint(codePoint)) !==
          JSON.stringify(String.fromCodePoint(codePoint)).length,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("holds the budget when escaping nearly doubles the payload", () => {
    // The real corpus escapes lightly, so it cannot discriminate a reader that sizes parts by RAW
    // length from one that sizes them by SERIALIZED cost. Here every character costs 2 (measured below:
    // 120,163 chars → 220,193 serialized), so a raw-length reader would overflow every page.
    const nasty = '"\\\n'.repeat(20_000);
    const nastySnapshot = fixSnapshotAdmittingAll(
      stringifyYaml({
        schema_version: "1",
        session_id: "session",
        created_at: "2026-07-26T00:00:00.000Z",
        observations: [
          {
            observation_id: "obs_nasty",
            target_material_kind: "code",
            adapter_id: "test-adapter",
            source_ref: "/tmp/a.ts",
            location: "/tmp/a.ts",
            summary: "pathological escaping",
            structural_data: { blob: nasty },
          },
        ],
        skipped_refs: [],
        validation_results: [],
      }),
    );
    const body = nastySnapshot.lookup("obs_nasty")?.body as string;
    expect(jsonStringContentCost(body)).toBeGreaterThan(body.length * 1.5);

    const budget = 4_096;
    const pages = walk(nastySnapshot, ["obs_nasty"], budget);
    expect(pages.length).toBeGreaterThan(10);
    for (const page of pages) expect(JSON.stringify(page).length).toBeLessThanOrEqual(budget);
    const rebuilt = pages.flatMap((page) => page.entries).map((entry) => entry.body).join("");
    expect(rebuilt).toBe(body);
    expect((JSON.parse(rebuilt) as { structural_data: { blob: string } }).structural_data.blob).toBe(nasty);
  });

  it("never tears a surrogate pair across parts", () => {
    const text = "🙂".repeat(200) + '"\\\n' + "🧬".repeat(200);
    const astralSnapshot = fixSnapshotAdmittingAll(
      stringifyYaml({
        schema_version: "1",
        session_id: "session",
        created_at: "2026-07-26T00:00:00.000Z",
        observations: [
          {
            observation_id: "obs_astral",
            target_material_kind: "code",
            adapter_id: "test-adapter",
            source_ref: "/tmp/a.ts",
            location: "/tmp/a.ts",
            summary: "astral",
            structural_data: { text },
          },
        ],
        skipped_refs: [],
        validation_results: [],
      }),
    );
    const body = astralSnapshot.lookup("obs_astral")?.body as string;
    // 1,600 rather than the 800 this used to pass: the budget now bounds the RENDERED RESULT, which
    // carries the page twice, so the same decomposition needs twice the number. At 800 the framing alone
    // (76 result + 584 page + 836 entry = 1,496 rendered chars) exceeds the whole budget and the reader
    // refuses — correctly. 1,600 leaves 102 rendered chars per part, and an astral code point costs 4 of
    // them, so this body still splits 22 ways — as fine-grained as the 800 it replaces, which is what
    // puts a pair boundary in front of the cut over and over.
    const budget = 1_600;
    const pages = walk(astralSnapshot, ["obs_astral"], budget);
    const parts = pages.flatMap((page) => page.entries).map((entry) => entry.body);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(isWellFormed(part)).toBe(true);
      expect(2 + jsonStringContentCost(part)).toBe(JSON.stringify(part).length);
    }
    expect(parts.join("")).toBe(body);
    // The bound is on the RESULT, not the page: a page is roughly half its rendered cost, so asserting
    // the page against this number would pass on a reader that overran the budget twice over.
    for (const page of pages) {
      expect(JSON.stringify(observationReadToolResult(page)).length).toBeLessThanOrEqual(budget);
    }
  });
});

// ── Stage S1 of the RANGE contract (design 20260727 `23-…md` §3/S1).
//
// The unit of delivery and citation drops from "the whole observation" to a RANGE, so a page entry must
// carry the range it is — `[body_start, body_end)` into the observation's canonical body, plus a hash OF
// THAT SLICE. The offsets cannot be derived downstream: `splitBodyByJsonCost` cuts on JSON escape cost,
// `codePointJsonCost` is non-uniform, and the allowance depends on the request's id list. So the runtime
// states them, and these tests are what make "states them CORRECTLY" checkable.
describe("range contract — a page entry says which slice of the body it is", () => {
  const bodyOf = (id: string): string => snapshot.lookup(id)?.body as string;

  // Two budgets, because one budget is one partition: a rule that held only for the boundaries this
  // corpus happens to produce at 65,536 would be an artifact of the fixture, not a property.
  for (const budget of [PAGE_BUDGET, 32_000]) {
    it(`offsets partition every observation's body with no gap and no overlap (budget ${budget})`, () => {
      let observationsChecked = 0;
      let splitObservationsChecked = 0;
      for (const group of batches(allIds, OBSERVATION_READ_MAX_REQUEST_IDS)) {
        const entries = walk(snapshot, group, budget).flatMap((page) => page.entries);
        const byObservation = new Map<string, typeof entries>();
        for (const entry of entries) {
          byObservation.set(entry.observation_id, [
            ...(byObservation.get(entry.observation_id) ?? []),
            entry,
          ]);
        }
        for (const [id, parts] of byObservation) {
          observationsChecked += 1;
          if (parts.length > 1) splitObservationsChecked += 1;
          const body = bodyOf(id);
          let cursor = 0;
          for (const part of parts) {
            // Contiguous and forward: `body_start` picks up exactly where the previous part ended, so
            // the parts tile `[0, body.length)` — no gap to lose content in, no overlap to double-count.
            expect(part.body_start).toBe(cursor);
            expect(part.body_end).toBeGreaterThan(part.body_start);
            cursor = part.body_end;
          }
          expect(cursor).toBe(body.length);
        }
      }
      // The claim above is vacuous unless the corpus actually splits something at this budget.
      expect(observationsChecked).toBe(allIds.length);
      expect(splitObservationsChecked).toBeGreaterThan(0);
    });

    it(`range_content_sha256 covers the slice the offsets name, re-sliced from the body (budget ${budget})`, () => {
      let checked = 0;
      for (const group of batches(allIds, OBSERVATION_READ_MAX_REQUEST_IDS)) {
        for (const entry of walk(snapshot, group, budget).flatMap((page) => page.entries)) {
          const body = bodyOf(entry.observation_id);
          // The oracle re-slices the ORIGINAL body by the declared offsets rather than hashing
          // `entry.body`. Hashing the served text instead would be a tautology: shifting an internal
          // boundary by one character would still satisfy it, because both sides would move together.
          const slice = body.slice(entry.body_start, entry.body_end);
          expect(entry.body).toBe(slice);
          expect(entry.range_content_sha256).toBe(
            createHash("sha256").update(slice, "utf8").digest("hex"),
          );
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(allIds.length);
    });
  }

  // NOTE on framing parity (F-9). A test comparing `JSON.stringify(entry).length` against
  // `JSON.stringify({...entry, body: ""}).length + jsonStringContentCost(body)` looks like it proves the
  // reader's reservation covers every field — it does not. Both sides are built from the SAME emitted
  // entry, so it is a tautology about `JSON.stringify` that passes no matter what the reader reserved.
  // (It was written that way here first, and passed before the fields existed.) The real guard belongs
  // at the reader's own authority, where the reserved shape and the emitted shape are different values:
  // `readObservationPage` now checks each entry's exact serialized cost against the framing it reserved
  // and fails loud on a mismatch. The page-budget assertion below is the input-dependent backstop.

  it("refuses a cursor issued before the range contract existed", () => {
    // The cursor binds the snapshot digest and the PAGE BUDGET — not the allowance. S1 leaves the budget
    // alone and grows the entry framing, so a pre-S1 cursor passes both existing checks and then resumes
    // into a DIFFERENT decomposition: same `p`, different boundary. Only a version bump refuses it.
    //
    // The id must be one that really splits at this budget: with a single-part observation, `p: 1` is
    // past the end and `cursor_malformed` comes from the bounds check instead — a control that passes
    // whether or not the version was ever bumped. (It did, the first time this was written.)
    const splitting = largestScalar.observationId;
    expect(
      readObservationPage({
        snapshot,
        request: { observation_ids: [splitting] },
        resultCharBudget: PAGE_BUDGET,
      }).next_cursor,
    ).toBeDefined();
    const stale = Buffer.from(
      JSON.stringify({ v: 1, d: snapshot.snapshot_digest, b: PAGE_BUDGET, ids: [splitting], o: 0, p: 1 }),
      "utf8",
    ).toString("base64url");
    expect(
      reasonOf(() =>
        readObservationPage({ snapshot, request: { cursor: stale }, resultCharBudget: PAGE_BUDGET })
      ),
    ).toBe("cursor_malformed");
  });

  it("still issues cursors this reader accepts back", () => {
    // The negative control above must not be passing because ALL cursors are refused.
    const first = readObservationPage({
      snapshot,
      request: { observation_ids: [largestScalar.observationId] },
      resultCharBudget: PAGE_BUDGET,
    });
    expect(first.next_cursor).toBeDefined();
    const second = readObservationPage({
      snapshot,
      request: { cursor: first.next_cursor as string },
      resultCharBudget: PAGE_BUDGET,
    });
    expect(second.entries[0]?.body_start).toBe(
      first.entries[first.entries.length - 1]?.body_end,
    );
  });
});

describe("rendered-result cost model — the quantity the transport actually clips", () => {
  /**
   * Where every truncated received record landed, measured across a 22-rollout sweep of one day's real
   * codex transcripts (development-records/benchmark/20260731-range-delivery-live-probe/ §3차). The
   * budget must sit below this, and the corpus must produce pages that come close to the budget —
   * otherwise "everything fits" is a statement about small pages, not about the sizing.
   */
  const MEASURED_CLIP_CHARS = 40_149;

  it("is exact for EVERY code point, the way the page cost model is", () => {
    // Same standard as `jsonStringContentCost` above, for the same reason: `codePointEnvelopeCost` is a
    // hand-derived table over the serializer's escaping classes, and a wrong row UNDER-reserves — the
    // page fits its budget, ships, and is clipped in transit with nothing to show it. Exhaustive rather
    // than a battery because the rows that surprise (U+007F is not escaped, a lone surrogate is, an
    // astral pair is two raw units) are the ones a battery misses.
    //
    // The identity: a code point's rendered cost is what its PAGE representation costs re-escaped, plus
    // that representation's own length — because the result carries the page escaped AND plain.
    let mismatches = 0;
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
      const text = String.fromCodePoint(codePoint);
      const inPage = JSON.stringify(text).slice(1, -1);
      if (envelopeContentCost(text) !== jsonStringContentCost(inPage) + inPage.length) mismatches += 1;
    }
    expect(mismatches).toBe(0);

    // Adjacency: a lone high followed by a lone low forms a PAIR, the one place a per-code-point model
    // can disagree with the serializer.
    const interesting = [0x22, 0x5c, 0x08, 0x0a, 0x1f, 0x7f, 0x2028, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0x1f600];
    for (const first of interesting) {
      for (const second of interesting) {
        const text = String.fromCodePoint(first) + String.fromCodePoint(second);
        const inPage = JSON.stringify(text).slice(1, -1);
        expect(envelopeContentCost(text)).toBe(jsonStringContentCost(inPage) + inPage.length);
      }
    }

    // NEGATIVE CONTROL. "Twice the page cost" is the model a ratio would give, and it is wrong on every
    // escape class: `\n` costs 5 not 4, `\uXXXX` costs 13 not 12. If this harness cannot reject that
    // model, the sweep above proves nothing about its ability to discriminate.
    const doubled = (text: string): number => 2 * jsonStringContentCost(text);
    expect(
      interesting.filter((codePoint) => {
        const text = String.fromCodePoint(codePoint);
        return doubled(text) !== envelopeContentCost(text);
      }).length,
    ).toBeGreaterThan(0);
  });

  it("keeps every page of the real corpus inside the budget, and the budget under the measured clip", () => {
    expect(OBSERVATION_READ_RESULT_CHAR_BUDGET).toBeLessThan(MEASURED_CLIP_CHARS);
    expect(snapshot.entries.length).toBeGreaterThan(0); // non-vacuous subject set

    let largestRendered = 0;
    let largestPageChars = 0;
    for (const entry of snapshot.entries) {
      let cursor: string | undefined;
      for (;;) {
        const page: ObservationReadPage = readObservationPage({
          snapshot,
          request: cursor === undefined ? { observation_ids: [entry.observation_id] } : { cursor },
          resultCharBudget: OBSERVATION_READ_RESULT_CHAR_BUDGET,
        });
        const rendered = JSON.stringify(observationReadToolResult(page)).length;
        if (rendered > largestRendered) {
          largestRendered = rendered;
          largestPageChars = JSON.stringify(page).length;
        }
        cursor = page.next_cursor;
        if (cursor === undefined) break;
      }
    }
    expect(largestRendered).toBeLessThanOrEqual(OBSERVATION_READ_RESULT_CHAR_BUDGET);

    // NON-VACUOUS. A corpus that only ever produced 3 KB pages would satisfy the bound above while
    // saying nothing about whether the sizing is right. The budget has to actually bind.
    expect(largestRendered).toBeGreaterThan(OBSERVATION_READ_RESULT_CHAR_BUDGET * 0.9);

    // THE DEFECT, stated as a contrast. The result runs more than twice its page, so a budget that
    // bounded the PAGE at this value would have rendered past the clip — which is exactly what shipped
    // and what the live probe measured (a 29,236-char page, inside a 32,000 page budget, cut at 40,149).
    const ratio = largestRendered / largestPageChars;
    expect(ratio).toBeGreaterThan(2);
    expect(OBSERVATION_READ_RESULT_CHAR_BUDGET * ratio).toBeGreaterThan(MEASURED_CLIP_CHARS);
  });

  it("holds the budget when escaping makes the result three times the body", () => {
    // The real corpus escapes lightly (2.05-2.27x), so it cannot discriminate a reader that sizes by
    // page chars and doubles from one that counts rendered cost per character. Here every character is
    // `"` or `\` or a newline — the classes that cost 6, 6 and 5 rather than a flat 2x — so a doubling
    // model under-reserves and the page-level guard would fire.
    const nasty = '"\\\n'.repeat(20_000);
    const nastySnapshot = fixSnapshotAdmittingAll(
      stringifyYaml({
        schema_version: "1",
        session_id: "session",
        created_at: "2026-07-26T00:00:00.000Z",
        observations: [
          {
            observation_id: "obs_nasty",
            target_material_kind: "code",
            adapter_id: "test-adapter",
            source_ref: "/tmp/a.ts",
            location: "/tmp/a.ts",
            summary: "pathological escaping",
            structural_data: { blob: nasty },
          },
        ],
        skipped_refs: [],
        validation_results: [],
      }),
    );
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page: ObservationReadPage = readObservationPage({
        snapshot: nastySnapshot,
        request: cursor === undefined ? { observation_ids: ["obs_nasty"] } : { cursor },
        resultCharBudget: OBSERVATION_READ_RESULT_CHAR_BUDGET,
      });
      pages += 1;
      expect(JSON.stringify(observationReadToolResult(page)).length)
        .toBeLessThanOrEqual(OBSERVATION_READ_RESULT_CHAR_BUDGET);
      cursor = page.next_cursor;
      if (cursor === undefined) break;
    }
    // Non-vacuous: this body must really split, or the loop asserted one small page.
    expect(pages).toBeGreaterThan(1);
  });
});
