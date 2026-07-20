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
  appendFinalOutputCodeInventoryProjectionTruncationSection,
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
  const policy =
    "const policy = { deterministic_runtime_append_sections: promptPolicyAppendSectionIds() };";
  const bindingRows = FINAL_OUTPUT_SECTIONS.filter((s) => s.provenance_binding_required)
    .map((s) => {
      const idk = ID_KEY_BY_VALUE[s.section_id];
      const hk = HEADING_KEY_BY_VALUE[s.heading];
      const rf = s.section_id === "runtime-provenance-bindings"
        ? " required_fragments: runtimeProvenanceBindingsRequiredFragments(),"
        : "";
      return `  { section_id: FINAL_OUTPUT_SECTION_IDS.${idk}, heading: FINAL_OUTPUT_SECTION_HEADINGS.${hk},${rf} },`;
    })
    .join("\n");
  return [importLine, appendFns, policy, `const bindings = [\n${bindingRows}\n];`].join("\n");
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
    moduleHeadingMap: FINAL_OUTPUT_SECTION_HEADINGS,
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
      moduleHeadingMap: FINAL_OUTPUT_SECTION_HEADINGS,
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

  it("fails when run.ts re-inlines required_fragments instead of deriving it at the field (codex G2)", () => {
    const src = GOOD_RUNTIME_SOURCE.replace(
      " required_fragments: runtimeProvenanceBindingsRequiredFragments(),",
      ' required_fragments: ["seed-answerability","artifact-truth","claim-projection","runtime-artifact-truth-footer"],',
    );
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("required_fragments = runtimeProvenanceBindingsRequiredFragments()"))).toBe(true);
  });

  it("fails when run.ts re-inlines the prompt-policy list instead of the module accessor (codex G3)", () => {
    const src = GOOD_RUNTIME_SOURCE.replace(
      "deterministic_runtime_append_sections: promptPolicyAppendSectionIds()",
      'deterministic_runtime_append_sections: ["seed_answerability","claim_projection","artifact_truth","provenance_footer","provenance_bindings"]',
    );
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("deterministic_runtime_append_sections = promptPolicyAppendSectionIds()"))).toBe(true);
  });

  it("ANTI-FOOLING: fails when a known heading is re-inlined as a SINGLE-quoted literal (codex G1)", () => {
    const src = GOOD_RUNTIME_SOURCE + "\nconst inlined = '## Artifact Truth';";
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("heading literal(s) not of the module form"))).toBe(true);
  });

  it("ANTI-FOOLING: fails when an emitter uses the WRONG valid module heading template (key swap, codex G6)", () => {
    const src = GOOD_RUNTIME_SOURCE.replace(
      "`## ${FINAL_OUTPUT_SECTION_HEADINGS.artifactTruth}`",
      "`## ${FINAL_OUTPUT_SECTION_HEADINGS.claimProjection}`",
    );
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("emitter heading keys"))).toBe(true);
  });

  it("fails when a binding row's heading drifts from the module bindings order (codex G4)", () => {
    // Swap the first two binding-row headings (section_ids stay in order).
    const src = GOOD_RUNTIME_SOURCE
      .replace("heading: FINAL_OUTPUT_SECTION_HEADINGS.seedAnswerability,", "heading: __TMPH__,")
      .replace("heading: FINAL_OUTPUT_SECTION_HEADINGS.artifactTruth,", "heading: FINAL_OUTPUT_SECTION_HEADINGS.seedAnswerability,")
      .replace("heading: __TMPH__,", "heading: FINAL_OUTPUT_SECTION_HEADINGS.artifactTruth,");
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("binding row heading order"))).toBe(true);
  });

  it("fails when the registry repeats a section_id row (codex round-1 G5)", () => {
    const node = matchedRegistryNode();
    node.push({ ...node[0]! });
    expect(evaluate({ registryNode: node }).some((m) => m.includes("registry has duplicate section_id"))).toBe(true);
  });

  it("ANTI-FOOLING: fails when a NEW heading is embedded mid-string (\\n## Ghost) (codex round-2 G3)", () => {
    const src = GOOD_RUNTIME_SOURCE + '\nconst hidden = "section body\\n## Ghost Section\\nmore";';
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("heading literal(s) not of the module form"))).toBe(true);
  });

  it("fails when a registry row omits a field instead of declaring it (codex round-2 G5)", () => {
    const node = matchedRegistryNode();
    delete node[5]!.prompt_policy_id; // conditional row omits the explicit null
    expect(evaluate({ registryNode: node }).some((m) => m.includes("missing the prompt_policy_id field"))).toBe(true);
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

  it("fails when the run.ts provenance-binding section_id order drifts from the module bindings order", () => {
    // Swap the first two binding rows' section_ids (seed-answerability <-> artifact-truth).
    const src = GOOD_RUNTIME_SOURCE
      .replace("section_id: FINAL_OUTPUT_SECTION_IDS.seedAnswerability", "section_id: __TMP__")
      .replace("section_id: FINAL_OUTPUT_SECTION_IDS.artifactTruth", "section_id: FINAL_OUTPUT_SECTION_IDS.seedAnswerability")
      .replace("section_id: __TMP__", "section_id: FINAL_OUTPUT_SECTION_IDS.artifactTruth");
    expect(evaluate({ runtimeSource: src }).some((m) => m.includes("section_id order"))).toBe(true);
  });
});

describe("final-output conditional emitters: each emits its OWN module heading + the set matches (behavioral)", () => {
  const docOut = appendFinalOutputDocumentProjectionTruncationSection("# Result\n", [
    { observation_id: "obs-1", source_ref: "src/big.ts", target_material_kind: "code", captured_chars: 9000, projection_budget_chars: 1200 },
  ]);
  const wbOut = appendFinalOutputWorkbookInventoryProjectionTruncationSection("# Result\n", [
    { observation_id: "obs-2", source_ref: "data/book.xlsx", sections: [{ section: "sheets", kept: 5, total: 14 }] },
  ]);
  const codeOut = appendFinalOutputCodeInventoryProjectionTruncationSection("# Result\n", [
    { observation_id: "obs-4", source_ref: "src/run.ts", sections: [{ section: "symbol_tiles.spans", kept: 120, total: 1269 }] },
  ]);
  const revOut = appendFinalOutputUnresolvedRevisionSection("# Result\n", {
    proposals: [{ proposal_id: "p1", target_type: "seed", target_id: "seed-1", action: "reject", rationale: "r", expected_effect: "e" }],
  } as never);

  // Per-emitter assertions (each emits ITS OWN heading) catch a balanced pairwise swap that the
  // static multiset sweep cannot — codex round-2 G1.
  it("document-truncation emitter emits its own module heading", () => {
    expect(docOut).toContain(`## ${FINAL_OUTPUT_SECTION_HEADINGS.sourceProjectionTruncation}`);
  });
  it("workbook-inventory emitter emits its own module heading", () => {
    expect(wbOut).toContain(`## ${FINAL_OUTPUT_SECTION_HEADINGS.workbookInventoryProjectionTruncation}`);
  });
  it("code-inventory emitter emits its own module heading", () => {
    expect(codeOut).toContain(`## ${FINAL_OUTPUT_SECTION_HEADINGS.codeInventoryProjectionTruncation}`);
  });
  it("unresolved-revision emitter emits its own module heading", () => {
    expect(revOut).toContain(`## ${FINAL_OUTPUT_SECTION_HEADINGS.unresolvedRevisionProposals}`);
  });

  it("emits exactly the 4 conditional module headings when all 4 paths are activated (set equality)", () => {
    const out = docOut + wbOut + codeOut + revOut;
    const emittedHeadings = new Set([...out.matchAll(/^## (.+)$/gm)].map((m) => m[1]!));
    const expectedConditional = new Set(
      FINAL_OUTPUT_SECTIONS.filter((s) => s.emit_owner === "conditional_markdown").map((s) => s.heading),
    );
    expect(emittedHeadings).toEqual(expectedConditional);
  });
});
