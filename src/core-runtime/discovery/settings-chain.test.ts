import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  projectSettingsPath,
  resolveSettingsChain,
  userSettingsPath,
} from "./settings-chain.js";

let scratchRoot = "";
let originalHome: string | undefined;

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
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

  it("merges user defaults and project settings", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(userSettingsPath(), {
      domains: ["software-engineering"],
      llm: {
        auth: "oauth",
        provider: "openai",
        model: "gpt-5.5",
        effort: "medium",
      },
    });
    writeJson(projectSettingsPath(projectRoot), {
      domains: ["ontology"],
      review_mode: "full",
      llm: {
        service_tier: "fast",
      },
      review: {
        execution: {
          mode: "main-workers",
        },
      },
    });

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.domains).toEqual(["ontology"]);
    expect(settings.review_mode).toBe("full");
    expect(settings.llm?.model).toBe("gpt-5.5");
    expect(settings.llm?.effort).toBe("medium");
    expect(settings.llm?.service_tier).toBe("fast");
    expect(settings.review?.execution?.mode).toBe("main-workers");
    expect(settings.review?.execution?.teamlead?.seat).toBe("main");
    expect(settings.review?.execution?.lens?.seat).toBe("worker");
    expect(settings.review?.execution?.synthesize?.seat).toBe("worker");
    expect(settings.review?.execution?.synthesize?.llm).toBe("inherit");
  });

  it("normalizes v2 settings into the runtime projection", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v2",
      llm: {
        default: {
          auth: "oauth",
          provider: "openai",
          model: "gpt-5.5",
          effort: "medium",
          service_tier: "fast",
        },
      },
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
          executor: "codex",
          topology: "main-workers",
          actors: {
            teamlead: { seat: "main" },
            lens: { seat: "worker" },
            synthesize: {
              seat: "worker",
              llm: { effort: "xhigh" },
            },
          },
          deliberation: "controlled-lens-deliberation",
        },
      },
    });

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.schema_version).toBe("settings.json/v2");
    expect(settings.llm?.model).toBe("gpt-5.5");
    expect(settings.review_mode).toBe("core-axis");
    expect(settings.domains).toEqual(["software-engineering"]);
    expect(settings.max_listing_depth).toBe(4);
    expect(settings.review?.mode).toBe("core-axis");
    expect(settings.review?.context?.excluded_names).toEqual([".turbo"]);
    expect(settings.review?.execution?.executor).toBe("codex");
    expect(settings.review?.execution?.mode).toBe("main-workers");
    expect(settings.review?.execution?.synthesize?.llm).toEqual({
      effort: "xhigh",
    });
  });

  it("keeps user execution settings when project v2 only changes review mode", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(userSettingsPath(), {
      schema_version: "settings.json/v2",
      llm: {
        default: {
          auth: "oauth",
          provider: "openai",
          model: "gpt-5.5",
        },
      },
      review: {
        execution: {
          executor: "codex",
          topology: "nested-workers",
          actors: {
            teamlead: {
              seat: "worker",
              llm: { effort: "high" },
            },
            lens: { seat: "worker" },
            synthesize: {
              seat: "worker",
              llm: { effort: "xhigh" },
            },
          },
        },
      },
    });
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v2",
      review: {
        mode: "core-axis",
      },
    });

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review_mode).toBe("core-axis");
    expect(settings.review?.execution?.executor).toBe("codex");
    expect(settings.review?.execution?.mode).toBe("nested-workers");
    expect(settings.review?.execution?.teamlead?.seat).toBe("worker");
    expect(settings.review?.execution?.teamlead?.llm).toEqual({
      effort: "high",
    });
    expect(settings.review?.execution?.synthesize?.llm).toEqual({
      effort: "xhigh",
    });
  });

  it("fails loudly when unsupported YAML config exists", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    fs.mkdirSync(path.join(projectRoot, ".onto"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, ".onto", `config.${"yml"}`), "review_mode: full\n");

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "Unsupported onto config file detected",
    );
  });

  it("rejects old review axis keys in settings.json", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      review: {
        teamlead: { model: "main" },
      },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "Invalid onto settings",
    );
  });

  it("validates nested-workers seat constraints", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v2",
      review: {
        execution: {
          topology: "nested-workers",
          actors: {
            teamlead: { seat: "main" },
            lens: { seat: "worker" },
          },
        },
      },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "nested-workers requires review.execution.actors.teamlead.seat=worker",
    );
  });

  it("merges synthesize actor settings independently", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(userSettingsPath(), {
      llm: {
        auth: "oauth",
        provider: "openai",
        model: "gpt-5.5",
        effort: "medium",
      },
      review: {
        execution: {
          mode: "main-workers",
          synthesize: {
            seat: "worker",
            llm: {
              auth: "oauth",
              provider: "openai",
              model: "gpt-5.5",
              effort: "xhigh",
              service_tier: "fast",
            },
          },
        },
      },
    });
    writeJson(projectSettingsPath(projectRoot), {
      review: {
        execution: {
          synthesize: {
            seat: "worker",
            llm: {
              effort: "high",
            },
          },
        },
      },
    });

    const settings = await resolveSettingsChain("/unused", projectRoot);

    expect(settings.review?.execution?.synthesize?.seat).toBe("worker");
    expect(settings.review?.execution?.synthesize?.llm).toEqual({
      auth: "oauth",
      provider: "openai",
      model: "gpt-5.5",
      effort: "high",
      service_tier: "fast",
    });
  });

  it("requires synthesize seat to stay worker", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v2",
      review: {
        execution: {
          actors: {
            synthesize: { seat: "main" },
          },
        },
      },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "review.execution.actors.synthesize.seat must be worker",
    );
  });

  it("requires actor llm partials to inherit from llm.default", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      schema_version: "settings.json/v2",
      review: {
        execution: {
          actors: {
            synthesize: {
              seat: "worker",
              llm: {
                effort: "xhigh",
              },
            },
          },
        },
      },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "review.execution.actors.synthesize.llm must provide provider/auth fields or inherit from llm.default",
    );
  });

  it("rejects service_tier outside codex OAuth settings", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      llm: {
        auth: "api_key",
        provider: "openai",
        model: "gpt-5.5",
        effort: "medium",
        service_tier: "fast",
      },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "service_tier is codex-only",
    );
  });
});
