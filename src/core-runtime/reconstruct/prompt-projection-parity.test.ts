import { describe, expect, it } from "vitest";
import {
  COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,
  COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,
  COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
  competencyQuestionAssessmentProjectionContract,
} from "./competency-projection-contract.js";
import {
  evaluatePromptProjectionParity,
  type PromptProjectionParityInputs,
} from "../../../scripts/check-prompt-projection-parity.js";

const contract = competencyQuestionAssessmentProjectionContract();
const runtimeBudgets = {
  prompt_char_limit: COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
  source_evidence_excerpt_char_limit:
    COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,
  build_budget_reserve_chars:
    COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,
};
// A realistic run.ts: imports the contract fn + version + the 3 budget constants AND
// references each of those moved symbols outside the import block (mirrors the builder).
const GOOD_RUNTIME_SOURCE = [
  "import {",
  "  COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,",
  "  COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,",
  "  COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,",
  "  COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,",
  "  competencyQuestionAssessmentProjectionContract,",
  '} from "./competency-projection-contract.js";',
  "const policy = competencyQuestionAssessmentProjectionContract();",
  "const version = COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION;",
  "const budget = COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT - COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS;",
  "const excerpt = COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT;",
].join("\n");

function matchedChild(): Record<string, unknown> {
  return {
    payload_fields: Object.keys(contract),
    policy_fields: Object.keys(contract.batching_policy as Record<string, unknown>),
    budget_fields: { ...runtimeBudgets },
  };
}

function matchedParent(): Record<string, unknown> {
  return { competency_question_assessment: matchedChild() };
}

function evaluate(overrides: Partial<PromptProjectionParityInputs>): string[] {
  return evaluatePromptProjectionParity({
    contract,
    runtimeBudgets,
    promptProjectionContracts: matchedParent(),
    runtimeSource: GOOD_RUNTIME_SOURCE,
    ...overrides,
  });
}

describe("prompt-projection parity guard (G8 / INV-SCHEMA-1)", () => {
  it("passes when the registry node exactly matches the runtime contract surface", () => {
    expect(evaluate({})).toEqual([]);
  });

  it("fails when a declared payload field is dropped", () => {
    const child = matchedChild();
    child.payload_fields = (child.payload_fields as string[]).filter(
      (key) => key !== "fail_loud_policy",
    );
    const errors = evaluate({
      promptProjectionContracts: { competency_question_assessment: child },
    });
    expect(errors.some((message) => message.includes("payload_fields missing"))).toBe(true);
  });

  it("fails when an extra payload field is declared", () => {
    const child = matchedChild();
    child.payload_fields = [...(child.payload_fields as string[]), "ghost_field"];
    const errors = evaluate({
      promptProjectionContracts: { competency_question_assessment: child },
    });
    expect(errors.some((message) => message.includes("payload_fields extra"))).toBe(true);
  });

  it("fails when a declared policy field drifts", () => {
    const child = matchedChild();
    child.policy_fields = (child.policy_fields as string[]).filter(
      (key) => key !== "single_question_overflow",
    );
    const errors = evaluate({
      promptProjectionContracts: { competency_question_assessment: child },
    });
    expect(errors.some((message) => message.includes("policy_fields missing"))).toBe(true);
  });

  it("fails when a declared budget value drifts from the contract output", () => {
    const child = matchedChild();
    child.budget_fields = { ...runtimeBudgets, prompt_char_limit: 49_000 };
    const errors = evaluate({
      promptProjectionContracts: { competency_question_assessment: child },
    });
    expect(errors.some((message) => message.includes("budget_fields.prompt_char_limit"))).toBe(true);
  });

  it("fails when the contract OUTPUT budget drifts from the exported constant (module-internal)", () => {
    const driftedContract = { ...contract, prompt_char_limit: 49_000 };
    const errors = evaluate({ contract: driftedContract });
    expect(errors.some((message) => message.includes("module-internal drift"))).toBe(true);
  });

  it("fails on an unguarded extra key inside the projection child node", () => {
    const child = { ...matchedChild(), value_policy: ["unguarded"] };
    const errors = evaluate({
      promptProjectionContracts: { competency_question_assessment: child },
    });
    expect(errors.some((message) => message.includes("unguarded extra key"))).toBe(true);
  });

  it("fails when run.ts redefines the contract function locally", () => {
    const errors = evaluate({
      runtimeSource:
        GOOD_RUNTIME_SOURCE +
        "\nfunction competencyQuestionAssessmentProjectionContract() { return {}; }",
    });
    expect(errors.some((message) => message.includes("redeclares competencyQuestionAssessmentProjectionContract"))).toBe(true);
  });

  it("fails when run.ts redeclares a moved budget constant locally", () => {
    const errors = evaluate({
      runtimeSource:
        GOOD_RUNTIME_SOURCE +
        "\nconst COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT = 50_000;",
    });
    expect(errors.some((message) => message.includes("redeclares COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT"))).toBe(true);
  });

  it("fails when run.ts redeclares the moved projection version constant locally", () => {
    const errors = evaluate({
      runtimeSource:
        GOOD_RUNTIME_SOURCE +
        '\nconst COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION = "stale:v0";',
    });
    expect(errors.some((message) => message.includes("redeclares COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION"))).toBe(true);
  });

  it("fails when run.ts does not import a moved symbol (version) symbol-level", () => {
    const errors = evaluate({
      runtimeSource: [
        "import {",
        "  COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,",
        "  COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,",
        "  COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,",
        "  competencyQuestionAssessmentProjectionContract,",
        '} from "./competency-projection-contract.js";',
        "const policy = competencyQuestionAssessmentProjectionContract();",
        "const budget = COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT - COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS;",
        "const excerpt = COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT;",
      ].join("\n"),
    });
    expect(
      errors.some((message) =>
        message.includes("must import COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION")
      ),
    ).toBe(true);
  });

  it("fails when run.ts imports a moved symbol (contract fn) but never references it (dead import)", () => {
    const errors = evaluate({
      runtimeSource: [
        "import {",
        "  COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,",
        "  COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,",
        "  COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,",
        "  COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,",
        "  competencyQuestionAssessmentProjectionContract,",
        '} from "./competency-projection-contract.js";',
        // Uses everything EXCEPT the contract fn — it is a dead import.
        "const version = COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION;",
        "const budget = COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT - COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS;",
        "const excerpt = COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT;",
      ].join("\n"),
    });
    expect(
      errors.some((message) =>
        message.includes("competencyQuestionAssessmentProjectionContract but never references it")
      ),
    ).toBe(true);
  });

  it("fails when run.ts aliases a required import (binding is not the canonical name)", () => {
    const errors = evaluate({
      runtimeSource: [
        "import {",
        "  COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,",
        "  COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,",
        "  COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,",
        "  COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,",
        "  competencyQuestionAssessmentProjectionContract as importedContract,",
        '} from "./competency-projection-contract.js";',
        "const policy = importedContract();",
        "const version = COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION;",
        "const budget = COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT - COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS;",
        "const excerpt = COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT;",
      ].join("\n"),
    });
    expect(
      errors.some((message) =>
        message.includes("aliases competencyQuestionAssessmentProjectionContract on import")
      ),
    ).toBe(true);
  });

  it("fails when run.ts does not import the extracted module at all", () => {
    const errors = evaluate({ runtimeSource: "const policy = {};" });
    expect(errors.some((message) => message.includes("must import"))).toBe(true);
  });

  it("fails on an unguarded sibling under prompt_projection_contracts", () => {
    const errors = evaluate({
      promptProjectionContracts: {
        ...matchedParent(),
        some_other_projection: { payload_fields: [] },
      },
    });
    expect(errors.some((message) => message.includes("unguarded sibling"))).toBe(true);
  });
});
