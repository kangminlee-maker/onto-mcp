import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructActionabilityMatrixArtifact,
  ReconstructMaturationAnswerClaimsArtifact,
  ReconstructMaturationAnswerClaimsValidationArtifact,
  ReconstructMaturationBaselineArtifact,
  ReconstructMaturationBaselineValidationArtifact,
} from "./artifact-types.js";
import {
  validateActionabilityMatrix,
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

function runBaseline(): ReconstructMaturationBaselineValidationArtifact {
  return validateMaturationBaseline({
    maturationBaseline: minimalBaseline(),
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

describe("G(a) obligation harvest — validators record their obligation ids", () => {
  it("validateMaturationBaseline records the baseline-coverage obligation", () => {
    const out = runBaseline();
    expect(out.asserted_obligation_ids).toContain(
      "validate_baseline_rows_cover_selected_purpose_frame_required_elements",
    );
  });

  it("validateActionabilityMatrix in BASELINE mode (no post-frontier inputs) records the matrix obligation and attributes to baseline-actionability-matrix-validator", () => {
    const out = validateActionabilityMatrix({
      actionabilityMatrix: minimalMatrix(),
      maturationBaseline: minimalBaseline(),
      maturationBaselineValidation: baselineValidationInput(),
    });
    expect(out.validator_id).toBe("baseline-actionability-matrix-validator");
    expect(out.asserted_obligation_ids).toContain(
      "validate_matrix_row_ids_are_stable_and_baseline_row_refs_close",
    );
  });

  it("validateActionabilityMatrix in CURRENT mode (post-frontier inputs present) records the matrix obligation and attributes to actionability-matrix-validator", () => {
    const out = validateActionabilityMatrix({
      actionabilityMatrix: minimalMatrix(),
      maturationBaseline: minimalBaseline(),
      maturationBaselineValidation: baselineValidationInput(),
      // Supplying answer-claim inputs flips postFrontierInputsPresent → current-matrix mode.
      maturationAnswerClaims: {
        schema_version: "1",
        session_id: "session-harvest",
        created_at: now,
        answer_claims: [],
      } as ReconstructMaturationAnswerClaimsArtifact,
      maturationAnswerClaimsValidation: {
        validation_status: "invalid",
      } as ReconstructMaturationAnswerClaimsValidationArtifact,
    });
    expect(out.validator_id).toBe("actionability-matrix-validator");
    expect(out.asserted_obligation_ids).toContain(
      "validate_matrix_row_ids_are_stable_and_baseline_row_refs_close",
    );
  });

  it("FRESHNESS: the checked-in obligation-coverage-recorded.yaml equals the 3 harvested (validator_id, obligation_id) pairs", async () => {
    const baselineOut = runBaseline();
    const matrixBaselineOut = validateActionabilityMatrix({
      actionabilityMatrix: minimalMatrix(),
      maturationBaseline: minimalBaseline(),
      maturationBaselineValidation: baselineValidationInput(),
    });
    const matrixCurrentOut = validateActionabilityMatrix({
      actionabilityMatrix: minimalMatrix(),
      maturationBaseline: minimalBaseline(),
      maturationBaselineValidation: baselineValidationInput(),
      maturationAnswerClaims: {
        schema_version: "1",
        session_id: "session-harvest",
        created_at: now,
        answer_claims: [],
      } as ReconstructMaturationAnswerClaimsArtifact,
      maturationAnswerClaimsValidation: {
        validation_status: "invalid",
      } as ReconstructMaturationAnswerClaimsValidationArtifact,
    });

    const harvested = [
      // The baseline fn does not stamp a validator_id field; attribute it by name.
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
    expect(harvestedSet.size).toBe(3);
  });
});
