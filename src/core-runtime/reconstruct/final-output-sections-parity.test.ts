import { describe, expect, it } from "vitest";
import {
  FINAL_OUTPUT_SECTIONS,
  FINAL_OUTPUT_SECTION_HEADINGS,
  PROMPT_POLICY_APPEND_SECTION_IDS,
  promptPolicyAppendSectionIds,
  provenanceBindingSectionIds,
  runtimeProvenanceBindingsRequiredFragments,
} from "./final-output-sections.js";
import {
  evaluateFinalOutputSectionsParity,
  type FinalOutputSectionsParityInputs,
} from "../../../scripts/check-final-output-sections-parity.js";
import {
  appendFinalOutputDocumentProjectionTruncationSection,
  appendFinalOutputUnresolvedRevisionSection,
  appendFinalOutputWorkbookInventoryProjectionTruncationSection,
} from "./run.js";

const MODULE_HEADINGS = Object.values(FINAL_OUTPUT_SECTION_HEADINGS);

// A realistic run.ts: imports the module symbols, references the derivation accessor, and holds
// NO inline `## <Heading>` literal (all headings are emitted via the module constant).
const GOOD_RUNTIME_SOURCE = [
  "import {",
  "  FINAL_OUTPUT_SECTION_HEADINGS,",
  "  FINAL_OUTPUT_SECTION_IDS,",
  "  promptPolicyAppendSectionIds,",
  "  runtimeProvenanceBindingsRequiredFragments,",
  '} from "./final-output-sections.js";',
  "const h = `## ${FINAL_OUTPUT_SECTION_HEADINGS.seedAnswerability}`;",
  "const ids = FINAL_OUTPUT_SECTION_IDS.artifactTruth;",
  "const pp = promptPolicyAppendSectionIds();",
  "const rf = runtimeProvenanceBindingsRequiredFragments();",
].join("\n");

function matchedRegistryNode(): Record<string, unknown>[] {
  return FINAL_OUTPUT_SECTIONS.map((s) => ({ ...s }));
}

function evaluate(overrides: Partial<FinalOutputSectionsParityInputs>): string[] {
  return evaluateFinalOutputSectionsParity({
    moduleSections: FINAL_OUTPUT_SECTIONS,
    modulePromptPolicyIds: PROMPT_POLICY_APPEND_SECTION_IDS,
    moduleHeadings: MODULE_HEADINGS,
    registryNode: matchedRegistryNode(),
    runtimeSource: GOOD_RUNTIME_SOURCE,
    ...overrides,
  });
}

describe("final-output-sections module SSOT", () => {
  it("pins the prompt-policy order (claim before artifact), byte-identical to the frozen list", () => {
    expect(promptPolicyAppendSectionIds()).toEqual([
      "seed_answerability",
      "claim_projection",
      "artifact_truth",
      "provenance_footer",
      "provenance_bindings",
    ]);
  });

  it("pins the bindings order (artifact before claim), independent of the prompt-policy order", () => {
    expect(provenanceBindingSectionIds()).toEqual([
      "seed-answerability",
      "artifact-truth",
      "claim-projection",
      "runtime-artifact-truth-footer",
      "runtime-provenance-bindings",
    ]);
  });

  it("derives runtime-provenance-bindings required_fragments = the other 4 bound ids (bindings order)", () => {
    expect(runtimeProvenanceBindingsRequiredFragments()).toEqual([
      "seed-answerability",
      "artifact-truth",
      "claim-projection",
      "runtime-artifact-truth-footer",
    ]);
  });
});

describe("final-output-sections parity guard (G9 / INV-SCHEMA-1)", () => {
  it("passes when the registry node exactly matches the module", () => {
    expect(evaluate({})).toEqual([]);
  });

  it("fails when a registry section_id drifts", () => {
    const node = matchedRegistryNode();
    node[0]!.section_id = "seed-answerability-typo";
    expect(evaluate({ registryNode: node }).some((m) => m.includes("section_id"))).toBe(true);
  });

  it("fails when a registry heading drifts", () => {
    const node = matchedRegistryNode();
    node[1]!.heading = "Artifacts Truth";
    expect(evaluate({ registryNode: node }).some((m) => m.includes("heading"))).toBe(true);
  });

  it("fails when a registry prompt_policy_id drifts", () => {
    const node = matchedRegistryNode();
    node[2]!.prompt_policy_id = "claim-projection";
    expect(evaluate({ registryNode: node }).some((m) => m.includes("prompt_policy_id"))).toBe(true);
  });

  it("fails when a registry emit_owner drifts", () => {
    const node = matchedRegistryNode();
    node[5]!.emit_owner = "always_section";
    expect(evaluate({ registryNode: node }).some((m) => m.includes("emit_owner"))).toBe(true);
  });

  it("fails when a registry activation drifts", () => {
    const node = matchedRegistryNode();
    node[7]!.activation = "always";
    expect(evaluate({ registryNode: node }).some((m) => m.includes("activation"))).toBe(true);
  });

  it("fails when a registry provenance_binding_required drifts", () => {
    const node = matchedRegistryNode();
    node[0]!.provenance_binding_required = false;
    expect(evaluate({ registryNode: node }).some((m) => m.includes("provenance_binding_required"))).toBe(true);
  });

  it("fails when a registry row is missing", () => {
    const node = matchedRegistryNode().slice(0, 7);
    expect(evaluate({ registryNode: node }).some((m) => m.includes("missing from registry"))).toBe(true);
  });

  it("fails when an extra registry row is present", () => {
    const node = [...matchedRegistryNode(), { section_id: "ghost", heading: "Ghost", prompt_policy_id: null, emit_owner: "conditional_markdown", provenance_binding_required: false, activation: "never" }];
    expect(evaluate({ registryNode: node }).some((m) => m.includes("extra in registry"))).toBe(true);
  });

  it("fails when a module heading is not unique (duplicate-heading guard)", () => {
    const dupSections = FINAL_OUTPUT_SECTIONS.map((s, i) =>
      i === 1 ? { ...s, heading: FINAL_OUTPUT_SECTION_HEADINGS.seedAnswerability } : s
    );
    const errors = evaluateFinalOutputSectionsParity({
      moduleSections: dupSections,
      modulePromptPolicyIds: PROMPT_POLICY_APPEND_SECTION_IDS,
      moduleHeadings: dupSections.map((s) => s.heading),
      registryNode: dupSections.map((s) => ({ ...s })),
      runtimeSource: GOOD_RUNTIME_SOURCE,
    });
    expect(errors.some((m) => m.includes("not unique"))).toBe(true);
  });

  it("fails when run.ts does not import a required module symbol", () => {
    const src = GOOD_RUNTIME_SOURCE.replace("  promptPolicyAppendSectionIds,\n", "");
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("must import promptPolicyAppendSectionIds"))).toBe(true);
  });

  it("fails when run.ts holds an inline `## <Heading>` literal", () => {
    const src = GOOD_RUNTIME_SOURCE + '\nconst inline = "## Artifact Truth";';
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes('inline "## Artifact Truth"'))).toBe(true);
  });

  it("fails when run.ts does not derive required_fragments from the module", () => {
    const src = GOOD_RUNTIME_SOURCE.replace("const rf = runtimeProvenanceBindingsRequiredFragments();", "");
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("runtimeProvenanceBindingsRequiredFragments"))).toBe(true);
  });
});

describe("final-output conditional emitters source their heading from the module (behavioral)", () => {
  it("emits the module heading for the document projection truncation section", () => {
    const out = appendFinalOutputDocumentProjectionTruncationSection("# Result\n", [
      {
        observation_id: "obs-1",
        source_ref: "src/big.ts",
        target_material_kind: "code",
        captured_chars: 9000,
        projection_budget_chars: 1200,
      },
    ]);
    expect(out).toContain(`## ${FINAL_OUTPUT_SECTION_HEADINGS.sourceProjectionTruncation}`);
  });

  it("emits the module heading for the workbook inventory truncation section", () => {
    const out = appendFinalOutputWorkbookInventoryProjectionTruncationSection("# Result\n", [
      {
        observation_id: "obs-2",
        source_ref: "data/book.xlsx",
        sections: [{ section: "sheets", kept: 5, total: 14 }],
      },
    ]);
    expect(out).toContain(`## ${FINAL_OUTPUT_SECTION_HEADINGS.workbookInventoryProjectionTruncation}`);
  });

  it("emits the module heading for the unresolved revision section", () => {
    const out = appendFinalOutputUnresolvedRevisionSection("# Result\n", {
      proposals: [
        { proposal_id: "p1", target_type: "seed", target_id: "seed-1", action: "reject", rationale: "r", expected_effect: "e" },
      ],
    } as never);
    expect(out).toContain(`## ${FINAL_OUTPUT_SECTION_HEADINGS.unresolvedRevisionProposals}`);
  });
});
