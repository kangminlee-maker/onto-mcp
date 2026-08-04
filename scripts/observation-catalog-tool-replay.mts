/**
 * Deterministic replay of the observation-catalog-tool PUSH layer (design
 * 20260726-observation-catalog-tool §6, stage 3a) over the REAL 59-observation corpus.
 *
 * Fixtures proved the mechanism; this proves it on the real heterogeneous artifact — the same
 * `openai-node src/` value-bench run stage 1 and stage 2 read (scripts/fixtures/observation-catalog/,
 * see its PROVENANCE.md). No LLM is dispatched: the author's llmCall is captured, so the measurement
 * is the payload the worker WOULD have received.
 *
 * Four arms, each with what makes it non-vacuous:
 *   [A] real corpus, OFF  → today's projection: detail present, bytes measured. The baseline the
 *       other arms are a contrast against.
 *   [B] real corpus, ON   → navigation rows only. Asserts the byte collapse AND that arm A really
 *       carried the detail (otherwise "smaller" would prove nothing).
 *   [C] real observations replicated past the 64 cap, OFF → the §1.2 defect ON REAL DATA: ids are
 *       dropped and `omitted_prioritized_observation_count` still reports 0, so nothing in the
 *       artifact says anything went missing.
 *   [D] same scaled corpus, ON → every observation offered, catalog under budget, rung disclosed
 *       only if it actually demoted.
 *
 * Usage: npx tsx scripts/observation-catalog-tool-replay.mts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createDirectCallReconstructDirectiveAuthor } from "../src/core-runtime/reconstruct/direct-call-directive-author.ts";
import {
  ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT,
  maturationAnswerSupportPromptCatalog,
  sourceObservationsForPrompt,
} from "../src/core-runtime/reconstruct/authoring-prompt-payloads.ts";
import { SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET } from "../src/core-runtime/reconstruct/source-breadth-fold.ts";
import { CODEX_PROMPT_INPUT_CHAR_LIMIT } from "../src/core-runtime/llm/llm-caller.ts";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const OBSERVATIONS_PATH = path.join(
  REPO_ROOT,
  "scripts/fixtures/observation-catalog/source-observations.yaml",
);
const SAFETY_LEDGER_PATH = path.join(
  REPO_ROOT,
  "scripts/fixtures/observation-catalog/source-safety-ledger.yaml",
);
const SCALE_TO = 500;

type AnyRecord = Record<string, any>;

const fail = (message: string): never => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};
const ok = (message: string): void => console.log(`  ✓ ${message}`);

const observationsArtifact = parseYaml(
  await fs.readFile(OBSERVATIONS_PATH, "utf8"),
) as AnyRecord;
const realObservations = observationsArtifact.observations as AnyRecord[];
if (!Array.isArray(realObservations) || realObservations.length === 0) {
  fail("fixture carries no observations — every assertion below would pass vacuously");
}
const withStructuralData = realObservations.filter(
  (observation) => observation.structural_data &&
    Object.keys(observation.structural_data as AnyRecord).length > 0,
).length;
if (withStructuralData !== realObservations.length) {
  fail(
    `fixture has ${realObservations.length - withStructuralData} observations without structural_data —` +
      " the detail this stage moves out of the prompt is what is being measured",
  );
}

/**
 * Row identity oracle: the projected rows ARE the observations (same id multiset, same values), not
 * N copies of one row. Counts alone passed a duplicated catalog (cross-family review, lens B #7).
 */
function assertRowsAreTheObservations(
  arm: string,
  rows: AnyRecord[],
  observations: AnyRecord[],
): void {
  const byId = new Map(observations.map((o) => [o.observation_id, o]));
  const seen = new Set<string>();
  for (const row of rows) {
    const id = String(row.observation_id);
    if (seen.has(id)) fail(`${arm} duplicate row for ${id} — the catalog repeated a row`);
    seen.add(id);
    const observation = byId.get(id);
    if (!observation) fail(`${arm} row ${id} is not an input observation`);
    if (row.source_ref !== observation!.source_ref) {
      fail(`${arm} row ${id} carries source_ref ${row.source_ref}, expected ${observation!.source_ref}`);
    }
    if ("summary" in row && row.summary !== observation!.summary) {
      fail(`${arm} row ${id} carries another observation's summary`);
    }
  }
}

function artifactOf(observations: AnyRecord[]): AnyRecord {
  return { ...observationsArtifact, observations };
}

/** Replicate the REAL rows (not synthetic ones) past the cap, with unique ids and refs. */
function scaled(count: number): AnyRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const source = realObservations[index % realObservations.length]!;
    return {
      ...source,
      observation_id: `${source.observation_id}-r${Math.floor(index / realObservations.length)}`,
      source_ref: `${source.source_ref}.r${Math.floor(index / realObservations.length)}`,
      location: `${source.location}.r${Math.floor(index / realObservations.length)}`,
    };
  });
}

const SESSION_ID = String(observationsArtifact.session_id ?? "observation-catalog-replay");
const CREATED_AT = String(observationsArtifact.created_at ?? "2026-07-26T00:00:00.000Z");

function questionFrontier(): AnyRecord {
  return {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_baseline_ref: "maturation-baseline.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    actionability_matrix_ref: "baseline-actionability-matrix.yaml",
    actionability_matrix_validation_ref: "baseline-actionability-matrix-validation.yaml",
    questions: [{
      question_id: "maturation-question-replay",
      question: "What does the replay corpus prove?",
      materiality: "blocker",
      materiality_ref: "matrix-row-replay",
      actionability_surface_refs: ["dynamic_surface"],
      maturity_dimension_refs: ["evidence"],
      purpose_element_refs: ["purpose-replay"],
      baseline_row_refs: ["baseline-replay"],
      competency_question_refs: [],
      competency_assessment_refs: [],
      domain_competency_trace_refs: [],
      seed_ref_refs: ["object-replay"],
      current_answer_status: "unsupported",
      expected_answer_kind: "explanation",
      evidence_needed: "Replay evidence.",
      authority_need: {
        authority_kind: "none",
        authority_scope: null,
        blocking_if_unavailable: true,
        expected_response_kind: "unavailable_reason",
      },
      closure_frontier_hint_refs: [],
      limitation_refs: [],
    }],
    directive_author: { owner: "host_llm", author_id: "replay" },
  };
}

function closureFrontier(requestedSourceRef: string): AnyRecord {
  return {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    round_id: "maturation-round-1",
    question_frontier_ref: "maturation-question-frontier.yaml",
    source_requests: [{
      source_request_id: "source-request-replay",
      question_refs: ["maturation-question-replay"],
      member_scope_refs: [],
      member_source_refs: [],
      cross_material_ref_refs: [],
      requested_source_ref: requestedSourceRef,
      requested_location: requestedSourceRef,
      target_material_kind: "code",
      expected_evidence_kind: "replay source",
      reason: "The replay question needs this source.",
    }],
    authority_requests: [],
    directive_author: { owner: "host_llm", author_id: "replay" },
  };
}

const validations = {
  question: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_question_frontier_ref: "maturation-question-frontier.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    actionability_matrix_validation_ref: "baseline-actionability-matrix-validation.yaml",
    validation_status: "valid",
    question_count: 1,
    material_frontier_question_count: 1,
    validation_results: [],
    violations: [],
  },
  closure: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_closure_frontier_ref: "maturation-closure-frontier.yaml",
    maturation_question_frontier_validation_ref: "maturation-question-frontier-validation.yaml",
    source_inventory_ref: "source-inventory.yaml",
    source_observations_ref: "source-observations.yaml",
    validation_status: "valid",
    source_request_count: 1,
    authority_request_count: 0,
    accepted_source_request_ids: ["source-request-replay"],
    rejected_source_requests: [],
    validation_results: [],
    asserted_obligation_ids: [],
    violations: [],
  },
  authorityResponse: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    closure_frontier_ref: "maturation-closure-frontier.yaml",
    responses: [],
  },
  authorityResponseValidation: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_authority_response_ref: "maturation-authority-response.yaml",
    maturation_closure_frontier_validation_ref: "maturation-closure-frontier-validation.yaml",
    validation_status: "valid",
    response_count: 0,
    provided_response_count: 0,
    unavailable_response_count: 0,
    validation_results: [],
    violations: [],
  },
} as const;

async function author(
  observations: AnyRecord[],
  catalogTool: boolean,
): Promise<{
  payload: AnyRecord;
  dispatchBytes: number;
  dispatchChars: number;
  disclosures: AnyRecord[];
}> {
  const dispatched: { systemPrompt: string; userPrompt: string }[] = [];
  const instance = createDirectCallReconstructDirectiveAuthor({
    ...(catalogTool ? { sourceObservationCatalogTool: true } : {}),
    llmCall: (systemPrompt: string, userPrompt: string) => {
      dispatched.push({ systemPrompt, userPrompt });
      return Promise.resolve({ text: JSON.stringify({ evidence_clusters: [] }) });
    },
  } as never);
  await (instance as AnyRecord).writeAnswerSupportLedger({
    sessionId: SESSION_ID,
    roundId: "maturation-round-1",
    maturationQuestionFrontier: questionFrontier(),
    maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
    maturationQuestionFrontierValidation: validations.question,
    maturationClosureFrontier: closureFrontier(String(observations[0]!.source_ref)),
    maturationClosureFrontierValidation: validations.closure,
    maturationAuthorityResponse: validations.authorityResponse,
    maturationAuthorityResponseValidation: validations.authorityResponseValidation,
    sourceObservations: artifactOf(observations),
  });
  if (dispatched.length !== 1) fail(`expected exactly one dispatch, got ${dispatched.length}`);
  const { systemPrompt, userPrompt } = dispatched[0]!;
  // Measure what codex RECEIVES: system prompt + the separator callCodexCli inserts + user prompt.
  // Measuring the user prompt alone under-reported the dispatch (cross-family review, lens B #7).
  const combined = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  return {
    payload: JSON.parse(userPrompt) as AnyRecord,
    dispatchBytes: Buffer.byteLength(combined, "utf8"),
    // The provider counts CHARACTERS (design §5: its rejection payload reports max_chars), so the
    // ceiling comparison below uses chars even though the projection budget is byte-counted.
    dispatchChars: combined.length,
    disclosures: ((instance as AnyRecord).sourceBreadthFoldDisclosures ?? []) as AnyRecord[],
  };
}

console.log(`
observation catalog tool — stage 3a replay over the real corpus
  observations (real): ${realObservations.length}
  byte budget:         ${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET}
  cap (OFF):           ${ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT}
`);

// [A] + [B] — the real 59-observation corpus.
console.log("[A/B] real corpus — OFF (detailed, capped) vs ON (navigation, uncapped)");
const off = await author(realObservations, false);
const on = await author(realObservations, true);

const offRows = off.payload.source_observations as AnyRecord[];
const offDetailRows = offRows.filter((row) => row.structural_data).length;
if (offDetailRows === 0) {
  fail("A OFF carried no structural_data — the contrast below would be vacuous");
}
// The point of arm A is not "OFF is bigger" — it is that on THIS corpus OFF does not survive at all.
// ASSERTED, not merely interpolated: an OFF defect that shrank the projection (one detailed row for
// the whole corpus, say) would still be "bigger than ON" and used to reach the final PASS.
if (off.dispatchChars <= CODEX_PROMPT_INPUT_CHAR_LIMIT) {
  fail(
    `A OFF dispatches ${off.dispatchChars} chars, WITHIN the ${CODEX_PROMPT_INPUT_CHAR_LIMIT}-char ceiling —` +
      " the premise of this replay (that today's projection overflows on the real corpus) no longer holds",
  );
}
ok(
  `[A] OFF dispatches ${off.dispatchBytes} B / ${off.dispatchChars} chars, ${offRows.length} rows, ` +
    `${offDetailRows} carrying detail — OVER the ${CODEX_PROMPT_INPUT_CHAR_LIMIT}-char worker ceiling ` +
    "(this surface kills the real run today)",
);

const onRows = on.payload.source_observations as AnyRecord[];
if (onRows.length !== realObservations.length) {
  fail(`B ON offered ${onRows.length} of ${realObservations.length} observations`);
}
// Row IDENTITY, not just a count: 59 copies of one navigation row would satisfy every count.
assertRowsAreTheObservations("B", onRows, realObservations);
if (onRows.some((row) => row.structural_data !== undefined)) {
  fail("B ON leaked structural_data into the navigation catalog");
}
if (on.dispatchBytes >= off.dispatchBytes) {
  fail(`B ON (${on.dispatchBytes} B) is not smaller than OFF (${off.dispatchBytes} B)`);
}
if (on.disclosures.length !== 0) {
  fail("B ON disclosed a demotion on a corpus that fits the pinned rung");
}
if (on.dispatchChars > CODEX_PROMPT_INPUT_CHAR_LIMIT) {
  fail(`B ON still exceeds the worker ceiling: ${on.dispatchChars} chars`);
}
ok(
  `[B] ON dispatches ${on.dispatchBytes} B (${(off.dispatchBytes / on.dispatchBytes).toFixed(1)}× smaller), ` +
    `all ${onRows.length} observations offered, zero detail rows, nothing to disclose` +
    " — the overflow in [A] becomes a bounded dispatch",
);

// [C] + [D] — the same REAL rows scaled past the cap.
console.log(`\n[C/D] real rows replicated to ${SCALE_TO} observations`);
const scaledObservations = scaled(SCALE_TO);
const scaledOff = await author(scaledObservations, false);
const scaledOffIds = scaledOff.payload.prompt_visible_observation_ids as string[];
if (scaledOffIds.length !== ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT) {
  fail(`C OFF offered ${scaledOffIds.length} ids, expected the cap ${ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT}`);
}
const omittedCounter =
  (scaledOff.payload.source_observation_prompt_policy as AnyRecord).omitted_prioritized_observation_count;
if (omittedCounter !== 0) {
  fail(`C the omission counter reported ${omittedCounter} — the defect is that it reports nothing`);
}
const offPolicy = scaledOff.payload.source_observation_prompt_policy as AnyRecord;
if (offPolicy.source_observation_count !== SCALE_TO) {
  fail(`C policy reports ${offPolicy.source_observation_count} inputs, expected ${SCALE_TO}`);
}
if (offPolicy.prompt_observation_count !== ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT) {
  fail(`C policy reports ${offPolicy.prompt_observation_count} projected, expected the cap`);
}
if (offPolicy.observation_limit !== ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT) {
  fail(`C policy reports observation_limit ${offPolicy.observation_limit}, expected the cap`);
}
// The dropped set is EXACTLY the tail of the catalog order, so "silent" is about these ids.
const scaledOffRows = scaledOff.payload.source_observations as AnyRecord[];
assertRowsAreTheObservations("C", scaledOffRows, scaledObservations);
ok(
  `[C] OFF drops ${SCALE_TO - scaledOffIds.length} of ${SCALE_TO} observations and the only omission ` +
    `counter still reads ${omittedCounter} — silent (design §1.2); policy reports ` +
    `${offPolicy.source_observation_count} in / ${offPolicy.prompt_observation_count} projected`,
);

const scaledOn = await author(scaledObservations, true);
const scaledOnRows = scaledOn.payload.source_observations as AnyRecord[];
const scaledOnIds = scaledOn.payload.prompt_visible_observation_ids as string[];
if (scaledOnRows.length !== SCALE_TO || scaledOnIds.length !== SCALE_TO) {
  fail(`D ON offered ${scaledOnIds.length} ids / ${scaledOnRows.length} rows, expected ${SCALE_TO}`);
}
if (new Set(scaledOnIds).size !== SCALE_TO) fail("D duplicate ids — the scaled corpus collapsed");
assertRowsAreTheObservations("D", scaledOnRows, scaledObservations);
if (new Set(scaledOnIds).size !== new Set(scaledObservations.map((o) => o.observation_id)).size) {
  fail("D visible id set is not the input observation set");
}
if (scaledOn.dispatchBytes > SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET) {
  fail(`D ON dispatched ${scaledOn.dispatchBytes} B over the ${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET} B budget`);
}
const rung = scaledOn.disclosures.length > 0
  ? String((scaledOn.disclosures[0]!.disclosure as AnyRecord).fold_level)
  : "one_line (pinned, no demotion)";
if (scaledOn.disclosures.length > 0 && scaledOn.disclosures[0]!.surface !== "maturation_answer_support") {
  fail(`D disclosure attributed to ${scaledOn.disclosures[0]!.surface}`);
}
ok(
  `[D] ON offers all ${SCALE_TO} at rung '${rung}', ${scaledOn.dispatchBytes} B ≤ budget ` +
    `(OFF would have offered ${scaledOffIds.length})`,
);

// [E] The consumption gate FUNCTION over the real ledger, plus the author's fidelity to whatever it
// returns. Scope stated honestly (cross-family review, third round): the run applies the gate upstream
// (run.ts passes `promptSourceObservations` into the author), and THAT seam is pinned by a unit test —
// this arm cannot prove it, because the author is called directly here. What it does prove is that the
// real ledger's rows drive the gate, and that a non-consumption_allowed row is unreachable through the
// catalog. The unmutated ledger admits all 59, which alone would be vacuous, so the contrast is a
// one-row change. That mutated ledger is a GATE input, not a claim about a realizable artifact: the
// canonical validator owns tier derivation and would reject a tier that its axes do not derive.
console.log("\n[E] real source-safety ledger — the gate function and the author's fidelity to it");
const safetyLedger = parseYaml(await fs.readFile(SAFETY_LEDGER_PATH, "utf8")) as AnyRecord;
const gatedAll = sourceObservationsForPrompt({
  sourceObservations: artifactOf(realObservations) as never,
  sourceSafetyLedger: safetyLedger as never,
}).observations as AnyRecord[];
if (gatedAll.length !== realObservations.length) {
  fail(
    `E the real ledger withholds ${realObservations.length - gatedAll.length} observations; this arm` +
      " assumes the unmutated ledger admits all of them (stage 2 measured 59/59)",
  );
}
const onGated = await author(gatedAll, true);
const onGatedIds = onGated.payload.prompt_visible_observation_ids as string[];
if (onGatedIds.length !== gatedAll.length) {
  fail(`E ON offered ${onGatedIds.length} of the ${gatedAll.length} gated observations`);
}

// Contrast: withhold ONE observation by flipping its prompt_context row's visibility tier.
const withheldId = String(realObservations[0]!.observation_id);
const mutatedRows = (safetyLedger.safety_rows as AnyRecord[]).map((row) =>
  String(row.safety_row_id) === `source_safety:${withheldId}:prompt_context`
    ? { ...row, visibility_tier: "no_prompt_use" }
    : row
);
if (JSON.stringify(mutatedRows) === JSON.stringify(safetyLedger.safety_rows)) {
  fail(`E the mutation matched no row for ${withheldId} — the contrast would be vacuous`);
}
const gatedMinusOne = sourceObservationsForPrompt({
  sourceObservations: artifactOf(realObservations) as never,
  sourceSafetyLedger: { ...safetyLedger, safety_rows: mutatedRows } as never,
}).observations as AnyRecord[];
if (gatedMinusOne.length !== realObservations.length - 1) {
  fail(`E the mutated ledger admitted ${gatedMinusOne.length}, expected ${realObservations.length - 1}`);
}
const onWithheld = await author(gatedMinusOne, true);
const onWithheldIds = onWithheld.payload.prompt_visible_observation_ids as string[];
if (onWithheldIds.includes(withheldId)) {
  fail(`E ON served the withheld observation ${withheldId}`);
}
if (onWithheldIds.length !== realObservations.length - 1) {
  fail(`E ON offered ${onWithheldIds.length}, expected ${realObservations.length - 1}`);
}
assertRowsAreTheObservations("E", onWithheld.payload.source_observations as AnyRecord[], gatedMinusOne);
ok(
  `[E] gated set ${gatedAll.length} -> ON offers ${onGatedIds.length}; a non-consumption_allowed row for ` +
    `${withheldId} makes the gate withhold it and the catalog cannot reach it ` +
    `(${onWithheldIds.length} offered, id absent). The run-level seam is pinned separately.`,
);

// [F] What ON makes newly REACHABLE downstream, and what was already reachable. The judgment stage
// (writeAnswerSupportJudgment) re-projects the union of the ledger's cited observations WITH detail and
// has no cap, no fold, and no surface guard of its own. Widening the citable set therefore widens that
// prompt. This arm measures BOTH exposures and fails only on the crossing 3a would actually own:
// OFF under the ceiling while ON is over it. On a corpus at or below the OFF cap the two sets are
// identical, so any overflow there is pre-existing — a fact this arm states rather than assumes.
console.log("\n[F] downstream judgment prompt — OFF exposure vs ON exposure");
const judgmentPromptChars = async (cited: AnyRecord[]): Promise<number> => {
  const dispatched: { systemPrompt: string; userPrompt: string }[] = [];
  const instance = createDirectCallReconstructDirectiveAuthor({
    llmCall: (systemPrompt: string, userPrompt: string) => {
      dispatched.push({ systemPrompt, userPrompt });
      return Promise.resolve({ text: JSON.stringify({ judgments: [] }) });
    },
  } as never);
  await (instance as AnyRecord).writeAnswerSupportJudgment({
    sessionId: SESSION_ID,
    roundId: "maturation-round-1",
    answerSupportLedgerRef: "answer-support-ledger.yaml",
    answerSupportLedgerValidationRef: "answer-support-ledger-validation.yaml",
    answerSupportLedger: {
      schema_version: "1",
      session_id: SESSION_ID,
      created_at: CREATED_AT,
      round_id: "maturation-round-1",
      evidence_clusters: [{
        evidence_cluster_id: "cluster-all",
        question_refs: ["maturation-question-replay"],
        support_mode: "convergent_source_evidence",
        proposed_answer_summary: "Every cited observation converges.",
        evidence_refs: cited.map((observation) => ({
          observation_id: observation.observation_id,
          source_ref: observation.source_ref,
          location: observation.location,
        })),
        proof_refs: [],
        user_confirmation_refs: [],
        authority_response_refs: [],
        independence_basis: "replay",
        contradiction_refs: [],
        limitation_refs: [],
      }],
      directive_author: { owner: "host_llm", author_id: "replay" },
    },
    sourceObservations: artifactOf(cited),
  });
  if (dispatched.length !== 1) fail(`F expected one judgment dispatch, got ${dispatched.length}`);
  const { systemPrompt, userPrompt } = dispatched[0]!;
  return `${systemPrompt}\n\n---\n\n${userPrompt}`.length;
};
// OFF's exposure comes from the REAL catalog function, not a hand-slice. Production OFF takes
// closure-prioritized observations FIRST and only then slices, so `slice(0, 64)` in artifact order can
// name a different 64 — and with detail-heavy rows at the front it measured OFF as already over the
// ceiling, which would have let a genuine ON-only crossing pass (cross-family review, fourth round:
// the defect this arm itself introduced).
//
// ONE function, called by both the arm and its self-check below: a self-check that re-derives the
// exposure independently would stay green while THIS code regressed to a slice, which is exactly what
// the fifth round pointed out about its first version.
function offExposureFor(observations: AnyRecord[], requestedRef: string): AnyRecord[] {
  const exposedIds = maturationAnswerSupportPromptCatalog({
    sourceObservations: artifactOf(observations) as never,
    maturationQuestionFrontier: questionFrontier() as never,
    maturationClosureFrontier: closureFrontier(requestedRef) as never,
  }).promptObservationIds;
  const byId = new Map(observations.map((observation) => [
    String(observation.observation_id),
    observation,
  ]));
  // Mapped over the catalog's OWN id order, not filtered out of artifact order: the exposure is the
  // production selection including its ordering, and the self-check below asserts that ordering. (A
  // filter returned artifact order and the self-check caught it — which is the point of sharing this
  // function with the check.)
  return exposedIds.flatMap((id) => {
    const observation = byId.get(id);
    return observation ? [observation] : [];
  });
}

// Self-check of the function the arm actually uses, on the shape that broke the arm's first version:
// 128 observations whose prioritized ones sit at the END of artifact order. A hand-slice would name the
// first 64 (all supplemental); the real selection puts prioritized ones first. Asserted as a PREFIX,
// not just the first id.
{
  const prioritizedRef = "/fixture/prioritized.ts";
  const probeObservations = [
    ...Array.from({ length: 64 }, (_, index) => ({
      ...realObservations[index % realObservations.length]!,
      observation_id: `probe-supplemental-${index + 1}`,
      source_ref: `/fixture/supplemental-${index + 1}.ts`,
      location: `/fixture/supplemental-${index + 1}.ts`,
    })),
    ...Array.from({ length: 64 }, (_, index) => ({
      ...realObservations[index % realObservations.length]!,
      observation_id: `probe-prioritized-${index + 1}`,
      source_ref: prioritizedRef,
      location: `L${index * 10}-${index * 10 + 9}`,
      structural_data: {
        ...(realObservations[index % realObservations.length]!.structural_data as AnyRecord),
        region_role: "body",
        region_line_start: index * 10,
      },
    })),
  ];
  const probeExposure = offExposureFor(probeObservations, prioritizedRef);
  const ids = probeExposure.map((observation) => String(observation.observation_id));
  if (ids.length === 0) fail("F self-check: exposure came out empty");
  const prioritizedCount = ids.filter((id) => id.startsWith("probe-prioritized-")).length;
  if (prioritizedCount === 0) {
    fail("F self-check: no prioritized id survived — the arm is modelling OFF as an artifact-order slice");
  }
  // Prioritized ids form a PREFIX: every one of them precedes every supplemental id.
  const lastPrioritized = ids.reduce(
    (last, id, index) => (id.startsWith("probe-prioritized-") ? index : last),
    -1,
  );
  const firstSupplemental = ids.findIndex((id) => id.startsWith("probe-supplemental-"));
  if (firstSupplemental !== -1 && lastPrioritized > firstSupplemental) {
    fail(
      `F self-check: prioritized ids are not a prefix (last prioritized at ${lastPrioritized}, first ` +
        `supplemental at ${firstSupplemental}) — OFF's ordering is not the production one`,
    );
  }
  ok(
    `[F self-check] OFF exposure on a prioritized-last corpus = ${prioritizedCount} prioritized (a ` +
      `prefix; the per-file region cap keeps ${prioritizedCount} of 64 same-ref candidates) + ` +
      `${ids.length - prioritizedCount} supplemental — the real selection, not a slice`,
  );
}

const offExposure = offExposureFor(realObservations, String(realObservations[0]!.source_ref));
if (offExposure.length === 0) fail("F OFF exposure came out empty — the measurement would be vacuous");
if (offExposure.length > ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT) {
  fail(`F OFF exposure ${offExposure.length} exceeds the cap ${ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT}`);
}
const judgeOff = await judgmentPromptChars(offExposure);
const judgeOn = await judgmentPromptChars(realObservations);
if (judgeOff <= 0 || judgeOn <= 0) fail("F measured nothing");
const overCeiling = (chars: number) => chars > CODEX_PROMPT_INPUT_CHAR_LIMIT;
if (!overCeiling(judgeOff) && overCeiling(judgeOn)) {
  fail(
    `F ON crosses the judgment ceiling where OFF does not (${judgeOff} -> ${judgeOn} chars > ` +
      `${CODEX_PROMPT_INPUT_CHAR_LIMIT}); the newly citable ids moved the failure downstream`,
  );
}
ok(
  `[F] judgment prompt citing OFF's exposure (${offExposure.length} ids) = ${judgeOff} chars; citing ON's ` +
    `(${realObservations.length} ids) = ${judgeOn} chars; ceiling ${CODEX_PROMPT_INPUT_CHAR_LIMIT}. ` +
    (overCeiling(judgeOff)
      ? "BOTH exceed it — this surface is unbounded TODAY (the sets coincide at or below the cap), so " +
        "the overflow is pre-existing and belongs to the class guard (design §9 stage 6), not to this " +
        "change. It is a hard blocker for enabling the opt-in and for stage 5's live run."
      : "neither crosses it on this corpus; on a corpus larger than the cap ON exposes more ids than " +
        "OFF, so the class guard (design §9 stage 6) is what keeps this surface bounded."),
);

console.log(
  "\n✓ OBSERVATION CATALOG TOOL STAGE 3A REPLAY PASS (A baseline, B collapse, C silent-drop control," +
    " D coverage, E consumption gate, F downstream reach)",
);
