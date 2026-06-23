import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructActionableOntologyValidationArtifact,
  ReconstructActionabilityMatrixArtifact,
  ReconstructActionabilityMatrixValidationArtifact,
  ReconstructAnswerSupportJudgmentValidationArtifact,
  ReconstructAnswerSupportLedgerValidationArtifact,
  ReconstructClaimRealizationMapValidationArtifact,
  ReconstructMaterialAdmissionLedgerValidationArtifact,
  ReconstructMaturationConvergenceLedgerValidationArtifact,
  ReconstructMaturationAnswerClaimsArtifact,
  ReconstructMaturationAnswerClaimsValidationArtifact,
  ReconstructMaturationBaselineArtifact,
  ReconstructMaturationBaselineValidationArtifact,
  ReconstructCompetencyQuestionAssessmentValidationArtifact,
  ReconstructMaturationQuestionFrontierValidationArtifact,
  ReconstructOntologyExpansionValidationArtifact,
  ReconstructCandidateDispositionValidationArtifact,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructPurposeConfirmationValidationArtifact,
  ReconstructRegistryVerificationEvidenceValidationArtifact,
  ReconstructRunControlValidationArtifact,
  ReconstructSourceObservationDeltaValidationArtifact,
  ReconstructSourceObservationReentryValidationArtifact,
} from "./artifact-types.js";
import {
  validateActionabilityMatrix,
  validateAnswerSupportJudgment,
  validateAnswerSupportLedger,
  validateMaturationAnswerClaims,
  validateMaturationBaseline,
  validateMaturationQuestionFrontier,
  validateMaturationConvergenceLedger,
  validateActionableOntology,
  validateOntologyExpansion,
} from "./maturation-validation.js";
import {
  validateSourceObservationDelta,
  validateSourceObservationReentry,
} from "./source-observation-delta-validation.js";
import {
  validateClaimRealizationMapForOntologySeed,
  validateCompetencyQuestionAssessment,
} from "./post-seed-validation.js";
import { validateReconstructRunControl } from "./run-control-validation.js";
import { validatePurposeConfirmation } from "./purpose-authority-validation.js";
import { validateMaterialAdmissionLedger } from "./material-admission-validation.js";
import { validateRegistryVerificationEvidence } from "./registry-verification-validation.js";
import { validateHandoffDecision } from "./terminal-validation.js";
import { validateCandidateDisposition } from "./ontology-seed-validation.js";

// G(a) DYNAMIC HARVEST: run the two real validators and assert they RECORD their obligation ids
// (asserted_obligation_ids) from the recorder positions placed BEFORE the per-row guards. The
// recorder runs even on minimal inputs, so we build the smallest type-valid artifacts (empty rows)
// that reach the recorder without throwing. Deleting the assertObligation call reds these asserts.

const now = "2026-06-22T00:00:00.000Z";

function minimalBaseline(): ReconstructMaturationBaselineArtifact {
  return {
    schema_version: "1",
    session_id: "session-harvest",
    created_at: now,
    source_seed_ref: null,
    source_seed_validation_ref: null,
    source_claim_realization_map_validation_ref: null,
    source_competency_assessment_ref: null,
    source_reconstruct_record_ref: null,
    source_run_manifest_ref: null,
    source_handoff_decision_validation_ref: null,
    purpose_frame_ref: null,
    source_purpose_candidates_validation_ref: null,
    purpose_confirmation_validation_ref: null,
    source_material_admission_ledger_ref: null,
    source_material_admission_validation_ref: null,
    candidate_limitation_refs: [],
    baseline_rows: [],
  } as ReconstructMaturationBaselineArtifact;
}

// The validation inputs only need a validation_status to reach the recorder; cast the rest.
const VALID = { validation_status: "valid" } as never;

function runBaseline(
  overrides: {
    baseline?: Partial<ReconstructMaturationBaselineArtifact>;
    sourceReconstructRecordSha256?: string | null;
  } = {},
): ReconstructMaturationBaselineValidationArtifact {
  return validateMaturationBaseline({
    maturationBaseline: {
      ...minimalBaseline(),
      ...overrides.baseline,
    } as ReconstructMaturationBaselineArtifact,
    sourcePurposeCandidates: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      target_material_kind: "code",
      source_observations_ref: "source-observations.yaml",
      selected_source_profile_refs: [],
      purpose_candidates: [],
    } as never,
    sourcePurposeCandidatesValidation: VALID,
    purposeConfirmationValidation: VALID,
    ontologySeedValidation: VALID,
    competencyQuestionAssessmentValidation: VALID,
    handoffDecisionValidation: VALID,
    sourceReconstructRecordSha256: overrides.sourceReconstructRecordSha256,
  });
}

function minimalMatrix(): ReconstructActionabilityMatrixArtifact {
  return {
    schema_version: "1",
    session_id: "session-harvest",
    created_at: now,
    maturation_baseline_ref: null,
    maturation_baseline_validation_ref: null,
    candidate_limitation_refs: [],
    rows: [],
  };
}

function baselineValidationInput(): ReconstructMaturationBaselineValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-harvest",
    created_at: now,
    maturation_baseline_ref: null,
    source_seed_validation_ref: null,
    source_reconstruct_record_ref: null,
    source_reconstruct_record_sha256: null,
    source_purpose_candidates_validation_ref: null,
    purpose_confirmation_validation_ref: null,
    validation_status: "valid",
    baseline_row_count: 0,
    material_row_count: 0,
    validation_results: [],
    asserted_obligation_ids: [],
    violations: [],
  };
}

// CURRENT mode = post-frontier inputs present (answer claims flip postFrontierInputsPresent). The
// frontier is a SEPARATE axis: the with-frontier variant additionally supplies a VALID question-
// frontier validation so frontierAvailable=true and the frontier reverse-link obligation
// (validate_blocking_question_refs...) is enforced and recorded under the current validator.
function runMatrix(opts: {
  current?: boolean;
  frontier?: boolean;
} = {}): ReconstructActionabilityMatrixValidationArtifact {
  return validateActionabilityMatrix({
    actionabilityMatrix: minimalMatrix(),
    maturationBaseline: minimalBaseline(),
    maturationBaselineValidation: baselineValidationInput(),
    ...(opts.current
      ? {
        maturationAnswerClaims: {
          schema_version: "1",
          session_id: "session-harvest",
          created_at: now,
          answer_claims: [],
        } as ReconstructMaturationAnswerClaimsArtifact,
        maturationAnswerClaimsValidation: {
          validation_status: "invalid",
        } as ReconstructMaturationAnswerClaimsValidationArtifact,
      }
      : {}),
    ...(opts.frontier
      ? {
        maturationQuestionFrontier: {
          schema_version: "1",
          session_id: "session-harvest",
          created_at: now,
          questions: [],
        } as never,
        maturationQuestionFrontierValidation: {
          validation_status: "valid",
        } as never,
      }
      : {}),
  });
}

// maturation-answer-claims-validator (slice 4). Minimal inputs reach the recorder (placed before the
// per-claim loop). The validation artifact carries no validator_id field, so attribute it by name.
function runAnswerClaims(): ReconstructMaturationAnswerClaimsValidationArtifact {
  return validateMaturationAnswerClaims({
    maturationAnswerClaims: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      round_id: "round-1",
      answer_claims: [],
      directive_author: { owner: "host_llm", author_id: "a" },
    } as ReconstructMaturationAnswerClaimsArtifact,
    answerSupportLedger: { evidence_clusters: [] } as never,
    answerSupportLedgerValidation: VALID,
    maturationQuestionFrontier: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      questions: [],
    } as never,
    maturationQuestionFrontierValidation: VALID,
  });
}

// source-observation-delta-validator + source-observation-reentry-validator (slice 5, a NEW file).
// Minimal inputs reach the recorders (placed before any per-row/per-observation loop). Neither
// validation artifact carries a validator_id field, so attribute each by name. A minimal frontier
// makes normalizeFrontierForDelta return null (pushing a violation, not throwing), so the delta fn
// still returns its artifact.
function runSourceObservationDelta(): ReconstructSourceObservationDeltaValidationArtifact {
  return validateSourceObservationDelta({
    delta: {
      schema_version: "1",
      session_id: "session-harvest",
      round_id: "round-1",
      frontier_kind: "source_frontier",
      frontier_ref: "frontier.yaml",
      frontier_validation_ref: "frontier-validation.yaml",
      source_observations_ref: "source-observations.yaml",
      delta_rows: [],
      accepted_frontier_ref_ids: [],
      added_observation_ids: [],
    } as never,
    frontier: {} as never,
    frontierValidation: {} as never,
    sourceObservations: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      observations: [],
    } as never,
  });
}

function runSourceObservationReentry(): ReconstructSourceObservationReentryValidationArtifact {
  return validateSourceObservationReentry({
    delta: {
      schema_version: "1",
      session_id: "session-harvest",
      round_id: "round-1",
      source_observations_ref: "source-observations.yaml",
      added_observation_ids: [],
    } as never,
    deltaValidation: { validation_status: "valid" } as never,
    sourceObservations: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      observations: [],
    } as never,
    sourceSafetyLedger: { safety_rows: [] } as never,
    sourceSafetyLedgerValidation: { validation_status: "valid" } as never,
  });
}

// maturation-question-frontier-validator (slice 6). Minimal inputs reach the recorders (placed before
// the per-question loop). The validation artifact carries no validator_id field, so attribute by name.
function runQuestionFrontier(): ReconstructMaturationQuestionFrontierValidationArtifact {
  return validateMaturationQuestionFrontier({
    maturationQuestionFrontier: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      questions: [],
    } as never,
    maturationBaseline: minimalBaseline(),
    maturationBaselineValidation: baselineValidationInput(),
    actionabilityMatrix: minimalMatrix(),
    actionabilityMatrixValidation: { validation_status: "valid" } as never,
  });
}

// claim-realization-map-validator (slice 7, post-seed-validation.ts). The exported wrapper delegates
// to the real validator; minimal inputs reach the recorders (before the per-realization loop).
// ontologySeedClaimProjections is null-safe, so a minimal seed does not throw. Attribute by name.
function runClaimRealizationMap(): ReconstructClaimRealizationMapValidationArtifact {
  return validateClaimRealizationMapForOntologySeed({
    claimRealizationMap: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      claim_realizations: [],
      directive_author: { owner: "mock", author_id: "mock" },
    } as never,
    ontologySeed: { schema_version: "1", session_id: "session-harvest" } as never,
    sourceObservations: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      observations: [],
    } as never,
  });
}

// answer-support-judgment-validator (slice 8, maturation-validation.ts). Minimal inputs reach the
// recorders (before the per-judgment loop). Attribute by name.
function runAnswerSupportJudgment(): ReconstructAnswerSupportJudgmentValidationArtifact {
  return validateAnswerSupportJudgment({
    answerSupportJudgment: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      judgments: [],
    } as never,
    answerSupportLedger: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      evidence_clusters: [],
    } as never,
    answerSupportLedgerValidation: { validation_status: "valid" } as never,
  });
}

// ontology-expansion-validator (slice 9, maturation-validation.ts). Minimal inputs reach the
// recorders (placed before the per-expansion loop). The validation artifact carries no validator_id
// field, so attribute by name. Only the two obligations whose enforcement matches the authoritative
// contract are recorded: validate_expansion_answer_claim_refs and (contract scopes it to
// `operation: add` with increases_surface) require_concept_economy_rationale_when_surface_increases.
// prevent_in_place_seed_authority_rewrite (basename-exact check misses anchored seed refs) and the
// evidence-refs obligation (proxy resolution against cited answer claims) stay parked.
function runOntologyExpansion(
  overrides: { expansions?: unknown[]; answerClaims?: unknown[] } = {},
): ReconstructOntologyExpansionValidationArtifact {
  return validateOntologyExpansion({
    ontologyExpansion: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      answer_claims_ref: null,
      source_seed_ref: null,
      expansions: overrides.expansions ?? [],
      directive_author: { owner: "host_llm", author_id: "a" },
    } as never,
    maturationAnswerClaims: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      answer_claims: overrides.answerClaims ?? [],
    } as never,
    maturationAnswerClaimsValidation: { validation_status: "valid" } as never,
  });
}

// Enforcement-binding fixtures (anti-laundering): a breaching expansion must trip the real violation,
// and a clean variant must clear it, so the recorded stamp cannot survive deletion of the enforcer.
const surfaceIncreaseExpansion = (rationale: string) => ({
  expansion_id: "expansion-add",
  operation: "add",
  target_surface_refs: ["static_surface"],
  target_dimension_refs: ["structure"],
  target_seed_or_ontology_refs: ["semantic_layer.object_types/object-new"],
  purpose_element_refs: ["purpose-element"],
  answer_claim_refs: ["answer-claim-1"],
  evidence_refs: [],
  concept_economy_effect: "increases_surface",
  rationale,
  limitation_refs: [],
});
const resolvingAnswerClaim = {
  answer_claim_id: "answer-claim-1",
  question_id: "question-1",
  supporting_evidence_refs: [],
  evidence_cluster_refs: [],
};

// reconstruct-run-control-validator (slice 10, run-control-validation.ts). Minimal inputs reach the
// recorder (placed before the per-transaction loop). The validation artifact carries no validator_id
// field, so attribute by name. Only validate_committed_write_transactions_have_artifact_refs_and_hashes
// is recorded; the other four obligations (commit_method never read, fingerprints not compared, lock
// ownership not linked, only session_root of five replay quantities checked) stay parked.
function runReconstructRunControl(
  overrides: { writeTransactions?: unknown[] } = {},
): ReconstructRunControlValidationArtifact {
  return validateReconstructRunControl({
    runControl: {
      schema_version: "1",
      session_id: "session-harvest",
      session_root: "/tmp/session-harvest",
      created_at: now,
      updated_at: now,
      runtime_version: "test",
      request_rows: [],
      attempt_rows: [],
      lock_rows: [],
      write_transactions: overrides.writeTransactions ?? [],
      resume_rows: [],
    } as never,
  });
}

// Enforcement-binding fixture (anti-laundering): a committed transaction missing committed_hash trips
// transaction_hash_missing; supplying the hash clears it. The recorder cannot launder the enforcer.
const committedTransaction = (committedHash: string | null) => ({
  transaction_id: "txn-1",
  owner_attempt_id: "attempt-1",
  artifact_ref: "ontology-seed.yaml",
  temp_ref: null,
  expected_prior_hash: null,
  committed_hash: committedHash,
  commit_method: "observed_file_hash",
  transaction_status: "committed",
  recovery_ref: null,
});

// purpose-confirmation-validator (slice 11, purpose-authority-validation.ts). Minimal inputs reach the
// recorder (stamped unconditionally before the branches). The validation artifact carries no
// validator_id field, so attribute by name. Three obligations are recorded; the revised-confirmation
// "preserve source conflict" arm and the candidate-status arm of ob 5 stay parked.
function runPurposeConfirmation(
  overrides: {
    confirmationStatus?: string;
    confirmationRequired?: boolean;
    purposeCandidateId?: string;
    selectedCandidateId?: string;
    confirmedStatement?: string | null;
  } = {},
): ReconstructPurposeConfirmationValidationArtifact {
  return validatePurposeConfirmation({
    purposeConfirmation: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      purpose_candidate_id: overrides.purposeCandidateId ?? "cand-1",
      confirmation_status: overrides.confirmationStatus ?? "not_required",
      confirmed_statement: overrides.confirmedStatement ?? null,
    } as never,
    sourcePurposeCandidatesValidation: {
      session_id: "session-harvest",
      validation_status: "valid",
      selected_purpose_candidate_id: overrides.selectedCandidateId ?? "cand-1",
      confirmation_required: overrides.confirmationRequired ?? false,
      source_purpose_candidates_ref: "source-purpose-candidates.yaml",
    } as never,
  });
}

// competency-question-assessment-validator (slice 12, post-seed-validation.ts). Minimal inputs reach
// the recorder (stamped unconditionally before the per-assessment/per-question loops). The validation
// artifact carries no validator_id field, so attribute by name. Three obligations are recorded; the
// content-blind answer_status obligation and the trace-refs (limitations/proofs) obligation stay parked.
const cqQuestion = (overrides: Record<string, unknown> = {}) => ({
  question_id: "q1",
  linked_claim_ids: [],
  evidence_refs: [],
  seed_ref_refs: [],
  ...overrides,
});
const cqAssessment = (overrides: Record<string, unknown> = {}) => ({
  question_id: "q1",
  answer_status: "not_applicable",
  answer_summary: "summary",
  required_seed_refs: [],
  linked_claim_ids: [],
  evidence_refs: [],
  missing_source_or_confirmation: null,
  ambiguity_notes: [],
  downstream_effect: "not_applicable",
  rationale: "rationale",
  ...overrides,
});
function runCompetencyQuestionAssessment(
  overrides: { questions?: unknown[]; assessments?: unknown[] } = {},
): ReconstructCompetencyQuestionAssessmentValidationArtifact {
  return validateCompetencyQuestionAssessment({
    competencyQuestionAssessment: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      competency_questions_ref: null,
      competency_questions_validation_ref: null,
      assessments: overrides.assessments ?? [],
      directive_author: { owner: "host_llm", author_id: "a" },
    } as never,
    competencyQuestions: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      questions: overrides.questions ?? [],
    } as never,
  });
}

// A single fully-valid pre-seed admission row; overrides flip exactly one facet to bind one violation.
function madRow(overrides: Record<string, unknown> = {}): unknown {
  return {
    admission_id: "adm-1",
    admission_phase: "pre_seed_purpose_element",
    input_kind: "purpose_adequacy_element",
    input_ref: "source-purpose-candidates.yaml#elem-1",
    source_refs: [],
    purpose_element_snapshot_ref: "source-purpose-candidates.yaml#elem-1",
    value_snapshot_ref: null,
    competency_snapshot_ref: null,
    admission_policy_ref: "policy:v1",
    disposition: "supporting_material",
    materiality: "medium",
    purpose_element_refs: [],
    actionability_surface_refs: [],
    maturity_dimension_refs: [],
    downstream_authority_refs: [],
    supersedes_admission_refs: [],
    limitation_refs: ["limitation:noted"],
    rationale: "fixture",
    ...overrides,
  };
}

// Slice-15: the selected frame exposes one element id (elem-1); observations expose one source ref.
// withFrame=false drops purposeElements (size 0) and withObservations=false drops knownSourceRefs —
// the two reference-integrity obligations are recorded ONLY when their authoritative input is present.
function runMaterialAdmissionLedger(
  overrides: { rows?: unknown[]; withFrame?: boolean; withObservations?: boolean } = {},
): ReconstructMaterialAdmissionLedgerValidationArtifact {
  const withFrame = overrides.withFrame ?? true;
  const withObservations = overrides.withObservations ?? true;
  return validateMaterialAdmissionLedger({
    materialAdmissionLedger: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      source_purpose_candidates_ref: null,
      source_purpose_candidates_validation_ref: null,
      purpose_confirmation_validation_ref: null,
      admission_rows: overrides.rows ?? [],
    } as never,
    materialAdmissionLedgerRef: "material-admission-ledger.yaml",
    sourcePurposeCandidates: withFrame
      ? ({
          purpose_candidates: [
            {
              purpose_candidate_id: "cand-1",
              rank: "primary",
              adequacy_frame: {
                required_elements: [
                  {
                    element_id: "elem-1",
                    actionability_surface_refs: [],
                    maturity_dimension_refs: [],
                    member_source_refs: [],
                    supporting_evidence_refs: [],
                    closure_expectation: "model_or_limit",
                  },
                ],
              },
            },
          ],
        } as never)
      : null,
    sourcePurposeCandidatesValidation: withFrame
      ? ({
          validation_status: "valid",
          session_id: "session-harvest",
          selected_purpose_candidate_id: "cand-1",
        } as never)
      : null,
    sourceObservations: withObservations
      ? ({ observations: [{ observation_id: "obs-1", source_ref: "/tmp/harvest-src.txt" }] } as never)
      : null,
  });
}

// Slice-16 convergence-ledger fixtures. The validator takes many non-optional upstream artifacts +
// validations; minimal type-valid shells reach the recorder. sourceObservationDelta present → the
// source-observation-closure obligation records (gated); absent → it does not.
function convClosureRow(overrides: Record<string, unknown> = {}): unknown {
  return {
    closure_id: "cl-1",
    question_refs: [],
    source_observation_delta_validation_refs: [],
    closure_disposition: "out_of_scope",
    materiality: "low",
    actionability_surface_refs: [],
    maturity_dimension_refs: [],
    purpose_element_refs: [],
    affected_matrix_row_refs: [],
    supporting_refs: [],
    answer_claim_refs: [],
    expansion_refs: [],
    limitation_refs: [],
    next_action: "",
    ...overrides,
  };
}
function convRound(overrides: Record<string, unknown> = {}): unknown {
  return {
    round_id: "r1",
    source_observation_delta_validation_ref: null,
    maturation_source_delta_validation_ref: null,
    question_frontier_validation_ref: null,
    actionability_matrix_validation_ref: null,
    final_requestion_pass: {
      pass_id: "p1",
      input_authority_refs: [],
      generated_question_refs: [],
      new_material_question_refs: [],
      closed_as_non_material_refs: [],
      pass_status: "not_run",
      rationale: "fixture",
    },
    closure_rows: [],
    source_observation_closure_rows: [],
    remaining_frontier_refs: [],
    ...overrides,
  };
}
function runMaturationConvergence(
  overrides: { rounds?: unknown[] } = {},
): ReconstructMaturationConvergenceLedgerValidationArtifact {
  return validateMaturationConvergenceLedger({
    maturationConvergenceLedger: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      rounds: overrides.rounds ?? [],
    } as never,
    maturationConvergenceLedgerRef: "maturation-convergence-ledger.yaml",
    sourceObservationDelta: { delta_rows: [] } as never,
    maturationQuestionFrontier: {
      session_id: "session-harvest",
      questions: [],
    } as never,
    maturationQuestionFrontierValidation: { validation_status: "valid" } as never,
    actionabilityMatrix: { rows: [] } as never,
    actionabilityMatrixValidation: { validation_status: "valid" } as never,
    answerSupportLedger: { evidence_clusters: [] } as never,
    answerSupportLedgerValidation: { validation_status: "valid" } as never,
    maturationAnswerClaims: { answer_claims: [] } as never,
    maturationAnswerClaimsValidation: { validation_status: "valid" } as never,
    ontologyExpansion: { expansions: [] } as never,
    ontologyExpansionValidation: { validation_status: "valid" } as never,
  });
}

// Slice-17 actionable-ontology fixtures. All four recorded obligations have unconditional enforcers,
// so a minimal type-valid projection records them; overrides flip one facet to bind one violation.
function aoMatrixRow(id: string, overrides: Record<string, unknown> = {}): unknown {
  return { matrix_row_id: id, member_readiness: "closed", ...overrides };
}
function aoProjectedRow(overrides: Record<string, unknown> = {}): unknown {
  return {
    projection_row_id: "pr-1",
    matrix_row_ref: "mr-1",
    claim_scope: "excluded",
    actionability_surface_ref: "static_surface",
    maturity_dimension_ref: "structure",
    purpose_element_ref: "pe-1",
    materiality: "low",
    maturity_level: "L4_validated_for_purpose",
    member_readiness: "closed",
    seed_ref_refs: ["s1"],
    expansion_refs: [],
    evidence_refs: [],
    supporting_refs: [],
    limitation_refs: [],
    rationale: "fixture",
    ...overrides,
  };
}
function runActionableOntology(
  overrides: {
    claim?: string;
    decisionState?: string;
    finalPassStatus?: string;
    includedRefs?: string[];
    excludedRefs?: string[];
    limitationRefs?: string[];
    projectedRows?: unknown[];
    matrixRows?: unknown[];
  } = {},
): ReconstructActionableOntologyValidationArtifact {
  const claim = overrides.claim ?? "actionable_limited";
  return validateActionableOntology({
    actionableOntology: {
      session_id: "session-harvest",
      actionability_claim: claim,
      claim_scope: {
        included_row_refs: overrides.includedRefs ?? [],
        excluded_row_refs: overrides.excludedRefs ?? [],
        limitation_refs: overrides.limitationRefs ?? [],
        rationale: "fixture",
      },
      downstream_claims: {
        query_access: "not_claimed",
        visualization: "not_claimed",
        graph_exploration: "not_claimed",
      },
      projected_rows: overrides.projectedRows ?? [],
    } as never,
    actionableOntologyRef: "actionable-ontology.yaml",
    ontologySeedValidation: { validation_status: "valid" } as never,
    actionabilityMatrix: {
      session_id: "session-harvest",
      rows: overrides.matrixRows ?? [],
    } as never,
    actionabilityMatrixValidation: { validation_status: "valid" } as never,
    ontologyExpansion: { expansions: [] } as never,
    ontologyExpansionValidation: { validation_status: "valid" } as never,
    maturationContinuationDecision: {
      decision_state: overrides.decisionState ?? claim,
    } as never,
    maturationContinuationDecisionValidation: { validation_status: "valid" } as never,
    maturationConvergenceLedgerValidation: {
      validation_status: "valid",
      final_requestion_pass_status: overrides.finalPassStatus ?? "no_new_material_question",
    } as never,
  });
}

// registry-verification-evidence-validator (slice 18, registry-verification-validation.ts). The
// validator is structural: every recorded check is unconditional, so a minimal type-valid evidence +
// empty registry reaches the recorder. The validation artifact carries no validator_id field, so
// attribute by name. validate_registry_snapshot_hash_matches_current_registry_file stays PARKED — its
// match check is gated on the caller-supplied optional expectedRegistrySha256 (the validator never
// computes the on-disk hash itself; writeRegistryVerificationEvidenceValidationArtifact supplies it),
// so the validator carries no internal hash-vs-file guarantee.
function rveEvidence(overrides: Record<string, unknown> = {}): unknown {
  return {
    schema_version: "1",
    session_id: "session-harvest",
    created_at: now,
    registry_ref: "reconstruct-contract-registry.yaml",
    registry_sha256: "0".repeat(64),
    active_artifact_authority_ids: [],
    active_validation_gate_ids: [],
    active_validator_ids: [],
    required_when_predicate_ids: [],
    source_profile_ids: [],
    evidence_rows: [],
    ...overrides,
  };
}
function runRegistryVerificationEvidence(
  overrides: Record<string, unknown> = {},
): ReconstructRegistryVerificationEvidenceValidationArtifact {
  return validateRegistryVerificationEvidence({
    evidence: rveEvidence(overrides) as never,
    contractRegistry: {
      registry_id: "reconstruct-contract-registry",
      artifact_authorities: {},
      validation_gate_catalog: [],
      validator_records: [],
      required_when_predicate_catalog: [],
      source_profile_records: [],
    } as never,
  });
}

// handoff-decision-validator (slice 19, terminal-validation.ts). Terminal gate-projection validator;
// the recorder is stamped before the per-gate consumption loop, so an empty gate catalog still reaches
// it. The validation artifact carries no validator_id field, so attribute by name. Only the two
// ACTIVE-gate obligations are recorded — every PLANNED-gate obligation is PARKED because
// planned_validation_gate_catalog is declared in the registry YAML but NEVER loaded into the runtime
// registry (the loader does not parse it; projectGateStatusesOnce iterates validation_gate_catalog
// only), so planned gates are not consumed/projected here.
function runHandoffDecision(): ReconstructHandoffDecisionValidationArtifact {
  return validateHandoffDecision({
    stopDecision: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      decision: "continue",
    } as never,
    metrics: { unresolved_question_count: 0 } as never,
    manifestValidation: { validation_status: "valid" } as never,
    targetMaterialProfileValidation: null,
    sourceObservationDirectiveValidation: null,
    sourceFrontierValidation: null,
    candidateDispositionValidation: null,
    ontologySeedValidation: null,
    claimRealizationMapValidation: null,
    competencyQuestionsValidation: null,
    competencyQuestionAssessmentValidation: null,
    seedConfirmationValidation: null,
    failureClassificationValidation: null,
    revisionProposalValidation: null,
    contractRegistry: {
      validation_gate_catalog: [],
      required_when_predicate_catalog: [],
    } as never,
  });
}

// candidate-disposition-validator (slice 20, ontology-seed-validation.ts). Structural validator; the
// recorder is stamped before the per-candidate/per-disposition loops, so empty inventory+disposition
// reaches it. The validation artifact carries no validator_id field, so attribute by name. Only the
// four obligations with a distinct, name-matching enforcer are recorded; the salience-scoped ones and
// the surface/purpose-frame/limitation-frontier ones are PARKED (the validator is salience-blind and
// takes no purpose-frame/surface input).
function runCandidateDisposition(): ReconstructCandidateDispositionValidationArtifact {
  return validateCandidateDisposition({
    candidateInventory: { candidates: [] },
    candidateDisposition: { dispositions: [] },
    sourceObservations: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      observations: [],
    } as never,
    registry: {
      candidate_kind_registry: [],
      candidate_disposition_registry: [],
    } as never,
  });
}

function runAnswerSupportLedger(): ReconstructAnswerSupportLedgerValidationArtifact {
  // The five recorded obligations are stamped unconditionally at the top of the validator (before the
  // per-cluster loop), so a zero-cluster ledger + minimal frontier/observations reaches every recorder.
  return validateAnswerSupportLedger({
    answerSupportLedger: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      round_id: "round-harvest",
      evidence_clusters: [],
      directive_author: { owner: "host_llm", author_id: "harvest" },
    },
    maturationQuestionFrontier: {
      schema_version: "1",
      session_id: "session-harvest",
      questions: [],
    } as never,
    maturationQuestionFrontierValidation: {
      validation_status: "valid",
    } as never,
    sourceObservations: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      observations: [],
    } as never,
  });
}

describe("G(a) obligation harvest — validators record their obligation ids", () => {
  it("validateMaturationBaseline records its 3 instrumented obligations (coverage + slice-2 source-reconstruct + mixed-lineage)", () => {
    const out = runBaseline();
    expect(out.asserted_obligation_ids).toContain(
      "validate_baseline_rows_cover_selected_purpose_frame_required_elements",
    );
    expect(out.asserted_obligation_ids).toContain(
      "require_source_reconstruct_record_ref_and_sha256_before_maturation_baseline_consumption",
    );
    expect(out.asserted_obligation_ids).toContain(
      "validate_mixed_baseline_rows_preserve_member_material_and_cross_material_lineage",
    );
  });

  // ANTI-LAUNDERING: recording a pair claims the validator GENUINELY ENFORCES it, not merely that the
  // recorder is reached. Each recorded baseline obligation has an enforcement test that trips a real
  // violation on a breaching input — the slice-2 audit recorded ONLY obligations that clear this bar
  // (preserve_immutable_source_seed / trace_to_seed_refs / static_kinetic_dynamic_surfaces had no
  // distinct enforcement site located, so they stay parked with audit notes). The cheap one is
  // exercised inline below; mixed_lineage_missing is bound by maturation-validation.test.ts and the
  // coverage obligation by its missing_required_coverage tuple tests.
  it("ENFORCEMENT BINDING (require_source_reconstruct_record_ref...): a missing ref/sha256 trips source_reconstruct_record_missing, and supplying both clears it (non-vacuous)", () => {
    const missing = runBaseline(); // minimalBaseline has a null source_reconstruct_record_ref + no sha256
    expect(
      missing.violations.some((v) => v.code === "source_reconstruct_record_missing"),
    ).toBe(true);
    const present = runBaseline({
      baseline: { source_reconstruct_record_ref: "reconstruct-record.yaml" },
      sourceReconstructRecordSha256: "sha256-abc",
    });
    expect(
      present.violations.some((v) => v.code === "source_reconstruct_record_missing"),
    ).toBe(false);
  });

  // ANTI-LAUNDERING (matrix): each recorded matrix obligation was audited to a DISTINCT enforcement
  // region (no laundering) and is bound by an enforcement test in maturation-validation.test.ts —
  // reject-baseline-ref (exactly-one baseline_row_ref), derive-without/and-deltas (identity preserve +
  // maturity-upgrade citation), reject/validate-blocking (the pre/post-frontier branches, PR #100).
  // Obligations with no distinct enforcement (current-mode expansion-alt, blocker/high-L4 rule,
  // "support" rules, the distributed maturity-level rule, the defensive preserve-seed rule) stay
  // parked with ledger audit notes rather than being stamped.
  it("validateActionabilityMatrix in BASELINE mode records its 4 instrumented obligations (row-ids + slice-3 reject-baseline-ref + derive-without-deltas + reject-blocking-before-frontier)", () => {
    const out = runMatrix();
    expect(out.validator_id).toBe("baseline-actionability-matrix-validator");
    for (const obligation of [
      "validate_matrix_row_ids_are_stable_and_baseline_row_refs_close",
      "reject_matrix_rows_without_baseline_row_ref",
      "validate_matrix_rows_derive_from_validated_baseline_without_maturation_deltas",
      "reject_blocking_question_refs_before_question_frontier_authoring",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
  });

  it("validateActionabilityMatrix in CURRENT mode WITHOUT a frontier records derive-and-deltas but NOT the frontier-gated blocking obligation", () => {
    const out = runMatrix({ current: true });
    expect(out.validator_id).toBe("actionability-matrix-validator");
    expect(out.asserted_obligation_ids).toContain(
      "validate_matrix_rows_derive_from_validated_baseline_and_any_applicable_validated_deltas",
    );
    // frontierAvailable=false → the frontier reverse-link obligation must NOT be recorded; the stamp
    // is gated on the frontier branch, so no (validator_id, obligation_id) pair the enforcement region
    // did not actually reach is minted.
    expect(out.asserted_obligation_ids).not.toContain(
      "validate_blocking_question_refs_against_validated_question_frontier",
    );
  });

  it("validateActionabilityMatrix in CURRENT mode WITH a valid frontier additionally records the frontier reverse-link obligation", () => {
    const out = runMatrix({ current: true, frontier: true });
    expect(out.validator_id).toBe("actionability-matrix-validator");
    expect(out.asserted_obligation_ids).toContain(
      "validate_matrix_rows_derive_from_validated_baseline_and_any_applicable_validated_deltas",
    );
    expect(out.asserted_obligation_ids).toContain(
      "validate_blocking_question_refs_against_validated_question_frontier",
    );
  });

  it("validateMaturationAnswerClaims records its 2 instrumented obligations (judge convergent-support + question-refs)", () => {
    const out = runAnswerClaims();
    expect(out.asserted_obligation_ids).toContain(
      "require_convergent_source_evidence_claims_to_have_two_independent_judge_confirmed_supports",
    );
    expect(out.asserted_obligation_ids).toContain(
      "validate_answer_claim_question_refs",
    );
  });

  it("validateSourceObservationDelta records its 4 instrumented obligations (slice 5: observation-refs / frontier-match / batch-lineage / source-kind-hash)", () => {
    const out = runSourceObservationDelta();
    for (const obligation of [
      "validate_delta_observation_refs_exist_in_source_observations",
      "validate_delta_rows_match_accepted_frontier_refs",
      "validate_delta_rows_preserve_observation_batch_id_and_triggering_frontier_validation_ref",
      "validate_delta_source_ref_material_kind_and_observation_hash_match_observed_content",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
    // validate_delta_frontier_kind_is_supported stays parked (kind-vs-artifact consistency only).
    expect(out.asserted_obligation_ids).not.toContain(
      "validate_delta_frontier_kind_is_supported",
    );
  });

  it("validateSourceObservationReentry records its 4 instrumented obligations (slice 5: delta-valid / obs-exists / safety-row / safety-valid)", () => {
    const out = runSourceObservationReentry();
    for (const obligation of [
      "validate_delta_validation_passed_before_prompt_reentry",
      "validate_each_delta_observation_exists_in_source_observations",
      "validate_each_delta_observation_has_exact_prompt_context_source_safety_row",
      "validate_source_safety_validation_passed_before_prompt_reentry",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
  });

  it("validateMaturationQuestionFrontier records its 2 instrumented obligations (slice 6: blocker/high closure + unique question id)", () => {
    const out = runQuestionFrontier();
    expect(out.asserted_obligation_ids).toContain(
      "require_blocker_and_high_questions_to_have_closure_frontier_limitation_or_authority_need",
    );
    expect(out.asserted_obligation_ids).toContain(
      "require_unique_question_id",
    );
  });

  it("validateClaimRealizationMap records its 3 instrumented obligations (slice 7: exactly-one / claim-ids / evidence-refs)", () => {
    const out = runClaimRealizationMap();
    for (const obligation of [
      "require_exactly_one_realization_for_each_seed_claim",
      "validate_realization_claim_ids_against_ontology_seed_claim_ids",
      "validate_realization_evidence_refs_against_source_observations",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
  });

  it("validateAnswerSupportJudgment records its 4 instrumented obligations (slice 8: convergent-coverage / rationale / supports-enum / ref-resolution)", () => {
    const out = runAnswerSupportJudgment();
    for (const obligation of [
      "require_convergent_clusters_to_judge_every_cited_evidence_ref",
      "require_rationale_ref_for_each_judgment",
      "require_supports_enum_for_each_judgment",
      "validate_judgment_refs_resolve_to_answer_support_ledger_clusters_and_evidence",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
  });

  it("validateOntologyExpansion records its 2 instrumented obligations (slice 9: answer-claim-refs + rationale-when-surface-increases) and NOT the parked two", () => {
    const out = runOntologyExpansion();
    for (const obligation of [
      "validate_expansion_answer_claim_refs",
      "require_concept_economy_rationale_when_surface_increases",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
    // PARKED: the seed-rewrite check is basename-exact ("ontology-seed.yaml"), narrower than the
    // unscoped contract clause (anchored refs bypass it); evidence_refs are resolved against the
    // cited answer claims' carried supporting_evidence_refs, not the answer-support-ledger/seed
    // authority the name names. Neither is recorded.
    expect(out.asserted_obligation_ids).not.toContain(
      "prevent_in_place_seed_authority_rewrite",
    );
    expect(out.asserted_obligation_ids).not.toContain(
      "validate_expansion_evidence_refs_against_valid_answer_support_ledger_or_seed_authority",
    );
  });

  // ANTI-LAUNDERING (slice 9, codex PR #119): each recorded ontology-expansion obligation has a
  // non-vacuous enforcement binding — a breaching expansion trips the real violation and a clean
  // variant clears it, so deleting the enforcer (not just the stamp) is observable.
  it("ENFORCEMENT BINDING (validate_expansion_answer_claim_refs): an unresolved answer_claim_ref trips unknown_id; a resolving claim clears it", () => {
    const breaching = runOntologyExpansion({
      expansions: [surfaceIncreaseExpansion("a".repeat(40))],
      answerClaims: [],
    });
    expect(breaching.violations.some((v) => v.code === "unknown_id")).toBe(true);
    const clean = runOntologyExpansion({
      expansions: [surfaceIncreaseExpansion("a".repeat(40))],
      answerClaims: [resolvingAnswerClaim],
    });
    expect(clean.violations.some((v) => v.code === "unknown_id")).toBe(false);
  });

  it("ENFORCEMENT BINDING (require_concept_economy_rationale_when_surface_increases): an add+increases_surface row with a short rationale trips missing_required_ref; a sufficient rationale clears it", () => {
    const breaching = runOntologyExpansion({
      expansions: [surfaceIncreaseExpansion("too short")],
      answerClaims: [resolvingAnswerClaim],
    });
    expect(breaching.violations.some((v) => v.code === "missing_required_ref")).toBe(true);
    const clean = runOntologyExpansion({
      expansions: [surfaceIncreaseExpansion("a".repeat(40))],
      answerClaims: [resolvingAnswerClaim],
    });
    expect(clean.violations.some((v) => v.code === "missing_required_ref")).toBe(false);
  });

  it("validateReconstructRunControl records its 1 instrumented obligation (slice 10: committed-write-txn refs+hashes) and NOT the parked four", () => {
    const out = runReconstructRunControl();
    expect(out.asserted_obligation_ids).toContain(
      "validate_committed_write_transactions_have_artifact_refs_and_hashes",
    );
    // PARKED: commit_method never read; fingerprints not compared (status enum trusted); lock
    // owner_attempt_id not linked to the current attempt; only session_root of the five replay
    // quantities validated. None recorded.
    for (const parked of [
      "preserve_post_write_hash_observation_without_claiming_atomic_commit_when_writer_did_not_prove_atomic_rename",
      "reject_conflicting_request_fingerprints_before_semantic_artifacts_are_consumed",
      "validate_current_attempt_and_session_root_lock_ownership",
      "validate_session_root_request_fingerprint_target_signature_runtime_version_and_idempotency_are_replayable",
    ]) {
      expect(out.asserted_obligation_ids).not.toContain(parked);
    }
  });

  it("ENFORCEMENT BINDING (validate_committed_write_transactions_have_artifact_refs_and_hashes): a committed transaction without committed_hash trips transaction_hash_missing; supplying the hash clears it", () => {
    const breaching = runReconstructRunControl({
      writeTransactions: [committedTransaction(null)],
    });
    expect(breaching.violations.some((v) => v.code === "transaction_hash_missing")).toBe(true);
    const clean = runReconstructRunControl({
      writeTransactions: [committedTransaction("sha256-abc")],
    });
    expect(clean.violations.some((v) => v.code === "transaction_hash_missing")).toBe(false);
  });

  it("validatePurposeConfirmation records its 3 instrumented obligations (slice 11: selected-candidate + require-confirmation + block-seed-readiness) and NOT the parked two", () => {
    const out = runPurposeConfirmation();
    for (const obligation of [
      "validate_confirmation_status_against_selected_purpose_candidate",
      "require_confirmation_for_inferred_or_limitation_backed_purpose",
      "block_seed_readiness_when_confirmation_is_pending_rejected_unavailable_or_evidence_check_pending",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
    // PARKED: the revised-confirmation "preserve source conflict" arm is never checked (only the rerun
    // arm); ob 5's candidate-status arm is never read (only validation_status + confirmation_required).
    expect(out.asserted_obligation_ids).not.toContain(
      "require_revised_confirmation_to_preserve_source_conflict_or_trigger_purpose_discovery_rerun",
    );
    expect(out.asserted_obligation_ids).not.toContain(
      "validate_confirmation_status_against_source_purpose_candidate_status_and_validation_confirmation_required",
    );
  });

  // ANTI-LAUNDERING (slice 11): the three recorded obligations have non-vacuous, NON-OVERLAPPING
  // enforcement bindings — in particular "block" and "require" are bound by disjoint inputs so neither
  // launders the other's enforcer.
  it("ENFORCEMENT BINDING (block_seed_readiness_when_confirmation_is_pending_...): a pending status blocks seed readiness even when confirmation is not required; not_required clears it", () => {
    const breaching = runPurposeConfirmation({
      confirmationRequired: false,
      confirmationStatus: "pending",
    });
    expect(breaching.purpose_projection_status).toBe("blocked");
    expect(breaching.seed_readiness_effect).toBe("must_project_blocked");
    const clean = runPurposeConfirmation({
      confirmationRequired: false,
      confirmationStatus: "not_required",
    });
    expect(clean.purpose_projection_status).toBe("usable");
  });

  it("ENFORCEMENT BINDING (require_confirmation_for_inferred_or_limitation_backed_purpose): when confirmation_required, a not_required status blocks; a confirmed status with a statement clears it", () => {
    const breaching = runPurposeConfirmation({
      confirmationRequired: true,
      confirmationStatus: "not_required",
    });
    expect(breaching.validation_status).toBe("invalid");
    expect(breaching.seed_readiness_effect).toBe("must_project_blocked");
    const clean = runPurposeConfirmation({
      confirmationRequired: true,
      confirmationStatus: "confirmed",
      confirmedStatement: "the user confirmed the inferred purpose",
    });
    expect(clean.validation_status).toBe("valid");
    expect(clean.purpose_projection_status).toBe("usable");
  });

  it("ENFORCEMENT BINDING (validate_confirmation_status_against_selected_purpose_candidate): a non-selected candidate id trips selected_primary_mismatch; the selected id clears it", () => {
    const breaching = runPurposeConfirmation({
      purposeCandidateId: "cand-A",
      selectedCandidateId: "cand-B",
    });
    expect(breaching.violations.some((v) => v.code === "selected_primary_mismatch")).toBe(true);
    const clean = runPurposeConfirmation({
      purposeCandidateId: "cand-A",
      selectedCandidateId: "cand-A",
    });
    expect(clean.violations.some((v) => v.code === "selected_primary_mismatch")).toBe(false);
  });

  it("validateCompetencyQuestionAssessment records its 3 instrumented obligations (slice 12: exactly-one + downstream-effect + required-seed-refs) and NOT the parked two", () => {
    const out = runCompetencyQuestionAssessment();
    for (const obligation of [
      "require_exactly_one_assessment_per_authoritative_question",
      "validate_downstream_effect_consistent_with_answer_status",
      "validate_required_seed_refs_close_against_question_seed_refs",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
    // PARKED: answer_status is checked structurally (enum + per-status fields) but the answerability
    // judgment is content-blind; there is no answerability_trace_refs / limitation / proof closure.
    expect(out.asserted_obligation_ids).not.toContain(
      "validate_answer_status_against_active_answerability_contract",
    );
    expect(out.asserted_obligation_ids).not.toContain(
      "validate_answerability_trace_refs_close_against_seed_evidence_limitations_and_proofs",
    );
  });

  // ANTI-LAUNDERING (slice 12): each recorded obligation has a non-vacuous enforcement binding.
  it("ENFORCEMENT BINDING (require_exactly_one_assessment_per_authoritative_question): a duplicate assessment trips duplicate_id; a single assessment clears it", () => {
    const breaching = runCompetencyQuestionAssessment({
      questions: [cqQuestion()],
      assessments: [cqAssessment(), cqAssessment()],
    });
    expect(breaching.violations.some((v) => v.code === "duplicate_id")).toBe(true);
    const clean = runCompetencyQuestionAssessment({
      questions: [cqQuestion()],
      assessments: [cqAssessment()],
    });
    expect(clean.violations.some((v) => v.code === "duplicate_id")).toBe(false);
  });

  it("ENFORCEMENT BINDING (validate_downstream_effect_consistent_with_answer_status): a downstream_effect that mismatches the answer_status trips invalid_enum; the expected effect clears it", () => {
    const breaching = runCompetencyQuestionAssessment({
      questions: [cqQuestion()],
      assessments: [cqAssessment({ downstream_effect: "ready" })], // answer_status not_applicable expects not_applicable
    });
    expect(
      breaching.violations.some((v) =>
        v.code === "invalid_enum" && /downstream_effect must be/.test(v.message)
      ),
    ).toBe(true);
    const clean = runCompetencyQuestionAssessment({
      questions: [cqQuestion()],
      assessments: [cqAssessment({ downstream_effect: "not_applicable" })],
    });
    expect(
      clean.violations.some((v) =>
        v.code === "invalid_enum" && /downstream_effect must be/.test(v.message)
      ),
    ).toBe(false);
  });

  it("ENFORCEMENT BINDING (validate_required_seed_refs_close_against_question_seed_refs): a missing question seed ref trips missing_required_coverage; carrying it clears it", () => {
    const breaching = runCompetencyQuestionAssessment({
      questions: [cqQuestion({ seed_ref_refs: ["seed-1"] })],
      assessments: [cqAssessment({ required_seed_refs: [] })],
    });
    expect(
      breaching.violations.some((v) =>
        v.code === "missing_required_coverage" && /missing question seed ref/.test(v.message)
      ),
    ).toBe(true);
    const clean = runCompetencyQuestionAssessment({
      questions: [cqQuestion({ seed_ref_refs: ["seed-1"] })],
      assessments: [cqAssessment({ required_seed_refs: ["seed-1"] })],
    });
    expect(
      clean.violations.some((v) =>
        v.code === "missing_required_coverage" && /missing question seed ref/.test(v.message)
      ),
    ).toBe(false);
  });

  it("validateMaterialAdmissionLedger records its 6 instrumented obligations (slice 15: uniqueness + consumer-closure + diagnostic-actionability + rejected-replay + purpose-frame + source-refs) and NOT the parked disposition obligation", () => {
    const out = runMaterialAdmissionLedger();
    for (const obligation of [
      "validate_admission_row_uniqueness",
      "require_admitted_required_or_supporting_rows_to_have_candidate_seed_maturation_limitation_blocked_or_out_of_scope_consumer",
      "prevent_diagnostic_or_trace_only_rows_from_silently_affecting_actionability",
      "require_rejected_ambiguous_rows_to_preserve_replayable_evidence_or_limitation",
      "validate_purpose_element_refs_against_selected_purpose_frame",
      "validate_source_refs_against_observed_source_refs",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
    // PARKED: the name binds three facets but the disposition facet (allowed dispositions by
    // input_kind/admission_phase) is unenforced — the validator only enum-checks disposition, never
    // restricting values per input_kind (see ledger note). Not recorded.
    expect(out.asserted_obligation_ids).not.toContain(
      "validate_phase_scoped_input_kind_disposition_and_snapshot_refs",
    );
  });

  // ANTI-LAUNDERING (slice 15): the two reference-integrity obligations are gated on their
  // authoritative input — the recorder only mints them when control can reach the enforcer (matrix
  // frontier precedent). With no selected frame / no observed source refs, the checks are skipped and
  // the pairs are NOT minted.
  it("validateMaterialAdmissionLedger does NOT record purpose-frame validation without a selected frame, nor source-ref validation without observed source refs", () => {
    const noFrame = runMaterialAdmissionLedger({ withFrame: false });
    expect(noFrame.asserted_obligation_ids).not.toContain(
      "validate_purpose_element_refs_against_selected_purpose_frame",
    );
    const noObservations = runMaterialAdmissionLedger({ withObservations: false });
    expect(noObservations.asserted_obligation_ids).not.toContain(
      "validate_source_refs_against_observed_source_refs",
    );
  });

  // ANTI-LAUNDERING (slice 15): each recorded obligation has a non-vacuous, NON-OVERLAPPING enforcement
  // binding — a breaching input trips a DISTINCT violation code, a clean variant clears it. (The
  // validator's own material-admission-validation.test.ts also binds each of these codes.)
  it("ENFORCEMENT BINDING (validate_admission_row_uniqueness): a duplicate admission_id trips duplicate_id; distinct ids clear it", () => {
    const breaching = runMaterialAdmissionLedger({ rows: [madRow(), madRow()] });
    expect(breaching.violations.some((v) => v.code === "duplicate_id")).toBe(true);
    const clean = runMaterialAdmissionLedger({
      rows: [madRow(), madRow({ admission_id: "adm-2" })],
    });
    expect(clean.violations.some((v) => v.code === "duplicate_id")).toBe(false);
  });

  it("ENFORCEMENT BINDING (require_admitted_required_or_supporting_..._consumer): an admitted row with no consumer or limitation trips downstream_consumer_missing; a limitation clears it", () => {
    const breaching = runMaterialAdmissionLedger({
      rows: [madRow({ disposition: "admitted_material", limitation_refs: [] })],
    });
    expect(breaching.violations.some((v) => v.code === "downstream_consumer_missing")).toBe(true);
    const clean = runMaterialAdmissionLedger({
      rows: [madRow({ disposition: "admitted_material", limitation_refs: ["limitation:x"] })],
    });
    expect(clean.violations.some((v) => v.code === "downstream_consumer_missing")).toBe(false);
  });

  it("ENFORCEMENT BINDING (prevent_diagnostic_or_trace_only_rows_...): a diagnostic high row carrying downstream actionability trips diagnostic_affects_actionability; dropping the downstream refs clears it", () => {
    const breaching = runMaterialAdmissionLedger({
      rows: [madRow({
        disposition: "diagnostic_only",
        materiality: "high",
        downstream_authority_refs: ["candidate-inventory.yaml"],
      })],
    });
    expect(breaching.violations.some((v) => v.code === "diagnostic_affects_actionability")).toBe(true);
    const clean = runMaterialAdmissionLedger({
      rows: [madRow({
        disposition: "diagnostic_only",
        materiality: "high",
        downstream_authority_refs: [],
      })],
    });
    expect(clean.violations.some((v) => v.code === "diagnostic_affects_actionability")).toBe(false);
  });

  it("ENFORCEMENT BINDING (require_rejected_ambiguous_rows_...): a rejected row with no source/limitation refs trips rejected_without_replayable_evidence; a limitation clears it", () => {
    const breaching = runMaterialAdmissionLedger({
      rows: [madRow({ disposition: "rejected_ambiguous", source_refs: [], limitation_refs: [] })],
    });
    expect(
      breaching.violations.some((v) => v.code === "rejected_without_replayable_evidence"),
    ).toBe(true);
    const clean = runMaterialAdmissionLedger({
      rows: [madRow({
        disposition: "rejected_ambiguous",
        source_refs: [],
        limitation_refs: ["limitation:contradiction"],
      })],
    });
    expect(
      clean.violations.some((v) => v.code === "rejected_without_replayable_evidence"),
    ).toBe(false);
  });

  it("ENFORCEMENT BINDING (validate_purpose_element_refs_against_selected_purpose_frame): a ref outside the selected frame trips unknown_purpose_element_ref; an in-frame ref clears it", () => {
    const breaching = runMaterialAdmissionLedger({
      rows: [madRow({ purpose_element_refs: ["not-in-frame"] })],
    });
    expect(breaching.violations.some((v) => v.code === "unknown_purpose_element_ref")).toBe(true);
    const clean = runMaterialAdmissionLedger({
      rows: [madRow({ purpose_element_refs: ["elem-1"] })],
    });
    expect(clean.violations.some((v) => v.code === "unknown_purpose_element_ref")).toBe(false);
  });

  it("ENFORCEMENT BINDING (validate_source_refs_against_observed_source_refs): a source_ref not in observations trips unknown_source_ref; an observed ref clears it", () => {
    const breaching = runMaterialAdmissionLedger({
      rows: [madRow({ source_refs: ["/unknown/path.ts"] })],
    });
    expect(breaching.violations.some((v) => v.code === "unknown_source_ref")).toBe(true);
    const clean = runMaterialAdmissionLedger({
      rows: [madRow({ source_refs: ["/tmp/harvest-src.txt"] })],
    });
    expect(clean.violations.some((v) => v.code === "unknown_source_ref")).toBe(false);
  });

  it("validateMaturationConvergenceLedger records its 1 instrumented obligation (slice 16: closure delta-ref match) and NOT the 6 parked semantic/partial obligations", () => {
    const out = runMaturationConvergence();
    expect(out.asserted_obligation_ids).toContain(
      "validate_closure_source_observation_delta_refs_match_source_observation_delta_validation",
    );
    // PARKED (codex PR #127 + Explore audit): the other six convergence obligations are under-enforced
    // relative to their contract bullets — ready-projection gate deferred (h); positive-support
    // exclusion has no enforcer; the remaining-frontier composite only resolves ids; blocker/high
    // closure is a weak id-in-any-closure-row proxy (carry-forward + disposition/refs unproven);
    // source-delta closure skips empty rounds and never validates the disposition value; and
    // prior-validations omits the registry-declared source-observation-delta validation status. See the
    // obligation-coverage-ledger.yaml notes.
    for (const parked of [
      "preserve_remaining_frontier_refs_without_ready_projection",
      "reject_actionable_ready_until_final_requestion_convergence_is_proven",
      "reject_trace_audit_or_authority_request_rows_as_positive_semantic_support",
      "require_every_blocker_or_high_question_to_have_answer_expansion_blocked_or_frontier_closure",
      "validate_each_source_observation_delta_row_has_convergence_closure_disposition",
      "validate_prior_maturation_validations_are_valid",
    ]) {
      expect(out.asserted_obligation_ids).not.toContain(parked);
    }
  });

  // ANTI-LAUNDERING (slice 16): the recorded obligation has a non-vacuous binding — a closure row whose
  // source_observation_delta_validation_refs do not match the round ref trips conflicting_state, and a
  // matching ref clears it. (maturation-validation.test.ts also binds this code.)
  it("ENFORCEMENT BINDING (validate_closure_source_observation_delta_refs_match...): a closure delta-ref not matching the round ref trips conflicting_state; a matching ref clears it", () => {
    const breaching = runMaturationConvergence({
      rounds: [convRound({
        source_observation_delta_validation_ref: "ref-A",
        closure_rows: [convClosureRow({ source_observation_delta_validation_refs: ["ref-B"] })],
      })],
    });
    expect(
      breaching.violations.some((v) =>
        v.code === "conflicting_state" &&
        /closure source_observation_delta_validation_refs must match/.test(v.message)
      ),
    ).toBe(true);
    const clean = runMaturationConvergence({
      rounds: [convRound({
        source_observation_delta_validation_ref: "ref-A",
        closure_rows: [convClosureRow({ source_observation_delta_validation_refs: ["ref-A"] })],
      })],
    });
    expect(
      clean.violations.some((v) =>
        v.code === "conflicting_state" &&
        /closure source_observation_delta_validation_refs must match/.test(v.message)
      ),
    ).toBe(false);
  });

  it("validateActionableOntology records its 4 instrumented obligations (slice 17: ready-gate + claim-vs-continuation + actionable-limited-scope + projected-row-trace) and NOT the 3 parked", () => {
    const out = runActionableOntology();
    for (const obligation of [
      "reject_actionable_ready_until_final_requestion_convergence_is_proven",
      "validate_actionability_claim_against_maturation_continuation_decision",
      "validate_actionable_limited_claim_scope_rows",
      "require_every_projected_row_to_trace_to_seed_expansion_or_limitation",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
    // PARKED (Explore audit): blocker/high-question closure is delegated to the continuation-decision
    // validator; per-surface static/kinetic/dynamic closure is not checked here (only per-row); proof
    // authorities are blanket-rejected, not validated. See obligation-coverage-ledger.yaml notes.
    for (const parked of [
      "reject_actionable_ready_when_material_blocker_or_high_question_remains",
      "require_static_kinetic_dynamic_surfaces_to_be_closed_or_limitation_excluded",
      "validate_applicable_proof_authorities_before_projecting_runtime_query_visualization_or_graph_claims",
    ]) {
      expect(out.asserted_obligation_ids).not.toContain(parked);
    }
  });

  // ANTI-LAUNDERING (slice 17): each recorded obligation has a non-vacuous, NON-OVERLAPPING binding —
  // a breaching input trips a DISTINCT violation message, a clean variant clears it. (maturation-validation.test.ts also binds these.)
  it("ENFORCEMENT BINDING (reject_actionable_ready_until_final_requestion_convergence_is_proven): actionable_ready with unproven final re-question convergence trips conflicting_state; a proven pass clears it", () => {
    const breaching = runActionableOntology({
      claim: "actionable_ready",
      decisionState: "actionable_ready",
      finalPassStatus: "material_question_found",
    });
    expect(
      breaching.violations.some((v) =>
        v.code === "conflicting_state" &&
        /actionable_ready projection requires final re-question convergence/.test(v.message)
      ),
    ).toBe(true);
    const clean = runActionableOntology({
      claim: "actionable_ready",
      decisionState: "actionable_ready",
      finalPassStatus: "no_new_material_question",
    });
    expect(
      clean.violations.some((v) =>
        v.code === "conflicting_state" &&
        /actionable_ready projection requires final re-question convergence/.test(v.message)
      ),
    ).toBe(false);
  });

  it("ENFORCEMENT BINDING (validate_actionability_claim_against_maturation_continuation_decision): a claim not matching the decision state trips conflicting_state; a matching claim clears it", () => {
    const breaching = runActionableOntology({
      claim: "actionable_ready",
      decisionState: "actionable_limited",
    });
    expect(
      breaching.violations.some((v) =>
        v.code === "conflicting_state" &&
        /claim must match an actionable continuation decision state/.test(v.message)
      ),
    ).toBe(true);
    const clean = runActionableOntology({
      claim: "actionable_limited",
      decisionState: "actionable_limited",
    });
    expect(
      clean.violations.some((v) =>
        v.code === "conflicting_state" &&
        /claim must match an actionable continuation decision state/.test(v.message)
      ),
    ).toBe(false);
  });

  it("ENFORCEMENT BINDING (validate_actionable_limited_claim_scope_rows): actionable_limited with no included row ref trips missing_required_ref; an included ref clears it", () => {
    const breaching = runActionableOntology({
      claim: "actionable_limited",
      includedRefs: [],
    });
    expect(
      breaching.violations.some((v) =>
        v.code === "missing_required_ref" &&
        /actionable_limited projection requires at least one included row ref/.test(v.message)
      ),
    ).toBe(true);
    const clean = runActionableOntology({
      claim: "actionable_limited",
      includedRefs: ["mr-1"],
      limitationRefs: ["lim-1"],
      matrixRows: [aoMatrixRow("mr-1")],
    });
    expect(
      clean.violations.some((v) =>
        v.code === "missing_required_ref" &&
        /actionable_limited projection requires at least one included row ref/.test(v.message)
      ),
    ).toBe(false);
  });

  it("ENFORCEMENT BINDING (require_every_projected_row_to_trace_to_seed_expansion_or_limitation): a projected row with no seed/expansion/limitation refs trips missing_required_ref; a seed ref clears it", () => {
    const breaching = runActionableOntology({
      excludedRefs: ["mr-1"],
      matrixRows: [aoMatrixRow("mr-1")],
      projectedRows: [
        aoProjectedRow({ seed_ref_refs: [], expansion_refs: [], limitation_refs: [] }),
      ],
    });
    expect(
      breaching.violations.some((v) =>
        v.code === "missing_required_ref" &&
        /each actionable ontology row must cite seed refs, expansion refs, or limitation refs/.test(v.message)
      ),
    ).toBe(true);
    const clean = runActionableOntology({
      excludedRefs: ["mr-1"],
      matrixRows: [aoMatrixRow("mr-1")],
      projectedRows: [aoProjectedRow({ seed_ref_refs: ["s1"] })],
    });
    expect(
      clean.violations.some((v) =>
        v.code === "missing_required_ref" &&
        /each actionable ontology row must cite seed refs, expansion refs, or limitation refs/.test(v.message)
      ),
    ).toBe(false);
  });

  it("validateRegistryVerificationEvidence records its 7 instrumented obligations (slice 18: hash-recorded + id-uniqueness + subject-lists-match + gate-has-validator + validator-gate-resolves + gate-predicate-resolves + evidence-row-per-subject) and NOT the parked hash-matches-file obligation", () => {
    const out = runRegistryVerificationEvidence();
    for (const obligation of [
      "validate_registry_snapshot_hash_is_recorded",
      "validate_active_artifact_gate_validator_predicate_and_source_profile_ids_are_unique",
      "validate_active_registry_subject_lists_match_current_registry_catalogs",
      "validate_every_active_gate_has_a_validator_record",
      "validate_every_validator_gate_ref_resolves_to_an_active_gate",
      "validate_every_active_gate_required_when_predicate_resolves",
      "require_evidence_row_for_each_current_registry_subject_id",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
    // PARKED (Explore audit): the hash-matches-current-file check (registry_hash_mismatch) only fires
    // when the caller supplies expectedRegistrySha256 — the validator never derives the on-disk hash
    // itself, so it carries no internal "matches current file" guarantee. Not recorded.
    expect(out.asserted_obligation_ids).not.toContain(
      "validate_registry_snapshot_hash_matches_current_registry_file",
    );
  });

  // ANTI-LAUNDERING (slice 18): each recorded obligation has a non-vacuous enforcement binding. All
  // seven violation codes are bound by dedicated cases in registry-verification-validation.test.ts
  // (registry_hash_missing, duplicate_id, registry_claim_mismatch, active_gate_without_validator,
  // validator_unknown_gate, predicate_missing_for_gate, evidence_row_missing). Three representative
  // shapes are exercised inline below across the validator's check families (hash format, claim-list
  // uniqueness, claim-vs-registry delta) so the recorder cannot launder a deleted enforcer.
  it("ENFORCEMENT BINDING (validate_registry_snapshot_hash_is_recorded): a non-sha256 registry_sha256 trips registry_hash_missing; a valid 64-hex clears it", () => {
    const breaching = runRegistryVerificationEvidence({ registry_sha256: "not-a-real-hash" });
    expect(breaching.violations.some((v) => v.code === "registry_hash_missing")).toBe(true);
    const clean = runRegistryVerificationEvidence({ registry_sha256: "0".repeat(64) });
    expect(clean.violations.some((v) => v.code === "registry_hash_missing")).toBe(false);
  });

  it("ENFORCEMENT BINDING (validate_active_..._ids_are_unique): a duplicated active_validator_id trips duplicate_id; distinct ids clear it", () => {
    const breaching = runRegistryVerificationEvidence({ active_validator_ids: ["v1", "v1"] });
    expect(breaching.violations.some((v) => v.code === "duplicate_id")).toBe(true);
    const clean = runRegistryVerificationEvidence({ active_validator_ids: [] });
    expect(clean.violations.some((v) => v.code === "duplicate_id")).toBe(false);
  });

  it("ENFORCEMENT BINDING (validate_active_registry_subject_lists_match...): an active id absent from the current registry trips registry_claim_mismatch; an empty list (matching the empty registry) clears it", () => {
    const breaching = runRegistryVerificationEvidence({ active_validator_ids: ["ghost-validator"] });
    expect(breaching.violations.some((v) => v.code === "registry_claim_mismatch")).toBe(true);
    const clean = runRegistryVerificationEvidence({ active_validator_ids: [] });
    expect(clean.violations.some((v) => v.code === "registry_claim_mismatch")).toBe(false);
  });

  it("validateHandoffDecision records its 2 instrumented active-gate obligations (slice 19: consume-active-gate-statuses + project-missing-active-as-blocked) and NOT the 6 parked planned-gate/defensive obligations", () => {
    const out = runHandoffDecision();
    for (const obligation of [
      "consume_all_active_validation_gate_statuses_emitted_by_runtime",
      "project_missing_active_validation_artifact_as_blocked",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
    // PARKED (Explore audit). FOUR depend on planned_validation_gate_catalog, which is declared in the
    // registry YAML but never loaded into the runtime registry (the loader never parses it;
    // projectGateStatusesOnce iterates validation_gate_catalog only) → NOT_FOUND in this validator:
    // consume-planned / derive-planned-inputs / project-missing-planned / failure-covers-planned.
    // ONE is AMBIGUOUS (no distinct "accepted-maturation minimum output gates" filter — all applicable
    // active gates are projected, but no maturation-minimum selection). ONE is a defensive negative
    // ("do not require failure/revision for clean stop") delegated to the registry required_when
    // predicates with no positive bindable violation. See obligation-coverage-ledger.yaml notes.
    for (const parked of [
      "consume_all_requested_or_promoted_planned_gate_statuses_emitted_by_runtime",
      "derive_terminal_planned_gate_inputs_from_registry_gate_catalogs_not_hand_maintained_lists",
      "do_not_require_failure_or_revision_artifacts_for_clean_stop_decisions",
      "project_missing_required_promoted_or_requested_planned_gate_validation_artifact_as_blocked",
      "validate_accepted_maturation_execution_minimum_output_gates_are_terminal_projected",
      "validate_failure_classification_covers_failed_or_missing_requested_planned_gates",
    ]) {
      expect(out.asserted_obligation_ids).not.toContain(parked);
    }
  });

  // ANTI-LAUNDERING (slice 19): the two recorded obligations have non-vacuous, NON-OVERLAPPING
  // enforcement bindings in terminal-validation.test.ts — an active gate whose validation is INVALID
  // trips handoff_required_validation_invalid (proves consume-all-active-gate-statuses; lines ~1077,
  // 1120), and an active gate whose validation artifact is MISSING trips handoff_required_validation_
  // missing AND drives readiness_projection to "blocked" (proves project-missing-active-as-blocked;
  // lines ~1058/1091 + ~503/1141). Distinct breaching inputs (gate present-but-invalid vs absent), so
  // neither launders the other. Building the registry/predicate machinery inline here would duplicate
  // that fixture; the recorder-reached stamp is proven above and by the flip-test.

  it("validateCandidateDisposition records its 4 instrumented obligations (slice 20: kind-registry + disposition-registry + rationale+evidence + promoted-target) and NOT the 5 parked", () => {
    const out = runCandidateDisposition();
    for (const obligation of [
      "validate_candidate_inventory_candidate_kind_against_candidate_kind_registry",
      "validate_candidate_disposition_against_candidate_disposition_registry",
      "require_rationale_and_evidence_refs_for_each_disposition",
      "validate_promoted_candidate_target_seed_refs_are_declared_for_promoted_dispositions",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
    // PARKED (Explore audit). FOUR name concepts the validator never inspects (NOT_FOUND): a
    // deferred/source_gap disposition citing a limitation/frontier; high-salience candidates carrying
    // surface+purpose_element refs; actionability_surface_refs vs a registry surface catalog; and
    // purpose_element_refs vs a selected purpose frame (the last is registry-marked
    // activation_gated_dormant and the validator takes no purpose-frame input). ONE is salience-blind:
    // require_exactly_one_disposition_for_each_salient_candidate — the validator enforces exactly-one
    // for EVERY candidate (duplicate_disposition + missing_candidate_disposition), a superset of the
    // obligation's salient scope, but never reads the `salience` field, so it does not validate the
    // obligation's scope discriminator. See obligation-coverage-ledger.yaml notes.
    for (const parked of [
      "require_deferred_or_source_gap_disposition_to_cite_limitation_or_frontier",
      "require_exactly_one_disposition_for_each_salient_candidate",
      "require_high_salience_non_rejected_candidates_to_carry_surface_and_purpose_element_refs",
      "validate_candidate_actionability_surface_refs_against_registry_surface_values",
      "validate_candidate_purpose_element_refs_against_selected_purpose_frame",
    ]) {
      expect(out.asserted_obligation_ids).not.toContain(parked);
    }
  });

  // ANTI-LAUNDERING (slice 20): each recorded obligation has a non-vacuous, NON-OVERLAPPING enforcement
  // binding in ontology-seed-validation.test.ts — invalid_candidate_kind (kind not in registry),
  // invalid_disposition (disposition_id not in registry), rationale_missing + evidence_ref_missing
  // (each disposition needs rationale and evidence), and promoted_target_missing (a promoted_to_seed_
  // layer disposition with no target_seed_refs). The promoted binding uses a DEDICATED code distinct
  // from target_ref_missing (which the broader represented_as_* path uses), so it is scope-specific.
  // Building the registry/inventory fixtures inline here would duplicate that file; the recorder-
  // reached stamp is proven above and by the flip-test.

  it("validateAnswerSupportLedger records its 5 instrumented obligations (slice 21: question-refs + user-confirmation + convergent-two-independent + frontier-triggered-reentry + observation-specific-safety-row) and NOT the 4 parked", () => {
    const out = runAnswerSupportLedger();
    for (const obligation of [
      "validate_evidence_cluster_question_refs",
      "validate_user_confirmation_support_mode",
      "require_two_independent_evidence_refs_for_convergent_source_evidence_unless_direct_authority",
      "require_frontier_triggered_evidence_to_resolve_to_valid_reentry_validation",
      "require_observation_specific_evidence_support_source_safety_row_with_claim_sufficiency_and_replay",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
    // PARKED (Explore audit, slice 21). require_contradictions_to_be_recorded_and_bounded is DELEGATED:
    // this validator never reads contradiction_refs; the bounded check lives in validateMaturationAnswer
    // Claims. require_frontier_triggered_evidence_to_resolve_to_valid_lineage_index_validation is PARTIAL:
    // the valid-lineage-index-validation check is an unscoped global precondition, not scoped to the
    // frontier_triggered discriminator (only re-entry reads that scope). validate_external_or_runtime_
    // authority_support_mode is PARTIAL: runtime_proof is presence-only and authority_response delegates
    // closure-frontier-request resolution. validate_support_mode_required_refs is AMBIGUOUS/overlapping:
    // its per-mode refs are owned by the user-confirmation + external/runtime obligations and only direct_
    // authority is un-owned, which is not 1:1 with the generic name. See obligation-coverage-ledger.yaml.
    for (const parked of [
      "require_contradictions_to_be_recorded_and_bounded",
      "require_frontier_triggered_evidence_to_resolve_to_valid_lineage_index_validation",
      "validate_external_or_runtime_authority_support_mode",
      "validate_support_mode_required_refs",
    ]) {
      expect(out.asserted_obligation_ids).not.toContain(parked);
    }
  });

  // ANTI-LAUNDERING (slice 21): each recorded obligation has a non-vacuous, NON-OVERLAPPING enforcement
  // binding in maturation-validation.test.ts. Frontier-triggered re-entry is bound by "rejects answer
  // support that consumes a delta observation missing from re-entry-approved ids" (missing_required_ref via
  // the isFrontierTriggeredObservation branch). The other four are bound by the "ENFORCEMENT BINDING (slice
  // 21 ...)" tests added there: unknown_id (a cluster question_ref absent from the validated frontier),
  // support_mode_missing_authority (a user_confirmation cluster missing confirmation authority), insufficient
  // _independent_evidence (a convergent cluster with one evidence record), and missing_required_ref (evidence
  // whose observation has no sufficient/replay-allowed source-safety row) — each with a clean variant that
  // clears it. Building those fixtures inline here would duplicate that file.

  it("FRESHNESS: the checked-in obligation-coverage-recorded.yaml equals the 67 harvested (validator_id, obligation_id) pairs", async () => {
    const baselineOut = runBaseline();
    const matrixBaselineOut = runMatrix();
    // current WITH frontier captures both current-mode matrix obligations (derive-and-deltas + the
    // frontier reverse-link); it is a superset of the no-frontier current call for recording.
    const matrixCurrentOut = runMatrix({ current: true, frontier: true });
    const answerClaimsOut = runAnswerClaims();
    const deltaOut = runSourceObservationDelta();
    const reentryOut = runSourceObservationReentry();
    const questionFrontierOut = runQuestionFrontier();
    const claimRealizationOut = runClaimRealizationMap();
    const judgmentOut = runAnswerSupportJudgment();
    const ontologyExpansionOut = runOntologyExpansion();
    const runControlOut = runReconstructRunControl();
    const purposeConfirmationOut = runPurposeConfirmation();
    const competencyAssessmentOut = runCompetencyQuestionAssessment();
    const materialAdmissionOut = runMaterialAdmissionLedger();
    const convergenceOut = runMaturationConvergence();
    const actionableOntologyOut = runActionableOntology();
    const registryVerificationOut = runRegistryVerificationEvidence();
    const handoffDecisionOut = runHandoffDecision();
    const candidateDispositionOut = runCandidateDisposition();
    const answerSupportLedgerOut = runAnswerSupportLedger();

    const harvested = [
      // The fns without a validator_id field are attributed by name.
      ...baselineOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "maturation-baseline-validator",
        obligation_id,
      })),
      ...matrixBaselineOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: matrixBaselineOut.validator_id,
        obligation_id,
      })),
      ...matrixCurrentOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: matrixCurrentOut.validator_id,
        obligation_id,
      })),
      ...answerClaimsOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "maturation-answer-claims-validator",
        obligation_id,
      })),
      ...deltaOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "source-observation-delta-validator",
        obligation_id,
      })),
      ...reentryOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "source-observation-reentry-validator",
        obligation_id,
      })),
      ...questionFrontierOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "maturation-question-frontier-validator",
        obligation_id,
      })),
      ...claimRealizationOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "claim-realization-map-validator",
        obligation_id,
      })),
      ...judgmentOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "answer-support-judgment-validator",
        obligation_id,
      })),
      ...ontologyExpansionOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "ontology-expansion-validator",
        obligation_id,
      })),
      ...runControlOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "reconstruct-run-control-validator",
        obligation_id,
      })),
      ...purposeConfirmationOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "purpose-confirmation-validator",
        obligation_id,
      })),
      ...competencyAssessmentOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "competency-question-assessment-validator",
        obligation_id,
      })),
      ...materialAdmissionOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "material-admission-ledger-validator",
        obligation_id,
      })),
      ...convergenceOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "maturation-convergence-ledger-validator",
        obligation_id,
      })),
      ...actionableOntologyOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "actionable-ontology-validator",
        obligation_id,
      })),
      ...registryVerificationOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "registry-verification-evidence-validator",
        obligation_id,
      })),
      ...handoffDecisionOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "handoff-decision-validator",
        obligation_id,
      })),
      ...candidateDispositionOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "candidate-disposition-validator",
        obligation_id,
      })),
      ...answerSupportLedgerOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "answer-support-ledger-validator",
        obligation_id,
      })),
    ];

    const recordedText = await fs.readFile(
      path.resolve(".onto/processes/reconstruct/obligation-coverage-recorded.yaml"),
      "utf8",
    );
    const recordedDoc = parseYaml(recordedText) as {
      recorded: Array<{ validator_id: string; obligation_id: string }>;
    };

    const sortKey = (p: { validator_id: string; obligation_id: string }): string =>
      `${p.validator_id}::${p.obligation_id}`;
    const harvestedSet = new Set(harvested.map(sortKey));
    const recordedSet = new Set(recordedDoc.recorded.map(sortKey));

    expect([...harvestedSet].sort()).toEqual([...recordedSet].sort());
    expect(harvestedSet.size).toBe(67);
  });
});
