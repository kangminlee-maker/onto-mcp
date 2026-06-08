import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import YAML from "yaml";
import type {
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewIssueArtifactId,
  ReviewUnitExecutionResult,
} from "./artifact-types.js";
import { computeReviewFrontier } from "./review-execution-steps.js";

const tempRoots: string[] = [];

async function tempSessionRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-review-steps-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

const ISSUE_ARTIFACT_IDS: readonly ReviewIssueArtifactId[] = [
  "finding-ledger",
  "finding-relation-graph",
  "issue-ledger",
  "issue-stance-matrix",
  "deliberation-plan",
  "problem-framing",
];

function executionPlan(root: string, lensIds = ["logic", "coverage"]): ReviewExecutionPlan {
  const promptRoot = path.join(root, "prompt-packets");
  const round1Root = path.join(root, "round1");
  return {
    session_id: path.basename(root),
    session_root: root,
    execution_realization: "worker",
    host_runtime: "standalone",
    review_mode: "core-axis",
    interpretation_artifact_path: path.join(root, "interpretation.yaml"),
    binding_output_path: path.join(root, "binding.yaml"),
    session_metadata_path: path.join(root, "session-metadata.yaml"),
    execution_preparation_root: path.join(root, "execution-preparation"),
    round1_root: round1Root,
    lens_execution_seats: lensIds.map((lensId) => ({
      lens_id: lensId,
      output_path: path.join(round1Root, `${lensId}.md`),
    })),
    prompt_packets_root: promptRoot,
    lens_prompt_packet_seats: lensIds.map((lensId) => ({
      lens_id: lensId,
      packet_path: path.join(promptRoot, `${lensId}.prompt.md`),
      output_path: path.join(round1Root, `${lensId}.md`),
    })),
    issue_artifact_prompt_packet_seats: ISSUE_ARTIFACT_IDS.map((artifactId) => ({
      artifact_id: artifactId,
      packet_path: path.join(promptRoot, `${artifactId}.prompt.md`),
      output_path: path.join(root, `${artifactId}.yaml`),
    })),
    teamlead_deliberation_prompt_packet_path: path.join(
      promptRoot,
      "controlled-deliberation.prompt.md",
    ),
    review_target_profile_path: path.join(
      root,
      "execution-preparation",
      "review-target-profile.yaml",
    ),
    synthesis_output_path: path.join(root, "synthesis.md"),
    finding_ledger_path: path.join(root, "finding-ledger.yaml"),
    finding_relation_graph_path: path.join(root, "finding-relation-graph.yaml"),
    issue_ledger_path: path.join(root, "issue-ledger.yaml"),
    issue_stance_matrix_path: path.join(root, "issue-stance-matrix.yaml"),
    deliberation_plan_path: path.join(root, "deliberation-plan.yaml"),
    problem_framing_path: path.join(root, "problem-framing.yaml"),
    lens_completion_barrier_path: path.join(root, "lens-completion-barrier.yaml"),
    deliberation_mode: "controlled-lens-deliberation",
    deliberation_root_path: path.join(root, "deliberation"),
    deliberation_output_path: path.join(root, "deliberation.md"),
    execution_result_path: path.join(root, "execution-result.yaml"),
    error_log_path: path.join(root, "error-log.md"),
    final_output_path: path.join(root, "final-output.md"),
    review_record_path: path.join(root, "review-record.yaml"),
    boundary_policy: {} as ReviewExecutionPlan["boundary_policy"],
    boundary_presentation: {} as ReviewExecutionPlan["boundary_presentation"],
    boundary_enforcement_profile:
      {} as ReviewExecutionPlan["boundary_enforcement_profile"],
    effective_boundary_state: {} as ReviewExecutionPlan["effective_boundary_state"],
  };
}

async function writeYaml(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, YAML.stringify(value), "utf8");
}

async function writeOutput(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `# ${path.basename(filePath)}\n`, "utf8");
}

function lensResult(
  lensId: string,
  packetPath: string,
  outputPath: string,
): ReviewUnitExecutionResult {
  return {
    unit_id: lensId,
    unit_kind: "lens",
    packet_path: packetPath,
    output_path: outputPath,
    status: "completed",
    started_at: "2026-05-27T00:00:00.000Z",
    completed_at: "2026-05-27T00:00:01.000Z",
    duration_ms: 1000,
    timestamp_provenance: "runner_wallclock",
    failure_message: null,
  };
}

function lensOnlyExecutionResult(
  plan: ReviewExecutionPlan,
): ReviewExecutionResultArtifact {
  return {
    session_id: plan.session_id,
    session_root: plan.session_root,
    execution_realization: plan.execution_realization,
    host_runtime: plan.host_runtime,
    review_mode: plan.review_mode,
    execution_status: "completed",
    execution_started_at: "2026-05-27T00:00:00.000Z",
    execution_completed_at: "2026-05-27T00:00:02.000Z",
    total_duration_ms: 2000,
    max_concurrent_lenses: 2,
    planned_lens_ids: plan.lens_execution_seats.map((seat) => seat.lens_id),
    participating_lens_ids: plan.lens_execution_seats.map((seat) => seat.lens_id),
    degraded_lens_ids: [],
    excluded_lens_ids: [],
    executed_lens_count: plan.lens_execution_seats.length,
    synthesis_executed: false,
    error_log_path: plan.error_log_path,
    lens_execution_results: plan.lens_prompt_packet_seats.map((seat) =>
      lensResult(seat.lens_id, seat.packet_path, seat.output_path),
    ),
  };
}

describe("computeReviewFrontier", () => {
  it("returns the lens units as the initial frontier for a fresh session", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);

    const result = await computeReviewFrontier(root);

    expect(result.eligible).toBe(true);
    const frontierIds = result.frontierUnits.map((unit) => unit.unitId);
    expect(frontierIds).toEqual(expect.arrayContaining(["logic", "coverage"]));
    // No issue-artifact unit is ready until lenses are trusted.
    expect(frontierIds).not.toContain("finding-ledger");
  });

  it("advances the frontier to issue-artifacts once lens seats are trusted", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    // Host wrote the lens seats, and onto recorded their results as completed.
    for (const seat of plan.lens_execution_seats) {
      await writeOutput(seat.output_path);
    }
    await writeYaml(
      path.join(root, "execution-result.yaml"),
      lensOnlyExecutionResult(plan),
    );

    const result = await computeReviewFrontier(root);

    expect(result.eligible).toBe(true);
    const frontierIds = result.frontierUnits.map((unit) => unit.unitId);
    // Lenses are trusted (completed + seat on disk), so the first issue artifact
    // becomes ready while the lenses are no longer in the frontier.
    expect(frontierIds).toContain("finding-ledger");
    expect(frontierIds).not.toContain("logic");
  });
});
