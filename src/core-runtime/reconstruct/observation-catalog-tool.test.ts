import { describe, expect, it } from "vitest";
import {
  ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT,
  POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT,
} from "./authoring-prompt-payloads.js";
import { createDirectCallReconstructDirectiveAuthor } from "./direct-call-directive-author.js";
import {
  answerSupportFoldDisclosureMessage,
  breadthFoldRungDetailLoss,
  navigationRowFieldsFromRows,
  projectBreadthFoldTailRung,
  SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
  type BreadthFoldLevel,
} from "./source-breadth-fold.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORED_OUTPUT_CONTRACT_VERSION,
  authoredArtifactReuseMatch,
} from "./authored-artifact-reuse.js";
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
 * test. Prioritized refs come first in CATEGORY order — question hints, then requested refs, then
 * member refs, then cross-material refs (the four categories the production rule reads) — and each
 * category's observations follow artifact order; everything unprioritized follows in artifact order.
 *
 * Modelling all four categories, not just the requested ref: with one request and empty hint/member/
 * cross arrays a one-category oracle AGREES BY COINCIDENCE, so a production defect that ignored hints
 * or member refs would pass (cross-family review, third round). The multi-category fixture below is
 * what makes this oracle bind.
 */
function expectedCatalogOrder(built: ReturnType<typeof fixture>): string[] {
  const hintRefs = built.questionFrontier.questions.flatMap((question) =>
    question.closure_frontier_hint_refs.flatMap((hint) =>
      hint.startsWith("source:") ? [hint.slice("source:".length)] : []
    )
  );
  const requests = built.closureFrontier.source_requests;
  const categoryRefs = [
    ...hintRefs,
    ...requests.map((request) => request.requested_source_ref),
    ...requests.flatMap((request) => request.member_source_refs),
    ...requests.flatMap((request) => request.cross_material_ref_refs),
  ].filter((ref) => ref.length > 0);
  const observations = built.sourceObservations.observations;
  const prioritized: string[] = [];
  for (const ref of [...new Set(categoryRefs)]) {
    for (const observation of observations) {
      if (observation.source_ref === ref && !prioritized.includes(observation.observation_id)) {
        prioritized.push(observation.observation_id);
      }
    }
  }
  const rest = observations
    .map((o) => o.observation_id)
    .filter((id) => !prioritized.includes(id));
  return [...prioritized, ...rest];
}

/**
 * The navigation keys a rung keeps FOR ONE OBSERVATION, derived by running the real tail projector over
 * that observation's one_line row rather than by restating the rule. The one_line shape is the
 * observation's own navigation fields — which is what the projector emits with includeStructuralData
 * off, and what the `one_line` test pins explicitly, so the two checks brace each other.
 *
 * Deliberate limit: because the expectation runs the SAME tail projector the catalog used, this oracle
 * cannot catch a defect INSIDE projectBreadthFoldTailRung — it catches the author using it wrongly, or
 * not at all. The projector's own key-dropping rules (strict subsets, `location` kept exactly where it
 * is not redundant with `source_ref`) are pinned directly in source-breadth-fold.test.ts. Note the
 * production projector emits all five navigation keys unconditionally, so a key absent from the
 * observation arrives as `undefined` and JSON drops it — which is why reconstructing from `key in
 * observation` matches the parsed row.
 */
function expectedNavigationKeys(
  observation: Record<string, any>,
  rung: BreadthFoldLevel,
): string[] {
  const oneLineRow = Object.fromEntries(
    (["observation_id", "target_material_kind", "source_ref", "location", "summary"] as const)
      .filter((key) => key in observation)
      .map((key) => [key, observation[key]]),
  );
  if (rung === "one_line") return Object.keys(oneLineRow);
  if (rung === "summary_anchor" || rung === "anchor") {
    const [projected] = projectBreadthFoldTailRung([oneLineRow], rung) as Record<string, any>[];
    return Object.keys(projected ?? {});
  }
  throw new Error(
    `expectedNavigationKeys: '${rung}' is not a navigation rung. Pass the DISPATCHED rung (or ` +
      "`exactKeys` for a homogeneous catalog) — an unpinned row shape checks nothing.",
  );
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
  options: {
    navigationOnly?: boolean;
    exactKeys?: readonly string[];
    /** The dispatched rung. Given instead of `exactKeys`, each row's expected key set is DERIVED from
     *  the real tail projector for THAT observation — which is the only correct expectation for a mixed
     *  catalog, where the rung keeps `location` per row. */
    rung?: BreadthFoldLevel;
  } = {},
): void {
  expect(expectedIds.length).toBeGreaterThan(0); // non-empty subject: the loop below can fail
  const byId = new Map(observations.map((o) => [o.observation_id, o]));
  expect(rows.map((row) => row.observation_id)).toEqual([...expectedIds]);
  expect(new Set(rows.map((row) => row.observation_id)).size).toBe(rows.length);
  // Every navigation key the rung carries is compared against the observation it claims to be —
  // `location` included. Under region decomposition `location` is the ONLY thing telling siblings of
  // one file apart, so an oracle that skipped it passed a catalog with one region's location copied
  // onto every row (cross-family review, third round).
  const NAVIGATION_KEYS = [
    "observation_id",
    "target_material_kind",
    "source_ref",
    "location",
    "summary",
  ] as const;
  for (const row of rows) {
    const observation = byId.get(row.observation_id);
    expect(observation).toBeDefined();
    // EVERY row's key set, and equality rather than "no extras": a rung that dropped `location` from
    // every row after index 0, or kept `summary` on every `anchor` row after index 0, satisfied an
    // extras-only check over the union of all rung keys (cross-family review, fourth round).
    //
    // `exactKeys` pins a HOMOGENEOUS catalog's shape. A mixed catalog is legitimate — the tail rungs
    // keep `location` per row, only where it is not redundant with `source_ref` — so when the caller
    // does not pin a shape, each row is checked against what the rung keeps for THAT observation
    // rather than against the first row (which would report a false failure on a mixed corpus).
    if (options.navigationOnly === true) {
      // EVERY row's exact key set. `exactKeys` pins a homogeneous catalog; `rung` derives the
      // expectation per row from the REAL tail projector, which is the only correct expectation for a
      // mixed catalog (the rung keeps `location` per row). Neither is optional: a "no unknown keys"
      // relaxation let a projection drop `location` from rows 1..N and still pass (cross-family review,
      // sixth round — a regression the fifth round's fix introduced).
      const expectedKeys = options.exactKeys
        ? [...options.exactKeys].sort()
        : expectedNavigationKeys(observation!, options.rung!).sort();
      expect(expectedKeys.length).toBeGreaterThan(0);
      expect(expectedKeys.filter((key) => !NAVIGATION_KEYS.includes(key as never))).toEqual([]);
      expect(Object.keys(row).sort()).toEqual(expectedKeys);
    }
    for (const key of NAVIGATION_KEYS) {
      if (key in row) expect(row[key]).toBe(observation![key]);
    }
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
      { navigationOnly: true, rung: "one_line" },
    );
    expect(payload.prompt_visible_observation_ids).toEqual(expectedCatalogOrder(built));

    // Navigation rows: the semantic anchor, none of the detail the pull layer will serve.
    const row = payload.source_observations[0]!;
    expect(Object.keys(row).sort()).toEqual(
      ["location", "observation_id", "source_ref", "summary", "target_material_kind"].sort(),
    );
    expect(row).not.toHaveProperty("structural_data");
    expect(JSON.stringify(payload.source_observations)).not.toContain("content_excerpt");

    expect(payload.source_observation_prompt_policy.selection_basis).toContain(
      navigationRowFieldsFromRows(payload.source_observations),
    );
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
      { navigationOnly: true, rung: "one_line" },
    );
    // And OFF's set is a strict subset — the exact 8 the cap kept, not "some 8".
    expect(offIds).toEqual(allRegionIds.slice(0, 8));
  });

  it("ON: prioritized refs lead in CATEGORY order — hint, requested, member, cross-material", async () => {
    // Every other fixture has ONE prioritized category, which makes a one-category oracle agree by
    // coincidence (cross-family review, third round). This one populates all four so the order is
    // actually pinned: a production rule that ignored hints or member refs must fail here.
    const built = fixture({ observationCount: 4 });
    const refOf = (index: number) => `/fixture/source-${index}.ts`;
    built.questionFrontier.questions[0]!.closure_frontier_hint_refs = [`source:${refOf(3)}`];
    built.closureFrontier.source_requests[0]!.member_source_refs = [refOf(1)];
    built.closureFrontier.source_requests[0]!.cross_material_ref_refs = [refOf(4)];

    const { author, dispatched } = capturingAuthor(true);
    await authorLedger(author, built);
    const payload = parsePayload(dispatched);

    // hint(source-3) -> requested(needed.md) -> member(source-1) -> cross(source-4) -> rest(source-2)
    expect(payload.prompt_visible_observation_ids).toEqual([
      "obs-3",
      "obs-needed",
      "obs-1",
      "obs-4",
      "obs-2",
    ]);
    // ...and the fixture-derived oracle agrees with that hand-written order, so the two disagree
    // whenever either drifts.
    expect(payload.prompt_visible_observation_ids).toEqual(expectedCatalogOrder(built));
    expectRowsMatchObservations(
      payload.source_observations,
      built.sourceObservations.observations as never,
      expectedCatalogOrder(built),
      { navigationOnly: true, rung: "one_line" },
    );
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
      { navigationOnly: true, rung: "one_line" },
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
      {
        navigationOnly: true,
        // Whole-file rows at summary_anchor: the source_ref-redundant `location` is gone, summary stays.
        exactKeys: ["observation_id", "target_material_kind", "source_ref", "summary"],
      },
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
    // And the policy describes THAT rung's fields, measured with the payload that was dispatched.
    expect(payload.source_observation_prompt_policy.selection_basis).toContain(
      navigationRowFieldsFromRows(payload.source_observations),
    );
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
      {
        navigationOnly: true,
        // `anchor` on whole-file rows: navigation identity only.
        exactKeys: ["observation_id", "target_material_kind", "source_ref"],
      },
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
    // ...and the dispatched POLICY says so. A fixed sentence claimed `summary` was present exactly
    // where the rung had removed it, i.e. the worker was handed a false input contract precisely when
    // it had least to work with (cross-family review, third round).
    expect(payload.source_observation_prompt_policy.selection_basis).toContain(
      navigationRowFieldsFromRows(payload.source_observations),
    );
    expect(payload.source_observation_prompt_policy.selection_basis).not.toContain("summary)");
  });

  it("ON: a catalog that fits the pinned rung discloses NOTHING (a demotion notice is not noise)", async () => {
    const built = fixture({ observationCount: 70 });
    const { author, dispatched } = capturingAuthor(true);
    await authorLedger(author, built);
    expect(dispatched.length).toBe(1);
    expect(author.sourceBreadthFoldDisclosures ?? []).toEqual([]);
  });

  it("ON: a REGION corpus cannot buy a demotion with a shorter policy sentence", async () => {
    // The pathology two independent lenses converged on: `summary_anchor` drops `location` only where
    // it is redundant with `source_ref`, so on region rows (distinct locations) the ROWS are unchanged.
    // With a rung-keyed policy sentence, that rung measured ~10 bytes smaller purely because the
    // sentence falsely omitted `location` — so a corpus one byte over budget "demoted" to a rung that
    // dispatched identical rows, and the disclosure claimed locations were dropped when none were.
    // Deriving the sentence from the ROWS makes summary_anchor measure EXACTLY what one_line does, so
    // the ladder walks on to `anchor` — which really does drop something.
    const REF = "/fixture/one-big-file.ts";
    const built = fixture({ observationCount: 0 });
    built.sourceObservations.observations = Array.from({ length: 2_000 }, (_, index) => ({
      observation_id: `region-${index + 1}`,
      target_material_kind: "code" as const,
      adapter_id: "fixture",
      source_ref: REF,
      location: `L${index * 10}-${index * 10 + 9}${"z".repeat(300)}`,
      summary: `Region ${index + 1}`.padEnd(40, "s"),
      structural_data: {
        content_excerpt: "x",
        region_role: "body",
        region_line_start: index * 10,
      },
    }));
    built.closureFrontier.source_requests[0]!.requested_source_ref = REF;
    built.closureFrontier.source_requests[0]!.requested_location = REF;

    const { author, dispatched } = capturingAuthor(true);
    await authorLedger(author, built);
    expect(dispatched.length).toBe(1);
    const payload = parsePayload(dispatched);

    const records = author.sourceBreadthFoldDisclosures ?? [];
    expect(records.length).toBe(1);
    // summary_anchor is REJECTED, not chosen: it measures exactly what one_line measures here.
    expect(records[0]!.disclosure.fold_level).toBe("anchor");
    expect(records[0]!.disclosure.finer_levels_over_budget).toEqual([
      "one_line",
      "summary_anchor",
    ]);
    // Region rows keep `location` at `anchor` — it is the only sibling discriminator — and lose summary.
    expectRowsMatchObservations(
      payload.source_observations,
      built.sourceObservations.observations as never,
      expectedCatalogOrder(built),
      {
        navigationOnly: true,
        exactKeys: ["observation_id", "target_material_kind", "source_ref", "location"],
      },
    );
    // The dispatched contract says so: `location` present, `summary` absent.
    const basis = payload.source_observation_prompt_policy.selection_basis as string;
    expect(basis).toContain(navigationRowFieldsFromRows(payload.source_observations));
    expect(basis).toContain("location");
    expect(basis).not.toContain("summary)");
    // And the disclosure names the loss that actually happened.
    expect(answerSupportFoldDisclosureMessage(records[0]!.disclosure)).toContain(
      breadthFoldRungDetailLoss("anchor"),
    );
  });

  it("ON: a MIXED catalog's contract is true of every row — `location` only where the rung kept it", async () => {
    // Region rows keep `location` at the tail rungs; whole-file rows lose it. So one dispatched
    // catalog legitimately holds rows of two shapes, and a single field list — union or intersection —
    // would be false for one of them (cross-family review, fifth round).
    const REGION_REF = "/fixture/decomposed.ts";
    const built = fixture({ observationCount: 0 });
    built.sourceObservations.observations = [
      // Region rows: `location` differs from `source_ref`, so the rung keeps it.
      ...Array.from({ length: 1_000 }, (_, index) => ({
        observation_id: `region-${index + 1}`,
        target_material_kind: "code" as const,
        adapter_id: "fixture",
        source_ref: REGION_REF,
        location: `L${index * 10}-${index * 10 + 9}${"z".repeat(300)}`,
        summary: `Region ${index + 1}`.padEnd(40, "s"),
        structural_data: { content_excerpt: "x", region_role: "body", region_line_start: index * 10 },
      })),
      // Whole-file rows: `location` IS the path, so the rung drops it.
      ...Array.from({ length: 1_000 }, (_, index) => ({
        observation_id: `whole-${index + 1}`,
        target_material_kind: "code" as const,
        adapter_id: "fixture",
        source_ref: `/fixture/${"w".repeat(300)}whole-${index + 1}.ts`,
        location: `/fixture/${"w".repeat(300)}whole-${index + 1}.ts`,
        summary: `Whole ${index + 1}`.padEnd(40, "s"),
        structural_data: { content_excerpt: "x" },
      })),
    ];
    built.closureFrontier.source_requests[0]!.requested_source_ref = REGION_REF;
    built.closureFrontier.source_requests[0]!.requested_location = REGION_REF;

    const { author, dispatched } = capturingAuthor(true);
    await authorLedger(author, built);
    expect(dispatched.length).toBe(1);
    const payload = parsePayload(dispatched);
    const records = author.sourceBreadthFoldDisclosures ?? [];
    expect(records.length).toBe(1); // this corpus demotes; otherwise the shapes never diverge

    const regionRows = payload.source_observations.filter((row) =>
      String(row.observation_id).startsWith("region-")
    );
    const wholeRows = payload.source_observations.filter((row) =>
      String(row.observation_id).startsWith("whole-")
    );
    expect(regionRows.length).toBe(1_000);
    expect(wholeRows.length).toBe(1_000);
    // The two shapes really do differ — otherwise the assertion below is vacuous.
    expect(regionRows[0]).toHaveProperty("location");
    expect(wholeRows[0]).not.toHaveProperty("location");
    // ...and the contract says exactly that, rather than claiming `location` for all or for none.
    const basis = payload.source_observation_prompt_policy.selection_basis as string;
    expect(basis).toContain(navigationRowFieldsFromRows(payload.source_observations));
    expect(basis).toContain("location on some rows only");
    // Row identity holds across both shapes: no single exactKeys can describe a mixed catalog, so the
    // expectation is derived per row from the real tail projector at the dispatched rung.
    expectRowsMatchObservations(
      payload.source_observations,
      built.sourceObservations.observations as never,
      expectedCatalogOrder(built),
      { navigationOnly: true, rung: records[0]!.disclosure.fold_level },
    );
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

    // And NOTHING was disclosed: a disclosure recorded before the guard would be drained by
    // runReconstruct's `finally` as "every observation stayed selectable" for a catalog that never
    // left the process (cross-family review, third round).
    expect(author.sourceBreadthFoldDisclosures ?? []).toEqual([]);

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
    const constructions = api.match(/createDirectCallReconstructDirectiveAuthor\(/g) ?? [];
    // EVERY construction forwards it: a third author that omitted the flag would satisfy a
    // "at least two forwards" check while running production OFF (cross-family review, third round).
    expect(constructions.length).toBeGreaterThan(0);
    expect(forwards.length).toBe(constructions.length);
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
    const {
      authored_output_contract_version: _contractVersion,
      delivered_citation_rule_version: _citationRule,
      ...onWithoutOnOnlyFields
    } = on;
    expect({ ...onWithoutOnOnlyFields, source_observation_catalog_tool: false }).toEqual(off);

    // The citation rule rides the SAME switch. A ledger authored while citations were judged against
    // the served set is not admissible under a rule that judges them against the delivered set, and
    // since turning the pull layer on now turns that rule on too, the mode field alone would not say
    // WHICH delivered-rule an ON artifact was authored under.
    expect(on.delivered_citation_rule_version).toBe(2);
    // Absent when off, for the same reason as the contract version: a rotated key THROWS on resume
    // rather than regenerating, so an always-present field would fail every historical OFF resume.
    expect("delivered_citation_rule_version" in off).toBe(false);

    // The reuse key also carries what the AUTHOR will ACCEPT, not only what it was given. Every other
    // field describes input, on the premise that identical input means the artifact is still
    // admissible — and a rule living only in the parser breaks that premise: the answer-claims author
    // now bounds a claim's supporting evidence to its own cited clusters, nothing about the input
    // changed, and a resume handed back a pre-rule artifact that skipped the rule entirely.
    expect(on.authored_output_contract_version).toBe(AUTHORED_OUTPUT_CONTRACT_VERSION);
    expect(AUTHORED_OUTPUT_CONTRACT_VERSION).toBeGreaterThan(1); // bumped for that boundary
    // ...and ABSENT when the opt-in is off. A rotated key is not a regeneration here — a resume with a
    // mismatched hash throws — so an always-present field would have failed every historical OFF resume
    // for a rule that never applied to it.
    expect("authored_output_contract_version" in off).toBe(false);
  });

  it("the pull layer and transcript-confirmed delivery are ONE switch, with no key to separate them", () => {
    // This replaces a test that checked delivery reconciliation was reachable through its OWN settings
    // key. That key is gone: the `served` basis it toggled answered "did the runtime send this", which
    // is not what a citation claims, and the gap is real — codex clips a received record middle-out and
    // the facade, whose write succeeded, records the page as served either way. An opt-out would have
    // left the unsound answer reachable by configuration, so the two are now one condition.
    //
    // The negative assertion is the load-bearing one: no separate key means the safe combination cannot
    // be un-selected, and it fails the moment someone reintroduces one.
    expect(repoFile("src/core-runtime/discovery/settings-chain.ts"))
      .not.toContain("source_delivery_reconciliation");
    const api = repoFile("src/core-api/reconstruct-api.ts");
    expect(api).not.toContain("source_delivery_reconciliation");

    // PER CONSTRUCTION, not by count. Counting forwards against constructions passed while BOTH
    // forwards sat in the fallback author and the primary one had none — the production path was
    // silently OFF and the test said the wiring was complete (codex review, PR #271).
    const authorArgumentBlocks = (source: string): string[] => {
      const blocks: string[] = [];
      const marker = "createDirectCallReconstructDirectiveAuthor({";
      for (let at = source.indexOf(marker); at >= 0; at = source.indexOf(marker, at + 1)) {
        let depth = 0;
        let cursor = at + marker.length - 1;
        for (; cursor < source.length; cursor += 1) {
          if (source[cursor] === "{") depth += 1;
          else if (source[cursor] === "}") {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        blocks.push(source.slice(at, cursor + 1));
      }
      return blocks;
    };
    const blocks = authorArgumentBlocks(api);
    expect(blocks.length).toBeGreaterThan(1); // primary AND dispatch-fallback, or this proves nothing
    for (const [index, block] of blocks.entries()) {
      const catalogOccurrences =
        block.match(/\.\.\.\(sourceObservationCatalogTool \? \{ sourceObservationCatalogTool: true \} : \{\}\)/g) ??
          [];
      expect(catalogOccurrences.length, `author construction #${index + 1}`).toBe(1);
    }

    // The transcript is what reconciliation reads, and codex writes none under `--ephemeral`. Asking
    // for it is now UNCONDITIONAL on the facade launching — if it stayed tied to a flag, the delivered
    // rule would be mandatory while its evidence was optional, and every run would be `unverifiable`.
    const author = repoFile("src/core-runtime/reconstruct/direct-call-directive-author.ts");
    const facadeConfig = author.slice(
      author.indexOf("observation_read_facade: facadeLaunch,"),
    ).slice(0, 400);
    expect(facadeConfig).toContain("persist_worker_transcript: true,");
    expect(facadeConfig).not.toContain("sourceDeliveryReconciliation");

    // The route side, lexically — the args are built inside a private function that spawns, so this is
    // inspection rather than measurement, and it is here because the alternative is no check at all.
    const caller = repoFile("src/core-runtime/llm/llm-caller.ts");
    expect(caller).toContain(
      'options.persistWorkerTranscript === true ? [] : ["--ephemeral"]',
    );
    // Forwarded at EVERY codex call site, or one route would silently keep the flag.
    const facadeForwards = caller.match(/observationReadFacade: config\??\.observation_read_facade,/g) ?? [];
    const transcriptForwards = caller.match(/persistWorkerTranscript: config\??\.persist_worker_transcript,/g) ?? [];
    expect(facadeForwards.length).toBeGreaterThan(0);
    expect(transcriptForwards.length).toBe(facadeForwards.length);
  });

  it("run.ts feeds the answer-support author the CONSUMPTION-GATED projection, not the raw artifact", () => {
    // C2's last hop. The author-level tests and the replay's arm E both receive an already-gated
    // array, so neither can see run.ts swapping in the ungated `sourceObservations` — the concrete
    // defect a review named. Lexical, and the weaker for it; the gate function itself is exercised
    // over the real ledger in scripts/observation-catalog-tool-replay.mts arm E.
    const run = repoFile("src/core-runtime/reconstruct/run.ts");
    const call = run.slice(run.indexOf("directiveAuthor.writeAnswerSupportLedger({"));
    const args = call.slice(0, call.indexOf("}),"));
    expect(args).toContain("sourceObservations: promptSourceObservations,");
    // And the gated projection is what the source-safety refresh produces — not a local rebind.
    expect(run).toContain("promptSourceObservations = sourceObservationsForPrompt({");
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

  it("run.ts emits the ladder module's sentence verbatim — no wording is authored at the call site", () => {
    // The WHOLE message now comes from answerSupportFoldDisclosureMessage, so "called the helper and
    // then wrote my own sentence" (which satisfied the earlier assertion) is no longer expressible.
    const run = repoFile("src/core-runtime/reconstruct/run.ts");
    expect(run).toContain("message: answerSupportFoldDisclosureMessage(record.disclosure),");
    expect(run).not.toMatch(/Runtime folded the answer-support navigation catalog/);
    expect(run).not.toMatch(/per-observation summaries were dropped/);
  });

  it("the disclosure sentence is a pure projection of the disclosure, per rung", () => {
    const disclosure = {
      fold_level: "summary_anchor" as const,
      catalog_observation_count: 1_600,
      measured_prompt_bytes: 768_857,
      prompt_byte_budget: SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET,
      finer_levels_over_budget: ["one_line" as const],
      over_budget: false,
    };
    const message = answerSupportFoldDisclosureMessage(disclosure);
    expect(message).toContain("'summary_anchor'");
    expect(message).toContain("1600 observations");
    expect(message).toContain(`768857/${SOURCE_OBSERVATION_PROMPT_BYTE_BUDGET} bytes`);
    // The rung's cost comes from the ladder, so the sentence cannot contradict it.
    expect(message).toContain(breadthFoldRungDetailLoss("summary_anchor"));
    expect(answerSupportFoldDisclosureMessage({ ...disclosure, fold_level: "anchor" }))
      .toContain(breadthFoldRungDetailLoss("anchor"));
  });
});

