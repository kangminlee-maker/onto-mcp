import { describe, expect, it } from "vitest";
import {
  DispatchBreakerState,
  DispatchBreakerTrippedError,
  buildDispatchIncompleteArtifact,
  classifyDispatchError,
  classifySystemicDispatchFailure,
  dispatchBackoffDelayMs,
  readDispatchFailureClass,
  runWithDispatchBackoff,
  type DispatchBreakerPolicy,
} from "./dispatch-breaker.js";

function incompleteOf(state: DispatchBreakerState, planned: string[]) {
  return buildDispatchIncompleteArtifact({
    pipeline: "test",
    batchLabel: "unit",
    createdAt: "2026-07-05T00:00:00Z",
    plannedItemIds: planned,
    state,
  });
}

const policy = (overrides: Partial<DispatchBreakerPolicy> = {}): DispatchBreakerPolicy => ({
  enabled: true,
  systemic_threshold: 3,
  per_call_max_attempts: 3,
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
    // Provider capacity shedding (codex/openai refusal observed live
    // 2026-07-18) — systemic rate_limit class, same as "overloaded".
    expect(
      classifySystemicDispatchFailure(
        "ERROR: Selected model is at capacity. Please try a different model.",
      ),
    ).toBe("rate_limit");
    expect(
      classifySystemicDispatchFailure("You've hit your usage limit."),
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
    expect(incompleteOf(state, ["a", "b", "c"]).incomplete_item_ids).toEqual([
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
    expect(incompleteOf(state, ["a", "b"]).incomplete_item_ids).toEqual([]);
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
    // Disabled breaker still keeps outage victims OUT of dead-letter.
    expect(incompleteOf(state, ["a", "b", "c", "d"]).incomplete_item_ids).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("a SKIP neither flushes pending systemic failures nor resets the streak", () => {
    const state = new DispatchBreakerState(policy());
    state.recordItemFailure(systemicEntry("a"));
    // Structural skip: no dispatch happened — proves nothing about the lane.
    state.recordItemSkipped("b");
    expect(state.deadLetterEntries()).toEqual([]);
    expect(state.recordItemFailure(systemicEntry("c"))).toBeNull();
    const trip = state.recordItemFailure(systemicEntry("d"));
    expect(trip?.consecutive_item_count).toBe(3);
    const artifact = incompleteOf(state, ["a", "b", "c", "d"]);
    expect(artifact.completed_item_ids).toEqual(["b"]);
    expect(artifact.incomplete_item_ids).toEqual(["a", "c", "d"]);
  });

  it("attribution freezes at trip: a late in-flight success must not poison the outage victims (concurrent pools)", () => {
    // 리뷰 lens/stance 풀은 동시 실행이라 트립 결정 뒤에 in-flight 성공이
    // 도착할 수 있다 — 그 성공이 pending 피해 유닛을 poison으로 재분류하면
    // 회복 집합(incomplete)에서 유실된다 (규칙 5 위반 회귀 가드).
    const state = new DispatchBreakerState(policy());
    state.recordItemFailure(systemicEntry("a"));
    state.recordItemFailure(systemicEntry("b"));
    const trip = state.recordItemFailure(systemicEntry("c"));
    expect(trip).not.toBeNull();
    state.recordItemSuccess("d");
    expect(state.deadLetterEntries()).toEqual([]);
    const artifact = incompleteOf(state, ["a", "b", "c", "d", "e"]);
    expect(artifact.completed_item_ids).toEqual(["d"]);
    // 피해 3 + 미디스패치 1 전부 회복 집합에 남는다.
    expect(artifact.incomplete_item_ids).toEqual(["a", "b", "c", "e"]);
  });

  it("the first threshold crossing is the trip authority: post-trip failures join the victims without rewriting the trip", () => {
    const state = new DispatchBreakerState(policy());
    state.recordItemFailure(systemicEntry("a"));
    state.recordItemFailure(systemicEntry("b"));
    const trip = state.recordItemFailure(systemicEntry("c"));
    expect(trip?.consecutive_item_count).toBe(3);
    // 트립 뒤 도착한 in-flight 계통 실패: 트립 상태는 불변, 피해로 귀속.
    expect(state.recordItemFailure(systemicEntry("d"))).toBeNull();
    expect(state.tripped()).toEqual(trip);
    const artifact = incompleteOf(state, ["a", "b", "c", "d"]);
    expect(artifact.incomplete_item_ids).toEqual(["a", "b", "c", "d"]);
    expect(artifact.breaker.consecutive_item_count).toBe(3);
  });
});

describe("DispatchBreakerState — concurrent mode determinism (F1)", () => {
  const systemic = (itemId: string) => ({
    item_id: itemId,
    failure_class: "rate_limit" as const,
    failure_message: "status=429",
    attempt_count: 3,
  });
  // Replay a sequence of item events against a fresh breaker and project the
  // recovery classification (order-sensitivity is exactly what F1 is about).
  const replay = (concurrent: boolean, seq: Array<["fail" | "ok", string]>) => {
    const state = new DispatchBreakerState(policy({ concurrent }));
    for (const [kind, item] of seq) {
      if (kind === "ok") state.recordItemSuccess(item);
      else state.recordItemFailure(systemic(item));
    }
    const planned = [...new Set(seq.map(([, item]) => item))];
    return {
      tripped: state.tripped() !== null,
      deadLetter: state.deadLetterEntries().map((e) => e.item_id).sort(),
      completed: [...state.completedItemIds()].sort(),
      incomplete: incompleteOf(state, planned).incomplete_item_ids.slice().sort(),
    };
  };
  // Same outcome SET (a/b/c systemic-fail, d succeeds); two completion orders.
  const orderA: Array<["fail" | "ok", string]> = [
    ["fail", "a"], ["fail", "b"], ["fail", "c"], ["ok", "d"],
  ];
  const orderB: Array<["fail" | "ok", string]> = [
    ["fail", "a"], ["fail", "b"], ["ok", "d"], ["fail", "c"],
  ];

  it("concurrent mode: trip and classification are identical regardless of completion order", () => {
    const a = replay(true, orderA);
    const b = replay(true, orderB);
    expect(a).toEqual(b);
    expect(a.tripped).toBe(true);
    expect(a.incomplete).toEqual(["a", "b", "c"]);
    expect(a.deadLetter).toEqual([]);
  });

  it("contrast (default/non-concurrent): completion order changes the verdict — the F1 order-sensitivity concurrent mode removes", () => {
    const a = replay(false, orderA);
    const b = replay(false, orderB);
    expect(a).not.toEqual(b);
    // order A: c crosses the threshold before d's success → trip; a/b/c incomplete.
    expect(a.tripped).toBe(true);
    expect(a.incomplete).toEqual(["a", "b", "c"]);
    // order B: d's pre-trip success flushes a/b to poison dead-letter → no trip; only c incomplete.
    expect(b.tripped).toBe(false);
    expect(b.deadLetter).toEqual(["a", "b"]);
    expect(b.incomplete).toEqual(["c"]);
  });

  it("concurrent mode: a MIXED-class systemic burst has an order-independent trip decision, count, and recovery set (failure_class label is best-effort, not asserted)", () => {
    const failWith = (
      item: string,
      cls: "rate_limit" | "auth" | "transport",
    ) => ({ item_id: item, failure_class: cls, failure_message: `${cls} fail`, attempt_count: 3 });
    // Recovery-RELEVANT verdict only — deliberately excludes failure_class,
    // which the trip labels from whichever class crossed the early threshold
    // prefix (best-effort, not a determinism guarantee).
    const verdict = (seq: Array<[string, "rate_limit" | "auth" | "transport"]>) => {
      const state = new DispatchBreakerState(policy({ concurrent: true }));
      for (const [item, cls] of seq) state.recordItemFailure(failWith(item, cls));
      const planned = [...new Set(seq.map(([item]) => item))];
      return {
        tripped: state.tripped() !== null,
        count: state.tripped()?.consecutive_item_count ?? null,
        deadLetter: state.deadLetterEntries().map((e) => e.item_id).sort(),
        completed: [...state.completedItemIds()].sort(),
        incomplete: incompleteOf(state, planned).incomplete_item_ids.slice().sort(),
      };
    };
    // Same mixed set {a:auth, b:auth, c:transport, d:transport}, threshold 3, two orders.
    const v1 = verdict([["a", "auth"], ["b", "auth"], ["c", "transport"], ["d", "transport"]]);
    const v2 = verdict([["c", "transport"], ["d", "transport"], ["a", "auth"], ["b", "auth"]]);
    expect(v1).toEqual(v2);
    expect(v1.tripped).toBe(true);
    expect(v1.count).toBe(3);
    // All systemic victims stay pending (never flushed) → all in the recovery set.
    expect(v1.incomplete).toEqual(["a", "b", "c", "d"]);
    expect(v1.deadLetter).toEqual([]);
  });
});

describe("classifyDispatchError / dispatch markers", () => {
  it("prefers structured provider status over message text", () => {
    expect(
      classifyDispatchError(Object.assign(new Error("provider exploded"), { status: 429 })),
    ).toBe("rate_limit");
    expect(
      classifyDispatchError(Object.assign(new Error("x"), { status: 401 })),
    ).toBe("auth");
    expect(
      classifyDispatchError(Object.assign(new Error("x"), { status: 503 })),
    ).toBe("transport");
  });

  it("stage-local errors are never breaker fuel: unmarked errors read null even when text looks systemic", () => {
    const error = new Error("semantic-map stage: trace node missing for S#4:429-431.");
    expect(readDispatchFailureClass(error)).toBeNull();
  });

  it("runWithDispatchBackoff marks final errors with their dispatch class (timeout → transport)", async () => {
    let caught: unknown;
    try {
      await runWithDispatchBackoff({
        label: "node:a",
        policy: policy(),
        dispatch: async () => {
          throw new Error("claude CLI call timed out after 600000ms");
        },
        sleep: async () => {},
      });
    } catch (error) {
      caught = error;
    }
    expect(readDispatchFailureClass(caught)).toBe("transport");
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
        attempt_count: policy().per_call_max_attempts,
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
