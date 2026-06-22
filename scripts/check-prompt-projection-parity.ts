/**
 * G8 — prompt-projection field-parity guard (INV-SCHEMA-1).
 *
 * The competency-question assessment prompt projection has TWO declarations that must
 * not drift: the runtime SSOT
 * src/core-runtime/reconstruct/competency-projection-contract.ts
 * (competencyQuestionAssessmentProjectionContract() + budget constants) and the registry
 * node prompt_projection_contracts.competency_question_assessment in
 * .onto/processes/reconstruct/reconstruct-contract-registry.yaml. This guard asserts:
 *   (1) the registry payload_fields EXACTLY equal the contract's top-level keys (set);
 *   (2) the registry policy_fields EXACTLY equal the contract's batching_policy keys (set);
 *   (3) the registry budget_fields EXACTLY equal the budgets the contract OUTPUT embeds
 *       (and those embedded values equal the exported budget constants — module-internal
 *       consistency), so a hardcoded contract-output edit cannot pass;
 *   (4) run.ts CONSUMES the extracted module — it imports the contract fn AND all three
 *       budget constants from it (symbol-level) and holds NO duplicate local definition —
 *       so the registry/module parity certifies the actual runtime prompt surface, not a
 *       stale fork (onto issue-001);
 *   (5) NO unguarded sibling exists under prompt_projection_contracts — every declared
 *       projection must have a runtime parity check here, or the guard fails.
 * Adding/dropping a field or budget on either side without updating the other fails CI.
 *
 * The pure comparison (evaluatePromptProjectionParity) is exported for the self-test;
 * main() does the I/O and exits non-zero on any mismatch.
 *
 * npm: `check:prompt-projection-parity`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import {
  COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,
  COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,
  COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
  competencyQuestionAssessmentProjectionContract,
} from "../src/core-runtime/reconstruct/competency-projection-contract.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REGISTRY_REF =
  ".onto/processes/reconstruct/reconstruct-contract-registry.yaml";
const RUNTIME_REF = "src/core-runtime/reconstruct/run.ts";
const MODULE_SPECIFIER = "./competency-projection-contract.js";

/** The only projection sibling with a runtime parity check wired here. Adding a new
 * sibling to the registry's prompt_projection_contracts node REQUIRES adding it (and a
 * module parity check) here, or the guard fails on the unguarded sibling. */
const SUPPORTED_PROJECTION_KEYS = ["competency_question_assessment"];

/** Symbols run.ts MUST import from the extracted module so its prompt builder cannot
 * silently use different budget numbers (the contract fn + the three budget constants). */
const REQUIRED_MODULE_IMPORTS = [
  "competencyQuestionAssessmentProjectionContract",
  "COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT",
  "COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT",
  "COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS",
];
const MOVED_BUDGET_CONSTANTS = [
  "COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT",
  "COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT",
  "COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS",
];

/** Exact-set diff between a declared list and the runtime key set. */
function setDiff(
  declared: string[],
  runtime: string[],
): { missing: string[]; extra: string[]; duplicates: string[] } {
  const declaredCounts = new Map<string, number>();
  for (const key of declared) {
    declaredCounts.set(key, (declaredCounts.get(key) ?? 0) + 1);
  }
  const duplicates = [...declaredCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  const declaredSet = new Set(declared);
  const runtimeSet = new Set(runtime);
  const missing = runtime.filter((key) => !declaredSet.has(key));
  const extra = declared.filter((key) => !runtimeSet.has(key));
  return { missing, extra, duplicates };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Names imported from MODULE_SPECIFIER in run.ts source (the `{ ... }` block). */
function moduleImportedSymbols(runtimeSource: string): Set<string> {
  const block = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${MODULE_SPECIFIER.replace(/[.]/g, "\\$&")}["']`,
  ).exec(runtimeSource);
  if (!block) return new Set();
  return new Set(
    block[1]!
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/)[0]!.trim())
      .filter((name) => name.length > 0),
  );
}

export interface PromptProjectionParityInputs {
  /** Runtime contract output (competencyQuestionAssessmentProjectionContract()). */
  contract: Record<string, unknown>;
  /** Runtime budget constants (the SSOT module's exported numbers). */
  runtimeBudgets: Record<string, number>;
  /** The registry parent node prompt_projection_contracts (all siblings). */
  promptProjectionContracts: unknown;
  /** run.ts source text (for the SSOT-consumption assertion). */
  runtimeSource: string;
}

/** Pure parity comparison. Returns a (possibly empty) list of drift messages. */
export function evaluatePromptProjectionParity(
  inputs: PromptProjectionParityInputs,
): string[] {
  const errors: string[] = [];
  const payloadKeys = Object.keys(inputs.contract);
  const batchingPolicy = inputs.contract.batching_policy;
  if (batchingPolicy === null || typeof batchingPolicy !== "object") {
    errors.push("runtime contract: batching_policy is not an object");
  }
  const batchingPolicyRecord =
    batchingPolicy && typeof batchingPolicy === "object"
      ? (batchingPolicy as Record<string, unknown>)
      : {};
  const policyKeys = Object.keys(batchingPolicyRecord);

  // (5) parent node + no unguarded siblings.
  if (!inputs.promptProjectionContracts || typeof inputs.promptProjectionContracts !== "object") {
    return [...errors, "registry is missing the prompt_projection_contracts node"];
  }
  const parent = inputs.promptProjectionContracts as Record<string, unknown>;
  const unguarded = Object.keys(parent).filter(
    (key) => !SUPPORTED_PROJECTION_KEYS.includes(key),
  );
  if (unguarded.length) {
    errors.push(
      `prompt_projection_contracts has unguarded sibling(s) with no runtime parity check: ${unguarded.join(", ")} (add a module parity check + extend SUPPORTED_PROJECTION_KEYS)`,
    );
  }
  const declared = parent.competency_question_assessment;
  if (!declared || typeof declared !== "object") {
    return [
      ...errors,
      "registry is missing prompt_projection_contracts.competency_question_assessment",
    ];
  }
  const declaredNode = declared as Record<string, unknown>;

  // (1) payload_fields exact-set.
  if (!isStringArray(declaredNode.payload_fields)) {
    errors.push("registry payload_fields must be a string array");
  } else {
    const { missing, extra, duplicates } = setDiff(declaredNode.payload_fields, payloadKeys);
    if (missing.length) errors.push(`payload_fields missing (in contract, not registry): ${missing.join(", ")}`);
    if (extra.length) errors.push(`payload_fields extra (in registry, not contract): ${extra.join(", ")}`);
    if (duplicates.length) errors.push(`payload_fields duplicated: ${duplicates.join(", ")}`);
  }

  // (2) policy_fields exact-set.
  if (!isStringArray(declaredNode.policy_fields)) {
    errors.push("registry policy_fields must be a string array");
  } else {
    const { missing, extra, duplicates } = setDiff(declaredNode.policy_fields, policyKeys);
    if (missing.length) errors.push(`policy_fields missing (in batching_policy, not registry): ${missing.join(", ")}`);
    if (extra.length) errors.push(`policy_fields extra (in registry, not batching_policy): ${extra.join(", ")}`);
    if (duplicates.length) errors.push(`policy_fields duplicated: ${duplicates.join(", ")}`);
  }

  // (3) budget_fields exact-value — certify the CONTRACT OUTPUT (the actual prompt
  // surface), and cross-check the output equals the exported constants so a hardcoded
  // contract-output edit or a divergent constant is caught.
  const contractBudgets: Record<string, unknown> = {
    prompt_char_limit: inputs.contract.prompt_char_limit,
    source_evidence_excerpt_char_limit: inputs.contract.source_evidence_excerpt_char_limit,
    build_budget_reserve_chars: batchingPolicyRecord.build_budget_reserve_chars,
  };
  for (const [key, expected] of Object.entries(inputs.runtimeBudgets)) {
    if (contractBudgets[key] !== expected) {
      errors.push(
        `contract OUTPUT ${key} = ${String(contractBudgets[key])} but exported constant = ${expected} (module-internal drift)`,
      );
    }
  }
  const declaredBudgets = declaredNode.budget_fields;
  if (!declaredBudgets || typeof declaredBudgets !== "object") {
    errors.push("registry budget_fields must be an object");
  } else {
    const declaredBudgetMap = declaredBudgets as Record<string, unknown>;
    const { missing, extra } = setDiff(
      Object.keys(declaredBudgetMap),
      Object.keys(contractBudgets),
    );
    if (missing.length) errors.push(`budget_fields missing: ${missing.join(", ")}`);
    if (extra.length) errors.push(`budget_fields extra: ${extra.join(", ")}`);
    for (const [key, expected] of Object.entries(contractBudgets)) {
      if (declaredBudgetMap[key] !== expected) {
        errors.push(`budget_fields.${key} = ${String(declaredBudgetMap[key])}, contract output = ${String(expected)}`);
      }
    }
  }

  // (4) run.ts consumes the extracted module (symbol-level); no duplicate local definition.
  const imported = moduleImportedSymbols(inputs.runtimeSource);
  for (const symbol of REQUIRED_MODULE_IMPORTS) {
    if (!imported.has(symbol)) {
      errors.push(`${RUNTIME_REF} must import ${symbol} from ${MODULE_SPECIFIER}`);
    }
  }
  if (/function\s+competencyQuestionAssessmentProjectionContract\s*\(/.test(inputs.runtimeSource)) {
    errors.push(`${RUNTIME_REF} redefines competencyQuestionAssessmentProjectionContract locally — the extracted module is the single source of truth`);
  }
  for (const constant of MOVED_BUDGET_CONSTANTS) {
    if (new RegExp(`const\\s+${constant}\\s*=`).test(inputs.runtimeSource)) {
      errors.push(`${RUNTIME_REF} redeclares ${constant} locally — import it from ${MODULE_SPECIFIER}`);
    }
  }

  return errors;
}

async function main(): Promise<void> {
  let registry: unknown;
  try {
    registry = parseYaml(
      await fs.readFile(path.join(PROJECT_ROOT, REGISTRY_REF), "utf8"),
    );
  } catch (error) {
    fail([
      `cannot read/parse ${REGISTRY_REF}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ]);
    return;
  }
  const promptProjectionContracts = (registry as Record<string, unknown> | null)
    ?.["prompt_projection_contracts"];

  let runtimeSource: string;
  try {
    runtimeSource = await fs.readFile(path.join(PROJECT_ROOT, RUNTIME_REF), "utf8");
  } catch (error) {
    fail([
      `cannot read ${RUNTIME_REF}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ]);
    return;
  }

  const contract = competencyQuestionAssessmentProjectionContract();
  const errors = evaluatePromptProjectionParity({
    contract,
    runtimeBudgets: {
      prompt_char_limit: COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
      source_evidence_excerpt_char_limit:
        COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,
      build_budget_reserve_chars:
        COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,
    },
    promptProjectionContracts,
    runtimeSource,
  });

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log(
    JSON.stringify(
      {
        check: "prompt-projection-parity",
        status: "passed",
        invariant: "INV-SCHEMA-1",
        registry_node:
          `${REGISTRY_REF}#prompt_projection_contracts.competency_question_assessment`,
        runtime_source:
          "src/core-runtime/reconstruct/competency-projection-contract.ts",
        payload_field_count: Object.keys(contract).length,
      },
      null,
      2,
    ),
  );
}

function fail(errors: string[]): void {
  console.error("[check:prompt-projection-parity] FAIL");
  for (const message of errors) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

// Only run the CLI when invoked directly, not when imported by the self-test.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
