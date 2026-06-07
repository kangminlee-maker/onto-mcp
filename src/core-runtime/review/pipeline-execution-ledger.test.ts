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
import type { ReviewRunManifestForLedger } from "./pipeline-execution-ledger.js";
import { buildReviewPipelineExecutionLedger } from "./pipeline-execution-ledger.js";
import { fileSha256IfPresent } from "../pipeline-execution-ledger.js";

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
      ...plan.lens_prompt_packet_seats.map((seat) =>
        result(
          `deliberation:issue-001:${seat.lens_id}`,
          "deliberation",
          path.join(
            plan.prompt_packets_root,
            "deliberation",
            "issue-001",
            `${seat.lens_id}.prompt.md`,
          ),
          path.join(
            plan.deliberation_root_path,
            "responses",
            "issue-001",
            `${seat.lens_id}.yaml`,
          ),
        ),
      ),
      result(
        "controlled-deliberation",
        "deliberation",
        plan.teamlead_deliberation_prompt_packet_path,
        path.join(plan.session_root, "deliberation-resolution.yaml"),
      ),
    ],
    synthesize_execution_result: result(
      "synthesize",
      "synthesize",
      path.join(plan.session_root, "synthesis-work-items.yaml"),
      path.join(plan.session_root, "synthesis-ledger.yaml"),
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
    await writeOutput(plan.synthesis_output_path);

    const ledger = await buildReviewPipelineExecutionLedger({
      sessionRoot: root,
      executionPlan: plan,
      executionResult: runResult,
    });

    expect(ledger.units.every((unit) => unit.trustStatus === "trusted"))
      .toBe(true);
    expect(ledger.units.find((unit) => unit.unitId === "synthesize")?.outputHashes[
      path.join(plan.session_root, "synthesis-ledger.yaml")
    ]).toMatch(/^[a-f0-9]{64}$/);
    expect(ledger.units.find((unit) => unit.unitId === "synthesize")?.outputHashes[
      plan.synthesis_output_path
    ]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not trust synthesize when its markdown projection is missing", async () => {
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

    const synthesize = ledger.units.find((unit) => unit.unitId === "synthesize");
    expect(synthesize?.outputRefs).toEqual([
      path.join(plan.session_root, "synthesis-ledger.yaml"),
      plan.synthesis_output_path,
    ]);
    expect(synthesize?.trustStatus).toBe("untrusted");
    expect(synthesize?.trustReason).toContain("missing required output refs");
  });

  it("does not trust completed units when manifest output hash is stale", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root, ["logic"]);
    const logicOutputPath = plan.lens_prompt_packet_seats[0]!.output_path;
    await writeOutput(logicOutputPath);

    const ledger = await buildReviewPipelineExecutionLedger({
      sessionRoot: root,
      executionPlan: plan,
      reviewRunManifest: {
        worker_units: [
          {
            unit_id: "logic",
            unit_kind: "lens",
            output_path: logicOutputPath,
            output_sha256: "stale-hash",
            status: "completed",
          },
        ],
      },
    });

    const logic = ledger.units.find((unit) => unit.unitId === "logic");
    expect(logic?.trustStatus).toBe("untrusted");
    expect(logic?.trustReason).toContain("output hash does not match");
  });

  it("does not trust synthesize when its projection hash differs from manifest provenance", async () => {
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
    await writeOutput(plan.synthesis_output_path);
    const synthesisLedgerPath = path.join(plan.session_root, "synthesis-ledger.yaml");
    const manifest: ReviewRunManifestForLedger = {
      synthesis_provenance: {
        synthesis_ledger_path: synthesisLedgerPath,
        synthesis_ledger_sha256: await fileSha256IfPresent(synthesisLedgerPath),
        synthesis_output_path: plan.synthesis_output_path,
        synthesis_output_sha256: await fileSha256IfPresent(plan.synthesis_output_path),
      },
    };
    await fs.writeFile(plan.synthesis_output_path, "# tampered synthesis projection\n", "utf8");

    const ledger = await buildReviewPipelineExecutionLedger({
      sessionRoot: root,
      executionPlan: plan,
      executionResult: runResult,
      reviewRunManifest: manifest,
    });

    const synthesize = ledger.units.find((unit) => unit.unitId === "synthesize");
    expect(synthesize?.trustStatus).toBe("untrusted");
    expect(synthesize?.trustReason).toContain("output hash does not match");
  });

  it("connects dynamic issue-scoped deliberation responses before teamlead resolution", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root, ["logic", "coverage", "axiology"]);
    const runResult = executionResult(plan);

    const ledger = await buildReviewPipelineExecutionLedger({
      sessionRoot: root,
      executionPlan: plan,
      executionResult: runResult,
    });

    expect(
      ledger.units.find((unit) => unit.unitId === "deliberation:issue-001:logic")
        ?.upstreamUnitIds,
    ).toEqual(["deliberation-plan"]);
    expect(
      ledger.units.find((unit) => unit.unitId === "deliberation-plan")?.downstreamUnitIds,
    ).toContain("deliberation:issue-001:logic");
    expect(
      ledger.units.find((unit) => unit.unitId === "controlled-deliberation")
        ?.upstreamUnitIds,
    ).toContain("deliberation:issue-001:logic");
  });

  it("records the issue stance matrix as a runtime merge of per-lens stance responses", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root, ["logic", "coverage"]);

    const ledger = await buildReviewPipelineExecutionLedger({
      sessionRoot: root,
      executionPlan: plan,
    });

    const issueStanceMatrix = ledger.units.find(
      (unit) => unit.unitId === "issue-stance-matrix",
    );
    expect(issueStanceMatrix?.owner).toBe("runtime");
    expect(issueStanceMatrix?.consumedArtifactRefs).toContain(
      path.join(root, "stance-responses", "logic.yaml"),
    );
    expect(issueStanceMatrix?.consumedArtifactRefs).toContain(
      path.join(root, "stance-responses", "coverage.yaml"),
    );
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
