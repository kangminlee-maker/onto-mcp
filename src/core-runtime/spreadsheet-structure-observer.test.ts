import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildCsvInventory,
  observeSpreadsheetSource,
  parseCsv,
  projectInventoryForAdmission,
  SPREADSHEET_OBSERVER_ADAPTER_ID,
  type DataLayerCaps,
} from "./spreadsheet-structure-observer.js";

const sha = (s: string) => crypto.createHash("sha256").update(Buffer.from(s)).digest("hex");

function inv(content: string, ref = "/abs/data.csv", caps?: DataLayerCaps) {
  return buildCsvInventory({ sourceRef: ref, content, contentSha256: sha(content), caps });
}

describe("buildCsvInventory — structure (P1)", () => {
  const csv = "name,age,city\nAlice,30,Seoul\nBob,25,Busan\nCarol,30,Seoul\n";

  it("detects a tabular header and per-sheet layout (SCHEMA-1)", () => {
    const r = inv(csv);
    expect(r.adapter_id).toBe(SPREADSHEET_OBSERVER_ADAPTER_ID);
    expect(r.workbook_kind).toBe("csv");
    expect(r.inspection_method).toBe("structure_inspected_only");
    expect(r.per_sheet_data).toHaveLength(1);
    const sheet = r.per_sheet_data[0];
    expect(sheet.layout_kind).toBe("tabular");
    expect(sheet.header_rows).toEqual([0]);
    expect(sheet.columns.map((c) => c.name)).toEqual(["name", "age", "city"]);
    expect(r.sheets[0].dimensions).toEqual({ rows: 4, cols: 3 });
  });

  it("infers column types", () => {
    const r = inv(csv);
    const byName = Object.fromEntries(r.per_sheet_data[0].columns.map((c) => [c.name, c.inferred_type]));
    expect(byName.name).toBe("string");
    expect(byName.age).toBe("integer");
    expect(byName.city).toBe("string");
  });

  it("emits aggregate distinct_count for categorical columns but NO raw values (CHAN-1)", () => {
    const r = inv(csv);
    const city = r.distinct_value_vocab.find((v) => v.column === "city");
    expect(city).toBeDefined();
    expect(city!.distinct_count).toBe(2); // Seoul, Busan
    expect(city!.distinct_count_is_estimate).toBe(false);
    // CHAN-1: raw values are never emitted by the extractor.
    for (const v of r.distinct_value_vocab) expect(v.top_values).toBeUndefined();
    // High-cardinality unique column (name) is not a controlled-vocab candidate.
    expect(r.distinct_value_vocab.find((v) => v.column === "name")).toBeUndefined();
  });

  it("treats an all-numeric first row as data, not a header (matrix_no_header)", () => {
    const r = inv("1,2,3\n4,5,6\n");
    expect(r.per_sheet_data[0].layout_kind).toBe("matrix_no_header");
    expect(r.per_sheet_data[0].header_rows).toBeNull();
    expect(r.per_sheet_data[0].columns).toEqual([]); // columns asserted only for tabular
  });
});

describe("buildCsvInventory — determinism & provenance", () => {
  const csv = "k,v\na,1\nb,2\n";

  it("is deterministic: identical input → deep-equal inventory", () => {
    expect(inv(csv)).toEqual(inv(csv));
  });

  it("content_sha256 is the RAW-byte hash, independent of parsing (HASH-1)", () => {
    const r = inv(csv);
    expect(r.content_sha256).toBe(sha(csv));
  });
});

describe("buildCsvInventory — caps (CAPS-1) and risk signals", () => {
  it("flags distinct-count estimate + capture_truncated when the distinct cap is hit", () => {
    const rows = ["c"];
    for (let i = 0; i < 10; i += 1) rows.push(`v${i}`);
    const caps: DataLayerCaps = {
      max_rows_scanned_per_sheet: 1000,
      max_distinct_tracked_per_column: 3,
      max_columns_profiled: 512,
      max_sheet_pairs: 64,
    };
    const r = inv(`${rows.join("\n")}\n`, "/abs/c.csv", caps);
    const entry = r.distinct_value_vocab.find((v) => v.column === "c");
    expect(entry?.distinct_count_is_estimate).toBe(true);
    expect(entry?.distinct_count).toBe(3);
    expect(r.capture_truncated).toBe(true);
  });

  it("records ragged rows literally without diagnosis", () => {
    const r = inv("a,b,c\n1,2,3\n4,5\n");
    const ragged = r.risk_signals.find((s) => s.kind === "ragged_row");
    expect(ragged).toBeDefined();
    expect(ragged!.literal).toBe("2 cols vs 3");
  });
});

describe("buildCsvInventory — parsing edge cases", () => {
  it("parses quoted fields with embedded delimiters and newlines", () => {
    const { rows } = parseCsv('a,"b,c","d\ne"\n1,2,3\n', ",", 100);
    expect(rows).toEqual([
      ["a", "b,c", "d\ne"],
      ["1", "2", "3"],
    ]);
  });

  it("detects a tab delimiter → workbook_kind tsv", () => {
    const r = inv("name\tage\nAlice\t30\n", "/abs/data.tsv");
    expect(r.workbook_kind).toBe("tsv");
    expect(r.per_sheet_data[0].columns.map((c) => c.name)).toEqual(["name", "age"]);
  });

  it("returns unsupported_reason for an empty csv", () => {
    const r = inv("");
    expect(r.unsupported_reason).toBe("empty csv (no rows)");
    expect(r.per_sheet_data[0].layout_kind).toBe("unknown");
  });
});

describe("observeSpreadsheetSource — IO + dispatch", () => {
  const tmp = path.join(os.tmpdir(), `onto-s1-test-${process.pid}`);

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("reads a csv file and builds an inventory with a raw-byte content_sha256", async () => {
    await fs.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "people.csv");
    const content = "name,role\nAlice,eng\nBob,eng\n";
    await fs.writeFile(file, content);
    const r = await observeSpreadsheetSource(file);
    expect(r.workbook_kind).toBe("csv");
    expect(r.content_sha256).toBe(sha(content));
    expect(r.per_sheet_data[0].columns.map((c) => c.name)).toEqual(["name", "role"]);
    expect(r.unsupported_reason).toBeNull();
  });

  it("defers xlsx to P4 with an explicit unsupported_reason (not a crash)", async () => {
    await fs.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "book.xlsx");
    await fs.writeFile(file, Buffer.from([0x50, 0x4b, 0x03, 0x04])); // ZIP magic
    const r = await observeSpreadsheetSource(file);
    expect(r.workbook_kind).toBe("xlsx");
    expect(r.unsupported_reason).toMatch(/not yet implemented/);
    expect(r.content_sha256).toHaveLength(64); // raw-byte hash still recorded
  });

  it("reports unreadable sources without throwing", async () => {
    const r = await observeSpreadsheetSource(path.join(tmp, "does-not-exist.csv"));
    expect(r.unsupported_reason).toMatch(/source unreadable/);
  });
});

describe("projectInventoryForAdmission — channel governance (CHAN-1/CHAN-2)", () => {
  it("strips raw top_values while preserving aggregate distinct counts", () => {
    const inventory = inv("name,role\nAlice,eng\nBob,eng\n");
    // The observer itself never emits top_values; a future data-observation
    // phase might (via the source-safety channel). Simulate that and assert the
    // single shared projection excludes it for every consumer.
    inventory.distinct_value_vocab[0].top_values = [
      { value: "Alice", count: 1 },
      { value: "Bob", count: 1 },
    ];
    const before = inventory.distinct_value_vocab[0];
    const projected = projectInventoryForAdmission(inventory);
    const entry = projected.distinct_value_vocab[0];

    expect(entry.top_values).toBeUndefined();
    expect(entry.distinct_count).toBe(before.distinct_count);
    expect(entry.distinct_count_is_estimate).toBe(before.distinct_count_is_estimate);
    // No raw value leaks anywhere in the projected inventory.
    expect(JSON.stringify(projected)).not.toContain("Alice");
    // The source inventory is not mutated (projection returns a copy).
    expect(inventory.distinct_value_vocab[0].top_values).toBeDefined();
  });
});
