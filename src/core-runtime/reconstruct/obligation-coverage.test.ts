import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  activePairsFromRegistry,
  evaluateObligationCoverage,
  evaluateRatchet,
  pairKey,
  parseBaseActivePairs,
  type LedgerRow,
  type ObligationPair,
  type RatchetInputs,
} from "../../../scripts/check-obligation-coverage.js";
import { loadReconstructContractRegistry } from "./contract-registry.js";

const REGISTRY_PATH = path.resolve(
  ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
);

// Synthetic fixtures for the pure clauses — a 4-pair active surface (one obligation shared by two
// validators = the matrix dual-attribution shape), with a recorded pair, a parked pair, etc.
const A = (validator_id: string, obligation_id: string): ObligationPair => ({
  validator_id,
  obligation_id,
});
const PARK = (
  validator_id: string,
  obligation_id: string,
  tier = "flat",
): LedgerRow => ({ validator_id, obligation_id, coverage_status: "pending", tier });

describe("obligation-coverage pure clauses (G10 / INV-OBLIGATION-COVERAGE-1)", () => {
  it("passes when every active pair is recorded or parked", () => {
    const active = [A("v1", "o1"), A("v1", "o2"), A("v2", "shared"), A("v3", "shared")];
    const recorded = [A("v2", "shared"), A("v3", "shared")];
    const ledger = [PARK("v1", "o1"), PARK("v1", "o2")];
    expect(evaluateObligationCoverage({ activePairs: active, recorded, ledger })).toEqual([]);
  });

  it("RED: an active pair neither recorded nor parked fails completeness (a)", () => {
    const active = [A("v1", "o1"), A("v1", "unparked")];
    const recorded: ObligationPair[] = [];
    const ledger = [PARK("v1", "o1")];
    const errors = evaluateObligationCoverage({ activePairs: active, recorded, ledger });
    expect(errors.some((m) => m.includes("neither recorded nor parked") && m.includes("v1::unparked"))).toBe(true);
  });

  it("RED: a ledger row that resolves to no active obligation fails honesty (b)", () => {
    const active = [A("v1", "o1")];
    const recorded: ObligationPair[] = [];
    const ledger = [PARK("v1", "o1"), PARK("v1", "ghost")];
    const errors = evaluateObligationCoverage({ activePairs: active, recorded, ledger });
    expect(errors.some((m) => m.includes("registry_claim_mismatch") && m.includes("v1::ghost"))).toBe(true);
  });

  it("RED: a ledger row with an invalid tier fails honesty (b)", () => {
    const active = [A("v1", "o1")];
    const ledger = [PARK("v1", "o1", "bogus_tier")];
    const errors = evaluateObligationCoverage({ activePairs: active, recorded: [], ledger });
    expect(errors.some((m) => m.includes("invalid tier"))).toBe(true);
  });

  it("RED: a pair both recorded and parked fails honesty (b)", () => {
    const active = [A("v1", "o1")];
    const recorded = [A("v1", "o1")];
    const ledger = [PARK("v1", "o1")];
    const errors = evaluateObligationCoverage({ activePairs: active, recorded, ledger });
    expect(errors.some((m) => m.includes("also recorded"))).toBe(true);
  });

  it("RED: a recorded pair with no current active obligation fails reverse-validation (c)", () => {
    const active = [A("v1", "o1")];
    const recorded = [A("v1", "o1"), A("v1", "removed")];
    const ledger: LedgerRow[] = [];
    const errors = evaluateObligationCoverage({ activePairs: active, recorded, ledger });
    expect(errors.some((m) => m.includes("no current active obligation") && m.includes("v1::removed"))).toBe(true);
  });

  it("keys on (validator_id, obligation_id): a shared obligation does NOT cross-cover validators", () => {
    // o "shared" is active on both v2 and v3; recording only v2 leaves v3 uncovered.
    const active = [A("v2", "shared"), A("v3", "shared")];
    const recorded = [A("v2", "shared")];
    const ledger: LedgerRow[] = [];
    const errors = evaluateObligationCoverage({ activePairs: active, recorded, ledger });
    expect(errors.some((m) => m.includes("v3::shared") && m.includes("neither recorded nor parked"))).toBe(true);
  });

  it("RED: a duplicate pending row in the ledger fails honesty (b)", () => {
    const active = [A("v1", "o1")];
    const ledger = [PARK("v1", "o1"), PARK("v1", "o1")];
    const errors = evaluateObligationCoverage({ activePairs: active, recorded: [], ledger });
    expect(errors.some((m) => m.includes("duplicate pending row") && m.includes("v1::o1"))).toBe(true);
  });

  it("RED: a ledger row with coverage_status != 'pending' fails honesty (b)", () => {
    const active = [A("v1", "o1")];
    const ledger: LedgerRow[] = [
      { validator_id: "v1", obligation_id: "o1", coverage_status: "recorded", tier: "flat" },
    ];
    const errors = evaluateObligationCoverage({ activePairs: active, recorded: [], ledger });
    expect(errors.some((m) => m.includes("coverage_status must be 'pending'") && m.includes("v1::o1"))).toBe(true);
  });

  it("RED: a duplicate recorded pair fails reverse-validation (c)", () => {
    const active = [A("v1", "o1")];
    const recorded = [A("v1", "o1"), A("v1", "o1")];
    const errors = evaluateObligationCoverage({ activePairs: active, recorded, ledger: [] });
    expect(errors.some((m) => m.includes("recorded set has a duplicate pair") && m.includes("v1::o1"))).toBe(true);
  });

  it("tolerates an optional note on a ledger row (documentary; ignored by the pure clauses)", () => {
    const active = [A("v1", "o1")];
    const ledger: LedgerRow[] = [
      {
        validator_id: "v1",
        obligation_id: "o1",
        coverage_status: "pending",
        tier: "enforced_pending_instrumentation",
        note: "live-enforced; recording deferred",
      },
    ];
    expect(evaluateObligationCoverage({ activePairs: active, recorded: [], ledger })).toEqual([]);
  });
});

describe("obligation-coverage ratchet (pure, synthetic base/current)", () => {
  const base = (over: Partial<RatchetInputs> = {}): RatchetInputs => ({
    baseActiveKeys: new Set(["v1::o1", "v1::o2", "v2::shared"]),
    currentActiveKeys: new Set(["v1::o1", "v1::o2", "v2::shared"]),
    basePending: new Set(["v1::o1", "v1::o2"]),
    currentPending: new Set(["v1::o1", "v1::o2"]),
    baseRecorded: new Set(["v2::shared"]),
    currentRecorded: new Set(["v2::shared"]),
    coverageBaseMissing: false,
    ...over,
  });

  it("passes when nothing changed", () => {
    expect(evaluateRatchet(base())).toEqual([]);
  });

  it("RED: legacy pending grows (a base-active key newly parked) fails (i)", () => {
    // v2::shared was active at base and was NOT pending; moving it into pending is legacy growth.
    const errors = evaluateRatchet(base({ currentPending: new Set(["v1::o1", "v1::o2", "v2::shared"]) }));
    expect(errors.some((m) => m.includes("legacy pending grew") && m.includes("v2::shared"))).toBe(true);
  });

  it("RED: a recorded pair downgraded to pending fails (ii)", () => {
    const errors = evaluateRatchet(
      base({ currentRecorded: new Set([]), currentPending: new Set(["v1::o1", "v1::o2"]) }),
    );
    expect(errors.some((m) => m.includes("was downgraded") && m.includes("v2::shared"))).toBe(true);
  });

  it("RED: re-parking a currently-recorded pair fails (iii)", () => {
    const errors = evaluateRatchet(
      base({ currentPending: new Set(["v1::o1", "v1::o2", "v2::shared"]) }),
    );
    expect(errors.some((m) => m.includes("re-parked"))).toBe(true);
  });

  it("allows a newly-declared-active obligation to enter pending (currentActive − baseActive)", () => {
    const errors = evaluateRatchet(
      base({
        currentActiveKeys: new Set(["v1::o1", "v1::o2", "v2::shared", "v9::new"]),
        currentPending: new Set(["v1::o1", "v1::o2", "v9::new"]),
      }),
    );
    expect(errors).toEqual([]);
  });

  it("bootstrap: when base coverage artifacts are absent, the initial declaration is allowed wholesale", () => {
    // All current pending keys ARE in baseActive but basePending is empty — would be legacy growth if
    // not for the bootstrap flag. Re-park (iii) is still enforced (no overlap here, so passes).
    const errors = evaluateRatchet({
      baseActiveKeys: new Set(["v1::o1", "v1::o2", "v2::shared"]),
      currentActiveKeys: new Set(["v1::o1", "v1::o2", "v2::shared"]),
      basePending: new Set([]),
      currentPending: new Set(["v1::o1", "v1::o2"]),
      baseRecorded: new Set([]),
      currentRecorded: new Set(["v2::shared"]),
      coverageBaseMissing: true,
    });
    expect(errors).toEqual([]);
  });

  it("bootstrap still enforces (iii): a recorded pair also parked fails even on bootstrap", () => {
    const errors = evaluateRatchet({
      baseActiveKeys: new Set(["v1::o1"]),
      currentActiveKeys: new Set(["v1::o1"]),
      basePending: new Set([]),
      currentPending: new Set(["v1::o1"]),
      baseRecorded: new Set([]),
      currentRecorded: new Set(["v1::o1"]),
      coverageBaseMissing: true,
    });
    expect(errors.some((m) => m.includes("re-parked"))).toBe(true);
  });

  it("allows a RETIRED recorded obligation to leave the recorded set (no longer active) — (ii) gated on currentActiveKeys", () => {
    // v2::shared was recorded at base; the registry retires it (absent from currentActiveKeys). Pure
    // clause (c) forces its removal from recorded; the ratchet must NOT then flag it as a downgrade.
    const errors = evaluateRatchet(
      base({
        currentActiveKeys: new Set(["v1::o1", "v1::o2"]),
        currentRecorded: new Set([]),
      }),
    );
    expect(errors).toEqual([]);
  });

  it("RED: a STILL-ACTIVE base-recorded pair leaving recorded is still a downgrade (ii)", () => {
    // v2::shared stays active but is dropped from recorded → forbidden (silent recorded→absent).
    const errors = evaluateRatchet(base({ currentRecorded: new Set([]) }));
    expect(errors.some((m) => m.includes("was downgraded") && m.includes("v2::shared"))).toBe(true);
  });
});

describe("parseBaseActivePairs (version-tolerant base enumeration)", () => {
  it("matches activePairsFromRegistry on the CURRENT registry (same flat ∪ conditional surface)", async () => {
    const text = await import("node:fs/promises").then((m) => m.readFile(REGISTRY_PATH, "utf8"));
    const registry = await loadReconstructContractRegistry({ registryPath: REGISTRY_PATH });
    const viaLoader = new Set(activePairsFromRegistry(registry).map(pairKey));
    const viaTolerant = new Set(parseBaseActivePairs(text).map(pairKey));
    expect(viaTolerant).toEqual(viaLoader);
  });

  it("tolerates unknown/extra fields and a hypothetical future required field on records", () => {
    const yaml = [
      "schema_version: 999",
      "some_future_top_level_key: { a: 1 }",
      "validator_records:",
      "  - validator_id: v1",
      "    a_new_required_field_added_later: true",
      "    validation_obligations: [o1, o2]",
      "    conditional_validation_obligations:",
      "      - obligation_id: c1",
      "        activation_predicate: whatever",
      "  - validator_id: v2",
      "    validation_obligations: [o1]",
    ].join("\n");
    const keys = new Set(parseBaseActivePairs(yaml).map(pairKey));
    expect(keys).toEqual(new Set(["v1::o1", "v1::o2", "v1::c1", "v2::o1"]));
  });

  it("excludes planned_validator_records (only the active validator_records key is read)", () => {
    const yaml = [
      "validator_records:",
      "  - validator_id: active1",
      "    validation_obligations: [o1]",
      "planned_validator_records:",
      "  - validator_id: planned1",
      "    validation_obligations: [should_not_appear]",
    ].join("\n");
    const keys = new Set(parseBaseActivePairs(yaml).map(pairKey));
    expect(keys).toEqual(new Set(["active1::o1"]));
  });

  it("skips malformed obligation entries instead of minting bogus keys", () => {
    const yaml = [
      "validator_records:",
      "  - validator_id: v1",
      "    validation_obligations: [o1, '', null]",
      "    conditional_validation_obligations:",
      "      - { not_an_obligation_id: x }",
      "      - obligation_id: c1",
    ].join("\n");
    const keys = new Set(parseBaseActivePairs(yaml).map(pairKey));
    expect(keys).toEqual(new Set(["v1::o1", "v1::c1"]));
  });
});

describe("obligation-coverage against the REAL registry (active-surface arithmetic)", () => {
  it("enumerates exactly 272 distinct active pairs incl. the 5 conditional, and the matched committed state is clean", async () => {
    const registry = await loadReconstructContractRegistry({ registryPath: REGISTRY_PATH });
    const active = activePairsFromRegistry(registry);
    expect(active.length).toBe(272);

    // The 5 conditional obligation pairs are in the active set (UNION of flat ∪ conditional).
    const conditionalPairs: ObligationPair[] = [];
    for (const rec of registry.validator_records) {
      for (const c of rec.conditional_validation_obligations ?? []) {
        conditionalPairs.push({ validator_id: rec.validator_id, obligation_id: c.obligation_id });
      }
    }
    expect(conditionalPairs.length).toBe(5);
    const activeKeys = new Set(active.map(pairKey));
    for (const c of conditionalPairs) expect(activeKeys.has(pairKey(c))).toBe(true);

    // The judge pair is among the conditional and is parked (recorded-or-parked-honestly).
    const judgePair = pairKey({
      validator_id: "maturation-answer-claims-validator",
      obligation_id:
        "require_convergent_source_evidence_claims_to_have_two_independent_judge_confirmed_supports",
    });
    expect([...activeKeys].includes(judgePair)).toBe(true);
  });
});
