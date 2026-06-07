import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";
import {
  evaluateReviewPipelineSemanticQualityGate,
  type SemanticQualityGateResult,
} from "../src/core-runtime/review/semantic-quality-gate.js";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();
const TSX = path.join(
  PROJECT_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const DEFAULT_TIMEOUT_MS = 240000;

type BenchmarkCaseId = "existing-low-effort" | "controlled-high-effort";
type ExecutorRealization = "codex" | "ts_inline_http";

interface BenchmarkOptions {
  runs: number;
  caseIds: BenchmarkCaseId[];
  executorRealization?: ExecutorRealization;
  model: string;
  provider: string;
  auth: string;
  baselineEffort: string;
  candidateEffort: string;
  outputPath?: string;
  lensIds: string[];
  keepTmp: boolean;
  timeoutMs: number;
}

interface UnitResult {
  unit_id?: string;
  unit_kind?: string;
  status?: string;
  duration_ms?: number;
  failure_kind?: string | null;
  failure_message?: string | null;
  attempt_count?: number | null;
  packet_bytes?: number | null;
  output_bytes?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  tool_calls?: number | null;
  tool_iterations?: number | null;
}

interface ReviewExecutionResult {
  execution_status?: string;
  deliberation_status?: string | null;
  planned_lens_ids?: string[];
  participating_lens_ids?: string[];
  degraded_lens_ids?: string[];
  max_concurrent_lenses?: number;
  observed_dispatch_width?: number;
  lens_execution_results?: UnitResult[];
  issue_artifact_execution_results?: UnitResult[];
  deliberation_execution_results?: UnitResult[];
  synthesize_execution_result?: UnitResult | null;
}

interface ReviewRunManifest {
  review_execution_profile?: {
    mode?: string;
    deliberation?: string;
    effort?: string;
    runtime_route?: {
      execution_route?: string;
      execution_adapter?: string;
      model_provider?: string | null;
      execution_realization?: string;
      host_runtime?: string;
      worker_executor?: string;
      runtime_provider?: string;
      auth_mode?: string | null;
    };
  };
}

interface ReviewRecord {
  record_status?: string;
  result_classification_summary?: {
    issue_count?: number;
    material_issue_count?: number;
    non_material_finding_count?: number;
    highest_severity?: string | null;
    action_candidates?: unknown[];
  } | null;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
}

interface BenchmarkCase {
  case_id: BenchmarkCaseId;
  label: string;
  profile_role: "baseline" | "controlled";
  effort: string;
  synthesizeEffort: string;
}

interface BenchmarkLlmSettings {
  auth: string;
  provider: string;
  model: string;
  effort: string;
  service_tier?: string;
}

interface BenchmarkRunSummary {
  case_id: BenchmarkCaseId;
  run_index: number;
  status: "completed" | "failed";
  command_exit_code: number | null;
  command_signal: string | null;
  command_duration_ms: number;
  session_root: string | null;
  temp_root_kept: boolean;
  execution_status?: string;
  deliberation_status?: string | null;
  planned_lens_count?: number;
  participating_lens_count?: number;
  degraded_lens_count?: number;
  max_concurrent_lenses?: number;
  observed_dispatch_width?: number;
  unit_count?: number;
  failed_unit_count?: number;
  total_unit_duration_ms?: number;
  total_packet_bytes?: number;
  total_output_bytes?: number;
  max_packet_bytes?: number;
  synthesize_packet_bytes?: number | null;
  synthesize_output_bytes?: number | null;
  final_output_bytes?: number | null;
  total_attempt_count?: number;
  failure_kind_counts?: Record<string, number>;
  unit_summaries?: BenchmarkUnitSummary[];
  review_profile?: ReviewRunManifest["review_execution_profile"];
  quality_proxy?: {
    record_status?: string;
    issue_count?: number;
    material_issue_count?: number;
    non_material_finding_count?: number;
    highest_severity?: string | null;
    action_candidate_count?: number;
  };
  semantic_quality_gate?: SemanticQualityGateResult;
  error?: string;
}

interface BenchmarkCaseSummary {
  case_id: BenchmarkCaseId;
  run_count: number;
  completed_count: number;
  failed_count: number;
  completion_rate: number;
  average_command_duration_ms: number | null;
  average_total_unit_duration_ms: number | null;
  average_total_packet_bytes: number | null;
  average_total_output_bytes: number | null;
  average_max_packet_bytes: number | null;
  average_synthesize_packet_bytes: number | null;
  average_synthesize_output_bytes: number | null;
  average_final_output_bytes: number | null;
  average_total_attempt_count: number | null;
  average_failed_unit_count: number | null;
  semantic_quality_passed_count: number;
  semantic_quality_failed_count: number;
  semantic_quality_not_applicable_count: number;
  failure_kind_counts: Record<string, number>;
}

interface BenchmarkMetricDelta {
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
  delta_pct: number | null;
}

interface BenchmarkCaseComparison {
  baseline_case_id: BenchmarkCaseId;
  candidate_case_id: BenchmarkCaseId;
  metrics: Record<string, BenchmarkMetricDelta>;
}

function usage(): string {
  return [
    "Usage: npm run benchmark:review:pipeline -- [options]",
    "",
    "Options:",
    "  --runs <n>                         Runs per case. Default: 1",
    "  --case <existing-low-effort|controlled-high-effort|both>",
    "  --executor-realization <codex|ts_inline_http>",
    "                                     Debug-only legacy CLI override. Omit to use project config.",
    "  --model <model-id>                  Default: gpt-5.5",
    "  --provider <provider>               Default: openai",
    "  --auth <auth-mode>                  Default: oauth. ts_inline_http requires explicit api_key or local",
    "  --baseline-effort <effort>          Default: low",
    "  --candidate-effort <effort>         Default: xhigh",
    "  --lens-id <id>                      Restrict selected lenses. May repeat",
    "  --output <path>                     Also write JSON report to path",
    "  --keep-tmp                          Keep temp benchmark projects",
    "  --timeout-ms <n>                    Per review timeout. Default: 240000",
  ].join("\n");
}

function readOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function readMultiOption(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === `--${name}`) {
      const value = argv[index + 1];
      if (value && !value.startsWith("--")) values.push(value);
    }
  }
  return values;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

function parseOptions(argv: string[]): BenchmarkOptions {
  if (hasFlag(argv, "help")) {
    console.log(usage());
    process.exit(0);
  }

  const caseValues = readMultiOption(argv, "case");
  const selectedCases =
    caseValues.length === 0 || caseValues.includes("both")
      ? ["existing-low-effort", "controlled-high-effort"]
      : caseValues;
  const caseIds = selectedCases.map((value) => {
    if (value !== "existing-low-effort" && value !== "controlled-high-effort") {
      throw new Error(`Unknown --case value: ${value}`);
    }
    return value;
  });

  const executorRealization =
    readOption(argv, "executor-realization") as ExecutorRealization | undefined;
  if (
    executorRealization !== undefined &&
    executorRealization !== "codex" &&
    executorRealization !== "ts_inline_http"
  ) {
    throw new Error(
      `Unknown debug --executor-realization value: ${executorRealization}`,
    );
  }
  const runs = Number.parseInt(readOption(argv, "runs") ?? "1", 10);
  if (!Number.isFinite(runs) || runs <= 0) {
    throw new Error("--runs must be a positive integer.");
  }

  const timeoutMs = Number.parseInt(
    readOption(argv, "timeout-ms") ??
      process.env.ONTO_REVIEW_BENCHMARK_TIMEOUT_MS ??
      String(DEFAULT_TIMEOUT_MS),
    10,
  );

  const explicitAuth = readOption(argv, "auth");
  if (executorRealization === "ts_inline_http" && explicitAuth === undefined) {
    throw new Error(
      "Debug-only --executor-realization ts_inline_http requires explicit --auth api_key or --auth local. The benchmark default auth remains oauth.",
    );
  }
  const auth = explicitAuth ?? "oauth";

  return {
    runs,
    caseIds,
    executorRealization,
    model: readOption(argv, "model") ?? "gpt-5.5",
    provider: readOption(argv, "provider") ?? "openai",
    auth,
    baselineEffort: readOption(argv, "baseline-effort") ?? "low",
    candidateEffort: readOption(argv, "candidate-effort") ?? "xhigh",
    outputPath: readOption(argv, "output"),
    lensIds: readMultiOption(argv, "lens-id"),
    keepTmp:
      hasFlag(argv, "keep-tmp") ||
      process.env.ONTO_REVIEW_BENCHMARK_KEEP_TMP === "1",
    timeoutMs,
  };
}

interface BenchmarkUnitSummary {
  unit_id?: string;
  unit_kind?: string;
  status?: string;
  duration_ms?: number;
  failure_kind?: string | null;
  attempt_count?: number | null;
  packet_bytes?: number | null;
  output_bytes?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  tool_calls?: number | null;
  tool_iterations?: number | null;
}

function benchmarkCases(options: BenchmarkOptions): BenchmarkCase[] {
  const all: Record<BenchmarkCaseId, BenchmarkCase> = {
    "existing-low-effort": {
      case_id: "existing-low-effort",
      label: "Baseline profile with low effort",
      profile_role: "baseline",
      effort: options.baselineEffort,
      synthesizeEffort: options.baselineEffort,
    },
    "controlled-high-effort": {
      case_id: "controlled-high-effort",
      label: "Controlled profile with higher effort",
      profile_role: "controlled",
      effort: options.candidateEffort,
      synthesizeEffort: options.candidateEffort,
    },
  };
  return options.caseIds.map((caseId) => all[caseId]);
}

function executorSelectionForBenchmark(
  executorRealization: ExecutorRealization | undefined,
): "codex" | "direct_call" | undefined {
  if (executorRealization === undefined) return undefined;
  if (executorRealization === "codex") return "codex";
  return "direct_call";
}

function llmSettingsForEffort(
  options: BenchmarkOptions,
  effort: string,
): BenchmarkLlmSettings {
  return {
    auth: options.auth,
    provider: options.provider,
    model: options.model,
    effort,
    ...(options.auth === "oauth" && options.provider === "openai"
      ? { service_tier: "fast" }
      : {}),
  };
}

function settingsForCase(options: BenchmarkOptions, benchCase: BenchmarkCase): unknown {
  const executor = executorSelectionForBenchmark(options.executorRealization);
  return {
    schema_version: "settings.json/v3",
    review: {
      mode: "core-axis",
      domains: [],
      execution: {
        ...(executor ? { executor } : {}),
        topology: "main-workers",
        actors: {
          teamlead: {
            seat: "main",
            llm: llmSettingsForEffort(options, benchCase.effort),
          },
          lens: {
            seat: "worker",
            llm: llmSettingsForEffort(options, benchCase.effort),
          },
          synthesize: {
            seat: "worker",
            llm: llmSettingsForEffort(options, benchCase.synthesizeEffort),
          },
        },
        deliberation: "controlled-lens-deliberation",
      },
    },
  };
}

async function runCommand(
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<CommandResult> {
  const started = Date.now();
  try {
    const result = await execFileAsync(TSX, args, {
      cwd: PROJECT_ROOT,
      env,
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
      signal: null,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const maybe = error as {
      code?: unknown;
      signal?: unknown;
      stdout?: unknown;
      stderr?: unknown;
    };
    return {
      stdout: typeof maybe.stdout === "string" ? maybe.stdout : "",
      stderr: typeof maybe.stderr === "string" ? maybe.stderr : "",
      exitCode: typeof maybe.code === "number" ? maybe.code : null,
      signal: typeof maybe.signal === "string" ? maybe.signal : null,
      durationMs: Date.now() - started,
    };
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeFixtureProject(
  projectRoot: string,
  options: BenchmarkOptions,
  benchCase: BenchmarkCase,
): Promise<void> {
  await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
  await writeJson(
    path.join(projectRoot, ".onto", "settings.json"),
    settingsForCase(options, benchCase),
  );
  await fs.writeFile(
    path.join(projectRoot, "src", "target.ts"),
    [
      "export interface ReviewPipelineInput {",
      "  lensId: string;",
      "  packetBytes: number;",
      "  outputBytes: number;",
      "}",
      "",
      "export function summarizeReviewPipeline(inputs: ReviewPipelineInput[]): string {",
      "  const totalPacketBytes = inputs.reduce((sum, input) => sum + input.packetBytes, 0);",
      "  const totalOutputBytes = inputs.reduce((sum, input) => sum + input.outputBytes, 0);",
      "  return `packet=${totalPacketBytes}; output=${totalOutputBytes}; units=${inputs.length}`;",
      "}",
      "",
      "export function unstableFormat(value: unknown): string {",
      "  return JSON.stringify(value);",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function readYaml<T>(filePath: string): Promise<T> {
  return YAML.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function readOptionalYaml(filePath: string): Promise<unknown | undefined> {
  try {
    return YAML.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

async function fileSize(filePath: string): Promise<number | null> {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return null;
  }
}

async function readOptionalText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function latestSessionRoot(projectRoot: string): Promise<string | null> {
  try {
    const pointer = await fs.readFile(
      path.join(projectRoot, ".onto", "review", ".latest-session"),
      "utf8",
    );
    const value = pointer.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function reviewInvokeArgs(projectRoot: string, benchCase: BenchmarkCase, options: BenchmarkOptions): string[] {
  const args = [
    "src/core-runtime/cli/review-invoke.ts",
    "src/target.ts",
    `Benchmark ${benchCase.label}`,
    "--project-root",
    projectRoot,
    "--onto-home",
    PROJECT_ROOT,
    "--no-domain",
    "--review-mode",
    "core-axis",
    "--no-watch",
    ...options.lensIds.flatMap((lensId) => ["--lens-id", lensId]),
  ];
  if (options.executorRealization) {
    args.push("--executor-realization", options.executorRealization);
  }
  return args;
}

function benchmarkEnv(home: string, options: BenchmarkOptions): NodeJS.ProcessEnv {
  const env = {
    ...process.env,
  };
  if (
    options.executorRealization === "ts_inline_http"
  ) {
    env.HOME = home;
    env.USERPROFILE = home;
  }
  return env;
}

function semanticGateExecutionRoute(args: {
  requestedExecutorRealization: ExecutorRealization | undefined;
  manifest: ReviewRunManifest;
}): string {
  const route = args.manifest.review_execution_profile?.runtime_route;
  return (
    route?.execution_route ??
    args.requestedExecutorRealization ??
    route?.worker_executor ??
    "project_config"
  );
}

function unitsFromExecution(execution: ReviewExecutionResult): UnitResult[] {
  return [
    ...(execution.lens_execution_results ?? []),
    ...(execution.issue_artifact_execution_results ?? []),
    ...(execution.deliberation_execution_results ?? []),
    ...(execution.synthesize_execution_result ? [execution.synthesize_execution_result] : []),
  ];
}

function sumNumbers(values: Array<number | null | undefined>): number {
  return values.reduce((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
}

function failureKindCounts(units: UnitResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const unit of units) {
    const kind = unit.failure_kind ?? (unit.status === "completed" ? "none" : "unknown");
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function unitSummary(unit: UnitResult): BenchmarkUnitSummary {
  return {
    unit_id: unit.unit_id,
    unit_kind: unit.unit_kind,
    status: unit.status,
    duration_ms: unit.duration_ms,
    failure_kind: unit.failure_kind,
    attempt_count: unit.attempt_count,
    packet_bytes: unit.packet_bytes,
    output_bytes: unit.output_bytes,
    input_tokens: unit.input_tokens,
    output_tokens: unit.output_tokens,
    tool_calls: unit.tool_calls,
    tool_iterations: unit.tool_iterations,
  };
}

function average(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");
  if (numbers.length === 0) return null;
  return round2(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function mergeFailureKindCounts(runs: BenchmarkRunSummary[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const run of runs) {
    for (const [kind, count] of Object.entries(run.failure_kind_counts ?? {})) {
      counts[kind] = (counts[kind] ?? 0) + count;
    }
  }
  return counts;
}

function summarizeCases(
  cases: BenchmarkCase[],
  runs: BenchmarkRunSummary[],
): BenchmarkCaseSummary[] {
  return cases.map((benchCase) => {
    const caseRuns = runs.filter((run) => run.case_id === benchCase.case_id);
    const completedRuns = caseRuns.filter((run) => run.status === "completed");
    return {
      case_id: benchCase.case_id,
      run_count: caseRuns.length,
      completed_count: completedRuns.length,
      failed_count: caseRuns.length - completedRuns.length,
      completion_rate:
        caseRuns.length === 0 ? 0 : round2(completedRuns.length / caseRuns.length),
      average_command_duration_ms: average(caseRuns.map((run) => run.command_duration_ms)),
      average_total_unit_duration_ms: average(
        completedRuns.map((run) => run.total_unit_duration_ms),
      ),
      average_total_packet_bytes: average(
        completedRuns.map((run) => run.total_packet_bytes),
      ),
      average_total_output_bytes: average(
        completedRuns.map((run) => run.total_output_bytes),
      ),
      average_max_packet_bytes: average(completedRuns.map((run) => run.max_packet_bytes)),
      average_synthesize_packet_bytes: average(
        completedRuns.map((run) => run.synthesize_packet_bytes),
      ),
      average_synthesize_output_bytes: average(
        completedRuns.map((run) => run.synthesize_output_bytes),
      ),
      average_final_output_bytes: average(
        completedRuns.map((run) => run.final_output_bytes),
      ),
      average_total_attempt_count: average(
        completedRuns.map((run) => run.total_attempt_count),
      ),
      average_failed_unit_count: average(caseRuns.map((run) => run.failed_unit_count)),
      semantic_quality_passed_count: completedRuns.filter(
        (run) => run.semantic_quality_gate?.status === "passed",
      ).length,
      semantic_quality_failed_count: completedRuns.filter(
        (run) => run.semantic_quality_gate?.status === "failed",
      ).length,
      semantic_quality_not_applicable_count: completedRuns.filter(
        (run) => run.semantic_quality_gate?.status === "not_applicable",
      ).length,
      failure_kind_counts: mergeFailureKindCounts(caseRuns),
    };
  });
}

function metricDelta(
  baseline: number | null,
  candidate: number | null,
): BenchmarkMetricDelta {
  if (baseline === null || candidate === null) {
    return { baseline, candidate, delta: null, delta_pct: null };
  }
  const delta = round2(candidate - baseline);
  return {
    baseline,
    candidate,
    delta,
    delta_pct: baseline === 0 ? null : round2((delta / baseline) * 100),
  };
}

function compareCases(summaries: BenchmarkCaseSummary[]): BenchmarkCaseComparison[] {
  const baseline = summaries.find((summary) => summary.case_id === "existing-low-effort");
  const candidate = summaries.find((summary) => summary.case_id === "controlled-high-effort");
  if (!baseline || !candidate) return [];
  return [
    {
      baseline_case_id: baseline.case_id,
      candidate_case_id: candidate.case_id,
      metrics: {
        completion_rate: metricDelta(baseline.completion_rate, candidate.completion_rate),
        average_command_duration_ms: metricDelta(
          baseline.average_command_duration_ms,
          candidate.average_command_duration_ms,
        ),
        average_total_unit_duration_ms: metricDelta(
          baseline.average_total_unit_duration_ms,
          candidate.average_total_unit_duration_ms,
        ),
        average_total_packet_bytes: metricDelta(
          baseline.average_total_packet_bytes,
          candidate.average_total_packet_bytes,
        ),
        average_total_output_bytes: metricDelta(
          baseline.average_total_output_bytes,
          candidate.average_total_output_bytes,
        ),
        average_max_packet_bytes: metricDelta(
          baseline.average_max_packet_bytes,
          candidate.average_max_packet_bytes,
        ),
        average_synthesize_packet_bytes: metricDelta(
          baseline.average_synthesize_packet_bytes,
          candidate.average_synthesize_packet_bytes,
        ),
        average_synthesize_output_bytes: metricDelta(
          baseline.average_synthesize_output_bytes,
          candidate.average_synthesize_output_bytes,
        ),
        average_final_output_bytes: metricDelta(
          baseline.average_final_output_bytes,
          candidate.average_final_output_bytes,
        ),
        average_total_attempt_count: metricDelta(
          baseline.average_total_attempt_count,
          candidate.average_total_attempt_count,
        ),
        average_failed_unit_count: metricDelta(
          baseline.average_failed_unit_count,
          candidate.average_failed_unit_count,
        ),
      },
    },
  ];
}

async function collectRunSummary(args: {
  benchCase: BenchmarkCase;
  runIndex: number;
  command: CommandResult;
  sessionRoot: string | null;
  keepTmp: boolean;
  executorRealization?: ExecutorRealization;
}): Promise<BenchmarkRunSummary> {
  if (!args.sessionRoot || args.command.exitCode !== 0) {
    return {
      case_id: args.benchCase.case_id,
      run_index: args.runIndex,
      status: "failed",
      command_exit_code: args.command.exitCode,
      command_signal: args.command.signal,
      command_duration_ms: args.command.durationMs,
      session_root: args.sessionRoot,
      temp_root_kept: args.keepTmp,
      error: args.command.stderr.trim() || args.command.stdout.trim() || "review command failed before session summary",
    };
  }

  const execution = await readYaml<ReviewExecutionResult>(
    path.join(args.sessionRoot, "execution-result.yaml"),
  );
  const manifest = await readYaml<ReviewRunManifest>(
    path.join(args.sessionRoot, "review-run-manifest.yaml"),
  );
  const reviewRecord = await readYaml<ReviewRecord>(
    path.join(args.sessionRoot, "review-record.yaml"),
  );
  const units = unitsFromExecution(execution);
  const packetBytes = units.map((unit) => unit.packet_bytes);
  const outputBytes = units.map((unit) => unit.output_bytes);
  const maxPacketBytes = Math.max(0, ...packetBytes.map((value) => value ?? 0));
  const synthesize = execution.synthesize_execution_result ?? null;
  const finalOutputPath = path.join(args.sessionRoot, "final-output.md");
  const finalOutputText = await readOptionalText(finalOutputPath);
  const issueArtifacts = {
    findingLedger: await readOptionalYaml(
      path.join(args.sessionRoot, "finding-ledger.yaml"),
    ),
    relationGraph: await readOptionalYaml(
      path.join(args.sessionRoot, "finding-relation-graph.yaml"),
    ),
    issueLedger: await readOptionalYaml(
      path.join(args.sessionRoot, "issue-ledger.yaml"),
    ),
  };

  return {
    case_id: args.benchCase.case_id,
    run_index: args.runIndex,
    status: execution.execution_status === "completed" ? "completed" : "failed",
    command_exit_code: args.command.exitCode,
    command_signal: args.command.signal,
    command_duration_ms: args.command.durationMs,
    session_root: args.sessionRoot,
    temp_root_kept: args.keepTmp,
    execution_status: execution.execution_status,
    deliberation_status: execution.deliberation_status,
    planned_lens_count: execution.planned_lens_ids?.length ?? 0,
    participating_lens_count: execution.participating_lens_ids?.length ?? 0,
    degraded_lens_count: execution.degraded_lens_ids?.length ?? 0,
    max_concurrent_lenses: execution.max_concurrent_lenses,
    observed_dispatch_width: execution.observed_dispatch_width,
    unit_count: units.length,
    failed_unit_count: units.filter((unit) => unit.status !== "completed").length,
    total_unit_duration_ms: sumNumbers(units.map((unit) => unit.duration_ms)),
    total_packet_bytes: sumNumbers(packetBytes),
    total_output_bytes: sumNumbers(outputBytes),
    max_packet_bytes: maxPacketBytes,
    synthesize_packet_bytes: synthesize?.packet_bytes ?? null,
    synthesize_output_bytes: synthesize?.output_bytes ?? null,
    final_output_bytes: await fileSize(finalOutputPath),
    total_attempt_count: sumNumbers(units.map((unit) => unit.attempt_count)),
    failure_kind_counts: failureKindCounts(units),
    unit_summaries: units.map(unitSummary),
    review_profile: manifest.review_execution_profile,
    quality_proxy: {
      record_status: reviewRecord.record_status,
      issue_count: reviewRecord.result_classification_summary?.issue_count,
      material_issue_count:
        reviewRecord.result_classification_summary?.material_issue_count,
      non_material_finding_count:
        reviewRecord.result_classification_summary?.non_material_finding_count,
      highest_severity: reviewRecord.result_classification_summary?.highest_severity,
      action_candidate_count:
        reviewRecord.result_classification_summary?.action_candidates?.length,
    },
    semantic_quality_gate: evaluateReviewPipelineSemanticQualityGate({
      executionRoute: semanticGateExecutionRoute({
        requestedExecutorRealization: args.executorRealization,
        manifest,
      }),
      reviewRecord,
      finalOutputText,
      issueArtifacts,
    }),
  };
}

async function runBenchmarkCase(
  options: BenchmarkOptions,
  benchCase: BenchmarkCase,
  runIndex: number,
): Promise<BenchmarkRunSummary> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `onto-review-benchmark-${benchCase.case_id}-`));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), `onto-review-benchmark-home-${benchCase.case_id}-`));
  try {
    await writeFixtureProject(tempRoot, options, benchCase);
    const command = await runCommand(
      reviewInvokeArgs(tempRoot, benchCase, options),
      benchmarkEnv(home, options),
      options.timeoutMs,
    );
    const sessionRoot = await latestSessionRoot(tempRoot);
    return await collectRunSummary({
      benchCase,
      runIndex,
      command,
      sessionRoot,
      keepTmp: options.keepTmp,
      executorRealization: options.executorRealization,
    });
  } finally {
    if (!options.keepTmp) {
      await fs.rm(tempRoot, { recursive: true, force: true });
      await fs.rm(home, { recursive: true, force: true });
    }
  }
}

async function gitInfo(): Promise<Record<string, unknown>> {
  const run = async (args: string[]): Promise<string | null> => {
    try {
      const result = await execFileAsync("git", args, { cwd: PROJECT_ROOT });
      return result.stdout.trim();
    } catch {
      return null;
    }
  };
  const status = await run(["status", "--short"]);
  return {
    commit: await run(["rev-parse", "HEAD"]),
    branch: await run(["branch", "--show-current"]),
    dirty: typeof status === "string" && status.length > 0,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const cases = benchmarkCases(options);
  const runs: BenchmarkRunSummary[] = [];
  for (const benchCase of cases) {
    for (let runIndex = 1; runIndex <= options.runs; runIndex += 1) {
      runs.push(await runBenchmarkCase(options, benchCase, runIndex));
    }
  }
  const caseSummaries = summarizeCases(cases, runs);

  const report = {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    benchmark_kind: "review_pipeline_io_effort",
    comparison_mode: "same_checkout_profile_comparison",
    git: await gitInfo(),
    debug_executor_realization_override: options.executorRealization ?? null,
    model: options.model,
    provider: options.provider,
    auth: options.auth,
    selected_lens_ids: options.lensIds,
    runs_per_case: options.runs,
    cases: cases.map((benchCase) => ({
      case_id: benchCase.case_id,
      label: benchCase.label,
      profile_role: benchCase.profile_role,
      effort: benchCase.effort,
      synthesize_effort: benchCase.synthesizeEffort,
    })),
    case_summaries: caseSummaries,
    comparisons: compareCases(caseSummaries),
    interpretation_notes: [
      "Benchmark runs use the selected live/project executor route and therefore measure runtime overhead, artifact shape, packet/output bytes, contract stability, and model-dependent behavior together.",
      "semantic_quality_gate is deterministic for the bundled benchmark fixture and should be interpreted with the selected target fixture and executor route.",
      "When both cases are run from the same checkout, the labels compare runtime profiles and effort settings on that checkout, not a historical pipeline implementation.",
      "For a true old-pipeline baseline, run this script on the old-pipeline checkout with --case existing-low-effort, then run the controlled checkout with --case controlled-high-effort and compare the JSON reports.",
    ],
    runs,
  };

  if (options.outputPath) {
    await writeJson(path.resolve(options.outputPath), report);
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
