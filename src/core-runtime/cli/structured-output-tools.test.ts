import { describe, expect, it } from "vitest";
import { parseRuntimeSubmitContextForOutputFormat } from "./runtime-submit-context.js";
import { createRuntimeSubmitTools } from "./structured-output-tools.js";

describe("runtime submit structured output tools", () => {
  it("fills bounded surface defaults for non-material finding rows only", async () => {
    const state = {
      sessionId: "session-001",
      unitId: "finding-ledger",
      outputFormat: "issue-artifact",
    } as const;
    const [tool] = createRuntimeSubmitTools(state);
    if (!tool) throw new Error("missing submit tool");

    await tool.execute(
      {
        findings: [
          {
            finding_id: "finding-001",
            lens_id: "conciseness",
            source_ref: "round1/conciseness.md#finding-summary",
            target: "src/target.ts",
            evidence_anchor: "No conciseness-specific issue found.",
            claim: "No conciseness-specific issue found.",
            lens_rationale_summary:
              "The lens found no duplicate or redundant concept structure.",
            proposed_action: "No conciseness action required.",
            affected_purpose: null,
            failure_condition: null,
            impact: null,
            evidence_refs: [],
            severity: "info",
            domain_threshold_used: null,
            materiality_basis: null,
            causal_path: null,
          },
        ],
        validation: { unaddressable_findings: [] },
      },
      {
        projectRoot: "/repo",
        ontoHome: "/repo/.onto",
        allowedReadRefs: [],
      },
    );

    expect(state.artifact?.findings).toEqual([
      expect.objectContaining({
        finding_id: "finding-001",
        affected_purpose:
          "No affected purpose was established by this non-material surface observation within the bounded lens output.",
        failure_condition:
          "No concrete failure condition was established within the bounded lens output.",
        impact:
          "No material impact was established; preserve as a non-material surface observation.",
      }),
    ]);
  });

  it("projects issue dependencies from shared-cause relation endpoints", async () => {
    const state = {
      sessionId: "session-001",
      unitId: "issue-ledger",
      outputFormat: "issue-artifact",
      issueLedgerDependencyContext: {
        shared_cause_relations: [
          {
            relation_id: "rel-001",
            from_finding_id: "finding-001",
            to_finding_id: "finding-002",
            cause_claim: "Both findings share the same overwrite cause.",
          },
          {
            relation_id: "rel-002",
            from_finding_id: "finding-001",
            to_finding_id: "finding-003",
            cause_claim: "The same overwrite cause reaches a third finding.",
          },
        ],
      },
    } as const;
    const [tool] = createRuntimeSubmitTools(state);
    if (!tool) throw new Error("missing submit tool");

    await tool.execute(
      {
        issues: [
          {
            issue_id: "issue-001",
            surface_finding_ids: ["finding-001"],
            severity: "high",
          },
          {
            issue_id: "issue-002",
            surface_finding_ids: ["finding-002"],
            severity: "medium",
          },
          {
            issue_id: "issue-003",
            surface_finding_ids: ["finding-003"],
            severity: "medium",
          },
        ],
        validation: { unclustered_finding_ids: [] },
      },
      {
        projectRoot: "/repo",
        ontoHome: "/repo/.onto",
        allowedReadRefs: [],
      },
    );

    expect(state.artifact?.issue_dependencies).toEqual([
      expect.objectContaining({
        dependency_id: "dep-001",
        dependency_kind: "shared_cause_candidate",
        issue_ids: ["issue-001", "issue-002"],
        relation_refs: ["rel-001"],
      }),
      expect.objectContaining({
        dependency_id: "dep-002",
        dependency_kind: "shared_cause_candidate",
        issue_ids: ["issue-001", "issue-003"],
        relation_refs: ["rel-002"],
      }),
    ]);
  });

  it("rejects issue-ledger dependencies submitted by the LLM", async () => {
    const [tool] = createRuntimeSubmitTools({
      sessionId: "session-001",
      unitId: "issue-ledger",
      outputFormat: "issue-artifact",
      issueLedgerDependencyContext: {
        shared_cause_relations: [],
      },
    });
    if (!tool) throw new Error("missing submit tool");

    await expect(
      tool.execute(
        {
          issues: [],
          issue_dependencies: [],
          validation: { unclustered_finding_ids: [] },
        },
        {
          projectRoot: "/repo",
          ontoHome: "/repo/.onto",
          allowedReadRefs: [],
        },
      ),
    ).rejects.toThrow(/unsupported field issue_dependencies/);
  });

  it("keeps issue stance evidence refs out of provider enum schemas", () => {
    const [tool] = createRuntimeSubmitTools({
      sessionId: "session-001",
      unitId: "issue-stance:logic",
      outputFormat: "issue-stance-response",
      issueStanceSchemaContext: {
        issue_evidence_refs: {
          "issue-001": [
            "issue-ledger.yaml#issue-001",
            'materialized-input.md line with "quoted" token',
          ],
        },
      },
    });
    if (!tool) throw new Error("missing submit tool");

    const schema = tool.input_schema as {
      properties: {
        stances: {
          items: {
            anyOf: Array<{
              properties: {
                issue_id: { enum?: unknown[] };
                evidence_refs: { items: { enum?: unknown[] } };
              };
            }>;
          };
        };
      };
    };
    const stanceRow = schema.properties.stances.items.anyOf[0]!;

    expect(stanceRow.properties.issue_id.enum).toEqual(["issue-001"]);
    expect(stanceRow.properties.evidence_refs.items.enum).toBeUndefined();
  });

  it("rejects unsupported issue stance evidence refs at submit time", async () => {
    const state = {
      sessionId: "session-001",
      unitId: "issue-stance:logic",
      outputFormat: "issue-stance-response",
      issueStanceSchemaContext: {
        issue_evidence_refs: {
          "issue-001": [
            "issue-ledger.yaml#issue-001",
            'materialized-input.md line with "quoted" token',
          ],
        },
      },
    } as const;
    const [tool] = createRuntimeSubmitTools(state);
    if (!tool) throw new Error("missing submit tool");

    await expect(
      tool.execute(
        {
          stances: [
            {
              issue_id: "issue-001",
              stance: "support",
              rationale: "The logic lens accepts the issue.",
              root_hypothesis_position: "accepts",
              severity_position: "keeps",
              evidence_refs: ["made-up-ref"],
            },
          ],
        },
        {
          projectRoot: "/repo",
          ontoHome: "/repo/.onto",
          allowedReadRefs: [],
        },
      ),
    ).rejects.toThrow(/unsupported ref/);

    await tool.execute(
      {
        stances: [
          {
            issue_id: "issue-001",
            stance: "support",
            rationale: "The logic lens accepts the issue.",
            root_hypothesis_position: "accepts",
            severity_position: "keeps",
            evidence_refs: ['materialized-input.md line with "quoted" token'],
          },
        ],
      },
      {
        projectRoot: "/repo",
        ontoHome: "/repo/.onto",
        allowedReadRefs: [],
      },
    );

    expect(state.artifact?.stances).toEqual([
      expect.objectContaining({
        issue_id: "issue-001",
        evidence_refs: ['materialized-input.md line with "quoted" token'],
      }),
    ]);
  });

  it("allows requested lens finding evidence refs in issue stance submit context", () => {
    const context = parseRuntimeSubmitContextForOutputFormat({
      unitId: "issue-stance:conciseness",
      outputFormat: "issue-stance-response",
      rawPacketText: `# Issue Stance Response Prompt

requested_lens_id: conciseness

## Lens Source Refs
- .onto/review/session-001/round1/conciseness.findings.yaml

## Runtime Issue Stance Input Projection
\`\`\`yaml
source_artifact_refs:
  finding_ledger: .onto/review/session-001/finding-ledger.yaml
  finding_relation_graph: .onto/review/session-001/finding-relation-graph.yaml
  issue_ledger: .onto/review/session-001/issue-ledger.yaml
issues:
  - issue_id: issue-002
    evidence_refs:
      - .onto/review/session-001/round1/semantics.findings.yaml#semantics-candidate-001
    surface_finding_ids:
      - finding-002
    relation_refs: []
finding_summaries:
  - finding_id: finding-005
    lens_id: conciseness
    evidence_refs:
      - .onto/review/session-001/round1/conciseness.findings.yaml#conciseness-candidate-001
relation_summaries: []
singleton_findings: []
issue_dependencies: []
\`\`\`
`,
    });

    expect(
      context.issueStanceSchemaContext?.issue_evidence_refs["issue-002"],
    ).toEqual(
      expect.arrayContaining([
        ".onto/review/session-001/round1/conciseness.findings.yaml#conciseness-candidate-001",
        ".onto/review/session-001/finding-ledger.yaml#finding-005",
      ]),
    );
  });

  it("rejects unknown problem-framing classification row fields", async () => {
    const [tool] = createRuntimeSubmitTools({
      sessionId: "session-001",
      unitId: "problem-framing",
      outputFormat: "issue-artifact",
      problemFramingContext: {
        classification_context: {
          common_spine_version: 1,
          session_domain: "none",
          domain_profile_ref: "",
          domain_profile_doc_type: "custom:problem_framing_profile",
          domain_profile_status: "not_requested",
        },
        issue_surface_finding_ids: {
          "issue-001": ["finding-001"],
        },
      },
    });
    if (!tool) throw new Error("missing submit tool");

    await expect(
      tool.execute(
        {
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
              classification_context: { session_domain: "none" },
            },
          ],
        },
        {
          projectRoot: "/repo",
          ontoHome: "/repo/.onto",
          allowedReadRefs: [],
        },
      ),
    ).rejects.toThrow(/unsupported field classification_context/);
  });

  it("exposes problem-framing spine fields as submit-tool enums", () => {
    const [tool] = createRuntimeSubmitTools({
      sessionId: "session-001",
      unitId: "problem-framing",
      outputFormat: "issue-artifact",
      problemFramingContext: {
        classification_context: {},
        issue_surface_finding_ids: {},
      },
    });
    if (!tool) throw new Error("missing submit tool");

    const schema = tool.input_schema as {
      properties: {
        classifications: {
          items: {
            properties: Record<string, { enum?: unknown[] }>;
          };
        };
      };
    };
    const properties = schema.properties.classifications.items.properties;

    expect(properties.issue_role?.enum).toContain("root_cause");
    expect(properties.judgment_state?.enum).toContain("insufficient_evidence");
    expect(properties.impact_kind?.enum).toContain("correctness");
    expect(properties.timing_class?.enum).toContain("next_step_blocker");
    expect(properties.closure_class?.enum).toContain("needs_evidence");
    expect(properties.closure_obligation?.enum).toContain("out_of_scope");
  });

  it("rejects problem-framing enum drift at submit time", async () => {
    const [tool] = createRuntimeSubmitTools({
      sessionId: "session-001",
      unitId: "problem-framing",
      outputFormat: "issue-artifact",
      problemFramingContext: {
        classification_context: {
          common_spine_version: 1,
          session_domain: "none",
          domain_profile_ref: "",
          domain_profile_doc_type: "custom:problem_framing_profile",
          domain_profile_status: "not_requested",
        },
        issue_surface_finding_ids: {
          "issue-001": ["finding-001"],
        },
      },
    });
    if (!tool) throw new Error("missing submit tool");

    await expect(
      tool.execute(
        {
          classifications: [
            {
              issue_id: "issue-001",
              problem_definition: "artifact truth is underspecified",
              issue_role: "root cause",
              judgment_state: "observed",
              impact_kind: "governance_value",
              timing_class: "next_step_blocker",
              closure_class: "fix_now",
              closure_obligation: "must_close_before_next_stage",
              domain_axes: {},
              rationale: "The issue weakens durable review artifact truth.",
            },
          ],
        },
        {
          projectRoot: "/repo",
          ontoHome: "/repo/.onto",
          allowedReadRefs: [],
        },
      ),
    ).rejects.toThrow(/issue_role must be one of/);
  });

  it("keeps issue deliberation refs out of provider enum schemas and rejects unsupported refs", async () => {
    const state = {
      sessionId: "session-001",
      unitId: "deliberation:issue-001:logic",
      outputFormat: "issue-deliberation-response",
      issueDeliberationSchemaContext: {
        allowed_evidence_refs: [
          "issue-ledger.yaml#issue-001",
          'issue-stance-matrix.yaml line with "quoted" token',
        ],
      },
    } as const;
    const [tool] = createRuntimeSubmitTools(state);
    if (!tool) throw new Error("missing submit tool");

    const schema = tool.input_schema as {
      properties: {
        evidence_refs: { items: { enum?: unknown[] } };
      };
    };
    expect(schema.properties.evidence_refs.items.enum).toBeUndefined();

    const validPayload = {
      difference_explanation: "The disagreement is only about scope.",
      response_to_other_positions: "The logic lens accepts the narrowed scope.",
      updated_stance: "narrow",
      changed: false,
      change_reason: null,
      accepted_root_hypothesis: "Root cause remains the same.",
      remaining_blocker: null,
      evidence_refs: ["issue-ledger.yaml#issue-001"],
    };

    await expect(
      tool.execute(
        {
          ...validPayload,
          evidence_refs: ["made-up-ref"],
        },
        {
          projectRoot: "/repo",
          ontoHome: "/repo/.onto",
          allowedReadRefs: [],
        },
      ),
    ).rejects.toThrow(/unsupported ref/);

    await tool.execute(validPayload, {
      projectRoot: "/repo",
      ontoHome: "/repo/.onto",
      allowedReadRefs: [],
    });

    expect(state.artifact?.evidence_refs).toEqual(["issue-ledger.yaml#issue-001"]);
  });

  it("keeps issue synthesis source refs out of provider enum schemas and rejects unsupported refs", async () => {
    const state = {
      sessionId: "session-001",
      unitId: "synthesis:issue-001",
      outputFormat: "issue-synthesis-response",
      issueSynthesisSchemaContext: {
        allowed_source_refs: [
          "finding-ledger.yaml#finding-001",
          'problem-framing.yaml line with "quoted" token',
        ],
        source_work_item_ref: "synthesis-work-items.yaml#synthesis:issue-001",
      },
    } as const;
    const [tool] = createRuntimeSubmitTools(state);
    if (!tool) throw new Error("missing submit tool");

    const schema = tool.input_schema as {
      properties: {
        source_refs_used: { items: { enum?: unknown[] } };
      };
    };
    expect(schema.properties.source_refs_used.items.enum).toBeUndefined();

    const validPayload = {
      conclusion: "The issue should be fixed before release.",
      materiality_explanation: "It weakens the declared purpose.",
      root_cause_explanation: "The root cause starts the failure chain.",
      causal_path_explanation: "The causal path reaches the observed issue.",
      action_explanation: "Fix the root cause first.",
      unresolved_disagreement_note: null,
      boundary_notes: [],
      source_refs_used: ["finding-ledger.yaml#finding-001"],
    };

    await expect(
      tool.execute(
        {
          ...validPayload,
          source_refs_used: ["made-up-ref"],
        },
        {
          projectRoot: "/repo",
          ontoHome: "/repo/.onto",
          allowedReadRefs: [],
        },
      ),
    ).rejects.toThrow(/unsupported ref/);

    await expect(
      tool.execute(
        {
          ...validPayload,
          source_refs_used: ["synthesis-work-items.yaml#synthesis:issue-001"],
        },
        {
          projectRoot: "/repo",
          ontoHome: "/repo/.onto",
          allowedReadRefs: [],
        },
      ),
    ).rejects.toThrow(/at least one allowed source ref/);

    await tool.execute(validPayload, {
      projectRoot: "/repo",
      ontoHome: "/repo/.onto",
      allowedReadRefs: [],
    });

    expect(state.artifact?.source_refs_used).toEqual([
      "finding-ledger.yaml#finding-001",
    ]);
  });

  it("parses runtime submit contexts for deliberation and synthesis packets", () => {
    const deliberationContext = parseRuntimeSubmitContextForOutputFormat({
      unitId: "deliberation:issue-001:logic",
      outputFormat: "issue-deliberation-response",
      rawPacketText: `# Prompt

## Runtime Projection
\`\`\`yaml
issue:
  issue_id: issue-001
  surface_finding_ids: [finding-001]
  relation_refs: [rel-001]
  evidence_refs:
    - round1/logic.findings.yaml#finding-001
own_stance:
  lens_id: logic
  evidence_refs:
    - issue-stance-matrix.yaml#stances.issue-001.logic
peer_stances:
  - lens_id: structure
    evidence_refs:
      - issue-stance-matrix.yaml#stances.issue-001.structure
plan_entry:
  source_stance_refs:
    - issue-stance-matrix.yaml#stances.issue-001.logic
\`\`\`
`,
    });
    expect(
      deliberationContext.issueDeliberationSchemaContext?.allowed_evidence_refs,
    ).toEqual(
      expect.arrayContaining([
        "issue-ledger.yaml#issue-001",
        "finding-ledger.yaml#finding-001",
        "finding-relation-graph.yaml#rel-001",
        "issue-stance-matrix.yaml#stances.issue-001.logic",
        "issue-stance-matrix.yaml#stances.issue-001.structure",
      ]),
    );

    const synthesisContext = parseRuntimeSubmitContextForOutputFormat({
      unitId: "synthesis:issue-001",
      outputFormat: "issue-synthesis-response",
      rawPacketText: `# Prompt

## Runtime Work Item
\`\`\`yaml
work_item_id: synthesis:issue-001
allowed_source_refs:
  - finding-ledger.yaml#finding-001
allowed_evidence_refs:
  - round1/logic.findings.yaml#finding-001
\`\`\`
`,
    });
    expect(synthesisContext.issueSynthesisSchemaContext).toEqual({
      allowed_source_refs: ["finding-ledger.yaml#finding-001"],
      source_work_item_ref: "synthesis-work-items.yaml#synthesis:issue-001",
    });
  });
});
