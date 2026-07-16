/**
 * M3 inter-model comparison (design §3-3). Compares N labeled arm reports — each
 * an `m3-run` report.json for one reviewed model — per fixture per metric, and
 * flags whether the arms are DISTINGUISHABLE (disjoint observed ranges) or
 * OVERLAPPING (indistinguishable). This is the layer §3-3 asks for; it is
 * DELIBERATELY built only now that real per-arm reports exist (not speculative).
 *
 * Honest-variance discipline:
 *   - The "range" per (arm, fixture, metric) is the JUDGE K-run spread. With a
 *     single review per cell (R=1) that spread does NOT include review-generation
 *     variance, so a distinguishable verdict here is DIRECTIONAL only. A confident
 *     inter-model claim needs R>1 reviews per cell + intra-model stability (§3-3);
 *     `review_reps` records R and the report labels the caveat when R<2.
 *   - An arm/fixture cell whose verdict is not trustworthy (underpowered /
 *     instrument_broken) is EXCLUDED from that fixture's comparison with a reason —
 *     the intra-model-stability precondition (§3-3), never silently compared.
 *
 * The band cut is anchored to ground truth (never the observed distribution), so
 * comparing means/ranges across arms is not circular.
 */
import type { RunStats } from "./m3-run.ts";
import type { DefectSpectrumBand } from "./m3-defect-spectrum.ts";

/** The verdict shape carried in an m3 report fixture entry (subset of BandVerdict). */
interface ReportVerdict {
  kind: "dominant" | "indeterminate" | "underpowered" | "instrument_broken";
  band: DefectSpectrumBand | null;
  noise_rate?: number | null;
}

interface ReportFixture {
  fixture: string;
  verdict: ReportVerdict;
  /** Reviews pooled behind this cell (R). Present from m3-report/5; absent ⇒ 1. */
  review_reps?: number;
  /** Intra-model stability across the R reviews (§3-3): true/false, or null when
   *  R<2 (unassessable). Absent on pre-m3-report/5 reports ⇒ treated as null. */
  intra_model_stable?: boolean | null;
  recall_material: RunStats;
  recall_overall: RunStats;
  precision: RunStats;
}

/** One reviewed-model arm: a label + the fixtures its m3 report scored. */
export interface ArmReport {
  label: string;
  /** Fallback R when a report predates m3-report/5 (no per-fixture review_reps).
   *  The per-fixture value wins when present. */
  review_reps: number;
  fixtures: ReportFixture[];
}

const TRUSTWORTHY = new Set(["dominant", "indeterminate"]);
export const COMPARISON_METRICS = ["recall_material", "precision"] as const;
export type ComparisonMetric = (typeof COMPARISON_METRICS)[number];

export interface ArmMetric {
  label: string;
  stats: RunStats;
  band: DefectSpectrumBand | null;
}

export interface MetricComparison {
  metric: ComparisonMetric;
  /** Arms that entered the comparison (trustworthy verdicts), ranked by mean desc. */
  ranked: ArmMetric[];
  /** Arms excluded because their verdict was untrustworthy, with the reason. */
  excluded: Array<{ label: string; reason: string }>;
  /** `distinguishable` iff the top arm's observed range is disjoint from every
   *  other included arm's range; else `overlapping`; `insufficient` when <2 arms
   *  remain after the trustworthiness gate. */
  outcome: "distinguishable" | "overlapping" | "insufficient";
  /** The winning arm label when distinguishable, else null. */
  leader: string | null;
}

export interface FixtureComparison {
  fixture: string;
  metrics: MetricComparison[];
}

export interface ComparisonReport {
  schema_version: "m3-compare/1";
  arms: string[];
  /** min review_reps across arms — the comparison is judge-only (directional) when < 2. */
  review_reps: number;
  directional: boolean;
  fixtures: FixtureComparison[];
}

function rangesDisjoint(a: RunStats, b: RunStats): boolean {
  // Disjoint iff one range is entirely above the other (no shared point).
  return a.min > b.max || b.min > a.max;
}

function compareMetricAcrossArms(
  metric: ComparisonMetric,
  cells: Array<{ label: string; fixture: ReportFixture }>,
): MetricComparison {
  const excluded: Array<{ label: string; reason: string }> = [];
  const included: ArmMetric[] = [];
  for (const { label, fixture } of cells) {
    if (!TRUSTWORTHY.has(fixture.verdict.kind)) {
      excluded.push({ label, reason: `verdict ${fixture.verdict.kind} (untrustworthy, §3-3)` });
      continue;
    }
    // Intra-model stability gate (§3-3): with R≥2, a cell whose reviews disagree on
    // band is NOT a stable measurement of that model — exclude it. R<2 (null) is
    // unassessable and passes (the whole comparison is directional then).
    if (fixture.intra_model_stable === false) {
      excluded.push({ label, reason: `intra-model UNSTABLE across ${fixture.review_reps ?? "?"} reviews (§3-3)` });
      continue;
    }
    included.push({ label, stats: fixture[metric], band: fixture.verdict.band });
  }
  // Rank by mean desc, deterministic tie-break by label.
  const ranked = [...included].sort((a, b) => b.stats.mean - a.stats.mean || (a.label < b.label ? -1 : 1));

  let outcome: MetricComparison["outcome"];
  let leader: string | null = null;
  if (ranked.length < 2) {
    outcome = "insufficient";
  } else {
    const top = ranked[0]!;
    const clearlyAbove = ranked.slice(1).every((other) => rangesDisjoint(top.stats, other.stats) && top.stats.min > other.stats.max);
    if (clearlyAbove) {
      outcome = "distinguishable";
      leader = top.label;
    } else {
      outcome = "overlapping";
    }
  }
  return { metric, ranked, excluded, outcome, leader };
}

/**
 * Compare the arms per fixture per metric. A fixture is compared only where ≥2
 * arms report it. Pure and deterministic.
 */
export function compareArms(arms: ArmReport[], metrics: readonly ComparisonMetric[] = COMPARISON_METRICS): ComparisonReport {
  if (arms.length < 2) throw new Error("m3-compare: need at least two arms to compare");
  const labels = arms.map((a) => a.label);
  if (new Set(labels).size !== labels.length) throw new Error("m3-compare: arm labels must be unique");

  // Fixtures present in ≥2 arms, in first-seen order.
  const order: string[] = [];
  const seenIn = new Map<string, number>();
  for (const arm of arms) {
    for (const f of arm.fixtures) {
      if (!seenIn.has(f.fixture)) order.push(f.fixture);
      seenIn.set(f.fixture, (seenIn.get(f.fixture) ?? 0) + 1);
    }
  }

  const fixtures: FixtureComparison[] = [];
  for (const fixture of order) {
    if ((seenIn.get(fixture) ?? 0) < 2) continue;
    const cells = arms
      .map((a) => ({ label: a.label, fixture: a.fixtures.find((f) => f.fixture === fixture) }))
      .filter((c): c is { label: string; fixture: ReportFixture } => c.fixture !== undefined);
    fixtures.push({ fixture, metrics: metrics.map((m) => compareMetricAcrossArms(m, cells)) });
  }

  // R is the min reviews across every compared cell (per-fixture review_reps wins;
  // arm-level fallback for pre-m3-report/5 reports). Directional when any cell < 2.
  const cellReps = arms.flatMap((a) => a.fixtures.map((f) => f.review_reps ?? a.review_reps));
  const reviewReps = cellReps.length > 0 ? Math.min(...cellReps) : Math.min(...arms.map((a) => a.review_reps));
  return {
    schema_version: "m3-compare/1",
    arms: labels,
    review_reps: reviewReps,
    directional: reviewReps < 2,
    fixtures,
  };
}

// ── CLI + text report ──

function fmt(s: RunStats): string {
  return `${s.mean.toFixed(3)} [${s.min.toFixed(3)}–${s.max.toFixed(3)}]`;
}

export function renderComparison(report: ComparisonReport): string {
  const lines: string[] = [];
  lines.push(`M3 inter-model comparison — arms: ${report.arms.join(" vs ")} (R=${report.review_reps})`);
  if (report.directional) {
    lines.push(`⚠ DIRECTIONAL: R=${report.review_reps} < 2 — ranges are the judge K-run spread only; review-generation variance is UNESTIMATED (design §3-3 needs R≥2 + intra-model stability for a confident claim).`);
  }
  for (const fc of report.fixtures) {
    lines.push(`\n[${fc.fixture}]`);
    for (const mc of fc.metrics) {
      const parts = mc.ranked.map((a) => `${a.label} ${fmt(a.stats)}`).join("  ·  ");
      let verdict: string;
      if (mc.outcome === "distinguishable") verdict = `→ ${mc.leader} higher (ranges disjoint)`;
      else if (mc.outcome === "overlapping") verdict = `→ indistinguishable (ranges overlap)`;
      else verdict = `→ insufficient (<2 trustworthy arms)`;
      lines.push(`  ${mc.metric.padEnd(15)} ${parts}  ${verdict}`);
      for (const ex of mc.excluded) lines.push(`    excluded ${ex.label}: ${ex.reason}`);
    }
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const fs = await import("node:fs/promises");
  const argv = process.argv.slice(2);
  // Usage: m3-compare.ts --arm <label>:<report.json> [--arm ...] [--reps N]
  // m3-report/5 reports carry per-fixture review_reps + intra_model_stable (used
  // directly); --reps is only the arm-level fallback for older reports.
  const arms: ArmReport[] = [];
  const reps = Number(readOpt(argv, "reps") ?? "1");
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--arm" && argv[i + 1]) {
      const spec = argv[i + 1]!;
      const idx = spec.indexOf(":");
      if (idx < 0) throw new Error(`m3-compare: --arm expects <label>:<report.json>, got ${spec}`);
      const label = spec.slice(0, idx);
      const reportPath = spec.slice(idx + 1);
      const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as { fixtures: ReportFixture[] };
      arms.push({ label, review_reps: reps, fixtures: report.fixtures });
    }
  }
  const comparison = compareArms(arms);
  console.log(renderComparison(comparison));
  const out = readOpt(argv, "out");
  if (out) {
    await fs.writeFile(out, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
    console.log(`\n→ ${out}`);
  }
}

function readOpt(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

// Run only when invoked directly (keep compareArms/renderComparison unit-testable).
import { fileURLToPath } from "node:url";
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
