import { describe, expect, it } from "vitest";
import {
  REVIEW_RETURN_RUNNING_AFTER_MS_FULL,
  REVIEW_RETURN_RUNNING_AFTER_MS_SIMPLE,
  resolveReviewReturnRunningAfterMs,
} from "./review-sync-window.js";

// Pins the profile-aware bounded synchronous window (Host Usability Roadmap
// Phase 1, polling acceptance contract). INV-TEST-1.
describe("resolveReviewReturnRunningAfterMs (profile-aware sync window)", () => {
  it("uses profile defaults when no env is set", () => {
    expect(resolveReviewReturnRunningAfterMs("full")).toBe(
      REVIEW_RETURN_RUNNING_AFTER_MS_FULL,
    );
    expect(resolveReviewReturnRunningAfterMs("simple")).toBe(
      REVIEW_RETURN_RUNNING_AFTER_MS_SIMPLE,
    );
  });

  it("gives the simple profile a larger window than full (modest raise)", () => {
    expect(REVIEW_RETURN_RUNNING_AFTER_MS_SIMPLE).toBeGreaterThan(
      REVIEW_RETURN_RUNNING_AFTER_MS_FULL,
    );
  });

  it("reads each profile's env independently (no cross-application)", () => {
    expect(
      resolveReviewReturnRunningAfterMs("full", { full: "10000", simple: "60000" }),
    ).toBe(10000);
    expect(
      resolveReviewReturnRunningAfterMs("simple", { full: "10000", simple: "60000" }),
    ).toBe(60000);
    expect(resolveReviewReturnRunningAfterMs("simple", { full: "10000" })).toBe(
      REVIEW_RETURN_RUNNING_AFTER_MS_SIMPLE,
    );
    expect(resolveReviewReturnRunningAfterMs("full", { simple: "60000" })).toBe(
      REVIEW_RETURN_RUNNING_AFTER_MS_FULL,
    );
  });

  it("falls back to the profile default on any non-integer env, never truncating (never throws)", () => {
    // Strict: empty, negative, decimal, unit-suffixed, and underscore forms all
    // fall back rather than parseInt-truncating ("30_000"→30, "10s"→10).
    for (const bad of ["", "   ", "abc", "-1", "1.5", "10s", "10abc", "30_000", "0x10"]) {
      expect(resolveReviewReturnRunningAfterMs("full", { full: bad })).toBe(
        REVIEW_RETURN_RUNNING_AFTER_MS_FULL,
      );
      expect(resolveReviewReturnRunningAfterMs("simple", { simple: bad })).toBe(
        REVIEW_RETURN_RUNNING_AFTER_MS_SIMPLE,
      );
    }
  });

  it("accepts 0 as an explicit immediate-handle window", () => {
    expect(resolveReviewReturnRunningAfterMs("full", { full: "0" })).toBe(0);
  });
});
