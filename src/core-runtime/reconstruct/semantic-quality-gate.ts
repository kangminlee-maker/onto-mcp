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
        concept_key: "fixture-source-binding",
        name_alternates: ["fixturesource", "bindingfixturesource", "sourcebinding"],
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
        concept_key: "loan-record-binding",
        name_alternates: ["loanrecord", "loanbinding"],
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

function conceptMatch(
  expected: ReconstructGoldenExpectedConcept,
  rows: SeedNameRow[],
): ReconstructQualityGateQ1Match | null {
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
 * that completes without any LLM call (a not-required purpose confirmation,
 * or maturation units the runtime authors as empty projections when the
 * question frontier is empty). Every other completed non-runtime unit must
 * carry telemetry — reject-by-default, so a newly added authored unit cannot
 * silently skip measurement provenance.
 */
const NO_CALL_EXEMPT_UNIT_IDS: ReadonlySet<string> = new Set([
  "purpose_confirmation",
  "maturation_question_frontier",
  "maturation_closure_frontier",
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
  const matches: ReconstructQualityGateQ1Match[] = [];
  const missing: string[] = [];
  for (const expected of spec.expected_concepts) {
    const match = conceptMatch(expected, nameRows);
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
      return concept.name_alternates.some((alternate) =>
        haystack.includes(normalizeName(alternate))
      );
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
