import { describe, it, expect } from "vitest";
import {
  buildNestedTeamleadPrompt,
  parseNestedTeamleadSummary,
  runCodexNestedTeamlead,
  type CodexNestedTeamleadInput,
  type NestedLensDispatchInput,
} from "./codex-nested-teamlead-executor.js";

// ---------------------------------------------------------------------------
// These tests assert the codex-nested orchestrator invariants:
//
// (1) The prompt embeds every lens in the same order with packet/output
//     paths and the sandbox flag the outer codex needs.
// (2) The summary parser extracts the LENS_DISPATCH_SUMMARY line and
//     tolerates surrounding noise; malformed lines are ignored; last-one
//     wins when multiple are present.
// (3) `runCodexNestedTeamlead` reconciles inputs with reported outcomes:
//     missing lens_ids become `fail` (teamlead noncompliance), reported
//     failures carry the reported error, timeouts mark every lens failed.
// ---------------------------------------------------------------------------

const LENSES: NestedLensDispatchInput[] = [
  {
    lens_id: "logic",
    packet_path: "/tmp/session/round1/logic-packet.md",
    output_path: "/tmp/session/round1/logic.md",
  },
  {
    lens_id: "pragmatics",
    packet_path: "/tmp/session/round1/pragmatics-packet.md",
    output_path: "/tmp/session/round1/pragmatics.md",
  },
  {
    lens_id: "axiology",
    packet_path: "/tmp/session/round1/axiology-packet.md",
    output_path: "/tmp/session/round1/axiology.md",
  },
];

// ---------------------------------------------------------------------------
// buildNestedTeamleadPrompt
// ---------------------------------------------------------------------------

describe("buildNestedTeamleadPrompt", () => {
  it("embeds every lens's id, packet path, and output path", () => {
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES });
    for (const lens of LENSES) {
      expect(prompt).toContain(lens.lens_id);
      expect(prompt).toContain(lens.packet_path);
      expect(prompt).toContain(lens.output_path);
    }
  });

  it("includes sandbox danger-full-access and ephemeral flags for inner codex", () => {
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES });
    expect(prompt).toContain("--sandbox danger-full-access");
    expect(prompt).toContain("--ephemeral");
    expect(prompt).toContain("--skip-git-repo-check");
  });

  it("declares the LENS_DISPATCH_SUMMARY sentinel the parser looks for", () => {
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES });
    expect(prompt).toContain("LENS_DISPATCH_SUMMARY:");
  });

  it("passes through model + reasoning_effort when provided", () => {
    const prompt = buildNestedTeamleadPrompt({
      lenses: LENSES.slice(0, 1),
      model: "gpt-5.5",
      reasoning_effort: "medium",
      service_tier: "fast",
    });
    expect(prompt).toContain("-m gpt-5.5");
    expect(prompt).toContain("model_reasoning_effort=medium");
    expect(prompt).toContain("service_tier=fast");
  });

  it("omits the model/effort/service tier flags when unset (codex uses its defaults)", () => {
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES.slice(0, 1) });
    expect(prompt).not.toContain(" -m ");
    expect(prompt).not.toContain("model_reasoning_effort=");
    expect(prompt).not.toContain(" -c service_tier=");
  });

  it("states the number of lenses explicitly (sanity check for the outer codex)", () => {
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES });
    expect(prompt).toContain(`${LENSES.length} lenses`);
  });

  it("surfaces nested model/effort in the diagnostic header for outer log readers", () => {
    const prompt = buildNestedTeamleadPrompt({
      lenses: LENSES.slice(0, 1),
      model: "gpt-5.5",
      reasoning_effort: "medium",
      service_tier: "fast",
    });
    expect(prompt).toContain("model=gpt-5.5");
    expect(prompt).toContain("effort=medium");
    expect(prompt).toContain("service_tier=fast");
  });

  it("falls back to (codex default) in diagnostic header when unset", () => {
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES.slice(0, 1) });
    expect(prompt).toContain("model=(codex default)");
    expect(prompt).toContain("effort=(codex default)");
    expect(prompt).toContain("service_tier=(codex default)");
  });

  it("embeds ENV-BEFORE and ENV-AFTER diagnostic emissions in the script body", () => {
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES });
    expect(prompt).toContain("ENV-BEFORE lens=");
    expect(prompt).toContain("ENV-AFTER lens=");
  });

  it("delivers instructions as a literal bash script piped to bash -s", () => {
    // Regression guard for the descriptive→literal rewrite. Earlier prompts
    // asked outer to "invoke nested codex for each lens", which outer
    // interpreted as a self-assignment (using its own file-edit tools) and
    // never spawned nested workeres. The literal-script formulation
    // removes that interpretation latitude — outer's only action is to
    // pipe the block below to bash.
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES });
    expect(prompt).toContain("bash -s");
    expect(prompt).toContain("```bash");
    expect(prompt).toContain("#!/usr/bin/env bash");
    expect(prompt).toContain("LENSES=(");
  });

  it("dispatches lenses in parallel via background subshells + wait", () => {
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES });
    // subshell + background + wait pattern
    expect(prompt).toMatch(/\)\s*&\s*\ndone\s*\n\s*wait/);
  });

  it("persists per-lens running log as nested-stderr.log on failure", () => {
    // Regression guard: post-hoc audit needs to answer "what failed
    // inside this lens run?" after dispatch exits. Now that the running
    // log lives under sessionRoot/round1 for real-time tail -f, the
    // failure path simply renames it to .<lens>.nested-stderr.log; the
    // success path removes it. Previous `tail -200` bounded copy is no
    // longer necessary since the source log is already file-system
    // resident at the destination directory.
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES });
    expect(prompt).toContain(".nested-stderr.log");
    expect(prompt).toContain(".running.log");
  });

  it("writes per-lens running log under sessionRoot (not TMPDIR) for live tail -f", () => {
    // Regression guard for commit 5 streaming: per-lens $LOG must live
    // under OUTPUT_DIR (sessionRoot/round1) so the watcher pane can
    // tail it as codex emits. Keeping $LOG in TMPDIR would revert to
    // post-hoc-only visibility.
    const prompt = buildNestedTeamleadPrompt({ lenses: LENSES });
    expect(prompt).toContain('LOG="$OUTPUT_DIR/.$LENS_ID.running.log"');
    // $STAT remains in TMPDIR (short-lived handoff from lens subshell
    // to the summary emitter; no value to the watcher).
    expect(prompt).toContain('STAT="$TMPDIR/$LENS_ID.status"');
  });
});

// ---------------------------------------------------------------------------
// parseNestedTeamleadSummary
// ---------------------------------------------------------------------------

describe("parseNestedTeamleadSummary", () => {
  it("returns null when no summary line is present", () => {
    expect(parseNestedTeamleadSummary("just model commentary\nnothing here\n")).toBeNull();
  });

  it("extracts a valid summary line with all lens results", () => {
    const stdout = [
      "dispatched lens#1...",
      "dispatched lens#2...",
      'LENS_DISPATCH_SUMMARY:{"lens_results":[{"lens_id":"logic","status":"ok"},{"lens_id":"pragmatics","status":"fail","error":"exit 1"}]}',
    ].join("\n");
    const result = parseNestedTeamleadSummary(stdout);
    expect(result).not.toBeNull();
    expect(result!.lens_results).toHaveLength(2);
    expect(result!.lens_results[0]).toEqual({ lens_id: "logic", status: "ok" });
    expect(result!.lens_results[1]).toEqual({
      lens_id: "pragmatics",
      status: "fail",
      error: "exit 1",
    });
  });

  it("ignores malformed summary lines", () => {
    const stdout = "LENS_DISPATCH_SUMMARY:not-json-at-all\nno summary visible\n";
    expect(parseNestedTeamleadSummary(stdout)).toBeNull();
  });

  it("takes the last summary line when multiple appear", () => {
    const stdout = [
      'LENS_DISPATCH_SUMMARY:{"lens_results":[{"lens_id":"a","status":"fail"}]}',
      'LENS_DISPATCH_SUMMARY:{"lens_results":[{"lens_id":"a","status":"ok"}]}',
    ].join("\n");
    const result = parseNestedTeamleadSummary(stdout);
    expect(result!.lens_results[0]!.status).toBe("ok");
  });

  it("tolerates leading/trailing whitespace around the summary line", () => {
    const stdout = '   LENS_DISPATCH_SUMMARY:{"lens_results":[]}   \n';
    const result = parseNestedTeamleadSummary(stdout);
    expect(result).not.toBeNull();
    expect(result!.lens_results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runCodexNestedTeamlead — injected spawn for deterministic tests
// ---------------------------------------------------------------------------

type SpawnArgs = Parameters<typeof runCodexNestedTeamlead>[1];

function fakeSpawn(
  stdout: string,
  stderr: string,
  exit_code: number,
  timed_out = false,
): NonNullable<SpawnArgs> {
  return async () => ({ stdout, stderr, exit_code, timed_out });
}

describe("runCodexNestedTeamlead", () => {
  it("returns outcomes in input order with ok statuses on clean exit", async () => {
    const input: CodexNestedTeamleadInput = { lenses: LENSES };
    const stdout = `LENS_DISPATCH_SUMMARY:${JSON.stringify({
      lens_results: [
        { lens_id: "logic", status: "ok" },
        { lens_id: "pragmatics", status: "ok" },
        { lens_id: "axiology", status: "ok" },
      ],
    })}`;
    const result = await runCodexNestedTeamlead(input, fakeSpawn(stdout, "", 0));
    expect(result.summary_parsed).toBe(true);
    expect(result.outer_exit_code).toBe(0);
    expect(result.outcomes.map((o) => o.lens_id)).toEqual(["logic", "pragmatics", "axiology"]);
    expect(result.outcomes.every((o) => o.status === "ok")).toBe(true);
  });

  it("propagates per-lens failures from the summary", async () => {
    const input: CodexNestedTeamleadInput = { lenses: LENSES };
    const stdout = `LENS_DISPATCH_SUMMARY:${JSON.stringify({
      lens_results: [
        { lens_id: "logic", status: "ok" },
        { lens_id: "pragmatics", status: "fail", error: "inner codex exit 1" },
        { lens_id: "axiology", status: "ok" },
      ],
    })}`;
    const result = await runCodexNestedTeamlead(input, fakeSpawn(stdout, "", 0));
    expect(result.outcomes[0]!.status).toBe("ok");
    expect(result.outcomes[1]!.status).toBe("fail");
    expect(result.outcomes[1]!.error).toContain("inner codex exit 1");
    expect(result.outcomes[2]!.status).toBe("ok");
  });

  it("marks missing lens_ids as fail with teamlead-noncompliance reason", async () => {
    const input: CodexNestedTeamleadInput = { lenses: LENSES };
    // Summary omits axiology entirely.
    const stdout = `LENS_DISPATCH_SUMMARY:${JSON.stringify({
      lens_results: [
        { lens_id: "logic", status: "ok" },
        { lens_id: "pragmatics", status: "ok" },
      ],
    })}`;
    const result = await runCodexNestedTeamlead(input, fakeSpawn(stdout, "", 0));
    expect(result.outcomes[2]!.status).toBe("fail");
    expect(result.outcomes[2]!.error).toContain("axiology");
    expect(result.outcomes[2]!.error).toContain("summary missing");
  });

  it("marks all lenses fail when outer codex never emits a summary", async () => {
    const input: CodexNestedTeamleadInput = { lenses: LENSES };
    const stdout = "just commentary, no summary line\n";
    const result = await runCodexNestedTeamlead(input, fakeSpawn(stdout, "something went wrong", 1));
    expect(result.summary_parsed).toBe(false);
    expect(result.outer_exit_code).toBe(1);
    expect(result.outcomes.every((o) => o.status === "fail")).toBe(true);
    for (const outcome of result.outcomes) {
      expect(outcome.error).toContain("did not emit");
    }
  });

  it("timeout marks all lenses fail with explicit timeout reason", async () => {
    const input: CodexNestedTeamleadInput = { lenses: LENSES, timeout_ms: 1234 };
    const result = await runCodexNestedTeamlead(
      input,
      fakeSpawn("", "", 137, true),
    );
    expect(result.summary_parsed).toBe(false);
    expect(result.outcomes.every((o) => o.status === "fail")).toBe(true);
    for (const outcome of result.outcomes) {
      expect(outcome.error).toContain("1234");
      expect(outcome.error).toContain("timed out");
    }
  });

  it("trusts per-lens summary even when outer exit code is non-zero", async () => {
    const input: CodexNestedTeamleadInput = { lenses: LENSES };
    const stdout = `LENS_DISPATCH_SUMMARY:${JSON.stringify({
      lens_results: [
        { lens_id: "logic", status: "ok" },
        { lens_id: "pragmatics", status: "ok" },
        { lens_id: "axiology", status: "fail", error: "model context length exceeded" },
      ],
    })}`;
    // Outer codex exits 1 (e.g., because one nested lens failed), but
    // summary is still reliable.
    const result = await runCodexNestedTeamlead(input, fakeSpawn(stdout, "", 1));
    expect(result.summary_parsed).toBe(true);
    expect(result.outer_exit_code).toBe(1);
    expect(result.outcomes[0]!.status).toBe("ok");
    expect(result.outcomes[1]!.status).toBe("ok");
    expect(result.outcomes[2]!.status).toBe("fail");
    expect(result.outcomes[2]!.error).toContain("context length");
  });

  it("captures outer stdout/stderr verbatim for debugging", async () => {
    const input: CodexNestedTeamleadInput = { lenses: LENSES.slice(0, 1) };
    const stdoutRaw = "outer commentary\nmore details\n";
    const stderrRaw = "some warning\n";
    const result = await runCodexNestedTeamlead(
      input,
      fakeSpawn(stdoutRaw, stderrRaw, 0),
    );
    expect(result.outer_stdout).toBe(stdoutRaw);
    expect(result.outer_stderr).toBe(stderrRaw);
  });

  it("forwards model, reasoning_effort, and service_tier to outer codex spawn options", async () => {
    // Regression: outer codex previously inherited ~/.codex/config.toml
    // defaults (e.g. xhigh effort), ignoring .onto/settings.json overrides and
    // causing orchestration timeouts. The input fields must reach the
    // spawn callsite so the CLI can add `-c model_reasoning_effort=…` and
    // `-m <model>` args.
    let captured: Parameters<NonNullable<SpawnArgs>>[1] | null = null;
    const capturingSpawn: NonNullable<SpawnArgs> = async (_prompt, options) => {
      captured = options;
      return { stdout: "", stderr: "", exit_code: 0, timed_out: false };
    };
    const input: CodexNestedTeamleadInput = {
      lenses: LENSES.slice(0, 1),
      model: "gpt-5.5",
      reasoning_effort: "medium",
      service_tier: "fast",
    };
    await runCodexNestedTeamlead(input, capturingSpawn);
    expect(captured).not.toBeNull();
    expect(captured!.model).toBe("gpt-5.5");
    expect(captured!.reasoning_effort).toBe("medium");
    expect(captured!.service_tier).toBe("fast");
  });

  it("omits model, reasoning_effort, and service_tier from spawn options when unset", async () => {
    let captured: Parameters<NonNullable<SpawnArgs>>[1] | null = null;
    const capturingSpawn: NonNullable<SpawnArgs> = async (_prompt, options) => {
      captured = options;
      return { stdout: "", stderr: "", exit_code: 0, timed_out: false };
    };
    const input: CodexNestedTeamleadInput = { lenses: LENSES.slice(0, 1) };
    await runCodexNestedTeamlead(input, capturingSpawn);
    expect(captured).not.toBeNull();
    expect(captured!.model).toBeUndefined();
    expect(captured!.reasoning_effort).toBeUndefined();
    expect(captured!.service_tier).toBeUndefined();
  });

  it("forwards stream_stdout_path and stream_stderr_path to spawn options", async () => {
    // Regression guard for real-time watcher streaming: if these fields
    // drop, the outer codex stdout/stderr fall back to memory-only
    // capture and the watcher pane's tail -f hint loses its target.
    let captured: Parameters<NonNullable<SpawnArgs>>[1] | null = null;
    const capturingSpawn: NonNullable<SpawnArgs> = async (_prompt, options) => {
      captured = options;
      return { stdout: "", stderr: "", exit_code: 0, timed_out: false };
    };
    const input: CodexNestedTeamleadInput = {
      lenses: LENSES.slice(0, 1),
      stream_stdout_path: "/tmp/fake/nested-outer-stdout.log",
      stream_stderr_path: "/tmp/fake/nested-outer-stderr.log",
    };
    await runCodexNestedTeamlead(input, capturingSpawn);
    expect(captured).not.toBeNull();
    expect(captured!.stream_stdout_path).toBe("/tmp/fake/nested-outer-stdout.log");
    expect(captured!.stream_stderr_path).toBe("/tmp/fake/nested-outer-stderr.log");
  });

  it("omits stream_*_path from spawn options when unset (memory-only capture)", async () => {
    let captured: Parameters<NonNullable<SpawnArgs>>[1] | null = null;
    const capturingSpawn: NonNullable<SpawnArgs> = async (_prompt, options) => {
      captured = options;
      return { stdout: "", stderr: "", exit_code: 0, timed_out: false };
    };
    const input: CodexNestedTeamleadInput = { lenses: LENSES.slice(0, 1) };
    await runCodexNestedTeamlead(input, capturingSpawn);
    expect(captured).not.toBeNull();
    expect(captured!.stream_stdout_path).toBeUndefined();
    expect(captured!.stream_stderr_path).toBeUndefined();
  });
});
