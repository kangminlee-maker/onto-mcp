import { describe, expect, it } from "vitest";
import { validateIssueArtifactObject } from "./issue-artifact-runtime.js";

describe("validateIssueArtifactObject — issue-stance-matrix enum fields", () => {
  it("accepts explicit non-applicable and insufficient-evidence position tokens", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "issue-stance-matrix",
        sessionId: "session-001",
        participatingLensIds: ["logic", "axiology"],
        knownIssueIds: new Set(["issue-001"]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          issues: [
            {
              issue_id: "issue-001",
              stances: [
                {
                  lens_id: "logic",
                  stance: "not_applicable",
                  rationale: "The logic lens has no direct position on this value judgment.",
                  root_hypothesis_position: "not_applicable",
                  severity_position: "not_applicable",
                  evidence_refs: ["round1/logic.md"],
                },
                {
                  lens_id: "axiology",
                  stance: "insufficient_evidence",
                  rationale: "The available boundary lacks the value criterion needed for severity.",
                  root_hypothesis_position: "insufficient_evidence",
                  severity_position: "insufficient_evidence",
                  evidence_refs: ["round1/axiology.md"],
                },
              ],
            },
          ],
          validation: {
            missing_stances: [],
          },
        },
      }),
    ).not.toThrow();
  });

  it("rejects explanatory prose in enum-valued position fields", () => {
    expect(() =>
      validateIssueArtifactObject({
        artifactId: "issue-stance-matrix",
        sessionId: "session-001",
        participatingLensIds: ["logic"],
        knownIssueIds: new Set(["issue-001"]),
        parsed: {
          schema_version: 1,
          session_id: "session-001",
          issues: [
            {
              issue_id: "issue-001",
              stances: [
                {
                  lens_id: "logic",
                  stance: "support",
                  rationale: "The lens accepts the issue root.",
                  root_hypothesis_position: "accepts because the evidence is aligned",
                  severity_position: "keeps",
                  evidence_refs: ["round1/logic.md"],
                },
              ],
            },
          ],
          validation: {
            missing_stances: [],
          },
        },
      }),
    ).toThrow(/Allowed values: accepts, narrows, replaces, rejects, not_applicable, insufficient_evidence/);
  });
});
