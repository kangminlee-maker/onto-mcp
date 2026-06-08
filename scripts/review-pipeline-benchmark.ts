import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";
import {
  REVIEW_EXECUTION_UNIT_IDS,
  defaultReviewExecutionUnits,
  defaultReviewRetrySettings,
  type ReviewExecutionUnitId,
} from "../src/core-runtime/discovery/settings-chain.js";
import {
  evaluateReviewPipelineSemanticQualityGate,
  type SemanticQualityGateFixtureId,
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
const COMMAND_OUTPUT_BUFFER_BYTES = 50 * 1024 * 1024;
const PRELIMINARY_STATUS = "PRELIMINARY — not decision-grade";
const DECISION_GRADE_STATUS = "decision-grade";
const SEMANTIC_FIXTURE_IDS = [
  "review-pipeline-target-v1",
  "retry-policy-target-v1",
] as const satisfies readonly SemanticQualityGateFixtureId[];

type BenchmarkCaseId = string;
type ExecutorRealization = "codex" | "ts_inline_http";
type BenchmarkDecisionStatus =
  | typeof DECISION_GRADE_STATUS
  | typeof PRELIMINARY_STATUS;
type LlmReviewExecutionUnitId = Exclude<ReviewExecutionUnitId, "issue_stance_matrix">;
type BenchmarkComparisonAxis = "legacy_profile" | "unit_effort" | "all_effort";

const LLM_REVIEW_EXECUTION_UNIT_IDS = REVIEW_EXECUTION_UNIT_IDS.filter(
  (unitId): unitId is LlmReviewExecutionUnitId => unitId !== "issue_stance_matrix",
);

interface BenchmarkOptions {
  runs: number;
  caseSelectors: string[];
  executorRealization?: ExecutorRealization;
  model: string;
  provider: string;
  auth: string;
  baseEffort: string;
  baselineEffort: string;
  candidateEffort: string;
  sweepEfforts: string[];
  sweepUnits: LlmReviewExecutionUnitId[];
  sweepAllUnits: boolean;
  fixtureIds: SemanticQualityGateFixtureId[];
  outputPath?: string;
  lensIds: string[];
  keepTmp: boolean;
  timeoutMs: number;
  unitTimeoutMs?: number;
  unitSweepCandidateOnly: boolean;
  maxConcurrentLenses: number;
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
  profile_role: "baseline" | "candidate";
  comparison_axis: BenchmarkComparisonAxis;
  base_effort: string;
  unit_efforts: Partial<Record<LlmReviewExecutionUnitId, string>>;
  varied_unit_id?: LlmReviewExecutionUnitId;
  varied_effort?: string;
}

interface BenchmarkLlmSettings {
  auth: string;
  provider: string;
  model: string;
  effort: string;
  service_tier?: string;
}

interface BenchmarkFixtureSpec {
  fixture_id: SemanticQualityGateFixtureId;
  target_path: string;
  intent: string;
  files: Record<string, string>;
}

interface BenchmarkRunSummary {
  case_id: BenchmarkCaseId;
  fixture_id: SemanticQualityGateFixtureId;
  run_index: number;
  status: "completed" | "failed";
  command_exit_code: number | null;
  command_signal: string | null;
  command_duration_ms: number;
  project_root: string;
  session_root: string | null;
  temp_root_kept: boolean;
  target_path: string;
  model: string;
  provider: string;
  auth: string;
  base_effort: string;
  unit_efforts: Partial<Record<LlmReviewExecutionUnitId, string>>;
  varied_unit_id?: LlmReviewExecutionUnitId;
  varied_effort?: string;
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

interface NumericStats {
  mean: number;
  stdev: number;
  min: number;
  max: number;
  n: number;
}

interface BenchmarkCaseSummary {
  case_id: BenchmarkCaseId;
  profile_role: BenchmarkCase["profile_role"];
  comparison_axis: BenchmarkComparisonAxis;
  base_effort: string;
  varied_unit_id?: LlmReviewExecutionUnitId;
  varied_effort?: string;
  fixture_ids: SemanticQualityGateFixtureId[];
  fixture_count: number;
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
  metric_stats: Record<string, NumericStats | null>;
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
  comparison_axis: BenchmarkComparisonAxis;
  varied_unit_id?: LlmReviewExecutionUnitId;
  varied_effort?: string;
  metrics: Record<string, BenchmarkMetricDelta>;
}

function usage(): string {
  return [
    "Usage: npm run benchmark:review:pipeline -- [options]",
    "",
    "Options:",
    "  --runs <n>                         Runs per case+fixture. Default: 1",
    "  --case <existing-low-effort|controlled-high-effort|both|all-low|all-medium|all-high|all-xhigh|unit-sweep>",
    "                                     Repeatable. Default: both",
    "  --fixture <review-pipeline-target-v1|retry-policy-target-v1>",
    "                                     Repeatable. Default: review-pipeline-target-v1",
    "  --executor-realization <codex|ts_inline_http>",
    "                                     Debug-only legacy CLI override. Omit to use project config.",
    "  --model <model-id>                  Default: gpt-5.5",
    "  --provider <provider>               Default: openai",
    "  --auth <auth-mode>                  Default: oauth. ts_inline_http requires explicit api_key or local",
    "  --base-effort <effort>              Unit-sweep baseline. Default: medium",
    "  --baseline-effort <effort>          Legacy existing-low-effort value. Default: low",
    "  --candidate-effort <effort>         Legacy controlled-high-effort value. Default: xhigh",
    "  --sweep-effort <effort[,effort]>    Unit-sweep candidate efforts. Default: low,high,xhigh",
    "  --sweep-unit <unit-id[,unit-id]>     Unit-sweep target units. Repeatable",
    "  --sweep-all-units                   Sweep every LLM-backed review unit",
    "  --max-concurrent-lenses <n>          Default: 3",
    "  --lens-id <id>                      Restrict selected lenses. May repeat",
    "  --output <path>                     Also write JSON report to path",
    "  --keep-tmp                          Keep temp benchmark projects",
    "  --timeout-ms <n>                    Per review timeout. Default: 240000",
    "  --unit-timeout-ms <n>               Override generated fixture unit timeouts",
    "  --unit-sweep-candidate-only         Diagnostic: omit unit-sweep baseline",
    "",
    "Decision-grade evidence requires --runs >= 3 and at least two --fixture values.",
    "Unit-sweep changes one LLM-backed pipeline unit effort at a time over a fixed base effort.",
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

function expandCsv(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(value: string | undefined, fallback: number, label: string): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function isSemanticFixtureId(value: string): value is SemanticQualityGateFixtureId {
  return (SEMANTIC_FIXTURE_IDS as readonly string[]).includes(value);
}

function isLlmUnitId(value: string): value is LlmReviewExecutionUnitId {
  return (LLM_REVIEW_EXECUTION_UNIT_IDS as readonly string[]).includes(value);
}

function parseFixtureIds(argv: string[]): SemanticQualityGateFixtureId[] {
  const values = expandCsv(readMultiOption(argv, "fixture"));
  if (values.length === 0) return ["review-pipeline-target-v1"];
  return values.map((value) => {
    if (!isSemanticFixtureId(value)) {
      throw new Error(`Unknown --fixture value: ${value}`);
    }
    return value;
  });
}

function parseSweepUnits(argv: string[]): LlmReviewExecutionUnitId[] {
  const values = expandCsv(readMultiOption(argv, "sweep-unit"));
  return values.map((value) => {
    if (!isLlmUnitId(value)) {
      throw new Error(
        `Unknown --sweep-unit value: ${value}. LLM-backed units: ${LLM_REVIEW_EXECUTION_UNIT_IDS.join(", ")}`,
      );
    }
    return value;
  });
}

function parseOptions(argv: string[]): BenchmarkOptions {
  if (hasFlag(argv, "help")) {
    console.log(usage());
    process.exit(0);
  }

  const caseValues = expandCsv(readMultiOption(argv, "case"));
  const caseSelectors =
    caseValues.length === 0 || caseValues.includes("both")
      ? ["existing-low-effort", "controlled-high-effort"]
      : caseValues;

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

  const timeoutMs = parsePositiveInt(
    readOption(argv, "timeout-ms") ??
      process.env.ONTO_REVIEW_BENCHMARK_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    "--timeout-ms",
  );
  const unitTimeoutValue = readOption(argv, "unit-timeout-ms");
  const unitTimeoutMs = unitTimeoutValue === undefined
    ? undefined
    : parsePositiveInt(unitTimeoutValue, DEFAULT_TIMEOUT_MS, "--unit-timeout-ms");
  const explicitAuth = readOption(argv, "auth");
  if (executorRealization === "ts_inline_http" && explicitAuth === undefined) {
    throw new Error(
      "Debug-only --executor-realization ts_inline_http requires explicit --auth api_key or --auth local. The benchmark default auth remains oauth.",
    );
  }

  const sweepUnits = parseSweepUnits(argv);
  const sweepAllUnits = hasFlag(argv, "sweep-all-units");
  if (
    caseSelectors.includes("unit-sweep") &&
    !sweepAllUnits &&
    sweepUnits.length === 0
  ) {
    throw new Error(
      "unit-sweep requires --sweep-unit <unit-id> or --sweep-all-units to avoid accidental large live benchmark runs.",
    );
  }

  return {
    runs: parsePositiveInt(readOption(argv, "runs"), 1, "--runs"),
    caseSelectors,
    executorRealization,
    model: readOption(argv, "model") ?? "gpt-5.5",
    provider: readOption(argv, "provider") ?? "openai",
    auth: explicitAuth ?? "oauth",
    baseEffort: readOption(argv, "base-effort") ?? "medium",
    baselineEffort: readOption(argv, "baseline-effort") ?? "low",
    candidateEffort: readOption(argv, "candidate-effort") ?? "xhigh",
    sweepEfforts: expandCsv(readMultiOption(argv, "sweep-effort")).length > 0
      ? expandCsv(readMultiOption(argv, "sweep-effort"))
      : ["low", "high", "xhigh"],
    sweepUnits,
    sweepAllUnits,
    fixtureIds: parseFixtureIds(argv),
    outputPath: readOption(argv, "output"),
    lensIds: expandCsv(readMultiOption(argv, "lens-id")),
    keepTmp:
      hasFlag(argv, "keep-tmp") ||
      process.env.ONTO_REVIEW_BENCHMARK_KEEP_TMP === "1",
    timeoutMs,
    unitTimeoutMs,
    unitSweepCandidateOnly: hasFlag(argv, "unit-sweep-candidate-only"),
    maxConcurrentLenses: parsePositiveInt(
      readOption(argv, "max-concurrent-lenses"),
      3,
      "--max-concurrent-lenses",
    ),
  };
}

function fullUnitEfforts(effort: string): Partial<Record<LlmReviewExecutionUnitId, string>> {
  return Object.fromEntries(
    LLM_REVIEW_EXECUTION_UNIT_IDS.map((unitId) => [unitId, effort]),
  ) as Partial<Record<LlmReviewExecutionUnitId, string>>;
}

function allEffortCase(args: {
  caseId: string;
  label: string;
  effort: string;
  profileRole: BenchmarkCase["profile_role"];
  comparisonAxis: BenchmarkComparisonAxis;
}): BenchmarkCase {
  return {
    case_id: args.caseId,
    label: args.label,
    profile_role: args.profileRole,
    comparison_axis: args.comparisonAxis,
    base_effort: args.effort,
    unit_efforts: fullUnitEfforts(args.effort),
  };
}

function benchmarkCases(options: BenchmarkOptions): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  const pushCase = (benchCase: BenchmarkCase): void => {
    if (!cases.some((candidate) => candidate.case_id === benchCase.case_id)) {
      cases.push(benchCase);
    }
  };

  for (const selector of options.caseSelectors) {
    if (selector === "existing-low-effort") {
      pushCase(
        allEffortCase({
          caseId: "existing-low-effort",
          label: "Legacy profile with lower effort",
          effort: options.baselineEffort,
          profileRole: "baseline",
          comparisonAxis: "legacy_profile",
        }),
      );
      continue;
    }
    if (selector === "controlled-high-effort") {
      pushCase(
        allEffortCase({
          caseId: "controlled-high-effort",
          label: "Controlled profile with higher effort",
          effort: options.candidateEffort,
          profileRole: "candidate",
          comparisonAxis: "legacy_profile",
        }),
      );
      continue;
    }
    if (selector.startsWith("all-")) {
      const effort = selector.slice("all-".length);
      if (!effort) throw new Error(`Invalid all-effort case selector: ${selector}`);
      pushCase(
        allEffortCase({
          caseId: selector,
          label: `All LLM-backed units at ${effort} effort`,
          effort,
          profileRole: effort === options.baseEffort ? "baseline" : "candidate",
          comparisonAxis: "all_effort",
        }),
      );
      continue;
    }
    if (selector === "unit-sweep") {
      if (!options.unitSweepCandidateOnly) {
        pushCase({
          case_id: `unit-sweep-base-${options.baseEffort}`,
          label: `Unit sweep baseline: all LLM-backed units at ${options.baseEffort}`,
          profile_role: "baseline",
          comparison_axis: "unit_effort",
          base_effort: options.baseEffort,
          unit_efforts: fullUnitEfforts(options.baseEffort),
        });
      }
      const units = options.sweepAllUnits
        ? LLM_REVIEW_EXECUTION_UNIT_IDS
        : options.sweepUnits;
      for (const unitId of units) {
        for (const effort of options.sweepEfforts) {
          if (effort === options.baseEffort) continue;
          pushCase({
            case_id: `unit-sweep-${unitId}-${effort}`,
            label: `Unit sweep: ${unitId} at ${effort}, others at ${options.baseEffort}`,
            profile_role: "candidate",
            comparison_axis: "unit_effort",
            base_effort: options.baseEffort,
            unit_efforts: {
              ...fullUnitEfforts(options.baseEffort),
              [unitId]: effort,
            },
            varied_unit_id: unitId,
            varied_effort: effort,
          });
        }
      }
      continue;
    }
    throw new Error(`Unknown --case value: ${selector}`);
  }
  return cases;
}

function benchmarkFixture(fixtureId: SemanticQualityGateFixtureId): BenchmarkFixtureSpec {
  if (fixtureId === "retry-policy-target-v1") {
    return {
      fixture_id: fixtureId,
      target_path: "src/retry.ts",
      intent:
        "Review retry behavior, especially explicit maxRetries zero and boundary-only debug/telemetry exports.",
      files: {
        "src/retry.ts": [
          "export interface RetryRequest {",
          "  operation: () => Promise<void>;",
          "  maxRetries?: number;",
          "  telemetryLabel?: string;",
          "}",
          "",
          "export async function retryRequest(request: RetryRequest): Promise<void> {",
          "  const maxRetries = request.maxRetries || 3;",
          "  let attempt = 0;",
          "  while (true) {",
          "    try {",
          "      await request.operation();",
          "      return;",
          "    } catch (error) {",
          "      if (attempt >= maxRetries) throw error;",
          "      attempt += 1;",
          "    }",
          "  }",
          "}",
          "",
          "export function retryBudget(request: Pick<RetryRequest, 'maxRetries'>): number {",
          "  return request.maxRetries || 3;",
          "}",
          "",
          "export const telemetryLabel = 'retry-policy';",
          "",
          "export function debugRetryState(request: RetryRequest): string {",
          "  return `${request.telemetryLabel ?? telemetryLabel}:${retryBudget(request)}`;",
          "}",
          "",
        ].join("\n"),
      },
    };
  }
  return {
    fixture_id: fixtureId,
    target_path: "src/target.ts",
    intent:
      "Review formatter behavior, especially unstableFormat. For this fixture, lensId/lens identity is intentionally not a material defect: the target provides no caller requirement, expected summary contract, or public API obligation to expose identity. Preserve it only as boundary/evidence-gap context while focusing material issues on unstableFormat.",
    files: {
      "src/target.ts": [
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
    },
  };
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
  const defaultUnits = defaultReviewExecutionUnits();
  const units: Record<string, unknown> = {};
  for (const unitId of REVIEW_EXECUTION_UNIT_IDS) {
    units[unitId] = { ...(defaultUnits[unitId] ?? {}) };
    if (options.unitTimeoutMs !== undefined) {
      units[unitId] = {
        ...(units[unitId] as Record<string, unknown>),
        timeout_ms: options.unitTimeoutMs,
      };
    }
  }
  for (const unitId of LLM_REVIEW_EXECUTION_UNIT_IDS) {
    units[unitId] = {
      ...(defaultUnits[unitId] ?? {}),
      ...(options.unitTimeoutMs !== undefined
        ? { timeout_ms: options.unitTimeoutMs }
        : {}),
      llm: {
        model: options.model,
        effort: benchCase.unit_efforts[unitId] ?? benchCase.base_effort,
      },
    };
  }
  return {
    schema_version: "settings.json/v3",
    review: {
      mode: "core-axis",
      domains: [],
      artifacts: {
        lens_output_format: "sidecar",
        write_lens_markdown: false,
      },
      execution: {
        ...(executor ? { executor } : {}),
        topology: "main-workers",
        artifact_generation_realization: "live",
        max_concurrent_lenses: options.maxConcurrentLenses,
        retry: defaultReviewRetrySettings(),
        actors: {
          teamlead: {
            seat: "main",
            llm: llmSettingsForEffort(options, benchCase.base_effort),
          },
          lens: {
            seat: "worker",
            llm: llmSettingsForEffort(options, benchCase.base_effort),
          },
          synthesize: {
            seat: "worker",
            llm: llmSettingsForEffort(options, benchCase.base_effort),
          },
        },
        deliberation: "controlled-lens-deliberation",
        units,
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
  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputOverflow = false;
    let resolved = false;
    const child = spawn(TSX, args, {
      cwd: PROJECT_ROOT,
      env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const killSpawnedCommand = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined) return;
      try {
        process.kill(process.platform === "win32" ? child.pid : -child.pid, signal);
      } catch {
        // Process already exited.
      }
    };

    const appendOutput = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      if (stream === "stdout") {
        stdoutBytes += chunk.length;
        if (stdoutBytes <= COMMAND_OUTPUT_BUFFER_BYTES) {
          stdout += chunk.toString("utf8");
        }
        return;
      }
      stderrBytes += chunk.length;
      if (stderrBytes <= COMMAND_OUTPUT_BUFFER_BYTES) {
        stderr += chunk.toString("utf8");
      }
    };

    const finish = (result: Omit<CommandResult, "durationMs">): void => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      resolve({
        ...result,
        stdout,
        stderr: outputOverflow
          ? `${stderr}\n[benchmark] command output exceeded ${COMMAND_OUTPUT_BUFFER_BYTES} bytes`
          : stderr,
        durationMs: Date.now() - started,
      });
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      appendOutput("stdout", chunk);
      if (stdoutBytes > COMMAND_OUTPUT_BUFFER_BYTES) {
        outputOverflow = true;
        killSpawnedCommand("SIGTERM");
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      appendOutput("stderr", chunk);
      if (stderrBytes > COMMAND_OUTPUT_BUFFER_BYTES) {
        outputOverflow = true;
        killSpawnedCommand("SIGTERM");
      }
    });

    const killTimer = setTimeout(() => {
      killSpawnedCommand("SIGKILL");
    }, timeoutMs + 1000);
    killTimer.unref();

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      killSpawnedCommand("SIGTERM");
    }, timeoutMs);
    timeoutTimer.unref();

    child.on("error", (error) => {
      finish({
        stdout,
        stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`,
        exitCode: null,
        signal: null,
      });
    });
    child.on("close", (code, signal) => {
      finish({
        stdout,
        stderr,
        exitCode: typeof code === "number" ? code : null,
        signal: timedOut ? signal ?? "SIGTERM" : signal,
      });
    });
  });
}

function isBenchmarkOwnedProcessCommand(
  command: string,
  projectRoot: string,
): boolean {
  if (!command.includes(projectRoot)) return false;
  return [
    "src/core-runtime/cli/review-invoke.ts",
    "dist/core-runtime/cli/review-invoke.js",
    "codex-review-unit-executor",
    "inline-http-review-unit-executor",
    "codex exec",
  ].some((needle) => command.includes(needle));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function benchmarkProcessIdsForRoot(projectRoot: string): Promise<number[]> {
  if (process.platform === "win32") return [];
  try {
    const pgrep = await execFileAsync("pgrep", ["-f", escapeRegex(projectRoot)], {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024,
    });
    const candidatePids = pgrep.stdout
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid !== process.pid);
    const ownedPids: number[] = [];
    for (const pid of candidatePids) {
      try {
        const command = await execFileAsync(
          "ps",
          ["-p", String(pid), "-o", "command="],
          { cwd: PROJECT_ROOT, maxBuffer: 2 * 1024 * 1024 },
        );
        if (isBenchmarkOwnedProcessCommand(command.stdout.trim(), projectRoot)) {
          ownedPids.push(pid);
        }
      } catch {
        // Process already exited.
      }
    }
    return ownedPids;
  } catch {
    return [];
  }
}

async function terminateBenchmarkProcessesForRoot(projectRoot: string): Promise<void> {
  const politePids = await benchmarkProcessIdsForRoot(projectRoot);
  for (const pid of politePids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process already exited.
    }
  }
  if (politePids.length > 0) await sleep(1000);
  const remainingPids = await benchmarkProcessIdsForRoot(projectRoot);
  for (const pid of remainingPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }
}

async function removeTreeWithRetries(targetPath: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await sleep(200 * (attempt + 1));
    }
  }
  throw lastError;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupBenchmarkRunArtifacts(
  projectRoot: string,
  home: string,
  options: { waitForDetachedChildren?: boolean } = {},
): Promise<void> {
  const waitForDetachedChildren = options.waitForDetachedChildren === true;
  const requiredCleanStreak = waitForDetachedChildren ? 4 : 2;
  const settleDelayMs = waitForDetachedChildren ? 2000 : 750;
  let cleanStreak = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await sleep(
      attempt === 0 ? (waitForDetachedChildren ? 1000 : 250) : settleDelayMs,
    );
    await terminateBenchmarkProcessesForRoot(projectRoot);
    await removeTreeWithRetries(projectRoot);
    await removeTreeWithRetries(home);
    const remainingPids = await benchmarkProcessIdsForRoot(projectRoot);
    const isClean =
      remainingPids.length === 0 &&
      !(await pathExists(projectRoot)) &&
      !(await pathExists(home));
    cleanStreak = isClean ? cleanStreak + 1 : 0;
    if (cleanStreak >= requiredCleanStreak) {
      return;
    }
  }
  await terminateBenchmarkProcessesForRoot(projectRoot);
  await removeTreeWithRetries(projectRoot);
  await removeTreeWithRetries(home);
  const remainingPids = await benchmarkProcessIdsForRoot(projectRoot);
  if (
    remainingPids.length > 0 ||
    (await pathExists(projectRoot)) ||
    (await pathExists(home))
  ) {
    throw new Error(
      `Failed to clean benchmark temp artifacts for ${projectRoot}; remaining_pids=${remainingPids.join(",")}`,
    );
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function partialOutputPath(outputPath: string | undefined): string | null {
  if (!outputPath) return null;
  const parsed = path.parse(outputPath);
  const fileName = parsed.ext.length > 0
    ? `${parsed.name}.partial${parsed.ext}`
    : `${parsed.base}.partial.json`;
  return path.resolve(parsed.dir, fileName);
}

async function writePartialBenchmarkReport(args: {
  options: BenchmarkOptions;
  cases: BenchmarkCase[];
  runs: BenchmarkRunSummary[];
  expectedRunCount: number;
}): Promise<void> {
  const outputPath = partialOutputPath(args.options.outputPath);
  if (!outputPath) return;
  const caseSummaries = summarizeCases(args.cases, args.runs);
  await writeJson(outputPath, {
    schema_version: 3,
    generated_at: new Date().toISOString(),
    benchmark_kind: "review_pipeline_unit_effort",
    status: "PARTIAL — run in progress",
    expected_run_count: args.expectedRunCount,
    completed_run_count: args.runs.length,
    decision_gate: {
      required_min_runs_per_case_fixture: 3,
      required_min_fixture_count: 2,
      actual_runs_per_case_fixture: args.options.runs,
      actual_fixture_count: new Set(args.options.fixtureIds).size,
      comparison_conclusion_allowed: false,
    },
    matrix: {
      axes: ["fixture", "case", "run"],
      supported_case_axes: ["legacy_profile", "all_effort", "unit_effort"],
      llm_backed_units: LLM_REVIEW_EXECUTION_UNIT_IDS,
      runtime_only_units: ["issue_stance_matrix"],
    },
    comparison_mode: "same_checkout_profile_comparison",
    model: args.options.model,
    provider: args.options.provider,
    auth: args.options.auth,
    base_effort: args.options.baseEffort,
    selected_lens_ids: args.options.lensIds,
    fixtures: args.options.fixtureIds,
    repetitions: args.options.runs,
    max_concurrent_lenses: args.options.maxConcurrentLenses,
    cases: args.cases.map((benchCase) => ({
      case_id: benchCase.case_id,
      label: benchCase.label,
      profile_role: benchCase.profile_role,
      comparison_axis: benchCase.comparison_axis,
      base_effort: benchCase.base_effort,
      varied_unit_id: benchCase.varied_unit_id ?? null,
      varied_effort: benchCase.varied_effort ?? null,
      unit_efforts: benchCase.unit_efforts,
    })),
    case_summaries: caseSummaries,
    comparisons: compareCases(caseSummaries),
    comparison_conclusion: null,
    interpretation_notes: [
      "Partial benchmark report written after each completed run to preserve progress if the live benchmark is interrupted.",
      "Do not use this partial report as decision evidence; use the final report after all requested runs complete.",
    ],
    runs: args.runs,
  });
}

async function writeFixtureProject(args: {
  projectRoot: string;
  options: BenchmarkOptions;
  benchCase: BenchmarkCase;
  fixture: BenchmarkFixtureSpec;
}): Promise<void> {
  await fs.mkdir(path.join(args.projectRoot, ".onto"), { recursive: true });
  await writeJson(
    path.join(args.projectRoot, ".onto", "settings.json"),
    settingsForCase(args.options, args.benchCase),
  );
  for (const [relativePath, contents] of Object.entries(args.fixture.files)) {
    const filePath = path.join(args.projectRoot, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents, "utf8");
  }
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

function reviewInvokeArgs(args: {
  projectRoot: string;
  benchCase: BenchmarkCase;
  fixture: BenchmarkFixtureSpec;
  options: BenchmarkOptions;
}): string[] {
  const commandArgs = [
    "src/core-runtime/cli/review-invoke.ts",
    args.fixture.target_path,
    `Benchmark ${args.benchCase.label}: ${args.fixture.intent}`,
    "--project-root",
    args.projectRoot,
    "--onto-home",
    PROJECT_ROOT,
    "--no-domain",
    "--review-mode",
    "core-axis",
    "--no-watch",
    ...args.options.lensIds.flatMap((lensId) => ["--lens-id", lensId]),
  ];
  if (args.options.executorRealization) {
    commandArgs.push("--executor-realization", args.options.executorRealization);
  }
  return commandArgs;
}

function benchmarkEnv(home: string, options: BenchmarkOptions): NodeJS.ProcessEnv {
  const env = {
    ...process.env,
  };
  if (options.executorRealization === "ts_inline_http") {
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

function numericStats(values: Array<number | null | undefined>): NumericStats | null {
  const numbers = values.filter((value): value is number => typeof value === "number");
  if (numbers.length === 0) return null;
  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const variance = numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    numbers.length;
  return {
    mean: round2(mean),
    stdev: round2(Math.sqrt(variance)),
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    n: numbers.length,
  };
}

function average(values: Array<number | null | undefined>): number | null {
  return numericStats(values)?.mean ?? null;
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
    const fixtureIds = [
      ...new Set(caseRuns.map((run) => run.fixture_id)),
    ] as SemanticQualityGateFixtureId[];
    const stats = {
      command_duration_ms: numericStats(caseRuns.map((run) => run.command_duration_ms)),
      total_unit_duration_ms: numericStats(
        completedRuns.map((run) => run.total_unit_duration_ms),
      ),
      total_packet_bytes: numericStats(
        completedRuns.map((run) => run.total_packet_bytes),
      ),
      total_output_bytes: numericStats(
        completedRuns.map((run) => run.total_output_bytes),
      ),
      max_packet_bytes: numericStats(completedRuns.map((run) => run.max_packet_bytes)),
      synthesize_packet_bytes: numericStats(
        completedRuns.map((run) => run.synthesize_packet_bytes),
      ),
      synthesize_output_bytes: numericStats(
        completedRuns.map((run) => run.synthesize_output_bytes),
      ),
      final_output_bytes: numericStats(
        completedRuns.map((run) => run.final_output_bytes),
      ),
      total_attempt_count: numericStats(
        completedRuns.map((run) => run.total_attempt_count),
      ),
      failed_unit_count: numericStats(caseRuns.map((run) => run.failed_unit_count)),
    };
    return {
      case_id: benchCase.case_id,
      profile_role: benchCase.profile_role,
      comparison_axis: benchCase.comparison_axis,
      base_effort: benchCase.base_effort,
      varied_unit_id: benchCase.varied_unit_id,
      varied_effort: benchCase.varied_effort,
      fixture_ids: fixtureIds,
      fixture_count: fixtureIds.length,
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
      metric_stats: stats,
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

function comparisonMetrics(
  baseline: BenchmarkCaseSummary,
  candidate: BenchmarkCaseSummary,
): Record<string, BenchmarkMetricDelta> {
  return {
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
  };
}

function compareCases(summaries: BenchmarkCaseSummary[]): BenchmarkCaseComparison[] {
  const comparisons: BenchmarkCaseComparison[] = [];
  const legacyBaseline = summaries.find(
    (summary) => summary.case_id === "existing-low-effort",
  );
  const legacyCandidate = summaries.find(
    (summary) => summary.case_id === "controlled-high-effort",
  );
  if (legacyBaseline && legacyCandidate) {
    comparisons.push({
      baseline_case_id: legacyBaseline.case_id,
      candidate_case_id: legacyCandidate.case_id,
      comparison_axis: "legacy_profile",
      metrics: comparisonMetrics(legacyBaseline, legacyCandidate),
    });
  }

  for (const baseline of summaries.filter(
    (summary) =>
      summary.comparison_axis === "unit_effort" &&
      summary.profile_role === "baseline",
  )) {
    for (const candidate of summaries.filter(
      (summary) =>
        summary.comparison_axis === "unit_effort" &&
        summary.profile_role === "candidate",
    )) {
      comparisons.push({
        baseline_case_id: baseline.case_id,
        candidate_case_id: candidate.case_id,
        comparison_axis: "unit_effort",
        varied_unit_id: candidate.varied_unit_id,
        varied_effort: candidate.varied_effort,
        metrics: comparisonMetrics(baseline, candidate),
      });
    }
  }
  return comparisons;
}

async function collectRunSummary(args: {
  benchCase: BenchmarkCase;
  fixture: BenchmarkFixtureSpec;
  runIndex: number;
  command: CommandResult;
  projectRoot: string;
  sessionRoot: string | null;
  keepTmp: boolean;
  options: BenchmarkOptions;
}): Promise<BenchmarkRunSummary> {
  const baseSummary = {
    case_id: args.benchCase.case_id,
    fixture_id: args.fixture.fixture_id,
    run_index: args.runIndex,
    command_exit_code: args.command.exitCode,
    command_signal: args.command.signal,
    command_duration_ms: args.command.durationMs,
    project_root: args.projectRoot,
    session_root: args.sessionRoot,
    temp_root_kept: args.keepTmp,
    target_path: args.fixture.target_path,
    model: args.options.model,
    provider: args.options.provider,
    auth: args.options.auth,
    base_effort: args.benchCase.base_effort,
    unit_efforts: args.benchCase.unit_efforts,
    varied_unit_id: args.benchCase.varied_unit_id,
    varied_effort: args.benchCase.varied_effort,
  };

  if (!args.sessionRoot || args.command.exitCode !== 0) {
    return {
      ...baseSummary,
      status: "failed",
      error: args.command.stderr.trim() || args.command.stdout.trim() ||
        "review command failed before session summary",
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
    ...baseSummary,
    status: execution.execution_status === "completed" ? "completed" : "failed",
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
        requestedExecutorRealization: args.options.executorRealization,
        manifest,
      }),
      fixtureId: args.fixture.fixture_id,
      reviewRecord,
      finalOutputText,
      issueArtifacts,
    }),
  };
}

async function runBenchmarkCase(args: {
  options: BenchmarkOptions;
  benchCase: BenchmarkCase;
  fixture: BenchmarkFixtureSpec;
  runIndex: number;
}): Promise<BenchmarkRunSummary> {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), `onto-review-benchmark-${args.benchCase.case_id}-`),
  );
  const home = await fs.mkdtemp(
    path.join(os.tmpdir(), `onto-review-benchmark-home-${args.benchCase.case_id}-`),
  );
  let command: CommandResult | undefined;
  try {
    await writeFixtureProject({
      projectRoot: tempRoot,
      options: args.options,
      benchCase: args.benchCase,
      fixture: args.fixture,
    });
    command = await runCommand(
      reviewInvokeArgs({
        projectRoot: tempRoot,
        benchCase: args.benchCase,
        fixture: args.fixture,
        options: args.options,
      }),
      benchmarkEnv(home, args.options),
      args.options.timeoutMs,
    );
    const sessionRoot = await latestSessionRoot(tempRoot);
    return await collectRunSummary({
      benchCase: args.benchCase,
      fixture: args.fixture,
      runIndex: args.runIndex,
      command,
      projectRoot: tempRoot,
      sessionRoot,
      keepTmp: args.options.keepTmp,
      options: args.options,
    });
  } finally {
    if (!args.options.keepTmp) {
      await cleanupBenchmarkRunArtifacts(tempRoot, home, {
        waitForDetachedChildren: !command || command.exitCode !== 0 || command.signal !== null,
      });
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

function decisionStatus(options: BenchmarkOptions): BenchmarkDecisionStatus {
  const uniqueFixtureCount = new Set(options.fixtureIds).size;
  return options.runs >= 3 && uniqueFixtureCount >= 2
    ? DECISION_GRADE_STATUS
    : PRELIMINARY_STATUS;
}

function comparisonConclusion(args: {
  status: BenchmarkDecisionStatus;
  summaries: BenchmarkCaseSummary[];
  comparisons: BenchmarkCaseComparison[];
}): Record<string, unknown> | null {
  if (args.status !== DECISION_GRADE_STATUS) return null;
  const failedQualityCases = args.summaries
    .filter((summary) => summary.semantic_quality_failed_count > 0)
    .map((summary) => summary.case_id);
  return {
    status: "decision_grade_inputs_available",
    semantic_quality_failed_cases: failedQualityCases,
    comparison_count: args.comparisons.length,
    note:
      "Decision-grade sample requirements are met. Select effort settings by preferring zero semantic-quality failures, no completion-rate regression, lower attempts/failures, then lower wall-clock and output bytes.",
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const cases = benchmarkCases(options);
  const fixtures = options.fixtureIds.map(benchmarkFixture);
  const expectedRunCount = cases.length * fixtures.length * options.runs;
  const runs: BenchmarkRunSummary[] = [];
  for (const benchCase of cases) {
    for (const fixture of fixtures) {
      for (let runIndex = 1; runIndex <= options.runs; runIndex += 1) {
        runs.push(
          await runBenchmarkCase({
            options,
            benchCase,
            fixture,
            runIndex,
          }),
        );
        await writePartialBenchmarkReport({
          options,
          cases,
          runs,
          expectedRunCount,
        });
      }
    }
  }
  const caseSummaries = summarizeCases(cases, runs);
  const comparisons = compareCases(caseSummaries);
  const status = decisionStatus(options);

  const report = {
    schema_version: 3,
    generated_at: new Date().toISOString(),
    benchmark_kind: "review_pipeline_unit_effort",
    status,
    decision_gate: {
      required_min_runs_per_case_fixture: 3,
      required_min_fixture_count: 2,
      actual_runs_per_case_fixture: options.runs,
      actual_fixture_count: new Set(options.fixtureIds).size,
      comparison_conclusion_allowed: status === DECISION_GRADE_STATUS,
    },
    matrix: {
      axes: ["fixture", "case", "run"],
      supported_case_axes: ["legacy_profile", "all_effort", "unit_effort"],
      llm_backed_units: LLM_REVIEW_EXECUTION_UNIT_IDS,
      runtime_only_units: ["issue_stance_matrix"],
    },
    comparison_mode: "same_checkout_profile_comparison",
    git: await gitInfo(),
    debug_executor_realization_override: options.executorRealization ?? null,
    model: options.model,
    provider: options.provider,
    auth: options.auth,
    base_effort: options.baseEffort,
    selected_lens_ids: options.lensIds,
    fixtures: options.fixtureIds,
    repetitions: options.runs,
    unit_timeout_ms_override: options.unitTimeoutMs ?? null,
    unit_sweep_candidate_only: options.unitSweepCandidateOnly,
    max_concurrent_lenses: options.maxConcurrentLenses,
    cases: cases.map((benchCase) => ({
      case_id: benchCase.case_id,
      label: benchCase.label,
      profile_role: benchCase.profile_role,
      comparison_axis: benchCase.comparison_axis,
      base_effort: benchCase.base_effort,
      varied_unit_id: benchCase.varied_unit_id ?? null,
      varied_effort: benchCase.varied_effort ?? null,
      unit_efforts: benchCase.unit_efforts,
    })),
    case_summaries: caseSummaries,
    comparisons,
    comparison_conclusion: comparisonConclusion({
      status,
      summaries: caseSummaries,
      comparisons,
    }),
    interpretation_notes: [
      "Benchmark runs use the selected live/project executor route and therefore measure runtime overhead, artifact shape, packet/output bytes, contract stability, and model-dependent behavior together.",
      "Unit-sweep cases keep every LLM-backed unit at base_effort except one varied unit, so each unit-effort comparison changes one variable.",
      "semantic_quality_gate is deterministic for the selected benchmark fixture and should be interpreted with fixture_id and fixture_target_anchor.",
      "status remains PRELIMINARY unless runs >= 3 and fixture count >= 2; PRELIMINARY reports must not be used as decision evidence.",
      "For a true old-pipeline baseline, run this script on the old-pipeline checkout and compare JSON reports separately.",
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
