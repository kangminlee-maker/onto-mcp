import { describe, expect, it } from "vitest";
import type {
  PipelineExecutionLedger,
  PipelineExecutionLedgerUnitEntry,
} from "../pipeline-execution-ledger.js";
import { buildReviewContinuationPlan } from "./continuation-plan.js";

function unit(
  unitId: string,
  overrides: Partial<PipelineExecutionLedgerUnitEntry> = {},
): PipelineExecutionLedgerUnitEntry {
  return {
    unitId,
    unitKind: "lens",
    owner: "host_llm",
    producedArtifactRefs: [`${unitId}.md`],
    consumedArtifactRefs: [],
    packetRef: `${unitId}.prompt.md`,
    outputRefs: [`${unitId}.md`],
    outputHashes: { [`${unitId}.md`]: null },
    status: "planned",
    trustStatus: "untrusted",
    trustReason: "planned",
    attemptCount: 0,
    lastFailureMessage: null,
    upstreamUnitIds: [],
    downstreamUnitIds: [],
    ...overrides,
  };
}

function trusted(unitId: string): PipelineExecutionLedgerUnitEntry {
  return unit(unitId, {
    outputHashes: { [`${unitId}.md`]: "abc" },
    status: "completed",
    trustStatus: "trusted",
    trustReason: "trusted",
  });
}

function ledger(units: PipelineExecutionLedgerUnitEntry[]): PipelineExecutionLedger {
  return {
    schemaVersion: "1",
    pipeline: "review",
    sessionId: "s1",
    sourceRefs: ["execution-plan.yaml"],
    units,
  };
}

describe("buildReviewContinuationPlan", () => {
  it("selects all prepared lens units as the natural frontier", () => {
    const plan = buildReviewContinuationPlan({
      ledger: ledger([
        unit("logic", { downstreamUnitIds: ["finding-ledger"] }),
        unit("coverage", { downstreamUnitIds: ["finding-ledger"] }),
        unit("finding-ledger", {
          unitKind: "issue_artifact",
          status: "not_reached",
          trustStatus: "blocked_by_upstream",
          upstreamUnitIds: ["logic", "coverage"],
        }),
      ]),
    });

    expect(plan.eligible).toBe(true);
    expect(plan.frontierUnits.map((unit) => unit.unitId)).toEqual([
      "logic",
      "coverage",
    ]);
    expect(plan.downstreamUnits.map((unit) => unit.unitId)).toEqual([
      "finding-ledger",
    ]);
  });

  it("starts at the first failed unit and preserves trusted upstream artifacts", () => {
    const plan = buildReviewContinuationPlan({
      ledger: ledger([
        trusted("logic"),
        unit("finding-ledger", {
          unitKind: "issue_artifact",
          status: "failed",
          trustStatus: "untrusted",
          upstreamUnitIds: ["logic"],
          downstreamUnitIds: ["issue-ledger"],
        }),
        unit("issue-ledger", {
          unitKind: "issue_artifact",
          status: "not_reached",
          trustStatus: "blocked_by_upstream",
          upstreamUnitIds: ["finding-ledger"],
        }),
      ]),
    });

    expect(plan.frontierUnits.map((unit) => unit.unitId)).toEqual([
      "finding-ledger",
    ]);
    expect(plan.preservedArtifactRefs).toEqual(["logic.md"]);
    expect(plan.downstreamUnits.map((unit) => unit.unitId)).toEqual([
      "issue-ledger",
    ]);
  });

  it("rejects target units that are already trusted", () => {
    const plan = buildReviewContinuationPlan({
      ledger: ledger([trusted("logic")]),
      targetUnits: ["logic"],
    });

    expect(plan.eligible).toBe(false);
    expect(plan.frontierUnits[0]).toMatchObject({
      unitId: "logic",
      dispatchDecision: "reject",
    });
  });
});
