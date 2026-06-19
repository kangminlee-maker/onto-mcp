import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isDeprecatedDomainAlias,
  normalizeDomainValue,
  renderReviewTargetMaterializedInput,
  renderTargetSnapshot,
} from "./review-artifact-utils.js";
import {
  observeSpreadsheetSource,
  type WorkbookStructuralInventory,
} from "../spreadsheet-structure-observer.js";

const tmpRoots: string[] = [];

async function makeTmpDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-review-utils-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("normalizeDomainValue", () => {
  it("does not rewrite retired domain aliases", () => {
    expect(normalizeDomainValue("llm-native-development")).toBe(
      "llm-native-development",
    );
    expect(normalizeDomainValue("@llm-native-development")).toBe(
      "llm-native-development",
    );
  });

  it("preserves canonical domains and no-domain tokens", () => {
    expect(normalizeDomainValue("software-engineering")).toBe("software-engineering");
    expect(normalizeDomainValue("@-")).toBe("none");
    expect(normalizeDomainValue("none")).toBe("none");
  });
});

describe("isDeprecatedDomainAlias", () => {
  it("identifies retired domain aliases without hiding canonical domains", () => {
    expect(isDeprecatedDomainAlias("llm-native-development")).toBe(true);
    expect(isDeprecatedDomainAlias("@llm-native-development")).toBe(true);
    expect(isDeprecatedDomainAlias("software-engineering")).toBe(false);
  });
});

describe("spreadsheet target rendering (P3 review seam, §3.2)", () => {
  it("renders a csv target/materialized-input as a structural view with no raw cell values", async () => {
    const root = await makeTmpDir();
    const csv = path.join(root, "people.csv");
    // SECRET_DATA_VALUE_XYZ is a DATA cell — it must never reach the review prompt.
    await fs.writeFile(
      csv,
      "name,role\nSECRET_DATA_VALUE_XYZ,engineer\nbob,analyst\n",
      "utf8",
    );

    const snapshot = await renderTargetSnapshot([csv]);
    const materialized = await renderReviewTargetMaterializedInput("file", [csv]);

    for (const rendered of [snapshot, materialized]) {
      expect(rendered).toContain("Spreadsheet Structural Inventory");
      expect(rendered).toContain("structure inspected only");
      // Schema (header names) is structural and expected; raw data values are not.
      expect(rendered).toContain("name");
      expect(rendered).toContain("role");
      expect(rendered).not.toContain("SECRET_DATA_VALUE_XYZ");
      // The generic raw-utf8 dump would have included the data rows verbatim.
      expect(rendered).not.toContain("engineer");
    }
  });

  it("renders a corrupt xlsx target as structure-only with an honest unsupported note, not binary garbage", async () => {
    const root = await makeTmpDir();
    const xlsx = path.join(root, "report.xlsx");
    // A truncated/corrupt zip: binary-ish bytes that would be garbage if dumped
    // as utf8. The observer reports an honest unsupported reason instead.
    await fs.writeFile(xlsx, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));

    const snapshot = await renderTargetSnapshot([xlsx]);
    expect(snapshot).toContain("Spreadsheet Structural Inventory");
    expect(snapshot).toContain("unsupported:");
    expect(snapshot).toMatch(/unzip failed|workbook\.xml/);
  });

  it("renders an empty csv as a structural view without throwing", async () => {
    const root = await makeTmpDir();
    const csv = path.join(root, "empty.csv");
    await fs.writeFile(csv, "", "utf8");

    const snapshot = await renderTargetSnapshot([csv]);
    expect(snapshot).toContain("Spreadsheet Structural Inventory");
    expect(snapshot).toContain("structure inspected only");
  });

  it("renders formula text for sheets dropped by the per_sheet_data sheet cap (formula residual)", async () => {
    const root = await makeTmpDir();
    // A real single-sheet csv yields a fully-typed base inventory; widen it to 55 sheets
    // with a formula ONLY on the last sheet — beyond the 50-sheet per_sheet_data cap.
    const seed = path.join(root, "seed.csv");
    await fs.writeFile(seed, "name,role\na,b\n", "utf8");
    const base = await observeSpreadsheetSource(seed);
    const templateSheet = base.sheets[0]!;
    const templatePsd = base.per_sheet_data[0]!;
    const widened: WorkbookStructuralInventory = {
      ...base,
      sheets: Array.from({ length: 55 }, (_, i) => ({
        ...templateSheet,
        name: `Sheet${i + 1}`,
      })),
      per_sheet_data: Array.from({ length: 55 }, (_, i) => ({
        ...templatePsd,
        sheet: `Sheet${i + 1}`,
      })),
      formula_cells: [
        { sheet: "Sheet55", cell: "A2", formula: "=RESIDUAL_55", cross_sheet_refs: ["Other!A1"] },
      ],
    };

    // stat() must pass (readTextOrDirectoryListing); the injected inventory is reused
    // instead of re-observing the stub bytes.
    const xlsx = path.join(root, "wide.xlsx");
    await fs.writeFile(xlsx, "stub", "utf8");
    const inventoryByRef = new Map([[path.resolve(xlsx), widened]]);

    const rendered = await renderReviewTargetMaterializedInput(
      "file",
      [xlsx],
      undefined,
      inventoryByRef,
    );

    // Sheet55's body is trimmed by the 50-sheet cap, but its formula TEXT must still reach
    // the prompt so the formula_integrity obligation stays backed (not silently count-only).
    expect(rendered).toContain("formulas on sheets beyond the rendered sheet sample");
    expect(rendered).toContain("Sheet55");
    expect(rendered).toContain("=RESIDUAL_55");
    expect(rendered).toContain("Other!A1");
  });
});
