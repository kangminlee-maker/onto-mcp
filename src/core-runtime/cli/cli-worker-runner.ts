/**
 * Shared subprocess CLI worker runner (codex / claude).
 *
 * Owns the provider-agnostic lifecycle of running ONE bounded review unit:
 * spawn, stdin, running-log tee, observability wiring, exit handling (with a
 * hang-backstop timeout and an AbortSignal cancellation seam), output
 * extraction, canonical output-file write, and running-log cleanup. The
 * provider-specific parts — binary, argv, output authority, error hints — come
 * from a {@link CliWorkerAdapter}.
 *
 * Scope: subprocess CLI workers ONLY (codex, claude). The in-process direct
 * HTTP path (ts_inline_http) and the deterministic mock executor are not
 * routed through this runner.
 *
 * Running-log lifecycle — EVERY terminal path is resolved through one
 * chokepoint: the running log is PRESERVED (renamed to
 * `.{unit}.nested-stderr.log`) on ANY failure — spawn error, timeout,
 * cancellation, non-zero/signal exit, or a zero exit that yields no usable
 * output — and is REMOVED only on genuine success. On failure a status event
 * surfaces where the trace was preserved (or that none could be captured).
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import {
  appendRuntimeStreamChunkSync,
  appendRuntimeStreamEventSync,
} from "../observability/runtime-stream-observation.js";
import {
  stripWrappingCodeFence,
  stripLeadingNarrationBeforeYaml,
} from "./strip-wrapping-code-fence.js";

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
  /** Process exit code, or -1 when the worker was terminated by a signal. */
  exitCode: number;
}

export interface WorkerRunOptions {
  /**
   * Cancellation seam: aborting kills the worker subprocess and fails the unit.
   * Lets an upstream halt reach a running worker.
   */
  signal?: AbortSignal;
  /**
   * Hang backstop in ms. Workers (agentic codex/claude CLIs) legitimately run
   * for minutes, so this is generous, not a tight bound. Defaults to
   * ONTO_WORKER_TIMEOUT_MS or 900_000; 0 disables it.
   */
  timeoutMs?: number;
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

interface ChildExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

function resolveWorkerTimeoutMs(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return override;
  }
  const raw = process.env.ONTO_WORKER_TIMEOUT_MS;
  if (raw !== undefined && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 900_000;
}

/**
 * Await child termination, but also fail-fast on a hang (timeout) or an
 * external abort, killing the subprocess in both cases. The close callback's
 * signal is preserved (not coerced into exit code 1) so a SIGTERM/OOM kill
 * stays distinguishable from an ordinary code-1 failure.
 */
function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  adapter: CliWorkerAdapter,
  options: WorkerRunOptions,
): Promise<ChildExit> {
  return new Promise<ChildExit>((resolve, reject) => {
    let settled = false;
    const timeoutMs = resolveWorkerTimeoutMs(options.timeoutMs);
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill("SIGTERM");
            detach();
            reject(new Error(`${adapter.label} worker timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      detach();
      reject(new Error(`${adapter.label} worker was cancelled.`));
    };
    const detach = (): void => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      detach();
      reject(err.code === "ENOENT" ? new Error(adapter.notFoundMessage) : err);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      detach();
      resolve({ code, signal });
    });
  });
}

export async function runCliWorkerUnit(
  adapter: CliWorkerAdapter,
  ctx: WorkerRunContext,
  options: WorkerRunOptions = {},
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
  const emitStatus = (message: string): void => {
    appendRuntimeStreamEventSync({
      pipeline: "review",
      sessionRoot: ctx.sessionRoot,
      source: runtimeSource,
      stream: "status",
      message,
    });
  };
  emitStatus(`${adapter.label} worker started: ${ctx.unitKind} ${ctx.unitId}`);

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

  // Decode stdout/stderr with a StringDecoder so a UTF-8 multibyte sequence
  // (Korean / emoji, common in this codebase) split across chunk boundaries is
  // not corrupted in the captured strings.
  const stdoutDecoder = new StringDecoder("utf8");
  const stderrDecoder = new StringDecoder("utf8");
  let stdout = "";
  let stderr = "";
  let decodersFlushed = false;
  const flushDecoders = (): void => {
    if (decodersFlushed) return;
    decodersFlushed = true;
    stdout += stdoutDecoder.end();
    stderr += stderrDecoder.end();
  };

  child.stdout.on("data", (chunk: Buffer | string) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    stdout += stdoutDecoder.write(buf);
    if (runningLogStream) runningLogStream.write(buf);
    appendRuntimeStreamChunkSync(
      { pipeline: "review", sessionRoot: ctx.sessionRoot, source: runtimeSource, stream: "stdout" },
      buf,
    );
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    stderr += stderrDecoder.write(buf);
    if (runningLogStream) runningLogStream.write(buf);
    appendRuntimeStreamChunkSync(
      { pipeline: "review", sessionRoot: ctx.sessionRoot, source: runtimeSource, stream: "stderr" },
      buf,
    );
  });

  let runningLogClosed = false;
  const finishRunningLog = (note: string): void => {
    if (runningLogClosed || !runningLogStream) {
      runningLogClosed = true;
      return;
    }
    runningLogClosed = true;
    try { runningLogStream.write(`ENV-AFTER unit=${ctx.unitId} ${note}\n`); } catch { /* ignore */ }
    try { runningLogStream.end(); } catch { /* ignore */ }
  };
  const preserveRunningLog = (): void => {
    try { fsSync.renameSync(runningLogPath, nestedErrPath); } catch { /* running log may not exist */ }
  };
  const removeRunningLog = (): void => {
    try { fsSync.rmSync(runningLogPath, { force: true }); } catch { /* ignore */ }
  };

  child.stdin.write(ctx.boundedPrompt);
  child.stdin.end();

  let succeeded = false;
  try {
    const exit = await waitForChildExit(child, adapter, options);
    flushDecoders();
    finishRunningLog(
      `exit=${exit.code ?? "null"}${exit.signal ? ` signal=${exit.signal}` : ""}`,
    );
    emitStatus(
      `${adapter.label} worker exited: ${ctx.unitKind} ${ctx.unitId} code=${exit.code ?? "null"}${exit.signal ? ` signal=${exit.signal}` : ""}`,
    );

    const state: WorkerRunState = {
      stdout,
      stderr,
      exitCode: exit.code ?? -1,
    };

    if (exit.code !== 0) {
      const hint = adapter.classifyExitError?.(ctx, state);
      const termInfo = exit.signal
        ? ` (terminated by signal ${exit.signal})`
        : exit.code === null
          ? " (terminated without an exit code)"
          : "";
      const combined = [hint, stderr.trim(), stdout.trim()]
        .filter((m): m is string => typeof m === "string" && m.length > 0)
        .join("\n");
      throw new Error(
        combined.length > 0
          ? `${combined}${termInfo}`
          : `${adapter.label} worker exited with code ${exit.code ?? "null"}${termInfo}`,
      );
    }

    // exit 0 — extract, normalize, and persist; any failure here is a real
    // failure that flows to the catch (preserve) below.
    let outputText = (await adapter.extractOutput(ctx, state)).trim();
    // Normalize common model output-wrapping before persisting so every
    // downstream reader sees a clean artifact. Fence-stripping is safe for any
    // unit; the YAML narration strip is gated to YAML-output (issue_artifact)
    // units, whose strict parse breaks on a conversational preamble.
    outputText = stripWrappingCodeFence(outputText);
    if (ctx.unitKind === "issue_artifact") {
      outputText = stripLeadingNarrationBeforeYaml(outputText);
    }
    if (outputText.length === 0) {
      throw new Error(`${adapter.label} worker produced no usable output.`);
    }

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(ctx.outputPath, `${outputText}\n`, "utf8");
    succeeded = true;
  } catch (err) {
    // Single failure chokepoint for every terminal path (spawn error, timeout,
    // cancellation, bad exit, no usable output, output-write failure).
    flushDecoders();
    finishRunningLog("failed");
    preserveRunningLog();
    emitStatus(
      `${adapter.label} worker failed: ${ctx.unitKind} ${ctx.unitId} — ${
        runningLogStream
          ? `failure trace preserved at ${nestedErrPath}`
          : "no failure trace captured (running-log unavailable)"
      }`,
    );
    throw err;
  } finally {
    if (succeeded) {
      // Genuine success — remove the running log so round1/ lists only
      // principal lens outputs. The watcher saw it live; the result is at
      // outputPath.
      removeRunningLog();
    }
  }
}
