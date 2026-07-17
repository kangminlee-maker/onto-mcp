import { describe, expect, it } from "vitest";
import {
  assessJudgeInvariance,
  classifyIssueSpecificity,
  drawJudgeInvarianceSample,
  type BlindSampleKeyEntry,
  type DualLabelRecord,
  type JudgeSampleIssue,
  type JudgeSampleSourceRun,
} from "./effort-bench-judge-invariance.ts";

const issue = (id: string, where: string[] = [], evidence: string[] = []): JudgeSampleIssue => ({
  issue_id: id,
  issue_statement: `statement ${id}`,
  where,
  evidence_refs: evidence,
});

/** A run with `n` issues of each stratum (anchored / partial / unanchored). */
const run = (
  zone: string,
  effort: string,
  fixture: string,
  rep: number,
  nPerStratum: number,
): JudgeSampleSourceRun => ({
  zone,
  effort,
  fixture,
  rep,
  issues: Array.from({ length: nPerStratum }, (_, i) => [
    issue(`${zone}-${effort}-${fixture}-${rep}-a${i}`, ["target.yaml"], ["ref"]),
    issue(`${zone}-${effort}-${fixture}-${rep}-p${i}`, ["target.yaml"], []),
    issue(`${zone}-${effort}-${fixture}-${rep}-u${i}`, [], []),
  ]).flat(),
});

describe("classifyIssueSpecificity — deterministic strata", () => {
  it("classifies by the two location-bearing fields", () => {
    expect(classifyIssueSpecificity(issue("i", ["t"], ["e"]))).toBe("anchored");
    expect(classifyIssueSpecificity(issue("i", ["t"], []))).toBe("partially_anchored");
    expect(classifyIssueSpecificity(issue("i", [], ["e"]))).toBe("partially_anchored");
    expect(classifyIssueSpecificity(issue("i", [], []))).toBe("unanchored");
  });
});

describe("drawJudgeInvarianceSample — balanced blind sample", () => {
  const runs: JudgeSampleSourceRun[] = [
    run("full", "medium", "fx-a", 1, 4),
    run("full", "medium", "fx-b", 1, 4),
    run("partial", "medium", "fx-a", 1, 4),
    run("partial", "medium", "fx-b", 1, 4),
    run("full", "high", "fx-a", 1, 4),
    run("partial", "high", "fx-a", 1, 4),
  ];

  it("fills every (zone, effort) cell to the exact quota with ample supply", () => {
    const sample = drawJudgeInvarianceSample(runs, { seed: 7, perCellQuota: 6 });
    expect(sample.balance).toHaveLength(4); // full/partial × medium/high
    for (const cell of sample.balance) {
      expect(cell.drawn).toBe(6);
      expect(cell.shortfall).toBe(0);
      // Round-robin across 3 non-empty strata: 6 = exactly 2 per stratum.
      expect(cell.per_stratum).toEqual({ anchored: 2, partially_anchored: 2, unanchored: 2 });
    }
    expect(sample.items).toHaveLength(24);
    expect(sample.key).toHaveLength(24);
  });

  it("blinds items (no arm fields) and keeps a consistent sealed key", () => {
    const sample = drawJudgeInvarianceSample(runs, { seed: 7, perCellQuota: 3 });
    const keyById = new Map(sample.key.map((k) => [k.blind_id, k]));
    expect(keyById.size).toBe(sample.items.length); // ids unique
    for (const item of sample.items) {
      expect(item).not.toHaveProperty("zone");
      expect(item).not.toHaveProperty("effort");
      expect(item).not.toHaveProperty("rep");
      expect(item).not.toHaveProperty("issue_id");
      const entry = keyById.get(item.blind_id)!;
      expect(entry.fixture).toBe(item.fixture);
      // The key resolves to a real source issue in the named run.
      const sourceRun = runs.find(
        (r) =>
          r.zone === entry.zone &&
          r.effort === entry.effort &&
          r.fixture === entry.fixture &&
          r.rep === entry.rep,
      )!;
      const sourceIssue = sourceRun.issues.find((i) => i.issue_id === entry.issue_id)!;
      expect(item.issue_statement).toBe(sourceIssue.issue_statement);
    }
  });

  it("records a shortfall instead of silently under-sampling", () => {
    const sample = drawJudgeInvarianceSample([run("low", "medium", "fx-a", 1, 1)], {
      seed: 1,
      perCellQuota: 10,
    });
    expect(sample.balance).toHaveLength(1);
    expect(sample.balance[0]!.drawn).toBe(3); // 1 per stratum available
    expect(sample.balance[0]!.shortfall).toBe(7);
  });

  it("is deterministic under the seed and varies across seeds", () => {
    const a = drawJudgeInvarianceSample(runs, { seed: 42, perCellQuota: 4 });
    const b = drawJudgeInvarianceSample(runs, { seed: 42, perCellQuota: 4 });
    const c = drawJudgeInvarianceSample(runs, { seed: 43, perCellQuota: 4 });
    expect(a).toEqual(b);
    expect(c.key.map((k) => k.issue_id)).not.toEqual(a.key.map((k) => k.issue_id));
  });

  it("fails loud on duplicate runs, duplicate issue ids, bad quota", () => {
    expect(() =>
      drawJudgeInvarianceSample([run("z", "e", "f", 1, 1), run("z", "e", "f", 1, 1)], {
        seed: 1,
        perCellQuota: 1,
      }),
    ).toThrow(/duplicate run/);
    expect(() =>
      drawJudgeInvarianceSample(
        [{ zone: "z", effort: "e", fixture: "f", rep: 1, issues: [issue("dup"), issue("dup")] }],
        { seed: 1, perCellQuota: 1 },
      ),
    ).toThrow(/duplicate issue_id/);
    expect(() => drawJudgeInvarianceSample(runs, { seed: 1, perCellQuota: 0 })).toThrow(
      /positive integer/,
    );
  });
});

describe("assessJudgeInvariance — fail-closed comparability verdict", () => {
  const keyFor = (
    cells: Array<[zone: string, effort: string, count: number]>,
  ): BlindSampleKeyEntry[] =>
    cells.flatMap(([zone, effort, count]) =>
      Array.from({ length: count }, (_, i) => ({
        blind_id: `${zone}-${effort}-${i}`,
        zone,
        effort,
        fixture: "fx",
        rep: 1,
        issue_id: `i-${i}`,
      })),
    );

  const labelsFor = (
    key: BlindSampleKeyEntry[],
    rates: Record<string, { miss: number; falseAttr: number; posShare: number }>,
  ): DualLabelRecord[] =>
    key.map((entry, i) => {
      const r = rates[`${entry.zone} ${entry.effort}`]!;
      const cellIndex = Number(entry.blind_id.split("-").pop());
      const cellSize = key.filter((k) => k.zone === entry.zone && k.effort === entry.effort).length;
      const posCount = Math.round(cellSize * r.posShare);
      const gold = cellIndex < posCount;
      void i;
      return {
        blind_id: entry.blind_id,
        gold_attributed: gold,
        judge_attributed: gold
          ? cellIndex >= Math.round(posCount * r.miss) // first misses, rest hits
          : cellIndex - posCount < Math.round((cellSize - posCount) * r.falseAttr),
      };
    });

  it("comparable when per-cell rates sit within registered tolerances", () => {
    const key = keyFor([
      ["full", "medium", 10],
      ["partial", "medium", 10],
    ]);
    // Identical rates in both cells: FNR 0.2 (1 of 5 pos missed), FPR 0.
    const labels = labelsFor(key, {
      "full medium": { miss: 0.2, falseAttr: 0, posShare: 0.5 },
      "partial medium": { miss: 0.2, falseAttr: 0, posShare: 0.5 },
    });
    const verdict = assessJudgeInvariance(key, labels, {
      maxFnrGap: 0.1,
      maxFprGap: 0.1,
      minPerCell: 5,
    });
    expect(verdict.outcome).toBe("comparable");
    expect(verdict.max_fnr_gap).toBe(0);
    expect(verdict.cells.every((c) => c.n === 10)).toBe(true);
  });

  it("not_comparable when the FNR gap exceeds tolerance", () => {
    const key = keyFor([
      ["full", "medium", 10],
      ["partial", "medium", 10],
    ]);
    const labels = labelsFor(key, {
      "full medium": { miss: 0, falseAttr: 0, posShare: 0.5 },
      "partial medium": { miss: 0.6, falseAttr: 0, posShare: 0.5 },
    });
    const verdict = assessJudgeInvariance(key, labels, {
      maxFnrGap: 0.2,
      maxFprGap: 0.2,
      minPerCell: 5,
    });
    expect(verdict.outcome).toBe("not_comparable");
    expect(verdict.max_fnr_gap!).toBeGreaterThan(0.2);
    expect(verdict.reason).toMatch(/must not be promoted/);
  });

  it("not_evaluable on undefined rates or thin cells — never a pass", () => {
    const key = keyFor([
      ["full", "medium", 6],
      ["partial", "medium", 6],
    ]);
    // partial cell all gold-positive → gold_negative = 0 → FPR undefined.
    const labels: DualLabelRecord[] = key.map((entry) => ({
      blind_id: entry.blind_id,
      gold_attributed: entry.zone === "partial" ? true : Number(entry.blind_id.split("-").pop()) < 3,
      judge_attributed: true,
    }));
    const verdict = assessJudgeInvariance(key, labels, {
      maxFnrGap: 0.5,
      maxFprGap: 0.5,
      minPerCell: 3,
    });
    expect(verdict.outcome).toBe("not_evaluable");
    expect(verdict.reason).toMatch(/undefined FNR\/FPR|below minPerCell/);

    const thin = assessJudgeInvariance(key, labels.slice(0, 2), {
      maxFnrGap: 0.5,
      maxFprGap: 0.5,
      minPerCell: 3,
    });
    expect(thin.outcome).toBe("not_evaluable");
  });

  it("fails loud on unknown or duplicate blind ids and bad options", () => {
    const key = keyFor([["full", "medium", 2]]);
    const good: DualLabelRecord = {
      blind_id: key[0]!.blind_id,
      gold_attributed: true,
      judge_attributed: true,
    };
    expect(() =>
      assessJudgeInvariance(key, [{ ...good, blind_id: "ghost" }], {
        maxFnrGap: 0.1,
        maxFprGap: 0.1,
        minPerCell: 1,
      }),
    ).toThrow(/unknown blind_id/);
    expect(() =>
      assessJudgeInvariance(key, [good, good], { maxFnrGap: 0.1, maxFprGap: 0.1, minPerCell: 1 }),
    ).toThrow(/duplicate label/);
    expect(() =>
      assessJudgeInvariance(key, [good], { maxFnrGap: 2, maxFprGap: 0.1, minPerCell: 1 }),
    ).toThrow(/\[0,1\]/);
  });
});
