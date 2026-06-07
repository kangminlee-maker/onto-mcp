import path from "node:path";
import type { ReviewExecutionPlan } from "./artifact-types.js";
import { assertPathInsideRoot, realpathIfExists } from "../path-boundary.js";

async function assertSamePath(args: {
  label: string;
  expected: string;
  actual: string;
}): Promise<void> {
  const expected = path.resolve(args.expected);
  const actual = path.resolve(args.actual);
  if (expected === actual) return;
  const realExpected = await realpathIfExists(expected);
  const realActual = await realpathIfExists(actual);
  if (realExpected && realActual && path.resolve(realExpected) === path.resolve(realActual)) {
    return;
  }
  throw new Error(
    `${args.label} mismatch: expected ${expected}, received ${actual}`,
  );
}

async function assertExecutionPlanRefInsideSession(args: {
  sessionRoot: string;
  ref: string;
  label: string;
}): Promise<void> {
  const sessionRoot = path.resolve(args.sessionRoot);
  const resolvedRef = path.isAbsolute(args.ref)
    ? path.resolve(args.ref)
    : path.resolve(sessionRoot, args.ref);
  try {
    await assertPathInsideRoot({
      root: sessionRoot,
      candidate: resolvedRef,
      label: args.label,
    });
  } catch (error: unknown) {
    const message = (error instanceof Error ? error.message : String(error))
      .replace("parent realpath escapes allowed root", "parent realpath escapes the session root")
      .replace("realpath escapes allowed root", "realpath escapes the session root")
      .replace("escapes allowed root", "escapes the session root");
    throw new Error(`Review execution blocked because ${message}`);
  }
}

export async function assertReviewExecutionPlanSessionBoundary(args: {
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
}): Promise<void> {
  const { executionPlan, sessionRoot } = args;
  const plannedSessionRoot = path.isAbsolute(executionPlan.session_root)
    ? executionPlan.session_root
    : path.resolve(sessionRoot, executionPlan.session_root);
  await assertSamePath({
    label: "ReviewExecutionPlan.session_root",
    expected: sessionRoot,
    actual: plannedSessionRoot,
  });

  const refs: Array<{ label: string; ref: string | undefined }> = [
    { label: "interpretation_artifact_path", ref: executionPlan.interpretation_artifact_path },
    { label: "binding_output_path", ref: executionPlan.binding_output_path },
    { label: "session_metadata_path", ref: executionPlan.session_metadata_path },
    { label: "execution_preparation_root", ref: executionPlan.execution_preparation_root },
    { label: "round1_root", ref: executionPlan.round1_root },
    { label: "prompt_packets_root", ref: executionPlan.prompt_packets_root },
    {
      label: "teamlead_deliberation_prompt_packet_path",
      ref: executionPlan.teamlead_deliberation_prompt_packet_path,
    },
    { label: "actor_invocation_profiles_path", ref: executionPlan.actor_invocation_profiles_path },
    { label: "actor_consumer_bindings_path", ref: executionPlan.actor_consumer_bindings_path },
    { label: "domain_binding_path", ref: executionPlan.domain_binding_path },
    { label: "review_target_profile_path", ref: executionPlan.review_target_profile_path },
    {
      label: "review_value_alignment_criteria_path",
      ref: executionPlan.review_value_alignment_criteria_path,
    },
    { label: "review_context_manifest_path", ref: executionPlan.review_context_manifest_path },
    { label: "synthesis_output_path", ref: executionPlan.synthesis_output_path },
    { label: "finding_ledger_path", ref: executionPlan.finding_ledger_path },
    {
      label: "finding_relation_graph_path",
      ref: executionPlan.finding_relation_graph_path,
    },
    { label: "issue_ledger_path", ref: executionPlan.issue_ledger_path },
    { label: "issue_stance_matrix_path", ref: executionPlan.issue_stance_matrix_path },
    { label: "deliberation_plan_path", ref: executionPlan.deliberation_plan_path },
    { label: "problem_framing_path", ref: executionPlan.problem_framing_path },
    { label: "lens_completion_barrier_path", ref: executionPlan.lens_completion_barrier_path },
    { label: "deliberation_root_path", ref: executionPlan.deliberation_root_path },
    { label: "deliberation_output_path", ref: executionPlan.deliberation_output_path },
    { label: "execution_result_path", ref: executionPlan.execution_result_path },
    { label: "error_log_path", ref: executionPlan.error_log_path },
    { label: "final_output_path", ref: executionPlan.final_output_path },
    { label: "review_record_path", ref: executionPlan.review_record_path },
    ...executionPlan.lens_execution_seats.map((seat) => ({
      label: `lens_execution_seats.${seat.lens_id}.output_path`,
      ref: seat.output_path,
    })),
    ...executionPlan.lens_execution_seats.map((seat) => ({
      label: `lens_execution_seats.${seat.lens_id}.sidecar_output_path`,
      ref: seat.sidecar_output_path,
    })),
    ...executionPlan.lens_prompt_packet_seats.flatMap((seat) => [
      {
        label: `lens_prompt_packet_seats.${seat.lens_id}.packet_path`,
        ref: seat.packet_path,
      },
      {
        label: `lens_prompt_packet_seats.${seat.lens_id}.output_path`,
        ref: seat.output_path,
      },
      {
        label: `lens_prompt_packet_seats.${seat.lens_id}.sidecar_output_path`,
        ref: seat.sidecar_output_path,
      },
    ]),
    ...executionPlan.issue_artifact_prompt_packet_seats.flatMap((seat) => [
      {
        label: `issue_artifact_prompt_packet_seats.${seat.artifact_id}.packet_path`,
        ref: seat.packet_path,
      },
      {
        label: `issue_artifact_prompt_packet_seats.${seat.artifact_id}.output_path`,
        ref: seat.output_path,
      },
    ]),
  ];

  for (const { label, ref } of refs) {
    if (!ref) continue;
    await assertExecutionPlanRefInsideSession({ sessionRoot, ref, label });
  }
}
