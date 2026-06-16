import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadReconstructContractRegistry } from "./contract-registry.js";
import {
  buildRegistryVerificationEvidenceArtifact,
  validateRegistryVerificationEvidence,
} from "./registry-verification-validation.js";

const registryPath = path.resolve(
  ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
);

async function registryFixture() {
  const contractRegistry = await loadReconstructContractRegistry({
    registryPath,
  });
  const evidence = await buildRegistryVerificationEvidenceArtifact({
    sessionId: "registry-verification-test",
    registryPath,
    contractRegistry,
  });
  return { contractRegistry, evidence };
}

describe("registry verification evidence validation", () => {
  it("validates current registry evidence", async () => {
    const { contractRegistry, evidence } = await registryFixture();

    const validation = validateRegistryVerificationEvidence({
      evidence,
      evidenceRef: "registry-verification-evidence.yaml",
      contractRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
    expect(validation.validation_gate_count).toBeGreaterThan(0);
    expect(validation.validator_count).toBeGreaterThan(0);
  });

  it("binds SourceScoutPack snapshot validators to consumed snapshot authority refs", async () => {
    const { contractRegistry } = await registryFixture();
    const gatesById = new Map(
      contractRegistry.validation_gate_catalog.map((gate) => [
        gate.gate_id,
        gate,
      ]),
    );
    const validatorsById = new Map(
      contractRegistry.validator_records.map((validator) => [
        validator.validator_id,
        validator,
      ]),
    );
    const artifactAuthorities = contractRegistry.artifact_authorities;

    expect(gatesById.get("source_scout_pack_gate"))
      ?.toMatchObject({
        validation_artifact_ref: "source-scout-pack-validation.yaml",
      });
    expect(gatesById.get("source_scout_pack_pre_seed_gate"))
      ?.toMatchObject({
        validation_artifact_ref: "source-scout-pack-validation.pre-seed.yaml",
      });
    expect(gatesById.get("source_scout_pack_post_maturation_gate"))
      ?.toMatchObject({
        validation_artifact_ref:
          "source-scout-pack-validation.post-maturation.yaml",
      });

    expect(validatorsById.get("source-scout-pack-pre-seed-validator"))
      ?.toMatchObject({
        gate_ids: ["source_scout_pack_pre_seed_gate"],
        output_ref: "source-scout-pack-validation.pre-seed.yaml",
      });
    expect(validatorsById.get("source-scout-pack-pre-seed-validator")
      ?.input_authority_refs)
      .toContain("source-scout-pack.pre-seed.yaml");
    expect(validatorsById.get("source-scout-pack-post-maturation-validator"))
      ?.toMatchObject({
        gate_ids: ["source_scout_pack_post_maturation_gate"],
        output_ref: "source-scout-pack-validation.post-maturation.yaml",
      });
    expect(validatorsById.get("source-scout-pack-post-maturation-validator")
      ?.input_authority_refs)
      .toContain("source-scout-pack.post-maturation.yaml");
    expect(artifactAuthorities.post_maturation_gate_projection_validation)
      ?.toMatchObject({
        authority_ref: "post-maturation-gate-projection-validation.yaml",
        validation_ref: null,
      });

    const seedReadinessInputs =
      validatorsById.get("seed-authoring-readiness-validator")
        ?.input_authority_refs ?? [];
    expect(seedReadinessInputs).toContain(
      "source-scout-pack-validation.pre-seed.yaml",
    );
    expect(seedReadinessInputs).not.toContain(
      "source-scout-pack-validation.yaml",
    );
  });

  it("rejects stale registry hashes", async () => {
    const { contractRegistry, evidence } = await registryFixture();

    const validation = validateRegistryVerificationEvidence({
      evidence: {
        ...evidence,
        registry_sha256:
          "0000000000000000000000000000000000000000000000000000000000000000",
      },
      contractRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((item) => item.code)).toContain(
      "registry_hash_mismatch",
    );
  });

  it("rejects active gate claims that do not match the current registry", async () => {
    const { contractRegistry, evidence } = await registryFixture();
    const omittedGateId = evidence.active_validation_gate_ids[0];

    const validation = validateRegistryVerificationEvidence({
      evidence: {
        ...evidence,
        active_validation_gate_ids: evidence.active_validation_gate_ids.slice(1),
      },
      contractRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({
        code: "registry_claim_mismatch",
        subject_id: omittedGateId,
      }),
    );
  });

  it("requires evidence rows for each current registry subject and kind", async () => {
    const { contractRegistry, evidence } = await registryFixture();
    const omittedGateId = evidence.active_validation_gate_ids[0];

    const validation = validateRegistryVerificationEvidence({
      evidence: {
        ...evidence,
        evidence_rows: evidence.evidence_rows.filter((row) =>
          row.evidence_kind !== "validation_gate_row" ||
          row.subject_id !== omittedGateId
        ),
      },
      contractRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({
        code: "evidence_row_missing",
        subject_id: omittedGateId,
      }),
    );
  });
});

describe("validateRegistryVerificationEvidence rejection branches", () => {
  it("confirms the base fixtures validate before mutation", async () => {
    const { contractRegistry, evidence } = await registryFixture();

    const validation = validateRegistryVerificationEvidence({
      evidence,
      contractRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("valid");
  });

  it("rejects evidence whose schema_version is not 1 (schema_shape_invalid)", async () => {
    const { contractRegistry, evidence } = await registryFixture();
    const mutated = structuredClone(evidence);
    // Cast through the schema type: the artifact type pins schema_version to
    // the literal "1", but the validator must still reject a divergent value.
    (mutated as { schema_version: string }).schema_version = "2";

    const validation = validateRegistryVerificationEvidence({
      evidence: mutated,
      contractRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "schema_shape_invalid"))
      .toBe(true);
  });

  it("rejects evidence with a non-sha256 registry hash (registry_hash_missing)", async () => {
    const { contractRegistry, evidence } = await registryFixture();
    const mutated = structuredClone(evidence);
    // Shape-valid string, but not a 64-char lowercase hex digest. Keep the
    // snapshot evidence row hash in sync so this isolates the missing-hash
    // branch rather than the snapshot-row hash-mismatch branch.
    mutated.registry_sha256 = "not-a-valid-sha256-digest";
    for (const row of mutated.evidence_rows) {
      if (
        row.evidence_kind === "registry_snapshot" &&
        row.subject_id === contractRegistry.registry_id
      ) {
        row.evidence_hash = "not-a-valid-sha256-digest";
      }
    }

    const validation = validateRegistryVerificationEvidence({
      evidence: mutated,
      contractRegistry,
      expectedRegistryRef: registryPath,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "registry_hash_missing"))
      .toBe(true);
  });

  it("rejects evidence whose registry_ref diverges from the loaded path (registry_ref_mismatch)", async () => {
    const { contractRegistry, evidence } = await registryFixture();
    const mutated = structuredClone(evidence);
    mutated.registry_ref = path.resolve("/tmp/some-other-registry.yaml");

    const validation = validateRegistryVerificationEvidence({
      evidence: mutated,
      contractRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "registry_ref_mismatch"))
      .toBe(true);
  });

  it("rejects evidence with a duplicated claimed id (duplicate_id)", async () => {
    const { contractRegistry, evidence } = await registryFixture();
    const mutated = structuredClone(evidence);
    // Re-append an already-claimed validator id: the id set still matches the
    // registry (sortedUnique), so this isolates the duplicate-id branch.
    mutated.active_validator_ids = [
      ...mutated.active_validator_ids,
      mutated.active_validator_ids[0],
    ];

    const validation = validateRegistryVerificationEvidence({
      evidence: mutated,
      contractRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({
        code: "duplicate_id",
        subject_id: evidence.active_validator_ids[0],
      }),
    );
  });

  it("rejects a registry whose active gate has no validator record (active_gate_without_validator)", async () => {
    const { contractRegistry, evidence } = await registryFixture();
    const orphanGateId = contractRegistry.validation_gate_catalog[0].gate_id;
    const mutatedRegistry = structuredClone(contractRegistry);
    // Drop the orphan gate id from every validator's gate_ids. Validator ids
    // and gate ids are unchanged, so evidence id claims still match.
    for (const validator of mutatedRegistry.validator_records) {
      validator.gate_ids = validator.gate_ids.filter((id) =>
        id !== orphanGateId
      );
    }

    const validation = validateRegistryVerificationEvidence({
      evidence,
      contractRegistry: mutatedRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({
        code: "active_gate_without_validator",
        subject_id: orphanGateId,
      }),
    );
  });

  it("rejects a registry whose validator references an unknown gate (validator_unknown_gate)", async () => {
    const { contractRegistry, evidence } = await registryFixture();
    const mutatedRegistry = structuredClone(contractRegistry);
    const validator = mutatedRegistry.validator_records[0];
    // Reference a gate id absent from the active gate catalog. Validator ids
    // and gate ids stay aligned with the evidence claims.
    validator.gate_ids = [...validator.gate_ids, "nonexistent_gate"];

    const validation = validateRegistryVerificationEvidence({
      evidence,
      contractRegistry: mutatedRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({
        code: "validator_unknown_gate",
        subject_id: validator.validator_id,
      }),
    );
  });

  it("rejects a registry whose gate uses an unknown predicate (predicate_missing_for_gate)", async () => {
    const { contractRegistry, evidence } = await registryFixture();
    const mutatedRegistry = structuredClone(contractRegistry);
    const gate = mutatedRegistry.validation_gate_catalog[0];
    // Point required_when at a predicate id absent from the predicate catalog.
    // Predicate ids and gate ids are unchanged, so evidence claims still match.
    gate.required_when = "nonexistent_predicate";

    const validation = validateRegistryVerificationEvidence({
      evidence,
      contractRegistry: mutatedRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({
        code: "predicate_missing_for_gate",
        subject_id: gate.gate_id,
      }),
    );
  });

  it("rejects evidence with a non-verified evidence row status (invalid_evidence_status)", async () => {
    const { contractRegistry, evidence } = await registryFixture();
    const mutated = structuredClone(evidence);
    const targetRow = mutated.evidence_rows[0];
    targetRow.evidence_status = "invalid";

    const validation = validateRegistryVerificationEvidence({
      evidence: mutated,
      contractRegistry,
      expectedRegistryRef: registryPath,
      expectedRegistrySha256: evidence.registry_sha256,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations).toContainEqual(
      expect.objectContaining({
        code: "invalid_evidence_status",
        subject_id: targetRow.evidence_id,
      }),
    );
  });
});
