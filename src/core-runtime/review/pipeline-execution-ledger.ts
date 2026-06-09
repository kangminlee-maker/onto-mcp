import path from "node:path";
import type {
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewIssueArtifactId,
  ReviewLensCompletionBarrierArtifact,
  ReviewUnitExecutionResult,
} from "./artifact-types.js";
import {
  deliberationResolutionPath,
  issueDeliberationPromptPacketPath,
  issueDeliberationResponsePath,
} from "./controlled-lens-deliberation.js";
import {
  synthesisLedgerPath,
  synthesisWorkItemsPath,
} from "./synthesis-map-reduce.js";
import { fileExists, readYamlDocument } from "./review-artifact-utils.js";
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
  /**
   * The unit is `completed` once its output seat exists on disk, even with no
   * execution-result/manifest entry. Used for the per-lens `issue-stance:<lens>`
   * map units: the onto-runtime path (A) runs them inside one collection dispatch
   * and records only the matrix result, but the per-lens response seat is the
   * durable proof each map unit ran (it is validated before the collection
   * succeeds). The host path (B) still records a per-unit result, which takes
   * precedence in the status chain.
   */
  trustedOnSeatPresence?: boolean;
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

function issueStanceResponsePath(
  executionPlan: ReviewExecutionPlan,
  lensId: string,
): string {
  return path.join(
    executionPlan.session_root,
    "stance-responses",
    `${lensId}.yaml`,
  );
}

function issueStanceResponsePaths(executionPlan: ReviewExecutionPlan): string[] {
  return executionPlan.lens_execution_seats.map((seat) =>
    issueStanceResponsePath(executionPlan, seat.lens_id),
  );
}

function issueStancePromptPacketPath(
  executionPlan: ReviewExecutionPlan,
  lensId: string,
): string {
  return path.join(
    executionPlan.prompt_packets_root,
    "issue-stance",
    `${lensId}.prompt.md`,
  );
}

/**
 * Per-lens stance "map" units (`issue-stance:<lens>`). Each is a host-executed
 * LLM unit upstream of the runtime `issue-stance-matrix` reduce; surfacing them
 * as discrete frontier units lets the host (B) drive each stance response, while
 * onto's reduce merges the trusted responses into the matrix. Derived purely
 * from the plan's lens seats (deterministic), so A and B agree.
 *
 * `collectionResultPresent` is true once an `issue-stance-matrix` execution
 * result exists — the signature of the onto path (A), which runs the per-lens
 * responses inside one collection dispatch and records only the matrix result.
 * In that case each map unit is trusted by its response seat alone (the seat is
 * validated before the collection succeeds). In the host path (B) the matrix
 * result does not exist until onto's reduce runs (after the host's per-unit
 * results are recorded), so seat presence must NOT trust the unit early — that
 * would drop it from the frontier before the host can advance it.
 */
function dynamicIssueStanceUnits(
  executionPlan: ReviewExecutionPlan,
  collectionResultPresent: boolean,
): ReviewLedgerPlannedUnit[] {
  return executionPlan.lens_execution_seats.map((seat) => ({
    unitId: `issue-stance:${seat.lens_id}`,
    unitKind: "issue_artifact",
    owner: "host_llm",
    packetRef: issueStancePromptPacketPath(executionPlan, seat.lens_id),
    outputRefs: [issueStanceResponsePath(executionPlan, seat.lens_id)],
    upstreamUnitIds: ["issue-ledger"],
    ...(collectionResultPresent ? { trustedOnSeatPresence: true } : {}),
  }));
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
    ...(executionResult.synthesis_map_execution_results ?? []),
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

/**
 * Per-issue deliberation map units (`deliberation:<issue>:<lens>`) derived from
 * the durable `deliberation-plan.yaml`. The host path (B) needs these surfaced
 * before any execution-result exists, so the frontier can drive each map unit;
 * the onto path (A) records them as execution results. Both sources are merged
 * by `unit_id` (disk-derived first, recorded entries override), and in A the two
 * sources yield the same set ⇒ no regression. Fail-soft: a missing or malformed
 * plan yields no disk units.
 */
async function deliberationUnitsFromDisk(
  executionPlan: ReviewExecutionPlan,
): Promise<ReviewLedgerPlannedUnit[]> {
  const planPath = executionPlan.deliberation_plan_path;
  if (!planPath || !(await fileExists(planPath))) return [];
  const doc = await readYamlDocument<Record<string, unknown>>(planPath);
  const plannedIssues = Array.isArray(doc?.planned_issues) ? doc.planned_issues : [];
  const units: ReviewLedgerPlannedUnit[] = [];
  for (const entry of plannedIssues) {
    if (entry === null || typeof entry !== "object") continue;
    const issueId = (entry as { issue_id?: unknown }).issue_id;
    const lensIds = (entry as { participating_lens_ids?: unknown }).participating_lens_ids;
    if (typeof issueId !== "string" || !Array.isArray(lensIds)) continue;
    for (const lensId of lensIds) {
      if (typeof lensId !== "string") continue;
      units.push({
        unitId: `deliberation:${issueId}:${lensId}`,
        unitKind: "deliberation",
        owner: "host_llm",
        packetRef: issueDeliberationPromptPacketPath({
          promptPacketsRoot: executionPlan.prompt_packets_root,
          issueId,
          lensId,
        }),
        outputRefs: [
          issueDeliberationResponsePath({
            deliberationRootPath: executionPlan.deliberation_root_path,
            issueId,
            lensId,
          }),
        ],
        upstreamUnitIds: ["deliberation-plan"],
      });
    }
  }
  return units;
}

function dynamicIssueDeliberationUnits(args: {
  diskUnits: ReviewLedgerPlannedUnit[];
  executionResult?: ReviewExecutionResultArtifact | null | undefined;
  reviewRunManifest?: ReviewRunManifestForLedger | null | undefined;
}): ReviewLedgerPlannedUnit[] {
  const byUnitId = new Map<string, ReviewLedgerPlannedUnit>();
  for (const unit of args.diskUnits) byUnitId.set(unit.unitId, unit);
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

/**
 * Per-issue synthesis map units (`synthesis:<issue>`) derived from the durable
 * `synthesis-work-items.yaml`. Same rationale as {@link deliberationUnitsFromDisk}:
 * surface map units before any execution-result exists so the host (B) frontier
 * can drive each one. Each work item carries its own `packet_path`/`response_path`.
 * Fail-soft on missing/malformed artifact.
 */
async function synthesisUnitsFromDisk(
  executionPlan: ReviewExecutionPlan,
): Promise<ReviewLedgerPlannedUnit[]> {
  const workItemsPath = synthesisWorkItemsPath(executionPlan.session_root);
  if (!(await fileExists(workItemsPath))) return [];
  const doc = await readYamlDocument<Record<string, unknown>>(workItemsPath);
  const workItems = Array.isArray(doc?.work_items) ? doc.work_items : [];
  const units: ReviewLedgerPlannedUnit[] = [];
  for (const item of workItems) {
    if (item === null || typeof item !== "object") continue;
    const workItemId = (item as { work_item_id?: unknown }).work_item_id;
    if (typeof workItemId !== "string" || !workItemId.startsWith("synthesis:")) continue;
    const packetPath = (item as { packet_path?: unknown }).packet_path;
    const responsePath = (item as { response_path?: unknown }).response_path;
    units.push({
      unitId: workItemId,
      unitKind: "synthesize",
      owner: "host_llm",
      packetRef: typeof packetPath === "string" ? packetPath : null,
      outputRefs: typeof responsePath === "string" ? [responsePath] : [],
      upstreamUnitIds: ["problem-framing"],
    });
  }
  return units;
}

function dynamicIssueSynthesisUnits(args: {
  diskUnits: ReviewLedgerPlannedUnit[];
  executionResult?: ReviewExecutionResultArtifact | null | undefined;
  reviewRunManifest?: ReviewRunManifestForLedger | null | undefined;
}): ReviewLedgerPlannedUnit[] {
  const byUnitId = new Map<string, ReviewLedgerPlannedUnit>();
  for (const unit of args.diskUnits) byUnitId.set(unit.unitId, unit);
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
  dynamicStanceUnits: ReviewLedgerPlannedUnit[],
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

  const stanceUnitIds = dynamicStanceUnits.map((unit) => unit.unitId);
  for (const [index, artifactId] of PRE_DELIBERATION_ISSUE_ARTIFACT_ORDER.entries()) {
    const previousArtifactId = PRE_DELIBERATION_ISSUE_ARTIFACT_ORDER[index - 1];
    const upstreamUnitIds =
      index === 0
        ? lensUnitIds
        : previousArtifactId
          ? [previousArtifactId]
          : lensUnitIds;
    if (artifactId === "issue-stance-matrix") {
      // The matrix is a runtime reduce of the per-lens stance "map" units; insert
      // those units (upstream issue-ledger) and rewire the matrix onto them.
      units.push(...dynamicStanceUnits);
      units.push({
        unitId: artifactId,
        unitKind: "issue_artifact",
        owner: "runtime",
        packetRef: issueArtifactPacketPath(executionPlan, artifactId),
        outputRefs: [issueArtifactOutputPath(executionPlan, artifactId)],
        additionalConsumedRefs: issueStanceResponsePaths(executionPlan),
        upstreamUnitIds: stanceUnitIds.length > 0 ? stanceUnitIds : upstreamUnitIds,
      });
      continue;
    }
    units.push({
      unitId: artifactId,
      unitKind: "issue_artifact",
      owner: "host_llm",
      packetRef: issueArtifactPacketPath(executionPlan, artifactId),
      outputRefs: [issueArtifactOutputPath(executionPlan, artifactId)],
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
    (args.plannedUnit.trustedOnSeatPresence &&
    outputRefs.length > 0 &&
    outputRefs.every((ref) => typeof outputHashes[ref] === "string")
      ? "completed"
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
  const [deliberationDiskUnits, synthesisDiskUnits] = await Promise.all([
    deliberationUnitsFromDisk(params.executionPlan),
    synthesisUnitsFromDisk(params.executionPlan),
  ]);
  const collectionResultPresent = allExecutionResults(params.executionResult).some(
    (result) => result.unit_id === "issue-stance-matrix",
  );
  const units = plannedReviewUnits(
    params.executionPlan,
    dynamicIssueStanceUnits(params.executionPlan, collectionResultPresent),
    dynamicIssueDeliberationUnits({
      diskUnits: deliberationDiskUnits,
      executionResult: params.executionResult,
      reviewRunManifest: params.reviewRunManifest,
    }),
    dynamicIssueSynthesisUnits({
      diskUnits: synthesisDiskUnits,
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
