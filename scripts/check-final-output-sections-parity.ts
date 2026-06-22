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
 *   (5) run.ts CONSUMES the module — imports the heading/id maps + the ordered accessors, and
 *       holds NO inline `## <Heading>` literal for any of the 8 sections (so a re-inlined or
 *       drifted heading cannot bypass the parity), and derives the bindings required_fragments
 *       from the module.
 * The authoritative completeness/anti-fooling check for a future 9th section that EMITS a heading
 * is the behavioral fixture matrix (run.test.ts) that activates every append path and compares
 * the emitted `## ` heading set to the module; this static guard catches the common re-inlining
 * and parity-drift cases (the source-text boundary is the same one G8 documented).
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
  PROMPT_POLICY_APPEND_SECTION_IDS,
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
  registryNode: unknown;
  runtimeSource: string;
}

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

  // (2) per-row attribute equality.
  for (const [id, mod] of moduleById) {
    const reg = registryById.get(id);
    if (!reg) continue;
    for (const attr of ROW_ATTRS) {
      const modVal = (mod as Record<string, unknown>)[attr] ?? null;
      const regVal = reg[attr] ?? null;
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

  // (5) run.ts SSOT consumption.
  const imported = importedSymbols(importBlock(inputs.runtimeSource));
  for (const sym of REQUIRED_MODULE_IMPORTS) {
    if (!imported.has(sym)) {
      errors.push(`${RUNTIME_REF} must import ${sym} from ${MODULE_SPECIFIER}`);
    }
  }
  if (!/runtimeProvenanceBindingsRequiredFragments\s*\(/.test(inputs.runtimeSource)) {
    errors.push(`${RUNTIME_REF} must derive runtime-provenance-bindings required_fragments via runtimeProvenanceBindingsRequiredFragments()`);
  }
  // No inline `## <Heading>` literal for any section — headings must be module-sourced.
  for (const heading of inputs.moduleHeadings) {
    if (inputs.runtimeSource.includes(`## ${heading}`)) {
      errors.push(`${RUNTIME_REF} contains an inline "## ${heading}" literal — emit it from FINAL_OUTPUT_SECTION_HEADINGS instead`);
    }
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
