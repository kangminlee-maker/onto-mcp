import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const lockMock = vi.hoisted(() => ({ calls: 0 }));

vi.mock("proper-lockfile", () => ({
  default: {
    lock: vi.fn(async () => {
      lockMock.calls += 1;
      const call = lockMock.calls;
      return async () => {
        if (call === 1) throw new Error("injected lock release failure");
      };
    }),
  },
}));

import { initializeReconstructRunControl } from "./run-control-validation.js";

const tempRoots: string[] = [];

afterEach(async () => {
  lockMock.calls = 0;
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    ),
  );
});

function initArgs(root: string) {
  return {
    sessionId: path.basename(root),
    sessionRoot: root,
    projectRoot: root,
    targetRefs: [path.join(root, "target.csv")],
    intent: "lock release failure fixture",
    domain: null,
    profilesRoot: path.join(root, "profiles"),
    filesystemAllowedRoots: [root],
    semanticAuthorRealization: "mock" as const,
    confirmationProviderRealization: "mock" as const,
    runtimeVersion: "test-runtime",
    outputPath: path.join(root, "reconstruct-run-control.yaml"),
    validationOutputPath: path.join(
      root,
      "reconstruct-run-control-validation.yaml",
    ),
    bootstrapDiagnosticPath: path.join(
      root,
      "reconstruct-run-bootstrap-diagnostic.yaml",
    ),
  };
}

describe("run-control mutation queue", () => {
  it("releases the in-process queue when filesystem unlock fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-lock-release-"));
    tempRoots.push(root);

    await expect(initializeReconstructRunControl(initArgs(root))).rejects.toThrow(
      "injected lock release failure",
    );

    const outcome = await Promise.race([
      initializeReconstructRunControl(initArgs(root)).then(
        () => "unexpected fulfillment",
        (error: unknown) => error instanceof Error ? error.message : String(error),
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("queue timeout"), 500)
      ),
    ]);

    expect(outcome).toMatch(/already exists for the same request/);
    expect(lockMock.calls).toBe(2);
  });
});
