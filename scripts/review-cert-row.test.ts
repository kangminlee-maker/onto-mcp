import { describe, expect, it } from "vitest";
import { rowFromAttempt, type BenchmarkRunLike } from "./review-cert-row.js";
import { fixtureApplicableCheckIds } from "../src/core-runtime/discovery/review-cert-record.js";
import { SEMANTIC_QUALITY_GATE_CHECK_IDS } from "../src/core-runtime/review/semantic-quality-gate.js";

// Executable regression guard for the fourth applicable-set-aware consumer
// (design §D2 / MF-1): the producer's completion judgment. The mock rehearsal is
// the integration check; these unit tests are the CI guard that a revert to a
// hardcoded 12-check universe (which mis-flags clean-target's legitimate 7-check
// run as not_run and silently sinks certification) cannot stay green. Expected
// sets are derived from the same single authority the manifest/validator use.

const FULL_UNIVERSE = [...SEMANTIC_QUALITY_GATE_CHECK_IDS];
const CLEAN_TARGET_APPLICABLE = fixtureApplicableCheckIds("clean-target-v1");

function completedSummaryEmitting(checkIds: readonly string[]): BenchmarkRunLike {
  return {
    status: "completed",
    execution_status: "completed",
    unit_count: 19,
    failed_unit_count: 0,
    semantic_quality_gate: {
      status: "passed",
      checks: checkIds.map((id) => ({ check_id: id, status: "passed" })),
    },
  };
}

function run(fixtureId: string, summary: BenchmarkRunLike | null, exitCode = 0) {
  return rowFromAttempt({ arm: "candidate", fixtureId, rep: 1, exitCode, summary });
}

describe("rowFromAttempt applicable-set completion judgment", () => {
  it("clean-target emitting its reduced 7-check set → ok (carries all 7 as evidence)", () => {
    expect(CLEAN_TARGET_APPLICABLE).toBeDefined();
    expect(CLEAN_TARGET_APPLICABLE!.length).toBe(7);
    const { row, notOkReason } = run(
      "clean-target-v1",
      completedSummaryEmitting(CLEAN_TARGET_APPLICABLE!),
    );
    expect(notOkReason).toBeNull();
    expect(row.completion).toBe("ok");
    expect(row.checks).toHaveLength(7);
  });

  it("clean-target emitting the FULL 12-check universe → not_run (over-emission)", () => {
    const { row, notOkReason } = run(
      "clean-target-v1",
      completedSummaryEmitting(FULL_UNIVERSE),
    );
    expect(row.completion).toBe("not_run");
    expect(notOkReason).toMatch(/gate emitted 12 checks/);
  });

  it("clean-target emitting only 6 of its applicable set → not_run (under-emission)", () => {
    const { row } = run(
      "clean-target-v1",
      completedSummaryEmitting(CLEAN_TARGET_APPLICABLE!.slice(0, 6)),
    );
    expect(row.completion).toBe("not_run");
  });

  it("a material fixture emitting the full universe → ok", () => {
    const { row, notOkReason } = run(
      "review-pipeline-target-v1",
      completedSummaryEmitting(FULL_UNIVERSE),
    );
    expect(notOkReason).toBeNull();
    expect(row.completion).toBe("ok");
    expect(row.checks).toHaveLength(12);
  });

  it("a material fixture emitting only the clean-target reduced set → not_run (the fix must NOT loosen material fixtures)", () => {
    const { row, notOkReason } = run(
      "review-pipeline-target-v1",
      completedSummaryEmitting(CLEAN_TARGET_APPLICABLE!),
    );
    expect(row.completion).toBe("not_run");
    expect(notOkReason).toMatch(/gate emitted 7 checks/);
  });

  it("shared-root (a full-universe v3 fixture) requires the full 12 → not_run on 7", () => {
    expect(fixtureApplicableCheckIds("shared-root-target-v1")).toBeUndefined();
    const { row } = run(
      "shared-root-target-v1",
      completedSummaryEmitting(CLEAN_TARGET_APPLICABLE!),
    );
    expect(row.completion).toBe("not_run");
  });

  it("non-zero benchmark exit → not_run regardless of a well-formed gate", () => {
    const { row, notOkReason } = run(
      "clean-target-v1",
      completedSummaryEmitting(CLEAN_TARGET_APPLICABLE!),
      1,
    );
    expect(row.completion).toBe("not_run");
    expect(notOkReason).toMatch(/benchmark exit=1/);
  });

  it("missing benchmark summary → not_run", () => {
    const { row, notOkReason } = run("clean-target-v1", null);
    expect(row.completion).toBe("not_run");
    expect(notOkReason).toMatch(/no run summary/);
  });
});
