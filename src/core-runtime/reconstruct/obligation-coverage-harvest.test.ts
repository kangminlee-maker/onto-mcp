import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructActionabilityMatrixArtifact,
  ReconstructActionabilityMatrixValidationArtifact,
  ReconstructClaimRealizationMapValidationArtifact,
  ReconstructMaturationAnswerClaimsArtifact,
  ReconstructMaturationAnswerClaimsValidationArtifact,
  ReconstructMaturationBaselineArtifact,
  ReconstructMaturationBaselineValidationArtifact,
  ReconstructMaturationQuestionFrontierValidationArtifact,
  ReconstructSourceObservationDeltaValidationArtifact,
  ReconstructSourceObservationReentryValidationArtifact,
} from "./artifact-types.js";
import {
  validateActionabilityMatrix,
  validateMaturationAnswerClaims,
  validateMaturationBaseline,
  validateMaturationQuestionFrontier,
} from "./maturation-validation.js";
import {
  validateSourceObservationDelta,
  validateSourceObservationReentry,
} from "./source-observation-delta-validation.js";
import { validateClaimRealizationMapForOntologySeed } from "./post-seed-validation.js";

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

  it("FRESHNESS: the checked-in obligation-coverage-recorded.yaml equals the 25 harvested (validator_id, obligation_id) pairs", async () => {
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
    expect(harvestedSet.size).toBe(25);
  });
});
