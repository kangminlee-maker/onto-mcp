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
 *   (4) the projection child node has NO unguarded extra key beyond payload/policy/budget;
 *   (5) the runtime prompt surface (RUNTIME_REFS) CONSUMES the extracted module — it imports
 *       the contract fn AND all three budget constants from it (symbol-level) AND actually
 *       references each budget constant outside the import, and holds NO duplicate local
 *       definition — so the registry/module parity certifies the actual runtime prompt
 *       surface, not a stale fork (onto issue-001);
 *   (6) NO unguarded sibling exists under prompt_projection_contracts — the supported
 *       projection keys ARE the keys of PROJECTION_PARITY_CHECKS, so a sibling cannot be
 *       silenced without wiring a real parity check.
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
  COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,
  COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
  competencyQuestionAssessmentProjectionContract,
} from "../src/core-runtime/reconstruct/competency-projection-contract.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REGISTRY_REF =
  ".onto/processes/reconstruct/reconstruct-contract-registry.yaml";
/** The runtime prompt surface that must consume the SSOT module. It spans several modules
 * since run.ts was split, so the guard reads their concatenation: a symbol may be imported
 * and used in any one of them, and none of them may redeclare it. */
const RUNTIME_REFS = [
  "src/core-runtime/reconstruct/run.ts",
  "src/core-runtime/reconstruct/authoring-prompt-payloads.ts",
  "src/core-runtime/reconstruct/prompt-payload-budget.ts",
  "src/core-runtime/reconstruct/direct-call-directive-author.ts",
];
const RUNTIME_REF = "the reconstruct runtime prompt surface";
const MODULE_SPECIFIER = "./competency-projection-contract.js";

/** The exact child keys a competency_question_assessment node may declare. */
const COMPETENCY_CHILD_KEYS = ["payload_fields", "policy_fields", "budget_fields"];

/** Every symbol moved into the extracted SSOT module that the runtime prompt surface MUST consume
 * (the contract fn + the projection version + the three budget constants). The consumption
 * check is UNIFORM over all of them: each must be imported under its own name, referenced
 * outside the import (no dead import), and not locally re-declared — so the runtime cannot drift
 * its prompt surface to a stale literal/local for ANY of them. */
const MODULE_SSOT_SYMBOLS = [
  "competencyQuestionAssessmentProjectionContract",
  "COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION",
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

/** Every `{ ... }` import block from MODULE_SPECIFIER (one per runtime file that imports it). */
function moduleImportBlocks(runtimeSource: string): string[] {
  return [
    ...runtimeSource.matchAll(
      new RegExp(
        `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${MODULE_SPECIFIER.replace(/[.]/g, "\\$&")}["']`,
        "g",
      ),
    ),
  ].map((match) => match[0]!);
}

/** Imports from MODULE_SPECIFIER, split into canonical (`X`) vs aliased (`X as Y`)
 * SOURCE names. A required symbol imported aliased is NOT bound under its own name, so
 * the usage / redefinition checks below would be meaningless — the guard rejects it. */
function parsedModuleImports(
  importBlocks: string[],
): { canonical: Set<string>; aliased: Set<string> } {
  const canonical = new Set<string>();
  const aliased = new Set<string>();
  for (const importBlock of importBlocks) {
    const inner = /\{([^}]*)\}/.exec(importBlock)?.[1] ?? "";
    for (const raw of inner.split(",")) {
      const entry = raw.trim();
      if (entry.length === 0) continue;
      const alias = /^(\S+)\s+as\s+\S+$/.exec(entry);
      if (alias) aliased.add(alias[1]!);
      else canonical.add(entry);
    }
  }
  return { canonical, aliased };
}

type CompetencyParityArgs = {
  child: Record<string, unknown>;
  contract: Record<string, unknown>;
  runtimeBudgets: Record<string, number>;
  runtimeVersion: string;
};

/** Field/budget parity for the competency_question_assessment projection child. */
function evaluateCompetencyChildParity(args: CompetencyParityArgs): string[] {
  const errors: string[] = [];
  const { child, contract, runtimeBudgets, runtimeVersion } = args;
  const payloadKeys = Object.keys(contract);
  const batchingPolicy = contract.batching_policy;
  if (batchingPolicy === null || typeof batchingPolicy !== "object") {
    errors.push("runtime contract: batching_policy is not an object");
  }
  const batchingPolicyRecord =
    batchingPolicy && typeof batchingPolicy === "object"
      ? (batchingPolicy as Record<string, unknown>)
      : {};
  const policyKeys = Object.keys(batchingPolicyRecord);

  // (4) no unguarded extra child key.
  const extraChildKeys = Object.keys(child).filter(
    (key) => !COMPETENCY_CHILD_KEYS.includes(key),
  );
  if (extraChildKeys.length) {
    errors.push(
      `competency_question_assessment has unguarded extra key(s): ${extraChildKeys.join(", ")} (only ${COMPETENCY_CHILD_KEYS.join("/")} are guard-checked)`,
    );
  }

  // (1) payload_fields exact-set.
  if (!isStringArray(child.payload_fields)) {
    errors.push("registry payload_fields must be a string array");
  } else {
    const { missing, extra, duplicates } = setDiff(child.payload_fields, payloadKeys);
    if (missing.length) errors.push(`payload_fields missing (in contract, not registry): ${missing.join(", ")}`);
    if (extra.length) errors.push(`payload_fields extra (in registry, not contract): ${extra.join(", ")}`);
    if (duplicates.length) errors.push(`payload_fields duplicated: ${duplicates.join(", ")}`);
  }

  // (2) policy_fields exact-set.
  if (!isStringArray(child.policy_fields)) {
    errors.push("registry policy_fields must be a string array");
  } else {
    const { missing, extra, duplicates } = setDiff(child.policy_fields, policyKeys);
    if (missing.length) errors.push(`policy_fields missing (in batching_policy, not registry): ${missing.join(", ")}`);
    if (extra.length) errors.push(`policy_fields extra (in registry, not batching_policy): ${extra.join(", ")}`);
    if (duplicates.length) errors.push(`policy_fields duplicated: ${duplicates.join(", ")}`);
  }

  // (3) budget_fields exact-value — certify the CONTRACT OUTPUT (the actual prompt
  // surface), and cross-check the output equals the exported constants so a hardcoded
  // contract-output edit or a divergent constant is caught.
  const contractBudgets: Record<string, unknown> = {
    prompt_char_limit: contract.prompt_char_limit,
    source_evidence_excerpt_char_limit: contract.source_evidence_excerpt_char_limit,
    build_budget_reserve_chars: batchingPolicyRecord.build_budget_reserve_chars,
  };
  for (const [key, expected] of Object.entries(runtimeBudgets)) {
    if (contractBudgets[key] !== expected) {
      errors.push(
        `contract OUTPUT ${key} = ${String(contractBudgets[key])} but exported constant = ${expected} (module-internal drift)`,
      );
    }
  }
  // The contract OUTPUT's projection_contract_version must equal the exported version
  // constant — a hardcoded/bumped contract-output version that diverges from the constant
  // (which rotates the reuse hash) would otherwise pass silently.
  if (contract.projection_contract_version !== runtimeVersion) {
    errors.push(
      `contract OUTPUT projection_contract_version = ${String(contract.projection_contract_version)} but exported constant = ${runtimeVersion} (module-internal drift)`,
    );
  }
  const declaredBudgets = child.budget_fields;
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

  return errors;
}

/** Per-projection parity checks. The SUPPORTED projection keys ARE the keys of this map,
 * so a registry sibling cannot be silenced without wiring a real parity check here. */
const PROJECTION_PARITY_CHECKS: Record<
  string,
  (args: CompetencyParityArgs) => string[]
> = {
  competency_question_assessment: evaluateCompetencyChildParity,
};

/** A standalone (word-boundary) reference to `symbol` appears in `source`. This is a
 * source-text tripwire, not a semantic analysis: it cannot tell a real identifier use
 * from a mention in a comment/string. Distinguishing those needs an AST; the authoritative
 * check that the runtime uses the real values is the behavioral test suite (run.test.ts pins the
 * emitted prompt budget/version). This guard catches the common accidental-drift case. */
function referencesSymbol(source: string, symbol: string): boolean {
  return new RegExp(`\\b${symbol}\\b`).test(source);
}

/** Runtime SSOT-consumption assertions for the extracted competency module — applied
 * UNIFORMLY to every moved symbol (contract fn + version + budgets). */
function evaluateRuntimeConsumption(runtimeSource: string): string[] {
  const errors: string[] = [];
  const importBlocks = moduleImportBlocks(runtimeSource);
  const { canonical, aliased } = parsedModuleImports(importBlocks);
  // Strip the import blocks so "referenced outside the import" is meaningful.
  let sourceOutsideImport = runtimeSource;
  for (const block of importBlocks) {
    sourceOutsideImport = sourceOutsideImport.replace(block, "");
  }
  for (const symbol of MODULE_SSOT_SYMBOLS) {
    // (a) imported under its own name (not aliased, not missing).
    if (aliased.has(symbol)) {
      errors.push(`${RUNTIME_REF} aliases ${symbol} on import — import it under its own name so the SSOT-consumption guard stays meaningful`);
    } else if (!canonical.has(symbol)) {
      errors.push(`${RUNTIME_REF} must import ${symbol} from ${MODULE_SPECIFIER}`);
    } else if (!referencesSymbol(sourceOutsideImport, symbol)) {
      // (b) actually USED — a dead import cannot satisfy the guard while the prompt
      // builder drifts to a renamed local/literal. Full data-flow is the behavioral
      // test suite's job; this catches the unused-import bypass.
      errors.push(`${RUNTIME_REF} imports ${symbol} but never references it — the prompt builder may have drifted to a local/literal`);
    }
    // (c) not locally re-declared (const or function form) under the same name.
    if (
      new RegExp(`const\\s+${symbol}\\s*=`).test(runtimeSource) ||
      new RegExp(`function\\s+${symbol}\\s*\\(`).test(runtimeSource)
    ) {
      errors.push(`${RUNTIME_REF} redeclares ${symbol} locally — the extracted module is the single source of truth; import it from ${MODULE_SPECIFIER}`);
    }
  }
  return errors;
}

export interface PromptProjectionParityInputs {
  /** Runtime contract output (competencyQuestionAssessmentProjectionContract()). */
  contract: Record<string, unknown>;
  /** Runtime budget constants (the SSOT module's exported numbers). */
  runtimeBudgets: Record<string, number>;
  /** Runtime projection version constant (the SSOT module's exported version). */
  runtimeVersion: string;
  /** The registry parent node prompt_projection_contracts (all siblings). */
  promptProjectionContracts: unknown;
  /** Runtime source text — RUNTIME_REFS concatenated (for the SSOT-consumption assertion). */
  runtimeSource: string;
}

/** Pure parity comparison. Returns a (possibly empty) list of drift messages. */
export function evaluatePromptProjectionParity(
  inputs: PromptProjectionParityInputs,
): string[] {
  const errors: string[] = [];

  // (6) parent node + no unguarded siblings (supported keys == checker-map keys).
  if (!inputs.promptProjectionContracts || typeof inputs.promptProjectionContracts !== "object") {
    return ["registry is missing the prompt_projection_contracts node"];
  }
  const parent = inputs.promptProjectionContracts as Record<string, unknown>;
  const supported = Object.keys(PROJECTION_PARITY_CHECKS);
  const unguarded = Object.keys(parent).filter((key) => !supported.includes(key));
  if (unguarded.length) {
    errors.push(
      `prompt_projection_contracts has unguarded sibling(s) with no runtime parity check: ${unguarded.join(", ")} (add a PROJECTION_PARITY_CHECKS entry)`,
    );
  }

  for (const key of supported) {
    const child = parent[key];
    if (!child || typeof child !== "object") {
      errors.push(`registry is missing prompt_projection_contracts.${key}`);
      continue;
    }
    errors.push(
      ...PROJECTION_PARITY_CHECKS[key]!({
        child: child as Record<string, unknown>,
        contract: inputs.contract,
        runtimeBudgets: inputs.runtimeBudgets,
        runtimeVersion: inputs.runtimeVersion,
      }),
    );
  }

  // (5) the runtime consumes the extracted module (symbol-level + used + no duplicate).
  errors.push(...evaluateRuntimeConsumption(inputs.runtimeSource));

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
    const parts = await Promise.all(
      RUNTIME_REFS.map((ref) => fs.readFile(path.join(PROJECT_ROOT, ref), "utf8")),
    );
    runtimeSource = parts.join("\n");
  } catch (error) {
    fail([
      `cannot read ${RUNTIME_REFS.join(" / ")}: ${
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
    runtimeVersion: COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,
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
