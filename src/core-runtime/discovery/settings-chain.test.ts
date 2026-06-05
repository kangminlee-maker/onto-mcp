import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
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
          "effort": "xhigh", "service_tier": "fast"
        } }
      }
    }
  },
  "reconstruct": {
    "execution": {
      "actors": {
        "semantic_author": { "llm": {
          "auth": "oauth", "provider": "openai", "model": "gpt-5.5",
          "effort": "high", "service_tier": "fast"
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
      .toEqual(fullOauthLlm("high"));
    expect(resolveReconstructActorLlmSettings(settings, "confirmation_provider"))
      .toEqual(fullOauthLlm("medium"));
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
      "service_tier is codex-only",
    );
  });
});
