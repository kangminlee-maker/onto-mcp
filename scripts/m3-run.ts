/**
 * M3 defect-spectrum run harness — end-to-end: load a fixture's ground truth +
 * persisted review evidence, run the attribution judge (Opus 4.8) over the
 * surfaced issues, CAPTURE the attributions, and score the graded spectrum.
 *
 * Design SSOT: development-records/design/20260716-m3-model-characteristic-benchmark-design.md (§5).
 *
 * Modes:
 *   run    (default) — dispatch the judge (small spend), capture, score, report.
 *   replay --replay <run-dir> — re-score from captured attributions (NO spend,
 *            deterministic). The captured judge output is the replay authority.
 *
 * Usage:
 *   npx tsx scripts/m3-run.ts [--fixture <id> ...] [--session <fixture>:<session>]
 *                             [--judge-auth api_key|oauth] [--out <dir>]
 *   npx tsx scripts/m3-run.ts --replay <run-dir>
 *
 * Band thresholds are anchored to the fixture-intrinsic ground truth (design
 * §3-1 / review F4), NEVER calibrated to the scored distribution.
 */
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  parseSeededDefects,
  parseSurfacedIssues,
  scoreDefectSpectrum,
  type BandThresholds,
  type DefectSpectrumResult,
  type IssueAttribution,
  type SeededDefect,
  type SurfacedIssue,
} from "./m3-defect-spectrum.ts";
import {
  createAttributionJudge,
  JUDGE_MODEL_ID,
  type AttributionDispatch,
} from "./m3-attribution-judge.ts";

const FIXTURES_ROOT = "development-records/benchmark/fixtures/ontology";
const DEFAULT_FIXTURES = ["clinical-lab-workflow", "credit-risk-taxonomy", "manufacturing-bom"];

/**
 * M3 band methodology (design §3-1). Anchored to intrinsic ground truth:
 * 도달 = every seeded material defect detected; 상회 = that AND precision ≥ 0.9;
 * 미달 = precision below 0.8 (a fabricator can't buy a band with volume) OR
 * incomplete material recall. NOT derived from the scored runs (review F4).
 */
const M3_BAND_THRESHOLDS: BandThresholds = {
  meet_material_recall: 1,
  exceed_material_recall: 1,
  exceed_precision: 0.9,
  floor_precision: 0.8,
};

interface CaptureFile {
  schema_version: "m3-capture/1";
  fixture: string;
  evidence_session: string;
  judge_model: string;
  band_thresholds: BandThresholds;
  attributions: IssueAttribution[];
}

interface FixtureRunOutput {
  fixture: string;
  evidence_session: string;
  result: DefectSpectrumResult;
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
 * PINNED (design: an effort-unset judge showed a ~40× output-token swing that
 * flipped bands — H4 on the instrument). A fixed effort makes the judge's
 * adaptive-thinking behavior consistent across dispatches.
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

/**
 * Intra-judge stability probe (design §3-3): dispatch the judge K times on the
 * SAME fixture input and report whether the band is stable. Real spend (K judge
 * calls). Does not capture — it is a diagnostic on the measurement instrument.
 */
async function stabilityProbe(args: {
  fixtures: string[];
  sessionPins: Map<string, string>;
  auth: "api_key" | "oauth";
  effort?: string;
  repeat: number;
}): Promise<void> {
  const judge = createAttributionJudge({ dispatch: judgeDispatch(args.auth, args.effort) });
  for (const fixture of args.fixtures) {
    const session = args.sessionPins.get(fixture) ?? (await latestEvidenceSession(fixture));
    const { seededDefects, issues } = await loadFixtureInputs(fixture, session);
    console.log(`\n▶ stability ${fixture} (${session}) — judge ${JUDGE_MODEL_ID} effort=${args.effort ?? "(unset)"} ×${args.repeat}`);
    const runs: DefectSpectrumResult[] = [];
    for (let k = 0; k < args.repeat; k += 1) {
      const attributions = await judge({ issues, seededDefects });
      const result = scoreDefectSpectrum({ seededDefects, issues, attributions, thresholds: M3_BAND_THRESHOLDS });
      runs.push(result);
      console.log(`  run ${k + 1}: ${result.band}  material ${result.recall_material.toFixed(3)}  precision ${result.precision.toFixed(3)}  detected ${result.detected_defect_ids.length}/${result.seeded_total}`);
    }
    const bands = new Set(runs.map((r) => r.band));
    const recallSpread = Math.max(...runs.map((r) => r.recall_material)) - Math.min(...runs.map((r) => r.recall_material));
    const precSpread = Math.max(...runs.map((r) => r.precision)) - Math.min(...runs.map((r) => r.precision));
    console.log(`  → band ${bands.size === 1 ? `STABLE (${[...bands][0]})` : `UNSTABLE (${[...bands].join("/")})`} · material-recall spread ${recallSpread.toFixed(3)} · precision spread ${precSpread.toFixed(3)}`);
  }
}

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
}

function bandLabel(band: DefectSpectrumResult["band"]): string {
  return band === "exceeds" ? "상회 (exceeds)" : band === "meets" ? "도달 (meets)" : "미달 (below)";
}

function reportLine(o: FixtureRunOutput): string {
  const r = o.result;
  return [
    `[${o.fixture}] ${bandLabel(r.band)}`,
    `  recall material ${r.detected_material_defect_ids.length}/${r.seeded_material_total} = ${r.recall_material.toFixed(3)} · overall ${r.detected_defect_ids.length}/${r.seeded_total} = ${r.recall_overall.toFixed(3)}`,
    `  precision ${r.attributed_issues}/${r.surfaced_issues_total} = ${r.precision.toFixed(3)} (fabricated ${r.fabricated_issues})`,
    `  severity aligned ${r.severity_aligned_defect_ids.length}/${r.detected_defect_ids.length}${r.severity_alignment_rate === null ? "" : ` = ${r.severity_alignment_rate.toFixed(3)}`}`,
    `  detected: ${r.detected_defect_ids.join(", ") || "(none)"}`,
  ].join("\n");
}

async function runFixtures(args: {
  fixtures: string[];
  sessionPins: Map<string, string>;
  auth: "api_key" | "oauth";
  effort?: string;
  outDir: string;
}): Promise<FixtureRunOutput[]> {
  const judge = createAttributionJudge({ dispatch: judgeDispatch(args.auth, args.effort) });
  await fs.mkdir(path.join(args.outDir, "capture"), { recursive: true });
  const outputs: FixtureRunOutput[] = [];
  for (const fixture of args.fixtures) {
    const session = args.sessionPins.get(fixture) ?? (await latestEvidenceSession(fixture));
    const { seededDefects, issues } = await loadFixtureInputs(fixture, session);
    console.log(`\n▶ ${fixture} (evidence ${session}) — ${issues.length} material issues, ${seededDefects.length} seeded defects → dispatching judge…`);
    const attributions = await judge({ issues, seededDefects });
    const capture: CaptureFile = {
      schema_version: "m3-capture/1",
      fixture,
      evidence_session: session,
      judge_model: JUDGE_MODEL_ID,
      band_thresholds: M3_BAND_THRESHOLDS,
      attributions,
    };
    await fs.writeFile(
      path.join(args.outDir, "capture", `${fixture}.json`),
      `${JSON.stringify(capture, null, 2)}\n`,
      "utf8",
    );
    const result = scoreDefectSpectrum({ seededDefects, issues, attributions, thresholds: M3_BAND_THRESHOLDS });
    outputs.push({ fixture, evidence_session: session, result });
    console.log(reportLine({ fixture, evidence_session: session, result }));
  }
  return outputs;
}

async function replayRun(runDir: string): Promise<FixtureRunOutput[]> {
  const captureDir = path.join(runDir, "capture");
  const outputs: FixtureRunOutput[] = [];
  for (const file of (await fs.readdir(captureDir)).filter((f) => f.endsWith(".json")).sort()) {
    const capture = JSON.parse(await fs.readFile(path.join(captureDir, file), "utf8")) as CaptureFile;
    const { seededDefects, issues } = await loadFixtureInputs(capture.fixture, capture.evidence_session);
    const result = scoreDefectSpectrum({
      seededDefects,
      issues,
      attributions: capture.attributions,
      thresholds: capture.band_thresholds,
    });
    outputs.push({ fixture: capture.fixture, evidence_session: capture.evidence_session, result });
    console.log(reportLine({ fixture: capture.fixture, evidence_session: capture.evidence_session, result }));
  }
  return outputs;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const replayDir = readOption(argv, "replay");
  const repeat = Number(readOption(argv, "repeat") ?? "1");

  // Stability probe: dispatch the judge K times per fixture, no capture/report.
  if (!replayDir && repeat > 1) {
    const fixtures = readMulti(argv, "fixture");
    const sessionPins = new Map<string, string>();
    for (const pin of readMulti(argv, "session")) {
      const [f, s] = pin.split(":");
      if (f && s) sessionPins.set(f, s);
    }
    await stabilityProbe({
      fixtures: fixtures.length > 0 ? fixtures : DEFAULT_FIXTURES,
      sessionPins,
      auth: (readOption(argv, "judge-auth") ?? "oauth") as "api_key" | "oauth",
      effort: readOption(argv, "judge-effort"),
      repeat,
    });
    return;
  }

  let outputs: FixtureRunOutput[];
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
    // effort=low is the validated default: an effort-unset judge showed a ~40×
    // output-token swing that flipped bands (H4 on the instrument); low is stable
    // (0.000 band spread over K=4) and more faithful to refute-by-default (the
    // thinking-heavy path over-attributed a specimen-mentioning issue to the
    // lifecycle defect the review never actually surfaced).
    const effort = readOption(argv, "judge-effort") ?? "low";
    outDir = readOption(argv, "out") ?? path.join("development-records/benchmark/m3", stamp(new Date()));
    console.log(`M3 RUN — judge ${JUDGE_MODEL_ID} (${auth}, effort=${effort ?? "(unset)"}) → ${outDir}`);
    outputs = await runFixtures({
      fixtures: fixtures.length > 0 ? fixtures : DEFAULT_FIXTURES,
      sessionPins,
      auth,
      effort,
      outDir,
    });
  }

  const summary = {
    schema_version: "m3-report/1",
    judge_model: JUDGE_MODEL_ID,
    band_thresholds: M3_BAND_THRESHOLDS,
    fixtures: outputs.map((o) => ({ fixture: o.fixture, evidence_session: o.evidence_session, ...o.result })),
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`\n✔ ${outputs.length} fixtures scored → ${path.join(outDir, "report.json")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
