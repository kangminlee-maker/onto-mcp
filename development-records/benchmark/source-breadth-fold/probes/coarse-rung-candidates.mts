/**
 * PR-4 rung selection — which coarsest rung is both (a) big-payoff and (b) MONOTONE-SAFE?
 *
 * The ladder's contract (design DW-1f) is that measured size is non-increasing as rungs coarsen. A
 * directory-rollup rung cannot serve as the FLOOR under that contract: its payoff depends on directory
 * clustering.
 *
 * CORRECTION (2026-07-25, adversarial review caught a mixed basis): this header originally read
 * "measured: 353 vs 302 B/unit". Those two numbers come from DIFFERENT probes at DIFFERENT clustering —
 * 353.5 is rollup at 1 file/dir (this file), 301.6 is `one_line − location` at 8 files/dir
 * (`rollup-rung-headroom.mts`) — and they relativize differently, so the pair does not stand. On the
 * single basis this probe prints (1 file/dir): rollup 353.5 is SMALLER than `one_line` 452.2 and LARGER
 * than the anchor rung's 157.3. So rollup was never non-monotone against the pre-PR-4b ladder — only
 * against the rungs that now sit beneath it, which is what disqualifies it as a floor.
 *
 * The decisive property is the invariant's CHARACTER, not one comparison: across 1 → 8 files/dir rollup
 * moves 353.5 → 251.2 B/unit (29%, corpus-dependent) while every derived rung moves 157.3 → 156.4
 * (0.6%, constructional). A floor must not depend on corpus shape.
 *
 * Candidates that are monotone-safe BY CONSTRUCTION (strict field subsets, or a strictly shorter string
 * for the same field) are measured here against the real corpus at two clustering extremes.
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
const real = (
  parseYaml(await fs.readFile(path.join(BENCH, "source-observations.yaml"), "utf8")) as {
    observations: AnyRecord[];
  }
).observations;

const IDS_BYTES_PER_UNIT = 62_892 / 2000;
const FRAMING_FIXED = 1_018_497 - 891_603 - 62_892;
const B = (v: unknown) => Buffer.byteLength(JSON.stringify(v, null, 2), "utf8");

type Row = { id: string; ref: string; loc: string; kind: string; summary: string };

function scaledRows(n: number, filesPerDir: number): Row[] {
  const out: Row[] = [];
  for (let i = 0; out.length < n; i += 1) {
    const src = real[i % real.length]!;
    const ref = String(src.source_ref);
    const scaledRef = `${path.dirname(ref)}/pkg${Math.floor(i / filesPerDir)}/${path.basename(ref)}`;
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

/** Longest shared directory prefix across all refs — emitted once, every ref becomes relative to it. */
function commonRoot(rows: Row[]): string {
  const segs = rows.map((r) => r.ref.split("/"));
  const first = segs[0]!;
  let i = 0;
  for (; i < first.length - 1; i += 1) {
    if (!segs.every((s) => s[i] === first[i])) break;
  }
  return first.slice(0, i).join("/");
}

const SHAPES: [string, (rows: Row[]) => unknown, string][] = [
  [
    "one_line (today's floor)",
    (rows) =>
      rows.map((r) => ({
        observation_id: r.id,
        target_material_kind: r.kind,
        source_ref: r.ref,
        location: r.loc,
        summary: r.summary,
      })),
    "—",
  ],
  [
    "…+ root-relative refs",
    (rows) => {
      const root = commonRoot(rows);
      return {
        source_root: root,
        observations: rows.map((r) => ({
          observation_id: r.id,
          target_material_kind: r.kind,
          source_ref: path.relative(root, r.ref),
          location: path.relative(root, r.loc),
          summary: r.summary,
        })),
      };
    },
    "monotone: same fields, strictly shorter strings + 1 root line",
  ],
  [
    "…− location",
    (rows) => {
      const root = commonRoot(rows);
      return {
        source_root: root,
        observations: rows.map((r) => ({
          observation_id: r.id,
          target_material_kind: r.kind,
          source_ref: path.relative(root, r.ref),
          summary: r.summary,
        })),
      };
    },
    "monotone: strict field subset",
  ],
  [
    "…− summary  (anchor rung)",
    (rows) => {
      const root = commonRoot(rows);
      return {
        source_root: root,
        observations: rows.map((r) => ({
          observation_id: r.id,
          target_material_kind: r.kind,
          source_ref: path.relative(root, r.ref),
        })),
      };
    },
    "monotone: strict field subset",
  ],
  [
    "directory_rollup (design PR-4)",
    (rows) => {
      const byDir = new Map<string, unknown[]>();
      for (const r of rows) {
        const dir = path.dirname(r.ref);
        const entry = { observation_id: r.id, name: path.basename(r.ref), kind: r.kind, summary: r.summary };
        const bucket = byDir.get(dir);
        if (bucket) bucket.push(entry);
        else byDir.set(dir, [entry]);
      }
      return [...byDir.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([directory, units]) => ({ directory, units }));
    },
    "NOT monotone: clustering-dependent",
  ],
];

const PROBE_N = 2000;
for (const filesPerDir of [1, 8]) {
  const rows = scaledRows(PROBE_N, filesPerDir);
  console.log(`\n=== ${filesPerDir} file(s)/directory (root = ${commonRoot(rows).length} chars) ===`);
  for (const [name, shape, note] of SHAPES) {
    const catalog = B(shape(rows));
    const perUnit = catalog / PROBE_N;
    const ceiling = Math.floor(
      (SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET - FRAMING_FIXED) / (IDS_BYTES_PER_UNIT + perUnit),
    );
    console.log(
      `  ${name.padEnd(30)} ${perUnit.toFixed(1).padStart(6)} B/unit   ceiling ≈ ${ceiling.toLocaleString().padStart(7)} files   ${note}`,
    );
  }
}

// The id list is repeated verbatim in `available_observation_ids`; measure the true structural floor.
console.log(
  `\nstructural floor (available_observation_ids alone) ≈ ${Math.floor((SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET - FRAMING_FIXED) / IDS_BYTES_PER_UNIT).toLocaleString()} files`,
);
