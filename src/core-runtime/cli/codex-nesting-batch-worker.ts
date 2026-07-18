/**
 * Codex Nesting Batch Worker — codex realization of the NestingBatchWorker
 * contract (`review/nesting-batch.ts`).
 *
 * # What this module is
 *
 * Runs the `nested-workers` codex outer seat: a single outer `codex exec`
 * worker is started by onto TS main (A) or a host driver (B), receives the
 * literal nesting batch script, and fans the batch out as parallel
 * **unit-executor subprocesses** (structured output / validation / retry
 * equal to the flat path by code sharing). The outer's single role is to
 * pipe the script to `bash -s` — it performs no reasoning or substitution.
 *
 * # Preconditions
 *
 *   - `codex` binary on PATH
 *   - `~/.codex/auth.json` valid
 *   - non-seatbelt sandbox (outer invoked with `--sandbox danger-full-access`
 *     so it can shell out to the inner unit executors; inner codex
 *     invocations keep their own `read-only` sandbox via the unit executor)
 *
 * # How it relates
 *
 * - Script/prompt/summary semantics: `review/nesting-batch.ts` (shared,
 *   brand-neutral).
 * - A-path bridge: `nested-batch-dispatch.ts`.
 * - The retired teamlead executor piped packets straight into
 *   `codex exec -o` (bypassing structured output) — that inner realization
 *   is gone; only the outer spawn survives here.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import { awaitChildExit } from "../child-process-exit.js";
import {
  buildNestingBatchWorkerPrompt,
  parseNestingBatchSummary,
  reconcileNestingBatchOutcomes,
  type NestingBatchDescriptor,
  type NestingBatchUnitOutcome,
} from "../review/nesting-batch.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CodexNestingBatchWorkerInput {
  /** The brand-neutral batch to fan out (units + inner executor argv). */
  batch: NestingBatchDescriptor;
  /** Codex model id for the outer `codex exec -m`. Empty → codex default. */
  teamlead_model?: string;
  /**
   * `model_reasoning_effort` value for the outer invocation
   * (medium | high | xhigh | low). When unset, codex picks its default.
   */
  teamlead_reasoning_effort?: string;
  /** Codex-only `service_tier` value for the outer invocation. */
  teamlead_service_tier?: string;
  /**
   * Project root for the outer codex's cwd. Defaults to `process.cwd()`.
   * Inner unit-executor invocations inherit the outer's cwd; pass an
   * explicit value to decouple from the TS process's cwd.
   */
  project_root?: string;
  /**
   * Codex binary path. Defaults to `"codex"` (resolved via PATH). Override
   * for tests (fake executable) or non-standard installations.
   */
  codex_bin?: string;
  /**
   * Per-invocation timeout for the outer codex (ms). The outer process is
   * killed if it exceeds this; every unit outcome is recorded as `fail`
   * with a timeout reason. Defaults to 600_000 (10 minutes).
   */
  timeout_ms?: number;
  /**
   * Path to tee outer codex stdout into as it streams. Enables a
   * `tail -f` watcher pane to render live progress. Absent → final
   * archival only.
   */
  stream_stdout_path?: string;
  /** Same as `stream_stdout_path` but for stderr. */
  stream_stderr_path?: string;
}

export interface CodexNestingBatchWorkerResult {
  /** Per-unit outcomes in the same order as `input.batch.units`. */
  outcomes: NestingBatchUnitOutcome[];
  /** Raw stdout from the outer codex (debugging / artifact capture). */
  outer_stdout: string;
  /** Raw stderr from the outer codex. */
  outer_stderr: string;
  /**
   * Outer codex exit code. `0` for clean completion; non-zero signals
   * outer worker failure (distinct from inner-unit failure).
   */
  outer_exit_code: number;
  /**
   * True when the outer codex emitted a parse-able UNIT_DISPATCH_SUMMARY.
   * When false, all unit outcomes are `fail` with a parse-failure reason.
   */
  summary_parsed: boolean;
}

// ---------------------------------------------------------------------------
// Outer spawn (codex realization)
// ---------------------------------------------------------------------------

interface SpawnOuterCodexResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
}

/**
 * Start the outer Codex worker with the batch prompt on stdin. Isolated
 * from `runCodexNestingBatchWorker` so tests can stub it.
 */
export async function spawnOuterCodex(
  prompt: string,
  options: {
    codex_bin: string;
    project_root: string;
    timeout_ms: number;
    /** `-m <model>` override. Absent → codex picks ~/.codex/config.toml default. */
    model?: string;
    /** `-c model_reasoning_effort=<value>` override. Absent → TOML default. */
    reasoning_effort?: string;
    /** `-c service_tier=<value>` override. Absent → TOML default. */
    service_tier?: string;
    /**
     * Optional path to tee outer codex stdout into as the worker emits
     * data. When set, each stdout chunk is appended to this file in real
     * time so a `tail -f` watcher pane can render progress as it happens.
     * The in-memory `stdout` string is still returned for final archival.
     */
    stream_stdout_path?: string;
    /** Same as `stream_stdout_path` but for stderr. */
    stream_stderr_path?: string;
  },
): Promise<SpawnOuterCodexResult> {
  // Outer Codex must respect `.onto/settings.json` model / effort settings —
  // otherwise it inherits `~/.codex/config.toml` defaults (often `xhigh`),
  // which can drastically inflate outer runtime and hit the orchestration
  // timeout before inner dispatch even begins.
  const args = [
    "exec",
    "--sandbox",
    "danger-full-access",
    "--skip-git-repo-check",
    "--ephemeral",
  ];
  if (options.reasoning_effort) {
    args.push("-c", `model_reasoning_effort="${options.reasoning_effort}"`);
  }
  if (options.service_tier) {
    args.push("-c", `service_tier="${options.service_tier}"`);
  }
  if (options.model) {
    args.push("-m", options.model);
  }
  args.push("-");
  const child = spawn(options.codex_bin, args, {
    cwd: options.project_root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Real-time tee to disk: chunks land on the on-disk log as codex emits
  // them, which is what lets `tail -f` in the watcher pane render progress
  // live. The in-memory buffers remain the source of truth for the final
  // archive / summary parse.
  const stdoutStream = options.stream_stdout_path
    ? fs.createWriteStream(options.stream_stdout_path, { flags: "w" })
    : null;
  const stderrStream = options.stream_stderr_path
    ? fs.createWriteStream(options.stream_stderr_path, { flags: "w" })
    : null;

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
    if (stdoutStream) stdoutStream.write(chunk);
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
    if (stderrStream) stderrStream.write(chunk);
  });
  child.stdin.write(prompt);
  child.stdin.end();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, options.timeout_ms);

  const exitCode = await awaitChildExit(child, {
    onSettled: () => clearTimeout(timer),
    mapError: (err) =>
      err.code === "ENOENT"
        ? new Error(
            `codex binary not found at "${options.codex_bin}". ` +
              "Install codex and run `codex login`, or set a non-default codex_bin.",
          )
        : err,
  });

  // Flush & close real-time tee streams before returning. Calling .end()
  // only requests flush — the actual on-disk write may still be pending in
  // the Node stream's internal buffer. Await the `finish` event so
  // downstream code that stats these files sees their final size, not a
  // partially flushed snapshot.
  await Promise.all([
    awaitStreamFinish(stdoutStream),
    awaitStreamFinish(stderrStream),
  ]);

  return { stdout, stderr, exit_code: exitCode, timed_out: timedOut };
}

function awaitStreamFinish(stream: fs.WriteStream | null): Promise<void> {
  if (!stream) return Promise.resolve();
  return new Promise<void>((resolve) => {
    // `finish` fires after the writable side drains AND after all bytes
    // are flushed to the underlying resource. `end()` without this await
    // returns before `fs.stat` would see the final size.
    stream.once("finish", () => resolve());
    stream.once("error", () => resolve()); // best-effort: don't block on write errors
    stream.end();
  });
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * Run the codex outer worker for the given nesting batch.
 *
 * Errors are classified, not thrown:
 *   - Outer codex spawn failure (ENOENT) → throws
 *   - Outer codex timeout             → all unit outcomes `fail` with timeout reason
 *   - Summary parse failure           → all unit outcomes `fail` with parse reason
 *   - Per-unit `fail` in summary      → that unit outcome `fail` with its reported reason
 *
 * When outer exit is non-zero but the summary parsed, the per-unit summary
 * is trusted — it is more granular than a blanket exit code.
 */
export async function runCodexNestingBatchWorker(
  input: CodexNestingBatchWorkerInput,
  spawnImpl: typeof spawnOuterCodex = spawnOuterCodex,
): Promise<CodexNestingBatchWorkerResult> {
  const prompt = buildNestingBatchWorkerPrompt(input.batch, {
    brand: "codex",
    teamlead_model: input.teamlead_model ?? "(codex default)",
    teamlead_effort: input.teamlead_reasoning_effort ?? "(codex default)",
    teamlead_service_tier: input.teamlead_service_tier ?? "(codex default)",
  });
  const spawned = await spawnImpl(prompt, {
    codex_bin: input.codex_bin ?? "codex",
    project_root: input.project_root ?? process.cwd(),
    timeout_ms: input.timeout_ms ?? 600_000,
    ...(input.teamlead_model ? { model: input.teamlead_model } : {}),
    ...(input.teamlead_reasoning_effort
      ? { reasoning_effort: input.teamlead_reasoning_effort }
      : {}),
    ...(input.teamlead_service_tier
      ? { service_tier: input.teamlead_service_tier }
      : {}),
    ...(input.stream_stdout_path
      ? { stream_stdout_path: input.stream_stdout_path }
      : {}),
    ...(input.stream_stderr_path
      ? { stream_stderr_path: input.stream_stderr_path }
      : {}),
  });

  if (spawned.timed_out) {
    return {
      outcomes: input.batch.units.map((unit) => ({
        unit_id: unit.unit_id,
        status: "fail" as const,
        error: `outer codex timed out after ${input.timeout_ms ?? 600_000} ms`,
      })),
      outer_stdout: spawned.stdout,
      outer_stderr: spawned.stderr,
      outer_exit_code: spawned.exit_code,
      summary_parsed: false,
    };
  }

  const summary = parseNestingBatchSummary(spawned.stdout);
  const outcomes = reconcileNestingBatchOutcomes(input.batch.units, summary);

  return {
    outcomes,
    outer_stdout: spawned.stdout,
    outer_stderr: spawned.stderr,
    outer_exit_code: spawned.exit_code,
    summary_parsed: summary !== null,
  };
}
