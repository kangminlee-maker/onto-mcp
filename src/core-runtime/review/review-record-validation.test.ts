import { describe, expect, it } from "vitest";
import { validateReviewRecordObject } from "./review-record-validation.js";

function validRecord(): Record<string, unknown> {
  return {
    review_record_id: "session-001",
    session_id: "session-001",
    entrypoint: "review",
    record_status: "completed",
    created_at: "2026-05-26T17:00:00+09:00",
    updated_at: "2026-05-26T17:01:00+09:00",
    request_text: "review target",
    review_target_scope_ref: "binding.yaml",
    interpretation_ref: "interpretation.yaml",
    binding_ref: "binding.yaml",
    domain_final_selection_ref: "binding.yaml",
    resolved_review_mode: "core-axis",
    resolved_execution_realization: "direct-call",
    resolved_host_runtime: "standalone",
    resolved_artifact_generation_realization: "live",
    semantic_quality_evidence: {
      status: "not_evaluated",
      applicability: "real_semantic_path_only",
      reason:
        "live semantic path output requires a separate semantic quality gate before quality is claimed",
    },
    resolved_lens_ids: ["logic"],
    execution_result_ref: "execution-result.yaml",
    session_metadata_ref: "session-metadata.yaml",
    target_snapshot_ref: "execution-preparation/target-snapshot.md",
    materialized_input_ref: "execution-preparation/materialized-input.md",
    review_target_profile_ref: "execution-preparation/review-target-profile.yaml",
    context_candidate_assembly_ref: "execution-preparation/context-candidate-assembly.yaml",
    lens_result_refs: {
      logic: "round1/logic.md",
    },
    lens_output_schema_version: 2,
    participating_lens_ids: ["logic"],
    excluded_lens_ids: [],
    degraded_lens_ids: [],
    degradation_notes_ref: null,
    per_lens_provenance: {
      logic: {
        domain_constraints_used: [],
        domain_context_assumptions: [],
      },
    },
    finding_ledger_ref: "finding-ledger.yaml",
    finding_relation_graph_ref: "finding-relation-graph.yaml",
    issue_ledger_ref: "issue-ledger.yaml",
    issue_stance_matrix_ref: "issue-stance-matrix.yaml",
    deliberation_plan_ref: "deliberation-plan.yaml",
    problem_framing_ref: "problem-framing.yaml",
    issue_resolution_summary: [],
    result_classification_summary: {
      highest_severity: "low",
      finding_count: 1,
      issue_count: 1,
      finding_severity_counts: {
        blocker: 0,
        high: 0,
        medium: 0,
        low: 1,
        info: 0,
      },
      issue_severity_counts: {
        blocker: 0,
        high: 0,
        medium: 0,
        low: 1,
        info: 0,
      },
      severity_counts: {
        blocker: 0,
        high: 0,
        medium: 0,
        low: 1,
        info: 0,
      },
      material_issue_count: 0,
      non_material_finding_count: 1,
      material_issues: [],
      non_material_findings: [
        {
          issue_id: "issue-001",
          severity: "low",
          material: false,
          affected_purpose: "declared purpose",
          failure_condition: "specific condition",
          impact: "not unsafe",
          evidence_refs: ["round1/logic.md#finding-1"],
          source_lens_ids: ["logic"],
          action_candidates: ["follow_up"],
          rationale: "watch later",
        },
      ],
      action_candidates: [
        {
          issue_id: "issue-001",
          candidates: ["follow_up"],
          derivation_refs: ["issue-ledger.yaml", "problem-framing.yaml"],
          rationale: "watch later",
        },
      ],
    },
    synthesis_result_ref: "synthesis-ledger.yaml",
    synthesis_result_sha256: "1123456789abcdef",
    synthesis_output_sha256: "2123456789abcdef",
    deliberation_status: "performed",
    deliberation_result_ref: "deliberation-resolution.yaml",
    deliberation_result_sha256: "3123456789abcdef",
    final_output_ref: "final-output.md",
    final_output_sha256: "0123456789abcdef",
    shared_phenomenon_summary: [],
  };
}

describe("validateReviewRecordObject", () => {
  it("accepts the active ReviewRecord shape", () => {
    expect(validateReviewRecordObject(validRecord()).session_id).toBe("session-001");
  });

  it("requires participating lens refs", () => {
    const record = validRecord();
    record.lens_result_refs = {};
    expect(() => validateReviewRecordObject(record)).toThrow(
      /lens_result_refs missing participating lens: logic/,
    );
  });

  it("requires completed records to preserve synthesis and deliberation refs", () => {
    const record = validRecord();
    record.deliberation_result_ref = null;
    expect(() => validateReviewRecordObject(record)).toThrow(
      /deliberation_result_ref for completed records/,
    );
  });

  it("requires completed_with_degradation records to preserve synthesis and deliberation refs", () => {
    const record = validRecord();
    record.record_status = "completed_with_degradation";
    record.synthesis_result_ref = null;
    record.synthesis_result_sha256 = null;
    record.synthesis_output_sha256 = null;
    record.deliberation_result_ref = null;
    record.deliberation_result_sha256 = null;
    record.deliberation_status = "not_performed";
    expect(() => validateReviewRecordObject(record)).toThrow(
      /synthesis_result_ref for completed records/,
    );
  });

  it("requires completed records to preserve terminal artifact digests", () => {
    for (const [fieldName, expectedMessage] of [
      ["synthesis_result_sha256", /synthesis_result_sha256 for completed records/],
      ["synthesis_output_sha256", /synthesis_output_sha256 for completed records/],
      [
        "deliberation_result_sha256",
        /deliberation_result_sha256 for completed records/,
      ],
      ["final_output_sha256", /ReviewRecord\.final_output_sha256 must be a non-empty string/],
    ] as const) {
      const record = validRecord();
      record[fieldName] = null;
      expect(() => validateReviewRecordObject(record)).toThrow(expectedMessage);
    }
  });

  it("accepts halted_partial records with absent terminal refs and digests kept null", () => {
    const record = validRecord();
    record.record_status = "halted_partial";
    record.result_classification_summary = null;
    record.synthesis_result_ref = null;
    record.synthesis_result_sha256 = null;
    record.synthesis_output_sha256 = null;
    record.deliberation_status = "not_performed";
    record.deliberation_result_ref = null;
    record.deliberation_result_sha256 = null;

    expect(validateReviewRecordObject(record).record_status).toBe("halted_partial");
  });

  it("rejects halted_partial not_performed records with non-null terminal refs or digests", () => {
    for (const [fieldName, expectedMessage] of [
      [
        "synthesis_result_ref",
        /synthesis_result_ref must be null when deliberation_status=not_performed/,
      ],
      [
        "synthesis_result_sha256",
        /synthesis_result_sha256 must be null when deliberation_status=not_performed/,
      ],
      [
        "synthesis_output_sha256",
        /synthesis_output_sha256 must be null when deliberation_status=not_performed/,
      ],
      [
        "deliberation_result_ref",
        /deliberation_result_ref must be null when deliberation_status=not_performed/,
      ],
      [
        "deliberation_result_sha256",
        /deliberation_result_sha256 must be null when deliberation_status=not_performed/,
      ],
    ] as const) {
      const record = validRecord();
      record.record_status = "halted_partial";
      record.result_classification_summary = null;
      record.synthesis_result_ref = null;
      record.synthesis_result_sha256 = null;
      record.synthesis_output_sha256 = null;
      record.deliberation_status = "not_performed";
      record.deliberation_result_ref = null;
      record.deliberation_result_sha256 = null;
      record[fieldName] = fieldName.endsWith("_sha256")
        ? "deadbeef"
        : `${fieldName}.yaml`;

      expect(() => validateReviewRecordObject(record)).toThrow(expectedMessage);
    }
  });

  it("rejects materiality that contradicts problem-framing admission", () => {
    const record = validRecord();
    const summary = record.result_classification_summary as Record<string, unknown>;
    summary.non_material_findings = [
      {
        issue_id: "issue-001",
        severity: "high",
        material: false,
        affected_purpose: "declared purpose",
        failure_condition: "specific condition",
        impact: "unsafe",
        evidence_refs: ["round1/logic.md#finding-1"],
        source_lens_ids: ["logic"],
        action_candidates: ["fix_before_release"],
        rationale: "fix before release",
      },
    ];
    expect(() => validateReviewRecordObject(record)).toThrow(
      /material must match problem-framing material admission/,
    );
  });

  it("accepts non-material high severity projections when problem framing says evidence is insufficient", () => {
    const record = validRecord();
    const summary = record.result_classification_summary as Record<string, unknown>;
    summary.non_material_findings = [
      {
        issue_id: "issue-001",
        severity: "high",
        material: false,
        affected_purpose: "declared purpose",
        failure_condition: "specific condition",
        impact: "unsafe if intent is confirmed",
        evidence_refs: ["round1/logic.md#finding-1"],
        source_lens_ids: ["logic"],
        action_candidates: ["needs_evidence"],
        rationale: "evidence is required before material admission",
        issue_role: "evidence_gap",
        judgment_state: "insufficient_evidence",
        closure_class: "needs_evidence",
      },
    ];

    expect(validateReviewRecordObject(record).session_id).toBe("session-001");
  });
});
