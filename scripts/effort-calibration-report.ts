/**
 * effort-calibration-report — build a git-tracked per-model effort_profile from
 * existing benchmark report JSON. No LLM calls and no live runs: the (paid)
 * sweep is the existing review/reconstruct benchmark harness; this CLI only
 * re-reads its output and applies the pure P1–P4 calibration adapters, so the
 * profile is deterministic and reproducible per model (INV-MODEL-1 onboarding).
 *
 * One invocation builds one pipeline's profile:
 *   review:      one unit-sweep report (self-describes each unit+effort).
 *     tsx scripts/effort-calibration-report.ts --review-report <path> \
 *       --provider anthropic --model claude-opus-4-8 --route anthropic/claude-cli
 *   reconstruct: one report per pinned effort point (repeat the flag). A report
 *     auto-derives its (stage, effort) from the pinned knob; prefix
 *     stage:effort: to force it.
 *     tsx scripts/effort-calibration-report.ts \
 *       --reconstruct-report author:low:<path> \
 *       --reconstruct-report author:high:<path> \
 *       --reconstruct-report judge:high:<path> \
 *       --provider anthropic --model claude-opus-4-8 --route anthropic/claude-cli
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  deriveReconstructTag,
  ingestReconstructReport,
  ingestReviewReport,
  JUDGE_STEP_ID,
  type ReconstructBenchmarkReport,
  type ReconstructStageTag,
  type ReviewBenchmarkReport,
} from "../src/core-runtime/effort-calibration-ingest.js";
import {
  buildEffortCalibrationReport,
  type EffortSweepRun,
} from "../src/core-runtime/effort-calibration-sweep.js";
import type {
  EffortCalibrationReport,
  StageFrontier,
} from "../src/core-runtime/effort-frontier.js";
import { BENCHMARK_DECISION_GRADE_STATUS } from "../src/core-runtime/reconstruct/benchmark-evidence.js";

const DEFAULT_EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max"];
const DEFAULT_PLATEAU = 0.05;
// INV-BENCH-1 run floor: a decision-grade point needs >= 3 runs. Fixture
// coverage (>= 2 fixtures per point) is verified by the benchmark harness's own
// status and is re-checked end-to-end in P4b against real multi-fixture sweeps.
const DECISION_GRADE_MIN_RUNS = 3;

interface Options {
  reviewReport?: string;
  reconstructReports: string[];
  provider: string;
  model: string;
  route: string;
  effortOrder: string[];
  plateauThreshold: number;
  passQuorum?: number;
  outputPath?: string;
  allowPreliminary: boolean;
}

function usage(): string {
  return [
    "Usage: tsx scripts/effort-calibration-report.ts [options]",
    "",
    "  --review-report <path>             Review unit-sweep benchmark JSON (review pipeline).",
    "  --reconstruct-report <[stage:effort:]path>  Reconstruct benchmark JSON; repeatable.",
    "                                     stage ∈ author|judge; omit prefix to auto-derive.",
    "  --provider <id>                    Provider id (required).",
    "  --model <id>                       Model id (required).",
    "  --route <id>                       Effort-honoring route (required).",
    `  --effort-order <csv>               Ascending effort order. Default: ${DEFAULT_EFFORT_ORDER.join(",")}`,
    `  --plateau <num>                    Plateau quality threshold. Default: ${DEFAULT_PLATEAU}`,
    "  --pass-quorum <num>                Min gatePassRate for viability. Default: 1 (all runs).",
    "  --output <path>                    Output JSON path (.json). Default: development-records/benchmark/.",
    "  --allow-preliminary                Permit non-decision-grade source reports (marks the artifact).",
  ].join("\n");
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined) throw new Error(`${flag} requires a value`);
  return value;
}

function parseOptions(argv: string[]): Options {
  const reconstructReports: string[] = [];
  let reviewReport: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let route: string | undefined;
  let effortOrder = DEFAULT_EFFORT_ORDER;
  let plateauThreshold = DEFAULT_PLATEAU;
  let passQuorum: number | undefined;
  let outputPath: string | undefined;
  let allowPreliminary = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--review-report":
        reviewReport = readValue(argv, ++i, arg);
        break;
      case "--reconstruct-report":
        reconstructReports.push(readValue(argv, ++i, arg));
        break;
      case "--provider":
        provider = readValue(argv, ++i, arg);
        break;
      case "--model":
        model = readValue(argv, ++i, arg);
        break;
      case "--route":
        route = readValue(argv, ++i, arg);
        break;
      case "--effort-order":
        effortOrder = readValue(argv, ++i, arg)
          .split(",")
          .map((e) => e.trim())
          .filter((e) => e.length > 0);
        break;
      case "--plateau":
        plateauThreshold = Number(readValue(argv, ++i, arg));
        break;
      case "--pass-quorum":
        passQuorum = Number(readValue(argv, ++i, arg));
        break;
      case "--output":
        outputPath = readValue(argv, ++i, arg);
        break;
      case "--allow-preliminary":
        allowPreliminary = true;
        break;
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (reviewReport && reconstructReports.length > 0) {
    throw new Error(
      "Provide --review-report OR --reconstruct-report(s), not both: one profile is one pipeline.",
    );
  }
  if (!reviewReport && reconstructReports.length === 0) {
    throw new Error("No input: pass --review-report or --reconstruct-report.");
  }
  if (!provider || !model || !route) {
    throw new Error("--provider, --model, and --route are required.");
  }
  // The markdown sibling is derived by swapping a `.json` suffix; a non-`.json`
  // output path would make the sibling equal to the JSON path and overwrite the
  // canonical artifact, so require the suffix.
  if (outputPath !== undefined && !outputPath.endsWith(".json")) {
    throw new Error("--output must end with .json");
  }
  // These thresholds drive a persisted git-tracked artifact, so reject values
  // that would silently produce a wrong calibration record: a quorum outside
  // (0, 1] makes every effort trivially viable or impossible, and a negative
  // plateau lets a quality drop count as an improvement.
  if (!Number.isFinite(plateauThreshold) || plateauThreshold < 0) {
    throw new Error("--plateau must be a number >= 0.");
  }
  if (passQuorum !== undefined && (!Number.isFinite(passQuorum) || passQuorum <= 0 || passQuorum > 1)) {
    throw new Error("--pass-quorum must be a number in (0, 1].");
  }
  // An empty effort order would make the aggregator drop every run (no effort is
  // canonical) yet still pass the run-count check, writing a stages-less profile.
  if (effortOrder.length === 0) {
    throw new Error("--effort-order must list at least one effort.");
  }

  return {
    reviewReport,
    reconstructReports,
    provider,
    model,
    route,
    effortOrder,
    plateauThreshold,
    passQuorum,
    outputPath,
    allowPreliminary,
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

/** Parse a `--reconstruct-report` value into its optional tag and path. */
function parseReconstructArg(value: string): {
  tag?: ReconstructStageTag;
  filePath: string;
} {
  const match = /^(author|judge):([^:]+):(.+)$/.exec(value);
  if (match) {
    return {
      tag: { stage: match[1] as ReconstructStageTag["stage"], effort: match[2]! },
      filePath: match[3]!,
    };
  }
  return { filePath: value };
}

function frontierLine(s: StageFrontier): string {
  return [
    `| ${s.stage}`,
    s.minViableEffort ?? "—",
    s.effectiveMaxEffort ?? "—",
    s.recommendedEffort ?? "—",
    s.plateauReached ? "yes" : "no",
    s.rationale,
  ].join(" | ");
}

function renderMarkdown(
  report: EffortCalibrationReport,
  generatedAt: string,
  sources: Array<{ path: string; status: string | null }>,
  decisionGrade: boolean,
  sweepContext: Record<string, unknown>,
): string {
  const lines = [
    `# Effort profile — ${report.pipeline}`,
    "",
    `- model: \`${report.provider}/${report.model}\` via \`${report.route}\``,
    `- decision_grade: ${decisionGrade}`,
    `- sweep context: \`${JSON.stringify(sweepContext)}\``,
    `- thresholds: passQuorum=${report.thresholds.passQuorum ?? 1}, plateau=${report.thresholds.plateauThreshold}`,
    `- generated_at: ${generatedAt}`,
    `- source reports: ${sources.map((s) => `\`${s.path}\` (${s.status ?? "no status"})`).join(", ")}`,
    "",
    "| stage | minViable | effectiveMax | recommended | plateauReached | rationale |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.stages.map(frontierLine),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  // Temp-sibling + atomic rename so a kill mid-write cannot leave a torn file.
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function defaultOutputPath(
  pipeline: string,
  identity: { provider: string; model: string; route: string },
  generatedAt: string,
): string {
  const date = generatedAt.slice(0, 10).replace(/-/g, "");
  // Provider and route are part of the calibration identity (same model can have
  // different effort behavior per route), so include them to avoid clobbering a
  // sibling profile for the same model+day.
  const id = [identity.provider, identity.model, identity.route].map(slug).join("-");
  return path.join(
    "development-records",
    "benchmark",
    `effort-profile-${pipeline}-${id}-${date}.json`,
  );
}

/** Reject a source report whose declared identity contradicts the CLI flags. */
function assertIdentity(
  label: string,
  source: { model?: string | null; provider?: string | null },
  options: Options,
): void {
  if (source.model && source.model !== options.model) {
    throw new Error(
      `${label}: report model "${source.model}" != --model "${options.model}"`,
    );
  }
  if (source.provider && source.provider !== options.provider) {
    throw new Error(
      `${label}: report provider "${source.provider}" != --provider "${options.provider}"`,
    );
  }
}

/** A source report is decision-grade only when its harness gate passed. */
function isDecisionGrade(status?: string): boolean {
  return status === BENCHMARK_DECISION_GRADE_STATUS;
}

/**
 * Base provenance key for a reconstruct source — the benchmark context that must
 * be identical across ALL sources merged into one profile. Repetitions may
 * differ per effort and are excluded; fixtures are sorted so order is irrelevant.
 */
function reconstructBaseKey(report: ReconstructBenchmarkReport): string {
  return JSON.stringify({
    commit: report.commit ?? null,
    working_tree_state: report.working_tree_state ?? null,
    realization: report.realization ?? null,
    fixtures: [...(report.fixtures ?? [])].sort(),
  });
}

/**
 * Non-swept-knob key for a reconstruct source at a given stage — the requested
 * knobs that must be constant WITHIN a stage's sources, so only that stage's
 * effort varies (single-variable invariant). Author sweeps vary requested_effort
 * and so must hold the judge override fixed; judge sweeps vary the judge effort
 * and so must hold requested_effort and the judge model fixed.
 */
function reconstructNonSweptKey(
  report: ReconstructBenchmarkReport,
  stage: ReconstructStageTag["stage"],
): string {
  if (stage === "author") {
    // The judge config defaults to the author's, so an author sweep that does not
    // pin a judge effort ALSO varies judge effort. Hold the APPLIED judge effort
    // (telemetry) and judge model fixed; if they vary across author sources the
    // sweep is not single-variable and the sources won't merge into one curve.
    const appliedJudgeEfforts = [
      ...new Set(
        (report.runs ?? [])
          .flatMap((r) => r.units ?? [])
          .filter((u) => u.step_id === JUDGE_STEP_ID)
          .map((u) => u.effort)
          .filter((e): e is string => typeof e === "string"),
      ),
    ].sort();
    return JSON.stringify({
      judge_override: report.requested_judge_override ?? null,
      applied_judge_efforts: appliedJudgeEfforts,
    });
  }
  // Judge sweeps must hold the author effort fixed; verify from telemetry
  // (applied) rather than the requested pin, which may be null (settings-chain)
  // or ignored by the route, so a judge curve can't fold in an author change.
  const appliedAuthorEfforts = [
    ...new Set(
      (report.runs ?? [])
        .map((r) => r.metadata?.applied_effort)
        .filter((e): e is string => typeof e === "string"),
    ),
  ].sort();
  return JSON.stringify({
    applied_author_efforts: appliedAuthorEfforts,
    judge_model: report.requested_judge_override?.model ?? null,
  });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const sourceStatuses: Array<{ path: string; status: string | null }> = [];
  let runs: EffortSweepRun[];
  let pipeline: string;
  // Sweep context recorded in the artifact so a restricted/partial calibration
  // (lens subset, fixture mix, checkout) cannot be read as a full-path profile.
  let sweepContext: Record<string, unknown> = {};

  if (options.reviewReport) {
    pipeline = "review";
    const report = await readJson<ReviewBenchmarkReport>(options.reviewReport);
    assertIdentity(options.reviewReport, report, options);
    // Validate the runtime route token (provider) so a same-model report from a
    // different route/auth is not saved under the wrong per-route identity.
    const routes = new Set(
      (report.runs ?? [])
        .map((r) => r.review_profile?.runtime_route?.runtime_provider)
        .filter((r): r is string => typeof r === "string"),
    );
    for (const route of routes) {
      if (route !== options.route) {
        throw new Error(
          `${options.reviewReport}: report route "${route}" != --route "${options.route}"`,
        );
      }
    }
    sweepContext = {
      selected_lens_ids: report.selected_lens_ids ?? [],
      fixtures: report.fixtures ?? [],
      repetitions: report.repetitions ?? null,
    };
    sourceStatuses.push({ path: options.reviewReport, status: report.status ?? null });
    runs = ingestReviewReport(report);
  } else {
    pipeline = "reconstruct";
    runs = [];
    let baseProvenance: { path: string; key: string } | undefined;
    const stageProvenance = new Map<string, { path: string; key: string }>();
    for (const arg of options.reconstructReports) {
      const { tag, filePath } = parseReconstructArg(arg);
      const report = await readJson<ReconstructBenchmarkReport>(filePath);
      // Reconstruct identity lives per-run in telemetry; validate every distinct
      // model_id and provider_route against the flags the artifact is keyed by.
      const models = new Set(
        (report.runs ?? [])
          .map((r) => r.metadata?.model_id)
          .filter((m): m is string => typeof m === "string"),
      );
      for (const model of models) assertIdentity(filePath, { model }, options);
      // NOTE: reconstruct telemetry's provider_route is provider-only (Anthropic
      // SDK/api-key and Claude Code OAuth both read "anthropic"), so this can't
      // distinguish execution adapter/auth. An adapter/auth-aware route token is
      // a known limitation tracked for the simplification refactor (derive a
      // unified route identity from telemetry); for now route is provider-level.
      const routes = new Set(
        (report.runs ?? [])
          .map((r) => r.metadata?.provider_route)
          .filter((r): r is string => typeof r === "string"),
      );
      for (const route of routes) {
        if (route !== options.route) {
          throw new Error(
            `${filePath}: report route "${route}" != --route "${options.route}"`,
          );
        }
      }
      // Single-variable invariant: the base context must match across ALL
      // sources, and the non-swept requested knobs must match within each stage
      // (so a judge sweep can't fold in an author-effort or judge-model change).
      const baseKey = reconstructBaseKey(report);
      if (baseProvenance && baseProvenance.key !== baseKey) {
        throw new Error(
          `Reconstruct sources have mismatched provenance (commit/working-tree/realization/fixtures): ${baseProvenance.path} vs ${filePath}.`,
        );
      }
      baseProvenance ??= { path: filePath, key: baseKey };
      if (Object.keys(sweepContext).length === 0) {
        sweepContext = {
          commit: report.commit ?? null,
          working_tree_state: report.working_tree_state ?? null,
          realization: report.realization ?? null,
          fixtures: report.fixtures ?? [],
        };
      }
      const resolved = tag ?? deriveReconstructTag(report);
      if (resolved) {
        const nonSwept = reconstructNonSweptKey(report, resolved.stage);
        const prior = stageProvenance.get(resolved.stage);
        if (prior && prior.key !== nonSwept) {
          throw new Error(
            `Reconstruct ${resolved.stage} sources differ in a non-swept knob (author effort / judge model): ${prior.path} vs ${filePath}. Only the ${resolved.stage} effort may vary.`,
          );
        }
        if (!prior) stageProvenance.set(resolved.stage, { path: filePath, key: nonSwept });
      }
      sourceStatuses.push({ path: filePath, status: report.status ?? null });
      const before = runs.length;
      runs.push(...ingestReconstructReport(report, tag));
      // Every source must contribute at least one retained sample; if telemetry
      // filtering dropped them all (e.g. applied effort != requested, or the judge
      // never ran at the pinned effort) the intended point is silently missing, so
      // fail loud and name the source instead of writing a profile without it.
      if (runs.length === before) {
        throw new Error(
          `${filePath}: no runs survived telemetry filtering (applied effort/route mismatch or judge not exercised); the intended point would be missing.`,
        );
      }
    }
  }

  if (runs.length === 0) {
    throw new Error("No sweep runs ingested from the given report(s).");
  }

  // Fail loud if any ingested effort is outside --effort-order: the aggregator
  // silently drops such runs, which would persist a decision-grade artifact with
  // sweep_run_count > 0 but missing stages (e.g. a tag typo like author:hihg).
  const order = new Set(options.effortOrder);
  const unknownEfforts = [...new Set(runs.map((r) => r.effort))].filter(
    (e) => !order.has(e),
  );
  if (unknownEfforts.length > 0) {
    throw new Error(
      `Ingested runs use efforts not in --effort-order [${options.effortOrder.join(", ")}]: ${unknownEfforts.join(", ")}. Fix the tag/order so no evidence is dropped.`,
    );
  }

  const report = buildEffortCalibrationReport({
    pipeline,
    provider: options.provider,
    model: options.model,
    route: options.route,
    effortOrder: options.effortOrder,
    thresholds: {
      plateauThreshold: options.plateauThreshold,
      ...(options.passQuorum !== undefined ? { passQuorum: options.passQuorum } : {}),
    },
    runs,
  });

  // Decision-grade gate, recomputed from RETAINED evidence — not just the source
  // status. Telemetry filtering can drop runs after the source was stamped
  // decision-grade (e.g. a judge report where only one run actually exercised the
  // judge), so a point can fall below the run floor; such a profile is not
  // decision-grade. Refuse by default (mirroring the harness INV-BENCH-1 gate);
  // --allow-preliminary opts in and stamps the artifact decision_grade=false.
  const sourcesDecisionGrade = sourceStatuses.every((s) => isDecisionGrade(s.status));
  const thinPoints = report.stages
    .flatMap((s) => s.curve.map((p) => ({ stage: s.stage, ...p })))
    .filter((p) => p.runs < DECISION_GRADE_MIN_RUNS);
  const decisionGrade = sourcesDecisionGrade && thinPoints.length === 0;
  if (!decisionGrade && !options.allowPreliminary) {
    const reasons: string[] = [];
    if (!sourcesDecisionGrade) {
      const offenders = sourceStatuses
        .filter((s) => !isDecisionGrade(s.status))
        .map((s) => `${s.path} (${s.status ?? "no status"})`)
        .join(", ");
      reasons.push(`source(s) not decision-grade: ${offenders}`);
    }
    if (thinPoints.length > 0) {
      const thin = thinPoints
        .map((p) => `${p.stage}@${p.effort} (${p.runs} run${p.runs === 1 ? "" : "s"})`)
        .join(", ");
      reasons.push(
        `points below ${DECISION_GRADE_MIN_RUNS} retained runs after telemetry filtering: ${thin}`,
      );
    }
    throw new Error(
      `Not decision-grade — ${reasons.join("; ")}. Pass --allow-preliminary to build a marked (non-decision-grade) profile.`,
    );
  }

  const generatedAt = new Date().toISOString();
  const outputPath = path.resolve(
    options.outputPath ??
      defaultOutputPath(
        pipeline,
        { provider: options.provider, model: options.model, route: options.route },
        generatedAt,
      ),
  );
  const artifact = {
    artifact: "effort_profile",
    schema_version: 1,
    generated_at: generatedAt,
    decision_grade: decisionGrade,
    source_reports: sourceStatuses,
    sweep_context: sweepContext,
    sweep_run_count: runs.length,
    ...report,
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await writeFileAtomic(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  const markdownPath = outputPath.replace(/\.json$/, ".md");
  await writeFileAtomic(
    markdownPath,
    renderMarkdown(report, generatedAt, sourceStatuses, decisionGrade, sweepContext),
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        wrote: outputPath,
        markdown: markdownPath,
        pipeline,
        decision_grade: decisionGrade,
        sweep_run_count: runs.length,
        stages: report.stages.map((s) => ({
          stage: s.stage,
          minViableEffort: s.minViableEffort,
          recommendedEffort: s.recommendedEffort,
          plateauReached: s.plateauReached,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
