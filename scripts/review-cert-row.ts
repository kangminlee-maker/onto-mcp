import {
  fixtureApplicableCheckIds,
  type ReviewCertArm,
  type ReviewCertRun,
} from "../src/core-runtime/discovery/review-cert-record.js";
import { SEMANTIC_QUALITY_GATE_CHECK_IDS } from "../src/core-runtime/review/semantic-quality-gate.js";

/**
 * Producer-side completion projection for a review-cert benchmark attempt,
 * extracted from scripts/review-cert-run.mts so it is importable and unit-tested
 * (review-cert-run.mts self-executes on import, so the fourth applicable-set-aware
 * consumer — this completion judgment, design §D2 / MF-1 — was otherwise
 * exercised only by the manual mock rehearsal). The rehearsal remains the
 * integration check; review-cert-row.test.ts is its executable regression guard.
 */

const CANONICAL_CHECKS = [...SEMANTIC_QUALITY_GATE_CHECK_IDS].sort();

/** The shape review-cert-run reads out of a benchmark run report. */
export interface BenchmarkRunLike {
  status?: string;
  execution_status?: string;
  unit_count?: number;
  failed_unit_count?: number;
  salvaged_unit_ids?: string[];
  resubmit_applied_unit_count?: number;
  resubmit_applied_unit_ids?: string[];
  semantic_quality_gate?: {
    status?: string;
    checks?: Array<{ check_id: string; status: string }>;
  };
}

// ── row projection (contract §4: ok = full completion + the fixture's APPLICABLE
// check set — the full 12-check universe, or a clean-target's reduced set) ──
export function rowFromAttempt(args: {
  arm: ReviewCertArm;
  fixtureId: string;
  rep: number;
  exitCode: number | null;
  summary: BenchmarkRunLike | null;
}): { row: ReviewCertRun; notOkReason: string | null } {
  const { summary } = args;
  const reasons: string[] = [];
  if (args.exitCode !== 0) reasons.push(`benchmark exit=${args.exitCode}`);
  if (summary === null) reasons.push("no run summary in benchmark report");
  const unitCount = summary?.unit_count;
  const failedUnits = summary?.failed_unit_count;
  const salvaged = summary?.salvaged_unit_ids ?? [];
  const resubmitApplied =
    summary?.resubmit_applied_unit_ids?.length ??
    summary?.resubmit_applied_unit_count ?? 0;
  if (summary !== null) {
    if (summary.status !== "completed" || summary.execution_status !== "completed") {
      reasons.push(`execution_status=${summary.execution_status ?? summary.status ?? "unknown"}`);
    }
    if (typeof unitCount !== "number" || unitCount < 1) reasons.push("no units observed");
    if (failedUnits !== 0) reasons.push(`failed_unit_count=${failedUnits ?? "unknown"}`);
    if (salvaged.length > 0) reasons.push(`salvaged_unit_ids=[${salvaged.join(",")}] (rescue pin breached)`);
    // ok requires the gate to emit EXACTLY this fixture's applicable check set —
    // the full 12-check universe, or a clean-target's reduced set (design §D2 /
    // MF-1: this completion judgment is a fourth applicable-set-aware consumer
    // alongside record-layer emission/passRate/aggregate — a hardcoded 12 here
    // would mis-flag a legitimate reduced-set run as not_run). Derived from the
    // same single authority the manifest and validator use.
    const applicableChecks = fixtureApplicableCheckIds(args.fixtureId);
    const expectedChecks = applicableChecks
      ? [...applicableChecks].sort()
      : CANONICAL_CHECKS;
    const emitted = summary.semantic_quality_gate?.checks ?? [];
    const emittedIds = [...new Set(emitted.map((check) => check.check_id))].sort();
    if (
      emitted.length !== expectedChecks.length ||
      emittedIds.length !== expectedChecks.length ||
      emittedIds.some((id, index) => id !== expectedChecks[index])
    ) {
      reasons.push(`gate emitted ${emitted.length} checks (need this fixture's applicable ${expectedChecks.length}-check set)`);
    }
  }
  const ok = reasons.length === 0;
  if (ok) {
    return {
      row: {
        arm: args.arm,
        fixture_id: args.fixtureId,
        rep: args.rep,
        completion: "ok",
        units_total: unitCount as number,
        units_completed: unitCount as number,
        resubmit_applied_unit_count: resubmitApplied,
        checks: (summary!.semantic_quality_gate!.checks ?? []).map((check) => ({
          check_id: check.check_id as ReviewCertRun["checks"][number]["check_id"],
          status: check.status === "passed" ? "passed" : "failed",
        })),
      },
      notOkReason: null,
    };
  }
  const knownTotal = typeof unitCount === "number" && unitCount >= 1 ? unitCount : 1;
  const knownCompleted =
    typeof unitCount === "number" && typeof failedUnits === "number"
      ? Math.min(Math.max(unitCount - failedUnits, 0), knownTotal)
      : 0;
  return {
    row: {
      arm: args.arm,
      fixture_id: args.fixtureId,
      rep: args.rep,
      completion: "not_run",
      units_total: knownTotal,
      units_completed: knownCompleted,
      resubmit_applied_unit_count: resubmitApplied,
      checks: [], // a lost/partial/rescued/short-universe run carries no check evidence
    },
    notOkReason: reasons.join("; "),
  };
}
