import { describe, expect, it } from "vitest";
import {
  PROBLEM_FRAMING_CLOSURE_CLASS_SET,
  PROBLEM_FRAMING_CLOSURE_CLASS_VALUES,
  PROBLEM_FRAMING_CLOSURE_OBLIGATION_SET,
  PROBLEM_FRAMING_CLOSURE_OBLIGATION_VALUES,
  PROBLEM_FRAMING_IMPACT_KIND_SET,
  PROBLEM_FRAMING_IMPACT_KIND_VALUES,
  PROBLEM_FRAMING_ISSUE_ROLE_SET,
  PROBLEM_FRAMING_ISSUE_ROLE_VALUES,
  PROBLEM_FRAMING_JUDGMENT_STATE_SET,
  PROBLEM_FRAMING_JUDGMENT_STATE_VALUES,
  PROBLEM_FRAMING_TIMING_CLASS_SET,
  PROBLEM_FRAMING_TIMING_CLASS_VALUES,
} from "./problem-framing-spine.js";
import { createRuntimeSubmitTools } from "../cli/structured-output-tools.js";

/**
 * INVARIANT TEST (INV-SCHEMA-1 — 단계 출력 계약/스키마는 단일 source; G3).
 *
 * submit tool의 JSON schema enum과 runtime validator의 허용 집합이 모두
 * problem-framing-spine 단일 source에서 나옴을 고정한다. 기대값 변경은
 * spine(명세) 변경 근거를 요구한다(INV-TEST-1).
 */
const VOCABULARIES = [
  ["issue_role", PROBLEM_FRAMING_ISSUE_ROLE_VALUES, PROBLEM_FRAMING_ISSUE_ROLE_SET],
  ["judgment_state", PROBLEM_FRAMING_JUDGMENT_STATE_VALUES, PROBLEM_FRAMING_JUDGMENT_STATE_SET],
  ["impact_kind", PROBLEM_FRAMING_IMPACT_KIND_VALUES, PROBLEM_FRAMING_IMPACT_KIND_SET],
  ["timing_class", PROBLEM_FRAMING_TIMING_CLASS_VALUES, PROBLEM_FRAMING_TIMING_CLASS_SET],
  ["closure_class", PROBLEM_FRAMING_CLOSURE_CLASS_VALUES, PROBLEM_FRAMING_CLOSURE_CLASS_SET],
  [
    "closure_obligation",
    PROBLEM_FRAMING_CLOSURE_OBLIGATION_VALUES,
    PROBLEM_FRAMING_CLOSURE_OBLIGATION_SET,
  ],
] as const;

describe("INV-SCHEMA-1: problem-framing spine is the single schema source", () => {
  it("validator sets are exactly the spine value arrays", () => {
    for (const [name, values, set] of VOCABULARIES) {
      expect([...set].sort(), name).toEqual([...values].sort());
    }
  });

  it("submit tool schema enums are exactly the spine value arrays", () => {
    const [tool] = createRuntimeSubmitTools({
      sessionId: "invariant-session",
      unitId: "problem-framing",
      outputFormat: "issue-artifact",
    });
    const classificationProperties = (
      tool!.input_schema as unknown as {
        properties: {
          classifications: {
            items: { properties: Record<string, { enum?: readonly string[] }> };
          };
        };
      }
    ).properties.classifications.items.properties;
    for (const [name, values] of VOCABULARIES) {
      expect(classificationProperties[name]?.enum, name).toEqual([...values]);
    }
  });
});
