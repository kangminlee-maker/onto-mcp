import {
  reviewAdvance,
  reviewRound,
  type ReviewRoundResult,
  type ReviewRoundUnit,
} from "../review/review-execution-steps.js";

/**
 * Brand-neutral reference host driver for host-orchestration (Phase 2, Stage 1).
 *
 * It owns the round loop a real host would own — `reviewRound` to learn what is
 * ready, execute each ready unit, `reviewAdvance` to report the seats, repeat —
 * proving the round/advance contract and the A/B split without any specific
 * agent. The driver is executor-agnostic: pass a {@link HostUnitExecutor} that
 * spawns the real review unit executor subprocess (live mode), or one that
 * writes fixture seats (mock mode, for deterministic tests). onto still owns
 * artifact truth (ledger/result/gate); the executor only writes the unit's seat
 * at its canonical `output_path`.
 *
 * Assembly is left to the caller: when the loop ends with `ready_to_assemble`,
 * the caller runs `completeReviewSession` (which the core-api wrapper does).
 */
export type HostUnitExecutor = (unit: ReviewRoundUnit) => Promise<void>;

export interface ReferenceHostRunResult {
  /** Why the loop stopped. `max_rounds` is the runaway-loop backstop. */
  finalStatus: "ready_to_assemble" | "halted" | "max_rounds";
  reason?: string;
  roundCount: number;
  executedUnitIds: string[];
}

export async function driveHostOrchestration(args: {
  sessionRoot: string;
  executeUnit: HostUnitExecutor;
  maxRounds?: number;
}): Promise<ReferenceHostRunResult> {
  const maxRounds = args.maxRounds ?? 64;
  const executedUnitIds: string[] = [];
  let roundCount = 0;
  let result: ReviewRoundResult = await reviewRound(args.sessionRoot);

  while (result.status === "in_progress") {
    if (roundCount >= maxRounds) {
      return { finalStatus: "max_rounds", roundCount, executedUnitIds };
    }
    for (const unit of result.ready_units) {
      await args.executeUnit(unit);
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
