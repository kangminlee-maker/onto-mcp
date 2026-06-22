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
} from "./artifact-types.js";
import {
  validateActionabilityMatrix,
  validateMaturationAnswerClaims,
  validateMaturationBaseline,
} from "./maturation-validation.js";

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

  it("FRESHNESS: the checked-in obligation-coverage-recorded.yaml equals the 12 harvested (validator_id, obligation_id) pairs", async () => {
    const baselineOut = runBaseline();
    const matrixBaselineOut = runMatrix();
    // current WITH frontier captures both current-mode matrix obligations (derive-and-deltas + the
    // frontier reverse-link); it is a superset of the no-frontier current call for recording.
    const matrixCurrentOut = runMatrix({ current: true, frontier: true });
    const answerClaimsOut = runAnswerClaims();

    const harvested = [
      // The baseline + answer-claims fns do not stamp a validator_id field; attribute them by name.
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
    expect(harvestedSet.size).toBe(12);
  });
});
