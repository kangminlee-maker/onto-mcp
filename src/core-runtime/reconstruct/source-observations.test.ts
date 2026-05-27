import { describe, expect, it } from "vitest";
import { validateSourceObservationBoundary } from "./source-observations.js";

describe("validateSourceObservationBoundary", () => {
  it("accepts structural observations", () => {
    const result = validateSourceObservationBoundary({
      observation_id: "obs_spreadsheet_formula_1",
      target_material_kind: "spreadsheet",
      adapter_id: "minimal-spreadsheet-structure-observer",
      source_ref: "/tmp/workbook.xlsx",
      location: "Sheet1:B12",
      summary: "Cell B12 contains a SUM formula referencing B2:B11.",
      structural_data: {
        cell: "B12",
        formula: "=SUM(B2:B11)",
        precedents: ["B2:B11"],
      },
    });

    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("rejects ontology claims in source observations", () => {
    const result = validateSourceObservationBoundary({
      observation_id: "obs_code_1",
      target_material_kind: "code",
      adapter_id: "minimal-code-structure-observer",
      source_ref: "/tmp/payment.ts",
      location: "payment.ts:14",
      summary: "Payment is an aggregate root.",
      structural_data: {
        entity: "Payment",
        fields: ["status", "amount"],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      "structural_data contains semantic key: entity",
    );
    expect(result.violations).toContain(
      "summary contains prohibited ontology interpretation: aggregate root",
    );
  });
});
