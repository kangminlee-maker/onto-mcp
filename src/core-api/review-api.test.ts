import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ReviewExecutionPlan } from "../core-runtime/review/artifact-types.js";
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
    expect(result.pipelineExecutionLedger?.pipeline).toBe("review");
    expect(
      result.pipelineExecutionLedger?.units.find((unit) => unit.unitId === "logic")
        ?.trustStatus,
    ).toBe("trusted");

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

  it("normalizes the software-development domain alias while preserving the requested token", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API domain alias test",
      domain: "software-development",
      reviewMode: "core-axis",
      lensIds: ["logic"],
      executorRealization: "mock",
    });
    const metadata = await readYamlDocument<{ requested_domain_token?: string }>(
      path.join(prepared.sessionRoot, "session-metadata.yaml"),
    );
    const binding = await readYamlDocument<{ resolved_session_domain?: string }>(
      path.join(prepared.sessionRoot, "binding.yaml"),
    );

    expect(metadata.requested_domain_token).toBe("software-development");
    expect(binding.resolved_session_domain).toBe("software-engineering");
    expect(prepared.llmPresentation.openingBrief?.input).toMatchObject({
      binding: {
        resolved_session_domain: "software-engineering",
      },
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

      const compact = await api.getReviewResult(result.sessionRoot, {
        projectionLevel: "compact",
      });
      expect(compact.projectionLevel).toBe("compact");
      expect(compact.reviewRecord).toBeUndefined();
      expect(compact.finalOutputText).toBeUndefined();
      expect(compact.resultClassificationSummary.material_issues).toEqual(
        expect.any(Array),
      );
      expect(compact.targetMaterialSupport?.supportStatus).toBe("partial");

      const full = await api.getReviewResult(result.sessionRoot, {
        projectionLevel: "full",
      });
      expect(full.reviewRecord?.session_id).toBe(result.sessionId);
      expect(full.finalOutputText).toEqual(expect.any(String));
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
    expect(continued.pipelineExecutionLedger?.units.find(
      (unit) => unit.unitId === "synthesize",
    )?.trustStatus).toBe("trusted");
    await expect(
      fs.stat(continued.continuationAttempt.continuationPlanPath),
    ).resolves.toMatchObject({ size: expect.any(Number) });
    await expect(
      fs.stat(continued.continuationAttempt.attemptManifestPath),
    ).resolves.toMatchObject({ size: expect.any(Number) });
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
