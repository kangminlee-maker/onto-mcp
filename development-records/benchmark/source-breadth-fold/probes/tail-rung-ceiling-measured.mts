/**
 * PR-4b — measure the SHIPPED tail rungs' ceilings end-to-end, not by extrapolation.
 *
 * The FRONTIER packet carried an ESTIMATE (≈3,690 observations at the anchor rung) derived from an
 * average row size against a hand-built row shape. This measures what the implementation actually
 * emits: binary-search N over the REAL author with `source_breadth_fold` ON, where "fits" means the
 * always-on byte guard let the dispatch through. That figure needs no extrapolation now — the anchor
 * rung is inside the guard's reach by construction (it is the rung the guard permits last).
 *
 * The one_line ceiling (the ladder's floor BEFORE PR-4b) is measured on the same corpus by capturing a
 * real dispatch payload and swapping in the real `one_line` projection — the same fixed framing, the
 * same id list, only the catalog rows differ. That keeps the two numbers on a common basis.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  createDirectCallReconstructDirectiveAuthor,
  observationPromptPayload,
} from "../../../src/core-runtime/reconstruct/run.ts";
import {
  projectBreadthFoldTailRung,
  SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
} from "../../../src/core-runtime/reconstruct/source-breadth-fold.ts";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const BENCH = path.join(
  REPO_ROOT,
  ".onto/temp/stage2-value-bench-2026-07-22T17-45-58-944Z/off/.onto/reconstruct/session",
);
const INTENT =
  "Reconstruct the conversational API surface of this SDK: how chat completions, responses, " +
  "realtime sessions, and conversations relate — messages, roles, tool and function calls, " +
  "streaming, and their parameters and result shapes.";

type AnyRecord = Record<string, unknown>;
const loadYaml = async <T,>(rel: string): Promise<T> =>
  parseYaml(await fs.readFile(path.join(BENCH, rel), "utf8")) as T;

const artifact = await loadYaml<AnyRecord & { observations: AnyRecord[] }>("source-observations.yaml");
const real = artifact.observations;
const targetMaterialProfile = await loadYaml<unknown>("target-material-profile.yaml");
const sourceScoutPack = await loadYaml<unknown>("source-scout-pack.yaml");
const sourceScoutPackValidation = await loadYaml<unknown>("source-scout-pack-validation.yaml");

/** Scale the real corpus to N by replication, keeping ids and refs distinct (a real corpus's shape). */
const scaled = (n: number): AnyRecord[] => {
  const out: AnyRecord[] = [];
  for (let i = 0; out.length < n; i += 1) {
    const src = real[i % real.length]!;
    out.push({
      ...src,
      observation_id: `${String(src.observation_id)}-r${i}`,
      source_ref: `${String(src.source_ref)}.r${i}.ts`,
      location: `${String(src.location)}.r${i}.ts`,
    });
  }
  return out;
};

const scaledArtifact = (n: number) => ({ ...artifact, observations: scaled(n) });

/** Dispatch through the REAL author with the fold ON; capture the payload, or null if the guard refused. */
async function capture(
  n: number,
): Promise<{ payload: AnyRecord; system: string; foldNote: string | null } | null> {
  const seen: { systemPrompt: string; userPrompt: string }[] = [];
  const author = createDirectCallReconstructDirectiveAuthor({
    sourceBreadthFold: true,
    llmCall: (systemPrompt: string, userPrompt: string) => {
      seen.push({ systemPrompt, userPrompt });
      const p = JSON.parse(userPrompt) as { available_observation_ids: string[] };
      return Promise.resolve({
        text: JSON.stringify({
          selected_observations: [
            { observation_id: p.available_observation_ids[0], selection_rationale: "probe" },
          ],
          open_questions: [],
        }),
        input_tokens: 0,
        output_tokens: 0,
        model_id: "probe",
      });
    },
  });
  let foldNote: string | null = null;
  try {
    const directive = await author.writeSourceObservationDirective({
      sessionId: "tail-rung-ceiling",
      intent: INTENT,
      targetMaterialProfile,
      sourceObservations: scaledArtifact(n),
      sourceScoutPack,
      sourceScoutPackValidation,
      sourceScoutPackRef: path.join(BENCH, "source-scout-pack.yaml"),
      sourceScoutPackValidationRef: path.join(BENCH, "source-scout-pack-validation.yaml"),
    } as never);
    foldNote = directive.open_questions.find((q: string) => q.includes("folded the source")) ?? null;
  } catch {
    return null;
  }
  const captured = seen[0]!;
  return {
    payload: JSON.parse(captured.userPrompt) as AnyRecord,
    system: captured.systemPrompt,
    foldNote,
  };
}

const measure = (system: string, payload: AnyRecord): number =>
  Buffer.byteLength(system, "utf8") + Buffer.byteLength(JSON.stringify(payload, null, 2), "utf8");

const rungOf = (note: string | null): string =>
  note ? (/to '([a-z_]+)'/.exec(note)?.[1] ?? "?") : "full";

/** Largest N satisfying `fits`, by binary search. */
async function ceiling(fits: (n: number) => Promise<boolean>, hi: number): Promise<number> {
  let lo = 1;
  let best = 0;
  let high = hi;
  while (lo <= high) {
    const mid = Math.floor((lo + high) / 2);
    if (await fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

console.log("\n=== PR-4b tail-rung ceilings — measured through the shipped fold ===\n");
console.log(`budget = ${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET.toLocaleString()} bytes\n`);

// (1) The SHIPPED ceiling: largest N the real author still dispatches with the fold ON.
const shippedCeiling = await ceiling(async (n) => (await capture(n)) !== null, 12000);
const atCeiling = await capture(shippedCeiling);
const justOver = await capture(shippedCeiling + 1);
console.log(
  `shipped ladder ceiling = ${shippedCeiling.toLocaleString()} observations ` +
    `(rung reached: '${rungOf(atCeiling?.foldNote ?? null)}'), N+1 dispatches: ${justOver !== null}`,
);

// (2) The PRE-PR-4b ceiling on the SAME corpus: same framing, catalog projected at `one_line`.
const oneLineRowsAt = (n: number): unknown[] => {
  const a = scaledArtifact(n);
  return observationPromptPayload(a as never, {
    observationIds: a.observations.map((o) => String(o.observation_id)),
    includeStructuralData: false,
  }) as unknown[];
};
const fitsAtRows = (base: { system: string; payload: AnyRecord }, rows: unknown[]): boolean =>
  measure(base.system, { ...base.payload, source_observations: rows }) <=
  SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET;

const oneLineCeiling = await ceiling(async (n) => {
  const base = await capture(n);
  if (!base) return false; // beyond the shipped ceiling one_line is certainly over too
  return fitsAtRows(base, oneLineRowsAt(n));
}, shippedCeiling);
const summaryAnchorCeiling = await ceiling(async (n) => {
  const base = await capture(n);
  if (!base) return false;
  return fitsAtRows(base, projectBreadthFoldTailRung(oneLineRowsAt(n), "summary_anchor"));
}, shippedCeiling);

console.log(`  one_line       ceiling = ${oneLineCeiling.toLocaleString()}   (the floor BEFORE PR-4b)`);
console.log(`  summary_anchor ceiling = ${summaryAnchorCeiling.toLocaleString()}`);
console.log(`  anchor         ceiling = ${shippedCeiling.toLocaleString()}   (the floor AFTER PR-4b)`);
console.log(
  `\nreach gain = ${(shippedCeiling / oneLineCeiling).toFixed(2)}×  ` +
    `(packet ESTIMATE was ≈3,690 at the anchor rung)`,
);

// (3) Non-increasing invariant on the real rows at the ceiling — assert, do not assume.
const base = await capture(oneLineCeiling);
if (base) {
  const rows = oneLineRowsAt(oneLineCeiling);
  const b = (v: unknown) => Buffer.byteLength(JSON.stringify(v, null, 2), "utf8");
  const one = b(rows);
  const mid = b(projectBreadthFoldTailRung(rows, "summary_anchor"));
  const leaf = b(projectBreadthFoldTailRung(rows, "anchor"));
  console.log(
    `\nnon-increasing at N=${oneLineCeiling.toLocaleString()}: one_line ${one.toLocaleString()} → ` +
      `summary_anchor ${mid.toLocaleString()} → anchor ${leaf.toLocaleString()}  ` +
      `(${one > mid && mid > leaf ? "HOLDS" : "VIOLATED"})`,
  );
  console.log(
    `  per-row: ${Math.round(one / rows.length)} → ${Math.round(mid / rows.length)} → ${Math.round(leaf / rows.length)} B`,
  );
}
