import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import lockfile from "proper-lockfile";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenAIResponsesIncompleteEvidence } from "../llm/openai-responses-incomplete-error.js";
import type {
  ReconstructRunControlArtifact,
  ReconstructRunControlValidationArtifact,
} from "./artifact-types.js";
import {
  ReconstructLlmDispatchFailureError,
  projectReconstructLlmDispatchFailureSummary,
  readReconstructLlmDispatchFailureArtifact,
  reconstructLlmDispatchFailurePath,
} from "./llm-dispatch-failure.js";
import {
  initializeReconstructRunControl,
  persistReconstructLlmDispatchFailure,
  reconcileReconstructLlmDispatchFailures,
  validateReconstructRunControl,
  type ReconstructLlmFailurePersistenceFaultPoint,
} from "./run-control-validation.js";

const tempRoots: string[] = [];

async function tempSessionRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-llm-failure-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
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
    intent: "reconstruct failure fixture",
    domain: null,
    profilesRoot: path.join(root, "profiles"),
    filesystemAllowedRoots: [root],
    semanticAuthorRealization: "direct_call",
    confirmationProviderRealization: "direct_call",
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

const incompleteEvidence: OpenAIResponsesIncompleteEvidence = {
  failure_code: "openai_responses_max_output_tokens",
  provider_status: "incomplete",
  incomplete_reason: "max_output_tokens",
  base_output_ceiling_tokens: 4_000,
  configured_output_headroom_tokens: 25_000,
  effective_max_output_tokens: 29_000,
  input_tokens: 1_200,
  cached_input_tokens: 200,
  output_tokens: 28_990,
  reasoning_tokens: 28_000,
  non_reasoning_output_tokens: 990,
  partial_output_chars: 321,
  partial_output_sha256: "a".repeat(64),
  provider_model: "gpt-5.5",
  provider_response_id: "resp_private",
  provider_request_id: "req_private",
  effective_base_url: "https://api.openai.com/v1",
  sdk_max_retries: 2,
  actual_adapter_request_count: null,
  request_count_observability: "unavailable",
};

function failureError(): ReconstructLlmDispatchFailureError {
  return new ReconstructLlmDispatchFailureError({
    unitId: "candidate_disposition",
    artifactName: "CandidateDisposition",
    callKind: "initial",
    evidence: incompleteEvidence,
    cause: new Error("provider incomplete"),
  });
}

async function initialize(root: string) {
  await fs.writeFile(path.join(root, "target.csv"), "id,name\n1,A\n", "utf8");
  return initializeReconstructRunControl(initArgs(root));
}

async function readRunControl(root: string): Promise<ReconstructRunControlArtifact> {
  return parseYaml(
    await fs.readFile(initArgs(root).outputPath, "utf8"),
  ) as ReconstructRunControlArtifact;
}

function changedTopLevelKeys(
  baseline: Record<string, unknown>,
  candidate: Record<string, unknown>,
): string[] {
  return [...new Set([...Object.keys(baseline), ...Object.keys(candidate)])]
    .filter((key) =>
      JSON.stringify(baseline[key]) !== JSON.stringify(candidate[key])
    )
    .sort();
}

async function persistWithFault(
  root: string,
  point: ReconstructLlmFailurePersistenceFaultPoint,
) {
  const initialized = await initialize(root);
  await expect(persistReconstructLlmDispatchFailure({
    runControlPath: initArgs(root).outputPath,
    validationOutputPath: initArgs(root).validationOutputPath,
    sessionId: path.basename(root),
    sessionRoot: root,
    attemptId: initialized.attemptId,
    error: failureError(),
    faultInjector: (current) => {
      if (current === point) throw new Error(`fault:${point}`);
    },
  })).rejects.toThrow(`fault:${point}`);
  return initialized;
}

describe("reconstruct LLM dispatch failure persistence", () => {
  it("commits an owner-linked sidecar and exposes only the bounded summary", async () => {
    const root = await tempSessionRoot();
    const initialized = await initialize(root);
    const persisted = await persistReconstructLlmDispatchFailure({
      runControlPath: initArgs(root).outputPath,
      validationOutputPath: initArgs(root).validationOutputPath,
      sessionId: path.basename(root),
      sessionRoot: root,
      attemptId: initialized.attemptId,
      error: failureError(),
    });

    expect(persisted.validation.validation_status).toBe("valid");
    expect(persisted.runControl.attempt_rows).toHaveLength(1);
    expect(persisted.runControl.attempt_rows[0]?.attempt_status).toBe("failed");
    expect(persisted.runControl.lock_rows[0]?.lock_status).toBe("released");
    expect(persisted.runControl.write_transactions).toHaveLength(1);
    expect(persisted.runControl.write_transactions[0]).toMatchObject({
      owner_attempt_id: initialized.attemptId,
      transaction_status: "committed",
      prepared_content_hash:
        persisted.runControl.write_transactions[0]?.committed_hash,
    });

    const artifact = await readReconstructLlmDispatchFailureArtifact(
      persisted.artifactRef,
    );
    const summary = projectReconstructLlmDispatchFailureSummary(
      artifact,
      persisted.artifactRef,
    );
    expect(summary.failure_code).toBe("openai_responses_max_output_tokens");
    expect(summary.output_tokens).toBe(28_990);
    expect(summary).not.toHaveProperty("provider_request_id");
    expect(summary).not.toHaveProperty("provider_response_id");
    expect(summary).not.toHaveProperty("effective_base_url");
    expect(summary).not.toHaveProperty("partial_output_sha256");

    const untrusted = validateReconstructRunControl({
      runControl: persisted.runControl,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
    });
    expect(untrusted.validation_status).toBe("invalid");
    expect(untrusted.violations.map((item) => item.code)).toContain(
      "failed_terminal_missing",
    );
  });

  it("coalesces a concurrent status reconciliation with the live publisher", async () => {
    const root = await tempSessionRoot();
    const initialized = await initialize(root);
    let reconciliationPromise: ReturnType<
      typeof reconcileReconstructLlmDispatchFailures
    > | null = null;
    const persisted = await persistReconstructLlmDispatchFailure({
      runControlPath: initArgs(root).outputPath,
      validationOutputPath: initArgs(root).validationOutputPath,
      sessionId: path.basename(root),
      sessionRoot: root,
      attemptId: initialized.attemptId,
      error: failureError(),
      faultInjector: (point) => {
        if (point !== "after_temp_write") return;
        reconciliationPromise = reconcileReconstructLlmDispatchFailures({
          sessionRoot: root,
        });
      },
    });
    const reconciled = await reconciliationPromise;

    expect(reconciled?.validation?.validation_status).toBe("valid");
    expect(persisted.validation.validation_status).toBe("valid");
    expect(persisted.runControl.write_transactions).toHaveLength(1);
    expect(persisted.runControl.write_transactions[0]?.transaction_status)
      .toBe("committed");
    expect(persisted.runControl.attempt_rows[0]?.attempt_status).toBe("failed");
  });

  it("preserves the committed failure lineage when a resume starts during commit", async () => {
    const root = await tempSessionRoot();
    const initialized = await initialize(root);
    let resumePromise: ReturnType<typeof initializeReconstructRunControl> | null = null;
    const persisted = await persistReconstructLlmDispatchFailure({
      runControlPath: initArgs(root).outputPath,
      validationOutputPath: initArgs(root).validationOutputPath,
      sessionId: path.basename(root),
      sessionRoot: root,
      attemptId: initialized.attemptId,
      error: failureError(),
      faultInjector: (point) => {
        if (point !== "after_commit") return;
        resumePromise = initializeReconstructRunControl({
          ...initArgs(root),
          resumeMode: "reuse_existing_authored_artifacts",
        });
      },
    });
    const resumed = await resumePromise;

    expect(persisted.validation.validation_status).toBe("valid");
    expect(resumed?.validation.validation_status).toBe("valid");
    expect(resumed?.runControl.write_transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner_attempt_id: initialized.attemptId,
          artifact_ref: persisted.artifactRef,
          transaction_status: "committed",
        }),
      ]),
    );
    expect(resumed?.runControl.attempt_rows).toHaveLength(2);
    expect(resumed?.runControl.attempt_rows[0]?.attempt_status).toBe("failed");
    expect(resumed?.runControl.attempt_rows[1]?.attempt_status).toBe("running");
  });

  it("rejects wrong owner, hash, schema, and prepared failed terminals", async () => {
    const root = await tempSessionRoot();
    const initialized = await initialize(root);
    const persisted = await persistReconstructLlmDispatchFailure({
      runControlPath: initArgs(root).outputPath,
      validationOutputPath: initArgs(root).validationOutputPath,
      sessionId: path.basename(root),
      sessionRoot: root,
      attemptId: initialized.attemptId,
      error: failureError(),
    });
    const transaction = persisted.runControl.write_transactions[0]!;
    const common = {
      runControl: persisted.runControl,
      expectedSessionId: path.basename(root),
      expectedSessionRoot: root,
      failedTerminalArtifactRef: persisted.artifactRef,
      failedTerminalArtifact: persisted.artifact,
      failedTerminalArtifactSha256: transaction.committed_hash,
    };

    for (const validation of [
      validateReconstructRunControl({
        ...common,
        failedTerminalArtifact: {
          ...persisted.artifact,
          owner_attempt_id: "attempt:wrong-owner",
        },
      }),
      validateReconstructRunControl({
        ...common,
        failedTerminalArtifactSha256: "b".repeat(64),
      }),
      validateReconstructRunControl({
        ...common,
        failedTerminalArtifact: {
          ...persisted.artifact,
          schema_version: "unknown",
        },
      }),
      validateReconstructRunControl({
        ...common,
        runControl: {
          ...persisted.runControl,
          write_transactions: [{
            ...transaction,
            transaction_status: "prepared",
            committed_hash: null,
          }],
        },
      }),
    ]) {
      expect(validation.validation_status).toBe("invalid");
      expect(validation.violations.map((item) => item.code)).toContain(
        "failed_terminal_invalid",
      );
    }
  });

  for (const point of [
    "after_prepare",
    "after_publish",
    "after_commit",
  ] as const) {
    it(`reconciles ${point} to one trusted failed terminal`, async () => {
      const root = await tempSessionRoot();
      const initialized = await persistWithFault(root, point);
      const reconciled = await reconcileReconstructLlmDispatchFailures({
        sessionRoot: root,
      });

      expect(reconciled).not.toBeNull();
      expect(reconciled?.validation?.validation_status).toBe("valid");
      expect(reconciled?.runControl.attempt_rows).toHaveLength(1);
      expect(reconciled?.runControl.attempt_rows[0]).toMatchObject({
        attempt_id: initialized.attemptId,
        attempt_status: "failed",
      });
      expect(reconciled?.runControl.write_transactions).toHaveLength(1);
      expect(reconciled?.runControl.write_transactions[0]?.transaction_status)
        .toBe("committed");
      expect(reconciled?.validation?.transaction_count).toBe(1);
    });
  }

  for (const priorValidation of [
    "missing",
    "stale",
    "poisoned",
    "malformed",
    "cyclic",
    "wrong_timestamp",
    "in_memory_field",
  ] as const) {
    it(`regenerates ${priorValidation} failed-terminal validation`, async () => {
      const root = await tempSessionRoot();
      const initialized = await initialize(root);
      await persistReconstructLlmDispatchFailure({
        runControlPath: initArgs(root).outputPath,
        validationOutputPath: initArgs(root).validationOutputPath,
        sessionId: path.basename(root),
        sessionRoot: root,
        attemptId: initialized.attemptId,
        error: failureError(),
      });
      const baselineText = await fs.readFile(
        initArgs(root).validationOutputPath,
        "utf8",
      );
      const persistedBaseline = parseYaml(
        baselineText,
      ) as ReconstructRunControlValidationArtifact;
      const lockSpy = vi.spyOn(lockfile, "lock");
      if (priorValidation === "missing") {
        await fs.rm(initArgs(root).validationOutputPath);
        await expect(fs.readFile(initArgs(root).validationOutputPath))
          .rejects.toMatchObject({ code: "ENOENT" });
      } else if (priorValidation === "malformed") {
        const malformed = baselineText.replace(
          /^violations: \[\]$/m,
          "violations: [",
        );
        expect(malformed).not.toBe(baselineText);
        expect(() => parseYaml(malformed)).toThrow();
        await fs.writeFile(
          initArgs(root).validationOutputPath,
          malformed,
          "utf8",
        );
      } else if (priorValidation === "cyclic") {
        const cyclic = baselineText.replace(
          /^violations: \[\]$/m,
          "violations: &loop [*loop]",
        );
        expect(cyclic).not.toBe(baselineText);
        const cyclicValidation = parseYaml(cyclic) as {
          violations: unknown[];
        };
        expect(cyclicValidation.violations[0]).toBe(
          cyclicValidation.violations,
        );
        await fs.writeFile(
          initArgs(root).validationOutputPath,
          cyclic,
          "utf8",
        );
      } else {
        const replacement: Record<string, unknown> = { ...persistedBaseline };
        if (priorValidation === "stale") replacement.transaction_count = 0;
        if (priorValidation === "poisoned") {
          replacement.validation_results = ["reconstruct_run_control_invalid"];
        }
        if (priorValidation === "wrong_timestamp") replacement.created_at = 42;
        if (priorValidation === "in_memory_field") {
          replacement.asserted_obligation_ids = ["poisoned_persisted_field"];
        }
        const expectedChangedKey = {
          stale: "transaction_count",
          poisoned: "validation_results",
          wrong_timestamp: "created_at",
          in_memory_field: "asserted_obligation_ids",
        }[priorValidation];
        expect(changedTopLevelKeys(
          persistedBaseline as unknown as Record<string, unknown>,
          replacement,
        )).toEqual([expectedChangedKey]);
        await fs.writeFile(
          initArgs(root).validationOutputPath,
          stringifyYaml(replacement),
          "utf8",
        );
      }

      const reconciled = await reconcileReconstructLlmDispatchFailures({
        sessionRoot: root,
      });

      expect(lockSpy).toHaveBeenCalledTimes(1);
      expect(reconciled?.validation).toMatchObject({
        validation_status: "valid",
        current_attempt_id: initialized.attemptId,
        transaction_count: 1,
        validation_results: ["reconstruct_run_control_valid"],
      });
      const durable = parseYaml(
        await fs.readFile(initArgs(root).validationOutputPath, "utf8"),
      ) as ReconstructRunControlValidationArtifact;
      expect(durable).toMatchObject({
        validation_status: "valid",
        transaction_count: 1,
        validation_results: ["reconstruct_run_control_valid"],
        violations: [],
      });
      expect(typeof durable.created_at).toBe("string");
      expect(durable).not.toHaveProperty("asserted_obligation_ids");
      if (priorValidation === "cyclic") {
        const durableText = await fs.readFile(
          initArgs(root).validationOutputPath,
          "utf8",
        );
        expect(durableText).not.toContain("&loop");
        expect(durableText).not.toContain("*loop");
      }
    });
  }

  it("keeps a current failed-terminal validation on the no-lock byte-identical path", async () => {
    const root = await tempSessionRoot();
    const initialized = await initialize(root);
    await persistReconstructLlmDispatchFailure({
      runControlPath: initArgs(root).outputPath,
      validationOutputPath: initArgs(root).validationOutputPath,
      sessionId: path.basename(root),
      sessionRoot: root,
      attemptId: initialized.attemptId,
      error: failureError(),
    });
    const before = await fs.readFile(initArgs(root).validationOutputPath);
    const lockSpy = vi.spyOn(lockfile, "lock");

    const reconciled = await reconcileReconstructLlmDispatchFailures({
      sessionRoot: root,
    });

    expect(lockSpy).not.toHaveBeenCalled();
    expect(await fs.readFile(initArgs(root).validationOutputPath)).toEqual(before);
    expect(reconciled?.runControl.attempt_rows.at(-1)?.attempt_id).toBe(
      initialized.attemptId,
    );
    expect(reconciled?.validation?.current_attempt_id).toBe(initialized.attemptId);
  });

  it("locks and rereads when a concurrent resume publishes a newer generation", async () => {
    const root = await tempSessionRoot();
    const initialized = await initialize(root);
    await persistReconstructLlmDispatchFailure({
      runControlPath: initArgs(root).outputPath,
      validationOutputPath: initArgs(root).validationOutputPath,
      sessionId: path.basename(root),
      sessionRoot: root,
      attemptId: initialized.attemptId,
      error: failureError(),
    });
    const failureDirectory = path.join(root, "llm-dispatch-failures");
    const realLstat = fs.lstat.bind(fs);
    let resumedAttemptId: string | null = null;
    let interleaved = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (...args) => {
      const result = await realLstat(...args);
      if (
        !interleaved &&
        path.resolve(String(args[0])) === path.resolve(failureDirectory)
      ) {
        interleaved = true;
        const resumed = await initializeReconstructRunControl({
          ...initArgs(root),
          resumeMode: "reuse_existing_authored_artifacts",
        });
        resumedAttemptId = resumed.attemptId;
      }
      return result;
    });
    const lockSpy = vi.spyOn(lockfile, "lock");

    const reconciled = await reconcileReconstructLlmDispatchFailures({
      sessionRoot: root,
    });

    expect(interleaved).toBe(true);
    expect(resumedAttemptId).not.toBeNull();
    expect(lockSpy).toHaveBeenCalledTimes(2);
    expect(reconciled?.runControl.attempt_rows.at(-1)?.attempt_id).toBe(
      resumedAttemptId,
    );
    expect(reconciled?.runControl.attempt_rows.at(-1)?.attempt_status).toBe(
      "running",
    );
    expect(reconciled?.validation).toBeNull();
  });

  it("adopts and reconciles a valid pre-prepare temp instead of deleting it", async () => {
    const root = await tempSessionRoot();
    await persistWithFault(root, "after_temp_write");

    expect((await readRunControl(root)).write_transactions).toHaveLength(0);
    const before = await fs.readdir(path.join(root, "llm-dispatch-failures"));
    expect(before.some((name) => name.startsWith(".pending-"))).toBe(true);
    const reconciled = await reconcileReconstructLlmDispatchFailures({
      sessionRoot: root,
    });
    const after = await fs.readdir(path.join(root, "llm-dispatch-failures"));

    expect(after.some((name) => name.startsWith(".pending-"))).toBe(false);
    expect(reconciled?.runControl.write_transactions[0]?.transaction_status)
      .toBe("committed");
    expect(reconciled?.runControl.attempt_rows[0]?.attempt_status).toBe("failed");
  });

  for (const partialName of [
    ".pending-0000000000000000-truncated.yaml",
    ".scratch-0000000000000000-interrupted.yaml",
  ]) {
    it(`abandons and unlocks an interrupted ${partialName.split("-")[0]} write`, async () => {
      const root = await tempSessionRoot();
      const initialized = await initialize(root);
      const directory = path.join(root, "llm-dispatch-failures");
      await fs.mkdir(directory, { recursive: true });
      const partialRef = path.join(directory, partialName);
      await fs.writeFile(partialRef, "", "utf8");

      const reconciled = await reconcileReconstructLlmDispatchFailures({
        sessionRoot: root,
      });

      expect(reconciled?.runControl.attempt_rows[0]).toMatchObject({
        attempt_id: initialized.attemptId,
        attempt_status: "abandoned",
      });
      expect(reconciled?.runControl.lock_rows[0]?.lock_status).toBe("released");
      expect(reconciled?.runControl.resume_rows[0]?.resume_decision)
        .toBe("blocked_partial_write");
      expect(reconciled?.runControl.resume_rows[0]?.stale_artifact_refs)
        .toContain(partialRef);
    });
  }

  it("rejects a valid pending artifact whose filename hash prefix is forged", async () => {
    const root = await tempSessionRoot();
    const initialized = await persistWithFault(root, "after_temp_write");
    const directory = path.join(root, "llm-dispatch-failures");
    const pendingName = (await fs.readdir(directory)).find((name) =>
      name.startsWith(".pending-")
    );
    expect(pendingName).toBeTruthy();
    const originalRef = path.join(directory, pendingName!);
    const forgedRef = path.join(
      directory,
      pendingName!.replace(/^\.pending-[a-f0-9]{16}-/, ".pending-0000000000000000-"),
    );
    await fs.rename(originalRef, forgedRef);

    const reconciled = await reconcileReconstructLlmDispatchFailures({
      sessionRoot: root,
    });

    expect(reconciled?.runControl.attempt_rows[0]).toMatchObject({
      attempt_id: initialized.attemptId,
      attempt_status: "abandoned",
    });
    expect(reconciled?.runControl.write_transactions).toHaveLength(0);
    expect(reconciled?.runControl.resume_rows[0]?.stale_artifact_refs)
      .toContain(forgedRef);
  });

  it("rejects traversal-shaped failure ids before constructing a path", async () => {
    const root = await tempSessionRoot();
    expect(() => reconstructLlmDispatchFailurePath(
      root,
      "llm-failure:../../outside",
    )).toThrow(/invalid reconstruct LLM dispatch failure id/);
  });

  it("quarantines a prepared transaction when neither temp nor final survives", async () => {
    const root = await tempSessionRoot();
    const initialized = await persistWithFault(root, "after_prepare");
    const prepared = await readRunControl(root);
    await fs.rm(prepared.write_transactions[0]!.temp_ref!, { force: true });
    prepared.lock_rows[0]!.lease_expires_at = "2000-01-01T00:00:00.000Z";
    await fs.writeFile(initArgs(root).outputPath, stringifyYaml(prepared), "utf8");

    const reconciled = await reconcileReconstructLlmDispatchFailures({
      sessionRoot: root,
    });

    expect(reconciled?.runControl.write_transactions[0]?.transaction_status)
      .toBe("quarantined");
    expect(reconciled?.runControl.attempt_rows[0]).toMatchObject({
      attempt_id: initialized.attemptId,
      attempt_status: "abandoned",
    });
    expect(reconciled?.runControl.resume_rows).toHaveLength(1);
    expect(reconciled?.runControl.resume_rows[0]?.resume_decision)
      .toBe("blocked_partial_write");
  });

  it("quarantines a canonical final artifact that has no prepared transaction", async () => {
    const root = await tempSessionRoot();
    const initialized = await persistWithFault(root, "after_temp_write");
    const directory = path.join(root, "llm-dispatch-failures");
    const pendingName = (await fs.readdir(directory)).find((name) =>
      name.startsWith(".pending-")
    );
    expect(pendingName).toBeTruthy();
    const pendingRef = path.join(directory, pendingName!);
    const artifact = await readReconstructLlmDispatchFailureArtifact(pendingRef);
    const finalRef = reconstructLlmDispatchFailurePath(root, artifact.failure_id);
    await fs.rename(pendingRef, finalRef);
    const withoutIntent = await readRunControl(root);
    withoutIntent.write_transactions = [];
    await fs.writeFile(
      initArgs(root).outputPath,
      stringifyYaml(withoutIntent),
      "utf8",
    );

    const reconciled = await reconcileReconstructLlmDispatchFailures({
      sessionRoot: root,
    });

    expect((await fs.stat(finalRef)).isFile()).toBe(true);
    expect(reconciled?.runControl.write_transactions).toHaveLength(1);
    expect(reconciled?.runControl.write_transactions[0]?.transaction_status)
      .toBe("quarantined");
    expect(reconciled?.runControl.attempt_rows[0]).toMatchObject({
      attempt_id: initialized.attemptId,
      attempt_status: "abandoned",
    });
    expect(reconciled?.runControl.resume_rows[0]?.resume_decision)
      .toBe("blocked_partial_write");
  });

  it("quarantines malformed orphan content and abandons the current attempt", async () => {
    const root = await tempSessionRoot();
    const initialized = await initialize(root);
    const directory = path.join(root, "llm-dispatch-failures");
    await fs.mkdir(directory, { recursive: true });
    const malformedRef = path.join(directory, "failure-malformed.yaml");
    await fs.writeFile(malformedRef, "schema_version: wrong\n", "utf8");

    const reconciled = await reconcileReconstructLlmDispatchFailures({
      sessionRoot: root,
    });

    expect((await fs.stat(malformedRef)).isFile()).toBe(true);
    expect(reconciled?.runControl.write_transactions[0]).toMatchObject({
      artifact_ref: malformedRef,
      transaction_status: "quarantined",
    });
    expect(reconciled?.runControl.attempt_rows[0]).toMatchObject({
      attempt_id: initialized.attemptId,
      attempt_status: "abandoned",
    });
  });

  it("never renames a prepared temp ref outside the failure directory", async () => {
    const root = await tempSessionRoot();
    const initialized = await initialize(root);
    const externalRef = path.join(root, "must-stay.txt");
    await fs.writeFile(externalRef, "outside failure directory\n", "utf8");
    const runControl = await readRunControl(root);
    runControl.write_transactions.push({
      transaction_id: "write:external-temp",
      owner_attempt_id: initialized.attemptId,
      artifact_ref: reconstructLlmDispatchFailurePath(
        root,
        "llm-failure:eeeeeeeeeeeeeeeeeeee",
      ),
      temp_ref: externalRef,
      expected_prior_hash: null,
      prepared_content_hash: "d".repeat(64),
      committed_hash: null,
      commit_method: "append_only",
      transaction_status: "prepared",
      recovery_ref: null,
    });
    await fs.writeFile(
      initArgs(root).outputPath,
      stringifyYaml(runControl),
      "utf8",
    );

    const reconciled = await reconcileReconstructLlmDispatchFailures({
      sessionRoot: root,
    });

    expect(await fs.readFile(externalRef, "utf8"))
      .toBe("outside failure directory\n");
    expect(reconciled?.runControl.write_transactions[0]?.transaction_status)
      .toBe("quarantined");
    expect(reconciled?.runControl.attempt_rows[0]?.attempt_status)
      .toBe("abandoned");
  });

  it("rejects a symlinked failure directory without touching its target", async () => {
    const root = await tempSessionRoot();
    const external = await tempSessionRoot();
    await initialize(root);
    const sentinel = path.join(external, "must-stay.txt");
    await fs.writeFile(sentinel, "external sentinel\n", "utf8");
    await fs.symlink(
      external,
      path.join(root, "llm-dispatch-failures"),
      "dir",
    );

    await expect(
      reconcileReconstructLlmDispatchFailures({ sessionRoot: root }),
    ).rejects.toThrow(/not a real directory/);
    expect(await fs.readFile(sentinel, "utf8")).toBe("external sentinel\n");
  });
});
