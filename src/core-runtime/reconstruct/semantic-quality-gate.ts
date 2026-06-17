/**
 * Reconstruct golden-fixture semantic quality gate (design §5 M3).
 *
 * Deterministic comparator for the optimization quality metrics:
 *  - Q1: expected-concept recall over the authored ontology seed
 *  - Q2: competency-question support rate over the fixture's fixed expected
 *    CQ population
 *  - Q3: zero dropped competency questions (regression guard; the runtime
 *    batches instead of dropping)
 *
 * The gate is fixture-specific data plus target-agnostic checks, mirroring
 * the review pipeline's semantic quality gate. Matching is deterministic
 * (name normalization + declared alternates); rows the comparator cannot
 * decide are reported, never silently scored.
 *
 * Source-field rejection rule (design §7 Phase 0 gate): metrics are computed
 * only when the run records the telemetry source fields and source-identity
 * refs they depend on. Missing fields produce `status: "rejected"` with
 * explicit reasons instead of a metric value.
 */
import type {
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructRunManifestArtifact,
} from "./artifact-types.js";

export type ReconstructQualityGateFixtureId =
  | "reconstruct-golden-target-v1"
  | "reconstruct-golden-target-v2";

export type ReconstructQualityGateRealization = "mock" | "live";

export interface ReconstructGoldenExpectedConcept {
  concept_key: string;
  /** Normalized-containment alternates; any one match satisfies the row. */
  name_alternates: string[];
  /**
   * Source-binding concepts (e.g. "which source backs the loan record") are
   * matched against the source binding that targets the relevant object, not by
   * a binding-id spelling. When set, the concept matches iff some source binding
   *  (1) names a backing source (`source_ref` present — else it does not say
   *      WHICH source backs the object), and
   *  (2) targets the right object — its `seed_ref` resolves to an object whose
   *      NAME (or, failing resolution, the raw seed_ref id) normalized-contains
   *      one of these alternates.
   * Both `binding_id` and `seed_ref` are model-chosen machine identifiers, so
   * matching the RESOLVED object name (not the raw id) keeps this model-agnostic
   * — a valid binding with a descriptive id or an opaque object id still matches
   * — while still requiring the binding to target the right object (a binding for
   * only an unrelated object, or with no source_ref, does NOT satisfy the row).
   */
  binding_target_alternates?: string[];
}

export interface ReconstructGoldenExpectedCq {
  cq_key: string;
  /** The expected question must reference this expected concept. */
  linked_concept_key: string;
  expected_answer_status: "answerable";
}

export interface ReconstructGoldenFixtureSpec {
  fixture_id: ReconstructQualityGateFixtureId;
  /**
   * Whether the deterministic mock realization's fixed semantic payloads
   * satisfy this fixture's expectations. Mock runs against incompatible
   * fixtures report `not_applicable` instead of a fake quality score.
   */
  mock_compatible: boolean;
  target_path: string;
  intent: string;
  /** Target file map materialized by harnesses and tests (single source). */
  files: Record<string, string>;
  expected_concepts: ReconstructGoldenExpectedConcept[];
  expected_cq: ReconstructGoldenExpectedCq[];
  q3_max_dropped_questions: 0;
}

const GOLDEN_FIXTURES: Record<
  ReconstructQualityGateFixtureId,
  ReconstructGoldenFixtureSpec
> = {
  "reconstruct-golden-target-v1": {
    fixture_id: "reconstruct-golden-target-v1",
    mock_compatible: true,
    target_path: "src/fixture-service.ts",
    intent:
      "Reconstruct a bounded operational seed for the fixture service module: who explains the fixture service, which action does it, and which source backs it.",
    files: {
      "src/fixture-service.ts": [
        "export interface FixtureUser {",
        "  userId: string;",
        "  role: \"fixture-reader\";",
        "}",
        "",
        "export interface FixtureServiceRecord {",
        "  fixtureServiceId: string;",
        "  description: string;",
        "}",
        "",
        "/** Fixture service: explains fixture structure to fixture users. */",
        "export class FixtureService {",
        "  constructor(private readonly records: FixtureServiceRecord[]) {}",
        "",
        "  explainFixture(user: FixtureUser, fixtureServiceId: string): string {",
        "    const record = this.records.find(",
        "      (candidate) => candidate.fixtureServiceId === fixtureServiceId,",
        "    );",
        "    if (!record) {",
        "      throw new Error(`unknown fixture service: ${fixtureServiceId}`);",
        "    }",
        "    return `${user.userId}: ${record.description}`;",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    expected_concepts: [
      {
        concept_key: "fixture-service",
        name_alternates: ["fixtureservice"],
      },
      {
        concept_key: "fixture-user",
        name_alternates: ["fixtureuser", "fixturereader"],
      },
      {
        concept_key: "explain-fixture",
        name_alternates: ["explainfixture", "fixtureexplanation"],
      },
      {
        // Q1 presence is credited by a source binding (with a source_ref) whose
        // seed_ref resolves to the fixture-service object — not by binding-id
        // spelling (the old name_alternates were fit to the mock's
        // `binding-fixture-source` id and missed descriptive live ids).
        // name_alternates remain for the Q2 CQ linkage.
        concept_key: "fixture-source-binding",
        name_alternates: ["fixturesource", "bindingfixturesource", "sourcebinding"],
        binding_target_alternates: ["fixtureservice"],
      },
    ],
    expected_cq: [
      {
        cq_key: "cq-fixture-service",
        linked_concept_key: "fixture-service",
        expected_answer_status: "answerable",
      },
      {
        cq_key: "cq-fixture-user",
        linked_concept_key: "fixture-user",
        expected_answer_status: "answerable",
      },
      {
        cq_key: "cq-explain-fixture",
        linked_concept_key: "explain-fixture",
        expected_answer_status: "answerable",
      },
      {
        cq_key: "cq-fixture-source-binding",
        linked_concept_key: "fixture-source-binding",
        expected_answer_status: "answerable",
      },
    ],
    q3_max_dropped_questions: 0,
  },
  "reconstruct-golden-target-v2": {
    fixture_id: "reconstruct-golden-target-v2",
    // The deterministic mock answers with fixture-service semantics
    // regardless of target content, so this lending-domain fixture is
    // meaningful only for live semantic authoring.
    mock_compatible: false,
    target_path: "src/lending-service.ts",
    intent:
      "Reconstruct a bounded operational seed for the library lending module: which actor checks out books, which action records a loan, and which source backs loan records.",
    files: {
      "src/lending-service.ts": [
        "export interface Borrower {",
        "  borrowerId: string;",
        "  membership: \"active\" | \"suspended\";",
        "}",
        "",
        "export interface LoanRecord {",
        "  loanId: string;",
        "  bookId: string;",
        "  borrowerId: string;",
        "  dueDate: string;",
        "}",
        "",
        "/** Lending service: lets active borrowers check out books. */",
        "export class LendingService {",
        "  constructor(private readonly loans: LoanRecord[]) {}",
        "",
        "  checkoutBook(borrower: Borrower, bookId: string, dueDate: string): LoanRecord {",
        "    if (borrower.membership !== \"active\") {",
        "      throw new Error(`borrower suspended: ${borrower.borrowerId}`);",
        "    }",
        "    const loan: LoanRecord = {",
        "      loanId: `${borrower.borrowerId}:${bookId}`,",
        "      bookId,",
        "      borrowerId: borrower.borrowerId,",
        "      dueDate,",
        "    };",
        "    this.loans.push(loan);",
        "    return loan;",
        "  }",
        "}",
        "",
      ].join("\n"),
    },
    expected_concepts: [
      {
        concept_key: "lending-service",
        name_alternates: ["lendingservice", "loanservice"],
      },
      {
        concept_key: "borrower",
        name_alternates: ["borrower", "member", "patron"],
      },
      {
        concept_key: "checkout-book",
        name_alternates: ["checkoutbook", "checkout", "borrowbook", "loanbook"],
      },
      {
        // Q1 presence is credited by a source binding (with a source_ref) whose
        // seed_ref resolves to the loan-record object. The `loanrecord`
        // name_alternate also matches the LoanRecord object NAME, so using it for
        // Q1 would wrongly credit a seed that has the object but no binding; Q1
        // here is binding-targeted only, and name_alternates remain for Q2.
        concept_key: "loan-record-binding",
        name_alternates: ["loanrecord", "loanbinding"],
        binding_target_alternates: ["loanrecord"],
      },
    ],
    expected_cq: [
      {
        cq_key: "cq-lending-service",
        linked_concept_key: "lending-service",
        expected_answer_status: "answerable",
      },
      {
        cq_key: "cq-borrower",
        linked_concept_key: "borrower",
        expected_answer_status: "answerable",
      },
      {
        cq_key: "cq-checkout-book",
        linked_concept_key: "checkout-book",
        expected_answer_status: "answerable",
      },
      {
        cq_key: "cq-loan-record-binding",
        linked_concept_key: "loan-record-binding",
        expected_answer_status: "answerable",
      },
    ],
    q3_max_dropped_questions: 0,
  },
};

export const RECONSTRUCT_QUALITY_GATE_FIXTURE_IDS = Object.keys(
  GOLDEN_FIXTURES,
) as ReconstructQualityGateFixtureId[];

export function reconstructGoldenFixtureSpec(
  fixtureId: ReconstructQualityGateFixtureId,
): ReconstructGoldenFixtureSpec {
  const spec = GOLDEN_FIXTURES[fixtureId];
  if (!spec) throw new Error(`Unknown reconstruct golden fixture: ${fixtureId}`);
  return spec;
}

export interface ReconstructQualityGateQ1Match {
  concept_key: string;
  matched_name: string;
  seed_family: string;
}

export interface ReconstructQualityGateQ2Row {
  cq_key: string;
  matched_question_id: string | null;
  answer_status: string | null;
  supported: boolean;
}

export interface ReconstructQualityGateResult {
  status: "passed" | "failed" | "rejected" | "not_applicable";
  fixture_id: ReconstructQualityGateFixtureId;
  scope: "fixture_specific";
  realization: ReconstructQualityGateRealization;
  reason?: string;
  source_field_rejections: string[];
  q1: {
    expected_count: number;
    matched_count: number;
    recall: number;
    missing_concept_keys: string[];
    matches: ReconstructQualityGateQ1Match[];
  } | null;
  q2: {
    population: number;
    supported_count: number;
    support_rate: number;
    rows: ReconstructQualityGateQ2Row[];
  } | null;
  q3: {
    authored_question_count: number;
    assessed_question_count: number;
    dropped_question_count: number;
    dropped_question_ids: string[];
    batch_count: number | null;
  } | null;
}

export interface EvaluateReconstructQualityGateArgs {
  fixtureId: ReconstructQualityGateFixtureId;
  realization: ReconstructQualityGateRealization;
  runManifest: ReconstructRunManifestArtifact;
  ontologySeed: ReconstructOntologySeedArtifact;
  competencyQuestions: ReconstructCompetencyQuestionsArtifact;
  competencyQuestionAssessment: ReconstructCompetencyQuestionAssessmentArtifact;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface SeedNameRow {
  name: string;
  seed_family: string;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordRows(container: unknown, key: string): Record<string, unknown>[] {
  const rows = recordValue(container)?.[key];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => recordValue(row))
    .filter((row): row is Record<string, unknown> => row !== null);
}

function stringField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

/** The seed artifact is schema-validated upstream; the gate reads it defensively. */
function seedNameRows(seed: ReconstructOntologySeedArtifact): SeedNameRow[] {
  const rows: SeedNameRow[] = [];
  const families: Array<{ container: string; key: string; nameKeys: string[] }> = [
    { container: "conceptual_frame", key: "concepts", nameKeys: ["name"] },
    { container: "semantic_layer", key: "object_types", nameKeys: ["name"] },
    { container: "kinetic_layer", key: "action_types", nameKeys: ["name"] },
    { container: "kinetic_layer", key: "workflows", nameKeys: ["name"] },
    { container: "dynamic_layer", key: "actor_types", nameKeys: ["name"] },
    {
      container: "data_binding_layer",
      key: "source_bindings",
      nameKeys: ["binding_id", "seed_ref"],
    },
  ];
  for (const family of families) {
    for (const row of recordRows(seed[family.container], family.key)) {
      const name = family.nameKeys
        .map((nameKey) => stringField(row, nameKey))
        .filter((value) => value.length > 0)
        .join(" ");
      if (name.length === 0) continue;
      rows.push({
        name,
        seed_family: `${family.container}.${family.key}`,
      });
    }
  }
  return rows;
}

/** Maps a seed-object id (object_type_id, concept_id, …) to its display name. */
function seedRefNameIndex(seed: ReconstructOntologySeedArtifact): Map<string, string> {
  const index = new Map<string, string>();
  const families: Array<{ container: string; key: string; idKey: string }> = [
    { container: "conceptual_frame", key: "concepts", idKey: "concept_id" },
    { container: "semantic_layer", key: "object_types", idKey: "object_type_id" },
    { container: "kinetic_layer", key: "action_types", idKey: "action_type_id" },
    { container: "kinetic_layer", key: "workflows", idKey: "workflow_id" },
    { container: "dynamic_layer", key: "actor_types", idKey: "actor_type_id" },
  ];
  for (const family of families) {
    for (const row of recordRows(seed[family.container], family.key)) {
      const id = stringField(row, family.idKey);
      const name = stringField(row, "name");
      if (id.length > 0 && name.length > 0 && !index.has(id)) index.set(id, name);
    }
  }
  return index;
}

/**
 * Whether a source binding satisfies a binding-target concept: it must name a
 * backing source (`source_ref` present) and target the right object — its
 * `seed_ref` resolves to an object whose NAME (or, when unresolved, the raw
 * seed_ref id) normalized-contains a target alternate. Matching the resolved
 * NAME keeps this robust to model-chosen ids (descriptive binding ids, opaque
 * object ids alike).
 */
function bindingTargetsConcept(
  binding: Record<string, unknown>,
  targetAlternates: string[],
  nameIndex: Map<string, string>,
): boolean {
  if (stringField(binding, "source_ref").length === 0) return false;
  const seedRef = stringField(binding, "seed_ref");
  if (seedRef.length === 0) return false;
  const haystack = normalizeName(`${seedRef} ${nameIndex.get(seedRef) ?? ""}`);
  return targetAlternates.some((alternate) =>
    haystack.includes(normalizeName(alternate)),
  );
}

function conceptMatch(
  expected: ReconstructGoldenExpectedConcept,
  rows: SeedNameRow[],
  sourceBindings: Record<string, unknown>[],
  nameIndex: Map<string, string>,
): ReconstructQualityGateQ1Match | null {
  // A binding-target concept's PRESENCE (Q1) is credited only by a source
  // binding that targets the right object (resolved by seed_ref → object name)
  // and names a backing source. `name_alternates` are NOT used for Q1 presence
  // here — they would also match the target object's own NAME and credit the
  // binding concept for a seed that has the object but no binding; they remain
  // for the Q2 CQ↔concept linkage.
  if (expected.binding_target_alternates) {
    for (const binding of sourceBindings) {
      if (bindingTargetsConcept(binding, expected.binding_target_alternates, nameIndex)) {
        return {
          concept_key: expected.concept_key,
          matched_name: [
            stringField(binding, "binding_id"),
            stringField(binding, "seed_ref"),
          ]
            .filter((value) => value.length > 0)
            .join(" "),
          seed_family: "data_binding_layer.source_bindings",
        };
      }
    }
    return null;
  }
  for (const row of rows) {
    const normalized = normalizeName(row.name);
    for (const alternate of expected.name_alternates) {
      if (normalized.includes(normalizeName(alternate))) {
        return {
          concept_key: expected.concept_key,
          matched_name: row.name,
          seed_family: row.seed_family,
        };
      }
    }
  }
  return null;
}

/**
 * Explicit no-call exemptions: the only LLM-owned units with a runtime path
 * that completes without any LLM call (a not-required purpose confirmation, or
 * maturation units the runtime authors as empty projections — when the question
 * frontier is empty, or, for the answer-support judge, when the ledger has no
 * convergent_source_evidence cluster). Every other completed non-runtime unit
 * must carry telemetry — reject-by-default, so a newly added authored unit
 * cannot silently skip measurement provenance.
 */
const NO_CALL_EXEMPT_UNIT_IDS: ReadonlySet<string> = new Set([
  "purpose_confirmation",
  "maturation_question_frontier",
  "maturation_closure_frontier",
  "answer_support_judgment",
  "maturation_answer_claims",
  "ontology_expansion",
]);

/**
 * Source-field rejection: completed LLM units must carry the telemetry
 * fields the optimization metrics depend on. A run that cannot prove its
 * measurement provenance is rejected, not scored.
 */
function sourceFieldRejections(
  runManifest: ReconstructRunManifestArtifact,
): string[] {
  const rejections: string[] = [];
  for (const step of runManifest.steps) {
    if (step.status !== "completed") continue;
    const telemetry = step.execution_telemetry;
    if (step.owner === "runtime") {
      continue;
    }
    if (!telemetry) {
      if (!NO_CALL_EXEMPT_UNIT_IDS.has(step.step_id)) {
        rejections.push(
          `step ${step.step_id}: completed LLM-owned unit has no execution_telemetry`,
        );
      }
      continue;
    }
    if (telemetry.llm_call_count < 1 || telemetry.attempt_count < 1) {
      rejections.push(`step ${step.step_id}: telemetry has no recorded attempts`);
    }
    if (telemetry.prompt_chars <= 0) {
      rejections.push(`step ${step.step_id}: prompt_chars is missing or zero`);
    }
    if (telemetry.output_chars <= 0) {
      rejections.push(`step ${step.step_id}: output_chars is missing or zero`);
    }
    if (!telemetry.prompt_policy_sha256) {
      rejections.push(`step ${step.step_id}: prompt_policy_sha256 is missing`);
    }
    if ((telemetry.source_identity_refs ?? []).length === 0) {
      rejections.push(`step ${step.step_id}: source_identity_refs is empty`);
    }
    if (
      step.step_id === "competency_question_assessment" &&
      telemetry.batch_count === null
    ) {
      rejections.push(
        "step competency_question_assessment: batch_count is missing",
      );
    }
  }
  return rejections;
}

export function evaluateReconstructGoldenQualityGate(
  args: EvaluateReconstructQualityGateArgs,
): ReconstructQualityGateResult {
  const spec = reconstructGoldenFixtureSpec(args.fixtureId);
  const base = {
    fixture_id: spec.fixture_id,
    scope: "fixture_specific" as const,
    realization: args.realization,
  };
  // Measurement provenance is checked before applicability: a run with
  // missing telemetry source fields is rejected even when its semantic
  // scores would not apply, so the provenance gate cannot be bypassed
  // through a not_applicable fixture/realization combination.
  const rejections = sourceFieldRejections(args.runManifest);
  if (rejections.length > 0) {
    return {
      ...base,
      status: "rejected",
      reason:
        "Telemetry source fields required for metric attribution are missing; metrics are not computed from unproven measurements.",
      source_field_rejections: rejections,
      q1: null,
      q2: null,
      q3: null,
    };
  }
  if (args.realization === "mock" && !spec.mock_compatible) {
    return {
      ...base,
      status: "not_applicable",
      reason:
        "The deterministic mock realization's payloads do not target this fixture's domain; quality scores apply to live semantic authoring only.",
      source_field_rejections: [],
      q1: null,
      q2: null,
      q3: null,
    };
  }

  // Q1 — expected-concept recall over the authored seed.
  const nameRows = seedNameRows(args.ontologySeed);
  const sourceBindings = recordRows(
    args.ontologySeed.data_binding_layer,
    "source_bindings",
  );
  const nameIndex = seedRefNameIndex(args.ontologySeed);
  const matches: ReconstructQualityGateQ1Match[] = [];
  const missing: string[] = [];
  for (const expected of spec.expected_concepts) {
    const match = conceptMatch(expected, nameRows, sourceBindings, nameIndex);
    if (match) matches.push(match);
    else missing.push(expected.concept_key);
  }
  const q1 = {
    expected_count: spec.expected_concepts.length,
    matched_count: matches.length,
    recall: spec.expected_concepts.length === 0
      ? 1
      : matches.length / spec.expected_concepts.length,
    missing_concept_keys: missing,
    matches,
  };

  // Q2 — support rate over the fixed expected CQ population. A question
  // matches an expected row when its id, text, claim refs, or seed refs
  // reference the linked expected concept. Each expected row must be covered
  // by a DISTINCT authored question: one broad question mentioning several
  // expected concepts cannot satisfy multiple population rows.
  const assessmentByQuestionId = new Map(
    args.competencyQuestionAssessment.assessments.map(
      (assessment) => [assessment.question_id, assessment],
    ),
  );
  const usedQuestionIds = new Set<string>();
  const q2Rows: ReconstructQualityGateQ2Row[] = spec.expected_cq.map((expected) => {
    const concept = spec.expected_concepts.find(
      (candidate) => candidate.concept_key === expected.linked_concept_key,
    );
    if (!concept) {
      throw new Error(
        `Fixture ${spec.fixture_id} expected_cq ${expected.cq_key} links unknown concept ${expected.linked_concept_key}`,
      );
    }
    // For a binding-target concept the CQ references the binding or its target
    // object, whose ids are model-chosen, so name_alternates alone miss the live
    // shape (a question naming `binding_fixture_records_backing_source` or the
    // resolved object). Link via name_alternates ∪ target alternates ∪ the
    // targeting bindings' own ids, mirroring the Q1 binding-targeting model.
    const targetingBindings = concept.binding_target_alternates
      ? sourceBindings.filter((binding) =>
          bindingTargetsConcept(
            binding,
            concept.binding_target_alternates!,
            nameIndex,
          ),
        )
      : [];
    const linkTokens = [
      ...concept.name_alternates,
      ...(concept.binding_target_alternates ?? []),
      ...targetingBindings.flatMap((binding) => [
        stringField(binding, "binding_id"),
        stringField(binding, "seed_ref"),
      ]),
    ].filter((token) => token.length > 0);
    const question = args.competencyQuestions.questions.find((candidate) => {
      if (usedQuestionIds.has(candidate.question_id)) return false;
      const haystack = normalizeName(
        [
          candidate.question_id,
          candidate.question,
          ...(candidate.linked_claim_ids ?? []),
          ...(candidate.seed_ref_refs ?? []),
        ].join(" "),
      );
      return linkTokens.some((token) => haystack.includes(normalizeName(token)));
    });
    if (question) usedQuestionIds.add(question.question_id);
    const assessment = question
      ? assessmentByQuestionId.get(question.question_id) ?? null
      : null;
    const answerStatus = assessment?.answer_status ?? null;
    return {
      cq_key: expected.cq_key,
      matched_question_id: question?.question_id ?? null,
      answer_status: answerStatus,
      supported: answerStatus === expected.expected_answer_status,
    };
  });
  const q2 = {
    population: q2Rows.length,
    supported_count: q2Rows.filter((row) => row.supported).length,
    support_rate: q2Rows.length === 0
      ? 1
      : q2Rows.filter((row) => row.supported).length / q2Rows.length,
    rows: q2Rows,
  };

  // Q3 — no dropped questions: every authored question id must appear in the
  // assessments. Identity-based set difference, so a duplicate assessment or
  // an assessment for an unknown question id cannot mask a dropped question.
  const assessmentStep = args.runManifest.steps.find(
    (step) => step.step_id === "competency_question_assessment",
  );
  const authoredQuestionIds = new Set(
    args.competencyQuestions.questions.map((question) => question.question_id),
  );
  const assessedQuestionIds = new Set(
    args.competencyQuestionAssessment.assessments.map(
      (assessment) => assessment.question_id,
    ),
  );
  const droppedQuestionIds = [...authoredQuestionIds].filter(
    (questionId) => !assessedQuestionIds.has(questionId),
  );
  const q3 = {
    authored_question_count: authoredQuestionIds.size,
    assessed_question_count: assessedQuestionIds.size,
    dropped_question_count: droppedQuestionIds.length,
    dropped_question_ids: droppedQuestionIds,
    batch_count: assessmentStep?.execution_telemetry?.batch_count ?? null,
  };

  const passed = q1.missing_concept_keys.length === 0 &&
    q2.supported_count === q2.population &&
    q3.dropped_question_count <= spec.q3_max_dropped_questions;

  return {
    ...base,
    status: passed ? "passed" : "failed",
    source_field_rejections: [],
    q1,
    q2,
    q3,
  };
}
