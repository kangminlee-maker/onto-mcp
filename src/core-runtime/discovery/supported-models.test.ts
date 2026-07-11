import { describe, expect, it } from "vitest";
import {
  assertB4BenchCandidateDispatchAllowed,
  assertRepoRelativeEvidenceRefs,
  assertSupportedModelRoutes,
  collectModelSelections,
  exactTrackedMode,
  isSupportedModelRoute,
  parseSupportedModelRegistry,
  RECONSTRUCT_SEMANTIC_MAP_SYNTHESIZE_LLM_ROUTE_PATH,
  requiredSupportedModelRoleForDispatch,
  supportedModelMaxOutputTokens,
  type SupportedModelDispatch,
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
        requiredRole: "author",
      },
      {
        provider: undefined,
        model: "gpt-5.5",
        path: "review.execution.units.lens.llm",
        requiredRole: "author",
      },
    ]);
  });

  it("surfaces a provider-only seat (no model key) so the gate can fail loud", () => {
    expect(
      collectModelSelections({
        review: { execution: { lens: { llm: { provider: "grok" } } } },
      }),
    ).toEqual([
      {
        provider: "grok",
        model: undefined,
        path: "review.execution.lens.llm",
        requiredRole: "author",
      },
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

  it("loads a max output limit with independent provenance", () => {
    const parsed = parseSupportedModelRegistry(
      entry({
        max_output_tokens: 128000,
        max_output_tokens_provenance: "OpenAI API model reference",
      }),
    );
    expect(supportedModelMaxOutputTokens(parsed, "openai", "gpt-5.5"))
      .toBe(128000);
  });

  it("rejects max_output_tokens without provenance", () => {
    expect(() =>
      parseSupportedModelRegistry(entry({ max_output_tokens: 128000 }))
    ).toThrow(/max_output_tokens_provenance/);
  });

  it("rejects an unsafe max_output_tokens capability", () => {
    expect(() =>
      parseSupportedModelRegistry(entry({
        max_output_tokens: Number.MAX_SAFE_INTEGER + 1,
        max_output_tokens_provenance: "provider model reference",
      }))
    ).toThrow();
  });

  it("rejects an unknown field (strict)", () => {
    expect(() =>
      parseSupportedModelRegistry(entry({ context_window: 1050000 }))
    ).toThrow(/Malformed supported-model registry/);
  });

  it("rejects duplicate provider/model authority rows", () => {
    const duplicate = entry({ max_output_tokens: 128000 });
    duplicate.supported_models.push({
      ...duplicate.supported_models[0]!,
      max_output_tokens: 64000,
      max_output_tokens_provenance: "different source",
    });

    expect(() => parseSupportedModelRegistry(duplicate)).toThrow(
      /duplicate supported model pair/,
    );
  });
});

describe("parseSupportedModelRegistry (roles contract)", () => {
  const entry = (extra: Record<string, unknown>) => ({
    schema_version: "1",
    supported_models: [
      {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        verified_at: "2026-07-04",
        benchmark_evidence_refs: ["development-records/benchmark/x.json"],
        ...extra,
      },
    ],
  });

  // Positive pair for the negative controls below: a contracted role loads.
  it("loads an entry restricted to a contracted role", () => {
    const parsed = parseSupportedModelRegistry(
      entry({ roles: ["semantic_map_synthesize"] }),
    );
    expect(parsed.supported_models[0]?.roles).toEqual([
      "semantic_map_synthesize",
    ]);
  });

  it("loads an entry without roles (grandfathered full-route allowance)", () => {
    const parsed = parseSupportedModelRegistry(entry({}));
    expect(parsed.supported_models[0]?.roles).toBeUndefined();
  });

  // N6: a sealed-vocabulary role WITHOUT a defined evidence contract must not
  // be listable — certification cannot outrun its evidence definition.
  it("rejects a vocabulary role without an evidence contract (fail-closed)", () => {
    expect(() =>
      parseSupportedModelRegistry(entry({ roles: ["semantic_map_verify"] }))
    ).toThrow(/without a defined evidence contract/);
  });

  it("rejects an uncontracted role even alongside a contracted one", () => {
    expect(() =>
      parseSupportedModelRegistry(
        entry({ roles: ["semantic_map_synthesize", "answer_support_judge"] }),
      )
    ).toThrow(/answer_support_judge/);
  });

  // N7: an empty roles list is neither grandfathered nor certified — reject.
  it("rejects an empty roles list", () => {
    expect(() => parseSupportedModelRegistry(entry({ roles: [] }))).toThrow(
      /roles/,
    );
  });

  it("rejects a role token outside the sealed vocabulary", () => {
    expect(() =>
      parseSupportedModelRegistry(entry({ roles: ["synthesize"] }))
    ).toThrow(/Malformed supported-model registry/);
  });
});

const JUDGE: SupportedModelDispatch = { kind: "request_judge" };

describe("requiredSupportedModelRoleForDispatch", () => {
  it("maps the reconstruct actor seats to their roles", () => {
    expect(
      requiredSupportedModelRoleForDispatch({
        kind: "settings_path",
        path: "reconstruct.execution.actors.semantic_author.llm",
      }),
    ).toBe("author");
    expect(
      requiredSupportedModelRoleForDispatch({
        kind: "settings_path",
        path: "reconstruct.execution.actors.confirmation_provider.llm",
      }),
    ).toBe("confirmation_provider");
    expect(
      requiredSupportedModelRoleForDispatch({
        kind: "settings_path",
        path: "reconstruct.execution.actors.semantic_map_synthesize.llm",
      }),
    ).toBe("semantic_map_synthesize");
  });

  it("maps the judge dispatch to answer_support_judge", () => {
    expect(requiredSupportedModelRoleForDispatch(JUDGE))
      .toBe("answer_support_judge");
  });

  it("requires the strongest certification (author) for every unmapped path", () => {
    for (
      const path of [
        "review.execution.actors.lens.llm",
        "review.execution.units.lens.llm",
        "review.execution.retry.salvage.transcription_llm",
        "llm",
        "some.future.unmapped.seat.llm",
      ]
    ) {
      expect(requiredSupportedModelRoleForDispatch({ kind: "settings_path", path }))
        .toBe("author");
    }
  });
});

describe("isSupportedModelRoute", () => {
  it("returns true for a registered (provider, model) pair", () => {
    expect(isSupportedModelRoute("openai", "gpt-5.5", registry, JUDGE)).toBe(true);
  });

  it("returns false for an unregistered pair (judge override degrades)", () => {
    expect(isSupportedModelRoute("openai", "gpt-9", registry, JUDGE)).toBe(false);
    expect(isSupportedModelRoute("anthropic", "gpt-5.5", registry, JUDGE))
      .toBe(false);
  });

  it("returns false when provider or model is unresolved", () => {
    expect(isSupportedModelRoute(undefined, "gpt-5.5", registry, JUDGE))
      .toBe(false);
    expect(isSupportedModelRoute("openai", undefined, registry, JUDGE))
      .toBe(false);
  });

  // N4 kernel (F6-b closure): a role-restricted entry is invisible to a
  // dispatch outside its certified roles — the judge override must degrade.
  it("rejects a role-restricted entry at the judge dispatch, and accepts it only at its certified seat", () => {
    const roleRestricted: SupportedModelRegistry = {
      schema_version: "1",
      supported_models: [
        {
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          verified_at: "2026-07-04",
          benchmark_evidence_refs: ["development-records/benchmark/x.json"],
          roles: ["semantic_map_synthesize"],
        },
      ],
    };
    expect(
      isSupportedModelRoute(
        "anthropic",
        "claude-haiku-4-5-20251001",
        roleRestricted,
        JUDGE,
      ),
    ).toBe(false);
    expect(
      isSupportedModelRoute(
        "anthropic",
        "claude-haiku-4-5-20251001",
        roleRestricted,
        {
          kind: "settings_path",
          path: "reconstruct.execution.actors.semantic_map_synthesize.llm",
        },
      ),
    ).toBe(true);
  });
});

/** Route literal with its requiredRole derived exactly as production does. */
const route = (
  provider: string | undefined,
  model: string | undefined,
  path: string,
) => ({
  provider,
  model,
  path,
  requiredRole: requiredSupportedModelRoleForDispatch({
    kind: "settings_path",
    path,
  }),
});

describe("assertSupportedModelRoutes", () => {
  it("passes when every route is a registered (provider, model) pair", () => {
    expect(() =>
      assertSupportedModelRoutes([route("openai", "gpt-5.5", "a")], registry)
    ).not.toThrow();
  });

  it("rejects an unregistered (provider, model) pair", () => {
    expect(() =>
      assertSupportedModelRoutes([route("openai", "gpt-4o", "x")], registry)
    ).toThrow(/not verified as supported[\s\S]*gpt-4o[\s\S]*openai\/gpt-5\.5/);
  });

  it("rejects a registered model under a different provider", () => {
    expect(() =>
      assertSupportedModelRoutes([route("grok", "gpt-5.5", "x")], registry)
    ).toThrow(/grok\/gpt-5\.5/);
  });

  it("rejects a route whose effective provider could not be resolved", () => {
    expect(() =>
      assertSupportedModelRoutes([route(undefined, "gpt-5.5", "x")], registry)
    ).toThrow(/unresolved provider/);
  });

  it("rejects a route whose effective model could not be resolved", () => {
    expect(() =>
      assertSupportedModelRoutes([route("openai", undefined, "x")], registry)
    ).toThrow(/unresolved model/);
  });
});

describe("assertSupportedModelRoutes (role coverage)", () => {
  const SYNTH_SEAT = RECONSTRUCT_SEMANTIC_MAP_SYNTHESIZE_LLM_ROUTE_PATH;
  const AUTHOR_SEAT = "reconstruct.execution.actors.semantic_author.llm";
  const CONFIRM_SEAT = "reconstruct.execution.actors.confirmation_provider.llm";
  const haiku = (path: string) =>
    route("anthropic", "claude-haiku-4-5-20251001", path);
  const roleRestricted: SupportedModelRegistry = {
    schema_version: "1",
    supported_models: [
      {
        provider: "openai",
        model: "gpt-5.5",
        verified_at: "2026-06-13",
        benchmark_evidence_refs: ["development-records/benchmark/x.json"],
      },
      {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        verified_at: "2026-07-04",
        benchmark_evidence_refs: ["development-records/benchmark/y.json"],
        roles: ["semantic_map_synthesize"],
      },
    ],
  };

  // Positive pair: the certified seat passes (the negative controls below can fail).
  it("passes a role-restricted entry at its certified seat", () => {
    expect(() =>
      assertSupportedModelRoutes([haiku(SYNTH_SEAT)], roleRestricted)
    ).not.toThrow();
  });

  // N1: role-restricted model at the author seat → fail-loud with role detail.
  it("rejects a role-restricted entry at the semantic_author seat", () => {
    expect(() => assertSupportedModelRoutes([haiku(AUTHOR_SEAT)], roleRestricted))
      .toThrow(
        /certified for \[semantic_map_synthesize\], seat requires author/,
      );
  });

  // N2: confirmation seat.
  it("rejects a role-restricted entry at the confirmation_provider seat", () => {
    expect(() =>
      assertSupportedModelRoutes([haiku(CONFIRM_SEAT)], roleRestricted)
    ).toThrow(/seat requires confirmation_provider/);
  });

  // N3 (G7/committed-settings scope): review seats are unmapped → author.
  it("rejects a role-restricted entry at a review unit seat (unmapped → author)", () => {
    expect(() =>
      assertSupportedModelRoutes(
        [haiku("review.execution.units.lens.llm")],
        roleRestricted,
      )
    ).toThrow(/seat requires author/);
  });

  // Grandfathered entries keep their full-route allowance everywhere.
  it("passes an absent-roles entry at every seat (grandfathered)", () => {
    expect(() =>
      assertSupportedModelRoutes(
        [
          route("openai", "gpt-5.5", AUTHOR_SEAT),
          route("openai", "gpt-5.5", CONFIRM_SEAT),
          route("openai", "gpt-5.5", SYNTH_SEAT),
          route("openai", "gpt-5.5", "review.execution.units.lens.llm"),
        ],
        roleRestricted,
      )
    ).not.toThrow();
  });

  // N8 kernel: the pair check is preserved — an unregistered model at the
  // synthesize seat still fails on membership, not role.
  it("rejects an unregistered model at the synthesize seat (pair check intact)", () => {
    expect(() =>
      assertSupportedModelRoutes(
        [route("anthropic", "claude-sonnet-5", SYNTH_SEAT)],
        roleRestricted,
      )
    ).toThrow(/anthropic\/claude-sonnet-5/);
  });

  it("allows an explicit unregistered bench candidate only at the exact synthesize path", () => {
    const candidate = route("anthropic", "claude-sonnet-b7-candidate", SYNTH_SEAT);
    expect(() => assertSupportedModelRoutes([candidate], roleRestricted))
      .toThrow(/anthropic\/claude-sonnet-b7-candidate/);
    expect(() =>
      assertSupportedModelRoutes([candidate], roleRestricted, {
        benchCandidates: [{
          provider: "anthropic",
          model: "claude-sonnet-b7-candidate",
          allowedRoutePaths: [SYNTH_SEAT],
        }],
      })
    ).not.toThrow();
    expect(() =>
      assertSupportedModelRoutes(
        [route("anthropic", "claude-sonnet-b7-candidate", AUTHOR_SEAT)],
        roleRestricted,
        {
          benchCandidates: [{
            provider: "anthropic",
            model: "claude-sonnet-b7-candidate",
            allowedRoutePaths: [SYNTH_SEAT],
          }],
        },
      )
    ).toThrow(/anthropic\/claude-sonnet-b7-candidate/);
  });

  it("does not rescue identity mismatches or unresolved routes with the bench option", () => {
    const allowance = {
      provider: "anthropic",
      model: "claude-sonnet-b7-candidate",
      allowedRoutePaths: [SYNTH_SEAT],
    };
    expect(() =>
      assertSupportedModelRoutes(
        [route("openai", "claude-sonnet-b7-candidate", SYNTH_SEAT)],
        roleRestricted,
        { benchCandidates: [allowance] },
      )
    ).toThrow(/openai\/claude-sonnet-b7-candidate/);
    expect(() =>
      assertSupportedModelRoutes(
        [route(undefined, "claude-sonnet-b7-candidate", SYNTH_SEAT)],
        roleRestricted,
        { benchCandidates: [allowance] },
      )
    ).toThrow(/unresolved provider/);
    expect(() =>
      assertSupportedModelRoutes(
        [route("anthropic", undefined, SYNTH_SEAT)],
        roleRestricted,
        { benchCandidates: [allowance] },
      )
    ).toThrow(/unresolved model/);
  });

  it("does not rescue registered role mismatches with the bench option", () => {
    expect(() =>
      assertSupportedModelRoutes([haiku(AUTHOR_SEAT)], roleRestricted, {
        benchCandidates: [{
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          allowedRoutePaths: [AUTHOR_SEAT],
        }],
      })
    ).toThrow(/certified for \[semantic_map_synthesize\], seat requires author/);
  });

  it("gates B4 candidates through normal support first and bench allowance only for unregistered pairs", () => {
    expect(
      assertB4BenchCandidateDispatchAllowed({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        registry: roleRestricted,
      }).allowance,
    ).toBe("registered_supported");
    expect(
      assertB4BenchCandidateDispatchAllowed({
        provider: "anthropic",
        model: "claude-sonnet-b7-candidate",
        registry: roleRestricted,
      }).allowance,
    ).toBe("bench_candidate");
  });

  it("does not let the B4 helper bypass a registered model's missing synthesize role", () => {
    const authorOnly: SupportedModelRegistry = {
      schema_version: "1",
      supported_models: [
        {
          provider: "anthropic",
          model: "claude-sonnet-b7-candidate",
          verified_at: "2026-07-10",
          benchmark_evidence_refs: ["development-records/benchmark/z.json"],
          roles: ["author"],
        },
      ],
    };
    expect(() =>
      assertB4BenchCandidateDispatchAllowed({
        provider: "anthropic",
        model: "claude-sonnet-b7-candidate",
        registry: authorOnly,
      })
    ).toThrow(/certified for \[author\], seat requires semantic_map_synthesize/);
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
        requiredRole: "author",
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
        requiredRole: "author",
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
        requiredRole: "author",
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
        requiredRole: "author",
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
      requiredRole: "author",
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
