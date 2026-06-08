import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
  PROBLEM_FRAMING_CLOSURE_CLASS_VALUES,
  PROBLEM_FRAMING_CLOSURE_OBLIGATION_VALUES,
  PROBLEM_FRAMING_ISSUE_ROLE_VALUES,
  PROBLEM_FRAMING_JUDGMENT_STATE_VALUES,
} from "./problem-framing-spine.js";
import {
  REVIEW_MATERIAL_ADMISSION_DISQUALIFIERS,
  REVIEW_MATERIAL_ISSUE_CONTRACT_REF,
  REVIEW_MATERIAL_SEVERITIES,
  REVIEW_NON_MATERIAL_SEVERITIES,
  REVIEW_SEVERITY_ORDER,
  isAdmittedReviewMaterialIssue,
  isReviewMaterialAdmissionDisqualified,
} from "./review-result-classification.js";

type MaterialContract = {
  schema_version: number;
  contract_id: string;
  runtime_owner: string;
  material_severity_candidates: string[];
  always_non_material_severities: string[];
  admission_context_fields: string[];
  admission_disqualifiers: Record<string, string[]>;
  blocking_semantics: Record<string, boolean>;
  fastcampus_quality_mapping: Record<string, string>;
};

function readMaterialContract(): MaterialContract {
  const contractPath = path.join(process.cwd(), REVIEW_MATERIAL_ISSUE_CONTRACT_REF);
  const text = readFileSync(contractPath, "utf8");
  const match = /```yaml material-issue-contract\n([\s\S]*?)```/u.exec(text);
  if (!match) {
    throw new Error("material-issue-contract.md missing machine-readable YAML block.");
  }
  return YAML.parse(match[1] ?? "") as MaterialContract;
}

function allowedValuesFor(fieldName: string): readonly string[] {
  switch (fieldName) {
    case "issue_role":
      return PROBLEM_FRAMING_ISSUE_ROLE_VALUES;
    case "judgment_state":
      return PROBLEM_FRAMING_JUDGMENT_STATE_VALUES;
    case "closure_class":
      return PROBLEM_FRAMING_CLOSURE_CLASS_VALUES;
    case "closure_obligation":
      return PROBLEM_FRAMING_CLOSURE_OBLIGATION_VALUES;
    default:
      throw new Error(`unknown material admission context field: ${fieldName}`);
  }
}

describe("review material issue contract", () => {
  it("keeps the canonical markdown contract aligned with runtime constants", () => {
    const contract = readMaterialContract();

    expect(contract.schema_version).toBe(1);
    expect(contract.contract_id).toBe("review_material_issue");
    expect(contract.runtime_owner).toBe(
      "src/core-runtime/review/review-result-classification.ts",
    );
    expect(contract.material_severity_candidates).toEqual([
      ...REVIEW_MATERIAL_SEVERITIES,
    ]);
    expect(contract.always_non_material_severities).toEqual([
      ...REVIEW_NON_MATERIAL_SEVERITIES,
    ]);
    expect(contract.admission_context_fields).toEqual(
      Object.keys(REVIEW_MATERIAL_ADMISSION_DISQUALIFIERS),
    );
    expect(contract.admission_disqualifiers).toEqual(
      REVIEW_MATERIAL_ADMISSION_DISQUALIFIERS,
    );
    expect(
      contract.blocking_semantics.material_issue_disclosure_blocks_hot_path,
    ).toBe(false);
    expect(
      contract.blocking_semantics.runtime_structural_contract_failure_blocks_hot_path,
    ).toBe(true);
    expect(contract.fastcampus_quality_mapping).toEqual({
      admitted_material_issue: "fail",
      non_material_disclosed: "review_needed",
    });
  });

  it("uses only declared problem-framing enum values as admission disqualifiers", () => {
    const contract = readMaterialContract();

    for (const fieldName of contract.admission_context_fields) {
      const allowed = new Set(allowedValuesFor(fieldName));
      for (const value of contract.admission_disqualifiers[fieldName] ?? []) {
        expect(allowed.has(value), `${fieldName}.${value}`).toBe(true);
      }
    }
  });

  it("matches the exact material predicate truth table", () => {
    const materialSeveritySet = new Set<string>(REVIEW_MATERIAL_SEVERITIES);

    for (const severity of REVIEW_SEVERITY_ORDER) {
      expect(
        isAdmittedReviewMaterialIssue(severity, {}),
        `empty admission context for ${severity}`,
      ).toBe(materialSeveritySet.has(severity));
    }

    for (const severity of REVIEW_NON_MATERIAL_SEVERITIES) {
      expect(isAdmittedReviewMaterialIssue(severity, {
        issue_role: "root_cause",
        judgment_state: "observed",
        closure_class: "fix_now",
        closure_obligation: "must_close_in_target",
      })).toBe(false);
    }

    for (const severity of REVIEW_MATERIAL_SEVERITIES) {
      for (const [fieldName, values] of Object.entries(
        REVIEW_MATERIAL_ADMISSION_DISQUALIFIERS,
      )) {
        for (const value of values) {
          expect(
            isAdmittedReviewMaterialIssue(severity, { [fieldName]: value }),
            `${severity} disqualified by ${fieldName}.${value}`,
          ).toBe(false);
          expect(
            isReviewMaterialAdmissionDisqualified({ [fieldName]: value }),
            `${fieldName}.${value} is a disqualifier`,
          ).toBe(true);
        }
      }
    }
  });

  it("does not disqualify admitted material candidates with non-disqualifier context values", () => {
    const disqualifiers = REVIEW_MATERIAL_ADMISSION_DISQUALIFIERS as Record<
      string,
      readonly string[]
    >;

    for (const severity of REVIEW_MATERIAL_SEVERITIES) {
      for (const fieldName of Object.keys(disqualifiers)) {
        for (const value of allowedValuesFor(fieldName)) {
          if (disqualifiers[fieldName]?.includes(value)) continue;
          expect(
            isAdmittedReviewMaterialIssue(severity, { [fieldName]: value }),
            `${severity} admitted with ${fieldName}.${value}`,
          ).toBe(true);
        }
      }
    }
  });
});
