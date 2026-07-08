/** Scan the persisted real observation for a tall column (many non-empty value-tile segments = a real
 *  over-context reduce tree) with value_shape intra_tile_notes (so anchored seams exist). LLM-0. */
import fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";

const OBS = process.env.L2_OBS ?? "/Users/kangmin/cowork/onto-mcp-claude/.onto/reconstruct/abprobe-A-with/source-observations.yaml";

function findArray(node: unknown, key: string, out: unknown[]): void {
  if (Array.isArray(node)) { for (const x of node) findArray(x, key, out); return; }
  if (node && typeof node === "object") for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === key && Array.isArray(v)) { for (const x of v) out.push(x); } else findArray(v, key, out);
  }
}

const raw = await fs.readFile(OBS, "utf8");
const obs = parseYaml(raw);
const svt: any[] = []; findArray(obs, "segmented_value_tiles", svt);
type Row = { sheet: string; col: number; nonEmptySegs: number; totalNonEmpty: number; valueShapeNotes: number; distinctShapes: number };
const rows: Row[] = [];
for (const block of svt) {
  const sheet = String(block.sheet ?? "?");
  for (const c of (block.columns ?? [])) {
    const segs = (c.segments ?? []);
    const nonEmpty = segs.filter((s: any) => s.dominant_shape !== null);
    const shapes = new Set(nonEmpty.map((s: any) => s.dominant_shape));
    const notes = (c.intra_tile_notes ?? []).filter((n: any) => n.boundary_kind === "value_shape");
    rows.push({
      sheet, col: c.column_index, nonEmptySegs: nonEmpty.length,
      totalNonEmpty: nonEmpty.reduce((a: number, s: any) => a + (s.non_empty ?? 0), 0),
      valueShapeNotes: notes.length, distinctShapes: shapes.size,
    });
  }
}
// Prefer: most non-empty segments (real over-context tree), then value_shape notes, then distinct shapes.
rows.sort((a, b) => b.nonEmptySegs - a.nonEmptySegs || b.valueShapeNotes - a.valueShapeNotes || b.distinctShapes - a.distinctShapes);
console.log(`scanned ${rows.length} columns across ${new Set(rows.map((r) => r.sheet)).size} sheet-blocks`);
console.log("top 15 by non-empty segment count:");
for (const r of rows.slice(0, 15)) {
  console.log(`  ${r.sheet}#${r.col}  nonEmptySegs=${r.nonEmptySegs}  valueShapeNotes=${r.valueShapeNotes}  distinctShapes=${r.distinctShapes}  totalNonEmpty=${r.totalNonEmpty}`);
}
