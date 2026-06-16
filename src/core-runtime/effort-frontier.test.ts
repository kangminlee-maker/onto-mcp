import { describe, expect, it } from "vitest";
import {
  classifyEffortCalibration,
  classifyStageFrontier,
  type EffortSample,
} from "./effort-frontier.js";

// Ascending-effort sample builder. quality is the pipeline-defined metric.
const s = (
  effort: string,
  quality: number,
  gatePassRate = 1,
  qualityStdev = 0,
  runs = 3,
): EffortSample => ({ effort, quality, gatePassRate, qualityStdev, runs });

const T = { plateauThreshold: 0.05 };

describe("classifyStageFrontier", () => {
  it("finds the knee on a monotone-improving curve", () => {
    const f = classifyStageFrontier(
      "lens",
      [
        s("low", 0.5),
        s("medium", 0.8),
        s("high", 0.9),
        s("xhigh", 0.91),
        s("max", 0.92),
      ],
      T,
    );
    expect(f.minViableEffort).toBe("low");
    expect(f.effectiveMaxEffort).toBe("high");
    expect(f.recommendedEffort).toBe("high");
    expect(f.plateauReached).toBe(true);
    expect(f.curve).toHaveLength(5);
  });

  it("plateaus immediately when quality is flat across all efforts", () => {
    const f = classifyStageFrontier(
      "lens",
      [s("low", 0.9), s("medium", 0.9), s("high", 0.9), s("max", 0.9)],
      T,
    );
    expect(f.minViableEffort).toBe("low");
    expect(f.effectiveMaxEffort).toBe("low");
    expect(f.plateauReached).toBe(true);
  });

  it("reports no plateau when quality is still climbing at the ceiling", () => {
    const f = classifyStageFrontier(
      "lens",
      [
        s("low", 0.3),
        s("medium", 0.5),
        s("high", 0.7),
        s("xhigh", 0.9),
        s("max", 1.0),
      ],
      T,
    );
    expect(f.minViableEffort).toBe("low");
    expect(f.effectiveMaxEffort).toBe("max");
    expect(f.plateauReached).toBe(false);
    expect(f.rationale).toMatch(/still climbing/);
  });

  it("is robust to non-monotonic noise (checks all higher efforts, not just adjacent)", () => {
    // medium is the knee: high dips, xhigh bumps +0.05 (within plateau), max settles.
    const f = classifyStageFrontier(
      "answer_support_judgment",
      [
        s("low", 0.5),
        s("medium", 0.85),
        s("high", 0.82),
        s("xhigh", 0.9),
        s("max", 0.88),
      ],
      { plateauThreshold: 0.1 },
    );
    expect(f.minViableEffort).toBe("low");
    expect(f.effectiveMaxEffort).toBe("medium");
    expect(f.plateauReached).toBe(true);
  });

  it("skips a gate-failing low effort for min viable", () => {
    const f = classifyStageFrontier(
      "ontology_seed",
      [
        s("low", 0.4, 0), // gate fails
        s("medium", 0.7),
        s("high", 0.85),
        s("xhigh", 0.86),
      ],
      T,
    );
    expect(f.minViableEffort).toBe("medium");
    expect(f.effectiveMaxEffort).toBe("high");
    // gate-failing efforts still appear in the curve for transparency.
    expect(f.curve.map((c) => c.effort)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("returns nulls when the gate never passes at any effort", () => {
    const f = classifyStageFrontier(
      "ontology_seed",
      [s("low", 0.2, 0), s("high", 0.3, 0)],
      T,
    );
    expect(f.minViableEffort).toBeNull();
    expect(f.effectiveMaxEffort).toBeNull();
    expect(f.recommendedEffort).toBeNull();
    expect(f.rationale).toMatch(/never reaches passQuorum/);
  });

  it("excludes higher efforts that drop below the gate quorum", () => {
    // Overthinking at high makes the gate fail — only medium is viable.
    const f = classifyStageFrontier(
      "stop_decision",
      [s("low", 0.4, 0), s("medium", 0.8, 1), s("high", 0.85, 0)],
      T,
    );
    expect(f.minViableEffort).toBe("medium");
    expect(f.effectiveMaxEffort).toBe("medium");
    expect(f.plateauReached).toBe(false);
    expect(f.rationale).toMatch(/only "medium" is viable/);
  });

  it("honors passQuorum for flaky gates", () => {
    const samples = [s("low", 0.6, 1), s("medium", 0.9, 0.67)];
    // Strict quorum (all runs) → flaky medium is not viable.
    const strict = classifyStageFrontier("lens", samples, {
      plateauThreshold: 0.05,
      passQuorum: 1,
    });
    expect(strict.minViableEffort).toBe("low");
    expect(strict.effectiveMaxEffort).toBe("low");
    // Relaxed quorum → medium counts, and its quality gain moves the frontier.
    const relaxed = classifyStageFrontier("lens", samples, {
      plateauThreshold: 0.05,
      passQuorum: 0.6,
    });
    expect(relaxed.minViableEffort).toBe("low");
    expect(relaxed.effectiveMaxEffort).toBe("medium");
  });

  it("handles an empty sample series", () => {
    const f = classifyStageFrontier("lens", [], T);
    expect(f.minViableEffort).toBeNull();
    expect(f.effectiveMaxEffort).toBeNull();
    expect(f.curve).toEqual([]);
    expect(f.rationale).toBe("no samples provided");
  });

  it("carries cost summaries through the curve without affecting the decision", () => {
    const f = classifyStageFrontier(
      "lens",
      [
        { ...s("low", 0.9), cost: { providerTokens: 100, durationMs: 1000 } },
        { ...s("high", 0.9), cost: { providerTokens: 500, durationMs: 4000 } },
      ],
      T,
    );
    expect(f.effectiveMaxEffort).toBe("low");
    expect(f.curve[0]?.cost?.providerTokens).toBe(100);
    expect(f.curve[1]?.cost?.durationMs).toBe(4000);
  });

  it("preserves the run count on each curve point", () => {
    const f = classifyStageFrontier("lens", [s("low", 0.9, 1, 0.02, 5)], T);
    expect(f.curve[0]?.runs).toBe(5);
    expect(f.curve[0]?.qualityStdev).toBe(0.02);
  });

  it("treats an at-threshold quality gain as a plateau (epsilon-safe float compare)", () => {
    // 0.90 - 0.85 === 0.050000000000000044 in JS; a strict `> 0.05` would wrongly
    // promote "high". The contract treats gains at or below the threshold as plateau.
    const f = classifyStageFrontier("lens", [s("low", 0.85), s("high", 0.9)], {
      plateauThreshold: 0.05,
    });
    expect(f.effectiveMaxEffort).toBe("low");
    expect(f.plateauReached).toBe(true);
  });
});

describe("classifyEffortCalibration", () => {
  it("assembles a per-model report across stages", () => {
    const report = classifyEffortCalibration({
      pipeline: "reconstruct",
      provider: "anthropic",
      model: "claude-opus-4-8",
      route: "anthropic/sdk",
      thresholds: { plateauThreshold: 0.05 },
      stages: [
        {
          stage: "ontology_seed",
          samples: [s("low", 0.6), s("medium", 0.9), s("high", 0.91)],
        },
        {
          stage: "answer_support_judgment",
          samples: [s("low", 0.5, 0), s("high", 0.88)],
        },
      ],
    });
    expect(report.model).toBe("claude-opus-4-8");
    expect(report.route).toBe("anthropic/sdk");
    expect(report.stages).toHaveLength(2);
    expect(report.stages[0]?.effectiveMaxEffort).toBe("medium");
    expect(report.stages[1]?.minViableEffort).toBe("high");
  });

  it("persists the effective passQuorum (resolves the default) in the report", () => {
    const report = classifyEffortCalibration({
      pipeline: "review",
      provider: "openai",
      model: "gpt-5.5",
      route: "openai/responses",
      thresholds: { plateauThreshold: 0.05 }, // passQuorum omitted
      stages: [{ stage: "lens", samples: [s("low", 0.9)] }],
    });
    expect(report.thresholds.passQuorum).toBe(1);
    expect(report.thresholds.plateauThreshold).toBe(0.05);
  });
});
