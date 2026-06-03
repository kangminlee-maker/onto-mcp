import { describe, expect, it } from "vitest";
import type { OntoSettings } from "../discovery/settings-chain.js";
import { defaultReviewExecution } from "../discovery/settings-chain.js";
import { resolveReviewExecutionProfile } from "./review-execution-profile.js";

function actorOwnedOauthSettings(effort: string) {
  return {
    auth: "oauth" as const,
    provider: "openai" as const,
    model: "gpt-5.5",
    effort,
    service_tier: "fast",
  };
}

describe("resolveReviewExecutionProfile", () => {
  it("overlays actor llm partials on the root llm selection", () => {
    const execution = defaultReviewExecution();
    const settings: OntoSettings = {
      llm: {
        auth: "oauth",
        provider: "openai",
        model: "gpt-5.5",
        effort: "medium",
        service_tier: "fast",
      },
      review: {
        execution: {
          ...execution,
          synthesize: {
            seat: "worker",
            llm: {
              effort: "xhigh",
            },
          },
        },
      },
    };

    const result = resolveReviewExecutionProfile({
      explicitCodex: false,
      settings,
      env: { ONTO_LLM_MOCK: "1" },
    });

    expect(result.type).toBe("resolved");
    if (result.type !== "resolved") return;
    expect(result.profile.teamlead.llm).toEqual(settings.llm);
    expect(result.profile.lens.llm).toEqual(settings.llm);
    expect(result.profile.synthesize.llm).toEqual({
      auth: "oauth",
      provider: "openai",
      model: "gpt-5.5",
      effort: "xhigh",
      service_tier: "fast",
    });
  });

  it("honors explicit direct-call executor settings", () => {
    const execution = defaultReviewExecution();
    const settings: OntoSettings = {
      llm: {
        auth: "api_key",
        provider: "openai",
        model: "gpt-5.5",
      },
      review: {
        execution: {
          ...execution,
          executor: "direct_call",
        },
      },
    };

    const result = resolveReviewExecutionProfile({
      explicitCodex: false,
      settings,
      codexAvailable: true,
      env: {},
    });

    expect(result.type).toBe("resolved");
    if (result.type !== "resolved") return;
    expect(result.profile.worker_executor).toBe("direct_call");
    expect(result.profile.host).toBe("openai");
  });

  it("honors explicit codex executor settings", () => {
    const execution = defaultReviewExecution();
    const settings: OntoSettings = {
      llm: {
        auth: "oauth",
        provider: "openai",
        model: "gpt-5.5",
      },
      review: {
        execution: {
          ...execution,
          executor: "codex",
        },
      },
    };

    const result = resolveReviewExecutionProfile({
      explicitCodex: false,
      settings,
      codexAvailable: true,
      env: {},
    });

    expect(result.type).toBe("resolved");
    if (result.type !== "resolved") return;
    expect(result.profile.worker_executor).toBe("codex");
    expect(result.profile.host).toBe("codex");
  });

  it("auto-selects codex from v3 actor-owned OAuth settings", () => {
    const settings: OntoSettings = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          executor: "auto",
          teamlead: {
            seat: "main",
            llm: actorOwnedOauthSettings("medium"),
          },
          lens: {
            seat: "worker",
            llm: actorOwnedOauthSettings("medium"),
          },
          synthesize: {
            seat: "worker",
            llm: actorOwnedOauthSettings("xhigh"),
          },
        },
      },
    };

    const result = resolveReviewExecutionProfile({
      explicitCodex: false,
      settings,
      codexAvailable: true,
      env: {},
    });

    expect(result.type).toBe("resolved");
    if (result.type !== "resolved") return;
    expect(result.profile.worker_executor).toBe("codex");
    expect(result.profile.teamlead.llm).toEqual(actorOwnedOauthSettings("medium"));
    expect(result.profile.synthesize.llm).toEqual(actorOwnedOauthSettings("xhigh"));
  });

  it("rejects mixed actor provider routes", () => {
    const settings: OntoSettings = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          executor: "auto",
          teamlead: {
            seat: "main",
            llm: actorOwnedOauthSettings("medium"),
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
            llm: actorOwnedOauthSettings("xhigh"),
          },
        },
      },
    };

    const result = resolveReviewExecutionProfile({
      explicitCodex: false,
      settings,
      codexAvailable: true,
      env: {},
    });

    expect(result.type).toBe("no_host");
    if (result.type !== "no_host") return;
    expect(result.reason).toContain("different executor routes");
  });
});
