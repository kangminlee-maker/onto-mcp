import type {
  PipelineExecutionLedger,
  PipelineExecutionLedgerUnitEntry,
  PipelineExecutionUnitStatus,
} from "../pipeline-execution-ledger.js";
import { isTrustedLedgerUnit } from "../pipeline-execution-ledger.js";

export interface ReviewContinuationUnit {
  unitId: string;
  unitKind: string;
  lensId?: string | null;
  packetPath: string | null;
  outputPath: string | null;
  priorStatus: PipelineExecutionUnitStatus;
  dispatchDecision: "run" | "reuse" | "skip" | "reject";
  reason: string;
}

export interface ReviewContinuationPlan {
  schemaVersion: "1";
  sessionId: string;
  eligible: boolean;
  ineligibleReason: string | null;
  sourceRefs: string[];
  validationRefs: string[];
  unitLedger: PipelineExecutionLedger;
  frontierUnits: ReviewContinuationUnit[];
  downstreamUnits: ReviewContinuationUnit[];
  preservedArtifactRefs: string[];
  supersededArtifactRefs: string[];
}

export interface BuildReviewContinuationPlanParams {
  ledger: PipelineExecutionLedger;
  targetUnits?: string[];
}

function lensIdFromUnit(unit: PipelineExecutionLedgerUnitEntry): string | null {
  if (unit.unitKind === "lens") return unit.unitId;
  if (unit.unitId.startsWith("deliberation-")) {
    return unit.unitId.slice("deliberation-".length) || null;
  }
  return null;
}

function toContinuationUnit(
  unit: PipelineExecutionLedgerUnitEntry,
  dispatchDecision: ReviewContinuationUnit["dispatchDecision"],
  reason: string,
): ReviewContinuationUnit {
  const lensId = lensIdFromUnit(unit);
  return {
    unitId: unit.unitId,
    unitKind: unit.unitKind,
    ...(lensId !== null ? { lensId } : {}),
    packetPath: unit.packetRef ?? null,
    outputPath: unit.outputRefs[0] ?? null,
    priorStatus: unit.status,
    dispatchDecision,
    reason,
  };
}

function trustedUnitIds(ledger: PipelineExecutionLedger): Set<string> {
  return new Set(
    ledger.units
      .filter((unit) => isTrustedLedgerUnit(unit))
      .map((unit) => unit.unitId),
  );
}

function isFrontierUnit(
  unit: PipelineExecutionLedgerUnitEntry,
  trustedIds: Set<string>,
): boolean {
  if (isTrustedLedgerUnit(unit)) return false;
  return unit.upstreamUnitIds.every((unitId) => trustedIds.has(unitId));
}

function reachableDownstreamUnitIds(args: {
  ledger: PipelineExecutionLedger;
  frontierUnitIds: Set<string>;
}): Set<string> {
  const byId = new Map(args.ledger.units.map((unit) => [unit.unitId, unit]));
  const result = new Set<string>();
  const queue = [...args.frontierUnitIds];
  while (queue.length > 0) {
    const unitId = queue.shift();
    if (!unitId) continue;
    const unit = byId.get(unitId);
    if (!unit) continue;
    for (const downstreamUnitId of unit.downstreamUnitIds) {
      if (args.frontierUnitIds.has(downstreamUnitId)) continue;
      if (result.has(downstreamUnitId)) continue;
      result.add(downstreamUnitId);
      queue.push(downstreamUnitId);
    }
  }
  return result;
}

function targetRejectedUnits(args: {
  ledger: PipelineExecutionLedger;
  targetUnits: string[];
}): ReviewContinuationUnit[] {
  const byId = new Map(args.ledger.units.map((unit) => [unit.unitId, unit]));
  return args.targetUnits.flatMap((unitId) => {
    const unit = byId.get(unitId);
    if (!unit) {
      return [
        {
          unitId,
          unitKind: "unknown",
          packetPath: null,
          outputPath: null,
          priorStatus: "missing" as PipelineExecutionUnitStatus,
          dispatchDecision: "reject" as const,
          reason: "Target unit is not present in the pipeline execution ledger.",
        },
      ];
    }
    if (isTrustedLedgerUnit(unit)) {
      return [
        toContinuationUnit(
          unit,
          "reject",
          "Target unit is already trusted and completed; completed outputs are reuse-only.",
        ),
      ];
    }
    return [];
  });
}

export function buildReviewContinuationPlan(
  params: BuildReviewContinuationPlanParams,
): ReviewContinuationPlan {
  const trustedIds = trustedUnitIds(params.ledger);
  const requestedTargets = params.targetUnits ?? [];
  const rejectedTargets = targetRejectedUnits({
    ledger: params.ledger,
    targetUnits: requestedTargets,
  });
  const requestedTargetSet = new Set(requestedTargets);
  const naturalFrontier = params.ledger.units.filter((unit) =>
    isFrontierUnit(unit, trustedIds),
  );
  const targetFrontier =
    requestedTargetSet.size === 0
      ? naturalFrontier
      : params.ledger.units.filter(
          (unit) => requestedTargetSet.has(unit.unitId) && !isTrustedLedgerUnit(unit),
        );
  const frontierUnits =
    rejectedTargets.length > 0
      ? rejectedTargets
      : targetFrontier.map((unit) =>
          toContinuationUnit(
            unit,
            "run",
            requestedTargetSet.size === 0
              ? "Earliest untrusted unit whose upstream units are trusted."
              : "Requested untrusted target unit.",
          ),
        );
  const frontierUnitIds = new Set(
    frontierUnits
      .filter((unit) => unit.dispatchDecision === "run")
      .map((unit) => unit.unitId),
  );
  const downstreamIds = reachableDownstreamUnitIds({
    ledger: params.ledger,
    frontierUnitIds,
  });
  const downstreamUnits = params.ledger.units
    .filter((unit) => downstreamIds.has(unit.unitId) && !isTrustedLedgerUnit(unit))
    .map((unit) =>
      toContinuationUnit(
        unit,
        "run",
        "Downstream unit must be recomputed after the continuation frontier.",
      ),
    );
  const preservedArtifactRefs = params.ledger.units
    .filter((unit) => isTrustedLedgerUnit(unit))
    .flatMap((unit) => unit.producedArtifactRefs);
  const supersededArtifactRefs = [...frontierUnits, ...downstreamUnits]
    .filter((unit) => unit.dispatchDecision === "run" && unit.outputPath !== null)
    .map((unit) => unit.outputPath as string)
    .filter((outputPath) => preservedArtifactRefs.includes(outputPath) === false);
  const eligible =
    rejectedTargets.length === 0 && (frontierUnits.length > 0 || downstreamUnits.length > 0);
  const ineligibleReason = eligible
    ? null
    : rejectedTargets.length > 0
      ? "One or more requested target units cannot be continued."
      : "No untrusted continuation frontier remains.";

  return {
    schemaVersion: "1",
    sessionId: params.ledger.sessionId,
    eligible,
    ineligibleReason,
    sourceRefs: params.ledger.sourceRefs,
    validationRefs: params.ledger.sourceRefs,
    unitLedger: params.ledger,
    frontierUnits,
    downstreamUnits,
    preservedArtifactRefs,
    supersededArtifactRefs: [...new Set(supersededArtifactRefs)].sort(),
  };
}
