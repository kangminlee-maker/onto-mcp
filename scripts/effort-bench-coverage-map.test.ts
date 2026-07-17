import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildCoverageMapReport,
  COVERAGE_MAP_FIXTURES,
  DEFAULT_KNOB_LADDER,
  DEFAULT_MIN_MATERIAL_OUT,
  joinAnchorsWithGroundTruth,
  loadFixtureAnchorSet,
  parseEvidenceAnchors,
  renderFixtureMaterializedInput,
  serializeCoverageMapReport,
} from "./effort-bench-coverage-map.ts";
import type { SeededDefect } from "./m3-defect-spectrum.ts";

/**
 * P1 item ① verification (design §4-2/§4-3):
 *  - the authored evidence anchors for ALL four fixtures resolve uniquely in
 *    the RENDERED materialized input (the mapper fail-louds on ambiguity or a
 *    missing anchor, so a green build here IS the anchor-validity gate);
 *  - our locally-rendered document is byte-identical to the materialized
 *    input a LIVE review session persisted (coordinate fidelity — the bench's
 *    ground-truth coordinates are the treatment's coordinates);
 *  - the committed coverage-map report matches a fresh recomputation
 *    (drift gate: fixture/anchor edits without regeneration fail loudly).
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_ROOT = path.join(REPO_ROOT, "development-records/benchmark/fixtures/ontology");
const COMMITTED_REPORT = path.join(
  REPO_ROOT,
  "development-records/benchmark/effort-bench/coverage-map-report.yaml",
);

const normalizeRefLines = (text: string): string =>
  text
    .split("\n")
    .map((line) => (line.startsWith("ref: ") ? "ref: X" : line))
    .join("\n");

describe("evidence anchors — validity over all fixtures (fail-loud gate)", () => {
  it("every fixture's anchors resolve uniquely in the rendered input", async () => {
    // buildCoverageMapReport throws on any ambiguous/missing anchor, id-set
    // mismatch, or fixture-layout drift — the assertion is that it completes.
    const report = await buildCoverageMapReport();
    expect(report.fixtures.map((f) => f.fixture)).toEqual([...COVERAGE_MAP_FIXTURES]);
    // Non-vacuous: 10 seeded defects per fixture actually entered the map.
    for (const fixture of report.fixtures) {
      expect(fixture.defects).toHaveLength(10);
    }
  });

  it("rendered_lines follows the renderer arithmetic (target newlines + 6)", async () => {
    // 1 kind + 1 blank + 1 `##` + 1 `ref:` + 1 blank = 5 header lines, plus
    // the trailing empty split segment (the split-length convention
    // truncateForEmbedding cuts by) = +6 over the target's newline count.
    const report = await buildCoverageMapReport();
    for (const fixture of report.fixtures) {
      const targetDir = path.join(FIXTURES_ROOT, fixture.fixture, "target");
      const [entry] = await fs.readdir(targetDir);
      const raw = await fs.readFile(path.join(targetDir, entry!), "utf8");
      const targetNewlines = raw.split("\n").length - 1;
      expect(fixture.rendered_lines).toBe(targetNewlines + 6);
    }
  });
});

describe("coordinate fidelity — local render vs live-session persisted input", () => {
  it("matches the session artifact byte-for-byte after ref-path normalization", async () => {
    // The live run rendered the same target from a temp project root, so only
    // the `ref:` absolute-path line may differ. Everything else must be
    // byte-identical or the bench's coordinates are NOT the treatment's.
    const rendered = await renderFixtureMaterializedInput("clinical-lab-workflow");
    const persisted = await fs.readFile(
      path.join(
        FIXTURES_ROOT,
        "clinical-lab-workflow/evidence/20260716-49a71a98/execution-preparation/materialized-input.md",
      ),
      "utf8",
    );
    expect(normalizeRefLines(rendered)).toBe(normalizeRefLines(persisted));
  });
});

describe("committed coverage-map report — drift gate", () => {
  it("recomputation reproduces the committed report byte-for-byte", async () => {
    const committed = await fs.readFile(COMMITTED_REPORT, "utf8");
    const fresh = serializeCoverageMapReport(await buildCoverageMapReport());
    expect(fresh).toBe(committed);
  });

  it("frozen eligibility spot-checks (deterministic prereg basis)", async () => {
    const report = await buildCoverageMapReport();
    const cell = (fixtureId: string, knob: number) => {
      const fixture = report.fixtures.find((f) => f.fixture === fixtureId)!;
      return fixture.cells.find((c) => c.max_embed_lines === knob)!;
    };
    // All four fixtures are eligible at knobs 40 and 60 (INV-BENCH-1:
    // fixtures >= 2 per coverage level holds with room to spare).
    for (const fixtureId of COVERAGE_MAP_FIXTURES) {
      expect(cell(fixtureId, 40).eligible).toBe(true);
      expect(cell(fixtureId, 60).eligible).toBe(true);
    }
    // Knob 80 splits the pool: clinical-lab (1 material out, 3 straddle) and
    // credit-risk (1 material out) are INELIGIBLE — the deterministic
    // predicate rejects them before any review is dispatched (R2-6).
    expect(cell("clinical-lab-workflow", 80).eligible).toBe(false);
    expect(cell("clinical-lab-workflow", 80).material_out_count).toBe(1);
    expect(cell("credit-risk-taxonomy", 80).eligible).toBe(false);
    expect(cell("logistics-fulfillment", 80).eligible).toBe(true);
    expect(cell("manufacturing-bom", 80).eligible).toBe(true);
    // Knob 300 is a no-cut full-coverage baseline everywhere.
    for (const fixtureId of COVERAGE_MAP_FIXTURES) {
      expect(cell(fixtureId, 300).truncated).toBe(false);
      expect(cell(fixtureId, 300).eligible).toBe(true);
    }
  });
});

describe("anchor/ground-truth join — fail-loud discipline", () => {
  const seeded = (id: string, sev: SeededDefect["severity_expectation"]): SeededDefect => ({
    id,
    kind: "k",
    where: "w",
    description: "d",
    severity_expectation: sev,
  });

  it("derives material strictly from severity_expectation", async () => {
    const anchors = await loadFixtureAnchorSet("clinical-lab-workflow");
    const byId = new Map(anchors.map((a) => [a.id, a]));
    expect(byId.get("CLW-1")!.material).toBe(true);
    expect(byId.get("CLW-8")!.material).toBe(false); // medium_or_above
  });

  it("rejects a seeded defect without anchors", () => {
    expect(() =>
      joinAnchorsWithGroundTruth(
        { fixture: "f", defects: [{ id: "D-1", anchors: ["a"] }] },
        [seeded("D-1", "material"), seeded("D-2", "material")],
      ),
    ).toThrow(/seeded defects without anchors: D-2/);
  });

  it("rejects anchor ids missing from the ground truth", () => {
    expect(() =>
      joinAnchorsWithGroundTruth(
        { fixture: "f", defects: [{ id: "D-1", anchors: ["a"] }, { id: "GHOST", anchors: ["b"] }] },
        [seeded("D-1", "material")],
      ),
    ).toThrow(/anchor ids not in ground truth: GHOST/);
  });

  it("parseEvidenceAnchors rejects wrong schema, empty anchors, duplicates", () => {
    const valid = {
      schema_version: "effort-bench-evidence-anchors/1",
      fixture: "f",
      defects: [{ id: "D-1", anchors: ["a"] }],
    };
    expect(() => parseEvidenceAnchors({ ...valid, schema_version: "nope/9" })).toThrow(
      /unsupported schema_version/,
    );
    expect(() =>
      parseEvidenceAnchors({ ...valid, defects: [{ id: "D-1", anchors: [] }] }),
    ).toThrow(/anchors must be a non-empty list/);
    expect(() =>
      parseEvidenceAnchors({
        ...valid,
        defects: [
          { id: "D-1", anchors: ["a"] },
          { id: "D-1", anchors: ["b"] },
        ],
      }),
    ).toThrow(/duplicate defect id/);
  });

  it("rejects a malformed knob ladder", async () => {
    await expect(buildCoverageMapReport({ knobLadder: [] })).rejects.toThrow(/non-empty list/);
    await expect(buildCoverageMapReport({ knobLadder: [40, 40] })).rejects.toThrow(/unique/);
    await expect(buildCoverageMapReport({ knobLadder: [0] })).rejects.toThrow(/positive integers/);
  });

  it("default knob ladder and threshold are the committed report's values", () => {
    expect(DEFAULT_KNOB_LADDER).toEqual([40, 60, 80, 120, 300]);
    expect(DEFAULT_MIN_MATERIAL_OUT).toBe(2);
  });
});
