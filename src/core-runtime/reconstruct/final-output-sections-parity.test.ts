import { describe, expect, it } from "vitest";
import {
  FINAL_OUTPUT_SECTIONS,
  FINAL_OUTPUT_SECTION_HEADINGS,
  FINAL_OUTPUT_SECTION_IDS,
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
const HEADING_KEY_BY_VALUE = Object.fromEntries(
  Object.entries(FINAL_OUTPUT_SECTION_HEADINGS).map(([k, v]) => [v, k]),
);
const ID_KEY_BY_VALUE = Object.fromEntries(
  Object.entries(FINAL_OUTPUT_SECTION_IDS).map(([k, v]) => [v, k]),
);

// A faithful synthetic run.ts (generated from the module so it stays in sync): one append
// emitter per section emitting its module heading template, the 5 binding rows in module order,
// the required-fragments derivation, and the module imports. Satisfies every run.ts-structure
// check (heading sweep, append-fn count, bindings order, consumption).
function buildRuntimeSource(): string {
  const importLine =
    'import { FINAL_OUTPUT_SECTION_HEADINGS, FINAL_OUTPUT_SECTION_IDS, promptPolicyAppendSectionIds, runtimeProvenanceBindingsRequiredFragments } from "./final-output-sections.js";';
  const appendFns = FINAL_OUTPUT_SECTIONS.map((s) => {
    const hk = HEADING_KEY_BY_VALUE[s.heading];
    return `function appendFinalOutput_${hk}Section() { return \`## \${FINAL_OUTPUT_SECTION_HEADINGS.${hk}}\`; }`;
  }).join("\n");
  const bindingRows = FINAL_OUTPUT_SECTIONS.filter((s) => s.provenance_binding_required)
    .map((s) => `  { section_id: FINAL_OUTPUT_SECTION_IDS.${ID_KEY_BY_VALUE[s.section_id]} },`)
    .join("\n");
  const tail =
    "const rf = runtimeProvenanceBindingsRequiredFragments();\nconst pp = promptPolicyAppendSectionIds();";
  return [importLine, appendFns, `const bindings = [\n${bindingRows}\n];`, tail].join("\n");
}

const GOOD_RUNTIME_SOURCE = buildRuntimeSource();

function matchedRegistryNode(): Record<string, unknown>[] {
  return FINAL_OUTPUT_SECTIONS.map((s) => ({ ...s }));
}

function evaluate(overrides: Partial<FinalOutputSectionsParityInputs>): string[] {
  return evaluateFinalOutputSectionsParity({
    moduleSections: FINAL_OUTPUT_SECTIONS,
    modulePromptPolicyIds: PROMPT_POLICY_APPEND_SECTION_IDS,
    moduleHeadings: MODULE_HEADINGS,
    moduleIdMap: FINAL_OUTPUT_SECTION_IDS,
    bindingsOrder: provenanceBindingSectionIds(),
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
      moduleIdMap: FINAL_OUTPUT_SECTION_IDS,
      bindingsOrder: provenanceBindingSectionIds(),
      registryNode: dupSections.map((s) => ({ ...s })),
      runtimeSource: GOOD_RUNTIME_SOURCE,
    });
    expect(errors.some((m) => m.includes("not unique"))).toBe(true);
  });

  it("fails when the prompt-policy id set drifts from the bound section policy ids (clause 4)", () => {
    const errors = evaluate({ modulePromptPolicyIds: ["seed_answerability", "claim_projection", "artifact_truth", "provenance_footer", "ghost_policy"] });
    expect(errors.some((m) => m.includes("PROMPT_POLICY_APPEND_SECTION_IDS"))).toBe(true);
  });

  it("fails when run.ts does not import a required module symbol", () => {
    const src = GOOD_RUNTIME_SOURCE.replace("promptPolicyAppendSectionIds, ", "");
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("must import promptPolicyAppendSectionIds"))).toBe(true);
  });

  it("fails when run.ts does not derive required_fragments from the module", () => {
    const src = GOOD_RUNTIME_SOURCE.replace("const rf = runtimeProvenanceBindingsRequiredFragments();", "");
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("runtimeProvenanceBindingsRequiredFragments"))).toBe(true);
  });

  it("ANTI-FOOLING: fails when run.ts re-inlines a known heading as a literal", () => {
    const src = GOOD_RUNTIME_SOURCE + '\nconst inlined = "## Artifact Truth";';
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes('heading literal(s) not of the module form'))).toBe(true);
  });

  it("ANTI-FOOLING: fails when run.ts emits a NEW non-module `## ` heading (a 9th section)", () => {
    const src = GOOD_RUNTIME_SOURCE + '\nconst novel = "## Brand New Untracked Section";';
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes('heading literal(s) not of the module form'))).toBe(true);
  });

  it("ANTI-FOOLING: fails when run.ts adds a NEW appendFinalOutput* emitter (count drift)", () => {
    const src = GOOD_RUNTIME_SOURCE + "\nfunction appendFinalOutputGhostSection() {}";
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("appendFinalOutput* emitter"))).toBe(true);
  });

  it("fails when the run.ts provenance-binding row order drifts from the module bindings order", () => {
    // Swap the first two binding rows (seed-answerability <-> artifact-truth).
    const src = GOOD_RUNTIME_SOURCE
      .replace("FINAL_OUTPUT_SECTION_IDS.seedAnswerability", "__TMP__")
      .replace("FINAL_OUTPUT_SECTION_IDS.artifactTruth", "FINAL_OUTPUT_SECTION_IDS.seedAnswerability")
      .replace("__TMP__", "FINAL_OUTPUT_SECTION_IDS.artifactTruth");
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("provenance-binding row order"))).toBe(true);
  });
});

describe("final-output conditional emitters: heading-set equals the module's conditional set (behavioral)", () => {
  it("emits exactly the 3 conditional module headings when all 3 paths are activated", () => {
    let out = "# Result\n";
    out = appendFinalOutputDocumentProjectionTruncationSection(out, [
      { observation_id: "obs-1", source_ref: "src/big.ts", target_material_kind: "code", captured_chars: 9000, projection_budget_chars: 1200 },
    ]);
    out = appendFinalOutputWorkbookInventoryProjectionTruncationSection(out, [
      { observation_id: "obs-2", source_ref: "data/book.xlsx", sections: [{ section: "sheets", kept: 5, total: 14 }] },
    ]);
    out = appendFinalOutputUnresolvedRevisionSection(out, {
      proposals: [{ proposal_id: "p1", target_type: "seed", target_id: "seed-1", action: "reject", rationale: "r", expected_effect: "e" }],
    } as never);

    const emittedHeadings = new Set(
      [...out.matchAll(/^## (.+)$/gm)].map((m) => m[1]!),
    );
    const expectedConditional = new Set(
      FINAL_OUTPUT_SECTIONS.filter((s) => s.emit_owner === "conditional_markdown").map((s) => s.heading),
    );
    expect(emittedHeadings).toEqual(expectedConditional);
  });
});
