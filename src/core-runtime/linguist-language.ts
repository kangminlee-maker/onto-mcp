/**
 * Deterministic language identification from a file's name/extension/shebang, backed by the
 * build-time-generated GitHub Linguist catalog (`linguist-language-catalog.generated.ts`).
 *
 * This is Linguist's role in the structure-evidence framework: NOT a qualification gate, but the
 * *candidate-discovery* signal — which parser(s) to try, and an honest language token for purpose
 * evidence. Final observer applicability is decided by actual parse success elsewhere.
 *
 * The ladder (structure-evidence-framework-design.md §4 / language-agnostic-structure-parsing v4
 * §3.2): filename → shebang → extension, each rung disambiguating a multi-candidate hit by a
 * `type: programming` filter and otherwise reporting `unknown` + the full candidate set (an honest
 * ambiguity, e.g. `.h` → {c, cpp, objective-c}). `group` is a usage-stats parent, NOT a syntax
 * equivalence — it is never folded into the canonical token (only used in parity comparison).
 *
 * Pure, no IO. **Runtime-inert on landing**: no consumer wires this yet (a later gating/observer PR
 * routes it into classification + the layout observer). Kept side-effect-free so it stays inert.
 */
import {
  LINGUIST_EXTENSION_INDEX,
  LINGUIST_FILENAME_INDEX,
  LINGUIST_INTERPRETER_INDEX,
  LINGUIST_LANGUAGE_META,
  type LinguistLanguageToken,
} from "./linguist-language-catalog.generated.js";

export type LinguistIdentificationBasis =
  | "filename"
  | "shebang"
  | "extension_unique"
  | "extension_type_filtered"
  | "ambiguous"
  | "none";

export interface LinguistLanguageCandidate {
  language_id: number;
  token: LinguistLanguageToken;
}

export interface LinguistIdentification {
  language: LinguistLanguageToken | "unknown";
  basis: LinguistIdentificationBasis;
  /** All languages the winning rung matched (deduped, sorted) — the honest ambiguity record. */
  candidates: LinguistLanguageCandidate[];
}

function candidatesOf(tokens: readonly LinguistLanguageToken[]): LinguistLanguageCandidate[] {
  const unique = [...new Set(tokens)].sort();
  return unique.map((token) => ({ language_id: LINGUIST_LANGUAGE_META[token].language_id, token }));
}

/** Resolve a non-empty candidate list: unique → confirmed; else a single `programming` candidate →
 *  type-filtered confirmed; else `unknown` + full candidates. */
function disambiguate(
  tokens: readonly LinguistLanguageToken[],
  uniqueBasis: LinguistIdentificationBasis,
  filteredBasis: LinguistIdentificationBasis,
): LinguistIdentification {
  const candidates = candidatesOf(tokens);
  if (candidates.length === 1) {
    return { language: candidates[0]!.token, basis: uniqueBasis, candidates };
  }
  const programming = candidates.filter((c) => LINGUIST_LANGUAGE_META[c.token].type === "programming");
  if (programming.length === 1) {
    return { language: programming[0]!.token, basis: filteredBasis, candidates };
  }
  return { language: "unknown", basis: "ambiguous", candidates };
}

/** Extract the interpreter basename from a shebang line (`#!/usr/bin/env lua` → `lua`). */
function shebangInterpreter(firstLine: string): string | null {
  if (!firstLine.startsWith("#!")) return null;
  const parts = firstLine.replace(/^#!\s*/, "").trim().split(/\s+/);
  let bin = parts[0] ?? "";
  if (bin.endsWith("/env") && parts[1]) bin = parts[1];
  const base = bin.split("/").pop() ?? "";
  return base.length > 0 ? base.toLowerCase() : null;
}

/**
 * Identify a file's language via the filename → shebang → extension ladder. A rung that matches the
 * catalog terminates (its result — confirmed or an honest `unknown` + candidates — is returned);
 * only a rung with no catalog hit falls through. No match anywhere → `unknown` / `none`.
 */
export function identifyLanguage(input: {
  basename?: string;
  extension?: string;
  firstLine?: string;
}): LinguistIdentification {
  const fnTokens = input.basename ? LINGUIST_FILENAME_INDEX[input.basename.toLowerCase()] : undefined;
  if (fnTokens && fnTokens.length > 0) {
    return disambiguate(fnTokens, "filename", "filename");
  }
  if (input.firstLine) {
    const interpreter = shebangInterpreter(input.firstLine);
    const interpTokens = interpreter ? LINGUIST_INTERPRETER_INDEX[interpreter] : undefined;
    if (interpTokens && interpTokens.length > 0) {
      return disambiguate(interpTokens, "shebang", "shebang");
    }
  }
  const extTokens = input.extension ? LINGUIST_EXTENSION_INDEX[input.extension.toLowerCase()] : undefined;
  if (extTokens && extTokens.length > 0) {
    return disambiguate(extTokens, "extension_unique", "extension_type_filtered");
  }
  return { language: "unknown", basis: "none", candidates: [] };
}
