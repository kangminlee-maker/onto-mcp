/**
 * What the rendered-result budget does to the real corpus — the arithmetic S4′ rests on.
 *
 * Two questions, both decision-relevant and neither answerable from a ratio:
 *
 *   1. Does every page the reader can emit now render UNDER the measured clip (40,149)? The old budget
 *      bounded the page and failed this on 4 of 4 live pages; this run must show the largest rendered
 *      result across the whole corpus sitting under the budget, and the budget under the clip.
 *   2. Does ③'s premise hold — is there an observation whose page count EXCEEDS the call limit? That is
 *      what makes "the worker cannot read it whole" a structural guarantee rather than a prompt request
 *      (design `26-design-live-citation-arm.md` §3). If no such observation exists, ③ falls back to §8-1.
 *
 *   npx tsx development-records/benchmark/20260731-range-delivery-live-probe/measure-rendered-budget.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  fixObservationSnapshot,
  observationReadToolResult,
  readObservationPage,
} from "../../../src/core-runtime/reconstruct/observation-read.ts";
import {
  OBSERVATION_READ_MAX_CALLS,
  OBSERVATION_READ_RESULT_CHAR_BUDGET,
} from "../../../src/core-runtime/reconstruct/observation-read-grant.ts";
import type { ReconstructSourceSafetyLedgerArtifact } from "../../../src/core-runtime/reconstruct/artifact-types.ts";

/** The clip point, measured across a 22-rollout sweep of one day's real transcripts (README §3차). */
const MEASURED_CLIP_CHARS = 40_149;

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "scripts/fixtures/observation-catalog");

const snapshot = fixObservationSnapshot(
  readFileSync(path.join(FIXTURE_DIR, "source-observations.yaml"), "utf8"),
  parseYaml(
    readFileSync(path.join(FIXTURE_DIR, "source-safety-ledger.yaml"), "utf8"),
  ) as ReconstructSourceSafetyLedgerArtifact,
);

console.log(
  `budget ${OBSERVATION_READ_RESULT_CHAR_BUDGET.toLocaleString()} rendered chars · ` +
    `call limit ${OBSERVATION_READ_MAX_CALLS} · corpus ${snapshot.entries.length} observations\n`,
);

const rows = snapshot.entries.map((entry) => {
  let cursor: string | undefined;
  let pages = 0;
  let maxRendered = 0;
  /** The serialized page that produced `maxRendered` — the two must be compared on the SAME page. */
  let pageCharsAtMax = 0;
  for (;;) {
    const page = readObservationPage({
      snapshot,
      request: cursor === undefined ? { observation_ids: [entry.observation_id] } : { cursor },
      resultCharBudget: OBSERVATION_READ_RESULT_CHAR_BUDGET,
    });
    pages += 1;
    const rendered = JSON.stringify(observationReadToolResult(page)).length;
    if (rendered > maxRendered) {
      maxRendered = rendered;
      pageCharsAtMax = JSON.stringify(page).length;
    }
    cursor = page.next_cursor;
    if (cursor === undefined) break;
  }
  return { id: entry.observation_id, bodyChars: entry.body.length, pages, maxRendered, pageCharsAtMax };
});

rows.sort((left, right) => right.pages - left.pages);
console.log("largest by page count (each observation fetched alone):");
for (const row of rows.slice(0, 4)) {
  console.log(
    `  ${row.id}  body ${row.bodyChars.toLocaleString().padStart(9)}  ` +
      `pages ${String(row.pages).padStart(4)}  max rendered ${row.maxRendered.toLocaleString()}`,
  );
}

const overCallLimit = rows.filter((row) => row.pages > OBSERVATION_READ_MAX_CALLS);
console.log(
  `\n③ premise — observations needing MORE than ${OBSERVATION_READ_MAX_CALLS} calls: ` +
    `${overCallLimit.length}` +
    (overCallLimit.length > 0
      ? ` → HOLDS (${overCallLimit.map((row) => `${row.id} @ ${row.pages}p`).join(", ")})`
      : " → FAILS, fall back to design §8-1"),
);

const maxRendered = Math.max(...rows.map((row) => row.maxRendered));
console.log(
  `\nlargest rendered result anywhere: ${maxRendered.toLocaleString()} ` +
    `(${((maxRendered / OBSERVATION_READ_RESULT_CHAR_BUDGET) * 100).toFixed(1)}% of budget)`,
);
console.log(
  `  over the budget? ${maxRendered > OBSERVATION_READ_RESULT_CHAR_BUDGET ? "YES — DEFECT" : "no"}` +
    ` · over the measured clip ${MEASURED_CLIP_CHARS.toLocaleString()}? ` +
    `${maxRendered > MEASURED_CLIP_CHARS ? "YES — DEFECT" : "no"}`,
);

// The contrast that makes the above mean something: under the OLD unit a page was allowed to be as
// large as the budget itself, so a 38,000-char page would render to roughly twice that and be clipped.
// Without this line the run reads as "everything fits" without showing what was fixed.
const ratios = rows.filter((row) => row.pageCharsAtMax > 0).map((row) => row.maxRendered / row.pageCharsAtMax);
const worstRatio = Math.max(...ratios);
const bestRatio = Math.min(...ratios);
console.log(
  `\ncontrast — the page→result ratio is NOT a constant, which is why the cost model counts characters ` +
    `instead of dividing: observed ${bestRatio.toFixed(2)}x to ${worstRatio.toFixed(2)}x across the corpus.`,
);
console.log(
  `  a PAGE budget of ${OBSERVATION_READ_RESULT_CHAR_BUDGET.toLocaleString()} would therefore render up to ` +
    `${Math.round(OBSERVATION_READ_RESULT_CHAR_BUDGET * worstRatio).toLocaleString()} chars — ` +
    `${Math.round(OBSERVATION_READ_RESULT_CHAR_BUDGET * worstRatio) > MEASURED_CLIP_CHARS ? "over" : "under"}` +
    ` the clip.`,
);
// Why a divisor is not merely inelegant. The ratio is a property of the CONTENT, and its ceiling is 3x
// (a body of nothing but `"` or `\`: 2 page chars each, 6 rendered). A budget derived by dividing the
// clip by this corpus's 2.27x would hold for this corpus and silently under-reserve for a quote-dense
// one — the same shape of mistake as sizing the page, one level up. Per-character accounting has no
// such gap, which is the reason to pay for it.
console.log(
  `  the ratio's ceiling is 3.00x (a body of only \`"\`/\`\\\\\`), so a divisor fitted to this corpus ` +
    `would under-reserve on a quote-denser one; per-character accounting has no such gap.`,
);
