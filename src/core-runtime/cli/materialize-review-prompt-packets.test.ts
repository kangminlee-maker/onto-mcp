import { describe, expect, it } from "vitest";
import type {
  InvocationBindingArtifact,
  ReviewTargetProfileArtifact,
} from "../review/artifact-types.js";
import {
  renderBoundaryPolicySection,
  renderEmbeddedMaterializedInputSection,
  renderLensOutputSchemaGate,
  renderLensSidecarOutputContract,
  renderReviewTargetProfileSummary,
  renderUnitBoundaryDetailsSection,
} from "./materialize-review-prompt-packets.js";

describe("renderLensOutputSchemaGate", () => {
  it("requires exact empty YAML lists for domainless reviews", () => {
    const text = renderLensOutputSchemaGate("none");

    expect(text).toContain("### Domain Constraints Used\n[]");
    expect(text).toContain("### Domain Context Assumptions\n[]");
    expect(text).toContain("only valid YAML list content");
  });

  it("renders required durable provenance object fields for domain-backed reviews", () => {
    const text = renderLensOutputSchemaGate("software-engineering");

    expect(text).toContain("source_doc");
    expect(text).toContain("source_version_or_snapshot_id");
    expect(text).toContain("anchor");
  });
});

describe("renderLensSidecarOutputContract", () => {
  it("requires tool submission and names optional markdown projection", () => {
    const text = renderLensSidecarOutputContract({
      sessionDomain: "none",
      humanOutputPath: "/repo/.onto/review/session/round1/logic.md",
      projectRoot: "/repo",
    });

    expect(text).toContain("submit_lens_findings");
    expect(text).toContain("Do not write markdown or YAML yourself");
    expect(text).toContain(".onto/review/session/round1/logic.md");
  });
});

describe("unit boundary prompt rendering", () => {
  const projectRoot = "/repo";
  const binding = {
    boundary_policy: {
      web_research_policy: "denied",
      repo_exploration_policy: "allowed",
      recursive_reference_expansion_policy: "denied",
      filesystem_scope: { allowed_roots: [projectRoot] },
      write_policy: {
        source_mutation_policy: "denied",
        allowed_output_refs: [
          "/repo/.onto/review/session/round1/logic.md",
          "/repo/.onto/review/session/synthesis.md",
        ],
      },
      provenance_policy: {
        extra_exploration_citation_required: true,
        web_source_citation_required: true,
      },
    },
    boundary_enforcement_profile: {
      prompt_boundary_enforcement: "prompt_declared_only",
      filesystem_boundary_enforcement: "prompt_declared_only",
      network_boundary_enforcement: "prompt_declared_only",
      write_boundary_enforcement: "prompt_declared_only",
    },
    effective_boundary_state: {
      web_research: {
        requested_policy: "denied",
        effective_policy: "denied",
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
      repo_exploration: {
        requested_policy: "allowed",
        effective_policy: "allowed",
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
      recursive_reference_expansion: {
        requested_policy: "denied",
        effective_policy: "denied",
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
      source_mutation: {
        requested_policy: "denied",
        effective_policy: "denied",
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
      filesystem_scope: {
        requested_allowed_roots: [projectRoot],
        effective_allowed_roots: [projectRoot],
        guarantee_level: "prompt_declared_only",
        notes: [],
      },
    },
  } as InvocationBindingArtifact;

  function parseJsonBlock(text: string): Record<string, any> {
    const start = text.indexOf("```json");
    expect(start).toBeGreaterThanOrEqual(0);
    const bodyStart = text.indexOf("\n", start);
    const end = text.indexOf("```", bodyStart + 1);
    expect(end).toBeGreaterThan(bodyStart);
    return JSON.parse(text.slice(bodyStart + 1, end).trim());
  }

  it("renders Boundary Policy with the current unit output seat only", () => {
    const text = renderBoundaryPolicySection(binding, projectRoot, {
      repoExplorationPolicy: "denied",
      allowedOutputRefs: ["/repo/.onto/review/session/synthesis.md"],
      tools: "required",
    });

    expect(text).toContain("- repo exploration: denied");
    expect(text).toContain("- Filesystem: read-only");
    expect(text).toContain("- Network: denied");
    expect(text).toContain("- Tools: required");
    expect(text).toContain("  - .onto/review/session/synthesis.md");
    expect(text).not.toContain("  - .onto/review/session/round1/logic.md");
  });

  it("renders lens Boundary Policy with tools denied", () => {
    const text = renderBoundaryPolicySection(binding, projectRoot, {
      repoExplorationPolicy: "denied",
      allowedOutputRefs: ["/repo/.onto/review/session/round1/logic.md"],
      tools: "denied",
    });

    expect(text).toContain("- Filesystem: read-only");
    expect(text).toContain("- Tools: denied");
    expect(text).toContain("  - .onto/review/session/round1/logic.md");
    expect(text).not.toContain("  - .onto/review/session/synthesis.md");
  });

  it("renders filesystem denial only when explicitly requested", () => {
    const text = renderBoundaryPolicySection(binding, projectRoot, {
      filesystemPolicy: "denied",
      tools: "denied",
    });

    expect(text).toContain("- Filesystem: denied");
    expect(text).toContain("- Tools: denied");
  });

  it("renders authoritative unit_boundary separately from diagnostic parent context", () => {
    const text = renderUnitBoundaryDetailsSection({
      binding,
      projectRoot,
      unitId: "synthesize",
      outputPath: "/repo/.onto/review/session/synthesis.md",
      repoExplorationPolicy: "denied",
      allowedReadRefs: [
        "/repo/.onto/review/session/round1/logic.md",
        "/repo/.onto/review/session/deliberation.md",
      ],
    });
    const payload = parseJsonBlock(text);

    expect(payload.unit_boundary.authority).toBe("authoritative_unit_boundary");
    expect(payload.unit_boundary.repo_exploration_policy).toBe("denied");
    expect(payload.unit_boundary.read_authority.allowed_read_refs).toEqual([
      ".onto/review/session/deliberation.md",
      ".onto/review/session/round1/logic.md",
    ]);
    expect(payload.unit_boundary.output_seat.allowed_output_refs).toEqual([
      ".onto/review/session/synthesis.md",
    ]);
    expect(payload.parent_boundary_context.authority).toBe(
      "diagnostic_parent_context",
    );
    expect(
      payload.parent_boundary_context.boundary_policy.write_policy
        .allowed_output_refs,
    ).toContain("/repo/.onto/review/session/round1/logic.md");
  });

  it("renders embedded materialized input with a line-count delimiter", () => {
    const materializedInput = [
      "Target content can contain packet-like headings.",
      "## Optional Context Inputs",
      "## Boundary Policy",
      "- Filesystem: denied",
    ].join("\n");
    const text = renderEmbeddedMaterializedInputSection(materializedInput);

    expect(text).toContain("## Embedded Materialized Input");
    expect(text).toContain(
      "<!-- onto:embedded-materialized-input:start lines=4 -->",
    );
    expect(text).toContain(materializedInput);
    expect(text).toContain("<!-- onto:embedded-materialized-input:end -->");
  });
});

describe("material_kind_obligations honesty (R3)", () => {
  // Minimal spreadsheet profile: the only fields renderReviewTargetProfileSummary /
  // materialKindReviewObligations read are exercised; review_goal drives the honesty branch.
  function spreadsheetProfile(reviewGoal: string[]): ReviewTargetProfileArtifact {
    const backed = reviewGoal.includes("formula_integrity");
    return {
      target_material_kind: "spreadsheet",
      target_input_kind: "single_file",
      target_scope_kind: "file",
      artifact_roles: { primary: "review_target", secondary: [] },
      closure_level: "close_in_target",
      review_goal: reviewGoal,
      closure_obligation_policy: [],
      material_profile: {
        support_status: backed ? "supported" : "partial",
        detection: { confidence: 0.9, confidence_basis: "test" },
      },
    } as unknown as ReviewTargetProfileArtifact;
  }

  it("emits formula/recalculation obligations when the spreadsheet goals are attached (inventory-backed)", () => {
    const summary = renderReviewTargetProfileSummary(
      spreadsheetProfile(["formula_integrity", "cross_sheet_reference_integrity"]),
    );
    expect(summary).toContain("recalculation behavior");
    expect(summary).not.toContain("could not be structurally inspected");
  });

  it("does NOT tell the lens to audit formulas when the honesty gate dropped the spreadsheet goals (no inventory backing)", () => {
    // partial profile whose spreadsheet review goals were dropped: the obligation surface
    // must agree with review_goal, not re-derive audit obligations from the bare kind.
    const summary = renderReviewTargetProfileSummary(spreadsheetProfile(["correctness"]));
    expect(summary).not.toContain("recalculation behavior");
    expect(summary).toContain("could not be structurally inspected");
    expect(summary).toContain("preserve material uncertainty");
  });
});
