import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ReviewExecutionPlan } from "../core-runtime/review/artifact-types.js";
import {
  readYamlDocument,
  writeYamlDocument,
} from "../core-runtime/review/review-artifact-utils.js";
import { createOntoReviewCoreApi } from "./review-api.js";

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
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("createOntoReviewCoreApi", () => {
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
});
