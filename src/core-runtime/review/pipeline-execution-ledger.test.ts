import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewIssueArtifactId,
  ReviewLensCompletionBarrierArtifact,
  ReviewUnitExecutionResult,
} from "./artifact-types.js";
import { buildReviewPipelineExecutionLedger } from "./pipeline-execution-ledger.js";

const tempRoots: string[] = [];

async function tempSessionRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-review-ledger-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
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

function outputName(artifactId: ReviewIssueArtifactId): string {
  return `${artifactId}.yaml`;
}

function executionPlan(root: string, lensIds = ["logic", "coverage"]): ReviewExecutionPlan {
  const promptRoot = path.join(root, "prompt-packets");
  const round1Root = path.join(root, "round1");
  const deliberationRoundRoot = path.join(root, "deliberation", "round1");
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
      output_path: path.join(root, outputName(artifactId)),
    })),
    lens_deliberation_prompt_packet_seats: lensIds.map((lensId) => ({
      lens_id: lensId,
      packet_path: path.join(promptRoot, `deliberation-${lensId}.prompt.md`),
      output_path: path.join(deliberationRoundRoot, `${lensId}.md`),
    })),
    teamlead_deliberation_prompt_packet_path: path.join(
      promptRoot,
      "controlled-deliberation.prompt.md",
    ),
    synthesize_prompt_packet_path: path.join(promptRoot, "synthesize.prompt.md"),
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

async function writeOutput(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `# ${path.basename(filePath)}\n`, "utf8");
}

function result(
  unitId: string,
  unitKind: ReviewUnitExecutionResult["unit_kind"],
  packetPath: string,
  outputPath: string,
  status: ReviewUnitExecutionResult["status"] = "completed",
): ReviewUnitExecutionResult {
  return {
    unit_id: unitId,
    unit_kind: unitKind,
    packet_path: packetPath,
    output_path: outputPath,
    status,
    started_at: "2026-05-27T00:00:00.000Z",
    completed_at: "2026-05-27T00:00:01.000Z",
    duration_ms: 1000,
    timestamp_provenance: "runner_wallclock",
    failure_message: status === "failed" ? `${unitId} failed` : null,
  };
}

function executionResult(plan: ReviewExecutionPlan): ReviewExecutionResultArtifact {
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
    synthesis_executed: true,
    deliberation_status: "performed",
    error_log_path: plan.error_log_path,
    lens_execution_results: plan.lens_prompt_packet_seats.map((seat) =>
      result(seat.lens_id, "lens", seat.packet_path, seat.output_path),
    ),
    issue_artifact_execution_results:
      plan.issue_artifact_prompt_packet_seats.map((seat) =>
        result(seat.artifact_id, "issue_artifact", seat.packet_path, seat.output_path),
      ),
    deliberation_execution_results: [
      ...plan.lens_deliberation_prompt_packet_seats.map((seat) =>
        result(
          `deliberation-${seat.lens_id}`,
          "deliberation",
          seat.packet_path,
          seat.output_path,
        ),
      ),
      result(
        "controlled-deliberation",
        "deliberation",
        plan.teamlead_deliberation_prompt_packet_path,
        plan.deliberation_output_path,
      ),
    ],
    synthesize_execution_result: result(
      "synthesize",
      "synthesize",
      plan.synthesize_prompt_packet_path,
      plan.synthesis_output_path,
    ),
  };
}

describe("buildReviewPipelineExecutionLedger", () => {
  it("marks prepared sessions as planned with downstream not reached", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);

    const ledger = await buildReviewPipelineExecutionLedger({
      sessionRoot: root,
      executionPlan: plan,
    });

    expect(ledger.pipeline).toBe("review");
    expect(ledger.units.find((unit) => unit.unitId === "logic")?.status)
      .toBe("planned");
    expect(ledger.units.find((unit) => unit.unitId === "finding-ledger")?.status)
      .toBe("not_reached");
    expect(
      ledger.units.find((unit) => unit.unitId === "finding-ledger")?.trustStatus,
    ).toBe("blocked_by_upstream");
  });

  it("trusts completed units only when their output seats exist", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    const runResult = executionResult(plan);
    for (const unitResult of [
      ...runResult.lens_execution_results,
      ...(runResult.issue_artifact_execution_results ?? []),
      ...(runResult.deliberation_execution_results ?? []),
      runResult.synthesize_execution_result,
    ]) {
      if (unitResult) await writeOutput(unitResult.output_path);
    }

    const ledger = await buildReviewPipelineExecutionLedger({
      sessionRoot: root,
      executionPlan: plan,
      executionResult: runResult,
    });

    expect(ledger.units.every((unit) => unit.trustStatus === "trusted"))
      .toBe(true);
    expect(ledger.units.find((unit) => unit.unitId === "synthesize")?.outputHashes[
      plan.synthesis_output_path
    ]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("makes each deliberation response depend on every participating lens output", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root, ["logic", "coverage", "axiology"]);

    const ledger = await buildReviewPipelineExecutionLedger({
      sessionRoot: root,
      executionPlan: plan,
    });

    expect(
      ledger.units.find((unit) => unit.unitId === "deliberation-logic")
        ?.upstreamUnitIds,
    ).toEqual(["deliberation-plan", "logic", "coverage", "axiology"]);
    expect(
      ledger.units.find((unit) => unit.unitId === "coverage")?.downstreamUnitIds,
    ).toContain("deliberation-logic");
  });

  it("uses the lens completion barrier to locate failed lenses and block downstream trust", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeOutput(plan.lens_execution_seats[0]!.output_path);
    const barrier: ReviewLensCompletionBarrierArtifact = {
      schema_version: "1",
      session_id: plan.session_id,
      created_at: "2026-05-27T00:00:00.000Z",
      observed_dispatch_width: 2,
      minimum_participating_lenses: 2,
      planned_lens_ids: ["logic", "coverage"],
      completed_lens_ids: ["logic"],
      failed_lens_ids: ["coverage"],
      missing_lens_ids: [],
      degraded_lens_ids: ["coverage"],
      status: "failed",
      downstream_allowed: false,
      downstream_reason: "coverage failed",
    };

    const ledger = await buildReviewPipelineExecutionLedger({
      sessionRoot: root,
      executionPlan: plan,
      reviewRunManifest: { worker_units: [] },
      lensCompletionBarrier: barrier,
    });

    expect(ledger.units.find((unit) => unit.unitId === "logic")?.trustStatus)
      .toBe("trusted");
    expect(ledger.units.find((unit) => unit.unitId === "coverage")?.status)
      .toBe("failed");
    expect(
      ledger.units.find((unit) => unit.unitId === "finding-ledger")?.trustStatus,
    ).toBe("blocked_by_upstream");
  });
});
