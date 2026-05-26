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
    expect(settings.review?.execution.mode).toBe("main-workers");
    expect(settings.review?.execution.teamlead.seat).toBe("main");
    expect(settings.review?.execution.lens.seat).toBe("worker");
    expect(settings.review?.execution.synthesize.seat).toBe("worker");
    expect(settings.review?.execution.synthesize.llm).toBe("inherit");
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
      review: {
        execution: {
          mode: "nested-workers",
          teamlead: { seat: "main" },
          lens: { seat: "worker" },
        },
      },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "nested-workers requires review.execution.teamlead.seat=worker",
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

    expect(settings.review?.execution.synthesize.seat).toBe("worker");
    expect(settings.review?.execution.synthesize.llm).toEqual({
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
      review: {
        execution: {
          synthesize: { seat: "main" },
        },
      },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "review.execution.synthesize.seat must be worker",
    );
  });

  it("requires actor llm partials to inherit from a root llm", async () => {
    const projectRoot = path.join(scratchRoot, "project");
    writeJson(projectSettingsPath(projectRoot), {
      review: {
        execution: {
          synthesize: {
            seat: "worker",
            llm: {
              effort: "xhigh",
            },
          },
        },
      },
    });

    await expect(resolveSettingsChain("/unused", projectRoot)).rejects.toThrow(
      "review.execution.synthesize.llm must provide llm.provider or inherit from root llm",
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
      "llm.service_tier is codex-only",
    );
  });
});
