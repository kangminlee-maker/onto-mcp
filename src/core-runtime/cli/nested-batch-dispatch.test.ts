import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ReviewExecutionPlan } from "../review/artifact-types.js";
import { writeYamlDocument } from "../review/review-artifact-utils.js";
import type {
  NestingBatchUnit,
  NestingBatchUnitOutcome,
} from "../review/nesting-batch.js";
import {
  executeReviewViaNestedBatch,
  resolveNestedOuterSpawnConfig,
  type NestedBatchBrand,
  type NestedBatchWorkerRunResult,
  type NestedBatchWorkers,
  type OutputFileInspector,
} from "./nested-batch-dispatch.js";
import type { CodexNestingBatchWorkerInput } from "./codex-nesting-batch-worker.js";
import type { ClaudeNestingBatchWorkerInput } from "./claude-nesting-batch-worker.js";

// ---------------------------------------------------------------------------
// These tests assert nested-batch bridge invariants:
//
// (1) Units and the inner unit-executor invocation are CALLER-built (flat
//     parity by construction) and forwarded verbatim into the batch
//     descriptor, with session-scoped common args attached by the bridge.
// (2) The brand selects the outer worker realization; outer (teamlead
//     seat) settings resolve from settings.json only when the llm ref
//     matches that brand's OAuth adapter. service_tier surfaces only for
//     codex. Inner LLM settings never come from the bridge.
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

function buildPlan(sessionRoot: string): ReviewExecutionPlan {
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
    lens_execution_seats: [],
    prompt_packets_root: path.join(sessionRoot, "prompt-packets"),
    lens_prompt_packet_seats: [],
    synthesis_output_path: path.join(sessionRoot, "synthesis.md"),
    deliberation_output_path: path.join(sessionRoot, "deliberation.md"),
    execution_result_path: path.join(sessionRoot, "execution-result.yaml"),
    error_log_path: path.join(sessionRoot, "error-log.md"),
    final_output_path: path.join(sessionRoot, "final.md"),
    review_record_path: path.join(sessionRoot, "review-record.yaml"),
  } as unknown as ReviewExecutionPlan;
}

function lensUnits(sessionRoot: string): NestingBatchUnit[] {
  return ["logic", "coverage"].map((id) => ({
    unit_id: id,
    unit_kind: "lens",
    packet_path: path.join(sessionRoot, "prompt-packets", `${id}.prompt.md`),
    output_path: path.join(sessionRoot, "round1", `${id}.findings.yaml`),
    extra_args: ["--output-format", "lens-sidecar"],
  }));
}

const INNER_EXECUTOR = {
  bin: "node",
  args: ["/dist/codex-review-unit-executor.js", "--model", "gpt-5.5"],
};

function okOutcomes(units: NestingBatchUnit[]): NestingBatchUnitOutcome[] {
  return units.map((u) => ({ unit_id: u.unit_id, status: "ok" as const }));
}

function buildWorkers(
  outcomes: NestingBatchUnitOutcome[],
  opts: Partial<NestedBatchWorkerRunResult> = {},
): {
  workers: NestedBatchWorkers;
  codexCalls: CodexNestingBatchWorkerInput[];
  claudeCalls: ClaudeNestingBatchWorkerInput[];
} {
  const codexCalls: CodexNestingBatchWorkerInput[] = [];
  const claudeCalls: ClaudeNestingBatchWorkerInput[] = [];
  const result = (): NestedBatchWorkerRunResult => ({
    outcomes,
    outer_stdout: opts.outer_stdout ?? "",
    outer_stderr: opts.outer_stderr ?? "",
    outer_exit_code: opts.outer_exit_code ?? 0,
    summary_parsed: opts.summary_parsed ?? true,
  });
  return {
    workers: {
      codex: async (input) => {
        codexCalls.push(input);
        return result();
      },
      claude: async (input) => {
        claudeCalls.push(input);
        return result();
      },
    },
    codexCalls,
    claudeCalls,
  };
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

const CODEX_OAUTH_TEAMLEAD = {
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

const CLAUDE_OAUTH_TEAMLEAD = {
  review: {
    execution: {
      teamlead: {
        seat: "worker",
        llm: {
          auth: "oauth",
          provider: "anthropic",
          model: "claude-opus-4-8",
          effort: "high",
        },
      },
    },
  },
} as never;

async function dispatch(args: {
  brand: NestedBatchBrand;
  fixture: Fixture;
  ontoConfig?: never | object;
  outcomes?: NestingBatchUnitOutcome[];
  resultOpts?: Partial<NestedBatchWorkerRunResult>;
  inspectorPresent?: Set<string>;
  timeout_ms?: number;
  outer_bin?: string;
}) {
  const units = lensUnits(args.fixture.sessionRoot);
  const built = buildWorkers(args.outcomes ?? okOutcomes(units), args.resultOpts);
  const result = await executeReviewViaNestedBatch(
    {
      brand: args.brand,
      sessionRoot: args.fixture.sessionRoot,
      projectRoot: "/proj",
      ontoConfig: (args.ontoConfig ?? {}) as never,
      units,
      inner_executor: INNER_EXECUTOR,
      ...(args.timeout_ms !== undefined ? { timeout_ms: args.timeout_ms } : {}),
      ...(args.outer_bin ? { outer_bin: args.outer_bin } : {}),
    },
    built.workers,
    staticInspector(
      args.inspectorPresent ?? new Set(units.map((u) => u.output_path)),
    ),
  );
  return { result, units, ...built };
}

describe("executeReviewViaNestedBatch — forwarding", () => {
  let fixture: Fixture;
  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  it("forwards caller-built units + inner executor argv + common args into the batch", async () => {
    fixture = await mkSession(buildPlan);
    const { units, codexCalls, claudeCalls } = await dispatch({
      brand: "codex",
      fixture,
    });

    expect(codexCalls).toHaveLength(1);
    expect(claudeCalls).toHaveLength(0);
    const batch = codexCalls[0]!.batch;
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
    expect(codexCalls[0]!.project_root).toBe("/proj");
  });

  it("brand=claude routes to the claude worker with claude_bin override", async () => {
    fixture = await mkSession(buildPlan);
    const { codexCalls, claudeCalls } = await dispatch({
      brand: "claude",
      fixture,
      outer_bin: "/fake/claude",
    });
    expect(codexCalls).toHaveLength(0);
    expect(claudeCalls).toHaveLength(1);
    expect(claudeCalls[0]!.claude_bin).toBe("/fake/claude");
  });

  it("resolves codex outer settings (incl. service_tier) from codex OAuth teamlead llm", async () => {
    fixture = await mkSession(buildPlan);
    const { codexCalls } = await dispatch({
      brand: "codex",
      fixture,
      ontoConfig: CODEX_OAUTH_TEAMLEAD,
    });
    const call = codexCalls[0]!;
    expect(call.teamlead_model).toBe("gpt-5.5");
    expect(call.teamlead_reasoning_effort).toBe("high");
    expect(call.teamlead_service_tier).toBe("fast");
  });

  it("resolves claude outer settings (no service_tier surface) from claude OAuth teamlead llm", async () => {
    fixture = await mkSession(buildPlan);
    const { claudeCalls } = await dispatch({
      brand: "claude",
      fixture,
      ontoConfig: CLAUDE_OAUTH_TEAMLEAD,
    });
    const call = claudeCalls[0]!;
    expect(call.teamlead_model).toBe("claude-opus-4-8");
    expect(call.teamlead_reasoning_effort).toBe("high");
    expect("teamlead_service_tier" in call).toBe(false);
  });

  it("leaves outer settings unset when the teamlead llm is the other brand's adapter", async () => {
    fixture = await mkSession(buildPlan);
    // codex brand + claude OAuth teamlead → adapter mismatch → defaults.
    const { codexCalls } = await dispatch({
      brand: "codex",
      fixture,
      ontoConfig: CLAUDE_OAUTH_TEAMLEAD,
    });
    expect(codexCalls[0]!.teamlead_model).toBeUndefined();
    expect(codexCalls[0]!.teamlead_reasoning_effort).toBeUndefined();
  });

  it("passes sessionRoot-based stream paths and archives outer logs", async () => {
    fixture = await mkSession(buildPlan);
    const { codexCalls } = await dispatch({
      brand: "codex",
      fixture,
      resultOpts: { outer_stdout: "OUTER OUT", outer_stderr: "OUTER ERR" },
    });

    expect(codexCalls[0]!.stream_stdout_path).toBe(
      path.join(fixture.sessionRoot, "nested-outer-stdout.log"),
    );
    expect(codexCalls[0]!.stream_stderr_path).toBe(
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

  it("forwards timeout_ms and outer_bin (codex) overrides", async () => {
    fixture = await mkSession(buildPlan);
    const { codexCalls } = await dispatch({
      brand: "codex",
      fixture,
      timeout_ms: 1234,
      outer_bin: "/fake/codex",
    });
    expect(codexCalls[0]!.timeout_ms).toBe(1234);
    expect(codexCalls[0]!.codex_bin).toBe("/fake/codex");
  });
});

describe("resolveNestedOuterSpawnConfig", () => {
  it("maps brand-matching OAuth teamlead llm to outer spawn settings", () => {
    expect(resolveNestedOuterSpawnConfig("codex", CODEX_OAUTH_TEAMLEAD)).toEqual({
      model: "gpt-5.5",
      effort: "high",
      service_tier: "fast",
    });
    expect(resolveNestedOuterSpawnConfig("claude", CLAUDE_OAUTH_TEAMLEAD)).toEqual({
      model: "claude-opus-4-8",
      effort: "high",
    });
  });

  it("returns empty for missing refs or adapter mismatch", () => {
    expect(resolveNestedOuterSpawnConfig("codex", {})).toEqual({});
    expect(
      resolveNestedOuterSpawnConfig("claude", CODEX_OAUTH_TEAMLEAD),
    ).toEqual({});
    expect(
      resolveNestedOuterSpawnConfig("codex", CLAUDE_OAUTH_TEAMLEAD),
    ).toEqual({});
  });
});

describe("executeReviewViaNestedBatch — per-unit classification", () => {
  let fixture: Fixture;
  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  it("all ok + all files present → all participating", async () => {
    fixture = await mkSession(buildPlan);
    const { result } = await dispatch({ brand: "codex", fixture });
    expect(result.executed_lens_count).toBe(2);
    expect(result.participating_lens_ids).toEqual(["logic", "coverage"]);
    expect(result.degraded_lens_ids).toEqual([]);
  });

  it("worker fail → degraded (no file probe needed)", async () => {
    fixture = await mkSession(buildPlan);
    const { result } = await dispatch({
      brand: "codex",
      fixture,
      outcomes: [
        { unit_id: "logic", status: "fail", error: "boom" },
        { unit_id: "coverage", status: "ok" },
      ],
    });
    expect(result.degraded_lens_ids).toEqual(["logic"]);
    expect(result.participating_lens_ids).toEqual(["coverage"]);
  });

  it("worker ok but output file missing → degraded", async () => {
    fixture = await mkSession(buildPlan);
    const units = lensUnits(fixture.sessionRoot);
    const logicPath = units[0]!.output_path;
    const { result } = await dispatch({
      brand: "codex",
      fixture,
      // logic present (non-empty); coverage absent entirely.
      inspectorPresent: new Set([logicPath]),
      outcomes: okOutcomes(units),
    });
    expect(result.participating_lens_ids).toEqual(["logic"]);
    expect(result.degraded_lens_ids).toEqual(["coverage"]);
  });

  it("worker ok but file size=0 → degraded", async () => {
    fixture = await mkSession(buildPlan);
    const units = lensUnits(fixture.sessionRoot);
    const built = buildWorkers(okOutcomes(units));
    const result = await executeReviewViaNestedBatch(
      {
        brand: "codex",
        sessionRoot: fixture.sessionRoot,
        projectRoot: "/proj",
        ontoConfig: {} as never,
        units,
        inner_executor: INNER_EXECUTOR,
      },
      built.workers,
      staticInspector(new Set(units.map((u) => u.output_path)), {
        [units[0]!.output_path]: 0,
      }),
    );
    expect(result.degraded_lens_ids).toEqual(["logic"]);
    expect(result.participating_lens_ids).toEqual(["coverage"]);
  });
});

describe("executeReviewViaNestedBatch — result shape", () => {
  let fixture: Fixture;
  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  it("synthesis_executed is always false; synthesis/error paths from plan", async () => {
    fixture = await mkSession(buildPlan);
    const { result } = await dispatch({ brand: "codex", fixture });
    expect(result.synthesis_executed).toBe(false);
    expect(result.synthesis_output_path).toBe(
      path.join(fixture.sessionRoot, "synthesis.md"),
    );
    expect(result.error_log_path).toBe(
      path.join(fixture.sessionRoot, "error-log.md"),
    );
  });

  it("nested_raw exposes the worker result verbatim", async () => {
    fixture = await mkSession(buildPlan);
    const { result } = await dispatch({
      brand: "claude",
      fixture,
      resultOpts: { outer_stdout: "RAW" },
    });
    expect(result.nested_raw.outer_stdout).toBe("RAW");
    expect(result.nested_raw.summary_parsed).toBe(true);
  });

  it("halt_reason carries the brand when outer exit non-zero AND summary not parsed", async () => {
    fixture = await mkSession(buildPlan);
    const { result } = await dispatch({
      brand: "claude",
      fixture,
      resultOpts: { outer_exit_code: 3, summary_parsed: false },
      outcomes: [
        { unit_id: "logic", status: "fail", error: "no summary" },
        { unit_id: "coverage", status: "fail", error: "no summary" },
      ],
    });
    expect(result.halt_reason).toMatch(/\(claude\) failed \(exit=3/);
  });

  it("halt_reason absent when per-unit degraded but outer ok", async () => {
    fixture = await mkSession(buildPlan);
    const { result } = await dispatch({
      brand: "codex",
      fixture,
      outcomes: [
        { unit_id: "logic", status: "fail", error: "boom" },
        { unit_id: "coverage", status: "ok" },
      ],
    });
    expect(result.halt_reason).toBeUndefined();
  });
});

describe("executeReviewViaNestedBatch — missing execution-plan", () => {
  it("propagates readYamlDocument error when execution-plan.yaml absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-pr-h-"));
    const sessionRoot = path.join(root, "empty-session");
    await fs.mkdir(sessionRoot, { recursive: true });
    try {
      await expect(
        executeReviewViaNestedBatch({
          brand: "codex",
          sessionRoot,
          projectRoot: "/proj",
          ontoConfig: {} as never,
          units: [],
          inner_executor: INNER_EXECUTOR,
        }),
      ).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
