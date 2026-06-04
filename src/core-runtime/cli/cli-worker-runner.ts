/**
 * Shared subprocess CLI worker runner (codex / claude).
 *
 * Owns the provider-agnostic lifecycle of running ONE bounded review unit:
 * spawn, stdin, running-log tee, observability wiring, exit handling, output
 * extraction, canonical output-file write, and running-log cleanup. The
 * provider-specific parts — binary, argv, output authority, error hints — come
 * from a {@link CliWorkerAdapter}.
 *
 * Scope: subprocess CLI workers ONLY (codex, claude). The in-process direct
 * HTTP path (ts_inline_http) and the deterministic mock executor are not
 * routed through this runner.
 *
 * Running-log lifecycle (cleanup deferred until AFTER output is validated):
 * the running log is PRESERVED (renamed to `.{unit}.nested-stderr.log`) on ANY
 * failure — a non-zero exit OR a zero exit that yields no usable output (e.g.
 * claude exits 0 but emits an error/unparseable result) — and is removed only
 * on genuine success. This differs from the pre-refactor codex path, which
 * removed the running log on exit 0 *before* validating output, losing the
 * trace when the output turned out to be empty.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  appendRuntimeStreamChunkSync,
  appendRuntimeStreamEventSync,
} from "../observability/runtime-stream-observation.js";

export interface WorkerRunContext {
  projectRoot: string;
  sessionRoot: string;
  unitId: string;
  unitKind: string;
  outputPath: string;
  boundedPrompt: string;
}

export interface WorkerRunState {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CliWorkerAdapter {
  /** Stable provider label for logs / running-source (e.g. "codex", "claude"). */
  readonly label: string;
  /** Binary to spawn (resolved via PATH; interactive-shell aliases are bypassed). */
  readonly binary: string;
  /** Message thrown when the binary is missing (ENOENT). */
  readonly notFoundMessage: string;
  /** Build the argv for the binary given the run context. */
  buildArgv(ctx: WorkerRunContext): string[];
  /**
   * Extract the final output text from the completed run, or throw. The adapter
   * owns provider-specific output authority:
   *   - codex: the `-o` file is authoritative when present + non-empty, else
   *     fall back to captured stdout.
   *   - claude: stdout JSON `result` element is authoritative.
   * Returning empty/whitespace is treated as failure by the runner.
   */
  extractOutput(ctx: WorkerRunContext, state: WorkerRunState): Promise<string>;
  /** Optionally augment a non-zero-exit error message with a provider hint. */
  classifyExitError?(ctx: WorkerRunContext, state: WorkerRunState): string | undefined;
}

export async function runCliWorkerUnit(
  adapter: CliWorkerAdapter,
  ctx: WorkerRunContext,
): Promise<void> {
  const argv = adapter.buildArgv(ctx);
  const child = spawn(adapter.binary, argv, {
    cwd: ctx.projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  // A worker that exits before draining stdin would otherwise surface an
  // unhandled EPIPE 'error' event on the write side; swallow it.
  child.stdin.on("error", () => {});

  const runtimeSourceBase = {
    kind: "process" as const,
    label: `${adapter.label}:${ctx.unitId}`,
    unitId: ctx.unitId,
    stageId: ctx.unitKind,
  };
  const runtimeSource = child.pid !== undefined
    ? { ...runtimeSourceBase, processId: child.pid }
    : runtimeSourceBase;
  appendRuntimeStreamEventSync({
    pipeline: "review",
    sessionRoot: ctx.sessionRoot,
    source: runtimeSource,
    stream: "status",
    message: `${adapter.label} worker started: ${ctx.unitKind} ${ctx.unitId}`,
  });

  // Real-time tee to disk so a watcher pane can `tail -f` the worker live.
  const outputDir = path.dirname(ctx.outputPath);
  const runningLogPath = path.join(outputDir, `.${ctx.unitId}.running.log`);
  const nestedErrPath = path.join(outputDir, `.${ctx.unitId}.nested-stderr.log`);
  let runningLogStream: fsSync.WriteStream | null = null;
  try {
    fsSync.mkdirSync(outputDir, { recursive: true });
    runningLogStream = fsSync.createWriteStream(runningLogPath, { flags: "w" });
    runningLogStream.write(`ENV-BEFORE unit=${ctx.unitId} output=${ctx.outputPath}\n`);
  } catch {
    // Best-effort; streaming failure must not block the actual worker run.
    runningLogStream = null;
  }

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
    if (runningLogStream) runningLogStream.write(chunk);
    appendRuntimeStreamChunkSync(
      { pipeline: "review", sessionRoot: ctx.sessionRoot, source: runtimeSource, stream: "stdout" },
      chunk,
    );
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
    if (runningLogStream) runningLogStream.write(chunk);
    appendRuntimeStreamChunkSync(
      { pipeline: "review", sessionRoot: ctx.sessionRoot, source: runtimeSource, stream: "stderr" },
      chunk,
    );
  });

  child.stdin.write(ctx.boundedPrompt);
  child.stdin.end();

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") reject(new Error(adapter.notFoundMessage));
      else reject(err);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
  appendRuntimeStreamEventSync({
    pipeline: "review",
    sessionRoot: ctx.sessionRoot,
    source: runtimeSource,
    stream: "status",
    message: `${adapter.label} worker exited: ${ctx.unitKind} ${ctx.unitId} code=${exitCode}`,
  });

  // Flush the running log before deciding cleanup so tail -f readers see final
  // bytes; ENV-AFTER mirrors the codex-nested running-log parse format.
  if (runningLogStream) {
    try { runningLogStream.write(`ENV-AFTER unit=${ctx.unitId} exit=${exitCode}\n`); } catch { /* ignore */ }
    try { runningLogStream.end(); } catch { /* ignore */ }
  }

  const preserveRunningLog = (): void => {
    try { fsSync.renameSync(runningLogPath, nestedErrPath); } catch { /* running log may not exist */ }
  };
  const removeRunningLog = (): void => {
    try { fsSync.rmSync(runningLogPath, { force: true }); } catch { /* ignore */ }
  };

  const state: WorkerRunState = { stdout, stderr, exitCode };

  if (exitCode !== 0) {
    preserveRunningLog();
    const hint = adapter.classifyExitError?.(ctx, state);
    const combined = [hint, stderr.trim(), stdout.trim()]
      .filter((m): m is string => typeof m === "string" && m.length > 0)
      .join("\n");
    throw new Error(
      combined.length > 0 ? combined : `${adapter.label} worker exited with code ${exitCode}`,
    );
  }

  // exit 0 — extract output, then clean up. A post-parse failure (no usable
  // output despite a zero exit) preserves the running log like any failure.
  let outputText: string;
  try {
    outputText = (await adapter.extractOutput(ctx, state)).trim();
  } catch (err) {
    preserveRunningLog();
    throw err;
  }
  if (outputText.length === 0) {
    preserveRunningLog();
    throw new Error(`${adapter.label} worker produced no usable output.`);
  }

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(ctx.outputPath, `${outputText}\n`, "utf8");

  // Genuine success — remove the running log so round1/ lists only principal
  // lens outputs. The watcher saw it live; the result is at outputPath.
  removeRunningLog();
}
