import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canTransition,
  canApplyGlobal,
  canApplyObservational,
  resolveTransition,
  allowedTransitionEvents,
} from "./state-machine.js";
import {
  STATES,
  TERMINAL_STATES,
  TRANSITION_EVENT_TYPES,
  GLOBAL_EVENT_TYPES,
  OBSERVATIONAL_EVENT_TYPES,
} from "./types.js";
import type { Event, State, TransitionEventType } from "./types.js";

// ─── Golden data verification ───

const GOLDEN_PATH = resolve(
  import.meta.dirname,
  "__fixtures__/example-tutor-block/events.ndjson",
);

function readGoldenEvents(): Event[] {
  const content = readFileSync(GOLDEN_PATH, "utf-8").trimEnd();
  return content.split("\n").map((line) => JSON.parse(line) as Event);
}

describe("state-machine — golden data transitions", () => {
  const events = readGoldenEvents();

  it("every golden event transition is allowed by the matrix", () => {
    for (const evt of events) {
      const state = evt.state_before;
      // scope.created: state_before is null → draft
      if (state === null) {
        expect(evt.type).toBe("scope.created");
        continue;
      }

      const result = resolveTransition(state, evt.type);
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        // For conditional transitions, state_after may be the default
        // or one of the conditional targets
        const possibleStates = [
          result.next_state,
          ...(result.conditional_targets ?? []),
        ];
        expect(possibleStates).toContain(evt.state_after);
      }
    }
  });
});

// ─── Exhaustive matrix tests ───

describe("state-machine — transition events exhaustive", () => {
  // For every (state, transitionEvent) combination, verify:
  // - If in matrix → allowed with correct next_state
  // - If not in matrix → denied

  // Expected transitions extracted from event-state-contract.md
  const EXPECTED: Array<{
    state: State;
    event: TransitionEventType;
    next: State;
    kind: "forward" | "self" | "backward";
  }> = [
    // draft
    { state: "draft", event: "input.attached", next: "draft", kind: "self" },
    {
      state: "draft",
      event: "grounding.started",
      next: "draft",
      kind: "self",
    },
    {
      state: "draft",
      event: "grounding.completed",
      next: "grounded",
      kind: "forward",
    },
    {
      state: "draft",
      event: "constraint.discovered",
      next: "draft",
      kind: "self",
    },

    // grounded
    {
      state: "grounded",
      event: "align.proposed",
      next: "align_proposed",
      kind: "forward",
    },
    {
      state: "grounded",
      event: "constraint.discovered",
      next: "grounded",
      kind: "self",
    },
    {
      state: "grounded",
      event: "snapshot.marked_stale",
      next: "grounded",
      kind: "self",
    },
    {
      state: "grounded",
      event: "exploration.started",
      next: "exploring",
      kind: "forward",
    },

    // exploring
    {
      state: "exploring",
      event: "exploration.round_completed",
      next: "exploring",
      kind: "self",
    },
    {
      state: "exploring",
      event: "exploration.phase_transitioned",
      next: "exploring",
      kind: "self",
    },
    {
      state: "exploring",
      event: "align.proposed",
      next: "align_proposed",
      kind: "forward",
    },
    {
      state: "exploring",
      event: "constraint.discovered",
      next: "exploring",
      kind: "self",
    },
    {
      state: "exploring",
      event: "snapshot.marked_stale",
      next: "exploring",
      kind: "self",
    },
    {
      state: "exploring",
      event: "redirect.to_grounding",
      next: "grounded",
      kind: "backward",
    },

    // align_proposed
    {
      state: "align_proposed",
      event: "align.locked",
      next: "align_locked",
      kind: "forward",
    },
    {
      state: "align_proposed",
      event: "align.revised",
      next: "align_proposed",
      kind: "self",
    },
    {
      state: "align_proposed",
      event: "snapshot.marked_stale",
      next: "align_proposed",
      kind: "self",
    },
    {
      state: "align_proposed",
      event: "redirect.to_grounding",
      next: "grounded",
      kind: "backward",
    },

    // align_locked
    {
      state: "align_locked",
      event: "surface.generated",
      next: "surface_iterating",
      kind: "forward",
    },
    {
      state: "align_locked",
      event: "snapshot.marked_stale",
      next: "align_proposed",
      kind: "backward",
    },

    // surface_iterating
    {
      state: "surface_iterating",
      event: "surface.revision_requested",
      next: "surface_iterating",
      kind: "self",
    },
    {
      state: "surface_iterating",
      event: "surface.revision_applied",
      next: "surface_iterating",
      kind: "self",
    },
    {
      state: "surface_iterating",
      event: "surface.confirmed",
      next: "surface_confirmed",
      kind: "forward",
    },
    {
      state: "surface_iterating",
      event: "constraint.discovered",
      next: "surface_iterating",
      kind: "self",
    },
    {
      state: "surface_iterating",
      event: "redirect.to_align",
      next: "align_proposed",
      kind: "backward",
    },
    {
      state: "surface_iterating",
      event: "snapshot.marked_stale",
      next: "surface_iterating",
      kind: "self",
    },

    // surface_confirmed
    {
      state: "surface_confirmed",
      event: "constraint.discovered",
      next: "surface_confirmed",
      kind: "self",
    },
    {
      state: "surface_confirmed",
      event: "constraint.decision_recorded",
      next: "surface_confirmed",
      kind: "self",
    },
    {
      state: "surface_confirmed",
      event: "constraint.clarify_requested",
      next: "surface_confirmed",
      kind: "self",
    },
    {
      state: "surface_confirmed",
      event: "constraint.clarify_resolved",
      next: "surface_confirmed",
      kind: "self",
    },
    {
      state: "surface_confirmed",
      event: "constraint.invalidated",
      next: "surface_confirmed",
      kind: "self",
    },
    {
      state: "surface_confirmed",
      event: "target.locked",
      next: "target_locked",
      kind: "forward",
    },
    {
      state: "surface_confirmed",
      event: "surface.change_required",
      next: "surface_iterating",
      kind: "backward",
    },
    {
      state: "surface_confirmed",
      event: "redirect.to_align",
      next: "align_proposed",
      kind: "backward",
    },
    {
      state: "surface_confirmed",
      event: "snapshot.marked_stale",
      next: "surface_confirmed",
      kind: "self",
    },

    // constraints_resolved
    {
      state: "constraints_resolved",
      event: "constraint.discovered",
      next: "surface_confirmed",
      kind: "backward",
    },
    {
      state: "constraints_resolved",
      event: "constraint.decision_recorded",
      next: "constraints_resolved",
      kind: "self",
    },
    {
      state: "constraints_resolved",
      event: "constraint.invalidated",
      next: "constraints_resolved",
      kind: "self",
    },
    {
      state: "constraints_resolved",
      event: "target.locked",
      next: "target_locked",
      kind: "forward",
    },
    {
      state: "constraints_resolved",
      event: "surface.change_required",
      next: "surface_iterating",
      kind: "backward",
    },
    {
      state: "constraints_resolved",
      event: "redirect.to_align",
      next: "align_proposed",
      kind: "backward",
    },
    {
      state: "constraints_resolved",
      event: "snapshot.marked_stale",
      next: "constraints_resolved",
      kind: "self",
    },

    // target_locked
    {
      state: "target_locked",
      event: "constraint.discovered",
      next: "target_locked",
      kind: "self",
    },
    {
      state: "target_locked",
      event: "compile.started",
      next: "target_locked",
      kind: "self",
    },
    {
      state: "target_locked",
      event: "compile.completed",
      next: "compiled",
      kind: "forward",
    },
    {
      state: "target_locked",
      event: "compile.constraint_gap_found",
      next: "constraints_resolved",
      kind: "backward",
    },
    {
      state: "target_locked",
      event: "snapshot.marked_stale",
      next: "constraints_resolved",
      kind: "backward",
    },

    // compiled
    {
      state: "compiled",
      event: "constraint.discovered",
      next: "compiled",
      kind: "self",
    },
    {
      state: "compiled",
      event: "compile.constraint_gap_found",
      next: "constraints_resolved",
      kind: "backward",
    },
    {
      state: "compiled",
      event: "apply.started",
      next: "compiled",
      kind: "self",
    },
    {
      state: "compiled",
      event: "apply.completed",
      next: "applied",
      kind: "forward",
    },
    {
      state: "compiled",
      event: "apply.decision_gap_found",
      next: "constraints_resolved",
      kind: "backward",
    },
    {
      state: "compiled",
      event: "snapshot.marked_stale",
      next: "grounded",
      kind: "backward",
    },

    // applied
    {
      state: "applied",
      event: "validation.started",
      next: "applied",
      kind: "self",
    },
    {
      state: "applied",
      event: "validation.completed",
      next: "validated",
      kind: "forward",
    },
    {
      state: "applied",
      event: "snapshot.marked_stale",
      next: "applied",
      kind: "self",
    },

    // validated
    {
      state: "validated",
      event: "scope.closed",
      next: "closed",
      kind: "forward",
    },
  ];

  for (const { state, event, next, kind } of EXPECTED) {
    it(`${state} + ${event} → ${next} (${kind})`, () => {
      const result = canTransition(state, event);
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.next_state).toBe(next);
        expect(result.kind).toBe(kind);
      }
    });
  }

  // Verify that unlisted combinations are denied
  it("denies all unlisted (state, transitionEvent) combinations", () => {
    const allowedSet = new Set(
      EXPECTED.map((e) => `${e.state}|${e.event}`),
    );

    for (const state of STATES) {
      for (const event of TRANSITION_EVENT_TYPES) {
        const key = `${state}|${event}`;
        const result = canTransition(state, event);
        if (allowedSet.has(key)) {
          expect(result.allowed).toBe(true);
        } else {
          expect(result.allowed).toBe(false);
        }
      }
    }
  });
});

// ─── Global events ───

describe("state-machine — global events", () => {
  const nonTerminalStates = STATES.filter((s) => !TERMINAL_STATES.has(s));

  for (const globalEvent of GLOBAL_EVENT_TYPES) {
    for (const state of nonTerminalStates) {
      it(`${state} + ${globalEvent} → allowed`, () => {
        const result = canApplyGlobal(state, globalEvent);
        expect(result.allowed).toBe(true);
        if (result.allowed) {
          const expected =
            globalEvent === "scope.deferred" ? "deferred" : "rejected";
          expect(result.next_state).toBe(expected);
        }
      });
    }

    for (const terminal of ["closed", "deferred", "rejected"] as State[]) {
      it(`${terminal} + ${globalEvent} → denied`, () => {
        const result = canApplyGlobal(terminal, globalEvent);
        expect(result.allowed).toBe(false);
      });
    }
  }
});

// ─── Observational events ───

describe("state-machine — observational events", () => {
  const nonTerminalStates = STATES.filter((s) => !TERMINAL_STATES.has(s));

  for (const obsEvent of OBSERVATIONAL_EVENT_TYPES) {
    for (const state of nonTerminalStates) {
      it(`${state} + ${obsEvent} → allowed (no state change)`, () => {
        const result = canApplyObservational(state, obsEvent);
        expect(result.allowed).toBe(true);
        if (result.allowed) {
          expect(result.next_state).toBe(state);
        }
      });
    }

    for (const terminal of ["closed", "deferred", "rejected"] as State[]) {
      it(`${terminal} + ${obsEvent} → denied`, () => {
        const result = canApplyObservational(terminal, obsEvent);
        expect(result.allowed).toBe(false);
      });
    }
  }
});

// ─── resolveTransition unified ───

describe("state-machine — resolveTransition", () => {
  it("routes global events correctly", () => {
    const r = resolveTransition("draft", "scope.deferred");
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.next_state).toBe("deferred");
  });

  it("routes observational events correctly", () => {
    const r = resolveTransition("align_proposed", "feedback.classified");
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.next_state).toBe("align_proposed");
  });

  it("routes transition events correctly", () => {
    const r = resolveTransition("draft", "grounding.completed");
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.next_state).toBe("grounded");
  });

  it("denies invalid transition", () => {
    const r = resolveTransition("draft", "align.locked");
    expect(r.allowed).toBe(false);
  });
});

// ─── Additional edge cases ───

describe("state-machine — terminal states edge cases", () => {
  it("allowedTransitionEvents returns empty array for all terminal states", () => {
    for (const terminal of ["closed", "deferred", "rejected"] as State[]) {
      const events = allowedTransitionEvents(terminal);
      expect(events).toEqual([]);
    }
  });
});

describe("state-machine — resolveTransition conditional targets", () => {
  it("surface_confirmed + constraint.decision_recorded has conditional target constraints_resolved", () => {
    const result = resolveTransition("surface_confirmed", "constraint.decision_recorded");
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.next_state).toBe("surface_confirmed");
      expect(result.conditional_targets).toContain("constraints_resolved");
    }
  });

  it("surface_confirmed + constraint.clarify_resolved has conditional target constraints_resolved", () => {
    const result = resolveTransition("surface_confirmed", "constraint.clarify_resolved");
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.next_state).toBe("surface_confirmed");
      expect(result.conditional_targets).toContain("constraints_resolved");
    }
  });

  it("surface_confirmed + constraint.invalidated has conditional target constraints_resolved", () => {
    const result = resolveTransition("surface_confirmed", "constraint.invalidated");
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.next_state).toBe("surface_confirmed");
      expect(result.conditional_targets).toContain("constraints_resolved");
    }
  });

  it("applied + validation.completed has conditional targets constraints_resolved and grounded", () => {
    const result = resolveTransition("applied", "validation.completed");
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.next_state).toBe("validated");
      expect(result.conditional_targets).toContain("constraints_resolved");
      expect(result.conditional_targets).toContain("grounded");
    }
  });

  it("transitions without conditional return no conditional_targets", () => {
    const result = resolveTransition("draft", "grounding.completed");
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.conditional_targets).toBeUndefined();
    }
  });
});

describe("state-machine — observational events exhaustive non-terminal verification", () => {
  const nonTerminalStates = STATES.filter((s) => !TERMINAL_STATES.has(s));

  it("every observational event is allowed from every non-terminal state", () => {
    for (const state of nonTerminalStates) {
      for (const obsEvent of OBSERVATIONAL_EVENT_TYPES) {
        const result = resolveTransition(state, obsEvent);
        expect(
          result.allowed,
          `${state} + ${obsEvent} should be allowed`,
        ).toBe(true);
        if (result.allowed) {
          expect(result.next_state).toBe(state);
          expect(result.kind).toBe("self");
        }
      }
    }
  });

  it("every observational event is denied from every terminal state", () => {
    const terminalStates = STATES.filter((s) => TERMINAL_STATES.has(s));
    for (const state of terminalStates) {
      for (const obsEvent of OBSERVATIONAL_EVENT_TYPES) {
        const result = resolveTransition(state, obsEvent);
        expect(result.allowed).toBe(false);
      }
    }
  });
});

// ─── allowedTransitionEvents helper ───

describe("state-machine — allowedTransitionEvents", () => {
  it("returns correct events for draft", () => {
    const events = allowedTransitionEvents("draft");
    expect(events).toContain("input.attached");
    expect(events).toContain("grounding.started");
    expect(events).toContain("grounding.completed");
    expect(events).toContain("constraint.discovered");
    expect(events).toHaveLength(4);
  });

  it("returns empty for terminal states", () => {
    expect(allowedTransitionEvents("closed")).toHaveLength(0);
    expect(allowedTransitionEvents("deferred")).toHaveLength(0);
    expect(allowedTransitionEvents("rejected")).toHaveLength(0);
  });

  it("validated only allows scope.closed", () => {
    const events = allowedTransitionEvents("validated");
    expect(events).toEqual(["scope.closed"]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Multi-domain consistency tests (W-B-02 dedup)
// ═══════════════════════════════════════════════════════════════════

import {
  REVIEW_STATES,
  REVIEW_TERMINAL_STATES,
  REVIEW_TRANSITIONS,
  canReviewTransition,
  RECONSTRUCT_STATES,
  RECONSTRUCT_TERMINAL_STATES,
  RECONSTRUCT_TRANSITIONS,
  canReconstructTransition,
} from "./state-machine.js";

describe("Review state machine (9-state, W-B-02 dedup)", () => {
  it("10 states 정의 (awaiting_adjudication 포함)", () => {
    expect(REVIEW_STATES).toHaveLength(10);
    expect(REVIEW_STATES).toContain("awaiting_adjudication");
  });

  it("terminal states 에서 outgoing edge 없음", () => {
    for (const s of REVIEW_TERMINAL_STATES) {
      expect(REVIEW_TRANSITIONS[s]).toEqual([]);
    }
  });

  it("(init) → preparing 만 허용", () => {
    expect(canReviewTransition("(init)", "preparing")).toBe(true);
    expect(canReviewTransition("(init)", "completed")).toBe(false);
  });

  it("preparing → awaiting_lens_dispatch 또는 failed", () => {
    expect(canReviewTransition("preparing", "awaiting_lens_dispatch")).toBe(true);
    expect(canReviewTransition("preparing", "failed")).toBe(true);
    expect(canReviewTransition("preparing", "completed")).toBe(false);
  });

  it("full happy path: (init)→preparing→awaiting_lens_dispatch→validating_lenses→awaiting_adjudication→awaiting_deliberation→awaiting_synthesize_dispatch→completing→completed", () => {
    const path: Array<[string, string]> = [
      ["(init)", "preparing"],
      ["preparing", "awaiting_lens_dispatch"],
      ["awaiting_lens_dispatch", "validating_lenses"],
      ["validating_lenses", "awaiting_adjudication"],
      ["awaiting_adjudication", "awaiting_deliberation"],
      ["awaiting_deliberation", "awaiting_synthesize_dispatch"],
      ["awaiting_synthesize_dispatch", "completing"],
      ["completing", "completed"],
    ];
    for (const [from, to] of path) {
      expect(canReviewTransition(from as any, to as any)).toBe(true);
    }
  });

  it("issue artifact path: validating_lenses → awaiting_adjudication → awaiting_deliberation", () => {
    expect(canReviewTransition("validating_lenses", "awaiting_adjudication")).toBe(true);
    expect(canReviewTransition("awaiting_adjudication", "awaiting_deliberation")).toBe(true);
    expect(canReviewTransition("awaiting_adjudication", "awaiting_synthesize_dispatch")).toBe(false);
    expect(canReviewTransition("awaiting_adjudication", "failed")).toBe(true);
  });

  it("모든 non-terminal state 에서 최소 1개 outgoing edge 존재", () => {
    for (const s of REVIEW_STATES) {
      if (REVIEW_TERMINAL_STATES.has(s)) continue;
      expect(REVIEW_TRANSITIONS[s].length).toBeGreaterThan(0);
    }
  });

  it("artifact-types.ts ALLOWED_TRANSITIONS 와 동일 (dedup 검증)", async () => {
    const { ALLOWED_TRANSITIONS } = await import("../review/artifact-types.js");
    expect(ALLOWED_TRANSITIONS).toEqual(REVIEW_TRANSITIONS);
  });
});

describe("Build state machine (W-B-02 dedup)", () => {
  it("9 states 정의 (negotiating~reconstruct_failed)", () => {
    expect(RECONSTRUCT_STATES).toHaveLength(9);
  });

  it("terminal states 에서 outgoing edge 없음", () => {
    for (const s of RECONSTRUCT_TERMINAL_STATES) {
      expect(RECONSTRUCT_TRANSITIONS[s]).toEqual([]);
    }
  });

  it("(init) → negotiating 만 허용", () => {
    expect(canReconstructTransition("(init)", "negotiating")).toBe(true);
    expect(canReconstructTransition("(init)", "converted")).toBe(false);
  });

  it("full happy path: (init)→negotiating→gathering_context→exploring→adjudicating→awaiting_user_review→processing_responses→converting→converted", () => {
    const path: Array<[string, string]> = [
      ["(init)", "negotiating"],
      ["negotiating", "gathering_context"],
      ["gathering_context", "reconstruct_exploring"],
      ["reconstruct_exploring", "adjudicating"],
      ["adjudicating", "awaiting_user_review"],
      ["awaiting_user_review", "processing_responses"],
      ["processing_responses", "converting"],
      ["converting", "converted"],
    ];
    for (const [from, to] of path) {
      expect(canReconstructTransition(from as any, to as any)).toBe(true);
    }
  });

  it("processing_responses → awaiting_user_review re-entry 가능", () => {
    expect(canReconstructTransition("processing_responses", "awaiting_user_review")).toBe(true);
  });

  it("모든 non-terminal state 에서 reconstruct_failed 전이 가능", () => {
    for (const s of RECONSTRUCT_STATES) {
      if (RECONSTRUCT_TERMINAL_STATES.has(s)) continue;
      expect(canReconstructTransition(s, "reconstruct_failed")).toBe(true);
    }
  });
});

describe("3중 SSOT 일관성 (W-B-02)", () => {
  it("Design scope, Review, Build 모두 state-machine.ts 에서 export", () => {
    // Design scope
    expect(typeof canTransition).toBe("function");
    expect(STATES.length).toBe(15);

    // Review
    expect(typeof canReviewTransition).toBe("function");
    expect(REVIEW_STATES.length).toBe(10);

    // Build
    expect(typeof canReconstructTransition).toBe("function");
    expect(RECONSTRUCT_STATES.length).toBe(9);
  });

  it("3 도메인의 state 이름이 서로 겹치지 않는다", () => {
    const designSet = new Set<string>(STATES);
    const reviewSet = new Set<string>(REVIEW_STATES);
    const buildSet = new Set<string>(RECONSTRUCT_STATES);

    // Design ∩ Review
    for (const s of reviewSet) {
      expect(designSet.has(s as any)).toBe(false);
    }
    // Design ∩ Build
    for (const s of buildSet) {
      expect(designSet.has(s as any)).toBe(false);
    }
    // Review ∩ Build
    for (const s of buildSet) {
      expect(reviewSet.has(s as any)).toBe(false);
    }
  });
});
