import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ReviewActorInvocationProfilesArtifact,
  ReviewExecutionPlan,
} from "../core-runtime/review/artifact-types.js";
import {
  assertReviewExecutionPlanSessionBoundary,
} from "../core-runtime/review/execution-plan-boundary.js";
import {
  appendMarkdownLogEntry,
  readYamlDocument,
  writeYamlDocument,
} from "../core-runtime/review/review-artifact-utils.js";
import {
  executeReviewPromptExecution,
} from "../core-runtime/cli/run-review-prompt-execution.js";
import {
  createOntoReviewCoreApi,
  type OntoReviewCoreApi,
  type ReviewStatus,
} from "./review-api.js";

const tempRoots: string[] = [];
let originalHome: string | undefined;

beforeEach(async () => {
  originalHome = process.env.HOME;
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-core-api-home-"));
  tempRoots.push(homeRoot);
  process.env.HOME = homeRoot;
});

async function tempProjectRoot(): Promise<string> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-core-api-review-"),
  );
  tempRoots.push(projectRoot);
  await fs.writeFile(
    path.join(projectRoot, "target.txt"),
    "progress observer isolation target\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(projectRoot, "target.ts"),
    "export const reviewTarget = 1;\n",
    "utf8",
  );
  return projectRoot;
}

afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

async function waitForReviewStatus(
  api: OntoReviewCoreApi,
  sessionRoot: string,
  terminalStatus: ReviewStatus["status"],
): Promise<ReviewStatus> {
  const deadline = Date.now() + 15_000;
  let latest = await api.getReviewStatus(sessionRoot);
  while (Date.now() < deadline) {
    if (latest.status === terminalStatus) return latest;
    await new Promise((resolve) => setTimeout(resolve, 100));
    latest = await api.getReviewStatus(sessionRoot);
  }
  throw new Error(
    `Timed out waiting for review status ${terminalStatus}; latest=${latest.status}`,
  );
}

type ExecutionPlanPathSegment = string | number;

interface ExecutionPlanPathRef {
  label: string;
  segments: ExecutionPlanPathSegment[];
  original: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExecutionPlanPathKey(key: string): boolean {
  return key === "session_root" || key.endsWith("_path") || key.endsWith("_root");
}

function collectExecutionPlanPathRefs(
  value: unknown,
  segments: ExecutionPlanPathSegment[] = [],
): ExecutionPlanPathRef[] {
  const refs: ExecutionPlanPathRef[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      refs.push(...collectExecutionPlanPathRefs(item, [...segments, index]));
    });
    return refs;
  }
  if (!isRecord(value)) return refs;

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedSegments = [...segments, key];
    if (typeof nestedValue === "string" && isExecutionPlanPathKey(key)) {
      refs.push({
        label: nestedSegments.map(String).join("."),
        segments: nestedSegments,
        original: nestedValue,
      });
    }
    refs.push(...collectExecutionPlanPathRefs(nestedValue, nestedSegments));
  }
  return refs;
}

function setNestedExecutionPlanRef(
  value: unknown,
  segments: ExecutionPlanPathSegment[],
  replacement: string,
): void {
  if (segments.length === 0) {
    throw new Error("Cannot set an empty execution-plan path ref");
  }

  let cursor = value;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(segment)];
    } else if (isRecord(cursor)) {
      cursor = cursor[String(segment)];
    } else {
      throw new Error(`Cannot traverse execution-plan path ref ${segments.join(".")}`);
    }
  }

  const finalSegment = segments[segments.length - 1];
  if (Array.isArray(cursor)) {
    cursor[Number(finalSegment)] = replacement;
    return;
  }
  if (isRecord(cursor)) {
    cursor[String(finalSegment)] = replacement;
    return;
  }
  throw new Error(`Cannot set execution-plan path ref ${segments.join(".")}`);
}

function cloneReviewExecutionPlan(plan: ReviewExecutionPlan): ReviewExecutionPlan {
  return JSON.parse(JSON.stringify(plan)) as ReviewExecutionPlan;
}

describe("createOntoReviewCoreApi", () => {
  it("lists software-engineering as the canonical AI-era engineering domain", async () => {
    const projectRoot = await tempProjectRoot();
    await fs.mkdir(path.join(projectRoot, ".onto", "domains", "software-engineering"), {
      recursive: true,
    });
    await fs.mkdir(path.join(projectRoot, ".onto", "domains", "llm-native-development"), {
      recursive: true,
    });

    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const domains = await api.listDomains(projectRoot);
    expect(domains).toContain("software-engineering");
    expect(domains).not.toContain("llm-native-development");
  });

  it("keeps native progress observer failures isolated from review execution", async () => {
    const projectRoot = await tempProjectRoot();
    let observedProgressEvents = 0;
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API progress observer isolation test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
      progressObserver: () => {
        observedProgressEvents += 1;
        throw new Error("observer transport failure");
      },
    });

    expect(observedProgressEvents).toBeGreaterThan(0);
    expect(result.status).toBe("completed");
    expect(result.participatingLensIds).toEqual(["logic"]);
    expect(result.resultOverview).toBeUndefined();
    expect(
      (result.startPreview?.entrypointPlan as { request_text?: string } | undefined)
        ?.request_text?.length,
    ).toBeLessThanOrEqual(360);
    expect(
      result.startPreview?.boundedInvokeSteps?.every((step) => step.length <= 360),
    ).toBe(true);
    expect(result.pipelineExecutionLedger?.pipeline).toBe("review");
    expect(
      result.pipelineExecutionLedger?.units.find((unit) => unit.unitId === "logic")
        ?.trustStatus,
    ).toBe("trusted");
    expect(
      result.pipelineExecutionLedger?.units.find((unit) => unit.unitId === "logic"),
    ).not.toHaveProperty("trustReason");
    expect(
      (result.resultClassificationSummary as { material_issues?: unknown } | undefined)
        ?.material_issues,
    ).toBeUndefined();
    expect(
      (
        result.llmPresentation?.finalResult?.input as
          | {
              result_classification_summary?: {
                material_issues?: unknown;
                material_issue_signals?: unknown;
              };
              review_result?: unknown;
              review_result_summary?: unknown;
            }
          | undefined
      )?.result_classification_summary?.material_issues,
    ).toBeUndefined();
    expect(
      (
        result.llmPresentation?.finalResult?.input as
          | {
              result_classification_summary?: {
                material_issue_signals?: unknown;
              };
              review_result?: unknown;
              review_result_summary?: unknown;
            }
          | undefined
      )?.result_classification_summary?.material_issue_signals,
    ).toEqual(expect.any(Array));
    expect(
      (result.llmPresentation?.finalResult?.input as { review_result?: unknown })
        ?.review_result,
    ).toBeUndefined();
    expect(
      (
        result.llmPresentation?.finalResult?.input as {
          review_result_summary?: unknown;
        }
      )?.review_result_summary,
    ).toEqual(expect.any(Object));
    expect(
      (
        result.llmPresentation?.openingBrief?.input as
          | {
              execution_plan?: {
                lens_ids?: { items?: unknown[]; total_count?: number };
              };
            }
          | undefined
      )?.execution_plan?.lens_ids,
    ).toMatchObject({
      items: ["logic"],
      total_count: 1,
    });

    const status = await api.getReviewStatus(result.sessionRoot);
    expect(status.pipelineExecutionLedger?.sessionId).toBe(result.sessionId);
    expect(
      status.pipelineExecutionLedger?.units.find((unit) => unit.unitId === "synthesize")
        ?.status,
    ).toBe("completed");
    expect(status.continuationPlan?.eligible).toBe(false);
    expect(status.continuationPlan?.ineligibleReason).toBe(
      "No untrusted continuation frontier remains.",
    );
  });

  it("rejects retired domain aliases before dispatch", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    await expect(
      api.prepareReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API domain alias test",
        domain: "software-development",
        reviewMode: "core-axis",
        lensIds: ["logic"],
        executorRealization: "mock",
      }),
    ).rejects.toMatchObject({
      name: "ReviewDomainResolutionError",
    });
  });

  it("rejects unknown domains with suggestion or unknown runtime resolution", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    await expect(
      api.prepareReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API domain suggestion test",
        domain: "software",
        reviewMode: "core-axis",
        lensIds: ["logic"],
        executorRealization: "mock",
      }),
    ).rejects.toMatchObject({
      domainResolution: {
        requestedToken: "software",
        resolution: "suggestion",
        suggestionIds: expect.arrayContaining(["software-engineering"]),
      },
    });

    await expect(
      api.prepareReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API unknown domain test",
        domain: "zzzzzz",
        reviewMode: "core-axis",
        lensIds: ["logic"],
        executorRealization: "mock",
      }),
    ).rejects.toMatchObject({
      domainResolution: {
        requestedToken: "zzzzzz",
        resolution: "unknown",
        suggestionIds: [],
      },
    });
  });

  it("returns a running handle, supports latest-session recovery, and blocks duplicate continuation while active", async () => {
    const projectRoot = await tempProjectRoot();
    const previousDelay = process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
    process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = "120";
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    try {
      const running = await api.runReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API early running handle test",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
        executorRealization: "mock",
        returnRunningAfterMs: 0,
      });

      expect(running.status).toBe("running");
      expect(running.runHandle?.sessionRoot).toBe(running.sessionRoot);
      expect(running.runHandle?.requestHash).toEqual(expect.any(String));
      expect(running.runControl?.lifecycleState).toBe("active");
      expect(running.runControl?.alreadyRunning).toBe(true);
      const requestHash = running.runHandle?.requestHash;
      if (!requestHash) {
        throw new Error("running handle requestHash missing");
      }
      const runningProgressInput = running.llmPresentation?.progress?.input as
        | {
            result_classification_summary?: {
              material_issues?: unknown;
              material_issue_signals?: unknown;
            };
          }
        | undefined;
      expect(
        runningProgressInput?.result_classification_summary?.material_issues,
      ).toBeUndefined();
      expect(
        runningProgressInput?.result_classification_summary?.material_issue_signals,
      ).toEqual(expect.any(Array));

      const activeStatus = await api.getReviewStatus(running.sessionRoot);
      expect(activeStatus.status).toBe("running");
      expect(activeStatus.runControl?.alreadyRunning).toBe(true);
      expect(activeStatus.runControl?.activeAttempt?.attemptKind).toBe(
        "initial_review",
      );

      const latestMatches = await api.findLatestReviewSessions({
        projectRoot,
        target: "target.txt",
        domain: "none",
        requestHash,
      });
      expect(latestMatches[0]?.sessionRoot).toBe(running.sessionRoot);

      const duplicateContinue = await api.continueReview({
        projectRoot,
        sessionRoot: running.sessionRoot,
        executorRealization: "mock",
      });
      expect(duplicateContinue.decision).toBe("already_running");
      expect(duplicateContinue.activeAttempt?.attemptId).toBe(
        running.runControl?.activeAttempt?.attemptId,
      );
      expect(
        (
          duplicateContinue.resultClassificationSummary as
            | { material_issues?: unknown; material_issue_signals?: unknown }
            | undefined
        )?.material_issues,
      ).toBeUndefined();
      expect(
        (
          duplicateContinue.resultClassificationSummary as
            | { material_issues?: unknown; material_issue_signals?: unknown }
            | undefined
        )?.material_issue_signals,
      ).toEqual(expect.any(Array));
      expect(
        (
          duplicateContinue.llmPresentation?.progress?.input as
            | {
                result_classification_summary?: {
                  material_issues?: unknown;
                  material_issue_signals?: unknown;
                };
              }
            | undefined
        )?.result_classification_summary?.material_issues,
      ).toBeUndefined();

      const completedStatus = await waitForReviewStatus(
        api,
        running.sessionRoot,
        "completed",
      );
      expect(completedStatus.runControl?.alreadyRunning).toBe(false);
      expect(completedStatus.runControl?.activeAttempt?.status).toBe("completed");
    } finally {
      if (previousDelay === undefined) {
        delete process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
      } else {
        process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = previousDelay;
      }
    }
  });

  it("records cancellation requests and closes the running review as halted_partial", async () => {
    const projectRoot = await tempProjectRoot();
    const previousDelay = process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
    process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = "500";
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    try {
      const running = await api.runReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API cancellation request test",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
        executorRealization: "mock",
        returnRunningAfterMs: 0,
      });
      expect(running.status).toBe("running");

      const cancelled = await api.cancelReview({
        projectRoot,
        sessionRoot: running.sessionRoot,
        reason: "core api cancellation fixture",
      });
      expect(cancelled.decision).toBe("requested");
      expect(cancelled.cancelRequestPath).toEqual(expect.any(String));
      await expect(fs.stat(cancelled.cancelRequestPath)).resolves.toMatchObject({
        size: expect.any(Number),
      });

      const haltedStatus = await waitForReviewStatus(
        api,
        running.sessionRoot,
        "halted_partial",
      );
      expect(haltedStatus.runControl?.alreadyRunning).toBe(false);
      const executionResult = await readYamlDocument<{
        execution_status?: string;
        halt_phase?: string;
        halt_reason?: string;
      }>(path.join(running.sessionRoot, "execution-result.yaml"));
      expect(executionResult.execution_status).toBe("halted_partial");
      expect(executionResult.halt_phase).toBe("cancellation");
      expect(executionResult.halt_reason).toContain("core api cancellation fixture");
    } finally {
      if (previousDelay === undefined) {
        delete process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
      } else {
        process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = previousDelay;
      }
    }
  });

  it("does not write cancellation requests for prepared sessions", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API prepared cancellation guard",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });

    const cancelled = await api.cancelReview({
      projectRoot,
      sessionRoot: prepared.sessionRoot,
      reason: "should not write",
    });

    expect(cancelled.decision).toBe("not_cancellable");
    expect(cancelled.status).toBe("prepared");
    await expect(fs.stat(cancelled.cancelRequestPath)).rejects.toThrow();
  });

  it("surfaces failed active attempts when no stronger terminal artifact exists", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API failed active attempt status",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });
    const now = new Date().toISOString();
    await writeYamlDocument(path.join(prepared.sessionRoot, "active-review-attempt.yaml"), {
      schema_version: "1",
      attempt_id: "failed-fixture",
      attempt_kind: "initial_review",
      session_id: prepared.sessionId,
      session_root: prepared.sessionRoot,
      project_root: projectRoot,
      created_at: now,
      updated_at: now,
      status: "failed",
      active_units: ["lens:logic"],
      requested_frontier_units: [],
      run_control: {
        stale_after_seconds: 1200,
        source_tool: "onto.review",
        request_hash: null,
      },
      latest_observed_artifact_ref: null,
      error_message: "background fixture failure",
    });

    const status = await api.getReviewStatus(prepared.sessionRoot);
    expect(status.status).toBe("failed");
    expect(status.runControl?.lifecycleState).toBe("failed_attempt");
    expect(status.runControl?.retryAvailable).toBe(true);
  });

  it("derives live lens unit progress from runtime logs and output files", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API runtime unit progress projection test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic", "structure", "dependency", "semantics"],
      executorRealization: "mock",
    });
    const executionPlan =
      await readYamlDocument<ReviewExecutionPlan>(
        path.join(prepared.sessionRoot, "execution-plan.yaml"),
      );
    const logicSeat = executionPlan.lens_execution_seats.find(
      (seat) => seat.lens_id === "logic",
    );
    const structureSeat = executionPlan.lens_execution_seats.find(
      (seat) => seat.lens_id === "structure",
    );
    const semanticsSeat = executionPlan.lens_execution_seats.find(
      (seat) => seat.lens_id === "semantics",
    );
    const logicPacket = executionPlan.lens_prompt_packet_seats.find(
      (seat) => seat.lens_id === "logic",
    );
    const structurePacket = executionPlan.lens_prompt_packet_seats.find(
      (seat) => seat.lens_id === "structure",
    );
    const semanticsPacket = executionPlan.lens_prompt_packet_seats.find(
      (seat) => seat.lens_id === "semantics",
    );
    if (
      !logicSeat ||
      !structureSeat ||
      !semanticsSeat ||
      !logicPacket ||
      !structurePacket ||
      !semanticsPacket
    ) {
      throw new Error("expected fixture lens seats");
    }
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner dispatch started: logic",
      [
        "unit_id: logic",
        "unit_kind: lens",
        `packet_path: ${logicPacket.packet_path}`,
        `output_path: ${logicSeat.output_path}`,
      ].join("\n"),
    );
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner dispatch retry: logic",
      [
        "attempt: 1/2",
        "retry_delay_ms: 10",
        "error: fixture retry",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(path.dirname(logicSeat.output_path), ".logic.running.log"),
      "logic still running\n",
      "utf8",
    );
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner dispatch started: structure",
      [
        "unit_id: structure",
        "unit_kind: lens",
        `packet_path: ${structurePacket.packet_path}`,
        `output_path: ${structureSeat.output_path}`,
      ].join("\n"),
    );
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner dispatch completed: structure",
      [
        "unit_id: structure",
        "unit_kind: lens",
        `output_path: ${structureSeat.output_path}`,
      ].join("\n"),
    );
    await fs.writeFile(
      structureSeat.output_path,
      "# structure result\n",
      "utf8",
    );
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "lens failure: semantics",
      [
        "unit_id: semantics",
        "unit_kind: lens",
        `packet_path: ${semanticsPacket.packet_path}`,
        `output_path: ${semanticsSeat.output_path}`,
        "message: fixture failure",
      ].join("\n"),
    );

    const status = await api.getReviewStatus(prepared.sessionRoot);
    const logic = status.unitProgress?.find((unit) => unit.unitId === "logic");
    const structure = status.unitProgress?.find(
      (unit) => unit.unitId === "structure",
    );
    const dependency = status.unitProgress?.find(
      (unit) => unit.unitId === "dependency",
    );
    const semantics = status.unitProgress?.find(
      (unit) => unit.unitId === "semantics",
    );
    expect(status.status).toBe("running");
    expect(logic).toMatchObject({
      publicAlias: "lens:logic",
      status: "retrying",
      attemptCount: 2,
      runningLogRef: path.join(
        path.dirname(logicSeat.output_path),
        ".logic.running.log",
      ),
    });
    expect(structure).toMatchObject({
      publicAlias: "lens:structure",
      status: "completed",
    });
    expect(dependency).toMatchObject({
      publicAlias: "lens:dependency",
      status: "pending",
    });
    expect(semantics).toMatchObject({
      publicAlias: "lens:semantics",
      status: "failed",
      failureMessage: "fixture failure",
    });
    const progressInput = status.llmPresentation?.progress?.input as
      | { progress?: { active_units?: string[]; unit_progress?: Array<{ unitId: string; status: string }> } }
      | undefined;
    expect(progressInput?.progress?.active_units).toEqual(["lens:logic"]);
    expect(
      progressInput?.progress?.unit_progress?.find((unit) => unit.unitId === "logic")
        ?.status,
    ).toBe("retrying");
  });

  it("exposes bounded result projections, material support, and isolated environment warnings", async () => {
    const projectRoot = await tempProjectRoot();
    const previousWarning = process.env.ONTO_REVIEW_MOCK_ENV_WARNING;
    const previousDelay = process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
    process.env.ONTO_REVIEW_MOCK_ENV_WARNING =
      "mock non-fatal worker environment warning";
    process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = "120";
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    try {
      const result = await api.runReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API bounded result projection test",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
        executorRealization: "mock",
        returnRunningAfterMs: 0,
      });
      console.warn("unrelated process warning outside review runner prefix");
      const status = await waitForReviewStatus(api, result.sessionRoot, "completed");
      expect(status.targetMaterialSupport).toMatchObject({
        targetMaterialKind: "document",
        supportStatus: "partial",
      });
      expect(status.environmentWarnings?.[0]).toMatchObject({
        fatality: "non_fatal",
        affectedCapability: "review_execution_observability",
      });
      expect(status.environmentWarnings?.map((warning) => warning.message))
        .not.toContain("unrelated process warning outside review runner prefix");

      const longIssueText = `long-signal ${"detail ".repeat(120)}`.trim();
      const longIssueId = `issue-${"id".repeat(100)}`;
      await writeYamlDocument(path.join(result.sessionRoot, "issue-ledger.yaml"), {
        schema_version: 1,
        session_id: result.sessionId,
        issues: [
          {
            issue_id: longIssueId,
            severity: "high",
            issue_statement: longIssueText,
            affected_purpose: "bounded projection regression test",
            failure_condition: longIssueText,
            impact: longIssueText,
            evidence_refs: ["round1/logic.md#finding-1"],
            raised_by_lens_ids: ["logic"],
          },
        ],
      });
      await writeYamlDocument(path.join(result.sessionRoot, "problem-framing.yaml"), {
        schema_version: 1,
        session_id: result.sessionId,
        classifications: [
          {
            issue_id: longIssueId,
            problem_definition: longIssueText,
            rationale: longIssueText,
          },
        ],
      });

      const readFileSpy = vi.spyOn(fs, "readFile");
      let compact: Awaited<ReturnType<typeof api.getReviewResult>> | null = null;
      let finalOutputRead = false;
      try {
        const defaultResult = await api.getReviewResult(result.sessionRoot);
        expect(defaultResult.projectionLevel).toBe("standard");
        expect(defaultResult.reviewRecord).toBeUndefined();
        expect(defaultResult.finalOutputText).toBeUndefined();
        expect(
          (
            defaultResult.resultClassificationSummary as
              | { material_issues?: unknown; material_issue_signals?: unknown }
              | undefined
          )?.material_issues,
        ).toBeUndefined();
        expect(
          (
            defaultResult.resultClassificationSummary as
              | { material_issues?: unknown; material_issue_signals?: unknown }
              | undefined
          )?.material_issue_signals,
        ).toEqual(expect.any(Array));
        compact = await api.getReviewResult(result.sessionRoot, {
          projectionLevel: "compact",
        });
        finalOutputRead = readFileSpy.mock.calls.some(([file]) => {
          if (typeof file !== "string") return false;
          return path.resolve(file) === path.resolve(result.finalOutputPath);
        });
      } finally {
        readFileSpy.mockRestore();
      }
      expect(compact).not.toBeNull();
      if (compact === null) throw new Error("compact review result missing");
      expect(compact.projectionLevel).toBe("compact");
      expect(compact.reviewRecord).toBeUndefined();
      expect(compact.finalOutputText).toBeUndefined();
      expect(compact.pipelineExecutionLedger).toBeUndefined();
      expect(finalOutputRead).toBe(false);
      const finalResultInput = compact.llmPresentation?.finalResult?.input as
        | {
            result_classification_summary?: {
              material_issues?: unknown;
              material_issue_signals?: unknown;
            };
          }
        | undefined;
      expect(
        finalResultInput?.result_classification_summary?.material_issues,
      ).toBeUndefined();
      expect(
        finalResultInput?.result_classification_summary?.material_issue_signals,
      ).toEqual(expect.any(Array));
      const progressInput = compact.llmPresentation?.progress?.input as
        | {
            result_classification_summary?: {
              non_material_findings?: unknown;
              non_material_finding_signals?: unknown;
            };
          }
        | undefined;
      expect(
        progressInput?.result_classification_summary?.non_material_findings,
      ).toBeUndefined();
      expect(
        progressInput?.result_classification_summary?.non_material_finding_signals,
      ).toEqual(expect.any(Array));
      const compactSummary = compact.resultClassificationSummary as
        | {
            material_issues?: unknown;
            material_issue_signals?: unknown;
          }
        | undefined;
      expect(compactSummary?.material_issues).toBeUndefined();
      expect(compactSummary?.material_issue_signals).toEqual(expect.any(Array));
      expect(compact.targetMaterialSupport?.supportStatus).toBe("partial");

      const standardReadSpy = vi.spyOn(fs, "readFile");
      let standardFinalOutputRead = false;
      let standard: Awaited<ReturnType<typeof api.getReviewResult>> | null = null;
      try {
        standard = await api.getReviewResult(result.sessionRoot, {
          projectionLevel: "standard",
        });
        standardFinalOutputRead = standardReadSpy.mock.calls.some(([file]) => {
          if (typeof file !== "string") return false;
          return path.resolve(file) === path.resolve(result.finalOutputPath);
        });
      } finally {
        standardReadSpy.mockRestore();
      }
      expect(standard).not.toBeNull();
      if (standard === null) throw new Error("standard review result missing");
      expect(standard.projectionLevel).toBe("standard");
      expect(standard.reviewRecord).toBeUndefined();
      expect(standard.finalOutputText).toBeUndefined();
      expect(standard.reviewRecordSummary.requestText.length).toBeLessThanOrEqual(
        360,
      );
      expect(standard.pipelineExecutionLedger?.units[0]).not.toHaveProperty(
        "trustReason",
      );
      expect(standardFinalOutputRead).toBe(false);
      const standardSummary = standard.resultClassificationSummary as
        | {
            material_issues?: unknown;
            material_issue_signals?: unknown;
          }
        | undefined;
      expect(standardSummary?.material_issues).toBeUndefined();
      expect(standardSummary?.material_issue_signals).toEqual(expect.any(Array));
      const [standardMaterialSignal] =
        (standardSummary?.material_issue_signals as
          | Array<{ issue_id?: string; signal?: string }>
          | undefined) ??
        [];
      expect(standardMaterialSignal?.issue_id?.length).toBeLessThanOrEqual(120);
      expect(standardMaterialSignal?.signal?.length).toBeLessThanOrEqual(360);
      const standardFinalResultInput = standard.llmPresentation?.finalResult?.input as
        | {
            explanation?: {
              final_review_result?: string;
            };
            result_classification_summary?: {
              material_issues?: unknown;
              material_issue_signals?: unknown;
            };
          }
        | undefined;
      expect(
        standardFinalResultInput?.result_classification_summary?.material_issues,
      ).toBeUndefined();
      expect(
        standardFinalResultInput?.result_classification_summary
          ?.material_issue_signals,
      ).toEqual(expect.any(Array));
      expect(
        standardFinalResultInput?.explanation?.final_review_result?.length,
      ).toBeLessThanOrEqual(360);
      const standardProgressInput = standard.llmPresentation?.progress?.input as
        | {
            result_classification_summary?: {
              material_issues?: unknown;
              material_issue_signals?: unknown;
            };
          }
        | undefined;
      expect(
        standardProgressInput?.result_classification_summary?.material_issues,
      ).toBeUndefined();
      expect(
        standardProgressInput?.result_classification_summary
          ?.material_issue_signals,
      ).toEqual(expect.any(Array));

      const full = await api.getReviewResult(result.sessionRoot, {
        projectionLevel: "full",
      });
      expect(full.reviewRecord?.session_id).toBe(result.sessionId);
      expect(full.finalOutputText).toEqual(expect.any(String));
      expect(full.resultClassificationSummary?.material_issues).toEqual(
        expect.any(Array),
      );
      expect(
        full.resultClassificationSummary?.material_issues[0]?.problem_definition,
      ).toBe(longIssueText);
      const fullFinalResultInput = full.llmPresentation?.finalResult?.input as
        | {
            review_record?: unknown;
            result_classification_summary?: {
              material_issues?: unknown;
            };
          }
        | undefined;
      expect(fullFinalResultInput?.review_record).toEqual(
        expect.objectContaining({ session_id: result.sessionId }),
      );
      expect(
        fullFinalResultInput?.result_classification_summary?.material_issues,
      ).toEqual(expect.any(Array));
    } finally {
      if (previousWarning === undefined) {
        delete process.env.ONTO_REVIEW_MOCK_ENV_WARNING;
      } else {
        process.env.ONTO_REVIEW_MOCK_ENV_WARNING = previousWarning;
      }
      if (previousDelay === undefined) {
        delete process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
      } else {
        process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = previousDelay;
      }
    }
  });

  it("blocks review result final_output_ref disclosure outside the session", async () => {
    const projectRoot = await tempProjectRoot();
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-core-api-review-result-escape-"),
    );
    tempRoots.push(externalRoot);
    const externalOutput = path.join(externalRoot, "secret-output.md");
    await fs.writeFile(externalOutput, "must not be disclosed\n", "utf8");
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API final output boundary test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });
    const reviewRecordPath = path.join(result.sessionRoot, "review-record.yaml");
    const reviewRecord = await readYamlDocument<Record<string, unknown>>(
      reviewRecordPath,
    );
    reviewRecord.final_output_ref = externalOutput;
    await writeYamlDocument(reviewRecordPath, reviewRecord);

    await expect(
      api.getReviewResult(result.sessionRoot, { projectionLevel: "full" }),
    ).rejects.toThrow(/final_output_ref.*escapes allowed root/);
  });

  it("uses full request identity for latest-session requestHash recovery", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const shared = {
      projectRoot,
      target: "target.txt",
      intent: "Core API request identity test",
      noDomain: true,
      reviewMode: "core-axis" as const,
      executorRealization: "mock" as const,
    };
    const logic = await api.runReview({ ...shared, lensIds: ["logic"] });
    const structure = await api.runReview({ ...shared, lensIds: ["structure"] });

    expect(logic.runHandle?.requestHash).toEqual(expect.any(String));
    expect(structure.runHandle?.requestHash).toEqual(expect.any(String));
    expect(logic.runHandle?.requestHash).not.toBe(structure.runHandle?.requestHash);

    const logicMatches = await api.findLatestReviewSessions({
      projectRoot,
      target: "target.txt",
      domain: "none",
      requestHash: logic.runHandle?.requestHash,
    });
    expect(logicMatches[0]?.sessionRoot).toBe(logic.sessionRoot);
    expect(logicMatches.map((match) => match.sessionRoot)).not.toContain(
      structure.sessionRoot,
    );
  });

  it("exposes supported material status for code targets", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const result = await api.runReview({
      projectRoot,
      target: "target.ts",
      intent: "Core API supported code material fixture",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });
    const status = await api.getReviewStatus(result.sessionRoot);
    expect(status.targetMaterialSupport).toMatchObject({
      targetMaterialKind: "code",
      supportStatus: "supported",
      unsupportedReason: null,
    });
  });

  it("continues a prepared review session from the ledger frontier", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API continuation from prepared session",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });

    const preparedStatus = await api.getReviewStatus(prepared.sessionRoot);
    expect(preparedStatus.status).toBe("prepared");
    expect(preparedStatus.continuationPlan?.eligible).toBe(true);
    expect(
      preparedStatus.continuationPlan?.frontierUnits.map((unit) => unit.unitId),
    ).toEqual(["logic"]);

    const continued = await api.continueReview({
      projectRoot,
      sessionRoot: prepared.sessionRoot,
      executorRealization: "mock",
    });

    expect(continued.status).toBe("completed");
    expect(continued.promptExecutionResult.synthesis_executed).toBe(true);
    expect(continued.continuationPlan.frontierUnits.map((unit) => unit.unitId))
      .toEqual(["logic"]);
    expect(
      (continued.continuationPlan as { unitLedger?: unknown }).unitLedger,
    ).toBeUndefined();
    expect(continued.pipelineExecutionLedger?.units.find(
      (unit) => unit.unitId === "synthesize",
    )?.trustStatus).toBe("trusted");
    expect(
      continued.pipelineExecutionLedger?.units.find(
        (unit) => unit.unitId === "synthesize",
      ),
    ).not.toHaveProperty("trustReason");
    const continuedSummary = continued.resultClassificationSummary as
      | {
          material_issues?: unknown;
          non_material_findings?: unknown;
          action_candidates?: unknown;
          material_issue_signals?: Array<{ issue_id?: string; signal?: string }>;
        }
      | undefined;
    expect(continuedSummary?.material_issues).toBeUndefined();
    expect(continuedSummary?.non_material_findings).toBeUndefined();
    expect(continuedSummary?.action_candidates).toBeUndefined();
    expect(continuedSummary?.material_issue_signals).toEqual(expect.any(Array));
    expect(
      continuedSummary?.material_issue_signals?.every(
        (signal) =>
          (signal.issue_id?.length ?? 0) <= 120 &&
          (signal.signal?.length ?? 0) <= 360,
      ),
    ).toBe(true);
    const continuedProgressInput = continued.llmPresentation?.progress?.input as
      | {
          result_classification_summary?: {
            material_issues?: unknown;
            material_issue_signals?: unknown;
          };
        }
      | undefined;
    expect(
      continuedProgressInput?.result_classification_summary?.material_issues,
    ).toBeUndefined();
    expect(
      continuedProgressInput?.result_classification_summary?.material_issue_signals,
    ).toEqual(expect.any(Array));
    await expect(
      fs.stat(continued.continuationAttempt.continuationPlanPath),
    ).resolves.toMatchObject({ size: expect.any(Number) });
    await expect(
      fs.stat(continued.continuationAttempt.attemptManifestPath),
    ).resolves.toMatchObject({ size: expect.any(Number) });
  });

  it("rejects continuation when manifest reconstructs unsupported direct-call OAuth", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API invalid continuation route test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });
    await writeYamlDocument(path.join(prepared.sessionRoot, "review-run-manifest.yaml"), {
      session_id: prepared.sessionId,
      review_execution_profile: {
        mode: "main-workers",
        teamlead: { seat: "main" },
        lens: { seat: "worker" },
        synthesize: { seat: "worker" },
        deliberation: "controlled-lens-deliberation",
        runtime_route: {
          execution_realization: "direct-call",
          host_runtime: "openai",
          worker_executor: "direct_call",
          runtime_provider: "openai",
          auth_mode: "oauth",
        },
        trace: [],
      },
      worker_units: [],
    });

    await expect(
      api.continueReview({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
      }),
    ).rejects.toThrow("Review direct-call route requires API-key/local auth");
  });

  it("rejects continuation when actor-specific direct-call route resolves to OAuth", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API invalid continuation actor route test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });
    const oauthActor = {
      seat: "worker",
      llm: {
        auth: "oauth",
        provider: "openai",
        model: "gpt-5.5",
      },
    };
    await writeYamlDocument(path.join(prepared.sessionRoot, "review-run-manifest.yaml"), {
      session_id: prepared.sessionId,
      review_execution_profile: {
        mode: "main-workers",
        teamlead: { ...oauthActor, seat: "main" },
        lens: oauthActor,
        synthesize: oauthActor,
        deliberation: "controlled-lens-deliberation",
        runtime_route: {
          execution_realization: "direct-call",
          host_runtime: "openai",
          worker_executor: "direct_call",
          runtime_provider: "openai",
          auth_mode: "api_key",
        },
        trace: [],
      },
      worker_units: [],
    });

    await expect(
      api.continueReview({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
      }),
    ).rejects.toThrow("Review direct-call route cannot dispatch");
  });

  it("blocks continuation when manifest route conflicts with actual worker runtime", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API continuation route visibility conflict test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });
    await writeYamlDocument(path.join(prepared.sessionRoot, "review-run-manifest.yaml"), {
      session_id: prepared.sessionId,
      artifact_refs: {
        execution_plan: path.join(prepared.sessionRoot, "execution-plan.yaml"),
        actor_invocation_profiles: path.join(
          prepared.sessionRoot,
          "execution-preparation",
          "actor-invocation-profiles.yaml",
        ),
      },
      review_execution_profile: {
        mode: "main-workers",
        teamlead: {
          seat: "main",
          llm: {
            auth: "api_key",
            provider: "openai",
            model: "gpt-5.5",
          },
        },
        lens: {
          seat: "worker",
          llm: {
            auth: "api_key",
            provider: "openai",
            model: "gpt-5.5",
          },
        },
        synthesize: {
          seat: "worker",
          llm: {
            auth: "api_key",
            provider: "openai",
            model: "gpt-5.5",
          },
        },
        deliberation: "controlled-lens-deliberation",
        runtime_route: {
          execution_realization: "direct-call",
          host_runtime: "openai",
          worker_executor: "direct_call",
          runtime_provider: "openai",
          auth_mode: "api_key",
        },
        trace: [],
      },
      worker_units: [
        {
          unit_id: "logic",
          executor_host_runtime: "anthropic",
        },
      ],
    });

    await expect(
      api.continueReview({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
      }),
    ).rejects.toThrow(
      "Review continuation cannot dispatch because the prior review run route conflicts with actual worker runtime evidence.",
    );
    const failureFiles = await fs.readdir(
      path.join(prepared.sessionRoot, "failures"),
    );
    const failure = await readYamlDocument<Record<string, unknown>>(
      path.join(prepared.sessionRoot, "failures", failureFiles[0]!),
    );
    expect(failure).toMatchObject({
      reason_code: "continuation_route_visibility_conflict",
      mcp_error_code: "ONTO_REVIEW_ACTOR_ROUTE_UNAVAILABLE",
      details_kind: "actor_route",
      dispatch_state: "dispatch_blocked",
    });
    expect(failure.details).toMatchObject({
      route_consistency: "profile_actual_conflict",
      actual_host_runtimes: ["anthropic"],
    });
  });

  it("preserves actor credential_ref custom env during continuation reconstruction", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const savedMock = process.env.ONTO_LLM_MOCK;
    const savedOpenAi = process.env.OPENAI_API_KEY;
    const savedCustom = process.env.CUSTOM_OPENAI_API_KEY;
    process.env.ONTO_LLM_MOCK = "1";
    delete process.env.OPENAI_API_KEY;
    process.env.CUSTOM_OPENAI_API_KEY = "custom-test-key";
    try {
      const prepared = await api.prepareReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API custom credential continuation route test",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
        executorRealization: "mock",
      });
      const actorProfilesPath = path.join(
        prepared.sessionRoot,
        "execution-preparation",
        "actor-invocation-profiles.yaml",
      );
      const actorProfile = (
        actorKind: "teamlead" | "lens" | "synthesize",
        seat: "main" | "worker",
      ) => ({
        actor_profile_id: `actor:${actorKind}`,
        actor_kind: actorKind,
        seat,
        execution_realization: "direct-call",
        host_runtime: "openai",
        runtime_provider: "openai",
        auth_mode: "api_key",
        model: "mock-model",
        effort: null,
        service_tier: null,
        base_url: null,
        effective_worker_executor: "direct_call",
        credential_ref: "env:CUSTOM_OPENAI_API_KEY",
        credential_serialization_policy: "ref_only_no_secret",
        route_unavailable_policy: "fail_before_dispatch",
        capability_requirements: ["review_unit_execution", "artifact_write"],
        source_settings_refs: [],
      });
      await writeYamlDocument(actorProfilesPath, {
        schema_version: "1",
        session_id: prepared.sessionId,
        created_at: new Date().toISOString(),
        profiles: [
          actorProfile("teamlead", "main"),
          actorProfile("lens", "worker"),
          actorProfile("synthesize", "worker"),
        ],
      } satisfies ReviewActorInvocationProfilesArtifact);

      let errorMessage = "";
      try {
        await api.continueReview({
          projectRoot,
          sessionRoot: prepared.sessionRoot,
          executorRealization: "ts_inline_http",
        });
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorMessage).not.toContain("credential environment variable is missing");
      expect(errorMessage).not.toContain("direct_call_actor_credential_missing");
    } finally {
      if (savedMock === undefined) delete process.env.ONTO_LLM_MOCK;
      else process.env.ONTO_LLM_MOCK = savedMock;
      if (savedOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedOpenAi;
      if (savedCustom === undefined) delete process.env.CUSTOM_OPENAI_API_KEY;
      else process.env.CUSTOM_OPENAI_API_KEY = savedCustom;
    }
  });

  it("rejects targetUnits that try to continue after the current frontier", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API continuation target unit guard",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });

    await expect(
      api.continueReview({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
        targetUnits: ["synthesize"],
        executorRealization: "mock",
      }),
    ).rejects.toThrow(/current continuation frontier|not eligible/);
  });

  it("blocks execution-plan paths that escape the session boundary", async () => {
    const projectRoot = await tempProjectRoot();
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-core-api-review-external-"),
    );
    tempRoots.push(externalRoot);
    const externalOutput = path.join(externalRoot, "external-lens.md");
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API continuation path boundary guard",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });
    const executionPlanPath = path.join(prepared.sessionRoot, "execution-plan.yaml");
    const executionPlan =
      await readYamlDocument<ReviewExecutionPlan>(executionPlanPath);
    executionPlan.lens_execution_seats[0] = {
      ...executionPlan.lens_execution_seats[0],
      output_path: externalOutput,
    };
    executionPlan.lens_prompt_packet_seats[0] = {
      ...executionPlan.lens_prompt_packet_seats[0],
      output_path: externalOutput,
    };
    await writeYamlDocument(executionPlanPath, executionPlan);

    await expect(
      api.continueReview({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
        executorRealization: "mock",
      }),
    ).rejects.toThrow(/escapes the session root/);
    await expect(fs.stat(externalOutput)).rejects.toThrow();
  });

  it("keeps centralized execution-plan boundary coverage aligned with current path refs", async () => {
    const projectRoot = await tempProjectRoot();
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-core-api-review-plan-refs-"),
    );
    tempRoots.push(externalRoot);
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API execution-plan path-ref coverage guard",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });
    const executionPlan =
      await readYamlDocument<ReviewExecutionPlan>(
        path.join(prepared.sessionRoot, "execution-plan.yaml"),
      );
    const pathRefs = collectExecutionPlanPathRefs(executionPlan);
    const labels = pathRefs.map((ref) => ref.label);

    expect(pathRefs.length).toBeGreaterThanOrEqual(35);
    expect(labels).toContain("session_root");
    expect(labels).toContain("final_output_path");
    expect(labels).toContain("lens_prompt_packet_seats.0.output_path");

    for (const [index, ref] of pathRefs.entries()) {
      const mutatedPlan = cloneReviewExecutionPlan(executionPlan);
      const externalRef = path.join(
        externalRoot,
        `${index}-${ref.label.replace(/[^A-Za-z0-9_.-]/g, "_")}`,
      );
      setNestedExecutionPlanRef(mutatedPlan, ref.segments, externalRef);

      await expect(
        assertReviewExecutionPlanSessionBoundary({
          sessionRoot: prepared.sessionRoot,
          executionPlan: mutatedPlan,
        }),
        ref.label,
      ).rejects.toThrow(/session root|mismatch/);
    }
  });

  it("blocks direct prompt runner execution-plan paths before clearing outputs", async () => {
    const projectRoot = await tempProjectRoot();
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-core-api-review-direct-runner-external-"),
    );
    tempRoots.push(externalRoot);
    const externalOutput = path.join(externalRoot, "must-stay.txt");
    await fs.writeFile(externalOutput, "preserve me\n", "utf8");
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Direct runner path boundary guard",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });
    const executionPlanPath = path.join(prepared.sessionRoot, "execution-plan.yaml");
    const executionPlan =
      await readYamlDocument<ReviewExecutionPlan>(executionPlanPath);
    executionPlan.final_output_path = externalOutput;
    await writeYamlDocument(executionPlanPath, executionPlan);

    await expect(
      executeReviewPromptExecution({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
        defaultExecutorConfig: { bin: "node", args: ["-e", ""] },
      }),
    ).rejects.toThrow(/escapes the session root/);
    await expect(fs.readFile(externalOutput, "utf8")).resolves.toBe("preserve me\n");
  });
});
