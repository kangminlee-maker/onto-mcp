import { describe, expect, it } from "vitest";
import type {
  ReviewResultClassificationProjection,
  ReviewRunControlProjection,
  ReviewRuntimeUnitProgressProjection,
  ReviewStatus,
} from "../../core-api/review-api.js";
import type { ReviewResultClassificationSummary } from "../../core-runtime/review/artifact-types.js";
import { reviewStatusToTreeViewModel } from "./review-adapter.js";

const SESSION_ROOT = "/tmp/.onto/review/20260616-62411f81";

/**
 * The adapter consumes `status.{sessionId,status,unitProgress,runControl}` plus
 * the bounded `llmPresentation.progress.input` payload (typed `unknown` on the
 * source). `artifactRefs`, `failureRefs`, `structuredFailures` and the other
 * `ReviewStatus` fields are part of the REAL type but unused by the adapter, so
 * the fixtures carry minimal, clearly-typed placeholders for those while building
 * the consumed fields in full, literal form.
 */
function unit(
  overrides: Partial<ReviewRuntimeUnitProgressProjection> &
    Pick<
      ReviewRuntimeUnitProgressProjection,
      "unitId" | "publicAlias" | "unitKind" | "progressStepId" | "status"
    >,
): ReviewRuntimeUnitProgressProjection {
  return {
    packetPath: null,
    outputPath: null,
    runningLogRef: null,
    latestSignal: null,
    latestSignalAt: null,
    secondsSinceLatestSignal: null,
    attemptCount: 0,
    failureMessage: null,
    ...overrides,
  };
}

function runControl(
  overrides: Partial<ReviewRunControlProjection> = {},
): ReviewRunControlProjection {
  return {
    activeAttempt: null,
    lifecycleState: "active",
    alreadyRunning: false,
    cancellationAvailable: false,
    cancellationRequested: false,
    cancellationRequestRef: null,
    continuationAvailable: false,
    retryAvailable: false,
    retrySemantics: "use_review_continue",
    hostTimeoutSemantics: "review_continues_under_session",
    statusReason: "",
    ...overrides,
  };
}

/**
 * Builds the bounded progress-presentation payload that lives at
 * `llmPresentation.progress.input` (typed `unknown` on `ReviewStatus`). The
 * adapter narrows it structurally, so the test supplies the real field names.
 */
function progressInput(args: {
  state: string;
  secondsSinceArtifact: number | null;
  pollAfterSeconds: number | null;
  completedSteps: string[];
  latestSummary?: string;
  livenessSummary?: string;
  classification?: ReviewResultClassificationProjection | null;
}): unknown {
  return {
    progress: {
      current_step: 2,
      total_steps: 12,
      completed_steps: args.completedSteps,
    },
    liveness: {
      state: args.state,
      seconds_since_last_observed_artifact: args.secondsSinceArtifact,
      poll_after_seconds: args.pollAfterSeconds,
      summary: args.livenessSummary ?? "",
    },
    latest_update: { summary: args.latestSummary ?? "" },
    result_classification_summary: args.classification ?? null,
  };
}

function makeStatus(args: {
  status: ReviewStatus["status"];
  unitProgress: ReviewRuntimeUnitProgressProjection[];
  runControl: ReviewRunControlProjection;
  progressInput: unknown;
}): ReviewStatus {
  return {
    sessionId: "20260616-62411f81",
    sessionRoot: SESSION_ROOT,
    projectionLevel: "standard",
    status: args.status,
    artifactRefs: {},
    failureRefs: [],
    structuredFailures: [],
    runControl: args.runControl,
    unitProgress: args.unitProgress,
    llmPresentation: {
      progress: {
        prompt: "show progress",
        input: args.progressInput,
      },
    },
  };
}

describe("reviewStatusToTreeViewModel", () => {
  it("maps a running session: units grouped by progress step, live signal carried", () => {
    const status = makeStatus({
      status: "running",
      runControl: runControl({ cancellationAvailable: true }),
      unitProgress: [
        unit({
          unitId: "lens:axiology",
          publicAlias: "lens:axiology",
          unitKind: "lens",
          progressStepId: "lens_dispatch",
          status: "running",
          secondsSinceLatestSignal: 1,
          attemptCount: 1,
        }),
        unit({
          unitId: "lens:coverage",
          publicAlias: "lens:coverage",
          unitKind: "lens",
          progressStepId: "lens_dispatch",
          status: "retrying",
          secondsSinceLatestSignal: 2,
          attemptCount: 2,
        }),
        unit({
          unitId: "manifest",
          publicAlias: "manifest validation",
          unitKind: "manifest",
          progressStepId: "manifest_validation",
          status: "completed",
          outputPath: "/tmp/manifest.yaml",
        }),
      ],
      progressInput: progressInput({
        state: "running_recent_signal",
        secondsSinceArtifact: 1,
        pollAfterSeconds: 5,
        completedSteps: ["manifest_validation"],
        latestSummary: "isolated lens execution — 2 running",
      }),
    });

    const vm = reviewStatusToTreeViewModel(status, SESSION_ROOT);

    expect(vm.pipeline).toBe("review");
    expect(vm.sessionId).toBe("20260616-62411f81");
    expect(vm.sessionRoot).toBe(SESSION_ROOT);
    expect(vm.status).toBe("running");

    // Phases ordered by progress step: manifest_validation (step 1) before
    // lens_dispatch (step 2). Phase label = the step label.
    expect(vm.phases.map((p) => p.id)).toEqual([
      "manifest_validation",
      "lens_dispatch",
    ]);
    const manifestPhase = vm.phases[0]!;
    expect(manifestPhase.label).toBe("load execution plan");
    // listed in completed_steps → completed phase.
    expect(manifestPhase.state).toBe("completed");
    expect(manifestPhase.nodes).toHaveLength(1);

    const lensPhase = vm.phases[1]!;
    expect(lensPhase.label).toBe("isolated lens execution");
    // a running node → running phase.
    expect(lensPhase.state).toBe("running");
    expect(lensPhase.nodes).toHaveLength(2);

    const axiology = lensPhase.nodes[0]!;
    expect(axiology.id).toBe("lens:axiology");
    expect(axiology.label).toBe("lens:axiology");
    expect(axiology.status).toBe("running");
    expect(axiology.kind).toBe("lens");
    expect(axiology.signalAgeSec).toBe(1);
    expect(axiology.attempts).toBe(1);

    // `retrying` collapses to running; attempt count is preserved.
    const coverage = lensPhase.nodes[1]!;
    expect(coverage.status).toBe("running");
    expect(coverage.attempts).toBe(2);

    // liveness from the progress projection; poll seconds → ms.
    expect(vm.liveness).toEqual({
      state: "running_recent_signal",
      secondsSinceSignal: 1,
      pollMs: 5000,
    });

    // narrator = latest_update.summary.
    expect(vm.narrator).toBe("isolated lens execution — 2 running");

    // No classification yet → zeroed findings, no material titles.
    expect(vm.summary.findings).toEqual({
      blocker: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      material: [],
    });
    expect(vm.summary.counts).toBeUndefined();

    // run control from the projection: cancellable, not continuable.
    expect(vm.runControl).toEqual({ cancellable: true, continuable: false });
  });

  it("maps a completed session with one material issue", () => {
    const classification: ReviewResultClassificationSummary = {
      highest_severity: "high",
      finding_count: 3,
      issue_count: 1,
      finding_severity_counts: { blocker: 0, high: 1, medium: 1, low: 1, info: 0 },
      issue_severity_counts: { blocker: 0, high: 1, medium: 0, low: 0, info: 0 },
      severity_counts: { blocker: 0, high: 1, medium: 1, low: 1, info: 0 },
      material_issue_count: 1,
      non_material_finding_count: 2,
      material_issues: [
        {
          issue_id: "ISSUE-1",
          severity: "high",
          material: true,
          affected_purpose: "judge gate soundness",
          failure_condition: "convergent claim lacks a judge",
          impact: "ontology expansion proceeds on unverified claims",
          evidence_refs: [],
          source_lens_ids: ["logic"],
          action_candidates: ["fix_before_release"],
          rationale: "B-6 requires judge-confirmed evidence",
          problem_definition: "missing judge on convergent claim",
        },
      ],
      non_material_findings: [],
      action_candidates: [],
    };

    const status = makeStatus({
      status: "completed",
      runControl: runControl({ continuationAvailable: true }),
      unitProgress: [
        unit({
          unitId: "synthesize",
          publicAlias: "synthesize",
          unitKind: "synthesize",
          progressStepId: "synthesize",
          status: "completed",
          outputPath: "/tmp/final-output.md",
        }),
      ],
      progressInput: progressInput({
        state: "completed",
        secondsSinceArtifact: null,
        pollAfterSeconds: null,
        completedSteps: ["synthesize"],
        latestSummary:
          "Review completed; final output and ReviewRecord are available.",
        classification,
      }),
    });

    const vm = reviewStatusToTreeViewModel(status, SESSION_ROOT);

    expect(vm.status).toBe("completed");

    expect(vm.phases).toHaveLength(1);
    const synthesizePhase = vm.phases[0]!;
    expect(synthesizePhase.id).toBe("synthesize");
    expect(synthesizePhase.label).toBe("synthesize and write execution result");
    expect(synthesizePhase.state).toBe("completed");
    expect(synthesizePhase.nodes[0]!.outputPath).toBe("/tmp/final-output.md");

    // liveness with no poll interval → null pollMs.
    expect(vm.liveness).toEqual({
      state: "completed",
      secondsSinceSignal: null,
      pollMs: null,
    });

    // findings = severity counts + the one material issue title.
    expect(vm.summary.findings).toEqual({
      blocker: 0,
      high: 1,
      medium: 1,
      low: 1,
      info: 0,
      material: ["ISSUE-1: missing judge on convergent claim"],
    });

    // completed session → continuable from run control, not cancellable.
    expect(vm.runControl).toEqual({ cancellable: false, continuable: true });

    expect(vm.narrator).toBe(
      "Review completed; final output and ReviewRecord are available.",
    );
  });
});
