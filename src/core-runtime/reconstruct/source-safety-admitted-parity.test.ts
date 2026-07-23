import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ReconstructSourceObservationsArtifact } from "./artifact-types.js";
import {
  buildSourceSafetyLedgerFromSourceObservations,
  deriveSourceSafetyVisibilityTier,
  validateSourceSafetyLedger,
} from "./source-safety-validation.js";

// Core Stage 2 inter-document breadth — provenance parity fix (design 20260723-stage2-value-bench §9).
// A user runtime-target file that admission DEFERRED and a later frontier round RECOVERED is stamped
// is_runtime_target_source:false + a non-null trigger (the frontier path is forced to: the boundary
// guard forbids target+trigger, delta requires the trigger). Before the fix its material_claim /
// public_output source-safety rows were never authorized, so the seed's answer-support hard-failed
// (validateAnswerSupportLedger: "must have an observation-specific material_claim source-safety row").
// The fix authorizes those tiers when the source_ref resolves to an inventory unit the runtime marked
// scan_status:"admitted" — a TRUSTED signal keyed on the inventory census, not the observation.

const now = "2026-06-02T00:00:00.000Z";

/** A frontier-recovered observation: is_runtime_target_source ABSENT (frontier path never sets it),
 *  a non-null trigger, from a later round. This is exactly what observeAcceptedFrontierRefs emits. */
function frontierRecoveredObservations(
  sourceRef = "src/chat.ts",
): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    observations: [
      {
        observation_id: "obs-recovered-1",
        round_id: "round-1",
        observation_batch_id: "source-observation-batch:round-1:source_frontier",
        triggering_frontier_validation_ref: "source-frontier-validation.round-1.yaml",
        // is_runtime_target_source deliberately ABSENT (the frontier path stamps false-by-omission).
        target_material_kind: "code",
        adapter_id: "minimal-code-structure-observer",
        source_ref: sourceRef,
        location: sourceRef,
        summary: "recovered admitted code observed at a later frontier round",
        structural_data: {
          content_sha256: "sha256-fixture",
          content_excerpt: "export const chat = true;\n",
        },
      },
    ],
    skipped_refs: [],
    validation_results: ["valid"],
  };
}

function materialClaimAuthorized(
  observations: ReconstructSourceObservationsArtifact,
  admittedSourceRefs: ReadonlySet<string>,
): { authorized: boolean; consumptionAllowed: boolean; found: boolean } {
  const ledger = buildSourceSafetyLedgerFromSourceObservations({
    sourceObservations: observations,
    sourceObservationsRef: "source-observations.yaml",
    admittedSourceRefs,
  });
  const row = ledger.safety_rows.find(
    (r) => r.visibility_derivation.intended_consumption === "material_claim",
  );
  if (!row) return { authorized: false, consumptionAllowed: false, found: false };
  return {
    found: true,
    authorized: row.authorization_state === "authorized",
    consumptionAllowed: deriveSourceSafetyVisibilityTier(row) === "consumption_allowed",
  };
}

describe("Stage 2 admitted-inventory provenance parity (design 20260723 §9)", () => {
  const recoveredRef = "src/chat.ts";
  const observations = frontierRecoveredObservations(recoveredRef);
  const admitted = new Set([path.resolve(recoveredRef)]);

  it("reproduces the gap: a recovered frontier observation is NOT material-claim authorized without the admitted proof", () => {
    const res = materialClaimAuthorized(observations, new Set<string>());
    expect(res.found).toBe(true); // non-vacuous: the subject row exists
    expect(res.authorized).toBe(false);
    expect(res.consumptionAllowed).toBe(false);
  });

  it("fix: the same recovered observation IS material-claim + public-output authorized when its ref is admitted", () => {
    const res = materialClaimAuthorized(observations, admitted);
    expect(res.found).toBe(true);
    expect(res.authorized).toBe(true);
    expect(res.consumptionAllowed).toBe(true);
    // public_output too (the second outward tier)
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
      admittedSourceRefs: admitted,
    });
    const pub = ledger.safety_rows.find(
      (r) => r.visibility_derivation.intended_consumption === "public_output",
    );
    expect(pub?.authorization_state).toBe("authorized");
  });

  it("builder + D3 validator stay in lockstep: the admitted-proof ledger validates clean", () => {
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
      admittedSourceRefs: admitted,
    });
    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
      admittedSourceRefs: admitted,
    });
    expect(validation.validation_status).toBe("valid");
    expect(
      validation.violations.some(
        (v) => v.code === "unjustified_consumption_authorization",
      ),
    ).toBe(false);
  });

  it("forgery control: the grant is inventory-gated, not observation-gated — a recovered obs whose ref is NOT admitted stays unauthorized", () => {
    // admittedSourceRefs contains a DIFFERENT ref: the observation alone cannot manufacture the grant.
    const res = materialClaimAuthorized(observations, new Set([path.resolve("src/other.ts")]));
    expect(res.found).toBe(true);
    expect(res.authorized).toBe(false);
  });

  it("forgery control: D3 rejects a tampered ledger that forces consumption_allowed without the admitted proof", () => {
    // Build authorized rows (with the admitted proof), then re-validate WITHOUT the proof (as a
    // forger/replay would present): D3 must reject the now-unjustified consumption_allowed rows.
    const tamperedLedger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
      admittedSourceRefs: admitted, // rows come out consumption_allowed
    });
    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: tamperedLedger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
      admittedSourceRefs: new Set<string>(), // validator does NOT see the proof
    });
    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some(
        (v) => v.code === "unjustified_consumption_authorization",
      ),
    ).toBe(true);
  });

  it("off-path byte-identity: omitting admittedSourceRefs equals passing an empty set (pre-Stage-2 behavior)", () => {
    const omitted = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });
    const empty = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
      admittedSourceRefs: new Set<string>(),
    });
    expect(JSON.stringify(omitted)).toBe(JSON.stringify(empty));
    // and the recovered observation stays unauthorized off-path (conservative downgrade intact)
    const row = omitted.safety_rows.find(
      (r) => r.visibility_derivation.intended_consumption === "material_claim",
    );
    expect(row?.authorization_state).toBe("unknown");
  });
});
