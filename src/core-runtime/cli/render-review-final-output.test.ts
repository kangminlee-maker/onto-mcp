import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ReviewResultClassificationSummary } from "../review/artifact-types.js";
import {
  extractBoundaryEvidenceNotesFromLensText,
  runRenderReviewFinalOutputCli,
  renderBoundaryNotesForFinalOutput,
} from "./render-review-final-output.js";

const severityCounts = {
  blocker: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
};

function summaryWithNonMaterialFindings(
  nonMaterialFindings: ReviewResultClassificationSummary["non_material_findings"],
): ReviewResultClassificationSummary {
  return {
    highest_severity: nonMaterialFindings[0]?.severity ?? null,
    finding_count: nonMaterialFindings.length,
    issue_count: nonMaterialFindings.length,
    finding_severity_counts: { ...severityCounts, info: nonMaterialFindings.length },
    issue_severity_counts: { ...severityCounts, info: nonMaterialFindings.length },
    severity_counts: { ...severityCounts, info: nonMaterialFindings.length },
    material_issue_count: 0,
    non_material_finding_count: nonMaterialFindings.length,
    material_issues: [],
    non_material_findings: nonMaterialFindings,
    action_candidates: [],
  };
}

describe("renderBoundaryNotesForFinalOutput", () => {
  it("uses compact non-material findings when synthesize wrote an empty boundary note", () => {
    const rendered = renderBoundaryNotesForFinalOutput({
      sourceBoundaryNotes: "None.",
      classificationSummary: summaryWithNonMaterialFindings([
        {
          issue_id: "issue-002",
          severity: "info",
          material: false,
          affected_purpose: "review decision quality",
          failure_condition:
            "A final review attempts to decide unused field or exported symbol status from only the materialized single-file input.",
          impact:
            "The current evidence supports only an evidence gap, so promoting these observations to material issues would reduce trust.",
          evidence_refs: ["round1/structure.md#L11"],
          source_lens_ids: ["structure"],
          action_candidates: [],
          rationale: "Boundary uncertainty must remain non-material.",
          problem_definition:
            "The bounded single-file review scope lacks caller and public API contract evidence needed to decide whether ReviewPipelineInput.lensId or exported unstableFormat are structural defects.",
        },
      ]),
      lensBoundaryEvidenceNotes: [],
    });

    expect(rendered).toContain("issue-002 evidence gap");
    expect(rendered).toContain("lensId");
    expect(rendered).toContain("caller");
    expect(rendered.split("\n")).toHaveLength(1);
  });

  it("preserves boundary uncertainty from lens text when issue artifacts omit it", () => {
    const lensNotes = extractBoundaryEvidenceNotesFromLensText({
      lensId: "structure",
      text: [
        "# Structure Review",
        "",
        "`unstableFormat` has no internal reference in the materialized file, but it is exported.",
        "Within the bounded single-file evidence, export status is a valid structural connection point to external consumers, and there is insufficient boundary-authorized evidence to classify it as an orphan.",
      ].join("\n"),
    });
    const rendered = renderBoundaryNotesForFinalOutput({
      sourceBoundaryNotes: "None.",
      classificationSummary: summaryWithNonMaterialFindings([]),
      lensBoundaryEvidenceNotes: lensNotes,
    });

    expect(rendered).toContain("structure evidence gap");
    expect(rendered).toContain("orphan");
    expect(rendered).toContain("caller/API evidence is outside the current boundary");
  });

  it("keeps substantive synthesize boundary notes and caps them to three bullets", () => {
    const rendered = renderBoundaryNotesForFinalOutput({
      sourceBoundaryNotes: [
        "- First boundary note.",
        "- Second boundary note.",
        "- Third boundary note.",
        "- Fourth boundary note.",
      ].join("\n"),
      classificationSummary: summaryWithNonMaterialFindings([]),
      lensBoundaryEvidenceNotes: ["- structure evidence gap: fallback."],
    });

    expect(rendered).toBe(
      [
        "- First boundary note.",
        "- Second boundary note.",
        "- Third boundary note.",
      ].join("\n"),
    );
  });
});

describe("runRenderReviewFinalOutputCli", () => {
  it("fails loudly before writing final output when execution-result.yaml is missing", async () => {
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-final-output-"));
    const finalOutputPath = path.join(sessionRoot, "final-output.md");
    try {
      fs.writeFileSync(
        path.join(sessionRoot, "binding.yaml"),
        [
          "session_id: test-session",
          `execution_result_path: ${JSON.stringify(path.join(sessionRoot, "execution-result.yaml"))}`,
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "session-metadata.yaml"),
        "session_id: test-session\ncreated_at: 2026-06-06T00:00:00.000Z\n",
        "utf8",
      );

      await expect(
        runRenderReviewFinalOutputCli([
          "--project-root", sessionRoot,
          "--session-root", sessionRoot,
        ]),
      ).rejects.toThrow("Missing execution result artifact");
      expect(fs.existsSync(finalOutputPath)).toBe(false);
    } finally {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  it("fails loudly before writing final output when execution-result.yaml is malformed", async () => {
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-final-output-"));
    const finalOutputPath = path.join(sessionRoot, "final-output.md");
    try {
      fs.writeFileSync(
        path.join(sessionRoot, "binding.yaml"),
        [
          "session_id: test-session",
          "resolved_lens_set: [logic]",
          `execution_result_path: ${JSON.stringify(path.join(sessionRoot, "execution-result.yaml"))}`,
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "session-metadata.yaml"),
        "session_id: test-session\ncreated_at: 2026-06-06T00:00:00.000Z\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "execution-result.yaml"),
        [
          "session_id: test-session",
          `session_root: ${JSON.stringify(sessionRoot)}`,
          "execution_realization: worker",
          "host_runtime: openai",
          "review_mode: full",
          "execution_status: completed",
          'execution_started_at: "2026-06-06T00:00:00.000Z"',
          'execution_completed_at: "2026-06-06T00:00:01.000Z"',
          "total_duration_ms: 1000",
          "max_concurrent_lenses: 1",
          "retry_policy:",
          "  lens_max_retries: 10",
          "  issue_artifact_max_retries: 1",
          "  deliberation_max_retries: 10",
          "  synthesis_max_retries: 1",
          "  retry_initial_delay_ms: 8000",
          "planned_lens_ids: [logic]",
          "participating_lens_ids: [logic]",
          "degraded_lens_ids: []",
          "excluded_lens_ids: []",
          "executed_lens_count: 1",
          "error_log_path: error-log.md",
          "lens_execution_results: []",
          "",
        ].join("\n"),
        "utf8",
      );

      await expect(
        runRenderReviewFinalOutputCli([
          "--project-root", sessionRoot,
          "--session-root", sessionRoot,
        ]),
      ).rejects.toThrow("synthesis_executed must be a boolean");
      expect(fs.existsSync(finalOutputPath)).toBe(false);
    } finally {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  // Wiring guard. The renderer is documented as one of the terminal consumers
  // that go through `requireTerminalExecutionResult`, and documentation is not a
  // guarantee: dropping that call type-checks (the return is a cast) and, before
  // this test, left the whole suite green. Without a check here the code can
  // silently stop matching what mcp-native-tool-surface.md claims about it.
  it("refuses to render final output from a mid-run execution-result", async () => {
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-final-output-"));
    const finalOutputPath = path.join(sessionRoot, "final-output.md");
    try {
      fs.writeFileSync(
        path.join(sessionRoot, "binding.yaml"),
        [
          "session_id: test-session",
          "resolved_lens_set: [logic]",
          `execution_result_path: ${JSON.stringify(path.join(sessionRoot, "execution-result.yaml"))}`,
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "session-metadata.yaml"),
        "session_id: test-session\ncreated_at: 2026-06-06T00:00:00.000Z\n",
        "utf8",
      );
      // Exactly what the runtime upserts while lenses are still executing.
      fs.writeFileSync(
        path.join(sessionRoot, "execution-result.yaml"),
        [
          "session_id: test-session",
          `session_root: ${JSON.stringify(sessionRoot)}`,
          "execution_realization: worker",
          "host_runtime: openai",
          "review_mode: full",
          "execution_status: running",
          'execution_started_at: "2026-06-06T00:00:00.000Z"',
          "execution_completed_at: null",
          "total_duration_ms: null",
          "max_concurrent_lenses: 1",
          "retry_policy:",
          "  lens_max_retries: 10",
          "  issue_artifact_max_retries: 1",
          "  deliberation_max_retries: 10",
          "  synthesis_max_retries: 1",
          "  retry_initial_delay_ms: 8000",
          "planned_lens_ids: [logic]",
          "participating_lens_ids: [logic]",
          "degraded_lens_ids: []",
          "excluded_lens_ids: []",
          "executed_lens_count: 1",
          "synthesis_executed: false",
          "error_log_path: error-log.md",
          "lens_execution_results: []",
          "",
        ].join("\n"),
        "utf8",
      );

      await expect(
        runRenderReviewFinalOutputCli([
          "--project-root", sessionRoot,
          "--session-root", sessionRoot,
        ]),
      ).rejects.toThrow("execution_status=running");
      expect(fs.existsSync(finalOutputPath)).toBe(false);
    } finally {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  it("renders actual sidecar lens refs and preserves boundary fallback notes", async () => {
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-final-output-"));
    const finalOutputPath = path.join(sessionRoot, "final-output.md");
    const sidecarPath = path.join(sessionRoot, "round1", "logic.yaml");
    const markdownPath = path.join(sessionRoot, "round1", "logic.md");
    try {
      fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
      fs.writeFileSync(
        sidecarPath,
        "finding: exported symbol has insufficient caller evidence outside boundary\n",
        "utf8",
      );
      fs.writeFileSync(path.join(sessionRoot, "target.txt"), "target\n", "utf8");
      fs.writeFileSync(
        path.join(sessionRoot, "binding.yaml"),
        [
          "session_id: test-session",
          "resolved_session_domain: none",
          "resolved_review_mode: full",
          "resolved_execution_realization: direct-call",
          "resolved_host_runtime: openai",
          "semantic_quality_evidence:",
          "  status: not_applicable",
          "  applicability: mock_or_fixture",
          "resolved_lens_set: [logic]",
          "resolved_target_scope:",
          "  kind: file",
          `  resolved_refs: [${JSON.stringify(path.join(sessionRoot, "target.txt"))}]`,
          `finding_ledger_path: ${JSON.stringify(path.join(sessionRoot, "finding-ledger.yaml"))}`,
          `issue_ledger_path: ${JSON.stringify(path.join(sessionRoot, "issue-ledger.yaml"))}`,
          `problem_framing_path: ${JSON.stringify(path.join(sessionRoot, "problem-framing.yaml"))}`,
          `execution_result_path: ${JSON.stringify(path.join(sessionRoot, "execution-result.yaml"))}`,
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "session-metadata.yaml"),
        "session_id: test-session\ncreated_at: 2026-06-06T00:00:00.000Z\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "execution-plan.yaml"),
        [
          `session_root: ${JSON.stringify(sessionRoot)}`,
          "lens_execution_seats:",
          "  - lens_id: logic",
          `    output_path: ${JSON.stringify(markdownPath)}`,
          `    sidecar_output_path: ${JSON.stringify(sidecarPath)}`,
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "execution-result.yaml"),
        [
          "session_id: test-session",
          `session_root: ${JSON.stringify(sessionRoot)}`,
          "execution_realization: direct-call",
          "host_runtime: openai",
          "review_mode: full",
          "execution_status: completed",
          'execution_started_at: "2026-06-06T00:00:00.000Z"',
          'execution_completed_at: "2026-06-06T00:00:01.000Z"',
          "total_duration_ms: 1000",
          "max_concurrent_lenses: 1",
          "retry_policy:",
          "  lens_max_retries: 10",
          "  issue_artifact_max_retries: 1",
          "  deliberation_max_retries: 10",
          "  synthesis_max_retries: 1",
          "  retry_initial_delay_ms: 8000",
          "planned_lens_ids: [logic]",
          "participating_lens_ids: [logic]",
          "degraded_lens_ids: []",
          "excluded_lens_ids: []",
          "executed_lens_count: 1",
          "synthesis_executed: true",
          "deliberation_status: performed",
          "error_log_path: error-log.md",
          "lens_execution_results:",
          "  - unit_id: logic",
          "    unit_kind: lens",
          `    packet_path: ${JSON.stringify(path.join(sessionRoot, "prompt-packets", "logic.prompt.md"))}`,
          `    output_path: ${JSON.stringify(sidecarPath)}`,
          "    status: completed",
          '    started_at: "2026-06-06T00:00:00.000Z"',
          '    completed_at: "2026-06-06T00:00:01.000Z"',
          "    duration_ms: 1000",
          "synthesize_execution_result: {}",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "finding-ledger.yaml"),
        [
          "findings:",
          "  - finding_id: finding-001",
          "    lens_id: logic",
          "    severity: info",
          "    claim: Exported symbol cannot be classified without caller evidence.",
          "    affected_purpose: review decision quality",
          "    failure_condition: Caller evidence is outside the current boundary.",
          "    impact: Promoting this to a material issue would overstate the evidence.",
          "    evidence_anchor: round1/logic.yaml#finding-001",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(path.join(sessionRoot, "issue-ledger.yaml"), "issues: []\n", "utf8");
      fs.writeFileSync(
        path.join(sessionRoot, "problem-framing.yaml"),
        "classifications: []\n",
        "utf8",
      );
      fs.writeFileSync(path.join(sessionRoot, "deliberation.md"), "---\ndeliberation_status: performed\n---\n", "utf8");
      fs.writeFileSync(path.join(sessionRoot, "synthesis.md"), "# Synthesize\n", "utf8");
      fs.writeFileSync(
        path.join(sessionRoot, "synthesis-ledger.yaml"),
        [
          "schema_version: 1",
          "session_id: test-session",
          'created_at: "2026-06-06T00:00:01.000Z"',
          "source_artifact_refs: {}",
          "participation:",
          "  material_issue_count: 0",
          "  synthesized_issue_count: 0",
          "  non_material_finding_count: 0",
          "  run_status: no_material_issues",
          "material_issues: []",
          "non_material_findings: []",
          "issue_dependencies: []",
          "action_ordering: []",
          "boundary_notes: []",
          "final_review_result: No material issue.",
          "validation:",
          "  missing_material_issue_ids: []",
          "  duplicate_material_issue_ids: []",
          "  unknown_response_issue_ids: []",
          "  non_material_findings_preserved: true",
          "",
        ].join("\n"),
        "utf8",
      );

      await runRenderReviewFinalOutputCli([
        "--project-root", sessionRoot,
        "--session-root", sessionRoot,
      ]);
      const finalOutput = fs.readFileSync(finalOutputPath, "utf8");
      expect(finalOutput).toContain("logic: `round1/logic.yaml`");
      expect(finalOutput).not.toContain("logic: `round1/logic.md`");
      expect(finalOutput).toContain("finding:finding-001 evidence gap");
    } finally {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  it("renders classification action candidates when synthesis output is unavailable", async () => {
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-final-output-"));
    const finalOutputPath = path.join(sessionRoot, "final-output.md");
    const targetPath = path.join(sessionRoot, "target.txt");
    try {
      fs.writeFileSync(targetPath, "target\n", "utf8");
      fs.writeFileSync(
        path.join(sessionRoot, "binding.yaml"),
        [
          "session_id: test-session",
          "resolved_session_domain: none",
          "resolved_review_mode: full",
          "resolved_execution_realization: direct-call",
          "resolved_host_runtime: openai",
          "semantic_quality_evidence:",
          "  status: not_applicable",
          "  applicability: mock_or_fixture",
          "resolved_lens_set: [logic]",
          "resolved_target_scope:",
          "  kind: file",
          `  resolved_refs: [${JSON.stringify(targetPath)}]`,
          `finding_ledger_path: ${JSON.stringify(path.join(sessionRoot, "finding-ledger.yaml"))}`,
          `issue_ledger_path: ${JSON.stringify(path.join(sessionRoot, "issue-ledger.yaml"))}`,
          `problem_framing_path: ${JSON.stringify(path.join(sessionRoot, "problem-framing.yaml"))}`,
          `execution_result_path: ${JSON.stringify(path.join(sessionRoot, "execution-result.yaml"))}`,
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "session-metadata.yaml"),
        "session_id: test-session\ncreated_at: 2026-06-06T00:00:00.000Z\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "execution-result.yaml"),
        [
          "session_id: test-session",
          `session_root: ${JSON.stringify(sessionRoot)}`,
          "execution_realization: direct-call",
          "host_runtime: openai",
          "review_mode: full",
          "execution_status: completed",
          'execution_started_at: "2026-06-06T00:00:00.000Z"',
          'execution_completed_at: "2026-06-06T00:00:01.000Z"',
          "total_duration_ms: 1000",
          "max_concurrent_lenses: 1",
          "retry_policy:",
          "  lens_max_retries: 10",
          "  issue_artifact_max_retries: 1",
          "  deliberation_max_retries: 10",
          "  synthesis_max_retries: 1",
          "  retry_initial_delay_ms: 8000",
          "planned_lens_ids: [logic]",
          "participating_lens_ids: [logic]",
          "degraded_lens_ids: []",
          "excluded_lens_ids: []",
          "executed_lens_count: 1",
          "synthesis_executed: false",
          "deliberation_status: skipped",
          "error_log_path: error-log.md",
          "lens_execution_results: []",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "finding-ledger.yaml"),
        [
          "findings:",
          "  - finding_id: finding-001",
          "    lens_id: logic",
          "    severity: medium",
          "    claim: unstableFormat delegates raw JSON.stringify output.",
          "    affected_purpose: string return contract",
          "    failure_condition: JSON.stringify returns undefined",
          "    impact: callers receive a non-string value",
          "    evidence_refs: [src/target.ts:13]",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "issue-ledger.yaml"),
        [
          "issues:",
          "  - issue_id: issue-001",
          "    root_cause_hypothesis: JSON.stringify is used without a guard.",
          "    root_confidence: high",
          "    surface_finding_ids: [finding-001]",
          "    relation_refs: []",
          "    raised_by_lens_ids: [logic]",
          "    issue_statement: unstableFormat can return undefined despite declaring string.",
          "    proposed_action: Add a fallback or guard around JSON.stringify.",
          "    affected_purpose: string return contract",
          "    failure_condition: JSON.stringify returns undefined",
          "    impact: callers receive a non-string value",
          "    evidence_refs: [src/target.ts:13]",
          "    severity: medium",
          "issue_dependencies: []",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "problem-framing.yaml"),
        [
          "classifications:",
          "  - issue_id: issue-001",
          "    problem_definition: unstableFormat should not expose raw JSON.stringify undefined.",
          "    issue_role: root_cause",
          "    judgment_state: observed",
          "    impact_kind: correctness",
          "    timing_class: next_step_blocker",
          "    closure_class: needs_decision",
          "    closure_obligation: must_close_before_next_stage",
          "    rationale: Add a fallback or guard before relying on unstableFormat.",
          "    related_surface_finding_ids: [finding-001]",
          "",
        ].join("\n"),
        "utf8",
      );

      await runRenderReviewFinalOutputCli([
        "--project-root", sessionRoot,
        "--session-root", sessionRoot,
      ]);
      const finalOutput = fs.readFileSync(finalOutputPath, "utf8");
      expect(finalOutput).toContain(
        "### Immediate Actions Required\n- issue-001: fix_before_release, accept_risk",
      );
      expect(finalOutput).toContain(
        "rationale: Add a fallback or guard before relying on unstableFormat.",
      );
    } finally {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  it("renders lens agreement and disagreement from synthesis ledger summaries", async () => {
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-final-output-"));
    const finalOutputPath = path.join(sessionRoot, "final-output.md");
    const targetPath = path.join(sessionRoot, "target.txt");
    try {
      fs.writeFileSync(targetPath, "target\n", "utf8");
      fs.writeFileSync(
        path.join(sessionRoot, "binding.yaml"),
        [
          "session_id: test-session",
          "resolved_session_domain: none",
          "resolved_review_mode: full",
          "resolved_execution_realization: direct-call",
          "resolved_host_runtime: openai",
          "resolved_artifact_generation_realization: actual",
          "semantic_quality_evidence:",
          "  status: passed",
          "  applicability: product_path",
          "resolved_lens_set: [logic, structure, coverage, pragmatics, conciseness, evolution]",
          "resolved_target_scope:",
          "  kind: file",
          `  resolved_refs: [${JSON.stringify(targetPath)}]`,
          `finding_ledger_path: ${JSON.stringify(path.join(sessionRoot, "finding-ledger.yaml"))}`,
          `issue_ledger_path: ${JSON.stringify(path.join(sessionRoot, "issue-ledger.yaml"))}`,
          `problem_framing_path: ${JSON.stringify(path.join(sessionRoot, "problem-framing.yaml"))}`,
          `execution_result_path: ${JSON.stringify(path.join(sessionRoot, "execution-result.yaml"))}`,
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "session-metadata.yaml"),
        "session_id: test-session\ncreated_at: 2026-06-06T00:00:00.000Z\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "execution-result.yaml"),
        [
          "session_id: test-session",
          `session_root: ${JSON.stringify(sessionRoot)}`,
          "execution_realization: direct-call",
          "host_runtime: openai",
          "review_mode: full",
          "execution_status: completed",
          'execution_started_at: "2026-06-06T00:00:00.000Z"',
          'execution_completed_at: "2026-06-06T00:00:01.000Z"',
          "total_duration_ms: 1000",
          "max_concurrent_lenses: 3",
          "retry_policy:",
          "  lens_max_retries: 10",
          "  issue_artifact_max_retries: 1",
          "  deliberation_max_retries: 10",
          "  synthesis_max_retries: 1",
          "  retry_initial_delay_ms: 8000",
          "planned_lens_ids: [logic, structure, coverage, pragmatics, conciseness, evolution]",
          "participating_lens_ids: [logic, structure, coverage, pragmatics, conciseness, evolution]",
          "degraded_lens_ids: []",
          "excluded_lens_ids: []",
          "executed_lens_count: 6",
          "synthesis_executed: true",
          "deliberation_status: performed",
          "error_log_path: error-log.md",
          "lens_execution_results: []",
          "synthesize_execution_result: {}",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "finding-ledger.yaml"),
        [
          "schema_version: 1",
          "session_id: test-session",
          "findings:",
          "  - finding_id: finding-001",
          "    lens_id: logic",
          "    severity: high",
          "    claim: Runtime boundary is ambiguous.",
          "    affected_purpose: stable review execution",
          "    failure_condition: host invokes the package runtime path",
          "    impact: declared review path can fail",
          "    evidence_refs: [round1/logic.findings.yaml#finding-001]",
          "    evidence_anchor: package.json#mcp",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "issue-ledger.yaml"),
        [
          "schema_version: 1",
          "session_id: test-session",
          "issues:",
          "  - issue_id: issue-001",
          "    root_cause_hypothesis: Runtime ownership is not canonical.",
          "    root_confidence: high",
          "    surface_finding_ids: [finding-001]",
          "    relation_refs: []",
          "    raised_by_lens_ids: [logic, structure]",
          "    issue_statement: Runtime boundary ambiguity breaks the review path.",
          "    proposed_action: Assign one canonical runtime owner.",
          "    affected_purpose: stable review execution",
          "    failure_condition: host invokes the package runtime path",
          "    impact: declared review path can fail",
          "    evidence_refs: [round1/logic.findings.yaml#finding-001]",
          "    severity: high",
          "    domain_threshold_used: null",
          "    singleton_reason: null",
          "issue_dependencies: []",
          "validation:",
          "  unclustered_finding_ids: []",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "problem-framing.yaml"),
        [
          "schema_version: 1",
          "session_id: test-session",
          "classification_context:",
          "  common_spine_version: 1",
          "  session_domain: none",
          "classifications:",
          "  - issue_id: issue-001",
          "    problem_definition: Runtime path ambiguity undermines stable review execution.",
          "    issue_role: root_cause",
          "    judgment_state: observed",
          "    impact_kind: reliability",
          "    timing_class: next_step_blocker",
          "    closure_class: fix_now",
          "    closure_obligation: must_close_before_next_stage",
          "    domain_axes: {}",
          "    rationale: The package runtime path is part of the declared review purpose.",
          "    related_surface_finding_ids: [finding-001]",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "deliberation.md"),
        "---\ndeliberation_status: performed\n---\n",
        "utf8",
      );
      fs.writeFileSync(path.join(sessionRoot, "synthesis.md"), "# Synthesize\n", "utf8");
      fs.writeFileSync(
        path.join(sessionRoot, "synthesis-ledger.yaml"),
        [
          "schema_version: 1",
          "session_id: test-session",
          'created_at: "2026-06-06T00:00:01.000Z"',
          "source_artifact_refs:",
          "  synthesis_work_items: synthesis-work-items.yaml",
          "  issue_responses: [synthesis/responses/issue-001.yaml]",
          "  issue_ledger: issue-ledger.yaml",
          "  problem_framing: problem-framing.yaml",
          "  deliberation_resolution: deliberation-resolution.yaml",
          "participation:",
          "  material_issue_count: 1",
          "  synthesized_issue_count: 1",
          "  non_material_finding_count: 0",
          "  run_status: full",
          "material_issues:",
          "  - issue_id: issue-001",
          "    severity: high",
          "    issue_statement: Runtime boundary ambiguity breaks the review path.",
          "    affected_purpose: stable review execution",
          "    failure_condition: host invokes the package runtime path",
          "    impact: declared review path can fail",
          "    root_hypothesis: Runtime ownership is not canonical.",
          "    deliberation_status: narrowed",
          "    problem_framing: null",
          "    lens_position_summary:",
          "      issue_stance_lens_count: 6",
          "      raised_by_lens_ids: [logic, structure]",
          "      stance_buckets:",
          "        support: [logic]",
          "        narrow: [structure]",
          "        oppose: [coverage]",
          "        alternative_root: []",
          "        surface_only: [pragmatics]",
          "        not_applicable: [conciseness]",
          "        insufficient_evidence: [evolution]",
          "      resolution_acceptance:",
          "        deliberation_participating_lens_ids: [logic, structure, coverage]",
          "        accepted_by_lens_ids: [logic, structure]",
          "        remaining_disagreement_lens_ids: [coverage]",
          "    related_surface_finding_ids: [finding-001]",
          "    source_lens_ids: [logic, structure]",
          "    evidence_refs: [round1/logic.findings.yaml#finding-001]",
          "    action_candidates: [fix_before_release]",
          "    conclusion: Assign one canonical runtime owner.",
          "    materiality_explanation: Runtime ambiguity weakens the declared review path.",
          "    root_cause_explanation: The root cause is missing canonical ownership.",
          "    causal_path_explanation: Missing ownership leads to conflicting runtime paths.",
          "    action_explanation: Choose the owner and align package/runtime surfaces.",
          "    unresolved_disagreement_note: Coverage still contests the closure evidence.",
          "    boundary_notes: []",
          "    source_refs_used: [issue-ledger.yaml#issue-001]",
          "non_material_findings: []",
          "issue_dependencies: []",
          "action_ordering:",
          "  - issue_id: issue-001",
          "    severity: high",
          "    action_candidates: [fix_before_release]",
          "    rationale: Choose the owner and align package/runtime surfaces.",
          "boundary_notes: []",
          "shared_phenomenon_summary: []",
          "final_review_result: 1 material issue requires attention.",
          "validation:",
          "  missing_material_issue_ids: []",
          "  duplicate_material_issue_ids: []",
          "  unknown_response_issue_ids: []",
          "  non_material_findings_preserved: true",
          "",
        ].join("\n"),
        "utf8",
      );

      await runRenderReviewFinalOutputCli([
        "--project-root", sessionRoot,
        "--session-root", sessionRoot,
      ]);
      const finalOutput = fs.readFileSync(finalOutputPath, "utf8");
      expect(finalOutput).toContain("issue stance agreement: 2/6");
      expect(finalOutput).toContain(
        "issue statement: Runtime boundary ambiguity breaks the review path.",
      );
      expect(finalOutput).toContain(
        "failure condition: host invokes the package runtime path",
      );
      expect(finalOutput).toContain(
        "root hypothesis: Runtime ownership is not canonical.",
      );
      expect(finalOutput).toContain(
        "evidence: `round1/logic.findings.yaml#finding-001`",
      );
      expect(finalOutput).toContain("agreed or narrowed lenses: logic, structure");
      expect(finalOutput).toContain("issue stance disagreement: 2/6");
      expect(finalOutput).toContain("disagreeing stance lenses: coverage, pragmatics");
      expect(finalOutput).toContain("not applicable lenses: conciseness");
      expect(finalOutput).toContain("insufficient evidence lenses: evolution");
      expect(finalOutput).toContain(
        "resolution accepted by: 2/3 deliberation participants",
      );
      expect(finalOutput).toContain("accepted lenses: logic, structure");
      expect(finalOutput).toContain(
        "remaining disagreement: 1/3 deliberation participants",
      );
      expect(finalOutput).toContain("remaining disagreement lenses: coverage");
      expect(finalOutput).toContain("raised by lenses: logic, structure");
    } finally {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  it("fails loudly when synthesis ledger material issues omit lens position summary", async () => {
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-final-output-"));
    try {
      fs.writeFileSync(path.join(sessionRoot, "target.txt"), "target\n", "utf8");
      fs.writeFileSync(
        path.join(sessionRoot, "binding.yaml"),
        [
          "session_id: test-session",
          "resolved_session_domain: none",
          "resolved_review_mode: full",
          "resolved_execution_realization: direct-call",
          "resolved_host_runtime: openai",
          "resolved_artifact_generation_realization: actual",
          "semantic_quality_evidence:",
          "  status: passed",
          "  applicability: product_path",
          "resolved_lens_set: [logic]",
          "resolved_target_scope:",
          "  kind: file",
          `  resolved_refs: [${JSON.stringify(path.join(sessionRoot, "target.txt"))}]`,
          `finding_ledger_path: ${JSON.stringify(path.join(sessionRoot, "finding-ledger.yaml"))}`,
          `issue_ledger_path: ${JSON.stringify(path.join(sessionRoot, "issue-ledger.yaml"))}`,
          `problem_framing_path: ${JSON.stringify(path.join(sessionRoot, "problem-framing.yaml"))}`,
          `execution_result_path: ${JSON.stringify(path.join(sessionRoot, "execution-result.yaml"))}`,
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "session-metadata.yaml"),
        "session_id: test-session\ncreated_at: 2026-06-06T00:00:00.000Z\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "execution-result.yaml"),
        [
          "session_id: test-session",
          `session_root: ${JSON.stringify(sessionRoot)}`,
          "execution_realization: direct-call",
          "host_runtime: openai",
          "review_mode: full",
          "execution_status: completed",
          'execution_started_at: "2026-06-06T00:00:00.000Z"',
          'execution_completed_at: "2026-06-06T00:00:01.000Z"',
          "total_duration_ms: 1000",
          "max_concurrent_lenses: 1",
          "retry_policy:",
          "  lens_max_retries: 10",
          "  issue_artifact_max_retries: 1",
          "  deliberation_max_retries: 10",
          "  synthesis_max_retries: 1",
          "  retry_initial_delay_ms: 8000",
          "planned_lens_ids: [logic]",
          "participating_lens_ids: [logic]",
          "degraded_lens_ids: []",
          "excluded_lens_ids: []",
          "executed_lens_count: 1",
          "synthesis_executed: true",
          "deliberation_status: performed",
          "error_log_path: error-log.md",
          "lens_execution_results: []",
          "synthesize_execution_result: {}",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "finding-ledger.yaml"),
        [
          "findings:",
          "  - finding_id: finding-001",
          "    lens_id: logic",
          "    severity: high",
          "    claim: claim",
          "    affected_purpose: purpose",
          "    failure_condition: failure",
          "    impact: impact",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "issue-ledger.yaml"),
        [
          "issues:",
          "  - issue_id: issue-001",
          "    severity: high",
          "    issue_statement: issue",
          "    affected_purpose: purpose",
          "    failure_condition: failure",
          "    impact: impact",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "problem-framing.yaml"),
        "classifications: []\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(sessionRoot, "deliberation.md"),
        "---\ndeliberation_status: performed\n---\n",
        "utf8",
      );
      fs.writeFileSync(path.join(sessionRoot, "synthesis.md"), "# Synthesize\n", "utf8");
      fs.writeFileSync(
        path.join(sessionRoot, "synthesis-ledger.yaml"),
        [
          "material_issues:",
          "  - issue_id: issue-001",
          "    severity: high",
          "    conclusion: conclusion",
          "    materiality_explanation: materiality",
          "    root_cause_explanation: root",
          "    causal_path_explanation: causal",
          "    action_explanation: action",
          "    unresolved_disagreement_note: null",
          "non_material_findings: []",
          "action_ordering: []",
          "boundary_notes: []",
          "final_review_result: result",
          "",
        ].join("\n"),
        "utf8",
      );

      await expect(
        runRenderReviewFinalOutputCli([
          "--project-root", sessionRoot,
          "--session-root", sessionRoot,
        ]),
      ).rejects.toThrow(
        "synthesis-ledger.material_issues.issue-001.lens_position_summary must be a YAML mapping.",
      );
    } finally {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });
});
