import { describe, expect, it } from "vitest";
import type {
  ReconstructRunProgressProjection,
  ReconstructRunStageProjection,
  ReconstructSessionStatus,
} from "../../core-api/reconstruct-api.js";
import type {
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
} from "../../core-runtime/reconstruct/artifact-types.js";
import { reconstructStatusToTreeViewModel } from "./reconstruct-adapter.js";

const SESSION_ROOT = "/tmp/.onto/reconstruct/20260616-abcd1234";

/**
 * The adapter is a pure projection over `status.sessionId`, `status.status` and
 * `status.progress` only. `artifactRefs` (~95 keys) and the full
 * `reconstructRecord` are part of the REAL `ReconstructSessionStatus` type but
 * are NOT consumed by the adapter, so the fixtures carry minimal, clearly-typed
 * placeholders for those two blobs (cast once here) while building the consumed
 * `progress` projection in full, literal form.
 */
const ARTIFACT_REFS_PLACEHOLDER = {} as ReconstructRecordArtifactRefs;
function recordPlaceholder(
  recordStage: ReconstructRecordArtifact["record_stage"],
): ReconstructRecordArtifact {
  return {
    record_stage: recordStage,
    artifact_refs: ARTIFACT_REFS_PLACEHOLDER,
  } as ReconstructRecordArtifact;
}

function makeStatus(args: {
  recordStage: ReconstructRecordArtifact["record_stage"];
  progress: ReconstructRunProgressProjection;
}): ReconstructSessionStatus {
  return {
    sessionId: "20260616-abcd1234",
    sessionRoot: SESSION_ROOT,
    status: args.recordStage,
    artifactRefs: ARTIFACT_REFS_PLACEHOLDER,
    claimProjection: null,
    claimProjectionValidation: null,
    progress: args.progress,
    reconstructRecord: recordPlaceholder(args.recordStage),
  };
}

function stage(
  stageId: ReconstructRunStageProjection["stageId"],
  state: ReconstructRunStageProjection["state"],
  overrides: Partial<ReconstructRunStageProjection> = {},
): ReconstructRunStageProjection {
  return {
    stageId,
    state,
    owner: overrides.owner ?? null,
    artifactRefs: overrides.artifactRefs ?? [],
    reason: overrides.reason ?? null,
    authorityImpact: overrides.authorityImpact ?? null,
  };
}

function emptyCountSummary(): ReconstructRunProgressProjection["countSummary"] {
  return {
    sourceObservationCount: null,
    selectedObservationCount: null,
    semanticClaimCount: null,
    confirmedClaimCount: null,
    partialClaimCount: null,
    deferredClaimCount: null,
    competencyQuestionCount: null,
    assessmentCount: null,
    failureCount: null,
    revisionProposalCount: null,
    unresolvedCount: null,
    passRate: null,
  };
}

describe("reconstructStatusToTreeViewModel", () => {
  it("maps a running mid-maturation session", () => {
    const progress: ReconstructRunProgressProjection = {
      executionProfile: null,
      currentStageId: "answer_support_judgment",
      stageCount: 96,
      liveness: { state: "halted_or_partial", recommendedPollIntervalMs: 1000 },
      countSummary: {
        ...emptyCountSummary(),
        sourceObservationCount: 40,
        selectedObservationCount: 25,
        semanticClaimCount: 12,
        confirmedClaimCount: 8,
        deferredClaimCount: 2,
        competencyQuestionCount: 6,
        passRate: 0.75,
      },
      answerabilitySummary: {
        declaredQuestionCount: 6,
        supportedQuestionCount: 4,
        deferredQuestionCount: 1,
        unsupportedQuestionCount: 1,
        supportedActionCount: 3,
        unsupportedActionCount: 0,
      },
      stages: [
        stage("ontology_seed", "completed", {
          owner: "host_llm",
          artifactRefs: ["ontology-seed.yaml"],
        }),
        stage("answer_support_judgment", "pending", { owner: "host_llm" }),
        stage("ontology_expansion", "pending", { owner: "host_llm" }),
        stage("final_output", "pending", { owner: "runtime" }),
      ],
    };
    const vm = reconstructStatusToTreeViewModel(
      makeStatus({ recordStage: "metrics_computed", progress }),
      SESSION_ROOT,
    );

    expect(vm.pipeline).toBe("reconstruct");
    expect(vm.sessionId).toBe("20260616-abcd1234");
    expect(vm.sessionRoot).toBe(SESSION_ROOT);
    expect(vm.status).toBe("running");

    // Single pipeline phase, all stages as nodes (v1 grouping).
    expect(vm.phases).toHaveLength(1);
    const phase = vm.phases[0]!;
    expect(phase.id).toBe("pipeline");
    expect(phase.state).toBe("running");
    expect(phase.nodes).toHaveLength(4);

    const seedNode = phase.nodes[0]!;
    expect(seedNode.id).toBe("ontology_seed");
    expect(seedNode.label).toBe("ontology seed");
    expect(seedNode.status).toBe("completed");
    expect(seedNode.kind).toBe("ontology_seed");
    expect(seedNode.owner).toBe("host_llm");
    expect(seedNode.outputPath).toBe("ontology-seed.yaml");

    expect(phase.nodes[1]!.status).toBe("pending");

    // liveness from the projection.
    expect(vm.liveness.state).toBe("halted_or_partial");
    expect(vm.liveness.pollMs).toBe(1000);
    expect(vm.liveness.secondsSinceSignal).toBeNull();

    // Flat counts merge countSummary + answerability.
    expect(vm.summary.counts).toEqual({
      observations: 25,
      claims: 12,
      confirmed: 8,
      deferredClaims: 2,
      CQ: 6,
      passRate: 0.75,
      declared: 6,
      supported: 4,
      deferred: 1,
      unsupported: 1,
    });
    expect(vm.summary.findings).toBeUndefined();

    // Conservative run control: running → cancellable only.
    expect(vm.runControl).toEqual({
      cancellable: true,
      continuable: false,
      advanceable: false,
    });

    expect(vm.narrator).toContain("answer support judgment");
    expect(vm.narrator).toContain("supported 4");
  });

  it("maps a completed session", () => {
    const progress: ReconstructRunProgressProjection = {
      executionProfile: null,
      currentStageId: "post_publication_run_manifest_validation",
      stageCount: 96,
      liveness: { state: "completed", recommendedPollIntervalMs: null },
      countSummary: {
        ...emptyCountSummary(),
        selectedObservationCount: 30,
        semanticClaimCount: 18,
        confirmedClaimCount: 16,
        competencyQuestionCount: 8,
        passRate: 1,
      },
      answerabilitySummary: {
        declaredQuestionCount: 8,
        supportedQuestionCount: 8,
        deferredQuestionCount: 0,
        unsupportedQuestionCount: 0,
        supportedActionCount: 5,
        unsupportedActionCount: 0,
      },
      stages: [
        stage("ontology_seed", "completed", {
          artifactRefs: ["ontology-seed.yaml"],
        }),
        stage("final_output", "completed", {
          owner: "runtime",
          artifactRefs: ["final-output.md"],
        }),
        stage("source_scout_pack_pre_seed", "skipped"),
      ],
    };
    const vm = reconstructStatusToTreeViewModel(
      makeStatus({ recordStage: "completed", progress }),
      SESSION_ROOT,
    );

    expect(vm.status).toBe("completed");
    expect(vm.phases[0]!.state).toBe("completed");
    expect(vm.phases[0]!.nodes.map((n) => n.status)).toEqual([
      "completed",
      "completed",
      "skipped",
    ]);
    expect(vm.liveness.state).toBe("completed");
    expect(vm.liveness.pollMs).toBeNull();
    expect(vm.summary.counts).toMatchObject({
      observations: 30,
      claims: 18,
      CQ: 8,
      supported: 8,
      unsupported: 0,
    });
    // Completed → not cancellable.
    expect(vm.runControl.cancellable).toBe(false);
    expect(vm.narrator).toContain("reconstruct complete");
  });

  it("maps a halted stage to a halted workflow", () => {
    const progress: ReconstructRunProgressProjection = {
      executionProfile: null,
      currentStageId: "purpose_confirmation",
      stageCount: 96,
      liveness: { state: "halted_or_partial", recommendedPollIntervalMs: 1000 },
      countSummary: emptyCountSummary(),
      answerabilitySummary: null,
      stages: [
        stage("purpose_confirmation", "halted", {
          owner: "host_or_user",
          reason: "awaiting human purpose confirmation",
        }),
      ],
    };
    const vm = reconstructStatusToTreeViewModel(
      makeStatus({ recordStage: "incomplete", progress }),
      SESSION_ROOT,
    );

    expect(vm.status).toBe("halted");
    expect(vm.phases[0]!.state).toBe("halted");
    expect(vm.phases[0]!.nodes[0]!.status).toBe("halted");
    expect(vm.phases[0]!.nodes[0]!.failureMessage).toBe(
      "awaiting human purpose confirmation",
    );
    // answerability null → those keys are null, countSummary keys null too.
    expect(vm.summary.counts).toMatchObject({
      claims: null,
      supported: null,
      unsupported: null,
    });
    expect(vm.runControl.cancellable).toBe(false);
    expect(vm.narrator).toContain("halted at purpose confirmation");
  });

  it("maps a record-less provider failure to a failed workflow", () => {
    const failureRef = `${SESSION_ROOT}/llm-dispatch-failures/failure-a.yaml`;
    const status: ReconstructSessionStatus = {
      sessionId: "20260616-abcd1234",
      sessionRoot: SESSION_ROOT,
      status: "failed",
      artifactRefs: {
        reconstruct_run_control: `${SESSION_ROOT}/reconstruct-run-control.yaml`,
        reconstruct_run_control_validation:
          `${SESSION_ROOT}/reconstruct-run-control-validation.yaml`,
      },
      claimProjection: null,
      claimProjectionValidation: null,
      progress: {
        executionProfile: null,
        currentStageId: "ontology_seed",
        stageCount: 96,
        liveness: {
          state: "halted_or_partial",
          recommendedPollIntervalMs: null,
        },
        countSummary: { ...emptyCountSummary(), failureCount: null },
        answerabilitySummary: null,
        stages: [stage("ontology_seed", "halted", {
          owner: "host_llm",
          artifactRefs: [failureRef],
          reason: "openai_responses_max_output_tokens",
        })],
      },
      reconstructRecord: null,
      runControlRef: `${SESSION_ROOT}/reconstruct-run-control.yaml`,
      runControlValidationRef:
        `${SESSION_ROOT}/reconstruct-run-control-validation.yaml`,
      failure: {
        failure_code: "openai_responses_max_output_tokens",
        unit_id: "ontology_seed",
        artifact_name: "OntologySeed",
        provider_status: "incomplete",
        incomplete_reason: "max_output_tokens",
        base_output_ceiling_tokens: 9_000,
        configured_output_headroom_tokens: 25_000,
        effective_max_output_tokens: 34_000,
        input_tokens: 2_000,
        cached_input_tokens: 0,
        output_tokens: 33_990,
        reasoning_tokens: 33_000,
        non_reasoning_output_tokens: 990,
        actual_adapter_request_count: null,
        request_count_observability: "unavailable",
        failure_artifact_ref: failureRef,
      },
    };

    const vm = reconstructStatusToTreeViewModel(status, SESSION_ROOT);

    expect(vm.status).toBe("failed");
    expect(vm.narrator).toContain("reconstruct failed at ontology seed");
    expect(vm.phases[0]?.state).toBe("halted");
    expect(vm.phases[0]?.nodes[0]?.outputPath).toBeNull();
    expect(vm.runControl.cancellable).toBe(false);
  });
});
