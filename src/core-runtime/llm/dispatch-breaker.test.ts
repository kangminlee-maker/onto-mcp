import { describe, expect, it } from "vitest";
import {
  DispatchBreakerState,
  DispatchBreakerTrippedError,
  buildDispatchIncompleteArtifact,
  classifySystemicDispatchFailure,
  dispatchBackoffDelayMs,
  runWithDispatchBackoff,
  type DispatchBreakerPolicy,
} from "./dispatch-breaker.js";

const policy = (overrides: Partial<DispatchBreakerPolicy> = {}): DispatchBreakerPolicy => ({
  enabled: true,
  systemic_threshold: 3,
  per_item_max_attempts: 3,
  backoff_initial_ms: 100,
  backoff_cap_ms: 400,
  ...overrides,
});

describe("classifySystemicDispatchFailure", () => {
  it("classifies real adapter message shapes", () => {
    expect(
      classifySystemicDispatchFailure(
        'anthropic call FAILED: model="claude-test" status=429 type=RateLimitError message=...',
      ),
    ).toBe("rate_limit");
    expect(
      classifySystemicDispatchFailure("You have hit your session limit for opus"),
    ).toBe("rate_limit");
    expect(
      classifySystemicDispatchFailure(
        '[model-call] claude call FAILED: exit_code=1 message="claude: not logged in"',
      ),
    ).toBe("auth");
    expect(
      classifySystemicDispatchFailure("stream disconnected before completion"),
    ).toBe("transport");
  });

  it("returns null for item-local failures and empty input", () => {
    expect(
      classifySystemicDispatchFailure(
        "MaturationValueReadLocation author returned invalid JSON and repair failed",
      ),
    ).toBeNull();
    expect(
      classifySystemicDispatchFailure(
        "submit_issue_stance_response.stances[0].evidence_refs contains unsupported ref for issue-001: x",
      ),
    ).toBeNull();
    expect(classifySystemicDispatchFailure("")).toBeNull();
    expect(classifySystemicDispatchFailure(undefined)).toBeNull();
  });
});

describe("dispatchBackoffDelayMs", () => {
  it("grows exponentially from initial and respects the cap", () => {
    const base = { initialMs: 100, capMs: 450 };
    expect(dispatchBackoffDelayMs({ attempt: 0, ...base })).toBe(100);
    expect(dispatchBackoffDelayMs({ attempt: 1, ...base })).toBe(200);
    expect(dispatchBackoffDelayMs({ attempt: 2, ...base })).toBe(400);
    expect(dispatchBackoffDelayMs({ attempt: 3, ...base })).toBe(450);
    expect(dispatchBackoffDelayMs({ attempt: 60, ...base })).toBe(450);
  });
});

describe("DispatchBreakerState", () => {
  const systemicEntry = (itemId: string) => ({
    item_id: itemId,
    failure_class: "rate_limit" as const,
    failure_message: "status=429",
    attempt_count: 3,
  });

  it("trips at N consecutive distinct systemic items and keeps them out of dead-letter", () => {
    const state = new DispatchBreakerState(policy());
    expect(state.recordItemFailure(systemicEntry("a"))).toBeNull();
    expect(state.recordItemFailure(systemicEntry("b"))).toBeNull();
    const trip = state.recordItemFailure(systemicEntry("c"));
    expect(trip).toEqual({
      failure_class: "rate_limit",
      consecutive_item_count: 3,
      threshold: 3,
    });
    // Outage victims are recovery targets, not complete-with-failure.
    expect(state.deadLetterEntries()).toEqual([]);
    expect(state.pendingSystemicEntries().map((entry) => entry.item_id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("a success boundary reclassifies pending systemic failures as poison dead-letters", () => {
    const state = new DispatchBreakerState(policy());
    state.recordItemFailure(systemicEntry("a"));
    state.recordItemSuccess("b");
    expect(state.deadLetterEntries().map((entry) => entry.item_id)).toEqual(["a"]);
    expect(state.pendingSystemicEntries()).toEqual([]);
    // Streak restarted: two more systemic failures do not trip at N=3.
    expect(state.recordItemFailure(systemicEntry("c"))).toBeNull();
    expect(state.recordItemFailure(systemicEntry("d"))).toBeNull();
    expect(state.tripped()).toBeNull();
  });

  it("item-local failures dead-letter immediately and do not feed or reset the streak", () => {
    const state = new DispatchBreakerState(policy());
    state.recordItemFailure(systemicEntry("a"));
    state.recordItemFailure({
      item_id: "b",
      failure_class: null,
      failure_message: "invalid JSON",
      attempt_count: 1,
    });
    state.recordItemFailure(systemicEntry("c"));
    const trip = state.recordItemFailure(systemicEntry("d"));
    expect(state.deadLetterEntries().map((entry) => entry.item_id)).toEqual(["b"]);
    expect(trip?.consecutive_item_count).toBe(3);
  });

  it("dedupes repeated final failures of the same item and never trips when disabled", () => {
    const state = new DispatchBreakerState(policy({ enabled: false }));
    state.recordItemFailure(systemicEntry("a"));
    state.recordItemFailure(systemicEntry("a"));
    state.recordItemFailure(systemicEntry("b"));
    state.recordItemFailure(systemicEntry("c"));
    state.recordItemFailure(systemicEntry("d"));
    expect(state.tripped()).toBeNull();
    expect(state.pendingSystemicEntries()).toHaveLength(4);
  });
});

describe("runWithDispatchBackoff + DispatchBreakerState", () => {
  it("retries systemic failures with capped exponential backoff, then succeeds", async () => {
    const delays: number[] = [];
    let calls = 0;
    const value = await runWithDispatchBackoff({
      label: "node:a",
      policy: policy(),
      dispatch: async () => {
        calls += 1;
        if (calls < 3) throw new Error("status=429 rate limit");
        return "ok";
      },
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    expect(value).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([100, 200]);
  });

  it("does not transport-retry item-local failures (their semantics own retries)", async () => {
    let calls = 0;
    await expect(
      runWithDispatchBackoff({
        label: "node:a",
        policy: policy(),
        dispatch: async () => {
          calls += 1;
          throw new Error("author returned invalid JSON and repair failed");
        },
        sleep: async () => {},
      }),
    ).rejects.toThrow("invalid JSON");
    expect(calls).toBe(1);
  });

  it("F-B1 shape: a dead limit trips after exactly N items x per-item cap dispatches", async () => {
    const state = new DispatchBreakerState(policy());
    let totalDispatches = 0;
    const failing = () => {
      totalDispatches += 1;
      return Promise.reject(new Error("status=429 too many requests"));
    };
    const finalFailure = async (itemId: string) => {
      let message = "";
      try {
        await runWithDispatchBackoff({
          label: itemId,
          policy: policy(),
          dispatch: failing,
          sleep: async () => {},
        });
      } catch (error) {
        message = (error as Error).message;
      }
      return state.recordItemFailure({
        item_id: itemId,
        failure_class: classifySystemicDispatchFailure(message),
        failure_message: message,
        attempt_count: policy().per_item_max_attempts,
      });
    };
    expect(await finalFailure("a")).toBeNull();
    expect(await finalFailure("b")).toBeNull();
    const trip = await finalFailure("c");
    expect(trip?.failure_class).toBe("rate_limit");
    expect(() => {
      if (trip) throw new DispatchBreakerTrippedError(trip);
    }).toThrow(DispatchBreakerTrippedError);
    // 재시도 폭풍 부재를 수치로: 3 items x 3 attempts, not 208 dispatches.
    expect(totalDispatches).toBe(9);
  });
});

describe("buildDispatchIncompleteArtifact", () => {
  it("computes the exact recovery set: planned minus completed minus dead-lettered", async () => {
    const state = new DispatchBreakerState(policy());
    state.recordItemSuccess("done-1");
    state.recordItemFailure({
      item_id: "poison-1",
      failure_class: null,
      failure_message: "invalid JSON",
      attempt_count: 1,
    });
    state.recordItemFailure({
      item_id: "victim-1",
      failure_class: "rate_limit",
      failure_message: "429",
      attempt_count: 3,
    });
    const artifact = buildDispatchIncompleteArtifact({
      pipeline: "reconstruct",
      batchLabel: "semantic-map",
      createdAt: "2026-07-05T00:00:00Z",
      plannedItemIds: ["done-1", "poison-1", "victim-1", "never-dispatched"],
      state,
    });
    expect(artifact.completed_item_ids).toEqual(["done-1"]);
    expect(artifact.dead_letter.map((entry) => entry.item_id)).toEqual(["poison-1"]);
    expect(artifact.incomplete_item_ids).toEqual(["victim-1", "never-dispatched"]);
    expect(artifact.breaker.tripped).toBe(false);
    expect(artifact.breaker.threshold).toBe(3);
  });
});
