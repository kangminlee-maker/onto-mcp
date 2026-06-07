import { describe, expect, it } from "vitest";
import {
  lensSidecarArtifactPath,
  lensIdFromRound1ArtifactPath,
  renderLensMarkdownFromSidecar,
  validateLensSidecarArtifactObject,
} from "./lens-sidecar-artifact.js";
import type { ReviewLensSidecarArtifact } from "./artifact-types.js";

function validSidecar(): ReviewLensSidecarArtifact {
  return {
    schema_version: 1,
    session_id: "session-001",
    lens_id: "coverage",
    human_output_ref: "round1/coverage.md",
    findings: [
      {
        candidate_id: "coverage-candidate-001",
        target: "execution-preparation/materialized-input.md",
        evidence_anchor: "execution-preparation/materialized-input.md:12-24",
        claim: "The target omits a bounded public-output contract.",
        what: "The input describes implementation details but not the expected public output.",
        why: "The review cannot verify output adequacy without the declared public contract.",
        how_to_fix: "Add the public-output contract or mark it explicitly out of scope.",
        upstream_evidence_required: false,
        severity_hint: "medium",
        materiality_basis: {
          affected_purpose: "bounded public-output review",
          failure_condition:
            "the review cannot verify the expected public output contract",
          impact:
            "downstream review artifacts may treat implementation detail as output truth",
          evidence_refs: ["execution-preparation/materialized-input.md:12-24"],
        },
        causal_path: {
          root_cause_candidate:
            "the expected public output contract is absent from the bounded input",
          root_cause_step_id: "coverage-candidate-001.cause-002",
          steps: [
            {
              cause_id: "coverage-candidate-001.cause-001",
              claim: "The lens observes a missing public-output contract.",
              relation_to_previous: null,
              evidence_refs: ["execution-preparation/materialized-input.md:12-24"],
            },
            {
              cause_id: "coverage-candidate-001.cause-002",
              claim:
                "The bounded input does not provide an output authority to verify.",
              relation_to_previous: "causes",
              evidence_refs: ["execution-preparation/materialized-input.md:12-24"],
            },
          ],
          unresolved_beyond_evidence: null,
        },
      },
    ],
    domain_constraints_used: [],
    domain_context_assumptions: [],
    validation: {
      unaddressable_candidates: [],
    },
  };
}

describe("lens sidecar artifact validation", () => {
  it("accepts a valid sidecar and rejects envelope mismatches", () => {
    const parsed = {
      ...validSidecar(),
      session_id: "wrong-session",
      lens_id: "wrong-lens",
    };

    expect(() =>
      validateLensSidecarArtifactObject({
        parsed,
        sessionId: "session-001",
        lensId: "coverage",
        expectedHumanOutputRef: "round1/coverage.md",
      }),
    ).toThrow(/session_id/);

    const result = validateLensSidecarArtifactObject({
      parsed: validSidecar(),
      sessionId: "session-001",
      lensId: "coverage",
      expectedHumanOutputRef: "round1/coverage.md",
    });

    expect(result.session_id).toBe("session-001");
    expect(result.lens_id).toBe("coverage");
    expect(result.findings[0]?.candidate_id).toBe("coverage-candidate-001");
  });

  it("rejects duplicate candidate ids", () => {
    const sidecar = validSidecar();
    sidecar.findings.push({
      ...sidecar.findings[0]!,
      claim: "Second candidate with duplicate id.",
    });

    expect(() =>
      validateLensSidecarArtifactObject({
        parsed: sidecar,
        sessionId: "session-001",
        lensId: "coverage",
      }),
    ).toThrow(/candidate_id.*unique/);
  });

  it("requires a no-findings rationale when findings is empty", () => {
    const sidecar = {
      ...validSidecar(),
      findings: [],
    };

    expect(() =>
      validateLensSidecarArtifactObject({
        parsed: sidecar,
        sessionId: "session-001",
        lensId: "coverage",
      }),
    ).toThrow(/no_findings_rationale/);

    const accepted = validateLensSidecarArtifactObject({
      parsed: {
        ...sidecar,
        validation: {
          unaddressable_candidates: [],
          no_findings_rationale: "The lens found no contract-affecting issue.",
        },
      },
      sessionId: "session-001",
      lensId: "coverage",
    });

    expect(accepted.findings).toHaveLength(0);
    expect(accepted.validation.no_findings_rationale).toContain("no contract");
  });

  it("rejects malformed semantic fields", () => {
    const sidecar = validSidecar();
    sidecar.findings[0] = {
      ...sidecar.findings[0]!,
      evidence_anchor: "",
    };

    expect(() =>
      validateLensSidecarArtifactObject({
        parsed: sidecar,
        sessionId: "session-001",
        lensId: "coverage",
      }),
    ).toThrow(/evidence_anchor/);
  });

  it("rejects malformed severity hints", () => {
    const sidecar = validSidecar();
    sidecar.findings[0] = {
      ...sidecar.findings[0]!,
      severity_hint: "critical" as never,
    };

    expect(() =>
      validateLensSidecarArtifactObject({
        parsed: sidecar,
        sessionId: "session-001",
        lensId: "coverage",
      }),
    ).toThrow(/severity_hint/);
  });

  it("requires materiality and causal path for material candidates", () => {
    const sidecar = validSidecar();
    sidecar.findings[0] = {
      ...sidecar.findings[0]!,
      materiality_basis: null,
    };

    expect(() =>
      validateLensSidecarArtifactObject({
        parsed: sidecar,
        sessionId: "session-001",
        lensId: "coverage",
      }),
    ).toThrow(/materiality_basis is required/);
  });

  it("derives the canonical lens sidecar path", () => {
    expect(
      lensSidecarArtifactPath({
        round1Root: "/repo/.onto/review/session/round1",
        lensId: "coverage",
      }),
    ).toBe("/repo/.onto/review/session/round1/coverage.findings.yaml");
    expect(
      lensIdFromRound1ArtifactPath(
        "/repo/.onto/review/session/round1/coverage.findings.yaml",
      ),
    ).toBe("coverage");
    expect(
      lensIdFromRound1ArtifactPath("/repo/.onto/review/session/round1/logic.md"),
    ).toBe("logic");
  });

  it("renders a markdown projection with the machine-parsed provenance sections", () => {
    const projection = renderLensMarkdownFromSidecar(validSidecar());

    expect(projection).toContain("## Findings");
    expect(projection).toContain("coverage-candidate-001");
    expect(projection).toContain("Materiality Basis");
    expect(projection).toContain("Causal Path");
    expect(projection).toContain("## Domain Constraints Used\n[]");
    expect(projection).toContain("## Domain Context Assumptions\n[]");
  });
});
