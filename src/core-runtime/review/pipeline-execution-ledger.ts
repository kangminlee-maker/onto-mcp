import path from "node:path";
import type {
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewIssueArtifactId,
  ReviewLensCompletionBarrierArtifact,
  ReviewUnitExecutionResult,
} from "./artifact-types.js";
import {
  PIPELINE_EXECUTION_LEDGER_SCHEMA_VERSION,
  buildLedgerTrust,
  buildOutputHashes,
  fileSha256IfPresent,
  isTrustedLedgerUnit,
  normalizeLedgerRefs,
  type PipelineExecutionLedger,
  type PipelineExecutionLedgerUnitEntry,
  type PipelineExecutionOwner,
  type PipelineExecutionUnitStatus,
} from "../pipeline-execution-ledger.js";

const PRE_DELIBERATION_ISSUE_ARTIFACT_ORDER: readonly ReviewIssueArtifactId[] = [
  "finding-ledger",
  "finding-relation-graph",
  "issue-ledger",
  "issue-stance-matrix",
  "deliberation-plan",
];

export interface ReviewRunManifestWorkerUnitForLedger {
  unit_id?: string;
  unit_kind?: string;
  packet_path?: string;
  packet_sha256?: string | null;
  output_path?: string;
  output_sha256?: string | null;
  status?: string;
  failure_message?: string | null;
}

export interface ReviewRunManifestForLedger {
  artifact_refs?: Record<string, string | null | undefined>;
  worker_units?: ReviewRunManifestWorkerUnitForLedger[];
}

interface ReviewLedgerPlannedUnit {
  unitId: string;
  unitKind: string;
  owner: PipelineExecutionOwner;
  packetRef: string | null;
  outputRefs: string[];
  upstreamUnitIds: string[];
}

export interface BuildReviewPipelineExecutionLedgerParams {
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
  artifactRefs?: Record<string, string>;
  executionResult?: ReviewExecutionResultArtifact | null;
  reviewRunManifest?: ReviewRunManifestForLedger | null;
  lensCompletionBarrier?: ReviewLensCompletionBarrierArtifact | null;
}

function issueArtifactOutputPath(
  executionPlan: ReviewExecutionPlan,
  artifactId: ReviewIssueArtifactId,
): string {
  switch (artifactId) {
    case "finding-ledger":
      return executionPlan.finding_ledger_path;
    case "finding-relation-graph":
      return executionPlan.finding_relation_graph_path;
    case "issue-ledger":
      return executionPlan.issue_ledger_path;
    case "issue-stance-matrix":
      return executionPlan.issue_stance_matrix_path;
    case "deliberation-plan":
      return executionPlan.deliberation_plan_path;
    case "problem-framing":
      return executionPlan.problem_framing_path;
  }
}

function issueArtifactPacketPath(
  executionPlan: ReviewExecutionPlan,
  artifactId: ReviewIssueArtifactId,
): string | null {
  return (
    executionPlan.issue_artifact_prompt_packet_seats.find(
      (seat) => seat.artifact_id === artifactId,
    )?.packet_path ?? null
  );
}

function allExecutionResults(
  executionResult: ReviewExecutionResultArtifact | null | undefined,
): ReviewUnitExecutionResult[] {
  if (!executionResult) return [];
  return [
    ...executionResult.lens_execution_results,
    ...(executionResult.issue_artifact_execution_results ?? []),
    ...(executionResult.deliberation_execution_results ?? []),
    ...(executionResult.synthesize_execution_result
      ? [executionResult.synthesize_execution_result]
      : []),
  ];
}

function statusFromWorkerUnit(
  workerUnit: ReviewRunManifestWorkerUnitForLedger | undefined,
): PipelineExecutionUnitStatus | null {
  if (workerUnit?.status === "completed") return "completed";
  if (workerUnit?.status === "failed") return "failed";
  if (workerUnit?.status === "skipped") return "skipped";
  return null;
}

function plannedReviewUnits(
  executionPlan: ReviewExecutionPlan,
): ReviewLedgerPlannedUnit[] {
  const lensUnitIds = executionPlan.lens_execution_seats.map((seat) => seat.lens_id);
  const units: ReviewLedgerPlannedUnit[] = executionPlan.lens_execution_seats.map(
    (seat) => ({
      unitId: seat.lens_id,
      unitKind: "lens",
      owner: "host_llm",
      packetRef:
        executionPlan.lens_prompt_packet_seats.find(
          (packetSeat) => packetSeat.lens_id === seat.lens_id,
        )?.packet_path ?? null,
      outputRefs: [seat.output_path],
      upstreamUnitIds: [],
    }),
  );

  for (const [index, artifactId] of PRE_DELIBERATION_ISSUE_ARTIFACT_ORDER.entries()) {
    const previousArtifactId = PRE_DELIBERATION_ISSUE_ARTIFACT_ORDER[index - 1];
    const upstreamUnitIds =
      index === 0
        ? lensUnitIds
        : previousArtifactId
          ? [previousArtifactId]
          : lensUnitIds;
    units.push({
      unitId: artifactId,
      unitKind: "issue_artifact",
      owner: "host_llm",
      packetRef: issueArtifactPacketPath(executionPlan, artifactId),
      outputRefs: [issueArtifactOutputPath(executionPlan, artifactId)],
      upstreamUnitIds,
    });
  }

  const deliberationPlanUnitId: ReviewIssueArtifactId = "deliberation-plan";
  const deliberationUnitIds = executionPlan.lens_deliberation_prompt_packet_seats.map(
    (seat) => `deliberation-${seat.lens_id}`,
  );
  for (const seat of executionPlan.lens_deliberation_prompt_packet_seats) {
    units.push({
      unitId: `deliberation-${seat.lens_id}`,
      unitKind: "deliberation",
      owner: "host_llm",
      packetRef: seat.packet_path,
      outputRefs: [seat.output_path],
      upstreamUnitIds: [deliberationPlanUnitId, seat.lens_id],
    });
  }

  units.push({
    unitId: "controlled-deliberation",
    unitKind: "deliberation",
    owner: "host_llm",
    packetRef: executionPlan.teamlead_deliberation_prompt_packet_path,
    outputRefs: [executionPlan.deliberation_output_path],
    upstreamUnitIds: deliberationUnitIds,
  });
  units.push({
    unitId: "problem-framing",
    unitKind: "issue_artifact",
    owner: "host_llm",
    packetRef: issueArtifactPacketPath(executionPlan, "problem-framing"),
    outputRefs: [executionPlan.problem_framing_path],
    upstreamUnitIds: ["controlled-deliberation"],
  });
  units.push({
    unitId: "synthesize",
    unitKind: "synthesize",
    owner: "host_llm",
    packetRef: executionPlan.synthesize_prompt_packet_path,
    outputRefs: [executionPlan.synthesis_output_path],
    upstreamUnitIds: ["controlled-deliberation", "problem-framing"],
  });

  return units;
}

function downstreamMap(
  units: readonly ReviewLedgerPlannedUnit[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const unit of units) map.set(unit.unitId, []);
  for (const unit of units) {
    for (const upstreamUnitId of unit.upstreamUnitIds) {
      map.set(upstreamUnitId, [...(map.get(upstreamUnitId) ?? []), unit.unitId]);
    }
  }
  return map;
}

function statusFromBarrier(args: {
  unitId: string;
  lensCompletionBarrier: ReviewLensCompletionBarrierArtifact | null | undefined;
}): PipelineExecutionUnitStatus | null {
  const barrier = args.lensCompletionBarrier;
  if (!barrier) return null;
  if (barrier.completed_lens_ids.includes(args.unitId)) return "completed";
  if (barrier.failed_lens_ids.includes(args.unitId)) return "failed";
  if (barrier.missing_lens_ids.includes(args.unitId)) return "missing";
  return null;
}

function deriveMissingStatus(args: {
  unit: ReviewLedgerPlannedUnit;
  hasExecutionResult: boolean;
  hasReviewRunManifest: boolean;
  upstreamTrusted: boolean;
}): PipelineExecutionUnitStatus {
  if (!args.hasExecutionResult && !args.hasReviewRunManifest) {
    return args.unit.upstreamUnitIds.length === 0 ? "planned" : "not_reached";
  }
  if (!args.upstreamTrusted) return "not_reached";
  return "missing";
}

async function buildUnitEntry(args: {
  plannedUnit: ReviewLedgerPlannedUnit;
  downstreamUnitIds: string[];
  outputRefsByUnitId: Map<string, string[]>;
  executionResult: ReviewUnitExecutionResult | undefined;
  workerUnit: ReviewRunManifestWorkerUnitForLedger | undefined;
  lensCompletionBarrier: ReviewLensCompletionBarrierArtifact | null | undefined;
  hasExecutionResult: boolean;
  hasReviewRunManifest: boolean;
  trustedUnitIds: Set<string>;
}): Promise<PipelineExecutionLedgerUnitEntry> {
  const packetRef =
    args.executionResult?.packet_path ??
    args.workerUnit?.packet_path ??
    args.plannedUnit.packetRef;
  const outputRefs = [
    args.executionResult?.output_path ??
      args.workerUnit?.output_path ??
      args.plannedUnit.outputRefs[0],
  ].filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
  const outputHashes = await buildOutputHashes(outputRefs);
  const upstreamTrusted = args.plannedUnit.upstreamUnitIds.every((unitId) =>
    args.trustedUnitIds.has(unitId),
  );
  const status =
    args.executionResult?.status ??
    statusFromWorkerUnit(args.workerUnit) ??
    (args.plannedUnit.unitKind === "lens"
      ? statusFromBarrier({
          unitId: args.plannedUnit.unitId,
          lensCompletionBarrier: args.lensCompletionBarrier,
        })
      : null) ??
    deriveMissingStatus({
      unit: args.plannedUnit,
      hasExecutionResult: args.hasExecutionResult,
      hasReviewRunManifest: args.hasReviewRunManifest,
      upstreamTrusted,
    });
  const lastFailureMessage =
    args.executionResult?.failure_message ??
    args.workerUnit?.failure_message ??
    null;
  const trust = buildLedgerTrust({
    status,
    outputRefs,
    outputHashes,
    upstreamTrusted,
    lastFailureMessage,
  });
  const packetSha256 =
    args.workerUnit?.packet_sha256 ?? await fileSha256IfPresent(packetRef);
  const upstreamOutputRefs = args.plannedUnit.upstreamUnitIds.flatMap(
    (unitId) => args.outputRefsByUnitId.get(unitId) ?? [],
  );

  return {
    unitId: args.plannedUnit.unitId,
    unitKind: args.plannedUnit.unitKind,
    owner: args.plannedUnit.owner,
    producedArtifactRefs: outputRefs,
    consumedArtifactRefs: normalizeLedgerRefs([
      packetRef,
      ...upstreamOutputRefs,
    ]),
    ...(packetRef !== null ? { packetRef } : {}),
    ...(packetSha256 !== null ? { packetSha256 } : {}),
    outputRefs,
    outputHashes,
    status,
    trustStatus: trust.trustStatus,
    trustReason: trust.trustReason,
    attemptCount: args.executionResult || args.workerUnit ? 1 : 0,
    lastFailureMessage,
    upstreamUnitIds: args.plannedUnit.upstreamUnitIds,
    downstreamUnitIds: args.downstreamUnitIds,
  };
}

export async function buildReviewPipelineExecutionLedger(
  params: BuildReviewPipelineExecutionLedgerParams,
): Promise<PipelineExecutionLedger> {
  const units = plannedReviewUnits(params.executionPlan);
  const downstreamUnitIds = downstreamMap(units);
  const outputRefsByUnitId = new Map(
    units.map((unit) => [unit.unitId, unit.outputRefs] as const),
  );
  const executionResultsByUnitId = new Map(
    allExecutionResults(params.executionResult).map((result) => [
      result.unit_id,
      result,
    ]),
  );
  const workerUnitsByUnitId = new Map(
    (params.reviewRunManifest?.worker_units ?? [])
      .filter((unit) => typeof unit.unit_id === "string")
      .map((unit) => [unit.unit_id as string, unit]),
  );
  const trustedUnitIds = new Set<string>();
  const ledgerUnits: PipelineExecutionLedgerUnitEntry[] = [];

  for (const plannedUnit of units) {
    const entry = await buildUnitEntry({
      plannedUnit,
      downstreamUnitIds: downstreamUnitIds.get(plannedUnit.unitId) ?? [],
      outputRefsByUnitId,
      executionResult: executionResultsByUnitId.get(plannedUnit.unitId),
      workerUnit: workerUnitsByUnitId.get(plannedUnit.unitId),
      lensCompletionBarrier: params.lensCompletionBarrier,
      hasExecutionResult: params.executionResult !== null && params.executionResult !== undefined,
      hasReviewRunManifest:
        params.reviewRunManifest !== null && params.reviewRunManifest !== undefined,
      trustedUnitIds,
    });
    ledgerUnits.push(entry);
    if (isTrustedLedgerUnit(entry)) trustedUnitIds.add(entry.unitId);
  }

  return {
    schemaVersion: PIPELINE_EXECUTION_LEDGER_SCHEMA_VERSION,
    pipeline: "review",
    sessionId: params.executionPlan.session_id || path.basename(params.sessionRoot),
    sourceRefs: normalizeLedgerRefs([
      params.artifactRefs?.execution_plan,
      params.artifactRefs?.review_run_manifest,
      params.artifactRefs?.execution_result,
      params.artifactRefs?.lens_completion_barrier,
      params.artifactRefs?.review_context_manifest,
      params.artifactRefs?.finding_ledger,
      params.artifactRefs?.issue_ledger,
      ...Object.values(params.reviewRunManifest?.artifact_refs ?? {}),
    ]),
    units: ledgerUnits,
  };
}
