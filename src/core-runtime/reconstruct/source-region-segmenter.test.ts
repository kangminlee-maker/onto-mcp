import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { observeCodeStructure, type CodeSymbolSpan } from "../code-structure-observer.js";
import {
  segmentSourceIntoRegions,
  sliceRegionText,
  CODE_REGION_COALESCE_MIN_LINES,
  type Region,
} from "./source-region-segmenter.js";

// Spec basis: development-records/design/20260722-source-region-decomposition-stage1-design.md
// §3 (segmenter) + the PR-1b-1 task packet's done-when (a)-(g). This module is PURE and UNWIRED
// (no pipeline caller yet), so every assertion here targets segmentSourceIntoRegions directly —
// there is no run.ts integration to exercise.

const FIXTURES = path.resolve(__dirname, "../../../scripts/fixtures/code-probe");

async function realCodeInventoryArgs(name: string) {
  const ref = path.join(FIXTURES, name);
  const text = await fs.readFile(ref, "utf8");
  const result = await observeCodeStructure({ ref, text });
  if (result.status !== "ok") throw new Error(`expected ok observation for ${name}: ${result.status}`);
  return {
    kind: "code" as const,
    ref,
    text,
    lineCount: result.inventory.line_count,
    codeStructureInventory: result.inventory,
  };
}

/** (a) — every region set the segmenter produces must tile [1..lineCount] exactly once. */
function assertGaplessNonOverlappingPartition(regions: Region[], lineCount: number): void {
  expect(regions.length).toBeGreaterThan(0); // cardinality guard — vacuous pass sealed
  const sorted = [...regions].sort((a, b) => a.region_line_start - b.region_line_start);
  expect(sorted[0]!.region_line_start).toBe(1);
  for (let i = 0; i < sorted.length; i += 1) {
    const region = sorted[i]!;
    expect(region.region_line_end).toBeGreaterThanOrEqual(region.region_line_start);
    if (i > 0) expect(region.region_line_start).toBe(sorted[i - 1]!.region_line_end + 1);
  }
  expect(sorted[sorted.length - 1]!.region_line_end).toBe(lineCount);
}

/** (b) — the segmenter must never emit two regions with the same `location`. */
function assertDistinctLocations(regions: Region[]): void {
  const locations = regions.map((r) => r.location);
  expect(new Set(locations).size).toBe(locations.length);
}

/** (d)/(g) — every original observer span must be fully contained in exactly one region, and
 *  every region's line range must be exactly filled by a contiguous run of spans: proves the
 *  code strategy's coalescing is a lossless REFINEMENT (kept spans ∪ dropped spans = all spans,
 *  nothing silently lost) rather than a resample. */
function assertRegionsRefineSpans(regions: Region[], spans: CodeSymbolSpan[]): void {
  const sortedRegions = [...regions].sort((a, b) => a.region_line_start - b.region_line_start);
  const sortedSpans = [...spans].sort((a, b) => a.line_start - b.line_start);
  let spanIndex = 0;
  for (const region of sortedRegions) {
    let coveredEnd = region.region_line_start - 1;
    while (
      spanIndex < sortedSpans.length &&
      sortedSpans[spanIndex]!.line_start === coveredEnd + 1 &&
      sortedSpans[spanIndex]!.line_end <= region.region_line_end
    ) {
      coveredEnd = sortedSpans[spanIndex]!.line_end;
      spanIndex += 1;
    }
    expect(coveredEnd).toBe(region.region_line_end); // no partial span split, no gap inside a region
  }
  expect(spanIndex).toBe(sortedSpans.length); // every span consumed by exactly one region
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

describe("source-region-segmenter", () => {
  describe("code strategy (real inventory)", () => {
    it("partitions the file gap-free/non-overlapping and never duplicates a location", async () => {
      const args = await realCodeInventoryArgs("inventory_service.py");
      const regions = segmentSourceIntoRegions(args);
      assertGaplessNonOverlappingPartition(regions, args.lineCount);
      assertDistinctLocations(regions);
      for (const region of regions) {
        expect(region.region_sha256).toMatch(SHA256_HEX);
        expect(region.structure_token).toMatch(/^L\d+-\d+$/);
      }
    });

    it("coalesces adjacent tiny spans and every span refines into exactly one region (d, g)", async () => {
      const args = await realCodeInventoryArgs("inventory_service.py");
      const regions = segmentSourceIntoRegions(args);
      const spans = args.codeStructureInventory.symbol_tiles.spans;
      expect(spans.length).toBeGreaterThan(0); // cardinality guard
      assertRegionsRefineSpans(regions, spans);
      // inventory_service.py has several single-line dataclass fields / one-line members —
      // coalescing must actually reduce the region count below the raw span count.
      expect(regions.length).toBeLessThan(spans.length);
    });

    it("marks a region declaration iff a member span carries a symbol name", async () => {
      const args = await realCodeInventoryArgs("inventory_service.py");
      const regions = segmentSourceIntoRegions(args);
      const spans = args.codeStructureInventory.symbol_tiles.spans;
      const declaredLines = new Set<number>();
      for (const span of spans) {
        if (span.symbol_names.length > 0) {
          for (let line = span.line_start; line <= span.line_end; line += 1) declaredLines.add(line);
        }
      }
      const declarationRegions = regions.filter((r) => r.role_signal === "declaration");
      expect(declarationRegions.length).toBeGreaterThan(0); // cardinality guard
      for (const region of declarationRegions) {
        let coversDeclaredLine = false;
        for (let line = region.region_line_start; line <= region.region_line_end; line += 1) {
          if (declaredLines.has(line)) coversDeclaredLine = true;
        }
        expect(coversDeclaredLine).toBe(true);
      }
      for (const region of regions.filter((r) => r.role_signal === "body")) {
        for (let line = region.region_line_start; line <= region.region_line_end; line += 1) {
          expect(declaredLines.has(line)).toBe(false);
        }
      }
    });

    it("throws fail-loud when codeStructureInventory.line_count disagrees with args.lineCount", async () => {
      const args = await realCodeInventoryArgs("inventory_service.py");
      expect(() =>
        segmentSourceIntoRegions({ ...args, lineCount: args.lineCount + 1 }),
      ).toThrow(/does not match args\.lineCount/);
    });

    it("determinism: same bytes in twice ⇒ identical regions (c)", async () => {
      const args = await realCodeInventoryArgs("inventory_service.py");
      const first = segmentSourceIntoRegions(args);
      const second = segmentSourceIntoRegions(args);
      expect(second).toEqual(first);
    });

    it("determinism: identical regions from an alternate CWD (c)", async () => {
      const args = await realCodeInventoryArgs("inventory_service.py");
      const baseline = segmentSourceIntoRegions(args);
      const originalCwd = process.cwd();
      const alternateCwd = await fs.mkdtemp(path.join(os.tmpdir(), "onto-region-segmenter-cwd-"));
      let fromAlternateCwd: Region[] = baseline;
      try {
        process.chdir(alternateCwd);
        fromAlternateCwd = segmentSourceIntoRegions(args);
      } finally {
        process.chdir(originalCwd);
      }
      expect(fromAlternateCwd).toEqual(baseline);
    });
  });

  describe("code strategy (no inventory — blank-line-paragraph fallback)", () => {
    const TEXT = ["line one", "line two", "", "line four", "", "", "line seven"].join("\n");
    const LINE_COUNT = TEXT.split(/\r?\n/).length;

    it("splits on blank-line boundaries, blanks attaching to the following paragraph", () => {
      const regions = segmentSourceIntoRegions({
        kind: "code",
        ref: "irrelevant.unknownlang",
        text: TEXT,
        lineCount: LINE_COUNT,
      });
      assertGaplessNonOverlappingPartition(regions, LINE_COUNT);
      assertDistinctLocations(regions);
      expect(regions.every((r) => r.role_signal === "body")).toBe(true);
      const boundaries = regions
        .slice()
        .sort((a, b) => a.region_line_start - b.region_line_start)
        .map((r) => [r.region_line_start, r.region_line_end]);
      expect(boundaries).toEqual([
        [1, 2],
        [3, 4],
        [5, 7],
      ]);
    });
  });

  describe("document strategy", () => {
    // Duplicate top-level "# Overview" headings (b) + a nested "## Details" under the first one
    // (e — heading-aligned, hierarchy reflected in the token path).
    const HEADING_TEXT = [
      "Intro paragraph before any heading.",
      "",
      "# Overview",
      "First section body text.",
      "",
      "## Details",
      "Nested content here.",
      "",
      "# Overview",
      "Second top-level section with the same title.",
      "",
      "Trailing paragraph.",
    ].join("\n");
    const HEADING_LINE_COUNT = HEADING_TEXT.split(/\r?\n/).length;

    function segmentHeadingFixture(): Region[] {
      return segmentSourceIntoRegions({
        kind: "document",
        ref: "doc.md",
        text: HEADING_TEXT,
        lineCount: HEADING_LINE_COUNT,
      });
    }

    it("covers the file gap-free/non-overlapping with heading-aligned regions, nothing excluded (e)", () => {
      const regions = segmentHeadingFixture();
      assertGaplessNonOverlappingPartition(regions, HEADING_LINE_COUNT);
      const headingRegions = regions.filter((r) => r.role_signal === "heading");
      expect(headingRegions.length).toBe(3); // "# Overview", "## Details", "# Overview" (again)
      const sorted = regions.slice().sort((a, b) => a.region_line_start - b.region_line_start);
      expect(sorted.map((r) => [r.region_line_start, r.region_line_end, r.role_signal])).toEqual([
        [1, 2, "body"], // heading-less prefix, blank-line split
        [3, 5, "heading"], // "# Overview" .. before "## Details"
        [6, 8, "heading"], // "## Details" .. before the next "# Overview"
        [9, 12, "heading"], // second "# Overview" .. EOF
      ]);
      expect(sorted[1]!.structure_token).toBe("§Overview");
      expect(sorted[2]!.structure_token).toBe("§Overview/Details");
      expect(sorted[3]!.structure_token).toBe("§Overview"); // native token repeats — real duplicate title
    });

    it("disambiguates a repeated structure_token into a distinct location by ordinal (b)", () => {
      const regions = segmentHeadingFixture();
      assertDistinctLocations(regions);
      const sorted = regions.slice().sort((a, b) => a.region_line_start - b.region_line_start);
      const firstOverview = sorted[1]!;
      const secondOverview = sorted[3]!;
      expect(firstOverview.structure_token).toBe(secondOverview.structure_token);
      expect(firstOverview.location).not.toBe(secondOverview.location);
      expect(firstOverview.location).toBe("§Overview");
      expect(secondOverview.location).toBe(`§Overview#${secondOverview.ordinal}`);
    });

    it("falls back to blank-line paragraphs when there are no headings at all", () => {
      const text = ["line one", "line two", "", "line four", "", "", "line seven"].join("\n");
      const lineCount = text.split(/\r?\n/).length;
      const regions = segmentSourceIntoRegions({ kind: "document", ref: "plain.md", text, lineCount });
      assertGaplessNonOverlappingPartition(regions, lineCount);
      expect(regions.every((r) => r.role_signal === "body")).toBe(true);
    });
  });

  describe("spreadsheet / database strategy", () => {
    for (const kind of ["spreadsheet", "database"] as const) {
      it(`returns a single whole-file region for kind=${kind}`, () => {
        const text = "sheet contents are not line-decomposed here\nsecond line";
        const lineCount = text.split(/\r?\n/).length;
        const regions = segmentSourceIntoRegions({ kind, ref: "workbook.xlsx", text, lineCount });
        expect(regions).toHaveLength(1);
        expect(regions[0]!.structure_token).toBe(`L1-${lineCount}`);
        expect(regions[0]!.location).toBe(`L1-${lineCount}`);
        expect(regions[0]!.region_line_start).toBe(1);
        expect(regions[0]!.region_line_end).toBe(lineCount);
      });
    }
  });

  describe("structureless fallback (f)", () => {
    for (const kind of ["unknown", "mixed"] as const) {
      it(`returns exactly one region L1-<lineCount> for kind=${kind}`, () => {
        const text = "opaque content\nline 2\nline 3";
        const lineCount = text.split(/\r?\n/).length;
        const regions = segmentSourceIntoRegions({ kind, ref: "opaque.bin", text, lineCount });
        expect(regions).toHaveLength(1);
        expect(regions[0]).toMatchObject({
          location: `L1-${lineCount}`,
          structure_token: `L1-${lineCount}`,
          ordinal: 1,
          role_signal: "body",
          region_line_start: 1,
          region_line_end: lineCount,
        });
        expect(regions[0]!.region_sha256).toMatch(SHA256_HEX);
      });
    }

    it("returns exactly one region for an empty file (lineCount coerced to 1)", () => {
      const regions = segmentSourceIntoRegions({ kind: "unknown", ref: "empty.bin", text: "", lineCount: 0 });
      expect(regions).toHaveLength(1);
      expect(regions[0]!.structure_token).toBe("L1-1");
    });
  });

  it("CODE_REGION_COALESCE_MIN_LINES is a positive tunable constant", () => {
    expect(CODE_REGION_COALESCE_MIN_LINES).toBeGreaterThan(0);
  });

  // Adversarial review Finding 2: splitPreservingTerminators previously split on
  // /(\r\n|\r|\n)/ — a lone `\r` counted as a line break there, but `lineCount` (and every
  // caller's line numbering) uses `text.split(/\r?\n/).length`, where a lone `\r` is WITHIN a
  // line. On a lone `\r` this made content.length exceed lineCount, so document/fallback
  // strategies (iterating only 1..lineCount) silently dropped the file's tail and
  // sliceRegionText/region_line_* misaligned. CRLF and LF are unaffected — only a lone `\r`
  // (classic-Mac, or a stray `\r` embedded in an LF file) exposed the divergence.
  describe("line-terminator convention (\\r?\\n, matching lineCount — Finding 2)", () => {
    it("treats an embedded lone \\r as ordinary line content, not a break: gap-free coverage + exact reconstruction (document strategy)", () => {
      const text = [
        "# Heading",
        "body line with a lone CR\rinside it",
        "second body line",
        "",
        "## Sub",
        "sub body line",
      ].join("\n");
      const lineCount = text.split(/\r?\n/).length;
      expect(lineCount).toBe(6); // the lone \r must NOT count as an extra line

      const regions = segmentSourceIntoRegions({ kind: "document", ref: "doc.md", text, lineCount });
      assertGaplessNonOverlappingPartition(regions, lineCount); // pre-fix: dropped the tail
      assertDistinctLocations(regions);

      // Excerpt alignment: reconstructing every region's exact slice and concatenating in
      // line order reproduces the ORIGINAL text byte-for-byte — nothing dropped, nothing
      // duplicated, the embedded \r preserved exactly where it was.
      const sorted = [...regions].sort((a, b) => a.region_line_start - b.region_line_start);
      const reconstructed = sorted
        .map((region) => sliceRegionText(text, region.region_line_start, region.region_line_end))
        .join("");
      expect(reconstructed).toBe(text);
      // The lone \r must survive inside whichever region covers line 2 — never treated as a
      // region boundary of its own.
      const line2Region = sorted.find((r) => r.region_line_start <= 2 && r.region_line_end >= 2);
      expect(line2Region).toBeDefined();
      expect(sliceRegionText(text, 2, 2)).toBe("body line with a lone CR\rinside it\n");
    });

    it("preserves gap-free coverage + exact reconstruction across mixed CRLF/LF/lone-CR line endings", () => {
      const text = "# Heading\r\ncrlf body line\r\nlone CR line\rcontinuing\nfinal line";
      const lineCount = text.split(/\r?\n/).length;
      expect(lineCount).toBe(4);

      const regions = segmentSourceIntoRegions({ kind: "document", ref: "doc.md", text, lineCount });
      assertGaplessNonOverlappingPartition(regions, lineCount);
      assertDistinctLocations(regions);

      const sorted = [...regions].sort((a, b) => a.region_line_start - b.region_line_start);
      const reconstructed = sorted
        .map((region) => sliceRegionText(text, region.region_line_start, region.region_line_end))
        .join("");
      expect(reconstructed).toBe(text); // CRLF/LF terminators preserved exactly, lone \r untouched
    });
  });
});
