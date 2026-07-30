/**
 * Scratch measurement — what the RANGE contract costs, in the production representation.
 *
 * Uses the real reader and the real committed fixture. No re-measuring with a foreign serializer:
 * every number below comes from `JSON.stringify` through `readObservationPage`.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  fixObservationSnapshot,
  readObservationPage,
  type ObservationSnapshot,
} from "../../../src/core-runtime/reconstruct/observation-read.js";

const FIXTURE = "/Users/kangmin/Documents/onto-mcp/scripts/fixtures/observation-catalog";
const observationsText = readFileSync(`${FIXTURE}/source-observations.yaml`, "utf8");
const ledger = parseYaml(readFileSync(`${FIXTURE}/source-safety-ledger.yaml`, "utf8")) as never;

const snapshot: ObservationSnapshot = fixObservationSnapshot(observationsText, ledger);
console.log(`snapshot entries: ${snapshot.entries.length}`);

const bodies = snapshot.entries.map((e) => ({ id: e.observation_id, chars: e.body.length }));
bodies.sort((a, b) => b.chars - a.chars);
const total = bodies.reduce((s, b) => s + b.chars, 0);
console.log(`total body chars: ${total.toLocaleString()}`);
console.log(`largest: ${bodies[0]!.id} = ${bodies[0]!.chars.toLocaleString()}`);
console.log(`smallest: ${bodies[bodies.length - 1]!.chars.toLocaleString()}`);
const sorted = [...bodies].sort((a, b) => a.chars - b.chars);
console.log(`median: ${sorted[Math.floor(sorted.length / 2)]!.chars.toLocaleString()}`);

/** Walk one request to exhaustion, reporting page count and the largest serialized page. */
function walk(ids: readonly string[], budget: number) {
  let cursor: string | undefined;
  let pages = 0;
  let maxSerialized = 0;
  let entries = 0;
  let allowance = 0;
  for (;;) {
    const page = readObservationPage({
      snapshot,
      request: cursor === undefined ? { observation_ids: [...ids] } : { cursor },
      pageCharBudget: budget,
    });
    pages += 1;
    entries += page.entries.length;
    allowance = page.entries[0]?.part_allowance ?? allowance;
    maxSerialized = Math.max(maxSerialized, JSON.stringify(page).length);
    if (page.next_cursor === undefined) break;
    cursor = page.next_cursor;
  }
  return { pages, maxSerialized, entries, allowance };
}

const largestId = bodies[0]!.id;
const allIds = snapshot.entries.map((e) => e.observation_id);

console.log("\n=== solo walk of the LARGEST observation ===");
console.log("budget | pages | parts | allowance | max serialized page");
for (const budget of [65_536, 40_000, 32_000, 24_000, 16_000, 8_192, 4_096]) {
  const r = walk([largestId], budget);
  console.log(
    `${budget} | ${r.pages} | ${r.entries} | ${r.allowance} | ${r.maxSerialized}`,
  );
}

console.log("\n=== whole corpus, 16 ids per request (the contract cap) ===");
console.log("budget | requests | pages | calls(=pages) | max serialized page");
for (const budget of [65_536, 40_000, 32_000, 24_000, 16_000]) {
  let pages = 0;
  let maxSerialized = 0;
  let requests = 0;
  for (let i = 0; i < allIds.length; i += 16) {
    const r = walk(allIds.slice(i, i + 16), budget);
    pages += r.pages;
    requests += 1;
    maxSerialized = Math.max(maxSerialized, r.maxSerialized);
  }
  console.log(`${budget} | ${requests} | ${pages} | ${pages} | ${maxSerialized}`);
}

/**
 * What the RANGE fields add to per-entry framing. Mirrors `entryFramingChars` exactly, then adds the
 * proposed fields at their worst case (10-digit sentinel offsets, 64-hex range sha, opaque range id).
 */
const PART_SENTINEL = 9_999_999_999;
function framing(extra: Record<string, unknown>): number {
  return JSON.stringify({
    observation_id: "obs_0123456789abcdef",
    observation_content_sha256: "a".repeat(64),
    part_index: PART_SENTINEL,
    part_count: PART_SENTINEL,
    part_allowance: PART_SENTINEL,
    ...extra,
    body: "",
  }).length;
}
console.log("\n=== per-entry framing cost of the range contract ===");
const base = framing({});
console.log(`today                              : ${base}`);
console.log(
  `+ body_start/body_end              : ${framing({ body_start: PART_SENTINEL, body_end: PART_SENTINEL })} (+${framing({ body_start: PART_SENTINEL, body_end: PART_SENTINEL }) - base})`,
);
const withSha = framing({
  body_start: PART_SENTINEL,
  body_end: PART_SENTINEL,
  range_content_sha256: "a".repeat(64),
});
console.log(`+ range_content_sha256             : ${withSha} (+${withSha - base})`);
// Opaque id, compact form: prefix + 32 hex of a digest over the canonical range tuple.
const withOpaque = framing({
  body_start: PART_SENTINEL,
  body_end: PART_SENTINEL,
  range_content_sha256: "a".repeat(64),
  range_id: `orng_v1_${"a".repeat(32)}`,
});
console.log(`+ range_id (compact, 8+32)         : ${withOpaque} (+${withOpaque - base})`);
// Opaque id, self-describing form: prefix + base64url of the whole tuple.
const selfDescribing = Buffer.from(
  JSON.stringify(["obs_0123456789abcdef", "a".repeat(64), 9_999_999_999, 9_999_999_999, "a".repeat(64)]),
  "utf8",
).toString("base64url");
const withSelf = framing({
  body_start: PART_SENTINEL,
  body_end: PART_SENTINEL,
  range_content_sha256: "a".repeat(64),
  range_id: `orng_v1_${selfDescribing}`,
});
console.log(
  `+ range_id (self-describing, ${selfDescribing.length} ch) : ${withSelf} (+${withSelf - base})`,
);
