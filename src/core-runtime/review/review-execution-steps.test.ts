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
import { requireTerminalExecutionResult } from "./artifact-types.js";
import type { ReviewContinuationUnit } from "./continuation-plan.js";
import {
  buildInitialExecutionResultScaffold,
  computeReviewFrontier,
  ensureUnitPacket,
  finalizeStageGate,
  mergeUnitResultIntoExecutionResult,
  reconstructIssueArtifactPacketInputs,
  reviewAdvance,
  reviewRound,
  validateUnitSeatToResult,
} from "./review-execution-steps.js";

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

// The production seed, not a look-alike. A local fixture used to declare
// `execution_status: "completed"` with the lens counters pre-filled — the exact
// inverse of what the runtime writes — so no test ever exercised the real
// mid-run shape and the artifact could contradict itself unnoticed.
function scaffoldExecutionResult(
  plan: ReviewExecutionPlan,
): ReviewExecutionResultArtifact {
  return buildInitialExecutionResultScaffold(plan);
}

function lensFrontierUnit(
  plan: ReviewExecutionPlan,
  lensId: string,
): ReviewContinuationUnit {
  const seat = plan.lens_prompt_packet_seats.find((s) => s.lens_id === lensId)!;
  return {
    unitId: lensId,
    unitKind: "lens",
    lensId,
    packetPath: seat.packet_path,
    outputPath: seat.output_path,
    priorStatus: "planned",
    dispatchDecision: "run",
    reason: "frontier",
  };
}

function issueArtifactFrontierUnit(
  plan: ReviewExecutionPlan,
  artifactId: ReviewIssueArtifactId,
): ReviewContinuationUnit {
  const seat = plan.issue_artifact_prompt_packet_seats.find(
    (s) => s.artifact_id === artifactId,
  )!;
  return {
    unitId: artifactId,
    unitKind: "issue_artifact",
    packetPath: seat.packet_path,
    outputPath: seat.output_path,
    priorStatus: "planned",
    dispatchDecision: "run",
    reason: "frontier",
  };
}

describe("validateUnitSeatToResult", () => {
  it("projects a present non-empty seat into a completed result", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    const unit = lensFrontierUnit(plan, "logic");
    await writeOutput(unit.outputPath!);

    const result = await validateUnitSeatToResult({
      sessionRoot: root,
      unit,
      recordedAt: "2026-06-09T00:00:00.000Z",
    });

    expect(result.status).toBe("completed");
    expect(result.unit_id).toBe("logic");
    expect(result.unit_kind).toBe("lens");
    expect(result.output_path).toBe(unit.outputPath);
    expect(result.failure_message).toBeNull();
    // Host ran the unit, not onto: timing is non-comparable.
    expect(result.timestamp_provenance).toBe("batch_window");
  });

  it("fails when the seat file is missing", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    const unit = lensFrontierUnit(plan, "logic");

    const result = await validateUnitSeatToResult({ sessionRoot: root, unit });

    expect(result.status).toBe("failed");
    expect(result.failure_kind).toBe("output_contract");
    expect(result.failure_message).toContain("did not create output file");
  });

  it("fails when the seat file is empty", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    const unit = lensFrontierUnit(plan, "logic");
    await fs.mkdir(path.dirname(unit.outputPath!), { recursive: true });
    await fs.writeFile(unit.outputPath!, "   \n", "utf8");

    const result = await validateUnitSeatToResult({ sessionRoot: root, unit });

    expect(result.status).toBe("failed");
    expect(result.failure_kind).toBe("empty_output");
  });

  it("fails a sidecar-format lens seat that is not a valid sidecar artifact", async () => {
    const root = await tempSessionRoot();
    const plan: ReviewExecutionPlan = {
      ...executionPlan(root),
      lens_output_format: "sidecar",
    };
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    const unit = lensFrontierUnit(plan, "logic");
    // A plain markdown body where a structured sidecar YAML is required.
    await writeOutput(unit.outputPath!);

    const result = await validateUnitSeatToResult({
      sessionRoot: root,
      unit,
      executionPlan: plan,
    });

    expect(result.status).toBe("failed");
    expect(result.failure_kind).toBe("output_contract");
  });
});

describe("unknown unit_kind guard (DAG-1 silent-drop)", () => {
  it("validateUnitSeatToResult fails loud for a unit_kind outside ReviewUnitKind", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    const unit = { ...lensFrontierUnit(plan, "logic"), unitKind: "bogus_kind" };
    await expect(
      validateUnitSeatToResult({ sessionRoot: root, unit, executionPlan: plan }),
    ).rejects.toThrow(/unknown unit_kind "bogus_kind"/);
  });

  it("mergeUnitResultIntoExecutionResult throws instead of silently dropping an unhandled unit_kind", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    const seat = plan.lens_prompt_packet_seats.find((s) => s.lens_id === "logic")!;
    const result = {
      ...lensResult("logic", seat.packet_path, seat.output_path),
      unit_kind: "bogus_kind" as ReviewUnitExecutionResult["unit_kind"],
    };
    await expect(
      mergeUnitResultIntoExecutionResult({
        sessionRoot: root,
        result,
        base: scaffoldExecutionResult(plan),
      }),
    ).rejects.toThrow(/no execution-result bucket for unit_kind "bogus_kind"/);
  });
});

describe("mergeUnitResultIntoExecutionResult", () => {
  it("creates execution-result.yaml from a base scaffold and buckets by unit_kind", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    const unit = lensFrontierUnit(plan, "logic");
    await writeOutput(unit.outputPath!);
    const result = await validateUnitSeatToResult({ sessionRoot: root, unit });

    const merged = await mergeUnitResultIntoExecutionResult({
      sessionRoot: root,
      result,
      base: scaffoldExecutionResult(plan),
    });

    expect(merged.lens_execution_results.map((r) => r.unit_id)).toEqual(["logic"]);
    const onDisk = YAML.parse(
      await fs.readFile(path.join(root, "execution-result.yaml"), "utf8"),
    ) as ReviewExecutionResultArtifact;
    expect(onDisk.lens_execution_results[0]?.status).toBe("completed");
  });

  it("upserts by unit_id into an existing execution-result (no duplicates)", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await writeYaml(
      path.join(root, "execution-result.yaml"),
      lensOnlyExecutionResult(plan),
    );
    const unit = issueArtifactFrontierUnit(plan, "finding-ledger");
    await writeOutput(unit.outputPath!);
    const result = await validateUnitSeatToResult({ sessionRoot: root, unit });

    await mergeUnitResultIntoExecutionResult({ sessionRoot: root, result });
    // Re-merging the same unit replaces rather than appends.
    const merged = await mergeUnitResultIntoExecutionResult({
      sessionRoot: root,
      result: { ...result, status: "completed" },
    });

    expect(merged.lens_execution_results).toHaveLength(2);
    expect(
      (merged.issue_artifact_execution_results ?? []).map((r) => r.unit_id),
    ).toEqual(["finding-ledger"]);
  });

  it("throws when neither an existing result nor a base scaffold is available", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    const unit = lensFrontierUnit(plan, "logic");
    await writeOutput(unit.outputPath!);
    const result = await validateUnitSeatToResult({ sessionRoot: root, unit });

    await expect(
      mergeUnitResultIntoExecutionResult({ sessionRoot: root, result }),
    ).rejects.toThrow(/requires an existing execution-result|base scaffold/);
  });

  it("advances the frontier when seats are validated and merged (durable round)", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);

    // Host wrote every lens seat; onto validates + merges each into the result.
    let base: ReviewExecutionResultArtifact | undefined =
      scaffoldExecutionResult(plan);
    for (const seat of plan.lens_execution_seats) {
      const unit = lensFrontierUnit(plan, seat.lens_id);
      await writeOutput(unit.outputPath!);
      const result = await validateUnitSeatToResult({ sessionRoot: root, unit });
      await mergeUnitResultIntoExecutionResult({ sessionRoot: root, result, base });
      base = undefined; // subsequent merges read the now-existing artifact
    }

    const frontier = await computeReviewFrontier(root);
    const frontierIds = frontier.frontierUnits.map((u) => u.unitId);
    expect(frontierIds).toContain("finding-ledger");
    expect(frontierIds).not.toContain("logic");
  });
});

// Regression: a mid-run execution-result read as a terminal one. Observed live
// on 2026-08-04 (development-records/benchmark/20260804-review-interim-artifact)
// — a session with nine completed lenses reported `halted_partial` /
// `executed_lens_count: 0`, and was read as a dead review.
describe("mid-run execution-result tells the truth about itself", () => {
  it("says running, and its lens summary matches its own lens results", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);

    let base: ReviewExecutionResultArtifact | undefined =
      buildInitialExecutionResultScaffold(plan);
    for (const seat of plan.lens_execution_seats) {
      const unit = lensFrontierUnit(plan, seat.lens_id);
      await writeOutput(unit.outputPath!);
      const result = await validateUnitSeatToResult({ sessionRoot: root, unit });
      await mergeUnitResultIntoExecutionResult({ sessionRoot: root, result, base });
      base = undefined;
    }

    const onDisk = YAML.parse(
      await fs.readFile(path.join(root, "execution-result.yaml"), "utf8"),
    ) as ReviewExecutionResultArtifact;
    const completedLensIds = onDisk.lens_execution_results
      .filter((result) => result.status === "completed")
      .map((result) => result.unit_id);

    // The subject set must be non-empty or every claim below passes vacuously.
    expect(completedLensIds.length).toBeGreaterThan(0);
    expect(onDisk.execution_status).toBe("running");
    expect(onDisk.executed_lens_count).toBe(completedLensIds.length);
    expect(onDisk.participating_lens_ids).toEqual(completedLensIds);
    // No terminal stamps on a run that has not terminated.
    expect(onDisk.execution_completed_at).toBeNull();
    expect(onDisk.total_duration_ms).toBeNull();
  });

  it("dates the run from the caller's start, not from when the scaffold was seeded", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    // The onto path seeds only after the lens phase; without the real start the
    // artifact would date the run from that moment and the progress projection
    // would understate elapsed time by the whole lens phase.
    const startedAtMs = Date.parse("2026-08-04T21:37:08+09:00");
    const seeded = buildInitialExecutionResultScaffold(plan, startedAtMs);
    expect(Date.parse(seeded.execution_started_at)).toBe(startedAtMs);
    // The host path seeds on its first advance, where "now" is the start.
    const hostSeeded = buildInitialExecutionResultScaffold(plan);
    expect(Date.parse(hostSeeded.execution_started_at)).toBeGreaterThan(startedAtMs);
  });

  it("refuses to yield a terminal projection while it is still running", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    expect(() =>
      requireTerminalExecutionResult(
        buildInitialExecutionResultScaffold(plan),
        "test",
      ),
    ).toThrow(/execution_status=running/);
  });

  // A terminal status with no completion stamp is a different failure from a run
  // still in flight, and one diagnosis for both told the operator to poll a
  // `completed` artifact until it terminated.
  it("names the missing stamps instead of calling a completed artifact running", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    const malformed: ReviewExecutionResultArtifact = {
      ...buildInitialExecutionResultScaffold(plan),
      execution_status: "completed",
    };
    expect(() => requireTerminalExecutionResult(malformed, "test")).toThrow(
      /execution_completed_at and total_duration_ms null/,
    );
    expect(() => requireTerminalExecutionResult(malformed, "test")).not.toThrow(
      /still running|execution_status=running/,
    );
  });

  // The sibling refusal — finalizeHostExecutionResultIfComplete throwing on an
  // unparseable `execution_started_at` rather than fabricating a 0 ms duration —
  // is only reachable once the whole host ledger converges, so no proportionate
  // unit test drives it. It is a defensive branch: our own writers always stamp
  // that field through isoNow()/isoFromTimestamp().

});

// Minimal-but-valid boundary fields so writeIssueArtifactPromptPacket can render
// a full prompt (mirrors the fixture in issue-artifact-runtime.test.ts).
function withBoundary(
  plan: ReviewExecutionPlan,
  projectRoot: string,
): ReviewExecutionPlan {
  const decision = {
    requested_policy: "denied",
    effective_policy: "denied",
    guarantee_level: "prompt_declared_only",
    notes: [],
  };
  return {
    ...plan,
    boundary_policy: {
      web_research_policy: "denied",
      repo_exploration_policy: "allowed",
      recursive_reference_expansion_policy: "denied",
      filesystem_scope: { allowed_roots: [projectRoot] },
      write_policy: {
        source_mutation_policy: "denied",
        allowed_output_refs: [plan.session_root],
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
      web_research: { ...decision, effective_policy: "denied" },
      repo_exploration: {
        ...decision,
        requested_policy: "allowed",
        effective_policy: "allowed",
      },
      recursive_reference_expansion: decision,
      source_mutation: decision,
      filesystem_scope: {
        requested_allowed_roots: [projectRoot],
        effective_allowed_roots: [projectRoot],
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
    },
  } as ReviewExecutionPlan;
}

async function writeSessionMetadata(
  plan: ReviewExecutionPlan,
  projectRoot: string,
  orchestration?: "runtime" | "host",
): Promise<void> {
  await writeYaml(plan.session_metadata_path, {
    session_id: plan.session_id,
    project_root: projectRoot,
    ...(orchestration ? { orchestration } : {}),
  });
}

async function materializeLensPackets(plan: ReviewExecutionPlan): Promise<void> {
  for (const seat of plan.lens_prompt_packet_seats) {
    await writeOutput(seat.packet_path);
  }
}

async function seedTrustedLensSeats(
  root: string,
  plan: ReviewExecutionPlan,
): Promise<void> {
  for (const seat of plan.lens_execution_seats) {
    await writeOutput(seat.output_path);
  }
  await writeYaml(
    path.join(root, "execution-result.yaml"),
    lensOnlyExecutionResult(plan),
  );
}

describe("reconstructIssueArtifactPacketInputs", () => {
  it("rebuilds lens output paths from trusted lens units + project root", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await writeSessionMetadata(plan, "/repo");
    await seedTrustedLensSeats(root, plan);

    const inputs = await reconstructIssueArtifactPacketInputs(
      root,
      "finding-relation-graph",
    );

    expect(inputs.projectRoot).toBe("/repo");
    expect(inputs.lensOutputPaths).toEqual(
      plan.lens_execution_seats.map((seat) => seat.output_path),
    );
    // Non-deliberation artifact: no deliberation refs.
    expect(inputs.deliberationResponsePaths).toEqual([]);
    expect(inputs.deliberationOutputPath).toBeUndefined();
    expect(inputs.problemFramingProfileRef).toBeNull();
  });

  it("omits untrusted lenses (only seats recorded completed count)", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await writeSessionMetadata(plan, "/repo");
    // No execution-result and no seats on disk -> no lens is trusted yet.

    const inputs = await reconstructIssueArtifactPacketInputs(
      root,
      "finding-relation-graph",
    );

    expect(inputs.lensOutputPaths).toEqual([]);
  });
});

describe("ensureUnitPacket", () => {
  it("is a noop for a lens unit whose packet prepare materialized", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    const unit = lensFrontierUnit(plan, "logic");
    await writeOutput(unit.packetPath!);

    const result = await ensureUnitPacket(root, unit);

    expect(result.generated).toBe(false);
    expect(result.packetPath).toBe(unit.packetPath);
  });

  it("throws for a lens unit whose prepared packet is missing", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    const unit = lensFrontierUnit(plan, "logic");

    await expect(ensureUnitPacket(root, unit)).rejects.toThrow(
      /lens packet missing/,
    );
  });

  it("reconstructs an issue-stance map packet from durable state", async () => {
    const root = await tempSessionRoot();
    const plan = withBoundary(executionPlan(root), root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await writeSessionMetadata(plan, root);
    await seedTrustedLensSeats(root, plan);
    await writeYaml(plan.finding_ledger_path, {
      session_id: plan.session_id,
      findings: [],
    });
    await writeYaml(plan.finding_relation_graph_path, {
      session_id: plan.session_id,
      relations: [],
      singleton_findings: [],
    });
    await writeYaml(plan.issue_ledger_path, {
      session_id: plan.session_id,
      issues: [],
      issue_dependencies: [],
    });

    const stanceUnit: ReviewContinuationUnit = {
      unitId: "issue-stance:logic",
      unitKind: "issue_artifact",
      packetPath: path.join(plan.prompt_packets_root, "issue-stance", "logic.prompt.md"),
      outputPath: path.join(root, "stance-responses", "logic.yaml"),
      priorStatus: "planned",
      dispatchDecision: "run",
      reason: "frontier",
    };
    const result = await ensureUnitPacket(root, stanceUnit);

    expect(result.generated).toBe(true);
    expect(result.packetPath).toBe(stanceUnit.packetPath);
    const packet = await fs.readFile(result.packetPath, "utf8");
    expect(packet).toContain("Issue Stance Response Prompt");
    expect(packet).toContain("Runtime Issue Stance Input Projection");
  });

  it("routes deliberation/synthesize units to their reconstruction adapters", async () => {
    const root = await tempSessionRoot();
    const plan = withBoundary(executionPlan(root), root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await writeSessionMetadata(plan, root);
    const synthUnit: ReviewContinuationUnit = {
      unitId: "synthesis:issue-001",
      unitKind: "synthesize",
      packetPath: path.join(plan.prompt_packets_root, "synthesis", "issue-001.prompt.md"),
      outputPath: path.join(root, "synthesis-responses", "issue-001.yaml"),
      priorStatus: "planned",
      dispatchDecision: "run",
      reason: "frontier",
    };

    // No synthesis-work-items.yaml on disk: the adapter is reached (no longer the
    // generic fail-closed throw), and fails reading the missing durable artifact.
    await expect(ensureUnitPacket(root, synthUnit)).rejects.not.toThrow(
      /unsupported unit kind/,
    );
  });

  it("generates an issue-artifact packet from durable state", async () => {
    const root = await tempSessionRoot();
    const plan = withBoundary(executionPlan(root), root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await writeSessionMetadata(plan, root);
    await seedTrustedLensSeats(root, plan);
    await writeYaml(plan.finding_ledger_path, {
      session_id: plan.session_id,
      findings: [],
    });

    const unit = issueArtifactFrontierUnit(plan, "finding-relation-graph");
    const result = await ensureUnitPacket(root, unit);

    expect(result.generated).toBe(true);
    expect(result.packetPath).toBe(unit.packetPath);
    const packet = await fs.readFile(result.packetPath, "utf8");
    expect(packet.trim().length).toBeGreaterThan(0);
  });
});

describe("finalizeStageGate", () => {
  it("passes the gate and allows downstream once every lens is trusted", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await seedTrustedLensSeats(root, plan);

    const barrier = await finalizeStageGate(root);

    expect(barrier.status).toBe("passed");
    expect(barrier.downstream_allowed).toBe(true);
    expect(barrier.completed_lens_ids).toEqual(
      expect.arrayContaining(["logic", "coverage"]),
    );
    expect(barrier.missing_lens_ids).toEqual([]);
    expect(barrier.degraded_lens_ids).toEqual([]);
    // The barrier is recorded for downstream consumers / completeReviewSession.
    const onDisk = YAML.parse(
      await fs.readFile(plan.lens_completion_barrier_path, "utf8"),
    ) as typeof barrier;
    expect(onDisk.downstream_allowed).toBe(true);
  });

  it("fails the gate and blocks downstream when a lens never completes", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root); // min participating = 2 lenses
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    // Only "logic" was produced + recorded; "coverage" never arrived.
    const logicSeat = plan.lens_execution_seats.find((s) => s.lens_id === "logic")!;
    await writeOutput(logicSeat.output_path);
    await writeYaml(path.join(root, "execution-result.yaml"), {
      ...lensOnlyExecutionResult(plan),
      lens_execution_results: [
        lensResult(
          "logic",
          plan.lens_prompt_packet_seats.find((s) => s.lens_id === "logic")!.packet_path,
          logicSeat.output_path,
        ),
      ],
    });

    const barrier = await finalizeStageGate(root);

    expect(barrier.downstream_allowed).toBe(false);
    expect(barrier.status).toBe("failed");
    expect(barrier.completed_lens_ids).toEqual(["logic"]);
    expect(barrier.missing_lens_ids).toContain("coverage");
  });
});

describe("reviewRound / reviewAdvance (host B engine)", () => {
  it("reviewRound returns the lens units (packets ensured) for a fresh host session", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await writeSessionMetadata(plan, root, "host");
    await materializeLensPackets(plan); // prepare materialized the lens packets

    const result = await reviewRound(root);

    expect(result.status).toBe("in_progress");
    if (result.status !== "in_progress") return;
    expect(result.ready_units.map((u) => u.unit_id)).toEqual(
      expect.arrayContaining(["logic", "coverage"]),
    );
    expect(result.ready_units.every((u) => u.unit_kind === "lens")).toBe(true);
  });

  it("reviewAdvance validates lens seats and advances the frontier to issue-artifacts", async () => {
    const root = await tempSessionRoot();
    const plan = withBoundary(executionPlan(root), root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await writeSessionMetadata(plan, root, "host");
    await materializeLensPackets(plan);
    // The host executed the lenses -> their seats are on disk.
    for (const seat of plan.lens_execution_seats) {
      await writeOutput(seat.output_path);
    }

    // No base passed: reviewAdvance self-seeds execution-result.yaml.
    const result = await reviewAdvance(root, ["logic", "coverage"]);

    expect(result.status).toBe("in_progress");
    if (result.status !== "in_progress") return;
    // Lenses are now trusted, so the first issue artifact is the next round.
    expect(result.ready_units.map((u) => u.unit_id)).toEqual(["finding-ledger"]);
    expect(result.ready_units[0]?.unit_kind).toBe("issue_artifact");
  });

  it("seeds the execution-result with the plan's resolved retry policy, not the default", async () => {
    const root = await tempSessionRoot();
    // A non-default (e.g. explicit zero-retry) policy stamped on the plan at prepare.
    const customRetry = {
      lens_max_retries: 0,
      issue_artifact_max_retries: 0,
      deliberation_max_retries: 0,
      synthesis_max_retries: 0,
      retry_initial_delay_ms: 500,
    };
    const plan = withBoundary(
      { ...executionPlan(root), retry_policy: customRetry },
      root,
    );
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await writeSessionMetadata(plan, root, "host");
    await materializeLensPackets(plan);
    for (const seat of plan.lens_execution_seats) {
      await writeOutput(seat.output_path);
    }

    // First advance self-seeds execution-result.yaml from the scaffold.
    await reviewAdvance(root, ["logic", "coverage"]);

    const onDisk = YAML.parse(
      await fs.readFile(plan.execution_result_path, "utf8"),
    ) as ReviewExecutionResultArtifact;
    expect(onDisk.retry_policy).toEqual(customRetry);
  });

  it("rejects a runtime-orchestrated session for both round and advance", async () => {
    const root = await tempSessionRoot();
    const plan = executionPlan(root);
    await writeYaml(path.join(root, "execution-plan.yaml"), plan);
    await writeSessionMetadata(plan, root); // no orchestration stamp -> runtime
    await materializeLensPackets(plan);

    await expect(reviewRound(root)).rejects.toThrow(
      /requires a host-orchestrated session/,
    );
    await expect(reviewAdvance(root, ["logic"])).rejects.toThrow(
      /requires a host-orchestrated session/,
    );
  });
});

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
