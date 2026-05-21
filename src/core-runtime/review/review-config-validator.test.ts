import { describe, it, expect } from "vitest";
import { validateReviewConfig } from "./review-config-validator.js";

// ---------------------------------------------------------------------------
// validateReviewConfig — Review UX Redesign P1 (2026-04-20)
// ---------------------------------------------------------------------------
//
// These tests lock in three kinds of invariants:
//
//   (1) Happy paths — every config variation shown in design doc §3.2
//       parses to the expected OntoReviewConfig with no errors.
//
//   (2) Discriminated-union enforcement — the YAML cast in readConfigAt
//       can silently allow `main-native + model_id`, so the validator
//       must reject it explicitly. Same for foreign providers missing
//       model_id.
//
//   (3) Deliberation semantics — controlled lens deliberation is a review
//       semantic, not a transport-specific Agent Teams setting.
// ---------------------------------------------------------------------------

describe("validateReviewConfig — happy paths", () => {
  it("accepts undefined / null as empty config", () => {
    const a = validateReviewConfig(undefined);
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.config).toEqual({});
    const b = validateReviewConfig(null);
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.config).toEqual({});
  });

  it("accepts empty object as empty config", () => {
    const r = validateReviewConfig({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config).toEqual({});
  });

  it("accepts default review axes (teamlead=main, subagent=main-native)", () => {
    const r = validateReviewConfig({
      teamlead: { model: "main" },
      subagent: { provider: "main-native" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.teamlead).toEqual({ model: "main" });
      expect(r.config.subagent).toEqual({ provider: "main-native" });
    }
  });

  it("accepts Claude Code + codex subagent + effort + concurrency", () => {
    const r = validateReviewConfig({
      teamlead: { model: "main" },
      subagent: { provider: "codex", model_id: "gpt-5.4", effort: "high" },
      max_concurrent_lenses: 6,
      lens_deliberation: "controlled-lens-deliberation",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.subagent).toEqual({
        provider: "codex",
        model_id: "gpt-5.4",
        effort: "high",
      });
      expect(r.config.max_concurrent_lenses).toBe(6);
      expect(r.config.lens_deliberation).toBe("controlled-lens-deliberation");
    }
  });

  it("accepts Claude Code + controlled deliberation deliberation (teamlead=main)", () => {
    const r = validateReviewConfig({
      teamlead: { model: "main" },
      subagent: { provider: "main-native" },
      lens_deliberation: "controlled-lens-deliberation",
    });
    expect(r.ok).toBe(true);
  });

  it("accepts codex-nested (teamlead=codex external, subagent=codex)", () => {
    const r = validateReviewConfig({
      teamlead: {
        model: { provider: "codex", model_id: "gpt-5.4", effort: "high" },
      },
      subagent: { provider: "codex", model_id: "gpt-5.4" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.teamlead?.model).toEqual({
        provider: "codex",
        model_id: "gpt-5.4",
        effort: "high",
      });
    }
  });

  it("rejects provider names outside the review subagent domain", () => {
    const r = validateReviewConfig({
      subagent: { provider: "unsupported-provider", model_id: "llama-8b" },
      max_concurrent_lenses: 2,
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateReviewConfig — structural rejections", () => {
  it("rejects non-object review block", () => {
    const r = validateReviewConfig("string-config");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.path === "review")).toBe(true);
    }
  });

  it("rejects array as review block", () => {
    const r = validateReviewConfig([1, 2, 3]);
    expect(r.ok).toBe(false);
  });

  it("rejects unknown top-level keys", () => {
    const r = validateReviewConfig({ unknown_field: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.path === "review.unknown_field"),
      ).toBe(true);
    }
  });

  it("rejects teamlead without model field", () => {
    const r = validateReviewConfig({ teamlead: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.path === "review.teamlead.model"),
      ).toBe(true);
    }
  });
});

describe("validateReviewConfig — discriminated-union enforcement", () => {
  it("rejects subagent.provider=main-native with model_id", () => {
    const r = validateReviewConfig({
      subagent: { provider: "main-native", model_id: "anything" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.path === "review.subagent.model_id"),
      ).toBe(true);
    }
  });

  it("rejects subagent.provider=main-native with effort", () => {
    const r = validateReviewConfig({
      subagent: { provider: "main-native", effort: "high" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.path === "review.subagent.effort"),
      ).toBe(true);
    }
  });

  it("rejects foreign subagent without model_id", () => {
    const r = validateReviewConfig({
      subagent: { provider: "codex" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.path === "review.subagent.model_id"),
      ).toBe(true);
    }
  });

  it("rejects unknown subagent provider", () => {
    const r = validateReviewConfig({
      subagent: { provider: "unknown-ai" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.path === "review.subagent.provider"),
      ).toBe(true);
    }
  });

  it("rejects teamlead.model=main-native (only subagent can be main-native)", () => {
    // ExplicitModelSpec type restricts provider to foreign providers only.
    // "main-native" under teamlead.model (as object.provider) must be rejected.
    const r = validateReviewConfig({
      teamlead: {
        model: { provider: "main-native", model_id: "x" },
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.path === "review.teamlead.model.provider"),
      ).toBe(true);
    }
  });

  it("rejects explicit teamlead without model_id", () => {
    const r = validateReviewConfig({
      teamlead: { model: { provider: "codex" } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.path === "review.teamlead.model.model_id"),
      ).toBe(true);
    }
  });
});

describe("validateReviewConfig — scalar axis constraints", () => {
  it("rejects non-integer concurrency", () => {
    const r = validateReviewConfig({ max_concurrent_lenses: 2.5 });
    expect(r.ok).toBe(false);
  });

  it("rejects zero / negative concurrency", () => {
    expect(validateReviewConfig({ max_concurrent_lenses: 0 }).ok).toBe(false);
    expect(validateReviewConfig({ max_concurrent_lenses: -1 }).ok).toBe(false);
  });

  it("rejects non-numeric concurrency (e.g. string)", () => {
    const r = validateReviewConfig({ max_concurrent_lenses: "6" });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown deliberation value", () => {
    const r = validateReviewConfig({ lens_deliberation: "whatever" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.path === "review.lens_deliberation"),
      ).toBe(true);
    }
  });
});

describe("validateReviewConfig — deliberation semantics", () => {
  it("accepts controlled-lens-deliberation with external teamlead", () => {
    const r = validateReviewConfig({
      teamlead: {
        model: { provider: "codex", model_id: "gpt-5.4" },
      },
      subagent: { provider: "main-native" },
      lens_deliberation: "controlled-lens-deliberation",
    });
    expect(r.ok).toBe(true);
  });

  it("accepts controlled-lens-deliberation with implicit teamlead (model=main) — absent teamlead block", () => {
    const r = validateReviewConfig({
      subagent: { provider: "main-native" },
      lens_deliberation: "controlled-lens-deliberation",
    });
    expect(r.ok).toBe(true);
  });
});
