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
