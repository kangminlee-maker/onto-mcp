import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ReviewExecutionPlan } from "../review/artifact-types.js";
import { writeYamlDocument } from "../review/review-artifact-utils.js";
import type { NestingBatchUnit } from "../review/nesting-batch.js";
import {
  executeReviewViaCodexNested,
  resolveCodexOuterSpawnConfig,
  type OutputFileInspector,
} from "./codex-nested-dispatch.js";
import type {
  CodexNestingBatchWorkerInput,
  CodexNestingBatchWorkerResult,
} from "./codex-nesting-batch-worker.js";
import type { NestingBatchUnitOutcome } from "../review/nesting-batch.js";

// ---------------------------------------------------------------------------
// These tests assert codex-nested bridge invariants:
//
// (1) Units and the inner unit-executor invocation are CALLER-built (flat
//     parity by construction) and forwarded verbatim into the batch
//     descriptor, with session-scoped common args attached by the bridge.
// (2) Outer (teamlead seat) codex settings are resolved from settings.json
//     only when the llm ref resolves to codex OAuth; inner LLM settings
//     never come from the bridge.
// (3) Per-unit classification requires BOTH worker-ok AND file exists with
//     size > 0. One of the two missing → degraded.
// (4) synthesis_executed is always `false` for this bridge.
// (5) synthesis_output_path is pulled from execution-plan for downstream
//     consumption.
// (6) halt_reason surfaces outer-level failure (non-zero exit + missing
//     summary) but NOT per-unit degradation alone.
// ---------------------------------------------------------------------------

interface Fixture {
  sessionRoot: string;
  cleanup: () => Promise<void>;
}

async function mkSession(
  buildPlanFor: (sessionRoot: string) => ReviewExecutionPlan,
): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-pr-h-"));
  const sessionRoot = path.join(root, "session");
  await fs.mkdir(sessionRoot, { recursive: true });
  await writeYamlDocument(
    path.join(sessionRoot, "execution-plan.yaml"),
    buildPlanFor(sessionRoot),
  );
  return {
    sessionRoot,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

function buildPlan(
  lenses: Array<{ lens_id: string; packet_path: string; output_path: string }>,
  sessionRoot: string,
): ReviewExecutionPlan {
  return {
    session_id: "pr-h-test",
    session_root: sessionRoot,
    execution_realization: "worker",
    host_runtime: "codex",
    review_mode: "core-axis",
    interpretation_artifact_path: path.join(sessionRoot, "interpretation.yaml"),
    binding_output_path: path.join(sessionRoot, "binding.yaml"),
    session_metadata_path: path.join(sessionRoot, "session-metadata.yaml"),
    execution_preparation_root: path.join(sessionRoot, "prep"),
    round1_root: path.join(sessionRoot, "round1"),
    lens_execution_seats: lenses.map((l) => ({
      lens_id: l.lens_id,
      output_path: l.output_path,
    })),
    prompt_packets_root: path.join(sessionRoot, "prompt-packets"),
    lens_prompt_packet_seats: lenses,
    synthesis_output_path: path.join(sessionRoot, "synthesis.md"),
    deliberation_output_path: path.join(sessionRoot, "deliberation.md"),
    execution_result_path: path.join(sessionRoot, "execution-result.yaml"),
    error_log_path: path.join(sessionRoot, "error-log.md"),
    final_output_path: path.join(sessionRoot, "final.md"),
    review_record_path: path.join(sessionRoot, "review-record.yaml"),
  } as unknown as ReviewExecutionPlan;
}

function lensUnits(
  lenses: Array<{ lens_id: string; packet_path: string; output_path: string }>,
): NestingBatchUnit[] {
  return lenses.map((l) => ({
    unit_id: l.lens_id,
    unit_kind: "lens",
    packet_path: l.packet_path,
    output_path: l.output_path,
    extra_args: ["--output-format", "lens-sidecar"],
  }));
}

const INNER_EXECUTOR = {
  bin: "node",
  args: ["/dist/codex-review-unit-executor.js", "--model", "gpt-5.5"],
};

function buildWorker(
  outcomes: NestingBatchUnitOutcome[],
  opts: Partial<CodexNestingBatchWorkerResult> = {},
): {
  impl: (input: CodexNestingBatchWorkerInput) => Promise<CodexNestingBatchWorkerResult>;
  calls: CodexNestingBatchWorkerInput[];
} {
  const calls: CodexNestingBatchWorkerInput[] = [];
  const impl = async (input: CodexNestingBatchWorkerInput) => {
    calls.push(input);
    return {
      outcomes,
      outer_stdout: opts.outer_stdout ?? "",
      outer_stderr: opts.outer_stderr ?? "",
      outer_exit_code: opts.outer_exit_code ?? 0,
      summary_parsed: opts.summary_parsed ?? true,
    } satisfies CodexNestingBatchWorkerResult;
  };
  return { impl, calls };
}

function staticInspector(
  present: Set<string>,
  sizes: Record<string, number> = {},
): OutputFileInspector {
  return async (p: string) => ({
    exists: present.has(p),
    size: sizes[p] ?? (present.has(p) ? 1 : 0),
  });
}

const OPENAI_OAUTH_SETTINGS = {
  review: {
    execution: {
      teamlead: {
        seat: "worker",
        llm: {
          auth: "oauth",
          provider: "openai",
          model: "gpt-5.5",
          effort: "high",
          service_tier: "fast",
        },
      },
    },
  },
} as never;

const LENSES = (sessionRoot: string) => [
  {
    lens_id: "logic",
    packet_path: path.join(sessionRoot, "prompt-packets", "logic.prompt.md"),
    output_path: path.join(sessionRoot, "round1", "logic.findings.yaml"),
  },
  {
    lens_id: "coverage",
    packet_path: path.join(sessionRoot, "prompt-packets", "coverage.prompt.md"),
    output_path: path.join(sessionRoot, "round1", "coverage.findings.yaml"),
  },
];

describe("executeReviewViaCodexNested — forwarding", () => {
  let fixture: Fixture;
  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  it("forwards caller-built units + inner executor argv + common args into the batch", async () => {
    fixture = await mkSession((sr) => buildPlan([], sr));
    const lenses = LENSES(fixture.sessionRoot);
    const units = lensUnits(lenses);
    const worker = buildWorker(
      units.map((u) => ({ unit_id: u.unit_id, status: "ok" as const })),
    );

    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        projectRoot: "/proj",
        ontoConfig: {},
        units,
        inner_executor: INNER_EXECUTOR,
      },
      worker.impl,
      staticInspector(new Set(units.map((u) => u.output_path))),
    );

    expect(worker.calls).toHaveLength(1);
    const batch = worker.calls[0]!.batch;
    expect(batch.units).toEqual(units);
    expect(batch.inner_executor_argv).toEqual([
      "node",
      "/dist/codex-review-unit-executor.js",
      "--model",
      "gpt-5.5",
    ]);
    expect(batch.common_args).toEqual([
      "--project-root",
      "/proj",
      "--session-root",
      fixture.sessionRoot,
    ]);
    expect(worker.calls[0]!.project_root).toBe("/proj");
  });

  it("resolves outer settings from teamlead OAuth llm; inner LLM stays caller-owned", async () => {
    fixture = await mkSession((sr) => buildPlan([], sr));
    const units = lensUnits(LENSES(fixture.sessionRoot));
    const worker = buildWorker(
      units.map((u) => ({ unit_id: u.unit_id, status: "ok" as const })),
    );

    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        projectRoot: "/proj",
        ontoConfig: OPENAI_OAUTH_SETTINGS,
        units,
        inner_executor: INNER_EXECUTOR,
      },
      worker.impl,
      staticInspector(new Set(units.map((u) => u.output_path))),
    );

    const call = worker.calls[0]!;
    expect(call.teamlead_model).toBe("gpt-5.5");
    expect(call.teamlead_reasoning_effort).toBe("high");
    expect(call.teamlead_service_tier).toBe("fast");
    // Inner LLM settings ride only inside the caller-built executor argv.
    expect(call.batch.inner_executor_argv).toContain("--model");
  });

  it("leaves outer settings unset for API-key llm refs (not codex OAuth)", async () => {
    fixture = await mkSession((sr) => buildPlan([], sr));
    const units = lensUnits(LENSES(fixture.sessionRoot));
    const worker = buildWorker(
      units.map((u) => ({ unit_id: u.unit_id, status: "ok" as const })),
    );

    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        projectRoot: "/proj",
        ontoConfig: {
          review: {
            execution: {
              teamlead: {
                seat: "worker",
                llm: { auth: "api_key", provider: "openai", model: "gpt-5.5" },
              },
            },
          },
        } as never,
        units,
        inner_executor: INNER_EXECUTOR,
      },
      worker.impl,
      staticInspector(new Set(units.map((u) => u.output_path))),
    );

    const call = worker.calls[0]!;
    expect(call.teamlead_model).toBeUndefined();
    expect(call.teamlead_reasoning_effort).toBeUndefined();
    expect(call.teamlead_service_tier).toBeUndefined();
  });

  it("passes sessionRoot-based stream paths and archives outer logs", async () => {
    fixture = await mkSession((sr) => buildPlan([], sr));
    const units = lensUnits(LENSES(fixture.sessionRoot));
    const worker = buildWorker(
      units.map((u) => ({ unit_id: u.unit_id, status: "ok" as const })),
      { outer_stdout: "OUTER OUT", outer_stderr: "OUTER ERR" },
    );

    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        projectRoot: "/proj",
        ontoConfig: {},
        units,
        inner_executor: INNER_EXECUTOR,
      },
      worker.impl,
      staticInspector(new Set(units.map((u) => u.output_path))),
    );

    const call = worker.calls[0]!;
    expect(call.stream_stdout_path).toBe(
      path.join(fixture.sessionRoot, "nested-outer-stdout.log"),
    );
    expect(call.stream_stderr_path).toBe(
      path.join(fixture.sessionRoot, "nested-outer-stderr.log"),
    );
    // Streaming stub wrote nothing → archive fallback writes the verbatim
    // captured streams.
    await expect(
      fs.readFile(path.join(fixture.sessionRoot, "nested-outer-stdout.log"), "utf8"),
    ).resolves.toBe("OUTER OUT");
    await expect(
      fs.readFile(path.join(fixture.sessionRoot, "nested-outer-stderr.log"), "utf8"),
    ).resolves.toBe("OUTER ERR");
  });

  it("forwards timeout_ms and codex_bin overrides", async () => {
    fixture = await mkSession((sr) => buildPlan([], sr));
    const units = lensUnits(LENSES(fixture.sessionRoot));
    const worker = buildWorker(
      units.map((u) => ({ unit_id: u.unit_id, status: "ok" as const })),
    );

    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        projectRoot: "/proj",
        ontoConfig: {},
        units,
        inner_executor: INNER_EXECUTOR,
        timeout_ms: 1234,
        codex_bin: "/fake/codex",
      },
      worker.impl,
      staticInspector(new Set(units.map((u) => u.output_path))),
    );

    expect(worker.calls[0]!.timeout_ms).toBe(1234);
    expect(worker.calls[0]!.codex_bin).toBe("/fake/codex");
  });
});

describe("resolveCodexOuterSpawnConfig", () => {
  it("maps codex OAuth teamlead llm to outer spawn settings", () => {
    expect(resolveCodexOuterSpawnConfig(OPENAI_OAUTH_SETTINGS)).toEqual({
      model: "gpt-5.5",
      effort: "high",
      service_tier: "fast",
    });
  });

  it("returns empty for missing/non-oauth refs", () => {
    expect(resolveCodexOuterSpawnConfig({})).toEqual({});
  });
});

describe("executeReviewViaCodexNested — per-unit classification", () => {
  let fixture: Fixture;
  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  it("all ok + all files present → all participating", async () => {
    fixture = await mkSession((sr) => buildPlan([], sr));
    const units = lensUnits(LENSES(fixture.sessionRoot));
    const worker = buildWorker(
      units.map((u) => ({ unit_id: u.unit_id, status: "ok" as const })),
    );
    const result = await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        projectRoot: "/proj",
        ontoConfig: {},
        units,
        inner_executor: INNER_EXECUTOR,
      },
      worker.impl,
      staticInspector(new Set(units.map((u) => u.output_path))),
    );
    expect(result.executed_lens_count).toBe(2);
    expect(result.participating_lens_ids).toEqual(["logic", "coverage"]);
    expect(result.degraded_lens_ids).toEqual([]);
  });

  it("worker fail → degraded (no file probe needed)", async () => {
    fixture = await mkSession((sr) => buildPlan([], sr));
    const units = lensUnits(LENSES(fixture.sessionRoot));
    const worker = buildWorker([
      { unit_id: "logic", status: "fail", error: "boom" },
      { unit_id: "coverage", status: "ok" },
    ]);
    const result = await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        projectRoot: "/proj",
        ontoConfig: {},
        units,
        inner_executor: INNER_EXECUTOR,
      },
      worker.impl,
      staticInspector(new Set(units.map((u) => u.output_path))),
    );
    expect(result.degraded_lens_ids).toEqual(["logic"]);
    expect(result.participating_lens_ids).toEqual(["coverage"]);
  });

  it("worker ok but output file missing or empty → degraded", async () => {
    fixture = await mkSession((sr) => buildPlan([], sr));
    const units = lensUnits(LENSES(fixture.sessionRoot));
    const worker = buildWorker(
      units.map((u) => ({ unit_id: u.unit_id, status: "ok" as const })),
    );
    const logicPath = units[0]!.output_path;
    const coveragePath = units[1]!.output_path;
    const result = await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        projectRoot: "/proj",
        ontoConfig: {},
        units,
        inner_executor: INNER_EXECUTOR,
      },
      worker.impl,
      // logic present but empty; coverage absent entirely.
      staticInspector(new Set([logicPath]), { [logicPath]: 0, [coveragePath]: 0 }),
    );
    expect(result.participating_lens_ids).toEqual([]);
    expect(result.degraded_lens_ids).toEqual(["logic", "coverage"]);
  });
});

describe("executeReviewViaCodexNested — result shape", () => {
  let fixture: Fixture;
  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  async function run(
    opts: Partial<CodexNestingBatchWorkerResult> = {},
    outcomes?: NestingBatchUnitOutcome[],
  ) {
    fixture = await mkSession((sr) => buildPlan([], sr));
    const units = lensUnits(LENSES(fixture.sessionRoot));
    const worker = buildWorker(
      outcomes ?? units.map((u) => ({ unit_id: u.unit_id, status: "ok" as const })),
      opts,
    );
    return executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        projectRoot: "/proj",
        ontoConfig: {},
        units,
        inner_executor: INNER_EXECUTOR,
      },
      worker.impl,
      staticInspector(new Set(units.map((u) => u.output_path))),
    );
  }

  it("synthesis_executed is always false; synthesis_output_path from plan", async () => {
    const result = await run();
    expect(result.synthesis_executed).toBe(false);
    expect(result.synthesis_output_path).toBe(
      path.join(fixture.sessionRoot, "synthesis.md"),
    );
    expect(result.error_log_path).toBe(
      path.join(fixture.sessionRoot, "error-log.md"),
    );
  });

  it("nested_raw exposes the worker result verbatim", async () => {
    const result = await run({ outer_stdout: "RAW", outer_exit_code: 0 });
    expect(result.nested_raw.outer_stdout).toBe("RAW");
    expect(result.nested_raw.summary_parsed).toBe(true);
  });

  it("halt_reason populated when outer exit non-zero AND summary not parsed", async () => {
    const result = await run(
      { outer_exit_code: 3, summary_parsed: false },
      [
        { unit_id: "logic", status: "fail", error: "no summary" },
        { unit_id: "coverage", status: "fail", error: "no summary" },
      ],
    );
    expect(result.halt_reason).toMatch(/exit=3/);
  });

  it("halt_reason absent when per-unit degraded but outer ok", async () => {
    const result = await run({}, [
      { unit_id: "logic", status: "fail", error: "boom" },
      { unit_id: "coverage", status: "ok" },
    ]);
    expect(result.halt_reason).toBeUndefined();
  });
});

describe("executeReviewViaCodexNested — missing execution-plan", () => {
  it("propagates readYamlDocument error when execution-plan.yaml absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-pr-h-"));
    const sessionRoot = path.join(root, "empty-session");
    await fs.mkdir(sessionRoot, { recursive: true });
    try {
      await expect(
        executeReviewViaCodexNested({
          sessionRoot,
          projectRoot: "/proj",
          ontoConfig: {},
          units: [],
          inner_executor: INNER_EXECUTOR,
        }),
      ).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
