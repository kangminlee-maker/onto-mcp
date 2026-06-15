import { describe, expect, it } from "vitest";
import {
  attemptKindForAuthoredArtifactName,
  createReconstructExecutionTelemetryCollector,
  failureClassForLlmCallError,
  mergedUnitExecutionTelemetry,
  terminalFailureMessageFromTelemetry,
  unitIdForAuthoredArtifactName,
  type ReconstructUnitExecutionTelemetry,
} from "./execution-telemetry.js";

describe("reconstruct execution telemetry", () => {
  it("maps authored artifact names to owning pipeline units", () => {
    expect(unitIdForAuthoredArtifactName("SourceObservationDirective"))
      .toBe("observation_directive");
    expect(unitIdForAuthoredArtifactName("ReconstructLensJudgment:semantics"))
      .toBe("lens_judgment");
    expect(unitIdForAuthoredArtifactName("CompetencyQuestionAssessment"))
      .toBe("competency_question_assessment");
    expect(unitIdForAuthoredArtifactName("CompetencyQuestionAssessment batch 2"))
      .toBe("competency_question_assessment");
    expect(unitIdForAuthoredArtifactName("OntologySeedMinimalKernel"))
      .toBe("ontology_seed");
    expect(unitIdForAuthoredArtifactName("CompetencyQuestionsValidationRepair"))
      .toBe("competency_questions");
    expect(unitIdForAuthoredArtifactName("SourcePurposeContradictionRepair"))
      .toBe("source_purpose_candidates");
    expect(unitIdForAuthoredArtifactName("FinalOutput")).toBe("final_output");
    expect(unitIdForAuthoredArtifactName("PurposeConfirmation"))
      .toBe("purpose_confirmation");
    expect(unitIdForAuthoredArtifactName("AnswerSupportJudgment"))
      .toBe("answer_support_judgment");
    expect(() => unitIdForAuthoredArtifactName("UnknownArtifact"))
      .toThrow(/no telemetry unit mapping/);
  });

  it("classifies attempt kinds from authored artifact names", () => {
    expect(attemptKindForAuthoredArtifactName("OntologySeed")).toBe("initial");
    expect(attemptKindForAuthoredArtifactName("OntologySeedMinimalKernel"))
      .toBe("timeout_recovery");
    expect(attemptKindForAuthoredArtifactName("CandidateInventoryCoverageRepair"))
      .toBe("semantic_repair");
    expect(attemptKindForAuthoredArtifactName("CompetencyQuestionsValidationRepair"))
      .toBe("semantic_repair");
  });

  it("classifies provider call errors as timeout or provider_error", () => {
    const isTimeout = (error: unknown) =>
      error instanceof Error && error.message.includes("timed out");
    expect(
      failureClassForLlmCallError(new Error("call timed out after 1ms"), isTimeout),
    ).toBe("timeout");
    expect(
      failureClassForLlmCallError(new Error("connection refused"), isTimeout),
    ).toBe("provider_error");
  });

  it("aggregates per-unit calls into one telemetry row with attempt lineage", () => {
    const collector = createReconstructExecutionTelemetryCollector();
    collector.recordLlmAttempt({
      unitId: "ontology_seed",
      kind: "initial",
      status: "failed",
      failureClass: "malformed_json",
      failureMessage: "OntologySeed author returned no JSON object.",
      durationMs: 120,
      promptChars: 1000,
      outputChars: 50,
      providerRoute: "openai",
      modelId: "model-a",
      effort: "high",
      systemPrompt: "seed system prompt",
    });
    collector.recordLlmAttempt({
      unitId: "ontology_seed",
      kind: "parse_repair",
      status: "succeeded",
      durationMs: 80,
      promptChars: 400,
      outputChars: 900,
      providerTokensIn: 10,
      providerTokensOut: 20,
      providerRoute: "openai",
      modelId: "model-a",
    });
    const row = collector.unitTelemetry("ontology_seed");
    expect(row).toMatchObject({
      unit_id: "ontology_seed",
      llm_call_count: 2,
      duration_ms: 200,
      prompt_chars: 1400,
      output_chars: 950,
      provider_tokens_in: 10,
      provider_tokens_out: 20,
      provider_route: "openai",
      model_id: "model-a",
      effort: "high",
      attempt_count: 2,
      batch_count: null,
    });
    expect(row?.prompt_policy_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.source_identity_refs).toEqual([
      `prompt_policy_sha256:${row?.prompt_policy_sha256}`,
    ]);
    expect(row?.attempts).toEqual([
      {
        attempt: 1,
        kind: "initial",
        status: "failed",
        failure_class: "malformed_json",
        failure_message: "OntologySeed author returned no JSON object.",
        duration_ms: 120,
      },
      {
        attempt: 2,
        kind: "parse_repair",
        status: "succeeded",
        failure_class: null,
        failure_message: null,
        duration_ms: 80,
      },
    ]);
    // The unit recovered (final attempt succeeded): the intermediate failure
    // stays in attempts but is not a terminal failure summary.
    expect(terminalFailureMessageFromTelemetry(row)).toBeNull();
  });

  it("reports a terminal failure message only when the final attempt failed", () => {
    const collector = createReconstructExecutionTelemetryCollector();
    collector.recordLlmAttempt({
      unitId: "ontology_seed",
      kind: "initial",
      status: "failed",
      failureClass: "malformed_json",
      failureMessage: "initial malformed",
      durationMs: 1,
      promptChars: 1,
      outputChars: 1,
      artifactName: "OntologySeed",
    });
    collector.recordLlmAttempt({
      unitId: "ontology_seed",
      kind: "parse_repair",
      status: "failed",
      failureClass: "parse_repair_failure",
      failureMessage: "repair also malformed",
      durationMs: 1,
      promptChars: 1,
      outputChars: 1,
      artifactName: "OntologySeed",
    });
    const row = collector.unitTelemetry("ontology_seed");
    expect(terminalFailureMessageFromTelemetry(row)).toBe("repair also malformed");
    expect(terminalFailureMessageFromTelemetry(null)).toBeNull();
  });

  it("accumulates distinct authored-artifact source identity refs", () => {
    const collector = createReconstructExecutionTelemetryCollector();
    collector.recordLlmAttempt({
      unitId: "ontology_seed",
      kind: "initial",
      status: "failed",
      failureClass: "timeout",
      failureMessage: "timed out",
      durationMs: 1,
      promptChars: 1,
      outputChars: 0,
      systemPrompt: "seed prompt",
      artifactName: "OntologySeed",
    });
    collector.recordLlmAttempt({
      unitId: "ontology_seed",
      kind: "timeout_recovery",
      status: "succeeded",
      durationMs: 1,
      promptChars: 1,
      outputChars: 1,
      artifactName: "OntologySeedMinimalKernel",
    });
    const refs = collector.unitTelemetry("ontology_seed")?.source_identity_refs;
    expect(refs).toContain("authored_artifact:OntologySeed");
    expect(refs).toContain("authored_artifact:OntologySeedMinimalKernel");
    expect(
      refs?.some((ref) => ref.startsWith("prompt_policy_sha256:")),
    ).toBe(true);
  });

  it("keeps provider tokens null when the provider reports none", () => {
    const collector = createReconstructExecutionTelemetryCollector();
    collector.recordLlmAttempt({
      unitId: "stop_decision",
      kind: "initial",
      status: "succeeded",
      durationMs: 5,
      promptChars: 10,
      outputChars: 10,
      providerTokensIn: 0,
      providerTokensOut: 0,
    });
    const row = collector.unitTelemetry("stop_decision");
    expect(row?.provider_tokens_in).toBeNull();
    expect(row?.provider_tokens_out).toBeNull();
  });

  it("resets all recorded rows for run-scoped collection", () => {
    const collector = createReconstructExecutionTelemetryCollector();
    collector.recordLlmAttempt({
      unitId: "ontology_seed",
      kind: "initial",
      status: "succeeded",
      durationMs: 5,
      promptChars: 10,
      outputChars: 10,
      artifactName: "OntologySeed",
    });
    expect(collector.unitTelemetry("ontology_seed")).not.toBeNull();
    collector.reset();
    expect(collector.unitTelemetry("ontology_seed")).toBeNull();
    expect(collector.allUnitTelemetry()).toEqual([]);
  });

  it("records batch count and returns cloned rows", () => {
    const collector = createReconstructExecutionTelemetryCollector();
    collector.recordBatchCount("competency_question_assessment", 3);
    const row = collector.unitTelemetry("competency_question_assessment");
    expect(row?.batch_count).toBe(3);
    row!.batch_count = 99;
    expect(
      collector.unitTelemetry("competency_question_assessment")?.batch_count,
    ).toBe(3);
  });

  it("merges collectors by first-match unit ownership", () => {
    const author = createReconstructExecutionTelemetryCollector();
    const provider = createReconstructExecutionTelemetryCollector();
    provider.recordLlmAttempt({
      unitId: "purpose_confirmation",
      kind: "initial",
      status: "succeeded",
      durationMs: 5,
      promptChars: 10,
      outputChars: 10,
    });
    expect(
      mergedUnitExecutionTelemetry([author, provider], "purpose_confirmation")
        ?.unit_id,
    ).toBe("purpose_confirmation");
    expect(
      mergedUnitExecutionTelemetry([author, provider], "ontology_seed"),
    ).toBeNull();
    expect(mergedUnitExecutionTelemetry([undefined, undefined], "x")).toBeNull();
  });

  it("records a validation-gate miss as a failed attempt without counting an LLM call", () => {
    const collector = createReconstructExecutionTelemetryCollector();
    collector.recordLlmAttempt({
      unitId: "competency_questions",
      kind: "initial",
      status: "succeeded",
      durationMs: 50,
      promptChars: 100,
      outputChars: 100,
      artifactName: "CompetencyQuestions",
    });
    collector.recordValidationGateFailure({
      unitId: "competency_questions",
      failureMessage: "missing_required_coverage (ontology_representation_formalism)",
    });
    collector.recordLlmAttempt({
      unitId: "competency_questions",
      kind: "semantic_repair",
      status: "succeeded",
      durationMs: 60,
      promptChars: 120,
      outputChars: 140,
      artifactName: "CompetencyQuestionsValidationRepair",
    });
    const row = collector.unitTelemetry("competency_questions");
    // The validation miss is visible in the lineage but is not an LLM call and
    // does not contribute to the size counters.
    expect(row?.llm_call_count).toBe(2);
    expect(row?.attempt_count).toBe(3);
    expect(row?.prompt_chars).toBe(220);
    expect(row?.output_chars).toBe(240);
    expect(row?.attempts).toEqual([
      {
        attempt: 1,
        kind: "initial",
        status: "succeeded",
        failure_class: null,
        failure_message: null,
        duration_ms: 50,
      },
      {
        attempt: 2,
        kind: "validation_gate",
        status: "failed",
        failure_class: "schema_validation_failure",
        failure_message:
          "missing_required_coverage (ontology_representation_formalism)",
        duration_ms: 0,
      },
      {
        attempt: 3,
        kind: "semantic_repair",
        status: "succeeded",
        failure_class: null,
        failure_message: null,
        duration_ms: 60,
      },
    ]);
    // The unit recovered (terminal attempt succeeded).
    expect(terminalFailureMessageFromTelemetry(row)).toBeNull();
  });

  it("surfaces the terminal validation-gate rejection when repair output stays invalid", () => {
    // first miss -> repair (LLM call succeeds) -> still invalid -> terminal gate
    // rejection. The unit halts here, so the terminal failure summary must report
    // the validation rejection, not the succeeded repair call.
    const collector = createReconstructExecutionTelemetryCollector();
    collector.recordLlmAttempt({
      unitId: "ontology_seed",
      kind: "initial",
      status: "succeeded",
      durationMs: 5,
      promptChars: 10,
      outputChars: 10,
    });
    collector.recordValidationGateFailure({
      unitId: "ontology_seed",
      failureMessage: "first miss",
    });
    collector.recordLlmAttempt({
      unitId: "ontology_seed",
      kind: "semantic_repair",
      status: "succeeded",
      durationMs: 5,
      promptChars: 10,
      outputChars: 10,
    });
    collector.recordValidationGateFailure({
      unitId: "ontology_seed",
      failureMessage: "still invalid after repair",
    });
    const row = collector.unitTelemetry("ontology_seed");
    expect(row?.attempts.map((attempt) => attempt.kind)).toEqual([
      "initial",
      "validation_gate",
      "semantic_repair",
      "validation_gate",
    ]);
    expect(terminalFailureMessageFromTelemetry(row))
      .toBe("still invalid after repair");
  });

  it("tolerates an unknown (future) attempt kind / failure class at the consumer boundary", () => {
    // The kind/failure_class sets are additively-extensible and forward-
    // compatible at the STORED/read shape: a consumer reading a manifest a newer
    // producer wrote must record/pass an unknown value through, not reject it.
    // (Producers stay closed — recordLlmAttempt's input rejects unknown kinds.)
    const telemetry: ReconstructUnitExecutionTelemetry = {
      unit_id: "ontology_seed",
      llm_call_count: 1,
      duration_ms: 7,
      prompt_chars: 3,
      output_chars: 0,
      provider_tokens_in: null,
      provider_tokens_out: null,
      provider_route: null,
      model_id: null,
      effort: null,
      prompt_policy_sha256: null,
      source_identity_refs: [],
      attempt_count: 1,
      attempts: [
        {
          attempt: 1,
          kind: "future_attempt_kind",
          status: "failed",
          failure_class: "future_failure_class",
          failure_message: "emitted by a newer producer",
          duration_ms: 7,
        },
      ],
      batch_count: null,
    };
    expect(terminalFailureMessageFromTelemetry(telemetry))
      .toBe("emitted by a newer producer");
  });
});
