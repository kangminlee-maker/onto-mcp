/**
 * M3 defect-spectrum run harness — end-to-end with the INTRA-JUDGE STABILITY
 * CONTROL as the default scoring path (design §3-3). For each fixture it loads
 * the ground truth + persisted review evidence, dispatches the Opus 4.8
 * attribution judge K times over the surfaced issues, CAPTURES every attribution
 * set, scores each, and AGGREGATES: a band is reported only if it is stable
 * across all K judge runs — otherwise the fixture is `indeterminate` with the
 * metric range. A single judge dispatch was shown to flip bands near a threshold
 * (H3+H4 confirmed empirically), so a single-draw band is never a verdict.
 *
 * Design SSOT: development-records/design/20260716-model-characteristic-benchmark-design.md (§3-3, §5).
 *
 * Modes:
 *   run    (default) — dispatch the judge K× per fixture (small spend), capture,
 *            score, aggregate, report.
 *   replay --replay <run-dir> — re-score from captured attributions (NO spend,
 *            deterministic): reproduces the same per-run scores and aggregate.
 *
 * Usage:
 *   npx tsx scripts/m3-run.ts [--fixture <id> ...] [--session <fixture>:<sess>]
 *          [--judge-auth api_key|oauth] [--judge-effort <level>] [--judge-runs K]
 *          [--out <dir>]
 *   npx tsx scripts/m3-run.ts --replay <run-dir>
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  parseSeededDefects,
  parseSurfacedIssues,
  scoreDefectSpectrum,
  type BandThresholds,
  type DefectSpectrumBand,
  type DefectSpectrumResult,
  type IssueAttribution,
  type SeededDefect,
  type SurfacedIssue,
} from "./m3-defect-spectrum.ts";
import { createAttributionJudge, JUDGE_MODEL_ID, type AttributionDispatch } from "./m3-attribution-judge.ts";

const FIXTURES_ROOT = "development-records/benchmark/fixtures/ontology";
const DEFAULT_FIXTURES = ["clinical-lab-workflow", "credit-risk-taxonomy", "manufacturing-bom"];
const DEFAULT_JUDGE_RUNS = 3;

/**
 * M3 band methodology (design §3-1). Anchored to intrinsic ground truth:
 * 도달 = every seeded material defect detected; 상회 = that AND precision ≥ 0.9;
 * 미달 = precision below 0.8 OR incomplete material recall. NOT derived from the
 * scored runs (review F4).
 */
const M3_BAND_THRESHOLDS: BandThresholds = {
  meet_material_recall: 1,
  exceed_material_recall: 1,
  exceed_precision: 0.9,
  floor_precision: 0.8,
};

export interface RunStats {
  min: number;
  max: number;
  mean: number;
}

export interface FixtureStabilityResult {
  fixture: string;
  evidence_session: string;
  judge_runs: number;
  /** The stable band, or "indeterminate" when the K runs disagree. */
  band: DefectSpectrumBand | "indeterminate";
  band_stable: boolean;
  bands_observed: DefectSpectrumBand[];
  recall_material: RunStats;
  recall_overall: RunStats;
  precision: RunStats;
  per_run: DefectSpectrumResult[];
}

interface CaptureFile {
  schema_version: "m3-capture/2";
  fixture: string;
  evidence_session: string;
  judge_model: string;
  judge_effort?: string;
  band_thresholds: BandThresholds;
  /** K attribution sets, one per judge dispatch (the replay authority). */
  runs: IssueAttribution[][];
}

export function stats(xs: number[]): RunStats {
  return {
    min: Math.min(...xs),
    max: Math.max(...xs),
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
  };
}

/**
 * Aggregate K single-run scores into a stability verdict. The band is reported
 * only if every run agrees; any disagreement → "indeterminate" (never force a
 * single-draw band — design §3-3).
 */
export function aggregate(
  fixture: string,
  session: string,
  perRun: DefectSpectrumResult[],
): FixtureStabilityResult {
  if (perRun.length === 0) throw new Error("m3 aggregate: no judge runs to aggregate");
  const bands = perRun.map((r) => r.band);
  const stable = new Set(bands).size === 1;
  return {
    fixture,
    evidence_session: session,
    judge_runs: perRun.length,
    band: stable ? bands[0]! : "indeterminate",
    band_stable: stable,
    bands_observed: bands,
    recall_material: stats(perRun.map((r) => r.recall_material)),
    recall_overall: stats(perRun.map((r) => r.recall_overall)),
    precision: stats(perRun.map((r) => r.precision)),
    per_run: perRun,
  };
}

function readOption(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
function readMulti(argv: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === `--${name}` && argv[i + 1]) out.push(argv[i + 1]!);
  return out;
}

async function readYaml(filePath: string): Promise<unknown> {
  return YAML.parse(await fs.readFile(filePath, "utf8"));
}

/** Pick the mtime-latest evidence session (git does not preserve name ordering). */
async function latestEvidenceSession(fixtureId: string): Promise<string> {
  const evidenceRoot = path.join(FIXTURES_ROOT, fixtureId, "evidence");
  let latest: string | null = null;
  let latestMs = -1;
  for (const session of await fs.readdir(evidenceRoot)) {
    const stat = await fs.stat(path.join(evidenceRoot, session));
    if (stat.isDirectory() && stat.mtimeMs > latestMs) {
      latestMs = stat.mtimeMs;
      latest = session;
    }
  }
  if (!latest) throw new Error(`no persisted evidence for fixture: ${fixtureId}`);
  return latest;
}

async function loadFixtureInputs(
  fixtureId: string,
  session: string,
): Promise<{ seededDefects: SeededDefect[]; issues: SurfacedIssue[] }> {
  const seededDefects = parseSeededDefects(
    await readYaml(path.join(FIXTURES_ROOT, fixtureId, "ground-truth.yaml")),
  );
  const evidenceDir = path.join(FIXTURES_ROOT, fixtureId, "evidence", session);
  const issues = parseSurfacedIssues(
    await readYaml(path.join(evidenceDir, "issue-ledger.yaml")),
    await readYaml(path.join(evidenceDir, "finding-ledger.yaml")),
  );
  return { seededDefects, issues };
}

/**
 * Build the judge dispatch for the chosen anthropic auth route. `effort` is
 * PINNED (an effort-unset judge showed a ~40× output-token swing that flipped
 * bands — H4 on the instrument); a fixed effort makes adaptive-thinking behavior
 * consistent.
 */
function judgeDispatch(auth: "api_key" | "oauth", effort?: string): AttributionDispatch {
  return async (systemPrompt, userPrompt) => {
    const { callLlm } = await import("../src/core-runtime/llm/llm-caller.ts");
    const base =
      auth === "oauth"
        ? { provider: "anthropic" as const, execution_adapter: "claude_code" as const, model_id: JUDGE_MODEL_ID }
        : { provider: "anthropic" as const, model_id: JUDGE_MODEL_ID };
    const result = await callLlm(systemPrompt, userPrompt, {
      ...base,
      max_tokens: 8192,
      ...(effort ? { reasoning_effort: effort } : {}),
    });
    return { text: result.text };
  };
}

function bandLabel(band: DefectSpectrumBand): string {
  return band === "exceeds" ? "상회 (exceeds)" : band === "meets" ? "도달 (meets)" : "미달 (below)";
}

function reportLine(a: FixtureStabilityResult): string {
  const verdict = a.band_stable ? bandLabel(a.band as DefectSpectrumBand) : `INDETERMINATE (${a.bands_observed.join("/")})`;
  const range = (s: RunStats) => `${s.min.toFixed(3)}–${s.max.toFixed(3)} (mean ${s.mean.toFixed(3)})`;
  return [
    `[${a.fixture}] ${verdict}  (judge ×${a.judge_runs})`,
    `  material recall ${range(a.recall_material)} · overall ${range(a.recall_overall)}`,
    `  precision       ${range(a.precision)}`,
  ].join("\n");
}

async function runFixtures(args: {
  fixtures: string[];
  sessionPins: Map<string, string>;
  auth: "api_key" | "oauth";
  effort?: string;
  judgeRuns: number;
  outDir: string;
}): Promise<FixtureStabilityResult[]> {
  const judge = createAttributionJudge({ dispatch: judgeDispatch(args.auth, args.effort) });
  await fs.mkdir(path.join(args.outDir, "capture"), { recursive: true });
  const outputs: FixtureStabilityResult[] = [];
  for (const fixture of args.fixtures) {
    const session = args.sessionPins.get(fixture) ?? (await latestEvidenceSession(fixture));
    const { seededDefects, issues } = await loadFixtureInputs(fixture, session);
    console.log(`\n▶ ${fixture} (evidence ${session}) — ${issues.length} material issues, ${seededDefects.length} seeded defects → judge ×${args.judgeRuns}`);
    const runs: IssueAttribution[][] = [];
    const perRun: DefectSpectrumResult[] = [];
    for (let k = 0; k < args.judgeRuns; k += 1) {
      const attributions = await judge({ issues, seededDefects });
      runs.push(attributions);
      const result = scoreDefectSpectrum({ seededDefects, issues, attributions, thresholds: M3_BAND_THRESHOLDS });
      perRun.push(result);
      console.log(`  run ${k + 1}: ${result.band}  material ${result.recall_material.toFixed(3)}  precision ${result.precision.toFixed(3)}  detected ${result.detected_defect_ids.length}/${result.seeded_total}`);
    }
    const capture: CaptureFile = {
      schema_version: "m3-capture/2",
      fixture,
      evidence_session: session,
      judge_model: JUDGE_MODEL_ID,
      ...(args.effort ? { judge_effort: args.effort } : {}),
      band_thresholds: M3_BAND_THRESHOLDS,
      runs,
    };
    await fs.writeFile(path.join(args.outDir, "capture", `${fixture}.json`), `${JSON.stringify(capture, null, 2)}\n`, "utf8");
    const agg = aggregate(fixture, session, perRun);
    outputs.push(agg);
    console.log(reportLine(agg));
  }
  return outputs;
}

async function replayRun(runDir: string): Promise<FixtureStabilityResult[]> {
  const captureDir = path.join(runDir, "capture");
  const outputs: FixtureStabilityResult[] = [];
  for (const file of (await fs.readdir(captureDir)).filter((f) => f.endsWith(".json")).sort()) {
    const capture = JSON.parse(await fs.readFile(path.join(captureDir, file), "utf8")) as CaptureFile;
    const { seededDefects, issues } = await loadFixtureInputs(capture.fixture, capture.evidence_session);
    const perRun = capture.runs.map((attributions) =>
      scoreDefectSpectrum({ seededDefects, issues, attributions, thresholds: capture.band_thresholds }),
    );
    const agg = aggregate(capture.fixture, capture.evidence_session, perRun);
    outputs.push(agg);
    console.log(reportLine(agg));
  }
  return outputs;
}

function summaryReport(outputs: FixtureStabilityResult[]) {
  return {
    schema_version: "m3-report/2",
    judge_model: JUDGE_MODEL_ID,
    band_thresholds: M3_BAND_THRESHOLDS,
    fixtures: outputs.map((o) => ({
      fixture: o.fixture,
      evidence_session: o.evidence_session,
      judge_runs: o.judge_runs,
      band: o.band,
      band_stable: o.band_stable,
      bands_observed: o.bands_observed,
      recall_material: o.recall_material,
      recall_overall: o.recall_overall,
      precision: o.precision,
    })),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const replayDir = readOption(argv, "replay");

  let outputs: FixtureStabilityResult[];
  let outDir: string;
  if (replayDir) {
    outDir = replayDir;
    console.log(`M3 REPLAY (no spend) from ${replayDir}`);
    outputs = await replayRun(replayDir);
  } else {
    const fixtures = readMulti(argv, "fixture");
    const sessionPins = new Map<string, string>();
    for (const pin of readMulti(argv, "session")) {
      const [f, s] = pin.split(":");
      if (f && s) sessionPins.set(f, s);
    }
    const auth = (readOption(argv, "judge-auth") ?? "api_key") as "api_key" | "oauth";
    // effort=low is the validated default: an effort-unset judge flipped bands
    // via a ~40× thinking swing; low is the stable, refute-by-default-faithful
    // setting (development-records/benchmark/m3/20260716-baseline-evidence).
    const effort = readOption(argv, "judge-effort") ?? "low";
    const judgeRuns = Number(readOption(argv, "judge-runs") ?? String(DEFAULT_JUDGE_RUNS));
    outDir = readOption(argv, "out") ?? path.join("development-records/benchmark/m3", stamp(new Date()));
    console.log(`M3 RUN — judge ${JUDGE_MODEL_ID} (${auth}, effort=${effort}) ×${judgeRuns} → ${outDir}`);
    outputs = await runFixtures({
      fixtures: fixtures.length > 0 ? fixtures : DEFAULT_FIXTURES,
      sessionPins,
      auth,
      effort,
      judgeRuns,
      outDir,
    });
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(summaryReport(outputs), null, 2)}\n`, "utf8");
  const stableCount = outputs.filter((o) => o.band_stable).length;
  console.log(`\n✔ ${outputs.length} fixtures scored (${stableCount} stable, ${outputs.length - stableCount} indeterminate) → ${path.join(outDir, "report.json")}`);
}

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
}

// Run only when invoked directly (so the exported aggregate/stats stay unit-testable).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
