/**
 * Effort-calibration ingestion (P4) — turn an existing benchmark report's JSON
 * into the `EffortSweepRun[]` the sweep aggregator consumes. Pure: no LLM calls
 * and no IO. The benchmark scripts already run the (paid, live) sweep and write
 * the report; this module only re-reads that record, so the calibration report
 * is produced deterministically and is unit-testable against captured output.
 *
 * Honesty rule (carried from the sweep aggregator): a run that produced no
 * quality verdict — a failed run with no gate — is emitted as an unjudged
 * (passed=null, qualityScore=null) sweep run, NOT dropped. Dropping failures
 * would let an effort look viable on a single surviving pass; counting them as
 * non-passing in the denominator keeps the quorum honest.
 *
 * Pipeline asymmetry, mirrored from the two benchmark harnesses:
 *  - review: one unit-sweep invocation varies one unit's effort internally, so
 *    each run self-describes its (unit, effort); the baseline run (all units at
 *    base_effort) is the shared base-effort point for every swept unit.
 *  - reconstruct: one invocation pins one effort knob (global author --effort or
 *    --judge-effort), so the (stage, effort) of a report is the knob that was
 *    pinned; the sweep is several invocations, one report per effort point.
 *
 * Cost is intentionally NOT populated here. Per-stage cost is reporting-only
 * (the frontier decision ignores it) and correct attribution needs a verified
 * mapping that this stage cannot prove: review's swept stage ids live in the
 * execution namespace (e.g. `finding_ledger`, `synthesis_response`, `lens`)
 * while per-unit telemetry uses runtime ids (`finding-ledger`, `synthesize`,
 * per-lens ids), and a reconstruct report's `totals` is the whole-pipeline cost,
 * not the swept stage's. The optional `cost` field stays in the sweep/frontier
 * layer; populating it correctly is deferred to P4b, when real multi-effort
 * sweep data exists to verify the per-stage unit-telemetry attribution.
 */

import type { EffortSweepRun } from "./effort-calibration-sweep.js";
import type { RouteIdentity } from "./route-identity.js";
import type { SemanticQualityGateResult } from "./review/semantic-quality-gate.js";
import type { ReconstructQualityGateResult } from "./reconstruct/semantic-quality-gate.js";
import { reviewRunGateSignal } from "./effort-calibration-review.js";
import { reconstructRunGateSignal } from "./effort-calibration-reconstruct.js";

const UNJUDGED = { passed: null, qualityScore: null } as const;

// ---------------------------------------------------------------------------
// Review ingestion
// ---------------------------------------------------------------------------

/** Structural subset of one review benchmark run summary (scripts own the full shape). */
export interface ReviewBenchmarkRun {
  /** Case id, e.g. `unit-sweep-base-<effort>` or `unit-sweep-<unit>-<effort>`. */
  case_id?: string;
  status?: string;
  /** Set on candidate runs: the one unit whose effort was varied. */
  varied_unit_id?: string;
  /** The varied unit's effort on a candidate run. */
  varied_effort?: string;
  /** The fixed base effort (present on baseline and candidate runs). */
  base_effort?: string;
  /** Whole-review semantic quality gate; absent when the run failed. */
  semantic_quality_gate?: SemanticQualityGateResult;
  /** Per-run runtime context; runtime_provider is the route token to validate. */
  review_profile?: { runtime_route?: { runtime_provider?: string | null } | null };
}

/** Structural subset of a review benchmark report (top-level identity/status). */
export interface ReviewBenchmarkReport {
  status?: string;
  model?: string;
  provider?: string;
  /** Sweep context to preserve so a restricted run isn't read as full-path. */
  selected_lens_ids?: string[];
  fixtures?: string[];
  repetitions?: number;
  runs?: ReviewBenchmarkRun[];
}

/** Only a unit-sweep baseline case is the shared base-effort point per unit. */
const UNIT_SWEEP_BASE_PREFIX = "unit-sweep-base";

/**
 * Ingest a review unit-sweep benchmark report into sweep runs. Candidate runs
 * map to their swept unit at its varied effort; each unit-sweep BASELINE run
 * becomes the base-effort point for EVERY swept unit (the units observed across
 * candidate runs), since "unit X at base, others at base" is exactly the
 * baseline. Only `unit-sweep-base-*` runs are treated as baselines: a report may
 * also carry non-unit-sweep cases (e.g. `all-high`) that share `base_effort` but
 * vary every unit at once, and replicating those would contaminate the
 * single-variable frontier. Runs without a quality gate (failures) are emitted
 * unjudged; runs that are neither a candidate nor a unit-sweep baseline are
 * skipped (nothing single-variable to attribute).
 */
export function ingestReviewReport(
  report: ReviewBenchmarkReport,
): EffortSweepRun[] {
  const runs = report.runs ?? [];
  const sweptUnits = [
    ...new Set(
      runs
        .map((r) => r.varied_unit_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  // The base-effort sample is the frontier's reference point; a candidate-only
  // report (e.g. run with --unit-sweep-candidate-only) omits it, so the frontier
  // would recommend an effort purely because the baseline was never measured.
  const hasBaseline = runs.some(
    (r) => r.base_effort && r.case_id?.startsWith(UNIT_SWEEP_BASE_PREFIX),
  );
  if (sweptUnits.length > 0 && !hasBaseline) {
    throw new Error(
      "review report has unit-sweep candidates but no unit-sweep baseline (base-effort sample missing; was it run with --unit-sweep-candidate-only?)",
    );
  }
  // Points (stage|effort) with at least one completed (gated) run. Failed runs
  // carry no quality gate or route telemetry, so they are attributed only to a
  // point that also has completed evidence — three failures alone must not stamp
  // a unit-effort on a route no retained run proved executed there.
  const completedPoints = new Set<string>();
  for (const run of runs) {
    if (!run.semantic_quality_gate) continue;
    if (run.varied_unit_id && run.varied_effort) {
      completedPoints.add(`${run.varied_unit_id}|${run.varied_effort}`);
    } else if (run.base_effort && run.case_id?.startsWith(UNIT_SWEEP_BASE_PREFIX)) {
      for (const unit of sweptUnits) completedPoints.add(`${unit}|${run.base_effort}`);
    }
  }
  const out: EffortSweepRun[] = [];
  for (const run of runs) {
    const gated = Boolean(run.semantic_quality_gate);
    const gate = run.semantic_quality_gate
      ? reviewRunGateSignal(run.semantic_quality_gate)
      : { ...UNJUDGED };
    if (run.varied_unit_id && run.varied_effort) {
      if (gated || completedPoints.has(`${run.varied_unit_id}|${run.varied_effort}`)) {
        out.push({ stage: run.varied_unit_id, effort: run.varied_effort, gate });
      }
    } else if (run.base_effort && run.case_id?.startsWith(UNIT_SWEEP_BASE_PREFIX)) {
      for (const unit of sweptUnits) {
        if (gated || completedPoints.has(`${unit}|${run.base_effort}`)) {
          out.push({ stage: unit, effort: run.base_effort, gate });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reconstruct ingestion
// ---------------------------------------------------------------------------

/** Which effort knob a reconstruct report pinned, and at what level. */
export interface ReconstructStageTag {
  stage: "author" | "judge";
  effort: string;
}

/** The answer-support judge's LLM step; no-call-exempt, so it can early-exit. */
export const JUDGE_STEP_ID = "answer_support_judgment";

/** Structural subset of one reconstruct benchmark run record. */
export interface ReconstructBenchmarkRun {
  quality_gate: ReconstructQualityGateResult;
  metadata?: {
    applied_effort?: string | null;
    model_id?: string | null;
    provider_route?: string | null;
    /**
     * Witnessed route identity (effort-calibration simplification §9). Absent on
     * legacy reports authored before the harness surfaced it — the CLI degrades
     * such a source's route_completeness rather than failing (design §10).
     */
    route_identity?: RouteIdentity | null;
  };
  /** Per-unit execution telemetry; the judge unit is only present when it ran. */
  units?: Array<{ step_id?: string; effort?: string | null; llm_call_count?: number }>;
}

/**
 * Whether the answer-support judge actually ran an LLM call at `effort` in this
 * run. The judge is no-call-exempt: it early-exits (no convergent evidence
 * clusters) or degrades to an inherited config, in which case it leaves no
 * `answer_support_judgment` telemetry at the requested effort — so a judge
 * sample must be backed by real judge telemetry, not just the requested knob.
 */
function judgeExercisedAt(run: ReconstructBenchmarkRun, effort: string): boolean {
  return (run.units ?? []).some(
    (u) =>
      u.step_id === JUDGE_STEP_ID &&
      u.effort === effort &&
      (u.llm_call_count ?? 0) >= 1,
  );
}

/**
 * Whether a completed run's telemetry shows the swept stage actually ran at
 * `effort` — the requested knob is never trusted over telemetry. The author
 * stage always runs, so its `metadata.applied_effort` must equal the point (a
 * route that ignored the pin, or a recovery de-escalation, is not an `effort`
 * sample). The judge stage must show an answer_support_judgment call at that
 * effort. Runs that don't match are not evidence for this frontier point.
 */
function appliedEffortMatches(
  run: ReconstructBenchmarkRun,
  stage: ReconstructStageTag["stage"],
  effort: string,
): boolean {
  return stage === "judge"
    ? judgeExercisedAt(run, effort)
    : run.metadata?.applied_effort === effort;
}

/** Structural subset of a reconstruct benchmark report. */
export interface ReconstructBenchmarkReport {
  status?: string;
  /** Benchmark provenance — must match across sources merged into one sweep. */
  commit?: string | null;
  working_tree_state?: string | null;
  realization?: string | null;
  fixtures?: string[];
  /** Pinned global author effort; null when the settings chain governs it. */
  requested_effort?: string | null;
  /** Opt-in judge override; its presence marks a judge-stage report. */
  requested_judge_override?: { effort?: string | null; model?: string | null } | null;
  runs?: ReconstructBenchmarkRun[];
  /** Failed runs live under the reconstruct extension (no quality gate). */
  reconstruct_extension?: { failed_runs?: unknown[] } | null;
}

/**
 * Derive the (stage, effort) a reconstruct report pinned. A judge override marks
 * a judge-stage report ONLY when it pins a judge EFFORT; a model-only override
 * (effort null/absent) varied the judge model, not an effort, so there is no
 * effort point to calibrate and this returns null (the caller must pass an
 * explicit tag) rather than mislabeling it as author. Without a judge override
 * it is an author-stage report at the pinned `requested_effort`, falling back to
 * the first run's telemetry `applied_effort` when the settings chain governed
 * the effort. Returns null when no effort can be attributed.
 */
export function deriveReconstructTag(
  report: ReconstructBenchmarkReport,
): ReconstructStageTag | null {
  const judgeOverride = report.requested_judge_override;
  if (judgeOverride) {
    return judgeOverride.effort
      ? { stage: "judge", effort: judgeOverride.effort }
      : null;
  }
  if (report.requested_effort) {
    return { stage: "author", effort: report.requested_effort };
  }
  const applied = report.runs?.[0]?.metadata?.applied_effort;
  if (applied) return { stage: "author", effort: applied };
  return null;
}

/**
 * Ingest a reconstruct benchmark report into sweep runs for one (stage, effort)
 * point. The point is the explicit `tag` when given, else derived from the
 * report's pinned knob. A completed run only contributes a sample when its
 * telemetry shows the swept stage actually ran at that effort (author:
 * applied_effort matches; judge: an answer_support_judgment call at that effort),
 * so a pin the route ignored, a recovery de-escalation, or a judge early-exit
 * does not fabricate a sample. Their golden gate is then distilled. Failed runs
 * (no telemetry) are emitted unjudged for the author stage only — they cannot
 * prove the judge ran. Throws when no tag can be determined.
 */
export function ingestReconstructReport(
  report: ReconstructBenchmarkReport,
  tag?: ReconstructStageTag,
): EffortSweepRun[] {
  const point = tag ?? deriveReconstructTag(report);
  if (!point) {
    throw new Error(
      "reconstruct report pins no effort (no judge override, requested_effort, or applied_effort); pass an explicit stage:effort tag",
    );
  }
  const out: EffortSweepRun[] = [];
  for (const run of report.runs ?? []) {
    if (!appliedEffortMatches(run, point.stage, point.effort)) {
      continue; // telemetry doesn't show this stage running at this effort
    }
    out.push({
      stage: point.stage,
      effort: point.effort,
      gate: reconstructRunGateSignal(run.quality_gate),
    });
  }
  // Failed runs carry no telemetry, so attribute them only to the author stage
  // (which always runs) AND only when at least one completed run was retained at
  // this point — that retained run's telemetry is what proves the model/route/
  // effort. A source whose runs all failed proves no route/effort, so its
  // failures are not turned into route-keyed samples.
  if (point.stage === "author" && out.length > 0) {
    const failedCount = report.reconstruct_extension?.failed_runs?.length ?? 0;
    for (let i = 0; i < failedCount; i++) {
      out.push({ stage: "author", effort: point.effort, gate: { ...UNJUDGED } });
    }
  }
  return out;
}
