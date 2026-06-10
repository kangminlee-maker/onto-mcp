/**
 * A downstream nested first-attempt tests (roadmap S2 follow-up).
 *
 * Covers the two runner helpers that extend nesting beyond the lens
 * phase: the stage-batch gate/forwarding (`runNestedStageFirstAttempt`)
 * and the per-unit outcome combinator
 * (`unitOutcomeWithNestedFirstAttempt`) that preserves the flat retry
 * budget — batch consumes attempt #1, failures spend the remainder via
 * the flat loop, and an explicit zero-retry policy never gains a second
 * attempt.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ReviewExecutionPlan } from "../review/artifact-types.js";
import {
  runNestedStageFirstAttempt,
  unitOutcomeWithNestedFirstAttempt,
  type ExecutionDispatchResult,
  type ExecutionOutcome,
} from "./run-review-prompt-execution.js";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";
import type { dispatchNestedBatch } from "./nested-batch-dispatch.js";

type DispatchImpl = typeof dispatchNestedBatch;

function nestedProfile(overrides?: Partial<ReviewExecutionProfile>): ReviewExecutionProfile {
  return {
    mode: "nested-workers",
    worker_executor: "codex",
    artifact_generation_realization: "live",
    teamlead: {
      seat: "worker",
      llm: {
        auth: "oauth",
        provider: "openai",
        model: "gpt-5.5",
        effort: "high",
      },
    },
    ...overrides,
  } as unknown as ReviewExecutionProfile;
}

function dispatch(id: string, tmp: string): ExecutionDispatchResult {
  return {
    unit_id: id,
    unit_kind: "issue_artifact",
    packet_path: path.join(tmp, `${id}.prompt.md`),
    output_path: path.join(tmp, `${id}.yaml`),
    output_format: "issue-stance-response",
  } as ExecutionDispatchResult;
}

let tmp: string;
let plan: ReviewExecutionPlan;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "onto-ds3-"));
  plan = {
    session_id: "ds3",
    session_root: tmp,
    artifact_generation_realization: "live",
    error_log_path: path.join(tmp, "error-log.md"),
  } as unknown as ReviewExecutionPlan;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const EXECUTOR = { bin: "node", args: ["/dist/unit-executor.js"] };

function stubDispatch(
  outcomes: Array<{ unit_id: string; status: "ok" | "fail"; error?: string }>,
): { impl: DispatchImpl; calls: Parameters<DispatchImpl>[0][] } {
  const calls: Parameters<DispatchImpl>[0][] = [];
  const impl: DispatchImpl = async (args) => {
    calls.push(args);
    return {
      outcomes,
      outer_stdout: "",
      outer_stderr: "",
      outer_exit_code: 0,
      summary_parsed: true,
    };
  };
  return { impl, calls };
}

describe("runNestedStageFirstAttempt — gate", () => {
  it("returns undefined for main-workers, unsupported executors, or fewer than two dispatches", async () => {
    const { impl } = stubDispatch([]);
    const base = {
      stageLabel: "issue-stance",
      projectRoot: tmp,
      sessionRoot: tmp,
      executionPlan: plan,
      executorConfig: EXECUTOR,
      dispatchWidth: 3,
      dispatchImpl: impl,
    };
    const two = [dispatch("a", tmp), dispatch("b", tmp)];

    await expect(
      runNestedStageFirstAttempt({
        ...base,
        dispatches: two,
        reviewExecutionProfile: nestedProfile({ mode: "main-workers" } as never),
      }),
    ).resolves.toBeUndefined();
    await expect(
      runNestedStageFirstAttempt({
        ...base,
        dispatches: two,
        reviewExecutionProfile: nestedProfile({
          worker_executor: "direct_call",
        } as never),
      }),
    ).resolves.toBeUndefined();
    await expect(
      runNestedStageFirstAttempt({
        ...base,
        dispatches: [dispatch("a", tmp)],
        reviewExecutionProfile: nestedProfile(),
      }),
    ).resolves.toBeUndefined();
    await expect(
      runNestedStageFirstAttempt({ ...base, dispatches: two }),
    ).resolves.toBeUndefined(); // no profile at all
  });
});

describe("runNestedStageFirstAttempt — forwarding", () => {
  it("dispatches one labeled batch with clamped width, scaled timeout, and profile outer config", async () => {
    const dispatches = [dispatch("issue-stance:logic", tmp), dispatch("issue-stance:coverage", tmp), dispatch("issue-stance:axiology", tmp)];
    const stub = stubDispatch([
      { unit_id: "issue-stance:logic", status: "ok" },
      { unit_id: "issue-stance:coverage", status: "fail", error: "exit=1 size=0" },
      { unit_id: "issue-stance:axiology", status: "ok" },
    ]);

    const attempt = await runNestedStageFirstAttempt({
      stageLabel: "issue-stance",
      projectRoot: tmp,
      sessionRoot: tmp,
      executionPlan: plan,
      executorConfig: EXECUTOR,
      dispatches,
      dispatchWidth: 2,
      unitTimeoutMs: 100_000,
      reviewExecutionProfile: nestedProfile(),
      dispatchImpl: stub.impl,
    });

    expect(stub.calls).toHaveLength(1);
    const call = stub.calls[0]!;
    expect(call.brand).toBe("codex");
    expect(call.stream_label).toBe("issue-stance");
    expect(call.dispatch_width).toBe(2);
    // ceil(3/2)=2 waves × 100s + 60s outer margin.
    expect(call.timeout_ms).toBe(260_000);
    expect(call.outer_config).toEqual({
      model: "gpt-5.5",
      effort: "high",
    });
    expect(call.units.map((u) => u.unit_id)).toEqual([
      "issue-stance:logic",
      "issue-stance:coverage",
      "issue-stance:axiology",
    ]);
    expect(call.units[0]!.extra_args).toEqual([
      "--output-format",
      "issue-stance-response",
    ]);

    expect(attempt).toBeDefined();
    expect(attempt!.byUnitId.get("issue-stance:logic")).toEqual({ ok: true });
    expect(attempt!.byUnitId.get("issue-stance:coverage")).toEqual({
      ok: false,
      error: "exit=1 size=0",
    });
  });

  it("maps claude_code worker_executor to the claude brand", async () => {
    const stub = stubDispatch([]);
    await runNestedStageFirstAttempt({
      stageLabel: "synthesis",
      projectRoot: tmp,
      sessionRoot: tmp,
      executionPlan: plan,
      executorConfig: EXECUTOR,
      dispatches: [dispatch("a", tmp), dispatch("b", tmp)],
      dispatchWidth: 4,
      reviewExecutionProfile: nestedProfile({
        worker_executor: "claude_code",
      } as never),
      dispatchImpl: stub.impl,
    });
    expect(stub.calls[0]!.brand).toBe("claude");
    // Width clamps to the dispatch count.
    expect(stub.calls[0]!.dispatch_width).toBe(2);
  });
});

describe("unitOutcomeWithNestedFirstAttempt", () => {
  function flatArgs(d: ExecutionDispatchResult, maxRetries = 2) {
    return {
      projectRoot: tmp,
      sessionRoot: tmp,
      executionPlan: plan,
      executorConfig: EXECUTOR,
      dispatch: d,
      maxRetries,
      retryInitialDelayMs: 1,
    };
  }

  function captureFlat(result?: Partial<ExecutionOutcome>) {
    const calls: Array<Parameters<typeof unitOutcomeWithNestedFirstAttempt>[0]["flat"]> = [];
    const runFlat = async (
      args: Parameters<typeof unitOutcomeWithNestedFirstAttempt>[0]["flat"],
    ): Promise<ExecutionOutcome> => {
      calls.push(args);
      return {
        dispatch: args.dispatch,
        success: true,
        startedAtMs: 1,
        completedAtMs: 2,
        attemptCount: 1,
        packetBytes: null,
        outputBytes: null,
        ...result,
      } as ExecutionOutcome;
    };
    return { calls, runFlat };
  }

  it("falls through to the flat loop with the full budget when there is no batch", async () => {
    const d = dispatch("a", tmp);
    const { calls, runFlat } = captureFlat();
    await unitOutcomeWithNestedFirstAttempt({
      batch: undefined,
      flat: flatArgs(d),
      runFlat,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.maxRetriesOverride).toBeUndefined();
  });

  it("returns a success outcome from a batch-ok unit without calling flat", async () => {
    const d = dispatch("a", tmp);
    await fs.writeFile(d.output_path, "seat\n", "utf8");
    const { calls, runFlat } = captureFlat();
    const outcome = await unitOutcomeWithNestedFirstAttempt({
      batch: {
        byUnitId: new Map([["a", { ok: true }]]),
        startedAtMs: 10,
        completedAtMs: 20,
      },
      flat: flatArgs(d),
      runFlat,
    });
    expect(calls).toHaveLength(0);
    expect(outcome.success).toBe(true);
    expect(outcome.attemptCount).toBe(1);
    expect(outcome.startedAtMs).toBe(10);
    expect(outcome.completedAtMs).toBe(20);
    expect(outcome.outputBytes).toBe(5);
  });

  it("spends the remaining budget flat after a batch failure", async () => {
    const d = dispatch("a", tmp);
    const { calls, runFlat } = captureFlat();
    await unitOutcomeWithNestedFirstAttempt({
      batch: {
        byUnitId: new Map([["a", { ok: false, error: "exit=1 size=0" }]]),
        startedAtMs: 10,
        completedAtMs: 20,
      },
      flat: flatArgs(d, 2),
      runFlat,
    });
    expect(calls).toHaveLength(1);
    // Batch consumed attempt #1 of 3 (maxRetries=2) → 1 retry + 1 attempt left.
    expect(calls[0]!.maxRetriesOverride).toBe(1);
  });

  it("finalizes the batch failure under an explicit zero-retry policy (exactly one attempt)", async () => {
    const d = dispatch("a", tmp);
    await fs.writeFile(d.output_path, "partial\n", "utf8");
    const { calls, runFlat } = captureFlat();
    const outcome = await unitOutcomeWithNestedFirstAttempt({
      batch: {
        byUnitId: new Map([["a", { ok: false, error: "exit=1 size=0" }]]),
        startedAtMs: 10,
        completedAtMs: 20,
      },
      flat: flatArgs(d, 0),
      runFlat,
    });
    expect(calls).toHaveLength(0);
    expect(outcome.success).toBe(false);
    expect(outcome.attemptCount).toBe(1);
    expect(outcome.failure?.message).toBe("exit=1 size=0");
    // Partial seat removed; failure recorded in the error log.
    await expect(fs.access(d.output_path)).rejects.toThrow();
    const log = await fs.readFile(plan.error_log_path, "utf8");
    expect(log).toContain("issue_artifact failure: a");
  });

  it("treats a unit absent from the batch (e.g. preserved-unit subset) as flat with full budget", async () => {
    const d = dispatch("not-in-batch", tmp);
    const { calls, runFlat } = captureFlat();
    await unitOutcomeWithNestedFirstAttempt({
      batch: {
        byUnitId: new Map([["other", { ok: true }]]),
        startedAtMs: 10,
        completedAtMs: 20,
      },
      flat: flatArgs(d),
      runFlat,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.maxRetriesOverride).toBeUndefined();
  });
});
