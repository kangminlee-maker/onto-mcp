import { describe, expect, it } from "vitest";
import type {
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import {
  buildSourceSafetyLedgerFromSourceObservations,
  validateSourceSafetyLedger,
} from "./source-safety-validation.js";
import {
  buildSourceScoutPackFromArtifacts,
  validateSourceScoutPack,
} from "./source-scout-pack-validation.js";

const createdAt = "2026-06-03T00:00:00.000Z";

function sourceObservations(
  kind: "code" | "document" | "spreadsheet" = "code",
): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "source-scout-test",
    created_at: createdAt,
    observations: [
      {
        observation_id: "obs-scout-1",
        target_material_kind: kind,
        adapter_id: `minimal-${kind}-structure-observer`,
        source_ref: `/tmp/scout-target.${kind === "code" ? "ts" : "md"}`,
        location: `/tmp/scout-target.${kind === "code" ? "ts" : "md"}`,
        summary: `${kind} material observed at scout-target`,
        structural_data: {
          basename: kind === "code" ? "user-command-state.ts" : "status-report.md",
          extension: kind === "code" ? ".ts" : ".md",
          path_kind: "file",
          size_bytes: 128,
          line_count: 3,
          char_count: 128,
          content_sha256: "content-sha",
          content_excerpt: kind === "code"
            ? "export function createUserCommand(status: PendingState) { validatePermission(); }"
            : "Owner status report: open action item requires approval.",
          excerpt_truncated: false,
        },
      },
    ],
    skipped_refs: [],
    validation_results: ["source_observations_valid"],
  };
}

function targetMaterialProfile(
  kind: "code" | "document" | "spreadsheet" = "code",
): ReconstructTargetMaterialProfileArtifact {
  return {
    schema_version: "1",
    session_id: "source-scout-test",
    created_at: createdAt,
    target_refs: ["/tmp/scout-target"],
    target_material_kind: kind,
    target_material_kind_candidates: [kind],
    support_status: kind === "spreadsheet" ? "unsupported" : "partial",
    unsupported_reason: kind === "spreadsheet" ? "fixture unsupported" : null,
    selected_source_profiles: kind === "spreadsheet"
      ? []
      : [
        {
          profile_id: `${kind}-source-profile`,
          target_material_kind: kind,
          is_default_for_kind: true,
          definition_ref: `.onto/processes/reconstruct/source-profiles/${kind}.md`,
          definition_sha256: "fixture",
          profile_ref: `.onto/processes/reconstruct/source-profiles/${kind}.md`,
          contract_status: "active",
          runtime_implementation_status: "partially_wired",
          schema_version: 1,
          profile_version: 1,
          migration_status: "current",
          supersedes: [],
          replaced_by: [],
          split_from: [],
          split_into: [],
          merged_from: [],
          merged_into: [],
          support_summary: "fixture",
          scan_targets: ["fixture"],
        },
      ],
    detection: {
      owner: "runtime_heuristic",
      confidence: 1,
      confidence_basis: "fixture",
      per_ref: [
        {
          ref: "/tmp/scout-target",
          exists: true,
          kind,
          confidence: 1,
          confidence_basis: "fixture",
        },
      ],
    },
  };
}

function targetMaterialProfileValidation(
  valid = true,
): ReconstructTargetMaterialProfileValidationArtifact {
  return {
    schema_version: "1",
    session_id: "source-scout-test",
    created_at: createdAt,
    target_material_profile_ref: "target-material-profile.yaml",
    registry_ref: "reconstruct-contract-registry.yaml",
    validation_status: valid ? "valid" : "invalid",
    target_ref_count: 1,
    selected_source_profile_count: 1,
    validation_results: valid
      ? ["target_material_profile_valid"]
      : ["target_material_profile_invalid"],
    violations: [],
  };
}

function safetyArtifacts(sourceObservationArtifact: ReconstructSourceObservationsArtifact) {
  const ledger = buildSourceSafetyLedgerFromSourceObservations({
    sourceObservations: sourceObservationArtifact,
    sourceObservationsRef: "source-observations.yaml",
  });
  const validation = validateSourceSafetyLedger({
    sourceSafetyLedger: ledger,
    sourceSafetyLedgerRef: "source-safety-ledger.yaml",
    sourceObservations: sourceObservationArtifact,
    sourceObservationsRef: "source-observations.yaml",
  });
  return { ledger, validation };
}

describe("source scout pack validation", () => {
  it("builds a valid actor-action-state scout pack from prompt-visible code observations", async () => {
    const observations = sourceObservations("code");
    const safety = safetyArtifacts(observations);
    const pack = buildSourceScoutPackFromArtifacts({
      targetMaterialProfile: targetMaterialProfile("code"),
      targetMaterialProfileRef: "target-material-profile.yaml",
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      targetMaterialProfileValidationRef: "target-material-profile-validation.yaml",
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceSafetyLedgerValidation: safety.validation,
      sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
    });
    const validation = await validateSourceScoutPack({
      sourceScoutPack: pack,
      sourceScoutPackRef: "source-scout-pack.yaml",
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceSafetyLedgerValidation: safety.validation,
      sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      targetMaterialProfileValidationRef: "target-material-profile-validation.yaml",
    });

    expect(validation.validation_status).toBe("valid");
    expect(pack.scout_scope.scope_state)
      .toBe("supported_single_member_code_or_document");
    expect(pack.signal_rows.some((row) => row.signal_axis === "actor")).toBe(true);
    expect(pack.signal_rows.some((row) => row.signal_axis === "action")).toBe(true);
    expect(pack.signal_rows.some((row) => row.signal_axis === "state")).toBe(true);
    expect(validation.prompt_visible_signal_count).toBeGreaterThan(0);
  });

  it("rejects selected-purpose required element leakage", async () => {
    const observations = sourceObservations("code");
    const safety = safetyArtifacts(observations);
    const pack = buildSourceScoutPackFromArtifacts({
      targetMaterialProfile: targetMaterialProfile("code"),
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceObservations: observations,
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerValidation: safety.validation,
    });
    (pack as unknown as Record<string, unknown>).purpose_required_element_ref =
      "purpose-required-element:actor";
    const validation = await validateSourceScoutPack({
      sourceScoutPack: pack,
      sourceObservations: observations,
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerValidation: safety.validation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code))
      .toContain("selected_purpose_authority_leak");
  });

  it("rejects stale source scout packs whose upstream snapshot hashes drift", async () => {
    const observations = sourceObservations("code");
    const safety = safetyArtifacts(observations);
    const pack = buildSourceScoutPackFromArtifacts({
      targetMaterialProfile: targetMaterialProfile("code"),
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceObservations: observations,
      sourceObservationsSha256: "old-source-observations",
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerSha256: "old-source-safety-ledger",
      sourceSafetyLedgerValidation: safety.validation,
      sourceSafetyLedgerValidationSha256: "old-source-safety-validation",
      targetMaterialProfileValidationSha256: "old-target-profile-validation",
    });
    const validation = await validateSourceScoutPack({
      sourceScoutPack: pack,
      sourceObservations: observations,
      sourceObservationsSha256: "new-source-observations",
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerSha256: "new-source-safety-ledger",
      sourceSafetyLedgerValidation: safety.validation,
      sourceSafetyLedgerValidationSha256: "new-source-safety-validation",
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      targetMaterialProfileValidationSha256: "new-target-profile-validation",
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "source_observations_hash_mismatch",
        "source_safety_hash_mismatch",
        "target_material_profile_validation_hash_mismatch",
      ]),
    );
  });

  it("rejects stale source scout packs whose lineage validation ref or hash drifts", async () => {
    const observations = sourceObservations("code");
    const safety = safetyArtifacts(observations);
    const pack = buildSourceScoutPackFromArtifacts({
      targetMaterialProfile: targetMaterialProfile("code"),
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceObservations: observations,
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerValidation: safety.validation,
      sourceObservationLineageIndexValidationRef:
        "source-observation-lineage-index-validation.yaml",
      sourceObservationLineageIndexValidationSha256: "old-lineage-validation",
    });
    const validation = await validateSourceScoutPack({
      sourceScoutPack: {
        ...pack,
        source_observation_lineage_index_validation_ref:
          "stale-lineage-validation.yaml",
      },
      sourceObservations: observations,
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerValidation: safety.validation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceObservationLineageIndexValidationRef:
        "source-observation-lineage-index-validation.yaml",
      sourceObservationLineageIndexValidationSha256: "new-lineage-validation",
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "source_observation_lineage_index_validation_ref_mismatch",
        "source_observation_lineage_index_validation_hash_mismatch",
      ]),
    );
  });

  it("keeps unsupported material scope valid only when no signal rows are projected", async () => {
    const observations = sourceObservations("spreadsheet");
    const safety = safetyArtifacts(observations);
    const pack = buildSourceScoutPackFromArtifacts({
      targetMaterialProfile: targetMaterialProfile("spreadsheet"),
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceObservations: observations,
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerValidation: safety.validation,
    });
    const validProjection = await validateSourceScoutPack({
      sourceScoutPack: pack,
      sourceObservations: observations,
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerValidation: safety.validation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
    });
    pack.signal_rows.push({
      signal_row_id: "source_scout:overclaim",
      observation_id: "obs-scout-1",
      source_ref: "/tmp/scout-target.ts",
      target_material_kind: "code",
      signal_axis: "actor",
      signal_basis: "path",
      matched_text: "user",
      matched_text_sha256: "hash",
      evidence_locator: "/tmp/scout-target.ts",
      profile_ref: null,
      source_observation_ref: null,
      source_observation_content_sha256: "content-sha",
      source_safety_row_id: safety.ledger.safety_rows[0]?.safety_row_id ?? null,
      source_safety_ledger_ref: null,
      source_safety_ledger_validation_ref: null,
      prompt_visibility_state: "prompt_visible",
      intended_consumption: "scout_prompt_input",
      redaction_summary: null,
      limitation_refs: [],
    });
    const invalidProjection = await validateSourceScoutPack({
      sourceScoutPack: pack,
      sourceObservations: observations,
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerValidation: safety.validation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
    });

    expect(validProjection.validation_status).toBe("valid");
    expect(pack.scout_scope.scope_state).toBe("unsupported_material_scope");
    expect(invalidProjection.validation_status).toBe("invalid");
    expect(invalidProjection.violations.map((item) => item.code))
      .toContain("unsupported_scope_overclaimed");
  });

  it("keeps mixed composite scout scope signal-free until member-scoped support is promoted", async () => {
    const observations = sourceObservations("code");
    const safety = safetyArtifacts(observations);
    const codeProfile = targetMaterialProfile("code").selected_source_profiles[0]!;
    const mixedProfile: ReconstructTargetMaterialProfileArtifact = {
      ...targetMaterialProfile("code"),
      target_material_kind: "mixed",
      target_material_kind_candidates: ["code", "document"],
      selected_source_profiles: [
        codeProfile,
        {
          ...codeProfile,
          profile_id: "document-source-profile",
          target_material_kind: "document",
          definition_ref: ".onto/processes/reconstruct/source-profiles/document.md",
          profile_ref: ".onto/processes/reconstruct/source-profiles/document.md",
        },
      ],
      detection: {
        ...targetMaterialProfile("code").detection,
        per_ref: [
          {
            ref: "/tmp/scout-target.ts",
            exists: true,
            kind: "code",
            confidence: 1,
            confidence_basis: "fixture code member",
          },
          {
            ref: "/tmp/scout-target.md",
            exists: true,
            kind: "document",
            confidence: 1,
            confidence_basis: "fixture document member",
          },
        ],
      },
    };
    const pack = buildSourceScoutPackFromArtifacts({
      targetMaterialProfile: mixedProfile,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      sourceObservations: observations,
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerValidation: safety.validation,
    });
    const validation = await validateSourceScoutPack({
      sourceScoutPack: pack,
      sourceObservations: observations,
      sourceSafetyLedger: safety.ledger,
      sourceSafetyLedgerValidation: safety.validation,
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
    });

    expect(validation.validation_status).toBe("valid");
    expect(pack.scout_scope.scope_state).toBe("member_scoped_composite");
    expect(pack.scout_scope.limitation_refs)
      .toContain("source_scout_phase1_composite_member_scope_not_prompt_claimed");
    expect(pack.signal_rows).toHaveLength(0);
    expect(validation.prompt_visible_signal_count).toBe(0);
    expect(pack.profile_scout_coverage_slots.every((slot) =>
      slot.status !== "present"
    )).toBe(true);
  });
});
