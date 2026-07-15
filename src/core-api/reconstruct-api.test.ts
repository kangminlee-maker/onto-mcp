import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructSourceObservationsArtifact,
} from "../core-runtime/reconstruct/artifact-types.js";
import {
  createOntoReconstructCoreApi,
  recoverReconstructFailedRunStatus,
  resolveJudgeLlmConfig,
  tryCreateEligiblePrimarySealedDispatchCapability,
} from "./reconstruct-api.js";
import type { SupportedModelRegistry } from "../core-runtime/discovery/supported-models.js";
import { ReconstructLlmDispatchFailureError } from "../core-runtime/reconstruct/llm-dispatch-failure.js";
import {
  initializeReconstructRunControl,
  persistReconstructLlmDispatchFailure,
  recordReconstructRunControlTransactions,
} from "../core-runtime/reconstruct/run-control-validation.js";
import { normalizeLlmModelSwitcher } from "../core-runtime/llm/model-switcher.js";

const tempRoots: string[] = [];

async function tempProjectRoot(): Promise<string> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-core-api-reconstruct-"),
  );
  tempRoots.push(projectRoot);
  await fs.writeFile(
    path.join(projectRoot, "schedule.csv"),
    "month,revenue\n2026-01,100\n",
    "utf8",
  );
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "src", "feature.ts"),
    "export const feature = 'reconstruct';\n",
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

describe("createOntoReconstructCoreApi", () => {
  it("keeps one eligible sealed primary operation when its sibling is unsupported", async () => {
    process.env.TEST_PRIMARY_KEY = "test-only";
    try {
      const [eligible, unsupported] = await Promise.all([
        tryCreateEligiblePrimarySealedDispatchCapability({
          llm: {
            provider: "openai",
            auth: "api_key",
            model: "test-model",
            effort: "medium",
            api_key_env: "TEST_PRIMARY_KEY",
          },
          operation: "semantic_map_synthesize",
        }),
        tryCreateEligiblePrimarySealedDispatchCapability({
          llm: {
            provider: "openai",
            auth: "api_key",
            model: "test-model",
          },
          operation: "semantic_map_verify",
        }),
      ]);
      expect(eligible?.public_descriptor.dispatch_role).toBe(
        "semantic_map_synthesize",
      );
      expect(unsupported).toBeUndefined();
    } finally {
      delete process.env.TEST_PRIMARY_KEY;
    }
  });

  it("lists source profiles from the configured onto home", async () => {
    const api = createOntoReconstructCoreApi({
      ontoHome: path.resolve("."),
    });

    const profiles = await api.listSourceProfiles();

    expect(profiles.map((profile) => profile.target_material_kind).sort()).toEqual([
      "code",
      "database",
      "document",
      "mixed",
      "spreadsheet",
      "unknown",
    ]);
  });

  it("prepares reconstruct artifacts and record without generating ontology meaning", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReconstructCoreApi({
      ontoHome: path.resolve("."),
    });

    const prepared = await api.prepareReconstruct({
      projectRoot,
      targetRefs: ["schedule.csv"],
      sessionRoot: ".onto/reconstruct/test-session",
    });

    expect(prepared.sessionId).toBe("test-session");
    expect(prepared.reconstructRecord.record_stage).toBe("preparation_artifacts_written");
    expect(prepared.reconstructRecord.target_material_kind).toBe("spreadsheet");
    expect(prepared.reconstructRecord.runtime_boundary.semantic_generation)
      .toBe("not_performed");
    expect(prepared.artifactRefs.target_material_profile).toContain(
      "target-material-profile.yaml",
    );
    expect(prepared.artifactRefs.target_material_profile_validation).toContain(
      "target-material-profile-validation.yaml",
    );
    expect(prepared.artifactRefs.reconstruct_record).toContain(
      "reconstruct-record.yaml",
    );
  });

  it("uses the installed source profiles when the target project has none", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReconstructCoreApi();

    const prepared = await api.prepareReconstruct({
      projectRoot,
      targetRefs: ["schedule.csv"],
      sessionRoot: ".onto/reconstruct/install-profile-session",
    });

    expect(prepared.profilesRoot).toContain(
      path.join(".onto", "processes", "reconstruct", "source-profiles"),
    );
    expect(path.resolve(prepared.profilesRoot).startsWith(path.resolve(projectRoot)))
      .toBe(false);
    expect(prepared.reconstructRecord.target_material_kind).toBe("spreadsheet");
  });

  it("lets the latest trusted LLM failure supersede an older preparation record", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(
      projectRoot,
      ".onto",
      "reconstruct",
      "failed-session",
    );
    const api = createOntoReconstructCoreApi({ ontoHome: path.resolve(".") });
    const prepared = await api.prepareReconstruct({
      projectRoot,
      targetRefs: ["schedule.csv"],
      sessionRoot,
    });
    expect(prepared.reconstructRecord.record_stage)
      .toBe("preparation_artifacts_written");
    const runControlPath = path.join(
      sessionRoot,
      "reconstruct-run-control.yaml",
    );
    const runControlValidationPath = path.join(
      sessionRoot,
      "reconstruct-run-control-validation.yaml",
    );
    const initialized = await initializeReconstructRunControl({
      sessionId: path.basename(sessionRoot),
      sessionRoot,
      projectRoot,
      targetRefs: [path.join(projectRoot, "schedule.csv")],
      intent: "reconstruct failed status fixture",
      domain: null,
      profilesRoot: path.join(projectRoot, "profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      runtimeVersion: "test-runtime",
      outputPath: runControlPath,
      validationOutputPath: runControlValidationPath,
      bootstrapDiagnosticPath: path.join(
        sessionRoot,
        "reconstruct-run-bootstrap-diagnostic.yaml",
      ),
    });
    const dispatchFailure = new ReconstructLlmDispatchFailureError({
      unitId: "ontology_seed",
      artifactName: "OntologySeed",
      callKind: "initial",
      evidence: {
        failure_code: "openai_responses_max_output_tokens",
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
        partial_output_chars: 555,
        partial_output_sha256: "c".repeat(64),
        provider_model: "gpt-5.5",
        provider_response_id: "resp_private",
        provider_request_id: "req_private",
        effective_base_url: "https://api.openai.com/v1",
        sdk_max_retries: 2,
        actual_adapter_request_count: null,
        request_count_observability: "unavailable",
      },
      cause: new Error("provider incomplete"),
    });
    const trustedArtifactRef = path.join(sessionRoot, "target-material-profile.yaml");
    const changedArtifactRef = path.join(sessionRoot, "source-inventory.yaml");
    await fs.writeFile(trustedArtifactRef, "schema_version: '1'\n", "utf8");
    await fs.writeFile(changedArtifactRef, "schema_version: '1'\n", "utf8");
    await recordReconstructRunControlTransactions({
      runControlPath,
      validationOutputPath: runControlValidationPath,
      attemptId: initialized.attemptId,
      artifactRefs: [trustedArtifactRef, changedArtifactRef],
      expectedSessionId: path.basename(sessionRoot),
      expectedSessionRoot: sessionRoot,
    });
    await fs.writeFile(changedArtifactRef, "schema_version: 'changed'\n", "utf8");
    await persistReconstructLlmDispatchFailure({
      runControlPath,
      validationOutputPath: runControlValidationPath,
      sessionId: path.basename(sessionRoot),
      sessionRoot,
      attemptId: initialized.attemptId,
      error: dispatchFailure,
    });
    const failureDirectory = path.join(sessionRoot, "llm-dispatch-failures");
    await fs.chmod(sessionRoot, 0o555);
    await fs.chmod(failureDirectory, 0o555);
    let status;
    try {
      status = await api.getRunStatus(sessionRoot);
    } finally {
      await fs.chmod(failureDirectory, 0o755);
      await fs.chmod(sessionRoot, 0o755);
    }
    expect(await fs.lstat(`${runControlPath}.write-lock`).catch(() => null))
      .toBeNull();
    expect(status.status).toBe("failed");
    if (status.status !== "failed") throw new Error("expected failed status");
    expect(status.reconstructRecord).toBeNull();
    expect(status.progress.currentStageId).toBe("ontology_seed");
    expect(status.progress.countSummary.failureCount).toBeNull();
    expect(status.reusableArtifactRefs).toEqual([trustedArtifactRef]);
    expect(status.progress.stages.find((stage) =>
      stage.stageId === "run_control"
    )?.state).toBe("completed");
    expect(status.progress.stages.find((stage) =>
      stage.stageId === "run_control_validation"
    )?.state).toBe("completed");
    expect(status.progress.stages.find((stage) =>
      stage.stageId === "target_material_profile"
    )?.state).toBe("completed");
    expect(status.progress.stages.find((stage) =>
      stage.stageId === "ontology_seed"
    )?.state).toBe("halted");
    expect(status.failure).toMatchObject({
      failure_code: "openai_responses_max_output_tokens",
      base_output_ceiling_tokens: 9_000,
      effective_max_output_tokens: 34_000,
      output_tokens: 33_990,
    });
    const publicJson = JSON.stringify(status);
    expect(publicJson).not.toContain("req_private");
    expect(publicJson).not.toContain("resp_private");
    expect(publicJson).not.toContain("api.openai.com");
    expect(publicJson).not.toContain("c".repeat(64));

    const result = await api.getRunResult(sessionRoot);
    expect(result.status).toBe("failed");
    expect(result.finalOutputPath).toBeNull();
    expect(result.finalOutputText).toBeNull();
    expect(result.reconstructRunManifestPath).toBeNull();
    expect(result.reconstructRunManifest).toBeNull();

    const immediate = await recoverReconstructFailedRunStatus({
      sessionRoot,
      error: dispatchFailure,
    });
    expect(immediate?.status).toBe("failed");
    expect(immediate?.sessionRoot).toBe(sessionRoot);
    expect(await recoverReconstructFailedRunStatus({
      sessionRoot,
      error: new Error("ordinary provider error"),
    })).toBeNull();

    // The conflict invocation must survive actor-settings resolution (which
    // precedes run-control validation) without depending on a host-level
    // ~/.onto/settings.json: provide the v3 actor seats in the project layer
    // and isolate HOME, so the run-control conflict decides the outcome.
    const conflictActorLlm = {
      provider: "openai",
      auth: "api_key",
      model: "gpt-5.5",
      effort: "low",
      api_key_env: "UNSET_TEST_OPENAI_KEY",
    };
    await fs.writeFile(
      path.join(projectRoot, ".onto", "settings.json"),
      `${JSON.stringify({
        schema_version: "settings.json/v3",
        reconstruct: {
          execution: {
            actors: {
              semantic_author: { llm: conflictActorLlm },
              confirmation_provider: { llm: conflictActorLlm },
            },
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );
    const previousHome = process.env.HOME;
    const isolatedHome = path.join(projectRoot, "home");
    await fs.mkdir(isolatedHome, { recursive: true });
    process.env.HOME = isolatedHome;
    try {
      await expect(api.runReconstruct({
        projectRoot,
        targetRefs: ["schedule.csv"],
        sessionRoot,
        intent: "a different invocation must not inherit the prior failed terminal",
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "direct_call",
      })).rejects.toThrow(/run-control conflict/);
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it("fails loudly before reconstruct direct-call when v3 semantic author llm is missing", async () => {
    const projectRoot = await tempProjectRoot();
    const previousHome = process.env.HOME;
    const isolatedHome = path.join(projectRoot, "home");
    await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
    await fs.mkdir(isolatedHome, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, ".onto", "settings.json"),
      JSON.stringify({
        schema_version: "settings.json/v3",
        review: {
          execution: {
            actors: {
              teamlead: {
                seat: "main",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-5.5",
                  effort: "medium",
                  service_tier: "fast",
                },
              },
            },
          },
        },
      }, null, 2),
      "utf8",
    );

    process.env.HOME = isolatedHome;
    try {
      const api = createOntoReconstructCoreApi({
        ontoHome: path.resolve("."),
      });

      await expect(api.runReconstruct({
        projectRoot,
        targetRefs: ["src/feature.ts"],
        sessionRoot: ".onto/reconstruct/missing-reconstruct-actor",
        intent: "reconstruct",
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "mock",
      })).rejects.toThrow(
        "reconstruct.execution.actors.semantic_author.llm is required",
      );
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it("surfaces a reconciled partial failure write as an explicit blocked error", async () => {
    const projectRoot = await tempProjectRoot();
    const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "partial");
    const runControlPath = path.join(sessionRoot, "reconstruct-run-control.yaml");
    await initializeReconstructRunControl({
      sessionId: path.basename(sessionRoot),
      sessionRoot,
      projectRoot,
      targetRefs: [path.join(projectRoot, "schedule.csv")],
      intent: "reconstruct",
      domain: null,
      profilesRoot: path.resolve(".onto/processes/reconstruct/source-profiles"),
      filesystemAllowedRoots: [projectRoot],
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
      runtimeVersion: "test-runtime",
      outputPath: runControlPath,
      validationOutputPath: path.join(
        sessionRoot,
        "reconstruct-run-control-validation.yaml",
      ),
      bootstrapDiagnosticPath: path.join(
        sessionRoot,
        "reconstruct-run-bootstrap-diagnostic.yaml",
      ),
    });
    const failureDirectory = path.join(sessionRoot, "llm-dispatch-failures");
    await fs.mkdir(failureDirectory);
    await fs.writeFile(
      path.join(failureDirectory, ".scratch-dead-write.yaml"),
      "partial",
      "utf8",
    );

    const api = createOntoReconstructCoreApi({ ontoHome: path.resolve(".") });
    await expect(api.getRunStatus(sessionRoot)).rejects.toThrow(
      /blocked by a partial failure write/,
    );
    const runControl = parseYaml(await fs.readFile(runControlPath, "utf8")) as {
      resume_rows: Array<{ resume_decision: string }>;
    };
    expect(runControl.resume_rows.at(-1)?.resume_decision)
      .toBe("blocked_partial_write");
  });

  it("rejects a session-root realpath escape before provider configuration", async () => {
    const projectRoot = await tempProjectRoot();
    const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-external-session-"));
    tempRoots.push(externalRoot);
    const reconstructRoot = path.join(projectRoot, ".onto", "reconstruct");
    await fs.mkdir(reconstructRoot, { recursive: true });
    const linkedSession = path.join(reconstructRoot, "linked-session");
    await fs.symlink(externalRoot, linkedSession);

    const api = createOntoReconstructCoreApi({ ontoHome: path.resolve(".") });
    await expect(api.runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "schedule.csv")],
      sessionRoot: linkedSession,
      intent: "must fail before dispatch",
    })).rejects.toThrow(/sessionRoot realpath escapes allowed root/);
  });

  it("rejects headroom plus dispatch fallback before any provider call", async () => {
    const projectRoot = await tempProjectRoot();
    await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
    const directOpenAi = {
      provider: "openai",
      auth: "api_key",
      model: "gpt-5.5",
      effort: "low",
      api_key_env: "UNSET_TEST_OPENAI_KEY",
    };
    await fs.writeFile(
      path.join(projectRoot, ".onto", "settings.json"),
      `${JSON.stringify({
        schema_version: "settings.json/v3",
        reconstruct: {
          execution: {
            actors: {
              semantic_author: {
                llm: directOpenAi,
                llm_runtime: {
                  openai_responses_output_headroom_tokens: 25_000,
                },
              },
              confirmation_provider: { llm: directOpenAi },
            },
            semantic_map_authoring: true,
            dispatch_breaker: { enabled: true },
            dispatch_fallback: {
              enabled: true,
              trigger: "rate_limit",
              max_fallback_passes: 1,
              per_dispatch_max_provider_attempts: 1,
              systemic_failure_threshold: 1,
              llm: {
                provider: "anthropic",
                auth: "api_key",
                model: "claude-opus-4-8",
                effort: "medium",
                api_key_env: "UNSET_TEST_ANTHROPIC_KEY",
              },
            },
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const api = createOntoReconstructCoreApi({ ontoHome: path.resolve(".") });
    await expect(api.runReconstruct({
      projectRoot,
      targetRefs: [path.join(projectRoot, "schedule.csv")],
      sessionRoot: path.join(projectRoot, ".onto", "reconstruct", "fallback"),
      intent: "must reject before dispatch",
    })).rejects.toThrow(/cannot be combined with dispatch_fallback/);
  });

  it("rejects a cross-provider llmOverride combined with judgeModel before any provider call", async () => {
    // design v4 §2.5: judgeModel names a model ON THE AUTHOR'S PROVIDER, so
    // pairing it with an override that switches that provider is ambiguous — the
    // judge would silently resolve/degrade on the switched-in provider.
    const projectRoot = await tempProjectRoot();
    await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
    const openAiAuthor = {
      provider: "openai",
      auth: "api_key",
      model: "gpt-5.5",
      effort: "low",
      api_key_env: "UNSET_TEST_OPENAI_KEY",
    };
    await fs.writeFile(
      path.join(projectRoot, ".onto", "settings.json"),
      `${JSON.stringify({
        schema_version: "settings.json/v3",
        reconstruct: {
          execution: {
            actors: {
              semantic_author: { llm: openAiAuthor },
              confirmation_provider: { llm: openAiAuthor },
            },
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const api = createOntoReconstructCoreApi({ ontoHome: path.resolve(".") });
    const base = {
      projectRoot,
      targetRefs: [path.join(projectRoot, "schedule.csv")],
      sessionRoot: path.join(projectRoot, ".onto", "reconstruct", "judge-xprovider"),
      intent: "must reject before dispatch",
    };
    await expect(api.runReconstruct({
      ...base,
      llmOverride: { provider: "anthropic", auth: "api_key", model: "claude-opus-4-8" },
      judgeModel: "gpt-5.5",
    })).rejects.toThrow(/switches the semantic author's provider/);

    // Negative control: the SAME judgeModel is fine when the override keeps the
    // author's provider (it is then unambiguous), so the guard is not blanket.
    await expect(api.runReconstruct({
      ...base,
      llmOverride: { effort: "high" },
      judgeModel: "gpt-5.5",
    })).rejects.not.toThrow(/switches the semantic author's provider/);
  });

  it("fails before provider capability creation when dispatch fallback is enabled but its breaker is off", async () => {
    const projectRoot = await tempProjectRoot();
    const previousHome = process.env.HOME;
    const isolatedHome = path.join(projectRoot, "home");
    await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
    await fs.mkdir(isolatedHome, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, ".onto", "settings.json"),
      JSON.stringify({
        schema_version: "settings.json/v3",
        reconstruct: {
          execution: {
            semantic_map_authoring: true,
            actors: {
              semantic_author: {
                llm: {
                  provider: "openai",
                  auth: "api_key",
                  model: "gpt-5.5",
                  effort: "medium",
                  api_key_env: "TEST_OPENAI_KEY",
                },
              },
              confirmation_provider: {
                llm: {
                  provider: "openai",
                  auth: "api_key",
                  model: "gpt-5.5",
                  effort: "medium",
                  api_key_env: "TEST_OPENAI_KEY",
                },
              },
            },
            dispatch_breaker: { enabled: false },
            dispatch_fallback: {
              enabled: true,
              trigger: "rate_limit",
              max_fallback_passes: 1,
              per_dispatch_max_provider_attempts: 1,
              systemic_failure_threshold: 1,
              llm: {
                provider: "anthropic",
                auth: "api_key",
                model: "claude-opus-4-8",
                effort: "medium",
                api_key_env: "TEST_ANTHROPIC_KEY",
              },
            },
          },
        },
      }, null, 2),
      "utf8",
    );

    process.env.HOME = isolatedHome;
    try {
      const api = createOntoReconstructCoreApi({ ontoHome: path.resolve(".") });
      await expect(api.runReconstruct({
        projectRoot,
        targetRefs: ["src/feature.ts"],
        sessionRoot: ".onto/reconstruct/fallback-without-breaker",
        intent: "reconstruct",
        semanticAuthorRealization: "direct_call",
        confirmationProviderRealization: "direct_call",
      })).rejects.toThrow(
        "dispatch_fallback requires reconstruct.execution.dispatch_breaker.enabled=true",
      );
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
    }
  });

  it("validates LLM-owned directives and reassembles the reconstruct record", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReconstructCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReconstruct({
      projectRoot,
      targetRefs: ["src/feature.ts"],
      sessionRoot: ".onto/reconstruct/test-session",
    });
    const sourceObservations =
      parseYaml(
        await fs.readFile(prepared.artifactRefs.source_observations!, "utf8"),
      ) as ReconstructSourceObservationsArtifact;
    const observation = sourceObservations.observations[0]!;
    const evidenceRef = {
      observation_id: observation.observation_id,
      target_material_kind: observation.target_material_kind,
      source_ref: observation.source_ref,
      location: observation.location,
    };
    const directivePath = path.join(
      prepared.sessionRoot,
      "source-observation-directive.yaml",
    );
    await fs.writeFile(
      directivePath,
      stringifyYaml({
        schema_version: "1",
        session_id: prepared.sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        selected_observations: [
          {
            ...evidenceRef,
            selection_rationale:
              "Core API test selects the runtime observation as evidence.",
          },
        ],
        open_questions: [],
      }),
      "utf8",
    );
    const ontologySeedValidationPath = path.join(
      prepared.sessionRoot,
      "ontology-seed-validation.yaml",
    );
    await fs.writeFile(
      ontologySeedValidationPath,
      stringifyYaml({
        schema_version: "1",
        session_id: prepared.sessionId,
        created_at: "2026-05-27T00:00:00.000Z",
        ontology_seed_ref: path.join(prepared.sessionRoot, "ontology-seed.yaml"),
        candidate_disposition_ref:
          path.join(prepared.sessionRoot, "candidate-disposition.yaml"),
        source_observations_ref: prepared.artifactRefs.source_observations!,
        registry_ref: path.join(
          prepared.sessionRoot,
          "reconstruct-contract-registry.yaml",
        ),
        validation_status: "valid",
        seed_ref_count: 1,
        evidence_ref_count: 1,
        limitation_count: 0,
        validation_results: ["ontology_seed_valid"],
        violations: [],
      }),
      "utf8",
    );

    const directiveValidation = await api.validateSourceObservationDirective({
      directivePath,
      sourceObservationsPath: prepared.artifactRefs.source_observations!,
    });
    const record = await api.assembleRecord({
      sessionRoot: prepared.sessionRoot,
      artifactRefs: {
        target_material_profile: prepared.artifactRefs.target_material_profile,
        target_material_profile_validation:
          prepared.artifactRefs.target_material_profile_validation,
        source_inventory: prepared.artifactRefs.source_inventory,
        initial_source_frontier: prepared.artifactRefs.initial_source_frontier,
        source_observations: prepared.artifactRefs.source_observations,
        source_observation_directive: directivePath,
        source_observation_directive_validation:
          path.join(prepared.sessionRoot, "source-observation-directive-validation.yaml"),
        ontology_seed_validation: ontologySeedValidationPath,
      },
    });
    const readBack = await api.getRecord(prepared.sessionRoot);

    expect(directiveValidation.validation_status).toBe("valid");
    expect(record.record_stage).toBe("ontology_seed_validated");
    expect(readBack.validation_summary.ontology_seed_status).toBe("valid");
    expect(readBack.validation_summary.semantic_claim_count).toBe(1);
    expect(readBack.validation_summary.evidence_ref_count).toBe(1);
  });

});

describe("resolveJudgeLlmConfig", () => {
  const registry: SupportedModelRegistry = {
    schema_version: "1",
    supported_models: [
      {
        provider: "openai",
        model: "gpt-5.5",
        verified_at: "2026-06-13",
        benchmark_evidence_refs: ["development-records/benchmark/x.json"],
      },
      {
        provider: "openai",
        model: "gpt-5-mini",
        verified_at: "2026-06-13",
        benchmark_evidence_refs: ["development-records/benchmark/x.json"],
        max_output_tokens: 128_000,
        max_output_tokens_provenance: "test provider specification",
      },
      {
        provider: "anthropic",
        model: "claude-opus-4-8",
        verified_at: "2026-06-15",
        benchmark_evidence_refs: ["development-records/benchmark/y.json"],
      },
    ],
  };
  const author = { provider: "openai" as const, model_id: "gpt-5-mini", api_key_env: "MY_OPENAI_KEY" };

  it("returns undefined config (inherit) when nothing is requested", () => {
    const out = resolveJudgeLlmConfig({ authorLlmConfig: author, registry });
    expect(out.judgeLlmConfig).toBeUndefined();
    expect(out.note).toBeNull();
  });

  it("applies an effort-only override without touching provider/model", () => {
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeLlmEffort: "high",
      registry,
    });
    expect(out.judgeLlmConfig?.reasoning_effort).toBe("high");
    expect(out.judgeLlmConfig?.provider).toBe("openai");
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5-mini");
    expect(out.note).toBeNull();
  });

  it("adopts a supported same-provider model override (keeps author credentials)", () => {
    // candidate is resolved on the author's provider, so it carries the author's
    // api_key_env — adoption must keep the provider and the matching credential.
    const candidate = { provider: "openai" as const, model_id: "gpt-5.5", api_key_env: "MY_OPENAI_KEY" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeModelCandidate: candidate,
      judgeModelProvider: "openai",
      registry,
    });
    expect(out.judgeLlmConfig?.provider).toBe("openai");
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5.5");
    expect(out.judgeLlmConfig?.api_key_env).toBe("MY_OPENAI_KEY");
    expect(out.note).toBeNull();
  });

  it("adopts a supported judge model on the OAuth route where the runtime provider is codex (registry uses the model provider)", () => {
    // OpenAI OAuth normalizes the runtime provider to "codex", but the registry
    // is keyed by the model provider (openai/gpt-5.5). The support check must use
    // judgeModelProvider="openai", not candidate.provider="codex", otherwise a
    // supported judge model is spuriously degraded and the lever is dead.
    const codexAuthor = { provider: "codex" as const, model_id: "gpt-5-mini", api_key_env: "MY_OPENAI_KEY" };
    const candidate = { provider: "codex" as const, model_id: "gpt-5.5", api_key_env: "MY_OPENAI_KEY" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: codexAuthor,
      judgeModelCandidate: candidate,
      judgeModelProvider: "openai",
      registry,
    });
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5.5");
    expect(out.judgeLlmConfig?.provider).toBe("codex");
    expect(out.note).toBeNull();
  });

  it("degrades (keeps author model + note) when the model override is unsupported", () => {
    const candidate = { provider: "openai" as const, model_id: "gpt-9-unverified", api_key_env: "MY_OPENAI_KEY" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeModelCandidate: candidate,
      judgeModelProvider: "openai",
      registry,
    });
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5-mini");
    expect(out.note).toMatch(/not a benchmark-verified route/);
  });

  it("applies headroom only after an unsupported judge model degrades", () => {
    const selection = normalizeLlmModelSwitcher({
      provider: "openai",
      auth: "api_key",
      model: "gpt-5-mini",
      api_key_env: "MY_OPENAI_KEY",
    });
    expect(selection).not.toBeNull();
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: {
        ...author,
        execution_adapter: "openai_sdk",
      },
      judgeModelCandidate: {
        provider: "openai",
        execution_adapter: "openai_sdk",
        model_id: "gpt-9-unverified",
        api_key_env: "MY_OPENAI_KEY",
      },
      judgeModelProvider: "openai",
      registry,
      outputHeadroom: {
        selection: selection!,
        headroomTokens: 32,
      },
    });

    expect(out.judgeLlmConfig).toMatchObject({
      model_id: "gpt-5-mini",
      openai_responses_output_headroom_tokens: 32,
      openai_responses_model_max_output_tokens: 128_000,
    });
    expect(out.note).toMatch(/not a benchmark-verified route/);
  });

  // N4 (F6-b closure): a registered-but-role-restricted entry is NOT adoptable
  // as the judge — the request_judge dispatch requires answer_support_judge
  // coverage, which a synthesize-only certification does not grant.
  it("degrades a role-restricted (synthesize-only) model override — registered pair, wrong role", () => {
    const roleRestricted: SupportedModelRegistry = {
      schema_version: "1",
      supported_models: [
        ...registry.supported_models,
        {
          provider: "openai",
          model: "synth-only-model",
          verified_at: "2026-07-04",
          benchmark_evidence_refs: ["development-records/benchmark/z.json"],
          roles: ["semantic_map_synthesize"],
        },
      ],
    };
    const candidate = { provider: "openai" as const, model_id: "synth-only-model", api_key_env: "MY_OPENAI_KEY" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeModelCandidate: candidate,
      judgeModelProvider: "openai",
      registry: roleRestricted,
    });
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5-mini");
    expect(out.note).toMatch(/not a benchmark-verified route/);
  });

  it("degrades (never cross-provider credential leak) when a candidate resolves to a different runtime provider", () => {
    // Defensive: even if a candidate somehow carried a different runtime provider,
    // it must NOT be adopted (would mix the author's api_key_env with another
    // provider's endpoint — the cross-provider wrong-credential dispatch).
    const candidate = { provider: "anthropic" as const, model_id: "claude-opus-4-8", api_key_env: "MY_OPENAI_KEY" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeModelCandidate: candidate,
      judgeModelProvider: "anthropic",
      registry,
    });
    expect(out.judgeLlmConfig?.provider).toBe("openai");
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5-mini");
    expect(out.judgeLlmConfig?.api_key_env).toBe("MY_OPENAI_KEY");
    expect(out.note).toMatch(/requires a different provider/);
  });

  it("inherits the author's effective (pinned) effort across a model swap when no judge effort is given", () => {
    // The candidate is resolved without the author's --effort pin, so it carries
    // the raw settings effort ('medium'); adopting it must NOT downgrade the
    // judge below the author's pinned 'high'.
    const authorHigh = { provider: "openai" as const, model_id: "gpt-5-mini", reasoning_effort: "high" };
    const candidate = { provider: "openai" as const, model_id: "gpt-5.5", reasoning_effort: "medium" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: authorHigh,
      judgeModelCandidate: candidate,
      judgeModelProvider: "openai",
      registry,
    });
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5.5");
    expect(out.judgeLlmConfig?.reasoning_effort).toBe("high");
    expect(out.note).toBeNull();
  });

  it("combines a supported model override with an effort override", () => {
    const candidate = { provider: "openai" as const, model_id: "gpt-5.5", api_key_env: "MY_OPENAI_KEY" };
    const out = resolveJudgeLlmConfig({
      authorLlmConfig: author,
      judgeLlmEffort: "high",
      judgeModelCandidate: candidate,
      judgeModelProvider: "openai",
      registry,
    });
    expect(out.judgeLlmConfig?.model_id).toBe("gpt-5.5");
    expect(out.judgeLlmConfig?.reasoning_effort).toBe("high");
    expect(out.note).toBeNull();
  });
});

// ─── INV-MODEL-1 role-aware B3: semantic-map synthesize wiring seam (§5.4/§5.5) ───
import { resolveSemanticMapSynthesizeWiring } from "./reconstruct-api.js";
import type { OntoSettings } from "../core-runtime/discovery/settings-chain.js";
import { applyReconstructLlmOverride } from "../core-runtime/discovery/llm-override.js";

describe("resolveSemanticMapSynthesizeWiring", () => {
  const haikuSeat = {
    auth: "oauth",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    effort: "low",
  };
  const settingsWith = (args: {
    seat?: boolean;
    optIn?: boolean;
  }): OntoSettings =>
    ({
      reconstruct: {
        execution: {
          ...(args.seat
            ? {
              actors: {
                semantic_map_synthesize: { llm: { ...haikuSeat } },
              },
            }
            : {}),
          ...(args.optIn !== undefined
            ? { semantic_map_authoring: args.optIn }
            : {}),
        },
      },
    }) as unknown as OntoSettings;

  it("no seat: passes only the opt-in through", () => {
    expect(
      resolveSemanticMapSynthesizeWiring({
        settings: settingsWith({ optIn: true }),
        mockRealizationEnabled: true,
      }),
    ).toEqual({ enableSemanticMapAuthoring: true });
    expect(
      resolveSemanticMapSynthesizeWiring({
        settings: settingsWith({}),
        mockRealizationEnabled: true,
      }),
    ).toEqual({ enableSemanticMapAuthoring: false });
  });

  // N11 kernel: seat + opt-in off → dormant note, NO config, NO enable.
  it("dormant seat (opt-in off) yields the honest note and no wiring", () => {
    const wiring = resolveSemanticMapSynthesizeWiring({
      settings: settingsWith({ seat: true, optIn: false }),
      mockRealizationEnabled: false,
    });
    expect(wiring.enableSemanticMapAuthoring).toBe(false);
    expect(wiring.semanticMapSynthesizeLlmConfig).toBeUndefined();
    expect(wiring.dormantSeatNote).toMatch(/dormant/);
  });

  // Mock: identity-only projection — no adapter, no credential resolution.
  it("mock realization takes the identity projection (no provider completion)", () => {
    const wiring = resolveSemanticMapSynthesizeWiring({
      settings: settingsWith({ seat: true, optIn: true }),
      mockRealizationEnabled: true,
    });
    expect(wiring.enableSemanticMapAuthoring).toBe(true);
    expect(wiring.semanticMapSynthesizeLlmConfig).toEqual({
      provider: "anthropic",
      model_id: "claude-haiku-4-5-20251001",
      reasoning_effort: "low",
    });
  });

  // Live: full provider completion — anthropic oauth resolves to the
  // claude_code adapter (auth folded into the adapter; F23).
  it("live realization completes the seat into a provider config with its adapter", () => {
    const wiring = resolveSemanticMapSynthesizeWiring({
      settings: settingsWith({ seat: true, optIn: true }),
      mockRealizationEnabled: false,
    });
    const config = wiring.semanticMapSynthesizeLlmConfig;
    expect(config?.provider).toBe("anthropic");
    expect(config?.model_id).toBe("claude-haiku-4-5-20251001");
    expect(config?.execution_adapter).toBe("claude_code");
    expect(config?.reasoning_effort).toBe("low");
  });

  // §5.2 rank 2 (design v4 §6(a)): the per-call override effort reaches the
  // synthesize seat through the OVERLAID settings — the replacement for the
  // removed request `llmEffort` pin. Effort now lives on the seat's own llm block
  // (never silently weaker/stronger than the pinned run).
  it("the per-call override effort reaches the synthesize seat via the overlay", () => {
    const wiring = resolveSemanticMapSynthesizeWiring({
      settings: applyReconstructLlmOverride(
        settingsWith({ seat: true, optIn: true }),
        { effort: "high" },
      ),
      mockRealizationEnabled: false,
    });
    expect(wiring.semanticMapSynthesizeLlmConfig?.reasoning_effort).toBe("high");
  });
});
