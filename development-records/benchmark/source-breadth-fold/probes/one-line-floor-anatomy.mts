/**
 * What actually binds at the `one_line` floor? (design §8 PR-4 scoping probe)
 *
 * PR-4 proposes a directory-topology ROLLUP rung below one_line. That only helps if the bytes at the
 * one_line floor are dominated by things a rollup can demote (per-observation summary/location) rather
 * than by things it cannot (the `available_observation_ids` list, which must stay complete for every id
 * to remain selectable). Measure the split over the REAL corpus scaled to the floor.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createDirectCallReconstructDirectiveAuthor } from "../../../src/core-runtime/reconstruct/run.ts";
import { SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET } from "../../../src/core-runtime/reconstruct/source-breadth-fold.ts";

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

const sourceObservations = await loadYaml<{ observations: AnyRecord[] }>("source-observations.yaml");
const targetMaterialProfile = await loadYaml<unknown>("target-material-profile.yaml");
const sourceScoutPack = await loadYaml<unknown>("source-scout-pack.yaml");
const sourceScoutPackValidation = await loadYaml<unknown>("source-scout-pack-validation.yaml");

const real = sourceObservations.observations;
console.log(`\n=== one_line floor anatomy (real ${real.length}-observation corpus, scaled) ===`);

function scaled(n: number): { observations: AnyRecord[] } {
  const out: AnyRecord[] = [];
  for (let i = 0; out.length < n; i += 1) {
    const src = real[i % real.length]!;
    out.push({
      ...src,
      observation_id: `${String(src.observation_id)}-r${i}`,
      source_ref: `${String(src.source_ref)}.r${i}.ts`,
    });
  }
  return { observations: out };
}

function capture(n: number) {
  const dispatched: { systemPrompt: string; userPrompt: string }[] = [];
  const author = createDirectCallReconstructDirectiveAuthor({
    sourceBreadthFold: true,
    llmCall: (systemPrompt: string, userPrompt: string) => {
      dispatched.push({ systemPrompt, userPrompt });
      const payload = JSON.parse(userPrompt) as { available_observation_ids: string[] };
      return Promise.resolve({
        text: JSON.stringify({
          selected_observations: [
            { observation_id: payload.available_observation_ids[0], selection_rationale: "probe" },
          ],
          open_questions: [],
        }),
      });
    },
  });
  return { author, dispatched, input: {
    sessionId: "floor-anatomy",
    intent: INTENT,
    targetMaterialProfile,
    sourceObservations: scaled(n),
    sourceScoutPack,
    sourceScoutPackValidation,
    sourceScoutPackRef: path.join(BENCH, "source-scout-pack.yaml"),
    sourceScoutPackValidationRef: path.join(BENCH, "source-scout-pack-validation.yaml"),
  } as never };
}

const B = (v: unknown) => Buffer.byteLength(JSON.stringify(v, null, 2), "utf8");

for (const n of [1000, 2000, 2100, 3000, 5000]) {
  const { author, dispatched, input } = capture(n);
  let threw: string | null = null;
  try {
    await author.writeSourceObservationDirective(input);
  } catch (error) {
    threw = (error as Error).message;
  }
  const disclosure = (author as { sourceBreadthFoldDisclosures?: { fold_level: string }[] })
    .sourceBreadthFoldDisclosures?.[0];
  if (dispatched.length === 0) {
    console.log(`N=${String(n).padStart(5)}  THREW  ${threw?.slice(0, 90)}`);
    continue;
  }
  const p = JSON.parse(dispatched[0]!.userPrompt) as AnyRecord;
  const total = Buffer.byteLength(dispatched[0]!.userPrompt, "utf8");
  const ids = B(p.available_observation_ids);
  const obs = B(p.source_observations);
  const scout = B(p.source_scout_pack);
  const rest = total - ids - obs - scout;
  const rows = p.source_observations as AnyRecord[];
  const perRow = Math.round(obs / rows.length);
  console.log(
    `N=${String(n).padStart(5)}  total=${String(total).padStart(8)}  ids=${String(ids).padStart(7)} (${((ids / total) * 100).toFixed(1)}%)  obs=${String(obs).padStart(8)} (${((obs / total) * 100).toFixed(1)}%, ${perRow} B/row)  scout=${scout}  rest=${rest}  rung=${disclosure?.fold_level ?? "full(no disclosure)"}`,
  );
  if (n === 2000) {
    console.log(`      one_line row sample: ${JSON.stringify(rows[0])}`);
    const idLen = (p.available_observation_ids as string[])[0]!.length;
    console.log(`      observation_id length: ${idLen} chars`);
  }
}

console.log(`\nbudget = ${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET} B`);
console.log(
  `\nWhat a directory rollup rung COULD remove: the per-row summary/location detail (obs%).`,
);
console.log(
  `What it CANNOT remove without breaking "every id selectable": available_observation_ids (ids%).`,
);
