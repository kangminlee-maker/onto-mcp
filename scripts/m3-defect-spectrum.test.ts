import { describe, it, expect } from "vitest";
import {
  scoreDefectSpectrum,
  attributeAndScore,
  parseSeededDefects,
  parseSurfacedIssues,
  parseCanaryDefectIds,
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
  return { issue_id: id, issue_statement: `statement ${id}`, severity, where: [`loc-${id}`], evidence_refs: [`ref-${id}`] };
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

  it("FALSIFIABLE boundary: full material recall with precision exactly at the exceed cut (0.9) → exceeds", () => {
    // 9 attributed material issues + 1 fabrication → precision 0.9 == exceed_precision.
    // Pins classifyBand's `>=` (a `>` mutation would drop this to "meets").
    const issues = Array.from({ length: 10 }, (_, i) => issue(`i${i}`));
    const attributions = [
      attr("i0", "D1"), attr("i1", "D2"), attr("i2", "D3"), attr("i3", "D4"),
      attr("i4", "D1"), attr("i5", "D2"), attr("i6", "D3"), attr("i7", "D4"), attr("i8", "D1"),
      attr("i9"), // fabrication → 9/10 = 0.9
    ];
    const r = scoreDefectSpectrum({ seededDefects: DEFECTS, issues, attributions, thresholds: THRESHOLDS });
    expect(r.recall_material).toBe(1);
    expect(r.precision).toBeCloseTo(0.9);
    expect(r.band).toBe("exceeds");
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

  it("guards: seeded set with zero `material`-expectation defects throws (vacuous material recall)", () => {
    // All medium_or_above → materialDefectIds empty → material recall would be a
    // vacuous 1.0 and buy a meets/exceeds on precision alone. Must fail loud.
    const allMedium: SeededDefect[] = [
      { id: "M1", kind: "k", where: "w", description: "d", severity_expectation: "medium_or_above" },
      { id: "M2", kind: "k", where: "w", description: "d", severity_expectation: "medium_or_above" },
    ];
    expect(() =>
      scoreDefectSpectrum({ seededDefects: allMedium, issues: [], attributions: [], thresholds: THRESHOLDS }),
    ).toThrow(/no .material.-expectation seeded defects/);
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

describe("parseCanaryDefectIds", () => {
  it("returns [] when the field is absent (canary check no-ops)", () => {
    expect(parseCanaryDefectIds({ fixture: "x" }, DEFECTS)).toEqual([]);
  });

  it("returns the ids when each names a real seeded defect", () => {
    expect(parseCanaryDefectIds({ canary_defect_ids: ["D1", "D3"] }, DEFECTS)).toEqual(["D1", "D3"]);
  });

  it("throws on a canary id that is not a seeded defect (no dangling canary)", () => {
    expect(() => parseCanaryDefectIds({ canary_defect_ids: ["D1", "NOPE"] }, DEFECTS)).toThrow(
      /canary_defect_ids names unknown seeded defect 'NOPE'/,
    );
  });

  it("throws on a duplicate canary id and on a non-array value", () => {
    expect(() => parseCanaryDefectIds({ canary_defect_ids: ["D1", "D1"] }, DEFECTS)).toThrow(/duplicate canary_defect_id 'D1'/);
    expect(() => parseCanaryDefectIds({ canary_defect_ids: "D1" }, DEFECTS)).toThrow(/canary_defect_ids must be a string array/);
  });
});

describe("parseSurfacedIssues", () => {
  const findingLedger = {
    findings: [
      { finding_id: "f1", severity: "high", target: "T1" },
      { finding_id: "f2", severity: "medium", target: "T2" },
      { finding_id: "f3", severity: "low", target: "T3" }, // non-material
      { finding_id: "f4", severity: "blocker", target: "T4" },
    ],
  };

  it("derives issue severity from the MAX severity of its surface_finding_ids", () => {
    const issues = parseSurfacedIssues(
      { issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["f2", "f1"], evidence_refs: ["e1"] }] },
      findingLedger,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high"); // max(medium, high) = high
  });

  it("carries the location signal: distinct finding targets → where, issue evidence_refs preserved (design §11 item 2)", () => {
    const issues = parseSurfacedIssues(
      {
        issues: [
          // f2 and f1 have distinct targets T2/T1 → both in `where`, insertion order.
          { issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["f2", "f1"], evidence_refs: ["m.md:1-2", "crit:x"] },
        ],
      },
      findingLedger,
    );
    expect(issues[0].where).toEqual(["T2", "T1"]);
    expect(issues[0].evidence_refs).toEqual(["m.md:1-2", "crit:x"]);
  });

  it("dedups repeated finding targets in where (two findings, one shared target → one entry)", () => {
    const shared = { findings: [{ finding_id: "g1", severity: "high", target: "SAME" }, { finding_id: "g2", severity: "medium", target: "SAME" }] };
    const issues = parseSurfacedIssues(
      { issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["g1", "g2"], evidence_refs: [] }] },
      shared,
    );
    expect(issues[0].where).toEqual(["SAME"]);
  });

  it("throws when a finding lacks a target (location signal is required)", () => {
    expect(() =>
      parseSurfacedIssues(
        { issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["h1"], evidence_refs: [] }] },
        { findings: [{ finding_id: "h1", severity: "high" }] }, // no target
      ),
    ).toThrow(/findings\[0\]\.target must be a non-empty string/);
  });

  it("throws when an issue's evidence_refs is not a string array", () => {
    expect(() =>
      parseSurfacedIssues(
        { issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["f1"], evidence_refs: "not-a-list" }] },
        findingLedger,
      ),
    ).toThrow(/evidence_refs must be a string array/);
  });

  it("takes the running MAX regardless of finding order (descending: high then low → high)", () => {
    // Guards moreSevere accumulation: a `return latest` mutation would yield low
    // here (→ non-material → dropped), so the kept high issue kills it.
    const issues = parseSurfacedIssues(
      { issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["f1", "f3"], evidence_refs: [] }] },
      findingLedger,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high"); // max(high, low) = high
  });

  it("keeps a medium-max issue (the material keep-side boundary)", () => {
    const issues = parseSurfacedIssues(
      { issues: [{ issue_id: "iss-m", issue_statement: "s", surface_finding_ids: ["f2"], evidence_refs: [] }] },
      findingLedger,
    );
    expect(issues.map((i) => i.issue_id)).toEqual(["iss-m"]);
    expect(issues[0].severity).toBe("medium"); // medium is retained (bottom of the material band)
  });

  it("drops a non-material issue (all its surface findings low/info)", () => {
    const issues = parseSurfacedIssues(
      {
        issues: [
          { issue_id: "iss-mat", issue_statement: "s", surface_finding_ids: ["f4"], evidence_refs: [] }, // blocker
          { issue_id: "iss-low", issue_statement: "s", surface_finding_ids: ["f3"], evidence_refs: [] }, // low → dropped
        ],
      },
      findingLedger,
    );
    expect(issues.map((i) => i.issue_id)).toEqual(["iss-mat"]);
    expect(issues[0].severity).toBe("blocker");
  });

  it("throws when an issue has no surface_finding_ids", () => {
    expect(() =>
      parseSurfacedIssues({ issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: [], evidence_refs: [] }] }, findingLedger),
    ).toThrow(/no surface_finding_ids/);
  });

  it("throws on a dangling surface_finding_id (reference integrity — no silent skip)", () => {
    // Fully dangling.
    expect(() =>
      parseSurfacedIssues(
        { issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["nope"], evidence_refs: [] }] },
        findingLedger,
      ),
    ).toThrow(/surface finding 'nope' absent from the finding-ledger/);
    // MIXED resolvable + dangling: the dangling id must still throw (it previously
    // was silently skipped, under-deriving severity and risking a dropped issue).
    expect(() =>
      parseSurfacedIssues(
        { issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["f1", "gone"], evidence_refs: [] }] },
        findingLedger,
      ),
    ).toThrow(/surface finding 'gone' absent from the finding-ledger/);
  });

  it("throws on a duplicate finding_id in the finding-ledger (symmetry with issue/seeded dup guards)", () => {
    expect(() =>
      parseSurfacedIssues(
        { issues: [{ issue_id: "iss-1", issue_statement: "s", surface_finding_ids: ["f1"], evidence_refs: [] }] },
        { findings: [{ finding_id: "f1", severity: "high", target: "T" }, { finding_id: "f1", severity: "low", target: "T" }] },
      ),
    ).toThrow(/duplicate finding id 'f1'/);
  });

  it("parses the real clinical-lab evidence issue-ledger + finding-ledger (material issues, cardinality > 0)", async () => {
    const fs = await import("node:fs/promises");
    const YAML = (await import("yaml")).default;
    const base = "development-records/benchmark/fixtures/ontology/clinical-lab-workflow/evidence/20260610-5fbe917f";
    const issueLedger = YAML.parse(await fs.readFile(`${base}/issue-ledger.yaml`, "utf8"));
    const findingLedger = YAML.parse(await fs.readFile(`${base}/finding-ledger.yaml`, "utf8"));
    const issues = parseSurfacedIssues(issueLedger, findingLedger);
    expect(issues.length).toBeGreaterThan(0); // non-vacuous: real evidence yields material issues
    // Exact count pin: a mutation dropping the `medium` keep (this session is 4
    // high + 8 medium) would silently shrink the scored set — the count catches it
    // where `every(isMaterial)` (which stays true on the survivors) cannot.
    expect(issues.length).toBe(12);
    expect(issues.filter((i) => i.severity === "medium")).toHaveLength(8);
    expect(issues.every((i) => isMaterialSeverity(i.severity))).toBe(true);
    expect(new Set(issues.map((i) => i.issue_id)).size).toBe(issues.length); // unique
    // Location signal populated from real evidence (design §11 item 2): every
    // material issue carries ≥1 finding target and its issue-ledger evidence_refs.
    expect(issues.every((i) => i.where.length > 0)).toBe(true);
    expect(issues.every((i) => i.evidence_refs.length > 0)).toBe(true);
  });
});
