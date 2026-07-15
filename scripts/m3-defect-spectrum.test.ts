import { describe, it, expect } from "vitest";
import {
  scoreDefectSpectrum,
  attributeAndScore,
  isMaterialSeverity,
  type SeededDefect,
  type SurfacedFinding,
  type FindingAttribution,
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

function finding(id: string, severity: SurfacedFinding["severity"] = "high"): SurfacedFinding {
  return { finding_id: id, claim: `claim ${id}`, severity };
}
function attr(id: string, ...defectIds: string[]): FindingAttribution {
  return { finding_id: id, attributed_defect_ids: defectIds };
}

describe("scoreDefectSpectrum", () => {
  it("full detection of every seeded defect, no fabrication → exceeds", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      findings: [finding("f1"), finding("f2"), finding("f3"), finding("f4")],
      attributions: [attr("f1", "D1"), attr("f2", "D2"), attr("f3", "D3"), attr("f4", "D4")],
      thresholds: THRESHOLDS,
    });
    expect(r.recall_overall).toBe(1);
    expect(r.recall_material).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.fabricated_findings).toBe(0);
    expect(r.band).toBe("exceeds");
  });

  it("FALSIFIABLE: missing one material defect drops material recall and the band (contrast with full)", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      findings: [finding("f1"), finding("f2")], // D3 (material) + D4 never surfaced
      attributions: [attr("f1", "D1"), attr("f2", "D2")],
      thresholds: THRESHOLDS,
    });
    expect(r.detected_defect_ids).toEqual(["D1", "D2"]);
    expect(r.recall_material).toBeCloseTo(2 / 3);
    expect(r.recall_material).toBeLessThan(1);
    expect(r.band).toBe("below"); // recall_material < meet(1)
  });

  it("FALSIFIABLE: a fabrication (finding attributed to no defect) drops precision; volume cannot buy a band (review F3)", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      // all real material defects found, BUT one extra fabricated material finding
      findings: [finding("f1"), finding("f2"), finding("f3"), finding("fX")],
      attributions: [attr("f1", "D1"), attr("f2", "D2"), attr("f3", "D3"), attr("fX") /* empty */],
      thresholds: THRESHOLDS,
    });
    expect(r.recall_material).toBe(1); // detection is complete
    expect(r.fabricated_findings).toBe(1);
    expect(r.precision).toBe(0.75); // 3/4
    expect(r.precision).toBeLessThan(THRESHOLDS.floor_precision);
    expect(r.band).toBe("below"); // precision floor gates the band despite full recall
  });

  it("precision between floor and exceed → meets (not exceeds), full recall", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      findings: [finding("f1"), finding("f2"), finding("f3"), finding("f4"), finding("fX")],
      attributions: [attr("f1", "D1"), attr("f2", "D2"), attr("f3", "D3"), attr("f4", "D4"), attr("fX")],
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
      findings: [finding("f1", "low"), finding("f2"), finding("f3"), finding("f4")],
      attributions: [attr("f1", "D1"), attr("f2", "D2"), attr("f3", "D3"), attr("f4", "D4")],
      thresholds: THRESHOLDS,
    });
    expect(r.detected_defect_ids).toContain("D1"); // still detected
    expect(r.severity_aligned_defect_ids).not.toContain("D1"); // but not aligned (low < material)
    expect(r.severity_alignment_rate).toBeCloseTo(3 / 4);
  });

  it("one finding may surface multiple seeded defects (attributed_defect_ids is a set)", () => {
    const r = scoreDefectSpectrum({
      seededDefects: DEFECTS,
      findings: [finding("f1"), finding("f2")],
      attributions: [attr("f1", "D1", "D2"), attr("f2", "D3", "D4")],
      thresholds: THRESHOLDS,
    });
    expect(r.detected_defect_ids).toEqual(["D1", "D2", "D3", "D4"]);
    expect(r.recall_overall).toBe(1);
    expect(r.attributed_findings).toBe(2);
    expect(r.precision).toBe(1);
  });

  it("is deterministic: identical inputs → identical result", () => {
    const call = () =>
      scoreDefectSpectrum({
        seededDefects: DEFECTS,
        findings: [finding("f1"), finding("fX")],
        attributions: [attr("f1", "D2"), attr("fX")],
        thresholds: THRESHOLDS,
      });
    expect(call()).toEqual(call());
  });

  it("guards: empty ground truth throws (vacuous-recall guard)", () => {
    expect(() =>
      scoreDefectSpectrum({ seededDefects: [], findings: [], attributions: [], thresholds: THRESHOLDS }),
    ).toThrow(/empty/);
  });

  it("guards: a surfaced finding with no attribution throws (no silent drop)", () => {
    expect(() =>
      scoreDefectSpectrum({
        seededDefects: DEFECTS,
        findings: [finding("f1"), finding("f2")],
        attributions: [attr("f1", "D1")], // f2 unanswered
        thresholds: THRESHOLDS,
      }),
    ).toThrow(/no attribution for surfaced finding f2/);
  });

  it("guards: attribution naming an unknown defect id throws (no recall inflation)", () => {
    expect(() =>
      scoreDefectSpectrum({
        seededDefects: DEFECTS,
        findings: [finding("f1")],
        attributions: [attr("f1", "D9")],
        thresholds: THRESHOLDS,
      }),
    ).toThrow(/unknown seeded defect 'D9'/);
  });

  it("guards: duplicate attribution for one finding throws", () => {
    expect(() =>
      scoreDefectSpectrum({
        seededDefects: DEFECTS,
        findings: [finding("f1")],
        attributions: [attr("f1", "D1"), attr("f1", "D2")],
        thresholds: THRESHOLDS,
      }),
    ).toThrow(/duplicate attribution for finding f1/);
  });
});

describe("attributeAndScore", () => {
  it("runs an injected judge then scores (parity with scoreDefectSpectrum on the same attributions)", async () => {
    const findings = [finding("f1"), finding("f2"), finding("fX")];
    const attributions = [attr("f1", "D1"), attr("f2", "D2", "D3"), attr("fX")];
    const judge: DefectAttributionJudge = () => attributions;

    const viaJudge = await attributeAndScore({
      seededDefects: DEFECTS,
      findings,
      judge,
      thresholds: THRESHOLDS,
    });
    const direct = scoreDefectSpectrum({ seededDefects: DEFECTS, findings, attributions, thresholds: THRESHOLDS });
    expect(viaJudge).toEqual(direct);
    expect(viaJudge.detected_defect_ids).toEqual(["D1", "D2", "D3"]);
    expect(viaJudge.fabricated_findings).toBe(1);
  });

  it("awaits an async judge (production LLM shape)", async () => {
    const judge: DefectAttributionJudge = async () => [attr("f1", "D1")];
    const r = await attributeAndScore({
      seededDefects: DEFECTS,
      findings: [finding("f1")],
      judge,
      thresholds: THRESHOLDS,
    });
    expect(r.recall_overall).toBe(0.25); // 1 of 4
  });
});

describe("isMaterialSeverity", () => {
  it("material band = blocker/high/medium; low/info are not", () => {
    expect(["blocker", "high", "medium"].every(isMaterialSeverity as never)).toBe(true);
    expect(isMaterialSeverity("low")).toBe(false);
    expect(isMaterialSeverity("info")).toBe(false);
  });
});
