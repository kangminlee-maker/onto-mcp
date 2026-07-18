/**
 * Child-process exit wait — the wedge-proof replacement for waiting on the
 * `close` event alone.
 *
 * Every worker/executor spawn in this runtime used to await `close`, which
 * fires only when the child's stdio streams END. A CLI child (codex/claude)
 * that spawns helpers sharing its stdio can die — crash, or our own timeout
 * SIGKILL — while an orphaned grandchild keeps the pipe open: `exit` fires,
 * `close` never does, and the await hangs past every timeout (observed
 * 2026-07-17: codex dead-child-open-stream, ~1.5h of silence that the 600s
 * unit timeout "fired" on without unsticking anything).
 *
 * `awaitChildExit` therefore resolves on whichever comes first:
 *   - `close`  — the normal path: process gone AND stdio drained; or
 *   - `exit` + a short grace window — the process is gone; wait briefly for
 *     buffered output to flush, then stop waiting for streams that orphans
 *     may hold open forever.
 * `error` rejects (optionally through a site-specific message mapper), and
 * `onSettled` runs exactly once before the promise settles either way — the
 * seat for clearing the call site's surrounding kill/timeout timers.
 */

import type { ChildProcess } from "node:child_process";

/** How long after `exit` to keep waiting for `close` (stream flush) before
 * resolving anyway. Long enough for pipe buffers, far below any unit budget. */
export const STREAM_CLOSE_GRACE_MS = 2_000;

export function awaitChildExit(
  child: ChildProcess,
  options: {
    /** Map a spawn error (e.g. ENOENT) to a site-specific Error. */
    mapError?: (err: NodeJS.ErrnoException) => Error;
    /** Runs exactly once, before resolve/reject — clear site timers here. */
    onSettled?: () => void;
    streamCloseGraceMs?: number;
  } = {},
): Promise<number> {
  const graceMs = options.streamCloseGraceMs ?? STREAM_CLOSE_GRACE_MS;
  return new Promise<number>((resolve, reject) => {
    let settled = false;
    let graceTimer: NodeJS.Timeout | null = null;
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      if (graceTimer) clearTimeout(graceTimer);
      options.onSettled?.();
      finish();
    };
    child.on("error", (err: NodeJS.ErrnoException) => {
      settle(() => reject(options.mapError ? options.mapError(err) : err));
    });
    child.on("exit", (code) => {
      // Process is gone; give stdio a bounded window to flush, then resolve
      // even if an orphaned grandchild holds the pipes open.
      graceTimer = setTimeout(() => settle(() => resolve(code ?? 1)), graceMs);
    });
    child.on("close", (code) => {
      settle(() => resolve(code ?? 1));
    });
  });
}
