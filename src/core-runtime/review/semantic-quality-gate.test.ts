import { describe, expect, it } from "vitest";
import { evaluateReviewPipelineSemanticQualityGate } from "./semantic-quality-gate.js";

function passingReviewRecord() {
  return {
    result_classification_summary: {
      material_issue_count: 1,
      non_material_finding_count: 1,
      material_issues: [
        {
          issue_id: "issue-001",
          problem_definition:
            "unstableFormat returns JSON.stringify(value) while declaring string.",
          failure_condition:
            "src/target.ts can return undefined when JSON.stringify receives top-level undefined.",
          evidence_refs: ["round1/logic.md:16"],
          source_lens_ids: ["logic"],
          action_candidates: ["fix_before_release"],
        },
      ],
      non_material_findings: [
        {
          issue_id: "issue-002",
          problem_definition:
            "ReviewPipelineInput.lensId and orphan export status are evidence gaps.",
          material: false,
        },
      ],
      action_candidates: [
        {
          issue_id: "issue-001",
          candidates: ["fix_before_release"],
        },
      ],
    },
  };
}

const PASSING_FINAL_OUTPUT = [
  "### Final Review Result",
  "unstableFormat should not return raw JSON.stringify output when undefined is possible.",
  "",
  "### Boundary Notes",
  "- The bounded review cannot decide whether lensId or orphan exported symbols are defects without caller or public API evidence.",
  "",
  "### Immediate Actions Required",
  "- Fix unstableFormat by adding a fallback or widening the return type, then add a focused test for top-level undefined.",
].join("\n");

describe("evaluateReviewPipelineSemanticQualityGate", () => {
  it("passes when the benchmark target truth and boundary uncertainty are preserved", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
    });

    expect(result.status).toBe("passed");
    expect(result.checks.map((check) => check.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
  });

  it("fails when Boundary Notes drop the non-material evidence gap", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: [
        "### Final Review Result",
        "unstableFormat should not return raw JSON.stringify output when undefined is possible.",
      ].join("\n"),
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.check_id === "boundary_uncertainty_preservation",
      )?.status,
    ).toBe("failed");
  });

  it("fails when lensId is promoted into a material issue", () => {
    const record = passingReviewRecord();
    record.result_classification_summary.material_issues[0]!.problem_definition =
      "lensId is a material defect and unstableFormat returns JSON.stringify undefined.";

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: record,
      finalOutputText: PASSING_FINAL_OUTPUT,
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find((check) => check.check_id === "false_materiality_guard")
        ?.status,
    ).toBe("failed");
  });

  it("fails when Final Review Result drops the material issue", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: [
        "### Final Review Result",
        "The review completed successfully.",
        "",
        "### Boundary Notes",
        "- The bounded review cannot decide whether lensId or orphan exported symbols are defects without caller or public API evidence.",
        "",
        "### Immediate Actions Required",
        "- Fix unstableFormat by adding a fallback return type guard and focused test.",
      ].join("\n"),
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.check_id === "final_result_material_issue_recall",
      )?.status,
    ).toBe("failed");
  });

  it("accepts Boundary Notes as the non-material evidence-gap preservation channel", () => {
    const record = passingReviewRecord();
    record.result_classification_summary.non_material_finding_count = 0;
    record.result_classification_summary.non_material_findings = [];

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: record,
      finalOutputText: PASSING_FINAL_OUTPUT,
    });

    expect(
      result.checks.find((check) => check.check_id === "false_materiality_guard")
        ?.status,
    ).toBe("passed");
  });

  it("fails generic boundary notes that do not preserve the target-specific uncertainty", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: [
        "### Final Review Result",
        "unstableFormat should not return raw JSON.stringify output when undefined is possible.",
        "",
        "### Boundary Notes",
        "- This bounded review did not inspect external context.",
        "",
        "### Immediate Actions Required",
        "- Fix unstableFormat by adding a fallback return type guard and focused test.",
      ].join("\n"),
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.check_id === "boundary_uncertainty_preservation",
      )?.status,
    ).toBe("failed");
  });

  it("fails when summary counts disagree with issue lists", () => {
    const record = passingReviewRecord();
    record.result_classification_summary.material_issue_count = 0;

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: record,
      finalOutputText: PASSING_FINAL_OUTPUT,
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find((check) => check.check_id === "count_list_consistency")
        ?.status,
    ).toBe("failed");
  });

  it("marks mock executor runs as not applicable", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "mock",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
    });

    expect(result.status).toBe("not_applicable");
    expect(result.checks).toEqual([]);
  });
});
