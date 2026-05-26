import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
  });
});
