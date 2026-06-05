/**
 * Citation audit — Phase 3-4 (A5), fabrication post-flight detection.
 *
 * # What this module is
 *
 * Given a synthesize output and the raw text of participating lens outputs,
 * extracts "significant quoted strings" from the synthesize output and checks
 * whether each one appears as a substring of AT LEAST ONE lens output. Quotes
 * that match nothing AND carry an **attribution pattern** (`axiology: "..."`,
 * `Axiology said "..."`, etc.) are flagged as potential fabrications. Quotes
 * without an attribution pattern are surfaced separately as advisory
 * (`quotes_unmatched_meta`) — they may be taxonomy labels (`"conditional
 * consensus"`), concept names, or paraphrased references rather than
 * fabrications.
 *
 * # Why it exists
 *
 * Phase 3-4 A3 benchmark (2026-04-17) demonstrated that inline mode + path-only
 * packet caused Qwen3-30B-A3B to emit a quoted axiology finding
 * (`Axiology said "Naming alignment between value, activity, and concept is
 * not yet resolved"`) that grep returned 0 matches for across all three lens
 * outputs. The model hallucinated a citation to support its deliberation.
 * The same run also produced 3 quoted taxonomy labels that substring-matched
 * no lens but were not fabrications. Without attribution classification those
 * three labels produced noise warnings and diluted operator attention to the
 * real fabrication.
 *
 * A4 (PR #74) blocks the known precondition (`Tools: required` + inline) at
 * executor entry; the audit here is a **defense-in-depth** layer that catches
 * fabrications from:
 *   - packets that don't declare `Tools: required`
 *   - partially-inlined packets where some lens content is embedded and some
 *     is referenced by path
 *   - native-mode runs where the model read a file but still made up a quote
 *   - future prompt regressions that could reintroduce fabrication
 *
 * # What it does NOT do
 *
 * - It does not block execution. The audit is **warning-only** per the A5
 *   design: an unmatched quote is a suspicion, not a proof.
 * - It does not parse semantic meaning. Only literal substring matching.
 * - It does not audit LENS outputs. Lens outputs don't cite each other; they
 *   cite the review target.
 *
 * # Grammar
 *
 * Quotes are extracted from:
 *   - `"..."` — straight double-quoted strings
 *   - `` `...` `` — backtick-quoted (markdown code spans)
 *
 * Strings shorter than `minQuoteLength` (default 20) are skipped as noise.
 *
 * # Attribution classification
 *
 * A quote is attribution-style when any of the following patterns appears
 * within the preceding `ATTRIBUTION_CONTEXT_WINDOW` characters (up to the
 * previous sentence boundary):
 *
 *   - `<lens>:` / `**<lens>**:` / `*<lens>*:` — colon-style attribution
 *   - `per <lens>` / `from <lens>` / `according to <lens>`
 *   - `<Lens> said|reports|notes|claims|states|asserts|finds`
 *   - `<Lens> lens said|...`
 *   - `cited from <lens>` / `cited_lens_output <lens>`
 *
 * The `<lens>` token is any of the nine review lenses or `synthesize`.
 * Case-insensitive.
 */

export const DEFAULT_MIN_QUOTE_LENGTH = 20;
const ATTRIBUTION_CONTEXT_WINDOW = 120;

const LENS_IDS = [
  "logic",
  "structure",
  "dependency",
  "semantics",
  "pragmatics",
  "evolution",
  "coverage",
  "conciseness",
  "axiology",
  "synthesize",
] as const;

const LENS_ALT = LENS_IDS.join("|");

const ATTRIBUTION_REGEXES: readonly RegExp[] = [
  // `axiology:` / `**axiology**:` / `*axiology*:`
  // The markdown-emphasis variant uses its own asterisk anchors, so `\b` only
  // guards the bare form. Without the split alternation we'd fail because
  // `\b` does not exist between start-of-slice and `*` (both non-word).
  new RegExp(`(?:\\*{1,2}(${LENS_ALT})\\*{1,2}|\\b(${LENS_ALT}))\\s*:\\s*$`, "i"),
  // `per axiology` / `from axiology` / `according to axiology`
  new RegExp(`\\b(?:per|from|according\\s+to)\\s+(${LENS_ALT})\\b[^"\`]*$`, "i"),
  // `Axiology said` / `logic lens reports` / `semantics claims`
  new RegExp(
    `\\b(${LENS_ALT})(?:\\s+lens)?\\s+(?:said|reports?|notes?|claims?|states?|asserts?|finds?)\\b[^"\`]*$`,
    "i",
  ),
  // `cited from logic` / `cited_lens_output axiology`
  new RegExp(`\\b(?:cited\\s+from|cited_lens_output)\\s+(${LENS_ALT})\\b[^"\`]*$`, "i"),
];

export interface CitationAuditResult {
  /**
   * `completed` means the audit ran against at least one readable lens output.
   * `skipped` means the audit was applicable but could not build a trustworthy
   * lens pool or boundary authority; consumers should surface the reason.
   */
  status: "completed" | "skipped";
  /**
   * `complete` means every participating lens ref was included in the audit
   * pool, `partial` means at least one ref was omitted, and `none` is used with
   * skipped audits.
   */
  coverage_status: "complete" | "partial" | "none";
  /** Total number of significant quotes extracted from the synthesize output. */
  quotes_checked: number;
  /**
   * Attribution-style quotes that did NOT substring-match any lens content.
   * This is the fabrication WARNING list — a non-empty array means the model
   * made an explicit citation claim (`X said "..."`) that cannot be grounded.
   * Callers MUST NOT fail the executor on audit alone, but SHOULD surface
   * this to operators.
   */
  quotes_unmatched: string[];
  /**
   * Non-attribution quotes that did NOT substring-match any lens content.
   * Advisory only — these may be taxonomy labels (`"conditional consensus"`),
   * paraphrased concept references, or file-path-like strings. They are
   * excluded from the primary warning to keep operator signal tight.
   */
  quotes_unmatched_meta: string[];
  /** Count of extracted quotes classified as attribution-style. */
  attribution_count: number;
  /** Configured threshold used for this audit run. */
  min_quote_length: number;
  /** Human-readable reason when `status=skipped`. */
  skip_reason?: string;
  /** Participating lens refs that prevented a complete audit. */
  failed_refs?: string[];
}

export interface CitationAuditOptions {
  /** Minimum quoted string length to audit. Default 20. */
  minQuoteLength?: number;
}

export interface ExtractedQuote {
  /** The quoted text body. */
  text: string;
  /** Offset of the opening delimiter in the source text. */
  offset: number;
  /** True if an attribution pattern precedes this quote. */
  is_attribution: boolean;
  /** Attributed lens id (lowercase) when detected. */
  attributed_lens?: string;
}

/**
 * Return the substring of `text` immediately preceding `offset`, cut back to
 * the previous sentence boundary (period, newline, start of text) and capped
 * at `ATTRIBUTION_CONTEXT_WINDOW` characters. This is the "same sentence"
 * window the attribution classifier examines.
 */
function precedingContext(text: string, offset: number): string {
  const start = Math.max(0, offset - ATTRIBUTION_CONTEXT_WINDOW);
  let slice = text.slice(start, offset);
  // Cut back to the last sentence boundary within the window so attribution
  // claims in the preceding sentence don't spill into this one's classification.
  const boundary = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf("\n"),
    slice.lastIndexOf("?"),
    slice.lastIndexOf("!"),
  );
  if (boundary >= 0) slice = slice.slice(boundary + 1);
  return slice;
}

function classifyAttribution(
  precedingText: string,
): { is_attribution: boolean; attributed_lens?: string } {
  for (const re of ATTRIBUTION_REGEXES) {
    const m = precedingText.match(re);
    if (m) {
      const lens = m.slice(1).find((g): g is string => typeof g === "string" && g.length > 0);
      return lens
        ? { is_attribution: true, attributed_lens: lens.toLowerCase() }
        : { is_attribution: true };
    }
  }
  return { is_attribution: false };
}

/**
 * Extract significant quoted strings from free-form markdown text, keeping
 * per-quote attribution classification.
 *
 * De-duplicates identical quote *texts*. When the same text appears multiple
 * times with different attribution, the first occurrence's classification is
 * kept — matching the "any attribution → warning-worthy" spirit of the audit.
 * (Detailed per-occurrence introspection is out of scope here.)
 */
export function extractSignificantQuotes(
  text: string,
  options?: CitationAuditOptions,
): ExtractedQuote[] {
  const min = options?.minQuoteLength ?? DEFAULT_MIN_QUOTE_LENGTH;
  const out: ExtractedQuote[] = [];
  const seen = new Set<string>();

  const doubleRe = /"([^"\n]+(?:\n[^"\n]+)?)"/g;
  for (const m of text.matchAll(doubleRe)) {
    const body = (m[1] ?? "").trim();
    if (body.length < min) continue;
    if (seen.has(body)) continue;
    seen.add(body);
    const offset = m.index ?? 0;
    const preceding = precedingContext(text, offset);
    const { is_attribution, attributed_lens } = classifyAttribution(preceding);
    out.push({
      text: body,
      offset,
      is_attribution,
      ...(attributed_lens !== undefined ? { attributed_lens } : {}),
    });
  }

  const backtickRe = /`([^`\n]+)`/g;
  for (const m of text.matchAll(backtickRe)) {
    const body = (m[1] ?? "").trim();
    if (body.length < min) continue;
    if (seen.has(body)) continue;
    seen.add(body);
    const offset = m.index ?? 0;
    const preceding = precedingContext(text, offset);
    const { is_attribution, attributed_lens } = classifyAttribution(preceding);
    out.push({
      text: body,
      offset,
      is_attribution,
      ...(attributed_lens !== undefined ? { attributed_lens } : {}),
    });
  }

  out.sort((a, b) => a.offset - b.offset);
  return out;
}

/**
 * Run citation audit: extract significant quotes from synthesize output,
 * classify by attribution, then substring-match against each lens content.
 */
export function auditCitations(
  synthesizeText: string,
  lensContents: readonly string[],
  options?: CitationAuditOptions,
): CitationAuditResult {
  const min = options?.minQuoteLength ?? DEFAULT_MIN_QUOTE_LENGTH;
  const quotes = extractSignificantQuotes(synthesizeText, { minQuoteLength: min });
  const unmatched_strict: string[] = [];
  const unmatched_meta: string[] = [];
  let attribution_count = 0;
  for (const q of quotes) {
    if (q.is_attribution) attribution_count += 1;
    const matched = lensContents.some((content) => content.includes(q.text));
    if (matched) continue;
    if (q.is_attribution) unmatched_strict.push(q.text);
    else unmatched_meta.push(q.text);
  }
  return {
    status: "completed",
    coverage_status: "complete",
    quotes_checked: quotes.length,
    quotes_unmatched: unmatched_strict,
    quotes_unmatched_meta: unmatched_meta,
    attribution_count,
    min_quote_length: min,
  };
}
