import { describe, expect, it } from "vitest";
import {
  evaluateReconstructGoldenQualityGate,
  reconstructGoldenFixtureSpec,
  RECONSTRUCT_QUALITY_GATE_FIXTURE_IDS,
} from "./semantic-quality-gate.js";
import type {
  ReconstructCompetencyQuestionAssessmentArtifact,
  ReconstructCompetencyQuestionsArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructRunManifestArtifact,
  ReconstructRunManifestStep,
} from "./artifact-types.js";

function telemetryFor(unitId: string) {
  return {
    unit_id: unitId,
    llm_call_count: 1,
    duration_ms: 10,
    prompt_chars: 100,
    output_chars: 100,
    provider_tokens_in: null,
    provider_tokens_out: null,
    provider_route: "mock",
    model_id: "reconstruct-mock-model",
    effort: null,
    prompt_policy_sha256: "a".repeat(64),
    source_identity_refs: [
      `prompt_policy_sha256:${"a".repeat(64)}`,
      `authored_artifact:${unitId}`,
    ],
    attempt_count: 1,
    attempts: [
      {
        attempt: 1,
        kind: "initial" as const,
        status: "succeeded" as const,
        failure_class: null,
        failure_message: null,
        duration_ms: 10,
      },
    ],
    batch_count: unitId === "competency_question_assessment" ? 1 : null,
  };
}

function llmStep(
  unitId: string,
  options: { withTelemetry?: boolean } = {},
): ReconstructRunManifestStep {
  return {
    step_id: unitId as ReconstructRunManifestStep["step_id"],
    owner: "host_llm",
    performed_by: {
      authority: "host_llm",
      realization: "direct_call",
      actor_id: "reconstruct-mock-semantic-author",
    },
    status: "completed",
    artifact_refs: [],
    ...(options.withTelemetry === false
      ? {}
      : { execution_telemetry: telemetryFor(unitId) }),
  };
}

function manifestWith(steps: ReconstructRunManifestStep[]): ReconstructRunManifestArtifact {
  return { steps } as unknown as ReconstructRunManifestArtifact;
}

function fixtureServiceSeed(): ReconstructOntologySeedArtifact {
  return {
    conceptual_frame: {
      concepts: [{ concept_id: "concept-fixture-service", name: "Fixture Service" }],
    },
    semantic_layer: {
      object_types: [{ object_type_id: "object-fixture-service", name: "Fixture Service" }],
    },
    kinetic_layer: {
      action_types: [{ action_type_id: "action-explain-fixture", name: "Explain Fixture" }],
      workflows: [],
    },
    dynamic_layer: {
      actor_types: [{ actor_type_id: "actor-fixture-user", name: "Fixture User" }],
    },
    data_binding_layer: {
      source_bindings: [
        { binding_id: "binding-fixture-source", seed_ref: "object-fixture-service" },
      ],
    },
  } as unknown as ReconstructOntologySeedArtifact;
}

function questionsFor(claimIds: string[]): ReconstructCompetencyQuestionsArtifact {
  return {
    questions: claimIds.map((claimId, index) => ({
      question_id: `cq-claim-${index + 1}`,
      question: `Can the Seed explain ${claimId}?`,
      linked_claim_ids: [claimId],
      seed_ref_refs: [claimId],
    })),
  } as unknown as ReconstructCompetencyQuestionsArtifact;
}

function assessmentsFor(
  questionCount: number,
  answerStatus = "answerable",
): ReconstructCompetencyQuestionAssessmentArtifact {
  return {
    assessments: Array.from({ length: questionCount }, (_, index) => ({
      question_id: `cq-claim-${index + 1}`,
      answer_status: answerStatus,
    })),
  } as unknown as ReconstructCompetencyQuestionAssessmentArtifact;
}

const HAPPY_CLAIM_IDS = [
  "object-fixture-service",
  "actor-fixture-user",
  "action-explain-fixture",
  "binding-fixture-source",
];

function happyArgs() {
  return {
    fixtureId: "reconstruct-golden-target-v1" as const,
    realization: "mock" as const,
    runManifest: manifestWith([
      llmStep("ontology_seed"),
      llmStep("competency_question_assessment"),
    ]),
    ontologySeed: fixtureServiceSeed(),
    competencyQuestions: questionsFor(HAPPY_CLAIM_IDS),
    competencyQuestionAssessment: assessmentsFor(HAPPY_CLAIM_IDS.length),
  };
}

describe("reconstruct golden semantic quality gate", () => {
  it("exposes golden fixture specs with target files for harnesses and tests", () => {
    expect(RECONSTRUCT_QUALITY_GATE_FIXTURE_IDS).toContain(
      "reconstruct-golden-target-v1",
    );
    const spec = reconstructGoldenFixtureSpec("reconstruct-golden-target-v1");
    expect(Object.keys(spec.files)).toContain(spec.target_path);
    expect(spec.mock_compatible).toBe(true);
    expect(
      reconstructGoldenFixtureSpec("reconstruct-golden-target-v2").mock_compatible,
    ).toBe(false);
  });

  it("passes when expected concepts, CQ support, and zero drops are proven", () => {
    const result = evaluateReconstructGoldenQualityGate(happyArgs());
    expect(result.status).toBe("passed");
    expect(result.q1?.recall).toBe(1);
    expect(result.q1?.missing_concept_keys).toEqual([]);
    expect(result.q2?.support_rate).toBe(1);
    expect(result.q3?.dropped_question_count).toBe(0);
    expect(result.q3?.batch_count).toBe(1);
  });

  it("rejects metrics when a required LLM unit has no telemetry source fields", () => {
    const args = happyArgs();
    args.runManifest = manifestWith([
      llmStep("ontology_seed", { withTelemetry: false }),
      llmStep("competency_question_assessment"),
    ]);
    const result = evaluateReconstructGoldenQualityGate(args);
    expect(result.status).toBe("rejected");
    expect(result.q1).toBeNull();
    expect(result.q2).toBeNull();
    expect(result.q3).toBeNull();
    expect(result.source_field_rejections.join("\n"))
      .toMatch(/ontology_seed: completed LLM-owned unit has no execution_telemetry/);
  });

  it("rejects metrics when dependent identity refs are missing", () => {
    const args = happyArgs();
    const step = llmStep("ontology_seed");
    step.execution_telemetry!.source_identity_refs = [];
    step.execution_telemetry!.prompt_policy_sha256 = null;
    args.runManifest = manifestWith([
      step,
      llmStep("competency_question_assessment"),
    ]);
    const result = evaluateReconstructGoldenQualityGate(args);
    expect(result.status).toBe("rejected");
    expect(result.source_field_rejections.join("\n"))
      .toMatch(/prompt_policy_sha256 is missing/);
    expect(result.source_field_rejections.join("\n"))
      .toMatch(/source_identity_refs is empty/);
  });

  it("rejects metrics when assessment batch_count is missing", () => {
    const args = happyArgs();
    const assessmentStep = llmStep("competency_question_assessment");
    assessmentStep.execution_telemetry!.batch_count = null;
    args.runManifest = manifestWith([llmStep("ontology_seed"), assessmentStep]);
    const result = evaluateReconstructGoldenQualityGate(args);
    expect(result.status).toBe("rejected");
    expect(result.source_field_rejections.join("\n"))
      .toMatch(/batch_count is missing/);
  });

  it("rejects completed call-required units outside the exemption set without telemetry", () => {
    const args = happyArgs();
    args.runManifest = manifestWith([
      llmStep("ontology_seed"),
      llmStep("competency_question_assessment"),
      llmStep("answer_support_ledger", { withTelemetry: false }),
    ]);
    const result = evaluateReconstructGoldenQualityGate(args);
    expect(result.status).toBe("rejected");
    expect(result.source_field_rejections.join("\n"))
      .toMatch(/answer_support_ledger: completed LLM-owned unit has no execution_telemetry/);
  });

  it("does not require telemetry for LLM-owned units that can complete without a call", () => {
    const args = happyArgs();
    args.runManifest = manifestWith([
      llmStep("ontology_seed"),
      llmStep("competency_question_assessment"),
      llmStep("purpose_confirmation", { withTelemetry: false }),
      llmStep("maturation_question_frontier", { withTelemetry: false }),
    ]);
    const result = evaluateReconstructGoldenQualityGate(args);
    expect(result.status).toBe("passed");
  });

  it("fails with missing concept keys and unsupported CQ rows", () => {
    const args = happyArgs();
    args.competencyQuestionAssessment = assessmentsFor(
      HAPPY_CLAIM_IDS.length,
      "unsupported",
    );
    const seed = fixtureServiceSeed() as unknown as Record<string, unknown>;
    (seed.dynamic_layer as { actor_types: unknown[] }).actor_types = [];
    args.ontologySeed = seed as unknown as ReconstructOntologySeedArtifact;
    const result = evaluateReconstructGoldenQualityGate(args);
    expect(result.status).toBe("failed");
    expect(result.q1?.missing_concept_keys).toEqual(["fixture-user"]);
    expect(result.q2?.supported_count).toBe(0);
  });

  it("marks dropped questions when assessments cover fewer questions than authored", () => {
    const args = happyArgs();
    args.competencyQuestionAssessment = assessmentsFor(3);
    const result = evaluateReconstructGoldenQualityGate(args);
    expect(result.status).toBe("failed");
    expect(result.q3?.dropped_question_count).toBe(1);
  });

  it("rejects missing provenance even on not_applicable fixture/realization combinations", () => {
    const args = happyArgs();
    args.runManifest = manifestWith([
      llmStep("ontology_seed", { withTelemetry: false }),
      llmStep("competency_question_assessment"),
    ]);
    const result = evaluateReconstructGoldenQualityGate({
      ...args,
      fixtureId: "reconstruct-golden-target-v2",
    });
    expect(result.status).toBe("rejected");
    expect(result.source_field_rejections.length).toBeGreaterThan(0);
  });

  it("detects dropped questions masked by duplicate or unknown assessment ids", () => {
    const args = happyArgs();
    // Same row count as authored questions, but cq-claim-4 is never assessed:
    // a duplicate assessment id must not mask the drop.
    args.competencyQuestionAssessment = {
      assessments: [
        { question_id: "cq-claim-1", answer_status: "answerable" },
        { question_id: "cq-claim-2", answer_status: "answerable" },
        { question_id: "cq-claim-3", answer_status: "answerable" },
        { question_id: "cq-claim-3", answer_status: "answerable" },
      ],
    } as unknown as ReconstructCompetencyQuestionAssessmentArtifact;
    const result = evaluateReconstructGoldenQualityGate(args);
    expect(result.status).toBe("failed");
    expect(result.q3?.dropped_question_count).toBe(1);
    expect(result.q3?.dropped_question_ids).toEqual(["cq-claim-4"]);
  });

  it("requires a distinct authored question per expected CQ row", () => {
    const args = happyArgs();
    // One broad question referencing every expected concept must not satisfy
    // the whole expected population.
    args.competencyQuestions = {
      questions: [
        {
          question_id: "cq-claim-1",
          question:
            "Can the Seed explain object-fixture-service, actor-fixture-user, action-explain-fixture, and binding-fixture-source?",
          linked_claim_ids: HAPPY_CLAIM_IDS,
          seed_ref_refs: HAPPY_CLAIM_IDS,
        },
      ],
    } as unknown as ReconstructCompetencyQuestionsArtifact;
    args.competencyQuestionAssessment = assessmentsFor(1);
    const result = evaluateReconstructGoldenQualityGate(args);
    expect(result.status).toBe("failed");
    expect(result.q2?.supported_count).toBe(1);
    expect(
      result.q2?.rows.filter((row) => row.matched_question_id === null).length,
    ).toBe(3);
  });

  it("reports not_applicable for mock runs against live-only fixtures", () => {
    const args = happyArgs();
    const result = evaluateReconstructGoldenQualityGate({
      ...args,
      fixtureId: "reconstruct-golden-target-v2",
    });
    expect(result.status).toBe("not_applicable");
    expect(result.reason).toMatch(/live semantic authoring/);
    expect(result.q1).toBeNull();
  });
});
