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

  it("projects obligation prose from the backed goal SUBSET — a macro-only workbook is not told to audit formulas (issue-001/004)", () => {
    const summary = renderReviewTargetProfileSummary(
      spreadsheetProfile(["access_and_protection_hygiene"]),
    );
    // access_and_protection_hygiene is backed -> its prose appears; formula prose does not.
    expect(summary).toContain("sheet protection");
    expect(summary).not.toContain("recalculation behavior");
  });
});

describe("ontological anchoring — obligations flag (design §3-(a)/(B))", () => {
  function kindProfile(kind: string): ReviewTargetProfileArtifact {
    return {
      target_material_kind: kind,
      target_input_kind: "single_file",
      target_scope_kind: "file",
      artifact_roles: { primary: "review_target", secondary: [] },
      closure_level: "close_in_target",
      review_goal: ["correctness"],
      closure_obligation_policy: [],
      material_profile: {
        support_status: "supported",
        detection: { confidence: 0.9, confidence_basis: "test" },
      },
    } as unknown as ReviewTargetProfileArtifact;
  }

  // §7-1 flag-off equivalence: absent options, explicit false, and the exact
  // pre-flag prose must all coincide — the off path is byte-identical.
  it("flag-off renders the exact pre-flag code obligations (absent === explicit false)", () => {
    const absent = renderReviewTargetProfileSummary(kindProfile("code"));
    const explicitOff = renderReviewTargetProfileSummary(kindProfile("code"), {
      ontologicalObligations: false,
    });
    expect(absent).toBe(explicitOff);
    expect(absent).toContain(
      "Check visible type/runtime contract mismatches, edge-case input behavior, error/null/undefined paths, and caller-facing failure modes.",
    );
    expect(absent).toContain(
      "Classify a visible correctness or runtime-contract failure as material when it can violate the declared review goal inside the bounded target.",
    );
  });

  // §7-2 negative control: flag-on must not carry the mixed operational clause;
  // edge-case/null/failure-mode survive only inside the subordinated evidence-
  // channel clause.
  it("flag-on code: operational probing is subordinated to declared-contract evidence", () => {
    const on = renderReviewTargetProfileSummary(kindProfile("code"), {
      ontologicalObligations: true,
    });
    expect(on).not.toContain(
      "Check visible type/runtime contract mismatches, edge-case input behavior",
    );
    expect(on).toContain("satisfies the contracts it declares");
    expect(on).toContain(
      "evidence channels for whether the declared contracts hold",
    );
    expect(on).toContain("not as a free-standing operational bug hunt");
    expect(on).toContain(
      "material when it defeats the declared review goal inside the bounded target",
    );
  });

  it("flag-on database: probes are evidence channels for the declared data contract", () => {
    const on = renderReviewTargetProfileSummary(kindProfile("database"), {
      ontologicalObligations: true,
    });
    expect(on).not.toContain(
      "Check visible key/constraint mismatches, unsafe query assumptions, migration risks, and integrity failures.",
    );
    expect(on).toContain("uphold the data contract they declare");
    expect(on).toContain(
      "evidence channels for whether the declared data contract holds",
    );
  });

  it("flag does not touch document (and by the same switch, spreadsheet) prose", () => {
    const off = renderReviewTargetProfileSummary(kindProfile("document"));
    const on = renderReviewTargetProfileSummary(kindProfile("document"), {
      ontologicalObligations: true,
    });
    expect(on).toBe(off);
  });
});

describe("ontological anchoring — judgment_anchor in lens sidecar contract (design §3-(c) c-1)", () => {
  const baseArgs = {
    sessionDomain: "none",
    humanOutputPath: null,
    projectRoot: "/repo",
  };

  it("flag-off is byte-identical (absent === explicit false)", () => {
    const absent = renderLensSidecarOutputContract(baseArgs);
    const explicitOff = renderLensSidecarOutputContract({
      ...baseArgs,
      judgmentAnchor: false,
    });
    expect(absent).toBe(explicitOff);
    expect(absent).not.toContain("Severity judgment anchor");
  });

  it("flag-on appends a kind-neutral declared-purpose severity anchor (§7-3, §7-3c)", () => {
    const on = renderLensSidecarOutputContract({
      ...baseArgs,
      judgmentAnchor: true,
    });
    expect(on).toContain("Severity judgment anchor:");
    expect(on).toContain("value-alignment criteria");
    expect(on).toContain("materiality_basis.affected_purpose");
    // B-1: scope exclusion must route through admission, never severity demotion.
    expect(on).toContain("keeps its honest severity");
    expect(on).toContain("do not demote it for scope reasons");
    // §7-3c kind-neutrality: no code-domain vocabulary in the shared block.
    expect(on).not.toContain("edge-case");
    expect(on).not.toMatch(/separate tool/i);
  });
});
