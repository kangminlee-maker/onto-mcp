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
 * The execution coordinator emits `## Runtime Participating Lens Outputs` with
 * the successfully completed lens outputs that synthesize must consume.
 *
 * Bench packets (e.g. `/tmp/onto-benchmark/packets/synthesize.packet.md`) also
 * use this format. The parser accepts both heading variants and tolerates
 * whitespace, backtick-wrapped paths, and comment-style suffixes.
 */

import { stripEmbeddedMaterializedInputSections } from "./packet-boundary-policy.js";

export interface ParticipatingLensPath {
  lensId: string;
  path: string;
}

/**
 * Parse `## [Runtime] Participating Lens Outputs` section and return the
 * `- <lensId>: <path>` bullets as `{ lensId, path }`. Returns an empty array
 * when the section is absent or contains no recognisable bullets (e.g. the
 * parenthesized placeholder used in unit tests).
 */
export function parseParticipatingLensPaths(
  packetBody: string,
): ParticipatingLensPath[] {
  const section = extractParticipatingLensSection(
    stripEmbeddedMaterializedInputSections(packetBody),
  );
  if (section === undefined) return [];

  const results: ParticipatingLensPath[] = [];
  // Match `- <lensId>: <path>` bullets. The lensId is a conservative ident
  // (alpha + underscore + hyphen + digits). Parse line-by-line so a
  // comment-style suffix does not become part of an unbackticked path.
  const bulletRe = /^\s*[-*]\s*([A-Za-z][A-Za-z0-9_\-]*)\s*:\s*(.+?)\s*$/;
  for (const line of section.split("\n")) {
    const m = bulletRe.exec(line);
    if (!m) continue;
    const lensId = (m[1] ?? "").trim();
    const rawPath = normalizeLensPathBulletValue(m[2] ?? "");
    if (lensId.length === 0 || rawPath.length === 0) continue;
    // Skip placeholder rows the tests use, e.g. "(none for fixture)".
    if (rawPath.startsWith("(")) continue;
    results.push({ lensId, path: rawPath });
  }
  return results;
}

function normalizeLensPathBulletValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("`")) {
    const closingBacktickIndex = trimmed.indexOf("`", 1);
    if (closingBacktickIndex >= 0) {
      return trimmed.slice(1, closingBacktickIndex).trim();
    }
    return trimmed.slice(1).trim();
  }
  return trimmed
    .replace(/\s+#.*$/, "")
    .replace(/\s+\/\/.*$/, "")
    .trim();
}

function extractParticipatingLensSection(packetBody: string): string | undefined {
  return (
    extractSectionByHeading(
      packetBody,
      /^\s*#{1,6}\s*Runtime\s+Participating\s+Lens\s+Outputs\s*$/im,
    ) ??
    extractSectionByHeading(
      packetBody,
      /^\s*#{1,6}\s*Participating\s+Lens\s+Outputs\s*$/im,
    )
  );
}

function extractSectionByHeading(
  packetBody: string,
  headingRe: RegExp,
): string | undefined {
  const m = headingRe.exec(packetBody);
  if (!m) return undefined;

  const startIdx = (m.index ?? 0) + m[0].length;
  const rest = packetBody.slice(startIdx);
  const nextHeadingRe = /\n\s*#{1,6}\s+\S/;
  const nextMatch = nextHeadingRe.exec(rest);
  const end = nextMatch ? nextMatch.index : rest.length;
  return rest.slice(0, end).trim();
}
