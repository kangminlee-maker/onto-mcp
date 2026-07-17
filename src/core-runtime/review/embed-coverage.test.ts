import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  computeEmbedCoverage,
  coverageCellEligibility,
  type DefectEvidenceAnchor,
} from "./embed-coverage.js";
import {
  renderReviewTargetMaterializedInput,
  truncateForEmbedding,
} from "./review-artifact-utils.js";

/**
 * Coverage must be computed in RENDERED materialized-input coordinates
 * (design §4-2, finding R2-3): the packet cut applies to the composite
 * document the production renderer builds (kind line + per-ref headers +
 * contents), not to raw target-file lines. These tests exercise the mapper
 * against the REAL renderer and byte-compare classifications against the REAL
 * `truncateForEmbedding` output, so a drift in either coordinate system fails
 * loudly here.
 */

const FILE_A_LINES = Array.from({ length: 30 }, (_, i) => `alpha_field_${i + 1}: value`);
const FILE_B_LINES = Array.from({ length: 30 }, (_, i) => `beta_field_${i + 1}: value`);

let dir: string;
let refA: string;
let refB: string;
let renderedSingle: string;
let renderedMulti: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "embed-coverage-"));
  refA = path.join(dir, "target-a.yaml");
  refB = path.join(dir, "target-b.yaml");
  await writeFile(refA, `${FILE_A_LINES.join("\n")}\n`, "utf8");
  await writeFile(refB, `${FILE_B_LINES.join("\n")}\n`, "utf8");
  renderedSingle = await renderReviewTargetMaterializedInput("file", [refA]);
  renderedMulti = await renderReviewTargetMaterializedInput("bundle", [refA, refB]);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const defect = (
  id: string,
  anchors: string[],
  material = true,
): DefectEvidenceAnchor => ({ id, anchors, material });

describe("computeEmbedCoverage — rendered coordinates (real renderer)", () => {
  it("maps a single-ref anchor to the rendered line (header offset applied)", () => {
    // Renderer layout: 1 `kind:` + 1 blank + 1 `##` + 1 `ref:` + 1 blank, then content.
    const report = computeEmbedCoverage(renderedSingle, 10, [
      defect("D-1", ["alpha_field_1:"]),
    ]);
    expect(report.defects[0]!.anchor_lines).toEqual([6]);
    expect(report.defects[0]!.status).toBe("in");
    // The raw-file line would be 1 — asserting 6 proves we are NOT in raw
    // target coordinates (the rev.2.1 mistake this module corrects).
  });

  it("classifies in/out against the byte-identical truncateForEmbedding output", () => {
    const cut = 20;
    const truncated = truncateForEmbedding(renderedSingle, cut, "/full/ref");
    const report = computeEmbedCoverage(renderedSingle, cut, [
      defect("IN-1", ["alpha_field_5:"]),
      defect("OUT-1", ["alpha_field_29:"]),
    ]);
    const byId = new Map(report.defects.map((d) => [d.id, d]));
    expect(byId.get("IN-1")!.status).toBe("in");
    expect(byId.get("OUT-1")!.status).toBe("out");
    // Byte-level contract: an "in" anchor survives the real cut; an "out"
    // anchor does not appear in the truncated text.
    expect(truncated).toContain("alpha_field_5:");
    expect(truncated).not.toContain("alpha_field_29:");
  });

  it("boundary: an anchor exactly on the last surviving line is in", () => {
    const cut = 6; // line 6 = first content line
    const truncated = truncateForEmbedding(renderedSingle, cut, "/full/ref");
    const report = computeEmbedCoverage(renderedSingle, cut, [
      defect("EDGE", ["alpha_field_1:"]),
    ]);
    expect(report.defects[0]!.status).toBe("in");
    expect(truncated).toContain("alpha_field_1:");
    // and the very next line is already out
    const next = computeEmbedCoverage(renderedSingle, cut, [
      defect("EDGE2", ["alpha_field_2:"]),
    ]);
    expect(next.defects[0]!.status).toBe("out");
    expect(truncated).not.toContain("alpha_field_2:");
  });

  it("multi-ref: second file's anchors sit beyond the first file's rendered block", () => {
    // Cut after file A's content but before file B's: B is out, A is in.
    const cut = 30;
    const truncated = truncateForEmbedding(renderedMulti, cut, "/full/ref");
    const report = computeEmbedCoverage(renderedMulti, cut, [
      defect("A-D", ["alpha_field_3:"]),
      defect("B-D", ["beta_field_3:"]),
    ]);
    const byId = new Map(report.defects.map((d) => [d.id, d]));
    expect(byId.get("A-D")!.status).toBe("in");
    expect(byId.get("B-D")!.status).toBe("out");
    expect(truncated).toContain("alpha_field_3:");
    expect(truncated).not.toContain("beta_field_3:");
  });

  it("straddle: anchors on both sides of the cut", () => {
    const report = computeEmbedCoverage(renderedMulti, 30, [
      defect("STRADDLE", ["alpha_field_2:", "beta_field_2:"]),
    ]);
    expect(report.defects[0]!.status).toBe("straddle");
    expect(report.material_straddle_count).toBe(1);
    expect(report.material_out_count).toBe(0);
  });

  it("no cut when the budget covers the rendered input — everything is in", () => {
    const renderedLines = renderedSingle.split("\n").length;
    const report = computeEmbedCoverage(renderedSingle, renderedLines, [
      defect("D-1", ["alpha_field_29:"]),
    ]);
    expect(report.truncated).toBe(false);
    expect(report.defects[0]!.status).toBe("in");
    // truncateForEmbedding must agree: budget >= lines → full text unchanged.
    expect(truncateForEmbedding(renderedSingle, renderedLines, "/x")).toBe(renderedSingle);
  });

  it("counts only fully-out MATERIAL defects in material_out_count", () => {
    const report = computeEmbedCoverage(renderedMulti, 30, [
      defect("OUT-MAT", ["beta_field_5:"], true),
      defect("OUT-NONMAT", ["beta_field_6:"], false),
    ]);
    expect(report.material_out_count).toBe(1);
  });
});

describe("computeEmbedCoverage — fail-loud anchor discipline", () => {
  it("rejects an ambiguous anchor (occurs more than once)", () => {
    // "alpha_field_1" is a prefix of alpha_field_1x? No — but "value" occurs everywhere.
    expect(() =>
      computeEmbedCoverage(renderedSingle, 10, [defect("AMB", ["value"])]),
    ).toThrow(/ambiguous/);
  });

  it("rejects a missing anchor", () => {
    expect(() =>
      computeEmbedCoverage(renderedSingle, 10, [defect("MISS", ["no_such_token_xyz"])]),
    ).toThrow(/not found/);
  });

  it("rejects an empty or multi-line anchor, an anchorless defect, and duplicate ids", () => {
    expect(() =>
      computeEmbedCoverage(renderedSingle, 10, [defect("E", [""])]),
    ).toThrow(/single-line/);
    expect(() =>
      computeEmbedCoverage(renderedSingle, 10, [defect("E", ["a\nb"])]),
    ).toThrow(/single-line/);
    expect(() =>
      computeEmbedCoverage(renderedSingle, 10, [defect("E", [])]),
    ).toThrow(/no anchors/);
    expect(() =>
      computeEmbedCoverage(renderedSingle, 10, [
        defect("DUP", ["alpha_field_1:"]),
        defect("DUP", ["alpha_field_2:"]),
      ]),
    ).toThrow(/duplicate defect id/);
  });

  it("rejects a non-positive embed budget", () => {
    expect(() => computeEmbedCoverage(renderedSingle, 0, [])).toThrow(/positive integer/);
  });
});

describe("coverageCellEligibility — deterministic, pre-registered (R2-6)", () => {
  it("accepts a full-coverage cell as baseline", () => {
    const renderedLines = renderedSingle.split("\n").length;
    const report = computeEmbedCoverage(renderedSingle, renderedLines, [
      defect("D", ["alpha_field_1:"]),
    ]);
    expect(coverageCellEligibility(report, { minMaterialOut: 1 }).eligible).toBe(true);
  });

  it("rejects a truncated cell with too few fully-out material defects", () => {
    const report = computeEmbedCoverage(renderedMulti, 30, [
      defect("IN", ["alpha_field_1:"]),
      defect("STRADDLE", ["alpha_field_4:", "beta_field_4:"]),
    ]);
    const verdict = coverageCellEligibility(report, { minMaterialOut: 1 });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/straddle=1 does not count/);
  });

  it("accepts a truncated cell meeting the material-out threshold", () => {
    const report = computeEmbedCoverage(renderedMulti, 30, [
      defect("OUT-1", ["beta_field_7:"]),
      defect("OUT-2", ["beta_field_8:"]),
    ]);
    expect(
      coverageCellEligibility(report, { minMaterialOut: 2 }).eligible,
    ).toBe(true);
  });

  it("rejects a non-positive threshold", () => {
    const report = computeEmbedCoverage(renderedSingle, 10, []);
    expect(() => coverageCellEligibility(report, { minMaterialOut: 0 })).toThrow(
      /positive integer/,
    );
  });
});
