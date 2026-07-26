import { describe, expect, it } from "vitest";
import {
  ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT,
  POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT,
} from "./authoring-prompt-payloads.js";
import { createDirectCallReconstructDirectiveAuthor } from "./direct-call-directive-author.js";
import { SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET } from "./source-breadth-fold.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { authoredArtifactReuseMatch } from "./authored-artifact-reuse.js";
import type {
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";

// Spec basis: development-records/design/20260726-observation-catalog-tool-design.md §6 (push layer)
// and §9 stage 3. What stage 3a must be true of:
//   1. OFF is byte-identical to the pre-change projection (an independently-built oracle, not a
//      re-derivation of the code under test).
//   2. ON projects EVERY consumption-approved observation — the §1.2 silent supplemental truncation
//      is gone — as navigation rows with no per-observation detail.
//   3. ON demotes DETAIL, never breadth, when the catalog itself overflows, and discloses it.
//   4. ON fails BEFORE dispatch when even `anchor` does not fit.
// The pull layer (facade, grant token, citation⊆served) is stage 3b and is deliberately absent here.

const SESSION_ID = "observation-catalog-tool-fixture";
const CREATED_AT = "2026-07-27T00:00:00.000Z";

interface FixtureOptions {
  /** Supplemental (non-prioritized) observations. Default overshoots the OFF cap on purpose. */
  observationCount?: number;
  /** Chars of `summary` per observation — the knob that pushes the one_line rung over budget. */
  summaryChars?: number;
  /** Chars of source_ref padding — survives every rung, so it is the knob that beats `anchor`. */
  sourceRefChars?: number;
}

function fixture(options: FixtureOptions = {}) {
  const observationCount = options.observationCount ?? 70;
  const summaryChars = options.summaryChars ?? 40;
  const sourceRefChars = options.sourceRefChars ?? 0;
  const pad = "p".repeat(sourceRefChars);
  const sourceObservations: ReconstructSourceObservationsArtifact = {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    observations: [
      // The closure-prioritized one comes FIRST in prioritized order but LAST in the artifact, so a
      // test that only checks "the first N ids" cannot pass by accident.
      ...Array.from({ length: observationCount }, (_, index) => ({
        observation_id: `obs-${index + 1}`,
        target_material_kind: "code" as const,
        adapter_id: "fixture",
        source_ref: `/fixture/${pad}source-${index + 1}.ts`,
        location: `/fixture/${pad}source-${index + 1}.ts`,
        summary: `S${index + 1}`.padEnd(summaryChars, "s"),
        structural_data: {
          content_excerpt: "x".repeat(1_200),
          symbol_name: `fixture_${index + 1}`,
        },
      })),
      {
        observation_id: "obs-needed",
        target_material_kind: "document" as const,
        adapter_id: "fixture",
        source_ref: `/fixture/${pad}needed.md`,
        location: `/fixture/${pad}needed.md`,
        summary: "Needed maturation source observation".padEnd(summaryChars, "s"),
        structural_data: { content_excerpt: "needed ".repeat(220), section: "needed" },
      },
    ],
    skipped_refs: [],
    validation_results: [],
  };
  const questionFrontier: ReconstructMaturationQuestionFrontierArtifact = {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_baseline_ref: "maturation-baseline.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    actionability_matrix_ref: "baseline-actionability-matrix.yaml",
    actionability_matrix_validation_ref: "baseline-actionability-matrix-validation.yaml",
    questions: [{
      question_id: "maturation-question-needed-source",
      question: "What does the needed maturation source prove?",
      materiality: "blocker",
      materiality_ref: "matrix-row-needed",
      actionability_surface_refs: ["dynamic_surface"],
      maturity_dimension_refs: ["evidence"],
      purpose_element_refs: ["purpose-needed"],
      baseline_row_refs: ["baseline-needed"],
      competency_question_refs: [],
      competency_assessment_refs: [],
      domain_competency_trace_refs: [],
      seed_ref_refs: ["object-needed"],
      current_answer_status: "unsupported",
      expected_answer_kind: "explanation",
      evidence_needed: "Needed maturation source evidence.",
      authority_need: {
        authority_kind: "none",
        authority_scope: null,
        blocking_if_unavailable: true,
        expected_response_kind: "unavailable_reason",
      },
      closure_frontier_hint_refs: [],
      limitation_refs: [],
    }],
    directive_author: { owner: "host_llm", author_id: "fixture-author" },
  };
  const closureFrontier: ReconstructMaturationClosureFrontierArtifact = {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    round_id: "maturation-round-1",
    question_frontier_ref: "maturation-question-frontier.yaml",
    source_requests: [{
      source_request_id: "source-request-needed",
      question_refs: ["maturation-question-needed-source"],
      member_scope_refs: [],
      member_source_refs: [],
      cross_material_ref_refs: [],
      requested_source_ref: `/fixture/${pad}needed.md`,
      requested_location: `/fixture/${pad}needed.md`,
      target_material_kind: "document",
      expected_evidence_kind: "needed maturation source",
      reason: "The question needs this source.",
    }],
    authority_requests: [],
    directive_author: { owner: "host_llm", author_id: "fixture-author" },
  };
  return { sourceObservations, questionFrontier, closureFrontier };
}

function questionFrontierValidation() {
  return {
    schema_version: "1" as const,
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_question_frontier_ref: "maturation-question-frontier.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    actionability_matrix_validation_ref: "baseline-actionability-matrix-validation.yaml",
    validation_status: "valid" as const,
    question_count: 1,
    material_frontier_question_count: 1,
    validation_results: [],
    violations: [],
  };
}

function closureFrontierValidation() {
  return {
    schema_version: "1" as const,
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_closure_frontier_ref: "maturation-closure-frontier.yaml",
    maturation_question_frontier_validation_ref:
      "maturation-question-frontier-validation.yaml",
    source_inventory_ref: "source-inventory.yaml",
    source_observations_ref: "source-observations.yaml",
    validation_status: "valid" as const,
    source_request_count: 1,
    authority_request_count: 0,
    accepted_source_request_ids: ["source-request-needed"],
    rejected_source_requests: [],
    validation_results: [],
    asserted_obligation_ids: [],
    violations: [],
  };
}

function authorityResponse() {
  return {
    schema_version: "1" as const,
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    closure_frontier_ref: "maturation-closure-frontier.yaml",
    responses: [],
  };
}

function authorityResponseValidation() {
  return {
    schema_version: "1" as const,
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_authority_response_ref: "maturation-authority-response.yaml",
    maturation_closure_frontier_validation_ref:
      "maturation-closure-frontier-validation.yaml",
    validation_status: "valid" as const,
    response_count: 0,
    provided_response_count: 0,
    unavailable_response_count: 0,
    validation_results: [],
    violations: [],
  };
}

interface Dispatched {
  systemPrompt: string;
  userPrompt: string;
}

function capturingAuthor(observationCatalogTool: boolean) {
  const dispatched: Dispatched[] = [];
  const author = createDirectCallReconstructDirectiveAuthor({
    ...(observationCatalogTool ? { sourceObservationCatalogTool: true } : {}),
    llmCall: (systemPrompt, userPrompt) => {
      dispatched.push({ systemPrompt, userPrompt });
      return Promise.resolve({ text: JSON.stringify({ evidence_clusters: [] }) });
    },
  });
  return { author, dispatched };
}

async function authorLedger(
  author: ReturnType<typeof capturingAuthor>["author"],
  built: ReturnType<typeof fixture>,
): Promise<void> {
  await author.writeAnswerSupportLedger({
    sessionId: SESSION_ID,
    roundId: "maturation-round-1",
    maturationQuestionFrontier: built.questionFrontier,
    maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
    maturationQuestionFrontierValidation: questionFrontierValidation(),
    maturationClosureFrontier: built.closureFrontier,
    maturationClosureFrontierValidation: closureFrontierValidation(),
    maturationAuthorityResponse: authorityResponse(),
    maturationAuthorityResponseValidation: authorityResponseValidation(),
    sourceObservations: built.sourceObservations,
  });
}

interface CapturedPayload {
  source_observation_prompt_policy: Record<string, unknown>;
  prompt_visible_observation_ids: string[];
  source_observations: Record<string, unknown>[];
}

const parsePayload = (dispatched: Dispatched[]): CapturedPayload =>
  JSON.parse(dispatched[0]!.userPrompt) as CapturedPayload;

/**
 * The order the catalog is expected in, re-derived from the FIXTURE rather than from the code under
 * test: the closure request's ref is prioritized, so its observations come first (artifact order),
 * then everything else in artifact order. Writing this out is what caught the author's real ordering
 * (prioritized-first, not artifact-first) instead of assuming it.
 */
function expectedCatalogOrder(built: ReturnType<typeof fixture>): string[] {
  const requestedRef = built.closureFrontier.source_requests[0]!.requested_source_ref;
  const observations = built.sourceObservations.observations;
  const prioritized = observations
    .filter((o) => o.source_ref === requestedRef)
    .map((o) => o.observation_id);
  const rest = observations
    .filter((o) => o.source_ref !== requestedRef)
    .map((o) => o.observation_id);
  return [...prioritized, ...rest];
}

/**
 * Row-level identity oracle. Counting rows and reading the separate id LIST is not enough: a
 * projection that emits N copies of one row keeps both numbers right (cross-family review named
 * exactly that surviving defect). This compares each row's identity AND its values against the input
 * artifact, in order, so a duplicated, reordered, or value-swapped catalog fails.
 */
function expectRowsMatchObservations(
  rows: Record<string, any>[],
  observations: readonly Record<string, any>[],
  expectedIds: readonly string[],
): void {
  expect(expectedIds.length).toBeGreaterThan(0); // non-empty subject: the loop below can fail
  const byId = new Map(observations.map((o) => [o.observation_id, o]));
  expect(rows.map((row) => row.observation_id)).toEqual([...expectedIds]);
  expect(new Set(rows.map((row) => row.observation_id)).size).toBe(rows.length);
  for (const row of rows) {
    const observation = byId.get(row.observation_id);
    expect(observation).toBeDefined();
    expect(row.source_ref).toBe(observation!.source_ref);
    if ("summary" in row) expect(row.summary).toBe(observation!.summary);
    expect(row.target_material_kind).toBe(observation!.target_material_kind);
  }
}

describe("observation catalog tool — stage 3a push layer (design 20260726 §6)", () => {
  it("OFF: the dispatched payload is byte-identical to the pre-change projection", async () => {
    const built = fixture();
    const { author, dispatched } = capturingAuthor(false);
    await authorLedger(author, built);
    expect(dispatched.length).toBe(1);

    // Independent oracle: the payload the PRE-STAGE-3A code built, written out here in its original
    // key order with its original literal values. It shares no code with the projection under test
    // except the observation projector itself, so a refactor that silently reordered keys, dropped a
    // field, or changed a policy value fails here rather than passing by re-derivation.
    const payload = JSON.parse(dispatched[0]!.userPrompt) as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual([
      "round_id",
      "question_frontier_ref",
      "question_frontier_validation",
      "questions",
      "closure_frontier",
      "closure_frontier_validation",
      "authority_response",
      "authority_response_validation",
      "source_observation_prompt_policy",
      "prompt_visible_observation_ids",
      "source_observations",
    ]);
    expect(payload.source_observation_prompt_policy).toEqual({
      projection_kind: "maturation_answer_support_bounded_catalog",
      selection_basis:
        "Runtime includes all closure-prioritized source observations in global closure-hint, all requested, all member, all cross-material source-ref category order when they fit the cap, then fills remaining prompt slots with supplemental observations; semantic answer support remains LLM-owned.",
      source_observation_count: 71,
      prioritized_observation_count: 1,
      prompt_observation_count: ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT,
      prompt_visible_prioritized_observation_count: 1,
      prompt_visible_supplemental_observation_count:
        ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT - 1,
      omitted_prioritized_observation_count: 0,
      observation_limit: ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT,
      content_excerpt_char_limit: POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT,
    });
    // OFF still carries DETAIL (so "ON drops detail" below is a real contrast, not a vacuous one).
    const rows = payload.source_observations as Record<string, any>[];
    expect(rows.length).toBe(ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT);
    expect(rows[0]!.structural_data.content_excerpt.length).toBe(
      POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT,
    );
    // Row-level identity, not just a count: the prioritized observation first (it is the closure
    // request's ref), then the supplemental ones in artifact order, each carrying ITS OWN values.
    const expectedOffIds = expectedCatalogOrder(built)
      .slice(0, ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT);
    expectRowsMatchObservations(
      rows,
      built.sourceObservations.observations as never,
      expectedOffIds,
    );
    expect(payload.prompt_visible_observation_ids).toEqual(expectedOffIds);
  });

  it("OFF: supplemental observations past the cap are dropped SILENTLY — the defect stage 3a removes", async () => {
    const built = fixture({ observationCount: 70 });
    const { author, dispatched } = capturingAuthor(false);
    await authorLedger(author, built);
    const payload = parsePayload(dispatched);

    // 71 approved observations in, 64 out — and the only omission counter reports zero, which is
    // exactly why the truncation is invisible today (design §1.2).
    expect(built.sourceObservations.observations.length).toBe(71);
    expect(payload.prompt_visible_observation_ids.length).toBe(
      ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT,
    );
    expect(payload.source_observation_prompt_policy.omitted_prioritized_observation_count).toBe(0);
    expect(payload.prompt_visible_observation_ids).not.toContain("obs-70");
  });

  it("ON: every approved observation is offered, with no slot cap and no detail", async () => {
    const built = fixture({ observationCount: 70 });
    const { author, dispatched } = capturingAuthor(true);
    await authorLedger(author, built);
    const payload = parsePayload(dispatched);

    const allIds = built.sourceObservations.observations.map((o) => o.observation_id);
    expect(allIds.length).toBeGreaterThan(ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT); // not vacuous
    expect(payload.prompt_visible_observation_ids.length).toBe(allIds.length);
    expect(new Set(payload.prompt_visible_observation_ids)).toEqual(new Set(allIds));
    expect(payload.source_observations.length).toBe(allIds.length);
    // The id OFF dropped is present here — the direct contrast with the test above.
    expect(payload.prompt_visible_observation_ids).toContain("obs-70");

    // Row-level identity: N rows with the right ids is not enough — the ROWS must be the
    // observations, in order, with their own values (the duplicated-row defect otherwise survives).
    expectRowsMatchObservations(
      payload.source_observations,
      built.sourceObservations.observations as never,
      expectedCatalogOrder(built),
    );
    expect(payload.prompt_visible_observation_ids).toEqual(expectedCatalogOrder(built));

    // Navigation rows: the semantic anchor, none of the detail the pull layer will serve.
    const row = payload.source_observations[0]!;
    expect(Object.keys(row).sort()).toEqual(
      ["location", "observation_id", "source_ref", "summary", "target_material_kind"].sort(),
    );
    expect(row).not.toHaveProperty("structural_data");
    expect(JSON.stringify(payload.source_observations)).not.toContain("content_excerpt");

    expect(payload.source_observation_prompt_policy).toMatchObject({
      projection_kind: "maturation_answer_support_navigation_catalog",
      // null, not 64: reporting a cap that no code applies would misdescribe the projection.
      observation_limit: null,
      content_excerpt_char_limit: null,
      prompt_observation_count: allIds.length,
    });
  });

  it("ON: region siblings past MAX_PROJECTED_REGIONS_PER_FILE stay selectable (cross-family review F1)", async () => {
    // Every other fixture here gives each observation its own source_ref, which makes the region cap
    // invisible — the reviewer's point. This one puts 9 regions in ONE file: OFF drops the 9th with
    // no counter (the §1.2 defect on the region axis), ON must offer all 9.
    const built = fixture({ observationCount: 0 });
    built.sourceObservations.observations = Array.from({ length: 9 }, (_, index) => ({
      observation_id: `region-${index + 1}`,
      target_material_kind: "code" as const,
      adapter_id: "fixture",
      source_ref: "/fixture/decomposed.ts",
      location: `L${index * 10}-${index * 10 + 9}`,
      summary: `Region ${index + 1}`,
      structural_data: { content_excerpt: "x".repeat(200) },
    }));
    built.closureFrontier.source_requests[0]!.requested_source_ref = "/fixture/decomposed.ts";
    built.closureFrontier.source_requests[0]!.requested_location = "/fixture/decomposed.ts";

    const off = capturingAuthor(false);
    const on = capturingAuthor(true);
    await authorLedger(off.author, built);
    await authorLedger(on.author, built);

    const offIds = parsePayload(off.dispatched).prompt_visible_observation_ids;
    const onIds = parsePayload(on.dispatched).prompt_visible_observation_ids;
    expect(offIds.length).toBe(8); // the cap bites, and nothing reports it
    expect(parsePayload(off.dispatched).source_observation_prompt_policy
      .omitted_prioritized_observation_count).toBe(0);
    expect(onIds.length).toBe(9);
    expect(onIds).toContain("region-9");
    const allRegionIds = expectedCatalogOrder(built);
    expect(onIds).toEqual(allRegionIds);
    expectRowsMatchObservations(
      parsePayload(on.dispatched).source_observations,
      built.sourceObservations.observations as never,
      allRegionIds,
    );
    // And OFF's set is a strict subset — the exact 8 the cap kept, not "some 8".
    expect(offIds).toEqual(allRegionIds.slice(0, 8));
  });

  it("ON: the navigation catalog is smaller than OFF's capped detailed one — on MORE observations", async () => {
    const built = fixture({ observationCount: 70 });
    const off = capturingAuthor(false);
    const on = capturingAuthor(true);
    await authorLedger(off.author, built);
    await authorLedger(on.author, built);
    expect(on.dispatched[0]!.userPrompt.length).toBeLessThan(
      off.dispatched[0]!.userPrompt.length,
    );
    // "Smaller" must not be achievable by truncation: ON carries MORE rows than OFF, each distinct.
    const onRows = parsePayload(on.dispatched).source_observations;
    const offRows = parsePayload(off.dispatched).source_observations;
    expect(onRows.length).toBeGreaterThan(offRows.length);
    expectRowsMatchObservations(
      onRows,
      built.sourceObservations.observations as never,
      expectedCatalogOrder(built),
    );
  });

  it("ON: an over-budget catalog demotes to summary_anchor — the SUMMARIES survive (rung pinned)", async () => {
    // Long refs with a redundant `location` and short summaries: dropping the repeated `location`
    // alone is enough, so this must land on summary_anchor and KEEP the selection signal. Measured
    // shape — at 1,200 the pinned rung still fits, at 1,600 it does not.
    const built = fixture({ observationCount: 1_600, sourceRefChars: 300, summaryChars: 10 });
    const { author, dispatched } = capturingAuthor(true);
    await authorLedger(author, built);

    expect(dispatched.length).toBe(1);
    const { systemPrompt, userPrompt } = dispatched[0]!;
    expect(
      Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(userPrompt, "utf8"),
    ).toBeLessThanOrEqual(SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET);

    const payload = parsePayload(dispatched);
    const total = built.sourceObservations.observations.length;
    expect(payload.source_observations.length).toBe(total); // breadth: nothing dropped
    expectRowsMatchObservations(
      payload.source_observations,
      built.sourceObservations.observations as never,
      expectedCatalogOrder(built),
    );

    const records = author.sourceBreadthFoldDisclosures ?? [];
    expect(records.length).toBe(1);
    expect(records[0]!.surface).toBe("maturation_answer_support");
    expect(records[0]!.disclosure.fold_level).toBe("summary_anchor");
    expect(records[0]!.disclosure.finer_levels_over_budget).toEqual(["one_line"]);
    expect(records[0]!.disclosure.over_budget).toBe(false);
    expect(records[0]!.disclosure.catalog_observation_count).toBe(total);
    expect(records[0]!.disclosure.measured_prompt_bytes).toBe(
      Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(userPrompt, "utf8"),
    );
    // The rung's SHAPE: redundant `location` gone, `summary` kept. A fold that skipped to `anchor`
    // would drop the summaries and fail here.
    expect(payload.source_observations[0]).not.toHaveProperty("location");
    expect(payload.source_observations[0]).toHaveProperty("summary");
  });

  it("ON: a still-over-budget catalog demotes to anchor, keeps every observation, discloses the rung", async () => {
    // Summaries big enough that dropping the redundant `location` is not enough, so the ladder
    // reaches its last rung before fail-loud. Breadth must survive even there.
    const built = fixture({ observationCount: 3_000, summaryChars: 400 });
    const { author, dispatched } = capturingAuthor(true);
    await authorLedger(author, built);

    expect(dispatched.length).toBe(1);
    const { systemPrompt, userPrompt } = dispatched[0]!;
    expect(
      Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(userPrompt, "utf8"),
    ).toBeLessThanOrEqual(SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET);

    const payload = parsePayload(dispatched);
    const total = built.sourceObservations.observations.length;
    expect(payload.source_observations.length).toBe(total); // breadth: nothing dropped
    expect(payload.prompt_visible_observation_ids.length).toBe(total);
    expectRowsMatchObservations(
      payload.source_observations,
      built.sourceObservations.observations as never,
      expectedCatalogOrder(built),
    );

    const records = author.sourceBreadthFoldDisclosures ?? [];
    expect(records.length).toBe(1);
    expect(records[0]!.surface).toBe("maturation_answer_support");
    // Pin the rung: 400-char summaries mean summary_anchor is not enough, so `anchor` is correct
    // here — and the finer rungs it rejected are disclosed.
    expect(records[0]!.disclosure.fold_level).toBe("anchor");
    expect(records[0]!.disclosure.catalog_observation_count).toBe(total);
    expect(records[0]!.disclosure.over_budget).toBe(false);
    expect(records[0]!.disclosure.finer_levels_over_budget).toEqual([
      "one_line",
      "summary_anchor",
    ]);
    // The disclosed byte count is the measurement of the payload that was actually dispatched.
    expect(records[0]!.disclosure.measured_prompt_bytes).toBe(
      Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(userPrompt, "utf8"),
    );
    // `anchor` is navigation identity only: both the redundant `location` and the summary are gone.
    expect(payload.source_observations[0]).not.toHaveProperty("location");
    expect(payload.source_observations[0]).not.toHaveProperty("summary");
  });

  it("ON: a catalog that fits the pinned rung discloses NOTHING (a demotion notice is not noise)", async () => {
    const built = fixture({ observationCount: 70 });
    const { author, dispatched } = capturingAuthor(true);
    await authorLedger(author, built);
    expect(dispatched.length).toBe(1);
    expect(author.sourceBreadthFoldDisclosures ?? []).toEqual([]);
  });

  it("ON: when even `anchor` overflows the run fails BEFORE dispatch", async () => {
    // source_ref survives every rung, so long paths beat the coarsest one — the design's
    // "even anchor does not fit" case.
    const built = fixture({ observationCount: 4_000, sourceRefChars: 400 });
    const { author, dispatched } = capturingAuthor(true);
    await expect(authorLedger(author, built)).rejects.toThrow(
      /AnswerSupportLedger compact prompt exceeds deterministic prompt budget/,
    );
    expect(dispatched.length).toBe(0); // no worker was started

    // Contrast: the SAME observation count with short refs dispatches fine, so the refusal is about
    // SIZE and not a count threshold (a count-based early reject would pass the assertions above).
    const shortRefs = fixture({ observationCount: 4_000, sourceRefChars: 0 });
    const shortRun = capturingAuthor(true);
    await authorLedger(shortRun.author, shortRefs);
    expect(shortRun.dispatched.length).toBe(1);
    expect(parsePayload(shortRun.dispatched).source_observations.length).toBe(4_001);
  });
});

describe("observation catalog tool — production wiring (cross-family review, lens B #8)", () => {
  // The author-level tests above construct the author directly, so every one of them stays green if
  // the settings key never reaches the author. These close that hop.
  const repoFile = (relative: string): string =>
    readFileSync(join(fileURLToPath(new URL("../../..", import.meta.url)), relative), "utf8");

  it("Core API reads the settings key and forwards it to BOTH author constructions", () => {
    const api = repoFile("src/core-api/reconstruct-api.ts");
    // Read from settings (not a literal): a `const sourceObservationCatalogTool = false` mutation
    // silently turns production ON runs into OFF runs and no author-level test can see it.
    expect(api).toContain(
      "settings.reconstruct?.execution?.source_observation_catalog_tool === true",
    );
    // Primary AND dispatch-fallback author: a fallback dispatch must not author in the other mode.
    const forwards = api.match(
      /\.\.\.\(sourceObservationCatalogTool \? \{ sourceObservationCatalogTool: true \} : \{\}\)/g,
    ) ?? [];
    expect(forwards.length).toBe(2);
  });

  it("the reuse key rotates with the mode — an ON artifact can never key as an OFF one", () => {
    const authorOf = (catalogTool: boolean) =>
      createDirectCallReconstructDirectiveAuthor({
        ...(catalogTool ? { sourceObservationCatalogTool: true } : {}),
        llmCall: () => Promise.resolve({ text: "{}" }),
      } as never);
    const matchFor = (catalogTool: boolean) =>
      authoredArtifactReuseMatch({
        sessionId: SESSION_ID,
        intent: "reuse-key probe",
        targetRefs: ["/fixture/target.ts"],
        targetMaterialProfile: {
          target_refs: ["/fixture/target.ts"],
          target_material_kind: "code",
          target_material_kind_candidates: [],
          support_status: "supported",
          selected_source_profiles: [],
          detection: { per_ref: [] },
        },
        sourceInventory: { inventory_units: [] },
        sourceObservations: { observations: [], skipped_refs: [] },
        governingSnapshot: { requested_domain_ids: [] },
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "direct_call",
        directiveAuthor: authorOf(catalogTool),
        confirmationProvider: { providerId: "probe-provider" },
      } as never);
    const off = matchFor(false);
    const on = matchFor(true);
    // The field carries the mode...
    expect(off.source_observation_catalog_tool).toBe(false);
    expect(on.source_observation_catalog_tool).toBe(true);
    // ...and the two keys are genuinely different objects (so a resume cannot cross modes). Compared
    // by serialization, which is what reuseMatchHash hashes.
    expect(JSON.stringify(on)).not.toBe(JSON.stringify(off));
    // Non-vacuous: everything ELSE about the two keys is identical, so the difference is the mode.
    expect({ ...on, source_observation_catalog_tool: false }).toEqual(off);
  });

  it("run.ts drains the disclosure in a `finally`, so a FAILED authoring still records the demotion", () => {
    // Structural, and honest about it: the drain lives in runReconstruct, and reaching it with a real
    // demoting corpus AND a failing dispatch needs a whole-pipeline fixture. What this pins is the
    // control flow the two review lenses independently flagged — drain-on-success-only loses the
    // record precisely when it is the diagnostic, and the next run clears the sink.
    const run = repoFile("src/core-runtime/reconstruct/run.ts");
    const calls = run.match(/drainAnswerSupportFoldDisclosures\(\);/g) ?? [];
    expect(calls.length).toBe(1); // the only call site
    expect(run).toMatch(/\}\s*finally\s*\{\s*\n\s*drainAnswerSupportFoldDisclosures\(\);/);
  });

  it("run.ts derives the demotion wording from the ladder module rather than hard-coding it", () => {
    // Lens B #5: the new wording unit test lives beside the helper, so a stale hard-coded message at
    // the call site would leave it green. This asserts the call site actually uses the helper.
    const run = repoFile("src/core-runtime/reconstruct/run.ts");
    expect(run).toContain("breadthFoldRungDetailLoss(disclosure.fold_level)");
    expect(run).not.toMatch(/per-observation summaries were dropped/);
  });
});

