import { describe, expect, it } from "vitest";
import {
  CORRELATED_VALIDATION_HALT_REASON,
  RESUBMIT_ERROR_SPEC_BEGIN,
  RESUBMIT_ERROR_SPEC_END,
  applyResubmitErrorSpecToPacket,
  buildResubmitErrorSpec,
  classifyUnsupportedEvidenceRefFailure,
  correlatedValidationExceeded,
  isUnsupportedEvidenceRefFailureMessage,
  packetHasResubmitErrorSpec,
  stripResubmitErrorSpec,
} from "./stance-resubmit.js";
import { createRuntimeSubmitTools } from "./structured-output-tools.js";

const SAMPLE_MESSAGE =
  "submit_issue_stance_response.stances[2].evidence_refs contains unsupported ref for issue-007: finding-999";

describe("classifyUnsupportedEvidenceRefFailure", () => {
  it("classifies the canonical validation message", () => {
    expect(classifyUnsupportedEvidenceRefFailure(SAMPLE_MESSAGE)).toEqual({
      stanceIndex: 2,
      issueId: "issue-007",
      evidenceRef: "finding-999",
    });
  });

  it("classifies the message inside executor stderr wrapping", () => {
    const wrapped = [
      "worker executor failed for issue-stance:logic",
      `Error: ${SAMPLE_MESSAGE}`,
      "    at normalizeIssueStanceResponseSubmitArgs",
    ].join("\n");
    expect(classifyUnsupportedEvidenceRefFailure(wrapped)?.issueId).toBe(
      "issue-007",
    );
  });

  it("returns null for every other failure class", () => {
    for (const message of [
      "Executor exited with code 1 for issue-stance:logic",
      "stream disconnected before completion",
      "empty output",
      "submit_issue_stance_response duplicates issue_id: issue-001",
      "submit_issue_deliberation_response.evidence_refs contains unsupported ref", // deliberation shape differs
    ]) {
      expect(classifyUnsupportedEvidenceRefFailure(message)).toBeNull();
      expect(isUnsupportedEvidenceRefFailureMessage(message)).toBe(false);
    }
  });

  it("locks the contract with the REAL submit tool's thrown message", async () => {
    const [tool] = createRuntimeSubmitTools({
      sessionId: "test-session",
      unitId: "issue-stance:logic",
      outputFormat: "issue-stance-response",
      issueStanceSchemaContext: {
        issue_evidence_refs: { "issue-001": ["finding-001"] },
      },
    });
    let thrown: unknown;
    try {
      await tool!.execute(
        {
          stances: [
            {
              issue_id: "issue-001",
              stance: "support",
              rationale: "contract lock",
              root_hypothesis_position: "accepts",
              severity_position: "keeps",
              evidence_refs: ["finding-999"],
            },
          ],
        },
        // The stance submit tool never touches the execution context before
        // the whitelist throw; a bare object keeps this test I/O-free.
        {} as never,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const violation = classifyUnsupportedEvidenceRefFailure(
      (thrown as Error).message,
    );
    expect(violation).toEqual({
      stanceIndex: 0,
      issueId: "issue-001",
      evidenceRef: "finding-999",
    });
  });
});

describe("resubmit error spec projection", () => {
  const violation = { stanceIndex: 0, issueId: "issue-001", evidenceRef: "bad-ref" };

  it("renders violation, allowed set, and markers", () => {
    const spec = buildResubmitErrorSpec({
      violation,
      allowedEvidenceRefs: ["finding-001", "finding-002"],
      resubmitAttempt: 1,
    });
    expect(spec.startsWith(RESUBMIT_ERROR_SPEC_BEGIN)).toBe(true);
    expect(spec.trimEnd().endsWith(RESUBMIT_ERROR_SPEC_END)).toBe(true);
    expect(spec).toContain("issue-001");
    expect(spec).toContain("bad-ref");
    expect(spec).toContain("- finding-001");
    expect(spec).toContain("- finding-002");
  });

  it("applies idempotently: a second spec replaces the first", () => {
    const packet = "# packet body\n\ncontext lines\n";
    const first = applyResubmitErrorSpecToPacket(
      packet,
      buildResubmitErrorSpec({
        violation,
        allowedEvidenceRefs: ["finding-001"],
        resubmitAttempt: 1,
      }),
    );
    const second = applyResubmitErrorSpecToPacket(
      first,
      buildResubmitErrorSpec({
        violation: { ...violation, evidenceRef: "other-bad-ref" },
        allowedEvidenceRefs: ["finding-001"],
        resubmitAttempt: 2,
      }),
    );
    expect(second.split(RESUBMIT_ERROR_SPEC_BEGIN).length - 1).toBe(1);
    expect(second).toContain("other-bad-ref");
    expect(second).not.toContain("unsupported evidence_ref: bad-ref");
    expect(second).toContain("# packet body");
    expect(packetHasResubmitErrorSpec(second)).toBe(true);
  });

  it("strip restores a packet without a spec", () => {
    const packet = "# packet body\n";
    const withSpec = applyResubmitErrorSpecToPacket(
      packet,
      buildResubmitErrorSpec({
        violation,
        allowedEvidenceRefs: [],
        resubmitAttempt: 1,
      }),
    );
    expect(stripResubmitErrorSpec(withSpec)).not.toContain(
      RESUBMIT_ERROR_SPEC_BEGIN,
    );
    expect(packetHasResubmitErrorSpec(packet)).toBe(false);
  });
});

describe("correlatedValidationExceeded", () => {
  it("requires a strict majority", () => {
    expect(
      correlatedValidationExceeded({ validationFailedUnitCount: 1, totalUnitCount: 2 }),
    ).toBe(false);
    expect(
      correlatedValidationExceeded({ validationFailedUnitCount: 2, totalUnitCount: 4 }),
    ).toBe(false);
    expect(
      correlatedValidationExceeded({ validationFailedUnitCount: 2, totalUnitCount: 3 }),
    ).toBe(true);
    expect(
      correlatedValidationExceeded({ validationFailedUnitCount: 1, totalUnitCount: 1 }),
    ).toBe(true);
  });

  it("is false over an empty unit set (no vacuous escalation)", () => {
    expect(
      correlatedValidationExceeded({ validationFailedUnitCount: 0, totalUnitCount: 0 }),
    ).toBe(false);
  });
});

describe("halt reason vocabulary", () => {
  it("keeps the correlated_validation token stable (design F-A2 contract)", () => {
    expect(CORRELATED_VALIDATION_HALT_REASON).toBe("correlated_validation");
  });
});
