/**
 * Scratch measurement — does an OFFSET UNION make the allowance-keyed partition machinery unnecessary?
 *
 * The claim under test: part indexes are meaningless outside their partition (which is why
 * `observation-read-coverage.ts` keys coverage by `(sha, allowance)`), but CHAR OFFSETS live in one
 * coordinate space per body, so a union of intervals is sound ACROSS partitions.
 *
 * The negative control is the measured defect the current code was built to refuse: parts from two
 * different allowances whose indexes merge into "complete" coverage across a hole. If the interval
 * union accepts that, the claim is false and the stage plan changes.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  fixObservationSnapshot,
  readObservationPage,
} from "../../../src/core-runtime/reconstruct/observation-read.js";

const FIXTURE = "/Users/kangmin/Documents/onto-mcp/scripts/fixtures/observation-catalog";
const snapshot = fixObservationSnapshot(
  readFileSync(`${FIXTURE}/source-observations.yaml`, "utf8"),
  parseYaml(readFileSync(`${FIXTURE}/source-safety-ledger.yaml`, "utf8")) as never,
);

/** Walk a request and reconstruct each served part's [start,end) by accumulating slice lengths. */
function partsWithOffsets(ids: readonly string[], budget: number) {
  const out: Array<{
    id: string;
    sha: string;
    partIndex: number;
    partCount: number;
    allowance: number;
    start: number;
    end: number;
    text: string;
  }> = [];
  const cursorAt = new Map<string, number>();
  let cursor: string | undefined;
  for (;;) {
    const page = readObservationPage({
      snapshot,
      request: cursor === undefined ? { observation_ids: [...ids] } : { cursor },
      pageCharBudget: budget,
    });
    for (const e of page.entries) {
      const start = cursorAt.get(e.observation_id) ?? 0;
      const end = start + e.body.length;
      cursorAt.set(e.observation_id, end);
      out.push({
        id: e.observation_id,
        sha: e.observation_content_sha256,
        partIndex: e.part_index,
        partCount: e.part_count,
        allowance: e.part_allowance,
        start,
        end,
        text: e.body,
      });
    }
    if (page.next_cursor === undefined) break;
    cursor = page.next_cursor;
  }
  return out;
}

/** Union of half-open intervals, merged. */
function union(intervals: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}
const coversWhole = (u: ReadonlyArray<readonly [number, number]>, len: number) =>
  u.length === 1 && u[0]![0] === 0 && u[0]![1] === len;

// ── Pick an observation big enough to split under BOTH budgets, and reproduce the two-partition case.
const target = [...snapshot.entries].sort((a, b) => b.body.length - a.body.length)[0]!;
const bodyLen = target.body.length;
console.log(`target ${target.observation_id} · body ${bodyLen.toLocaleString()} chars\n`);

// Two DIFFERENT partitions of the same body: solo request vs. grouped request (different allowance).
const others = snapshot.entries
  .filter((e) => e.observation_id !== target.observation_id)
  .slice(0, 15)
  .map((e) => e.observation_id);
const BUDGET = 65_536;
const solo = partsWithOffsets([target.observation_id], BUDGET);
const grouped = partsWithOffsets([target.observation_id, ...others], BUDGET).filter(
  (p) => p.id === target.observation_id,
);
console.log(`solo    : ${solo.length} parts @ allowance ${solo[0]!.allowance}`);
console.log(`grouped : ${grouped.length} parts @ allowance ${grouped[0]!.allowance}`);
console.log(
  `same part_count? ${solo.length === grouped.length} — different allowance? ${solo[0]!.allowance !== grouped[0]!.allowance}\n`,
);

// ── NEGATIVE CONTROL: the index-merge defect. Take the FIRST half of one partition and the SECOND
// half of the other, so the index set looks complete while the content has a hole.
// Direction matters: a HOLE needs the front from the SMALLER allowance (earlier cuts) and the back
// from the LARGER one (later starts). Taking them the other way round produces an OVERLAP, whose
// union is genuinely complete — a control that cannot fail, which is no control at all.
const [smaller, larger] = solo[0]!.allowance < grouped[0]!.allowance
  ? [solo, grouped]
  : [grouped, solo];
const half = Math.floor(smaller.length / 2);
const mixedFront = smaller.slice(0, half);
const mixedBack = larger.slice(half);
const mixedIndexes = new Set([...mixedFront, ...mixedBack].map((p) => p.partIndex));
console.log("=== negative control: cross-partition index merge ===");
console.log(
  `index-merge verdict (TODAY'S RULE, partition-blind): complete=${mixedIndexes.size === solo.length}`,
);
const mixedUnion = union([...mixedFront, ...mixedBack].map((p) => [p.start, p.end] as const));
console.log(
  `offset-union verdict: complete=${coversWhole(mixedUnion, bodyLen)} · segments=${mixedUnion.length}`,
);
if (mixedUnion.length > 1) {
  console.log(
    `  hole(s): ${mixedUnion.slice(0, -1).map((seg, i) => `[${seg[1]}, ${mixedUnion[i + 1]![0]}) = ${mixedUnion[i + 1]![0] - seg[1]} chars`).join(", ")}`,
  );
}

// ── POSITIVE CONTROL: each partition on its own must still be judged complete.
console.log("\n=== positive control: each partition alone ===");
for (const [name, parts] of [["solo", solo], ["grouped", grouped]] as const) {
  const u = union(parts.map((p) => [p.start, p.end] as const));
  console.log(`${name}: offset-union complete=${coversWhole(u, bodyLen)}`);
}

// ── THE NEW CAPABILITY: a cross-partition union that is genuinely gap-free must be ACCEPTED, where
// today's partition rule refuses it. This is what "the unit is the range" buys.
console.log("\n=== new capability: honest cross-partition union ===");
// Gap-free by construction: take the front from one partition, then from the OTHER take every part
// that reaches past where the front stopped. Overlap is fine (the union merges it); a gap is not.
const crossFront = larger.slice(0, Math.floor(larger.length / 2));
const frontEnd = crossFront[crossFront.length - 1]!.end;
const crossBack = smaller.filter((p) => p.end > frontEnd);
const crossUnion = union([...crossFront, ...crossBack].map((p) => [p.start, p.end] as const));
console.log(
  `parts from two partitions, gap-free by offsets: complete=${coversWhole(crossUnion, bodyLen)} · segments=${crossUnion.length}`,
);
console.log(
  `today's rule would refuse it (no single partition is whole): front=${crossFront.length}/${larger.length}, back=${crossBack.length}/${smaller.length}`,
);

// ── Reassembly identity: the union's text must equal the body exactly.
const reassembled = [...crossFront, ...crossBack].map((p) => p.text).join("");
console.log(
  `\nreassembled from the cross-partition union === body? ${reassembled === target.body} (${reassembled.length} vs ${bodyLen})`,
);
