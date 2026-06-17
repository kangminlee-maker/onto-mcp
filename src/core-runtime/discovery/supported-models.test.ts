import { describe, expect, it } from "vitest";
import {
  assertRepoRelativeEvidenceRefs,
  assertSupportedModelRoutes,
  collectModelSelections,
  exactTrackedMode,
  isSupportedModelRoute,
  parseSupportedModelRegistry,
  type SupportedModelRegistry,
} from "./supported-models.js";
import {
  assertSettingsModelsSupported,
  collectEffectiveModelRoutes,
  type OntoSettings,
} from "./settings-chain.js";

const registry: SupportedModelRegistry = {
  schema_version: "1",
  supported_models: [
    {
      provider: "openai",
      model: "gpt-5.5",
      verified_at: "2026-06-13",
      benchmark_evidence_refs: ["development-records/benchmark/x.json"],
    },
  ],
};

describe("collectModelSelections", () => {
  it("finds every model selection with its path", () => {
    expect(
      collectModelSelections({
        review: {
          execution: {
            actors: { teamlead: { llm: { provider: "openai", model: "gpt-5.5" } } },
            units: { lens: { llm: { model: "gpt-5.5" } } },
          },
        },
      }),
    ).toEqual([
      {
        provider: "openai",
        model: "gpt-5.5",
        path: "review.execution.actors.teamlead.llm",
      },
      {
        provider: undefined,
        model: "gpt-5.5",
        path: "review.execution.units.lens.llm",
      },
    ]);
  });

  it("surfaces a provider-only seat (no model key) so the gate can fail loud", () => {
    expect(
      collectModelSelections({
        review: { execution: { lens: { llm: { provider: "grok" } } } },
      }),
    ).toEqual([
      { provider: "grok", model: undefined, path: "review.execution.lens.llm" },
    ]);
  });
});

describe("assertRepoRelativeEvidenceRefs", () => {
  const withRef = (ref: string): SupportedModelRegistry => ({
    schema_version: "1",
    supported_models: [
      {
        provider: "openai",
        model: "gpt-5.5",
        verified_at: "2026-06-13",
        benchmark_evidence_refs: [ref],
      },
    ],
  });

  it("accepts a repo-relative evidence ref", () => {
    expect(() =>
      assertRepoRelativeEvidenceRefs(withRef("development-records/benchmark/x.json"))
    ).not.toThrow();
  });

  it("rejects an absolute evidence ref", () => {
    expect(() => assertRepoRelativeEvidenceRefs(withRef("/etc/passwd")))
      .toThrow(/repo-relative[\s\S]*\/etc\/passwd/);
  });

  it("rejects an escaping evidence ref", () => {
    expect(() => assertRepoRelativeEvidenceRefs(withRef("../../outside.json")))
      .toThrow(/repo-relative[\s\S]*outside\.json/);
  });

  it("rejects a bare '..' evidence ref", () => {
    expect(() => assertRepoRelativeEvidenceRefs(withRef("..")))
      .toThrow(/repo-relative/);
  });

  it("rejects a git pathspec-magic evidence ref", () => {
    expect(() =>
      assertRepoRelativeEvidenceRefs(withRef(":(glob)development-records/**"))
    ).toThrow(/repo-relative[\s\S]*development-records/);
  });

  it("aggregates every offending ref into one error", () => {
    expect(() =>
      assertRepoRelativeEvidenceRefs({
        schema_version: "1",
        supported_models: [
          {
            provider: "openai",
            model: "gpt-5.5",
            verified_at: "2026-06-13",
            benchmark_evidence_refs: ["/abs/one.json", "../two.json"],
          },
        ],
      })
    ).toThrow(/one\.json[\s\S]*two\.json/);
  });
});

describe("exactTrackedMode", () => {
  it("returns the index mode when an entry path equals the ref", () => {
    const stdout = "100644 abc123 0\tdevelopment-records/benchmark/x.json\0";
    expect(exactTrackedMode(stdout, "development-records/benchmark/x.json"))
      .toBe("100644");
  });

  it("returns null for a directory ref whose listing is its child files", () => {
    const stdout =
      "100644 a 0\tdevelopment-records/benchmark/x.json\0" +
      "100644 b 0\tdevelopment-records/benchmark/y.json\0";
    expect(exactTrackedMode(stdout, "development-records/benchmark")).toBeNull();
  });

  it("surfaces a symlink mode for an exact match (guard rejects 120000)", () => {
    expect(exactTrackedMode("120000 a 0\tlink.json\0", "link.json")).toBe("120000");
  });

  it("returns null for untracked (empty) output", () => {
    expect(exactTrackedMode("", "anything.json")).toBeNull();
  });
});

describe("parseSupportedModelRegistry (context_window_tokens contract)", () => {
  const entry = (extra: Record<string, unknown>) => ({
    schema_version: "1",
    supported_models: [
      {
        provider: "openai",
        model: "gpt-5.5",
        verified_at: "2026-06-13",
        benchmark_evidence_refs: ["development-records/benchmark/x.json"],
        ...extra,
      },
    ],
  });

  it("loads an entry without a context window (FLOOR fallback path)", () => {
    const parsed = parseSupportedModelRegistry(entry({}));
    expect(parsed.supported_models[0]?.context_window_tokens).toBeUndefined();
  });

  it("loads an entry with a positive integer window and its provenance", () => {
    const parsed = parseSupportedModelRegistry(
      entry({
        context_window_tokens: 1050000,
        context_window_provenance: "OpenAI API model reference",
      }),
    );
    expect(parsed.supported_models[0]?.context_window_tokens).toBe(1050000);
    expect(parsed.supported_models[0]?.context_window_provenance)
      .toBe("OpenAI API model reference");
  });

  it("rejects a zero window", () => {
    expect(() =>
      parseSupportedModelRegistry(
        entry({ context_window_tokens: 0, context_window_provenance: "src" }),
      )
    ).toThrow(/context_window_tokens/);
  });

  it("rejects a negative window", () => {
    expect(() =>
      parseSupportedModelRegistry(
        entry({ context_window_tokens: -1, context_window_provenance: "src" }),
      )
    ).toThrow(/context_window_tokens/);
  });

  it("rejects a non-integer window", () => {
    expect(() =>
      parseSupportedModelRegistry(
        entry({ context_window_tokens: 1024.5, context_window_provenance: "src" }),
      )
    ).toThrow(/context_window_tokens/);
  });

  it("rejects a window value without provenance (no unsourced window)", () => {
    expect(() =>
      parseSupportedModelRegistry(entry({ context_window_tokens: 1050000 }))
    ).toThrow(/context_window_provenance/);
  });

  it("rejects an unknown field (strict)", () => {
    expect(() =>
      parseSupportedModelRegistry(entry({ context_window: 1050000 }))
    ).toThrow(/Malformed supported-model registry/);
  });
});

describe("isSupportedModelRoute", () => {
  it("returns true for a registered (provider, model) pair", () => {
    expect(isSupportedModelRoute("openai", "gpt-5.5", registry)).toBe(true);
  });

  it("returns false for an unregistered pair (judge override degrades)", () => {
    expect(isSupportedModelRoute("openai", "gpt-9", registry)).toBe(false);
    expect(isSupportedModelRoute("anthropic", "gpt-5.5", registry)).toBe(false);
  });

  it("returns false when provider or model is unresolved", () => {
    expect(isSupportedModelRoute(undefined, "gpt-5.5", registry)).toBe(false);
    expect(isSupportedModelRoute("openai", undefined, registry)).toBe(false);
  });
});

describe("assertSupportedModelRoutes", () => {
  it("passes when every route is a registered (provider, model) pair", () => {
    expect(() =>
      assertSupportedModelRoutes(
        [{ provider: "openai", model: "gpt-5.5", path: "a" }],
        registry,
      )
    ).not.toThrow();
  });

  it("rejects an unregistered (provider, model) pair", () => {
    expect(() =>
      assertSupportedModelRoutes(
        [{ provider: "openai", model: "gpt-4o", path: "x" }],
        registry,
      )
    ).toThrow(/not verified as supported[\s\S]*gpt-4o[\s\S]*openai\/gpt-5\.5/);
  });

  it("rejects a registered model under a different provider", () => {
    expect(() =>
      assertSupportedModelRoutes(
        [{ provider: "grok", model: "gpt-5.5", path: "x" }],
        registry,
      )
    ).toThrow(/grok\/gpt-5\.5/);
  });

  it("rejects a route whose effective provider could not be resolved", () => {
    expect(() =>
      assertSupportedModelRoutes(
        [{ provider: undefined, model: "gpt-5.5", path: "x" }],
        registry,
      )
    ).toThrow(/unresolved provider/);
  });

  it("rejects a route whose effective model could not be resolved", () => {
    expect(() =>
      assertSupportedModelRoutes(
        [{ provider: "openai", model: undefined, path: "x" }],
        registry,
      )
    ).toThrow(/unresolved model/);
  });
});

describe("collectEffectiveModelRoutes (inheritance)", () => {
  function review(actorProvider: string) {
    return {
      review: {
        execution: {
          actors: { lens: { llm: { provider: actorProvider, model: "gpt-5.5" } } },
          // provider-less unit override inherits the default actor's provider
          units: { lens: { llm: { model: "gpt-5.5" } } },
        },
      },
    } as unknown as OntoSettings;
  }

  it("resolves a provider-less unit override to its inherited actor provider", () => {
    const routes = collectEffectiveModelRoutes(review("openai"));
    const unit = routes.find((r) =>
      r.path === "review.execution.units.lens.llm"
    );
    expect(unit?.provider).toBe("openai");
    expect(() => assertSupportedModelRoutes(routes, registry)).not.toThrow();
  });

  it("rejects when the inherited provider is unverified for the model", () => {
    const routes = collectEffectiveModelRoutes(review("grok"));
    expect(routes.find((r) => r.path === "review.execution.units.lens.llm")?.provider)
      .toBe("grok");
    expect(() => assertSupportedModelRoutes(routes, registry)).toThrow(/grok\/gpt-5\.5/);
  });

  // Provider-only unit override (no model key) — collectModelSelections cannot
  // see it, but the runtime merges it over the actor and dispatches the
  // effective (override provider, actor model). The gate must validate that.
  function providerOnlyUnit(unitProvider: string) {
    return {
      review: {
        execution: {
          actors: { lens: { llm: { provider: "openai", model: "gpt-5.5" } } },
          units: { lens: { llm: { provider: unitProvider } } },
        },
      },
    } as unknown as OntoSettings;
  }

  it("resolves a provider-only unit override to its inherited actor model", () => {
    const routes = collectEffectiveModelRoutes(providerOnlyUnit("openai"));
    expect(routes.find((r) => r.path === "review.execution.units.lens.llm"))
      .toEqual({
        provider: "openai",
        model: "gpt-5.5",
        path: "review.execution.units.lens.llm",
      });
    expect(() => assertSupportedModelRoutes(routes, registry)).not.toThrow();
  });

  it("rejects a provider-only unit override whose provider is unverified for the inherited model", () => {
    const routes = collectEffectiveModelRoutes(providerOnlyUnit("grok"));
    expect(routes.find((r) => r.path === "review.execution.units.lens.llm"))
      .toEqual({
        provider: "grok",
        model: "gpt-5.5",
        path: "review.execution.units.lens.llm",
      });
    expect(() => assertSupportedModelRoutes(routes, registry)).toThrow(/grok\/gpt-5\.5/);
  });

  it("flags a provider-only review actor (no model) as unresolved", () => {
    // A provider-only actor is dispatch-capable: the runtime would run it with
    // the worker's default model. collectModelSelections surfaces it; the gate
    // must fail loud rather than silently skip it.
    const routes = collectEffectiveModelRoutes({
      review: { execution: { lens: { llm: { provider: "grok" } } } },
    } as unknown as OntoSettings);
    expect(routes.find((r) => r.path === "review.execution.lens.llm"))
      .toEqual({
        provider: "grok",
        model: undefined,
        path: "review.execution.lens.llm",
      });
    expect(() => assertSupportedModelRoutes(routes, registry))
      .toThrow(/unresolved model/);
  });

  it("flags a provider-only unit override with no resolvable model as unresolved", () => {
    // Actor has provider but no model, unit overrides provider only → the runtime
    // would dispatch (grok, worker-default-model); the gate must fail loud.
    const routes = collectEffectiveModelRoutes({
      review: {
        execution: {
          actors: { lens: { llm: { provider: "openai" } } },
          units: { lens: { llm: { provider: "grok" } } },
        },
      },
    } as unknown as OntoSettings);
    expect(routes.find((r) => r.path === "review.execution.units.lens.llm"))
      .toEqual({
        provider: "grok",
        model: undefined,
        path: "review.execution.units.lens.llm",
      });
    expect(() => assertSupportedModelRoutes(routes, registry))
      .toThrow(/unresolved model/);
  });

  it("resolves a provider-less salvage transcription (enabled) to the default provider (anthropic)", () => {
    const routes = collectEffectiveModelRoutes({
      review: {
        execution: {
          retry: {
            salvage: { enabled: true, transcription_llm: { model: "claude-haiku" } },
          },
        },
      },
    } as unknown as OntoSettings);
    expect(
      routes.find((r) =>
        r.path === "review.execution.retry.salvage.transcription_llm"
      ),
    ).toEqual({
      provider: "anthropic",
      model: "claude-haiku",
      path: "review.execution.retry.salvage.transcription_llm",
    });
  });

  it("passes the gate for an enabled salvage transcription with a verified explicit route", () => {
    const routes = collectEffectiveModelRoutes({
      review: {
        execution: {
          retry: {
            salvage: {
              enabled: true,
              transcription_llm: { provider: "openai", model: "gpt-5.5" },
            },
          },
        },
      },
    } as unknown as OntoSettings);
    expect(() => assertSupportedModelRoutes(routes, registry)).not.toThrow();
  });

  it("rejects a provider-less enabled salvage transcription whose inherited route is unverified", () => {
    const routes = collectEffectiveModelRoutes({
      review: {
        execution: {
          retry: {
            salvage: { enabled: true, transcription_llm: { model: "claude-haiku" } },
          },
        },
      },
    } as unknown as OntoSettings);
    expect(() => assertSupportedModelRoutes(routes, registry))
      .toThrow(/anthropic\/claude-haiku/);
  });

  it("excludes a disabled salvage transcription from the gate (not dispatched)", () => {
    const routes = collectEffectiveModelRoutes({
      review: {
        execution: {
          retry: {
            salvage: { enabled: false, transcription_llm: { model: "claude-haiku" } },
          },
        },
      },
    } as unknown as OntoSettings);
    expect(
      routes.find((r) =>
        r.path === "review.execution.retry.salvage.transcription_llm"
      ),
    ).toBeUndefined();
    expect(() => assertSupportedModelRoutes(routes, registry)).not.toThrow();
  });
});

// The standalone gate loads the install-root authority registry (committed seed:
// openai/gpt-5.5). It is the one validator both the runtime live-execution path
// and the G7 CI guard call, so they cannot diverge.
describe("assertSettingsModelsSupported (standalone gate, real registry)", () => {
  it("passes settings that select only benchmark-verified routes", () => {
    expect(() =>
      assertSettingsModelsSupported({
        review: {
          execution: {
            actors: { teamlead: { llm: { provider: "openai", model: "gpt-5.5" } } },
          },
        },
      } as unknown as OntoSettings)
    ).not.toThrow();
  });

  it("throws OntoSettingsValidationError on an unverified route", () => {
    expect(() =>
      assertSettingsModelsSupported({
        review: {
          execution: {
            actors: { teamlead: { llm: { provider: "grok", model: "gpt-5.5" } } },
          },
        },
      } as unknown as OntoSettings)
    ).toThrow(/not verified as supported[\s\S]*grok\/gpt-5\.5/);
  });
});
