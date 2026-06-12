import { describe, expect, it } from "vitest";
import {
  attemptKindForAuthoredArtifactName,
  createReconstructExecutionTelemetryCollector,
  failureClassForLlmCallError,
  lastFailureMessageFromTelemetry,
  mergedUnitExecutionTelemetry,
  unitIdForAuthoredArtifactName,
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
    expect(unitIdForAuthoredArtifactName("SourcePurposeContradictionRepair"))
      .toBe("source_purpose_candidates");
    expect(unitIdForAuthoredArtifactName("UnknownArtifact")).toBeNull();
  });

  it("classifies attempt kinds from authored artifact names", () => {
    expect(attemptKindForAuthoredArtifactName("OntologySeed")).toBe("initial");
    expect(attemptKindForAuthoredArtifactName("OntologySeedMinimalKernel"))
      .toBe("timeout_recovery");
    expect(attemptKindForAuthoredArtifactName("CandidateInventoryCoverageRepair"))
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
    expect(lastFailureMessageFromTelemetry(row))
      .toBe("OntologySeed author returned no JSON object.");
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
});
