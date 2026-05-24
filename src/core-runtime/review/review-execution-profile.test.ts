import { describe, expect, it } from "vitest";
import type { OntoSettings } from "../discovery/settings-chain.js";
import { defaultReviewExecution } from "../discovery/settings-chain.js";
import { resolveReviewExecutionProfile } from "./review-execution-profile.js";

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
});
