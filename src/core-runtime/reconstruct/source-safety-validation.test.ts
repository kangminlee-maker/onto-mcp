import { describe, expect, it } from "vitest";
import type {
  ReconstructSourceObservationsArtifact,
  ReconstructSourceSafetyIntendedConsumption,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyRow,
} from "./artifact-types.js";
import {
  buildSourceSafetyLedgerFromSourceObservations,
  deriveSourceSafetyVisibilityTier,
  validateSourceSafetyLedger,
} from "./source-safety-validation.js";

const now = "2026-06-02T00:00:00.000Z";

function sourceObservations(
  contentExcerpt = "export const feature = true;\n",
  explicitAuthorizations: ReconstructSourceSafetyIntendedConsumption[] = [],
  isRuntimeTargetSource = false,
): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    observations: [
      {
        observation_id: "obs-code-1",
        target_material_kind: "code",
        adapter_id: "minimal-code-structure-observer",
        source_ref: "src/feature.ts",
        location: "src/feature.ts",
        ...(isRuntimeTargetSource ? { is_runtime_target_source: true } : {}),
        summary: "code material observed at feature.ts",
        structural_data: {
          content_sha256: "sha256-fixture",
          content_excerpt: contentExcerpt,
          ...(explicitAuthorizations.length > 0
            ? { source_safety_consumption_authorizations: explicitAuthorizations }
            : {}),
        },
      },
    ],
    skipped_refs: [],
    validation_results: ["valid"],
  };
}

function validLedger(): ReconstructSourceSafetyLedgerArtifact {
  return buildSourceSafetyLedgerFromSourceObservations({
    sourceObservations: sourceObservations(),
    sourceObservationsRef: "source-observations.yaml",
  });
}

function firstRow(ledger: ReconstructSourceSafetyLedgerArtifact): ReconstructSourceSafetyRow {
  return rowForConsumption(ledger, "prompt_context");
}

function rowForConsumption(
  ledger: ReconstructSourceSafetyLedgerArtifact,
  intendedConsumption: ReconstructSourceSafetyIntendedConsumption,
): ReconstructSourceSafetyRow {
  const row = ledger.safety_rows.find((item) =>
    item.visibility_derivation.intended_consumption === intendedConsumption
  );
  if (!row) throw new Error("fixture ledger has no row");
  return row;
}

describe("source safety validation", () => {
  it("validates generated source-safety rows with exactly four canonical axes", () => {
    const observations = sourceObservations();
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.safety_row_count).toBe(5);
    expect(ledger.safety_rows.map((row) =>
      row.visibility_derivation.intended_consumption
    )).toEqual([
      "prompt_context",
      "evidence_support",
      "public_output",
      "replay",
      "material_claim",
    ]);
    expect(ledger.safety_rows.map((row) => row.safety_row_id)).toEqual([
      "source_safety:obs-code-1:prompt_context",
      "source_safety:obs-code-1:evidence_support",
      "source_safety:obs-code-1:public_output",
      "source_safety:obs-code-1:replay",
      "source_safety:obs-code-1:material_claim",
    ]);
    expect(firstRow(ledger).visibility_derivation.derived_from_axes).toEqual([
      "lifecycle_state",
      "authorization_state",
      "proof_sufficiency_state",
      "replay_state",
    ]);
    expect(firstRow(ledger).visibility_tier).toBe("consumption_allowed");
    expect(rowForConsumption(ledger, "evidence_support").visibility_tier)
      .toBe("internal_only");
    expect(rowForConsumption(ledger, "public_output").visibility_tier)
      .toBe("no_prompt_use");
    expect(rowForConsumption(ledger, "material_claim").visibility_tier)
      .toBe("no_prompt_use");
    expect(rowForConsumption(ledger, "material_claim").limitation_refs)
      .toContain("source-safety-consumption-authorization-gap:obs-code-1:material_claim");
  });

  it("allows public and material consumption only when explicitly authorized", () => {
    const observations = sourceObservations("export const feature = true;\n", [
      "public_output",
      "material_claim",
    ]);
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });

    expect(rowForConsumption(ledger, "public_output").visibility_tier)
      .toBe("consumption_allowed");
    expect(rowForConsumption(ledger, "material_claim").visibility_tier)
      .toBe("consumption_allowed");
    expect(rowForConsumption(ledger, "material_claim").authorization_scope_ref)
      .toBe("source_safety_explicit_consumption_authorization");
  });

  it("Defect-3 basis A: a runtime-target observation authorizes material_claim/public_output by provenance (no explicit field), scoped to runtime_target_ref_read_scope", () => {
    const observations = sourceObservations("export const feature = true;\n", [], true);
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });

    expect(rowForConsumption(ledger, "material_claim").visibility_tier)
      .toBe("consumption_allowed");
    expect(rowForConsumption(ledger, "public_output").visibility_tier)
      .toBe("consumption_allowed");
    // Basis A is audited as the runtime-target relation, NOT mislabeled as explicit.
    expect(rowForConsumption(ledger, "material_claim").authorization_scope_ref)
      .toBe("runtime_target_ref_read_scope");

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });
    expect(validation.validation_status).toBe("valid");
  });

  it("Defect-3 governance: a NON-runtime-target observation without explicit authorization keeps material_claim/public_output gated (no leak)", () => {
    const observations = sourceObservations("export const feature = true;\n", [], false);
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });

    expect(rowForConsumption(ledger, "material_claim").visibility_tier)
      .toBe("no_prompt_use");
    expect(rowForConsumption(ledger, "public_output").visibility_tier)
      .toBe("no_prompt_use");
  });

  it("Defect-3 D3: rejects a forged authorized material_claim row with neither basis A nor B", () => {
    // A non-target observation with no explicit authorization: a tampered/replayed
    // ledger that flips its material_claim row to authorized + consumption_allowed
    // would re-derive consistently from the four axes, so only the basis-attribution
    // check catches it.
    const observations = sourceObservations("export const feature = true;\n", [], false);
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });
    const materialIndex = ledger.safety_rows.findIndex((row) =>
      row.visibility_derivation.intended_consumption === "material_claim"
    );
    ledger.safety_rows[materialIndex] = {
      ...ledger.safety_rows[materialIndex],
      authorization_state: "authorized",
      proof_sufficiency_state: "sufficient_for_claim",
      replay_state: "replay_allowed",
      visibility_tier: "consumption_allowed",
    };

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((v) => v.code)).toContain(
      "unjustified_consumption_authorization",
    );
  });

  it("Defect-3 D3: also rejects the not_required bypass (forged outward row reaching consumption_allowed without basis A/B)", () => {
    // not_required is a valid authorization_state that ALSO derives to
    // consumption_allowed for the outward tiers — a D3 trigger keyed only on
    // "authorized" would miss it. D3 keys on the derived outcome, so it fires.
    const observations = sourceObservations("export const feature = true;\n", [], false);
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });
    for (const consumption of ["material_claim", "public_output"] as const) {
      const index = ledger.safety_rows.findIndex((row) =>
        row.visibility_derivation.intended_consumption === consumption
      );
      ledger.safety_rows[index] = {
        ...ledger.safety_rows[index],
        authorization_state: "not_required",
        proof_sufficiency_state: "sufficient_for_claim",
        replay_state: "replay_allowed",
        visibility_tier: "consumption_allowed",
      };
    }

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });
    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.filter((v) =>
        v.code === "unjustified_consumption_authorization"
      ),
    ).toHaveLength(2);
  });

  it("fails when visibility_tier contradicts the canonical-axis derivation", () => {
    const observations = sourceObservations();
    const ledger = validLedger();
    ledger.safety_rows[0] = {
      ...firstRow(ledger),
      visibility_tier: "no_prompt_use",
    };

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toContain(
      "visibility_derivation_mismatch",
    );
    expect(deriveSourceSafetyVisibilityTier(firstRow(validLedger()))).toBe(
      "consumption_allowed",
    );
  });

  it("fails when derived_from_axes omits a canonical source-safety axis", () => {
    const observations = sourceObservations();
    const ledger = validLedger();
    ledger.safety_rows[0] = {
      ...firstRow(ledger),
      visibility_derivation: {
        ...firstRow(ledger).visibility_derivation,
        derived_from_axes: [
          "lifecycle_state",
          "authorization_state",
          "proof_sufficiency_state",
        ],
      },
    };

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toContain(
      "visibility_axis_set_invalid",
    );
  });

  it("fails a stale row that still carries retired axes instead of laundering them away (Codex P2)", () => {
    const observations = sourceObservations();
    const ledger = validLedger();
    ledger.safety_rows[0] = {
      ...firstRow(ledger),
      visibility_derivation: {
        ...firstRow(ledger).visibility_derivation,
        // A pre-refactor ledger that still lists the removed privacy_state /
        // redaction_state axes must NOT normalize down to exactly four and pass.
        derived_from_axes: [
          "lifecycle_state",
          "authorization_state",
          "privacy_state",
          "redaction_state",
          "proof_sufficiency_state",
          "replay_state",
        ] as ReconstructSourceSafetyRow["visibility_derivation"]["derived_from_axes"],
      },
    };

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toContain(
      "visibility_axis_set_invalid",
    );
  });

  it("fails when an observed source has no source-safety row", () => {
    const observations = sourceObservations();
    const ledger = validLedger();
    ledger.safety_rows = [];

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toContain(
      "source_observation_safety_row_missing",
    );
  });

  it("fails when a safety row id is bound to a different observed source_ref", () => {
    const observations = sourceObservations();
    const ledger = validLedger();
    ledger.safety_rows[0] = {
      ...firstRow(ledger),
      subject_ref: "src/other.ts",
    };

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: {
        ...observations,
        observations: [
          ...observations.observations,
          {
            ...observations.observations[0]!,
            observation_id: "obs-code-2",
            source_ref: "src/other.ts",
            location: "src/other.ts",
          },
        ],
      },
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toContain(
      "source_observation_missing",
    );
  });

  it("rejects non-source subject kinds until broader source-safety sinks are implemented", () => {
    const observations = sourceObservations();
    const ledger = validLedger();
    ledger.safety_rows[0] = {
      ...firstRow(ledger),
      subject_kind: "artifact_ref" as ReconstructSourceSafetyRow["subject_kind"],
    };

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toContain(
      "invalid_enum",
    );
  });

  it("throws a contextualized integrity error when source-observations.observations is malformed", () => {
    // A torn write or tampering could leave `observations` as a non-array.
    // The trusted-read shape guard must surface which artifact/field is bad
    // instead of crashing deep inside with an uncontextualized TypeError.
    const malformed = {
      ...sourceObservations(),
      observations: null,
    } as unknown as ReconstructSourceObservationsArtifact;

    expect(() =>
      buildSourceSafetyLedgerFromSourceObservations({ sourceObservations: malformed }),
    ).toThrow(
      "artifact integrity: source-observations field 'observations' must be an array, got null",
    );
  });
});

describe("validateSourceSafetyLedger rejection branches", () => {
  it("confirms the deep-clonable base fixtures validate before mutation", () => {
    const observations = sourceObservations();
    const ledger = structuredClone(validLedger());

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("valid");
  });

  it("rejects a safety_rows element that is not an object (schema_shape_invalid)", () => {
    const observations = sourceObservations();
    const ledger = structuredClone(validLedger());
    // safety_rows stays a real array; one element is a non-record value that
    // normalizeSafetyRow cannot interpret as a row.
    ledger.safety_rows[0] =
      "not-a-row" as unknown as ReconstructSourceSafetyRow;

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "schema_shape_invalid"))
      .toBe(true);
  });

  it("rejects a ledger whose session_id differs from source observations (session_id_mismatch)", () => {
    const observations = sourceObservations();
    const ledger = structuredClone(validLedger());
    ledger.session_id = "session-mismatch";

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "session_id_mismatch"))
      .toBe(true);
  });

  it("rejects a ledger with a duplicate safety row id (duplicate_id)", () => {
    const observations = sourceObservations();
    const ledger = structuredClone(validLedger());
    // Collapse the second row's id onto the first; safety_row_id stays a real
    // string, so this is a semantic id collision rather than a shape fault.
    ledger.safety_rows[1] = {
      ...ledger.safety_rows[1]!,
      safety_row_id: ledger.safety_rows[0]!.safety_row_id,
    };

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "duplicate_id"))
      .toBe(true);
  });
});
