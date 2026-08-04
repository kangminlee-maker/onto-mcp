/**
 * LIVE end-to-end check of the RANGE CITATION path (design `26-design-live-citation-arm.md`, ③).
 *
 * `observation-read-pull-live.mts` proves the transport: a real worker fetches, and reconciliation
 * confirms what reached its context. It never touches the authoring pipeline, so the thing this whole
 * track exists for — "read part of a record, cite that part, and have the runtime admit it" — has only
 * ever been proved deterministically. This script runs it for real:
 *
 *   real corpus -> real facade -> REAL codex worker choosing what to cite -> real citation gate
 *
 * It also closes S4′'s live condition (design `23-…md` §3): a page near the rendered-result ceiling
 * must appear VERBATIM in the worker's own transcript. That is the claim the 2026-07-31 defect broke,
 * and no in-process test can make it.
 *
 * WHAT IS GATED vs WHAT IS REPORTED. The worker is a model, and whether it cites one range or five is
 * its judgment, not the runtime's. Gating on "it cited a subset" would make the probe flaky about the
 * MODEL while saying nothing about the layer (the lesson this track learned four times over). So:
 *
 *   GATED    the runtime admitted exactly the ranges cited, each ref carries range identity, the cited
 *            coverage is inside the delivered coverage, and a near-ceiling page attested verbatim
 *   GATED    a delivered-but-UNCITED range, cited, is refused — run deterministically on this run's own
 *            artifacts, so the negative arm rides the same real data without a second dispatch
 *   REPORTED whether the model actually cited a proper subset of what it fetched
 *
 * Costs one real dispatch on the operator's OAuth session. Run it deliberately:
 *   npx tsx scripts/observation-citation-live.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { createDirectCallReconstructDirectiveAuthor } from "../src/core-runtime/reconstruct/direct-call-directive-author.ts";
import {
  canonicalObservationBody,
  OBSERVATION_READ_MAX_REQUEST_IDS,
} from "../src/core-runtime/reconstruct/observation-read.ts";
import { OBSERVATION_READ_RESULT_CHAR_BUDGET } from "../src/core-runtime/reconstruct/observation-read-grant.ts";
import { readObservationReadFacadeEmissions } from "../src/core-runtime/reconstruct/observation-read-facade.ts";
import { indexEmittedObservationRanges } from "../src/core-runtime/reconstruct/observation-range-id.ts";
import {
  citableFromDeliveryRecord,
  deliveredCoversRange,
  readObservationReadDeliveryRecord,
} from "../src/core-runtime/reconstruct/delivery-reconciliation.ts";

type AnyRecord = Record<string, any>;

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "scripts/fixtures/observation-catalog");
const MODEL = process.env.ONTO_CITATION_LIVE_MODEL ?? "gpt-5.6-luna";
const EFFORT = process.env.ONTO_CITATION_LIVE_EFFORT ?? "low";
const SESSION_ID = "observation-citation-live";

const fail: (message: string) => never = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};
const ok = (message: string): void => console.log(`  ✓ ${message}`);
/** The layer behaved correctly but the MODEL's choice limits what this run can show. */
const note = (message: string): void => console.log(`  · ${message}`);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(REPO_ROOT, "benchmark/observation-citation-live", runId);
mkdirSync(outDir, { recursive: true });

// --- Real corpus, real ledger, real validation — the same three artifacts the grant demands.
const observationsText = readFileSync(path.join(FIXTURE_DIR, "source-observations.yaml"), "utf8");
const observationsArtifact = parseYaml(observationsText) as {
  observations: AnyRecord[];
};
const ledgerArtifact = parseYaml(
  readFileSync(path.join(FIXTURE_DIR, "source-safety-ledger.yaml"), "utf8"),
) as AnyRecord;

/**
 * The subject, DERIVED. It must split into several pages at the live budget — a single-page record
 * makes "cited part of it" unrepresentable and the run vacuous — while staying small enough that
 * walking it is a handful of calls rather than a million characters of context.
 *
 * Named ids go stale silently: the budget moved twice in this track alone, and each move re-cut every
 * boundary.
 */
const sized = observationsArtifact.observations
  .map((observation) => ({ observation, chars: canonicalObservationBody(observation).length }))
  .sort((left, right) => left.chars - right.chars);
const subject = sized.find(
  (candidate) =>
    candidate.chars > OBSERVATION_READ_RESULT_CHAR_BUDGET * 2 &&
    candidate.chars < OBSERVATION_READ_RESULT_CHAR_BUDGET * 3,
);
if (!subject) fail("no observation splits into a handful of pages at this budget; the run is vacuous");
const subjectId = subject.observation.observation_id as string;
const subjectBody = canonicalObservationBody(subject.observation);

/**
 * The bounded prompt catalog for this run: the subject plus a few small records, so the catalog is a
 * real multi-observation navigation surface rather than a single row.
 */
const catalog = [
  subject.observation,
  ...sized.slice(0, 4).map((row) => row.observation),
].filter((observation, index, all) =>
  all.findIndex((other) => other.observation_id === observation.observation_id) === index
).slice(0, OBSERVATION_READ_MAX_REQUEST_IDS);

const workDir = path.join(outDir, "work");
mkdirSync(workDir, { recursive: true });
const observationsPath = path.join(outDir, "source-observations.yaml");
const safetyLedgerPath = path.join(outDir, "source-safety-ledger.yaml");
const safetyLedgerValidationPath = path.join(outDir, "source-safety-ledger-validation.yaml");
writeFileSync(observationsPath, observationsText);
writeFileSync(
  safetyLedgerPath,
  stringifyYaml({ ...ledgerArtifact, source_observations_ref: path.resolve(observationsPath) }),
);
writeFileSync(
  safetyLedgerValidationPath,
  stringifyYaml({
    schema_version: "1",
    session_id: ledgerArtifact.session_id,
    created_at: new Date().toISOString(),
    source_safety_ledger_ref: path.resolve(safetyLedgerPath),
    source_observations_ref: path.resolve(observationsPath),
    validation_status: "valid",
    safety_row_count: (ledgerArtifact.safety_rows as unknown[]).length,
    no_prompt_use_count: (ledgerArtifact.safety_rows as { visibility_tier?: unknown }[])
      .filter((row) => row.visibility_tier === "no_prompt_use").length,
    validation_results: ["source_safety_ledger_valid"],
    asserted_obligation_ids: [],
    violations: [],
  }),
);

const nowIso = new Date().toISOString();
const authorInput = {
  sessionId: SESSION_ID,
  roundId: "maturation-round-1",
  maturationQuestionFrontier: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: nowIso,
    maturation_baseline_ref: "maturation-baseline.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    actionability_matrix_ref: "baseline-actionability-matrix.yaml",
    actionability_matrix_validation_ref: "baseline-actionability-matrix-validation.yaml",
    questions: [{
      question_id: "q-citation",
      question:
        "Which specific part of the observed source establishes what this module exposes to callers?",
      materiality: "blocker",
      materiality_ref: "row-citation",
      actionability_surface_refs: ["dynamic_surface"],
      maturity_dimension_refs: ["evidence"],
      purpose_element_refs: ["purpose-citation"],
      baseline_row_refs: ["baseline-citation"],
      competency_question_refs: [],
      competency_assessment_refs: [],
      domain_competency_trace_refs: [],
      seed_ref_refs: ["object-citation"],
      current_answer_status: "unsupported",
      expected_answer_kind: "explanation",
      evidence_needed: "The passage that shows it.",
      authority_need: {
        authority_kind: "none",
        authority_scope: null,
        blocking_if_unavailable: true,
        expected_response_kind: "unavailable_reason",
      },
      closure_frontier_hint_refs: [],
      limitation_refs: [],
    }],
    directive_author: { owner: "host_llm", author_id: "citation-live" },
  },
  maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
  maturationQuestionFrontierValidation: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: nowIso,
    maturation_question_frontier_ref: "maturation-question-frontier.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    actionability_matrix_validation_ref: "baseline-actionability-matrix-validation.yaml",
    validation_status: "valid",
    question_count: 1,
    material_frontier_question_count: 1,
    validation_results: [],
    violations: [],
  },
  maturationClosureFrontier: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: nowIso,
    round_id: "maturation-round-1",
    question_frontier_ref: "maturation-question-frontier.yaml",
    source_requests: [{
      source_request_id: "req-citation",
      question_refs: ["q-citation"],
      member_scope_refs: [],
      member_source_refs: [],
      cross_material_ref_refs: [],
      requested_source_ref: subject.observation.source_ref,
      requested_location: subject.observation.source_ref,
      target_material_kind: "code",
      expected_evidence_kind: "pull source",
      reason: "needed",
    }],
    authority_requests: [],
    directive_author: { owner: "host_llm", author_id: "citation-live" },
  },
  maturationClosureFrontierValidation: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: nowIso,
    maturation_closure_frontier_ref: "maturation-closure-frontier.yaml",
    maturation_question_frontier_validation_ref: "maturation-question-frontier-validation.yaml",
    source_inventory_ref: "source-inventory.yaml",
    source_observations_ref: "source-observations.yaml",
    validation_status: "valid",
    source_request_count: 1,
    authority_request_count: 0,
    accepted_source_request_ids: ["req-citation"],
    rejected_source_requests: [],
    validation_results: [],
    asserted_obligation_ids: [],
    violations: [],
  },
  maturationAuthorityResponse: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: nowIso,
    closure_frontier_ref: "maturation-closure-frontier.yaml",
    responses: [],
  },
  maturationAuthorityResponseValidation: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: nowIso,
    maturation_authority_response_ref: "maturation-authority-response.yaml",
    maturation_closure_frontier_validation_ref: "maturation-closure-frontier-validation.yaml",
    validation_status: "valid",
    response_count: 0,
    provided_response_count: 0,
    unavailable_response_count: 0,
    validation_results: [],
    violations: [],
  },
  sourceObservations: { ...observationsArtifact, observations: catalog },
  observationReadPull: {
    observationsPath,
    safetyLedgerPath,
    safetyLedgerValidationPath,
    workDir,
  },
} as never;

console.log(`
observation-read CITATION layer — LIVE
  corpus:      ${observationsArtifact.observations.length} real observations, ${catalog.length} in the prompt catalog
  subject:     ${subjectId} (${subjectBody.length.toLocaleString()} chars)
  budget:      ${OBSERVATION_READ_RESULT_CHAR_BUDGET.toLocaleString()} rendered chars per result
  model:       ${MODEL} (effort ${EFFORT})
  evidence:    ${outDir}
`);

/**
 * Precondition run, free of quota: everything up to the dispatch happens for real — prompt catalog,
 * facade launch, descriptor — and then the injected call refuses instead of spending a session.
 *
 *   ONTO_CITATION_LIVE_DRY_RUN=1 npx tsx scripts/observation-citation-live.mts
 *
 * Worth its existence: an input-shape mistake in the 200 lines above would otherwise be discovered by
 * burning a real dispatch, and this track has already learned that a probe's own setup is where the
 * defects live.
 *
 * ITS BOUNDARY, stated because a check whose reach is unclear invites trust it has not earned: this
 * replaces `callLlm`, so everything INSIDE the dispatcher — route resolution above all — is unobserved
 * except by the mirrored assertion below. A dry run passing is not a promise the real route works.
 */
const DRY_RUN = process.env.ONTO_CITATION_LIVE_DRY_RUN === "1";
const DRY_RUN_SENTINEL = "observation-citation-live dry run: reached the dispatch";

// The REAL dispatcher: `llmCall` is omitted, so the author uses `callLlm` and the codex route registers
// the facade itself. Nothing about the path under test is stubbed.
const author = createDirectCallReconstructDirectiveAuthor({
  sourceObservationCatalogTool: true,
  // `provider`, not `provider_identity`: the facade's route guard reads
  // `config.plan ? config.plan.provider_identity : config.provider` (`llm-caller.ts:1682-1685`) and
  // the codex branch dispatches on `config.provider === "codex"` (`:1634-1640`). Setting the other
  // field looked right and resolved to a non-codex route — caught by the guard before any dispatch,
  // which is the guard doing exactly its job.
  llmConfig: {
    provider: "codex",
    model_id: MODEL,
    reasoning_effort: EFFORT,
  },
  authorId: "citation-live",
  ...(DRY_RUN
    ? {
      llmCall: (systemPrompt: string, userPrompt: string, config?: AnyRecord) => {
        writeFileSync(
          path.join(outDir, "dry-run-dispatch.json"),
          `${JSON.stringify({
            system_prompt_chars: systemPrompt.length,
            user_prompt_chars: userPrompt.length,
            provider: config?.provider,
            provider_identity: config?.plan?.provider_identity,
            model_id: config?.model_id,
            persist_worker_transcript: config?.persist_worker_transcript,
            facade_registered: config?.observation_read_facade !== undefined,
            tool_announced: userPrompt.includes("onto_observation_read"),
            catalog_ids_in_prompt: catalog
              .map((observation) => observation.observation_id as string)
              .filter((id) => userPrompt.includes(id)).length,
          }, null, 2)}\n`,
        );
        throw new Error(DRY_RUN_SENTINEL);
      },
    }
    : {}),
} as never);

const startedAtMs = Date.now();
let ledger: AnyRecord;
try {
  ledger = await (author as AnyRecord).writeAnswerSupportLedger(authorInput) as AnyRecord;
} catch (error) {
  if (DRY_RUN && (error as Error).message.includes(DRY_RUN_SENTINEL)) {
    const probe = JSON.parse(
      readFileSync(path.join(outDir, "dry-run-dispatch.json"), "utf8"),
    ) as AnyRecord;
    console.log(`\n  dry run reached the dispatch:\n${JSON.stringify(probe, null, 4)}`);
    // The route the facade demands. This mirrors `llm-caller.ts:1682-1685` rather than calling it —
    // the dry run replaces `callLlm`, so route resolution is the ONE thing it cannot observe directly.
    // The first live attempt failed exactly here, for free, because the guard runs before the dispatch.
    if ((probe.provider_identity ?? probe.provider) !== "codex") {
      fail(
        `the dispatch would resolve to a non-codex route (provider=${probe.provider}, ` +
          `plan.provider_identity=${probe.provider_identity}); the facade is codex-only`,
      );
    }
    if (probe.facade_registered !== true) fail("the facade was NOT registered on the dispatch config");
    if (probe.persist_worker_transcript !== true) {
      fail("the dispatch did not request a worker transcript — reconciliation would have nothing");
    }
    if (probe.catalog_ids_in_prompt === 0) fail("no catalogued observation id reached the prompt");
    console.log("\n✓ DRY RUN OK — the wiring is live. Re-run without ONTO_CITATION_LIVE_DRY_RUN.\n");
    process.exit(0);
  }
  writeFileSync(
    path.join(outDir, "failure.json"),
    `${JSON.stringify({ message: (error as Error).message, stack: (error as Error).stack }, null, 2)}\n`,
  );
  fail(`authoring threw: ${(error as Error).message}\n  see ${outDir}/failure.json`);
}
const elapsedMs = Date.now() - startedAtMs;
writeFileSync(path.join(outDir, "answer-support-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);
ok(`the author completed in ${(elapsedMs / 1000).toFixed(1)}s`);

// --- What the runtime emitted and what it admitted, read back from THIS run's own artifacts.
// The author names its artifacts with a launch token it generated internally, so find them by shape.
const { readdirSync } = await import("node:fs");
const workFiles = readdirSync(workDir);
const emissionsFile = workFiles.find((name) => name.startsWith("observation-read-emissions-"));
const deliveryFile = workFiles.find((name) => name.startsWith("observation-read-delivery-"));
if (!emissionsFile) fail(`no emissions record under ${workDir} — the facade never ran`);
if (!deliveryFile) fail(`no delivery record under ${workDir} — reconciliation never ran`);
const launchToken = emissionsFile.replace(/^observation-read-emissions-maturation-round-1-/, "")
  .replace(/\.json$/, "");

const emissions = readObservationReadFacadeEmissions(
  path.join(workDir, emissionsFile),
  launchToken,
);
if (!emissions) fail("the emissions record could not be read back for this launch");
const emitted = indexEmittedObservationRanges(emissions.emissions.map((e) => e.canonical_text));
if (emitted.size === 0) fail("no emitted ranges could be indexed; the citation surface is dead");

const delivery = readObservationReadDeliveryRecord(path.join(workDir, deliveryFile), launchToken);
if (!delivery) fail("the delivery record could not be read back for this launch");
writeFileSync(path.join(outDir, "delivery.json"), `${JSON.stringify(delivery, null, 2)}\n`);
if (delivery.status !== "verified") {
  fail(
    `delivery reconciliation reported ${delivery.status} (${delivery.reason}). The citation gate would ` +
      "have WITHHELD rather than admitted, which is correct behaviour but not what this run measures.",
  );
}
// The projection the citation gate itself applies. Passing the raw record to `deliveredCoversRange`
// would be a shape mismatch the compiler cannot see through a cast — it wants `{coverage}`, the record
// carries `{delivered}` — so the adapter is used here for the same reason the runtime uses it.
const citable = citableFromDeliveryRecord(delivery);
if (citable.basis !== "delivered") fail(`citable basis is ${citable.basis}, not delivered`);

// --- GATE 1. S4′ live reach: a page near the ceiling appeared VERBATIM in the worker's transcript.
const attested = delivery.attestation.filter((a) => a.disposition === "verbatim_delivered");
const largestAttested = Math.max(0, ...attested.map((a) => a.chars));
if (attested.length === 0) {
  fail(
    `NOTHING ATTESTED: ${delivery.attestation.length} page(s) served, none found verbatim in the ` +
      `worker's context. S4′'s live condition FAILS. See ${outDir}/delivery.json`,
  );
}
// Non-vacuous: attesting a 3 KB page says nothing about a ceiling that was mis-sized by 2x.
if (largestAttested < OBSERVATION_READ_RESULT_CHAR_BUDGET * 0.45) {
  fail(
    `the largest attested page is ${largestAttested.toLocaleString()} chars — far below the ` +
      `${OBSERVATION_READ_RESULT_CHAR_BUDGET.toLocaleString()} budget. This run cannot speak to the ` +
      "sizing; pick a subject whose pages fill the budget.",
  );
}
ok(
  `S4′ LIVE: ${attested.length}/${delivery.attestation.length} emitted page(s) found verbatim in the ` +
    `worker's own transcript, largest ${largestAttested.toLocaleString()} page chars ` +
    `(rendered budget ${OBSERVATION_READ_RESULT_CHAR_BUDGET.toLocaleString()})`,
);

// --- GATE 2. Every admitted ref carries range identity and resolves against what was emitted.
const clusters = (ledger.evidence_clusters ?? []) as AnyRecord[];
const refs = clusters.flatMap((cluster) => (cluster.evidence_refs ?? []) as AnyRecord[]);
if (refs.length === 0) {
  fail(
    "the ledger admitted no evidence refs at all — either every cluster was withheld or the worker " +
      `cited nothing. See ${outDir}/answer-support-ledger.json`,
  );
}
for (const ref of refs) {
  if (!ref.range) fail(`an admitted ref carries no range identity: ${JSON.stringify(ref)}`);
  const resolved = emitted.get(ref.range.range_id as string);
  if (!resolved) fail(`admitted ref names a range this launch never emitted: ${ref.range.range_id}`);
  if (!deliveredCoversRange(citable, resolved)) {
    fail(`admitted ref names a range the delivery record does not cover: ${ref.range.range_id}`);
  }
}
ok(`all ${refs.length} admitted ref(s) carry range identity and sit inside the delivered coverage`);

// --- GATE 3. The negative arm, on THIS run's real data: a delivered-but-uncited range must be
// refused if cited. Run deterministically rather than by asking the model to cite something wrong —
// the runtime is what is under test, not the model's obedience.
const citedRangeIds = new Set(refs.map((ref) => String(ref.range.range_id)));
const deliveredForSubject = delivery.delivered.find((d) => d.observation_id === subjectId);
const uncitedDelivered = [...emitted.entries()].filter(([rangeId, ref]) =>
  !citedRangeIds.has(rangeId) &&
  ref.observation_id === subjectId &&
  deliveredCoversRange(citable, ref)
);
const undeliveredEmitted = [...emitted.entries()].filter(([, ref]) =>
  ref.observation_id === subjectId && !deliveredCoversRange(citable, ref)
);
// ALWAYS available, whatever the model chose to fetch: a range that runs one character past the
// delivered coverage must be refused, and the same range one character short of it must be admitted.
// The pair is the contrast — a rule that answered "yes" to everything would pass the first check alone.
// This is ③-c on live data: the negative arm derived from THIS run's real delivery record rather than
// from a second dispatch or from asking the model to cite something wrong.
if (deliveredForSubject && deliveredForSubject.ranges.length > 0) {
  const [start, end] = deliveredForSubject.ranges[deliveredForSubject.ranges.length - 1]!;
  const sha = deliveredForSubject.observation_content_sha256;
  const inside = { observation_id: subjectId, observation_content_sha256: sha, body_start: start, body_end: end };
  const past = { observation_id: subjectId, observation_content_sha256: sha, body_start: start, body_end: end + 1 };
  if (!deliveredCoversRange(citable, inside)) {
    fail(`the containment rule refuses [${start},${end}), which this run's own record says was delivered`);
  }
  if (deliveredCoversRange(citable, past)) {
    fail(`the containment rule admits [${start},${end + 1}), one character past what was delivered`);
  }
  ok(
    `negative arm on live data: [${start},${end}) is citable and [${start},${end + 1}) — one character ` +
      "further — is refused",
  );
} else {
  fail("this run delivered no range for the subject; the negative arm below would be vacuous");
}

if (undeliveredEmitted.length > 0) {
  const [rangeId, ref] = undeliveredEmitted[0]!;
  if (deliveredCoversRange(citable, ref)) {
    fail(`the containment rule admits ${rangeId}, which the delivery record does not cover`);
  }
  ok(
    `negative arm: ${undeliveredEmitted.length} emitted range(s) of ${subjectId} were NOT delivered, ` +
      "and the containment rule refuses each — a citation naming one would throw",
  );
} else {
  note(
    "negative arm not exercised on this run: every emitted range of the subject was delivered, so " +
      "there is no served-but-undelivered range to refuse. The deterministic suite covers it.",
  );
}

// --- REPORTED, not gated: did the model actually read part and cite part?
const emittedForSubject = [...emitted.values()].filter((ref) => ref.observation_id === subjectId);
const citedForSubject = refs.filter((ref) => {
  const resolved = emitted.get(String(ref.range.range_id));
  return resolved?.observation_id === subjectId;
});
const citedChars = citedForSubject.reduce(
  (sum, ref) => sum + (Number(ref.range.body_end) - Number(ref.range.body_start)),
  0,
);
console.log(`
  subject ${subjectId}
    emitted ranges   ${emittedForSubject.length}
    delivered ranges ${deliveredForSubject?.ranges.length ?? 0} covering ${
  deliveredForSubject?.ranges.map(([s, e]) => `[${s},${e})`).join("+") ?? "nothing"
}
    cited ranges     ${citedForSubject.length} covering ${citedChars.toLocaleString()} of ${
  subjectBody.length.toLocaleString()
} chars (${((citedChars / subjectBody.length) * 100).toFixed(1)}%)`);
if (citedChars > 0 && citedChars < subjectBody.length) {
  ok(
    "PARTIAL CITATION OBSERVED LIVE — a real worker read a record it did not cite whole, and the " +
      "runtime admitted the part it cited. This is the property the track exists for.",
  );
} else if (citedChars >= subjectBody.length) {
  note(
    "the model cited the WHOLE record, so this run does not exhibit partial citation. The runtime " +
      "behaved correctly either way; the deterministic suite is what proves the partial rule.",
  );
}

writeFileSync(
  path.join(outDir, "verdict.json"),
  `${JSON.stringify({
    subject_id: subjectId,
    subject_body_chars: subjectBody.length,
    result_char_budget: OBSERVATION_READ_RESULT_CHAR_BUDGET,
    emitted_ranges: emittedForSubject.length,
    delivered_ranges: deliveredForSubject?.ranges ?? [],
    cited_range_ids: [...citedRangeIds],
    cited_chars: citedChars,
    attested: attested.length,
    attestation_total: delivery.attestation.length,
    largest_attested_page_chars: largestAttested,
    uncited_delivered_ranges: uncitedDelivered.length,
    undelivered_emitted_ranges: undeliveredEmitted.length,
    elapsed_ms: elapsedMs,
  }, null, 2)}\n`,
);

console.log(`
✓ RANGE CITATION LIVE PASS — a real codex worker fetched a real record through the facade, chose what
  to cite, and the runtime admitted exactly the ranges its own transcript proves arrived.
  evidence: ${outDir}/verdict.json
`);
