/**
 * Strip a single outer wrapping code fence from an LLM response.
 *
 * # Why this exists
 *
 * Some open-weight models (observed on Qwen3-30B-A3B in Phase 3-4 A2 bench,
 * 2026-04-17) ignore the system prompt instruction "Do not wrap the answer in
 * code fences" and wrap the entire lens / synthesize output in a
 * triple-backtick block with an optional language tag, e.g.
 *
 *     ```yaml
 *     ---
 *     deliberation_status: performed
 *     ---
 *     ### Consensus
 *     ...
 *     ```
 *
 * When the executor writes this raw text to the canonical output path,
 * downstream YAML-frontmatter parsers and section-heading scanners break
 * because the file begins with a literal ``` line, not a YAML delimiter or a
 * markdown heading.
 *
 * # What it does
 *
 * Removes one outermost wrapping fence pair if and only if BOTH:
 *   1. The trimmed text starts with a line matching ```[lang-tag]?
 *   2. The trimmed text ends with a line matching ```
 *
 * Inner code blocks inside legitimate markdown (e.g. a code citation within a
 * lens finding) are NOT affected because their opening and closing fences are
 * not at the string boundaries.
 *
 * # What it does NOT do
 *
 * - It does not strip multiple stacked wrappers; only the outermost pair is
 *   removed in a single pass. Stacking is not observed in practice and
 *   unwrapping aggressively risks deleting content the model intended as code.
 * - It does not repair partial fences (open without close, or vice versa).
 *   A partial fence suggests the model truncated; leaving it visible preserves
 *   the diagnostic signal.
 */

const OPENING_FENCE_RE = /^```[a-zA-Z0-9_+-]*[ \t]*(?:\r?\n|$)/;
const CLOSING_FENCE_RE = /(?:\r?\n|^)[ \t]*```[ \t]*$/;

export function stripWrappingCodeFence(text: string): string {
  const trimmed = text.trim();
  const openMatch = trimmed.match(OPENING_FENCE_RE);
  if (!openMatch) return trimmed;
  const afterOpen = trimmed.slice(openMatch[0].length);
  const closeMatch = afterOpen.match(CLOSING_FENCE_RE);
  if (!closeMatch || closeMatch.index === undefined) return trimmed;
  const inner = afterOpen.slice(0, closeMatch.index);
  return inner.trim();
}

// A YAML document/structural start at column 0: the `---` document marker, a
// top-level mapping key (a single token with NO spaces, so prose ending in a
// colon like "Writing the YAML now:" does NOT match), or an opening yaml fence.
const YAML_STRUCTURAL_START_RE =
  /^(?:---[ \t]*$|[A-Za-z0-9_-]+:(?:[ \t]|$)|```(?:ya?ml)?[ \t]*$)/;

/**
 * Strip a leading conversational narration that some models (observed on
 * Claude Opus 4.8 as the issue-artifact worker, 2026-06-04) emit before the
 * required YAML, e.g.
 *
 *     I have sufficient grounding from the finding-ledger and lens outputs.
 *     Writing the YAML now:
 *
 *     relations:
 *       - relation_id: r1
 *
 * which breaks strict YAML parsing of the artifact. Only intended for
 * YAML-output units (issue artifacts): it removes everything before the first
 * column-0 YAML-structural line, then re-strips a wrapping fence the narration
 * may have preceded. If the text already begins structurally (no narration), it
 * is returned unchanged so clean output is never altered. NOT safe for markdown
 * units (whose body may legitimately contain a column-0 `key:` line), so the
 * caller must gate this on the unit kind.
 */
export function stripLeadingNarrationBeforeYaml(text: string): string {
  const lines = text.split(/\r?\n/);
  const startIdx = lines.findIndex(
    (line) => line.trim() !== "" && YAML_STRUCTURAL_START_RE.test(line),
  );
  if (startIdx <= 0) return text.trim();
  return stripWrappingCodeFence(lines.slice(startIdx).join("\n").trim());
}
