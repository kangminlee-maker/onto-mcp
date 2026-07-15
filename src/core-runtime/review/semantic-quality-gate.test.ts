import { describe, expect, it } from "vitest";
import {
  evaluateReviewPipelineSemanticQualityGate,
  SEMANTIC_QUALITY_GATE_CHECK_IDS,
  SEMANTIC_QUALITY_GATE_FIXTURE_IDS,
  semanticQualityFixturePreset,
  type SemanticQualityExpectations,
  type SemanticQualityGateFixtureId,
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
 * recall). A-3: resolves the REAL pinned FIXTURES preset — the injected copy can
 * no longer drift from what the gate evaluates for fixtureId "clean-target-v1". */
function cleanTargetExpectations(): SemanticQualityExpectations {
  return semanticQualityFixturePreset("clean-target-v1");
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

/** Shared-root (G2): resolves the REAL pinned FIXTURES preset (anchor
 * src/shared-root.ts, anchor pair unstableFormat↔alternate). A-3: the injected
 * copy can no longer drift from what the gate evaluates for fixtureId
 * "shared-root-target-v1". The dedicated artifacts below (anchored to the real
 * blob) satisfy every base check AND the shared-cause existence requirement. */
function sharedRootExpectations(): SemanticQualityExpectations {
  return semanticQualityFixturePreset("shared-root-target-v1");
}

/** Mirrors passingReviewRecord but anchored to the real shared-root blob
 * (src/shared-root.ts): one summary material issue over the shared rawFormat
 * root, one non-material lensId boundary decoy. */
function sharedRootReviewRecord() {
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
            "src/shared-root.ts can return undefined when JSON.stringify receives top-level undefined.",
          evidence_refs: ["round1/logic.md:16"],
          source_lens_ids: ["logic"],
          action_candidates: ["fix_before_release"],
        },
      ],
      non_material_findings: [
        {
          issue_id: "issue-002",
          problem_definition:
            "ShardChannelInput.lensId and orphan export status are evidence gaps.",
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

const SHARED_ROOT_FINAL_OUTPUT = [
  "### Final Review Result",
  "unstableFormat and alternateFormat share a rawFormat root that should not return raw JSON.stringify output when undefined is possible.",
  "",
  "### Boundary Notes",
  "- The bounded review cannot decide whether lensId or orphan exported symbols are defects without caller or public API evidence.",
  "",
  "### Immediate Actions Required",
  "- Fix unstableFormat and alternateFormat's shared rawFormat root by adding a fallback or widening the return type, then add a focused test for top-level undefined.",
].join("\n");

/** Mirrors passingIssueArtifacts but anchored to src/shared-root.ts. Two material
 * findings (finding-001 unstableFormat, finding-003 alternate) linked by a valid
 * shared_cause_candidate relation (finding-001↔finding-003), plus one
 * non-material lensId decoy (finding-002). Same finding/relation ids as
 * passingIssueArtifacts so the shared-root gate tests can mutate them by id. */
function sharedRootArtifacts() {
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
            evidence_refs: ["src/shared-root.ts:18"],
          },
          causal_path: {
            root_cause_candidate: "JSON.stringify can return undefined",
            root_cause_step_id: "finding-001.cause-002",
            steps: [
              {
                cause_id: "finding-001.cause-001",
                claim: "unstableFormat delegates directly to the rawFormat root (JSON.stringify).",
                relation_to_previous: null,
                evidence_refs: ["src/shared-root.ts:18"],
              },
              {
                cause_id: "finding-001.cause-002",
                claim: "JSON.stringify(undefined) returns undefined",
                relation_to_previous: "causes",
                evidence_refs: ["src/shared-root.ts:14"],
              },
            ],
          },
        },
        {
          finding_id: "finding-002",
          severity: "low",
          claim:
            "ShardChannelInput.lensId and orphan export status remain an evidence gap without caller or public API evidence.",
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
            evidence_refs: ["src/shared-root.ts:22"],
          },
          causal_path: {
            root_cause_candidate: "alternate formatter also trusts the rawFormat root",
            root_cause_step_id: "finding-003.cause-001",
            steps: [
              {
                cause_id: "finding-003.cause-001",
                claim: "The alternate path shares the same rawFormat / JSON.stringify undefined behavior.",
                relation_to_previous: null,
                evidence_refs: ["src/shared-root.ts:22"],
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
            cause_claim: "Both formatter issues depend on the rawFormat root's JSON.stringify undefined behavior.",
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
          rationale: "The issues are distinct but share the rawFormat root.",
        },
      ],
    },
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

  it("clean-target: the REGISTERED preset (resolved by fixtureId) passes and emits the applicable set", () => {
    // A-3: proves the pinned FIXTURES preset — not just an injected copy — is
    // wired into the gate and behaves identically when resolved by fixtureId (the
    // path the cert harness takes). The decoy artifacts describe the real blob's
    // telemetry label / debug export.
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      fixtureId: "clean-target-v1",
      reviewRecord: cleanTargetSilentPreserveRecord(),
      finalOutputText: CLEAN_TARGET_FINAL_OUTPUT,
      issueArtifacts: cleanTargetArtifacts(),
    });
    expect(result.status).toBe("passed");
    expect(result.checks.map((check) => check.check_id).sort()).toEqual(
      [...CLEAN_TARGET_APPLICABLE_CHECK_IDS].sort(),
    );
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
      reviewRecord: sharedRootReviewRecord(),
      finalOutputText: SHARED_ROOT_FINAL_OUTPUT,
      issueArtifacts: sharedRootArtifacts(),
    });
    expect(result.status).toBe("passed");
    expect(
      result.checks.find(
        (check) => check.check_id === "causal_relation_correctness",
      )?.status,
    ).toBe("passed");
  });

  it("shared-root: the REGISTERED preset (resolved by fixtureId) passes and emits the FULL universe", () => {
    // A-3: proves the pinned FIXTURES preset — not just an injected copy — is
    // wired into the gate and behaves identically when resolved by fixtureId (the
    // path the cert harness takes). Unlike clean-target, shared-root has real
    // material defects, so the full 12-check universe is emitted (no reduction).
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      fixtureId: "shared-root-target-v1",
      reviewRecord: sharedRootReviewRecord(),
      finalOutputText: SHARED_ROOT_FINAL_OUTPUT,
      issueArtifacts: sharedRootArtifacts(),
    });
    expect(result.status).toBe("passed");
    expect(result.checks.map((check) => check.check_id).sort()).toEqual(
      [...SEMANTIC_QUALITY_GATE_CHECK_IDS].sort(),
    );
    expect(result.fixture_target_anchor).toBe("src/shared-root.ts");
  });

  it("shared-root: fails when both defects surface but the shared-cause relation is missing", () => {
    const artifacts = sharedRootArtifacts();
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
      reviewRecord: sharedRootReviewRecord(),
      finalOutputText: SHARED_ROOT_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });
    expect(
      result.checks.find(
        (check) => check.check_id === "causal_relation_correctness",
      )?.status,
    ).toBe("failed");
    expect(result.status).toBe("failed");
  });

  // Adversarial cross-verification controls (2026-07-13): each closes a bypass
  // an independent multi-lens review surfaced that the happy-path tests missed.

  it("clean-target: a fabricated material finding injected ONLY into the finding-ledger (summary clean) FAILS the guard", () => {
    // F2: false_materiality_guard must catch promotion on BOTH surfaces, not
    // just the summary. The yes-man keeps summary.material_issues empty and
    // hides a well-shaped material finding (covered as a singleton to satisfy
    // relation coverage) in the finding-ledger authority.
    const artifacts = cleanTargetArtifacts();
    artifacts.findingLedger.findings.push({
      finding_id: "finding-fp",
      severity: "high",
      materiality_basis: {
        affected_purpose: "fabricated",
        failure_condition: "fabricated",
        impact: "fabricated",
        evidence_refs: ["src/clean-target.ts:1"],
      },
      causal_path: {
        root_cause_candidate: "fabricated",
        root_cause_step_id: "finding-fp.cause-001",
        steps: [
          {
            cause_id: "finding-fp.cause-001",
            claim: "fabricated",
            relation_to_previous: null,
            evidence_refs: ["src/clean-target.ts:1"],
          },
        ],
      },
    } as never);
    artifacts.relationGraph.singleton_findings.push({
      finding_id: "finding-fp",
    } as never);
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      expectations: cleanTargetExpectations(),
      reviewRecord: cleanTargetSilentPreserveRecord(),
      finalOutputText: CLEAN_TARGET_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });
    expect(
      result.checks.find((check) => check.check_id === "false_materiality_guard")
        ?.status,
    ).toBe("failed");
    expect(result.status).toBe("failed");
  });

  it("clean-target: expectsNoMaterialDefects without requiresBoundaryPreservation fails loud", () => {
    // F4: a clean-target that forgets the boundary control would let empty
    // silence pass vacuously — reject the misconfiguration at the gate.
    const misconfigured: SemanticQualityExpectations = {
      ...cleanTargetExpectations(),
      requiresBoundaryPreservation: false,
    };
    expect(() =>
      evaluateReviewPipelineSemanticQualityGate({
        executionRoute: "real",
        expectations: misconfigured,
        reviewRecord: cleanTargetSilentPreserveRecord(),
        finalOutputText: CLEAN_TARGET_FINAL_OUTPUT,
        issueArtifacts: cleanTargetArtifacts(),
      }),
    ).toThrow(/requiresBoundaryPreservation/);
  });

  it("shared-root: a self-relation on one finding matching both anchor groups does NOT satisfy the requirement", () => {
    // F3: G2 needs two DISTINCT surface defects. A single finding with a
    // self shared-cause relation (from === to) that matches both groups must not
    // count. Anchor pair here targets two terms both present in finding-001.
    const expectations: SemanticQualityExpectations = {
      ...sharedRootExpectations(),
      expectedSharedCauseAnchorPairs: [[["unstableformat"], ["json.stringify"]]],
    };
    const artifacts = sharedRootArtifacts();
    artifacts.relationGraph = {
      relations: [
        {
          relation_id: "rel-self",
          from_finding_id: "finding-001",
          to_finding_id: "finding-001",
          relation: "shared_cause_candidate",
          shared_cause: {
            cause_claim: "self loop",
            from_cause_ref: "finding-001.cause-001",
            to_cause_ref: "finding-001.cause-002",
          },
        },
      ],
      singleton_findings: [
        { finding_id: "finding-001" },
        { finding_id: "finding-003" },
      ],
    } as never;
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      expectations,
      reviewRecord: sharedRootReviewRecord(),
      finalOutputText: SHARED_ROOT_FINAL_OUTPUT,
      issueArtifacts: artifacts,
    });
    expect(
      result.checks.find(
        (check) => check.check_id === "causal_relation_correctness",
      )?.status,
    ).toBe("failed");
  });

  it("shared-root: a valid shared-cause relation between NON-anchor findings does NOT satisfy the requirement", () => {
    // F5: locks anchor SPECIFICITY. A valid shared_cause relation exists
    // (finding-001<->finding-003), but the declared anchor pair names terms no
    // finding matches — so the requirement must still fail. Guards against
    // regressing findingMatchesAnchorGroup to "any valid relation exists".
    const expectations: SemanticQualityExpectations = {
      ...sharedRootExpectations(),
      expectedSharedCauseAnchorPairs: [
        [["nonexistent-anchor-aaa"], ["nonexistent-anchor-bbb"]],
      ],
    };
    const result = evaluateReviewPipelineSemanticQualityGate({
      executionRoute: "real",
      expectations,
      reviewRecord: sharedRootReviewRecord(),
      finalOutputText: SHARED_ROOT_FINAL_OUTPUT,
      issueArtifacts: sharedRootArtifacts(),
    });
    expect(
      result.checks.find(
        (check) => check.check_id === "causal_relation_correctness",
      )?.status,
    ).toBe("failed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V2 scoring non-vacuity — completeness meta-test (design 20260712 §D5).
//
// A check that never FAILS anywhere in the corpus is unproven: it could be
// stuck-on-pass and the cert would not notice. This ledger forces, for every
// fixture × every check the gate actually emits for it, at least one passing AND
// one failing scenario.
//
// Coverage is per (fixture, check) — NOT per check globally — because fixture
// data switches real gate branches (clean-target's expectsNoMaterialDefects /
// requiresBoundaryPreservation; shared-root's expectedSharedCauseAnchorPairs), so
// a check proven discriminating on one fixture is NOT thereby proven on another.
// This is what makes clean-target's causal/dependency checks — which §D2 keeps in
// its emission "for regression detection" — provably live detectors rather than
// decoration.
//
// The applicable set is read from the gate's OWN emission for each fixture's
// healthy baseline, so this cannot drift from what the gate does.
// ─────────────────────────────────────────────────────────────────────────────

type CheckId = (typeof SEMANTIC_QUALITY_GATE_CHECK_IDS)[number];

const SCORED_FIXTURE_IDS = [
  "review-pipeline-target-v1",
  "retry-policy-target-v1",
  "clean-target-v1",
  "shared-root-target-v1",
] as const satisfies readonly SemanticQualityGateFixtureId[];

/** Permissive view of a scenario's gate args: the gate reads every field through
 * unknown-tolerant accessors, so the corpus mutates a deep clone through this
 * shape rather than each fixture's concrete builder type. */
interface ScenarioArgs {
  executionRoute: string;
  fixtureId: SemanticQualityGateFixtureId;
  reviewRecord: {
    result_classification_summary: {
      material_issue_count: number;
      non_material_finding_count: number;
      material_issues: Record<string, unknown>[];
      non_material_findings: Record<string, unknown>[];
      action_candidates: Record<string, unknown>[];
    };
  };
  finalOutputText: string;
  issueArtifacts: {
    findingLedger: { findings: Record<string, unknown>[] };
    relationGraph: {
      relations: Record<string, unknown>[];
      singleton_findings: Record<string, unknown>[];
    };
    issueLedger: {
      issues: Record<string, unknown>[];
      issue_dependencies: Record<string, unknown>[];
    };
  };
}

function healthyArgs(fixtureId: SemanticQualityGateFixtureId): ScenarioArgs {
  const base = { executionRoute: "real", fixtureId };
  const built =
    fixtureId === "retry-policy-target-v1"
      ? {
          ...base,
          reviewRecord: retryPolicyReviewRecord(),
          finalOutputText: RETRY_POLICY_FINAL_OUTPUT,
          issueArtifacts: retryPolicyIssueArtifacts(),
        }
      : fixtureId === "clean-target-v1"
        ? {
            ...base,
            reviewRecord: cleanTargetSilentPreserveRecord(),
            finalOutputText: CLEAN_TARGET_FINAL_OUTPUT,
            issueArtifacts: cleanTargetArtifacts(),
          }
        : fixtureId === "shared-root-target-v1"
          ? {
              ...base,
              reviewRecord: sharedRootReviewRecord(),
              finalOutputText: SHARED_ROOT_FINAL_OUTPUT,
              issueArtifacts: sharedRootArtifacts(),
            }
          : {
              ...base,
              reviewRecord: passingReviewRecord(),
              finalOutputText: PASSING_FINAL_OUTPUT,
              issueArtifacts: passingIssueArtifacts(),
            };
  return structuredClone(built) as unknown as ScenarioArgs;
}

function evaluateScenario(args: ScenarioArgs) {
  return evaluateReviewPipelineSemanticQualityGate(
    args as unknown as Parameters<
      typeof evaluateReviewPipelineSemanticQualityGate
    >[0],
  );
}

/** Replace a markdown section's body, keeping the heading and every other
 * section — so a mutation aimed at one section cannot silently break another. */
function replaceSection(markdown: string, heading: string, body: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of markdown.split("\n")) {
    if (/^#{2,4}\s+\S/.test(line)) {
      skipping = new RegExp(`^#{2,4}\\s+${heading}\\s*$`).test(line);
      out.push(line);
      if (skipping) out.push(body);
      continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

const MATERIAL_SEVERITIES = ["blocker", "high", "medium"];
const materialFindings = (args: ScenarioArgs): Record<string, unknown>[] =>
  args.issueArtifacts.findingLedger.findings.filter((finding) =>
    MATERIAL_SEVERITIES.includes(String(finding.severity)),
  );

/**
 * One targeted mutation per check: the smallest realistic model behaviour that
 * SHOULD make that check fail. Keyed by CheckId, so a new check in the universe
 * cannot be added without authoring its failing scenario (TS exhaustiveness).
 */
const FAILING_MUTATION: Record<CheckId, (args: ScenarioArgs) => void> = {
  count_list_consistency: (args) => {
    args.reviewRecord.result_classification_summary.material_issue_count += 1;
  },
  material_issue_recall: (args) => {
    // Model admits an issue but loses the target truth — the anchor stays, so
    // grounding is unaffected and this isolates recall.
    const anchor = semanticQualityFixturePreset(args.fixtureId).targetAnchor;
    for (const issue of args.reviewRecord.result_classification_summary
      .material_issues) {
      issue.problem_definition = "A concern was noted during review.";
      issue.failure_condition = `${anchor} may behave unexpectedly.`;
    }
  },
  final_result_material_issue_recall: (args) => {
    args.finalOutputText = replaceSection(
      args.finalOutputText,
      "Final Review Result",
      "Nothing notable was found.",
    );
  },
  false_materiality_guard: (args) => {
    // Yes-man: promotes the fixture's boundary decoy to a material issue.
    const preset = semanticQualityFixturePreset(args.fixtureId);
    args.reviewRecord.result_classification_summary.material_issues.push({
      issue_id: "issue-meta-fp",
      problem_definition: `${preset.boundaryUncertaintyTerms[0]} is an ${preset.boundaryContextTerms[0]} and must be fixed before release.`,
      failure_condition: `${preset.targetAnchor} exposes it.`,
      evidence_refs: ["round1/logic.md:1"],
      source_lens_ids: ["logic"],
      action_candidates: ["fix_before_release"],
    });
    args.reviewRecord.result_classification_summary.material_issue_count += 1;
  },
  boundary_uncertainty_preservation: (args) => {
    // Decoy dropped from the finding-ledger authority (the Boundary Notes echo
    // in the final output stays, so the uncertainty WAS observed).
    args.reviewRecord.result_classification_summary.non_material_findings = [];
    args.reviewRecord.result_classification_summary.non_material_finding_count = 0;
  },
  non_material_finding_preservation: (args) => {
    // Non-material findings must stay OUTSIDE relation coverage.
    for (const finding of args.issueArtifacts.findingLedger.findings) {
      if (MATERIAL_SEVERITIES.includes(String(finding.severity))) continue;
      args.issueArtifacts.relationGraph.singleton_findings.push({
        finding_id: finding.finding_id,
      });
    }
  },
  artifact_material_issue_recall: (args) => {
    args.issueArtifacts.findingLedger.findings =
      args.issueArtifacts.findingLedger.findings.filter(
        (finding) => !MATERIAL_SEVERITIES.includes(String(finding.severity)),
      );
  },
  causal_materiality_shape: (args) => {
    const material = materialFindings(args);
    if (material.length > 0) {
      material[0]!.materiality_basis = null; // material finding without a basis
      return;
    }
    // clean-target has no material findings: break the mirror rule instead — a
    // non-material finding must carry NO basis.
    const nonMaterial = args.issueArtifacts.findingLedger.findings[0];
    if (nonMaterial) {
      nonMaterial.materiality_basis = {
        affected_purpose: "fabricated",
        failure_condition: "fabricated",
        impact: "fabricated",
        evidence_refs: ["fabricated:1"],
      };
    }
  },
  causal_relation_correctness: (args) => {
    if (materialFindings(args).length > 0) {
      // Material findings left with no relation/singleton coverage at all.
      args.issueArtifacts.relationGraph.relations = [];
      args.issueArtifacts.relationGraph.singleton_findings = [];
      return;
    }
    // clean-target: no material findings, so coverage is vacuous — prove the
    // emitted check is a live detector by planting an INVALID shared-cause.
    args.issueArtifacts.relationGraph.relations.push({
      relation_id: "rel-meta-invalid",
      from_finding_id: "finding-nm-001",
      to_finding_id: "finding-nm-002",
      relation: "shared_cause_candidate",
      shared_cause: {
        cause_claim: "unowned cause refs",
        from_cause_ref: "nobody.cause-001",
        to_cause_ref: "nobody.cause-002",
      },
    });
  },
  issue_dependency_preservation: (args) => {
    const hasSharedCause = args.issueArtifacts.relationGraph.relations.some(
      (relation) => relation.relation === "shared_cause_candidate",
    );
    if (hasSharedCause) {
      args.issueArtifacts.issueLedger.issue_dependencies = [];
      return;
    }
    // clean-target: plant a shared-cause whose endpoints belong to no issue —
    // the dependency context is then unrepresented by construction.
    args.issueArtifacts.relationGraph.relations.push({
      relation_id: "rel-meta-orphan",
      from_finding_id: "finding-nm-001",
      to_finding_id: "finding-nm-002",
      relation: "shared_cause_candidate",
      shared_cause: {
        cause_claim: "orphan",
        from_cause_ref: "nobody.cause-001",
        to_cause_ref: "nobody.cause-002",
      },
    });
  },
  actionability: (args) => {
    args.finalOutputText = replaceSection(
      args.finalOutputText,
      "Immediate Actions Required",
      "- Consider a follow-up at some point.",
    );
    args.finalOutputText = replaceSection(
      args.finalOutputText,
      "Recommendations",
      "- Consider a follow-up at some point.",
    );
  },
  grounding: (args) => {
    for (const issue of args.reviewRecord.result_classification_summary
      .material_issues) {
      issue.evidence_refs = [];
    }
  },
};

/** The checks the gate ACTUALLY emits for a fixture's healthy baseline — the
 * applicable set, read from the gate itself rather than restated here. */
function applicableChecksFor(fixtureId: SemanticQualityGateFixtureId): CheckId[] {
  return evaluateScenario(healthyArgs(fixtureId)).checks.map(
    (check) => check.check_id,
  );
}

const SCORING_CORPUS = SCORED_FIXTURE_IDS.flatMap((fixtureId) =>
  applicableChecksFor(fixtureId).map((checkId) => ({
    label: `${fixtureId} / ${checkId}`,
    fixtureId,
    checkId,
  })),
);

describe("semantic quality gate V2 scoring non-vacuity", () => {
  it("scores EVERY built-in fixture — a new fixture cannot enter the cert set unproven", () => {
    // A runtime pin, not a compile-time one: tsconfig excludes *.test.ts, so a
    // type-level exhaustiveness guard here would be inert (it never runs, and
    // `tsc --noEmit` never reads this file). vitest does run this.
    expect([...SCORED_FIXTURE_IDS].sort()).toEqual(
      [...SEMANTIC_QUALITY_GATE_FIXTURE_IDS].sort(),
    );
  });

  it.each(SCORED_FIXTURE_IDS)(
    "%s: the healthy baseline passes every applicable check (pass coverage)",
    (fixtureId) => {
      const result = evaluateScenario(healthyArgs(fixtureId));
      // Non-vacuous subject: a fixture emitting nothing would pass every
      // "no failing check" assertion below for free.
      expect(result.checks.length).toBeGreaterThan(0);
      expect(
        result.checks
          .filter((check) => check.status !== "passed")
          .map((check) => check.check_id),
      ).toEqual([]);
      expect(result.status).toBe("passed");
    },
  );

  it.each(SCORING_CORPUS.map((entry) => [entry.label, entry] as const))(
    "%s: the targeted failing scenario makes that check fail (fail coverage)",
    (_label, entry) => {
      const args = healthyArgs(entry.fixtureId);
      FAILING_MUTATION[entry.checkId](args);
      const result = evaluateScenario(args);
      const target = result.checks.find(
        (check) => check.check_id === entry.checkId,
      );
      expect(target, `${entry.checkId} must still be emitted`).toBeDefined();
      expect(target?.status).toBe("failed");
      expect(result.status).toBe("failed");
    },
  );

  it("every fixture × applicable check has BOTH a passing and a failing scenario", () => {
    const missing: string[] = [];
    for (const fixtureId of SCORED_FIXTURE_IDS) {
      const applicable = applicableChecksFor(fixtureId);
      expect(
        applicable.length,
        `${fixtureId} emits no checks — nothing to prove`,
      ).toBeGreaterThan(0);

      const passed = new Set(
        evaluateScenario(healthyArgs(fixtureId))
          .checks.filter((check) => check.status === "passed")
          .map((check) => check.check_id),
      );
      const failed = new Set<CheckId>();
      for (const checkId of applicable) {
        const args = healthyArgs(fixtureId);
        FAILING_MUTATION[checkId](args);
        for (const check of evaluateScenario(args).checks) {
          if (check.status === "failed") failed.add(check.check_id);
        }
      }
      for (const checkId of applicable) {
        if (!passed.has(checkId)) missing.push(`${fixtureId}/${checkId}: no PASSING scenario`);
        if (!failed.has(checkId)) missing.push(`${fixtureId}/${checkId}: no FAILING scenario`);
      }
    }
    expect(missing).toEqual([]);
  });
});
