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
  it("validates generated source-safety rows with exactly six canonical axes", () => {
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
      "privacy_state",
      "redaction_state",
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

  it("derives redacted_output_only for sensitive prompt-context evidence", () => {
    const observations = sourceObservations("API_KEY='sk_live_secret_value'\n");
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });
    const row = rowForConsumption(ledger, "prompt_context");

    expect(row.privacy_state).toBe("privacy_sensitive");
    expect(row.redaction_state).toBe("required");
    expect(row.visibility_tier).toBe("redacted_output_only");
    expect(row.redaction_evidence.allowed_proof_forms).not.toContain("raw_value");
  });

  it("treats non-secret personal data as privacy-sensitive source evidence", () => {
    const observations = sourceObservations(
      "Customer contact: student@example.com, phone 010-1234-5678\n",
    );
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });
    const row = rowForConsumption(ledger, "prompt_context");
    const evidenceRow = rowForConsumption(ledger, "evidence_support");
    const materialClaimRow = rowForConsumption(ledger, "material_claim");

    expect(row.privacy_state).toBe("privacy_sensitive");
    expect(row.proof_sufficiency_state).toBe("trace_only");
    expect(row.replay_state).toBe("replay_with_redaction");
    expect(row.visibility_tier).toBe("redacted_output_only");
    expect(evidenceRow.visibility_tier).toBe("internal_only");
    expect(materialClaimRow.visibility_tier).toBe("no_prompt_use");
    expect(row.limitation_refs).toContain("source-safety-sensitive-source:obs-code-1");
  });

  it("fails when visibility_tier contradicts the six-axis derivation", () => {
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
          "privacy_state",
          "redaction_state",
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

  it("fails when redaction_evidence grants raw_value against top-level redaction state", () => {
    const observations = sourceObservations("password='very-secret-value'\n");
    const ledger = buildSourceSafetyLedgerFromSourceObservations({
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
    });
    ledger.safety_rows[0] = {
      ...firstRow(ledger),
      redaction_evidence: {
        ...firstRow(ledger).redaction_evidence,
        allowed_proof_forms: ["raw_value", "hash"],
      },
    };

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toContain(
      "supporting_detail_contradiction",
    );
  });

  it("fails when proof detail says unavailable but top-level proof state says sufficient", () => {
    const observations = sourceObservations();
    const ledger = validLedger();
    ledger.safety_rows[0] = {
      ...firstRow(ledger),
      redaction_evidence: {
        ...firstRow(ledger).redaction_evidence,
        allowed_proof_forms: ["unavailable"],
      },
      visibility_tier: "no_prompt_use",
    };

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toContain(
      "supporting_detail_contradiction",
    );
  });

  it("fails when raw_value is allowed while raw_value_available is false", () => {
    const observations = sourceObservations();
    const ledger = validLedger();
    ledger.safety_rows[0] = {
      ...firstRow(ledger),
      redaction_evidence: {
        ...firstRow(ledger).redaction_evidence,
        raw_value_available: false,
        allowed_proof_forms: ["raw_value", "hash"],
      },
    };

    const validation = validateSourceSafetyLedger({
      sourceSafetyLedger: ledger,
      sourceObservations: observations,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toContain(
      "supporting_detail_contradiction",
    );
  });
});
