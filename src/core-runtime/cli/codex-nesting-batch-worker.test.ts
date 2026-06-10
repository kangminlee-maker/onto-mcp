/**
 * Codex Nesting Batch Worker tests — the codex OUTER realization of the
 * NestingBatchWorker contract. Script structure / prompt protocol / parse
 * invariants live in `review/nesting-batch.test.ts` (shared, brand-neutral);
 * here we cover what is codex-specific: outer spawn forwarding, timeout
 * classification, and summary trust semantics.
 */
import { describe, expect, it } from "vitest";
import { UNIT_DISPATCH_SUMMARY_PREFIX } from "../review/nesting-batch.js";
import type { NestingBatchDescriptor } from "../review/nesting-batch.js";
import {
  runCodexNestingBatchWorker,
  type CodexNestingBatchWorkerInput,
  spawnOuterCodex,
} from "./codex-nesting-batch-worker.js";

type SpawnImpl = typeof spawnOuterCodex;
type SpawnOptions = Parameters<SpawnImpl>[1];

function batch(unitIds: string[] = ["logic", "coverage"]): NestingBatchDescriptor {
  return {
    units: unitIds.map((id) => ({
      unit_id: id,
      unit_kind: "lens",
      packet_path: `/packets/${id}.prompt.md`,
      output_path: `/round1/${id}.findings.yaml`,
    })),
    inner_executor_argv: ["node", "/dist/codex-review-unit-executor.js"],
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

describe("runCodexNestingBatchWorker", () => {
  it("returns outcomes in input order with ok statuses on clean exit", async () => {
    const spawn = stubSpawn({
      stdout: summaryLine([
        { unit_id: "logic", status: "ok" },
        { unit_id: "coverage", status: "ok" },
      ]),
    });
    const result = await runCodexNestingBatchWorker({ batch: batch() }, spawn.impl);
    expect(result.outcomes).toEqual([
      { unit_id: "logic", status: "ok" },
      { unit_id: "coverage", status: "ok" },
    ]);
    expect(result.summary_parsed).toBe(true);
    expect(result.outer_exit_code).toBe(0);
  });

  it("propagates per-unit failures and marks missing units as noncompliance", async () => {
    const spawn = stubSpawn({
      stdout: summaryLine([{ unit_id: "logic", status: "fail", error: "exit=1 size=0" }]),
    });
    const result = await runCodexNestingBatchWorker({ batch: batch() }, spawn.impl);
    expect(result.outcomes[0]).toEqual({
      unit_id: "logic",
      status: "fail",
      error: "exit=1 size=0",
    });
    expect(result.outcomes[1]?.status).toBe("fail");
    expect(result.outcomes[1]?.error).toMatch(/missing unit_id="coverage"/);
  });

  it("marks all units fail when outer codex never emits a summary", async () => {
    const spawn = stubSpawn({ stdout: "model chatter only" });
    const result = await runCodexNestingBatchWorker({ batch: batch() }, spawn.impl);
    expect(result.summary_parsed).toBe(false);
    expect(result.outcomes.every((o) => o.status === "fail")).toBe(true);
    expect(result.outcomes[0]?.error).toMatch(/did not emit/);
  });

  it("timeout marks all units fail with explicit timeout reason", async () => {
    const spawn = stubSpawn({ timed_out: true, exit_code: 137 });
    const result = await runCodexNestingBatchWorker(
      { batch: batch(), timeout_ms: 5000 },
      spawn.impl,
    );
    expect(result.summary_parsed).toBe(false);
    expect(result.outcomes.every((o) => o.status === "fail")).toBe(true);
    expect(result.outcomes[0]?.error).toMatch(/timed out after 5000 ms/);
  });

  it("trusts per-unit summary even when outer exit code is non-zero", async () => {
    const spawn = stubSpawn({
      stdout: summaryLine([
        { unit_id: "logic", status: "ok" },
        { unit_id: "coverage", status: "ok" },
      ]),
      exit_code: 1,
    });
    const result = await runCodexNestingBatchWorker({ batch: batch() }, spawn.impl);
    expect(result.outcomes.every((o) => o.status === "ok")).toBe(true);
    expect(result.outer_exit_code).toBe(1);
  });

  it("captures outer stdout/stderr verbatim for debugging", async () => {
    const spawn = stubSpawn({ stdout: "OUT noise", stderr: "ERR noise" });
    const result = await runCodexNestingBatchWorker({ batch: batch() }, spawn.impl);
    expect(result.outer_stdout).toBe("OUT noise");
    expect(result.outer_stderr).toBe("ERR noise");
  });

  it("hands the outer a literal script prompt with the codex diagnostics header", async () => {
    const spawn = stubSpawn({ stdout: summaryLine([]) });
    await runCodexNestingBatchWorker(
      {
        batch: batch(),
        teamlead_model: "gpt-5.5",
        teamlead_reasoning_effort: "high",
      },
      spawn.impl,
    );
    const prompt = spawn.prompts[0]!;
    expect(prompt).toContain("Nesting batch dispatch for 2 units");
    expect(prompt).toContain("brand=codex");
    expect(prompt).toContain("teamlead_model=gpt-5.5");
    expect(prompt).toContain("teamlead_effort=high");
    expect(prompt).toContain("piping it to `bash -s`");
    // Inner invocation is the unit executor — never a raw provider call.
    expect(prompt).toContain("node /dist/codex-review-unit-executor.js");
    expect(prompt).not.toContain("codex exec");
  });

  it("forwards teamlead model/effort/service_tier to outer spawn options only", async () => {
    const spawn = stubSpawn({ stdout: summaryLine([]) });
    await runCodexNestingBatchWorker(
      {
        batch: batch(),
        teamlead_model: "gpt-5.5",
        teamlead_reasoning_effort: "medium",
        teamlead_service_tier: "fast",
        project_root: "/proj",
        codex_bin: "/fake/codex",
        timeout_ms: 9000,
      },
      spawn.impl,
    );
    const opts = spawn.options[0]!;
    expect(opts.model).toBe("gpt-5.5");
    expect(opts.reasoning_effort).toBe("medium");
    expect(opts.service_tier).toBe("fast");
    expect(opts.project_root).toBe("/proj");
    expect(opts.codex_bin).toBe("/fake/codex");
    expect(opts.timeout_ms).toBe(9000);
  });

  it("omits model/effort/service_tier from spawn options when unset", async () => {
    const spawn = stubSpawn({ stdout: summaryLine([]) });
    await runCodexNestingBatchWorker({ batch: batch() }, spawn.impl);
    const opts = spawn.options[0]!;
    expect(opts.model).toBeUndefined();
    expect(opts.reasoning_effort).toBeUndefined();
    expect(opts.service_tier).toBeUndefined();
    expect(opts.codex_bin).toBe("codex");
    expect(opts.timeout_ms).toBe(600_000);
  });

  it("forwards stream paths when set and omits them when unset", async () => {
    const withStreams = stubSpawn({ stdout: summaryLine([]) });
    await runCodexNestingBatchWorker(
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
    await runCodexNestingBatchWorker({ batch: batch() }, withoutStreams.impl);
    expect(withoutStreams.options[0]!.stream_stdout_path).toBeUndefined();
    expect(withoutStreams.options[0]!.stream_stderr_path).toBeUndefined();
  });
});

// Type-level sanity: the input type accepts the full option surface.
const _typecheck: CodexNestingBatchWorkerInput = {
  batch: batch(),
  teamlead_model: "m",
  teamlead_reasoning_effort: "high",
  teamlead_service_tier: "fast",
  project_root: "/p",
  codex_bin: "codex",
  timeout_ms: 1,
  stream_stdout_path: "/s.log",
  stream_stderr_path: "/e.log",
};
void _typecheck;
