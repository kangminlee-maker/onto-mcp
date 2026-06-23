import { describe, expect, it } from "vitest";
import type {
  ReconstructActionabilityMatrixValidationArtifact,
  ReconstructMaturationContinuationDecisionValidationArtifact,
} from "./artifact-types.js";
import {
  buildProofAuthorityArtifact,
  validateProofAuthority,
} from "./proof-authority-validation.js";

const now = "2026-06-03T00:00:00.000Z";

function actionabilityMatrixValidation(): ReconstructActionabilityMatrixValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    actionability_matrix_ref: "actionability-matrix.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    maturation_answer_claims_validation_ref:
      "maturation-answer-claims-validation.yaml",
    ontology_expansion_validation_ref: "ontology-expansion-validation.yaml",
    validation_status: "valid",
    matrix_row_count: 1,
    frontier_required_row_count: 0,
    validation_results: ["actionability_matrix_valid"],
    violations: [],
  };
}

function continuationValidation(): ReconstructMaturationContinuationDecisionValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    maturation_continuation_decision_ref:
      "maturation-continuation-decision.yaml",
    actionability_matrix_validation_ref: "actionability-matrix-validation.yaml",
    maturation_question_frontier_validation_ref:
      "maturation-question-frontier-validation.yaml",
    maturation_closure_frontier_validation_ref:
      "maturation-closure-frontier-validation.yaml",
    answer_support_ledger_validation_ref: "answer-support-ledger-validation.yaml",
    maturation_authority_response_validation_ref:
      "maturation-authority-response-validation.yaml",
    ontology_expansion_validation_ref: "ontology-expansion-validation.yaml",
    maturation_convergence_ledger_validation_ref:
      "maturation-convergence-ledger-validation.yaml",
    validation_status: "valid",
    decision_state: "blocked",
    blocking_row_count: 1,
    next_frontier_count: 0,
    validation_results: ["maturation_continuation_decision_valid"],
    asserted_obligation_ids: [],
    violations: [],
  };
}

describe("proof authority validation", () => {
  it("validates not-claimed proof boundaries", () => {
    const artifact = buildProofAuthorityArtifact({
      sessionId: "session-1",
      proofSurface: "query_access",
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
    });

    const validation = validateProofAuthority({
      proofAuthority: artifact,
      proofAuthorityRef: "query-proofs.yaml",
      expectedSurface: "query_access",
      actionabilityMatrixValidation: actionabilityMatrixValidation(),
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationContinuationDecisionValidation: continuationValidation(),
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
    });

    expect(artifact.claim_state).toBe("not_claimed");
    expect(validation.validation_status).toBe("valid");
  });

  it("rejects claimed proof states without proof rows", () => {
    const artifact = {
      ...buildProofAuthorityArtifact({
        sessionId: "session-1",
        proofSurface: "visualization",
        actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
        maturationContinuationDecisionValidationRef:
          "maturation-continuation-decision-validation.yaml",
      }),
      claim_state: "claimed_with_runtime_proof" as const,
      limitation_refs: [],
    };

    const validation = validateProofAuthority({
      proofAuthority: artifact,
      expectedSurface: "visualization",
      actionabilityMatrixValidation: actionabilityMatrixValidation(),
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationContinuationDecisionValidation: continuationValidation(),
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((violation) => violation.code))
      .toContain("missing_required_ref");
  });
});

describe("validateProofAuthority rejection branches", () => {
  function validBase(): {
    proofAuthority: ReturnType<typeof buildProofAuthorityArtifact>;
    args: Omit<
      Parameters<typeof validateProofAuthority>[0],
      "proofAuthority"
    >;
  } {
    const proofAuthority = buildProofAuthorityArtifact({
      sessionId: "session-1",
      proofSurface: "query_access",
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationContinuationDecisionValidationRef:
        "maturation-continuation-decision-validation.yaml",
    });
    return {
      proofAuthority,
      args: {
        proofAuthorityRef: "query-proofs.yaml",
        expectedSurface: "query_access",
        actionabilityMatrixValidation: actionabilityMatrixValidation(),
        actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
        maturationContinuationDecisionValidation: continuationValidation(),
        maturationContinuationDecisionValidationRef:
          "maturation-continuation-decision-validation.yaml",
      },
    };
  }

  it("confirms the valid base validates before mutation", () => {
    const { proofAuthority, args } = validBase();
    const validation = validateProofAuthority({ proofAuthority, ...args });
    expect(validation.validation_status).toBe("valid");
  });

  it("rejects a proof surface that does not match the expected seat (conflicting_state)", () => {
    const { proofAuthority, args } = validBase();
    const mutated = structuredClone(proofAuthority);
    mutated.proof_surface = "visualization";

    const validation = validateProofAuthority({
      ...args,
      proofAuthority: mutated,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.some((v) => v.code === "conflicting_state"))
      .toBe(true);
  });

  it("rejects proof authority when a prior validation is invalid (prior_validation_invalid)", () => {
    const { proofAuthority, args } = validBase();
    const priorInvalid = structuredClone(actionabilityMatrixValidation());
    priorInvalid.validation_status = "invalid";

    const validation = validateProofAuthority({
      ...args,
      proofAuthority,
      actionabilityMatrixValidation: priorInvalid,
    });

    expect(validation.validation_status).toBe("invalid");
    expect(
      validation.violations.some((v) => v.code === "prior_validation_invalid"),
    ).toBe(true);
  });
});
