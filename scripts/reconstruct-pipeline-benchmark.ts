/**
 * Reconstruct pipeline benchmark harness (optimization design §5 M4).
 *
 * Specializes the pipeline benchmark record family established by
 * scripts/review-pipeline-benchmark.ts: shared evidence-grade rules
 * (INV-BENCH-1 / docs/architecture/benchmark-harness-requirements.md) apply
 * unchanged, and reconstruct-specific facts live in a `reconstruct_extension`
 * block. Records land in
 * development-records/benchmark/reconstruct-pipeline-{realization}-{date}.{json,md}.
 *
 * Evidence-grade gates (structural, not advisory):
 *  - runs < 3 or fixtures < 2 → status PRELIMINARY; no conclusions.
 *  - this harness version runs a single case (one realization) per record, so
 *    `comparison_conclusion` is always null; lever A/B comparisons arrive with
 *    Phase 2 (one variable per comparison, INV-EXP-1).
 *
 * Metric sources: per-unit `execution_telemetry` from the reconstruct run
 * manifest (canonical size measure prompt_chars/output_chars), wall-clock per
 * run, and the golden semantic quality gate (Q1/Q2/Q3). Quality is evaluated
 * only where the fixture supports the realization; skips are reported, never
 * silent.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";
import { createOntoReconstructCoreApi } from "../src/core-api/reconstruct-api.js";
import {
  gradeBenchmarkEvidence,
} from "../src/core-runtime/reconstruct/benchmark-evidence.js";
import {
  benchmarkFailureClassCounts,
  classifyBenchmarkRunFailure,
  type BenchmarkRunFailureClass,
} from "../src/core-runtime/reconstruct/benchmark-failure-class.js";
import {
  evaluateReconstructGoldenQualityGate,
  reconstructGoldenFixtureSpec,
  RECONSTRUCT_QUALITY_GATE_FIXTURE_IDS,
  type ReconstructQualityGateFixtureId,
  type ReconstructQualityGateResult,
} from "../src/core-runtime/reconstruct/semantic-quality-gate.js";
import type {
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructRunManifestArtifact,
} from "../src/core-runtime/reconstruct/artifact-types.js";
import type { PipelineUnitExecutionTelemetry } from "../src/core-runtime/pipeline-execution-ledger.js";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();

type Realization = "mock" | "live";

interface HarnessOptions {
  runs: number;
  fixtureIds: ReconstructQualityGateFixtureId[];
  realization: Realization;
  /**
   * Pinned reasoning effort for live runs (recorded in metadata). Fixes a
   * reproducible effort independent of the runner's personal settings chain.
   * Ignored for mock realization (no provider). Undefined leaves the resolved
   * settings effort in place.
   */
  effort?: string;
  outputPath?: string;
  keepTmp: boolean;
  /** Re-derive a corrected report from an existing record without re-running. */
  reprojectFrom?: string;
}

interface UnitTelemetryRow extends PipelineUnitExecutionTelemetry {
  step_id: string;
}

interface RunTotals {
  llm_call_count: number;
  llm_duration_ms: number;
  prompt_chars: number;
  output_chars: number;
  failure_class_counts: Record<string, number>;
}

interface BenchmarkRunRecord {
  run_index: number;
  fixture_id: ReconstructQualityGateFixtureId;
  realization: Realization;
  target_path: string;
  session_root: string;
  duration_s: number;
  totals: RunTotals;
  units: UnitTelemetryRow[];
  quality_gate: ReconstructQualityGateResult;
  metadata: {
    project_root: string;
    commit: string;
    node_version: string;
    model_id: string | null;
    provider_route: string | null;
    applied_effort: string | null;
    unit_timeout_ms: number;
    started_at: string;
  };
}

interface BenchmarkFailedRun {
  run_index: number;
  fixture_id: ReconstructQualityGateFixtureId;
  realization: Realization;
  duration_s: number;
  failure_class: BenchmarkRunFailureClass;
  error_message: string;
}

interface Stats {
  mean: number;
  stdev: number;
  min: number;
  max: number;
  n: number;
}

function usage(): string {
  return [
    "Usage: tsx scripts/reconstruct-pipeline-benchmark.ts [options]",
    "",
    "Options:",
    "  --runs <n>             Repetitions per fixture (default 3; <3 → PRELIMINARY)",
    `  --fixture <id>         Repeatable. One of: ${RECONSTRUCT_QUALITY_GATE_FIXTURE_IDS.join(", ")}`,
    "                         Default: all golden fixtures",
    "  --realization <mode>   mock | live (default mock; mock sets ONTO_LLM_MOCK=1)",
    "  --effort <level>       Pin reconstruct reasoning effort. live-only (rejected",
    "                         for mock); recorded as requested_effort.",
    "  --reproject-from <p>   Re-derive a corrected report from an existing record",
    "                         (no re-execution); writes to --output or in place.",
    "  --output <path>        JSON output path (md sibling is derived)",
    "  --keep-tmp             Keep per-run temp project roots",
  ].join("\n");
}

function parseOptions(argv: string[]): HarnessOptions {
  const options: HarnessOptions = {
    runs: 3,
    fixtureIds: [],
    realization: "mock",
    keepTmp: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--runs") {
      options.runs = Number(argv[++index]);
      if (!Number.isInteger(options.runs) || options.runs < 1) {
        throw new Error("--runs must be a positive integer");
      }
    } else if (arg === "--fixture") {
      const fixtureId = argv[++index] as ReconstructQualityGateFixtureId;
      reconstructGoldenFixtureSpec(fixtureId);
      options.fixtureIds.push(fixtureId);
    } else if (arg === "--realization") {
      const realization = argv[++index];
      if (realization !== "mock" && realization !== "live") {
        throw new Error("--realization must be mock or live");
      }
      options.realization = realization;
    } else if (arg === "--effort") {
      const effort = argv[++index];
      if (!effort) throw new Error("--effort requires a value");
      options.effort = effort;
    } else if (arg === "--reproject-from") {
      const from = argv[++index];
      if (!from) throw new Error("--reproject-from requires a path");
      options.reprojectFrom = from;
    } else if (arg === "--output") {
      options.outputPath = argv[++index];
    } else if (arg === "--keep-tmp") {
      options.keepTmp = true;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    }
  }
  if (options.fixtureIds.length === 0) {
    options.fixtureIds = [...RECONSTRUCT_QUALITY_GATE_FIXTURE_IDS];
  }
  options.fixtureIds = [...new Set(options.fixtureIds)];
  if (options.effort !== undefined && options.realization !== "live") {
    // Effort only affects the live provider path; the mock route ignores it.
    // Reject it for mock so a record can never encode an unapplied effort.
    throw new Error("--effort applies only to --realization live");
  }
  if (options.realization === "live" && options.effort === undefined) {
    // Reproducible default: pin live runs to the repo's declared effort
    // instead of inheriting the runner's personal settings-chain effort.
    options.effort = "medium";
  }
  return options;
}

async function gitCommit(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: PROJECT_ROOT,
    });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

/**
 * Source-state provenance: a record is traceable to its commit only when the
 * working tree was clean at generation time. Dirty-tree records say so.
 */
async function gitWorkingTreeState(): Promise<"clean" | "dirty" | "unknown"> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: PROJECT_ROOT,
    });
    return stdout.trim().length === 0 ? "clean" : "dirty";
  } catch {
    return "unknown";
  }
}

async function readYamlFile<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function stats(values: number[]): Stats {
  const n = values.length;
  if (n === 0) return { mean: 0, stdev: 0, min: 0, max: 0, n: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1
    ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)
    : 0;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    mean: round(mean),
    stdev: round(Math.sqrt(variance)),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    n,
  };
}

function runTotals(units: UnitTelemetryRow[]): RunTotals {
  const failureClassCounts: Record<string, number> = {};
  let llmCallCount = 0;
  let llmDurationMs = 0;
  let promptChars = 0;
  let outputChars = 0;
  for (const unit of units) {
    llmCallCount += unit.llm_call_count;
    llmDurationMs += unit.duration_ms;
    promptChars += unit.prompt_chars;
    outputChars += unit.output_chars;
    for (const attempt of unit.attempts) {
      if (attempt.status === "failed" && attempt.failure_class) {
        failureClassCounts[attempt.failure_class] =
          (failureClassCounts[attempt.failure_class] ?? 0) + 1;
      }
    }
  }
  return {
    llm_call_count: llmCallCount,
    llm_duration_ms: llmDurationMs,
    prompt_chars: promptChars,
    output_chars: outputChars,
    failure_class_counts: failureClassCounts,
  };
}

async function materializeFixtureProject(
  fixtureId: ReconstructQualityGateFixtureId,
): Promise<string> {
  const spec = reconstructGoldenFixtureSpec(fixtureId);
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), `reconstruct-benchmark-${fixtureId}-`),
  );
  for (const [relPath, content] of Object.entries(spec.files)) {
    const filePath = path.join(root, relPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
  return root;
}

async function executeRun(args: {
  fixtureId: ReconstructQualityGateFixtureId;
  realization: Realization;
  effort?: string;
  runIndex: number;
  commit: string;
  keepTmp: boolean;
}): Promise<BenchmarkRunRecord> {
  const spec = reconstructGoldenFixtureSpec(args.fixtureId);
  const projectRoot = await materializeFixtureProject(args.fixtureId);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    const api = createOntoReconstructCoreApi({ ontoHome: PROJECT_ROOT });
    const result = await api.runReconstruct({
      projectRoot,
      targetRefs: [spec.target_path],
      sessionRoot: `.onto/reconstruct/benchmark-run-${args.runIndex}`,
      intent: spec.intent,
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      ...(args.effort ? { llmEffort: args.effort } : {}),
    });
    const durationS = (Date.now() - startedMs) / 1000;
    const manifest: ReconstructRunManifestArtifact = result.reconstructRunManifest;
    const units: UnitTelemetryRow[] = manifest.steps
      .filter((step) => step.execution_telemetry)
      .map((step) => ({
        step_id: step.step_id,
        ...step.execution_telemetry!,
      }));
    const qualityGate = evaluateReconstructGoldenQualityGate({
      fixtureId: args.fixtureId,
      realization: args.realization,
      runManifest: manifest,
      ontologySeed: await readYamlFile<ReconstructOntologySeedArtifact>(
        result.artifactRefs.ontology_seed!,
      ),
      competencyQuestions: await readYamlFile<
        ReconstructCompetencyQuestionsArtifact
      >(result.artifactRefs.competency_questions!),
      competencyQuestionAssessment: await readYamlFile<
        ReconstructCompetencyQuestionAssessmentArtifact
      >(result.artifactRefs.competency_question_assessment!),
    });
    const firstUnit = units[0] ?? null;
    return {
      run_index: args.runIndex,
      fixture_id: args.fixtureId,
      realization: args.realization,
      target_path: spec.target_path,
      session_root: result.sessionRoot,
      duration_s: Math.round(durationS * 1000) / 1000,
      totals: runTotals(units),
      units,
      quality_gate: qualityGate,
      metadata: {
        project_root: PROJECT_ROOT,
        commit: args.commit,
        node_version: process.version,
        model_id: firstUnit?.model_id ?? null,
        provider_route: firstUnit?.provider_route ?? null,
        // Applied effort from telemetry (what the provider actually used); null
        // for mock. The requested effort is recorded once at report level.
        applied_effort: firstUnit?.effort ?? null,
        unit_timeout_ms: Number(process.env.ONTO_LLM_TIMEOUT_MS) || 120_000,
        started_at: startedAt,
      },
    };
  } finally {
    if (!args.keepTmp) {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } else {
      process.stderr.write(`[keep-tmp] ${projectRoot}\n`);
    }
  }
}

function aggregate(
  runs: BenchmarkRunRecord[],
  pick: (run: BenchmarkRunRecord) => number,
): Record<string, Stats> {
  const byFixture = new Map<string, number[]>();
  for (const run of runs) {
    const values = byFixture.get(run.fixture_id) ?? [];
    values.push(pick(run));
    byFixture.set(run.fixture_id, values);
  }
  const out: Record<string, Stats> = {};
  for (const [fixtureId, values] of byFixture) out[fixtureId] = stats(values);
  return out;
}

function defaultOutputPath(realization: Realization): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return path.join(
    PROJECT_ROOT,
    "development-records",
    "benchmark",
    `reconstruct-pipeline-${realization}-${date}.json`,
  );
}

function renderMarkdown(report: Record<string, unknown>): string {
  const runs = report.runs as BenchmarkRunRecord[];
  const metrics = report.metrics as Record<string, Record<string, Stats>>;
  const lines: string[] = [
    `# Reconstruct Pipeline Benchmark (${String(report.realization)})`,
    "",
    `> Status: ${String(report.status)} (${String(report.status_reason)})`,
    `> Generated: ${String(report.generated_at)} | Commit: ${String(report.commit).slice(0, 9)} (${String(report.working_tree_state)} tree)`,
    ...(report.reprojected_from
      ? [
        `> Re-derived (no re-execution) from a record originally generated ${
          String((report.reprojected_from as { original_generated_at: string }).original_generated_at)
        }; commit/tree above are the original data provenance.`,
      ]
      : []),
    `> Fixtures: ${(report.fixtures as string[]).join(", ")} | Repetitions: ${String(report.repetitions)} | Requested effort: ${String(report.requested_effort ?? "(settings/none)")} | Unit timeout: ${(report.runs as BenchmarkRunRecord[])[0]?.metadata.unit_timeout_ms ?? "n/a"}ms`,
    `> comparison_conclusion: null (single-case record; lever comparisons arrive with Phase 2)`,
    "",
    "## Per-fixture metrics (mean ± stdev [min..max], n)",
    "",
    "| metric | fixture | mean | stdev | min | max | n |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const [metricName, byFixture] of Object.entries(metrics)) {
    for (const [fixtureId, value] of Object.entries(byFixture)) {
      lines.push(
        `| ${metricName} | ${fixtureId} | ${value.mean} | ${value.stdev} | ${value.min} | ${value.max} | ${value.n} |`,
      );
    }
  }
  const extension = report.reconstruct_extension as
    | {
      failed_runs?: BenchmarkFailedRun[];
      failed_run_failure_class_counts?: Record<string, number>;
    }
    | undefined;
  const failedRuns = extension?.failed_runs ?? [];
  if (failedRuns.length > 0) {
    lines.push("", "## Failed runs", "");
    const classCounts = extension?.failed_run_failure_class_counts ?? {};
    const tally = Object.entries(classCounts)
      .map(([cls, count]) => `${cls}=${count}`)
      .join(", ");
    lines.push(`Failure classes: ${tally || "(none)"}`, "");
    lines.push("| fixture | run | failure_class | duration_s | error |");
    lines.push("|---|---|---|---|---|");
    for (const failed of failedRuns) {
      lines.push(
        `| ${failed.fixture_id} | ${failed.run_index} | ${failed.failure_class} | ${failed.duration_s} | ${
          failed.error_message.replace(/\|/g, "\\|").slice(0, 120)
        } |`,
      );
    }
  }
  lines.push("", "## Quality gate", "");
  lines.push("| fixture | run | status | q1 recall | q2 support | q3 dropped |");
  lines.push("|---|---|---|---|---|---|");
  for (const run of runs) {
    const gate = run.quality_gate;
    lines.push(
      `| ${run.fixture_id} | ${run.run_index} | ${gate.status} | ${
        gate.q1?.recall ?? "-"
      } | ${gate.q2?.support_rate ?? "-"} | ${gate.q3?.dropped_question_count ?? "-"} |`,
    );
  }
  lines.push(
    "",
    "## Top units by mean LLM duration",
    "",
    "| unit | mean duration_ms | mean prompt_chars | mean output_chars | mean calls |",
    "|---|---|---|---|---|",
  );
  const unitAggregates = new Map<string, {
    duration: number[];
    prompt: number[];
    output: number[];
    calls: number[];
  }>();
  for (const run of runs) {
    for (const unit of run.units) {
      const entry = unitAggregates.get(unit.step_id) ??
        { duration: [], prompt: [], output: [], calls: [] };
      entry.duration.push(unit.duration_ms);
      entry.prompt.push(unit.prompt_chars);
      entry.output.push(unit.output_chars);
      entry.calls.push(unit.llm_call_count);
      unitAggregates.set(unit.step_id, entry);
    }
  }
  const meanOf = (values: number[]) =>
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)) *
        10,
    ) / 10;
  const sortedUnits = [...unitAggregates.entries()].sort(
    (a, b) => meanOf(b[1].duration) - meanOf(a[1].duration),
  );
  for (const [unitId, entry] of sortedUnits) {
    lines.push(
      `| ${unitId} | ${meanOf(entry.duration)} | ${meanOf(entry.prompt)} | ${
        meanOf(entry.output)
      } | ${meanOf(entry.calls)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

interface BuildReportArgs {
  runs: BenchmarkRunRecord[];
  failedRuns: BenchmarkFailedRun[];
  realization: Realization;
  effort?: string;
  fixtureIds: ReconstructQualityGateFixtureId[];
  repetitions: number;
  commit: string;
  workingTreeState: "clean" | "dirty" | "unknown";
  /** Set when re-deriving a corrected report from a preserved record. */
  reprojectedFrom?: { original_generated_at: string };
}

function buildReport(args: BuildReportArgs): Record<string, unknown> {
  // Evidence grading is owned by gradeBenchmarkEvidence (single source,
  // pinned by tests): INV-BENCH-1 performance thresholds plus quality-evidence
  // trust (no failed runs, no rejected runs, scored quality on >=2 fixtures).
  const qualityRuns = args.runs.filter((run) => run.quality_gate.q1 !== null);
  const rejectedQualityRuns = args.runs.filter(
    (run) => run.quality_gate.status === "rejected",
  );
  const evidence = gradeBenchmarkEvidence({
    repetitions: args.repetitions,
    fixtureCount: args.fixtureIds.length,
    scoredQualityRunCount: qualityRuns.length,
    scoredQualityFixtureCount: new Set(
      qualityRuns.map((run) => run.fixture_id),
    ).size,
    rejectedQualityRunCount: rejectedQualityRuns.length,
    failedRunCount: args.failedRuns.length,
  });
  return {
    benchmark: "reconstruct-pipeline",
    record_family:
      "pipeline-benchmark (specializes the review-pipeline-* record family; shared fields unchanged, reconstruct facts in reconstruct_extension)",
    status: evidence.status,
    status_reason: evidence.statusReason,
    evidence: {
      performance: {
        repetitions: args.repetitions,
        fixture_count: args.fixtureIds.length,
        succeeded_run_count: args.runs.length,
        failed_run_count: args.failedRuns.length,
        meets_inv_bench_1: evidence.performanceEvidenceMet,
      },
      quality: {
        scored_run_count: qualityRuns.length,
        not_applicable_run_count: args.runs.filter(
          (run) => run.quality_gate.status === "not_applicable",
        ).length,
        rejected_run_count: rejectedQualityRuns.length,
      },
    },
    realization: args.realization,
    requested_effort: args.effort ?? null,
    fixtures: args.fixtureIds,
    repetitions: args.repetitions,
    generated_at: new Date().toISOString(),
    commit: args.commit,
    working_tree_state: args.workingTreeState,
    ...(args.reprojectedFrom
      ? {
        reprojected_from: {
          original_generated_at: args.reprojectedFrom.original_generated_at,
          note:
            "Re-derived from the preserved record's runs/failed_runs (no re-execution); commit + working_tree_state are the original data provenance.",
        },
      }
      : {}),
    metrics: {
      duration_s: aggregate(args.runs, (run) => run.duration_s),
      total_llm_duration_ms: aggregate(
        args.runs,
        (run) => run.totals.llm_duration_ms,
      ),
      total_llm_call_count: aggregate(
        args.runs,
        (run) => run.totals.llm_call_count,
      ),
      total_prompt_chars: aggregate(args.runs, (run) => run.totals.prompt_chars),
      total_output_chars: aggregate(args.runs, (run) => run.totals.output_chars),
    },
    comparison_conclusion: null,
    reconstruct_extension: {
      quality: {
        scored_run_count: qualityRuns.length,
        unscored_runs: args.runs
          .filter((run) => run.quality_gate.q1 === null)
          .map((run) => ({
            fixture_id: run.fixture_id,
            run_index: run.run_index,
            status: run.quality_gate.status,
            reason: run.quality_gate.reason ?? null,
          })),
        q1_recall: stats(qualityRuns.map((run) => run.quality_gate.q1?.recall ?? 0)),
        q2_support_rate: stats(
          qualityRuns.map((run) => run.quality_gate.q2?.support_rate ?? 0),
        ),
        q3_dropped_questions: stats(
          qualityRuns.map((run) => run.quality_gate.q3?.dropped_question_count ?? 0),
        ),
      },
      // Internal attempt failure classes observed within COMPLETED runs
      // (e.g. a parse-repair on a unit that still finished). Distinct from
      // whole-run failures, which are aggregated below.
      completed_run_internal_failure_class_counts: args.runs.reduce<
        Record<string, number>
      >(
        (acc, run) => {
          for (
            const [failureClass, count] of Object.entries(
              run.totals.failure_class_counts,
            )
          ) {
            acc[failureClass] = (acc[failureClass] ?? 0) + count;
          }
          return acc;
        },
        {},
      ),
      // Whole-run failures (runs that died before producing a record),
      // aggregated by the structured failure class.
      failed_run_failure_class_counts: benchmarkFailureClassCounts(
        args.failedRuns,
      ),
      failed_runs: args.failedRuns,
    },
    runs: args.runs,
  };
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  // Temp-sibling + atomic rename so a process kill mid-write cannot leave a
  // torn report file (the durable-write guarantee for long live baselines).
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

async function writeReport(
  report: Record<string, unknown>,
  outputPath: string,
): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  // JSON is the canonical artifact; the markdown is derived from the same
  // report object, so both reflect one consistent snapshot.
  await writeFileAtomic(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  const markdownPath = outputPath.replace(/\.json$/, ".md");
  await writeFileAtomic(markdownPath, renderMarkdown(report));
  return markdownPath;
}

async function reprojectRecord(options: HarnessOptions): Promise<void> {
  // Re-derive a corrected report from a preserved record's runs/failed_runs
  // without re-executing. Used to migrate an existing record to the current
  // schema (structured failure classes, field names) from the same data.
  const sourcePath = path.resolve(options.reprojectFrom!);
  const loaded = JSON.parse(await fs.readFile(sourcePath, "utf8")) as {
    realization: Realization;
    effort?: string | null;
    requested_effort?: string | null;
    fixtures: ReconstructQualityGateFixtureId[];
    repetitions: number;
    commit: string;
    working_tree_state: "clean" | "dirty" | "unknown";
    generated_at: string;
    reprojected_from?: { original_generated_at?: string };
    runs: BenchmarkRunRecord[];
    reconstruct_extension?: { failed_runs?: BenchmarkFailedRun[] };
  };
  const runs: BenchmarkRunRecord[] = (loaded.runs ?? []).map((run) => {
    const meta = run.metadata as Record<string, unknown>;
    const appliedEffort = (meta.applied_effort ?? meta.effort ?? null) as
      | string
      | null;
    const { effort: _legacyEffort, ...restMeta } = meta;
    return {
      ...run,
      metadata: { ...restMeta, applied_effort: appliedEffort },
    } as BenchmarkRunRecord;
  });
  const failedRuns: BenchmarkFailedRun[] = (
    loaded.reconstruct_extension?.failed_runs ?? []
  ).map((failed) => ({
    ...failed,
    failure_class: classifyBenchmarkRunFailure(failed.error_message),
  }));
  const requestedEffort = loaded.requested_effort ?? loaded.effort ?? undefined;
  const report = buildReport({
    runs,
    failedRuns,
    realization: loaded.realization,
    ...(requestedEffort ? { effort: requestedEffort } : {}),
    fixtureIds: loaded.fixtures,
    repetitions: loaded.repetitions,
    commit: loaded.commit,
    workingTreeState: loaded.working_tree_state,
    reprojectedFrom: {
      // Preserve the true original across a chain of reprojections.
      original_generated_at: loaded.reprojected_from?.original_generated_at ??
        loaded.generated_at,
    },
  });
  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : sourcePath;
  const markdownPath = await writeReport(report, outputPath);
  process.stdout.write(
    `${JSON.stringify({ reprojected: outputPath, markdown: markdownPath, status: report.status }, null, 2)}\n`,
  );
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.reprojectFrom) {
    await reprojectRecord(options);
    return;
  }
  const commit = await gitCommit();
  const workingTreeState = await gitWorkingTreeState();
  const previousEnv = {
    ONTO_LLM_MOCK: process.env.ONTO_LLM_MOCK,
    ONTO_RUNTIME_WATCHER: process.env.ONTO_RUNTIME_WATCHER,
  };
  process.env.ONTO_RUNTIME_WATCHER = "0";
  if (options.realization === "mock") {
    process.env.ONTO_LLM_MOCK = "1";
  } else {
    delete process.env.ONTO_LLM_MOCK;
  }
  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : defaultOutputPath(options.realization);
  const runs: BenchmarkRunRecord[] = [];
  const failedRuns: BenchmarkFailedRun[] = [];
  const persist = async (): Promise<void> => {
    await writeReport(
      buildReport({
        runs,
        failedRuns,
        realization: options.realization,
        ...(options.effort ? { effort: options.effort } : {}),
        fixtureIds: options.fixtureIds,
        repetitions: options.runs,
        commit,
        workingTreeState,
      }),
      outputPath,
    );
  };
  try {
    for (const fixtureId of options.fixtureIds) {
      for (let runIndex = 1; runIndex <= options.runs; runIndex += 1) {
        process.stderr.write(
          `[run] ${fixtureId} ${options.realization} ${runIndex}/${options.runs}\n`,
        );
        // A single run failure (e.g. a unit timeout) is captured as a
        // failed-run record so the batch continues and the expensive prior
        // runs are not lost; the failure also blocks decision-grade status.
        // The record is persisted after every run so a process-level kill
        // mid-batch still leaves the completed runs on disk.
        const runStartedMs = Date.now();
        try {
          runs.push(
            await executeRun({
              fixtureId,
              realization: options.realization,
              ...(options.effort ? { effort: options.effort } : {}),
              runIndex,
              commit,
              keepTmp: options.keepTmp,
            }),
          );
        } catch (error) {
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          failedRuns.push({
            run_index: runIndex,
            fixture_id: fixtureId,
            realization: options.realization,
            duration_s: Math.round((Date.now() - runStartedMs)) / 1000,
            failure_class: classifyBenchmarkRunFailure(errorMessage),
            error_message: errorMessage,
          });
          process.stderr.write(
            `[run-failed] ${fixtureId} ${runIndex}/${options.runs}: ${errorMessage}\n`,
          );
        }
        await persist();
      }
    }
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  await persist();
  const finalReport = buildReport({
    runs,
    failedRuns,
    realization: options.realization,
    ...(options.effort ? { effort: options.effort } : {}),
    fixtureIds: options.fixtureIds,
    repetitions: options.runs,
    commit,
    workingTreeState,
  });
  process.stdout.write(
    `${JSON.stringify({ status: finalReport.status, output: outputPath, runs: runs.length, failed: failedRuns.length }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
