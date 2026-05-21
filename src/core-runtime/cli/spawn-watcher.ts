import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type WatcherMechanism = "tmux" | "iterm2" | "apple_terminal";

export interface SpawnWatcherResult {
  /**
   * `true` when the function confirmed that a watcher mechanism is
   * available for this session — either because it actually invoked
   * osascript/tmux to attach a pane (`dry_run` absent or false), or
   * because `ONTO_WATCHER_DRY_RUN=1` asked the function to detect the
   * mechanism without performing the attach (`dry_run === true`).
   *
   * The field does NOT by itself mean "a pane is visible to the
   * principal". Callers that need to know about a real visible attach
   * must check both `spawned === true` AND `dry_run !== true` (4th
   * self-review CC1/CC-rename guard).
   */
  spawned: boolean;
  mechanism?: WatcherMechanism;
  reason?: string;
  /**
   * True when the `spawned: true` result came from `ONTO_WATCHER_DRY_RUN=1`
   * detection-only mode — no actual osascript / tmux split was invoked.
   * Callers SHOULD distinguish this in user-facing logs so a reader can
   * tell "mechanism detected" from "pane actually attached" (4th
   * self-review Immediate Action #2 — field-level discrimination, with
   * review-invoke log verb ("detection via" vs "attached via") as the
   * corresponding user-visible signal).
   */
  dry_run?: boolean;
}

/**
 * Attempt to spawn the onto:review live watcher in a side pane / split / new tab
 * using the most appropriate terminal multiplexer detected from the environment.
 *
 * Detection priority (most universal first):
 *   1. tmux (any OS, via $TMUX env var) — splits the pane identified by
 *      `$TMUX_PANE` so the watcher stays beside the invoking pane even if
 *      the user has switched panes during startReviewSession.
 *   2. iTerm2 on macOS (via $TERM_PROGRAM === 'iTerm.app') — targets the
 *      session identified by `$ITERM_SESSION_ID`, which is inherited from
 *      the invoking session at process start, so splits land beside the
 *      pane that actually launched onto:review. If the env var is missing
 *      or no matching session is found, the spawn is refused (returns
 *      spawned: false) rather than falling back to the currently-focused
 *      tab — a default target would land the watcher on whichever tab happens to
 *      be frontmost at spawn time, which is the bug this path exists to
 *      avoid.
 *   3. Apple Terminal on macOS (via $TERM_PROGRAM === 'Apple_Terminal')
 *      — best effort; Terminal.app lacks a stable session identifier, so
 *      the spawn opens a new tab rather than a tab-targeted split.
 *
 * `sessionRoot` is required. It is passed through to the watcher script as
 * an explicit argument, which bypasses the `.onto/review/.latest-session`
 * pointer and therefore avoids the cross-session race that the global
 * pointer would otherwise create under concurrent review invocations.
 *
 * Returns silently with `spawned: false` if no supported mechanism is found.
 * The caller should print an explicit recovery hint in that case.
 *
 * This function never throws — it returns a result object instead, so the
 * runtime continues even if the spawn fails.
 */
export function spawnWatcherPane(
  projectRoot: string,
  sessionRoot: string,
  ontoHome?: string,
): SpawnWatcherResult {
  // Resolution order for the watcher helper:
  //   1. <projectRoot>/scripts/onto-review-watch.sh — co-located with the
  //      review target (onto repo invocations, full-repo projects).
  //   2. <ontoHome>/scripts/onto-review-watch.sh   — install-local script when
  //      projectRoot is an isolated workspace (e.g. scripts/review-pr.sh's
  //      tmp dir that only carries .onto/settings.json + target) and the
  //      watcher helper lives in the repo home.
  // Without the install-local script branch, any invocation with --project-root pointed at a
  // non-repo location silently degrades to "watcher script not found"
  // (observed 2026-04-22 self-review finding). The two-slot search keeps
  // deterministic wrappers viable without forcing them to symlink or copy.
  const candidates = [
    path.join(projectRoot, "scripts", "onto-review-watch.sh"),
  ];
  if (ontoHome && ontoHome !== projectRoot) {
    candidates.push(path.join(ontoHome, "scripts", "onto-review-watch.sh"));
  }
  const watcherScript = candidates.find((c) => fs.existsSync(c));

  if (!watcherScript) {
    return { spawned: false, reason: "watcher script not found" };
  }

  const watcherArgs = `bash "${watcherScript}" "${sessionRoot}"`;

  // Dry-run mode: detect the mechanism that would be used and report it,
  // but skip the actual tmux/osascript spawn call. Intended for smoke
  // tests and CI that want to cover the detection-priority regressions
  // without producing a visible side pane or extra terminal tab on every
  // run. Enabled via `ONTO_WATCHER_DRY_RUN=1`.
  const dryRun = process.env.ONTO_WATCHER_DRY_RUN === "1";

  // Priority 1: tmux (works on any OS, most universal)
  if (process.env.TMUX) {
    if (dryRun) {
      return { spawned: true, mechanism: "tmux", dry_run: true };
    }
    try {
      // Target the originating pane explicitly via $TMUX_PANE so the split
      // does not land on whichever pane happens to be active at spawn time.
      const tmuxArgs = ["split-window", "-h", "-l", "60"];
      const originPane = process.env.TMUX_PANE;
      if (originPane) {
        tmuxArgs.push("-t", originPane);
      }
      tmuxArgs.push(watcherArgs);
      const result = spawnSync("tmux", tmuxArgs, { stdio: "ignore" });
      if (result.status === 0) {
        // Refocus original pane so user keeps typing in Claude Code / shell
        spawnSync("tmux", ["select-pane", "-l"], { stdio: "ignore" });
        return { spawned: true, mechanism: "tmux" };
      }
    } catch {
      // fall through
    }
  }

  // Priority 2: iTerm2 on macOS
  // Target the originating session via $ITERM_SESSION_ID (inherited at
  // process start), so the split lands beside the pane that launched
  // onto:review even if the user has since switched tabs or windows.
  //
  // Format note: $ITERM_SESSION_ID is `wXtYpZ:UUID` but AppleScript's
  // `id of session` returns the UUID only. We compare both forms to stay
  // robust across iTerm2 builds, and require the script to print an
  // explicit "matched" sentinel before reporting success. If no match
  // (e.g. the originating tab has been closed, or the env var is absent),
  // we return spawned: false and let the caller print the manual hint —
  // splitting into `current session of current tab` would land on whatever
  // tab happens to be focused at spawn time, which is not the intended UX.
  if (
    process.platform === "darwin" &&
    process.env.TERM_PROGRAM === "iTerm.app"
  ) {
    const rawSessionId = process.env.ITERM_SESSION_ID;
    if (rawSessionId) {
      if (dryRun) {
        return { spawned: true, mechanism: "iterm2", dry_run: true };
      }
      try {
        const sessionUuid = rawSessionId.includes(":")
          ? (rawSessionId.split(":").pop() ?? rawSessionId)
          : rawSessionId;
        const escapedCmd = watcherArgs
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"');
        const escapedFull = rawSessionId
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"');
        const escapedUuid = sessionUuid
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"');
        const script =
          `tell application "iTerm2"\n` +
          `  repeat with w in windows\n` +
          `    repeat with t in tabs of w\n` +
          `      repeat with s in sessions of t\n` +
          `        if (id of s is "${escapedUuid}") or (id of s is "${escapedFull}") then\n` +
          `          tell s\n` +
          `            split vertically with default profile command "${escapedCmd}"\n` +
          `          end tell\n` +
          `          return "matched"\n` +
          `        end if\n` +
          `      end repeat\n` +
          `    end repeat\n` +
          `  end repeat\n` +
          `  return "no-match"\n` +
          `end tell`;
        const result = spawnSync("osascript", ["-e", script], {
          encoding: "utf8",
        });
        if (result.status === 0 && result.stdout.trim() === "matched") {
          return { spawned: true, mechanism: "iterm2" };
        }
      } catch {
        // fall through
      }
    }
  }

  // Priority 3: Apple Terminal on macOS
  if (
    process.platform === "darwin" &&
    process.env.TERM_PROGRAM === "Apple_Terminal"
  ) {
    if (dryRun) {
      return { spawned: true, mechanism: "apple_terminal", dry_run: true };
    }
    try {
      const escapedCmd = watcherArgs.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const script =
        `tell application "Terminal"\n` +
        `  do script "${escapedCmd}"\n` +
        `end tell`;
      const result = spawnSync("osascript", ["-e", script], { stdio: "ignore" });
      if (result.status === 0) {
        return { spawned: true, mechanism: "apple_terminal" };
      }
    } catch {
      // fall through
    }
  }

  return {
    spawned: false,
    reason: "no supported terminal multiplexer detected (tmux, iTerm2, Apple Terminal)",
  };
}
