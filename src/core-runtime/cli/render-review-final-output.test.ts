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
});
