import { describe, expect, it } from "vitest";
import type {
  ReviewExecutionPlan,
  ReviewResultClassificationSummary,
} from "./artifact-types.js";
import {
  buildReviewSynthesisLedger,
  buildReviewSynthesisWorkItemsArtifact,
  renderSynthesisMarkdownFromLedger,
  validateIssueSynthesisResponseObject,
} from "./synthesis-map-reduce.js";

function minimalExecutionPlan(): ReviewExecutionPlan {
  const projectRoot = "/repo";
  const sessionRoot = `${projectRoot}/.onto/review/session-1`;
  return {
    session_id: "session-1",
    session_root: sessionRoot,
    execution_realization: "worker",
    host_runtime: "codex",
    review_mode: "full",
    interpretation_artifact_path: `${sessionRoot}/interpretation.yaml`,
    binding_output_path: `${sessionRoot}/binding.yaml`,
    session_metadata_path: `${sessionRoot}/session-metadata.yaml`,
    execution_preparation_root: `${sessionRoot}/execution-preparation`,
    round1_root: `${sessionRoot}/round1`,
    lens_execution_seats: [],
    prompt_packets_root: `${sessionRoot}/prompt-packets`,
    lens_prompt_packet_seats: [],
    issue_artifact_prompt_packet_seats: [],
    teamlead_deliberation_prompt_packet_path:
      `${sessionRoot}/prompt-packets/controlled-deliberation.prompt.md`,
    review_target_profile_path:
      `${sessionRoot}/execution-preparation/review-target-profile.yaml`,
    synthesis_output_path: `${sessionRoot}/synthesis.md`,
    finding_ledger_path: `${sessionRoot}/finding-ledger.yaml`,
    finding_relation_graph_path: `${sessionRoot}/finding-relation-graph.yaml`,
    issue_ledger_path: `${sessionRoot}/issue-ledger.yaml`,
    issue_stance_matrix_path: `${sessionRoot}/issue-stance-matrix.yaml`,
    deliberation_plan_path: `${sessionRoot}/deliberation-plan.yaml`,
    problem_framing_path: `${sessionRoot}/problem-framing.yaml`,
    deliberation_mode: "controlled-lens-deliberation",
    deliberation_root_path: `${sessionRoot}/deliberation`,
    deliberation_output_path: `${sessionRoot}/deliberation.md`,
    execution_result_path: `${sessionRoot}/execution-result.yaml`,
    error_log_path: `${sessionRoot}/error-log.md`,
    final_output_path: `${sessionRoot}/final-output.md`,
    review_record_path: `${sessionRoot}/review-record.yaml`,
    boundary_policy: {
      web_research_policy: "denied",
      repo_exploration_policy: "denied",
      recursive_reference_expansion_policy: "denied",
      filesystem_scope: { allowed_roots: [projectRoot] },
      write_policy: {
        source_mutation_policy: "denied",
        allowed_output_refs: [sessionRoot],
      },
      provenance_policy: {
        extra_exploration_citation_required: false,
        web_source_citation_required: false,
      },
    },
    boundary_presentation: {
      role_definition_presentation: "embedded_and_ref",
      primary_target_presentation: "embedded_and_ref",
      required_context_presentation: "ref_only",
      output_seat_presentation: "declared",
      control_policy_presentation: "declared",
    },
    boundary_enforcement_profile: {
      prompt_boundary_enforcement: "prompt_declared_only",
      filesystem_boundary_enforcement: "prompt_declared_only",
      network_boundary_enforcement: "prompt_declared_only",
      write_boundary_enforcement: "prompt_declared_only",
    },
    effective_boundary_state: {
      web_research: {
        requested_policy: "denied",
        effective_policy: "denied",
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
      repo_exploration: {
        requested_policy: "denied",
        effective_policy: "denied",
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
      recursive_reference_expansion: {
        requested_policy: "denied",
        effective_policy: "denied",
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
      source_mutation: {
        requested_policy: "denied",
        effective_policy: "denied",
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
      filesystem_scope: {
        effective_allowed_roots: [projectRoot],
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
    },
  };
}

const severityCounts = {
  blocker: 0,
  high: 1,
  medium: 0,
  low: 1,
  info: 0,
};

const classificationSummary: ReviewResultClassificationSummary = {
  highest_severity: "high",
  finding_count: 2,
  issue_count: 2,
  finding_severity_counts: severityCounts,
  issue_severity_counts: severityCounts,
  severity_counts: severityCounts,
  material_issue_count: 1,
  non_material_finding_count: 1,
  material_issues: [
    {
      issue_id: "issue-001",
      severity: "high",
      material: true,
      affected_purpose: "declared purpose",
      failure_condition: "material failure",
      impact: "purpose is weakened",
      evidence_refs: ["round1/logic.md#finding-1"],
      source_lens_ids: ["logic"],
      action_candidates: ["fix_before_release"],
      rationale: "material issue",
      issue_statement: "material issue statement",
    },
  ],
  non_material_findings: [
    {
      issue_id: "issue-002",
      severity: "low",
      material: false,
      affected_purpose: "declared purpose",
      failure_condition: "watch condition",
      impact: "minor friction",
      evidence_refs: ["round1/structure.md#finding-1"],
      source_lens_ids: ["structure"],
      action_candidates: ["follow_up"],
      rationale: "non-material issue",
      issue_statement: "non-material issue statement",
    },
  ],
  action_candidates: [
    {
      issue_id: "issue-001",
      candidates: ["fix_before_release"],
      derivation_refs: ["issue-ledger.yaml", "problem-framing.yaml"],
      rationale: "derived from problem framing",
    },
  ],
};

const findingLedger = {
  schema_version: 1,
  session_id: "session-1",
  findings: [
    {
      finding_id: "finding-001",
      lens_id: "logic",
      source_ref: "round1/logic.md#finding-1",
      target: "target",
      evidence_anchor: "anchor",
      claim: "material finding",
      lens_rationale_summary: "logic rationale",
      proposed_action: "fix it",
      affected_purpose: "declared purpose",
      failure_condition: "material failure",
      impact: "purpose is weakened",
      evidence_refs: ["round1/logic.md#finding-1"],
      severity: "high",
      domain_threshold_used: null,
      materiality_basis: {
        affected_purpose: "declared purpose",
        failure_condition: "material failure",
        impact: "purpose is weakened",
        evidence_refs: ["round1/logic.md#finding-1"],
      },
      causal_path: {
        root_cause_candidate: "root cause",
        root_cause_step_id: "cause-001",
        steps: [
          {
            cause_id: "cause-001",
            claim: "root cause",
            relation_to_previous: null,
            evidence_refs: ["round1/logic.md#finding-1"],
          },
        ],
        unresolved_beyond_evidence: null,
      },
    },
  ],
};

const issueLedger = {
  schema_version: 1,
  session_id: "session-1",
  issues: [
    {
      issue_id: "issue-001",
      root_cause_hypothesis: "root cause",
      root_confidence: "medium",
      surface_finding_ids: ["finding-001"],
      relation_refs: [],
      raised_by_lens_ids: ["logic"],
      issue_statement: "material issue statement",
      proposed_action: "fix it",
      affected_purpose: "declared purpose",
      failure_condition: "material failure",
      impact: "purpose is weakened",
      evidence_refs: ["round1/logic.md#finding-1"],
      severity: "high",
      domain_threshold_used: null,
      singleton_reason: "singleton",
    },
  ],
  issue_dependencies: [],
  validation: {
    unclustered_finding_ids: [],
  },
};

const issueStanceMatrix = {
  schema_version: 1,
  session_id: "session-1",
  issues: [
    {
      issue_id: "issue-001",
      stances: [
        {
          lens_id: "logic",
          stance: "support",
          rationale: "logic supports",
          root_hypothesis_position: "accepts",
          severity_position: "keeps",
          evidence_refs: ["issue-ledger.yaml#issue-001"],
        },
      ],
    },
  ],
  validation: {
    missing_stances: [],
  },
};

const deliberationResolution = {
  schema_version: 1,
  session_id: "session-1",
  issues: [
    {
      issue_id: "issue-001",
      status: "resolved",
      final_root_cause: "root cause",
      final_claim: "material issue statement",
      surface_finding_ids: ["finding-001"],
      accepted_by_lens_ids: ["logic"],
      remaining_disagreement_lens_ids: [],
      reason: "accepted",
      required_follow_up_evidence: [],
    },
  ],
  validation: {
    missing_issue_ids: [],
  },
} as const;

const problemFraming = {
  schema_version: 1,
  session_id: "session-1",
  classification_context: {
    common_spine_version: 1,
    session_domain: "none",
  },
  classifications: [
    {
      issue_id: "issue-001",
      problem_definition: "problem",
      issue_role: "independent_issue",
      judgment_state: "observed",
      impact_kind: "quality",
      timing_class: "fix_before_release",
      closure_class: "must_fix",
      closure_obligation: "fix",
      domain_axes: {},
      rationale: "framed",
      related_surface_finding_ids: ["finding-001"],
    },
  ],
};

describe("synthesis map-reduce artifacts", () => {
  it("builds material issue work items while preserving non-material findings", () => {
    const plan = minimalExecutionPlan();
    const workItems = buildReviewSynthesisWorkItemsArtifact({
      projectRoot: "/repo",
      executionPlan: plan,
      findingLedger,
      relationGraph: { schema_version: 1, session_id: "session-1", relations: [] },
      issueLedger,
      issueStanceMatrix,
      deliberationPlan: {
        schema_version: 1,
        session_id: "session-1",
        planned_issues: [],
        skipped_issues: [],
      },
      deliberationResolution,
      problemFraming,
      classificationSummary,
    });

    expect(workItems.work_items).toHaveLength(1);
    expect(workItems.non_material_findings).toHaveLength(1);
    expect(workItems.work_items[0]?.work_item_id).toBe("synthesis:issue-001");
    expect(workItems.work_items[0]?.allowed_evidence_refs).toContain(
      "round1/logic.md#finding-1",
    );
    expect(workItems.work_items[0]?.allowed_source_refs).toContain(
      "finding-ledger.yaml#finding-001",
    );
  });

  it("validates issue synthesis response refs before ledger assembly", () => {
    const plan = minimalExecutionPlan();
    const workItems = buildReviewSynthesisWorkItemsArtifact({
      projectRoot: "/repo",
      executionPlan: plan,
      findingLedger,
      relationGraph: { schema_version: 1, session_id: "session-1", relations: [] },
      issueLedger,
      issueStanceMatrix,
      deliberationPlan: {
        schema_version: 1,
        session_id: "session-1",
        planned_issues: [],
        skipped_issues: [],
      },
      deliberationResolution,
      problemFraming,
      classificationSummary,
    });
    const workItem = workItems.work_items[0]!;
    const response = validateIssueSynthesisResponseObject({
      parsed: {
        schema_version: 1,
        session_id: "session-1",
        work_item_id: workItem.work_item_id,
        issue_id: workItem.issue_id,
        source_work_item_ref: "synthesis-work-items.yaml#synthesis:issue-001",
        conclusion: "conclusion",
        materiality_explanation: "materiality",
        root_cause_explanation: "root",
        causal_path_explanation: "causal path",
        action_explanation: "action",
        unresolved_disagreement_note: null,
        boundary_notes: [],
        source_refs_used: ["finding-ledger.yaml#finding-001"],
      },
      sessionId: "session-1",
      workItem,
      sourceWorkItemsRef: "synthesis-work-items.yaml#synthesis:issue-001",
    });

    expect(response.issue_id).toBe("issue-001");
    expect(() =>
      validateIssueSynthesisResponseObject({
        parsed: {
          ...response,
          source_refs_used: ["round1/raw-unbounded.md"],
        },
        sessionId: "session-1",
        workItem,
        sourceWorkItemsRef: "synthesis-work-items.yaml#synthesis:issue-001",
      }),
    ).toThrow(/unsupported ref/);
    expect(() =>
      validateIssueSynthesisResponseObject({
        parsed: {
          ...response,
          source_refs_used: [],
        },
        sessionId: "session-1",
        workItem,
        sourceWorkItemsRef: "synthesis-work-items.yaml#synthesis:issue-001",
      }),
    ).toThrow(/at least one allowed source ref/);
  });

  it("assembles a ledger and renders participation-preserving markdown", () => {
    const plan = minimalExecutionPlan();
    const workItems = buildReviewSynthesisWorkItemsArtifact({
      projectRoot: "/repo",
      executionPlan: plan,
      findingLedger,
      relationGraph: { schema_version: 1, session_id: "session-1", relations: [] },
      issueLedger,
      issueStanceMatrix,
      deliberationPlan: {
        schema_version: 1,
        session_id: "session-1",
        planned_issues: [],
        skipped_issues: [],
      },
      deliberationResolution,
      problemFraming,
      classificationSummary,
    });
    const workItem = workItems.work_items[0]!;
    const response = validateIssueSynthesisResponseObject({
      parsed: {
        schema_version: 1,
        session_id: "session-1",
        work_item_id: workItem.work_item_id,
        issue_id: workItem.issue_id,
        source_work_item_ref: "synthesis-work-items.yaml#synthesis:issue-001",
        conclusion: "fix the root",
        materiality_explanation: "weakens the declared purpose",
        root_cause_explanation: "root cause starts the chain",
        causal_path_explanation: "cause leads to failure",
        action_explanation: "fix before release",
        unresolved_disagreement_note: null,
        boundary_notes: [],
        source_refs_used: ["finding-ledger.yaml#finding-001"],
      },
      sessionId: "session-1",
      workItem,
      sourceWorkItemsRef: "synthesis-work-items.yaml#synthesis:issue-001",
    });
    const ledger = buildReviewSynthesisLedger({
      projectRoot: "/repo",
      executionPlan: plan,
      workItemsPath: `${plan.session_root}/synthesis-work-items.yaml`,
      workItems,
      responses: [response],
    });
    const markdown = renderSynthesisMarkdownFromLedger(ledger, {
      expectedLensIds: ["logic", "structure"],
      receivedLensIds: ["logic"],
    });

    expect(ledger.material_issues).toHaveLength(1);
    expect(ledger.non_material_findings).toHaveLength(1);
    expect(ledger.shared_phenomenon_summary).toEqual([]);
    expect(ledger.validation.non_material_findings_preserved).toBe(true);
    expect(markdown).toContain("expected_lenses:\n    - logic\n    - structure");
    expect(markdown).toContain("received_lenses:\n    - logic");
    expect(markdown).toContain("## Shared Phenomenon Summary\n- none");
  });
});
