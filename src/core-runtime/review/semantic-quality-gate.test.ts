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

function passingIssueArtifacts() {
  return {
    findingLedger: {
      findings: [
        {
          finding_id: "finding-001",
          severity: "medium",
          materiality_basis: {
            affected_purpose: "declared formatter contract",
            failure_condition: "top-level undefined input",
            impact: "caller receives undefined despite string contract",
            evidence_refs: ["src/target.ts:1"],
          },
          causal_path: {
            root_cause_candidate: "JSON.stringify can return undefined",
            root_cause_step_id: "finding-001.cause-002",
            steps: [
              {
                cause_id: "finding-001.cause-001",
                claim: "unstableFormat delegates directly to JSON.stringify",
                relation_to_previous: null,
                evidence_refs: ["src/target.ts:1"],
              },
              {
                cause_id: "finding-001.cause-002",
                claim: "JSON.stringify(undefined) returns undefined",
                relation_to_previous: "causes",
                evidence_refs: ["src/target.ts:1"],
              },
            ],
          },
        },
        {
          finding_id: "finding-002",
          severity: "low",
          claim:
            "ReviewPipelineInput.lensId and orphan export status remain an evidence gap without caller or public API evidence.",
          materiality_basis: null,
          causal_path: null,
        },
        {
          finding_id: "finding-003",
          severity: "medium",
          materiality_basis: {
            affected_purpose: "declared formatter contract",
            failure_condition: "alternate formatter path also returns undefined",
            impact: "caller receives undefined through a second path",
            evidence_refs: ["src/target.ts:8"],
          },
          causal_path: {
            root_cause_candidate: "alternate formatter also trusts JSON.stringify",
            root_cause_step_id: "finding-003.cause-001",
            steps: [
              {
                cause_id: "finding-003.cause-001",
                claim: "The alternate path shares JSON.stringify undefined behavior.",
                relation_to_previous: null,
                evidence_refs: ["src/target.ts:8"],
              },
            ],
          },
        },
      ],
    },
    relationGraph: {
      relations: [
        {
          relation_id: "rel-001",
          from_finding_id: "finding-001",
          to_finding_id: "finding-003",
          relation: "shared_cause_candidate",
          shared_cause: {
            cause_claim: "Both formatter issues depend on JSON.stringify undefined behavior.",
            from_cause_ref: "finding-001.cause-002",
            to_cause_ref: "finding-003.cause-001",
          },
        },
      ],
      singleton_findings: [],
    },
    issueLedger: {
      issues: [
        {
          issue_id: "issue-001",
          surface_finding_ids: ["finding-001"],
          relation_refs: [],
        },
        {
          issue_id: "issue-002",
          surface_finding_ids: ["finding-003"],
          relation_refs: [],
        },
      ],
      issue_dependencies: [
        {
          dependency_id: "dep-001",
          dependency_kind: "shared_cause_candidate",
          issue_ids: ["issue-001", "issue-002"],
          relation_refs: ["rel-001"],
          rationale: "The issues are distinct but share a cause.",
        },
      ],
    },
  };
}

function retryPolicyReviewRecord() {
  return {
    result_classification_summary: {
      material_issue_count: 2,
      non_material_finding_count: 1,
      material_issues: [
        {
          issue_id: "issue-retry-001",
          problem_definition:
            "retryRequest treats maxRetries zero as the default retry count because falsy defaulting is used.",
          failure_condition:
            "src/retry.ts retries when a caller explicitly sets maxRetries zero to disable retry.",
          evidence_refs: ["round1/logic.md:21"],
          source_lens_ids: ["logic"],
          action_candidates: ["preserve_zero_retry_budget"],
        },
        {
          issue_id: "issue-retry-002",
          problem_definition:
            "retry budget projection repeats the same maxRetries zero falsy defaulting path.",
          failure_condition:
            "src/retry.ts can report a retry budget even when the caller chose zero.",
          evidence_refs: ["round1/structure.md:12"],
          source_lens_ids: ["structure"],
          action_candidates: ["align_retry_budget_projection"],
        },
      ],
      non_material_findings: [
        {
          issue_id: "issue-retry-003",
          problem_definition:
            "The telemetry label and debug export are evidence gaps without caller or public API evidence.",
          material: false,
        },
      ],
      action_candidates: [
        {
          issue_id: "issue-retry-001",
          candidates: ["preserve_zero_retry_budget"],
        },
        {
          issue_id: "issue-retry-002",
          candidates: ["align_retry_budget_projection"],
        },
      ],
    },
  };
}

const RETRY_POLICY_FINAL_OUTPUT = [
  "### Final Review Result",
  "retryRequest loses an explicit maxRetries zero because falsy defaulting turns it into the default retry path.",
  "The retry budget projection repeats the same maxRetries zero falsy behavior.",
  "",
  "### Boundary Notes",
  "- The bounded review cannot decide whether the telemetry label or debug export are defects without caller or public API evidence.",
  "",
  "### Immediate Actions Required",
  "- Preserve maxRetries zero with a nullish ?? fallback or explicit guard, then add a focused test and verify retryRequest and the budget projection together.",
].join("\n");

function retryPolicyIssueArtifacts() {
  return {
    findingLedger: {
      findings: [
        {
          finding_id: "finding-retry-001",
          severity: "high",
          materiality_basis: {
            affected_purpose: "explicit retry disable contract",
            failure_condition: "caller passes maxRetries zero",
            impact: "retryRequest performs retries when the caller requested zero",
            evidence_refs: ["src/retry.ts:4"],
          },
          causal_path: {
            root_cause_candidate: "falsy defaulting treats zero as absent",
            root_cause_step_id: "finding-retry-001.cause-002",
            steps: [
              {
                cause_id: "finding-retry-001.cause-001",
                claim: "retryRequest reads maxRetries from caller options.",
                relation_to_previous: null,
                evidence_refs: ["src/retry.ts:4"],
              },
              {
                cause_id: "finding-retry-001.cause-002",
                claim: "The fallback uses falsy defaulting, so zero is replaced.",
                relation_to_previous: "causes",
                evidence_refs: ["src/retry.ts:4"],
              },
            ],
          },
        },
        {
          finding_id: "finding-retry-002",
          severity: "info",
          claim:
            "The telemetry label and debug export remain an evidence gap without caller or public API evidence.",
          materiality_basis: null,
          causal_path: null,
        },
        {
          finding_id: "finding-retry-003",
          severity: "medium",
          materiality_basis: {
            affected_purpose: "retry budget observability",
            failure_condition: "caller passes maxRetries zero",
            impact: "budget projection reports retries despite zero retry intent",
            evidence_refs: ["src/retry.ts:11"],
          },
          causal_path: {
            root_cause_candidate: "budget projection repeats falsy defaulting",
            root_cause_step_id: "finding-retry-003.cause-001",
            steps: [
              {
                cause_id: "finding-retry-003.cause-001",
                claim:
                  "The retry budget projection shares maxRetries zero falsy behavior.",
                relation_to_previous: null,
                evidence_refs: ["src/retry.ts:11"],
              },
            ],
          },
        },
      ],
    },
    relationGraph: {
      relations: [
        {
          relation_id: "rel-retry-001",
          from_finding_id: "finding-retry-001",
          to_finding_id: "finding-retry-003",
          relation: "shared_cause_candidate",
          shared_cause: {
            cause_claim:
              "Both retry issues depend on maxRetries zero being treated as absent.",
            from_cause_ref: "finding-retry-001.cause-002",
            to_cause_ref: "finding-retry-003.cause-001",
          },
        },
      ],
      singleton_findings: [],
    },
    issueLedger: {
      issues: [
        {
          issue_id: "issue-retry-001",
          surface_finding_ids: ["finding-retry-001"],
          relation_refs: [],
        },
        {
          issue_id: "issue-retry-002",
          surface_finding_ids: ["finding-retry-003"],
          relation_refs: [],
        },
      ],
      issue_dependencies: [
        {
          dependency_id: "dep-retry-001",
          dependency_kind: "shared_cause_candidate",
          issue_ids: ["issue-retry-001", "issue-retry-002"],
          relation_refs: ["rel-retry-001"],
          rationale: "The issues are distinct but share falsy defaulting.",
        },
      ],
    },
  };
}

describe("evaluateReviewPipelineSemanticQualityGate", () => {
  it("passes when the benchmark target truth and boundary uncertainty are preserved", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
    });

    expect(result.status).toBe("passed");
    expect(result.scope).toBe("fixture_specific");
    expect(result.fixture_target_anchor).toBe("src/target.ts");
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

  it("fails when boundary uncertainty is admitted as material despite an evidence gap", () => {
    const record = passingReviewRecord();
    record.result_classification_summary.material_issues[0]!.problem_definition =
      "lensId is a material defect despite an evidence gap, and unstableFormat returns JSON.stringify undefined.";

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

  it("allows boundary-sensitive terms to be material when admitted with concrete evidence", () => {
    const record = passingReviewRecord();
    record.result_classification_summary.material_issues[0]!.problem_definition =
      "ReviewPipelineInput.lensId omission is evidence-backed, and unstableFormat returns JSON.stringify undefined.";

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: record,
      finalOutputText: PASSING_FINAL_OUTPUT,
    });

    expect(result.status).toBe("passed");
    expect(
      result.checks.find((check) => check.check_id === "false_materiality_guard")
        ?.status,
    ).toBe("passed");
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

  it("passes artifact-backed causal and dependency preservation checks", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: passingIssueArtifacts(),
    });

    expect(result.status).toBe("passed");
    expect(
      result.checks
        .filter((check) =>
          [
            "causal_materiality_shape",
            "artifact_material_issue_recall",
            "non_material_finding_preservation",
            "causal_relation_correctness",
            "issue_dependency_preservation",
          ].includes(check.check_id),
        )
        .map((check) => check.status),
    ).toEqual(["passed", "passed", "passed", "passed", "passed"]);
  });

  it("passes a second fixture with material recall, dependencies, actionability, grounding, and non-material preservation", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      fixtureId: "retry-policy-target-v1",
      reviewRecord: retryPolicyReviewRecord(),
      finalOutputText: RETRY_POLICY_FINAL_OUTPUT,
      issueArtifacts: retryPolicyIssueArtifacts(),
    });

    expect(result.status).toBe("passed");
    expect(result.fixture_id).toBe("retry-policy-target-v1");
    expect(
      result.checks
        .filter((check) =>
          [
            "material_issue_recall",
            "false_materiality_guard",
            "causal_materiality_shape",
            "artifact_material_issue_recall",
            "non_material_finding_preservation",
            "causal_relation_correctness",
            "issue_dependency_preservation",
            "actionability",
            "grounding",
          ].includes(check.check_id),
        )
        .map((check) => check.status),
    ).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
  });

  it("fails the second fixture when its boundary evidence gap is promoted as material", () => {
    const record = retryPolicyReviewRecord();
    record.result_classification_summary.material_issues[0]!.problem_definition =
      "The telemetry label is material despite an evidence gap, and retryRequest maxRetries zero fails because falsy defaulting is used.";

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      fixtureId: "retry-policy-target-v1",
      reviewRecord: record,
      finalOutputText: RETRY_POLICY_FINAL_OUTPUT,
      issueArtifacts: retryPolicyIssueArtifacts(),
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find((check) => check.check_id === "false_materiality_guard")
        ?.status,
    ).toBe("failed");
  });

  it("fails when non-material findings are pulled into relation coverage", () => {
    const artifacts = passingIssueArtifacts();
    artifacts.relationGraph.singleton_findings = [
      {
        finding_id: "finding-002",
      },
    ];

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.check_id === "non_material_finding_preservation",
      )?.status,
    ).toBe("failed");
  });

  it("does not treat material finding uncertainty as non-material preservation failure", () => {
    const record = passingReviewRecord();
    record.result_classification_summary.non_material_finding_count = 0;
    record.result_classification_summary.non_material_findings = [];
    const artifacts = passingIssueArtifacts();
    artifacts.findingLedger.findings[1] = {
      finding_id: "finding-002",
      severity: "medium",
      claim:
        "ReviewPipelineInput.lensId is material, while exact public API evidence remains unresolved.",
      materiality_basis: {
        affected_purpose: "review coverage verification",
        failure_condition: "lens identity is not observable in the summary",
        impact: "coverage can be substituted without changing the unit count",
        evidence_refs: ["src/target.ts:2"],
      },
      causal_path: {
        root_cause_candidate: "lensId is dropped by the summary projection",
        root_cause_step_id: "finding-002.cause-001",
        steps: [
          {
            cause_id: "finding-002.cause-001",
            claim: "The summary projection omits lensId.",
            relation_to_previous: null,
            evidence_refs: ["src/target.ts:2"],
          },
        ],
      },
    };
    artifacts.relationGraph.singleton_findings = [
      {
        finding_id: "finding-002",
      },
    ];

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: record,
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(
      result.checks.find(
        (check) => check.check_id === "non_material_finding_preservation",
      )?.status,
    ).toBe("passed");
  });

  it("fails when shared-cause relations are not preserved as issue dependencies", () => {
    const artifacts = passingIssueArtifacts();
    artifacts.issueLedger.issue_dependencies = [];

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.check_id === "issue_dependency_preservation",
      )?.status,
    ).toBe("failed");
  });

  it("accepts non-material projection preservation when problem framing demotes a material-severity candidate", () => {
    const artifacts = passingIssueArtifacts();
    artifacts.findingLedger.findings = artifacts.findingLedger.findings.filter(
      (finding) => finding.finding_id !== "finding-002",
    );

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(
      result.checks.find(
        (check) => check.check_id === "non_material_finding_preservation",
      )?.status,
    ).toBe("passed");
  });

  it("fails when shared-cause dependency rows do not match relation endpoints", () => {
    const artifacts = passingIssueArtifacts();
    artifacts.issueLedger.issue_dependencies = [
      {
        dependency_id: "dep-001",
        dependency_kind: "wrong_kind",
        issue_ids: ["issue-001", "missing-issue"],
        relation_refs: ["rel-001"],
        rationale: "Broken dependency row.",
      },
    ];

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.check_id === "issue_dependency_preservation",
      )?.status,
    ).toBe("failed");
  });

  it("fails when shared-cause refs do not exist in material causal paths", () => {
    const artifacts = passingIssueArtifacts();
    artifacts.relationGraph.relations[0]!.shared_cause.from_cause_ref =
      "finding-001.cause-missing";

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.check_id === "causal_relation_correctness",
      )?.status,
    ).toBe("failed");
  });

  it("fails when shared-cause refs belong to the wrong endpoint finding", () => {
    const artifacts = passingIssueArtifacts();
    artifacts.relationGraph.relations[0]!.shared_cause.to_cause_ref =
      "finding-001.cause-002";

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.check_id === "causal_relation_correctness",
      )?.status,
    ).toBe("failed");
  });

  it("fails when material finding causal fields are empty objects", () => {
    const artifacts = passingIssueArtifacts();
    artifacts.findingLedger.findings[0]!.materiality_basis = {};
    artifacts.findingLedger.findings[0]!.causal_path = {};

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find((check) => check.check_id === "causal_materiality_shape")
        ?.status,
    ).toBe("failed");
  });

  it("fails when artifact truth loses the material finding", () => {
    const artifacts = passingIssueArtifacts();
    artifacts.findingLedger.findings = artifacts.findingLedger.findings.filter(
      (finding) => finding.severity !== "medium",
    );

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.check_id === "artifact_material_issue_recall",
      )?.status,
    ).toBe("failed");
  });
});
