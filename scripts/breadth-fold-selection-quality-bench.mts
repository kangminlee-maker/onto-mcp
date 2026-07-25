/**
 * Value bench — does a COARSE fold rung degrade which files the selecting LLM picks? (design §9)
 *
 * §9 rules coarse-rung selection quality NON-GATING and argues the counterfactual in the overflow band
 * is a total failure, not a better pick. That argument is sound but unmeasured; this measures it.
 *
 * The hard part is a COMMON BASIS. A rung is reached only under overflow, so the naive comparison
 * ("run a big corpus at full vs one_line") cannot exist — at full the big corpus does not dispatch at
 * all. Varying corpus size to force a rung would vary the very thing being compared.
 *
 * The seam that makes it measurable: `projectObservationsForPrompt` is a pure per-row map — each row's
 * projection depends only on its own observation (the directive caller sets neither
 * `expandSingleDocumentExcerpt` nor a document budget, so the set-dependent branches are inert, and the
 * per-file region cap is per-file). Therefore the rows a SUBSET would have produced at a given rung are
 * byte-identical to that subset's rows inside a LARGER corpus projected at the same rung. So:
 *   1. pick a subset S that fits at `full`,
 *   2. capture S's catalog at `full` directly,
 *   3. capture the coarse catalogs by replicating S until the fold lands on the target rung, then
 *      filtering the captured rows back down to S's ids,
 *   4. dispatch S's ids with each catalog to the REAL seat, everything else byte-identical.
 * The arms then differ in exactly one variable: per-row detail. No product surface was added to force a
 * rung, and each catalog is produced by the real projector, not a bench replica.
 *
 * Run `--dry` (default) for the deterministic half: build and verify every arm, prove the filtered
 * catalogs are row-exact and id-identical, and report catalog sizes. Add `--go` to additionally dispatch
 * each arm to the real semantic_author seat and score the selections.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createDirectCallReconstructDirectiveAuthor } from "../src/core-runtime/reconstruct/run.ts";
import { SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET } from "../src/core-runtime/reconstruct/source-breadth-fold.ts";
import {
  assertSettingsModelsSupported,
  resolveReconstructActorLlmSettings,
  resolveSettingsChain,
} from "../src/core-runtime/discovery/settings-chain.ts";
import { callLlm, resolveLlmProviderConfig } from "../src/core-runtime/llm/llm-caller.ts";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const BENCH = path.join(
  REPO_ROOT,
  ".onto/temp/stage2-value-bench-2026-07-22T17-45-58-944Z/off/.onto/reconstruct/session",
);
const INTENT =
  "Reconstruct the conversational API surface of this SDK: how chat completions, responses, " +
  "realtime sessions, and conversations relate — messages, roles, tool and function calls, " +
  "streaming, and their parameters and result shapes.";

const live = process.argv.includes("--go");
type AnyRecord = Record<string, unknown>;

/** Declared (not an arrow const) so TypeScript narrows control flow after a call. */
function fail(m: string): never {
  console.error(`\n✗ SELECTION-QUALITY BENCH FAIL: ${m}`);
  process.exit(1);
}
const ok = (m: string): void => console.log(`  ✓ ${m}`);
const loadYaml = async <T,>(rel: string): Promise<T> =>
  parseYaml(await fs.readFile(path.join(BENCH, rel), "utf8")) as T;

const allObservations = (await loadYaml<{ observations: AnyRecord[] }>("source-observations.yaml"))
  .observations;
const targetMaterialProfile = await loadYaml<unknown>("target-material-profile.yaml");
const sourceScoutPack = await loadYaml<unknown>("source-scout-pack.yaml");
const sourceScoutPackValidation = await loadYaml<unknown>("source-scout-pack-validation.yaml");

const directiveInput = (observations: AnyRecord[]) =>
  ({
    sessionId: "selection-quality-bench",
    intent: INTENT,
    targetMaterialProfile,
    sourceObservations: { observations },
    sourceScoutPack,
    sourceScoutPackValidation,
    sourceScoutPackRef: path.join(BENCH, "source-scout-pack.yaml"),
    sourceScoutPackValidationRef: path.join(BENCH, "source-scout-pack-validation.yaml"),
  }) as never;

/** Capture the payload the real author would dispatch (no LLM: the mock picks the first offered id). */
async function capture(
  observations: AnyRecord[],
  sourceBreadthFold: boolean,
): Promise<{ systemPrompt: string; userPayload: AnyRecord; foldNote: string | null } | { threw: string }> {
  const dispatched: { systemPrompt: string; userPrompt: string }[] = [];
  const author = createDirectCallReconstructDirectiveAuthor({
    ...(sourceBreadthFold ? { sourceBreadthFold: true } : {}),
    llmCall: (systemPrompt: string, userPrompt: string) => {
      dispatched.push({ systemPrompt, userPrompt });
      const payload = JSON.parse(userPrompt) as { available_observation_ids: string[] };
      return Promise.resolve({
        text: JSON.stringify({
          selected_observations: [
            { observation_id: payload.available_observation_ids[0], selection_rationale: "capture" },
          ],
          open_questions: [],
        }),
        input_tokens: 0,
        output_tokens: 0,
        model_id: "capture-only",
      });
    },
  });
  try {
    const directive = await author.writeSourceObservationDirective(directiveInput(observations));
    const captured = dispatched[0]!;
    const foldNote =
      (directive.open_questions as string[]).find((q) => /folded the source-observation/.test(q)) ??
      null;
    return {
      systemPrompt: captured.systemPrompt,
      userPayload: JSON.parse(captured.userPrompt) as AnyRecord,
      foldNote,
    };
  } catch (error) {
    return { threw: (error as Error).message };
  }
}

const rungOf = (foldNote: string | null): string =>
  foldNote === null ? "full" : (/catalog to '([a-z_]+)'/.exec(foldNote)?.[1] ?? "?");

// ── Step 1: the largest prefix of the real corpus that still fits at `full`. ──
console.log(`\n=== coarse-rung selection-quality bench (real ${allObservations.length}-file corpus) ===`);
let subsetSize = 0;
for (let n = allObservations.length; n >= 5; n -= 1) {
  const probe = await capture(allObservations.slice(0, n), false);
  if (!("threw" in probe)) {
    subsetSize = n;
    break;
  }
}
if (subsetSize === 0) fail("no prefix of the corpus fits at `full` — cannot build the reference arm");
const subset = allObservations.slice(0, subsetSize);
const subsetIds = subset.map((o) => String(o.observation_id));
ok(`reference subset S = ${subsetSize} files (largest prefix that fits at rung 'full')`);

// ── Step 2: reference arm — S at `full`, captured directly from the real path. ──
const fullCapture = await capture(subset, false);
if ("threw" in fullCapture) fail(`reference arm threw: ${fullCapture.threw}`);
if (rungOf(fullCapture.foldNote) !== "full") fail("reference arm is not at rung 'full'");
const referenceRows = fullCapture.userPayload.source_observations as AnyRecord[];
if (referenceRows.length !== subsetSize) fail("reference arm row count ≠ |S|");

// ── Step 3: coarse arms — replicate S until the fold lands on each rung, then filter back to S. ──
/** Replicas carry distinct ids so they add bytes; S's own rows stay present and untouched. */
function replicate(times: number): AnyRecord[] {
  const out = [...subset];
  for (let copy = 1; copy < times; copy += 1) {
    for (const observation of subset) {
      out.push({
        ...observation,
        observation_id: `${String(observation.observation_id)}-c${copy}`,
        source_ref: `${String(observation.source_ref)}.c${copy}.ts`,
      });
    }
  }
  return out;
}

/**
 * The method rests on the projection being a pure per-row map. That claim is testable rather than
 * assumable: capture the SAME rung at two different replication factors and require S's filtered rows to
 * be byte-identical across both. Any set-dependent behaviour — a shared budget divided across rows, a
 * corpus-wide cap, an order-sensitive branch — makes the two captures differ and fails the bench here,
 * before a single live token is spent.
 */
async function catalogAtRung(rung: string): Promise<AnyRecord[]> {
  const captures: { times: number; rows: AnyRecord[] }[] = [];
  for (let times = 2; times <= 240 && captures.length < 2; times = Math.ceil(times * 1.5)) {
    const captured = await capture(replicate(times), true);
    if ("threw" in captured) continue;
    if (rungOf(captured.foldNote) !== rung) continue;
    const rows = (captured.userPayload.source_observations as AnyRecord[]).filter((row) =>
      subsetIds.includes(String(row.observation_id)),
    );
    if (rows.length !== subsetSize) {
      fail(`rung '${rung}': filtered ${rows.length} rows ≠ |S|=${subsetSize} — S's rows did not survive`);
    }
    captures.push({ times, rows });
  }
  if (captures.length < 2) fail(`rung '${rung}': fewer than 2 independent captures — purity untestable`);
  const [a, b] = captures as [{ times: number; rows: AnyRecord[] }, { times: number; rows: AnyRecord[] }];
  if (JSON.stringify(a.rows) !== JSON.stringify(b.rows)) {
    fail(
      `rung '${rung}': S's rows differ between ×${a.times} and ×${b.times} — the projection is NOT a pure ` +
        `per-row map, so a filtered catalog is not what S alone would have produced`,
    );
  }
  ok(
    `rung '${rung}' captured at ×${a.times} and ×${b.times}; S's ${subsetSize} rows byte-identical across both (per-row purity holds)`,
  );
  return a.rows;
}

const arms: { rung: string; rows: AnyRecord[] }[] = [
  { rung: "full", rows: referenceRows },
  { rung: "inventory_skeleton", rows: await catalogAtRung("inventory_skeleton") },
  { rung: "one_line", rows: await catalogAtRung("one_line") },
];

// ── Step 4: the arms must differ ONLY in per-row detail. Prove it before spending any live call. ──
for (const arm of arms) {
  const ids = arm.rows.map((row) => String(row.observation_id));
  if (ids.length !== subsetSize || new Set(ids).size !== subsetSize) {
    fail(`arm '${arm.rung}' does not carry exactly S's ${subsetSize} distinct ids`);
  }
  if (JSON.stringify(ids) !== JSON.stringify(subsetIds)) {
    fail(`arm '${arm.rung}' id ORDER differs from the reference — order is a confound, not detail`);
  }
}
ok(`all ${arms.length} arms carry the identical id set in the identical order (only detail differs)`);
const armBytes = arms.map((arm) => ({
  rung: arm.rung,
  bytes: Buffer.byteLength(JSON.stringify(arm.rows, null, 2), "utf8"),
}));
for (const { rung, bytes } of armBytes) {
  console.log(`    ${rung.padEnd(20)} catalog ${String(bytes).padStart(8)} B  (${Math.round(bytes / subsetSize)} B/row)`);
}
if (!(armBytes[0]!.bytes > armBytes[1]!.bytes && armBytes[1]!.bytes > armBytes[2]!.bytes)) {
  fail("arms are not strictly decreasing in size — the rungs did not actually demote detail");
}
ok(`detail strictly decreases across arms — a non-vacuous contrast`);

const evidenceDir = path.join(REPO_ROOT, ".onto/temp/breadth-fold-selection-quality");
await fs.mkdir(evidenceDir, { recursive: true });

if (!live) {
  console.log(
    `\n✓ DRY PASS — arms built and verified. Re-run with --go to dispatch each arm to the real seat.`,
  );
  await fs.writeFile(
    path.join(evidenceDir, "arms-dry.json"),
    `${JSON.stringify({ subset_size: subsetSize, arms: armBytes }, null, 2)}\n`,
  );
  process.exit(0);
}

// ── Step 5: live — dispatch each arm to the real seat, identical but for the catalog. ──
const settings = await resolveSettingsChain(REPO_ROOT, REPO_ROOT);
assertSettingsModelsSupported(settings);
const seat = resolveReconstructActorLlmSettings(settings, "semantic_author");
if (!seat) fail("no semantic_author seat resolved from repo settings");
const llmConfig = resolveLlmProviderConfig({ config: { llm: seat } });
console.log(`\nseat: ${seat.provider}/${seat.model ?? "?"}`);

/**
 * Each arm dispatches through the REAL author over S — same system prompt, same intent, profile, scout
 * pack, and `available_observation_ids`, same response parsing and id validation. The only intervention
 * is a `llmCall` wrapper that swaps the catalog slot for the arm's rows on the way out. Swapping at the
 * wire rather than rebuilding the payload keeps every other byte authored by production code.
 */
/**
 * Selection is stochastic, so "full vs one_line overlap = 0.6" is uninterpretable on its own — full vs
 * full might also be 0.6. The reference rung is therefore dispatched TWICE: the full-vs-full overlap is
 * the noise floor every coarse arm is read against. A coarse arm only shows degradation if it falls
 * BELOW that floor.
 */
const dispatchArms = [arms[0]!, { ...arms[0]!, rung: "full (repeat — noise floor)" }, ...arms.slice(1)];

const selections: { rung: string; ids: string[]; swapBytes: number }[] = [];
for (const arm of dispatchArms) {
  let swapBytes = 0;
  const author = createDirectCallReconstructDirectiveAuthor({
    llmConfig,
    llmCall: (systemPrompt, userPrompt, config) => {
      const payload = JSON.parse(userPrompt) as AnyRecord;
      const authored = JSON.stringify(payload.source_observations);
      if (arm.rung.startsWith("full") && authored !== JSON.stringify(arm.rows)) {
        fail("swap is unfaithful: the author's own catalog ≠ the captured `full` arm");
      }
      payload.source_observations = arm.rows;
      const swapped = JSON.stringify(payload, null, 2);
      swapBytes = Buffer.byteLength(swapped, "utf8");
      return callLlm(systemPrompt, swapped, config);
    },
  });
  const directive = await author.writeSourceObservationDirective(directiveInput(subset));
  const ids = (directive.selected_observations as { observation_id: string }[]).map(
    (s) => s.observation_id,
  );
  if (ids.length === 0) fail(`arm '${arm.rung}' returned zero selections`);
  const unknown = ids.filter((id) => !subsetIds.includes(id));
  if (unknown.length > 0) fail(`arm '${arm.rung}' selected ${unknown.length} unknown ids`);
  selections.push({ rung: arm.rung, ids, swapBytes });
  console.log(
    `  ${arm.rung.padEnd(20)} dispatched ${String(swapBytes).padStart(8)} B → selected ${ids.length} ids, 0 unknown`,
  );
}

// ── Step 6: compare each coarse arm against the `full` reference. ──
const reference = new Set(selections[0]!.ids);
const report = selections.map((selection) => {
  const overlap = selection.ids.filter((id) => reference.has(id)).length;
  const union = new Set([...reference, ...selection.ids]).size;
  const topFive = selection.ids.slice(0, 5).filter((id) => selections[0]!.ids.slice(0, 5).includes(id));
  return {
    rung: selection.rung,
    dispatched_bytes: selection.swapBytes,
    selected: selection.ids.length,
    overlap_with_full: overlap,
    jaccard: Number((overlap / union).toFixed(3)),
    top5_overlap: topFive.length,
    ids: selection.ids,
  };
});
console.table(report.map(({ ids: _ids, ...row }) => row));
await fs.writeFile(
  path.join(evidenceDir, "selection-quality.json"),
  `${JSON.stringify(
    { subset_size: subsetSize, intent: INTENT, seat: `${seat.provider}/${seat.model}`, arms: armBytes, report },
    null,
    2,
  )}\n`,
);
console.log(`\n✓ LIVE PASS — evidence: ${path.join(evidenceDir, "selection-quality.json")}`);
