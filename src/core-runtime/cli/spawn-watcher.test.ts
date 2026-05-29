import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Module-level mock of node:child_process.spawnSync. Hoisted by vitest
// before the spawn-watcher import below, so spawn-watcher.ts picks up
// the mocked binding at module-load time. The dry-run test paths in
// other describe blocks never call spawnSync (they short-circuit on
// `dry_run: true`), so the mock is inert for them.
vi.mock("node:child_process", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

import { spawnSync } from "node:child_process";
import { spawnWatcherPane } from "./spawn-watcher.js";

const mockedSpawnSync = vi.mocked(spawnSync);

// ---------------------------------------------------------------------------
// Fixture: temp project dir with (or without) the watcher script present.
// ---------------------------------------------------------------------------

interface Fixture {
  projectRoot: string;
  sessionRoot: string;
  cleanup: () => void;
}

function mkProjectRoot(withWatcherScript: boolean): Fixture {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "onto-watcher-test-"),
  );
  const sessionRoot = path.join(
    projectRoot,
    ".onto",
    "review",
    "20260422-fixture",
  );
  fs.mkdirSync(sessionRoot, { recursive: true });
  if (withWatcherScript) {
    const scriptsDir = path.join(projectRoot, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "onto-review-watch.sh"),
      "#!/usr/bin/env bash\n# test fixture — no-op\n",
      { mode: 0o755 },
    );
  }
  return {
    projectRoot,
    sessionRoot,
    cleanup: () => fs.rmSync(projectRoot, { recursive: true, force: true }),
  };
}

function writeLauncherFixture(fixture: Fixture): string {
  const launcherPath = path.join(fixture.projectRoot, "codex-launcher.sh");
  fs.writeFileSync(
    launcherPath,
    "#!/usr/bin/env bash\n# test fixture — no-op\n",
    { mode: 0o755 },
  );
  return launcherPath;
}

// ---------------------------------------------------------------------------
// Platform stubbing — iTerm2 / Apple Terminal branches gate on
// `process.platform === "darwin"`. Tests must match so they exercise
// the same branches regardless of the host OS running vitest.
// ---------------------------------------------------------------------------

function stubDarwin(): () => void {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    value: "darwin",
    configurable: true,
  });
  return () => {
    if (original) {
      Object.defineProperty(process, "platform", original);
    }
  };
}

// ---------------------------------------------------------------------------
// Env stubbing — save + restore the env vars `spawnWatcherPane` inspects.
// ---------------------------------------------------------------------------

const WATCHED_ENV_KEYS = [
  "ONTO_RUNTIME_WATCHER_COMMAND",
  "ONTO_RUNTIME_WATCHER_CODEX_APP_LAUNCHER",
  "ONTO_WATCHER_DRY_RUN",
  "TMUX",
  "TMUX_PANE",
  "TERM_PROGRAM",
  "ITERM_SESSION_ID",
  "CODEX_SHELL",
  "CODEX_THREAD_ID",
  "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
  "WARP_IS_LOCAL_SHELL_SESSION",
  "WARP_BOOTSTRAPPED",
  "CURSOR_TRACE_ID",
  "CURSOR_AGENT",
  "CURSOR_SESSION_ID",
  "VSCODE_CWD",
  "VSCODE_IPC_HOOK_CLI",
  "VSCODE_GIT_ASKPASS_MAIN",
  "HOME",
  "XDG_DATA_HOME",
  "APPDATA",
] as const;

function saveEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of WATCHED_ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function clearWatchedEnv(): void {
  for (const key of WATCHED_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of WATCHED_ENV_KEYS) {
    const prev = snapshot[key];
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("spawnWatcherPane — prereq failure", () => {
  let fixture: Fixture;
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = saveEnv();
    clearWatchedEnv();
  });
  afterEach(() => {
    restoreEnv(envSnapshot);
    if (fixture) fixture.cleanup();
  });

  it("returns spawned=false when watcher script is missing", () => {
    fixture = mkProjectRoot(false);
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
    process.env.ONTO_WATCHER_DRY_RUN = "1";
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(false);
    expect(result.reason).toContain("watcher script not found");
  });

  it("returns spawned=false when no terminal multiplexer signal detected", () => {
    fixture = mkProjectRoot(true);
    // Every detection-priority env is unset — even dry-run cannot fake a
    // mechanism that has no signal to match.
    process.env.ONTO_WATCHER_DRY_RUN = "1";
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(false);
    expect(result.reason).toContain("no supported terminal attach target");
  });
});

describe("spawnWatcherPane — ontoHome fallback", () => {
  let projectFixture: Fixture;
  let ontoHomeFixture: Fixture;
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = saveEnv();
    clearWatchedEnv();
    process.env.ONTO_WATCHER_DRY_RUN = "1";
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
  });
  afterEach(() => {
    restoreEnv(envSnapshot);
    if (projectFixture) projectFixture.cleanup();
    if (ontoHomeFixture) ontoHomeFixture.cleanup();
  });

  it("finds watcher script in ontoHome when projectRoot has none", () => {
    // Isolated project roots can omit scripts/. ontoHome keeps the watcher
    // helper discoverable without copying helper scripts into every target root.
    projectFixture = mkProjectRoot(false); // no scripts/ in project
    ontoHomeFixture = mkProjectRoot(true); // scripts/ present here
    const result = spawnWatcherPane(
      projectFixture.projectRoot,
      projectFixture.sessionRoot,
      ontoHomeFixture.projectRoot,
    );
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("tmux");
  });

  it("prefers projectRoot over ontoHome when both have the script", () => {
    projectFixture = mkProjectRoot(true);
    ontoHomeFixture = mkProjectRoot(true);
    const result = spawnWatcherPane(
      projectFixture.projectRoot,
      projectFixture.sessionRoot,
      ontoHomeFixture.projectRoot,
    );
    expect(result.spawned).toBe(true);
  });

  it("still fails when neither projectRoot nor ontoHome has the script", () => {
    projectFixture = mkProjectRoot(false);
    ontoHomeFixture = mkProjectRoot(false);
    const result = spawnWatcherPane(
      projectFixture.projectRoot,
      projectFixture.sessionRoot,
      ontoHomeFixture.projectRoot,
    );
    expect(result.spawned).toBe(false);
    expect(result.reason).toContain("watcher script not found");
  });
});

describe("spawnWatcherPane — dry-run detection priority", () => {
  let fixture: Fixture;
  let envSnapshot: Record<string, string | undefined>;
  let restorePlatform: () => void;

  beforeEach(() => {
    envSnapshot = saveEnv();
    clearWatchedEnv();
    fixture = mkProjectRoot(true);
    process.env.ONTO_WATCHER_DRY_RUN = "1";
    // spawn-watcher's iTerm2 and Apple Terminal branches require
    // process.platform === "darwin". Stub so the tests exercise the
    // intended branches on any host OS.
    restorePlatform = stubDarwin();
  });
  afterEach(() => {
    restorePlatform();
    restoreEnv(envSnapshot);
    if (fixture) fixture.cleanup();
  });

  it("detects tmux when $TMUX is set (priority 1)", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("tmux");
    expect(result.dry_run).toBe(true);
  });

  it("detects iTerm2 when TERM_PROGRAM=iTerm.app AND ITERM_SESSION_ID is set (priority 2)", () => {
    process.env.TERM_PROGRAM = "iTerm.app";
    process.env.ITERM_SESSION_ID = "w0t0p0:ABCD1234-FAKE-UUID";
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("iterm2");
    expect(result.dry_run).toBe(true);
  });

  it("detects Apple Terminal when TERM_PROGRAM=Apple_Terminal (priority 3)", () => {
    process.env.TERM_PROGRAM = "Apple_Terminal";
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("apple_terminal");
    expect(result.dry_run).toBe(true);
  });

  it("does not detect Codex Desktop without a configured launcher", () => {
    process.env.CODEX_SHELL = "1";
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(false);
    expect(result.reason).toContain(
      "ONTO_RUNTIME_WATCHER_CODEX_APP_LAUNCHER not set",
    );
  });

  it("detects Codex Desktop when a launcher path is configured", () => {
    process.env.CODEX_SHELL = "1";
    process.env.ONTO_RUNTIME_WATCHER_CODEX_APP_LAUNCHER =
      writeLauncherFixture(fixture);
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("codex_app");
    expect(result.dry_run).toBe(true);
  });

  it("detects Warp when TERM_PROGRAM=WarpTerminal", () => {
    process.env.TERM_PROGRAM = "WarpTerminal";
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("warp");
    expect(result.dry_run).toBe(true);
  });

  it("detects Cursor integrated terminal from vscode env plus Cursor signal", () => {
    process.env.TERM_PROGRAM = "vscode";
    process.env.VSCODE_CWD = "/Applications/Cursor.app/Contents/Resources/app";
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("cursor");
    expect(result.dry_run).toBe(true);
  });

  it("prefers tmux over iTerm2 when both signals present (priority order)", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
    process.env.TERM_PROGRAM = "iTerm.app";
    process.env.ITERM_SESSION_ID = "w0t0p0:ABCD1234-FAKE-UUID";
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.mechanism).toBe("tmux");
  });

  it("iTerm2 without ITERM_SESSION_ID falls through (does NOT spawn)", () => {
    // Regression guard: spawning into the currently-focused iTerm2 tab
    // would land on the wrong tab. spawn-watcher.ts must refuse, not
    // fall back.
    process.env.TERM_PROGRAM = "iTerm.app";
    // ITERM_SESSION_ID intentionally unset.
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(false);
    expect(result.reason).toContain("no supported terminal attach target");
  });
});

describe("spawnWatcherPane — darwin platform gate", () => {
  let fixture: Fixture;
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = saveEnv();
    clearWatchedEnv();
    fixture = mkProjectRoot(true);
    process.env.ONTO_WATCHER_DRY_RUN = "1";
  });
  afterEach(() => {
    restoreEnv(envSnapshot);
    if (fixture) fixture.cleanup();
  });

  it("iTerm2 branch skips when process.platform !== darwin", () => {
    // On non-darwin platforms, the iTerm2 osascript path would fail;
    // spawn-watcher must gate on platform and fall through. Regression
    // guard: Apple Terminal / iTerm2 SHOULD NOT fire on Linux/Windows
    // even if (somehow) the env vars match.
    const restore = (() => {
      const original = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });
      return () => {
        if (original) Object.defineProperty(process, "platform", original);
      };
    })();
    try {
      process.env.TERM_PROGRAM = "iTerm.app";
      process.env.ITERM_SESSION_ID = "w0t0p0:fake";
      const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
      expect(result.spawned).toBe(false);
    } finally {
      restore();
    }
  });

  it("Apple Terminal branch skips when process.platform !== darwin", () => {
    const restore = (() => {
      const original = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });
      return () => {
        if (original) Object.defineProperty(process, "platform", original);
      };
    })();
    try {
      process.env.TERM_PROGRAM = "Apple_Terminal";
      const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
      expect(result.spawned).toBe(false);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// PR #185 follow-up #2 — real-attach paths via child_process.spawnSync mock.
//
// Why this exists:
//   The dry-run describe block above covers detection priority, but the
//   actual osascript / tmux split-window invocation paths (spawn-watcher.ts
//   L118-L122 tmux, L180-L185 iterm2, L206-L209 apple_terminal) are NEVER
//   exercised by dry-run (it returns early on `dry_run: true` before the
//   spawnSync call). Smoke scripts run with `ONTO_WATCHER_DRY_RUN=1` for
//   the same reason — they cannot regress-guard the real spawnSync
//   arguments. A change to `split-window` flags or the iTerm2 osascript
//   "matched" sentinel parsing would slip through both layers silently.
//
// What this block adds:
//   spawnSync is mocked at the module boundary (top of this file). Each
//   test sets ONTO_WATCHER_DRY_RUN unset (so the real-attach path runs)
//   and asserts on the args + return contract.
// ---------------------------------------------------------------------------

describe("spawnWatcherPane — real-attach (spawnSync mock)", () => {
  let fixture: Fixture;
  let envSnapshot: Record<string, string | undefined>;
  let restorePlatform: () => void;

  beforeEach(() => {
    envSnapshot = saveEnv();
    clearWatchedEnv();
    fixture = mkProjectRoot(true);
    // Real-attach path requires dry-run UNSET. Tests below add per-case env.
    restorePlatform = stubDarwin();
    mockedSpawnSync.mockReset();
  });
  afterEach(() => {
    restorePlatform();
    restoreEnv(envSnapshot);
    if (fixture) fixture.cleanup();
  });

  it("tmux real-attach passes split-window args + targets $TMUX_PANE + refocuses", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
    process.env.TMUX_PANE = "%5";
    // Two spawnSync calls expected: split-window then select-pane -l.
    mockedSpawnSync
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "", pid: 2, output: [], signal: null } as any);

    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);

    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("tmux");
    expect(result.dry_run).toBeUndefined();

    expect(mockedSpawnSync).toHaveBeenCalledTimes(2);
    const [tmuxBin, tmuxArgs] = mockedSpawnSync.mock.calls[0]!;
    expect(tmuxBin).toBe("tmux");
    // Args contract (regression guard for split-window flags + pane target):
    //   split-window -h -l 60 -t %5 <bash watcher cmd>
    expect(tmuxArgs).toEqual([
      "split-window",
      "-h",
      "-l",
      "60",
      "-t",
      "%5",
      expect.stringContaining("onto-review-watch.sh"),
    ]);
    // Refocus call comes second.
    const [refocusBin, refocusArgs] = mockedSpawnSync.mock.calls[1]!;
    expect(refocusBin).toBe("tmux");
    expect(refocusArgs).toEqual(["select-pane", "-l"]);
  });

  it("tmux without TMUX_PANE omits the -t flag", () => {
    // Regression guard: spawn-watcher pushes -t only when TMUX_PANE is set.
    // If someone always passes -t with empty value, tmux would error out.
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
    // TMUX_PANE intentionally unset.
    mockedSpawnSync
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "", pid: 2, output: [], signal: null } as any);

    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);

    const [, tmuxArgs] = mockedSpawnSync.mock.calls[0]!;
    expect(tmuxArgs).not.toContain("-t");
    expect(tmuxArgs).toEqual([
      "split-window",
      "-h",
      "-l",
      "60",
      expect.stringContaining("onto-review-watch.sh"),
    ]);
  });

  it("tmux split failing (status != 0) falls through, no spawned=true", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
    // Tmux split returns non-zero. Without other multiplexer signals,
    // the function must report spawned=false (NOT bubble the failed
    // split as a success).
    mockedSpawnSync
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockReturnValueOnce({ status: 1, stdout: "", stderr: "split failed", pid: 1, output: [], signal: null } as any);

    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(false);
    expect(result.reason).toContain("no supported terminal attach target");
    // Refocus must NOT run when split itself failed.
    expect(mockedSpawnSync).toHaveBeenCalledTimes(1);
  });

  it("Codex Desktop real-attach refuses UI keystrokes without a launcher", () => {
    process.env.CODEX_SHELL = "1";
    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);

    expect(result.spawned).toBe(false);
    expect(result.reason).toContain(
      "ONTO_RUNTIME_WATCHER_CODEX_APP_LAUNCHER not set",
    );
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it("Codex Desktop real-attach invokes the configured launcher path", () => {
    process.env.CODEX_SHELL = "1";
    const launcherPath = writeLauncherFixture(fixture);
    process.env.ONTO_RUNTIME_WATCHER_CODEX_APP_LAUNCHER = launcherPath;
    mockedSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: "",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("codex_app");

    const [bin, args] = mockedSpawnSync.mock.calls[0]!;
    expect(bin).toBe(launcherPath);
    expect(args).toEqual([
      expect.stringContaining("onto-review-watch.sh"),
      fixture.sessionRoot,
      fixture.projectRoot,
      expect.stringContaining("onto-review-watch.sh"),
    ]);
  });

  it("Warp real-attach writes a launch configuration and opens the launch URI", () => {
    const homeRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "onto-warp-home-"),
    );
    process.env.HOME = homeRoot;
    process.env.TERM_PROGRAM = "WarpTerminal";
    mockedSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: "",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    try {
      const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
      expect(result.spawned).toBe(true);
      expect(result.mechanism).toBe("warp");

      const configRoot = path.join(homeRoot, ".warp", "launch_configurations");
      const files = fs.readdirSync(configRoot);
      expect(files).toHaveLength(1);
      const configText = fs.readFileSync(path.join(configRoot, files[0]!), "utf8");
      expect(configText).toContain("commands:");
      expect(configText).toContain("onto-review-watch.sh");
      expect(configText).toContain(fixture.projectRoot);

      const [bin, args] = mockedSpawnSync.mock.calls[0]!;
      expect(bin).toBe("open");
      expect(String(args![0])).toContain("warp://launch/onto-runtime-");
    } finally {
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  });

  it("Cursor real-attach uses app keystrokes for a new integrated terminal", () => {
    process.env.TERM_PROGRAM = "vscode";
    process.env.VSCODE_CWD = "/Applications/Cursor.app/Contents/Resources/app";
    mockedSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: "matched",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("cursor");

    const [bin, args] = mockedSpawnSync.mock.calls[0]!;
    expect(bin).toBe("osascript");
    expect(args![0]).toBe("-e");
    const script = String(args![1]);
    expect(script).toContain('tell application "Cursor"');
    expect(script).toContain("key code 50 using {control down, shift down}");
    expect(script).toContain("onto-review-watch.sh");
  });

  it("iTerm2 real-attach passes osascript with embedded UUID + 'matched' sentinel grants success", () => {
    process.env.TERM_PROGRAM = "iTerm.app";
    process.env.ITERM_SESSION_ID = "w0t1p2:ABCD1234-FAKE-UUID";
    mockedSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: "matched",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("iterm2");

    expect(mockedSpawnSync).toHaveBeenCalledTimes(1);
    const [bin, args] = mockedSpawnSync.mock.calls[0]!;
    expect(bin).toBe("osascript");
    // -e flag + script string. The script must reference both the UUID
    // suffix and the full session id (spawn-watcher matches either form).
    expect(args![0]).toBe("-e");
    const script = String(args![1]);
    expect(script).toContain("ABCD1234-FAKE-UUID");
    expect(script).toContain("w0t1p2:ABCD1234-FAKE-UUID");
    expect(script).toContain("split vertically");
    expect(script).toContain("onto-review-watch.sh");
    expect(script).toContain('return "matched"');
  });

  it("iTerm2 osascript returning 'no-match' falls through, no spawned=true", () => {
    // Regression guard: spawn-watcher requires the explicit "matched"
    // sentinel. If the originating tab is closed (no-match), the osascript
    // returns "no-match" and we must NOT report spawned=true (which would
    // imply a pane is visible, when none was attached).
    process.env.TERM_PROGRAM = "iTerm.app";
    process.env.ITERM_SESSION_ID = "w0t1p2:ABCD1234-FAKE-UUID";
    mockedSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: "no-match",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(false);
    expect(result.reason).toContain("no supported terminal attach target");
  });

  it("Apple Terminal real-attach passes osascript with do-script", () => {
    process.env.TERM_PROGRAM = "Apple_Terminal";
    mockedSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: "",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = spawnWatcherPane(fixture.projectRoot, fixture.sessionRoot);
    expect(result.spawned).toBe(true);
    expect(result.mechanism).toBe("apple_terminal");

    const [bin, args] = mockedSpawnSync.mock.calls[0]!;
    expect(bin).toBe("osascript");
    expect(args![0]).toBe("-e");
    const script = String(args![1]);
    expect(script).toContain('tell application "Terminal"');
    expect(script).toContain("do script");
    expect(script).toContain("onto-review-watch.sh");
  });
});
