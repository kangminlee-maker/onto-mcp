import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  REVIEW_EXECUTION_UNIT_IDS,
  defaultReviewExecutionUnits,
  projectSettingsPath,
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

  it("rejects orchestration=host with nested-workers topology (fail-closed)", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    const settingsDoc = v3ReviewSettings({
      topology: "nested-workers",
      teamleadSeat: "worker",
    });
    settingsDoc.review.execution.orchestration = "host";
    writeJson(projectSettingsPath(projectRoot), settingsDoc);

    await expect(
      resolveSettingsChain("/unused", projectRoot),
    ).rejects.toThrow(/orchestration=host/);
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
      "service_tier requires the external OAuth worker route",
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
