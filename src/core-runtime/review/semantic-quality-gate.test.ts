import { describe, expect, it } from "vitest";
import {
  evaluateReviewPipelineSemanticQualityGate,
  type SemanticQualityExpectations,
} from "./semantic-quality-gate.js";

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

function ontologyExpectations(): SemanticQualityExpectations {
  return {
    fixtureId: "sample-ontology-v1",
    materialTerms: ["scrap_rate", "복사"],
    expectedMaterialTruth: "scrap_rate 복사본 권위화 (외부 엑셀 원본과 드리프트)",
    boundaryUncertaintyTerms: [],
    boundaryContextTerms: [],
    actionMaterialTerms: ["scrap_rate"],
    actionRemediationTerms: ["authority", "single"],
    targetAnchor: "sample-ontology.yaml",
    targetAnchorTerms: ["sample-ontology.yaml"],
  };
}

function ontologyReviewRecord() {
  return {
    result_classification_summary: {
      material_issue_count: 1,
      non_material_finding_count: 0,
      material_issues: [
        {
          issue_id: "issue-001",
          problem_definition:
            "BomLine.scrap_rate는 외부 엑셀이 원본인 값을 복사해 두는 파생값 복사본 권위화다.",
          failure_condition:
            "sample-ontology.yaml의 scrap_rate 복사본이 원본 엑셀과 드리프트하면 소요량 계산이 틀어진다.",
          evidence_refs: ["sample-ontology.yaml:30"],
          source_lens_ids: ["semantics"],
          action_candidates: ["single_authority_for_scrap_rate"],
        },
      ],
      non_material_findings: [],
      action_candidates: [
        {
          issue_id: "issue-001",
          candidates: ["single_authority_for_scrap_rate"],
        },
      ],
    },
  };
}

const ONTOLOGY_FINAL_OUTPUT = [
  "### Final Review Result",
  "scrap_rate는 외부 엑셀 원본의 복사본을 권위화한 결함이다.",
  "",
  "### Boundary Notes",
  "- 본 리뷰는 온톨로지 문서 범위로 한정되며 운영 데이터 검증은 포함하지 않는다.",
  "",
  "### Immediate Actions Required",
  "- Designate a single authority for scrap_rate and derive the model value from it.",
].join("\n");

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

  it("preserves boundary uncertainty via the finding-ledger authority even when the final Boundary Notes omit it", () => {
    // Model-neutral: the decoy's uncertainty lives in the non-material findings
    // (authority). A model may keep it there for audit and prioritize the
    // material issue's own confidence boundaries in the final note — a
    // projection-style choice, not a quality miss. (This is the opus all-medium
    // case: lensId preserved in the ledger, final note focused on unstableFormat.)
    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: passingReviewRecord(),
      finalOutputText: [
        "### Final Review Result",
        "unstableFormat should not return raw JSON.stringify output when undefined is possible.",
      ].join("\n"),
    });

    expect(
      result.checks.find(
        (check) => check.check_id === "boundary_uncertainty_preservation",
      )?.status,
    ).toBe("passed");
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

  it("fails when boundary uncertainty appears only in the final notes but not in the finding-ledger authority", () => {
    // Negative control: the decoy is observed (surfaced in the final note) yet the
    // authority (non-material findings) does not preserve it. Authority is where
    // the boundary must live, so this fails even though the final note mentions it
    // — the check is not vacuous (a candidate IS observed) and is not satisfiable
    // by the projection alone.
    const record = passingReviewRecord();
    record.result_classification_summary.non_material_findings = [];
    record.result_classification_summary.non_material_finding_count = 0;

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: record,
      finalOutputText: [
        "### Final Review Result",
        "unstableFormat should not return raw JSON.stringify output when undefined is possible.",
        "",
        "### Boundary Notes",
        "- lensId is an evidence gap without caller or public API evidence.",
        "",
        "### Immediate Actions Required",
        "- Fix unstableFormat by adding a fallback return type guard and focused test.",
      ].join("\n"),
    });

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

  it("treats shared-cause endpoints co-located by same-root merge evidence as preserved", () => {
    const artifacts = passingIssueArtifacts();
    // finding-001 and finding-003 merge into one issue via same_root evidence;
    // their shared_cause relation can no longer be a cross-issue dependency.
    artifacts.relationGraph.relations.push({
      relation_id: "rel-002",
      from_finding_id: "finding-001",
      to_finding_id: "finding-003",
      relation: "same_root_candidate",
    } as (typeof artifacts.relationGraph.relations)[number]);
    artifacts.issueLedger.issues = [
      {
        issue_id: "issue-001",
        surface_finding_ids: ["finding-001", "finding-003"],
        relation_refs: ["rel-002"],
      },
    ];
    artifacts.issueLedger.issue_dependencies = [];
    const record = passingReviewRecord();
    record.result_classification_summary.material_issues = [
      record.result_classification_summary.material_issues[0]!,
    ];
    record.result_classification_summary.material_issue_count = 1;

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: record,
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(
      result.checks.find(
        (check) => check.check_id === "issue_dependency_preservation",
      )?.status,
    ).toBe("passed");
  });

  it("fails co-located shared-cause endpoints without cited same-root merge evidence", () => {
    const artifacts = passingIssueArtifacts();
    // Both endpoints land in one issue but no same_root_candidate relation is
    // cited — the exact shared-cause-only merge the contract forbids.
    artifacts.issueLedger.issues = [
      {
        issue_id: "issue-001",
        surface_finding_ids: ["finding-001", "finding-003"],
        relation_refs: [],
      },
    ];
    artifacts.issueLedger.issue_dependencies = [];
    const record = passingReviewRecord();
    record.result_classification_summary.material_issues = [
      record.result_classification_summary.material_issues[0]!,
    ];
    record.result_classification_summary.material_issue_count = 1;

    const result = evaluateReviewPipelineSemanticQualityGate({
      executorRealization: "codex",
      reviewRecord: record,
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });

    expect(
      result.checks.find(
        (check) => check.check_id === "issue_dependency_preservation",
      )?.status,
    ).toBe("failed");
  });

  it("accepts alternates groups in material terms (any alternate satisfies the entry)", () => {
    const expectations = ontologyExpectations();
    // 한국어 산문 토큰의 영어 출력 변형: 그룹의 한 대안만 맞으면 entry 충족
    expectations.materialTerms = [["폐기물", "copied"], "scrap_rate"];

    const result = evaluateReviewPipelineSemanticQualityGate({
      expectations,
      reviewRecord: ontologyReviewRecord(),
      finalOutputText: [
        "### Final Review Result",
        "scrap_rate is copied from an external spreadsheet authority.",
        "",
        "### Immediate Actions Required",
        "- Designate a single authority for scrap_rate.",
      ].join("\n"),
    });

    expect(
      result.checks.find((check) => check.check_id === "material_issue_recall")
        ?.status,
    ).toBe("failed"); // 레코드(한국어 '복사')에는 'copied'가 없음 — 그룹 전 대안 불일치는 실패

    const koreanAlternates = ontologyExpectations();
    koreanAlternates.materialTerms = [["복사", "copied"], "scrap_rate"];
    const passing = evaluateReviewPipelineSemanticQualityGate({
      expectations: koreanAlternates,
      reviewRecord: ontologyReviewRecord(),
      finalOutputText: ONTOLOGY_FINAL_OUTPUT,
    });
    expect(
      passing.checks.find((check) => check.check_id === "material_issue_recall")
        ?.status,
    ).toBe("passed");
  });

  it("rejects injected expectations with empty material terms", () => {
    const expectations = ontologyExpectations();
    expectations.materialTerms = [];

    expect(() =>
      evaluateReviewPipelineSemanticQualityGate({
        expectations,
        reviewRecord: ontologyReviewRecord(),
        finalOutputText: ONTOLOGY_FINAL_OUTPUT,
      }),
    ).toThrowError(/materialTerms must not be empty/);
  });

  it("rejects empty-string terms and empty alternates inside groups", () => {
    for (const terms of [
      ["", "scrap_rate"],
      [["", "currency"], "scrap_rate"],
      [[], "scrap_rate"],
      [["  "], "scrap_rate"],
    ] as Array<Array<string | string[]>>) {
      const expectations = ontologyExpectations();
      expectations.materialTerms = terms;
      expect(() =>
        evaluateReviewPipelineSemanticQualityGate({
          expectations,
          reviewRecord: ontologyReviewRecord(),
          finalOutputText: ONTOLOGY_FINAL_OUTPUT,
        }),
      ).toThrowError(/non-empty/);
    }
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

  it("evaluates injected non-code expectations instead of a built-in fixture preset", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      expectations: ontologyExpectations(),
      reviewRecord: ontologyReviewRecord(),
      finalOutputText: ONTOLOGY_FINAL_OUTPUT,
    });

    expect(result.status).toBe("passed");
    expect(result.fixture_id).toBe("sample-ontology-v1");
    expect(result.fixture_target_anchor).toBe("sample-ontology.yaml");
    expect(
      result.checks.find((check) => check.check_id === "grounding")?.evidence,
    ).toContain("material issue must preserve target anchor sample-ontology.yaml");
  });

  it("fails injected expectations when the expected material truth is missing", () => {
    const expectations = ontologyExpectations();
    expectations.materialTerms = [...expectations.materialTerms, "missing_concept"];

    const result = evaluateReviewPipelineSemanticQualityGate({
      expectations,
      reviewRecord: ontologyReviewRecord(),
      finalOutputText: ONTOLOGY_FINAL_OUTPUT,
    });

    expect(result.status).toBe("failed");
    expect(
      result.checks
        .filter((check) =>
          ["material_issue_recall", "final_result_material_issue_recall"].includes(
            check.check_id,
          ),
        )
        .map((check) => check.status),
    ).toEqual(["failed", "failed"]);
  });

  it("passes boundary checks vacuously when injected expectations declare no boundary decoy", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      expectations: ontologyExpectations(),
      reviewRecord: ontologyReviewRecord(),
      finalOutputText: [
        "### Final Review Result",
        "scrap_rate is copied from an external spreadsheet, so the copy drifts from its authority.",
        "",
        "### Immediate Actions Required",
        "- Make the spreadsheet the single authority for scrap_rate or move the value into the model.",
      ].join("\n"),
    });

    expect(
      result.checks
        .filter((check) =>
          ["false_materiality_guard", "boundary_uncertainty_preservation"].includes(
            check.check_id,
          ),
        )
        .map((check) => check.status),
    ).toEqual(["passed", "passed"]);
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

// ─────────────────────────────────────────────────────────────────────────────
// v3 fixture-MECE controls (design 20260712 §D3): clean-target (G1) and
// shared-root (G2). Injected expectations drive the new gate branches; the
// FIXTURES presets + real target blobs land in A-3.
// ─────────────────────────────────────────────────────────────────────────────

const CLEAN_TARGET_APPLICABLE_CHECK_IDS = [
  "count_list_consistency",
  "false_materiality_guard",
  "boundary_uncertainty_preservation",
  "non_material_finding_preservation",
  "causal_materiality_shape",
  "causal_relation_correctness",
  "issue_dependency_preservation",
] as const;

/** Clean-target (G1): zero material defects, one boundary decoy that MUST be
 * preserved as a non-material finding. materialTerms is empty (nothing to
 * recall). */
function cleanTargetExpectations(): SemanticQualityExpectations {
  return {
    fixtureId: "clean-target-v1",
    materialTerms: [],
    expectedMaterialTruth: "no material defect (clean target)",
    boundaryUncertaintyTerms: ["telemetry label", "debug export"],
    boundaryContextTerms: [
      "evidence gap",
      "needs evidence",
      "insufficient evidence",
      "without caller",
      "without public api",
    ],
    actionMaterialTerms: [],
    actionRemediationTerms: [],
    targetAnchor: "src/clean-target.ts",
    targetAnchorTerms: ["src/clean-target.ts", "clean-target.ts"],
    expectsNoMaterialDefects: true,
    requiresBoundaryPreservation: true,
  };
}

const CLEAN_DECOY_TEXT =
  "The telemetry label and debug export remain an evidence gap without caller or public API evidence.";

function cleanTargetSilentPreserveRecord() {
  return {
    result_classification_summary: {
      material_issue_count: 0,
      non_material_finding_count: 1,
      material_issues: [],
      non_material_findings: [
        { issue_id: "nm-001", problem_definition: CLEAN_DECOY_TEXT, material: false },
      ],
      action_candidates: [],
    },
  };
}

const CLEAN_TARGET_FINAL_OUTPUT = [
  "### Final Review Result",
  "No material defect found in src/clean-target.ts.",
  "",
  "### Boundary Notes",
  `- ${CLEAN_DECOY_TEXT}`,
].join("\n");

/** Decoy preserved as one non-material (low) finding; no relations/singletons
 * so it stays outside relation coverage. */
function cleanTargetArtifacts() {
  return {
    findingLedger: {
      findings: [
        {
          finding_id: "finding-nm-001",
          severity: "low",
          claim: CLEAN_DECOY_TEXT,
          materiality_basis: null,
          causal_path: null,
        },
      ],
    },
    relationGraph: { relations: [], singleton_findings: [] },
    issueLedger: { issues: [], issue_dependencies: [] },
  };
}

/** Shared-root (G2): mirrors review-pipeline-target-v1 terms and adds an anchor
 * pair, so passingReviewRecord/passingIssueArtifacts satisfy every base check
 * AND the shared-cause existence requirement. */
function sharedRootExpectations(): SemanticQualityExpectations {
  return {
    fixtureId: "shared-root-target-v1",
    materialTerms: ["unstableformat", "json.stringify", "undefined"],
    expectedMaterialTruth: "unstableFormat + JSON.stringify + undefined",
    boundaryUncertaintyTerms: ["lensid", "lens id", "lens ids", "lens identity"],
    boundaryContextTerms: [
      "evidence gap",
      "needs evidence",
      "insufficient evidence",
      "low-confidence",
      "unresolved",
      "without caller",
      "without public api",
      "caller evidence",
      "public api evidence",
    ],
    actionMaterialTerms: ["unstableformat", "json.stringify", "undefined"],
    actionRemediationTerms: [
      "return type",
      "fallback",
      "widen",
      "guard",
      "focused test",
      "verify",
    ],
    targetAnchor: "src/target.ts",
    targetAnchorTerms: ["src/target.ts", "target.ts"],
    expectedSharedCauseAnchorPairs: [[["unstableformat"], ["alternate"]]],
  };
}

describe("evaluateReviewPipelineSemanticQualityGate v3 controls", () => {
  it("clean-target: emits exactly the applicable set (recall/grounding/actionability excluded)", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      expectations: cleanTargetExpectations(),
      reviewRecord: cleanTargetSilentPreserveRecord(),
      finalOutputText: CLEAN_TARGET_FINAL_OUTPUT,
      issueArtifacts: cleanTargetArtifacts(),
    });
    expect(result.checks.map((check) => check.check_id).sort()).toEqual(
      [...CLEAN_TARGET_APPLICABLE_CHECK_IDS].sort(),
    );
  });

  it("clean-target 3-way: correct silence + preserved decoy PASSES", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      expectations: cleanTargetExpectations(),
      reviewRecord: cleanTargetSilentPreserveRecord(),
      finalOutputText: CLEAN_TARGET_FINAL_OUTPUT,
      issueArtifacts: cleanTargetArtifacts(),
    });
    expect(result.status).toBe("passed");
  });

  it("clean-target 3-way: yes-man (fabricated material issue) FAILS false_materiality_guard", () => {
    const record = cleanTargetSilentPreserveRecord();
    record.result_classification_summary.material_issue_count = 1;
    record.result_classification_summary.material_issues = [
      {
        issue_id: "fp-001",
        problem_definition:
          "clean-target.ts mishandles a value in formatValue and can misbehave.",
        failure_condition: "src/clean-target.ts returns a wrong value.",
        evidence_refs: ["round1/logic.md:3"],
        source_lens_ids: ["logic"],
        action_candidates: ["fix_before_release"],
      },
    ] as never;
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      expectations: cleanTargetExpectations(),
      reviewRecord: record,
      finalOutputText: CLEAN_TARGET_FINAL_OUTPUT,
      issueArtifacts: cleanTargetArtifacts(),
    });
    expect(result.status).toBe("failed");
    expect(
      result.checks.find((check) => check.check_id === "false_materiality_guard")
        ?.status,
    ).toBe("failed");
  });

  it("clean-target 3-way: lazy empty silence FAILS boundary_uncertainty_preservation", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      expectations: cleanTargetExpectations(),
      reviewRecord: {
        result_classification_summary: {
          material_issue_count: 0,
          non_material_finding_count: 0,
          material_issues: [],
          non_material_findings: [],
          action_candidates: [],
        },
      },
      finalOutputText: "### Final Review Result\nNo material defect found.",
      issueArtifacts: {
        findingLedger: { findings: [] },
        relationGraph: { relations: [], singleton_findings: [] },
        issueLedger: { issues: [], issue_dependencies: [] },
      },
    });
    expect(result.status).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.check_id === "boundary_uncertainty_preservation",
      )?.status,
    ).toBe("failed");
  });

  it("clean-target: accepts an empty materialTerms list without failing loud", () => {
    expect(() =>
      evaluateReviewPipelineSemanticQualityGate({
        executionRoute: "real",
        expectations: cleanTargetExpectations(),
        reviewRecord: cleanTargetSilentPreserveRecord(),
        finalOutputText: CLEAN_TARGET_FINAL_OUTPUT,
        issueArtifacts: cleanTargetArtifacts(),
      }),
    ).not.toThrow();
  });

  it("shared-root: passes when the declared anchor pair is connected by a valid shared-cause relation", () => {
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      expectations: sharedRootExpectations(),
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: passingIssueArtifacts(),
    });
    expect(result.status).toBe("passed");
    expect(
      result.checks.find(
        (check) => check.check_id === "causal_relation_correctness",
      )?.status,
    ).toBe("passed");
  });

  it("shared-root: fails when both defects surface but the shared-cause relation is missing", () => {
    const artifacts = passingIssueArtifacts();
    // Model found both defects but never linked them to their shared root:
    // they surface as independent singletons with no shared_cause relation.
    artifacts.relationGraph = {
      relations: [],
      singleton_findings: [
        { finding_id: "finding-001" },
        { finding_id: "finding-003" },
      ],
    } as never;
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      expectations: sharedRootExpectations(),
      reviewRecord: passingReviewRecord(),
      finalOutputText: PASSING_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });
    expect(
      result.checks.find(
        (check) => check.check_id === "causal_relation_correctness",
      )?.status,
    ).toBe("failed");
    expect(result.status).toBe("failed");
  });
});
