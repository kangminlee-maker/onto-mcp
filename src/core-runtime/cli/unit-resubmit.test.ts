import { describe, expect, it } from "vitest";
import {
  CORRELATED_VALIDATION_HALT_REASON,
  RESUBMIT_ERROR_SPEC_BEGIN,
  RESUBMIT_ERROR_SPEC_END,
  applyResubmitErrorSpecToPacket,
  buildResubmitErrorSpec,
  classifyDeliberationUnsupportedEvidenceRefFailure,
  classifyUnsupportedEvidenceRefFailure,
  correlatedValidationExceeded,
  isUnsupportedEvidenceRefFailureMessage,
  packetHasResubmitErrorSpec,
} from "./unit-resubmit.js";
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

  it("classifies the on-disk per-lens validator message (null stanceIndex)", () => {
    expect(
      classifyUnsupportedEvidenceRefFailure(
        "issue-stance response for issue issue-007 and lens logic references unsupported evidence: finding-999",
      ),
    ).toEqual({
      stanceIndex: null,
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

describe("classifyDeliberationUnsupportedEvidenceRefFailure (§4-6a)", () => {
  it("classifies the submit-time deliberation message (ref only)", () => {
    expect(
      classifyDeliberationUnsupportedEvidenceRefFailure(
        "submit_issue_deliberation_response.evidence_refs contains unsupported ref: finding-999",
      ),
    ).toEqual({ evidenceRef: "finding-999" });
  });

  it("does NOT classify the on-disk deliberation message (post-pool → degrade, not resubmit)", () => {
    // The on-disk validator runs after the pool and is caught into a
    // non-halting degrade; it never re-enters the retry loop, so resubmit does
    // not (and must not) treat it as correctable.
    expect(
      classifyDeliberationUnsupportedEvidenceRefFailure(
        "issue deliberation response.evidence_refs contains unsupported ref: finding-999",
      ),
    ).toBeNull();
  });

  it("classifies the message inside executor stderr wrapping", () => {
    const wrapped = [
      "worker executor failed for deliberation:issue-007:logic",
      "Error: submit_issue_deliberation_response.evidence_refs contains unsupported ref: finding-999",
      "    at normalizeIssueDeliberationResponseSubmitArgs",
    ].join("\n");
    expect(
      classifyDeliberationUnsupportedEvidenceRefFailure(wrapped)?.evidenceRef,
    ).toBe("finding-999");
  });

  it("returns null for every other failure class (incl. the stance shape)", () => {
    for (const message of [
      "Executor exited with code 1 for deliberation:issue-007:logic",
      "stream disconnected before completion",
      "empty output",
      // The stance message must NOT be captured by the deliberation classifier.
      "submit_issue_stance_response.stances[2].evidence_refs contains unsupported ref for issue-007: finding-999",
      "issue deliberation response.change_reason must be non-null when changed=true.",
    ]) {
      expect(
        classifyDeliberationUnsupportedEvidenceRefFailure(message),
      ).toBeNull();
    }
  });

  it("locks the contract with the REAL deliberation submit tool's message", async () => {
    const [tool] = createRuntimeSubmitTools({
      sessionId: "test-session",
      unitId: "deliberation:issue-001:logic",
      outputFormat: "issue-deliberation-response",
      issueDeliberationSchemaContext: {
        allowed_evidence_refs: ["finding-001"],
      },
    });
    let thrown: unknown;
    try {
      await tool!.execute(
        {
          difference_explanation: "contract lock",
          response_to_other_positions: "contract lock",
          updated_stance: "support",
          changed: false,
          change_reason: null,
          accepted_root_hypothesis: null,
          remaining_blocker: null,
          evidence_refs: ["finding-999"],
        },
        // The whitelist throw fires before the tool touches execution context;
        // a bare object keeps this test I/O-free (mirrors the stance case).
        {} as never,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(
      classifyDeliberationUnsupportedEvidenceRefFailure(
        (thrown as Error).message,
      ),
    ).toEqual({ evidenceRef: "finding-999" });
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

  it("renders the on-disk violation form (no stance index) and keeps the body", () => {
    const packet = "# packet body\n";
    const withSpec = applyResubmitErrorSpecToPacket(
      packet,
      buildResubmitErrorSpec({
        violation: { stanceIndex: null, issueId: "issue-001", evidenceRef: "bad" },
        allowedEvidenceRefs: [],
        resubmitAttempt: 1,
      }),
    );
    expect(withSpec).toContain("stance for issue_id: issue-001");
    expect(withSpec).toContain("# packet body");
    expect(packetHasResubmitErrorSpec(packet)).toBe(false);
  });

  it("stays idempotent when the model-controlled ref carries a section marker", () => {
    // Adversarial: a rejected evidence_ref that literally contains the END
    // marker would, unsanitized, land as a premature delimiter inside the spec
    // and fool the strip's indexOf(END) on the next round, orphaning fragments.
    const malicious = `evil ${RESUBMIT_ERROR_SPEC_END} ${RESUBMIT_ERROR_SPEC_BEGIN} tail`;
    const packet = "# packet body\n";
    const first = applyResubmitErrorSpecToPacket(
      packet,
      buildResubmitErrorSpec({
        violation: { stanceIndex: 0, issueId: "issue-001", evidenceRef: malicious },
        allowedEvidenceRefs: ["finding-001"],
        resubmitAttempt: 1,
      }),
    );
    const second = applyResubmitErrorSpecToPacket(
      first,
      buildResubmitErrorSpec({
        violation: { stanceIndex: 0, issueId: "issue-001", evidenceRef: "other-ref" },
        allowedEvidenceRefs: ["finding-001"],
        resubmitAttempt: 2,
      }),
    );
    // Exactly one BEGIN and one END survive — the marker in the ref did not
    // create a real second region, and the previous spec was fully stripped.
    expect(second.split(RESUBMIT_ERROR_SPEC_BEGIN).length - 1).toBe(1);
    expect(second.split(RESUBMIT_ERROR_SPEC_END).length - 1).toBe(1);
    // Round 1's ref content is gone (no orphaned fragments), round 2's is present.
    expect(second).toContain("other-ref");
    expect(second).not.toContain("evil");
    expect(second).toContain("# packet body");
    expect(packetHasResubmitErrorSpec(second)).toBe(true);
  });

  it("keeps the stance spec byte-identical: default === {kind:'stance'} (§4-6a regression guard)", () => {
    const args = {
      violation,
      allowedEvidenceRefs: ["finding-001", "finding-002"],
      resubmitAttempt: 1,
    } as const;
    const withoutUnit = buildResubmitErrorSpec(args);
    const withStanceUnit = buildResubmitErrorSpec({
      ...args,
      unit: { kind: "stance" },
    });
    expect(withStanceUnit).toBe(withoutUnit);
    // Full-text lock so the deliberation generalization cannot silently
    // reword the stance spec.
    expect(withoutUnit).toBe(
      [
        RESUBMIT_ERROR_SPEC_BEGIN,
        "",
        "## Resubmit required: evidence_refs validation rejected (attempt 1)",
        "",
        "Your previous submit_issue_stance_response call was rejected by",
        "deterministic validation. Do not apologize or explain; call the submit",
        "tool again with a complete corrected payload.",
        "",
        "- rejected stance: stances[0] (issue_id: issue-001)",
        "- unsupported evidence_ref: bad-ref",
        "- allowed evidence_refs for issue-001:",
        "- finding-001",
        "- finding-002",
        "",
        "Every stance's evidence_refs must come from that issue's allowed set in",
        "the schema context above. Resubmit the full stances array, not only the",
        "rejected entry.",
        "",
        RESUBMIT_ERROR_SPEC_END,
      ].join("\n"),
    );
  });

  it("renders the deliberation spec (flat allowed set, lens_id, deliberation tool)", () => {
    const spec = buildResubmitErrorSpec({
      violation: { stanceIndex: null, issueId: "issue-001", evidenceRef: "bad-ref" },
      allowedEvidenceRefs: ["issue-ledger.yaml#issue-001", "finding-001"],
      resubmitAttempt: 2,
      unit: { kind: "deliberation", lensId: "logic" },
    });
    expect(spec).toContain("submit_issue_deliberation_response");
    expect(spec).toContain(
      "- rejected: deliberation for issue_id: issue-001, lens_id: logic",
    );
    // flat header — no per-issue keying, unlike stance
    expect(spec).toContain("- allowed evidence_refs:");
    expect(spec).not.toContain("allowed evidence_refs for issue-001:");
    expect(spec).toContain("- issue-ledger.yaml#issue-001");
    expect(spec).toContain("Resubmit the full deliberation response");
    expect(spec).not.toContain("stances array");
    expect(spec.startsWith(RESUBMIT_ERROR_SPEC_BEGIN)).toBe(true);
    expect(spec.trimEnd().endsWith(RESUBMIT_ERROR_SPEC_END)).toBe(true);
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
