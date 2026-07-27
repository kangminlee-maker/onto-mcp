import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectCodexBinaryAvailable } from "../discovery/host-detection.js";
import {
  defaultReviewExecution,
  OntoSettingsValidationError,
} from "../discovery/settings-chain.js";
import type {
  InvocationBindingArtifact,
  InvocationInterpretationArtifact,
} from "../review/artifact-types.js";
import { readYamlDocument } from "../review/review-artifact-utils.js";
import { REVIEW_RUNNER_WARNING_PREFIX } from "../review/review-runner-warning.js";
import {
  ensureProviderRouteReadyForDispatch,
  resolveExecutionRealizationHandoff,
  resolveReviewInvokeSetup,
} from "./review-invoke.js";
import { reviewPrepareOnly } from "./review-invocation-runner.js";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";
import {
  REVIEW_MOCK_REALIZATION_ENV,
  setTemporaryEnv,
} from "../review/test-fixtures/mock-realization.js";

const originalEnv = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
}

function createTmpHome(): { home: string; cleanup: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "onto-review-auto-"));
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  return {
    home,
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
  };
}

function createTmpProjectWithTarget(
  relativeTarget: string,
  content: string,
): { projectRoot: string; cleanup: () => void } {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-review-target-"));
  const targetPath = path.join(projectRoot, relativeTarget);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
  return {
    projectRoot,
    cleanup: () => fs.rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("review invoke execution auto-resolution", () => {
  let tmp: { home: string; cleanup: () => void } | null = null;

  beforeEach(() => {
    tmp = createTmpHome();
    process.env.HOME = tmp.home;
    process.env.PATH = "/tmp/onto-missing-bin";
    delete process.env.ONTO_HOST_RUNTIME;
    delete process.env[REVIEW_MOCK_REALIZATION_ENV];
    delete process.env.CLAUDECODE;
  });

  afterEach(() => {
    tmp?.cleanup();
    tmp = null;
    restoreEnv();
  });

  it("detects unavailable Codex when binary or auth is missing", () => {
    expect(detectCodexBinaryAvailable()).toBe(false);
  });

  it("uses API-key settings as direct-call self execution", () => {
    const execution = defaultReviewExecution();
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      ontoConfig: {
        review: {
          execution: {
            ...execution,
            executor: "direct_call",
            teamlead: {
              seat: "main",
              llm: {
                auth: "api_key",
                provider: "anthropic",
                model: "claude-sonnet-4-6",
              },
            },
            lens: {
              seat: "worker",
              llm: {
                auth: "api_key",
                provider: "anthropic",
                model: "claude-sonnet-4-6",
              },
            },
            synthesize: {
              seat: "worker",
              llm: {
                auth: "api_key",
                provider: "anthropic",
                model: "claude-sonnet-4-6",
              },
            },
          },
        },
      },
    });

    expect(out.type).toBe("self");
    if (out.type === "self") {
      expect(out.profile.execution_realization).toBe("direct-call");
      expect(out.profile.host_runtime).toBe("anthropic");
    }
  });

  it("accepts Codex auth OPENAI_API_KEY during direct-call pre-dispatch checks", async () => {
    delete process.env.OPENAI_API_KEY;
    fs.writeFileSync(
      path.join(tmp!.home, ".codex", "auth.json"),
      JSON.stringify({ OPENAI_API_KEY: "codex-auth-key" }),
      "utf8",
    );
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-route-ready-"));
    const profile: ReviewExecutionProfile = {
      mode: "main-workers",
      teamlead: {
        seat: "main",
        llm: { auth: "api_key", provider: "openai", model: "gpt-5.5" },
      },
      lens: {
        seat: "worker",
        llm: { auth: "api_key", provider: "openai", model: "gpt-5.5" },
      },
      synthesize: {
        seat: "worker",
        llm: { auth: "api_key", provider: "openai", model: "gpt-5.5" },
      },
      deliberation: "controlled-lens-deliberation",
      worker_executor: "direct_call",
      host: "openai",
      auth: "api_key",
      provider: "openai",
      model: "gpt-5.5",
      trace: [],
    };

    try {
      await expect(
        ensureProviderRouteReadyForDispatch({
          sessionRoot,
          executionPlanPath: path.join(sessionRoot, "execution-plan.yaml"),
          reviewExecutionProfile: profile,
        }),
      ).resolves.toBeUndefined();
    } finally {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  it("ignores blank Codex auth OPENAI_API_KEY during direct-call pre-dispatch checks", async () => {
    delete process.env.OPENAI_API_KEY;
    fs.writeFileSync(
      path.join(tmp!.home, ".codex", "auth.json"),
      JSON.stringify({ OPENAI_API_KEY: "   " }),
      "utf8",
    );
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-route-ready-"));
    const profile: ReviewExecutionProfile = {
      mode: "main-workers",
      teamlead: {
        seat: "main",
        llm: { auth: "api_key", provider: "openai", model: "gpt-5.5" },
      },
      lens: {
        seat: "worker",
        llm: { auth: "api_key", provider: "openai", model: "gpt-5.5" },
      },
      synthesize: {
        seat: "worker",
        llm: { auth: "api_key", provider: "openai", model: "gpt-5.5" },
      },
      deliberation: "controlled-lens-deliberation",
      worker_executor: "direct_call",
      host: "openai",
      auth: "api_key",
      provider: "openai",
      model: "gpt-5.5",
      trace: [],
    };

    try {
      await expect(
        ensureProviderRouteReadyForDispatch({
          sessionRoot,
          executionPlanPath: path.join(sessionRoot, "execution-plan.yaml"),
          reviewExecutionProfile: profile,
        }),
      ).rejects.toThrow(
        "Review direct-call route cannot dispatch because the provider credential environment variable is missing.",
      );
    } finally {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  it("requires exact custom api_key_env during direct-call pre-dispatch checks", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.CUSTOM_OPENAI_API_KEY;
    fs.writeFileSync(
      path.join(tmp!.home, ".codex", "auth.json"),
      JSON.stringify({ OPENAI_API_KEY: "codex-auth-key" }),
      "utf8",
    );
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-route-ready-"));
    const profile: ReviewExecutionProfile = {
      mode: "main-workers",
      teamlead: {
        seat: "main",
        llm: {
          auth: "api_key",
          provider: "openai",
          model: "gpt-5.5",
          api_key_env: "CUSTOM_OPENAI_API_KEY",
        },
      },
      lens: {
        seat: "worker",
        llm: {
          auth: "api_key",
          provider: "openai",
          model: "gpt-5.5",
          api_key_env: "CUSTOM_OPENAI_API_KEY",
        },
      },
      synthesize: {
        seat: "worker",
        llm: {
          auth: "api_key",
          provider: "openai",
          model: "gpt-5.5",
          api_key_env: "CUSTOM_OPENAI_API_KEY",
        },
      },
      deliberation: "controlled-lens-deliberation",
      worker_executor: "direct_call",
      host: "openai",
      auth: "api_key",
      provider: "openai",
      model: "gpt-5.5",
      trace: [],
    };

    try {
      await expect(
        ensureProviderRouteReadyForDispatch({
          sessionRoot,
          executionPlanPath: path.join(sessionRoot, "execution-plan.yaml"),
          reviewExecutionProfile: profile,
        }),
      ).rejects.toThrow(
        "Review direct-call route cannot dispatch because the provider credential environment variable is missing.",
      );
      const failureFiles = fs.readdirSync(path.join(sessionRoot, "failures"));
      const failure = await readYamlDocument<Record<string, unknown>>(
        path.join(sessionRoot, "failures", failureFiles[0]!),
      );
      expect(failure.details).toMatchObject({
        credential_env_names: ["CUSTOM_OPENAI_API_KEY"],
      });
    } finally {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  it("uses local LM Studio settings as direct-call self execution", () => {
    const execution = defaultReviewExecution();
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      ontoConfig: {
        review: {
          execution: {
            ...execution,
            executor: "direct_call",
            teamlead: {
              seat: "main",
              llm: {
                auth: "local",
                provider: "lmstudio",
                model: "llama-8b",
                base_url: "http://127.0.0.1:1234/v1",
              },
            },
            lens: {
              seat: "worker",
              llm: {
                auth: "local",
                provider: "lmstudio",
                model: "llama-8b",
                base_url: "http://127.0.0.1:1234/v1",
              },
            },
            synthesize: {
              seat: "worker",
              llm: {
                auth: "local",
                provider: "lmstudio",
                model: "llama-8b",
                base_url: "http://127.0.0.1:1234/v1",
              },
            },
          },
        },
      },
    });

    expect(out.type).toBe("self");
    if (out.type === "self") {
      expect(out.profile.execution_realization).toBe("direct-call");
      expect(out.profile.host_runtime).toBe("lmstudio");
    }
  });

  it("fails loud for retired Claude host runtime selection", () => {
    process.env.ONTO_HOST_RUNTIME = "claude";
    const out = resolveExecutionRealizationHandoff({
      explicitCodex: false,
      ontoConfig: {},
    });

    expect(out).toEqual({ type: "no_host" });
  });

  it("uses Codex worker when binary and auth are available", () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-codex-bin-"));
    const fakeCodex = path.join(binDir, "codex");
    fs.writeFileSync(fakeCodex, "#!/bin/sh\n");
    fs.chmodSync(fakeCodex, 0o755);
    process.env.PATH = binDir;
    fs.writeFileSync(path.join(tmp!.home, ".codex", "auth.json"), "{}");

    try {
      const out = resolveExecutionRealizationHandoff({
        explicitCodex: false,
        ontoConfig: {},
      });

      expect(out.type).toBe("self");
      if (out.type === "self") {
        expect(out.profile.execution_realization).toBe("worker");
        expect(out.profile.host_runtime).toBe("codex");
      }
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  });

  it("infers a review domain from the target when no domain is configured", async () => {
    const project = createTmpProjectWithTarget(
      ".onto/processes/review/auto-domain.md",
      [
        "# Review contract update",
        "",
        "This target changes ontology review binding semantics, canonical concepts, and domain document selection.",
      ].join("\n"),
    );
    try {
      fs.mkdirSync(path.join(project.projectRoot, ".onto"), { recursive: true });
      fs.writeFileSync(
        path.join(project.projectRoot, ".onto", "settings.json"),
        JSON.stringify(
          {
            schema_version: "settings.json/v3",
            review: {
              execution: {
                topology: "main-workers",
                executor: "direct_call",
                deliberation: "controlled-lens-deliberation",
                actors: {
                  teamlead: {
                    seat: "main",
                    llm: {
                      auth: "api_key",
                      provider: "openai",
                      model: "mock-model",
                    },
                  },
                  lens: {
                    seat: "worker",
                    llm: {
                      auth: "api_key",
                      provider: "openai",
                      model: "mock-model",
                    },
                  },
                  synthesize: {
                    seat: "worker",
                    llm: {
                      auth: "api_key",
                      provider: "openai",
                      model: "mock-model",
                    },
                  },
                },
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      const restoreRouteEnv = setTemporaryEnv({
        OPENAI_API_KEY: "test-openai-key",
      });
      try {
        const result = await reviewPrepareOnly([
          ".onto/processes/review/auto-domain.md",
          "Review the ontology runtime contract domain selection behavior.",
          "--project-root",
          project.projectRoot,
          "--onto-home",
          path.resolve("."),
          "--review-mode",
          "core-axis",
          "--lens-id",
          "logic",
        ]);
        const binding = await readYamlDocument<InvocationBindingArtifact>(
          path.join(result.session_root, "binding.yaml"),
        );
        const interpretation =
          await readYamlDocument<InvocationInterpretationArtifact>(
            path.join(result.session_root, "interpretation.yaml"),
          );

        expect(binding.resolved_session_domain).toBe("ontology");
        expect(binding.domain_final_selection.selection_mode).toBe("target_inferred");
        expect(binding.binding_notes.join("\n")).toContain("Selected @ontology");
        expect(interpretation.domain_recommendation).toBe("@ontology");
        expect(interpretation.domain_selection_required).toBe(false);
      } finally {
        restoreRouteEnv();
      }
    } finally {
      project.cleanup();
    }
  });
});

describe("review invoke llmOverride seat guard", () => {
  let tmp: { home: string; cleanup: () => void } | null = null;

  beforeEach(() => {
    tmp = createTmpHome();
    process.env.HOME = tmp.home;
    process.env.PATH = "/tmp/onto-missing-bin";
    delete process.env.ONTO_HOST_RUNTIME;
    delete process.env[REVIEW_MOCK_REALIZATION_ENV];
    delete process.env.CLAUDECODE;
  });

  afterEach(() => {
    tmp?.cleanup();
    tmp = null;
    restoreEnv();
  });

  // One override, one argv, two settings files: the ONLY difference is whether
  // the review seats carry an `llm` block. The pair is the control — without it
  // a passing guard proves nothing, because a zero-seat override used to be
  // indistinguishable from a successful one all the way to dispatch.
  const unsupportedAnthropicOverride = JSON.stringify({
    provider: "anthropic",
    auth: "oauth",
    model: "claude-not-benchmarked",
  });

  async function resolveWithOverride(projectRoot: string): Promise<unknown> {
    return resolveReviewInvokeSetup([
      "README.md",
      "Review the target.",
      "--project-root",
      projectRoot,
      "--llm-override",
      unsupportedAnthropicOverride,
    ]);
  }

  function writeProjectSettings(projectRoot: string, settings: unknown): void {
    fs.mkdirSync(path.join(projectRoot, ".onto"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, ".onto", "settings.json"),
      JSON.stringify(settings, null, 2),
      "utf8",
    );
  }

  it("fails loud when the override reaches no configured seat", async () => {
    const project = createTmpProjectWithTarget("README.md", "# target\n");
    try {
      // A seat-less chain: review settings exist, but no actor carries an llm
      // block, so the overlay has nothing to apply.
      writeProjectSettings(project.projectRoot, {
        schema_version: "settings.json/v3",
        review: { mode: "full" },
      });
      let thrown: unknown;
      try {
        await resolveWithOverride(project.projectRoot);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(OntoSettingsValidationError);
      expect(
        (thrown as OntoSettingsValidationError).failureRecord.reason_code,
      ).toBe("llm_override_reached_no_seat");
    } finally {
      project.cleanup();
    }
  });

  it("passes the seat guard and reaches the model-support gate when seats are configured", async () => {
    const project = createTmpProjectWithTarget("README.md", "# target\n");
    try {
      const actor = (seat: string) => ({
        seat,
        llm: { auth: "api_key", provider: "openai", model: "mock-model" },
      });
      writeProjectSettings(project.projectRoot, {
        schema_version: "settings.json/v3",
        review: {
          mode: "full",
          execution: {
            topology: "main-workers",
            executor: "direct_call",
            deliberation: "controlled-lens-deliberation",
            actors: {
              teamlead: actor("main"),
              lens: actor("worker"),
              synthesize: actor("worker"),
            },
          },
        },
      });
      let thrown: unknown;
      try {
        await resolveWithOverride(project.projectRoot);
      } catch (error) {
        thrown = error;
      }
      // The SAME override now lands on three seats, so the seat guard is silent
      // and the next gate — supported models, walking a non-empty seat set —
      // rejects the unverified model instead.
      expect(thrown).toBeInstanceOf(OntoSettingsValidationError);
      expect(
        (thrown as OntoSettingsValidationError).failureRecord.reason_code,
      ).toBe("settings_unsupported_model");
    } finally {
      project.cleanup();
    }
  });

  it("discloses the seats reached, the seats dropped, and the effective billing mode", async () => {
    const project = createTmpProjectWithTarget("README.md", "# target\n");
    const restoreRouteEnv = setTemporaryEnv({ OPENAI_API_KEY: "test-openai-key" });
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((arg) => String(arg)).join(" "));
    };
    try {
      const actor = (seat: string) => ({
        seat,
        llm: { auth: "api_key", provider: "openai", model: "gpt-5.5" },
      });
      writeProjectSettings(project.projectRoot, {
        schema_version: "settings.json/v3",
        review: {
          mode: "core-axis",
          execution: {
            topology: "main-workers",
            executor: "direct_call",
            deliberation: "controlled-lens-deliberation",
            actors: {
              teamlead: actor("main"),
              lens: actor("worker"),
              synthesize: actor("worker"),
            },
            units: { lens: { llm: { model: "gpt-5.5", effort: "low" } } },
          },
        },
      });
      await resolveReviewInvokeSetup([
        "README.md",
        "Review the target.",
        "--project-root",
        project.projectRoot,
        "--onto-home",
        path.resolve("."),
        "--review-mode",
        "core-axis",
        "--lens-id",
        "logic",
        "--llm-override",
        JSON.stringify({ effort: "high" }),
      ]);
      const disclosure = warnings.find((line) => line.includes("llmOverride applied"));
      expect(disclosure).toBeDefined();
      // Emitted on the harvested channel, so it reaches the caller as an
      // environment warning rather than dying on an unread stream.
      expect(disclosure).toContain(REVIEW_RUNNER_WARNING_PREFIX);
      expect(disclosure).toContain("applied to 4 review seat(s)");
      expect(disclosure).toContain("review.execution.units.lens.llm");
      // A same-route override drops nothing, so the dropped clause is absent.
      expect(disclosure).not.toContain("dropped to inherit");
      // The billing consequence of the resolved route, stated at call time.
      expect(disclosure).toContain("billing_mode=per_token");
    } finally {
      console.warn = originalWarn;
      restoreRouteEnv();
      project.cleanup();
    }
  });
});
