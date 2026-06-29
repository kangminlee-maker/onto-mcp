import { describe, expect, it } from "vitest";
import {
  defaultReviewExecution,
  type ResolvedReviewExecutionSettings,
} from "../discovery/settings-chain.js";
import {
  parseSupportedModelRegistry,
  type SupportedModelRegistry,
} from "../discovery/supported-models.js";
import { deriveWorkbookInventoryPromptCaps } from "../spreadsheet-structure-observer.js";
import {
  BASELINE_WINDOW_TOKENS,
  DEFAULT_MAX_EMBED_LINES,
  MAX_WINDOW_MULTIPLIER,
  deriveReviewMaxEmbedLines,
  resolveReviewLensContextWindowTokens,
  reviewWindowMultiplier,
} from "./review-prompt-budget.js";

// A fixture registry built through the real shape-validator, so the test
// exercises the same (provider, model) → context_window_tokens lookup the
// runtime uses. The real authority only ships ~1M models, so SYNTHETIC
// sub-baseline windows (100k, 400k) drive the proportional gradient, plus a 1M
// model to prove a scaled (non-no-op) budget.
function fixtureRegistry(): SupportedModelRegistry {
  return parseSupportedModelRegistry({
    schema_version: "1",
    supported_models: [
      {
        provider: "openai",
        model: "synth-100k",
        verified_at: "2026-01-01",
        benchmark_evidence_refs: ["development-records/bench/synth-100k.md"],
        context_window_tokens: 100_000,
        context_window_provenance: "fixture",
      },
      {
        provider: "openai",
        model: "synth-400k",
        verified_at: "2026-01-01",
        benchmark_evidence_refs: ["development-records/bench/synth-400k.md"],
        context_window_tokens: 400_000,
        context_window_provenance: "fixture",
      },
      {
        provider: "openai",
        model: "synth-1m",
        verified_at: "2026-01-01",
        benchmark_evidence_refs: ["development-records/bench/synth-1m.md"],
        context_window_tokens: 1_000_000,
        context_window_provenance: "fixture",
      },
      {
        // A registered model WITHOUT a context window → resolves to undefined.
        provider: "anthropic",
        model: "no-window",
        verified_at: "2026-01-01",
        benchmark_evidence_refs: ["development-records/bench/no-window.md"],
      },
    ],
  });
}

/** A resolved execution whose lens actor points at a given model (or none). */
function lensExecution(
  lensModel: { provider: string; model: string } | undefined,
  unitOverrides?: ResolvedReviewExecutionSettings["units"],
): ResolvedReviewExecutionSettings {
  const base = defaultReviewExecution();
  return {
    ...base,
    lens: {
      ...base.lens,
      ...(lensModel ? { llm: { provider: lensModel.provider as never, model: lensModel.model } } : {}),
    },
    units: { ...base.units, ...(unitOverrides ?? {}) },
  };
}

describe("reviewWindowMultiplier", () => {
  it("undefined window → 1 (no regression)", () => {
    expect(reviewWindowMultiplier(undefined)).toBe(1);
  });

  it("window at or below BASELINE → floored to 1", () => {
    expect(reviewWindowMultiplier(BASELINE_WINDOW_TOKENS)).toBe(1);
    expect(reviewWindowMultiplier(BASELINE_WINDOW_TOKENS - 50_000)).toBe(1);
    expect(reviewWindowMultiplier(1)).toBe(1);
  });

  it("mid window → proportional (window / BASELINE)", () => {
    // 400k / 200k = 2.0
    expect(reviewWindowMultiplier(400_000)).toBeCloseTo(2, 10);
    // 300k / 200k = 1.5
    expect(reviewWindowMultiplier(300_000)).toBeCloseTo(1.5, 10);
  });

  it("huge window → clamped to MAX_WINDOW_MULTIPLIER", () => {
    expect(reviewWindowMultiplier(1_000_000)).toBe(MAX_WINDOW_MULTIPLIER);
    expect(reviewWindowMultiplier(10_000_000)).toBe(MAX_WINDOW_MULTIPLIER);
  });
});

describe("deriveReviewMaxEmbedLines", () => {
  it("multiplier 1 → default (no regression)", () => {
    expect(deriveReviewMaxEmbedLines(1, DEFAULT_MAX_EMBED_LINES)).toBe(
      DEFAULT_MAX_EMBED_LINES,
    );
  });

  it("scales (round) with the multiplier", () => {
    expect(deriveReviewMaxEmbedLines(1.5, DEFAULT_MAX_EMBED_LINES)).toBe(
      Math.round(DEFAULT_MAX_EMBED_LINES * 1.5),
    );
    expect(deriveReviewMaxEmbedLines(2, DEFAULT_MAX_EMBED_LINES)).toBe(
      DEFAULT_MAX_EMBED_LINES * 2,
    );
  });

  it("floors at default (a sub-1 multiplier never reduces below DEFAULT)", () => {
    expect(deriveReviewMaxEmbedLines(0.1, DEFAULT_MAX_EMBED_LINES)).toBe(
      DEFAULT_MAX_EMBED_LINES,
    );
  });

  it("ceilings at default * MAX_WINDOW_MULTIPLIER", () => {
    expect(deriveReviewMaxEmbedLines(100, DEFAULT_MAX_EMBED_LINES)).toBe(
      DEFAULT_MAX_EMBED_LINES * MAX_WINDOW_MULTIPLIER,
    );
  });
});

describe("resolveReviewLensContextWindowTokens", () => {
  const registry = fixtureRegistry();

  it("resolves the lens model's registered window", () => {
    const exec = lensExecution({ provider: "openai", model: "synth-400k" });
    expect(resolveReviewLensContextWindowTokens(exec, registry)).toBe(400_000);
  });

  it("no lens model selected → undefined (no regression)", () => {
    const exec = lensExecution(undefined);
    expect(resolveReviewLensContextWindowTokens(exec, registry)).toBeUndefined();
  });

  it("lens model not in registry → undefined", () => {
    const exec = lensExecution({ provider: "openai", model: "unregistered" });
    expect(resolveReviewLensContextWindowTokens(exec, registry)).toBeUndefined();
  });

  it("registered model without a context window → undefined", () => {
    const exec = lensExecution({ provider: "anthropic", model: "no-window" });
    expect(resolveReviewLensContextWindowTokens(exec, registry)).toBeUndefined();
  });

  it("takes the MIN window across lens-class unit overrides", () => {
    // lens actor = synth-1m (1M); a lens-CLASS unit (issue_stance_response)
    // overrides to synth-100k. MIN(1M, 100k) = 100k — the safe pick that cannot
    // overflow the smaller-window lens.
    const exec = lensExecution(
      { provider: "openai", model: "synth-1m" },
      {
        issue_stance_response: {
          llm: { provider: "openai" as never, model: "synth-100k" },
        },
      },
    );
    expect(resolveReviewLensContextWindowTokens(exec, registry)).toBe(100_000);
  });

  it("ignores a non-lens-class unit override (e.g. finding_ledger = teamlead)", () => {
    const exec = lensExecution(
      { provider: "openai", model: "synth-400k" },
      {
        finding_ledger: {
          llm: { provider: "openai" as never, model: "synth-100k" },
        },
      },
    );
    // teamlead-class unit does not lower the lens window.
    expect(resolveReviewLensContextWindowTokens(exec, registry)).toBe(400_000);
  });
});

describe("end-to-end no-op-guard (CRITICAL — proves a real scaled budget)", () => {
  const registry = fixtureRegistry();

  it("a ~1M lens model yields a SCALED embed budget AND scaled caps (not a no-op)", () => {
    const exec = lensExecution({ provider: "openai", model: "synth-1m" });
    const window = resolveReviewLensContextWindowTokens(exec, registry);
    expect(window).toBe(1_000_000);

    const multiplier = reviewWindowMultiplier(window);
    expect(multiplier).toBe(MAX_WINDOW_MULTIPLIER);
    expect(multiplier).toBeGreaterThan(1);

    const maxEmbedLines = deriveReviewMaxEmbedLines(
      multiplier,
      DEFAULT_MAX_EMBED_LINES,
    );
    // The whole point of the slice: a big-window model gets MORE than 300 lines.
    expect(maxEmbedLines).toBeGreaterThan(DEFAULT_MAX_EMBED_LINES);
    expect(maxEmbedLines).toBe(DEFAULT_MAX_EMBED_LINES * MAX_WINDOW_MULTIPLIER);

    const caps = deriveWorkbookInventoryPromptCaps(multiplier);
    // Every cap dim is strictly larger than DEFAULT.
    expect(caps.max_sheets).toBeGreaterThan(50);
    expect(caps.max_columns_per_sheet).toBeGreaterThan(64);
    expect(caps.max_formula_patterns).toBeGreaterThan(200);
  });
});

describe("no-regression (model-unaware run → DEFAULT budget)", () => {
  const registry = fixtureRegistry();

  it("unresolved lens model → multiplier 1 → DEFAULT caps + DEFAULT embed lines", () => {
    const exec = lensExecution(undefined);
    const window = resolveReviewLensContextWindowTokens(exec, registry);
    expect(window).toBeUndefined();

    const multiplier = reviewWindowMultiplier(window);
    expect(multiplier).toBe(1);

    expect(deriveReviewMaxEmbedLines(multiplier, DEFAULT_MAX_EMBED_LINES)).toBe(
      DEFAULT_MAX_EMBED_LINES,
    );
    const caps = deriveWorkbookInventoryPromptCaps(multiplier);
    expect(caps.max_sheets).toBe(50);
    expect(caps.max_columns_per_sheet).toBe(64);
    expect(caps.max_formula_patterns).toBe(200);
  });
});
