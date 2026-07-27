import { describe, expect, it } from "vitest";
import {
  REVIEW_RUNNER_WARNING_PREFIX,
  emitReviewRunnerWarning,
  withReviewRunnerWarnings,
} from "./review-runner-warning.js";

/** Run `action` with console.warn captured, restoring it afterwards. */
async function withConsoleWarnCaptured<T>(
  action: () => Promise<T>,
): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    return { result: await action(), lines };
  } finally {
    console.warn = original;
  }
}

describe("review runner warning channel", () => {
  it("collects an invocation's warnings and mirrors them to the console", async () => {
    const captured = await withConsoleWarnCaptured(async () =>
      withReviewRunnerWarnings(async () => {
        emitReviewRunnerWarning("seat report for A");
        return "done";
      }),
    );
    expect(captured.result.result).toBe("done");
    expect(captured.result.warnings).toEqual(["seat report for A"]);
    // The console copy is display-only and carries the prefix; the artifact is
    // written from `warnings`, so the two cannot double-count.
    expect(captured.lines).toEqual([
      `${REVIEW_RUNNER_WARNING_PREFIX} seat report for A`,
    ]);
  });

  it("keeps overlapping invocations' warnings apart", async () => {
    // The failure this transport exists to prevent: with a process-global
    // console swap, B (started while A runs) captures A's warnings into B's
    // session, and A finishing first uninstalls B's capture — so B loses its
    // own. Interleave the two so both orderings are exercised in one run.
    let releaseA: () => void = () => {};
    const aReachedMiddle = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const runA = withReviewRunnerWarnings(async () => {
      emitReviewRunnerWarning("A: first");
      await aReachedMiddle; // B starts and emits while A is suspended here
      emitReviewRunnerWarning("A: after B emitted");
      return "A";
    });

    const runB = withReviewRunnerWarnings(async () => {
      emitReviewRunnerWarning("B: first");
      releaseA();
      emitReviewRunnerWarning("B: second");
      return "B";
    });

    const [a, b] = await Promise.all([runA, runB]);
    expect(a.warnings).toEqual(["A: first", "A: after B emitted"]);
    expect(b.warnings).toEqual(["B: first", "B: second"]);
    // Neither collected the other's evidence.
    expect(a.warnings.some((line) => line.startsWith("B:"))).toBe(false);
    expect(b.warnings.some((line) => line.startsWith("A:"))).toBe(false);
  });

  it("still prints when no invocation scope is active", async () => {
    const captured = await withConsoleWarnCaptured(async () => {
      emitReviewRunnerWarning("standalone CLI run");
      return null;
    });
    expect(captured.lines).toEqual([
      `${REVIEW_RUNNER_WARNING_PREFIX} standalone CLI run`,
    ]);
  });
});
