import { describe, expect, it } from "vitest";
import type {
  ReconstructAnswerSupportJudgmentArtifact,
  ReconstructAnswerSupportJudgmentValidationArtifact,
  ReconstructAnswerSupportLedgerArtifact,
  ReconstructAnswerSupportLedgerValidationArtifact,
  ReconstructEvidenceRef,
  ReconstructMaturationAnswerClaimsArtifact,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructMaturationQuestionFrontierValidationArtifact,
} from "./artifact-types.js";
import { validateMaturationAnswerClaims } from "./maturation-validation.js";

// G(a) ENFORCED-TIER BINDING. The obligation-coverage ledger parks
//   maturation-answer-claims-validator ::
//     require_convergent_source_evidence_claims_to_have_two_independent_judge_confirmed_supports
// under tier `enforced_pending_instrumentation` — claimed live-enforced (recording deferred to a
// later slice). That "enforced" claim is otherwise free-floating: deleting the judge block (B-6,
// maturation-validation.ts ~2865-2899) leaves the coverage guard green. This test BINDS the claim
// inside the coverage subsystem, so a judge regression reds a coverage test. Modeled on the B-6
// fixtures in maturation-validation.test.ts; kept self-contained (minimal inputs reach the B-6
// branch — the per-claim loop runs even when upstream validations are not valid).

const now = "2026-06-22T00:00:00.000Z";

const evidence: ReconstructEvidenceRef = {
  observation_id: "obs-code-1",
  target_material_kind: "code",
  source_ref: "src/feature.ts",
  location: "src/feature.ts",
};
const evidence2: ReconstructEvidenceRef = {
  observation_id: "obs-code-2",
  target_material_kind: "code",
  source_ref: "src/other.ts",
  location: "src/other.ts",
};

function emptyFrontier(): ReconstructMaturationQuestionFrontierArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    maturation_baseline_ref: null,
    maturation_baseline_validation_ref: null,
    actionability_matrix_ref: null,
    actionability_matrix_validation_ref: null,
    questions: [],
    directive_author: { owner: "host_llm", author_id: "frontier-author" },
  };
}

function validFrontierValidation(): ReconstructMaturationQuestionFrontierValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    maturation_question_frontier_ref: "maturation-question-frontier.yaml",
    maturation_baseline_validation_ref: null,
    actionability_matrix_validation_ref: null,
    validation_status: "valid",
    question_count: 0,
    material_frontier_question_count: 0,
    validation_results: [],
    violations: [],
  };
}

function convergentLedger(): ReconstructAnswerSupportLedgerArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    round_id: "maturation-round-1",
    evidence_clusters: [
      {
        evidence_cluster_id: "cluster-convergent",
        question_refs: ["mq-feature-object"],
        support_mode: "convergent_source_evidence",
        proposed_answer_summary: "Two independent sources support the answer.",
        evidence_refs: [evidence, evidence2],
        proof_refs: [],
        user_confirmation_refs: [],
        authority_response_refs: [],
        independence_basis: "two distinct sources",
        contradiction_refs: [],
        limitation_refs: [],
      },
    ],
    directive_author: { owner: "host_llm", author_id: "ledger-author" },
  };
}

function validLedgerValidation(): ReconstructAnswerSupportLedgerValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    answer_support_ledger_ref: "answer-support-ledger.yaml",
    maturation_question_frontier_validation_ref: "maturation-question-frontier-validation.yaml",
    source_observation_delta_ref: null,
    source_observation_lineage_index_ref: null,
    source_observation_lineage_index_validation_ref: null,
    source_observation_reentry_validation_ref: null,
    source_safety_ledger_validation_ref: null,
    maturation_authority_response_validation_ref: null,
    validation_status: "valid",
    evidence_cluster_count: 1,
    supported_question_count: 1,
    validation_results: [],
    violations: [],
  };
}

function judgment(
  rows: Array<{ evidence: ReconstructEvidenceRef; supports: "supported" | "not_supported" }>,
): ReconstructAnswerSupportJudgmentArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    round_id: "maturation-round-1",
    answer_support_ledger_ref: "answer-support-ledger.yaml",
    answer_support_ledger_validation_ref: "answer-support-ledger-validation.yaml",
    judgments: rows.map((row, index) => ({
      judgment_id: `j-${index + 1}`,
      evidence_cluster_ref: "cluster-convergent",
      evidence_ref: row.evidence,
      supports: row.supports,
      rationale_ref: `rationale-${index + 1}`,
    })),
    directive_author: { owner: "host_llm", author_id: "judge-author" },
  };
}

function validJudgmentValidation(): ReconstructAnswerSupportJudgmentValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    answer_support_judgment_ref: "answer-support-judgment.yaml",
    answer_support_ledger_validation_ref: "answer-support-ledger-validation.yaml",
    validation_status: "valid",
    judgment_count: 2,
    supported_judgment_count: 2,
    validation_results: [],
    violations: [],
  };
}

function convergentClaims(): ReconstructMaturationAnswerClaimsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    round_id: "maturation-round-1",
    answer_claims: [
      {
        answer_claim_id: "answer-claim-feature-object",
        question_id: "mq-feature-object",
        answer: "Two independent sources support the feature object.",
        answer_status: "answered",
        support_mode: "convergent_source_evidence",
        evidence_cluster_refs: ["cluster-convergent"],
        supporting_evidence_refs: [evidence, evidence2],
        target_surface_refs: ["static_surface"],
        target_dimension_refs: ["structure"],
        purpose_element_refs: ["purpose-element-feature-object"],
        limitation_refs: [],
      },
    ],
    directive_author: { owner: "host_llm", author_id: "claims-author" },
  };
}

function run(
  judgmentArtifact: ReconstructAnswerSupportJudgmentArtifact | null,
  judgmentValidation: ReconstructAnswerSupportJudgmentValidationArtifact | null,
) {
  return validateMaturationAnswerClaims({
    maturationAnswerClaims: convergentClaims(),
    maturationAnswerClaimsRef: "maturation-answer-claims.yaml",
    answerSupportLedger: convergentLedger(),
    answerSupportLedgerValidation: validLedgerValidation(),
    answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
    maturationQuestionFrontier: emptyFrontier(),
    maturationQuestionFrontierValidation: validFrontierValidation(),
    maturationQuestionFrontierValidationRef: "maturation-question-frontier-validation.yaml",
    answerSupportJudgment: judgmentArtifact,
    answerSupportJudgmentValidation: judgmentValidation,
    answerSupportJudgmentValidationRef: judgmentArtifact
      ? "answer-support-judgment-validation.yaml"
      : null,
  });
}

describe("G(a) enforced-tier binding — the judge pair is genuinely live-enforced (parked, not unwired)", () => {
  it("emits insufficient_independent_evidence for a convergent claim lacking 2 independent judge-confirmed supports", () => {
    // Judge confirms only ONE of the two cited refs ⇒ independentConfirmed.size === 1 < 2.
    const validation = run(
      judgment([
        { evidence, supports: "supported" },
        { evidence: evidence2, supports: "not_supported" },
      ]),
      validJudgmentValidation(),
    );
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((v) => v.code)).toContain(
      "insufficient_independent_evidence",
    );
  });

  it("is fail-closed: a convergent claim with NO judgment is prior_validation_invalid (judge gate active)", () => {
    const validation = run(null, null);
    expect(validation.validation_status).toBe("invalid");
    expect(validation.violations.map((v) => v.code)).toContain("prior_validation_invalid");
  });

  it("accepts a convergent claim with TWO independent judge-confirmed supports (positive control — the enforcer is not vacuous)", () => {
    const validation = run(
      judgment([
        { evidence, supports: "supported" },
        { evidence: evidence2, supports: "supported" },
      ]),
      validJudgmentValidation(),
    );
    expect(validation.violations.map((v) => v.code)).not.toContain(
      "insufficient_independent_evidence",
    );
  });
});
