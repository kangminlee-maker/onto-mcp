import { describe, expect, it } from "vitest";
import { reviewProgressStepIdFromHalt } from "./review-progress-contract.js";

describe("reviewProgressStepIdFromHalt", () => {
  it("maps per-lens issue-stance unit halts to the issue_stance_matrix step", () => {
    expect(
      reviewProgressStepIdFromHalt({
        haltPhase: "issue_artifact",
        haltUnitId: "issue-stance:structural-integrity",
        haltUnitKind: "issue_artifact",
      }),
    ).toBe("issue_stance_matrix");
  });

  it("maps exact issue artifact unit ids to their steps", () => {
    expect(
      reviewProgressStepIdFromHalt({
        haltPhase: "issue_artifact",
        haltUnitId: "issue-ledger",
        haltUnitKind: "issue_artifact",
      }),
    ).toBe("issue_ledger");
    expect(
      reviewProgressStepIdFromHalt({
        haltPhase: "issue_artifact",
        haltUnitId: "issue-stance-matrix",
        haltUnitKind: "issue_artifact",
      }),
    ).toBe("issue_stance_matrix");
  });

  it("falls back to finding_ledger for unknown issue artifact unit ids", () => {
    expect(
      reviewProgressStepIdFromHalt({
        haltPhase: "issue_artifact",
        haltUnitId: null,
        haltUnitKind: "issue_artifact",
      }),
    ).toBe("finding_ledger");
  });
});
