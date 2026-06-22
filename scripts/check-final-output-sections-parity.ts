/**
 * G9 — final-output append-section parity guard (INV-SCHEMA-1).
 *
 * The reconstruct final output's section set has, historically, up to FOUR copies of each
 * section's identity scattered in run.ts (the emitter fn's inline `## <Heading>` literal, the
 * provenance binding's `heading` field, the prompt-policy `deterministic_runtime_append_sections`
 * hint, and the `required_fragments` section-id literal). G(c) consolidates that identity into
 * one runtime SSOT module src/core-runtime/reconstruct/final-output-sections.ts and declares it
 * in the registry node final_output_append_sections. This guard asserts:
 *   (1) module ⟷ registry exact-set parity on section_id, heading, and non-null prompt_policy_id;
 *   (2) per-row equality (heading / prompt_policy_id / emit_owner / provenance_binding_required /
 *       activation) keyed by section_id;
 *   (3) heading uniqueness (the provenance gate keys on heading);
 *   (4) the prompt-policy id set equals the module's non-null prompt_policy_id set;
 *   (5) run.ts CONSUMES the module — imports the heading/id maps + the ordered accessors and
 *       derives the bindings required_fragments from the module;
 *   (6) completeness / anti-fooling (static source-region sweep): EVERY `## ` heading literal in
 *       run.ts is a `## ${FINAL_OUTPUT_SECTION_HEADINGS.<key>}` template (no inline/re-inlined or
 *       NEW heading), and the appendFinalOutput* emitter-definition count equals the section
 *       count — so a 9th section (new emitter or non-module heading) fails CI at the source;
 *   (7) the run.ts provenance-binding row order equals the module's canonical bindings order.
 * The static sweep (6) is the enforceable completeness mechanism for the common cases (inline /
 * re-inlined / new heading, count drift, and the heading-key multiset). Its source-text boundary
 * is the same one G8 R5 documented: it cannot defend against every adversarial rewrite — e.g. a
 * BALANCED pairwise swap of two emitters' valid module templates leaves the multiset intact. The
 * AUTHORITATIVE backstop for those is BEHAVIORAL: the parity-test asserts each conditional emitter
 * emits its OWN module heading (catching a conditional swap), and the runtime provenance gate
 * (post-seed-validation, keyed on binding.heading) + the run.test.ts pipeline heading assertions
 * fail for any bound-section heading swap (the swapped section no longer carries its required
 * fragments). run.ts has no prose `## ` today, so the sweep is exact; a future legitimate `## `
 * prose line surfaces here and must be reconciled.
 *
 * npm: `check:final-output-sections-parity`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import {
  FINAL_OUTPUT_SECTIONS,
  FINAL_OUTPUT_SECTION_HEADINGS,
  FINAL_OUTPUT_SECTION_IDS,
  PROMPT_POLICY_APPEND_SECTION_IDS,
  provenanceBindingSectionIds,
  type FinalOutputSectionDescriptor,
} from "../src/core-runtime/reconstruct/final-output-sections.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REGISTRY_REF =
  ".onto/processes/reconstruct/reconstruct-contract-registry.yaml";
const RUNTIME_REF = "src/core-runtime/reconstruct/run.ts";
const MODULE_SPECIFIER = "./final-output-sections.js";
const REQUIRED_MODULE_IMPORTS = [
  "FINAL_OUTPUT_SECTION_HEADINGS",
  "FINAL_OUTPUT_SECTION_IDS",
  "promptPolicyAppendSectionIds",
  "runtimeProvenanceBindingsRequiredFragments",
];
const ROW_ATTRS = [
  "heading",
  "prompt_policy_id",
  "emit_owner",
  "provenance_binding_required",
  "activation",
] as const;

function setDiff(
  first: string[],
  second: string[],
): { onlyInFirst: string[]; onlyInSecond: string[] } {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  return {
    onlyInFirst: first.filter((x) => !secondSet.has(x)),
    onlyInSecond: second.filter((x) => !firstSet.has(x)),
  };
}

function importBlock(source: string): string | null {
  const m = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${MODULE_SPECIFIER.replace(/[.]/g, "\\$&")}["']`,
  ).exec(source);
  return m ? m[0]! : null;
}

function importedSymbols(block: string | null): Set<string> {
  if (!block) return new Set();
  const inner = /\{([^}]*)\}/.exec(block)?.[1] ?? "";
  return new Set(
    inner
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && !/\s+as\s+/.test(n)),
  );
}

export interface FinalOutputSectionsParityInputs {
  moduleSections: readonly FinalOutputSectionDescriptor[];
  modulePromptPolicyIds: readonly string[];
  moduleHeadings: readonly string[];
  /** Map of FINAL_OUTPUT_SECTION_IDS key -> section_id (for the run.ts bindings-order check). */
  moduleIdMap: Record<string, string>;
  /** Map of FINAL_OUTPUT_SECTION_HEADINGS key -> heading (for emitter/binding key checks). */
  moduleHeadingMap: Record<string, string>;
  /** Bound section_ids in the canonical bindings order (artifact before claim). */
  bindingsOrder: readonly string[];
  registryNode: unknown;
  runtimeSource: string;
}

/** The ONLY allowed run.ts heading form: a `## ${FINAL_OUTPUT_SECTION_HEADINGS.<key>}` template;
 * captures the heading key so the guard can assert each section heading is emitted exactly once. */
const ALLOWED_HEADING_RE = /`## \$\{FINAL_OUTPUT_SECTION_HEADINGS\.(\w+)\}`/g;
/** Any markdown `## ` heading inside a string/template — opened by a quote (single/double/
 * backtick) OR embedded after a newline (a literal `\n## ` or an actual line break in a template),
 * so a heading hidden mid-string (`"...\n## Ghost"`) is also counted. */
const ANY_HEADING_LITERAL_RE = /(?:['`"]|\\n|\n)## /g;
/** A run.ts provenance-binding row's section_id reference, in source order. */
const BINDING_SECTION_ID_RE = /section_id:\s*FINAL_OUTPUT_SECTION_IDS\.(\w+)/g;
/** A run.ts provenance-binding row's heading reference, in source order. */
const BINDING_HEADING_RE = /heading:\s*FINAL_OUTPUT_SECTION_HEADINGS\.(\w+)/g;
/** A final-output append emitter function definition. */
const APPEND_FN_DEF_RE = /function\s+appendFinalOutput\w+\s*\(/g;
/** The prompt-policy / required-fragments fields must be assigned the module accessor directly. */
const PROMPT_POLICY_FIELD_RE = /deterministic_runtime_append_sections:\s*promptPolicyAppendSectionIds\s*\(/;
const REQUIRED_FRAGMENTS_FIELD_RE = /required_fragments:\s*runtimeProvenanceBindingsRequiredFragments\s*\(/;

/** Pure parity comparison. Returns a (possibly empty) list of drift messages. */
export function evaluateFinalOutputSectionsParity(
  inputs: FinalOutputSectionsParityInputs,
): string[] {
  const errors: string[] = [];

  if (!Array.isArray(inputs.registryNode)) {
    return ["registry is missing the final_output_append_sections array node"];
  }
  const registryRows = inputs.registryNode as Record<string, unknown>[];
  if (registryRows.some((r) => r === null || typeof r !== "object")) {
    return ["final_output_append_sections rows must all be objects"];
  }

  // Reject duplicate section_id rows BEFORE building maps (maps would collapse them and the
  // set-diffs would pass while final_output_append_sections silently grew a duplicate).
  const moduleIds = inputs.moduleSections.map((s) => s.section_id);
  const registryIds = registryRows.map((r) => String(r.section_id));
  const dup = (ids: string[]): string[] => {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()].filter(([, c]) => c > 1).map(([id]) => id);
  };
  if (dup(moduleIds).length) errors.push(`module has duplicate section_id(s): ${dup(moduleIds).join(", ")}`);
  if (dup(registryIds).length) errors.push(`registry has duplicate section_id(s): ${dup(registryIds).join(", ")}`);

  const moduleById = new Map(inputs.moduleSections.map((s) => [s.section_id, s]));
  const registryById = new Map(
    registryRows.map((r) => [String(r.section_id), r]),
  );

  // (1) section_id set parity (first = module, second = registry).
  const idDiff = setDiff([...moduleById.keys()], [...registryById.keys()]);
  if (idDiff.onlyInFirst.length) errors.push(`section_id missing from registry: ${idDiff.onlyInFirst.join(", ")}`);
  if (idDiff.onlyInSecond.length) errors.push(`section_id extra in registry: ${idDiff.onlyInSecond.join(", ")}`);

  // heading + prompt_policy_id set parity.
  const headingDiff = setDiff(
    inputs.moduleSections.map((s) => s.heading),
    registryRows.map((r) => String(r.heading)),
  );
  if (headingDiff.onlyInFirst.length) errors.push(`heading missing from registry: ${headingDiff.onlyInFirst.join(", ")}`);
  if (headingDiff.onlyInSecond.length) errors.push(`heading extra in registry: ${headingDiff.onlyInSecond.join(", ")}`);

  const modulePolicyIds = inputs.moduleSections
    .map((s) => s.prompt_policy_id)
    .filter((id): id is string => id !== null);
  const registryPolicyIds = registryRows
    .map((r) => r.prompt_policy_id)
    .filter((id): id is string => typeof id === "string");
  const policyDiff = setDiff(modulePolicyIds, registryPolicyIds);
  if (policyDiff.onlyInFirst.length) errors.push(`prompt_policy_id missing from registry: ${policyDiff.onlyInFirst.join(", ")}`);
  if (policyDiff.onlyInSecond.length) errors.push(`prompt_policy_id extra in registry: ${policyDiff.onlyInSecond.join(", ")}`);

  // (2) per-row attribute equality. The registry row must DECLARE every attribute explicitly
  // (no `?? null` masking — a row that omits a field must not compare equal to the module's value).
  for (const [id, mod] of moduleById) {
    const reg = registryById.get(id);
    if (!reg) continue;
    for (const attr of ROW_ATTRS) {
      if (!(attr in reg)) {
        errors.push(`section ${id}: registry row is missing the ${attr} field`);
        continue;
      }
      const modVal = (mod as Record<string, unknown>)[attr];
      const regVal = reg[attr];
      if (modVal !== regVal) {
        errors.push(`section ${id}: ${attr} = ${JSON.stringify(regVal)} in registry, ${JSON.stringify(modVal)} in module`);
      }
    }
  }

  // (3) heading uniqueness (module).
  const headingCounts = new Map<string, number>();
  for (const s of inputs.moduleSections) {
    headingCounts.set(s.heading, (headingCounts.get(s.heading) ?? 0) + 1);
  }
  const dupHeadings = [...headingCounts.entries()].filter(([, c]) => c > 1).map(([h]) => h);
  if (dupHeadings.length) errors.push(`module headings are not unique: ${dupHeadings.join(", ")}`);

  // (4) prompt-policy id set == module non-null prompt_policy_id set
  // (first = PROMPT_POLICY_APPEND_SECTION_IDS, second = module bound policy ids).
  const ppDiff = setDiff([...inputs.modulePromptPolicyIds], modulePolicyIds);
  if (ppDiff.onlyInFirst.length) errors.push(`PROMPT_POLICY_APPEND_SECTION_IDS has id(s) with no bound section: ${ppDiff.onlyInFirst.join(", ")}`);
  if (ppDiff.onlyInSecond.length) errors.push(`PROMPT_POLICY_APPEND_SECTION_IDS is missing a bound prompt_policy_id: ${ppDiff.onlyInSecond.join(", ")}`);

  // module-internal: every heading constant is used by a descriptor (no orphan heading).
  const moduleHeadingSet = new Set(inputs.moduleHeadings);
  const descriptorHeadingSet = new Set(inputs.moduleSections.map((s) => s.heading));
  const headingConsistency = setDiff([...moduleHeadingSet], [...descriptorHeadingSet]);
  if (headingConsistency.onlyInFirst.length) errors.push(`heading constant(s) with no descriptor row: ${headingConsistency.onlyInFirst.join(", ")}`);
  if (headingConsistency.onlyInSecond.length) errors.push(`descriptor heading(s) with no FINAL_OUTPUT_SECTION_HEADINGS constant: ${headingConsistency.onlyInSecond.join(", ")}`);

  // (5) run.ts SSOT consumption — imports present AND the prompt-policy / required-fragments
  // fields are assigned the module accessor DIRECTLY (not just any call/import left in place).
  const imported = importedSymbols(importBlock(inputs.runtimeSource));
  for (const sym of REQUIRED_MODULE_IMPORTS) {
    if (!imported.has(sym)) {
      errors.push(`${RUNTIME_REF} must import ${sym} from ${MODULE_SPECIFIER}`);
    }
  }
  if (!PROMPT_POLICY_FIELD_RE.test(inputs.runtimeSource)) {
    errors.push(`${RUNTIME_REF} must assign deterministic_runtime_append_sections = promptPolicyAppendSectionIds() (not a re-inlined literal)`);
  }
  if (!REQUIRED_FRAGMENTS_FIELD_RE.test(inputs.runtimeSource)) {
    errors.push(`${RUNTIME_REF} must assign required_fragments = runtimeProvenanceBindingsRequiredFragments() at the runtime-provenance-bindings row (not a re-inlined literal)`);
  }

  // (6) completeness / anti-fooling — static source-region sweep:
  //   (a) EVERY markdown `## ` heading literal (single/double/backtick) is the module template,
  //   (b) the multiset of emitter heading KEYS equals the module heading keys exactly once each
  //       (so a re-inline, a NEW heading, OR an emitter using the WRONG valid module template
  //        fails), and
  //   (c) the appendFinalOutput* emitter-definition count equals the section count.
  // run.ts has no prose `## `, so the sweep is exact; a future legitimate `## ` prose line
  // surfaces here and must be reconciled.
  const headingLiterals = inputs.runtimeSource.match(ANY_HEADING_LITERAL_RE) ?? [];
  const emitterHeadingKeys = [...inputs.runtimeSource.matchAll(ALLOWED_HEADING_RE)].map((m) => m[1]!);
  if (headingLiterals.length !== emitterHeadingKeys.length) {
    errors.push(
      `${RUNTIME_REF} has ${headingLiterals.length - emitterHeadingKeys.length} final-output "## " heading literal(s) not of the module form \`## \${FINAL_OUTPUT_SECTION_HEADINGS.X}\` — every section heading must be emitted from the module (a new/re-inlined heading is not allowed)`,
    );
  }
  const headingKeyDiff = setDiff([...emitterHeadingKeys].sort(), Object.keys(inputs.moduleHeadingMap).sort());
  if (headingKeyDiff.onlyInFirst.length || headingKeyDiff.onlyInSecond.length || dup(emitterHeadingKeys).length) {
    errors.push(
      `${RUNTIME_REF} emitter heading keys [${[...emitterHeadingKeys].sort().join(", ")}] != module heading keys (each exactly once) — an emitter emits the wrong, a duplicate, or a missing module heading`,
    );
  }
  const appendFnCount = (inputs.runtimeSource.match(APPEND_FN_DEF_RE) ?? []).length;
  if (appendFnCount !== inputs.moduleSections.length) {
    errors.push(
      `${RUNTIME_REF} defines ${appendFnCount} appendFinalOutput* emitter(s) but the module declares ${inputs.moduleSections.length} sections — a new emitter needs a module descriptor + registry row`,
    );
  }

  // (7) bindings-array order — the run.ts provenance-binding rows' section_id AND heading order
  // must equal the module's canonical bindings order (load-bearing: it drives the rendered
  // bindings section text + the persisted validation artifact's section_bindings/required_fragments
  // dedup order; and the gate keys on heading, so a binding's heading must also be module-sourced).
  const runtimeBindingIds = [...inputs.runtimeSource.matchAll(BINDING_SECTION_ID_RE)]
    .map((m) => inputs.moduleIdMap[m[1]!])
    .filter((id): id is string => typeof id === "string");
  if (JSON.stringify(runtimeBindingIds) !== JSON.stringify([...inputs.bindingsOrder])) {
    errors.push(
      `${RUNTIME_REF} provenance-binding row section_id order [${runtimeBindingIds.join(", ")}] != module bindings order [${inputs.bindingsOrder.join(", ")}]`,
    );
  }
  const runtimeBindingHeadings = [...inputs.runtimeSource.matchAll(BINDING_HEADING_RE)]
    .map((m) => inputs.moduleHeadingMap[m[1]!])
    .filter((h): h is string => typeof h === "string");
  const expectedBindingHeadings = inputs.bindingsOrder
    .map((id) => inputs.moduleSections.find((s) => s.section_id === id)?.heading)
    .filter((h): h is string => typeof h === "string");
  if (JSON.stringify(runtimeBindingHeadings) !== JSON.stringify(expectedBindingHeadings)) {
    errors.push(
      `${RUNTIME_REF} provenance-binding row heading order != module bindings heading order (each binding heading must be FINAL_OUTPUT_SECTION_HEADINGS.<key> in bindings order)`,
    );
  }

  return errors;
}

async function main(): Promise<void> {
  let registry: unknown;
  try {
    registry = parseYaml(await fs.readFile(path.join(PROJECT_ROOT, REGISTRY_REF), "utf8"));
  } catch (error) {
    fail([`cannot read/parse ${REGISTRY_REF}: ${error instanceof Error ? error.message : String(error)}`]);
    return;
  }
  const registryNode = (registry as Record<string, unknown> | null)
    ?.["final_output_append_sections"];

  let runtimeSource: string;
  try {
    runtimeSource = await fs.readFile(path.join(PROJECT_ROOT, RUNTIME_REF), "utf8");
  } catch (error) {
    fail([`cannot read ${RUNTIME_REF}: ${error instanceof Error ? error.message : String(error)}`]);
    return;
  }

  const errors = evaluateFinalOutputSectionsParity({
    moduleSections: FINAL_OUTPUT_SECTIONS,
    modulePromptPolicyIds: PROMPT_POLICY_APPEND_SECTION_IDS,
    moduleHeadings: Object.values(FINAL_OUTPUT_SECTION_HEADINGS),
    moduleIdMap: FINAL_OUTPUT_SECTION_IDS,
    moduleHeadingMap: FINAL_OUTPUT_SECTION_HEADINGS,
    bindingsOrder: provenanceBindingSectionIds(),
    registryNode,
    runtimeSource,
  });

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log(
    JSON.stringify(
      {
        check: "final-output-sections-parity",
        status: "passed",
        invariant: "INV-SCHEMA-1",
        registry_node: `${REGISTRY_REF}#final_output_append_sections`,
        runtime_source: "src/core-runtime/reconstruct/final-output-sections.ts",
        section_count: FINAL_OUTPUT_SECTIONS.length,
      },
      null,
      2,
    ),
  );
}

function fail(errors: string[]): void {
  console.error("[check:final-output-sections-parity] FAIL");
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
