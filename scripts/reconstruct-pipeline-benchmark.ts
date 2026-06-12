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
const PRELIMINARY_STATUS = "PRELIMINARY — not decision-grade";
const DECISION_GRADE_STATUS = "decision-grade";

type Realization = "mock" | "live";

interface HarnessOptions {
  runs: number;
  fixtureIds: ReconstructQualityGateFixtureId[];
  realization: Realization;
  outputPath?: string;
  keepTmp: boolean;
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
    started_at: string;
  };
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
    `> Status: ${String(report.status)}`,
    `> Generated: ${String(report.generated_at)} | Commit: ${String(report.commit).slice(0, 9)}`,
    `> Fixtures: ${(report.fixtures as string[]).join(", ")} | Repetitions: ${String(report.repetitions)}`,
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

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const commit = await gitCommit();
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
  const runs: BenchmarkRunRecord[] = [];
  try {
    for (const fixtureId of options.fixtureIds) {
      for (let runIndex = 1; runIndex <= options.runs; runIndex += 1) {
        process.stderr.write(
          `[run] ${fixtureId} ${options.realization} ${runIndex}/${options.runs}\n`,
        );
        runs.push(
          await executeRun({
            fixtureId,
            realization: options.realization,
            runIndex,
            commit,
            keepTmp: options.keepTmp,
          }),
        );
      }
    }
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const evidenceGrade = options.runs >= 3 && options.fixtureIds.length >= 2;
  const qualityRuns = runs.filter((run) => run.quality_gate.q1 !== null);
  const report = {
    benchmark: "reconstruct-pipeline",
    record_family:
      "pipeline-benchmark (specializes the review-pipeline-* record family; shared fields unchanged, reconstruct facts in reconstruct_extension)",
    status: evidenceGrade ? DECISION_GRADE_STATUS : PRELIMINARY_STATUS,
    realization: options.realization,
    fixtures: options.fixtureIds,
    repetitions: options.runs,
    generated_at: new Date().toISOString(),
    commit,
    metrics: {
      duration_s: aggregate(runs, (run) => run.duration_s),
      total_llm_duration_ms: aggregate(runs, (run) => run.totals.llm_duration_ms),
      total_llm_call_count: aggregate(runs, (run) => run.totals.llm_call_count),
      total_prompt_chars: aggregate(runs, (run) => run.totals.prompt_chars),
      total_output_chars: aggregate(runs, (run) => run.totals.output_chars),
    },
    comparison_conclusion: null,
    reconstruct_extension: {
      quality: {
        evaluated_run_count: qualityRuns.length,
        skipped_runs: runs
          .filter((run) => run.quality_gate.q1 === null)
          .map((run) => ({
            fixture_id: run.fixture_id,
            run_index: run.run_index,
            status: run.quality_gate.status,
            reason: run.quality_gate.reason ?? null,
          })),
        q1_recall: stats(
          qualityRuns.map((run) => run.quality_gate.q1?.recall ?? 0),
        ),
        q2_support_rate: stats(
          qualityRuns.map((run) => run.quality_gate.q2?.support_rate ?? 0),
        ),
        q3_dropped_questions: stats(
          qualityRuns.map((run) =>
            run.quality_gate.q3?.dropped_question_count ?? 0
          ),
        ),
      },
      failure_class_counts: runs.reduce<Record<string, number>>(
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
    },
    runs,
  };

  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : defaultOutputPath(options.realization);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const markdownPath = outputPath.replace(/\.json$/, ".md");
  await fs.writeFile(markdownPath, renderMarkdown(report), "utf8");
  process.stdout.write(
    `${JSON.stringify({ status: report.status, output: outputPath, markdown: markdownPath, runs: runs.length }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
