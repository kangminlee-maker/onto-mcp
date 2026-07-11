import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  attemptKindForAuthoredArtifactName,
  createReconstructExecutionTelemetryCollector,
  failureClassForLlmCallError,
  mergedUnitExecutionTelemetry,
  terminalFailureMessageFromTelemetry,
  unitIdForAuthoredArtifactName,
  type ReconstructUnitExecutionTelemetry,
} from "./execution-telemetry.js";
import { StructuredDispatchError } from "../llm/structured-dispatch-error.js";

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
    expect(failureClassForLlmCallError(new StructuredDispatchError({
      descriptor_id: "descriptor",
      capability_instance_id: "instance",
      logical_dispatch_id: "logical",
      actual_adapter_request_count: 1,
      failure_class: "transport",
      failure_code: "timeout",
      source: "sdk_exception_type",
    }), () => false)).toBe("timeout");
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

  it("nulls every singular route projection after a mixed-provider unit", () => {
    const collector = createReconstructExecutionTelemetryCollector({
      nullMixedRouteProjection: true,
    });
    for (const input of [
      {
        providerRoute: "openai",
        provider: "openai",
        executionAdapter: "openai_sdk" as const,
        effectiveBaseUrl: "https://api.openai.com/v1",
        modelId: "model-a",
        effort: "medium",
      },
      {
        providerRoute: "anthropic",
        provider: "anthropic",
        executionAdapter: "anthropic_sdk" as const,
        effectiveBaseUrl: "https://api.anthropic.com",
        modelId: "model-b",
        effort: "high",
      },
    ]) {
      collector.recordLlmAttempt({
        unitId: "semantic_map",
        kind: "initial",
        status: "succeeded",
        durationMs: 1,
        promptChars: 1,
        outputChars: 1,
        ...input,
      });
    }
    expect(collector.unitTelemetry("semantic_map")).toMatchObject({
      provider_route: null,
      model_id: null,
      effort: null,
      route_identity: null,
      llm_call_count: 2,
    });
  });

  it("keeps the legacy last-attempt route projection unless fallback opts in", () => {
    const collector = createReconstructExecutionTelemetryCollector();
    for (const provider of ["openai", "anthropic"] as const) {
      collector.recordLlmAttempt({
        unitId: "semantic_map",
        kind: "initial",
        status: "succeeded",
        durationMs: 1,
        promptChars: 1,
        outputChars: 1,
        providerRoute: provider,
        provider,
        executionAdapter: provider === "openai" ? "openai_sdk" : "anthropic_sdk",
        effectiveBaseUrl:
          provider === "openai"
            ? "https://api.openai.com/v1"
            : "https://api.anthropic.com",
        modelId: `${provider}-model`,
        effort: "medium",
      });
    }
    expect(collector.unitTelemetry("semantic_map")).toMatchObject({
      provider_route: "anthropic",
      model_id: "anthropic-model",
      effort: "medium",
    });
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

  it("preserves provider-reported zero tokens distinctly from unreported tokens", () => {
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
    expect(row?.provider_tokens_in).toBe(0);
    expect(row?.provider_tokens_out).toBe(0);

    const unreportedCollector = createReconstructExecutionTelemetryCollector();
    unreportedCollector.recordLlmAttempt({
      unitId: "stop_decision",
      kind: "initial",
      status: "succeeded",
      durationMs: 5,
      promptChars: 10,
      outputChars: 10,
    });
    const unreported = unreportedCollector.unitTelemetry("stop_decision");
    expect(unreported?.provider_tokens_in).toBeNull();
    expect(unreported?.provider_tokens_out).toBeNull();
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

// Structural recurrence guard (leaf-read production-wiring fix). The defect: "leaf-read" was passed
// to callJsonAuthor but absent from UNIT_ID_BY_AUTHORED_ARTIFACT_NAME, so callLlmRecorded threw
// before the LLM call and the caller silently degraded it. The unit tests above bypassed callJsonAuthor
// and never exercised that resolution. This guard closes the dependency at build time: it scans the
// real call surface (every callJsonAuthor/callLlmRecorded call site — the SOLE paths to
// unitIdForAuthoredArtifactName) and asserts every static/templated artifactName resolves to a unit.
// A new authored-artifact merged without a mapping fails CI here, by construction.
describe("telemetry-unit coverage guard (callJsonAuthor/callLlmRecorded surface)", () => {
  it("every artifactName at a telemetry call site resolves to a pipeline unit", () => {
    const runTsPath = fileURLToPath(new URL("./run.ts", import.meta.url));
    const lines = readFileSync(runTsPath, "utf8").split("\n");
    const callSite = /\bcall(?:JsonAuthor|LlmRecorded)\(/;
    const names = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      if (!callSite.test(lines[i])) continue;
      // Find this call's artifactName: property within its args object (next ~40 lines), then capture
      // the value across continuation lines until the next property / object close.
      for (let j = i; j < Math.min(i + 40, lines.length); j++) {
        const at = lines[j].indexOf("artifactName:");
        if (at === -1) continue;
        let value = lines[j].slice(at + "artifactName:".length);
        for (let k = j + 1; k < Math.min(j + 6, lines.length); k++) {
          if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*:/.test(lines[k]) || /^\s*[})]/.test(lines[k])) break;
          value += "\n" + lines[k];
        }
        // Forwarding / identifier / type annotation (no string content) → the real name is checked at
        // the caller; skip. Anything containing a string OR template literal is a concrete name source
        // (covers `cond ? "A" : "B"` conditionals too).
        if (value.includes('"') || value.includes("`")) {
          for (const m of value.matchAll(/"([^"]+)"/g)) names.add(m[1]);
          // Concretize template placeholders so prefix-rule names (e.g. `ReconstructLensJudgment:${id}`)
          // resolve via the startsWith branches in unitIdForAuthoredArtifactName.
          for (const m of value.matchAll(/`([^`]+)`/g)) names.add(m[1].replace(/\$\{[^}]*\}/g, "X"));
        }
        break;
      }
    }
    // Sanity: the scan actually found the telemetry surface (guards against a silently-broken regex).
    expect(names.size).toBeGreaterThan(20);
    // The regression target must be covered.
    expect(names.has("leaf-read")).toBe(true);
    const unresolved = [...names].filter((name) => {
      try {
        unitIdForAuthoredArtifactName(name);
        return false;
      } catch {
        return true;
      }
    });
    expect(unresolved).toEqual([]);
  });
});
