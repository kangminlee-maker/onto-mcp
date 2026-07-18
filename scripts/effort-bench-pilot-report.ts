/**
 * Effort-bench pilot variance report (adaptive-effort design §8 P2 파일럿 —
 * "review-수준 분산 → 검정력 산정, 적격성 확인").
 *
 * Composes the already-verified parts into the pilot's deliverable:
 *   1. re-scores each pinned (fixture, session) m3 capture deterministically
 *      (verifySourceDigests + parseSeededDefects/parseSurfacedIssues +
 *      scoreDefectSpectrum — the m3 replay path, no live judge calls);
 *   2. admits every review through the bench admission gate
 *      (`assembleBenchRun`: witness == the zone's REGISTERED knob, witness
 *      session == costed session, cost capture) — the zone→knob table is read
 *      from the committed arm-settings files, the single registered source;
 *   3. feeds per-review draw_scores (K per review) into the registered
 *      cluster analysis (`analyzePreregWithCI`). On a pilot the registered
 *      contrasts MUST come out not_evaluable (the pilot covers 2 of the 4
 *      registered fixtures — attrition by design, honestly reported); the
 *      pilot's product is `cell_dispersion`;
 *   4. derives the confirmatory per-cell R from the observed review-level
 *      dispersion: n = 2σ²(z_{1-α/2}+z_{1-β})²/Δ² (two-sample normal
 *      approximation on review-level means; σ = the larger of the two cells'
 *      sd — conservative), for each registered contrast's Δ.
 *
 * Usage:
 *   npx tsx scripts/effort-bench-pilot-report.ts --config <pilot-sessions.json> \
 *     [--out <report.json>]
 * Config shape: { effort, registration, arm_settings_dir, score_capture_dirs:
 *   {zone: dir}, cells: [{zone, fixture, sessions: [..]}] }.
 * Output is deterministic (fixed analysis seed, no timestamps).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  parseCanaryDefectIds,
  parseSeededDefects,
  parseSurfacedIssues,
  scoreDefectSpectrum,
  type DefectSpectrumResult,
} from "./m3-defect-spectrum.ts";
import { verifySourceDigests } from "./m3-run.ts";
import { parseEffortBenchPrereg, type EffortBenchPrereg } from "./effort-bench-prereg.ts";
import {
  analyzePreregWithCI,
  type BenchReviewObservation,
  type PreregCIAnalysis,
} from "./effort-bench-itt-analyzer.ts";
import { assembleBenchRun } from "./effort-bench-run-admission.ts";
import type { M3BenchRun } from "../src/core-runtime/effort-calibration-graded.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_ROOT = path.join(REPO_ROOT, "development-records/benchmark/fixtures/ontology");

/** Fixed seed: the pilot analysis is replayable byte-for-byte. */
export const PILOT_ANALYSIS_SEED = 20260718;

function fail(msg: string): never {
  throw new Error(`effort-bench-pilot-report: ${msg}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface PilotCell {
  zone: string;
  fixture: string;
  sessions: string[];
}

export interface PilotConfig {
  effort: string;
  registration: string;
  arm_settings_dir: string;
  score_capture_dirs: Record<string, string>;
  cells: PilotCell[];
}

export function parsePilotConfig(value: unknown): PilotConfig {
  if (!isRecord(value)) fail("config must be an object");
  const effort = value.effort;
  if (typeof effort !== "string" || !effort) fail("config.effort must be a non-empty string");
  const registration = value.registration;
  if (typeof registration !== "string" || !registration) fail("config.registration must be a path");
  const armDir = value.arm_settings_dir;
  if (typeof armDir !== "string" || !armDir) fail("config.arm_settings_dir must be a path");
  if (!isRecord(value.score_capture_dirs)) fail("config.score_capture_dirs must be an object");
  const scoreDirs: Record<string, string> = {};
  for (const [zone, dir] of Object.entries(value.score_capture_dirs)) {
    if (typeof dir !== "string" || !dir) fail(`score_capture_dirs.${zone} must be a path`);
    scoreDirs[zone] = dir;
  }
  if (!Array.isArray(value.cells) || value.cells.length === 0) fail("config.cells must be non-empty");
  const cells = value.cells.map((c: unknown, i: number) => {
    if (!isRecord(c)) fail(`cells[${i}] must be an object`);
    if (typeof c.zone !== "string" || !c.zone) fail(`cells[${i}].zone must be a string`);
    if (typeof c.fixture !== "string" || !c.fixture) fail(`cells[${i}].fixture must be a string`);
    if (
      !Array.isArray(c.sessions) ||
      c.sessions.length === 0 ||
      c.sessions.some((s) => typeof s !== "string" || !s)
    ) {
      fail(`cells[${i}].sessions must be a non-empty string list`);
    }
    if (!scoreDirs[c.zone]) fail(`cells[${i}]: zone ${c.zone} has no score_capture_dirs entry`);
    return { zone: c.zone, fixture: c.fixture, sessions: c.sessions as string[] };
  });
  return { effort, registration, arm_settings_dir: armDir, score_capture_dirs: scoreDirs, cells };
}

/** zone → registered knob, read from the committed arm-settings files. */
export async function readRegisteredZoneKnobs(
  armSettingsDir: string,
  zones: string[],
  effort: string,
): Promise<Record<string, number>> {
  const table: Record<string, number> = {};
  for (const zone of zones) {
    const file = path.join(armSettingsDir, `settings-${zone}-${effort}.json`);
    const doc = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    const review = doc.review as Record<string, unknown> | undefined;
    const context = review?.context as Record<string, unknown> | undefined;
    const knob = context?.max_embed_lines;
    if (!Number.isInteger(knob) || (knob as number) < 1) {
      fail(`${file}: review.context.max_embed_lines must be a positive integer`);
    }
    table[zone] = knob as number;
  }
  return table;
}

interface CaptureFileLite {
  schema_version: string;
  fixture: string;
  evidence_session: string;
  band_thresholds: Parameters<typeof scoreDefectSpectrum>[0]["thresholds"];
  runs: Parameters<typeof scoreDefectSpectrum>[0]["attributions"][];
}

/** Deterministically re-score one capture into per-draw results (replay path). */
async function rescoreCapture(captureDir: string, fixture: string, session: string): Promise<DefectSpectrumResult[]> {
  const capturePath = path.join(captureDir, "capture", `${fixture}__${session}.json`);
  const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as CaptureFileLite;
  if (capture.fixture !== fixture || capture.evidence_session !== session) {
    fail(`${capturePath}: capture identity mismatch (${capture.fixture}, ${capture.evidence_session})`);
  }
  await verifySourceDigests(capture as never);
  const evidenceDir = path.join(FIXTURES_ROOT, fixture, "evidence", session);
  const groundTruth = YAML.parse(await fs.readFile(path.join(FIXTURES_ROOT, fixture, "ground-truth.yaml"), "utf8"));
  const seededDefects = parseSeededDefects(groundTruth);
  parseCanaryDefectIds(groundTruth, seededDefects); // validated for provenance parity with m3-run
  const issues = parseSurfacedIssues(
    YAML.parse(await fs.readFile(path.join(evidenceDir, "issue-ledger.yaml"), "utf8")),
    YAML.parse(await fs.readFile(path.join(evidenceDir, "finding-ledger.yaml"), "utf8")),
  );
  return capture.runs.map((attributions) =>
    scoreDefectSpectrum({ seededDefects, issues, attributions, thresholds: capture.band_thresholds }),
  );
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Two-sample normal-approximation sample size per cell for detecting Δ at
 * significance α (two-sided) and power 1−β, from review-level sd σ:
 * n = ceil(2σ²(z_{1-α/2}+z_{1-β})²/Δ²), floored at the registered min R.
 */
export function requiredRepsPerCell(sigma: number, delta: number, minReps: number): number {
  if (!(sigma >= 0) || !(delta > 0)) fail(`invalid power inputs sigma=${sigma} delta=${delta}`);
  const z = 1.959963984540054; // z_{0.975}
  const zBeta = 0.8416212335729143; // z_{0.8}
  const n = Math.ceil((2 * sigma * sigma * (z + zBeta) ** 2) / (delta * delta));
  return Math.max(minReps, n);
}

export interface PilotReport {
  schema_version: "effort-bench-pilot-report/1";
  registration: string;
  analysis_seed: number;
  zone_knobs: Record<string, number>;
  bench_runs: M3BenchRun[];
  analysis: PreregCIAnalysis;
  power: Array<{
    contrast_id: string;
    min_effect_recall_points: number;
    /** Largest review-level sd observed across the pilot cells (conservative). */
    sigma_max: number;
    required_reps_per_cell: number;
  }>;
}

export async function buildPilotReport(config: PilotConfig): Promise<PilotReport> {
  const manifestDoc = YAML.parse(await fs.readFile(path.resolve(REPO_ROOT, config.registration), "utf8"));
  const manifest: EffortBenchPrereg = parseEffortBenchPrereg(manifestDoc);
  const zones = [...new Set(config.cells.map((c) => c.zone))].sort();
  const zoneKnobs = await readRegisteredZoneKnobs(
    path.resolve(REPO_ROOT, config.arm_settings_dir),
    zones,
    config.effort,
  );

  const benchRuns: M3BenchRun[] = [];
  const observations: BenchReviewObservation[] = [];
  for (const cell of config.cells) {
    const captureDir = path.resolve(REPO_ROOT, config.score_capture_dirs[cell.zone]!);
    for (const [index, session] of cell.sessions.entries()) {
      const rep = index + 1;
      const perRun = await rescoreCapture(captureDir, cell.fixture, session);
      if (perRun.length !== manifest.cluster.judge_runs) {
        fail(
          `(${cell.zone}, ${cell.fixture}, ${session}): capture holds ${perRun.length} judge runs, registered K=${manifest.cluster.judge_runs}`,
        );
      }
      const evidenceDir = path.join(FIXTURES_ROOT, cell.fixture, "evidence", session);
      const contextManifest = YAML.parse(
        await fs.readFile(path.join(evidenceDir, "execution-preparation", "review-context-manifest.yaml"), "utf8"),
      );
      const executionResult = YAML.parse(
        await fs.readFile(path.join(evidenceDir, "execution-result.yaml"), "utf8"),
      );
      benchRuns.push(
        assembleBenchRun({
          zone: cell.zone,
          effort: config.effort,
          fixture: cell.fixture,
          rep,
          metrics: {
            recall_material: mean(perRun.map((r) => r.recall_material)),
            precision: mean(perRun.map((r) => r.precision)),
          },
          judge_runs: manifest.cluster.judge_runs,
          contextManifest,
          executionResult,
          registeredZoneKnobs: zoneKnobs,
        }),
      );
      observations.push({
        zone: cell.zone,
        effort: config.effort,
        fixture: cell.fixture,
        rep,
        draw_scores: perRun.map((r) => r.recall_material),
      });
    }
  }

  const analysis = analyzePreregWithCI(manifest, observations, { seed: PILOT_ANALYSIS_SEED });
  const sigmaMax = Math.max(
    0,
    ...analysis.cell_dispersion.filter((c) => c.sd !== null).map((c) => c.sd as number),
  );
  const power = manifest.contrasts.map((c) => ({
    contrast_id: c.id,
    min_effect_recall_points: c.min_effect_recall_points,
    sigma_max: sigmaMax,
    required_reps_per_cell: requiredRepsPerCell(
      sigmaMax,
      c.min_effect_recall_points,
      manifest.cluster.min_reps_per_cell,
    ),
  }));

  return {
    schema_version: "effort-bench-pilot-report/1",
    registration: config.registration,
    analysis_seed: PILOT_ANALYSIS_SEED,
    zone_knobs: zoneKnobs,
    bench_runs: benchRuns,
    analysis,
    power,
  };
}

function readOption(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const configPath = readOption(argv, "--config");
  if (!configPath) fail("--config <pilot-sessions.json> is required");
  const config = parsePilotConfig(JSON.parse(await fs.readFile(configPath, "utf8")));
  const report = await buildPilotReport(config);
  const outPath =
    readOption(argv, "--out") ?? path.join(path.dirname(path.resolve(configPath)), "pilot-variance-report.json");
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  for (const cell of report.analysis.cell_dispersion) {
    process.stdout.write(
      `${cell.zone}/${cell.effort}/${cell.fixture}: n=${cell.n_reps} mean=${cell.mean.toFixed(4)} sd=${cell.sd === null ? "null" : cell.sd.toFixed(4)}\n`,
    );
  }
  for (const p of report.power) {
    process.stdout.write(
      `power ${p.contrast_id}: sigma_max=${p.sigma_max.toFixed(4)} Δ=${p.min_effect_recall_points} → R>=${p.required_reps_per_cell}/cell\n`,
    );
  }
  process.stdout.write(`wrote ${outPath}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
