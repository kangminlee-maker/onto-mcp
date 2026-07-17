/**
 * Effort-bench coverage-map precompute — deterministic eligibility report for
 * the inline-budget ITT benchmark (adaptive-effort design §4-2/§4-3, P1 item ①).
 *
 * For every ontology fixture this script renders the SAME composite document
 * the packet stage embeds (`renderReviewTargetMaterializedInput` — the real
 * production renderer, finding R2-3: coverage lives in rendered coordinates,
 * never raw target-file lines), joins the fixture's authored evidence anchors
 * (evidence-anchors.yaml) with its ground truth (material flag comes from
 * seeded_defects.severity_expectation — single source, never re-authored), and
 * precomputes per (fixture × max_embed_lines knob) cell:
 *   in / out / straddle defect classification + the deterministic eligibility
 *   predicate ("≥ m material defects fully beyond the cut", finding R2-6 —
 *   outcome-based fixture selection is circular; this report is the ONLY
 *   admissible basis for the pre-registration manifest's knob/zone choice).
 *
 * Note on line arithmetic: the packet stage embeds
 * `truncateForEmbedding(materializedInputText.trim(), maxLines, …)`
 * (materialize-review-prompt-packets.ts:1276-1282) — the TREATED document is
 * the TRIMMED render, one line shorter than the renderer's newline-terminated
 * output under the split("\n") convention. This module mirrors that exactly
 * (`treatedEmbedText`), so `rendered_lines` here equals the treated line
 * count (`wc -l` of the persisted materialized-input.md) and a knob >=
 * rendered_lines as reported HERE realizes full coverage with no cut.
 *
 * CLI:
 *   npx tsx scripts/effort-bench-coverage-map.ts \
 *     [--ladder 40,60,80,120,300] [--min-material-out 2] [--out <path>]
 * Default out: development-records/benchmark/effort-bench/coverage-map-report.yaml
 * Output is deterministic (no timestamps) — regeneration must be byte-stable,
 * and the test suite recomputes it against the committed report (drift gate).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  computeEmbedCoverage,
  coverageCellEligibility,
  type DefectEvidenceAnchor,
} from "../src/core-runtime/review/embed-coverage.js";
import { renderReviewTargetMaterializedInput } from "../src/core-runtime/review/review-artifact-utils.js";
import { parseSeededDefects, type SeededDefect } from "./m3-defect-spectrum.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_ROOT = path.join(REPO_ROOT, "development-records/benchmark/fixtures/ontology");

/** The four benchmark fixtures (design §4-3: fixtures ≥ 2 per coverage level). */
export const COVERAGE_MAP_FIXTURES = [
  "clinical-lab-workflow",
  "credit-risk-taxonomy",
  "logistics-fulfillment",
  "manufacturing-bom",
] as const;

/** Mirror of the live packet stage's kind for single-file text targets. */
export const MATERIALIZED_KIND = "single_text";

export const COVERAGE_MAP_SCHEMA_VERSION = "effort-bench-coverage-map/1";
export const EVIDENCE_ANCHORS_SCHEMA_VERSION = "effort-bench-evidence-anchors/1";

export const DEFAULT_KNOB_LADDER = [40, 60, 80, 120, 300];
export const DEFAULT_MIN_MATERIAL_OUT = 2;

function fail(msg: string): never {
  throw new Error(`effort-bench-coverage-map: ${msg}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface EvidenceAnchorsDoc {
  fixture: string;
  defects: Array<{ id: string; anchors: string[] }>;
}

/** Parse + validate an evidence-anchors.yaml document. Fail-loud; never repairs. */
export function parseEvidenceAnchors(value: unknown): EvidenceAnchorsDoc {
  if (!isRecord(value)) fail("evidence-anchors doc must be an object");
  if (value.schema_version !== EVIDENCE_ANCHORS_SCHEMA_VERSION) {
    fail(
      `unsupported schema_version ${JSON.stringify(value.schema_version)} (expected ${EVIDENCE_ANCHORS_SCHEMA_VERSION})`,
    );
  }
  if (typeof value.fixture !== "string" || value.fixture.length === 0) {
    fail("fixture must be a non-empty string");
  }
  if (!Array.isArray(value.defects) || value.defects.length === 0) {
    fail("defects must be a non-empty list");
  }
  const seen = new Set<string>();
  const defects = value.defects.map((d: unknown, i: number) => {
    if (!isRecord(d)) fail(`defects[${i}] must be an object`);
    if (typeof d.id !== "string" || d.id.length === 0) fail(`defects[${i}].id must be a non-empty string`);
    if (seen.has(d.id)) fail(`duplicate defect id ${d.id}`);
    seen.add(d.id);
    if (
      !Array.isArray(d.anchors) ||
      d.anchors.length === 0 ||
      d.anchors.some((a) => typeof a !== "string" || a.length === 0)
    ) {
      fail(`defect ${d.id}: anchors must be a non-empty list of non-empty strings`);
    }
    return { id: d.id, anchors: d.anchors as string[] };
  });
  return { fixture: value.fixture, defects };
}

/**
 * Join authored anchors with the fixture ground truth. The anchor doc must
 * cover EXACTLY the seeded defect ids (a defect without a locator cannot enter
 * a coverage cell — silently dropping it would corrupt the eligibility counts);
 * the material flag is derived from severity_expectation, never re-authored.
 */
export function joinAnchorsWithGroundTruth(
  anchorsDoc: EvidenceAnchorsDoc,
  seededDefects: SeededDefect[],
): DefectEvidenceAnchor[] {
  const anchorIds = new Set(anchorsDoc.defects.map((d) => d.id));
  const seededById = new Map(seededDefects.map((d) => [d.id, d]));
  const missing = seededDefects.filter((d) => !anchorIds.has(d.id)).map((d) => d.id);
  if (missing.length > 0) {
    fail(`fixture ${anchorsDoc.fixture}: seeded defects without anchors: ${missing.join(", ")}`);
  }
  const unknown = [...anchorIds].filter((id) => !seededById.has(id));
  if (unknown.length > 0) {
    fail(`fixture ${anchorsDoc.fixture}: anchor ids not in ground truth: ${unknown.join(", ")}`);
  }
  return anchorsDoc.defects.map((d) => ({
    id: d.id,
    anchors: d.anchors,
    material: seededById.get(d.id)!.severity_expectation === "material",
  }));
}

async function readYaml(filePath: string): Promise<unknown> {
  return YAML.parse(await fs.readFile(filePath, "utf8"));
}

/** Load a fixture's joined anchor set from its committed ground truth + anchors. */
export async function loadFixtureAnchorSet(fixtureId: string): Promise<DefectEvidenceAnchor[]> {
  const fixtureDir = path.join(FIXTURES_ROOT, fixtureId);
  const groundTruth = await readYaml(path.join(fixtureDir, "ground-truth.yaml"));
  const anchorsDoc = parseEvidenceAnchors(await readYaml(path.join(fixtureDir, "evidence-anchors.yaml")));
  if (anchorsDoc.fixture !== fixtureId) {
    fail(`fixture field mismatch: anchors say ${anchorsDoc.fixture}, expected ${fixtureId}`);
  }
  return joinAnchorsWithGroundTruth(anchorsDoc, parseSeededDefects(groundTruth));
}

/**
 * The exact text the packet stage feeds to `truncateForEmbedding`: the
 * rendered materialized input, TRIMMED (materialize-review-prompt-packets.ts
 * :1276-1282). Coverage MUST be computed over this text — the untrimmed
 * render carries a trailing empty split segment that shifts the boundary by
 * one line (a knob equal to the treated line count would be misreported as
 * truncated/ineligible).
 */
export function treatedEmbedText(renderedText: string): string {
  return renderedText.trim();
}

/**
 * Render a fixture's materialized input with the production renderer. The
 * fixture target directory must hold exactly one file (these benchmarks
 * materialize a single ontology document); anything else means the fixture
 * layout changed and the coordinate assumption must be revisited — fail loud.
 */
export async function renderFixtureMaterializedInput(fixtureId: string): Promise<string> {
  const targetDir = path.join(FIXTURES_ROOT, fixtureId, "target");
  const entries = (await fs.readdir(targetDir)).filter((e) => !e.startsWith("."));
  if (entries.length !== 1) {
    fail(`fixture ${fixtureId}: expected exactly one target file, found [${entries.join(", ")}]`);
  }
  return renderReviewTargetMaterializedInput(MATERIALIZED_KIND, [path.join(targetDir, entries[0]!)]);
}

export interface CoverageMapCell {
  max_embed_lines: number;
  truncated: boolean;
  out: string[];
  straddle: string[];
  material_out_count: number;
  material_straddle_count: number;
  eligible: boolean;
  reason: string;
}

export interface FixtureCoverageMap {
  fixture: string;
  rendered_lines: number;
  defects: Array<{ id: string; material: boolean; anchor_lines: number[] }>;
  cells: CoverageMapCell[];
}

export interface CoverageMapReport {
  schema_version: typeof COVERAGE_MAP_SCHEMA_VERSION;
  materialized_kind: typeof MATERIALIZED_KIND;
  knob_ladder: number[];
  eligibility_min_material_out: number;
  fixtures: FixtureCoverageMap[];
}

/** Compute one fixture's coverage map over the knob ladder (pure given inputs). */
export function buildFixtureCoverageMap(
  fixtureId: string,
  renderedText: string,
  defects: DefectEvidenceAnchor[],
  knobLadder: number[],
  minMaterialOut: number,
): FixtureCoverageMap {
  const cells = knobLadder.map((knob) => {
    const report = computeEmbedCoverage(renderedText, knob, defects);
    const verdict = coverageCellEligibility(report, { minMaterialOut });
    return {
      max_embed_lines: knob,
      truncated: report.truncated,
      out: report.defects.filter((d) => d.status === "out").map((d) => d.id),
      straddle: report.defects.filter((d) => d.status === "straddle").map((d) => d.id),
      material_out_count: report.material_out_count,
      material_straddle_count: report.material_straddle_count,
      eligible: verdict.eligible,
      reason: verdict.reason,
    };
  });
  // Anchor lines are knob-independent; take them from any cell's computation.
  const base = computeEmbedCoverage(renderedText, Number.MAX_SAFE_INTEGER, defects);
  return {
    fixture: fixtureId,
    rendered_lines: base.rendered_lines,
    defects: base.defects.map((d) => ({
      id: d.id,
      material: d.material,
      anchor_lines: d.anchor_lines,
    })),
    cells,
  };
}

export interface CoverageMapOptions {
  knobLadder?: number[];
  minMaterialOut?: number;
}

/** Build the full report over all benchmark fixtures from committed artifacts. */
export async function buildCoverageMapReport(
  options: CoverageMapOptions = {},
): Promise<CoverageMapReport> {
  const knobLadder = options.knobLadder ?? DEFAULT_KNOB_LADDER;
  const minMaterialOut = options.minMaterialOut ?? DEFAULT_MIN_MATERIAL_OUT;
  if (knobLadder.length === 0 || knobLadder.some((k) => !Number.isInteger(k) || k < 1)) {
    fail("knob ladder must be a non-empty list of positive integers");
  }
  if (new Set(knobLadder).size !== knobLadder.length) fail("knob ladder entries must be unique");
  const fixtures: FixtureCoverageMap[] = [];
  for (const fixtureId of COVERAGE_MAP_FIXTURES) {
    const [renderedText, defects] = await Promise.all([
      renderFixtureMaterializedInput(fixtureId),
      loadFixtureAnchorSet(fixtureId),
    ]);
    fixtures.push(
      buildFixtureCoverageMap(fixtureId, treatedEmbedText(renderedText), defects, knobLadder, minMaterialOut),
    );
  }
  return {
    schema_version: COVERAGE_MAP_SCHEMA_VERSION,
    materialized_kind: MATERIALIZED_KIND,
    knob_ladder: knobLadder,
    eligibility_min_material_out: minMaterialOut,
    fixtures,
  };
}

export function serializeCoverageMapReport(report: CoverageMapReport): string {
  const header = [
    "# Effort-bench coverage map — deterministic eligibility precompute.",
    "# GENERATED by scripts/effort-bench-coverage-map.ts — do not hand-edit;",
    "# regenerate after any change to fixture targets or evidence anchors.",
    "# The pre-registration manifest's knob/zone choice cites THIS report",
    "# (design §4-3, finding R2-6: eligibility is decided by pre-registered",
    "# deterministic predicate, never by observed review outcomes).",
  ].join("\n");
  return `${header}\n${YAML.stringify(report)}`;
}

function readOption(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const ladderRaw = readOption(argv, "--ladder");
  const minRaw = readOption(argv, "--min-material-out");
  const outPath =
    readOption(argv, "--out") ??
    path.join(REPO_ROOT, "development-records/benchmark/effort-bench/coverage-map-report.yaml");
  const report = await buildCoverageMapReport({
    ...(ladderRaw ? { knobLadder: ladderRaw.split(",").map((s) => Number(s.trim())) } : {}),
    ...(minRaw ? { minMaterialOut: Number(minRaw) } : {}),
  });
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, serializeCoverageMapReport(report), "utf8");
  for (const f of report.fixtures) {
    const eligible = f.cells.filter((c) => c.eligible && c.truncated).map((c) => c.max_embed_lines);
    process.stdout.write(
      `${f.fixture}: rendered_lines=${f.rendered_lines} eligible-truncated-knobs=[${eligible.join(", ")}]\n`,
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
