/**
 * Claude Nesting Batch Worker tests — the claude OUTER realization of the
 * NestingBatchWorker contract. Script/prompt/summary invariants live in
 * `review/nesting-batch.test.ts`; here we cover what is claude-specific:
 * the positional-prompt spawn surface (empirically load-bearing — stdin is
 * ignored by `claude -p`), the Bash-capable bounded flag set, and the
 * forwarding/timeout/summary-trust semantics symmetric to the codex outer.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { UNIT_DISPATCH_SUMMARY_PREFIX } from "../review/nesting-batch.js";
import type { NestingBatchDescriptor } from "../review/nesting-batch.js";
import {
  runClaudeNestingBatchWorker,
  spawnOuterClaude,
} from "./claude-nesting-batch-worker.js";

type SpawnImpl = typeof spawnOuterClaude;
type SpawnOptions = Parameters<SpawnImpl>[1];

function batch(unitIds: string[] = ["logic", "coverage"]): NestingBatchDescriptor {
  return {
    units: unitIds.map((id) => ({
      unit_id: id,
      unit_kind: "lens",
      packet_path: `/packets/${id}.prompt.md`,
      output_path: `/round1/${id}.findings.yaml`,
    })),
    inner_executor_argv: ["node", "/dist/claude-code-review-unit-executor.js"],
    common_args: ["--project-root", "/proj", "--session-root", "/sess"],
  };
}

function summaryLine(
  results: Array<{ unit_id: string; status: "ok" | "fail"; error?: string }>,
): string {
  return `${UNIT_DISPATCH_SUMMARY_PREFIX}${JSON.stringify({ unit_results: results })}`;
}

function stubSpawn(result: {
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  timed_out?: boolean;
}): { impl: SpawnImpl; prompts: string[]; options: SpawnOptions[] } {
  const prompts: string[] = [];
  const options: SpawnOptions[] = [];
  const impl: SpawnImpl = async (prompt, opts) => {
    prompts.push(prompt);
    options.push(opts);
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exit_code: result.exit_code ?? 0,
      timed_out: result.timed_out ?? false,
    };
  };
  return { impl, prompts, options };
}

describe("runClaudeNestingBatchWorker", () => {
  it("returns outcomes in input order with ok statuses on clean exit", async () => {
    const spawn = stubSpawn({
      stdout: summaryLine([
        { unit_id: "logic", status: "ok" },
        { unit_id: "coverage", status: "ok" },
      ]),
    });
    const result = await runClaudeNestingBatchWorker({ batch: batch() }, spawn.impl);
    expect(result.outcomes).toEqual([
      { unit_id: "logic", status: "ok" },
      { unit_id: "coverage", status: "ok" },
    ]);
    expect(result.summary_parsed).toBe(true);
  });

  it("marks all units fail when the outer never surfaces a summary", async () => {
    const spawn = stubSpawn({ stdout: "polite model prose only" });
    const result = await runClaudeNestingBatchWorker({ batch: batch() }, spawn.impl);
    expect(result.summary_parsed).toBe(false);
    expect(result.outcomes.every((o) => o.status === "fail")).toBe(true);
  });

  it("timeout marks all units fail with explicit timeout reason", async () => {
    const spawn = stubSpawn({ timed_out: true, exit_code: 137 });
    const result = await runClaudeNestingBatchWorker(
      { batch: batch(), timeout_ms: 4000 },
      spawn.impl,
    );
    expect(result.outcomes.every((o) => o.status === "fail")).toBe(true);
    expect(result.outcomes[0]?.error).toMatch(/outer claude timed out after 4000 ms/);
  });

  it("trusts per-unit summary even when outer exit code is non-zero", async () => {
    const spawn = stubSpawn({
      stdout: summaryLine([
        { unit_id: "logic", status: "ok" },
        { unit_id: "coverage", status: "fail", error: "exit=1 size=0" },
      ]),
      exit_code: 1,
    });
    const result = await runClaudeNestingBatchWorker({ batch: batch() }, spawn.impl);
    expect(result.outcomes[0]?.status).toBe("ok");
    expect(result.outcomes[1]?.status).toBe("fail");
  });

  it("hands the outer a literal script prompt with the claude diagnostics header", async () => {
    const spawn = stubSpawn({ stdout: summaryLine([]) });
    await runClaudeNestingBatchWorker(
      { batch: batch(), teamlead_model: "claude-opus-4-8" },
      spawn.impl,
    );
    const prompt = spawn.prompts[0]!;
    expect(prompt).toContain("Nesting batch dispatch for 2 units");
    expect(prompt).toContain("brand=claude");
    expect(prompt).toContain("teamlead_model=claude-opus-4-8");
    expect(prompt).toContain("piping it to `bash -s`");
    expect(prompt).toContain("node /dist/claude-code-review-unit-executor.js");
  });

  it("forwards model/effort to spawn options; omits when unset; no service_tier surface", async () => {
    const withSettings = stubSpawn({ stdout: summaryLine([]) });
    await runClaudeNestingBatchWorker(
      {
        batch: batch(),
        teamlead_model: "claude-opus-4-8",
        teamlead_reasoning_effort: "high",
        project_root: "/proj",
        claude_bin: "/fake/claude",
        timeout_ms: 9000,
      },
      withSettings.impl,
    );
    const opts = withSettings.options[0]!;
    expect(opts.model).toBe("claude-opus-4-8");
    expect(opts.reasoning_effort).toBe("high");
    expect(opts.project_root).toBe("/proj");
    expect(opts.claude_bin).toBe("/fake/claude");
    expect(opts.timeout_ms).toBe(9000);
    // service_tier is API-only — the claude worker input has no such field.
    expect("service_tier" in opts).toBe(false);

    const withoutSettings = stubSpawn({ stdout: summaryLine([]) });
    await runClaudeNestingBatchWorker({ batch: batch() }, withoutSettings.impl);
    expect(withoutSettings.options[0]!.model).toBeUndefined();
    expect(withoutSettings.options[0]!.reasoning_effort).toBeUndefined();
    expect(withoutSettings.options[0]!.timeout_ms).toBe(600_000);
  });

  it("forwards stream paths when set and omits them when unset", async () => {
    const withStreams = stubSpawn({ stdout: summaryLine([]) });
    await runClaudeNestingBatchWorker(
      {
        batch: batch(),
        stream_stdout_path: "/sess/nested-outer-stdout.log",
        stream_stderr_path: "/sess/nested-outer-stderr.log",
      },
      withStreams.impl,
    );
    expect(withStreams.options[0]!.stream_stdout_path).toBe(
      "/sess/nested-outer-stdout.log",
    );
    expect(withStreams.options[0]!.stream_stderr_path).toBe(
      "/sess/nested-outer-stderr.log",
    );

    const withoutStreams = stubSpawn({ stdout: summaryLine([]) });
    await runClaudeNestingBatchWorker({ batch: batch() }, withoutStreams.impl);
    expect(withoutStreams.options[0]!.stream_stdout_path).toBeUndefined();
    expect(withoutStreams.options[0]!.stream_stderr_path).toBeUndefined();
  });
});

describe("spawnOuterClaude (fake binary — real spawn surface)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "onto-claude-outer-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  /** Fake claude binary that prints each argv element on its own line. */
  async function writeFakeClaude(): Promise<string> {
    const binPath = path.join(tmp, "fake-claude");
    await fs.writeFile(
      binPath,
      ['#!/usr/bin/env bash', 'for a in "$@"; do printf "%s\\n" "$a"; done', ""].join(
        "\n",
      ),
      { mode: 0o755 },
    );
    return binPath;
  }

  it("passes the prompt as the positional -p arg with the Bash-capable bounded flag set", async () => {
    const binPath = await writeFakeClaude();
    const result = await spawnOuterClaude("THE PROMPT", {
      claude_bin: binPath,
      project_root: tmp,
      timeout_ms: 10_000,
      model: "claude-opus-4-8",
      reasoning_effort: "high",
    });

    expect(result.exit_code).toBe(0);
    const argv = result.stdout.split("\n");
    const pIndex = argv.indexOf("-p");
    expect(pIndex).toBeGreaterThanOrEqual(0);
    // Positional prompt immediately follows -p (stdin is ignored by claude).
    expect(argv[pIndex + 1]).toBe("THE PROMPT");
    expect(result.stdout).toContain("--permission-mode");
    expect(result.stdout).toContain("bypassPermissions");
    expect(result.stdout).toContain("--strict-mcp-config");
    expect(result.stdout).toContain('{"mcpServers":{}}');
    expect(result.stdout).toContain("--model");
    expect(result.stdout).toContain("claude-opus-4-8");
    expect(result.stdout).toContain("--effort");
    // --allowedTools Bash is last so the variadic list cannot swallow a flag.
    expect(argv[argv.length - 3]).toBe("--allowedTools");
    expect(argv[argv.length - 2]).toBe("Bash");
  });

  it("tees stdout to the stream path in real time", async () => {
    const binPath = await writeFakeClaude();
    const streamPath = path.join(tmp, "outer-stdout.log");
    const result = await spawnOuterClaude("P", {
      claude_bin: binPath,
      project_root: tmp,
      timeout_ms: 10_000,
      stream_stdout_path: streamPath,
    });
    const onDisk = await fs.readFile(streamPath, "utf8");
    expect(onDisk).toBe(result.stdout);
  });

  it("throws a descriptive error when the binary is missing", async () => {
    await expect(
      spawnOuterClaude("P", {
        claude_bin: path.join(tmp, "no-such-claude"),
        project_root: tmp,
        timeout_ms: 10_000,
      }),
    ).rejects.toThrow(/Claude Code CLI not found/);
  });
});
