import { describe, expect, it } from "vitest";
import {
  buildIssueArtifactPrompt,
  issueArtifactAllowedReadRefs,
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
    lens_deliberation_prompt_packet_seats: [],
    teamlead_deliberation_prompt_packet_path: `${sessionRoot}/prompt-packets/controlled-deliberation.prompt.md`,
    synthesize_prompt_packet_path: `${sessionRoot}/prompt-packets/synthesize.prompt.md`,
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
      ".onto/review/session/round1/logic.md",
      ".onto/review/session/round1/pragmatics.md",
    ]);
    expect(readAuthority.refs).not.toContain(".onto/review/session/issue-ledger.yaml");
  });

  it("adds controlled deliberation refs only for problem-framing", () => {
    const projectRoot = "/repo";
    const executionPlan = minimalExecutionPlan(projectRoot);
    const refs = issueArtifactAllowedReadRefs({
      artifactId: "problem-framing",
      projectRoot,
      executionPlan,
      lensOutputPaths: ["/repo/.onto/review/session/round1/logic.md"],
      deliberationOutputPath: "/repo/.onto/review/session/deliberation.md",
      deliberationResponsePaths: [
        "/repo/.onto/review/session/deliberation/round1/logic-deliberation.md",
      ],
      problemFramingProfileRef:
        ".onto/domains/software-engineering/problem_framing_profile.md",
    });

    expect(refs).toContain("/repo/.onto/review/session/deliberation.md");
    expect(refs).toContain(
      "/repo/.onto/review/session/deliberation/round1/logic-deliberation.md",
    );
    expect(refs).toContain(
      "/repo/.onto/domains/software-engineering/problem_framing_profile.md",
    );
    expect(refs).toContain("/repo/.onto/review/session/deliberation-plan.yaml");
  });
});
