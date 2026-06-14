/**
 * Canonical `## `-level markdown section semantics for the reconstruct final
 * output (optimization design §6 L1 — generate-and-validate alignment).
 *
 * Section presence is decided by an *exact trimmed line match* against the full
 * heading line (e.g. `## Claim Projection`). The runtime that inserts the
 * canonical provenance sections and the validator that asserts they are present
 * MUST use the same rule — otherwise a heading the LLM author happens to emit
 * that is a *superstring* of a canonical heading (`### Claim Projection`,
 * `## Claim Projection Notes`) would satisfy a looser `includes()` guard yet
 * fail the exact-match validator, masking the canonical section and failing the
 * run. Owning both operations here keeps the two rules from drifting.
 */

/**
 * Locates the `[start, end)` line range of the section opened by `headingLine`
 * (a full `## ...` line). The range runs from the heading line up to — but not
 * including — the next `## `-level heading (or end of document). Returns null
 * when no line trims to exactly `headingLine`.
 */
function findSectionRange(
  lines: string[],
  headingLine: string,
): { start: number; end: number } | null {
  const start = lines.findIndex((line) => line.trim() === headingLine);
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]?.trim() ?? "")) {
      end = index;
      break;
    }
  }
  return { start, end };
}

/**
 * Idempotently inserts or replaces a `## `-level section. The canonical heading
 * is the first line of `content` (which must be a `## ...` line) — there is no
 * separate heading parameter, so the heading the helper searches for can never
 * drift from the heading the content actually carries. When an exact heading
 * line already exists its section content is replaced in place; otherwise
 * `content` is appended at the end. Presence is judged by exact trimmed line
 * match, so a superstring heading never blocks the canonical section from being
 * inserted — guaranteeing {@link markdownSectionText} (and the provenance
 * validator built on it) can find it. Section discoverability is therefore a
 * helper-owned invariant: malformed content fails clearly rather than silently
 * producing an undiscoverable section.
 */
export function upsertMarkdownSection(
  markdown: string,
  content: string,
): string {
  const headingLine = content.split(/\r?\n/)[0]?.trim() ?? "";
  if (!/^##\s+/.test(headingLine)) {
    throw new Error(
      `upsertMarkdownSection: content must begin with a "## " heading line, got: ${
        JSON.stringify(headingLine)
      }`,
    );
  }
  const lines = markdown.split(/\r?\n/);
  const range = findSectionRange(lines, headingLine);
  if (!range) {
    return [markdown.trimEnd(), "", content].join("\n");
  }
  return [
    ...lines.slice(0, range.start),
    content.trimEnd(),
    ...lines.slice(range.end),
  ].join("\n");
}

/**
 * Returns the text of the `## ${heading}` section (heading line through the line
 * before the next `## ` heading), or null when no exact heading line exists.
 * The provenance validator consumes this to assert a bound section is present.
 */
export function markdownSectionText(
  markdown: string,
  heading: string,
): string | null {
  const lines = markdown.split(/\r?\n/);
  const range = findSectionRange(lines, `## ${heading}`);
  if (!range) return null;
  return lines.slice(range.start, range.end).join("\n");
}
