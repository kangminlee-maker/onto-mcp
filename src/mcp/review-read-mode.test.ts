import { describe, expect, it } from "vitest";
import { reviewReadMode } from "./review-read-mode.js";

// Pins the onto_review_read routing contract (INV-TEST-1). The key case is that
// terminal-but-incomplete states (halted_partial, failed) route to "status", not
// "result" — getReviewResult has no ReviewRecord to read there and would throw.
describe("reviewReadMode routing contract", () => {
  it("returns result for a completed review at standard/full", () => {
    expect(reviewReadMode("completed", "standard")).toBe("result");
    expect(reviewReadMode("completed", "full")).toBe("result");
    expect(reviewReadMode("completed_with_degradation", "standard")).toBe("result");
    expect(reviewReadMode("completed_with_degradation", "full")).toBe("result");
  });

  it("returns status at compact even when completed (polling stays cheap)", () => {
    expect(reviewReadMode("completed", "compact")).toBe("status");
    expect(reviewReadMode("completed_with_degradation", "compact")).toBe("status");
  });

  it("returns status for non-completed states at every projection", () => {
    for (const projection of ["compact", "standard", "full"] as const) {
      expect(reviewReadMode("prepared", projection)).toBe("status");
      expect(reviewReadMode("running", projection)).toBe("status");
      expect(reviewReadMode("unknown", projection)).toBe("status");
    }
  });

  it("routes terminal-but-incomplete states to status (no readable record)", () => {
    for (const projection of ["compact", "standard", "full"] as const) {
      expect(reviewReadMode("halted_partial", projection)).toBe("status");
      expect(reviewReadMode("failed", projection)).toBe("status");
    }
  });
});
