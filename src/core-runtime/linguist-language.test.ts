import { describe, expect, it } from "vitest";
import { identifyLanguage } from "./linguist-language.js";
import {
  LINGUIST_LANGUAGE_META,
  type LinguistLanguageToken,
} from "./linguist-language-catalog.generated.js";

// Spec basis: structure-evidence-framework-design.md §4 / language-agnostic-structure-parsing v4
// §3.2–§3.4. The ladder is falsifiable against real committed Linguist data (the catalog): for
// every observer/env-profile extension it must either confirm the hand-table token (or a
// group-equivalent) OR, when Linguist genuinely leaves it ambiguous, report `unknown` with the
// hand-table language among the candidates. `group` is a comparison aid here only — never the
// canonical token.

/** Group-aware equivalence: same token, or one's Linguist `group` folds to the other's token. */
function equivalent(a: string, b: string): boolean {
  if (a === b) return true;
  const ga = LINGUIST_LANGUAGE_META[a as LinguistLanguageToken]?.group;
  if (ga === b) return true;
  const gb = LINGUIST_LANGUAGE_META[b as LinguistLanguageToken]?.group;
  if (gb === a) return true;
  return false;
}

function matchesHand(ext: string, hand: string): { ok: boolean; note: string } {
  const r = identifyLanguage({ basename: `x${ext}`, extension: ext });
  if (r.language !== "unknown") {
    return { ok: equivalent(r.language, hand), note: `confirmed ${r.language} (${r.basis})` };
  }
  const tokens = r.candidates.map((c) => c.token);
  return { ok: tokens.some((t) => equivalent(t, hand)), note: `unknown, candidates [${tokens.join(", ")}]` };
}

// env-profile's 22 hand-table extensions (superset of the observer's 9). candidate-aware parity.
const ENV_HAND: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python", ".rs": "rust", ".go": "go", ".rb": "ruby",
  ".java": "java", ".kt": "kotlin", ".php": "php", ".cs": "csharp", ".swift": "swift",
  ".c": "c", ".cc": "cpp", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
};
// The observer's own 9 hand-table extensions (must not contradict either).
const OBSERVER_HAND: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
  ".py": "python",
};

describe("identifyLanguage — candidate-aware parity (§3.4)", () => {
  it("has a non-empty subject set (guards against a vacuous pass)", () => {
    expect(Object.keys(ENV_HAND).length).toBe(22);
    expect(Object.keys(OBSERVER_HAND).length).toBe(9);
  });

  it.each(Object.entries(ENV_HAND))("env-profile %s parity", (ext, hand) => {
    const { ok, note } = matchesHand(ext, hand);
    expect(ok, `${ext} expected ≡/⊇ ${hand}, got ${note}`).toBe(true);
  });

  it.each(Object.entries(OBSERVER_HAND))("observer %s parity", (ext, hand) => {
    const { ok, note } = matchesHand(ext, hand);
    expect(ok, `${ext} expected ≡/⊇ ${hand}, got ${note}`).toBe(true);
  });
});

describe("identifyLanguage — type-filter disambiguation", () => {
  it(".ts confirms typescript by the programming filter (xml co-claims the extension)", () => {
    const r = identifyLanguage({ basename: "a.ts", extension: ".ts" });
    expect(r.language).toBe("typescript");
    expect(r.basis).toBe("extension_type_filtered");
    expect(r.candidates.map((c) => c.token)).toContain("xml");
  });

  it(".tsx confirms tsx (identity preserved) — group=typescript is comparison-only, not the token", () => {
    const r = identifyLanguage({ basename: "a.tsx", extension: ".tsx" });
    expect(r.language).toBe("tsx");
    expect(LINGUIST_LANGUAGE_META.tsx.group).toBe("typescript");
  });

  it(".rs stays unknown — RenderScript and Rust are both programming (no unique filter)", () => {
    const r = identifyLanguage({ basename: "a.rs", extension: ".rs" });
    expect(r.language).toBe("unknown");
    expect(r.basis).toBe("ambiguous");
    const tokens = r.candidates.map((c) => c.token);
    expect(tokens).toEqual(expect.arrayContaining(["renderscript", "rust"]));
  });

  it(".h stays unknown with C/C++/Objective-C candidates", () => {
    const r = identifyLanguage({ basename: "a.h", extension: ".h" });
    expect(r.language).toBe("unknown");
    expect(r.candidates.map((c) => c.token)).toEqual(
      expect.arrayContaining(["c", "cpp", "objective-c"]),
    );
  });

  it(".m is honestly ambiguous across many candidates", () => {
    const r = identifyLanguage({ basename: "a.m", extension: ".m" });
    expect(r.language).toBe("unknown");
    expect(r.candidates.length).toBeGreaterThanOrEqual(5);
    expect(r.candidates.map((c) => c.token)).toContain("objective-c");
  });

  it("candidates carry the real numeric language_id + token", () => {
    const r = identifyLanguage({ basename: "a.rs", extension: ".rs" });
    for (const c of r.candidates) {
      expect(typeof c.language_id).toBe("number");
      expect(LINGUIST_LANGUAGE_META[c.token].language_id).toBe(c.language_id);
    }
  });
});

describe("identifyLanguage — shebang / interpreter rung", () => {
  it("resolves an unambiguous interpreter (node → javascript)", () => {
    const r = identifyLanguage({ basename: "script", extension: "", firstLine: "#!/usr/bin/env node" });
    expect(r.language).toBe("javascript");
    expect(r.basis).toBe("shebang");
  });

  it("type-filters a multi-interpreter shebang (perl → perl; Pod is prose)", () => {
    const r = identifyLanguage({ basename: "script", extension: "", firstLine: "#!/usr/bin/env perl" });
    expect(r.language).toBe("perl");
    expect(r.basis).toBe("shebang");
  });

  it("keeps a genuinely-polysemous interpreter unknown (lua → {lua, terra})", () => {
    const r = identifyLanguage({ basename: "script", extension: "", firstLine: "#!/usr/bin/env lua" });
    expect(r.language).toBe("unknown");
    expect(r.candidates.map((c) => c.token)).toEqual(expect.arrayContaining(["lua", "terra"]));
  });

  it("keeps two-programming interpreters unknown (bun → {javascript, typescript})", () => {
    const r = identifyLanguage({ basename: "script", extension: "", firstLine: "#!/usr/bin/env bun" });
    expect(r.language).toBe("unknown");
    expect(r.candidates.map((c) => c.token)).toEqual(expect.arrayContaining(["javascript", "typescript"]));
  });

  it("handles a direct-path shebang (#!/bin/sh → shell)", () => {
    const r = identifyLanguage({ basename: "script", extension: "", firstLine: "#!/bin/sh" });
    expect(r.language).toBe("shell");
  });
});

describe("identifyLanguage — filename rung + terminal none", () => {
  it("confirms by exact filename before extension (Makefile → makefile)", () => {
    const r = identifyLanguage({ basename: "Makefile", extension: "" });
    expect(r.language).toBe("makefile");
    expect(r.basis).toBe("filename");
  });

  it("reports none for a fully unknown file (no filename/shebang/extension hit)", () => {
    const r = identifyLanguage({ basename: "mystery.zzqq", extension: ".zzqq" });
    expect(r.language).toBe("unknown");
    expect(r.basis).toBe("none");
    expect(r.candidates).toEqual([]);
  });
});

describe("linguist catalog integrity", () => {
  it("every language's group resolves to a known token (no dangling parent)", () => {
    let checked = 0;
    for (const [token, meta] of Object.entries(LINGUIST_LANGUAGE_META)) {
      if (meta.group !== null) {
        checked += 1;
        expect(LINGUIST_LANGUAGE_META[meta.group], `${token} group ${meta.group}`).toBeDefined();
      }
    }
    expect(checked).toBeGreaterThan(0); // non-vacuous: some languages DO have a group
  });
});
