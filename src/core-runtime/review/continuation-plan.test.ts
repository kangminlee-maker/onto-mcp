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

  it("recomputes issue-scoped deliberation responses downstream of a rerun lens", () => {
    const plan = buildReviewContinuationPlan({
      ledger: ledger([
        trusted("logic"),
        unit("coverage", {
          status: "failed",
          trustStatus: "untrusted",
          downstreamUnitIds: ["finding-ledger"],
        }),
        unit("finding-ledger", {
          unitKind: "issue_artifact",
          status: "not_reached",
          trustStatus: "blocked_by_upstream",
          upstreamUnitIds: ["logic", "coverage"],
          downstreamUnitIds: ["deliberation-plan"],
        }),
        unit("deliberation-plan", {
          unitKind: "issue_artifact",
          status: "not_reached",
          trustStatus: "blocked_by_upstream",
          upstreamUnitIds: ["finding-ledger"],
          downstreamUnitIds: [
            "deliberation:issue-001:logic",
            "deliberation:issue-001:coverage",
          ],
        }),
        unit("deliberation:issue-001:logic", {
          unitKind: "deliberation",
          status: "not_reached",
          trustStatus: "blocked_by_upstream",
          upstreamUnitIds: ["deliberation-plan"],
        }),
        unit("deliberation:issue-001:coverage", {
          unitKind: "deliberation",
          status: "not_reached",
          trustStatus: "blocked_by_upstream",
          upstreamUnitIds: ["deliberation-plan"],
        }),
      ]),
      targetUnits: ["coverage"],
    });

    expect(plan.eligible).toBe(true);
    expect(plan.frontierUnits.map((unit) => unit.unitId)).toEqual(["coverage"]);
    expect(plan.downstreamUnits.map((unit) => unit.unitId)).toEqual([
      "finding-ledger",
      "deliberation-plan",
      "deliberation:issue-001:logic",
      "deliberation:issue-001:coverage",
    ]);
  });

  it("accepts exact issue-scoped deliberation unit ids as continuation targets", () => {
    const plan = buildReviewContinuationPlan({
      ledger: ledger([
        trusted("deliberation-plan"),
        unit("deliberation:issue-001:logic", {
          unitKind: "deliberation",
          status: "failed",
          trustStatus: "untrusted",
          upstreamUnitIds: ["deliberation-plan"],
          downstreamUnitIds: ["controlled-deliberation"],
        }),
        unit("controlled-deliberation", {
          unitKind: "deliberation",
          status: "not_reached",
          trustStatus: "blocked_by_upstream",
          upstreamUnitIds: ["deliberation:issue-001:logic"],
        }),
      ]),
      targetUnits: ["deliberation:issue-001:logic"],
    });

    expect(plan.eligible).toBe(true);
    expect(plan.frontierUnits).toMatchObject([
      {
        unitId: "deliberation:issue-001:logic",
        dispatchDecision: "run",
      },
    ]);
    expect(plan.downstreamUnits.map((unit) => unit.unitId)).toEqual([
      "controlled-deliberation",
    ]);
  });

  it("rejects public target aliases instead of rewriting them", () => {
    const plan = buildReviewContinuationPlan({
      ledger: ledger([unit("logic")]),
      targetUnits: ["lens:logic"],
    });

    expect(plan.eligible).toBe(false);
    expect(plan.frontierUnits[0]).toMatchObject({
      unitId: "lens:logic",
      dispatchDecision: "reject",
      reason: "Target unit is not present in the pipeline execution ledger.",
    });
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

  it("rejects target units that are downstream of the current frontier", () => {
    const plan = buildReviewContinuationPlan({
      ledger: ledger([
        unit("logic", { downstreamUnitIds: ["synthesize"] }),
        unit("synthesize", {
          unitKind: "synthesize",
          status: "not_reached",
          trustStatus: "blocked_by_upstream",
          upstreamUnitIds: ["logic"],
        }),
      ]),
      targetUnits: ["synthesize"],
    });

    expect(plan.eligible).toBe(false);
    expect(plan.frontierUnits[0]).toMatchObject({
      unitId: "synthesize",
      dispatchDecision: "reject",
    });
  });

  it("rejects partial target unit selections that skip sibling frontier units", () => {
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
      targetUnits: ["logic"],
    });

    expect(plan.eligible).toBe(false);
    expect(plan.frontierUnits.map((unit) => unit.unitId)).toEqual(["coverage"]);
    expect(plan.frontierUnits[0]?.dispatchDecision).toBe("reject");
  });
});
