import {
  reviewAdvance,
  reviewRound,
  type ReviewRoundResult,
  type ReviewRoundUnit,
} from "../review/review-execution-steps.js";

/**
 * Brand-neutral reference host driver for host-orchestration (Phase 2, Stage 1;
 * nested batch execution added in roadmap S2).
 *
 * It owns the round loop a real host would own — `reviewRound` to learn what is
 * ready, execute the ready units, `reviewAdvance` to report the seats, repeat —
 * proving the round/advance contract and the A/B split without any specific
 * agent. The driver is executor-agnostic and topology-agnostic:
 *
 *   - flat (main-workers): pass a {@link HostUnitExecutor} that executes one
 *     unit at a time — a real unit-executor subprocess (live) or a fixture
 *     seat writer (mock, deterministic tests).
 *   - nested (nested-workers): pass a {@link HostBatchExecutor} that hands the
 *     WHOLE round's ready units to one nesting batch worker (the
 *     NestingBatchWorker contract — codex/claude outer in live mode, or the
 *     literal batch script over a stub inner executor in tests). One outer
 *     worker per round; the round loop stays with the host either way.
 *
 * onto still owns artifact truth (ledger/result/gate); executors only write
 * unit seats at their canonical `output_path`.
 *
 * Assembly is left to the caller: when the loop ends with `ready_to_assemble`,
 * the caller runs `completeReviewSession` (which the core-api wrapper does).
 */
export type HostUnitExecutor = (unit: ReviewRoundUnit) => Promise<void>;

/** Executes one round's ready units as a single nesting batch. */
export type HostBatchExecutor = (units: ReviewRoundUnit[]) => Promise<void>;

export interface ReferenceHostRunResult {
  /** Why the loop stopped. `max_rounds` is the runaway-loop backstop. */
  finalStatus: "ready_to_assemble" | "halted" | "max_rounds";
  reason?: string;
  roundCount: number;
  executedUnitIds: string[];
}

export async function driveHostOrchestration(args: {
  sessionRoot: string;
  /** Per-unit executor (flat). Required unless `executeBatch` is given. */
  executeUnit?: HostUnitExecutor;
  /**
   * Round-batch executor (nested). When set, each round's ready units are
   * delegated as one batch instead of per-unit execution.
   */
  executeBatch?: HostBatchExecutor;
  maxRounds?: number;
}): Promise<ReferenceHostRunResult> {
  if (!args.executeUnit && !args.executeBatch) {
    throw new Error(
      "driveHostOrchestration requires executeUnit (flat) or executeBatch (nested).",
    );
  }
  const maxRounds = args.maxRounds ?? 64;
  const executedUnitIds: string[] = [];
  let roundCount = 0;
  let result: ReviewRoundResult = await reviewRound(args.sessionRoot);

  while (result.status === "in_progress") {
    if (roundCount >= maxRounds) {
      return { finalStatus: "max_rounds", roundCount, executedUnitIds };
    }
    if (args.executeBatch) {
      await args.executeBatch(result.ready_units);
    } else {
      for (const unit of result.ready_units) {
        await args.executeUnit!(unit);
      }
    }
    const executed = result.ready_units.map((unit) => unit.unit_id);
    executedUnitIds.push(...executed);
    result = await reviewAdvance(args.sessionRoot, executed);
    roundCount += 1;
  }

  return {
    finalStatus: result.status,
    ...(result.status === "halted" ? { reason: result.reason } : {}),
    roundCount,
    executedUnitIds,
  };
}
