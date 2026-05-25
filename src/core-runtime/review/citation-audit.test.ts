import { describe, it, expect } from "vitest";
import { auditCitations, extractSignificantQuotes } from "./citation-audit.js";

describe("extractSignificantQuotes", () => {
  it("extracts double-quoted strings above threshold", () => {
    const text = 'The lens said "Top-level value lacks operational backing" in evidence.';
    const quotes = extractSignificantQuotes(text);
    expect(quotes.map((q) => q.text)).toContain(
      "Top-level value lacks operational backing",
    );
  });

  it("extracts backtick code spans above threshold", () => {
    const text =
      "The evidence is at `src/core-runtime/review/review-state-machine.ts` in the module.";
    const quotes = extractSignificantQuotes(text);
    expect(quotes.map((q) => q.text)).toContain(
      "src/core-runtime/review/review-state-machine.ts",
    );
  });

  it("skips quotes below threshold (default 20)", () => {
    const text = 'The status is "performed" for now, file `x.ts`.';
    const quotes = extractSignificantQuotes(text).map((q) => q.text);
    expect(quotes).not.toContain("performed");
    expect(quotes).not.toContain("x.ts");
  });

  it("respects a custom threshold", () => {
    const text = "File `x.ts` matters.";
    const quotes = extractSignificantQuotes(text, { minQuoteLength: 3 });
    expect(quotes.map((q) => q.text)).toContain("x.ts");
  });

  it("de-duplicates identical quotes", () => {
    const text =
      '"Declaration without operational backing" appears here and "Declaration without operational backing" again.';
    const quotes = extractSignificantQuotes(text);
    expect(
      quotes.filter((q) => q.text === "Declaration without operational backing").length,
    ).toBe(1);
  });

  it("handles multi-line quote bodies (single newline tolerated)", () => {
    const text = '"Line one of a long citation\nthat wraps across one linebreak"';
    const quotes = extractSignificantQuotes(text);
    expect(quotes[0]?.text.includes("Line one")).toBe(true);
  });

  it("does not extract from triple-backtick code fences as code spans", () => {
    const text = "Before\n```ts\nconst x = 1;\n```\nAfter";
    const quotes = extractSignificantQuotes(text);
    expect(quotes.length).toBe(0);
  });

  it("returns empty array when no quoted strings present", () => {
    const text = "Pure prose with no quotations or backtick spans above threshold.";
    expect(extractSignificantQuotes(text)).toEqual([]);
  });
});

describe("attribution classification", () => {
  it("classifies `<lens>:` colon attribution", () => {
    const text = 'axiology: "Declaration without operational grounding detected"';
    const [q] = extractSignificantQuotes(text);
    expect(q?.is_attribution).toBe(true);
    expect(q?.attributed_lens).toBe("axiology");
  });

  it("classifies `**<lens>**:` bold attribution", () => {
    const text = '**logic**: "Circular dependency across module boundary"';
    const [q] = extractSignificantQuotes(text);
    expect(q?.is_attribution).toBe(true);
    expect(q?.attributed_lens).toBe("logic");
  });

  it("classifies verb attribution (said / reports / claims)", () => {
    const texts = [
      'Axiology said "purpose-value misalignment in executor"',
      "Logic reports \"tier-level equivalence cannot be decided\"",
      'Semantics claims "synonymous terms not consolidated"',
    ];
    for (const text of texts) {
      const [q] = extractSignificantQuotes(text);
      expect(q?.is_attribution).toBe(true);
    }
  });

  it("classifies `<Lens> lens said` phrasing", () => {
    const text = 'Coverage lens notes "sub-area missing from scope"';
    const [q] = extractSignificantQuotes(text);
    expect(q?.is_attribution).toBe(true);
    expect(q?.attributed_lens).toBe("coverage");
  });

  it("classifies `per <lens>` / `from <lens>` / `according to <lens>` prefix", () => {
    const texts = [
      'per logic, "tier-equivalence can be demonstrated structurally"',
      'from structure: "isolated node in dependency graph found"',
      'according to pragmatics: "usage context narrows applicability"',
    ];
    for (const text of texts) {
      const [q] = extractSignificantQuotes(text);
      expect(q?.is_attribution).toBe(true);
    }
  });

  it("does NOT classify a bare quote without a nearby lens reference", () => {
    const text =
      'The synthesis includes a "conditional consensus" section per the canonical taxonomy.';
    const [q] = extractSignificantQuotes(text);
    expect(q?.is_attribution).toBe(false);
    expect(q?.attributed_lens).toBeUndefined();
  });

  it("does NOT leak attribution across sentence boundaries", () => {
    // Lens reference is in the previous sentence; quote here is a bare concept
    // label, not an attributed citation.
    const text =
      'Axiology covered the purpose axis. Elsewhere the report discusses "conditional consensus" as a taxonomy label.';
    const quotes = extractSignificantQuotes(text);
    const taxonomy = quotes.find((q) => q.text === "conditional consensus");
    expect(taxonomy?.is_attribution).toBe(false);
  });
});

describe("auditCitations", () => {
  it("flags an attribution-style fabrication in quotes_unmatched (the A3 case)", () => {
    const synthesize =
      "### Disagreement\n" +
      '- Axiology said "Naming alignment between value, activity, and concept is not yet resolved".';
    const axiologyLens =
      "Findings: Top-level value 시간/비용 최소화 lacks operational backing in executor.";
    const depLens = "Authority chain integrity circular between core-lexicon.yaml and .onto/principles/.";
    const structLens = "Naming alignment resolved as of W-A-77.";

    const result = auditCitations(synthesize, [axiologyLens, depLens, structLens]);
    expect(result.quotes_checked).toBe(1);
    expect(result.attribution_count).toBe(1);
    expect(result.quotes_unmatched).toContain(
      "Naming alignment between value, activity, and concept is not yet resolved",
    );
    expect(result.quotes_unmatched_meta).toEqual([]);
  });

  it("routes non-attribution unmatched quotes to quotes_unmatched_meta (taxonomy labels)", () => {
    const synthesize =
      'The section is titled "conditional consensus" per the canonical taxonomy, and separately "cross-process deliberation" appears as a meta-concept.';
    const lensA = "Irrelevant lens body without any taxonomy phrase.";

    const result = auditCitations(synthesize, [lensA]);
    // Both taxonomy labels are above threshold 20 and unmatched.
    expect(result.quotes_unmatched).toEqual([]);
    expect(result.quotes_unmatched_meta.length).toBeGreaterThanOrEqual(1);
    // Neither was an attribution citation.
    expect(result.attribution_count).toBe(0);
  });

  it("passes an attribution-style quote that substring-matches a lens", () => {
    const synthesize =
      'axiology: "Top-level value 시간/비용 최소화 lacks operational backing"';
    const lensContent =
      "Findings: Top-level value 시간/비용 최소화 lacks operational backing in executor selection.";

    const result = auditCitations(synthesize, [lensContent]);
    expect(result.quotes_checked).toBe(1);
    expect(result.attribution_count).toBe(1);
    expect(result.quotes_unmatched).toEqual([]);
    expect(result.quotes_unmatched_meta).toEqual([]);
  });

  it("matches against any lens (disjunction)", () => {
    const synthesize = 'logic: "unique phrase of sufficient length here"';
    const lensA = "not related content at all";
    const lensB = "some prose containing unique phrase of sufficient length here inside it";

    const result = auditCitations(synthesize, [lensA, lensB]);
    expect(result.quotes_unmatched).toEqual([]);
    expect(result.quotes_unmatched_meta).toEqual([]);
  });

  it("reports empty unmatched lists when no quotes present", () => {
    const result = auditCitations("Pure synthesis prose.", ["some lens content"]);
    expect(result.quotes_checked).toBe(0);
    expect(result.quotes_unmatched).toEqual([]);
    expect(result.quotes_unmatched_meta).toEqual([]);
    expect(result.attribution_count).toBe(0);
  });

  it("includes min_quote_length in result for traceability", () => {
    const result = auditCitations("", [], { minQuoteLength: 30 });
    expect(result.min_quote_length).toBe(30);
  });

  it("uses default threshold 20 when options omitted", () => {
    const result = auditCitations("", []);
    expect(result.min_quote_length).toBe(20);
  });

  it("empty lens pool: attribution unmatched → strict, non-attribution → meta", () => {
    const synthesize =
      'logic: "attribution style phrase of sufficient length for threshold"\n' +
      'Separately, "non-attributed taxonomy label phrase here" appears.';
    const result = auditCitations(synthesize, []);
    expect(result.quotes_checked).toBe(2);
    expect(result.attribution_count).toBe(1);
    expect(result.quotes_unmatched).toContain(
      "attribution style phrase of sufficient length for threshold",
    );
    expect(result.quotes_unmatched_meta).toContain(
      "non-attributed taxonomy label phrase here",
    );
  });
});
