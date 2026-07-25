/**
 * DW-3b deterministic replay — source_breadth_fold over the REAL 59-file overflow corpus.
 *
 * The value bench (2026-07-22) captured a real openai-node 59-file source-observations artifact whose
 * flat directive projection is 1,349,907 chars > the codex stdin ceiling — the OFF run died there. This
 * replays `writeSourceObservationDirective` over THAT real artifact (no re-capture, no 2-hour deep
 * observe), contrasting the opt-in OFF vs ON:
 *   - OFF: the always-on byte guard fails loud (reproduces the real overflow, now measured in bytes).
 *   - ON : the projection-layer fold demotes per-observation detail to the finest fitting rung, so the
 *          SAME catalog dispatches under budget with every one of the 59 files still selectable.
 *
 * Deterministic by default (a mock provider that captures the dispatched payload and selects the first
 * offered id — proving folded rows carry real, resolvable ids). Pass `--live` to additionally send the
 * folded ON payload to the REAL semantic_author seat (one codex dispatch) and confirm the real worker
 * accepts it and returns resolvable selections — the DW-3b "real dispatch" arm (metered OAuth).
 *
 * Spec: design 20260723-deterministic-recursive-observation §8 PR-3 DW-3b. Not committed by default —
 * a verification harness, sibling to scripts/value-read-ab-replay.mts.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  createDirectCallReconstructDirectiveAuthor,
} from "../src/core-runtime/reconstruct/run.ts";
import { SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET } from "../src/core-runtime/reconstruct/source-breadth-fold.ts";
import {
  assertSettingsModelsSupported,
  resolveReconstructActorLlmSettings,
  resolveSettingsChain,
} from "../src/core-runtime/discovery/settings-chain.ts";
import { resolveLlmProviderConfig } from "../src/core-runtime/llm/llm-caller.ts";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const BENCH = path.join(
  REPO_ROOT,
  ".onto/temp/stage2-value-bench-2026-07-22T17-45-58-944Z/off/.onto/reconstruct/session",
);

// The exact intent used by the value bench (scripts/stage2-value-bench-run.mts) — same common basis.
const INTENT =
  "Reconstruct the conversational API surface of this SDK: how chat completions, responses, " +
  "realtime sessions, and conversations relate — messages, roles, tool and function calls, " +
  "streaming, and their parameters and result shapes.";

const live = process.argv.includes("--live");

async function loadYaml<T>(rel: string): Promise<T> {
  return parseYaml(await fs.readFile(path.join(BENCH, rel), "utf8")) as T;
}

function fail(message: string): never {
  console.error(`\n✗ DW-3b FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`  ✓ ${message}`);
}

const sourceObservationsRef = path.join(BENCH, "source-observations.yaml");
const sourceScoutPackRef = path.join(BENCH, "source-scout-pack.yaml");
const sourceScoutPackValidationRef = path.join(BENCH, "source-scout-pack-validation.yaml");

const sourceObservations = await loadYaml<{ observations: { observation_id: string }[] }>(
  "source-observations.yaml",
);
const targetMaterialProfile = await loadYaml<unknown>("target-material-profile.yaml");
const sourceScoutPack = await loadYaml<unknown>("source-scout-pack.yaml");
const sourceScoutPackValidation = await loadYaml<unknown>("source-scout-pack-validation.yaml");

const capturedFileCount = sourceObservations.observations.length;
console.log(`\n=== DW-3b replay over the real value-bench overflow corpus ===`);
console.log(`corpus: ${sourceObservationsRef}`);
console.log(`captured observations: ${capturedFileCount}`);
console.log(`byte budget: ${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET}`);

const directiveInput = () =>
  ({
    sessionId: "dw3b-replay",
    intent: INTENT,
    targetMaterialProfile,
    sourceObservations,
    sourceScoutPack,
    sourceScoutPackValidation,
    sourceScoutPackRef,
    sourceScoutPackValidationRef,
  }) as never;

// A mock provider that captures the dispatched (systemPrompt,userPrompt) and picks the FIRST offered id
// so the real selection loop resolves it (folded rows must carry genuine, resolvable observation ids).
function capturingAuthor(sourceBreadthFold: boolean) {
  const dispatched: { systemPrompt: string; userPrompt: string }[] = [];
  const author = createDirectCallReconstructDirectiveAuthor({
    ...(sourceBreadthFold ? { sourceBreadthFold: true } : {}),
    llmCall: (systemPrompt: string, userPrompt: string) => {
      dispatched.push({ systemPrompt, userPrompt });
      const payload = JSON.parse(userPrompt) as { available_observation_ids: string[] };
      const firstId = payload.available_observation_ids[0];
      return Promise.resolve({
        text: JSON.stringify({
          selected_observations: [{ observation_id: firstId, selection_rationale: "replay-pick" }],
          open_questions: [],
        }),
      });
    },
  });
  return { author, dispatched };
}

// ── Arm 1: OFF — the flat projection overflows and the always-on guard fails loud (the real death). ──
console.log(`\n[OFF] flat projection — expect fail-loud overflow`);
{
  const { author, dispatched } = capturingAuthor(false);
  let threw: Error | null = null;
  try {
    await author.writeSourceObservationDirective(directiveInput());
  } catch (error) {
    threw = error as Error;
  }
  if (!threw) fail("OFF did not throw — the real corpus was expected to overflow the byte guard");
  const m = /exceeds deterministic prompt budget: (\d+) > (\d+) bytes/.exec(threw.message);
  if (!m) fail(`OFF threw a non-budget error: ${threw.message}`);
  if (dispatched.length !== 0) fail("OFF reached dispatch — the guard should fire pre-dispatch");
  const overflowBytes = Number(m[1]);
  ok(`guard fired pre-dispatch (no llm call); flat payload = ${overflowBytes} bytes > ${m[2]} budget`);
  if (overflowBytes <= SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET) {
    fail("OFF overflow bytes not actually over budget — corpus is not the overflow subject");
  }
}

// ── Arm 2: ON (deterministic) — the fold demotes detail so the SAME catalog dispatches under budget. ──
console.log(`\n[ON] projection-layer fold — expect bounded dispatch, all ids selectable`);
let onResult: {
  fold_level: string;
  dispatched_bytes: number;
  available_ids: number;
  projected_ids: number;
} | null = null;
{
  const beforeSnapshot = JSON.stringify(sourceObservations);
  const { author, dispatched } = capturingAuthor(true);
  const directive = await author.writeSourceObservationDirective(directiveInput());

  if (dispatched.length !== 1) fail(`ON expected exactly one dispatch, got ${dispatched.length}`);
  const { systemPrompt, userPrompt } = dispatched[0]!;
  const dispatchedBytes =
    Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(userPrompt, "utf8");
  if (dispatchedBytes > SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET) {
    fail(`ON dispatch still over budget: ${dispatchedBytes} > ${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET}`);
  }
  ok(`folded dispatch = ${dispatchedBytes} bytes ≤ ${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET} budget`);

  const payload = JSON.parse(userPrompt) as {
    available_observation_ids: string[];
    source_observations: unknown[];
  };
  if (payload.available_observation_ids.length !== capturedFileCount) {
    fail(`breadth lost: available_observation_ids=${payload.available_observation_ids.length} ≠ ${capturedFileCount}`);
  }
  if (payload.source_observations.length !== capturedFileCount) {
    fail(`breadth lost: source_observations=${payload.source_observations.length} ≠ ${capturedFileCount}`);
  }
  ok(`all ${capturedFileCount} files stay offered AND projected (breadth invariant)`);

  const foldNote = directive.open_questions.find((q) =>
    /folded the source-observation candidate catalog to '(inventory_skeleton|one_line)'/.test(q),
  );
  if (!foldNote) fail(`no fold disclosure in open_questions: ${JSON.stringify(directive.open_questions)}`);
  const level = /catalog to '(inventory_skeleton|one_line)'/.exec(foldNote)![1]!;
  ok(`fold_level = ${level} (disclosed on the open-questions channel)`);

  if (directive.selected_observations.length !== 1) {
    fail(`selection did not resolve: ${directive.selected_observations.length} selected`);
  }
  ok(`picked id resolved through the real selection loop (no unknown-id throw)`);

  if (JSON.stringify(sourceObservations) !== beforeSnapshot) {
    fail("stored observations were MUTATED — fold is not projection-only (DW-3d violated)");
  }
  ok(`stored observations byte-identical after authoring (projection-only, DW-3d substrate)`);

  onResult = {
    fold_level: level,
    dispatched_bytes: dispatchedBytes,
    available_ids: payload.available_observation_ids.length,
    projected_ids: payload.source_observations.length,
  };
}

// ── Arm 3 (optional, --live): real codex dispatch of the folded ON payload. ──
if (live) {
  console.log(`\n[ON --live] real semantic_author dispatch of the folded payload`);
  const settings = await resolveSettingsChain(REPO_ROOT, REPO_ROOT);
  assertSettingsModelsSupported(settings);
  const seat = resolveReconstructActorLlmSettings(settings, "semantic_author");
  if (!seat) fail("--live: no semantic_author seat resolved from repo settings");
  const semanticAuthorLlmConfig = resolveLlmProviderConfig({ config: { llm: seat } });
  console.log(`  seat: ${seat.provider}/${seat.model ?? "?"}`);
  const author = createDirectCallReconstructDirectiveAuthor({
    llmConfig: semanticAuthorLlmConfig,
    sourceBreadthFold: true,
  });
  const directive = await author.writeSourceObservationDirective(directiveInput());
  if (directive.selected_observations.length === 0) {
    fail("live dispatch returned zero selections");
  }
  const known = new Set(sourceObservations.observations.map((o) => o.observation_id));
  const unknown = directive.selected_observations.filter(
    (s: { observation_id?: string }) => s.observation_id && !known.has(s.observation_id),
  );
  ok(`real codex accepted the folded payload; ${directive.selected_observations.length} selections, ${unknown.length} unknown ids`);
  if (unknown.length !== 0) fail(`live selection produced unknown ids: ${unknown.length}`);
}

// ── Evidence ──
const evidenceDir = path.join(REPO_ROOT, ".onto/temp/source-breadth-fold-dw3b");
await fs.mkdir(evidenceDir, { recursive: true });
const evidence = {
  spec: "design 20260723 §8 PR-3 DW-3b",
  corpus_ref: sourceObservationsRef,
  captured_observations: capturedFileCount,
  byte_budget: SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
  off_arm: "fail-loud overflow (guard pre-dispatch, no llm call)",
  on_arm: onResult,
  live_arm: live ? "real codex dispatch accepted the folded payload" : "not run (deterministic only)",
};
await fs.writeFile(
  path.join(evidenceDir, "dw3b-replay-result.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(`\n✓ DW-3b replay PASS — evidence: ${path.join(evidenceDir, "dw3b-replay-result.json")}`);
console.log(JSON.stringify(evidence, null, 2));
