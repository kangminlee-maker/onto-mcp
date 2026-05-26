/**
 * Parser for `## Participating Lens Outputs` / `## Runtime Participating Lens Outputs`
 * packet sections.
 *
 * # What this module is
 *
 * Extracts the `- <lensId>: <path>` bullets that synthesize packets use to
 * declare which lens outputs the synthesizer should consume. Returns a list
 * of `{ lensId, path }` objects so downstream consumers (e.g. the citation
 * audit in Phase 3-4 A5) can read each lens output from disk.
 *
 * # Why it exists
 *
 * The packet generator emits `## Participating Lens Outputs` with the expected
 * output paths that synthesize must consume.
 *
 * Bench packets (e.g. `/tmp/onto-benchmark/packets/synthesize.packet.md`) also
 * use this format. The parser accepts both heading variants and tolerates
 * whitespace, backtick-wrapped paths, and comment-style suffixes.
 */

export interface ParticipatingLensPath {
  lensId: string;
  path: string;
}

/**
 * Parse `## [Runtime] Participating Lens Outputs` section and return the
 * `- <lensId>: <path>` bullets as `{ lensId, path }`. Returns an empty array
 * when the section is absent or contains no recognisable bullets (e.g. the
 * `(none for mock test)` placeholder used in unit tests).
 */
export function parseParticipatingLensPaths(
  packetBody: string,
): ParticipatingLensPath[] {
  const section = extractParticipatingLensSection(packetBody);
  if (section === undefined) return [];

  const results: ParticipatingLensPath[] = [];
  // Match `- <lensId>: <path>` bullets. Allow the path to be wrapped in
  // backticks or not, and tolerate trailing whitespace / comment suffixes.
  // The lensId is a conservative ident (alpha + underscore + hyphen + digits).
  const bulletRe = /(?:^|\n)\s*[-*]\s*([A-Za-z][A-Za-z0-9_\-]*)\s*:\s*`?([^`\n]+?)`?\s*(?=\n|$)/g;
  for (const m of section.matchAll(bulletRe)) {
    const lensId = (m[1] ?? "").trim();
    const rawPath = (m[2] ?? "").trim();
    if (lensId.length === 0 || rawPath.length === 0) continue;
    // Skip placeholder rows the tests use, e.g. "(none for mock test)".
    if (rawPath.startsWith("(")) continue;
    results.push({ lensId, path: rawPath });
  }
  return results;
}

function extractParticipatingLensSection(packetBody: string): string | undefined {
  // Match `## Participating Lens Outputs` or `## Runtime Participating Lens Outputs`
  // (case-insensitive) up to the next `## ` or EOF.
  const headingRe =
    /^\s*#{1,6}\s*(?:Runtime\s+)?Participating\s+Lens\s+Outputs\s*$/im;
  const m = headingRe.exec(packetBody);
  if (!m) return undefined;

  const startIdx = (m.index ?? 0) + m[0].length;
  const rest = packetBody.slice(startIdx);
  const nextHeadingRe = /\n\s*#{1,6}\s+\S/;
  const nextMatch = nextHeadingRe.exec(rest);
  const end = nextMatch ? nextMatch.index : rest.length;
  return rest.slice(0, end).trim();
}
