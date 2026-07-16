import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  evaluatePrereg,
  parseEffortBenchPrereg,
  type CellObservation,
  type EffortBenchPrereg,
} from "./effort-bench-prereg.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(
  here,
  "..",
  "development-records",
  "benchmark",
  "effort-bench",
  "preregistration-template.yaml",
);

const loadTemplate = async (): Promise<EffortBenchPrereg> =>
  parseEffortBenchPrereg(parseYaml(await readFile(TEMPLATE_PATH, "utf8")));

describe("parseEffortBenchPrereg — the committed template stays valid", () => {
  it("parses the committed template (template ↔ validator cannot drift)", async () => {
    const manifest = await loadTemplate();
    expect(manifest.estimand).toBe("inline_budget_itt");
    expect(manifest.fail_closed).toBe(true);
    expect(manifest.contrasts.length).toBeGreaterThan(0);
    expect(manifest.cluster.min_reps_per_cell).toBeGreaterThanOrEqual(3);
  });
});

describe("parseEffortBenchPrereg — fail-loud validation", () => {
  const mutate = async (
    fn: (m: Record<string, unknown>) => void,
  ): Promise<() => EffortBenchPrereg> => {
    const raw = parseYaml(await readFile(TEMPLATE_PATH, "utf8")) as Record<string, unknown>;
    fn(raw);
    return () => parseEffortBenchPrereg(raw);
  };

  it("rejects fail_closed !== true", async () => {
    expect(await mutate((m) => (m.fail_closed = false))).toThrow(/fail_closed/);
  });

  it("rejects a relaxed R gate (min_reps_per_cell < 3)", async () => {
    expect(
      await mutate((m) => ((m.cluster as Record<string, unknown>).min_reps_per_cell = 2)),
    ).toThrow(/min_reps_per_cell/);
  });

  it("rejects a contrast referencing an unregistered zone or effort", async () => {
    expect(
      await mutate((m) => {
        (m.contrasts as Array<Record<string, unknown>>)[0]!.treatment_zone = "no-such-zone";
      }),
    ).toThrow(/not in coverage_levels/);
    expect(
      await mutate((m) => {
        (m.contrasts as Array<Record<string, unknown>>)[0]!.effort = "xhigh";
      }),
    ).toThrow(/not in efforts/);
  });

  it("rejects duplicate contrast ids and a zero effect size", async () => {
    expect(
      await mutate((m) => {
        const cs = m.contrasts as Array<Record<string, unknown>>;
        cs[1]!.id = cs[0]!.id;
      }),
    ).toThrow(/duplicate contrast id/);
    expect(
      await mutate((m) => {
        (m.contrasts as Array<Record<string, unknown>>)[0]!.min_effect_recall_points = 0;
      }),
    ).toThrow(/must be > 0/);
  });

  it("rejects a wrong estimand, aggregation, or schema version", async () => {
    expect(await mutate((m) => (m.estimand = "defect_visibility"))).toThrow(/estimand/);
    expect(await mutate((m) => (m.aggregation = "pooled_mean"))).toThrow(/aggregation/);
    expect(await mutate((m) => (m.schema_version = "effort-bench-prereg/0"))).toThrow(
      /schema_version/,
    );
  });

  it("requires the recovery predicate and declared analysis rules", async () => {
    expect(await mutate((m) => delete m.recovery)).toThrow(/recovery/);
    expect(await mutate((m) => delete m.analysis)).toThrow(/analysis/);
  });
});

describe("evaluatePrereg — fail-closed point-estimate screening (synthetic curves)", () => {
  const obs = (
    zone: string,
    fixture: string,
    recall: number,
    effort = "medium",
  ): CellObservation => ({ zone, effort, fixture, recall_material_mean: recall });

  // Synthetic world where coverage loss genuinely costs recall and restoring
  // coverage recovers it — the registered contrasts must read as met.
  const effectWorld = [
    obs("full", "fx-a", 1.0),
    obs("full", "fx-b", 1.0),
    obs("partial", "fx-a", 0.7),
    obs("partial", "fx-b", 0.75),
    obs("low", "fx-a", 0.5),
    obs("low", "fx-b", 0.55),
    obs("full-restored", "fx-a", 0.97),
    obs("full-restored", "fx-b", 1.0),
  ];

  it("reproduces the registered contrasts on a synthetic effect world", async () => {
    const manifest = await loadTemplate();
    const evaluation = evaluatePrereg(manifest, effectWorld);
    expect(evaluation.contrasts.map((c) => c.outcome)).toEqual(["met", "met"]);
    expect(evaluation.recovery.outcome).toBe("met");
    expect(evaluation.all_met).toBe(true);
    // effect arithmetic is exposed for the report
    const c1 = evaluation.contrasts[0]!;
    expect(c1.per_fixture.find((f) => f.fixture === "fx-a")!.effect).toBeCloseTo(0.3);
  });

  it("a flat (no-effect) world reads not_met — the bench can fail honestly", async () => {
    const manifest = await loadTemplate();
    const flat = [
      obs("full", "fx-a", 1.0),
      obs("full", "fx-b", 1.0),
      obs("partial", "fx-a", 0.95), // 0.05 < registered 0.15
      obs("partial", "fx-b", 1.0),
      obs("low", "fx-a", 0.9),
      obs("low", "fx-b", 0.95),
      obs("full-restored", "fx-a", 1.0),
      obs("full-restored", "fx-b", 1.0),
    ];
    const evaluation = evaluatePrereg(manifest, flat);
    expect(evaluation.contrasts[0]!.outcome).toBe("not_met");
    expect(evaluation.all_met).toBe(false);
  });

  it("missing cells make a predicate not_evaluable (fail-closed), never met", async () => {
    const manifest = await loadTemplate();
    const incomplete = [
      obs("full", "fx-a", 1.0),
      obs("partial", "fx-a", 0.6),
      // fx-b entirely missing → only 1 complete pair < min_fixtures_per_level=2
    ];
    const evaluation = evaluatePrereg(manifest, incomplete);
    expect(evaluation.contrasts[0]!.outcome).toBe("not_evaluable");
    expect(evaluation.contrasts[0]!.reason).toMatch(/fail-closed/);
    expect(evaluation.all_met).toBe(false);
  });

  it("one fixture meeting and one missing the effect → not_met (per_fixture_all)", async () => {
    const manifest = await loadTemplate();
    const mixed = [
      obs("full", "fx-a", 1.0),
      obs("full", "fx-b", 1.0),
      obs("partial", "fx-a", 0.7), // met
      obs("partial", "fx-b", 0.95), // not met
      obs("low", "fx-a", 0.5),
      obs("low", "fx-b", 0.5),
      obs("full-restored", "fx-a", 1.0),
      obs("full-restored", "fx-b", 1.0),
    ];
    const evaluation = evaluatePrereg(manifest, mixed);
    expect(evaluation.contrasts[0]!.outcome).toBe("not_met");
    expect(evaluation.contrasts[0]!.reason).toContain("fx-b");
  });

  it("recovery outside the registered band → not_met", async () => {
    const manifest = await loadTemplate();
    const drifted = effectWorld.map((o) =>
      o.zone === "full-restored" ? { ...o, recall_material_mean: 0.8 } : o,
    );
    const evaluation = evaluatePrereg(manifest, drifted);
    expect(evaluation.recovery.outcome).toBe("not_met");
    expect(evaluation.all_met).toBe(false);
  });

  it("rejects duplicate observations for one cell", async () => {
    const manifest = await loadTemplate();
    expect(() =>
      evaluatePrereg(manifest, [obs("full", "fx-a", 1.0), obs("full", "fx-a", 0.9)]),
    ).toThrow(/duplicate observation/);
  });
});
