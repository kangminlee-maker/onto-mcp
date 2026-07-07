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
  executeIssueStanceUnit,
  recordNestedUnitOutcomeToBreaker,
  runNestedStageFirstAttempt,
  unitOutcomeWithNestedFirstAttempt,
  type ExecutionDispatchResult,
  type ExecutionOutcome,
} from "./run-review-prompt-execution.js";
import { DispatchBreakerState } from "../llm/dispatch-breaker.js";
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
    // Per-unit self-timeout rides in the executor args (the script has no
    // per-unit kill switch) — same value the wave scaling uses.
    expect(call.units[0]!.extra_args).toEqual([
      "--output-format",
      "issue-stance-response",
      "--timeout-ms",
      "100000",
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
    // §4-1: batch-window success carries the tag so a breaker records it as
    // skipped (completed, no streak reset), not as an observed dispatch.
    expect(outcome.nestedBatchWindow).toBe(true);
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
    // §4-1: a zero-retry batch-window failure is a batch-window outcome too —
    // tagged so a breaker records it skipped (budget cap), never streak fuel.
    expect(outcome.nestedBatchWindow).toBe(true);
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

  it("§4-1: flat-dispatch outcomes are not tagged nestedBatchWindow (breaker records them as real dispatches)", async () => {
    // Batch failed for this unit but budget remains → real flat retry.
    const flat = await unitOutcomeWithNestedFirstAttempt({
      batch: {
        byUnitId: new Map([["a", { ok: false, error: "exit=1 size=0" }]]),
        startedAtMs: 10,
        completedAtMs: 20,
      },
      flat: flatArgs(dispatch("a", tmp), 2),
      runFlat: captureFlat().runFlat,
    });
    expect(flat.nestedBatchWindow).toBeUndefined();

    // Unit absent from the batch → flat with full budget.
    const notInBatch = await unitOutcomeWithNestedFirstAttempt({
      batch: {
        byUnitId: new Map([["other", { ok: true }]]),
        startedAtMs: 10,
        completedAtMs: 20,
      },
      flat: flatArgs(dispatch("solo", tmp)),
      runFlat: captureFlat().runFlat,
    });
    expect(notInBatch.nestedBatchWindow).toBeUndefined();
  });
});

describe("recordNestedUnitOutcomeToBreaker (§4-1 nested breaker coverage)", () => {
  const breakerPolicy = {
    enabled: true,
    systemic_threshold: 3,
    per_call_max_attempts: 3,
    backoff_initial_ms: 100,
    backoff_cap_ms: 400,
  };
  const oc = (
    unitId: string,
    fields: Partial<ExecutionOutcome> & { success: boolean },
  ): ExecutionOutcome =>
    ({
      dispatch: { unit_id: unitId } as ExecutionDispatchResult,
      startedAtMs: 0,
      completedAtMs: 1,
      attemptCount: 1,
      ...fields,
    }) as ExecutionOutcome;
  const systemicFail = (unitId: string): ExecutionOutcome =>
    oc(unitId, {
      success: false,
      failure: { message: "status=429" } as ExecutionOutcome["failure"],
    });

  it("a batch-window success does NOT reset a systemic streak (still trips)", () => {
    const breaker = new DispatchBreakerState(breakerPolicy);
    expect(recordNestedUnitOutcomeToBreaker(breaker, systemicFail("a"))).toBeNull();
    expect(recordNestedUnitOutcomeToBreaker(breaker, systemicFail("b"))).toBeNull();
    // Interleaved batch-window success (no observed dispatch) → skipped: the
    // pending outage victims are NOT poison-flushed and the streak is intact.
    expect(
      recordNestedUnitOutcomeToBreaker(
        breaker,
        oc("ok", { success: true, nestedBatchWindow: true }),
      ),
    ).toBeNull();
    expect(breaker.deadLetterEntries()).toEqual([]);
    // The third systemic failure crosses the threshold → trips.
    const trip = recordNestedUnitOutcomeToBreaker(breaker, systemicFail("c"));
    expect(trip).toMatchObject({
      failure_class: "rate_limit",
      consecutive_item_count: 3,
    });
  });

  it("contrast control: a REAL flat success DOES reset the streak (the tag is the difference)", () => {
    const breaker = new DispatchBreakerState(breakerPolicy);
    recordNestedUnitOutcomeToBreaker(breaker, systemicFail("a"));
    recordNestedUnitOutcomeToBreaker(breaker, systemicFail("b"));
    // An untagged flat success → recordItemSuccess → poison-flush + streak reset.
    recordNestedUnitOutcomeToBreaker(breaker, oc("ok", { success: true }));
    expect(breaker.deadLetterEntries().map((e) => e.item_id)).toEqual(["a", "b"]);
    // Streak restarted: one more systemic failure does not trip at N=3.
    expect(recordNestedUnitOutcomeToBreaker(breaker, systemicFail("c"))).toBeNull();
    expect(breaker.tripped()).toBeNull();
  });

  it("a zero-retry batch-window failure is skipped (completed, not streak fuel)", () => {
    const breaker = new DispatchBreakerState(breakerPolicy);
    recordNestedUnitOutcomeToBreaker(breaker, systemicFail("a"));
    recordNestedUnitOutcomeToBreaker(breaker, systemicFail("b"));
    expect(
      recordNestedUnitOutcomeToBreaker(
        breaker,
        oc("zb", {
          success: false,
          nestedBatchWindow: true,
          failure: { message: "status=429" } as ExecutionOutcome["failure"],
        }),
      ),
    ).toBeNull();
    // The batch-window failure did not advance the streak: 2 pending, no trip.
    expect(breaker.tripped()).toBeNull();
    // …but it is completed for the recovery set (excluded from incomplete).
    expect(breaker.completedItemIds()).toContain("zb");
  });
});

describe("executeIssueStanceUnit — batch-ok then validation failure (§4-1 tag strip)", () => {
  let tmp: string;
  let plan: ReviewExecutionPlan;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "onto-ds3-vf-"));
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

  it("drops nestedBatchWindow on a validation failure so the breaker records it as a failure, not a skip", async () => {
    const d = dispatch("issue-stance:x", tmp);
    // Batch reports ok, but no valid stance response exists on disk → the
    // runner's on-disk validation throws (readYamlDocument ENOENT). The
    // re-emitted failure must NOT carry the batch-window tag (F1 fix), else a
    // directly-observed validation failure would be mis-recorded as skipped.
    const outcome = await executeIssueStanceUnit({
      ctx: {
        projectRoot: tmp,
        sessionRoot: tmp,
        executionPlan: plan,
        executorConfig: { bin: "node", args: [] },
        retryPolicy: { issueArtifactMaxRetries: 2, retryInitialDelayMs: 1 },
      } as unknown as Parameters<typeof executeIssueStanceUnit>[0]["ctx"],
      dispatch: d,
      participatingLensIds: ["x"],
      nestedBatch: {
        byUnitId: new Map([[d.unit_id, { ok: true }]]),
        startedAtMs: 10,
        completedAtMs: 20,
      },
    });
    expect(outcome.success).toBe(false);
    expect(outcome.nestedBatchWindow).toBeUndefined();
    // Contrast: routed through the breaker, an untagged failure is real fuel.
    const breaker = new DispatchBreakerState({
      enabled: true,
      systemic_threshold: 3,
      per_call_max_attempts: 3,
      backoff_initial_ms: 100,
      backoff_cap_ms: 400,
    });
    recordNestedUnitOutcomeToBreaker(breaker, outcome);
    // Validation failure is item-local (null class) → dead-letter, not completed-skip.
    expect(breaker.deadLetterEntries().map((e) => e.item_id)).toEqual([d.unit_id]);
    expect(breaker.completedItemIds()).not.toContain(d.unit_id);
  });
});
