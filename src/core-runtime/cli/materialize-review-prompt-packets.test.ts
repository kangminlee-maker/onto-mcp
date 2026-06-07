import { describe, expect, it } from "vitest";
import type { InvocationBindingArtifact } from "../review/artifact-types.js";
import {
  renderBoundaryPolicySection,
  renderEmbeddedMaterializedInputSection,
  renderLensOutputSchemaGate,
  renderLensSidecarOutputContract,
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
