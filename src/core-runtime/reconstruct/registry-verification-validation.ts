import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructRegistryVerificationEvidenceArtifact,
  ReconstructRegistryVerificationEvidenceRow,
  ReconstructRegistryVerificationEvidenceValidationArtifact,
  ReconstructRegistryVerificationEvidenceValidationViolation,
} from "./artifact-types.js";
import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
} from "./contract-registry.js";

function isoNow(): string {
  return new Date().toISOString();
}

async function sha256File(filePath: string): Promise<string> {
  return crypto
    .createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

async function writeYamlDocument(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyYaml(value), "utf8");
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function evidenceRow(args: {
  evidenceKind: ReconstructRegistryVerificationEvidenceRow["evidence_kind"];
  subjectId: string;
  evidenceRef: string;
  evidenceHash?: string | null;
}): ReconstructRegistryVerificationEvidenceRow {
  return {
    evidence_id: `registry-evidence:${args.evidenceKind}:${args.subjectId}`,
    evidence_kind: args.evidenceKind,
    subject_id: args.subjectId,
    evidence_ref: args.evidenceRef,
    evidence_status: "verified",
    evidence_hash: args.evidenceHash ?? null,
  };
}

export async function buildRegistryVerificationEvidenceArtifact(args: {
  sessionId: string;
  registryPath: string;
  contractRegistry: ReconstructContractRegistry;
}): Promise<ReconstructRegistryVerificationEvidenceArtifact> {
  const registryRef = path.resolve(args.registryPath);
  const registryHash = await sha256File(registryRef);
  const artifactAuthorityIds = Object.keys(args.contractRegistry.artifact_authorities)
    .sort();
  const gateIds = args.contractRegistry.validation_gate_catalog
    .map((gate) => gate.gate_id)
    .sort();
  const validatorIds = args.contractRegistry.validator_records
    .map((validator) => validator.validator_id)
    .sort();
  const predicateIds = args.contractRegistry.required_when_predicate_catalog
    .map((predicate) => predicate.predicate_id)
    .sort();
  const sourceProfileIds = args.contractRegistry.source_profile_records
    .map((profile) => profile.profile_id)
    .sort();
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    registry_ref: registryRef,
    registry_sha256: registryHash,
    active_artifact_authority_ids: artifactAuthorityIds,
    active_validation_gate_ids: gateIds,
    active_validator_ids: validatorIds,
    required_when_predicate_ids: predicateIds,
    source_profile_ids: sourceProfileIds,
    evidence_rows: [
      evidenceRow({
        evidenceKind: "registry_snapshot",
        subjectId: args.contractRegistry.registry_id,
        evidenceRef: registryRef,
        evidenceHash: registryHash,
      }),
      ...artifactAuthorityIds.map((id) => evidenceRow({
        evidenceKind: "artifact_authority_row",
        subjectId: id,
        evidenceRef: `${registryRef}#artifact_authorities.${id}`,
      })),
      ...gateIds.map((id) => evidenceRow({
        evidenceKind: "validation_gate_row",
        subjectId: id,
        evidenceRef: `${registryRef}#validation_gate_catalog.${id}`,
      })),
      ...validatorIds.map((id) => evidenceRow({
        evidenceKind: "validator_row",
        subjectId: id,
        evidenceRef: `${registryRef}#validator_records.${id}`,
      })),
      ...predicateIds.map((id) => evidenceRow({
        evidenceKind: "predicate_row",
        subjectId: id,
        evidenceRef: `${registryRef}#required_when_predicate_catalog.${id}`,
      })),
      ...sourceProfileIds.map((id) => evidenceRow({
        evidenceKind: "source_profile_row",
        subjectId: id,
        evidenceRef: `${registryRef}#source_profile_records.${id}`,
      })),
    ],
  };
}

function duplicateIds(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function sortedArtifactAuthorityIds(registry: ReconstructContractRegistry): string[] {
  return Object.keys(registry.artifact_authorities).sort();
}

function sortedValidationGateIds(registry: ReconstructContractRegistry): string[] {
  return registry.validation_gate_catalog.map((gate) => gate.gate_id).sort();
}

function sortedValidatorIds(registry: ReconstructContractRegistry): string[] {
  return registry.validator_records
    .map((validator) => validator.validator_id)
    .sort();
}

function sortedPredicateIds(registry: ReconstructContractRegistry): string[] {
  return registry.required_when_predicate_catalog
    .map((predicate) => predicate.predicate_id)
    .sort();
}

function sortedSourceProfileIds(registry: ReconstructContractRegistry): string[] {
  return registry.source_profile_records
    .map((profile) => profile.profile_id)
    .sort();
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function listDelta(actual: string[], expected: string[]): {
  missing: string[];
  unexpected: string[];
} {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return {
    missing: expected.filter((id) => !actualSet.has(id)),
    unexpected: actual.filter((id) => !expectedSet.has(id)),
  };
}

function violation(args: {
  code: ReconstructRegistryVerificationEvidenceValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructRegistryVerificationEvidenceValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

export function validateRegistryVerificationEvidence(args: {
  evidence: ReconstructRegistryVerificationEvidenceArtifact;
  evidenceRef?: string | null;
  contractRegistry: ReconstructContractRegistry;
  expectedRegistryRef?: string | null;
  expectedRegistrySha256?: string | null;
}): ReconstructRegistryVerificationEvidenceValidationArtifact {
  const violations: ReconstructRegistryVerificationEvidenceValidationViolation[] = [];
  const expectedRegistryRef = args.expectedRegistryRef
    ? path.resolve(args.expectedRegistryRef)
    : null;
  const expectedArtifactAuthorityIds = sortedArtifactAuthorityIds(
    args.contractRegistry,
  );
  const expectedGateIds = sortedValidationGateIds(args.contractRegistry);
  const expectedValidatorIds = sortedValidatorIds(args.contractRegistry);
  const expectedPredicateIds = sortedPredicateIds(args.contractRegistry);
  const expectedSourceProfileIds = sortedSourceProfileIds(args.contractRegistry);
  if (args.evidence.schema_version !== "1") {
    violations.push(violation({
      code: "schema_shape_invalid",
      message: "registry verification evidence schema_version must be 1",
    }));
  }
  if (!/^[a-f0-9]{64}$/.test(args.evidence.registry_sha256)) {
    violations.push(violation({
      code: "registry_hash_missing",
      message: "registry verification evidence must record a sha256 registry hash",
    }));
  }
  if (
    args.expectedRegistrySha256 &&
    args.evidence.registry_sha256 !== args.expectedRegistrySha256
  ) {
    violations.push(violation({
      code: "registry_hash_mismatch",
      message: "registry verification evidence hash does not match the current registry file",
      subjectId: args.evidence.registry_ref,
    }));
  }
  if (expectedRegistryRef && path.resolve(args.evidence.registry_ref) !== expectedRegistryRef) {
    violations.push(violation({
      code: "registry_ref_mismatch",
      message: "registry verification evidence registry_ref does not match the loaded registry path",
      subjectId: args.evidence.registry_ref,
    }));
  }
  for (const [field, ids] of [
    ["artifact authority", args.evidence.active_artifact_authority_ids],
    ["validation gate", args.evidence.active_validation_gate_ids],
    ["validator", args.evidence.active_validator_ids],
    ["predicate", args.evidence.required_when_predicate_ids],
    ["source profile", args.evidence.source_profile_ids],
  ] as const) {
    for (const duplicate of duplicateIds(ids)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate ${field} id ${duplicate}`,
        subjectId: duplicate,
      }));
    }
  }
  for (
    const { field, actual, expected } of [
      {
        field: "active artifact authority",
        actual: sortedUnique(args.evidence.active_artifact_authority_ids),
        expected: expectedArtifactAuthorityIds,
      },
      {
        field: "active validation gate",
        actual: sortedUnique(args.evidence.active_validation_gate_ids),
        expected: expectedGateIds,
      },
      {
        field: "active validator",
        actual: sortedUnique(args.evidence.active_validator_ids),
        expected: expectedValidatorIds,
      },
      {
        field: "required-when predicate",
        actual: sortedUnique(args.evidence.required_when_predicate_ids),
        expected: expectedPredicateIds,
      },
      {
        field: "source profile",
        actual: sortedUnique(args.evidence.source_profile_ids),
        expected: expectedSourceProfileIds,
      },
    ] as const
  ) {
    const delta = listDelta(actual, expected);
    for (const missingId of delta.missing) {
      violations.push(violation({
        code: "registry_claim_mismatch",
        message: `${field} id ${missingId} is present in the current registry but missing from registry verification evidence`,
        subjectId: missingId,
      }));
    }
    for (const unexpectedId of delta.unexpected) {
      violations.push(violation({
        code: "registry_claim_mismatch",
        message: `${field} id ${unexpectedId} is claimed by registry verification evidence but absent from the current registry`,
        subjectId: unexpectedId,
      }));
    }
  }
  const validatorGateIds = new Set(
    args.contractRegistry.validator_records.flatMap((validator) =>
      validator.gate_ids
    ),
  );
  for (const gate of args.contractRegistry.validation_gate_catalog) {
    if (!validatorGateIds.has(gate.gate_id)) {
      violations.push(violation({
        code: "active_gate_without_validator",
        message: `active gate ${gate.gate_id} has no validator record`,
        subjectId: gate.gate_id,
      }));
    }
  }
  const activeGateIds = new Set(
    args.contractRegistry.validation_gate_catalog.map((gate) => gate.gate_id),
  );
  for (const validator of args.contractRegistry.validator_records) {
    for (const gateId of validator.gate_ids) {
      if (!activeGateIds.has(gateId)) {
        violations.push(violation({
          code: "validator_unknown_gate",
          message: `validator ${validator.validator_id} references unknown active gate ${gateId}`,
          subjectId: validator.validator_id,
        }));
      }
    }
  }
  const predicateIds = new Set(
    args.contractRegistry.required_when_predicate_catalog.map((predicate) =>
      predicate.predicate_id
    ),
  );
  for (const gate of args.contractRegistry.validation_gate_catalog) {
    if (!predicateIds.has(gate.required_when)) {
      violations.push(violation({
        code: "predicate_missing_for_gate",
        message: `active gate ${gate.gate_id} uses unknown predicate ${gate.required_when}`,
        subjectId: gate.gate_id,
      }));
    }
  }
  const evidenceKeys = new Set(
    args.evidence.evidence_rows.map((row) =>
      `${row.evidence_kind}:${row.subject_id}`
    ),
  );
  for (
    const { evidenceKind, ids } of [
      {
        evidenceKind: "registry_snapshot",
        ids: [args.contractRegistry.registry_id],
      },
      {
        evidenceKind: "artifact_authority_row",
        ids: expectedArtifactAuthorityIds,
      },
      {
        evidenceKind: "validation_gate_row",
        ids: expectedGateIds,
      },
      {
        evidenceKind: "validator_row",
        ids: expectedValidatorIds,
      },
      {
        evidenceKind: "predicate_row",
        ids: expectedPredicateIds,
      },
      {
        evidenceKind: "source_profile_row",
        ids: expectedSourceProfileIds,
      },
    ] as const
  ) {
    for (const requiredId of ids) {
      if (!evidenceKeys.has(`${evidenceKind}:${requiredId}`)) {
        violations.push(violation({
          code: "evidence_row_missing",
          message: `missing ${evidenceKind} evidence row for ${requiredId}`,
          subjectId: requiredId,
        }));
      }
    }
  }
  const registrySnapshotRow = args.evidence.evidence_rows.find((row) =>
    row.evidence_kind === "registry_snapshot" &&
    row.subject_id === args.contractRegistry.registry_id
  );
  if (
    registrySnapshotRow &&
    registrySnapshotRow.evidence_hash !== args.evidence.registry_sha256
  ) {
    violations.push(violation({
      code: "registry_hash_mismatch",
      message: "registry snapshot evidence row hash does not match registry_sha256",
      subjectId: args.contractRegistry.registry_id,
    }));
  }
  for (const row of args.evidence.evidence_rows) {
    if (row.evidence_status !== "verified") {
      violations.push(violation({
        code: "invalid_evidence_status",
        message: "active registry verification evidence rows must be verified",
        subjectId: row.evidence_id,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: args.evidence.session_id,
    created_at: isoNow(),
    registry_verification_evidence_ref: args.evidenceRef ?? null,
    registry_ref: args.evidence.registry_ref,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    artifact_authority_count: args.evidence.active_artifact_authority_ids.length,
    validation_gate_count: args.evidence.active_validation_gate_ids.length,
    validator_count: args.evidence.active_validator_ids.length,
    predicate_count: args.evidence.required_when_predicate_ids.length,
    source_profile_count: args.evidence.source_profile_ids.length,
    validation_results: violations.length === 0
      ? ["registry_verification_evidence_valid"]
      : ["registry_verification_evidence_invalid"],
    violations,
  };
}

export async function writeRegistryVerificationEvidenceArtifact(args: {
  sessionId: string;
  registryPath: string;
  outputPath: string;
}): Promise<ReconstructRegistryVerificationEvidenceArtifact> {
  const contractRegistry = await loadReconstructContractRegistry({
    registryPath: args.registryPath,
  });
  const artifact = await buildRegistryVerificationEvidenceArtifact({
    sessionId: args.sessionId,
    registryPath: args.registryPath,
    contractRegistry,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeRegistryVerificationEvidenceValidationArtifact(args: {
  evidencePath: string;
  registryPath: string;
  outputPath: string;
}): Promise<ReconstructRegistryVerificationEvidenceValidationArtifact> {
  const [evidence, contractRegistry] = await Promise.all([
    readYamlDocument<ReconstructRegistryVerificationEvidenceArtifact>(
      args.evidencePath,
    ),
    loadReconstructContractRegistry({ registryPath: args.registryPath }),
  ]);
  const validation = validateRegistryVerificationEvidence({
    evidence,
    evidenceRef: args.evidencePath,
    contractRegistry,
    expectedRegistryRef: args.registryPath,
    expectedRegistrySha256: await sha256File(args.registryPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
