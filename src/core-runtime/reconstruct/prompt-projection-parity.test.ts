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
const GOOD_RUNTIME_SOURCE = [
  'import { competencyQuestionAssessmentProjectionContract } from "./competency-projection-contract.js";',
  "const policy = competencyQuestionAssessmentProjectionContract();",
].join("\n");

function matchedNode(): Record<string, unknown> {
  return {
    payload_fields: Object.keys(contract),
    policy_fields: Object.keys(contract.batching_policy as Record<string, unknown>),
    budget_fields: { ...runtimeBudgets },
  };
}

function evaluate(overrides: Partial<PromptProjectionParityInputs>): string[] {
  return evaluatePromptProjectionParity({
    contract,
    runtimeBudgets,
    declaredNode: matchedNode(),
    runtimeSource: GOOD_RUNTIME_SOURCE,
    ...overrides,
  });
}

describe("prompt-projection parity guard (G8 / INV-SCHEMA-1)", () => {
  it("passes when the registry node exactly matches the runtime contract surface", () => {
    expect(evaluate({})).toEqual([]);
  });

  it("fails when a declared payload field is dropped", () => {
    const node = matchedNode();
    node.payload_fields = (node.payload_fields as string[]).filter(
      (key) => key !== "fail_loud_policy",
    );
    const errors = evaluate({ declaredNode: node });
    expect(errors.some((message) => message.includes("payload_fields missing"))).toBe(true);
  });

  it("fails when an extra payload field is declared", () => {
    const node = matchedNode();
    node.payload_fields = [...(node.payload_fields as string[]), "ghost_field"];
    const errors = evaluate({ declaredNode: node });
    expect(errors.some((message) => message.includes("payload_fields extra"))).toBe(true);
  });

  it("fails when a declared policy field drifts", () => {
    const node = matchedNode();
    node.policy_fields = (node.policy_fields as string[]).filter(
      (key) => key !== "single_question_overflow",
    );
    const errors = evaluate({ declaredNode: node });
    expect(errors.some((message) => message.includes("policy_fields missing"))).toBe(true);
  });

  it("fails when a declared budget value drifts", () => {
    const node = matchedNode();
    node.budget_fields = { ...runtimeBudgets, prompt_char_limit: 49_000 };
    const errors = evaluate({ declaredNode: node });
    expect(errors.some((message) => message.includes("budget_fields.prompt_char_limit"))).toBe(true);
  });

  it("fails when run.ts redefines the contract function locally", () => {
    const errors = evaluate({
      runtimeSource:
        GOOD_RUNTIME_SOURCE +
        "\nfunction competencyQuestionAssessmentProjectionContract() { return {}; }",
    });
    expect(errors.some((message) => message.includes("redefines"))).toBe(true);
  });

  it("fails when run.ts redeclares a moved budget constant locally", () => {
    const errors = evaluate({
      runtimeSource:
        GOOD_RUNTIME_SOURCE +
        "\nconst COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT = 50_000;",
    });
    expect(errors.some((message) => message.includes("redeclares"))).toBe(true);
  });

  it("fails when run.ts does not import the extracted module", () => {
    const errors = evaluate({ runtimeSource: "const policy = {};" });
    expect(errors.some((message) => message.includes("must import"))).toBe(true);
  });
});
