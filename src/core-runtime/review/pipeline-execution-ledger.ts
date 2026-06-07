import path from "node:path";
import type {
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewIssueArtifactId,
  ReviewLensCompletionBarrierArtifact,
  ReviewUnitExecutionResult,
} from "./artifact-types.js";
import { deliberationResolutionPath } from "./controlled-lens-deliberation.js";
import {
  synthesisLedgerPath,
  synthesisWorkItemsPath,
} from "./synthesis-map-reduce.js";
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
  synthesis_provenance?: {
    synthesis_ledger_path?: string | null;
    synthesis_ledger_sha256?: string | null;
    synthesis_output_path?: string | null;
    synthesis_output_sha256?: string | null;
  };
}

interface ReviewLedgerPlannedUnit {
  unitId: string;
  unitKind: string;
  owner: PipelineExecutionOwner;
  packetRef: string | null;
  outputRefs: string[];
  additionalConsumedRefs?: string[];
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

function issueStanceResponsePaths(executionPlan: ReviewExecutionPlan): string[] {
  return executionPlan.lens_execution_seats.map((seat) =>
    path.join(
      executionPlan.session_root,
      "stance-responses",
      `${seat.lens_id}.yaml`,
    ),
  );
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
  const flatten = (result: ReviewUnitExecutionResult): ReviewUnitExecutionResult[] => [
    result,
    ...(result.child_results ?? []).flatMap(flatten),
  ];
  return [
    ...executionResult.lens_execution_results,
    ...(executionResult.issue_artifact_execution_results ?? []),
    ...(executionResult.deliberation_execution_results ?? []),
    ...(executionResult.synthesize_execution_result
      ? [executionResult.synthesize_execution_result]
      : []),
  ].flatMap(flatten);
}

function statusFromWorkerUnit(
  workerUnit: ReviewRunManifestWorkerUnitForLedger | undefined,
): PipelineExecutionUnitStatus | null {
  if (workerUnit?.status === "completed") return "completed";
  if (workerUnit?.status === "failed") return "failed";
  if (workerUnit?.status === "skipped") return "skipped";
  return null;
}

function dynamicIssueDeliberationUnits(args: {
  executionResult?: ReviewExecutionResultArtifact | null | undefined;
  reviewRunManifest?: ReviewRunManifestForLedger | null | undefined;
}): ReviewLedgerPlannedUnit[] {
  const byUnitId = new Map<string, ReviewLedgerPlannedUnit>();
  const add = (unit: {
    unit_id?: string;
    unit_kind?: string;
    packet_path?: string;
    output_path?: string;
  }): void => {
    if (
      typeof unit.unit_id !== "string" ||
      !unit.unit_id.startsWith("deliberation:") ||
      unit.unit_kind !== "deliberation"
    ) {
      return;
    }
    byUnitId.set(unit.unit_id, {
      unitId: unit.unit_id,
      unitKind: "deliberation",
      owner: "host_llm",
      packetRef: unit.packet_path ?? null,
      outputRefs: unit.output_path ? [unit.output_path] : [],
      upstreamUnitIds: ["deliberation-plan"],
    });
  };
  for (const result of args.executionResult?.deliberation_execution_results ?? []) {
    add(result);
  }
  for (const unit of args.reviewRunManifest?.worker_units ?? []) {
    add(unit);
  }
  return [...byUnitId.values()].sort((a, b) => a.unitId.localeCompare(b.unitId));
}

function dynamicIssueSynthesisUnits(args: {
  executionResult?: ReviewExecutionResultArtifact | null | undefined;
  reviewRunManifest?: ReviewRunManifestForLedger | null | undefined;
}): ReviewLedgerPlannedUnit[] {
  const byUnitId = new Map<string, ReviewLedgerPlannedUnit>();
  const add = (unit: {
    unit_id?: string;
    unit_kind?: string;
    packet_path?: string;
    output_path?: string;
  }): void => {
    if (
      typeof unit.unit_id !== "string" ||
      !unit.unit_id.startsWith("synthesis:") ||
      unit.unit_kind !== "synthesize"
    ) {
      return;
    }
    byUnitId.set(unit.unit_id, {
      unitId: unit.unit_id,
      unitKind: "synthesize",
      owner: "host_llm",
      packetRef: unit.packet_path ?? null,
      outputRefs: unit.output_path ? [unit.output_path] : [],
      upstreamUnitIds: ["problem-framing"],
    });
  };
  for (const result of allExecutionResults(args.executionResult)) {
    add(result);
  }
  for (const unit of args.reviewRunManifest?.worker_units ?? []) {
    add(unit);
  }
  return [...byUnitId.values()].sort((a, b) => a.unitId.localeCompare(b.unitId));
}

function plannedReviewUnits(
  executionPlan: ReviewExecutionPlan,
  dynamicDeliberationUnits: ReviewLedgerPlannedUnit[],
  dynamicSynthesisUnits: ReviewLedgerPlannedUnit[],
): ReviewLedgerPlannedUnit[] {
  const lensUnitIds = executionPlan.lens_execution_seats.map((seat) => seat.lens_id);
  const lensOutputRef = (seat: { lens_id: string; output_path: string; sidecar_output_path?: string }): string => {
    if (executionPlan.lens_output_format !== "sidecar") return seat.output_path;
    if (!seat.sidecar_output_path) {
      throw new Error(
        `Review pipeline ledger requires sidecar_output_path for sidecar lens output: ${seat.lens_id}`,
      );
    }
    return seat.sidecar_output_path;
  };
  const units: ReviewLedgerPlannedUnit[] = executionPlan.lens_execution_seats.map(
    (seat) => ({
      unitId: seat.lens_id,
      unitKind: "lens",
      owner: "host_llm",
      packetRef:
        executionPlan.lens_prompt_packet_seats.find(
          (packetSeat) => packetSeat.lens_id === seat.lens_id,
        )?.packet_path ?? null,
      outputRefs: [lensOutputRef(seat)],
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
      owner: artifactId === "issue-stance-matrix" ? "runtime" : "host_llm",
      packetRef: issueArtifactPacketPath(executionPlan, artifactId),
      outputRefs: [issueArtifactOutputPath(executionPlan, artifactId)],
      ...(artifactId === "issue-stance-matrix"
        ? { additionalConsumedRefs: issueStanceResponsePaths(executionPlan) }
        : {}),
      upstreamUnitIds,
    });
  }

  units.push(...dynamicDeliberationUnits);

  units.push({
    unitId: "controlled-deliberation",
    unitKind: "deliberation",
    owner: "host_llm",
    packetRef: executionPlan.teamlead_deliberation_prompt_packet_path,
    outputRefs: [deliberationResolutionPath(executionPlan.session_root)],
    upstreamUnitIds:
      dynamicDeliberationUnits.length > 0
        ? dynamicDeliberationUnits.map((unit) => unit.unitId)
        : ["deliberation-plan"],
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
    owner: "runtime",
    packetRef: synthesisWorkItemsPath(executionPlan.session_root),
    outputRefs: [
      synthesisLedgerPath(executionPlan.session_root),
      executionPlan.synthesis_output_path,
    ],
    upstreamUnitIds:
      dynamicSynthesisUnits.length > 0
        ? dynamicSynthesisUnits.map((unit) => unit.unitId)
        : ["controlled-deliberation", "problem-framing"],
  });

  return [...units.slice(0, -1), ...dynamicSynthesisUnits, units[units.length - 1]!];
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

function requiredOutputRefs(args: {
  plannedUnit: ReviewLedgerPlannedUnit;
  executionResult: ReviewUnitExecutionResult | undefined;
  workerUnit: ReviewRunManifestWorkerUnitForLedger | undefined;
}): string[] {
  return normalizeLedgerRefs([
    ...args.plannedUnit.outputRefs,
    args.executionResult?.output_path,
    args.workerUnit?.output_path,
  ]);
}

function addExpectedHash(
  hashes: Record<string, string>,
  outputPath: unknown,
  outputHash: unknown,
): void {
  if (
    typeof outputPath === "string" &&
    outputPath.length > 0 &&
    typeof outputHash === "string" &&
    outputHash.length > 0
  ) {
    hashes[outputPath] = outputHash;
  }
}

function expectedOutputHashes(args: {
  plannedUnit: ReviewLedgerPlannedUnit;
  workerUnit: ReviewRunManifestWorkerUnitForLedger | undefined;
  reviewRunManifest: ReviewRunManifestForLedger | null | undefined;
}): Record<string, string> {
  const hashes: Record<string, string> = {};
  addExpectedHash(hashes, args.workerUnit?.output_path, args.workerUnit?.output_sha256);
  if (args.plannedUnit.unitId === "synthesize") {
    const provenance = args.reviewRunManifest?.synthesis_provenance;
    addExpectedHash(
      hashes,
      provenance?.synthesis_ledger_path,
      provenance?.synthesis_ledger_sha256,
    );
    addExpectedHash(
      hashes,
      provenance?.synthesis_output_path,
      provenance?.synthesis_output_sha256,
    );
  }
  return hashes;
}

async function buildUnitEntry(args: {
  plannedUnit: ReviewLedgerPlannedUnit;
  downstreamUnitIds: string[];
  outputRefsByUnitId: Map<string, string[]>;
  executionResult: ReviewUnitExecutionResult | undefined;
  workerUnit: ReviewRunManifestWorkerUnitForLedger | undefined;
  reviewRunManifest: ReviewRunManifestForLedger | null | undefined;
  lensCompletionBarrier: ReviewLensCompletionBarrierArtifact | null | undefined;
  hasExecutionResult: boolean;
  hasReviewRunManifest: boolean;
  trustedUnitIds: Set<string>;
}): Promise<PipelineExecutionLedgerUnitEntry> {
  const packetRef =
    args.executionResult?.packet_path ??
    args.workerUnit?.packet_path ??
    args.plannedUnit.packetRef;
  const outputRefs = requiredOutputRefs(args);
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
    expectedOutputHashes: expectedOutputHashes({
      plannedUnit: args.plannedUnit,
      workerUnit: args.workerUnit,
      reviewRunManifest: args.reviewRunManifest,
    }),
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
      ...(args.plannedUnit.additionalConsumedRefs ?? []),
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
  const units = plannedReviewUnits(
    params.executionPlan,
    dynamicIssueDeliberationUnits({
      executionResult: params.executionResult,
      reviewRunManifest: params.reviewRunManifest,
    }),
    dynamicIssueSynthesisUnits({
      executionResult: params.executionResult,
      reviewRunManifest: params.reviewRunManifest,
    }),
  );
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
      reviewRunManifest: params.reviewRunManifest,
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
