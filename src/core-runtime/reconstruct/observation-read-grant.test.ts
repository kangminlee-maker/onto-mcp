import { afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructSourceObservationsArtifact,
  ReconstructSourceSafetyLedgerArtifact,
} from "./artifact-types.js";
import { sourceObservationsForPrompt } from "./authoring-prompt-payloads.js";
import { codexCombinedPrompt, CODEX_PROMPT_INPUT_CHAR_LIMIT } from "../llm/llm-caller.js";
import {
  OBSERVATION_READ_MAX_ID_CHARS,
  OBSERVATION_READ_MAX_REQUEST_IDS,
  ObservationReadError,
  promptContextAdmittedObservationIds,
  type ObservationReadPage,
} from "./observation-read.js";
import {
  deriveObservationReadFetchBudget,
  ObservationReadGrantRegistry,
  OBSERVATION_READ_EXCHANGE_FRAMING_CHARS,
  OBSERVATION_READ_MAX_CALLS,
  OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET,
  OBSERVATION_READ_PAGE_CHAR_BUDGET,
  OBSERVATION_READ_SESSION_RESERVE_CHARS,
  type ObservationReadGrantSources,
} from "./observation-read-grant.js";

// Spec basis: development-records/design/20260726-observation-catalog-tool-design.md §4.1 (session scope
// binding), §4.2 (cumulative budget), §3 (인용 ⊆ 조회 ⊆ 스냅샷), §8 (failure modes), §9 Stage 2 done-when.
//
// Both fixtures are the REAL artifacts of the same 59-file value bench run (2026-07-26), preserved
// verbatim from a gitignored session directory — see scripts/fixtures/observation-catalog/PROVENANCE.md.
//
// The real ledger admits ALL 59 observations for prompt_context, so it cannot by itself prove the gate
// withholds anything — a passing "gate works" test over it would be VACUOUS. Every withholding case
// therefore runs against a ledger DERIVED from the real one by a single documented edit, and each such
// variant is cross-checked against the production push gate (`sourceObservationsForPrompt`) so the variant
// is known to be a real withholding rather than an artifact of this module's own rule.

const FIXTURE_DIR = path.resolve(__dirname, "../../../scripts/fixtures/observation-catalog");
const OBSERVATIONS_TEXT = readFileSync(path.join(FIXTURE_DIR, "source-observations.yaml"), "utf8");
const LEDGER_TEXT = readFileSync(path.join(FIXTURE_DIR, "source-safety-ledger.yaml"), "utf8");

const fullArtifact = parseYaml(OBSERVATIONS_TEXT) as ReconstructSourceObservationsArtifact;
const fullLedger = parseYaml(LEDGER_TEXT) as ReconstructSourceSafetyLedgerArtifact;
const allIds = fullArtifact.observations.map((observation) => observation.observation_id);

/** A ttl long enough that no test hits expiry unless it moves the injected clock. */
const TTL_MS = 605_000;

/**
 * The grant reads its artifacts from PATHS and re-reads them on every serve — that is what makes the drift
 * check mechanical rather than a caller obligation, and it is why these tests write real files instead of
 * passing strings. Cleaned up in `afterAll`.
 */
const TEMP_ROOT = mkdtempSync(path.join(os.tmpdir(), "onto-observation-grant-"));
let tempSeq = 0;

afterAll(() => {
  rmSync(TEMP_ROOT, { recursive: true, force: true });
});

function writeSources(
  observationsText: string,
  ledger: ReconstructSourceSafetyLedgerArtifact = fullLedger,
): ObservationReadGrantSources {
  tempSeq += 1;
  const observationsPath = path.join(TEMP_ROOT, `observations-${tempSeq}.yaml`);
  const safetyLedgerPath = path.join(TEMP_ROOT, `ledger-${tempSeq}.yaml`);
  const safetyLedgerValidationPath = path.join(TEMP_ROOT, `ledger-validation-${tempSeq}.yaml`);
  writeFileSync(observationsPath, observationsText);
  // The ledger names the observations artifact it was written for — the runtime's own writer sets this to
  // `path.resolve(...)`, and mint binds on it (a session_id comparison is not an identity check).
  writeFileSync(
    safetyLedgerPath,
    stringifyYaml({ ...ledger, source_observations_ref: path.resolve(observationsPath) }),
  );
  writeFileSync(safetyLedgerValidationPath, stringifyYaml(validationFor(observationsPath, safetyLedgerPath)));
  return { observationsPath, safetyLedgerPath, safetyLedgerValidationPath };
}

/** A `valid` validation artifact for the given pair — mint refuses to trust an unvalidated ledger. */
function validationFor(
  observationsPath: string,
  safetyLedgerPath: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema_version: "1",
    session_id: fullLedger.session_id,
    created_at: "2026-07-26T00:00:00.000Z",
    source_safety_ledger_ref: path.resolve(safetyLedgerPath),
    source_observations_ref: path.resolve(observationsPath),
    validation_status: "valid",
    safety_row_count: fullLedger.safety_rows.length,
    no_prompt_use_count: 0,
    validation_results: ["source_safety_ledger_valid"],
    asserted_obligation_ids: [],
    violations: [],
    ...overrides,
  };
}

/** Overwrite a live grant's artifacts in place — the mid-flight rewrite the drift check exists for. */
function rewriteSources(
  sources: ObservationReadGrantSources,
  updates: { observationsText?: string; ledger?: ReconstructSourceSafetyLedgerArtifact },
): void {
  if (updates.observationsText !== undefined) {
    writeFileSync(sources.observationsPath, updates.observationsText);
  }
  if (updates.ledger !== undefined) {
    writeFileSync(
      sources.safetyLedgerPath,
      stringifyYaml({
        ...updates.ledger,
        source_observations_ref: path.resolve(sources.observationsPath),
      }),
    );
  }
}

function ledgerWith(
  edit: (rows: ReconstructSourceSafetyLedgerArtifact["safety_rows"]) => ReconstructSourceSafetyLedgerArtifact["safety_rows"],
): ReconstructSourceSafetyLedgerArtifact {
  const clone = parseYaml(LEDGER_TEXT) as ReconstructSourceSafetyLedgerArtifact;
  return { ...clone, safety_rows: edit(clone.safety_rows) };
}

function promptContextRowIndex(ledger: ReconstructSourceSafetyLedgerArtifact, observationId: string): number {
  const index = ledger.safety_rows.findIndex(
    (row) => row.safety_row_id === `source_safety:${observationId}:prompt_context`,
  );
  if (index < 0) throw new Error(`fixture lacks a prompt_context row for ${observationId}`);
  return index;
}

/** A small artifact text carved from the real corpus — same observation content, a suite that stays fast. */
function artifactTextWith(observationIds: readonly string[]): string {
  return stringifyYaml({
    ...fullArtifact,
    observations: fullArtifact.observations.filter((observation) =>
      observationIds.includes(observation.observation_id)
    ),
  });
}

/** A prompt of `chars` characters — the budget is measured off the real string, never a declared count. */
function promptOf(chars: number): string {
  return "p".repeat(chars);
}

/** What `codexCombinedPrompt` adds between the two parts, derived rather than restated. */
const SEPARATOR_CHARS = codexCombinedPrompt("", "").length;

/** The failure `reason` a call produced, or "no-error" — keeps every rejection assertion one shape. */
function reasonOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof ObservationReadError ? error.reason : `unexpected:${String(error)}`;
  }
  return "no-error";
}

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  return "no-error";
}

/** Six real observations, smallest first — enough for multi-id pages without parsing 3.9 MB per mint. */
const smallIds = [...allIds]
  .map((id) => ({
    id,
    size: JSON.stringify(
      fullArtifact.observations.find((observation) => observation.observation_id === id),
    ).length,
  }))
  .sort((left, right) => left.size - right.size)
  .slice(0, 6)
  .map((entry) => entry.id);
const smallText = artifactTextWith(smallIds);

/** Walk a grant's cursor to completion, returning every page. */
function walkGrant(
  registry: ObservationReadGrantRegistry,
  token: string,
  observationIds: readonly string[],
): ObservationReadPage[] {
  const pages: ObservationReadPage[] = [];
  let request = { observation_ids: observationIds } as
    | { observation_ids: readonly string[] }
    | { cursor: string };
  for (;;) {
    const page = registry.serve({ token, request });
    pages.push(page);
    if (page.next_cursor === undefined) return pages;
    request = { cursor: page.next_cursor };
    if (pages.length > 10_000) throw new Error("cursor walk did not terminate");
  }
}

function mintOver(
  registry: ObservationReadGrantRegistry,
  sources: ObservationReadGrantSources,
  overrides?: { initialPromptChars?: number; pageCharBudget?: number; ttlMs?: number },
): { token: string; receipt: ReturnType<ObservationReadGrantRegistry["receipt"]> } {
  return registry.mint({
    sources,
    // The grant combines these with the codex route's own function, so a test cannot accidentally measure
    // something the dispatch would not send.
    systemPrompt: "",
    userPrompt: promptOf(Math.max(0, (overrides?.initialPromptChars ?? 0) - SEPARATOR_CHARS)),
    ttlMs: overrides?.ttlMs ?? TTL_MS,
    ...(overrides?.pageCharBudget === undefined ? {} : { pageCharBudget: overrides.pageCharBudget }),
  });
}

describe("fixture preconditions — nothing is concluded from an empty or all-permissive subject set", () => {
  it("carries 59 real observations and a prompt_context safety row for every one of them", () => {
    expect(fullArtifact.observations.length).toBe(59);
    expect(new Set(allIds).size).toBe(59);
    const promptRows = fullLedger.safety_rows.filter(
      (row) => row.visibility_derivation.intended_consumption === "prompt_context",
    );
    expect(promptRows.length).toBe(59);
    for (const id of allIds) {
      expect(promptContextRowIndex(fullLedger, id)).toBeGreaterThanOrEqual(0);
    }
  });

  it("admits a NON-EMPTY set over the real ledger, so 'the gate withheld nothing' is a measurement", () => {
    const admitted = promptContextAdmittedObservationIds({ observationIds: allIds, ledger: fullLedger });
    expect(admitted.size).toBe(59);
  });

  it("carries rows in tiers OTHER than consumption_allowed, so the tier check is not trivially true", () => {
    const tiers = new Set(fullLedger.safety_rows.map((row) => row.visibility_tier));
    expect(tiers.size).toBeGreaterThan(1);
    expect(tiers).toContain("internal_only");
  });

  it("carves a small artifact whose observations are real and non-empty", () => {
    const carved = parseYaml(smallText) as ReconstructSourceObservationsArtifact;
    expect(carved.observations.length).toBe(6);
    expect(carved.session_id).toBe(fullArtifact.session_id);
    for (const observation of carved.observations) {
      expect(Object.keys(observation.structural_data ?? {}).length).toBeGreaterThan(0);
    }
  });
});

describe("gate — the pull path admits exactly what the push path admits", () => {
  it("matches sourceObservationsForPrompt over the real corpus", () => {
    const pushed = new Set(
      sourceObservationsForPrompt({
        sourceObservations: fullArtifact,
        sourceSafetyLedger: fullLedger,
      }).observations.map((observation) => observation.observation_id),
    );
    const pulled = promptContextAdmittedObservationIds({ observationIds: allIds, ledger: fullLedger });
    expect([...pulled].sort()).toEqual([...pushed].sort());
    expect(pushed.size).toBeGreaterThan(0);
  });

  it.each([
    ["a tier flipped to no_prompt_use", (id: string) =>
      ledgerWith((rows) => {
        const index = promptContextRowIndex(fullLedger, id);
        const target = rows[index] as ReconstructSourceSafetyLedgerArtifact["safety_rows"][number];
        return rows.map((row, at) => (at === index ? { ...target, visibility_tier: "no_prompt_use" as const } : row));
      })],
    ["the prompt_context row deleted entirely", (id: string) =>
      ledgerWith((rows) => rows.filter((row) => row.safety_row_id !== `source_safety:${id}:prompt_context`))],
  ])("withholds an observation when %s — and the push path agrees", (_label, buildLedger) => {
    const withheldId = allIds[7] as string;
    const ledger = buildLedger(withheldId);

    // Cross-check the VARIANT against the production gate first: if the push path still admitted this id,
    // the variant would be meaningless and the assertions below would prove nothing.
    const pushed = new Set(
      sourceObservationsForPrompt({ sourceObservations: fullArtifact, sourceSafetyLedger: ledger })
        .observations.map((observation) => observation.observation_id),
    );
    expect(pushed.has(withheldId)).toBe(false);
    expect(pushed.size).toBe(58);

    const pulled = promptContextAdmittedObservationIds({ observationIds: allIds, ledger });
    expect(pulled.has(withheldId)).toBe(false);
    expect([...pulled].sort()).toEqual([...pushed].sort());
  });

  it.each([
    ["denied last", "no_prompt_use" as const, false],
    ["allowed last", "consumption_allowed" as const, true],
  ])(
    "resolves duplicate row ids LAST-WINS (%s), the same way the push gate's Map does",
    (_label, appendedTier, expectedAdmitted) => {
      // The validator rejects duplicates and run.ts asserts it, so this cannot reach the live path — but a
      // first-wins rule here would make the two gates disagree on exactly this pair, and "mirrors exactly"
      // is the claim. BOTH orderings are asserted: a one-direction test is also satisfied by
      // "always deny on conflict", which is a different rule that happens to agree half the time.
      const targetId = allIds[3] as string;
      const rowId = `source_safety:${targetId}:prompt_context`;
      const ledger = ledgerWith((rows) => {
        const original = rows[promptContextRowIndex(fullLedger, targetId)] as
          ReconstructSourceSafetyLedgerArtifact["safety_rows"][number];
        const appended = { ...original, safety_row_id: rowId, visibility_tier: appendedTier };
        return appendedTier === "consumption_allowed"
          // Put the DENYING row first so "last wins" is what admits it.
          ? [{ ...original, visibility_tier: "no_prompt_use" as const }, ...rows, appended]
          : [...rows, appended];
      });
      const pushed = new Set(
        sourceObservationsForPrompt({ sourceObservations: fullArtifact, sourceSafetyLedger: ledger })
          .observations.map((observation) => observation.observation_id),
      );
      const pulled = promptContextAdmittedObservationIds({ observationIds: allIds, ledger });
      expect(pushed.has(targetId)).toBe(expectedAdmitted);
      expect([...pulled].sort()).toEqual([...pushed].sort());
    },
  );

  it("keeps a withheld observation out of the grant's snapshot and unreachable by direct request", () => {
    const withheldId = smallIds[2] as string;
    const ledger = ledgerWith((rows) =>
      rows.filter((row) => row.safety_row_id !== `source_safety:${withheldId}:prompt_context`)
    );
    const registry = new ObservationReadGrantRegistry();
    const { token, receipt } = mintOver(registry, writeSources(smallText, ledger));

    expect(receipt.admitted_observation_count).toBe(5);
    expect(receipt.withheld_observation_count).toBe(1);
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [withheldId] } })))
      .toBe("unknown_observation_id");
  });

  it("refuses a ledger not written for THIS observations artifact", () => {
    // `session_id` is `path.basename(sessionRoot)` and observation ids are a hash of the source path, so two
    // runs can share both — cross-family review paired A's observations with B's permitting ledger and the
    // session comparison was satisfied. The ledger's own `source_observations_ref` is the identity check.
    const sources = writeSources(smallText);
    const foreign = writeSources(smallText);
    const registry = new ObservationReadGrantRegistry();
    // Contrast: the pair as written mints fine.
    expect(reasonOf(() => mintOver(registry, sources))).toBe("no-error");
    // Now point the ledger at the OTHER artifact while keeping session_id identical.
    writeFileSync(
      sources.safetyLedgerPath,
      stringifyYaml({ ...fullLedger, source_observations_ref: path.resolve(foreign.observationsPath) }),
    );
    expect(reasonOf(() => mintOver(registry, sources))).toBe("artifact_malformed");
  });

  it("refuses to mint on a ledger whose validation artifact does not say valid", () => {
    // The gate trusts `visibility_tier` verbatim, which is only sound because the canonical validator
    // refuses a tier not derived from the four axes. Cross-family review flipped a row to
    // `authorization_state: unauthorized` while keeping `consumption_allowed`: the validator rejects it, the
    // gate alone does not. Requiring the validation artifact puts that assertion on the pull path.
    const sources = writeSources(smallText);
    const registry = new ObservationReadGrantRegistry();
    expect(reasonOf(() => mintOver(registry, sources))).toBe("no-error");

    for (
      const overrides of [
        { validation_status: "invalid" },
        { source_observations_ref: path.resolve(path.join(TEMP_ROOT, "other.yaml")) },
        { source_safety_ledger_ref: null },
      ]
    ) {
      writeFileSync(
        sources.safetyLedgerValidationPath,
        stringifyYaml(validationFor(sources.observationsPath, sources.safetyLedgerPath, overrides)),
      );
      expect(reasonOf(() => mintOver(registry, sources))).toBe("artifact_malformed");
    }
    rmSync(sources.safetyLedgerValidationPath);
    expect(reasonOf(() => mintOver(registry, sources))).toBe("artifact_malformed");
  });

  it("copies the source paths at mint so a caller cannot redirect a live grant", () => {
    // `readonly` is compile-time only and the object arrives by reference: cross-family review mutated the
    // same object after mint to point at byte-identical copies, then revoked access in the canonical ledger,
    // and the revoked body stayed available because the copies still hashed the same.
    const live = writeSources(smallText);
    const copy = writeSources(smallText);
    const mutable = { ...live };
    const registry = new ObservationReadGrantRegistry();
    const { token } = registry.mint({
      sources: mutable,
      systemPrompt: "",
      userPrompt: "",
      ttlMs: TTL_MS,
    });
    mutable.observationsPath = copy.observationsPath;
    mutable.safetyLedgerPath = copy.safetyLedgerPath;
    mutable.safetyLedgerValidationPath = copy.safetyLedgerValidationPath;
    // Revoke in the CANONICAL ledger only. A grant reading the copies would not notice.
    rewriteSources(live, {
      ledger: ledgerWith((rows) =>
        rows.filter((row) => row.safety_row_id !== `source_safety:${smallIds[0] as string}:prompt_context`)
      ),
    });
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("snapshot_drift");
  });

  it("keeps a hostile artifact value out of a charged failure message", () => {
    // A 200,000-char `session_id` in the ledger made the mismatch message 200,092 chars and charged 201,116
    // against a 66,560 total — a 134,556 overrun from one legal call (cross-family review).
    const sources = writeSources(smallText);
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, sources);
    const hostile = "z".repeat(200_000);
    writeFileSync(
      sources.safetyLedgerPath,
      stringifyYaml({
        ...fullLedger,
        session_id: hostile,
        source_observations_ref: path.resolve(sources.observationsPath),
      }),
    );
    const message = messageOf(() =>
      registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })
    );
    expect(message).not.toContain(hostile);
    expect(message.length).toBeLessThan(400);
    const receipt = registry.receipt(token);
    expect(receipt.chars_served).toBeLessThanOrEqual(receipt.budget.total_fetch_char_budget);
  });

  it("refuses a withheld id and an invented id identically — no existence is disclosed", () => {
    const withheldId = smallIds[2] as string;
    const ledger = ledgerWith((rows) =>
      rows.filter((row) => row.safety_row_id !== `source_safety:${withheldId}:prompt_context`)
    );
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, writeSources(smallText, ledger));
    const withheld = messageOf(() => registry.serve({ token, request: { observation_ids: [withheldId] } }));
    const invented = messageOf(() =>
      registry.serve({ token, request: { observation_ids: ["obs_does_not_exist"] } })
    );
    expect(withheld.replace(withheldId, "ID")).toBe(invented.replace("obs_does_not_exist", "ID"));
  });

  it("mints an empty snapshot when the ledger admits nothing, rather than falling open", () => {
    const ledger = ledgerWith((rows) =>
      rows.map((row) =>
        row.visibility_derivation.intended_consumption === "prompt_context"
          ? { ...row, visibility_tier: "internal_only" as const }
          : row
      )
    );
    const registry = new ObservationReadGrantRegistry();
    const { token, receipt } = mintOver(registry, writeSources(smallText, ledger));
    expect(receipt.admitted_observation_count).toBe(0);
    expect(receipt.withheld_observation_count).toBe(6);
    for (const id of smallIds) {
      expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [id] } })))
        .toBe("unknown_observation_id");
    }
  });
});

describe("session scope binding — a token reaches its own session and nothing else", () => {
  it("cannot read another session's observation, even with the right id", () => {
    const registry = new ObservationReadGrantRegistry();
    const aIds = smallIds.slice(0, 3);
    const bIds = smallIds.slice(3, 6);
    const { token: tokenA } = mintOver(registry, writeSources(artifactTextWith(aIds)));
    const { token: tokenB } = mintOver(registry, writeSources(artifactTextWith(bIds)));

    // Non-vacuity: each id really is servable under its OWN grant.
    expect(registry.serve({ token: tokenA, request: { observation_ids: [aIds[0] as string] } })
      .entries[0]?.observation_id).toBe(aIds[0]);
    expect(registry.serve({ token: tokenB, request: { observation_ids: [bIds[0] as string] } })
      .entries[0]?.observation_id).toBe(bIds[0]);

    expect(reasonOf(() => registry.serve({ token: tokenA, request: { observation_ids: [bIds[0] as string] } })))
      .toBe("unknown_observation_id");
    expect(reasonOf(() => registry.serve({ token: tokenB, request: { observation_ids: [aIds[0] as string] } })))
      .toBe("unknown_observation_id");
  });

  it("accepts a cursor across grants over IDENTICAL content — the boundary, stated", () => {
    // Not a leak, and worth pinning so the isolation claim is not overstated: two grants over the same
    // inputs derive the same snapshot_digest, so a cursor crosses. The receiving token could have asked
    // for those ids directly, so nothing widens — but the property is "reaches only its own snapshot",
    // NOT "a cursor is bound to a grant". Binding would need a per-grant MAC (design §10, not adopted).
    const registry = new ObservationReadGrantRegistry();
    const big = largestObservationId();
    const text = artifactTextWith([big]);
    const first = mintOver(registry, writeSources(text), { pageCharBudget: 8_192 });
    const second = mintOver(registry, writeSources(text), { pageCharBudget: 8_192 });
    expect(second.receipt.snapshot_digest).toBe(first.receipt.snapshot_digest);

    const page = registry.serve({ token: first.token, request: { observation_ids: [big] } });
    const crossed = registry.serve({ token: second.token, request: { cursor: page.next_cursor as string } });
    expect(crossed.entries[0]?.part_index).toBe(2);
    // The charge lands on the grant that served it, not on the one that issued the cursor.
    expect(registry.receipt(second.token).calls_served).toBe(1);
    expect(registry.receipt(first.token).calls_served).toBe(1);
  });

  it("refuses a cursor issued under a session with different content", () => {
    const registry = new ObservationReadGrantRegistry();
    const big = largestObservationId();
    const { token: tokenA } = mintOver(registry, writeSources(artifactTextWith([big, ...smallIds.slice(0, 2)])), {
      pageCharBudget: 4_096,
    });
    const { token: tokenB } = mintOver(registry, writeSources(artifactTextWith([big])), { pageCharBudget: 4_096 });
    const page = registry.serve({ token: tokenA, request: { observation_ids: [big] } });
    expect(page.next_cursor).toBeDefined();
    expect(reasonOf(() => registry.serve({ token: tokenB, request: { cursor: page.next_cursor as string } })))
      .toBe("snapshot_drift");
  });

  it("refuses an unregistered token without echoing it", () => {
    const registry = new ObservationReadGrantRegistry();
    mintOver(registry, writeSources(smallText));
    const forged = "forged-token-value-that-must-not-be-echoed";
    const message = messageOf(() =>
      registry.serve({ token: forged, request: { observation_ids: [smallIds[0] as string] } })
    );
    expect(message).not.toContain(forged);
    expect(reasonOf(() => registry.serve({ token: forged, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("unknown_grant");
  });

  it("never echoes a live token in an error message or a receipt", () => {
    const registry = new ObservationReadGrantRegistry();
    const { token, receipt } = mintOver(registry, writeSources(smallText));
    expect(JSON.stringify(receipt)).not.toContain(token);
    const messages = [
      messageOf(() => registry.serve({ token, request: { observation_ids: ["nope"] } })),
      messageOf(() => registry.serve({ token, request: {} })),
      messageOf(() => registry.serve({ token, request: { cursor: "not-a-cursor" } })),
    ];
    for (const message of messages) expect(message).not.toContain(token);
  });
});

describe("revocation and expiry — a reclaimed session cannot be replayed", () => {
  it("answers grant_revoked after revoke, including for a cursor issued before it", () => {
    const registry = new ObservationReadGrantRegistry();
    const big = largestObservationId();
    const { token } = mintOver(registry, writeSources(artifactTextWith([big])), { pageCharBudget: 4_096 });
    const page = registry.serve({ token, request: { observation_ids: [big] } });
    expect(page.next_cursor).toBeDefined();

    registry.revoke(token);
    expect(reasonOf(() => registry.serve({ token, request: { cursor: page.next_cursor as string } })))
      .toBe("grant_revoked");
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [big] } })))
      .toBe("grant_revoked");
  });

  it("answers grant_expired once the ttl elapses, on the injected clock", () => {
    let clock = 1_000;
    const registry = new ObservationReadGrantRegistry({ now: () => clock });
    const { token } = mintOver(registry, writeSources(smallText), { ttlMs: 10_000 });
    expect(registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } }).entries)
      .toHaveLength(1);
    clock += 9_999;
    expect(registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } }).entries)
      .toHaveLength(1);
    clock += 1;
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("grant_expired");
  });

  it("stays expired when the clock moves BACKWARDS", () => {
    // Expiry has to be latched state, not a comparison recomputed per call: an NTP correction or a manual
    // clock change would otherwise resurrect a grant whose session is over. Cross-family review built
    // exactly this sequence against the unlatched version and read the observation back.
    let clock = 1_000;
    const registry = new ObservationReadGrantRegistry({ now: () => clock });
    const { token } = mintOver(registry, writeSources(smallText), { ttlMs: 10 });
    clock += 10;
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("grant_expired");
    clock -= 9;
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("grant_expired");
    clock = 0;
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("grant_expired");
  });

  it("still yields a receipt after revocation and expiry — the audit outlives the session", () => {
    let clock = 0;
    const registry = new ObservationReadGrantRegistry({ now: () => clock });
    const { token } = mintOver(registry, writeSources(smallText), { ttlMs: 5_000 });
    registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } });
    registry.revoke(token);
    clock += 10_000;
    const receipt = registry.receipt(token);
    expect(receipt.calls_served).toBe(1);
    expect(receipt.served.map((record) => record.observation_id)).toEqual([smallIds[0]]);
  });
});

describe("cumulative budget — pushed and pulled share one ceiling", () => {
  it("derives the char total from the remaining headroom and bounds calls independently", () => {
    const initialPromptChars = 353_000;
    // The ceiling is the imported constant, NOT a parameter: a caller-declared one accepted 3,000,000 and
    // served 1,064,510 chars past the real limit (cross-family review). The only knob left is the prompt
    // itself, and its LENGTH is measured here from the actual string.
    const budget = deriveObservationReadFetchBudget({
      systemPrompt: "",
      userPrompt: promptOf(initialPromptChars - SEPARATOR_CHARS),
    });
    const expectedTotal =
      CODEX_PROMPT_INPUT_CHAR_LIMIT - initialPromptChars - OBSERVATION_READ_SESSION_RESERVE_CHARS;
    expect(budget.page_char_budget).toBe(OBSERVATION_READ_PAGE_CHAR_BUDGET);
    expect(budget.total_fetch_char_budget).toBe(expectedTotal);
    expect(budget.max_calls).toBe(OBSERVATION_READ_MAX_CALLS);
    // The two bounds must be able to bind in EITHER order, else one is unreachable code: at this
    // realistic prompt size the chars run out first, and the call cap is what a small-page loop hits.
    expect(
      budget.max_calls * (budget.page_char_budget + OBSERVATION_READ_EXCHANGE_FRAMING_CHARS),
    ).toBeGreaterThan(budget.total_fetch_char_budget);
  });

  it("refuses to mint when the pushed prompt leaves no room for a single page", () => {
    const registry = new ObservationReadGrantRegistry();
    const tooBig =
      CODEX_PROMPT_INPUT_CHAR_LIMIT - OBSERVATION_READ_SESSION_RESERVE_CHARS -
      OBSERVATION_READ_PAGE_CHAR_BUDGET - OBSERVATION_READ_EXCHANGE_FRAMING_CHARS + 1;
    expect(reasonOf(() => mintOver(registry, writeSources(smallText), { initialPromptChars: tooBig })))
      .toBe("fetch_budget_unservable");
    // One char less and it mints, funding exactly one page — the boundary is exact, not approximate.
    const { token, receipt } = mintOver(registry, writeSources(smallText), {
      initialPromptChars: tooBig - 1,
    });
    expect(receipt.budget.total_fetch_char_budget)
      .toBe(OBSERVATION_READ_PAGE_CHAR_BUDGET + OBSERVATION_READ_EXCHANGE_FRAMING_CHARS);

    // And it must actually SERVE that one page, then refuse the next. Asserting only the derived scalar
    // left `remaining < reservation` and `remaining <= reservation` indistinguishable — the off-by-one that
    // refuses the very first page of a legitimately funded grant. (Cross-family review, lens B.)
    expect(registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } }).entries)
      .toHaveLength(1);
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[1] as string] } })))
      .toBe("fetch_budget_exhausted");
  });

  it("pins the constants the ceiling contract is computed from", () => {
    // Every other assertion in this file derives its expectation from these constants, so a mutation of one
    // stays green everywhere — zeroing OBSERVATION_READ_EXCHANGE_FRAMING_CHARS removed all exchange framing
    // from both the reservation and the charge with a fully green suite (cross-family review, lens B).
    // These are the only literals; changing a constant is a deliberate act that updates this test with it.
    expect(OBSERVATION_READ_PAGE_CHAR_BUDGET).toBe(65_536);
    expect(OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET).toBe(4_096);
    expect(OBSERVATION_READ_EXCHANGE_FRAMING_CHARS).toBe(1_024);
    expect(OBSERVATION_READ_SESSION_RESERVE_CHARS).toBe(8_192);
    expect(OBSERVATION_READ_MAX_CALLS).toBe(32);
    expect(OBSERVATION_READ_MAX_ID_CHARS).toBe(128);
    expect(OBSERVATION_READ_MAX_REQUEST_IDS).toBe(16);
  });

  it("holds a page-budget floor that keeps every charge inside its own reservation", () => {
    // The floor is measured, not chosen (see OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET). Both measurements are
    // re-derived here, so raising the id cap or lowering the floor fails instead of silently re-opening the
    // overrun cross-family review found at `pageCharBudget: 1` (charged 1,181 against a 1,025 total).
    const registry = new ObservationReadGrantRegistry();
    for (const pageCharBudget of [1, 100, 1_000, OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET - 1]) {
      expect(reasonOf(() => mintOver(registry, writeSources(smallText), { pageCharBudget })))
        .toBe("fetch_budget_unservable");
    }

    // (1) At the floor the reader serves the WORST shape-legal request rather than refusing it.
    const atFloor = mintOver(registry, writeSources(smallText), {
      pageCharBudget: OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET,
    });
    const worstIds = Array.from(
      { length: OBSERVATION_READ_MAX_REQUEST_IDS },
      (_unused, index) => `${"z".repeat(OBSERVATION_READ_MAX_ID_CHARS - 3)}${String(index).padStart(3, "0")}`,
    );
    // These resolve to nothing, so the failure proves the SHAPE was accepted: budget_too_small would mean
    // the floor is below what the cursor reservation for 16 max-length ids costs (measured: 3,376).
    expect(reasonOf(() => registry.serve({ token: atFloor.token, request: { observation_ids: worstIds } })))
      .toBe("unknown_observation_id");

    // (2) The charge for that worst case stays inside one reservation, at the tightest budget allowed.
    const spent = registry.receipt(atFloor.token);
    expect(spent.chars_served)
      .toBeLessThan(OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET + OBSERVATION_READ_EXCHANGE_FRAMING_CHARS);
    expect(spent.chars_served).toBeLessThanOrEqual(spent.budget.total_fetch_char_budget);
  });

  /** Walk one grant's cursor until it refuses, reporting how it refused and what it served. */
  function walkUntilRefused(
    registry: ObservationReadGrantRegistry,
    token: string,
    observationIds: readonly string[],
  ): { reason: string; calls: number; servedChars: number } {
    let calls = 0;
    let servedChars = 0;
    let request = { observation_ids: observationIds } as
      | { observation_ids: readonly string[] }
      | { cursor: string };
    for (;;) {
      let page: ObservationReadPage;
      try {
        page = registry.serve({ token, request });
      } catch (error) {
        return {
          reason: error instanceof ObservationReadError ? error.reason : `unexpected:${String(error)}`,
          calls,
          servedChars,
        };
      }
      calls += 1;
      servedChars += JSON.stringify(page).length;
      if (page.next_cursor === undefined) return { reason: "completed", calls, servedChars };
      request = { cursor: page.next_cursor };
    }
  }

  it("stops on the CHAR bound, at or under the ceiling, and does not charge the refused call", () => {
    const registry = new ObservationReadGrantRegistry();
    const big = largestObservationId();
    const pageCharBudget = 8_192;
    const perCall = pageCharBudget + OBSERVATION_READ_EXCHANGE_FRAMING_CHARS;
    // Fund exactly 6 worst-case calls — fewer than the 32-call cap, so chars bind first.
    const initialPromptChars =
      CODEX_PROMPT_INPUT_CHAR_LIMIT - OBSERVATION_READ_SESSION_RESERVE_CHARS - 6 * perCall;
    const { token, receipt } = mintOver(registry, writeSources(artifactTextWith([big])), {
      pageCharBudget,
      initialPromptChars,
    });
    expect(receipt.budget.max_calls).toBe(OBSERVATION_READ_MAX_CALLS);
    expect(receipt.budget.total_fetch_char_budget).toBe(6 * perCall);

    const walk = walkUntilRefused(registry, token, [big]);
    expect(walk.reason).toBe("fetch_budget_exhausted");
    expect(walk.calls).toBe(6);
    // THE cumulative invariant. A budget policed only per response would have overshot here: every page
    // obeyed the per-response cap, yet the pages together are many times its size.
    const spent = registry.receipt(token);
    expect(spent.chars_served).toBeLessThanOrEqual(spent.budget.total_fetch_char_budget);
    expect(walk.servedChars).toBeGreaterThan(pageCharBudget * 4);

    // The refusal itself must be free — otherwise a spent session keeps consuming the ceiling it ran out
    // of, and `chars_served` above would be a bound the code only happens to respect.
    const atRefusal = spent.chars_served;
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [big] } })))
      .toBe("fetch_budget_exhausted");
    expect(registry.receipt(token).chars_served).toBe(atRefusal);
    expect(registry.receipt(token).calls_served).toBe(6);
  });

  it("stops on the CALL bound when pages are small enough that chars never bind", () => {
    const registry = new ObservationReadGrantRegistry();
    const big = largestObservationId();
    const pageCharBudget = 8_192;
    const { token, receipt } = mintOver(registry, writeSources(artifactTextWith([big])), { pageCharBudget });
    // Non-vacuity: the char total must be far larger than 32 small pages, else this arm would prove
    // nothing about which bound fired.
    expect(receipt.budget.total_fetch_char_budget).toBeGreaterThan(
      OBSERVATION_READ_MAX_CALLS * (pageCharBudget + OBSERVATION_READ_EXCHANGE_FRAMING_CHARS),
    );

    const walk = walkUntilRefused(registry, token, [big]);
    expect(walk.reason).toBe("call_limit_exhausted");
    expect(walk.calls).toBe(OBSERVATION_READ_MAX_CALLS);
    const spent = registry.receipt(token);
    expect(spent.chars_served).toBeLessThanOrEqual(spent.budget.total_fetch_char_budget);
  });

  it("takes the ceiling from the constant that owns it — no caller can declare a bigger one", () => {
    // This replaced a validation test. A caller-declared ceiling was a parameter that accepted
    // `3_000_000` (a perfectly legal positive integer) and let a grant serve 1,064,510 chars past the real
    // 1,048,576 limit; `Number.NaN` was worse, since every comparison against NaN is false and the
    // unservable check, the admission check AND the over-budget guard all passed. Neither is expressible
    // now: the ceiling is imported, and the surface no longer has the parameter to get wrong.
    expect(deriveObservationReadFetchBudget({ systemPrompt: "", userPrompt: "" }).total_fetch_char_budget)
      .toBe(CODEX_PROMPT_INPUT_CHAR_LIMIT - OBSERVATION_READ_SESSION_RESERVE_CHARS - SEPARATOR_CHARS);
    const registry = new ObservationReadGrantRegistry();
    const { receipt } = mintOver(registry, writeSources(smallText));
    expect(receipt.budget.total_fetch_char_budget)
      .toBe(CODEX_PROMPT_INPUT_CHAR_LIMIT - OBSERVATION_READ_SESSION_RESERVE_CHARS - SEPARATOR_CHARS);
  });

  it("charges a DRIFTED call, so a repeated-drift loop is bounded by the call cap", () => {
    const sources = writeSources(smallText);
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, sources);
    const rewritten = parseYaml(smallText) as ReconstructSourceObservationsArtifact;
    (rewritten.observations[0] as { structural_data: { char_count: number } }).structural_data.char_count = -7;
    rewriteSources(sources, { observationsText: stringifyYaml(rewritten) });

    for (let i = 0; i < 3; i += 1) {
      expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
        .toBe("snapshot_drift");
    }
    const receipt = registry.receipt(token);
    expect(receipt.calls_served).toBe(3);
    // Envelope plus each failure's own text. Drift is the runtime's fault, not the worker's, but the
    // error still occupies the worker's context — an uncharged path would be an unbounded free loop.
    expect(receipt.chars_served).toBeGreaterThan(3 * OBSERVATION_READ_EXCHANGE_FRAMING_CHARS);
    expect(receipt.served).toEqual([]);
  });

  it("charges a FAILED call — an error occupies the worker's context exactly like a result", () => {
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, writeSources(smallText));
    const before = registry.receipt(token);
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: ["obs_nope"] } })))
      .toBe("unknown_observation_id");
    const after = registry.receipt(token);
    expect(after.calls_served).toBe(before.calls_served + 1);
    // The envelope AND the message text: the failure is rendered into the conversation like a result.
    const message = messageOf(() => registry.serve({ token, request: { observation_ids: ["obs_nope"] } }));
    expect(after.chars_served)
      .toBe(before.chars_served + OBSERVATION_READ_EXCHANGE_FRAMING_CHARS + message.length);
    expect(after.served).toEqual([]);
  });

  it("keeps a maximal-length failing request inside the budget it reserved", () => {
    // The charge is only honest because the id length is bounded: 16 ids at the cap is the worst message
    // this path can produce, and it must still fit the per-call reservation.
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, writeSources(smallText));
    const worstCase = Array.from({ length: 16 }, (_unused, index) =>
      `${"z".repeat(120)}${String(index).padStart(3, "0")}`);
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: worstCase } })))
      .toBe("unknown_observation_id");
    const receipt = registry.receipt(token);
    expect(receipt.chars_served)
      .toBeLessThan(receipt.budget.page_char_budget + OBSERVATION_READ_EXCHANGE_FRAMING_CHARS);
    expect(receipt.chars_served).toBeLessThanOrEqual(receipt.budget.total_fetch_char_budget);
  });

  it("keeps the page budget constant so a whole cursor walk never hits the budget binding", () => {
    const registry = new ObservationReadGrantRegistry();
    const big = largestObservationId();
    const { token } = mintOver(registry, writeSources(artifactTextWith([big])), { pageCharBudget: 65_536 });
    const pages = walkGrant(registry, token, [big]);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(JSON.stringify(page).length).toBeLessThanOrEqual(65_536);

    // Reassembly is the proof the walk stayed on one decomposition: a budget that shifted mid-walk would
    // have been refused as cursor_malformed, and a silently re-split one would not concatenate.
    const body = pages.flatMap((page) => page.entries).map((entry) => entry.body).join("");
    const expected = JSON.stringify(
      fullArtifact.observations.find((observation) => observation.observation_id === big),
    );
    expect(body).toBe(expected);
    const receipt = registry.receipt(token);
    expect(receipt.served).toHaveLength(1);
    expect(receipt.served[0]?.part_indexes.length).toBe(pages.length);
  });
});

describe("drift — the artifacts must not move under a live grant", () => {
  it("fails loud when an admitted observation's content changes mid-flight", () => {
    const sources = writeSources(smallText);
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, sources);
    expect(registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } }).entries)
      .toHaveLength(1);

    const rewritten = parseYaml(smallText) as ReconstructSourceObservationsArtifact;
    (rewritten.observations[0] as { structural_data: { char_count: number } }).structural_data.char_count = -1;
    rewriteSources(sources, { observationsText: stringifyYaml(rewritten) });
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("snapshot_drift");
  });

  it("accepts a byte-different rewrite of identical observations, then still catches a real change", () => {
    const sources = writeSources(smallText);
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, sources);
    registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } });

    const reformatted = stringifyYaml(parseYaml(smallText), { lineWidth: 40 });
    expect(reformatted).not.toBe(smallText);
    rewriteSources(sources, { observationsText: reformatted });
    expect(registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } }).entries)
      .toHaveLength(1);

    // The hash cache refreshed on the line above; a real change after it must still be caught.
    const rewritten = parseYaml(smallText) as ReconstructSourceObservationsArtifact;
    rewritten.observations = rewritten.observations.slice(1);
    rewriteSources(sources, { observationsText: stringifyYaml(rewritten) });
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[1] as string] } })))
      .toBe("snapshot_drift");
  });

  it("fails loud when the ledger REVOKES an admitted observation mid-flight", () => {
    const sources = writeSources(smallText);
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, sources);
    registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } });

    rewriteSources(sources, {
      ledger: ledgerWith((rows) =>
        rows.filter((row) => row.safety_row_id !== `source_safety:${smallIds[1] as string}:prompt_context`)
      ),
    });
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("snapshot_drift");
  });

  it("fails loud when the ledger newly ADMITS an observation mid-flight", () => {
    const withheldId = smallIds[2] as string;
    const sources = writeSources(
      smallText,
      ledgerWith((rows) =>
        rows.filter((row) => row.safety_row_id !== `source_safety:${withheldId}:prompt_context`)
      ),
    );
    const registry = new ObservationReadGrantRegistry();
    const { token, receipt } = mintOver(registry, sources);
    expect(receipt.admitted_observation_count).toBe(5);

    // The ADDITIVE direction, which a cache keyed on the snapshot's own ids would miss entirely: the newly
    // admitted id is absent from the snapshot, so nothing about the snapshot's ids changed.
    rewriteSources(sources, { ledger: fullLedger });
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("snapshot_drift");
  });

  it("checks drift on EVERY serve, not only the first", () => {
    const sources = writeSources(smallText);
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, sources);
    registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } });
    registry.serve({ token, request: { observation_ids: [smallIds[1] as string] } });

    const rewritten = parseYaml(smallText) as ReconstructSourceObservationsArtifact;
    (rewritten.observations[0] as { structural_data: { char_count: number } }).structural_data.char_count = -2;
    rewriteSources(sources, { observationsText: stringifyYaml(rewritten) });
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[2] as string] } })))
      .toBe("snapshot_drift");
  });

  it.each([
    ["observations", (sources: ObservationReadGrantSources) => sources.observationsPath],
    ["ledger", (sources: ObservationReadGrantSources) => sources.safetyLedgerPath],
  ])("classifies an UNREADABLE %s artifact instead of leaking a raw fs error", (_label, pick) => {
    // Re-reading per serve is what makes the drift check real, but it also puts fs errors on a path whose
    // contract is "branch on `reason`". Before this was mapped, deleting either artifact mid-flight threw a
    // bare ENOENT with no reason, and the message must not carry the path either.
    const sources = writeSources(smallText);
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, sources);
    const target = pick(sources);
    rmSync(target);
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("artifact_malformed");
    const message = messageOf(() =>
      registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })
    );
    expect(message).not.toContain(target);
    // Charged, like every other failure that reaches the worker's context.
    expect(registry.receipt(token).calls_served).toBe(2);
  });

  it("does NOT call it drift when a WITHHELD observation's content changes", () => {
    // The digest covers the retained set only, so a change to something the gate withheld cannot affect
    // what is being served. Treating it as drift would kill live sessions for an irrelevant edit — and the
    // contrast arm below proves the check is still live for an admitted observation.
    const withheldId = smallIds[1] as string;
    const sources = writeSources(
      smallText,
      ledgerWith((rows) =>
        rows.filter((row) => row.safety_row_id !== `source_safety:${withheldId}:prompt_context`)
      ),
    );
    const registry = new ObservationReadGrantRegistry();
    const { token, receipt } = mintOver(registry, sources);
    expect(receipt.withheld_observation_count).toBe(1);

    const rewritten = parseYaml(smallText) as ReconstructSourceObservationsArtifact;
    const withheld = rewritten.observations.find((o) => o.observation_id === withheldId);
    (withheld as unknown as { summary: string }).summary = "changed while withheld";
    rewriteSources(sources, { observationsText: stringifyYaml(rewritten) });
    expect(registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } }).entries)
      .toHaveLength(1);

    const admitted = rewritten.observations.find((o) => o.observation_id === smallIds[0]);
    (admitted as unknown as { summary: string }).summary = "changed while admitted";
    rewriteSources(sources, { observationsText: stringifyYaml(rewritten) });
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("snapshot_drift");
  });

  it("fails loud when the ledger becomes unreadable rather than withholding everything", () => {
    const sources = writeSources(smallText);
    const registry = new ObservationReadGrantRegistry();
    const { token } = mintOver(registry, sources);
    writeFileSync(sources.safetyLedgerPath, "session_id: session\n");
    // A missing safety_rows array would make the gate admit nothing — fail-closed, so not unsafe, but
    // indistinguishable from a policy decision that withheld every observation.
    expect(reasonOf(() => registry.serve({ token, request: { observation_ids: [smallIds[0] as string] } })))
      .toBe("artifact_malformed");
  });
});

describe("receipt — what the runtime served, deterministically", () => {
  it("records ids, content hashes and part indexes, ascending", () => {
    const registry = new ObservationReadGrantRegistry();
    const big = largestObservationId();
    const { token } = mintOver(registry, writeSources(artifactTextWith([big, ...smallIds.slice(0, 2)])), {
      pageCharBudget: 65_536,
    });
    const pages = walkGrant(registry, token, [smallIds[1] as string, big, smallIds[0] as string]);
    const receipt = registry.receipt(token);
    expect(receipt.served.map((record) => record.observation_id))
      .toEqual([...[big, smallIds[0], smallIds[1]].sort()]);
    for (const record of receipt.served) {
      expect(record.part_indexes).toEqual([...record.part_indexes].sort((a, b) => a - b));
      expect(record.part_indexes[0]).toBe(1);
    }
    expect(receipt.grant_id).toMatch(/^obsgrant_[0-9a-f]{16}$/);

    // The recorded hash must BE sha256 of the delivered bytes, recomputed here from the reassembled pages
    // with node's own crypto — an independent oracle. A shape check (`/^[0-9a-f]{64}$/`) accepted
    // `sha256("x" + body)`, which would make the audit record name content nobody served
    // (cross-family review, lens B). This is also the §7 fingerprint's (id, content hash) pair, so a wrong
    // hash breaks replay verification rather than just a field.
    const delivered = new Map<string, string>();
    for (const page of pages) {
      for (const entry of page.entries) {
        delivered.set(entry.observation_id, (delivered.get(entry.observation_id) ?? "") + entry.body);
      }
    }
    expect(delivered.size).toBe(receipt.served.length);
    for (const record of receipt.served) {
      const body = delivered.get(record.observation_id) as string;
      expect(createHash("sha256").update(body, "utf8").digest("hex"))
        .toBe(record.observation_content_sha256);
      // Non-vacuity: the body really is the artifact's observation, not an empty string that would hash
      // consistently either way.
      expect(JSON.parse(body)).toEqual(
        fullArtifact.observations.find((observation) => observation.observation_id === record.observation_id),
      );
    }
  });

  it("gives two grants over identical inputs the same snapshot digest and the same page bytes", () => {
    const registry = new ObservationReadGrantRegistry();
    const first = mintOver(registry, writeSources(smallText));
    const second = mintOver(registry, writeSources(smallText));
    expect(second.receipt.snapshot_digest).toBe(first.receipt.snapshot_digest);
    expect(first.receipt.grant_id).not.toBe(second.receipt.grant_id);
    const request = { observation_ids: smallIds.slice(0, 3) };
    expect(JSON.stringify(registry.serve({ token: second.token, request })))
      .toBe(JSON.stringify(registry.serve({ token: first.token, request })));
  });
});

/** The corpus's largest observation — the one that certainly needs many pages at any real budget. */
function largestObservationId(): string {
  let best = { id: "", size: 0 };
  for (const observation of fullArtifact.observations) {
    const size = JSON.stringify(observation).length;
    if (size > best.size) best = { id: observation.observation_id, size };
  }
  return best.id;
}
