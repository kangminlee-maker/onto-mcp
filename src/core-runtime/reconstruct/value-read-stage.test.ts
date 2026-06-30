import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  runMaturationValueReadStage,
  type ReconstructDirectiveAuthor,
  type ReconstructValueReadStageInput,
  type ReconstructValueReadStageOutput,
} from "./run.js";
import {
  buildActionabilityMatrixArtifact,
  buildMaturationContinuationDecisionArtifact,
} from "./maturation-validation.js";
import {
  buildSourceSafetyLedgerFromSourceObservations,
  validateSourceSafetyLedger,
} from "./source-safety-validation.js";
import type {
  ReconstructMaturationBaselineArtifact,
  ReconstructMaturationBaselineValidationArtifact,
  ReconstructMaturationValueDischargeArtifact,
  ReconstructMaturationValueDischargeValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationClosureFrontierValidationArtifact,
  ReconstructMaturationAuthorityResponseArtifact,
  ReconstructMaturationConvergenceLedgerValidationArtifact,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructOntologyExpansionValidationArtifact,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalValidationArtifact,
} from "./artifact-types.js";

// Maturation value-read cut (design §13) — mock-first H1 end-to-end on the REAL stage runner.
// A FIXTURE value-read executor (the mock author's readValueDischarge — the verification
// realization per the mock-realization boundary; the real raw-cell-read + LLM judgment is the
// deferred product path, §7) produces a discharge for a limitation-backed material row whose
// authorized runtime-target spreadsheet source can be read. The stage governance-validates it,
// the current matrix recompute consumes it → value_resolved, and the continuation routes
// blocked → actionable_limited (and consumes any unresolved revision-blockers, not dropping them).

const SESSION = "session-value-read";

// A maturation baseline with ONE limitation-backed material row whose value-dependent limitation
// (structure_inspected_only) a value-read could clear.
function baselineWithLimitedRow(): ReconstructMaturationBaselineArtifact {
  return {
    schema_version: "1",
    session_id: SESSION,
    created_at: "2026-06-30T00:00:00.000Z",
    source_seed_validation_ref: "ontology-seed-validation.yaml",
    source_reconstruct_record_ref: "reconstruct-record.yaml",
    source_reconstruct_record_sha256: "sha256-record",
    source_purpose_candidates_validation_ref: "source-purpose-candidates-validation.yaml",
    purpose_confirmation_validation_ref: "purpose-confirmation-validation.yaml",
    candidate_limitation_refs: [],
    baseline_rows: [{
      baseline_row_id: "row-1",
      purpose_element_ref: "element-1",
      actionability_surface_ref: "surface-1",
      maturity_dimension_ref: "dimension-1",
      materiality: "high",
      materiality_ref: "materiality-1",
      member_scope_refs: [],
      member_target_material_kind: "spreadsheet",
      member_source_refs: ["workbook.xlsx"],
      cross_material_ref_refs: [],
      competency_question_refs: [],
      competency_assessment_refs: [],
      domain_competency_trace_refs: [],
      maturity_level: "L2_modeled",
      supporting_seed_refs: [],
      supporting_evidence_refs: [],
      supporting_validation_refs: [],
      limitation_refs: ["structure_inspected_only"],
      blocking_reason: null,
    }],
  } as unknown as ReconstructMaturationBaselineArtifact;
}

// One authorized runtime-target spreadsheet observation. is_runtime_target_source=true (basis A)
// + a workbook_inventory so the deterministic trigger fires; the safety ledger grants the
// material_claim consumption_allowed row from the runtime-target provenance.
function runtimeTargetSpreadsheet(): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: SESSION,
    created_at: "2026-06-30T00:00:00.000Z",
    observations: [{
      observation_id: "obs-sheet",
      target_material_kind: "spreadsheet",
      adapter_id: "spreadsheet-structure-observer",
      source_ref: "workbook.xlsx",
      location: "workbook.xlsx",
      summary: "Runtime-target spreadsheet observation.",
      round_id: "initial_source_frontier",
      observation_batch_id: "source-observation-batch:initial",
      triggering_frontier_validation_ref: null,
      is_runtime_target_source: true,
      structural_data: {
        path: "workbook.xlsx",
        content_sha256: "b".repeat(64),
        workbook_inventory: {
          adapter_version: 4,
          sheets: [{ name: "Data", used_range: "A1:C20", columns: [{ index: 0 }, { index: 1 }] }],
          named_ranges: [{ name: "AmountRange", refers_to: "Data!C2:C20" }],
        },
      },
    }],
    skipped_refs: [],
    validation_results: ["valid"],
  } as unknown as ReconstructSourceObservationsArtifact;
}

function validBaselineValidation(): ReconstructMaturationBaselineValidationArtifact {
  return { validation_status: "valid" } as ReconstructMaturationBaselineValidationArtifact;
}

// FIXTURE value-read executor: echoes each candidate back as a SATISFIED discharge (the canned
// verification realization). The real direct-call executor reads raw cells + judges via the LLM.
function fixtureValueReadAuthor(): ReconstructDirectiveAuthor {
  return {
    authorId: "fixture-value-read-author",
    owner: "host_llm",
    async readValueDischarge(
      input: ReconstructValueReadStageInput,
    ): Promise<ReconstructValueReadStageOutput> {
      return {
        discharges: input.candidates.map((candidate, index) => ({
          discharge_id: `value-discharge-${index + 1}`,
          target_baseline_row_refs: [candidate.baseline_row_id],
          target_limitation_refs: candidate.limitation_refs,
          value_evidence_ref: {
            observation_id: candidate.observation_id,
            read_scope: candidate.allowed_locations[0] ??
              { sheet: null, column_index: null, row_start: null, row_end: null, location_ref: null },
            cells_read: 5,
            read_truncated: false,
          },
          value_evidence_authorization_ref: candidate.value_evidence_authorization_ref,
          satisfaction_status: "satisfied",
          rationale: "fixture value-read: cell values satisfy the structure-only limitation",
        })),
      };
    },
  } as unknown as ReconstructDirectiveAuthor;
}

// Author WITHOUT the capability — the stage must no-op (default-off).
function noCapabilityAuthor(): ReconstructDirectiveAuthor {
  return { authorId: "no-cap", owner: "host_llm" } as unknown as ReconstructDirectiveAuthor;
}

const tempSession = () => mkdtemp(path.join(tmpdir(), "value-read-stage-"));

function safetyFor(observations: ReconstructSourceObservationsArtifact) {
  const sourceSafetyLedger = buildSourceSafetyLedgerFromSourceObservations({
    sourceObservations: observations,
    sourceObservationsRef: "source-observations.yaml",
  });
  const sourceSafetyLedgerValidation = validateSourceSafetyLedger({
    sourceSafetyLedger,
    sourceSafetyLedgerRef: "source-safety-ledger.yaml",
    sourceObservations: observations,
    sourceObservationsRef: "source-observations.yaml",
  });
  return { sourceSafetyLedger, sourceSafetyLedgerValidation };
}

async function runStage(
  author: ReconstructDirectiveAuthor,
  observations: ReconstructSourceObservationsArtifact,
  baseline: ReconstructMaturationBaselineArtifact,
) {
  const sessionRoot = await tempSession();
  const baselineMatrix = buildActionabilityMatrixArtifact({
    sessionId: SESSION,
    maturationBaseline: baseline,
    maturationBaselineRef: "maturation-baseline.yaml",
    maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
  });
  const safety = safetyFor(observations);
  const result = await runMaturationValueReadStage({
    sessionId: SESSION,
    baselineMatrix,
    maturationBaseline: baseline,
    maturationBaselineValidation: validBaselineValidation(),
    maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    sourceObservations: observations,
    sourceObservationsRef: "source-observations.yaml",
    sourceSafetyLedger: safety.sourceSafetyLedger,
    sourceSafetyLedgerRef: "source-safety-ledger.yaml",
    sourceSafetyLedgerValidation: safety.sourceSafetyLedgerValidation,
    sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
    directiveAuthor: author,
    sessionRoot,
  });
  return { baselineMatrix, result, baseline };
}

describe("runMaturationValueReadStage (value-read cut §13 — mock-first H1 wiring)", () => {
  it("default-off: an author without readValueDischarge no-ops (null paths → skipped step)", async () => {
    const { result } = await runStage(
      noCapabilityAuthor(),
      runtimeTargetSpreadsheet(),
      baselineWithLimitedRow(),
    );
    expect(result.dischargePath).toBeNull();
    expect(result.dischargeValidationPath).toBeNull();
    expect(result.censusPath).toBeNull();
  });

  it("default-off: no candidate (no runtime-target spreadsheet source) no-ops", async () => {
    const codeOnly = runtimeTargetSpreadsheet();
    // strip the workbook inventory + runtime-target flag → not eligible
    (codeOnly.observations[0] as unknown as Record<string, unknown>).is_runtime_target_source = false;
    const { result } = await runStage(fixtureValueReadAuthor(), codeOnly, baselineWithLimitedRow());
    expect(result.dischargePath).toBeNull();
  });

  it("H1: fixture value-read → discharge produced, governance-valid, matrix value_resolved, continuation actionable_limited", async () => {
    const { baselineMatrix, result, baseline } = await runStage(
      fixtureValueReadAuthor(),
      runtimeTargetSpreadsheet(),
      baselineWithLimitedRow(),
    );
    // baseline matrix row is limitation_backed before the value-read
    expect(baselineMatrix.rows[0]!.member_readiness).toBe("limitation_backed");
    // the stage produced + governance-validated a discharge
    expect(result.dischargePath).not.toBeNull();
    expect(result.censusPath).not.toBeNull();
    const discharge = parseYaml(
      await readFile(result.dischargePath!, "utf8"),
    ) as ReconstructMaturationValueDischargeArtifact;
    const dischargeValidation = parseYaml(
      await readFile(result.dischargeValidationPath!, "utf8"),
    ) as ReconstructMaturationValueDischargeValidationArtifact;
    expect(dischargeValidation.validation_status).toBe("valid");
    expect(discharge.census.limitations_discharged).toBe(1);
    expect(discharge.census.ran_but_discharged_zero).toBe(false);

    // The CURRENT matrix recompute consumes the validated discharge → value_resolved.
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: SESSION,
      maturationBaseline: baseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationValueDischarge: discharge,
      maturationValueDischargeValidation: dischargeValidation,
    });
    expect(matrix.rows[0]!.member_readiness).toBe("value_resolved");
    expect(matrix.rows[0]!.limitation_refs).toEqual([]);

    // Continuation: value_resolved anchors a bounded actionable claim (no longer blocked).
    const decision = buildMaturationContinuationDecisionArtifact({
      sessionId: SESSION,
      actionabilityMatrix: matrix,
      actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
      maturationConvergenceLedgerValidation: {
        schema_version: "1",
        session_id: SESSION,
        created_at: "2026-06-30T00:00:00.000Z",
        validation_status: "valid",
        final_requestion_pass_status: "no_new_material_question",
        violations: [],
      } as unknown as ReconstructMaturationConvergenceLedgerValidationArtifact,
      maturationConvergenceLedgerValidationRef: "maturation-convergence-ledger-validation.yaml",
      maturationQuestionFrontier: { questions: [] } as unknown as ReconstructMaturationQuestionFrontierArtifact,
      maturationClosureFrontier: { authority_requests: [] } as unknown as ReconstructMaturationClosureFrontierArtifact,
      maturationClosureFrontierValidation: {} as unknown as ReconstructMaturationClosureFrontierValidationArtifact,
      maturationAuthorityResponse: { responses: [] } as unknown as ReconstructMaturationAuthorityResponseArtifact,
      ontologyExpansionValidation: { violations: [] } as unknown as ReconstructOntologyExpansionValidationArtifact,
      revisionProposal: {
        schema_version: "1",
        session_id: SESSION,
        created_at: "2026-06-30T00:00:00.000Z",
        failure_classification_ref: "failure-classification.yaml",
        proposals: [],
        directive_author: { owner: "host_llm", author_id: "mock" },
      } as unknown as ReconstructRevisionProposalArtifact,
      revisionProposalValidation: {
        schema_version: "1",
        session_id: SESSION,
        created_at: "2026-06-30T00:00:00.000Z",
        revision_proposal_ref: "revision-proposal.yaml",
        failure_classification_ref: "failure-classification.yaml",
        validation_status: "valid",
        proposal_count: 0,
        action_counts: { reuse: 0, extend: 0, rename: 0, split: 0, reject: 0, defer: 0 },
        validation_results: ["revision_proposal_valid"],
        violations: [],
      } as unknown as ReconstructRevisionProposalValidationArtifact,
    });
    expect(decision.decision_state).toBe("actionable_limited");
    expect(decision.claim_scope.included_row_refs).toEqual(["matrix-row-1"]);
  });
});
