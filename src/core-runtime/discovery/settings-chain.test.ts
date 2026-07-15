import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  REVIEW_EXECUTION_UNIT_IDS,
  defaultReviewExecutionUnits,
  projectSettingsPath,
  readSettingsAt,
  resolveReconstructActorLlmSettings,
  resolveSettingsChain,
  userSettingsPath,
} from "./settings-chain.js";

let scratchRoot = "";
let originalHome: string | undefined;

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function fullOauthLlm(effort: string): Record<string, string> {
  return {
    auth: "oauth",
    provider: "openai",
    model: "gpt-5.5",
    effort,
    service_tier: "fast",
  };
}

function v3ReviewSettings(args?: {
  effort?: string;
  topology?: "main-workers" | "nested-workers";
  teamleadSeat?: "main" | "worker";
  synthesizeLlm?: unknown;
}): Record<string, any> {
  const effort = args?.effort ?? "medium";
  return {
    schema_version: "settings.json/v3",
    review: {
      mode: "core-axis",
      domains: ["software-engineering"],
      context: {
        excluded_names: [".turbo"],
        max_listing_depth: 4,
        max_listing_entries: 250,
        max_embed_lines: 120,
      },
      execution: {
        executor: "auto",
        topology: args?.topology ?? "main-workers",
        deliberation: "controlled-lens-deliberation",
        actors: {
          teamlead: {
            seat: args?.teamleadSeat ?? "main",
            llm: fullOauthLlm(effort),
          },
          lens: {
            seat: "worker",
            llm: fullOauthLlm(effort),
          },
          synthesize: {
            seat: "worker",
            llm: args?.synthesizeLlm ?? fullOauthLlm("xhigh"),
          },
        },
      },
    },
  };
}

describe("resolveSettingsChain", () => {
  beforeEach(() => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-settings-"));
    originalHome = process.env.HOME;
    process.env.HOME = path.join(scratchRoot, "home");
    fs.mkdirSync(process.env.HOME, { recursive: true });
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  it("merges v3 user defaults and project actor-owned settings", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(userSettingsPath(), v3ReviewSettings({ effort: "low" }));
    writeJson(projectSettingsPath(projectRoot), {
      ...v3ReviewSettings({ effort: "high" }),
      review: {
        ...v3ReviewSettings({ effort: "high" }).review,
        mode: "full",
        domains: ["ontology"],
        artifacts: {
          lens_output_format: "sidecar",
          write_lens_markdown: false,
        },
      },
    });

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.schema_version).toBe("settings.json/v3");
    expect(settings.llm).toBeUndefined();
    expect(settings.review_mode).toBe("full");
    expect(settings.domains).toEqual(["ontology"]);
    expect(settings.max_listing_depth).toBe(4);
    expect(settings.review?.execution?.executor).toBe("auto");
    expect(settings.review?.execution?.teamlead?.seat).toBe("main");
    expect(settings.review?.execution?.lens?.seat).toBe("worker");
    expect(settings.review?.execution?.teamlead?.llm).toEqual(fullOauthLlm("high"));
    expect(settings.review?.execution?.synthesize?.llm).toEqual(
      fullOauthLlm("xhigh"),
    );
    expect(settings.review?.artifacts).toEqual({
      lens_output_format: "sidecar",
      write_lens_markdown: false,
    });
  });

  it("accepts v3 review actor llm settings that omit auth and default to OAuth", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      ...v3ReviewSettings(),
      review: {
        ...v3ReviewSettings().review,
        execution: {
          ...v3ReviewSettings().review.execution,
          actors: {
            teamlead: {
              seat: "main",
              llm: {
                provider: "openai",
                model: "gpt-5.5",
                effort: "medium",
                service_tier: "fast",
              },
            },
            lens: {
              seat: "worker",
              llm: {
                provider: "openai",
                model: "gpt-5.5",
                effort: "medium",
                service_tier: "fast",
              },
            },
            synthesize: {
              seat: "worker",
              llm: {
                provider: "openai",
                model: "gpt-5.5",
                effort: "xhigh",
                service_tier: "fast",
              },
            },
          },
        },
      },
    });

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.teamlead?.llm?.auth).toBeUndefined();
    expect(settings.review?.execution?.teamlead?.llm?.provider).toBe("openai");
  });

  it("parses commented v3 settings with reconstruct actor llm blocks", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeText(
      projectSettingsPath(projectRoot),
      `# Project-local onto settings.
{
  "schema_version": "settings.json/v3",
  "review": {
    "execution": {
      "actors": {
        "teamlead": { "seat": "main", "llm": {
          "auth": "oauth", "provider": "openai", "model": "gpt-5.5",
          "effort": "medium", "service_tier": "fast"
        } },
        "lens": { "seat": "worker", "llm": {
          "auth": "oauth", "provider": "openai", "model": "gpt-5.5",
          "effort": "medium", "service_tier": "fast"
        } },
        "synthesize": { "seat": "worker", "llm": {
          "auth": "oauth", "provider": "openai", "model": "gpt-5.5",
          "effort": "medium", "service_tier": "fast"
        } }
      }
    }
  },
  "reconstruct": {
    "execution": {
      "actors": {
        "semantic_author": { "llm": {
          "auth": "oauth", "provider": "openai", "model": "gpt-5.5",
          "effort": "medium", "service_tier": "fast"
        } },
        "confirmation_provider": { "llm": {
          "auth": "oauth", "provider": "openai", "model": "gpt-5.5",
          "effort": "medium", "service_tier": "fast"
        } }
      }
    }
  }
}
`,
    );

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.schema_version).toBe("settings.json/v3");
    expect(settings.review?.execution?.teamlead?.llm).toEqual(
      fullOauthLlm("medium"),
    );
    expect(resolveReconstructActorLlmSettings(settings, "semantic_author"))
      .toEqual(fullOauthLlm("medium"));
    expect(resolveReconstructActorLlmSettings(settings, "confirmation_provider"))
      .toEqual(fullOauthLlm("medium"));
  });

  it("parses review execution retry settings from v3 settings", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings();
    settingsDoc.review.execution.retry = {
      lens_max_retries: 7,
      issue_artifact_max_retries: 2,
      deliberation_max_retries: 5,
      synthesis_max_retries: 1,
      retry_initial_delay_ms: 250,
    };
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.retry).toEqual({
      lens_max_retries: 7,
      issue_artifact_max_retries: 2,
      deliberation_max_retries: 5,
      synthesis_max_retries: 1,
      retry_initial_delay_ms: 250,
      salvage: { enabled: false, delta_completion: "unit_llm" },
      resubmit: { enabled: true },
      dispatch_breaker: {
        enabled: true,
        systemic_threshold: 3,
        per_call_max_attempts: 3,
        backoff_initial_ms: 3000,
        backoff_cap_ms: 30000,
      },
    });
  });

  it("parses opt-in submit salvage settings with a transcription model", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings();
    settingsDoc.review.execution.retry = {
      salvage: {
        enabled: true,
        transcription_llm: { model: "claude-haiku-4-5-20251001" },
      },
    };
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.retry?.salvage).toEqual({
      enabled: true,
      transcription_llm: { model: "claude-haiku-4-5-20251001" },
      delta_completion: "unit_llm",
    });
  });

  it("keeps user-level salvage opt-in and numerics when a project layer sets partial retry", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const userSettings = v3ReviewSettings();
    userSettings.review.execution.retry = {
      lens_max_retries: 7,
      salvage: {
        enabled: true,
        transcription_llm: { model: "claude-haiku-4-5-20251001" },
      },
    };
    const projectSettings = v3ReviewSettings();
    projectSettings.review.execution.retry = {
      synthesis_max_retries: 1,
    };
    writeJson(userSettingsPath(), userSettings);
    writeJson(projectSettingsPath(projectRoot), projectSettings);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    // A project layer that only sets one retry field must not clobber the
    // inherited user-level opt-in (or the user-level numeric overrides) with
    // per-layer defaults.
    expect(settings.review?.execution?.retry).toEqual({
      lens_max_retries: 7,
      issue_artifact_max_retries: 2,
      deliberation_max_retries: 2,
      synthesis_max_retries: 1,
      retry_initial_delay_ms: 3000,
      salvage: {
        enabled: true,
        transcription_llm: { model: "claude-haiku-4-5-20251001" },
        delta_completion: "unit_llm",
      },
      resubmit: { enabled: true },
      dispatch_breaker: {
        enabled: true,
        systemic_threshold: 3,
        per_call_max_attempts: 3,
        backoff_initial_ms: 3000,
        backoff_cap_ms: 30000,
      },
    });
  });

  it("parses an openai-provider salvage transcription model (codex adapter)", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings();
    settingsDoc.review.execution.retry = {
      salvage: {
        enabled: true,
        transcription_llm: { provider: "openai", model: "gpt-5.5-mini" },
      },
    };
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.retry?.salvage).toEqual({
      enabled: true,
      transcription_llm: { provider: "openai", model: "gpt-5.5-mini" },
      delta_completion: "unit_llm",
    });
  });

  it("materializes partial review retry settings into an effective policy", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings();
    settingsDoc.review.execution.retry = {
      lens_max_retries: 3,
    };
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.retry).toEqual({
      lens_max_retries: 3,
      issue_artifact_max_retries: 2,
      deliberation_max_retries: 2,
      synthesis_max_retries: 2,
      retry_initial_delay_ms: 3000,
      salvage: { enabled: false, delta_completion: "unit_llm" },
      resubmit: { enabled: true },
      dispatch_breaker: {
        enabled: true,
        systemic_threshold: 3,
        per_call_max_attempts: 3,
        backoff_initial_ms: 3000,
        backoff_cap_ms: 30000,
      },
    });
  });

  it("keeps a project-file resubmit opt-in through normalize+merge (정정 2026-07-05 회귀 가드)", async () => {
    // definedReviewRetry가 resubmit 복사를 누락해 파일의 opt-in(true)이
    // 기본값(false)으로 소실되던 결함의 실체인 회귀 테스트 — 반드시
    // 파일 → resolveSettingsChain 전 구간을 통과해야 한다.
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings();
    settingsDoc.review.execution.retry = { resubmit: { enabled: true } };
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.retry?.resubmit).toEqual({ enabled: true });
  });

  it("keeps a project-file review dispatch_breaker opt-in through normalize+merge and completes partial fields", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings();
    settingsDoc.review.execution.retry = {
      dispatch_breaker: { enabled: true, systemic_threshold: 2 },
    };
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.retry?.dispatch_breaker).toEqual({
      enabled: true,
      systemic_threshold: 2,
      per_call_max_attempts: 3,
      backoff_initial_ms: 3000,
      backoff_cap_ms: 30000,
    });
  });

  it("keeps a project-file reconstruct dispatch_breaker opt-in through normalize+merge (관찰 모드 ON의 실체인 가드)", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings();
    (settingsDoc as Record<string, any>).reconstruct = {
      execution: { dispatch_breaker: { enabled: true } },
    };
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.reconstruct?.execution?.dispatch_breaker).toEqual({
      enabled: true,
    });
  });

  it("merges review dispatch_breaker deep: a partial project layer must not clobber a user opt-in", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const userSettings = v3ReviewSettings();
    userSettings.review.execution.retry = {
      dispatch_breaker: { enabled: true },
    };
    const projectSettings = v3ReviewSettings();
    projectSettings.review.execution.retry = {
      dispatch_breaker: { systemic_threshold: 5 },
    };
    writeJson(userSettingsPath(), userSettings);
    writeJson(projectSettingsPath(projectRoot), projectSettings);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.retry?.dispatch_breaker).toEqual({
      enabled: true,
      systemic_threshold: 5,
      per_call_max_attempts: 3,
      backoff_initial_ms: 3000,
      backoff_cap_ms: 30000,
    });
  });

  it("provides stage-structured default review unit settings", () => {
    const units = defaultReviewExecutionUnits();

    expect(Object.keys(units).sort()).toEqual([...REVIEW_EXECUTION_UNIT_IDS].sort());
    expect(units.lens).toEqual({
      timeout_ms: 240000,
      max_retries: 2,
      retry_initial_delay_ms: 3000,
      max_output_bytes: 524288,
    });
    expect(units.issue_stance_response?.timeout_ms).toBe(180000);
    expect(units.synthesis_response?.timeout_ms).toBe(180000);
    expect(units.issue_stance_matrix).toEqual({
      timeout_ms: 120000,
      max_output_bytes: 524288,
    });
    expect(units.lens?.llm).toBeUndefined();
  });

  it("keeps checked-in review unit model/effort policy aligned with decision-grade evidence", async () => {
    const evidencePath = path.join(
      process.cwd(),
      "development-records/benchmark/review-unit-effort-all-units-low-medium-high-decision-rerun2-20260610-winner-selection-merged.json",
    );
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8")) as {
      status?: string;
      decision_gate?: { comparison_conclusion_allowed?: boolean };
      selections?: Array<{
        unit_id?: string;
        winner?: { status?: string; effort?: string };
      }>;
    };
    const expectedPolicy = {
      deliberation_plan: "medium",
      deliberation_resolution: "low",
      deliberation_response: "medium",
      finding_ledger: "medium",
      finding_relation_graph: "medium",
      issue_ledger: "medium",
      issue_stance_response: "medium",
      lens: "medium",
      problem_framing: "medium",
      synthesis_response: "medium",
    } as const;

    expect(evidence.status).toBe("decision-grade");
    expect(evidence.decision_gate?.comparison_conclusion_allowed).toBe(true);
    expect(
      Object.fromEntries(
        (evidence.selections ?? []).map((selection) => [
          selection.unit_id,
          selection.winner?.effort,
        ]),
      ),
    ).toEqual(expectedPolicy);
    for (const selection of evidence.selections ?? []) {
      expect(selection.winner?.status).toBe("selected");
    }

    for (const settingsPath of ["settings.example.json", ".onto/settings.json"]) {
      const settings = await readSettingsAt(path.join(process.cwd(), settingsPath));
      for (const [unitId, effort] of Object.entries(expectedPolicy)) {
        const unit =
          settings.review?.execution?.units?.[
            unitId as (typeof REVIEW_EXECUTION_UNIT_IDS)[number]
          ];
        expect(unit?.llm?.model, `${settingsPath}:${unitId}`).toBe("gpt-5.6-sol");
        expect(unit?.llm?.effort, `${settingsPath}:${unitId}`).toBe(effort);
      }
    }
  });

  it("parses review max_concurrent_lenses from project settings", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings();
    settingsDoc.review.execution.max_concurrent_lenses = 3;
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.max_concurrent_lenses).toBe(3);
  });

  it("defaults review execution orchestration owner to runtime", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), v3ReviewSettings());

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.orchestration).toBe("runtime");
  });

  it("resolves review execution orchestration=host with main-workers", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings();
    settingsDoc.review.execution.orchestration = "host";
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.orchestration).toBe("host");
  });

  it("resolves orchestration=host with nested-workers topology (S2 lift)", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings({
      topology: "nested-workers",
      teamleadSeat: "worker",
    });
    settingsDoc.review.execution.orchestration = "host";
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.orchestration).toBe("host");
    expect(settings.review?.execution?.mode).toBe("nested-workers");
  });

  it("parses and merges review unit execution settings", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const userSettings = v3ReviewSettings();
    userSettings.review.execution.units = {
      lens: {
        llm: { effort: "high" },
        max_tokens: 9000,
        tool_mode: "auto",
        timeout_ms: 300000,
        max_retries: 2,
        retry_initial_delay_ms: 1000,
        max_output_bytes: 262144,
      },
    };
    const projectSettings = v3ReviewSettings();
    projectSettings.review.execution.units = {
      lens: {
        llm: { model: "gpt-5.5-review", effort: "xhigh" },
        max_tokens: 12000,
      },
      issue_stance_matrix: {
        timeout_ms: 120000,
        max_output_bytes: 65536,
      },
    };
    writeJson(userSettingsPath(), userSettings);
    writeJson(projectSettingsPath(projectRoot), projectSettings);

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.units?.lens).toEqual({
      llm: {
        effort: "xhigh",
        model: "gpt-5.5-review",
      },
      max_tokens: 12000,
      tool_mode: "auto",
      timeout_ms: 300000,
      max_retries: 2,
      retry_initial_delay_ms: 1000,
      max_output_bytes: 262144,
    });
    expect(settings.review?.execution?.units?.issue_stance_matrix).toEqual({
      timeout_ms: 120000,
      max_output_bytes: 65536,
    });
  });

  it("allows absent settings files without manufacturing legacy defaults", async () => {
    const projectRoot = path.join(scratchRoot, "project");

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings).toEqual({});
  });

  it("fails loudly when settings.json omits the v3 schema version", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      review_mode: "full",
      llm: fullOauthLlm("medium"),
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "Retired onto settings schema detected",
    );
  });

  it("fails loudly when settings.json declares v2", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v2",
      llm: { default: fullOauthLlm("medium") },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "Expected schema_version: settings.json/v3",
    );
  });

  it("rejects root llm in v3 settings", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v3",
      llm: fullOauthLlm("medium"),
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "Invalid onto settings",
    );
  });

  it("rejects actor llm inheritance in v3 settings", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          actors: {
            teamlead: { seat: "main", llm: "inherit" },
          },
        },
      },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "Invalid onto settings",
    );
  });

  it("rejects partial actor llm blocks in v3 settings", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(
      projectSettingsPath(projectRoot),
      v3ReviewSettings({ synthesizeLlm: { effort: "xhigh" } }),
    );

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "Invalid onto settings",
    );
  });

  it("accepts and preserves llm.timeout_ms on a v3 actor llm block", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(
      projectSettingsPath(projectRoot),
      v3ReviewSettings({
        synthesizeLlm: { ...fullOauthLlm("xhigh"), timeout_ms: 1_800_000 },
      }),
    );

    const settings = await resolveSettingsChain("/unused", projectRoot);
    expect(settings.review?.execution?.synthesize?.llm?.timeout_ms).toBe(
      1_800_000,
    );
  });

  it("fails loudly when unsupported YAML config exists", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    fs.mkdirSync(path.join(projectRoot, ".onto"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, ".onto", `config.${"yml"}`),
      "review_mode: full\n",
    );

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "Unsupported onto config file detected",
    );
  });

  it("validates nested-workers seat constraints", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(
      projectSettingsPath(projectRoot),
      v3ReviewSettings({ topology: "nested-workers", teamleadSeat: "main" }),
    );

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "nested-workers requires review.execution.actors.teamlead.seat=worker",
    );
  });

  it("rejects disabling lens markdown outside sidecar artifact mode", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      ...v3ReviewSettings(),
      review: {
        ...v3ReviewSettings().review,
        artifacts: {
          lens_output_format: "markdown",
          write_lens_markdown: false,
        },
      },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "write_lens_markdown=false requires lens_output_format=sidecar",
    );
  });

  it("rejects service_tier outside codex OAuth actor settings", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(
      projectSettingsPath(projectRoot),
      v3ReviewSettings({
        synthesizeLlm: {
          auth: "api_key",
          provider: "openai",
          model: "gpt-5.5",
          effort: "medium",
          service_tier: "fast",
        },
      }),
    );

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "service_tier is only valid on the openai + auth=oauth",
    );
  });

  it("validates unit llm overrides against their effective actor route", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings({
      synthesizeLlm: {
        auth: "api_key",
        provider: "openai",
        model: "gpt-5.5",
      },
    });
    settingsDoc.review.execution.units = {
      synthesis_response: {
        llm: {
          service_tier: "fast",
        },
      },
    };
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "review.execution.units.synthesis_response.llm is invalid",
    );
  });
});

// ─── INV-MODEL-1 role-aware B3: synthesize seat + opt-in source-layer chain ───
import {
  RECONSTRUCT_ACTOR_KEYS,
  collectEffectiveModelRoutes as collectRoutesForSeat,
  isReconstructSemanticMapAuthoringEnabled,
  mergeReconstructSettings,
  resolveOptionalReconstructActorLlmSettings,
  v3ReconstructSettings,
  assertSettingsModelsSupported,
  type OntoSettings as OntoSettingsForSeat,
} from "./settings-chain.js";
import {
  RECONSTRUCT_SEMANTIC_MAP_SYNTHESIZE_LLM_ROUTE_PATH,
} from "./supported-models.js";

describe("reconstruct source-layer structure preservation (design §5.1)", () => {
  const llm = {
    auth: "oauth",
    provider: "openai",
    model: "gpt-5.5",
  } as const;

  // Drift guard ①: normalize preserves EVERY constant-declared actor key plus
  // the declared execution-level scalar — direct call (strict parser bypassed)
  // so a missed copy in v3ReconstructSettings fails here, not silently in prod.
  it("normalize preserves every RECONSTRUCT_ACTOR_KEYS actor and the opt-in scalar", () => {
    const input = {
      execution: {
        actors: Object.fromEntries(
          RECONSTRUCT_ACTOR_KEYS.map((key) => [key, { llm: { ...llm } }]),
        ),
        semantic_map_authoring: true,
      },
    };
    const out = v3ReconstructSettings(input as never);
    for (const key of RECONSTRUCT_ACTOR_KEYS) {
      expect(out?.execution?.actors?.[key]?.llm, key).toEqual(llm);
    }
    expect(out?.execution?.semantic_map_authoring).toBe(true);
  });

  // Drift guard ② (F19 negative pair): a scalar-only block — actors entirely
  // absent — must SURVIVE normalize (the old code early-returned undefined).
  it("normalize preserves a scalar-only block with actors absent (P4 kernel)", () => {
    const out = v3ReconstructSettings(
      { execution: { semantic_map_authoring: true } } as never,
    );
    expect(out).toEqual({ execution: { semantic_map_authoring: true } });
  });

  // Drift guard ③: merge iterates every actor key (project > user per actor)
  // and preserves the scalar across sides even with actors on one side only.
  it("merge preserves every actor key and the opt-in scalar across sides", () => {
    const userSide = {
      execution: {
        semantic_map_authoring: true,
        actors: {
          semantic_map_synthesize: {
            llm: { ...llm, provider: "anthropic", model: "claude-haiku-4-5-20251001" },
          },
        },
      },
    };
    const projectSide = {
      execution: {
        actors: Object.fromEntries(
          RECONSTRUCT_ACTOR_KEYS.filter((k) => k !== "semantic_map_synthesize")
            .map((key) => [key, { llm: { ...llm } }]),
        ),
      },
    };
    const out = mergeReconstructSettings(
      userSide as never,
      projectSide as never,
    );
    for (const key of RECONSTRUCT_ACTOR_KEYS) {
      expect(out?.execution?.actors?.[key], key).toBeDefined();
    }
    expect(out?.execution?.semantic_map_authoring).toBe(true);
    expect(out?.execution?.actors?.semantic_map_synthesize?.llm.model)
      .toBe("claude-haiku-4-5-20251001");
  });

  it("merge: project wins per actor; scalar project > user", () => {
    const userSide = {
      execution: {
        semantic_map_authoring: true,
        actors: { semantic_author: { llm: { ...llm, effort: "low" } } },
      },
    };
    const projectSide = {
      execution: {
        semantic_map_authoring: false,
        actors: { semantic_author: { llm: { ...llm, effort: "high" } } },
      },
    };
    const out = mergeReconstructSettings(userSide as never, projectSide as never);
    expect(out?.execution?.actors?.semantic_author?.llm.effort).toBe("high");
    expect(out?.execution?.semantic_map_authoring).toBe(false);
  });

  // Byte-parity guard (§7): the legacy two-actor input produces EXACTLY the
  // legacy output shape — no extra keys introduced by the restructure.
  it("keeps the legacy two-actor normalize output shape byte-stable", () => {
    const out = v3ReconstructSettings(
      {
        execution: {
          actors: {
            semantic_author: { llm: { ...llm } },
            confirmation_provider: { llm: { ...llm } },
          },
        },
      } as never,
    );
    expect(out).toEqual({
      execution: {
        actors: {
          semantic_author: { llm },
          confirmation_provider: { llm },
        },
      },
    });
    expect(Object.keys(out?.execution ?? {})).toEqual(["actors"]);
    expect(
      v3ReconstructSettings({ execution: {} } as never),
    ).toBeUndefined();
    expect(v3ReconstructSettings(undefined)).toBeUndefined();
  });
});

describe("synthesize seat + opt-in through real settings files (P1/N12/P4/U6/N8)", () => {
  beforeEach(() => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-settings-seat-"));
    originalHome = process.env.HOME;
    process.env.HOME = path.join(scratchRoot, "home");
    fs.mkdirSync(process.env.HOME, { recursive: true });
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  const SYNTH_SEAT_PATH = RECONSTRUCT_SEMANTIC_MAP_SYNTHESIZE_LLM_ROUTE_PATH;
  const haikuLlm = {
    auth: "oauth",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    effort: "low",
  };
  const gptLlm = {
    auth: "oauth",
    provider: "openai",
    model: "gpt-5.5",
    effort: "medium",
    service_tier: "fast",
  };
  const reconstructBlock = (withSeat: boolean, optIn: boolean | undefined) => ({
    execution: {
      actors: {
        semantic_author: { llm: { ...gptLlm } },
        confirmation_provider: { llm: { ...gptLlm } },
        ...(withSeat ? { semantic_map_synthesize: { llm: { ...haikuLlm } } } : {}),
      },
      ...(optIn !== undefined ? { semantic_map_authoring: optIn } : {}),
    },
  });

  // P1 (BLOCKER-1 recurrence guard): the seat written to a REAL project
  // settings file survives parse → normalize → merge, reaches the resolver AND
  // the gate walk with its role.
  it("P1: project-file seat survives resolveSettingsChain to resolver and gate walk", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v3",
      reconstruct: reconstructBlock(true, true),
    });
    const settings = await resolveSettingsChain("/unused", projectRoot);
    expect(resolveOptionalReconstructActorLlmSettings(
      settings,
      "semantic_map_synthesize",
    )).toEqual(haikuLlm);
    expect(isReconstructSemanticMapAuthoringEnabled(settings)).toBe(true);
    const route = collectRoutesForSeat(settings).find((r) =>
      r.path === SYNTH_SEAT_PATH
    );
    expect(route).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      path: SYNTH_SEAT_PATH,
      requiredRole: "semantic_map_synthesize",
    });
  });

  it("P1 (user-level variant): user-file seat survives the chain", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    fs.mkdirSync(projectRoot, { recursive: true });
    writeJson(userSettingsPath(), {
      schema_version: "settings.json/v3",
      reconstruct: reconstructBlock(true, true),
    });
    const settings = await resolveSettingsChain("/unused", projectRoot);
    expect(resolveOptionalReconstructActorLlmSettings(
      settings,
      "semantic_map_synthesize",
    )).toEqual(haikuLlm);
    expect(isReconstructSemanticMapAuthoringEnabled(settings)).toBe(true);
  });

  // N12 (R2-02 closure): the opt-in scalar set ONLY at user level survives the
  // merge with project-level actors (the old merge rebuilt {actors} only).
  it("N12: user-level opt-in survives merge with project-level actors", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(userSettingsPath(), {
      schema_version: "settings.json/v3",
      reconstruct: { execution: { semantic_map_authoring: true } },
    });
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v3",
      reconstruct: reconstructBlock(false, undefined),
    });
    const settings = await resolveSettingsChain("/unused", projectRoot);
    expect(isReconstructSemanticMapAuthoringEnabled(settings)).toBe(true);
    expect(
      resolveReconstructActorLlmSettings(settings, "semantic_author"),
    ).toEqual(gptLlm);
  });

  // P4: opt-in only, NO actors anywhere — survives (F19 file-level pair).
  it("P4: opt-in-only settings (no actors) survive the chain", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v3",
      reconstruct: { execution: { semantic_map_authoring: true } },
    });
    const settings = await resolveSettingsChain("/unused", projectRoot);
    expect(isReconstructSemanticMapAuthoringEnabled(settings)).toBe(true);
  });

  // U6 pair: dormant seat (opt-in off) is EXCLUDED from the gate walk;
  // flipping the opt-in on brings it in (fail-loud from then on).
  it("U6: dormant seat (opt-in off) is excluded from the gate walk", () => {
    const settings = {
      reconstruct: reconstructBlock(true, false),
    } as unknown as OntoSettingsForSeat;
    expect(
      collectRoutesForSeat(settings).find((r) => r.path === SYNTH_SEAT_PATH),
    ).toBeUndefined();
  });

  it("U6 pair: the same seat with opt-in on IS in the gate walk", () => {
    const settings = {
      reconstruct: reconstructBlock(true, true),
    } as unknown as OntoSettingsForSeat;
    const synthRoutes = collectRoutesForSeat(settings).filter((r) =>
      r.path === SYNTH_SEAT_PATH
    );
    expect(synthRoutes).toHaveLength(1);
    expect(synthRoutes[0]?.requiredRole).toBe("semantic_map_synthesize");
  });

  // N8 pair against the REAL install registry (anthropic/claude-haiku is not
  // registered): live gate throws only when the seat can dispatch (opt-in on).
  it("N8: unregistered model in an active synthesize seat fails the live gate", () => {
    const settings = {
      reconstruct: reconstructBlock(true, true),
    } as unknown as OntoSettingsForSeat;
    expect(() => assertSettingsModelsSupported(settings))
      .toThrow(/anthropic\/claude-haiku-4-5-20251001/);
  });

  it("N8 pair: the same unregistered seat passes while dormant (opt-in off)", () => {
    const settings = {
      reconstruct: reconstructBlock(true, false),
    } as unknown as OntoSettingsForSeat;
    expect(() => assertSettingsModelsSupported(settings)).not.toThrow();
  });

  it("B7: explicit bench option reaches the active synthesize route only", () => {
    const candidateModel = "claude-sonnet-b7-candidate";
    const settings = {
      reconstruct: {
        execution: {
          actors: {
            semantic_author: { llm: { ...gptLlm } },
            confirmation_provider: { llm: { ...gptLlm } },
            semantic_map_synthesize: {
              llm: { ...haikuLlm, model: candidateModel },
            },
          },
          semantic_map_authoring: true,
        },
      },
    } as unknown as OntoSettingsForSeat;
    const synthRoutes = collectRoutesForSeat(settings).filter((r) =>
      r.path === SYNTH_SEAT_PATH
    );
    expect(synthRoutes).toHaveLength(1);
    expect(synthRoutes[0]).toMatchObject({
      provider: "anthropic",
      model: candidateModel,
      requiredRole: "semantic_map_synthesize",
    });
    expect(() => assertSettingsModelsSupported(settings)).toThrow(
      /anthropic\/claude-sonnet-b7-candidate/,
    );
    expect(() =>
      assertSettingsModelsSupported(settings, {
        benchCandidates: [{
          provider: "anthropic",
          model: candidateModel,
          allowedRoutePaths: [SYNTH_SEAT_PATH],
        }],
      })
    ).not.toThrow();
  });
});
