import { describe, it, expect } from "vitest";
import type { OntoConfig } from "./config-chain.js";
import {
  adoptProfile,
  extractProfileFields,
  hasAnyProfileField,
  hasReviewBlock,
  mergeOrthogonalFields,
} from "./config-profile.js";

// ---------------------------------------------------------------------------
// Atomic profile adoption invariants (post-P9.4, 2026-04-21).
// ---------------------------------------------------------------------------
//
// These tests assert two invariants:
//
//   (1) Ownership is atomic — one source owns the full profile slice.
//       No frankenstein merges where profile fields from different
//       sources coexist in the adopted result.
//
//   (2) The adoption layer does NOT decide whether a profile is "runnable".
//       Empty profiles and single-side-only profiles both return cleanly;
//       the topology resolver's universal `main_native` degrade owns the
//       "no viable host" fail-fast (P9.3).
// ---------------------------------------------------------------------------

// ─── hasAnyProfileField ───

describe("hasAnyProfileField", () => {
  it("empty config → false", () => {
    expect(hasAnyProfileField({})).toBe(false);
  });

  it("only orthogonal fields → false", () => {
    expect(
      hasAnyProfileField({
        output_language: "ko",
        review_mode: "full",
        domains: ["se"],
      }),
    ).toBe(false);
  });

  it("llm switcher set -> true", () => {
    expect(hasAnyProfileField({ llm: { provider: "openai", model: "gpt-5.4" } })).toBe(true);
  });

  it("main_llm set -> true", () => {
    expect(hasAnyProfileField({ main_llm: { provider: "openai", model: "gpt-5.4" } })).toBe(true);
  });

  it("empty llm block -> false", () => {
    // YAML authors who wrote `llm:` without a body should not flip
    // profile ownership.
    expect(hasAnyProfileField({ llm: {} })).toBe(false);
  });
});

// ─── hasReviewBlock ───

describe("hasReviewBlock", () => {
  it("undefined / empty → false", () => {
    expect(hasReviewBlock(undefined)).toBe(false);
    expect(hasReviewBlock({})).toBe(false);
  });

  it("review block with one key → true", () => {
    expect(
      hasReviewBlock({
        review: { subagent: { provider: "main-native" } },
      }),
    ).toBe(true);
  });

  it("empty `review: {}` → false (prevents accidental opt-in)", () => {
    expect(hasReviewBlock({ review: {} as never })).toBe(false);
  });
});

// ─── extractProfileFields ───

describe("extractProfileFields", () => {
  it("returns only profile fields, not orthogonal", () => {
    const cfg: OntoConfig = {
      llm: { auth: "api_key", provider: "anthropic", model: "claude-haiku-4-5", effort: "high" },
      output_language: "ko", // orthogonal
      domains: ["se"], // orthogonal
      review_mode: "full", // orthogonal
    };
    const extracted = extractProfileFields(cfg);
    expect(extracted.llm).toEqual({
      auth: "api_key",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      effort: "high",
    });
    expect((extracted as { output_language?: string }).output_language).toBeUndefined();
    expect((extracted as { domains?: string[] }).domains).toBeUndefined();
    expect((extracted as { review_mode?: string }).review_mode).toBeUndefined();
  });
});

// ─── adoptProfile — decision table (post-P9.4) ───

const HOME_PATH = "/home/.onto/config.yml";
const PROJECT_PATH = "/project/.onto/config.yml";

function buildArgs(home: OntoConfig, project: OntoConfig) {
  return { home, project, homePath: HOME_PATH, projectPath: PROJECT_PATH, sameRoot: false };
}

describe("adoptProfile — decision branches", () => {
  it("project has profile → source=project", () => {
    const adoption = adoptProfile(
      buildArgs(
        {
          review: { subagent: { provider: "main-native" } },
          llm: { auth: "oauth", provider: "openai", model: "gpt-5.4", effort: "high" },
        },
        {
          review: { subagent: { provider: "main-native" } },
          llm: { auth: "api_key", provider: "anthropic", model: "claude-haiku-4-5" },
        },
      ),
    );
    expect(adoption.source).toBe("project");
    expect(adoption.source_path).toBe(PROJECT_PATH);
    expect(adoption.profile.llm).toEqual({
      auth: "api_key",
      provider: "anthropic",
      model: "claude-haiku-4-5",
    });
  });

  it("project has ONLY review block (no profile fields) → source=project (ownership claimed)", () => {
    // P9.4 invariant: a non-empty `review:` axis block alone signals
    // profile ownership even without any PROFILE_FIELDS. This preserves
    // B-5 class behaviour where a project declares `review:` + empty
    // `llm: {}` and expects the LLM switcher slot to survive
    // adoption (belonging to the project, not inherited from home).
    const adoption = adoptProfile(
      buildArgs(
        {
          review: { subagent: { provider: "main-native" } },
          llm: { auth: "api_key", provider: "anthropic", model: "claude-haiku-4-5" },
        },
        {
          review: { subagent: { provider: "main-native" } },
          llm: {}, // empty namespace — not counted by hasAnyProfileField,
          // but the review block still claims ownership.
        },
      ),
    );
    expect(adoption.source).toBe("project");
    expect(adoption.profile.llm).toEqual({});
  });

  it("project has profile without review block → still source=project", () => {
    // A project with only an `llm:` namespace (no `review:`
    // axis block) now owns the profile. Previously this was treated as
    // "touched-but-incomplete" and deferred to home.
    const adoption = adoptProfile(
      buildArgs(
        {
          review: { subagent: { provider: "main-native" } },
          llm: { auth: "api_key", provider: "anthropic", model: "claude-haiku-4-5" },
        },
        { llm: { auth: "oauth", provider: "openai", model: "gpt-5.4" } /* no review block */ },
      ),
    );
    expect(adoption.source).toBe("project");
    expect(adoption.profile.llm).toEqual({ auth: "oauth", provider: "openai", model: "gpt-5.4" });
  });

  it("project has nothing, home has ONLY review block (no profile fields) → source=global", () => {
    // Symmetric to the project-review-block-only case. `claimsProfileOwnership`
    // must recognize a non-empty review block on the home side as an
    // ownership claim, so home config authors can stage review settings
    // without declaring a provider namespace.
    const adoption = adoptProfile(
      buildArgs(
        {
          review: { subagent: { provider: "main-native" } },
          // No PROFILE_FIELDS — only the review block.
        },
        {}, // project completely empty
      ),
    );
    expect(adoption.source).toBe("global");
    expect(adoption.source_path).toBe(HOME_PATH);
    // Adopted profile is empty (no PROFILE_FIELDS in home), but
    // ownership was still claimed so we don't fall to source=none.
    expect(adoption.profile).toEqual({});
  });

  it("project has no profile fields, home has → source=global", () => {
    const adoption = adoptProfile(
      buildArgs(
        {
          review: { subagent: { provider: "main-native" } },
          llm: { auth: "oauth", provider: "openai", model: "gpt-5.4" },
        },
        {}, // absent / empty
      ),
    );
    expect(adoption.source).toBe("global");
    expect(adoption.source_path).toBe(HOME_PATH);
    expect(adoption.profile.llm).toEqual({ auth: "oauth", provider: "openai", model: "gpt-5.4" });
  });

  it("project has no profile, home has only orthogonal fields → source=none", () => {
    const adoption = adoptProfile(
      buildArgs({ output_language: "ko" /* orthogonal only */ }, {}),
    );
    expect(adoption.source).toBe("none");
    expect(adoption.source_path).toBeNull();
    expect(adoption.profile).toEqual({});
  });

  it("both absent → source=none (no throw — resolver handles it)", () => {
    const adoption = adoptProfile(buildArgs({}, {}));
    expect(adoption.source).toBe("none");
    expect(adoption.profile).toEqual({});
  });

  it("sameRoot + home has profile → source=global", () => {
    const adoption = adoptProfile({
      home: {
        review: { subagent: { provider: "main-native" } },
        llm: { auth: "oauth", provider: "openai", model: "gpt-5.4" },
      },
      // sameRoot: project is the same as home, so same object content.
      project: {
        review: { subagent: { provider: "main-native" } },
        llm: { auth: "oauth", provider: "openai", model: "gpt-5.4" },
      },
      homePath: HOME_PATH,
      projectPath: PROJECT_PATH,
      sameRoot: true,
    });
    expect(adoption.source).toBe("global");
    expect(adoption.source_path).toBe(HOME_PATH);
    expect(adoption.profile.llm).toEqual({ auth: "oauth", provider: "openai", model: "gpt-5.4" });
  });

  it("sameRoot + no profile → source=none", () => {
    const adoption = adoptProfile({
      home: {},
      project: {},
      homePath: HOME_PATH,
      projectPath: PROJECT_PATH,
      sameRoot: true,
    });
    expect(adoption.source).toBe("none");
    expect(adoption.profile).toEqual({});
  });
});

// ─── mergeOrthogonalFields ───

describe("mergeOrthogonalFields", () => {
  it("last-wins for scalars (project over home)", () => {
    const merged = mergeOrthogonalFields(
      { output_language: "en", review_mode: "core-axis" },
      { output_language: "ko" },
    );
    expect(merged.output_language).toBe("ko");
    expect(merged.review_mode).toBe("core-axis");
  });

  it("union-merges excluded_names", () => {
    const merged = mergeOrthogonalFields(
      { excluded_names: ["node_modules", ".git"] },
      { excluded_names: [".git", "dist"] },
    );
    expect(merged.excluded_names).toEqual(
      expect.arrayContaining(["node_modules", ".git", "dist"]),
    );
    expect(merged.excluded_names?.length).toBe(3);
  });

  it("drops profile fields entirely", () => {
    const merged = mergeOrthogonalFields(
      { llm: { auth: "oauth", provider: "openai", model: "gpt-5.4" }, output_language: "ko" },
      { main_llm: { provider: "openai", model: "gpt-5.4" }, review_mode: "full" },
    );
    expect((merged as { llm?: unknown }).llm).toBeUndefined();
    expect((merged as { main_llm?: unknown }).main_llm).toBeUndefined();
    expect(merged.output_language).toBe("ko");
    expect(merged.review_mode).toBe("full");
  });

  it("passes review block through as orthogonal", () => {
    const merged = mergeOrthogonalFields(
      { review: { subagent: { provider: "codex", model_id: "gpt-5.4" } } },
      { review: { subagent: { provider: "main-native" } } },
    );
    // Last-wins: project overrides home.
    expect(merged.review).toEqual({ subagent: { provider: "main-native" } });
  });
});

// ─── Regression: migrated Review UX Redesign config ───

describe("regression — migrated Review UX Redesign config", () => {
  it("project declares review block + llm block -> project owns", () => {
    const adoption = adoptProfile(
      buildArgs(
        {}, // empty global
        {
          review: {
            subagent: { provider: "main-native" },
          },
          llm: { auth: "oauth", provider: "openai", model: "gpt-5.4", effort: "medium" },
          review_mode: "core-axis",
        },
      ),
    );
    expect(adoption.source).toBe("project");
    expect(adoption.profile.llm).toEqual({
      auth: "oauth",
      provider: "openai",
      model: "gpt-5.4",
      effort: "medium",
    });
  });
});
