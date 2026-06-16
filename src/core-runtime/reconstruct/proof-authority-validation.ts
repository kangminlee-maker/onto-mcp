import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructActionabilityMatrixValidationArtifact,
  ReconstructMaturationContinuationDecisionValidationArtifact,
  ReconstructMaturationValidationViolation,
  ReconstructProofAuthorityArtifact,
  ReconstructProofAuthoritySurface,
  ReconstructProofAuthorityValidationArtifact,
} from "./artifact-types.js";

function isoNow(): string {
  return new Date().toISOString();
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function violation(args: {
  code: ReconstructMaturationValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructMaturationValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function boundaryLimitation(surface: ReconstructProofAuthoritySurface): string {
  switch (surface) {
    case "query_access":
      return "proof-boundary:query-access:not-claimed";
    case "visualization":
      return "proof-boundary:visualization:not-claimed";
    case "graph_exploration":
      return "proof-boundary:graph-exploration:not-claimed";
  }
}

export function buildProofAuthorityArtifact(args: {
  sessionId: string;
  proofSurface: ReconstructProofAuthoritySurface;
  actionabilityMatrixValidationRef: string;
  maturationContinuationDecisionValidationRef: string;
  actionableOntologyValidationRef?: string | null;
}): ReconstructProofAuthorityArtifact {
  const limitationRef = boundaryLimitation(args.proofSurface);
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    proof_surface: args.proofSurface,
    actionability_matrix_validation_ref: args.actionabilityMatrixValidationRef,
    maturation_continuation_decision_validation_ref:
      args.maturationContinuationDecisionValidationRef,
    actionable_ontology_validation_ref:
      args.actionableOntologyValidationRef ?? null,
    claim_state: "not_claimed",
    proof_rows: [],
    limitation_refs: [limitationRef],
  };
}

export function validateProofAuthority(args: {
  proofAuthority: ReconstructProofAuthorityArtifact;
  proofAuthorityRef?: string | null;
  expectedSurface: ReconstructProofAuthoritySurface;
  actionabilityMatrixValidation: ReconstructActionabilityMatrixValidationArtifact;
  actionabilityMatrixValidationRef?: string | null;
  maturationContinuationDecisionValidation:
    ReconstructMaturationContinuationDecisionValidationArtifact;
  maturationContinuationDecisionValidationRef?: string | null;
  actionableOntologyValidationRef?: string | null;
}): ReconstructProofAuthorityValidationArtifact {
  const artifact = args.proofAuthority;
  const violations: ReconstructMaturationValidationViolation[] = [];
  if (artifact.proof_surface !== args.expectedSurface) {
    violations.push(violation({
      code: "conflicting_state",
      message: "proof authority surface must match the expected artifact seat",
      subjectId: artifact.proof_surface,
    }));
  }
  if (
    args.actionabilityMatrixValidation.validation_status !== "valid" ||
    args.maturationContinuationDecisionValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_validation_invalid",
      message:
        "proof authority requires valid actionability matrix and continuation decision validation",
      subjectId: artifact.proof_surface,
    }));
  }
  if (
    args.actionabilityMatrixValidationRef &&
    artifact.actionability_matrix_validation_ref !==
      args.actionabilityMatrixValidationRef
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "proof authority must cite the consumed actionability matrix validation ref",
      subjectId: artifact.actionability_matrix_validation_ref,
    }));
  }
  if (
    args.maturationContinuationDecisionValidationRef &&
    artifact.maturation_continuation_decision_validation_ref !==
      args.maturationContinuationDecisionValidationRef
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "proof authority must cite the consumed continuation decision validation ref",
      subjectId: artifact.maturation_continuation_decision_validation_ref,
    }));
  }
  if (
    artifact.actionable_ontology_validation_ref !==
      (args.actionableOntologyValidationRef ?? null)
  ) {
    violations.push(violation({
      code: "conflicting_state",
      message:
        "proof authority actionable ontology validation ref must match the emitted actionable ontology boundary",
      subjectId: artifact.actionable_ontology_validation_ref,
    }));
  }
  if (artifact.claim_state === "not_claimed") {
    if (artifact.proof_rows.length > 0) {
      violations.push(violation({
        code: "conflicting_state",
        message: "not_claimed proof authorities cannot contain proof rows",
        subjectId: artifact.proof_surface,
      }));
    }
    if (artifact.limitation_refs.length === 0) {
      violations.push(violation({
        code: "missing_required_ref",
        message: "not_claimed proof authorities must carry a limitation ref",
        subjectId: artifact.proof_surface,
      }));
    }
  } else if (artifact.proof_rows.length === 0) {
    violations.push(violation({
      code: "missing_required_ref",
      message: "claimed proof authority states require at least one proof row",
      subjectId: artifact.proof_surface,
    }));
  }
  return {
    schema_version: "1",
    session_id: artifact.session_id,
    created_at: isoNow(),
    proof_authority_ref: args.proofAuthorityRef ?? null,
    proof_surface: artifact.proof_surface,
    actionability_matrix_validation_ref:
      args.actionabilityMatrixValidationRef ?? null,
    maturation_continuation_decision_validation_ref:
      args.maturationContinuationDecisionValidationRef ?? null,
    actionable_ontology_validation_ref:
      args.actionableOntologyValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    claim_state: artifact.claim_state,
    proof_row_count: artifact.proof_rows.length,
    validation_results: violations.length === 0
      ? ["proof_authority_valid"]
      : ["proof_authority_invalid"],
    violations,
  };
}

export async function writeProofAuthorityArtifact(args: {
  sessionId: string;
  proofSurface: ReconstructProofAuthoritySurface;
  actionabilityMatrixValidationPath: string;
  maturationContinuationDecisionValidationPath: string;
  actionableOntologyValidationPath?: string | null;
  outputPath: string;
}): Promise<ReconstructProofAuthorityArtifact> {
  const artifact = buildProofAuthorityArtifact({
    sessionId: args.sessionId,
    proofSurface: args.proofSurface,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
    maturationContinuationDecisionValidationRef:
      args.maturationContinuationDecisionValidationPath,
    actionableOntologyValidationRef: args.actionableOntologyValidationPath ?? null,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeProofAuthorityValidationArtifact(args: {
  proofAuthorityPath: string;
  expectedSurface: ReconstructProofAuthoritySurface;
  actionabilityMatrixValidationPath: string;
  maturationContinuationDecisionValidationPath: string;
  actionableOntologyValidationPath?: string | null;
  outputPath: string;
}): Promise<ReconstructProofAuthorityValidationArtifact> {
  const [
    proofAuthority,
    actionabilityMatrixValidation,
    maturationContinuationDecisionValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructProofAuthorityArtifact>(args.proofAuthorityPath),
    readYamlDocument<ReconstructActionabilityMatrixValidationArtifact>(
      args.actionabilityMatrixValidationPath,
    ),
    readYamlDocument<ReconstructMaturationContinuationDecisionValidationArtifact>(
      args.maturationContinuationDecisionValidationPath,
    ),
  ]);
  const validation = validateProofAuthority({
    proofAuthority,
    proofAuthorityRef: args.proofAuthorityPath,
    expectedSurface: args.expectedSurface,
    actionabilityMatrixValidation,
    actionabilityMatrixValidationRef: args.actionabilityMatrixValidationPath,
    maturationContinuationDecisionValidation,
    maturationContinuationDecisionValidationRef:
      args.maturationContinuationDecisionValidationPath,
    actionableOntologyValidationRef:
      args.actionableOntologyValidationPath ?? null,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
