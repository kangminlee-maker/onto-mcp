import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDeliberationPlanInputProjection,
  buildFindingRelationInputProjection,
  buildIssueArtifactPrompt,
  buildProblemFramingInputProjection,
  buildIssueStanceResponsePrompt,
  buildIssueStanceInputProjection,
  issueStanceConsumerId,
  issueArtifactAllowedReadRefs,
  renderDeliberationPlanInputProjectionSection,
  renderFindingRelationInputProjectionSection,
  renderProblemFramingInputProjectionSection,
  renderIssueStanceInputProjectionSection,
  validateIssueStanceResponseObject,
  validateIssueArtifactOnDisk,
  validateIssueArtifactObject,
} from "./issue-artifact-runtime.js";
import {
  parsePacketAllowedReadAuthority,
  parsePacketBoundaryPolicy,
} from "./packet-boundary-policy.js";

function minimalExecutionPlan(projectRoot = "/repo") {
  const sessionRoot = `${projectRoot}/.onto/review/session`;
  const prepRoot = `${sessionRoot}/execution-preparation`;
  return {
    session_id: "session-001",
    session_root: sessionRoot,
    execution_realization: "worker",
    host_runtime: "codex",
    review_mode: "core-axis",
    interpretation_artifact_path: `${sessionRoot}/interpretation.yaml`,
    binding_output_path: `${sessionRoot}/binding.yaml`,
    session_metadata_path: `${sessionRoot}/session-metadata.yaml`,
    execution_preparation_root: prepRoot,
    round1_root: `${sessionRoot}/round1`,
    lens_execution_seats: [],
    prompt_packets_root: `${sessionRoot}/prompt-packets`,
    lens_prompt_packet_seats: [],
    issue_artifact_prompt_packet_seats: [
      {
        artifact_id: "finding-ledger",
        packet_path: `${sessionRoot}/prompt-packets/finding-ledger.prompt.md`,
        output_path: `${sessionRoot}/finding-ledger.yaml`,
      },
      {
        artifact_id: "finding-relation-graph",
        packet_path: `${sessionRoot}/prompt-packets/finding-relation-graph.prompt.md`,
        output_path: `${sessionRoot}/finding-relation-graph.yaml`,
      },
      {
        artifact_id: "issue-ledger",
        packet_path: `${sessionRoot}/prompt-packets/issue-ledger.prompt.md`,
        output_path: `${sessionRoot}/issue-ledger.yaml`,
      },
      {
        artifact_id: "issue-stance-matrix",
        packet_path: `${sessionRoot}/prompt-packets/issue-stance-matrix.prompt.md`,
        output_path: `${sessionRoot}/issue-stance-matrix.yaml`,
      },
      {
        artifact_id: "deliberation-plan",
        packet_path: `${sessionRoot}/prompt-packets/deliberation-plan.prompt.md`,
        output_path: `${sessionRoot}/deliberation-plan.yaml`,
      },
      {
        artifact_id: "problem-framing",
        packet_path: `${sessionRoot}/prompt-packets/problem-framing.prompt.md`,
        output_path: `${sessionRoot}/problem-framing.yaml`,
      },
    ],
    teamlead_deliberation_prompt_packet_path: `${sessionRoot}/prompt-packets/controlled-deliberation.prompt.md`,
    review_target_profile_path: `${prepRoot}/review-target-profile.yaml`,
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
      repo_exploration_policy: "allowed",
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
        requested_policy: "allowed",
        effective_policy: "allowed",
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
        requested_allowed_roots: [projectRoot],
        effective_allowed_roots: [projectRoot],
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
    },
  } as any;
}

describe("validateIssueArtifactObject — issue-stance-matrix enum fields", () => {
  it("accepts explicit non-applicable and insufficient-evidence position tokens", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "issue-stance-matrix",
        sessionId: "session-001",
        participatingLensIds: ["logic", "axiology"],
        knownIssueIds: new Set(["issue-001"]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          issues: [
            {
              issue_id: "issue-001",
              stances: [
                {
                  lens_id: "logic",
                  stance: "not_applicable",
                  rationale: "The logic lens has no direct position on this value judgment.",
                  root_hypothesis_position: "not_applicable",
                  severity_position: "not_applicable",
                  evidence_refs: ["round1/logic.md"],
                },
                {
                  lens_id: "axiology",
                  stance: "insufficient_evidence",
                  rationale: "The available boundary lacks the value criterion needed for severity.",
                  root_hypothesis_position: "insufficient_evidence",
                  severity_position: "insufficient_evidence",
                  evidence_refs: ["round1/axiology.md"],
                },
              ],
            },
          ],
          validation: {
            missing_stances: [],
          },
        },
      }),
    ).not.toThrow();
  });

  it("rejects explanatory prose in enum-valued position fields", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "issue-stance-matrix",
        sessionId: "session-001",
        participatingLensIds: ["logic"],
        knownIssueIds: new Set(["issue-001"]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          issues: [
            {
              issue_id: "issue-001",
              stances: [
                {
                  lens_id: "logic",
                  stance: "support",
                  rationale: "The lens accepts the issue root.",
                  root_hypothesis_position: "accepts because the evidence is aligned",
                  severity_position: "keeps",
                  evidence_refs: ["round1/logic.md"],
                },
              ],
            },
          ],
          validation: {
            missing_stances: [],
          },
        },
      }),
    ).toThrow(/Allowed values: accepts, narrows, replaces, rejects, not_applicable, insufficient_evidence/);
  });

  it("rejects stances from non-participating lenses", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "issue-stance-matrix",
        sessionId: "session-001",
        participatingLensIds: ["logic"],
        knownIssueIds: new Set(["issue-001"]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          issues: [
            {
              issue_id: "issue-001",
              stances: [
                {
                  lens_id: "logic",
                  stance: "support",
                  rationale: "The logic lens accepts the issue.",
                  root_hypothesis_position: "accepts",
                  severity_position: "keeps",
                  evidence_refs: ["round1/logic.md"],
                },
                {
                  lens_id: "ghost",
                  stance: "support",
                  rationale: "This lens did not participate.",
                  root_hypothesis_position: "accepts",
                  severity_position: "keeps",
                  evidence_refs: ["round1/ghost.md"],
                },
              ],
            },
          ],
          validation: {
            missing_stances: [],
          },
        },
      }),
    ).toThrow(/non-participating lens: ghost/);
  });

  it("rejects non-string stance evidence refs", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "issue-stance-matrix",
        sessionId: "session-001",
        participatingLensIds: ["logic"],
        knownIssueIds: new Set(["issue-001"]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          issues: [
            {
              issue_id: "issue-001",
              stances: [
                {
                  lens_id: "logic",
                  stance: "support",
                  rationale: "The logic lens accepts the issue.",
                  root_hypothesis_position: "accepts",
                  severity_position: "keeps",
                  evidence_refs: ["round1/logic.md", 123],
                },
              ],
            },
          ],
          validation: {
            missing_stances: [],
          },
        },
      }),
    ).toThrow(/evidence_refs\[1\] must be a non-empty string/);
  });

  it("rejects stance evidence refs outside the issue/lens provenance set", () => {
    const knownStanceEvidenceRefs = new Map([
      [
        "issue-001",
        new Map([
          [
            "logic",
            new Set([
              "issue-ledger.yaml#issue-001",
              "finding-ledger.yaml#finding-001",
              "round1/logic.md",
            ]),
          ],
        ]),
      ],
    ]);
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "issue-stance-matrix",
        sessionId: "session-001",
        participatingLensIds: ["logic"],
        knownIssueIds: new Set(["issue-001"]),
        knownStanceEvidenceRefs,
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          issues: [
            {
              issue_id: "issue-001",
              stances: [
                {
                  lens_id: "logic",
                  stance: "support",
                  rationale: "The logic lens accepts the issue.",
                  root_hypothesis_position: "accepts",
                  severity_position: "keeps",
                  evidence_refs: ["round1/madeup.findings.yaml#ghost"],
                },
              ],
            },
          ],
          validation: {
            missing_stances: [],
          },
        },
      }),
    ).toThrow(/references unsupported evidence/);
  });

  it("accepts project-relative stance evidence refs exposed in prompt packets", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "issue-stance-evidence-"),
    );
    try {
      const executionPlan = minimalExecutionPlan(projectRoot);
      executionPlan.lens_execution_seats = [
        {
          lens_id: "logic",
          output_path: `${executionPlan.round1_root}/logic.md`,
          sidecar_output_path: `${executionPlan.round1_root}/logic.findings.yaml`,
        },
      ];
      fs.mkdirSync(executionPlan.round1_root, { recursive: true });
      fs.writeFileSync(
        executionPlan.finding_ledger_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "findings:",
          "  - finding_id: finding-001",
          "    lens_id: logic",
          "    source_ref: round1/logic.findings.yaml#logic-candidate-001",
          "    target: mock-target",
          "    evidence_anchor: mock-anchor",
          "    claim: mock finding",
          "    lens_rationale_summary: Fixture lens rationale summary",
          "    proposed_action: none",
          "    affected_purpose: declared review purpose",
          "    failure_condition: mock supported path",
          "    impact: mock finding does not make the declared purpose unsafe",
          "    evidence_refs: [round1/logic.findings.yaml#logic-candidate-001]",
          "    severity: low",
          "    domain_threshold_used: null",
          "    materiality_basis: null",
          "    causal_path: null",
          "validation:",
          "  unaddressable_findings: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.finding_relation_graph_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "relations: []",
          "singleton_findings: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.issue_ledger_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "issues:",
          "  - issue_id: issue-001",
          "    root_cause_hypothesis: mock root",
          "    root_confidence: low",
          "    surface_finding_ids: [finding-001]",
          "    relation_refs: []",
          "    raised_by_lens_ids: [logic]",
          "    issue_statement: mock issue",
          "    proposed_action: none",
          "    affected_purpose: declared review purpose",
          "    failure_condition: mock supported path",
          "    impact: mock issue does not make the declared purpose unsafe",
          "    evidence_refs: [round1/logic.findings.yaml#logic-candidate-001]",
          "    severity: low",
          "    domain_threshold_used: null",
          "    singleton_reason: mock singleton",
          "issue_dependencies: []",
          "validation:",
          "  unclustered_finding_ids: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.issue_stance_matrix_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "issues:",
          "  - issue_id: issue-001",
          "    stances:",
          "      - lens_id: logic",
          "        stance: support",
          "        rationale: mock stance",
          "        root_hypothesis_position: accepts",
          "        severity_position: keeps",
          "        evidence_refs:",
          "          - .onto/review/session/issue-ledger.yaml#issue-001",
          "          - .onto/review/session/finding-ledger.yaml#finding-001",
          "          - .onto/review/session/round1/logic.findings.yaml",
          "validation:",
          "  missing_stances: []",
          "",
        ].join("\n"),
      );

      await expect(
        validateIssueArtifactOnDisk({
          executionPlan,
          projectRoot,
          artifactId: "issue-stance-matrix",
          participatingLensIds: ["logic"],
        }),
      ).resolves.toBeDefined();
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("accepts a participating lens's own finding refs when explaining stance scope", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "issue-stance-own-lens-evidence-"),
    );
    try {
      const executionPlan = minimalExecutionPlan(projectRoot);
      executionPlan.lens_execution_seats = [
        {
          lens_id: "logic",
          output_path: `${executionPlan.round1_root}/logic.md`,
          sidecar_output_path: `${executionPlan.round1_root}/logic.findings.yaml`,
        },
        {
          lens_id: "structure",
          output_path: `${executionPlan.round1_root}/structure.md`,
          sidecar_output_path: `${executionPlan.round1_root}/structure.findings.yaml`,
        },
      ];
      fs.mkdirSync(executionPlan.round1_root, { recursive: true });
      fs.writeFileSync(
        executionPlan.finding_ledger_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "findings:",
          "  - finding_id: finding-001",
          "    lens_id: logic",
          "    source_ref: round1/logic.md#finding-1",
          "    target: mock-target",
          "    evidence_anchor: logic-anchor",
          "    claim: logic finding",
          "    lens_rationale_summary: Logic lens rationale.",
          "    proposed_action: fix logic issue",
          "    affected_purpose: correctness",
          "    failure_condition: supported path",
          "    impact: trust is weakened",
          "    evidence_refs: [round1/logic.md#finding-1]",
          "    severity: medium",
          "    domain_threshold_used: null",
          "    materiality_basis:",
          "      affected_purpose: correctness",
          "      failure_condition: supported path",
          "      impact: trust is weakened",
          "      evidence_refs: [round1/logic.md#finding-1]",
          "    causal_path:",
          "      root_cause_candidate: logic root",
          "      root_cause_step_id: finding-001.cause-001",
          "      steps:",
          "        - cause_id: finding-001.cause-001",
          "          claim: logic root",
          "          relation_to_previous: null",
          "          evidence_refs: [round1/logic.md#finding-1]",
          "  - finding_id: finding-002",
          "    lens_id: structure",
          "    source_ref: round1/structure.md#finding-1",
          "    target: mock-target",
          "    evidence_anchor: structure-anchor",
          "    claim: no structural issue found",
          "    lens_rationale_summary: Structure lens narrows scope.",
          "    proposed_action: no structural action",
          "    affected_purpose: structural completeness",
          "    failure_condition: no structural failure condition",
          "    impact: narrows review scope",
          "    evidence_refs: [round1/structure.md#finding-1]",
          "    severity: info",
          "    domain_threshold_used: null",
          "    materiality_basis: null",
          "    causal_path: null",
          "validation:",
          "  unaddressable_findings: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.finding_relation_graph_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "relations: []",
          "singleton_findings:",
          "  - finding_id: finding-001",
          "    reason: no relation",
          "  - finding_id: finding-002",
          "    reason: no relation",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.issue_ledger_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "issues:",
          "  - issue_id: issue-001",
          "    root_cause_hypothesis: logic root",
          "    root_confidence: medium",
          "    surface_finding_ids: [finding-001]",
          "    relation_refs: []",
          "    raised_by_lens_ids: [logic]",
          "    issue_statement: logic issue",
          "    proposed_action: fix logic issue",
          "    affected_purpose: correctness",
          "    failure_condition: supported path",
          "    impact: trust is weakened",
          "    evidence_refs: [round1/logic.md#finding-1]",
          "    severity: medium",
          "    domain_threshold_used: null",
          "    singleton_reason: no relation",
          "  - issue_id: issue-002",
          "    root_cause_hypothesis: no structural root",
          "    root_confidence: medium",
          "    surface_finding_ids: [finding-002]",
          "    relation_refs: []",
          "    raised_by_lens_ids: [structure]",
          "    issue_statement: no structural issue",
          "    proposed_action: no structural action",
          "    affected_purpose: structural completeness",
          "    failure_condition: no structural failure condition",
          "    impact: narrows review scope",
          "    evidence_refs: [round1/structure.md#finding-1]",
          "    severity: info",
          "    domain_threshold_used: null",
          "    singleton_reason: no relation",
          "issue_dependencies: []",
          "validation:",
          "  unclustered_finding_ids: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.issue_stance_matrix_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "issues:",
          "  - issue_id: issue-001",
          "    stances:",
          "      - lens_id: logic",
          "        stance: support",
          "        rationale: logic supports its own issue",
          "        root_hypothesis_position: accepts",
          "        severity_position: keeps",
          "        evidence_refs: [round1/logic.md#finding-1]",
          "      - lens_id: structure",
          "        stance: not_applicable",
          "        rationale: structure uses its own finding to explain scope",
          "        root_hypothesis_position: not_applicable",
          "        severity_position: not_applicable",
          "        evidence_refs: [round1/structure.md#finding-1]",
          "  - issue_id: issue-002",
          "    stances:",
          "      - lens_id: logic",
          "        stance: not_applicable",
          "        rationale: logic does not judge structural scope",
          "        root_hypothesis_position: not_applicable",
          "        severity_position: not_applicable",
          "        evidence_refs: [round1/logic.md#finding-1]",
          "      - lens_id: structure",
          "        stance: support",
          "        rationale: structure supports its own scope finding",
          "        root_hypothesis_position: accepts",
          "        severity_position: keeps",
          "        evidence_refs: [round1/structure.md#finding-1]",
          "validation:",
          "  missing_stances: []",
          "",
        ].join("\n"),
      );

      await expect(
        validateIssueArtifactOnDisk({
          executionPlan,
          projectRoot,
          artifactId: "issue-stance-matrix",
          participatingLensIds: ["logic", "structure"],
        }),
      ).resolves.toBeDefined();
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("accepts dependency relation graph anchor refs as stance evidence", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "issue-stance-dependency-evidence-"),
    );
    try {
      const executionPlan = minimalExecutionPlan(projectRoot);
      executionPlan.lens_execution_seats = [
        {
          lens_id: "logic",
          output_path: `${executionPlan.round1_root}/logic.md`,
          sidecar_output_path: `${executionPlan.round1_root}/logic.findings.yaml`,
        },
      ];
      fs.mkdirSync(executionPlan.round1_root, { recursive: true });
      fs.writeFileSync(
        executionPlan.finding_ledger_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "findings:",
          "  - finding_id: finding-001",
          "    lens_id: logic",
          "    source_ref: round1/logic.findings.yaml#logic-candidate-001",
          "    target: mock-target-a",
          "    evidence_anchor: mock-anchor-a",
          "    claim: first mock finding",
          "    lens_rationale_summary: Fixture lens rationale summary",
          "    proposed_action: preserve first context",
          "    affected_purpose: declared review purpose",
          "    failure_condition: first bounded condition",
          "    impact: first minor impact",
          "    evidence_refs: [round1/logic.findings.yaml#logic-candidate-001]",
          "    severity: low",
          "    domain_threshold_used: null",
          "    materiality_basis: null",
          "    causal_path: null",
          "  - finding_id: finding-002",
          "    lens_id: logic",
          "    source_ref: round1/logic.findings.yaml#logic-candidate-002",
          "    target: mock-target-b",
          "    evidence_anchor: mock-anchor-b",
          "    claim: second mock finding",
          "    lens_rationale_summary: Fixture lens rationale summary",
          "    proposed_action: preserve second context",
          "    affected_purpose: declared review purpose",
          "    failure_condition: second bounded condition",
          "    impact: second minor impact",
          "    evidence_refs: [round1/logic.findings.yaml#logic-candidate-002]",
          "    severity: low",
          "    domain_threshold_used: null",
          "    materiality_basis: null",
          "    causal_path: null",
          "validation:",
          "  unaddressable_findings: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.finding_relation_graph_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "relations:",
          "  - relation_id: rel-shared",
          "    from_finding_id: finding-001",
          "    to_finding_id: finding-002",
          "    relation: shared_cause_candidate",
          "    root_hypothesis: distinct roots share an intermediate context dependency",
          "    shared_cause:",
          "      cause_claim: both findings depend on shared context",
          "      from_cause_ref: finding-001.cause-001",
          "      to_cause_ref: finding-002.cause-001",
          "    rationale: relation graph recorded a dependency without merging issues",
          "    confidence: medium",
          "singleton_findings: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.issue_ledger_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "issues:",
          "  - issue_id: issue-001",
          "    root_cause_hypothesis: first root",
          "    root_confidence: low",
          "    surface_finding_ids: [finding-001]",
          "    relation_refs: []",
          "    raised_by_lens_ids: [logic]",
          "    issue_statement: first issue",
          "    proposed_action: preserve first context",
          "    affected_purpose: declared review purpose",
          "    failure_condition: first bounded condition",
          "    impact: first minor impact",
          "    evidence_refs: [round1/logic.findings.yaml#logic-candidate-001]",
          "    severity: low",
          "    domain_threshold_used: null",
          "    singleton_reason: kept separate from shared cause",
          "  - issue_id: issue-002",
          "    root_cause_hypothesis: second root",
          "    root_confidence: low",
          "    surface_finding_ids: [finding-002]",
          "    relation_refs: []",
          "    raised_by_lens_ids: [logic]",
          "    issue_statement: second issue",
          "    proposed_action: preserve second context",
          "    affected_purpose: declared review purpose",
          "    failure_condition: second bounded condition",
          "    impact: second minor impact",
          "    evidence_refs: [round1/logic.findings.yaml#logic-candidate-002]",
          "    severity: low",
          "    domain_threshold_used: null",
          "    singleton_reason: kept separate from shared cause",
          "issue_dependencies:",
          "  - dependency_id: dep-001",
          "    dependency_kind: shared_cause_candidate",
          "    issue_ids: [issue-001, issue-002]",
          "    relation_refs: [rel-shared]",
          "    rationale: resolving one issue may affect the other",
          "validation:",
          "  unclustered_finding_ids: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.issue_stance_matrix_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "issues:",
          "  - issue_id: issue-001",
          "    stances:",
          "      - lens_id: logic",
          "        stance: support",
          "        rationale: dependency relation anchor is valid evidence.",
          "        root_hypothesis_position: accepts",
          "        severity_position: keeps",
          "        evidence_refs:",
          "          - .onto/review/session/finding-relation-graph.yaml#rel-shared",
          "  - issue_id: issue-002",
          "    stances:",
          "      - lens_id: logic",
          "        stance: support",
          "        rationale: dependency relation anchor is valid evidence for both endpoints.",
          "        root_hypothesis_position: accepts",
          "        severity_position: keeps",
          "        evidence_refs:",
          "          - finding-relation-graph.yaml#rel-shared",
          "validation:",
          "  missing_stances: []",
          "",
        ].join("\n"),
      );

      await expect(
        validateIssueArtifactOnDisk({
          executionPlan,
          projectRoot,
          artifactId: "issue-stance-matrix",
          participatingLensIds: ["logic"],
        }),
      ).resolves.toBeDefined();
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("accepts incident relation graph anchor refs as stance evidence", async () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "issue-stance-incident-relation-evidence-"),
    );
    try {
      const executionPlan = minimalExecutionPlan(projectRoot);
      executionPlan.lens_execution_seats = [
        {
          lens_id: "logic",
          output_path: `${executionPlan.round1_root}/logic.md`,
          sidecar_output_path: `${executionPlan.round1_root}/logic.findings.yaml`,
        },
      ];
      fs.mkdirSync(executionPlan.round1_root, { recursive: true });
      fs.writeFileSync(
        executionPlan.finding_ledger_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "findings:",
          "  - finding_id: finding-001",
          "    lens_id: logic",
          "    source_ref: round1/logic.findings.yaml#logic-candidate-001",
          "    target: mock-target-a",
          "    evidence_anchor: mock-anchor-a",
          "    claim: root behavior fails",
          "    lens_rationale_summary: Fixture root rationale summary",
          "    proposed_action: fix root behavior",
          "    affected_purpose: declared review purpose",
          "    failure_condition: root bounded condition",
          "    impact: first minor impact",
          "    evidence_refs: [round1/logic.findings.yaml#logic-candidate-001]",
          "    severity: low",
          "    domain_threshold_used: null",
          "    materiality_basis: null",
          "    causal_path: null",
          "  - finding_id: finding-002",
          "    lens_id: logic",
          "    source_ref: round1/logic.findings.yaml#logic-candidate-002",
          "    target: mock-target-b",
          "    evidence_anchor: mock-anchor-b",
          "    claim: downstream behavior inherits the root failure",
          "    lens_rationale_summary: Fixture downstream rationale summary",
          "    proposed_action: fix root behavior",
          "    affected_purpose: declared review purpose",
          "    failure_condition: downstream bounded condition",
          "    impact: second minor impact",
          "    evidence_refs: [round1/logic.findings.yaml#logic-candidate-002]",
          "    severity: low",
          "    domain_threshold_used: null",
          "    materiality_basis: null",
          "    causal_path: null",
          "validation:",
          "  unaddressable_findings: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.finding_relation_graph_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "relations:",
          "  - relation_id: rel-symptom",
          "    from_finding_id: finding-002",
          "    to_finding_id: finding-001",
          "    relation: symptom_of",
          "    root_hypothesis: downstream behavior is a symptom of the root behavior",
          "    shared_cause: null",
          "    rationale: relation graph records an incident symptom relation without creating an issue dependency",
          "    confidence: medium",
          "singleton_findings: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.issue_ledger_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "issues:",
          "  - issue_id: issue-001",
          "    root_cause_hypothesis: root behavior",
          "    root_confidence: low",
          "    surface_finding_ids: [finding-001]",
          "    relation_refs: []",
          "    raised_by_lens_ids: [logic]",
          "    issue_statement: root issue",
          "    proposed_action: fix root behavior",
          "    affected_purpose: declared review purpose",
          "    failure_condition: root bounded condition",
          "    impact: first minor impact",
          "    evidence_refs: [round1/logic.findings.yaml#logic-candidate-001]",
          "    severity: low",
          "    domain_threshold_used: null",
          "    singleton_reason: kept as the root-side issue",
          "  - issue_id: issue-002",
          "    root_cause_hypothesis: downstream symptom",
          "    root_confidence: low",
          "    surface_finding_ids: [finding-002]",
          "    relation_refs: []",
          "    raised_by_lens_ids: [logic]",
          "    issue_statement: downstream symptom issue",
          "    proposed_action: fix root behavior",
          "    affected_purpose: declared review purpose",
          "    failure_condition: downstream bounded condition",
          "    impact: second minor impact",
          "    evidence_refs: [round1/logic.findings.yaml#logic-candidate-002]",
          "    severity: low",
          "    domain_threshold_used: null",
          "    singleton_reason: kept separate because relation is not a same-root merge",
          "issue_dependencies: []",
          "validation:",
          "  unclustered_finding_ids: []",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        executionPlan.issue_stance_matrix_path,
        [
          "schema_version: 1",
          "session_id: session-001",
          "issues:",
          "  - issue_id: issue-001",
          "    stances:",
          "      - lens_id: logic",
          "        stance: support",
          "        rationale: root-side relation endpoint is valid evidence.",
          "        root_hypothesis_position: accepts",
          "        severity_position: keeps",
          "        evidence_refs:",
          "          - finding-relation-graph.yaml#rel-symptom",
          "  - issue_id: issue-002",
          "    stances:",
          "      - lens_id: logic",
          "        stance: support",
          "        rationale: symptom-side relation endpoint is valid evidence.",
          "        root_hypothesis_position: accepts",
          "        severity_position: keeps",
          "        evidence_refs:",
          "          - .onto/review/session/finding-relation-graph.yaml#rel-symptom",
          "validation:",
          "  missing_stances: []",
          "",
        ].join("\n"),
      );

      await expect(
        validateIssueArtifactOnDisk({
          executionPlan,
          projectRoot,
          artifactId: "issue-stance-matrix",
          participatingLensIds: ["logic"],
        }),
      ).resolves.toBeDefined();
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("finding-relation-graph runtime projection", () => {
  const findingLedger = {
    schema_version: 1,
    session_id: "session-001",
    findings: [
      {
        finding_id: "finding-001",
        lens_id: "logic",
        source_ref: "round1/logic.findings.yaml#logic-candidate-001",
        target: "execution-preparation/materialized-input.md",
        evidence_anchor: "execution-preparation/materialized-input.md:12",
        claim: "The runtime contract omits the output authority.",
        lens_rationale_summary: "Fixture lens rationale summary.",
        proposed_action: "Declare the output authority.",
        affected_purpose: "bounded review artifact truth",
        failure_condition: "downstream stages consume ambiguous review output",
        impact: "synthesis may rely on prose instead of artifact truth",
        evidence_refs: ["round1/logic.findings.yaml#logic-candidate-001"],
        severity: "medium",
        domain_threshold_used: null,
        materiality_basis: {
          affected_purpose: "bounded review artifact truth",
          failure_condition: "downstream stages consume ambiguous review output",
          impact: "synthesis may rely on prose instead of artifact truth",
          evidence_refs: ["round1/logic.findings.yaml#logic-candidate-001"],
        },
        causal_path: {
          root_cause_candidate: "output authority is not declared",
          root_cause_step_id: "finding-001.cause-002",
          steps: [
            {
              cause_id: "finding-001.cause-001",
              claim: "The runtime contract omits the output authority.",
              relation_to_previous: null,
              evidence_refs: ["round1/logic.findings.yaml#logic-candidate-001"],
            },
            {
              cause_id: "finding-001.cause-002",
              claim: "The output authority is not declared.",
              relation_to_previous: "causes",
              evidence_refs: ["round1/logic.findings.yaml#logic-candidate-001"],
            },
          ],
          unresolved_beyond_evidence: null,
        },
      },
      {
        finding_id: "finding-002",
        lens_id: "coverage",
        source_ref: "round1/coverage.findings.yaml#coverage-candidate-001",
        target: "execution-preparation/materialized-input.md",
        evidence_anchor: "execution-preparation/materialized-input.md:18",
        claim: "The review target profile does not cover the output authority.",
        lens_rationale_summary: "Fixture lens rationale summary.",
        proposed_action: "Add target profile output authority coverage.",
        affected_purpose: "bounded review artifact truth",
        failure_condition: "coverage checks miss downstream artifact obligations",
        impact: "the same authority gap can escape relation grouping",
        evidence_refs: ["round1/coverage.findings.yaml#coverage-candidate-001"],
        severity: "medium",
        domain_threshold_used: null,
        materiality_basis: {
          affected_purpose: "bounded review artifact truth",
          failure_condition: "coverage checks miss downstream artifact obligations",
          impact: "the same authority gap can escape relation grouping",
          evidence_refs: ["round1/coverage.findings.yaml#coverage-candidate-001"],
        },
        causal_path: {
          root_cause_candidate: "review target profile omits output authority",
          root_cause_step_id: "finding-002.cause-002",
          steps: [
            {
              cause_id: "finding-002.cause-001",
              claim:
                "The review target profile does not cover the output authority.",
              relation_to_previous: null,
              evidence_refs: ["round1/coverage.findings.yaml#coverage-candidate-001"],
            },
            {
              cause_id: "finding-002.cause-002",
              claim: "The output authority is omitted from target profile coverage.",
              relation_to_previous: "causes",
              evidence_refs: ["round1/coverage.findings.yaml#coverage-candidate-001"],
            },
          ],
          unresolved_beyond_evidence: null,
        },
      },
      {
        finding_id: "finding-003",
        lens_id: "conciseness",
        source_ref: "round1/conciseness.findings.yaml#conciseness-candidate-001",
        target: "execution-preparation/materialized-input.md",
        evidence_anchor: "execution-preparation/materialized-input.md:22",
        claim: "The input is verbose in one section.",
        lens_rationale_summary: "Fixture lens rationale summary.",
        proposed_action: "Tighten wording.",
        affected_purpose: "declared review purpose",
        failure_condition:
          "no material failure condition is shown by the current bounded lens evidence",
        impact: "minor readability cost",
        evidence_refs: ["round1/conciseness.findings.yaml#conciseness-candidate-001"],
        severity: "low",
        domain_threshold_used: null,
        materiality_basis: null,
        causal_path: null,
      },
    ],
    validation: {
      unaddressable_findings: [],
    },
  };

  it("renders compact relation input from finding-ledger fields", () => {
    const projection = buildFindingRelationInputProjection({
      projectRoot: "/repo",
      findingLedgerPath: "/repo/.onto/review/session/finding-ledger.yaml",
      findingLedger,
    });
    expect(projection.finding_nodes).toHaveLength(2);
    expect(projection.causal_analysis_finding_ids).toEqual([
      "finding-001",
      "finding-002",
    ]);
    expect(projection.surface_only_finding_ids).toEqual(["finding-003"]);
    expect(projection.finding_nodes[0]).toMatchObject({
      finding_id: "finding-001",
      lens_id: "logic",
      claim: "The runtime contract omits the output authority.",
      causal_path: {
        root_cause_step_id: "finding-001.cause-002",
      },
    });

    const section = renderFindingRelationInputProjectionSection(projection);
    expect(section).toContain("Runtime Finding Relation Input Projection");
    expect(section).toContain("source_artifact_ref: .onto/review/session/finding-ledger.yaml");
    expect(section).toContain("coverage_scope: causal_analysis_finding_ids");
  });

  it("requires every known finding to appear in a relation or singleton", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "finding-relation-graph",
        sessionId: "session-001",
        knownFindingIds: new Set(["finding-001", "finding-002"]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          relations: [],
          singleton_findings: [
            {
              finding_id: "finding-001",
              reason: "No relation accepted.",
            },
          ],
        },
      }),
    ).toThrow(/missing relation or singleton coverage for finding: finding-002/);
  });

  it("rejects singleton rows for findings already covered by accepted relations", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "finding-relation-graph",
        sessionId: "session-001",
        knownFindingIds: new Set(["finding-001", "finding-002"]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          relations: [
            {
              relation_id: "rel-001",
              from_finding_id: "finding-001",
              to_finding_id: "finding-002",
              relation: "same_root_candidate",
              root_hypothesis: "Both findings point to one output authority gap.",
              rationale: "Both findings share target and affected purpose.",
              confidence: "medium",
            },
          ],
          singleton_findings: [
            {
              finding_id: "finding-001",
              reason: "Incorrect singleton.",
            },
          ],
        },
      }),
    ).toThrow(/must not also appear in an accepted relation/);
  });

  it("rejects independent relation rows and requires singleton coverage instead", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "finding-relation-graph",
        sessionId: "session-001",
        knownFindingIds: new Set(["finding-001", "finding-002"]),
        coverageFindingIds: new Set(["finding-001", "finding-002"]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          relations: [
            {
              relation_id: "rel-001",
              from_finding_id: "finding-001",
              to_finding_id: "finding-002",
              relation: "independent",
              root_hypothesis: "No relation accepted.",
              shared_cause: null,
              rationale: "The findings do not share a causal path.",
              confidence: "low",
            },
          ],
          singleton_findings: [],
        },
      }),
    ).toThrow(/unsupported value: independent/);
  });

  it("accepts shared-cause relations only with explicit cause refs", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "finding-relation-graph",
        sessionId: "session-001",
        knownFindingIds: new Set(["finding-001", "finding-002"]),
        coverageFindingIds: new Set(["finding-001", "finding-002"]),
        knownCauseFindingIds: new Map([
          ["finding-001.cause-001", "finding-001"],
          ["finding-001.cause-002", "finding-001"],
          ["finding-002.cause-001", "finding-002"],
          ["finding-002.cause-002", "finding-002"],
        ]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          relations: [
            {
              relation_id: "rel-001",
              from_finding_id: "finding-001",
              to_finding_id: "finding-002",
              relation: "shared_cause_candidate",
              root_hypothesis: "The findings share an intermediate cause.",
              shared_cause: {
                cause_claim: "Both paths depend on the output authority gap.",
                from_cause_ref: "finding-001.cause-002",
                to_cause_ref: "finding-002.cause-001",
              },
              rationale: "The cause refs identify the overlapping causal step.",
              confidence: "medium",
            },
          ],
          singleton_findings: [],
        },
      }),
    ).not.toThrow();
  });
});

describe("issue-stance-matrix runtime projection", () => {
  const findingLedger = {
    schema_version: 1,
    session_id: "session-001",
    findings: [
      {
        finding_id: "finding-001",
        lens_id: "logic",
        source_ref: "round1/logic.findings.yaml#logic-candidate-001",
        target: "execution-plan.yaml",
        evidence_anchor: "execution-plan.yaml:12",
        claim: "The issue artifact path is underspecified.",
        lens_rationale_summary: "Fixture lens rationale summary.",
        proposed_action: "Bind the artifact path.",
        affected_purpose: "review artifact truth",
        failure_condition: "downstream consumers cannot locate the artifact",
        impact: "traceability is weakened",
        evidence_refs: ["round1/logic.findings.yaml#logic-candidate-001"],
        severity: "medium",
        domain_threshold_used: null,
        materiality_basis: {
          affected_purpose: "review artifact truth",
          failure_condition: "downstream consumers cannot locate the artifact",
          impact: "traceability is weakened",
          evidence_refs: ["round1/logic.findings.yaml#logic-candidate-001"],
        },
        causal_path: {
          root_cause_candidate: "artifact path is not bound",
          root_cause_step_id: "finding-001.cause-001",
          steps: [
            {
              cause_id: "finding-001.cause-001",
              claim: "artifact path is not bound",
              relation_to_previous: null,
              evidence_refs: ["round1/logic.findings.yaml#logic-candidate-001"],
            },
          ],
          unresolved_beyond_evidence: null,
        },
      },
      {
        finding_id: "finding-002",
        lens_id: "pragmatics",
        source_ref: "round1/pragmatics.findings.yaml#pragmatics-candidate-001",
        target: "final-output.md",
        evidence_anchor: "final-output.md:4",
        claim: "The output wording is verbose.",
        lens_rationale_summary: "Fixture lens rationale summary.",
        proposed_action: "Tighten wording.",
        affected_purpose: "review readability",
        failure_condition: "reader scans the final review",
        impact: "minor readability cost",
        evidence_refs: ["round1/pragmatics.findings.yaml#pragmatics-candidate-001"],
        severity: "low",
        domain_threshold_used: null,
        materiality_basis: null,
        causal_path: null,
      },
    ],
    validation: {
      unaddressable_findings: [],
    },
  };
  const relationGraph = {
    schema_version: 1,
    session_id: "session-001",
    relations: [],
    singleton_findings: [
      {
        finding_id: "finding-001",
        reason: "No relation accepted.",
      },
    ],
  };
  const issueLedger = {
    schema_version: 1,
    session_id: "session-001",
    issues: [
      {
        issue_id: "issue-001",
        root_cause_hypothesis: "artifact path is not bound",
        root_confidence: "medium",
        surface_finding_ids: ["finding-001"],
        relation_refs: [],
        raised_by_lens_ids: ["logic"],
        issue_statement: "The issue artifact path is underspecified.",
        proposed_action: "Bind the artifact path.",
        affected_purpose: "review artifact truth",
        failure_condition: "downstream consumers cannot locate the artifact",
        impact: "traceability is weakened",
        evidence_refs: ["round1/logic.findings.yaml#logic-candidate-001"],
        severity: "medium",
        domain_threshold_used: null,
        singleton_reason: "No relation accepted.",
      },
    ],
    issue_dependencies: [],
    validation: {
      unclustered_finding_ids: [],
    },
  };

  it("renders compact stance input from issue artifacts and lens ids", () => {
    const projection = buildIssueStanceInputProjection({
      projectRoot: "/repo",
      findingLedgerPath: "/repo/.onto/review/session/finding-ledger.yaml",
      findingRelationGraphPath:
        "/repo/.onto/review/session/finding-relation-graph.yaml",
      issueLedgerPath: "/repo/.onto/review/session/issue-ledger.yaml",
      findingLedger,
      relationGraph,
      issueLedger,
      lensOutputPaths: [
        "/repo/.onto/review/session/round1/logic.findings.yaml",
        "/repo/.onto/review/session/round1/pragmatics.findings.yaml",
      ],
    });

    expect(projection.participating_lens_ids).toEqual(["logic", "pragmatics"]);
    expect(projection.issues[0]).toMatchObject({
      issue_id: "issue-001",
      raised_by_lens_ids: ["logic"],
      surface_finding_ids: ["finding-001"],
      issue_statement: "The issue artifact path is underspecified.",
      proposed_action: "Bind the artifact path.",
      domain_threshold_used: null,
      singleton_reason: "No relation accepted.",
    });
    expect(projection.finding_summaries).toHaveLength(2);
    expect(projection.finding_summaries[0]).toMatchObject({
      finding_id: "finding-001",
      lens_id: "logic",
      assigned_issue_ids: ["issue-001"],
      lens_rationale_summary: "Fixture lens rationale summary.",
    });

    const section = renderIssueStanceInputProjectionSection(projection);
    expect(section).toContain("Runtime Issue Stance Input Projection");
    expect(section).toContain("lens_rationale_summary: Fixture lens rationale summary");
    expect(section).toContain("read_round1_only_for_stance_rationale_gap: true");
  });

  it("includes shared-cause dependency context for stance judgment", () => {
    const projection = buildIssueStanceInputProjection({
      projectRoot: "/repo",
      findingLedgerPath: "/repo/.onto/review/session/finding-ledger.yaml",
      findingRelationGraphPath:
        "/repo/.onto/review/session/finding-relation-graph.yaml",
      issueLedgerPath: "/repo/.onto/review/session/issue-ledger.yaml",
      findingLedger,
      relationGraph: {
        ...relationGraph,
        relations: [
          {
            relation_id: "rel-shared",
            from_finding_id: "finding-001",
            to_finding_id: "finding-002",
            relation: "shared_cause_candidate",
            root_hypothesis: "Distinct issues share an intermediate artifact context gap.",
            shared_cause: {
              cause_claim: "Both issues depend on artifact context being available.",
              from_cause_ref: "finding-001.cause-001",
              to_cause_ref: "finding-002.cause-001",
            },
            rationale: "The fixes are distinct but their context source overlaps.",
            confidence: "medium",
          },
        ],
        singleton_findings: [],
      },
      issueLedger: {
        ...issueLedger,
        issues: [
          ...issueLedger.issues,
          {
            issue_id: "issue-002",
            root_cause_hypothesis: "final output wording is too verbose",
            root_confidence: "low",
            surface_finding_ids: ["finding-002"],
            relation_refs: [],
            raised_by_lens_ids: ["pragmatics"],
            issue_statement: "The output wording is verbose.",
            proposed_action: "Tighten wording.",
            affected_purpose: "review readability",
            failure_condition: "reader scans the final review",
            impact: "minor readability cost",
            evidence_refs: ["round1/pragmatics.findings.yaml#pragmatics-candidate-001"],
            severity: "low",
            domain_threshold_used: null,
            singleton_reason: "No same-root relation accepted.",
          },
        ],
        issue_dependencies: [
          {
            dependency_id: "dep-001",
            dependency_kind: "shared_cause_candidate",
            issue_ids: ["issue-001", "issue-002"],
            relation_refs: ["rel-shared"],
            rationale: "The issues do not merge, but resolving one may affect the other.",
          },
        ],
      },
      lensOutputPaths: [
        "/repo/.onto/review/session/round1/logic.findings.yaml",
        "/repo/.onto/review/session/round1/pragmatics.findings.yaml",
      ],
    });

    expect(projection.relation_summaries[0]).toMatchObject({
      relation_id: "rel-shared",
      shared_cause: {
        cause_claim: "Both issues depend on artifact context being available.",
        from_cause_ref: "finding-001.cause-001",
        to_cause_ref: "finding-002.cause-001",
      },
    });
    expect(projection.issue_dependencies[0]).toMatchObject({
      dependency_id: "dep-001",
      dependency_kind: "shared_cause_candidate",
      issue_ids: ["issue-001", "issue-002"],
      relation_refs: ["rel-shared"],
    });
    expect(renderIssueStanceInputProjectionSection(projection)).toContain(
      "issue_dependencies:",
    );
  });

  it("builds per-lens stance response packets with lens-owned consumer identity", () => {
    const executionPlan = minimalExecutionPlan("/repo");
    const projection = renderIssueStanceInputProjectionSection(
      buildIssueStanceInputProjection({
        projectRoot: "/repo",
        findingLedgerPath: "/repo/.onto/review/session/finding-ledger.yaml",
        findingRelationGraphPath:
          "/repo/.onto/review/session/finding-relation-graph.yaml",
        issueLedgerPath: "/repo/.onto/review/session/issue-ledger.yaml",
        findingLedger,
        relationGraph,
        issueLedger,
        lensOutputPaths: [
          "/repo/.onto/review/session/round1/logic.findings.yaml",
          "/repo/.onto/review/session/round1/pragmatics.findings.yaml",
        ],
      }),
    );
    const prompt = buildIssueStanceResponsePrompt({
      sessionId: "session-001",
      projectRoot: "/repo",
      executionPlan,
      lensId: "logic",
      outputPath: "/repo/.onto/review/session/stance-responses/logic.yaml",
      lensOutputPaths: [
        "/repo/.onto/review/session/round1/logic.findings.yaml",
        "/repo/.onto/review/session/round1/pragmatics.findings.yaml",
      ],
      issueStanceInputProjection: projection,
    });

    expect(prompt).toContain(`consumer_id: ${issueStanceConsumerId("logic")}`);
    expect(prompt).toContain("requested_lens_id: logic");
    expect(prompt).toContain('lens_id: "logic"');
    expect(prompt).toContain("output_path: .onto/review/session/stance-responses/logic.yaml");
    expect(parsePacketBoundaryPolicy(prompt).tools).toBe("required");
    expect(prompt).toContain("repo exploration: denied");
    expect(parsePacketAllowedReadAuthority(prompt).refs).toEqual([
      ".onto/review/session/execution-preparation/review-target-profile.yaml",
      ".onto/review/session/finding-ledger.yaml",
      ".onto/review/session/finding-relation-graph.yaml",
      ".onto/review/session/issue-ledger.yaml",
      ".onto/review/session/round1/logic.findings.yaml",
    ]);
    expect(prompt).not.toContain(".onto/review/session/round1/pragmatics.findings.yaml");
  });

  it("fails loudly when a per-lens stance packet lacks its own Round 1 source ref", () => {
    const executionPlan = minimalExecutionPlan("/repo");

    expect(() =>
      buildIssueStanceResponsePrompt({
        sessionId: "session-001",
        projectRoot: "/repo",
        executionPlan,
        lensId: "logic",
        outputPath: "/repo/.onto/review/session/stance-responses/logic.yaml",
        lensOutputPaths: [
          "/repo/.onto/review/session/round1/pragmatics.findings.yaml",
        ],
        issueStanceInputProjection:
          "## Runtime Issue Stance Input Projection\nschema_version: 1",
      }),
    ).toThrow("issue-stance:logic has no matching Round 1 lens output ref.");
  });

  it("validates per-lens stance response coverage and evidence provenance", () => {
    const knownIssueIds = new Set(["issue-001", "issue-002"]);
    const knownStanceEvidenceRefs = new Map([
      [
        "issue-001",
        new Map([["logic", new Set(["issue-ledger.yaml#issue-001"])]]),
      ],
      [
        "issue-002",
        new Map([["logic", new Set(["issue-ledger.yaml#issue-002"])]]),
      ],
    ]);
    expect(() =>
      validateIssueStanceResponseObject({
        sessionId: "session-001",
        lensId: "logic",
        participatingLensIds: ["logic"],
        knownIssueIds,
        knownStanceEvidenceRefs,
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          lens_id: "logic",
          stances: [
            {
              issue_id: "issue-001",
              stance: "support",
              rationale: "The lens accepts this issue.",
              root_hypothesis_position: "accepts",
              severity_position: "keeps",
              evidence_refs: ["issue-ledger.yaml#issue-001"],
            },
            {
              issue_id: "issue-002",
              stance: "narrow",
              rationale: "The lens narrows the second issue.",
              root_hypothesis_position: "narrows",
              severity_position: "keeps",
              evidence_refs: ["issue-ledger.yaml#issue-002"],
            },
          ],
          validation: {
            missing_issues: [],
          },
        },
      }),
    ).not.toThrow();
    expect(() =>
      validateIssueStanceResponseObject({
        sessionId: "session-001",
        lensId: "logic",
        participatingLensIds: ["logic"],
        knownIssueIds,
        knownStanceEvidenceRefs,
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          lens_id: "logic",
          stances: [
            {
              issue_id: "issue-001",
              stance: "support",
              rationale: "The lens accepts this issue.",
              root_hypothesis_position: "accepts",
              severity_position: "keeps",
              evidence_refs: ["round1/madeup.md#ghost"],
            },
          ],
          validation: {
            missing_issues: [],
          },
        },
      }),
    ).toThrow(/unsupported evidence/);
  });

  it("projects material conflict candidates for deliberation planning", () => {
    const projection = buildDeliberationPlanInputProjection({
      projectRoot: "/repo",
      findingRelationGraphPath:
        "/repo/.onto/review/session/finding-relation-graph.yaml",
      issueLedgerPath: "/repo/.onto/review/session/issue-ledger.yaml",
      issueStanceMatrixPath: "/repo/.onto/review/session/issue-stance-matrix.yaml",
      relationGraph,
      issueLedger,
      issueStanceMatrix: {
        schema_version: 1,
        session_id: "session-001",
        issues: [
          {
            issue_id: "issue-001",
            stances: [
              {
                lens_id: "logic",
                stance: "support",
                rationale: "Logic accepts the root.",
                root_hypothesis_position: "accepts",
                severity_position: "keeps",
                evidence_refs: ["issue-ledger.yaml#issue-001"],
              },
              {
                lens_id: "pragmatics",
                stance: "alternative_root",
                rationale: "Pragmatics sees a different root.",
                root_hypothesis_position: "replaces",
                severity_position: "keeps",
                evidence_refs: ["issue-ledger.yaml#issue-001"],
              },
            ],
          },
        ],
        validation: {
          missing_stances: [],
        },
      },
    });

    expect(projection.issues[0]).toMatchObject({
      issue_id: "issue-001",
      material_issue: true,
      runtime_deliberation_candidate: true,
      suggested_participant_lens_ids: ["logic", "pragmatics"],
      suggested_source_stance_refs: [
        "issue-stance-matrix.yaml#stances.issue-001.logic",
        "issue-stance-matrix.yaml#stances.issue-001.pragmatics",
      ],
    });
    expect(projection.issues[0]?.runtime_conflict_type_hints).toEqual(
      expect.arrayContaining(["root_hypothesis", "stance_conflict"]),
    );

    const section = renderDeliberationPlanInputProjectionSection(projection);
    expect(section).toContain("Runtime Deliberation Plan Input Projection");
    expect(section).toContain("runtime_candidate_is_not_final: true");
  });

  it("marks non-material consistent issues as skipped candidates", () => {
    const projection = buildDeliberationPlanInputProjection({
      projectRoot: "/repo",
      findingRelationGraphPath:
        "/repo/.onto/review/session/finding-relation-graph.yaml",
      issueLedgerPath: "/repo/.onto/review/session/issue-ledger.yaml",
      issueStanceMatrixPath: "/repo/.onto/review/session/issue-stance-matrix.yaml",
      relationGraph,
      issueLedger: {
        ...issueLedger,
        issues: [
          {
            ...issueLedger.issues[0],
            severity: "low",
          },
        ],
      },
      issueStanceMatrix: {
        schema_version: 1,
        session_id: "session-001",
        issues: [
          {
            issue_id: "issue-001",
            stances: [
              {
                lens_id: "logic",
                stance: "support",
                rationale: "Logic accepts the low-severity issue.",
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
      },
    });

    expect(projection.issues[0]).toMatchObject({
      material_issue: false,
      runtime_deliberation_candidate: false,
      skip_candidate_reason_code: "non_material_issue",
    });
  });

  it("validates canonical deliberation-plan shape and stance refs", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "deliberation-plan",
        sessionId: "session-001",
        participatingLensIds: ["logic", "pragmatics"],
        knownIssueIds: new Set(["issue-001", "issue-002"]),
        knownIssueSeverities: new Map([
          ["issue-001", "medium"],
          ["issue-002", "low"],
        ]),
        knownIssueRaisedLensIds: new Map([
          ["issue-001", new Set(["logic"])],
          ["issue-002", new Set(["pragmatics"])],
        ]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          planned_issues: [
            {
              issue_id: "issue-001",
              priority: 10,
              conflict_type: "root_hypothesis",
              participating_lens_ids: ["logic", "pragmatics"],
              source_stance_refs: [
                "issue-stance-matrix.yaml#stances.issue-001.logic",
                "issue-stance-matrix.yaml#stances.issue-001.pragmatics",
              ],
              conflict_summary: "The lenses disagree on the root.",
              resolution_question: "Which root should be carried forward?",
            },
          ],
          skipped_issues: [
            {
              issue_id: "issue-002",
              reason_code: "non_material_issue",
              reason: "The issue is low severity.",
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it("rejects non-material planned issues and old skipped shape", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "deliberation-plan",
        sessionId: "session-001",
        participatingLensIds: ["logic"],
        knownIssueIds: new Set(["issue-001"]),
        knownIssueSeverities: new Map([["issue-001", "low"]]),
        knownIssueRaisedLensIds: new Map([["issue-001", new Set(["logic"])]]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          planned_issues: [
            {
              issue_id: "issue-001",
              priority: 10,
              conflict_type: "root_hypothesis",
              participating_lens_ids: ["logic"],
              source_stance_refs: [
                "issue-stance-matrix.yaml#stances.issue-001.logic",
              ],
              conflict_summary: "Low severity should not plan deliberation.",
              resolution_question: "Should this be material?",
            },
          ],
          skipped_issues: [],
        },
      }),
    ).toThrow(/must reference a material-severity issue candidate/);

    expect(() =>
      validateIssueArtifactObject({
        artifactId: "deliberation-plan",
        sessionId: "session-001",
        knownIssueIds: new Set(["issue-001"]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          planned_issues: [],
          skipped_issues: [
            {
              issue_id: "issue-001",
              reason: "old shape lacks reason_code",
            },
          ],
        },
      }),
    ).toThrow(/reason_code/);
  });
});

describe("problem-framing runtime projection", () => {
  const issueLedger = {
    schema_version: 1,
    session_id: "session-001",
    issues: [
      {
        issue_id: "issue-001",
        root_cause_hypothesis: "artifact truth is underspecified",
        root_confidence: "medium",
        surface_finding_ids: ["finding-001", "finding-002"],
        relation_refs: ["rel-001"],
        raised_by_lens_ids: ["logic", "coverage"],
        issue_statement: "Downstream consumers cannot tell which artifact is authoritative.",
        proposed_action: "Declare the durable artifact authority.",
        affected_purpose: "review artifact truth",
        failure_condition: "a downstream stage consumes review output",
        impact: "the review can look successful while using the wrong source",
        evidence_refs: ["finding-ledger.yaml#finding-001"],
        severity: "medium",
        domain_threshold_used: null,
        singleton_reason: null,
      },
    ],
    issue_dependencies: [],
    validation: {
      unclustered_finding_ids: [],
    },
  };
  const issueStanceMatrix = {
    schema_version: 1,
    session_id: "session-001",
    issues: [
      {
        issue_id: "issue-001",
        stances: [
          {
            lens_id: "logic",
            stance: "support",
            rationale: "Logic accepts the root hypothesis.",
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
  const deliberationPlan = {
    schema_version: 1,
    session_id: "session-001",
    planned_issues: [
      {
        issue_id: "issue-001",
        priority: 10,
        conflict_type: "root_hypothesis",
        participating_lens_ids: ["logic"],
        source_stance_refs: ["issue-stance-matrix.yaml#stances.issue-001.logic"],
        conflict_summary: "The root needs confirmation.",
        resolution_question: "Which artifact is authoritative?",
      },
    ],
    skipped_issues: [],
  };
  const deliberationResolution = {
    schema_version: 1,
    session_id: "session-001",
    issues: [
      {
        issue_id: "issue-001",
        status: "resolved",
        final_root_cause: "artifact authority is not declared",
        final_claim: "Declare review-record as the durable artifact truth.",
        surface_finding_ids: ["finding-001", "finding-002"],
        accepted_by_lens_ids: ["logic"],
        remaining_disagreement_lens_ids: [],
        reason: "The stance evidence converges.",
        required_follow_up_evidence: [],
      },
    ],
    validation: {
      missing_issue_ids: [],
    },
  };
  const reviewTargetProfile = {
    target_scope_kind: "session",
    target_input_kind: "path",
    target_material_kind: "code",
    requested_target: "src/core-runtime",
    review_intent_summary: "Improve review runtime artifact truth.",
    artifact_roles: [{ path: "review-record.yaml", role: "primary" }],
    domain: "software-engineering",
    closure_level: "implementation",
    review_goal: ["find material review pipeline issues"],
    closure_obligation_policy: ["must close material issues before release"],
    material_profile: {
      target_material_kind: "code",
      target_material_kind_candidates: ["code"],
      support_status: "supported",
      unsupported_reason: null,
    },
  };

  it("projects compact input and runtime submit context for classifications", () => {
    const projection = buildProblemFramingInputProjection({
      projectRoot: "/repo",
      issueLedgerPath: "/repo/.onto/review/session/issue-ledger.yaml",
      issueStanceMatrixPath: "/repo/.onto/review/session/issue-stance-matrix.yaml",
      deliberationPlanPath: "/repo/.onto/review/session/deliberation-plan.yaml",
      deliberationResolutionPath:
        "/repo/.onto/review/session/deliberation-resolution.yaml",
      reviewTargetProfilePath:
        "/repo/.onto/review/session/execution-preparation/review-target-profile.yaml",
      problemFramingProfileRef:
        ".onto/domains/software-engineering/problem_framing_profile.md",
      issueLedger,
      issueStanceMatrix,
      deliberationPlan,
      deliberationResolution,
      reviewTargetProfile,
      domainProfileText: [
        "## Domain Axes",
        "",
        "### implementation_surface",
        "",
        "Required when an issue affects a concrete software artifact.",
        "",
        "| Value | Meaning |",
        "|---|---|",
        "| `review_runtime` | review process, prompts, artifacts, runner |",
        "",
        "## Rules",
        "",
        "1. `review_runtime` applies to review prompts and artifacts.",
      ].join("\n"),
    });

    expect(projection.classification_context).toMatchObject({
      session_domain: "software-engineering",
      domain_profile_status: "applied",
    });
    expect(projection.issue_surface_finding_ids).toEqual({
      "issue-001": ["finding-001", "finding-002"],
    });
    expect(projection.domain_axis_catalog.axes[0]).toMatchObject({
      axis_name: "implementation_surface",
      values: [
        {
          value: "review_runtime",
          meaning: "review process, prompts, artifacts, runner",
        },
      ],
    });
    expect(projection.domain_axis_catalog.rules).toEqual([
      "`review_runtime` applies to review prompts and artifacts.",
    ]);
    expect(projection.issues[0]).toMatchObject({
      issue_id: "issue-001",
      deliberation_plan_entry: {
        issue_id: "issue-001",
        conflict_type: "root_hypothesis",
      },
      deliberation_resolution: {
        issue_id: "issue-001",
        status: "resolved",
      },
    });

    const section = renderProblemFramingInputProjectionSection(projection);
    expect(section).toContain("Runtime Problem Framing Input Projection");
    expect(section).toContain("Runtime Problem Framing Submit Context");
    expect(section).toContain("runtime_fills_related_surface_finding_ids: true");
    expect(section).toContain("issue_surface_finding_ids:");

    const prompt = buildIssueArtifactPrompt({
      artifactId: "problem-framing",
      sessionId: "session-001",
      projectRoot: "/repo",
      outputPath: "/repo/.onto/review/session/problem-framing.yaml",
      lensOutputPaths: ["/repo/.onto/review/session/round1/logic.md"],
      deliberationResponsePaths: [
        "/repo/.onto/review/session/deliberation/responses/issue-001/logic.yaml",
      ],
      deliberationOutputPath:
        "/repo/.onto/review/session/deliberation-resolution.yaml",
      problemFramingProfileRef:
        ".onto/domains/software-engineering/problem_framing_profile.md",
      problemFramingInputProjection: section,
      executionPlan: minimalExecutionPlan("/repo"),
    });
    expect(prompt).toContain("Submit only `classifications`");
    expect(prompt).toContain("Do not submit `classification_context`");
    expect(prompt).toContain("Runtime Problem Framing Submit Context");
    expect(prompt).not.toContain(".onto/review/session/round1/logic.md");
    expect(prompt).not.toContain("deliberation/responses/issue-001/logic.yaml");
    const readRefs = parsePacketAllowedReadAuthority(prompt).refs;
    expect(readRefs).toHaveLength(5);
    expect(readRefs).toEqual(expect.arrayContaining([
      ".onto/review/session/execution-preparation/review-target-profile.yaml",
      ".onto/review/session/issue-ledger.yaml",
      ".onto/review/session/issue-stance-matrix.yaml",
      ".onto/review/session/deliberation-plan.yaml",
      ".onto/review/session/deliberation-resolution.yaml",
    ]));
  });

  it("validates related surface finding ids against issue-ledger authority", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "problem-framing",
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          classification_context: {
            common_spine_version: 1,
            session_domain: "none",
            domain_profile_ref: "",
            domain_profile_doc_type: "custom:problem_framing_profile",
            domain_profile_status: "not_requested",
          },
          classifications: [
            {
              issue_id: "issue-001",
              problem_definition: "artifact truth is underspecified",
              issue_role: "root_cause",
              judgment_state: "observed",
              impact_kind: "governance_value",
              timing_class: "next_step_blocker",
              closure_class: "fix_now",
              closure_obligation: "must_close_before_next_stage",
              domain_axes: {},
              rationale: "The issue weakens durable review artifact truth.",
              related_surface_finding_ids: ["finding-001"],
            },
          ],
        },
        sessionId: "session-001",
        knownIssueIds: new Set(["issue-001"]),
        knownIssueSurfaceFindingIds: new Map([
          ["issue-001", new Set(["finding-001", "finding-002"])],
        ]),
      }),
    ).toThrow(/missing required value: finding-002/);
  });

  it("rejects unknown problem-framing classification row fields", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "problem-framing",
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          classification_context: {
            common_spine_version: 1,
            session_domain: "none",
            domain_profile_ref: "",
            domain_profile_doc_type: "custom:problem_framing_profile",
            domain_profile_status: "not_requested",
          },
          classifications: [
            {
              issue_id: "issue-001",
              problem_definition: "artifact truth is underspecified",
              issue_role: "root_cause",
              judgment_state: "observed",
              impact_kind: "governance_value",
              timing_class: "next_step_blocker",
              closure_class: "fix_now",
              closure_obligation: "must_close_before_next_stage",
              domain_axes: {},
              rationale: "The issue weakens durable review artifact truth.",
              related_surface_finding_ids: ["finding-001"],
              classification_context: { session_domain: "none" },
            },
          ],
        },
        sessionId: "session-001",
        knownIssueIds: new Set(["issue-001"]),
        knownIssueSurfaceFindingIds: new Map([
          ["issue-001", new Set(["finding-001"])],
        ]),
      }),
    ).toThrow(/unsupported field: classification_context/);
  });

  it("validates classification context and domain axes against source truth", () => {
    const parsed = {
      schema_version: 1,
      session_id: "session-001",
      classification_context: {
        common_spine_version: 1,
        session_domain: "software-engineering",
        domain_profile_ref:
          ".onto/domains/software-engineering/problem_framing_profile.md",
        domain_profile_doc_type: "custom:problem_framing_profile",
        domain_profile_status: "applied",
      },
      classifications: [
        {
          issue_id: "issue-001",
          problem_definition: "artifact truth is underspecified",
          issue_role: "root_cause",
          judgment_state: "observed",
          impact_kind: "governance_value",
          timing_class: "next_step_blocker",
          closure_class: "fix_now",
          closure_obligation: "must_close_before_next_stage",
          domain_axes: {
            implementation_surface: "invented_surface",
          },
          rationale: "The issue weakens durable review artifact truth.",
          related_surface_finding_ids: ["finding-001"],
        },
      ],
    };

    expect(() =>
      validateIssueArtifactObject({
        artifactId: "problem-framing",
        parsed,
        sessionId: "session-001",
        knownIssueIds: new Set(["issue-001"]),
        knownIssueSurfaceFindingIds: new Map([
          ["issue-001", new Set(["finding-001"])],
        ]),
        expectedProblemFramingContext: {
          common_spine_version: 1,
          session_domain: "software-engineering",
          domain_profile_ref:
            ".onto/domains/software-engineering/problem_framing_profile.md",
          domain_profile_doc_type: "custom:problem_framing_profile",
          domain_profile_status: "applied",
        },
        knownDomainAxisValues: new Map([
          ["implementation_surface", new Set(["review_runtime"])],
        ]),
      }),
    ).toThrow(/unsupported profile value: invented_surface/);

    expect(() =>
      validateIssueArtifactObject({
        artifactId: "problem-framing",
        parsed: {
          ...parsed,
          classification_context: {
            ...parsed.classification_context,
            session_domain: "none",
          },
          classifications: [
            {
              ...parsed.classifications[0],
              domain_axes: {
                implementation_surface: "review_runtime",
              },
            },
          ],
        },
        sessionId: "session-001",
        knownIssueIds: new Set(["issue-001"]),
        knownIssueSurfaceFindingIds: new Map([
          ["issue-001", new Set(["finding-001"])],
        ]),
        expectedProblemFramingContext: {
          common_spine_version: 1,
          session_domain: "software-engineering",
          domain_profile_ref:
            ".onto/domains/software-engineering/problem_framing_profile.md",
          domain_profile_doc_type: "custom:problem_framing_profile",
          domain_profile_status: "applied",
        },
        knownDomainAxisValues: new Map([
          ["implementation_surface", new Set(["review_runtime"])],
        ]),
      }),
    ).toThrow(/classification_context.session_domain must match source truth/);
  });
});

describe("issue-ledger dependency validation", () => {
  const knownRelationIds = new Set(["rel-shared"]);
  const knownRelationKinds = new Map([["rel-shared", "shared_cause_candidate"]]);
  const knownRelationFacts = new Map([
    [
      "rel-shared",
      {
        relation: "shared_cause_candidate",
        from_finding_id: "finding-001",
        to_finding_id: "finding-002",
      },
    ],
  ]);
  const sameRootRelationIds = new Set(["rel-same"]);
  const sameRootRelationKinds = new Map([["rel-same", "same_root_candidate"]]);
  const sameRootRelationFacts = new Map([
    [
      "rel-same",
      {
        relation: "same_root_candidate",
        from_finding_id: "finding-001",
        to_finding_id: "finding-002",
      },
    ],
  ]);
  const knownFindingFacts = new Map([
    [
      "finding-001",
      {
        lens_id: "logic",
        evidence_refs: new Set([
          "round1/logic.md#finding-001",
          "round1/logic.md#finding-1",
        ]),
      },
    ],
    [
      "finding-002",
      {
        lens_id: "logic",
        evidence_refs: new Set([
          "round1/logic.md#finding-002",
          "round1/logic.md#finding-2",
        ]),
      },
    ],
  ]);

  function issue(findingId: string, issueId: string) {
    return {
      issue_id: issueId,
      root_cause_hypothesis: `${issueId} root`,
      root_confidence: "medium",
      surface_finding_ids: [findingId],
      relation_refs: [],
      raised_by_lens_ids: ["logic"],
      issue_statement: `${issueId} statement`,
      proposed_action: "fix root cause",
      affected_purpose: "declared purpose",
      failure_condition: "bounded failure path",
      impact: "declared purpose is weakened",
      evidence_refs: [`round1/logic.md#${findingId}`],
      severity: "medium",
      domain_threshold_used: null,
      singleton_reason: null,
    };
  }

  function validIssueLedger() {
    return {
      schema_version: 1,
      session_id: "session-001",
      issues: [
        issue("finding-001", "issue-001"),
        issue("finding-002", "issue-002"),
      ],
      issue_dependencies: [
        {
          dependency_id: "dep-001",
          dependency_kind: "shared_cause_candidate",
          issue_ids: ["issue-001", "issue-002"],
          relation_refs: ["rel-shared"],
          rationale: "Distinct roots share an intermediate cause.",
        },
      ],
      validation: {
        unclustered_finding_ids: [],
      },
    };
  }

  const validationContext = {
    artifactId: "issue-ledger" as const,
    sessionId: "session-001",
    knownFindingIds: new Set(["finding-001", "finding-002"]),
    knownFindingFacts,
    knownRelationIds,
    knownRelationKinds,
    knownRelationFacts,
    requiredIssueFindingIds: new Set(["finding-001", "finding-002"]),
  };

  it("preserves shared-cause relations as cross-issue dependencies", () => {
    expect(() =>
      validateIssueArtifactObject({
        ...validationContext,
        parsed: validIssueLedger(),
      }),
    ).not.toThrow();
  });

  it("rejects merging findings connected only by shared-cause relation", () => {
    const ledger = validIssueLedger();
    ledger.issues = [
      {
        ...issue("finding-001", "issue-001"),
        surface_finding_ids: ["finding-001", "finding-002"],
      },
    ];
    ledger.issue_dependencies = [];

    expect(() =>
      validateIssueArtifactObject({
        ...validationContext,
        parsed: ledger,
      }),
    ).toThrow(/must not merge findings connected only by shared_cause_candidate/);
  });

  it("accepts merging findings when same-root relation refs support the issue", () => {
    const ledger = validIssueLedger();
    ledger.issues = [
      {
        ...issue("finding-001", "issue-001"),
        surface_finding_ids: ["finding-001", "finding-002"],
        relation_refs: ["rel-same"],
      },
    ];
    ledger.issue_dependencies = [];

    expect(() =>
      validateIssueArtifactObject({
        ...validationContext,
        knownRelationIds: sameRootRelationIds,
        knownRelationKinds: sameRootRelationKinds,
        knownRelationFacts: sameRootRelationFacts,
        parsed: ledger,
      }),
    ).not.toThrow();
  });

  it("rejects merging relation-graph singleton findings without same-root support", () => {
    const ledger = validIssueLedger();
    ledger.issues = [
      {
        ...issue("finding-001", "issue-001"),
        surface_finding_ids: ["finding-001", "finding-002"],
      },
    ];
    ledger.issue_dependencies = [];

    expect(() =>
      validateIssueArtifactObject({
        artifactId: "issue-ledger",
        sessionId: "session-001",
        knownFindingIds: new Set(["finding-001", "finding-002"]),
        knownRelationIds: new Set<string>(),
        knownRelationKinds: new Map<string, string>(),
        knownRelationFacts: new Map<
          string,
          { relation: string; from_finding_id: string; to_finding_id: string }
        >(),
        requiredIssueFindingIds: new Set(["finding-001", "finding-002"]),
        parsed: ledger,
      }),
    ).toThrow(/must be connected by same_root_candidate relation_refs/);
  });

  it("rejects missing dependency rows for cross-issue shared-cause relations", () => {
    const ledger = validIssueLedger();
    ledger.issue_dependencies = [];

    expect(() =>
      validateIssueArtifactObject({
        ...validationContext,
        parsed: ledger,
      }),
    ).toThrow(/must preserve shared_cause_candidate relation rel-shared/);
  });

  it("rejects shared-cause relations whose endpoint findings are omitted from issues", () => {
    const ledger = validIssueLedger();
    ledger.issues = [issue("finding-001", "issue-001")];
    ledger.issue_dependencies = [];

    expect(() =>
      validateIssueArtifactObject({
        ...validationContext,
        requiredIssueFindingIds: new Set<string>(),
        parsed: ledger,
      }),
    ).toThrow(/must assign both findings for shared_cause_candidate relation rel-shared/);
  });

  it("rejects omitting a relation-graph singleton finding from issue assignments", () => {
    const ledger = validIssueLedger();
    ledger.issues = [issue("finding-001", "issue-001")];
    ledger.issue_dependencies = [];

    expect(() =>
      validateIssueArtifactObject({
        artifactId: "issue-ledger",
        sessionId: "session-001",
        knownFindingIds: new Set(["finding-001", "finding-002"]),
        knownRelationIds: new Set<string>(),
        knownRelationKinds: new Map<string, string>(),
        knownRelationFacts: new Map<
          string,
          { relation: string; from_finding_id: string; to_finding_id: string }
        >(),
        requiredIssueFindingIds: new Set(["finding-001", "finding-002"]),
        parsed: ledger,
      }),
    ).toThrow(/relation-graph covered finding/);
  });

  it("rejects issue evidence refs that are absent from assigned finding provenance", () => {
    const ledger = validIssueLedger();
    ledger.issues[0]!.evidence_refs = ["round1/madeup.md#ghost"];

    expect(() =>
      validateIssueArtifactObject({
        ...validationContext,
        parsed: ledger,
      }),
    ).toThrow(/evidence_refs must come from assigned finding-ledger refs/);
  });

  it("rejects raised_by_lens_ids that do not match assigned finding lenses", () => {
    const ledger = validIssueLedger();
    ledger.issues[0]!.raised_by_lens_ids = ["coverage"];

    expect(() =>
      validateIssueArtifactObject({
        ...validationContext,
        parsed: ledger,
      }),
    ).toThrow(/raised_by_lens_ids/);
  });
});

describe("buildIssueArtifactPrompt — boundary read authority", () => {
  it("declares tools required and opens only issue-ledger inputs", () => {
    const projectRoot = "/repo";
    const executionPlan = minimalExecutionPlan(projectRoot);
    const lensOutputPaths = [
      "/repo/.onto/review/session/round1/logic.md",
      "/repo/.onto/review/session/round1/pragmatics.md",
    ];
    const prompt = buildIssueArtifactPrompt({
      artifactId: "issue-ledger",
      sessionId: "session-001",
      projectRoot,
      outputPath: "/repo/.onto/review/session/issue-ledger.yaml",
      lensOutputPaths,
      executionPlan,
    });

    expect(parsePacketBoundaryPolicy(prompt).tools).toBe("required");
    const readAuthority = parsePacketAllowedReadAuthority(prompt);
    expect(readAuthority.declared).toBe(true);
    expect(readAuthority.malformed).toBe(false);
    expect(readAuthority.refs).toEqual([
      ".onto/review/session/execution-preparation/review-target-profile.yaml",
      ".onto/review/session/finding-ledger.yaml",
      ".onto/review/session/finding-relation-graph.yaml",
    ]);
    expect(readAuthority.refs).not.toContain(".onto/review/session/issue-ledger.yaml");
    expect(readAuthority.refs).not.toContain(".onto/review/session/round1/logic.md");
    expect(prompt).not.toContain(".onto/review/session/round1/logic.md");
    expect(prompt).toContain(
      "Use only the prior issue artifacts and review target profile available in this unit.",
    );
  });

  it("opens compact relation inputs plus bounded supplemental source reads for finding-relation-graph", () => {
    const projectRoot = "/repo";
    const executionPlan = minimalExecutionPlan(projectRoot);
    const lensOutputPaths = [
      "/repo/.onto/review/session/round1/logic.findings.yaml",
      "/repo/.onto/review/session/round1/coverage.findings.yaml",
    ];
    const prompt = buildIssueArtifactPrompt({
      artifactId: "finding-relation-graph",
      sessionId: "session-001",
      projectRoot,
      outputPath: "/repo/.onto/review/session/finding-relation-graph.yaml",
      lensOutputPaths,
      findingRelationInputProjection:
        "## Runtime Finding Relation Input Projection\nprojection-body",
      executionPlan,
    });

    const readAuthority = parsePacketAllowedReadAuthority(prompt);
    expect(readAuthority.declared).toBe(true);
    expect(readAuthority.refs).toEqual([
      ".onto/review/session/execution-preparation/review-target-profile.yaml",
      ".onto/review/session/finding-ledger.yaml",
      ".onto/review/session/round1/coverage.findings.yaml",
      ".onto/review/session/round1/logic.findings.yaml",
    ]);
    expect(prompt).toContain("projection-body");
    expect(prompt).toContain("Emit accepted semantic relations only");
    expect(prompt).toContain("Read Round 1 source refs only when");
    expect(prompt).not.toContain("or independence");
    expect(prompt).not.toContain("- independent");
  });

  it("embeds compact stance inputs while keeping bounded lens refs for issue-stance-matrix", () => {
    const projectRoot = "/repo";
    const executionPlan = minimalExecutionPlan(projectRoot);
    const prompt = buildIssueArtifactPrompt({
      artifactId: "issue-stance-matrix",
      sessionId: "session-001",
      projectRoot,
      outputPath: "/repo/.onto/review/session/issue-stance-matrix.yaml",
      lensOutputPaths: [
        "/repo/.onto/review/session/round1/logic.findings.yaml",
        "/repo/.onto/review/session/round1/pragmatics.findings.yaml",
      ],
      issueStanceInputProjection:
        "## Runtime Issue Stance Input Projection\nstance-projection-body",
      executionPlan,
    });

    const readAuthority = parsePacketAllowedReadAuthority(prompt);
    expect(readAuthority.declared).toBe(true);
    expect(readAuthority.refs).toEqual([
      ".onto/review/session/execution-preparation/review-target-profile.yaml",
      ".onto/review/session/finding-ledger.yaml",
      ".onto/review/session/finding-relation-graph.yaml",
      ".onto/review/session/issue-ledger.yaml",
      ".onto/review/session/round1/logic.findings.yaml",
      ".onto/review/session/round1/pragmatics.findings.yaml",
    ]);
    expect(prompt).toContain("stance-projection-body");
    expect(prompt).toContain("Use the runtime issue stance input projection first.");
    expect(prompt).toContain("Read Round 1 source refs only when");
  });

  it("embeds deliberation-plan projection without reopening lens output refs", () => {
    const projectRoot = "/repo";
    const executionPlan = minimalExecutionPlan(projectRoot);
    const prompt = buildIssueArtifactPrompt({
      artifactId: "deliberation-plan",
      sessionId: "session-001",
      projectRoot,
      outputPath: "/repo/.onto/review/session/deliberation-plan.yaml",
      lensOutputPaths: [
        "/repo/.onto/review/session/round1/logic.findings.yaml",
        "/repo/.onto/review/session/round1/pragmatics.findings.yaml",
      ],
      deliberationPlanInputProjection:
        "## Runtime Deliberation Plan Input Projection\ndeliberation-projection-body",
      executionPlan,
    });

    const readAuthority = parsePacketAllowedReadAuthority(prompt);
    expect(readAuthority.declared).toBe(true);
    expect(readAuthority.refs).toEqual([
      ".onto/review/session/execution-preparation/review-target-profile.yaml",
      ".onto/review/session/finding-ledger.yaml",
      ".onto/review/session/finding-relation-graph.yaml",
      ".onto/review/session/issue-ledger.yaml",
      ".onto/review/session/issue-stance-matrix.yaml",
    ]);
    expect(prompt).toContain("deliberation-projection-body");
    expect(prompt).toContain("Allowed conflict_type values");
    expect(prompt).toContain("source_stance_refs");
    expect(prompt).not.toContain(".onto/review/session/round1/logic.findings.yaml");
  });

  it("narrows problem-framing read refs to projected issue artifacts", () => {
    const projectRoot = "/repo";
    const executionPlan = minimalExecutionPlan(projectRoot);
    const refs = issueArtifactAllowedReadRefs({
      artifactId: "problem-framing",
      projectRoot,
      executionPlan,
      lensOutputPaths: ["/repo/.onto/review/session/round1/logic.md"],
      deliberationOutputPath:
        "/repo/.onto/review/session/deliberation-resolution.yaml",
      deliberationResponsePaths: [
        "/repo/.onto/review/session/deliberation/responses/issue-001/logic.yaml",
      ],
      problemFramingProfileRef:
        ".onto/domains/software-engineering/problem_framing_profile.md",
    });

    expect(refs).toEqual([
      "/repo/.onto/review/session/execution-preparation/review-target-profile.yaml",
      "/repo/.onto/review/session/issue-ledger.yaml",
      "/repo/.onto/review/session/issue-stance-matrix.yaml",
      "/repo/.onto/review/session/deliberation-plan.yaml",
      "/repo/.onto/review/session/deliberation-resolution.yaml",
    ]);
    expect(refs).toContain(
      "/repo/.onto/review/session/deliberation-resolution.yaml",
    );
    expect(refs).not.toContain(
      "/repo/.onto/review/session/deliberation/responses/issue-001/logic.yaml",
    );
    expect(refs).not.toContain("/repo/.onto/review/session/round1/logic.md");
    expect(refs).not.toContain(
      "/repo/.onto/domains/software-engineering/problem_framing_profile.md",
    );
  });
});
