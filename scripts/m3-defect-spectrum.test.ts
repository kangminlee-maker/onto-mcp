import { describe, it, expect } from "vitest";
import {
  scoreDefectSpectrum,
  attributeAndScore,
  parseSeededDefects,
  parseSurfacedIssues,
  isMaterialSeverity,
  type SeededDefect,
  type SurfacedIssue,
  type IssueAttribution,
  type BandThresholds,
  type DefectAttributionJudge,
} from "./m3-defect-spectrum.ts";

// 3 material + 1 medium_or_above → seeded_total=4, material_total=3.
const DEFECTS: SeededDefect[] = [
  { id: "D1", kind: "duplicate_concept", where: "A", description: "d1", severity_expectation: "material" },
  { id: "D2", kind: "authority_conflict", where: "B", description: "d2", severity_expectation: "material" },
  { id: "D3", kind: "missing_relation", where: "C", description: "d3", severity_expectation: "material" },
  { id: "D4", kind: "relation_inconsistency", where: "D", description: "d4", severity_expectation: "medium_or_above" },
];

const THRESHOLDS: BandThresholds = {
  meet_material_recall: 1,
  exceed_material_recall: 1,
  exceed_precision: 0.9,
  floor_precision: 0.8,
};

function issue(id: string, severity: SurfacedIssue["severity"] = "high"): SurfacedIssue {
  return { issue_id: id, issue_statement: `statement ${id}`, severity };
}
function attr(id: string, ...defectIds: string[]): IssueAttribution {
  return { issue_id: id, attributed_defect_ids: defectIds };
}

describe("scoreDefectSpectrum", () => {
  it("full detection of every seeded defect, no fabrication → exceeds", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      issues: [issue("i1"), issue("i2"), issue("i3"), issue("i4")],
      attributions: [attr("i1", "D1"), attr("i2", "D2"), attr("i3", "D3"), attr("i4", "D4")],
      thresholds: THRESHOLDS,
    });
    expect(r.recall_overall).toBe(1);
    expect(r.recall_material).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.fabricated_issues).toBe(0);
    expect(r.band).toBe("exceeds");
  });

  it("FALSIFIABLE: missing one material defect drops material recall and the band (contrast with full)", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      issues: [issue("i1"), issue("i2")], // D3 (material) + D4 never surfaced
      attributions: [attr("i1", "D1"), attr("i2", "D2")],
      thresholds: THRESHOLDS,
    });
    expect(r.detected_defect_ids).toEqual(["D1", "D2"]);
    expect(r.recall_material).toBeCloseTo(2 / 3);
    expect(r.recall_material).toBeLessThan(1);
    expect(r.band).toBe("below"); // recall_material < meet(1)
  });

  it("FALSIFIABLE: a fabrication (issue attributed to no defect) drops precision; volume cannot buy a band (review F3)", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      // all real material defects found, BUT one extra fabricated material issue
      issues: [issue("i1"), issue("i2"), issue("i3"), issue("iX")],
      attributions: [attr("i1", "D1"), attr("i2", "D2"), attr("i3", "D3"), attr("iX") /* empty */],
      thresholds: THRESHOLDS,
    });
    expect(r.recall_material).toBe(1); // detection is complete
    expect(r.fabricated_issues).toBe(1);
    expect(r.precision).toBe(0.75); // 3/4
    expect(r.precision).toBeLessThan(THRESHOLDS.floor_precision);
    expect(r.band).toBe("below"); // precision floor gates the band despite full recall
  });

  it("precision between floor and exceed → meets (not exceeds), full recall", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      issues: [issue("i1"), issue("i2"), issue("i3"), issue("i4"), issue("iX")],
      attributions: [attr("i1", "D1"), attr("i2", "D2"), attr("i3", "D3"), attr("i4", "D4"), attr("iX")],
      thresholds: THRESHOLDS,
    });
    expect(r.recall_material).toBe(1);
    expect(r.precision).toBe(0.8); // 4/5 == floor, not < floor
    expect(r.precision).toBeLessThan(THRESHOLDS.exceed_precision);
    expect(r.band).toBe("meets");
  });

  it("FALSIFIABLE: a material defect surfaced only at low severity is detected but NOT severity-aligned", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      issues: [issue("i1", "low"), issue("i2"), issue("i3"), issue("i4")],
      attributions: [attr("i1", "D1"), attr("i2", "D2"), attr("i3", "D3"), attr("i4", "D4")],
      thresholds: THRESHOLDS,
    });
    expect(r.detected_defect_ids).toContain("D1"); // still detected
    expect(r.severity_aligned_defect_ids).not.toContain("D1"); // but not aligned (low < material)
    expect(r.severity_alignment_rate).toBeCloseTo(3 / 4);
  });

  it("one issue may surface multiple seeded defects (attributed_defect_ids is a set)", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      issues: [issue("i1"), issue("i2")],
      attributions: [attr("i1", "D1", "D2"), attr("i2", "D3", "D4")],
      thresholds: THRESHOLDS,
    });
    expect(r.detected_defect_ids).toEqual(["D1", "D2", "D3", "D4"]);
    expect(r.recall_overall).toBe(1);
    expect(r.attributed_issues).toBe(2);
    expect(r.precision).toBe(1);
  });

  it("is deterministic: identical inputs → identical result", () => {
    const call = () =>
      scoreDefectSpectrum({
        seededDefects: DEFECTS,
        issues: [issue("i1"), issue("iX")],
        attributions: [attr("i1", "D2"), attr("iX")],
        thresholds: THRESHOLDS,
      });
    expect(call()).toEqual(call());
  });

  it("guards: empty ground truth throws (vacuous-recall guard)", () => {
    expect(() =>
      scoreDefectSpectrum({ seededDefects: [], issues: [], attributions: [], thresholds: THRESHOLDS }),
    ).toThrow(/empty/);
  });

  it("guards: a surfaced issue with no attribution throws (no silent drop)", () => {
    expect(() =>
      scoreDefectSpectrum({
        seededDefects: DEFECTS,
        issues: [issue("i1"), issue("i2")],
        attributions: [attr("i1", "D1")], // i2 unanswered
        thresholds: THRESHOLDS,
      }),
    ).toThrow(/no attribution for surfaced issue i2/);
  });

  it("guards: attribution naming an unknown defect id throws (no recall inflation)", () => {
    expect(() =>
      scoreDefectSpectrum({
        seededDefects: DEFECTS,
        issues: [issue("i1")],
        attributions: [attr("i1", "D9")],
        thresholds: THRESHOLDS,
      }),
    ).toThrow(/unknown seeded defect 'D9'/);
  });

  it("guards: duplicate attribution for one issue throws", () => {
    expect(() =>
      scoreDefectSpectrum({
        seededDefects: DEFECTS,
        issues: [issue("i1")],
        attributions: [attr("i1", "D1"), attr("i1", "D2")],
        thresholds: THRESHOLDS,
      }),
    ).toThrow(/duplicate attribution for issue i1/);
  });
});

describe("attributeAndScore", () => {
  it("runs an injected judge then scores (parity with scoreDefectSpectrum on the same attributions)", async () => {
    const issues = [issue("i1"), issue("i2"), issue("iX")];
    const attributions = [attr("i1", "D1"), attr("i2", "D2", "D3"), attr("iX")];
    const judge: DefectAttributionJudge = () => attributions;

    const viaJudge = await attributeAndScore({ seededDefects: DEFECTS, issues, judge, thresholds: THRESHOLDS });
    const direct = scoreDefectSpectrum({ seededDefects: DEFECTS, issues, attributions, thresholds: THRESHOLDS });
    expect(viaJudge).toEqual(direct);
    expect(viaJudge.detected_defect_ids).toEqual(["D1", "D2", "D3"]);
    expect(viaJudge.fabricated_issues).toBe(1);
  });

  it("awaits an async judge (production LLM shape)", async () => {
    const judge: DefectAttributionJudge = async () => [attr("i1", "D1")];
    const r = await attributeAndScore({ seededDefects: DEFECTS, issues: [issue("i1")], judge, thresholds: THRESHOLDS });
    expect(r.recall_overall).toBe(0.25); // 1 of 4
  });
});

describe("parseSeededDefects", () => {
  it("parses ground-truth rows and preserves severity_expectation", () => {
    const defects = parseSeededDefects({
      fixture: "x",
      seeded_defects: [
        { id: "A1", kind: "k", where: "w", description: "d", severity_expectation: "material" },
        { id: "A2", kind: "k", where: "w", description: "d", severity_expectation: "medium_or_above" },
      ],
    });
    expect(defects.map((d) => d.id)).toEqual(["A1", "A2"]);
    expect(defects[1].severity_expectation).toBe("medium_or_above");
  });

  it("rejects an empty seeded_defects list, a bad severity_expectation, and duplicate ids", () => {
    expect(() => parseSeededDefects({ seeded_defects: [] })).toThrow(/non-empty/);
    expect(() =>
      parseSeededDefects({ seeded_defects: [{ id: "A1", kind: "k", where: "w", description: "d", severity_expectation: "high" }] }),
    ).toThrow(/severity_expectation/);
    const dup = { id: "A1", kind: "k", where: "w", description: "d", severity_expectation: "material" };
    expect(() => parseSeededDefects({ seeded_defects: [dup, dup] })).toThrow(/duplicate seeded defect id/);
  });
});

describe("parseSurfacedIssues", () => {
  const findingLedger = {
    findings: [
      { finding_id: "f1", severity: "high" },
      { finding_id: "f2", severity: "medium" },
      { finding_id: "f3", severity: "low" }, // non-material
      { finding_id: "f4", severity: "blocker" },
    ],
  };

  it("derives issue severity from the MAX severity of its surface_finding_ids", () => {
    const issues = parseSurfacedIssues(
      { issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["f2", "f1"] }] },
      findingLedger,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high"); // max(medium, high) = high
  });

  it("drops a non-material issue (all its surface findings low/info)", () => {
    const issues = parseSurfacedIssues(
      {
        issues: [
          { issue_id: "iss-mat", issue_statement: "s", surface_finding_ids: ["f4"] }, // blocker
          { issue_id: "iss-low", issue_statement: "s", surface_finding_ids: ["f3"] }, // low → dropped
        ],
      },
      findingLedger,
    );
    expect(issues.map((i) => i.issue_id)).toEqual(["iss-mat"]);
    expect(issues[0].severity).toBe("blocker");
  });

  it("throws when an issue has no surface_finding_ids or references no resolvable severity", () => {
    expect(() =>
      parseSurfacedIssues({ issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: [] }] }, findingLedger),
    ).toThrow(/no surface_finding_ids/);
    expect(() =>
      parseSurfacedIssues(
        { issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["nope"] }] },
        findingLedger,
      ),
    ).toThrow(/no resolvable surface finding severity/);
  });

  it("parses the real clinical-lab evidence issue-ledger + finding-ledger (material issues, cardinality > 0)", async () => {
    const fs = await import("node:fs/promises");
    const YAML = (await import("yaml")).default;
    const base = "development-records/benchmark/fixtures/ontology/clinical-lab-workflow/evidence/20260610-5fbe917f";
    const issueLedger = YAML.parse(await fs.readFile(`${base}/issue-ledger.yaml`, "utf8"));
    const findingLedger = YAML.parse(await fs.readFile(`${base}/finding-ledger.yaml`, "utf8"));
    const issues = parseSurfacedIssues(issueLedger, findingLedger);
    expect(issues.length).toBeGreaterThan(0); // non-vacuous: real evidence yields material issues
    expect(issues.every((i) => isMaterialSeverity(i.severity))).toBe(true);
    expect(new Set(issues.map((i) => i.issue_id)).size).toBe(issues.length); // unique
  });
});
