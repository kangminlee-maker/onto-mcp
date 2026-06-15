/**
 * Claude Nesting Batch Worker — claude realization of the
 * NestingBatchWorker contract (`review/nesting-batch.ts`).
 *
 * # What this module is
 *
 * Runs the `nested-workers` claude outer seat: a single outer `claude -p`
 * worker is started by onto TS main (A) or a host driver (B), receives the
 * literal nesting batch script, and fans the batch out as parallel
 * **unit-executor subprocesses** via its Bash tool. The outer's single role
 * is to pipe the script to `bash -s` — it performs no reasoning or
 * substitution. Symmetric to `codex-nesting-batch-worker.ts`.
 *
 * # Claude CLI specifics (empirically established in Phase 1)
 *
 *   - The prompt MUST be the positional arg (`claude -p "<prompt>"`) —
 *     piped stdin is not treated as the prompt (the worker would exit
 *     doing nothing).
 *   - Bash-capable boundary = `--allowedTools Bash` +
 *     `--permission-mode bypassPermissions` (allowlist, not denylist) +
 *     `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` so no MCP
 *     servers load in the bounded outer.
 *   - effort maps to `--effort`; `service_tier` is API-only and NOT
 *     supported on `claude -p`/OAuth — deliberately absent here.
 *   - `ONTO_CLAUDE_BIN` overrides the binary (matches the unit executor).
 *
 * # How it relates
 *
 * - Script/prompt/summary semantics: `review/nesting-batch.ts` (shared).
 * - Inner invocations are unit-executor subprocesses (structured output /
 *   validation / retry equal to the flat path by code sharing).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import {
  buildNestingBatchWorkerPrompt,
  parseNestingBatchSummary,
  reconcileNestingBatchOutcomes,
  type NestingBatchDescriptor,
  type NestingBatchUnitOutcome,
} from "../review/nesting-batch.js";
import { resolveClaudeBin } from "../llm/claude-bin.js";

const CLAUDE_BIN = resolveClaudeBin();

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClaudeNestingBatchWorkerInput {
  /** The brand-neutral batch to fan out (units + inner executor argv). */
  batch: NestingBatchDescriptor;
  /** Claude model for the outer `--model`. Empty → claude default. */
  teamlead_model?: string;
  /** Reasoning effort for the outer `--effort`. Empty → claude default. */
  teamlead_reasoning_effort?: string;
  /**
   * Project root for the outer claude's cwd (+ `--add-dir`). Defaults to
   * `process.cwd()`. Inner unit-executor invocations inherit the outer's
   * cwd.
   */
  project_root?: string;
  /**
   * Claude binary path. Defaults to `ONTO_CLAUDE_BIN` env or `"claude"`
   * (PATH-resolved). Override for tests (fake executable).
   */
  claude_bin?: string;
  /**
   * Per-invocation timeout for the outer claude (ms). The outer process is
   * killed if it exceeds this; every unit outcome is recorded as `fail`
   * with a timeout reason. Defaults to 600_000 (10 minutes).
   */
  timeout_ms?: number;
  /**
   * Path to tee outer claude stdout into as it streams (watcher
   * `tail -f`). Absent → final archival only.
   */
  stream_stdout_path?: string;
  /** Same as `stream_stdout_path` but for stderr. */
  stream_stderr_path?: string;
}

export interface ClaudeNestingBatchWorkerResult {
  /** Per-unit outcomes in the same order as `input.batch.units`. */
  outcomes: NestingBatchUnitOutcome[];
  /** Raw stdout from the outer claude (debugging / artifact capture). */
  outer_stdout: string;
  /** Raw stderr from the outer claude. */
  outer_stderr: string;
  /**
   * Outer claude exit code. `0` for clean completion; non-zero signals
   * outer worker failure (distinct from inner-unit failure).
   */
  outer_exit_code: number;
  /**
   * True when the outer claude surfaced a parse-able UNIT_DISPATCH_SUMMARY.
   * When false, all unit outcomes are `fail` with a parse-failure reason.
   */
  summary_parsed: boolean;
}

// ---------------------------------------------------------------------------
// Outer spawn (claude realization)
// ---------------------------------------------------------------------------

interface SpawnOuterClaudeResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
}

/**
 * Start the outer Claude worker with the batch prompt as the positional
 * arg. Isolated from `runClaudeNestingBatchWorker` so tests can stub it.
 */
export async function spawnOuterClaude(
  prompt: string,
  options: {
    claude_bin: string;
    project_root: string;
    timeout_ms: number;
    /** `--model <m>` override. Absent → claude default. */
    model?: string;
    /** `--effort <e>` override. Absent → claude default. */
    reasoning_effort?: string;
    /** Real-time stdout tee path (watcher `tail -f`). */
    stream_stdout_path?: string;
    /** Same as `stream_stdout_path` but for stderr. */
    stream_stderr_path?: string;
  },
): Promise<SpawnOuterClaudeResult> {
  // Prompt is positional (stdin is ignored by `claude -p`). The outer needs
  // exactly one tool — Bash — to pipe the literal script to `bash -s`;
  // bypassPermissions + allowlist keeps that non-interactive, and the
  // strict empty MCP config keeps host MCP servers out of the bounded
  // worker. Keep the variadic --allowedTools last so its tool list does
  // not swallow a following flag.
  const args = [
    "-p",
    prompt,
    "--add-dir",
    options.project_root,
    "--permission-mode",
    "bypassPermissions",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
  ];
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.reasoning_effort) {
    args.push("--effort", options.reasoning_effort);
  }
  args.push("--allowedTools", "Bash");
  const child = spawn(options.claude_bin, args, {
    cwd: options.project_root,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Real-time tee to disk (same contract as the codex outer): chunks land
  // on the on-disk log as claude emits them so a watcher pane can render
  // progress live; in-memory buffers stay the parse/archive authority.
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

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, options.timeout_ms);

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `Claude Code CLI not found (${options.claude_bin}). ` +
              "Install/login claude or set ONTO_CLAUDE_BIN.",
          ),
        );
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });

  // Flush & close tee streams before returning so downstream stats see
  // final sizes (same finalization barrier as the codex outer).
  await Promise.all([
    awaitStreamFinish(stdoutStream),
    awaitStreamFinish(stderrStream),
  ]);

  return { stdout, stderr, exit_code: exitCode, timed_out: timedOut };
}

function awaitStreamFinish(stream: fs.WriteStream | null): Promise<void> {
  if (!stream) return Promise.resolve();
  return new Promise<void>((resolve) => {
    stream.once("finish", () => resolve());
    stream.once("error", () => resolve()); // best-effort: don't block on write errors
    stream.end();
  });
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * Run the claude outer worker for the given nesting batch.
 *
 * Errors are classified, not thrown:
 *   - Outer claude spawn failure (ENOENT) → throws
 *   - Outer claude timeout            → all unit outcomes `fail` with timeout reason
 *   - Summary parse failure           → all unit outcomes `fail` with parse reason
 *   - Per-unit `fail` in summary      → that unit outcome `fail` with its reported reason
 *
 * When outer exit is non-zero but the summary parsed, the per-unit summary
 * is trusted — it is more granular than a blanket exit code.
 */
export async function runClaudeNestingBatchWorker(
  input: ClaudeNestingBatchWorkerInput,
  spawnImpl: typeof spawnOuterClaude = spawnOuterClaude,
): Promise<ClaudeNestingBatchWorkerResult> {
  const prompt = buildNestingBatchWorkerPrompt(input.batch, {
    brand: "claude",
    teamlead_model: input.teamlead_model ?? "(claude default)",
    teamlead_effort: input.teamlead_reasoning_effort ?? "(claude default)",
  });
  const spawned = await spawnImpl(prompt, {
    claude_bin: input.claude_bin ?? CLAUDE_BIN,
    project_root: input.project_root ?? process.cwd(),
    timeout_ms: input.timeout_ms ?? 600_000,
    ...(input.teamlead_model ? { model: input.teamlead_model } : {}),
    ...(input.teamlead_reasoning_effort
      ? { reasoning_effort: input.teamlead_reasoning_effort }
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
        error: `outer claude timed out after ${input.timeout_ms ?? 600_000} ms`,
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
