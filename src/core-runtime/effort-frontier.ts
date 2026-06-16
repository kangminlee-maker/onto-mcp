/**
 * Effort frontier calibration — pure, deterministic core.
 *
 * For each LLM stage of a pipeline (review or reconstruct), given a series of
 * per-effort aggregated samples (one per effort level, aggregated over N runs),
 * classify the reasoning-effort frontier:
 *
 *   - minViableEffort    — the lowest effort whose gate passes (>= passQuorum of
 *                          runs). Below it the stage fails.
 *   - effectiveMaxEffort — the lowest gate-passing effort beyond which no higher
 *                          effort improves quality by more than plateauThreshold
 *                          (the knee of the cost/quality curve). Above it more
 *                          effort buys ~nothing.
 *   - recommendedEffort  — effectiveMaxEffort: the cheapest effort at the quality
 *                          plateau that still passes the gate.
 *
 * Pipeline-agnostic: callers supply already-aggregated samples (quality is a
 * pipeline-defined "finding 양·질" metric, higher = better) in ascending effort
 * order. No live LLM calls and no I/O — fully unit-testable. The benchmark/sweep
 * harnesses (scripts/) produce the samples; this module decides the frontier and
 * assembles the per-model calibration record that is re-run per new model.
 */

export interface EffortCostSummary {
  promptChars?: number;
  outputChars?: number;
  providerTokens?: number;
  durationMs?: number;
}

/** One effort level's aggregated result for a single stage. */
export interface EffortSample {
  /** Effort label, e.g. "low" | "medium" | "high" | "xhigh" | "max". */
  effort: string;
  /** Fraction of runs (0..1) in which the stage's gate passed. */
  gatePassRate: number;
  /** Mean quality metric across runs (higher = better; pipeline-defined). */
  quality: number;
  /** Stdev of quality across runs (0 for a single run). */
  qualityStdev: number;
  /** Number of runs aggregated into this sample. */
  runs: number;
  /** Optional cost summary (reporting only; not part of the decision). */
  cost?: EffortCostSummary;
}

export interface FrontierThresholds {
  /** Min gatePassRate for an effort to count as viable. Default 1 (all runs). */
  passQuorum?: number;
  /**
   * A quality gain strictly greater than this (vs a lower effort) counts as a
   * real improvement; gains at or below it are treated as a plateau. Set
   * relative to the quality metric's scale.
   */
  plateauThreshold: number;
}

export interface StageFrontierCurvePoint {
  effort: string;
  gatePassRate: number;
  quality: number;
  qualityStdev: number;
  /** Runs aggregated into this point — qualityStdev is uninterpretable without
   * it, and it distinguishes a decision-grade (INV-BENCH-1) frontier from a
   * preliminary n=1 observation in the persisted report. */
  runs: number;
  cost?: EffortCostSummary;
}

export interface StageFrontier {
  stage: string;
  minViableEffort: string | null;
  effectiveMaxEffort: string | null;
  recommendedEffort: string | null;
  /**
   * True when effectiveMaxEffort is a genuine plateau strictly below the highest
   * viable (gate-passing) effort — i.e. the diminishing-returns knee was
   * captured within the tested range. False when quality was still climbing at
   * the top of the viable range, or when only one viable effort was tested.
   */
  plateauReached: boolean;
  rationale: string;
  curve: StageFrontierCurvePoint[];
}

const DEFAULT_PASS_QUORUM = 1;
// Tolerance for the plateau comparison. Quality deltas from averaged 0..1
// metrics carry float noise (e.g. 0.90 - 0.85 === 0.050000000000000044), so a
// gain mathematically equal to the threshold must NOT count as an improvement —
// the contract treats gains at or below the threshold as a plateau.
const QUALITY_EPSILON = 1e-9;

const curveOf = (samples: EffortSample[]): StageFrontierCurvePoint[] =>
  samples.map((s) => ({
    effort: s.effort,
    gatePassRate: s.gatePassRate,
    quality: s.quality,
    qualityStdev: s.qualityStdev,
    runs: s.runs,
    ...(s.cost ? { cost: s.cost } : {}),
  }));

/**
 * Classify the effort frontier for one stage. `samples` must be in ascending
 * effort order (cheapest first); the caller owns the effort ordering.
 */
export function classifyStageFrontier(
  stage: string,
  samples: EffortSample[],
  thresholds: FrontierThresholds,
): StageFrontier {
  const passQuorum = thresholds.passQuorum ?? DEFAULT_PASS_QUORUM;
  const plateau = thresholds.plateauThreshold;
  const curve = curveOf(samples);

  if (samples.length === 0) {
    return {
      stage,
      minViableEffort: null,
      effectiveMaxEffort: null,
      recommendedEffort: null,
      plateauReached: false,
      rationale: "no samples provided",
      curve,
    };
  }

  // min viable: the lowest effort whose gate clears the quorum.
  const minViableIdx = samples.findIndex((s) => s.gatePassRate >= passQuorum);
  if (minViableIdx === -1) {
    return {
      stage,
      minViableEffort: null,
      effectiveMaxEffort: null,
      recommendedEffort: null,
      plateauReached: false,
      rationale: `gate never reaches passQuorum=${passQuorum} at any tested effort`,
      curve,
    };
  }

  // candidates: gate-passing efforts at or above min viable, ascending. (A
  // higher effort can dip below the quorum, e.g. overthinking; such efforts are
  // not viable recommendations and are excluded from the plateau search.)
  const candidates = samples
    .slice(minViableIdx)
    .filter((s) => s.gatePassRate >= passQuorum);

  // effective max: the lowest candidate whose quality is not beaten by more than
  // the plateau threshold by ANY higher candidate (checking all higher ones, not
  // just the adjacent, makes this robust to non-monotonic noise). The highest
  // candidate satisfies this vacuously, so a result always exists.
  let effIdx = candidates.length - 1;
  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i]!.quality;
    const beatenLater = candidates
      .slice(i + 1)
      .some((c) => c.quality - base > plateau + QUALITY_EPSILON);
    if (!beatenLater) {
      effIdx = i;
      break;
    }
  }

  const minViable = samples[minViableIdx]!.effort;
  const effective = candidates[effIdx]!.effort;
  const highestViable = candidates[candidates.length - 1]!.effort;
  const plateauReached =
    candidates.length > 1 && effective !== highestViable;

  let rationale: string;
  if (candidates.length === 1) {
    rationale = `only "${minViable}" is viable in the tested range; plateau indeterminate`;
  } else if (plateauReached) {
    rationale = `gate first passes at "${minViable}"; quality plateaus at "${effective}" (no higher effort gains >${plateau})`;
  } else {
    rationale = `gate first passes at "${minViable}"; quality still climbing at the top of the viable range "${highestViable}" — plateau not captured; re-run with higher effort if available`;
  }

  return {
    stage,
    minViableEffort: minViable,
    effectiveMaxEffort: effective,
    recommendedEffort: effective,
    plateauReached,
    rationale,
    curve,
  };
}

export interface EffortCalibrationReport {
  /** "review" | "reconstruct". */
  pipeline: string;
  provider: string;
  model: string;
  /** Effort-honoring route, e.g. "anthropic/sdk", "openai/responses", "anthropic/claude-cli". */
  route: string;
  thresholds: FrontierThresholds;
  stages: StageFrontier[];
}

/**
 * Assemble a per-model calibration record from per-stage sample series. The
 * caller (harness) stamps identity/time metadata when serializing the artifact;
 * this function stays deterministic (no clock, no I/O).
 */
export function classifyEffortCalibration(args: {
  pipeline: string;
  provider: string;
  model: string;
  route: string;
  thresholds: FrontierThresholds;
  stages: Array<{ stage: string; samples: EffortSample[] }>;
}): EffortCalibrationReport {
  return {
    pipeline: args.pipeline,
    provider: args.provider,
    model: args.model,
    route: args.route,
    // Persist the *effective* thresholds (resolve the default quorum) so a
    // serialized record is self-describing — a reader/replay can tell an
    // all-runs quorum from a relaxed one without knowing this module's default.
    thresholds: {
      passQuorum: args.thresholds.passQuorum ?? DEFAULT_PASS_QUORUM,
      plateauThreshold: args.thresholds.plateauThreshold,
    },
    stages: args.stages.map((s) =>
      classifyStageFrontier(s.stage, s.samples, args.thresholds),
    ),
  };
}
