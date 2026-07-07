/**
 * B4 DETERMINISTIC budget forecast (LLM 0 — NO quota probe, NO --go path).
 * Mirrors l2-real-llm-run.mts phase-0 dispatch computation, adds seam/merge stratum split.
 * Zero spend: observeSpreadsheetSource + buildColumnLeaves + reduce + classifyFrontier are all deterministic.
 *
 * Usage: npx tsx scripts/b4-forecast.mts <source.xlsx>
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { observeSpreadsheetSource } from "../src/core-runtime/spreadsheet-structure-observer.ts";
import {
  buildColumnLeaves,
  reduceColumnLeavesWithTrace,
} from "../src/core-runtime/reconstruct/comprehension-reduce.ts";
import { classifyFrontier } from "../src/core-runtime/reconstruct/comprehension-semantic-map.ts";
import { DEFAULT_SEMANTIC_MAP_STAGE_CONFIG } from "../src/core-runtime/reconstruct/run.ts";

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[b4-forecast ${ts()}] ${m}`);

const sourceArg = process.argv[2];
if (!sourceArg) throw new Error("usage: scripts/b4-forecast.mts <source.xlsx>");
const SOURCE = sourceArg;

log("reading + hashing source (immutable snapshot)");
const bytes = await fs.readFile(SOURCE);
const sha = crypto.createHash("sha256").update(bytes).digest("hex");
log(`source sha256=${sha} (first8=${sha.slice(0, 8)}) size=${bytes.length} bytes`);

log("observeSpreadsheetSource (deterministic, streaming)...");
const t0 = Date.now();
const inv = (await observeSpreadsheetSource(SOURCE)) as {
  segmented_value_tiles?: Array<{ sheet?: string; name?: string; columns?: unknown[] }>;
};
log(`observed in ${Math.round((Date.now() - t0) / 1000)}s`);

const cfg = DEFAULT_SEMANTIC_MAP_STAGE_CONFIG;
let colCount = 0;
let dispatches = 0;
let mergeDispatch = 0; // accumulating
let leafDispatch = 0; // frontier
let seamNodes = 0; // nodes carrying value_shape seams
// 2x2 stratum cross-tab (seam/no-seam × merge/leaf) — the record's actual stratum axes (§6.2-2).
const xtab = { seam_merge: 0, seam_leaf: 0, noseam_merge: 0, noseam_leaf: 0 };
const perSheet = new Map<string, { cols: number; dispatch: number }>();

for (const sheet of inv.segmented_value_tiles ?? []) {
  const sheetName = (sheet.sheet ?? sheet.name) as string;
  for (const col of sheet.columns ?? []) {
    const leaves = buildColumnLeaves(sheetName, col as never, { leafCount: cfg.leaf_count });
    if (leaves.length === 0) continue;
    colCount += 1;
    const { trace, nodesByKey } = reduceColumnLeavesWithTrace(leaves, cfg.fanin);
    const modes = classifyFrontier(trace, cfg.over_context_budget);
    for (const [key, mode] of modes) {
      if (mode === "subsumed") continue;
      dispatches += 1;
      if (mode === "accumulating") mergeDispatch += 1;
      else leafDispatch += 1;
      // seam stratum: value-shape boundaries live on the REDUCE node (nodesByKey), not the topology
      // trace node (which only carries child_keys). This is the same source the synthesis input's
      // value_shape_seams are built from.
      const rnode = (
        nodesByKey as Map<string, { boundaries?: Array<{ boundary_kind?: string }> }>
      ).get(key);
      const hasSeam = (rnode?.boundaries ?? []).some((b) => b.boundary_kind === "value_shape");
      if (hasSeam) seamNodes += 1;
      const isMerge = mode === "accumulating";
      if (hasSeam && isMerge) xtab.seam_merge += 1;
      else if (hasSeam && !isMerge) xtab.seam_leaf += 1;
      else if (!hasSeam && isMerge) xtab.noseam_merge += 1;
      else xtab.noseam_leaf += 1;
      const cur = perSheet.get(sheetName) ?? { cols: 0, dispatch: 0 };
      cur.dispatch += 1;
      perSheet.set(sheetName, cur);
    }
    const cur = perSheet.get(sheetName) ?? { cols: 0, dispatch: 0 };
    cur.cols += 1;
    perSheet.set(sheetName, cur);
  }
}

const REPS = 3;
const ARMS = 3;
// Per fixture: `dispatches` inputs. Rows = inputs × reps × arms (upper bound; negative arm mutates inputs
// but the dispatch count per mutated input is structurally comparable). Each row ≈ 1 synth + 1 judge call.
const rowsPerFixture = dispatches * REPS * ARMS;
const synthCalls = rowsPerFixture; // 1 synth per row
const judgeCalls = rowsPerFixture; // 1 judge per decisive row (upper bound; not_run/error reduce it)
const liveCallsPerFixture = synthCalls + judgeCalls;

console.log("\n===================== B4 FORECAST (one fixture) =====================");
console.log(`source              : ${SOURCE}`);
console.log(`sha256 first8       : ${sha.slice(0, 8)}`);
console.log(`columns (non-empty) : ${colCount}`);
console.log(`synthesize dispatch : ${dispatches}   (cap ${cfg.max_synthesize_calls})`);
console.log(`  merge (accumulate): ${mergeDispatch}`);
console.log(`  leaf  (frontier)  : ${leafDispatch}`);
console.log(`  seam-carrying     : ${seamNodes}   (no-seam: ${dispatches - seamNodes})`);
console.log(`--- stratum 2x2 (decisive-eligible input availability) ---`);
console.log(`  seam   × merge : ${String(xtab.seam_merge).padStart(5)}`);
console.log(`  seam   × leaf  : ${String(xtab.seam_leaf).padStart(5)}`);
console.log(`  no-seam× merge : ${String(xtab.noseam_merge).padStart(5)}`);
console.log(`  no-seam× leaf  : ${String(xtab.noseam_leaf).padStart(5)}`);
console.log(
  `  strata held (>=5 avail): ${
    Object.entries(xtab)
      .filter(([, v]) => v >= 5)
      .map(([k]) => k)
      .join(", ") || "NONE"
  }`,
);
console.log(`\n--- cost model (reps=${REPS}, arms=${ARMS} baseline/candidate/negative) ---`);
console.log(`rows / fixture      : ${rowsPerFixture}  (= ${dispatches} × ${REPS} × ${ARMS})`);
console.log(`synth calls/fixture : ${synthCalls}`);
console.log(`judge calls/fixture : ~${judgeCalls} (upper bound)`);
console.log(`live calls/fixture  : ~${liveCallsPerFixture}`);
console.log(
  `\nfixture>=2 floor => TWO workbooks => ~${liveCallsPerFixture * 2} live calls total (order of magnitude)`,
);
console.log("\n--- per-sheet dispatch (top 15) ---");
for (const [name, s] of [...perSheet.entries()]
  .sort((a, b) => b[1].dispatch - a[1].dispatch)
  .slice(0, 15)) {
  console.log(`  ${String(s.dispatch).padStart(5)} dispatch / ${String(s.cols).padStart(3)} cols  ${name}`);
}
console.log("=====================================================================\n");
