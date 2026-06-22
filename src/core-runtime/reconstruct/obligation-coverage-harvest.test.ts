import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructActionabilityMatrixArtifact,
  ReconstructActionabilityMatrixValidationArtifact,
  ReconstructMaturationAnswerClaimsArtifact,
  ReconstructMaturationAnswerClaimsValidationArtifact,
  ReconstructMaturationBaselineArtifact,
  ReconstructMaturationBaselineValidationArtifact,
  ReconstructSourceObservationDeltaValidationArtifact,
  ReconstructSourceObservationLineageIndexValidationArtifact,
  ReconstructSourceObservationReentryValidationArtifact,
} from "./artifact-types.js";
import {
  validateActionabilityMatrix,
  validateMaturationAnswerClaims,
  validateMaturationBaseline,
} from "./maturation-validation.js";
import {
  validateSourceObservationDelta,
  validateSourceObservationLineageIndex,
  validateSourceObservationReentry,
} from "./source-observation-delta-validation.js";
import { reuseMatchArtifactHash } from "./run.js";

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

// source-observation-lineage-index-validator (slice 6) — async, and reuse-hashed (its validation is
// one of authoredArtifactReuseMatch's hashed inputs). Zero lineage_rows means no readYamlDocument
// file reads in the loop, so the recorders (before the loop) fire and the fn returns.
async function runSourceObservationLineageIndex(): Promise<ReconstructSourceObservationLineageIndexValidationArtifact> {
  return validateSourceObservationLineageIndex({
    sessionId: "session-harvest",
    lineageIndex: {
      schema_version: "1",
      session_id: "session-harvest",
      created_at: now,
      lineage_rows: [],
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

  it("validateSourceObservationLineageIndex records its 7 instrumented obligations (slice 6)", async () => {
    const out = await runSourceObservationLineageIndex();
    for (const obligation of [
      "require_each_lineage_row_delta_validation_to_be_valid",
      "require_each_lineage_row_reentry_validation_to_be_valid",
      "validate_each_lineage_added_observation_exists_in_source_observations",
      "validate_each_lineage_added_observation_was_reentered_by_its_validation",
      "validate_each_lineage_row_delta_ref_is_readable_and_session_matching",
      "validate_lineage_added_observation_ids_match_delta_added_observation_ids",
      "validate_unique_session_level_lineage_row_ids",
    ]) {
      expect(out.asserted_obligation_ids).toContain(obligation);
    }
  });

  it("HASH SAFETY: asserted_obligation_ids is excluded from the reuse-match identity hash (telemetry is identity-neutral)", () => {
    const base = {
      schema_version: "1",
      session_id: "s",
      validation_status: "valid",
      violations: [],
    };
    // Adding/altering asserted_obligation_ids must NOT change the reuse-match hash — that is what makes
    // instrumenting a reuse-hashed validation artifact (e.g. lineage-index) hash-neutral.
    expect(reuseMatchArtifactHash({ ...base, asserted_obligation_ids: ["a", "b"] })).toBe(
      reuseMatchArtifactHash(base),
    );
    expect(reuseMatchArtifactHash({ ...base, asserted_obligation_ids: ["a", "b"] })).toBe(
      reuseMatchArtifactHash({ ...base, asserted_obligation_ids: ["x"] }),
    );
    // ...but a non-stripped field still changes it (the hash is not vacuously constant).
    expect(reuseMatchArtifactHash({ ...base, validation_status: "invalid" })).not.toBe(
      reuseMatchArtifactHash(base),
    );
  });

  it("FRESHNESS: the checked-in obligation-coverage-recorded.yaml equals the 27 harvested (validator_id, obligation_id) pairs", async () => {
    const baselineOut = runBaseline();
    const matrixBaselineOut = runMatrix();
    // current WITH frontier captures both current-mode matrix obligations (derive-and-deltas + the
    // frontier reverse-link); it is a superset of the no-frontier current call for recording.
    const matrixCurrentOut = runMatrix({ current: true, frontier: true });
    const answerClaimsOut = runAnswerClaims();
    const deltaOut = runSourceObservationDelta();
    const reentryOut = runSourceObservationReentry();
    const lineageOut = await runSourceObservationLineageIndex();

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
      ...lineageOut.asserted_obligation_ids.map((obligation_id) => ({
        validator_id: "source-observation-lineage-index-validator",
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
    expect(harvestedSet.size).toBe(27);
  });
});
