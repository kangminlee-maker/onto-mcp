import { describe, it, expect } from "vitest";
import type { OntoReviewConfig } from "../discovery/config-chain.js";
import { applySet, SUPPORTED_SET_PATHS } from "./onto-config-key-path.js";

// ---------------------------------------------------------------------------
// applySet — Review UX Redesign P5 (2026-04-21)
// ---------------------------------------------------------------------------
//
// These tests cover the coercion + discriminated-union invariants the
// `onto config set` and `edit` subcommands depend on:
//
//   (1) Happy paths for each supported key, round-tripping through the
//       expected OntoReviewConfig shape.
//   (2) Discriminated-union preservation — switching subagent.provider
//       from `main-native` to a foreign value adds model_id/effort slots;
//       switching back to `main-native` drops them.
//   (3) Value coercion errors (integers, enums) returned as `ok: false`
//       with a clear error string — caller forwards verbatim to the user.
//   (4) Unsupported paths return an error pointing to `edit` for richer
//       spec objects.
// ---------------------------------------------------------------------------

describe("applySet — supported paths declared", () => {
  it("SUPPORTED_SET_PATHS matches README / help text exactly", () => {
    expect(SUPPORTED_SET_PATHS).toEqual([
      "teamlead.model",
      "subagent.provider",
      "subagent.model_id",
      "subagent.effort",
      "max_concurrent_lenses",
      "lens_deliberation",
    ]);
  });
});

describe("applySet — teamlead.model", () => {
  it("accepts `main` literal", () => {
    const r = applySet({}, "teamlead.model", "main");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.teamlead).toEqual({ model: "main" });
  });

  it("rejects foreign teamlead values and points to `edit`", () => {
    const r = applySet({}, "teamlead.model", "codex");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/edit/);
  });
});

describe("applySet — subagent.provider (discriminated-union preservation)", () => {
  it("main-native → main-native is idempotent", () => {
    const r = applySet(
      { subagent: { provider: "main-native" } },
      "subagent.provider",
      "main-native",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.subagent).toEqual({ provider: "main-native" });
  });

  it("main-native → codex preserves (empty) model_id slot", () => {
    const r = applySet(
      { subagent: { provider: "main-native" } },
      "subagent.provider",
      "codex",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.subagent).toEqual({ provider: "codex", model_id: "" });
    }
  });

  it("rejects providers outside the review subagent domain", () => {
    const r = applySet(
      {
        subagent: { provider: "codex", model_id: "gpt-5.4", effort: "high" },
      },
      "subagent.provider",
      "unsupported-provider",
    );
    expect(r.ok).toBe(false);
  });

  it("codex → main-native drops model_id + effort (union branch change)", () => {
    const r = applySet(
      {
        subagent: { provider: "codex", model_id: "gpt-5.4", effort: "high" },
      },
      "subagent.provider",
      "main-native",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.subagent).toEqual({ provider: "main-native" });
  });

  it("rejects unknown provider", () => {
    const r = applySet({}, "subagent.provider", "hal9000");
    expect(r.ok).toBe(false);
  });
});

describe("applySet — subagent.model_id", () => {
  it("requires a foreign provider to be set first", () => {
    const r = applySet(
      { subagent: { provider: "main-native" } },
      "subagent.model_id",
      "gpt-5.4",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/codex/);
  });

  it("rejects empty model_id", () => {
    const r = applySet(
      {
        subagent: { provider: "codex", model_id: "prev" },
      },
      "subagent.model_id",
      "",
    );
    expect(r.ok).toBe(false);
  });

  it("sets model_id on codex subagent", () => {
    const r = applySet(
      { subagent: { provider: "codex", model_id: "" } },
      "subagent.model_id",
      "gpt-5.4",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.subagent).toEqual({
        provider: "codex",
        model_id: "gpt-5.4",
      });
    }
  });

  it("preserves effort when updating model_id", () => {
    const r = applySet(
      {
        subagent: { provider: "codex", model_id: "gpt-5.4", effort: "high" },
      },
      "subagent.model_id",
      "gpt-5.4-preview",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.subagent).toEqual({
        provider: "codex",
        model_id: "gpt-5.4-preview",
        effort: "high",
      });
    }
  });
});

describe("applySet — subagent.effort", () => {
  it("requires a foreign provider", () => {
    const r = applySet(
      { subagent: { provider: "main-native" } },
      "subagent.effort",
      "high",
    );
    expect(r.ok).toBe(false);
  });

  it("sets effort on a foreign subagent", () => {
    const r = applySet(
      { subagent: { provider: "codex", model_id: "gpt-5.4" } },
      "subagent.effort",
      "xhigh",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.subagent).toEqual({
        provider: "codex",
        model_id: "gpt-5.4",
        effort: "xhigh",
      });
    }
  });
});

describe("applySet — max_concurrent_lenses", () => {
  it("accepts positive integer", () => {
    const r = applySet({}, "max_concurrent_lenses", "9");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.max_concurrent_lenses).toBe(9);
  });

  it("rejects zero / negative / float / non-numeric", () => {
    expect(applySet({}, "max_concurrent_lenses", "0").ok).toBe(false);
    expect(applySet({}, "max_concurrent_lenses", "-1").ok).toBe(false);
    expect(applySet({}, "max_concurrent_lenses", "2.5").ok).toBe(false);
    expect(applySet({}, "max_concurrent_lenses", "six").ok).toBe(false);
  });
});

describe("applySet — lens_deliberation", () => {
  it("rejects retired single-pass deliberation mode", () => {
    const retiredMode = ["synthesizer", "only"].join("-");
    const r = applySet({}, "lens_deliberation", retiredMode);
    expect(r.ok).toBe(false);
  });

  it("accepts controlled-lens-deliberation", () => {
    const r = applySet({}, "lens_deliberation", "controlled-lens-deliberation");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.lens_deliberation).toBe("controlled-lens-deliberation");
  });

  it("rejects unknown deliberation value", () => {
    const r = applySet({}, "lens_deliberation", "loud");
    expect(r.ok).toBe(false);
  });
});

describe("applySet — unsupported paths", () => {
  it("rejects unknown key path with hint to `edit`", () => {
    const r = applySet({}, "review_mode", "full");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/edit/);
      expect(r.error).toMatch(/Supported paths/);
    }
  });

  it("rejects nested teamlead.model.provider path (use edit)", () => {
    const r = applySet({}, "teamlead.model.provider", "codex");
    expect(r.ok).toBe(false);
  });
});

describe("applySet — purity", () => {
  it("does not mutate the input config", () => {
    const original: OntoReviewConfig = {
      subagent: { provider: "codex", model_id: "gpt-5.4", effort: "high" },
    };
    const snapshot = structuredClone(original);
    applySet(original, "subagent.provider", "main-native");
    expect(original).toEqual(snapshot);
  });
});
