/**
 * Nested Batch Dispatch Bridge (brand-aware).
 *
 * # What this module is
 *
 * The A-path bridge between review session artifacts and a brand outer
 * nesting worker (codex `exec` | claude `-p`). It receives the
 * **caller-built** unit batch (the same dispatch list the flat path would
 * execute — parity by construction), attaches session-scoped common args,
 * invokes the brand's NestingBatchWorker realization, and classifies
 * per-unit outcomes into the participating / degraded sets used
 * downstream.
 *
 * # Layering
 *
 * - Units + inner executor argv are caller policy: the runner maps its
 *   flat `lensDispatches` (canonical seat paths, `--output-format`,
 *   `--human-output-ref`, LLM override args) so nested and flat execute
 *   the identical unit-executor invocation. The bridge never re-derives
 *   them from the plan (the retired bridge did, which is how nested lost
 *   structured-output parity and got fail-closed).
 * - The bridge owns: outer (teamlead seat) brand settings from
 *   `.onto/settings.json`, sessionRoot-scoped stream/archive paths, output
 *   probing, and the downstream result shape.
 *
 * # Scope
 *
 * This bridge owns only nested batch dispatch for the lens phase (A-path
 * scope). Synthesize, deliberation artifact handling, and final record
 * assembly stay in the main review runner.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { OntoConfig } from "../discovery/settings-chain.js";
import type { ReviewLlmRef } from "../discovery/settings-chain.js";
import {
  isExternalOauthWorkerSelection,
  normalizeLlmModelSwitcher,
} from "../llm/model-switcher.js";
import type { ReviewExecutionPlan } from "../review/artifact-types.js";
import { readYamlDocument } from "../review/review-artifact-utils.js";
import type {
  NestingBatchUnit,
  NestingBatchUnitOutcome,
} from "../review/nesting-batch.js";
import { runCodexNestingBatchWorker } from "./codex-nesting-batch-worker.js";
import { runClaudeNestingBatchWorker } from "./claude-nesting-batch-worker.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Outer worker brands with a NestingBatchWorker realization. */
export type NestedBatchBrand = "codex" | "claude";

/**
 * Brand-neutral outer worker run result — the structural shape both the
 * codex and claude realizations return.
 */
export interface NestedBatchWorkerRunResult {
  outcomes: NestingBatchUnitOutcome[];
  outer_stdout: string;
  outer_stderr: string;
  outer_exit_code: number;
  summary_parsed: boolean;
}

export interface NestedOuterSpawnConfig {
  model?: string;
  effort?: string;
  /** codex-only — `claude -p` has no service_tier surface (API-only). */
  service_tier?: string;
}

export interface NestedBatchDispatchArgs {
  /** Which outer worker realization fans the batch out. */
  brand: NestedBatchBrand;
  /** Absolute path to the review session directory. */
  sessionRoot: string;
  /** Project root (outer worker cwd + `--project-root` for inner units). */
  projectRoot: string;
  ontoConfig: OntoConfig;
  /**
   * Units to fan out, in dispatch order — built by the caller from the
   * same dispatch list the flat path executes (canonical output paths,
   * per-unit `--output-format` / `--human-output-ref` extra args).
   */
  units: NestingBatchUnit[];
  /**
   * Unit-executor invocation (bin + args, LLM overrides included) — the
   * caller passes the same effective executor config the flat path spawns.
   */
  inner_executor: { bin: string; args: string[] };
  /**
   * Per-invocation timeout for the outer worker (ms). Defaults to 10
   * minutes (worker-side default).
   */
  timeout_ms?: number;
  /**
   * Outer binary override (codex or claude binary path) for tests /
   * non-standard installations. Defaults to the brand's PATH-resolved
   * binary.
   */
  outer_bin?: string;
}

/**
 * Brand worker implementations — injectable for tests.
 */
export interface NestedBatchWorkers {
  codex: typeof runCodexNestingBatchWorker;
  claude: typeof runClaudeNestingBatchWorker;
}

const DEFAULT_WORKERS: NestedBatchWorkers = {
  codex: runCodexNestingBatchWorker,
  claude: runClaudeNestingBatchWorker,
};

/**
 * Result shape consumed by the downstream pipeline. `synthesis_executed`
 * is always `false`; synthesize runs in the main review runner. For lens
 * batches `unit_id === lens_id`, so the participating/degraded sets keep
 * their established names.
 */
export interface NestedBatchDispatchResult {
  session_root: string;
  executed_lens_count: number;
  participating_lens_ids: string[];
  degraded_lens_ids: string[];
  synthesis_executed: false;
  synthesis_output_path: string;
  error_log_path: string | null;
  halt_reason?: string;
  /** Raw worker result — retained for debugging / artifact capture. */
  nested_raw: NestedBatchWorkerRunResult;
}

// ---------------------------------------------------------------------------
// Filesystem validation (injectable for tests)
// ---------------------------------------------------------------------------

export interface OutputFileInspector {
  (outputPath: string): Promise<{ exists: boolean; size: number }>;
}

const defaultInspector: OutputFileInspector = async (p) => {
  try {
    const stat = await fs.stat(p);
    return { exists: stat.isFile(), size: stat.size };
  } catch {
    return { exists: false, size: 0 };
  }
};

// ---------------------------------------------------------------------------
// Artifact archival
// ---------------------------------------------------------------------------

/**
 * Archive for outer worker stdout/stderr when streaming did not already
 * write the files. Normally the worker is invoked with stream paths and
 * the on-disk files carry the authoritative content; in that case this
 * helper sees non-empty files and returns without writing (prevents
 * dual-writer drift).
 *
 * Silently swallows write errors — an artifact write failure must not
 * mask the actual dispatch outcome. Best-effort.
 */
async function archiveOuterStreamsIfMissing(
  sessionRoot: string,
  nestedResult: NestedBatchWorkerRunResult,
): Promise<void> {
  const stdoutPath = path.join(sessionRoot, "nested-outer-stdout.log");
  const stderrPath = path.join(sessionRoot, "nested-outer-stderr.log");
  await Promise.all([
    archiveWriteIfMissing(stdoutPath, nestedResult.outer_stdout ?? ""),
    archiveWriteIfMissing(stderrPath, nestedResult.outer_stderr ?? ""),
  ]);
}

async function archiveWriteIfMissing(targetPath: string, content: string): Promise<void> {
  try {
    const stat = await fs.stat(targetPath).catch(() => null);
    if (stat && stat.size > 0) {
      // Streaming writer produced a non-empty file — respect it as the
      // single authority. Do not overwrite.
      return;
    }
    await fs.writeFile(targetPath, content).catch(() => {});
  } catch {
    // Best-effort; never throw.
  }
}

// ---------------------------------------------------------------------------
// Outer (teamlead seat) setting resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the outer worker (teamlead seat) settings from
 * `.onto/settings.json` for the given brand. Empty object means the brand
 * CLI picks its configured defaults. Inner unit LLM settings are NOT
 * resolved here — they ride inside the caller-built `inner_executor`
 * args (flat parity). `service_tier` only surfaces for codex.
 */
export function resolveNestedOuterSpawnConfig(
  brand: NestedBatchBrand,
  config: OntoConfig,
): NestedOuterSpawnConfig {
  return (
    outerConfigFromRef(brand, config.review?.execution?.teamlead?.llm) ?? {}
  );
}

function outerConfigFromRef(
  brand: NestedBatchBrand,
  ref: ReviewLlmRef | undefined,
): NestedOuterSpawnConfig | null {
  const expectedAdapter = brand === "codex" ? "codex_cli" : "claude_code";
  const selection = normalizeLlmModelSwitcher(ref);
  if (
    !isExternalOauthWorkerSelection(selection) ||
    selection.execution_adapter !== expectedAdapter
  ) {
    return null;
  }
  return {
    ...(selection.model_id ? { model: selection.model_id } : {}),
    ...(selection.reasoning_effort ? { effort: selection.reasoning_effort } : {}),
    ...(brand === "codex" && selection.service_tier
      ? { service_tier: selection.service_tier }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Main bridge function
// ---------------------------------------------------------------------------

/**
 * Execute the lens phase via the brand's nesting batch worker. Dispatches
 * the caller-built units through one outer worker plus one inner
 * unit-executor subprocess per unit, and classifies outcomes into
 * participating / degraded sets.
 *
 * A worker `status: "ok"` is NOT sufficient for `participating` — the
 * output file must exist AND be non-empty. This guards against the outer
 * worker reporting success when an inner executor failed to write its
 * seat.
 *
 * Injection:
 *   - `workers`: replace the brand realizations (default: real workers)
 *   - `inspector`: replace the file-existence probe (default: `fs.stat`)
 */
export async function executeReviewViaNestedBatch(
  args: NestedBatchDispatchArgs,
  workers: NestedBatchWorkers = DEFAULT_WORKERS,
  inspector: OutputFileInspector = defaultInspector,
): Promise<NestedBatchDispatchResult> {
  const executionPlanPath = path.join(args.sessionRoot, "execution-plan.yaml");
  // `readYamlDocument` throws with a descriptive message when the file
  // is missing or malformed — let it propagate so the caller sees the
  // session artifact problem directly rather than a generic null check.
  const plan = await readYamlDocument<ReviewExecutionPlan>(executionPlanPath);

  const outerConfig = resolveNestedOuterSpawnConfig(args.brand, args.ontoConfig);

  // Stream paths live under sessionRoot so the watcher pane can `tail -f`
  // them from the moment the outer worker starts emitting. With streaming
  // active, these files are the single authority — no post-dispatch
  // overwrite (prevents dual-writer drift).
  const streamStdoutPath = path.join(args.sessionRoot, "nested-outer-stdout.log");
  const streamStderrPath = path.join(args.sessionRoot, "nested-outer-stderr.log");

  const sharedInput = {
    batch: {
      units: args.units,
      inner_executor_argv: [args.inner_executor.bin, ...args.inner_executor.args],
      common_args: [
        "--project-root",
        args.projectRoot,
        "--session-root",
        args.sessionRoot,
      ],
    },
    ...(outerConfig.model ? { teamlead_model: outerConfig.model } : {}),
    ...(outerConfig.effort ? { teamlead_reasoning_effort: outerConfig.effort } : {}),
    project_root: args.projectRoot,
    ...(typeof args.timeout_ms === "number" ? { timeout_ms: args.timeout_ms } : {}),
    stream_stdout_path: streamStdoutPath,
    stream_stderr_path: streamStderrPath,
  };

  const nestedResult: NestedBatchWorkerRunResult =
    args.brand === "codex"
      ? await workers.codex({
          ...sharedInput,
          ...(outerConfig.service_tier
            ? { teamlead_service_tier: outerConfig.service_tier }
            : {}),
          ...(args.outer_bin ? { codex_bin: args.outer_bin } : {}),
        })
      : await workers.claude({
          ...sharedInput,
          ...(args.outer_bin ? { claude_bin: args.outer_bin } : {}),
        });

  // Archive step is a no-op when streaming already produced files.
  await archiveOuterStreamsIfMissing(args.sessionRoot, nestedResult);

  const participating: string[] = [];
  const degraded: string[] = [];
  for (let i = 0; i < args.units.length; i += 1) {
    const unit = args.units[i]!;
    const outcome = nestedResult.outcomes[i];
    const workerOk = outcome?.status === "ok";
    if (!workerOk) {
      degraded.push(unit.unit_id);
      continue;
    }
    const probe = await inspector(unit.output_path);
    if (probe.exists && probe.size > 0) {
      participating.push(unit.unit_id);
    } else {
      degraded.push(unit.unit_id);
    }
  }

  // Determine halt_reason when the worker signalled outer-level failure
  // (e.g., timeout, no summary) — surfaces to the caller for error
  // reporting. Per-unit degradation alone does NOT halt.
  let halt_reason: string | undefined;
  if (!nestedResult.summary_parsed && nestedResult.outer_exit_code !== 0) {
    halt_reason =
      `nested outer worker (${args.brand}) failed (exit=${nestedResult.outer_exit_code}, summary=missing)`;
  }

  return {
    session_root: args.sessionRoot,
    executed_lens_count: args.units.length,
    participating_lens_ids: participating,
    degraded_lens_ids: degraded,
    synthesis_executed: false,
    synthesis_output_path: plan.synthesis_output_path,
    error_log_path: plan.error_log_path ?? null,
    nested_raw: nestedResult,
    ...(halt_reason ? { halt_reason } : {}),
  };
}
