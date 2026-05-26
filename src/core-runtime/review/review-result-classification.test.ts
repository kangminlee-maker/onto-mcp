import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readReviewResultClassification,
} from "./review-result-classification.js";
import { writeYamlDocument } from "./review-artifact-utils.js";

async function tempSessionRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "onto-review-classification-"));
}

describe("readReviewResultClassification", () => {
  it("derives material issues, non-material findings, severity counts, and action candidates", async () => {
    const sessionRoot = await tempSessionRoot();
    await writeYamlDocument(path.join(sessionRoot, "finding-ledger.yaml"), {
      schema_version: 1,
      session_id: "classification-test",
      findings: [
        {
          finding_id: "finding-blocker",
          lens_id: "logic",
          source_ref: "round1/logic.md#blocker",
          target: "target",
          evidence_anchor: "anchor-blocker",
          claim: "blocker finding",
          proposed_action: "fix",
          affected_purpose: "primary happy path",
          failure_condition: "any intended user",
          impact: "core contract is broken",
          evidence_refs: ["round1/logic.md#blocker"],
          severity: "blocker",
          domain_threshold_used: null,
        },
        {
          finding_id: "finding-high",
          lens_id: "structure",
          source_ref: "round1/structure.md#high",
          target: "target",
          evidence_anchor: "anchor-high",
          claim: "high finding",
          proposed_action: "fix",
          affected_purpose: "supported environment",
          failure_condition: "supported runtime path",
          impact: "declared purpose fails for supported path",
          evidence_refs: ["round1/structure.md#high"],
          severity: "high",
          domain_threshold_used: null,
        },
        {
          finding_id: "finding-medium",
          lens_id: "dependency",
          source_ref: "round1/dependency.md#medium",
          target: "target",
          evidence_anchor: "anchor-medium",
          claim: "medium finding",
          proposed_action: "review",
          affected_purpose: "auditability",
          failure_condition: "handoff path",
          impact: "trust is meaningfully weakened",
          evidence_refs: ["round1/dependency.md#medium"],
          severity: "medium",
          domain_threshold_used: null,
        },
        {
          finding_id: "finding-low",
          lens_id: "coverage",
          source_ref: "round1/coverage.md#low",
          target: "target",
          evidence_anchor: "anchor-low",
          claim: "low finding",
          proposed_action: "follow up",
          affected_purpose: "polish",
          failure_condition: "nice-to-have path",
          impact: "not unsafe for declared purpose",
          evidence_refs: ["round1/coverage.md#low"],
          severity: "low",
          domain_threshold_used: null,
        },
        {
          finding_id: "finding-info",
          lens_id: "axiology",
          source_ref: "round1/axiology.md#info",
          target: "target",
          evidence_anchor: "anchor-info",
          claim: "info finding",
          proposed_action: "gather evidence",
          affected_purpose: "unknown",
          failure_condition: "evidence gap",
          impact: "not yet an issue",
          evidence_refs: ["round1/axiology.md#info"],
          severity: "info",
          domain_threshold_used: null,
        },
      ],
      validation: {
        unaddressable_findings: [],
      },
    });
    await writeYamlDocument(path.join(sessionRoot, "issue-ledger.yaml"), {
      schema_version: 1,
      session_id: "classification-test",
      issues: [
        {
          issue_id: "issue-blocker",
          root_cause_hypothesis: "blocker root",
          root_confidence: "high",
          surface_finding_ids: ["finding-blocker"],
          relation_refs: [],
          raised_by_lens_ids: ["logic"],
          issue_statement: "blocker issue",
          proposed_action: "fix",
          affected_purpose: "primary happy path",
          failure_condition: "any intended user",
          impact: "core contract is broken",
          evidence_refs: ["round1/logic.md#blocker"],
          severity: "blocker",
          domain_threshold_used: null,
          singleton_reason: "fixture",
        },
        {
          issue_id: "issue-high",
          root_cause_hypothesis: "high root",
          root_confidence: "medium",
          surface_finding_ids: ["finding-high"],
          relation_refs: [],
          raised_by_lens_ids: ["structure"],
          issue_statement: "high issue",
          proposed_action: "fix",
          affected_purpose: "supported environment",
          failure_condition: "supported runtime path",
          impact: "declared purpose fails for supported path",
          evidence_refs: ["round1/structure.md#high"],
          severity: "high",
          domain_threshold_used: null,
          singleton_reason: "fixture",
        },
        {
          issue_id: "issue-medium",
          root_cause_hypothesis: "medium root",
          root_confidence: "medium",
          surface_finding_ids: ["finding-medium"],
          relation_refs: [],
          raised_by_lens_ids: ["dependency"],
          issue_statement: "medium issue",
          proposed_action: "decide",
          affected_purpose: "auditability",
          failure_condition: "handoff path",
          impact: "trust is meaningfully weakened",
          evidence_refs: ["round1/dependency.md#medium"],
          severity: "medium",
          domain_threshold_used: null,
          singleton_reason: "fixture",
        },
        {
          issue_id: "issue-low",
          root_cause_hypothesis: "low root",
          root_confidence: "low",
          surface_finding_ids: ["finding-low"],
          relation_refs: [],
          raised_by_lens_ids: ["coverage"],
          issue_statement: "low issue",
          proposed_action: "follow up",
          affected_purpose: "polish",
          failure_condition: "nice-to-have path",
          impact: "not unsafe for declared purpose",
          evidence_refs: ["round1/coverage.md#low"],
          severity: "low",
          domain_threshold_used: null,
          singleton_reason: "fixture",
        },
        {
          issue_id: "issue-info",
          root_cause_hypothesis: "info root",
          root_confidence: "low",
          surface_finding_ids: ["finding-info"],
          relation_refs: [],
          raised_by_lens_ids: ["axiology"],
          issue_statement: "info issue",
          proposed_action: "gather evidence",
          affected_purpose: "unknown",
          failure_condition: "evidence gap",
          impact: "not yet an issue",
          evidence_refs: ["round1/axiology.md#info"],
          severity: "info",
          domain_threshold_used: null,
          singleton_reason: "fixture",
        },
      ],
      validation: {
        unclustered_finding_ids: [],
      },
    });
    await writeYamlDocument(path.join(sessionRoot, "problem-framing.yaml"), {
      schema_version: 1,
      session_id: "classification-test",
      classification_context: {
        common_spine_version: 1,
        session_domain: "none",
        domain_profile_ref: "",
        domain_profile_doc_type: "custom:problem_framing_profile",
        domain_profile_status: "not_requested",
      },
      classifications: [
        {
          issue_id: "issue-blocker",
          problem_definition: "blocker problem",
          issue_role: "root_cause",
          judgment_state: "observed",
          impact_kind: "correctness",
          timing_class: "current_blocker",
          closure_class: "fix_now",
          closure_obligation: "must_close_in_target",
          domain_axes: {},
          rationale: "fix now",
          related_surface_finding_ids: ["finding-blocker"],
        },
        {
          issue_id: "issue-high",
          problem_definition: "high problem",
          issue_role: "root_cause",
          judgment_state: "observed",
          impact_kind: "correctness",
          timing_class: "next_step_blocker",
          closure_class: "carry_forward",
          closure_obligation: "must_close_before_next_stage",
          domain_axes: {},
          rationale: "fix before release",
          related_surface_finding_ids: ["finding-high"],
        },
        {
          issue_id: "issue-medium",
          problem_definition: "medium problem",
          issue_role: "root_cause",
          judgment_state: "contested",
          impact_kind: "governance_value",
          timing_class: "planned_follow_up",
          closure_class: "needs_decision",
          closure_obligation: "may_close_during_next_stage",
          domain_axes: {},
          rationale: "decision required",
          related_surface_finding_ids: ["finding-medium"],
        },
        {
          issue_id: "issue-low",
          problem_definition: "low problem",
          issue_role: "independent_issue",
          judgment_state: "observed",
          impact_kind: "maintainability_evolvability",
          timing_class: "defer_watch",
          closure_class: "watch",
          closure_obligation: "planned_later",
          domain_axes: {},
          rationale: "follow up",
          related_surface_finding_ids: ["finding-low"],
        },
        {
          issue_id: "issue-info",
          problem_definition: "info problem",
          issue_role: "evidence_gap",
          judgment_state: "insufficient_evidence",
          impact_kind: "completeness",
          timing_class: "defer_watch",
          closure_class: "needs_evidence",
          closure_obligation: "out_of_scope",
          domain_axes: {},
          rationale: "needs evidence",
          related_surface_finding_ids: ["finding-info"],
        },
      ],
    });

    const summary = await readReviewResultClassification(sessionRoot);

    expect(summary.highest_severity).toBe("blocker");
    expect(summary.severity_counts).toEqual({
      blocker: 1,
      high: 1,
      medium: 1,
      low: 1,
      info: 1,
    });
    expect(summary.material_issue_count).toBe(3);
    expect(summary.non_material_finding_count).toBe(2);
    expect(summary.material_issues.map((issue) => issue.issue_id)).toEqual([
      "issue-blocker",
      "issue-high",
      "issue-medium",
    ]);
    expect(summary.non_material_findings.map((issue) => issue.issue_id)).toEqual([
      "issue-low",
      "issue-info",
    ]);
    expect(
      summary.action_candidates.find((candidate) => candidate.issue_id === "issue-blocker")
        ?.candidates,
    ).toContain("fix_now");
    expect(
      summary.action_candidates.find((candidate) => candidate.issue_id === "issue-high")
        ?.candidates,
    ).toContain("fix_before_release");
    expect(
      summary.action_candidates.find((candidate) => candidate.issue_id === "issue-medium")
        ?.candidates,
    ).toContain("accept_risk");
  });

  it("adds a runtime halt action candidate when execution halted partially", async () => {
    const sessionRoot = await tempSessionRoot();
    await writeYamlDocument(path.join(sessionRoot, "execution-result.yaml"), {
      execution_status: "halted_partial",
      halt_reason: "fixture halt",
    });

    const summary = await readReviewResultClassification(sessionRoot);

    expect(summary.action_candidates).toContainEqual({
      issue_id: "runtime-halt",
      candidates: ["retry_execution", "continue_review"],
      derivation_refs: ["execution-result.yaml"],
      rationale: "fixture halt",
    });
  });

  it("preserves domain threshold explanations without creating a second materiality axis", async () => {
    const cases = [
      {
        domain: "ontology",
        issueId: "issue-authority-conflict",
        severity: "blocker",
        threshold: "ontology: canonical authority conflict",
        impactKind: "governance_value",
      },
      {
        domain: "software-engineering",
        issueId: "issue-runtime-contract",
        severity: "high",
        threshold: "software-engineering: user-visible runtime contract breach",
        impactKind: "correctness",
      },
      {
        domain: "accounting",
        issueId: "issue-spreadsheet-variance",
        severity: "medium",
        threshold: "spreadsheet/accounting: threshold-exceeding variance",
        impactKind: "correctness",
      },
    ] as const;

    for (const testCase of cases) {
      const sessionRoot = await tempSessionRoot();
      const findingId = `${testCase.issueId}-finding`;
      await writeYamlDocument(path.join(sessionRoot, "finding-ledger.yaml"), {
        schema_version: 1,
        session_id: `threshold-${testCase.domain}`,
        findings: [
          {
            finding_id: findingId,
            lens_id: "logic",
            source_ref: "round1/logic.md#threshold",
            target: "target",
            evidence_anchor: "threshold-anchor",
            claim: `${testCase.domain} threshold finding`,
            proposed_action: "fix",
            affected_purpose: "declared domain review purpose",
            failure_condition: "domain threshold is crossed",
            impact: "declared purpose becomes unsafe to trust",
            evidence_refs: ["round1/logic.md#threshold"],
            severity: testCase.severity,
            domain_threshold_used: testCase.threshold,
          },
        ],
        validation: {
          unaddressable_findings: [],
        },
      });
      await writeYamlDocument(path.join(sessionRoot, "issue-ledger.yaml"), {
        schema_version: 1,
        session_id: `threshold-${testCase.domain}`,
        issues: [
          {
            issue_id: testCase.issueId,
            root_cause_hypothesis: "threshold fixture root",
            root_confidence: "high",
            surface_finding_ids: [findingId],
            relation_refs: [],
            raised_by_lens_ids: ["logic"],
            issue_statement: `${testCase.domain} threshold issue`,
            proposed_action: "fix",
            affected_purpose: "declared domain review purpose",
            failure_condition: "domain threshold is crossed",
            impact: "declared purpose becomes unsafe to trust",
            evidence_refs: ["round1/logic.md#threshold"],
            severity: testCase.severity,
            domain_threshold_used: testCase.threshold,
            singleton_reason: "fixture",
          },
        ],
        validation: {
          unclustered_finding_ids: [],
        },
      });
      await writeYamlDocument(path.join(sessionRoot, "problem-framing.yaml"), {
        schema_version: 1,
        session_id: `threshold-${testCase.domain}`,
        classification_context: {
          common_spine_version: 1,
          session_domain: testCase.domain,
          domain_profile_ref:
            testCase.domain === "accounting"
              ? ".onto/domains/accounting/domain_scope.md"
              : `.onto/domains/${testCase.domain}/problem_framing_profile.md`,
          domain_profile_doc_type: "custom:problem_framing_profile",
          domain_profile_status: "selected",
        },
        classifications: [
          {
            issue_id: testCase.issueId,
            problem_definition: `${testCase.domain} threshold problem`,
            issue_role: "root_cause",
            judgment_state: "observed",
            impact_kind: testCase.impactKind,
            timing_class:
              testCase.severity === "blocker"
                ? "current_blocker"
                : "next_step_blocker",
            closure_class:
              testCase.severity === "blocker" ? "fix_now" : "carry_forward",
            closure_obligation:
              testCase.severity === "blocker"
                ? "must_close_in_target"
                : "must_close_before_next_stage",
            domain_axes: {
              threshold_used: testCase.threshold,
            },
            rationale: "domain threshold explains severity",
            related_surface_finding_ids: [findingId],
          },
        ],
      });

      const summary = await readReviewResultClassification(sessionRoot);
      const projection = summary.material_issues.find(
        (issue) => issue.issue_id === testCase.issueId,
      );

      expect(projection?.severity).toBe(testCase.severity);
      expect(projection?.material).toBe(true);
      expect(projection?.domain_threshold_used).toBe(testCase.threshold);
      expect(summary.non_material_findings).toEqual([]);
      expect(
        summary.action_candidates.find(
          (candidate) => candidate.issue_id === testCase.issueId,
        )?.derivation_refs,
      ).toContain("problem-framing.yaml");
    }
  });
});
