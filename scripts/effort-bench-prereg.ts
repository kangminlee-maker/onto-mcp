/**
 * Effort-bench pre-registration manifest — parser/validator + fail-closed
 * contrast evaluator (adaptive-effort design §4-1, finding R2-1).
 *
 * The manifest freezes the bench's estimand, gate thresholds, cluster/power
 * structure, registered contrasts (absolute recall-point effects), the
 * recovery predicate, and the declared analysis rules BEFORE any pilot runs —
 * the git commit of the filled manifest is the freeze. This module owns:
 *   1. `parseEffortBenchPrereg` — fail-loud structural validation (never
 *      repairs; a manifest that fails here cannot register a bench), and
 *   2. `evaluatePrereg` — the fail-closed point-estimate evaluation of the
 *      REGISTERED contrasts against per-cell observations. "met" requires
 *      every fixture with a complete observation pair to individually show
 *      the registered effect (aggregation=per_fixture_all, the only /1 mode)
 *      AND at least `min_fixtures_per_level` complete pairs; anything less is
 *      "not_evaluable" — never a pass. The full CI / multiplicity analysis is
 *      the P1 analyzer's job; its rules are declared here so they freeze with
 *      the contrasts.
 *
 * Pure — no I/O. The bench harness reads the YAML and feeds observations.
 * Template: development-records/benchmark/effort-bench/preregistration-template.yaml
 * (the test suite parses the committed template, so template and validator
 * cannot drift silently).
 */

export const EFFORT_BENCH_PREREG_SCHEMA_VERSION = "effort-bench-prereg/1";

export interface PreregContrast {
  id: string;
  metric: "recall_material";
  effort: string;
  baseline_zone: string;
  treatment_zone: string;
  direction: "decrease";
  min_effect_recall_points: number;
}

export interface PreregRecovery {
  baseline_zone: string;
  /** Extra arm label (need not be a coverage level — it is its own treatment). */
  restored_zone: string;
  effort: string;
  within_recall_points: number;
}

export interface EffortBenchPrereg {
  schema_version: typeof EFFORT_BENCH_PREREG_SCHEMA_VERSION;
  estimand: "inline_budget_itt";
  gate: { recall_cut: number; precision_floor: number };
  coverage_levels: string[];
  efforts: string[];
  cluster: {
    min_reps_per_cell: number;
    min_fixtures_per_level: number;
    judge_runs: number;
  };
  analysis: { ci: string; multiplicity: string };
  aggregation: "per_fixture_all";
  contrasts: PreregContrast[];
  recovery: PreregRecovery;
  fail_closed: true;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function fail(msg: string): never {
  throw new Error(`effort-bench-prereg: ${msg}`);
}

const requireUnit = (v: unknown, label: string, opts?: { positive?: boolean }): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
    fail(`${label} must be a number in [0,1], got ${JSON.stringify(v)}`);
  }
  if (opts?.positive && (v as number) <= 0) {
    fail(`${label} must be > 0, got ${v}`);
  }
  return v as number;
};

const requireStringList = (v: unknown, label: string): string[] => {
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== "string" || x.length === 0)) {
    fail(`${label} must be a non-empty list of non-empty strings`);
  }
  const list = v as string[];
  if (new Set(list).size !== list.length) fail(`${label} entries must be unique`);
  return list;
};

const requirePositiveInt = (v: unknown, label: string, min: number): number => {
  if (!Number.isInteger(v) || (v as number) < min) {
    fail(`${label} must be an integer >= ${min}, got ${JSON.stringify(v)}`);
  }
  return v as number;
};

/** Parse + validate a pre-registration manifest. Fail-loud; never repairs. */
export function parseEffortBenchPrereg(value: unknown): EffortBenchPrereg {
  if (!isRecord(value)) fail(`manifest must be an object`);
  const v = value as Record<string, unknown>;
  if (v.schema_version !== EFFORT_BENCH_PREREG_SCHEMA_VERSION) {
    fail(
      `unsupported schema_version ${JSON.stringify(v.schema_version)} (expected ${EFFORT_BENCH_PREREG_SCHEMA_VERSION})`,
    );
  }
  if (v.estimand !== "inline_budget_itt") {
    fail(
      `estimand must be "inline_budget_itt" (the /1 bench measures the default embed policy's ITT effect; finding R2-2), got ${JSON.stringify(v.estimand)}`,
    );
  }
  if (!isRecord(v.gate)) fail("gate must be an object");
  const gate = {
    recall_cut: requireUnit(v.gate.recall_cut, "gate.recall_cut"),
    precision_floor: requireUnit(v.gate.precision_floor, "gate.precision_floor"),
  };
  const coverageLevels = requireStringList(v.coverage_levels, "coverage_levels");
  const efforts = requireStringList(v.efforts, "efforts");
  if (!isRecord(v.cluster)) fail("cluster must be an object");
  const cluster = {
    // The design's own bench gate (§4-3): a manifest may tighten but never
    // relax R>=3 / fixtures>=2 (INV-BENCH-1).
    min_reps_per_cell: requirePositiveInt(v.cluster.min_reps_per_cell, "cluster.min_reps_per_cell", 3),
    min_fixtures_per_level: requirePositiveInt(
      v.cluster.min_fixtures_per_level,
      "cluster.min_fixtures_per_level",
      2,
    ),
    judge_runs: requirePositiveInt(v.cluster.judge_runs, "cluster.judge_runs", 1),
  };
  if (!isRecord(v.analysis)) fail("analysis must be an object (declared CI/multiplicity rules)");
  const analysis = {
    ci: requireStringList([v.analysis.ci], "analysis.ci")[0]!,
    multiplicity: requireStringList([v.analysis.multiplicity], "analysis.multiplicity")[0]!,
  };
  if (v.aggregation !== "per_fixture_all") {
    fail(`aggregation must be "per_fixture_all" (the only /1 mode), got ${JSON.stringify(v.aggregation)}`);
  }
  const contrastsRaw: unknown = v.contrasts;
  if (!Array.isArray(contrastsRaw) || contrastsRaw.length === 0) {
    fail("contrasts must be a non-empty list");
  }
  const ids = new Set<string>();
  const contrasts: PreregContrast[] = contrastsRaw.map((c: unknown, i: number) => {
    if (!isRecord(c)) fail(`contrasts[${i}] must be an object`);
    const cc = c as Record<string, unknown>;
    const id = requireStringList([cc.id], `contrasts[${i}].id`)[0]!;
    if (ids.has(id)) fail(`duplicate contrast id ${id}`);
    ids.add(id);
    if (cc.metric !== "recall_material") fail(`contrast ${id}: metric must be "recall_material"`);
    if (cc.direction !== "decrease") fail(`contrast ${id}: direction must be "decrease"`);
    const effort = requireStringList([cc.effort], `contrast ${id}.effort`)[0]!;
    if (!efforts.includes(effort)) fail(`contrast ${id}: effort ${effort} not in efforts`);
    const baseline = requireStringList([cc.baseline_zone], `contrast ${id}.baseline_zone`)[0]!;
    const treatment = requireStringList([cc.treatment_zone], `contrast ${id}.treatment_zone`)[0]!;
    if (!coverageLevels.includes(baseline)) fail(`contrast ${id}: baseline_zone ${baseline} not in coverage_levels`);
    if (!coverageLevels.includes(treatment)) fail(`contrast ${id}: treatment_zone ${treatment} not in coverage_levels`);
    if (baseline === treatment) fail(`contrast ${id}: baseline and treatment zones must differ`);
    const minEffect = requireUnit(cc.min_effect_recall_points, `contrast ${id}.min_effect_recall_points`, {
      positive: true,
    });
    return {
      id,
      metric: "recall_material",
      effort,
      baseline_zone: baseline,
      treatment_zone: treatment,
      direction: "decrease",
      min_effect_recall_points: minEffect,
    };
  });
  if (!isRecord(v.recovery)) fail("recovery must be an object (design §4-1 ⑤)");
  const rec = v.recovery as Record<string, unknown>;
  const recBaseline = requireStringList([rec.baseline_zone], "recovery.baseline_zone")[0]!;
  if (!coverageLevels.includes(recBaseline)) fail(`recovery.baseline_zone ${recBaseline} not in coverage_levels`);
  const recovery: PreregRecovery = {
    baseline_zone: recBaseline,
    restored_zone: requireStringList([rec.restored_zone], "recovery.restored_zone")[0]!,
    effort: requireStringList([rec.effort], "recovery.effort")[0]!,
    within_recall_points: requireUnit(rec.within_recall_points, "recovery.within_recall_points", {
      positive: true,
    }),
  };
  if (!efforts.includes(recovery.effort)) fail(`recovery.effort ${recovery.effort} not in efforts`);
  if (v.fail_closed !== true) {
    fail("fail_closed must be literally true — the bench never reinterprets an unmet predicate");
  }
  return {
    schema_version: EFFORT_BENCH_PREREG_SCHEMA_VERSION,
    estimand: "inline_budget_itt",
    gate,
    coverage_levels: coverageLevels,
    efforts,
    cluster,
    analysis,
    aggregation: "per_fixture_all",
    contrasts,
    recovery,
    fail_closed: true,
  };
}

// ── fail-closed evaluation ──

/** One per-cell observation: the review-level mean over the cell's R reps. */
export interface CellObservation {
  zone: string;
  effort: string;
  fixture: string;
  recall_material_mean: number;
}

export type PredicateOutcome = "met" | "not_met" | "not_evaluable";

export interface FixtureEffect {
  fixture: string;
  baseline: number;
  treatment: number;
  /** baseline - treatment (direction=decrease: positive = recall dropped). */
  effect: number;
  met: boolean;
}

export interface PredicateVerdict {
  id: string;
  outcome: PredicateOutcome;
  per_fixture: FixtureEffect[];
  reason: string;
}

export interface PreregEvaluation {
  contrasts: PredicateVerdict[];
  recovery: PredicateVerdict;
  /** True only when EVERY registered contrast and the recovery predicate are met. */
  all_met: boolean;
}

const indexObservations = (
  observations: CellObservation[],
): Map<string, number> => {
  const byKey = new Map<string, number>();
  for (const o of observations) {
    requireUnit(o.recall_material_mean, `observation ${o.zone}/${o.effort}/${o.fixture} recall_material_mean`);
    const key = `${o.zone} ${o.effort} ${o.fixture}`;
    if (byKey.has(key)) {
      fail(`duplicate observation for (zone=${o.zone}, effort=${o.effort}, fixture=${o.fixture}) — feed one row per cell`);
    }
    byKey.set(key, o.recall_material_mean);
  }
  return byKey;
};

const evaluatePair = (
  id: string,
  byKey: Map<string, number>,
  fixtures: string[],
  baselineZone: string,
  treatmentZone: string,
  effort: string,
  minFixtures: number,
  met: (baseline: number, treatment: number) => boolean,
): PredicateVerdict => {
  const perFixture: FixtureEffect[] = [];
  for (const fixture of fixtures) {
    const baseline = byKey.get(`${baselineZone} ${effort} ${fixture}`);
    const treatment = byKey.get(`${treatmentZone} ${effort} ${fixture}`);
    if (baseline === undefined || treatment === undefined) continue; // incomplete pair
    perFixture.push({
      fixture,
      baseline,
      treatment,
      effect: baseline - treatment,
      met: met(baseline, treatment),
    });
  }
  if (perFixture.length < minFixtures) {
    return {
      id,
      outcome: "not_evaluable",
      per_fixture: perFixture,
      reason: `complete (${baselineZone} vs ${treatmentZone}) pairs at effort=${effort}: ${perFixture.length} < ${minFixtures} required fixtures — fail-closed`,
    };
  }
  const unmet = perFixture.filter((f) => !f.met);
  if (unmet.length > 0) {
    return {
      id,
      outcome: "not_met",
      per_fixture: perFixture,
      reason: `fixtures not showing the registered effect: ${unmet.map((f) => f.fixture).join(", ")}`,
    };
  }
  return {
    id,
    outcome: "met",
    per_fixture: perFixture,
    reason: `all ${perFixture.length} complete fixture pairs meet the registered predicate`,
  };
};

/**
 * Evaluate every REGISTERED contrast + the recovery predicate (point-estimate
 * screening; the P1 analyzer owns CI/multiplicity per the declared rules).
 */
export function evaluatePrereg(
  manifest: EffortBenchPrereg,
  observations: CellObservation[],
): PreregEvaluation {
  const byKey = indexObservations(observations);
  const fixtures = [...new Set(observations.map((o) => o.fixture))].sort();

  const contrasts = manifest.contrasts.map((c) =>
    evaluatePair(
      c.id,
      byKey,
      fixtures,
      c.baseline_zone,
      c.treatment_zone,
      c.effort,
      manifest.cluster.min_fixtures_per_level,
      (baseline, treatment) => baseline - treatment >= c.min_effect_recall_points,
    ),
  );

  const recovery = evaluatePair(
    "recovery",
    byKey,
    fixtures,
    manifest.recovery.baseline_zone,
    manifest.recovery.restored_zone,
    manifest.recovery.effort,
    manifest.cluster.min_fixtures_per_level,
    (baseline, restored) =>
      Math.abs(baseline - restored) <= manifest.recovery.within_recall_points,
  );

  return {
    contrasts,
    recovery,
    all_met:
      contrasts.every((c) => c.outcome === "met") && recovery.outcome === "met",
  };
}
