/**
 * PR-4 scoping: how much headroom does a directory-rollup rung actually buy, and is the zoom loop
 * (a new selection channel) needed at all?
 *
 * Simulates candidate coarsest-rung shapes over the REAL corpus scaled up, measuring the same
 * full dispatch payload the guard measures. Purely local computation — no code change, no LLM.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET } from "../../../src/core-runtime/reconstruct/source-breadth-fold.ts";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const BENCH = path.join(
  REPO_ROOT,
  ".onto/temp/stage2-value-bench-2026-07-22T17-45-58-944Z/off/.onto/reconstruct/session",
);
type AnyRecord = Record<string, unknown>;

const sourceObservations = parseYaml(
  await fs.readFile(path.join(BENCH, "source-observations.yaml"), "utf8"),
) as { observations: AnyRecord[] };
const real = sourceObservations.observations;

// The measured non-catalog remainder at the one_line rung (intent + profile + scout + ids + framing),
// taken from one-line-floor-anatomy: everything except `source_observations`.
const SYSTEM_AND_FRAMING_BYTES = 1_018_497 - 891_603; // ≈126,894 at N=2000 (ids scale with N)
const IDS_BYTES_PER_UNIT = 62_892 / 2000; // ≈31.4
const FRAMING_FIXED = SYSTEM_AND_FRAMING_BYTES - 62_892; // intent/profile/scout/system

const B = (v: unknown) => Buffer.byteLength(JSON.stringify(v, null, 2), "utf8");

// Directory clustering is the whole question for a rollup rung: factoring the prefix pays only when
// files SHARE directories. Real repos cluster (openai-node's own captured corpus averages the value
// below); a synthetic corpus with one file per directory makes rollup look worthless. Parameterized so
// the sensitivity is visible rather than assumed.
const FILES_PER_DIR = Number(process.env.FILES_PER_DIR ?? "8");

function scaledRows(n: number): { id: string; ref: string; loc: string; kind: string; summary: string }[] {
  const out: { id: string; ref: string; loc: string; kind: string; summary: string }[] = [];
  for (let i = 0; out.length < n; i += 1) {
    const src = real[i % real.length]!;
    const ref = String(src.source_ref);
    const dirIndex = Math.floor(i / FILES_PER_DIR);
    const scaledRef = `${path.dirname(ref)}/pkg${dirIndex}/${path.basename(ref)}`;
    out.push({
      id: `${String(src.observation_id)}-r${i}`,
      ref: scaledRef,
      loc: scaledRef,
      kind: String(src.target_material_kind),
      summary: String(src.summary ?? ""),
    });
  }
  return out;
}

// Shape 1 — today's one_line rung.
const shapeOneLine = (rows: ReturnType<typeof scaledRows>): unknown =>
  rows.map((r) => ({
    observation_id: r.id,
    target_material_kind: r.kind,
    source_ref: r.ref,
    location: r.loc,
    summary: r.summary,
  }));

// Shape 2 — one_line minus `location` (pure detail demotion, zero shape change).
const shapeNoLocation = (rows: ReturnType<typeof scaledRows>): unknown =>
  rows.map((r) => ({
    observation_id: r.id,
    target_material_kind: r.kind,
    source_ref: r.ref,
    summary: r.summary,
  }));

// Shape 3 — directory rollup: the directory prefix is emitted ONCE per directory, rows keep basenames.
// Every observation_id still appears (breadth invariant); `available_observation_ids` is untouched.
const shapeDirectoryRollup = (rows: ReturnType<typeof scaledRows>): unknown => {
  const byDir = new Map<string, { observation_id: string; name: string; kind: string; summary: string }[]>();
  for (const r of rows) {
    const dir = path.dirname(r.ref);
    const bucket = byDir.get(dir);
    const entry = { observation_id: r.id, name: path.basename(r.ref), kind: r.kind, summary: r.summary };
    if (bucket) bucket.push(entry);
    else byDir.set(dir, [entry]);
  }
  return [...byDir.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([directory, units]) => ({ directory, units }));
};

// Shape 4 — rollup without per-unit summary (summary is the last detail to go).
const shapeDirectoryRollupNoSummary = (rows: ReturnType<typeof scaledRows>): unknown => {
  const byDir = new Map<string, { observation_id: string; name: string; kind: string }[]>();
  for (const r of rows) {
    const dir = path.dirname(r.ref);
    const entry = { observation_id: r.id, name: path.basename(r.ref), kind: r.kind };
    const bucket = byDir.get(dir);
    if (bucket) bucket.push(entry);
    else byDir.set(dir, [entry]);
  }
  return [...byDir.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([directory, units]) => ({ directory, units }));
};

const SHAPES = [
  ["one_line (today's floor)", shapeOneLine],
  ["one_line − location", shapeNoLocation],
  ["directory_rollup", shapeDirectoryRollup],
  ["directory_rollup − summary", shapeDirectoryRollupNoSummary],
] as const;

console.log(`\n=== coarsest-rung headroom (budget ${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET} B) ===\n`);
const PROBE_N = 2000;
const probeRows = scaledRows(PROBE_N);
const perUnit: Record<string, number> = {};
for (const [name, shape] of SHAPES) {
  const catalog = B(shape(probeRows));
  perUnit[name] = catalog / PROBE_N;
  console.log(`${name.padEnd(28)} catalog=${String(catalog).padStart(8)} B  ${(catalog / PROBE_N).toFixed(1)} B/unit`);
}

console.log(`\nceiling = largest N where framing(${Math.round(FRAMING_FIXED)}) + ids(${IDS_BYTES_PER_UNIT.toFixed(1)}·N) + catalog(perUnit·N) ≤ budget\n`);
for (const [name] of SHAPES) {
  const ceiling = Math.floor(
    (SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET - FRAMING_FIXED) / (IDS_BYTES_PER_UNIT + perUnit[name]!),
  );
  console.log(`${name.padEnd(28)} ceiling ≈ ${ceiling.toLocaleString()} files`);
}

const idsOnlyCeiling = Math.floor(
  (SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET - FRAMING_FIXED) / IDS_BYTES_PER_UNIT,
);
console.log(
  `\nSTRUCTURAL floor — available_observation_ids ALONE (nothing else projected): ≈ ${idsOnlyCeiling.toLocaleString()} files.`,
);
console.log(
  `Only PAST that does a zoom loop (dropping ids from the catalog) become necessary — design §3.3 assumed this bound WAS the floor.`,
);
