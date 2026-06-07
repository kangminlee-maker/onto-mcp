import { describe, expect, it } from "vitest";
import {
  buildIssueScopedDeliberationWorklist,
  buildIssueScopedLensDeliberationPrompt,
  buildNoPlannedDeliberationResolution,
  renderDeliberationMarkdownProjection,
  validateDeliberationResolutionObject,
  validateIssueDeliberationResponseObject,
} from "./controlled-lens-deliberation.js";

const issueLedger = {
  schema_version: 1,
  session_id: "session-1",
  issues: [
    {
      issue_id: "issue-001",
      root_cause_hypothesis: "root mismatch",
      root_confidence: "medium",
      surface_finding_ids: ["finding-001"],
      relation_refs: [],
      raised_by_lens_ids: ["logic"],
      issue_statement: "issue statement",
      proposed_action: "fix it",
      affected_purpose: "declared purpose",
      failure_condition: "condition",
      impact: "impact",
      evidence_refs: ["round1/logic.md#finding-1"],
      severity: "high",
      domain_threshold_used: null,
      singleton_reason: "mock singleton",
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
          evidence_refs: ["round1/logic.md"],
        },
        {
          lens_id: "structure",
          stance: "narrow",
          rationale: "structure narrows",
          root_hypothesis_position: "narrows",
          severity_position: "keeps",
          evidence_refs: ["round1/structure.md"],
        },
      ],
    },
  ],
  validation: {
    missing_stances: [],
  },
};

const deliberationPlan = {
  schema_version: 1,
  session_id: "session-1",
  planned_issues: [
    {
      issue_id: "issue-001",
      priority: 10,
      conflict_type: "root_hypothesis",
      participating_lens_ids: ["logic", "structure"],
      source_stance_refs: [
        "issue-stance-matrix.yaml#stances.issue-001.logic",
        "issue-stance-matrix.yaml#stances.issue-001.structure",
      ],
      conflict_summary: "root hypothesis differs",
      resolution_question: "which root should stand?",
    },
  ],
  skipped_issues: [],
};

describe("controlled lens deliberation artifacts", () => {
  it("builds issue-scoped work items from the validated plan", () => {
    const workItems = buildIssueScopedDeliberationWorklist({
      promptPacketsRoot: "/repo/.onto/review/session-1/prompt-packets",
      deliberationRootPath: "/repo/.onto/review/session-1/deliberation",
      deliberationPlan,
      issueLedger,
      issueStanceMatrix,
    });

    expect(workItems.map((item) => `${item.issue_id}:${item.lens_id}`)).toEqual([
      "issue-001:logic",
      "issue-001:structure",
    ]);
    expect(workItems[0]?.packet_path).toContain(
      "/prompt-packets/deliberation/issue-001/logic.prompt.md",
    );
    expect(workItems[0]?.output_path).toContain(
      "/deliberation/responses/issue-001/logic.yaml",
    );
  });

  it("adds related issue dependency context to issue-scoped work items", () => {
    const issueLedgerWithDependency = {
      ...issueLedger,
      issues: [
        ...issueLedger.issues,
        {
          issue_id: "issue-002",
          root_cause_hypothesis: "shared setup gap",
          root_confidence: "medium",
          surface_finding_ids: ["finding-002"],
          relation_refs: [],
          raised_by_lens_ids: ["structure"],
          issue_statement: "related issue statement",
          proposed_action: "fix related issue",
          affected_purpose: "declared purpose",
          failure_condition: "related condition",
          impact: "related impact",
          evidence_refs: ["round1/structure.md#finding-1"],
          severity: "medium",
          domain_threshold_used: null,
          singleton_reason: "mock singleton",
        },
      ],
      issue_dependencies: [
        {
          dependency_id: "dep-001",
          dependency_kind: "shared_cause_candidate",
          issue_ids: ["issue-001", "issue-002"],
          relation_refs: ["rel-001"],
          rationale: "Both issues depend on a shared setup gap.",
        },
      ],
    };
    const [workItem] = buildIssueScopedDeliberationWorklist({
      promptPacketsRoot: "/repo/.onto/review/session-1/prompt-packets",
      deliberationRootPath: "/repo/.onto/review/session-1/deliberation",
      deliberationPlan,
      issueLedger: issueLedgerWithDependency,
      issueStanceMatrix,
    });

    expect(workItem?.related_issue_context).toEqual([
      expect.objectContaining({
        issue_id: "issue-002",
        issue_statement: "related issue statement",
        dependency_id: "dep-001",
        dependency_kind: "shared_cause_candidate",
        relation_refs: ["rel-001"],
      }),
    ]);
    const prompt = buildIssueScopedLensDeliberationPrompt({
      sessionId: "session-1",
      projectRoot: "/repo",
      workItem: workItem!,
    });
    expect(prompt).toContain("related_issue_context:");
    expect(prompt).toContain("Both issues depend on a shared setup gap.");
  });

  it("builds bounded runtime-submit issue response prompts", () => {
    const [workItem] = buildIssueScopedDeliberationWorklist({
      promptPacketsRoot: "/repo/.onto/review/session-1/prompt-packets",
      deliberationRootPath: "/repo/.onto/review/session-1/deliberation",
      deliberationPlan,
      issueLedger,
      issueStanceMatrix,
    });
    const prompt = buildIssueScopedLensDeliberationPrompt({
      sessionId: "session-1",
      projectRoot: "/repo",
      workItem: workItem!,
      boundaryContext: "## Unit Boundary Details\n```json\n{}\n```",
    });

    expect(prompt).toContain("unit_id: deliberation:issue-001:logic");
    expect(prompt).toContain("## Runtime Projection");
    expect(prompt).toContain("submit_issue_deliberation_response");
    expect(prompt).toContain("Runtime-Written YAML Shape");
    expect(prompt).toContain(
      'source_stance_ref: "issue-stance-matrix.yaml#stances.issue-001.logic"',
    );
    expect(prompt).toContain("## Unit Boundary Details");
  });

  it("validates issue-scoped responses and change reason consistency", () => {
    const artifact = validateIssueDeliberationResponseObject({
      sessionId: "session-1",
      issueId: "issue-001",
      lensId: "logic",
      parsed: {
        schema_version: 1,
        session_id: "session-1",
        issue_id: "issue-001",
        lens_id: "logic",
        difference_explanation: "difference",
        response_to_other_positions: "response",
        updated_stance: "support",
        changed: false,
        change_reason: null,
        accepted_root_hypothesis: "root mismatch",
        remaining_blocker: null,
        evidence_refs: ["issue-ledger.yaml#issue-001"],
        validation: {
          source_stance_ref:
            "issue-stance-matrix.yaml#stances.issue-001.logic",
        },
      },
    });

    expect(artifact.changed).toBe(false);
    expect(() =>
      validateIssueDeliberationResponseObject({
        sessionId: "session-1",
        issueId: "issue-001",
        lensId: "logic",
        parsed: { ...artifact, changed: true, change_reason: null },
      }),
    ).toThrow(/change_reason/);
  });

  it("validates resolution coverage and renders markdown projection", () => {
    const resolution = validateDeliberationResolutionObject({
      sessionId: "session-1",
      issueLedger,
      deliberationPlan,
      parsed: {
        schema_version: 1,
        session_id: "session-1",
        issues: [
          {
            issue_id: "issue-001",
            status: "resolved",
            final_root_cause: "root mismatch",
            final_claim: "issue statement",
            surface_finding_ids: ["finding-001"],
            accepted_by_lens_ids: ["logic", "structure"],
            remaining_disagreement_lens_ids: [],
            reason: "resolved by response artifacts",
            required_follow_up_evidence: [],
          },
        ],
        validation: {
          missing_issue_ids: [],
        },
      },
    });

    const markdown = renderDeliberationMarkdownProjection({ resolution });
    expect(markdown).toContain("deliberation_status: performed");
    expect(markdown).toContain("## Consensus");
    expect(markdown).toContain("issue-001");
  });

  it("builds runtime resolution when no issue is planned", () => {
    const noPlan = {
      schema_version: 1,
      session_id: "session-1",
      planned_issues: [],
      skipped_issues: [
        {
          issue_id: "issue-001",
          reason_code: "non_material_issue",
          reason: "not material",
        },
      ],
    };
    const resolution = buildNoPlannedDeliberationResolution({
      sessionId: "session-1",
      issueLedger,
    });
    const validated = validateDeliberationResolutionObject({
      parsed: resolution,
      sessionId: "session-1",
      issueLedger,
      deliberationPlan: noPlan,
    });

    expect(validated.issues[0]?.status).toBe("no-deliberation-needed");
  });
});
