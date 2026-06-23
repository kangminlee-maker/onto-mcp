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
    // with a formula PATTERN spanning ONLY the last sheet — beyond the 50-sheet
    // per_sheet_data cap. (Stage 1.1: formula_patterns carry the sheets they span, so the
    // text reaches the prompt independent of which per_sheet_data bodies survive.)
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
      formula_patterns: [
        {
          pattern: "=RESIDUAL_55",
          sample_cell: "A2",
          occurrence_count: 1,
          applied_ranges: ["A2"],
          sheets: ["Sheet55"],
          cross_sheet_refs: ["Other!A1"],
        },
      ],
      formula_cells_total: 1,
      formula_cells_total_is_lower_bound: false,
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
    // the prompt — patterns are rendered up front (before per-sheet bodies) and carry the
    // sheets they span.
    expect(rendered).toContain("distinct patterns over 1 cells");
    expect(rendered).toContain("Sheet55");
    expect(rendered).toContain("=RESIDUAL_55");
    expect(rendered).toContain("Other!A1");
  });

  it("discloses pairwise-overlap truncation in the bounded-sample note (#4)", async () => {
    const root = await makeTmpDir();
    const seed = path.join(root, "seed.csv");
    await fs.writeFile(seed, "name,role\na,b\n", "utf8");
    const base = await observeSpreadsheetSource(seed);
    // One cross_sheet_key_overlap entry whose pairwise list exceeds the prompt cap (16).
    const widened: WorkbookStructuralInventory = {
      ...base,
      cross_sheet_key_overlap: [
        {
          key_name: "id",
          sheets: ["S0", "S1"],
          pairwise_overlap: Array.from({ length: 20 }, (_, i) => ({
            a: `S${i}`,
            b: `S${i + 1}`,
            count: i + 1,
          })),
        },
      ],
    };

    const xlsx = path.join(root, "overlaps.xlsx");
    await fs.writeFile(xlsx, "stub", "utf8");
    const inventoryByRef = new Map([[path.resolve(xlsx), widened]]);

    const rendered = await renderReviewTargetMaterializedInput(
      "file",
      [xlsx],
      undefined,
      inventoryByRef,
    );

    // The pairwise-overlap section is trimmed (16/20); the bounded-sample note must disclose
    // it rather than silently dropping most pairwise counts.
    expect(rendered).toContain("structural sample bounded");
    expect(rendered).toContain("cross-sheet pairwise overlaps 16/20");
  });

  it("discloses protected/hidden sheets beyond the per_sheet_data render cap (B3)", async () => {
    const root = await makeTmpDir();
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
        protected: i === 51, // a protected sheet beyond the 50-sheet render cap
      })),
      per_sheet_data: Array.from({ length: 55 }, (_, i) => ({
        ...templatePsd,
        sheet: `Sheet${i + 1}`,
      })),
    };
    const xlsx = path.join(root, "wide.xlsx");
    await fs.writeFile(xlsx, "stub", "utf8");
    const rendered = await renderReviewTargetMaterializedInput(
      "file",
      [xlsx],
      undefined,
      new Map([[path.resolve(xlsx), widened]]),
    );
    // The protected sheet at index 51 is dropped from the per-sheet layout (50-sheet cap);
    // its flag must still be disclosed so access_and_protection_hygiene isn't silently unbacked.
    expect(rendered).toContain("protected/hidden sheet(s) beyond the rendered sample");
  });

  it("renders per-column cardinality and maps declared type=list enum members to the covering column (design-C §5#9)", async () => {
    const root = await makeTmpDir();
    const seed = path.join(root, "seed.csv");
    await fs.writeFile(seed, "name,role\na,b\n", "utf8");
    const base = await observeSpreadsheetSource(seed);
    const sheetName = "Data";
    const mkCol = (
      name: string,
      index: number,
      distinct_count: number,
      distinct_count_is_estimate: boolean,
      non_empty_count: number,
    ) => ({
      name,
      index,
      inferred_type: "string" as const,
      non_empty_ratio: 1,
      distinct_count,
      distinct_count_is_estimate,
      non_empty_count,
    });
    const widened: WorkbookStructuralInventory = {
      ...base,
      sheets: [{ ...base.sheets[0]!, name: sheetName }],
      per_sheet_data: [
        {
          ...base.per_sheet_data[0]!,
          sheet: sheetName,
          layout_kind: "tabular",
          header_rows: [0],
          columns: [
            mkCol("amount", 0, 100, false, 100), // no validation → no enum
            mkCol("region", 1, 256, true, 190000), // list-validated, distinct capped → 256+/190000
            mkCol("memo", 2, 50, false, 50), // no validation → no enum
          ],
        },
      ],
      data_validations: [
        {
          sheet: sheetName,
          range: "B2:B190001",
          rule_summary: "list",
          validation_type: "list",
          members: ["Seoul", "Busan"], // DECLARED enum (from inline formula1), maps to col index 1
          members_truncated: false,
          applies_to_columns: [1],
        },
        {
          // a range-ref list validation on col 0 → members unresolved/absent → must surface NO enum
          sheet: sheetName,
          range: "A2:A190001",
          rule_summary: "list (range)",
          validation_type: "list",
          members_truncated: true,
          applies_to_columns: [0],
        },
      ],
    };

    const xlsx = path.join(root, "card.xlsx");
    await fs.writeFile(xlsx, "stub", "utf8");
    const rendered = await renderReviewTargetMaterializedInput(
      "file",
      [xlsx],
      undefined,
      new Map([[path.resolve(xlsx), widened]]),
    );

    const lines = rendered.split("\n");
    const lineFor = (n: string) => lines.find((l) => l.includes(`- ${n} (`)) ?? "";
    // Per-column cardinality is a COUNT (distinct/non_empty); the distinct-cap estimate shows "+".
    expect(lineFor("region")).toContain("cardinality=256+/190000");
    expect(lineFor("amount")).toContain("cardinality=100/100");
    // The DECLARED enum members attach to ONLY the covering normalized column (index 1)…
    expect(lineFor("region")).toContain("enum=[Seoul, Busan]");
    // …never to its neighbours (proves the applies_to_columns→col.index mapping is correct).
    expect(lineFor("amount")).not.toContain("enum=");
    expect(lineFor("memo")).not.toContain("enum=");
    // Exactly one enum surfaces: the range-ref (members-absent) validation on col 0 emits none.
    expect((rendered.match(/enum=/g) ?? []).length).toBe(1);
  });

  it("does not surface count-only tables/merged_ranges trims as bounded samples (A3 / RC-2)", async () => {
    const root = await makeTmpDir();
    const seed = path.join(root, "seed.csv");
    await fs.writeFile(seed, "name,role\na,b\n", "utf8");
    const base = await observeSpreadsheetSource(seed);
    const widened: WorkbookStructuralInventory = {
      ...base,
      tables: Array.from({ length: 60 }, (_, i) => ({
        name: `T${i}`,
        sheet: "S1",
        range: "A1:B2",
      })),
    };
    const xlsx = path.join(root, "tabs.xlsx");
    await fs.writeFile(xlsx, "stub", "utf8");
    const rendered = await renderReviewTargetMaterializedInput(
      "file",
      [xlsx],
      undefined,
      new Map([[path.resolve(xlsx), widened]]),
    );
    // tables are capped 60->50 by projectInventoryForPrompt but rendered as a full COUNT,
    // not a bounded sample — so the trim note must NOT mention tables (RC-2 guard).
    expect(rendered).toContain("tables: 60");
    expect(rendered).not.toContain("tables 50/60");
  });
});
