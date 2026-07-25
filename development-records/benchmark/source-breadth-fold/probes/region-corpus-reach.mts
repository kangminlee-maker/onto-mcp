/**
 * PR-4b — what the tail rungs buy on a REGION-decomposed corpus, where the redundancy predicate keeps
 * `location`.
 *
 * The headline 1.72× was measured on the real Stage-2 corpus, which is 59/59 whole-file observations —
 * `location` is byte-identical to `source_ref` on every row, so `summary_anchor` drops it and pays. Under
 * `source_region_decomposition` that stops being true: N regions of one file share a `source_ref` and are
 * told apart only by a short `L<a>-<b>` token, so the predicate keeps it and `summary_anchor` becomes a
 * NO-OP on those rows. This measures the resulting reach honestly instead of extrapolating the
 * whole-file number onto a corpus that does not have that shape.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { observationPromptPayload } from "../../../src/core-runtime/reconstruct/run.ts";
import {
  projectBreadthFoldTailRung,
  SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
} from "../../../src/core-runtime/reconstruct/source-breadth-fold.ts";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const BENCH = path.join(
  REPO_ROOT,
  ".onto/temp/stage2-value-bench-2026-07-22T17-45-58-944Z/off/.onto/reconstruct/session",
);
const REGIONS_PER_FILE = 8; // MAX_PROJECTED_REGIONS_PER_FILE (run.ts) — the cap a real decomposed run hits

type AnyRecord = Record<string, unknown>;
const artifact = parseYaml(
  await fs.readFile(path.join(BENCH, "source-observations.yaml"), "utf8"),
) as AnyRecord & { observations: AnyRecord[] };
const real = artifact.observations;

/** Whole-file corpus at N (today's shape): `location` === `source_ref` on every row. */
const wholeFile = (n: number): AnyRecord[] =>
  Array.from({ length: n }, (_, i) => {
    const src = real[i % real.length]!;
    return {
      ...src,
      observation_id: `${String(src.observation_id)}-r${i}`,
      source_ref: `${String(src.source_ref)}.r${i}.ts`,
      location: `${String(src.source_ref)}.r${i}.ts`,
    };
  });

/** Region corpus at N observations: ceil(N / REGIONS_PER_FILE) files, each decomposed into regions. */
const regionDecomposed = (n: number): AnyRecord[] => {
  const out: AnyRecord[] = [];
  for (let f = 0; out.length < n; f += 1) {
    const src = real[f % real.length]!;
    const source_ref = `${String(src.source_ref)}.f${f}.ts`;
    for (let r = 0; r < REGIONS_PER_FILE && out.length < n; r += 1) {
      out.push({
        ...src,
        observation_id: `${String(src.observation_id)}-f${f}r${r}`,
        source_ref,
        location: `L${r * 40 + 1}-${r * 40 + 40}`,
        region_line_start: r * 40 + 1,
        region_line_end: r * 40 + 40,
      });
    }
  }
  return out;
};

const rowsAt = (observations: AnyRecord[]): unknown[] =>
  observationPromptPayload({ ...artifact, observations } as never, {
    observationIds: observations.map((o) => String(o.observation_id)),
    includeStructuralData: false,
  }) as unknown[];

const b = (v: unknown): number => Buffer.byteLength(JSON.stringify(v, null, 2), "utf8");

console.log("\n=== PR-4b reach: whole-file corpus vs region-decomposed corpus ===\n");
console.log(`budget = ${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET.toLocaleString()} bytes`);
console.log(`regions/file = ${REGIONS_PER_FILE} (MAX_PROJECTED_REGIONS_PER_FILE)\n`);

const N = 2000;
for (const [label, build] of [
  ["whole-file", wholeFile],
  ["region-decomposed", regionDecomposed],
] as const) {
  const rows = rowsAt(build(N));
  const one = b(rows);
  const mid = b(projectBreadthFoldTailRung(rows, "summary_anchor"));
  const leaf = b(projectBreadthFoldTailRung(rows, "anchor"));
  const per = (v: number) => (v / N).toFixed(1);
  console.log(`${label} (N=${N.toLocaleString()} observations):`);
  console.log(
    `  one_line ${per(one)} → summary_anchor ${per(mid)} → anchor ${per(leaf)} B/row` +
      `   non-increasing: ${one >= mid && mid >= leaf ? "HOLDS" : "VIOLATED"}`,
  );
  console.log(
    `  summary_anchor saves ${(((one - mid) / one) * 100).toFixed(1)}%, ` +
      `anchor saves ${(((one - leaf) / one) * 100).toFixed(1)}% vs one_line` +
      `  → reach gain ${(one / leaf).toFixed(2)}×\n`,
  );
}

// The substance check the byte numbers cannot make: are region siblings still separable at the floor?
const regionRows = rowsAt(regionDecomposed(64)) as AnyRecord[];
const floor = projectBreadthFoldTailRung(regionRows, "anchor") as AnyRecord[];
const firstFileRef = floor[0]!.source_ref;
const siblings = floor.filter((r) => r.source_ref === firstFileRef);
const distinct = new Set(
  siblings.map((r) => JSON.stringify(Object.entries(r).filter(([k]) => k !== "observation_id"))),
);
console.log(
  `region siblings at the floor: ${siblings.length} rows of one file → ${distinct.size} distinguishable ` +
    `ignoring observation_id  (${siblings.length === distinct.size ? "SEPARABLE" : "COLLAPSED"})`,
);
