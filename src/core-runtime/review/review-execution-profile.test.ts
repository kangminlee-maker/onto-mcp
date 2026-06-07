import { describe, expect, it } from "vitest";
import type { OntoSettings } from "../discovery/settings-chain.js";
import { defaultReviewExecution } from "../discovery/settings-chain.js";
import { resolveReviewExecutionProfile } from "./review-execution-profile.js";
import {
  REVIEW_MOCK_REALIZATION_ENV,
} from "./test-fixtures/mock-realization.js";

function actorOwnedOauthSettings(effort: string) {
  return {
    auth: "oauth" as const,
    provider: "openai" as const,
    model: "gpt-5.5",
    effort,
    service_tier: "fast",
  };
}

function actorOwnedApiSettings(provider: "openai" | "anthropic", model: string) {
  return {
    auth: "api_key" as const,
    provider,
    model,
  };
}

function actorOwnedOpenAiSettingsWithoutAuth(effort: string) {
  return {
    provider: "openai" as const,
    model: "gpt-5.5",
    effort,
  };
}

describe("resolveReviewExecutionProfile", () => {
  it("uses actor-owned llm blocks without root inheritance", () => {
    const execution = defaultReviewExecution();
    const settings: OntoSettings = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          ...execution,
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
      env: { [REVIEW_MOCK_REALIZATION_ENV]: "1" },
    });

    expect(result.type).toBe("resolved");
    if (result.type !== "resolved") return;
    expect(result.profile.teamlead.llm).toEqual(actorOwnedOauthSettings("medium"));
    expect(result.profile.lens.llm).toEqual(actorOwnedOauthSettings("medium"));
    expect(result.profile.synthesize.llm).toEqual(actorOwnedOauthSettings("xhigh"));
  });

  it("honors explicit direct-call executor settings", () => {
    const execution = defaultReviewExecution();
    const settings: OntoSettings = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          ...execution,
          executor: "direct_call",
          teamlead: {
            seat: "main",
            llm: actorOwnedApiSettings("openai", "gpt-5.5"),
          },
          lens: {
            seat: "worker",
            llm: actorOwnedApiSettings("openai", "gpt-5.5"),
          },
          synthesize: {
            seat: "worker",
            llm: actorOwnedApiSettings("openai", "gpt-5.5"),
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
    expect(result.profile.worker_executor).toBe("direct_call");
    expect(result.profile.host).toBe("openai");
  });

  it("honors explicit codex executor settings", () => {
    const execution = defaultReviewExecution();
    const settings: OntoSettings = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          ...execution,
          executor: "codex",
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
            llm: actorOwnedOauthSettings("medium"),
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

  it("defaults omitted OpenAI actor auth to the Codex OAuth route", () => {
    const settings: OntoSettings = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          executor: "auto",
          teamlead: {
            seat: "main",
            llm: actorOwnedOpenAiSettingsWithoutAuth("medium"),
          },
          lens: {
            seat: "worker",
            llm: actorOwnedOpenAiSettingsWithoutAuth("medium"),
          },
          synthesize: {
            seat: "worker",
            llm: actorOwnedOpenAiSettingsWithoutAuth("xhigh"),
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
    expect(result.profile.host).toBe("codex");
    expect(result.profile.auth).toBeUndefined();
  });

  it("carries unit execution settings and resolves partial unit llm overrides", () => {
    const settings: OntoSettings = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          executor: "auto",
          teamlead: {
            seat: "main",
            llm: actorOwnedApiSettings("openai", "gpt-5.5"),
          },
          lens: {
            seat: "worker",
            llm: actorOwnedApiSettings("openai", "gpt-5.5"),
          },
          synthesize: {
            seat: "worker",
            llm: actorOwnedApiSettings("openai", "gpt-5.5"),
          },
          units: {
            lens: {
              llm: {
                model: "gpt-5.5-review-lens",
                effort: "xhigh",
              },
              max_tokens: 12000,
              tool_mode: "native",
              timeout_ms: 600000,
              max_retries: 3,
              retry_initial_delay_ms: 1000,
              max_output_bytes: 262144,
            },
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
    expect(result.profile.worker_executor).toBe("direct_call");
    expect(result.profile.units.lens).toEqual({
      llm: {
        model: "gpt-5.5-review-lens",
        effort: "xhigh",
      },
      max_tokens: 12000,
      tool_mode: "native",
      timeout_ms: 600000,
      max_retries: 3,
      retry_initial_delay_ms: 1000,
      max_output_bytes: 262144,
    });
    expect(result.profile.model).toBeUndefined();
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

  it("rejects mixed actor and unit provider routes", () => {
    const settings: OntoSettings = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          executor: "codex",
          teamlead: {
            seat: "main",
            llm: {
              auth: "oauth",
              provider: "openai",
              model: "gpt-5.5",
              effort: "medium",
            },
          },
          lens: {
            seat: "worker",
            llm: {
              auth: "oauth",
              provider: "openai",
              model: "gpt-5.5",
              effort: "medium",
            },
          },
          synthesize: {
            seat: "worker",
            llm: {
              auth: "oauth",
              provider: "openai",
              model: "gpt-5.5",
              effort: "xhigh",
            },
          },
          units: {
            lens: {
              llm: actorOwnedApiSettings("openai", "gpt-5.5"),
            },
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

  it("allows mixed API direct-call actor provider routes", () => {
    const settings: OntoSettings = {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          executor: "direct_call",
          teamlead: {
            seat: "main",
            llm: actorOwnedApiSettings("openai", "gpt-5.5"),
          },
          lens: {
            seat: "worker",
            llm: actorOwnedApiSettings("openai", "gpt-5.5"),
          },
          synthesize: {
            seat: "worker",
            llm: actorOwnedApiSettings("anthropic", "claude-sonnet-4-6"),
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
    expect(result.profile.worker_executor).toBe("direct_call");
    expect(result.profile.host).toBe("openai");
    expect(result.profile.provider).toBeUndefined();
    expect(result.profile.synthesize.llm).toEqual(
      actorOwnedApiSettings("anthropic", "claude-sonnet-4-6"),
    );
  });
});
