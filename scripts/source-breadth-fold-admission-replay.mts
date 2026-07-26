/**
 * Deterministic replay of the ADMISSION-surface breadth fold over the REAL Stage-2 ON inventory.
 *
 * Fixtures proved the mechanism; this proves it on the real heterogeneous corpus (the value bench's
 * openai-node run, 59 admitted units with real outlines/skeletons). Three arms:
 *   [A] real inventory as-is, ON vs OFF → the dispatched payload must be BYTE-IDENTICAL (fits at
 *       `full`, so the fold is a no-op on every currently-succeeding run).
 *   [B] the SAME real units replicated to 1000 (the ~750-unit overflow measured earlier), OFF → the
 *       always-on guard fails loud pre-dispatch. This is the real breakage the fold exists to fix.
 *   [C] same scaled corpus, ON → bounded dispatch, all 1000 refs still offered, rung disclosed.
 * Arm B is the negative control: without it, arm C's PASS would not prove the fold did anything.
 *
 * Spec: design 20260723-deterministic-recursive-observation §12 PR-4a. Sibling of
 * scripts/source-breadth-fold-replay-dw3b.mts (the directive surface's replay); both read PRESERVED
 * value-bench artifacts, so neither dispatches an LLM or re-captures a corpus.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
// Import from the module that DEFINES the factory, not from run.ts: the run.ts decomposition track
// (PR #264) stopped re-exporting it, which left this replay unrunnable at HEAD. Sibling replays
// (source-breadth-fold-replay-dw3b.mts) already import it from here.
import { createDirectCallReconstructDirectiveAuthor } from "../src/core-runtime/reconstruct/direct-call-directive-author.ts";
import { SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET } from "../src/core-runtime/reconstruct/source-breadth-fold.ts";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const SESSION = path.join(
  REPO_ROOT,
  ".onto/temp/stage2-value-bench-2026-07-23T03-24-30-377Z/on/.onto/reconstruct/session",
);
const INTENT =
  "Reconstruct the conversational API surface of this SDK: how chat completions, responses, " +
  "realtime sessions, and conversations relate — messages, roles, tool and function calls, " +
  "streaming, and their parameters and result shapes.";

const fail = (m: string): never => {
  console.error(`\n✗ ADMISSION FOLD REPLAY FAIL: ${m}`);
  process.exit(1);
};
const ok = (m: string): void => console.log(`  ✓ ${m}`);

type AnyRecord = Record<string, unknown>;
const loadYaml = async <T,>(rel: string): Promise<T> =>
  parseYaml(await fs.readFile(path.join(SESSION, rel), "utf8")) as T;

const realInventory = await loadYaml<AnyRecord & { inventory_units: AnyRecord[] }>(
  "source-inventory.yaml",
);
const targetMaterialProfile = await loadYaml<unknown>("target-material-profile.yaml");
const admittedCount = realInventory.inventory_units.filter(
  (unit) => unit.scan_status === "admitted",
).length;

console.log(`\n=== admission-surface fold — deterministic replay over the real Stage-2 inventory ===`);
console.log(`inventory: ${path.join(SESSION, "source-inventory.yaml")}`);
console.log(`admitted units (real): ${admittedCount}`);
console.log(`byte budget: ${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET}`);

const admissionInput = (sourceInventory: unknown) =>
  ({
    sessionId: "admission-fold-replay",
    intent: INTENT,
    targetMaterialProfile,
    sourceInventory,
    admissionFileLimit: 16,
    admissionFloor: 1,
  }) as never;

function capturingAuthor(sourceBreadthFold: boolean) {
  const dispatched: { systemPrompt: string; userPrompt: string }[] = [];
  const author = createDirectCallReconstructDirectiveAuthor({
    ...(sourceBreadthFold ? { sourceBreadthFold: true } : {}),
    llmCall: (systemPrompt: string, userPrompt: string) => {
      dispatched.push({ systemPrompt, userPrompt });
      const payload = JSON.parse(userPrompt) as { admitted_outlines: { source_ref: string }[] };
      return Promise.resolve({
        text: JSON.stringify({
          frontier_refs: [
            {
              source_ref: payload.admitted_outlines[0]!.source_ref,
              rationale: "replay-pick",
              priority: "high",
            },
          ],
          no_next_frontier_rationale: null,
        }),
      });
    },
  });
  return { author, dispatched };
}

// ── Arm A: real inventory, ON vs OFF → byte-identical (the fold is inert on fitting corpora). ──
console.log(`\n[A] real ${admittedCount}-unit inventory — ON must be byte-identical to OFF`);
{
  const off = capturingAuthor(false);
  const on = capturingAuthor(true);
  await off.author.writeSourceAdmissionSelection(admissionInput(realInventory));
  await on.author.writeSourceAdmissionSelection(admissionInput(realInventory));
  if (off.dispatched.length !== 1 || on.dispatched.length !== 1) {
    fail(`A expected one dispatch per arm, got off=${off.dispatched.length} on=${on.dispatched.length}`);
  }
  if (on.dispatched[0]!.userPrompt !== off.dispatched[0]!.userPrompt) {
    fail("A ON payload differs from OFF on a FITTING real corpus — byte parity broken");
  }
  if ((on.author.sourceBreadthFoldDisclosures ?? []).length !== 0) {
    fail("A ON recorded a fold disclosure on a fitting corpus — the fold demoted without need");
  }
  const bytes = Buffer.byteLength(off.dispatched[0]!.userPrompt, "utf8");
  const rows = (JSON.parse(off.dispatched[0]!.userPrompt) as {
    admitted_outlines: AnyRecord[];
  }).admitted_outlines;
  const withDigest = rows.filter((row) => row.structure_skeleton_digest !== null).length;
  ok(`ON === OFF byte-for-byte (${bytes} B user payload, ${rows.length} rows, ${withDigest} carrying a real skeleton digest)`);
  if (withDigest === 0) fail("A no row carried a skeleton digest — the parity check is vacuous");
}

// ── Arms B/C: the same REAL units replicated to the measured overflow scale. ──
const SCALE_TO = 1000;
const admittedUnits = realInventory.inventory_units.filter((unit) => unit.scan_status === "admitted");
const scaledUnits: AnyRecord[] = [];
for (let index = 0; scaledUnits.length < SCALE_TO; index += 1) {
  const source = admittedUnits[index % admittedUnits.length]!;
  // Distinct ref per replica — admittedOutlinesForPrompt keys/sorts on the resolved ref, so reused
  // refs would collapse the catalog and make the scaling silently no-op.
  scaledUnits.push({ ...source, ref: `${String(source.ref)}.replica${index}.ts` });
}
const scaledInventory = { ...realInventory, inventory_units: scaledUnits };
console.log(`\n[B/C] real units replicated to ${SCALE_TO} admitted refs (measured overflow ≈750)`);

{
  const { author, dispatched } = capturingAuthor(false);
  let threw: Error | null = null;
  try {
    await author.writeSourceAdmissionSelection(admissionInput(scaledInventory));
  } catch (error) {
    threw = error as Error;
  }
  if (!threw) fail("B OFF did NOT fail loud at 1000 units — arm C would prove nothing");
  const m = /exceeds deterministic prompt budget: (\d+) > (\d+) bytes/.exec(threw.message);
  if (!m) fail(`B OFF threw a non-budget error: ${threw.message}`);
  if (dispatched.length !== 0) fail("B OFF reached dispatch — the guard must fire pre-dispatch");
  ok(`[B] OFF fails loud pre-dispatch (0 llm calls): ${m[1]} B > ${m[2]} B budget`);
}

{
  const before = JSON.stringify(scaledInventory);
  const { author, dispatched } = capturingAuthor(true);
  const selection = await author.writeSourceAdmissionSelection(admissionInput(scaledInventory));
  if (dispatched.length !== 1) fail(`C expected one dispatch, got ${dispatched.length}`);
  const { systemPrompt, userPrompt } = dispatched[0]!;
  const bytes = Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(userPrompt, "utf8");
  if (bytes > SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET) fail(`C still over budget: ${bytes}`);
  const rows = (JSON.parse(userPrompt) as { admitted_outlines: AnyRecord[] }).admitted_outlines;
  if (rows.length !== SCALE_TO) fail(`C breadth lost: ${rows.length} rows ≠ ${SCALE_TO}`);
  if (new Set(rows.map((row) => row.source_ref)).size !== SCALE_TO) {
    fail("C duplicate refs — the scaled corpus collapsed");
  }
  const disclosureRecord = (author.sourceBreadthFoldDisclosures ?? [])[0];
  if (!disclosureRecord) fail("C no fold disclosure recorded — a demoted rung would be silent");
  if (disclosureRecord.surface !== "source_admission_selection") {
    fail(`C disclosure attributed to the wrong surface: ${disclosureRecord.surface}`);
  }
  const disclosure = disclosureRecord.disclosure;
  if (disclosure.fold_level === "full") fail("C disclosed 'full' — nothing was actually demoted");
  if (selection.frontier_refs.length !== 1) fail("C selection did not parse through the real path");
  if (JSON.stringify(scaledInventory) !== before) fail("C MUTATED the inventory — not projection-only");
  ok(`[C] ON dispatches ${bytes} B ≤ budget at rung '${disclosure.fold_level}', all ${SCALE_TO} refs offered, inventory untouched`);
  ok(`[C] disclosure: ${disclosure.catalog_observation_count} units, ${disclosure.measured_prompt_bytes}/${disclosure.prompt_byte_budget} B, finer rungs over budget: [${disclosure.finer_levels_over_budget.join(", ")}]`);
}

console.log(`\n✓ ADMISSION FOLD REPLAY PASS (A parity on real corpus, B negative control, C fold)`);
